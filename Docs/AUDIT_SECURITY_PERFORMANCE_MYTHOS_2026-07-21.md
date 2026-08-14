# MegaForm — Báo cáo Audit Security & Performance (phương pháp Mythos)

> **Ngày audit:** 2026-07-21
> **Branch:** `feature/typed-submission-storage-core` (working tree)
> **Phạm vi:** `MegaForm.Core`, `MegaForm.Umbraco`, `MegaForm.Umbraco.Host`, `MegaForm.DNN`, `MegaForm.Oqtane.*`, `MegaForm.Web(.Host)`, `MegaForm.UI` (TS/Vite), `Assets/`, `Samples/`.
> **Bỏ qua:** `bin/`, `obj/`, `node_modules/`, `dist/`, `_audit_temp/`, `local-packages*/`.
> **Tính chất:** audit read-only, không sửa code. Mọi finding đều có bằng chứng `path:line` trỏ tới code đã đọc trực tiếp.

---

## 0. Phương pháp Mythos

Audit được thực hiện theo phong cách **Mythos** (cách Anthropic Claude Mythos / Project Glasswing tiếp cận đánh giá bảo mật):

1. **Review như senior engineer:** đọc code thật, truy root cause, không dựa vào pattern matching bề mặt; bắt cả những bug rất tinh vi (ví dụ nhánh `?path=` return sớm trước ownership check, clamp 500/250 lệch nhau giữa service và repository).
2. **Tư duy exploit-oriented:** với mỗi finding, lập luận cụ thể kẻ tấn công đi từ đâu (anonymous / backoffice user quyền thấp / submitter), qua endpoint nào, đạt được gì — thay vì chỉ liệt kê "code có mùi".
3. **Đối chiếu chéo (twin-diff):** cùng một API surface trên 4 platform (DNN / Oqtane / Umbraco / Web) được so sánh tư thế phòng thủ; chênh lệch chính là nơi bug trú ngụ (ví dụ DNN có 3 lớp gate còn Umbraco port vô tình hạ xuống `IsAuthenticated`).
4. **Đánh giá mức độ theo chuỗi khai thác (chain):** các lỗi Medium đứng một mình được nâng mức khi chain được với nhau (ví dụ stored XSS → đọc `localStorage` token → chiếm backoffice).
5. **Ghi nhận cả điểm làm tốt:** defense-in-depth đang có phải được ghi lại để không phá vỡ khi sửa lỗi.

Audit chạy 6 luồng song song: (A) AuthN/AuthZ, (B) Injection/XSS/Upload/Deserialization, (C) Secrets/Crypto/Payment, (D) Performance backend, (E) Frontend TS + Embed/CORS, (F) Cross-platform + CSRF.

---

## 1. Tóm tắt điều hành

| Mức | Security | Performance |
|---|---|---|
| Critical | 4 | 2 |
| High | 10 | 5 |
| Medium | 17 | 9 |
| Low | 13 | 6 |

**Bức tranh chung:** `MegaForm.Core` có nền phòng thủ tốt (payment verifier fail-closed, SSRF guard, whitelist identifier cho SQL, workflow authorization server-side). Vấn đề tập trung ở **bản port Umbraco** — nơi việc nới lỏng auth cho admin host pages (Phase 6) đã kéo theo hàng loạt gate yếu hơn twin DNN/Oqtane — và ở **một stored XSS trong shared TS UI** ảnh hưởng cả 3 platform.

**5 rủi ro phải xử lý trước tiên (P0):**

1. **SEC-01 — Stored XSS trong Submissions grid → đánh cắp token backoffice Umbraco** (anonymous → admin takeover, không cần click).
2. **SEC-02 — `SubformController.IsAdmin = IsAuthenticated`** (Umbraco): bất kỳ backoffice user nào cũng đọc toàn bộ DB + chạy DDL.
3. **SEC-03 — `AiToolsController` cho phép SQL tùy ý** (Umbraco) chỉ với quyền backoffice thấp nhất.
4. **SEC-04 — JWT signing key thật bị commit** trong `MegaForm.Web.Host/appsettings.Production.json` → phải rotate ngay.
5. **PERF-01 — N+1 typed-store trên Oqtane submissions list** (~2.000 query cho 1 trang 250 dòng; endpoint anonymous-reachable) + **PERF-02 — `FormsOverview` legacy load toàn bộ submissions vào RAM**.

---

## 2. Phát hiện Security

### 2.1 CRITICAL

#### SEC-01 (Critical) — Stored XSS trong Submissions grid qua `innerHTML` không escape
- **Bằng chứng:** `MegaForm.UI/src/submissions/SubmissionsShell.ts:1282-1284` — `nameVal`/`emailVal` lấy từ `DataJson` của submission (attacker-controlled qua public `Submit`) được nối thẳng vào `wrap.innerHTML`. Mọi nhánh khác của `renderCell` đều dùng `textContent` đúng chuẩn — đây là ngoại lệ duy nhất.
- **Khai thác:** attacker submit form public với `name = <img src=x onerror=...>`. Khi admin mở trang Submissions (shared TS UI, dùng chung DNN/Oqtane/Umbraco), payload chạy trong origin admin. Trên Umbraco nó chạy trong iframe Bellissima nơi token backoffice nằm trong `localStorage['umb:userAuthTokenResponse']` và `window.__MF_TOKEN` → đánh cắp token, chiếm toàn bộ backoffice. `name`/`email` là field key phổ biến nhất nên cột trigger gần như luôn hiện diện.
- **Hướng sửa:** render bằng `textContent`/DOM nodes (hoặc qua helper `escapeHtml` sẵn có); sweep toàn file tìm interpolations `${value}` khác từ submission data; thêm regression test với fixture `<img onerror>`.

#### SEC-02 (Critical) — `SubformController` (Umbraco): bất kỳ backoffice user nào cũng là "admin" → đọc DB tùy ý + DDL
- **Bằng chứng:** `MegaForm.Umbraco/Controllers/SubformController.cs:43` — `private bool IsAdmin => User?.Identity?.IsAuthenticated == true;` gating `Tables` (:67), `GetRows` (:186-221, `SELECT * FROM [table]`), `ApplyDdl` (:223, CREATE TABLE). Class chỉ có `[Authorize(Policy = "MegaFormBackOffice")]` (:22) — policy này = bất kỳ backoffice user đã login (`MegaForm.Umbraco/Composers/MegaFormComposer.cs:94-100`).
- **Khai thác:** tạo account Umbraco quyền thấp nhất (Translator, không có section MegaForm). `GET .../Subform/Rows?tableName=umbracoUser&parentKeyColumn=id&submissionId=1` trả về password hash của admin; lặp với `MF_Submissions` (PII) v.v. Twin Oqtane dùng check thật `IsInRole(Admin/Host)` (`MegaForm.Oqtane.Server/Controllers/SubformController.cs:50`); DNN có 3 lớp (`[DnnAuthorize(StaticRoles="Administrators")]` + antiforgery + re-check, `MegaForm.DNN/WebApi/SubformController.cs:36,88-94`).
- **Hướng sửa:** thay `IsAdmin` bằng `IMegaFormPermissionService`/admin-group resolution, hoặc `[MegaFormAuthorize(EditLetter)]`.

#### SEC-03 (Critical) — `AiToolsController` (Umbraco): SQL tùy ý cho mọi backoffice user, không có admin check
- **Bằng chứng:** `MegaForm.Umbraco/Controllers/AiToolsController.cs:25` (chỉ `[Authorize(Policy = "MegaFormBackOffice")]`, không có helper `IsAdmin`), `PreviewSql` (:121-138 → `DataRepeaterService.ExecutePreviewSql`, guard SELECT-only tại `MegaForm.Core/Services/DataRepeaterService.cs:409`), `ExecuteDdl` (:386-436 → `SqlDdlGuard` cho CREATE/ALTER/INSERT 1 statement).
- **Khai thác:** cùng kịch bản SEC-02: `POST .../AiTools/PreviewSql {"sql":"SELECT TOP 200 * FROM umbracoUser"}` → đọc toàn bộ dashboard DB và mọi external connection được allow-list; `ExecuteDdl` thêm ALTER/INSERT. DNN/Oqtane gate bằng host/admin role.
- **Hướng sửa:** thêm admin-group/ManagePermissions check từng action; giữ SQL guard làm lớp phòng thủ thứ hai.

#### SEC-04 (Critical) — JWT signing key thật bị commit vào git
- **Bằng chứng:** `MegaForm.Web.Host/appsettings.Production.json:14` — `"Key": "bLxOINZDzov+Xzak6AlXAzLWoxiUcgCxY99l6ZupvOEqiYaoGffnAV2/0NY5dtnv"` (base64 64 ký tự, git-tracked). File twin `MegaForm.Web/appsettings.Production.json:13` đã có comment remediation *"The previously-committed key was rotated out and MUST be considered compromised"* — nhưng bản Web.Host vẫn ship key.
- **Khai thác:** ai có quyền đọc repo đều mint được JWT hợp lệ (HS256, `ValidateIssuerSigningKey`, `MegaForm.Web/Program.cs:181`), kể cả token với role `Administrator` → full admin API trên mọi host deploy config này. Key phải xem như đã bị lộ.
- **Hướng sửa:** thay bằng placeholder env (`__SET_MEGAFORM_JWT_KEY_ENV_IN_PRODUCTION__`), rotate key trên mọi host từng dùng, purge khỏi git history.

### 2.2 HIGH

#### SEC-05 (High) — Policy `MegaFormBackOffice` quá rộng: mọi backoffice user có full data access trên ~12 controllers
- **Bằng chứng:** định nghĩa policy `MegaForm.Umbraco/Composers/MegaFormComposer.cs:94-100` chỉ là `RequireAuthenticatedUser()` trên cookie + bearer backoffice — không check section access, user group, hay permission letter. Đây là gate duy nhất của: `ReportsController` (:22 — `SubmissionData` :189 dump tới 5000 dòng submission PII cho bất kỳ `formId`; `Backfill` :246), `WorkflowController` (:28), `ExternalTableController` (:25-26), `UserTemplateController` (:22-23), `StarterController` (:23-24), `RazorWidgetController` (:20), `MegaFormLocalAiController` (:42), `AiKnowledge*`, `AiAssistantController`.
- **Khai thác:** content editor không có quyền MegaForm vẫn exfil toàn bộ PII qua `/Reports/SubmissionData?formId=N&top=5000`, seed app qua Starter, probe external DB metadata. Giả định "real authorization lives in MegaFormApiController" chỉ đúng với một nửa API surface.
- **Hướng sửa:** thêm section-access + minimum-permission vào policy (hoặc policy thứ hai), hoặc chuyển các controller này sang `[MegaFormAuthorize(...)]` per action.

#### SEC-06 (High) — `SdkDemoDownload?path=` bypass ownership check (IDOR trên PrivateUploads)
- **Bằng chứng:** `MegaForm.Umbraco/Controllers/MegaFormApiController.UploadAndSdk.cs:197-208` — nhánh `path` (:199-200) return trước check `IsSubmissionAdmin || isOwner` (:206-208); `ServePrivateUploadByPath` (:222-238) chỉ chặn traversal (containment check tốt), không check authorization. Bare `[Authorize]` còn khiến scheme thực tế mơ hồ (có thể cả member cookie).
- **Khai thác:** user authenticated bất kỳ gọi `SdkDemo/Download?path=<storedPath>` đọc file private upload của ngưới khác (CV, giấy tờ, PDF). `StoredPath` lộ qua submissions UI/API và link `GetFileUrl` trong email (`PlatformServices.cs:401-405`).
- **Hướng sửa:** không nhận raw path từ query string; resolve fileId→submission và chạy owner/admin check trên mọi nhánh; pin scheme/policy rõ ràng.

#### SEC-07 (High) — Bypass per-form permission qua formId nằm trong JSON body
- **Bằng chứng:** `MegaFormApiController.cs:162-165` (`FormSave`, `EditLetter`, không `FormIdParameter`), `:396-411` (`SaveForm` — còn giữ `PortalId`/ids do caller truyền), `:134-149` (`Workflow/Save`), `Permissions/Save` (:668-680). Handler chỉ đọc route/query/form-values, không đọc JSON body: `MegaForm.Umbraco/Permissions/MegaFormPermissionAuthorizationHandler.cs:69-93`.
- **Khai thác:** user được cấp Edit trên form A (granular) post `{"FormId": B, ...}` vào `Form/Save` → overwrite form B, schema, workflow, và cả permissions (`Permissions/Save`). Object-level authorization thực chất vắng mặt cho mọi ID nằm trong body.
- **Hướng sửa:** resolve target formId trong action và re-check `HasPermission(letter, formId)` bằng code (pattern sẵn có ở `MegaFormPermissionController.FormPermissionAssignments`).

#### SEC-08 (High) — Umbraco: không verify CAPTCHA server-side + rate limiting chưa được nối
- **Bằng chứng:** `DoSubmitAsync` (`MegaFormApiController.cs:504-532`) không check `form.EnableCaptcha`; Core strip captcha với comment "client-side only" (`MegaForm.Core/Services/SubmissionProcessor.cs:252-260`); `CaptchaService.VerifyAsync` đăng ký ở `MegaFormComposer.cs:301` nhưng không nơi nào gọi trên Umbraco. DNN và Web đều verify server-side (`MegaForm.DNN/WebApi/MegaFormApiController.cs:1129`, `MegaForm.Web/Controllers/MegaFormController.cs:764`). Rate limit: `GetRateLimitCount` (`MegaForm.Umbraco/Data/UmbracoRepositories.cs:217-221`) không có caller; `AntiSpamService.RateLimitChecker` (`MegaForm.Core/Services/AntiSpamService.cs:58`) không được assign trên Umbraco → `?? true` no-op.
- **Khai thác:** form bật CAPTCHA trên Umbraco vẫn nhận submit scripted không giới hạn (spam, DB bloat, workflow flooding, tạo payment-intent ẩn danh). `Upload/File` anonymous (:801-844) cho phép ghi 10 MB/lần không throttle.
- **Hướng sửa:** nối `ICaptchaService.VerifyAsync` vào `DoSubmitAsync` khi `EnableCaptcha`; wire `RateLimitChecker` trong composer; enforce rate-limit trên submit/upload/payment.

#### SEC-09 (High) — Fetch interceptor làm rò rỉ bearer token cross-origin (substring URL matching)
- **Bằng chứng:** `MegaForm.UI/src/umbraco-host/index.ts:43-46` — `isMegaFormApiUrl` dùng `lower.indexOf(pattern) !== -1` (không check origin), sau đó :83-85 gắn `Authorization: Bearer <token>`.
- **Khai thác:** bất kỳ script nào trong trang admin fetch `https://attacker.example/x?q=/api/MegaForm/` đều nhận kèm token backoffice Umbraco (token toàn backoffice, không phải MegaForm-scoped). Trigger cụ thể: AI assistant fetch endpoint do admin cấu hình (`ai-form-assistant/providers.ts`) — kẻ kiểm soát config đó trỏ URL về server mình. So sánh: DNN interceptor check `new URL(...).origin === window.location.origin` đúng chuẩn (`Assets/js/megaform-admin-live.js:1`).
- **Hướng sửa:** parse URL, yêu cầu `url.origin === location.origin && url.pathname.startsWith(pattern)` trước khi gắn header.

#### SEC-10 (High) — Reflected JS injection trong `/megaform/form/{id}/script` qua `?lang=`
- **Bằng chứng:** `MegaForm.Umbraco/Controllers/FormController.cs:99` nội suy `GetRequestLocale(form)` thô vào JS single-quoted string; `GetRequestLocale` (:166-190) trả `Request.Query["lang"]` (hoặc `Accept-Language`) không validate. (`Public.cshtml` không bị vì Razor encode.)
- **Khai thác:** `GET /megaform/form/1/script?lang=x'-alert(document.domain)-'` trả `application/javascript` chứa JS attacker. Snippet embed vốn được thiết kế để copy-paste sang site khác — attacker gửi embed tag đã poison (social engineering, Tag Manager độc) → thực thi JS trong origin nạn nhân mỗi page load.
- **Hướng sửa:** whitelist locale `^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$`, hoặc serialize bằng `JsonConvert.SerializeObject` khi emit vào JS.

#### SEC-11 (High) — `embed.html?server=` load script từ origin tùy ý
- **Bằng chứng:** `Assets/embed.html:18,27-32` và bản copy `MegaForm.Umbraco/wwwroot/embed.html:18,27-32` — `script.src = server + '/DesktopModules/.../megaform-embed.js'` với `server` lấy từ query param.
- **Khai thác:** link `https://victim-host/.../embed.html?server=https://evil.tld` thực thi JS của evil.tld **trên origin victim** (đọc được cookie/localStorage origin đó). Bản Umbraco còn trỏ sai path DNN — vừa hỏng vừa nguy hiểm.
- **Hướng sửa:** bỏ param `server` (same-origin only) hoặc allowlist; không ship test page trong install package.

#### SEC-12 (High) — Umbraco trả DB connection string (kèm password) cho user chỉ có quyền Browse
- **Bằng chứng:** `MegaForm.Umbraco/Controllers/MegaFormApiController.ModuleConfig.cs:39-45` — `GetDatabaseSettings` trả `connectionString` không mask, fallback về `cfg.GetConnectionString("DefaultConnection")` — connection string của chính CMS. Gate chỉ `[MegaFormAuthorize(BrowseLetter)]`. Twin Oqtane mask: `MegaForm.Oqtane.Server/Controllers/MegaFormController.ModuleConfigDatabase.cs:81,133` (`MaskSecretsForUi`).
- **Khai thác:** backoffice user chỉ có Browse (editor, translator) exfil credential SQL Server/Postgres/MySQL của toàn bộ CMS → kết nối trực tiếp, đọc/sửa mọi thứ.
- **Hướng sửa:** port `MaskSecretsForUi` sang Umbraco (mask `Password=`/`Pwd=`), và/hoặc yêu cầu Edit permission.

#### SEC-13 (High) — Oracle test PayPal credentials ẩn danh trên MegaForm.Web
- **Bằng chứng:** `MegaForm.Web/Controllers/PaymentController.cs:312-362` — `paypal/test-credentials` không `[Authorize]`, gọi `ResolvePayPalConfig(body, allowBodyOverrides: true)`; trả kết quả valid/invalid + `debug_id` + `clientSecretLength`. Twin Umbraco gate đúng (`MegaForm.Umbraco/Controllers/PaymentController.cs:249`), Oqtane yêu cầu admin (`MegaForm.Oqtane.Server/Controllers/PaymentController.cs:111-117`).
- **Khai thác:** attacker dùng server nạn nhân làm oracle validate PayPal credential lấy cắp (traffic xuất phát từ IP merchant), hoặc probe credential live đã lưu của merchant — trinh sát trước fraud.
- **Hướng sửa:** require admin auth (parity Umbraco/Oqtane), bỏ `clientSecretLength`, rate-limit.

#### SEC-14 (High) — Payment controllers Web & Umbraco là bản duplicate cũ, thiếu hardening của Core
- **Bằng chứng:** `MegaForm.Web/Controllers/PaymentController.cs` và `MegaForm.Umbraco/Controllers/PaymentController.cs` re-implement checkout thay vì dùng `MegaForm.Core/Payments/PaymentEndpointService.cs`. Hệ quả:
  - Không rate-limit trên anonymous `create-intent`/`create-order` (Core có `PaymentRateLimiter`, :69) → card-testing.
  - Không idempotency key cho Stripe (Core gửi, :94-95).
  - Không xử lý zero-decimal currency — `(int)Math.Round(amount * 100)` tính VND/JPY ×100 (Core đã fix bằng `PaymentCurrency.ToStripeMinorUnits`).
  - `ResolveServerAmount` fail-open: tin client amount khi lookup form throw / không tìm thấy field / legacy widget (`MegaForm.Web/Controllers/PaymentController.cs:97-125`) — Core fail-closed (`PaymentEndpointService.cs:356-357`).
  - Metadata mismatch: controllers chỉ stamp `metadata[fieldKey]`, không `formId`/`custom_id`, trong khi `PaymentSubmissionVerifier` (đã đăng ký ở `MegaForm.Umbraco/Composers/MegaFormPaymentComposer.cs:29` và `MegaForm.Web/Program.cs:113`) **yêu cầu** metadata khớp (`PaymentSubmissionVerifier.cs:272-278`) → mọi paid submission trên Web/Umbraco sẽ fail closed — payment trên 2 platform này hoặc đang hỏng hoặc chưa test.
  - Không có webhook endpoint (chỉ Oqtane/DNN có) → refund/dispute không được ghi nhận.
- **Hướng sửa:** xóa 2 controller duplicate, route tất cả platform qua `PaymentEndpointService` + `PaymentWebhookService` (như Oqtane). Lưu ý bổ sung: trên Umbraco `ResolveServerAmount` cũng trả `clientAmount` nguyên xi khi `amountMode` = `field`/`listenTotals` (`MegaForm.Umbraco/Controllers/PaymentController.cs:52-91`) — an ninh lúc đó phụ thuộc hoàn toàn vào submit-time verifier; tuyệt đối không tin client amount.

### 2.3 MEDIUM

| ID | Finding | Bằng chứng | Tóm tắt |
|---|---|---|---|
| SEC-15 | Builder page anonymous leak toàn bộ SchemaJson (kể cả draft) | `MegaFormAdminController.cs:42-52` + `Views/MegaFormAdmin/Builder.cshtml:35` | `/umbraco/MegaForm/Builder/{id}` trả schema JSON của form chưa publish, bypass gate `Published` của public `Schema` (`MegaFormApiController.cs:554-569`). Sửa: bỏ server-embed, builder bundle tự fetch bằng bearer như Dashboard. |
| SEC-16 | Sanitizer blacklist `sanitizeRichHtml` bypass được | `MegaForm.UI/src/submission-views/display.ts:119-134` | Bypass qua `href="java&#9;script:..."`, `formaction`, `data:text/html`, `<form>/<svg>/<math>`; double-parse mXSS. Đã có whitelist sanitizer tốt tại `my-inbox/ui.ts:98-162` — dùng nó thay thế (hoặc DOMPurify). |
| SEC-17 | SSRF guard bypass qua HTTP redirect trong workflow webhook | `MegaForm.Core/Workflow/WebhookNodeExecutor.cs:25` (HttpClient mặc định follow redirect) vs check `SsrfGuard.IsUrlAllowed` chỉ ở URL đầu (:125) | URL attacker pass check rồi 302 → `http://169.254.169.254/...`; response lưu vào workflow variable → exfil metadata/intranet. Sửa: `AllowAutoRedirect = false` hoặc re-validate từng redirect. |
| SEC-18 | Razor-subset interpreter không HTML-encode output + endpoint Render anonymous | `MegaForm.Core/Templating/MegaFormRazorInterpreter.cs:623-626` (`Out.Append(v)`) + `UserTemplateController.cs:277-330` `[AllowAnonymous]` | Template interpolate submission data (`<div>@Name</div>`) render raw → stored XSS cho viewer; anonymous Render còn là gadget reflected XSS + DoS compile Razor. Sửa: encode mặc định (opt-out kiểu `@Html.Raw`), gate endpoint bằng backoffice policy. |
| SEC-19 | SVG trong image upload → stored XSS same-origin | `MegaFormApiController.UploadAndSdk.cs:27-30,53-95` | User có `TemplatesLetter` upload SVG chứa `<script>`; admin mở URL ảnh → script chạy trong site origin → đọc `localStorage` token. Không validate nội dung file (`FileUploadSecurityService.ValidateContentByExtension` tồn tại nhưng không được gọi). Sửa: bỏ `.svg` khỏi allowlist hoặc sanitize; serve với `nosniff`/`Content-Disposition: attachment`. |
| SEC-20 | CSRF: Umbraco mutating endpoints nhận cookie auth nhưng antiforgery bị tắt | `MegaFormComposer.cs:94-110` (policy nhận cả cookie + bearer); `[IgnoreAntiforgeryToken]` trên `AiToolsController.cs:24`, `AiKnowledge*.cs`, `AiAssistantController.cs:20,90`, `MegaFormLocalAiController.cs:24`; **0** `[ValidateAntiForgeryToken]` trong toàn `MegaForm.Umbraco` | Bearer path miễn dịch CSRF, cookie path thì không: cross-site page có thể drive claim/approve workflow (`WorkflowController.cs:176+`), grant permission, ApplyDdl bằng cookie nạn nhân. Oqtane có cùng mùi ở `MegaFormLocalAiController.cs:32`. DNN có ~50 `[ValidateAntiForgeryToken]`. Sửa: API bearer-only (bỏ cookie khỏi policy — TS UI đã inject token) hoặc auto-antiforgery cho cookie requests. |
| SEC-21 | CORS `AllowCredentials` phủ cả admin API path | `MegaFormCorsStartupFilter.cs:23-27` áp policy cho `/umbraco/MegaForm/*`; `MegaFormUmbracoCorsExtensions.cs:40-43` — khi config origins: `AllowCredentials()` | Origin trong allowlist (vốn định cho public embed) có thể gọi admin API kèm credential và đọc response — compound với SEC-20. Sửa: tách policy — public embed/script/submit không credentials; admin API không CORS. CORS mặc định `AllowAnyOrigin()` (khi chưa config) cũng nên fail-closed ngoài public routes. |
| SEC-22 | Oqtane: explicit `siteId`/`portalId`/`moduleId` override tenant authenticated | `MegaFormController.Reports.cs:51-54,83-92`; `MegaFormController.WorkflowStarter.cs:472,503,534,565,596,628` | Admin site A đọc reports site B bằng `?siteId=B`; không re-check membership. DNN có `ResolveTargetPortalId()` giới hạn cross-portal (`MegaForm.DNN/WebApi/MegaFormApiController.cs:629-649`). Sửa: theo pattern DNN. |
| SEC-23 | Trả `ex.Message` (kể cả SQL error) cho client, tệ nhất ở Umbraco | `SubformController.cs:278` (`"SQL error: " + ex.Message`); `WorkflowController.cs` 12 actions (:76,156,172,...); `UserTemplateController.cs:125-328`; payment controllers Web/Umbraco (`"Internal error: " + ex.Message`) | Fuzzing ApplyDdl/workflow nhận raw SQL error (tên bảng/cột/constraint, đường dẫn) → tăng tốc SEC-02/03. Sửa: message generic + log server-side (`ILogger` đã inject sẵn). |
| SEC-24 | Secrets at rest plaintext trong `MF_ModuleSettings` | `MegaFormApiController.ModuleConfig.cs:143,150,262,396`; store `MegaForm.Core/Payments/ModuleSettingsPaymentGatewayStore.cs:25-41`; grep không có `Aes`/`IDataProtector` trong Core | Stripe secret, PayPal secret, SMTP password, OpenAI key, Google service-account JSON (`private_key`), connection string — đều plaintext. Một SQLi/backup leak/SEC-12 lộ toàn bộ keyring. `DataJson` (PII) cũng không mã hóa. Sửa: ASP.NET Core Data Protection/KMS; cân nhắc field-level encryption cho field PII. |
| SEC-25 | Demo JWT keys + admin password mặc định trong Samples | `Samples/AspNetCoreHost/appsettings.json:9`; `Samples/CorporateWeb/appsettings.json:10`; `Samples/CorporateWeb/SetupCompletionService.cs:110` (`"admin123"`) | Samples được copy làm template; key đã public → forge admin token; `admin123` → takeover tức thì. Sửa: generate random lúc first-run (đã có `SetupController.GenerateJwtKey()`, `MegaForm.Web/Controllers/SetupController.cs:390-395`), refuse start với demo values ngoài Development. |
| SEC-26 | State-changing GET endpoints | `ReportsController.cs:246` (`Backfill` qua `[HttpGet]`); `Submissions/Export` | GET ghi typed rows — trigger được bằng prefetch/crawler/CSRF `<img>` (cookie scheme trong policy, không antiforgery). Sửa: mutation = POST-only. |
| SEC-27 | Print endpoints anonymous không gate status; QR proxy URL tùy ý | `PrintController.cs:32-48` (không check `Published`), :50-62 (leak print config của draft), :89-98 (`GetQrCode` redirect kèm URL caller-supplied tới `api.qrserver.com`) | Leak cấu hình form draft; QR endpoint có thể bị lợi dụng làm link laundering `yourhost/.../print/qr?url=...` và leak URL nội bộ cho bên thứ ba. Sửa: mirror check `Published` của `Schema`; allowlist/drop param `url`. |
| SEC-28 | DNN `PreviewSql`: connection key không allow-list; guard lọt `SELECT INTO` | `MegaForm.Core/Services/DataRepeaterService.cs:396-431`; `MegaForm.DNN/WebApi/AiToolsController.cs:223` (truyền thẳng `req.ConnectionKey`); guard `IsDangerousQuery` (:928-935) không chặn `INTO`/stacked `SELECT;SELECT` | Designer-level user đọc bất kỳ connection nào đã config. Sửa: allowlist connection key (như `OpenAiConnection` đã làm), reject `;` và `INTO`. |
| SEC-29 | Không có clickjacking protection trên admin shell pages | grep `X-Frame-Options|Content-Security-Policy|frame-ancestors` trong `MegaForm.Umbraco` (.cs): 0 kết quả | Admin host pages `[AllowAnonymous]` bootstrap `__MF_TOKEN` có thể bị frame bởi origin bất kỳ → clickjacking thao tác admin. Public `/embed` cần framing là hợp lệ. Sửa: `frame-ancestors 'self'` cho `/umbraco/MegaForm/*` host pages. |
| SEC-30 | CDN stylesheet không SRI trên public page | `MegaForm.Umbraco/Views/Form/Public.cshtml:16-17` (fonts.googleapis.com + cdnjs font-awesome 6.5.0, không `integrity`) | CDN/edge poisoning → inject CSS trên mọi form nhúng tại site khách hàng. Sửa: self-host từ `Assets/lib/fontawesome` (đã có trong repo) hoặc thêm SRI + `crossorigin`. |
| SEC-31 | Anonymous payment endpoints tin client amount ở mode `field`/`listenTotals` + verifier chưa đăng ký trên Umbraco | `MegaForm.Umbraco/Controllers/PaymentController.cs:52-91,118,301,396`; grep `PaymentSubmissionVerifier` trong `MegaForm.Umbraco` (ngoài composer payment) không thấy wiring hoàn chỉnh | Form $1000 với calculated-total widget → client tạo intent $0.01; an ninh chỉ còn submit-time verification. Sửa: đảm bảo verifier đăng ký đúng, giữ fail-closed, không bao giờ tin client amount. |

### 2.4 LOW

| ID | Finding | Bằng chứng / ghi chú |
|---|---|---|
| SEC-32 | CORS mặc định allow-any-origin cho mọi MegaForm path khi chưa config | `MegaFormUmbracoCorsExtensions.cs:36-45`, `MegaFormCorsStartupFilter.cs:19-27`. Không `AllowCredentials` nên chưa khai thác trực tiếp; nên deny mặc định ngoài public embed routes. |
| SEC-33 | `seed-test-form` anonymous dưới `#if DEBUG` | `MegaFormApiController.cs:736-774`. Đảm bảo production build Release; cân nhắc xóa hẳn. |
| SEC-34 | Submission read/update không scope theo form | `GetSubmission`/`UpdateSubmissionStatus` (`MegaFormApiController.cs:534-549`), `BulkDelete`/`UpdateData` (`SubmissionExtras.cs:22-44`) chỉ nhận `submissionId` → đòi global letter; per-form delegation không hoạt động. Document hoặc resolve form rồi check granular. |
| SEC-35 | `window.__MF_TOKEN` global + token full-scope trong localStorage | `umbraco-host/index.ts:27,48-53`. Khuếch đại mọi XSS (xem SEC-01/19). Giữ token trong closure hoặc exchange sang MegaForm-scoped short-lived token. |
| SEC-36 | `FormController.View` chấp nhận mọi status ≠ `draft` | `FormController.cs:40-41` — lệch với `Schema` (đòi đúng `Published`), ví dụ `Archived`. |
| SEC-37 | Member/backoffice userId collision | `PlatformServices.cs:67-75` parse `sub`/NameIdentifier từ identity bất kỳ; `isOwner` (`UploadAndSdk.cs:207`) so với submitter id có thể là member id → collision lý thuyết. Nên namespace. |
| SEC-38 | `LocalCliChat` spawn CLI process cho mọi backoffice user khi `MEGAFORM_ALLOW_LOCAL_CLI=1` | `AiAssistantController.cs:88-160`. Arg handling tốt (`ArgumentList`, `--disallowedTools *`), nhưng là cost/abuse surface cho editor. |
| SEC-39 | postMessage listeners không validate origin | `theme-designer/index.ts:349-359` (`td-h` resize), `builder/theme-left-rail.ts:227-233` (`mf-theme-inspect-pick`). Ngược lại `renderer/index.ts:3965-3966` và `embed-iframe.ts:212` validate đúng — copy pattern đó. |
| SEC-40 | Embed iframe không `sandbox` | `dashboard/embed-modal.ts:152`, `embed/embed-iframe.ts:259`. Nên `sandbox="allow-scripts allow-forms allow-same-origin"`. |
| SEC-41 | TLS cert validation bị tắt trong warmup hosted services | `MegaForm.Umbraco/HostedServices/MegaFormWarmupHostedService.cs:73`, `MegaForm.Web/HostedServices/MegaFormWarmupHostedService.cs:74`. Chỉ target loopback nên impact thấp; giới hạn bypass cho loopback hoặc dùng HTTP loopback. |
| SEC-42 | Masking secrets yếu | `PaymentController.cs:566` (Umbraco) trả nguyên giá trị ≤12 ký tự; `ModuleConfig.cs:103` lộ 8 ký tự đầu của Stripe/PayPal secret. Chỉ nên trả `saved: true` hoặc last-4. |
| SEC-43 | DNN `FormController.List(portalId)` dùng trực tiếp query param | `MegaForm.DNN/WebApi/MegaFormApiController.cs:714-717` — bypass `ResolveTargetPortalId()` (class-level Administrators nên impact giới hạn cross-portal). |
| SEC-44 | Umbraco Host: OpenIddict `DisableTransportSecurityRequirement = true`, không HSTS/HTTPS redirect/security headers | `MegaForm.Umbraco.Host/Program.cs:8,28-38`. Gate theo `IsDevelopment()`, thêm HSTS + security-headers middleware. |

---

## 3. Phát hiện Performance

### 3.1 CRITICAL

#### PERF-01 (Critical) — Oqtane submissions list: N+1 typed-store, tới ~8 query × page size
- **Bằng chứng:** `MegaForm.Core/Services/SubmissionQueryService.cs:205-236` — `ToListItem` gọi `_dataResolver.GetData(...)` cho **mỗi dòng**. Trên Oqtane `SupportsDataJsonCollapse => true` (`MegaForm.Oqtane.Server/Data/EfSubmissionDataStore.cs:31`), nên `SubmissionDataResolver.GetData` (`MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs:30-54`) phát `HasFields` (1 query) + `GetData` (7 query, mỗi typed table một query, mỗi cái trên `DbContext` mới — `EfSubmissionDataStore.cs:48-94`). Callers: submissions list `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2136` (anonymous-reachable qua public `queryKey`, page 250; admin tới 5.000 qua `TrustedFetch`), export `:2653` (`PageSize = 10000`).
- **Root cause:** resolver thiết kế cho single-submission detail; `ToListItem` tái sử dụng nó trong per-row mapping loop, `ISubmissionDataStore` không có batch API.
- **Impact:** page 250 dòng ≈ 2.000 query + 250 DbContext allocations; export 5.000 dòng ≈ 40.000 query — tự DoS database ở volume thật, và endpoint public-reachable nên là attack amplifier.
- **Hướng sửa:** thêm batch method `GetDataForSubmissions(IReadOnlyCollection<int> ids)` (mỗi typed table fetch 1 lần `WHERE SubmissionId IN (...)`); tốt hơn nữa, list view không resolve per-row data — summary nên đến từ snapshot column/SQL projection.

#### PERF-02 (Critical) — Umbraco `Reports/FormsOverview` legacy load toàn bộ submissions (kèm `DataJson`) mỗi form mỗi request
- **Bằng chứng:** `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:442-473` — `foreach (var form in forms) { var all = _subRepo.List(form.FormId, pageSize: int.MaxValue); ... }`, bucket theo ngày trong RAM. `UmbracoSubmissionRepository.List` (`MegaForm.Umbraco/Data/EfRepositories.cs:102-117`) select full entity kể cả `nvarchar(max)` `DataJson`.
- **Root cause:** endpoint duplicate cũ chưa bị retire; bản đúng (SQL `GroupBy`) đã tồn tại ở `MegaForm.Umbraco/Controllers/ReportsController.cs:85-99`.
- **Impact:** site 50k-100k submissions → load hết vào RAM trong 1 dashboard call: allocation hàng trăm MB, timeout/OOM. First call sau deploy là production incident.
- **Hướng sửa:** xóa hoặc redirect action này sang `ReportsController.FormsOverview`.

### 3.2 HIGH

#### PERF-03 (High) — Workflow inbox: filter authorization in-memory trên task dump không index + clamp 500/250 lệch nhau
- **Bằng chứng:** `MegaForm.Core/Services/WorkflowTaskService.cs:66-91` (`GetInbox`), `:107-135` (`GetWorkboard`) xin `PageSize = 500` open tasks rồi filter `IsAssignedToActor`/`CanActorClaim` **trong RAM**. `UmbracoWorkflowRepository.ListTasks` (`MegaForm.Umbraco/Data/UmbracoWorkflowRepository.cs:205-218`) âm thầm clamp `Math.Min(PageSize, 250)` — service tưởng nhận 500. `MF_WorkflowTasks` **không có index nào** (`MegaForm.Umbraco/Data/MegaFormDbContext.cs:332-347`).
- **Impact:** vừa sai vừa chậm — quá 250 open tasks, task biến mất khỏi inbox (correctness bug); mỗi inbox poll full-scan bảng workflow per user per refresh.
- **Hướng sửa:** đẩy actor filter xuống SQL (`AssignedUserId == me OR (Status == Pending AND unassigned)`), candidate-role JSON giữ làm second pass trên tập nhỏ; thêm index `(Status, AssignedUserId)`, `(FormId, Status)`; thống nhất clamp.

#### PERF-04 (High) — Thiếu index trên workflow/rate-limit/audit tables; bảng tăng trưởng vô hạn
- **Bằng chứng:** model `MegaForm.Umbraco/Data/MegaFormDbContext.cs` — `WorkflowCases` (query theo `ExecutionId`, `UmbracoWorkflowRepository.cs:159-163`), `WorkflowTaskActions` (theo `TaskId`, :279-301), `WorkflowExecutions` (:121-128) không `HasIndex`. `MF_RateLimits` (:286-289) insert mỗi public submit và query theo `IpAddress + CreatedUtc` (`UmbracoRepositories.cs:218-228`) — không index, **không cleanup job**. Tương tự `MF_WebhookLog`, `MF_AuditLog` (không retention).
- **Impact:** mỗi public submit trả một rate-limit check thoái hóa thành full-scan khi bảng lớn dần; vài tháng traffic → submit latency xấu vĩnh viễn.
- **Hướng sửa:** index theo predicate thật; hosted service purge RateLimits/WebhookLog/AuditLog; mirror index vào DDL migration DNN/Oqtane, không chỉ EF model.

#### PERF-05 (High) — Umbraco admin submissions list: không clamp page size, ship full `DataJson` mỗi dòng
- **Bằng chứng:** `MegaFormApiController.cs:423-430` gọi `_subRepo.List` trực tiếp; `UmbracoSubmissionRepository.List` (`EfRepositories.cs:102-117`) không cap `pageSize` (bypass clamp 250/5000 của `SubmissionQueryService.List`). Response trả raw entity kèm `DataJson`. `ToListItem` (`SubmissionQueryService.cs:234`) cũng copy full `DataJson` vào list DTO trên mọi platform.
- **Impact:** `?pageSize=100000` trả 100k JSON blob trong 1 response; page 50 dòng thường cũng ship toàn bộ payload mỗi dòng trong khi chỉ hiển thị summary.
- **Hướng sửa:** clamp trong repository; project list query loại `DataJson`; bỏ `DataJson` khỏi list DTO (load ở detail).

#### PERF-06 (High) — Blog analytics rollup: whole-table load + per-row typed-store N+1 trên timer 5 phút
- **Bằng chứng:** `MegaForm.Core/Services/Blog/BlogAnalyticsRollupService.cs:42-58` load tới 10.000 reader events + 10.000 posts (full `DataJson`), mỗi event gọi `_dataResolver.GetData` → fan-out ~8 query như PERF-01; mỗi post một `UpdateData` (SaveChanges riêng); :58 `JObject.Parse(JsonConvert.SerializeObject(dict))` mỗi event. Driver: `MegaForm.Umbraco/HostedServices/MegaFormBlogScheduledHostedService.cs:30,46-47` — `Timer` trần, không overlap guard, `.GetAwaiter().GetResult()`.
- **Impact:** blog bận: ~80k+ query mỗi 5 phút trên thread-pool bị block, timer callback chồng nhau khi cycle vượt period; mất dữ liệu lặng lẽ khi >10k events (hard `pageSize: 10000`).
- **Hướng sửa:** aggregate trong SQL (group by `post_uid`/`event_type` trên typed value tables), paging, upsert 1 transaction; hosted service viết lại bằng `PeriodicTimer` + overlap guard + `await`.

#### PERF-07 (High) — Subform auto-link quét tới 2.000 parent submissions và JSON-parse từng dòng, inline trong submit path
- **Bằng chứng:** `MegaForm.Core/Services/SubmissionProcessor.cs:619-652` — `ResolveParentSubmissionId` với parent key ≠ `SubmissionId` làm `_subRepo.List(relation.ParentFormId, pageIndex: 0, pageSize: 2000)` rồi `JsonConvert.DeserializeObject<Dictionary<string,object>>(parent.DataJson)` từng dòng đến khi match. Chạy đồng bộ trong user-facing submit.
- **Impact:** form dùng relation auto-link trả tới 2.000 full-row reads + 2.000 JSON deserializations mỗi submission; latency tăng tuyến tính theo số parent submissions; amplifier trên public forms.
- **Hướng sửa:** resolve qua `MF_SubmissionValues` (`FieldKey = @parentKey AND ValueText = @value`) hoặc typed string-value table — cả hai đã có index `(FormId, FieldKey)`.

### 3.3 MEDIUM

| ID | Finding | Bằng chứng | Ghi chú / hướng sửa |
|---|---|---|---|
| PERF-08 | Report backfill materialize toàn bộ submissions của form trong 1 HTTP request | `ReportsController.cs:246-271`; `SubmissionIndexerService.cs:68-87` (mỗi submission một connection + transaction) | Form lớn → timeout/memory spike. Batch skip/take, 1 transaction/batch, hoặc chạy background job. |
| PERF-09 | Export truncate lặng lẽ ở 10.000 dòng và buffer toàn bộ | `MegaFormApiController.SubmissionExtras.cs:49-112` — `pageSize: 10000` hard-coded; CSV/JSON build trong `StringBuilder` rồi `GetBytes` (3 bản copy trong RAM) | Stream thẳng ra `Response.Body`, paging, báo truncation rõ ràng. |
| PERF-10 | Search `DataJson` = `LIKE '%…%'` trên `nvarchar(max)`, non-sargable | `EfRepositories.cs:111` (`s.DataJson.Contains(search)`); Oqtane thêm `OR EXISTS ... DisplayValue.Contains` (`MegaForm.Oqtane.Server/Data/EfRepositories.cs:187-190`) | Mọi list query có search full-scan cột lớn nhất DB. Search trên `MF_SubmissionValues`/typed value tables (đã index), prefix search, hoặc full-text index. |
| PERF-11 | Submit path = 5+ transactions riêng + load form 2 lần | `SubmissionProcessor.cs:343` (Insert), :360 (InsertValues), :396 (`ReplaceFields` — scope mới, 3 SaveChanges, `EfSubmissionDataStore.cs:153-216`), :408 (collapse `UpdateData`); controller load form (`MegaFormApiController.cs:509`) rồi `ProcessAsync` load lại (:128) | Một unit of work cho submit writes; truyền `FormInfo` đã load vào processor; giảm partial-write window. |
| PERF-12 | SMTP + webhook chạy inline trong submit request | `SubmissionProcessor.cs:485-511`; `EmailNotificationService.cs:82-113`; `WebhookService.cs:19,88` (static HttpClient timeout 30s) | SMTP/webhook chậm thêm vài giây vào submit latency và giữ request thread. Enqueue sang bounded background channel + retry. |
| PERF-13 | Lang file đọc lại mỗi request (localization provider scoped) | `MegaFormComposer.cs:208` (scoped); `UmbracoLocalizationProvider.cs:27-34,74-126` — tới 4 file reads + probes + JSON parse mỗi request | Singleton cache theo locale, invalidate bằng `IFileProvider.Watch` cho user-override. |
| PERF-14 | Schema re-parse mỗi render/submit; không form-level cache | `FormController.BuildViewModel` (`FormController.cs:139-163`); `RenderModelResolver.cs:52` (`DeserializeObject` mỗi call, memoized cache chỉ cover canonical string :95-125); `GetRequestLocale` (`FormController.cs:166-191`) parse lần nữa bằng `JObject.Parse` | Schema ~165KB (comment tại `RenderModelResolver.cs:96-99`). Cache parsed `FormSchema` theo `(formId, UpdatedOnUtc)`; derive locale từ model đã resolve. |
| PERF-15 | Sync-over-async trong hosted service + admin endpoints | `MegaFormBlogScheduledHostedService.cs:46-47`; `WorkflowController.cs:497,514,523` (~30 `Task.Run(...).GetAwaiter().GetResult()` trong 1 seed request); ~20 sites trong `MegaForm.Core/Services/Starters/*.cs` | Hosted service → `async` end-to-end; controller action → `async Task<IActionResult>`. |
| PERF-16 | UniqueId counter read-modify-write không atomic | `UmbracoRepositories.cs:189-203` — `FirstOrDefault` → `Counter++` → `SaveChanges` mỗi submit mỗi UniqueId field | Concurrent submits → duplicate "unique" ID (correctness) + round trip dư. Atomic `UPDATE ... SET Counter = Counter + 1 OUTPUT INSERTED.Counter` hoặc sequence/upsert. |

### 3.4 LOW

| ID | Finding | Bằng chứng / ghi chú |
|---|---|---|
| PERF-17 | Cả hai FormsOverview endpoint Umbraco hỏng vì paging defaults (correctness) | `ReportsController.cs:77` truyền `pageSize: 0` → `.Take(0)` → luôn rỗng (`EfRepositories.cs:21-32`); legacy `MegaFormApiController.cs:444` chỉ cover 20 form đầu. Coi `pageSize <= 0` là "all". |
| PERF-18 | `SubmissionIndexerService` dispose connection chung của scoped DbContext | factory `() => db.Database.GetDbConnection()` (`MegaFormComposer.cs:177-181`) + `using` (`SubmissionIndexerService.cs:68-71`) → EF phải reopen cho các op sau trong cùng scope. Factory nên mở connection độc lập. |
| PERF-19 | `SanitiseRichTextHtml`: 9 static `Regex.Replace` không compiled mỗi RichText field mỗi submit | `SubmissionProcessor.cs:701-714` — phụ thuộc shared regex cache 15 entries, eviction → recompile churn trên hot path. `static readonly Regex` + `RegexOptions.Compiled`. |
| PERF-20 | `BuildOpenWorkflowTaskLookup` load mọi open task của form mỗi submissions-list page | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:3870-3894` (`PageSize = 5000`). Filter `SubmissionId IN (page ids)` trong SQL. |
| PERF-21 | `MegaFormTablesExist` chạy `SELECT name FROM sqlite_master` cho mọi provider | `UmbracoDatabaseSchemaBootstrapper.cs:125-132` — throw trên SQL Server/PostgreSQL/MySQL → migrations hỏng ngoài SQLite (correctness find khi audit migrations). |
| PERF-22 | `WorkflowTaskService.SendToRecipientsAsync` wrap mỗi email send trong `Task.Run` | `WorkflowTaskService.cs:861-880` — thread-pool hop thừa cho I/O đã async; gọi `_emailSender.SendAsync` trực tiếp. |
| PERF-23 (frontend) | "All Forms" view: tới 50 call song song `getSubmissions(pageSize: 500)`, merge/sort ~25k dòng trong browser | `SubmissionsShell.ts:1933-1952`; report dialog fetch `pageSize=2000` một phát (:1732). Cần aggregate endpoint server-side (pattern `source=sql` đã chứng minh). |
| PERF-24 (frontend) | Polling interval vĩnh viễn không backoff | `shared/platform-host.ts:894` (`setInterval(notifyHeight, 500)`), `Assets/embed.html:36` (200ms), `builder/db-tables-panel.ts:268` (1.2s). Height polling nên dùng `ResizeObserver`. |

---

## 4. So sánh tư thế phòng thủ giữa các platform

| Khía cạnh | DNN (reference) | Oqtane | Umbraco (port mới nhất) | Web |
|---|---|---|---|---|
| Admin gating | `[DnnAuthorize(StaticRoles="Administrators")]` + re-check trong action | `[Authorize(Policy=Edit/ViewModule)]` + `CanUseAdminPopup()` | **Lẫn lộn:** `MegaFormAuthorize` letters tốt trên `MegaFormApiController`, nhưng `MegaFormBackOffice` = *mọi backoffice user* trên ~12 controller, `IsAdmin = IsAuthenticated` ở Subform | `[Authorize]` + admin check riêng |
| CSRF | `[ValidateAntiForgeryToken]` khắp nơi (~50 sites) | Bearer mặc định; 1 controller cookie-auth có `[IgnoreAntiforgeryToken]` | **Cookie+bearer đều nhận, antiforgery bị tắt có chủ đích** | Cookie + antiforgery |
| Tenant isolation | `ResolveTargetPortalId()` giới hạn cross-portal (1 lỗi: SEC-43) | `AuthEntityId` — nhưng explicit param override không re-check (SEC-22) | Single-site (PortalId −1) | Single tenant |
| Anonymous admin pages | Không (module controls) | Không | **Shell pages `[AllowAnonymous]`; Builder leak schema (SEC-15)** | Không |
| CAPTCHA submit | Verify server-side | Verify server-side | **Không verify (SEC-08)** | Verify server-side |
| Rate limit submit | Có | Có | **Bảng có nhưng không ai gọi (SEC-08)** | Có |
| Payment | Dùng Core hardening | Dùng `PaymentEndpointService` + webhook | **Duplicate controller thiếu hardening (SEC-14)** | **Duplicate controller thiếu hardening (SEC-14)** |
| CORS | Echo origin, không credentials, header giới hạn | Framework | Credentials + phủ cả admin path (SEC-21) | — |
| Error disclosure | Một số `ex.Message` | Một số | **Pervasive, kể cả raw SQL error (SEC-23)** | Một số |
| Transport/headers | Kế thừa DNN/IIS | Kế thừa Oqtane | Không HSTS/redirect/headers; OpenIddict TLS check tắt (SEC-44) | Swagger dev-only (tốt) |

**Kết luận:** DNN là tư thế chuẩn; Oqtane gần tương đương trừ 2 lỗi tenant-override; bản port Umbraco thoái lui trên **chính API surface đó** theo 4 hướng cụ thể (SEC-02/03 gating, SEC-06 IDOR, SEC-15 schema leak, SEC-20+21 CSRF/CORS) — việc nới auth cho admin host pages không chỉ expose shell mà còn đi kèm in-controller gates yếu hơn các twin nó mirror.

---

## 5. Những điểm làm tốt (cần giữ nguyên khi sửa lỗi)

**Security:**
- `MegaFormAuthorizeAttribute` (`MegaForm.Umbraco/Permissions/MegaFormAuthorizeAttribute.cs`): implement `IAuthorizeData` để bearer-only policy `MegaFormApi` chạy trước (401 challenge, không cookie redirect), fail-closed 403 khi exception; section-access check trước tiên (`MegaFormPermissionService.cs:42-48`); entity key per-form deterministic qua `GuidUtility`; assignable-letter allowlist + in-code per-form `ManagePermissions` check (`MegaFormPermissionController.cs:31-39,93-96`).
- Workflow Core authorization (`MegaForm.Core/Services/WorkflowTaskService.cs:390-425,639-681`): claim/approve/reject/forward đều re-verify `CanActorClaim`/`CanActorWork` server-side; actor identity build từ claims + DB roles (`WorkflowController.cs:566-616`), không bao giờ từ request input. Anonymous approval là không thể.
- `PaymentSubmissionVerifier` (`MegaForm.Core/Payments/PaymentSubmissionVerifier.cs`): verify "paid" claim phía gateway mỗi submission, chống replay cross-form qua metadata, duplicate-transaction check bền vững, re-check giá server-side, fail-closed mọi trường hợp mơ hồ, giá trị lưu là số gateway-confirmed — client amount không bao giờ chạm `DataJson`.
- `PaymentWebhookService`: Stripe HMAC-SHA256 constant-time + 10 phút replay tolerance; PayPal `verify-webhook-signature` server-to-server; event không verify được bị reject.
- `SsrfGuard` cho webhook URL đầu: scheme check, literal-IP + DNS resolution all-addresses-must-pass, cover CGNAT/metadata/ULA, fail-closed (chỉ khuyết redirect — SEC-17).
- SQL: parameterization nhất quán; identifier whitelist chặt (`IsSafeIdent` `SqlRelationalSchemaReader.cs:73-79`, `^\w+$` ở DNN); `ExternalTableQueryService` build SQL chỉ từ server-side `CapabilityProfile`; `SqlDdlGuard` single-statement + keyword blocklist; `ApplyDdl` CREATE-TABLE-only.
- Upload: private store ngoài webroot (`App_Data`), GUID filename, extension allowlist + size cap, containment check `GetFullPath` + root-prefix đúng chuẩn (`UploadAndSdk.cs:222-238`, `PlatformServices.cs:371-445`).
- XML: `DtdProcessing.Prohibit`, `XmlResolver = null`. Không tìm thấy `TypeNameHandling`/`BinaryFormatter`/`JavaScriptSerializer` nào. `EvaluateRules` dùng expression interpreter an toàn.
- Password hashing (Web): PBKDF2-SHA256 100k iterations + per-user salt + constant-time compare (`AdminAuthController.cs:106-117`). RNG bảo mật dùng `RandomNumberGenerator`/`Guid.NewGuid()`. JWT registration fail-closed khi thiếu key (`MegaForm.Web/Program.cs:169`).
- Whitelist sanitizer `my-inbox/ui.ts:98-162`: tag allowlist, drop SVG/MATH/FORM/INPUT, scheme-checked URL, `rel="noopener noreferrer"` — template đúng để sửa SEC-16.
- postMessage validation đúng ở `renderer/index.ts:3965` và `embed-iframe.ts:212`; DNN antiforgery interceptor check origin chặt (`megaform-admin-live.js:1`).
- Public surface: `Schema` đòi `Published`; draft 404 publicly; preview đòi backoffice policy; honeypot + spam heuristics; `EnforceSubmit` permission rules server-side (`SubmissionProcessor`).
- DNN anonymous public surface: mỗi `[AllowAnonymous]` action đều có in-body gate (Published check, `RequireAuth`, field-type whitelist, queryKey allowlist).
- LocalAI/Kimi CLI: opt-in env var + `ArgumentList` không shell (`MegaFormLocalAiController.cs:180-206`) — RCE surface đóng đúng.
- DNN SQL install scripts: không `GRANT`/`db_owner`/`xp_cmdshell`.

**Performance:**
- `AsNoTracking` nhất quán trên read paths Umbraco/Oqtane; list endpoints paging trong SQL.
- `SubmissionQueryService.List` clamp page size (250 public / 5000 trusted) và batch-resolve form titles theo distinct `FormId` (:79-94).
- `ResolveSchemaJson` canonicalization được memoize content-addressed, bounded cache (`RenderModelResolver.cs:95-125`).
- `MF_Submissions`, `MF_SubmissionValues` và cả 7 typed-submission tables có composite indexes hợp lý (`MegaFormDbContext.cs:106-188`) — gap index chỉ ở workflow/rate-limit/audit.
- `ReportsController.SubmissionData` dùng SQL-side projection + parameterized raw SQL (:189-244) — pattern nên copy cho search/export.
- `LegacySubmissionBackfillService` batch tốt + per-form schema caching (:40-98); typed-store writes transactional (`EfSubmissionDataStore.cs:153-166`).
- Frontend: per-page Vite bundles (dashboard/builder/submissions/languages tách entry) — strategy hợp lý; submissions grid server-paged; không sync XHR; không token trong URL.

---

## 6. Lộ trình khắc phục đề xuất

### P0 — Tuần này (rủi ro trực tiếp, sửa nhanh)
1. **SEC-01**: đổi 2 dòng `innerHTML` → `textContent` trong `SubmissionsShell.ts:1282-1284` + sweep file + regression test.
2. **SEC-02 / SEC-03**: thay `IsAdmin = IsAuthenticated` và thêm admin gating cho `AiToolsController` (mirror DNN 3-layer gate).
3. **SEC-04**: rotate JWT key, thay bằng env placeholder, purge git history.
4. **SEC-10**: whitelist locale trong `GetRequestLocale`.
5. **SEC-09**: sửa `isMegaFormApiUrl` thành origin + pathname prefix check (copy pattern DNN interceptor).
6. **PERF-02**: xóa/redirect legacy `FormsOverview` (1 dòng).
7. **SEC-12**: mask connection string trong `GetDatabaseSettings` (port `MaskSecretsForUi`).

### P1 — 2 tuần (structural)
8. **SEC-05**: siết policy `MegaFormBackOffice` (section-access + minimum permission) hoặc migrate controllers sang `MegaFormAuthorize`.
9. **SEC-06**: bỏ nhánh `?path=` hoặc enforce owner check.
10. **SEC-07**: per-form permission re-check trong action cho body-carried IDs.
11. **SEC-08**: wire CAPTCHA verification + `RateLimitChecker` trên Umbraco.
12. **SEC-20 / SEC-21**: API bearer-only hoặc auto-antiforgery; tách CORS policy public/admin.
13. **SEC-14**: converge payment về `PaymentEndpointService` + `PaymentWebhookService` cho Web/Umbraco (fix luôn zero-decimal, idempotency, metadata mismatch).
14. **SEC-13**: authorize Web `paypal/test-credentials`.
15. **PERF-01**: batch API cho `ISubmissionDataStore`; list view không resolve per-row data.
16. **PERF-03 / PERF-04**: SQL-side inbox filter + indexes workflow/rate-limit/audit + retention job.
17. **SEC-11**: xóa/sửa `embed.html?server=` (cả 2 bản).

### P2 — Tháng này (hardening + hygiene)
18. **SEC-16**: thống nhất về whitelist sanitizer (xóa bản blacklist).
19. **SEC-17**: tắt auto-redirect hoặc re-validate redirect trong webhook executor.
20. **SEC-18**: encode mặc định trong Razor interpreter + gate endpoint Render.
21. **SEC-19 / SEC-30**: bỏ SVG upload (hoặc sanitize + nosniff); SRI/self-host font.
22. **SEC-24**: mã hóa secrets at rest (Data Protection); xem xét field-level encryption cho PII.
23. **SEC-23**: sanitize error responses toàn cục (generic message + log server-side).
24. **PERF-05→PERF-16**: theo bảng ưu tiên — clamp/export stream/search sargable/submit unit-of-work/background email+webhook/localization singleton/schema cache.
25. **SEC-29 / SEC-44**: security headers middleware (frame-ancestors, nosniff, HSTS), gate `DisableTransportSecurityRequirement` theo môi trường.
26. **SEC-25**: samples tự generate key/password lúc first-run.

### Nguyên tắc khi sửa (rút ra từ audit)
- **Không phá các lớp phòng thủ đang tốt** liệt kê ở mục 5 — đặc biệt `PaymentSubmissionVerifier` fail-closed và `MegaFormAuthorize` design.
- **Twin-diff làm regression guard:** khi sửa một platform, đối chiếu 3 platform còn lại; mọi gate mới nên có ít nhất mức DNN.
- Mọi mutation endpoint: POST-only + bearer-only (hoặc antiforgery nếu cookie).
- Mọi secret: không prefix, không `ex.Message` ra client, không plaintext at rest.

---

## 7. Phụ lục — Cách đọc bằng chứng

- Mọi tham chiếu `path:line` là file trong working tree tại thởi điểm audit; line number có thể trôi sau khi sửa — dùng symbol name kèm theo để định vị lại.
- Severity xét theo chuỗi khai thác thực tế trong context MegaForm (public forms anonymous + backoffice token trong localStorage), không theo CVSS tuyệt đối: ví dụ SEC-19 (SVG) là Medium đứng một mình nhưng là mắt xích của chuỗi "Templates permission → admin token".
- Các mục "verified non-issue" đã được kiểm chứng trong code, không phải giả định: không có Stripe/Google private key thật trong source (scan `sk_live|sk_test|pk_live|whsec_|AIza|BEGIN PRIVATE KEY` chỉ trúng docs/comments); SHA1/MD5 hiện hữu đều non-security (UUIDv5, ViewState ID, Mailchimp-mandated hash); DNN install scripts sạch; `MegaForm.Umbraco.Host` appsettings + sqlite DB không git-tracked.

---

## 8. Remediation log — P0 (2026-07-21)

Toàn bộ 7 mục P0 đã được fix và verify (build `MegaForm.Umbraco` + `MegaForm.Umbraco.Host` Release: 0 errors; Vite build + sync bundles: 0 errors). Không git commit.

| Mục | Trạng thái | Thay đổi |
|---|---|---|
| SEC-01 Stored XSS Submissions grid | ✅ Fixed | `MegaForm.UI/src/submissions/SubmissionsShell.ts` — `innerHTML` → DOM `textContent` cho name/email; sweep ~50 innerHTML sites khác trong file: không còn chỗ nào nối submission data thô. Bundle `megaform-submissions.js` đã rebuild + sync sang Umbraco/Oqtane/Web/Assets. Regression test bỏ qua: `MegaForm.UI` không có test runner (chưa có vitest/jest — quyết định toolchain mới, không làm trong scope P0). |
| SEC-02 SubformController fake IsAdmin | ✅ Fixed | `MegaForm.Umbraco/Controllers/SubformController.cs` — thay `IsAdmin = IsAuthenticated` bằng `IPlatformContext.IsAdmin` (role claims + backoffice group resolution, fail-closed) trên cả 4 actions (`Tables`/`Columns`/`Rows`/`ApplyDdl`). |
| SEC-03 AiToolsController arbitrary SQL | ✅ Fixed | `MegaForm.Umbraco/Controllers/AiToolsController.cs` — `PreviewSql`/`ExecuteDdl` giờ trả 403 cho non-admin (`IPlatformContext.IsAdmin`). Các action metadata read-only (`SqlTables`, `SqlColumns`, `DryRunValidate`, `ProposeTableSchema`) vẫn mở cho backoffice user — cân nhắc siết tiếp ở P1 nếu xem schema disclosure là trong phạm vi. |
| SEC-04 Committed JWT key | ⚠️ Fixed phần repo | `MegaForm.Web.Host/appsettings.Production.json` — key thật → placeholder `__SET_MEGAFORM_JWT_KEY_ENV_IN_PRODUCTION__` + `_Jwt_comment`. **Còn lại (ops):** rotate key trên mọi host đã deploy và purge khỏi git history — key cũ phải xem như đã compromised. |
| SEC-09 Token leak qua interceptor | ✅ Fixed | `MegaForm.UI/src/umbraco-host/index.ts` — `isMegaFormApiUrl` giờ parse `new URL`, yêu cầu `origin === location.origin` + pathname prefix match; URL unparseable → false. Bundle `megaform-umbraco-host.js` đã rebuild + sync. |
| SEC-10 JS injection qua `?lang=` | ✅ Fixed | `MegaForm.Umbraco/Controllers/FormController.cs` — `GetRequestLocale` validate `^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$` cho mọi candidate (`?lang=`, schema defaultLanguage, Accept-Language), fallback `en-US`. |
| SEC-12 Connection string leak | ✅ Fixed | `MegaForm.Umbraco/Controllers/MegaFormApiController.ModuleConfig.cs` — `GetDatabaseSettings` trả qua `NamedConnectionCatalog.MaskSecrets` (helper Core chung, cùng regex với Oqtane twin): `Password=`/`Pwd=` → `***`, kể cả nhánh fallback DefaultConnection. |
| PERF-02 FormsOverview load whole table | ✅ Fixed | `MegaForm.Umbraco/Controllers/MegaFormApiController.cs` — legacy action viết lại bằng 2 SQL `GroupBy` (mirror `ReportsController.FormsOverview`), giữ nguyên route + response contract mà `MegaForm.UI/src/submissions/forms-overview.ts` consume. Kèm fix phụ: `EfRepositories.ListForms` coi `pageSize <= 0` là "all" (sửa luôn lỗi `.Take(0)` làm `ReportsController.cs:77` trả rỗng — PERF-17 một phần). |

**Chưa verify runtime qua browser** (chưa chạy host + gọi endpoint với non-admin account) — verification ở mức code review + build sạch. Khi có phiên runtime test, nên xác nhận: non-admin bị 401/403 trên `Subform/*` và `AiTools/PreviewSql|ExecuteDdl`; `/megaform/form/1/script?lang=x'-alert(1)-'` trả locale fallback; FormsOverview trả đúng số liệu với site có nhiều submissions.

**P0 còn lại chuyển sang ops/P1:** rotation JWT key + purge git history (SEC-04); siết metadata actions của AiToolsController nếu cần. Nhóm P1 trong mục 6 vẫn nguyên (SEC-05 policy siết, SEC-06 IDOR, SEC-07 body formId, SEC-08 captcha/rate-limit, SEC-14 payment converge, PERF-01 batch API...).
