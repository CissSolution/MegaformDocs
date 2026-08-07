# Handoff — 2026-08-07 session, and the template batch waiting for the next one

Branch `feature/typed-submission-storage-core`, 11 commits on top of `4fccc38`.
Written so the next session can start cold and work straight through.

```
2b0c391 templates: invoice-blue, and the stray */ that silently ate the rules meant to style it
4db3c33 docs: park the C# in-workflow scripting request, with the research behind it
71e911c qa: dnn-api-post could not reach a module-scoped endpoint, and hid the reason when it failed
3ffab4a docs: handoff for the BPMN importer, and the runtime contracts it has to satisfy
c298e11 bpmn: the importer routed submissions down the wrong branch in five different ways
8107e52 bpmn: import endpoints on all three hosts (Track B, task B2 server half)
4a35440 bpmn: another vendor's attribute is not a MegaForm hint
0d93a33 bpmn: import BPMN 2.0 XML into a workflow definition (Track B, task B1)
8f3b462 docs: handoff for the Track A verification
9bac30f cloud-ready track A: three fixes that never reached a real host
ebfd8cf cloud-ready track A: workflow execution queue, durable Delay timer, versioned schema runner
```

Tests 349/349. Core (4 TFMs), Web, AspNetCore.Component, Oqtane.Server, DNN all build clean.

---

## 1. THE TEMPLATE BATCH — the main work waiting

The owner asked for 17 mocks from `http://localhost:3000/forms`
(source `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)`, dev server runs there).

**invoice-blue is done and committed. 16 remain.** A 7-agent survey read every one of them.

### ⭐⭐⭐ The finding that changes the plan

**Zero of the 16 fit the existing invoice generator.** Not one has its defining middle
(brand/doc-title header + bill-to two-column + DataGrid + subtotal/tax/TOTAL). Nobody should be
told "just add a palette" — that was true only for invoice-blue.

`tools/templates/build-invoice-templates.mjs` is still the most valuable asset in the batch, but as
**code to lift**: `buildFields`, the chips / option-card / consent CSS, the `:has()` host-chrome
de-carding, the DataGrid hardening in `buildCss`, and the totals-script pattern.

### Families

| Family | Mocks | Build once | Per skin |
|---|---|---|---|
| **0 — already shipped, QA only** | `register` (= Verdant), `festa-italiana` | — | — |
| **1 — EuroYouth body, decorative skin** ★ best ratio | xmas-sale (M), xmas-newsletter (L), agency-flyer (M), hotel-concierge (S), hotel-suite (M) | `buildFields` minus items/grand_total; chips + option-card + consent CSS; input variant flag (boxed / underline); option-card column flag (1/2/3/none) | palette, shell HTML, `{{content:*}}` copy, image |
| **2 — invoice 4-step wizard** | invoice-form (M, reference skin), invoice-spinera (L), invoice-codexo (L) | `premiumNativePageBreak` shell; totals script reading LIVE Tax%/Discount%; step-4 recap script; live header echo | palette, chrome markup, DataGrid column set, step-3 contents |
| **3 — form + live sticky aside** | hotel-booking (L), product-order (M–L, blocked) | two-column shell CSS + one "aside mirror" script — **greenfield, no precedent in `Premium/`** | palette, aside content |
| **standalone** | golden-pro (L), rose-registration (M), job-application (S), newsletter (S) | — | — |

**Cheapest next batch: Family 0 (QA) + Family 1 (one generator, 5 skins) = 7 of 16.**
Add `rose-registration` (rides Family 1's `buildFields`, three shipping precedents for its shell) and
it is **8 of 16 for one generator**. Do NOT start with Family 2 — three templates but two shell
layouts and two scripts that do not exist yet.

### 🔴 Engine features the mocks need that MegaForm does not have

Ordered by how many mocks need them. Every claim below was checked against current code.

| # | Feature | Needed by | Evidence |
|---|---|---|---|
| 1 | **Live value echo into shell markup** | 6 mocks (3 invoice, hotel-booking, product-order, golden-pro) | `{{content:*}}` is static text substituted once, not a binding |
| 2 | **Submit/Next disabled until valid** | 7 mocks | validation fires on submit; `setButtonState` (`renderer/index.ts:2743`) toggles only on page bounds |
| 3 | **Success screen with FIELD interpolation** | 7 mocks | `resolvePostSubmitTokens` (`renderer/index.ts:3709-3719`) resolves exactly three tokens — `{{submission:id}}`, `{{form:title}}`, `{{form:description}}` — and **no field values**. Also cannot re-arm a blank form or tear down a sidebar |
| 4 | **Curated review table inside a step** | golden-pro + 3 invoice | `reviewBeforeSubmit` injects a separate `#mf-review-<id>` with its own buttons and lists every key |
| 5 | **Save as draft / resume later** | job-application | does not exist at any level; every `SaveDraft` symbol is a builder-side WORKFLOW draft |
| 6 | **Cross-field validation (`equalTo`)** | register | `FieldValidation` (`FormSchema.cs:244`) has MinLength/MaxLength/Min/Max/Pattern/mask/customMessage only. Grep for `equalTo`/`matchField` across `MegaForm.UI/src` + `MegaForm.Core`: **zero hits** |
| 7 | **Password show/hide toggle** | register | no control in the renderer |
| 8 | **Live character counter** | job-application | grep `charCounter`/`showCharCount`: **zero hits**. `MaxLength` enforces only |
| 9 | **DataGrid product→price lookup** | product-order | `tokenize()` (`megaform-widget-datagrid.ts:129`) accepts only `+-*/%` and **throws `Unexpected char`** on `=`, `<`, `>` — `If(product=="Pro",99,29)` is unwritable |
| 10 | **Runtime currency switch in DataGrid** | invoice-spinera | column `type:'currency'` formats internally, no symbol switch. Degrading it to "relabels the totals pill" drops spinera L→M |
| 11 | **DataGrid two-line cell** | codexo, spinera | one input per column track; the sub-note must be dropped or promoted to its own column |
| 12 | **Option richHtml limits** | hotel-booking, hotel-suite, xmas-newsletter, agency-flyer | `style=` is stripped on BOTH paths (`FormHtmlRenderer.cs:1847-1848`, `renderer/inputs.ts:64`) ⇒ occupancy/popularity bar widths must be **pre-baked CSS classes**; no `<svg>`/`<img>` in options; per-option icons resolve to **Font Awesome, not lucide**; no third slot above the label |

**The owner has not yet chosen** between (a) converting "close enough" — static templates that look
right but do not behave like the mock — and (b) building features 1–3 first, since those three cover
6–7 mocks each. Ask before starting Family 1 or 2.

### Blockers that are not about MegaForm

- `rose-registration` needs `/images/rose-wellness-hero.png` — **not in this repo**, someone must source it.
- `product-order`'s **own mock math is broken**: `handleItemChange` never writes `item.price`,
  `addItem` seeds `price:0`, so the $99/$9.90/$108.90 on screen is a fixture, not a computation.
  There is no correct behaviour to copy — ask the owner for the real pricing rule.
- `hotel-concierge` renders **"BABY'S FIRST BOOK"** with a unicorn and its hero PNG is never
  referenced — the slug looks wrong; confirm before it ships as a hotel template.
- `hotel-suite` / `hotel-booking` still carry EuroYouth "Programme track / CEFR level" selects
  inside a hotel form — content bug to resolve on conversion.
- Hero images (1.8–2.0 MB each) need recompressing, and the three existing brochure templates
  hardcode `/DesktopModules/MegaForm/Assets/img/…`, which **404s on Oqtane, Web and Umbraco**.
  Fix that path pattern once, in Family 1.
- `festa-italiana` and `rose-registration` fetch Google Fonts remotely — degrade to a local stack.
- `hotel-concierge`'s `position:fixed` dots will anchor to the HOST page viewport inside a CMS
  module — re-author as `position:absolute`.

Full survey JSON + the family plan: the workflow transcript under
`.../subagents/workflows/wf_651c2a04-a94/journal.jsonl`.

---

## 2. WHAT SHIPPED THIS SESSION

### Cloud-Ready Track A (`ebfd8cf`, `9bac30f`) — see `CLAUDE_HANDOFF_20260807_CLOUD_TRACK_A_VERIFIED.md`
Queue-backed workflow execution, durable Delay timer, versioned schema runner. Three fixes that a
green build could not have caught: Oqtane never adds a column to a table it already has; a DNN
`.SqlDataProvider` numbered below the installed package version never runs; `Content` .sql files
never reach a NuGet consumer.

### BPMN 2.0 importer (`0d93a33` … `3ffab4a`) — see `CLAUDE_HANDOFF_20260807_BPMN_IMPORTER.md`
Core importer + import endpoints on all three hosts. An adversarial review (5 lenses × 2 skeptics)
raised 37 findings, 20 survived, and five of them were the same shape: a mapping that produced a
workflow the engine would run **down the wrong branch, silently**. All fixed and re-tested.

### invoice-blue (`2b0c391`)
Fourth invoice skin. Two new generator switches (`headBand`, `sectionPill`); the other three
templates regenerate **byte-identical**, which is the contract of a re-runnable generator.

### C# scripting in workflows (`4db3c33`) — parked with research
`CLAUDE_PLAN_20260807_WORKFLOW_CSHARP_SCRIPTING.md`. The palette's "Script Task" is `SetVariable`
relabelled; Roslyn exists on Oqtane and Web only; the two places this codebase already stopped short
of runtime compilation both cite the missing sandbox. Options A/B/C are written up; owner deferred.

---

## 3. OPEN BUGS AND UNFINISHED WORK

### 🔴 Persona Bar → Submissions lands on a page that never loads
Reported with a screenshot: `/mfqa-admin/ctl/Submissions/mid/10599/formId/52` spins on
"Loading submissions…" forever.

Diagnosed, **not fixed**:
- The link is NOT bogus. `Submissions` IS a registered ModuleControl
  (`DesktopModules/MegaForm/Views/Submissions.ascx`) and `mid=10599` is a real MegaForm module on
  the `mfqa-admin` page. So the control renders — it just never finishes loading.
- Built by `MegaFormHostPageResolver.BuildControlUrl(host, "Submissions", formId)`
  (`MegaForm.PersonaBar/Services/MegaFormController.cs:128`).
- The owner wants it to go to **the submission dashboard's submissions view, filtered to that form**.
- The dashboard's own convention (`MegaForm.UI/src/dashboard/index.ts:170-212`) is
  `<dashboardPath>?mfFormId=<id>#mf-submissions`.
- ⚠️ I tested `http://megaclean008.ai/mfqa-admin?mfFormId=52#mf-submissions` and it rendered
  **form 52 as a public form**, not a dashboard — because module 10599 is NOT in
  `admin_dashboard` mode. `BuildDashboardUrl` already handles that case by routing through
  `ctl=FormList`. **Next step: test `ctl/FormList/mid/10599?mfFormId=52#mf-submissions` and, if it
  lands on the filtered submissions view, change `submissionsUrl` to that shape.**

### 🔴 Not started
1. **Publish invoice-blue to the gallery.** Live gallery is
   `https://CissSolution.github.io/megaform-gallery/manifest.json` → **47 templates**, invoice-blue
   not among them. Repo has 48. ⚠️ publishing must **pull first** — a stale local clone silently
   deletes other people's templates.
2. **An independent test page on `megaclean008.ai`** so the owner can check templates without the
   narrow QA pane (see §4).
3. **14 templates** (16 minus the 2 already shipped).

### 🔴 The browser QA driver is broken on this site
`tools/browser-qa/dnnshot.mjs`: login succeeds, then EVERY navigation lands on `chrome-error`,
through all four of its existing retries. A same-origin `fetch` from a loaded, authenticated DNN
page also throws "Failed to fetch". Direct Chrome navigation to the same URLs works, so it is not
the host-resolver rule. **Unresolved.** Work around it with PowerShell + a real forms-auth session
(recipe in §4).

`tools/browser-qa/dnn-api-post.mjs` was fixed (`71e911c`): it can now send `ModuleId`/`TabId` via
`MF_HEADERS`, it no longer swallows the evaluate exception, and it logs which page it is posting from.

---

## 4. RECIPES AND TRAPS LEARNED TODAY

### Authenticated DNN API call without a browser (works; the QA driver does not)
```powershell
$base='http://megaclean008.ai'
$login = Invoke-WebRequest -Uri "$base/Login" -SessionVariable s -UseBasicParsing -TimeoutSec 180
$form=@{}
foreach ($m in [regex]::Matches($login.Content,'<input[^>]*type="hidden"[^>]*>')) {
  $n=[regex]::Match($m.Value,'name="([^"]+)"').Groups[1].Value
  $v=[regex]::Match($m.Value,'value="([^"]*)"').Groups[1].Value
  if ($n) { $form[$n]=[System.Net.WebUtility]::HtmlDecode($v) } }
$form['dnn$ctr$Login$Login_DNN$txtUsername']='admin'
$form['dnn$ctr$Login$Login_DNN$txtPassword']='dnnhost'
$form['__EVENTTARGET']='dnn$ctr$Login$Login_DNN$cmdLogin'; $form['__EVENTARGUMENT']=''
$null = Invoke-WebRequest -Uri "$base/Login" -Method POST -Body $form -WebSession $s -UseBasicParsing
$page = Invoke-WebRequest -Uri "$base/mfqa-form" -WebSession $s -UseBasicParsing
$rvt=[regex]::Match($page.Content,'name="__RequestVerificationToken"[^>]*value="([^"]+)"').Groups[1].Value
$hdr=@{ 'RequestVerificationToken'=$rvt; 'ModuleId'='10603'; 'TabId'='1009'; 'X-Requested-With'='XMLHttpRequest' }
```
`ModuleId`/`TabId` are **required** — most MegaForm DNN endpoints sit behind `[DnnModuleAuthorize]`,
which resolves the module from those headers and answers 401 without them.

### Seeding a template onto a DNN site
1. Copy the JSON into `<site>\DesktopModules\MegaForm\Templates\`.
2. ⭐⭐ **Recycle the app pool BEFORE seeding.** The template catalog is cached in memory; without a
   recycle, `DevBulkCreateForms` seeds from the previously parsed copy and your change **silently
   does not land**. This cost several rounds today.
3. POST `/DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms` (needs `dev.lock` in the
   site root — already present on megaclean008). It upserts EVERY template in the catalog and
   returns each `formId`.
4. View at `http://megaclean008.ai/mfqa-form?mfFormId=<id>`.

### ⭐⭐⭐ An unbalanced CSS comment silently deletes the rule after it
Editing a comment left two `*/` for one `/*`. A CSS parser that meets garbage resyncs at the next
`}` — **so it swallows the rule that follows**. The rule stays in the file, stays visible in
devtools' source, and simply never applies. Braces stayed balanced the whole time, so the
generator's own check said OK while two features were quietly missing. `build-invoice-templates.mjs`
now checks comment balance and exits non-zero.

Corollary for diagnosing "my CSS is not applying": grep the SERVED page, not the source, and count
`/*` vs `*/` before blaming specificity or the theme bridge.

### Other traps hit today
- **`-match 'io-head-top'` on a page matches the CSS, not the markup.** That false positive sent me
  down a wrong path. Search for `class='<name>'` when you mean markup.
- **PS 5.1 `Get-Content -Raw` mangles a UTF-8 file** — a 6 KB BPMN posted as JSON came back 400.
  `[System.IO.File]::ReadAllText()` worked. (Already in memory as a rule; re-hit anyway.)
- Copying a file into `DesktopModules\` recycles the app pool; the next request can time out. Warm
  the site before the API call.
- Chrome headless needs `--host-resolver-rules="MAP <host> 127.0.0.1"` for the `.ai` QA hosts, and
  the flag works fine from `spawn` — the driver's failure is something else.

---

## 5. ENVIRONMENT

| | |
|---|---|
| QA site | `http://megaclean008.ai` — admin / `dnnhost`, IIS site + pool `DNN_MegaClean008`, path `E:\DNN_SITES\DNN_MegaClean008\Website`, DB `WINDOWS-11\SQLEXPRESS` / `DNN_MegaClean008` |
| MegaForm on it | **02.00.012** (upgraded from 2.0.10 today), 36 seeded forms, `dev.lock` present |
| invoice-blue | form **54** — `http://megaclean008.ai/mfqa-form?mfFormId=54` |
| Persona Bar repro | `http://megaclean008.ai/mfqa-admin/ctl/Submissions/mid/10599/formId/52` |
| Mock designs | `http://localhost:3000/forms` (Next.js dev server), source `form-builder-controls (10)` |
| Live gallery | `https://CissSolution.github.io/megaform-gallery/` — 47 templates (case-sensitive host) |
| Package | `MegaForm.DNN/Install/MegaForm_02.00.012_Install.zip`, built by `BuildPackage-DNN.ps1 -BuildDotNet -NoPause` |

⚠️ `mfqa-form` renders inside a **fixed ~410px pane**, so nothing there can be compared to a
934px-wide mock. That is exactly why the owner asked for an independent full-width test page.

---

## 6. SUGGESTED ORDER FOR THE NEXT SESSION

1. **Decide** (a) close-enough static conversions vs (b) build engine features 1–3 first. Everything
   below assumes the answer.
2. Build the **independent test page** on megaclean008 — needed to judge any template honestly.
3. **Publish invoice-blue** (pull the gallery repo FIRST).
4. **Family 0**: QA `register` and `festa-italiana` — pure verification, no code.
5. **Family 1 generator + 5 skins** — the best ratio in the batch; fix the cross-platform image path
   here, once.
6. Fix the **Persona Bar submissions link** (one URL-shape change once `ctl=FormList` is confirmed).
7. Family 2 only after the live-echo and recap scripts exist.

Still open from earlier sessions and NOT touched today: Track A has no end-to-end run; a large
untracked surface (`MegaForm.Umbraco`, `MegaForm.Umbraco.Host`) has never been `git add`ed and the
same pile carries dev databases and `appsettings.Development.json`, so it needs a secrets read first.
