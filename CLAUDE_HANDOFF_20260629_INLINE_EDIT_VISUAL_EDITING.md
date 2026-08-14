# HANDOFF — Inline-Edit hardening + Visual editing (resize/drag/snap, options, submit, image)

> **Date:** 2026-06-29 (one long autonomous + interactive session).
> **Live:** `:5000` (Oqtane.10_new2, host / Minh@2002) = **AssetVersion `20260629-B322`**, inline-edit badge **`v20260629-09`**.
> **Main file:** `MegaForm.UI/src/shared/inline-edit.ts` (untracked `??` — NOT committed; the deliverable is the deployed live site).
> **Status:** Everything below is BUILT + DEPLOYED + browser-QA'd on live :5000 with edit→save→reload→persist verified, then test data reverted. NOTHING is committed (user works via deploy-to-live, not git). ⚠ Codex's `MegaForm.UI/src/shared/premium-native-migration.ts` is still untracked — DON'T clobber.

---

## 0. PURPOSE / WHAT THE USER ASKED
The user (Vietnamese, works autonomously, prefers JSON/config over DLL) wanted **in-place WYSIWYG inline editing** of MegaForm forms on the rendered page, **stable and working on EVERY form archetype**, QA'd in a real browser. Over the session the ask grew to: edit **text** (titles, labels, step labels, option labels, submit button), **resize fields with the mouse + drag + snap-to-grid like the PDF form widget**, and **change images inline** — all persisted via a SAFE round-trip and **never affecting the public (non-edit) render**.

The whole feature is gated to **host + Oqtane edit-mode** (`?edit=true` + the MegaForm admin dock present). A bug here can only affect a host who is editing — never a public visitor.

---

## 1. ARCHITECTURE (how it all works)
`inline-edit.ts` is a **post-render enhancement** wired into `renderer/index.ts` `init()` end via `initInlineEdit({formId, apiBaseUrl, schema, container})` (try/caught). It:
1. `isInlineEditContext()` gates on `?edit=true` AND `.mf-oq-linkbtn`/`[data-mf-shared-dashboard-badge]` (admin dock). Returns early otherwise → public visitors get NOTHING.
2. `scanAndTag(root)` tags editable things on the rendered DOM (sets `data-mf-ie*` attributes + `contenteditable`/handles). `enableFieldLayoutEdit(root)` + `enableImageEdit(root)` add resize/drag handles + image-click.
3. Edits accumulate in a `STATE.pending*` set (in-memory).
4. A floating **Save pill** runs `save()`: **GET `/api/MegaForm/Form/{id}` (full entity) → apply pending edits to the schema/settings → POST `/api/MegaForm/Form` echoing EVERY column → `location.reload()`.** Because it builds the POST from the GET (never from the live DOM), the runtime-only `data-mf-ie*`/handles can never leak into the saved data.

**The pending sets (one per edit kind):**
| `STATE.*` | edit kind | persisted to |
|---|---|---|
| `pendingShell` (keyed by element id) | shell text in customHtml (hero/brand/step/intro) | `settings.customHtml` via `swapTextOnly` (occ-disambiguated) |
| `pendingFields` | field/Section label | `schema.fields[].label` via `applyFieldLabels` |
| `pendingOptions` | Cards/Radio/Checkbox/Select **option** label | `schema.fields[].options[].label` (matched by value) via `applyOptionLabels` |
| `pendingSubmit` | submit button text | `SubmitButtonText` **AND** a customHtml swap (premium bakes it in customHtml) |
| `pendingImages` | shell `<img>` src | `settings.customContent[key]` (the `{{content:KEY}}` value) + literal customHtml swap via `applyImageSwaps` |
| `pendingLayout` | standalone field **width** | `schema.fields[].width` (`%`) via `applyFieldWidths` |
| `pendingOrder` | top-level field reorder | reorder `schema.fields` via `reorderTopLevelFields` (length-guarded, never drops a field) |
| `pendingRowSpan` | **Row** field resize | `schema.fields[].columns[].span` via `applyRowSpans` (anchored by a member field key) |
| `pendingRowGrid` | (defined, currently unused — premium rows turned out to be schema Rows) | — |

---

## 2. WHAT WORKS NOW (all QA'd persist on live)
- **Text:** hero/brand/step labels/intros (shell, in customHtml), field labels, Section divider titles. Click → type → Save.
- **Option labels:** Cards/Radio/Checkbox/Select option text (e.g. "Sydney", "Study & Research"). 43 tagged on form 54; QA: edit→save→reload persists in `field.options[].label`.
- **Submit button:** text (e.g. "Gửi"/"Submit Application"). Premium bakes it in customHtml → persisted by a customHtml swap (shows correctly) + `SubmitButtonText` for standard forms. Click is `preventDefault`'d so editing never submits.
- **Image:** click a shell `<img>` (blue dashed outline on hover) → gallery picker if `window.MFTokenDesigner.openGalleryPicker` exists, else `window.prompt` for a URL (scheme allowlist: `https:`/`/same-origin`/`data:image`). Persists to `settings.customContent[<key whose value === old src>]` (the `{{content:KEY}}` the renderer resolves). QA form 10 Festa hero → picsum → reload renders + persists.
- **Field RESIZE (mouse + snap-to-grid):**
  - *Standalone flow fields* (standard forms): right-edge handle → drag → snap width to **25/33/50/66/100%** (= 3/4/6/8/12 of a 12-col grid) → live `data-width` → persist `field.width`. Needs the renderer to emit `data-width` (see §3).
  - *Row fields* (premium "First name / Last name" side-by-side, and any schema Row): right-edge handle on the non-last column → drag → snap → live `grid-template-columns` → persist the schema Row `columns[].span`. QA form 9: first_name→66% → reload renders 452/226px (8fr/4fr).
  - A **12-column grid overlay** shows while resizing (the "snap to grid like PDF" cue). Alt = bypass snap.
- **Field DRAG reorder:** drag handle (top-left) on standalone flow fields → reorder among siblings → persist `schema.fields` order.
- **Public render:** with NO `?edit=true`, 0 tags / 0 handles / 0 contenteditable (verified). Edit-mode-only.

---

## 3. THE NON-OBVIOUS FIXES (read before touching the renderer/CSS)
1. **Renderer must emit `data-width`** for standalone-field resize to persist. Originally NO renderer emitted it (it's only consumed by CSS). Fixed in THREE places (all deployed):
   - TS `renderer/inputs.ts` `renderSingleFieldElement` + `renderer/index.ts` string path → `data-width` when `field.width && !== '100%'`.
   - **C# `MegaForm.Core/Services/FormHtmlRenderer.cs` ~L289** → same. **Required** because STANDARD forms SSR-render then the client HYDRATES the C# field DOM (so a TS-only change wouldn't show). Deploying this needs the **Core DLL** swap (see §4).
2. **`.mf-page` was `flex-direction: column`** → `data-width` set flex-BASIS = height, not width. Changed `Assets/css/megaform.css` `.mf-fields-container > .mf-page` to **`flex-flow: row wrap`** (+ added a `data-width="100%"` rule). SAFE because vertical spacing is `margin-bottom:20px` on `.mf-field-group` (not flex gap), so full-width fields still stack identically — verified form 17 (standard+steps) no regression.
3. **Premium Row grid is GENERATED, not stored.** "First name / Last name" is a schema **Row `row_name`** (`columns:[{span:6},{span:6}]`); the customHtml only has the `{{field:row_name}}` token — the renderer generates `grid-template-columns:6fr 6fr` at render. So resize persists by rewriting the schema Row's `columns[].span` (found by a member field key), NOT by editing customHtml.
4. **Premium field labels / option labels / submit / image come from different places** — that's why a naive "edit → schema.field.label" didn't always show. Map: option label → `field.options[].label`; submit → customHtml text (premium) or `SubmitButtonText`; image → `settings.customContent[KEY]` (token), not a literal URL.
5. **Duplicate shell strings:** `swapTextOnly` is whitespace-flexible + replaces the **Nth occurrence** (occ stamped over the broad shell-leaf domain at scan, applied occ-DESC) so editing the 2nd of two identical strings changes the right one. No raw `indexOf` fallback (would corrupt attributes).
6. **`WorkflowJson` echo:** `SaveForm` does a full-row EF Update + null-normalize, so the POST must echo EVERY `FormDto` column or it nulls. The hand-built entity now includes `WorkflowJson` (was the one missing) — verified a 1078-char workflow survives an inline-edit save.

---

## 4. BUILD + DEPLOY (the proven procedure)
Live = `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\`. A ready PowerShell deploy script is in the session scratchpad: `…\scratchpad\deploy-b314.ps1` (does DLL + JS + CSS; bump the `B3xx` string in it each time). The **Core DLL** is swapped separately (the script doesn't do it).

```powershell
# 1. Renderer JS (→ Assets/js/megaform-renderer.js + synced to 3 platforms)
cd MegaForm.UI ; node scripts/build-entry.cjs renderer
# 2. Bump versions: inline-edit badge (sed v20260629-NN), AssetVersion.cs (20260629-B3NN)
# 3. Build DLLs (Release):
dotnet build MegaForm.Oqtane.Shared -c Release      # AssetVersion → MegaForm.Oqtane.Shared.Oqtane.dll
dotnet build MegaForm.Core           -c Release      # ONLY if FormHtmlRenderer.cs changed → MegaForm.Core.dll (net10.0)
# 4. Deploy: stop Oqtane.Server.exe → copy to live root: MegaForm.Oqtane.Shared.Oqtane.dll, MegaForm.Core.dll
#    + wwwroot\Modules\MegaForm\js\megaform-renderer.js + wwwroot\Modules\MegaForm\css\megaform.css → relaunch → verify HTTP 200 + B3NN served.
```
Typecheck (the `.bin/tsc` shim is broken): `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json | grep inline-edit`.
Login on :5000 = slow-type host / Minh@2002 (Blazor `@bind`). QA any form via `?formid=N&edit=true` (admin override) or the home `?edit=true` (currently renders **form 54** "DiscoverBulgaria").

---

## 5. FILES CHANGED THIS SESSION
- `MegaForm.UI/src/shared/inline-edit.ts` — **NEW/untracked**, the whole feature (~v09). Text + options + submit + image + resize + drag + row-span.
- `MegaForm.UI/src/renderer/inputs.ts` — emit `data-width` on standalone field-group.
- `MegaForm.UI/src/renderer/index.ts` — emit `data-width` (string path) + the `initInlineEdit` call site (pre-existing).
- `MegaForm.Core/Services/FormHtmlRenderer.cs` — emit `data-width` (SSR parity, ~L289).
- `Assets/css/megaform.css` — `.mf-page` → `flex-flow:row wrap`; add `[data-width="100%"]` rule; inline-edit injects its own CSS at runtime (handles, overlay, image outline).
- `MegaForm.Oqtane.Shared/AssetVersion.cs` — `20260629-B322`.

---

## 6. QA EVIDENCE (live :5000, all reverted after)
| Test | Form | Result |
|---|---|---|
| preset over-tagging | 9 | 52→**0** tagged |
| public render safety | 9 | `?formid=9` (no edit) → **0** tags/handles |
| text edit persist | 54 | "[QApersist]" survives reload (DB-confirmed) |
| duplicate-string swap | 9 | edited the 2nd "Purpose" (occ1), only that instance changed, +15 bytes exact |
| WorkflowJson preserved | 16 | 1078-char workflow intact through save |
| option label persist | 54 | "Study & Research"→edit→reload = schema + render updated |
| submit button persist | 54 | premium `.bg-submit` shows new text after reload (customHtml) |
| image persist | 10 | Festa hero → picsum URL → reload renders + `customContent.hero_image` updated |
| standalone width persist | 24 | full_name→50% → reload renders 441px |
| Row resize persist | 9 | first_name→66% → reload `row_name`=[8,4], renders 452/226px |
| regression (row-wrap CSS) | 17 | standard+steps still stacks full-width, no break |

---

## 7. WHAT'S LEFT / NEXT SESSION
1. **Composite sub-labels** (the gray `Day / Month / Year` under a date field, and the gray `FIRST NAME` hint beside a premium label) — these live in a field's `widgetProps` (sub-labels/parts), NOT tagged yet. The user explicitly circled these. Needs a `kind='composite-sub'` pass + a `widgetProps` persist path per widget type.
2. **Background-image heroes** — image edit only covers `<img>` tags. Forms using a CSS `background-image` (inline style or `--*-bg` var / customContent) aren't covered; add a bg-image branch to `enableImageEdit`/`applyImageSwaps`.
3. **au-field single hardcoded fields** (e.g. email/phone in premium customHtml that are full-width `<label class="au-field">`, NOT a schema Row) — resize would need a customHtml grid edit; deferred.
4. **Drag-reorder on premium** — only verified on standard flow; premium customHtml reorder needs `{{field:}}` token reflow (`shared/custom-html-insert.ts syncFieldPlaceholders`).
5. **Gallery picker UX** — image edit falls back to `window.prompt`; wiring `MFTokenDesigner.openGalleryPicker` onto the rendered form (it's a builder global) would be nicer.
6. **Shared shell-string locator engine (§4.1 of the older handoff)** — still deferred; `token-designer.ts` has a locator-based engine `inline-edit.ts` could share to fully kill duplicate-string edge cases.
7. **`pendingRowGrid` / `rowGridClause` are dead code** now (premium rows are schema Rows) — safe to delete on next cleanup.

## 8. POINTERS
- Module: `MegaForm.UI/src/shared/inline-edit.ts` (gate `isInlineEditContext`, scan `scanAndTag`, layout `enableFieldLayoutEdit`, image `enableImageEdit`, save `save`, appliers `apply*`).
- Renderer markup: `renderer/inputs.ts` (`.mf-field-label`, `.mf-option-label`, `renderSingleFieldElement`, `renderFlexGridElement`), `renderer/index.ts` (string field-group + Row).
- SSR: `MegaForm.Core/Services/FormHtmlRenderer.cs` (`RenderFieldGroup` ~L289, `RenderRowElement` ~L306, Section ~L272).
- Width/Row model: `MegaForm.Core/Models/FormSchema.cs` (`FormField.Width` L95, `RowColumn.Span`); CSS `Assets/css/megaform.css` L1925-1955 (`.mf-page`, `[data-width]`).
- PDF reuse ref: `MegaForm.UI/src/widgets/pdf-form-builder/renderer/FieldOverlay.ts` (`snapTo` L36).
- Save endpoint: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (`ToDto`/`ToEntity` ~L3393/3417 = the 19-column `FormDto`; SaveForm full-row Update + `NullStringNormalizer`).
- Memory: `[[project_inline_edit_all_forms_hardening]]` (full detail), `[[project_ai_on_rails_kb_catalog_b310]]` (the B310→B313 base + earlier inline-edit).
