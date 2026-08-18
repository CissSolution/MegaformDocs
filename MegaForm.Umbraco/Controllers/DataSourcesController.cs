using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models.DataSources;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Subform;
using MegaForm.Umbraco.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Web.Common.Controllers;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Admin API for the MegaForm DataSource catalog.
    /// A data source is a named pointer to a registered connection; connection strings
    /// are resolved server-side and never travel to the browser (SECURITY_CODING_RULES §1/§10).
    /// Routes mirror the MegaFormApi shape so the shared TS UI can consume them consistently.
    /// </summary>
    [Route("/umbraco/MegaForm/MegaFormApi/DataSources")]
    [Authorize("MegaFormApi")]
    public class DataSourcesController : UmbracoApiController
    {
        private readonly IDataSourceStore _store;
        private readonly IConnectionRegistry _registry;
        private readonly IConnectionNameProvider _connectionNames;
        private readonly IConfiguration _config;
        private readonly IModuleSettingsService _moduleSettings;
        private readonly ILogger<DataSourcesController> _logger;

        public DataSourcesController(
            IDataSourceStore store,
            IConnectionRegistry registry,
            IConfiguration config,
            IModuleSettingsService moduleSettings,
            ILogger<DataSourcesController> logger)
        {
            _store = store;
            _registry = registry;
            _connectionNames = registry as IConnectionNameProvider;
            _config = config;
            _moduleSettings = moduleSettings;
            _logger = logger;
        }

        [HttpGet("List")]
        public IActionResult List()
        {
            return Ok(_store.List());
        }

        /// <summary>Names of registered / allow-listed connections for the connection picker.</summary>
        [HttpGet("Connections")]
        public IActionResult Connections()
        {
            return Ok(new { connections = AllowedConnections() });
        }

        [HttpGet("Get/{id}")]
        public IActionResult Get(int id)
        {
            var source = _store.Get(id);
            if (source == null) return NotFound();
            return Ok(source);
        }

        [HttpPost("Save")]
        public IActionResult Save([FromBody] DataSource source)
        {
            if (source == null) return BadRequest("Source is required.");
            if (string.IsNullOrWhiteSpace(source.Name)) return BadRequest("Name is required.");
            if (string.IsNullOrWhiteSpace(source.ConnectionKey)) return BadRequest("Connection is required.");

            var existing = source.Id > 0 ? _store.Get(source.Id) : null;
            var existingByName = _store.GetByName(source.Name);
            if (existing == null && existingByName != null)
                return BadRequest($"A data source named '{source.Name}' already exists.");
            if (existing != null && existingByName != null && existingByName.Id != existing.Id)
                return BadRequest($"A data source named '{source.Name}' already exists.");

            if (!IsAllowedConnection(source.ConnectionKey))
                return BadRequest($"Connection '{source.ConnectionKey}' is not registered or not allowed.");

            var id = _store.Save(source);
            return Ok(new { id, source = _store.Get(id) });
        }

        [HttpPost("Delete/{id}")]
        public IActionResult Delete(int id)
        {
            _store.Delete(id);
            return Ok(new { success = true });
        }

        /// <summary>
        /// Test that the stored connection can be opened. Returns the provider kind and a
        /// sample of tables on success.
        /// </summary>
        [HttpPost("Test/{id}")]
        public IActionResult Test(int id)
        {
            var source = _store.Get(id);
            if (source == null) return NotFound();

            if (!IsAllowedConnection(source.ConnectionKey))
                return BadRequest(new { error = $"Connection '{source.ConnectionKey}' is not registered or not allowed." });

            try
            {
                using var conn = _registry.GetConnection(source.ConnectionKey, source.DatabaseType);
                conn.Open();
                var provider = SqlSchemaReader.Detect(conn).ToString().ToLowerInvariant();
                var tables = SqlSchemaReader.ListTables(conn).Take(10).ToList();
                return Ok(new { ok = true, provider, tableCount = tables.Count, tables });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DataSources.Test failed for {Name} ({ConnectionKey})", source.Name, source.ConnectionKey);
                return StatusCode(500, new { error = $"Could not open connection '{source.ConnectionKey}': {ex.Message}" });
            }
        }

        /// <summary>
        /// Lists tables for a stored data source. The connection key is resolved from the
        /// catalog entry; a raw connectionKey query parameter is deliberately NOT accepted.
        /// </summary>
        [HttpGet("Tables")]
        public IActionResult Tables(int dataSourceId)
        {
            var source = _store.Get(dataSourceId);
            if (source == null) return BadRequest(new { error = "data source not found" });

            if (!IsAllowedConnection(source.ConnectionKey))
                return BadRequest(new { error = "connection not allowed" });

            try
            {
                using var conn = _registry.GetConnection(source.ConnectionKey, source.DatabaseType);
                conn.Open();
                var tables = SqlSchemaReader.ListTables(conn)
                    .Select(t => new { schema = t.Schema, name = t.Name })
                    .ToList();
                return Ok(new { tables });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DataSources.Tables failed for {ConnectionKey}", source.ConnectionKey);
                return StatusCode(500, new { error = "could not list tables" });
            }
        }

        /// <summary>
        /// Lists columns for a stored data source. The connection key is resolved from the
        /// catalog entry; a raw connectionKey query parameter is deliberately NOT accepted.
        /// </summary>
        [HttpGet("Columns")]
        public IActionResult Columns(int dataSourceId, string table)
        {
            var source = _store.Get(dataSourceId);
            if (source == null) return BadRequest(new { error = "data source not found" });
            if (string.IsNullOrWhiteSpace(table)) return BadRequest(new { error = "table required" });
            if (table.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0) return BadRequest(new { error = "invalid table" });

            if (!IsAllowedConnection(source.ConnectionKey))
                return BadRequest(new { error = "connection not allowed" });

            try
            {
                using var conn = _registry.GetConnection(source.ConnectionKey, source.DatabaseType);
                conn.Open();
                var columns = SqlSchemaReader.ListColumns(conn, table)
                    .Select(c => new { name = c.Name, dataType = c.DataType, nullable = c.Nullable, isPrimary = c.IsPrimary, uiType = c.UiType })
                    .ToList();
                return Ok(new { table, columns });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DataSources.Columns failed for {ConnectionKey}.{Table}", source.ConnectionKey, table);
                return StatusCode(500, new { error = "could not read columns" });
            }
        }

        /// <summary>
        /// Allow-listed connection names: whatever the host's registry exposes (appsettings +
        /// DashboardDatabase alias + admin-saved named catalog), plus the explicit external
        /// allow-list from appsettings. Connection strings themselves never leave the server.
        /// </summary>
        private List<string> AllowedConnections()
        {
            var list = new List<string>();

            // Registered names the IConnectionRegistry can actually resolve.
            try
            {
                if (_connectionNames != null)
                    foreach (var name in _connectionNames.GetConnectionNames().Where(n => !string.IsNullOrWhiteSpace(n)))
                        if (!list.Any(k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase)))
                            list.Add(name);
            }
            catch { /* registry not ready — fall back to configured list */ }

            // Explicit external allow-list.
            var configured = _config.GetSection("MegaForm:ExternalTables:AllowedConnections").Get<string[]>();
            if (configured != null && configured.Length > 0)
                foreach (var k in configured.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()))
                    if (!list.Any(x => string.Equals(x, k, StringComparison.OrdinalIgnoreCase)))
                        list.Add(k);

            // Admin-saved named catalog.
            try
            {
                var json = _moduleSettings == null ? string.Empty
                    : _moduleSettings.GetSetting(0, NamedConnectionCatalog.SettingKey, "");
                foreach (var name in NamedConnectionCatalog.Names(json))
                    if (!list.Any(k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase)))
                        list.Add(name);
            }
            catch { /* fail-soft */ }

            return list;
        }

        private bool IsAllowedConnection(string key)
        {
            return !string.IsNullOrWhiteSpace(key)
                   && AllowedConnections().Any(k => string.Equals(k, key.Trim(), StringComparison.OrdinalIgnoreCase));
        }
    }
}
