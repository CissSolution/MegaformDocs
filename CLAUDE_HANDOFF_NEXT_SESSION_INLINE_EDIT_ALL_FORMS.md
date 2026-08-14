# HANDOFF — NEXT SESSION: full Inline-Edit round (ALL standard + premium) + builder polish

> Date opened: 2026-06-29. Live **:5000** (host / Minh@2002) = **AssetVersion 20260629-B313**.
> Inline-edit Phase 1+2 is BUILT + deployed + verified end-to-end on ONE premium form (52). The NEXT
> session does a **full QA round of inline-edit across EVERY form type** (standard pure-grid, standard
> themed, premium customHtml-large, premium native-migrated, wizard), fixes the gaps that round surfaces,
> and **refines the builder** so the inline-edit + token-designer + premium editing UX is coherent.
> ⚠ Codex's premium-native work is still UNCOMMITTED — don't revert/clobber; `git add <path>` only.

---

## 0. WHERE WE ARE (what's live + verified)
- **`MegaForm.UI/src/shared/inline-edit.ts`** (NEW, v20260629-01) — host + Oqtane edit-mode click-to-edit of
  text on the RENDERED form. Wired into `renderer/index.ts` at the end of `init()` (try/caught, gated).
- **Gate** `isInlineEditContext()`: `?edit=true` in URL **AND** the MegaForm admin dock
  (`.mf-oq-linkbtn` / `[data-mf-shared-dashboard-badge]`) present → fires ONLY for a host in real edit mode.
  Verified: **0 tags when not in edit mode** (public visitors completely unaffected).
- **Phase 1 (shell strings)** + **Phase 2 (field/Section labels)** both tag + edit + save.
- **SAFE round-trip save** (Save pill): `GET /api/MegaForm/Form/{id}` (full entity) → apply ONLY the text
  swaps to `settings.customHtml` + the label changes to `schema.fields` → `POST /api/MegaForm/Form`
  echoing every other column → reload. **No field is ever nulled.**
- **VERIFIED live on form 52** ("âsá", Down-Under premium): 62 tagged = 47 shell + 15 field; edited the hero,
  Saved, persisted (DB-confirmed), reverted via the same flow → DB clean, Title/Status/fields intact.

Files: `CLAUDE_RESEARCH_20260629_INLINE_EDIT_SHELL_STRINGS.md` (design), handoff
`CLAUDE_HANDOFF_20260629_AI_ON_RAILS_KB_CATALOG_B310.md` §10 (delivery + gotchas).

---

## 1. NEXT-SESSION GOAL
**A full inline-edit QA round over ALL form archetypes + close the gaps + polish the builder + extend
inline-edit into full VISUAL editing.** Inline-edit (text) so far is proven on ONE premium form. We do not yet
know it behaves on every form shape. The deliverable, in order:
1. inline TEXT edit works cleanly + predictably on EVERY form type (standard + premium + wizard) — §2/§3;
2. the builder editing experience (token designer + inline edit) is coherent — §4;
3. **inline VISUAL editing**: image ops (change/replace/delete/add), drag-and-drop fields, and grid-snap —
   reusing the PDF-form widget's drag/snap engine + the existing gallery picker — §4b.
All host + edit-mode gated, saved via the same SAFE round-trip, never affecting the public render.

---

## 2. THE FORM ARCHETYPES — test inline-edit on each (build a matrix)
For EACH, enter host edit-mode (`?edit=true`) and verify: (i) the gate fires, (ii) the RIGHT things are
editable (no over/under-tagging), (iii) edit → Save → persist → reload shows the change, (iv) form integrity
intact (Title/Status/other fields unchanged), (v) public (non-edit) render is untouched.

| Archetype | Example | Shell strings? | Field labels? | Notes / risk |
|---|---|---|---|---|
| Standard pure-grid (AI default) | a plain AI form | none (no customHtml) | yes (`.mf-field-label`) | Phase 2 only. Verify field labels tag + save. |
| Standard themed | a `mf-theme-*` form | maybe header band text | yes | header band text may need tagging. |
| Premium customHtml-LARGE | form 52 (✓ done), EuroYouth | many (47 on f52) | yes | Phase 1 proven here. Re-verify on EuroYouth/Bulgaria/Festa. |
| Premium NATIVE-migrated | form 51 (customHtml ~558ch) | FEW/none (theme-driven) | yes (stepper labels = Section labels) | shell scan finds little; coverage relies on Phase 2 field/Section labels. VERIFY the stepper "STEP 1 About You" + step headings are editable via Phase 2. |
| Wizard | a wizard form | step labels | yes | confirm multi-step: are later-step labels in the DOM (hidden) and still taggable? |

Pick/instantiate one live form per archetype (the home module currently renders **form 52**; bind others or
use `?formid=N` admin override — note `?formid=` is a separate path, verify the gate + render there too).

---

## 3. KNOWN GAPS / POLISH BACKLOG (fix this round)
1. **Over-tagging the theme-preset picker.** On premium with a 12-swatch preset menu (`.au-preset-menu` etc.),
   the shell scan tags swatch labels ("Reef Turquoise", "Outback Ochre"…) as editable. Harmless but noisy.
   FIX: exclude the preset/theme picker (`.au-preset-menu`, `[class*="preset"]`, swatch lists) from the shell
   scan in `inline-edit.ts scanAndTag()`.
2. **Native-migrated premium shell coverage.** Forms like 51 have a tiny customHtml — the hero/brand text is
   theme/schema-driven, so Phase 1 finds little. Their stepper labels + step headings come from `Section.label`
   / field props (Phase 2). VERIFY Phase 2 covers them; if the hero/brand for native premium needs editing,
   that requires `{{content:}}` tokens (Phase 3 — see research doc §3/§5).
3. **`swapTextOnly` robustness.** It swaps the FIRST text-node occurrence of the exact string. If the same
   string appears twice in customHtml (e.g. two identical step intros), it could swap the wrong one. Consider
   carrying a locator (reuse token-designer's `collectShellStringDescriptors` → `mutateShell` locators) instead
   of text-match. This is the cleanest convergence with the builder (see §4).
4. **Save = full reload.** After save it does `location.reload()`. Fine, but a smoother in-place update (re-init
   the renderer with the new schema) would avoid the flash. Optional.
5. **`Form/List` is 5.9 MB; `Form/{id}` is 483 KB.** We use `Form/{id}` (good). Keep it.
6. **Field-label wrapping** (`findLabelTextSpan`): wraps a text node in a `<span class="mf-ie-textwrap">` when
   the label mixes icon + text + asterisk. Verify this doesn't disturb layout/required-asterisk on all field
   types (Composite, Chips/Cards group labels, Rating, etc.).
7. **i18n / multi-language forms.** If a form has `supportedLanguages`, editing text inline edits the BASE
   string, not the translation. Decide behaviour (probably: inline-edit only the active/base locale, leave
   `MF_FieldTranslations` to the dedicated translation UI). Document.

---

## 4. BUILDER REFINEMENT ("tinh chỉnh builder")
Goal: make the editing story coherent across the **builder token-designer** and the **on-canvas/on-render
inline edit**. Concrete items:
1. **Share ONE locator engine.** `token-designer.ts` has `collectShellStringDescriptors / mutateShell /
   setShellText / headerTargetLabel` (B311 gave them semantic labels). `inline-edit.ts` currently re-detects
   strings + uses text-swap. **Refactor the locator+swap logic into `@shared/shell-strings.ts`** and have BOTH
   consume it → identical detection, identical labels, no drift, and inline-edit can carry a precise locator
   (fixes §3.3).
2. **Surface inline-edit FROM the builder canvas too.** The builder canvas renders only fields (not the premium
   hero shell — the shell is in the separate preview). Decide: (a) make the builder PREVIEW interactive
   (click hero text → edit), or (b) keep shell editing in the Token Designer (now semantic-labelled, B311) +
   inline-edit on the live rendered form (done). Recommend (b) + a "✏️ Edit on page" deep-link from the builder.
3. **Native-migrated premium shell editing in the builder.** Form 51-type forms expose few shell strings in the
   Token Designer (collectShellStringDescriptors finds 0 because customHtml is tiny). Their stepper/headings are
   `Section.label` / field props — make sure the builder's Fields tab + the Token Designer together cover them,
   OR add a "Shell text" editor that reads the theme/schema strings. (This is the native-premium gap from B311.)
4. **Token Designer header labels polish** (B306 leftover #2): a few header strings may still get generic roles
   for unusual templates — extend `headerTargetLabel` per-template class maps if needed (Australia `.au-*`,
   Bulgaria `.bg-*`, EuroYouth `.ey-*`, Festa `.fi-*`).
5. **Duplicate-field cleanup UX.** Form 52 has 2 `row_name` rows (2× First/Last name) — see §6. The builder
   should make duplicate field keys obvious / preventable (a lint/warning in the builder when two fields share
   a key, since the AI edit that created form 52 duplicated the name row).

---

## 4b. ADVANCED VISUAL EDITING (Phase 4+) — image ops · drag-drop fields · grid snap
The next round extends inline-edit beyond TEXT into full in-place visual editing. All still **host + edit-mode
gated** + saved via the same SAFE round-trip (`GET Form/{id}` → mutate → `POST /Form` full entity).

### 4b.1 Image operations (change / replace / delete / add)
Forms carry images in 3 places: shell `<img>` in `settings.customHtml`, **Html fields** (`htmlContent`), and
background/hero images (CSS `background-image` / `--*-bg` vars). In edit-mode, hovering an `<img>` (or a
background-image element) shows an image toolbar: **Replace · Change source · Delete · (Add)**.
- **REUSE the existing image pipeline — do NOT build a new uploader.** `token-designer.ts` already exports
  `MFTokenDesigner.uploadImage` + `MFTokenDesigner.openGalleryPicker` (and has an "Image tokens" tab that
  swaps `{{image:KEY}}` / inline `<img src>`). Wire the inline image toolbar to those.
- Commit: Replace/Change → set the `<img src>` (or the `{{image:}}` content token / `background-image` url) in
  `settings.customHtml` (or `htmlContent` for an Html field) → round-trip save. Delete → remove the `<img>`
  node (or clear the bg var). Add → insert an `<img>` at a chosen slot (advanced; may stay builder-only).
- ⚠ Respect the existing image allowlist (IMG-001: only picsum.photos / placehold.co / data: / same-origin /
  the gallery) so we never reintroduce hallucinated/broken URLs. The gallery picker already enforces this.
- Image tokens vs raw `<img>`: prefer editing a `{{image:KEY}}` content token when the template has one
  (clean, theme-safe); fall back to direct `<img src>` swap for hardcoded images (text-only-ish swap, keep
  structure). Reuse the same locator engine as §4.1.

### 4b.2 Drag-and-drop fields ("kéo dán field")
Let the host drag a field on the rendered form to **reorder / move it between steps**, in edit-mode.
- Two layout regimes — handle both:
  - **Flow/grid layouts** (Row / Section / FlexGrid — the standard + most premium forms): dragging REORDERS
    fields within a container or moves them across Row columns / Sections / steps. Update `schema.fields`
    order (+ the field's parent Row/column/step) → for premium customHtml, also reflow the `{{field:KEY}}`
    token to the new panel (REUSE `shared/custom-html-insert.ts` `syncFieldPlaceholders` /
    `reflowWizardFieldTokensBySchemaPages` — the same engine the builder + premium-native migration use; see
    [[project_orphan_cleanup_reorder_d1]] / [[project_b3_premium_studio_keepstyle]]).
  - **Free/absolute layouts** (PDF-form style): true x/y drag — see 4b.3.
- A drag handle (⠿) appears on each field group in edit-mode; dragend → recompute order → round-trip save.
- ⚠ Premium "fixed-step" constraint (B306): whole-STEP reorder is still out of scope (the generated shell has
  fixed `data-step` panels). Field reorder WITHIN/ACROSS existing steps is fine; moving a field to another
  step must reflow its token into that step's panel.

### 4b.3 Grid snap — REUSE the PDF-form widget engine (already in the codebase)
The PDF form widget ALREADY implements draggable/resizable field overlays with grid-snap — reuse it as the
model (don't reinvent):
- **`MegaForm.UI/src/widgets/pdf-form-builder/renderer/FieldOverlay.ts`** — `snapTo(value, grid) =
  Math.round(value/grid)*grid` (L36); `attachDragResize(el, field)` (L350) = mousedown→move/resize, snaps x/y
  on move + width/height on resize, 4 corner handles (`addResizeHandles` nw/ne/sw/se, L341), `cssScale` for
  zoom, `minDim` 6, `onChange(id, {x,y,width,height})` callback, **Alt = bypass snap**.
- **`pdf-form-builder/index.ts`** — props `snapEnabled` (bool), **`gridSize: 8`** (default), `showGrid`
  (renders the grid background only when editing, not in preview).
- **Plan:** extract the snap/drag overlay into a shared `@shared/grid-drag.ts` (or import FieldOverlay's
  `snapTo` + handle pattern) so inline-edit can offer: (a) grid-snap drag for FlexGrid (snap to the 12-col grid
  / a px grid), and (b) optional free x/y positioning + resize for elements that support it. Show the grid
  overlay only in edit-mode; honour `snapEnabled`/`gridSize`; Alt to free-move; commit geometry to the
  field's layout props (FlexGrid col/span, or x/y/width/height for free mode) → round-trip save.
- Decide the GRID model: MegaForm's flow layout is **FlexGrid 12-col** (`type:'FlexGrid'`, `properties.cols:12`)
  + Row spans — snapping to columns is the natural fit for standard/premium; pixel-grid (gridSize 8) suits a
  future free-canvas mode. Start with FlexGrid-column snap (reuses existing layout), keep PDF-style px-snap as
  the reference for free mode.

### 4b.4 Scope / phasing for 4b
Phase 4a = image replace/delete (reuse gallery picker) — highest value, lowest risk. Phase 4b = field
drag-reorder in flow layouts (reuse syncFieldPlaceholders/reflow). Phase 4c = grid-snap drag (reuse
FieldOverlay) — biggest, do last. ALL gated to host edit-mode + round-trip save + must not touch public render.

---

## 5. TECHNICAL REFERENCE (so the next session moves fast)
**Inline-edit module:** `MegaForm.UI/src/shared/inline-edit.ts`
- `isInlineEditContext()` — gate. `scanAndTag(root)` — tags `.mf-ie-editable` (`data-mf-ie-kind` = `shell`|
  `field`, `data-mf-ie-key`, `data-mf-ie-orig`). `onBlur` records into `STATE.pendingShell` / `pendingFields`.
  `save()` — round-trip. `swapTextOnly` / `applyFieldLabels` — appliers. CSS injected by `injectStyle()`
  (`.mf-ie-editable`, `.mf-ie-savepill`, `.mf-ie-hint`).
- Wired in `renderer/index.ts` `init()` end: `initInlineEdit({formId, apiBaseUrl, schema, container})`.

**Endpoints (all need host session; admin):**
- `GET /api/MegaForm/Form/{id}` → full entity, camelCase (schemaJson/settingsJson/title/status/moduleId/siteId/
  themeJson/submitButtonText/successMessage/redirectUrl/enableCaptcha/requireAuth/enableSaveResume). ~483 KB.
- `GET /api/MegaForm/Form/List?moduleId=&siteId=` → all forms (~5.9 MB). Avoid unless needed.
- `POST /api/MegaForm/Form?authmoduleid=&authsiteid=` → SaveForm. **Send the FULL entity (PascalCase)** or
  columns get nulled. Uses the form's own moduleId (form 52 = moduleId **36**, not the page module 1826).
- ⚠ `GET /api/MegaForm/Submit/Schema?formId=` **404s for premium** — do NOT use for the round-trip.

**Edit-mode + login (Playwright):**
- Login: `/login`, **slow/sequential type** `host` / `Minh@2002` (a plain `.fill()` leaves Blazor `@bind`
  empty → silent no-login), press Enter on #password. Submit is `form button:has-text("Login")`, NOT `a.app-login`.
- Enter edit mode: must be logged in, THEN navigate `?edit=true` (the URL param alone, via direct nav before
  login, does NOT activate edit mode). In real edit mode the admin dock (`.mf-oq-linkbtn`) + `.app-pane-admin-border`
  appear → the gate fires.

**Build + deploy (per the proven procedure):**
- Renderer JS: `cd MegaForm.UI && node scripts/build-entry.cjs renderer` → syncs to 3 platform wwwroot dirs.
- AssetVersion: `MegaForm.Oqtane.Shared/AssetVersion.cs` → bump → `dotnet build MegaForm.Oqtane.Shared … -c Release`.
- Deploy live: backup → stop `Oqtane.Server.exe` → copy `bin/Release/net10.0/MegaForm.Oqtane.Shared.Oqtane.dll`
  to `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\` (site root) + `megaform-renderer.js` to `…\wwwroot\Modules\
  MegaForm\js\` → relaunch (`Start-Process … Oqtane.Server.exe -WorkingDirectory …`) → poll HTTP 200 + assert
  the new AssetVersion is served. Backups live at `…\_mf_b3{10,11,12}_backup\`.
- ⚠ GOTCHA: `megaform-renderer.js` builds from `src/renderer/index.ts` (the LIVE one, has the autoload + inline-
  edit). Do NOT run `build-renderer.cjs` (that's the legacy `megaform-renderer.ts`). Individual `js/plugins/
  megaform-widget-*.js` are NOT built by `npm run build` (find the per-plugin build before changing a plugin).

---

## 6. KNOWN BUGS TO FIX (surfaced this session)
1. **Form 52 duplicate name fields** — `"key":"first_name"` appears 4× + `row_name` 2× in its SchemaJson → the
   form renders First/Last name TWICE (user-reported). Data issue in that form (an AI edit likely added a name
   row without removing the original). FIX: remove the duplicate row in the builder; consider a builder lint
   that warns on duplicate field keys. NOT a systemic renderer bug.
2. (From the B310/B311 work, still open — see that handoff): C# `BuildAssetManifest` cases + payment-unified
   legacy aliases are source-done but NOT deployed (Server DLL / per-plugin build); `gen-template-facts` C#
   `ResolveOptionIcon` parity (Core.dll) not deployed (client TS covers the visible result). `schema.rules`
   server-side re-validation gap (security). Card-icon emoji guidance shipped.

---

## 7. ACCEPTANCE (per form type, this round)
For each archetype in §2: PASS = gate fires only in host edit-mode · correct nodes editable (no preset-picker
noise, no missing stepper/heading) · edit→Save→reload persists · form entity intact (diff SettingsJson/SchemaJson:
ONLY the edited text changed) · public render byte-identical to before · no console errors. Record a matrix.
Builder refinement PASS = one shared locator engine, consistent labels, native-premium shell editable somewhere,
duplicate-key lint.

## 8. POINTERS
- Inline-edit: `MegaForm.UI/src/shared/inline-edit.ts`, `renderer/index.ts` (init end).
- Shell-string engine to share: `builder/token-designer.ts` (`collectShellStringDescriptors`, `mutateShell`,
  `setShellText`, `headerTargetLabel`; image: `MFTokenDesigner.uploadImage`, `openGalleryPicker`).
- Renderer field/label markup: `renderer/inputs.ts` (`.mf-field-label`, `renderOptionItem`), `renderer/index.ts`.
- **Grid-snap / drag-resize engine to reuse (§4b.3):** `MegaForm.UI/src/widgets/pdf-form-builder/renderer/
  FieldOverlay.ts` (`snapTo` L36, `attachDragResize` L350, resize handles L341), `pdf-form-builder/index.ts`
  (`snapEnabled`/`gridSize:8`/`showGrid`).
- **Field reorder / token reflow to reuse (§4b.2):** `shared/custom-html-insert.ts` (`syncFieldPlaceholders`,
  `reflowWizardFieldTokensBySchemaPages`), `shared/premium-native-migration.ts`.
- FlexGrid layout (grid model): `dashboard/wizard/field-catalog.ts` (`FlexGrid`, `properties.cols:12`),
  `renderer/inputs.ts renderFlexGridElement`.
- Save: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (`SaveForm` POST /Form ~L332; GET Form/{id}).
- Memory: [[project_ai_on_rails_kb_catalog_b310]] (B310→B313 + inline-edit + all gotchas),
  [[project_orphan_cleanup_reorder_d1]], [[project_b3_premium_studio_keepstyle]] (reorder/token-reflow).
- Research: `CLAUDE_RESEARCH_20260629_INLINE_EDIT_SHELL_STRINGS.md`.
