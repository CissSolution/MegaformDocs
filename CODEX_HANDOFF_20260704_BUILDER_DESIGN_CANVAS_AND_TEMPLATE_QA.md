# CODEX HANDOFF — 2026-07-04 — (1) Builder Design-mode canvas fix + inline canvas editing, (2) Continue template Visual QA vs mock

> Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
> Branch: `feat/theme-designer-picker-wizard-gallery-1.7.45` · Current build: **MegaForm 1.7.72** (packed + clean-install verified on :5111).
> Two independent tasks below. **Task 1 = MegaForm code (TS)**. **Task 2 = template JSON ONLY, do NOT touch MegaForm code.**

---

## 0. Accounts, sites, source, commands (everything you need)

### Sites / accounts (all password **`abc@ABC1024`** unless noted)
| Site | URL | Folder | DB (`.\SQLEXPRESS`) | User | Notes |
|---|---|---|---|---|---|
| **QA (has the 4 template forms)** | http://localhost:5100 | `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.NuGetTest` | `Oqtane_MegaForm_NuGetTest` | `host` | MegaForm 1.7.71. Runs `Oqtane.Server.exe` directly. Builder/Designer live here. |
| **Fresh clean install** | http://localhost:5111 | `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Verify1772` | `Oqtane_MegaForm_Verify1772` | `host` | MegaForm 1.7.72 nuget-only. |
| Live host :5000 | http://localhost:5000 | `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2` | — | `host` / **`Minh@2002`** | (different password) |
| **MOCK (design target)** | http://localhost:3101 | `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\4NewTemplateForms` | — | — | Next.js. Start: `cd "…\4NewTemplateForms" && npx next dev -p 3101`. Route `/` has a 4-template switcher (top bar) + React previews = the pixel-perfect design target. |

To (re)start a site: run its `Oqtane.Server.exe` (working dir = the site folder). To restart :5100 after deploying a nupkg: stop the exe by PID on port 5100 → drop the `.nupkg` into `…\Packages\` → relaunch the exe.

### The 4 premium templates (mock ↔ files ↔ live form)
| Mock switcher | slug | Samples (tracked source) | wwwroot (ship, gitignored) | accent |
|---|---|---|---|---|
| Project Intake & Onboarding | `project-intake-onboarding` | `Samples/FormTemplates/Premium/project-intake-onboarding.json` | `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/project-intake-onboarding.json` | teal `#0bb39b` |
| Event Registration & RSVP | `event-registration-rsvp` | …`/event-registration-rsvp.json` | …`/event-registration-rsvp.json` | amber `#f59e0b` (DARK theme) |
| Wellness & Patient Intake | `wellness-patient-intake` | …`/wellness-patient-intake.json` | …`/wellness-patient-intake.json` | green `#0f9d76` |
| Classic Car Show Registration | `classic-americana-registration` | …`/classic-americana-registration.json` | …`/classic-americana-registration.json` | red `#b0342a` (photo hero) |

⭐ **Both copies must stay identical.** Edit the Samples copy, then mirror to the wwwroot copy (a one-line `fs.copyFileSync`). Only the wwwroot copy ships in the nupkg (via the `wwwroot/Modules/MegaForm/**` wildcard). Samples is the git-tracked source of truth.

### Build / pack (sandbox blocks `cmd /c *.cmd` → pack manually)
```
# JS bundle rebuild (Task 1 changes TS): from MegaForm.UI
cd MegaForm.UI && node scripts/build-entry.cjs <entry>     # vite auto-syncs to Oqtane/Web/DNN wwwroots. Bundles are gitignored.
#   builder entry = the design canvas / inline-edit; theme-designer entry = the AI Designer panel.
# Full pack (only needed to ship): bump MegaForm.Oqtane.Client/ModuleInfo.cs Version (+ReleaseVersions)
#   + MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec <version>; then:
dotnet build MegaForm.Oqtane.Server/…Server.csproj -c Release   # builds Core/Shared too
dotnet build MegaForm.Oqtane.Client/…Client.csproj  -c Release
cp MegaForm.Oqtane.Server/bin/Release/net9.0/MegaForm.Core.dll  MegaForm.Oqtane.Server/bin/Release/net9.0/   # (already there)
cd MegaForm.Oqtane.Package && rm -f *.nupkg && "$USERPROFILE/.nuget/nuget.exe" pack MegaForm.Oqtane.nuspec -NoPackageAnalysis
```
For Task 1 iteration you usually only need `node scripts/build-entry.cjs builder` (and/or `theme-designer`) + hard-refresh the builder page — no full pack. ⭐ Bundle cache-bust `?v=` = `MegaForm.Oqtane.Shared/AssetVersion.cs` `Current` (bump it if the browser serves a stale bundle; today = `20260703-B360`).

### Headless screenshot harness (this is how Task 2 QA was done)
`playwright` (full) is installed under `qa5000/` and `playwright-core` under `MegaForm.UI/`. Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`. Put scripts **inside `qa5000/`** (so `import { chromium } from 'playwright'` resolves) or inside `MegaForm.UI/scripts/` (`playwright-core`). ⭐ Use FORWARD-SLASH paths in `.mjs` string literals — a bash heredoc eats one backslash and `\9…` crashes with "\\9 not allowed in strict mode". Login pattern (Oqtane): `goto /login` → fill `#username`/`#password` → click `button.btn-primary.col-6` (has text "login") → wait → `document.body.textContent` contains "Logout".

---

## TASK 1 — Builder **Design-mode (AI Designer) canvas**: fix blank/flicker + enable inline editing of labels **and images** in the canvas

### What the user reported (with screenshots)
- Open a template form in the builder: `http://localhost:5100/?mfpanel=builder&formId=<N>` → click the **AI Designer** tab (top toolbar) → the right rail is **Theme Designer** with a **Live Preview** in the middle.
- **RSVP form (dark theme, e.g. formId 47): the Live Preview canvas is BLANK** + a blue toast "**Unsaved changes — preview shows the last saved schema. Click Save to refresh.**". The form does not render at all.
- **Americana form (e.g. formId 49): renders, but every element is wrapped in a dashed-border box** (the inline-edit editable-element outlines) and it "nhảy nhảy" (flickers).
- **Goal:** the preview must reliably render the form (no blank, no flicker), AND the user must be able to **edit labels, images, and other content directly in the designer canvas** (WYSIWYG inline editing in design mode).

### Architecture — where the design-mode canvas lives (READ THESE FIRST)
1. **`MegaForm.UI/src/builder/canvas.ts`** — the builder canvas that hosts the Live Preview.
   - `~line 580-624`: when Theme/Design mode opens, it **hides the sibling builder children** (`data-mf-builder-hidden`) and inserts an **`<iframe class="mf-theme-preview-frame">`**. It shows the "Unsaved changes — preview shows the last saved schema" toast when **`isSchemaDirtyForPreview()`** is true (`~line 615-621`). ⭐ This is the toast in the RSVP screenshot → the preview is loading the **last SAVED schema**, not the in-memory edits.
2. **`MegaForm.UI/src/theme-designer/index.ts`** — the Theme Designer panel + the srcdoc preview.
   - `~line 1280-1360`: builds `frame.srcdoc` = a full HTML doc that links `css/megaform.css` + `css/megaform-widgets.css` + theme css + injects `window.__CFG={formId, schema:<previewSchema>, settingsJson:<buildResolvedSettingsForPreview(previewCustomHtml)>, themeJson, isPreview:true, …}` and runs **`MegaFormRenderer.init(window.__CFG)`** from `js/megaform-renderer.js`.
   - `previewSchema` = the last saved schema; `buildResolvedSettingsForPreview()` resolves customHtml/customCss/theme for the iframe.
   - `frame.onload` (`~1291`) calls `flushLiveStateToPreview()` + `__MFI.importCustomCss(...)` + `structureTree.refreshSoon()`.
   - Live CSS-var / inspector edits are written into the iframe **without a full reload** (`~1735-1780`, `td-live-overrides` / `mfi-lo` style tags) — a full `srcdoc` reload wipes them, hence the careful onload logic.
3. **`MegaForm.UI/src/shared/inline-edit.ts`** — the inline WYSIWYG editor (the dashed-border overlays).
   - Header comment (line 1-48): activates **ONLY inside the builder DESIGN-tab Live Preview iframe** (`isPreview:true`). Lets the host click text on the rendered form and edit in place: **shell strings** (hero headline / brand / step labels / step headings / intros baked into `settings.customHtml`) via a **text-only swap** (`shared/html-text-swap.ts` — tag tree + customCss stay byte-identical), and **field / Section labels** → `field.label`. Edits accumulate; a floating **Save pill** posts to the PARENT builder (merge + mark dirty) instead of the DB (`isPreview` path). `compositePartsFor` from `@renderer/helpers` keeps composite sub-labels parity-safe.
   - **Images are NOT yet inline-editable** — this is the new capability to build (see below).
4. Related: `MegaForm.UI/src/builder/theme-tab-adapter.ts`, `theme-left-rail.ts`, `theme-designer/inspector*.ts` (the right-rail Inspector — "Pick element" + per-property editors, incl. the CSS element picker from 1.7.45).

### Likely root-causes / where to look (hypotheses — verify by debugging in the browser)
- **RSVP blank:** the preview iframe renders the **last saved schema** (not in-memory). If the form was opened but the current schema differs, `isSchemaDirtyForPreview()` fires the toast AND the iframe may render an empty/older schema. ALSO: RSVP is a **dark, premium-native multi-step shell** (`.mfp-native-generated` + `data-mf-native-page`, paging driven by `renderer/index.ts` `updatePremiumNativeShellState()`). In the srcdoc preview the renderer must run the same premium-native paging; if it doesn't (or the dark card sits on a transparent iframe body and the step-hide CSS `.mfp-page{display:none}` hides all pages because no `.is-active` gets set), the canvas is blank. **Check:** open DevTools on the preview iframe, look for a render error, whether `#mf-mount` has children, whether any `.mfp-page` has `.is-active`, and whether `MegaFormRenderer.init` ran. Compare a WORKING light template (intake) vs RSVP.
- **Americana dashed overlays + flicker:** the dashed borders are inline-edit's editable-element markers (injected `<style>` in `inline-edit.ts`). The flicker is likely the **srcdoc reload loop** — every live edit / inspector change that triggers a full `srcdoc` rebuild re-runs `MegaFormRenderer.init` + re-attaches inline-edit → visible reflow. Reducing full `srcdoc` reloads (prefer the live-write path at `theme-designer/index.ts:1735-1780`) and debouncing will kill the flicker.
- ⭐ The whole preview must use the **same renderer path + customCss + DOM shape as live** (comment at `theme-designer/index.ts:1309-1311`). Any preview-only shell wrapper causes preview/live drift.

### What to build (Task 1 deliverables)
1. **Reliable render:** the AI Designer Live Preview must render ALL 4 templates (esp. the dark RSVP) without going blank. Fix the last-saved-vs-in-memory schema handling so the preview reflects the CURRENT builder schema (or make "Unsaved changes" auto-refresh), and ensure the premium-native paging runs in the srcdoc iframe (first `.mfp-page` visible).
2. **No flicker:** debounce / avoid full `srcdoc` reloads on every keystroke/inspector tweak; use the live-write path where possible.
3. **Inline canvas editing of labels (fix) AND images (new):**
   - Labels/text already work via `inline-edit.ts` — make sure it stays attached across preview updates (no flicker/detach).
   - **Images:** allow clicking an `<img>` / CSS `background-image` element in the canvas → open the existing image picker (reuse the builder's upload/gallery — see `MegaForm.UI/src/builder/icon-palette.ts` for the emoji/icon popover pattern and the dashboard image upload) → swap the `src` / `--mf-hero-image` / `background-image` URL in `settings.customHtml` / `settings.customCss` via the same text-only swap mechanism, and persist through the Save pill. E.g. the americana hero uses `--mf-hero-image:url('/Modules/MegaForm/img/vintage-americana-header.png')` — the user should be able to click the hero and replace that image.
4. Keep the safety invariant from `inline-edit.ts`: post-render enhancement only; a bug must never affect a public form visitor.

### How to verify Task 1
Open each of the 4 template forms in the builder (`?mfpanel=builder&formId=<N>` → AI Designer), confirm the preview renders (not blank), edit a label + swap an image, click Save, reload → the change persisted. Headless: drive it with playwright (login → goto builder URL → click AI Designer → screenshot the preview iframe). ⭐ You may need `node scripts/build-entry.cjs builder` + `theme-designer` and a hard refresh after each TS change.

---

## TASK 2 — Continue **Visual QA of the 4 templates vs the mock** (⚠️ TEMPLATE JSON ONLY — do NOT modify MegaForm code)

### Status (already done — 2 QA rounds, commits `303d425` + `7d8edc6`)
All 4 templates were converted from the mock and pixel-QA'd for **step 1** of each form: paging, accent colours, hero title colour, dark-theme (rsvp), americana tokens+hero image, step-heads (eyebrow/title/intro from the mock), stepper active-fill, and the **form card** (max-width + radius + shadow + bg + centering) — see `CLAUDE_HANDOFF_20260704_SECURITY_TEMPLATES_NUGET_VERIFY.md` for the full method. **Step 1 matches the mock card ~100% at 1280px.**

### What remains (your job)
Deep pixel-diff of **steps 2, 3, 4** of every form (option cards, chips, radios, selects, file upload, rating, review page) — step-1 was QA'd in depth, steps 2-4 only lightly. Fix any drift **in the template JSON only**.

### The constraint (critical)
- Edit **`Samples/FormTemplates/Premium/<slug>.json`** then mirror to the wwwroot copy. **Do NOT change any `.cs` / `.ts` MegaForm renderer/shell code.** All the fixes so far are pure data/CSS inside the template's `customHtml` / `customCss`.
- The template's `customCss` is scoped to `.mfp.mfp-<slug>`. To beat MegaForm's `CustomShellCompatibilityCssService` `!important` defaults, use the **3-class root** `.mfp.mfp-<slug>.mfp-native-generated` (specificity (0,3,0) > the service's (0,2,0)); use a 4-class prefix (`.mf-form-wrapper .mfp.mfp-<slug>.mfp-native-generated`) to beat its NOINNER background (0,3,0). Existing overrides are grouped in `/* MF-QA-*-vN */ … /* END-… */` blocks at the end of each `customCss` — add new ones the same way.

### The QA loop (exactly what was used)
1. Start the mock: `cd "…\4NewTemplateForms" && npx next dev -p 3101`. Its `/` has the 4-template switcher; the React preview components in `4NewTemplateForms/components/megaform-preview*.tsx` are the **pixel source of truth** (step text, colours, sizes, card metrics all live there — grep them).
2. On :5100, create a fresh form from a template via the API (host login), then render it standalone and screenshot:
   - **Create:** `POST http://localhost:5100/api/MegaForm/Form?authmoduleid=36&authsiteid=1` with `credentials:'include'`, body `{ModuleId:36,SiteId:1,Title,Description,SchemaJson,SettingsJson,ThemeJson:'',Status:'Published',SubmitButtonText:'Submit',RulesJson:'[]',WorkflowJson:'',EnableCaptcha:false,RequireAuth:false,EnableSaveResume:false, …}`. Build `SchemaJson = JSON.stringify({version:'1.0', fields: tpl.fields, settings, customScripts, submitButtonText:'Submit'})` and `SettingsJson = JSON.stringify(settings)` where `settings = {...tpl.settings, multiPage:true, customHtml:tpl.customHtml, customCss:tpl.customCss, customScripts:tpl.customScripts, theme:tpl.theme}`. Returns `{formId}`.
   - **Render (anon full page):** `http://localhost:5100/api/MegaForm/render/{formId}` — this uses the REAL runtime renderer (same as a live page). Screenshot at viewport **1280×1000, deviceScaleFactor 1, fullPage:true**.
   - To reach steps 2-4, click the shell's Next button: `.mfp-btn-next` / `[data-mf-native-next]` (the renderer binds `[data-mf-native-next]` → `goNextPage`), wait, screenshot.
3. Compare the live screenshot to the mock (switch the mock tab to the same template). Read the mock's element metrics from the DOM (`getComputedStyle`) for exact px/colour values. Fix `customCss` in the template JSON. Re-create the form, re-render, re-screenshot. Iterate.
4. ⭐ Section fields are the page markers (`data-mf-native-page` in customHtml + `properties.pageBreak` in schema). A generated section (`premiumNativeStep:true`) with NO `{{field:step_X}}` placeholder does NOT orphan. The mock's per-step heading is authored as static markup in each `.mfp-page`/`.mfp-page-head` (eyebrow "STEP X OF 4" + title + intro) — NOT via `{{field:step_X}}` (that renders the unwanted Section label).

### Mock step data already extracted (verbatim, for reference)
- **intake** (title + intro, no eyebrow): S1 "Let's get to know you" / "Tell us who you are so we can personalise your experience." · S2 "Tell us about your project" / "Share the high-level details so we can match you with the right team." · S3 "Scope, timeline & budget" / "Help us understand the scale of your project so we can put together the best proposal." · S4 "Almost there!" / "Add any files, extra notes, and rate how urgent this project is."
- **wellness** (eyebrow "Step X of 4" + title + intro): S1 "Let's start with the basics" · S2 "Your health background" · S3 "A little about your lifestyle" · S4 "Book & confirm".
- **rsvp** (eyebrow + title + intro): S1 "Who's attending?" · S2 "Choose your ticket" · S3 "Logistics & accessibility" · S4 "Almost done — confirm your spot".
- **americana** (eyebrow + title + intro): S1 "Register your ride" · S2 "Tell us about the machine" · S3 "Pick your package" · S4 "Last stop before the open road".
- Mock card metrics (from mock DOM): intake 900px · rsvp 1040px dark (bg `rgb(15,15,19)`) · wellness 720px (bg `rgb(244,250,247)`, radius 24) · americana 720px (bg `rgb(246,239,226)`, radius 14, hero clipped `overflow:hidden`).

### After QA
Mirror Samples → wwwroot, `git add` the 4 Samples JSONs, commit. If you want it in the package, re-pack 1.7.72 (templates are wwwroot JSON, no DLL change) — the `wwwroot/Modules/MegaForm/**` wildcard picks them up. Fresh-install re-verify on :5111 = reset the DB (`DROP DATABASE Oqtane_MegaForm_Verify1772`), drop the new nupkg into `…Verify1772\Packages\`, relaunch the exe, then check the seeded `wwwroot/Modules/MegaForm/Templates/<slug>.json` carries your markers + catalog `GET /api/MegaForm/BuilderTemplates/List` returns the 4 slugs.

---

## Reference docs in the repo
- `CLAUDE_HANDOFF_20260704_SECURITY_TEMPLATES_NUGET_VERIFY.md` — the full 1.7.72 session (security + templates + both QA rounds + nuget verify). ⭐ Read the "SECOND QA ROUND" section for the exact CSS-specificity tricks and the card mechanism.
- `Docs/SECURITY_P1_P2_P3_REMEDIATION_2026-07-03.md` — what security is done/deferred (not your task, context only).
- Memory: `…/memory/project_20260704_security_p1p3_templates_nuget_1772.md`.
- Inline-edit history (Task 1 context): memory files `project_20260630_inline_edit_into_design_tab.md`, `project_20260629_inline_edit_actionmenu_designnav.md`, `project_20260629_inline_edit_all_forms_hardening.md` (⭐ field-key via `.mf-field-group[data-key]`; resize/drag 12-col snap).
