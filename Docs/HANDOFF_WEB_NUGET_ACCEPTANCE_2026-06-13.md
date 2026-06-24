# Handoff — MegaForm.Web NuGet Project

**Ngày:** 2026-06-13  
**Ngườі gửі:** Kimi Code CLI  
**Ngườі nhận:** Phiên làm việc tiếp theo / QA / DevOps  

---

## 1. Mục tiêu dự án

Chuyển `MegaForm.Web` từ một ứng dụng ASP.NET Core độc lập (standalone host) thành **thư viện NuGet có thể tái sử dụng**, theo phương án **Option B — Clean Refactor** đã được phê duyệt.

### Definition of Done
- `MegaForm.Web` chỉ còn là Razor Class Library (RCL): controllers, views, services, DbContext, middleware, static assets.
- Một host riêng (`MegaForm.Web.Host`) chạy được bằng cách gọi 2–3 dòng API.
- Gói NuGet `MegaForm.AspNetCore.Component` có thể cài vào bất kỳ ASP.NET Core host nào.
- Consumer không cần biết chi tiết nội bộ của MegaForm.
- Static assets (CSS/JS) được phục vụ tự động trong host consumer.
- Đầy đủ multi-DB: SQL Server, SQLite, PostgreSQL, MySQL.

---

## 2. Kiến trúc hiện tại

```
Consumer ASP.NET Core host
        │
        ├─ PackageReference: MegaForm.AspNetCore.Component
        │           └─ Depends on: MegaForm.Web (RCL + static assets)
        │           └─ Depends on: MegaForm.Core
        │
        └─ Program.cs:
                builder.AddMegaForm(options => { ... });
                var app = builder.Build();
                app.EnsureMegaFormDatabaseReady();
                app.UseMegaForm();
```

### Các project liên quan

| Project | Vai trò | SDK | Packable |
|---------|---------|-----|----------|
| `MegaForm.Core` | Models, interfaces, services, workflow engine dùng chung | `Microsoft.NET.Sdk` multi-target | Có (dependency) |
| `MegaForm.Web` | Razor Class Library: controllers, views, middleware, DbContext, wwwroot | `Microsoft.NET.Sdk.Razor` | Có (1.7.0) |
| `MegaForm.Web.Host` | Standalone host dùng để dev/test | `Microsoft.NET.Sdk.Web` | Không |
| `MegaForm.AspNetCore.Component` | API đơn giản hóa cho consumer | `Microsoft.NET.Sdk` | Có (0.2.0-preview) |

---

## 3. API tích hợp cho consumer

### Cơ bản
```csharp
using MegaForm.AspNetCore.Component;

var builder = WebApplication.CreateBuilder(args);
builder.AddMegaForm();

var app = builder.Build();
app.EnsureMegaFormDatabaseReady();
app.UseMegaForm();
app.Run();
```

### Với tùy chọn
```csharp
builder.AddMegaForm(options =>
{
    options.UseSqlServer("Server=.;Database=MegaForm;Trusted_Connection=true;");
    options.UseMegaFormAuthentication = true;
    options.AuthenticationSchemeName = "MegaFormAuth";
    options.LoginPath = "/admin/login";
    options.UseSwagger = builder.Environment.IsDevelopment();
    options.JwtKey = builder.Configuration["Jwt:Key"];
});
```

> `builder.AddMegaForm()` gọi `WebHost.UseStaticWebAssets()` để static assets của `MegaForm.Web` được phục vụ trong mọi environment (không chỉ Development).

### Tùy chọn quan trọng

| Nhóm | Thuộc tính | Mặc định | Ghi chú |
|------|-----------|----------|---------|
| Database | `DatabaseProvider`, `ConnectionString`, `ConfigureDbContext` | SqlServer | Hỗ trợ SqlServer/Sqlite/PostgreSql/MySql |
| Routes | `ApiRoutePrefix`, `PopupApiRoutePrefix`, `AiApiRoutePrefix`, `AdminRoutePrefix`, `SetupRoutePrefix`, `FormRoutePrefix`, `DocumentsRoutePrefix` | `/api/MegaForm`, `/api/MegaFormPopup`, `/api/MegaFormAi`, `/admin`, `/setup`, `/f`, `/documents` | Có thể đổi prefix qua `MegaFormRoutePrefixConvention` |
| Auth | `UseMegaFormAuthentication`, `AuthenticationSchemeName`, `CookieName`, `LoginPath`, `LogoutPath`, `AccessDeniedPath`, `JwtKey` | true, "MegaFormAuth" | Tắt bằng `UseMegaFormAuthentication = false` nếu host đã có Identity |
| Features | `UseSetupWizard`, `UseCors`, `UseSwagger`, `AutoEnsureDatabase` | true, true, false, true | |
| Host | `BaseUrl`, `ContentRootPath`, `StorageRootPath`, `TemplatesPath` | | Dùng cho storage service, templates |

---

## 4. Acceptance criteria & cách kiểm tra

### 4.1 Build toàn bộ solution

```bash
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
dotnet build MegaForm.sln --nologo
```

**Acceptance:** `0 Error(s)`, warnings chỉ là các warnings hiện có về package version / DNN / Umbraco / Oqtane.

### 4.2 Pack các gói NuGet

```bash
dotnet pack MegaForm.Core/MegaForm.Core.csproj --nologo -o dist/pack
dotnet pack MegaForm.Web/MegaForm.Web.csproj --nologo -o dist/pack
dotnet pack MegaForm.AspNetCore.Component/MegaForm.AspNetCore.Component.csproj --nologo -o dist/pack
```

**Acceptance:**
- `MegaForm.Core.1.5.0.nupkg` được tạo.
- `MegaForm.Web.1.7.0.nupkg` được tạo.
- `MegaForm.AspNetCore.Component.0.2.0-preview.nupkg` được tạo.
- Trong `MegaForm.AspNetCore.Component.nuspec` phải có dependencies:
  ```xml
  <dependency id="MegaForm.Core" version="1.5.0" />
  <dependency id="MegaForm.Web" version="1.7.0" />
  ```
- `MegaForm.Web.nupkg` phải chứa `staticwebassets/` (CSS/JS) và `build/Microsoft.AspNetCore.StaticWebAssets.props`.
- `MegaForm.AspNetCore.Component.nupkg` **không** được chứa `MegaForm.Web.dll` (tránh duplicate).

### 4.3 Kiểm tra static assets

```bash
cd dist/pack
unzip -l MegaForm.Web.1.7.0.nupkg | grep staticwebassets | head
```

**Acceptance:** Có các file `staticwebassets/megaform/css/*.css`, `staticwebassets/megaform/js/*.js`.

### 4.4 Chạy standalone host

```bash
cd MegaForm.Web.Host
dotnet run
```

**Acceptance:**
- App khởi động không crash.
- Truy cập `https://localhost:5001/setup` nếu chưa setup.
- Sau setup, `/admin` mở dashboard.
- `/f/{id}` hiển thị form công khai.
- `/api/MegaForm/Form/List` trả về JSON.

### 4.5 Kiểm tra consumer mới

Project demo đã được tạo tại `Samples/AspNetCoreHost`. Project này tham chiếu đến gói NuGet local thay vì project reference:

`Samples/AspNetCoreHost/AspNetCoreHost.csproj`:
```xml
<ItemGroup>
  <PackageReference Include="MegaForm.AspNetCore.Component" Version="0.2.0-preview" />
</ItemGroup>
```

`Samples/AspNetCoreHost/nuget.config`:
```xml
<configuration>
  <packageSources>
    <clear />
    <add key="local" value="..\..\dist\pack" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
```

`Samples/AspNetCoreHost/Program.cs`:
```csharp
using MegaForm.AspNetCore.Component;

var builder = WebApplication.CreateBuilder(args);
builder.AddMegaForm(options =>
{
    options.UseSqlite(builder.Configuration.GetConnectionString("MegaForm"));
    options.UseMegaFormAuthentication = true;
});
var app = builder.Build();
app.EnsureMegaFormDatabaseReady();
app.UseMegaForm();
app.MapGet("/", () => Results.Redirect("/admin"));
app.Run();
```

**Acceptance:**
- `dotnet run` khởi động thành công.
- `/admin`, `/setup`, `/f/{id}`, `/api/MegaForm/*` đều hoạt động.
- Static assets phục vụ tại `/megaform/css/*` và `/megaform/js/*`.

### 4.6 Kiểm tra route prefix tùy chỉnh

Trong consumer, đổi prefix:

```csharp
options.ApiRoutePrefix = "/api/forms";
options.AdminRoutePrefix = "/portal/admin";
options.FormRoutePrefix = "/forms";
```

**Acceptance:**
- `/api/forms/Form/ListAll` hoạt động (trả về 302 challenge khi chưa đăng nhập).
- `/portal/admin` mở dashboard.
- `/forms/{id}` hiển thị form.
- Setup middleware redirect đúng đến prefix setup tùy chỉnh (`/start`).
- Các redirect trong controller (setup → admin, v.v.) sử dụng `IMegaFormRouteOptions` nên không còn hard-code `/admin`/`/setup`.

### 4.7 Kiểm tra tích hợp với host có Identity sẵn

```csharp
options.UseMegaFormAuthentication = false;
```

**Acceptance:**
- Không đăng ký scheme `MegaFormAuth`.
- Không xung đột với Identity/Auth của host.
- Các controller MegaForm vẫn load (có thể cần authorize policy của host).

### 4.9 Demo app sử dụng NuGet package

Đã xây project demo tại `Samples/AspNetCoreHost` sử dụng gói `MegaForm.AspNetCore.Component` từ `dist/pack`:

```bash
cd Samples/AspNetCoreHost
dotnet run --no-launch-profile --urls "http://localhost:5039"
```

Kiểm tra nhanh:
- `GET /` redirect đến `/admin`.
- `GET /setup` trả về setup wizard (200).
- `GET /megaform/css/megaform.css` và `/megaform/js/megaform-renderer.js` trả về 200.

**Acceptance:**
- Project chỉ tham chiếu package `MegaForm.AspNetCore.Component` (không project reference).
- Khởi động được mà không cần copy `wwwroot` hay code nội bộ của MegaForm.
- Static assets tự động phục vụ tại `/megaform/*` trong cả Production.

### 4.10 Corporate website sample

Đã xây project minh họa website doanh nghiệp tại `Samples/CorporateWeb`, sử dụng gói `MegaForm.AspNetCore.Component` từ `dist/pack`:

```bash
cd Samples/CorporateWeb
dotnet run
```

Cấu trúc:
- `/` — landing page.
- `/Details` — giải thích cách tích hợp MegaForm.
- `/Contact` — nhúng MegaForm contact form qua TagHelper `<megaform>`.
- `/admin` — MegaForm admin console.

`Samples/CorporateWeb/Contact.cshtml`:
```cshtml
<megaform form-id="@Model.FormId" mode="embed" min-height="720" theme="corporate"></megaform>
```

`SetupCompletionService` tự động tạo `setup.lock`, `appsettings.Production.json` và seed admin credentials khi app khởi động lần đầu, nên không cần chạy setup wizard.

`ContactFormSeeder` tự động tạo published form "Contact Us" khi app khởi động lần đầu.

Đăng nhập admin: **admin / admin123**.

**Acceptance:**
- `dotnet run` khởi động thành công trên `http://localhost:5041`.
- Trang `/Contact` hiển thị form đầy đủ (Full Name, Email, Phone, ...).
- Không có console error (ngoài warning thông thường).
- Static assets MegaForm phục vụ tại `/megaform/*`.

### 4.8 Multi-DB

Thay đổi connection string và provider trong `appsettings.json`:

```json
{
  "ConnectionStrings": { "MegaForm": "..." },
  "Database": { "Provider": "PostgreSql" }
}
```

**Acceptance:**
- App khởi động với provider tương ứng.
- Bảng MegaForm được tạo tự động (nếu `AutoEnsureDatabase = true`).

---

## 5. Known issues & limitations

| Issue | Mức độ | Ghi chú |
|-------|--------|---------|
| Warnings `Microsoft.IdentityModel.*` 8.3.2 → 8.4.0 | Thấp | Không chặn build/runtime |
| Warnings DNN/Umbraco obsolete APIs | Thấp | Không liên quan Web stack |
| `MailKit`/`MimeKit` vulnerabilities trong Oqtane | Trung bình | Cần update Oqtane packages riêng |
| Consumer phải tự map route gốc `/` | Thiết kế | Host giữ quyền kiểm soát root |
| `MegaForm.Web.Host` vẫn dùng `MapGet("/", ...)` | Thiết kế | Minh họa cách consumer redirect |
| Một số Razor view vẫn hard-code `/admin`/`/setup` | Thấp | Cần cập nhật nếu dùng prefix tùy chỉnh (controller redirects đã xử lý) |
| Nếu dùng `builder.Services.AddMegaForm(...)` thay vì `builder.AddMegaForm(...)` | Thấp | Static web assets chỉ tự động phục vụ trong Development; dùng `builder.AddMegaForm()` để hỗ trợ mọi environment |

---

## 6. Các bước tiếp theo đề xuất

1. **Viết integration tests** cho `MegaForm.AspNetCore.Component` với `WebApplicationFactory`:
   - Test default routes.
   - Test custom route prefixes.
   - Test static assets serving.
   - Test setup wizard redirect.

2. **CI/CD packaging**:
   - Thêm `dotnet pack` vào pipeline cho `MegaForm.Core`, `MegaForm.Web`, `MegaForm.AspNetCore.Component`.
   - Push các gói lên NuGet feed nội bộ hoặc public.

3. **Consumer sample projects** ✅ **Đã hoàn thành**:
   - Đã tạo `Samples/AspNetCoreHost` sử dụng package `MegaForm.AspNetCore.Component` từ local feed.
   - Đã bổ sung `Samples/AspNetCoreHost/README.md` hướng dẫn chạy và custom prefix demo.
   - Đã tạo `Samples/CorporateWeb` — website doanh nghiệp với landing/details/contact, nhúng MegaForm contact form qua TagHelper.

4. **Tinh chỉnh static assets**:
   - Đảm bảo tất cả JS bundles sử dụng `window.__MF_API_BASE__` hoặc relative URL.
   - Kiểm tra embed iframe hoạt động khi route prefix thay đổi.

5. **Auth integration nâng cao**:
   - Cung cấp policy/role mapping từ host Identity vào MegaForm permissions.

6. **Cleanup**:
   - Kiểm tra `MegaForm.Web.Host` không còn code thừa.
   - Cập nhật version lên `1.0.0` khi sẵn sàng release.

---

## 7. Liên hệ & tài liệu

- Báo cáo tiến độ: `Docs/WEB_NUGET_CONVERSION_PROGRESS_2026-06-13.md`
- README consumer: `MegaForm.AspNetCore.Component/README.md`
- Audit feature parity: `Docs/WEB_OQTANE_FEATURE_PARITY_AUDIT_2026-06-13.md`
