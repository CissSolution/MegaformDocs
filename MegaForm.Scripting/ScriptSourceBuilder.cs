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
        /// [OpenScripting 2026-08-14] Lift the author's leading <c>using</c> directives out of the
        /// body so they land where C# accepts them.
        ///
        /// A body-mode script is spliced into a method, and a `using X;` directive is not legal
        /// inside a method body — only the `using (resource)` statement is. Before this, an author
        /// writing the obvious thing:
        ///
        ///     using DotNetNuke.Entities.Users;
        ///     var id = UserController.CreateUser(ref u, false);
        ///
        /// got "A using clause must precede all other elements", which is true of the GENERATED
        /// file and meaningless to someone looking at the six lines they wrote. Now that scripts are
        /// meant to reach platform APIs directly, that is the first thing most authors will type.
        ///
        /// Each hoisted line is replaced by a BLANK line rather than removed, so every remaining
        /// line keeps its original number and the `#line 1` mapping still points a diagnostic at
        /// the author's line rather than an offset one.
        /// </summary>
        private static void HoistUsings(string body, out string directives, out string rest)
        {
            directives = string.Empty;
            rest = body ?? string.Empty;
            if (rest.Length == 0 || rest.IndexOf("using ", StringComparison.Ordinal) < 0) return;

            var lines = rest.Split('\n');
            var hoisted = new System.Text.StringBuilder();
            var seenCode = false;

            for (var i = 0; i < lines.Length && !seenCode; i++)
            {
                var trimmed = lines[i].Trim();
                if (trimmed.Length == 0 || trimmed.StartsWith("//", StringComparison.Ordinal)) continue;

                // A directive, not a `using (x) {` statement: no parenthesis before the semicolon.
                if (trimmed.StartsWith("using ", StringComparison.Ordinal)
                    && trimmed.EndsWith(";", StringComparison.Ordinal)
                    && trimmed.IndexOf('(') < 0)
                {
                    hoisted.Append(trimmed).Append("\r\n");
                    lines[i] = string.Empty;     // keep the line, drop its content
                    continue;
                }

                seenCode = true;                 // directives may only lead
            }

            directives = hoisted.ToString();
            if (directives.Length > 0) rest = string.Join("\n", lines);
        }

        /// <summary>
        /// Build the compilation unit. <paramref name="typeName"/> is the generated class
        /// name for body-mode sources; it never affects semantics. Body mode is async so capability
        /// calls can be awaited without blocking on Task.Result.
        /// </summary>
        public static string Build(string source, string typeName)
        {
            string authorUsings;
            string body;
            HoistUsings(source ?? string.Empty, out authorUsings, out body);

            if (IsFullClassSource(body))
            {
                return Usings + authorUsings +
                       "namespace " + GeneratedNamespace + "\r\n{\r\n" +
                       "#line 1 \"" + VirtualFileName + "\"\r\n" +
                       body + "\r\n" +
                       "#line default\r\n" +
                       "}\r\n";
            }

            return Usings + authorUsings +
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
