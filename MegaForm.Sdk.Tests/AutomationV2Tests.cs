/*
 * MegaForm.Sdk.Tests/AutomationV2Tests.cs
 *
 * [Automation v2 20260813-01] The seven claims the feature makes, as tests.
 *
 * Four of them are security claims and they are the reason this file exists: a capability rail that
 * is only true in the documentation is worse than no rail, because it is sold as one. The other
 * three are behavioural claims about the lifecycle — in particular that a PreInsert abort really
 * stops the row, and a PostCommit failure really does not.
 *
 * The lifecycle tests drive a real SubmissionProcessor over the in-memory repositories rather than
 * asserting on the service in isolation: "the pipeline honours the abort" is exactly the part that
 * could be wired wrong while every unit still passes.
 */

using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
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

        private sealed class RecordingEmailSender : IEmailSender
        {
            public string To { get; private set; }
            public string Subject { get; private set; }
            public string Body { get; private set; }
            public void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null)
            {
                To = to;
                Subject = subject;
                Body = htmlBody;
            }
            public string GetHostEmail() => "host@example.test";
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

        // ── 3. raw .NET stays closed ──────────────────────────────────────────────

        [Theory]
        [InlineData("var c = new System.Net.Http.HttpClient();")]
        [InlineData("var c = new System.Data.SqlClient.SqlConnection(\"Server=.;\");")]
        [InlineData("var t = new System.Data.DataTable();")]
        [InlineData("System.IO.File.WriteAllText(@\"c:\\x.txt\", \"hi\");")]
        [InlineData("System.Diagnostics.Process.Start(\"powershell.exe\", \"-c whoami\");")]
        [InlineData("var a = typeof(string).Assembly;")]
        [InlineData("var d = System.Activator.CreateInstance(typeof(object));")]
        // The rail is async, so Task has to be nameable — but not the members that start work
        // outliving the submission, because neither the timeout nor the audit trail can follow it.
        [InlineData("System.Threading.Tasks.Task.Run(() => ctx.Log(\"later\"));")]
        [InlineData("System.Threading.Tasks.Parallel.For(0, 10, i => ctx.Log(i.ToString()));")]
        [InlineData("var t = new System.Threading.Thread(() => ctx.Log(\"x\")); t.Start();")]
        public void Raw_dotnet_surfaces_are_refused_at_compile_time(string source)
        {
            var result = Compiler.Compile(source, "test");

            Assert.False(result.Success, "Expected this to be refused: " + source);
            Assert.Null(result.Script);
            Assert.Contains(result.Diagnostics, d => d.Severity == "error");
        }

        // ── 4. a named DB action runs ─────────────────────────────────────────────

        [Fact]
        public void Named_db_action_runs_and_writes_the_row()
        {
            using var registry = new SqliteRegistry();
            var service = Service(registry, CatalogWithLeadAction());

            var block = Approved(
                "var r = ctx.Actions.ExecuteNamedActionAsync(\"insert-lead\",\n" +
                "    new { email = ctx.GetString(\"email\"), score = 70 }).Result;\n" +
                "ctx.SetVariable(\"rows\", r.RowsAffected);\n" +
                "var total = ctx.Actions.ExecuteNamedActionAsync(\"count-leads\").Result;\n" +
                "ctx.SetVariable(\"total\", total.ScalarValue);");

            var ctx = Ctx();
            var run = service.RunStage(AutomationStage.PostCommit, block, ctx);

            Assert.True(run.Success, run.ErrorMessage);
            Assert.Equal(1, Convert.ToInt32(ctx.Variables["rows"]));
            Assert.Equal(1, Convert.ToInt32(ctx.Variables["total"]));
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

        [Fact]
        public void Awaiting_a_capability_compiles_because_Task_itself_is_reachable()
        {
            // The counterpart to the theory above: denying all of System.Threading made the whole
            // capability rail uncallable, which the test suite found before anyone shipped it.
            var result = Compiler.Compile(
                "var r = ctx.Actions.ExecuteNamedActionAsync(\"insert-lead\", new { email = \"a@b.c\" }).Result;\n" +
                "ctx.SetVariable(\"rows\", r.RowsAffected);", "test");

            Assert.True(result.Success,
                result.Diagnostics.FirstOrDefault(d => d.Severity == "error")?.Message ?? "compiled");
        }

        [Fact]
        public void Body_scripts_can_use_native_await_and_receive_the_run_cancellation_token()
        {
            using var registry = new SqliteRegistry();
            var service = Service(registry, CatalogWithLeadAction());
            var block = Approved(
                "var r = await ctx.Actions.ExecuteNamedActionAsync(\"insert-lead\",\n" +
                "    new { email = ctx.GetString(\"email\"), score = 88 }, ct);\n" +
                "ctx.SetVariable(\"rows\", r.RowsAffected);");
            var ctx = Ctx();

            var run = service.RunStage(AutomationStage.PostCommit, block, ctx);

            Assert.True(run.Success, run.ErrorMessage);
            Assert.Equal(1, Convert.ToInt32(ctx.Variables["rows"]));
            Assert.Equal(1, registry.CountLeads());
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
        public void A_script_can_name_an_endpoint_but_can_never_read_its_secret()
        {
            // The catalog holds a bearer token. It is attached on the way out and is not reachable
            // from a script: ctx.Api exposes names and results, never the endpoint definition.
            var compiled = Compiler.Compile(
                "var names = ctx.Api.EndpointNames();\nctx.SetVariable(\"count\", names.Count);", "test");
            Assert.True(compiled.Success);

            var reachesTheSecret = Compiler.Compile(
                "var e = ctx.Api.GetEndpoint(\"crm-lead\").AuthValue;", "test");
            Assert.False(reachesTheSecret.Success);   // no such member exists to compile against

            // And the admin-facing copy is masked.
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
        public void Named_email_template_is_rendered_by_the_site_sender_and_script_html_is_encoded()
        {
            var sender = new RecordingEmailSender();
            var catalog = new AutomationCatalog
            {
                NotificationTemplates =
                {
                    new NamedNotificationTemplate
                    {
                        Name = "approval-request", Channel = "email",
                        Subject = "Review {{reference}}",
                        Body = "<p>Hello {{name}}</p>"
                    }
                }
            };
            var service = new AfterSubmitScriptService(Compiler, null, null, null,
                new FixedCatalog(catalog), () => new AutomationCapabilityServices { EmailSender = sender });
            var block = Approved(
                "await ctx.Notify.EmailAsync(\"approval-request\", \"manager@example.test\",\n" +
                "    new { reference = \"CLM-42\", name = \"<Admin>\" }, ct);");

            var run = service.RunStage(AutomationStage.PostCommit, block, Ctx());

            Assert.True(run.Success, run.ErrorMessage);
            Assert.Equal("manager@example.test", sender.To);
            Assert.Equal("Review CLM-42", sender.Subject);
            Assert.Contains("&lt;Admin&gt;", sender.Body);
            Assert.DoesNotContain("<Admin>", sender.Body);
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
