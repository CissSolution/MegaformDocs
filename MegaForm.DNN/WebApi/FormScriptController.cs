/*
 * MegaForm.DNN/WebApi/FormScriptController.cs
 *
 * [AfterSubmitScript v20260813-01] Host-only authoring endpoint for the after-submit C#
 * hook, DNN half.
 *
 *   GET  /DesktopModules/MegaForm/API/FormScript/Get?formId=8
 *   POST /DesktopModules/MegaForm/API/FormScript/Validate   { formId, source }
 *   POST /DesktopModules/MegaForm/API/FormScript/Save       { formId, source, enabled, onFailure, timeoutSeconds }
 *   POST /DesktopModules/MegaForm/API/FormScript/TestRun    { formId, source, sampleData }
 *   GET  /DesktopModules/MegaForm/API/FormScript/Runs?formId=8
 *
 * No route registration needed — the generic catch-all {controller}/{action}/{id} in
 * MegaFormRouteMapper covers these, which also avoids the duplicate-routeName trap where
 * the LATER route silently never matches.
 *
 * ── Authority ───────────────────────────────────────────────────────────────────
 * [DnnModuleAuthorize(Edit)] is the ROUTE guard and is nowhere near sufficient on its own:
 * "edit module" is a content-editor permission, and this endpoint compiles and stores code
 * the server will execute. Every action therefore starts with RequireHost(), which demands
 * UserInfo.IsSuperUser AND the host-level feature switch. And even that is not the last
 * line: what actually makes a stored script runnable is the approval hash written here,
 * checked again at submit time by AfterSubmitScriptGuard.IsRunnable. Losing this attribute
 * in a refactor would be a bug; it would not be an RCE.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Scripting;
using MegaForm.Core.Services;
using MegaForm.DNN.Data;
using MegaForm.DNN.Services;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    // [DnnAuthorize] and not [DnnModuleAuthorize]: this endpoint is host-scoped, not
    // module-scoped. DnnModuleAuthorize resolves permissions from a ModuleId/TabId header pair
    // that a host-level tool has no reason to carry, and answers 401 without them — which reads
    // as "the host is not allowed", not as "you addressed the wrong scope". The class attribute
    // establishes *authenticated*; RequireHost() below establishes *host*, server-side, on every
    // single action, which is the check that actually matters.
    [DnnAuthorize]
    public class FormScriptController : DnnApiController
    {
        private const string ScriptDocsUrl = "https://dnndefender.com/MegaFormDocsT?doc=after-submit-script";

        // ─── authority ────────────────────────────────────────────────────────────

        /// <summary>
        /// web.config: &lt;appSettings&gt;&lt;add key="MegaForm:AfterSubmitScriptEnabled" value="true" /&gt;
        ///
        /// Deliberately web.config and NOT a Host Settings row, even though Host Settings would
        /// be a nicer click. Switching this on lets a person compile and run C# in the site's own
        /// process; the right bar for that is "can edit files on the server", which is a strictly
        /// smaller group than "holds the superuser password". It also means enabling the feature
        /// recycles the application, so the switch takes effect at a moment the host chose.
        ///
        /// Absent, unreadable, or anything other than "true" = off. Every install ships off.
        /// </summary>
        private static bool FeatureEnabled()
        {
            try
            {
                // DNN's own appSettings reader — MegaForm.DNN does not reference
                // System.Configuration directly, and Config.GetSetting is what the rest of the
                // platform uses for exactly this.
                var raw = DotNetNuke.Common.Utilities.Config.GetSetting(
                    AfterSubmitScriptGuard.EnabledSettingKey);
                return !string.IsNullOrWhiteSpace(raw) &&
                       raw.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }   // unreadable config = off
        }

        /// <summary>
        /// Returns null when the caller may author. Otherwise the response to send back.
        /// The two refusals say different things on purpose: a site admin who is not a
        /// superuser needs to know it is their ROLE, and a superuser on a site with the
        /// switch off needs to know it is the SWITCH — otherwise both look like "broken".
        /// </summary>
        private HttpResponseMessage RequireHost()
        {
            var isHost = UserInfo != null && UserInfo.IsSuperUser;
            var enabled = FeatureEnabled();

            if (AfterSubmitScriptGuard.CanAuthor(isHost, enabled)) return null;

            if (!isHost)
            {
                return Request.CreateResponse(HttpStatusCode.Forbidden, new
                {
                    error = "host_only",
                    message = "After-submit scripts can only be viewed or changed by a host (superuser) account. " +
                              "Saving a script means running code on this server, so module-edit permission is not enough.",
                    docsUrl = ScriptDocsUrl
                });
            }

            return Request.CreateResponse(HttpStatusCode.Forbidden, new
            {
                error = "feature_disabled",
                message = "Server-side scripting is switched off on this installation. Add " +
                          "<add key=\"" + AfterSubmitScriptGuard.EnabledSettingKey + "\" value=\"true\" /> to " +
                          "<appSettings> in web.config. The site restarts when you save the file.",
                settingKey = AfterSubmitScriptGuard.EnabledSettingKey,
                docsUrl = ScriptDocsUrl
            });
        }

        private static AfterSubmitScriptService Service
        {
            get { return DnnServiceLocator.Instance.AfterSubmitScript; }
        }

        // ─── GET Get ──────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(int formId)
        {
            var denied = RequireHost();
            if (denied != null) return denied;

            var form = FormRepository.GetForm(formId);
            if (form == null)
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Form not found." });

            var block = AfterSubmitScriptStore.Read(form.SchemaJson, form.SettingsJson)
                        ?? new FormAfterSubmitScriptSettings();

            string runnableReason;
            var runnable = AfterSubmitScriptGuard.IsRunnable(block, out runnableReason);

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                formId,
                formTitle = form.Title,
                block.Enabled,
                block.Source,
                block.OnFailure,
                timeoutSeconds = AfterSubmitScriptGuard.ResolveTimeoutSeconds(block),
                approvedBy = block.ApprovedByUserName,
                approvedOnUtc = block.ApprovedOnUtc,
                runnable,
                runnableReason,
                compilerAvailable = Service != null && Service.IsCompilerAvailable,
                fieldKeys = FieldKeys(form),
                maxSourceChars = AfterSubmitScriptGuard.MaxSourceChars,
                docsUrl = ScriptDocsUrl
            });
        }

        // ─── POST Validate ────────────────────────────────────────────────────────

        [HttpPost]
        [ActionName("Validate")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Validate([FromBody] JObject body)
        {
            var denied = RequireHost();
            if (denied != null) return denied;

            var source = body == null ? null : body.Value<string>("source");
            var formId = body == null ? 0 : (body.Value<int?>("formId") ?? 0);

            if (Service == null || !Service.IsCompilerAvailable)
                return CompilerMissing();

            var compile = Service.Validate(source, "form" + formId + "-afterSubmit");
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = compile.Success,
                diagnostics = compile.Diagnostics,
                hash = compile.Hash
            });
        }

        // ─── POST Save ────────────────────────────────────────────────────────────

        [HttpPost]
        [ActionName("Save")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Save([FromBody] JObject body)
        {
            var denied = RequireHost();
            if (denied != null) return denied;

            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Missing body." });

            var formId = body.Value<int?>("formId") ?? 0;
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId is required." });

            var form = FormRepository.GetForm(formId);
            if (form == null)
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Form not found." });

            var source = body.Value<string>("source") ?? string.Empty;
            var enabled = body.Value<bool?>("enabled") ?? false;
            var onFailure = (body.Value<string>("onFailure") ?? "continue").Trim();
            var timeout = body.Value<int?>("timeoutSeconds") ?? AfterSubmitScriptGuard.DefaultTimeoutSeconds;

            if (source.Length > AfterSubmitScriptGuard.MaxSourceChars)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    error = "too_long",
                    message = "Script is longer than the " + AfterSubmitScriptGuard.MaxSourceChars + " character limit."
                });

            // Clearing the editor removes the hook outright rather than storing an approved
            // empty script — an empty approved block would look configured in the UI and do
            // nothing at runtime, which is the exact ambiguity this feature must not have.
            if (string.IsNullOrWhiteSpace(source))
            {
                PersistBlock(form, null);
                Service?.RecordApproval(formId, null, UserInfo.UserID, UserInfo.Username, 0, "removed");
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    removed = true,
                    message = "After-submit script removed."
                });
            }

            if (Service == null || !Service.IsCompilerAvailable)
                return CompilerMissing();

            // Compile BEFORE approving. A script that does not compile is never written with an
            // approval, so it can never become the "approved but broken" state the runtime would
            // then have to report on every single submission.
            var compile = Service.Validate(source, "form" + formId + "-afterSubmit");
            if (!compile.Success)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    error = "compile_failed",
                    message = "The script did not compile. Nothing was saved.",
                    diagnostics = compile.Diagnostics
                });
            }

            var block = new FormAfterSubmitScriptSettings
            {
                Enabled = enabled,
                Language = "csharp",
                Source = source,
                OnFailure = onFailure.Equals("report", StringComparison.OrdinalIgnoreCase) ? "report" : "continue",
                TimeoutSeconds = timeout
            };
            block.TimeoutSeconds = AfterSubmitScriptGuard.ResolveTimeoutSeconds(block);
            AfterSubmitScriptGuard.Approve(block, UserInfo.UserID, UserInfo.Username, DateTime.UtcNow);

            PersistBlock(form, block);
            Service.RecordApproval(formId, block.ApprovedHash, UserInfo.UserID, UserInfo.Username,
                source.Length, enabled ? "approved-enabled" : "approved-disabled");

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                hash = block.ApprovedHash,
                approvedBy = block.ApprovedByUserName,
                approvedOnUtc = block.ApprovedOnUtc,
                enabled = block.Enabled,
                timeoutSeconds = block.TimeoutSeconds,
                diagnostics = compile.Diagnostics,   // warnings survive a successful save
                message = enabled
                    ? "Script saved and switched on for this form."
                    : "Script saved. It is switched off, so it will not run yet."
            });
        }

        // ─── POST TestRun ─────────────────────────────────────────────────────────

        [HttpPost]
        [ActionName("TestRun")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage TestRun([FromBody] JObject body)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (Service == null || !Service.IsCompilerAvailable) return CompilerMissing();

            var formId = body == null ? 0 : (body.Value<int?>("formId") ?? 0);
            var source = body == null ? null : body.Value<string>("source");

            var compile = Service.Validate(source, "form" + formId + "-afterSubmit-test");
            if (!compile.Success)
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = false,
                    compiled = false,
                    diagnostics = compile.Diagnostics
                });

            // Sample values come from the caller so a host can try a script against the shape of
            // data they expect. Nothing is persisted and no submission is created — this runs the
            // same compiled delegate the pipeline would, against made-up input.
            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            var sample = body["sampleData"] as JObject;
            if (sample != null)
                foreach (var p in sample.Properties())
                    data[p.Name] = p.Value == null ? null : p.Value.ToObject<object>();

            var form = formId > 0 ? FormRepository.GetForm(formId) : null;
            var ctx = new SubmissionScriptContext(data)
            {
                FormId = formId,
                SubmissionId = 0,
                PortalId = form != null ? form.PortalId : 0,
                FormTitle = form != null ? form.Title : "(test)",
                UserId = UserInfo.UserID,
                UserName = UserInfo.Username,
                UserEmail = UserInfo.Email,
                IpAddress = string.Empty,
                UtcNow = DateTime.UtcNow
            };

            var probe = new FormAfterSubmitScriptSettings { Enabled = true, Source = source };
            AfterSubmitScriptGuard.Approve(probe, UserInfo.UserID, UserInfo.Username, DateTime.UtcNow);
            var run = Service.Run(probe, ctx);

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = run.Success,
                compiled = true,
                skipped = run.Skipped,
                skipReason = run.SkipReason,
                error = run.ErrorMessage,
                durationMs = run.DurationMs,
                log = run.Log,
                variables = run.Variables,
                diagnostics = compile.Diagnostics
            });
        }

        // ─── GET / POST Catalog ───────────────────────────────────────────────────

        /// <summary>
        /// The site's automation catalog — the named SQL actions and HTTP endpoints every script
        /// resolves against. Host-only, like everything else here, because the catalog is the list
        /// of things scripts are permitted to do.
        ///
        /// Always returned REDACTED: bearer tokens are replaced by "***". Save sends the mask back
        /// unchanged for values it did not edit, and the save path restores the stored secret.
        /// </summary>
        [HttpGet]
        [ActionName("Catalog")]
        public HttpResponseMessage GetCatalog()
        {
            var denied = RequireHost();
            if (denied != null) return denied;

            var catalog = MegaForm.Core.Automation.AutomationCatalog.Parse(ReadCatalogJson());
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                catalog = catalog.Redacted(),
                connectionNames = ConnectionNamesForPortal(),
                docsUrl = ScriptDocsUrl
            });
        }

        [HttpPost]
        [ActionName("Catalog")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SaveCatalog([FromBody] JObject body)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Missing body." });

            MegaForm.Core.Automation.AutomationCatalog incoming;
            try
            {
                var token = body["catalog"] ?? body;
                incoming = MegaForm.Core.Automation.AutomationCatalog.Parse(token.ToString());
            }
            catch
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Catalog is not valid JSON." });
            }

            // Restore any secret the editor sent back as the mask. Without this, opening the editor
            // and pressing Save would replace every token with the literal "***" — the classic way
            // a masked field destroys the value it was protecting.
            var stored = MegaForm.Core.Automation.AutomationCatalog.Parse(ReadCatalogJson());
            foreach (var endpoint in incoming.Endpoints)
            {
                if (endpoint == null) continue;
                if (endpoint.AuthValue != MegaForm.Core.Automation.AutomationCatalog.MaskedValue) continue;
                var previous = stored.FindEndpoint(endpoint.Name);
                endpoint.AuthValue = previous != null ? previous.AuthValue : null;
            }

            WriteCatalogJson(Newtonsoft.Json.JsonConvert.SerializeObject(incoming));

            DnnAutomationAuditStore.RecordCatalogChange(
                ResolvePortalId(), UserInfo.UserID, UserInfo.Username,
                incoming.DbActions.Count, incoming.Endpoints.Count);

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                dbActions = incoming.DbActions.Count,
                endpoints = incoming.Endpoints.Count,
                message = "Automation catalog saved."
            });
        }

        private static int ResolvePortalId()
        {
            try { return DotNetNuke.Entities.Portals.PortalSettings.Current?.PortalId ?? 0; }
            catch { return 0; }
        }

        private static string ReadCatalogJson()
        {
            try
            {
                return DotNetNuke.Entities.Portals.PortalController.GetPortalSetting(
                    MegaForm.Core.Automation.AutomationCatalog.SettingKey, ResolvePortalId(), string.Empty);
            }
            catch { return string.Empty; }
        }

        private static void WriteCatalogJson(string json)
        {
            DotNetNuke.Entities.Portals.PortalController.UpdatePortalSetting(
                ResolvePortalId(), MegaForm.Core.Automation.AutomationCatalog.SettingKey, json, true);
        }

        /// <summary>Connection names an action may target, so the editor can offer a list.</summary>
        private static List<string> ConnectionNamesForPortal()
        {
            var names = new List<string> { "DashboardDatabase" };
            try
            {
                var json = DnnConnectionRegistry.ReadNamedConnectionsJson();
                if (!string.IsNullOrWhiteSpace(json))
                {
                    var parsed = JObject.Parse(json);
                    foreach (var p in parsed.Properties())
                        if (!names.Contains(p.Name)) names.Add(p.Name);
                }
            }
            catch { }
            return names;
        }

        // ─── GET Runs ─────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("Runs")]
        public HttpResponseMessage Runs(int formId, int take = 25)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (take <= 0 || take > 200) take = 25;
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                formId,
                runs = DnnAutomationAuditStore.ListRuns(formId, take),
                approvals = DnnAutomationAuditStore.ListApprovals(formId, take)
            });
        }

        // ─── helpers ──────────────────────────────────────────────────────────────

        private HttpResponseMessage CompilerMissing()
        {
            return Request.CreateResponse(HttpStatusCode.ServiceUnavailable, new
            {
                error = "compiler_missing",
                message = "MegaForm.Scripting.dll is not installed in this site's bin folder, so scripts " +
                          "cannot be compiled or run. Install the MegaForm Scripting add-on.",
                docsUrl = ScriptDocsUrl
            });
        }

        private static void PersistBlock(FormInfo form, FormAfterSubmitScriptSettings block)
        {
            string schemaJson, settingsJson;
            AfterSubmitScriptStore.Write(form.SchemaJson, form.SettingsJson, block, out schemaJson, out settingsJson);
            form.SchemaJson = schemaJson;
            form.SettingsJson = settingsJson;
            FormRepository.SaveForm(form);
        }

        /// <summary>Field keys, so the editor can offer them instead of making a host guess.</summary>
        private static List<string> FieldKeys(FormInfo form)
        {
            var keys = new List<string>();
            try
            {
                var schema = Newtonsoft.Json.JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
                if (schema?.Fields != null)
                    keys.AddRange(schema.Fields
                        .Where(f => f != null && !string.IsNullOrWhiteSpace(f.Key))
                        .Select(f => f.Key));
            }
            catch { }
            return keys;
        }
    }
}
