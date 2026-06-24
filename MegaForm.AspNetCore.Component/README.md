# MegaForm ASP.NET Core Component

Reusable ASP.NET Core integration for MegaForm. Add forms, workflow, admin console,
and submission APIs to any ASP.NET Core host with two lines of code.

## Quick start

```csharp
using MegaForm.AspNetCore.Component;

var builder = WebApplication.CreateBuilder(args);

builder.AddMegaForm();

var app = builder.Build();
app.EnsureMegaFormDatabaseReady();
app.UseMegaForm();

app.Run();
```

The host must provide a connection string:

```json
{
  "ConnectionStrings": {
    "MegaForm": "Server=.;Database=MegaForm;Trusted_Connection=true;TrustServerCertificate=true;"
  },
  "Database": {
    "Provider": "SqlServer"
  }
}
```

Supported providers: `SqlServer`, `Sqlite`, `PostgreSql`, `MySql`.

## Configuration options

```csharp
builder.AddMegaForm(options =>
{
    options.UseSqlServer("...");

    options.UseMegaFormAuthentication = true;
    options.AuthenticationSchemeName = "MegaFormAuth";
    options.LoginPath = "/admin/login";

    options.UseSetupWizard = true;
    options.AutoEnsureDatabase = true;
    options.UseSwagger = builder.Environment.IsDevelopment();

    options.JwtKey = builder.Configuration["Jwt:Key"];
});
```

### Option groups

| Group | Properties |
|-------|------------|
| **Database** | `DatabaseProvider`, `ConnectionString`, `ConfigureDbContext` |
| **Paths** | `ContentRootPath`, `StorageRootPath`, `TemplatesPath` |
| **Routes** | `ApiRoutePrefix`, `PopupApiRoutePrefix`, `AiApiRoutePrefix`, `AdminRoutePrefix`, `SetupRoutePrefix`, `FormRoutePrefix`, `DocumentsRoutePrefix` |
| **Authentication** | `UseMegaFormAuthentication`, `AuthenticationSchemeName`, `CookieName`, `LoginPath`, `LogoutPath`, `AccessDeniedPath`, `JwtKey` |
| **Features** | `UseSetupWizard`, `UseCors`, `UseSwagger`, `AutoEnsureDatabase` |
| **Host** | `BaseUrl` |

## Render a form in the host

Enable the TagHelper:

```cshtml
@addTagHelper *, MegaForm.AspNetCore.Component
```

Render a form:

```cshtml
<megaform form-id="1" mode="embed" min-height="720" radius="20"></megaform>
```

Or use the HtmlHelper:

```cshtml
@using MegaForm.AspNetCore.Component
@await Html.MegaFormAsync(1, new MegaFormRenderOptions
{
    Mode = MegaFormRenderMode.Embed,
    MinHeight = "720",
    Radius = "20"
})
```

## Query submissions from the host

```cshtml
@inject MegaForm.Core.Services.SubmissionQueryService SubmissionQueries
@using MegaForm.Core.Models

@{
    var recent = SubmissionQueries.List(new SubmissionListQuery { PageSize = 10 });
}
```

## Default routes

- `/setup` — initializes MegaForm once for the whole host app.
- `/admin` — MegaForm administration dashboard.
- `/f/{id}` — public hosted form page.
- `/f/{id}/embed` — iframe-friendly route used by the Razor helper.
- `/api/MegaForm/*` — REST API surface.

Route prefixes can be changed via `MegaFormOptions`.

## Demo projects

- `Samples/AspNetCoreHost` — minimal consumer app that references this package from a local NuGet feed (`dist/pack`).
- `Samples/CorporateWeb` — realistic corporate website (landing, details and contact pages) that embeds a MegaForm contact form using the `<megaform>` TagHelper. The contact form is seeded automatically on first run.

## Authentication

By default MegaForm registers its own cookie/JWT hybrid scheme named `MegaFormAuth`.
Set `UseMegaFormAuthentication = false` to use the host's existing Identity/Auth setup
and avoid scheme collisions.
