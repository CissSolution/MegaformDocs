# Notifications: send a message the answers decide

Most of this needs no code. The workflow **Email** node sends mail when a form is submitted, holds
its own subject and body with `{{field:key}}` tokens, and a **Condition** node in front of two Email
nodes covers branching:

```
Form submitted → Condition (total > 5000) ─ yes → Email "Director approval"
                                           └ no  → Email "Team lead approval"
```

Build that first. It is configuration, it survives an export, and nobody has to enable scripting for
it.

This page is for the case the node cannot express: when **the decision is the hard part** — the
recipient has to be looked up, the subject changes shape on a value, one message goes to the
regional queue and a copy goes to whoever owns that account. Then you write the decision in C# and
send with DNN's own mail API.

> [!NOTE]
> An earlier version of this page described a `ctx.Notify` capability with a template catalog. That
> was removed. A script is ordinary C# now and calls platform APIs directly.

---

## 1. Sending: `Mail.SendEmail`

```csharp
// shape only — `from`, `to`, `subject` and `body` come from the sections below
using DotNetNuke.Services.Mail;

Mail.SendEmail(from, to, subject, body);
```

That is the same code path DNN uses for its own password-reset and notification mail, so it reads
the same SMTP configuration — host, port, credentials, SSL — that an administrator already set under
**Settings → Servers → SMTP Server** (with a site-level override on the DNN versions that offer
one). There is no second place to configure mail for MegaForm, and no SMTP password in a script.

On this DNN version `SendEmail` returns nothing. There is no status string to test, so do not write
code that reads one — the call either completes or it throws. If the page needs a failure path, put
the call in a `try`/`catch` and fail the run on the exception:

```csharp
using DotNetNuke.Services.Mail;

var to      = "sales@contoso.com";
var from    = "no-reply@contoso.com";
var subject = "Enquiry " + ctx.SubmissionId;
var body    = "<p>See the submission for details.</p>";

try
{
    Mail.SendEmail(from, to, subject, body);
    ctx.Log("mail handed to DNN's sender for " + to);
}
catch (Exception ex)
{
    ctx.Log("mail failed for " + to + ": " + ex.Message);
    ctx.Fail("Notification not sent");
}
```

Handing the message to DNN's sender is the boundary the script can see. What happens after that —
whether SMTP accepted it, whether the recipient's server took it — is not observable from here.

For cc, bcc, reply-to, an explicit body format or attachments, `Mail.SendMail` carries longer
overloads. Those signatures have changed across DNN versions, so read the one your site's
`DotNetNuke.dll` actually exposes rather than copying a signature from anywhere — including this
page. If all you need is a copy to a manager, the reliable version is a second `SendEmail` call: one
message per recipient, one log line per recipient, and no guessing about how a given DNN build
splits a recipient list.

> [!WARNING]
> A PostCommit script runs inside the submission request. SMTP is the slowest thing on this page —
> an unreachable mail host does not fail fast, it hangs until the connection times out, and the
> visitor sits on the form waiting for the thank-you message. Keep it to a couple of sends. If a
> notification has to fan out to twenty people, write one row to your own table and let a scheduled
> job drain it.

---

## 2. The from-address: ask the portal

Do not hard-code a sender. Read the portal's own address:

```csharp
using DotNetNuke.Entities.Portals;

var portal = PortalController.Instance.GetPortal(ctx.PortalId);
var from   = portal.Email;
```

Two reasons this matters more than it looks. On a multi-portal install the same form template can be
running on three sites, and `ctx.PortalId` is the only thing that knows which one just submitted.
And mail sent from an address on a domain whose SPF and DMARC records do not cover your server gets
filed as spam or rejected outright — the portal address is the one the administrator already
aligned.

---

## 3. Building the body, and encoding what came from the submitter

Every value you interpolate into an HTML body arrived from a stranger over the internet. Encode it.

```csharp
using System;
using System.Net;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Services.Mail;

Func<string, string> h = s => WebUtility.HtmlEncode(s ?? "");

var name    = ctx.GetString("full_name", "");
var company = ctx.GetString("company", "");
var message = ctx.GetString("message", "");
var total   = ctx.GetDecimal("total_amount", 0m);

var body =
    "<p><strong>" + h(name) + "</strong> (" + h(company) + ") submitted "
  + ctx.FormTitle + " #" + ctx.SubmissionId + ".</p>"
  + "<p>Value: " + total.ToString("N2") + "</p>"
  + "<blockquote>" + h(message) + "</blockquote>"
  + "<p>Received " + ctx.UtcNow.ToString("u") + " from " + h(ctx.IpAddress) + "</p>";
```

`total` is a `decimal` — it came out of `GetDecimal`, it cannot carry markup, so it does not need
encoding. Everything that is still a string does.

What goes wrong without it is not theoretical. A company name of `Smith & Sons` renders as garbage
in some clients and correctly in others, which is the confusing case. A message body containing
`<div style="display:none">` swallows the rest of your email. And an alert that lands in a
colleague's inbox, from your site, carrying an attacker's markup, is a phishing email you sent
yourself — the reader trusts it precisely because it came from the form they were expecting.

The subject needs different treatment. A carriage return or line feed in a subject is a header
injection attempt, and it belongs on one line anyway:

```csharp
// continues the example above — `company` is the value read there
var safeCompany = company.Replace("\r", " ").Replace("\n", " ").Trim();
if (safeCompany.Length > 60) safeCompany = safeCompany.Substring(0, 60);

var subject = "New enquiry from " + safeCompany;
```

---

## 4. The decision: route, escalate, copy

This is the whole point of doing it in code. Region picks the queue, the value escalates, and a
manager gets a copy when the account is one we care about.

```csharp
using System;
using System.Net;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Services.Mail;

Func<string, string> h = s => WebUtility.HtmlEncode(s ?? "");

var portal = PortalController.Instance.GetPortal(ctx.PortalId);
var from   = portal.Email;

var region = ctx.GetString("region", "").Trim().ToUpperInvariant();
var total  = ctx.GetDecimal("total_amount", 0m);
var name   = ctx.GetString("full_name", "");

// 1. route
string to;
if (region == "EMEA")      to = "emea.sales@contoso.com";
else if (region == "APAC") to = "apac.sales@contoso.com";
else if (region == "AMER") to = "amer.sales@contoso.com";
else
{
    to = "sales@contoso.com";
    ctx.Log("unmapped region '" + region + "' — sent to the central queue");
}

// 2. escalate
var urgent  = total >= 25000m;
var subject = (urgent ? "[Escalation] " : "") + "Enquiry " + ctx.SubmissionId
            + " — " + total.ToString("N0");

var body = "<p>" + h(name) + " — " + h(region) + " — " + total.ToString("N2") + "</p>"
         + "<blockquote>" + h(ctx.GetString("message", "")) + "</blockquote>";

try
{
    Mail.SendEmail(from, to, subject, body);
    ctx.Log("primary=" + to + " urgent=" + urgent + " handed to DNN's sender");
}
catch (Exception ex)
{
    ctx.Log("primary=" + to + " FAILED: " + ex.Message);
    ctx.Fail("Primary notification not sent");
    return;
}

// 3. copy the manager, as a separate message
if (urgent)
{
    try
    {
        Mail.SendEmail(from, "sales.director@contoso.com", subject, body);
        ctx.Log("manager copy handed to DNN's sender");
    }
    catch (Exception ex)
    {
        ctx.Log("manager copy FAILED: " + ex.Message);
    }
}

ctx.SetVariable("notifiedQueue", to);
```

`ctx.Log` lines land in the run record, in order, with the run's duration. That is what answers
*"was the director told about #4187"* three weeks later, so log the address you actually used, not
the branch you think you took.

`ctx.SetVariable` puts a value on the run record too. Use it when a later reader — a workflow node,
a report — needs to know which way the decision went.

> [!NOTE]
> `ctx.Fail` records the run as failed. It does not undo the submission: at PostCommit the row is
> already committed and the visitor already has their thank-you message. Refusing a submission needs
> PreInsert, which is not configurable today. A failed notification is a failed notification, not a
> lost enquiry — and the run record is where you find it.

---

## 5. When the recipient has to be looked up

The address often is not in the form at all. It is in a table: account owners, cost-centre
approvers, the on-call rota. That is a plain `SqlConnection` against the site's own database — the
[write to your own database](automation-custom-db.md) page covers the connection and the
parameterisation; the only new part here is the fallback.

```csharp
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Common.Utilities;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Services.Mail;

// the lookup, as a local function — replace the table and column with your own
string LookupOwner(string code)
{
    if (string.IsNullOrEmpty(code)) return null;
    using (var cn = new SqlConnection(Config.GetConnectionString()))
    using (var cmd = new SqlCommand(
        "SELECT TOP 1 OwnerEmail FROM dbo.AccountOwners WHERE AccountCode = @code", cn))
    {
        cmd.Parameters.Add("@code", SqlDbType.NVarChar, 32).Value = code;
        cn.Open();
        return cmd.ExecuteScalar() as string;
    }
}

var portal  = PortalController.Instance.GetPortal(ctx.PortalId);
var from    = portal.Email;
var subject = "Enquiry " + ctx.SubmissionId;
var body    = "<p>See submission #" + ctx.SubmissionId + ".</p>";

var accountCode = ctx.GetString("account_code", "");
var owner = LookupOwner(accountCode);
if (string.IsNullOrEmpty(owner))
{
    owner = "sales@contoso.com";
    ctx.Log("no owner for account " + accountCode + " — central queue");
}

try
{
    Mail.SendEmail(from, owner, subject, body);
    ctx.Log("mail handed to DNN's sender for " + owner);
}
catch (Exception ex)
{
    ctx.Log("mail failed for " + owner + ": " + ex.Message);
    ctx.Fail("Notification not sent");
}
```

Always have the else branch. A lookup that returns nothing and a script that then sends nothing is
the failure mode nobody notices, because the form still says thank you.

---

## 6. SMS, Telegram, Slack, Teams

There is no separate mechanism for these. Every one of them is an HTTP POST to the provider's API
with a token in a header, which means the [REST integration page](automation-rest-crm.md) is the
page you want — same `HttpClient`, same handling of a non-2xx response.

Two practical notes carried over from mail. Encode or escape anything the submitter typed before it
goes into a chat message, because chat clients render markup too. And keep the token out of the
script body where you can: the URL and the token belong in the same kind of server-side
configuration as everything else you would not put in a form export.

---

## 7. What this cannot do

- **Refuse the submission** because the notification failed. That needs PreInsert; nothing in the
  product writes a script into that stage today.
- **Write the chosen recipient back into the stored submission.** `ctx.SetValue` is refused at
  PostCommit, deliberately — a script that believes it changed a stored value and did not is a data
  bug that surfaces months later in a report. Send the value onward, or write it to your own table.
- **Attach a generated PDF.** Document generation is not implemented.

---

## Before any script runs

Three gates, in order:

1. `<add key="MegaForm:AfterSubmitScriptEnabled" value="true" />` in the server's `web.config`
   appSettings. Off on every install, and a file rather than a settings screen on purpose: the right
   bar for *people may run code on this server* is *can edit files on this server*.
2. A **host** (superuser) account saves the script. Not a site administrator, not module-edit
   rights.
3. An approval hash over the source. The stored hash must match the source, so a script that arrives
   inside an imported form or a gallery template is inert until a host on **that** site approves it.

Ordinary form saves cannot introduce, alter or enable a script.

---

## Measured

On a DNN 10.3 site, one anonymous submission ran a single PostCommit script that sent mail through
the site's own SMTP settings alongside a parameterised INSERT, an outbound HTTP POST and a user
creation. Total run duration 927 ms. The mail line in the run log:

```
mail handed to DNN's sender for jane.carter@example.com
```

"Handed to DNN's sender" is the honest boundary, and it is as far as the log line can go. The call
returns nothing, so the script knows only that it completed without throwing. Whether SMTP delivered
the message, and whether the recipient's server accepted it, is between the two mail servers — the
answer to that is in your SMTP logs, not in the run record.

## Related

- [Push a submission to a CRM, ERP or any REST/SOAP API](automation-rest-crm.md) — and every SMS or
  chat provider
- [Write to your own database](automation-custom-db.md) — for recipient lookups
- [Create a user and grant a role](automation-user-provisioning.md)
- [Automation overview](automation-overview.md)
