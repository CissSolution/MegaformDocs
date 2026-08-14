# HANDOFF — AI assistant memory export (2026-06-29)

> This is a verbatim/consolidated export of the assistant's persistent working memory for the
> MegaForm inline-edit + PDF-grid work, written out so a human dev can read it (the memory itself
> lives in a private store the dev can't open). Companion deep-dive: **`CLAUDE_HANDOFF_20260629_INLINE_EDIT_ACTIONMENU_DESIGNNAV.md`** (esp. **§3.6 Phase-1 dev spec**).
>
> ⚠️ Memory entries are point-in-time notes. Some `file:line` citations may have drifted — verify against current code before trusting as fact.

---

## 0. USER CONTEXT
- Primary language **Vietnamese** — reply in VN.
- Prefers working **autonomously** ("tự làm đi"/"auto đi"), no per-edit confirmation.
- Prefers fixes in **form JSON / config** over C#/DLL builds when that suffices.
- Workflow = **deploy-to-live** (the live site is the deliverable); inline-edit.ts is intentionally **uncommitted/untracked**.

---

## 1. LIVE HOSTS + DEPLOY (reference)

### localhost:5000 (primary QA target this work)
- Site: `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\`, self-contained Kestrel **`Oqtane.Server.exe` (net10.0)** started directly (NO service/watchdog). Login **host / Minh@2002**.
- ⭐ **Module DLLs live at the SITE ROOT** (`MegaForm.Core.dll`, `MegaForm.Oqtane.{Client,Server,Shared}.Oqtane.dll`, `MegaForm.Sdk.dll`) and are **locked by the running exe**. NuGet install only refreshes `wwwroot\Modules\MegaForm\**` — NOT the root DLLs.
- **To apply a DLL change:** `Stop-Process -Name Oqtane.Server -Force` → copy DLL to site root → `Start-Process Oqtane.Server.exe -WorkingDirectory <site>` → poll `http://localhost:5000/` for 200. The exe can take **1–2 min** to start listening (poll `Get-NetTCPConnection -LocalPort 5000 -State Listen`).
- Renderer JS lives at `wwwroot\Modules\MegaForm\js\megaform-renderer.js`.
- Verify a DLL marker: `strings -el <dll> | grep <marker>` (.NET strings are UTF-16).
- Anon full render page for headless QA: `/api/MegaForm/render/{id}`.

### localhost:5070 (secondary dev host)
- Site `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3` → `http://localhost:5070`. SQL Server `Server=.\SQLEXPRESS;Database=Oqtane_MSSQL3`. Host pwd is in that site's `appsettings.json → Installation.HostPassword` (NOT Minh@2002).
- ⚠️ Two `Oqtane.Server.exe` run at once — match by `$_.Path` when stopping.

### Build + deploy flow
```
cd MegaForm.UI && node scripts/build-entry.cjs renderer    # → Assets/js/megaform-renderer.js (+ synced to platform wwwroots, NOT live)
# bump MegaForm.Oqtane.Shared/AssetVersion.cs (MegaFormAssetVersion.Current) on any JS/CSS change
dotnet build MegaForm.Oqtane.Shared -c Release             # net10.0 → Shared.Oqtane.dll  (AssetVersion)
dotnet build MegaForm.Core -c Release                      # ONLY if FormHtmlRenderer.cs changed → MegaForm.Core.dll
# deploy: stop exe → copy net10.0 Shared DLL (+ Core DLL if built) to live ROOT + renderer JS to live wwwroot → relaunch → verify 200 + version
```
A working deploy script template is in the session scratchpad (`deploy-b323.ps1` — rename ver per deploy). Typecheck: `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (one PRE-EXISTING error in `src/builder/workflow/wf-app.ts` is unrelated).

---

## 2. THIS SESSION (2026-06-29) — Live :5000 = **B325**, inline-edit badge **v20260629-11**

**User requests, in order:** (1) finish §7 backlog (composite sub-labels, background-image, au-field resize+premium drag, gallery picker); (2) per-block ACTION MENU on header+sections/steps in inline-edit = show/hide block + show/hide border; (3) DESIGN-mode free step nav incl. summary without filling/Next; (4) PDF-style grid for inline edit; (5) stop + hand to dev.

**Done + deployed B325 (uncommitted):**
- ✅ **Design-mode step nav** — browser-QA **PASS** (click "STEP 4 Review" in the Design Live Preview → jumps to summary, no fill/Next). `renderer/index.ts`: `goToStep`, `enablePreviewStepNav` (preview-only clickable step pills), `goNextPage` → `if(!config.isPreview && !validatePage)`. Gated to `config.isPreview` (builder iframe sets `__CFG.isPreview=true`). Form 9 = premium-native (`premiumNativePageBreak:true`).
- ✅ code-done, **NOT yet browser-QA'd:** composite sub-labels (`.mf-composite-sub` → materialize `widgetProps.parts` via imported `compositePartsFor`; C# `ResolveCompositeParts` also prefers stored `parts` → no C# change), background-image (scan bg≥120×80, literal URL swap across customHtml/customCss/customContent), gallery picker (built-in modal in the renderer bundle → `/api/MegaForm/Upload/List` + `/Upload/Image`; MFTokenDesigner is builder-only).
- ⚠️ **action menu** — menu UI QA'd (⚙ on `.au-head`/`.mf-steps`/steps/sections; toggles set attrs + Save pill). Persist round-trip **UNVERIFIED** (was blocked by the bug below). Persistence target moved from `customCss` (re-composed away by ModuleCssComposer) to a `<style id=mf-ie-blocks>` appended to **customHtml** (verbatim render channel).
- ❌ au-field standalone resize + premium free-drag — deferred (hard).

**⭐ CRITICAL data bug found (form 9):** `settings.postSubmitExperience.buttons` had **524288 (= 2¹⁹)** empty `{label:"",url:"",variant,newTab}` ≈ 30 MB → save entity 75 MB → POST "Failed to fetch". **2¹⁹ ⇒ exponential DOUBLING bug** (something does `buttons = buttons.concat(buttons)` each save). **REPAIRED form 9 data** (buttons→0, now 220 KB, POST 200) but the **SOURCE bug is UNFIXED** — find where `postSubmitExperience.buttons` is read+written (builder post-submit editor / showReview / buildSummaryRows). **Audit other premium forms** for the same bloat.

**Other tech issues:** (a) inline-edit `save()` serializes settings TWICE (`SchemaJson` contains `schema.settings` AND `SettingsJson`) → doubles payload; (b) **ModuleCssComposer** re-composes CSS from the page-embedded schema, so late `settings.customCss` edits persist but don't render → use customHtml `<style>` instead; (c) QA friction: Blazor 60s cold-start nav timeout (page still loads — re-check via evaluate), builder `beforeunload` dialogs block nav (accept them), exe 1–2 min to listen after a DLL swap, playwright-mcp profile `SingletonLock` needed clearing once.

---

## 3. ⭐ PDF-GRID (the active task handed to the dev)

**User saw resize "only works on row/columns" and asked for a real PDF-style grid.** The real 2-D grid exists = `.mf-flexgrid` / `.mf-flexgrid-item` (`renderFlexGridElement` inputs.ts:850; `FlexGrid` field type; `items[].placement.{lg,md,sm}.{x,y,w,h}` → CSS vars; megaform.css:225-256, lg/md/sm). Prior inline-edit resize drove only the WEAKER layout (`.mf-page` flow `data-width` 25/33/50/66/100% + Row `columns[].span`). On premium, fields are baked in customHtml (not `.mf-page` children) → only the schema Row resizes.

**Decisions made:**
- **Scope A** (true 2-D grid) + **LAZY migrate** (form stays as created; the FIRST layout drag/resize auto-converts it to a grid; text/image edits never convert).
- ⭐ **ARCHITECTURE = "Approach 2": keep fields FLAT + a presentation grid layer. DO NOT use the FlexGrid field type.** A go/no-go investigation proved nesting fields into `FlexGrid.items[].field` BREAKS the pipeline: `flattenFields` (TS `helpers.ts:89`, C# `MegaFormUtils.FlattenFields`) only recurses `Row.columns`, NOT `items[]` → validation, `collectFormData` (validation.ts:197), submission, `FormValidationService.cs:35`, and `{{summary}}` all SKIP nested fields. So instead: keep every field top-level in `schema.fields`; add `settings.layoutMode='flexgrid'` + per-field `field.placement.{lg,md,sm}.{x,y,w,h}` + wrap each `.mf-field-group` in a `.mf-flexgrid-item` (reuse the existing CSS). Fields stay flat → the whole pipeline is untouched.

**Per-archetype (Phase 1 = Standard + AI; Premium deferred):**
- **Standard** (flow `.mf-page`) — clean: migrate to grid (mirror the builder's `migrateRowToFlexGrid` pattern).
- **AI-design** — `applyDefaultPureGridShell` (`ai-form-creator.ts:1991`) emits a customHtml `.mfp mfp-pure-grid` CARD (flow inside), NOT a FlexGrid. Regrid the card BODY, keep the card chrome/theme.
- **Premium** — Codex `premium-native-migration.ts` already normalizes premium (controls→`{{field:KEY}}` tokens, steps→real Section+pageBreak, native nav, `premiumNativePageBreak=true`), so it's NOT impossible: regrid the field-area inside each `[data-step]`, KEEP the chrome — but the au-field field styling (icons/au-lbl/au-namerow) lives in customHtml, so FlexGrid-rendered fields would render as plain `.mf-field-group` (chrome stays, field look changes). Deferred — decide when reached.

**Build pointers (file:line) — full spec in handoff §3.6:**
- TS renderer: `renderStandardFields()` page-build loop `MegaForm.UI/src/renderer/index.ts:2267-2294` (create a `.mf-flexgrid` INSIDE `.mf-page` — do NOT co-class `.mf-page`, its `display:flex` beats `.mf-flexgrid`'s `display:grid`).
- C# parity: `RenderStandardFields()` `MegaForm.Core/Services/FormHtmlRenderer.cs:189-203` (Core DLL).
- Inline-edit grid editor: `MegaForm.UI/src/shared/inline-edit.ts` — tag `.mf-flexgrid-item`, drag-move (--lg-x/y), resize (--lg-w/h), snap, persist `field.placement.lg`.
- ⚠️ **FIRST thing the dev must confirm:** does the client REBUILD the fields container or HYDRATE the SSR DOM? → decides whether the C# parity is mandatory (grid won't show without it) or only anti-FOUC.
- Snap math to mirror (builder `canvas.ts startFlexGridResize` L2407): `totalGap=(cols-1)*gap; colPx=max(8,(rect.w-totalGap)/cols); dCol=round(dx/(colPx+gap)); dRow=round(dy/(rh+gap)); newW=clamp(startW+dCol,1,cols-x); newH=clamp(startH+dRow,1,12)`.
- Migration placement: `x=0, y=index, w` from data-width (100→12, 66→8, 50→6, 33→4, 25→3), `h=1`; `md=lg`; `sm={x:0,w:cols}` (full-width on mobile).
- PDF reference for the free 2-D drag/resize/snap model: `widgets/pdf-form-builder/renderer/FieldOverlay.ts` (`snapTo` L36, `attachDragResize` L350).

---

## 4. FOUNDATION — prior inline-edit session (live was B317→B322, badge v04→v09)

The inline-edit feature (`MegaForm.UI/src/shared/inline-edit.ts`, untracked) is a **post-render enhancement gated to host + Oqtane edit-mode** (`?edit=true` + admin dock). It edits the RENDERED form in place; a floating **Save pill** does a SAFE round-trip (GET `/api/MegaForm/Form/{id}` → apply pending edits → POST the WHOLE entity → reload). Public visitors get nothing.

**What worked before this session (deployed + QA'd across all archetypes):**
- TEXT: hero/brand/step labels/intros (shell in customHtml), field labels, Section titles, option labels (Cards/Radio/Checkbox/Select → `field.options[].label` by value), submit button text, shell `<img>` images (→ `settings.customContent[KEY]`).
- Field **RESIZE** (mouse + snap to a 12-col grid overlay, Alt=free): standalone flow fields via `field.width`→`data-width`; Row fields via schema `columns[].span`. Field **DRAG** reorder.
- ⭐ **Persistence required renderer parity:** the renderer must emit `data-width` from `field.width` in BOTH TS (`renderer/inputs.ts` + `index.ts`) AND C# (`FormHtmlRenderer.cs` ~L289) — standard forms SSR then HYDRATE the C# DOM. CSS `.mf-page` was changed to `flex-flow:row wrap` so `data-width` sizes width.
- ⭐ **SaveForm does a FULL-row EF Update + null-normalize** → the POST entity must echo EVERY `FormDto` column (~18, incl. `WorkflowJson`) or it gets nulled.
- ⭐ Both client + C# SSR emit `.mf-field-group[data-key]` (NOT data-mf-field-key) — that's the reliable field-key hook.
- Detailed prior handoff: `CLAUDE_HANDOFF_20260629_INLINE_EDIT_VISUAL_EDITING.md`.

---

## 5. NEXT STEPS FOR THE DEV (priority)

> ⭐ **AUTHORITATIVE ORDER after the user's 2026-06-29 source review = handoff §3.7:** Premium-JSON cleanup → buttons guard → QA premium → PDF-grid. Confirmed facts there: public SSRs-then-hydrates (C# SSR branch MANDATORY for the grid); festa/euro-youth premium JSON have malformed wrappers (`mf-custom-field` + empty shells) to fix first; intake-acme-ocean still needs native-izing. The list below is the older priority list — defer to §3.7's order.

1. **Confirm rebuild-vs-hydrate** (PDF-grid item above), then **build Phase 1** (Standard + AI) per handoff **§3.6** (Approach 2 — flat fields + `.mf-flexgrid` presentation layer; never move fields out of `schema.fields`).
2. **Fix the `postSubmitExperience.buttons` doubling bug** at its source + audit all forms for the bloat.
3. **Re-QA the action-menu persist** round-trip (now form 9 is repaired) — confirm the `<style id=mf-ie-blocks>` renders + applies on the public form, then revert test data.
4. **QA composite sub-labels / background-image / gallery** (use festa-italiana form 10 for bg + hero image; a dob/phone/name_plus composite form for sub-labels).
5. Consider **de-duplicating the settings blob** in the inline-edit save payload.
6. **Premium** PDF-grid decision (regrid field-area, keep chrome, accept au-field field-style change) — when reached.

---

## 6. PREMIUM FORM JSON + CODEX FILES — exact paths (for next-session review)

Repo root: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`

### 6.1 Premium FORM JSON (the actual forms — schema + settings + customHtml)
`Samples\FormTemplates\Premium\` — 5 files (73–96 KB each):
| File (relative to repo root) | premium-native (Codex) | Git state | Live form on :5000 |
|---|---|---|---|
| `Samples\FormTemplates\Premium\down-under-australia.json` | ✅ `premiumNativePageBreak:true` | **M (UNCOMMITTED)** | form 9 |
| `Samples\FormTemplates\Premium\festa-italiana.json` | ✅ | **M (UNCOMMITTED)** | form 10 |
| `Samples\FormTemplates\Premium\euro-youth-application.json` | ✅ | **M (UNCOMMITTED)** | (other id) |
| `Samples\FormTemplates\Premium\bulgaria-discovery-programme.json` | ✅ | **M (UNCOMMITTED)** | (other id) |
| `Samples\FormTemplates\Premium\intake-acme-ocean.json` | ❌ not native | clean | (other id) |

⚠️ The 4 native files carry **Codex's uncommitted premium-native normalization** (controls→`{{field:KEY}}` tokens, steps→Section+pageBreak, native nav, `premiumNativePageBreak:true`). **DO NOT clobber.** Last *committed* version is 2026-06-27 (MegaForm Docs Bot) — Codex's changes sit only in the working tree.

### 6.2 Codex premium-native migration SCRIPT (untracked)
- `MegaForm.UI\src\shared\premium-native-migration.ts` — `migratePremiumWizardSchemaToNative()` (the normalizer). Imports from `MegaForm.UI\src\shared\custom-html-insert.ts` (`replaceHardcodedControlsWithFieldTokens`, `parseWizardStructure`, `reflowWizardFieldTokensBySchemaPages`, `syncFieldPlaceholders`).

### 6.3 NOT the form JSON (easy to confuse) — AI KB guides for premium edit
- Source: `MegaForm.DNN\Resources\TemplateGuides\<name>.facts.json` + `<name>.guide.md` (5 each).
- Platform copy: `MegaForm.Web\wwwroot\Modules\MegaForm\Resources\TemplateGuides\<name>.facts.json`.
- (Both currently show as modified `M` in git.)

### 6.4 Seed migrations (load guides into the DB)
- `MegaForm.Oqtane.Server\Migrations\01060035_SeedTemplateGuides.cs`
- `MegaForm.Oqtane.Server\Migrations\01060036_SeedPremiumTemplateGuidesV2.cs`

### 6.5 How they reach a live form
No `.cs` under Server/Core reads the `FormTemplates` directory at runtime → these are **source templates** loaded via the builder template library / seed, not files the renderer reads directly. Live forms are DB rows in `MF_Forms` (`SchemaJson`/`SettingsJson`) built from these templates; edit a live form through the form API (`/api/MegaForm/Form/{id}`), not the JSON file.
