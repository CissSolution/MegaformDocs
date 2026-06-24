# MegaForm.Sdk

A thin, stable, host-agnostic SDK for the MegaForm engine. Use it to create forms, list forms,
query submissions, and download uploaded files from your own code — without touching MegaForm's
internal repositories, EF models, or rendering pipeline.

## Install

```xml
<ItemGroup>
  <PackageReference Include="MegaForm.Sdk" Version="0.1.0-preview" />
</ItemGroup>
```

Target frameworks: `net472`, `net8.0`, `net9.0`, `net10.0`.

## Quick start

```csharp
using MegaForm.Sdk;

// In a DI host (Oqtane, ASP.NET Core, etc.)
public class MyService
{
    private readonly IMegaFormClient _mega;
    public MyService(IMegaFormClient mega) => _mega = mega;

    public async Task Demo()
    {
        var scope = new MegaFormScope { PortalId = 1 };

        // List published forms
        var forms = await _mega.Forms.ListFormsAsync(
            new FormQuery { Status = "published", PageSize = 50 }, scope);

        // Query submissions
        var page = await _mega.Submissions.FindAsync(
            new SubmissionQuery { FormId = 1, PageSize = 100 }, scope);

        // Download an uploaded file
        var file = await _mega.Files.OpenAsync(10, 1, scope);
    }
}
```

Register the SDK once at startup:

```csharp
services.AddMegaFormSdk();
```

The host must already register `IFormRepository`, `ISubmissionRepository`, and optionally
`IFileRepository` + `IStorageService` for the Files API. This is automatic on Oqtane and DNN once
the MegaForm module is installed.

## Non-DI hosts

For DNN Razor Host, DDR templates, or legacy `.ascx` controls, use the ambient accessor:

```csharp
MegaFormSdk.Initialize(serviceProvider);

var forms = await MegaFormSdk.RunAsync(c =>
    c.Forms.ListFormsAsync(
        new FormQuery { Status = "published" },
        new MegaFormScope { PortalId = portalId }));
```

## API surface

- `IMegaFormClient` — single entry point
  - `.Forms` — `IFormApi`: `CreateFormAsync`, `GetFormAsync`, `ListFormsAsync`, `DeleteFormAsync`
  - `.Submissions` — `ISubmissionApi`: `FindAsync`, `GetAsync`
  - `.Files` — `IFileApi`: `ListForSubmissionAsync`, `OpenAsync`
- `MegaFormScope` — explicit portal/user context for background jobs or external modules
- `FormDto`, `SubmissionDto`, `FileDto`, `MegaFormFileContent`, `PagedResult<T>` — stable DTOs

## Docs

Full documentation, platform guides, and API reference are published at:

**https://cisssolution.github.io/MegaformDocs/**

The source documentation also lives in the main MegaForm solution under `Docs/docfx/`.

## API stability

`MegaForm.Sdk` is a public contract. Changes are guarded by:

- Roslyn `Microsoft.CodeAnalysis.PublicApiAnalyzers` (RS0016/RS0017 treated as build errors)
- `PublicAPI.Shipped.txt` / `PublicAPI.Unshipped.txt` baselines
- Contract tests in `MegaForm.Sdk.Tests`
- `EnablePackageValidation` across all target frameworks

See [API Stability](https://megaform.github.io/MegaFormSolution/articles/api-stability.html) for
details.

## Repository

https://github.com/megaform/MegaFormSolution
