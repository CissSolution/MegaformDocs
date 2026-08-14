# HANDOFF — Inline-edit (composite/bg/gallery/action-menu) + Design-mode step-nav + a CRITICAL data-corruption bug

> **Date:** 2026-06-29 (session after the B313→B322 inline-edit session).
> **Live:** `:5000` (Oqtane.10_new2, host / Minh@2002) = **AssetVersion `20260629-B325`**, inline-edit badge **`v20260629-11`**.
> **Main files:** `MegaForm.UI/src/shared/inline-edit.ts` (untracked), `MegaForm.UI/src/renderer/index.ts` (tracked), `MegaForm.Oqtane.Shared/AssetVersion.cs`.
> **Status:** code BUILT + DEPLOYED to live :5000. Design-mode step-nav is browser-QA'd PASS. The rest is code-complete but QA was interrupted by a critical pre-existing data bug (see §3.1). User asked to PAUSE and write this handoff.

---

## 0. WHAT THE USER ASKED THIS SESSION (requirements, in order)

1. **Finish the §7 inline-edit backlog.** User explicitly chose **ALL FOUR** remaining items:
   - (A) Composite **sub-labels** — the gray Gravity-style hints under composite parts (date "Day/Month/Year", name "First/Last", phone parts…).
   - (B) **Background-image** inline edit — hero/section CSS `background-image`, not just `<img>`.
   - (C) **au-field standalone resize + premium free-drag** — the hard tail.
   - (D) **Gallery picker** — a real image picker on the rendered form (not `window.prompt`).
2. **Per-block ACTION MENU** (screenshot: circled the form header + the step indicator). In inline-edit mode, add a ⚙ action menu on the **header** and the **sections/steps** to toggle settings like **show/hide block** and **show/hide border**.
3. **Design-mode free step navigation** (screenshot: builder Design tab `?edit=true&mfpanel=builder&formId=9`, circled steps 2/3/4). In the **Design Live Preview**, let the user click through any step — **including the summary/review** — **without filling fields or pressing Next**.
4. **PAUSE and write this handoff** of requirements + technical issues.

---

## 1. STATUS OF EACH REQUIREMENT

| # | Item | Code | Deployed | Browser-QA | Notes |
|---|---|---|---|---|---|
| 3 | **Design-mode step nav** | ✅ | ✅ B324 | ✅ **PASS** | Verified: clicking "STEP 4 Review" in the Design preview jumps straight to the Review summary (all rows visible) with no field entry / no Next. Gated to `config.isPreview` → public form unchanged. |
| A | **Composite sub-labels** | ✅ | ✅ B325 | ⏳ not QA'd | No composite form on :5000 to test on (form 9 has none). Code: scan `.mf-composite-sub` → persist `field.widgetProps.parts[].sublabel` by **materializing the full parts array** via the renderer's own `compositePartsFor` (renderer is all-or-nothing on `widgetProps.parts`). C# SSR also prefers stored `parts` → **no C# change needed**. |
| B | **Background-image** | ✅ | ✅ B325 | ⏳ not QA'd | Scans sizeable elements (≥120×80) with a real `url(...)` background; swaps via the picker; persists by a **literal URL swap across customHtml + customCss + customContent**. |
| D | **Gallery picker** | ✅ | ✅ B325 | ⏳ not QA'd | Lightweight modal built INTO the renderer bundle (the builder's `MFTokenDesigner` is builder-only). Calls the same endpoints: `GET /api/MegaForm/Upload/List`, `POST /api/MegaForm/Upload/Image`. Has search + upload + paste-URL. |
| 2 | **Per-block action menu** | ✅ | ✅ B325 | ⚠️ partial | Menu UI QA'd: ⚙ appears on header (`.au-head`), steps bar (`.mf-steps`), step panels, sections; opens a popover "Ẩn khối / Tắt viền"; toggling sets the live preview + save pill. **Persist round-trip NOT verified** — blocked by the data bug in §3.1 (form 9 saves were failing). Re-QA now that form 9 is repaired. |
| C | **au-field standalone resize + premium free-drag** | ❌ deferred | — | — | Genuinely hard (needs customHtml grid restructuring / `{{field:}}` token reflow that risks corrupting premium templates). **Row resize (First/Last name) already works** from the prior session, which covers the common premium case. |

---

## 2. WHAT WAS BUILT (architecture / where the code is)

### 2.1 Design-mode step nav — `MegaForm.UI/src/renderer/index.ts`
- The builder **Design Live Preview** renders the form in an iframe with `window.__CFG.isPreview = true` (canvas.ts) → `config.isPreview` is the design-mode flag, already plumbed.
- **`goNextPage()`** (~L2479): `if (!config.isPreview && !validatePage(...)) return;` — preview skips the per-step required-field gate. Public form still gated.
- **`goToStep(idx)`** (new, after goNextPage): sets `currentPage = idx; updateNavigation(); scrollToTop();`. `updateNavigation()` drives both standard `.mf-page` panels AND premium-native `.au-page.is-active` (via `updatePremiumNativeShellState`).
- **`enablePreviewStepNav()`** (new): preview-only; makes every step pill clickable (`.mf-step[data-step]`, `.au-step/.bg-step/.ey-step/.fi-step[data-step]`, `[data-mf-native-step]`) → `goToStep`. Called at the END of render (after `initInlineEdit`).
- Form 9 (down-under) is **premium-native** (`premiumNativePageBreak:true`, no `canProceed` script) → the renderer drives nav, so this works. (A legacy `canProceed`-script wizard mode exists too but form 9 is not it.)

### 2.2 Inline-edit features — `MegaForm.UI/src/shared/inline-edit.ts`
New pending sets in `STATE`: `pendingCompositeSub`, `pendingBlocks`. Reuses `pendingImages` for bg.
- **Composite sub-labels:** scan pass 1e tags `.mf-composite-sub` (field key from `.mf-composite[data-key]`, part key from the cell's `[data-mf-part]` control). `onBlur` kind `composite-sub`. `applyCompositeSubs()` materializes the full `parts` array (deep-cloned via `import { compositePartsFor } from '@renderer/helpers'`), sets the edited part's `.sublabel`, writes `field.widgetProps.parts`.
- **Background-image:** `enableImageEdit()` also scans bg-image elements; `bgUrlOf`, `onBgClick`, `commitBg` (stores old→new in `pendingImages`, maps origin-stripped variant too). `applyImageSwaps()` now also swaps `settings.customCss`.
- **Gallery picker:** `openMfGalleryPicker(current, onPick)` + `fetchMfGallery` + `uploadMfImage`. `pickImageUrl()` chooses MFTokenDesigner → built-in gallery → prompt.
- **Per-block action menu:** `enableBlockActions(root)` tags header/steps/sections with `data-mf-ieblk` (a stable scoped selector `#mf-form-wrapper-N <part>`) + a ⚙ button. `openBlockMenu` toggles `hidden`/`noBorder`. `applyBlockVisual` neutralizes hidden blocks in edit-mode (`display:revert` inline) so they stay toggle-able. `readPersistedBlocks` reads state back from the rendered `<style>`.

### 2.3 Build + deploy (proven this session)
```
cd MegaForm.UI && node scripts/build-entry.cjs renderer     # → Assets/js/megaform-renderer.js (+ synced to platforms)
# bump AssetVersion.cs + inline-edit badge
dotnet build MegaForm.Oqtane.Shared -c Release              # net10.0 DLL
# deploy script: scratchpad/deploy-b323.ps1  (stop exe → copy net10 Shared DLL + renderer JS → relaunch → verify)
```
Live runtime is **net10.0**. Deploy = `MegaForm.Oqtane.Shared.Oqtane.dll` (live root) + `megaform-renderer.js` (live `wwwroot/Modules/MegaForm/js/`). **No Core DLL change this session.**
The exe can take **1–2 min** to start listening after a swap — poll `Get-NetTCPConnection -LocalPort 5000 -State Listen`.

---

## 3. TECHNICAL ISSUES (the important part)

### 3.1 🔴 CRITICAL — `postSubmitExperience.buttons` EXPONENTIAL DOUBLING BUG
- **Symptom:** every inline-edit save on **form 9** failed with `TypeError: Failed to fetch` (server reset the connection on an oversized POST body).
- **Root cause:** `settings.postSubmitExperience.buttons` contained **524288 = 2¹⁹** identical EMPTY button objects (`{label:"",url:"",variant:"primary",newTab:false}`) ≈ **30 MB**. That made `settingsJson` and `schemaJson` ~30 MB each → the POST entity ≈ **75 MB** → rejected.
- **`2¹⁹` is the smoking gun:** the array is being **doubled on each save** (e.g. `buttons = buttons.concat(buttons)`, or a copy of the array pushed into itself) — ~19 saves to reach 524288.
- **REPAIRED this session:** a targeted POST removed all empty buttons (524288 → 0). Form 9 is now **220 KB and saveable** (verified POST 200). The repair also cleaned a stale `mf-ie-blocks` region left in customCss by an earlier build.
- **⚠️ The SOURCE bug is NOT fixed** — it will recur. **Find where `postSubmitExperience.buttons` is read-then-written** (builder post-submit settings editor / `showReview` / `buildSummaryRows` / a settings normalize path). Look for an append/concat that includes the existing array. Grep: `postSubmitExperience`, `\.buttons`, `buttons.concat`, `buttons.push`, `[...buttons`.
- **Audit the other premium forms** (10/16/22/etc.) for the same latent bloat before they hit the size limit.

### 3.2 🟠 Inline-edit save DOUBLES the settings blob in the POST
- `save()` in inline-edit.ts builds the entity with BOTH `SchemaJson: JSON.stringify(schema)` (where `schema.settings = settings`) **and** `SettingsJson: JSON.stringify(settings)`. The full settings object is serialized **twice** per save. This is what turned a 30 MB field into a 75 MB POST.
- Fix idea: strip `schema.settings` before `JSON.stringify(schema)` (the server reads `SettingsJson` as the authority), or stop echoing one of them. This is also a general payload-size win.

### 3.3 🟠 `ModuleCssComposer` — `settings.customCss` edits do NOT reach the rendered DOM
- Block overrides first written to `settings.customCss` **persisted to the DB but never appeared** in the rendered `<style id="mf-custom-css-N">`. The page CSS is composed (the client rebuilds CSS from the page-embedded schema; `MegaForm.Core/Services/ModuleCssComposer.cs` re-composes server-side). A late customCss append is dropped/re-composed away.
- **FIX applied (B325):** persist block overrides as a delimited **`<style id="mf-ie-blocks">…</style>` appended to `settings.customHtml`** — customHtml is emitted verbatim (the same channel the proven text/image edits use). Falls back to customCss only when there is no customHtml shell.
- **UNVERIFIED end-to-end** because form 9 saves were blocked by §3.1. Now that form 9 is repaired, **re-QA**: toggle hide/border → save → reload → confirm `<style id="mf-ie-blocks">` renders + the rule applies on the PUBLIC (no-edit) form → revert.

### 3.4 🟡 QA-environment friction (for whoever continues)
- Blazor cold-start makes Playwright `navigate` exceed the 60 s wait (the page still loads — re-check via `browser_evaluate` with an internal retry loop).
- Builder pages raise **`beforeunload` dialogs** that block navigation → handle with `browser_handle_dialog {accept:true}` (sometimes twice).
- The self-contained `Oqtane.Server.exe` can take **1–2 min** to start listening after a DLL swap.
- The playwright-mcp browser profile lock (`ms-playwright-mcp/mcp-chrome-*/SingletonLock`) needed manual clearing once (kill orphaned chrome + remove `Singleton*`).

---

## 3.5 🟠 "PDF-STYLE GRID" FOR INLINE EDIT — status, the gap, and the correct approach

> The user asked: how is the **PDF-form-style grid** for inline edit (and applying it to the form) being solved, where does it stand, and noted that **resize was only wired to Row/columns** — which is correct.

### What the PDF grid actually is
`MegaForm.UI/src/widgets/pdf-form-builder/renderer/FieldOverlay.ts` is a **free 2-D absolute** editor: each field has `{x, y, width, height}` (PDF units × cssScale), `attachDragResize` gives **move** (x/y) + **4 corner handles** (resize w/h), and `snapTo(value, grid)` snaps every edge to a pixel grid (Alt bypasses). True 2-D placement + 2-D resize + snap.

### The web-native equivalent ALREADY EXISTS in the codebase — but inline-edit doesn't drive it
There are **two different grid mechanisms** in the form renderer, and the prior inline-edit work was wired to the WEAKER one:

1. **`.mf-flexgrid` — the real 12-col 2-D grid** ("Umbraco Block-Grid-style", `Assets/css/megaform.css:225-244`, `inputs.ts renderFlexGridElement` L850). A `FlexGrid` field type holds `items[]`, each with `placement.{lg,md,sm}.{x,y,w,h}` → rendered as CSS grid cells via `--lg-x/--lg-w/--lg-y/--lg-h` (`grid-column: x / span w; grid-row: y / span h`), **responsive** across lg/md/sm. This is exactly the web analog of the PDF grid: per-field 2-D position + span on a 12-col grid. **Inline-edit does NOT touch `.mf-flexgrid-item` at all.**

2. **`.mf-fields-container > .mf-page` flow + `data-width`** (`megaform.css:1925-1956`). Flex row-wrap; a field's horizontal size is a **coarse 1-D `data-width`** snapped to **25/33/50/66/100%** (= 3/4/6/8/12 cols). Plus **Row** fields (`.mf-row-column`, CSS-grid `columns[].span`).

**The prior session's inline-edit resize/drag was built on #2 only:** standalone-field `data-width` (1-D width, 5 steps) + Row `columns[].span` + vertical reorder. It reuses the PDF `snapTo` *concept* but it is **not** the 2-D FlexGrid. So:
- On **premium** forms (e.g. form 9) the standalone fields are baked full-width inside the customHtml shell (`au-field` labels) — they are NOT `.mf-page` children, so `layoutEligibleFields()` skips them → **only the schema Row (first/last name) resizes.** ⇐ exactly what the user observed.
- On **standard** forms standalone width-resize does work (QA'd form 24: 50%→441px) but it's coarse 1-D, not a grid.
- **`.mf-flexgrid` forms get nothing** from inline-edit.

### Verdict
The user is right: the current implementation is **Row-span + coarse flow-width**, not a PDF-style grid. The genuine 2-D grid (`FlexGrid`) exists in the renderer/CSS/schema but **inline-edit was never wired to it**, and most forms aren't laid out as a FlexGrid.

### Correct approach (proposed — NOT YET BUILT)
Wire inline-edit's drag/resize to the **FlexGrid** model, mirroring `FieldOverlay`:
1. Tag `.mf-flexgrid-item` for edit: **drag** to move → set `--lg-x/--lg-y`; **edge/corner handles** to resize → set `--lg-w/--lg-h`; snap to the 12-col grid (Alt = free). Live-preview by mutating the CSS vars.
2. **Persist** to the field's `items[i].placement.lg.{x,y,w,h}` (and derive md/sm, or keep sm = full-width stack). Round-trips through the same SAFE GET→apply→POST.
3. **C# SSR parity:** `FormHtmlRenderer` must emit the same `--lg-*` vars from `placement` (verify it does) so the hydrated DOM matches.
4. To give EVERY form this grid (not just `FlexGrid`-typed ones), fields must live in a FlexGrid layout — i.e. **convert** the flow/`data-width` shell (and, harder, premium `au-field` customHtml) into FlexGrid items. That conversion is the substantial part (premium customHtml has no per-field grid slots).

### Decision — ✅ user chose **Scope A** (2026-06-29)
- **Scope A (CHOSEN):** drive the existing `.mf-flexgrid` from inline-edit (true 2-D, responsive, snap-to-12-col), persist `items[].placement.lg.{x,y,w,h}`, and migrate the flow layout into FlexGrid. Premium customHtml stays Row-span until its shell is converted.
- Scope B (extend coarse `data-width` resize to premium au-field) and Scope C (absolute px like PDF — breaks responsive/a11y) were rejected.

### Build plan for Scope A (phased)
- **Phase 1 — FlexGrid inline editor (core):** in inline-edit.ts, tag `.mf-flexgrid-item`; **drag** to move → live-mutate `--lg-x/--lg-y`; **edge/corner handles** to resize → `--lg-w/--lg-h`; **snap to the 12-col grid** (Alt = free), reusing the PDF `FieldOverlay.snapTo` model but on CSS-grid cells. Persist to the FlexGrid field's `items[i].placement.lg.{x,y,w,h}` via the SAFE GET→apply→POST. Verify **C# SSR parity** (`FormHtmlRenderer` must emit the same `--lg-*` from `placement`). Test on a form that uses a FlexGrid field.
- **Phase 2 — migrate flow forms → FlexGrid:** convert the `.mf-page` + `data-width` flow shell (and later premium `au-field` customHtml) into FlexGrid items so EVERY form gets the grid. Bigger + riskier; do after Phase 1 is proven.

### Confirmed FlexGrid facts (map done 2026-06-29)
- **Schema (runtime-only, untyped):** `FlexGridItem { id, field, placement:{lg,md,sm}:{x,y,w,h} }` + `field.gridConfig:{cols,rowHeight,gap}` + `field.items[]` (`inputs.ts:836-842`). NOT in `core/types.ts` enum nor `FormSchema.cs` — stored as loose JSON.
- **C# SSR parity: ❌ NONE.** `FormHtmlRenderer.cs` has zero FlexGrid logic → **FlexGrid is CLIENT-ONLY**. A FlexGrid form would NOT server-render (first-paint empty until JS hydrates → FOUC / breaks the project's SSR-parity goal). **Making FlexGrid production-grade requires a C# FormHtmlRenderer FlexGrid branch (Core DLL change).**
- **Live usage: ❌ ZERO.** No seeded/template form uses FlexGrid; it's a builder-addable widget only.
- **AI "pure-grid" ≠ FlexGrid.** `applyDefaultPureGridShell` (`ai-form-creator.ts:1991-2028`) emits a customHtml `.mfp mfp-pure-grid` CARD (flow fields inside, `{{field:key}}` tokens, theme `pure-grid-premium`), NOT a `.mf-flexgrid`.
- **⭐ The BUILDER ALREADY HAS the grid editor** (`canvas.ts`): `startFlexGridResize()` (L2405-2460) — `.mf-fg-handle-e/-s/-se`, snap math `dCol=Math.round(dx/(colPx+gap))`, breakpoint-aware (lg/md/sm tabs), writes `placement[bp].w/h`, live `--lg-*`, persists via `syncSchemaToHtmlImmediate`. Plus `insertFlexGridItemAt()` (drag-into-grid, snaps x/y), and **`migrateRowToFlexGrid()`** (L2470-2515, converts Row.columns→FlexGrid items). Resize = W/H only; position via Sortable reorder, not free X/Y.

### Per-archetype impact of adopting FlexGrid (answer to the user's Q)
| Archetype | Today | With FlexGrid | Effort/risk |
|---|---|---|---|
| **Standard** (flow `.mf-page`+`data-width`) | coarse 1-D width | wrap fields in a FlexGrid → full 2-D grid editing, responsive. Cleanest fit (`migrateRowToFlexGrid` shows the pattern). | low-med (schema-only) |
| **AI-design** (`mfp-pure-grid` customHtml card) | flow inside a card | change `applyDefaultPureGridShell` to emit a FlexGrid instead of the `.mfp` card → born grid-ready | medium (touches AI output + "no card thừa" invariant) |
| **Premium** (bespoke customHtml `.mfp`; **Codex premium-native** = fields are tokens + steps are real Sections) | Row-span resize only | 🟡 possible: regrid the field-area inside each `[data-step]` to `.mf-flexgrid`, KEEP chrome — but loses au-field field styling (icons/au-lbl/au-namerow). NOT impossible, just more work + a field-look change. | med-high |

**Additive & no regression:** FlexGrid is opt-in per form; existing premium/standard/AI render unchanged unless migrated.

### ✅ User's chosen migration model (2026-06-29): LAZY migrate on first layout edit
The form **keeps its original layout exactly as created**. The **first time** the host does a *layout* action in inline-edit (drag-reorder OR resize/stretch a field — NOT a text/label/image edit), the form **auto-converts to FlexGrid** and stays FlexGrid thereafter. If the host never touches layout, nothing changes.
- Trigger: the first `pendingLayout`/drag/resize action calls a `migrateToFlexGrid()` that wraps the current schema fields into one `FlexGrid` field, deriving `items[].placement.lg` from the current order (`y=index`) and width (`data-width`→`w`: 100%→12, 50%→6, 33%→4, 66%→8, 25%→3). A schema flag (e.g. `settings.layoutMode='flexgrid'`) marks it migrated so subsequent edits use the FlexGrid editor.
- **Standard:** ✅ clean — fields are plain schema; wrap → FlexGrid. Mirror `migrateRowToFlexGrid()`.
- **AI-design:** ✅ workable — replace the `.mfp mfp-pure-grid` card BODY with a `.mf-flexgrid` (keep the card chrome/theme, or drop it). Some visual reflow; needs care.
- **Premium:** 🟡 **more nuanced than first stated.** Codex's `premium-native-migration.ts` (`migratePremiumWizardSchemaToNative`) already NORMALIZES premium: hardcoded controls → `{{field:KEY}}` tokens (`replaceHardcodedControlsWithFieldTokens`), wizard steps → REAL `Section`+`pageBreak` schema fields (`buildNativeFieldOrder`, `premium_step_N`), nav driven natively (canProceed scripts stripped), `premiumNativePageBreak=true`. So premium-native forms have a **clean schema field list + real step Sections** — enough that FlexGrid CAN apply.
  - **HOW:** replace the **field-content area inside each step panel** (`[data-step]`) with a `.mf-flexgrid` (the step's fields as items), while **KEEPING the chrome** (hero, step band, card, bespoke CSS). The normalization makes the fields/steps clean enough to do this.
  - **Trade-off (the real cost):** the bespoke field markup is the `au-field` label wrappers (`<label class="au-field"><span class="au-lbl"><i>icon</i> Email *</span>{{field:email}}</label>`) — the icon + custom label + side-by-side `au-namerow` live in customHtml. A FlexGrid renders each field as a **standard `.mf-field-group` (`.mf-field-label`)**, so FlexGrid-ifying a step **keeps the chrome but loses the au-field field-level styling** (icons, custom labels, au-namerow). Also needs the field-area-vs-chrome split per step.
  - So premium is **NOT impossible** — it's "keep chrome, regrid the field area, accept losing the au-field field look" + more extraction work than Standard. Decision: is dropping au-field field styling (chrome preserved) acceptable? (User leaning to defer premium; Standard+AI first.)
- **Cost (all archetypes):** still needs (1) inline-edit FlexGrid editor (mirror `startFlexGridResize`/`insertFlexGridItemAt`), (2) per-archetype migrators (flow→FlexGrid; premium step-area→FlexGrid keeping chrome), (3) **C# SSR FlexGrid branch** (Core DLL — else the converted form FOUCs).

### Status & realistic Scope-A delivery
The grid-edit capability **already exists in the BUILDER** (`canvas.ts startFlexGridResize`) — the gap is (1) the **rendered-form inline editor** doesn't drive `.mf-flexgrid-item`, (2) **no C# SSR** for FlexGrid, (3) no form is laid out as FlexGrid yet. Realistic Scope A = **grid editing for Standard + AI-design via FlexGrid migration + a C# SSR FlexGrid branch; Premium keeps Row resize.** Phase 1 should mirror `startFlexGridResize()`/`insertFlexGridItemAt()` math in inline-edit AND add the C# parity branch (else FOUC). **No FlexGrid inline-edit code written yet.**

---

## 3.6 🛠️ PHASE 1 DEV SPEC — "PDF grid" for Standard + AI (hand-off to dev)

> User chose Scope A + lazy-migrate, then asked to **hand over to a dev**. This is the ready-to-build spec. **No code written yet.** Premium deferred.

### ✅ ARCHITECTURE DECISION — **Approach 2: keep fields FLAT + a presentation grid layer** (NOT the FlexGrid field type)
A go/no-go investigation proved that **nesting fields into a `FlexGrid` field's `items[].field` BREAKS the pipeline**: `flattenFields` (TS `helpers.ts:89-102`, C# `MegaFormUtils.FlattenFields`) only recurses `Row.columns`, NOT `FlexGrid.items` → **validation, data-collection (`collectFormData` validation.ts:197), submission (index.ts ~2744), server validation (`FormValidationService.cs:35`), and `{{summary}}` (FormHtmlRenderer `AppendSummaryRows`) all SKIP fields nested in a FlexGrid.** Using the FlexGrid field type would require editing `flattenFields` in TS **and** C# + a C# `RenderFlexGrid` + summary changes.
**Therefore DO NOT nest.** Instead keep every field TOP-LEVEL in `schema.fields` (so the whole pipeline is untouched) and add a **presentation-only grid**:
- `settings.layoutMode = 'flexgrid'` (absent/`'flow'` = today's behavior).
- `settings.gridConfig = { cols:12, rowHeight:64, gap:12 }` (optional).
- each top-level field gains `field.placement = { lg:{x,y,w,h}, md:{…}, sm:{…} }` (x=0-based col-start, y=0-based row, w=col-span, h=row-span) — SAME shape the FlexGrid items use, so the CSS-var mapping is identical.
- **Reuse the existing `.mf-flexgrid` / `.mf-flexgrid-item` CSS** (`megaform.css:225-256`, lg/md/sm media queries) — just wrap each `.mf-field-group` in a `.mf-flexgrid-item` carrying `--lg/md/sm-x/y/w/h`. Fields stay flat → flattenFields/validation/submission/summary all keep working with ZERO changes.

### Where to build (file:line)
1. **TS renderer — client.** `renderStandardFields()` page-build loop (`MegaForm.UI/src/renderer/index.ts:2267-2294`). When `settings.layoutMode==='flexgrid'`: create ONE `.mf-flexgrid` per `.mf-page` (set `--mf-grid-cols/rh/gap`), and for each field wrap its `renderSingleFieldElement(...)` (or Row) output in a `<div class="mf-flexgrid-item">` with `--lg/md/sm-*` from `field.placement` (mirror `renderFlexGridElement` inputs.ts:876-891 — 1-based: `x+1`). Hidden fields stay bare. **Do NOT put `mf-flexgrid` on `.mf-page` itself** (the `.mf-fields-container > .mf-page` rule forces `display:flex` and would beat `.mf-flexgrid`'s `display:grid` on specificity) — nest a `.mf-flexgrid` child inside the page.
2. **C# parity — SSR.** `RenderStandardFields()` (`MegaForm.Core/Services/FormHtmlRenderer.cs:189-203`). Same wrapping when `layoutMode==='flexgrid'`. ⚠️ **OPEN QUESTION the dev must confirm first:** does the client REBUILD the fields container (clear + repopulate via the page loop) or HYDRATE the SSR DOM? If it rebuilds, C# parity only reduces FOUC (flow→grid flash); if it hydrates, C# is REQUIRED or the grid never shows. (I was mid-checking `renderStandardFields`/the container-clear path when stopped — start there.) Needs Core DLL rebuild (net10.0).
3. **Inline-edit grid editor.** `MegaForm.UI/src/shared/inline-edit.ts`. In grid mode, tag `.mf-flexgrid-item`: **drag** to move → live `--lg-x/--lg-y`, **edge/corner handles** to resize → `--lg-w/--lg-h`, snap to 12-col, persist `field.placement.lg` (walk `schema.fields` by key, like `applyFieldWidths`). Persists through the existing SAFE GET→apply→POST.
4. **Lazy-migrate (auto on first layout edit).** On the FIRST drag/resize of a `layoutMode!=='flexgrid'` form: convert the LIVE `.mf-page` flow into a `.mf-flexgrid` (wrap field-groups in items), set `STATE` pending `layoutMode='flexgrid'` + per-field placement, then continue the grid edit. On save: set `settings.layoutMode` + write `schema.fields[].placement`.

### Migration placement derivation (flow → grid)
For each field at index `i` with current `data-width` %: `placement.lg = { x:0, y:i, w: ({'100%':12,'66%':8,'50%':6,'33%':4,'25%':3}[width] ?? 12), h:1 }`. `md = lg`. `sm = { x:0, y:i, w:cols, h:1 }` (always full-width stack on mobile). AI pure-grid: same, but the fields live inside the `.mfp-card` body — regrid that body, keep the card chrome/theme.

### Grid snap math to MIRROR (from builder `canvas.ts startFlexGridResize` L2407-2460, `insertFlexGridItemAt` L2325-2346)
```
totalGap = (cols-1)*gap;  colPx = max(8, (gridRect.width - totalGap)/cols);
dCol = round(dx/(colPx+gap));   dRow = round(dy/(rowHeight+gap));
newW = clamp(startW + dCol, 1, cols - x);   newH = clamp(startH + dRow, 1, 12);
// move: newX = clamp(round((mouseX-gridLeft)/(colPx+gap)), 0, cols-w); newY = max(0, round((mouseY-gridTop)/(rowHeight+gap)))
// drop/default width: w = min(type==='Textarea'?cols:min(6,cols), cols - x)
```

### Risks / must-verify
- Confirm the **rebuild-vs-hydrate** path (item 2) BEFORE deciding C# is mandatory.
- `.mf-page` flex vs `.mf-flexgrid` grid specificity (item 1) — nest, don't co-class.
- Section dividers in grid mode → render as a full-width item (`w=cols`).
- Responsive: lg/md/sm already handled by the CSS media queries — emit all three placement sets.
- Keep it a presentation layer: **never move fields out of `schema.fields`** (that's the whole point — avoids the flatten break).
- Premium is OUT of Phase 1 (would regrid the `[data-step]` field-area, keep chrome, lose au-field field styling — see §3.5 table).

---

## 3.7 ✅ REVISED EXECUTION PLAN (after user's source review, 2026-06-29) — AUTHORITATIVE ORDER

> The user reviewed the current source and refined the plan. **Do premium-JSON cleanup BEFORE PDF-grid** — don't build the grid on top of still-malformed premium templates.

### Findings confirmed by re-check (verified facts for the next session)
- **PDF-grid SSR is MANDATORY, not optional.** Public Oqtane **SSRs then hydrates — it does NOT rebuild standard fields.** So the grid Phase-1 **requires** the C# SSR branch in `FormHtmlRenderer.cs` (`RenderStandardFields` ~L189) or the public form won't show the grid. (This resolves the open question in §3.6.)
- **`inline-edit.ts` still has ONLY the old resize** (`field.width`/`data-width` + Row `columns[].span`) — **no `.mf-flexgrid` editor yet.**
- **Premium JSON state** (`Samples\FormTemplates\Premium\`, all `M`/uncommitted except intake):
  - `down-under-australia.json` — ✅ **CLEAN native reference** (0 `mf-custom-field`, 0 empty shells, 4 Sections, 8 data-step).
  - `festa-italiana.json` — ⚠️ **4× `mf-custom-field` + 1 empty `fi-stack`** (lost premium field chrome). 3 Sections.
  - `euro-youth-application.json` — ⚠️ **6× `mf-custom-field` + 1 empty `ey-checks`**. 4 Sections.
  - `intake-acme-ocean.json` — ❌ **NOT native**: single-page, FAKE step rail, 0 `data-step`, 0 Sections, `premiumNativePageBreak` unset.
  - All 4 native files: **no raw `<input/select/textarea>`** (good), but **PascalCase `CustomHtml` is ABSENT** (only camelCase `customHtml`) — benign (renderer reads camel-first) unless a mirror is required.
  - Native shells use prefix classes `fi-/ey-/au-step[data-step]` (NOT `data-mf-native-step`) — renderer supports both via `updatePremiumNativeShellState` (`index.ts` ~L2167: `.au-step,.bg-step,.ey-step,.fi-step,[data-mf-native-step]`).

### Plan — recommended order: **Premium JSON → buttons guard → QA premium → PDF-grid**
1. **Premium JSON cleanup (FIRST).** Keep the 4 `M` files (do NOT revert Codex's native work).
   - Fix `festa-italiana` + `euro-youth` so fields keep the nice premium chrome instead of falling back to `<div class="mf-custom-field">`. Remove empty shells (empty `fi-stack`, `ey-checks`) that no longer carry meaning.
   - Validate all 4: no raw `<input/select/textarea>`, no orphan token, no duplicate `{{field:}}` token, no empty wrapper, `customHtml`↔`CustomHtml` mirror correct (decide: populate Pascal mirror or rely on camel-first).
2. **Native-ize `intake-acme-ocean.json`.** Convert the 3-step rail to native using renderer-supported generic attrs: `data-mf-native-step data-step="0..2"`, `data-mf-native-page data-step="0..2"`, `data-mf-native-back/next/submit`. Add 3 Section fields (Step1: first_name,last_name,work_email; Step2: company,role; Step3: terms/review-submit). Set `settings.multiPage/premiumNativePageBreak/premiumGeneratedShell` + badge. Add small CSS for `.in-page` active/done if missing.
3. **Regenerate/sync template guides** after the JSON is clean (facts/guide generator) — re-check `MegaForm.DNN\Resources\TemplateGuides` + the Oqtane/Web mirrors; don't touch unrelated guide content beyond template drift.
4. **Fix/guard the `postSubmitExperience.buttons` bug** (§3.1). Add a sanitizer in the builder `post-submit-settings.ts` (drop empty buttons, cap count to the UI max, never keep a bloated array) + a guard in the inline-edit `save()` before POST (don't re-send a ballooned buttons array). Then audit live forms for abnormal `buttons.length`.
5. **PDF-grid (AFTER premium JSON is stable)** — Approach 2 (flat fields + `settings.layoutMode='flexgrid'` + `field.placement`), TS renderer + **C# SSR parity (mandatory)**, inline-edit grid editor + lazy-migrate for Standard/AI first. Premium grid field-area later (premium JSON/native is the base that must be solid first).
6. **Build/deploy/QA live :5000** — build renderer + bump AssetVersion; build Shared DLL + Core DLL if C# touched; deploy; QA the 5 premium templates/native flow, then re-QA action-menu persist + bg/gallery/composite.

---

## 4. FILES CHANGED THIS SESSION
- `MegaForm.UI/src/shared/inline-edit.ts` — **untracked** — +composite sub-labels, +background-image, +built-in gallery picker, +per-block action menu (persist via customHtml `<style id=mf-ie-blocks>`). Badge `v20260629-11`.
- `MegaForm.UI/src/renderer/index.ts` — **tracked** — `goToStep`, `enablePreviewStepNav`, `goNextPage` preview-bypass (design-mode step nav).
- `MegaForm.Oqtane.Shared/AssetVersion.cs` — `20260629-B322` → `20260629-B325`.
- Live data: **form 9 repaired** (postSubmitExperience.buttons 524288 → 0; stale customCss mf-ie-blocks region removed).
- Nothing committed (deploy-to-live workflow).

---

## 5. NEXT STEPS (priority order)
1. **Re-QA the action-menu persist round-trip on form 9** (now repaired) — confirm the `<style id=mf-ie-blocks>` approach renders + applies on the public form, then revert test data.
2. **Find + fix the `postSubmitExperience.buttons` doubling bug** (§3.1) — the real fix. Then **audit all forms** for the same bloat.
3. **QA composite sub-labels** on a form that has a composite (dob/phone/name_plus); **QA bg + gallery** on festa-italiana (form 10, has a hero image + texture bg).
4. Consider **de-duplicating the settings blob** in the inline-edit save payload (§3.2).
5. **au-field standalone resize + premium free-drag** (item C) — still deferred; document the customHtml-grid approach if attempted.
6. **PDF-style grid for inline edit (§3.5 + §3.6 DEV SPEC)** — user chose Scope A + lazy-migrate, then handed to a dev. **Build per §3.6** (Approach 2: keep fields flat + a `.mf-flexgrid` presentation layer via `settings.layoutMode='flexgrid'` + `field.placement`; do NOT use the FlexGrid field type — it breaks `flattenFields`/validation/submission/summary). Phase 1 = Standard + AI; Premium deferred. First action for the dev: confirm the **rebuild-vs-hydrate** path (does C# parity gate the grid showing, or just FOUC?).

## 6. POINTERS
- Inline-edit: `MegaForm.UI/src/shared/inline-edit.ts` — `enableBlockActions`, `applyBlockOverrides` (customHtml `<style>`), `applyCompositeSubs`, `enableImageEdit` (img + bg), `openMfGalleryPicker`.
- Renderer step-nav: `MegaForm.UI/src/renderer/index.ts` — `goToStep`, `enablePreviewStepNav`, `goNextPage`, `updateNavigation`, `updatePremiumNativeShellState`, `isPremiumNativeCustomHtmlMode`.
- Composite parts: `MegaForm.UI/src/renderer/helpers.ts compositePartsFor` (L538) + `MegaForm.Core/Services/FormHtmlRenderer.cs ResolveCompositeParts` (L679, prefers stored `widgetProps.parts`).
- CSS composition: `MegaForm.Core/Services/ModuleCssComposer.cs`.
- Save endpoint: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (`Form`/`SaveForm`, full-row update).
- The buttons bug lives wherever `postSubmitExperience.buttons` is edited — start in the builder post-submit settings UI and any settings-normalize on save.
- **Premium form JSON** (Codex-normalized, mostly UNCOMMITTED — don't clobber): `Samples\FormTemplates\Premium\{down-under-australia,festa-italiana,euro-youth-application,bulgaria-discovery-programme}.json` (+ `intake-acme-ocean.json` not native). Codex script: `MegaForm.UI\src\shared\premium-native-migration.ts`. Full path list + context in `HANDOFF_MEMORY_EXPORT_20260629.md` §6.
- Memory: `[[project_inline_edit_all_forms_hardening]]`, `[[project_ai_on_rails_kb_catalog_b310]]`.
