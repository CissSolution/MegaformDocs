# Claude Handoff — MegaForm Auth Integration (Oqtane/DNN/Umbraco) & Templates

> **Date:** 2026-07-06  
> **Scope:** Research + architecture handoff. No code changes were made.  
> **Related research docs:**
> - `CLAUDE_RESEARCH_20260706_MEGAFORM_CORE_AND_OQTANE_EXTERNAL_LOGIN.md`
> - `CLAUDE_RESEARCH_20260706_MEGAFORM_TEMPLATES_AND_AUTH_PROVIDERS.md`

---

## TL;DR for next Claude

This handoff captures two related research threads:

1. **Oqtane External Login (Google/LinkedIn/OIDC/OAuth2)** for MegaForm.
2. **Wiring MegaForm form templates** into platform authentication providers (Oqtane, DNN, Umbraco, Web standalone).

**Key takeaway:** MegaForm does **not** implement its own authentication. It relies entirely on the host platform's auth context. Enabling Google/LinkedIn sign-up for MegaForm on Oqtane is primarily a **host-level configuration** task, not a MegaForm code change. However, there are gaps (especially around Oqtane workflow identity executors and auth-specific templates) that will require code if the user wants deeper integration.

When this handoff is picked up, confirm with the user which scenario they want to implement, then choose the appropriate path from Section 5.

---

## 1. MegaForm Core architecture (what future Claude must know)

### 1.1. Multi-target shared Core

- `MegaForm.Core/MegaForm.Core.csproj` targets `net472;net8.0;net9.0;net10.0`.
  - `net472` → DNN.
  - `net8.0/9.0/10.0` → Oqtane, Umbraco, standalone Web.
- Core contains: business logic, models, workflow engine, submission pipeline, permissions, templating.
- Each platform implements Core abstractions via adapters.

### 1.2. Important abstractions

| Interface | Purpose | Oqtane implementation |
|---|---|---|
| `IPlatformContext` | Portal/Site ID, Module ID, current User ID, IsAdmin | `OqtanePlatformContext` |
| `IPermissionPrincipalCatalogProvider` | List users/roles for permission UI | `OqtanePermissionPrincipalCatalogProvider` |
| `IWorkflowIdentityProvisioningService` | Create/update users and roles from workflow | `OqtaneWorkflowIdentityProvisioningService` |
| `IWorkflowPrincipalResolver` | Resolve users/role members for workflow notifications | `OqtaneWorkflowPrincipalResolver` |
| `IFormRepository`, `ISubmissionRepository`, etc. | Data access | `EfFormRepository`, `EfSubmissionRepository` |

### 1.3. MegaForm on Oqtane is a standard module

- No `Program.cs`/`Startup.cs` in the module.
- Registers DI via `MegaForm.Oqtane.Server/Services/Startup.cs` implementing `IServerStartup`.
- Controllers inherit `ModuleControllerBase` and use Oqtane policies `[Authorize(Policy = "ViewModule")]` / `[Authorize(Policy = "EditModule")]`.
- User context comes from `ModuleControllerBase.User` (`ClaimsPrincipal`).
- JS fetch interceptor adds `Authorization: Bearer <SiteState.AuthorizationToken>` from `megaform-oqtane-auth.js`.

### 1.4. Critical files to bookmark

```text
MegaForm.Core/MegaForm.Core.csproj
MegaForm.Core/Interfaces/ICoreInterfaces.cs
MegaForm.Core/Interfaces/RecoveredWorkflowIdentityInterfaces.cs
MegaForm.Core/Services/SubmissionProcessor.cs
MegaForm.Core/Services/WorkflowEngineV2.cs
MegaForm.Core/Workflow/IdentityNodeExecutors.cs
MegaForm.Core/Models/WorkflowModels.cs
MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs

MegaForm.Oqtane.Server/Services/Startup.cs
MegaForm.Oqtane.Server/Services/OqtanePlatformContext.cs
MegaForm.Oqtane.Server/Services/OqtaneWorkflowIdentityProvisioningService.cs
MegaForm.Oqtane.Server/Services/OqtaneWorkflowPrincipalResolver.cs
MegaForm.Oqtane.Server/Controllers/MegaFormController.cs
MegaForm.Oqtane.Client/Index.razor
MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-oqtane-auth.js

MegaForm.DNN/Services/DnnServiceLocator.cs
MegaForm.DNN/Services/DnnWorkflowIdentityProvisioningService.cs
MegaForm.DNN/Views/FormView.ascx
MegaForm.DNN/Views/FormView.ascx.cs

MegaForm.Web/Program.cs
MegaForm.Web/Controllers/AdminAuthController.cs
MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs
```

---

## 2. Current state of authentication in MegaForm

### 2.1. What exists today

- **Cookie/JWT auth in standalone Web host** (`MegaForm.Web/Program.cs`).
- **Host-level auth on Oqtane, DNN, Umbraco** — MegaForm consumes the resulting `ClaimsPrincipal`.
- **Google Service Account OAuth** only for Google Sheets integration (`GoogleSheetsAuthService.cs`).
- **Workflow identity provisioning code** exists in Core + platform implementations, but is **not fully wired on Oqtane**.
- **No external/social login code** (no `AddGoogle`, `AddOpenIdConnect`, `SignInManager`, etc.).
- **No auth-specific templates** (no login/register/forgot-password/profile templates).

### 2.2. What is missing

| Gap | Impact |
|---|---|
| `AddRole`/`AddUser`/`AddUserToRole` executors not registered in Oqtane DI | Workflow cannot provision identity on Oqtane. |
| `IWorkflowPrincipalResolver` not registered in Oqtane DI | Approval/notification nodes may not resolve users correctly. |
| `SupportedNodeTypes.All` does not include identity nodes | Builder UI refuses to save workflows containing AddUser/AddRole. |
| No UI schema for identity nodes | Users cannot configure AddUser/AddRole nodes in the builder. |
| No auth prompt component | `RequireAuth` forms just show static error instead of login link. |
| No auth template catalog | No reusable login-prompt/member-registration/profile-update templates. |
| No platform-aware auth URL tokens | Custom HTML templates cannot generate correct login URLs across Oqtane/DNN/Umbraco. |

---

## 3. Oqtane External Login Providers — quick reference

### 3.1. Enable Google / LinkedIn on Oqtane host

Path in Oqtane Admin:

```text
Control Panel -> Admin Dashboard -> User Management -> Settings -> External Login Settings
```

Recommended settings:

| Setting | Google | LinkedIn |
|---|---|---|
| Provider Type | `OIDC` | `OIDC` |
| Provider Name | `Google` | `LinkedIn` |
| Authority | `https://accounts.google.com` | `https://www.linkedin.com` |
| Metadata Url | `https://accounts.google.com/.well-known/openid-configuration` | `https://www.linkedin.com/oauth/.well-known/openid-configuration` |
| Scopes | `openid,profile,email` | `openid,profile,email` |
| Name Claim | `name` | `name` |
| Email Claim | `email` | `email` |
| Create Users | `true` (auto-provision local user) | `true` |

Redirect URI to register with provider:

```text
https://<site-url>/signin-oidc
https://<site-url>/<alias>/signin-oidc   (if site has alias path)
```

### 3.2. How Oqtane routes work

| URL | Purpose |
|---|---|
| `/login?returnurl=<url>` | Local Oqtane login page |
| `/pages/external?returnurl=<url>` | External login challenge (OIDC/OAuth2) |
| `/signin-oidc` | OIDC callback |
| `/signin-oauth2` | OAuth2 callback |

After successful external login, Oqtane creates/updates a local user and sets the auth cookie. MegaForm controllers automatically see the authenticated `ClaimsPrincipal`.

### 3.3. Important Oqtane source references

```text
Oqtane.Server/Extensions/OqtaneSiteAuthenticationBuilderExtensions.cs
Oqtane.Server/Pages/External.cshtml.cs
Oqtane.Server/Controllers/UserController.cs
Oqtane.Server/Managers/UserManager.cs
Oqtane.Shared/Shared/ExternalLoginProviders.cs
Oqtane.Shared/Shared/ExternalLoginStatus.cs
```

---

## 4. Wiring MegaForm templates into auth providers

### 4.1. Template system overview

MegaForm has two template layers:

1. **Form Template Catalog** — JSON files in `App_Data/MegaForm/Templates/`.
   - Loaded by `BuilderTemplateCatalogStore`.
   - Rendered by `MegaForm.UI/src/renderer/index.ts`.
   - Contains fields, settings, rules, workflow.
2. **Configured App Starter** — code-defined apps (currently only Blog).

### 4.2. No auth templates exist

Search keywords in template folders (`login`, `register`, `signup`, `authentication`, `profile`, `account`, `forgot`) returned no authentication templates. Existing "signup" templates are event/volunteer registrations.

### 4.3. `RequireAuth` behavior

`FormInfo.RequireAuth` marks a form as members-only. Current behavior:

- Oqtane: returns `Unauthorized` on submit/upload; form is still rendered for anonymous users.
- DNN: shows static warning and does not render form.
- Web: returns `Unauthorized` on submit/upload.
- Core: returns localized error `form.login_required`.

**No automatic redirect to platform login page exists today.**

---

## 5. Implementation paths (choose one with the user)

### Path 1: Config-only external login for Oqtane (no code)

**Goal:** Allow users to sign up/log in with Google/LinkedIn, then use MegaForm normally.

**Steps:**
1. Register OAuth app in Google Cloud Console / LinkedIn Developer Portal.
2. Configure Oqtane External Login Provider in Admin Dashboard.
3. Set `RequireAuth = true` on MegaForm forms that should be members-only.
4. Add site navigation or surrounding page content that directs anonymous users to `/login`.

**Pros:** Zero code changes.  
**Cons:** Poor UX — anonymous users see the form but get an error only when they submit.

---

### Path 2: Render login prompt in module views (small platform-specific code)

**Goal:** When a form has `RequireAuth = true` and the user is anonymous, show a friendly login prompt with links.

**Oqtane changes:**
- File: `MegaForm.Oqtane.Client/Index.razor`
- Add a check before rendering the form:
  ```razor
  @if (FormConfig?.RequireAuth == true && !(User?.Identity?.IsAuthenticated == true))
  {
      <div class="mf-auth-prompt">
          <p>This form requires sign in.</p>
          <a href="/login?returnurl=@Uri.EscapeDataString(NavigationManager.Uri)">Sign In</a>
          <a href="/pages/external?returnurl=@Uri.EscapeDataString(NavigationManager.Uri)">Sign in with Google</a>
      </div>
  }
  ```

**DNN changes:**
- File: `MegaForm.DNN/Views/FormView.ascx`
- Replace static warning with login/register links:
  ```aspx
  <a href="<%= DotNetNuke.Common.Globals.NavigateURL(TabId, "", "ctl=Login", "returnurl=" + HttpUtility.UrlEncode(Request.RawUrl)) %>">Sign In</a>
  <a href="<%= DotNetNuke.Common.Globals.NavigateURL(TabId, "", "ctl=Register") %>">Register</a>
  ```

**Pros:** Better UX, small changes.  
**Cons:** Platform-specific view changes.

---

### Path 3: Platform-aware auth URL tokens in renderer + custom HTML templates

**Goal:** Allow template authors to embed "Sign in with Google" buttons directly in form templates without hardcoding platform URLs.

**Concept:** Extend `window.__MF_PLATFORM__` with auth URLs:

```javascript
window.__MF_PLATFORM__ = {
  authToken: "...",
  loginUrl: "/login",
  registerUrl: "/register",
  externalLoginUrl: "/pages/external",
  currentUrl: location.href
};
```

**Renderer changes:**
- In `MegaForm.UI/src/renderer/index.ts`, support tokens:
  - `{{platform:loginUrl}}`
  - `{{platform:registerUrl}}`
  - `{{platform:externalLoginUrl}}`
  - `{{page:url}}`
- Replace these tokens before rendering `customHtml` / `htmlContent`.

**Template example:**

```json
{
  "title": "Member Registration",
  "settings": {
    "customHtml": "
      <h2>{{form:title}}</h2>
      <a class='mf-btn mf-btn-google'
         href='{{platform:externalLoginUrl}}?returnurl={{page:url}}'>
        Sign in with Google
      </a>
      {{form:fields}}
    "
  }
}
```

**Pros:** Reusable across platforms, template-driven.  
**Cons:** Requires renderer changes; custom HTML is static so token replacement must happen at render time.

---

### Path 4: Wire workflow identity executors on Oqtane

**Goal:** Enable `AddRole`, `AddUser`, `AddUserToRole` workflow nodes so form submissions can provision Oqtane users/roles.

**Required code changes:**

1. `MegaForm.Oqtane.Server/Services/Startup.cs`
   ```csharp
   services.AddScoped<INodeExecutor, AddRoleNodeExecutor>();
   services.AddScoped<INodeExecutor, AddUserNodeExecutor>();
   services.AddScoped<INodeExecutor, AddUserToRoleNodeExecutor>();
   services.AddScoped<IWorkflowPrincipalResolver, OqtaneWorkflowPrincipalResolver>();
   ```

2. `MegaForm.Core/Models/WorkflowModels.cs`
   - Add `AddRole`, `AddUser`, `AddUserToRole` to `SupportedNodeTypes.All`.

3. `MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs`
   - Add UI schema for the three identity nodes.

4. `MegaForm.UI` builder
   - Add node palette entries/icons for AddRole/AddUser/AddUserToRole.

**Important warning:** `OqtaneWorkflowIdentityProvisioningService` currently writes directly to `AspNetUsers` and `[User]` tables using raw SQL/ADO.NET, bypassing Oqtane's `UserManager`. Before enabling in production, evaluate whether this is safe or whether to refactor to use Oqtane's `IUserRepository` / `UserManager` APIs.

**Pros:** Enables self-service sign-up forms.  
**Cons:** Medium complexity; security-sensitive; must validate multi-tenancy and password/email policies.

---

### Path 5: Create auth-specific template catalog

**Goal:** Provide reusable templates for common auth scenarios.

**Proposed templates:**

| Template | Scenario | Primary mechanism |
|---|---|---|
| `login-prompt.json` | Auth gate for `RequireAuth` forms | Custom HTML + platform auth URL tokens (Path 3) |
| `member-registration.json` | Self-service sign-up | Workflow AddUser + AddUserToRole (Path 4) |
| `profile-update.json` | Update current user profile | Pre-fill from `UserContext` + workflow Database/AddUser |
| `password-reset-request.json` | Request password reset | Workflow Email + custom token storage |

**Location:**

```text
MegaForm.Web/App_Data/MegaForm/Templates/auth-forms/
MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/auth-forms/
DesktopModules/MegaForm/Templates/auth-forms/
MegaForm.Premium.AspNetCore/Templates/auth-forms/   (if premium)
```

**Pros:** Users can create auth-aware forms from templates.  
**Cons:** Depends on Path 3 and/or Path 4 being implemented first.

---

## 6. Decision matrix

| User need | Recommended path | Code required |
|---|---|---|
| Just enable Google/LinkedIn login for MegaForm on Oqtane | Path 1 | No |
| Better UX for anonymous users on `RequireAuth` forms | Path 2 | Yes (view modules) |
| Embed social login buttons inside form templates | Path 3 | Yes (renderer tokens) |
| Self-service sign-up forms that create Oqtane users | Path 4 | Yes (workflow wiring) |
| Reusable auth templates in gallery | Path 5 | Yes (templates + depends on 3/4) |

**Typical recommended combination:** Path 2 (immediate UX improvement) → Path 3 (template flexibility) → Path 4 (sign-up workflows) → Path 5 (auth template catalog).

---

## 7. Pitfalls and warnings

1. **Oqtane identity provisioning bypasses Oqtane APIs.** `OqtaneWorkflowIdentityProvisioningService` writes raw SQL to `AspNetUsers` + `[User]`. This may miss Oqtane business logic (email verification, password history, events). Consider refactoring before production use.

2. **Multi-tenancy.** Oqtane sites share a database. Ensure any user/role created by workflow is scoped to the correct `SiteId`.

3. **External login users have no local password.** If you also provide a local sign-up form via `AddUser`, keep the two flows distinct. Do not overwrite external-login users with a password unless intended.

4. **Security for sign-up forms.** Any form that creates users must include:
   - CAPTCHA / Turnstile / reCAPTCHA (`MegaForm.Core/SpamProtection/`).
   - Anti-spam service.
   - Rate limiting.
   - Email verification before activation.
   - Role restrictions (do not allow self-assigning Host/Admin).

5. **Platform URL differences.** Never hardcode `/login` or `/pages/external` in shared templates. Use platform-aware tokens (Path 3).

6. **Oqtane module packaging.** If you modify `MegaForm.Oqtane.Client/Index.razor` or server files, remember to bump `AssetVersion.cs` and rebuild the NuGet package (`MegaForm.Oqtane.Package`).

---

## 8. Files to read first when implementing

### For Path 1 (config-only)
- `CLAUDE_RESEARCH_20260706_MEGAFORM_CORE_AND_OQTANE_EXTERNAL_LOGIN.md`
- Oqtane docs / Oqtane.Server External Login source files.

### For Path 2 (login prompt)
- `MegaForm.Oqtane.Client/Index.razor`
- `MegaForm.DNN/Views/FormView.ascx`
- `MegaForm.DNN/Views/FormView.ascx.cs`

### For Path 3 (renderer tokens)
- `MegaForm.UI/src/renderer/index.ts`
- `MegaForm.UI/src/renderer/megaform-renderer.ts`
- `MegaForm.Oqtane.Client/Index.razor` (where `window.__MF_PLATFORM__` is built)
- `MegaForm.Core/Services/FormHtmlRenderer.cs` (SSR path)

### For Path 4 (workflow identity)
- `MegaForm.Core/Workflow/IdentityNodeExecutors.cs`
- `MegaForm.Core/Models/WorkflowIdentityModels.cs`
- `MegaForm.Core/Models/WorkflowModels.cs`
- `MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.Oqtane.Server/Services/OqtaneWorkflowIdentityProvisioningService.cs`
- `MegaForm.Oqtane.Server/Services/OqtaneWorkflowPrincipalResolver.cs`
- `MegaForm.DNN/Services/DnnServiceLocator.cs` (reference for how DNN wires executors)

### For Path 5 (auth templates)
- `MegaForm.Core/Services/BuilderTemplateCatalogStore.cs`
- `MegaForm.Web/App_Data/MegaForm/Templates/` (copy structure)
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/`
- `DesktopModules/MegaForm/Templates/`

---

## 9. Open questions for future sessions

Before writing code, ask the user:

1. Which platform is the priority? (Oqtane / DNN / Umbraco / Web)
2. Which scenario? (members-only forms, social login buttons in templates, self-service sign-up, profile update, etc.)
3. Is code change acceptable, or must it remain config-only?
4. Should new users created via form be local users or external-login-only users?
5. Should sign-up forms send email verification?
6. Should auth templates appear in the template gallery?
7. Which external providers are required? (Google, LinkedIn, Microsoft, Facebook, custom OIDC...)

---

## 10. Status

- [x] Research MegaForm Core architecture.
- [x] Research Oqtane external login mechanism.
- [x] Research MegaForm template system.
- [x] Research workflow identity provisioning gaps.
- [x] Document implementation paths.
- [ ] Implement chosen path (pending user decision).
