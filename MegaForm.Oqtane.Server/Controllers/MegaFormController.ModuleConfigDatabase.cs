// ════════════════════════════════════════════════════════════════════════
//  MegaFormController.ModuleConfigDatabase
//  ─────────────────────────────────────────
//  B51 v20260602 · AUTHOR C
//
//  Adds ModuleConfig endpoints that expose Oqtane's underlying default
//  connection string (from appsettings.json → ConnectionStrings) so the
//  Database Settings popup on Oqtane can prefill the Connection String
//  field instead of forcing the operator to retype it from memory.
//
//  Endpoints:
//    GET /api/MegaForm/ModuleConfig/DefaultConnectionString
//      → { connectionString, provider, hasDefault, dashboardConnectionName,
//          samples, source }
//
//  Also surfaces a richer error from the existing DatabaseSettings/Test
//  flow (delegated through ValidateConnectionStringShape) — the previous
//  pattern returned a vague "Test failed" string that hid the real cause
//  (missing Server / Data Source, missing Database / Initial Catalog,
//  timeout, etc.). The new helper returns actionable messages used both
//  by the DefaultConnectionString prefill and by any future Test action
//  added to this partial.
//
//  Read-only — never persists settings. Sanitized: any password=...
//  or pwd=... fragment in the returned string is masked with *** so the
//  raw secret does not flow back to the browser; the operator must paste
//  or confirm the real value before clicking Test/Save.
// ════════════════════════════════════════════════════════════════════════
using System;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    // [2026-06-10] Request DTO for the Database Settings popup (Test + Save).
    // POCO so System.Text.Json binds it (Oqtane has no AddNewtonsoftJson; the
    // case-insensitive STJ binder maps {provider, connectionString, alias}).
    public class MegaFormDbSettingsRequest
    {
        public string Provider { get; set; }
        public string ConnectionString { get; set; }
        public string Alias { get; set; }
    }

    public partial class MegaFormController
    {
        // ──────────────────────────────────────────────────────────────────
        //  GET /api/MegaForm/ModuleConfig/DefaultConnectionString
        //  Returns Oqtane's default connection string (sanitized) so the
        //  Database Settings popup can prefill the Connection String input.
        // ──────────────────────────────────────────────────────────────────
        [HttpGet("ModuleConfig/DefaultConnectionString")]
        [Authorize]
        public IActionResult GetDefaultConnectionString()
        {
            if (!CanUseAdminPopup()) return Forbid();

            // Probe order: DefaultConnection (Oqtane canonical), then a few
            // common MegaForm-flavored aliases customers may have added.
            // Empty string is returned when nothing is configured so the UI
            // can render the form with placeholder samples instead of null.
            string source = "DefaultConnection";
            string raw = SafeGetConnectionString("DefaultConnection");
            if (string.IsNullOrWhiteSpace(raw))
            {
                raw = SafeGetConnectionString("MegaForm");
                if (!string.IsNullOrWhiteSpace(raw)) source = "MegaForm";
            }
            if (string.IsNullOrWhiteSpace(raw))
            {
                raw = SafeGetConnectionString("DashboardDatabase");
                if (!string.IsNullOrWhiteSpace(raw)) source = "DashboardDatabase";
            }

            var hasDefault = !string.IsNullOrWhiteSpace(raw);
            var provider = DetectDbProvider(raw);
            var safe = MaskSecretsForUi(raw);

            // Mirror the DNN shape so the dashboard/index.ts caller can reuse
            // the same `sampleFor()` switch without a separate code path.
            return Ok(new
            {
                connectionString = safe,
                provider,
                hasDefault,
                dashboardConnectionName = "DashboardDatabase",
                source,
                samples = new
                {
                    sqlite     = "Data Source=Oqtane-Fresh.db",
                    sqlServer  = "Server=(local);Database=MyDb;Integrated Security=True;TrustServerCertificate=True;Encrypt=False",
                    mySql      = "Server=localhost;Port=3306;Database=MyDb;Uid=root;Pwd=***",
                    postgreSql = "Host=localhost;Port=5432;Database=MyDb;Username=postgres;Password=***"
                }
            });
        }

        // ──────────────────────────────────────────────────────────────────
        //  GET /api/MegaForm/ModuleConfig/DatabaseSettings
        //  The Database Settings popup's INITIAL load. Returns the saved
        //  DashboardDatabase override (site setting) when present, else the
        //  Oqtane DefaultConnection — so the popup prefills the DEFAULT
        //  connection by default (no more empty form / 400). Same payload
        //  shape as GetDefaultConnectionString so dashboard/index.ts reuses it.
        // ──────────────────────────────────────────────────────────────────
        [HttpGet("ModuleConfig/DatabaseSettings")]
        [Authorize]
        public IActionResult GetDatabaseSettings()
        {
            if (!CanUseAdminPopup()) return Forbid();

            string savedProvider = null, savedCs = null, savedAlias = null;
            try
            {
                var siteId = AuthEntityId(EntityNames.Site);
                var s = ReadSettings(EntityNames.Site, siteId);
                savedProvider = ReadSetting(s, "MegaForm_DashboardDb_Provider", "");
                savedCs = ReadSetting(s, "MegaForm_DashboardDb_ConnectionString", "");
                savedAlias = ReadSetting(s, "MegaForm_DashboardDb_Alias", "");
            }
            catch { /* fall back to the default connection */ }

            bool hasSaved = !string.IsNullOrWhiteSpace(savedCs);
            string raw = hasSaved ? savedCs : SafeGetConnectionString("DefaultConnection");
            string provider = !string.IsNullOrWhiteSpace(savedProvider) ? savedProvider : DetectDbProvider(raw);

            return Ok(new
            {
                connectionString = MaskSecretsForUi(raw),
                provider,
                hasDefault = !string.IsNullOrWhiteSpace(raw),
                dashboardConnectionName = !string.IsNullOrWhiteSpace(savedAlias) ? savedAlias : "DashboardDatabase",
                source = hasSaved ? "saved" : "DefaultConnection",
                samples = new
                {
                    sqlite     = "Data Source=Oqtane-Fresh.db",
                    sqlServer  = "Server=(local);Database=MyDb;Integrated Security=True;TrustServerCertificate=True;Encrypt=False",
                    mySql      = "Server=localhost;Port=3306;Database=MyDb;Uid=root;Pwd=***",
                    postgreSql = "Host=localhost;Port=5432;Database=MyDb;Username=postgres;Password=***"
                }
            });
        }

        // ──────────────────────────────────────────────────────────────────
        //  POST /api/MegaForm/ModuleConfig/DatabaseSettings/Test
        //  Provider-aware connection test (was DNN-only → Oqtane returned 400).
        //  Opens a REAL connection via the SAME factory the runtime registry
        //  uses (OqtaneConnectionRegistry.CreateProviderConnection) so SQLite /
        //  Postgres / MySQL / SQL Server all resolve exactly like production.
        //  Returns {success, message, databaseName, serverVersion}.
        // ──────────────────────────────────────────────────────────────────
        [HttpPost("ModuleConfig/DatabaseSettings/Test")]
        [Authorize]
        public IActionResult TestDatabaseSettings([FromBody] MegaFormDbSettingsRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (req == null) return Ok(new { success = false, message = "Request body is required." });

            var shapeErr = ValidateConnectionStringShape(req.Provider, req.ConnectionString);
            if (shapeErr != null) return Ok(new { success = false, message = shapeErr });

            try
            {
                // UI provider values (Sqlite/SqlServer/MySql/PostgreSql) lower-case to
                // the registry's databaseType (sqlite/sqlserver/mysql/postgresql).
                var dbType = (req.Provider ?? string.Empty).Trim().ToLowerInvariant();
                using (var conn = Services.OqtaneConnectionRegistry.CreateProviderConnection(dbType))
                {
                    conn.ConnectionString = req.ConnectionString;
                    conn.Open();
                    string dbName = string.Empty, ver = string.Empty;
                    try { dbName = conn.Database; } catch { }
                    try { ver = conn.ServerVersion; } catch { }
                    try { conn.Close(); } catch { }
                    return Ok(new { success = true, message = "Connection successful.", databaseName = dbName, serverVersion = ver });
                }
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = ex.Message });
            }
        }

        // ──────────────────────────────────────────────────────────────────
        //  POST /api/MegaForm/ModuleConfig/DatabaseSettings
        //  Persist the DashboardDatabase override to SITE settings (connection
        //  string stored private). The runtime registry still falls back to
        //  DefaultConnection (P0-2) when no override is read — wiring the
        //  registry to consume this saved override is a documented follow-up.
        // ──────────────────────────────────────────────────────────────────
        [HttpPost("ModuleConfig/DatabaseSettings")]
        [Authorize]
        public IActionResult SaveDatabaseSettings([FromBody] MegaFormDbSettingsRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (req == null) return Ok(new { success = false, message = "Request body is required." });

            var shapeErr = ValidateConnectionStringShape(req.Provider, req.ConnectionString);
            if (shapeErr != null) return Ok(new { success = false, message = shapeErr });

            try
            {
                var siteId = AuthEntityId(EntityNames.Site);
                UpsertSetting(EntityNames.Site, siteId, "MegaForm_DashboardDb_Provider", req.Provider ?? string.Empty, false);
                UpsertSetting(EntityNames.Site, siteId, "MegaForm_DashboardDb_ConnectionString", req.ConnectionString ?? string.Empty, true);
                UpsertSetting(EntityNames.Site, siteId, "MegaForm_DashboardDb_Alias", string.IsNullOrWhiteSpace(req.Alias) ? "DashboardDatabase" : req.Alias, false);
                return Ok(new { success = true, message = "Database settings saved." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ──────────────────────────────────────────────────────────────────
        //  IConfiguration probe — guards against null _configuration when
        //  the controller is constructed in a unit-test/no-DI scenario.
        // ──────────────────────────────────────────────────────────────────
        private string SafeGetConnectionString(string name)
        {
            if (_configuration == null || string.IsNullOrWhiteSpace(name)) return string.Empty;
            try { return _configuration.GetConnectionString(name) ?? string.Empty; }
            catch { return string.Empty; }
        }

        // ──────────────────────────────────────────────────────────────────
        //  Mask password=... / pwd=... fragments — never echo plaintext
        //  secrets back to the browser. Structure (server/db/port/etc) is
        //  preserved so the UI can intelligently prefill toggles like
        //  Encrypt / TrustServerCertificate.
        // ──────────────────────────────────────────────────────────────────
        private static string MaskSecretsForUi(string cs)
        {
            if (string.IsNullOrWhiteSpace(cs)) return string.Empty;
            return Regex.Replace(
                cs,
                @"(?i)(password|pwd)\s*=\s*[^;]*",
                "$1=***");
        }

        // ──────────────────────────────────────────────────────────────────
        //  Provider sniff — match the four providers the dashboard UI offers
        //  (Sqlite / SqlServer / MySql / PostgreSql). Ordering matters: the
        //  PostgreSQL fingerprint (Host=...;Port=5432) overlaps with MySQL
        //  (Server=...;Port=3306), so PostgreSQL is checked first when its
        //  distinctive tokens are present.
        // ──────────────────────────────────────────────────────────────────
        private static string DetectDbProvider(string cs)
        {
            if (string.IsNullOrWhiteSpace(cs)) return "SqlServer";
            var lower = cs.ToLowerInvariant();
            if (lower.Contains("sqlite")
                || lower.Contains(".db")
                || (lower.Contains("data source=") && (lower.Contains(".sqlite") || lower.Contains(".db")))) return "Sqlite";
            if (lower.Contains("host=") && (lower.Contains("username=") || lower.Contains("user id=") || lower.Contains("port=5432"))) return "PostgreSql";
            if ((lower.Contains("server=") || lower.Contains("host=")) && (lower.Contains("uid=") || lower.Contains("port=3306"))) return "MySql";
            if (lower.Contains("server=") || lower.Contains("data source=")) return "SqlServer";
            return "SqlServer";
        }

        // ──────────────────────────────────────────────────────────────────
        //  Shape validator — converts the vague "Test failed" the user was
        //  seeing into actionable text. Returns null when the shape looks
        //  fine so the caller can run the real connection test; returns a
        //  message string otherwise.
        //
        //  Exposed (internal) so a future TestDatabaseSettings action in
        //  this partial — or a unit test — can short-circuit obviously
        //  broken inputs before paying the SqlClient open-connection cost.
        // ──────────────────────────────────────────────────────────────────
        internal static string ValidateConnectionStringShape(string provider, string cs)
        {
            if (string.IsNullOrWhiteSpace(provider))
                return "Database provider is required.";
            if (string.IsNullOrWhiteSpace(cs))
                return "Connection string is required.";

            var lower = cs.ToLowerInvariant();
            switch ((provider ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "sqlserver":
                    if (!lower.Contains("server=") && !lower.Contains("data source="))
                        return "Missing Server / Data Source in connection string.";
                    if (!lower.Contains("database=") && !lower.Contains("initial catalog="))
                        return "Missing Database / Initial Catalog in connection string.";
                    break;
                case "mysql":
                    if (!lower.Contains("server=") && !lower.Contains("host=") && !lower.Contains("data source="))
                        return "Missing Server / Host in connection string.";
                    if (!lower.Contains("database=") && !lower.Contains("uid=") && !lower.Contains("user id="))
                        return "Missing Database or credentials in connection string.";
                    break;
                case "postgresql":
                    if (!lower.Contains("host=") && !lower.Contains("server="))
                        return "Missing Host / Server in connection string.";
                    if (!lower.Contains("database="))
                        return "Missing Database in connection string.";
                    break;
                case "sqlite":
                    if (!lower.Contains("data source="))
                        return "Missing Data Source (file path) in SQLite connection string.";
                    break;
            }
            return null;
        }
    }
}
