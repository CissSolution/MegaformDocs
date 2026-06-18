# Razor Host Examples

This page explains the two shipped DNN Razor Host samples that use the MegaForm SDK. These
samples live in `MegaForm.DNN/RazorHostSamples/` in the main MegaForm solution.

## Quick links

| Example | File | What it does |
|---------|------|--------------|
| **List View** | `MegaFormSdkListView.cshtml` | Show a form's submissions in a table with file-download links. |
| **Input Form** | `MegaFormSdkInputForm.cshtml` | Render a form from its schema and submit data through the SDK. |

## Setup (same for both examples)

1. Copy the `.cshtml` file into your DNN Razor Host scripts folder:

   ```
   <site>\DesktopModules\RazorModules\RazorHost\Scripts\
   ```

2. Add a **Razor Host** module to any DNN page.
3. Open the module menu → **Edit Script** → choose the `.cshtml` file.
4. Browse the page with `?formId=1` (or any valid form id).

> Required DLLs (`MegaForm.Sdk.dll`, `MegaForm.Core.dll`, `MegaForm.DNN.dll`) already ship in the
> site `bin` with MegaForm. No extra deployment is needed.

## Shared helper

Razor Host pages are synchronous, but the SDK is async. Both samples use the same wrapper:

```csharp
static T Run<T>(System.Func<IMegaFormClient, System.Threading.Tasks.Task<T>> action)
{
    // Touch the DNN service locator once so MegaFormSdk.RunAsync is wired.
    var _ = MegaForm.DNN.Services.DnnServiceLocator.Instance;
    return System.Threading.Tasks.Task.Run(() => MegaFormSdk.RunAsync(action)).GetAwaiter().GetResult();
}
```

`MegaFormSdk.RunAsync` opens a scope, resolves `IMegaFormClient`, runs your code, and disposes the
scope.

## Example 1 — List View

File: `MegaFormSdkListView.cshtml`

URL: `<page>?formId=1`

### What it shows

- Pills of all forms in the portal.
- A table of submissions for the selected form.
- Dynamic columns parsed from `SubmissionDto.DataJson`.
- Download links for files attached to each submission.

### Core SDK calls

```csharp
var scope = new MegaFormScope { PortalId = portalId };

// 1. List forms
var forms = Run(c => c.Forms.ListFormsAsync(new FormQuery { PageSize = 100 }, scope)).Items.ToList();

// 2. Load submissions
var page = Run(c => c.Submissions.FindAsync(
    new SubmissionQuery { FormId = formId, PageSize = 100 }, scope));

// 3. List files for a submission
var files = Run(c => c.Files.ListForSubmissionAsync(s.SubmissionId, scope));
```

### Parsing DataJson

```csharp
static Dictionary<string, string> ParseData(string json)
{
    var d = new Dictionary<string, string>();
    if (string.IsNullOrWhiteSpace(json)) return d;
    try
    {
        var o = Newtonsoft.Json.Linq.JObject.Parse(json);
        foreach (var p in o.Properties())
            d[p.Name] = p.Value?.ToString() ?? "";
    }
    catch { }
    return d;
}
```

### File download link

```html
<a href="/DesktopModules/MegaForm/API/SdkDemo/Download?submissionId=@s.SubmissionId&fileId=@file.FileId">
  ⬇ @file.FileName
</a>
```

You also need the DNN WebAPI download endpoint shown later on this page.

## Example 2 — Input Form

File: `MegaFormSdkInputForm.cshtml`

URL: `<page>?formId=1`

### What it shows

- Picks the first published form (or the form from `?formId=`).
- Parses the form schema with `Schema.ParseForm`.
- Renders HTML inputs for each visible input field.
- Submits the collected values and shows success or validation errors.

### Core SDK calls

```csharp
var scope = new MegaFormScope { PortalId = portalId };

// 1. List published forms
var forms = Run(c => c.Forms.ListFormsAsync(
    new FormQuery { Status = "published", PageSize = 100 }, scope)).Items.ToList();

// 2. Parse schema into typed fields
var schema = Run<FormSchemaInfo>(c =>
    System.Threading.Tasks.Task.FromResult(c.Schema.ParseForm(currentForm)));

// 3. Render only visible input fields
var inputFields = schema.Fields.Where(f => f.IsInputField && !f.Hidden).ToList();

// 4. Submit on POST
var result = Run(c => c.Submissions.SubmitAsync(formId, data, scope));
```

### Build the data dictionary

```csharp
var data = new Dictionary<string, object>();
foreach (var field in inputFields)
{
    var key = field.Key;
    if (string.IsNullOrWhiteSpace(key)) continue;

    var raw = Request.Form[key];
    if (field.Type == "Checkbox")
    {
        data[key] = raw.Contains(",")
            ? raw.Split(',').Select(x => x.Trim()).Where(x => !string.IsNullOrEmpty(x)).Cast<object>().ToList()
            : (object)raw;
    }
    else
    {
        data[key] = raw;
    }
}

// Anti-spam helpers expected by the public renderer
data["__mf_hp"] = "";
data["__mf_ts"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
```

### Show the result

```csharp
if (submitResult.Success)
{
    // Show submitResult.SubmissionId and submitResult.SuccessMessage
}
else
{
    // Show submitResult.ErrorMessage
    // Loop submitResult.ValidationErrors for per-field messages
}
```

## Download endpoint

The list-view sample links files to this DNN WebAPI action:

```csharp
[DnnAuthorize(StaticRoles = "Administrators")]
public class SdkDemoController : DnnApiController
{
    [HttpGet]
    [ActionName("Download")]
    public async Task<HttpResponseMessage> Download(int submissionId, int fileId)
    {
        var scope   = new MegaFormScope { PortalId = PortalSettings.PortalId };
        var content = await DnnServiceLocator.Instance.Mega.Files
            .OpenAsync(submissionId, fileId, scope);
        if (content is null) return Request.CreateResponse(HttpStatusCode.NotFound);

        var resp = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(content.Content)
        };
        resp.Content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue(content.ContentType);
        resp.Content.Headers.ContentDisposition =
            new System.Net.Http.Headers.ContentDispositionHeaderValue("attachment")
            { FileName = content.FileName };
        return resp;
    }
}
```

> Always authorize your download endpoint. The SDK streams whatever file id you ask for.

## See also

- [SDK Reference](sdk-reference.md) — full API reference
- [DNN Razor Host consumer guide](dnn-razor-host.md) — deeper DNN wiring explanation
- [File Download](file-download.md) — more on the file-download pattern
