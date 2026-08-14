# HANDOFF — Premium→Native migration study · Export-template · Summary-in-C# (2026-06-28)

> For the NEXT session. This is a **research/plan** doc (no code was written for these three topics
> this session). It exists so the next session can (a) finish the **export-template (no-code)** feature,
> (b) **continue Codex's premium→native-schema work WITHOUT breaking it**, and (c) fix the
> **premium summary** that stops auto-updating after an edit (proposal: move the summary into C# core).
>
> ⚠️ The premium→native work is **Codex's, still UNCOMMITTED** in the working tree and **intentional**.
> Do NOT revert/commit it as part of other work. Commit ONLY your own explicit paths (`git add <path>`),
> never `git add -A`. `AssetVersion.cs` is owned by Codex (churned B292→B302) — read the CURRENT value,
> don't overwrite it. See the older handoff `CLAUDE_HANDOFF_NEXT_SESSION_WIZARD_BUILDER_CONTROLS.md`.
>
> This session's own committed work (separate, safe): `7670016` = Image/Content Slider redesign (3 files).
> Slider note: it renders correctly on `/api/MegaForm/render/{id}`; it shows EMPTY on `localhost:5000/?formid=N`
> only because the `?formid=` admin override loads widget-plugin scripts for the MODULE'S BOUND form, not
> the override form → fix = bind the module to the slider form (config, no code). See
> [[project_image_slider_widget_redesign]] + [[project_formid_admin_gate]].

---

## A. EXPORT TEMPLATE IN THE BUILDER (no-code feature to finish)

### What already exists (don't rebuild — extend)
- **Save as Template** button → dialog → POST `BuilderTemplates/UploadJson`.
  `MegaForm.UI/src/builder/save-as-template.ts` (`openSaveAsTemplateDialog`, `buildTemplateRecord`,
  `postTemplate`); button wired in `builder/dom.ts` (`#mf-btn-save-as-template` + the "…More" menu) and
  `builder/toolbar.ts`.
- **Download template → .json** : `builder/gallery.ts handleDownloadTemplate()` (≈L1540) emits a `.json`
  blob; **Import** via `gallery.ts` UploadJson (≈L1335); gallery list via `BuilderTemplates/List` (≈L561).
- **Server**: Oqtane `MegaFormController` (List/UploadJson/DevBulkCreateForms) + DNN
  `WebApi/BuilderTemplatesController.cs`. `builder/index.ts:43` comment: "Templates — import/export".

### Current export shape (what a template .json carries today)
`{ version,id,title,description,category,categories,icon, fields, customHtml, customCss, rules, workflow, settings }`

### What is MISSING for a clean "export → share file → re-import" (the no-code task)
1. **`customScripts` NOT exported** — premium custom JS is dropped on export/import.
2. **Per-field `widgetProps` NOT exported** — Composite/Rating/Slider/Chips-Cards/Slider presets reset on re-import.
3. **`theme` / `themeJson` NOT exported** — colors/fonts/spacing lost; re-import is unthemed.
4. **Native pageBreak schema not guaranteed round-tripped** — a migrated premium form's
   `Section{generatedPremiumStep}` markers must survive export→import (else it regresses to data-step).
5. **No version validation / migration on re-import** — `createUploadedTemplatePayload` only checks
   `fields||title`; an old-format template can silently lose data.

**Next-session plan (small, additive):** extend `buildTemplateRecord()` (save-as-template.ts) +
`handleDownloadTemplate()`/upload (gallery.ts) to include `customScripts`, per-field `widgetProps`,
`theme/themeJson`, and the full migrated schema; add a `version`-aware normalize on import that runs
`migratePremiumWizardSchemaToNative` so any old template lands as native. QA round-trip: export a premium
+ a Slider/Composite form → re-import → assert scripts/widgetProps/theme/pageBreak all preserved.

---

## B. CODEX'S PREMIUM→NATIVE-SCHEMA WORK — study + DON'T-BREAK rules

### What it does (verified)
Goal: make **premium templates** (customHtml `data-step` wizards driven by injected JS) edit + render the
**same** way as **standard** and **wizard** forms — by converting them to a **native multi-page schema**
(`Section` fields with `pageBreak`). Engine: **`MegaForm.UI/src/shared/premium-native-migration.ts`** (NEW,
TS-only) + ~+475 lines in **`MegaForm.UI/src/shared/custom-html-insert.ts`**.

`migratePremiumWizardSchemaToNative(schema)` pipeline: normalize camel/Pascal dual props → detect wizard
(`/data-step=/` + `parseWizardStructure`) → `replaceHardcodedControlsWithFieldTokens` (bare `<input name>` →
`{{field:key}}`) → `syncFieldPlaceholders` → **strip `{{script:}}` tokens** (`removeScriptTokens`) +
purge `customScripts` → `buildNativeFieldOrder` (emit one `Section{pageBreak,premiumNativeStep,
generatedPremiumStep,premiumStepIndex,legacyDataStep}` per step) → `reflowWizardFieldTokensBySchemaPages` →
`markNative` (`premiumNativePageBreak`,`premiumGeneratedShell`,`multiPage`, disable `inheritPageColors`).

**Runs at 4 hook points (all try/caught):**
- `builder/core.ts` (normalizeSchema, builder load) · `renderer/helpers.ts` (normalizeSchema, render) ·
  `dashboard/wizard/templates.ts` (template load) · `dashboard/wizard/transform.ts premiumDto` (wizard create).
- Builder reorder path: `builder/html-sync.ts` calls `reorderFieldTokens` then, if
  `isPremiumNativeSchema`, `syncPremiumNativeShellToSchema` → `reflowWizardFieldTokensBySchemaPages`.

### Why it's safe for standard/wizard (verified — don't regress this)
The engine **early-returns with zero mutation** when there's no `customHtml` with `data-step` OR
`parseWizardStructure` finds no token-bearing steps (premium-native-migration.ts:216 + 222). So plain
standard forms and native wizard forms are **untouched**. The 4 stored premium Samples
(`Samples/FormTemplates/Premium/{bulgaria,down-under,euro-youth,festa}.json`) are now **pre-migrated**
(carry the `Section{generatedPremiumStep}` markers); the on-the-fly hooks are belt-and-suspenders.

### Render/CSS support (Codex's C# changes — read-only context)
C# **reads** the `premiumNativePageBreak`/`premiumGeneratedShell` flags + the `mfp-native-generated` marker
to apply the native-shell compat CSS. Changed services: `CustomShellCompatibilityCssService.cs`
(new `Build(scope, templateText, enableTemplateVarBridge)` overload + `--var` regex scan to avoid
double-defining authored template vars), `ModuleCssComposer.cs` (`enableTemplateVarBridge` = has preset CSS
or theme overrides), `ThemeFirstPaintCssService.cs` (`HasAuthoredPremiumPalette` skips borrow-colors when
the template authored `--au-/--bg-/--ey-/--fi-` palette vars). FormIdGate (admin-only `?formid=`) is in
`Index.razor` (~1554) + DNN `FormView.ascx.cs`. ⚠️ The migration ENGINE is **TS-only**; C# does NOT run it.

### ⚠️ DON'T-BREAK RULES (next session)
1. Keep the **4 try/caught hooks** + the **early-return gates** (216/222) — they're what protects standard/wizard.
2. Always gate full rebuild on `isPremiumNativeSchema()` (idempotency); never call `reorderFieldTokens`/
   `buildNativeFieldOrder` during **AI rebrand/keep-style** (must preserve the shell byte-for-byte).
3. `Section` markers with `data-step=`/`generatedPremiumStep` are **fixed anchors** — whole-step reorder
   (the old ❌D2) is still out of scope; don't move steps, only tokens within a step.
4. Any regex change in `custom-html-insert.ts` must assume **well-formed** HTML — see fragile points below.

### Unfinished / fragile points (from an adversarial review — verify line #s, sub-agents drift)
**HTML-parse edge cases (custom-html-insert.ts):**
- `replaceHardcodedControlsWithFieldTokens` has a **`<20` replacements-per-key guard** → a field with 21+
  hardcoded instances leaves bare `<input>`s (invisible). Bump or test.
- `removeOrphanSummaries`/`hasNameRow`: deleting ALL Rows can leave a stale `data-au-summary='name'` row;
  renaming a Row (first/last → full_name) can wrongly drop the `name` summary. (Relates to §C below.)
- `parseWizardStructure`: doesn't skip `<!-- data-step -->` in **comments**; eyebrow-class regex breaks on
  internal quotes; assumes **contiguous** step numbers (1,2,3 — not 1,3,5).
- `fieldStepMap`: a token duplicated across two steps records only the **last** step.
- `reflowWizardFieldTokensBySchemaPages`: if the actions/`mfp-actions` bar is a **shared footer OUTSIDE**
  the `data-step` panel, new fields insert before the footer (after the panel closes).
- `collectElementRanges`: hardcoded `VOID_TAGS` set — custom void elements corrupt range parsing.
- Field keys must stay `[a-zA-Z0-9_-]+` (token regex) — block AI renames with spaces/unicode.

**Idempotency:** the `hardcodedControlUpgrade` flag can stick "dirty" on a no-op second run — verify
migrating twice yields identical `schema.fields` order.

**Platform parity (the real one):** migration is **client-side**; C# SSR renders the schema **as stored**.
A DB premium form created BEFORE the migration (flag not set, still `data-step`) → SSR renders the old shell,
client migrates to native → **SSR↔client mismatch / flicker** until the form is re-saved. Next session should
either (a) one-time re-save/migrate existing DB premium forms, or (b) port the data-step→native detection so
SSR and client agree. (The render-path sub-agent claimed C# also runs the migration — I could NOT confirm
that; treat as TS-only unless verified.)

**QA already written by Codex (run these to verify before changing anything):** `qa5000/qa-reorder.mjs`
(reorder fidelity + customHtml byte-invariance), `qa-step-canvas.mjs` (builder "Step N · Title" dividers),
`qa-submit.mjs` (wizard validation guard, form 13 vs 9), `qa-theme-steps.mjs` (theme + step nav), plus
`dbg-{dash,wiz,click}.mjs`.

---

## C. PREMIUM SUMMARY BREAKS AFTER EDIT → move summary into C# core (investigate)

### The bug (verified this session)
When a premium form is edited (fields added/removed), the **review/summary step is wrong / doesn't
auto-summarize**. Root cause is two compounding things:
1. Premium templates carry a **hard-coded** review panel: static rows `<… data-au-summary='KEY'>` populated
   by an **injected `{{script:}}`** (`updateSummary()`).
2. `syncFieldPlaceholders` only **REMOVES orphan** summary rows (`removeOrphanSummaries`,
   custom-html-insert.ts:141) — it **never ADDS** a summary row for a newly-added field. And Codex's
   migration **strips `{{script:}}` tokens**, so even existing rows lose their populator post-migration.
   → the summary is stale/incomplete after any edit.

### The robust path that already exists (client-only)
The **native** pre-submit review `showReview()` (`renderer/index.ts:2980`) + post-submit answer summary
(`buildSummaryRows`, PostSubmitSummary v20260619) build the list **dynamically from collected data + schema
labels** — edit-proof, works for any form. Premium forms just don't use it; they use their dead hard-coded panel.
There is **no C# summary** at all (it's JS-only) — so SSR shows nothing for the review until JS runs.

### Proposal (the user's idea — sound): move summary generation into C# core
Next-session task: **consolidate to ONE summary engine**, ideally ported into C# core
(`MegaForm.Core/Services/FormHtmlRenderer.cs`) so the review/answer summary is **SSR-rendered**
(SEO + first paint), **identical across premium + standard + wizard**, and **auto-reflects the schema**
regardless of customHtml. Concretely:
1. Make migrated premium forms **drop the hard-coded `data-au-summary` panel** and use the native review
   step (gate via the existing `reviewStep`/`showReview` setting) — so editing auto-updates the summary.
2. Port `buildSummaryRows`/`showReview` row-building into C# (mirror the TS contract, like the other
   SSR field renderers) and emit the review markup server-side; keep the TS path for interactivity/parity
   (⭐TS↔C# parity rule — change BOTH, rebuild `MegaForm.Core.dll`).
3. Verify the post-submit "answer summary" also uses the same single source.

QA: edit a migrated premium form (add + remove a field) → the review step must list exactly the current
fields with values; SSR and client must agree; no leftover `data-au-summary` orphan.

---

## D. UX / visual issues flagged by user (2026-06-28 screenshots) — fix next session

**D1 — Wizard premium Fields: "Multi-step form" + "Progress bar" toggles look editable but are template-locked.**
File: `MegaForm.UI/src/dashboard/wizard/step-fields.ts` (Codex B306). They render top-right as bright
green ON switches with sublabel "Premium template flow". Intent (per B306) = "disabled/on because the
premium shell flow is template-controlled" — but they READ as live editable toggles → misleading; user
circled them + drew an arrow at them. FIX: render clearly DISABLED/read-only (dimmed, no switch
affordance, lock icon + "Controlled by template" hint), and regroup so they don't float disconnected from
the left **Steps** sidebar.

**D2 — Premium steps locked ("Template steps fixed").**
User circled the **Steps (4)** sidebar (Profile/Programme/Logistics/Confirm) + the "Template steps fixed"
note. Premium currently CAN'T add/remove steps (intentional B306 — the generated shell has a fixed stepper
+ data-step panels). Decide whether to support premium step add/delete; it needs **regenerating the premium
shell** (stepper nav + `data-step` panels + the native Section.pageBreak markers), NOT just the wizard UI
(= Codex handoff item #5 in `CLAUDE_HANDOFF_20260628_B306_…`).

**D3 — Rendered premium form: top / stepper spacing in the home-module inline render.**
EuroYouth premium on `localhost:5000` (home module): the dark stepper (01–04) sits above the white form
card with a LARGE empty gap (user circled the whole top region + arrow down the right). Likely the premium
shell's hero/stepper top spacing compounding with the Oqtane module chrome. FIX: visual-QA the premium top
(stepper → card) spacing in the inline home-module context vs the mock and trim the excess gap. Relates to
the earlier finding that the dominant top gap is the **Oqtane module title** chrome — but here the shell
spacing looks involved too. ⭐Note the slider fix this session is live (B308); these are SEPARATE.

## C-resume — where the summary C# port stands (paused mid-flight, user pivoted)
Phase 1 (TS `updatePremiumSummary`/`bindPremiumSummary` filling `[data-au-summary]`) is CODED in
`renderer/index.ts` (built into repo `Assets/js/megaform-renderer.js`, NOT deployed). Phase 2 (the C#
schema-driven `{{summary}}`) investigation done — exact insertion points for next session:
- **C# emit:** `MegaForm.Core/Services/FormHtmlRenderer.cs RenderCustomHtml` (line ~158, right after the
  `{{field:key}}` regustomHtml token, supporting `{{form:}}/{{content:}}/{{script:}}/{{field:}}`). Add a
  `{{summary}}` → `BuildSummaryHtml(fields, locale)` that emits `<div class="mf-summary">` + one
  `<div class="mf-summary-row"><span class="mf-summary-label">{label}</span><span class="mf-summary-value"
  data-mf-summary-key="{key}"></span></div>` per INPUT field (skip Section/Hidden/Html/ContentSlider/Map/
  QRCode/RichText/etc.). Walk Row.Columns.
- **TS parity (client customHtml substitution):** `renderer/index.ts renderCustomHtml` (line ~1770, the
  `{{field:key}}` replace at ~1864) — add the SAME `{{summary}}` substitution so the client render matches
  SSR; there's a second copy in `renderer/megaform-renderer.ts:1555/1718` to keep in parity.
- **Client value fill:** generalize Phase 1's `updatePremiumSummary` to also fill `[data-mf-summary-key]`
  (same fmt as native `showReview` at `renderer/index.ts:3016`); call on input/change/navigation.
- **Premium adoption (the actual fix):** for migrated premium, the "Confirm" step should use `{{summary}}`
  (e.g. premium-native-migration emits it / replaces the hard-coded panel) — touches Codex's migration, do
  carefully. ⭐change BOTH TS+C#, rebuild Core.dll, keep parity. ⚠Renderer change ⇒ AssetVersion bump
  (now **B308**) + Shared.dll swap to reach browsers.

## Pointers
- Migration: `MegaForm.UI/src/shared/premium-native-migration.ts`, `…/shared/custom-html-insert.ts`.
- Hooks: `builder/core.ts`, `renderer/helpers.ts`, `dashboard/wizard/{templates,transform}.ts`, `builder/html-sync.ts`.
- Render/CSS (C#): `MegaForm.Core/Services/{CustomShellCompatibilityCssService,ModuleCssComposer,ThemeFirstPaintCssService}.cs`, `Index.razor`, `FormView.ascx.cs`.
- Summary: `renderer/index.ts` (`showReview` ~2980, `buildSummaryRows` ~2956, PostSubmitSummary), `renderer/megaform-renderer.ts` (`buildAnswerSummaryHtml` ~2738). No C# summary yet → that's the work.
- Export: `builder/save-as-template.ts`, `builder/gallery.ts`, `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`, `MegaForm.DNN/WebApi/BuilderTemplatesController.cs`.
- Memory: [[project_image_slider_widget_redesign]], [[project_form_creation_wizard_prep]], [[project_b3_premium_studio_keepstyle]], [[project_orphan_cleanup_reorder_d1]].
