using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Integrations.Storage;
using MegaForm.Core.Services;
using MegaForm.Umbraco.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Global module configuration endpoints for Umbraco.
    /// Mirrors Oqtane/Web MegaForm ModuleConfig settings popups:
    /// Database, Payment, Captcha, Email, Upload, Google Sheets.
    /// </summary>
    public partial class MegaFormApiController
    {
        // ── Database Settings ──

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/DatabaseSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult GetDatabaseSettings(
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IDatabaseWorkflowMetadataService dbMetadata,
            [FromServices] IConfiguration cfg)
        {
            var provider = moduleSettings.GetSetting(0, "Database_Provider", "");
            var connectionString = moduleSettings.GetSetting(0, "Database_ConnectionString", "");
            if (string.IsNullOrWhiteSpace(provider))
                provider = InferDatabaseType(cfg.GetConnectionString("DefaultConnection") ?? cfg["ConnectionStrings:DefaultConnection"] ?? string.Empty);
            if (string.IsNullOrWhiteSpace(provider)) provider = "Sqlite";
            if (string.IsNullOrWhiteSpace(connectionString))
                connectionString = cfg.GetConnectionString("DefaultConnection") ?? cfg["ConnectionStrings:DefaultConnection"] ?? string.Empty;

            var dashboardAlias = moduleSettings.GetSetting(0, "Database_ConnectionAlias", "DashboardDatabase");
            return Ok(new {
                provider,
                // Mask password=/pwd= fragments — never echo plaintext secrets to
                // the browser (mirrors the Oqtane twin). Structure stays visible.
                connectionString = NamedConnectionCatalog.MaskSecrets(connectionString),
                dashboardConnectionName = dashboardAlias,
                samples = new {
                    sqlite = dbMetadata.GetConnectionStringSample("Sqlite"),
                    sqlServer = dbMetadata.GetConnectionStringSample("SqlServer"),
                    mySql = dbMetadata.GetConnectionStringSample("MySql"),
                    postgreSql = dbMetadata.GetConnectionStringSample("PostgreSql")
                }
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/DatabaseSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SaveDatabaseSettings(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            var provider = body.Value<string>("provider");
            var connectionString = body.Value<string>("connectionString");
            var alias = body.Value<string>("alias");
            if (!string.IsNullOrWhiteSpace(provider)) moduleSettings.SetSetting(0, "Database_Provider", provider);
            if (connectionString != null) moduleSettings.SetSetting(0, "Database_ConnectionString", connectionString);
            if (!string.IsNullOrWhiteSpace(alias)) moduleSettings.SetSetting(0, "Database_ConnectionAlias", alias.Trim());
            return Ok(new { success = true, message = "Database settings saved.", dashboardConnectionName = string.IsNullOrWhiteSpace(alias) ? "DashboardDatabase" : alias.Trim() });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/DatabaseSettings/Test")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult TestDatabaseSettings(
            [FromBody] JObject body,
            [FromServices] IDatabaseWorkflowMetadataService dbMetadata)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            var provider = body.Value<string>("provider");
            var connectionString = body.Value<string>("connectionString");
            if (string.IsNullOrWhiteSpace(provider)) return BadRequest(new { error = "Database provider is required." });
            if (string.IsNullOrWhiteSpace(connectionString)) return BadRequest(new { error = "Connection string is required." });
            var result = dbMetadata.TestConnection(null, provider, connectionString);
            return Ok(new {
                success = result != null && result.Success,
                provider = result == null ? provider : result.Provider,
                databaseName = result == null ? string.Empty : result.DatabaseName,
                serverVersion = result == null ? string.Empty : result.ServerVersion,
                supportsStoredProcedures = result != null && result.SupportsStoredProcedures,
                message = result == null ? "Connection test failed." : result.Message
            });
        }

        // ── SQL Connections (NamedConnections v20260717-01) ──
        // Web/Oqtane twin. Absolute routes so the shared dashboard client's /api/MegaForm/...
        // calls (rewritten by the route middleware) resolve. SECURITY: Browse to list, Edit to
        // save/delete; every echoed connection string is masked (rule 10).

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/ConnectionsList")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult ListNamedConnections(
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IConfiguration cfg)
        {
            var savedJson = moduleSettings.GetSetting(0, NamedConnectionCatalog.SettingKey, "");
            var saved = NamedConnectionCatalog.Parse(savedJson);
            var savedNames = new System.Collections.Generic.HashSet<string>(
                saved.Select(s => (s.Name ?? string.Empty).Trim()), StringComparer.OrdinalIgnoreCase);

            var items = new System.Collections.Generic.List<object>();
            foreach (var child in cfg.GetSection("ConnectionStrings").GetChildren())
            {
                if (string.IsNullOrWhiteSpace(child.Key) || savedNames.Contains(child.Key.Trim())) continue;
                items.Add(new
                {
                    name = child.Key.Trim(),
                    provider = InferDatabaseType(child.Value),
                    connectionString = NamedConnectionCatalog.MaskSecrets(child.Value),
                    source = "config"
                });
            }
            foreach (var s in saved)
            {
                items.Add(new
                {
                    name = (s.Name ?? string.Empty).Trim(),
                    provider = string.IsNullOrWhiteSpace(s.Provider) ? InferDatabaseType(s.ConnectionString) : s.Provider,
                    connectionString = NamedConnectionCatalog.MaskSecrets(s.ConnectionString),
                    source = "saved"
                });
            }
            return Ok(new { connections = items });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/ConnectionsSave")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SaveNamedConnection(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            if (body == null) return Ok(new { success = false, message = "Request body is required." });
            var name = body.Value<string>("name");
            var provider = body.Value<string>("provider");
            var connectionString = body.Value<string>("connectionString");
            var nameErr = NamedConnectionCatalog.ValidateName(name);
            if (nameErr != null) return Ok(new { success = false, message = nameErr });
            if (string.IsNullOrWhiteSpace(connectionString)) return Ok(new { success = false, message = "Connection string is required." });
            try
            {
                var existingJson = moduleSettings.GetSetting(0, NamedConnectionCatalog.SettingKey, "");
                // [MaskRoundTrip v20260726] The editor prefills the MASKED string, so a save that
                // only changed the server/database still carries password=***. Put the stored
                // secret back instead of persisting the mask. (DNN twin: MegaFormApiController.)
                var prior = NamedConnectionCatalog.Parse(existingJson)
                    .FirstOrDefault(c => string.Equals(c.Name?.Trim(), (name ?? string.Empty).Trim(), System.StringComparison.OrdinalIgnoreCase));
                var next = NamedConnectionCatalog.Upsert(
                    existingJson,
                    new NamedConnectionInfo { Name = name, Provider = provider, ConnectionString = NamedConnectionCatalog.RestoreMaskedSecrets(connectionString, prior?.ConnectionString) });
                moduleSettings.SetSetting(0, NamedConnectionCatalog.SettingKey, next);
                return Ok(new { success = true, message = "Connection '" + name.Trim() + "' saved." });
            }
            catch { return StatusCode(500, new { success = false, error = "Could not save the connection." }); }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/ConnectionsDelete")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult DeleteNamedConnection(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            var name = body?.Value<string>("name") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name)) return Ok(new { success = false, message = "Connection name is required." });
            try
            {
                var json = moduleSettings.GetSetting(0, NamedConnectionCatalog.SettingKey, "");
                if (!NamedConnectionCatalog.Contains(json, name))
                    return Ok(new { success = false, message = "Only saved connections can be deleted (config entries live in appsettings.json)." });
                moduleSettings.SetSetting(0, NamedConnectionCatalog.SettingKey, NamedConnectionCatalog.Remove(json, name));
                return Ok(new { success = true, message = "Connection '" + name.Trim() + "' deleted." });
            }
            catch { return StatusCode(500, new { success = false, error = "Could not delete the connection." }); }
        }

        // ── Cloud Storage Connections (CloudStorage v20260723-01) ──
        // DNN/Web twin. One JSON blob in module settings under CloudStorageConnectionCatalog.SettingKey.
        // Same gates as the SQL connections above: Browse to list, Edit to save/delete/test.
        // Secrets never leave the server unmasked — MaskSecrets on read, "***" on save/test
        // means "keep the stored value" (same convention as database connection passwords).

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/CloudStorageConnectionsList")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public async Task<IActionResult> ListCloudStorageConnections(
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IStorageIntegrationService storageIntegration)
        {
            var json = moduleSettings.GetSetting(0, CloudStorageConnectionCatalog.SettingKey, "");
            var items = CloudStorageConnectionCatalog.Parse(json)
                .Select(c => CloudStorageConnectionCatalog.MaskSecrets(c))
                .ToList();
            var providers = storageIntegration != null
                ? await storageIntegration.GetRegisteredProviderNamesAsync()
                : (IReadOnlyList<string>)new string[0];
            return Ok(new { success = true, connections = items, providers });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/CloudStorageConnectionSave")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public async Task<IActionResult> SaveCloudStorageConnection(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IStorageIntegrationService storageIntegration)
        {
            if (body == null) return Ok(new { success = false, message = "Request body is required." });
            var entry = ReadCloudStorageEntry(body);
            var nameErr = CloudStorageConnectionCatalog.ValidateName(entry.Name);
            if (nameErr != null) return Ok(new { success = false, message = nameErr });
            entry.Provider = (entry.Provider ?? string.Empty).Trim();
            if (entry.Provider.Length == 0)
                return Ok(new { success = false, message = "Provider is required." });

            var providers = storageIntegration != null ? await storageIntegration.GetRegisteredProviderNamesAsync() : null;
            if (providers == null || !providers.Any(p => string.Equals(p, entry.Provider, StringComparison.OrdinalIgnoreCase)))
                return Ok(new { success = false, message = "Storage provider '" + entry.Provider + "' is not registered on this server." });

            try
            {
                var json = moduleSettings.GetSetting(0, CloudStorageConnectionCatalog.SettingKey, "");
                var existing = CloudStorageConnectionCatalog.Find(json, entry.Name);
                if (existing != null)
                {
                    if (entry.AccessToken == "***") entry.AccessToken = existing.AccessToken;
                    if (entry.RefreshToken == "***") entry.RefreshToken = existing.RefreshToken;
                    if (entry.ClientSecret == "***") entry.ClientSecret = existing.ClientSecret;
                }
                moduleSettings.SetSetting(0, CloudStorageConnectionCatalog.SettingKey,
                    CloudStorageConnectionCatalog.Upsert(json, entry));
                return Ok(new { success = true, message = "Connection '" + entry.Name.Trim() + "' saved." });
            }
            catch { return StatusCode(500, new { success = false, error = "Could not save the connection." }); }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/CloudStorageConnectionDelete")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult DeleteCloudStorageConnection(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            var name = body?.Value<string>("name") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name)) return Ok(new { success = false, message = "Connection name is required." });
            try
            {
                var json = moduleSettings.GetSetting(0, CloudStorageConnectionCatalog.SettingKey, "");
                if (!CloudStorageConnectionCatalog.Contains(json, name))
                    return Ok(new { success = false, message = "Unknown connection '" + name.Trim() + "'." });
                moduleSettings.SetSetting(0, CloudStorageConnectionCatalog.SettingKey,
                    CloudStorageConnectionCatalog.Remove(json, name));
                return Ok(new { success = true, message = "Connection '" + name.Trim() + "' deleted." });
            }
            catch { return StatusCode(500, new { success = false, error = "Could not delete the connection." }); }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/CloudStorageConnectionTest")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public async Task<IActionResult> TestCloudStorageConnection(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IStorageIntegrationService storageIntegration)
        {
            if (body == null) return Ok(new { success = false, message = "Request body is required." });
            if (storageIntegration == null)
                return Ok(new { success = false, message = "Storage integration is not available on this server." });
            var entry = ReadCloudStorageEntry(body);
            if (string.IsNullOrWhiteSpace(entry.Provider))
                return Ok(new { success = false, message = "Provider is required." });

            // Resolve masked secrets against the stored entry so Test works before Save.
            var stored = CloudStorageConnectionCatalog.Find(
                moduleSettings.GetSetting(0, CloudStorageConnectionCatalog.SettingKey, ""), entry.Name);
            if (stored != null)
            {
                if (entry.AccessToken == "***") entry.AccessToken = stored.AccessToken;
                if (entry.RefreshToken == "***") entry.RefreshToken = stored.RefreshToken;
                if (entry.ClientSecret == "***") entry.ClientSecret = stored.ClientSecret;
            }

            try
            {
                var result = await storageIntegration.TestConnectionAsync(
                    entry.Provider, CloudStorageConnectionCatalog.ToConnectionSettings(entry), CancellationToken.None);
                return Ok(new
                {
                    success = result != null && result.Healthy,
                    message = result == null ? "Connection test failed." : result.Message
                });
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = ex.Message });
            }
        }

        private static CloudStorageConnectionInfo ReadCloudStorageEntry(JObject body)
        {
            var entry = new CloudStorageConnectionInfo
            {
                Name = body.Value<string>("name"),
                Provider = body.Value<string>("provider"),
                AccessToken = body.Value<string>("accessToken"),
                RefreshToken = body.Value<string>("refreshToken"),
                ClientId = body.Value<string>("clientId"),
                ClientSecret = body.Value<string>("clientSecret"),
                BaseFolder = body.Value<string>("baseFolder"),
                BaseUrl = body.Value<string>("baseUrl")
            };
            if (body["extra"] is JObject extra)
            {
                foreach (var prop in extra.Properties())
                    entry.Extra[prop.Name] = prop.Value == null || prop.Value.Type == JTokenType.Null
                        ? string.Empty
                        : prop.Value.ToString();
            }
            return entry;
        }

        // ── Payment Settings ──

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/PaymentSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult GetPaymentSettings([FromServices] IModuleSettingsService moduleSettings)
        {
            string Mask(string v) => string.IsNullOrWhiteSpace(v) ? "" : (v.Length > 8 ? v.Substring(0, 8) + "…" : "****");
            var sk = moduleSettings.GetSetting(0, "Payment_Stripe_SecretKey");
            var ppC = moduleSettings.GetSetting(0, "Payment_PayPal_ClientId");
            var ppS = moduleSettings.GetSetting(0, "Payment_PayPal_ClientSecret");
            return Ok(new {
                stripeEnabled = moduleSettings.GetSetting(0, "Payment_Stripe_Enabled") == "1",
                stripePublishableKey = moduleSettings.GetSetting(0, "Payment_Stripe_PublishableKey"),
                stripeSecretKeyMasked = Mask(sk),
                stripeSecretKeySaved = !string.IsNullOrWhiteSpace(sk),
                paypalEnabled = moduleSettings.GetSetting(0, "Payment_PayPal_Enabled") == "1",
                paypalMode = moduleSettings.GetSetting(0, "Payment_PayPal_Mode", "sandbox"),
                paypalClientId = ppC,
                paypalClientSecretMasked = Mask(ppS),
                paypalClientSecretSaved = !string.IsNullOrWhiteSpace(ppS),
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/PaymentSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SavePaymentSettings(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            void SaveIfSet(string key, string jsonKey)
            {
                var v = body.Value<string>(jsonKey);
                if (v != null) moduleSettings.SetSetting(0, key, v);
            }
            void SaveBool(string key, string jsonKey)
            {
                var v = body[jsonKey];
                if (v != null) moduleSettings.SetSetting(0, key, v.Value<bool>() ? "1" : "0");
            }

            SaveBool("Payment_Stripe_Enabled", "stripeEnabled");
            SaveIfSet("Payment_Stripe_PublishableKey", "stripePublishableKey");
            var sk = body.Value<string>("stripeSecretKey");
            if (!string.IsNullOrWhiteSpace(sk) && !sk.Contains("…"))
                moduleSettings.SetSetting(0, "Payment_Stripe_SecretKey", sk);

            SaveBool("Payment_PayPal_Enabled", "paypalEnabled");
            SaveIfSet("Payment_PayPal_Mode", "paypalMode");
            SaveIfSet("Payment_PayPal_ClientId", "paypalClientId");
            var ppS = body.Value<string>("paypalClientSecret");
            if (!string.IsNullOrWhiteSpace(ppS) && !ppS.Contains("…"))
                moduleSettings.SetSetting(0, "Payment_PayPal_ClientSecret", ppS);

            return Ok(new { success = true, message = "Payment settings saved." });
        }

        // ── Captcha Settings ──

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/CaptchaSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult GetCaptchaSettings(
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IConfiguration cfg)
        {
            string Mask(string v) => string.IsNullOrWhiteSpace(v) ? "" : (v.Length > 8 ? v.Substring(0, 8) + "…" : "****");
            var rcSecret = moduleSettings.GetSetting(0, "Captcha_ReCaptcha_SecretKey", cfg["Captcha:ReCaptcha:SecretKey"] ?? "");
            var hcSecret = moduleSettings.GetSetting(0, "Captcha_HCaptcha_SecretKey", cfg["Captcha:HCaptcha:SecretKey"] ?? "");
            return Ok(new {
                reCaptchaSiteKey = moduleSettings.GetSetting(0, "Captcha_ReCaptcha_SiteKey", cfg["Captcha:ReCaptcha:SiteKey"] ?? ""),
                reCaptchaSecretKeyMasked = Mask(rcSecret),
                reCaptchaSecretKeySaved = !string.IsNullOrWhiteSpace(rcSecret),
                hCaptchaSiteKey = moduleSettings.GetSetting(0, "Captcha_HCaptcha_SiteKey", cfg["Captcha:HCaptcha:SiteKey"] ?? ""),
                hCaptchaSecretKeyMasked = Mask(hcSecret),
                hCaptchaSecretKeySaved = !string.IsNullOrWhiteSpace(hcSecret)
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/CaptchaSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SaveCaptchaSettings(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            void SaveIfSet(string key, string jsonKey)
            {
                var v = body.Value<string>(jsonKey);
                if (v != null) moduleSettings.SetSetting(0, key, v.Trim());
            }

            SaveIfSet("Captcha_ReCaptcha_SiteKey", "reCaptchaSiteKey");
            SaveIfSet("Captcha_HCaptcha_SiteKey", "hCaptchaSiteKey");

            var rcSecret = body.Value<string>("reCaptchaSecretKey");
            if (!string.IsNullOrWhiteSpace(rcSecret) && !rcSecret.Contains("…"))
                moduleSettings.SetSetting(0, "Captcha_ReCaptcha_SecretKey", rcSecret.Trim());

            var hcSecret = body.Value<string>("hCaptchaSecretKey");
            if (!string.IsNullOrWhiteSpace(hcSecret) && !hcSecret.Contains("…"))
                moduleSettings.SetSetting(0, "Captcha_HCaptcha_SecretKey", hcSecret.Trim());

            return Ok(new { success = true, message = "Captcha settings saved." });
        }

        // ── Email Settings ──

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/EmailSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult GetEmailSettings(
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IConfiguration cfg)
        {
            string provider = moduleSettings.GetSetting(0, "Email_Provider", cfg["Email:Provider"] ?? "generic");
            string host = moduleSettings.GetSetting(0, "Email_Host", cfg["Email:Host"] ?? "localhost");
            string port = moduleSettings.GetSetting(0, "Email_Port", cfg["Email:Port"] ?? "25");
            string from = moduleSettings.GetSetting(0, "Email_From", cfg["Email:From"] ?? "noreply@megaform.local");
            string fromName = moduleSettings.GetSetting(0, "Email_FromName", cfg["Email:FromName"] ?? "MegaForm");
            string user = moduleSettings.GetSetting(0, "Email_User", cfg["Email:Username"] ?? cfg["Email:User"] ?? "");
            string pass = moduleSettings.GetSetting(0, "Email_Password", cfg["Email:Password"] ?? "");
            string ssl = moduleSettings.GetSetting(0, "Email_EnableSsl", cfg["Email:EnableSsl"] ?? "0");
            string replyTo = moduleSettings.GetSetting(0, "Email_ReplyTo", cfg["Email:ReplyTo"] ?? "");
            string timeoutMs = moduleSettings.GetSetting(0, "Email_TimeoutMs", cfg["Email:TimeoutMs"] ?? "20000");
            return Ok(new {
                provider,
                host,
                port,
                from,
                fromName,
                username = user,
                replyTo,
                timeoutMs,
                passwordSaved = !string.IsNullOrWhiteSpace(pass),
                enableSsl = ssl == "1" || ssl.Equals("true", StringComparison.OrdinalIgnoreCase)
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/EmailSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SaveEmailSettings(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            void SaveIfSet(string key, string jsonKey)
            {
                var v = body.Value<string>(jsonKey);
                if (v != null) moduleSettings.SetSetting(0, key, v);
            }

            SaveIfSet("Email_Provider", "provider");
            SaveIfSet("Email_Host", "host");
            SaveIfSet("Email_Port", "port");
            SaveIfSet("Email_From", "from");
            SaveIfSet("Email_FromName", "fromName");
            SaveIfSet("Email_User", "username");
            SaveIfSet("Email_ReplyTo", "replyTo");
            SaveIfSet("Email_TimeoutMs", "timeoutMs");
            var pw = body.Value<string>("password");
            if (pw != null && !string.IsNullOrWhiteSpace(pw) && !pw.Contains("•"))
                moduleSettings.SetSetting(0, "Email_Password", pw);
            if (body["enableSsl"] != null)
                moduleSettings.SetSetting(0, "Email_EnableSsl", body.Value<bool>("enableSsl") ? "1" : "0");

            return Ok(new { success = true, message = "Email settings saved." });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/EmailSettings/Test")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult TestEmailSettings(
            [FromBody] JObject body,
            [FromServices] SmtpEmailSender emailSender,
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] IConfiguration cfg)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            var to = body.Value<string>("to");
            if (string.IsNullOrWhiteSpace(to)) return BadRequest(new { error = "Recipient email required" });

            var options = new SmtpEmailOptions
            {
                Host = body.Value<string>("host") ?? moduleSettings.GetSetting(0, "Email_Host", cfg["Email:Host"] ?? "localhost"),
                Port = int.TryParse(body.Value<string>("port"), out var port) ? port : int.TryParse(moduleSettings.GetSetting(0, "Email_Port", cfg["Email:Port"] ?? "25"), out var savedPort) ? savedPort : 25,
                FromEmail = body.Value<string>("from") ?? moduleSettings.GetSetting(0, "Email_From", cfg["Email:From"] ?? "noreply@megaform.local"),
                FromName = body.Value<string>("fromName") ?? moduleSettings.GetSetting(0, "Email_FromName", cfg["Email:FromName"] ?? "MegaForm"),
                Username = body.Value<string>("username") ?? moduleSettings.GetSetting(0, "Email_User", cfg["Email:Username"] ?? cfg["Email:User"] ?? ""),
                Password = !string.IsNullOrWhiteSpace(body.Value<string>("password")) && !(body.Value<string>("password") ?? string.Empty).Contains("•")
                    ? body.Value<string>("password")
                    : moduleSettings.GetSetting(0, "Email_Password", cfg["Email:Password"] ?? ""),
                ReplyTo = body.Value<string>("replyTo") ?? moduleSettings.GetSetting(0, "Email_ReplyTo", cfg["Email:ReplyTo"] ?? ""),
                TimeoutMs = int.TryParse(body.Value<string>("timeoutMs"), out var timeoutMs) ? timeoutMs : int.TryParse(moduleSettings.GetSetting(0, "Email_TimeoutMs", cfg["Email:TimeoutMs"] ?? "20000"), out var savedTimeout) ? savedTimeout : 20000,
                EnableSsl = body["enableSsl"] != null ? body.Value<bool>("enableSsl") : ((moduleSettings.GetSetting(0, "Email_EnableSsl", cfg["Email:EnableSsl"] ?? "0") ?? "0") is string s && (s == "1" || s.Equals("true", StringComparison.OrdinalIgnoreCase)))
            };

            try
            {
                emailSender.SendUsingOptions(options, to.Trim(), "MegaForm test email", "<p>MegaForm SMTP test successful.</p><p>If you received this email, your email settings are working.</p>");
                return Ok(new { success = true, message = $"Test email sent using {options.FromEmail}. Check inbox and spam folder.", from = options.FromEmail, fromName = options.FromName });
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = ex.Message });
            }
        }

        // ── Upload Settings ──

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/UploadSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult GetUploadSettings([FromServices] IModuleSettingsService moduleSettings)
        {
            var allowed = moduleSettings.GetSetting(0, "Upload_AllowedExtensions", FileUploadSecurityService.GetDefaultAllowedExtensionsCsv());
            var blocked = moduleSettings.GetSetting(0, "Upload_BlockedExtensions", FileUploadSecurityService.GetDefaultBlockedExtensionsCsv());
            var maxSizeMbStr = moduleSettings.GetSetting(0, "Upload_MaxSizeMB", "10");
            int maxSizeMb = int.TryParse(maxSizeMbStr, out var m) ? m : 10;
            return Ok(new
            {
                maxSizeMb,
                allowedExtensions = allowed,
                blockedExtensions = blocked,
                storageMode = "private",
                notes = new[]
                {
                    "Uploads are stored in App_Data/MegaForm/PrivateUploads, not under public wwwroot.",
                    "Upload requests must target a published form and a real File widget key."
                }
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/UploadSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SaveUploadSettings(
            [FromBody] JObject body,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            var maxSizeMb = body.Value<int?>("maxSizeMb") ?? 10;
            if (maxSizeMb < 1) maxSizeMb = 1;
            if (maxSizeMb > 250) maxSizeMb = 250;
            var allowed = FileUploadSecurityService.NormalizeExtensionsCsv(body.Value<string>("allowedExtensions"), FileUploadSecurityService.GetDefaultAllowedExtensionsCsv());
            var blocked = FileUploadSecurityService.NormalizeExtensionsCsv(body.Value<string>("blockedExtensions"), FileUploadSecurityService.GetDefaultBlockedExtensionsCsv());
            moduleSettings.SetSetting(0, "Upload_MaxSizeMB", maxSizeMb.ToString());
            moduleSettings.SetSetting(0, "Upload_AllowedExtensions", allowed);
            moduleSettings.SetSetting(0, "Upload_BlockedExtensions", blocked);
            return Ok(new { success = true, message = "Upload settings saved.", storageMode = "private" });
        }

        // ── Google Sheets Settings ──

        private const string GsJsonKey = "MegaForm_Google_ServiceAccountJson";
        private const string GsSpreadsheetKey = "MegaForm_Google_DefaultSpreadsheetId";
        private const string GsRangeKey = "MegaForm_Google_DefaultRange";

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/GoogleSheetsSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult GetGoogleSheetsSettings([FromServices] IModuleSettingsService moduleSettings)
        {
            string json = string.Empty, spreadsheet = string.Empty, range = string.Empty;
            try
            {
                json = moduleSettings.GetSetting(0, GsJsonKey, string.Empty);
                spreadsheet = moduleSettings.GetSetting(0, GsSpreadsheetKey, string.Empty);
                range = moduleSettings.GetSetting(0, GsRangeKey, string.Empty);
            }
            catch { /* return defaults */ }

            return Ok(new
            {
                hasJson = !string.IsNullOrWhiteSpace(json),
                clientEmail = ExtractClientEmail(json),
                defaultSpreadsheetId = spreadsheet,
                defaultRange = string.IsNullOrWhiteSpace(range) ? "Sheet1!A:Z" : range
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/GoogleSheetsSettings")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SaveGoogleSheetsSettings(
            [FromBody] MegaFormGoogleSheetsSettingsRequest req,
            [FromServices] IModuleSettingsService moduleSettings)
        {
            if (req == null) return Ok(new { success = false, message = "Request body is required." });
            try
            {
                if (!string.IsNullOrWhiteSpace(req.ServiceAccountJson))
                {
                    var trimmed = req.ServiceAccountJson.Trim();
                    if (!LooksLikeServiceAccountJson(trimmed))
                        return Ok(new { success = false, message = "That does not look like a Service Account JSON (missing client_email / private_key)." });
                    moduleSettings.SetSetting(0, GsJsonKey, trimmed);
                }

                if (req.DefaultSpreadsheetId != null)
                    moduleSettings.SetSetting(0, GsSpreadsheetKey, req.DefaultSpreadsheetId.Trim());
                if (req.DefaultRange != null)
                    moduleSettings.SetSetting(0, GsRangeKey, req.DefaultRange.Trim());

                return Ok(new { success = true, message = "Google Sheets settings saved." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/GoogleSheetsSettings/Test")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public async Task<IActionResult> TestGoogleSheetsSettings(
            [FromBody] MegaFormGoogleSheetsSettingsRequest req,
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] GoogleSheetsAuthService auth)
        {
            string json = req != null ? req.ServiceAccountJson : null;
            if (string.IsNullOrWhiteSpace(json))
                json = moduleSettings.GetSetting(0, GsJsonKey, string.Empty);

            if (string.IsNullOrWhiteSpace(json))
                return Ok(new { success = false, message = "No Service Account JSON to test — paste one or save first." });

            if (auth == null)
                return Ok(new { success = false, message = "Google auth service is not available on this server." });

            try
            {
                var result = await auth.ValidateServiceAccountAsync(json, CancellationToken.None);
                return Ok(new
                {
                    success = result.Ok,
                    message = result.Ok
                        ? ("Connection OK" + (string.IsNullOrWhiteSpace(result.Warning) ? "." : " — " + result.Warning))
                        : (string.IsNullOrWhiteSpace(result.Error) ? "Validation failed." : result.Error),
                    clientEmail = result.ClientEmail
                });
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/GoogleSheetsTestSheet")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public async Task<IActionResult> TestGoogleSheetAccess(
            [FromBody] MegaFormGoogleSheetsSettingsRequest req,
            [FromServices] IModuleSettingsService moduleSettings,
            [FromServices] GoogleSheetsAuthService auth)
        {
            var spreadsheetId = req != null ? (req.DefaultSpreadsheetId ?? string.Empty).Trim() : string.Empty;
            if (string.IsNullOrWhiteSpace(spreadsheetId))
                return Ok(new { success = false, message = "Spreadsheet ID is required." });

            var json = moduleSettings.GetSetting(0, GsJsonKey, string.Empty);
            if (string.IsNullOrWhiteSpace(json))
                return Ok(new { success = false, message = "No Service Account JSON saved. Configure it in Google Sheets settings first." });

            if (auth == null) return Ok(new { success = false, message = "Google auth service is not available on this server." });

            try
            {
                var result = await auth.TestSpreadsheetAccessAsync(json, spreadsheetId, CancellationToken.None);
                var tabs = result.Sheets ?? new System.Collections.Generic.List<string>();
                return Ok(new
                {
                    success = result.Ok,
                    message = result.Ok
                        ? ("✓ Sheet reachable: \"" + (result.Warning ?? spreadsheetId) + "\"" + (tabs.Count > 0 ? " — tabs: " + string.Join(", ", tabs) : ""))
                        : (string.IsNullOrWhiteSpace(result.Error) ? "Test failed." : result.Error),
                    clientEmail = result.ClientEmail,
                    title = result.Warning,
                    sheets = tabs,
                });
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = ex.Message });
            }
        }

        // ── helpers ──

        private static string InferDatabaseType(string connStr)
        {
            var lower = (connStr ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(lower)) return string.Empty;
            var looksSqlite = (lower.Contains("data source=") || lower.Contains("datasource=") || lower.Contains("filename=") || lower.Contains("mode=memory") || lower.Contains("cache=shared") || lower.Contains(".db") || lower.Contains(".sqlite"))
                && !lower.Contains("initial catalog=") && !lower.Contains("trusted_connection=") && !lower.Contains("integrated security=") && !lower.Contains("network library=");
            if (looksSqlite) return "Sqlite";
            if (lower.Contains("host=") && (lower.Contains("username=") || lower.Contains("search path=") || lower.Contains("port=5432"))) return "PostgreSql";
            if ((lower.Contains("server=") || lower.Contains("host=")) && (lower.Contains("uid=") || lower.Contains("user id=") || lower.Contains("port=3306"))) return "MySql";
            return "SqlServer";
        }

        private static bool LooksLikeServiceAccountJson(string json)
        {
            try
            {
                var o = JObject.Parse(json);
                return o["client_email"] != null && o["private_key"] != null;
            }
            catch { return false; }
        }

        private static string ExtractClientEmail(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return string.Empty;
            try
            {
                var o = JObject.Parse(json);
                var v = o["client_email"];
                return v != null ? (string)v : string.Empty;
            }
            catch { return string.Empty; }
        }
    }

    public class MegaFormGoogleSheetsSettingsRequest
    {
        public string ServiceAccountJson { get; set; }
        public string DefaultSpreadsheetId { get; set; }
        public string DefaultRange { get; set; }
    }
}
