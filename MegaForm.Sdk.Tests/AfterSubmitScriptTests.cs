/*
 * MegaForm.Sdk.Tests/AfterSubmitScriptTests.cs
 *
 * [AfterSubmitScript v20260813-01] Tests for the after-submit C# hook.
 *
 * The deny-list in ScriptSymbolPolicy is the security boundary of this feature, so it is
 * asserted here rather than left to a careful read. Each blocked namespace gets a case
 * that would genuinely do the dangerous thing if it compiled — reading a file, starting a
 * process, reaching reflection — and each is written the way someone trying to get around
 * a text filter would write it (aliased, fully qualified, hidden behind var).
 */

using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Scripting;
using MegaForm.Core.Services;
using MegaForm.Scripting;
using Xunit;

namespace MegaForm.Sdk.Tests
{
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

        // ── the deny-list ─────────────────────────────────────────────────────────

        [Theory]
        // file system, three ways of spelling it
        [InlineData("var s = System.IO.File.ReadAllText(\"c:/windows/win.ini\");")]
        [InlineData("using F = System.IO.File; ctx.Log(F.ReadAllText(\"c:/x\"));")]
        [InlineData("var f = global::System.IO.Directory.GetFiles(\"c:/\");")]
        // reflection — the escape hatch that reopens everything else
        [InlineData("var t = typeof(string).Assembly;")]
        [InlineData("var t = ctx.GetType();")]
        [InlineData("var o = System.Activator.CreateInstance(typeof(object));")]
        // process / environment
        [InlineData("System.Diagnostics.Process.Start(\"cmd.exe\");")]
        [InlineData("var p = System.Environment.MachineName;")]
        // network
        [InlineData("var c = new System.Net.Http.HttpClient();")]
        // threads
        [InlineData("System.Threading.Tasks.Task.Run(() => 1);")]
        // dynamic, which would route around the whole pass
        [InlineData("dynamic d = ctx; d.Anything();")]
        // MegaForm's own outbound-call service
        [InlineData("var w = new MegaForm.Core.Services.WebhookService(null, null);")]
        public void Denied_surfaces_do_not_compile(string source)
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

        // ── the capability rail ───────────────────────────────────────────────────
        //
        // These are the tests that keep the deny-list from being read as "a script cannot act".
        // Raw System.Net / System.Data stay shut; ctx.Http and ctx.Db are the doors, and they must
        // compile — otherwise the feature really would be a calculator.

        [Theory]
        [InlineData("var r = ctx.Http.PostJson(\"https://crm.example.com/api/leads\", new { name = ctx.GetString(\"full_name\") });\nif (!r.Ok) ctx.Fail(\"CRM said \" + r.Status);")]
        [InlineData("var r = ctx.Http.Get(\"https://api.example.com/rate\");\nctx.SetVariable(\"body\", r.Body);")]
        [InlineData("var r = ctx.Http.Send(\"PUT\", \"https://erp.example.com/o/1\", \"<x/>\", \"application/xml\");")]
        public void Http_capability_compiles_even_though_System_Net_does_not(string source)
        {
            var result = Compiler.Compile(source, "test");
            Assert.True(result.Success, FirstError(result));
        }

        [Theory]
        [InlineData("var id = ctx.Db.Scalar(\"CrmDatabase\", \"SELECT TOP 1 LeadId FROM CRM_Leads WHERE Email=@e\", new { e = ctx.GetString(\"email\") });")]
        [InlineData("var n = ctx.Db.Execute(\"CrmDatabase\", \"UPDATE CRM_Leads SET Score=@s WHERE LeadId=@id\", new { s = 70, id = 12 });")]
        [InlineData("var rows = ctx.Db.Query(\"CrmDatabase\", \"SELECT LeadId, FullName FROM CRM_Leads WHERE Email=@e\", new { e = \"a@b.c\" });\nforeach (var row in rows) ctx.Log(row.Str(\"FullName\"));")]
        [InlineData("foreach (var name in ctx.Db.ConnectionNames()) ctx.Log(name);")]
        public void Db_capability_compiles_even_though_System_Data_does_not(string source)
        {
            var result = Compiler.Compile(source, "test");
            Assert.True(result.Success, FirstError(result));
        }

        [Theory]
        [InlineData("var c = new System.Net.Http.HttpClient();")]
        [InlineData("var t = new System.Data.DataTable();")]
        public void Raw_network_and_ado_stay_closed_so_the_guarded_door_is_the_only_one(string source)
        {
            var result = Compiler.Compile(source, "test");
            Assert.False(result.Success, "Expected this to be refused: " + source);
            Assert.Contains(result.Diagnostics, d => d.Severity == "error" && d.Code == "MF1001");
        }

        [Fact]
        public void Capabilities_are_attached_by_the_service_not_left_null()
        {
            var settings = new FormAfterSubmitScriptSettings
            {
                Enabled = true,
                Source = "ctx.SetVariable(\"hasHttp\", ctx.Http != null);\n" +
                         "ctx.SetVariable(\"hasDb\", ctx.Db != null);"
            };
            AfterSubmitScriptGuard.Approve(settings, 7, "host", System.DateTime.UtcNow);

            var service = new AfterSubmitScriptService(Compiler);
            var ctx = Ctx();
            var run = service.Run(settings, ctx);

            Assert.True(run.Success, run.ErrorMessage);
            Assert.Equal(true, ctx.Variables["hasHttp"]);
            Assert.Equal(true, ctx.Variables["hasDb"]);
        }

        [Fact]
        public void Http_blocks_a_loopback_url_and_says_so_in_the_run_record()
        {
            // The case that matters: a URL assembled from submitted data. ctx.Http runs it through
            // the same guard the webhook node uses, so an anonymous public form cannot be turned
            // into a request generator aimed at the server's own network.
            var ctx = Ctx();
            var http = new MegaForm.Core.Scripting.ScriptHttp(line => ctx.Log(line));

            var result = http.Get("http://127.0.0.1:9/admin");

            Assert.Equal(0, result.Status);
            Assert.False(result.Ok);
            Assert.Contains("Blocked URL", result.Error);
            Assert.Contains(ctx.Logs, l => l.Message.Contains("blocked"));
        }

        [Fact]
        public void Db_without_a_registry_fails_loudly_instead_of_doing_nothing()
        {
            var ctx = Ctx();
            var db = new MegaForm.Core.Scripting.ScriptDatabase(null, null, line => ctx.Log(line));

            var ex = Assert.Throws<System.InvalidOperationException>(
                () => db.Execute("CrmDatabase", "UPDATE X SET Y=1"));
            Assert.Contains("no database connections", ex.Message.ToLowerInvariant());
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

        private static string FirstError(MegaForm.Core.Interfaces.ScriptCompileResult r)
        {
            var e = r.Diagnostics.FirstOrDefault(d => d.Severity == "error");
            return e == null ? "compiled" : ("line " + e.Line + ": " + e.Code + " " + e.Message);
        }
    }
}
