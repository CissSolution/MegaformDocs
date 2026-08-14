using System;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// [WebGoogleSheets v20260710] Google Sheets Service Account settings endpoints
    /// for the standalone Web host. Mirrors Oqtane's ModuleConfig/GoogleSheetsSettings*.
    /// </summary>
    public partial class MegaFormController
    {
        private const string GsJsonKey = "MegaForm_Google_ServiceAccountJson";
        private const string GsSpreadsheetKey = "MegaForm_Google_DefaultSpreadsheetId";
        private const string GsRangeKey = "MegaForm_Google_DefaultRange";

        [HttpGet("ModuleConfig/GoogleSheetsSettings")]
        [Authorize]
        public IActionResult GetGoogleSheetsSettings()
        {
            if (!IsAdmin(GetCurrentUserContext())) return Forbid();

            string json = string.Empty, spreadsheet = string.Empty, range = string.Empty;
            try
            {
                json = _moduleSettings.GetSetting(0, GsJsonKey, string.Empty);
                spreadsheet = _moduleSettings.GetSetting(0, GsSpreadsheetKey, string.Empty);
                range = _moduleSettings.GetSetting(0, GsRangeKey, string.Empty);
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
            if (!IsAdmin(GetCurrentUserContext())) return Forbid();
            if (req == null) return Ok(new { success = false, message = "Request body is required." });

            try
            {
                if (!string.IsNullOrWhiteSpace(req.ServiceAccountJson))
                {
                    var trimmed = req.ServiceAccountJson.Trim();
                    if (!LooksLikeServiceAccountJson(trimmed))
                        return Ok(new { success = false, message = "That does not look like a Service Account JSON (missing client_email / private_key)." });
                    _moduleSettings.SetSetting(0, GsJsonKey, trimmed);
                }

                if (req.DefaultSpreadsheetId != null)
                    _moduleSettings.SetSetting(0, GsSpreadsheetKey, req.DefaultSpreadsheetId.Trim());
                if (req.DefaultRange != null)
                    _moduleSettings.SetSetting(0, GsRangeKey, req.DefaultRange.Trim());

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
            if (!IsAdmin(GetCurrentUserContext())) return Forbid();

            string json = req != null ? req.ServiceAccountJson : null;
            if (string.IsNullOrWhiteSpace(json))
                json = _moduleSettings.GetSetting(0, GsJsonKey, string.Empty);

            if (string.IsNullOrWhiteSpace(json))
                return Ok(new { success = false, message = "No Service Account JSON to test — paste one or save first." });

            var auth = HttpContext.RequestServices.GetService(typeof(GoogleSheetsAuthService)) as GoogleSheetsAuthService;
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

        [HttpPost("ModuleConfig/GoogleSheetsTestSheet")]
        [Authorize]
        public async Task<IActionResult> TestGoogleSheetAccess([FromBody] MegaFormGoogleSheetsSettingsRequest req)
        {
            if (!IsAdmin(GetCurrentUserContext())) return Forbid();

            var spreadsheetId = req != null ? (req.DefaultSpreadsheetId ?? string.Empty).Trim() : string.Empty;
            if (string.IsNullOrWhiteSpace(spreadsheetId))
                return Ok(new { success = false, message = "Spreadsheet ID is required." });

            var json = _moduleSettings.GetSetting(0, GsJsonKey, string.Empty);
            if (string.IsNullOrWhiteSpace(json))
                return Ok(new { success = false, message = "No Service Account JSON saved. Configure it in Google Sheets settings first." });

            var auth = HttpContext.RequestServices.GetService(typeof(GoogleSheetsAuthService)) as GoogleSheetsAuthService;
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

    public class MegaFormGoogleSheetsSettingsRequest
    {
        public string ServiceAccountJson { get; set; }
        public string DefaultSpreadsheetId { get; set; }
        public string DefaultRange { get; set; }
    }
}
