/*
 * MegaForm.Scripting/ScriptSourceBuilder.cs
 *
 * [AfterSubmitScript v20260813-01] Turns what an author typed into a compilation unit.
 *
 * Two shapes are accepted:
 *
 *   BODY (the default, and what the editor's starter snippet uses)
 *       ctx.Log("Hello " + ctx.GetString("full_name"));
 *       await ctx.Api.PostJsonAsync("crm", payload, ct);
 *     Statements only. They become the body of async RunAsync(ctx, ct).
 *
 *   FULL — a source that already declares a type implementing ISubmissionScript. Used
 *     by scripts that want private helper methods or extra types. Compiled verbatim
 *     apart from the usings prepended below.
 *
 * ── The #line directive is load-bearing ─────────────────────────────────────────
 * Wrapping shifts every line down by the size of the preamble, so Roslyn's line numbers
 * would point at the wrong line in the author's editor — the classic "error on line 1 of
 * a 1-line script says line 14" that makes a scripting feature feel broken. `#line 1`
 * immediately before the author's text resets the counter, so diagnostics come back in
 * the author's own coordinates with no arithmetic anywhere else in the stack.
 */

using System;

namespace MegaForm.Scripting
{
    internal static class ScriptSourceBuilder
    {
        /// <summary>Namespace of every generated script type.</summary>
        public const string GeneratedNamespace = "MegaForm.Scripts.Generated";

        /// <summary>Virtual file name diagnostics are reported against.</summary>
        public const string VirtualFileName = "AfterSubmitScript.cs";

        private const string Usings =
            "using System;\r\n" +
            "using System.Collections.Generic;\r\n" +
            "using System.Linq;\r\n" +
            "using System.Text;\r\n" +
            "using System.Threading;\r\n" +
            "using System.Threading.Tasks;\r\n" +
            "using MegaForm.Core.Scripting;\r\n";

        /// <summary>
        /// True when the author wrote a whole type themselves. Deliberately a plain text
        /// test rather than a parse: this only picks which wrapper to use, and a source
        /// that guesses wrong still fails compilation with a normal, readable C# error.
        /// </summary>
        public static bool IsFullClassSource(string source)
        {
            if (string.IsNullOrWhiteSpace(source)) return false;
            return (source.IndexOf("ISubmissionScript", StringComparison.Ordinal) >= 0
                    || source.IndexOf("ISubmissionAsyncScript", StringComparison.Ordinal) >= 0)
                && source.IndexOf("class", StringComparison.Ordinal) >= 0;
        }

        /// <summary>
        /// Build the compilation unit. <paramref name="typeName"/> is the generated class
        /// name for body-mode sources; it never affects semantics. Body mode is async so capability
        /// calls can be awaited without blocking on Task.Result.
        /// </summary>
        public static string Build(string source, string typeName)
        {
            var body = source ?? string.Empty;

            if (IsFullClassSource(body))
            {
                return Usings +
                       "namespace " + GeneratedNamespace + "\r\n{\r\n" +
                       "#line 1 \"" + VirtualFileName + "\"\r\n" +
                       body + "\r\n" +
                       "#line default\r\n" +
                       "}\r\n";
            }

            return Usings +
                   "namespace " + GeneratedNamespace + "\r\n" +
                   "{\r\n" +
                   "    public sealed class " + typeName + " : ISubmissionAsyncScript\r\n" +
                   "    {\r\n" +
                   "        public async Task RunAsync(SubmissionScriptContext ctx, CancellationToken ct)\r\n" +
                   "        {\r\n" +
                   "#line 1 \"" + VirtualFileName + "\"\r\n" +
                   body + "\r\n" +
                   "#line default\r\n" +
                   "        }\r\n" +
                   "    }\r\n" +
                   "}\r\n";
        }

        /// <summary>
        /// A C# identifier derived from the source hash. Two identical sources therefore
        /// produce identical generated code, which is what lets the cache key be the hash.
        /// </summary>
        public static string TypeNameFromHash(string hash)
        {
            var suffix = string.IsNullOrEmpty(hash) ? "anon" : hash;
            if (suffix.Length > 16) suffix = suffix.Substring(0, 16);
            return "AfterSubmitScript_" + suffix;
        }
    }
}
