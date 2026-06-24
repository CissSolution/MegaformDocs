# Báo cáo: Đề xuất tách App Builder & App Starter sang Razor độc lập

> **Trạng thái:** Phân tích & tài liệu — không chứa code sản xuất.  
> **Ngày rà soát:** 2026-06-15.  
> **Mục tiêu:** Khảo sát phần App Builder và App Starter trong MegaForm, so sánh với nguyên tắc "MegaForm chỉ là form/workflow/engine", đề xuất chuyển phần hiển thị theo template sang Razor/Blazor độc lập bên ngoài để dễ bảo trì và linh hoạt hơn.

---

## 1. Tóm tắt đề xuất

**Quan điểm cốt lõi:**

> MegaForm nên giữ vai trò **engine**: định nghĩa form, quản lý submission, chạy workflow, xử lý validation, anti-spam, file, notification.  
> Các ứng dụng/template hiển thị (blog, board, directory, catalog, v.v.) nên được xây dựng bằng **Razor/Blazor độc lập** bên ngoài, gọi MegaForm qua SDK hoặc HTTP API, thay vì nhồi nhét logic template, view, page routing vào trong MegaForm core.

**Kết luận nhanh:**

- Hiện tại MegaForm đang "làm quá nhiều": Form Builder, App Starter, Business Starters, Phase2 views, list/card/board templates, Blog CMS, Forum, HR Directory — tất cả đều nằm trong core hoặc JS bundle.
- Điều này tạo ra coupling chặt, khó bảo trì, khó customize, khó mở rộng.
- Đề xuất: tách dần theo mô hình **"headless form engine + Razor presentation apps"**.
- Form engine giữ nguyên. App Builder và App Starter chuyển thành **Razor/Blazor admin apps** gọi API. Các template hiển thị chuyển thành **Razor views/components** hoặc **Razor Pages/Blazor apps** riêng.

---

## 2. Thực trạng App Builder & App Starter trong MegaForm

### 2.1. App Builder là gì?

Trong MegaForm, "App Builder" thực chất là hai khái niệm chồng lấn:

1. **Form Builder** — trình thiết kế form kéo-thả, cấu hình field, validation, conditional logic, workflow, theme, custom HTML/CSS.
2. **Application Builder** — khả năng tạo ra các ứng dụng nghiệp vụ hoàn chỉnh (Blog, Forum, HR Directory, CRM, v.v.) từ một form thông qua **Multi-View System** (`Docs/MULTI-VIEW-APP-SPEC.md`).

### 2.2. Kiến trúc hiện tại

| Thành phần | Nằm ở đâu | Cách hoạt động |
|------------|-----------|----------------|
| **Form Builder UI** | `MegaForm.UI/src/builder/*` (JS bundle) + `MegaForm.Oqtane.Client/Builder.razor` (shell) | Blazor shell load JS bundle, JS vẽ toàn bộ builder. |
| **Form Renderer** | `MegaForm.UI/src/renderer/*` | JS convert schema JSON → DOM form nhập liệu. |
| **Multi-View / Phase2** | `MegaForm.Core/ViewModes`, `MegaForm.UI/src/listview/*`, `MegaForm.UI/src/submission-views/*` | Lưu view config trong DB, render list/card/detail bằng JS hoặc server-side token template. |
| **Template Engine** | `MegaForm.UI/src/templating/engine.ts` | Mustache-like `{{field}}`, `{{#each}}`, `{{#if}}`, `{{detailUrl}}`. |
| **App Starter Engine** | `MegaForm.Core/Services/Starters/*` | Code-first provisioner tạo form, workflow, views, queries, permissions, sample data. |
| **Business Starters** | `LeaveRequestStarterService`, `ProposalStarterService`, `RecruitmentStarterService`, `DocumentExchangeStarterService`, `PurchaseOrderStarterService`, `ConfiguredAppStarterDefinitions.Blog()` | 6 starter app: Leave, Proposal, Document Exchange, Purchase Order, Recruitment, Blog. |
| **Razor Widgets** | `MegaForm.Web/RazorWidgets/*.razor` | Server-rendered Blazor components nhúng vào form (calculator, editable list, chart, v.v.). |
| **BYOM User Templates** | `MegaForm.Core/Templating/UserTemplateProcessorDispatcher.cs` | `.cshtml`/`.html` widget render server-side. |

### 2.3. App Starter hiện tại tạo ra gì?

Theo `ConfiguredAppStarterService.EnsureStarter`, một lần launch tạo ra:

1. `AppDefinitionInfo` + `AppManifestDefinition` (scope, profile, settings, resources).
2. `FormInfo` chính + các related forms (ví dụ Blog có `posts`, `categories`, `comments`, `reader-events`).
3. `FormRelationInfo` giữa các form.
4. `AppQueryDefinitionInfo` — các query dùng cho views.
5. `FormViewInfo` — các view dạng board/register/card/detail/list (wrapper HTML + row template + query key).
6. `FormPermissionInfo` — phân quyền theo role.
7. `WorkflowDefinition` — BPMN approval flow.
8. Sample users/roles + sample submissions.
9. Module settings binding (`MegaForm:FormId`, `MegaForm:ViewConfig`, `MegaForm:ViewType`).

### 2.4. Vấn đề đã thấy từ thực trạng

| Vấn đề | Biểu hiện |
|--------|-----------|
| **MegaForm quá phình to** | Core chứa cả form engine lẫn app provisioning, view templates, blog-specific rendering, forum logic. |
| **Nhiều pipeline template song song** | Builder JSON templates, Phase2 view templates, BYOM user templates, Razor widgets, JS listview runtime — 5 hệ thống khác nhau. |
| **Coupling chặt với CMS** | Blazor shell phải xử lý fullscreen takeover, Oqtane/DNN PersonaBar, auth token injection, module setting binding. |
| **Khó customize giao diện** | Muốn thay đổi blog layout phải sửa template trong DB hoặc JS bundle, không dùng Razor IntelliSense/hot reload. |
| **Khó test** | Logic render nằm trong JS, khó viết unit test. Starter services gọi trực tiếp nhiều repository. |
| **Khó tái sử dụng ngoài MegaForm** | Một blog xây dựng bằng MegaForm starter không thể dễ dàng chuyển thành standalone Razor app. |
| **Maintenance burden** | Mỗi lần thêm view type (kanban, calendar) phải sửa cả Core, JS renderer, builder UI, starter definitions. |

---

## 3. Tầm nhìn kiến trúc: Headless Form Engine + Razor Presentation

### 3.1. Phân chia ranh giới rõ ràng

```
┌─────────────────────────────────────────────────────────────┐
│                    RAZOR / BLAZOR APPS                       │
│  (Presentation layer — bên ngoài MegaForm)                   │
│  • Blog App          • HR Directory App                      │
│  • Forum App         • Product Catalog App                   │
│  • Board App         • Custom CMS Pages                      │
│  • Admin Builder App • Admin Starter App                     │
│                                                              │
│  Mỗi app là project Razor/Blazor độc lập, có Views/Components│
│  Models/ViewModels, controllers, routing, theme riêng.       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ gọi qua SDK / HTTP API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              MEGAFORM ENGINE (core + host)                   │
│                                                              │
│  • Form Definition  (schema, fields, validation, rules)      │
│  • Submission Processing (validate, anti-spam, save, notify) │
│  • Workflow Engine  (tasks, approvals, forwarding)           │
│  • File Storage                                             │
│  • Permissions (form-level, row-level)                      │
│  • Reporting / Indexing                                     │
│  • HTTP API / SDK (`IMegaFormClient`)                       │
│                                                              │
│  KHÔNG chứa: blog UI, forum UI, card/list templates,        │
│  admin builder UI, starter gallery UI.                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2. Nguyên tắc "Single Responsibility"

| Thuộc về MegaForm Engine | Thuộc về Razor Presentation Apps |
|--------------------------|----------------------------------|
| CRUD Form/Submission | CRUD UI cho admin/end user |
| Schema validation | Render HTML theo thiết kế riêng |
| Workflow execution | Workflow inbox UI |
| Permission evaluation | Permission-aware UI hiding |
| File upload/storage | File gallery/preview layout |
| Webhook/email/notification | Notification UI/badge |
| Anti-spam/scoring | Captcha widget integration |
| Public API / SDK | Form Builder, App Builder, Starter Gallery |

---

## 4. Đề xuất chi tiết tách từng phần

### 4.1. Tách App Builder UI sang Razor/Blazor độc lập

**Hiện trạng:** App Builder UI là JS bundle khổng lồ (`MegaForm.UI/src/builder/*`) được host bởi Blazor shell (`Builder.razor`, `BuilderView.razor`). Logic phức tạp, khó test, khó IntelliSense.

**Đề xuất:** Xây dựng **MegaForm.Builder.App** — một ứng dụng Blazor Server/WebAssembly hoặc ASP.NET Core MVC/Razor Pages độc lập.

**Chức năng của Builder App:**
- List forms trong portal.
- Mở form editor: drag-drop field, configure properties.
- Theme designer.
- Workflow designer (có thể vẫn dùng ReactFlow/GoJS nhúng trong Blazor component).
- Save/Publish form qua `IMegaFormClient` hoặc HTTP API.
- Gallery templates từ server hoặc local JSON.

**MegaForm engine cần cung cấp:**
- `IFormApi`: Create/Get/Update/Delete form.
- `ISchemaApi`: Parse schema, validate schema.
- `IWorkflowApi` (tương lai): Save/load workflow definition.
- `IPermissionApi` (tương lai): CRUD permissions.
- `IBuilderTemplateApi`: List/upload builder templates.

**Lợi ích:**
- Builder UI có thể phát triển độc lập, dùng hot reload, Razor component, MudBlazor/Blazorise.
- Dễ viết test E2E bằng Playwright.
- Không cần fullscreen takeover hack trong Oqtane/DNN.
- Có thể chạy standalone hoặc nhúng vào Oqtane admin qua iframe hoặc Blazor component wrapper.

### 4.2. Tách App Starter sang Razor/Blazor Admin App

**Hiện trạng:** App Starter là 6 dedicated service class + 1 generic `ConfiguredAppStarterService` trong `MegaForm.Core`. UI là modal trong dashboard JS gọi `MFStarter.launch`.

**Đề xuất:** Chuyển App Starter thành **tầng provisioning** và **tầng UI** riêng.

#### Tầng Provisioning (vẫn trong MegaForm.Core nhưng mỏng hơn)

Giữ lại engine:
- `ConfiguredAppStarterService` nhận `AppStarterDefinition` và tạo form/workflow/views/queries/permissions/sample data.
- Cung cấp public API:
  - `GET /api/MegaForm/Starter/Catalog` — list starter definitions.
  - `GET /api/MegaForm/Starter/Status?appScope=...` — check installed.
  - `POST /api/MegaForm/Starter/Provision` — run provisioning, trả về `ProvisionResult { FormIds, ViewKeys, DefaultViewKey, Credentials }`.
  - `POST /api/MegaForm/Starter/Reset` — xóa sample data.

**Lưu ý:** Provisioning engine vẫn cần nằm trong core vì nó tạo dữ liệu nghiệp vụ. Nhưng nó chỉ là "seed engine", không phải "blog UI".

#### Tầng UI (chuyển ra ngoài)

Xây dựng **MegaForm.Starter.App** — Razor/Blazor app:
- Gallery các starter template (card, preview, category).
- Form cấu hình trước khi provision (chọn portal, module, tên app, có seed data không).
- Nút "Create App" gọi `POST /api/MegaForm/Starter/Provision`.
- Hiển thị kết quả: form URLs, view keys, sample credentials.
- "Open Board", "Open Form", "Open Inbox" links.

**Không lưu view HTML templates trong DB nữa.** Thay vào đó, starter app trỏ đến Razor views/components đã viết sẵn trong project presentation.

### 4.3. Tách Template/Display Rendering sang Razor/Blazor độc lập

**Hiện trạng:** Phase2 views lưu `WrapperHtml` + `RowHtmlTemplate` trong DB, render bằng token engine (`{{field:...}}`, `{{#each submissions}}`) trong JS hoặc server-side. Blog starter định nghĩa 18+ views bằng HTML string khổng lồ trong `ConfiguredAppStarterDefinitions.cs`.

**Đề xuất:** Bỏ hệ thống lưu HTML template trong DB. Thay bằng **Razor views/components** độc lập.

#### Mô hình mới: View Definition chỉ lưu metadata

```json
{
  "views": [
    {
      "key": "blog-home",
      "type": "card",
      "name": "Blog Home",
      "queryKey": "public-posts",
      "razorComponent": "MegaForm.Apps.Blog.Components.BlogHome",
      "route": "",
      "public": true
    },
    {
      "key": "article-detail",
      "type": "detail",
      "name": "Article Detail",
      "queryKey": "post-by-id",
      "razorComponent": "MegaForm.Apps.Blog.Components.ArticleDetail",
      "route": "article/{id}",
      "public": true
    },
    {
      "key": "admin-list",
      "type": "list",
      "name": "Manage Articles",
      "queryKey": "all-posts",
      "razorComponent": "MegaForm.Apps.Blog.Components.AdminArticleList",
      "route": "admin",
      "requireRole": "editor"
    }
  ]
}
```

View chỉ lưu:
- `key`, `type`, `name`
- `queryKey` — tham chiếu đến `AppQueryDefinitionInfo` trong MegaForm
- `razorComponent` hoặc `razorView` — đường dẫn đến component Razor bên ngoài
- `route`, `public`, `requireRole`

#### Presentation App là project Razor/Blazor riêng

Ví dụ: `MegaForm.Apps.Blog` project:

```
MegaForm.Apps.Blog/
├── Components/
│   ├── BlogHome.razor
│   ├── ArticleDetail.razor
│   ├── AdminArticleList.razor
│   ├── BlogArchive.razor
│   └── BlogCalendar.razor
├── Pages/
│   ├── Index.cshtml          → render BlogHome
│   ├── Article.cshtml        → render ArticleDetail
│   └── Admin.cshtml          → render AdminArticleList
├── Controllers/
│   └── BlogController.cs     → nếu cần MVC
├── wwwroot/
│   └── css/blog.css
└── MegaForm.Apps.Blog.csproj
```

Mỗi component:
- Inject `IMegaFormClient`.
- Gọi `client.Submissions.FindAsync(query, scope)` hoặc `client.Forms.GetFormAsync`.
- Tự render HTML theo ý muốn, dùng Razor syntax, Blazor component, bất kỳ CSS framework nào.
- Tự xử lý routing, authentication, authorization.

#### Lợi ích của việc dùng Razor thay vì DB template

| Tiêu chí | DB HTML Template | Razor Component |
|----------|------------------|-----------------|
| IntelliSense | ❌ | ✅ |
| Hot reload | ❌ | ✅ |
| Compile-time check | ❌ | ✅ |
| Unit test | ❌ | ✅ |
| Reuse Blazor ecosystem | ❌ | ✅ |
| Source control diff | Khó | Dễ |
| Designer/UI dev experience | Kém | Tốt |
| Dynamic runtime edit | ✅ | Cần recompile (có thể dùng JIT Razor compile nếu cần) |

### 4.4. Giữ nguyên Form Renderer JS cho phần nhập liệu

**Form nhập liệu vẫn do `megaform-renderer.js` đảm nhận.** Đây là phần cốt lõi của MegaForm, đã được tối ưu cho validation, conditional logic, multi-step, widget, file upload, payment, signature.

Razor presentation app chỉ cần:
- Lấy schema qua `GET /api/MegaForm/Schema/{formId}`.
- Render mount div.
- Gọi `MegaFormRenderer.init({ container, schema, settingsJson, themeJson, rules, apiBase, ... })`.
- Hoặc dùng Strategy A pure-Blazor cho form đơn giản (theo báo cáo `REPORT_BLAZOR_RAZOR_MEGAFORM_INTEGRATION.md`).

---

## 5. API Surface cần mở rộng cho Razor Apps

Để Razor apps có thể thay thế display layer hiện tại, MegaForm engine cần API ổn định hơn:

### 5.1. Cần bổ sung vào SDK / HTTP API

| API | Method | Mục đích |
|-----|--------|----------|
| `IStarterApi` | `GetCatalogAsync()`, `GetStatusAsync(appScope)`, `ProvisionAsync(...)`, `ResetAsync(...)` | Quản lý app starter |
| `IWorkflowApi` | `GetInboxAsync()`, `GetTaskAsync(taskId)`, `Claim/Approve/Reject/Forward/Comment` | Workflow inbox/actions |
| `IViewApi` | `ListViewsAsync(formId)`, `GetViewAsync(formId, viewKey)` | Lấy view metadata |
| `IQueryApi` | `ExecuteQueryAsync(formId, queryKey, parameters)` | Chạy query định nghĩa sẵn |
| `IPermissionApi` | `GetPermissionsAsync(formId)`, `CheckPermissionAsync(formId, userId, action)` | Kiểm tra quyền |
| `IFileApi.UploadAsync` | `UploadAsync(formId, fieldKey, stream, fileName)` | Upload file từ SDK |
| `IRelationApi` | `GetRelatedSubmissionsAsync(parentId, childFormKey)` | Lấy related records |
| `ICommentApi` | `List/Add/Delete comments` | Comment system |

### 5.2. Cần chuẩn hóa HTTP API cross-platform

Hiện tại Oqtane, Web, DNN có route khác nhau. Cần một bộ route chuẩn:

```
/api/megaform/v1/forms
/api/megaform/v1/forms/{id}
/api/megaform/v1/forms/{id}/submissions
/api/megaform/v1/forms/{id}/schema
/api/megaform/v1/submissions/{id}
/api/megaform/v1/submissions/{id}/files
/api/megaform/v1/starters
/api/megaform/v1/starters/{key}/provision
/api/megaform/v1/workflows/inbox
/api/megaform/v1/workflows/tasks/{id}/approve
/api/megaform/v1/queries/{queryKey}/execute
/api/megaform/v1/views
```

Hoặc cung cấp OpenAPI spec từ `MegaForm.Web` để các Razor apps có thể tự generate client.

---

## 6. Lộ trình thực hiện (không code)

### Phase 0: Chuẩn bị (2-4 tuần)
- Hoàn thiện `MegaForm.Sdk` với write API, typed schema, file upload.
- Chuẩn hóa HTTP API route/version.
- Xuất OpenAPI spec.
- Viết contract tests cho các API mới.

### Phase 1: Tách Display Layer đơn giản nhất (4-6 tuần)
- Chọn một starter đơn giản làm POC, ví dụ **Blog** hoặc **HR Directory**.
- Tạo project Razor/Blazor riêng: `MegaForm.Apps.Blog`.
- Chuyển 2-3 views chính từ DB template sang Razor components.
- Giữ nguyên MegaForm engine; Razor app gọi API/SDK.
- Không cần sửa App Builder/Starter UI ngay.

### Phase 2: Tách App Starter UI (4-6 tuần)
- Tạo `MegaForm.Starter.App` — Blazor/Razor app quản lý starter catalog.
- Thêm API `Starter/Catalog`, `Starter/Provision`, `Starter/Status`.
- Chuyển dashboard "Business Starters" modal từ JS sang Razor app.
- Các starter dedicated service vẫn giữ trong Core, nhưng trả về metadata thay vì view URLs.

### Phase 3: Tách App Builder UI (6-8 tuần)
- Tạo `MegaForm.Builder.App` — Blazor app thay thế JS builder bundle.
- Các field designer, property panel, theme designer, workflow designer chuyển thành Razor components.
- Dùng `IMegaFormClient` để save/load form.
- Hỗ trợ embed vào Oqtane/DNN admin qua iframe hoặc Blazor component.

### Phase 4: Loại bỏ dần DB templates (6-8 tuần)
- Mark Phase2 view HTML templates là deprecated.
- Cung cấp migration tool chuyển view config sang metadata-only + reference Razor component.
- Xóa `UserTemplateProcessorDispatcher` HTML token adapter (giữ Razor adapter nếu cần JIT).
- Tối ưu `ConfiguredAppStarterDefinitions` chỉ còn schema + queries + permissions + workflow, bỏ HTML view strings.

### Phase 5: Refactor Core (ongoing)
- Di chuyển các phần còn lại của display layer ra khỏi Core.
- Core chỉ còn: Form, Submission, Workflow, File, Permission, Notification, Reporting.
- Tách `AppDefinitionService`, `AppQueryRegistryService` thành optional modules.

---

## 7. Rủi ro & Mitigation

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| **Breaking change cho user đang dùng DB templates** | Cao | Giữ backward compatibility, deprecated dần, cung cấp migration tool. |
| **Mất tính năng nếu tách sai** | Cao | Tách từng phần nhỏ, POC trước, giữ nguyên engine. |
| **Blazor component không linh hoạt bằng DB template runtime** | Trung bình | Dùng JIT Razor compile (`RazorCompilationService`) cho custom templates nếu cần. |
| **Performance gọi API nhiều hơn** | Trung bình | Dùng caching, server-side Blazor để gọi SDK in-process, GraphQL/Batch API. |
| **Oqtane/DNN integration phức tạp** | Trung bình | Dùng iframe hoặc admin page wrapper; không cần fullscreen takeover hack. |
| **Team cần học Blazor/Razor nhiều hơn** | Thấp | Blazor/Razor là stack chuẩn của .NET, dễ tuyển dev, tooling tốt. |
| **Tài liệu OpenAPI/SDK chưa đủ** | Trung bình | Ưu tiên hoàn thiện SDK + OpenAPI trong Phase 0. |

---

## 8. Kiến trúc mục tiêu tổng thể

```
Solution/
├── MegaForm.Core/                    ← Engine: form, submission, workflow, file, permissions
│   ├── Interfaces/
│   ├── Models/
│   ├── Services/
│   └── Migrations/
│
├── MegaForm.Sdk/                     ← Public contract
│
├── MegaForm.Hosts.Oqtane/            ← Oqtane module host (vỏ mỏng)
├── MegaForm.Hosts.DNN/               ← DNN module host (vỏ mỏng)
├── MegaForm.Hosts.Web/               ← Standalone ASP.NET Core host
│
├── MegaForm.Admin.Builder/           ← Blazor App Builder (mới)
├── MegaForm.Admin.Starter/           ← Blazor Starter Manager (mới)
│
├── MegaForm.Apps.Blog/               ← Razor/Blazor Blog app (mới)
├── MegaForm.Apps.Forum/              ← Razor/Blazor Forum app (mới)
├── MegaForm.Apps.HRDirectory/        ← Razor/Blazor HR Directory app (mới)
├── MegaForm.Apps.LeaveRequest/       ← Razor/Blazor Leave Request app (mới)
└── MegaForm.Apps.Catalog/            ← Razor/Blazor Product Catalog app (mới)
```

Mỗi `MegaForm.Apps.*`:
- Là project Razor/Blazor độc lập.
- Reference `MegaForm.Sdk` hoặc gọi HTTP API.
- Có models, viewmodels, views, components, controllers, routes, CSS, JS riêng.
- Có thể deploy riêng hoặc nhúng vào host qua static web assets + area.

---

## 9. Khuyến nghị cụ thể

1. **Không xóa ngay** App Builder/Starter hiện tại. Hãy xây dựng song song, deprecated dần.
2. **Ưu tiên tách Display Layer trước** vì impact thấp, lợi ích cao, dễ POC.
3. **Giữ nguyên Form Renderer JS** — đây là core competency.
4. **Hoàn thiện SDK và OpenAPI** trước khi tách UI.
5. **Dùng Blazor Server/Blazor Hybrid cho admin apps** để gọi SDK in-process, giảm HTTP round-trip.
6. **Dùng Razor Pages/Blazor WebAssembly cho public apps** nếu cần SEO hoặc chạy standalone.
7. **Tách Provisioning Engine ra khỏi UI** nhưng giữ trong Core vì nó là business logic.
8. **Định nghĩa `IViewRenderer` contract** để MegaForm engine có thể gợi ý component Razor phù hợp mà không hard-code UI.
9. **Tạo migration path** cho user đang dùng Phase2 views và BYOM templates.
10. **Viết documentation và samples rõ ràng** cho cách xây dựng Razor app trên MegaForm engine.

---

## 10. Kết luận

Đề xuất của bạn là đúng đắn và phù hợp với xu hướng kiến trúc hiện đại: **headless engine + presentation decoupled**.

MegaForm hiện đang "làm quá nhiều" khi cố gắng vừa là form engine, vừa là app builder, vừa là CMS template engine. Việc tách App Builder, App Starter UI, và đặc biệt là các template hiển thị (blog, forum, directory, board, v.v.) sang các project Razor/Blazor độc lập sẽ:

- Giảm coupling, giảm độ phức tạp của Core.
- Tăng khả năng bảo trì, test, và customize giao diện.
- Tận dụng được hệ sinh thái Razor/Blazor (IntelliSense, hot reload, component libraries).
- Cho phép các team khác nhau phát triển các ứng dụng trên cùng một MegaForm engine.
- Giữ MegaForm tập trung vào thế mạnh: form, workflow, submission processing.

Bước đầu tiên nên làm: **chọn một starter đơn giản (Blog hoặc HR Directory), tạo project Razor/Blazor độc lập, và chứng minh rằng nó có thể lấy dữ liệu từ MegaForm qua SDK + render giao diện theo ý muốn**.

---

## Phụ lục: Các file nguồn đã tham chiếu

- `Docs/MULTI-VIEW-APP-SPEC.md`
- `Docs/PORTABLE-ARCHITECTURE.md`
- `Docs/PLATFORM-EXPANSION-SPEC.md`
- `Docs/AI_FORM_DESIGN_ARCHITECTURE.md`
- `Docs/BUILDER_THEME_TECHNICAL_HANDOFF_20260604.md`
- `Docs/BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md`
- `Docs/TEMPLATE-PACKAGE-SPEC-v3.md`
- `Docs/WIDGET-DEVELOPMENT-SPEC.md`
- `Docs/REPORT_BLAZOR_RAZOR_MEGAFORM_INTEGRATION.md`
- `Docs/SDK_BLAZOR_INTEGRATION.md`
- `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`
- `MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs`
- `MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs`
- `MegaForm.Core/Services/Starters/LeaveRequestStarterService.cs`
- `MegaForm.Core/Services/Starters/ProposalStarterService.cs`
- `MegaForm.Core/Services/Starters/RecruitmentStarterService.cs`
- `MegaForm.Core/Services/Starters/DocumentExchangeStarterService.cs`
- `MegaForm.Core/Services/Starters/PurchaseOrderStarterService.cs`
- `MegaForm.Core/Services/Starters/IStarterPlatformAdapter.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs`
- `MegaForm.Oqtane.Server/Services/OqtaneStarterPlatformAdapter.cs`
- `MegaForm.Oqtane.Client/Index.razor`
- `MegaForm.Oqtane.Client/Builder.razor`
- `MegaForm.Oqtane.Client/BuilderView.razor`
- `MegaForm.Oqtane.Client/Dashboard.razor`
- `MegaForm.Oqtane.Client/DashboardView.razor`
- `MegaForm.UI/src/builder/index.ts`
- `MegaForm.UI/src/builder/core.ts`
- `MegaForm.UI/src/builder/gallery.ts`
- `MegaForm.UI/src/builder/presets.ts`
- `MegaForm.UI/src/builder/templates.ts`
- `MegaForm.UI/src/dashboard/index.ts`
- `MegaForm.UI/src/templating/engine.ts`
- `MegaForm.UI/src/listview/runtime.ts`
- `MegaForm.UI/src/submission-views/list.ts`
- `MegaForm.UI/src/submission-views/card.ts`
- `MegaForm.UI/src/renderer/index.ts`
- `MegaForm.Web/RazorWidgets/*.razor`
- `MegaForm.Core/Templating/UserTemplateProcessorDispatcher.cs`
- `MegaForm.Core/Templating/UserTemplateScanner.cs`
- `MegaForm.Core/Models/AppProfileModels.cs`
