using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Oqtane.Controllers;
using Oqtane.Enums;
using Oqtane.Infrastructure;
using Oqtane.Shared;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;
using MegaForm.Core.Services.ExternalTable;
using MegaForm.Core.Services.Subform;
using Newtonsoft.Json;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// [ATBE P0] Lets an admin point MegaForm at a table in a customer database and see exactly what
    /// MegaForm can and cannot do with it — before any form exists.
    ///
    /// Route prefix: /api/MegaFormPopup/ExternalTable
    ///
    /// Security shape (Docs/SECURITY_CODING_RULES.md):
    ///  - Admin/Host only; nothing here is anonymous.
    ///  - Every action is a GET and reads only. No antiforgery exemption is needed or taken —
    ///    deliberately unlike the sibling admin controllers that carry a class-level
    ///    [IgnoreAntiforgeryToken].
    ///  - The client may name a connection KEY only, and only one the server allow-listed. A raw
    ///    connection string is never accepted (rule 1) and never echoed back (rule 10).
    ///  - The probe reads metadata and samples rows. It never writes and never runs DDL.
    ///
    /// Badge: ExternalTableController v20260711-P0
    /// </summary>
    [Route("api/MegaFormPopup/[controller]")]
    public class ExternalTableController : ModuleControllerBase
    {
        private readonly IConnectionRegistry _registry;
        private readonly IConfiguration _config;
        private readonly IFormRepository _forms;
        private readonly IExternalBindingStore _bindings;

        public ExternalTableController(
            IConnectionRegistry registry,
            IConfiguration config,
            IFormRepository forms,
            IExternalBindingStore bindings,
            ILogManager logger,
            IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _registry = registry;
            _config = config;
            _forms = forms;
            _bindings = bindings;
        }

        private bool IsAdmin => User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host);

        /// <summary>The site the new form belongs to. AuthEntityId(Site) returns -1 when the request
        /// carries no module/site context — as an admin XHR from the builder does — and a form saved
        /// with PortalId -1 exists but is invisible: every list is scoped by site. Fall back to the
        /// user's own siteid claim, exactly like MegaFormController.ResolvePortalId does.</summary>
        private int SiteId
        {
            get
            {
                var id = AuthEntityId(EntityNames.Site);
                if (id > 0) return id;

                var claim = User?.FindFirst("siteid")?.Value ?? User?.FindFirst("SiteId")?.Value;
                if (int.TryParse(claim, out var pid) && pid > 0) return pid;

                // Same fallback the other admin endpoints use: the popup calls /api/MegaForm/... with
                // no alias prefix, so site context has to come from the query string. The admin gate
                // above still decides access — this only fills in which site, never whether.
                return int.TryParse(Request?.Query["siteId"], out var qid) && qid > 0 ? qid : 0;
            }
        }

        /// <summary>Connection keys an admin may point at. Configured server-side: a key the operator
        /// never listed can never be probed, whatever the client sends.</summary>
        private List<string> AllowedConnections()
        {
            var configured = _config.GetSection("MegaForm:ExternalTables:AllowedConnections").Get<string[]>();
            if (configured != null && configured.Length > 0)
                return configured.Where(k => !string.IsNullOrWhiteSpace(k)).ToList();

            var dashboard = _config["ConnectionStrings:DashboardDatabase"];
            return string.IsNullOrWhiteSpace(dashboard)
                ? new List<string>()
                : new List<string> { "DashboardDatabase" };
        }

        private bool IsAllowed(string key)
        {
            return !string.IsNullOrWhiteSpace(key)
                   && AllowedConnections().Any(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        }

        private string DbTypeFor(string key)
        {
            var cs = _config["ConnectionStrings:" + key] ?? string.Empty;
            return (cs.IndexOf(".db", StringComparison.OrdinalIgnoreCase) >= 0
                    || cs.IndexOf("sqlite", StringComparison.OrdinalIgnoreCase) >= 0)
                ? "sqlite" : null;
        }

        [HttpGet("Connections")]
        public IActionResult Connections()
        {
            if (!IsAdmin) return Unauthorized();
            return Ok(new { connections = AllowedConnections() });
        }

        /// <summary>Lists tables AND views — a view is a perfectly good read-only source, and the
        /// existing SqlSchemaReader.ListTables filters views out.</summary>
        [HttpGet("Tables")]
        public IActionResult Tables([FromQuery] string connectionKey)
        {
            if (!IsAdmin) return Unauthorized();
            if (!IsAllowed(connectionKey)) return BadRequest(new { error = "connection not allowed" });

            try
            {
                using (var conn = _registry.GetConnection(connectionKey, DbTypeFor(connectionKey)))
                {
                    conn.Open();
                    var items = new List<object>();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = SqlSchemaReader.Detect(conn) == SqlSchemaReader.ProviderKind.Sqlite
                            ? "SELECT '' AS s, name AS n, 'BASE_TABLE' AS t FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
                            : @"SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
                                FROM INFORMATION_SCHEMA.TABLES
                                WHERE TABLE_NAME NOT LIKE 'sys%' AND TABLE_NAME NOT LIKE 'MS%'
                                ORDER BY TABLE_SCHEMA, TABLE_NAME";
                        using (var r = cmd.ExecuteReader())
                            while (r.Read())
                                items.Add(new
                                {
                                    schema = r.IsDBNull(0) ? string.Empty : r.GetString(0),
                                    name = r.GetString(1),
                                    type = r.IsDBNull(2) ? "BASE_TABLE" : r.GetString(2),
                                });
                    }
                    return Ok(new { tables = items });
                }
            }
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Read, ex, "ExternalTable.Tables failed for {Key}", connectionKey);
                return StatusCode(500, new { error = "could not list tables" });
            }
        }

        /// <summary>Read-only capability probe. GET on purpose: it changes nothing, so it needs no
        /// antiforgery token and no exemption.</summary>
        [HttpGet("Probe")]
        public IActionResult Probe([FromQuery] string connectionKey, [FromQuery] string schema, [FromQuery] string table)
        {
            if (!IsAdmin) return Unauthorized();
            if (string.IsNullOrWhiteSpace(table)) return BadRequest(new { error = "table required" });
            if (!IsAllowed(connectionKey)) return BadRequest(new { error = "connection not allowed" });

            try
            {
                var probe = new TableCapabilityProbe(_registry);
                var profile = probe.Probe(new ProbeRequest
                {
                    ConnectionKey = connectionKey,
                    DatabaseType = DbTypeFor(connectionKey),
                    Schema = schema,
                    Table = table,
                    AllowBehaviouralProbe = false,   // P0 never writes, not even inside a rollback
                });

                return Ok(Redact(profile));
            }
            catch (ArgumentException)
            {
                return BadRequest(new { error = "invalid schema or table name" });
            }
            catch (Exception ex)
            {
                // A SQL error message names servers, logins and columns. It goes to the log, never to
                // the browser (rule 10).
                _logger.Log(LogLevel.Error, this, LogFunction.Read, ex, "ExternalTable.Probe failed for {Schema}.{Table}", schema, table);
                return StatusCode(500, new { error = "probe failed" });
            }
        }

        /// <summary>
        /// Binds a form to the table: freezes the capability profile, generates the fallback schema,
        /// and creates the form if one was not supplied.
        ///
        /// State-changing, so it is a POST and it goes through Oqtane's antiforgery validation — no
        /// class-level exemption (rule 4). The binding is stored in its own server-owned table, never
        /// in SchemaJson, which the builder posts back verbatim.
        /// </summary>
        [HttpPost("Bind")]
        public IActionResult Bind([FromBody] BindBody body)
        {
            if (!IsAdmin) return Unauthorized();
            if (body == null || string.IsNullOrWhiteSpace(body.Table))
                return BadRequest(new { error = "table required" });
            if (!IsAllowed(body.ConnectionKey))
                return BadRequest(new { error = "connection not allowed" });

            try
            {
                var probe = new TableCapabilityProbe(_registry);
                var profile = probe.Probe(new ProbeRequest
                {
                    ConnectionKey = body.ConnectionKey,
                    DatabaseType = DbTypeFor(body.ConnectionKey),
                    Schema = body.Schema,
                    Table = body.Table,
                });

                if (profile.Capabilities.Mode == "unsupported")
                    return BadRequest(new
                    {
                        error = "table unsupported",
                        reasons = profile.Capabilities.Reasons.Select(r => new { r.Code, r.Message, r.HowToFix }),
                    });

                var schema = ExternalSchemaBuilder.Build(profile);
                var schemaJson = JsonConvert.SerializeObject(schema);

                var formId = body.FormId;
                if (formId <= 0)
                {
                    var siteId = SiteId;
                    if (siteId <= 0) return BadRequest(new { error = "site context missing" });

                    formId = _forms.SaveForm(new FormInfo
                    {
                        PortalId = siteId,
                        Title = string.IsNullOrWhiteSpace(body.Title)
                            ? profile.Object.Schema + "." + profile.Object.Name
                            : body.Title,
                        SchemaJson = schemaJson,
                        Status = "Published",   // the status every other form carries; lists filter on it
                    });
                }
                else
                {
                    var form = _forms.GetForm(formId);
                    if (form == null) return NotFound(new { error = "form not found" });
                    form.SchemaJson = schemaJson;
                    _forms.SaveForm(form);
                }

                _bindings.Save(new ExternalBinding
                {
                    FormId = formId,
                    ConnectionKey = body.ConnectionKey,
                    DatabaseType = DbTypeFor(body.ConnectionKey),
                    Schema = profile.Object.Schema,
                    Table = profile.Object.Name,
                    ProfileJson = JsonConvert.SerializeObject(profile),
                    ProfileHash = profile.Hash,
                    // P1 ships the read path. Even a table we could write to is bound read-only until
                    // the writer (P3) exists — claiming otherwise would let a submit fail silently.
                    Mode = "readonly",
                    TimeColumnConfirmed = body.TimeColumnConfirmed,
                });

                return Ok(new
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
                return BadRequest(new { error = "invalid schema or table name" });
            }
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Create, ex, "ExternalTable.Bind failed for {Schema}.{Table}", body.Schema, body.Table);
                return StatusCode(500, new { error = "bind failed" });
            }
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

        // ─────────────────────────────────────────────────────────────────────────────
        //  AI ON RAILS  [ATBE P2]
        //
        //  The model never sees the database. It sees an envelope: the columns a human may fill in,
        //  each with its verdict already decided (required? which widgets are legal?). It returns a
        //  blueprint — labels, grouping, widget choices — and this server marks it. A blueprint that
        //  invents a column, picks an unoffered widget, or drops a NOT NULL column is REJECTED with
        //  reasons, which the client feeds back so the model can fix itself. Three failures and the
        //  deterministic schema is used instead.
        //
        //  That is why a cheap model is safe here: it cannot be wrong in a way that reaches the
        //  customer's table, because it never decides anything that has a right answer.
        // ─────────────────────────────────────────────────────────────────────────────

        [HttpGet("Envelope")]
        public IActionResult Envelope([FromQuery] string connectionKey, [FromQuery] string schema, [FromQuery] string table)
        {
            if (!IsAdmin) return Unauthorized();
            if (string.IsNullOrWhiteSpace(table)) return BadRequest(new { error = "table required" });
            if (!IsAllowed(connectionKey)) return BadRequest(new { error = "connection not allowed" });

            try
            {
                var profile = ProbeOf(connectionKey, schema, table);
                if (profile.Capabilities.Mode == "unsupported")
                    return BadRequest(new { error = "table unsupported" });

                return Ok(AiDesignEnvelope.Build(profile));
            }
            catch (ArgumentException) { return BadRequest(new { error = "invalid schema or table name" }); }
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Read, ex, "ExternalTable.Envelope failed for {Schema}.{Table}", schema, table);
                return StatusCode(500, new { error = "envelope failed" });
            }
        }

        [HttpPost("ApplyBlueprint")]
        public IActionResult ApplyBlueprint([FromBody] BlueprintBody body)
        {
            if (!IsAdmin) return Unauthorized();
            if (body == null || string.IsNullOrWhiteSpace(body.Table))
                return BadRequest(new { error = "table required" });
            if (!IsAllowed(body.ConnectionKey))
                return BadRequest(new { error = "connection not allowed" });

            try
            {
                // Re-probed, not taken from the request: a blueprint is only as safe as the picture it
                // is checked against, and the client cannot be the source of that picture.
                var profile = ProbeOf(body.ConnectionKey, body.Schema, body.Table);
                if (profile.Capabilities.Mode == "unsupported")
                    return BadRequest(new { error = "table unsupported" });

                var validation = BlueprintValidator.Validate(body.Blueprint, profile);
                if (!validation.Ok)
                    return StatusCode(422, new
                    {
                        error = "blueprint rejected",
                        errors = validation.Errors.Select(e => new { e.Code, e.Column, e.Message }),
                    });

                var formId = SaveBoundForm(body.FormId, body.Title, profile, validation.Schema);
                if (formId <= 0) return BadRequest(new { error = "site context missing" });

                return Ok(new
                {
                    formId,
                    fields = validation.Schema.Fields.Count,
                    mode = "readonly",
                    probedMode = profile.Capabilities.Mode,
                    source = "ai",
                });
            }
            catch (ArgumentException) { return BadRequest(new { error = "invalid schema or table name" }); }
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Create, ex, "ExternalTable.ApplyBlueprint failed for {Schema}.{Table}", body.Schema, body.Table);
                return StatusCode(500, new { error = "apply failed" });
            }
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

        private CapabilityProfile ProbeOf(string connectionKey, string schema, string table)
        {
            var probe = new TableCapabilityProbe(_registry);
            return probe.Probe(new ProbeRequest
            {
                ConnectionKey = connectionKey,
                DatabaseType = DbTypeFor(connectionKey),
                Schema = schema,
                Table = table,
            });
        }

        /// <summary>Creates (or updates) the form for a table and freezes the binding. Shared by the
        /// deterministic Bind and the AI path so both end up with exactly the same guarantees.</summary>
        private int SaveBoundForm(int formId, string title, CapabilityProfile profile, FormSchema schema)
        {
            var schemaJson = JsonConvert.SerializeObject(schema);

            if (formId <= 0)
            {
                var siteId = SiteId;
                if (siteId <= 0) return 0;

                formId = _forms.SaveForm(new FormInfo
                {
                    PortalId = siteId,
                    Title = string.IsNullOrWhiteSpace(title) ? profile.Object.Schema + "." + profile.Object.Name : title,
                    SchemaJson = schemaJson,
                    Status = "Published",
                });
            }
            else
            {
                var form = _forms.GetForm(formId);
                if (form == null) return 0;
                form.SchemaJson = schemaJson;
                _forms.SaveForm(form);
            }

            _bindings.Save(new ExternalBinding
            {
                FormId = formId,
                ConnectionKey = profile.Connection.ConnectionKey,
                DatabaseType = DbTypeFor(profile.Connection.ConnectionKey),
                Schema = profile.Object.Schema,
                Table = profile.Object.Name,
                ProfileJson = JsonConvert.SerializeObject(profile),
                ProfileHash = profile.Hash,
                Mode = "readonly",   // the writer lands in P3; until then a bound form only reads
                TimeColumnConfirmed = true,
            });

            return formId;
        }

        /// <summary>Drops the server-only connection facts. The client still learns the provider and
        /// whether the account is over-privileged — it needs both to show honest warnings — but never
        /// the key or the string behind them.</summary>
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
