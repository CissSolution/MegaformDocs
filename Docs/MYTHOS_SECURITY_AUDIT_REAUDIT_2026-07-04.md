# Báo cáo Kiểm tra Bảo mật MegaForm — Re-audit sau 1.7.73 (Mythos)

> **Dự án:** MegaFormSolution_280_Oqtane_um  
> **Ngày kiểm tra:** 2026-07-04 (cập nhật sau `8101b0f`)  
> **Commit đang xem xét:** `8101b0f` — *fix(security): re-audit P1-2/P1-11 authz + P2-8 inline-edit postMessage → 1.7.73*  
> **Build:** 1.7.73  
> **Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`  
> **Phương pháp:** Mythos-style audit: attack-surface ranking → parallel discovery → exploitability validation → judge synthesis  
> **Giới hạn:** Chỉ phân tích source code (read-only), không thực hiện tấn công thật, không sửa code.

---

## 1. Executive Summary

Sau khi đánh giá source code mới nhất (build 1.7.73, commit `8101b0f`), **phần lớn các fix từ Round 3 (2026-07-03) đã được áp dụng đúng**, đặc biệt là P0-8 (Workflow SSRF), P0-9 (AspNetCore.Component JWT), P1-3 (Web Local AI RCE), P1-4/P1-5/P1-6 (SQL guards), P1-8 (path traversal), P2-4 (download nosniff), và **hai finding mới được fix trong 1.7.73: P1-2/P1-11 (Oqtane `CanUseAdminPopup` yêu cầu Admin/Host role) và P2-8 (inline-edit `postMessage` không còn tin `document.referrer`)**. Tuy nhiên, codebase vẫn còn **3 lỗ hổng P0 (Critical)** chưa được giải quyết triệt để, trong đó có **2 lỗ hổng unauthenticated** (RazorWidget.Action DML, Payment amount tampering) và **1 P0 residual về stored XSS** (raw CustomHtml). Nhiều vấn đề P1/P2 vẫn còn sót lại.

**Khuyến nghị tổng thể:** MegaForm **vẫn chưa đủ điều kiện triển khai production** cho đến khi tất cả P0 và các P1 liên quan đến auth/CSRF/toàn vẹn dữ liệu được xử lý.

### Tổng hợp rủi ro (Re-audit 2026-07-04)

| Mức độ | Số lượng | Ghi chú |
|--------|----------|---------|
| **P0 — Critical** | 3 | Unauth DML (RazorWidget.Action), payment tampering, stored XSS residual (CustomHtml) |
| **P1 — High** | 6 | CSRF class-level, Web SaveStyle IDOR, template overwrite, stored XSS {{content:*}}, AiKnowledge CSRF, DNN Upload/List |
| **P2 — Medium** | 6 | Cookie SecurePolicy, SSRF residual AppEndpoint, verbose errors, Compute DoS, CSS scope trust, raw customCss render |
| **P3 — Low** | 4 | Hardcoded demo passwords, placeholder connection strings, config defaults |
| **Misconfiguration** | 2 | Empty JWT/payment slots, QA fixtures |
| **Đã fix trong 1.7.72/1.7.73** | 12 | P0-8, P0-9, P1-2/P1-11 (1.7.73), P1-3, P1-4, P1-5, P1-6, P1-8, P2-1 (Component), P2-2 (Component), P2-4, P2-8 (1.7.73) |

### Các lỗ hổng P0 cần xử lý ngay lập tức

1. **P0-1 (remain)** `RazorWidgetController.Action` — vẫn **unauthenticated DML** (`INSERT/UPDATE/DELETE`) dù đã có `RazorActionSqlGuard`.
2. **P0-2 (remain)** `PaymentController` — client-controlled `amount`/`currency`, chưa được sửa trong 1.7.73.
3. **P0-6 (residual)** `FormHtmlRenderer.RenderCustomHtml` / raw `customCss` — stored XSS qua CustomHtml và CSS override chưa được encode toàn diện.

---

## 2. Trạng thái các finding từ audit trước (post-1.7.73)

| ID | Lỗ hổng | Trạng thái sau 1.7.72 | Đánh giá chi tiết |
|----|---------|----------------------|-------------------|
| P0-1 | RazorWidget.Action unauth SQL | **Giảm thiểu một phần** | `RazorActionSqlGuard` đã chặn DROP/ALTER/EXEC/xp_/sp_/stacking/comments. Vẫn cho phép `INSERT/UPDATE/DELETE` unauthenticated. Vẫn là P0. |
| P0-2 | Payment amount tampering | **Không fix** | Comment TODO trong code; yêu cầu coordinated widget + schema change. Vẫn P0. |
| P0-6 | Stored XSS CustomHtml/ModuleCss | **Giảm thiểu một phần** | `ModuleCssComposer` neutralize `</` ngăn breakout khỏi `<style>`. `CustomHtml` và `{{content:*}}` vẫn raw. Giảm xuống P0 residual / P1. |
| P0-8 | Workflow Webhook SSRF | **Fixed** | `SsrfGuard.cs` mới; wired vào `WebhookNodeExecutor`; chặn private/metadata/loopback. Đóng P0. |
| P0-9 | AspNetCore.Component JWT forgery | **Fixed** | env-first key, validate issuer/audience khi có giá trị. Đóng P0. |
| P1-1 | Class-level [IgnoreAntiforgeryToken] | **Không fix** | Vẫn còn trên 20+ controllers Web/Oqtane. Vẫn P1. |
| P1-2 / P1-11 | SaveStyle/ModuleConfig/Phase2 IDOR/CSRF | **Fixed trong 1.7.73 (Oqtane)** | `CanUseAdminPopup()` giờ yêu cầu `RoleNames.Admin` hoặc `RoleNames.Host`. Web `SaveStyle` vẫn chỉ `[Authorize]` any user — còn residual. |
| P1-3 | Web Local AI authenticated RCE | **Fixed** | `[Authorize]` + role check Administrator/Host/Admin trước khi spawn `kimi`. Đóng P0, còn P1 residual nếu admin bị CSRF. |
| P1-4 | FieldOptionsService weak guard | **Fixed** | word-boundary regex, reject `;`/comments, stored-proc validation. Đóng P1. |
| P1-5 | FormDatabaseInsertService multi-statement | **Fixed** | require leading INSERT, reject stacking/comments, word-boundary block. Đóng P1. |
| P1-6 | LifecycleRunner hook SQL | **Fixed** | reject stacking/comments, block DDL/OS-reach verbs. Đóng P1. |
| P1-7 | Stored XSS {{content:*}} | **Không fix** | Vẫn chèn raw content vào HTML. Vẫn P1. |
| P1-8 | Files/Download path traversal | **Fixed** | `Path.GetFullPath` + root-prefix-with-separator check trên Oqtane + DNN. Đóng P1. |
| P1-9 | DNN Upload/List anon + SVG XSS | **Giảm thiểu một phần** | Upload đã yêu cầu auth/AF; `Upload/List` vẫn `[AllowAnonymous]`; SVG vẫn không sanitize. Vẫn P1/P2. |
| P1-10 | UserTemplateController CSRF | **Không fix** | Class-level `[IgnoreAntiforgeryToken]` vẫn còn trên Web/Oqtane. Vẫn P1. |
| P2-1 | CORS AllowAnyOrigin | **Fixed trên Component** | `MEGAFORM_CORS_ORIGINS` opt-in trên Component. Web host vẫn còn dev default. Còn P2 residual. |
| P2-2 | Cookie SecurePolicy | **Partial** | Component đã `Always` ngoài Dev. Web host vẫn `SameAsRequest`. Còn P2. |
| P2-4 | Download MIME-sniff | **Fixed** | `X-Content-Type-Options: nosniff` trên Oqtane + DNN. Đóng P2. |

---

## 3. Phương pháp kiểm tra

1. **Kiểm tra git log/status** của commit `8101b0f` và dirty working tree để xác định phạm vi thay đổi.
2. **Verify trực tiếp** các file đã sửa bằng `ReadFile`/`Grep`.
3. **Rà soát toàn bộ** bằng parallel `explore` agents cho: anonymous endpoints, SQL injection, XSS/SSTI, CSRF/auth, SSRF/upload/RCE, secrets/config.
4. **Judge triage**: deduplicate, validate exploitability, phân loại lại mức độ.
5. **Viết báo cáo** chỉ bao gồm các finding đã được xác minh bằng evidence cụ thể.

---

## 4. Danh sách lỗ hổng đã xác minh (Re-audit 2026-07-04)

### P0 — Critical

#### P0-1 (remain): `RazorWidgetController.Action` — Unauthenticated DML

- **File:**
  - `MegaForm.Web/Controllers/RazorWidgetController.cs` (dòng 19–20, 221–244)
  - `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` (dòng 24, 257–281)
  - `MegaForm.DNN/WebApi/RazorWidgetController.cs` (dòng 132–139, proxy `[AllowAnonymous]`)
  - `MegaForm.Core/Services/RazorActionSqlGuard.cs` (dòng 36–38)
- **Mô tả:** Commit 1.7.72 đã thêm `RazorActionSqlGuard` để chặn DROP/ALTER/EXEC/xp_/sp_/stacking/comments. Tuy nhiên, endpoint vẫn **không có `[Authorize]`** và guard vẫn cho phép `INSERT/UPDATE/DELETE`. Kẻ tấn công unauthenticated có thể sửa/xóa dữ liệu trên bất kỳ connection nào trong registry mà không cần đăng nhập.
- **Evidence:**
  ```csharp
  // RazorActionSqlGuard.cs — AllowedLead vẫn chấp nhận INSERT/UPDATE/DELETE
  private static readonly Regex AllowedLead = new Regex(
      @"^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b",
      RegexOptions.Compiled | RegexOptions.IgnoreCase);
  ```
  ```csharp
  // MegaForm.Web/Controllers/RazorWidgetController.cs
  [Route("api/MegaFormPopup/[controller]")]
  [IgnoreAntiforgeryToken]
  public class RazorWidgetController : ControllerBase { ... }
  
  [HttpPost("Action")]
  public async Task<IActionResult> Action([FromBody] ActionRequest req)
  {
      ...
      var result = await svc.RunAsync(req.ActionSql, bag, req.ConnectionKey ?? "DashboardDatabase");
      ...
  }
  ```
- **PoC:**
  ```http
  POST /api/MegaFormPopup/RazorWidget/Action HTTP/1.1
  Content-Type: application/json

  { "actionSql": "UPDATE Users SET Email='attacker@x.com' WHERE UserId=1",
    "parameters": {}, "connectionKey": "DashboardDatabase" }
  ```
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated, confirmed
- **Khuyến nghị:**
  - Thêm `[Authorize(Roles = "Administrator")]` / `[Authorize(Policy = "EditModule")]`.
  - **Không bao giờ** tin `actionSql` từ client; tra cứu từ form schema server-side (`formId` + `widgetKey` + `actionName`).
  - Nếu bắt buộc phải chấp nhận client SQL, giới hạn connection chỉ đọc (read replica) hoặc chuyển sang stored-proc whitelist.

#### P0-2 (remain): `PaymentController` — Client-Controlled Amount Tampering

- **File:** `MegaForm.Web/Controllers/PaymentController.cs` (dòng 60–124 Stripe, 267–355 PayPal)
- **Mô tả:** Các endpoint thanh toán **không có `[Authorize]`** và tin `amount`/`currency` từ request body. Commit 1.7.72 chỉ thêm comment TODO, không sửa logic. Attacker có thể tạo Stripe PaymentIntent / PayPal Order với giá bất kỳ.
- **Evidence:**
  ```csharp
  [HttpPost("stripe/create-intent")]
  public async Task<IActionResult> StripeCreateIntent([FromBody] JObject body)
  {
      var amount   = body["amount"]?.Value<double>() ?? 0;
      var currency = (body["currency"]?.Value<string>() ?? "USD").ToLower();
      // [SecFix TODO P0-2] AMOUNT TAMPERING — the amount is still trusted from the client.
      ...
  }
  ```
- **PoC:**
  ```http
  POST /api/megaform/payments/stripe/create-intent HTTP/1.1
  Content-Type: application/json

  { "amount": 0.01, "currency": "usd", "fieldKey": "payment" }
  ```
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated, confirmed
- **Regulatory:** PCI DSS 3.2/4.0 Req 3.4, 6.5.1, 11.3.2
- **Khuyến nghị:**
  - Widget gửi kèm `formId` + `fieldKey`.
  - Server load form schema, xác định giá cố định (`fixedPrice`) và bắt buộc số tiền đó.
  - Chỉ cho phép variable amount khi field schema đánh dấu `allowUserAmount=true` và validate min/max.

#### P0-6 (residual): Stored XSS via `CustomHtml` / Raw `customCss` / Module CSS Override

- **File:**
  - `MegaForm.Core/Services/FormHtmlRenderer.cs` (dòng 202–258)
  - `MegaForm.Core/Services/ModuleCssComposer.cs` (dòng 87–97)
  - `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`
  - `MegaForm.DNN/Views/FormView.ascx` / `FormView.ascx.cs`
- **Mô tả:** `settings.CustomHtml` và `{{content:*}}` token values được chèn **raw** vào HTML. `ModuleCssComposer` đã neutralize `</` để ngăn breakout khỏi `<style>`, nhưng nội dung HTML tùy chỉnh vẫn không được sanitize/encode. Ngoài ra, `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs` có catch-fallback sử dụng `CustomShellCompatibilityCssService.AppendTo(customCss, ...)` mà không qua `ModuleCssComposer`, tạo đường bypass tiềm năng cho CSS breakout.
- **Evidence:**
  ```csharp
  // FormHtmlRenderer.cs — {{content:*}} chèn raw, không HTML-encode
  html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
  {
      var key = m.Groups[1].Value;
      return content.TryGetValue(key, out var v) ? (v ?? string.Empty) : string.Empty;
  });
  ```
  ```csharp
  // FormHtmlRenderer.cs — customHtml nguyên văn
  var html = settings.CustomHtml ?? string.Empty;
  ```
- **PoC:** Lưu `customContent["header"] = '<img src=x onerror=alert(document.cookie)>'` hoặc `customHtml = "<script>alert(1)</script>"`.
- **Mức độ:** Critical (residual)
- **Khai thác:** Authenticated Admin (hoặc CSRF), confirmed
- **Khuyến nghị:**
  - Dùng HTML sanitizer whitelist cho `CustomHtml` / `{{content:*}}` (hoặc thêm per-token `allowHtml` flag, mặc định encode).
  - Đảm bảo mọi đường dẫn emit CSS đều qua `ModuleCssComposer` hoặc tương đương.

---

### P1 — High

#### P1-1: Class-Level `[IgnoreAntiforgeryToken]` on Admin Controllers (Oqtane + Web)

- **File:**
  - Web: `MegaForm.Web/Controllers/UserTemplateController.cs:15`, `SubformController.cs:21`, `ReportsController.cs:22`, `RazorWidgetController.cs:20`, `MegaFormLocalAiController.cs:23`, `AiToolsController.cs:24`, `AiKnowledgeTemplatesController.cs:13`, `AiKnowledgeRulesController.cs:13`, `AiKnowledgeFeedbackController.cs:13`, `AiKnowledgeController.cs:20`, `AiAssistantController.cs:18`
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:47`, `AiToolsController.cs:28`, `SubformController.cs:30`, `RazorWidgetController.cs:24`, `UserTemplateController.cs:64`, `MegaFormLocalAiController.cs:32`, `AiAssistantController.cs:28`, `AiKnowledgeController.cs:25`, `AiKnowledgeFeedbackController.cs:19`, `AiKnowledgeRulesController.cs:17`, `AiKnowledgeTemplatesController.cs:20`, `MegaFormPopupPhase2Controller.cs:13`
- **Mô tả:** `[IgnoreAntiforgeryToken]` ở class level vô hiệu hóa antiforgery cho **mọi action**, kể cả admin mutators (`SaveForm`, `SaveStyle`, `ExecuteDdl`, `UpsertRule`, `RefreshTemplate`, `PutSource`). Kết hợp với CORS dev mặc định, admin bị CSRF dẫn đến stored XSS hoặc phá hoại dữ liệu.
- **Evidence:**
  ```csharp
  // MegaForm.Oqtane.Server/Controllers/MegaFormController.cs
  [Route(ControllerRoutes.ApiRoute)]
  [IgnoreAntiforgeryToken]
  public partial class MegaFormController : ModuleControllerBase { ... }
  ```
- **Mức độ:** High
- **Khai thác:** CSRF against authenticated admin, confirmed
- **Regulatory:** DORA ICT Risk Art. 8, NIS2 Art. 21, OWASP Top 10 2021 A01
- **Khuyến nghị:**
  - Gỡ bỏ class-level `[IgnoreAntiforgeryToken]`.
  - Chỉ áp dụng `[IgnoreAntiforgeryToken]` trên các action public thực sự (`Submit`, `Upload/File`, public schema).
  - Thêm `[ValidateAntiForgeryToken]` hoặc `[AutoValidateAntiforgeryToken]` cho admin mutators; plumb antiforgery token vào JS fetch layer.

#### P1-2 (Oqtane fixed trong 1.7.73; Web vẫn còn): `SaveStyle` / `SaveModuleStyle` / `ModuleConfig` / `Phase2/*` — IDOR + CSRF

- **File:**
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:262–265, 2683, 2730, 2785, 2874, 2893, 2943, 2980, 3007, 3048, 3066`
  - Web: `MegaForm.Web/Controllers/MegaFormController.cs:1034–1054`
- **Mô tả:**
  - **Oqtane (FIXED 1.7.73):** `CanUseAdminPopup()` giờ yêu cầu `RoleNames.Admin` hoặc `RoleNames.Host`. Kết hợp với class-level `[IgnoreAntiforgeryToken]`, vẫn còn CSRF chống lại admin/host, nhưng không còn lỗ hổng "any authenticated user".
  - **Web (STILL PRESENT):** `SaveStyle` vẫn chỉ có `[Authorize]` (any authenticated user), không kiểm tra ownership/module edit permission. Controller có class-level `[IgnoreAntiforgeryToken]`.
- **Evidence (Oqtane fixed):**
  ```csharp
  private bool CanUseAdminPopup()
  {
      return User != null && (User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host));
  }
  ```
- **Evidence (Web still present):**
  ```csharp
  [HttpPost("SaveStyle")]
  [Authorize]
  public IActionResult SaveStyle([FromBody] JsonElement bodyElement)
  {
      ... // writes style settings for arbitrary moduleId from body
  }
  ```
- **Mức độ:** High (Web residual)
- **Khai thác:** IDOR + CSRF → stored XSS / defacement / data tampering, confirmed (Web)
- **Khuyến nghị:**
  - **Web:** Thay `[Authorize]` bằng admin role check; validate caller có quyền edit trên `moduleId` cụ thể.
  - **Cả hai:** Bỏ class-level antiforgery.

#### P1-7: Stored XSS via `FormHtmlRenderer` `{{content:*}}` Token

- **File:** `MegaForm.Core/Services/FormHtmlRenderer.cs` (dòng 214–220)
- **Mô tả:** `RenderCustomHtml` chèn `settings.CustomContent[key]` **verbatim** vào HTML. Dù client renderer escape, server-side SSR (Oqtane `RenderPage` / DNN `FormView`) không encode. Nếu attacker thay đổi form settings (CSRF/admin compromise), nội dung này thành stored XSS.
- **Evidence:**
  ```csharp
  html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
  {
      var key = m.Groups[1].Value;
      return content.TryGetValue(key, out var v) ? (v ?? string.Empty) : string.Empty;
  });
  ```
- **Mức độ:** High
- **Khai thác:** Stored XSS (via admin/CSRF), confirmed
- **Khuyến nghị:** HTML-encode token values trong `RenderCustomHtml`; thêm per-token `allowHtml` flag cho những token thực sự cần HTML.

#### P1-9: DNN `Upload/List` Anonymous + SVG XSS

- **File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs` (dòng 3063–3246)
- **Mô tả:** `UploadController.List` trong DNN là `[AllowAnonymous]` và liệt kê tất cả ảnh trong `/Portals/{id}/MegaForm/Images/`. SVG upload check chỉ tìm `<svg` hoặc `<?xml` ở dòng đầu, không strip `<script>`/event handlers → stored XSS khi SVG được serve từ cùng origin.
- **Evidence:**
  ```csharp
  [AllowAnonymous]
  public class UploadController : DnnApiController { ... }
  ```
- **Mức độ:** High
- **Khai thác:** Information disclosure + stored XSS, confirmed
- **Khuyến nghị:**
  - Yêu cầu auth cho `Upload/List`.
  - Sanitize SVG (strip script/event handlers) hoặc serve với `Content-Disposition: attachment`.

#### P1-10: `UserTemplateController` — CSRF → Template Overwrite

- **File:**
  - Web: `MegaForm.Web/Controllers/UserTemplateController.cs:15`
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs:64`
- **Mô tả:** Class-level `[IgnoreAntiforgeryToken]`; write actions (`Refresh`, `PutSource`) chỉ gated bởi `IsHostOrAdmin()`. CSRF against host/admin có thể ghi đè template files (`template.cshtml`, `template.js`).
- **Mức độ:** High
- **Khai thác:** CSRF → SSTI/code execution, confirmed
- **Khuyến nghị:** Thêm antiforgery và validate file path whitelist.

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

#### P1-12 (new/reclassify): Oqtane `AiKnowledge*` Controllers — CSRF on Admin Writes

- **File:** `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs:25`, `AiKnowledgeRulesController.cs:17`, `AiKnowledgeTemplatesController.cs:20`, `AiKnowledgeFeedbackController.cs:19`
- **Mô tả:** Các controller này đều có `[IgnoreAntiforgeryToken]` ở class level và gating write bằng `IsAdmin`. CSRF against Host/Admin có thể thực hiện Upsert/Delete/SeedViewModes/Promote/Review.
- **Mức độ:** High
- **Khai thác:** CSRF against admin, confirmed
- **Khuyến nghị:** Bỏ class-level `[IgnoreAntiforgeryToken]`; thêm antiforgery cho mọi admin write action.

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

### P0 — Xử lý ngay trong 24–48h

1. `RazorWidgetController.Action`: thêm auth admin; đọc SQL từ schema server-side; hoặc chuyển connection sang read-only cho đến khi fix hoàn chỉnh.
2. `PaymentController`: tính amount server-side từ form schema/field; yêu cầu valid submission/session.
3. Stored XSS: HTML-sanitize `CustomHtml` / `{{content:*}}`; đảm bảo mọi đường CSS đều qua `ModuleCssComposer`/`NeutralizeStyleBreakout`.

### P1 — Xử lý trong 1 tuần

4. Gỡ class-level `[IgnoreAntiforgeryToken]` trên tất cả admin controllers; plumb antiforgery token vào JS fetch layer.
5. **Web** `SaveStyle`: require admin role + validate module ownership. Oqtane đã yêu cầu Admin/Host role từ 1.7.73.
6. HTML-encode `{{content:*}}` token values (hoặc per-token `allowHtml`).
7. DNN `Upload/List`: yêu cầu auth; sanitize SVG hoặc serve attachment.
8. `UserTemplateController`: thêm antiforgery + file-path whitelist.
9. `AiKnowledge*` controllers: bỏ class-level antiforgery; thêm antiforgery cho admin writes.

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

Codebase MegaForm sau build **1.7.73** đã **cải thiện đáng kể** so với Round 3: hầu hết các lỗ hổng SQL guard, SSRF, JWT, path traversal đã được khắc phục đúng, và trong commit `8101b0f` vừa rồi **P1-2/P1-11 (Oqtane `CanUseAdminPopup` yêu cầu Admin/Host) và P2-8 (inline-edit postMessage không tin `document.referrer`)** đã được fix. Tuy nhiên, **3 lỗ hổng P0 và 6 lỗ hổng P1 vẫn còn nguy hiểm**, trong đó có 2 surface unauthenticated (RazorWidget.Action DML, Payment tampering) và một loạt vấn đề CSRF class-level trên Web/Oqtane chưa được xử lý do rủi ro phá vỡ workflow.

**Không nên triển khai production** cho đến khi tất cả P0 và các P1 liên quan đến auth/CSRF/toàn vẹn dữ liệu được khắc phục.

Ưu tiên tuyệt đối: **P0-1, P0-2, P0-6**, sau đó là **P1-1, P1-2 (Web residual), P1-7, P1-9, P1-10, P1-12**.

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
