# MegaForm Premium for ASP.NET Core

This is the paid add-on package for MegaForm ASP.NET Core hosts. It unlocks:

- **Workflow editor & runtime** — visual workflow builder and full execution engine.
- **Premium templates** — ready-made form templates sold as part of the premium offering.

## Usage

```csharp
var builder = WebApplication.CreateBuilder(args);

// Free MegaForm features (forms, submissions, AI, reporting, dashboard)
builder.AddMegaForm(options =>
{
    options.UseSqlite(builder.Configuration.GetConnectionString("MegaForm"));
});

// Premium unlock
builder.AddMegaFormPremium();

var app = builder.Build();
app.EnsureMegaFormDatabaseReady();
app.UseMegaFormPremium();   // static assets & initialization
app.UseMegaForm();
app.Run();
```

This package references `MegaForm.AspNetCore.Component` and must be installed
alongside it.
