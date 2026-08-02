# Session handout — 2026-08-01 → 08-02

Supersedes `CLAUDE_HANDOFF_20260801_PERSONABAR_NEXT.md` as the current state of play. Seven commits
on `feature/typed-submission-storage-core`, from `cc22b20`:

| Commit | What |
|---|---|
| `1324e39` | gallery: a stale CDN listing was hiding published templates; serve from Pages |
| `59d8e98` | personabar: "Open dashboard" led to the empty state; release 02.00.011 |
| `af6ccec` | docs + QA drivers that no longer write to live sites |
| `fd37657` | oqtane pkg: ship the assemblies a clean host lacks; stop the slimming erasing itself |
| `8f7c2ea` | permissions: a rule on the step's opening section governs the whole step |
| `4f41a21` | handout for the Persona Bar drag work; drivers stop littering the repo root |
| `fbf3251` | permissions: one gate for editing an existing submission (**service only**) |

Tests **280/280**. Working tree still carries ~625 files modified by earlier sessions — untouched.

---

## 1. Do these first

1. 🔴 **Wire the two controllers to `SubmissionEditService`.** Until then, editing a submission
   still bypasses the field/step permission model on both platforms — see §3.
2. 🔴 **Remove the module the QA run left on production.** `dnndefender.com`, live **404 Error
   Page**, `ModuleID 22055` / `TabModuleID 21755`, tab 28, titled "Blog Reader Events".
   ```powershell
   node tools\browser-qa\dnn-api-post.mjs .\out https://dnndefender.com host "Minh@2002" - ^
     "/API/PersonaBar/Pages/DeleteModule" "{\"pageId\":28,\"moduleId\":22055}"
   ```
   My attempt was blocked by the permission classifier, so it is still there.
3. ⚠️ **Look at form 381 on production** (`Blog Reader Events`, 210 submissions). Its
   `UpdatedOnUtc` moved to a QA run of mine with `UpdatedByUserId=1`. `WorkflowJson` is NULL, but
   243/278 forms are NULL and only 4 forms in that portal own a workflow, and `SchemaLen` is a
   healthy 7693 — so nothing looks lost. Worth one human glance rather than my assurance.

---

## 2. What shipped, and the reasoning worth keeping

### Gallery — templates were being hidden by our own code

The Online Gallery filters twice, and only the second gate decides whether a card is drawn:
manifest + sha256 (install path) and a **repo listing** (render path). jsDelivr's data-API listing
for `@main` was frozen on a **six-day-old commit** — byte-identical to `dc53e2a` — through several
pushes and a full file purge, because `purge.jsdelivr.net` clears the FILE cache and that listing
is not purgeable. Seven published templates were dropped before reaching the grid, four of them
since 26 July.

Two fixes, either sufficient: `[StaleListing]` confirms a disputed entry with a HEAD against the
file (only a definite 404/410 removes a card), and `[PagesOverCdn]` moves the default repo to
**GitHub Pages**, which was serving correctly all along — the "Pages not available for this
organisation" note in the code was stale. Pages is not a host `BuildListingUrl` can enumerate, so
the reconcile is skipped and the manifest is authoritative on **every module version ever shipped**.

⭐ `cissolution.github.io` 404s; `CissSolution.github.io` serves. The capitals are load-bearing.

⭐⭐ **Verifying the download path is not verifying the render path.** The day before, I checked
47/47 sha256 and declared it fine while the grid was showing 40.

### Persona Bar — "Open dashboard" was a dead end

`BuildPageUrl` returned the bare page URL, and the resolver falls back to *any* MegaForm instance,
so on a portal whose only instance renders an unassigned form the button landed on *"No form has
been configured for this module."* `BuildDashboardUrl` now returns `ctl=FormList` unless a real
admin-dashboard instance exists.

That fix exposed an older one: **`ctl=FormList` had never compiled.** `FormList.ascx` asked for
`MegaForm.Models.FormSchema`, a namespace that does not exist. An `.ascx` compiles at runtime, so
it threw `CS0234` the moment anyone opened it — and nobody had, until the panel linked there.

⭐⭐ **ASP.NET serves that failure with HTTP 200** inside the module container. The probe reported
`200 / no login / no empty state` and looked like success; only the screenshot showed the stack
trace. Any check on a module control must scan the body for `CS####` / `Compilation Error`.

### Oqtane package — could not start a clean host at all

`[PackageSlim 2026-07-29]` dropped Roslyn / Razor.Language / Newtonsoft "because the Oqtane 10.x
host already carries them (checked against a pristine 10.2.1 install)". That check counted files
under **`BlazorDebugProxy\`**, a debug folder not on the server's probing path. Two boot crashes in
a row proved it. Every Oqtane site that kept working had accumulated the assemblies from a pre-slim
package — the trap `[pkg-fix 20260625]` in the same file already described.

The other half: **`build-gallery.mjs` replaces the whole `exclude=` attribute of the nuspec on
every run**, and its pattern list held only three things — so every rule the slimming hand-added
was deleted by the next gallery publish, silently, because a package size is only visible to
whoever builds one. The fixed rules now live in that array. **50.3 MB → 16 MB**, verified on a
fresh host this time (i18n/list returns 38 locales).

### Step permissions — they did not exist

Multi-step and tabbed forms had no step-level permission, because there is no Step object: the
runtime derives steps FROM the fields. So a step's rule IS its opening Section's
`showIf`/`readOnlyIf`, and `FormStepAccessCascade` spreads that verdict over the step's fields,
folded into the same `FieldAccessPolicy` per-field rules already use. Wired into **both** the render
projection and submit-time enforcement, with a test asserting the JSON and typed walks agree.

---

## 3. The open hole

Editing an existing submission skips the field/step permission model on both platforms:

```
DNN     MegaFormApiController.UpdateData        CanMutateSubmission -> UPDATE ... SET DataJson
Oqtane  MegaFormController.UpdateSubmissionData CanMutateSubmission -> _subRepo.UpdateData(...)
```

Neither calls `ServerSidePermissionEnforcementService`, so anyone past that one gate can write
every field — including `readOnlyIf`-locked ones and step-locked ones.

`SubmissionEditService` (`fbf3251`) is the choke point, tested, **not yet called by either host**.
Next: wire both controllers, then write `ModifiedOnUtc`/`ModifiedByUserId` and an `MF_AuditLog`
row with the per-field diff.

⭐ An audit hook on `ISubmissionRepository.UpdateData` must **exclude** the typed-storage collapse
(`SubmissionProcessor.cs:414` writes the literal `"{}"`), or every submit logs a bogus "data
changed".

### Do not rebuild these — they already exist

- **Ownership**: `PermissionService.cs:155-164` `IsSubmissionOwner` compares
  `submission.UserId.Value == user.UserId`, reached from `CanEditSubmission` via an `own` scope.
- **Rendering a submission back into the real public form**: `listview/runtime.ts:882-953` fetches
  `Submission/{id}` and boots the public renderer with `prefilledData` +
  `resumeToken: 'edit-' + submissionId`.
- **Audit columns**: `SubmissionInfo` already has `ModifiedOnUtc` / `ModifiedByUserId` and DNN's
  schema already adds them. They are named **Modified***, not Updated*. Nothing assigns
  `ModifiedByUserId`; only Umbraco sets `ModifiedOnUtc`.

I nearly rebuilt the first two. Adversarial verification of my own assumptions is what caught it,
and the same habit caught a drafted task to "add a pane picker" to the Persona Bar that was also
already finished.

---

## 4. Environments

| | |
|---|---|
| Clean Oqtane for testing | `http://localhost:5130` — host / `abc@ABC1024`, folder `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean20011`, DB `Oqtane_MegaFormClean20011`, 36 `MF_*` tables, ModuleDef 2.0.11, **no MegaForm module placed on any page yet** |
| Clean DNN | `dnn_acme_guide.ai` — admin / `dnnhost`, DNN 10.3.0 |
| Production | `dnndefender.com` — host / `Minh@2002`, remote `208.98.35.145`, MegaForm **02.00.011**, 278 forms. **Do not run anything that writes.** |

Deploy one assembly into a running DNN site (installing the package does not overwrite `bin\*.dll`):
```powershell
.\tools\gallery\Deploy-CoreDll.ps1 -Site <IIS site> -Assembly <Core|DNN|PersonaBar|Sdk>
```
Publish the gallery (pulls first, refuses a net deletion, waits for the live manifest to match):
```powershell
.\tools\gallery\Publish-Gallery.ps1 -Message "..."
```

### Tooling traps that cost the most time this session

- 🔴 The QA drivers **wrote to production**. `personabar-megaform.mjs` add-to-page creates a real
  module and takes the FIRST page in the list; the builder hand-off is not read-only either. Both
  are now behind `--allow-writes`, off by default.
- ⭐⭐ The MegaForm Persona Bar panel is an **iframe**. Querying the top document silently finds
  nothing — walk the frame tree and try the action in every frame rather than guessing.
- 🔴 `Runtime.evaluate` does not await promises without `awaitPromise: true`.
- ⭐⭐ `cmd.exe /c script.cmd` fails with "not recognized" on this machine even with the right
  working directory — `NoDefaultCurrentDirectoryInExePath` is set. Use `.\script.cmd`. From Git
  Bash there is a second trap: MSYS rewrites `/c` and leading `/paths` into Windows paths
  (`MSYS_NO_PATHCONV=1`).
- ⭐ Editing the `/MegaForm` page copy on DNN: `HtmlText.Content` is `ntext` (use `DATALENGTH()/2`
  and `CAST(... AS nvarchar(max))`), match single-line fragments only, and the change is invisible
  until `POST /API/PersonaBar/Server/ClearCache` — not `Servers/…`, which 404s.
