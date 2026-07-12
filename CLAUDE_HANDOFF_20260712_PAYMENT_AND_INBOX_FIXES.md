# BÀN GIAO — phiên 2026-07-12 (payment + workflow/inbox). ĐỌC FILE NÀY TRƯỚC

> Phiên này làm: **vá lỗ bypass thanh toán** (owner duyệt), **wire payment backend cho Oqtane + DNN**
> (ưu tiên owner chỉ định), **đóng 6 finding workflow/inbox**, kiểm chứng audit capacity.
> **2 commit đã tạo** (chưa push). Dừng giữa chừng theo yêu cầu owner — phần còn lại ở §3.

---

## 1. TRẠNG THÁI — 13 commit trên `feat/theme-designer-picker-wizard-gallery-1.7.45`, CHƯA push

| Commit | Nội dung |
|---|---|
| `b842d61` | **release(oqtane) 1.7.103** — ĐÃ PACK XONG (chi tiết §2.4) |
| `cd211ce` | docs: bàn giao (file này) |
| `4c35a76` | **fix(workflow+inbox)**: 6 finding QA (chi tiết §2.2) |
| `d974e57` | **fix(payment)**: server xác minh tiền thật + Oqtane/DNN có backend + capacity (chi tiết §2.1) |
| `7412845`…`1830200` | (9 commit của phiên trước — xem `CLAUDE_HANDOFF_20260712_NEXT_SESSION.md`) |

### ✅ PACKAGE ĐÃ CÓ: `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.103.nupkg` (78.9 MB)
Gói **đã tự copy vào Oqtane Packages folder** (pack.cmd làm bước cuối). `.nupkg` bị gitignore (đúng chuẩn) — chỉ nguồn được commit.

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

### 2.4 PACKAGE 1.7.103 (`b842d61`) — ĐÃ PACK + VERIFY

- **Tabbed template giờ mới thật sự ship**: `tabbed-account-setup.json` có sẵn trong `Samples/.../DONEE/`
  nhưng **chưa bao giờ được copy vào catalog mà gói mang theo** → không install nào từng thấy nó.
  Đã copy vào `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/`.
  ⭐ Icon của nó là **mojibake `"??"`** → gallery chỉ render class `fa-*` và glyph thật, nên nó sẽ **in ra chữ "??"**.
  Đã đổi thành `fa-table-columns` (icon codebase đã dùng sẵn).
- **KB 328/329 giờ mới ship**: đã nằm sẵn trong `MegaForm.Core/Seed/ai-knowledge-seed.json`, chỉ cần **build lại Server DLL**
  là embedded resource mang theo. (Gói 1.7.102 pack TRƯỚC commit KB → install mới từ 1.7.102 **vĩnh viễn** không có
  vì seeder chỉ chạy khi bảng rỗng.)
- **Version**: `ModuleInfo.Version = 1.7.103` **+ thêm `1.7.103` vào `ReleaseVersions`** (thiếu 1 trong 2 → Oqtane không swap DLL).
  nuspec `<version>` + releaseNotes viết lại. AssetVersion đã ở **B396** từ trước.
- **VERIFY BẰNG ARTIFACT, không tin build log** (script: `<scratchpad>/verify_nupkg.py`, **32/32 PASS**):
  đủ 4 DLL × 2 TFM (net9 + net10); Server DLL **embed KB seed + chứa slug 328/329**; Shared DLL stamp **B396**;
  Core DLL chứa đủ 5 class payment; gói có **17 template** (16 + tabbed hợp lệ, `tabbedForm=true`, 19 field);
  JS trong gói là bản **rebuild** (payment widget có `adaptPayUrl` + min/max; my-inbox đọc `submittedByDisplayName`).

⚠️ **Bẫy hạ tầng**: `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/` **bị .gitignore** (bản deploy).
16 template kia chỉ tồn tại **trên đĩa máy này**, không có trong git — nguồn canonical là `Samples/FormTemplates/Premium/DONEE/`
(16/17 file đã tracked; file tabbed vừa được commit). **Clone sạch rồi pack sẽ ra gói THIẾU template** cho tới khi có ai đó
copy DONEE → wwwroot. Không có script tự động làm việc này.

### 2.5 FRESH INSTALL 1.7.103 + QA REGRESSION — ✅ PASS (site mới `:5124`)

Site sạch `Oqtane.MegaForm.Fresh1803` / DB `Oqtane_MegaForm_Fresh1803` / host `abc@ABC1024`.

⚠️⚠️ **BẪY LỚN — framework template BỊ NHIỄM.** `Oqtane.Framework.10.1.0_1` (nguồn clone của mọi lần fresh)
**đã có sẵn MegaForm 1.6.5**: DLL ở root, `wwwroot/Modules/MegaForm/`, **`App_Data/MegaForm/Templates/` (catalog đã seed)**,
và `Oqtane.Server/Packages/` chứa nupkg 1.7.22 + 1.7.23. Nếu không dọn thì:
(a) đó là test **upgrade**, không phải fresh install; (b) **`App_Data` có catalog cũ ⇒ `SeedTemplatesIfEmpty` no-op ⇒
test template sẽ PASS GIẢ trên dữ liệu cũ**, không chứng minh được gói có ship template hay không.
→ Phải xoá sạch: `MegaForm*` ở root + `wwwroot/Modules/MegaForm` + **`App_Data/MegaForm`** + `Content` + `Data` + `*.db`
+ `Oqtane.Server/Packages/MegaForm*`. Sau đó rescan `-Filter "*MegaForm*" -Recurse` phải ra **rỗng**.

| Kiểm chứng trên site sạch | Kết quả |
|---|---|
| Module đăng ký | `ModuleDefinition.Version = **1.7.103**` ✅ |
| Bảng DB | 29 bảng `MF_*` tạo mới ✅ |
| Template trong wwwroot (từ gói) | **17** (có `tabbed-account-setup.json`) ✅ |
| Seed sang App_Data | **17** ✅ |
| API gallery `BuilderTemplates/List` | phục vụ **17**, có "Tabbed Account Setup", icon `fa-table-columns` ✅ |
| Tabbed template đầy đủ? | **19 field, 6 Section (=6 tab)**, customHtml 7.9KB, customCss 22KB ✅ |
| KB rule mới (seed từ GÓI, không insert tay) | 2 dòng: `edit-premium-template-structure-only`, `readonly-by-role-is-access-control` ✅ (Id trong DB là **identity**, không phải 328/329 — tra theo **slug**) |
| Payment endpoint trên fresh install | `paypal/public-config` **400**, `stripe/create-intent` **400**, `stripe/webhook` **400** — **fail-closed, KHÔNG còn 404** ✅ |
| Admin API (không regression) | `Form/List` → 200 ✅ |

⚠️ **`pack.cmd` XOÁ các nupkg cũ** trong `MegaForm.Oqtane.Package/` → không còn bản 1.7.102 để đối chứng.
Muốn giữ thì backup trước khi pack.

### 2.6 ⭐ KIỂM CHỨNG CÂU HỎI KHÁCH: xoá field → dữ liệu cũ CÓ CÒN KHÔNG?

Chạy thật trên :5123 (form 6, submission 106): xoá field `phone_number` → restart → mở lại bản ghi cũ.

| | Kết quả |
|---|---|
| Field còn trong form? | ❌ đã xoá (schema còn 18) |
| Giá trị lịch sử còn phục vụ? | ✅ **CÒN** — `label='Phone'`, `value='0901234567'` |
| `DataJson` thô | ✅ còn nguyên |

**Cơ chế:** chi tiết bản ghi đọc từ **snapshot đã lưu** (`MF_SubmissionValues`, đông cứng key+label+type+value lúc submit),
**không phải** từ schema hiện tại → field đã xoá vẫn hiện đúng nhãn cũ. `SubmissionQueryService.GetDetail:102`.
⚠️ Nếu submission **không có** snapshot (`hasSnapshot=false`) thì fallback suy ra từ schema hiện tại → field đã xoá **sẽ không hiện**.
⚠️ Cột trong **grid vẫn biến mất** (grid dựng cột theo form hiện tại) — dữ liệu không mất, chỉ là không hiển thị ở grid.

⭐⭐ **BẪY khi sửa schema bằng SQL:** `SchemaJson` chứa **CẢ `fields` LẪN `Fields`** (mỗi mảng 19 field).
Xoá một mảng thôi → field **vẫn còn** (API merge cả hai → ra 37 field). Phải xoá **cả hai**.
(Cũng phát hiện: snapshot có **26 dòng cho 19 field** ⇒ đúng là dữ liệu bị lặp — xác nhận gốc của bug "fields render đôi" đã vá.)

### 2.7 ⭐⭐ PAYMENT E2E VỚI THẺ THẬT → tìm ra bug chết người → **1.7.104**

Owner cấp Stripe test key. Chạy E2E trên site sạch :5124.

#### 🔴 E2E LỘ RA BUG MÀ SMOKE TEST KHÔNG BAO GIỜ BẮT ĐƯỢC
**Mọi endpoint payment Oqtane trong 1.7.103 đọc body RỖNG.** Oqtane **không** gọi `.AddNewtonsoftJson()`
→ tham số `[FromBody] JObject` **bind = null**. Lưu key trả `"body required"`; create-intent/confirm/capture/
test-credentials đều không nhận được gì.
⭐ **Vì sao smoke test PASS giả:** nó dừng ở check *"Stripe secret key not configured"* — check này chạy
**TRƯỚC KHI** đọc body. **Endpoint trông như còn sống trong khi đang điếc.**
→ Vá: `[FromBody] JsonElement` + parse (đúng pattern `MegaFormController.SaveForm` đã ghi chú từ lâu — controller mới
không đọc chú thích đó). Commit `48c6cd0`. **Bắt buộc bump 1.7.104** (Oqtane không swap DLL nếu version không tăng).

#### ✅ KẾT QUẢ E2E SAU KHI VÁ (số liệu thật, dùng được cho tài liệu bán hàng)
| Bước | Kết quả |
|---|---|
| Lưu Stripe key (Payment Settings Oqtane) | 200; secret `IsPrivate=1`, đọc lại **đã che** |
| `create-intent` ẩn danh | **PaymentIntent thật** `pi_3TsL7V9…`, 49.99 USD |
| Quẹt thẻ test `4242…` | Stripe: `succeeded`, **4999 cents** — tiền chuyển thật |
| Nộp form | 200; DataJson có **`"verified":true`** + số tiền **gateway xác nhận** |

#### 🛡️ 5 ĐÒN TẤN CÔNG — CHẶN SẠCH
| Tấn công | Kết quả |
|---|---|
| Khai giá 1.00 (schema 49.99) | Server dùng giá của mình — **Stripe xác nhận intent = 4999 cents** |
| `status:"paid"` + transactionId bịa | ❌ "Payment could not be verified" |
| Replay giao dịch thật lần 2 | ❌ "already been used by another submission" |
| Bỏ qua payment (`requiredPaid`) | ❌ "Payment is required" |
| Dùng giao dịch của form 1 nộp form 2 | ❌ "could not be verified for this form" |

**DB sau cùng: đúng 2 bản ghi, cả 2 là người trả tiền thật, cả 2 `gateway-verified`. Không bản ghi gian lận nào lọt.**
⭐ Sau khi bị chặn ở form 2, **chính giao dịch đó vẫn nộp được cho form 1** → guard **nhả đặt chỗ khi verify fail**,
người trả tiền thật không bị khoá nhầm.

⚠️ Key Stripe test ở `<scratchpad>/stripe-test-keys.txt` — **KHÔNG commit**. Site :5124 đã nạp key (DB, IsPrivate).

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

### 3.0 ⭐ VIỆC CHÍNH CỦA PHIÊN SAU = `SPEC_20260712_DOCFX_CUSTOMER_QUESTIONS_AND_GIFS.md`
Owner yêu cầu: bổ sung **tài liệu DocFX + GIF demo** trả lời 7 câu hỏi của khách. Spec chi tiết đã viết sẵn ở file trên.
✅ **Q1 (payment) KHÔNG CÒN LÀ ẨN SỐ** — phiên 07-12 đã chạy E2E với thẻ thật (xem §2.7). Giờ chỉ còn **quay GIF + viết bài**.

### 3.4 ~~Pack 1.7.103~~ ✅ ĐÃ XONG (§2.4) — ~~fresh install + QA~~ ✅ CŨNG XONG (§2.5)
Gói `MegaForm.Oqtane.1.7.103.nupkg` (78.9 MB) đã sẵn sàng và đã tự copy vào Oqtane Packages folder.
**Chưa làm: cài lên 1 site Oqtane SẠCH và QA chống regression** (owner yêu cầu "không được regression"). Checklist:
- clone site Oqtane mới + appsettings SQL + silent install + bỏ nupkg vào `Packages/` → khởi động;
- verify: **17 template** ở `/templates` (có "Tabbed Account Setup", icon hiện đúng không phải "??");
- mở template tabbed → 6 tab bấm chuyển được, submit được;
- submit form công khai + builder mở được (không regression);
- `SELECT * FROM MF_AI_Knowledge WHERE Id IN (328,329)` → **có 2 dòng** (seeder chạy trên bảng rỗng);
- My Inbox hiển thị **tên người nộp thật** (không phải "Unknown");
- payment endpoint trả 400 fail-closed (không phải 404).
⭐ **Chạy `pack.cmd` phải gọi `.\pack.cmd`** — máy này có `NoDefaultCurrentDirectoryInExePath=1` nên `pack.cmd` trơn = "not recognized".

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
