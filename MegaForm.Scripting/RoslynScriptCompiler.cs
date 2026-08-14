/*
 * MegaForm.Scripting/RoslynScriptCompiler.cs
 *
 * [AfterSubmitScript v20260813-01] IMegaFormScriptCompiler on Roslyn.
 *
 * Order of operations, and why it is this order:
 *   1. wrap    — ScriptSourceBuilder puts the author's statements inside a class, with a
 *                #line directive so every diagnostic below reports the author's own lines.
 *   2. parse   — syntax errors come back here, before anything expensive.
 *   3. bind    — a CSharpCompilation with the working reference set.
 *   4. POLICY  — ScriptSymbolPolicy walks the BOUND tree. This is the security gate, and
 *                it runs BEFORE Emit: a script that fails it never becomes an assembly,
 *                so there is nothing to accidentally load later.
 *   5. emit    — to memory, never to disk. (§11's third note: CSharpCodeProvider on DNN
 *                writes temp files and shells out to csc.exe even when asked for
 *                in-memory. Roslyn on net472 does neither, which is why both platforms
 *                use this one path.)
 *   6. load    — collectible AssemblyLoadContext on .NET Core; Assembly.Load(byte[]) on
 *                .NET Framework, which has no collectible option. See CompiledScript.
 */

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Scripting;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;

namespace MegaForm.Scripting
{
    public sealed class RoslynScriptCompiler : IMegaFormScriptCompiler
    {
        public const string Badge = "RoslynScriptCompiler v20260813-01";

        private static readonly object ReferenceLock = new object();
        private static List<MetadataReference> _references;

        public ScriptCompileResult Compile(string source, string scriptId)
        {
            var result = new ScriptCompileResult();
            var hash = ComputeHash(source ?? string.Empty);
            result.Hash = hash;

            if (string.IsNullOrWhiteSpace(source))
            {
                AddError(result, 1, 1, "MF0002", "Script is empty.");
                return result;
            }

            var typeName = ScriptSourceBuilder.TypeNameFromHash(hash);
            var unit = ScriptSourceBuilder.Build(source, typeName);

            var parseOptions = new CSharpParseOptions(LanguageVersion.CSharp7_3);
            var tree = CSharpSyntaxTree.ParseText(unit, parseOptions, path: ScriptSourceBuilder.VirtualFileName);

            var compilation = CSharpCompilation.Create(
                assemblyName: "MegaForm.Script." + hash.Substring(0, Math.Min(16, hash.Length)),
                syntaxTrees: new[] { tree },
                references: GetReferences(),
                options: new CSharpCompilationOptions(
                    OutputKind.DynamicallyLinkedLibrary,
                    optimizationLevel: OptimizationLevel.Release,
                    allowUnsafe: false,
                    // A script that only produces warnings still runs; warnings are surfaced to
                    // the editor so the author sees them, but they do not block a save.
                    warningLevel: 4));

            var model = compilation.GetSemanticModel(tree);

            // ── 3a. compiler diagnostics ─────────────────────────────────────────
            var bindDiagnostics = compilation.GetDiagnostics();
            foreach (var d in bindDiagnostics)
            {
                if (d.Severity == DiagnosticSeverity.Hidden) continue;
                AddDiagnostic(result, d);
            }
            if (result.HasErrors) return result;

            // ── 4. policy, on bound symbols, before Emit ─────────────────────────
            var violations = ScriptSymbolPolicy.Inspect(tree, model);
            if (violations.Count > 0)
            {
                foreach (var v in violations)
                    AddError(result, v.Line, v.Column, ScriptSymbolPolicy.DiagnosticCode, v.Message);
                return result;
            }

            // ── 5. emit ──────────────────────────────────────────────────────────
            byte[] peBytes;
            using (var ms = new MemoryStream())
            {
                EmitResult emit = compilation.Emit(ms);
                if (!emit.Success)
                {
                    foreach (var d in emit.Diagnostics)
                    {
                        if (d.Severity != DiagnosticSeverity.Error) continue;
                        AddDiagnostic(result, d);
                    }
                    if (!result.HasErrors)
                        AddError(result, 1, 1, "MF0004", "The script could not be emitted.");
                    return result;
                }
                peBytes = ms.ToArray();
            }

            // ── 6. load + instantiate ────────────────────────────────────────────
            try
            {
                result.Script = CompiledScript.Load(peBytes, hash);
                result.Success = true;
                return result;
            }
            catch (Exception ex)
            {
                AddError(result, 1, 1, "MF0005",
                    "The script compiled but could not be loaded: " + ex.Message);
                return result;
            }
        }

        // ─── references ───────────────────────────────────────────────────────────

        /// <summary>
        /// The working reference set. NOT a security boundary — see the header of
        /// ScriptSymbolPolicy for why a reference list cannot be one. This only decides what
        /// binds; what is permitted is decided after binding.
        /// </summary>
        private static List<MetadataReference> GetReferences()
        {
            lock (ReferenceLock)
            {
                if (_references != null) return _references;
                var refs = new List<MetadataReference>();
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                Action<string> addPath = path =>
                {
                    if (string.IsNullOrEmpty(path)) return;
                    if (!seen.Add(path)) return;
                    try { refs.Add(MetadataReference.CreateFromFile(path)); }
                    catch { /* a framework file we cannot read is not fatal — binding will say so */ }
                };

#if MEGAFORM_NETFX
                // .NET Framework: take the assemblies already loaded for the types we know the
                // script surface needs. mscorlib arrives whether we ask for it or not.
                addPath(typeof(object).Assembly.Location);                    // mscorlib
                addPath(typeof(Uri).Assembly.Location);                       // System
                addPath(typeof(Enumerable).Assembly.Location);                // System.Core
                addPath(typeof(SubmissionScriptContext).Assembly.Location);   // MegaForm.Core
                addPath(typeof(Newtonsoft.Json.JsonConvert).Assembly.Location);

                // [OpenScripting 2026-08-14] Everything the host has already loaded.
                //
                // A script is now ordinary C# written by the server's owner, so it must be able to
                // name what a module in the same site can name: DotNetNuke.Entities.Users for
                // UserController, DotNetNuke.Services.Mail for Mail.SendMail, System.Data for
                // ADO.NET, System.Net.Http, and whatever else is in bin. Before this, the reference
                // set was six assemblies, so `using DotNetNuke.…` did not fail on policy — it
                // failed to BIND, with a "type or namespace could not be found" that read like a
                // typo rather than a deliberate closure.
                //
                // This is not the security boundary and never was — see the header of
                // ScriptSymbolPolicy for why a reference list cannot be one. It decides what binds.
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    try { if (!asm.IsDynamic) addPath(asm.Location); } catch { }
                }
#else
                // .NET Core / .NET 5+: the trusted-platform-assemblies list is the reference
                // assemblies of the running framework. Taking it whole is correct here precisely
                // because the deny-list, not the reference list, is what constrains the script.
                var tpa = AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string;
                if (!string.IsNullOrEmpty(tpa))
                {
                    foreach (var path in tpa.Split(Path.PathSeparator))
                    {
                        if (path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
                            addPath(path);
                    }
                }
                addPath(typeof(SubmissionScriptContext).Assembly.Location);
                addPath(typeof(Newtonsoft.Json.JsonConvert).Assembly.Location);
#endif
                _references = refs;
                return _references;
            }
        }

        // ─── helpers ──────────────────────────────────────────────────────────────

        internal static string ComputeHash(string source)
        {
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(source ?? string.Empty));
                var sb = new StringBuilder(bytes.Length * 2);
                for (int i = 0; i < bytes.Length; i++) sb.Append(bytes[i].ToString("x2"));
                return sb.ToString();
            }
        }

        private static void AddDiagnostic(ScriptCompileResult result, Diagnostic d)
        {
            // GetMappedLineSpan honours the #line directive, so this is the author's line.
            var span = d.Location.GetMappedLineSpan();
            result.Diagnostics.Add(new ScriptDiagnostic
            {
                Line = span.IsValid ? span.StartLinePosition.Line + 1 : 1,
                Column = span.IsValid ? span.StartLinePosition.Character + 1 : 1,
                Severity = d.Severity == DiagnosticSeverity.Error ? "error"
                         : d.Severity == DiagnosticSeverity.Warning ? "warning" : "info",
                Code = d.Id,
                Message = d.GetMessage()
            });
        }

        private static void AddError(ScriptCompileResult result, int line, int col, string code, string message)
        {
            result.Diagnostics.Add(new ScriptDiagnostic
            {
                Line = line,
                Column = col,
                Severity = "error",
                Code = code,
                Message = message
            });
        }
    }
}
