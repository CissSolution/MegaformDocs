# HANDOFF — 2026-06-30 → 07-01 : working-tree audit → 4 fixes → premium-flexgrid → PIVOT inline-edit into the builder Design tab → auto-save + footer

> **Live:** `:5000` (Oqtane.10_new2, host / Minh@2002), self-contained Kestrel exe. **AssetVersion `20260701-B336`**, net10.0.
> **HEAD (committed):** `1096ae4` (buttons-doubling fix). **Everything below is UNCOMMITTED** (deployed-only), consistent with the whole working tree (~197 uncommitted files — Codex works this repo IN PARALLEL; do NOT clobber).
> Render any form (anon, full SSR page for headless QA): `GET /api/MegaForm/render/{id}`. Authed form GET/POST: `GET|POST /api/MegaForm/Form[/{id}]`.

## 0. START HERE (read order, 90 s)
1. `memory/MEMORY.md` (auto-loaded) — top entries point here.
2. `memory/project_worktree_audit_b332_groundtruth.md` — the working-tree audit + commit-coupling map.
3. `memory/project_20260630_fixes_and_premium_flexgrid.md` — the 4 fixes + premium-flexgrid.
4. `memory/project_20260630_inline_edit_into_design_tab.md` — ⭐ the PIVOT + form-70 debug + auto-save/footer (the current focus).
5. THIS doc — full detail. Then `git status` + `git log --oneline -3`.

**FIRST 6 FACTS the next session MUST know:**
- Live = B336. Committed baseline was only B292 → ~10k+ lines Codex+Claude are DEPLOYED-only, uncommitted. The tree builds (that's how B336 got deployed).
- **Inline-edit was MOVED off the public form view INTO the builder Design-tab Live Preview** (user: the public path was unstable). It now activates ONLY in the preview (`config.isPreview`), persists via postMessage→builder, and AUTO-SAVES on one click.
- **`premiumNativePageBreak` is a RUNTIME flag, NOT persisted** — the resolver strips it; it is re-derived by `markNative()` in the client premium-native migration each render. You cannot fix premium-native by saving that flag.
- **COMMIT-COUPLING:** tracked files import 4 UNTRACKED Codex `@shared` modules (`premium-native-migration.ts`, `rich-choice-catalog.ts`, `summary-html.ts`, `widget-plugin-autoload.ts`) + `inline-edit.ts` + `premium-steps.ts`. The tree is ONE atomic build unit.
- **Deploy = JS/CSS copy to the LIVE site wwwroot + AssetVersion bump + Shared DLL swap + exe restart** (see §6). NO Core.dll change was needed this whole session.
- QA harness: `qa5000/*.mjs` (login host/Minh@2002 via `robustLogin`; `lib.mjs` = launch/login/getForm/saveForm/shot). Live server MUST be running for QA.

---

## 1. THE ARC (what shipped, B333 → B336)

### B333 — audit + 4 fixes + premium-flexgrid (handoff `CLAUDE_HANDOFF_20260630_FIXES_AND_PREMIUM_FLEXGRID.md`)
- **10-cluster fan-out audit** of the uncommitted tree (Codex+Claude). Ground truth in the audit memory.
- **Config/JSON (via generators):** icon-policy contradiction (recipe forbids AI icons vs guide mandates emoji) → reconciled in `gen-template-facts.cjs` C7 (preserve, never invent) + regenerated all 5 templates' facts/guides; stale `stepMechanism='customHtml-wizard'` → native-detect → `premium-native`; dup-customHtml 3× BLOAT → removed schema-root mirror writes in `premium-native-migration.ts` + cleaned 2 Sample files (`scratchpad/dedup-premium-root.cjs`).
- **Double-serialize:** `inline-edit.ts save()` shipped settings in BOTH SchemaJson+SettingsJson → strip `schema.settings` from SchemaJson (`schemaForSave`).
- **Dead code:** removed `pendingRowGrid`/`applyRowGrids`/`rowGridClause`, `getNewFormBuilderUrl`, Razor `SettingsInlineHostId`; flexgrid `_gridGeom` fallback 12→24.
- **⭐ Premium-shell FlexGrid (Model A — grid baked into customHtml, NO C# change):** `inline-edit.ts` convert pill `maybeAddPremiumGridConvert` → `wrapPremiumStepsIntoFlexGrid` (DOMParser wraps each step panel's field children in `.mf-flexgrid-item[data-mf-fg-key]`, keeps chrome+labels) → editor drives it → `applyPremiumPlacements` rewrites `--lg/md/sm` vars in customHtml on save. CRITICAL sub-fixes: migration-reflow guard (skip reflow if `data-mf-flexgrid`) + force `grid-template-columns:repeat(24,1fr)!important` on the active panel.

### B334 — ⭐ PIVOT: inline-edit → builder Design tab
- Public `?view=form&edit=true` inline-edit was unstable → moved into the builder **Design-tab Live Preview iframe** (`?mfpanel=builder&formId=N` → Design tab).
- `inline-edit.ts`: `InlineEditConfig.isPreview`; `initInlineEdit` activates ONLY when `cfg.isPreview` (public path retired). `save()` refactored into `applyAllPending`/`resetAllPending`; in preview → `savePreviewPatch()` posts `{type:'mf-inline-edit-apply', schemaJson, settingsJson}` to `window.parent` (NO DB POST — would clobber unsaved builder theme/field edits).
- `renderer/index.ts:1440` passes `isPreview:!!config.isPreview`.
- `builder/core.ts`: `applyInlineEditFromPreview(payload)` + a `message` listener. Merges ONLY inline-editable parts (fields + customHtml/customContent/layoutMode); PRESERVES the theme-designer's domain (theme/cssOverrides/themeCssOverrides/customCss).
- Also: **double-stepper fix** — hide the generic `.mf-steps` when `isMultiStepCustomHtmlMode()` (broadened from premium-native so it catches euro-youth).

### B335 — form-70 debug (user hit double-buttons + "broken fields")
- "broken/empty fields" the user screenshotted = STALE CACHE (pre-B334); render was fine after cache-bust.
- **Root of the double buttons:** form 70 was flexgrid-converted during testing → `data-mf-flexgrid` → the premium-flexgrid migration guard skipped `markNative` → the form lost premium-native → shell engine inert → generic AND premium nav both showed.
- **Fixes:** (a) migration guard now runs `if(hasPageBreak(fields)) markNative(settings)` before returning (flexgrid + native COEXIST — QA `qa-flexgrid-native.mjs`: grid layout + SINGLE nav); (b) §6 leak — `updateNavigation` hides the generic `.mf-form-actions` DETERMINISTICALLY when `isPremiumNativeCustomHtmlMode()` (dropped the racy `hasPremiumNativeCustomActions()` gate); (c) form 70 restored to clean euro-youth from the Sample (`qa5000/restore-f70-sample.mjs`).

### B336 — auto-save + footer editable (user: "changes not saved to live" + "footer not editable")
- **⭐ AUTO-SAVE:** the Design-tab save was TWO-STEP (inline Save pill → then ALSO click the builder Save/Publish). Now `applyInlineEditFromPreview` (core.ts) auto-triggers `callModule('toolbar','saveForm',[status,{returnAfter:false,toast}])` after merging → ONE inline-Save-pill click persists to the DB+live. inline pill relabeled "Đã lưu vào form".
- **⭐ FOOTER (+ mixed-content shell els) EDITABLE:** the footer `<p class=ey-footer>Co-funded … · Step <span data-ey-current>1</span> of 4</p>` was skipped (not a pure text leaf — has the counter child). Fix: `wrapLeadingShellText()` wraps the leading text node in `<span data-mf-ie-textwrap>` and tags THAT editable.
- **⭐ ENTITY-TOLERANT `swapTextOnly` (real, general bug):** shell text is read DECODED from the DOM ("·") but stored ENTITY-encoded in customHtml ("&middot;") → the `(>\s*)FIND(\s*<)` swap NEVER matched strings with entities (footer, ©, &, …) → those edits silently did not persist. `swapTextOnly` now builds an entity-tolerant regex (literal OR `&#dec;`/`&#xHEX;`/`&named;`). Fixes ALL shell strings with entities.

---

## 2. INLINE-EDIT-IN-DESIGN ARCHITECTURE (the current model)

- **Design preview = IFRAME** (`#mf-builder-preview-frame`, `canvas.ts:619`) with `srcdoc`; `window.__CFG.isPreview:true` (`canvas.ts:289`) + the builder's `B.state.schema`. The renderer runs INSIDE the iframe.
- **Edit flow:** user clicks editable text/label/field in the preview → inline-edit stores a pending* edit → clicks the floating **inline Save pill** → `savePreviewPatch()` applies pending* to a clone of `cfg.schema` → `window.parent.postMessage('mf-inline-edit-apply', {schemaJson, settingsJson})`.
- **Builder receives** (`core.ts applyInlineEditFromPreview`): merges fields + customHtml/customContent/layoutMode into `B.state.schema` (theme preserved) → `state.isDirty=true` → **AUTO-SAVE** via `callModule('toolbar','saveForm',…)` → persisted to DB → live updated.
- **Why postMessage, not direct DB POST:** the preview shows `B.state.schema` (incl. unsaved theme). A GET-from-DB→POST inline-save would clobber those. The merge goes through B.state.schema so the builder's save persists everything together.
- **Premium field labels are SHELL TEXT** (in the customHtml `<span>`, e.g. `<label class=ey-field><span>First name *</span>{{field:email}}</label>`), NOT `schema.fields[].label`. Editing them = a `pendingShell` swap on `settings.customHtml`, occurrence-indexed via `data-mf-ie-occ`.

---

## 3. PREMIUM-FLEXGRID ⟷ PREMIUM-NATIVE (fragile interaction — understand before touching)

- Premium templates render via a bespoke customHtml shell with `{{field:KEY}}` tokens + their own stepper + their own nav (`au/bg/ey/fi-next/back/submit`).
- **premium-native mode** (`isPremiumNativeCustomHtmlMode = isMultiStepCustomHtmlMode && settings.premiumNativePageBreak`) makes the renderer's shell engine (`bindPremiumNativeShellControls`, `updatePremiumNativeShellState`, `renderer/index.ts:~2126-2300`) drive the steps + hide the generic `.mf-steps`/`.mf-form-actions`. `premiumNativePageBreak` is RE-DERIVED each render by `markNative()` in the migration (NOT persisted).
- **Premium-flexgrid** (Model A) bakes `.mf-flexgrid` into the customHtml. The migration guard must NOT reflow tokens (breaks the wrappers) but MUST still `markNative` (else the form loses premium-native → double nav buttons). Both now coexist (B335 guard fix).
- **CSS:** `Assets/css/megaform.css` `.mfp [data-step].mf-flexgrid[data-mf-flexgrid].is-active{display:grid!important; grid-template-columns:repeat(24,1fr)!important; grid-auto-rows:minmax(64px,auto)}` + `:not(.is-active){display:none!important}`.
- **QA gotcha:** measuring `[data-step].is-active` picks the NAV step (`.ey-step`, display:flex) NOT the content panel (`.ey-page`, display:grid) for ey/bg/fi templates (their nav steps also carry data-step; au- don't). Measure `.mf-flexgrid[data-mf-flexgrid].is-active`.

---

## 4. KEY GOTCHAS / LEARNINGS (this session)
- ⭐ `premiumNativePageBreak` NOT persisted (resolver strips it) → re-derived by `markNative`. All premium forms show it `undefined` via `getForm`, yet render as native.
- ⭐ `swapTextOnly` entity mismatch: DOM-decoded text vs entity-encoded customHtml → non-persist. Fixed (entity-tolerant).
- ⭐ The premium-native migration runs on EVERY client render (`renderer/helpers.ts:196 normalizeSchema`), builder load (`builder/core.ts`), and wizard paths — its token reflow is the #1 conflict with any customHtml-resident layer (flexgrid).
- Builder = `window.MegaFormBuilder` IIFE (`core.ts`): `state.schema`/`state.isDirty`/`callModule(name,method,argsArray)`/`showToast(msg,type)`. Save path: `toolbar.ts buildPayload` reads `B.state.schema` (+ `syncCustomHtmlBidirectional` reads customHtml from `state.schema.settings`). `saveForm(status,{returnAfter})` — returnAfter:true = Publish+redirect.
- Preview iframe is same-origin → postMessage works; existing protocol: `mf-theme-live-css`, `mf-theme-inspect-pick`, `mf-theme-preview-ready` (theme-left-rail.ts:227 is the parent listener).
- Cache: browsers cache JS/CSS under `?v=AssetVersion`. After overwriting the live files you MUST bump AssetVersion + swap the Shared DLL + restart, else the user's browser serves stale (the "empty fields" false alarm was exactly this).

---

## 5. FILES CHANGED THIS SESSION (all UNCOMMITTED)
**Modified (tracked):** `Assets/css/megaform.css` (premium-flexgrid rule + chips/cards), `MegaForm.Oqtane.Client/Index.razor` (removed SettingsInlineHostId), `MegaForm.Oqtane.Shared/AssetVersion.cs` (B292→B336), `MegaForm.UI/src/renderer/index.ts` (flexgrid hydrate/renderStandardFields + double-stepper + deterministic actions-hide + isPreview pass-through), `MegaForm.UI/src/builder/core.ts` (applyInlineEditFromPreview + auto-save + message listener), `MegaForm.UI/src/dashboard/index.ts` (removed getNewFormBuilderUrl), `MegaForm.UI/tools/gen-template-facts.cjs` (C7 icon + stepMechanism native), `MegaForm.DNN/Resources/TemplateGuides/*.{facts.json,guide.md}` ×5 templates, `Samples/FormTemplates/Premium/{bulgaria,down-under}.json` (dedup).
**Modified (UNTRACKED — Codex's files, I edited them):** `MegaForm.UI/src/shared/inline-edit.ts` (premium-flexgrid editor + isPreview/savePreviewPatch + footer wrap + entity-tolerant swap + applyAllPending refactor), `MegaForm.UI/src/shared/premium-native-migration.ts` (dedup root-mirror + flexgrid guard markNative).
**Note:** `Samples/FormTemplates/Premium/americana-journey.json` is NEW+untracked = Codex's, not mine.

## 6. DEPLOY RECIPE (verified this session)
```
cd MegaForm.UI
node scripts/build-entry.cjs renderer     # → Assets/js/megaform-renderer.js (auto-syncs to repo wwwroot)
node scripts/build-entry.cjs builder      # → Assets/js/bundles/megaform-builder.js
# copy to the LIVE site (repo sync ≠ live site):
cp Assets/js/megaform-renderer.js              <SITE>/wwwroot/Modules/MegaForm/js/
cp Assets/js/bundles/megaform-builder.js       <SITE>/wwwroot/Modules/MegaForm/js/bundles/
cp Assets/css/megaform.css                     <SITE>/wwwroot/Modules/MegaForm/css/   # if CSS changed
# bump AssetVersion.cs, then:
dotnet build MegaForm.Oqtane.Shared -c Release
# STOP exe (Oqtane.Server) → swap MegaForm.Oqtane.Shared.Oqtane.dll at <SITE> root → relaunch → poll :5000
```
`<SITE>` = `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\`. gen-template-facts writes to 3 platform dirs. `.bak_pre_b33X` rollbacks at the site root.

## 7. QA SCRIPTS (qa5000/, this session — all snapshot→test→RESTORE where they mutate a form)
- `qa-premium-flexgrid.mjs` / `qa-premium-flexgrid-persist.mjs` — premium-flexgrid render + drag/resize persist (form 9).
- `qa-inline-edit-design.mjs` — inline-edit ACTIVATES in the Design preview (80 editable, edit→toast).
- `qa-design-stepper.mjs` — single stepper in the preview.
- `restore-f70-sample.mjs` — restore form 70 to clean euro-youth from the Sample.
- `qa-flexgrid-native.mjs` — flexgrid + premium-native coexist (guard fix).
- `e2e-design-persist.mjs` — inline-edit → inline Save → builder Save → DB persisted.
- `qa-footer-autosave.mjs` — footer editable + one-click AUTO-SAVE persists.
- Edit-mode in the preview needs no admin marker (gated on `config.isPreview`); public render QA that still tests inline-edit would need `?edit=true` + a `.mf-oq-linkbtn` inject (but that path is retired).

## 8. OPEN FOLLOW-UPS
1. **euro-youth (+ any ey-stepper form) SHOULD be premium-native but the flag isn't persisted** — it's re-derived by markNative on render, which works for non-gridded forms. Consider making `markNative` fire whenever the shell has its own stepper/nav (au/bg/ey/fi-step + -next), independent of the (unpersisted) flag, so old/edge forms never show double nav.
2. **Premium-flexgrid is opt-in per form** (convert pill in the preview) + multi-step premium-native only. Standard/AI flexgrid unchanged. Convert-to-grid now keeps nav working (B335), but re-verify each archetype (bulgaria/festa/intake) end-to-end.
3. **Retired public-view inline-edit code** is still present (gated off via `!cfg.isPreview`). Remove fully if confirmed unwanted.
4. **Auto-save writes on every inline Save-pill click** — fine, but if a user makes many separate edits it is many DB writes; consider debouncing.
5. **Audit memory §DEFECTS leftovers:** 184 unsplash URLs in `ai-knowledge-seed.json` (needs live-DB re-seed+re-export); multi-page standard flexgrid; ALLOWED_IMAGE_HOSTS drift.
6. Verify the entity-tolerant `swapTextOnly` didn't over-match any existing shell edits (regression check on bulgaria/down-under/festa shell strings).

## 9. COMMIT STRATEGY (nothing committed — don't clobber Codex)
Everything is one atomic build unit (tracked files import the untracked Codex `@shared` modules). To commit: stage the 4 untracked `@shared` modules + `inline-edit.ts` + `premium-steps.ts` TOGETHER with all importers + the C# flexgrid models + the premium-templates/CSS, run the UI build to confirm imports resolve, then commit. Low-risk-standalone bundles (per the audit memory): server-platform cluster, `inputs.ts` (B311 icons), widget plugins, settings-popup i18n, the gen-scripts. See `memory/project_worktree_audit_b332_groundtruth.md` §commit-strategy.
