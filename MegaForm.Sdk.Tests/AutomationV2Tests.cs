/*
 * MegaForm.Sdk.Tests/AutomationV2Tests.cs
 *
 * [Automation v2 20260813-01] The claims the feature makes, as tests.
 *
 * [OpenScripting 2026-08-14] The shape of this file changed with the product decision behind it.
 *
 * It used to be mostly a security file: a capability rail that is only true in the documentation is
 * worse than no rail, because it is sold as one. The rail is gone from ctx — a script now reaches
 * the platform with ordinary C# — so the tests that proved the rail was really a rail have nothing
 * left to prove and were deleted rather than left as commented-out furniture.
 *
 * What remains is the part that never depended on the rail, and it is the part that can still ruin
 * someone's day if it breaks:
 *
 *   - the approval gate: an imported script is inert, a tampered one does not run;
 *   - the lifecycle: a PreInsert abort really stops the row, and a PostCommit failure really does
 *     not — asserted by driving a real SubmissionProcessor, because "the pipeline honours the
 *     abort" is exactly the part that could be wired wrong while every unit still passes;
 *   - the compile gate that survived the opening: unsafe code, reflection's front door, and the
 *     members that start work outliving the submission are still refused, in BOTH modes;
 *   - RestrictedMode itself, which is the escape hatch back to the old fence and is worthless
 *     unless it is proven to still close.
 */

using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using MegaForm.Core.Automation;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Scripting;
using MegaForm.Core.Services;
using MegaForm.Scripting;
using Microsoft.Data.Sqlite;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public class AutomationV2Tests
    {
        private static readonly RoslynScriptCompiler Compiler = new RoslynScriptCompiler();

        // ── harness ───────────────────────────────────────────────────────────────

        /// <summary>One SQLite connection kept open for the life of a test: an in-memory database
        /// disappears the moment its last connection closes, so a registry that opened a new one
        /// per call would hand every action an empty schema.</summary>
        private sealed class SqliteRegistry : IConnectionRegistry, IDisposable
        {
            private readonly SqliteConnection _shared;
            public SqliteRegistry()
            {
                _shared = new SqliteConnection("Data Source=automation-test;Mode=Memory;Cache=Shared");
                _shared.Open();
                using var cmd = _shared.CreateCommand();
                cmd.CommandText = "CREATE TABLE IF NOT EXISTS Leads (Id INTEGER PRIMARY KEY AUTOINCREMENT, Email TEXT, Score INTEGER);";
                cmd.ExecuteNonQuery();
            }

            public DbConnection GetConnection(string connectionName, string databaseType = null, string connectionString = null)
            {
                if (!string.Equals(connectionName, "TestDb", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Unknown connection '" + connectionName + "'.");
                return new SqliteConnection("Data Source=automation-test;Mode=Memory;Cache=Shared");
            }

            public int CountLeads()
            {
                using var cmd = _shared.CreateCommand();
                cmd.CommandText = "SELECT COUNT(*) FROM Leads";
                return Convert.ToInt32(cmd.ExecuteScalar());
            }

            public void Dispose() => _shared.Dispose();
        }

        private sealed class FixedCatalog : IAutomationCatalogProvider
        {
            private readonly AutomationCatalog _catalog;
            public FixedCatalog(AutomationCatalog c) { _catalog = c; }
            public AutomationCatalog GetCatalog() => _catalog;
        }

        private sealed class RecordingAutomationQueue : IAutomationExecutionQueue
        {
            public AutomationExecutionRequest Last { get; private set; }
            public string Enqueue(AutomationExecutionRequest request)
            {
                Last = request;
                return "automation-q-1";
            }
        }

        private static AutomationCatalog CatalogWithLeadAction() => new AutomationCatalog
        {
            DbActions =
            {
                new NamedDbAction
                {
                    Name = "insert-lead", ConnectionName = "TestDb",
                    Kind = AutomationDbActionKinds.Execute,
                    Sql = "INSERT INTO Leads (Email, Score) VALUES (@email, @score)",
                    Parameters = { "email", "score" },
                },
                new NamedDbAction
                {
                    Name = "count-leads", ConnectionName = "TestDb",
                    Kind = AutomationDbActionKinds.Scalar,
                    Sql = "SELECT COUNT(*) FROM Leads",
                },
                new NamedDbAction
                {
                    Name = "retired-action", ConnectionName = "TestDb",
                    Sql = "SELECT 1", Enabled = false,
                },
            },
            Endpoints =
            {
                new NamedHttpEndpoint
                {
                    Name = "crm-lead", Url = "https://crm.example.invalid/api/leads",
                    Method = "POST", AuthType = "bearer", AuthValue = "super-secret-token",
                },
                // Deliberately loopback: an administrator can configure one, and the guard still
                // has to refuse it. That is the assertion, not a mistake in the fixture.
                new NamedHttpEndpoint { Name = "local-thing", Url = "http://127.0.0.1:9/hook" },
            },
        };

        private static FormAfterSubmitScriptSettings Approved(string source, string onFailure = "continue")
        {
            var block = new FormAfterSubmitScriptSettings { Enabled = true, Source = source, OnFailure = onFailure };
            AfterSubmitScriptGuard.Approve(block, 7, "host", DateTime.UtcNow);
            return block;
        }

        private static SubmissionScriptContext Ctx() =>
            new SubmissionScriptContext(new Dictionary<string, object>
            {
                ["email"] = "emily.carter@acme-demo.com",
                ["full_name"] = "Emily Carter",
                ["national_id"] = "123-45-6789",
            })
            { FormId = 8, SubmissionId = 288, UtcNow = DateTime.UtcNow };

        private static AfterSubmitScriptService Service(IConnectionRegistry registry, AutomationCatalog catalog)
            => new AfterSubmitScriptService(Compiler, null, null,
                   registry == null ? (Func<IConnectionRegistry>)null : () => registry,
                   catalog == null ? null : new FixedCatalog(catalog));

        private static string FirstError(ScriptCompileResult result) =>
            result?.Diagnostics?.FirstOrDefault(d => d.Severity == "error")?.Message ?? "(no error reported)";

        /// <summary>
        /// [OpenScripting 2026-08-14] Flip <c>ScriptSymbolPolicy.RestrictedMode</c>.
        ///
        /// By reflection because the policy class is internal to MegaForm.Scripting and this project
        /// is not a friend assembly — making it one would be a change to shipping code for a test's
        /// convenience, and the switch is meant to be host configuration rather than API.
        ///
        /// The switch is a process-wide static, so every caller below restores it in a finally
        /// block. A leaked <c>true</c> would not fail here; it would fail whichever test happened to
        /// compile a script next, which is the worst kind of failure to be handed.
        /// </summary>
        private static void SetRestrictedMode(bool value)
        {
            var policy = typeof(RoslynScriptCompiler).Assembly
                .GetType("MegaForm.Scripting.ScriptSymbolPolicy", throwOnError: true)!;
            policy.GetProperty("RestrictedMode", BindingFlags.Public | BindingFlags.Static)!
                  .SetValue(null, value);
        }

        // ── 1. an imported script is inert until a host approves it here ──────────

        [Fact]
        public void Imported_script_does_not_run_until_it_is_approved_on_this_site()
        {
            // Exactly what a template install / gallery download / form import produces: source,
            // enabled, no approval record.
            var imported = new FormAfterSubmitScriptSettings
            {
                Enabled = true,
                Source = "ctx.Log(\"this should never run\");",
            };

            var run = Service(null, null).RunStage(AutomationStage.PostCommit, imported, Ctx());

            Assert.True(run.Skipped);
            Assert.Contains("approval", run.SkipReason);
            Assert.False(AfterSubmitScriptGuard.IsRunnable(imported, out _));
        }

        // ── 2. a tampered script does not run ─────────────────────────────────────

        [Fact]
        public void Tampered_source_does_not_run_even_with_the_old_approval_attached()
        {
            var block = Approved("ctx.Log(\"safe\");");
            Assert.True(AfterSubmitScriptGuard.IsRunnable(block, out _));

            block.Source = "ctx.Log(\"something else entirely\");";   // approval fields left intact

            var run = Service(null, null).RunStage(AutomationStage.PostCommit, block, Ctx());
            Assert.True(run.Skipped);
            Assert.Contains("does not match", run.SkipReason);
        }

        // ── 3. raw .NET is open by default, and RestrictedMode closes it again ────

        /// <summary>
        /// The surfaces the namespace deny-list used to refuse. Shared by the pair of tests below so
        /// the open case and the restricted case can never drift apart into asserting different
        /// things about different code.
        ///
        /// All of them are compile-only here — nothing is ever Run, so the Process.Start row starts
        /// no process. `DotNetNuke.…` would belong in this list on a DNN host and is absent only
        /// because the test project does not reference DNN, so it would fail to BIND rather than
        /// fail on policy, which would prove nothing about the policy.
        /// </summary>
        public static IEnumerable<object[]> RawPlatformSurfaces()
        {
            yield return new object[] { "var c = new System.Net.Http.HttpClient();" };
            yield return new object[] { "var t = new System.Data.DataTable();" };
            yield return new object[] { "System.IO.File.WriteAllText(@\"c:\\x.txt\", \"hi\");" };
            yield return new object[] { "System.Diagnostics.Process.Start(\"powershell.exe\", \"-c whoami\");" };
            yield return new object[] { "var d = new System.Xml.XmlDocument();" };
            yield return new object[] { "var th = new System.Threading.Thread(() => ctx.Log(\"x\")); th.Start();" };
        }

        [Theory]
        [MemberData(nameof(RawPlatformSurfaces))]
        public void Raw_dotnet_surfaces_compile_now_that_the_host_owns_the_decision(string source)
        {
            // The inverse of what this test asserted until 2026-08-14. Only a superuser can save a
            // script, and a superuser can already install a module and run SQL from the Persona Bar,
            // so there was no privilege for the deny-list to hold back — it only made the obvious
            // `using System.Net.Http;` fail with a message that read like a MegaForm bug.
            var result = Compiler.Compile(source, "test");

            Assert.True(result.Success, "Expected this to compile now: " + source + " — " + FirstError(result));
            Assert.NotNull(result.Script);
        }

        [Fact]
        public void Restricted_mode_puts_the_old_fence_back_for_every_one_of_them()
        {
            // The escape hatch for a host that wants the old behaviour. It is one static bool, which
            // means it is exactly the kind of thing that gets refactored away as dead code unless
            // something proves it still works.
            //
            // Flipped once and restored in a finally rather than once per row: the switch is
            // process-wide, so the shorter the window, the less it can bleed into another test class
            // compiling a script on another thread.
            SetRestrictedMode(true);
            try
            {
                foreach (var row in RawPlatformSurfaces())
                {
                    var source = (string)row[0];
                    var result = Compiler.Compile(source, "test");

                    Assert.False(result.Success, "Restricted mode should have refused: " + source);
                    Assert.Null(result.Script);
                    // MF1001 is the policy pass. Asserting on the CODE and not merely on "an error"
                    // is what separates "the fence refused it" from "it never bound in the first
                    // place", which would pass this test while proving nothing.
                    Assert.Contains(result.Diagnostics, d => d.Severity == "error" && d.Code == "MF1001");
                }
            }
            finally
            {
                SetRestrictedMode(false);
            }
        }

        [Theory]
        // Reflection's front door and the members that start work outliving the submission. These
        // were refused in open mode on the first cut, because the type and member lists sat above
        // the mode gate — the gate moved to the top of IsDenied, so open mode now means open.
        //
        // Task.Run in particular is worth understanding rather than fearing: the run timeout bounds
        // what the VISITOR waits for, not what the script started, and it never could. A script that
        // fires work and forgets it is now the host's call to make, like every other thing this
        // change handed back to them. Restricted mode still refuses all four.
        [InlineData("var a = typeof(string).Assembly;")]
        [InlineData("var d = System.Activator.CreateInstance(typeof(object));")]
        [InlineData("System.Threading.Tasks.Task.Run(() => ctx.Log(\"later\"));")]
        [InlineData("System.Threading.Tasks.Parallel.For(0, 10, i => ctx.Log(i.ToString()));")]
        public void Reflection_and_fire_and_forget_follow_the_same_switch(string source)
        {
            var open = Compiler.Compile(source, "test");
            Assert.True(open.Success,
                "Open mode should compile this: " + source + " — " +
                string.Join("; ", open.Diagnostics.Where(d => d.Severity == "error").Select(d => d.Code + " " + d.Message)));

            SetRestrictedMode(true);
            try
            {
                var restricted = Compiler.Compile(source, "test");
                Assert.False(restricted.Success, "Expected this to be refused in restricted mode: " + source);
                Assert.Contains(restricted.Diagnostics, d => d.Severity == "error" && d.Code == "MF1001");
            }
            finally
            {
                SetRestrictedMode(false);
            }
        }

        [Theory]
        [InlineData("unsafe { int* p = null; ctx.Log(((long)p).ToString()); }")]
        [InlineData("System.Span<int> s = stackalloc int[4]; ctx.Log(s.Length.ToString());")]
        public void Unsafe_code_is_refused_in_both_modes(string source)
        {
            // Deliberately NOT asserting MF1001 here, unlike every other refusal in this file.
            // Unsafe code never reaches the policy pass: the compilation is created with
            // allowUnsafe:false, so the binder rejects it first (CS0227 for the pointer, CS4012 for
            // a ref-struct local in the generated async method) and RoslynScriptCompiler returns on
            // bind errors before it inspects anything. The pass's pointer/stackalloc branch is the
            // second lock on the same door — it is what would still refuse this if someone ever
            // turned allowUnsafe on. Asserting the code here would pin a diagnostic that belongs to
            // the C# compiler rather than to us.
            var open = Compiler.Compile(source, "test");
            Assert.False(open.Success, "Expected unsafe code to be refused: " + source);
            Assert.Null(open.Script);

            SetRestrictedMode(true);
            try
            {
                var restricted = Compiler.Compile(source, "test");
                Assert.False(restricted.Success, "Expected unsafe code to be refused in restricted mode too: " + source);
            }
            finally
            {
                SetRestrictedMode(false);
            }
        }

        [Fact]
        public void Await_still_compiles_in_restricted_mode_because_Task_itself_is_reachable()
        {
            // Body scripts are wrapped in `async Task RunAsync(...)`, so if System.Threading.Tasks
            // is not nameable then NOTHING compiles under the fence. Denying all of System.Threading
            // produced exactly that once, and the suite caught it before it shipped; the narrow
            // exception that fixed it is only load-bearing in restricted mode, where nothing else
            // would exercise it any more.
            SetRestrictedMode(true);
            try
            {
                var result = Compiler.Compile(
                    "await System.Threading.Tasks.Task.Delay(1, ct);\n" +
                    "ctx.SetVariable(\"awaited\", true);", "test");

                Assert.True(result.Success, FirstError(result));
            }
            finally
            {
                SetRestrictedMode(false);
            }
        }

        [Fact]
        public void Body_scripts_can_use_native_await_and_receive_the_run_cancellation_token()
        {
            // Two claims in one run, and the second is the easy one to lose silently: `ct` is a REAL
            // token from the timeout's CancellationTokenSource, not `default`. A default token has
            // CanBeCanceled == false, so a wiring change that stopped passing the source's token
            // would still compile, still await, and still pass a test that only checked the await.
            var service = Service(null, null);
            var block = Approved(
                "await Task.Delay(1, ct);\n" +
                "ctx.SetVariable(\"awaited\", true);\n" +
                "ctx.SetVariable(\"cancellable\", ct.CanBeCanceled);");
            var ctx = Ctx();

            var run = service.RunStage(AutomationStage.PostCommit, block, ctx);

            Assert.True(run.Success, run.ErrorMessage);
            Assert.True(Convert.ToBoolean(ctx.Variables["awaited"]));
            Assert.True(Convert.ToBoolean(ctx.Variables["cancellable"]));
        }

        // ── 4. the named-action catalog ───────────────────────────────────────────
        //
        // No longer reachable from ctx, but AutomationDbCapability is still a live type the DNN
        // service locator builds, so its behaviour is still asserted — directly, the way the two
        // refusal tests below always did it.

        [Fact]
        public async Task Named_db_action_runs_and_writes_the_row()
        {
            using var registry = new SqliteRegistry();
            var db = new AutomationDbCapability(new FixedCatalog(CatalogWithLeadAction()), registry, null, null);

            var insert = await db.ExecuteNamedActionAsync(
                "insert-lead", new { email = "emily.carter@acme-demo.com", score = 70 });
            var total = await db.ExecuteNamedActionAsync("count-leads");

            // "The action resolved" is not the claim. "The row is in the table" is.
            Assert.Equal(1, insert.RowsAffected);
            Assert.Equal(1, Convert.ToInt32(total.ScalarValue));
            Assert.Equal(1, registry.CountLeads());
        }

        [Fact]
        public async Task Named_db_action_rejects_a_parameter_the_catalog_did_not_declare()
        {
            // A typo that binds to nothing is the silent version of this: the column takes NULL and
            // the run reports success. Refusing is the whole point of declaring parameters.
            using var registry = new SqliteRegistry();
            var db = new AutomationDbCapability(new FixedCatalog(CatalogWithLeadAction()), registry, null, null);

            var ex = await Assert.ThrowsAsync<ArgumentException>(
                () => db.ExecuteNamedActionAsync("insert-lead", new { email = "a@b.c", scoer = 70 }));

            Assert.Contains("does not accept a parameter named 'scoer'", ex.Message);
        }

        [Fact]
        public async Task Unknown_or_disabled_db_action_fails_with_the_list_of_real_ones()
        {
            using var registry = new SqliteRegistry();
            var db = new AutomationDbCapability(new FixedCatalog(CatalogWithLeadAction()), registry, null, null);

            var missing = await Assert.ThrowsAsync<InvalidOperationException>(
                () => db.ExecuteNamedActionAsync("nope"));
            Assert.Contains("insert-lead", missing.Message);

            var disabled = await Assert.ThrowsAsync<InvalidOperationException>(
                () => db.ExecuteNamedActionAsync("retired-action"));
            Assert.Contains("No enabled database action", disabled.Message);

            Assert.DoesNotContain("retired-action", db.ActionNames());
        }

        // ── 5. a named HTTP endpoint resolves, and the guard still applies ────────

        [Fact]
        public async Task Named_endpoint_that_points_at_loopback_is_refused_even_though_an_admin_configured_it()
        {
            var http = new AutomationHttpCapability(new FixedCatalog(CatalogWithLeadAction()), null, null);

            var result = await http.PostJsonAsync("local-thing", new { hello = "world" });

            Assert.Equal(0, result.Status);
            Assert.False(result.Ok);
            Assert.Contains("Blocked URL", result.Error);
        }

        [Fact]
        public async Task Unknown_endpoint_names_the_endpoints_the_site_does_define()
        {
            var http = new AutomationHttpCapability(new FixedCatalog(CatalogWithLeadAction()), null, null);

            var ex = await Assert.ThrowsAsync<InvalidOperationException>(
                () => http.PostJsonAsync("hubspot-lead", new { }));

            Assert.Contains("crm-lead", ex.Message);
        }

        [Fact]
        public void An_endpoint_secret_is_masked_in_the_admin_facing_copy_of_the_catalog()
        {
            // FormScriptController hands the catalog to an editor screen. Redacted() is the only
            // thing between a stored bearer token and an HTTP response, so the masking and the fact
            // that masking does NOT mutate the real catalog are both asserted.
            var redacted = CatalogWithLeadAction().Redacted();

            Assert.Equal(AutomationCatalog.MaskedValue, redacted.FindEndpoint("crm-lead").AuthValue);
            Assert.Equal("super-secret-token", CatalogWithLeadAction().FindEndpoint("crm-lead").AuthValue);
        }

        // ── 6. PreInsert can abort, and the pipeline honours it ───────────────────

        private static (InMemoryFormRepository forms, InMemorySubmissionRepository subs, SubmissionProcessor processor)
            Pipeline(AfterSubmitScriptService service, FormAutomationSettings automation,
                IAutomationExecutionQueue automationQueue = null)
        {
            var forms = new InMemoryFormRepository();
            var subs = new InMemorySubmissionRepository();

            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "email", Type = "Email", Label = "Email" },
                    new FormField { Key = "full_name", Type = "Text", Label = "Full name" },
                },
                Settings = new FormSettings { Automation = automation },
            };

            forms.SaveForm(new FormInfo
            {
                FormId = 1, ModuleId = 1, PortalId = 0, Title = "Automation test",
                Status = "Published",
                SchemaJson = Newtonsoft.Json.JsonConvert.SerializeObject(schema),
            });

            var processor = new SubmissionProcessor(forms, subs, null, null, null, null, null, null, null,
                afterSubmitScript: service, automationQueue: automationQueue);
            return (forms, subs, processor);
        }

        private static Dictionary<string, object> Payload() => new Dictionary<string, object>
        {
            ["email"] = "emily.carter@acme-demo.com",
            ["full_name"] = "Emily Carter",
        };

        [Fact]
        public async Task PreInsert_abort_stops_the_submission_before_any_row_exists()
        {
            var service = Service(null, null);
            var automation = new FormAutomationSettings
            {
                PreInsert = Approved(
                    "if (ctx.GetString(\"email\").EndsWith(\"@acme-demo.com\"))\n" +
                    "    ctx.Fail(\"This domain is on the blocklist.\");"),
            };
            var (_, subs, processor) = Pipeline(service, automation);

            var result = await processor.ProcessAsync(1, Payload(), "1.2.3.4", "test-agent", null);

            Assert.False(result.Success);
            Assert.Equal("This domain is on the blocklist.", result.ErrorMessage);
            // The claim that matters: nothing was written.
            Assert.Equal(0, subs.List(1).TotalCount);
        }

        [Fact]
        public async Task PreValidate_runs_before_field_validation_and_can_veto_the_submission()
        {
            var service = Service(null, null);
            var automation = new FormAutomationSettings
            {
                PreValidate = Approved(
                    "if (ctx.GetString(\"email\").EndsWith(\"@acme-demo.com\"))\n" +
                    "    ctx.Fail(\"External eligibility check rejected this address.\");"),
            };
            var (_, subs, processor) = Pipeline(service, automation);

            var result = await processor.ProcessAsync(1, Payload(), "1.2.3.4", "test-agent", null);

            Assert.False(result.Success);
            Assert.Equal("External eligibility check rejected this address.", result.ErrorMessage);
            Assert.Equal(0, subs.List(1).TotalCount);
        }

        [Fact]
        public async Task PreInsert_can_rewrite_a_value_and_the_stored_row_carries_the_new_one()
        {
            var service = Service(null, null);
            var automation = new FormAutomationSettings
            {
                PreInsert = Approved("ctx.SetValue(\"email\", ctx.GetString(\"email\").ToUpperInvariant());"),
            };
            var (_, subs, processor) = Pipeline(service, automation);

            var result = await processor.ProcessAsync(1, Payload(), "1.2.3.4", "test-agent", null);

            Assert.True(result.Success, result.ErrorMessage);
            var stored = subs.Get(result.SubmissionId);
            Assert.Contains("EMILY.CARTER@ACME-DEMO.COM", stored.DataJson);
        }

        [Fact]
        public void SetValue_is_refused_after_the_row_exists_rather_than_silently_ignored()
        {
            var ctx = Ctx();
            ctx.Stage = AutomationStage.PostCommit;

            var ex = Assert.Throws<InvalidOperationException>(() => ctx.SetValue("email", "x@y.z"));
            Assert.Contains("only available before the submission is written", ex.Message);

            ctx.Stage = AutomationStage.PreInsert;
            ctx.SetValue("email", "x@y.z");
            Assert.Equal("x@y.z", ctx.GetString("email"));
            Assert.Single(ctx.PendingChanges);
        }

        // ── 7. a PostCommit failure keeps the submission ──────────────────────────

        [Fact]
        public async Task PostCommit_failure_does_not_lose_the_submission()
        {
            var service = Service(null, null);
            var automation = new FormAutomationSettings
            {
                PostCommit = Approved("throw new InvalidOperationException(\"CRM is down\");", "report"),
            };
            var (_, subs, processor) = Pipeline(service, automation);

            var result = await processor.ProcessAsync(1, Payload(), "1.2.3.4", "test-agent", null);

            Assert.True(result.Success);                    // the visitor is still thanked
            Assert.True(result.SubmissionId > 0);
            Assert.Equal(1, subs.List(1).TotalCount);       // and the row is there
            Assert.Contains("CRM is down", result.ScriptError);   // onFailure = report
        }

        [Fact]
        public void PostCommit_cannot_abort_no_matter_what_the_script_asks_for()
        {
            var service = Service(null, null);
            var block = Approved("ctx.Fail(\"undo this please\");");

            var postCommit = service.RunStage(AutomationStage.PostCommit, block, Ctx());
            Assert.False(postCommit.Success);
            Assert.False(postCommit.Aborted);               // recorded, not undone

            var preInsert = service.RunStage(AutomationStage.PreInsert, block, Ctx());
            Assert.False(preInsert.Success);
            Assert.True(preInsert.Aborted);                 // same script, stage decides
        }

        // ── ctx.Response ──────────────────────────────────────────────────────────

        [Fact]
        public async Task A_script_can_choose_the_message_and_the_redirect_the_visitor_gets()
        {
            var service = Service(null, null);
            var automation = new FormAutomationSettings
            {
                PostCommit = Approved(
                    "ctx.Response.SuccessMessage = \"Your claim reference is CLM-\" + ctx.SubmissionId + \".\";\n" +
                    "ctx.Response.RedirectUrl = \"/thank-you?ref=\" + ctx.SubmissionId;"),
            };
            var (_, _, processor) = Pipeline(service, automation);

            var result = await processor.ProcessAsync(1, Payload(), "1.2.3.4", "test-agent", null);

            Assert.True(result.Success, result.ErrorMessage);
            Assert.Equal("Your claim reference is CLM-" + result.SubmissionId + ".", result.SuccessMessage);
            Assert.Equal("/thank-you?ref=" + result.SubmissionId, result.RedirectUrl);
        }

        [Fact]
        public async Task AsyncWorker_is_enqueued_then_reloads_and_runs_the_current_approved_script()
        {
            var service = Service(null, null);
            var queue = new RecordingAutomationQueue();
            var automation = new FormAutomationSettings
            {
                AsyncWorker = Approved("ctx.SetVariable(\"workerSubmission\", ctx.SubmissionId);")
            };
            var (forms, subs, processor) = Pipeline(service, automation, queue);

            var submit = await processor.ProcessAsync(1, Payload(), "1.2.3.4", "test-agent", null);

            Assert.True(submit.Success, submit.ErrorMessage);
            Assert.NotNull(queue.Last);
            Assert.Equal(submit.SubmissionId, queue.Last.SubmissionId);

            var run = new AutomationAsyncWorker(forms, subs, service).Execute(queue.Last);
            Assert.True(run.Success, run.ErrorMessage);
            Assert.Equal(submit.SubmissionId, Convert.ToInt32(run.Variables["workerSubmission"]));
        }

        [Fact]
        public async Task AsyncWorker_revoked_after_enqueue_is_skipped_by_the_worker()
        {
            var service = Service(null, null);
            var queue = new RecordingAutomationQueue();
            var automation = new FormAutomationSettings
            {
                AsyncWorker = Approved("ctx.Log(\"queued\");")
            };
            var (forms, subs, processor) = Pipeline(service, automation, queue);
            var submit = await processor.ProcessAsync(1, Payload(), "1.2.3.4", "test-agent", null);
            Assert.NotNull(queue.Last);

            var form = forms.GetForm(1);
            var schema = Newtonsoft.Json.JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
            schema.Settings.Automation.AsyncWorker.Enabled = false;
            form.SchemaJson = Newtonsoft.Json.JsonConvert.SerializeObject(schema);
            forms.SaveForm(form);

            var run = new AutomationAsyncWorker(forms, subs, service).Execute(queue.Last);
            Assert.True(run.Skipped);
            Assert.Contains("no longer enabled", run.SkipReason);
        }

        // ── the settings block is server-only ─────────────────────────────────────

        [Fact]
        public void Automation_settings_never_reach_a_public_schema_payload()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField> { new FormField { Key = "email", Type = "Email" } },
                Settings = new FormSettings
                {
                    Automation = new FormAutomationSettings { PostCommit = Approved("ctx.Log(\"x\");") },
                },
            };
            var json = Newtonsoft.Json.JsonConvert.SerializeObject(schema);
            Assert.Contains("automation", json);

            var stripped = FormSchemaSensitivePropertyStripper.Strip(json);

            Assert.DoesNotContain("automation", stripped);
            Assert.DoesNotContain("approvedHash", stripped);
            Assert.DoesNotContain("ctx.Log", stripped);
        }
    }
}
