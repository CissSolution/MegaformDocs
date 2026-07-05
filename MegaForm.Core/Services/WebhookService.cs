using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    public class WebhookService
    {
        private readonly IPhase2Repository _repo;
        private readonly ILogService _log;
        private static readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        public WebhookService(IPhase2Repository repo, ILogService log)
        {
            _repo = repo;
            _log = log;
        }

        public async Task<bool> SendWebhookAsync(FormInfo form, SubmissionInfo submission)
        {
            if (string.IsNullOrWhiteSpace(form.WebhookUrl)) return false;
            // [SecFix 2026-07-05 SEC-M] SSRF: the webhook URL is user-configured, so it must pass the guard
            // before we call it (blocks loopback/private/link-local/metadata 169.254.169.254). This path was
            // missing the guard that WebhookNodeExecutor already applies — enforces coding rule #11.
            if (!SsrfGuard.IsUrlAllowed(form.WebhookUrl, out var ssrfReason))
            {
                _log?.LogError("MegaForm.Webhook", $"Webhook blocked by SSRF guard ({ssrfReason}): {form.WebhookUrl}", null);
                return false;
            }
            var payload = JsonConvert.SerializeObject(new
            {
                @event = "submission.created",
                formId = form.FormId,
                formTitle = form.Title,
                submissionId = submission.SubmissionId,
                submittedOnUtc = submission.SubmittedOnUtc,
                ipAddress = submission.IpAddress,
                data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson)
            });

            var logEntry = new WebhookLogInfo
            {
                FormId = form.FormId,
                SubmissionId = submission.SubmissionId,
                WebhookUrl = form.WebhookUrl,
                RequestBody = payload
            };

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, form.WebhookUrl);
                request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
                request.Headers.Add("X-MegaForm-Event", "submission.created");
                request.Headers.Add("X-MegaForm-FormId", form.FormId.ToString());

                if (!string.IsNullOrWhiteSpace(form.WebhookSecret))
                {
                    string signature = ComputeHmacSha256(payload, form.WebhookSecret);
                    request.Headers.Add("X-MegaForm-Signature", signature);
                }

                // Custom headers
                if (!string.IsNullOrWhiteSpace(form.WebhookHeaders))
                {
                    try
                    {
                        var headers = JsonConvert.DeserializeObject<Dictionary<string, string>>(form.WebhookHeaders);
                        if (headers != null)
                            foreach (var kv in headers)
                                request.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
                    }
                    catch { }
                }

                var response = await _http.SendAsync(request);
                logEntry.ResponseCode = (int)response.StatusCode;
                logEntry.ResponseBody = await response.Content.ReadAsStringAsync();
                logEntry.Success = response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                logEntry.Success = false;
                logEntry.ResponseBody = ex.Message;
                _log?.LogError("MegaForm.Webhook", $"Webhook failed: {ex.Message}", ex);
            }

            try { _repo?.InsertWebhookLog(logEntry); } catch { }
            return logEntry.Success;
        }

        private static string ComputeHmacSha256(string message, string secret)
        {
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
            {
                var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
                return "sha256=" + BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            }
        }

        /// <summary>
        /// Send a raw webhook (used by workflow engine webhook steps).
        /// Returns HTTP status code.
        /// </summary>
        public async Task<int> SendRawWebhookAsync(string url, string method, string bodyJson, Dictionary<string, string> headers = null)
        {
            // [SecFix 2026-07-05 SEC-M] SSRF guard on the user-configured URL (defense-in-depth: workflow
            // callers already guard, but this public method must not trust its caller). Coding rule #11.
            if (!SsrfGuard.IsUrlAllowed(url, out var ssrfReason))
            {
                _log?.LogError("MegaForm.RawWebhook", $"Blocked by SSRF guard ({ssrfReason}): {url}", null);
                return 0;
            }
            try
            {
                var request = new HttpRequestMessage(
                    new HttpMethod(method ?? "POST"), url);

                if (!string.IsNullOrWhiteSpace(bodyJson))
                    request.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");

                if (headers != null)
                {
                    foreach (var kv in headers)
                        request.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
                }

                var response = await _http.SendAsync(request);
                return (int)response.StatusCode;
            }
            catch (Exception ex)
            {
                _log?.LogError("MegaForm.RawWebhook", $"Failed: {url} - {ex.Message}", ex);
                return 0;
            }
        }
    }
}
