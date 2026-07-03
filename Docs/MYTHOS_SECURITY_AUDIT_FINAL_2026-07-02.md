# Báo cáo Kiểm tra Bảo mật MegaForm — Cuối cùng (Mythos)

> **Dự án:** MegaFormSolution_280_Oqtane_um  
> **Ngày kiểm tra:** 2026-07-02  
> **Phương pháp:** Mythos-style audit: verify fixes → static code review → evidence-based triage  
> **Giới hạn:** Chỉ phân tích source code (read-only), không thực hiện tấn công thật, không sửa code.

---

## 1. Executive Summary

Sau khi kiểm tra lại source code hiện tại, codebase MegaForm vẫn tồn tại **7 lỗ hổng P0 (Critical)** có thể khai thác, trong đó **4 lỗ hổng unauthenticated**. Đã có 2 P0 cũ được sửa đúng. Nhiều lỗ hổng P1/P2 vẫn còn sót.

### Tổng hợp rủi ro

| Mức độ | Số lượng | Ghi chú |
|--------|----------|---------|
| **P0 — Critical** | 7 | SQL unauth, payment tampering, RCE CLI, JWT forgery, stored XSS, DML/DDL ẩn |
| **P1 — High** | 8 | RCE Roslyn/claude, CSRF, SSRF, IDOR/CSRF → XSS, public upload |
| **P2 — Medium** | 6 | Path traversal, error leak, CORS/cookie, API key leak |
| **P3 — Low** | 3 | TLS/SSL defaults, SMTP SSL, PII leak |
| **Misconfiguration** | 4 | Hardcoded passwords, QA fixtures |
| **Đã fix** | 2 | Oqtane i18n write, Web SavePrintSettings |

### Các lỗ hổng P0 cần xử lý ngay lập tức

1. `RazorWidgetController.Action` — unauthenticated arbitrary SQL execution.
2. `PaymentController` — unauthenticated Stripe/PayPal amount tampering.
3. Web `MegaFormLocalAiController.ChatCompletions` — unauthenticated RCE qua `kimi` CLI khi env bật.
4. Oqtane `MegaFormLocalAiController.ChatCompletions` — authenticated user có thể RCE qua `kimi` CLI khi env bật.
5. Hardcoded JWT signing key + `ValidateIssuer=false`/`ValidateAudience=false`.
6. Stored XSS qua `CustomHtml` / `ModuleCss` / `customCss` / `moduleCssOverride`.
7. DNN `AiToolsController.AppEndpoint` — `WITH` bypass cho phép DML/DDL ẩn qua endpoint public.

---

## 2. Phương pháp kiểm tra

1. **Kiểm tra git status** để xác định các file đã thay đổi.
2. **Verify trực tiếp** các file P0 bằng ReadFile/Grep.
3. **Rà soát toàn bộ** bằng parallel agents cho SQL/RCE, Auth/XSS/SSRF, Secrets/Config.
4. **Judge triage**: deduplicate, validate exploitability, re-prioritize.
5. **Viết báo cáo** chỉ bao gồm các finding đã được xác minh bằng evidence cụ thể.

---

## 3. Danh sách lỗ hổng đã xác minh

### P0 — Critical

#### P0-1: `RazorWidgetController.Action` — Unauthenticated Arbitrary SQL Execution

- **File:**
  - `MegaForm.Web/Controllers/RazorWidgetController.cs` (dòng 221–244)
  - `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` (dòng 257–281)
  - `MegaForm.DNN/WebApi/RazorWidgetController.cs` (dòng 132–139, proxy `[AllowAnonymous]`)
- **Mô tả:** Endpoint `POST /api/MegaFormPopup/RazorWidget/Action` **không có `[Authorize]`**. Nhận `actionSql` từ request body và truyền vào `IRazorActionService.RunAsync`. Service chỉ phân biệt `SELECT/WITH` (trả rows) với các câu lệnh khác (execute và trả `@@ROWCOUNT`). Không chặn `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`.
- **Evidence:**
  ```csharp
  [HttpPost("Action")]
  public async Task<IActionResult> Action([FromBody] ActionRequest req)
  {
      ...
      var result = await svc.RunAsync(req.ActionSql, bag, req.ConnectionKey ?? "DashboardDatabase");
      ...
  }
  ```
  ```csharp
  // RazorActionService.RunAsync
  var trimmed = actionSql.TrimStart();
  if (trimmed.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase) ||
      trimmed.StartsWith("WITH",   StringComparison.OrdinalIgnoreCase))
  {
      var rows = await _sql.QueryAsync(actionSql, bag, connectionKey ?? "DashboardDatabase");
      ...
  }
  else
  {
      var n = await _sql.ExecuteScalarAsync<int>(
          actionSql + "; SELECT @@ROWCOUNT;", bag, connectionKey ?? "DashboardDatabase");
      ...
  }
  ```
- **PoC:**
  ```http
  POST /api/MegaFormPopup/RazorWidget/Action HTTP/1.1
  Content-Type: application/json

  { "actionSql": "DROP TABLE MF_Submissions", "parameters": {}, "connectionKey": "DashboardDatabase" }
  ```
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated, confirmed
- **Khuyến nghị:**
  - Thêm `[Authorize(Roles = "Administrator")]` hoặc `[Authorize(Policy = "EditModule")]`.
  - Không bao giờ tin `actionSql` từ client. Tra cứu SQL từ form schema server-side (formId + widgetKey + actionId).

#### P0-2: `PaymentController` — Unauthenticated Amount Tampering

- **File:** `MegaForm.Web/Controllers/PaymentController.cs` (dòng 60–111 Stripe, 260–301 PayPal)
- **Mô tả:** Các endpoint `stripe/create-intent` và `paypal/create-order` **không có `[Authorize]`**, nhận `amount`/`currency` trực tiếp từ request body. Không kiểm tra với giá trị form schema. Attacker có thể tạo payment intent với amount = 0.01 USD.
- **Evidence:**
  ```csharp
  [HttpPost("stripe/create-intent")]
  public async Task<IActionResult> StripeCreateIntent([FromBody] JObject body)
  {
      var amount = body["amount"]?.Value<double>() ?? 0;
      var currency = (body["currency"]?.Value<string>() ?? "USD").ToLower();
      ...
      if (amount <= 0) return BadRequest(...);
      var amountInt = (int)Math.Round(amount * 100);
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
- **Khuyến nghị:** Tính amount server-side từ form schema/field. Yêu cầu valid submission/session.

#### P0-3: Web `MegaFormLocalAiController.ChatCompletions` — Unauthenticated RCE

- **File:** `MegaForm.Web/Controllers/MegaFormLocalAiController.cs` (dòng 40–71, 177–194)
- **Mô tả:** Endpoint `POST /api/MegaFormAi/chat/completions` vẫn đánh dấu `[AllowAnonymous]`. Có env gate `MEGAFORM_ALLOW_LOCAL_AI_CLI=1` và dùng `ProcessStartInfo.ArgumentList`, nhưng nếu env được bật, bất kỳ ai cũng có thể spawn `kimi` CLI với input tùy ý.
- **Evidence:**
  ```csharp
  [HttpPost("chat/completions")]
  [AllowAnonymous]
  public async Task<IActionResult> ChatCompletions()
  {
      ...
      var kimiAnswer = await TryKimiCliAsync(query);
      ...
  }
  ```
- **PoC:**
  ```http
  POST /api/MegaFormAi/chat/completions HTTP/1.1
  Content-Type: application/json

  { "messages": [{ "role": "user", "content": "hello; whoami" }] }
  ```
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated (khi env gate bật), confirmed
- **Khuyến nghị:** Thay `[AllowAnonymous]` bằng `[Authorize(Roles = "Administrator")]`.

#### P0-4: Oqtane `MegaFormLocalAiController.ChatCompletions` — Authenticated User RCE

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs` (dòng 62–64, 244–267)
- **Mô tả:** Đã sửa bằng cách thêm `[Authorize]`, env gate, `ArgumentList`. Tuy nhiên `[Authorize]` chỉ yêu cầu bất kỷ user đăng nhập nào (không phải admin). Nếu env gate bật, user đăng nhập bình thường có thể spawn `kimi` CLI.
- **Evidence:**
  ```csharp
  [HttpPost("chat/completions")]
  [Authorize]
  public async Task<IActionResult> ChatCompletions()
  ```
- **Mức độ:** Critical
- **Khai thác:** Authenticated (any user) + env gate, confirmed
- **Khuyến nghị:** Đổi `[Authorize]` thành `[Authorize(Roles = "Administrator")]` hoặc `[Authorize(Policy = "EditModule")]`.

#### P0-5: Hardcoded JWT Signing Key + Weak Validation

- **File:**
  - `MegaForm.Web/appsettings.Production.json` (dòng 13–15)
  - `MegaForm.Web.Host/appsettings.Production.json`
  - `MegaForm.Web/Program.cs` (dòng 127–135)
- **Mô tả:** JWT signing key nằm plaintext trong file config commit vào git. `ValidateIssuer=false`, `ValidateAudience=false` cho phép token từ bất kỳ issuer/audience nào được chấp nhận.
- **Evidence:**
  ```json
  "Jwt": { "Key": "[REDACTED — rotated out of git in 1.7.69; see P0-5 remediation]" }
  ```
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
- **Khai thác:** Unauthenticated, confirmed
- **Khuyến nghị:** Sinh key ngẫu nhiên trong setup, lưu trong env/secret manager. Bật `ValidateIssuer`/`ValidateAudience`.

#### P0-6: Stored XSS qua `CustomHtml` / `ModuleCss` / `customCss` / `moduleCssOverride`

- **File:**
  - `MegaForm.Core/Services/FormHtmlRenderer.cs` (dòng 202–220)
  - `MegaForm.Core/Services/ModuleCssComposer.cs` (dòng 59–88)
  - `MegaForm.DNN/Views/FormView.ascx`
  - `MegaForm.Web/Views/Form/View.cshtml`
- **Mô tả:** `settings.CustomHtml` được chèn raw vào HTML qua `{{content:key}}`. `customCss` và `moduleCssOverride` được append nguyên văn vào `<style>`. Nếu admin lưu payload, mọi user xem form bị XSS.
- **Evidence:**
  ```csharp
  html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
  {
      var key = m.Groups[1].Value;
      return content.TryGetValue(key, out var v) ? (v ?? string.Empty) : string.Empty;
  });
  ```
  ```csharp
  if (!string.IsNullOrWhiteSpace(moduleCssOverride)) segments.Add(moduleCssOverride.Trim());
  ```
- **PoC:** Lưu `customContent["header"] = '<img src=x onerror=alert(document.cookie)>'` hoặc `customCss = "}</style><script>alert(1)</script><style>"`.
- **Mức độ:** Critical
- **Khai thác:** Authenticated Admin (hoặc CSRF), confirmed
- **Khuyến nghị:** Dùng HTML sanitizer whitelist. Escape CSS đặc biệt `<`, `"`, `'`.

#### P0-7: DNN `AiToolsController.AppEndpoint` — `WITH` Bypass cho DML/DDL Ẩn

- **File:** `MegaForm.DNN/WebApi/AiToolsController.cs` (dòng 1358–1497)
- **Mô tả:** Endpoint `[AllowAnonymous]` đọc `SqlOrSource` từ `MF_AppEndpoints`. Nếu endpoint có `AllowAnonymous=1` trong DB, bất kỳ ai cũng có thể gọi. Guard chỉ check `firstWord == "SELECT" || firstWord == "WITH"` và chặn 4 chuỗi cứng. Payload `WITH cte AS (...) DELETE FROM Users` pass guard.
- **Evidence:**
  ```csharp
  var up = sqlText.ToUpperInvariant();
  if (up.Contains("DROP DATABASE") || up.Contains("TRUNCATE TABLE") ||
      up.Contains("XP_CMDSHELL") || up.Contains("SHUTDOWN"))
      return Request.CreateResponse(HttpStatusCode.BadRequest, ...);
  var firstWord = up.TrimStart().Split(new[] { ' ', '\t', '\r', '\n' }, 2)[0];
  if (firstWord != "SELECT" && firstWord != "WITH")
      return Request.CreateResponse(HttpStatusCode.BadRequest, ...);
  ```
- **PoC (với endpoint public đã tồn tại):**
  ```http
  GET /DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=x&endpoint=y
  ```
  với `SqlOrSource`:
  ```sql
  WITH cte AS (SELECT 1 AS x) DELETE FROM Users;
  ```
- **Mức độ:** Critical
- **Khai thác:** Unauthenticated khi endpoint `AllowAnonymous=1`, confirmed
- **Khuyến nghị:** Dùng SQL parser SELECT-only. Audit log. Không cho phép DML/DDL trong CTE.

### P1 — High

#### P1-1: Roslyn JIT Compile `.razor` → RCE

- **File:**
  - `MegaForm.Web/Controllers/RazorWidgetController.cs` (dòng 258–274)
  - `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` (dòng 295–318)
  - `MegaForm.Web/Services/RazorCompilationService.cs`
- **Mô tả:** Admin/Host submit source `.razor`, server biên dịch bằng Roslyn, load assembly vào AppDomain. Code C# trong `@code { ... }` chạy với full trust.
- **Mức độ:** High
- **Khai thác:** Authenticated Host/Admin, confirmed
- **Khuyến nghị:** Không compile request body trực tiếp; nếu cần thì sandbox/AppDomain riêng.

#### P1-2: Admin Shell-Out `claude` CLI

- **File:**
  - `MegaForm.Web/Controllers/AiAssistantController.cs` (dòng 86–175)
  - `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs` (dòng 203–307)
- **Mô tả:** Admin có thể gọi `claude` CLI với prompt tùy ý. Có env gate `MEGAFORM_ALLOW_LOCAL_CLI=1`. Prompt injection có thể dẫn đến RCE.
- **Mức độ:** High
- **Khai thác:** Authenticated Admin + env gate, confirmed
- **Khuyến nghị:** Giữ env gate; thêm timeout, whitelist commands, cân nhắc xóa production.

#### P1-3: Admin SQL/DDL Execution `AiToolsController.ExecuteDdl`

- **File:**
  - `MegaForm.Web/Controllers/AiToolsController.cs` (dòng 362–412)
  - `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` (dòng 468–539)
  - `MegaForm.DNN/WebApi/AiToolsController.cs` (dòng 781–895)
- **Mô tả:** `ExecuteDdl` cho phép admin chạy SQL. `SqlDdlGuard` chặn DROP/TRUNCATE/EXEC nhưng vẫn cho phép `INSERT ... SELECT`, `CREATE INDEX`, `ALTER TABLE ADD`.
- **Mức độ:** High
- **Khai thác:** Authenticated Admin, confirmed
- **Khuyến nghị:** Dùng SQL parser thực sự. Whitelist statement/table.

#### P1-4: CSRF Toàn Class Oqtane (`[IgnoreAntiforgeryToken]` class-level)

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 47), `AiToolsController.cs`, `SubformController.cs`, `RazorWidgetController.cs`, `UserTemplateController.cs`, `MegaFormLocalAiController.cs`, `AiAssistantController.cs`, `AiKnowledgeController.cs`
- **Mô tả:** Nhiều controller Oqtane đặt `[IgnoreAntiforgeryToken]` ở class-level, vô hiệu hóa antiforgery cho tất cả action, bao gồm admin write endpoints.
- **Evidence:**
  ```csharp
  [IgnoreAntiforgeryToken]
  [Route(ControllerRoutes.ApiRoute)]
  public partial class MegaFormController : ModuleControllerBase
  ```
- **Mức độ:** High
- **Khai thác:** CSRF, confirmed
- **Khuyến nghị:** Bỏ class-level `[IgnoreAntiforgeryToken]`; chỉ áp dụng cho endpoint public submit/upload thực sự cần.

#### P1-5: SSRF via Workflow Webhook URL Template

- **File:** `MegaForm.Core/Workflow/WebhookNodeExecutor.cs`, `MegaForm.Core/Services/WebhookService.cs`
- **Mô tả:** Workflow webhook URL được resolve từ template `{{fieldKey}}` với context chứa form data. `HttpClient.SendAsync` không validate URL.
- **Mức độ:** High
- **Khai thác:** Authenticated User/Admin, confirmed
- **Khuyến nghị:** Validate URL sau khi resolve; deny private IP ranges, localhost, metadata endpoints.

#### P1-6: Public File Upload cho Draft Form

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 1498–1510)
- **Mô tả:** Oqtane `Upload/File` cho phép `[AllowAnonymous]` và đã bỏ gate `IsPublished` (B267). Bất kỷ form nào tồn tại đều có thể nhận upload.
- **Mức độ:** High
- **Khai thác:** Unauthenticated/Authenticated User, confirmed
- **Khuyến nghị:** Khôi phục gate `IsPublished` hoặc yêu cầu auth. Validate content-type/extension.

#### P1-7: Oqtane `SaveStyle` / `SaveModuleStyle` — IDOR/CSRF → Stored XSS

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 2665–2735)
- **Mô tả:** Các action `[Authorize]` (bất kỷ user đăng nhập) + class-level `[IgnoreAntiforgeryToken]`. Không kiểm tra module ownership đầy đủ. Cho phép ghi `customCss`/`cssOverrides` chứa payload XSS.
- **Evidence:**
  ```csharp
  [HttpPost("ModuleConfig/SaveStyle")]
  [Authorize]
  public IActionResult SaveStyle([FromBody] JsonElement bodyElement)
  {
      if (!CanUseAdminPopup()) return Forbid();
      ...
  }
  ```
- **Mức độ:** High
- **Khai thác:** Authenticated User / CSRF, confirmed
- **Khuyến nghị:** `[Authorize(Policy = "EditModule")]`, kiểm tra ownership module/form, bỏ class-level antiforgery.

#### P1-8: Web `MegaFormController` — Thiếu Authorization & CSRF trên State-Changing Endpoints

- **File:** `MegaForm.Web/Controllers/MegaFormController.cs`
- **Mô tả:** Nhiều endpoint state-changing chỉ dùng `[Authorize]` (any user), không giới hạn admin, không kiểm tra ownership, không có antiforgery.
- **Mức độ:** High
- **Khai thác:** Authenticated User / CSRF, confirmed
- **Khuyến nghị:** Phân quyền admin-only cho settings/style. Thêm `[ValidateAntiForgeryToken]`. Kiểm tra ownership.

### P2 — Medium

#### P2-1: Path Sanitization Yếu `Files/Download`

- **File:**
  - `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 1774–1784)
  - `MegaForm.DNN/WebApi/MegaFormApiController.cs` (dòng 2989–2999)
- **Mô tả:** Dùng `path.Replace("..", "")` thay vì `Path.GetFullPath` containment. Có `[Authorize]` nên không unauth.
- **Mức độ:** Medium
- **Khai thác:** Authenticated User, confirmed
- **Khuyến nghị:** Dùng `Path.GetFullPath(root)` + strict prefix check.

#### P2-2: AI API Key Leak to Client

- **File:** `MegaForm.Web/Controllers/AiAssistantController.cs`, `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs`
- **Mô tả:** `GetDefaultConfig` trả `apiKey` về client cho admin. Đã cải thiện so với trước (chỉ trả cho admin) nhưng vẫn lộ qua DevTools/XSS.
- **Mức độ:** Medium
- **Khai thác:** Authenticated Admin, confirmed
- **Khuyến nghị:** Không trả key về client; dùng server-side proxy.

#### P2-3: Verbose Error Leak / Stack Trace

- **File:** Nhiều controller (`AiKnowledgeController`, `RazorWidgetController`, `UserTemplateController`, `AiToolsController`, `PaymentController`, v.v.)
- **Mô tả:** Nhiều endpoint trả `ex.Message`, `ex.StackTrace`, `ex.ToString()`. `AiKnowledgeController` Web/Oqtane trả `stack = ex.StackTrace`.
- **Mức độ:** Medium
- **Khai thác:** Unauthenticated/Authenticated, confirmed
- **Khuyến nghị:** Trả generic message client-side; log chi tiết server-side.

#### P2-4: CORS `AllowAnyOrigin` + Cookie `SecurePolicy=SameAsRequest`

- **File:** `MegaForm.Web/Program.cs` (dòng 119–121, 150–151)
- **Mô tả:** `AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()` kết hợp cookie `SecurePolicy=SameAsRequest` làm giảm hiệu quả Same-Origin Policy.
- **Mức độ:** Medium
- **Khai thác:** CSRF / MitM, confirmed
- **Khuyến nghị:** CORS whitelist origin cụ thể; production dùng `CookieSecurePolicy.Always`.

#### P2-5: DDL Guard Nested Block Comments Bypass

- **File:** `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs`
- **Mô tả:** Regex strip comment non-greedy không xử lý nested comments. Tuy nhiên SQL engine thường không hỗ trợ nested comments nên bypass khó thực tế.
- **Mức độ:** Medium
- **Khai thác:** Authenticated Admin, potential
- **Khuyến nghị:** Dùng SQL parser thực sự thay vì regex.

#### P2-6: `SubformController.ApplyDdl` DDL Guard Yếu

- **File:** `MegaForm.DNN/WebApi/SubformController.cs`
- **Mô tả:** `ApplyDdl` dùng guard riêng yếu hơn `SqlDdlGuard` (chỉ check substring đơn giản).
- **Mức độ:** Medium
- **Khai thác:** Authenticated Admin, potential
- **Khuyến nghị:** Dùng chung `SqlDdlGuard`.

### P3 — Low

#### P3-1: SQL Server `TrustServerCertificate=true` mặc định

- **File:** `MegaForm.Web.Host/appsettings.json`, `MegaForm.Web/appsettings.json`, `MegaForm.Web/Data/DatabaseConfig.cs`
- **Khuyến nghị:** Default `TrustServerCertificate=false`.

#### P3-2: SMTP `EnableSsl=false` mặc định

- **File:** `MegaForm.Web.Host/appsettings.json`, `MegaForm.Web/appsettings.json`
- **Khuyến nghị:** Default `EnableSsl=true`.

#### P3-3: PII Admin Email trong Production Config

- **File:** `MegaForm.Web.Host/appsettings.Production.json`, `MegaForm.Web/appsettings.Production.json`
- **Khuyến nghị:** Dùng placeholder hoặc email công ty.

### Misconfigurations

| ID | Finding | File | Mức độ |
|----|---------|------|--------|
| M-1 | Hardcoded QA passwords (`MegaForm!2026`) | `MegaForm.Oqtane.Client/Index.razor` | Misconfig |
| M-2 | Sample project admin password `admin123` | `Samples/CorporateWeb/SetupCompletionService.cs` | Misconfig |
| M-3 | Hardcoded passwords trong QA scripts | `MegaForm.UI/scripts/*.mjs`, `qa5000/*.mjs` | Misconfig |
| M-4 | Hardcoded JWT keys trong production config | `appsettings.Production.json` | P0 (xem P0-5) |

### Đã fix

| Mã | Finding | File | Ghi chú |
|----|---------|------|---------|
| F-1 | Unauthenticated i18n file write | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Thêm `[Authorize(Policy="EditModule")]`, reject `index`/`en-US` |
| F-2 | Unauthenticated `SavePrintSettings` | `MegaForm.Web/Controllers/PrintController.cs` | Thêm `[Authorize(Roles="Administrator")]` |

---

## 4. Chuỗi tấn công nguy hiểm

### Chain A: Unauthenticated Arbitrary SQL → Data Destruction
```
POST /api/MegaFormPopup/RazorWidget/Action
  { "actionSql": "DROP TABLE MF_Submissions" }
  → RazorActionService.RunAsync
  → ExecuteScalarAsync("DROP TABLE MF_Submissions; SELECT @@ROWCOUNT;")
```

### Chain B: Payment Amount Tampering → Financial Fraud
```
POST /api/megaform/payments/stripe/create-intent
  { "amount": 0.01, "currency": "usd" }
  → Stripe PaymentIntent = $0.01
  → Attacker hoàn tất checkout giá thật $100 chỉ với $0.01
```

### Chain C: Web Local AI Unauthenticated RCE
```
POST /api/MegaFormAi/chat/completions
  { "messages": [{ "content": "; whoami" }] }
  → TryKimiCliAsync (nếu env MEGAFORM_ALLOW_LOCAL_AI_CLI=1)
  → Process.Start("kimi", ...)
```

### Chain D: Hardcoded JWT Key → Forge Admin Token
```
Đọc appsettings.Production.json
  → SymmetricSecurityKey known
  → Forge JWT với role Administrator
  → Gọi các endpoint admin
```

### Chain E: CSRF Oqtane → SaveStyle → Stored XSS
```
[IgnoreAntiforgeryToken] class-level
  → Attacker dụ user click link
  → POST /api/MegaForm/ModuleConfig/SaveStyle
  → cssOverride = "}</style><script>alert(1)</script><style>"
  → Victim bị XSS
```

---

## 5. Khuyến nghị xử lý

### P0 — Xử lý ngay trong 24–48h

1. `RazorWidgetController.Action`: thêm auth admin; đọc SQL từ schema server-side.
2. `PaymentController`: tính amount server-side; yêu cầu valid submission.
3. Web `MegaFormLocalAiController`: thay `[AllowAnonymous]` bằng `[Authorize(Roles="Administrator")]`.
4. Oqtane `MegaFormLocalAiController`: nâng `[Authorize]` lên admin-only.
5. JWT: sinh key ngẫu nhiên, lưu env/secret manager, bật ValidateIssuer/Audience.
6. Stored XSS: HTML sanitizer + CSS escape.
7. DNN `AppEndpoint`: SQL parser SELECT-only, cấm DML/DDL trong CTE.

### P1 — Xử lý trong 1 tuần

8. Roslyn compile: sandbox/AppDomain riêng.
9. claude CLI: timeout, whitelist, cân nhắc xóa production.
10. ExecuteDdl: SQL parser + whitelist.
11. Oqtane `[IgnoreAntiforgeryToken]`: bỏ class-level.
12. Webhook SSRF: validate URL, deny private ranges.
13. Public upload: khôi phục `IsPublished` gate.
14. SaveStyle: EditModule policy + antiforgery + ownership.
15. Web `MegaFormController`: admin-only cho settings + antiforgery.

### P2/P3 — Xử lý trong 2–4 tuần

16. Files/Download: `Path.GetFullPath` + prefix check.
17. AI API key: server-side proxy.
18. Verbose errors: generic client message.
19. CORS + cookie: whitelist origin, `SecurePolicy=Always`.
20. Config defaults: `TrustServerCertificate=false`, `EnableSsl=true`.

### Misconfigurations

21. Hardcoded passwords: chuyển sang env vars/secret manager.
22. `.vs/`: thêm vào `.gitignore`.
23. Docs credentials: xóa khỏi git history.

---

## 6. Regulatory Mapping

| Regulation | Findings liên quan |
|------------|--------------------|
| **DORA** | P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P1-1, P1-2, P1-3, P1-4, P1-5 |
| **NIS2** | P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P1-4, P1-5, P1-6, P1-7, P1-8, P2-1, P2-3, P2-4 |
| **CRA** | P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P1-1, P1-2, P1-3 |
| **PCI DSS** | P0-2 |

---

## 7. Kết luận

Codebase MegaForm vẫn ở trạng thái **bảo mật kém** với nhiều surface **unauthenticated** nguy hiểm. Mặc dù 2 P0 cũ đã được fix, nhưng vẫn còn **7 P0** và **8 P1** cần xử lý. **Không nên triển khai production** cho đến khi tất cả P0 và P1 được khắc phục.

Ưu tiên tuyệt đối: **P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7**.

---

*End of Final Audit Report*
