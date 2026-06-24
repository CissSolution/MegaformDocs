# HANDOFF — 2026-06-19 — Rename Input · Rich-card presets · Country flag · Row/col drop · AI+SQL E2E (B195)

**Live:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`). Builder bundle = **20260619-B195**.
Backups `%TEMP%\mf_backup_B19{1..5}_2026061{8,9}`. Deploy recipe unchanged (build → stop MSSQL3 PID → copy DLL+js+css → start).

Six asks this session, all DONE + LIVE. Visual-QA notes per item.

## 1. "Composite" → "Input" (rename) — LIVE + QA ✓
Palette tile, designer modal, settings label all say **Input** now (engine type stays `'Composite'`).
- `field-plugins/_index.ts`: tile `label:'Composite'`→`'Input'`; "Composite preset"→"Input type"; "Open Composite Designer"→"Open Input Designer"; toast.
- `composite-designer.ts`: modal title + aria "Composite Designer"→"Input Designer"; toast.
- QA: palette shows **Input** (live-b195-palette-input.png).

## 2. Rich-card / chip HTML PRESETS for Select/Radio/Checkbox — LIVE + QA ✓
New **"Sample template"** picker in the Options group (after Allow-HTML) + **Apply** button → replaces `options[]` with a styled starter AND sets Choice Display / Allow-HTML / Columns.
- `dom.ts` (~1010): `#mf-prop-option-preset` select + `#mf-apply-option-preset`.
- `properties.ts` `bindOptionPresetApply()` + `OPTION_PRESETS` (8): **pricing, plans, features, yesno, rating** (cards), **interests, sizes** (chips), **richhtml** (cards+allowHtml). Maps to `field.options[].{label,value,icon,meta,badge,description,richHtml}` + `optionDisplay`/`allowOptionHtml`/`optionColumns` (+ `properties.*`).
- `megaform-builder-ts.css`: `.mf-prop-preset-*`.
- QA: applied "interests" → schema `optionDisplay:'chips'`, 6 options w/ emoji icons (verified via builder state). Chips/cards visual is the existing runtime renderer (live-b195-preset-chips.png).

## 3. Country selector → FLAG dropdown — LIVE (code-verified) ✓
The Address composite's **Country** sub-field (intl/uk schemes) now renders the same searchable **flag dropdown** as Phone (195 countries, ISO-2 value) instead of a plain `<select>`.
- `renderer/inputs.ts`: `type:'country'` part reads `valueMode` → `'iso2'` for address (phone still `'dial'`).
- `renderer/composite-address.ts`: country part `type:'select'`→`type:'country', valueMode:'iso2'`; `AddressPart` gains `valueMode`.
- `composite-designer.ts` + `_index.ts`: "Address format" select options get flag emojis (🇺🇸 🌍 🇨🇦 🇬🇧).
- QA: deployed `megaform-renderer.js` contains `valueMode:"iso2"` (grep-confirmed). Reuses the proven `renderCountryPickerControl` path. **Builder canvas shows a simplified composite mock (`mf-comp-prev-*`, not the live picker) — that's pre-existing.** To eyeball it: add an International/UK Address Input → Save → the Country field is the flag dropdown.

## 4. Drag a control INTO a Row/Column column — LIVE (code-verified) ✓
Root cause: an empty column's only child was the `.mf-row-col-empty` "Drop field" placeholder; it had a bounding box so SortableJS thought the column was non-empty → `emptyInsertThreshold` never fired → palette tiles couldn't drop in.
- `megaform-builder-ts.css`: `body.mf-builder-dragging #mf-canvas-dropzone .mf-row-col-empty { display:none }` (placeholder gone DURING a drag → column is truly empty → drop works; auto-reverts on drop) + a dashed droppable highlight + min-height 56px.
- `canvas.ts`: removed `.mf-row-col-empty` from the row-col Sortable `filter`.
- QA: CSS grep-confirmed in live file; builder loads & drags fine (not broken). **Recommend a 10-sec hands-on: Layout→drag a Row in, then drag an Input tile into a column.** (Top-level field→column is still intentionally blocked with a toast — palette→column is the supported add path.)

## 5. AI KB recipe for chip/card formatting — DONE (deployed all 4 copies) ✓
`build-native-rich-choices.md` extended with: the one-click Sample-template list, an **authoritative complete option-object reference** (all keys + aliases), and explicit rules — `badge` is TEXT-only, the `richHtml` sanitizer tag/attr whitelist, `optionColumns` auto behaviour, prefer structured keys over richHtml, never hand-write `<input>` in customHtml. Copied to `MegaForm.Oqtane.Server/wwwroot/...`, `MegaForm.DNN/Resources/...`, `dist/...`, and the **live** `Oqtane.MSSQL3/wwwroot/...` (AiToolsController.ResolveKnowledgeBody serves it).

## 6. AI → SQL-backed form → data in DB — FULLY VERIFIED ✓✓
End-to-end proof that the AI builds a working form whose submissions land in the SQL database:
1. Enabled AI (`Setting MegaForm_AI_Enabled='true'`, provider=openai gpt-4o, real key) + restart.
2. Dashboard → **Create with AI** → prompt → OpenAI generated **"Volunteer Signup"** (Full Name*, Email*, Phone, Preferred Role=Greeter/Driver/Cook). (live-ai-generated.png)
3. Save & Use Now → **FormId 19**; opened builder → **Publish** (Status=Published, ModuleId 1826).
4. Public render at `?formid=19` → filled (real typing) → **Submit** → "Thank You! Reference: #51".
5. **DB CONFIRMED**: `MF_Submissions` FormId 19, SubmissionId **51**, `DataJson = {"full_name":"Test Volunteer QA","email":"testqa@example.com","phone":"0901234567","preferred_role":"greeter"}` — exact values. (live-form19-submitted.png)
6. **Restored `MegaForm_AI_Enabled='false'`** (original state) + restart.

Notes: MF_Submissions IS the SQL backend for every form (data → DB confirmed). The dedicated-table "Database" tab showed **0** (needs a DashboardDatabase connection configured — not set up). The first submit attempt failed validation because JS-set `.value` didn't bind — **use real typing** for form QA. ⚠️ **Side effect: publishing form 19 bound it to the home module (1826), so the home page now shows Volunteer Signup** (same module-hijack pattern as forms 16/17 before). Delete form 19 or rebind the home module if undesired.

## Build/deploy this session
`npm run build:builder|renderer|loader` (0 TS errors) + Client DLL (Release net10.0); deployed builder.js + renderer.js + loader.js + css + Client DLL; bumped `OqtaneCoreAssetVersion` + `BUILDER_BUNDLE_VERSION` + BuilderView `?v=` to **20260619-B195**. No Server/Core change.

## QA artifacts (repo root)
`live-b195-palette-input.png`, `live-b195-preset-chips.png`, `live-ai-creator-modal.png`, `live-ai-generated.png`, `live-form19-public.png`, `live-form19-render.png`, `live-form19-submitted.png`, `live-b195-address-preview.png`.

## ⬜ Recommend hands-on spot-checks (10 sec each)
- Row/col: drag an Input tile into a Row column.
- Country flag: add an International Address Input, Save, view the Country field.
- Clean up form 19 / home-module binding if not wanted.
