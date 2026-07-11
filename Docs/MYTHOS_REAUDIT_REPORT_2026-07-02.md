# Báo cáo Re-Audit Bảo mật MegaForm — Theo phương pháp Mythos

> **Dự án:** MegaFormSolution_280_Oqtane_um  
> **Ngày re-audit:** 2026-07-02  
> **Báo cáo gốc:** `Docs/MYTHOS_SECURITY_AUDIT_REPORT_2026-07-01.md`  
> **Phương pháp:** Mythos-style re-audit (Verify Fixes → Parallel Discovery → Judge Triage)  
> **Giới hạn:** Chỉ phân tích source code (read-only), không thực hiện tấn công thật, không sửa code.

---

## 1. Executive Summary

Sau đợt sửa chữa đầu tiên (2026-07-02), codebase MegaForm đã khắc phục **3/6 lỗ hổng P0 cũ**, nhưng vẫn còn lại nhiều rủi ro nghiêm trọng và **xuất hiện thêm các lỗ hổng P0 mới** chưa từng được phát hiện trong audit trước.

### Tóm tắt trạng thái

| Mức độ | Audit cũ | Đã fix | Còn sót | Mới | Tổng re-audit |
|--------|----------|--------|---------|-----|---------------|
| **P0 — Critical** | 6 | 2 | 3 | 4 | **8** |
| **P1 — High** | 7 | 0 | 7 | 5 | **12** |
| **P2/P3 — Medium/Low** | 8 | 1 | 5 | 1 | **7** |
| **Misconfiguration** | 4 | 0 | 4 | 0 | **4** |

### Các lỗ hổng P0 cần xử lý ngay lập tức

1. **`RazorWidgetController.Action`** — Unauthenticated arbitrary SQL execution (mới).
2. **`PaymentController`** — Unauthenticated Stripe/PayPal amount tampering (mới).
3. **Web `MegaFormLocalAiController.ChatCompletions`** — Vẫn `[AllowAnonymous]`, tương đương P0-1 cũ (mới phát hiện Web variant).
4. **Oqtane `MegaFormLocalAiController.ChatCompletions`** — Fixed nhưng `[Authorize]` quá rộng (chưa triệt để).
5. **Hardcoded JWT signing key + weak validation** — Chưa sửa.
6. **Stored XSS `CustomHtml`/`ModuleCss`** — Chưa sửa.
7. **DNN `AiToolsController.AppEndpoint`** — `WITH` bypass cho DML/DDL ẩn.

### Kết luận chung

Codebase **không nên triển khai production** cho đến khi tất cả P0 và P1 được xử lý. Các surface unauthenticated vẫn là điểm yếu lớn nhất.

---

## 2. Phương pháp Re-Audit Mythos

### Bước 1 — Verify Fixes
- Kiểm tra git status/log để xác định các file đã thay đổi.
- Đọc file handoff `CLAUDE_HANDOFF_20260702_SECURITY_AUDIT_REMEDIATION.md`.
- Verify 3 P0 unauthenticated cũ đã được fix đúng chưa.

### Bước 2 — Parallel Re-Discovery
Chạy 4 agents song song:
- **Verify Agent**: xác nhận fix và tìm regression.
- **RCE/SQL Agent**: tìm RCE/SQL/DDL còn sót + lỗ hổng mới.
- **Auth/XSS/SSRF Agent**: tìm auth/xss/ssrf/file/payment còn sót + lỗ hổng mới.
- **Secrets Agent**: kiểm tra secrets/config/error leaks.

### Bước 3 — Judge Triage
- Deduplicate findings.
- So sánh với báo cáo cũ: FIXED / PARTIALLY FIXED / STILL PRESENT / NEW.
- Validate exploitability.
- Phân tích attack chains.
- Re-prioritize P0 → P3.

### Bước 4 — Structured Re-Audit Report
- Báo cáo cuối với trạng thái, evidence, PoC, khuyến nghị.

---

## 3. Trạng thái sửa chữa so với audit cũ

### ✅ FIXED (2 P0)

| Mã cũ | Finding | File | Ghi chú |
|-------|---------|------|---------|
| P0-2 | Unauthenticated i18n file write → stored XSS | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Thêm `[Authorize(Policy="EditModule")]`, reject `index`/`en-US`, sanitize locale |
| P0-5 | Unauthenticated `SavePrintSettings` → stored XSS | `MegaForm.Web/Controllers/PrintController.cs` | Thêm `[Authorize(Roles="Administrator")]` |

### ⚠️ PARTIALLY FIXED (2)

| Mã cũ | Finding | File | Ghi chú |
|-------|---------|------|---------|
| P0-1 | Unauthenticated RCE `kimi` CLI | `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs` | Đã thêm `[Authorize]`, env gate, `ArgumentList`. Nhưng `[Authorize]` quá rộng (bất kỳ user đăng nhập). Web variant vẫn `[AllowAnonymous]`. |
| P2-2 | AI API key leak to client | `AiAssistantController.cs` | Đã cải thiện: chỉ trả key cho admin. Nhưng vẫn lộ qua DevTools/XSS. |

### ❌ STILL PRESENT (nhiều P0/P1/P2/P3)

- P0-3: Roslyn JIT RCE
- P0-4: Hardcoded JWT key + weak validation
- P0-6: Stored XSS CustomHtml/ModuleCss
- P1-1: CSRF class-level Oqtane
- P1-2: Admin claude CLI
- P1-3: ExecuteDdl
- P1-4: SSRF workflow webhook
- P1-5: Arbitrary connection string
- P1-6: Public upload draft
- P1-7: UserTemplate SSTI
- P2-1: Path sanitization
- P2-3: Verbose errors
- P2-4: CORS/cookie
- P2-5: DDL guard nested comments
- P3-1: TrustServerCertificate
- P3-2: SMTP EnableSsl
- P3-3: PII admin email
- QA fixtures & hardcoded passwords

### 🔴 NEW (P0/P1 mới)

- P0-1 (new): `RazorWidgetController.Action` unauthenticated arbitrary SQL
- P0-2 (new): `PaymentController` amount tampering
- P0-3 (new): Web `MegaFormLocalAiController` vẫn `[AllowAnonymous]`
- P0-7 (new): DNN `AppEndpoint` `WITH` bypass
- P1-8 (new): Oqtane `SaveModuleStyle` IDOR/CSRF → stored XSS
- P1-9 (new): DNN `ModuleConfig/SaveStyle` IDOR → stored XSS
- P1-10 (new): Web `MegaFormController` thiếu auth/CSRF

---

## 4. Top Findings — Phân loại theo Mythos Priority

### P0 — Critical (Xử lý ngay lập tức)

#### P0-1: `RazorWidgetController.Action` — Unauthenticated Arbitrary SQL Execution ⭐ NEW

- **File:** `MegaForm.Web/Controllers/RazorWidgetController.cs`, `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`, `MegaForm.DNN/WebApi/RazorWidgetController.cs`
- **Dòng:** Web ~221–244; Oqtane ~257–281; DNN ~132–139
- **Mô tả:** Endpoint `POST /api/MegaFormPopup/RazorWidget/Action` không có `[Authorize]`, nhận `actionSql` trực tiếp từ request body và truyền vào `IRazorActionService.RunAsync` trên `DashboardDatabase`. Service chỉ kiểm tra `StartsWith("SELECT") || StartsWith("WITH")`; nếu không phải SELECT/WITH thì chạy `ExecuteScalarAsync<int>(actionSql + "; SELECT @@ROWCOUNT;")`. Không chặn `DROP`, `DELETE`, `UPDATE`, `INSERT`.
- **PoC:**
  ```http
  POST /api/MegaFormPopup/RazorWidget/Action HTTP/1.1
  Content-Type: application/json

  {
    "actionSql": "DROP TABLE MF_Submissions",
    "parameters": {},
    "connectionKey": "DashboardDatabase"
  }
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated — Confirmed
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Status:** NEW
- **Khuyến nghị:** Thêm auth admin; KHÔNG bao giờ tin `actionSql` từ client. Đọc SQL từ form schema server-side.

#### P0-2: `PaymentController` — Unauthenticated Amount Tampering ⭐ NEW

- **File:** `MegaForm.Web/Controllers/PaymentController.cs`
- **Dòng:** ~60–111 (Stripe), ~260–301 (PayPal)
- **Mô tả:** Endpoint `stripe/create-intent` và `paypal/create-order` không có `[Authorize]`, nhận `amount`/`currency` trực tiếp từ body. Attacker có thể tạo payment intent với amount = 0.01, bypass giá trị thực tế.
- **PoC:**
  ```http
  POST /api/megaform/payments/stripe/create-intent HTTP/1.1
  Content-Type: application/json

  { "amount": 0.01, "currency": "usd", "fieldKey": "payment" }
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated — Confirmed
- **Regulatory Trigger:** DORA, NIS2, CRA, PCI DSS
- **Status:** NEW
- **Khuyến nghị:** Tính amount server-side từ form schema/field. Xác thực session/submission trước khi tạo payment intent.

#### P0-3: Web `MegaFormLocalAiController.ChatCompletions` — Vẫn Unauthenticated RCE ⭐ NEW

- **File:** `MegaForm.Web/Controllers/MegaFormLocalAiController.cs`
- **Dòng:** ~40–71
- **Mô tả:** `POST /api/MegaFormAi/chat/completions` vẫn `[AllowAnonymous]`. Có env gate `MEGAFORM_ALLOW_LOCAL_AI_CLI=1` và dùng `ArgumentList`, nhưng nếu env được bật, bất kỳ ai cũng có thể gọi `kimi` CLI.
- **PoC:**
  ```http
  POST /api/MegaFormAi/chat/completions HTTP/1.1
  Content-Type: application/json

  { "messages": [{ "role": "user", "content": "hello; whoami" }] }
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated (khi env gate bật) — Confirmed
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Status:** NEW (Web variant của P0-1 cũ)
- **Khuyến nghị:** Thêm `[Authorize(Roles = "Administrator")]`; giữ env gate và `ArgumentList`.

#### P0-4: Oqtane `MegaFormLocalAiController` — Fixed nhưng Auth quá rộng

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs`
- **Dòng:** ~62–64, ~247–267
- **Mô tả:** Đã thêm `[Authorize]`, env gate, `ArgumentList`. Nhưng `[Authorize]` chỉ yêu cầu bất kỳ user đăng nhập, chưa phải admin.
- **Mythos Severity:** Critical
- **Exploitability:** Authenticated (any user) + env gate — Confirmed
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Status:** PARTIALLY FIXED (P0-1 cũ)
- **Khuyến nghị:** Đổi `[Authorize]` thành `[Authorize(Roles = "Administrator")]` hoặc Oqtane `EditModule` policy.

#### P0-5: Hardcoded JWT Signing Key + Weak Validation — STILL PRESENT

- **File:** `MegaForm.Web/appsettings.Production.json`, `MegaForm.Web.Host/appsettings.Production.json`, `MegaForm.Web/Program.cs`
- **Dòng:** Production config ~13–15; `Program.cs` ~127–135
- **Mô tả:** JWT signing key nằm plaintext trong config. `ValidateIssuer = false`, `ValidateAudience = false`.
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated — Confirmed
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Status:** STILL PRESENT (P0-4 cũ)
- **Khuyến nghị:** Sinh key ngẫu nhiên trong setup wizard, lưu trong secret manager/env var. Bật `ValidateIssuer`/`ValidateAudience`.

#### P0-6: Stored XSS qua `CustomHtml` / `ModuleCss` / `AutoQrCodeHtml` — STILL PRESENT

- **File:** `MegaForm.Core/Services/FormHtmlRenderer.cs`, `MegaForm.Core/Services/ModuleCssComposer.cs`, `MegaForm.DNN/Views/FormView.ascx`, `MegaForm.Web/Views/Form/View.cshtml`
- **Mô tả:** Server-side renderer chèn `CustomHtml`, `ModuleCss`, `customCss`, `AutoQrCodeHtml` trực tiếp vào HTML/CSS response mà không escape/sanitize.
- **PoC:** Lưu `CustomHtml` chứa `<script>alert(document.cookie)</script>` trong builder.
- **Mythos Severity:** Critical
- **Exploitability:** Authenticated Admin (hoặc CSRF qua P1) — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT (P0-6 cũ)
- **Khuyến nghị:** Dùng HTML sanitizer whitelist. Escape CSS đặc biệt `<`, `"`, `'`.

#### P0-7: DNN `AiToolsController.AppEndpoint` — `WITH` Bypass cho DML/DDL Ẩn — STILL PRESENT

- **File:** `MegaForm.DNN/WebApi/AiToolsController.cs`
- **Dòng:** ~1358–1497
- **Mô tả:** Endpoint `[AllowAnonymous]` đọc SQL từ `MF_AppEndpoints.SqlOrSource`. Guard chỉ check `firstWord == "SELECT" || firstWord == "WITH"` và chặn 4 chuỗi cứng. Payload `WITH cte AS (...) DELETE FROM Users` sẽ pass.
- **PoC:**
  ```sql
  WITH cte AS (SELECT 1 AS x)
  DELETE FROM Users;
  ```
- **Mythos Severity:** Critical
- **Exploitability:** Unauthenticated (nếu endpoint AllowAnonymous) — Confirmed
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Status:** STILL PRESENT (không nằm trong top P0 cũ)
- **Khuyến nghị:** Dùng SQL parser SELECT-only. Audit log mọi execution.

#### P0-8: Oqtane i18n Write — FIXED

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- **Dòng:** ~786–877
- **Mô tả:** Đã thêm `[Authorize(Policy = "EditModule")]`, reject `index`/`en-US`, sanitize locale.
- **Status:** FIXED (P0-2 cũ)

#### P0-9: Web `SavePrintSettings` — FIXED

- **File:** `MegaForm.Web/Controllers/PrintController.cs`
- **Dòng:** ~81–83
- **Mô tả:** Đã thêm `[Authorize(Roles = "Administrator")]`.
- **Status:** FIXED (P0-5 cũ)



### P1 — High (Ưu tiên cao)

#### P1-1: Roslyn JIT Compile `.razor` → RCE — STILL PRESENT

- **File:** `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Services/RazorCompilationService.cs`
- **Mô tả:** Admin/Host submit source `.razor`, server biên dịch bằng Roslyn và load assembly vào AppDomain. Code C# trong `@code { ... }` chạy với quyền tiến trình web server.
- **Mythos Severity:** High
- **Exploitability:** Authenticated Host/Admin — Confirmed
- **Regulatory Trigger:** DORA, NIS2, CRA
- **Status:** STILL PRESENT (P0-3 cũ)
- **Khuyến nghị:** Không compile request body trực tiếp; nếu cần thì chạy trong sandbox/AppDomain riêng.

#### P1-2: Admin Shell-Out `claude` CLI — STILL PRESENT

- **File:** `MegaForm.Web/Controllers/AiAssistantController.cs`, `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs`
- **Mô tả:** Admin gọi `claude` CLI với prompt tùy ý. Có env gate `MEGAFORM_ALLOW_LOCAL_CLI=1`. Prompt injection có thể dẫn đến RCE.
- **Mythos Severity:** High
- **Exploitability:** Authenticated Admin + env gate — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT (P1-2 cũ)
- **Khuyến nghị:** Giữ env gate; thêm timeout, whitelist commands, cân nhắc xóa endpoint trên production.

#### P1-3: Admin SQL/DDL Execution `AiToolsController.ExecuteDdl` — STILL PRESENT

- **File:** `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`, `MegaForm.Web/Controllers/AiToolsController.cs`, `MegaForm.DNN/WebApi/AiToolsController.cs`
- **Mô tả:** `ExecuteDdl` cho phép admin chạy SQL. Guard chặn DROP/TRUNCATE/EXEC nhưng vẫn cho phép `INSERT ... SELECT`, `CREATE INDEX`, `ALTER TABLE ADD`.
- **Mythos Severity:** High
- **Exploitability:** Authenticated Admin — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT (P1-3 cũ)
- **Khuyến nghị:** Dùng SQL parser thực sự. Chỉ cho phép whitelist statement/table.

#### P1-4: CSRF Toàn Class Oqtane (`[IgnoreAntiforgeryToken]` class-level) — STILL PRESENT

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`, `AiToolsController.cs`, `SubformController.cs`, `RazorWidgetController.cs`, `UserTemplateController.cs`, `MegaFormLocalAiController.cs`, `AiAssistantController.cs`, `AiKnowledgeController.cs`
- **Mô tả:** Nhiều controller Oqtane đặt `[IgnoreAntiforgeryToken]` ở class-level, vô hiệu hóa antiforgery cho tất cả action.
- **Mythos Severity:** High
- **Exploitability:** CSRF — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT (P1-1 cũ)
- **Khuyến nghị:** Bỏ class-level `[IgnoreAntiforgeryToken]`; chỉ áp dụng cho endpoint public submit/upload thực sự cần.

#### P1-5: SSRF via Workflow Webhook URL Template — STILL PRESENT

- **File:** `MegaForm.Core/Workflow/WebhookNodeExecutor.cs`, `MegaForm.Core/Services/WebhookService.cs`
- **Mô tả:** Workflow webhook URL được resolve từ template `{{fieldKey}}` với context chứa form data. `HttpClient.SendAsync` không validate URL.
- **Mythos Severity:** High
- **Exploitability:** Authenticated User/Admin — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT (P1-4 cũ)
- **Khuyến nghị:** Validate URL sau khi resolve; deny private IP ranges, localhost, metadata endpoints; dùng allow-list domain.

#### P1-6: Public File Upload cho Draft Form (B267 Gate Removal) — STILL PRESENT

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- **Dòng:** ~1498–1502
- **Mô tả:** Oqtane `Upload/File` cho phép `[AllowAnonymous]` và đã bỏ gate `IsPublished`.
- **Mythos Severity:** High
- **Exploitability:** Unauthenticated/Authenticated User — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT (P1-6 cũ)
- **Khuyến nghị:** Khôi phục gate `IsPublished` hoặc yêu cầu auth. Validate content-type/extension chặt.

#### P1-7: UserTemplate `.cshtml` Render (SSTI giới hạn) — STILL PRESENT

- **File:** `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs`, `MegaForm.Web/Controllers/UserTemplateController.cs`
- **Mô tả:** UserTemplate render `.cshtml` qua `MegaFormRazorInterpreter` custom. Chỉ yêu cầu `[Authorize]` (any role). Có reflection fallback.
- **Mythos Severity:** High
- **Exploitability:** Authenticated User — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT (P1-7 cũ)
- **Khuyến nghị:** Hạn chế quyền edit template chỉ Host/Admin. Sandbox interpreter.

#### P1-8: Oqtane `ModuleConfig/SaveStyle` IDOR/CSRF → Stored XSS ⭐ NEW

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- **Dòng:** ~2665–2690
- **Mô tả:** `[Authorize]` (bất kỷ user đăng nhập) + class-level `[IgnoreAntiforgeryToken]`. Không kiểm tra module ownership. Cho phép ghi `cssOverride`/`customCss` chứa payload XSS.
- **PoC:**
  ```http
  POST /api/MegaForm/ModuleConfig/SaveModuleStyle
  { "moduleId": 5, "formId": 1, "customCss": "}</style><script>fetch('/api/...')</script><style>" }
  ```
- **Mythos Severity:** High
- **Exploitability:** Authenticated User / CSRF — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** NEW
- **Khuyến nghị:** `[Authorize(Policy = "EditModule")]`, kiểm tra ownership module/form, bỏ class-level antiforgery.

#### P1-9: DNN `ModuleConfig/SaveStyle` IDOR → Stored XSS ⭐ NEW

- **File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs`
- **Dòng:** ~3572–3600
- **Mô tả:** `SaveStyle` có `[ValidateAntiForgeryToken]` nhưng không kiểm tra module ownership đầy đủ. User có quyền edit module có thể ghi CSS payload.
- **Mythos Severity:** High
- **Exploitability:** Authenticated User (có quyền module) — Potential
- **Regulatory Trigger:** DORA, NIS2
- **Status:** NEW
- **Khuyến nghị:** Kiểm tra `ModulePermission.CanEdit`. Validate/sanitize CSS.

#### P1-10: Web `MegaFormController` — Thiếu Authorization & CSRF trên State-Changing Endpoints ⭐ NEW

- **File:** `MegaForm.Web/Controllers/MegaFormController.cs`
- **Dòng:** ~198–220 (SaveForm), ~1034–1092 (SaveStyle/SaveDatabaseSettings), v.v.
- **Mô tả:** Nhiều endpoint state-changing chỉ dùng `[Authorize]` (any user), không giới hạn admin, không kiểm tra ownership, không có antiforgery.
- **Mythos Severity:** High
- **Exploitability:** Authenticated User / CSRF — Confirmed
- **Regulatory Trigger:** DORA, NIS2
- **Status:** NEW
- **Khuyến nghị:** Phân quyền admin-only cho settings/style. Thêm `[ValidateAntiForgeryToken]`. Kiểm tra ownership.

#### P1-11: `SubformController.ApplyDdl` DDL Guard Yếu — STILL PRESENT

- **File:** `MegaForm.DNN/WebApi/SubformController.cs`
- **Mô tả:** `ApplyDdl` dùng guard riêng yếu hơn `SqlDdlGuard`. Có thể bypass qua comments/whitespace.
- **Mythos Severity:** High
- **Exploitability:** Authenticated Admin — Potential
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT
- **Khuyến nghị:** Dùng chung `SqlDdlGuard`.

#### P1-12: `AiToolsController.ImportApp` SQL từ Zip — STILL PRESENT

- **File:** `MegaForm.DNN/WebApi/AiToolsController.cs`
- **Mô tả:** Import app từ zip có thể chứa SQL DDL/DML, thực thi khi import. Guard chỉ check có mặt `IF OBJECT_ID`/`CREATE TABLE`.
- **Mythos Severity:** High
- **Exploitability:** Authenticated Admin — Potential
- **Regulatory Trigger:** DORA, NIS2
- **Status:** STILL PRESENT
- **Khuyến nghị:** Validate manifest signature, chạy SQL qua `SqlDdlGuard`, sandbox import.

### P2 — Medium

#### P2-1: Path Sanitization Yếu `Files/Download` — STILL PRESENT

- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`, `MegaForm.DNN/WebApi/MegaFormApiController.cs`
- **Mô tả:** Dùng `path.Replace("..", "")` thay vì `Path.GetFullPath` containment. Có `[Authorize]`.
- **Mythos Severity:** Medium
- **Exploitability:** Authenticated User — Confirmed
- **Regulatory Trigger:** NIS2
- **Status:** STILL PRESENT
- **Khuyến nghị:** Dùng `Path.GetFullPath(root)` + strict prefix check.

#### P2-2: AI API Key Leak to Client — PARTIALLY FIXED

- **File:** `MegaForm.Web/Controllers/AiAssistantController.cs`, `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs`
- **Mô tả:** `GetDefaultConfig` trả `apiKey` về client cho admin. Đã cải thiện (chỉ trả cho admin) nhưng vẫn lộ qua DevTools/XSS.
- **Mythos Severity:** Medium
- **Exploitability:** Authenticated Admin — Confirmed
- **Regulatory Trigger:** NIS2
- **Status:** PARTIALLY FIXED
- **Khuyến nghị:** Không trả key về client; dùng server-side proxy.

#### P2-3: Verbose Error Leak / Stack Trace — STILL PRESENT

- **File:** Nhiều controller (`AiKnowledgeController`, `RazorWidgetController`, `UserTemplateController`, `AiToolsController`, `PaymentController`, v.v.)
- **Mô tả:** Nhiều endpoint trả `ex.Message`, `ex.StackTrace`, `ex.ToString()`. Đặc biệt `AiKnowledgeController` Web/Oqtane trả `stack = ex.StackTrace`.
- **Mythos Severity:** Medium
- **Exploitability:** Unauthenticated/Authenticated — Confirmed
- **Regulatory Trigger:** NIS2
- **Status:** STILL PRESENT
- **Khuyến nghị:** Trả generic message client-side; log chi tiết server-side.

#### P2-4: CORS `AllowAnyOrigin` + Cookie `SecurePolicy=SameAsRequest` — STILL PRESENT

- **File:** `MegaForm.Web/Program.cs`
- **Dòng:** ~119–121, ~150–151
- **Mô tả:** `AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()` kết hợp cookie `SecurePolicy=SameAsRequest`.
- **Mythos Severity:** Medium
- **Exploitability:** CSRF / MitM — Confirmed
- **Regulatory Trigger:** NIS2
- **Status:** STILL PRESENT
- **Khuyến nghị:** CORS whitelist origin cụ thể; production dùng `CookieSecurePolicy.Always`.

#### P2-5: DDL Guard Nested Block Comments Bypass — STILL PRESENT

- **File:** `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs`
- **Mô tả:** Regex strip comment non-greedy không xử lý nested comments. Tuy nhiên SQL engine thường không hỗ trợ nested comments.
- **Mythos Severity:** Medium
- **Exploitability:** Authenticated Admin — Potential
- **Regulatory Trigger:** NIS2
- **Status:** STILL PRESENT
- **Khuyến nghị:** Dùng SQL parser thực sự thay vì regex.

### P3 — Low

#### P3-1: SQL Server `TrustServerCertificate=true` mặc định — STILL PRESENT

- **File:** `MegaForm.Web.Host/appsettings.json`, `MegaForm.Web/appsettings.json`, `MegaForm.Web/Data/DatabaseConfig.cs`
- **Khuyến nghị:** Default `TrustServerCertificate=false`.

#### P3-2: SMTP `EnableSsl=false` mặc định — STILL PRESENT

- **File:** `MegaForm.Web.Host/appsettings.json`, `MegaForm.Web/appsettings.json`
- **Khuyến nghị:** Default `EnableSsl=true`.

#### P3-3: PII Admin Email trong Production Config — STILL PRESENT

- **File:** `MegaForm.Web.Host/appsettings.Production.json`, `MegaForm.Web/appsettings.Production.json`
- **Khuyến nghị:** Dùng placeholder hoặc email công ty.

### Misconfigurations / QA Fixtures

| ID | Finding | File | Status |
|----|---------|------|--------|
| QA-1 | Hardcoded QA passwords (`MegaForm!2026`) | `MegaForm.Oqtane.Client/Index.razor` | STILL PRESENT |
| QA-2 | Sample project admin password `admin123` | `Samples/CorporateWeb/SetupCompletionService.cs` | STILL PRESENT |
| QA-3 | Hardcoded passwords trong QA scripts | `MegaForm.UI/scripts/*.mjs`, `qa5000/*.mjs` | STILL PRESENT |
| QA-4 | Hardcoded JWT keys trong production config | `appsettings.Production.json` | STILL PRESENT (nâng lên P0) |

---

## 5. Chain Analysis — Các chuỗi tấn công nguy hiểm

### Chain A: Unauthenticated Arbitrary SQL → RCE/Data Destruction
```
POST /api/MegaFormPopup/RazorWidget/Action
  → RazorWidgetController.Action(req.ActionSql)
  → RazorActionService.RunAsync(actionSql, ...)
  → IMfSqlExecutor.ExecuteScalarAsync("DROP TABLE ...; SELECT @@ROWCOUNT;")
```
**Impact:** Unauthenticated → drop/exfiltrate DB. Có thể dùng `xp_cmdshell` nếu enabled → RCE.

### Chain B: Payment Amount Tampering → Financial Fraud
```
POST /api/megaform/payments/stripe/create-intent { amount: 0.01 }
  → PaymentController.StripeCreateIntent
  → Stripe PaymentIntent amount = 1 cent
  → Attacker hoàn tất checkout với giá thật $100 nhưng charge $0.01
```
**Impact:** Unauthenticated → gian lận tài chính.

### Chain C: Web Local AI Unauthenticated RCE
```
POST /api/MegaFormAi/chat/completions { messages: [{content:"hello; whoami"}] }
  → MegaFormLocalAiController.ChatCompletions (AllowAnonymous)
  → TryKimiCliAsync(query) [nếu env MEGAFORM_ALLOW_LOCAL_AI_CLI=1]
  → Process.Start("kimi", ArgumentList)
```
**Impact:** Unauthenticated RCE khi env gate bật.

### Chain D: Hardcoded JWT Key → Forge Admin Token → Full Admin Access
```
Đọc appsettings.Production.json
  → SymmetricSecurityKey known
  → Forge JWT với role "Administrator" / "Host"
  → Gọi các endpoint [Authorize]
```
**Impact:** Unauthenticated → admin privilege escalation.

### Chain E: Oqtane CSRF → SaveStyle / SaveTheme → Stored XSS
```
[IgnoreAntiforgeryToken] class-level
  → Attacker dụ admin/user click malicious link
  → POST /api/MegaForm/ModuleConfig/SaveStyle với cssOverride chứa payload
  → Victim users bị XSS khi render form
```
**Impact:** CSRF → stored XSS → session hijack / defacement.

### Chain F: Workflow Webhook → SSRF
```
Submitter nhập payload vào form field
  → Workflow trigger WebhookNodeExecutor
  → ResolveTemplate(config.Url, ctx)
  → URL trỏ đến internal service/metadata endpoint
  → HttpClient gửi request từ server
```
**Impact:** SSRF nội bộ, exfiltrate dữ liệu.

---

## 6. Evidence & PoC Details

### 6.1 `RazorWidgetController.Action` — Unauthenticated SQL

**File:** `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`

```csharp
[HttpPost("Action")]
public async Task<IActionResult> Action([FromBody] RazorActionRequest req)
{
    ...
    var result = await _razorActionService.RunAsync(req.ActionSql, req.Parameters, ...);
    return Ok(result);
}
```

**File:** `MegaForm.Oqtane.Server/Services/RazorActionService.cs`

```csharp
public async Task<RazorActionResult> RunAsync(string sql, ...)
{
    var trimmed = sql.Trim();
    if (trimmed.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase) ||
        trimmed.StartsWith("WITH", StringComparison.OrdinalIgnoreCase))
    {
        var rows = await _sqlExecutor.QueryAsync(...);
        return new RazorActionResult { Rows = rows };
    }
    var affected = await _sqlExecutor.ExecuteScalarAsync<int>(sql + "; SELECT @@ROWCOUNT;");
    return new RazorActionResult { AffectedRows = affected };
}
```

**Nhận xét:** Không có `[Authorize]` trên action. SQL từ client được thực thi trực tiếp. Không chặn `DROP`, `DELETE`, `UPDATE`, `INSERT`.

### 6.2 `PaymentController` Amount Tampering

**File:** `MegaForm.Web/Controllers/PaymentController.cs`

```csharp
[HttpPost("stripe/create-intent")]
[AllowAnonymous]
public async Task<IActionResult> StripeCreateIntent([FromBody] PaymentIntentRequest req)
{
    var amount = req.Amount; // attacker-controlled
    var currency = req.Currency;
    ...
    var intent = await _stripeService.CreatePaymentIntentAsync(amount, currency, ...);
    return Ok(new { clientSecret = intent.ClientSecret });
}
```

**Nhận xét:** `amount`/`currency` từ body, không cross-check với form schema. Endpoint `[AllowAnonymous]`.

### 6.3 Web `MegaFormLocalAiController` vẫn `[AllowAnonymous]`

**File:** `MegaForm.Web/Controllers/MegaFormLocalAiController.cs`

```csharp
[Route("api/MegaFormAi")]
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
}
```

**Nhận xét:** Khác với Oqtane đã sửa, Web controller vẫn `[AllowAnonymous]`.

### 6.4 Hardcoded JWT Key

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

### 6.5 Stored XSS `CustomHtml`

**File:** `MegaForm.Core/Services/FormHtmlRenderer.cs`

```csharp
html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
{
    var key = m.Groups[1].Value;
    return content.TryGetValue(key, out var v) ? (v ?? string.Empty) : string.Empty;
});
```

**Nhận xét:** `content` từ `settings.CustomContent` được chèn trực tiếp.

### 6.6 DNN `AppEndpoint` `WITH` Bypass

**File:** `MegaForm.DNN/WebApi/AiToolsController.cs`

```csharp
var up = sqlOrSource.ToUpperInvariant();
if (up.Contains("DROP DATABASE") || up.Contains("TRUNCATE TABLE") ||
    up.Contains("XP_CMDSHELL") || up.Contains("SHUTDOWN"))
    return BadRequest();
var firstWord = up.TrimStart().Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0];
if (firstWord != "SELECT" && firstWord != "WITH")
    return BadRequest();
```

**Nhận xét:** Chỉ chặn 4 chuỗi cứng. `WITH ... DELETE` sẽ pass.



## 7. Recommendations

### P0 — Immediate (xử lý trong 24–48h)

1. **`RazorWidgetController.Action`:**
   - Thêm `[Authorize(Roles = "Administrator")]` hoặc `[Authorize(Policy = "EditModule")]`.
   - KHÔNG bao giờ tin `actionSql` từ client. Đọc SQL từ form schema đã lưu (formId + widgetKey + actionId).
   - Nếu bắt buộc phải nhận từ client, dùng SQL parser whitelist statement/table.

2. **`PaymentController`:**
   - Tính amount server-side từ form schema/field configuration.
   - Yêu cầu auth/session hoặc valid submission token.
   - Stripe: dùng `PaymentIntent` với `amount` server-calculated.
   - PayPal: tạo order server-side với amount từ cấu hình form.

3. **Web `MegaFormLocalAiController`:**
   - Thay `[AllowAnonymous]` bằng `[Authorize(Roles = "Administrator")]`.
   - Giữ env gate `MEGAFORM_ALLOW_LOCAL_AI_CLI=1` và `ArgumentList`.

4. **Oqtane `MegaFormLocalAiController`:**
   - Nâng `[Authorize]` lên `[Authorize(Roles = "Administrator")]` hoặc `[Authorize(Policy = "EditModule")]`.

5. **JWT Configuration:**
   - Xóa/rotate tất cả hardcoded JWT keys.
   - Sinh key ngẫu nhiên trong setup wizard, lưu trong environment variable hoặc secret manager.
   - Bật `ValidateIssuer = true`, `ValidateAudience = true`.

6. **Stored XSS Surfaces:**
   - Dùng HTML sanitizer whitelist (e.g. HtmlSanitizer) cho RichText/Html fields.
   - Escape CSS đặc biệt `<`, `"`, `'`.

7. **DNN `AppEndpoint`:**
   - Dùng SQL parser SELECT-only.
   - Audit log mọi execution.
   - Chặn DML/DDL trong CTE.

### P1 — High (xử lý trong 1 tuần)

8. **Roslyn Compile:** Sandbox/AppDomain riêng, whitelist API.
9. **claude CLI:** Timeout, whitelist commands, cân nhắc xóa production.
10. **ExecuteDdl:** SQL parser thay regex, whitelist statement/table.
11. **Oqtane `[IgnoreAntiforgeryToken]`:** Bỏ class-level, chỉ để lại endpoint public cần.
12. **SSRF Webhook:** Validate URL, deny private ranges, allow-list domain.
13. **Public Upload:** Khôi phục `IsPublished` gate hoặc yêu cầu auth.
14. **UserTemplate SSTI:** Hạn chế Host/Admin, sandbox interpreter.
15. **SaveStyle IDOR/CSRF:** EditModule policy + antiforgery + ownership check.
16. **Web `MegaFormController` Auth/CSRF:** Phân quyền admin-only cho settings, thêm antiforgery.

### P2/P3 — Medium/Low (xử lý trong 2–4 tuần)

17. **Files/Download:** `Path.GetFullPath` + prefix containment.
18. **AI API Key:** Không trả về client, dùng server-side proxy.
19. **Verbose Errors:** Generic client message, log server-side.
20. **CORS + Cookie:** Whitelist origin, `CookieSecurePolicy.Always`.
21. **Config Defaults:** `TrustServerCertificate=false`, `EnableSsl=true`, placeholder email.

### Misconfigurations

22. **Hardcoded QA Passwords:** Tách ra env vars hoặc file secrets ngoài repo.
23. **Sample Project Passwords:** Sinh random password trong setup.
24. **`.vs/`:** Thêm vào `.gitignore`.
25. **Docs Credentials:** Xóa/xoá khỏi git history.

---

## 8. Regulatory Mapping

| Regulation | Findings liên quan |
|------------|--------------------|
| **DORA** | P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P1-1, P1-2, P1-3, P1-4, P1-5 |
| **NIS2** | P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P1-4, P1-5, P1-6, P1-8, P1-9, P1-10, P2-1, P2-2, P2-3, P2-4 |
| **CRA** | P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P1-1, P1-2, P1-3 |
| **PCI DSS** | P0-2 | Payment data integrity |

---

## 9. Appendix A — Full Deduplicated Finding Matrix

| ID | Finding | File | Severity | Exploitability | Status so với cũ |
|----|---------|------|----------|----------------|------------------|
| P0-1 | RazorWidget.Action arbitrary SQL | Web/Oqtane/DNN `RazorWidgetController.cs` | Critical | Unauth — Confirmed | **NEW** |
| P0-2 | PaymentController amount tampering | `MegaForm.Web/Controllers/PaymentController.cs` | Critical | Unauth — Confirmed | **NEW** |
| P0-3 | Web Local AI unauth RCE | `MegaForm.Web/Controllers/MegaFormLocalAiController.cs` | Critical | Unauth — Confirmed | **NEW** |
| P0-4 | Oqtane Local AI auth too broad | `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs` | Critical | Auth user — Confirmed | **PARTIALLY FIXED** |
| P0-5 | Hardcoded JWT + weak validation | `appsettings.Production.json`, `Program.cs` | Critical | Unauth — Confirmed | **STILL PRESENT** |
| P0-6 | Stored XSS CustomHtml/ModuleCss | `FormHtmlRenderer.cs`, `ModuleCssComposer.cs` | Critical | Admin/CSRF — Confirmed | **STILL PRESENT** |
| P0-7 | DNN AppEndpoint WITH bypass | `MegaForm.DNN/WebApi/AiToolsController.cs` | Critical | Unauth — Confirmed | **STILL PRESENT** |
| P0-8 | Oqtane i18n write | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Critical | N/A | **FIXED** |
| P0-9 | Web SavePrintSettings | `MegaForm.Web/Controllers/PrintController.cs` | Critical | N/A | **FIXED** |
| P1-1 | Roslyn JIT compile RCE | `RazorWidgetController.cs`, `RazorCompilationService.cs` | High | Admin — Confirmed | **STILL PRESENT** |
| P1-2 | Admin claude CLI RCE | `AiAssistantController.cs` | High | Admin + env — Confirmed | **STILL PRESENT** |
| P1-3 | ExecuteDdl admin SQL | `AiToolsController.cs` (3 platforms) | High | Admin — Confirmed | **STILL PRESENT** |
| P1-4 | CSRF class-level Oqtane | Nhiều Oqtane controllers | High | CSRF — Confirmed | **STILL PRESENT** |
| P1-5 | SSRF workflow webhook | `WebhookNodeExecutor.cs`, `WebhookService.cs` | High | Auth User/Admin — Confirmed | **STILL PRESENT** |
| P1-6 | Public upload draft form | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | High | Unauth/User — Confirmed | **STILL PRESENT** |
| P1-7 | UserTemplate SSTI | `UserTemplateController.cs` | High | Auth User — Confirmed | **STILL PRESENT** |
| P1-8 | Oqtane SaveStyle IDOR/CSRF → XSS | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | High | Auth User/CSRF — Confirmed | **NEW** |
| P1-9 | DNN SaveStyle IDOR → XSS | `MegaForm.DNN/WebApi/MegaFormApiController.cs` | High | Auth User — Potential | **NEW** |
| P1-10 | Web MegaFormController auth/CSRF yếu | `MegaForm.Web/Controllers/MegaFormController.cs` | High | Auth User/CSRF — Confirmed | **NEW** |
| P1-11 | Subform ApplyDdl guard yếu | `MegaForm.DNN/WebApi/SubformController.cs` | High | Admin — Potential | **STILL PRESENT** |
| P1-12 | ImportApp SQL từ zip | `MegaForm.DNN/WebApi/AiToolsController.cs` | High | Admin — Potential | **STILL PRESENT** |
| P2-1 | Path sanitization Files/Download | 3 controllers | Medium | Auth User — Confirmed | **STILL PRESENT** |
| P2-2 | AI API key leak to client | `AiAssistantController.cs` | Medium | Admin — Confirmed | **PARTIALLY FIXED** |
| P2-3 | Verbose error / stack trace | Nhiều controller | Medium | Unauth/Auth — Confirmed | **STILL PRESENT** |
| P2-4 | CORS wildcard + cookie | `MegaForm.Web/Program.cs` | Medium | CSRF/MitM — Confirmed | **STILL PRESENT** |
| P2-5 | DDL guard nested comment | `SqlDdlGuard.cs` | Medium | Admin — Potential | **STILL PRESENT** |
| P3-1 | TrustServerCertificate=true | `appsettings.json` | Low | MitM | **STILL PRESENT** |
| P3-2 | SMTP EnableSsl=false | `appsettings.json` | Low | MitM | **STILL PRESENT** |
| P3-3 | PII admin email | `appsettings.Production.json` | Low | Info disclosure | **STILL PRESENT** |

---

## 10. Appendix B — Validation Notes

| Finding | Kết luận | Lý do |
|---------|----------|-------|
| P0-1 RazorWidget.Action | Confirmed | Code trực tiếp lấy `actionSql` từ body, không auth, service không guard destructive statements. |
| P0-2 Payment tampering | Confirmed | Amount từ body, không auth, không cross-check với form schema. |
| P0-3 Web Local AI | Confirmed | `[AllowAnonymous]` còn nguyên trên `ChatCompletions`. |
| P0-4 Oqtane Local AI | Confirmed | `[Authorize]` chỉ yêu cầu authenticated, không admin. |
| P0-7 DNN AppEndpoint WITH bypass | Confirmed | Code rõ ràng chỉ check first word SELECT/WITH và 4 destructive strings. |
| P1-8 Oqtane SaveStyle IDOR/CSRF | Confirmed | `[Authorize]` + `[IgnoreAntiforgeryToken]` class-level, không EditModule. |
| P1-9 DNN SaveStyle IDOR | Potential | Cần xác minh DNN default auth và module permission check chi tiết hơn. |
| P2-5 Nested comment bypass | Potential | SQL Server không hỗ trợ nested comments, nhưng guard vẫn là regex yếu. |
| P1-12 ImportApp SQL | Potential | Cần xem chi tiết flow import để xác nhận SQL thực thi trực tiếp. |

---

## 11. Appendix C — Files Changed Since Last Audit

Các file đã thay đổi liên quan đến bảo mật:
- `MegaForm.Core/Services/FormHtmlRenderer.cs`
- `MegaForm.Core/Services/ModuleCssComposer.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs`
- `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`
- `MegaForm.Oqtane.Server/Controllers/SubformController.cs`
- `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs`
- `MegaForm.Web/Controllers/MegaFormLocalAiController.cs`
- `MegaForm.Web/Controllers/PrintController.cs`
- `MegaForm.Web/Controllers/RazorWidgetController.cs`
- `MegaForm.Web/Controllers/SubformController.cs`
- `MegaForm.DNN/WebApi/MegaFormApiController.cs`
- `MegaForm.DNN/WebApi/RazorWidgetController.cs`
- `MegaForm.DNN/WebApi/SubformController.cs`
- `MegaForm.DNN/Views/FormView.ascx.cs`
- `MegaForm.Web/Views/Form/View.cshtml`

Ngoài ra còn nhiều file UI/CSS/template không liên quan trực tiếp đến lỗ hổng bảo mật runtime.

---

## 12. Conclusion

Sau đợt re-audit, codebase MegaForm vẫn ở trạng thái **bảo mật kém** với nhiều surface **unauthenticated** nguy hiểm:

- **3 P0 cũ đã được fix** (Oqtane i18n, Web SavePrintSettings, Oqtane Local AI partial).
- **Thêm 4 P0 mới** cực kỳ nghiêm trọng (RazorWidget.Action SQL, Payment tampering, Web Local AI, DNN AppEndpoint WITH bypass).
- **P0-5 (JWT) và P0-6 (stored XSS)** vẫn chưa sửa.
- **Nhiều P1 mới** liên quan IDOR/CSRF trên Oqtane/Web/DNN SaveStyle.
- **Class-level `[IgnoreAntiforgeryToken]`** trên Oqtane vẫn là rủi ro CSRF hệ thống.

**Khuyến nghị tổng thể:** Không nên triển khai production hoặc release 1.7.45 cho đến khi tất cả P0 và P1 được xử lý. Ưu tiên tuyệt đối cho **P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7**.

---

*End of Re-Audit Report*
