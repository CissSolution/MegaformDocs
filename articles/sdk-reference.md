# MegaForm SDK Reference

This guide is the **definitive English reference** for `MegaForm.Sdk`. It is kept in sync with the
actual source code in `MegaForm.Sdk/` and the contract tests in `MegaForm.Sdk.Tests`. For
platform-specific wiring see [Oqtane consumer](oqtane-consumer.md) and
[DNN Razor Host](dnn-razor-host.md).

> [!TIP]
> The SDK is a **stable public contract**. The types and methods below are guarded by public-API
> analyzers (`RS0016`/`RS0017` as build errors), contract tests, and package validation. See
> [API Stability](api-stability.md).

## Entry points

There are two ways to obtain a client:

### 1. Dependency injection (recommended for Oqtane / ASP.NET Core)

```csharp
using MegaForm.Sdk;

// Startup / IServerStartup
services.AddMegaFormSdk();

// Anywhere via constructor injection
public class MyService
{
    private readonly IMegaFormClient _mega;
    public MyService(IMegaFormClient mega) => _mega = mega;
}
```

`AddMegaFormSdk()` registers `IMegaFormClient` as a scoped service over whatever
`IFormRepository`, `ISubmissionRepository`, `IFileRepository`, `IStorageService`, and
`SubmissionProcessor` are already in the container.

### 2. Ambient accessor (DNN Razor Host, DDR, legacy `.ascx`)

```csharp
MegaFormSdk.Initialize(serviceProvider);

var forms = await MegaFormSdk.RunAsync(c =>
    c.Forms.ListFormsAsync(
        new FormQuery { Status = "published" },
        new MegaFormScope { PortalId = portalId }));
```

`RunAsync` opens a DI scope, resolves `IMegaFormClient`, executes your delegate, and disposes the
scope. In DNN, `DnnServiceLocator` wires this automatically using
`SingleClientServiceProvider`.

## The client surface

```
IMegaFormClient
 ├─ Forms       : IFormApi        create, read, list, update, delete forms
 ├─ Submissions : ISubmissionApi  query, submit, update, delete submissions
 ├─ Files       : IFileApi        list and download uploaded files
 └─ Schema      : ISchemaApi      parse form schema JSON into typed metadata
```

Every call accepts an optional [`MegaFormScope`](../api/MegaForm.Sdk.MegaFormScope.yml). When
omitted, the SDK uses the host's ambient `IPlatformContext` (current request portal/user). Pass an
explicit scope from background jobs, schedulers, external modules, or anywhere the ambient context
is missing or wrong.

```csharp
var scope = new MegaFormScope
{
    PortalId = 1,   // site / portal
    UserId   = 0    // acting user (0 = anonymous / system)
};
```

If neither a scope nor an ambient `IPlatformContext` is available, the call throws
`InvalidOperationException`.

## Forms API — `IFormApi`

Source reference: [`IFormApi`](../api/MegaForm.Sdk.IFormApi.yml)  
Implementation: `MegaFormClient` maps directly to `IFormRepository`.

### Create a form

```csharp
var form = await client.Forms.CreateFormAsync(new CreateFormRequest
{
    Title       = "Contact Us",
    Description = "General inquiries",
    Status      = "published",
    SchemaJson  = "{\"fields\":[{\"key\":\"name\",\"type\":\"Text\",\"label\":\"Name\"}]}",
    RequireAuth = false
}, scope);

// form.FormId is the newly assigned id.
```

Behavior:
- `Title` is required; passing `null` is treated as `string.Empty`.
- `Status` defaults to `"draft"` when null or whitespace.
- `SchemaJson` defaults to `{"fields":[]}` when null or whitespace.
- `RequireAuth` defaults to `false`.
- The created form's `PortalId` is the resolved portal id from `scope`/`IPlatformContext`.

### List forms

```csharp
var page = await client.Forms.ListFormsAsync(new FormQuery
{
    Status   = "published",   // "draft", "published", or null for all
    Search   = "contact",     // optional title/description search
    Page     = 1,             // 1-based
    PageSize = 20
}, scope);

Console.WriteLine($"Total: {page.TotalCount}, page {page.Page} of {page.PageSize}");
foreach (var f in page.Items)
    Console.WriteLine($"#{f.FormId} {f.Title} ({f.SubmissionCount} submissions)");
```

Notes:
- `TotalCount` currently equals the number of items returned on the page (the underlying
  `ListForms` repository call does not return a separate total).
- Invalid `Page` / `PageSize` are clamped to sensible defaults (`Page = 1`, `PageSize = 20`).

### Get one form

```csharp
FormDto? form = await client.Forms.GetFormAsync(formId: 42, scope);
if (form is null)
{
    // not found, or not owned by the resolved portal
}
```

`GetFormAsync` returns `SubmissionCount` populated from form stats. Cross-portal forms return
`null`.

### Update a form (partial)

Only non-null members of [`UpdateFormRequest`](../api/MegaForm.Sdk.UpdateFormRequest.yml) are
applied.

```csharp
var updated = await client.Forms.UpdateFormAsync(42, new UpdateFormRequest
{
    Title = "Contact Us — Updated"
    // Description, SchemaJson, Status, and RequireAuth remain unchanged
}, scope);
```

- `RequireAuth` is `bool?` so `null` means "no change" and `false` means "set to false".
- Throws `InvalidOperationException` if the form does not exist or belongs to another portal.
- Throws `ArgumentNullException` if `request` is null.

### Delete a form

```csharp
await client.Forms.DeleteFormAsync(42, scope);
```

The delete is a no-op if the form does not exist or belongs to another portal.

## Submissions API — `ISubmissionApi`

Source reference: [`ISubmissionApi`](../api/MegaForm.Sdk.ISubmissionApi.yml)  
Implementation: `MegaFormClient` maps to `ISubmissionRepository` and optionally
`SubmissionProcessor`.

### Query submissions (FindData)

```csharp
var page = await client.Submissions.FindAsync(new SubmissionQuery
{
    FormId   = 42,
    Status   = "new",   // optional status filter; null = all
    Page     = 1,
    PageSize = 50
}, scope);
```

`TotalCount` is the real total across all pages, returned by the repository.

### Get one submission

```csharp
SubmissionDto? sub = await client.Submissions.GetAsync(submissionId: 123, scope);
```

`GetAsync` does not enforce portal ownership; it returns the submission if the id exists.

### Read submitted values

`SubmissionDto.DataJson` is a JSON object keyed by form field key.

```csharp
// .NET 8+ / Oqtane
using var doc = System.Text.Json.JsonDocument.Parse(sub.DataJson ?? "{}");
var name = doc.RootElement.TryGetProperty("full_name", out var v) ? v.GetString() : null;

// .NET Framework / DNN
var o = Newtonsoft.Json.Linq.JObject.Parse(sub.DataJson ?? "{}");
var name2 = (string?)o["full_name"];
```

### Submit data

`SubmitAsync` has two paths depending on whether the host registered `SubmissionProcessor`:

**Full pipeline** (Oqtane/DNN/Web with processor registered): runs the same server-side
validation, anti-spam, notifications, workflow, and indexing as a public JS form submit.

**Fallback** (in-memory tests / lightweight hosts with no processor): resolves the schema and runs
`FormValidationService.Validate`, then inserts. This skips anti-spam, notifications, workflow, and
the Published-status gate.

```csharp
var data = new Dictionary<string, object>
{
    ["full_name"] = "Jane Doe",
    ["email"]     = "jane@example.com",
    ["message"]   = "Hello from the SDK"
};

var result = await client.Submissions.SubmitAsync(formId: 42, data, scope);

if (result.Success)
{
    Console.WriteLine($"Created submission #{result.SubmissionId}");
    Console.WriteLine($"Redirect: {result.RedirectUrl}");
}
else
{
    Console.WriteLine($"Failed: {result.ErrorMessage}");
    foreach (var err in result.ValidationErrors ?? new Dictionary<string, string>())
        Console.WriteLine($"  {err.Key}: {err.Value}");
}
```

`SubmitResult` fields:

| Property | Meaning |
|----------|---------|
| `Success` | `true` when the submission was accepted and persisted |
| `SubmissionId` | New submission id (`0` on failure) |
| `ErrorMessage` | Human-readable failure reason |
| `SuccessMessage` | Configured post-submit message from the form |
| `RedirectUrl` | Configured post-submit redirect URL |
| `IsSpam` / `SpamScore` | Anti-spam outcome (full pipeline only) |
| `ValidationErrors` | Per-field messages on validation failure |

### Update a submission

```csharp
var newData = new Dictionary<string, object>
{
    ["message"] = "Updated message text"
};

await client.Submissions.UpdateAsync(123, newData, scope);
```

- Performs a **full replace** of the stored `DataJson`, not a merge.
- No-op if the submission does not exist or belongs to another portal.
- Throws `ArgumentNullException` if `data` is null.

### Delete a submission

```csharp
await client.Submissions.DeleteAsync(123, scope);
```

No-op if the submission does not exist or belongs to another portal.

## Files API — `IFileApi`

Source reference: [`IFileApi`](../api/MegaForm.Sdk.IFileApi.yml)

### List uploaded files

```csharp
IReadOnlyList<FileDto> files =
    await client.Files.ListForSubmissionAsync(submissionId: 123, scope);

foreach (var f in files)
    Console.WriteLine($"#{f.FileId} {f.FileName} ({f.SizeBytes} bytes) [{f.ContentType}]");
```

[`FileDto`](../api/MegaForm.Sdk.FileDto.yml) is metadata only — no storage path is exposed. If the
host did not register `IFileRepository`, the method returns an empty list (never throws).

### Download a file

```csharp
MegaFormFileContent? file = await client.Files.OpenAsync(
    submissionId: 123, fileId: 5, scope);

if (file is null) return NotFound();

return File(file.Content, file.ContentType, file.FileName);
```

`OpenAsync` returns `null` when:
- the file is missing,
- `IFileRepository` or `IStorageService` is not registered,
- the stored path is empty, or
- the storage service cannot open the path.

> [!IMPORTANT]
> The SDK does not enforce authorization. Always protect your download endpoint with the
> appropriate role or ownership check.

## Schema API — `ISchemaApi`

Source reference: [`ISchemaApi`](../api/MegaForm.Sdk.ISchemaApi.yml)

Parse a form's `SchemaJson` into typed, read-only field metadata. Row and composite layouts are
flattened so the returned field list matches the list the server validates against.

```csharp
var form = await client.Forms.GetFormAsync(42, scope);
var schema = client.Schema.ParseForm(form);

foreach (var field in schema.Fields)
{
    Console.WriteLine($"{field.Key} ({field.Type}) — {field.Label}");
    Console.WriteLine($"  Required: {field.Required}, Input: {field.IsInputField}");

    if (field.Options.Count > 0)
        foreach (var opt in field.Options)
            Console.WriteLine($"    {opt.Value}: {opt.Label}");

    if (field.Validation != null)
        Console.WriteLine($"  Max length: {field.Validation.MaxLength}");
}
```

Behavior:
- `Parse` never throws on malformed JSON — returns an empty schema.
- `ParseForm(form)` throws `ArgumentNullException` if `form` is null.
- Layout/display types (`Html`, `Section`, `Row`, `UniqueId`) have `IsInputField = false`.
- Row columns are expanded into the flat `Fields` list.

Use this to build dynamic renderers, export columns, or validation mirrors without parsing the raw
JSON yourself. See the DNN Razor input-form sample in [DNN Razor Host](dnn-razor-host.md) for a
schema-driven renderer.

## DNN Razor Host samples

Two shipped Razor Host scripts demonstrate the SDK end-to-end without DI:

| Sample | File | What it demonstrates |
|--------|------|----------------------|
| **List view** | `MegaForm.DNN/RazorHostSamples/MegaFormSdkListView.cshtml` | List forms, query submissions, parse `DataJson`, list uploaded files, render download links |
| **Input form** | `MegaForm.DNN/RazorHostSamples/MegaFormSdkInputForm.cshtml` | Use `Schema.ParseForm` to render a form, then `Submissions.SubmitAsync` to post data |

Both samples use the same helper pattern:

```csharp
static T Run<T>(Func<IMegaFormClient, Task<T>> action)
{
    var _ = MegaForm.DNN.Services.DnnServiceLocator.Instance; // wire the SDK
    return Task.Run(() => MegaFormSdk.RunAsync(action)).GetAwaiter().GetResult();
}
```

See [DNN Razor Host](dnn-razor-host.md) for the full setup and walkthrough.

## Paging pattern

Both `ListFormsAsync` and `FindAsync` return [`PagedResult<T>`](../api/MegaForm.Sdk.PagedResult-1.yml):

| Property | Meaning |
|----------|---------|
| `Items` | Items on the current page |
| `TotalCount` | Total items matching the query |
| `Page` | Current page number (1-based) |
| `PageSize` | Requested page size |

```csharp
int pageNo = 1;
while (true)
{
    var page = await client.Submissions.FindAsync(
        new SubmissionQuery { FormId = 42, Page = pageNo, PageSize = 100 }, scope);

    if (page.Items.Count == 0) break;

    Process(page.Items);

    if (pageNo * page.PageSize >= page.TotalCount) break;
    pageNo++;
}
```

## Error and edge-case behavior

| Situation | Behavior |
|-----------|----------|
| Missing form / submission | `GetFormAsync` / `GetAsync` return `null` |
| Missing file | `Files.OpenAsync` returns `null` |
| Wrong portal — delete/update form | No-op |
| Wrong portal — `UpdateFormAsync` | Throws `InvalidOperationException` |
| Wrong portal — update/delete submission | No-op |
| No portal context | `InvalidOperationException` — pass a `MegaFormScope` or host `IPlatformContext` |
| Validation failure | `SubmitResult.Success = false` with `ValidationErrors` |
| Files API not wired | Empty list / `null`; never throws |
| `UpdateFormAsync` null request | Throws `ArgumentNullException` |

## Complete minimal example

```csharp
using MegaForm.Sdk;

public async Task Demo(IMegaFormClient client)
{
    var scope = new MegaFormScope { PortalId = 1 };

    // 1. Create a form
    var form = await client.Forms.CreateFormAsync(new CreateFormRequest
    {
        Title = "Newsletter Signup",
        Status = "published"
    }, scope);

    // 2. Submit data
    var result = await client.Submissions.SubmitAsync(form.FormId,
        new Dictionary<string, object>
        {
            ["email"] = "user@example.com"
        }, scope);

    // 3. Read submissions back
    var page = await client.Submissions.FindAsync(
        new SubmissionQuery { FormId = form.FormId, PageSize = 10 }, scope);

    // 4. Parse the schema
    var schema = client.Schema.ParseForm(form);
    foreach (var f in schema.Fields)
        Console.WriteLine($"Field: {f.Key} ({f.Type})");
}
```

## See also

- [Overview](overview.md) — architecture and object model
- [Installation](installation.md) — register the SDK in your host
- [Quick Start](quickstart.md) — build a list view in ~20 lines
- [Reading Data](reading-data.md) — forms & submissions in depth
- [File Download](file-download.md) — stream uploaded files safely
- [DNN Razor Host](dnn-razor-host.md) — full Razor sample walkthrough
- [API Stability](api-stability.md) — how the contract stays stable
- [API Reference](../api/index.md) — generated reference for every public type
