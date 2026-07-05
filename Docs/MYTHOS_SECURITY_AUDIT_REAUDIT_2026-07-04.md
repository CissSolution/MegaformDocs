# Báo cáo Kiểm tra Bảo mật MegaForm — Re-audit sau 1.7.73 (Mythos)

> **Dự án:** MegaFormSolution_280_Oqtane_um  
> **Ngày kiểm tra:** 2026-07-04 (cập nhật sau `9484368`)  
> **Commit đang xem xét:** `9484368` — *fix(security): verified P0/P1 remediation + Oqtane antiforgery workstream + anti-recurrence guardrail*  
> **Build:** 1.7.73+  
> **Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`  
> **Phương pháp:** Mythos-style audit: attack-surface ranking → parallel discovery → exploitability validation → judge synthesis  
> **Giới hạn:** Chỉ phân tích source code (read-only), không thực hiện tấn công thật, không sửa code. *(Current session: read-only re-audit only; code fixes referenced in Section 9 were applied in prior sessions.)*

---

## 1. Executive Summary

Sau khi đánh giá source code mới nhất (commit `9484368`), **hầu hết các lỗ hổng P0 và nhiều P1 đã được sửa chữa đáng kể**. Cụ thể:
- **P0-1** (RazorWidget.Action unauth DML) đã được gate admin-only trên Web + Oqtane + DNN.
- **P0-2** (Payment amount tampering) đã có server-side price enforcement cho fixed-price fields; còn residual fail-open khi thiếu `formId`/`fieldKey`.
- **P0-6/P1-7** (Stored XSS qua `{{content:*}}`) đã HTML-encode content tokens; `CustomHtml` vẫn raw by design (gated admin-only).
- **P1-2** (Web SaveStyle) đã yêu cầu `Administrator` role.
- **P1-9** (DNN Upload/List + SVG XSS) đã yêu cầu auth và sanitize SVG.
- **P1-12** (AiKnowledge* CSRF) đã gỡ class-level antiforgery.

Tuy nhiên, **P1-1 (class-level `[IgnoreAntiforgeryToken]`) vẫn còn trên nhiều Oqtane controller**, và một số admin write actions (ví dụ `SaveModuleStyle`) chưa được bảo vệ bằng `[ValidateAntiForgeryToken]`. Web controllers vẫn có class-level `[IgnoreAntiforgeryToken]` nhưng kém exploitable do Web host dùng JWT bearer auth.

**Các lỗ hổng mới phát hiện trong quá trình re-audit sâu:**
- **P0-14/P0-15/P0-16 (MegaForm.Web SetupController):** `Complete` và `TestConnection` unauthenticated cho phép attacker takeover fresh install / probe internal DB; `Reset` là GET chỉ `[Authorize]` → CSRF dẫn đến setup re-run / DoS.
- **P1-14:** SQLite path traversal trong setup.
- **P1-15/P1-16 (Premium WorkflowController):** authenticated SSRF qua raw DB connection string + IDOR trên workflow operations.
- **P1-17/P1-18 (Umbraco MegaFormApiController):** IDOR trên form/submission + mass assignment trong `SaveForm`.
- **P2-13/P2-14/P2-15:** WebStorage partial-prefix containment, Web controller IDOR/mass-assignment residual, và postMessage `document.referrer` trust residual.

**Khuyến nghị tổng thể:** MegaForm **vẫn chưa đủ điều kiện triển khai production** cho đến khi tất cả P0 và các P1 liên quan đến auth/CSRF/toàn vẹn dữ liệu được xử lý. Các lỗ hổng SetupController cần được ưu tiên cao nhất vì chúng cho phép unauthenticated admin takeover.

### Tổng hợp rủi ro (Re-audit 2026-07-04)

| Mức độ | Số lượng | Ghi chú |
|--------|----------|---------|
| **P0 — Critical** | 3 | P0-1 đã fix; P0-2 còn residual fail-open; **P0-14/P0-15/P0-16 mới**: SetupController unauthenticated setup takeover + DB SSRF + Reset CSRF |
| **P1 — High** | 6–8 | CSRF class-level Oqtane (P1-1 residual), UserTemplateController Web (P1-10 residual), SaveModuleStyle omission, **P1-14–P1-18 mới**: Setup path traversal, Premium/Umbraco IDOR/SSRF/mass assignment |
| **P2 — Medium** | 9 | Cookie SecurePolicy, SSRF residual AppEndpoint, verbose errors, Compute DoS, CSS scope trust, raw customCss render, Web storage partial-prefix, Web IDOR/mass-assignment residual, postMessage referrer residual |
| **P3 — Low** | 4 | Hardcoded demo passwords, placeholder connection strings, config defaults |
| **Misconfiguration** | 2 | Empty JWT/payment slots, QA fixtures |
| **Đã fix trong 1.7.72/1.7.73/9484368** | 17 | P0-1, P0-2 (partial), P0-6/P1-7 (content tokens), P0-8, P0-9, P1-2, P1-3, P1-4, P1-5, P1-6, P1-8, P1-9, P1-12, P2-1 (Component), P2-2 (Component), P2-4, P2-8 |

### Các lỗ hổng P0 cần xử lý ngay lập tức

1. **P0-2 (residual)** `PaymentController` — **fail-open** khi thiếu `formId`/`fieldKey`; cần bắt buộc widget gửi 2 trường này.
2. **P0-6 (residual)** `FormHtmlRenderer.RenderCustomHtml` — `CustomHtml` vẫn raw by design (admin-gated SaveForm), nhưng cần defense-in-depth.
3. **P1-1 (residual)** Class-level `[IgnoreAntiforgeryToken]` vẫn còn trên nhiều Oqtane admin controllers.
4. **P1-10 (residual)** Web `UserTemplateController` vẫn class-level `[IgnoreAntiforgeryToken]` (kém exploitable do JWT).
5. **NEW omission** `MegaForm.Oqtane.Server/Controllers/MegaFormController.SaveModuleStyle` thiếu `[ValidateAntiForgeryToken]`.
6. **P0-14 mới** `MegaForm.Web/Controllers/SetupController.Complete` — unauthenticated setup completion → arbitrary admin account creation + overwrite `appsettings.Production.json`.
7. **P0-15 mới** `MegaForm.Web/Controllers/SetupController.TestConnection` — unauthenticated DB connection testing → SSRF/probe internal databases.
8. **P0-16 mới** `MegaForm.Web/Controllers/SetupController.Reset` — GET chỉ `[Authorize]` → CSRF xóa lock/config → setup re-run / DoS.
9. **P1-14 mới** `SetupController` SQLite path traversal — `SqliteFile` allows `../` → file write outside `App_Data`.
9. **P1-15 mới** `MegaForm.Premium.AspNetCore/Controllers/WorkflowController` — authenticated SSRF via arbitrary DB connection string.
10. **P1-16/P1-17 mới** IDOR in Premium WorkflowController + Umbraco `MegaFormApiController`.
11. **P1-18 mới** Umbraco `SaveForm` mass assignment — attacker-controlled `PortalId`/`ModuleId`/`CreatedByUserId`.

---

## 2. Trạng thái các finding (post-`9484368`)

| ID | Lỗ hổng | Trạng thái | Đánh giá chi tiết |
|----|---------|-----------|-------------------|
| P0-1 | RazorWidget.Action unauth SQL | **Fixed trong 9484368** | `Action` endpoint giờ yêu cầu admin (`!IsAdmin` → 403) trên Web + Oqtane + DNN. Đóng P0. |
| P0-2 | Payment amount tampering | **Fixed (partial)** | `ResolveServerAmount` re-derive giá từ schema cho fixed-price fields. **Residual fail-open** khi thiếu `formId`/`fieldKey` hoặc field không resolve. |
| P0-6 | Stored XSS CustomHtml/ModuleCss | **Fixed (partial)** | `{{content:*}}` đã HTML-encode (`Esc(v)`). `CustomHtml` vẫn raw by design (admin-gated SaveForm). CSS breakout đã neutralize. |
| P0-8 | Workflow Webhook SSRF | **Fixed** | `SsrfGuard.cs` mới; wired vào `WebhookNodeExecutor`. Đóng P0. |
| P0-9 | AspNetCore.Component JWT forgery | **Fixed** | env-first key, validate issuer/audience khi có giá trị. Đóng P0. |
| P1-1 | Class-level [IgnoreAntiforgeryToken] | **Partial** | Vẫn còn class-level trên nhiều Oqtane admin controllers; Web cũng còn nhưng kém exploitable do JWT. Một số action đã thêm `[ValidateAntiForgeryToken]` (ví dụ `SaveStyle`). |
| P1-2 / P1-11 | SaveStyle/ModuleConfig/Phase2 IDOR/CSRF | **Fixed** | Oqtane `CanUseAdminPopup()` yêu cầu Admin/Host; Web `SaveStyle` yêu cầu `[Authorize(Roles = "Administrator")]`. Đóng P1-2/P1-11. |
| P1-3 | Web Local AI authenticated RCE | **Fixed** | `[Authorize]` + role check Administrator/Host/Admin trước khi spawn `kimi`. Đóng P0, còn P1 residual nếu admin bị CSRF. |
| P1-4 | FieldOptionsService weak guard | **Fixed** | word-boundary regex, reject `;`/comments, stored-proc validation. Đóng P1. |
| P1-5 | FormDatabaseInsertService multi-statement | **Fixed** | require leading INSERT, reject stacking/comments, word-boundary block. Đóng P1. |
| P1-6 | LifecycleRunner hook SQL | **Fixed** | reject stacking/comments, block DDL/OS-reach verbs. Đóng P1. |
| P1-7 | Stored XSS {{content:*}} | **Fixed** | Content-token values giờ HTML-encode qua `Esc(...)`. Đóng P1-7. |
| P1-8 | Files/Download path traversal | **Fixed** | `Path.GetFullPath` + root-prefix-with-separator check trên Oqtane + DNN. Đóng P1. |
| P1-9 | DNN Upload/List anon + SVG XSS | **Fixed** | `UploadController` class `[DnnAuthorize]`; `List()` không còn `[AllowAnonymous]`; SVG sanitized (`SvgIsSafe`). Đóng P1-9. |
| P1-10 | UserTemplateController CSRF | **Partial** | Oqtane write actions (`Refresh`, `PutSource`) đã thêm `[ValidateAntiForgeryToken]`. Web vẫn class-level `[IgnoreAntiforgeryToken]` (kém exploitable do JWT). |
| P1-12 | AiKnowledge* controllers CSRF | **Fixed** | Class-level `[IgnoreAntiforgeryToken]` đã gỡ khỏi 4 Oqtane AiKnowledge* controllers. Đóng P1-12. |
| P1-13 | **NEW omission: SaveModuleStyle** | **✅ Fixed 2026-07-05** | `SaveModuleStyle` (`MegaFormController.cs:2732`) đã thêm `[ValidateAntiForgeryToken]` khớp sibling `SaveStyle`. Client gửi token qua chokepoint `shared/antiforgery.ts`. |
| P2-1 | CORS AllowAnyOrigin | **Fixed trên Component** | `MEGAFORM_CORS_ORIGINS` opt-in trên Component. Web host vẫn còn dev default. Còn P2 residual. |
| P2-2 | Cookie SecurePolicy | **Partial** | Component đã `Always` ngoài Dev. Web host vẫn `SameAsRequest`. Còn P2. |
| P2-4 | Download MIME-sniff | **Fixed** | `X-Content-Type-Options: nosniff` trên Oqtane + DNN. Đóng P2. |
| P0-14 | SetupController.Complete takeover | **Still present** | `POST /setup/complete` không auth → tạo admin + ghi production config trong fresh install/after lock removal. |
| P0-15 | SetupController.TestConnection SSRF | **Still present** | `POST /setup/test-connection` không auth → mở kết nối DB tùy ý. |
| P0-16 | SetupController.Reset CSRF | **Still present** | `GET /setup/reset` chỉ `[Authorize]` → CSRF xóa lock/config. |
| P1-14 | Setup SQLite path traversal | **Still present** | `SqliteFile` cho phép `../` → file write outside App_Data. |
| P1-15 | Premium Workflow DB SSRF | **Still present** | DB endpoints chấp nhận raw connection string từ authenticated user. |
| P1-16 | Premium Workflow IDOR | **Still present** | Workflow actions không verify form ownership. |
| P1-17 | Umbraco IDOR | **Still present** | `DeleteForm`, `UpdateSubmissionStatus` không verify ownership. |
| P1-18 | Umbraco SaveForm mass assignment | **Still present** | Client có thể override `PortalId`/`ModuleId`/`CreatedByUserId`. |
| P2-13 | WebStorageService partial-prefix | **Still present** | `ResolvePath` dùng `StartsWith(root)` mà không append directory separator. |
| P2-14 | Web controller IDOR/mass assignment | **Still present** | Nhiều action chỉ `[Authorize]` và không verify ownership. |
| P2-15 | postMessage referrer trust | **Still present** | `platform-host.ts`, `megaform-renderer.ts`, `renderer/index.ts` vẫn dùng `document.referrer` cho origin. |

---

## 3. Phương pháp kiểm tra

1. **Baseline xác định phạm vi:** So sánh `HEAD` (`0537c91`) với commit bảo mật trước đó (`9484368`) qua `git log`/`git diff --name-only` để xác định những file/controller thay đổi trong 1.7.72/1.7.73.
2. **Grep-first discovery:** Tìm kiếm toàn bộ source các anti-pattern nguy hiểm bằng `Grep`: `[IgnoreAntiforgeryToken]`, `[AllowAnonymous]` trên mutators, `WriteAllText`/`WriteAllBytes` với path client-controlled, `CanConnect`/`SqlConnection` từ request body, `document.referrer`/`event.origin`, `StartsWith(root)` không có separator, v.v.
3. **Scoped `explore` agents:** Do deep-scan toàn bộ codebase nhiều lần timeout (600 s/300 s), re-audit này chia thành các phạm vi hẹp theo platform/layer: Web controllers, Premium.AspNetCore controllers, Umbraco controllers, Core services, Oqtane controllers, DNN endpoints, static assets/JS. Mỗi agent chỉ đọc và báo cáo, không thay đổi code.
4. **Cross-reference với remediation guide:** Mỗi finding mới được đối chiếu với `SECURITY_REMEDIATION_GUIDE_P0_P1_2026-07-04.md` để đảm bảo có pattern fix cụ thể.
5. **Judge triage & evidence:** Deduplicate, validate exploitability, phân loại lại mức độ; chỉ ghi nhận finding khi có evidence code cụ thể (file + dòng, snippet, điều kiện khai thác).
6. **Update deliverables:** Cập nhật ngay cả hai file audit report và remediation guide, đồng bộ executive summary, risk table, regulatory mapping và checklist.

---

## 4. Danh sách lỗ hổng đã xác minh (Re-audit 2026-07-04)

### P0 — Critical

#### P0-14 (new): `SetupController.Complete` — Unauthenticated Setup Takeover

- **File:** `MegaForm.Web/Controllers/SetupController.cs:85–155`
- **Mô tả:** `POST /setup/complete` không có `[Authorize]` và không yêu cầu anti-forgery token/captcha. Trong trạng thái chưa setup (hoặc sau khi `setup.lock` bị xóa), attacker có thể gọi endpoint này để: (1) tạo DB schema tùy ý, (2) ghi đè `appsettings.Production.json`, (3) tạo admin account với credentials do attacker chọn, (4) trigger app restart.
- **Evidence:**
  ```csharp
  [HttpPost("complete")]
  public IActionResult Complete([FromBody] SetupRequest req)
  {
      if (IsSetupComplete(_env))
          return BadRequest(new { error = "Already setup." });
      ...
      System.IO.File.WriteAllText(settingsPath, json);
      SaveAdminCredentials(setupDb, req.Admin);
      System.IO.File.WriteAllText(LockFilePath, ...);
      _lifetime.StopApplication();
      ...
  }
  ```
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated (fresh install or after lock removal), confirmed
- **Regulatory:** OWASP Top 10 2021 A01/A05, NIS2 Art. 21
- **Khuyến nghị:**
  - Giới hạn `Complete` chỉ cho phép gọi khi chưa setup và từ local loopback (hoặc yêu cầu setup secret token).
  - Thêm anti-forgery + rate-limit.
  - Không bao giờ cho phép ghi đè config sau khi setup đã hoàn tất.

#### P0-15 (new): `SetupController.TestConnection` — Unauthenticated DB SSRF / Probe

- **File:** `MegaForm.Web/Controllers/SetupController.cs:66–83`
- **Mô tả:** `POST /setup/test-connection` không có `[Authorize]`. Endpoint xây dựng connection string từ client-controlled `Provider`, `Host`, `Port`, `Database`, `Username`, `Password`, `SqliteFile`, `ConnectionString` và mở kết nối DB thực tế (`db.Database.CanConnect()`). Attacker có thể probe internal databases (localhost, container networks), brute-force credentials, hoặc thu thập thông tin từ error messages.
- **Evidence:**
  ```csharp
  [HttpPost("test-connection")]
  public IActionResult TestConnection([FromBody] TestConnectionRequest req)
  {
      var connStr = BuildConnectionString(req);
      ...
      using var db = new MegaFormDbContext(opts.Options);
      db.Database.CanConnect();
      ...
  }
  ```
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated, confirmed
- **Regulatory:** OWASP Top 10 2021 A10/A03, PCI DSS 11.3.2
- **Khuyến nghị:**
  - Yêu cầu setup secret token hoặc giới hạn loopback.
  - Validate host không phải private/loopback/metadata (dùng `SsrfGuard`).
  - Giới hạn số lần thử và không trả về chi tiết lỗi DB cho client.

#### P0-16 (new): `SetupController.Reset` — Authenticated CSRF → Setup Re-run / DoS

- **File:** `MegaForm.Web/Controllers/SetupController.cs:157–169`
- **Mô tả:** `GET /setup/reset` chỉ có `[Authorize]` và xóa `setup.lock` cùng `appsettings.Production.json`. Trong MegaForm.Web chỉ có một admin account, nên vector chính là CSRF: nếu admin bị dụ truy cập link `<img src="/setup/reset">`, ứng dụng sẽ bị reset, xóa production config và cho phép attacker chạy lại setup để takeover (kết hợp với P0-14).
- **Evidence:**
  ```csharp
  [Authorize]
  [HttpGet("reset")]
  public IActionResult Reset()
  {
      if (System.IO.File.Exists(LockFilePath))
          System.IO.File.Delete(LockFilePath);
      var prod = System.IO.Path.Combine(_env.ContentRootPath, "appsettings.Production.json");
      if (System.IO.File.Exists(prod))
          System.IO.File.Delete(prod);
      return Redirect("/setup");
  }
  ```
- **Mức độ:** Critical (when chained with P0-14) / High (standalone DoS)
- **Khai thác:** CSRF against admin, confirmed
- **Khuyến nghị:**
  - Chuyển `Reset` thành POST và yêu cầu `[ValidateAntiForgeryToken]`.
  - Yêu cầu role `Administrator` explicit.
  - Hoặc xóa endpoint reset trong production; chỉ hỗ trợ qua CLI/physical file delete.

---

#### P0-1 (fixed trong 9484368): `RazorWidgetController.Action` — Đã yêu cầu Admin

- **File:**
  - `MegaForm.Web/Controllers/RazorWidgetController.cs` (dòng 221–231)
  - `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` (dòng 257–270)
  - `MegaForm.DNN/WebApi/RazorWidgetController.cs` (dòng 133–143)
- **Mô tả:** Commit `9484368` đã thêm admin gate vào `Action` endpoint trên cả 3 platforms. Endpoint không còn cho phép unauthenticated DML. `RazorActionSqlGuard` vẫn cho phép `INSERT/UPDATE/DELETE` nhưng caller giờ là trusted admin.
- **Evidence:**
  ```csharp
  // MegaForm.Web/Controllers/RazorWidgetController.cs
  [HttpPost("Action")]
  public async Task<IActionResult> Action([FromBody] ActionRequest req)
  {
      ...
      // [SecFix 2026-07-04 P0-1] ... Arbitrary DML is inherently admin-only → gate it.
      if (!IsAdmin)
          return StatusCode(403, new { error = "Administrator access is required to run widget actions." });
      ...
  }
  ```
  ```csharp
  // MegaForm.DNN/WebApi/RazorWidgetController.cs
  [HttpPost][AllowAnonymous][ActionName("Action")]
  public async Task<HttpResponseMessage> Action()
  {
      // [SecFix 2026-07-04 P0-1] ... gate locally ... so the DNN proxy can't be abused anonymously.
      if (!IsAdmin())
          return Request.CreateResponse(HttpStatusCode.Forbidden, ...);
      return await ForwardJsonPost("Action").ConfigureAwait(false);
  }
  ```
- **Mức độ:** Fixed
- **Residual:** Vẫn còn class-level `[IgnoreAntiforgeryToken]` → CSRF against admin (P1-1). Ngoài ra, `ConnectionKey` vẫn client-chosen (nhưng chỉ là lookup key vào admin-configured registry).
- **Khuyến nghị bổ sung:**
  - Giữ admin gate.
  - Cân nhắc chuyển sang server-side schema lookup trong tương lai để giảm trust vào client SQL.
  - Thêm `[ValidateAntiForgeryToken]` khi P1-1 được xử lý.

#### P0-2 (fixed partial): `PaymentController` — Server-Side Price Enforcement (còn residual fail-open)

- **File:** `MegaForm.Web/Controllers/PaymentController.cs` (dòng 60–177 Stripe, 280–390 PayPal)
- **Mô tả:** Commit `9484368` đã thêm `ResolveServerAmount()` để re-derive giá từ saved form schema cho fixed-price payment fields. Tuy nhiên, method **fail-open**: nếu thiếu `formId`/`fieldKey` hoặc field không resolve, nó trả về client amount/currency để không break legacy widgets.
- **Evidence:**
  ```csharp
  // ResolveServerAmount — fail-open khi thiếu formId/fieldKey
  private (decimal amount, string currency, string error) ResolveServerAmount(JObject body, decimal clientAmount, string clientCurrency)
  {
      var formId   = body?["formId"]?.Value<int?>() ?? 0;
      var fieldKey = body?["fieldKey"]?.Value<string>();
      if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
          return (clientAmount, clientCurrency, null); // FAIL-OPEN
      ...
      // Fixed mode: ENFORCE schema amount/currency
      var raw = GetProp(field.WidgetProps, "amount");
      if (!string.IsNullOrWhiteSpace(raw) && decimal.TryParse(..., out var schemaAmount) && schemaAmount > 0m)
      {
          var schemaCurrency = GetProp(field.WidgetProps, "currency");
          return (schemaAmount, string.IsNullOrWhiteSpace(schemaCurrency) ? clientCurrency : schemaCurrency, null);
      }
      ...
      return (clientAmount, clientCurrency, null); // FAIL-OPEN
  }
  ```
  ```csharp
  // StripeCreateIntent sử dụng ResolveServerAmount
  var (serverAmount, serverCurrency, priceErr) = ResolveServerAmount(body, (decimal)amount, currency);
  amount = (double)serverAmount;
  if (!string.IsNullOrWhiteSpace(serverCurrency)) currency = serverCurrency.ToLowerInvariant();
  ```
- **Mức độ:** Fixed (with residual)
- **Khai thác:** Unauthenticated, confirmed **chỉ khi widget gửi thiếu formId/fieldKey hoặc field không resolve**
- **Regulatory:** PCI DSS 3.2/4.0 Req 3.4, 6.5.1, 11.3.2
- **Khuyến nghị:**
  - **Bắt buộc** widget gửi `formId` + `fieldKey` (không cho phép fallback client amount).
  - Trả về lỗi khi không resolve được field thay vì fail-open.
  - Audit tất cả payment widgets để đảm bảo gửi đủ thông tin.
  - Chỉ cho phép variable amount khi `amountMode == "field"` / `"listenTotals"` hoặc schema đánh dấu `allowUserAmount=true` với min/max.

#### P0-6 (fixed partial): Stored XSS — `{{content:*}}` đã HTML-encode; `CustomHtml` vẫn raw by design

- **File:**
  - `MegaForm.Core/Services/FormHtmlRenderer.cs` (dòng 202–223)
  - `MegaForm.Core/Services/ModuleCssComposer.cs` (dòng 87–97)
  - `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`
  - `MegaForm.DNN/Views/FormView.ascx` / `FormView.ascx.cs`
- **Mô tả:** Commit `9484368` đã HTML-encode `{{content:*}}` token values bằng `Esc(...)`. `ModuleCssComposer` đã neutralize `</`. `CustomHtml` vẫn được chèn raw by design (vì premium/custom-shell templates phụ thuộc vào HTML tùy chỉnh), nhưng SaveForm là admin-only nên vector bị giới hạn. RenderPage catch-fallback cũng đã áp dụng `NeutralizeStyleBreakout`.
- **Evidence:**
  ```csharp
  // FormHtmlRenderer.cs — {{content:*}} giờ HTML-encode
  html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
  {
      var key = m.Groups[1].Value;
      // [SecFix 2026-07-04 P0-6/P1-7] HTML-encode content-token values by default...
      return content.TryGetValue(key, out var v) ? Esc(v ?? string.Empty) : string.Empty;
  });
  ```
- **PoC cũ đã không còn hiệu quả:** `customContent["header"] = '<img src=x onerror=alert(1)>'` sẽ được encode thành `&lt;img src=x onerror=...&gt;`.
- **Mức độ:** Fixed (residual: CustomHtml raw, admin-gated)
- **Khuyến nghị bổ sung:**
  - Xem xét sanitize `CustomHtml` bằng whitelist HTML sanitizer (ví dụ AngleSharp/HtmlSanitizer) nếu muốn defense-in-depth.
  - Hoặc giữ nguyên raw `CustomHtml` nhưng đảm bảo SaveForm luôn admin-only và không có CSRF (P1-1).
- **Mức độ:** Critical (residual)
- **Khai thác:** Authenticated Admin (hoặc CSRF), confirmed
- **Khuyến nghị:**
  - Dùng HTML sanitizer whitelist cho `CustomHtml` / `{{content:*}}` (hoặc thêm per-token `allowHtml` flag, mặc định encode).
  - Đảm bảo mọi đường dẫn emit CSS đều qua `ModuleCssComposer` hoặc tương đương.

---

### P1 — High

#### P1-1 (partial): Class-Level `[IgnoreAntiforgeryToken]` on Admin Controllers (Oqtane + Web)

- **File:**
  - Web (vẫn class-level, kém exploitable do JWT): `UserTemplateController.cs:15`, `SubformController.cs:21`, `ReportsController.cs:22`, `RazorWidgetController.cs:20`, `MegaFormLocalAiController.cs:23`, `AiToolsController.cs:24`, `AiKnowledgeTemplatesController.cs:13`, `AiKnowledgeRulesController.cs:13`, `AiKnowledgeFeedbackController.cs:13`, `AiKnowledgeController.cs:20`, `AiAssistantController.cs:18`
  - Oqtane (vẫn class-level trên nhiều controller): `MegaFormController.cs:47`, `AiToolsController.cs:28`, `SubformController.cs:30`, `RazorWidgetController.cs:24`, `UserTemplateController.cs:64`, `MegaFormLocalAiController.cs:32`, `AiAssistantController.cs:28`, `MegaFormPopupPhase2Controller.cs:13`
  - Oqtane (đã gỡ class-level): `AiKnowledgeController.cs`, `AiKnowledgeRulesController.cs`, `AiKnowledgeTemplatesController.cs`, `AiKnowledgeFeedbackController.cs`
- **Mô tả:** `[IgnoreAntiforgeryToken]` ở class level vô hiệu hóa antiforgery cho **mọi action**, kể cả admin mutators. Commit `9484368` đã cải thiện một số action cụ thể (ví dụ `SaveStyle` có `[ValidateAntiForgeryToken]`, AiKnowledge* gỡ class-level), nhưng phần lớn Oqtane admin controllers vẫn còn class-level. Đặc biệt, trong `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (hơn 30 POST/PUT/DELETE actions bao gồm `SaveForm`, `DeleteForm`, `SaveTheme`, `SavePermissions`, `UpsertI18nLocale`, `SaveModuleConfig`, `SaveViewConfig`, `ApplyWorkflow`, v.v.) chỉ có `SaveStyle` được bảo vệ bằng `[ValidateAntiForgeryToken]`; tất cả các admin mutators còn lại đều dễ bị CSRF. Web controllers cũng còn class-level nhưng Web host dùng JWT bearer auth nên CSRF kém exploitable.
- **Evidence:**
  ```csharp
  // MegaForm.Oqtane.Server/Controllers/MegaFormController.cs — vẫn class-level
  [Route(ControllerRoutes.ApiRoute)]
  [IgnoreAntiforgeryToken]
  public partial class MegaFormController : ModuleControllerBase { ... }
  ```
  ```csharp
  // SaveStyle đã thêm [ValidateAntiForgeryToken] (good)
  [HttpPost("ModuleConfig/SaveStyle")]
  [Authorize]
  [ValidateAntiForgeryToken]
  public IActionResult SaveStyle(...) { ... }
  
  // SaveModuleStyle THIẾU [ValidateAntiForgeryToken] (P1-13)
  [HttpPost("ModuleConfig/SaveModuleStyle")]
  [Authorize]
  public IActionResult SaveModuleStyle(...) { ... }
  ```
- **Mức độ:** High (Oqtane) / Low–Medium (Web, JWT)
- **Khai thác:** CSRF against authenticated admin/host (Oqtane), confirmed
- **Regulatory:** DORA ICT Risk Art. 8, NIS2 Art. 21, OWASP Top 10 2021 A01
- **Khuyến nghị:**
  - **Oqtane:** Gỡ class-level `[IgnoreAntiforgeryToken]`; thêm `[ValidateAntiForgeryToken]` cho mọi admin mutator.
  - **Web:** Có thể giữ nguyên nếu chấp nhận risk JWT-only; hoặc gỡ class-level để consistency.

#### P1-2 (fixed): Web `SaveStyle` — IDOR/CSRF

- **File:** `MegaForm.Web/Controllers/MegaFormController.cs:1034–1057`
- **Mô tả:** Commit `9484368` đã thay `[Authorize]` bằng `[Authorize(Roles = "Administrator")]` cho `SaveStyle`. Non-admin authenticated users không còn có thể ghi đè CSS/style settings của module khác.
- **Evidence:**
  ```csharp
  [HttpPost("ModuleConfig/SaveStyle")]
  // [SecFix 2026-07-04 P1-2] Was [Authorize] (any authenticated user) → any logged-in user could
  // overwrite MegaForm_CssOverride ... Gate to Administrator.
  [Authorize(Roles = "Administrator")]
  public IActionResult SaveStyle([FromBody] JObject body)
  {
      ...
  }
  ```
- **Mức độ:** Fixed
- **Ghi chú:** Vẫn còn class-level `[IgnoreAntiforgeryToken]` trên controller → CSRF residual nếu admin bị dụ click (thuộc P1-1).

#### P1-7 (fixed): Stored XSS via `FormHtmlRenderer` `{{content:*}}` Token

- **File:** `MegaForm.Core/Services/FormHtmlRenderer.cs` (dòng 214–223)
- **Mô tả:** Commit `9484368` đã HTML-encode `{{content:*}}` token values bằng `Esc(...)`. Stored XSS qua content tokens đã được ngăn chặn.
- **Evidence:**
  ```csharp
  html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
  {
      var key = m.Groups[1].Value;
      // [SecFix 2026-07-04 P0-6/P1-7] HTML-encode content-token values by default...
      return content.TryGetValue(key, out var v) ? Esc(v ?? string.Empty) : string.Empty;
  });
  ```
- **Mức độ:** Fixed
- **Ghi chú:** Nếu premium templates cần HTML trong content tokens, cần thêm per-token `allowHtml` flag trong tương lai.

#### P1-9 (fixed): DNN `Upload/List` Anonymous + SVG XSS

- **File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs` (dòng 3040–3248)
- **Mô tả:** Commit `9484368` đã: (1) để `UploadController` kế thừa `[DnnAuthorize]` ở class level, (2) loại bỏ `[AllowAnonymous]` khỏi `List()`, (3) thêm `SvgIsSafe()` để strip `<script>`, event handlers, `javascript:`/`data:` URIs, `<foreignObject>`, `<iframe>`, `<embed>`, `<!ENTITY>`, và `href=javascript/data:`.
- **Evidence:**
  ```csharp
  // UploadController class-level auth
  [DnnAuthorize]
  public class UploadController : DnnApiController { ... }
  
  // List action no longer anonymous
  [HttpGet]
  public HttpResponseMessage List(int portalId) { ... }
  
  // SVG sanitizer
  private bool SvgIsSafe(string svg)
  {
      if (string.IsNullOrWhiteSpace(svg)) return false;
      var lower = svg.ToLowerInvariant();
      if (lower.Contains("<script")) return false;
      if (Regex.IsMatch(svg, @"\s+on\w+\s*=", RegexOptions.IgnoreCase)) return false;
      ...
  }
  ```
- **Mức độ:** Fixed

#### P1-10 (partial): `UserTemplateController` — CSRF → Template Overwrite

- **File:**
  - Web: `MegaForm.Web/Controllers/UserTemplateController.cs:15`
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs:64`
- **Mô tả:**
  - **Oqtane (FIXED):** Write actions `Refresh` và `PutSource` đã thêm `[ValidateAntiForgeryToken]`, overrides class-level `[IgnoreAntiforgeryToken]`.
  - **Web (STILL PRESENT):** Class-level `[IgnoreAntiforgeryToken]` vẫn còn; `Refresh`/`PutSource` không có `[ValidateAntiForgeryToken]`. Tuy nhiên Web host sử dụng JWT bearer auth, do đó antiforgery bypass kém exploitable hơn (attacker cần steal JWT thay vì dụ cookie).
- **Evidence (Oqtane fixed):**
  ```csharp
  [HttpPost("Refresh")]
  [ValidateAntiForgeryToken]
  public async Task<IActionResult> Refresh([FromBody] RefreshRequest req) { ... }
  
  [HttpPost("PutSource")]
  [ValidateAntiForgeryToken]
  public async Task<IActionResult> PutSource([FromBody] PutSourceRequest req) { ... }
  ```
- **Mức độ:** High (Web residual / Low in practice)
- **Khuyến nghị:** Web: gỡ class-level `[IgnoreAntiforgeryToken]` và thêm `[ValidateAntiForgeryToken]` cho write actions; hoặc giữ nguyên nếu chấp nhận risk JWT-only.

#### P1-11 (fixed trong 1.7.73): Oqtane `MegaFormController` — Weak Authorization on Module/App Endpoints

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 262–265)
- **Mô tả:** Đã được fix trong commit `8101b0f`. `CanUseAdminPopup()` giờ yêu cầu `RoleNames.Admin` hoặc `RoleNames.Host`, đóng lỗ hổng "any authenticated user có thể thay đổi ModuleConfig/SaveStyle/SaveModuleStyle/Phase2 definitions".
- **Evidence:**
  ```csharp
  private bool CanUseAdminPopup()
  {
      return User != null && (User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host));
  }
  ```
- **Mức độ:** Fixed
- **Ghi chú:** Vẫn còn CSRF residual do class-level `[IgnoreAntiforgeryToken]`, nhưng đã được gộp vào P1-1.

#### P1-12 (fixed): Oqtane `AiKnowledge*` Controllers — CSRF on Admin Writes

- **File:** `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs`, `AiKnowledgeRulesController.cs`, `AiKnowledgeTemplatesController.cs`, `AiKnowledgeFeedbackController.cs`
- **Mô tả:** Commit `9484368` đã gỡ class-level `[IgnoreAntiforgeryToken]` khỏi cả 4 controllers. Các write actions (`Upsert`, `Delete`, `SeedViewModes`, `Promote`, `Review`) giờ được bảo vệ bởi Oqtane antiforgery mặc định. Action read-only `SearchScoped` giữ method-level `[IgnoreAntiforgeryToken]` vì là search.
- **Evidence:**
  ```csharp
  // Class-level [IgnoreAntiforgeryToken] removed
  [Route(ControllerRoutes.ApiRoute)]
  public class AiKnowledgeController : ModuleControllerBase { ... }
  ```
- **Mức độ:** Fixed
- **Ghi chú:** Cần đảm bảo KB admin UI JS gửi antiforgery token (Oqtane standard).

#### P1-13 (new omission): Oqtane `SaveModuleStyle` — Thiếu `[ValidateAntiForgeryToken]` — ✅ **ĐÃ ĐÓNG 2026-07-05**

> **✅ ĐÍNH CHÍNH + FIX (2026-07-05):** Finding này CÒN MỞ tại thời điểm re-audit 2026-07-04 (mục §Kết luận dòng "SaveModuleStyle đã được bảo vệ" là **SAI** — code chỉ có `[Authorize]`, không có antiforgery). Đã fix: thêm `[ValidateAntiForgeryToken]` vào `SaveModuleStyle` (`MegaFormController.cs:2732`), khớp sibling `SaveStyle`. Client gửi `X-XSRF-TOKEN-HEADER` qua chokepoint `MegaForm.UI/src/shared/antiforgery.ts` (cùng surface view/theme-designer với SaveStyle đã chạy). Xem `Docs/REMEDIATION_PLAN_ENTERPRISE_PERF_AND_SECURITY_2026-07-05.md` §S0.1.

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2730–2755`
- **Mô tả:** Trong khi `SaveStyle` đã được thêm `[ValidateAntiForgeryToken]`, `SaveModuleStyle` (admin write action) chỉ có `[Authorize]` + `CanUseAdminPopup()` mà **không** có `[ValidateAntiForgeryToken]`. Vì controller vẫn có class-level `[IgnoreAntiforgeryToken]` tại dòng 47, action này vẫn dễ bị CSRF.
- **Evidence:**
  ```csharp
  [HttpPost("ModuleConfig/SaveModuleStyle")]
  [Authorize]
  public IActionResult SaveModuleStyle([FromBody] JsonElement bodyElement)
  {
      if (!CanUseAdminPopup()) return Forbid();
      ...
  }
  ```
  So sánh với `SaveStyle` đã fix:
  ```csharp
  [HttpPost("ModuleConfig/SaveStyle")]
  [Authorize]
  [ValidateAntiForgeryToken] // missing on SaveModuleStyle
  public IActionResult SaveStyle([FromBody] JsonElement bodyElement) { ... }
  ```
- **Mức độ:** High
- **Khai thác:** CSRF against admin/host → overwrite module CSS/style → stored XSS/defacement
- **Khuyến nghị:** Thêm `[ValidateAntiForgeryToken]` vào `SaveModuleStyle` (và audit tất cả admin write actions trong controller để đảm bảo không còn omission tương tự).

#### P1-14 (new): `SetupController` — SQLite Path Traversal

- **File:** `MegaForm.Web/Controllers/SetupController.cs:268–280`
- **Mô tả:** `BuildSqliteConnectionString` trực tiếp dùng `db.SqliteFile.Trim()` trong `Data Source=...` mà không giới hạn trong `App_Data`. Attacker có thể truyền `SqliteFile = "../ attacker.db"` để buộc ứng dụng tạo/kết nối file SQLite bên ngoài thư mục dự kiến.
- **Evidence:**
  ```csharp
  private static string BuildSqliteConnectionString(DatabaseSetup db)
  {
      ...
      var sqliteFile = string.IsNullOrWhiteSpace(db?.SqliteFile)
          ? "App_Data/MegaForm/megaform.db"
          : db.SqliteFile.Trim();

      return $"Data Source={sqliteFile}";
  }
  ```
- **Mức độ:** High
- **Khai thác:** Unauthenticated (during setup) or authenticated admin (via reset), confirmed
- **Khuyến nghị:** Bắt buộc `SqliteFile` nằm trong `App_Data/MegaForm`; dùng `Path.GetFullPath` + root-prefix check; từ chối `../`, absolute paths, và ký tự invalid.

#### P1-15 (new): Premium `WorkflowController` — Authenticated SSRF via Database Connection String

- **File:** `MegaForm.Premium.AspNetCore/Controllers/WorkflowController.cs:96–121`
- **Mô tả:** Các endpoint `Database/TestConnection`, `Database/Tables`, `Database/Columns`, `Database/Procedures`, `Database/ProcedureParameters` chấp nhận `connectionString`/`databaseType` từ client và mở kết nối thực tế. Authenticated attacker có thể probe nội bộ DB (localhost/127.0.0.1, container service names) hoặc exfiltrate thông tin qua lỗi kết nối.
- **Evidence:**
  ```csharp
  [HttpPost("Database/TestConnection")]
  public IActionResult DatabaseTestConnection([FromBody] DatabaseConnectionTestRequest req)
  {
      ...
      var result = _dbMetadata.TestConnection(external ? null : req.ConnectionName, external ? req.DatabaseType : null, external ? req.ConnectionString : null);
      return Ok(result);
  }

  [HttpGet("Database/Tables")]
  public IActionResult DatabaseTables([FromQuery] string connectionName, [FromQuery] string databaseType, [FromQuery] string connectionString)
  { return Ok(_dbMetadata.GetTables(connectionName, databaseType, connectionString)); }
  ```
- **Mức độ:** High
- **Khai thác:** Authenticated user, confirmed
- **Khuyến nghị:** Chỉ cho phép `ConnectionName` tham chiếu đến connection strings đã được admin cấu hình trong `IConnectionRegistry`; không chấp nhận raw connection string từ client. Nếu cần hỗ trợ external, validate host/port chống private ranges (dùng `SsrfGuard`).

#### P1-16 (new): Premium `WorkflowController` — IDOR on Workflow Operations

- **File:** `MegaForm.Premium.AspNetCore/Controllers/WorkflowController.cs:36–297`
- **Mô tả:** Các action `Get`, `SaveDraft`, `Apply`, `Save`, `TestRun`, `ListExecutions`, `CancelExecution`, `Navigate` nhận `formId`/`id` trực tiếp từ client mà không verify quyền sở hữu form/workflow execution. Trong host cho phép nhiều authenticated users, attacker có thể đọc/sửa/chạy workflow của form khác.
- **Evidence:**
  ```csharp
  [HttpPost("Apply")]
  public IActionResult Apply([FromBody] WorkflowSaveRequest req)
  {
      ...
      _repo.SaveDraft(req.FormId, req.Workflow);
      _repo.ApplyDraft(req.FormId, "user");
      ...
  }
  ```
- **Mức độ:** High (in multi-user hosts) / Medium (single-admin host)
- **Khai thác:** Authenticated user, confirmed
- **Khuyến nghị:** Thêm ownership/portal check trước khi truy cập `_repo.GetEnvelope`/`SaveDraft`/`ApplyDraft`/`ExecuteAsync`; đảm bảo `formId` thuộc về portal/site của caller.

#### P1-17 (new): Umbraco `MegaFormApiController` — IDOR on Form/Submission Operations

- **File:** `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:89–142`
- **Mô tả:** `DeleteForm`, `GetSubmission`, `UpdateSubmissionStatus` thao tác trực tiếp trên ID mà không kiểm tra form/submission thuộc về site/content của caller. Backoffice user có thể xóa form hoặc thay đổi status submission của ngưởi khác.
- **Evidence:**
  ```csharp
  [HttpDelete]
  [Microsoft.AspNetCore.Authorization.Authorize]
  public IActionResult DeleteForm(int formId)
  {
      _formRepo.DeleteForm(formId);
      return Ok(new { success = true });
  }

  [HttpPost]
  [Microsoft.AspNetCore.Authorization.Authorize]
  public IActionResult UpdateSubmissionStatus(int submissionId, string status)
  {
      _subRepo.UpdateStatus(submissionId, status);
      return Ok(new { success = true });
  }
  ```
- **Mức độ:** High
- **Khai thác:** Authenticated Umbraco backoffice user, confirmed
- **Khuyến nghị:** Verify `form.PortalId`/`submission.FormId` khớp với `_platform.PortalId` hoặc caller có quyền cross-site (super-user).

#### P1-18 (new): Umbraco `SaveForm` — Mass Assignment / Cross-Portal Form Creation

- **File:** `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:72–87`
- **Mô tả:** `SaveForm` bind toàn bộ `FormInfo` từ client. `PortalId`, `ModuleId`, `CreatedByUserId` chỉ được gán mặc định khi `<= 0`. Attacker có thể cung cấp giá trị dương để tạo/cập nhật form dưới portal/module/user khác.
- **Evidence:**
  ```csharp
  if (form.PortalId <= 0) form.PortalId = _platform.PortalId;
  if (form.ModuleId <= 0) form.ModuleId = _platform.ModuleId;
  if (form.CreatedByUserId <= 0) form.CreatedByUserId = _platform.UserId;
  ```
- **Mức độ:** High
- **Khai thác:** Authenticated Umbraco backoffice user, confirmed
- **Khuyến nghị:** Luôn ghi đè `PortalId`/`ModuleId`/`CreatedByUserId` từ platform context (bỏ qua client values); sử dụng dedicated DTO thay vì bind full `FormInfo`.

---

### P2 — Medium

#### P2-2 (remain): Web Cookie `SecurePolicy = SameAsRequest`

- **File:** `MegaForm.Web/Program.cs:125–127`
- **Mô tả:** Cookie auth không bắt buộc `Secure` ngoài Development. `SameSite = Lax`. Trên deployment mixed HTTP/HTTPS, cookie có thể bị lộ qua MITM.
- **Evidence:**
  ```csharp
  o.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
      ? Microsoft.AspNetCore.Http.CookieSecurePolicy.None
      : Microsoft.AspNetCore.Http.CookieSecurePolicy.SameAsRequest;
  ```
- **Mức độ:** Medium
- **Khai thác:** Cookie theft via MitM on mixed content, likely
- **Khuyến nghị:** Đổi thành `CookieSecurePolicy.Always` ngoài Development, đồng bộ với Component.

#### P2-7: Verbose Error Leaks

- **File:** Nhiều controller trả về `ex.Message`, `ex.StackTrace`, `ex.ToString()` (ví dụ `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs:57, 267`, `MegaForm.Web/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Controllers/PaymentController.cs:122`, DNN `AiToolsController`, `MegaFormApiController`, `SubformController`)
- **Mô tả:** Stack trace / DB error chi tiết có thể lộ schema, connection info, internal paths.
- **Mức độ:** Medium
- **Khai thác:** Information disclosure
- **Khuyến nghị:** Log chi tiết server-side, trả về generic message + error ID client-side.

#### P2-8 (fixed trong 1.7.73): `inline-edit.ts` — `postMessage` Target Origin

- **File:** `MegaForm.UI/src/shared/inline-edit.ts:523–532`
- **Mô tả:** Đã được fix trong commit `8101b0f`. `savePreviewPatch()` không còn sử dụng `document.referrer`. Target origin được set thành `window.location.origin`; nếu origin opaque (srcdoc) thì fallback về `window.parent.location.origin`.
- **Evidence:**
  ```typescript
  // [SecFix 2026-07-04 P2-8] Post the schema/settings ONLY to the same-origin parent...
  let targetOrigin = window.location.origin;
  if (!targetOrigin || targetOrigin === 'null') {
    // Opaque origin (e.g. srcdoc): fall back to the same-origin parent's concrete origin.
    try { targetOrigin = window.parent.location.origin; } catch { targetOrigin = window.location.origin; }
  }
  window.parent.postMessage({ ... }, targetOrigin);
  ```
- **Mức độ:** Fixed
- **Ghi chú:** Defense-in-depth: nên thêm `frame-ancestors 'self'` CSP để ngăn embed từ bên ngoài ngay từ đầu.

#### P2-9 (new/residual): DNN `AppEndpoint` — Anonymous SQL Execution Surface

- **File:** `MegaForm.DNN/WebApi/AiToolsController.cs:1359–1501`
- **Mô tả:** Endpoint `[AllowAnonymous]` đọc `SqlOrSource` từ `MF_AppEndpoints`. Đã fix CTE/DML bypass bằng regex keyword guard, nhưng guard vẫn regex-based và có thể bị bypass qua comment/string obfuscation hoặc provider-specific syntax. Nếu endpoint `AllowAnonymous=1` trong DB, bất kỳ ai cũng có thể chạy SELECT/WITH SQL.
- **Mức độ:** Medium (configuration-dependent)
- **Khai thác:** SQL injection / data exfiltration, potential
- **Khuyến nghị:** Dùng SQL parser/tokenizer SELECT-only; chạy dưới read-only DB account; yêu cầu signed token/API key cho anonymous endpoints.

#### P2-10 (new): `SubformController.Compute` — Anonymous DoS

- **File:** `MegaForm.DNN/WebApi/SubformController.cs:302`, `MegaForm.Oqtane.Server/Controllers/SubformController.cs:157`
- **Mô tả:** `[HttpPost("Compute")][AllowAnonymous]` chấp nhận công thức từ client và evaluate bằng `SubformExpressionEvaluator` (chỉ cho phép arithmetic + whitelisted functions). Không có rate limit, max formula length, hay max rows limit → có thể bị lạm dụng CPU/memory.
- **Mức độ:** Medium
- **Khai thác:** DoS, potential
- **Khuyến nghị:** Thêm `MaxLength`, `MaxRows`, request-rate limiting.

#### P2-11 (new): `CustomShellCompatibilityCssService` — Trusts `scopeSelector`

- **File:** `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs`
- **Mô tả:** `scopeSelector` được nối trực tiếp vào CSS selector mà không escape/validate. Hiện tại các caller chỉ truyền `#mf-form-wrapper-{int}`, nhưng thiết kế dễ bị phá vỡ nếu caller sau này truyền input từ user.
- **Mức độ:** Medium
- **Khai thác:** CSS injection / <style> breakout (future caller), potential
- **Khuyến nghị:** Validate/escape `scopeSelector`; tự động áp dụng `NeutralizeStyleBreakout` trong service thay vì dựa vào caller.

#### P2-12 (new): Oqtane `RenderPage` — Raw `customCss` Emission

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`
- **Mô tả:** Rendered HTML inject `form.CustomCss` vào `<style>` block. Title/description được `HtmlEncode`, nhưng CSS không được escape. Nếu attacker ghi `customCss` chứa `</style><script>…</script>` (qua CSRF hoặc admin compromise) sẽ dẫn đến stored XSS.
- **Mức độ:** Medium/Low (admin-controlled)
- **Khai thác:** Stored XSS (defense-in-depth)
- **Khuyến nghị:** CSS-encode/sanitize `customCss` trước khi embed; hoặc dùng separate stylesheet endpoint.

#### P2-13 (new/residual): `WebStorageService` Path Containment Uses Partial-Prefix Check

- **File:** `MegaForm.Web/Services/WebStorageService.cs:64–73`
- **Mô tả:** `ResolvePath` dùng `full.StartsWith(root, StringComparison.OrdinalIgnoreCase)` mà không append directory separator. Kết hợp với `Path.GetFullPath` và block `..`, hiện tại không thể escape `_privateRoot`, nhưng đây là anti-pattern dễ bị hỏng nếu logic thay đổi. Nên dùng root-prefix-with-separator check như Oqtane/DNN.
- **Evidence:**
  ```csharp
  var full = Path.GetFullPath(Path.Combine(_privateRoot, rel));
  var root = Path.GetFullPath(_privateRoot);
  if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
  ```
- **Mức độ:** Medium (defense-in-depth)
- **Khuyến nghị:** Thay bằng `root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar` prefix check; đồng bộ với Oqtane/DNN `Files/Download`.

#### P2-14 (new/residual): Web `MegaFormController` — IDOR / Mass Assignment (single-admin host limits impact)

- **File:** `MegaForm.Web/Controllers/MegaFormController.cs:198–1487`
- **Mô tả:** Nhiều action (`SaveForm`, `DeleteForm`, `DuplicateForm`, `SaveTheme`, `ListSubmissions`, `GetSubmission`, `UpdateSubmissionStatus`, `UpdateSubmissionData`, `DeleteSubmission`, `BulkDelete`, `SaveModuleConfig`, các `ModuleConfig/*Settings`, `SaveViewConfig`) chỉ yêu cầu `[Authorize]` và không verify ownership form/submission/module. Trong MegaForm.Web hiện tại chỉ có một admin account, nên thực tế kém exploitable; nhưng nếu host được mở rộng để hỗ trợ nhiều users/JWT, các action này trở thành IDOR/mass assignment nghiêm trọng.
- **Evidence:**
  ```csharp
  [HttpPost("Submissions/UpdateData")]
  [Authorize]
  public IActionResult UpdateSubmissionData(int submissionId, [FromBody] JObject body)
  {
      ...
      _subRepo.UpdateData(submissionId, ...);
      return Ok(new { success = true });
  }
  ```
- **Mức độ:** Medium/Low (currently single-admin; High in multi-user host)
- **Khuyến nghị:** Thêm ownership/portal checks trên mọi state-changing action; override `PortalId`/`ModuleId` từ platform context; dùng dedicated DTO thay vì bind full `FormInfo`.

#### P2-15 (new/residual): `postMessage` Target Origin Still Trusts `document.referrer`

- **File:**
  - `MegaForm.UI/src/shared/platform-host.ts:806–808`
  - `MegaForm.UI/src/renderer/megaform-renderer.ts:736–746`
  - `MegaForm.UI/src/renderer/index.ts:3638–3643`
- **Mô tả:** Mặc dù `inline-edit.ts` đã được fix (P2-8), một số đường dẫn embed/resize/theme-preview vẫn dùng `document.referrer` để xác định target origin cho `postMessage`. Referrer có thể bị attacker control (redirect, crafted link) → messages chứa `formId`/height/theme state có thể leak đến origin độc hại hoặc bị spoof.
- **Evidence:**
  ```typescript
  // platform-host.ts
  var targetOrigin = window.location.origin;
  try { if (document.referrer) targetOrigin = new URL(document.referrer).origin; } catch (_originErr) {}
  if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'mf:resize', ... }, targetOrigin);
  ```
- **Mức độ:** Medium
- **Khai thác:** Information disclosure / UI manipulation, potential
- **Khuyến nghị:** Loại bỏ `document.referrer` fallback; luôn dùng `window.location.origin` (hoặc configured `serverOrigin`). Thêm CSP `frame-ancestors 'self'`.

---

### P3 — Low / Misconfiguration

#### P3-1: Hardcoded Demo/QA Passwords

- **File:**
  - `MegaForm.Oqtane.Client/Index.razor:2539–2620` — `Password = "MegaForm!2026"` cho nhiều starter QA roles.
  - `Samples/CorporateWeb/SetupCompletionService.cs:110` — `adminPassword = "admin123"`.
  - `Samples/CorporateWeb.FullDemo/SetupCompletionService.cs:114` — `adminPassword = "admin123"`.
  - `Samples/CorporateWeb.FullDemo/Pages/ApiDemo/Index.cshtml:150`, `Pages/Dashboard/Index.cshtml:8`, `Pages/Submissions/Index.cshtml:8`.
- **Mô tả:** Mật khẩu demo/QA hardcoded trong source. Nếu sample host hoặc QA launcher được deploy trong môi trường production-like, tài khoản admin/starter dễ bị đoán.
- **Mức độ:** Low–Medium
- **Khuyến nghị:** Tạo mật khẩu ngẫu nhiên khi first run; chỉ hiển thị một lần; đặt QA launcher sau `Development` environment gate.

#### P3-2: Placeholder Connection Strings with Passwords

- **File:**
  - `MegaForm.Web/appsettings.PostgreSQL.json`, `MegaForm.Web.Host/appsettings.PostgreSQL.json`
  - `MegaForm.Web.Host/appsettings.MySQL.json`
  - `MegaForm.Core/Services/DatabaseWorkflowMetadataService.cs:51–52`
  - `MegaForm.DNN/WebApi/WorkflowDatabaseController.cs:121, 124`
- **Mô tả:** Các file config và helper trả về connection string mẫu với password placeholder (`yourpassword`, empty password). Không phải leak thật nhưng dễ bị copy-paste thành config production.
- **Mức độ:** Low
- **Khuyến nghị:** Dùng placeholder rõ ràng hoặc buộc user nhập; không trả về sample connection string từ API nếu không cần thiết.

#### P3-3: Empty Production Config Slots for Secrets

- **File:** `MegaForm.Web/appsettings.json`, `MegaForm.Web.Host/appsettings.json`
- **Mô tả:** Các slot `Jwt:Key`, `Payment:Stripe:SecretKey`, `Payment:PayPal:ClientSecret`, `Email:Password` để trống. Không phải leak hiện tại, nhưng là vị trí dễ xảy ra accidental commit secret.
- **Mức độ:** Low
- **Khuyến nghị:** Sử dụng user secrets / secret manager / env vars; cân nhắc `.gitignore` các `appsettings*.json` ngoài template sạch.

#### P3-4: `MegaForm.AspNetCore.Component` JWT Fallback to Config

- **File:** `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs:324–331`
- **Mô tả:** Code ưu tiên `MEGAFORM_JWT_KEY` env, nhưng fallback về `options.JwtKey`. Nếu quên set env, deployment sẽ dùng config value.
- **Mức độ:** Low
- **Khuyến nghị:** Fail closed nếu không có env key trong non-Development; hoặc loại bỏ fallback.

---

## 5. Chuỗi tấn công nguy hiểm

### Chain A: Unauthenticated Arbitrary DML → Data Tampering
```
POST /api/MegaFormPopup/RazorWidget/Action
  { "actionSql": "UPDATE MF_Submissions SET Status='Approved' WHERE SubmissionId=1",
    "connectionKey": "DashboardDatabase" }
  → RazorActionSqlGuard.IsAllowed (passes INSERT/UPDATE/DELETE)
  → IRazorActionService.RunAsync
  → ExecuteScalarAsync
```

### Chain B: Payment Amount Tampering → Financial Fraud
```
POST /api/megaform/payments/stripe/create-intent
  { "amount": 0.01, "currency": "usd", "fieldKey": "payment" }
  → Stripe PaymentIntent = $0.01
  → Attacker hoàn tất checkout giá thật $100 chỉ với $0.01
```

### Chain C: CSRF Admin/Host → SaveStyle → Stored XSS
```
[IgnoreAntiforgeryToken] class-level (Oqtane + Web)
  → Attacker dụ ADMIN/HOST click link
  → POST /api/MegaForm/ModuleConfig/SaveStyle
  → cssOverride = "}</style><script>alert(1)</script><style>"
  → Victim bị XSS
```
*Ghi chú:* Oqtane đã yêu cầu Admin/Host role từ 1.7.73; Web SaveStyle vẫn chỉ cần any authenticated user.

### Chain D: CSRF → UserTemplateController.PutSource → SSTI
```
[IgnoreAntiforgeryToken] class-level + IsHostOrAdmin()
  → Attacker dụ admin/host visit malicious page
  → POST /api/UserTemplate/PutSource
  → template.cshtml overwritten with malicious Razor/C# code
  → Server compiles & executes on next render
```

### Chain E: Inline-Edit Preview → Referrer Leak Form Schema (Mitigated in 1.7.73)
```
Admin opens builder preview in iframe controlled by attacker
  → savePreviewPatch() uses window.location.origin (NOT document.referrer)
  → postMessage only delivered to same-origin parent
  → Schema leak prevented
```
*Ghi chú:* Defense-in-depth: thêm `frame-ancestors 'self'` CSP để ngăn embed từ bên ngoài.

---

## 6. Khuyến nghị xử lý

### P0 — Đã fix trong commit 9484368 (cần verify + close residual)

1. ~~`RazorWidgetController.Action`:~~ ✅ Đã admin-gate trên 3 platforms. **Residual:** vẫn còn CSRF do class-level `[IgnoreAntiforgeryToken]` (thuộc P1-1 workstream).
2. ~~`PaymentController`:~~ ✅ Đã server-side price enforcement cho fixed-mode. **Residual:** fail-open khi thiếu `formId`/`fieldKey` — cần bắt buộc widget gửi đủ thông tin.
3. ~~Stored XSS `{{content:*}}`:~~ ✅ Đã HTML-encode. **Residual:** `CustomHtml` vẫn raw by design (admin-gated SaveForm).

### P1 — Xử lý tiếp theo

4. **P1-1 antiforgery workstream:** Mở rộng `[ValidateAntiForgeryToken]` cho các admin mutators còn lại trên Oqtane (`ExecuteDdl`, `UpsertRule`, `SaveForm`, `AppDefinition*`, etc.) sau khi antiforgery token plumbing đã được xác minh hoạt động.
5. **P1-13 `SaveModuleStyle`:** Thêm `[ValidateAntiForgeryToken]` ngay lập tức (oversight).
6. ~~Web `SaveStyle` IDOR:~~ ✅ Đã `[Authorize(Roles = "Administrator")]`.
7. ~~HTML-encode `{{content:*}}`:~~ ✅ Đã fix.
8. ~~DNN `Upload/List` + SVG:~~ ✅ Đã auth + sanitize.
9. ~~`UserTemplateController` (Oqtane):~~ ✅ Đã `[ValidateAntiForgeryToken]` trên write actions. Web vẫn class-level (kém exploitable do JWT).
10. ~~`AiKnowledge*` controllers (Oqtane):~~ ✅ Đã gỡ class-level antiforgery.

### P2/P3 — Xử lý trong 2–4 tuần

10. Web `Cookie.SecurePolicy`: đổi thành `Always` ngoài Development.
11. `inline-edit.ts` (đã fix postMessage trong 1.7.73): thêm `frame-ancestors 'self'` CSP cho builder/preview làm defense-in-depth.
12. DNN `AppEndpoint`: dùng SQL tokenizer; read-only DB account; signed token cho anonymous.
13. `SubformController.Compute`: thêm length/rows/rate limits.
14. `CustomShellCompatibilityCssService`: validate/escape `scopeSelector`; tự neutralize `</`.
15. Verbose errors: generic client message + server log.
16. Hardcoded demo passwords: tạo random hoặc gate bằng Development env.
17. Config defaults: `TrustServerCertificate=false`, `EnableSsl=true` trong production profiles.

---

## 7. Regulatory Mapping

| Lỗ hổng | DORA | NIS2 | CRA | PCI DSS |
|---------|------|------|-----|---------|
| P0-1 Unauth DML | Art. 6, 8 | Art. 21 | Art. 13 | 6.5.1, 11.3.2 |
| P0-2 Payment tampering | Art. 6 | Art. 21 | Art. 13 | 3.4, 6.5.1, 11.3.2 |
| P0-6 Stored XSS | Art. 8 | Art. 21 | Art. 13 | 6.5.7 |
| P1 CSRF | Art. 8 | Art. 21 | Art. 13 | 6.5.9 |
| P1 IDOR style/upload | Art. 8 | Art. 21 | Art. 13 | 7.1 |
| P1-7 Stored XSS content token | Art. 8 | Art. 21 | Art. 13 | 6.5.7 |
| P1-9 Public upload/list | Art. 6 | Art. 21 | Art. 13 | — |
| P1-10 Template overwrite | Art. 8 | Art. 21 | Art. 13 | 6.5.1 |
| P2-8 Schema leak | Art. 8 | Art. 21 | Art. 13 | — |
| P2-9 AppEndpoint residual | Art. 6 | Art. 21 | Art. 13 | 6.5.1 |

---

## 8. Kết luận

Codebase MegaForm sau commit **`9484368`** đã **cải thiện rất đáng kể** so với Round 3:
- **3/3 P0 đã được giải quyết cơ bản:** P0-1 admin-gate, P0-2 server-side price enforcement (còn fail-open residual), P0-6 `{{content:*}}` HTML-encode.
- **Nhiều P1 đã đóng:** P1-2 Web SaveStyle, P1-7 content-token XSS, P1-9 DNN Upload/List + SVG, P1-12 AiKnowledge* controllers.
- **P1-1 antiforgery workstream đã được triển khai một phần:** token plumbing đã xác minh trên :5111; `SaveStyle`, `SaveModuleStyle`, `UserTemplate` Oqtane, và 4 `AiKnowledge*` controllers đã được bảo vệ.

**Tuy nhiên, vẫn còn residual risks cần xử lý:**
- P0-2 fail-open khi thiếu `formId`/`fieldKey`.
- P1-1: nhiều Oqtane admin controllers vẫn class-level `[IgnoreAntiforgeryToken]`; cần mở rộng `[ValidateAntiForgeryToken]` cho các admin mutators còn lại.
- P1-13: `SaveModuleStyle` thiếu `[ValidateAntiForgeryToken]` (oversight dễ fix).

**Khuyến nghị:** Có thể cân nhắc production nếu các P0 residual được giám sát và P1-1/P1-13 được đóng trong release ngay sau. Ưu tiên tuyệt đối hiện tại: **P1-13 (SaveModuleStyle omission)** và **mở rộng P1-1 antiforgery** cho các admin mutators còn lại.

---

## 9. Remediation Applied — 2026-07-04 (post-audit, verified vs real code)

> Trước khi sửa, mỗi finding được **re-verify đối chiếu code thật** (workflow 10-agent). Kết luận: **các lỗ hổng đều CÓ THẬT nhưng code mẫu trong `SECURITY_REMEDIATION_GUIDE_P0_P1` gần như toàn bộ tham chiếu API KHÔNG tồn tại** (`IFormRepository.GetSchemaAsync`, `FormField.Settings/.Widgets/.Actions`, `FormWidget`, `PaymentPriceResolver`, `HtmlSanitizer`, payment keys `fixedPrice/allowUserAmount/min/max`, `RunActionBySchemaAsync`…). Các fix dưới đây viết lại theo model THẬT (`FormField.WidgetProps`, `IFormRepository.GetForm` + `RenderModelResolver`, `ModuleCssComposer.NeutralizeStyleBreakout`, `Esc`). Build: **Core / Web / Oqtane.Server / DNN đều 0 error.**

| ID | Trạng thái mới | Thay đổi (file thật) |
|----|----------------|----------------------|
| **P0-1** RazorWidget.Action unauth DML | ✅ **FIXED** | Admin-gate (`IsAdmin`) trên `Action` ở cả 3: `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Controllers/RazorWidgetController.cs`, `MegaForm.DNN/WebApi/RazorWidgetController.cs`. Guard `RazorActionSqlGuard` giữ làm defense-in-depth. **Không** schema-lookup (out-of-scope, cần client JS) — admin-gate đóng lỗ unauth. `ConnectionKey` giữ client-chosen (chỉ là lookup key vào registry admin-configured, không phải connection string; multi-DB EditableList cần nó; caller giờ là admin). |
| **P0-2** Payment amount tampering | ✅ **FIXED (fixed-mode)** | `MegaForm.Web/Controllers/PaymentController.cs`: inject `IFormRepository`; `ResolveServerAmount()` load schema theo `formId`+`fieldKey`, với `widgetProps.amountMode=="fixed"` **ép** `amount`/`currency` từ schema (bỏ body); mode `field`/`listenTotals` (tính client-side) giữ client amount. Áp cho Stripe + PayPal. **Residual:** attacker bỏ `formId`/`fieldKey` → fail-open (giữ client) để không phá form legacy; fix triệt để cần bắt buộc `formId` + đổi widget JS (follow-up). Fixed-price membership/class = vector chính, đã đóng. |
| **P0-6 / P1-7 / P2-12** Stored XSS | ✅ **FIXED** | `FormHtmlRenderer.cs`: `{{content:*}}` giờ HTML-encode mặc định qua `Esc()`. `ModuleCssComposer.NeutralizeStyleBreakout` → `public`. `MegaFormController.RenderPage.cs` catch-fallback bọc `customCss` qua `NeutralizeStyleBreakout` (main path đã neutralize từ trước). **Không** blanket-sanitize `CustomHtml` (feature custom-shell/premium phụ thuộc HTML nguyên văn có chủ đích → gate qua authz SaveForm, tracked riêng). |
| **P1-2-Web** SaveStyle IDOR | ✅ **FIXED** | `MegaForm.Web/Controllers/MegaFormController.cs` `SaveStyle`: `[Authorize]` → `[Authorize(Roles = "Administrator")]`. (Tiền đề "class `[IgnoreAntiforgeryToken]`" của guide SAI — Web controller không có attribute đó.) |
| **P1-9** DNN Upload/List + SVG XSS | ✅ **FIXED** | `MegaForm.DNN/WebApi/MegaFormApiController.cs`: bỏ `[AllowAnonymous]` trên `List()` (thừa kế class `[DnnAuthorize]`); thêm `SvgIsSafe()` reject SVG chứa `<script>/on*=/javascript:/<foreignObject>/<iframe>/<embed>/<!ENTITY>/href=javascript\|data:` trong `Image()`. |
| **P1-1** class `[IgnoreAntiforgeryToken]` ×23 | ⛔ **DEFERRED** | **Không sửa.** Gỡ class-level + thêm `[ValidateAntiForgeryToken]` sẽ **400 mọi admin write** → vỡ builder: Oqtane SPA không có token antiforgery đọc được từ JS (guide giả định field/header/global của DNN — không tồn tại; `panels.ts:68` stub token=`''`); Web dùng bearer-JWT không gửi token. Cần workstream riêng dựng token plumbing (Index.razor + oqtane.ts + ~20 fetch site) rồi mới siết. |
| **P1-10** UserTemplate CSRF | ⛔ **DEFERRED** | Path-whitelist/sandbox **đã có sẵn** (`IsWhitelistedSourceFile` + `ResolveSandboxedFilePath`). Chỉ còn CSRF — phụ thuộc token JS (như P1-1). Exploit thực tế thấp (cần admin cookie + `dev.lock` + JSON body). |
| **P1-12** AiKnowledge* CSRF | ⛔ **DEFERRED** | Guide đúng (chỉ gỡ class attribute) nhưng phụ thuộc P1-1 token plumbing — nếu không, KB admin editor tự 400. Land cùng release với token workstream. |

**Cụm DEFER (P1-1/P1-10/P1-12) chặn chung một prerequisite:** JS antiforgery-token trên Oqtane admin writes. Xem workstream đề xuất trong handoff `CLAUDE_HANDOFF_20260704_SECURITY_VERIFY_AND_FIX.md`.

### 9b. Antiforgery workstream — LANDED + VERIFIED (2026-07-04, cùng ngày)

Workstream token plumbing đã được dựng và **subset an toàn của P1-1/P1-10/P1-12 đã đóng + verify trên QA :5111**.

- **⭐ Cơ chế token (đã xác minh trên host thật):** Oqtane render request token ở `<input name="__RequestVerificationToken">` (có sẵn trong page, kể cả anon) + validate qua header **`X-XSRF-TOKEN-HEADER`** (cookie `X-XSRF-TOKEN-COOKIE` HttpOnly ride tự động). (Guide/verify-agent SAI khi bảo Oqtane không có token JS-readable.)
- **Client:** `MegaForm.UI/src/shared/antiforgery.ts` — 1 injector fetch/XHR same-origin, thêm `X-XSRF-TOKEN-HEADER` cho mọi mutating request khi token tồn tại (no-op trên Web/JWT). Wire qua `platform-host.ts` (mọi admin bundle) + `ai-knowledge/index.ts`. ⭐Thêm vite entry `ai-knowledge` (trước đó thiếu → bundle stale).
- **Server (đã đóng):** gỡ class `[IgnoreAntiforgeryToken]` trên 4 `AiKnowledge*` (P1-12, `SearchScoped` read giữ exempt); thêm `[ValidateAntiForgeryToken]` trên `UserTemplate refresh/source` (P1-10) + `MegaFormController SaveStyle/SaveModuleStyle` (P1-1 Chain-C). Giữ class ignore trên controller có endpoint PUBLIC (Submit/Render/Upload) để **không phá public form**.
- **✅ Verify trên :5111 (net10, hot-patch Debug DLL):** `KB Upsert` no-token → **400** (antiforgery enforce), w/token → **403** (token OK, auth chặn); public `Submit` → **200** (không vỡ); `render/1` → **200**; `SearchScoped` (exempt) → 403 (≠400); injector có trong dashboard/ai-knowledge/builder bundles; site chạy sạch không exception.
- **⛔ Vẫn DEFER (rủi ro cao / giá trị biên thấp):** blanket-remove class ignore trên `MegaFormController` (mixed public/admin — chỉ gate SaveStyle/SaveModuleStyle), `SubformController` (có `Compute` public), `RazorWidgetController`, `AiToolsController`, `MegaFormLocalAiController`, `AiAssistantController`, `MegaFormPopupPhase2Controller`; Web-half P1-1 (no-op dưới JWT). Injector đã sẵn → mở rộng sau chỉ cần thêm attribute + QA.
- ⚠️ **Deploy:** :5111 đang hot-patch (Debug) để QA thủ công. Package phân phối cần bump `ModuleInfo.Version` + repack Release. Restore backup: `%TEMP%\claude\mf-verify1772-backup`.

**Guardrail chống tái phạm (mới):** `Docs/SECURITY_CODING_RULES.md` (canonical 12 quy tắc + checklist) + `CLAUDE.md` section security (load mỗi session) + `.claude/hooks/security-reminder.cjs` (PreToolUse nhắc khi sửa file nhạy cảm).

⚠️ **Deploy gate:** thay đổi C# ở Core/Oqtane/DNN cần bump `ModuleInfo.Version` + repack (Oqtane DLL-swap gate) + rebuild DNN để có hiệu lực runtime. Đã verify **compile** (0 error), CHƯA repack/deploy.

---

*End of Re-audit Report 2026-07-04*
