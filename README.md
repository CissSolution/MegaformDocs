# MegaForm — Multi-Platform Form Builder

## Architecture

```
MegaForm.sln
├── MegaForm.Core/           net472;net8.0 — Models, Interfaces, Services, Utilities
├── MegaForm.DNN/            .NET 4.7.2 — DNN 9.x module (ASCX, DnnApiController, ADO.NET)
├── MegaForm.Oqtane/         .NET 8 — Oqtane 5.x module (Razor, EF Core)
├── MegaForm.Web/            .NET 10 — Standalone web app (Minimal API, EF Core)
├── Assets/                  Shared JS/CSS (100% identical across all platforms)
└── Docs/                    Specs and documentation
```

## Core (Shared Library)
- **net472;net8.0**: compatible with .NET Framework 4.7.2+, .NET 8, .NET 10
- All business logic: validation, anti-spam, email templates, webhook, workflows
- Pure C#, ZERO platform dependencies
- Constructor injection: each platform wires its own implementations

## Platform Interface Map

| Interface | DNN | Oqtane | .NET 10 |
|-----------|-----|--------|---------|
| IFormRepository | DnnFormRepositoryAdapter | EfFormRepository | EfFormRepository |
| ISubmissionRepository | DnnSubmissionRepositoryAdapter | EfSubmissionRepository | EfSubmissionRepository |
| IEmailSender | DnnEmailSender (DNN Mail) | OqtaneEmailSender | SmtpEmailSender |
| ILogService | DnnLogService (EventLog) | OqtaneLogService (ILogger) | NetLogService (ILogger) |

## Assets Deployment
- **DNN**: Copy `Assets/` → `DesktopModules/MegaForm/Assets/`
- **Oqtane**: Copy `Assets/` → `MegaForm.Oqtane/wwwroot/Modules/MegaForm/`
- **.NET 10**: Copy `Assets/` → `MegaForm.Web/wwwroot/megaform/`

## Documentation

Full guides and API reference are built with [DocFX](https://dotnet.github.io/docfx/):

```bash
cd Docs/docfx
docfx build
```

Key articles:
- [Template JSON Reference](Docs/docfx/articles/form-template-json.md) — schema for MegaForm templates.
- [AI Prompts for Form Design](Docs/docfx/articles/ai-prompts-form-design.md) — prompts that preserve the original design while editing fields and logic.

## Building
```bash
# Core only
dotnet build MegaForm.Core/MegaForm.Core.csproj

# .NET 10 standalone
dotnet run --project MegaForm.Web/MegaForm.Web.csproj

# Oqtane module
dotnet build MegaForm.Oqtane/MegaForm.Oqtane.csproj

# DNN — open in Visual Studio with DNN references
```
