# Consumer — DNN Razor Host

DNN does not use Microsoft DI for module code, so the SDK is consumed in one of two ways:

1. **Direct singleton** — `DnnServiceLocator.Instance.Mega` (an `IMegaFormClient`). This is the
   idiomatic DNN pattern and the one the shipped demos use.
2. **Ambient accessor** — `MegaFormSdk.RunAsync(...)`, wired at module startup. Use this if you
   prefer the same call shape as other hosts.

Both read MegaForm data through only `IMegaFormClient`. This page documents the two shipped Razor
Host samples and the DNN download endpoint.

> The source files for the samples live in `MegaForm.DNN/RazorHostSamples/` in the main MegaForm
> solution.

## How the SDK is wired in DNN

`DnnServiceLocator` constructs the client over the DNN repository adapters and wires the ambient
accessor so `MegaFormSdk.RunAsync` works without a real DI container:

```csharp
// From MegaForm.DNN.Services.DnnServiceLocator
var sdkClient = new MegaFormClient(
    FormRepo, SubmissionRepo, null, null, null, SubmissionProcessor);

MegaFormSdk.Initialize(new SingleClientServiceProvider(sdkClient));
```

`SingleClientServiceProvider` is a tiny `IServiceProvider` that serves exactly one service
(`IMegaFormClient`) plus a no-op scope factory, so `MegaFormSdk.RunAsync`'s
`CreateScope()` / `GetRequiredService<IMegaFormClient>()` calls work.

## Razor Host helper pattern

Both samples use the same synchronous wrapper because Razor Host pages are synchronous while the
SDK is async:

```csharp
static T Run<T>(System.Func<IMegaFormClient, System.Threading.Tasks.Task<T>> action)
{
    // Touch the locator once so the ambient SDK accessor is wired.
    var _ = MegaForm.DNN.Services.DnnServiceLocator.Instance;
    return System.Threading.Tasks.Task.Run(() => MegaFormSdk.RunAsync(action)).GetAwaiter().GetResult();
}
```

> The SDK calls are CPU-only (no true awaited I/O), so blocking via `Task.Run` is safe and avoids
> ASP.NET `SynchronizationContext` deadlocks.

## Sample 1 — List view (`MegaFormSdkListView.cshtml`)

Drop `MegaFormSdkListView.cshtml` into the DNN Razor Host scripts folder:

```
<site>\DesktopModules\RazorModules\RazorHost\Scripts\MegaFormSdkListView.cshtml
```

URL: `<razor-host-page>?formId=1` (omit `formId` to use the first form).

### What it does

1. Lists all forms in the portal as clickable pills.
2. Loads submissions for the selected form via `Submissions.FindAsync`.
3. Parses each submission's `DataJson` with `Newtonsoft.Json.Linq.JObject`.
4. Discovers columns dynamically and renders them as a table.
5. Lists uploaded files per submission and renders download links.

### Key SDK calls

```csharp
var forms = Run(c => c.Forms.ListFormsAsync(new FormQuery { PageSize = 100 }, scope)).Items.ToList();

var page = Run(c => c.Submissions.FindAsync(
    new SubmissionQuery { FormId = formId, PageSize = 100 }, scope));

var files = Run(c => c.Files.ListForSubmissionAsync(s.SubmissionId, scope));
```

### Rendered output

A styled table with columns `#`, `Submitted`, `Status`, up to 6 dynamic data columns, and a **Files**
column with `⬇ filename` links pointing at the download endpoint.

## Sample 2 — Input form (`MegaFormSdkInputForm.cshtml`)

Drop `MegaFormSdkInputForm.cshtml` into the same Razor Host scripts folder.

URL: `<razor-host-page>?formId=1` (omit `formId` to use the first published form).

### What it does

1. Picks the first published form (or the form specified by `?formId=`).
2. Parses the form schema with `Schema.ParseForm` to discover input fields.
3. Renders a schema-driven HTML form (`Text`, `Email`, `Select`, `Radio`, `Checkbox`, `Textarea`, …).
4. On POST, collects the values into a `Dictionary<string, object>`.
5. Submits through `Submissions.SubmitAsync` and shows success / validation errors.

### Key SDK calls

```csharp
var forms = Run(c => c.Forms.ListFormsAsync(
    new FormQuery { Status = "published", PageSize = 100 }, scope)).Items.ToList();

var schema = Run<FormSchemaInfo>(c =>
    System.Threading.Tasks.Task.FromResult(c.Schema.ParseForm(currentForm)));

var inputFields = schema.Fields.Where(f => f.IsInputField && !f.Hidden).ToList();

var result = Run(c => c.Submissions.SubmitAsync(formId, data, scope));
```

### Checkbox handling

Multiple checkboxes with the same `name` come back comma-separated. The sample normalizes them to a
`List<string>`:

```csharp
if (field.Type == "Checkbox")
{
    data[key] = raw.Contains(",")
        ? raw.Split(',').Select(x => x.Trim()).Where(x => !string.IsNullOrEmpty(x)).Cast<object>().ToList()
        : (object)raw;
}
```

### Anti-spam helpers

The sample adds the honeypot/timestamp fields that the public renderer uses:

```csharp
data["__mf_hp"] = "";
data["__mf_ts"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
```

### Success / error rendering

After submit, the sample inspects `SubmitResult`:

```csharp
if (submitResult.Success)
{
    // show submission id and SuccessMessage
}
else
{
    // show ErrorMessage and iterate ValidationErrors
}
```

## The download endpoint

A DNN WebAPI controller streams the file through the SDK and is reached by the generic
`{controller}/{action}` route at `/DesktopModules/MegaForm/API/SdkDemo/Download`:

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

## Set up the page (one-time, admin)

1. Add a **Razor Host** module to any page.
2. In the module's menu choose **Edit Script** and select `MegaFormSdkListView.cshtml` or
   `MegaFormSdkInputForm.cshtml`.
3. Browse the page with `?formId=1267` (or any form id that has submissions / is published).

> [!NOTE]
> The required DLLs (`MegaForm.Sdk.dll`, `MegaForm.Core.dll`, `MegaForm.DNN.dll`) ship in the
> site `bin` with the MegaForm install — no extra deployment is needed for the script to run.

## Verified

The DNN SDK path was **live-verified** on a DNN 10 site against form **#1267** (204 submissions):
a sample file was attached via the SDK and downloaded end-to-end through
`IMegaFormClient.Files.OpenAsync` — `HTTP 200`, `text/plain`,
`Content-Disposition: attachment; filename=megaform-sdk-sample.txt`, with the file body
returned byte-for-byte. The `SdkDemo` endpoints are admin-scoped, so unlike DNN's
module-scoped APIs they need no `ModuleId`/`TabId` ServicesFramework headers.
