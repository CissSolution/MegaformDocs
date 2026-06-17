# Standalone Host

MegaForm can run as a standalone ASP.NET Core application via the
`MegaForm.AspNetCore.Component` NuGet package. This is the same component that powers the
`MegaForm.Web.Host` dev host and the `Samples/AspNetCoreHost` demo.

## Install

Add the package to your host:

```xml
<ItemGroup>
  <PackageReference Include="MegaForm.AspNetCore.Component" Version="0.2.0-preview" />
</ItemGroup>
```

If you are consuming local packages during development, add a `nuget.config`:

```xml
<configuration>
  <packageSources>
    <clear />
    <add key="local" value="..\dist\pack" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
```

## Minimal host

```csharp
using MegaForm.AspNetCore.Component;

var builder = WebApplication.CreateBuilder(args);
builder.AddMegaForm();

var app = builder.Build();
app.EnsureMegaFormDatabaseReady();
app.UseMegaForm();
app.Run();
```

This gives you:

- Admin dashboard at `/admin`
- Setup wizard at `/setup` (first run)
- Public form renderer at `/f/{formId}`
- API endpoints at `/api/MegaForm/*`
- Static assets at `/megaform/*`

## With options

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

> Use `builder.AddMegaForm(...)` (not just `builder.Services.AddMegaForm(...)`). The builder
> extension also calls `UseStaticWebAssets()` so static assets are served in every environment.

## Important options

| Group | Property | Default | Notes |
|---|---|---|---|
| Database | `DatabaseProvider`, `ConnectionString`, `ConfigureDbContext` | SQL Server | Also supports SQLite, PostgreSQL, MySQL |
| Routes | `ApiRoutePrefix`, `PopupApiRoutePrefix`, `AiApiRoutePrefix`, `AdminRoutePrefix`, `SetupRoutePrefix`, `FormRoutePrefix`, `DocumentsRoutePrefix` | `/api/MegaForm`, `/api/MegaFormPopup`, `/api/MegaFormAi`, `/admin`, `/setup`, `/f`, `/documents` | All prefixes are configurable |
| Auth | `UseMegaFormAuthentication`, `AuthenticationSchemeName`, `CookieName`, `LoginPath`, `LogoutPath`, `AccessDeniedPath`, `JwtKey` | true, "MegaFormAuth" | Set `UseMegaFormAuthentication = false` if the host already has Identity |
| Features | `UseSetupWizard`, `UseCors`, `UseSwagger`, `AutoEnsureDatabase` | true, true, false, true | |
| Host | `BaseUrl`, `ContentRootPath`, `StorageRootPath`, `TemplatesPath` | | Used by storage and templates |

## Multi-database

Change provider and connection string in `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "MegaForm": "Data Source=megaform.db"
  },
  "Database": {
    "Provider": "SQLite"
  }
}
```

Supported providers: `SqlServer`, `SQLite`, `PostgreSql`, `MySql`.

## Embedding a form in your own pages

Reference the MegaForm tag helper and use the `<megaform>` tag:

```razor
@addTagHelper *, MegaForm.AspNetCore.Component

<megaform form-id="@Model.FormId" mode="embed" min-height="720" theme="corporate"></megaform>
```

See `Samples/CorporateWeb` for a complete landing-page + contact-form example.

## Using the SDK in a standalone host

To consume `IMegaFormClient` from your own controllers or background jobs in the standalone host,
register the SDK:

```csharp
builder.Services.AddMegaFormSdk();

var app = builder.Build();
MegaForm.Sdk.MegaFormSdk.Initialize(app.ApplicationServices);
```

Then inject `IMegaFormClient` or use `MegaFormSdk.RunAsync(...)` from non-DI code.

## Build and run

```bash
dotnet build
dotnet run
```

Open the URL shown in the console. On first run you will be redirected to `/setup` to create the
admin account.

Default admin credentials in the `CorporateWeb` sample are **admin / admin123** because the sample
seeds them automatically.
