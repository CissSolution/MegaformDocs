# HANDOFF — MegaForm Composite Controls: GĐ1–GĐ4 Roadmap (2026-06-15)

> Single source for continuing the **Composite Controls** feature next session.
> Live host: Oqtane `Oqtane_new`, http://localhost:5000, host/Minh@2002.
> **DEPLOY GOTCHA (always):** the running site serves from
> `E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm` — NOT the source-project
> wwwroot and NOT what `MegaForm.UI/tools/deploy-live.cjs` targets. After `npm run build`,
> COPY bundles to that path and `curl`-verify. Fresh Playwright contexts bypass cache.

---

## 0) What a Composite Control is (ratified architecture — do NOT change)

A **Composite Control = ONE business field, rendered as MULTIPLE sub-inputs, stored/validated
as a SINGLE value.** e.g. Phone renders `[+1][Area][Number][Ext]` but submits one `phone` value.

**Build ONE core `Composite` field type + PRESETS — never N separate widgets.**
```json
{ "type":"Composite", "key":"phone", "label":"Phone",
  "widgetProps": { "preset":"phone", "nav":"roving", "orient":"horizontal",
    "parts":[ {"key":"country","type":"select","options":[...],"width":"96px","def":"+1"},
              {"key":"area","width":"74px","maxLength":4},
              {"key":"number","flex":1}, {"key":"ext","width":"74px"} ] } }
```
The hidden `<input name=key>` carries the combined value, so the EXISTING
`getFieldValue/collectFormData/validateForm` default path reads it unchanged — **all composite
work is additive; zero existing field/widget code is touched.**

---

## 1) Phase status

| Phase | Scope | Status |
|---|---|---|
| **GĐ1** | Core engine + **Phone / Name / Address** + builder palette/props + **WAI-ARIA keyboard** + **Address template/schemes** | ✅ **DONE + live-proven** (cache B166) |
| **GĐ2** | **DateParts** (segmented date) + **Money/Unit** | ⬜ planned |
| **GĐ3** | **SSN/TaxId** (masking) + **OTP** (send/verify/expire/resend) | ⬜ planned (security/backend-heavy) |
| **GĐ4** | **Production hardening + platform parity + integration surface** | ⬜ planned |

Per-control complexity (user-rated): Phone=medium, Name=easy, Address=medium-high, DateParts=medium,
Money=medium, SSN=high (masking/security), OTP=high (workflow/backend).

---

## 2) GĐ1 — DONE (detailed)

### 2a. Core engine (renderer)
- `src/renderer/helpers.ts` — `CompositePart` interface (`key,placeholder,label,width,flex,maxLength,def,type:'text'|'select',options,row?,hidden?`); `COMPOSITE_PRESETS` (phone/name/address `{parts,combine}`); `COMPOSITE_DIAL_CODES` (16); `compositePartsFor(field)` (resolves `widgetProps.parts` → preset → **address scheme**); `compositePartLabel(part)` (accessible name: label → known-key map → placeholder → humanized).
- `src/renderer/inputs.ts` — `case 'Composite'` (~L454): container `role="group"`+`aria-label`+`data-mf-nav`+`data-mf-orient`; groups VISIBLE parts into `.mf-composite-row` by `part.row` (default 0 = single row); skips `hidden`; each part `aria-label` + **roving tabindex** (first visible=0, rest=-1); `select` vs `text` branch; falls back to plain text input if no parts.
- `src/renderer/interactive.ts` — `bindComposites()` (~L28): combine→hidden (unchanged) + auto-tab on maxLength + **roving-tabindex keyboard controller**. `nav='tab'` opts out. `orient`: `horizontal`=L/R caret-aware, `vertical`=U/D always-move, `both`=both (address grid). Select parts: Left/Right rove, Up/Down native value. Text: arrow at caret EDGE moves part, Backspace-at-start lùi, Ctrl+Home/End=first/last.
- `Assets/css/megaform.css` (~L1054) — `.mf-composite`(column flex)/`.mf-composite-row`(row flex)/`:focus-within` ring/`.mf-composite-part:focus` highlight + container-query `@container (max-width:480px)` stacks each part full-width (+ `@supports not` viewport fallback).

### 2b. Address = TEMPLATE control (schemes)
- `src/renderer/composite-address.ts` (**shared** — imported by renderer helpers AND builder editor): `AddressScheme` `us|intl|canada|uk`; `COMPOSITE_US_STATES`(50+DC), `COMPOSITE_CA_PROVINCES`(13), `COMPOSITE_COUNTRIES`(40); `addressPartsForScheme(scheme)`; `combineAddress(v)`.
- Layout (`part.row`): row0 **Street**(full) · row1 **Apt/Address-Line-2**(full, hideable) · row2 **City|State|ZIP** (flex 2|1|1 = 50/25/25) · row3 **Country**(full; intl+uk only). Scheme swaps: State control (US/CA=`<select>`, intl/uk=text), ZIP label (ZIP/Postal Code/Postcode), Country presence.

### 2c. Builder (authoring)
- `src/builder/field-plugins/_index.ts` — 3 palette tiles `CompositePhone/Name/Address` (category basic); hidden `Composite` plugin owns props; `compositeRenderEditor` (~L279): preset selector + **Address format** scheme selector (address-only) + **Keyboard**(roving/tab) + **Arrow direction**(horizontal/vertical) + per-part rows [show/hide checkbox · key · placeholder · width · type(text/select)+options · **Accessible label**] + Reset. Builder mirror `MF_COMPOSITE_PRESETS` (phone/name) + shared `addressPartsForScheme` for address.
- `src/builder/core.ts` `createFieldFromTemplate` — rewrites the 3 tiles → `type:'Composite'`+`widgetProps.preset` (single chokepoint, covers all drop paths).

### 2d. SSR
- Composite NOT in `FormHtmlRenderer.NativeTypes` → `ContainsHydrationWidget=true` → SSR skipped on Oqtane → client renders. Works; **native SSR is a GĐ4 item.**

### 2e. QA (all PASS, fresh ctx, 0 console err) — `MegaForm.UI/tools/mf-hb.cjs --eval <scn>`
- `tmp-qa/scn-comp-a11y.cjs` — phone: role=group, aria-labels, roving tabindex `[0,-1,-1,-1]`, arrow nav, caret-aware, Backspace-back, auto-tab, 1 tab-stop, combine.
- `tmp-qa/scn-comp-select.cjs` — phone country select (16 dial codes), combine `+44 207 5551234`.
- `tmp-qa/scn-comp-address.cjs` — 3 rows, State 52-opt select, 2-axis roving, combine `123 Main St, Apt 5, San Diego, CA 92101`, responsive stack.
- `tmp-qa/scn-comp-builder.cjs` + `scn-comp-addr-builder.cjs` — palette+mapping+editor; us→intl scheme swap (adds Country/State-text/Postal Code); show/hide writes `parts[].hidden`.

### 2f. LIVE DEMO (running) + REVERT when done
- `/test-template-page/botanical-volunteer-story` = **module 51 → FormId 60** (3 composites). Revert: module 51 Setting `FormId`+`MegaForm:FormId` → 21; `DELETE FROM MF_Forms WHERE FormId=60`.

### 2g. Carry-over from GĐ1 (do these next session, cheap)
- **Cache `?v=` NOT bumped** → warm browsers keep old bundles until a Blazor client rebuild re-stamps. Bump B166→**B167** in `Index.razor`/`BuilderView.razor` + loader `BUILDER_BUNDLE_VERSION`, then rebuild Client. (Live JS files already updated; fresh sessions get them.)
- **i18n part aria-labels/placeholders** — currently EN fallback via `compositePartLabel`. Localize via the i18n catalog (keys e.g. `form.composite_part_area`).
- **Retired-widget Core DLL** — `FormAssetManifestService.cs` had `repeater`/`infinitelist` cases removed (renderer manifest). Source compiles 0 err but DLL NOT hot-swapped to live (dormant — builder can't add them now). Deploy on next normal Core build.

---

## 3) GĐ2 — DateParts + Money/Unit (planned)

### DateParts (segmented date) — the cleanest showcase of the composite keyboard model
- **Preset** `date`: parts `[day(spin), month(spin/select), year(spin)]`; `combine` → ISO `YYYY-MM-DD`; scheme-aware order (US `MM/DD/YYYY` vs intl `DD/MM/YYYY`).
- **NEW part kind** `type:'spin'` (spinbutton): `role="spinbutton"`+`aria-valuenow/min/max`; ArrowUp/Down change value, Left/Right rove (pure roving — NO caret conflict, the ideal case the user cited: Day→Month). Add a `case` in `inputs.ts` renderPart + a spin branch in `interactive.ts` keydown (Up/Down increment/decrement + wrap; type-to-set with auto-advance).
- Extension points: `helpers.ts` COMPOSITE_PRESETS.date + `CompositePart.kind`; `inputs.ts` renderPart spin branch; `interactive.ts` spin keydown; reuse `combine`. orient default `horizontal` (single row). ~medium.
- Note: distinct from the existing `DateTimePicker`/`Calendar` widgets (those are popup pickers); DateParts = inline typed segments.

### Money/Unit
- **Preset** `money`: parts `[currency(select), amount(text, numeric mask)]`; `combine` → `{currencyISO}{amount}` or store `{amount, currency}`; thousands/decimal formatting on blur.
- **Preset** `unit` (measure): `[value(text), unit(select)]` e.g. `[12][kg]`.
- Extension points: presets + a numeric-format helper; amount part stays text with input-filtering. ~medium.

---

## 4) GĐ3 — SSN/TaxId + OTP (planned, security/backend-heavy)

### SSN / TaxId
- Segmented `[3][2][4]` (US SSN) with **masking** (show `•••-••-1234`) + reveal toggle.
- **SECURITY:** do NOT store raw in plaintext; combine to a tokenized/last-4 value; full value (if needed) encrypted server-side. Touches `SubmissionProcessor` + storage. ~high.

### OTP
- Segmented `[_][_][_][_][_][_]` code entry (the segmented-code pattern — auto-advance + paste-spread + Backspace-back, already half-covered by the keyboard controller).
- **Backend workflow:** send (SMS/email) → verify → expire → resend. Needs a server endpoint + provider + rate-limit. This is a FEATURE, not just a renderer preset. ~high.

---

## 5) GĐ4 — Production hardening + platform parity + integration (planned)

The "make it complete across the whole surface" phase. Items:
1. **Server validate/normalize parity** — `MegaForm.Core/Services/SubmissionProcessor.cs`: read part values, validate per-part + whole, store the normalized combined value (mirror client `combine`), keep optional `{key}_parts`. (Client already combines; server stores as-is today — fine for v1, hardened here.)
2. **Native SSR** — `FormHtmlRenderer.RenderFieldGroup` Composite branch: render `.mf-composite-row` rows + parts statically (with ARIA) so SEO/no-JS works, then client hydrates. Add `Composite` to `NativeTypes` once the branch matches the JS contract pixel-for-pixel.
3. **i18n** — part aria-labels/placeholders + scheme labels via catalog (carry-over from GĐ1 2g).
4. **Custom-Grid layout** (user's 4th template idea) — let the author pick col-span (1/1, 1/2, 1/3, 1/4) per part in the editor → maps to `part.row`+`flex`. Already 80% possible via `width`/`flex`/`row`; add a friendlier picker.
5. **DNN / Web parity** — verify composite renders on DNN `FormView` + Web; reconcile with the existing `PhoneNumberPro` widget (overlap with phone preset — decide canonical).
6. **AI authoring** — let the AI form-creator emit `type:'Composite'`+preset/scheme; add a KB recipe so it doesn't hallucinate. (Ties into Part-1 AI work in the other handoff.)
7. **Prefill-split** — when a saved value exists, optionally split back into parts (today the hidden value is preserved as-is until the user edits a part).
8. **Downstream display** — email/CSV-export/report/My-Inbox show the combined value; verify rules/conditions (`showIf`) read the hidden value correctly.

---

## 6) Build / deploy / QA playbook

```
# build (from repo root)
npm --prefix ./MegaForm.UI run build:renderer   # helpers/inputs/interactive/composite-address
npm --prefix ./MegaForm.UI run build:builder    # field-plugins/_index, canvas, dom
npm --prefix ./MegaForm.UI run build:loader     # loader/index
# or full: npm --prefix ./MegaForm.UI run build  (all bundles, ~1-2 min)

# DEPLOY to live (the gotcha) — copy + curl-verify
#   src  = ./Assets/{js,css}
#   live = E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm\{js,css}
#   copy: megaform-renderer.js(+map), bundles/megaform-builder.js(+map),
#         megaform-builder-loader.js(+map), css/megaform.css
#   verify: curl http://localhost:5000/Modules/MegaForm/js/megaform-renderer.js | grep <marker>

# QA (fresh Chromium ctx, bypass cache, captures console errors)
node ./MegaForm.UI/tools/mf-hb.cjs --eval ./tmp-qa/scn-comp-<x>.cjs [--out shot.png]
#   scenarios that self-login (builder): node ./tmp-qa/scn-comp-<x>.cjs
```
Note: `Assets/js/plugins/*.js` widget plugins are HAND-WRITTEN (not TS-compiled); the TS build only
bundles `src/`. `megaform.css` is hand-authored and NOT auto-synced — copy it manually.

---

## 7) Key file map

| Concern | File |
|---|---|
| Part interface, presets, resolvers | `MegaForm.UI/src/renderer/helpers.ts` |
| Address schemes/data (shared) | `MegaForm.UI/src/renderer/composite-address.ts` |
| Render markup (rows/ARIA/roving) | `MegaForm.UI/src/renderer/inputs.ts` (`case 'Composite'`) |
| Keyboard + combine controller | `MegaForm.UI/src/renderer/interactive.ts` (`bindComposites`) |
| CSS (rows/focus/responsive) | `Assets/css/megaform.css` (`.mf-composite*`) |
| Builder palette + props editor | `MegaForm.UI/src/builder/field-plugins/_index.ts` |
| Tile→Composite mapping | `MegaForm.UI/src/builder/core.ts` (`createFieldFromTemplate`) |
| Server normalize (GĐ4) | `MegaForm.Core/Services/SubmissionProcessor.cs` |
| Native SSR (GĐ4) | `MegaForm.Core/Services/FormHtmlRenderer.cs` |

---

## 8) Revert fixtures (clean up when fully done)
- **Composite demo:** module 51 → FormId 21; `DELETE FROM MF_Forms WHERE FormId=60`.
- **Listview demo (older):** module 50 → FormId 20; `DELETE FROM MF_Forms WHERE FormId=59`; `DELETE FROM MF_AI_Knowledge WHERE Slug LIKE 'lv-%'`.
- Mutate via `node:sqlite` while the server is stopped (SqlDdlGuard blocks DROP via API).

---

## 9) Related handoffs
- `Docs/HANDOFF_20260614_AI_DB_COMPOSITE_PLAN.md` — full session log incl. the 3 SESSION UPDATE blocks (GĐ1 core, WAI-ARIA keyboard, Address template + widget-retire) + **PART 1 AI/DB stabilization plan** (next big workstream) + Part 3 AI relational-app gap.
