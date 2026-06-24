using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Handles Google Service Account OAuth2 JWT flow and cached access tokens
    /// for the Google Sheets API v4 runtime.
    /// </summary>
    public class GoogleSheetsAuthService
    {
        private readonly IGoogleAuthSettings _settings;
        private readonly ILogService _log;
        private static readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        private static string _cachedToken;
        private static DateTime _tokenExpiry = DateTime.MinValue;
        private static readonly object _tokenLock = new object();

        public GoogleSheetsAuthService(IGoogleAuthSettings settings, ILogService log)
        {
            _settings = settings;
            _log = log;
        }

        /// <summary>
        /// Validates an arbitrary Service Account JSON without touching the cached
        /// token — used by the "Test connection" button on the settings UI. On
        /// .NET 8+ it performs a real OAuth2 token exchange (proving the key works);
        /// on net472 it validates the JSON structure only.
        /// </summary>
        public async Task<GoogleAuthValidationResult> ValidateServiceAccountAsync(string saJson, CancellationToken ct = default)
        {
            var result = new GoogleAuthValidationResult();
            if (string.IsNullOrWhiteSpace(saJson))
            {
                result.Error = "Service Account JSON is empty.";
                return result;
            }

            Dictionary<string, string> sa;
            try { sa = JsonConvert.DeserializeObject<Dictionary<string, string>>(saJson); }
            catch (Exception ex) { result.Error = "Invalid JSON: " + ex.Message; return result; }

            if (sa == null) { result.Error = "Invalid JSON."; return result; }
            string email;
            sa.TryGetValue("client_email", out email);
            result.ClientEmail = email ?? string.Empty;
            if (string.IsNullOrWhiteSpace(email)) { result.Error = "Service Account JSON missing 'client_email'."; return result; }
            string pk;
            if (!sa.TryGetValue("private_key", out pk) || string.IsNullOrWhiteSpace(pk)) { result.Error = "Service Account JSON missing 'private_key'."; return result; }

#if NET8_0_OR_GREATER
            try
            {
                var token = await CreateAccessTokenAsync(saJson, ct);
                result.Ok = !string.IsNullOrEmpty(token);
                if (!result.Ok) result.Error = "Google returned an empty access token.";
            }
            catch (Exception ex)
            {
                result.Error = ex.Message;
            }
#else
            result.Ok = true;
            result.Warning = "Validated JSON structure only — a live token test requires .NET 8 or greater.";
            await Task.CompletedTask;
#endif
            return result;
        }

#if NET8_0_OR_GREATER
        /// <summary>
        /// Tests whether the (global) service account can ACCESS a specific spreadsheet —
        /// i.e. the sheet has been shared with the service account's client_email. Used by the
        /// per-form "Connect Google Sheet" dialog so each form's own sheet can be verified
        /// before wiring the workflow. On success, Warning carries the sheet's title.
        /// </summary>
        public async Task<GoogleAuthValidationResult> TestSpreadsheetAccessAsync(string saJson, string spreadsheetId, CancellationToken ct = default)
        {
            var result = new GoogleAuthValidationResult();
            if (string.IsNullOrWhiteSpace(saJson)) { result.Error = "No Service Account JSON configured."; return result; }
            if (string.IsNullOrWhiteSpace(spreadsheetId)) { result.Error = "Spreadsheet ID is empty."; return result; }
            try { var sa = JsonConvert.DeserializeObject<Dictionary<string, string>>(saJson); if (sa != null) { sa.TryGetValue("client_email", out var em); result.ClientEmail = em ?? string.Empty; } } catch { }

            string token;
            try { token = await CreateAccessTokenAsync(saJson, ct); }
            catch (Exception ex) { result.Error = "Auth failed: " + ex.Message; return result; }
            if (string.IsNullOrEmpty(token)) { result.Error = "Could not obtain an access token."; return result; }

            try
            {
                var url = "https://sheets.googleapis.com/v4/spreadsheets/" + Uri.EscapeDataString(spreadsheetId) + "?fields=properties.title,sheets.properties.title";
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                using var resp = await _http.SendAsync(req, ct);
                var body = await resp.Content.ReadAsStringAsync(ct);
                if (resp.IsSuccessStatusCode)
                {
                    string title = spreadsheetId;
                    try
                    {
                        var meta = JsonConvert.DeserializeObject<SpreadsheetMeta>(body);
                        title = meta?.properties?.title ?? spreadsheetId;
                        if (meta?.sheets != null)
                            foreach (var sh in meta.sheets)
                                if (sh?.properties?.title != null) result.Sheets.Add(sh.properties.title);
                    }
                    catch { }
                    result.Ok = true;
                    result.Warning = title; // carries the sheet title for the success message
                }
                else
                {
                    // Surface the REAL Google reason so the user knows whether to share the
                    // sheet OR enable the Sheets API in their Google Cloud project.
                    string apiMsg = null;
                    try { apiMsg = JsonConvert.DeserializeObject<GoogleErrorEnvelope>(body)?.error?.message; } catch { }
                    int code = (int)resp.StatusCode;
                    bool apiDisabled = !string.IsNullOrWhiteSpace(apiMsg)
                        && (apiMsg.IndexOf("has not been used", StringComparison.OrdinalIgnoreCase) >= 0
                            || apiMsg.IndexOf("is disabled", StringComparison.OrdinalIgnoreCase) >= 0
                            || apiMsg.IndexOf("SERVICE_DISABLED", StringComparison.OrdinalIgnoreCase) >= 0);
                    if (apiDisabled)
                        result.Error = "The Google Sheets API is NOT enabled for this service account's Google Cloud project. Open Google Cloud Console → APIs & Services → enable 'Google Sheets API', wait ~1 min, then retry. (Google: " + apiMsg + ")";
                    else if (code == 403)
                        result.Error = "Access denied (403). Open the sheet → Share → add the service account email as an Editor." + (string.IsNullOrWhiteSpace(apiMsg) ? "" : " (Google: " + apiMsg + ")");
                    else if (code == 404)
                        result.Error = "Spreadsheet not found (404). Check the Spreadsheet ID / URL.";
                    else
                        result.Error = "Google Sheets API error " + code + (string.IsNullOrWhiteSpace(apiMsg) ? "." : ": " + apiMsg);
                }
            }
            catch (Exception ex) { result.Error = ex.Message; }
            return result;
        }

        private class SpreadsheetMeta { public SpreadsheetMetaProps properties { get; set; } public System.Collections.Generic.List<SheetEntry> sheets { get; set; } }
        private class SpreadsheetMetaProps { public string title { get; set; } }
        private class SheetEntry { public SpreadsheetMetaProps properties { get; set; } }
        private class GoogleErrorEnvelope { public GoogleErrorBody error { get; set; } }
        private class GoogleErrorBody { public int code { get; set; } public string message { get; set; } public string status { get; set; } }
#endif

        /// <summary>
        /// Returns a valid access token, fetching a new one from Google OAuth2
        /// if the cached token has expired or is absent.
        /// </summary>
        public async Task<string> GetAccessTokenAsync(CancellationToken ct = default)
        {
            lock (_tokenLock)
            {
                if (!string.IsNullOrEmpty(_cachedToken) && DateTime.UtcNow < _tokenExpiry.AddMinutes(-5))
                    return _cachedToken;
            }

            var saJson = _settings?.GetServiceAccountJson();
            if (string.IsNullOrWhiteSpace(saJson))
            {
                _log?.LogWarning("MegaForm.GoogleSheets", "Google Service Account JSON is not configured. Sheets API calls will fail.");
                throw new InvalidOperationException("Google Service Account JSON is not configured. Set MegaForm:Google:ServiceAccountJson in appsettings.json or MEGAFORM_GOOGLE_SERVICE_ACCOUNT_JSON environment variable.");
            }

#if NET8_0_OR_GREATER
            var token = await CreateAccessTokenAsync(saJson, ct);
            lock (_tokenLock)
            {
                _cachedToken = token;
                _tokenExpiry = DateTime.UtcNow.AddMinutes(55);
            }
            return token;
#else
            throw new PlatformNotSupportedException("Google Sheets runtime execution requires .NET 8 or greater.");
#endif
        }

#if NET8_0_OR_GREATER
        private async Task<string> CreateAccessTokenAsync(string saJson, CancellationToken ct)
        {
            Dictionary<string, string> sa;
            try
            {
                sa = JsonConvert.DeserializeObject<Dictionary<string, string>>(saJson);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Failed to parse Google Service Account JSON: " + ex.Message);
            }

            if (sa == null || !sa.TryGetValue("client_email", out var clientEmail) || string.IsNullOrWhiteSpace(clientEmail))
                throw new InvalidOperationException("Google Service Account JSON missing 'client_email'.");
            if (!sa.TryGetValue("private_key", out var privateKey) || string.IsNullOrWhiteSpace(privateKey))
                throw new InvalidOperationException("Google Service Account JSON missing 'private_key'.");

            using var rsa = System.Security.Cryptography.RSA.Create();
            rsa.ImportFromPem(privateKey.ToCharArray());

            var iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var exp = iat + 3600;

            var header = Base64UrlEncode("{\"alg\":\"RS256\",\"typ\":\"JWT\"}");
            var claim = Base64UrlEncode(JsonConvert.SerializeObject(new
            {
                iss = clientEmail,
                scope = "https://www.googleapis.com/auth/spreadsheets",
                aud = "https://oauth2.googleapis.com/token",
                iat = iat,
                exp = exp
            }));

            var data = Encoding.UTF8.GetBytes(header + "." + claim);
            var signature = rsa.SignData(data, System.Security.Cryptography.HashAlgorithmName.SHA256, System.Security.Cryptography.RSASignaturePadding.Pkcs1);
            var jwt = header + "." + claim + "." + Base64UrlEncode(signature);

            var body = new Dictionary<string, string>
            {
                { "grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer" },
                { "assertion", jwt }
            };

            var response = await _http.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(body), ct);
            var responseJson = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException("Google OAuth2 token request failed (HTTP " + (int)response.StatusCode + "): " + responseJson);

            var tokenObj = JsonConvert.DeserializeObject<Dictionary<string, string>>(responseJson);
            if (tokenObj == null || !tokenObj.TryGetValue("access_token", out var accessToken) || string.IsNullOrWhiteSpace(accessToken))
                throw new InvalidOperationException("Google OAuth2 response did not contain access_token: " + responseJson);

            _log?.LogInfo("MegaForm.GoogleSheets", "Successfully obtained Google access token for " + clientEmail);
            return accessToken;
        }
#endif

        private static string Base64UrlEncode(string input)
        {
            var bytes = Encoding.UTF8.GetBytes(input);
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        private static string Base64UrlEncode(byte[] input)
        {
            return Convert.ToBase64String(input).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }
    }

    /// <summary>Result of a "Test connection" validation of a Service Account JSON.</summary>
    public class GoogleAuthValidationResult
    {
        public bool Ok { get; set; }
        public string ClientEmail { get; set; }
        public string Error { get; set; }
        public string Warning { get; set; }
        /// <summary>Tab/sheet names inside the spreadsheet (populated by TestSpreadsheetAccessAsync).</summary>
        public System.Collections.Generic.List<string> Sheets { get; set; }

        public GoogleAuthValidationResult()
        {
            Ok = false;
            ClientEmail = string.Empty;
            Error = string.Empty;
            Warning = string.Empty;
            Sheets = new System.Collections.Generic.List<string>();
        }
    }
}
