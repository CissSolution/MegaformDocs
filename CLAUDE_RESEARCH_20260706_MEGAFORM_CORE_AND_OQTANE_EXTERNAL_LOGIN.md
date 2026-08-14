# Nghiên cứu: MegaForm Core & Tích hợp Oqtane External Login (Google/LinkedIn)

> **Phạm vi:** Chỉ viết tài liệu, không code.  
> **Thư mục gốc khảo sát:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
> **Ngày:** 2026-07-06

---

## 1. Mục đích

Tài liệu này tổng hợp kết quả nghiên cứu source code MegaForm, tập trung vào:

1. **MegaForm Core** — phần code dùng chung cho DNN, Oqtane, Umbraco và các host ASP.NET Core khác.
2. **Cơ chế tích hợp Oqtane** — cách MegaForm cắm vào Oqtane Framework.
3. **Trạng thái External Login / Social Login** — hiện tại MegaForm đã có gì, chưa có gì.
4. **Cơ chế External Login Providers của Oqtane** — Google, LinkedIn, OAuth 2.0, OpenID Connect.
5. **Phân tích và khuyến nghị** để bật Google/LinkedIn Sign Up cho MegaForm trên Oqtane mà không cần sửa code MegaForm (config-only).

---

## 2. Tổng quan kiến trúc MegaForm Core

### 2.1. Các project chính

| Project | Nền tảng | Vai trò |
|---|---|---|
| `MegaForm.Core` | Shared / Multi-target | Business logic, models, interfaces, workflow, permission, submission processing. |
| `MegaForm.Sdk` | Shared / Multi-target | Public facade `IMegaFormClient`, dùng chung cho mọi host. |
| `MegaForm.AspNetCore.Component` | Shared / ASP.NET Core | NuGet package tích hợp MegaForm vào bất kỳ host ASP.NET Core. |
| `MegaForm.UI` | Shared / Frontend | TypeScript/Vite UI: builder, renderer, dashboard, workflow inbox. |
| `MegaForm.DNN` | DNN 9.x | Module DNN, WebAPI, ASCX views, `net472`. |
| `MegaForm.Oqtane.Client` | Oqtane | Blazor WebAssembly components. |
| `MegaForm.Oqtane.Server` | Oqtane | API controllers, EF Core repositories, platform adapters. |
| `MegaForm.Oqtane.Shared` | Oqtane | DTOs, constants, asset version. |
| `MegaForm.Oqtane.Package` | Oqtane | NuGet packaging. |
| `MegaForm.Umbraco` | Umbraco 14+ | Razor Class Library (Bellissima). |
| `MegaForm.Web` | Standalone | Host ASP.NET Core độc lập với admin UI. |

### 2.2. Core dùng chung như thế nào?

`MegaForm.Core` sử dụng **multi-targeting**:

```xml
<TargetFrameworks>net472;net8.0;net9.0;net10.0</TargetFrameworks>
```

- `net472` → DNN (ASP.NET Framework).
- `net8.0/net9.0/net10.0` → Oqtane, Umbraco, ASP.NET Core standalone.

Các nền tảng không chứa business logic submission/workflow/permission riêng mà **implement các abstraction của Core**:

| Abstraction (Core) | Oqtane Implementation |
|---|---|
| `IFormRepository`, `ISubmissionRepository`, ... | `EfFormRepository`, `EfSubmissionRepository` trong `MegaForm.Oqtane.Server/Data/` |
| `IPlatformContext` | `OqtanePlatformContext` |
| `IPermissionPrincipalCatalogProvider` | `OqtanePermissionPrincipalCatalogProvider` |
| `IWorkflowIdentityProvisioningService` | `OqtaneWorkflowIdentityProvisioningService` |
| `IEmailSender` | `OqtaneEmailSender` |
| `ILogService` | `OqtaneLogService` |
| `IStorageService` | `OqtaneStorageService` |

### 2.3. Các namespace/class quan trọng

- **Users / Auth / Roles:**
  - `MegaForm.Core.Services.UserContext`
  - `MegaForm.Core.Interfaces.IPlatformContext`
  - `MegaForm.Core.Interfaces.IWorkflowIdentityProvisioningService`
  - `MegaForm.Core.Workflow.IdentityNodeExecutors` (AddRole/AddUser/AddUserToRole)

- **Permissions:**
  - `MegaForm.Core.Services.PermissionService`
  - `MegaForm.Core.Services.PermissionCatalogService`
  - `MegaForm.Core.Interfaces.IPermissionPrincipalCatalogProvider`

- **Submissions:**
  - `MegaForm.Core.Services.SubmissionProcessor`
  - `MegaForm.Core.Services.SubmissionQueryService`
  - `MegaForm.Core.Interfaces.ISubmissionRepository`

### 2.4. Cách DI được đăng ký

- **Oqtane:** `MegaForm.Oqtane.Server/Services/Startup.cs` implement `IServerStartup`.
- **Umbraco:** `MegaForm.Umbraco/Composers/MegaFormComposer.cs` implement `IComposer`.
- **Standalone Web:** `MegaForm.Web/Program.cs` register trực tiếp.
- **DNN:** `MegaForm.DNN/Services/DnnServiceLocator.cs` — service locator singleton.

---

## 3. Cách MegaForm tích hợp với Oqtane

### 3.1. Module registration

File: `MegaForm.Oqtane.Client/ModuleInfo.cs`

```csharp
public class ModuleInfo : IModule
{
    public ModuleDefinition ModuleDefinition => new ModuleDefinition
    {
        Name = "MegaForm",
        ServerManagerType = "MegaForm.Oqtane.Server.MegaFormManager, MegaForm.Oqtane.Server.Oqtane",
        SettingsType = "MegaForm.Client.Settings, MegaForm.Oqtane.Client.Oqtane",
        PackageName = "MegaForm.Oqtane",
        // ...
    };
}
```

### 3.2. Server startup

File: `MegaForm.Oqtane.Server/Services/Startup.cs`

```csharp
public class MegaFormServerStartup : IServerStartup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddDbContextFactory<MegaFormDbContext>(...);
        services.AddScoped<IFormRepository, EfFormRepository>();
        services.AddScoped<ISubmissionRepository, EfSubmissionRepository>();
        services.AddScoped<IPlatformContext, OqtanePlatformContext>();
        services.AddScoped<IPermissionPrincipalCatalogProvider, OqtanePermissionPrincipalCatalogProvider>();
        services.AddScoped<IWorkflowIdentityProvisioningService, OqtaneWorkflowIdentityProvisioningService>();
        services.AddScoped<SubmissionProcessor>();
        services.AddScoped<WorkflowEngineV2>();
        services.AddMegaFormSdk();
        // ...
    }
}
```

**Quan trọng:** Oqtane host tự động discover và gọi `IServerStartup` của module. MegaForm module **không có `Program.cs`/`Startup.cs` riêng**.

### 3.3. Controllers và Authorization

File: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`

```csharp
[IgnoreAntiforgeryToken]
[Route(ControllerRoutes.ApiRoute)]
public partial class MegaFormController : ModuleControllerBase
{
    [HttpGet("Form/Get")]
    [Authorize(Policy = "ViewModule")]
    public IActionResult GetForm(int id) { ... }

    [HttpPost("Form/Save")]
    [Authorize(Policy = "EditModule")]
    public IActionResult SaveForm([FromBody] FormInfo form) { ... }
}
```

- `ViewModule` / `EditModule` là policies có sẵn của Oqtane.
- `ModuleControllerBase` cung cấp `User` (`ClaimsPrincipal`) và `AuthEntityId`.

### 3.4. User context

File: `MegaForm.Oqtane.Server/Services/OqtanePlatformContext.cs`

```csharp
public sealed class OqtanePlatformContext : IPlatformContext
{
    public int PortalId => ParsePositiveInt(Header("X-OQTANE-SITEID"));
    public int ModuleId => ParsePositiveInt(Header("X-OQTANE-MODULEID"));
    public int UserId => int.TryParse(User?.FindFirst("sub")?.Value
                     ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var v) ? v : -1;
    public bool IsAdmin => User != null && (User.IsInRole("Host")
                        || User.IsInRole("Administrators") || User.IsInRole("Admin"));
}
```

### 3.5. Auth token từ client

File: `MegaForm.Oqtane.Client/Index.razor` truyền `SiteState.AuthorizationToken` xuống JS.

File: `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-oqtane-auth.js` tự động thêm header:

```javascript
merged['Authorization'] = 'Bearer ' + token;
```

cho các request đến `/api/MegaForm*` và `/api/Ai*`.

---

## 4. Trạng thái hiện tại: External Login trong MegaForm

### 4.1. Kết luận

| Yêu cầu | Trạng thái |
|---|---|
| External Login / OAuth / OIDC cho end-user | **Chưa có** trong source MegaForm |
| Google / LinkedIn Sign Up | **Chưa có** code xử lý |
| ASP.NET Identity / SignInManager / ExternalLoginInfo | **Không xuất hiện** |
| OAuth duy nhất tìm thấy | Google Service Account JWT cho **Google Sheets** (server-to-server) |
| Tài liệu về Oqtane External Login | Ghi chú pending trong `CLAUDE_HANDOFF_20260706_PRESET_WIRE_AND_OUTBACK.md` |

### 4.2. Auth hiện tại theo nền tảng

- **Oqtane:** MegaForm dùng auth cookie + AuthorizationToken của host Oqtane. Không can thiệp vào quá trình đăng nhập.
- **Web standalone:** Cookie + JWT tùy chỉnh, login bằng username/password.
- **DNN:** Dùng auth của DNN.
- **Umbraco:** Dùng OpenIddict của Umbraco.

### 4.3. Ý nghĩa

MegaForm hiện tại **không tự triển khai** external login. Trên Oqtane, nó hoàn toàn dựa vào cơ chế xác thực của host Oqtane. Việc "bật Google/LinkedIn login" sẽ là cấu hình ở **tầng Oqtane host**, không phải thay đổi code MegaForm.

---

## 5. Cơ chế External Login Providers của Oqtane

### 5.1. Tổng quan

Oqtane Framework hỗ trợ đăng nhập bên ngoài qua:

- **OAuth 2.0**
- **OpenID Connect (OIDC)**

Kể từ Oqtane 3.1, tính năng này được tích hợp sẵn và có thể cấu hình trực quan trong Admin Dashboard.

### 5.2. Cấu hình trên UI

Đường dẫn:

```
Control Panel -> Admin Dashboard -> User Management -> Settings -> External Login Settings
```

Các tùy chọn chính:

- **Provider**: chọn provider có sẵn hoặc nhập thủ công.
- **Provider Type**: `OIDC` hoặc `OAuth2`.
- **Provider Name**: tên hiển thị trên trang Login.
- **Client ID / Client Secret**.
- **Authority / Metadata Url**.
- **Scopes**: ví dụ `openid,profile,email`.
- **Claim mappings**: Identifier, Name, Email, Role.

### 5.3. Cấu hình Google (OIDC)

| Setting | Giá trị |
|---|---|
| Provider Type | `OIDC` |
| Provider Name | `Google` |
| Authority | `https://accounts.google.com` |
| Metadata Url | `https://accounts.google.com/.well-known/openid-configuration` |
| Scopes | `openid,profile,email` |
| Identifier Claim | `sub` |
| Name Claim | `name` |
| Email Claim | `email` |

Redirect URI đăng ký ở Google Cloud Console:

```
https://<site-url>/signin-oidc
```

Nếu site có alias path:

```
https://<site-url>/<alias>/signin-oidc
```

### 5.4. Cấu hình LinkedIn (OIDC)

| Setting | Giá trị |
|---|---|
| Provider Type | `OIDC` |
| Provider Name | `LinkedIn` |
| Authority | `https://www.linkedin.com` |
| Metadata Url | `https://www.linkedin.com/oauth/.well-known/openid-configuration` |
| Scopes | `openid,profile,email` |
| User Info Url | `https://api.linkedin.com/v2/userinfo` |

Redirect URI tương tự Google.

### 5.5. Cơ chế lưu trữ

Cấu hình external login được lưu dưới dạng **Site Settings** trong database, multi-tenancy:

```
ExternalLogin:ProviderType
ExternalLogin:ProviderName
ExternalLogin:Authority
ExternalLogin:MetadataUrl
ExternalLogin:ClientId
ExternalLogin:ClientSecret
ExternalLogin:Scopes
ExternalLogin:IdentifierClaimType
ExternalLogin:NameClaimType
ExternalLogin:EmailClaimType
ExternalLogin:RoleClaimType
ExternalLogin:RoleClaimMappings
ExternalLogin:CreateUsers
ExternalLogin:VerifyUsers
ExternalLogin:DomainFilter
ExternalLogin:SaveTokens
...
```

### 5.6. Challenge / Callback

- **Challenge page:** `Oqtane.Server/Pages/External.cshtml.cs`
- **OIDC callback:** `/signin-oidc`
- **OAuth2 callback:** `/signin-oauth2`

Sau khi provider redirect về, Oqtane dùng kỹ thuật `?reload=post` để POST-back set cookie (quan trọng với Blazor WebAssembly / Static / SSR).

### 5.7. Luồng tạo user sau external login

Hàm `ValidateUser` trong `OqtaneSiteAuthenticationBuilderExtensions.cs` xử lý:

1. Xác thực claims: lấy `identifier`, `name`, `email`.
2. Kiểm tra `DomainFilter`.
3. Tìm user local qua `UserLoginInfo`.
4. Nếu chưa có user:
   - Nếu `CreateUsers = true`: tạo mới `IdentityUser` và `User` local.
   - Gán role Registered Users.
   - Gửi email notification nếu cấu hình.
5. Nếu user đã tồn tại:
   - Nếu `VerifyUsers = true`: yêu cầu xác nhận email.
   - Nếu `VerifyUsers = false`: liên kết tự động.
6. Đồng bộ role claim (từ v5.2.2).
7. Đồng bộ profile claim.
8. Lưu token nếu `SaveTokens = true`.

---

## 6. Phân tích: Tích hợp Google/LinkedIn Sign Up cho MegaForm trên Oqtane

### 6.1. Câu hỏi cốt lõi

> Có cần sửa code MegaForm để hỗ trợ Google/LinkedIn Sign Up trên Oqtane không?

**Trả lời: Không cần.** Vì:

1. MegaForm Oqtane module **không tự quản lý** authentication.
2. MegaForm nhận user context từ Oqtane thông qua `ClaimsPrincipal` (`User` property của `ModuleControllerBase`) và `OqtanePlatformContext`.
3. Oqtane host đã có sẵn cơ chế External Login Providers.
4. Khi user đăng nhập qua Google/LinkedIn, Oqtane tạo user local và cấp auth cookie. MegaForm sẽ tự động nhận diện user đã đăng nhập.

### 6.2. Các bước triển khai (config-only trên Oqtane host)

#### Bước 1: Đăng ký ứng dụng với nhà cung cấp

**Google Cloud Console:**
1. Tạo project.
2. Cấu hình OAuth consent screen.
3. Tạo OAuth 2.0 Client ID (Web application).
4. Thêm Authorized redirect URI: `https://<site-url>/signin-oidc`.
5. Lưu Client ID và Client Secret.

**LinkedIn Developer Portal:**
1. Tạo ứng dụng.
2. Kích hoạt sản phẩm "Sign In with LinkedIn using OpenID Connect".
3. Thêm Authorized redirect URL: `https://<site-url>/signin-oidc`.
4. Lưu Client ID và Client Secret.

#### Bước 2: Cấu hình trong Oqtane Admin

1. Đăng nhập Oqtane bằng Host/Admin.
2. Vào **Admin Dashboard > User Management > Settings > External Login Settings**.
3. Cấu hình provider Google:
   - Provider Type: `OIDC`
   - Provider Name: `Google`
   - Authority: `https://accounts.google.com`
   - Metadata Url: `https://accounts.google.com/.well-known/openid-configuration`
   - Client ID / Client Secret: từ Google Cloud Console.
   - Scopes: `openid,profile,email`
   - Identifier Claim Type: `sub`
   - Name Claim Type: `name`
   - Email Claim Type: `email`
   - Create Users: `true` (nếu muốn tự động tạo user mới)
   - Verify Users: `false` hoặc `true` tùy yêu cầu.
4. Lưu lại.
5. Lặp lại cho LinkedIn với authority `https://www.linkedin.com`.

#### Bước 3: Kiểm tra giao diện đăng nhập

- Trang `/login` của Oqtane sẽ hiển thị thêm nút "Login with Google" / "Login with LinkedIn".
- Người dùng mới bấm vào → xác thực thành công → Oqtane tạo user local → redirect về site.

#### Bước 4: Kiểm tra MegaForm

- Mở một trang có module MegaForm.
- MegaForm `Index.razor` sẽ nhận `SiteState.AuthorizationToken`.
- Các API call tự động có header `Authorization: Bearer <token>`.
- `OqtanePlatformContext.UserId` sẽ trả về ID user Oqtane.
- Các chức năng permission, submission, workflow hoạt động bình thường với user đã đăng nhập qua Google/LinkedIn.

### 6.3. Trường hợp cần code thêm

Nếu yêu cầu vượt ra ngoài "config-only", có thể cần code MegaForm trong các trường hợp sau:

| Yêu cầu | Mức độ can thiệp |
|---|---|
| Chỉ bật Google/LinkedIn login | Không cần code |
| Tắt local login, chỉ cho external login | Cấu hình Oqtane (`LoginOptions:AllowSiteLogin = false`) |
| Lấy thêm thông tin profile từ external claims | Có thể mở rộng `UserContext` hoặc workflow node |
| Tự động gán role/form permission theo external provider | Có thể mở rộng `OqtaneWorkflowIdentityProvisioningService` |
| Hiển thị nút "Sign Up with Google" riêng trong MegaForm UI | Cần code UI + redirect đến `/pages/external?returnurl=...` |
| Lưu provider token để gọi Google/LinkedIn API sau này | Cần mở rộng setting/model |

### 6.4. Các claim Oqtane cung cấp cho MegaForm

Sau khi external login thành công, `ClaimsPrincipal` trong Oqtane controller sẽ chứa:

- `sub` hoặc `NameIdentifier` → User ID.
- `name` → Display name.
- `email` → Email.
- Các role claims nếu cấu hình `RoleClaimType`.

MegaForm hiện tại đọc:

```csharp
var userId = ParseClaimsUserId(user);  // sub hoặc NameIdentifier
var userName = user?.FindFirst(ClaimTypes.Name)?.Value ?? user?.Identity?.Name ?? "anonymous";
var displayName = user?.FindFirst("name")?.Value ?? userName;
var email = user?.FindFirst(ClaimTypes.Email)?.Value ?? string.Empty;
```

Với Google/LinkedIn OIDC, các claim này đều được cung cấp đầy đủ.

---

## 7. Khuyến nghị

### 7.1. Phương án khuyến nghị: Config-only

**Ưu tiên số 1 là cấu hình Oqtane External Login Providers mà không sửa code MegaForm.**

Lý do:
- Nhanh, ít rủi ro.
- Tận dụng cơ chế chuẩn của Oqtane.
- MegaForm đã được thiết kế để nhận user context từ host.
- Không ảnh hưởng đến DNN/Umbraco/Web standalone.

### 7.2. Nếu cần custom UI

Nếu yêu cầu hiển thị nút Google/LinkedIn **ngay trong MegaForm UI** (thay vì dùng trang login Oqtane), cần:

1. Thêm UI component trong `MegaForm.UI` (TypeScript).
2. Khi click, redirect đến:
   ```
   /pages/external?returnurl=<current-url>
   ```
3. Sau khi Oqtane xử lý xong, user sẽ quay lại trang MegaForm với auth cookie.

### 7.3. Nếu cần lưu token của provider

Nếu muốn MegaForm sử dụng access token của Google/LinkedIn (ví dụ để gọi API lấy thêm thông tin), cần:

1. Bật `SaveTokens = true` trong Oqtane External Login Settings.
2. Mở rộng `IPlatformContext` hoặc thêm service mới để lấy token từ Oqtane.
3. Lưu ý: token lưu trong Oqtane Identity, cần dùng `SignInManager` hoặc `UserManager` để truy cập.

---

## 8. Rủi ro và lưu ý

### 8.1. Multi-tenancy / Alias Path

Nếu Oqtane site có alias path (ví dụ `https://site.com/alias`), redirect URI phải là:

```
https://site.com/alias/signin-oidc
```

Nhà cung cấp (Google/LinkedIn) cần khai báo chính xác.

### 8.2. HTTPS bắt buộc

Google và LinkedIn yêu cầu HTTPS cho redirect URI. Môi trường local cần dùng localhost hoặc HTTPS tunnel.

### 8.3. Email claim

Từ Oqtane 5.0.1, email claim không còn bắt buộc. Nếu provider không trả về email, người dùng sẽ được yêu cầu nhập email trong User Profile.

Với Google và LinkedIn OIDC, email thường được cung cấp nếu scope `email` được yêu cầu.

### 8.4. Role synchronization

Từ Oqtane 5.2.2+, có thể đồng bộ role từ external provider về Oqtane qua `RoleClaimType` và `RoleClaimMappings`.

Nếu MegaForm cần phân quyền dựa trên role, nên cấu hình đồng bộ role để `User.IsInRole(...)` hoạt động.

### 8.5. Không can thiệp vào Oqtane host source

Trong mô hình triển khai module Oqtane, MegaForm không nên sửa code Oqtane host. Cấu hình external login nên thực hiện qua:

- UI Admin Dashboard.
- `appsettings.json` của Oqtane host (nếu cần cấu hình toàn cục).
- Database Site Settings.

---

## 9. Tài liệu tham khảo

### Trong solution MegaForm

| File | Mô tả |
|---|---|
| `MegaForm.Core/MegaForm.Core.csproj` | Multi-target project |
| `MegaForm.Core/Interfaces/ICoreInterfaces.cs` | Repository + platform interfaces |
| `MegaForm.Core/Interfaces/RecoveredWorkflowIdentityInterfaces.cs` | Identity provisioning interfaces |
| `MegaForm.Core/Services/PermissionService.cs` | Permission evaluation |
| `MegaForm.Core/Services/SubmissionProcessor.cs` | Submission pipeline |
| `MegaForm.Oqtane.Client/ModuleInfo.cs` | Oqtane module registration |
| `MegaForm.Oqtane.Server/Services/Startup.cs` | Oqtane DI registration |
| `MegaForm.Oqtane.Server/Services/OqtanePlatformContext.cs` | User/tenant context |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Main API controller |
| `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-oqtane-auth.js` | Bearer token interceptor |
| `MegaForm.Oqtane.Client/Index.razor` | Pass AuthorizationToken to JS |

### Oqtane Framework

- Blog: [Oqtane – OAuth 2.0 and OpenId Connect](https://www.oqtane.org/blog/!/37/oauth-2-0-and-openid-connect)
- Source:
  - `Oqtane.Server/Extensions/OqtaneSiteAuthenticationBuilderExtensions.cs`
  - `Oqtane.Server/Pages/External.cshtml.cs`
  - `Oqtane.Server/Controllers/UserController.cs`
  - `Oqtane.Server/Managers/UserManager.cs`
  - `Oqtane.Shared/Shared/ExternalLoginProviders.cs`
  - `Oqtane.Shared/Shared/ExternalLoginStatus.cs`

---

## 10. Kết luận

MegaForm Core là kiến trúc multi-platform rõ ràng, với phần Core dùng chung và các adapter riêng cho từng nền tảng. Trên Oqtane, MegaForm tích hợp như một module chuẩn, hoàn toàn dựa vào auth context của host.

Việc bật **Google/LinkedIn Sign Up cho MegaForm trên Oqtane** nên được thực hiện ở **tầng Oqtane host** thông qua tính năng **External Login Providers**. MegaForm sẽ tự động heredity user đã đăng nhập mà không cần sửa code.

Nếu có yêu cầu nâng cao hơn (custom UI, lưu provider token, tự động phân quyền theo provider), cần đánh giá thêm và có thể phải mở rộng code MegaForm, nhưng đó là phạm vi ngoài "config-only".
