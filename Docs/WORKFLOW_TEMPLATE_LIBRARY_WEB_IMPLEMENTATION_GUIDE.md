# Hướng dẫn triển khai Workflow Template Library cho MegaForm.Web

> Mục tiêu: cho phép lưu một workflow thiết kế sẵn dưới dạng **template reusable** (JSON), sau đó gán template đó cho **nhiều forms** khác nhau — tương tự cách Form Template Gallery đang làm với form schema.
>
> Phạm vi: tập trung vào **Web shell** (`MegaForm.Web`, `MegaForm.AspNetCore.Component`, `MegaForm.Web.Host`). Không sửa `MegaForm.Core`, `MegaForm.Oqtane.*`, `MegaForm.DNN`, `MegaForm.Umbraco`.

---

## 1. Tình trạng hiện tại — tại sao chưa gán được workflow template cho nhiều forms?

### 1.1. Workflow trong Web host đang là "per-form"

Hiện tại, khi bạn thiết kế workflow trong builder và bấm **Apply**, toàn bộ workflow graph được serialize vào một cột duy nhất:

| Thành phần | File / Cột |
|------------|-----------|
| Lưu trữ | `MF_Forms.WorkflowJson` |
| Repository | `MegaForm.Web/Data/EfWorkflowRepository.cs` |
| Service | `MegaForm.Core/Services/WorkflowEngineV2.cs` (qua `IWorkflowRepository.GetByFormId`) |
| UI save path | `POST /api/MegaForm/Workflow/SaveDraft` rồi `POST /api/MegaForm/Workflow/Apply` |
| UI load path | `GET /api/MegaForm/Workflow/Get?formId={id}` |

Điều này có nghĩa là **mỗi form chứa một bản sao workflow riêng**. Nếu bạn muốn dùng chung workflow cho 10 forms, bạn phải copy/paste hoặc dùng Form Template Gallery để clone cả form (kể cả fields, settings, workflow) — nhưng đó là **clone**, không phải **gán/template reusable**.

### 1.2. Workflow Library đã có sẵn ở Core, nhưng Web host chưa "bật"

`MegaForm.Core` đã định nghĩa đầy đủ khái niệm reusable workflow:

- `MegaForm.Core/Models/WorkflowLibraryModels.cs`
  - `WorkflowTemplateInfo` — header/template catalog.
  - `WorkflowTemplateVersionInfo` — phiên bản workflow JSON (`DefinitionJson`).
  - `FormWorkflowMappingInfo` — liên kết `FormId` → `WorkflowTemplateId` + field mappings.
  - `WorkflowFieldMappingInfo` — ánh xạ field key của template sang field key của form cụ thể.
- `MegaForm.Core/Interfaces/IWorkflowLibraryRepository.cs` — contract CRUD + `GetActiveDefinitionForForm`.
- `MegaForm.Core/Services/WorkflowEngineV2.cs` — đã hỗ trợ ưu tiên library mapping trước khi fallback về per-form `WorkflowJson`.

Oqtane đã triển khai:

- `MegaForm.Oqtane.Server/Migrations/01060038_AddWorkflowLibrary.cs` — tạo 3 bảng `MF_WorkflowTemplates`, `MF_WorkflowTemplateVersions`, `MF_FormWorkflows`.
- `MegaForm.Oqtane.Server/Data/EfWorkflowLibraryRepository.cs` — EF implementation của `IWorkflowLibraryRepository`.

**Nhưng Web host hiện tại thiếu 3 thứ:**

1. **Schema DB chưa có 3 bảng workflow library.** `MegaForm.Web/Data/DataLayer.cs` (partial `MegaFormDbContext`) không khai báo `DbSet<WorkflowTemplateInfo>`, `WorkflowTemplateVersionInfo`, `FormWorkflowMappingInfo`, và `OnModelCreating` cũng không định nghĩa các entity này.
2. **DI chưa register `IWorkflowLibraryRepository`.** Cả `MegaForm.Web/Program.cs` lẫn `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` đều không có dòng `services.AddScoped<IWorkflowLibraryRepository, EfWorkflowLibraryRepository>()`.
3. **Chưa có API controller cho workflow library.** `MegaForm.Web/Controllers/WorkflowController.cs` chỉ có human-task runtime (`Inbox`, `Tasks/*`, `CanvasView`), không có endpoint quản lý template/versions/mappings.

Kết quả: `WorkflowEngineV2.ResolveWorkflowForForm` luôn rơi vào nhánh fallback `legacy-form` vì `_libraryRepo == null`.

### 1.3. "Save as Template" hiện tại chỉ lưu form template, không phải workflow template

Trong builder, nút **Save as Template** (`MegaForm.UI/src/builder/save-as-template.ts`) gọi `POST /api/MegaForm/BuilderTemplates/UploadJson` và lưu toàn bộ form schema (fields, customHtml, customCss, rules, **workflow**) vào thư mục `App_Data/MegaForm/Templates`. Khi tạo form mới từ template này, workflow được **copy** vào `MF_Forms.WorkflowJson` của form mới. Đây là một dạng template, nhưng nó gắn liền với cả form schema, không cho phép gán workflow riêng lẻ cho nhiều forms có sẵn.

---

## 2. Giải pháp tổng quan

Triển khai **Workflow Template Library** trong Web host, gồm 3 tầng:

```
UI (MegaForm.UI)
  ├─ Workflow Builder: thêm "Save as Workflow Template" + "Load from Workflow Template"
  └─ Form Settings / Gallery: chọn workflow template để gán cho form

API (MegaForm.Web)
  └─ WorkflowLibraryController: CRUD template/versions + apply mapping

Data (MegaForm.Web)
  ├─ MegaFormDbContext: thêm 3 DbSet + 3 entity configs
  └─ EfWorkflowLibraryRepository: implement IWorkflowLibraryRepository

DI (MegaForm.Web / MegaForm.AspNetCore.Component)
  └─ Register IWorkflowLibraryRepository
```

Sau khi xong, runtime sẽ hoạt động như sau:

1. User submit form → `SubmissionProcessor` → `WorkflowEngineV2.ExecuteAsync`.
2. `WorkflowEngineV2.ResolveWorkflowForForm(formId)` gọi `IWorkflowLibraryRepository.GetActiveDefinitionForForm(formId)`.
3. Nếu form có active mapping → dùng `DefinitionJson` từ `WorkflowTemplateVersionInfo`, áp dụng `FieldMappingsJson` rồi chạy.
4. Nếu không có mapping → fallback về `MF_Forms.WorkflowJson` như cũ (backward compat).

---

## 3. Các file cần sửa (backend)

### 3.1. `MegaForm.Web/Data/DataLayer.cs` — thêm Workflow Library entities

Mục tiêu: bổ sung 3 `DbSet` và cấu hình Fluent API trong `OnModelCreating`.

#### 3.1.1. Thêm DbSet trong partial class `MegaFormDbContext`

```csharp
public DbSet<WorkflowTemplateInfo> WorkflowTemplates { get; set; }
public DbSet<WorkflowTemplateVersionInfo> WorkflowTemplateVersions { get; set; }
public DbSet<FormWorkflowMappingInfo> FormWorkflowMappings { get; set; }
```

> Các model này đã tồn tại trong `MegaForm.Core.Workflow`, nên chỉ cần thêm `using MegaForm.Core.Workflow;` nếu chưa có.

#### 3.1.2. Thêm cấu hình trong `OnModelCreating`

Thêm vào cuối `OnModelCreating` (trước dấu `}` của method):

```csharp
b.Entity<WorkflowTemplateInfo>(e => {
    e.ToTable("MF_WorkflowTemplates");
    e.HasKey(x => x.WorkflowTemplateId);
    e.HasIndex(x => new { x.PortalId, x.TemplateKey }).IsUnique();
    e.HasIndex(x => new { x.PortalId, x.IsEnabled });
    e.Property(x => x.TemplateKey).HasMaxLength(120).HasDefaultValue("");
    e.Property(x => x.Name).HasMaxLength(200).HasDefaultValue("");
    e.Property(x => x.Description).HasMaxLength(1000).HasDefaultValue("");
    e.Property(x => x.Category).HasMaxLength(100).HasDefaultValue("");
    e.Property(x => x.IsEnabled).HasDefaultValue(true);
});

b.Entity<WorkflowTemplateVersionInfo>(e => {
    e.ToTable("MF_WorkflowTemplateVersions");
    e.HasKey(x => x.WorkflowVersionId);
    e.HasIndex(x => new { x.WorkflowTemplateId, x.Version }).IsUnique();
    e.HasIndex(x => new { x.WorkflowTemplateId, x.IsApplied });
    e.Property(x => x.Version).HasMaxLength(40).HasDefaultValue("");
    e.Property(x => x.Notes).HasMaxLength(1000).HasDefaultValue("");
    e.Property(x => x.DefinitionJson).HasColumnType(TextType).HasDefaultValue("");
    e.Property(x => x.IsApplied).HasDefaultValue(false);
});

b.Entity<FormWorkflowMappingInfo>(e => {
    e.ToTable("MF_FormWorkflows");
    e.HasKey(x => x.MappingId);
    e.HasIndex(x => new { x.FormId, x.IsActive });
    e.HasIndex(x => new { x.WorkflowTemplateId, x.IsActive });
    e.Property(x => x.TriggerType).HasMaxLength(40).HasDefaultValue("on_submit");
    e.Property(x => x.FieldMappingsJson).HasColumnType(TextType).HasDefaultValue("[]");
    e.Property(x => x.AppliedBy).HasMaxLength(200).HasDefaultValue("");
    e.Property(x => x.IsActive).HasDefaultValue(true);
});
```

> Lưu ý: vì Web host dùng `DatabaseSchemaBootstrapper.EnsureMegaFormSchema` để tạo bảng (không dùng EF Migrations), việc bổ sung entity config ở trên sẽ khiến `EnsureCreated()` / `CreateTables()` tự tạo 3 bảng mới khi chạy lần đầu hoặc khi DB chưa có chúng.

### 3.2. `MegaForm.Web/Data/EfWorkflowLibraryRepository.cs` — tạo mới

Tạo file mới implement `IWorkflowLibraryRepository`. Có thể dựa trên `MegaForm.Oqtane.Server/Data/EfWorkflowLibraryRepository.cs` nhưng dùng `MegaForm.Web.Data.MegaFormDbContext` thay vì Oqtane DbContext.

Các method bắt buộc theo interface:

```csharp
public class EfWorkflowLibraryRepository : IWorkflowLibraryRepository
{
    private readonly MegaFormDbContext _db;
    public EfWorkflowLibraryRepository(MegaFormDbContext db) { _db = db; }

    public WorkflowRuntimeDefinition GetActiveDefinitionForForm(int formId) { ... }
    public WorkflowTemplateInfo GetTemplate(int workflowTemplateId) { ... }
    public WorkflowTemplateInfo GetTemplateByKey(int portalId, string templateKey) { ... }
    public List<WorkflowTemplateInfo> ListTemplates(int portalId, bool enabledOnly = true) { ... }
    public int SaveTemplate(WorkflowTemplateInfo template) { ... }
    public WorkflowTemplateVersionInfo GetVersion(int workflowVersionId) { ... }
    public List<WorkflowTemplateVersionInfo> ListVersions(int workflowTemplateId) { ... }
    public int SaveVersion(WorkflowTemplateVersionInfo version) { ... }
    public void ApplyVersion(int workflowTemplateId, int workflowVersionId, string appliedBy = "system") { ... }
    public FormWorkflowMappingInfo GetActiveMapping(int formId) { ... }
    public List<FormWorkflowMappingInfo> ListMappingsForTemplate(int workflowTemplateId, bool activeOnly = true) { ... }
    public int ApplyToForm(FormWorkflowMappingInfo mapping) { ... }
}
```

Logic tham khảo từ Oqtane:

- `GetActiveDefinitionForForm`: tìm mapping active của form → load template + version → deserialize `DefinitionJson` thành `WorkflowDefinition` → gán `definition.FormId = formId` → trả về `WorkflowRuntimeDefinition` kèm `FieldMappings`.
- `SaveTemplate`: insert/update `WorkflowTemplateInfo`, normalize `TemplateKey`/`Name`.
- `SaveVersion`: insert/update `WorkflowTemplateVersionInfo`, validate `WorkflowTemplateId > 0`.
- `ApplyVersion`: set `IsApplied = false` cho các version cùng template, set `IsApplied = true` cho version được chọn, cập nhật `CurrentVersionId` của template.
- `ApplyToForm`: deactivate các mapping cũ của cùng `FormId`, sau đó insert mapping mới với `IsActive = true`.

### 3.3. `MegaForm.Web/Program.cs` — register DI

Thêm dòng sau trong phần **Workflow Engine v2.0** (cạnh các dòng `IWorkflowRepository`, `IWorkflowEvaluator`):

```csharp
builder.Services.AddScoped<IWorkflowLibraryRepository, EfWorkflowLibraryRepository>();
```

### 3.4. `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` — register DI

Trong `RegisterMegaFormServices`, thêm dòng tương tự cạnh `services.AddScoped<IWorkflowRepository, EfWorkflowRepository>();`:

```csharp
services.AddScoped<IWorkflowLibraryRepository, EfWorkflowLibraryRepository>();
```

> Tại sao cần sửa cả hai? `MegaForm.Web/Program.cs` dùng khi chạy project `MegaForm.Web` trực tiếp (debug); `MegaForm.AspNetCore.Component` dùng khi host qua NuGet package (`MegaForm.Web.Host`). Cả hai đều phải register.

### 3.5. `MegaForm.Web/Controllers/WorkflowLibraryController.cs` — tạo mới

Tạo controller mới route `api/MegaForm/WorkflowLibrary` để UI gọi. Gợi ý endpoints:

```csharp
[ApiController]
[Route("api/MegaForm/WorkflowLibrary")]
[Authorize]
public class WorkflowLibraryController : ControllerBase
{
    private readonly IWorkflowLibraryRepository _repo;
    private readonly IFormRepository _formRepo;
    private readonly IPlatformContext _ctx;

    // GET  api/MegaForm/WorkflowLibrary/List?portalId=0
    [HttpGet("List")]
    public IActionResult List(int? portalId) { ... }

    // GET  api/MegaForm/WorkflowLibrary/Get?id={workflowTemplateId}
    [HttpGet("Get")]
    public IActionResult Get(int id) { ... }

    // POST api/MegaForm/WorkflowLibrary/SaveTemplate
    [HttpPost("SaveTemplate")]
    public IActionResult SaveTemplate([FromBody] SaveTemplateReq req) { ... }

    // POST api/MegaForm/WorkflowLibrary/SaveVersion
    [HttpPost("SaveVersion")]
    public IActionResult SaveVersion([FromBody] SaveVersionReq req) { ... }

    // POST api/MegaForm/WorkflowLibrary/ApplyVersion
    [HttpPost("ApplyVersion")]
    public IActionResult ApplyVersion([FromBody] ApplyVersionReq req) { ... }

    // GET  api/MegaForm/WorkflowLibrary/Versions?workflowTemplateId={id}
    [HttpGet("Versions")]
    public IActionResult Versions(int workflowTemplateId) { ... }

    // POST api/MegaForm/WorkflowLibrary/ApplyToForm
    [HttpPost("ApplyToForm")]
    public IActionResult ApplyToForm([FromBody] ApplyToFormReq req) { ... }

    // GET  api/MegaForm/WorkflowLibrary/GetMapping?formId={id}
    [HttpGet("GetMapping")]
    public IActionResult GetMapping(int formId) { ... }

    // GET  api/MegaForm/WorkflowLibrary/Preview?workflowTemplateId={id}&formId={formId}
    [HttpGet("Preview")]
    public IActionResult Preview(int workflowTemplateId, int formId) { ... }
}
```

Các request model gợi ý:

```csharp
public class SaveTemplateReq
{
    public int? WorkflowTemplateId { get; set; }
    public string TemplateKey { get; set; }
    public string Name { get; set; }
    public string Description { get; set; }
    public string Category { get; set; }
    public bool IsEnabled { get; set; } = true;
}

public class SaveVersionReq
{
    public int? WorkflowVersionId { get; set; }
    public int WorkflowTemplateId { get; set; }
    public string Version { get; set; }
    public string DefinitionJson { get; set; }   // WorkflowDefinition JSON
    public string Notes { get; set; }
}

public class ApplyVersionReq
{
    public int WorkflowTemplateId { get; set; }
    public int WorkflowVersionId { get; set; }
}

public class ApplyToFormReq
{
    public int FormId { get; set; }
    public int WorkflowTemplateId { get; set; }
    public int? WorkflowVersionId { get; set; }
    public List<WorkflowFieldMappingInfo> FieldMappings { get; set; }
    public string TriggerType { get; set; } = "on_submit";
}
```

> Lưu ý bảo mật: `PortalId` nên lấy từ `IPlatformContext.PortalId`, không nhận từ client (hoặc validate). `DefinitionJson` nên deserialize để kiểm tra cấu trúc hợp lệ trước khi lưu.

### 3.6. `MegaForm.Web/Controllers/MegaFormController.cs` — cập nhật apply builder template (tùy chọn)

Nếu muốn khi tạo form từ Builder Template Gallery, workflow trong template JSON có thể được lưu thành Workflow Template Library thay vì copy vào `WorkflowJson`, bạn sửa logic ở phần DevBulkCreate/apply template. Tuy nhiên đây là tùy chọn; bước tối thiểu là giữ nguyên copy behavior.

---

## 4. Các file cần sửa (frontend)

### 4.1. `MegaForm.UI/src/builder/workflow/index.ts` — thêm save/load workflow template

Trong React workflow builder, bổ sung:

1. **Nút "Save as Workflow Template"** trong toolbar. Khi bấm:
   - Gọi `buildLatestDefinitionPayload()` để lấy `WorkflowDefinition` hiện tại.
   - Mở dialog nhập `Name`, `Category`, `Version`, `Notes`.
   - POST `WorkflowLibrary/SaveTemplate` để tạo/update header.
   - POST `WorkflowLibrary/SaveVersion` với `DefinitionJson = JSON.stringify(def)`.
   - POST `WorkflowLibrary/ApplyVersion` để đánh dấu version vừa lưu là active.

2. **Nút "Load from Workflow Template"**. Khi bấm:
   - GET `WorkflowLibrary/List`.
   - Hiển thị gallery/template picker.
   - Khi chọn template, GET version active (hoặc list versions để user chọn).
   - Deserialize `DefinitionJson` và gọi `onLoadJson(def)` đã có sẵn (dòng ~2623).

3. **Tích hợp với form hiện tại**: sau khi chọn template, có thể POST `WorkflowLibrary/ApplyToForm` để gán template đó cho form đang mở (thay vì chỉ load vào editor).

### 4.2. `MegaForm.UI/src/builder/gallery.ts` — gán workflow template khi tạo/apply form template

Khi user chọn một builder template, hiện tại gallery đưa workflow vào `settings.workflowTemplate`. Bạn có thể bổ sung tùy chọn: nếu form đã tồn tại và user muốn gán một workflow template có sẵn, hiển thị danh sách từ `WorkflowLibrary/List`.

### 4.3. `MegaForm.UI/src/builder/save-as-template.ts` — phân biệt form template và workflow template (tùy chọn)

Có thể giữ nguyên behavior lưu form template (đã bao gồm workflow). Nếu muốn rõ ràng hơn, đổi label thành "Save form as template" và thêm nút riêng "Save workflow as template" trong workflow builder.

---

## 5. Cách save workflow ra template (sau khi triển khai)

### Flow đề xuất

1. User mở **Workflow Builder** của một form.
2. Thiết kế graph → bấm **"Save as Workflow Template"**.
3. Hệ thống:
   - Tạo row `WorkflowTemplateInfo` (nếu chưa có) hoặc update.
   - Tạo row `WorkflowTemplateVersionInfo` với `DefinitionJson` là JSON của `WorkflowDefinition`.
   - Đánh dấu version này là `IsApplied = true`.
4. Template giờ có thể dùng lại cho nhiều forms.

### JSON shape lưu trong `DefinitionJson`

Là chuỗi JSON của `MegaForm.Core.Workflow.WorkflowDefinition`, ví dụ:

```json
{
  "id": "tpl-approval-01",
  "name": "Approval Routing",
  "version": "1.0.0",
  "startNodeId": "start-1",
  "nodes": [ ... ],
  "edges": [ ... ],
  "variables": [ ... ],
  "settings": { ... }
}
```

> Lưu ý: `FormId` trong `WorkflowDefinition` sẽ được runtime override thành formId của form đang chạy (xem `EfWorkflowLibraryRepository.GetActiveDefinitionForForm` trong Oqtane).

---

## 6. Cách MegaForm load lại workflow template (sau khi triển khai)

### 6.1. Load vào editor

1. GET `WorkflowLibrary/List` → chọn template.
2. GET `WorkflowLibrary/Versions?workflowTemplateId={id}` hoặc dùng `CurrentVersionId`.
3. Parse `DefinitionJson` thành object.
4. Gọi `onLoadJson(def)` trong `MegaForm.UI/src/builder/workflow/index.ts`.

### 6.2. Gán template cho form (mapping)

1. POST `WorkflowLibrary/ApplyToForm` với body:

```json
{
  "formId": 123,
  "workflowTemplateId": 5,
  "workflowVersionId": null,
  "fieldMappings": [
    { "workflowFieldKey": "customer_email", "formFieldKey": "email", "required": true },
    { "workflowFieldKey": "order_amount",   "formFieldKey": "amount", "required": true }
  ],
  "triggerType": "on_submit"
}
```

2. Từ lần submit tiếp theo, `WorkflowEngineV2` sẽ tự động dùng template thay vì `WorkflowJson`.

### 6.3. Tắt mapping (quay về per-form workflow)

Có thể thêm endpoint `POST WorkflowLibrary/DeactivateMapping` hoặc xóa active mapping. Sau đó engine fallback về `MF_Forms.WorkflowJson`.

---

## 7. Lưu ý quan trọng về database

### 7.1. Web host không dùng EF Migrations

Web host dùng `DatabaseSchemaBootstrapper.EnsureMegaFormSchema` (`MegaForm.Web/Data/DatabaseSchemaBootstrapper.cs`). Nó gọi `db.Database.EnsureCreated()` (SQLite) hoặc `creator.CreateTables()` (SQL Server/PostgreSQL/MySQL). Do đó, chỉ cần bổ sung entity config trong `OnModelCreating` là các bảng mới sẽ được tạo khi chạy lần đầu.

### 7.2. Nâng cấp DB đang tồn tại

Nếu DB đã có dữ liệu, `EnsureCreated()` sẽ không tạo thêm bảng (no-op). `CreateTables()` của EF Core thường chỉ tạo các bảng còn thiếu và bỏ qua bảng đã có. Tuy nhiên, để an toàn, bạn nên:

- Test trên SQLite trống trước.
- Test trên SQL Server/PostgreSQL/MySQL đã có dữ liệu.
- Nếu `CreateTables()` báo lỗi, thêm migration SQL thủ công hoặc dùng script tạo 3 bảng tương tự Oqtane migration.

Schema 3 bảng tham khảo từ `MegaForm.Oqtane.Server/Migrations/01060038_AddWorkflowLibrary.cs`:

- `MF_WorkflowTemplates` (WorkflowTemplateId, PortalId, TemplateKey, Name, Description, Category, IsEnabled, CurrentVersionId, CreatedByUserId, CreatedOnUtc, UpdatedOnUtc)
- `MF_WorkflowTemplateVersions` (WorkflowVersionId, WorkflowTemplateId, Version, DefinitionJson, Notes, IsApplied, CreatedByUserId, CreatedOnUtc)
- `MF_FormWorkflows` (MappingId, FormId, WorkflowTemplateId, WorkflowVersionId, FieldMappingsJson, TriggerType, IsActive, AppliedByUserId, AppliedBy, AppliedOnUtc)

### 7.3. Khóa ngoại

Trong Web host, các bảng khác không dùng FK nghiêm ngặt. Bạn có thể bỏ qua FK constraint để đơn giản, chỉ cần index trên `(FormId, IsActive)` và `(WorkflowTemplateId, IsActive)`.

---

## 8. Checklist tóm tắt

- [ ] `MegaForm.Web/Data/DataLayer.cs`: thêm `DbSet<WorkflowTemplateInfo>`, `DbSet<WorkflowTemplateVersionInfo>`, `DbSet<FormWorkflowMappingInfo>`.
- [ ] `MegaForm.Web/Data/DataLayer.cs`: thêm 3 `b.Entity<...>()` trong `OnModelCreating`.
- [ ] Tạo `MegaForm.Web/Data/EfWorkflowLibraryRepository.cs` implement `IWorkflowLibraryRepository`.
- [ ] `MegaForm.Web/Program.cs`: `services.AddScoped<IWorkflowLibraryRepository, EfWorkflowLibraryRepository>();`.
- [ ] `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`: thêm cùng dòng register DI.
- [ ] Tạo `MegaForm.Web/Controllers/WorkflowLibraryController.cs` với các endpoint List/Get/SaveTemplate/SaveVersion/ApplyVersion/Versions/ApplyToForm/GetMapping/Preview.
- [ ] `MegaForm.UI/src/builder/workflow/index.ts`: thêm nút Save/Load workflow template và gọi API mới.
- [ ] (Tùy chọn) `MegaForm.UI/src/builder/gallery.ts`: cho phép gán workflow template khi apply builder template.
- [ ] Build & test trên SQLite trống, sau đó test trên DB production-like.
- [ ] Cập nhật `AGENTS.md` nếu có thay đổi behavior đáng kể.

---

## 9. Phạm vi tối thiểu để "gán workflow template cho nhiều forms"

Nếu bạn chỉ cần tính năng cơ bản, đủ làm 6 bước sau:

1. Thêm 3 entity vào `MegaFormDbContext`.
2. Tạo `EfWorkflowLibraryRepository`.
3. Register DI.
4. Tạo `WorkflowLibraryController` với `SaveTemplate` + `SaveVersion` + `ApplyToForm`.
5. Trong UI workflow builder, thêm nút **"Save as Workflow Template"** và **"Apply Template to This Form"**.
6. Khởi động lại host để `EnsureMegaFormSchema` tạo bảng.

Sau đó runtime tự động hoạt động vì `WorkflowEngineV2` đã code sẵn logic ưu tiên library mapping.

---

## 10. Tài liệu tham khảo trong repo

- `MegaForm.Core/Models/WorkflowLibraryModels.cs` — model.
- `MegaForm.Core/Interfaces/IWorkflowLibraryRepository.cs` — contract.
- `MegaForm.Oqtane.Server/Data/EfWorkflowLibraryRepository.cs` — reference implementation.
- `MegaForm.Oqtane.Server/Migrations/01060038_AddWorkflowLibrary.cs` — DB schema.
- `MegaForm.Core/Services/WorkflowEngineV2.cs` — runtime resolution (dòng `ResolveWorkflowForForm`).
- `MegaForm.Web/Data/EfWorkflowRepository.cs` — per-form workflow storage.
- `MegaForm.Web/Controllers/WorkflowController.cs` — human-task runtime API.
- `MegaForm.Premium.AspNetCore/Controllers/WorkflowController.cs` — builder workflow API.
- `MegaForm.UI/src/builder/workflow/index.ts` — workflow builder UI.
