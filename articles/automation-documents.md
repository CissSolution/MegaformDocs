# Generate a PDF, Word or Excel document

> **Partly available now.** MegaForm already renders a submission to a printable/PDF document with no
> code — §1. Generating a *designed* document from a template inside a script (`ctx.Documents`) is
> **planned**.

Someone finishes a course and should get a certificate with their name on it. An order form should
produce a PDF invoice the customer can download immediately. On DNN this is usually done by dropping
iTextSharp into `/bin` and writing a file path — which works until the next person needs a different
template, or the path turns out to be user-controlled.

---

## 1. What works today

**Per-submission print / PDF.** Every submission has a print view that renders its answers using the
form's own layout and theme, reachable from the submissions grid and from a link you can email. For
"a tidy record of what was submitted", that is the whole feature and it needs no code.

See [Submissions grid](/MegaFormDocsT?doc=dnn-submissions-grid).

**Confirmation content.** The post-submit experience can show a formatted summary with
`{{field:key}}` tokens, which the visitor can print from the browser.

What is missing is a *designed* artefact: a certificate with a border and a signature, an invoice on
company letterhead, a spreadsheet with three sheets.

---

## 2. The planned interface

```csharp
Task<AutomationDocumentResult> CreatePdfAsync(string templateName, object model,
                                              CancellationToken ct = default);
Task<AutomationDocumentResult> CreateFromTemplateAsync(string templateName, string format, object model,
                                                       CancellationToken ct = default);
```

```csharp
// PLANNED
var cert = await ctx.Documents.CreatePdfAsync("course-certificate", new {
    name       = ctx.GetString("full_name"),
    course     = ctx.GetString("course_title"),
    completedOn = ctx.UtcNow,
    reference  = "CERT-" + ctx.SubmissionId
});

ctx.SetVariable("certificateUrl", cert.DownloadUrl);
ctx.Response.SuccessMessage = "Congratulations — your certificate is ready.";
ctx.Response.CustomData["downloadUrl"] = cert.DownloadUrl;
```

`AutomationDocumentResult` returns `FileName`, `DownloadUrl` and `SizeBytes`.

---

## 3. Three deliberate constraints

**A template name, not a document builder.** The layout is a registered template maintained by
whoever owns the branding. A script supplies the model. Change the certificate design and no script
changes.

**The script does not choose the path.** `CreatePdfAsync` returns a `DownloadUrl` — a tokenised link
to secure storage — not a filesystem path. Compare the usual DNN recipe:

```csharp
// The pattern this capability exists to replace:
var path = HostingEnvironment.MapPath("~/Portals/0/Certificates/") + fullName + "_Cert.pdf";
```

`fullName` comes from a public form. A name containing `..\` writes outside the folder; a name
containing `.aspx` writes something the server will execute. Both are one submitted string away, and
neither is obvious while writing the line.

**`System.IO` stays closed**, so the pattern above does not compile. That is the point: the capability
is not a convenience wrapper, it is the reason the dangerous version is unavailable.

---

## 4. Where this should run

Document generation is slow — hundreds of milliseconds for a simple PDF, seconds for a large
spreadsheet — and it happens after the submission is safe.

Put it on **AsyncWorker** (planned) rather than PostCommit, and tell the visitor it is coming:

```csharp
// PLANNED
ctx.Response.SuccessMessage = "Thanks — your certificate will arrive by email shortly.";
```

If the customer must have it on the thank-you page, PostCommit works, and the cost is that every
submission waits for the renderer.

---

## 5. Until it ships

- **Print view** for a record of the answers — no code.
- **A named endpoint to a document service** works today, and keeps the guard and the audit trail:

```csharp
// Works today.
var doc = ctx.Api.PostJsonAsync("doc-service-certificate", new {
    name = ctx.GetString("full_name"),
    course = ctx.GetString("course_title"),
    reference = "CERT-" + ctx.SubmissionId
}).Result;

if (doc.Ok)
{
    var url = (string)Newtonsoft.Json.Linq.JObject.Parse(doc.Body)["url"];
    ctx.SetVariable("certificateUrl", url);
    ctx.Response.SuccessMessage = "Your certificate is ready.";
    ctx.Response.CustomData["downloadUrl"] = url;
}
else
{
    ctx.Log("Document service returned " + doc.Status + "; the nightly job will retry.");
}
```

The service holds the renderer and the template. The script holds neither, which is where this ends
up anyway.

## Related

- [Move an uploaded file into a secure folder](automation-file-routing.md)
- [Submissions grid](/MegaFormDocsT?doc=dnn-submissions-grid)
- [Automation overview](automation-overview.md)
