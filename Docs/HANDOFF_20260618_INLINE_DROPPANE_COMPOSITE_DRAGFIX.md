# HANDOFF — 2026-06-18 — Composite palette unify v3 · Inline field-properties drop-pane · Drag-sort smoothness (B191)

> 🔴 **UPDATE 2026-06-19 (B194): the inline field-properties drop-pane (§2 + §3 below) was REVERTED at the user's request** ("phục hồi lại right pane như cũ, bỏ cái drop pane đi vì không hợp lý"). The right pane is back to its original behaviour (field props edit in the right-rail Design Studio). **STILL LIVE / NOT reverted:** §1 Composite palette consolidation and §4 Drag-sort smoothness. Do not rebuild the drop-pane unless re-asked. See memory `project_20260618_inline_droppane_and_dragfix`.

**Live:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`). Deployed + restarted (new PID after each restart). Backups at `%TEMP%\mf_backup_B191_20260618`.
**Cache version this session:** `OqtaneCoreAssetVersion` B189 → **B193** (Index.razor:1057); `BUILDER_BUNDLE_VERSION` B190 → **B193** (loader/index.ts:24); BuilderView.razor loader `?v=` B180 → **B193**. (B191 = first cut, B192 = right-pane-restore fix, B193 = Options tab.)
**Status: ALL features DONE + LIVE + Visual-QA PASS.**

> ⚠️ **Correction history (read this):** B191 first hid the WHOLE right panel (wrong). User clarified: *restore the right pane with all its tabs, only remove the "Field Properties" pane from inside it, and put Field Properties into the drop-pane split across its tabs.* B192 reverted the hide + removed only the Field-Properties card; B193 added the Options tab so choice-field options stay editable. The §3 below reflects the FINAL (B193) design, not the B191 hide.

This deploy also rolled in the previously-PAUSED **B190 safe gallery server endpoint** (the builder bundle now contains B190's gallery client which sends moduleId/siteId; to avoid re-arming the dangerous B189 bulk-create endpoint we rebuilt + deployed the **B190-safe** `MegaForm.Oqtane.Server`+`MegaForm.Core` DLLs as a matched pair). So the form-16/17-clobbering bulk-create bug is now CLOSED on live.

---

## 1. Composite palette unify v3 (B186 → fold the visible tiles to ONE control)

User decision (AskUserQuestion + the "quá nhiều" screenshot): **hide 9 per-type tiles** — Short Text, Long Text, Email, Number, Website URL, Phone (parts), Full Name, Full Name +, SSN — and surface **one "Composite" control** whose type is picked in Settings → "Composite preset". Kept visible: Date of Birth, Time, Email+Confirm, Password+Confirm (Basic) + Address + the Layout-tab field-groups.

- `MegaForm.UI/src/renderer/helpers.ts` — unchanged META (still the single source of labels/icons + the preset dropdown list).
- `src/builder/field-plugins/_index.ts` — new `UNIFY_HIDDEN_TILES = {text,textarea,email,number,url,phone,name,name_plus,ssn}` map applied in the META→tile registration loop: those presets register `category:'hidden'` (stay in `COMPOSITE_PRESET_META` so the dropdown still offers them; stay in `compositeAliasToPresetMap()` so legacy `CompositePhone…` fields still map). The generic **`Composite` plugin flipped `category:'hidden'`→`'basic'`, sortOrder 5** → it's now the FIRST Basic tile.
- `src/builder/core.ts` `createFieldFromTemplate` — a bare `Composite` tile drop now defaults `widgetProps.preset='text'` (was `'name'`) and gives a freshly-dropped one the preset's friendly label.
- Verified live: Basic tab shows **Composite, Date, Dropdown, MultiSelect, Radio, DOB, Checkboxes, Time, Email+Confirm, Password+Confirm, File, Rating, Signature, Rich Text, Unique ID, CAPTCHA, Multi-Column Combo** — the 9 text-family/part tiles are gone. (The full-fold server compensation from B186 is unchanged & still live.)

## 2. Inline field-properties drop-pane (ports `mega-form-admin-redesign (4)`)

The mock (`app/builder/page.tsx:1132-1271`) edits a field via an inline pane UNDER its card with tabs **Basic | Validation | Advanced** + a gear that toggles it. Ported into the vanilla-TS builder, ADDITIVE (does not touch the existing right-panel property system — `showProps`/`settingsGroups` still run, just hidden):

- `src/builder/canvas.ts` — new self-contained subsystem after `openFieldSettings()`:
  - State `openDropPaneKey` (by **field.key**, reorder-safe) + `dropPaneTab`.
  - `buildFieldDropPane()` / `dpBodyHtml()` render the tabs **Basic | (Options) | Validation | Advanced**. **Basic**: Label, Placeholder (skipped for Section/Html/Hidden/Checkbox/Radio/Divider), Help Text, Required. **Options** (B193, only for choice fields per `dpHasOptions` = Select/Radio/Checkbox/MultiSelect): add/edit/remove rows bound to `field.options`, live preview via `dpSyncPreview` (rebuilds the card `.mf-field-content` from `renderFieldPreview` — the pane is a sibling so option-edit focus survives). **Validation**: Required + (text-like only: Min/Max Length grid + Pattern) + Error Message. **Advanced**: Field ID/Key (mono), Default Value, Read Only, CSS Class. `dpIsTextLike()` gates the length/pattern rows (Text/Textarea/Email/Number/Url + scalar-preset Composite).
  - Inputs bind straight to the field (resolved by key each change). Label/Placeholder/Required **live-patch the card preview WITHOUT a full re-render** (`dpUpdatePreview` targets `.mf-inline-label-text`/`.mf-req`/`.mf-inline-placeholder-text`) → focus preserved while typing. Key edits on `change` (blur), everything else on `input`.
  - `maybeAttachDropPane()` appends the pane when a card renders for the open field; `selectField()` sets `openDropPaneKey`; the card gear (`.mf-edit-field`) TOGGLES it.
- `src/styles/megaform-builder-ts.css` — `.mf-fdp*` block (tabs `border-bottom` indigo `#6366f1` active, `h-8`/`text-xs` inputs `bg #f1f5f9` focus→white, iOS switch, grid-2 for min/max). Pixel-matched to the mock tokens (Geist, radius 8-9px).
- Verified live: Basic/Validation/Advanced all render correctly; live label edit updates the preview instantly.

## 3. Right pane RESTORED; only the "Field Properties" card removed from it (FINAL design)

The right pane stays exactly as before with ALL tabs (Design Studio→Form Settings + Custom HTML, DB, Rules, Access, BPMN/Workflow, Print, Theme). The ONLY change inside it: the **"Field Properties" launcher card is removed from the Design Studio** (field editing now lives entirely in the drop-pane).

- CSS (megaform-builder-ts.css): `#mf-design-launcher .mf-design-acc-item[data-mf-acc-id="field"] { display:none !important; }` — markup stays (properties-patch.ts accordion wiring is defensive: `if(!item)return`), `#mf-field-props` stays in DOM so `showProps` (still called on select) doesn't error.
- Reverted from B191: removed `body.mf-rp-hidden` default, the top-bar gear `#mf-btn-props-toggle` (dom.ts), and the `initInlineDropPane()` hide/gear/mode wiring in canvas.ts.
- Verified live (B192/B193): select a field → drop-pane opens under it; right pane unchanged (Design Studio = Form Settings + Custom HTML; tabs DB/Rules/Access/BPMN/Print intact).

## 4. Drag-sort smoothness (user: "drag sort chạy rất không mượt — fix luôn")

Diagnosis (canvas.ts): the per-frame jank is the **forceFallback clone repainting a big `0 16px 40px` shadow every pointer frame** + `animation:200ms` easing + aggressive edge-scroll. (The common top-level reorder already does NOT full-re-render — `onEnd` 2686-2705 only splices + `syncCanvasIndexes`.)

Conservative, low-risk fixes (kept `forceFallback:true` to preserve the hard-won clone-width-locking):
- `megaform-builder-ts.css` — the `.mf-sortable-drag/.mf-sortable-fallback` clone: shadow `0 16px 40px rgba(99,102,241,.28)` → **`0 6px 16px rgba(15,23,42,.16)`** + **`will-change:transform`** (promotes the moving clone to its own GPU compositor layer → translate composites instead of repainting) + `pointer-events:none`.
- `canvas.ts initMainSortable` — `animation 200→140`, `scrollSensitivity 56→40`, `scrollSpeed 14→10`.
- Verified live: Sortable still initialised (`.mf-canvas-fields[data-mf-sortable-ready="1"]`, 18 handles intact).

---

## Build + deploy done this session
- `npm run build:builder` + `npm run build:loader` (0 TS errors; CSS auto-synced by the vite syncPlatforms plugin).
- `dotnet build MegaForm.Oqtane.Server -c Release -f net10.0` (+Core, matched pair) + `MegaForm.Oqtane.Client -c Release` (0 errors).
- Deployed to `Oqtane.MSSQL3`: Server.Oqtane.dll + Core.dll + Client.Oqtane.dll → root; `megaform-builder.js`(+map) → `wwwroot/Modules/MegaForm/js/bundles`; `megaform-builder-loader.js`(+map) → `js`; `megaform-builder-ts.css` → `css`. Stopped ONLY the MSSQL3 PID, restarted, :5070 back HTTP 200.

## QA artifacts (repo root)
`mock4-builder-full.png`, `mock4-droppane-{basic,validation,advanced}.png` (mock targets); `live-b191-builder-1.png` (palette+hidden panel), `live-b191-droppane.png` (Basic), `live-b191-dp-validation.png`, `live-b191-dp-advanced.png`, `live-b191-gear-rightpanel.png` (gear reveals panel), `live-b191-design-mode.png` (Design→Theme).

## ⬜ Follow-ups / polish (next session, low priority)
- The card's floating hover actions (gear/copy/delete sliders icons + left grip) sit at the card's vertical centre, so with the pane open they hover near the tab bar — minor overlap. Reposition or hide them while `.mf-fdp-host` is open for exact mock parity (mock: gear/copy/delete at `-right-3 top-3`, grip `-left-3`).
- The mock's Advanced tab also has Hidden-Field + Autofill toggles — omitted here (no clean field mapping); add if the renderer gains a `hidden`/`autocomplete` flag.
- FULL right-panel removal like the mock (relocate Form Settings/Logic/Workflow to dedicated top-bar buttons instead of the gear-reveal) — left as a deliberate, confirm-with-user step so no function is silently lost. Current design = hidden-by-default + gear/Design-mode reveal, which preserves everything.
- Real drag FPS profiling on a 50-field form (Chrome Perf trace) to confirm the smoothness gain numerically; deeper wins available (drop `forceFallback`, init Sortable once for row/flexgrid) but higher regression risk.

## Memories written
`project_20260618_composite_unify_v3_one_tile`, `project_20260618_inline_droppane_and_dragfix` (+ MEMORY.md pointers).
