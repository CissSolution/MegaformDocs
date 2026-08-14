# Scripting: what the host is agreeing to

A MegaForm server script is ordinary C# running inside your website's own process, under your
website's own identity. It can open your database with your connection string, call out to the
internet, read anything the worker process can read, and create user accounts. There is no sandbox
and no reduced privilege set.

That is the same bargain you already accept every time you install a third-party module. A module
you install gets the process; a script a host saves gets the process. The difference is only that a
script is smaller, is written by you, and takes effect without a restart.

This page is about the three things that stand between "a form exists" and "code runs on your
server", what each one is actually for, and how to keep the arrangement sane once more than one
person is involved.

> [!IMPORTANT]
> If you are arriving from an older page that described a mediated capability object — a catalog of
> named actions and endpoints a script asked for by name — that layer has been removed. Scripts now
> call platform APIs directly.

---

## 1. The three gates, in order

All three must hold. There is no fallback path, no per-site override, and no way for a request to
talk the server into skipping one.

### Gate 1 — the installation switch

Off on every install. A host turns it on by editing the config file on the server:

```xml
<appSettings>
  <add key="MegaForm:AfterSubmitScriptEnabled" value="true" />
</appSettings>
```

Anything other than `true` (case-insensitive) — including a missing or unreadable entry — means off.

It is a config file rather than a settings screen on purpose. Turning this on means *people may run
code on this server*, and the right bar for that is **can edit files on this server** — a
meaningfully smaller group than *knows the superuser password*. Editing the file also recycles the
application, so the change lands at a moment you picked rather than mid-afternoon on a Tuesday.

There is a second, quieter benefit. Any recovery procedure that restores your site from a backup and
a fresh config file brings the feature back **off**. A settings-table switch would come back on.

### Gate 2 — a host account saves the script

Only a Host / SuperUser can open the editor, change a script, or save one. Not a site
administrator. Not someone with Edit permission on the module.

That distinction matters more than it looks. "Edit module" is a content-editor permission several
people usually hold, and a site Administrator's reach stops at their own portal — while a script
runs in the process shared by every portal on the installation. Anyone below Host gets a plain
refusal rather than an editor that looks enabled and then does nothing.

### Gate 3 — the approval hash

When a host saves a script, the server computes a SHA-256 of the exact source it accepted — after
its own normalisation, from the copy the server holds, not from anything the client sent alongside
it — and stores that hash with the approver's user id, name and UTC timestamp.

Before every run, the server re-hashes the stored source and compares. Mismatch, no run.

That makes every other route into your forms inert by construction. A form export, a template
install, a gallery download, a restored backup, a hand-built save request — all of them can carry a
`source` string. None of them can carry a valid approval, because an approval is written
server-side at the instant a host pressed Save on **that** site.

The messages an administrator sees when this bites are deliberately specific, because "nothing
happened" is the failure mode this feature had to avoid:

```text
Script has no host approval on this site. A host/superuser must open it and press Save.
Script source does not match the approved version — it was changed outside the host-only editor.
After-submit script is disabled for this form.
```

The first one is the import case. It is not a bug report — it is the gate doing its job. Someone on
your site has to read the script and approve it before it becomes code.

### Ordinary form saves cannot touch any of this

The normal form Save path does not merge the client's version of the script block. It discards it
and writes back the copy the server already had. A content editor saving a form cannot introduce a
script, edit an approved one, or switch one off.

Switching one *off* is included on purpose. It sounds harmless, and it is not: anyone who can toggle
`Enabled` off can toggle it back on after a host disabled it.

---

## 2. What the gates do not do

Being straight about the limits is the point of having them:

- **A script is not sandboxed.** Once approved, it has the process. The gates control *who can put
  code there*, not *what the code may reach*.
- **The run timeout bounds the visitor, not the server.** The run is awaited with a timeout
  (1–60 seconds, default 10). .NET has no safe way to abort a foreign thread, so on expiry the
  request stops waiting and the submission completes, with
  `Script did not finish within 10s. Cancellation was requested and the run was abandoned.` in the
  run record. A script stuck in a tight loop keeps a thread-pool thread until the process recycles.
  Cancellation is cooperative: your script receives a `CancellationToken` named `ct`, and passing it
  to your `await` calls is what makes the timeout real.
- **Script source lives in the form record.** It is in your database, in every backup, and in any
  export taken by someone with export rights. A connection string or an API key pasted into a script
  is a credential in all of those places.
- **The audit write is fail-soft.** An audit failure never fails a submission — losing an audit row
  is bad, losing a customer's submission is worse. So an empty run list is weak evidence. The same
  facts also go to the platform event log.

---

## 3. Strict mode

The product ships with an older enforcement pass still in the box, switched off.

Turned on, it runs a semantic check over the compiled script and refuses whole namespaces:
`System.IO`, `System.Net`, `System.Data`, `System.Reflection`, `System.Diagnostics`,
`System.Threading` (except `Tasks`), `System.Security`, `System.Xml`, `Microsoft.Win32`,
`Microsoft.CodeAnalysis`, and the platform's own namespace, `DotNetNuke`.
Individual types in otherwise-open namespaces go too: `System.Type`, `System.Activator`,
`System.Environment`, `System.AppDomain`, `System.Console`, `dynamic`. Violations come back as
`MF1001` at save time, on the author's own line numbers:

```text
MF1001  Namespace 'System.IO' is not available to scripts (used here: System.IO.File).
```

The check works on **bound symbols**, not on text, so it is not fooled by `using F = System.IO.File;`,
by fully-qualified names, by `global::`, by generic arguments, or by an inferred `var`.

It is off by default because the reasoning behind it assumed something that is no longer true here:
that the list protects the site from the script's author. It does not. The only account that can
save a script is a superuser who can already install a module, edit config and run SQL. There is no
privilege left to hold back.

> [!WARNING]
> Strict mode denies `DotNetNuke`, `System.Data` and `System.Net` outright. Every example in the
> scripting documentation — `UserController`, `RoleController`, `Mail.SendEmail`, `SqlConnection`,
> `HttpClient` — stops compiling. Turning it on is not a hardening tweak you apply to a working
> site; it is a decision to write a different, much smaller kind of script.

**When it is the right call:** an installation where the person writing scripts and the person
answering for the server are not the same person, and the scripts are genuinely only computation —
scoring, rounding, formatting, deriving a value to log. If your scripts write to a database or call
an API, strict mode is not for you.

The switch is a process-wide flag set at startup, not a per-form or per-site setting, and there is
no screen for it. Unsafe code — pointers and `stackalloc` — is refused in both modes.

---

## 4. Reviewing a script before you approve it

You are the third gate. If the script came from a template, a partner, a contractor or an older
site, read it as code you are about to install, because that is what it is.

What is worth the minutes:

**Credentials.** Any literal connection string, bearer token, API key or password. On DNN,
`Config.GetConnectionString()` already gives you the site's own connection — a script that carries
its own is either talking to something else (fine, but you should know about it) or duplicating a
secret into your form table.

**SQL built by concatenation.** `"... WHERE Email = '" + ctx.GetString("email", "") + "'"` is an
injection hole with a submitted value on the wrong side of it. Parameters, always.

**Outbound URLs built from submitted data.** A script's `HttpClient` is a plain `HttpClient`. There
is no guard between it and your internal network, so a URL that comes even partly from `ctx.Data` is
a request an anonymous visitor gets to aim. Hard-code the host; take only the path or the payload
from the form.

**What it does with identity.** `UserController.CreateUser` and `RoleController` calls on a public
form mean an anonymous submission creates accounts and grants roles. Check which role, and check the
conditions under which it happens.

**Work inside a loop.** Every HTTP call and every query is paid inside the submit request, with the
visitor watching a spinner. Count the calls in the worst case, not the typical one.

**Silence.** A script that catches everything and logs nothing will fail for months without anyone
noticing. Look for a `ctx.Log` line on the paths that matter and a `ctx.Fail` on the ones that
should count as failures.

**Anything that reads like infrastructure.** Reading or writing files, starting processes, touching
the registry, loading assemblies, compiling more code. A form hook has no business doing any of it.
If you see one and cannot explain why it is there, do not approve it.

Two habits that cost nothing: keep a copy of what you approved outside the site, and re-read the
diff — not the whole script — every time someone asks you to press Save again. The approval hash
tells you the source changed; it cannot tell you whether the change was the one you were promised.

---

## 5. The run record

Every attempted run is written down, including the ones that did not happen.

**Runs** capture the form, the submission, the stage, the hash of the source that ran, success or
failure, whether the run aborted, the duration in milliseconds, the acting user id, the error
message, the full `ctx.Log` output as text, and the UTC timestamp. On SQL Server these are the
`MF_AutomationRuns` rows, indexed by form and date.

**Approvals** capture the form, the stage, the hash, the action, the user id and name, the source
length and the UTC timestamp — `MF_AutomationScriptApprovals`. This is the table that answers "who
put code on this server, and when" after an incident. It is only able to answer because the endpoint
wrote it at the moment it happened, from the server's own idea of who the caller was.

Read both through the host-only endpoint, newest first:

```text
GET /DesktopModules/MegaForm/API/FormScript/Runs?formId=12&take=25
```

`take` defaults to 25 and is clamped to 200. The response carries `runs` and `approvals` side by
side, which is usually how you want them: a run that failed right after an approval row is a
different story from one that has been failing since last quarter.

There is no runs screen in the builder today. The endpoint and the tables are the interface.

A useful detail when reading them: a **skipped** run is not a failed one. Disabled, empty, not
approved on this site, hash mismatch, or the scripting assembly missing from `bin` all record a
reason rather than an error, so "did not run" and "ran and broke" stay tellable apart.

---

## 6. One more thing about stages

Four stages exist in the engine — PreValidate, PreInsert, PostCommit, AsyncWorker — and only
**PostCommit** can be configured. Nothing in the product writes a script into the other three: no
editor, no API, no import path.

For this page that has one consequence worth stating plainly. A script cannot refuse a submission,
and it cannot rewrite a stored value; `ctx.SetValue` is refused after the commit by design. So the
review question is never "could this script silently corrupt what we stored" — it is "what does this
script reach **outside** the submission", which is exactly the list in [§4](#4-reviewing-a-script-before-you-approve-it).

---

## Related

- [Run your own C# after a submission](after-submit-script.md) — the editor, the `ctx` surface, and
  worked examples.
