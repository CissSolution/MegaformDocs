# Push a submission to a CRM, ERP or any REST endpoint

The [Webhook node](integration-webhook.md) sends every submission to one URL, with one payload shape,
with retries, and with no code. When that is the requirement, use it and stop reading.

This page is for the cases it does not cover:

- the payload has to be assembled — a field renamed, a total computed, a lookup value attached
- **which** system gets told depends on the answers: EU orders to one endpoint, US orders to another
- the reply matters, because the order number it returns has to reach the visitor
- the destination speaks something other than the node's JSON body — SOAP, form-encoded, XML

For those, write C#. A script is ordinary C# — `using System.Net.Http;` and a `HttpClient`, the same
code you would write in a module on the same site.

> [!NOTE]
> If you arrived from an older page describing named endpoints and a catalog (`ctx.Api`), that layer
> was removed. Scripts call platform APIs directly now.

---

## 1. Before anything runs: the three gates

1. `<add key="MegaForm:AfterSubmitScriptEnabled" value="true" />` in `web.config` `<appSettings>`.
   Off on every install.
2. A **host (superuser)** account saves the script. A site administrator cannot, and neither can
   module-edit rights.
3. An approval hash over the source. The stored hash must match the source, so a script that arrived
   inside imported data does not run until a host on **that** site approves it.

See [Automation overview](automation-overview.md) for the reasoning.

---

## 2. The stage, and what it costs the visitor

Only **PostCommit** can be configured today. The submission row is already committed when your code
starts, which decides three things:

- **The call cannot refuse the submission.** A 400 from the CRM does not roll anything back.
- **The reply cannot be written back into the submission.** `ctx.SetValue` is refused after the
  commit. Send the value onward instead — §6.
- **The visitor is waiting.** A PostCommit script runs on the request that renders the thank-you
  page. Two seconds of CRM latency is two seconds of spinner.

The script's run timeout defaults to **10 seconds** and is capped at 60. Set the `HttpClient` timeout
*below* it, so a slow endpoint produces your own logged failure rather than the engine's generic
timeout.

---

## 3. A POST, with a timeout, awaiting the token you were given

Script bodies are async and receive a `CancellationToken` named `ct`. Pass it to every await: it is
cancelled when the run timeout expires, which is what stops a hung request from holding the visitor's
thread.

```csharp
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;

var payload = new
{
    email      = ctx.GetString("email"),
    firstName  = ctx.GetString("first_name"),
    lastName   = ctx.GetString("last_name"),
    company    = ctx.GetString("company"),
    source     = "web-form-" + ctx.FormId,
    leadStatus = ctx.GetDecimal("budget") >= 50000m ? "OPEN_DEAL" : "NEW"
};

using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) })
using (var body = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json"))
{
    var reply = await http.PostAsync("https://crm.contoso.com/api/v3/leads", body, ct);
    var text  = await reply.Content.ReadAsStringAsync();

    ctx.Log("crm status=" + (int)reply.StatusCode);

    if (!reply.IsSuccessStatusCode)
        ctx.Log("crm body=" + (text.Length > 400 ? text.Substring(0, 400) : text));
}
```

`Newtonsoft.Json` is referenced by the script compiler, so `JsonConvert` is available without any
setup. So is everything else already loaded in the site's `bin`.

**Verified live**, anonymously, on a DNN 10.3 site: this `HttpClient.PostAsync` returned **HTTP 200**
inside a run that finished in **927 ms** and wrote `crm status=200` into the run record.

### Reusing the client

The snippet above creates a client per submission. At form-submission rates that is fine. On a form
taking sustained traffic, each disposed client leaves a socket in `TIME_WAIT`; hold one static
instance instead by writing the script as a full class:

```csharp
using System.Net.Http;

public sealed class PushLeadToCrm : ISubmissionAsyncScript
{
    static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };

    public async Task RunAsync(SubmissionScriptContext ctx, CancellationToken ct)
    {
        // ... same body, using Http
    }
}
```

A source that declares a type implementing `ISubmissionAsyncScript` is compiled as written. A bare
statement body is spliced into a method, which is why it cannot hold a static field.

---

## 4. Authentication headers

```csharp
using System.Net.Http;
using System.Text;
using DotNetNuke.Entities.Controllers;
using Newtonsoft.Json;

// the token is a host setting, not a literal — §5 explains why
var token = HostController.Instance.GetString("Acme_CrmToken", string.Empty);
var json  = JsonConvert.SerializeObject(new { email = ctx.GetString("email") });

using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) })
using (var request = new HttpRequestMessage(HttpMethod.Post, "https://crm.contoso.com/api/v3/leads"))
{
    request.Headers.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

    // or a vendor-specific key header
    request.Headers.Add("X-Api-Key", token);

    request.Content = new StringContent(json, Encoding.UTF8, "application/json");

    var reply = await http.SendAsync(request, ct);
    ctx.Log("crm status=" + (int)reply.StatusCode);
}
```

Basic auth is the same shape:

```csharp
// continues the example above — inside the same using block, replacing the Bearer line
var user     = HostController.Instance.GetString("Acme_CrmUser", string.Empty);
var password = HostController.Instance.GetString("Acme_CrmPassword", string.Empty);

var pair = Convert.ToBase64String(Encoding.UTF8.GetBytes(user + ":" + password));
request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", pair);
```

---

## 5. Where the credential lives — read this before you paste a token

> [!WARNING]
> A token typed into a script is **stored with the form**. It goes into the form's settings JSON, so
> it travels in every form export, every template, every database backup, and it is readable by
> anyone who can read that record. Rotating it means editing every form that carries it.

Put it in a **host setting** and read it at run time. Host settings are installation-scoped, are not
part of a form, and do not travel with an export.

```csharp
using DotNetNuke.Entities.Controllers;

var token = HostController.Instance.GetString("Acme_CrmToken", string.Empty);

if (string.IsNullOrEmpty(token))
{
    ctx.Log("Acme_CrmToken is not set on this installation — lead not pushed.");
    ctx.Fail("CRM credential missing");
    return;
}
```

There is no dictionary accessor to reach for. A script that reads several settings makes the same
call once per key:

```csharp
using DotNetNuke.Entities.Controllers;

var crmToken = HostController.Instance.GetString("Acme_CrmToken", string.Empty);
var erpToken = HostController.Instance.GetString("Acme_ErpToken", string.Empty);
var crmUrl   = HostController.Instance.GetString("Acme_CrmUrl", "https://crm.contoso.com/api/v3/leads");

ctx.Log("crm url=" + crmUrl + " token=" + (string.IsNullOrEmpty(crmToken) ? "missing" : "present"));
```

For a value you would rather not have sitting in plain text in the host settings table, DNN encrypts
it with the machine key:

```csharp
using DotNetNuke.Entities.Controllers;
using DotNetNuke.Common.Utilities;

var token = HostController.Instance.GetEncryptedString("Acme_CrmToken", Config.GetDecryptionkey());
```

Write the setting once, from a host account — `HostController.Instance.Update(...)` or
`UpdateEncryptedString(...)` — rather than from a submission script.

The point is not that the host settings table is a vault. It is that the credential stops being part
of the form: one place to rotate it, and an exported form is safe to send to a colleague.

> [!IMPORTANT]
> Nothing filters the URL when you call `HttpClient` yourself. The webhook node's outbound guard is
> not in this path. Keep the URL a literal or a host setting; never assemble it from a submitted
> answer, or a public form becomes a request generator aimed at your own network.

---

## 6. When the destination depends on the answers

This is the reason the page exists. The node sends everything to one place; a script chooses.

```csharp
using System.Net.Http;
using System.Text;
using DotNetNuke.Entities.Controllers;
using Newtonsoft.Json;

var region  = ctx.GetString("region");            // "eu" | "us"
var isTrade = ctx.GetBool("trade_account");

var url = isTrade
    ? "https://erp.contoso.com/api/orders"                       // trade orders go to the ERP
    : (region == "eu" ? "https://crm.contoso.com/eu/api/v3/leads"
                      : "https://crm.contoso.com/us/api/v3/leads");

object payload = isTrade
    ? (object)new { account = ctx.GetString("account_code"),
                    total   = ctx.GetDecimal("order_total"),
                    lines   = ctx.GetInt("line_count") }
    : (object)new { email   = ctx.GetString("email"),
                    company = ctx.GetString("company") };

var token = HostController.Instance.GetString(isTrade ? "Acme_ErpToken" : "Acme_CrmToken", string.Empty);

using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) })
using (var request = new HttpRequestMessage(HttpMethod.Post, url))
{
    request.Headers.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
    request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

    var reply = await http.SendAsync(request, ct);
    var text  = await reply.Content.ReadAsStringAsync();

    ctx.Log("crm status=" + (int)reply.StatusCode);

    if (reply.IsSuccessStatusCode)
    {
        var orderNumber = (string)JsonConvert.DeserializeObject<Newtonsoft.Json.Linq.JObject>(text)["orderNumber"];

        ctx.SetVariable("erpOrderNumber", orderNumber);
        ctx.Response.SuccessMessage = "Thank you — your reference is " + orderNumber + ".";
        ctx.Response.RedirectUrl = "/order-confirmed?ref=" + Uri.EscapeDataString(orderNumber);
    }
}
```

`ctx.SetVariable` puts the value on the run record. `ctx.Response.SuccessMessage` and
`RedirectUrl` override the post-submit experience for this submission only.

What you **cannot** do is put the order number back into the stored submission: `ctx.SetValue` is
refused at PostCommit, because a script that believes it rewrote a stored value and did not is a data
bug that surfaces months later in a report. If the number has to be queryable later, write it to a
table you own in the same script — see [Write to your own database](automation-custom-db.md).

---

## 7. Failure, honestly

The row is committed before your code runs, so a dead CRM never loses a submission. It does mean the
script is the only thing that knows the push failed.

```csharp
// continues the example above — http and request are the ones created there,
// and System.Net.Http is already in that fence's usings
try
{
    var reply = await http.SendAsync(request, ct);
    ctx.Log("crm status=" + (int)reply.StatusCode);

    if (!reply.IsSuccessStatusCode)
        ctx.Fail("CRM returned " + (int)reply.StatusCode);
}
catch (TaskCanceledException)
{
    // HttpClient reports its own timeout and a cancelled ct the same way.
    ctx.Log("crm timed out after 8s");
    ctx.Fail("CRM timeout");
}
catch (HttpRequestException ex)
{
    ctx.Log("crm transport failure: " + ex.Message);
    ctx.Fail("CRM unreachable");
}
```

`ctx.Fail` records the run as failed. Whether the visitor sees anything depends on the script's
failure setting: **continue** (the default) shows the normal thank-you, **report** returns the message
to the caller. Neither undoes the submission.

There is **no retry and no queue**. The webhook node retries; a script gets one attempt unless you
loop yourself — and the visitor waits for every attempt you make, inside a 10-second run timeout. If
the destination is unreliable, the durable pattern is: log the failure, write a row into your own
"pending sync" table, and reconcile from a scheduled job. Retrying later from inside the submission
request is not available (that would need the AsyncWorker stage, which cannot be configured today).

> [!NOTE]
> On .NET Framework, a TLS handshake failure against a modern endpoint surfaces as
> `HttpRequestException: The request was aborted: Could not create SSL/TLS secure channel`. Fix that
> at the server — framework/OS TLS configuration — not by setting `ServicePointManager.SecurityProtocol`
> in a script, which mutates process-wide state for every other component on the site.

---

## 8. SOAP, and other content types

There is nothing special about SOAP here. It is a POST with an XML body and a `SOAPAction` header.

```csharp
using System.Net.Http;
using System.Text;

var envelope =
    "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">" +
      "<soap:Body><CreateLead xmlns=\"urn:contoso:crm\">" +
        "<Email>" + System.Security.SecurityElement.Escape(ctx.GetString("email")) + "</Email>" +
        "<Company>" + System.Security.SecurityElement.Escape(ctx.GetString("company")) + "</Company>" +
      "</CreateLead></soap:Body>" +
    "</soap:Envelope>";

using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) })
using (var request = new HttpRequestMessage(HttpMethod.Post, "https://legacy.contoso.com/crm.asmx"))
{
    request.Headers.Add("SOAPAction", "urn:contoso:crm/CreateLead");
    request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");

    var reply = await http.SendAsync(request, ct);
    ctx.Log("soap status=" + (int)reply.StatusCode);
}
```

Escape every submitted value you interpolate into XML. On a public form, treat all of them as
hostile. Form-encoded endpoints are the same pattern with `FormUrlEncodedContent`.

There is no WSDL tooling and no generated proxy: you build the envelope, you read the response.

---

## 9. What this page does not give you

| Wanted | Today |
|---|---|
| Reject the submission when the API says no | Not configurable — needs the PreInsert stage |
| Write the API's answer back into the stored submission | Refused at PostCommit by design (§6) |
| Automatic retry / backoff | Only the [webhook node](integration-webhook.md) has it |
| Hand a slow call to a background worker | AsyncWorker exists in the engine, not configurable |
| Generate a PDF from the reply, move an uploaded file | Not implemented |

> [!IMPORTANT]
> There is an opt-in strict mode that restores an older namespace deny-list. It is off by default; if
> a host has turned it on, `System.Net.Http` is refused at compile time and none of this page applies.

## Related

- [Integration: CRM/ERP over HTTP](integration-webhook.md) — the no-code node, and when it is enough
- [Write to your own database](automation-custom-db.md) — where a returned reference number should land
- [Automation overview](automation-overview.md) — stages, gates, and the run record
- [After Submission](after-submission.md) — the no-code post-submit settings
