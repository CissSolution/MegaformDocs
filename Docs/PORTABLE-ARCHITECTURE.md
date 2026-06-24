# MegaForm — Portable Architecture Spec
## Mục tiêu: DNN → Oqtane migration dễ dàng

## Nguyên tắc thiết kế

1. **Interface-first**: Mọi service/repository đều có interface
2. **No static methods**: Dùng DI (Dependency Injection)
3. **No framework leakage**: Business logic không import DNN/Oqtane namespaces
4. **JS-heavy client**: Mọi UI logic ở JavaScript, server chỉ là API shell

---

## Cấu trúc thư mục mới

```
MegaForm/
├── MegaForm.Core/              ← PORTABLE (giữ nguyên khi port)
│   ├── Interfaces/
│   │   ├── IFormRepository.cs
│   │   ├── ISubmissionRepository.cs
│   │   ├── IFileRepository.cs
│   │   ├── IWorkflowRepository.cs
│   │   ├── IFormService.cs
│   │   ├── ISubmissionService.cs
│   │   ├── IWorkflowEngine.cs
│   │   ├── ISearchService.cs
│   │   ├── IEmailService.cs
│   │   └── IStorageService.cs
│   │
│   ├── Models/                 ← Pure C# models, no ORM attributes
│   │   ├── FormInfo.cs
│   │   ├── FormSchema.cs
│   │   ├── SubmissionInfo.cs
│   │   ├── WorkflowInfo.cs
│   │   └── ViewInfo.cs
│   │
│   ├── Services/               ← Business logic, framework-agnostic
│   │   ├── FormService.cs          (implements IFormService)
│   │   ├── SubmissionService.cs    (implements ISubmissionService)
│   │   ├── WorkflowEngine.cs       (implements IWorkflowEngine)
│   │   ├── SearchService.cs        (implements ISearchService)
│   │   ├── ValidationService.cs
│   │   ├── AntiSpamService.cs
│   │   └── AnalyticsService.cs
│   │
│   └── MegaForm.Core.csproj   ← netstandard2.0 (compatible cả DNN & Oqtane)
│
├── MegaForm.DNN/               ← DNN-SPECIFIC (bỏ khi port)
│   ├── Data/
│   │   ├── DnnFormRepository.cs      (implements IFormRepository, dùng Dapper)
│   │   ├── DnnSubmissionRepository.cs
│   │   └── DnnConnectionProvider.cs
│   │
│   ├── Api/
│   │   ├── FormApiController.cs      (DnnApiController wrapper)
│   │   └── SubmissionApiController.cs
│   │
│   ├── Views/                  ← ASCX files
│   │   ├── FormEdit.ascx
│   │   ├── FormView.ascx
│   │   └── Submissions.ascx
│   │
│   ├── Components/
│   │   └── FeatureController.cs (ISearchable, IUpgradeable)
│   │
│   └── MegaForm.DNN.csproj    ← references MegaForm.Core
│
├── MegaForm.Oqtane/            ← OQTANE-SPECIFIC (tạo khi port)
│   ├── Data/
│   │   ├── OqtFormRepository.cs      (implements IFormRepository, dùng EF Core)
│   │   └── MegaFormDbContext.cs
│   │
│   ├── Controllers/
│   │   ├── FormController.cs         (ASP.NET Core controller)
│   │   └── SubmissionController.cs
│   │
│   ├── Pages/                  ← Razor components
│   │   ├── FormEdit.razor
│   │   ├── FormView.razor
│   │   └── Submissions.razor
│   │
│   └── MegaForm.Oqtane.csproj ← references MegaForm.Core
│
└── Assets/                     ← SHARED 100% (giữ nguyên)
    ├── js/
    │   ├── builder/            ← Builder JS modules
    │   ├── plugins/            ← Widget plugins
    │   ├── megaform-renderer.js
    │   ├── megaform-widgets.js
    │   └── megaform-submissions.js
    ├── css/
    └── images/
```

---

## Interface Definitions

### IFormRepository
```csharp
public interface IFormRepository
{
    FormInfo GetForm(int formId);
    List<FormInfo> GetFormsByModule(int moduleId);
    List<FormInfo> ListForms(int portalId, string status, string search, int pageIndex, int pageSize);
    int SaveForm(FormInfo form);
    void DeleteForm(int formId);
    FormStats GetFormStats(int formId);
    int DuplicateForm(int formId, int userId);
}
```

### ISubmissionRepository
```csharp
public interface ISubmissionRepository
{
    int Insert(SubmissionInfo sub);
    SubmissionInfo Get(int submissionId);
    (List<SubmissionInfo> Items, int Total) List(int formId, string status, string search,
        DateTime? from, DateTime? to, int pageIndex, int pageSize);
    void UpdateStatus(int submissionId, string status);
    void UpdateData(int submissionId, string dataJson);
    void Delete(int submissionId);
    void BulkDelete(int formId, int[] submissionIds);
    void InsertValues(int submissionId, List<SubmissionValue> values);
    // Widget data
    void InsertWidgetData(WidgetDataInfo data);
    List<WidgetDataInfo> GetWidgetData(int submissionId, string fieldKey);
    // Search
    void UpsertSearchIndex(SearchIndexInfo index);
}
```

### IFormService (business logic)
```csharp
public interface IFormService
{
    // Uses IFormRepository internally
    FormInfo GetForm(int formId);
    int SaveForm(FormInfo form, int userId);
    void PublishForm(int formId, int userId);
    FormSchema ParseSchema(string schemaJson);
    string GenerateFieldKey(string label, List<FormField> existingFields);
}
```

### ISubmissionService
```csharp
public interface ISubmissionService
{
    // Uses ISubmissionRepository + IFormRepository + IEmailService internally
    Task<SubmissionResult> ProcessSubmissionAsync(int formId, Dictionary<string,object> data,
        string ipAddress, string userAgent, int? userId, double submissionTime);
    SubmissionInfo GetSubmission(int submissionId);
    byte[] ExportToCsv(int formId, DateTime? from, DateTime? to);
}
```

### IEmailService
```csharp
public interface IEmailService
{
    Task SendAsync(string to, string subject, string htmlBody);
    Task SendTemplateAsync(string to, string subject, string template, Dictionary<string,string> tokens);
}
```

### IStorageService
```csharp
public interface IStorageService
{
    Task<string> SaveFileAsync(Stream fileStream, string fileName, string folder);
    Stream GetFile(string filePath);
    void DeleteFile(string filePath);
    string GetFileUrl(string filePath);
}
```

---

## Migration Plan: Step-by-step

### Step 1: Extract Interfaces (NOW — trong DNN project)
- Tạo interfaces trong folder `Interfaces/`
- FormRepository implements IFormRepository (vẫn static bên trong, wrapper method)
- Không cần thay đổi gì ở caller

### Step 2: Move Business Logic to Services
- SubmissionController logic → SubmissionService
- Validation, spam check, email → inject qua interface
- API controllers chỉ còn thin wrapper

### Step 3: Separate Projects (khi bắt đầu Oqtane)
- Tách MegaForm.Core ra project riêng (netstandard2.0)
- DNN project reference Core
- Tạo MegaForm.Oqtane project reference Core
- Implement Oqtane-specific repositories

### Step 4: Asset Sharing
- Assets/ folder shared giữa cả DNN và Oqtane
- Symlink hoặc copy at build time
- JS/CSS hoàn toàn giống nhau

---

## Quy tắc code mới (áp dụng từ bây giờ)

1. **Business logic KHÔNG ĐƯỢC import**:
   - `DotNetNuke.*`
   - `System.Web.*` (WebForms specific)
   - `HttpContext` directly

2. **Repository methods nhận primitive types**, không nhận:
   - `HttpRequest`
   - `ModuleInfo`
   - `UserInfo`
   → API controller extract values rồi pass vào

3. **Models = POCO classes**:
   - Không dùng `[TableName]` hoặc ORM attributes ở Core models
   - DNN/Oqtane data layer map riêng

4. **Services nhận interfaces qua constructor**:
   ```csharp
   public class SubmissionService : ISubmissionService
   {
       private readonly ISubmissionRepository _repo;
       private readonly IFormRepository _formRepo;
       private readonly IEmailService _email;
       
       public SubmissionService(ISubmissionRepository repo, 
           IFormRepository formRepo, IEmailService email)
       {
           _repo = repo;
           _formRepo = formRepo;
           _email = email;
       }
   }
   ```

5. **JavaScript KHÔNG gọi DNN-specific endpoints**:
   - Dùng relative URLs: `/API/MegaForm/...`
   - Oqtane sẽ mount cùng route pattern
   - Anti-forgery token passed từ server → JS config object

---

## Effort Estimation

| Component | DNN (hiện tại) | Port to Oqtane |
|-----------|---------------|----------------|
| MegaForm.Core (interfaces + services) | 3-4 ngày refactor | 0 (giữ nguyên) |
| Data Layer | Đã có (Dapper) | 2-3 ngày (EF Core) |
| API Controllers | Đã có (DnnApi) | 1-2 ngày (ASP.NET Core) |
| Views/Pages | Đã có (ASCX) | 2-3 ngày (Razor) |
| JS/CSS/Plugins | Đã có | 0 (giữ nguyên) |
| DI Registration | N/A | 0.5 ngày |
| Testing | N/A | 2-3 ngày |
| **TOTAL** | **3-4 ngày refactor** | **~8-10 ngày port** |
