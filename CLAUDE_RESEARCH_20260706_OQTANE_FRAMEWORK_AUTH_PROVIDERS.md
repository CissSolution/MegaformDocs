# Nghiên cứu chi tiết: Oqtane Framework — External Login Providers (Google/LinkedIn/OIDC/OAuth2)

> **Phạm vi:** Chỉ viết tài liệu, không code.  
> **Thư mục source Oqtane:** `E:\DNN_SITES\OqtaneSites\oqtane.framework-dev (1)\oqtane.framework-dev`  
> **Ngày:** 2026-07-06  
> **Liên quan:**
> - `CLAUDE_HANDOFF_20260706_MEGAFORM_AUTH_AND_TEMPLATES.md`
> - `CLAUDE_RESEARCH_20260706_MEGAFORM_CORE_AND_OQTANE_EXTERNAL_LOGIN.md`

---

## 1. Tổng quan kiến trúc

Oqtane đăng ký authentication schemes một lần trong `OqtaneServiceCollectionExtensions.cs`:

- **Cookie:** `Identity.Application` (Constants.AuthenticationScheme)
- **OpenIdConnect:** scheme name `"oidc"`
- **OAuth2:** scheme name `"oauth2"`

Cấu hình chi tiết (Authority, ClientId, ClientSecret, scopes, claims…) không nằm trong `appsettings.json` mà được **override theo site** thông qua cơ chế **SiteOptions**. Site settings được lưu trong DB bảng `Setting` và đưa vào `HttpContext.Items["SiteSettings"]` bởi `TenantMiddleware`.

Luồng tổng thể:

1. Admin cấu hình External Login trong `Admin Dashboard > User Management > Settings > External Login Settings`.
2. Site settings lưu vào DB với prefix `ExternalLogin:`.
3. `TenantMiddleware` load settings vào `HttpContext.Items["SiteSettings"]`.
4. Khi user click nút external login, Blazor navigate đến `/pages/external?returnurl=...`.
5. `ExternalModel.OnGet` trả `ChallengeResult(scheme, RedirectUri)`.
6. ASP.NET Core OIDC/OAuth middleware redirect đến provider.
7. Provider callback về `/signin-oidc` hoặc `/signin-oauth2`.
8. `OnTokenValidated` (OIDC) hoặc `OnCreatingTicket` (OAuth2) parse claims và gọi `ValidateUser`.
9. `ValidateUser` tạo/liên kết user, tạo Oqtane claims identity, set Identity cookie.
10. Redirect POST về `/pages/external`, sau đó `OnPost` redirect về `returnurl`.

---

## 2. Oqtane đã support Google Authentication chưa?

**Trả lờ"i ngắn:**

- **Có — Oqtane hỗ trợ đăng nhập bằng Google** thông qua giao thức **OpenID Connect (OIDC)**.
- **Không — Google không có sẵn trong danh sách provider mặc định** của Oqtane. Admin phải chọn `<Custom>` và tự nhập thông số Google.

### 2.1. Tại sao Google không có sẵn?

File `Oqtane.Shared/Shared/ExternalLoginProviders.cs` chỉ định nghĩa sẵn các provider:

- `<Custom>`
- Microsoft Entra (OIDC)
- Auth0 (by Okta) (OIDC)
- GitHub (OAuth2)
- Facebook (OAuth2)

Google và LinkedIn không nằm trong danh sách này. Lý do có thể là Oqtane muốn tránh hardcode các URL/cấu hình có thể thay đổi, hoặc đơn giản là chưa bổ sung preset.

### 2.2. Cấu hình Google Authentication trong Oqtane

Chọn **Provider = `<Custom>`**, sau đó điền:

| Setting | Giá trị |
|---|---|
| Provider Type | `oidc` |
| Provider Name | `Google` |
| Authority | `https://accounts.google.com` |
| Metadata Url | `https://accounts.google.com/.well-known/openid-configuration` |
| Client ID | Lấy từ Google Cloud Console |
| Client Secret | Lấy từ Google Cloud Console |
| Scopes | `openid,profile,email` |
| Identifier Claim | `sub` |
| Name Claim | `name` |
| Email Claim | `email` |
| Create New Users | `true` |
| Verify Existing Users | `true` hoặc `false` |
| Use PKCE? | Có thể để `false` (Google OIDC không bắt buộc PKCE) |

Redirect URI đăng ký ở Google Cloud Console:

```text
https://<site-url>/signin-oidc
https://<site-url>/<alias>/signin-oidc   (nếu site có alias path)
```

Sau khi lưu, trang `/login` của Oqtane sẽ hiển thị nút:

```text
Use Google
```

User click → redirect đến Google → xác thực → Google redirect về `/signin-oidc` → Oqtane tạo user local → đăng nhập thành công.

### 2.3. Có thể thêm Google vào danh sách provider mặc định không?

**Có**, bằng cách sửa file:

```text
Oqtane.Shared/Shared/ExternalLoginProviders.cs
```

Thêm một `ExternalLoginProvider` mới:

```csharp
new ExternalLoginProvider
{
    Name = "Google",
    Settings = new Dictionary<string, string>()
    {
        { "ExternalLogin:ProviderUrl", "https://developers.google.com/identity" },
        { "ExternalLogin:ProviderType", "oidc" },
        { "ExternalLogin:ProviderName", "Google" },
        { "ExternalLogin:Authority", "https://accounts.google.com" },
        { "ExternalLogin:MetadataUrl", "https://accounts.google.com/.well-known/openid-configuration" },
        { "ExternalLogin:Scopes", "openid,profile,email" },
        { "ExternalLogin:IdentifierClaimType", "sub" },
        { "ExternalLogin:NameClaimType", "name" },
        { "ExternalLogin:EmailClaimType", "email" }
    }
}
```

Tuy nhiên, vì đây là source Oqtane Framework (không phải MegaForm), việc sửa file này sẽ ảnh hưởng đến toàn bộ instance Oqtane dùng source này. Nếu chỉ muốn dùng cho một site cụ thể, cấu hình `<Custom>` là đủ.

---

## 3. Cấu hình trên UI Admin

### 3.1. Đường dẫn

```text
Control Panel -> Admin Dashboard -> User Management -> Settings -> External Login Settings
```

Chỉ **Host** mới thấy section này do có `Security="SecurityAccessLevel.Host"`.

### 3.2. Các trường cấu hình

| # | Trường | Ý nghĩa |
|---|--------|---------|
| 1 | **Provider** | Chọn template provider (`<Custom>`, Microsoft Entra, Auth0, GitHub, Facebook). Nút **Info** mở URL tài liệu. |
| 2 | **Provider Type** | `oidc` hoặc `oauth2` |
| 3 | **Provider Name** | Tên hiển thị trên nút login |
| 4 | **Authority** *(OIDC)* | Issuer/Authority URL |
| 5 | **Metadata Url** *(OIDC)* | Discovery endpoint |
| 6 | **Authorization Url** *(OAuth2)* | Endpoint lấy authorization code |
| 7 | **Token Url** *(OAuth2)* | Endpoint đổi code lấy token |
| 8 | **User Info Url** *(OAuth2)* | Endpoint lấy thông tin user |
| 9 | **Client ID** | Client ID từ provider |
| 10 | **Client Secret** | Client Secret |
| 11 | **Authorization Response Type** *(OIDC)* | `code`, `code id_token`, … |
| 12 | **Require Nonce?** *(OIDC)* | Bật/tắt nonce validation |
| 13 | **Use Single Logout?** *(OIDC)* | Logout cả ứng dụng và provider |
| 14 | **Scopes** | Danh sách scope, phân cách bằng dấu phẩy |
| 15 | **Parameters** | Tham số bổ sung dạng `key=value,key2=value2` |
| 16 | **Use PKCE?** | Proof Key for Code Exchange |
| 17 | **Redirect Url** | Read-only, tự động tính `{scheme}://{alias}/signin-{providertype}` |
| 18 | **Review Claims?** | Ghi toàn bộ claims vào Event Log (chế độ test) |
| 19 | **Identifier Claim** | Claim định danh duy nhất, mặc định `sub` |
| 20 | **Name Claim** | Claim tên user, mặc định `name` |
| 21 | **Email Claim** | Claim email, mặc định `email` |
| 22 | **Roles Claim** | Tên claim chứa roles |
| 23 | **Role Claim Mappings** | Mapping role từ provider sang site role |
| 24 | **Synchronize Roles?** | Đồng bộ roles hoàn toàn theo provider |
| 25 | **User Profile Claims** | Mapping profile claim, ví dụ `given_name:FirstName` |
| 26 | **Save Tokens?** | Lưu access/refresh token vào cookie |
| 27 | **Domain Filter** | Lọc email domain, loại trừ bắt đầu bằng `!` |
| 28 | **Create New Users?** | Tự động tạo user mới khi đăng nhập lần đầu |
| 29 | **Verify Existing Users?** | Yêu cầu xác minh email để liên kết tài khoản có sẵn |
| 30 | **Allow Host Role?** *(Host only)* | Cho phép provider cấp role Host |

### 3.3. Các setting key trong DB

Tất cả đều thuộc prefix `ExternalLogin:`:

```text
ExternalLogin:Provider
ExternalLogin:ProviderUrl
ExternalLogin:ProviderType
ExternalLogin:ProviderName
ExternalLogin:Authority
ExternalLogin:MetadataUrl
ExternalLogin:AuthorizationUrl
ExternalLogin:TokenUrl
ExternalLogin:UserInfoUrl
ExternalLogin:ClientId
ExternalLogin:ClientSecret
ExternalLogin:AuthResponseType
ExternalLogin:RequireNonce
ExternalLogin:SingleLogout
ExternalLogin:Scopes
ExternalLogin:Parameters
ExternalLogin:PKCE
ExternalLogin:ReviewClaims
ExternalLogin:IdentifierClaimType
ExternalLogin:NameClaimType
ExternalLogin:EmailClaimType
ExternalLogin:RoleClaimType
ExternalLogin:RoleClaimMappings
ExternalLogin:SynchronizeRoles
ExternalLogin:ProfileClaimTypes
ExternalLogin:SaveTokens
ExternalLogin:DomainFilter
ExternalLogin:CreateUsers
ExternalLogin:VerifyUsers
ExternalLogin:AllowHostRole
```

Các key `LoginOptions:` liên quan:

```text
LoginOptions:AllowSiteLogin
LoginOptions:TwoFactor
LoginOptions:LoginLink
LoginOptions:Passkeys
LoginOptions:CookieName
LoginOptions:CookieDomain
LoginOptions:CookieExpiration
LoginOptions:AlwaysRemember
LoginOptions:LogoutEverywhere
```

---

## 4. Đăng ký OIDC/OAuth2 trong code

### 4.1. File cốt lõi

```text
Oqtane.Server/Extensions/OqtaneSiteAuthenticationBuilderExtensions.cs
```

Oqtane đăng ký schemes trong `OqtaneServiceCollectionExtensions.cs`:

```csharp
services.AddAuthentication(options =>
{
    options.DefaultScheme = Constants.AuthenticationScheme;
})
.AddCookie(Constants.AuthenticationScheme)
.AddOpenIdConnect(AuthenticationProviderTypes.OpenIDConnect, options => { })
.AddOAuth(AuthenticationProviderTypes.OAuth2, options => { });

services.AddOqtaneSiteOptions()
    .WithSiteIdentity()
    .WithSiteAuthentication();
```

Sau đó `WithSiteAuthentication()` dùng `AddSiteOptions<OpenIdConnectOptions>` và `AddSiteOptions<OAuthOptions>` để override từ site settings.

### 4.2. OIDC configuration

```csharp
builder.AddSiteOptions<OpenIdConnectOptions>((options, alias, sitesettings) =>
{
    if (sitesettings.GetValue("ExternalLogin:ProviderType", "") == AuthenticationProviderTypes.OpenIDConnect)
    {
        options.SignInScheme = Constants.AuthenticationScheme; // Identity.Application cookie
        options.RequireHttpsMetadata = true;
        options.GetClaimsFromUserInfoEndpoint = true;
        options.CallbackPath = string.IsNullOrEmpty(alias.Path)
            ? "/signin-" + AuthenticationProviderTypes.OpenIDConnect
            : "/" + alias.Path + "/signin-" + AuthenticationProviderTypes.OpenIDConnect;
        options.ResponseMode = OpenIdConnectResponseMode.FormPost;

        options.Authority = sitesettings.GetValue("ExternalLogin:Authority", "");
        options.MetadataAddress = sitesettings.GetValue("ExternalLogin:MetadataUrl", "");
        options.ClientId = sitesettings.GetValue("ExternalLogin:ClientId", "");
        options.ClientSecret = sitesettings.GetValue("ExternalLogin:ClientSecret", "");
        options.ResponseType = sitesettings.GetValue("ExternalLogin:AuthResponseType", "code");
        options.ProtocolValidator.RequireNonce = bool.Parse(sitesettings.GetValue("ExternalLogin:RequireNonce", "true"));
        options.UsePkce = bool.Parse(sitesettings.GetValue("ExternalLogin:PKCE", "false"));
        options.SaveTokens = bool.Parse(sitesettings.GetValue("ExternalLogin:SaveTokens", "false"));

        options.Scope.Clear();
        foreach (var scope in sitesettings.GetValue("ExternalLogin:Scopes", "openid,profile,email")
            .Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            options.Scope.Add(scope);
        }

        // Events: OnTokenValidated -> ValidateUser
        // OnAccessDenied, OnRemoteFailure -> redirect login
    }
});
```

Callback path:

```text
/signin-oidc
/<alias>/signin-oidc   (nếu alias có subpath)
```

### 4.3. OAuth2 configuration

```csharp
builder.AddSiteOptions<OAuthOptions>((options, alias, sitesettings) =>
{
    if (sitesettings.GetValue("ExternalLogin:ProviderType", "") == AuthenticationProviderTypes.OAuth2)
    {
        options.SignInScheme = Constants.AuthenticationScheme;
        options.CallbackPath = string.IsNullOrEmpty(alias.Path)
            ? "/signin-" + AuthenticationProviderTypes.OAuth2
            : "/" + alias.Path + "/signin-" + AuthenticationProviderTypes.OAuth2;

        options.AuthorizationEndpoint = sitesettings.GetValue("ExternalLogin:AuthorizationUrl", "");
        options.TokenEndpoint = sitesettings.GetValue("ExternalLogin:TokenUrl", "");
        options.UserInformationEndpoint = sitesettings.GetValue("ExternalLogin:UserInfoUrl", "");
        options.ClientId = sitesettings.GetValue("ExternalLogin:ClientId", "");
        options.ClientSecret = sitesettings.GetValue("ExternalLogin:ClientSecret", "");
        options.UsePkce = bool.Parse(sitesettings.GetValue("ExternalLogin:PKCE", "false"));
        options.SaveTokens = bool.Parse(sitesettings.GetValue("ExternalLogin:SaveTokens", "false"));

        // Events: OnCreatingTicket -> call UserInfo endpoint -> ValidateUser
        // OnTicketReceived, OnAccessDenied, OnRemoteFailure
    }
});
```

Callback path:

```text
/signin-oauth2
/<alias>/signin-oauth2
```

### 4.4. Cơ chế SiteOptions

| File | Vai trò |
|---|---|
| `Oqtane.Server/Extensions/OqtaneSiteOptionsBuilder.cs` | `AddSiteOptions<TOptions>` / `AddSiteNamedOptions<TOptions>` |
| `Oqtane.Server/Infrastructure/Options/SiteOptions.cs` | Interface `ISiteOptions<TOptions>` |
| `Oqtane.Server/Infrastructure/Options/SiteOptionsFactory.cs` | `IOptionsFactory<TOptions>`: default config + site-specific override |
| `Oqtane.Server/Infrastructure/Options/SiteOptionsCache.cs` | Cache options theo `alias.SiteKey` |
| `Oqtane.Server/Infrastructure/Options/SiteOptionsManager.cs` | Quản lý cache, implement `IOptions<T>` / `IOptionsSnapshot<T>` |
| `Oqtane.Server/Infrastructure/Middleware/TenantMiddleware.cs` | Load alias + site settings vào `HttpContext` |
| `Oqtane.Server/Extensions/HttpContextExtensions.cs` | `GetAlias()`, `GetSiteSettings()` |

---

## 5. Challenge & callback flow

### 5.1. `/pages/external` — challenge page

File: `Oqtane.Server/Pages/External.cshtml.cs`

```csharp
[AllowAnonymous]
[IgnoreAntiforgeryToken]
public class ExternalModel : PageModel
{
    public IActionResult OnGetAsync(string returnurl)
    {
        returnurl = (returnurl == null) ? "/" : returnurl;
        returnurl = (!returnurl.StartsWith("/")) ? "/" + returnurl : returnurl;

        var providertype = HttpContext.GetSiteSettings().GetValue("ExternalLogin:ProviderType", "");
        if (providertype != "")
        {
            return new ChallengeResult(providertype, new AuthenticationProperties
            {
                RedirectUri = returnurl + (returnurl.Contains("?") ? "&" : "?") + "reload=post"
            });
        }
        else
        {
            HttpContext.Response.StatusCode = (int)HttpStatusCode.Forbidden;
            return new EmptyResult();
        }
    }

    public IActionResult OnPostAsync(string returnurl)
    {
        returnurl = returnurl.ReplaceMultiple(new string[] { "?reload=post", "&reload=post" }, "");
        return LocalRedirect(Url.Content("~" + returnurl));
    }
}
```

Luồng:

1. `OnGet` đọc `ExternalLogin:ProviderType`.
2. Trả `ChallengeResult(scheme, RedirectUri)` với `RedirectUri` có `?reload=post`.
3. ASP.NET Core thực hiện OAuth/OIDC challenge, redirect browser đến provider.
4. Provider callback về `/signin-oidc` hoặc `/signin-oauth2`.
5. Middleware set Identity cookie.
6. Middleware redirect trở lại `RedirectUri` bằng POST (do `reload=post`).
7. `OnPost` xóa `reload=post` và `LocalRedirect` về trang gốc.

### 5.2. Redirect URL

Admin UI tự động tính:

```csharp
_redirecturl = PageState.Uri.Scheme + "://" + PageState.Alias.Name + "/signin-" + _providertype;
```

Ví dụ:

```text
https://myoqtanesite.com/signin-oidc
https://myoqtanesite.com/alias/signin-oidc   (nếu có alias path)
https://myoqtanesite.com/signin-oauth2
```

---

## 6. Xử lý user sau external login — `ValidateUser`

File: `Oqtane.Server/Extensions/OqtaneSiteAuthenticationBuilderExtensions.cs`

### 6.1. Parse claims

Với OIDC, Oqtane serialize claims thành JSON string:

```csharp
foreach (var claim in context.Principal.Claims)
{
    claims += "\"" + claim.Type + "\":\"" + claim.Value + "\",";
}
claims = "{" + claims.Substring(0, claims.Length - 1) + "}";
```

Lấy 3 giá trị quan trọng:

- `id` từ claim `ExternalLogin:IdentifierClaimType` (mặc định `sub`)
- `name` từ claim `ExternalLogin:NameClaimType` (mặc định `name`)
- `email` từ claim `ExternalLogin:EmailClaimType` (mặc định `email`)

Email được kiểm tra qua `EmailValid(...)` với `ExternalLogin:DomainFilter`.

### 6.2. Hàm `ValidateUser`

```csharp
private static async Task<ClaimsIdentity> ValidateUser(
    string id, string name, string email, string claims,
    HttpContext httpContext, ClaimsPrincipal claimsPrincipal)
```

Luồng xử lý:

1. **ReviewClaims** — nếu bật, chỉ log claims và trả về `ReviewClaims`.
2. **Tìm user theo external login**:
   ```csharp
   var identityuser = await _identityUserManager.FindByLoginAsync(
       providerType + ":" + alias.SiteId.ToString(), id);
   ```
   `LoginProvider` được prefix với `SiteId` để phân biệt multi-tenancy.
3. **Nếu chưa có external login**:
   - Tìm user theo email: `FindByEmailAsync(email)`.
   - Nếu email trùng nhiều user → `DuplicateEmail`.
   - Nếu không tìm thấy:
     - `CreateUsers=true` → tạo IdentityUser + Oqtane User mới, `AddLoginAsync`.
     - `CreateUsers=false` → `UserDoesNotExist`.
   - Nếu tìm thấy user local theo email:
     - Nếu đã có login cùng provider type HOẶC `VerifyUsers=false` → tự động liên kết.
     - Nếu `VerifyUsers=true` → gửi email xác nhận, trả về `VerificationRequired`.
     - Nếu provider key không khớp → `ProviderKeyMismatch`.
4. **Gán role tự động** — nếu user mới, gán các role có `IsAutoAssigned=true`.
5. **Đồng bộ role claims** — nếu cấu hình `RoleClaimType`.
6. **Đồng bộ profile claims** — nếu cấu hình `ProfileClaimTypes`.
7. **Tạo Oqtane claims identity** qua `UserSecurity.CreateClaimsIdentity(...)`.

### 6.3. Tạo user mới từ external login

```csharp
if (bool.Parse(httpContext.GetSiteSettings().GetValue("ExternalLogin:CreateUsers", "true")))
{
    // ưu tiên email, sau đó name, cuối cùng Guid
    if (!string.IsNullOrEmpty(email))
    {
        username = email;
        emailaddress = email;
        displayname = (!string.IsNullOrEmpty(name)) ? name : email;
        emailconfirmed = true;
    }
    else if (!string.IsNullOrEmpty(name)) { ... }
    else { ... }

    identityuser = new IdentityUser();
    identityuser.UserName = username;
    identityuser.Email = emailaddress;
    identityuser.EmailConfirmed = emailconfirmed;

    var result = await _identityUserManager.CreateAsync(identityuser, password);
    if (result.Succeeded)
    {
        user = new User
        {
            SiteId = alias.SiteId,
            Username = username,
            DisplayName = displayname,
            Email = emailaddress,
            ...
        };
        user = _users.AddUser(user);
        await _identityUserManager.AddLoginAsync(identityuser,
            new UserLoginInfo(providerType + ":" + user.SiteId.ToString(), id, providerName));
    }
}
```

Password được sinh ngẫu nhiên dạng `MMM-dd-yyyy+HH:mm:ss!`.

### 6.4. Gán role tự động

```csharp
if (userRoles.Count == 0)
{
    var roles = _roles.GetRoles(user.SiteId).Where(item => item.IsAutoAssigned).ToList();
    foreach (var role in roles)
    {
        var userrole = new UserRole { UserId = user.UserId, RoleId = role.RoleId, ... };
        _userRoles.AddUserRole(userrole);
    }
}
```

### 6.5. Verify email khi liên kết user có sẵn

```csharp
string token = await _identityUserManager.GenerateEmailConfirmationTokenAsync(identityuser);
string url = httpContext.Request.Scheme + "://" + alias.Name;
url += $"/login?name={identityuser.UserName}&token={WebUtility.UrlEncode(token)}&key={WebUtility.UrlEncode(id)}";
...
identity.Label = ExternalLoginStatus.VerificationRequired;
```

Sau khi user click link, client gọi `UserService.AddLoginAsync` với token để xác nhận và liên kết.

### 6.6. Đồng bộ role từ external claims

Cấu hình:

- `ExternalLogin:RoleClaimType` — tên claim chứa role.
- `ExternalLogin:RoleClaimMappings` — map `externalRole:localRole`.
- `ExternalLogin:SynchronizeRoles` — nếu `true`, xóa role local nếu không còn trong claims.
- `ExternalLogin:AllowHostRole` — cho phép đồng bộ role Host.

Thêm role:

```csharp
if (!string.IsNullOrEmpty(httpContext.GetSiteSettings().GetValue("ExternalLogin:RoleClaimType", "")))
{
    var allowhostrole = bool.Parse(...);
    var roles = _roles.GetRoles(user.SiteId, allowhostrole).ToList();
    var mappings = httpContext.GetSiteSettings().GetValue("ExternalLogin:RoleClaimMappings", "").Split(',');

    foreach (var claim in claimsPrincipal.Claims.Where(item => item.Type == roleClaimType))
    {
        var rolename = claim.Value;
        if (mappings.Any(item => item.StartsWith(rolename + ":")))
        {
            rolename = mappings.First(item => item.StartsWith(rolename + ":")).Split(':')[1];
        }
        var role = roles.FirstOrDefault(item => item.Name == rolename);
        if (role != null && !userRoles.Any(...))
        {
            _userRoles.AddUserRole(new UserRole { RoleId = role.RoleId, UserId = user.UserId });
        }
    }
}
```

Xóa role nếu bật `SynchronizeRoles`:

```csharp
if (bool.Parse(httpContext.GetSiteSettings().GetValue("ExternalLogin:SynchronizeRoles", "false")))
{
    foreach (var userRole in userRoles)
    {
        var role = roles.FirstOrDefault(item => item.RoleId == userRole.RoleId);
        if (role != null)
        {
            var rolename = role.Name;
            if (mappings.Any(item => item.EndsWith(":" + rolename)))
                rolename = mappings.First(...).Split(':')[0];

            if (!claimsPrincipal.Claims.Any(item => item.Type == roleClaimType && item.Value == rolename))
            {
                _userRoles.DeleteUserRole(userRole.UserRoleId);
            }
        }
    }
}
```

### 6.7. Đồng bộ profile claim

Cấu hình: `ExternalLogin:ProfileClaimTypes` dạng `claimType:profileName`, ví dụ `given_name:FirstName`.

```csharp
if (!string.IsNullOrEmpty(httpContext.GetSiteSettings().GetValue("ExternalLogin:ProfileClaimTypes", "")))
{
    var _settings = httpContext.RequestServices.GetRequiredService<ISettingRepository>();
    var _profiles = httpContext.RequestServices.GetRequiredService<IProfileRepository>();
    var profiles = _profiles.GetProfiles(alias.SiteId).ToList();

    foreach (var mapping in httpContext.GetSiteSettings().GetValue("ExternalLogin:ProfileClaimTypes", "")
        .Split(',', StringSplitOptions.RemoveEmptyEntries))
    {
        if (mapping.Contains(":"))
        {
            var claim = claimsPrincipal.Claims.FirstOrDefault(item => item.Type == mapping.Split(":")[0]);
            if (claim != null)
            {
                var profile = profiles.FirstOrDefault(item => item.Name == mapping.Split(":")[1]);
                if (profile != null && !string.IsNullOrEmpty(claim.Value))
                {
                    var setting = _settings.GetSetting(EntityNames.User, user.UserId, profile.Name);
                    if (setting != null)
                    {
                        setting.SettingValue = claim.Value;
                        _settings.UpdateSetting(setting);
                    }
                    else
                    {
                        setting = new Setting
                        {
                            EntityName = EntityNames.User,
                            EntityId = user.UserId,
                            SettingName = profile.Name,
                            SettingValue = claim.Value,
                            IsPrivate = profile.IsPrivate
                        };
                        _settings.AddSetting(setting);
                    }
                }
            }
        }
    }
}
```

Profile được lưu dưới dạng `Setting` với `EntityName = User`, `EntityId = user.UserId`.

---

## 7. API quản lý external login

File: `Oqtane.Server/Controllers/UserController.cs`

### 7.1. GET `api/user/login`

```csharp
[HttpGet("login")]
[Authorize]
public async Task<IEnumerable<UserLogin>> GetLogins(int id)
{
    if (authorized)
        return await _userManager.GetLogins(id, _tenantManager.GetAlias().SiteId);
}
```

Lấy danh sách external login của user tại site hiện tại.

### 7.2. POST `api/user/login`

```csharp
[HttpPost("login")]
public async Task<User> AddLogin([FromBody] User user, string token, string type, string key, string name)
{
    user = await _userManager.AddLogin(user, token, type, key, name);
    return user;
}
```

Dùng để liên kết external login với user local sau khi xác nhận email bằng token.

### 7.3. DELETE `api/user/login`

```csharp
[HttpDelete("login")]
[Authorize]
public async Task DeleteLogin(int id, string provider, string key)
{
    if (authorized)
        await _userManager.DeleteLogin(id, provider, key);
}
```

Xóa liên kết external login.

---

## 8. `UserManager` — AddLogin / DeleteLogin / GetLogins

File: `Oqtane.Server/Managers/UserManager.cs`

### 8.1. `AddLogin`

```csharp
public async Task<User> AddLogin(User user, string token, string type, string key, string name)
{
    IdentityUser identityuser = await _identityUserManager.FindByNameAsync(user.Username);
    if (identityuser != null && !string.IsNullOrEmpty(token))
    {
        var result = await _identityUserManager.ConfirmEmailAsync(identityuser, token);
        if (result.Succeeded)
        {
            type += ":" + user.SiteId.ToString();   // multi-tenant prefix
            await _identityUserManager.AddLoginAsync(identityuser, new UserLoginInfo(type, key, name));
        }
    }
    return user;
}
```

### 8.2. `GetLogins`

```csharp
public async Task<List<UserLogin>> GetLogins(int userId, int siteId)
{
    ...
    foreach (var userlogin in userlogins)
    {
        if (userlogin.LoginProvider.EndsWith(":" + siteId.ToString()))
        {
            logins.Add(new UserLogin
            {
                Provider = userlogin.LoginProvider,
                Key = userlogin.ProviderKey,
                Name = userlogin.ProviderDisplayName
            });
        }
    }
    return logins;
}
```

### 8.3. `DeleteLogin`

```csharp
public async Task DeleteLogin(int userId, string provider, string key)
{
    var user = _users.GetUser(userId);
    if (user != null)
    {
        var identityuser = await _identityUserManager.FindByNameAsync(user.Username);
        if (identityuser != null)
        {
            await _identityUserManager.RemoveLoginAsync(identityuser, provider, key);
        }
    }
}
```

Lưu trữ vật lý qua ASP.NET Core Identity + Entity Framework (`AddEntityFrameworkStores<TenantDBContext>`) → bảng `AspNetUserLogins`.

---

## 9. Trạng thái `ExternalLoginStatus`

File: `Oqtane.Shared/Shared/ExternalLoginStatus.cs`

```csharp
public class ExternalLoginStatus
{
    public const string Success = "Success";
    public const string MissingClaims = "MissingClaims";
    public const string DuplicateEmail = "DuplicateEmail";
    public const string UserNotCreated = "UserNotCreated";
    public const string UserDoesNotExist = "UserDoesNotExist";
    public const string ProviderKeyMismatch = "ProviderKeyMismatch";
    public const string VerificationRequired = "VerificationRequired";
    public const string AccessDenied = "AccessDenied";
    public const string RemoteFailure = "RemoteFailure";
    public const string ReviewClaims = "ReviewClaims";
    public const string LoginLinkFailed = "LoginLinkFailed";
    public const string PasskeyFailed = "PasskeyFailed";
}
```

| Status | Ý nghĩa |
|---|---|
| `MissingClaims` | Provider không trả đủ claim bắt buộc, hoặc email không pass domain filter. |
| `DuplicateEmail` | Email từ provider trùng với nhiều user local. |
| `UserNotCreated` | Lỗi khi tạo IdentityUser hoặc Oqtane User mới. |
| `UserDoesNotExist` | `CreateUsers=false` và user chưa tồn tại. |
| `ProviderKeyMismatch` | User local tồn tại nhưng provider key không khớp. |
| `VerificationRequired` | Cần xác nhận email để liên kết với user local. |
| `AccessDenied` | Ngườ"i dùng từ chối cấp quyền, hoặc user bị xóa/không active. |
| `RemoteFailure` | Lỗi từ phía provider. |
| `ReviewClaims` | Chế độ test `ReviewClaims=true` đang bật. |

---

## 10. Provider mặc định trong Oqtane

File: `Oqtane.Shared/Shared/ExternalLoginProviders.cs`

Danh sách provider có sẵn:

1. `<Custom>` — rỗng, admin tự cấu hình.
2. **Microsoft Entra** (OIDC)
3. **Auth0 (by Okta)** (OIDC)
4. **GitHub** (OAuth2)
5. **Facebook** (OAuth2)

**Google và LinkedIn không có trong danh sách mặc định.** Phải chọn `<Custom>` và nhập thủ công.

---

## 11. Cấu hình Google và LinkedIn cụ thể

### 11.1. Google (OIDC)

| Setting | Giá trị |
|---|---|
| Provider Type | `oidc` |
| Provider Name | `Google` |
| Authority | `https://accounts.google.com` |
| Metadata Url | `https://accounts.google.com/.well-known/openid-configuration` |
| Client ID | Lấy từ Google Cloud Console |
| Client Secret | Lấy từ Google Cloud Console |
| Scopes | `openid,profile,email` |
| Identifier Claim | `sub` |
| Name Claim | `name` |
| Email Claim | `email` |
| Create New Users | `true` |
| Verify Existing Users | `true` hoặc `false` tùy yêu cầu |

Redirect URI đăng ký ở Google Cloud Console:

```text
https://<site-url>/signin-oidc
https://<site-url>/<alias>/signin-oidc   (nếu alias có subpath)
```

### 11.2. LinkedIn (OIDC)

| Setting | Giá trị |
|---|---|
| Provider Type | `oidc` |
| Provider Name | `LinkedIn` |
| Authority | `https://www.linkedin.com` |
| Metadata Url | `https://www.linkedin.com/oauth/.well-known/openid-configuration` |
| Client ID / Secret | Lấy từ LinkedIn Developer Portal |
| Scopes | `openid,profile,email` |
| User Info Url | `https://api.linkedin.com/v2/userinfo` |
| Identifier Claim | `sub` |
| Name Claim | `name` |
| Email Claim | `email` |

Redirect URI:

```text
https://<site-url>/signin-oidc
```

### 11.3. LinkedIn (OAuth2) — nếu không dùng OIDC

| Setting | Giá trị |
|---|---|
| Provider Type | `oauth2` |
| Provider Name | `LinkedIn` |
| Authorization Url | `https://www.linkedin.com/oauth/v2/authorization` |
| Token Url | `https://www.linkedin.com/oauth/v2/accessToken` |
| User Info Url | `https://api.linkedin.com/v2/userinfo` |
| Scopes | `openid,profile,email` |

Redirect URI:

```text
https://<site-url>/signin-oauth2
```

---

## 12. UI login và theme controls

### 12.1. Trang `/login`

File: `Oqtane.Client/Modules/Admin/Login/Index.razor`

Nút external login được render ở đây:

```razor
@if (_allowexternallogin)
{
    <button type="button" class="btn btn-primary col-12" @onclick="ExternalLogin">
        @Localizer["Use"] @PageState.Site.Settings["ExternalLogin:ProviderName"]
    </button>
    <hr class="app-rule mt-3 mb-2" />
}
@if (_allowsitelogin)
{
    // username/password form
}
```

Hàm xử lý click:

```csharp
private void ExternalLogin()
{
    NavigationManager.NavigateTo(
        Utilities.TenantUrl(PageState.Alias, "/pages/external?returnurl=" + WebUtility.UrlEncode(_returnurl)),
        true);
}
```

Nếu cấu hình chỉ có external login (`_allowexternallogin && !_allowsitelogin`), module tự động redirect đến `/pages/external` khi load.

### 12.2. Theme Login control

File: `Oqtane.Client/Themes/Controls/Theme/LoginBase.cs`

```csharp
allowexternallogin = (SettingService.GetSetting(PageState.Site.Settings, "ExternalLogin:ProviderType", "") != "") ? true : false;
allowsitelogin = bool.Parse(SettingService.GetSetting(PageState.Site.Settings, "LoginOptions:AllowSiteLogin", "true"));

if (allowexternallogin && !allowsitelogin)
{
    loginurl = Utilities.TenantUrl(PageState.Alias, "/pages/external");
}
else
{
    loginurl = NavigateUrl("login");
}
```

File: `Oqtane.Client/Themes/Controls/Theme/Login.razor`

```razor
@inherits LoginBase

@if (PageState.User != null)
{
    <form method="post" ... action="@logouturl">
        <button type="submit">@Localizer["Logout"]</button>
    </form>
}
else
{
    @if (ShowLogin)
    {
        <a href="@loginurl" class="@CssClass app-login">@SharedLocalizer["Login"]</a>
    }
}
```

**Theme control chỉ render nút Login/Logout**, không tự render nút external login. Nút external login xuất hiện trên trang `/login`.

### 12.3. Tắt local login

Set:

```text
LoginOptions:AllowSiteLogin = false
```

Khi đó:
- Theme Login link dẫn đến `/pages/external`.
- Trang `/login` tự động redirect đến `/pages/external`.
- User chỉ có thể đăng nhập qua external provider.

---

## 13. Tích hợp với MegaForm

### 13.1. Không cần code MegaForm cho config-only

Nếu mục tiêu chỉ là cho phép user đăng nhập bằng Google/LinkedIn rồi dùng MegaForm:

1. Cấu hình External Login Provider trong Oqtane Admin.
2. User đăng nhập qua trang `/login` của Oqtane.
3. Sau khi login, user quay lại trang có module MegaForm.
4. MegaForm tự động nhận user qua `ModuleControllerBase.User` và `OqtanePlatformContext`.

### 13.2. Nếu MegaForm cần redirect đến login

MegaForm module có thể redirect đến:

```text
/login?returnurl=<encoded-current-url>
```

hoặc thẳng đến external challenge:

```text
/pages/external?returnurl=<encoded-current-url>
```

Sau khi Oqtane xử lý xong, user quay lại trang MegaForm với auth cookie.

### 13.3. Lưu ý với Blazor render modes

Oqtane dùng same-site cookie authentication. Với Blazor WebAssembly / Static / SSR, cần POST-back sau external login để set cookie (kỹ thuật `?reload=post` trong `External.cshtml.cs`). MegaForm UI fetch interceptor (`megaform-oqtane-auth.js`) tự động thêm `Authorization: Bearer <SiteState.AuthorizationToken>`.

---

## 14. Danh sách file quan trọng trong Oqtane source

### Server — core logic

```text
Oqtane.Server/Extensions/OqtaneSiteAuthenticationBuilderExtensions.cs
Oqtane.Server/Extensions/OqtaneSiteOptionsBuilder.cs
Oqtane.Server/Extensions/OqtaneServiceCollectionExtensions.cs
Oqtane.Server/Extensions/HttpContextExtensions.cs
Oqtane.Server/Infrastructure/Options/SiteOptions.cs
Oqtane.Server/Infrastructure/Options/SiteOptionsCache.cs
Oqtane.Server/Infrastructure/Options/SiteOptionsFactory.cs
Oqtane.Server/Infrastructure/Options/SiteOptionsManager.cs
Oqtane.Server/Infrastructure/Middleware/TenantMiddleware.cs
Oqtane.Server/Pages/External.cshtml
Oqtane.Server/Pages/External.cshtml.cs
Oqtane.Server/Pages/Logout.cshtml.cs
Oqtane.Server/Pages/Login.cshtml.cs
Oqtane.Server/Pages/LoginLink.cshtml.cs
Oqtane.Server/Controllers/UserController.cs
Oqtane.Server/Managers/UserManager.cs
Oqtane.Server/Infrastructure/UpgradeManager.cs
```

### Shared

```text
Oqtane.Shared/Shared/AuthenticationProviderTypes.cs
Oqtane.Shared/Shared/ExternalLoginProviders.cs
Oqtane.Shared/Shared/ExternalLoginStatus.cs
Oqtane.Shared/Models/ExternalLoginProvider.cs
Oqtane.Shared/Models/UserLogin.cs
Oqtane.Shared/Security/UserSecurity.cs
Oqtane.Shared/Shared/Constants.cs
```

### Client — UI

```text
Oqtane.Client/Modules/Admin/Users/Index.razor
Oqtane.Client/Modules/Admin/Users/Edit.razor
Oqtane.Client/Modules/Admin/Login/Index.razor
Oqtane.Client/Modules/Admin/UserProfile/Index.razor
Oqtane.Client/Services/UserService.cs
Oqtane.Client/Themes/Controls/Theme/LoginBase.cs
Oqtane.Client/Themes/Controls/Theme/Login.razor
Oqtane.Client/Themes/Controls/Theme/UserProfile.razor
```

### Config

```text
Oqtane.Server/appsettings.json
Oqtane.Server/appsettings.release.json
```

---

## 15. Kết luận

Oqtane xử lý external login bằng ASP.NET Core Identity + OIDC/OAuth2 middleware. Cấu hình được lưu dưới dạng site settings prefix `ExternalLogin:` và nạp động vào `OpenIdConnectOptions` / `OAuthOptions` thông qua cơ chế `SiteOptions`.

**Điểm quan trọng:**

- Google và LinkedIn **không có sẵn** trong danh sách provider, nhưng hoàn toàn cấu hình được qua `<Custom>` provider.
- Cả Google và LinkedIn đều nên dùng **OIDC** vì cả hai đều hỗ trợ OpenID Connect.
- Oqtane tự động tạo user local sau external login nếu `CreateUsers=true`.
- `LoginProvider` trong ASP.NET Identity được lưu dạng `providerType:SiteId` để đảm bảo multi-tenancy.
- Role và profile được đồng bộ từ claims theo mapping admin định nghĩa.
- Với MegaForm, việc bật Google/LinkedIn login là **config-only ở host level**; MegaForm tự động heredity user context từ Oqtane.
