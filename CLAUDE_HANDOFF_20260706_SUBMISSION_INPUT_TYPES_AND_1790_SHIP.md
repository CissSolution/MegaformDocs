# CLAUDE HANDOFF — 2026-07-06 → next session
## MegaForm 1.7.90 shipped · NEXT: Submission display for composite / multi-value input types

---

## §0. TL;DR for the next session

1. **1.7.90 is PACKED & VERIFIED** → `MegaForm.Oqtane.Package\MegaForm.Oqtane.1.7.90.nupkg` (77.8 MB, both net9.0+net10.0). Contents structurally verified (16 templates, renderer rule-engine, slider fix, gallery icon fix on 3 surfaces, card CSS, 8 DLLs). See §2 for what changed.
2. **PRIMARY next task** (user's words: *"tả ra lại Submission với các dạng input khác nhau (composite…)"*): the **Submission detail panel renders multi-value / composite field values wrong** — a multi-select Checkbox shows the literal string `System.Collections.Generic.List`1[System.Object]` instead of the picked values. **ROOT CAUSE ALREADY FOUND — see §1.** It is a small, clean server-side fix + a broader "audit every input type in the submission view" pass.
3. A **fresh clean Oqtane + SQL Server + MegaForm-NuGet-only** site was stood up this session for the next QA cycle — coordinates in §3.
4. **Gallery QA (was "thô sơ") is DONE** this session — the raw `compass`/`sparkles` icon-name text is fixed on all gallery surfaces (§2 item 4). Re-verify on the fresh site as a sanity check.

---

> ⚠️ **SUPERSEDED — read §1A first.** The original §1 below (written before live QA) over-claimed that the submission **Details panel** shows `List\`1`. Live QA on :5116 (2026-07-06) + a 30-agent code audit proved the Details panel is actually **human-readable** on 1.7.90 (it reads a `DisplayValue` envelope). The real breakage is on **other surfaces** + a newly-found **Chips data-loss** bug. §1A has the verified map.

## §1. PRIMARY TASK — Submission value rendering for composite / multi-value input types

### The bug (user screenshot)
On the **Submission #1** detail panel, the field **"KEEP ME UPDATED WITH NEWS AND OFFERS"** (a multi-option Checkbox) shows:

```
System.Collections.Generic.List`1[System.Object]
```

instead of the selected option label(s). Single-value fields ("HOW CAN WE HELP? → General Inquiry", "MESSAGE → SDF") render correctly. So **only multi-value (array) fields are broken.**

### ROOT CAUSE — CONFIRMED (not a guess)
`MegaForm.Core\Services\SubmissionIndexerService.cs` → `ProjectValue(object raw, …)` **line ~196**:

```csharp
string s = Convert.ToString(raw, CultureInfo.InvariantCulture);
```

`ProjectValue` writes the flat **`MF_SubmissionValues`** index (one row per field → `ValueText`/`ValueNumber`/`ValueDate`), which the Submission **Details tab + list columns read from**. When a Checkbox posts multiple values, `raw` is a **`List<object>`** (or a Newtonsoft `JArray`), and `Convert.ToString(list)` returns the **.NET type name** — which is then stored in `ValueText` and shown verbatim. This is a **WRITE-time** corruption (at submit/index time), so it is baked into the stored row, not a display-only glitch. (Verified the client path is innocent: `MegaForm.UI\src\submissions\submission-detail-utils.ts:171` does `String(rawValue)` — a JS array would render `a,b`, never a .NET type name, so the bad string must arrive from the server.)

### The fix (server-side, small)
In `ProjectValue`, **before** `Convert.ToString`, flatten enumerables to a joined string:

```csharp
if (raw is string) { /* fall through */ }
else if (raw is System.Collections.IEnumerable en) {
    var parts = new List<string>();
    foreach (var item in en) parts.Add(Convert.ToString(item, CultureInfo.InvariantCulture));
    raw = string.Join(", ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
}
```

⚠️ Handle **Newtonsoft `JArray`/`JValue`** too — submission `formData` values may arrive as `JToken`s depending on the submit path; a bare `IEnumerable` check covers `JArray` (it implements `IEnumerable`), but each element may be a `JValue` whose `Convert.ToString` needs `((JValue)item).Value` (test both paths). Also consider **option value→label** mapping (the picked value may be an option `value` like `"news"` and the panel should show the option `label` like `"Keep me updated…"`; the client already does label mapping for dropdown/radio in `submission-detail-utils.ts` but NOT for checkbox arrays — decide whether to map on write or on display, consistently).

### Broader scope the user asked for — audit EVERY input type in the submission view
The user said *"các dạng input khác nhau (composite…)"* — so don't stop at Checkbox. Walk each field type through **submit → `MF_SubmissionValues` → Details tab → Export/CSV** and confirm the value is human-readable:
- **Checkbox / multi-Select / Chips / Cards(multi)** → array → join labels (the confirmed bug).
- **Composite / Row / Group / FieldGroup** → does each sub-field index under its own key, or does the parent object `ToString()` to `System.Collections…Dictionary…`? (Same failure class — a `Dictionary<string,object>` would print its type name.)
- **File / MultiFile** → should show filename(s) + link, not a JSON blob or object type.
- **Signature / Rating / Slider / OpinionScale / Payment / Phone-pro / QRCode / PdfForm** → confirm each projects a sensible `ValueText`/`ValueNumber`.
- **Address / Name / composite "money/measurement/price_range" presets** (ProjectValue already has special-casing around line 119-128) → confirm combined value renders.

### How to reproduce fast on the fresh site (§3)
1. Open a QA form that has a multi-checkbox (e.g. the contact templates have a "keep me updated" opt-in; or add a Checkbox with 2+ options to any form).
2. Submit it with 2 boxes ticked.
3. Open **Submissions → that submission → Details** → you'll see `System.Collections.Generic.List`1[System.Object]`.
4. Inspect the stored row: `SELECT FieldKey, ValueText FROM MF_SubmissionValues WHERE SubmissionId=<id>` — confirms it's stored wrong (write-time).
5. After the fix + Core rebuild + hot-swap (or repack), **re-submit** (old rows stay corrupted; the index is written at submit time) and confirm the Details tab shows the joined labels.

> ⚠️ The fix is in **`MegaForm.Core`** → it lands in the module **DLL**, so shipping it needs a **repack + `ModuleInfo.Version` bump** (Oqtane only swaps DLLs on a version increase — see §4). For dev iteration, hot-swap the site-root Core-carrying Server DLL / rebuild + restart.

---

## §1B. STATUS — all 5 fixes SHIPPED in 1.7.91 + QA-verified (2026-07-06)
Implemented, packed (`MegaForm.Oqtane.1.7.91.nupkg`), installed on :5116, and proven with live SQL + UI (new submission #3, "Composite QA Registration"):
- **#5 Chips/Cards data-loss** — `conditional.ts getFieldValue` now has a DOM-kind-aware Checkbox/Chips/Cards branch (`collectFormData` delegates to it). SQL: `DataJson.interests` = `["music","food","technology"]` (was `"music"`). ✓
- **#2 ToRawString** — `MegaFormUtils.cs` serializes CLR collections to JSON. SQL: envelope `RawValue` = `["music","food","technology"]` (was the `List\`1` type-name). List column shows "music, food, technology". ✓
- **#1 ProjectValue** — `SubmissionIndexerService.cs` flattens collections (Reports/`ValueText` path; identical logic to #2, compiled+deployed; only runs on Reports reindex so not exercised live). ✓ (code)
- **#3 ToDisplayString** — Signature/Payment/File/DataGrid branches. SQL: signature `DisplayValue` = `[signature]` (was raw base64). ✓
- **#4 static-choice label** — `submission-detail-data-tab.ts` maps option value→label in the read-only client view (editable inputs keep raw values for save). ✓ (code)
- Details panel: INTERESTS = **"Music, Food, Technology"** (DisplayValue label-mapped). ✓
- AssetVersion→20260706-B374, ModuleInfo→1.7.91. Deploy md5-verified (renderer.js + submissions.js + Core.dll identical to fresh builds).
> Remaining lower-priority items from §1A left for a future pass: static Radio/Select in the **editable** Data-tab + **client CSV export** still show raw values (server CSV via snapshot DisplayValue is label-mapped); Date localization; object-POSTed composite `[object Object]`.

## §1A. VERIFIED submission-readability map (live QA on :5116 + 30-agent code audit, 2026-07-06)

**Method:** AI-generated a "Composite QA Registration" form (Phone=Composite, Interests=Chips, Rating, Address=Composite, Signature, + text/email/textarea), submitted 2 entries, read `MF_Submissions.DataJson` + `MF_SubmissionValues` from SQL Express, opened the Submissions **Details** panel in-browser, and ran a 30-agent adversarial code audit (`submission-readability-audit`, 15 confirmed-broken cases).

### Overall answer: **PARTIALLY human-readable — NOT uniform.**
There are **2 stored representations** (`MF_Submissions.DataJson` = authoritative Newtonsoft JSON blob; `MF_SubmissionValues` flat index — **two competing writers**: a `FieldValue` **envelope** `{FieldKey,FieldLabel,FieldType,RawValue,DisplayValue,IsLegacyFallback}` AND the legacy `ValueText/ValueNumber/ValueDate` projector) and **3 display surfaces** (A: server `FlattenSubmission`/snapshot `DisplayValue` → Oqtane summary, email, PDF, CSV; B: client "Data View" Details tab → reads raw `DataJson`; C: Reports / SubmissionData grid + flat `ValueText`). Readability depends on which surface reads which representation.

### SQL PROOF (Submission #1, :5116 `Oqtane_MegaForm_Fresh1790`)
`MF_SubmissionValues.FieldValue` envelope (the source the Details panel reads) — **`DisplayValue` is human-readable**:
- `interests` (Chips): `RawValue:"music"` → **`DisplayValue:"Music"`** (option value→label mapped)
- `address` (Composite): `DisplayValue:"123 Market St, San Francisco, CA 94105"` (joined)
- `phone` (Composite): `DisplayValue:"+1 415 5559876 ext 22"` (joined)
- `excitement_rating` (Rating): `"4"`; `signature`: `data:image/png;base64,…` (image)
- ⚠️ **`ValueText`/`ValueNumber`/`ValueDate` = NULL for every row** — the flat text index is unpopulated in this build (the envelope writer wins), so SQL search/Reports on `ValueText` returns blank.
Browser **Details panel** rendered all of the above human-readable (INTERESTS→"Music", MAILING ADDRESS/PHONE joined, rating "4") — **no `List\`1`**. Screenshot-verified.

### 🐛 NEW BUG (live-confirmed) — Chips/Cards multi-select DATA LOSS
Selected **Music + Food + Technology** (all 3 chips `checked` in the DOM), submitted → `DataJson` stored **`"interests":"music"`** (single string) both times. The Chips field has **no `multiple` flag** and the client collector (`conditional.ts` `getFieldValue`, ~L8-34) has **no Chips/Cards branch** → falls to the generic single-value path → only the **first** option is captured. Cards (radio-skinned) similarly returns the first radio value, not the checked one. **This silently drops user selections** — arguably worse than a display glitch. Fix: add a Chips/Cards collector branch that gathers all checked option values into an array (mirror the `Checkbox` branch).

### Per-type verdict (audit, adversarially verified)
| Type | Human-readable? | Where it breaks / evidence |
|---|---|---|
| Text/Email/Url/Number/Textarea | ✅ yes | verbatim |
| Composite Name/Address/Phone/DOB/Money (standard string combine) | ✅ yes | `combine()` → one joined string; Details showed it |
| Row/Group/Section (layout) | ✅ yes | flattened, no own value |
| Rating | ✅ yes | Details → stars; index → `ValueNumber` |
| ContentSlider/QRCode/Map (display-only) | ✅ yes | no stored value |
| **Checkbox (genuine multi)** | ❌ **no** | Oqtane STJ submit → `List<object>` (`MegaFormController.NormalizeJsonValue` ~L3182); `SubmissionIndexerService.ProjectValue:196` `Convert.ToString(raw)` + `MegaFormUtils.ToRawString:252` `raw.ToString()` → `System.Collections.Generic.List\`1[System.Object]` in `ValueText`/`RawValue` (Reports/CSV/flat-index surfaces). Details panel's `DisplayValue` (`ToDisplayString:472/478`) DOES join+label → OK there. |
| **Chips / Cards (multi)** | ⚠️ partial | **data-loss on submit** (above) + same type-name if an array ever reaches the index |
| **Payment** | ❌ no | raw JSON blob everywhere; `ToDisplayString` has no Payment branch (`megaform-widget-payment-unified.ts:614`) |
| **Signature** | ❌ no (server surfaces) | client Data tab → `<img>` ✅; server `DisplayValue`/CSV/email/PDF → raw base64 data-URL (`MegaFormUtils.cs:489`) |
| **File/Image** | ❌ no (server surfaces) | client → links ✅; server/CSV → raw JSON object (`MegaFormUtils.cs:484-487`) |
| **DataGrid/Grid-repeater** | ❌ no | raw JSON array string; no display branch |
| **Static Radio/Select/Dropdown** | ⚠️ partial | client Data tab/CSV/flat index show raw option **VALUE** not LABEL (`submission-detail-data-tab.ts:193` only SQL-FK maps); server snapshot DOES map |
| **Date/DateTime** | ⚠️ partial | raw non-localized ISO in Detail/CSV |
| **Object-POSTed composite** (raw API / repeating rows) | ⚠️ partial | `[object Object]` in editable mode (`submission-detail-data-tab.ts:170` gate `charAt(0)==='{'` misses real objects) |
| RichText | ⚠️ partial | sanitized HTML shown as text |
| PdfForm | ✅ yes | expanded per-sub-field, value→label |

### Root causes (fix these; the correct pattern already exists in `MegaFormUtils.ToDisplayString`/`MapOptionLabels`)
1. `MegaForm.Core/Services/SubmissionIndexerService.cs:196` — `ProjectValue` does only `Convert.ToString(raw)`, no `IEnumerable`/`JToken`/`Dictionary` handling → type-name for `List<object>`. **Mirror `ToDisplayString`** (flatten enumerables + join, map option value→label).
2. `MegaForm.Core/Utilities/MegaFormUtils.cs:252` — `ToRawString` falls to `raw.ToString()` for a CLR `List<object>`/`Dictionary` → same type-name.
3. `MegaForm.Core/Utilities/MegaFormUtils.cs:484-489` — `ToDisplayString` has **no branch for Signature / Payment / DataGrid / File** → raw JSON / base64 on server/CSV/email/PDF. Add per-type formatters (Signature→"[signature image]"/omit, Payment→"$X CUR · status", File→filename list).
4. `MegaForm.UI/src/submissions/submission-detail-data-tab.ts:193` — static Radio/Select/Checkbox show raw option value; add a value→label map from the field's `options`.
5. `MegaForm.UI/src/renderer/conditional.ts` `getFieldValue` — **add Chips/Cards collector branch** (the data-loss bug).
6. (Optional) decide whether the flat `ValueText` index should be populated at all — it's NULL in 1.7.90; if Reports/SQL-search rely on it, the writer needs to run + use the readable projection.

> Priority: **#5 (Chips/Cards data-loss)** is the most user-visible (silent selection loss) and is a JS-only fix. **#1-4** are Core (DLL → repack) and affect Reports/CSV/email/PDF + genuine multi-Checkbox. The everyday **Details panel is already OK**.

---

## §2. What shipped in 1.7.90 (this session's log)

All of the following are **in the packed nupkg** (verified by unzipping and grepping the packed wwwroot + counting DLLs):

1. **⭐ Rule-engine now LIVE on public forms.** Form-level `settings.rules` / `RulesJson` (`when/then/else`: show/hide/require/**setValue**) were **dead** on the public renderer — only per-field `showIf` worked. Wired `MegaFormRules.evaluateRules(...)` into the ACTIVE renderer (`MegaForm.UI\src\renderer\index.ts` → `megaform-renderer.js`) at every hydrate chokepoint (`bindRuleEngine`), applied to `.mf-field-group[data-key]`. A `setValue` value starting with `=` is evaluated as an **arithmetic formula** over sibling field-keys (`= number_of_people * nights * 2000000`; safe-eval, `[0-9+-*/().%]` only). Verified on :5115 form 17 (checkbox `isNotEmpty` toggles room-type; people=4→8,000,000 / people=7→14,000,000). ⚠️ single-option Checkbox trigger must use operator **`isNotEmpty`** (its value is an array — `isTrue` never matches).
2. **🖼️ Widget host hydration.** Widget fields (ContentSlider, QR, payment, phone-pro) rendered as **empty** `[data-mf-widget-hydrate]` hosts on SSR-hydrated forms (old bind pass only attached events). New `bindWidgetsSafe` calls `renderWidget(field)` into each empty host first. Fixed the "CONTENT SLIDER DEAD" report.
3. **🎠 Content-slider drag edge fix.** Swiping past the first/last slide slid the track into blank space. `megaform-widget-content-slider.ts` `applyTransform` now rubber-bands the over-drag (damped 22%, only while `dragging`); release snaps to a valid slide. Plugin is a **standalone** build: `tsc -p src/widgets/plugins/tsconfig.json` → `Assets/js/plugins/…` → sync to the 4 platform wwwroot `js/plugins/`.
4. **📇 Template-gallery icon-as-text fix ("thô sơ").** Curated templates carry **lucide-style icon NAMES** (`compass`, `sparkles`, `globe-2`, `flower-2`) that are not glyphs → they printed as raw text next to the title. Fixed on **all 3 broken surfaces** to render a neutral FA glyph for non-`fa-` names (matching the existing `gallery-modal.ts` guard):
   - `src/dashboard/wizard/step-setup.ts` (wizard Setup grid — the screenshot) → build:dashboard
   - `src/builder/gallery.ts` (builder gallery cardHTML) → build:builder
   - `src/builder/patches/megaform-template-gallery-search.ts` (standalone patch) → `tsc` → `Assets/js/…` synced to 4 wwwroot
   - `gallery-modal.ts` was already correct.
5. **⬆️ Upload control SSR parity** — `FormHtmlRenderer.cs` file-dropzone markup now matches the mock (upload-arrow SVG + "Drop files here or click to upload" + size/type hint, HTML-encoded via `Esc`).
6. **🃏 Option-card unselected state** — `Assets/css/megaform.css` `.mf-option-group--cards .mf-option-check` shows a bordered outline when unselected (was `opacity:0`); also fixed 4 premium templates' customCss that out-specified the generic rule.
7. **📇 AI KB +2 seed rows** — `MegaForm.Core\Seed\ai-knowledge-seed.json` now has **323** entries (Ids 325/326): `form_pattern-boolean-yesno-field` + `form_pattern-setvalue-formula-calc`, so the AI stays on-rails when adding conditional/calc logic. (One physical file, **linked** into Oqtane.Server as embedded resource `MegaForm.Oqtane.Server.Seed.ai-knowledge-seed.json` — editing Core reaches the Oqtane pack.)

Version bumps: `ModuleInfo.Version` 1.7.89→**1.7.90** (+ReleaseVersions), `MegaFormAssetVersion.Current` B372→**20260706-B373**, nuspec `<version>`→1.7.90 + new releaseNotes.

---

## §3. Fresh clean site for next QA cycle — :5116 (INSTALLED & VERIFIED)
- **URL:** http://localhost:5116/  · host / `abc@ABC1024`
- **Site dir:** `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1790`
- **DB:** `Oqtane_MegaForm_Fresh1790` on `.\SQLEXPRESS` (Trusted / Win-auth)
- **Oqtane:** pristine 10.1.0 (net10.0), silent auto-install, **MegaForm 1.7.90 NuGet-ONLY** (dropped `MegaForm.Oqtane.1.7.90.nupkg` into `Packages\` → consumed to `MegaForm.Oqtane.1.7.90.log`).
- **Install verified:** 16 templates, 24 `MF_*` tables, **`MF_AI_Knowledge` = 323 rows** (proves the 1.7.90 Server DLL with the 2 new seed entries loaded), `Oqtane.Server.exe` PID launched detached.
- **A MegaForm module** ("QA Gallery") is already added to the Home page → open `http://localhost:5116/?mfpanel=dashboard` → **New Form** to reach the wizard.
- **Gallery QA result (this session):** the "thô sơ" icon-as-text bug is **FIXED & visually verified** — every Premium template card shows a magic-wand glyph, no raw `compass`/`sparkles`/`globe-2`/`flower-2` text (`rawIconLeak=false`).
- **AI is NOT configured on :5116** (fresh DB — the OpenAI key from :5115 did not carry over). Re-run the AI config (`POST /api/AiAssistant/DefaultConfig?entityid=1&entityname=Site&siteId=1` or ⚙ Settings) if the next cycle needs AI. ⚠️ the key used on :5115 is a live secret — rotate it.
- ⚠️ restart drops the host session → re-login. Chrome is running with `--remote-debugging-port=9222` (profile `%TEMP%\chrome-qa-5116`) logged in as host.

---

## §4. Gotchas / caveats carried forward
- **Deploy gate:** Oqtane swaps module DLLs only when `ModuleInfo.Version` ↑ (nuspec version ignored). Any C# fix (incl. the §1 ProjectValue fix) needs a version bump + repack, or a dev hot-swap of the site-root `MegaForm.Oqtane.Client.Oqtane.dll` / Core-carrying Server DLL + restart.
- **Renderer:** ACTIVE = `src/renderer/index.ts` → `megaform-renderer.js`. `src/renderer/megaform-renderer.ts` is DEAD/not-shipped — don't edit it.
- **Manual pack (this session's method):** do NOT run `pack.cmd` blindly — its step 1b runs `gen-template-facts.cjs` (reads the **top-level** `Samples/FormTemplates/Premium/` — only ~4 files, **diverged** from the 16-file `…/Premium/DONEE`) + `verify-package-complete.cjs`, which can regenerate `facts.json` from the wrong source or abort. Manual sequence used: build changed TS bundles (dashboard/builder/renderer/slider-plugin/patch) → `dotnet build` Shared+Core(net9.0)+Client+Server Release → copy Core.dll net9.0 into Server bin → build Package.csproj → `MegaForm.Oqtane.Package\nuget.exe pack …nuspec -NoPackageAnalysis`.
- **facts.json regen still BLOCKED** by the DONEE↔top-level-Premium divergence — reconcile the two template dirs before trusting `gen-template-facts`.
- **:5115 `nights` field** was dropped by a persistent server-side field cache (couldn't re-add via SchemaJson clone) — the calc demo used `number_of_people * 2000000`. Watch for stale field cache when editing form schemas out-of-band.
- All this session's fixes were **hot-swapped/QA'd on :5115** and are now **in the 1.7.90 pack** — the fresh site (§3) installs the pack, so it carries them.
