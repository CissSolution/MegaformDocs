# Nghiên cứu: Wire MegaForm Templates vào Authentication Providers (Oqtane, DNN, Umbraco)

> **Phạm vi:** Chỉ viết tài liệu, không code.  
> **Thư mục gốc khảo sát:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
> **Ngày:** 2026-07-06  
> **Liên quan:** `CLAUDE_RESEARCH_20260706_MEGAFORM_CORE_AND_OQTANE_EXTERNAL_LOGIN.md`

---

## 1. Câu hỏi cốt lõi

MegaForm cung cấp nhiều **form templates** (contact, registration, booking, survey, HR…). Làm thế nào để các template này tận dụng hoặc "wire" vào các authentication provider sẵn có của nền tảng (Oqtane, DNN, Umbraco) — ví dụ:

- Form chỉ cho phép user đã đăng nhập submit (`RequireAuth`).
- Form "Sign Up" tạo user trong Oqtane/DNN sau khi submit.
- Nút "Login with Google" ngay trong form template.
- Redirect user đến trang login của nền tảng khi chưa auth.

Tài liệu này phân tích trạng thái hiện tại và các phương án triển khai.

---

## 2. Tổng quan hệ thống template của MegaForm

MegaForm có **hai tầng template** song song:

| Tầng | Mục đích | Nguồn |
|---|---|---|
| **Form Template Catalog** | Form đơn lẻ: schema fields, settings, rules, custom HTML/CSS | File JSON trong `App_Data/MegaForm/Templates` |
| **Configured App Starter** | Ứng dụng nghiệp vụ đầy đủ: nhiều form, query, view, workflow, phân quyền | Code-defined trong `ConfiguredAppStarterDefinitions.cs` (hiện chỉ có Blog) |

### 2.1. Form Template Catalog

- File JSON có cấu trúc:
  - `title`, `description`, `category`, `icon`
  - `fields[]` — schema form
  - `settings` — theme, customHtml, customCss, customScripts, rules, workflowTemplate
  - `submitButtonText`, `successMessage`

- Ví dụ template có sẵn:
  - `contact-forms/`, `registration-forms/`, `booking-forms/`, `survey-forms/`
  - `healthcare-forms/`, `hr-forms/`, `education-forms/`, `payment-forms/`
  - Premium templates: `contact-map-left-corporate`, `french-invitation`, `golf-tournament-scoreboard`, v.v.

### 2.2. Configured App Starter

- Hiện chỉ có **Blog Publishing Starter**.
- Tạo toàn bộ app: Posts, Categories, Comments, Reader Events, workflow editorial, views, permissions, seed data.

### 2.3. Các thành phần quan trọng

| File | Vai trò |
|---|---|
| `MegaForm.Core/Templates/IFormTemplateCatalogService.cs` | Interface catalog |
| `MegaForm.Core/Templates/FormTemplateCatalogService.cs` | In-memory implementation |
| `MegaForm.Core/Services/BuilderTemplateCatalogStore.cs` | Đọc/ghi JSON template từ đĩa |
| `MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs` | Định nghĩa app starter |
| `MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs` | Provisioner tạo app starter |
| `MegaForm.UI/src/dashboard/wizard/step-setup.ts` | Wizard chọn template |
| `MegaForm.UI/src/builder/gallery.ts` | Builder Template Gallery |
| `MegaForm.UI/src/renderer/index.ts` | Client form renderer + submit handler |

---

## 3. Trạng thái hiện tại: Auth trong templates

### 3.1. Không có template login/register/forgot-password

Đã kiểm tra toàn bộ:

- `MegaForm.Web/App_Data/MegaForm/Templates/`
- `MegaForm.Premium.AspNetCore/Templates/`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/`
- `DesktopModules/MegaForm/Templates/`
- `MegaForm.Core/Seed`, `MegaForm.DNN/StarterKits`

**Kết luận:** Không có template nào là form **login, register, signup, forgot password, account, profile** theo nghĩa authentication. Các template "signup" hiện có chỉ là đăng ký sự kiện / volunteer.

### 3.2. Cờ `RequireAuth`

`FormInfo.RequireAuth` (trong `MegaForm.Core/Models/EntityModels.cs`) cho phép đánh dấu form chỉ dành cho user đã đăng nhập.

Hành vi hiện tại theo platform:

| Platform | Vị trí kiểm tra | Hành vi khi anonymous |
|---|---|---|
| **Core** | `SubmissionProcessor.ProcessAsync` | Trả lỗi `form.login_required` |
| **Oqtane** | `MegaFormController` upload endpoint | `Unauthorized("Authentication required for uploads")` |
| **Web** | `MegaForm.Web/Controllers/MegaFormController` | `Unauthorized(...)` |
| **DNN** | `FormView.ascx` | Hiện warning static, **không render form** |
| **Embed host** | `platform-host.ts` | Hiện message "You must be logged in…" |

**Nhận xét:** Không có tự động redirect đến trang login của platform. Chỉ dừng ở hiển thị lỗi/cảnh báo.

### 3.3. Workflow identity provisioning

MegaForm Core đã có sẵn các node:

- `AddRole`
- `AddUser`
- `AddUserToRole`

Các node này gọi `IWorkflowIdentityProvisioningService`, với implementation per platform:

| Platform | Implementation | Cách tạo user/role |
|---|---|---|
| **Oqtane** | `OqtaneWorkflowIdentityProvisioningService` | Ghi trực tiếp vào `AspNetUsers` + `[User]` bằng raw SQL/ADO.NET, dùng `PasswordHasher`. Không gọi Oqtane API. |
| **DNN** | `DnnWorkflowIdentityProvisioningService` | Dùng `UserController.CreateUser`, `RoleController.AddRole`, `RoleController.AddUserRole` — API chuẩn DNN. |
| **Web** | `WebWorkflowIdentityProvisioningService` | Ghi vào custom tables `MF_WebUsers` / `MF_WebRoles`. |
| **Umbraco** | `UmbracoWorkflowIdentityProvisioningService` | Ghi vào custom tables `MF_WebUsers` / `MF_WebRoles`. |

**Vấn đề ở Oqtane:**
- 3 executor `AddRole`/`AddUser`/`AddUserToRole` **chưa được đăng ký** trong `MegaForm.Oqtane.Server/Services/Startup.cs`.
- `IWorkflowPrincipalResolver` và `OqtaneWorkflowPrincipalResolver` **chưa được đăng ký**.
- `SupportedNodeTypes.All` trong `MegaForm.Core/Models/WorkflowModels.cs` **không chứa** các node identity → builder UI sẽ từ chối lưu.

Nghĩa là: code provisioning đã có nhưng chưa được "wire" vào runtime/builder trên Oqtane.

---

## 4. Các phương án wire template vào auth providers

### Phương án A: Config-only — bật external login ở host level + `RequireAuth`

**Phù hợp:** Oqtane, DNN, Umbraco.

**Cách làm:**
1. Bật external login provider (Google, LinkedIn…) trong admin của host platform.
   - Oqtane: `Admin Dashboard > User Management > Settings > External Login Settings`
   - DNN: `Persona Bar > Settings > Extensions` hoặc OAuth provider tương ứng.
   - Umbraco: External sign-in providers configuration.
2. Trong MegaForm, set form setting `RequireAuth = true`.
3. User chưa đăng nhập sẽ bị chặn submit. Họ tự đi đến trang login của platform (do template/site navigation dẫn), login xong quay lại form.

**Ưu điểm:** Không cần code MegaForm.
**Nhược điểm:** UX không mượt — user bị chặn bất ngờ khi submit, không có redirect/login link tự động.

---

### Phương án B: Sửa view module để render login link thay vì static warning

**Phù hợp:** DNN, Oqtane (và có thể Umbraco).

#### DNN

File: `MegaForm.DNN/Views/FormView.ascx`

Thay đoạn:

```aspx
<div class="mf-auth-required alert alert-warning">
    <i class="fa fa-lock"></i> You must be logged in to access this form.
</div>
```

Bằng:

```aspx
<div class="mf-auth-required alert alert-warning">
    <i class="fa fa-lock"></i> You must be logged in to access this form.
    <a href="<%= DotNetNuke.Common.Globals.NavigateURL(TabId, "", "ctl=Login", "returnurl=" + HttpUtility.UrlEncode(Request.RawUrl)) %>">
        Sign In
    </a>
    or
    <a href="<%= DotNetNuke.Common.Globals.NavigateURL(TabId, "", "ctl=Register") %>">
        Register
    </a>
</div>
```

Nếu DNN đã cấu hình authentication provider (Google, Facebook…), trang login/register của DNN sẽ tự hiển thị nút social login.

#### Oqtane

File: `MegaForm.Oqtane.Client/Index.razor`

Thêm kiểm tra:

```razor
@if (FormConfig?.RequireAuth == true && !(User?.Identity?.IsAuthenticated == true))
{
    <div class="mf-auth-required">
        <p>You must be logged in to access this form.</p>
        <a href="/login?returnurl=@Uri.EscapeDataString(NavigationManager.Uri)">Sign In</a>
        <a href="/pages/external?returnurl=@Uri.EscapeDataString(NavigationManager.Uri)">Login with Google</a>
    </div>
}
else
{
    <MegaFormRenderer ... />
}
```

Lưu ý: `/pages/external` là external login challenge page của Oqtane.

**Ưu điểm:** UX tốt, giữ nguyên platform auth flow.
**Nhược điểm:** Cần sửa code view module cho từng platform.

---

### Phương án C: Custom HTML + Custom Scripts trong template

**Phù hợp:** Tất cả các platform, đặc biệt khi muốn nút "Sign in with Google" ngay trong form.

MegaForm template hỗ trợ:

- `settings.customHtml` — HTML shell tùy chỉnh.
- `settings.customScripts` — script snippets.
- Field type `Html` — chèn HTML inline.
- Token replacement: `{{form:title}}`, `{{field:email}}`, `{{script:KEY}}`.

#### Ví dụ template JSON

```json
{
  "title": "Member Registration",
  "settings": {
    "customHtml": "
      <div class='mf-auth-header'>
        <h2>{{form:title}}</h2>
        <p>Already have an account?
           <a href='/login?returnurl=__CURRENT_URL__'>Sign In</a>
        </p>
        <div class='mf-social-login'>
          <a class='mf-btn mf-btn-google'
             href='/pages/external?returnurl=__CURRENT_URL__'>
            Sign in with Google
          </a>
        </div>
      </div>
      {{form:fields}}
    ",
    "customScripts": {
      "auth_redirect": "
        (function(){
          var links = document.querySelectorAll('a[href*=\"__CURRENT_URL__\"]');
          links.forEach(function(a){
            a.href = a.href.replace('__CURRENT_URL__', encodeURIComponent(location.href));
          });
        })();
      "
    }
  },
  "fields": [
    { "key": "first_name", "type": "Text", "label": "First Name", "required": true },
    { "key": "email", "type": "Email", "label": "Email", "required": true },
    { "key": "password", "type": "Password", "label": "Password", "required": true }
  ]
}
```

**Lưu ý:** `__CURRENT_URL__` là placeholder do template author tự đặt, cần custom script để thay bằng `location.href`.

**Vấn đề:**
- URL login khác nhau giữa Oqtane (`/login`, `/pages/external`), DNN (`?ctl=Login`), Umbraco, Web standalone.
- Không thể biết platform tại thời điển template JSON. Cần platform-aware token hoặc JS helper từ host.

**Giải pháp:** Cung cấp `window.__MF_PLATFORM__` object từ host chứa `loginUrl`, `registerUrl`, `externalLoginUrl`. Hiện tại Oqtane client đã có `window.__MF_PLATFORM__.authToken`. Có thể mở rộng thêm URLs.

---

### Phương án D: Workflow redirect đến login page

**Phù hợp:** Khi cần redirect sau submit.

MegaForm workflow có `EndNodeExecutor` với `RedirectUrl`:

```json
{
  "workflow": {
    "nodes": [
      {
        "id": "end-1",
        "type": "End",
        "config": {
          "redirectUrl": "/login?returnurl={{submission:url}}"
        }
      }
    ]
  }
}
```

Sau khi submit thành công, server trả về `redirectUrl`, client tự redirect.

**Hạn chế:** Chỉ redirect SAU submit, không giúp user login TRƯỚC khi xem form.

---

### Phương án E: Workflow `AddUser` — form submission tạo user

**Phù hợp:** Tạo form "Sign Up" mà không dùng platform login page.

Template form có fields: `email`, `password`, `firstName`, `lastName`.

Workflow:

```json
{
  "workflow": {
    "nodes": [
      {
        "id": "add-user",
        "type": "AddUser",
        "config": {
          "email": "{{field:email}}",
          "username": "{{field:email}}",
          "displayName": "{{field:first_name}} {{field:last_name}}",
          "password": "{{field:password}}",
          "isApproved": true
        }
      },
      {
        "id": "add-role",
        "type": "AddUserToRole",
        "config": {
          "userIdVariable": "provisioned.userId",
          "roleName": "Registered Users"
        }
      }
    ]
  }
}
```

Sau khi submit:
- `AddUserNodeExecutor` gọi `IWorkflowIdentityProvisioningService.EnsureUserAsync(...)`.
- Trên Oqtane: `OqtaneWorkflowIdentityProvisioningService` tạo user trong `AspNetUsers` + `[User]`.
- Trên DNN: `DnnWorkflowIdentityProvisioningService` gọi DNN API.

**Vấn đề ở Oqtane:**
- Cần đăng ký 3 executor trong `Startup.cs`.
- Cần thêm `AddRole`, `AddUser`, `AddUserToRole` vào `SupportedNodeTypes.All`.
- Cần UI trong builder để kéo thả/config node identity.

**Lưu ý bảo mật:** Form tạo user cần:
- CAPTCHA / anti-spam.
- Email verification (workflow có thể gửi email với verification token).
- Password policy validation.
- Không cho phép tạo user với role Host/Admin.

---

### Phương án F: Workflow Webhook gọi platform auth API

**Phù hợp:** Tích hợp với custom auth API hoặc identity provider bên ngoài.

MegaForm có `WebhookNodeExecutor`:

```json
{
  "id": "auth-webhook",
  "type": "Webhook",
  "config": {
    "url": "https://identity.myapp.com/api/users/register",
    "method": "POST",
    "auth": "Bearer",
    "bodyMappings": {
      "email": "{{field:email}}",
      "password": "{{field:password}}",
      "displayName": "{{field:first_name}} {{field:last_name}}"
    }
  }
}
```

**Hạn chế:**
- Không tạo user trong Oqtane/DNN local mà gọi API bên ngoài.
- User vẫn chưa authenticated với platform sau khi submit.
- Thường cần kết hợp với platform login page.

---

### Phương án G: Tạo auth-specific templates mới

**Ý tưởng:** Xây dựng các template chuyên biệt:

| Template | Mục đích | Cách wire |
|---|---|---|
| **Login Redirect Card** | Hiển thị thông báo + link login | Custom HTML với URL platform |
| **Sign Up Form** | Thu thập thông tin → workflow AddUser | Workflow identity provisioning |
| **Profile Update Form** | Cho phép user cập nhật profile | Pre-fill từ current user context + workflow Database/AddUser |
| **Password Reset Request** | Gửi email reset | Workflow Email + custom token logic |
| **Member-only Form** | Form `RequireAuth = true` + custom login prompt | Phương án B hoặc C |

Các template này có thể đặt trong:

- `MegaForm.Web/App_Data/MegaForm/Templates/auth-forms/`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/auth-forms/`
- `DesktopModules/MegaForm/Templates/auth-forms/`

---

## 5. Phân tích cụ thể theo platform

### 5.1. Oqtane

**External login flow:**
1. Admin bật Google/LinkedIn OIDC trong `User Management > Settings > External Login Settings`.
2. User truy cập `/pages/external?returnurl=<current>`.
3. Oqtane challenge provider, provider redirect về `/signin-oidc`.
4. Oqtane tạo/cập nhật user local, set cookie.
5. User quay lại form. MegaForm nhận user qua `ClaimsPrincipal`.

**Cách wire template:**

| Kịch bản | Phương án |
|---|---|
| Form chỉ cho member | A (config-only) + B (render login link) |
| Nút "Login with Google" trong form | C (custom HTML + `window.__MF_PLATFORM__.externalLoginUrl`) |
| Form đăng ký tạo user Oqtane | E (workflow AddUser) — cần wire executor trước |
| Redirect sau submit | D (End node redirect) |

**File cần động đến:**
- `MegaForm.Oqtane.Client/Index.razor` — render auth prompt.
- `MegaForm.Oqtane.Server/Services/Startup.cs` — register identity executors/resolver.
- `MegaForm.Core/Models/WorkflowModels.cs` — whitelist node types.
- `MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs` — UI schema cho node identity.
- `MegaForm.UI/src/renderer/index.ts` — support platform-aware auth URLs.

### 5.2. DNN

**External login flow:**
1. Admin cài/config OAuth provider trong DNN (Google, Facebook, Azure AD…).
2. DNN login page (`?ctl=Login`) tự hiển thị các nút social login.
3. User login xong redirect về `returnurl`.

**Cách wire template:**

| Kịch bản | Phương án |
|---|---|
| Form chỉ cho member | A + B (render link `ctl=Login`) |
| Nút social login trong form | C (custom HTML với `?ctl=Login`) |
| Form đăng ký tạo user DNN | E (workflow AddUser) — DNN implementation đã hoạt động |
| Redirect sau submit | D |

**File cần động đến:**
- `MegaForm.DNN/Views/FormView.ascx` — render login/register link.
- `MegaForm.DNN/Views/FormView.ascx.cs` — pass login/register URLs to ViewModel.

### 5.3. Umbraco

**External login flow:**
- Dùng OpenIddict / external sign-in providers của Umbraco.
- MegaForm Umbraco cũng dựa vào host auth context.

**Cách wire template:** Tương tự Oqtane/DNN — dùng custom HTML với URL login Umbraco (`/umbraco/login` hoặc front-end login page).

### 5.4. Web Standalone

Web standalone tự quản lý auth (cookie + JWT). Nếu cần social login, phải thêm `AddGoogle()` / `AddLinkedIn()` vào `MegaForm.Web/Program.cs` và xây dựng callback controller.

---

## 6. Đề xuất kiến trúc tổng thể

### 6.1. Platform-aware auth URL token

Cung cấp các token mới trong renderer để template có thể dùng:

```html
<a href="{{platform:loginUrl}}?returnurl={{page:url}}">Sign In</a>
<a href="{{platform:externalLoginUrl}}?returnurl={{page:url}}">Login with Google</a>
<a href="{{platform:registerUrl}}">Register</a>
```

Host Oqtane cung cấp:

```javascript
window.__MF_PLATFORM__ = {
  authToken: "...",
  loginUrl: "/login",
  registerUrl: "/register",
  externalLoginUrl: "/pages/external",
  currentUrl: location.href
};
```

Renderer thay thế token trước khi render custom HTML.

### 6.2. Auth prompt component

Tạo một component riêng (TypeScript hoặc Razor) để hiển thị khi form `RequireAuth` và user chưa login:

```html
<div class="mf-auth-prompt">
  <h3>This form requires sign in</h3>
  <a class="mf-btn mf-btn-primary" href="{{platform:loginUrl}}?returnurl={{page:url}}">
    Sign In
  </a>
  <a class="mf-btn mf-btn-google" href="{{platform:externalLoginUrl}}?returnurl={{page:url}}">
    Sign in with Google
  </a>
  <a class="mf-btn mf-btn-linkedin" href="{{platform:externalLoginUrl}}?provider=LinkedIn&returnurl={{page:url}}">
    Sign in with LinkedIn
  </a>
</div>
```

Component này được render thay cho form khi `RequireAuth && !isAuthenticated`.

### 6.3. Wire workflow identity trên Oqtane

Để dùng `AddUser`/`AddRole`/`AddUserToRole` trên Oqtane, cần:

1. Trong `MegaForm.Oqtane.Server/Services/Startup.cs`:
   ```csharp
   services.AddScoped<INodeExecutor, AddRoleNodeExecutor>();
   services.AddScoped<INodeExecutor, AddUserNodeExecutor>();
   services.AddScoped<INodeExecutor, AddUserToRoleNodeExecutor>();
   services.AddScoped<IWorkflowPrincipalResolver, OqtaneWorkflowPrincipalResolver>();
   ```

2. Trong `MegaForm.Core/Models/WorkflowModels.cs`:
   ```csharp
   AddRole, AddUser, AddUserToRole
   ```

3. Trong `MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs`:
   - Thêm UI schema cho 3 node identity.

4. Trong builder UI:
   - Thêm node palette icons.

### 6.4. Auth template catalog

Tạo thư mục `auth-forms/` trong kho template với các template:

- `login-prompt.json` — Auth prompt card, dùng cho form RequireAuth.
- `member-registration.json` — Sign up form với workflow AddUser + AddUserToRole.
- `profile-update.json` — Pre-fill current user, cập nhật profile.
- `password-reset-request.json` — Gửi email reset link.

---

## 7. Rủi ro và lưu ý

### 7.1. Oqtane bypass Identity API

`OqtaneWorkflowIdentityProvisioningService` ghi trực tiếp xuống `AspNetUsers` + `[User]` mà không qua Oqtane `UserManager`. Điều này có thể:

- Bỏ sót business logic của Oqtane (email verification, password history, event hooks).
- Gây lỗi nếu Oqtane schema thay đổi.
- Không tạo đủ các claims cần thiết.

**Khuyến nghị:** Đánh giá lại việc dùng Oqtane API (`UserManager`, `IUserRepository.AddUser`) thay vì raw SQL.

### 7.2. Multi-tenancy

Oqtane là multi-tenant. User được tạo phải gắn với đúng `SiteId`. `OqtaneWorkflowIdentityProvisioningService` hiện xử lý multi-provider DB (SQL Server, SQLite, PostgreSQL, MySQL) nhưng cần kiểm tra kỹ `SiteId` được gán đúng.

### 7.3. External login không cần password

Nếu user đăng ký qua Google/LinkedIn, họ không có password local. Form "Sign Up" tạo user qua workflow `AddUser` sẽ tạo user có password. Hai luồng này cần phân biệt rõ.

### 7.4. Bảo mật form Sign Up

- CAPTCHA / Turnstile / reCAPTCHA.
- Anti-spam.
- Email verification trước khi kích hoạt.
- Không cho phép tự gán role admin.
- Rate limiting.

### 7.5. Platform URL khác nhau

Template JSON không thể hardcode URL login vì khác nhau giữa Oqtane/DNN/Umbraco/Web. Bắt buộc phải có platform-aware token hoặc JS helper.

---

## 8. Kết luận

MegaForm cung cấp rất nhiều form templates, nhưng **hiện chưa có template chuyên biệt cho authentication** và **chưa có cơ chế tự động wire template vào auth providers** của platform.

Các phương án khả thi:

1. **Config-only (khuyến nghị ban đầu):** Bật external login ở host level, dùng `RequireAuth`.
2. **Sửa view module:** Render login link thay vì static warning.
3. **Custom HTML/Scripts:** Nút social login ngay trong form template.
4. **Workflow AddUser:** Tạo user từ form submission (cần wire executor trên Oqtane).
5. **Workflow redirect:** Redirect sau submit.
6. **Webhook:** Gọi external identity API.

Để có trải nghiệm tốt nhất, nên kết hợp:

- **Platform-aware auth URL token** trong renderer.
- **Auth prompt component** khi `RequireAuth && !authenticated`.
- **Wire workflow identity executors trên Oqtane** (hiện đã có code nhưng chưa đăng ký).
- **Tạo auth template catalog** (`login-prompt`, `member-registration`, `profile-update`).

Như vậy, template có thể "wire" vào auth providers một cách linh hoạt: nhanh thì config-only, nâng cao thì custom HTML + workflow provisioning.
