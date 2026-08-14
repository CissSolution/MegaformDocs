# Push a submission to a CRM, ERP or any REST/SOAP API

> **Available now.** Verified on a live DNN site: a named endpoint returned HTTP 200 in 743 ms with
> its bearer token attached server-side, and a catalog entry pointing at loopback was still refused
> by the outbound guard.

The [Webhook / API service task](integration-webhook.md) node sends every submission to one endpoint,
with retries and auth, and no code. Use it when that is the whole requirement.

This page is for the rest: when the payload has to be assembled from a lookup, when *which* system
gets told depends on the answers, or when the reply decides what happens next.

---

## 1. Register the endpoint

```jsonc
{
  "endpoints": [
    {
      "name": "hubspot-lead",
      "url": "https://api.hubapi.com/crm/v3/objects/contacts",
      "method": "POST",
      "headers": { "Content-Type": "application/json" },
      "authType": "bearer",
      "authValue": "pat-na1-…",
      "timeoutSeconds": 20,
      "maxAttempts": 3,
      "retryDelaySeconds": 2
    },
    {
      "name": "erp-create-order",
      "url": "https://erp.internal.example.com/api/orders",
      "method": "POST",
      "authType": "header",
      "authHeaderName": "X-Api-Key",
      "authValue": "…"
    }
  ]
}
```

The token lives here, server-side, and is attached to the request on the way out. It is masked as
`***` whenever the catalog is read back into a browser, and it is **not reachable from a script** —
`ctx.Api` exposes names and results, never the endpoint definition. So a script that syncs to
HubSpot can be exported, reviewed and pasted into a support ticket without leaking anything.

`authType` accepts `none`, `bearer`, `basic` and `header`.

---

## 2. The script

```csharp
var payload = new {
    properties = new {
        email     = ctx.GetString("email"),
        firstname = ctx.GetString("first_name"),
        lastname  = ctx.GetString("last_name"),
        company   = ctx.GetString("company"),
        hs_lead_status = ctx.GetDecimal("budget") >= 50000 ? "OPEN_DEAL" : "NEW"
    }
};

var reply = ctx.Api.PostJsonAsync("hubspot-lead", payload).Result;

if (reply.Ok)
{
    ctx.SetVariable("crmStatus", reply.Status);
    ctx.Log("HubSpot accepted the contact in " + reply.DurationMs + "ms");
}
else
{
    // The submission is already saved. Record the problem; do not lose the lead.
    ctx.Log("HubSpot returned " + reply.Status + " — the nightly reconciliation will pick this up.");
    ctx.SetVariable("crmSyncPending", true);
}
```

`AutomationHttpResult` gives you `Status`, `Ok`, `Body`, `Error`, `DurationMs` and `Attempts`.
`Error` is set only when no HTTP response was obtained at all — blocked URL, DNS failure, timeout —
so `Status == 0` and `Error != null` mean *the request never left*, which is a different problem from
a 500.

---

## 3. Reading the reply

```csharp
var reply = ctx.Api.PostJsonAsync("erp-create-order", new {
    customer = ctx.GetString("email"),
    total    = ctx.GetDecimal("order_total")
}).Result;

if (reply.Ok)
{
    // Newtonsoft.Json is available to scripts.
    var json = Newtonsoft.Json.Linq.JObject.Parse(reply.Body);
    var orderNumber = (string)json["orderNumber"];

    ctx.SetVariable("erpOrderNumber", orderNumber);
    ctx.Response.SuccessMessage = "Thank you — your order number is " + orderNumber + ".";
    ctx.Response.RedirectUrl = "/order-confirmed?ref=" + orderNumber;
}
```

Response bodies are capped at 256 KB. A script is not a download client.

---

## 4. SOAP and other content types

```csharp
var envelope =
    "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">" +
      "<soap:Body><CreateLead xmlns=\"urn:legacy\">" +
        "<Email>" + System.Security.SecurityElement.Escape(ctx.GetString("email")) + "</Email>" +
      "</CreateLead></soap:Body>" +
    "</soap:Envelope>";

var reply = ctx.Api.SendAsync("legacy-soap", envelope, "text/xml",
    new Dictionary<string, string> { { "SOAPAction", "urn:legacy/CreateLead" } }).Result;
```

`SendAsync` takes the body, the content type and any extra headers. The method, URL, auth, timeout
and retry policy still come from the catalog.

> Escape values you interpolate into XML. `System.Xml` is not available to scripts, so build the
> envelope as a string — and treat every submitted value as hostile, because on a public form it is.

---

## 5. Retries

`maxAttempts` and `retryDelaySeconds` belong to the endpoint, not the script, so a change of policy
does not mean editing anybody's code.

A 4xx is **not** retried: the request was understood and rejected, and repeating it repeats the
rejection. 5xx and transport failures are. `reply.Attempts` reports how many it took.

---

## 6. The outbound guard applies to catalog entries too

Every resolved URL passes the same guard the Webhook node uses. An administrator can type a loopback
or private address into the catalog; it is still refused:

```
endpoint 'internal-only' blocked: URL targets a blocked (private/loopback/metadata) address
```

That is not distrust of the administrator. It is that the failure being prevented — a public form
turned into a request generator aimed at the server's own network — does not care who configured the
target. Reaching an on-premises system is a server-level networking decision: give it a hostname the
web server resolves to a routable address.

---

## 7. Which stage

| Want | Stage |
|---|---|
| Tell another system it happened | **PostCommit** |
| Let the API's answer decide whether to accept the submission | **PreInsert** — see [real-time pricing](automation-realtime-pricing.md) |
| A slow third party you should not make the visitor wait for | **AsyncWorker** |

A call at PostCommit is on the visitor's thank-you page. Two seconds of CRM latency is two seconds
of spinner.

---

## 8. What the run record shows

```
endpoint 'hubspot-lead'   → 200 in 743ms
endpoint 'erp-create-order' → 502 in 1240ms (3 attempts)
```

Query strings are trimmed from the recorded URL so a credential passed that way does not end up in
the audit trail — though the catalog is the right place for a credential, not a query string.

## Related

- [Push submissions to a CRM or ERP over HTTP](integration-webhook.md) — the no-code node
- [Four fields → BPMN → an API service task](integration-bpmn-api-task.md)
- [Automation overview](automation-overview.md)
