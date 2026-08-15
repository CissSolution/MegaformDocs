# Quick Start

This builds the scenario shown on the home page: read a form's submissions through the SDK and
render them as a list — in about 20 lines.

## The goal

## Step 1 — get a client + a scope

```csharp
IMegaFormClient client = /* injected, or MegaFormSdk via RunAsync */;
var scope = new MegaFormScope { PortalId = 1 };   // your portal/site id
```

## Step 2 — list forms

```csharp
var forms = await client.Forms.ListFormsAsync(new FormQuery { PageSize = 50 }, scope);
foreach (var f in forms.Items)
    Console.WriteLine($"#{f.FormId}  {f.Title}  ({f.SubmissionCount} submissions)");
```

## Step 3 — read submissions for one form

```csharp
var page = await client.Submissions.FindAsync(
    new SubmissionQuery { FormId = 1, PageSize = 100 }, scope);

Console.WriteLine($"{page.TotalCount} submissions");
foreach (var s in page.Items)
    Console.WriteLine($"#{s.SubmissionId}  {s.SubmittedOnUtc:yyyy-MM-dd}  {s.Status}");
```

## Step 4 — parse the submitted values

`SubmissionDto.DataJson` is a JSON object of `fieldKey → value`:

```csharp
using System.Text.Json;

using var doc = JsonDocument.Parse(s.DataJson ?? "{}");
foreach (var prop in doc.RootElement.EnumerateObject())
    Console.WriteLine($"  {prop.Name} = {prop.Value}");
```

> On classic DNN (net472) use `Newtonsoft.Json.Linq.JObject.Parse(...)` instead of
> `System.Text.Json`.

## Step 5 — list & link uploaded files

```csharp
var files = await client.Files.ListForSubmissionAsync(s.SubmissionId, scope);
foreach (var file in files)
    Console.WriteLine($"  ⬇ {file.FileName} ({file.SizeBytes} bytes)");
```

To actually stream a file to the browser, see [File Download](file-download.md).

## Full minimal example

```csharp
var scope = new MegaFormScope { PortalId = 1 };
var page  = await client.Submissions.FindAsync(
    new SubmissionQuery { FormId = 1, PageSize = 100 }, scope);

var sb = new StringBuilder("<table><tr><th>#</th><th>Submitted</th><th>Files</th></tr>");
foreach (var s in page.Items)
{
    var files = await client.Files.ListForSubmissionAsync(s.SubmissionId, scope);
    var links = string.Join(" ", files.Select(f =>
        $"<a href=\"/download?submissionId={s.SubmissionId}&fileId={f.FileId}\">⬇ {f.FileName}</a>"));
    sb.Append($"<tr><td>{s.SubmissionId}</td><td>{s.SubmittedOnUtc:yyyy-MM-dd}</td><td>{links}</td></tr>");
}
sb.Append("</table>");
```

## Sample: load a form by id or name and print its data

This sample finds a form (by id if you know it, or by name if you only have the title), reads its
schema, then prints every submission with the field values you care about.

```csharp
using System;
using System.Text.Json;
using MegaForm.Sdk;

public async Task RenderFormDataAsync(IMegaFormClient client, MegaFormScope scope,
    int? formId = null, string? formName = null)
{
    // 1. Resolve the form.
    FormDto? form = null;

    if (formId.HasValue)
    {
        form = await client.Forms.GetFormAsync(formId.Value, scope);
    }
    else if (!string.IsNullOrWhiteSpace(formName))
    {
        var forms = await client.Forms.ListFormsAsync(
            new FormQuery { Search = formName, PageSize = 20 }, scope);
        form = forms.Items.FirstOrDefault(f =>
            string.Equals(f.Title, formName, StringComparison.OrdinalIgnoreCase));
    }

    if (form is null)
    {
        Console.WriteLine("Form not found.");
        return;
    }

    Console.WriteLine($"Form: #{form.FormId} {form.Title}");
    Console.WriteLine($"Submissions: {form.SubmissionCount}");

    // 2. Parse the schema so we know which fields exist and how to label them.
    var schema = client.Schema.ParseForm(form);
    var inputFields = schema.Fields.Where(f => f.IsInputField && !f.Hidden).ToList();

    Console.WriteLine($"Fields: {string.Join(", ", inputFields.Select(f => f.Key))}");

    // 3. Read the submissions.
    var page = await client.Submissions.FindAsync(
        new SubmissionQuery { FormId = form.FormId, PageSize = 100 }, scope);

    Console.WriteLine($"Loaded {page.Items.Count} of {page.TotalCount} submissions\n");

    // 4. Print each row.
    foreach (var submission in page.Items)
    {
        Console.WriteLine($"Submission #{submission.SubmissionId} — {submission.SubmittedOnUtc:yyyy-MM-dd HH:mm} — {submission.Status}");

        using var doc = JsonDocument.Parse(submission.DataJson ?? "{}");
        foreach (var field in inputFields)
        {
            if (doc.RootElement.TryGetProperty(field.Key ?? string.Empty, out var element))
            {
                var value = element.ValueKind == JsonValueKind.String
                    ? element.GetString()
                    : element.GetRawText();
                Console.WriteLine($"  {field.Label ?? field.Key}: {value}");
            }
        }
        Console.WriteLine();
    }
}
```

Usage:

```csharp
// By form id
await RenderFormDataAsync(client, scope, formId: 42);

// By form name
await RenderFormDataAsync(client, scope, formName: "Contact Us");
```

Key points:

- **Form id** is the fastest path — `GetFormAsync` returns the form directly.
- **Form name** is useful when the id is not hard-coded. `ListFormsAsync` with `Search` filters by
  title/description, then the sample picks the first exact title match.
- `Schema.ParseForm` gives you field labels, types, and which fields are inputs, so you can render
  columns dynamically instead of guessing keys from `DataJson`.
- `DataJson` is a JSON object keyed by `field.Key`. The sample handles both string and non-string
  values; on DNN (net472) replace `System.Text.Json` with `Newtonsoft.Json.Linq.JObject`.

Next: see the platform-specific consumers — [Oqtane](oqtane-consumer.md) and
[DNN Razor Host](dnn-razor-host.md).
