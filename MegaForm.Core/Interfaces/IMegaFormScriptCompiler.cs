/*
 * MegaForm.Core/Interfaces/IMegaFormScriptCompiler.cs
 *
 * [AfterSubmitScript v20260813-01] Contract between MegaForm.Core and whatever actually
 * compiles C#.
 *
 * Core deliberately does NOT reference Roslyn. Microsoft.CodeAnalysis.CSharp plus its
 * closure is ~15 MB; the DNN install package has to stay under the store's upload cap
 * (the same constraint that pushed the Amazon S3 provider out into an add-on assembly),
 * and the overwhelming majority of installs never author a script. So the implementation
 * ships as MegaForm.Scripting.dll and every host resolves it BY REFLECTION, exactly the
 * way DnnServiceLocator.TryLoadOptionalStorageProvider resolves S3.
 *
 * Fail-closed: when the assembly is absent the host registers no compiler, and
 * AfterSubmitScriptService refuses to run anything at all. "No compiler installed" must
 * never degrade into "run it some other way".
 */

using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Scripting;

namespace MegaForm.Core.Interfaces
{
    /// <summary>One diagnostic from a compile, in the shape the editor UI wants.</summary>
    public class ScriptDiagnostic
    {
        /// <summary>1-based, and already translated back to the author's own line numbers.</summary>
        public int Line { get; set; }
        public int Column { get; set; }
        /// <summary>"error" | "warning" | "info"</summary>
        public string Severity { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
    }

    /// <summary>A compiled script, ready to run. Implementations must be thread-safe.</summary>
    public interface ICompiledScript
    {
        /// <summary>SHA-256 (hex, lowercase) of the source this was compiled from.</summary>
        string Hash { get; }
        void Run(SubmissionScriptContext ctx);
    }

    /// <summary>
    /// Optional async execution contract. Runners prefer this when available and retain
    /// <see cref="ICompiledScript.Run"/> as the compatibility surface for older consumers.
    /// </summary>
    public interface IAsyncCompiledScript : ICompiledScript
    {
        Task RunAsync(SubmissionScriptContext ctx, CancellationToken ct);
    }

    public class ScriptCompileResult
    {
        public bool Success { get; set; }
        public string Hash { get; set; }
        public ICompiledScript Script { get; set; }
        public List<ScriptDiagnostic> Diagnostics { get; set; } = new List<ScriptDiagnostic>();

        public bool HasErrors
        {
            get
            {
                if (Diagnostics == null) return false;
                foreach (var d in Diagnostics)
                    if (d != null && d.Severity == "error") return true;
                return false;
            }
        }
    }

    /// <summary>
    /// Compiles an after-submit script. Called at SAVE time (so the author sees syntax
    /// errors while they are still looking at the editor) and on the first run after an
    /// application restart. Never called per submission on a warm process — the service
    /// caches by source hash.
    /// </summary>
    public interface IMegaFormScriptCompiler
    {
        /// <summary>
        /// Short identifier for logs and the generated type name, e.g. "form8-afterSubmit".
        /// Must not affect semantics — two identical sources compile to the same hash
        /// regardless of scriptId.
        /// </summary>
        ScriptCompileResult Compile(string source, string scriptId);
    }
}
