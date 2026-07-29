# MegaForm.Sdk

A thin, stable, host-agnostic SDK for the MegaForm engine. Use it to create forms, list forms,
query submissions, and download uploaded files from your own code — without touching MegaForm's
internal repositories, EF models, or rendering pipeline.

## Install

```xml
<ItemGroup>
  <PackageReference Include="MegaForm.Sdk" Version="1.0.0" />
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

`IMegaFormClient` is the single entry point. All calls accept an optional `MegaFormScope` for explicit portal/user context (required on DNN, optional everywhere else when inside a request).

- **Forms** — `IFormApi`: `CreateFormAsync`, `GetFormAsync`, `ListFormsAsync`, `UpdateFormAsync`, `DeleteFormAsync`
- **Submissions** — `ISubmissionApi`: `FindAsync`, `GetAsync`, `SubmitAsync`, `UpdateAsync`, `DeleteAsync`
- **Dashboard** — `IDashboardApi`: per-form KPIs and recent-submission totals (`GetOverviewAsync`)
- **Submission Dashboard** — `ISubmissionDashboardApi`: rich search, detail, and status operations (`SearchAsync`, `GetDetailAsync`, `UpdateStatusAsync`)
- **Inbox** — `IInboxApi`: human-task workflow operations (`GetMyInboxAsync`, `GetTaskAsync`, `ClaimAsync`, `ApproveAsync`, `RejectAsync`, `ForwardAsync`, `CommentAsync`, `AttachFileAsync`, `SendSubmissionAsync`)
- **Files** — `IFileApi`: list uploaded files and download bytes (`ListForSubmissionAsync`, `OpenAsync`)
- **Gallery** — `IGalleryApi`: project image-bearing typed records and optional MegaForm-managed image files into reusable gallery items (`QueryGalleryAsync`)
- **Schema** — `ISchemaApi`: parse form schema JSON into typed field metadata (`Parse`, `ParseForm`)

Application-oriented consumers also have four first-class facades:

- **Apps**: `IAppApi.GetAsync`
- **Queries**: `IAppQueryApi.ExecuteAsync` for bounded named queries
- **Records**: `IAppRecordApi.GetRecordAsync` and `PatchRecordAsync` over canonical typed values
- **Workflows**: an application-friendly alias of the complete Inbox workflow contract

### Typed gallery example

```csharp
var gallery = await mega.Gallery.QueryGalleryAsync(
    new GalleryQueryRequest
    {
        AppKey = "blog-starter",
        QueryKey = "all-posts",
        Query = new AppQueryRequest { Page = 1, PageSize = 50 },
        ImageFieldKeys = new List<string>
        {
            "featured_image_url",
            "author_avatar_url"
        },
        TitleFieldKey = "title",
        AltTextFieldKey = "image_alt_text",
        IncludeUploadedImages = true
    },
    new MegaFormScope { PortalId = portalId });
```

The result contains browser-safe URLs only. Uploaded-file items use the configured
`IStorageService` URL and never reveal a storage path. Field mapping is caller-controlled, so the
same API supports posts, authors, products, portfolios, or any other image-bearing form.

### What the SDK does not cover

The SDK is intentionally a **stable typed data + workflow-inbox facade**. It can consume
configured apps and their named queries, but it does **not** expose app-definition authoring,
builder/designer APIs, AI form design, payments, reports, external-table administration, module
configuration, file uploads, or user/permission management. For those features, use native
MegaForm UI or the platform-specific MegaForm HTTP endpoints. Full reference and samples are in
`Docs/docfx/articles/sdk-reference.md`.

## Docs

- **Full API reference and samples:** [`Docs/docfx/articles/sdk-reference.md`](Docs/docfx/articles/sdk-reference.md)
- **Read/display form data by id or name:** [`Docs/SDK_SAMPLE_READ_FORM_DATA.md`](Docs/SDK_SAMPLE_READ_FORM_DATA.md)
- **Published site:** https://cisssolution.github.io/MegaformDocs/

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
