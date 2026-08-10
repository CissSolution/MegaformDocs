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
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Integrations.Storage;
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
        // [ModuleConfigAdminGate v20260810] Every ModuleConfig route below carried a bare
        // [Authorize], which in ASP.NET Core means ANY authenticated user - not an administrator.
        // The bodies here do call CanUseAdminPopup(), so Oqtane was defended one layer deep; the
        // attribute now says the same thing, so the guard is not the only thing standing between a
        // Registered user and a connection string. The DNN twin had no such body guard and was
        // genuinely open: measured, a real Registered-Users-only account reached
        // POST ModuleConfig/DatabaseSettings/Test and got the handler's own 400
        // ("Database provider is required."), i.e. it had already cleared authorization.
        //
        // Public form rendering, Submit/Post and Upload/File live on other controllers and are
        // untouched - verified with tools/browser-qa/public-form-flow-qa.mjs (zero ModuleConfig
        // calls from a public page) and tools/browser-qa/anon-public-endpoints-probe.mjs.

        // ──────────────────────────────────────────────────────────────────
        //  GET /api/MegaForm/ModuleConfig/DefaultConnectionString
        //  Returns Oqtane's default connection string (sanitized) so the
        //  Database Settings popup can prefill the Connection String input.
        // ──────────────────────────────────────────────────────────────────
        [HttpGet("ModuleConfig/DefaultConnectionString")]
        [Authorize(Roles = "Administrators")]
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
        [Authorize(Roles = "Administrators")]
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
        [Authorize(Roles = "Administrators")]
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
        [Authorize(Roles = "Administrators")]
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

        // ══════════════════════════════════════════════════════════════════
        //  [NamedConnections v20260717-01] Multiple named SQL connections.
        //  The popup previously managed ONE connection while the builder's
        //  databaseInsert picker listed appsettings-only names (CustomerErp)
        //  the operator could see but never manage. These endpoints expose the
        //  full catalog (config entries read-only + admin-saved entries CRUD).
        //  Route names are FLAT (ConnectionsList/Save/Delete) so the DNN
        //  action-based twin uses the identical client path.
        //  SECURITY: admin-gated (CanUseAdminPopup); connection strings echoed
        //  to the browser are ALWAYS masked (rule: no secrets to the client).
        // ══════════════════════════════════════════════════════════════════

        public class MegaFormNamedConnectionRequest
        {
            public string Name { get; set; }
            public string Provider { get; set; }
            public string ConnectionString { get; set; }
        }

        [HttpGet("ModuleConfig/ConnectionsList")]
        [Authorize(Roles = "Administrators")]
        public IActionResult ListNamedConnections()
        {
            if (!CanUseAdminPopup()) return Forbid();

            var savedJson = ReadNamedConnectionsSetting();
            var saved = MegaForm.Core.Services.NamedConnectionCatalog.Parse(savedJson);
            var savedNames = new System.Collections.Generic.HashSet<string>(
                saved.Select(s => s.Name.Trim()), StringComparer.OrdinalIgnoreCase);

            var allowCfg = _configuration != null
                ? (Microsoft.Extensions.Configuration.ConfigurationBinder
                      .Get<string[]>(_configuration.GetSection("MegaForm:ExternalTables:AllowedConnections")) ?? new string[0])
                : new string[0];
            var allowSet = new System.Collections.Generic.HashSet<string>(
                allowCfg.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.Trim()),
                StringComparer.OrdinalIgnoreCase);
            allowSet.Add("DashboardDatabase");

            var items = new System.Collections.Generic.List<object>();
            // Config entries (appsettings ConnectionStrings) — read-only in the UI. A saved entry
            // with the same name SHADOWS the config one at runtime, so only the saved row is shown.
            if (_configuration != null)
            {
                foreach (var child in _configuration.GetSection("ConnectionStrings").GetChildren())
                {
                    if (string.IsNullOrWhiteSpace(child.Key) || savedNames.Contains(child.Key.Trim())) continue;
                    items.Add(new
                    {
                        name = child.Key.Trim(),
                        provider = DetectDbProvider(child.Value),
                        connectionString = MegaForm.Core.Services.NamedConnectionCatalog.MaskSecrets(child.Value),
                        source = "config",
                        allowListed = allowSet.Contains(child.Key.Trim())
                    });
                }
            }
            foreach (var s in saved)
            {
                items.Add(new
                {
                    name = s.Name.Trim(),
                    provider = string.IsNullOrWhiteSpace(s.Provider) ? DetectDbProvider(s.ConnectionString) : s.Provider,
                    connectionString = MegaForm.Core.Services.NamedConnectionCatalog.MaskSecrets(s.ConnectionString),
                    source = "saved",
                    allowListed = true   // saving is admin-gated → carries appsettings-level trust
                });
            }

            return Ok(new { connections = items });
        }

        [HttpPost("ModuleConfig/ConnectionsSave")]
        [Authorize(Roles = "Administrators")]
        public IActionResult SaveNamedConnection([FromBody] MegaFormNamedConnectionRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (req == null) return Ok(new { success = false, message = "Request body is required." });

            var nameErr = MegaForm.Core.Services.NamedConnectionCatalog.ValidateName(req.Name);
            if (nameErr != null) return Ok(new { success = false, message = nameErr });
            var shapeErr = ValidateConnectionStringShape(req.Provider, req.ConnectionString);
            if (shapeErr != null) return Ok(new { success = false, message = shapeErr });

            try
            {
                var siteId = ResolveSiteIdForConnectionCatalog();
                if (siteId <= 0) return Ok(new { success = false, message = "Could not resolve the site for this request." });
                var existingJson = ReadNamedConnectionsSetting();
                // [MaskRoundTrip v20260726] The editor prefills the MASKED string, so a save that
                // only changed the server/database still carries password=***. Put the stored
                // secret back instead of persisting the mask. (DNN twin: MegaFormApiController.)
                var prior = MegaForm.Core.Services.NamedConnectionCatalog.Parse(existingJson)
                    .FirstOrDefault(c => string.Equals(c.Name?.Trim(), (req.Name ?? string.Empty).Trim(), System.StringComparison.OrdinalIgnoreCase));
                var next = MegaForm.Core.Services.NamedConnectionCatalog.Upsert(
                    existingJson,
                    new MegaForm.Core.Services.NamedConnectionInfo
                    {
                        Name = req.Name,
                        Provider = req.Provider,
                        ConnectionString = MegaForm.Core.Services.NamedConnectionCatalog.RestoreMaskedSecrets(req.ConnectionString, prior?.ConnectionString),
                    });
                UpsertSetting(EntityNames.Site, siteId, MegaForm.Core.Services.NamedConnectionCatalog.SettingKey, next, true);
                return Ok(new { success = true, message = "Connection '" + req.Name.Trim() + "' saved." });
            }
            catch
            {
                // SECURITY rule 10: no ex.Message to the client.
                return StatusCode(500, new { success = false, error = "Could not save the connection." });
            }
        }

        [HttpPost("ModuleConfig/ConnectionsDelete")]
        [Authorize(Roles = "Administrators")]
        public IActionResult DeleteNamedConnection([FromBody] MegaFormNamedConnectionRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var name = (req != null ? req.Name : null) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name)) return Ok(new { success = false, message = "Connection name is required." });

            try
            {
                var json = ReadNamedConnectionsSetting();
                if (!MegaForm.Core.Services.NamedConnectionCatalog.Contains(json, name))
                    return Ok(new { success = false, message = "Only saved connections can be deleted (config entries live in appsettings.json)." });
                var siteId = ResolveSiteIdForConnectionCatalog();
                if (siteId <= 0) return Ok(new { success = false, message = "Could not resolve the site for this request." });
                UpsertSetting(EntityNames.Site, siteId, MegaForm.Core.Services.NamedConnectionCatalog.SettingKey,
                    MegaForm.Core.Services.NamedConnectionCatalog.Remove(json, name), true);
                return Ok(new { success = true, message = "Connection '" + name.Trim() + "' deleted." });
            }
            catch
            {
                // SECURITY rule 10: no ex.Message to the client.
                return StatusCode(500, new { success = false, error = "Could not delete the connection." });
            }
        }

        private string ReadNamedConnectionsSetting()
        {
            try
            {
                var siteId = ResolveSiteIdForConnectionCatalog();
                if (siteId <= 0) return string.Empty;
                var s = ReadSettings(EntityNames.Site, siteId);
                return ReadSetting(s, MegaForm.Core.Services.NamedConnectionCatalog.SettingKey, "");
            }
            catch { return string.Empty; }
        }

        // ══════════════════════════════════════════════════════════════════
        //  [CloudStorage v20260723-01] Named CLOUD STORAGE connections catalog.
        //  Mirror of the SQL named-connections endpoints above: same flat route
        //  style, same admin gate (CanUseAdminPopup), same Site-settings store,
        //  same masked-edit convention — a secret echoed to the browser is ALWAYS
        //  "***" (CloudStorageConnectionCatalog.MaskSecrets) and a "***" coming
        //  back on Save/Test keeps the stored value (SECURITY rule 10).
        // ══════════════════════════════════════════════════════════════════

        public class MegaFormCloudStorageConnectionRequest
        {
            public string Name { get; set; }
            public string Provider { get; set; }
            public string AccessToken { get; set; }
            public string RefreshToken { get; set; }
            public string ClientId { get; set; }
            public string ClientSecret { get; set; }
            public string BaseFolder { get; set; }
            public string BaseUrl { get; set; }
            public Dictionary<string, string> Extra { get; set; }
        }

        [HttpGet("ModuleConfig/CloudStorageConnectionsList")]
        [Authorize(Roles = "Administrators")]
        public async Task<IActionResult> ListCloudStorageConnections()
        {
            if (!CanUseAdminPopup()) return Forbid();

            var saved = CloudStorageConnectionCatalog.Parse(ReadCloudStorageConnectionsSetting());
            var items = saved.Select(CloudStorageConnectionCatalog.MaskSecrets).ToList();
            var providers = await GetRegisteredStorageProviderNamesAsync().ConfigureAwait(false);
            return Ok(new { success = true, connections = items, providers });
        }

        [HttpPost("ModuleConfig/CloudStorageConnectionSave")]
        [Authorize(Roles = "Administrators")]
        public async Task<IActionResult> SaveCloudStorageConnection([FromBody] MegaFormCloudStorageConnectionRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (req == null) return Ok(new { success = false, message = "Request body is required." });

            var nameErr = CloudStorageConnectionCatalog.ValidateName(req.Name);
            if (nameErr != null) return Ok(new { success = false, message = nameErr });

            var provider = (req.Provider ?? string.Empty).Trim();
            var providers = await GetRegisteredStorageProviderNamesAsync().ConfigureAwait(false);
            if (provider.Length == 0 || !providers.Any(p => string.Equals(p, provider, StringComparison.OrdinalIgnoreCase)))
                return Ok(new { success = false, message = "Unknown storage provider '" + provider + "'." });

            try
            {
                var siteId = ResolveSiteIdForConnectionCatalog();
                if (siteId <= 0) return Ok(new { success = false, message = "Could not resolve the site for this request." });
                var json = ReadCloudStorageConnectionsSetting();
                var entry = BuildCloudStorageEntry(req, CloudStorageConnectionCatalog.Find(json, req.Name));
                var next = CloudStorageConnectionCatalog.Upsert(json, entry);
                UpsertSetting(EntityNames.Site, siteId, CloudStorageConnectionCatalog.SettingKey, next, true);
                return Ok(new { success = true, message = "Connection '" + req.Name.Trim() + "' saved." });
            }
            catch
            {
                // SECURITY rule 10: no ex.Message to the client.
                return StatusCode(500, new { success = false, error = "Could not save the connection." });
            }
        }

        [HttpPost("ModuleConfig/CloudStorageConnectionDelete")]
        [Authorize(Roles = "Administrators")]
        public IActionResult DeleteCloudStorageConnection([FromBody] MegaFormCloudStorageConnectionRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var name = (req != null ? req.Name : null) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name)) return Ok(new { success = false, message = "Connection name is required." });

            try
            {
                var json = ReadCloudStorageConnectionsSetting();
                if (!CloudStorageConnectionCatalog.Contains(json, name))
                    return Ok(new { success = false, message = "Cloud storage connection '" + name.Trim() + "' was not found." });
                var siteId = ResolveSiteIdForConnectionCatalog();
                if (siteId <= 0) return Ok(new { success = false, message = "Could not resolve the site for this request." });
                UpsertSetting(EntityNames.Site, siteId, CloudStorageConnectionCatalog.SettingKey,
                    CloudStorageConnectionCatalog.Remove(json, name), true);
                return Ok(new { success = true, message = "Connection '" + name.Trim() + "' deleted." });
            }
            catch
            {
                // SECURITY rule 10: no ex.Message to the client.
                return StatusCode(500, new { success = false, error = "Could not delete the connection." });
            }
        }

        [HttpPost("ModuleConfig/CloudStorageConnectionTest")]
        [Authorize(Roles = "Administrators")]
        public async Task<IActionResult> TestCloudStorageConnection([FromBody] MegaFormCloudStorageConnectionRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (req == null) return Ok(new { success = false, message = "Request body is required." });

            var provider = (req.Provider ?? string.Empty).Trim();
            if (provider.Length == 0) return Ok(new { success = false, message = "Storage provider is required." });

            try
            {
                var svc = HttpContext?.RequestServices?.GetService(typeof(IStorageIntegrationService)) as IStorageIntegrationService;
                if (svc == null) return Ok(new { success = false, message = "Storage integration service is not available." });
                var entry = BuildCloudStorageEntry(req,
                    CloudStorageConnectionCatalog.Find(ReadCloudStorageConnectionsSetting(), req.Name));
                var result = await svc.TestConnectionAsync(provider, CloudStorageConnectionCatalog.ToConnectionSettings(entry)).ConfigureAwait(false);
                return Ok(new { success = result != null && result.Healthy, message = result == null ? "Connection test failed." : result.Message });
            }
            catch (Exception ex)
            {
                // Diagnostic endpoint — mirror DatabaseSettings/Test which surfaces the real cause.
                return Ok(new { success = false, message = ex.Message });
            }
        }

        private string ReadCloudStorageConnectionsSetting()
        {
            try
            {
                var siteId = ResolveSiteIdForConnectionCatalog();
                if (siteId <= 0) return string.Empty;
                var s = ReadSettings(EntityNames.Site, siteId);
                return ReadSetting(s, CloudStorageConnectionCatalog.SettingKey, "");
            }
            catch { return string.Empty; }
        }

        /// <summary>Maps the request DTO to a catalog entry, resolving "***" secrets against the stored entry.</summary>
        private static CloudStorageConnectionInfo BuildCloudStorageEntry(MegaFormCloudStorageConnectionRequest req, CloudStorageConnectionInfo existing)
        {
            return new CloudStorageConnectionInfo
            {
                Name = req.Name,
                Provider = (req.Provider ?? string.Empty).Trim(),
                AccessToken = ResolveCloudSecret(req.AccessToken, existing != null ? existing.AccessToken : null),
                RefreshToken = ResolveCloudSecret(req.RefreshToken, existing != null ? existing.RefreshToken : null),
                ClientId = req.ClientId,
                ClientSecret = ResolveCloudSecret(req.ClientSecret, existing != null ? existing.ClientSecret : null),
                BaseFolder = req.BaseFolder,
                BaseUrl = req.BaseUrl,
                Extra = req.Extra ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            };
        }

        /// <summary>Masked-edit convention: "***" means "keep the stored value" (never persisted as-is).</summary>
        private static string ResolveCloudSecret(string incoming, string stored)
            => incoming == "***" ? (stored ?? string.Empty) : (incoming ?? string.Empty);

        private async Task<IReadOnlyList<string>> GetRegisteredStorageProviderNamesAsync()
        {
            try
            {
                var svc = HttpContext?.RequestServices?.GetService(typeof(IStorageIntegrationService)) as IStorageIntegrationService;
                if (svc == null) return new string[0];
                return await svc.GetRegisteredProviderNamesAsync().ConfigureAwait(false);
            }
            catch { return new string[0]; }
        }

        /// <summary>
        /// [NamedConnections v20260717-01] AuthEntityId(Site) is -1 for a dashboard-modal XHR that
        /// carries no entity context (the classic "AuthEntityId(Site)=-1" trap — the first save
        /// landed under EntityId -1 and the catalog was invisible everywhere). Fall back to the
        /// siteid claim, then the tenant alias — the SAME seam the runtime registry resolves with,
        /// so reader and writer can never disagree about which site owns the catalog.
        /// </summary>
        private int ResolveSiteIdForConnectionCatalog()
        {
            var id = AuthEntityId(EntityNames.Site);
            if (id > 0) return id;
            var claim = User?.FindFirst("siteid")?.Value ?? User?.FindFirst("SiteId")?.Value;
            if (int.TryParse(claim, out var cid) && cid > 0) return cid;
            try
            {
                var tenants = HttpContext?.RequestServices?.GetService(typeof(global::Oqtane.Infrastructure.ITenantManager))
                    as global::Oqtane.Infrastructure.ITenantManager;
                var alias = tenants?.GetAlias();
                if (alias != null && alias.SiteId > 0) return alias.SiteId;
            }
            catch { }
            return int.TryParse(Request?.Query["siteId"], out var qid) && qid > 0 ? qid : 0;
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
