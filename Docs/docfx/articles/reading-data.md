# Reading Data

This guide covers the `Forms` and `Submissions` APIs: querying, paging, filtering, and scope.

## Scope: which portal, which user

Every method accepts an optional [`MegaFormScope`](../api/MegaForm.Sdk.MegaFormScope.yml):

```csharp
var scope = new MegaFormScope
{
    PortalId = 1,   // the site/portal to read from
    UserId   = 0    // acting user (0 = anonymous/system)
};
```

- **Inside a MegaForm request** you can usually omit it — the ambient platform context supplies
  the current portal.
- **Outside a request** (a scheduled job, a different module, a CLI) you **must** pass it, or the
  call cannot know which tenant to read.

## Listing forms

[`IFormApi.ListFormsAsync`](../api/MegaForm.Sdk.IFormApi.yml) returns a paged result:

```csharp
var result = await client.Forms.ListFormsAsync(new FormQuery
{
    Status   = "published",   // or "draft"; null = all
    Search   = "contact",     // optional title/description search
    Page     = 1,
    PageSize = 20
}, scope);

Console.WriteLine($"{result.TotalCount} forms total, showing page {result.Page}");
foreach (var form in result.Items)
{
    // form.FormId, form.Title, form.Status, form.SchemaJson,
    // form.RequireAuth, form.SubmissionCount
}
```

### Get one form

```csharp
FormDto? form = await client.Forms.GetFormAsync(formId: 1, scope);
if (form is null) { /* not found, or not in this portal */ }
```

`form.SchemaJson` is the field/layout definition as JSON — parse it if you need to render field
labels or types.

## Querying submissions (FindData)

[`ISubmissionApi.FindAsync`](../api/MegaForm.Sdk.ISubmissionApi.yml) is the SDK's *FindData*:

```csharp
var page = await client.Submissions.FindAsync(new SubmissionQuery
{
    FormId   = 1,
    Status   = null,   // optional status filter; null = all
    Page     = 1,
    PageSize = 50
}, scope);

foreach (var s in page.Items)
{
    // s.SubmissionId, s.FormId, s.Status, s.IsSpam, s.UserId,
    // s.SubmittedOnUtc, s.DataJson
}
```

### Reading submitted values

`DataJson` is a JSON object keyed by form field key:

```csharp
// .NET (net8+/Oqtane):
using var doc = System.Text.Json.JsonDocument.Parse(s.DataJson ?? "{}");
var name = doc.RootElement.TryGetProperty("full_name", out var v) ? v.GetString() : null;

// classic DNN (net472):
var o = Newtonsoft.Json.Linq.JObject.Parse(s.DataJson ?? "{}");
var name2 = (string?)o["full_name"];
```

> [!TIP]
> To build a table of columns dynamically, union the property names across the page's items —
> different submissions may carry different optional fields.

### Get one submission

```csharp
SubmissionDto? sub = await client.Submissions.GetAsync(submissionId: 10, scope);
```

## Paging pattern

```csharp
int pageNo = 1;
while (true)
{
    var page = await client.Submissions.FindAsync(
        new SubmissionQuery { FormId = 1, Page = pageNo, PageSize = 100 }, scope);
    if (page.Items.Count == 0) break;
    Process(page.Items);
    if (pageNo * page.PageSize >= page.TotalCount) break;
    pageNo++;
}
```

Next: [download the files](file-download.md) attached to those submissions.
