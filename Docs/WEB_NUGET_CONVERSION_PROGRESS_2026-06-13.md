# MegaForm.Web NuGet Conversion Progress

**Date:** 2026-06-13  
**Scope:** Convert `MegaForm.Web` from a standalone ASP.NET Core host into a reusable NuGet library (Option B — Clean Refactor).

## What was completed

### 1. Project restructure
- `MegaForm.Web` is now a Razor Class Library (`Microsoft.NET.Sdk.Razor`) containing controllers, views, services, DbContext, middleware, and static assets.
- `MegaForm.Web.Host` is the new standalone host project holding `Program.cs`, configuration, and lock files.
- Removed the stale `TestForm.AspNetCore` solution reference.

### 2. Consumer API (`MegaForm.AspNetCore.Component`)
Replaced the old `AddMegaFormComponent` / `UseMegaFormComponent` entry points with a configurable two-line integration:

```csharp
builder.AddMegaForm(options =>
{
    options.UseSqlServer("...");
    options.UseMegaFormAuthentication = true;
    options.UseSwagger = builder.Environment.IsDevelopment();
});

var app = builder.Build();
app.EnsureMegaFormDatabaseReady();
app.UseMegaForm();
```

`builder.AddMegaForm()` calls `WebHost.UseStaticWebAssets()` so MegaForm static assets are served in any environment (not only Development).

`MegaFormOptions` exposes groups for:
- Database provider / connection string / custom `DbContext` config
- Route prefixes (API, popup API, AI API, admin, setup, form, documents)
- Authentication scheme, cookie name, login/logout paths, JWT key
- Feature toggles (setup wizard, CORS, Swagger, auto-ensure database)

### 3. Workflow identity provisioning
- Implemented `WebWorkflowIdentityProvisioningService` using custom `MF_WebUsers` / `MF_WebRoles` / `MF_WebUserRoles` tables.
- Registered it in `AddMegaForm` along with `IWorkflowPrincipalResolver`.

### 4. Configurable route prefixes
- Added `IMegaFormRouteOptions` in `MegaForm.Core` so `MegaForm.Web` middleware can read route options without a circular dependency.
- Added `MegaFormRoutePrefixConvention` to rewrite default attribute-route prefixes at MVC model-build time.
- Updated `SetupMiddleware` to respect configured setup/API prefixes.

### 5. Static asset packaging
- `MegaForm.AspNetCore.Component` is now a meta-package that depends on `MegaForm.Web`.
- `MegaForm.Web` is packable and ships its `wwwroot` assets as ASP.NET Core static web assets (`staticwebassets/*` + `.props` files).
- Set `StaticWebAssetBasePath` to `/` so assets are served at `/megaform/*` instead of `/_content/MegaForm.Web/*`.
- Consumers restoring `MegaForm.AspNetCore.Component` automatically receive `MegaForm.Web` and its static assets.

### 6. Build verification
- Full solution builds successfully: **0 errors**, warnings reduced to existing DNN/Umbraco/Oqtane/package-version warnings.
- `dotnet pack` produces clean packages for `MegaForm.Core`, `MegaForm.Web`, and `MegaForm.AspNetCore.Component`.
- `MegaForm.AspNetCore.Component` package has correct dependencies (`MegaForm.Core` 1.5.0 and `MegaForm.Web` 1.7.0) and no duplicated DLLs.
- Ran `MegaForm.Web.Host` and `Samples/AspNetCoreHost`; routes, setup wizard, auth challenge, and static assets all behave as expected.

## Files changed

- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`
- `MegaForm.AspNetCore.Component/MegaFormOptions.cs`
- `MegaForm.AspNetCore.Component/MegaFormRoutePrefixConvention.cs` (new)
- `MegaForm.AspNetCore.Component/MegaForm.AspNetCore.Component.csproj`
- `MegaForm.AspNetCore.Component/README.md`
- `MegaForm.Web.Host/Program.cs`
- `MegaForm.Web/Controllers/AdminController.cs`
- `MegaForm.Web/Controllers/AdminAuthController.cs`
- `MegaForm.Web/Controllers/FormController.cs`
- `MegaForm.Web/Controllers/SetupController.cs`
- `MegaForm.Web/Middleware/SetupMiddleware.cs`
- `MegaForm.Web/Data/Phase2DataLayer.cs`
- `MegaForm.Web/Data/DataLayer.cs`
- `MegaForm.Web/Data/DatabaseSchemaBootstrapper.cs`
- `MegaForm.Web/Services/WebWorkflowIdentityProvisioningService.cs` (new)
- `MegaForm.Web/MegaForm.Web.csproj`
- `MegaForm.Core/Interfaces/IMegaFormRouteOptions.cs` (new)
- `Samples/AspNetCoreHost/` (new demo consumer project)
- `Samples/CorporateWeb/` (new corporate website sample with embedded contact form)

## Remaining considerations

- **Razor views discovery:** verified via `AddApplicationPart(typeof(MegaFormController).Assembly)`.
- **Auth collision:** resolved by `UseMegaFormAuthentication = false` opt-out.
- **Route-prefix edge cases:** convention handles the known controller attribute routes; controller redirects now use `IMegaFormRouteOptions` instead of hard-coded `/admin`/`/setup`. Any new absolute routes in `MegaForm.Web` should follow the same prefix patterns or be added to the convention.
- **Consumer root redirect:** the host is still responsible for mapping `/` to `/admin` or `/setup`; this is intentional so the host keeps control of the root path.
- **Demo apps:**
  - `Samples/AspNetCoreHost` uses the published NuGet packages from `dist/pack` and verifies the end-to-end consumer experience.
  - `Samples/CorporateWeb` demonstrates embedding a MegaForm contact form into a real-world corporate website using the `<megaform>` TagHelper.
  - `Samples/CorporateWeb` now auto-completes MegaForm setup (`setup.lock`, `appsettings.Production.json`, admin credentials) so `/admin` is ready immediately with dashboard, builder, submissions, and languages links.
