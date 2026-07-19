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
`IFormRepository`, `ISubmissionRepository`, `IFileRepository`, `IStorageService`,
`SubmissionProcessor`, `WorkflowTaskService`, and `IWorkflowRepository` are already in the
container. The dashboard, submission-dashboard, and inbox surfaces light up automatically when
the host registers the corresponding Core workflow services.

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
 ├─ Forms              : IFormApi               create, read, list, update, delete forms
 ├─ Submissions        : ISubmissionApi         query, submit, update, delete submissions
 ├─ Dashboard          : IDashboardApi          per-form counts and recent-submission totals
 ├─ SubmissionDashboard: ISubmissionDashboardApi rich search, detail, and status operations
 ├─ Inbox              : IInboxApi              human-task inbox (claim, approve, reject, forward)
 ├─ Files              : IFileApi               list and download uploaded files
 └─ Schema             : ISchemaApi             parse form schema JSON into typed metadata
```

Every call accepts an optional [`MegaFormScope`](../api/MegaForm.Sdk.MegaFormScope.yml). When
omitted, the SDK uses the host's ambient `IPlatformContext` (current request portal/user). Pass an
explicit scope from background jobs, schedulers, external modules, or anywhere the ambient context
is missing or wrong.

```csharp
var scope = new MegaFormScope
{
    PortalId        = 1,                       // site / portal (required when no ambient context)
    UserId          = 0,                       // acting user (0 = anonymous / system)
    UserName        = "jane.doe",              // used by workflow inbox matching
    DisplayName     = "Jane Doe",              // shown in audit / inbox UIs
    UserEmail       = "jane@example.com",      // used by workflow notifications
    IsAuthenticated = true,
    IsAdmin         = false,
    IsSuperUser     = false,
    Roles           = new List<string> { "Managers", "Finance" },
    IpAddress       = "198.51.100.10"
};
```

If neither a scope nor an ambient `IPlatformContext` is available, the call throws
`InvalidOperationException`. DNN does not register an `IPlatformContext`, so DNN callers must always
pass an explicit scope.

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

## Dashboard API — `IDashboardApi`

Source reference: [`IDashboardApi`](../api/MegaForm.Sdk.IDashboardApi.yml)

The dashboard surface is for hosts that want to build a **custom summary screen** without writing
raw SQL. It returns per-form totals plus a recent-submission window.

```csharp
var overview = await client.Dashboard.GetOverviewAsync(new DashboardQuery
{
    Days     = 30,     // recent-submission window
    MaxForms = 250,    // cap the number of form rows
    Status   = null,   // optional "published"/"draft" filter
    Search   = null    // optional title/description search
}, scope);

Console.WriteLine($"Portal {overview.PortalId}: {overview.TotalForms} forms," +
                  $" {overview.TotalSubmissions} total submissions," +
                  $" {overview.RecentSubmissions} in the last {overview.Days} days");

foreach (var row in overview.Forms)
{
    Console.WriteLine($"#{row.FormId} {row.Title}: " +
                      $"{row.SubmissionCount} total, {row.RecentSubmissionCount} recent");
}
```

Behavior:
- `Days` defaults to `30` and is clamped to a maximum of `365`.
- `MaxForms` defaults to `250` and is clamped to a maximum of `1000`.
- `RecentSubmissionCount` counts submissions with `SubmittedOnUtc >= UtcNow.Date - (Days - 1)`.
- Results are scoped to the resolved portal; cross-portal forms are excluded.

Use this API for **high-level KPI widgets** (form count, submission count, recent activity). For
searchable grids or per-submission detail, use `ISubmissionDashboardApi` instead.

## Submission Dashboard API — `ISubmissionDashboardApi`

Source reference: [`ISubmissionDashboardApi`](../api/MegaForm.Sdk.ISubmissionDashboardApi.yml)

This is the richer, dashboard-oriented alternative to the legacy `ISubmissionApi.FindAsync`.
It returns dashboard-friendly list rows, full detail payloads, and exposes a status update
operation.

### Search submissions

```csharp
var page = await client.SubmissionDashboard.SearchAsync(new SubmissionSearchQuery
{
    FormId   = 42,
    Status   = "new",
    Search   = "jane",           // searches summary text / data
    DateFrom = DateTime.UtcNow.AddDays(-30),
    DateTo   = null,
    Page     = 1,
    PageSize = 50                // clamped to 250
}, scope);

foreach (var item in page.Items)
{
    Console.WriteLine($"#{item.SubmissionId} {item.FormTitle} — {item.Status} — {item.SummaryText}");
}
```

Notes:
- If `FormId` is `0`, results are filtered to forms owned by the resolved portal.
- `TotalCount` is accurate for a specific `FormId`; when listing across all portal forms it equals
the number of returned items on the current page.
- `SpamScore` is returned as a nullable decimal.

### Load submission detail

```csharp
SubmissionDetailDto? detail = await client.SubmissionDashboard.GetDetailAsync(123, scope);
if (detail is null) return;

Console.WriteLine($"Form: {detail.Form?.Title}");
Console.WriteLine($"Submitted: {detail.Submission?.SubmittedOnUtc}");

foreach (var value in detail.Values)
    Console.WriteLine($"  {value.Key}: {value.Value}");

if (detail.Workflow.HasWorkflow)
{
    Console.WriteLine($"Workflow active task: {detail.Workflow.ActiveNodeLabel}");
    Console.WriteLine($"Open tasks: {detail.Workflow.OpenTaskCount}/{detail.Workflow.TaskCount}");
}
```

`SubmissionDetailDto` includes:
- `Submission` and `Form` metadata.
- `Schema` parsed from the form.
- `Values` — flattened key/value pairs ready for display.
- `FieldSnapshots` — values captured at submit time (preserves labels even when the schema later
  changes).
- `Files` — uploaded files metadata.
- `Workflow` — workflow summary when a workflow service is registered.

### Update submission status

```csharp
await client.SubmissionDashboard.UpdateStatusAsync(123, "reviewed", scope);
```

Throws `ArgumentException` when `status` is empty. No-op if the submission does not exist or
belongs to another portal.

## Inbox API — `IInboxApi`

Source reference: [`IInboxApi`](../api/MegaForm.Sdk.IInboxApi.yml)

The inbox surface lets you build a **custom My Inbox UI** or server-side workflow integration. It
operates on human tasks created by the MegaForm workflow engine or by ad-hoc review requests.

> [!IMPORTANT]
> `IInboxApi` requires `WorkflowTaskService` to be registered in the host. If it is missing, every
> call throws `InvalidOperationException`.

### My workboard

```csharp
var board = await client.Inbox.GetMyInboxAsync(new InboxQuery { RecentCompleted = 25 }, scope);

Console.WriteLine($"Actor: {board.User.DisplayName} (admin={board.User.IsAdmin})");
Console.WriteLine($"Incoming: {board.Kpis.Incoming}, In progress: {board.Kpis.InProgress}, " +
                  $"Completed: {board.Kpis.Completed}, Overdue: {board.Kpis.Overdue}");

foreach (var task in board.Incoming)
    Console.WriteLine($"[INCOMING] {task.TaskId} {task.NodeLabel} — {task.Status}");
```

The actor is resolved from the `MegaFormScope` / `IPlatformContext`. Make sure `UserName` and
`Roles` are populated when the task is routed by role queue.

### Load one task

```csharp
InboxTaskResultDto result = await client.Inbox.GetTaskAsync("TASK-123", scope);
Console.WriteLine($"Task: {result.Task?.NodeLabel}, Status: {result.Task?.Status}");
foreach (var action in result.Actions)
    Console.WriteLine($"  {action.ActionType} by {action.ActorDisplayName} at {action.CreatedAtUtc}");
```

### Task actions

```csharp
// Claim an open task
var claimed = await client.Inbox.ClaimAsync(new InboxTaskActionRequest
{
    TaskId  = "TASK-123",
    Comment = "I'll handle this one"
}, scope);

// Approve / reject
var approved = await client.Inbox.ApproveAsync(new InboxTaskActionRequest
{
    TaskId  = "TASK-123",
    Comment = "Approved after verification"
}, scope);

var rejected = await client.Inbox.RejectAsync(new InboxTaskActionRequest
{
    TaskId  = "TASK-123",
    Comment = "Missing required documents"
}, scope);

// Forward to another user
var forwarded = await client.Inbox.ForwardAsync(new InboxTaskActionRequest
{
    TaskId     = "TASK-123",
    TargetUser = "manager",
    Comment    = "Please review the budget line"
}, scope);

// Comment without changing state
var commented = await client.Inbox.CommentAsync(new InboxTaskActionRequest
{
    TaskId  = "TASK-123",
    Comment = "Reached out to the customer"
}, scope);
```

`ApproveAsync` and `RejectAsync` accept optional `Data` for workflow variables:

```csharp
var approved = await client.Inbox.ApproveAsync(new InboxTaskActionRequest
{
    TaskId  = "TASK-123",
    Comment = "Approved",
    Data    = new Dictionary<string, object> { ["approvedAmount"] = 1500 }
}, scope);
```

### Attach a file to a task

```csharp
using var stream = System.IO.File.OpenRead("approval.pdf");
var attach = await client.Inbox.AttachFileAsync(new InboxFileAttachmentRequest
{
    TaskId      = "TASK-123",
    FieldKey    = "approval_document",
    FileName    = "approval.pdf",
    ContentType = "application/pdf",
    Content     = stream,
    SizeBytes   = stream.Length
}, scope);

if (attach.Success)
    Console.WriteLine($"Attached #{attach.File?.FileId}");
```

The file is saved against the task's linked submission. The host must register both
`IFileRepository` and `IStorageService`.

### Ad-hoc review task

Send an existing submission to a user's inbox without a prebuilt workflow:

```csharp
var sent = await client.Inbox.SendSubmissionAsync(new SendSubmissionToInboxRequest
{
    FormId       = 42,
    SubmissionId = 123,
    TargetUser   = "manager",
    Title        = "Please review this expense",
    Comment      = "Urgent approval needed"
}, scope);
```

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

`ListFormsAsync`, `FindAsync`, and `SubmissionDashboard.SearchAsync` return
[`PagedResult<T>`](../api/MegaForm.Sdk.PagedResult-1.yml):

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
| Inbox API not wired | Throws `InvalidOperationException` |

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

## Sample: load a form by id or name and render its data

This sample resolves a form by id (fastest) or by exact title, then prints a simple table of its
submissions. It uses the schema to discover display labels, so the output stays readable even when
the `DataJson` keys are machine names like `email_address`.

```csharp
using System;
using System.Linq;
using System.Text.Json;
using MegaForm.Sdk;

public async Task PrintFormDataAsync(IMegaFormClient client, MegaFormScope scope,
    int? formId = null, string? formName = null)
{
    // Resolve by id, or search by name.
    FormDto? form = formId.HasValue
        ? await client.Forms.GetFormAsync(formId.Value, scope)
        : (await client.Forms.ListFormsAsync(
            new FormQuery { Search = formName, PageSize = 20 }, scope))
            .Items.FirstOrDefault(f =>
                string.Equals(f.Title, formName, StringComparison.OrdinalIgnoreCase));

    if (form is null)
    {
        Console.WriteLine("Form not found.");
        return;
    }

    var schema = client.Schema.ParseForm(form);
    var fields = schema.Fields.Where(f => f.IsInputField && !f.Hidden).ToList();

    var page = await client.Submissions.FindAsync(
        new SubmissionQuery { FormId = form.FormId, PageSize = 100 }, scope);

    Console.WriteLine($"{form.Title} (#{form.FormId}) — {page.TotalCount} submissions");
    Console.WriteLine($"Columns: {string.Join(", ", fields.Select(f => f.Label ?? f.Key))}");

    foreach (var submission in page.Items)
    {
        Console.WriteLine($"\n#{submission.SubmissionId} — {submission.SubmittedOnUtc:yyyy-MM-dd HH:mm} — {submission.Status}");
        using var doc = JsonDocument.Parse(submission.DataJson ?? "{}");
        foreach (var field in fields)
        {
            if (doc.RootElement.TryGetProperty(field.Key ?? string.Empty, out var element))
            {
                var value = element.ValueKind == JsonValueKind.String
                    ? element.GetString()
                    : element.GetRawText();
                Console.WriteLine($"  {field.Label ?? field.Key}: {value}");
            }
        }
    }
}
```

Call it either way:

```csharp
await PrintFormDataAsync(client, scope, formId: 42);
await PrintFormDataAsync(client, scope, formName: "Contact Us");
```

On DNN (net472) replace `System.Text.Json.JsonDocument` with `Newtonsoft.Json.Linq.JObject`.

## Sample: render a form's data as a grid (HTML table)

This sample turns any form's submissions into a **grid view**: one column per input field, one
row per submission. Column headers come from the schema labels, and every cell value is
HTML-encoded (submission data is untrusted user input). The helper returns an HTML string, so it
drops into an ASP.NET Core Razor page/view, a Blazor component (`MarkupString`), an MVC view, or a
DNN Razor Host script unchanged.

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using MegaForm.Sdk;

public static class MegaFormGrid
{
    /// <summary>
    /// Render a form's submissions as an HTML table. Resolve the form by <paramref name="formId"/>
    /// (fastest) or by exact <paramref name="formName"/>.
    /// </summary>
    public static async Task<string> RenderGridAsync(
        IMegaFormClient client, MegaFormScope scope,
        int? formId = null, string? formName = null, int pageSize = 100)
    {
        // 1. Resolve the form by id, or search by exact title.
        FormDto? form = formId.HasValue
            ? await client.Forms.GetFormAsync(formId.Value, scope)
            : (await client.Forms.ListFormsAsync(
                new FormQuery { Search = formName, PageSize = 20 }, scope))
                .Items.FirstOrDefault(f =>
                    string.Equals(f.Title, formName, StringComparison.OrdinalIgnoreCase));

        if (form is null)
            return "<p>Form not found.</p>";

        // 2. Columns = the schema's input fields (layout/hidden fields are skipped).
        var columns = client.Schema.ParseForm(form).Fields
            .Where(f => f.IsInputField && !f.Hidden)
            .ToList();

        // 3. Rows = submissions for this form.
        var page = await client.Submissions.FindAsync(
            new SubmissionQuery { FormId = form.FormId, PageSize = pageSize }, scope);

        // 4. Build the table. Enc() HTML-encodes EVERY value — DataJson is user input.
        var sb = new StringBuilder();
        sb.Append($"<h3>{Enc(form.Title)} — {page.TotalCount} submission(s)</h3>");
        sb.Append("<table class=\"mf-grid\"><thead><tr>");
        sb.Append("<th>#</th><th>Submitted</th><th>Status</th>");
        foreach (var col in columns)
            sb.Append($"<th>{Enc(col.Label ?? col.Key)}</th>");
        sb.Append("</tr></thead><tbody>");

        foreach (var s in page.Items)
        {
            using var doc = JsonDocument.Parse(s.DataJson ?? "{}");
            sb.Append("<tr>");
            sb.Append($"<td>{s.SubmissionId}</td>");
            sb.Append($"<td>{s.SubmittedOnUtc:yyyy-MM-dd HH:mm}</td>");
            sb.Append($"<td>{Enc(s.Status)}</td>");
            foreach (var col in columns)
            {
                string? cell = doc.RootElement.TryGetProperty(col.Key ?? string.Empty, out var el)
                    ? (el.ValueKind == JsonValueKind.String ? el.GetString() : el.GetRawText())
                    : null;
                sb.Append($"<td>{Enc(cell)}</td>");
            }
            sb.Append("</tr>");
        }

        sb.Append("</tbody></table>");
        return sb.ToString();
    }

    // WebUtility.HtmlEncode exists on both .NET (Oqtane/Web) and .NET Framework 4.7.2 (DNN).
    private static string Enc(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);
}
```

Use it from the host of your choice:

```csharp
// ASP.NET Core Razor page / MVC view (inject IMegaFormClient):
@Html.Raw(await MegaFormGrid.RenderGridAsync(client, scope, formName: "Contact Us"))

// Blazor component:
@((MarkupString)(await MegaFormGrid.RenderGridAsync(Client, scope, formId: 42)))

// DNN Razor Host (no DI — use the ambient accessor):
@Html.Raw(MegaFormSdk.RunAsync(c =>
    MegaFormGrid.RenderGridAsync(c, new MegaFormScope { PortalId = portalId }, formId: 42))
    .GetAwaiter().GetResult())
```

Style the table with your own CSS (the sample tags it `class="mf-grid"`). For a larger grid with
server-side filtering, sorting, and file-download links wired end-to-end, see the shipped
`MegaFormSdkListView.cshtml` walkthrough in [DNN Razor Host](dnn-razor-host.md).

On DNN (net472) replace `System.Text.Json.JsonDocument` with `Newtonsoft.Json.Linq.JObject` (see
the note under the previous sample).

## Sample: read the "Country" form submissions

This sample finds a form by title, reads its submissions using both the legacy and the new
dashboard search surface, and prints each row's country value.

```csharp
public async Task ReadCountryFormAsync(IMegaFormClient client)
{
    var scope = new MegaFormScope { PortalId = 1 };

    // 1. Find the "Country" form.
    var forms = await client.Forms.ListFormsAsync(
        new FormQuery { Search = "Country", PageSize = 10 }, scope);

    var countryForm = forms.Items.FirstOrDefault(f =>
        string.Equals(f.Title, "Country", StringComparison.OrdinalIgnoreCase));

    if (countryForm is null)
    {
        Console.WriteLine("Country form not found.");
        return;
    }

    Console.WriteLine($"Form: #{countryForm.FormId} {countryForm.Title}");

    // 2. Legacy query surface ( SubmissionApi.FindAsync ).
    var legacyPage = await client.Submissions.FindAsync(new SubmissionQuery
    {
        FormId   = countryForm.FormId,
        Page     = 1,
        PageSize = 100
    }, scope);

    foreach (var sub in legacyPage.Items)
    {
        using var doc = System.Text.Json.JsonDocument.Parse(sub.DataJson ?? "{}");
        var country = doc.RootElement.TryGetProperty("country", out var c)
            ? c.GetString()
            : null;
        Console.WriteLine($"  #{sub.SubmissionId}: country={country}, status={sub.Status}");
    }

    // 3. New dashboard search surface with richer filtering.
    var searchPage = await client.SubmissionDashboard.SearchAsync(new SubmissionSearchQuery
    {
        FormId   = countryForm.FormId,
        Status   = null,
        Search   = null,
        DateFrom = DateTime.UtcNow.AddDays(-30),
        Page     = 1,
        PageSize = 100
    }, scope);

    foreach (var item in searchPage.Items)
    {
        Console.WriteLine($"  [dashboard] #{item.SubmissionId}: {item.SummaryText}");
    }
}
```

## Sample: a simple inbox for one user

This sample shows how to render a minimal "My Inbox" for a known user. The actor is resolved from
the explicit `MegaFormScope`, so it works from a console job, a scheduler, or an ASP.NET Core
controller.

```csharp
public async Task SimpleInboxForUserAsync(IMegaFormClient client, string userName)
{
    var scope = new MegaFormScope
    {
        PortalId        = 1,
        UserId          = 42,
        UserName        = userName,
        DisplayName     = "Jane Manager",
        IsAuthenticated = true,
        Roles           = new List<string> { "Managers", "Finance" }
    };

    // 1. Load the workboard.
    var board = await client.Inbox.GetMyInboxAsync(
        new InboxQuery { RecentCompleted = 10 }, scope);

    Console.WriteLine($"Inbox for {board.User.DisplayName}");
    Console.WriteLine($"Incoming: {board.Kpis.Incoming}, " +
                      $"In progress: {board.Kpis.InProgress}, " +
                      $"Completed: {board.Kpis.Completed}");

    // 2. Claim the first available incoming task.
    var firstOpen = board.Incoming.FirstOrDefault(t => t.AllowClaim);
    if (firstOpen is not null)
    {
        var claimed = await client.Inbox.ClaimAsync(new InboxTaskActionRequest
        {
            TaskId  = firstOpen.TaskId!,
            Comment = "Starting review"
        }, scope);

        if (claimed.Success)
            Console.WriteLine($"Claimed {claimed.Task?.TaskId}");
    }

    // 3. Approve a claimed task.
    var myTask = board.InProgress.FirstOrDefault(t =>
        t.AssignedUserName == userName && t.Status == "Claimed");

    if (myTask is not null)
    {
        var approved = await client.Inbox.ApproveAsync(new InboxTaskActionRequest
        {
            TaskId  = myTask.TaskId!,
            Comment = "Approved from the simple inbox sample"
        }, scope);

        Console.WriteLine($"Approve result: {approved.Success}");
    }
}
```

## Sample: custom dashboard developed by the host

This sample builds a small custom dashboard controller/page. It combines `Dashboard.GetOverviewAsync`
for KPIs and `SubmissionDashboard.SearchAsync` for a searchable recent-submissions grid. Host
developers can adapt this to Razor Pages, Blazor, MVC, or a DNN Razor Host script.

```csharp
using MegaForm.Sdk;

public class MyCustomDashboard
{
    private readonly IMegaFormClient _client;
    public MyCustomDashboard(IMegaFormClient client) => _client = client;

    public async Task<DashboardViewModel> BuildAsync(int portalId, int? formId = null)
    {
        var scope = new MegaFormScope { PortalId = portalId };

        // 1. KPIs and per-form summary from the dashboard API.
        var overview = await _client.Dashboard.GetOverviewAsync(
            new DashboardQuery { Days = 30, MaxForms = 50 }, scope);

        // 2. Recent submissions grid from the submission dashboard API.
        var recent = await _client.SubmissionDashboard.SearchAsync(
            new SubmissionSearchQuery
            {
                FormId   = formId ?? 0,
                DateFrom = DateTime.UtcNow.AddDays(-7),
                Page     = 1,
                PageSize = 20
            }, scope);

        // 3. Load details for the first row to show a preview.
        SubmissionDetailDto? preview = null;
        if (recent.Items.FirstOrDefault() is { } first)
            preview = await _client.SubmissionDashboard.GetDetailAsync(
                first.SubmissionId, scope);

        return new DashboardViewModel
        {
            PortalId            = overview.PortalId,
            TotalForms          = overview.TotalForms,
            TotalSubmissions    = overview.TotalSubmissions,
            RecentSubmissions   = overview.RecentSubmissions,
            FormSummaries       = overview.Forms,
            RecentSubmissionsGrid = recent.Items,
            PreviewSubmission   = preview
        };
    }
}

public class DashboardViewModel
{
    public int PortalId { get; set; }
    public int TotalForms { get; set; }
    public int TotalSubmissions { get; set; }
    public int RecentSubmissions { get; set; }
    public IReadOnlyList<DashboardFormSummaryDto> FormSummaries { get; set; }
        = Array.Empty<DashboardFormSummaryDto>();
    public IReadOnlyList<SubmissionListItemDto> RecentSubmissionsGrid { get; set; }
        = Array.Empty<SubmissionListItemDto>();
    public SubmissionDetailDto? PreviewSubmission { get; set; }
}
```

A minimal ASP.NET Core MVC controller that renders the view:

```csharp
public class DashboardController : Controller
{
    private readonly IMegaFormClient _client;
    public DashboardController(IMegaFormClient client) => _client = client;

    public async Task<IActionResult> Index(int? formId)
    {
        // In production, resolve the portal from the current site context.
        var dashboard = new MyCustomDashboard(_client);
        var model = await dashboard.BuildAsync(portalId: 1, formId);
        return View(model);
    }
}
```

The same pattern works in Oqtane (inject `IMegaFormClient` into a Razor component), DNN (use
`MegaFormSdk.RunAsync`), or Umbraco (inject `IMegaFormClient` into a SurfaceController or view
component).

## See also

- [Overview](overview.md) — architecture and object model
- [Installation](installation.md) — register the SDK in your host
- [Quick Start](quickstart.md) — build a list view in ~20 lines
- [Reading Data](reading-data.md) — forms & submissions in depth
- [File Download](file-download.md) — stream uploaded files safely
- [DNN Razor Host](dnn-razor-host.md) — full Razor sample walkthrough
- [API Stability](api-stability.md) — how the contract stays stable
- [API Reference](../api/index.md) — generated reference for every public type
