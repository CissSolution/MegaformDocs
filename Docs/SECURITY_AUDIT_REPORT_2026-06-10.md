# 🔒 BÁO CÁO AUDIT BẢO MẬT TOÀN DIỆN — MEGAFORM

**Ngày audit:** 2026-06-10  
**Scope:** Toàn bộ codebase MegaForm (DNN, Oqtane, Umbraco, Web, Core, Frontend)  
**Phương pháp:** Static code analysis — Controllers, Services, Repositories, Frontend TypeScript/JavaScript  

---

## TÓM TẮT ĐIỂM SỐ

| Severity | Số lượng | Mức độ nguy hiểm |
|----------|----------|------------------|
| 🔴 **Critical** | **8** | RCE, CSRF toàn hệ thống, SQL Injection dẫn đến data breach |
| 🟠 **High** | **12** | Path traversal, Auth bypass, Anonymous DB access, XSS, Token theft |
| 🟡 **Medium** | **18** | Error info leak, Mass assignment, JSON DoS, Weak validation, Stack trace leak |
| 🟢 **Low / Info** | **10** | Anti-patterns, Defense-in-depth, Static HttpClient, Plaintext secrets |

---

## DANH SÁCH PUBLIC ENDPOINTS (KHÔNG YÊU CẦU XÁC THỰC)

### Oqtane Server (`/api/*`)
| Endpoint | File | Mô tả | Rủi ro |
|----------|------|-------|--------|
| `POST /api/MegaForm/Submit` | `MegaFormController.cs` | Form submission | Public-by-design ✅ |
| `POST /api/MegaForm/UploadFile` | `MegaFormController.cs` | File upload | Public-by-design ✅ |
| `GET /api/MegaForm/Schema` | `MegaFormController.cs` | Form schema | Public-by-design ✅ |
| `GET /api/MegaForm/ListSubmissions` | `MegaFormController.cs` | List submissions | 🔴 **Logic bypass risk** — có thể public nếu form config sai |
| `POST /api/MegaFormPopup/Subform/Compute` | `SubformController.cs` | Evaluate expression | 🟠 Anonymous formula evaluation |
| `POST /api/MegaFormPopup/Subform/Rows` | `SubformController.cs` | Read DB rows | 🟠 Anonymous DB query execution |
| `POST /api/MegaFormAi/*` | `MegaFormLocalAiController.cs` | AI chat | 🔴 `[AllowAnonymous]` — AI prompt injection |
| `GET /api/AiKnowledge/Ping` | `AiKnowledgeController.cs` | Ping | 🟠 Completely anonymous |

### DNN Server (`/DesktopModules/MegaForm/API/*`)
| Endpoint | File | Mô tả | Rủi ro |
|----------|------|-------|--------|
| `POST /DataRepeater/Query` | `DataRepeaterApiController.cs` | Public data query | Public-by-design ✅ |
| `GET /Field/Options` | `FieldController.cs` | Field options | Public-by-design ✅ |
| `POST /Submit` | `MegaFormApiController.cs` | Form submission | Public-by-design ✅ |
| `POST /Subform/Compute` | `SubformController.cs` | Expression evaluation | 🟠 Anonymous |
| `POST /Subform/Rows` | `SubformController.cs` | Read DB rows | 🟠 Anonymous — **Dynamic SQL** |
| `GET /RazorWidget/*` | `RazorWidgetController.cs` | Widget list/render | 🟠 Anonymous — **Razor compilation** |

### MegaForm.Web (`/api/*` hoặc route trực tiếp)
| Endpoint | File | Mô tả | Rủi ro |
|----------|------|-------|--------|
| `POST /Form/Submit` | `MegaFormController.cs` | Public submission | Public-by-design ✅ |
| `POST /Captcha/Verify` | `MegaFormController.cs` | Captcha verify | Public-by-design ✅ |
| `GET /Form/Schema` | `FormController.cs` | Schema | Public-by-design ✅ |
| `GET /Documents/{slug}` | `DocumentsController.cs` | Document delivery | Public-by-design ✅ |
| `POST /Payment/*` | `PaymentController.cs` | Stripe/PayPal proxy | 🟠 No `[Authorize]` — intentional nhưng cần review |

---

## 🔴 CRITICAL ISSUES (8)

### C1 — CSRF Toàn Hệ Thống Oqtane (RCE + DDL + Code Execution)
| | |
|---|---|
| **File** | Hầu hết controllers Oqtane |
| **Root cause** | `[IgnoreAntiforgeryToken]` ở **class-level** trên `MegaFormController`, `AiAssistantController`, `AiToolsController`, `RazorWidgetController`, `MegaFormPopupPhase2Controller`, `UserTemplateController` |
| **Impact** | Nếu Admin/Host đăng nhập và truy cập trang độc hại, attacker có thể: gọi `AiAssistantController.LocalCliChat` để **spawn process** (`claude` CLI với user-controlled prompt → RCE), gọi `AiToolsController.ExecuteDdl` để **thực thi raw SQL**, gọi `RazorWidgetController.Compile` để **JIT compile Razor code** |
| **Fix** | **XÓA** `[IgnoreAntiforgeryToken]` khỏi class-level. Chỉ áp dụng cho endpoint cụ thể nếu thực sự cần. Thêm `[ValidateAntiForgeryToken]` hoặc dùng header-based CSRF. |

### C2 — ExecuteDdl Thực Thi Raw SQL Từ Client
| | |
|---|---|
| **File** | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` (line ~410) |
| **Code** | `cmd.CommandText = sql;` với `sql = JStr(body, "sql")` |
| **Guard** | `SqlDdlGuard.Inspect(sql)` (regex-based) — **có thể bypass** bằng comment obfuscation, stacked statements, provider-specific escapes |
| **Impact** | Admin bị CSRF → attacker tạo/drop table, alter schema, đọc dữ liệu nhạy cảm |
| **Fix** | Không thực thi raw SQL từ client. Dùng parameterized stored procedures hoặc SQL builder pattern. |

### C3 — LocalCliChat RCE via Process Spawn
| | |
|---|---|
| **File** | `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs` (line ~203-307) |
| **Code** | `ProcessStartInfo` gọi `claude` CLI với `body.Prompt`, `body.Model`, `body.SystemPrompt` từ request |
| **Impact** | Nếu kết hợp với CSRF (C1), attacker có thể thực thi lệnh hệ thống với quyền của web server process |
| **Fix** | Không spawn process với user-controlled input. Dùng API thư viện thay vì CLI. Nếu bắt buộc phải dùng CLI, sanitize/whitelist arguments nghiêm ngặt. |

### C4 — RazorWidgetController JIT Compile Arbitrary Razor
| | |
|---|---|
| **File** | `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` (line ~291) |
| **Code** | `Compile` action dùng Roslyn để compile `req.RazorSource` từ request body |
| **Auth** | Chỉ check `IsHost` — **không có CSRF** (C1) |
| **Impact** | Host bị CSRF → arbitrary C# code execution trong AppDomain |
| **Fix** | Bật CSRF. Thêm sandbox/whitelist cho Razor source. Hoặc disable compile endpoint trong production. |

### C5 — SQL Injection trong SubformController (Oqtane)
| | |
|---|---|
| **File** | `MegaForm.Oqtane.Server/Controllers/SubformController.cs` |
| **Line 123** | `$"... pragma_table_info('{tableName.Replace("'", "''")}')"` — string interpolation SQL |
| **Line 190** | `"SELECT * FROM [" + tableName + "] WHERE [" + parentKeyColumn + "] = @p"` — direct concatenation |
| **Validation** | `IndexOfAny` quá yếu — không chặn `--`, `/*`, Unicode, backtick |
| **Impact** | `[AllowAnonymous]` → bất kỳ ai cũng có thể probe schema DB |
| **Fix** | Dùng `QUOTENAME()` hoặc whitelist từ `sys.tables`/`sys.columns`. Không bao giờ concatenate table/column names. |

### C6 — SQL Injection trong SubformController (DNN)
| | |
|---|---|
| **File** | `MegaForm.DNN/WebApi/SubformController.cs` (line ~320-358) |
| **Code** | `cmd.CommandText = "SELECT * FROM [" + tableName + "] WHERE [" + parentKeyColumn + "] = @p"` |
| **Auth** | `[AllowAnonymous]` |
| **Impact** | Information disclosure + potential SQL injection |
| **Fix** | Giống C5 — dùng whitelist từ schema thực tế hoặc stored procedure. |

### C7 — AiTools PreviewSql Arbitrary SELECT
| | |
|---|---|
| **File** | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` (line ~122) |
| **Code** | `svc.ExecutePreviewSql(sql, connectionKey, ...)` với `sql` từ request body |
| **Impact** | Admin-only nhưng **không có CSRF** → forged execution |
| **Fix** | Hạn chế arbitrary SQL. Dùng read-only connection string riêng. Bật CSRF. |

### C8 — Path Traversal Bypass trong DownloadFile (Oqtane)
| | |
|---|---|
| **File** | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (line ~1422) |
| **Code** | `path.Replace("..", string.Empty)` |
| **Bypass** | `....//` → sau replace thành `../` |
| **Impact** | Đọc file ngoài thư mục upload dự kiến |
| **Fix** | Dùng `Path.GetFullPath` + prefix containment check (như `UserTemplateController.ResolveSandboxedFilePath`). |

---

## 🟠 HIGH ISSUES (12)

| # | Vấn đề | File | Line | Mô tả |
|---|--------|------|------|-------|
| H1 | Missing `[Authorize]` class-level | `AiKnowledgeController.cs` | 25 | `Ping` hoàn toàn anonymous. Các action khác dùng manual `IsAdmin` — dễ miss. |
| H2 | Missing `[Authorize]` class-level | `AiKnowledgeFeedbackController.cs` | 19 | Same pattern — manual `IsAdmin` per action. |
| H3 | Missing `[Authorize]` class-level | `AiKnowledgeRulesController.cs` | 17 | Same pattern. |
| H4 | Missing `[Authorize]` class-level | `AiKnowledgeTemplatesController.cs` | 20 | Same pattern. |
| H5 | Missing `[Authorize]` class-level | `AiToolsController.cs` (Oqtane) | 26 | Manual `IsAdmin` per action — rủi ro miss check. |
| H6 | Anonymous DB access | `SubformController.cs` (Oqtane) | 157, 178 | `[AllowAnonymous]` cho `Compute` và `Rows`. |
| H7 | Public submission list logic bypass | `MegaFormController.cs` (Oqtane) | 1502 | `ListSubmissions` `[AllowAnonymous]` — `isPublicListView` check có thể bypass, `TotalCount` leak số lượng thực. |
| H8 | Path Traversal | `MegaForm.DNN/WebApi/MegaFormApiController.cs` | ~3020 | `DownloadFile` dùng `Replace("..", "")` — bypass được. |
| H9 | XSS Stored | `AiKnowledgeController.cs` (Oqtane) | ~187 | `body["examples"]`, `body["tags"]` stored trực tiếp vào DB, render ra UI không encode → Stored XSS. |
| H10 | AI API Key in localStorage | `MegaForm.UI/src/ai-form-assistant/providers.ts` | ~230 | API key OpenAI/Anthropic/Kimi lưu trong `localStorage`. XSS = key theft. |
| H11 | Bearer token trên `window` | `MegaForm.UI/src/adapters/aspcore.ts` | ~17 | `window.__MF_TOKEN` — bất kỳ script nào cũng đọc được. XSS = session hijack. |
| H12 | `postMessage` wildcard origin | `MegaForm.UI/src/builder/canvas.ts`, `theme-designer/index.ts`, `builder/dom.ts` | ~377, 439, 1368, 261 | `postMessage(..., "*")` — leak message cross-origin. Receiver không validate `event.origin`. |

---

## 🟡 MEDIUM ISSUES (18)

| # | Vấn đề | File | Line | Mô tả |
|---|--------|------|------|-------|
| M1 | Raw SQL `string.Format` | `MegaFormController.Reports.cs` (Oqtane) | ~234 | `string.Format` trên SQL — anti-pattern. |
| M2 | SQL structure từ client | `RegistrySqlExecutor.cs` (Oqtane) | ~115 | SQL từ client được rewrite rồi execute — structure do attacker control. |
| M3 | JSON DoS | `MegaFormController.cs` (Oqtane) | 341, 627, 685, 733 | `JObject.Parse(rawBodyJson)` không giới hạn size. |
| M4 | JSON DoS | `MegaFormLocalAiController.cs` | ~68 | `JObject.Parse(raw)` không giới hạn size. |
| M5 | XSS via `innerHTML` | `MegaForm.UI/src/submission-views/display.ts` | ~122 | `template.innerHTML = value` từ submission data. Strip script **sau khi** set innerHTML → quá muộn. |
| M6 | XSS via `innerHTML` | `MegaForm.UI/src/listview/runtime.ts` | ~1030 | `card.innerHTML = applyRowTemplate(...)` — row template user-editable. |
| M7 | XSS via `innerHTML` | `MegaForm.UI/src/ai-form-assistant/ops.ts` | ~1687 | `div.innerHTML = html` từ AI operations. |
| M8 | document.write dynamic | `Assets/js/builder/megaform-builder-toolbar.js` | ~110 | `document.write` với `customCss` raw injection. |
| M9 | File upload path | `MegaFormController.cs` (Oqtane) | ~1250 | `file.FileName` có thể chứa path separators trên một số hệ thống. |
| M10 | PDF upload auth weak | `MegaFormController.cs` (Oqtane) | ~1348 | `[Authorize(Roles = "Administrators")]` — weaker than Host-only cho file save. |
| M11 | Error message leak | `MegaForm.DNN/WebApi/UserTemplateController.cs` | ~792 | `ex.Message` trả về client → path disclosure. |
| M12 | Stack trace leak | `MegaForm.DNN/WebApi/Phase2ApiController.cs` | ~2587 | `ex.StackTrace` trả về client. |
| M13 | Exception detail leak | `MegaForm.DNN/WebApi/WorkflowApiController.cs` | 75, 191, 236 | `ex.ToString()` trả về client. |
| M14 | Arbitrary SQL AppEndpoint | `MegaForm.DNN/WebApi/AiToolsController.cs` | ~1321 | Endpoint cho phép execute SQL từ `MF_AppEndpoints` — nếu attacker write được row này = arbitrary SELECT. |
| M15 | Mass Assignment | `MegaForm.Web/Controllers/MegaFormController.cs` | SaveForm | Bind toàn bộ `FormInfo` từ body — attacker có thể sửa `PortalId`, `ModuleId`, `WorkflowJson`. |
| M16 | SQL Injection (metadata) | `MegaForm.Core/Services/DatabaseWorkflowMetadataService.cs` | ~156 | `EscapeSqlLiteral` chỉ replace `'` → `''`. Không phải true parameterization. |
| M17 | Formula evaluation anon | `SubformController.cs` (DNN) | ~295 | `[AllowAnonymous]` evaluate formula từ client. |
| M18 | `window.__MF_PLATFORM__` poison | `MegaForm.UI/src/shared/platform-host.ts` | ~254 | Global mutable — attacker script có thể poison trước khi MF load. |

---

## 🟢 LOW / INFO (10)

| # | Vấn đề | File | Mô tả |
|---|--------|------|-------|
| L1 | Static HttpClient | `MegaForm.Web/Controllers/PaymentController.cs` | Không dùng `IHttpClientFactory` → socket exhaustion. |
| L2 | Static HttpClient | `MegaForm.Core/Services/Workflow/WebhookNodeExecutor.cs` | Same — thiếu retry/circuit breaker. |
| L3 | Plaintext secrets | `MegaForm.Web/Controllers/SetupController.cs` | SMTP password lưu plaintext trong `appsettings.Production.json`. |
| L4 | Theme save arbitrary JSON | `MegaForm.Web/Controllers/MegaFormController.cs` | `SaveTheme` nhận `JObject` không whitelist. Admin-only nên risk thấp. |
| L5 | Locale path traversal | `MegaForm.DNN/WebApi/MegaFormApiController.cs` | `I18nController.Get` — `locale` có thể chứa `..` nhưng thư mục gốc bị giới hạn. |
| L6 | Dynamic SQL identifiers | `MegaForm.DNN/WebApi/AiToolsController.cs` | `schemaName`/`tableName` validate bằng `^\w+$` — acceptable nhưng nên dùng `QUOTENAME()`. |
| L7 | `DownloadFile` path | `MegaFormController.cs` (Oqtane) | `appDataRoot` dưới `ContentRootPath` có thể predictable. |
| L8 | `MegaFormRazorInterpreter` raw HTML | `MegaForm.Core/Templating/MegaFormRazorInterpreter.cs` | `Out.Append(v)` không HTML encode — nhưng không expose cho arbitrary user input. |
| L9 | `UploadPdfTemplate` size limit | `MegaFormController.cs` (Oqtane) | Giới hạn 50MB nhưng không có server-side enforcement rõ ràng. |
| L10 | `ListSubmissions` search ReDoS | `MegaFormController.cs` (Oqtane) | `search` không giới hạn độ dài → performance issue. |

---

## KHUYẾN NGHỊ ƯU TIÊN

### 🚨 P0 — Critical (Fix ngay lập tức)
1. **Bật lại Anti-Forgery Token Oqtane**: Xóa `[IgnoreAntiforgeryToken]` khỏi class-level của **TẤT CẢ** controllers. Đây là vấn đề nghiêm trọng nhất.
2. **Hạn chế ExecuteDdl/PreviewSql**: Không thực thi raw SQL từ client. Dùng read-only connection + builder pattern.
3. **RazorWidget Compile sandbox**: Disable hoặc sandbox Roslyn compile endpoint. Không cho phép compile arbitrary C#.
4. **LocalCliChat RCE**: Không spawn process với user input. Chuyển sang dùng thư viện API.

### 🚨 P1 — High (Fix trong sprint tiếp theo)
5. **Sửa SQL Injection SubformController** (cả Oqtane và DNN): Dùng `QUOTENAME()` hoặc whitelist từ `sys.tables`.
6. **Củng cố Path Traversal** (cả Oqtane và DNN): `Path.GetFullPath` + prefix containment.
7. **Thêm `[Authorize]` class-level** cho tất cả admin controllers (`AiKnowledge*`, `AiTools`).
8. **Chuyển AI API keys ra khỏi localStorage**: Proxy AI calls qua backend.
9. **Bảo vệ Bearer token Oqtane**: Dùng HttpOnly cookie hoặc closure pattern, không để trên `window`.
10. **Sanitize `postMessage`**: Replace `"*"` bằng explicit origin. Validate `event.origin` ở receiver.

### 🟡 P2 — Medium (Lên kế hoạch fix)
11. **Giới hạn JSON body size** cho các endpoint parse `JObject`.
12. **Harden `innerHTML`** trong frontend: Dùng `textContent` hoặc DOMPurify cho user-generated content.
13. **Chống Mass Assignment**: Dùng DTO thay vì bind full entity trong `SaveForm`.
14. **Parameterize metadata queries** trong `DatabaseWorkflowMetadataService`.
15. **Không leak stack trace / exception detail** trong API responses.
16. **Audit log** cho `AppEndpoint` SQL execution.

### 🟢 P3 — Low (Cải thiện dần)
17. **Migrate static HttpClient** sang `IHttpClientFactory` + Polly.
18. **Encrypt secrets at rest** (SMTP, payment keys) bằng ASP.NET Core Data Protection.
19. **Freeze `window.__MF_PLATFORM__`** sau init.
20. **Implement CSP headers** để giảm thiểu XSS impact.

---

## PHỤ LỤC: CÁC FILE ĐÃ AUDIT

**Oqtane Server:** 16 Controllers, 4 Repositories, 5 Services, MegaFormManager  
**DNN:** 21 Controllers, 8 Services, 10+ Repositories (FormRepository, DnnWorkflowRepository, etc.)  
**Web / Core / Shared / Umbraco:** 7+ Controllers, 10+ Services, EF Core layer  
**Frontend:** `MegaForm.UI/src/` (~100+ TS files), `Assets/js/` (compiled bundles)

---

*Report generated by Kimi Code CLI automated security audit — 2026-06-10*
