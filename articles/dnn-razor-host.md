# Consumer — DNN Razor Host

DNN does not use Microsoft DI for module code, so the SDK is consumed in one of two ways:

1. **Direct singleton** — `DnnServiceLocator.Instance.Mega` (an `IMegaFormClient`). This is the
   idiomatic DNN pattern and the one the shipped demo uses.
2. **Ambient accessor** — `MegaFormSdk.RunAsync(...)`, wired at module startup. Use this if you
   prefer the same call shape as other hosts.

Both read MegaForm data through only `IMegaFormClient`. The shipped sample renders a list view
with file-download links from a Razor Host `.cshtml` script.

## How the SDK is wired in DNN

`DnnServiceLocator` constructs the client over the DNN repository adapters + a disk-backed
storage service rooted at the same `~/App_Data/MegaForm/PrivateUploads` folder the upload
pipeline writes to:

```csharp
FileRepo = new DnnFileRepository();
Storage  = new DnnDiskStorageService();
Mega     = new MegaForm.Sdk.MegaFormClient(FormRepo, SubmissionRepo, null, FileRepo, Storage);

// optional ambient accessor (no-DI) — guarded so it can never break the locator:
try { MegaForm.Sdk.MegaFormSdk.Initialize(new SingleClientServiceProvider(Mega)); } catch { }
```

`SingleClientServiceProvider` is a tiny `IServiceProvider` that serves exactly one service
(`IMegaFormClient`) plus a no-op scope factory, so `MegaFormSdk.RunAsync` works without a real
container.

## The Razor Host script

Drop `MegaFormSdkListView.cshtml` (shipped under `MegaForm.DNN/RazorHostSamples/`) into the
Razor Host scripts folder:

```
<site>\DesktopModules\RazorModules\RazorHost\Scripts\MegaFormSdkListView.cshtml
```

The script (abridged) — note it uses **Newtonsoft.Json** because classic DNN (net472) has no
`System.Text.Json`, and it blocks on the async SDK via `Task.Run(...).GetAwaiter().GetResult()`
since Razor Host pages are synchronous:

```cshtml
@using System.Linq
@using MegaForm.Sdk
@using Newtonsoft.Json.Linq

@functions {
    static T Run<T>(System.Func<IMegaFormClient, System.Threading.Tasks.Task<T>> action)
    {
        var _ = MegaForm.DNN.Services.DnnServiceLocator.Instance; // ensure wired
        return System.Threading.Tasks.Task
            .Run(() => MegaFormSdk.RunAsync(action)).GetAwaiter().GetResult();
    }
}

@{
    var portalId = DotNetNuke.Entities.Portals.PortalSettings.Current.PortalId;
    var scope    = new MegaFormScope { PortalId = portalId };

    var forms = Run(c => c.Forms.ListFormsAsync(new FormQuery { PageSize = 100 }, scope)).Items.ToList();

    int formId = 0; int.TryParse(Request.QueryString["formId"], out formId);
    if (formId <= 0 && forms.Count > 0) formId = forms[0].FormId;

    var page = Run(c => c.Submissions.FindAsync(
        new SubmissionQuery { FormId = formId, PageSize = 100 }, scope));
}

<table>
  @foreach (var s in page.Items)
  {
      var files = Run(c => c.Files.ListForSubmissionAsync(s.SubmissionId, scope));
      <tr>
        <td>@s.SubmissionId</td>
        <td>@s.SubmittedOnUtc.ToString("yyyy-MM-dd HH:mm")</td>
        <td>
          @foreach (var f in files)
          {
            <a href="/DesktopModules/MegaForm/API/SdkDemo/Download?submissionId=@s.SubmissionId&fileId=@f.FileId">⬇ @f.FileName</a>
          }
        </td>
      </tr>
  }
</table>
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
2. In the module's menu choose **Edit Script** and select `MegaFormSdkListView.cshtml`.
3. Browse the page with `?formId=1267` (or any form id that has submissions).

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
