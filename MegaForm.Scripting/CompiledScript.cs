/*
 * MegaForm.Scripting/CompiledScript.cs
 *
 * [AfterSubmitScript v20260813-01] Loading the emitted assembly, and the one place where
 * the two platforms genuinely differ.
 *
 * ── .NET Core / .NET 5+ ─────────────────────────────────────────────────────────
 * Each script version gets its own AssemblyLoadContext created with isCollectible:true.
 * That matters because editing a script produces a NEW assembly every time: the owner's
 * sample used AssemblyLoadContext.Default.LoadFromStream, and an assembly loaded into
 * Default can never be unloaded, so twenty edits during an afternoon of authoring would
 * leave twenty assemblies resident until the process recycled. A collectible context can
 * be released, so a superseded script version is reclaimable once nothing references it.
 *
 * Dependency resolution is deliberately left to the default fallback (Load returns null).
 * MegaForm.Core must NOT be loaded a second time into the script's context — if it were,
 * the SubmissionScriptContext the pipeline passes in and the one the script was compiled
 * against would be different types with the same name, and the cast would fail with the
 * famously unhelpful "cannot convert SubmissionScriptContext to SubmissionScriptContext".
 *
 * ── .NET Framework (DNN) ────────────────────────────────────────────────────────
 * There is no collectible load context. Assembly.Load(byte[]) puts the assembly in the
 * current AppDomain permanently. The mitigating facts, in order of weight: compilation
 * happens on SAVE, not per submission, so the count tracks edits rather than traffic;
 * identical source produces an identical hash and is served from the service-level cache
 * without recompiling; and DNN recycles its AppDomain on any web.config or bin change.
 * A host who sits and edits a script fifty times will hold fifty small assemblies until
 * the next recycle. That is a real cost, it is bounded, and it is written down here and
 * in the admin documentation rather than discovered later.
 */

using System;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Scripting;

#if !MEGAFORM_NETFX
using System.Runtime.Loader;
#endif

namespace MegaForm.Scripting
{
#if !MEGAFORM_NETFX
    /// <summary>
    /// One collectible context per compiled script version. Load() returns null on purpose
    /// so every dependency — MegaForm.Core above all — resolves from the default context and
    /// keeps a single type identity across the boundary.
    /// </summary>
    internal sealed class ScriptLoadContext : AssemblyLoadContext
    {
        public ScriptLoadContext(string name) : base(name, isCollectible: true) { }

        protected override Assembly Load(AssemblyName assemblyName)
        {
            return null;
        }
    }
#endif

    internal sealed class CompiledScript : IAsyncCompiledScript
    {
        private readonly ISubmissionScript _syncInstance;
        private readonly ISubmissionAsyncScript _asyncInstance;

        public string Hash { get; private set; }

        private CompiledScript(ISubmissionScript syncInstance, ISubmissionAsyncScript asyncInstance, string hash)
        {
            _syncInstance = syncInstance;
            _asyncInstance = asyncInstance;
            Hash = hash;
        }

        public void Run(SubmissionScriptContext ctx)
        {
            RunAsync(ctx, CancellationToken.None).GetAwaiter().GetResult();
        }

        public Task RunAsync(SubmissionScriptContext ctx, CancellationToken ct)
        {
            if (_asyncInstance != null) return _asyncInstance.RunAsync(ctx, ct);
            _syncInstance.Run(ctx);
            return Task.CompletedTask;
        }

        public static ICompiledScript Load(byte[] peBytes, string hash)
        {
            Assembly assembly;
#if MEGAFORM_NETFX
            assembly = Assembly.Load(peBytes);
#else
            var context = new ScriptLoadContext("MegaFormScript-" + hash.Substring(0, Math.Min(16, hash.Length)));
            using (var ms = new System.IO.MemoryStream(peBytes))
            {
                assembly = context.LoadFromStream(ms);
            }
#endif
            var scriptType = assembly.GetTypes().FirstOrDefault(t =>
                (typeof(ISubmissionScript).IsAssignableFrom(t) ||
                 typeof(ISubmissionAsyncScript).IsAssignableFrom(t)) &&
                !t.IsAbstract && !t.IsInterface);

            if (scriptType == null)
                throw new InvalidOperationException(
                    "No type implementing ISubmissionScript or ISubmissionAsyncScript was found in the compiled script.");

            if (scriptType.GetConstructor(Type.EmptyTypes) == null)
                throw new InvalidOperationException(
                    "The script type must have a parameterless constructor.");

            var instance = Activator.CreateInstance(scriptType);
            return new CompiledScript(instance as ISubmissionScript, instance as ISubmissionAsyncScript, hash);
        }
    }
}
