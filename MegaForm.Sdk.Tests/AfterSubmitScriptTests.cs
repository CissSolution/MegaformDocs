/*
 * MegaForm.Sdk.Tests/AfterSubmitScriptTests.cs
 *
 * [AfterSubmitScript v20260813-01] Tests for the after-submit C# hook.
 *
 * [OpenScripting 2026-08-14] The deny-list is no longer the boundary of this feature, and the
 * tests below say so in both directions. A script is now ordinary C# written by a superuser, so
 * reading a file, opening a connection and calling an API all COMPILE — the cases that used to
 * assert refusal now assert the opposite, because a hook that could only compute would have no
 * way to act at all now that the ctx capability rail is gone.
 *
 * The old fence is still in the box: ScriptSymbolPolicy.RestrictedMode puts it back. That switch
 * is the entire safety story for a host who wants the old behaviour, so it is not left to a
 * careful read either — the same list of surfaces is compiled twice, once in each mode.
 */

using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using MegaForm.Core.Models;
using MegaForm.Core.Scripting;
using MegaForm.Core.Services;
using MegaForm.Scripting;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// ScriptSymbolPolicy.RestrictedMode is a process-wide static, and these tests flip it. xUnit
    /// runs test CLASSES in parallel, so without this the fence could go up while another class
    /// (AutomationV2Tests compiles scripts too) was mid-compile, and that class would fail with
    /// MF1001 for no reason it could see. A non-parallel collection runs on its own.
    /// </summary>
    [CollectionDefinition("AfterSubmitScriptPolicy", DisableParallelization = true)]
    public sealed class AfterSubmitScriptPolicyCollection { }

    [Collection("AfterSubmitScriptPolicy")]
    public class AfterSubmitScriptTests
    {
        private static readonly RoslynScriptCompiler Compiler = new RoslynScriptCompiler();

        private static SubmissionScriptContext Ctx(params (string key, object value)[] data)
        {
            var dict = new Dictionary<string, object>();
            foreach (var (key, value) in data) dict[key] = value;
            return new SubmissionScriptContext(dict) { FormId = 8, SubmissionId = 287 };
        }

        // ── it actually runs ──────────────────────────────────────────────────────

        [Fact]
        public void Body_source_compiles_and_runs()
        {
            var result = Compiler.Compile(
                "ctx.Log(\"hello \" + ctx.GetString(\"full_name\"));\n" +
                "ctx.SetVariable(\"score\", ctx.GetDecimal(\"amount\") * 2);",
                "test");

            Assert.True(result.Success, FirstError(result));

            var ctx = Ctx(("full_name", "Daniel Brooks"), ("amount", "21"));
            result.Script.Run(ctx);

            Assert.Equal("hello Daniel Brooks", ctx.Logs.Single().Message);
            Assert.Equal(42m, ctx.Variables["score"]);
            Assert.False(ctx.Failed);
        }

        [Fact]
        public void Full_class_source_compiles_and_runs()
        {
            var result = Compiler.Compile(
                "public sealed class MyScript : ISubmissionScript {\n" +
                "  public void Run(SubmissionScriptContext ctx) { ctx.SetVariable(\"n\", Double(20)); }\n" +
                "  private int Double(int x) { return x * 2; }\n" +
                "}",
                "test");

            Assert.True(result.Success, FirstError(result));
            var ctx = Ctx();
            result.Script.Run(ctx);
            Assert.Equal(40, ctx.Variables["n"]);
        }

        [Fact]
        public void Fail_marks_the_run_without_throwing()
        {
            var result = Compiler.Compile("ctx.Fail(\"amount is below the floor\");", "test");
            Assert.True(result.Success, FirstError(result));

            var ctx = Ctx();
            result.Script.Run(ctx);
            Assert.True(ctx.Failed);
            Assert.Equal("amount is below the floor", ctx.FailureMessage);
        }

        // ── diagnostics land on the author's own lines ────────────────────────────

        [Fact]
        public void Syntax_error_reports_the_authors_line_not_the_wrappers()
        {
            // The wrapper adds ~10 lines above the author's text. Without the #line directive
            // this error would be reported somewhere in the teens.
            var result = Compiler.Compile("var a = 1;\nvar b = ;\n", "test");

            Assert.False(result.Success);
            var error = result.Diagnostics.First(d => d.Severity == "error");
            Assert.Equal(2, error.Line);
        }

        // ── what a script may reach ───────────────────────────────────────────────
        //
        // [OpenScripting 2026-08-14] Every entry below was refused before this change. They are
        // kept, as one list compiled twice, because the pair is the claim: open by default, and
        // shut again the moment RestrictedMode goes on.
        //
        // The list stops at the framework rather than reaching for DotNetNuke.Entities.Users —
        // the DNN assemblies are not loaded in the test host, so `using DotNetNuke.…` would fail
        // to BIND here and prove nothing about policy. That half is a site check, not a CI one.

        public static IEnumerable<object[]> SurfacesTheOldFenceRefused()
        {
            // file system, two ways of spelling it
            yield return new object[] { "var s = System.IO.File.ReadAllText(\"c:/windows/win.ini\");" };
            yield return new object[] { "var f = global::System.IO.Directory.GetFiles(\"c:/\");" };
            // network — what ctx.Http used to be the only door to
            yield return new object[] { "var c = new System.Net.Http.HttpClient();" };
            // ADO.NET — what ctx.Db used to be the only door to
            yield return new object[] { "var t = new System.Data.DataTable();" };
            // another process
            yield return new object[] { "System.Diagnostics.Process.Start(\"cmd.exe\");" };
            // MegaForm's own outbound-call service
            yield return new object[] { "var w = new MegaForm.Core.Services.WebhookService(null, null);" };
        }

        [Theory]
        [MemberData(nameof(SurfacesTheOldFenceRefused))]
        public void Open_mode_lets_a_script_call_the_platform_directly(string source)
        {
            var result = Compiler.Compile(source, "test");
            Assert.True(result.Success, FirstError(result));
        }

        [Theory]
        [MemberData(nameof(SurfacesTheOldFenceRefused))]
        public void Restricted_mode_puts_the_old_fence_back(string source)
        {
            SetRestrictedMode(true);
            try
            {
                var result = Compiler.Compile(source, "test");

                Assert.False(result.Success, "Expected this to be refused with the fence up: " + source);
                Assert.Null(result.Script);
                Assert.Contains(result.Diagnostics, d => d.Severity == "error" && d.Code == "MF1001");
            }
            finally
            {
                // A test that left this on would refuse every script every later test compiles,
                // and the failures would land in whichever file happened to run next.
                SetRestrictedMode(false);
            }

            // The restore has to be observable, not just written down: if it silently failed, the
            // damage would show up somewhere else entirely.
            Assert.True(Compiler.Compile(source, "test").Success);
        }

        [Theory]
        // Reflection, dynamic, Activator, Environment and Task.Run were all refused in both modes
        // on the first cut of the opening, because the type and member lists sat ABOVE the mode
        // gate. That was half-open: a script could `using DotNetNuke.…` and call UserController but
        // not read Environment.MachineName — which reads as a bug to the author and buys the site
        // nothing, since anything reachable through DNN's own API was already open. The gate moved
        // to the top of IsDenied; these now compile.
        [InlineData("var t = typeof(string).Assembly;")]
        [InlineData("var t = ctx.GetType();")]
        [InlineData("var o = System.Activator.CreateInstance(typeof(object));")]
        [InlineData("var p = System.Environment.MachineName;")]
        [InlineData("dynamic d = ctx; d.Anything();")]
        [InlineData("System.Threading.Tasks.Task.Run(() => 1);")]
        public void Open_mode_is_open_all_the_way_not_half(string source)
        {
            var result = Compiler.Compile(source, "test");

            Assert.True(result.Success,
                "Open mode should compile this: " + source + " — " +
                string.Join("; ", result.Diagnostics.Where(d => d.Severity == "error").Select(d => d.Code + " " + d.Message)));
        }

        [Theory]
        // Unsafe code is the one thing refused in BOTH modes, and not by the policy pass: pointers
        // and stackalloc are rejected at the syntax level in Inspect, and `allowUnsafe:false` on the
        // compilation stops them again. It sidesteps the type system the whole pass is built on and
        // no after-submit hook has ever needed it.
        [InlineData("unsafe { int* p = null; }")]
        [InlineData("var s = stackalloc int[4];")]
        public void Unsafe_code_is_refused_in_both_modes(string source)
        {
            var result = Compiler.Compile(source, "test");

            Assert.False(result.Success, "Expected this to be refused: " + source);
            Assert.Null(result.Script);
            Assert.Contains(result.Diagnostics, d => d.Severity == "error");
        }

        [Theory]
        [InlineData("var s = \"a\" + 1; ctx.Log(s);")]
        [InlineData("var list = new List<int> { 1, 2, 3 }; ctx.SetVariable(\"sum\", list.Sum());")]
        [InlineData("var d = System.DateTime.UtcNow.AddDays(1); ctx.SetVariable(\"d\", d);")]
        [InlineData("var m = System.Math.Round(1.55m, 1); ctx.SetVariable(\"m\", m);")]
        [InlineData("var sb = new StringBuilder(); sb.Append(\"x\"); ctx.Log(sb.ToString());")]
        [InlineData("var ok = System.Text.RegularExpressions.Regex.IsMatch(\"a1\", \"^[a-z]\\\\d$\");")]
        public void Allowed_surfaces_still_compile(string source)
        {
            var result = Compiler.Compile(source, "test");
            Assert.True(result.Success, FirstError(result));
        }

        [Theory]
        // A body script is spliced into a method, where a `using` DIRECTIVE is illegal — only the
        // `using (resource)` statement is. ScriptSourceBuilder lifts leading directives above the
        // wrapper so an author can write the obvious thing.
        [InlineData("using System.Net;\nctx.Log(WebUtility.HtmlEncode(\"<b>\"));")]
        // Trailing comment. This is the form every documentation page and every real author writes,
        // and the first cut of the hoist required the line to END with ';' — so the comment meant
        // the directive stayed in the method body and the script failed with "CS1001 Identifier
        // expected", pointing at a line that is perfectly good C#. Found by compiling the
        // documentation's own samples.
        [InlineData("using System.Net;   // WebUtility lives here\nctx.Log(WebUtility.HtmlEncode(\"<b>\"));")]
        // Trailing comment containing PARENTHESES. The parenthesis test exists to tell a
        // `using (resource)` statement from a directive, and testing the whole line let a comment
        // decide it — which is exactly how a documentation page writes a using list:
        //     using System.Net.Http;   // new HttpClient()
        [InlineData("using System.Net.Http;   // new HttpClient()\nctx.Log(typeof(HttpClient).Name);")]
        [InlineData("using System.Net;   // WebUtility.HtmlEncode(s)\nctx.Log(WebUtility.HtmlEncode(\"<b>\"));")]
        // Several directives, blank lines and comments between them.
        [InlineData("using System.Net;\n\n// pick up the globalisation helpers too\nusing System.Globalization;\n\nctx.Log(WebUtility.HtmlEncode(1.5m.ToString(CultureInfo.InvariantCulture)));")]
        public void Leading_using_directives_are_lifted_above_the_wrapper(string source)
        {
            var result = Compiler.Compile(source, "test");
            Assert.True(result.Success, FirstError(result));
        }

        [Fact]
        public void A_using_STATEMENT_is_left_where_the_author_put_it()
        {
            // `using (x) { }` is a statement and belongs in the body. Hoisting it would move the
            // author's disposal scope out of their method, which is a very different program.
            var result = Compiler.Compile(
                "using (var sr = new System.IO.StringReader(\"a\")) { ctx.Log(sr.ReadToEnd()); }",
                "test");

            Assert.True(result.Success, FirstError(result));
        }

        [Fact]
        public void Hoisting_a_directive_does_not_shift_the_line_a_diagnostic_points_at()
        {
            // The hoist replaces each lifted line with a BLANK line rather than removing it, so the
            // author's line numbers survive. Without that, every error on a script with usings would
            // be reported one line early — the kind of small lie that costs an afternoon.
            var result = Compiler.Compile(
                "using System.Net;   // lifted\nvar ok = true;\nthis is not valid C#;",
                "test");

            Assert.False(result.Success);
            var error = result.Diagnostics.First(d => d.Severity == "error");
            Assert.Equal(3, error.Line);
        }

        // ── the approval record is what makes a script runnable ───────────────────

        [Fact]
        public void Unapproved_script_is_not_runnable()
        {
            var settings = new FormAfterSubmitScriptSettings
            {
                Enabled = true,
                Source = "ctx.Log(\"x\");"
                // no approval: this is what an imported form or a template install produces
            };

            Assert.False(AfterSubmitScriptGuard.IsRunnable(settings, out var reason));
            Assert.Contains("approval", reason);
        }

        [Fact]
        public void Tampered_source_is_not_runnable_even_though_it_was_once_approved()
        {
            var settings = new FormAfterSubmitScriptSettings { Enabled = true, Source = "ctx.Log(\"safe\");" };
            AfterSubmitScriptGuard.Approve(settings, 1, "host", System.DateTime.UtcNow);
            Assert.True(AfterSubmitScriptGuard.IsRunnable(settings, out _));

            // Something that is not the host-only endpoint rewrites the body, keeping the
            // approval fields — a direct row edit, a restored backup, a crafted save payload.
            settings.Source = "ctx.Log(\"anything else\");";

            Assert.False(AfterSubmitScriptGuard.IsRunnable(settings, out var reason));
            Assert.Contains("does not match", reason);
        }

        [Fact]
        public void Approved_and_untouched_is_runnable()
        {
            var settings = new FormAfterSubmitScriptSettings { Enabled = true, Source = "ctx.Log(\"x\");" };
            AfterSubmitScriptGuard.Approve(settings, 7, "host", System.DateTime.UtcNow);

            Assert.True(AfterSubmitScriptGuard.IsRunnable(settings, out _));
            Assert.Equal(AfterSubmitScriptGuard.ComputeHash(settings.Source), settings.ApprovedHash);
        }

        [Fact]
        public void CanAuthor_needs_both_host_and_the_feature_switch()
        {
            Assert.True(AfterSubmitScriptGuard.CanAuthor(isHostOrSuperUser: true, featureEnabled: true));
            Assert.False(AfterSubmitScriptGuard.CanAuthor(isHostOrSuperUser: true, featureEnabled: false));
            Assert.False(AfterSubmitScriptGuard.CanAuthor(isHostOrSuperUser: false, featureEnabled: true));
        }

        [Fact]
        public void Ordinary_save_cannot_introduce_alter_or_disable_a_script()
        {
            var stored = new FormAfterSubmitScriptSettings { Enabled = true, Source = "ctx.Log(\"stored\");" };
            AfterSubmitScriptGuard.Approve(stored, 7, "host", System.DateTime.UtcNow);

            // A content editor posts a form save carrying their own version of the block.
            var incoming = new FormAfterSubmitScriptSettings { Enabled = true, Source = "ctx.Log(\"injected\");" };

            var kept = AfterSubmitScriptGuard.PreserveApprovedCopy(incoming, stored);
            Assert.Equal("ctx.Log(\"stored\");", kept.Source);

            // …including the quieter version of the same move: switching it off.
            var disable = new FormAfterSubmitScriptSettings { Enabled = false, Source = stored.Source };
            Assert.True(AfterSubmitScriptGuard.PreserveApprovedCopy(disable, stored).Enabled);

            // A form that never had one does not gain one.
            Assert.Null(AfterSubmitScriptGuard.PreserveApprovedCopy(incoming, null));
        }

        // ── the service around it ─────────────────────────────────────────────────

        [Fact]
        public void Service_hands_back_what_an_approved_script_computed()
        {
            // What is left of "Capabilities_are_attached_by_the_service_not_left_null" once there
            // is no rail to attach: the run still has to reach the script and the script's
            // variables still have to come back out on the run record, which is where an admin
            // reads what it decided.
            var settings = new FormAfterSubmitScriptSettings
            {
                Enabled = true,
                Source = "ctx.Log(\"ran\");\nctx.SetVariable(\"score\", ctx.GetDecimal(\"amount\") * 2);"
            };
            AfterSubmitScriptGuard.Approve(settings, 7, "host", System.DateTime.UtcNow);

            var service = new AfterSubmitScriptService(Compiler);
            var run = service.Run(settings, Ctx(("amount", "21")));

            Assert.True(run.Success, run.ErrorMessage);
            Assert.False(run.Skipped);
            Assert.Equal(42m, run.Variables["score"]);
            Assert.Contains(run.Log, line => line.EndsWith("ran"));
        }

        [Fact]
        public void Service_skips_rather_than_fails_when_nothing_is_configured()
        {
            var service = new AfterSubmitScriptService(Compiler);
            var run = service.Run(null, Ctx());

            Assert.True(run.Skipped);
            Assert.True(run.Success);          // "did not run" is not a failure
            Assert.False(string.IsNullOrWhiteSpace(run.SkipReason));
        }

        [Fact]
        public void Service_without_a_compiler_refuses_instead_of_finding_another_way()
        {
            var settings = new FormAfterSubmitScriptSettings { Enabled = true, Source = "ctx.Log(\"x\");" };
            AfterSubmitScriptGuard.Approve(settings, 7, "host", System.DateTime.UtcNow);

            var service = new AfterSubmitScriptService(compiler: null);
            Assert.False(service.IsCompilerAvailable);

            var run = service.Run(settings, Ctx());
            Assert.True(run.Skipped);
            Assert.Contains("not installed", run.SkipReason);
        }

        [Fact]
        public void Service_reports_a_throwing_script_without_letting_it_escape()
        {
            var settings = new FormAfterSubmitScriptSettings
            {
                Enabled = true,
                Source = "throw new System.InvalidOperationException(\"boom\");"
            };
            AfterSubmitScriptGuard.Approve(settings, 7, "host", System.DateTime.UtcNow);

            var service = new AfterSubmitScriptService(Compiler);
            var run = service.Run(settings, Ctx());

            Assert.False(run.Skipped);
            Assert.False(run.Success);
            Assert.Contains("boom", run.ErrorMessage);
        }

        [Fact]
        public void Timeout_bounds_what_the_submit_waits_for()
        {
            var settings = new FormAfterSubmitScriptSettings
            {
                Enabled = true,
                TimeoutSeconds = 1,
                Source = "var end = System.DateTime.UtcNow.AddSeconds(6);\n" +
                         "while (System.DateTime.UtcNow < end) { }"
            };
            AfterSubmitScriptGuard.Approve(settings, 7, "host", System.DateTime.UtcNow);

            var service = new AfterSubmitScriptService(Compiler);
            var started = System.DateTime.UtcNow;
            var run = service.Run(settings, Ctx());
            var waited = System.DateTime.UtcNow - started;

            Assert.False(run.Success);
            Assert.Contains("did not finish", run.ErrorMessage);
            // The submit stopped waiting near the timeout rather than at the script's 6s.
            Assert.True(waited.TotalSeconds < 4, "submit waited " + waited.TotalSeconds + "s");
        }

        [Fact]
        public void Context_hides_pipeline_internal_keys_from_the_script()
        {
            var ctx = new SubmissionScriptContext(new Dictionary<string, object>
            {
                ["full_name"] = "Daniel Brooks",
                ["__actorUserId"] = 0,
                ["__portalId"] = 0
            });

            Assert.True(ctx.Has("full_name"));
            Assert.False(ctx.Has("__actorUserId"));
            Assert.Single(ctx.Data);
        }

        [Fact]
        public void Field_keys_are_case_insensitive_like_the_rest_of_the_pipeline()
        {
            var ctx = Ctx(("Full_Name", "Daniel Brooks"));
            Assert.Equal("Daniel Brooks", ctx.GetString("full_name"));
        }

        /// <summary>
        /// Flip the escape hatch. ScriptSymbolPolicy is internal to MegaForm.Scripting and there is
        /// no InternalsVisibleTo, so reflection is the only way a test can reach the switch — and a
        /// rename would otherwise turn this whole pair of tests into a silent no-op, which is why
        /// the lookup throws rather than shrugging.
        /// </summary>
        private static void SetRestrictedMode(bool on)
        {
            var policy = typeof(RoslynScriptCompiler).Assembly
                .GetType("MegaForm.Scripting.ScriptSymbolPolicy", throwOnError: true);
            var flag = policy.GetProperty("RestrictedMode", BindingFlags.Public | BindingFlags.Static);
            Assert.NotNull(flag);
            flag.SetValue(null, on);
        }

        private static string FirstError(MegaForm.Core.Interfaces.ScriptCompileResult r)
        {
            var e = r.Diagnostics.FirstOrDefault(d => d.Severity == "error");
            return e == null ? "compiled" : ("line " + e.Line + ": " + e.Code + " " + e.Message);
        }
    }
}
