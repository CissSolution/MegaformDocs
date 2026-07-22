using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;
using MegaForm.Core.Services.ExternalTable;
using MegaForm.Core.Services.Subform;
using Newtonsoft.Json;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// External table binding controller for the Web host.
    /// Mirrors Oqtane's ExternalTableController contract.
    /// Route: /api/MegaFormPopup/ExternalTable
    /// </summary>
    [ApiController]
    [Route("api/MegaFormPopup/ExternalTable")]
    [Authorize(Roles = "Administrator")]
    public class ExternalTableController : ControllerBase
    {
        private readonly IConnectionRegistry _registry;
        private readonly IConfiguration _config;
        private readonly IFormRepository _forms;
        private readonly IExternalBindingStore _bindings;
        private readonly ILogger<ExternalTableController> _logger;
        private readonly IModuleSettingsService _moduleSettings;

        public ExternalTableController(
            IConnectionRegistry registry,
            IConfiguration config,
            IFormRepository forms,
            IExternalBindingStore bindings,
            ILogger<ExternalTableController> logger,
            IModuleSettingsService moduleSettings)
        {
            _registry = registry;
            _config = config;
            _forms = forms;
            _bindings = bindings;
            _logger = logger;
            _moduleSettings = moduleSettings;
        }

        private List<string> AllowedConnections()
        {
            var configured = _config.GetSection("MegaForm:ExternalTables:AllowedConnections").Get<string[]>();
            var list = (configured != null && configured.Length > 0)
                ? configured.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.Trim()).ToList()
                : (string.IsNullOrWhiteSpace(_config["ConnectionStrings:DashboardDatabase"])
                    ? new List<string>()
                    : new List<string> { "DashboardDatabase" });

            // [NamedConnections v20260717-01] Admin-saved catalog names join the allow-list — saving one is
            // admin-gated, so it carries appsettings-level trust. Makes a UI-added connection reachable by
            // the builder's table browser + capability probe.
            try
            {
                var json = _moduleSettings == null ? string.Empty
                    : _moduleSettings.GetSetting(0, MegaForm.Core.Services.NamedConnectionCatalog.SettingKey, "");
                foreach (var name in MegaForm.Core.Services.NamedConnectionCatalog.Names(json))
                    if (!list.Any(k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase)))
                        list.Add(name);
            }
            catch { /* fail-soft: config allow-list alone still applies */ }
            return list;
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
            return Ok(new { connections = AllowedConnections() });
        }

        [HttpGet("Tables")]
        public IActionResult Tables([FromQuery] string connectionKey)
        {
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
                _logger.LogError(ex, "ExternalTable.Tables failed for {Key}", connectionKey);
                return StatusCode(500, new { error = "could not list tables" });
            }
        }

        [HttpGet("Probe")]
        public IActionResult Probe([FromQuery] string connectionKey, [FromQuery] string schema, [FromQuery] string table)
        {
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
                    AllowBehaviouralProbe = false,
                });

                return Ok(Redact(profile));
            }
            catch (ArgumentException)
            {
                return BadRequest(new { error = "invalid schema or table name" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ExternalTable.Probe failed for {Schema}.{Table}", schema, table);
                return StatusCode(500, new { error = "probe failed" });
            }
        }

        [HttpPost("Bind")]
        public IActionResult Bind([FromBody] BindBody body)
        {
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

                var formId = SaveBoundForm(body.FormId, body.Title, profile, schema, body.TimeColumnConfirmed);
                if (formId <= 0) return BadRequest(new { error = "site context missing" });

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
                _logger.LogError(ex, "ExternalTable.Bind failed for {Schema}.{Table}", body.Schema, body.Table);
                return StatusCode(500, new { error = "bind failed" });
            }
        }

        [HttpGet("Envelope")]
        public IActionResult Envelope([FromQuery] string connectionKey, [FromQuery] string schema, [FromQuery] string table)
        {
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
                _logger.LogError(ex, "ExternalTable.Envelope failed for {Schema}.{Table}", schema, table);
                return StatusCode(500, new { error = "envelope failed" });
            }
        }

        [HttpPost("ApplyBlueprint")]
        public IActionResult ApplyBlueprint([FromBody] BlueprintBody body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.Table))
                return BadRequest(new { error = "table required" });
            if (!IsAllowed(body.ConnectionKey))
                return BadRequest(new { error = "connection not allowed" });

            try
            {
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

                var formId = SaveBoundForm(body.FormId, body.Title, profile, validation.Schema, true);
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
                _logger.LogError(ex, "ExternalTable.ApplyBlueprint failed for {Schema}.{Table}", body.Schema, body.Table);
                return StatusCode(500, new { error = "apply failed" });
            }
        }

        public class BindBody
        {
            public string ConnectionKey { get; set; }
            public string Schema { get; set; }
            public string Table { get; set; }
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

        private int SaveBoundForm(int formId, string title, CapabilityProfile profile, FormSchema schema, bool timeColumnConfirmed)
        {
            var schemaJson = JsonConvert.SerializeObject(schema);

            if (formId <= 0)
            {
                formId = _forms.SaveForm(new FormInfo
                {
                    PortalId = 0,
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
                Mode = "readonly",
                TimeColumnConfirmed = timeColumnConfirmed,
            });

            return formId;
        }

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
