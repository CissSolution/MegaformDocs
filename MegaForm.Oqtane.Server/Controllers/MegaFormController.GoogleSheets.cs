// ════════════════════════════════════════════════════════════════════════
//  MegaFormController.GoogleSheets
//  ───────────────────────────────
//  TASK 2 · v20260610-B121
//
//  Runtime-configurable Google Sheets credentials for the "push submissions
//  to a Google Sheet" workflow node. Stores the Service Account JSON +
//  default spreadsheet on the SITE settings (so it can be pasted from the
//  dashboard "Google Sheets" page with no server restart), and validated
//  with a real OAuth2 token exchange. The runtime executor reads the same
//  site setting via OqtaneGoogleAuthSettings.
//
//  Endpoints (admin-only, /api/MegaForm/...):
//    GET  ModuleConfig/GoogleSheetsSettings        → { hasJson, clientEmail, defaultSpreadsheetId, defaultRange }
//    POST ModuleConfig/GoogleSheetsSettings        → save  { serviceAccountJson?, defaultSpreadsheetId?, defaultRange? }
//    POST ModuleConfig/GoogleSheetsSettings/Test   → { success, message, clientEmail }
//
//  The raw Service Account JSON is NEVER returned to the browser (only the
//  parsed client_email + a hasJson flag), and is stored IsPrivate=true.
// ════════════════════════════════════════════════════════════════════════
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    // POCO so System.Text.Json binds it (Oqtane has no AddNewtonsoftJson).
    public class MegaFormGoogleSheetsSettingsRequest
    {
        public string ServiceAccountJson { get; set; }
        public string DefaultSpreadsheetId { get; set; }
        public string DefaultRange { get; set; }
    }

    public partial class MegaFormController
    {
        private const string GsJsonKey = "MegaForm_Google_ServiceAccountJson";
        private const string GsSpreadsheetKey = "MegaForm_Google_DefaultSpreadsheetId";
        private const string GsRangeKey = "MegaForm_Google_DefaultRange";

        [HttpGet("ModuleConfig/GoogleSheetsSettings")]
        [Authorize]
        public IActionResult GetGoogleSheetsSettings()
        {
            if (!CanUseAdminPopup()) return Forbid();

            string json = string.Empty, spreadsheet = string.Empty, range = string.Empty;
            try
            {
                var siteId = AuthEntityId(EntityNames.Site);
                var s = ReadSettings(EntityNames.Site, siteId);
                json = ReadSetting(s, GsJsonKey, string.Empty);
                spreadsheet = ReadSetting(s, GsSpreadsheetKey, string.Empty);
                range = ReadSetting(s, GsRangeKey, string.Empty);
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

        [HttpPost("ModuleConfig/GoogleSheetsSettings")]
        [Authorize]
        public IActionResult SaveGoogleSheetsSettings([FromBody] MegaFormGoogleSheetsSettingsRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (req == null) return Ok(new { success = false, message = "Request body is required." });

            try
            {
                var siteId = AuthEntityId(EntityNames.Site);

                // Only overwrite the JSON when a non-empty value is posted, so an
                // operator can update the default spreadsheet without re-pasting
                // the (sensitive) key. Stored IsPrivate=true.
                if (!string.IsNullOrWhiteSpace(req.ServiceAccountJson))
                {
                    var trimmed = req.ServiceAccountJson.Trim();
                    if (!LooksLikeServiceAccountJson(trimmed))
                        return Ok(new { success = false, message = "That does not look like a Service Account JSON (missing client_email / private_key)." });
                    UpsertSetting(EntityNames.Site, siteId, GsJsonKey, trimmed, true);
                }

                if (req.DefaultSpreadsheetId != null)
                    UpsertSetting(EntityNames.Site, siteId, GsSpreadsheetKey, req.DefaultSpreadsheetId.Trim(), false);
                if (req.DefaultRange != null)
                    UpsertSetting(EntityNames.Site, siteId, GsRangeKey, req.DefaultRange.Trim(), false);

                return Ok(new { success = true, message = "Google Sheets settings saved." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpPost("ModuleConfig/GoogleSheetsSettings/Test")]
        [Authorize]
        public async Task<IActionResult> TestGoogleSheetsSettings([FromBody] MegaFormGoogleSheetsSettingsRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();

            // Test the posted JSON if provided; otherwise the already-saved one.
            string json = req != null ? req.ServiceAccountJson : null;
            if (string.IsNullOrWhiteSpace(json))
            {
                try
                {
                    var siteId = AuthEntityId(EntityNames.Site);
                    var s = ReadSettings(EntityNames.Site, siteId);
                    json = ReadSetting(s, GsJsonKey, string.Empty);
                }
                catch { /* json stays empty → handled below */ }
            }

            if (string.IsNullOrWhiteSpace(json))
                return Ok(new { success = false, message = "No Service Account JSON to test — paste one or save first." });

            var auth = HttpContext.RequestServices.GetService(typeof(MegaForm.Core.Services.GoogleSheetsAuthService))
                as MegaForm.Core.Services.GoogleSheetsAuthService;
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

        // [PerSheetTest 2026-06-11] GS settings are GLOBAL but each form connects to a
        // DIFFERENT spreadsheet — so this verifies the saved (global) service account can
        // ACCESS a specific spreadsheet id (i.e. the sheet was shared with its client_email).
        // POST ModuleConfig/GoogleSheetsTestSheet { defaultSpreadsheetId } → { success, message, clientEmail, title }
        [HttpPost("ModuleConfig/GoogleSheetsTestSheet")]
        [Authorize]
        public async Task<IActionResult> TestGoogleSheetAccess([FromBody] MegaFormGoogleSheetsSettingsRequest req)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var spreadsheetId = req != null ? (req.DefaultSpreadsheetId ?? string.Empty).Trim() : string.Empty;
            if (string.IsNullOrWhiteSpace(spreadsheetId))
                return Ok(new { success = false, message = "Spreadsheet ID is required." });

            string json;
            try
            {
                var siteId = AuthEntityId(EntityNames.Site);
                var s = ReadSettings(EntityNames.Site, siteId);
                json = ReadSetting(s, GsJsonKey, string.Empty);
            }
            catch { json = string.Empty; }
            if (string.IsNullOrWhiteSpace(json))
                return Ok(new { success = false, message = "No Service Account JSON saved. Configure it in Google Sheets settings first." });

            var auth = HttpContext.RequestServices.GetService(typeof(MegaForm.Core.Services.GoogleSheetsAuthService))
                as MegaForm.Core.Services.GoogleSheetsAuthService;
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
}
