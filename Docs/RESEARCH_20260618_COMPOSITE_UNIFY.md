Confirmed (inputs.ts:655-662): the default branch renders a bare `<input type="text">` if no `MegaFormWidgets` plugin handles the type â€” so legacy `type:'FullName'` with no widget registered degrades to a single text box (HIGH-1/HOLE-5 confirmed). The `subfields`/`FullName` matches in inputs.ts were inside comments/strings (no `case`), as the grep for `case` returned nothing.

I now have every load-bearing fact verified against the actual code. All three adversarial reviews are essentially correct, and the original design draft has these confirmed holes:
- Q5 "StringEnumConverter must-do" is a phantom (Type is `string`) â€” strike it.
- Phase-1 FullNameâ†’name normalizer is NOT value-preserving for legacy single-box FullName (no prefill-split â†’ data loss on re-edit).
- `name`/`address` have no server rules but `name_plus`/`email_confirm`/`ssn` DO (registry confirmed) â€” and all are `__mf_parts`-gated/fail-open.
- FK match is whitespace-sensitive Ordinal â†’ `combine()` canonicalization breaks it.
- `validatePage` only checks Required+Email, no Composite/Url.
- Numeric/date composites (money/dob/date_range) mis-index to ValueText.

Now producing the final report.

---

# Unifying MegaForm's Text-Input Control Family into the Composite + Presets Architecture
### Final Research & Design Report â€” 2026-06-18

---

## 1. Executive Summary + Recommendation

**Verdict: Do NOT collapse the five plain scalar types (`Text`, `Textarea`, `Email`, `Number`, `Url`) into `type:'Composite'` presets. "Unification" is a palette/UX-family operation, not a runtime `field.type` collapse. The composite presets you actually need (`phone`, `name`, `name_plus`, `ssn`, `email_confirm`) already exist and ship today.**

The net-new work is small, additive, and mostly UX. The dangerous work â€” and the part the original design draft *under-weighted* â€” is the legacy `FullName`/`Address` migration, which is **not** the "zero-risk, value-preserving" change it was billed as. This report fixes every confirmed HIGH/MED critique hole or justifies acceptance, all grounded in code I verified this session.

### What changed versus the design draft (holes fixed)

| Critique | Status | Resolution in this report |
|---|---|---|
| **Q5 `StringEnumConverter` must-do is a phantom** (MED-1/MED-6/HOLE-3) | **ACCEPTED â€” struck** | Verified `FormField.Type` is `public string Type` (FormSchema.cs:67-68); the `FieldType` enum (cs:184-218) is decorative, never `Enum.Parse`d on `Type`, and has no `Composite` member. No converter on `Type`. The "must-do" is removed; replaced with a defensive (optional) enum member + a round-trip guard test. |
| **FullNameâ†’name normalizer destroys legacy single-box values on re-edit** (HIGH-1/HOLE-5) | **FIXED â€” design changed** | Verified legacy `FullName` degrades to ONE bare text input (inputs.ts:655-662 default branch; no `FullName`/`Composite` case) and there is **no prefill-split** (interactive.ts:127-128). **Phase 1 is replaced**: render legacy `FullName`/`Address` as an explicit single-input `case` (zero arity/value change). Multi-part `name` composite is opt-in for NEW fields only. |
| **Server normalizer is a 5-consumer split-brain, not one chokepoint** (HIGH-2/HOLE-1/HOLE-2) | **FIXED** | Verified validation (FormValidationService.cs:80), SSR (FormHtmlRenderer.cs â€” no Composite case â†’ `mf-widget-host` hydrate at :342), indexer (SubmissionIndexerService.cs:182), AntiSpam (:152), and snapshot all read the **stored** type independently. The new design never relies on a runtime normalizer for the contract. |
| **Templates/AI keep emitting `FullName`** (HIGH-3/LOW-1/HOLE-6) | **FIXED** | Since legacy `FullName` now has a real render+validate path, continued emission is **safe** (no normalizer dependency). Migrating emitters to the composite shape is genuinely optional. |
| **FK/report equality breaks if `combine()` canonicalizes whitespace** (MED-4/HIGH-3) | **FIXED + documented** | Verified FK match is `string.Equals(parentValue, foreignValue, OrdinalIgnoreCase)` (SubmissionProcessor.cs:464). Because legacy FullName stays single-box, its stored value is **never** recombined. New name composites carry an explicit guard rule. |
| **`email_confirm`/`ssn`/`name_plus` skip format check on `__mf_parts`-less POST** (MED-2/MED-7/HOLE-2) | **ACCEPTED as pre-existing + hardening item** | Verified `ValidateComposite` early-returns when `__mf_parts` absent (cs:332) and is fail-open (cs:171). This is a *standing* gap, not introduced by unification. A combined-value fallback is added as an independent tracked fix. |
| **Numeric/date composites (money/dob/date_range) mis-index to `ValueText`** (MED-5) | **ACCEPTED as pre-existing + independent fix** | Verified `ProjectValue` routes by literal type (cs:182-207); `Composite` is in neither numeric nor date list â†’ falls through to text. Independent of this work; preset-aware projection added as a separate item. |
| **`validatePage` lacks Composite/Url branch** (HOLE-4) | **ACCEPTED + fix** | Verified `validatePage` checks only Required + Email regex (validation.ts:39-46). A Composite per-part-required mirror is added to Phase for parity. |
| **Phase-0 palette regroup can un-hide retired Phone tile / category collisions** (MED-3/MED-8) | **FIXED** | Phase 0 mutates `sortOrder` ONLY (fractional), never `category`; build-time collision assertion + single-Phone-tile QA assertion added. |
| **Composite combine fallback `join(' ')` silently corrupts an unregistered preset** (HOLE-7) | **FIXED** | Verified fallback at interactive.ts:65. A dev-mode warn + a build assertion `META keys âŠ† PRESETS keys` is added. |
| **Designer UX hostile for single-part / migrated name** (LOW-2/HOLE-9) | **MITIGATED** | Single-part scalars stay native (no designer). Name/Address get a simplified designer surface or stay single-input. |

---

## 2. Current Architecture (verified, with citations)

### 2.1 Scalar types â€” value is literally the input string
For `Text`/`Textarea`/`Email`/`Number`/`Url`/`Phone`, the control carries `name=field.key` directly. The collector reads `[name="${key}"].value` and stores `data[field.key] = <string>`. No sub-keys, no JSON. Server validates these via an **unconditional** type switch:
- `case "Email"` â†’ `IsValidEmail` (FormValidationService.cs:82)
- `case "Number"` â†’ `double.TryParse` + `Validation.Min/Max` (cs:87-99)
- `case "Date"` (cs:101), `case "Url"` â†’ `Uri.TryCreate` http/https (cs:106-110)
- `case "Phone"` â†’ regex `^[\d\s\-\+\(\)\.]{7,20}$` (cs:112-115)
- Generic length/pattern at cs:176-193 runs for all.

### 2.2 Composite types â€” value is ONE combined scalar via `combine()`
The composite renders N part inputs each tagged `data-mf-part` (NOT `name`) plus exactly one hidden `<input name=key>` (inputs.ts:652). `bindComposites().recompute()` collects parts into `v{}` and writes `def.combine(v)` into the hidden input (interactive.ts:62-69). **Stored value is always a single scalar string under `field.key`** â€” shape-identical to a Text field.

Verified `combine` outputs (helpers.ts):
- `phone` â†’ `"+1 415 5551234 ext 22"` (:298)
- `name` â†’ `[first,last].filter(Boolean).join(' ')` â†’ `"First Last"` (:305)
- `address` â†’ `combineAddress` (:312)
- `ssn` â†’ `v.ssn || ''` (:320) â€” byte-identical to a plain masked input
- `name_plus` â†’ `[prefix,first,middle,last,suffix].join(' ')` (:331)
- `email_confirm` â†’ `v.email || ''` (:381) â€” primary only; confirm dropped (correct for confirm)
- `price_range` â†’ `'min - max'` (:433), `money` â†’ `'currency amount'` (:413), `measurement` â†’ `'amount unit'` (:425) â€” **decorated display strings, NOT raw values**

The transient per-part values travel only in `data['__mf_parts'][fieldKey]`, which the server **strips before persist** (SubmissionProcessor.cs:189). So `DataJson` holds one scalar per field for both simple and composite.

### 2.3 Already-shipped presets (the "done" part of unification)
`phone`, `name`, `name_plus`, `ssn`, `email_confirm`, `password_confirm`, `address`, `dob`, `date_range`, `money`, `measurement`, `price_range`, contact â€” all live in `COMPOSITE_PRESETS` (helpers.ts:287+) and each auto-generates a palette tile from `COMPOSITE_PRESET_META`. **This tile system IS the unified-family surface.**

### 2.4 Server validation mirror (CompositePresetRegistry.cs â€” verified contents)
The server re-enforces per-part rules via a hand-maintained mirror (header: "Keep in sync with COMPOSITE_PRESETS"):
- **Has rules:** `phone` (area maxLen 4), `ssn` (required + mask + pattern), `name_plus` (**first+last required**, :62-63), `dob` (age), `email_confirm` (required + MatchKey), `password_confirm` (:74)
- **Intentionally omitted (no-op, fail-open):** `name`, `address`, `time` â€” they have no server-critical format.

Two gates make composite server validation conditional:
- `ValidateComposite` early-returns if `__mf_parts` is absent (cs:332) â€” a raw/SDK POST with only the combined value gets **zero** per-part validation.
- The whole call is fail-open: `try { ValidateComposite(...) } catch { }` (cs:171).

### 2.5 The genuine latent bug (independent of unification)
A stored `type:'FullName'` (and `Address`) has **NO renderer case** in CSR (inputs.ts â€” only a `Composite` case at :549; FullName falls to default :655) and **NO case** in SSR (FormHtmlRenderer.cs â†’ `mf-widget-host` hydrate placeholder :342) and **NO validation case** (FormValidationService.cs:80 â€” falls to generic). So legacy `FullName` **already renders as a degraded single text box today** and `subfields[]` author customization is **already dead at render time**. Templates/AI still emit `type:'FullName'`.

---

## 3. Proposed Unified Design

**Three layers, only the first two are recommended:**

1. **Palette family (UX).** Group the five native basic tiles (`Text/Textarea/Email/Number/Url`) + the five contact composite tiles (`Phone/Name/Name+/SSN/Email+Confirm`) into one contiguous **"Text & Contact"** palette cluster via adjacent fractional `sortOrder` â€” **without** touching `field.type`, `category`, or values.

2. **Legacy `FullName`/`Address` repair (the real bug fix), done the SAFE way.** Add an explicit single-input render+validate `case "FullName"`/`case "Address"` in **all** renderers (CSR `inputs.ts`, SSR `FormHtmlRenderer.cs`) and the validator â€” rendering the stored scalar in **one** text box exactly as it degrades today, but now intentionally and consistently. This fixes the SSR/CSR split and the dead-`subfields` confusion with **zero arity change, zero value-shape change, zero data migration**. The multi-part `name`/`address` composite is offered only as an **opt-in choice for NEW fields** (drop the `CompositeName` tile), never as a blanket load-time rewrite of stored fields.

3. **(NOT recommended) Fold scalars into presets.** Explicitly rejected â€” see Â§7.

**Why this beats the draft's "FullNameâ†’name load normalizer":** The draft's normalizer changed a single-box field into a two-part composite without prefill-split, which (verified) destroys the stored value on re-edit (interactive.ts:127-128 + recompute clobber at :66) and canonicalizes whitespace through `join(' ')`, breaking FK equality (SubmissionProcessor.cs:464). The single-input `case` achieves the *stated goal* ("stop degrading FullName") with none of that risk.

---

## 4. Submission-Value-Format & Backward-Compat Guarantees (the critical part)

**The load-bearing invariant: every field stores exactly ONE scalar string under `field.key` in `DataJson`; per-part keys are NEVER emitted; an existing preset's `combine()` output is NEVER changed.** Both hold today and the recommended design keeps them byte-identical.

### 4.1 Five scalars + legacy Phone â€” ZERO code-path delta
Because these stay native types, the load â†’ render â†’ validate â†’ store chain is **untouched**. Existing live forms and stored submissions have **literally no diff**. This is the strongest possible guarantee.

### 4.2 Legacy `FullName`/`Address` â€” value-shape preserved
- **Before:** renders one bare text box (default branch), stores whatever the user typed as one scalar (e.g. `"Dr. Jane Q. Smith"` or `"Nguyá»…n VÄƒn A"`).
- **After (recommended single-input case):** renders one text box (same), stores the same scalar. **No arity change, no `combine()`, no whitespace canonicalization, no prefill-split needed.** Edit/resume round-trips the exact stored string.
- **Multi-part `name` composite** is used **only for NEW fields** the author creates from the `CompositeName` tile, so `"First Last"` is the value from day one â€” never a recombination of a pre-existing free-text value.

### 4.3 The rule for ANY future scalar-shaped preset (safety contract)
If a true scalar preset is ever added, it **must** be single-part with `combine:(v)=>v.<key>||''` (the `ssn` shape, helpers.ts:320). **Never** rely on the `join(' ')` fallback (interactive.ts:65) â€” for a 1-part field it happens to work, but it is not a contract and corrupts any 2-part attempt. **Never** reuse `email_confirm` for a plain Email (its `combine` returns only `v.email` and its parts assume a sibling). Tag every preset in the registry header as *scalar-safe* (single-part, `combine:(v)=>v.<key>`) or *display-only* (decorated, e.g. `money`/`price_range`) so future work cannot accidentally pick a decorated combine as a scalar.

### 4.4 FK auto-link & report equality â€” protected by construction
`ResolveParentSubmissionId` compares stored values with `string.Equals(parentValue, foreignValue, OrdinalIgnoreCase)` (SubmissionProcessor.cs:464) â€” whitespace- and order-sensitive. Because legacy FullName values are **never** recombined (kept single-box), no FK or saved report filter keyed on a name string breaks. **Hard rule:** never auto-fold an FK-participating text field into a multi-part composite; if a NEW name composite is used as a join key, document that its value is canonicalized `"First Last"` from the start.

### 4.5 SDK round-trip â€” type-agnostic, survives everything
`FieldDto.Type` is an opaque string; `MegaFormClient` never switches on type. The scalar-value invariant (Â§4.1) is what protects it. No SDK change.

---

## 5. Per-Control Mapping Table

| Old type (UI name) | Recommended runtime type | Value-format BEFORE | Value-format AFTER | Parts | Notes |
|---|---|---|---|---|---|
| **Text** (Short Text) | `Text` (unchanged) | scalar string | identical | â€” | Native; no change |
| **Textarea** (Long Text) | `Textarea` (unchanged) | scalar string | identical | â€” | Native |
| **Email** | `Email` (unchanged) | scalar string | identical | â€” | Keep native â€” protects AntiSpam `=="Email"` (cs:152), always-on `case "Email"` (cs:82), paged `validatePage` Email check (:43) |
| **Number** | `Number` (unchanged) | scalar string | identical | â€” | Keep native â€” protects `case "Number"` min/max (cs:87) + indexer `ValueNumber` routing (cs:183) |
| **Url** (Website URL) | `Url` (unchanged) | scalar string | identical | â€” | Keep native â€” `case "Url"` (cs:106) + `validateForm` Url regex (:72) |
| **Phone** | `Phone` (legacy) **or** `Composite`/`phone` (new drops) | scalar string | identical | legacy: none; new: `country/area/number/ext` â†’ `combine` (:298) | Leave stored `Phone` native (works). New drops via `CompositePhone` tile only |
| **FullName** (= `name`) | **`FullName` single-input (legacy)** / `Composite`/`name` (new opt-in) | one free-text scalar (degraded box) | **identical scalar** (explicit single box) | legacy: none; new: `first/last` â†’ `"First Last"` (:305) | **Recommended fix = single-input case, NOT blanket normalize.** New name composite is author opt-in |
| **FullName+** (= `name_plus`) | `Composite`/`name_plus` (already) | `"Mr First Middle Last Jr"` | unchanged | `prefix/first/middle/last/suffix` (:331) | Already a preset; server enforces first+last required (registry :62-63) |
| **SSN** (= `ssn`) | `Composite`/`ssn` (already) | masked `123-45-6789` | unchanged | `ssn` â†’ `v.ssn||''` (:320) | Byte-identical to plain masked input; server mask+pattern (registry :58) |
| **Email+Confirm** (= `email_confirm`) | `Composite`/`email_confirm` (already) | primary email only (confirm dropped) | unchanged | `email/email_confirm` â†’ `v.email` (:381) | Server MatchKey enforced **only when `__mf_parts` posted** (gap Â§7.2) |
| **Address** | **`Address` single-input (legacy)** / `Composite`/`address` (new opt-in) | one scalar | identical | new: scheme-based, `combineAddress` (:312) | Same treatment as FullName |

---

## 6. Consumer Impact (Server / AI / Template / SDK)

| Consumer | Action | Why (verified) |
|---|---|---|
| **`FormValidationService` switch** (cs:80) | **ADD `case "FullName"`/`case "Address"`** (treat as generic text: Required + length/pattern only) | Closes the no-case gap so legacy FullName is validated consistently client+server. No `name` registry rows needed (single-input has no parts) |
| **`FormHtmlRenderer`** (no Composite/FullName case â†’ :342 hydrate) | **ADD single-input `case "FullName"`/`case "Address"`**; optionally add a real `case "Composite"` that emits part HTML for SSR-first composites | Removes the CSR/SSR split-brain for FullName; without it, SSR renders a hydrate placeholder while CSR renders a box |
| **`SubmissionIndexerService.ProjectValue`** (cs:182) | **INDEPENDENT FIX:** add preset-aware routing so `Composite` with `widgetProps.preset âˆˆ {money,measurement}â†’ValueNumber`, `{dob,date_range}â†’ValueDate` | Verified money/dob/date_range composites currently fall through to `ValueText` and can't be filtered/aggregated numerically. Ship regardless of unification |
| **`AntiSpamService`** (`=="Email"` :152) | **KEEP** (Email stays native) + harden defensively: `Type=="Email" || (Type=="Composite" && presetâˆˆ{email,email_confirm})` + regression test | Protects against a future "CompositeEmail" silently disabling disposable scoring |
| **`validatePage`** (validation.ts:39-46, Required+Email only) | **ADD** a `case 'Composite'` per-part-required mirror (and Url) for paged-form parity | Verified no Composite/Url branch today |
| **`presets/index.ts` + `builder/presets.ts`** (emit `FullName`/`Phone`) | **KEEP (genuinely optional now)** | Since legacy `FullName` now renders+validates correctly via the single-input case, continued emission is safe and creates no normalizer dependency |
| **AI alias maps** (`ops.ts`, `ai-form-creator.ts`) + prompt rosters | **KEEP / sync-only**; if NEW name composite is promoted, add `FullNameâ†’name` to **both** normalizers + **both** rosters + regen `widget-catalog.gen.ts` | Two duplicate maps; regen, don't hand-edit |
| **SDK (`MegaForm.Sdk`)** | **NO CHANGE** | `FieldDto.Type` opaque string; type-agnostic; protected by Â§4 invariant |
| **DEAD literals** (`composite-designer.ts` PRESETS, `MF_COMPOSITE_PRESETS`, dial codes) | **DO NOT TOUCH** | No-longer-read |
| **`FieldType` enum** (FormSchema.cs:184) | **OPTIONAL:** add a `Composite` member defensively + a serialize round-trip guard test | Verified `Type` is `string`, never `Enum.Parse`d â†’ no current risk; member future-proofs any later `Enum.Parse` |

**Struck from the draft:** the Q5 "verify `StringEnumConverter` for `Composite` on `FormField.Type`" must-do. Verified `Type` is `public string Type` (FormSchema.cs:67-68); `"Composite"` already round-trips (every live composite proves it). No converter, no enum coupling on `Type`.

---

## 7. Risks + Mitigations

### 7.1 (ACCEPTED, JUSTIFIED) Rejecting the scalarâ†’Composite fold (Phase 3)
Folding `Email`/`Number`/`Url`/`Text`/`Textarea` into `type:'Composite'` would flip them through five type-keyed dispatchers, every one losing coverage:
- Server: `case "Email"/"Number"/"Url"` (always-on) â†’ `case "Composite"` (**fail-open** cs:171, **`__mf_parts`-gated** cs:332). A raw/SDK POST gets ZERO format validation.
- Indexer: `Number`â†’`ValueNumber` (cs:183) â†’ `Composite` falls to `ValueText`; numeric report filters/aggregations break.
- AntiSpam: `=="Email"` (cs:152) silently disabled.
- `validatePage`: Email regex keyed on `'Email'` (:43) never fires.
- Requires duplicating all this into TS parts **and** the C# `CompositePresetRegistry` mirror, plus a `__mf_parts`-missing fallback â€” large, fragile, cross-language, to reproduce behavior you already have for free. **Cost/risk fails the bar. Do not do it.**

### 7.2 (ACCEPTED as pre-existing) Composite `__mf_parts`-missing fail-open gap
A raw/SDK POST to an `ssn`/`email_confirm`/`name_plus` field (no `__mf_parts`) skips per-part validation (cs:332 early-return). This is a **standing** gap, not introduced here. **Mitigation (independent tracked item):** add a combined-value fallback in `ValidateComposite` â€” when `__mf_parts` is absent but resolved rules include an `email`/`url`/`number`/`mask` part, validate the combined hidden value against that format; and make fail-open log a warning so a thrown rule isn't invisible.

### 7.3 (FIXED) Legacy FullName data-loss
Resolved by keeping legacy FullName single-input (no recompute clobber, no prefill-split dependency). New name composites are author opt-in with `"First Last"` value from creation.

### 7.4 (FIXED) Palette regroup collisions / un-hiding retired Phone
Phase 0 changes `sortOrder` ONLY (fractional inserts like `67.5`), never `category`. Add a build-time assertion that no two tiles share a `sortOrder` within a category, and a QA assertion that the palette renders exactly one Phone tile and `type:'Phone'` is unreachable from the palette (the native Phone plugin stays `category:'hidden'`).

### 7.5 (FIXED) Silent combine-fallback corruption
Add a dev-mode `console.warn` in `bindComposites` when `data-preset` has no registered `combine`, and a build assertion `COMPOSITE_PRESET_META` keys âŠ† `COMPOSITE_PRESETS` keys (the 1:1 the system relies on but doesn't enforce).

### 7.6 (MITIGATED) Designer UX hostility
Single-part scalars stay native (no designer). For `name`/`address`, suppress Add-Part/orient/keyboard-nav controls in the Composite Designer (or keep single-input) so the most common field doesn't route through the heavyweight modal with double-required (`p.required` vs `field.required`) ambiguity.

### 7.7 (DOCUMENTED) "Family adjacency tempts Phase 3"
Add a code comment / KB note at the palette-grouping site stating the five basics are intentionally NOT composite presets and why, so the visual cluster doesn't read as an unfinished TODO.

---

## 8. Ordered Implementation Plan with QA Gates

Each phase is independently shippable and Visual-QA-able. Deploy notes per memory: rebuild MegaForm.UI bundles, copy DLL/assets to the live `:5070` path, bump **both** `OqtaneCoreAssetVersion` and `BUILDER_BUNDLE_VERSION` (warm browsers won't bust the JS-injected dashboard bundle on Ctrl+F5 â€” needs the `?v=` bump), restart **only** the `:5070` PID.

### Phase 0 â€” Palette family grouping (UX-only, zero runtime risk) â­ ship first
- Align `sortOrder` ONLY (fractional) on native basic tiles + `COMPOSITE_PRESET_META` so the ten "Text & Contact" tiles cluster contiguously. **Do not touch `category`.**
- Add the "intentionally-not-composite" KB comment (Â§7.7) and the build-time `sortOrder`-collision + `METAâŠ†PRESETS` assertions (Â§7.5).
- **QA gate:** palette renders the family contiguously in documented order; exactly one Phone tile; each tile still emits its current `field.type` (Text stays Text; CompositeNameâ†’Composite/name). Visual-QA screenshot.

### Phase 1 â€” Legacy FullName/Address single-input render+validate (the real fix, SAFE) 
- Add explicit `case "FullName"`/`case "Address"` rendering ONE text input in **CSR** (`inputs.ts`) and **SSR** (`FormHtmlRenderer.cs`), plus a generic `case` in `FormValidationService` (Required + length/pattern). Optionally add a real SSR `case "Composite"` for SSR-first composite forms.
- **Leave all five scalar branches + legacy Phone untouched. No load-time type rewrite. No data migration.**
- **QA matrix:**
  | Case | Expected |
  |---|---|
  | Load old `type:'FullName'` form | renders ONE text box (intentional, consistent CSR=SSR) |
  | Submit it | `data[key]` = the typed scalar, unchanged; no `__mf_parts` |
  | Existing stored FullName submission, edit + resave | value round-trips byte-identical (no clobber) |
  | Old `Text/Email/Number/Url/Textarea/Phone` | render+validate identically (regression guard) |
  | FullName used as an FK join key | still matches (no canonicalization) |
  | SSR/email render of FullName | single text box, matches CSR (no hydrate placeholder mismatch) |

### Phase 2 â€” NEW multi-part name/address composite as author opt-in
- Ensure the `CompositeName`/`CompositeAddress` tiles create `{type:'Composite',widgetProps:{preset:'name'|'address'}}` for NEW fields only.
- Simplify the Composite Designer for these presets (Â§7.6).
- **QA gate:** new name composite stores `"First Last"`; first+last per-part required enforced client-side; designer shows the simplified surface (no Add-Part on a 2-part name).

### Phase 3 (independent hardening, ship anytime)
- `SubmissionIndexerService` preset-aware numeric/date projection (Â§6 / Â§7.2).
- `ValidateComposite` combined-value fallback + fail-open warning (Â§7.2).
- `validatePage` Composite/Url branch (Â§6).
- AntiSpam preset-aware Email gate + regression test (Â§6).
- **QA gate:** money/dob composite filters numerically/by-date in reports; SDK POST without `__mf_parts` to an `email_confirm` field is rejected on bad email; disposable-domain scoring fires for Email.

### Phase X â€” âŒ NOT RECOMMENDED: fold Email/Number/Url/Text/Textarea into presets
Documented explicitly so no one revisits it. See Â§7.1. The fail-open server path makes any mistake a *silent* validation loss.

---

## Key evidence (verified this session, with line numbers)
`MegaForm.Core/Models/FormSchema.cs:67-68` (`Type` is `string`), `:184-218` (enum, no `Composite` member); `FormValidationService.cs:80-115` (unconditional scalar switch, no FullName case), `:165-172` (fail-open `case "Composite"`), `:176-193` (generic length/pattern), `:327-402` (`ValidateComposite`), `:404-416` (`ExtractRawParts` â†’ null when `__mf_parts` absent); `CompositePresetRegistry.cs:42-75` (name/address omitted; name_plus/ssn/email_confirm/dob/phone have rules); `SubmissionIndexerService.cs:170-209` (type-string routing, Compositeâ†’`ValueText`); `AntiSpamService.cs:150-160` (`=="Email"` gate); `SubmissionProcessor.cs:189` (`__mf_parts` strip), `:464` (FK `OrdinalIgnoreCase` equality); `FormHtmlRenderer.cs:341-342` (no Composite case â†’ `mf-widget-host` hydrate); `MegaForm.UI/src/renderer/inputs.ts:549-652` (Composite render), `:655-662` (default bare-text branch); `interactive.ts:62-69` (`combine` + `join(' ')` fallback at :65), `:127-128` (no prefill-split); `helpers.ts:287-442` (COMPOSITE_PRESETS: name :305, ssn :320, name_plus :331, email_confirm :381, money/measurement/price_range decorated); `validation.ts:39-46` (`validatePage` Required+Email only), `:69-73` (`validateForm` Email/Url).
