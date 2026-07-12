# MegaForm Payment — Capacity & Limitations Analysis

> **Scope:** Review the shared payment subsystem in MegaForm (Core, Web, UI, DNN, Oqtane, Umbraco).  
> **Question:** Can MegaForm safely handle more than 1,000 form submissions that include payment transactions at the same time?  
> **Answer:** No — not safely today. The current implementation is not production-ready for high-concurrency payment traffic.

---

## 1. How payment currently works

1. **Client-side widget** (`MegaForm.UI/src/widgets/plugins/megaform-widget-payment-unified.ts`) renders Stripe / PayPal UI.
2. Before the form is submitted, the widget calls platform endpoints such as:
   - `POST /api/megaform/payments/stripe/create-intent`
   - `POST /api/megaform/payments/stripe/confirm`
   - `POST /api/megaform/payments/paypal/create-order`
   - `POST /api/megaform/payments/paypal/capture-order`
3. These endpoints are implemented only in **`MegaForm.Web/Controllers/PaymentController.cs`**.
4. After the widget believes the user has paid, it writes a JSON blob into a hidden form field:
   ```json
   {"provider":"stripe","status":"paid","amount":...,"transactionId":"..."}
   ```
5. The normal form submission is processed by `SubmissionProcessor.ProcessAsync`, which **saves the JSON blob as-is** in `MF_Submissions.DataJson`. It does **not** re-verify the transaction with Stripe/PayPal.

> Reference audit: `Docs/AUDIT_20260711_Payment_Save_And_Process.md`

---

## 2. Can it handle 1,000+ concurrent payment transactions?

### 2.1 If you mean 1,000 concurrent *form submissions* (payment already finished on the client)

The server would mostly perform ordinary submission inserts. That part can scale to 1,000 inserts if the database and connection pool are sized for it, **but** several shared bottlenecks still apply:

- **Unique-ID generation is not concurrency-safe on Umbraco / Oqtane.**
  - `MegaForm.Umbraco/Data/UmbracoRepositories.cs:192-203` does a read-modify-save with EF Core and no explicit transaction/row lock.
  - `MegaForm.Oqtane.Server/Data/EfPhase2Repository.cs:517-521` uses an in-memory `ConcurrentDictionary` that resets on every app restart.
  - Under a burst of 1,000 submissions, duplicate invoice/ticket IDs are likely on Umbraco.
- **SubmissionProcessor does not verify payment status**, so 1,000 “paid” submissions could include fabricated ones.

### 2.2 If you mean 1,000 users trying to pay at the same time

**This will fail or be throttled by the payment gateways and by the MegaForm proxy itself.**

A single Stripe payment today requires at least:
- 1 call to `create-intent`
- 1 client-side confirmation
- (The `/stripe/confirm` endpoint exists but the widget does not call it.)

A single PayPal payment requires:
- 1 OAuth token request (`/v1/oauth2/token`)
- 1 `create-order` request
- 1 `capture-order` request

So 1,000 simultaneous payments ≈ 1,000–3,000 outbound HTTP requests to Stripe/PayPal, plus 1,000 form submissions.

---

## 3. Concrete limitations

### 3.1 Security / correctness

| Issue | Evidence | Impact |
|---|---|---|
| **Payment bypass** — client can set `"status":"paid"` and the server accepts it. | `SubmissionProcessor.cs` has zero references to payment/Stripe/PayPal. | An attacker can submit a “paid” form without paying. |
| **No server-side verification on submit** | `SubmissionProcessor` never calls Stripe/PayPal to verify `transactionId`. | Fraudulent or failed payments are recorded as successful. |
| **No idempotency keys** | `PaymentController` does not send `Idempotency-Key` (Stripe) or `PayPal-Request-Id`. | Retries can create duplicate PaymentIntents / orders. |
| **`requiredPaid` only enforced in the browser** | `megaform-widget-payment-unified.ts` validates before submit; server does not. | Easy to bypass with a crafted HTTP request. |
| **Amount tampering is only partially fixed** | `ResolveServerAmount` enforces only `amountMode=fixed`; `field`/`listenTotals` trusts the client. | Variable-price forms are still vulnerable. |

### 3.2 Scalability / reliability

| Issue | Evidence | Impact |
|---|---|---|
| **Single static `HttpClient`** | `PaymentController.cs:45` uses `private static readonly HttpClient _http` with a 30-second timeout. | No connection pooling tuning, no automatic DNS refresh, no per-request timeout control. |
| **No retry, circuit breaker, or bulkhead** | `PaymentController` calls `_http.SendAsync` directly. | A transient Stripe/PayPal outage or slowdown exhausts threads and causes cascading failures. |
| **PayPal token is fetched for every call** | `PayPalCreateOrder` and `PayPalCaptureOrder` both call `GetPayPalAccessTokenDetailed`. | Doubles PayPal request volume and latency; likely to hit PayPal rate limits quickly. |
| **No queue or async reconciliation** | Payment status is decided synchronously by the widget. | Bursty traffic cannot be smoothed; failed payments cannot be retried later. |
| **No webhook handling** | `WebhookSecret` is collected in settings but never used; no Stripe/PayPal webhook endpoints exist. | No asynchronous source of truth; no automatic chargeback/refund updates. |

### 3.3 Platform parity

| Platform | Payment backend exists? | Notes |
|---|---|---|
| `MegaForm.Web` | Yes | `PaymentController` exists but has the issues above. |
| `MegaForm.DNN` | No gateway | Only stores keys; no Stripe/PayPal API proxy. |
| `MegaForm.Oqtane.Server` | No gateway | The widget’s default URLs return 404. |
| `MegaForm.Umbraco` | No gateway | No `PaymentController`; payment assets are loaded but backend calls fail. |

### 3.4 External provider rate limits

These are outside MegaForm’s control and are the hard ceiling for concurrent payments:

- **Stripe** — live mode defaults to ~100 requests/second per account; test mode is lower (~25 req/s). Bursting above this returns HTTP 429.
- **PayPal** — documented limit is roughly 50 requests/second per app; OAuth token endpoint has its own limit.

With the current code, 1,000 simultaneous payments would send **1,000+ Stripe create-intent calls** (or **2,000+ PayPal calls** because of the missing token cache). Even if MegaForm were perfect, the providers would throttle it.

### 3.5 Database concurrency

- `MF_Submissions` inserts are ordinary row inserts and can scale horizontally with the DB.
- However, `SubmissionProcessor` also updates the in-memory form stats (`SubmissionCount`) and may write to `MF_SubmissionValues`, `MF_SavedDrafts`, `MF_RateLimits`, and `MF_UniqueIdCounters` depending on the form. These add contention.
- On SQLite (default for the Umbraco demo), concurrent writes serialize through the single database lock. 1,000 concurrent inserts would queue and time out before they could finish.

---

## 4. Rough back-of-the-envelope numbers

Assumption: 1,000 users hit “Pay” within the same second.

| Step | Requests generated | Stripe limit | PayPal limit | Likely outcome |
|---|---|---|---|---|
| Stripe create-intent | 1,000 | 100 req/s | — | 10+ seconds to clear; many 429s. |
| Stripe confirm (not called by widget) | 0 | — | — | — |
| PayPal token + create-order + capture | 3,000 | — | ~50 req/s | Severe throttling; many failures. |
| Form submission save | 1,000 | — | — | DB-bound; SQLite would serialize and time out. |

**Conclusion:** The system cannot reliably complete 1,000 simultaneous paid submissions. It will be throttled by Stripe/PayPal, and the missing token cache / retry / queue logic means many users will see errors.

---

## 5. Recommendations (no code changes yet)

If the product needs to support high-volume payments, consider these changes in priority order:

1. **Verify payment server-side before saving the submission.**
   - In `SubmissionProcessor`, when a Payment field is present and `requiredPaid` is true, call Stripe `GET /v1/payment_intents/{id}` or PayPal `GET /v2/checkout/orders/{id}` and confirm `status` + amount + currency.
2. **Do not trust the client-paid JSON blob.**
   - Replace the hidden-field value with a server-verified status written during submission processing.
3. **Add idempotency keys.**
   - Stripe: `Idempotency-Key` header on `create-intent`.
   - PayPal: `PayPal-Request-Id` header on `create-order` and `capture-order`.
4. **Cache PayPal access tokens.**
   - Token lifetime is ~9 hours; do not request a new one for every order/capture.
5. **Introduce an out-of-process payment reconciliation queue.**
   - Accept submissions with `payment_pending`, let a background worker confirm/reject them, and retry on provider errors.
6. **Add application-level rate limiting / backpressure.**
   - Cap concurrent create-intent/create-order requests and provide graceful queueing instead of passing every burst straight to the gateway.
7. **Use `IHttpClientFactory` (or at least a properly configured `SocketsHttpHandler`) instead of a static `HttpClient`.**
   - Add Polly retry + circuit breaker policies.
8. **Fix `IncrementUniqueId` concurrency on all platforms.**
   - Use an atomic DB operation (e.g., SQL `UPDATE ... OUTPUT` inside a transaction or an `IDENTITY`/sequence column) rather than read-modify-save.
9. **Implement platform parity.**
   - Port the payment gateway to DNN, Oqtane, and Umbraco, or move the provider logic into `MegaForm.Core/Payments` (`IPaymentProvider` already exists) and share it.
10. **Add webhook endpoints for Stripe/PayPal.**
    - Verify signatures (`Stripe-Signature`, PayPal transmission ID + cert) and update submission status asynchronously.

---

## 6. Bottom line

- **Security first:** The biggest limitation is not scale; it is that the server does not verify payments, so any concurrency number is meaningless from a correctness standpoint.
- **Scale second:** Even after the security issues are fixed, the current synchronous, unbatched, un-cached, un-throttled proxy design will be throttled by Stripe/PayPal well before 1,000 concurrent payments.
- **Recommendation:** Treat MegaForm payment as **not production-ready for high-volume checkout** until server-side verification, idempotency, token caching, and a reconciliation queue are in place.

---

## 7. REMEDIATION STATUS — 2026-07-12 (per-item, after the PAY-1/PAY-2/PAY-3 fixes)

Every claim in this analysis was re-verified against the code on 2026-07-12 and found accurate.
The same session then shipped the following (owner directive: Oqtane + DNN first; Web/Umbraco
controller hardening deferred):

| # (from §5) | Item | Status 2026-07-12 |
|---|---|---|
| 1 | Server-side verification at submit | ✅ **DONE** — `MegaForm.Core/Payments/PaymentSubmissionVerifier.cs`, hooked as step 9d in `SubmissionProcessor.ProcessAsync`. Stripe `GET /v1/payment_intents/{id}` / PayPal `GET /v2/checkout/orders/{id}`; status + amount + currency + formId metadata all checked; fail-CLOSED on any ambiguity, including "no verifier registered on this host". |
| 2 | Don't trust the client blob | ✅ **DONE** — the stored value is rewritten with the gateway-confirmed numbers (`verified:true`, `verifiedAtUtc`); replay is blocked in-process (`PaymentTransactionRegistry`) and durably (DataJson duplicate search per form + cross-form via intent/order `formId` stamp). |
| 3 | Idempotency keys | ✅ **DONE** — Stripe `Idempotency-Key` on create-intent; `PayPal-Request-Id` on create-order/capture. Both make the single retry-on-429/5xx safe. |
| 4 | Cache PayPal tokens | ✅ **DONE** — `PaymentGatewayClient` caches per clientId+mode until ~60s before expiry. |
| 5 | Out-of-process reconciliation queue | ⏳ **DEFERRED** — no background worker yet. Partial substitute: signature-verified webhooks record facts into `PaymentTransactionRegistry`, and Stripe `processing` is rejected at submit with "wait and resubmit". |
| 6 | App-level rate limiting / backpressure | ✅ **DONE** — per-IP fixed windows (`PaymentRateLimiter`: 20/min create, 40/min capture/confirm) + one bounded semaphore (16 wide, 25s max queue wait) in front of ALL outbound gateway calls. A 1,000-user burst now drains at a controlled pace; overflow gets a clean 429/503 "busy, retry", never a thread-pool collapse. |
| 7 | IHttpClientFactory + Polly | 🔶 **PARTIAL BY DESIGN** — single static `HttpClient` (30s timeout) + custom retry-once + bulkhead semaphore. No Polly dependency (Core targets net472). DNS-refresh concern accepted for single-node deployments (multi-node is blocked project-wide anyway). |
| 8 | `IncrementUniqueId` concurrency | ❌ **OPEN (verified true)** — Oqtane: static in-memory dictionary, resets on restart (`EfPhase2Repository.cs:42,517-521`); Umbraco: EF read-modify-save. Needs an atomic DB counter. Not payment-blocking; tracked for a follow-up session. |
| 9 | Platform parity | ✅ Oqtane (`Controllers/PaymentController.cs` + `MegaFormController.PaymentSettings.cs` + `OqtanePaymentGatewayStore`) and DNN (`WebApi/PaymentApiController.cs` + `payments/*` routes + `DnnPaymentGatewayStore`) now have full gateway backends sharing `MegaForm.Core/Payments/PaymentEndpointService`. Web keeps its legacy controller (hardening deferred); Umbraco has the submit-verifier only (endpoints deferred). The widget remaps its default URLs onto `/DesktopModules/MegaForm/API/payments/*` when it detects DNN. |
| 10 | Webhooks + signature verification | ✅ **DONE (OQ+DNN)** — `PaymentWebhookService`: Stripe HMAC-SHA256 (`whsec_`, constant-time compare, 10-min tolerance), PayPal `verify-webhook-signature` with the stored Webhook ID. Unverifiable events are rejected. |

Also fixed while here (not in the original list): **zero-decimal currencies** — Stripe amounts now
convert per-currency (`PaymentCurrency.ToStripeMinorUnits`); previously VND/JPY were charged ×100.

**Capacity picture after the fixes:** the bulkhead paces outbound traffic at ≤16 concurrent calls
(~40–80 req/s at typical gateway latency, under Stripe's 100 req/s live ceiling; retries absorb
PayPal's ~50 req/s). A 1,000-simultaneous-payment burst no longer melts the host: requests queue up
to 25s, the overflow receives a clean retryable error, and nothing unverified ever reaches
`MF_Submissions`. True >1,000-burst *completion* (everyone succeeds on first click) still requires
item 5 (async reconciliation queue) — that remains the documented ceiling.
