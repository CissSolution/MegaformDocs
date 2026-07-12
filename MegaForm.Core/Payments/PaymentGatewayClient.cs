using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Payments
{
    /// <summary>Outcome of one gateway HTTP call. TransportError covers network
    /// failures, timeouts and queue saturation — callers must fail CLOSED on it
    /// when the call gates money (never treat "could not ask Stripe" as paid).</summary>
    public sealed class GatewayResponse
    {
        public bool TransportError { get; set; }
        public int StatusCode { get; set; }
        public JObject Json { get; set; }
        public string RawBody { get; set; }
        public string Error { get; set; }
        public bool IsSuccess { get { return !TransportError && StatusCode >= 200 && StatusCode < 300; } }
    }

    /// <summary>
    /// Shared outbound plumbing for Stripe/PayPal across all four platforms.
    /// Concurrency contract (the "100–1000 simultaneous payments" case):
    ///  • every gateway call passes through one bounded semaphore
    ///    (<see cref="MaxConcurrentCalls"/> wide) — a burst queues here instead
    ///    of opening hundreds of sockets or pinning request threads;
    ///  • a caller that cannot get a slot within <see cref="QueueWaitLimit"/>
    ///    gets a TransportError back (checkout says "busy, retry"), it is never
    ///    silently allowed through;
    ///  • PayPal OAuth tokens are cached until ~60s before expiry — without this
    ///    every order/capture/verify costs an extra token round-trip and PayPal
    ///    throttles the burst;
    ///  • Stripe POSTs carry an Idempotency-Key so the single retry-on-429/5xx
    ///    cannot double-create an intent.
    /// Registered as a singleton; all state is static-safe anyway.
    /// </summary>
    public class PaymentGatewayClient
    {
        public const int MaxConcurrentCalls = 16;
        public static readonly TimeSpan QueueWaitLimit = TimeSpan.FromSeconds(25);

        // [PerfFix 2026-07-05 PERF-C5 carried over] bound request time; a degraded
        // gateway must not pin a request thread for the default 100s.
        private static readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        private static readonly SemaphoreSlim _gate = new SemaphoreSlim(MaxConcurrentCalls, MaxConcurrentCalls);

        private sealed class CachedToken
        {
            public string Token;
            public DateTime ExpiresUtc;
        }
        private static readonly ConcurrentDictionary<string, CachedToken> _paypalTokens =
            new ConcurrentDictionary<string, CachedToken>(StringComparer.Ordinal);

        /// <summary>
        /// Send with bounded concurrency and (for retriable calls) one retry on
        /// 429/5xx/transport error. The request is rebuilt per attempt because
        /// HttpRequestMessage is single-use.
        /// </summary>
        public async Task<GatewayResponse> SendAsync(Func<HttpRequestMessage> requestFactory, bool retriable, CancellationToken cancellationToken = default(CancellationToken))
        {
            int attempts = retriable ? 2 : 1;
            GatewayResponse last = null;
            for (int attempt = 1; attempt <= attempts; attempt++)
            {
                if (attempt > 1)
                {
                    try { await Task.Delay(400 * attempt, cancellationToken).ConfigureAwait(false); }
                    catch (OperationCanceledException) { return Fail("Payment call was cancelled."); }
                }

                bool entered = false;
                try
                {
                    entered = await _gate.WaitAsync(QueueWaitLimit, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return Fail("Payment call was cancelled.");
                }
                if (!entered)
                {
                    last = Fail("Payment system is busy. Please try again in a moment.");
                    continue;
                }

                try
                {
                    var req = requestFactory();
                    var resp = await _http.SendAsync(req, cancellationToken).ConfigureAwait(false);
                    var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    var result = new GatewayResponse
                    {
                        StatusCode = (int)resp.StatusCode,
                        RawBody = body,
                        Json = TryParse(body)
                    };
                    if (result.IsSuccess) return result;
                    last = result;
                    int sc = result.StatusCode;
                    bool retriableStatus = sc == 429 || sc == 500 || sc == 502 || sc == 503 || sc == 504;
                    if (!retriableStatus) return result;
                }
                catch (OperationCanceledException)
                {
                    last = Fail("Payment gateway timed out.");
                }
                catch (HttpRequestException ex)
                {
                    last = Fail("Payment gateway unreachable: " + ex.Message);
                }
                catch (Exception ex)
                {
                    last = Fail("Payment gateway call failed: " + ex.Message);
                }
                finally
                {
                    _gate.Release();
                }
            }
            return last ?? Fail("Payment gateway call failed.");
        }

        // ── Stripe ─────────────────────────────────────────────────────────

        public Task<GatewayResponse> StripeGetPaymentIntentAsync(string secretKey, string intentId, CancellationToken ct = default(CancellationToken))
        {
            return SendAsync(delegate
            {
                var req = new HttpRequestMessage(HttpMethod.Get,
                    "https://api.stripe.com/v1/payment_intents/" + Uri.EscapeDataString(intentId ?? string.Empty));
                req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + secretKey);
                return req;
            }, retriable: true, cancellationToken: ct);
        }

        public Task<GatewayResponse> StripeCreatePaymentIntentAsync(string secretKey, long amountMinorUnits, string currency,
            IDictionary<string, string> metadata, string idempotencyKey, CancellationToken ct = default(CancellationToken))
        {
            return SendAsync(delegate
            {
                var form = new List<KeyValuePair<string, string>>
                {
                    new KeyValuePair<string, string>("amount", amountMinorUnits.ToString(System.Globalization.CultureInfo.InvariantCulture)),
                    new KeyValuePair<string, string>("currency", (currency ?? "usd").ToLowerInvariant()),
                    new KeyValuePair<string, string>("automatic_payment_methods[enabled]", "true")
                };
                if (metadata != null)
                {
                    foreach (var kvp in metadata)
                        form.Add(new KeyValuePair<string, string>("metadata[" + kvp.Key + "]", kvp.Value ?? string.Empty));
                }
                var req = new HttpRequestMessage(HttpMethod.Post, "https://api.stripe.com/v1/payment_intents");
                req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + secretKey);
                if (!string.IsNullOrWhiteSpace(idempotencyKey))
                    req.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
                req.Content = new FormUrlEncodedContent(form);
                return req;
            }, retriable: true, cancellationToken: ct);
        }

        // ── PayPal ─────────────────────────────────────────────────────────

        public static string PayPalBaseUrl(string mode)
        {
            return string.Equals(mode, "live", StringComparison.OrdinalIgnoreCase)
                ? "https://api-m.paypal.com"
                : "https://api-m.sandbox.paypal.com";
        }

        /// <summary>Cached OAuth token; refreshes when less than 60s of life remains.</summary>
        public async Task<GatewayResponse> GetPayPalTokenAsync(string clientId, string clientSecret, string baseUrl, CancellationToken ct = default(CancellationToken))
        {
            string cacheKey = baseUrl + "|" + clientId;
            CachedToken cached;
            if (_paypalTokens.TryGetValue(cacheKey, out cached) && cached.ExpiresUtc > DateTime.UtcNow.AddSeconds(60))
            {
                return new GatewayResponse { StatusCode = 200, Json = new JObject { ["access_token"] = cached.Token } };
            }

            var resp = await SendAsync(delegate
            {
                var credentials = Convert.ToBase64String(Encoding.ASCII.GetBytes(clientId + ":" + clientSecret));
                var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/v1/oauth2/token");
                req.Headers.TryAddWithoutValidation("Authorization", "Basic " + credentials);
                req.Headers.TryAddWithoutValidation("Accept", "application/json");
                req.Content = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("grant_type", "client_credentials")
                });
                return req;
            }, retriable: true, cancellationToken: ct).ConfigureAwait(false);

            if (resp.IsSuccess && resp.Json != null)
            {
                var token = resp.Json.Value<string>("access_token");
                var expiresIn = resp.Json.Value<int?>("expires_in") ?? 300;
                if (!string.IsNullOrWhiteSpace(token))
                {
                    _paypalTokens[cacheKey] = new CachedToken
                    {
                        Token = token,
                        ExpiresUtc = DateTime.UtcNow.AddSeconds(expiresIn)
                    };
                }
            }
            return resp;
        }

        public Task<GatewayResponse> PayPalGetOrderAsync(string baseUrl, string accessToken, string orderId, CancellationToken ct = default(CancellationToken))
        {
            return SendAsync(delegate
            {
                var req = new HttpRequestMessage(HttpMethod.Get, baseUrl + "/v2/checkout/orders/" + Uri.EscapeDataString(orderId ?? string.Empty));
                req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + accessToken);
                return req;
            }, retriable: true, cancellationToken: ct);
        }

        public Task<GatewayResponse> PayPalPostAsync(string baseUrl, string accessToken, string relativePath, object payload, CancellationToken ct = default(CancellationToken))
        {
            // PayPal-Request-Id makes create-order/capture idempotent on PayPal's
            // side, which is what makes the single retry safe for POSTs too.
            string requestId = Guid.NewGuid().ToString("N");
            string json = payload == null ? "{}" : JsonConvert.SerializeObject(payload);
            return SendAsync(delegate
            {
                var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + relativePath);
                req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + accessToken);
                req.Headers.TryAddWithoutValidation("Prefer", "return=representation");
                req.Headers.TryAddWithoutValidation("PayPal-Request-Id", requestId);
                req.Content = new StringContent(json, Encoding.UTF8, "application/json");
                return req;
            }, retriable: true, cancellationToken: ct);
        }

        private static GatewayResponse Fail(string message)
        {
            return new GatewayResponse { TransportError = true, Error = message };
        }

        private static JObject TryParse(string body)
        {
            if (string.IsNullOrWhiteSpace(body)) return null;
            try { return JObject.Parse(body); }
            catch { return null; }
        }
    }
}
