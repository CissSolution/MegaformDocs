# HANDOFF — 2026-06-30: working-tree audit → 4 fixes + Premium-shell FlexGrid

> User asked to review the last Codex session, grasp the ACTUAL source state, and continue editing.
> Did a 10-cluster fan-out audit (ground truth in `memory/project_worktree_audit_b332_groundtruth.md`),
> then fixed all 4 chosen items with verify-first discipline ("kiểm tra hiện trạng rồi làm, không đoán mò").
> Live: `:5000` (Oqtane.10_new2, host/Minh@2002), **AssetVersion bumped B332→B333 + deployed** (exe restarted, healthy).

## 0. STARTING STATE (audited, not assumed)
- HEAD = `1096ae4` (buttons fix). Committed baseline AssetVersion = **B292**. Working tree was **B332** = ~10k lines Codex+Claude DEPLOYED-only, never committed. Handoff B327/B328 was STALE.
- **Commit-coupling:** tracked files import 4 UNTRACKED Codex `@shared` modules → one atomic unit. Still uncommitted (did NOT push — Codex's in-flight work; user runs Codex in parallel).

## 1. WHAT SHIPPED THIS SESSION (all on live :5000 @ B333, tsc-clean, NOT git-committed)

### A. 3 config/JSON defects (generator-level fixes → regenerated)
- **Icon-policy CONTRADICTION fixed.** `gen-template-facts.cjs` C7 used to MANDATE emoji/FA icons on cards, contradicting `PromptRecipes/build-native-rich-choices.md` (which FORBIDS AI-invented icons). Rewrote C7 → "do NOT invent/change/remove icons; keep existing verbatim; MegaForm catalog owns icon assignment" (now consistent with the recipe). Regenerated all 5 templates' facts+guide (DNN tracked + Oqtane/Web wwwroot).
- **Stale stepMechanism fixed.** Generator hardcoded `mechanism:'customHtml-wizard'` even for native-migrated templates. Added native detection (`premiumNativePageBreak`/`mfp-native-generated`/empty scriptTokens + data-step) → relabels to `premium-native`; C4/C5 step formula now describes native Section+pageBreak (not the deleted wizard script). All 5 templates now report `premium-native`.
- **Dup-key/3× customHtml bloat fixed.** `premium-native-migration.ts` mirrored the (huge) shell HTML onto the schema ROOT (`schema.customHtml` + `schema.CustomHtml`) AND settings → 3 copies in every premium template/DB row. Verified ALL consumers read `settings.customHtml` first (C# `[JsonProperty("customHtml")]`; theme-designer `||` fallbacks; resolver `PromoteLegacyRootSettings` only uses root when settings absent). Removed the schema-root mirror writes (4 spots) + cleaned the 2 Sample files via `scratchpad/dedup-premium-root.cjs` (string-aware depth-1 key removal: bulgaria 74→46KB, down-under 93→46KB; settings.customHtml intact, JSON valid).

### B. Double-serialize POST fix
- `inline-edit.ts save()` shipped settings in BOTH `SchemaJson` (`schema.settings`) AND `SettingsJson` → premium POST doubled the multi-KB shell (co-factor in the 75MB buttons-bug class). Verified `RenderModelResolver.ResolveSchemaJson` overlays SettingsJson (`OverlaySavedSettings`) so SchemaJson needs no settings copy. Fix: strip `schema.settings`/`Settings` from the SchemaJson serialization (`schemaForSave`).

### C. Dead-code cleanup (tsc-clean)
- `inline-edit.ts`: removed `pendingRowGrid`/`applyRowGrids`/`rowGridClause` + the dead `gridFind` branch (rowFieldInfo always returned `gridFind:null`).
- `dashboard/index.ts`: removed `getNewFormBuilderUrl()` (0 call sites after New Form→wizard).
- `Index.razor`: removed orphaned `SettingsInlineHostId` div + property + CSS (settings is a floating popup now, never inline).
- **flexgrid COLS bug:** `_gridGeom` fallback 12→24 (canonical default; a 12 fallback halved every placement on the 24-col grid).

### D. ⭐ Premium-shell FlexGrid (user chose "keep chrome + labels") — FULLY QA'd
**Model A (customHtml-resident grid)** — chosen because premium SSRs verbatim AND the client REBUILDS customHtml, so a field.placement model would FOUC/desync. The grid lives INSIDE customHtml → both paths render it, NO C#/renderer change. All in `inline-edit.ts` (markers `Premium FlexGrid v20260630`) + 1 CSS block:
- **Convert pill** (`maybeAddPremiumGridConvert`): premium `.mfp` forms with `[data-step]` field panels get "Chuyển sang lưới (giữ thiết kế premium)". Sets `STATE.pendingPremiumGridConvert`.
- **`wrapPremiumStepsIntoFlexGrid(html)`** (runs in save()): DOMParser wraps each step panel's field-bearing children in `.mf-flexgrid-item[data-mf-fg-key]` (full-width default), marks panel `.mf-flexgrid[data-mf-flexgrid]` + `--mf-grid-cols:24`. Keeps `{{field:KEY}}` tokens + ALL chrome + bespoke labels.
- **Editor**: dispatch handles MULTIPLE grids (one per step) + premium items; `enableFlexGridLayoutEdit` accepts `data-mf-fg-key`; **`_persistItem` checks `data-mf-fg-key` FIRST** (premium item wraps an au-field whose render ALSO has a `.mf-field-group` → would mis-route to field.placement). Premium → `STATE.pendingPremiumPlacement`.
- **`applyPremiumPlacements(html, map)`** (save()): DOMParser rewrites each item's `--lg/md/sm` vars by key.
- **⭐ Migration guard (CRITICAL):** `migratePremiumWizardSchemaToNative` runs on EVERY client render (helpers.ts:196) and its `reflowWizardFieldTokensBySchemaPages` MOVES `{{field}}` tokens to match schema page order → it was yanking tokens OUT of the wrappers (empty cells + orphan auto-placed fields → overlap). Added an early-return when `data-mf-flexgrid` is present (gridded = final, skip reflow). THIS was the fix that made the layout correct.
- **CSS** (`megaform.css`): premium step panel needs `display:grid !important` + FORCED `grid-template-columns: repeat(24,1fr) !important` + `grid-auto-rows: minmax(64px,auto)` (a premium panel is often ALREADY a grid with its own 2-col template that ties/beats `.mf-flexgrid`; without the override, items collapse into 2 cols and overlap). Active step = grid; inactive stays hidden (premium nav toggles `.is-active`).

**QA (all on live form 9 down-under, snapshot→test→RESTORE — safe):**
- `qa5000/qa-premium-flexgrid.mjs`: convert pill shows · convert+save+reload → 4 grid panels, 12 `data-mf-fg-key` items, active panel `display:grid`, stepper+brand chrome intact, au-field labels+icons intact, 0 token leak, 0 console errors, editor attaches (12 drag+12 resize). Screenshot `out/pflex-2-gridded.png` = premium look + clean 2-D grid.
- `qa5000/qa-premium-flexgrid-persist.mjs`: resize first item live 24→19 → save+reload → **persisted 19** (applyPremiumPlacements round-trip). PASS.
- `qa5000/diag-premium-grid.mjs`: geometry dump (used to find the migration-reflow bug).

## 2. DEPLOY (done)
- renderer JS (`Assets/js/megaform-renderer.js`) + `Assets/css/megaform.css` → live `<site>/wwwroot/Modules/MegaForm/{js,css}/` + repo Oqtane.Server wwwroot.
- AssetVersion B332→**B333**; `dotnet build MegaForm.Oqtane.Shared -c Release`; stopped exe → swapped `MegaForm.Oqtane.Shared.Oqtane.dll` (backup `.bak_pre_b333`) → relaunched → verified :5000 serves B333 + premium forms healthy.
- **NO Core.dll change** (premium-flexgrid is Model A = customHtml-only). gen-template-facts regen wrote to all 3 platform dirs.

## 3. FILES CHANGED (this session, on top of the existing uncommitted tree)
Modified(tracked): `Assets/css/megaform.css`, 10× `MegaForm.DNN/Resources/TemplateGuides/*.{facts.json,guide.md}`, `MegaForm.Oqtane.Client/Index.razor`, `MegaForm.Oqtane.Shared/AssetVersion.cs`, `MegaForm.UI/src/dashboard/index.ts`, `MegaForm.UI/tools/gen-template-facts.cjs`, `Samples/FormTemplates/Premium/{bulgaria,down-under}.json`.
Modified(untracked, Codex's): `MegaForm.UI/src/shared/inline-edit.ts`, `MegaForm.UI/src/shared/premium-native-migration.ts`.

## 4. FOLLOW-UPS / NOT DONE
- **NOT git-committed** (consistent with the whole uncommitted tree — don't clobber Codex's parallel work). To commit: the atomic unit (4 @shared modules + importers + flexgrid C# + premium-templates/CSS). See ground-truth memory §commit-strategy.
- Premium-flexgrid is **opt-in per form** (convert pill) + **multi-step premium-native only** (single-step premium / non-`.is-active` shells need separate handling). Standard/AI flexgrid unchanged.
- Premium grid default = each field full-width (host drags side-by-side). Could derive smarter initial widths from `au-grid-2`/`au-namerow` later.
- Other audited issues left (lower priority, see ground-truth memory): 184 unsplash URLs in `ai-knowledge-seed.json` (needs live-DB re-seed+re-export); multi-page standard flexgrid; ALLOWED_IMAGE_HOSTS drift (cosmetic).
