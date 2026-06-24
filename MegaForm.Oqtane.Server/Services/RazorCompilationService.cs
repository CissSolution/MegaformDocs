// MegaForm Razor Widget — Roslyn JIT compilation service
// ──────────────────────────────────────────────────────────────────────
// Customers can author their own .razor templates in the Razor Studio
// editor. This service takes the source string, runs the Razor source
// generator (via Microsoft.AspNetCore.Razor.Language) → emits C#, then
// compiles that C# with Roslyn → loads the resulting assembly →
// reflects out [RazorTemplate]-decorated component Types and hands
// them to the registry so subsequent /Render calls can pick them up.
//
// Phase 2 implementation is intentionally minimal:
//   - In-memory cache keyed by sha-256(source) → Type
//   - LRU eviction at 100 entries
//   - Uses RazorProjectEngine + CSharpCompilation
//   - No analyzer / sandboxing yet (Phase 3 ships that)
//
// Compile errors are surfaced back to the Studio editor as a structured
// list ({line, col, message}) — the dispatcher avoids registering a
// type that fails compilation, so the live render falls back to the
// built-in template until the customer fixes the source.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Razor.Language;
using Microsoft.AspNetCore.Razor.Language.Extensions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace MegaForm.Oqtane.Server.Services
{
    public class RazorCompileError
    {
        public int    Line     { get; set; }
        public int    Column   { get; set; }
        public string Severity { get; set; }
        public string Code     { get; set; }
        public string Message  { get; set; }
    }

    public class RazorCompileResult
    {
        public bool    Success      { get; set; }
        public string  SourceHash   { get; set; }
        public string  TemplateName { get; set; }
        public List<RazorCompileError> Errors { get; set; } = new();
    }

    public class RazorCompilationService
    {
        private readonly RazorWidgetRegistry _registry;
        private readonly ConcurrentDictionary<string, RazorWidgetMetadata> _cache = new();
        private readonly object _lru = new object();
        private readonly LinkedList<string> _lruKeys = new();
        private const int MaxCache = 100;

        public RazorCompilationService(RazorWidgetRegistry registry)
        {
            _registry = registry;
        }

        public static string HashSource(string src)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(src ?? ""));
            return Convert.ToHexString(bytes).Substring(0, 16);
        }

        /// <summary>
        /// Compile a .razor source string into an in-memory Type and
        /// register it on the live registry so subsequent /Render calls
        /// resolve to the customer's override. Returns errors if any.
        /// </summary>
        public RazorCompileResult Compile(string templateName, string razorSource)
        {
            var result = new RazorCompileResult { TemplateName = templateName };
            if (string.IsNullOrWhiteSpace(razorSource))
            {
                result.Errors.Add(new RazorCompileError { Severity = "error", Message = "empty source" });
                return result;
            }

            var hash = HashSource(razorSource);
            result.SourceHash = hash;
            if (_cache.TryGetValue(hash, out var cached))
            {
                _registry.Override(cached);
                result.Success      = true;
                result.TemplateName = cached.Name;
                return result;
            }

            try
            {
                // ── 1. Razor → C# ───────────────────────────────────
                var rootDir  = Path.GetTempPath();
                var fileSys  = RazorProjectFileSystem.Create(rootDir);
                var engine   = RazorProjectEngine.Create(RazorConfiguration.Default, fileSys, b =>
                {
                    InheritsDirective.Register(b);
                    SectionDirective.Register(b);
                    b.SetRootNamespace("MegaForm.Razor.Customer");
                });
                var fileName = templateName + ".razor";
                var item     = new InMemoryRazorProjectItem(fileName, razorSource);
                var codeDoc  = engine.Process(item);
                var csharp   = codeDoc.GetCSharpDocument();
                if (csharp.Diagnostics.Count > 0)
                {
                    foreach (var d in csharp.Diagnostics)
                    {
                        result.Errors.Add(new RazorCompileError
                        {
                            Line     = d.Span.LineIndex + 1,
                            Column   = d.Span.CharacterIndex + 1,
                            Severity = d.Severity.ToString().ToLowerInvariant(),
                            Code     = d.Id,
                            Message  = d.GetMessage(),
                        });
                    }
                    if (result.Errors.Any(e => e.Severity == "error")) return result;
                }

                // ── 2. C# → assembly ────────────────────────────────
                var tree = CSharpSyntaxTree.ParseText(csharp.GeneratedCode);
                // Pull EVERY .dll referenced by the host process (TPA list):
                // includes the .NET 9 runtime assemblies + every MegaForm /
                // Oqtane / Blazor assembly the running process loaded.
                // AppDomain.GetAssemblies() alone misses runtime refs the
                // Razor SDK needs (System.Linq, Microsoft.AspNetCore.*).
                var refs = new List<MetadataReference>();
                var tpa = AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string;
                if (!string.IsNullOrEmpty(tpa))
                {
                    foreach (var path in tpa.Split(Path.PathSeparator))
                    {
                        if (!string.IsNullOrEmpty(path) && File.Exists(path))
                        {
                            try { refs.Add(MetadataReference.CreateFromFile(path)); } catch { /* skip */ }
                        }
                    }
                }
                // Also pull loaded assemblies — covers the MegaForm DLLs
                // that aren't on the SDK trusted list but ARE running.
                // Oqtane uses custom AssemblyLoadContexts, so we walk all
                // contexts, not just AppDomain.
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var path in refs.Select(r => (r as PortableExecutableReference)?.FilePath).Where(p => p != null))
                    seen.Add(path);

                void AddAssembly(Assembly asmLoaded)
                {
                    if (asmLoaded == null || asmLoaded.IsDynamic || string.IsNullOrEmpty(asmLoaded.Location)) return;
                    if (!seen.Add(asmLoaded.Location)) return;
                    try { refs.Add(MetadataReference.CreateFromFile(asmLoaded.Location)); } catch { /* skip */ }
                }

                foreach (var asmLoaded in AppDomain.CurrentDomain.GetAssemblies()) AddAssembly(asmLoaded);
                foreach (var ctx in System.Runtime.Loader.AssemblyLoadContext.All)
                {
                    try { foreach (var a in ctx.Assemblies) AddAssembly(a); } catch { /* skip */ }
                }
                // Belt-and-braces: explicitly add the running types' assemblies.
                AddAssembly(typeof(RazorCompilationService).Assembly);
                AddAssembly(typeof(IMfFormContext).Assembly);
                AddAssembly(typeof(Microsoft.AspNetCore.Components.IComponent).Assembly);
                AddAssembly(typeof(Microsoft.AspNetCore.Components.ParameterAttribute).Assembly);

                // Fallback: pull every *.dll out of the app's base directory
                // — Oqtane plugin DLLs live there and may not appear in any
                // already-walked load context yet.
                try
                {
                    foreach (var path in Directory.EnumerateFiles(AppContext.BaseDirectory, "*.dll", SearchOption.TopDirectoryOnly))
                    {
                        if (seen.Contains(path)) continue;
                        if (!File.Exists(path)) continue;
                        try { refs.Add(MetadataReference.CreateFromFile(path)); seen.Add(path); } catch { /* skip */ }
                    }
                }
                catch { /* skip if BaseDirectory unreadable */ }
                var compilation = CSharpCompilation.Create(
                    "MegaForm.Razor.Customer." + hash,
                    new[] { tree },
                    refs,
                    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
                using var ms = new MemoryStream();
                var emit = compilation.Emit(ms);
                if (!emit.Success)
                {
                    // [v20260531-RazorCS1701] CS1701 = "Assuming assembly
                    // reference matches identity" — benign warning for the
                    // Microsoft.AspNetCore.Components 9.0/10.0 version skew
                    // between our compiled DLL and the TPA reference list.
                    // It pollutes the user-facing error UI; suppress it.
                    foreach (var d in emit.Diagnostics.Where(x => x.Severity >= DiagnosticSeverity.Warning && x.Id != "CS1701"))
                    {
                        var pos = d.Location.GetLineSpan().StartLinePosition;
                        result.Errors.Add(new RazorCompileError
                        {
                            Line     = pos.Line + 1,
                            Column   = pos.Character + 1,
                            Severity = d.Severity.ToString().ToLowerInvariant(),
                            Code     = d.Id,
                            Message  = d.GetMessage(),
                        });
                    }
                    if (result.Errors.Any(e => e.Severity == "error")) return result;
                }
                ms.Seek(0, SeekOrigin.Begin);
                var asm = Assembly.Load(ms.ToArray());

                // ── 3. Reflect [RazorTemplate] type out of the assembly ──
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }
                var type = types.FirstOrDefault(t =>
                    t.GetCustomAttribute<RazorTemplateAttribute>() != null);
                if (type == null)
                {
                    // Diagnostic: include the type names + their attribute
                    // names so we can see whether the [RazorTemplate(...)]
                    // directive actually made it into the compiled output.
                    var diag = string.Join("; ", types.Select(t => t.Name + "<" +
                        string.Join(",", t.GetCustomAttributes(false).Select(a => a.GetType().Name)) + ">"));
                    result.Errors.Add(new RazorCompileError
                    {
                        Severity = "error",
                        Message  = "compiled OK but no [RazorTemplate(...)] attribute found on any type. Types in compiled assembly: " + diag,
                    });
                    return result;
                }
                var attr = type.GetCustomAttribute<RazorTemplateAttribute>();
                var meta = new RazorWidgetMetadata
                {
                    Name                = attr.Name,
                    Category            = attr.Category,
                    Description         = attr.Description,
                    EmitsValue          = attr.EmitsValue,
                    ValueShape          = attr.ValueShape,
                    SupportsSql         = attr.SupportsSql,
                    RequiresInteractive = attr.RequiresInteractive,
                    ComponentType       = type,
                    Parameters          = RazorWidgetRegistry.ExtractParametersPublic(type),
                };

                _cache[hash] = meta;
                EvictIfNeeded(hash);
                _registry.Override(meta);
                result.Success      = true;
                // Pull canonical name from the [RazorTemplate(...)] attr so
                // the caller can look it back up in the registry. The
                // `templateName` parameter is just a wrapping hint and may
                // not match the @attribute name in the source.
                result.TemplateName = attr.Name;
                return result;
            }
            catch (Exception ex)
            {
                result.Errors.Add(new RazorCompileError { Severity = "error", Message = ex.Message });
                return result;
            }
        }

        private void EvictIfNeeded(string newKey)
        {
            lock (_lru)
            {
                _lruKeys.AddLast(newKey);
                if (_lruKeys.Count > MaxCache && _lruKeys.First != null)
                {
                    var k = _lruKeys.First.Value;
                    _lruKeys.RemoveFirst();
                    _cache.TryRemove(k, out _);
                }
            }
        }

        // ── In-memory razor project item used to feed the engine ────────
        // FileKind = "component" is REQUIRED — otherwise the Razor SDK
        // treats the file as a legacy MVC view and refuses to parse
        // `@attribute [RazorTemplate(...)]` (the attribute directive
        // ships as part of the Components support, not the base Razor
        // SDK). Without this the customer attribute is silently dropped
        // and reflection later finds no [RazorTemplate] on the compiled
        // type → 404 "no attribute found" at render.
        private sealed class InMemoryRazorProjectItem : RazorProjectItem
        {
            private readonly string _source;
            private readonly string _filePath;
            public InMemoryRazorProjectItem(string fileName, string source)
            {
                _filePath = "/" + fileName;
                _source = source;
            }
            public override string BasePath     => "/";
            public override string FilePath     => _filePath;
            public override string PhysicalPath => null;
            public override bool   Exists       => true;
            public override string FileKind     => "component";   // FileKinds.Component
            public override Stream Read()
                => new MemoryStream(Encoding.UTF8.GetBytes(_source));
        }
    }
}
