# MegaForm SDK — Sample: read and display any form's submissions

This sample shows how to **read** the submitted data for a MegaForm form by **id** or by **name**,
and how to display it either as plain text or as an HTML table. It uses only the public
`MegaForm.Sdk` surface (`IMegaFormClient`, `MegaFormScope`, `FormQuery`, `SubmissionQuery`) and
works on every host where the SDK is registered (Oqtane, Umbraco, DNN, Web).

> The SDK is a **read/write data + workflow-inbox** facade. It does not drive the builder, AI,
> payments, reports, or admin configuration. See [`SDK_INDEX.md`](SDK_INDEX.md) for the boundary.

---

## 1. Resolve a form by id or exact title

`Forms.GetFormAsync` is the fastest path when you already know the id. When you only know the
title, search the portal's forms with `Forms.ListFormsAsync` and match on `Title`.

```csharp
using System;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;

public async Task<FormDto?> ResolveFormAsync(
    IMegaFormClient client,
    MegaFormScope scope,
    int? formId = null,
    string? formName = null)
{
    if (formId.HasValue && formId.Value > 0)
        return await client.Forms.GetFormAsync(formId.Value, scope);

    if (!string.IsNullOrWhiteSpace(formName))
    {
        var page = await client.Forms.ListFormsAsync(
            new FormQuery { Search = formName, PageSize = 50 },
            scope);

        return page.Items.FirstOrDefault(f =>
            string.Equals(f.Title, formName, StringComparison.OrdinalIgnoreCase));
    }

    return null;
}
```

Notes:

- `ListFormsAsync` filters by `Status` and `Search` (title/description). The client-side
  `FirstOrDefault` performs the exact title match.
- `GetFormAsync` returns `null` when the form does not exist or is not in the resolved portal.

---

## 2. Read submissions and display them as plain text

Use `Submissions.FindAsync` (the classic FindData surface) or `SubmissionDashboard.SearchAsync`
(for richer filtering). Both return pages of `SubmissionDto` / `SubmissionListItemDto` with a
`DataJson` object keyed by field key.

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using MegaForm.Sdk;

public async Task PrintSubmissionsAsync(
    IMegaFormClient client,
    MegaFormScope scope,
    int? formId = null,
    string? formName = null)
{
    var form = await ResolveFormAsync(client, scope, formId, formName);
    if (form is null)
    {
        Console.WriteLine("Form not found.");
        return;
    }

    // Use the schema to get human-readable labels.
    var schema = client.Schema.ParseForm(form);
    var columns = schema.Fields
        .Where(f => f.IsInputField && !f.Hidden)
        .ToList();

    var page = await client.Submissions.FindAsync(
        new SubmissionQuery { FormId = form.FormId, PageSize = 100 },
        scope);

    Console.WriteLine($"{form.Title} (#{form.FormId}) — {page.TotalCount} submission(s)");
    Console.WriteLine($"Columns: {string.Join(", ", columns.Select(c => c.Label ?? c.Key))}");

    foreach (var submission in page.Items)
    {
        Console.WriteLine($"\n#{submission.SubmissionId} — {submission.SubmittedOnUtc:yyyy-MM-dd HH:mm} — {submission.Status}");
        using var doc = JsonDocument.Parse(submission.DataJson ?? "{}");

        foreach (var column in columns)
        {
            if (doc.RootElement.TryGetProperty(column.Key ?? string.Empty, out var element))
            {
                var value = element.ValueKind == JsonValueKind.String
                    ? element.GetString()
                    : element.GetRawText();
                Console.WriteLine($"  {column.Label ?? column.Key}: {value}");
            }
        }
    }
}
```

Call it either way:

```csharp
await PrintSubmissionsAsync(client, scope, formId: 42);
await PrintSubmissionsAsync(client, scope, formName: "Contact Us");
```

For **DNN / .NET Framework 4.7.2**, replace `System.Text.Json.JsonDocument` with
`Newtonsoft.Json.Linq.JObject.Parse(submission.DataJson ?? "{}")` and read values from the
resulting `JObject`.

---

## 3. Render the same data as an HTML table

This helper builds an HTML table with one column per schema field and one row per submission. It
HTML-encodes every value because `DataJson` contains untrusted user input.

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using MegaForm.Sdk;

public static class MegaFormSubmissionGrid
{
    /// <summary>
    /// Render a form's submissions as an HTML table. Resolve the form by <paramref name="formId"/>
    /// (fastest) or by exact <paramref name="formName"/>.
    /// </summary>
    public static async Task<string> RenderAsync(
        IMegaFormClient client,
        MegaFormScope scope,
        int? formId = null,
        string? formName = null,
        int pageSize = 100)
    {
        FormDto? form = formId.HasValue && formId.Value > 0
            ? await client.Forms.GetFormAsync(formId.Value, scope)
            : (await client.Forms.ListFormsAsync(
                new FormQuery { Search = formName, PageSize = 50 }, scope))
                .Items.FirstOrDefault(f =>
                    string.Equals(f.Title, formName, StringComparison.OrdinalIgnoreCase));

        if (form is null)
            return "<p>Form not found.</p>";

        var columns = client.Schema.ParseForm(form).Fields
            .Where(f => f.IsInputField && !f.Hidden)
            .ToList();

        var page = await client.Submissions.FindAsync(
            new SubmissionQuery { FormId = form.FormId, PageSize = pageSize },
            scope);

        var sb = new StringBuilder();
        sb.Append($"<h3>{Enc(form.Title)} — {page.TotalCount} submission(s)</h3>");
        sb.Append("<table class=\"megaform-grid\"><thead><tr>");
        sb.Append("<th>#</th><th>Submitted</th><th>Status</th>");
        foreach (var col in columns)
            sb.Append($"<th>{Enc(col.Label ?? col.Key)}</th>");
        sb.Append("</tr></thead><tbody>");

        foreach (var submission in page.Items)
        {
            using var doc = JsonDocument.Parse(submission.DataJson ?? "{}");
            sb.Append("<tr>");
            sb.Append($"<td>{submission.SubmissionId}</td>");
            sb.Append($"<td>{submission.SubmittedOnUtc:yyyy-MM-dd HH:mm}</td>");
            sb.Append($"<td>{Enc(submission.Status)}</td>");

            foreach (var col in columns)
            {
                string? cell = doc.RootElement.TryGetProperty(col.Key ?? string.Empty, out var element)
                    ? (element.ValueKind == JsonValueKind.String ? element.GetString() : element.GetRawText())
                    : null;
                sb.Append($"<td>{Enc(cell)}</td>");
            }

            sb.Append("</tr>");
        }

        sb.Append("</tbody></table>");
        return sb.ToString();
    }

    private static string Enc(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);
}
```

Usage from any host:

```csharp
// ASP.NET Core Razor / MVC view (inject IMegaFormClient):
@Html.Raw(await MegaFormSubmissionGrid.RenderAsync(client, scope, formName: "Contact Us"))

// Blazor component:
@((MarkupString)(await MegaFormSubmissionGrid.RenderAsync(Client, scope, formId: 42)))

// DNN Razor Host (no DI — use the ambient accessor):
@Html.Raw(MegaFormSdk.RunAsync(c =>
    MegaFormSubmissionGrid.RenderAsync(c,
        new MegaFormScope { PortalId = portalId },
        formId: 42)).GetAwaiter().GetResult())
```

Style the table with your own CSS (the sample uses `class="megaform-grid"`).

---

## 4. Using the richer dashboard search surface

If you need **search**, **date filtering**, or a **summary text** column, use
`SubmissionDashboard.SearchAsync` instead of `Submissions.FindAsync`:

```csharp
var page = await client.SubmissionDashboard.SearchAsync(
    new SubmissionSearchQuery
    {
        FormId   = form.FormId,
        Status   = null,                       // optional status filter
        Search   = "jane",                     // search summary text / data
        DateFrom = DateTime.UtcNow.AddDays(-30),
        Page     = 1,
        PageSize = 50
    },
    scope);

foreach (var item in page.Items)
    Console.WriteLine($"#{item.SubmissionId}: {item.FormTitle} — {item.Status} — {item.SummaryText}");
```

`SubmissionDashboard.SearchAsync` returns `SubmissionListItemDto`, which also exposes `DataJson`
if you need to render individual values.

---

*Sample verified against `MegaForm.Sdk` source (`IMegaFormClient.cs`, `Dtos.cs`) on 2026-07-19.*
