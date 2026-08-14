# Automation samples running on megaclean008 — 2026-08-14

Built so the "Automating what happens after a submission" pages stop describing things nobody ran.
Every status here comes from submitting through a real form and reading the run record afterwards.

**Site:** <http://megaclean008.ai> · admin / dnnhost · DNN 10.3.0 · MegaForm **2.0.20**
**Rebuild:** `node tools/browser-qa/automation-samples-setup.mjs [forms|scripts|submit|report]`

---

## What to look at

| | |
|---|---|
| **Order intake** | <http://megaclean008.ai/mfqa-form> — form **235** |
| **Membership signup** | <http://megaclean008.ai/mfqa-admin> — form **236** |
| Scripts | Form Settings → Server Script (host only), or `FormScript/Get?formId=235` |
| Run records | `FormScript/Runs?formId=235`, or `MF_AutomationRuns` + `MF_AutomationCapabilityCalls` |
| Rows the script wrote | `SELECT * FROM dbo.MF_Demo_Orders` |
| Mail the script sent | `Website\App_Data\MegaForm\MailDrop\*.eml` |

---

## Sample 1 — Order intake (form 235, PostCommit)

One script, three destinations. Submitting Jane Carter / Germany / 3 × 250 produces:

| Step | Capability | Measured |
|---|---|---|
| Write into a table this site owns | `ctx.Actions.ExecuteNamedActionAsync("save-order", …)` | ✅ `rows=1`, 11–53 ms |
| Post the order to a REST endpoint | `ctx.Api.PostJsonAsync("crm-webhook", …)` | ✅ `status=200 attempts=1`, 642 ms |
| Email the customer | `ctx.Notify.EmailAsync("order-received", …)` | ✅ delivered over SMTP |

Tax is computed **in the script** — 19% for `DE` — so `750 → 892.50`. That number reaches the orders
table and the email. It does **not** go back into the submission: `ctx.SetValue` is refused at
PostCommit by design, which is why the form has no read-only "total" field. A field nothing can fill
would read as broken.

The delivered message, from `MailDrop`:

```
To: jane.carter@example.com
Subject: We received your order (#11)
<p>Hello Jane Carter,</p><p>Your order total is <strong>892.50</strong>.</p><p>Reference: #11</p>
```

Placeholders are `{{key}}` — two braces. Single braces arrive literally; that cost one run to find.

## Sample 2 — Membership signup (form 236, PostCommit)

`ctx.Identity` against the host's own membership layer, not `UserController`:

```
identity.find-user   → found=False   0 ms
identity.create-user → created=True roles=1   357 ms
```

The account is real — `Users` row 15, `sam.rivera.…`, holding **Registered Users** from the catalog's
`allowedRoles`. A role outside that list is refused; the script does not get to choose.

---

## The catalog behind both

The rail in one object. Scripts hold names; the site holds the SQL, the URL, the credential and the
role list.

| Kind | Name | What the site holds |
|---|---|---|
| dbAction | `save-order` | the INSERT, its parameter allow-list, the connection |
| endpoint | `crm-webhook` | the URL, method, auth, retry policy |
| template | `order-received` | subject and HTML body |
| identity | — | `allowUserCreation`, `allowedRoles: ["Registered Users"]` |

---

## What is NOT running, and why

**Only PostCommit can be configured.** `FormScript/Save` stores the after-submit hook, which the
engine reads as PostCommit. `PreValidate`, `PreInsert` and `AsyncWorker` are read by the runtime but
**nothing in the codebase writes them** — no editor, no API, no import path. Every recipe needing
those stages is documentation of an engine capability with no way to switch it on:

- Blacklist / fraud check — needs PreInsert to refuse
- Encrypt or normalise a field — needs PreInsert + `ctx.SetValue`
- Writing a looked-up price back into the row — same

**Four capabilities are declared but unwired.** Each compiles and then throws at run time, proven on
this site:

```
ctx.Documents → NotWiredException: ctx.Documents is not available on this installation yet
ctx.Files     → NotWiredException
ctx.Queue     → NotWiredException
ctx.Jobs      → NotWiredException
```

**DNN only.** Oqtane has the catalog and nothing else — `ctx.Notify` / `ctx.Identity` are the throwing
stubs there, no run is recorded, an AsyncWorker script is dropped with a warning. Web and Umbraco have
neither.

---

## Site changes made for the demo — revert if unwanted

| Change | Why | Undo |
|---|---|---|
| `MegaForm:AfterSubmitScriptEnabled = true` in `web.config` | gate 1 of 3; scripting is off on every install | remove the key (backup: `web.config.bak-before-scripting-20260814`) |
| `MegaForm_Email_*` host settings → `127.0.0.1:2525` | so the email sample delivers somewhere | clear the five `MegaForm_Email_*` rows in `HostSettings` |
| `<system.net><mailSettings>` pickup directory | first attempt at capturing mail; **not what worked** — the sender builds `new SmtpClient(host, port)` so it bypasses this | backup: `web.config.bak-before-maildrop-20260814` |
| `dbo.MF_Demo_Orders` | destination for the `save-order` action | `DROP TABLE dbo.MF_Demo_Orders` |
| Users `sam.rivera.*` | created by the identity sample, one per submit | delete from Users |

The mail sink is a repo tool, not a service: `node tools/browser-qa/smtp-sink.mjs`. It listens on
loopback only and writes `.eml` files. Without it running, `ctx.Notify` fails with `SmtpException` —
which is itself worth seeing once, because it proves the send is real rather than swallowed.
