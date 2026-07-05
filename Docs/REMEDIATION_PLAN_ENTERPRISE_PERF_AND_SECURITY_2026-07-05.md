# KẾ HOẠCH SỬA CHỮA — Enterprise Perf & Security (MegaForm)

> **Ngày:** 2026-07-05
> **Nguồn:** `Docs/AUDIT_ENTERPRISE_PERF_AND_SECURITY_2026-07-04.md` (audit-only). Doc này biến finding → **hành động thực thi được**.
> **Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`
> **Nguyên tắc nền (bắt buộc):** *Không phá vỡ public submit + builder flow.* Fail-closed cho security; mọi đổi API contract phải đồng bộ client JS; fix 1 nơi → rà 2 platform còn lại (Web/Oqtane/DNN); build clean mọi target trước khi coi là xong. Tuân `Docs/SECURITY_CODING_RULES.md`.

---

## ✅ TRẠNG THÁI TRIỂN KHAI (cập nhật 2026-07-05) — Sprint 0 + Sprint 1 ĐÃ CODE + BUILD CLEAN

| ID | Việc | File chính | Build |
|----|------|-----------|-------|
| S0.1 SEC-B1 | `[ValidateAntiForgeryToken]` cho `SaveModuleStyle` | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2732` | ✅ Oqtane.Server 0-err |
| S0.2 SEC-B2 | Client gửi `formId` (payment widget) + server **fail-closed** khi thiếu formId/fieldKey. ⚠️*min/max clamp = N/A: widget KHÔNG có settings minAmount/maxAmount (chỉ fixed/field/listenTotals) → không bịa property.* | `megaform-widget-payment-unified.ts` (stamp `data-mf-form-id` + gửi trong Stripe/PayPal body); `MegaForm.Web/Controllers/PaymentController.cs:73-90` | ✅ Web + plugin tsc 0-err |
| S0.3 PERF-C2 | Captcha `HttpClient` → static + 10s timeout | `MegaForm.Web/Controllers/MegaFormController.cs:1400`; `MegaForm.DNN/WebApi/MegaFormApiController.cs:1458,1521` | ✅ Web + DNN 0-err |
| S1.1 PERF-A1 | Memoize `ResolveSchemaJson` (content-addressed, immutable string, license flag trong key) + **TTL-cache license** (bỏ file I/O per-render). *A4/A5/A6 CSS/manifest = follow-up.* | `MegaForm.Core/Rendering/RenderModelResolver.cs:95-155`; `MegaForm.Core/Services/LicenseService.cs:21-46` | ✅ Core net9+net472 0-err |
| S1.2 PERF-C1 | DNN RazorWidget 6× `new HttpClient` → 1 static + per-call CTS timeout | `MegaForm.DNN/WebApi/RazorWidgetController.cs` (6 site) | ✅ DNN 0-err |
| S1.3 PERF-C5/C6/SEC-M | Payment `_http` timeout 30s; WebhookService **wire SsrfGuard** (`SendWebhookAsync`+`SendRawWebhookAsync`) — đóng SEC-M | `PaymentController.cs:43`; `MegaForm.Core/Services/WebhookService.cs:27,104` | ✅ 0-err |
| S1.4 OPS-1 | Web `AddRateLimiter` per-IP 600/min flood limiter; Oqtane/DNN → deploy note (edge/WAF) | `MegaForm.Web/Program.cs` | ✅ Web 0-err |
| Deploy | Recompile payment plugin (`tsc` plugins tsconfig) → sync `Assets/js/plugins/` + 3 wwwroot (Oqtane/Umbraco/Web); bump `AssetVersion` B363→**B364** | `AssetVersion.cs:29` | ✅ |

**Build verify:** `MegaForm.Core` (net9 + net472), `MegaForm.Web`, `MegaForm.Oqtane.Server`, `MegaForm.DNN` (net472) — **tất cả 0 Error**. Plugin `tsc` exit 0.
**⚠️ Deploy gate (bắt buộc ship cùng nhau):** SEC-B2 server fail-closed **yêu cầu** client plugin mới gửi `formId` → phải deploy plugin B364 + bump AssetVersion đồng thời, nếu không plugin cũ (thiếu formId) sẽ bị reject → vỡ payment. Oqtane deploy cần bump `ModuleInfo.Version` + repack (DLL swap gate).
**Chưa làm (còn lại của plan):** Sprint 2 (multi-node DB state), Sprint 3 (hygiene/first-paint), Sprint 4 (hardening còn lại). SEC-B2 variable-mode min/max + `field`-mode re-derive = follow-up (cần contract lớn hơn).

---

---

## 0. Phát hiện then chốt mở khóa nhóm antiforgery (đọc trước)

Đợt trước **defer** cluster antiforgery vì lo "Oqtane SPA không gửi token → 400 mọi admin write". **Điều kiện đó KHÔNG còn đúng:**

- Đã tồn tại chokepoint toàn cục `MegaForm.UI/src/shared/antiforgery.ts` (`installMegaFormAntiforgery`, self-install on import) — patch `window.fetch` + `XMLHttpRequest`, tự thêm header `X-XSRF-TOKEN-HEADER` cho **mọi** request same-origin unsafe khi có token, no-op trên Web(JWT)/DNN. Được nạp qua `shared/platform-host.ts` (`import './antiforgery'`) và một số bundle nạp trực tiếp (`ai-knowledge/index.ts:21`).
- `SaveStyle` (`MegaFormController.cs:2684`) **đã có** `[ValidateAntiForgeryToken]` và chạy trong production — gọi từ **cùng surface** view/theme-designer với `SaveModuleStyle`.

→ **Hệ quả:** thêm `[ValidateAntiForgeryToken]` cho admin mutator giờ **an toàn** miễn là bundle gọi endpoint đó có nạp chokepoint (trực tiếp `import '../shared/antiforgery'` hoặc gián tiếp qua `platform-host`). Đây là điều kiện verify duy nhất cần check cho mỗi endpoint khi re-arm.

**Điều kiện áp dụng cho cả kế hoạch:** mọi đổi contract API kèm bước "grep bundle gọi endpoint → xác nhận đã nạp chokepoint / gửi formId+fieldKey".

---

## SPRINT 0 — Gỡ blocker 1-node (nhỏ, khẩn, ~1–2 ngày)

### S0.1 · SEC-B1 · `SaveModuleStyle` thiếu antiforgery → CSRF `【P1】`
- **Root cause:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2730-2734` chỉ `[Authorize]`+`CanUseAdminPopup()`; class-level `[IgnoreAntiforgeryToken]` (`:47`) → endpoint mở CSRF. Doc MYTHOS §9b ghi **nhầm** là đã fix.
- **Fix:** thêm `[ValidateAntiForgeryToken]` (copy đúng dòng của sibling `SaveStyle:2684`).
- **Files:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (1 action). *(Web không có endpoint song sinh này; DNN dùng đường khác — rà nhanh để chắc.)*
- **Flow-safety:** grep bundle gọi `ModuleConfig/SaveModuleStyle` = `view-designer/shared.ts`, `admin-live/LiveEditor.ts` → cùng page admin đã nạp chokepoint (giống SaveStyle). Rủi ro thấp.
- **Effort:** XS (1 dòng). **Verify:** mở popup module-style → Save → 200 (không 400); repeat cross-origin giả lập → 400. Cập nhật lại doc MYTHOS §9b cho đúng.

### S0.2 · SEC-B2 · Payment fail-open khi thiếu `formId`/`fieldKey` `【P1 — flow-risky, cần audit trước】`
- **Root cause:** `MegaForm.Web/Controllers/PaymentController.cs:77-78` — thiếu `formId`/`fieldKey` → trả `(clientAmount, clientCurrency)`. Fail-open **có chủ đích** (giữ donation/variable/legacy) nhưng attacker **cố tình bỏ** 2 trường → hạ giá field fixed-price. Thêm nữa: variable mode (`field`/`listenTotals`, `:100-102`) trả client amount **không có clamp min/max** → gap thứ hai.
- **Fix (2 phần, KHÔNG reject mù):**
  1. **Bắt buộc `formId`+`fieldKey`** cho mọi payment intent → fail-closed nếu thiếu (`return (..., error:"missing form context")`). Điều này buộc server luôn biết mode thật, chặn attacker giấu field fixed.
  2. **Clamp min/max cho variable mode** từ field settings (`minAmount`/`maxAmount` trong `WidgetProps`) thay vì tin client amount trần trụi (SECURITY_CODING_RULES §5).
- **Files:** `MegaForm.Web/Controllers/PaymentController.cs` (`ResolveServerAmount` + gọi trong Stripe `:167` & PayPal `:375`); rà đường Oqtane payment nếu có song sinh; **client widget** payment (`MegaForm.UI/src` — grep widget payment) phải luôn gửi `formId`+`fieldKey`.
- **Flow-safety (BẮT BUỘC trước khi fail-closed):** audit widget payment client + telemetry log các request tới `/Payment/*` thiếu formId/fieldKey trong 1–2 ngày. Nếu có legacy widget/donation không gửi → sửa client trước, rồi mới bật fail-closed. Nhánh legacy `:114-116` (amountMode missing + no stored amount): log để tìm form thật, quyết định riêng.
- **Effort:** S–M (có bước telemetry). **Verify:** intent bỏ formId → bị reject; fixed field không hạ được giá; donation/variable vẫn chạy trong [min,max]; amount ngoài [min,max] bị clamp/reject.

### S0.3 · PERF-C2 · Captcha `new HttpClient()` per-call, không timeout, trên public submit `【P1】`
- **Fix:** đổi sang **1 `static readonly HttpClient`** (hoặc `IHttpClientFactory`) + `Timeout` ngắn (10s) + truyền `CancellationToken`.
- **Files:** `MegaForm.DNN/WebApi/MegaFormApiController.cs:1513`; `MegaForm.Web/Controllers/MegaFormController.cs:1400` (`VerifyCaptchaTokenAsync`). Mirror mẫu đúng: `GoogleSheetsAuthService.cs` (static+30s+ct).
- **Flow-safety:** captcha vẫn verify như cũ; chỉ đổi lifecycle client → không đổi contract. **Effort:** XS. **Verify:** submit có captcha vẫn pass; captcha endpoint chậm → fail nhanh ≤10s thay vì treo.

---

## SPRINT 1 — Trần throughput + reliability tải cao (~1 tuần)

### S1.1 · PERF-A1/A2/A4/A5/A6 · Memoize đường render (đòn bẩy lớn nhất) `【P1】`
- **Fix:** 1 lớp cache khóa `(formId, form.ModifiedOn)` bọc bộ ba **resolve + CSS compose + asset manifest** — dùng chung bởi `Schema/{id}`, `Form/{id}`, `RenderPage`, SSR. Value = `ResolvedRenderModel` + `InitialInlineCss` + composed CSS + `AssetManifest`. Dùng `IMemoryCache` hoặc `ConcurrentDictionary` bounded + TTL, invalidate khi `ModifiedOn` đổi (SaveForm bump `ModifiedOn`).
- **Files:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1388-1414` (Schema) + `:271-283` (Form); `MegaForm.Core/Rendering/RenderModelResolver.cs`; `CustomShellCompatibilityCssService.cs`; `ThemePresetInlineCssService.cs`; `RenderPage.cs`; `Index.razor` SSR path. **Rà cả 3 platform** (Web/DNN có resolver riêng).
- **Flow-safety:** cache theo `ModifiedOn` → sửa form là bust tức thì; verify preview builder + public render dùng cùng key; đừng cache theo user (schema resolve không phụ thuộc user cho anon). Cân nhắc gồm `AssetVersion` vào key để deploy mới không trả bản cũ.
- **Effort:** M. **Verify:** đo CPU/allocation trước-sau trên `Schema/{id}` premium; parse count từ 5–6 → 1 lần/miss; sửa form → render đổi ngay; builder không kẹt bản cache.

### S1.2 · PERF-C1 · Socket exhaustion DNN RazorWidget `【P1】`
- **Fix:** thay 6 `using(var client=new HttpClient())` bằng **1 static/`IHttpClientFactory`** dùng chung; giữ per-request `Timeout` qua `CancellationTokenSource`.
- **Files:** `MegaForm.DNN/WebApi/RazorWidgetController.cs:64,89,118,170,198,222`. **Effort:** S. **Verify:** load test render widget anon → `netstat` không tăng vô hạn `TIME_WAIT`.

### S1.3 · PERF-C5/C6 + SEC-M · Payment/Webhook timeout + SsrfGuard `【P2】`
- **Fix:** (a) `PaymentController._http` (`:43`) thêm `Timeout` + truyền `CancellationToken` vào 5 `SendAsync` (`:191,250,424,487,575`). (b) `WebhookService.SendWebhookAsync` (`:49`) đi qua `SsrfGuard.IsUrlAllowed` trước khi gọi (đóng SEC-M, đúng rule #11) + thêm cancel + cân nhắc circuit-breaker/timeout budget để không cộng 30s vào submit.
- **Files:** `MegaForm.Web/Controllers/PaymentController.cs`; `MegaForm.Core/Services/WebhookService.cs`. Mirror `WebhookNodeExecutor.cs:125` (SSRF) + linked-CTS.
- **Flow-safety:** webhook hợp lệ (public host) vẫn qua guard; chỉ chặn private/loopback/metadata. **Effort:** S. **Verify:** webhook tới `169.254.169.254`/`localhost` bị chặn+log; webhook thật vẫn gửi; payment provider chậm → fail ≤timeout.

### S1.4 · OPS-1 · Rate-limit public endpoint `【P2】`
- **Fix:** với **`MegaForm.Web`/host độc lập** → `AddRateLimiter` (fixed/sliding window) trên `Submit`/`UploadFile`/`Compute`. Với **Oqtane/DNN module** → khuyến nghị rate-limit tầng edge/WAF (host operator) + ghi vào deploy guide (module không sở hữu pipeline host).
- **Files:** `MegaForm.Web/Program.cs`; deploy doc. **Effort:** S (Web) / doc (Oqtane). **Verify:** flood Submit → 429 sau ngưỡng.

---

## SPRINT 2 — Multi-node correctness (điều kiện gọi "enterprise", ~1–2 tuần)

> ⚠️ **Nuance deploy Oqtane (từ memory):** `migration Up()` là **DEAD** trên Oqtane — `MegaFormManager.Install` seed schema từ **EF model** + đánh dấu migration applied mà **không chạy Up()**. Vậy thêm bảng mới = thêm **entity + DbSet** (fresh install tự tạo từ model). **Site đang chạy (upgrade)** cần đường tạo bảng riêng: một `EnsureCreated`-style guard hoặc idempotent `CREATE TABLE IF NOT EXISTS` trong hosted seeder (mẫu: `OqtaneKbSeederHostedService`). **Pattern bảng thật đã có:** `MF_WebhookLog` (real EF) — mirror nó cho các bảng mới.

### S2.1 · PERF-D2 · UniqueId → bảng DB `MF_UniqueIdCounters` `【P1】`
- **Fix:** thay `_uniqueIdCounters` static (`EfPhase2Repository.cs:42,517-527`) bằng bảng thật với **atomic increment** (`UPDATE ... SET v=v+1 OUTPUT INSERTED.v` hoặc row-lock trong transaction) khóa `(FormId, FieldKey)`. Đảm bảo unique liên-node.
- **Files:** `MegaFormDbContext.cs` (+DbSet/entity + migration-model), `EfPhase2Repository.cs`; **Web + Oqtane** (cùng repo); DNN `FormRepository.IncrementUniqueId` song sinh; hosted seeder cho upgrade path.
- **Flow-safety:** submit path (`SubmissionProcessor.cs:205-213`) không đổi contract; chỉ đổi backing store. Test concurrency 2 node giả lập. **Effort:** M. **Verify:** 2 instance đồng thời → 0 ID trùng; restart → tiếp tục không reset.

### S2.2 · PERF-D3 · RateLimit → bảng/`IDistributedCache` `【P1】`
- **Fix:** thay `_rateLimitBuckets` static (`:44,547-570`) bằng store dùng chung (bảng `MF_RateLimits` với sliding-window count theo SQL, **hoặc** `IDistributedCache`/Redis nếu có). Thêm **eviction** (xóa timestamp hết cửa sổ) để hết leak + O(N).
- **Files:** `EfPhase2Repository.cs` (Web+Oqtane) + DbContext. **Effort:** M. **Verify:** limit đúng tổng qua N node; RAM ổn định dưới flood; entry cũ bị dọn.

### S2.3 · PERF-D1 · Coupon redemption → DB `【P1 — chỉ AspNetCore host】`
- **Fix:** thay `InMemoryCouponStore` (`:15,43-59`) bằng bảng redemption + **atomic check-and-increment** trong transaction (chống race + multi-node). Chỉ áp bản `MegaForm.AspNetCore.Component` (đăng ký `:407`).
- **Files:** `MegaForm.Core/Payments/InMemoryCouponStore.cs` → impl DB; đăng ký DI. **Effort:** M. **Verify:** coupon max 100 → đúng 100 lần qua N node; restart không reset.

### S2.4 · PERF-D4/D5/D6/D7 · Conversion/Quiz/DNN-app/WorkflowRun store → persisted `【P2】`
- **Fix:** chuyển các store singleton/scoped in-memory sang persisted (DB hoặc distributed): `FormAbandonmentService`/`UserJourneyService`/`InMemoryQuizStore` (`+lock` cho `Steps.Add` nếu tạm giữ in-memory); `ConversationalFormService`/`EmailSummaryService` (Scoped→persisted, nếu không sẽ hỏng cả 1-node — ưu tiên vì đang **không hoạt động**); DNN `_apps`/`_queries` (`DnnRepositoryAdapters.cs:92-95`) → bảng; `_workflowRunStub` → bảng.
- **Effort:** M–L (nhiều service). **Verify:** state sống qua request/restart/node; quiz concurrent không throw.

### S2.5 · PERF-E1 · Index `MF_SubmissionValues` `【P2】`
- **Fix:** thêm index `(SubmissionId)` + `(FormId, FieldKey)` trong `MegaFormDbContext.cs:86-90`. (Reindex DELETE mỗi submit + report filter hưởng lợi.)
- **Files:** `MegaFormDbContext.cs` + đường tạo-index cho site đang chạy (upgrade nuance như trên). **Effort:** S. **Verify:** query plan chuyển seek; submit latency giảm khi table lớn.

### S2.6 · OPS-2 · Health check `【P2】`
- **Fix:** `MegaForm.Web`/host độc lập → `AddHealthChecks` + `MapHealthChecks("/health")` (liveness + readiness gồm DB probe). Oqtane/DNN → cân nhắc endpoint `/api/MegaForm/health` anon nhẹ (không lộ thông tin) cho LB.
- **Effort:** S. **Verify:** `/health` trả 200 khi DB ok, 503 khi DB down.

---

## SPRINT 3 — Hygiene & first-paint (song song, ~vài ngày)

| ID | Hành động | File/Đường | Effort |
|---|---|---|---|
| PERF-B4 | Xác định `fonts/gf/` (13.5MB, 738 `@font-face`) orphan → **xóa**; nếu có template `@import` → subset | `wwwroot/.../fonts/gf/` + grep template customCss | S |
| PERF-B5 | Strip `*.map` (7.58MB) khỏi package production (pack.cmd/build) | build/pack pipeline | XS |
| PERF-B6 | Xóa `css/acme-blog-mock.css` (394KB) + `js/bundles/` stale (renderer 160KB cũ + builder 1.1MB) | `wwwroot/.../css`,`/js/bundles` | XS |
| PERF-B7 | Ship brotli-precompressed static (`.br`) trong package (~3× path 766KB) | build pipeline | S |
| PERF-B2 | Tree-shake FontAwesome full 100KB → subset icon dùng thật | FA build + `RenderPage.cs:168` link | M |
| PERF-B3 | Filename content-hash → `immutable,max-age=1y` (thay `?v=` global bust) | `AssetVersion.cs:29` + build + emit link | M |
| PERF-B1/B8 | Cân nhắc code-split `megaform-renderer.js` (329KB); tách public vs admin CSS khỏi `megaform.css` (141KB) | `MegaForm.UI` build entry | L |
| PERF-B9/hero | Hero PNG ~2MB → WebP/AVIF + `loading=lazy`+`decoding=async` | `wwwroot/.../img/*`, template refs | M |
| PERF-B9/preconnect | Gỡ `preconnect` chết (google/cdnjs) nếu đã self-host toàn bộ | `RenderPage.cs:161-163` | XS |

> **Lưu ý pack:** đổi asset/bundle phải chạy `npm run build:*` đúng entry + đồng bộ 3 wwwroot (Oqtane/DNN/Web) + bump `AssetVersion` (theo pack gotchas trong MEMORY).

---

## SPRINT 4 — Security hardening còn lại + perf micro (giãn tiến độ)

- **SEC-H1** Re-arm `[ValidateAntiForgeryToken]` từng mutator trên các controller Oqtane còn class-level ignore (giờ an toàn nhờ §0) — làm **từng action + test**, ưu tiên các mutator ghi CSS/SQL/template. Gỡ dần class-level `[IgnoreAntiforgeryToken]`, chỉ giữ action public.
- **SEC-H2** `SubformController.Compute` anon → thêm giới hạn length/row + rate-limit (Oqtane`:158`/Web`:130`/DNN`:302`).
- **SEC-H3** DNN `AppEndpoint` anon SQL → SELECT-only parser (không chỉ regex) + read-only DB account + signed token/API key (`AiToolsController.cs:1359`).
- **SEC-H4** Error leakage 118 hit → wrap generic `Problem("...", 500)` + error-ID, log `ex` server-side. Ưu tiên `PaymentController`, `UserTemplateController`, `WorkflowStarter`.
- **SEC-H5/H6** `MegaForm.Web/Program.cs`: cookie `SecurePolicy=Always` ngoài Dev (`:125-127`); CORS bỏ `AllowAnyOrigin` default → yêu cầu `MEGAFORM_CORS_ORIGINS` (`:170`).
- **SEC-L** Xóa `DevBypassHandler` dead code (`Program.cs:226`); JWT key fail-closed non-Dev (`:95`).
- **PERF-A7/A8** Roslyn: collectible `AssemblyLoadContext` (`RazorCompilationService.cs:215`) + cache MetadataReference set (`:135-190`).
- **PERF-A9..A13, E7..E10** micro: `static readonly` icon dict; `AsNoTracking()` read path; `GetFormStats` gộp 1 aggregate; regex `Compiled`; DobParts/TimeParts static.
- **PERF-E2/E3/E4/E5/E6** query: page email-summary; `WHERE FormId IN(...)` thay N+1; index/lookup auto-link thay scan 2000; full-text/index cho submission search; batch `ListTaskActions`.

---

## Ma trận ưu tiên (Effort × Impact)

| Ưu tiên | Finding | Effort | Chặn |
|---|---|---|---|
| 🔴 P0-now | SEC-B1, SEC-B2, PERF-C2 | XS–M | 1-node prod |
| 🔴 P0-now | PERF-A1 (memoize), PERF-C1 (socket) | S–M | throughput/tải |
| 🟠 P1 | PERF-D1/D2/D3 (DB state), E1 (index) | M | multi-node correctness |
| 🟠 P1 | S1.3 payment/webhook timeout+SSRF, OPS-1/2 | S | reliability/abuse |
| 🟡 P2 | Sprint 3 hygiene/first-paint | XS–L | UX/deploy size |
| 🟢 P3 | Sprint 4 hardening + micro | XS–L | defense-in-depth |

## Cross-cutting checklist (mỗi PR)
- [ ] Fix 1 nơi → rà 2 platform còn lại (Web/Oqtane/DNN song sinh)?
- [ ] Đổi API contract → client JS đã đồng bộ (formId/fieldKey, chokepoint antiforgery)?
- [ ] Public submit + builder flow vẫn chạy sau đổi?
- [ ] Bảng DB mới → có đường tạo cho **cả** fresh install (EF model) **và** site upgrade (idempotent ensure)?
- [ ] Build clean mọi target (net472/net8/9/10)? Bump `AssetVersion` nếu đụng asset?
- [ ] Verify BẰNG HÀNH VI (không md5) trên site QA (:5090/:5100/:5111/:5112)?
- [ ] Cập nhật audit doc + MEMORY sau khi đóng finding?

## Rollout gate đề nghị
1. **1-node prod:** hoàn tất Sprint 0 + S1.1/S1.2 → đủ điều kiện.
2. **Enterprise multi-node:** thêm Sprint 2 trọn vẹn (state persisted + index + health) → mới gọi "enterprise-ready".
3. Sprint 3/4 giãn theo release, không chặn go-live nhưng cần cho SLA/UX.

*Kế hoạch này bám API/flow đã verify theo code (2026-07-05). Các bước "flow-risky" (SEC-B2, DB table, antiforgery re-arm) có sub-step verify trước khi bật.*
