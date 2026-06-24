# Báo cáo: Rà soát API/SDK và hướng dẫn tích hợp Blazor / Razor cho MegaForm

> **Trạng thái:** Phân tích & tài liệu — không chứa code sản xuất.  
> **Ngày rà soát:** 2026-06-15.  
> **Mục tiêu:** Tổng hợp tài liệu API/SDK, so sánh với code thực tế, đưa ra hướng dẫn kỹ thuật để (1) viết form trên Blazor và (2) xây dựng phần mềm Razor có khả năng nhập liệu cho MegaForm.

---

## 1. Tóm tắt thực trạng

MegaForm hiện có **hai lớp public surface** chính:

| Surface | Ổn định | Dùng cho | Ghi chú |
|---------|---------|----------|---------|
| `MegaForm.Sdk` (NuGet `0.1.0-preview`) | Cao — có Public API Analyzers, contract tests, package validation | Code .NET chạy in-process với host (Blazor Server, Razor, background job) | Không dùng HTTP; gọi trực tiếp Core repositories. Không chạy được trên Blazor WebAssembly client-side. |
| HTTP REST endpoints | Không chính thức — không có OpenAPI/Postman | JS renderer, tích hợp bên thứ ba, Blazor WebAssembly | Route/shape tương tự trên Oqtane / Web / DNN nhưng không thống nhất 100%. |

**Quan sát quan trọng nhất:**

- Cả Blazor/Oqtane Client lẫn AspNetCore Razor đều **không tự render từng input field** bằng Razor/Blazor component. Chúng chỉ là **"vỏ host"** — load schema JSON từ server, inject JavaScript runtime (`megaform-renderer.js`), và để JS renderer vẽ form DOM, thu thập dữ liệu, validate, rồi POST lên `/api/MegaForm/Submit/Post`.
- SDK `MegaForm.Sdk` mới bổ sung write API (`SubmitAsync`, `CreateFormAsync`, `UpdateFormAsync`, …) và typed schema parsing (`Schema.Parse → FormSchemaInfo`), giúp viết form Blazor **thuần** hoặc **hybrid** trở nên khả thi.
- File upload chưa có trong SDK (`IFileApi` chỉ List/Open). Các widget phức tạp (signature, repeater, payment, captcha, v.v.) vẫn cần JS runtime hoặc phải tái thực hiện.

---

## 2. Rà soát tài liệu API/SDK

### 2.1. Tài liệu có sẵn trong repo

| Tài liệu | Vị trí | Nội dung chính |
|----------|--------|----------------|
| SDK Index | `Docs/SDK_INDEX.md` | Index 4 tài liệu SDK: Writing Data, Schema Reference, Blazor Integration, Roadmap. |
| Writing Data | `Docs/SDK_WRITING_DATA.md` | Hướng dẫn `SubmitAsync`, CRUD, `MegaFormScope`, composite `__mf_parts`, localized errors. |
| Schema Reference | `Docs/SDK_SCHEMA_REFERENCE.md` | `FormSchemaInfo`, `FormFieldInfo`, `FieldValidationInfo`, `FieldOptionInfo`. |
| Blazor Integration | `Docs/SDK_BLAZOR_INTEGRATION.md` | 2 strategies (pure Blazor vs hybrid), POC sketch, `IFormRenderer` design, gaps. |
| SDK README | `MegaForm.Sdk/README.md` | Quick start, DI/non-DI registration, API surface, stability. |
| Public API baselines | `MegaForm.Sdk/PublicAPI.Shipped.txt`, `PublicAPI.Unshipped.txt` | 243 public signatures chưa release. |
| DocFX articles | `Docs/docfx/articles/` | `overview.md`, `quickstart.md`, `oqtane-consumer.md`, `dnn-razor-host.md`, `standalone-host.md`, `api-stability.md`. |

### 2.2. Public API surface của `MegaForm.Sdk`

Entry point:

```csharp
public interface IMegaFormClient
{
    IFormApi       Forms       { get; }
    ISubmissionApi Submissions { get; }
    IFileApi       Files       { get; }
    ISchemaApi     Schema      { get; }
}
```

**Forms:** `CreateFormAsync`, `GetFormAsync`, `ListFormsAsync`, `UpdateFormAsync`, `DeleteFormAsync`.  
**Submissions:** `FindAsync`, `GetAsync`, `SubmitAsync`, `UpdateAsync`, `DeleteAsync`.  
**Files:** `ListForSubmissionAsync`, `OpenAsync` (thiếu `UploadAsync`).  
**Schema:** `Parse(string schemaJson)`, `ParseForm(FormDto form)`.

Các DTO chính: `MegaFormScope`, `FormDto`, `CreateFormRequest`, `UpdateFormRequest`, `FormQuery`, `SubmissionDto`, `SubmissionQuery`, `SubmitResult`, `FileDto`, `MegaFormFileContent`, `PagedResult<T>`, `FormSchemaInfo`, `FormFieldInfo`, `FieldValidationInfo`, `FieldOptionInfo`.

**Đăng ký:**

- DI host: `services.AddMegaFormSdk();` (TryAddScoped).
- Non-DI host (DNN Razor host, `.ascx`): `MegaFormSdk.Initialize(serviceProvider);` rồi `MegaFormSdk.RunAsync(...)`.

### 2.3. HTTP API surface

#### Oqtane Server (`MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`)

Base route: `/api/MegaForm/...`

| Nhóm | Endpoint chính | Auth | Mục đích |
|------|----------------|------|----------|
| Form CRUD | `GET Form/{formId}`, `GET Form/List`, `POST Form`, `DELETE Form/{formId}` | `ViewModule` / `EditModule` | Quản lý form |
| Public | `GET Schema/{formId}`, `POST Submit/Post`, `POST Upload/File` | `[AllowAnonymous]` | Render & submit |
| Submissions | `GET Submissions`, `GET Submissions/{id}`, `POST Submissions/UpdateData`, `DELETE Submissions/{id}` | mixed | Quản lý submission |
| Workflow | `GET Workflow/Inbox`, `POST Workflow/Tasks/Claim|Approve|Reject|...` | authorized | Workflow |
| Field/SQL | `GET Field/Options`, `GET DataRepeater/Query` | anonymous | Cascading/options động |
| Reports/Starter/ModuleConfig/i18n | nhiều | authorized / admin | Admin |

#### Standalone Web Host (`MegaForm.Web/Controllers/MegaFormController.cs`)

Base route: `/api/MegaForm`.

| Nhóm | Endpoint chính | Auth |
|------|----------------|------|
| Form | `GET Form/Get`, `GET Form/ListAll`, `POST Form/Save`, `POST Form/Duplicate`, `GET Form/Stats` | `[Authorize]` |
| Public | `GET Submit/Schema`, `POST Submit/Post`, `POST Upload/File` | `[AllowAnonymous]` |
| Submissions | `GET Submissions/List`, `GET Submissions/Get`, `POST Submissions/UpdateStatus`, `POST Submissions/UpdateData`, `POST Submissions/Delete` | `[Authorize]` |
| Draft | `POST Draft/Save`, `GET Draft/Get` | `[AllowAnonymous]` |
| Files | `GET Files/Download?path=` | `[Authorize]` |

#### DNN Host (`MegaForm.DNN/WebApi/`)

Base route: `/DesktopModules/MegaForm/API/{controller}/{action}`. Các controller tách biệt: `FormController`, `SubmitController`, `SubmissionsController`, `UploadFileController`, `ModuleConfigController`, `WorkflowController`, `DataRepeaterApiController`, v.v.

### 2.4. Những điểm thiếu trong tài liệu/API

1. **Không có OpenAPI/Postman/spec chính thức.** Swashbuckle chỉ reference trong `MegaForm.Web`, bật qua `UseSwagger`.
2. **`IFileApi` chưa có `UploadAsync`.** File upload phải dùng HTTP endpoint trực tiếp.
3. **Không có shared rule evaluator trong SDK.** Conditional `showIf` hiện chỉ có trong JS renderer và server internal (`FormValidationService.EvaluateShowIf`).
4. **`IFormRenderer` contract chưa implement.** Chỉ mới thiết kế.
5. **Oqtane file upload không populate `MF_Files` đầy đủ** — `Files.ListForSubmissionAsync` có thể trả về rỗng dù file đã lưu disk.
6. **DNN `SdkDemoController` không tìm thấy** — endpoint download file qua SDK có thể chưa tồn tại.
7. **`FormDto`/`SubmissionDto` trùng tên** giữa `MegaForm.Sdk` và `MegaForm.Oqtane.Shared.Models` — cần fully qualify trong Blazor.

---

## 3. So sánh code thực tế

### 3.1. Blazor / Oqtane Client (`MegaForm.Oqtane.Client`)

- **Vai trò:** Vỏ host Blazor cho Oqtane module.
- **File chính:** `Index.razor`, `Builder.razor`/`BuilderView.razor`, `Dashboard.razor`/`DashboardView.razor`, `Submissions.razor`/`SubmissionsView.razor`, `SdkDemoView.razor`.
- **Cách render:** `Index.razor` đọc module settings → load form definition qua `MegaFormService.GetFormAsync` → render `<div id="mf-form-{id}">` → `OnAfterRenderAsync` eval JavaScript boot script gọi `MegaFormRenderer.init({...})`. Renderer JS vẽ toàn bộ form.
- **SSR mode (`?mfssr=1`):** `MegaForm.Core.Services.FormHtmlRenderer.RenderFieldsBody(schema, formId, null)` sinh HTML server-side cho native fields; JS hydrate phần còn lại.
- **Nhập liệu:** Hoàn toàn trong DOM do JS renderer tạo. Blazor không bind từng input.
- **Submit:** JS renderer POST `/api/MegaForm/Submit/Post` với body `{ formId, data, submissionTime }`.
- **Service:** `MegaFormService` kế thừa Oqtane `ServiceBase`, tự thêm `authmoduleid`/`authsiteid`.
- **SDK usage:** `SdkDemoView.razor` là ví dụ đọc/list form qua `IMegaFormClient`.

### 3.2. ASP.NET Core / Razor (`MegaForm.AspNetCore.Component` + `MegaForm.Web`)

- **Vai trò:** Host integration package + standalone web host.
- **File chính:**
  - `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`, `MegaFormOptions.cs`, `MegaFormHostHtmlBuilder.cs`, `MegaFormHtmlHelperExtensions.cs`.
  - `MegaForm.Web/Controllers/FormController.cs`, `AdminController.cs`, `MegaFormController.cs`, `RazorWidgetController.cs`.
  - `MegaForm.Web/Views/Form/View.cshtml`, `Views/Admin/Builder.cshtml`, `Views/Admin/Index.cshtml`.
- **Cách render:** `FormController.View(id)` lấy form → `RenderModelResolver.Resolve(...)` → `Views/Form/View.cshtml` inject `_MF_CONFIG` chứa `schemaJson`, `settingsJson`, `themeJson`, `rulesJson` → browser load `megaform-renderer.js` → vẽ form.
- **HTML Helper / Tag Helper:** `@Html.MegaForm(123)`, `<megaform form-id="123" mode="embed">`, `@Html.MegaFormUrl(123)`. 3 mode: `Embed`, `Iframe`, `Link`.
- **Nhập liệu:** Tương tự Oqtane — JS renderer.
- **Submit:** `POST /api/MegaForm/Submit/Post`, body `JObject { formId, data, submissionTime }`. Không dùng strongly-typed model binding.
- **Razor widgets:** Các `.razor` component trong `MegaForm.Web/RazorWidgets/` được render server-side qua `HtmlRenderer.RenderComponentAsync` và inject vào form.

### 3.3. SDK (`MegaForm.Sdk`)

- **Vai trò:** Facade mỏng, stable, host-agnostic.
- **File chính:** `Dtos.cs`, `IMegaFormClient.cs`, `MegaFormClient.cs`, `MegaFormSdk.cs`, `ServiceCollectionExtensions.cs`.
- **Cách hoạt động:** Gọi trực tiếp `IFormRepository`, `ISubmissionRepository`, … của `MegaForm.Core`. Không dùng HTTP.
- **Chạy được khi nào:** Chỉ trong process đã register Core repositories (Oqtane Server, MegaForm.Web, MegaForm.Umbraco, DNN server). Không chạy trong Blazor WebAssembly client.
- **Submit:** `SubmitAsync` có 2 path:
  - Nếu host register `SubmissionProcessor` → full pipeline (validate, anti-spam, DB, notify, workflow, index).
  - Nếu không → fallback validate + insert (thiếu anti-spam/workflow).

### 3.4. Bảng so sánh tổng hợp

| Tiêu chí | Blazor/Oqtane Client | AspNetCore Razor | MegaForm.Sdk |
|----------|----------------------|------------------|--------------|
| **Mục đích** | Host trong Oqtane module | Host standalone / embed vào app Razor | API lập trình cho code .NET |
| **Renderer chính** | JS `MegaFormRenderer.init` | JS `megaform-renderer.js` | Không render — chỉ cung cấp data API |
| **Render field bằng Blazor/Razor?** | Không | Không | N/A |
| **Submit đến đâu** | `/api/MegaForm/Submit/Post` | `/api/MegaForm/Submit/Post` | `client.Submissions.SubmitAsync(...)` |
| **Authentication** | Oqtane module auth + cookie | Cookie/JWT tùy cấu hình | Lấy từ `IPlatformContext` hoặc explicit `MegaFormScope` |
| **File upload** | Endpoint `Upload/File` | Endpoint `Upload/File` | Chưa có `UploadAsync`; dùng HTTP |
| **Conditional logic** | JS renderer + server validate | JS renderer + server validate | Không expose rule evaluator |
| **Widget phức tạp** | JS plugins | JS plugins + Razor widgets | Không hỗ trợ |
| **Multi-tenancy** | Oqtane site/portal | `WebPlatformContext` | `MegaFormScope` |

---

## 4. Hướng dẫn viết form trên Blazor

### 4.1. Điều kiện tiên quyết

1. **Blazor Server / Oqtane server-rendered component:** có thể inject `IMegaFormClient` trực tiếp.
2. **Blazor WebAssembly (client-side):** không dùng được SDK; phải gọi HTTP API của host (Oqtane/Web). Cần `HttpClient`, route `/api/MegaForm/Schema/{formId}` và `/api/MegaForm/Submit/Post`.
3. **Biết `PortalId` / `siteId`**: cần cho `MegaFormScope` hoặc header `X-OQTANE-SITEID`.
4. **Form phải tồn tại và ở trạng thái `Published`** nếu muốn submit qua public endpoint (SDK `SubmitAsync` cũng kiểm tra `Published` khi có `SubmissionProcessor`).

### 4.2. Chiến lược A: Pure Blazor renderer (nhẹ, no-JS)

Phù hợp form chỉ gồm native field types: `Text`, `Email`, `Number`, `Date`, `Url`, `Phone`, `Textarea`, `Select`, `Radio`, `Checkbox`, `Section`, `Html`.

**Các bước:**

1. **Load form & schema**
   - Server-side: `var form = await Mega.Forms.GetFormAsync(formId, scope); var schema = Mega.Schema.ParseForm(form);`
   - WebAssembly: `GET /api/MegaForm/Schema/{formId}` rồi parse JSON thành `FormSchemaInfo` (hoặc tự định nghĩa DTO).
2. **Khởi tạo model**
   - `Dictionary<string, object> values = new();`
   - Với mỗi field `f` trong `schema.Fields.Where(f => f.IsInputField)`, gán giá trị mặc định nếu có `f.Options` với `Selected == true`.
3. **Render field**
   - Duyệt `schema.Fields` theo `Order`.
   - Bỏ qua `Html`, `Section`, `Row`, `UniqueId` (`IsInputField == false`).
   - Với mỗi `f.Type`, chọn Blazor markup tương ứng:
     - `Text`/`Email`/`Url`/`Phone`/`Password` → `<input type="...">` với `@bind`.
     - `Number` → `<input type="number">` + `min`/`max` từ `f.Validation`.
     - `Date` → `<input type="date">`.
     - `Textarea` → `<textarea>`.
     - `Select` → `<select>` với `f.Options`.
     - `Radio` → group radio từ `f.Options`.
     - `Checkbox` → multi-select; server chấp nhận cả `JArray` hoặc chuỗi phân cách dấu phẩy.
     - `Hidden` → `<input type="hidden">`.
     - Plugin type không xác định → placeholder "unsupported".
4. **Client-side validation (tùy chọn)**
   - Mirror từ `f.Validation`: `Required`, `MinLength`, `MaxLength`, `Min`, `Max`, `Pattern`.
   - Không bắt buộc vì server là authority.
5. **Conditional logic (`showIf`)**
   - Đánh giá khi `values` thay đổi.
   - `ShowIfCondition` gồm `Operator` (And/Or) + danh sách `Rules`.
   - Mỗi rule: `Field`, `Condition` (`Equals`, `NotEquals`, `Contains`, `GreaterThan`, `LessThan`, `IsEmpty`, `IsNotEmpty`, `StartsWith`, `EndsWith`), `Value`.
   - Field bị ẩn thì server sẽ bỏ qua validation.
6. **Composite fields**
   - Nếu dùng composite (SSN, DOB, Email confirm, …), gửi kèm `__mf_parts`:
     ```csharp
     data["__mf_parts"] = new Dictionary<string, object>
     {
         [fieldKey] = new Dictionary<string, object> { [partKey] = partValue }
     };
     ```
   - Server strip `__mf_parts` trước khi lưu.
7. **Honeypot & anti-spam**
   - Gửi `__mf_hp` = "" (tên lấy từ schema settings `HoneypotFieldName`, mặc định `__mf_hp`).
   - Gửi `__mf_ts` = timestamp load form.
   - `submissionTime` = số giây user điền form.
8. **File upload**
   - SDK chưa hỗ trợ → dùng HTTP `POST /api/MegaForm/Upload/File` (multipart, `file`, `formId`, `fieldKey`).
   - Response trả về `tempPath`, `fileName`, `fileSize`, `contentType`.
   - Lưu JSON metadata vào `values[fieldKey]`:
     ```json
     [{"fileName":"...","fileSize":...,"tempPath":"...","contentType":"..."}]
     ```
9. **Submit**
   - Server-side SDK: `await Mega.Submissions.SubmitAsync(formId, values, scope);`
   - WebAssembly: `POST /api/MegaForm/Submit/Post` với body `{ formId, data, submissionTime }`.
10. **Xử lý kết quả**
    - Nếu `Success == true`: hiển thị `SuccessMessage` hoặc redirect `RedirectUrl`.
    - Nếu `Success == false`: hiển thị `ErrorMessage` và `ValidationErrors[fieldKey]`.

### 4.3. Chiến lược B: Hybrid — Blazor shell + TS renderer

Giữ nguyên feature parity với form hiện tại (widget, signature, payment, conditional logic, multi-step, v.v.).

**Các bước:**

1. **Tạo Blazor component** chỉ render container `<div @ref="_host"></div>`.
2. **Trong `OnAfterRenderAsync`**, dùng `IJSRuntime` gọi JS shim `megaForm.render(host, formId, schemaJson, settingsJson, themeJson, rulesJson, dotNetRef)`.
3. **JS shim** wrap sẵn có `MegaFormRenderer.init({ container, schema, settingsJson, themeJson, rules, apiBase, onSubmit: ... })`.
4. **Khi user submit**, TS renderer gọi callback `DotNet.invokeMethodAsync('AssemblyName', 'OnComplete', data)`.
5. **Blazor method `[JSInvokable]`** nhận `data` rồi gọi `Mega.Submissions.SubmitAsync(formId, data, scope)` (server-side) hoặc `Http.PostAsJsonAsync` (WebAssembly).
6. **Ưu điểm:** Không cần viết lại renderer; hỗ trợ mọi widget.
7. **Nhược điểm:** Phụ thuộc JS interop; nặng hơn Strategy A.

### 4.4. Skeleton khái niệm (không code sản xuất)

```razor
@* Strategy A — Pure Blazor schema-driven form (conceptual) *@
@inject IMegaFormClient Mega   // server-side only

@if (_schema is null) { <p>Loading…</p> }
else
{
    <form @onsubmit="SubmitAsync" @onsubmit:preventDefault>
        @foreach (var f in _schema.Fields.Where(f => f.IsInputField && !f.Hidden))
        {
            <div class="mf-field" style="@WidthStyle(f)">
                <label>@f.Label @(f.Required ? "*" : "")</label>
                @RenderInput(f)
                @if (_errors.TryGetValue(f.Key!, out var e)) { <span class="mf-err">@e</span> }
            </div>
        }
        <button type="submit" disabled="@_busy">Submit</button>
    </form>
}

@code {
    [Parameter] public int FormId { get; set; }
    [Parameter] public int PortalId { get; set; }

    private FormSchemaInfo? _schema;
    private Dictionary<string, object> _values = new();
    private Dictionary<string, string> _errors = new();
    private bool _busy;

    protected override async Task OnInitializedAsync()
    {
        var form = await Mega.Forms.GetFormAsync(FormId, new MegaFormScope { PortalId = PortalId });
        _schema = form is null ? new FormSchemaInfo() : Mega.Schema.ParseForm(form);
    }

    private async Task SubmitAsync()
    {
        _busy = true; _errors = new();
        var r = await Mega.Submissions.SubmitAsync(FormId, _values, new MegaFormScope { PortalId = PortalId });
        _busy = false;
        if (r.Success) { /* show success / redirect */ }
        else { _errors = r.ValidationErrors ?? new(); }
    }
}
```

### 4.5. Lưu ý quan trọng cho Blazor

- **Tên đầy đủ DTO:** Trong Oqtane, dùng `MegaForm.Sdk.FormDto` để tránh xung đột với `MegaForm.Oqtane.Shared.Models.FormDto`.
- **Scope bắt buộc trên Oqtane:** Oqtane hiện không register `IPlatformContext`, nên mọi call SDK phải truyền `MegaFormScope`.
- **Blazor WebAssembly:** Không inject `IMegaFormClient`. Gọi HTTP API. Chú ý CORS và cookie auth.
- **Widget phức tạp:** Nếu form có plugin field, Strategy A sẽ không render được đúng; hãy dùng Strategy B.
- **File upload:** Luôn cần HTTP endpoint riêng cho đến khi SDK thêm `UploadAsync`.
- **Validation authority:** Server `SubmitResult.ValidationErrors` là chuẩn cuối cùng. Client-side validation chỉ là UX.

---

## 5. Hướng dẫn xây dựng phần mềm Razor có khả năng nhập liệu

### 5.1. Nguyên tắc kiến trúc

Học theo mô hình MegaForm hiện tại:

> **Razor/MVC là "host shell"; engine nhập liệu là JSON schema + JS renderer + API submit JSON tự do.**

Không render từng input bằng Razor model binding. Thay vào đó:

1. Form được định nghĩa bằng JSON schema trong database (`MF_Forms.SchemaJson`).
2. Razor view chỉ load schema, inject config vào client, mount JS renderer.
3. Ngườ dùng nhập liệu trên JS renderer.
4. Submit dưới dạng JSON tự do `{ formId, data: { fieldKey: value } }`.
5. Server validate dựa trên schema, không phải strongly-typed C# model.

### 5.2. Các integration surface đề xuất

| Surface | Cách dùng | Ví dụ |
|---------|-----------|-------|
| **NuGet package / class library** | `AddMegaForm()` / `UseMegaForm()`, tag helper, HTML helper | Tích hợp vào app ASP.NET Core sẵn có |
| **Standalone public page** | `/f/{id}` với layout/card tùy theme | Form landing page |
| **Embed / iframe / link** | `<megaform form-id="123" mode="embed">` | Nhúng vào blog, CMS, portal |
| **Razor widget** | Custom `.razor` component render server-side, emit value vào form | Calculator, editable list, SQL pivot |

### 5.3. Luồng render & submit chi tiết

**GET `/f/{id}` (public form page):**

```
Browser → FormController.View(id)
            ↓
        _formRepo.GetForm(id)
            ↓
        RenderModelResolver.Resolve(schemaJson, settingsJson, themeJson, rulesJson)
            ↓
        FormViewModel { FormId, SchemaJson, SettingsJson, ThemeJson, RulesJson, ... }
            ↓
        Views/Form/View.cshtml
            ↓
        Inject _MF_CONFIG { formId, schemaJson, settingsJson, themeJson, rulesJson, apiBase }
            ↓
        Browser load megaform-renderer.js → init() → vẽ DOM
```

**POST submit:**

```
Browser JS → POST /api/MegaForm/Submit/Post
                body: { formId, data, submissionTime }
                ↓
            MegaFormController.Submit
                ↓
            SubmissionProcessor.ProcessAsync
                ↓
            FormValidationService.Validate(schema, data, loc)
                ↓
            AntiSpamService.CheckSubmission
                ↓
            Save submission → MF_Submissions + MF_SubmissionValues
                ↓
            Workflow / notifications / reporting index
                ↓
            Response { success, submissionId, successMessage, redirectUrl }
```

### 5.4. Extension points để customize

1. **Override DI services** trước `AddMegaForm()`:
   - `IFormRepository`, `ISubmissionRepository`, `IStorageService`, `IEmailSender`, `ILogService`, `ILocalizationProvider`, `IWorkflowEngine`.
2. **Thêm Razor widget** mới:
   - Tạo `.razor` kế thừa `MfRazorWidgetBase`.
   - Đánh dấu `[RazorTemplate("Name", Category = "...", SupportsSql = true, EmitsValue = true)]`.
   - Register trong `RazorWidgetRegistry` hoặc JIT compile qua `RazorCompilationService`.
3. **Tùy chỉnh theme/CSS**:
   - `ThemePresetInlineCssService` sinh inline CSS từ theme JSON.
   - Schema settings cho phép custom HTML/CSS.
4. **Tùy chỉnh route prefix**:
   - `MegaFormOptions.ApiRoutePrefix`, `FormRoutePrefix`, `AdminRoutePrefix`, v.v.
   - `MegaFormRoutePrefixConvention` rewrite attribute routes.

### 5.5. Ví dụ khái niệm: Razor Pages nhúng form

```razor
@* Pages/Contact.cshtml *@
@page
@model ContactModel

@if (Model.FormId > 0)
{
    <megaform form-id="@Model.FormId" mode="embed" theme="corporate"></megaform>
}
```

```csharp
// Pages/Contact.cshtml.cs
public class ContactModel : PageModel
{
    private readonly IFormRepository _formRepo;
    public int FormId { get; private set; }

    public ContactModel(IFormRepository formRepo) => _formRepo = formRepo;

    public void OnGet()
    {
        var form = _formRepo.ListForms(portalId: 0, status: "published", pageSize: 1).FirstOrDefault();
        FormId = form?.FormId ?? 0;
    }
}
```

### 5.6. Nếu muốn render form trực tiếp bằng Razor (ít khuyến khích)

Nếu bắt buộc phải dùng Razor model binding truyền thống:

1. Dùng `MegaForm.Sdk` hoặc `IFormRepository` để lấy `FormDto`.
2. `Schema.ParseForm(form)` để có metadata field.
3. Tạo dynamic model (e.g., `Dictionary<string, object>` hoặc `ExpandoObject`).
4. Trong Razor view, loop fields và render `@Html.TextBox(fieldKey, model[fieldKey])`, `@Html.DropDownList`, v.v.
5. POST action nhận `Dictionary<string, object>` hoặc `IFormCollection`, rồi gọi `SubmissionProcessor.ProcessAsync` hoặc `client.Submissions.SubmitAsync`.
6. Nhược điểm: mất conditional logic, widget, multi-step, file upload phức tạp.

---

## 6. Gaps, rủi ro và khuyến nghị

### 6.1. Gaps hiện tại

| # | Gap | Ảnh hưởng | Mitigation tạm thờ |
|---|-----|-----------|-------------------|
| 1 | `IFileApi.UploadAsync` chưa có | Strategy A pure-Blazor không upload file qua SDK | Dùng HTTP `POST /api/MegaForm/Upload/File` |
| 2 | Không có shared `IFormRuleEvaluator` trong SDK | Conditional logic bị drift giữa Blazor và JS | Mirror `ShowIf` trong Blazor; dựa server validation |
| 3 | Oqtane upload không populate `MF_Files` | `Files.ListForSubmissionAsync` trả về rỗng | Dùng `SdkDemo/Download?path=` fallback |
| 4 | DNN `SdkDemoController` không tìm thấy | Download file SDK trên DNN chưa chắc có | Tự tạo DNN API wrapper |
| 5 | Không có OpenAPI/Postman | Tích hợp bên thứ ba khó khăn | Tạo spec từ Swashbuckle của `MegaForm.Web` |
| 6 | `FormDto`/`SubmissionDto` trùng tên | Ambiguous reference trong Oqtane | Fully qualify `MegaForm.Sdk.FormDto` |

### 6.2. Rủi ro kỹ thuật

1. **Drift giữa client và server validation.** Nếu Blazor mirror validation rules nhưng server cập nhật logic, form sẽ bị lỗi không đồng nhất.
2. **Cross-tenant leak.** Quên truyền `MegaFormScope` trong Oqtane có thể dẫn đến `InvalidOperationException` hoặc nhầm portal.
3. **File upload security.** Cần validate extension, size, content type trên server; đừng tin client.
4. **Blazor WebAssembly CORS.** Nếu host và client khác origin, cần cấu hình CORS + credentials.
5. **JS interop leak.** Strategy B cần cleanup listener/DotNetObjectReference khi component dispose.

### 6.3. Khuyến nghị

1. **Ưu tiên Strategy B (hybrid)** cho form production để giữ feature parity.
2. **Dùng Strategy A** chỉ cho form đơn giản, no-JS, embed nhẹ.
3. **Luôn dựa server validation** làm authority; client validation chỉ là UX.
4. **Bổ sung `IFileApi.UploadAsync`** vào SDK trong phase tiếp theo.
5. **Expose `IFormRuleEvaluator`** từ Core qua SDK để Blazor và JS dùng chung logic conditional.
6. **Tạo OpenAPI spec** từ `MegaForm.Web` và publish kèm tài liệu.
7. **Viết contract test** cho Blazor integration khi bắt đầu implement.

---

## 7. Decision matrix

| Kịch bản | Khuyến nghị | Lý do |
|----------|-------------|-------|
| Blazor Server trong Oqtane, form đơn giản | Strategy A pure-Blazor | Nhẹ, SSR-friendly, không cần JS |
| Blazor Server trong Oqtane, form phức tạp | Strategy B hybrid | Giữ widget, signature, payment, workflow |
| Blazor WebAssembly client-side | HTTP API + Strategy A hoặc B | SDK không chạy ngoài server process |
| Razor Pages/MVC app mới | NuGet `MegaForm.AspNetCore.Component` + tag helper | Nhanh, feature-complete |
| Razor app cần control hoàn toàn UI | Strategy A + custom Razor host | Tự render nhưng mất một số feature |
| DNN Razor Host | `MegaFormSdk.RunAsync(...)` + HTTP upload | Non-DI, net472 compatible |

---

## 8. Kết luận

MegaForm đã có nền tảng đủ để viết form Blazor và phần mềm Razor nhập liệu:

- `MegaForm.Sdk` cung cấp typed schema (`FormSchemaInfo`) và write API (`SubmitAsync`, CRUD forms/submissions).
- Code thực tế (Oqtane Blazor Client, AspNetCore Razor) đều chứng minh mô hình **schema-driven + JS renderer + API submit JSON**.
- Có thể chọn **Strategy A (pure Blazor)** cho form đơn giản hoặc **Strategy B (hybrid)** cho form phức tạp.
- Các gap chính là file upload SDK, shared rule evaluator, và tài liệu API spec — cần lưu ý khi triển khai.

Báo cáo này chỉ là phân tích & hướng dẫn. Các bước tiếp theo (nếu cần) sẽ là thiết kế chi tiết component, viết proof-of-concept, hoặc implement các gap trên.

---

## Phụ lục: Các file nguồn đã tham chiếu

- `MegaForm.Sdk/Dtos.cs`, `IMegaFormClient.cs`, `MegaFormClient.cs`, `MegaFormSdk.cs`, `ServiceCollectionExtensions.cs`, `README.md`, `PublicAPI.Unshipped.txt`
- `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`
- `Docs/SDK_INDEX.md`, `Docs/SDK_WRITING_DATA.md`, `Docs/SDK_SCHEMA_REFERENCE.md`, `Docs/SDK_BLAZOR_INTEGRATION.md`
- `MegaForm.Oqtane.Client/Index.razor`, `Builder.razor`, `BuilderView.razor`, `Dashboard.razor`, `Services/MegaFormService.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`, `Services/Startup.cs`, `OqtanePlatformContext.cs`
- `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs`
- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`, `MegaFormOptions.cs`, `MegaFormHostHtmlBuilder.cs`, `MegaFormRoutePrefixConvention.cs`
- `MegaForm.Web/Controllers/FormController.cs`, `MegaFormController.cs`, `RazorWidgetController.cs`, `Views/Form/View.cshtml`
- `MegaForm.Web/RazorWidgets/*.razor`
- `Samples/AspNetCoreHost/Program.cs`, `Samples/CorporateWeb/Pages/Contact.cshtml`
- `MegaForm.DNN/WebApi/MegaFormApiController.cs`
