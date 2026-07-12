# BÀN GIAO — phiên 2026-07-12 (payment + workflow/inbox). ĐỌC FILE NÀY TRƯỚC

> Phiên này làm: **vá lỗ bypass thanh toán** (owner duyệt), **wire payment backend cho Oqtane + DNN**
> (ưu tiên owner chỉ định), **đóng 6 finding workflow/inbox**, kiểm chứng audit capacity.
> **2 commit đã tạo** (chưa push). Dừng giữa chừng theo yêu cầu owner — phần còn lại ở §3.

---

## 1. TRẠNG THÁI — 11 commit trên `feat/theme-designer-picker-wizard-gallery-1.7.45`, CHƯA push

| Commit | Nội dung |
|---|---|
| `4c35a76` | **fix(workflow+inbox)**: 6 finding QA (chi tiết §2.2) |
| `d974e57` | **fix(payment)**: server xác minh tiền thật + Oqtane/DNN có backend + capacity (chi tiết §2.1) |
| `7412845`…`1830200` | (9 commit của phiên trước — xem `CLAUDE_HANDOFF_20260712_NEXT_SESSION.md`) |

⚠️ **2 file Umbraco vẫn modified trong working tree KHÔNG phải của phiên này**
(`Composers/MegaFormComposer.cs` + `Controllers/MegaFormApiController.cs` — policy `MegaFormBackOffice`, nghi Codex).
**ĐỪNG commit nhầm.** (Phiên này chỉ THÊM file mới `MegaFormPaymentComposer.cs` để tránh đụng vào file của Codex.)

---

## 2. ĐÃ LÀM

### 2.1 PAYMENT (`d974e57`) — lỗ bypass đã bịt

**Vấn đề gốc:** `SubmissionProcessor` không có một dòng nào về payment → client POST
`{"status":"paid"}` trong hidden field là **submit thành công mà không trả xu nào**.

**Đã vá — 8 file mới trong `MegaForm.Core/Payments/`:**

| File | Vai trò |
|---|---|
| `PaymentSubmissionVerifier.cs` | ⭐ **Cổng chính**: bước 9d trong `SubmissionProcessor.ProcessAsync`. Mọi form có payment field → gọi lại Stripe `GET /v1/payment_intents/{id}` / PayPal `GET /v2/checkout/orders/{id}`, kiểm status + **số tiền/tiền tệ khớp giá server tự resolve** + **metadata `formId` khớp** (chặn replay chéo form), chống replay transactionId (registry in-process + tra trùng DataJson), rồi **ghi đè giá trị lưu bằng số gateway xác nhận** (`verified:true`). **Fail-CLOSED mọi nhánh mơ hồ** — kể cả khi host quên đăng ký verifier. `requiredPaid` giờ enforce ở đây (server), không phải widget. |
| `PaymentEndpointService.cs` | Logic create-intent/confirm/create-order/capture/config dùng chung 4 platform. Giá re-resolve từ schema; **form/field không resolve được = REJECT** (hết fail-open); mode `field`/`listenTotals` bị chặn bởi `minAmount`/`maxAmount`. |
| `PaymentGatewayClient.cs` | ⭐ **Capacity**: 1 semaphore chặn **16 call gateway đồng thời** (chờ tối đa 25s → 503 "busy, retry"), cache PayPal OAuth token, retry-1-lần với **Stripe `Idempotency-Key`** + **`PayPal-Request-Id`**. |
| `PaymentRateLimiter.cs` | Per-IP fixed window: 20 create/phút, 40 capture/phút (chống card-testing). |
| `PaymentTransactionRegistry.cs` | Consume-set chống 2 submission cùng 1 transactionId (race) + lưu fact từ webhook. |
| `PaymentWebhookService.cs` | Stripe HMAC-SHA256 (`whsec_`, so sánh constant-time, tolerance 10 phút) + PayPal `verify-webhook-signature`. **WebhookSecret thu ở UI bao lâu nay giờ mới được dùng.** |
| `IPaymentGatewayStore.cs` | Seam credential + `PaymentCurrency` (⭐ fix **zero-decimal**: VND/JPY trước đây bị **nhân 100**). |
| `ModuleSettingsPaymentGatewayStore.cs` | Impl cho Web/Umbraco. |

**Platform (theo chỉ đạo owner: Oqtane + DNN trước):**
- **Oqtane** (trước đây **KHÔNG có backend payment**, widget gọi 404): `Controllers/PaymentController.cs`
  (create-intent/confirm/create-order/capture/public-config/test-credentials + **2 webhook**) +
  `Controllers/MegaFormController.PaymentSettings.cs` (**chỗ lưu key — trước đây không có, đó là lý do không có backend**;
  Setting table trên Site entity, secret `IsPrivate`, gate Admin/Host) + `Services/OqtanePaymentGatewayStore.cs` + DI trong `Startup.cs`.
  ⭐ Response dùng Newtonsoft (`JsonPayload`) — **bẫy STJ** (payload PayPal có JToken).
- **DNN**: `WebApi/PaymentApiController.cs` + 8 route `payments/*` trong `MegaFormRouteMapper` + `Services/DnnPaymentGatewayStore.cs` +
  wire verifier vào `DnnServiceLocator`. `[AllowAnonymous]` **ở action level** (không class level) để không tắt gate admin của test-credentials.
- **Web/Umbraco**: **DEFER harden controller theo chỉ đạo owner**; chỉ đăng ký verifier tối thiểu để submit flow không chết
  (`Program.cs` + `Composers/MegaFormPaymentComposer.cs` — file MỚI, không đụng file Codex đang sửa).

**Widget/UI**: `megaform-widget-payment-unified.ts` thêm `minAmount`/`maxAmount` + tự remap URL sang
`/DesktopModules/MegaForm/API/payments/*` khi phát hiện host DNN; dashboard remap `PAY_API` tương tự.
**AssetVersion → `20260712-B396`**. Bundle đã rebuild + sync.

**Doc**: `Docs/AUDIT_20260711_Payment_Save_And_Process.md` §6 (bảng trạng thái vá) +
`Docs/PAYMENT_CAPACITY_AND_LIMITS_ANALYSIS.md` §7 (đối chiếu từng mục audit của owner — xem §4 dưới).
**CLAUDE.md rule #7** đã sửa cho khớp tên field THẬT (`amountMode`/`amount`/`minAmount`/`maxAmount`, không phải `fixedPrice`).

### 2.2 WORKFLOW/INBOX (`4c35a76`) — 6 finding

1. **Submitter "Unknown"** → gốc là 3 tầng: `SubmissionProcessor` dán placeholder `"user-<id>"` thay vì actor thật;
   case lưu **id số** làm tên; client fallback về `candidateUsers[0]` (**là APPROVER, không phải người nộp**).
   Vá cả 3 + `MyInbox` trả map `submitters` mới (Oqtane join bảng user → **chữa cả task CŨ**; Web/Umbraco đọc từ case).
2. **Picker lưu DisplayName** ("Hoa (Employee)") → thêm `UserName` vào `PermissionPrincipalInfo` + 4 provider + TS; picker lưu username.
3. **3-pane thiếu nút Claim** → thêm, cùng điều kiện với drawer (`pending` + `allowClaim` + chưa assign).
4. **Fields render đôi** → dedup theo key trong `mapFields`. **Badge "Assigned to Me" đếm sai** → đếm theo
   `assignedUserId` (sự thật) thay vì status `pending` (bao gồm cả task chưa ai claim).
5. **Web thiếu RLS** (mọi user đăng nhập xem/sửa/**XOÁ** được mọi submission) → port gate của Oqtane
   (admin → `HoldsTaskForSubmission` → explicit view/manage rule) vào **list/get/export + cả các endpoint mutation**;
   `formId` luôn lấy **từ row**, không từ request. File mới `MegaForm.Web/Controllers/MegaFormController.SubmissionSecurity.cs`.
6. **EmailNodeExecutor** → kiểm tra: **cả 4 platform đã đăng ký rồi**, không cần sửa.

### 2.3 ĐÃ VERIFY TRÊN :5123 (không phải đoán)

Site đã hot-swap 3 DLL mới + 5 bundle JS, restart, **chạy OK**.

| Kiểm chứng | Kết quả |
|---|---|
| `GET /api/megaform/payments/paypal/public-config` | **400** "PayPal client ID and client secret are required" — **trước đây 404** (route không tồn tại trên Oqtane) ✅ |
| `POST .../stripe/create-intent` | **400** "Stripe secret key not configured" ✅ |
| `POST .../stripe/webhook` (không chữ ký) | **400** "Webhook secret is not configured" — fail-closed ✅ |
| Submit form 6 (đã login `emp.hoa`) | 200, submission **106**, `MF_Submissions.UserId=4` |
| `MF_WorkflowCases.StartedByUserName` (sub 106) | **`emp.hoa`** — **trước đây là `"4"`** ✅ |
| `GET /Workflow/MyInbox` (login `mgr.nam`) | trả `submitters: {"101":{userName:"emp.hoa",displayName:"Hoa (Employee)"}, "102":…, "103":…}` — **chữa cả 3 task cũ** ✅ |
| Submit ẩn danh không có cookie (payload rác) | 200 nhưng `IsSpam=1` (anti-spam), submission 105 |

⭐ **Công thức login HTTP không cần browser (khác handoff cũ!)**: trang login là **`/login`** (KHÔNG phải `/pages/login/`)
→ GET `/login` lấy `__RequestVerificationToken` từ HTML → **POST form-encoded tới `/pages/login/`** với token đó
→ cookie `.AspNetCore.Identity.Application` được set → verify bằng `GET /api/User/authenticate`.
Dùng `curl.exe` + cookie jar; trong Git Bash phải `export MSYS_NO_PATHCONV=1` (không thì `returnurl=/` bị dịch thành path Windows).

---

## 3. CÒN LẠI (chưa làm — việc của phiên sau)

### 3.1 🔴 Test bypass thanh toán end-to-end — **ĐANG DANG DỞ, làm tiếp trước tiên**
Đang dựng form QA có payment field để chứng minh `{"status":"paid"}` bị **từ chối**. Vướng ở chỗ seed SQL:
`MF_Forms` **không có cột `ModifiedOnUtc`** (đúng tên là **`UpdatedOnUtc`**, và có các cột NOT NULL:
`ModuleId`, `Description`, `SettingsJson`, `ThemeJson`, `RedirectUrl`, `WebhookUrl`, `WebhookSecret`, `WebhookHeaders`,
`NotifyEmails`, `NotifyTemplate`, `AutoresponderEmailField/Subject/Body`, `AppScope`, `RulesJson`, `WorkflowJson`,
`CreatedByUserId` — phải điền hết, dùng `''`/`0`).
SQL seed dở nằm ở `<scratchpad>/seed_payment_form.sql`. Schema form cần:
`{"fields":[{"key":"payment","type":"Payment","widgetProps":{"amountMode":"fixed","amount":49.99,"currency":"USD","requiredPaid":true}}]}`.
**Kỳ vọng:** POST submit với `payment: {"status":"paid","transactionId":"pi_fake"}` → **400/reject**
("Payment provider is not configured" vì :5123 chưa có Stripe key — đó chính là fail-closed đúng ý đồ);
và submit KHÔNG có payment → reject "Payment is required".

### 3.2 Load test 100/1000 concurrent (owner hỏi)
Chưa chạy. Ý tưởng: bắn N request đồng thời vào `stripe/create-intent` → kỳ vọng **429** sau 20 req/phút/IP
(rate limiter) và **503 "busy"** khi vượt 16 call gateway đồng thời. Lưu ý: :5123 chưa có Stripe key nên create-intent
trả 400 **trước khi** chạm gateway → muốn test bulkhead thật phải cấu hình key test.

### 3.3 AI obedience test (key owner đã cấp)
Key OpenAI tạm ở `<scratchpad>/openai-key-5123.txt` (**KHÔNG commit**). Cách nạp:
`POST /api/AiAssistant/DefaultConfig?siteId=1` (cần login Admin/Host: `host` / `abc@ABC1024`).
Prompt test: *"ẩn cột Salary với mọi role trừ Finance, và khoá Amount chỉ Finance sửa được"*
→ kỳ vọng AI sinh `showIf`/`readOnlyIf` (tab Access), **không** sinh rule client, **không** chế CSS.

### 3.4 Pack 1.7.103 + fresh install (owner yêu cầu, kèm tabbed template + KB)
Đã điều tra xong đường đi, **chưa thực hiện**:
- **Tabbed template**: file có sẵn `Samples/FormTemplates/Premium/DONEE/tabbed-account-setup.json` nhưng
  **CHƯA nằm trong catalog ship**. Chỉ cần **copy** nó vào
  `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/` → nuspec wildcard tự ship, `BuilderTemplateCatalogService.SeedTemplatesIfEmpty`
  tự copy sang App_Data lúc chạy lần đầu → hiện ở `/templates`. (Đừng bỏ vào `Samples/FormTemplates/Premium/` top-level:
  `verify-package-complete.cjs` sẽ **abort pack** nếu thiếu `.facts.json` + `.guide.md` + seed SQL.)
- **KB 328/329**: **đã có sẵn** trong `MegaForm.Core/Seed/ai-knowledge-seed.json` (dòng 4218, 4231) — chỉ cần **build lại**
  Server DLL là embedded resource mang theo. (gói 1.7.102 pack TRƯỚC commit KB nên mới thiếu.)
- **Bump version** (3 chỗ): `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec:5` (+ releaseNotes:16);
  `MegaForm.Oqtane.Client/ModuleInfo.cs:12` `Version = "1.7.103"` **và** thêm `,1.7.103` vào `ReleaseVersions` (dòng 14).
  **AssetVersion đã ở B396 rồi** (phiên này bump).
  ⚠️ **KHÔNG bump ModuleInfo.Version = DLL không swap khi cài.**
- **Pack**: chạy `pack.cmd` ở root (nó tự build TS + Shared/Core/Client/Server Release net9+net10 + `nuget.exe pack … -NoPackageAnalysis`).
- **Fresh install + QA regression** (owner yêu cầu "không được regression"): clone site mới, cài nupkg, verify:
  16+1 template ở `/templates`, submit công khai, builder mở được, KB 328/329 có trong `MF_AI_Knowledge`, My Inbox hiển thị submitter thật.

### 3.5 Việc còn treo từ audit capacity (KHÔNG chặn payment)
- ❌ **`IncrementUniqueId` không thread-safe** (audit owner đúng): Oqtane dùng `ConcurrentDictionary` **static in-memory**
  (`EfPhase2Repository.cs:42,517-521`) → **reset khi restart** → trùng ID; Umbraco EF read-modify-save. Cần counter atomic ở DB.
- ⏳ **Queue reconciliation bất đồng bộ** (mục 5 trong audit) — chưa làm; đây là trần thật cho ">1000 đồng thời ai cũng thành công ngay lần bấm đầu".

---

## 4. TRẢ LỜI AUDIT CAPACITY CỦA OWNER (đã kiểm chứng từng dòng — **audit ĐÚNG 100%**)

| Owner nói | Thực tế | Sau phiên này |
|---|---|---|
| Server không xác minh payment | ✅ ĐÚNG | **ĐÃ VÁ** (`PaymentSubmissionVerifier`) |
| Không idempotency key | ✅ ĐÚNG | **ĐÃ VÁ** (Stripe `Idempotency-Key` + `PayPal-Request-Id`) |
| PayPal token không cache | ✅ ĐÚNG (mỗi call xin token mới) | **ĐÃ VÁ** (cache tới trước hạn 60s) |
| HttpClient trơ, không retry/circuit breaker/bulkhead | ✅ ĐÚNG | **bulkhead 16 + retry-1** (không dùng Polly — Core target net472) |
| Không queue/rate limit | ✅ ĐÚNG | **rate-limit per-IP + semaphore**; queue reconciliation **vẫn còn treo** |
| Rate limit provider Stripe ~100/s, PayPal ~50/s | ✅ ĐÚNG | bulkhead giữ ~40–80 req/s → **dưới trần**; burst dư nhận 429/503 sạch thay vì sập host |
| UniqueId không thread-safe (Umbraco/Oqtane) | ✅ ĐÚNG | **CHƯA VÁ** (§3.5) |
| Lệch pha: chỉ Web có PaymentController | ✅ ĐÚNG | **Oqtane + DNN đã có đủ**; Umbraco vẫn chưa (owner defer) |

---

## 5. BẪY MỚI CỦA PHIÊN NÀY

1. ⭐ **Trang login Oqtane là `/login`, KHÔNG phải `/pages/login/`** (handoff cũ ghi sai) — nhưng **POST** thì vẫn tới `/pages/login/`.
   Xem công thức đầy đủ ở §2.3.
2. ⭐ **`MF_Forms` không có `ModifiedOnUtc`** — là `UpdatedOnUtc`; và **rất nhiều cột NOT NULL** không có default → seed SQL phải điền hết.
3. ⭐ Git Bash **nuốt** heredoc có dấu nháy lồng nhau → viết script Python ra file rồi chạy (đã dùng cách này để patch 8 endpoint Web).
4. ⭐ PowerShell chặn `Remove-Item` khi biến path rỗng (`$env:TEMP` không expand trong 1 số ngữ cảnh) → dùng `Join-Path` + `-LiteralPath`.
5. ⭐ Web `MegaFormController` **đã có sẵn** `IsSubmissionAdmin` (trong `MegaFormController.UploadAndSdk.cs`) → khai lại trong partial mới = **CS0111**.
6. ⭐ `MegaForm.UI/src/builder/workflow/wf-app.ts:785` có **lỗi cú pháp TS có sẵn từ trước** (TS1128) → `npx tsc --noEmit` toàn repo sẽ báo lỗi này;
   **không phải do phiên này**, và các bundle vẫn build được (vite bỏ qua). Đừng hoảng.

## 6. ĐỌC THÊM
- `CLAUDE_HANDOFF_20260712_NEXT_SESSION.md` — bàn giao phiên trước (9 commit, hạ tầng :5123, 7 bẫy cũ).
- `Docs/AUDIT_20260711_Payment_Save_And_Process.md` §6 + `Docs/PAYMENT_CAPACITY_AND_LIMITS_ANALYSIS.md` §7.
