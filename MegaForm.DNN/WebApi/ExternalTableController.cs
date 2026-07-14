using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;
using MegaForm.Core.Services.ExternalTable;
using MegaForm.DNN.Data;
using MegaForm.DNN.Services;
using Newtonsoft.Json;

namespace MegaForm.WebApi
{
    /// <summary>
    /// [ShellParity v20260714-03] DNN twin of the Oqtane ExternalTableController.
    ///
    /// This existed on Oqtane only, so on DNN the "Capability" button answered 404 ("Could not probe
    /// this table") and the AI-on-rails path (Envelope → blueprint → ApplyBlueprint) had nowhere to
    /// call — pointing a form at an existing customer table simply did not work on this platform.
    ///
    /// Everything that decides anything lives in Core (TableCapabilityProbe, CapabilityDecisionEngine,
    /// AiDesignEnvelope, BlueprintValidator). This controller only supplies the three things that are
    /// genuinely per-platform: identity (admin gate), the connection registry, and the repositories.
    ///
    /// Security shape (Docs/SECURITY_CODING_RULES.md):
    ///  - Administrators only (class-level DnnAuthorize); nothing here is anonymous.
    ///  - The client may name a connection KEY, never a connection string (rule 1), and only a key the
    ///    server allow-listed. The key is never echoed back.
    ///  - Reads/probes are GET; they write nothing and run no DDL. Bind/ApplyBlueprint are POST.
    ///  - SQL errors go to the DNN event log, never to the browser (rule 10).
    ///
    /// Route (catch-all {controller}/{action}): /DesktopModules/MegaForm/API/ExternalTable/{action}
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class ExternalTableController : DnnApiController
    {
        private int CurrentPortalId => PortalSettings?.PortalId ?? 0;

        private static MegaForm.Core.Interfaces.IFormRepository Forms => DnnServiceLocator.Instance.FormRepo;
        private static IExternalBindingStore Bindings => new DnnExternalBindingStore();

        private static string GetHostSetting(string key, string defaultValue = "")
        {
            try
            {
                return DotNetNuke.Entities.Controllers.HostController.Instance
                    .GetString("MegaForm_" + key, null) ?? defaultValue;
            }
            catch { return defaultValue; }
        }

        private static MegaForm.Core.Interfaces.IConnectionRegistry Registry()
            => new DnnConnectionRegistry(GetHostSetting);

        /// <summary>The site DB plus any key an operator allow-listed. A key the operator never listed
        /// can never be probed, whatever the client sends.</summary>
        private static List<string> AllowedConnections()
        {
            var list = new List<string> { "DashboardDatabase" };
            var raw = GetHostSetting("ExternalTables_AllowedConnections") ?? string.Empty;
            foreach (var key in raw.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var k = key.Trim();
                if (k.Length > 0 && !list.Contains(k, StringComparer.OrdinalIgnoreCase)) list.Add(k);
            }
            return list;
        }

        private static bool IsAllowed(string key)
            => !string.IsNullOrWhiteSpace(key)
               && AllowedConnections().Any(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));

        /// <summary>
        /// Every response here is camelCase, because the shared client reads camelCase — Oqtane's
        /// System.Text.Json camelCases by default, DNN's Newtonsoft does NOT. Left alone, the probe
        /// would answer `{"Capabilities":{"Mode":…}}` and the capability card would render blanks
        /// while reporting the table as supported. Same contract, two hosts.
        /// </summary>
        private static readonly JsonSerializerSettings CamelCase = new JsonSerializerSettings
        {
            ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver(),
        };

        private HttpResponseMessage Json(HttpStatusCode status, object payload)
        {
            var response = Request.CreateResponse(status);
            response.Content = new System.Net.Http.StringContent(
                JsonConvert.SerializeObject(payload, CamelCase),
                System.Text.Encoding.UTF8,
                "application/json");
            return response;
        }

        private HttpResponseMessage NotAllowed()
            => Json(HttpStatusCode.BadRequest, new { error = "connection not allowed" });

        private HttpResponseMessage Failed(Exception ex, string what)
        {
            try { DotNetNuke.Services.Exceptions.Exceptions.LogException(ex); } catch { }
            return Json(HttpStatusCode.InternalServerError, new { error = what });
        }

        private CapabilityProfile ProbeOf(string connectionKey, string schema, string table)
        {
            return new TableCapabilityProbe(Registry()).Probe(new ProbeRequest
            {
                ConnectionKey = connectionKey,
                Schema = schema,
                Table = table,
                // P0 contract: the probe reads metadata and samples rows. It never writes, not even
                // inside a rollback.
                AllowBehaviouralProbe = false,
            });
        }

        [HttpGet]
        [ActionName("Connections")]
        public HttpResponseMessage Connections()
            => Json(HttpStatusCode.OK, new { connections = AllowedConnections() });

        /// <summary>Tables AND views — a view is a perfectly good read-only source.</summary>
        [HttpGet]
        [ActionName("Tables")]
        public HttpResponseMessage Tables(string connectionKey)
        {
            if (!IsAllowed(connectionKey)) return NotAllowed();
            try
            {
                var items = new List<object>();
                using (var conn = Registry().GetConnection(connectionKey))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
                                            FROM INFORMATION_SCHEMA.TABLES
                                            WHERE TABLE_NAME NOT LIKE 'sys%' AND TABLE_NAME NOT LIKE 'MS%'
                                            ORDER BY TABLE_SCHEMA, TABLE_NAME";
                        using (var r = cmd.ExecuteReader())
                            while (r.Read())
                                items.Add(new
                                {
                                    schema = r.IsDBNull(0) ? string.Empty : r.GetString(0),
                                    name = r.GetString(1),
                                    type = r.IsDBNull(2) ? "BASE TABLE" : r.GetString(2),
                                });
                    }
                }
                return Json(HttpStatusCode.OK, new { tables = items });
            }
            catch (Exception ex) { return Failed(ex, "could not list tables"); }
        }

        /// <summary>Read-only capability probe — the verdict the Capability card shows.</summary>
        [HttpGet]
        [ActionName("Probe")]
        public HttpResponseMessage Probe(string connectionKey, string schema, string table)
        {
            if (string.IsNullOrWhiteSpace(table))
                return Json(HttpStatusCode.BadRequest, new { error = "table required" });
            if (!IsAllowed(connectionKey)) return NotAllowed();

            try { return Json(HttpStatusCode.OK, Redact(ProbeOf(connectionKey, schema, table))); }
            catch (ArgumentException)
            {
                return Json(HttpStatusCode.BadRequest, new { error = "invalid schema or table name" });
            }
            catch (Exception ex) { return Failed(ex, "probe failed"); }
        }

        /// <summary>The envelope the AI designs against: columns a human may fill in, each with its
        /// verdict already decided. The model never sees the database.</summary>
        [HttpGet]
        [ActionName("Envelope")]
        public HttpResponseMessage Envelope(string connectionKey, string schema, string table)
        {
            if (string.IsNullOrWhiteSpace(table))
                return Json(HttpStatusCode.BadRequest, new { error = "table required" });
            if (!IsAllowed(connectionKey)) return NotAllowed();

            try
            {
                var profile = ProbeOf(connectionKey, schema, table);
                if (profile.Capabilities.Mode == "unsupported")
                    return Json(HttpStatusCode.BadRequest, new { error = "table unsupported" });

                return Json(HttpStatusCode.OK, AiDesignEnvelope.Build(profile));
            }
            catch (ArgumentException)
            {
                return Json(HttpStatusCode.BadRequest, new { error = "invalid schema or table name" });
            }
            catch (Exception ex) { return Failed(ex, "envelope failed"); }
        }

        /// <summary>Deterministic bind: freeze the profile, build the schema, create/update the form.</summary>
        [HttpPost]
        [ActionName("Bind")]
        public HttpResponseMessage Bind([FromBody] BindBody body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.Table))
                return Json(HttpStatusCode.BadRequest, new { error = "table required" });
            if (!IsAllowed(body.ConnectionKey)) return NotAllowed();

            try
            {
                var profile = ProbeOf(body.ConnectionKey, body.Schema, body.Table);
                if (profile.Capabilities.Mode == "unsupported")
                    return Json(HttpStatusCode.BadRequest, new
                    {
                        error = "table unsupported",
                        reasons = profile.Capabilities.Reasons.Select(r => new { r.Code, r.Message, r.HowToFix }),
                    });

                var schema = ExternalSchemaBuilder.Build(profile);
                var formId = SaveBoundForm(body.FormId, body.Title, profile, schema, body.TimeColumnConfirmed);
                if (formId <= 0)
                    return Json(HttpStatusCode.NotFound, new { error = "form not found" });

                return Json(HttpStatusCode.OK, new
                {
                    formId,
                    mode = "readonly",
                    probedMode = profile.Capabilities.Mode,
                    fields = schema.Fields.Count,
                    approxRows = profile.Size.ApproxRows,
                    hash = profile.Hash,
                });
            }
            catch (ArgumentException)
            {
                return Json(HttpStatusCode.BadRequest, new { error = "invalid schema or table name" });
            }
            catch (Exception ex) { return Failed(ex, "bind failed"); }
        }

        /// <summary>
        /// The AI path. The blueprint is checked against a FRESHLY PROBED picture — never against one
        /// the client supplied — so a model that invents a column, picks an unoffered widget or drops a
        /// NOT NULL column is rejected with reasons instead of reaching the customer's table.
        /// </summary>
        [HttpPost]
        [ActionName("ApplyBlueprint")]
        public HttpResponseMessage ApplyBlueprint([FromBody] BlueprintBody body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.Table))
                return Json(HttpStatusCode.BadRequest, new { error = "table required" });
            if (!IsAllowed(body.ConnectionKey)) return NotAllowed();

            try
            {
                var profile = ProbeOf(body.ConnectionKey, body.Schema, body.Table);
                if (profile.Capabilities.Mode == "unsupported")
                    return Json(HttpStatusCode.BadRequest, new { error = "table unsupported" });

                var validation = BlueprintValidator.Validate(body.Blueprint, profile);
                if (!validation.Ok)
                    return Json((HttpStatusCode)422, new
                    {
                        error = "blueprint rejected",
                        errors = validation.Errors.Select(e => new { e.Code, e.Column, e.Message }),
                    });

                var formId = SaveBoundForm(body.FormId, body.Title, profile, validation.Schema, true);
                if (formId <= 0)
                    return Json(HttpStatusCode.NotFound, new { error = "form not found" });

                return Json(HttpStatusCode.OK, new
                {
                    formId,
                    fields = validation.Schema.Fields.Count,
                    mode = "readonly",
                    probedMode = profile.Capabilities.Mode,
                    source = "ai",
                });
            }
            catch (ArgumentException)
            {
                return Json(HttpStatusCode.BadRequest, new { error = "invalid schema or table name" });
            }
            catch (Exception ex) { return Failed(ex, "apply failed"); }
        }

        public class BindBody
        {
            public string ConnectionKey { get; set; }
            public string Schema { get; set; }
            public string Table { get; set; }
            /// <summary>0 → create a new form for this table.</summary>
            public int FormId { get; set; }
            public string Title { get; set; }
            public bool TimeColumnConfirmed { get; set; }
        }

        public class BlueprintBody
        {
            public string ConnectionKey { get; set; }
            public string Schema { get; set; }
            public string Table { get; set; }
            public int FormId { get; set; }
            public string Title { get; set; }
            public BlueprintValidator.Blueprint Blueprint { get; set; }
        }

        /// <summary>Creates (or updates) the form and freezes the binding. Shared by the deterministic
        /// and the AI path so both end up with exactly the same guarantees.</summary>
        private int SaveBoundForm(int formId, string title, CapabilityProfile profile, FormSchema schema, bool timeConfirmed)
        {
            var schemaJson = JsonConvert.SerializeObject(schema);

            if (formId <= 0)
            {
                formId = Forms.SaveForm(new FormInfo
                {
                    PortalId = CurrentPortalId,
                    Title = string.IsNullOrWhiteSpace(title) ? profile.Object.Schema + "." + profile.Object.Name : title,
                    SchemaJson = schemaJson,
                    Status = "Published",
                });
            }
            else
            {
                var form = Forms.GetForm(formId);
                if (form == null) return 0;
                form.SchemaJson = schemaJson;
                Forms.SaveForm(form);
            }

            Bindings.Save(new ExternalBinding
            {
                FormId = formId,
                ConnectionKey = profile.Connection.ConnectionKey,
                Schema = profile.Object.Schema,
                Table = profile.Object.Name,
                ProfileJson = JsonConvert.SerializeObject(profile),
                ProfileHash = profile.Hash,
                // The writer lands in P3. Until then a bound form only reads — claiming otherwise
                // would let a submit fail silently.
                Mode = "readonly",
                TimeColumnConfirmed = timeConfirmed,
            });

            return formId;
        }

        /// <summary>Drops the server-only connection facts. The client still learns the provider and
        /// whether the account is over-privileged — it needs both for honest warnings — but never the
        /// key or the string behind them (rule 1/10).</summary>
        private static object Redact(CapabilityProfile p)
        {
            return new
            {
                profileVersion = p.ProfileVersion,
                hash = p.Hash,
                probedAtUtc = p.ProbedAtUtc,
                coverage = p.Coverage,
                environment = new
                {
                    provider = p.Connection.Provider,
                    productVersion = p.Connection.ProductVersion,
                    updateability = p.Connection.Updateability,
                    isDbOwner = p.Connection.IsDbOwner,
                },
                obj = p.Object,
                permissions = p.Permissions,
                size = p.Size,
                key = p.Key,
                concurrency = p.Concurrency,
                columns = p.Columns,
                indexes = p.Indexes,
                fullText = p.FullText,
                relations = p.Relations,
                semantics = p.Semantics,
                capabilities = p.Capabilities,
                policy = p.Policy,
            };
        }
    }
}
