# AUDIT — So sánh MegaForm.Umbraco với MegaForm.Oqtane

> Ngày lập: 2026-07-10  
> Mục đích: xác định trạng thái feature parity giữa Umbraco và Oqtane, chỉ ghi tài liệu để review, chưa sửa code.  
> Người lập: Kimi Code CLI (read-only exploration).

---

## 1. Tóm tắt điều tra

- `MegaForm.Umbraco` và `MegaForm.Umbraco.Host` hiện **build thành công (0 error)**.
- Cơ sở hạ tầng native (DbContext, migrations, platform context, rendering, CORS, property editor, content app, hosted services) đã có mặt.
- Nhiều tính năng Phase 4 đã được port: Workflow runtime, Reports CRUD, StarterController, AI Tools/Assistant/LocalAI, Upload/SDK, Phase2 FormView, public render/embed.
- **Vẫn còn các nhóm chức năng thiếu hoặc chưa đầy đủ** so với Oqtane, đặc biệt là:
  - Workflow builder + reusable workflow library.
  - AI Knowledge Base CRUD chuyên biệt (entries/rules/templates/feedback).
  - Google Sheets settings, module style/DB settings, form lock/unlock/theme, file download.
  - DataRepeater endpoints, Razor widgets, trial mode/governance.
  - Swagger/OpenAPI cho Host.
  - SurfaceController, Members integration, custom tree.

---

## 2. Phương pháp

1. Inventory toàn bộ controllers, services, hosted services trong `MegaForm.Oqtane.Server` + `MegaForm.Oqtane.Client`.
2. Inventory toàn bộ controllers, services, hosted services trong `MegaForm.Umbraco` + `MegaForm.Umbraco.Host`.
3. So khớp endpoint-by-endpoint, controller-by-controller.
4. Grep xác nhận các tính năng nghi ngờ thiếu.

---

## 3. Bảng so sánh tính năng chính

| Nhóm | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|
| **Project metadata** | Package `MegaForm.Oqtane` v1.7.101, target `net9.0`/`net10.0` | RCL package v1.5.0, target `net8.0`, Umbraco 14+ |  |
| **DI / Composer** | `MegaFormServerStartup` + `MegaFormManager` | `MegaFormComposer.cs` đầy đủ |  |
| **DbContext & Repositories** | Đầy đủ EfRepositories | Đầy đủ |  |
| **Migrations** | Nhiều granular migrations | `MegaFormSchemaMigrationPlan` + `InitialMegaFormSchemaMigration` | Có thể thiếu seed recipe/guide |
| **Platform context** | `OqtanePlatformContext`, `OqtaneAuthUrlProvider`, v.v. | `UmbracoPlatformContext`, `UmbracoConnectionRegistry`, v.v. |  |
| **Email / Storage / Log** | Có | Có |  |
| **Hosted services** | Warmup, KB seeder, Blog scheduled | Warmup, Blog scheduled, **thiếu KB seeder dedicated** | Umbraco dùng lazy seed trong `UmbracoAiKnowledgeService` |
| **Form CRUD** | Get/Save/Delete/List/Lock/Unlock/LockedIds/Permissions/SaveTheme/Duplicate/Stats | Get/Save/Delete/List/Duplicate/Stats/Permissions | **Thiếu Lock/Unlock/LockedIds/SaveTheme** |
| **Builder templates** | `DevBulkCreateForms`, `UploadBuilderTemplateJson`, `BuilderTemplates/List` | Chỉ `BuilderTemplates/List` | **Thiếu DevBulkCreateForms, UploadBuilderTemplateJson** |
| **Public submit/schema** | `Schema/{formId}`, `Submit/Post` | `/umbraco/api/megaform/schema`, `/umbraco/api/megaform/Submit` |  |
| **Uploads** | Upload/File, Image, List, PdfForm/UploadTemplate | Có |  |
| **Files / SDK** | `Files/Download`, `SdkDemo/Download`, `PersistSubmissionFilesFailSoft` | Chỉ `SdkDemo/Download` | **Thiếu Files/Download, PersistSubmissionFilesFailSoft** |
| **DataRepeater** | `/api/MegaForm/DataRepeater/*` | Không tìm thấy endpoints | **Thiếu** |
| **Submissions** | List/Get/Export/Status/Data update | Có List/Get, **chưa rõ Export/Status/Data update** | Cần verify runtime |
| **ModuleConfig** | Get/Save, SaveModuleStyle, ModuleStyle, DefaultConnectionString, DatabaseSettings, GoogleSheetsSettings, GoogleSheetsTestSheet | Chỉ `GetModuleConfig`/`SaveModuleConfig` | **Thiếu style, DB settings, Google Sheets** |
| **Phase2 / App Builder** | `Phase2/*`, AppDefinitionList Get/Save/Delete/AssignForm | `GetViewConfigs`, `SaveViewConfig`, `DeleteViewConfig` | **Thiếu AppDefinitionList/AssignForm** |
| **Reports** | List/Get/Save/Delete/SubmissionData/Backfill/FormsOverview | Có đầy đủ |  |
| **Workflow runtime** | Inbox/MyInbox/Claim/Approve/Reject/Forward/Comment/SendSubmission/CanvasView/Directory/SeedOrgDirectory | Có đầy đủ |  |
| **Workflow builder** | `Form/Workflow/Get`, `SaveDraft`, `Validate`, `Apply`, `TestRun`, `NodeSchema`, Webhook/Email Presets | Chỉ `Workflow/Save` (lưu workflow JSON vào form) | **Thiếu toàn bộ workflow builder surface** |
| **Workflow library** | `Form/Workflow/Library/List/Get/SaveCurrent/ApplyToForm/Unbind/Delete` | Không tìm thấy | **Thiếu** |
| **AI Assistant** | `AiAssistantController` | `AiAssistantController` |  |
| **AI Knowledge Base** | `AiKnowledgeController`, `AiKnowledgeFeedbackController`, `AiKnowledgeRulesController`, `AiKnowledgeTemplatesController` | **Không có các controller này** | AI KB CRUD có thể bị thiếu hoặc nằm trong `AiToolsController` cần verify |
| **AI Tools** | `AiToolsController` | `AiToolsController` |  |
| **Local AI proxy** | `MegaFormLocalAiController` | `MegaFormLocalAiController` |  |
| **Subform / SQL bridge** | `SubformController` | `SubformController` |  |
| **BYOM User templates** | `UserTemplateController` | `UserTemplateController` |  |
| **Razor widgets** | `RazorWidgetController` | **Không có** | **Thiếu** |
| **Business starters** | `StarterController` đầy đủ | `StarterController` đầy đủ |  |
| **Rendering / embed** | `/api/MegaForm/render/{formId}`, FastEmbed, script embed, SSR snapshot cache | `/megaform/form/{id}`, `/embed`, `/preview`, `/script`, TagHelper/ViewComponent/HtmlHelper |  |
| **CORS** | Có | `MegaFormUmbracoCorsExtensions` |  |
| **Client module shell** | `Index.razor` 4,250 dòng điều phối tất cả panel | Backoffice JS + section views + property editor | Khác kiến trúc nên không cần parity 1:1 |
| **SDK registration** | `AddMegaFormSdk()` + `IMegaFormClient` | `AddMegaFormSdk()` được gọi trong `MegaFormComposer` |  |
| **Trial mode / governance** | Trial caps, `dev.lock`, `RazorActionSqlGuard`, SQL DDL guards | Chỉ `dev.lock` trong `UserTemplateController` | **Thiếu trial mode, RazorActionSqlGuard** |
| **Swagger/OpenAPI** | Có (trong `MegaForm.Web`/`AspNetCore.Component`) | **Không cấu hình trong Host** | Cần add Swagger để dev/test |
| **SurfaceController** | N/A (Oqtane dùng module controller) | **Chưa có** | Cần cho form postback Umbraco-native |
| **Members integration** | N/A | **Chưa có** | Dùng cho public authenticated submit |
| **Custom tree** | N/A | **Chưa có** | Đề xuất ưu tiên thấp |

---

## 4. Phân tích chi tiết các nhóm thiếu

### 4.1 Workflow builder & Workflow library (Ưu tiên CAO)

Oqtane cung cấp toàn bộ surface để builder UI tạo/sửa/validate workflow:
- `POST/GET Form/Workflow/Get`
- `POST Form/Workflow/SaveDraft`
- `POST Form/Workflow/Validate`
- `POST Form/Workflow/Apply`
- `POST Form/Workflow/TestRun`
- `GET Form/Workflow/NodeSchema`
- `GET Form/Workflow/WebhookPresets`, `EmailPresets`

Umbraco hiện chỉ có `POST /umbraco/MegaForm/MegaFormApi/Workflow/Save` — lưu trực tiếp JSON workflow vào `FormInfo.WorkflowJson`. Nếu builder UI gọi các endpoint trên, sẽ lỗi 404.

Ngoài ra Oqtane có **Reusable Workflow Library** (`Form/Workflow/Library/*`) để lưu và tái sử dụng workflow template — Umbraco chưa có.

### 4.2 AI Knowledge Base CRUD (Ưu tiên CAO)

Oqtane có 4 controller riêng:
- `AiKnowledgeController` — entries CRUD + search scoped + seed view modes.
- `AiKnowledgeFeedbackController` — feedback list/get/promote/review.
- `AiKnowledgeRulesController` — rules CRUD.
- `AiKnowledgeTemplatesController` — templates CRUD.

Trong Umbraco, `MegaForm.Umbraco/Controllers` **không chứa 4 controller này**. `AiToolsController` có vẻ chỉ expose tool surface (SQL, widgets, template guide) chứ không có full admin CRUD cho entries/rules/templates/feedback. Cần verify UI builder AI drawer có gọi đến các endpoint này không.

### 4.3 Module configuration nâng cao (Ưu tiên TRUNG BÌNH)

Oqtane có các endpoint:
- `ModuleConfig/SaveModuleStyle`, `ModuleConfig/ModuleStyle`
- `ModuleConfig/DefaultConnectionString`
- `ModuleConfig/DatabaseSettings`
- `ModuleConfig/GoogleSheetsSettings`, `GoogleSheetsTestSheet`

Umbraco chỉ có `GetModuleConfig`/`SaveModuleConfig` cơ bản. Các tính năng sau có thể bị lỗi 404 khi UI gọi:
- Style per module instance.
- Dashboard DB connection settings.
- Google Sheets integration settings.

### 4.4 Form governance & locking (Ưu tiên TRUNG BÌNH)

Thiếu:
- `Form/Lock`, `Form/Unlock`, `Form/LockedIds` — collaborative editing.
- `Form/SaveTheme` — lưu theme vào form.
- `Form/Permissions` endpoint chi tiết (Umbraco có permission catalog nhưng chưa rõ có endpoint Save chi tiết như Oqtane không).

### 4.5 Files / SDK helpers (Ưu tiên TRUNG BÌNH)

Thiếu:
- `Files/Download` — download file đính kèm submission.
- `PersistSubmissionFilesFailSoft` — xử lý file khi submit fail.

### 4.6 DataRepeater (Ưu tiên TRUNG BÌNH)

Oqtane có `/api/MegaForm/DataRepeater/*` endpoints. Umbraco không tìm thấy. `AiToolsController` có reference `DataRepeaterService` nhưng đó là service, không phải public API cho widget.

### 4.7 Razor widgets (Ưu tiên THẤP)

Oqtane có `RazorWidgetController` cho admin tạo/compile/render Razor widget động. Umbraco chưa có. Tính năng này phụ thuộc `RazorActionSqlGuard` và JIT compile — rủi ro bảo mật cao, nên ưu tiên thấp.

### 4.8 Trial mode & governance (Ưu tiên THẤP)

Oqtane có trial mode giới hạn submissions và ẩn API key. Umbraco chưa có. Nếu package dự kiến phân phối trial, cần bổ sung.

### 4.9 Swagger / OpenAPI (Ưu tiên THẤP cho dev, CAO nếu cần tích hợp)

`MegaForm.Umbraco.Host/Program.cs` chưa cấu hình `AddSwaggerGen` / `UseSwagger` / `UseSwaggerUI`. Không ảnh hưởng runtime production nhưng khó test/debug.

### 4.10 SurfaceController & Members integration (Ưu tiên TRUNG BÌNH)

Umbraco thường dùng `SurfaceController` cho form postback model binding. Hiện submit đang qua API controller. Nếu cần model binding Umbraco-native hoặc anti-forgery token tích hợp Members, cần bổ sung.

Members integration cũng chưa có — để map Umbraco Members vào `UserContext` cho public authenticated submit và workflow actor.

### 4.11 Custom tree (Ưu tiên THẤP)

Hiện Umbraco dùng section + content app. Custom tree là nice-to-have.

---

## 5. Vấn đề route / runtime tiềm ẩn

### 5.1 Route prefix không đồng nhất

Oqtane (và Web host) dùng:
- `/api/MegaForm/...`

Umbraco dùng:
- `/umbraco/api/megaform/...` (public)
- `/umbraco/MegaForm/MegaFormApi/...` (admin)

Shared Vite/TS admin UI có thể hardcode `/api/MegaForm/...`. Cần verify:
- Có global API base path config trong Umbraco JS không?
- Các admin JS entry (`megaform-dashboard.js`, `megaform-builder-loader.js`, v.v.) đang gọi đúng prefix chưa?

### 5.2 Backoffice auth policy

Các admin endpoint Umbraco đang dùng `[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]`. Cần đảm bảo user đăng nhập backoffice Umbraco có quyền truy cập.

### 5.3 Public endpoint auth

Một số endpoint như `Submit`, `schema`, `render` cần `[AllowAnonymous]` hoặc không yêu cầu BackOfficeAccess. Cần verify từng controller.

### 5.4 Lazy KB seed

`UmbracoAiKnowledgeService` dùng lazy seed từ `MegaForm.Core.Seed.ai-knowledge-seed.json`. Cần test lần đầu gọi AI assistant có seed thành công không, đặc biệt trên SQLite.

---

## 6. Khuyến nghị theo mức độ ưu tiên

### 6.1 Ưu tiên CAO (chặn runtime hoặc lỗi 404 rõ ràng)

1. **Workflow builder endpoints**: port `Form/Workflow/*` từ Oqtane `MegaFormController.Workflow.cs` sang Umbraco.
2. **AI Knowledge CRUD controllers**: tạo `AiKnowledgeController`, `AiKnowledgeFeedbackController`, `AiKnowledgeRulesController`, `AiKnowledgeTemplatesController` (có thể delegate vào `IAiKnowledgeService` đã có).
3. **Verify shared admin UI API base path**: đảm bảo builder/dashboard gọi đúng `/umbraco/MegaForm/MegaFormApi/...`.
4. **Chạy Host & test public render/submit**: xác nhận form render, submit, embed hoạt động.

### 6.2 Ưu tiên TRUNG BÌNH (thiếu tính năng nhưng có workaround)

5. **ModuleConfig nâng cao**: Google Sheets, ModuleStyle, DatabaseSettings.
6. **Form lock/unlock/theme & Files/Download**.
7. **DataRepeater public endpoints**.
8. **SurfaceController + Members integration**.
9. **Reports Export/Status/Data update endpoints** (nếu thực sự thiếu).

### 6.3 Ưu tiên THẤP (nice-to-have / governance)

10. **Swagger/OpenAPI** cho Host.
11. **RazorWidgetController** + `RazorActionSqlGuard`.
12. **Trial mode**.
13. **Custom tree**.
14. **Refactor obsolete warnings**.
15. **Repair NuGet global cache** hoặc chuẩn hóa `local-packages-umbraco`.

---

## 7. Checklist kiểm thử runtime đề xuất

- [ ] `dotnet run` `MegaForm.Umbraco.Host` thành công, Umbraco backoffice load được.
- [ ] Truy cập `/umbraco` → MegaForm section hiển thị.
- [ ] Content App "MegaForm Submissions" hiển thị trên document node.
- [ ] Property editor `megaForm` cho phép chọn form.
- [ ] Public page render form qua TagHelper/ViewComponent/HtmlHelper.
- [ ] Submit form thành công, submission lưu vào `MF_Submissions`.
- [ ] `/megaform/form/{id}/embed` render iframe.
- [ ] `/megaform/form/{id}/script` trả JS embed.
- [ ] Builder UI load form qua `Form/Get`, `Form/Save`.
- [ ] Workflow tab trong builder gọi `Workflow/Save` không lỗi; nếu gọi `Workflow/Validate`/`TestRun` → 404 (xác nhận thiếu).
- [ ] AI Assistant trong builder gọi `AiAssistant/DefaultConfig` OK; nếu gọi `AiKnowledge/List` → 404 (xác nhận thiếu).
- [ ] Reports UI gọi `Reports/List`, `Reports/FormsOverview` OK.
- [ ] Workflow Inbox/MyInbox/Claim/Approve OK.
- [ ] Starter setup `Starter/LeaveRequest/Setup` OK.
- [ ] Upload file/image OK.
- [ ] SDK demo download OK.
- [ ] CORS script embed từ origin khác OK.

---

## 8. Tệp tin tham khảo chính

### Oqtane
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` + 8 partials
- `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs`
- `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs`
- `MegaForm.Oqtane.Server/Controllers/AiKnowledgeFeedbackController.cs`
- `MegaForm.Oqtane.Server/Controllers/AiKnowledgeRulesController.cs`
- `MegaForm.Oqtane.Server/Controllers/AiKnowledgeTemplatesController.cs`
- `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`
- `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`
- `MegaForm.Oqtane.Server/Controllers/SubformController.cs`
- `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs`
- `MegaForm.Oqtane.Server/Controllers/WorkflowController.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`

### Umbraco
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.Umbraco/Controllers/MegaFormApiController.cs` (+ Phase2, UploadAndSdk partials)
- `MegaForm.Umbraco/Controllers/AiAssistantController.cs`
- `MegaForm.Umbraco/Controllers/AiToolsController.cs`
- `MegaForm.Umbraco/Controllers/MegaFormLocalAiController.cs`
- `MegaForm.Umbraco/Controllers/WorkflowController.cs`
- `MegaForm.Umbraco/Controllers/ReportsController.cs`
- `MegaForm.Umbraco/Controllers/StarterController.cs`
- `MegaForm.Umbraco/Controllers/SubformController.cs`
- `MegaForm.Umbraco/Controllers/UserTemplateController.cs`
- `MegaForm.Umbraco/Controllers/FormController.cs`
- `MegaForm.Umbraco/Controllers/MegaFormAdminController.cs`
- `MegaForm.Umbraco.Host/Program.cs`

---

## 9. Kết luận

`MegaForm.Umbraco` đã đạt **~70–75% feature parity** với Oqtane ở mức build thành công. Tuy nhiên, các nhóm **Workflow builder**, **AI Knowledge CRUD**, **ModuleConfig nâng cao**, và một số endpoint phụ trợ (lock/theme/file download/DataRepeater) vẫn còn thiếu. Cần chạy runtime Host để xác nhận chính xác những endpoint nào thực sự bị UI gọi và lỗi 404, từ đó ưu tiên sửa trước.
