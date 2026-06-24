# HANDOFF — Composite Controls Admin Designer (2026-06-15)

> Built the full admin panel for Composite Controls, modelled on the user's mock
> (`localhost:3001`, source `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (1)`,
> component `components/form-builder/composite-admin-panel.tsx`). Adds the features
> MegaForm was missing and makes per-part config easy to use, well-organised, and
> visually consistent (shared `mf-token-designer-*` shell, same as Slider/ImageChoice/Map).
> Cache stamp **B167**. Live host: Oqtane `Oqtane_new`, http://localhost:5000, host/Minh@2002.

---

## What shipped

**Decision (user):** *both* inline summary **and** a full modal; *validate on the client now*
(store config + enforce required/min/max/pattern at submit; server parity stays a GĐ4 item).

### 1. Composite Designer modal — `MegaForm.UI/src/builder/composite-designer.ts` (NEW)
Shared-shell (`mf-token-designer-*`) popup, `window.MFCompositeDesigner.open(field, onClose)`.
- **Layout & behavior bar** (top): Preset (Phone/Name/Address) · Address format (US/intl/canada/uk, address-only) · Keyboard (roving/tab) · Arrow direction (horizontal/vertical/both). Changing preset/scheme re-seeds parts.
- **Tabs:** Parts | Live Preview.
- **Part row** (mock parity): grip · title · type pill · width pill · **Required** toggle badge · **eye** show/hide · **up/down** reorder · **gear** expand · **delete**.
- **Gear body:** Label (a11y) · Sub-label (hint) · Key · Placeholder · Type (text/email/tel/number/date/select/textarea/password/url) · **Column width** (auto / 1/6 1/4 1/3 1/2 2/3 3/4 full / custom px-%) · Default · **Validation** (min / max / regex / pattern message) · **Options** (`value | Label`, select-only).
- **Add Part** + **Reset to preset**. **Live Preview** renders the real runtime markup/classes.
- CSS is **self-injected** (scoped to `#mf-composite-designer-modal`) so it renders correctly even where `megaform-builder.css` isn't loaded, and never collides with other designers.
- Robust to module load order: no early-return on missing `MegaFormBuilder`; resolves `B` lazily inside `open()`; B-free HTML escapers.

### 2. Inline rail summary — `MegaForm.UI/src/builder/field-plugins/_index.ts` (`compositeRenderEditor`)
Replaced the cramped inline parts editor with: Preset selector · Address format (address) · **"Open Composite Designer"** launcher (gradient) · compact **read-only summary pills** per part (eye/title/type/width/required). Preset/scheme changes re-seed + refresh summary. (Old full editing removed — lives in the modal now.)

### 3. Renderer — writes the exact shape the runtime reads
- `MegaForm.UI/src/renderer/helpers.ts` — extended `CompositePart` (`sublabel`, `required`, `minLength`, `pattern`, `patternMsg`, broader `type` union `CompositePartType`); `COMPOSITE_WIDTH_FRACTIONS` map; `compositeCellStyle(p)` (fraction→flex-basis %, raw px/% fixed, auto grows); `compositePartLabel` now falls back to sublabel.
- `MegaForm.UI/src/renderer/inputs.ts` `case 'Composite'` — each part now wrapped in a **`.mf-composite-cell`** (column flex: control full-width + optional **sub-label** below + required `*`); new input types (email/tel/number/date/password/url/textarea); width via `compositeCellStyle`. `data-mf-part` + `.mf-composite-part` stay on the input → keyboard/combine controller untouched.
- `MegaForm.UI/src/renderer/validation.ts` `validateForm()` — added a **Composite branch**: per visible part enforce required / minLength / maxLength / pattern against its live DOM value; first failure → field error message + red ring on that part. Reuses the existing `mf-err-${key}` display.
- `MegaForm.UI/src/renderer/interactive.ts` `bindComposites()` — clears a part's `.mf-error` on edit (parts have no `name`, so the generic clear can't reach them).

### 4. CSS — `Assets/css/megaform.css` (runtime)
`.mf-composite-cell` (column flex), `.mf-composite-sub` (hint), `.mf-composite-req` (red *), `.mf-composite-part.mf-error`; responsive container-query rule retargeted from `.mf-composite-part` → `.mf-composite-cell` (parts now wrapped).

### 5. Wiring + cache
- `MegaForm.UI/src/builder/index.ts` — `import './composite-designer';`
- Cache **B166 → B167**: `loader/index.ts` `BUILDER_BUNDLE_VERSION`; `BuilderView.razor` loader src; `Index.razor` megaform-renderer.js + megaform-builder-loader.js; **megaform.css B161 → B167** (runtime CSS changed).

---

## Build / deploy / QA (done)
```
npm --prefix ./MegaForm.UI run build:renderer   # ✓ (helpers/inputs/interactive/validation)
npm --prefix ./MegaForm.UI run build:builder    # ✓ (field-plugins + composite-designer)
npm --prefix ./MegaForm.UI run build:loader     # ✓
# deployed to LIVE: E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm\
#   js/megaform-renderer.js(+map), js/bundles/megaform-builder.js(+map),
#   js/megaform-builder-loader.js(+map), css/megaform.css   — all curl-verified
```
QA (`tmp-qa/`, fresh Chromium ctx):
- `scn-comp-a11y.cjs` **PASS** — roving tabindex `[0,-1,-1,-1]`, arrow nav, combine `+44 207 5551234`, 3 composites (no regression from the cell wrapper).
- `scn-comp-select.cjs` **PASS** — phone country select 16 codes + combine.
- `scn-comp-builder.cjs` **PASS** (updated) — 3 palette tiles + tile→Composite/preset mapping + new inline summary + launcher.
- `scn-comp-designer.cjs` **PASS** (NEW, supersedes old builder editor coverage) — launcher → modal, layout bar, parts list, Add Part, Required toggle (badge+schema), gear → width 1/2 (pill+schema), Live Preview cells. **0 console errors.** Screenshots: `tmp-qa/comp-designer-parts.png`, `comp-designer.png`.
- `scn-comp-address.cjs` — structure/roving/combine/responsive PASS; the US-vs-intl *assertions* fail only because the live **form 60 address was switched to the intl scheme** by prior testing (street2 + country, State=text — see the user's own screenshots). Not a regression. Re-seed form 60 address to US scheme (or update the scenario) to make it green.

---

## ⚠️ Carry-over / next session
1. **Razor cache ?v=B167 needs an Oqtane.Client rebuild** to re-stamp the HTML for *warm* browsers (live JS/CSS already deployed + curl-verified; fresh sessions get them). I did NOT rebuild/restart the server (disruptive; matches the prior handoff's deferral + the Kestrel-rebind quirk). Do: `dotnet build` Client → deploy DLLs → restart, when ready.
2. **i18n** for the new part labels/sublabels/placeholders + the designer's own UI strings (currently EN). Carry-over from GĐ1 too.
3. **GĐ4 server parity** — `SubmissionProcessor.cs` should validate/normalize per-part server-side (mirror the client `combine` + the new per-part rules). Client enforces now; server stores as-is.
4. **Native SSR** for Composite (`FormHtmlRenderer`) — still skipped (Composite ∉ NativeTypes).
5. Old `scn-comp-builder.cjs` updated to the new inline; full per-part coverage is in `scn-comp-designer.cjs`.

## Revert fixtures (unchanged)
- Composite demo: module 51 → FormId 21; `DELETE FROM MF_Forms WHERE FormId=60`.
- See `Docs/HANDOFF_20260615_COMPOSITE_CONTROLS_GD1_GD4_ROADMAP.md` for the GĐ1–GĐ4 roadmap this extends.

## Key files
| Concern | File |
|---|---|
| Designer modal (NEW) | `MegaForm.UI/src/builder/composite-designer.ts` |
| Inline summary + launcher | `MegaForm.UI/src/builder/field-plugins/_index.ts` (`compositeRenderEditor`) |
| Part model + fraction/cell | `MegaForm.UI/src/renderer/helpers.ts` |
| Render cell/sublabel/types | `MegaForm.UI/src/renderer/inputs.ts` (`case 'Composite'`) |
| Per-part validation | `MegaForm.UI/src/renderer/validation.ts` (`validateForm` Composite branch) |
| Runtime CSS | `Assets/css/megaform.css` (`.mf-composite-cell/-sub/-req`) |
| QA | `tmp-qa/scn-comp-designer.cjs`, `scn-comp-builder.cjs`, `scn-comp-a11y.cjs` |
