# Handoff — 2026-08-07 (second session): engine features 2 + 3, and four side items

Continues `CLAUDE_HANDOFF_20260807_SESSION_AND_TEMPLATE_BATCH.md`. The owner chose option (b),
scoped: **build features 2 and 3 first, then convert templates.** Nothing is committed yet.

Feature 1 (live value echo into shell markup) was deliberately NOT built — it is a real binding
layer and the owner deferred it. Family 2 and family 3 of the template batch stay blocked on it.

---

## 1. What shipped

### Feature 2 — Next / Submit stay disabled until the current page is valid

Opt-in per form: `settings.gateNavigationUntilValid: true`. Off by default, so no existing form
changes behaviour, and off in the builder preview for the same reason `goNextPage` skips its gate
there.

| File | Change |
|---|---|
| `MegaForm.UI/src/renderer/index.ts` | `GateUntilValid v20260807-01` block before `updateNavigation`: `gateNavigationEnabled` / `gatedPageFields` / `applyGateState` / `gatedNavButtons` / `syncNavigationGate` / `bindNavigationGate`. Called at the end of BOTH `updateNavigation` branches and bound to `input`+`change` in `init` |
| `MegaForm.UI/src/renderer/validation.ts` | `pageFieldErrors()` — the page rule set as a read-only pass; `validatePage` now paints from it. `compositePartFailure()` — the per-part rules lifted out of `validateForm` |
| `MegaForm.Core/Models/FormSchema.cs` | `FormSettings.GateNavigationUntilValid` |

Design points worth keeping:

- **It is an affordance, never an authorisation.** `goNextPage` still calls `validatePage`, submit
  still calls `validateForm`, the server still re-enforces. So the gate errs toward ENABLED and any
  throw inside it unblocks every button it manages — a rule it cannot read must never leave a user
  with a dead button.
- **`applyGateState` handles non-`<button>` elements.** The premium shells' action elements are
  `<a>`/`<div>`, which ignore `disabled`; they need `pointer-events` + `aria-disabled`.
- **Ordering matters.** `updatePremiumNativeShellState` re-enables the shell's own submit
  unconditionally, so `syncNavigationGate()` must run after it.
- ⭐⭐ **`FormSettings` is a strict POCO with no `JsonExtensionData`.** A settings key that is not
  declared there is silently dropped the first time a form round-trips the typed model (builder
  Save, `RenderModelResolver.SettingsJson`). Adding the C# property is what makes the flag exist
  at all — the template JSON alone would have looked like it worked, then quietly stopped.

### Feature 3 — the success screen interpolates field values

`{{field:<key>}}` now resolves on the post-submit screen, alongside the three tokens that already
worked. Values come from `lastSubmittedData` through `mfFmtSummaryValue`, so a checkbox array or a
composite formats exactly as it does in the answer summary. Unknown key → `''`, never the literal
braces.

- **Two contexts.** `'text'` (default) returns the raw value and every caller escapes it;
  `'url'` percent-encodes each value and is used for `redirectUrl`. That is not cosmetic — raw, a
  submitted value could inject query parameters, and a token at the START of the URL would hand the
  visitor control of the whole destination.
- **Secrets are never echoed.** `postSubmitTokenIsSecret` skips `__mf*`/honeypot keys, anything in
  a `type="password"` input, and any Composite whose group contains one (password_confirm combines
  to just `v.password`). Unreadable ⇒ treated as secret.
- **Function replacements throughout**, so a `$` in a form title or a submitted value stays a `$`
  instead of being read as a `$&` backreference.

### 🔒 A pre-existing leak found while building it — fixed

`showAnswerSummary` printed EVERY submitted key in clear text, so a form with a password field put
the visitor's password on the thank-you screen. `buildSummaryRows` now applies the same
`postSubmitTokenIsSecret` guard. Verified: the QA form's `account_password` row is absent.

### Persona Bar → Submissions (the 🔴 from the last handoff)

`MegaFormHostPageResolver.BuildSubmissionsUrl(host, formId)` replaces
`BuildControlUrl(host, "Submissions", formId)` at `MegaFormController.cs:128`. It reuses
`BuildDashboardUrl` and appends `?mfFormId=<id>#mf-submissions`, handling both friendly-URL
(path segments, no `?`) and raw query-string forms.

Verified live through the real API after deploying the DLL:

```
form 55 | subs=2
   submissionsUrl : http://megaclean008.ai/mfqa-admin?mfFormId=55#mf-submissions
```

and that URL renders the dashboard on **All forms / Form #55** with rows loaded.

### invoice-blue is published

`tools/gallery/Publish-Gallery.ps1 -Message "invoice-blue: fourth invoice skin (48 templates)"`
→ gallery commit `7dcddf1`, **47 → 48 templates, live and verified serving.** The clone was already
at 47 (no stale-clone deletion risk this time); the diff was one added template file plus the
regenerated `manifest.json`/`index.html`.

### The independent full-width test page

`http://megaclean008.ai/mfqa-wide?mfFormId=<id>` — **tab 1014, module 10610**, skin
`[G]Skins/Aperture/default.ascx`, module in `ContentPane`.

Measured at a 1440px viewport: ContentPane **1280px**, form wrapper **1224px**, premium shell
**1192px** — against `mfqa-form`'s ~510px `RightPane`. The mock reference width is 934px, so
templates can finally be compared honestly.

The query string beats the module's bound form (`?mfFormId=55` renders form 55 on a module bound to
54), so one page serves the whole batch. Built with the Pages API + MegaForm's own `AddToPage`:

```
POST /API/PersonaBar/Pages/GetPageDetails?pageId=1009   -> { page, ValidationCode }   # template
POST /API/PersonaBar/Pages/SavePageDetails              -> tabId 1014                 # tabId=0, modules=[], new skinSrc
POST /API/personaBar/MegaForm/AddToPage {"FormId":54,"TabId":1014,"Pane":"ContentPane"}
```

---

## 2. Two claims in the previous handoff were WRONG

Both are corrected in place in that file. Recording them here because both changed the plan.

1. **Module 10599 IS in `admin_dashboard` mode.** The check that said otherwise queried setting
   names `MegaFormModuleMode`/`ModuleMode`/`moduleMode`; the real key is **`MegaForm_ModuleMode`**,
   so every module came back `(none)` and the conclusion inverted. The `ctl=FormList` route I said
   to test was not needed.
   ⭐ Lesson: a settings-table query that returns `(none)` for EVERY row is a spelling result, not
   a data result.

2. **Save-as-draft exists and works on DNN.** I wrote "does not exist at any level". In fact:
   `Draft/Save` + `Draft/Get` on Web and DNN, `FormRepository.SaveDraft`, `EnableSaveResume` on the
   form entity, `bindSaveDraft()` in the renderer, resume via `?resume=<token>`, and
   `FormView.ascx:866` emits the button under `if (ViewModel.EnableSaveResume)`.
   The real gap is narrow: **the TS-built actions row (`renderer/index.ts:253`) never emits
   `mf-btn-save-<id>`**, so Web/Oqtane have no button, and Oqtane has no `Draft/Save` route.
   ⇒ `job-application` on DNN is NOT blocked; it needs `EnableSaveResume = true`.
   ⭐ Lesson: grepping for a symbol found only builder/workflow `SaveDraft` hits and I stopped
   there. The renderer's own `bindSaveDraft` was three lines from code I had already read.

**So the engine-gap list is 11 items, not 12** — and features 2 and 3 are now done, leaving 9.

---

## 3. Also found, NOT fixed — needs a decision

### 🔴 `MegaForm.UI/src/builder/workflow/wf-app.ts` does not parse

`tsc` and esbuild both reject it: `Unexpected "}"` at **line 785, col 2**.

- It is **committed** (last touched Apr 21, only ever in `17c8899` "track full source tree") and
  **not imported by anything** — `src/builder/workflow/index.ts:10` mentions it in a comment only.
  The shipped `megaform-workflow-reactflow.js` is current (rebuilt today) and comes from elsewhere.
- Consequence: **`npm run typecheck` has been masked repo-wide.** TypeScript skips semantic
  diagnostics when any syntactic error exists, so `tsc --noEmit` reports this one line and nothing
  else. There are ~35 real pre-existing type errors behind it (unused locals, `possibly null`, a
  missing `@i18n` path). None of them are new.
- Decision needed: delete the orphan, or fix the brace and let the rest of the errors surface.

### 🟡 Three stray MegaForm modules on the 404 page of megaclean008

`ModuleID 10605/10606/10607` on tab 24 (404 Error Page) — same shape as the `ModuleID 22055` mess
on prod, but on the QA site, so lower priority.

---

## 4. QA fixtures and how to re-run

Fixtures live in `tools/browser-qa/fixtures/` (kept OUT of `Samples/FormTemplates` so they can
never reach the gallery); screenshots in `fixtures/evidence-20260807/`.

| Fixture | Form | Proves |
|---|---|---|
| `qa-gate-tokens.json` | **55** | 2 pages, required + Email + Url rules, checkbox array, password_confirm composite. Gate + every token |
| `qa-token-redirect.json` | **56** | a field token inside `redirectUrl` |

Results, all in a real browser at `http://megaclean008.ai`:

- Gate, 8 stages: empty → blocked · one required filled → blocked · invalid email → blocked ·
  valid → **unblocked** · invalid optional Url → **re-blocked** · fixed → unblocked · required
  cleared → re-blocked · refilled → unblocked.
- Page 2: empty password → blocked · **first box only → still blocked** · confirm MISMATCH → still
  blocked · confirm matches → unblocked. (Before `compositePartFailure`, filling the first box
  alone unblocked Submit — the combined value was non-empty.)
- Tokens: `Thanks, Hung!` · email · `alpha, beta` · password `[]` · unknown key `[]` ·
  `{{submission:id}}` `[1109]` · form title. Answer summary: 3 rows, no password row.
- XSS: `<img src=x onerror=…>` submitted as a first name renders as text
  (`&lt;img …&gt;`), 0 `<img>` elements, handler never fires.
- URL context: submitting `https://evil.example/&admin=1 x` lands on
  `http://megaclean008.ai/mfqa-form?ref=https%3A%2F%2Fevil.example%2F%26admin%3D1%20x` — host
  unchanged, ONE query param, no injected `admin`.

### Re-running

```powershell
# 1. rebuild + deploy the renderer
cd MegaForm.UI; npm run build:renderer
Copy-Item ..\Assets\js\megaform-renderer.js `
  E:\DNN_SITES\DNN_MegaClean008\Website\DesktopModules\MegaForm\Assets\js\ -Force

# 2. recycle BEFORE seeding (the template catalog is cached in memory)
Restart-WebAppPool -Name DNN_MegaClean008

# 3. copy fixtures + POST DevBulkCreateForms (needs dev.lock, ModuleId/TabId headers)
```

⭐⭐ **Cache trap hit again, in a new place.** `megaform-renderer.js` is served as
`?v=20260729-B417?cdv=73` — a version that does NOT change when you overwrite the file, so a
browser that already loaded the page keeps the old bundle and the new behaviour silently does not
appear. `performance.getEntriesByType('resource')` → `decodedBodySize` is the cheap way to tell
(old 398608 vs new 399001, `transferSize: 0` = cache). Force it with
`fetch(url, { cache: 'reload' })` then reload.

⭐ `Publish-Gallery.ps1 -WhatIfOnly` leaves the clone **staged**, which then trips its own
"working tree must be clean" guard on the real run. Reset first:
`git -C "<clone>" reset --hard origin/main`.

⭐ Do not pipe a PowerShell call to a native exe through `2>&1` — git writes progress to stderr,
PS 5.1 wraps each line as an ErrorRecord, and `$ErrorActionPreference='Stop'` aborts the script.
`Publish-Gallery.ps1` "failed" at `git pull` purely because of the redirection.

---

## 5. State

- **Uncommitted.** Touched: `renderer/index.ts`, `renderer/validation.ts`, `Models/FormSchema.cs`,
  `PersonaBar/Components/MegaFormHostPageResolver.cs`, `PersonaBar/Services/MegaFormController.cs`,
  2 new fixtures, this file, edits to the previous handoff.
- Builds: Core (4 TFMs) 0 errors · PersonaBar 0 errors · `npm run build:renderer` clean and synced
  to all four platforms. No new type errors in the two files I touched.
- Deployed to megaclean008: `megaform-renderer.js` and `MegaForm.PersonaBar.dll`
  (backup `MegaForm.PersonaBar.dll.bak-20260802123004`, rollback with
  `Deploy-CoreDll.ps1 -Site DNN_MegaClean008 -Assembly MegaForm.PersonaBar.dll -Rollback`).
  **`MegaForm.Core.dll` was NOT deployed** — the gate flag reached the client anyway because the
  seeded `SchemaJson` carries it. The typed-model property matters for the builder Save path, so
  ship Core before anyone edits a gated form in the builder.
- Gallery: pushed, live, 48 templates.

## 6. Next

1. Convert **Family 1**: one generator, 5 skins (+ `rose-registration`) = 8 of 16. Both new
   features are available to them; fix the hardcoded
   `/DesktopModules/MegaForm/Assets/img/…` path here, once, since it 404s on Oqtane/Web/Umbraco.
2. QA **Family 0** (`register`, `festa-italiana`) on `/mfqa-wide`.
3. Add `gateNavigationUntilValid` to the builder's Settings UI — right now only hand-written JSON
   or a template can set it.
4. Decide on `wf-app.ts` (§3) so `npm run typecheck` becomes useful again.
5. Feature 1 (live echo) whenever family 2/3 become the priority.
