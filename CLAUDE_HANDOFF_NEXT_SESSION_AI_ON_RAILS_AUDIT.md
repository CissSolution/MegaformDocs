# HANDOFF — AI "on rails" form generation + full controls/rules/validation audit (2026-06-28)

> For the NEXT session. This is a **reviewable PLAN** — the user will read + approve it BEFORE any of it
> runs. No code was changed for this; it's a spec + audit matrix + acceptance criteria. Scope: make the
> AI generation of **standard AND premium** forms reliable by running it **only on pre-defined rails**
> (the existing control/widget/template catalog — the AI composes, it does NOT invent), then do **one full
> Visual-QA round** over every control, widget, premium template, rule, and validation — verifying both the
> AI's use of them AND the core render/validate logic itself, with a written **acceptance** per item.

---

## 0. GUIDING PRINCIPLE — "AI on rails, zero invention"
The AI must produce forms by **selecting + parameterising from the known catalog only**:
- every field → a registered **field type / composite preset / widget** (no invented `type`),
- every premium form → a **known premium template shell** (or the AI custom-shell modes already whitelisted),
  emitted in the **native-editable** structure (so the builder can edit it — see §4),
- every rule/validation → a shape the engine actually supports (see §5),
- no hand-authored HTML/CSS/JS that isn't a token (`{{field:}}`, `{{content:}}`, `{{form:}}`, `{{summary}}`)
  or a whitelisted custom-shell pattern.
The **catalog is the single source of truth**; the AI layer must **clamp/reject** anything off-rail (it
already does much of this — §3 — but the audit must prove it for EVERY item).

---

## 1. THE RAILS — current catalog the AI may use (verify each in the audit)
**Field types / controls** (wizard `field-catalog.ts`, builder `field-plugins/_index.ts`):
Text, Textarea, Email, Number, Date, Time, Url, Select, MultiSelect, Radio, Checkbox, **Chips**, **Cards**,
MultiColumn Combo, Rating (+ Likert/NPS/OpinionScale/Ranking via rating-suite), File, Signature, RichText,
UniqueId, Captcha, Hidden, Section, **Row / 3-col / Card / FlexGrid (layout)**, Heading/Html, Stripe, PayPal.
**Composite presets** (`renderer/helpers.ts COMPOSITE_PRESETS`/`COMPOSITE_PRESET_META`):
phone, name, name_plus, address, ssn, dob, time, email_confirm, password_confirm, date_range, money,
measurement, price_range, full_contact + scalar (text/textarea/email/number/url).
**Widgets** (`widgets/plugins/*`, `widget-catalog.gen.ts` ~45 entries): ContentSlider (Image Slider),
DataGrid (+SQL/Studio), DataRepeater, GridRepeater(deprecated), DynamicLabel, Map, QRCode, PhonePro(retired),
PaymentUnified/PayPal/Stripe, AdvancedFile, DrawOnImage, VideoEmbed, GolfScorecard, Razor, Appointment,
Geolocation, ProductLineItems, PdfForm, Calculator, RichText, Signature, RatingSuite, ImageChoice.
**Premium templates** (`Samples/FormTemplates/Premium/*.json`, ~34) + AI custom-shell modes
(mfp-split / mfp-hero-top / mfp-bg-overlay / mfp-header-band) + the 4 canonical premium templates in the
dashboard system prompt.
⚠️ The audit must reconcile FOUR lists that can drift: `field-catalog.ts` (wizard) · `field-plugins/_index.ts`
(builder) · `widget-catalog.gen.ts` (AI) · `MegaFormController.BuildAssetManifest` switch (asset loading).
A type in one but not the others = a hole (the slider bug this session was exactly this class).

---

## 2. AI GENERATION FLOWS (where to audit)
- **Dashboard "Create with AI"** — `MegaForm.UI/src/dashboard/ai-form-creator.ts` (system prompt ~L64–171,
  field-type whitelist L95, composite allowlist L108, premium shell modes L113–159). Output = a single
  schema (preview via `MegaFormRenderer.init`) OR an `app_batch` (multi-form + DDL).
- **Builder AI chat (ops)** — `MegaForm.UI/src/ai-form-assistant/` (`chat.ts` tool loop, `ops.ts`
  dispatcher + **ASK-DESIGN gate** L110–156, `ops-field.ts opAddField` hard-blocks, `ops-shared.ts`
  normalize, `tools.ts` `list_widgets`/`get_widget`/`get_template_guide`). Output = `ops[]` applied to the
  builder schema live.
- **AI premium convert** — `Docs/AI_PREMIUM_CONVERT_PROMPT.md` (preserve design; only labels/options/content
  tokens; never rename `field.key`).
- **KB seed (what the AI "knows")** — `scripts/gen-ai-kb-seed.cjs` + `gen-ai-kb-layout-seed.cjs` → MF_AI_*
  tables; prompt-rules fetched at chat start. ⭐ If a control/widget isn't seeded, the AI won't use it right.

**Existing guardrails to re-verify (already present — prove they hold for EVERY type):**
hard-blocks in `ops-field.ts` — DL-001 (DynamicLabel needs SQL/real html), PRESERVE-001 (can't add a field
to a custom-shell form without a `{{field:KEY}}`), PRESERVE-003 (no global `<style>` in Html field),
RETIRED-001 (Subform), GR-DEPRECATED (GridRepeater), IMG-001 (no hallucinated image URLs), DG-001 (DataGrid
needs SQL/columns), DR-001 (DataRepeater needs SQL), cascade-parent checks, GUIDE-003 (template-guide
forbidden type). Plus type normalization (`normalizeFieldType`, composite alias → `{type:Composite,
widgetProps.preset}`) and option-source normalization (→ `field.properties.optionsSql`).

---

## 3. STANDARD vs PREMIUM — what "correct AI output" means
**Standard:** schema fields only; AI must emit the **pure-grid shell** for full-width single-page forms
(`applyDefaultPureGridShell`) so it matches the in-product look and the builder edits cleanly (no "card thừa").
**Premium (post-Codex native migration — `shared/premium-native-migration.ts`):** an AI/template premium form
MUST end up in the **native-editable** structure so the builder can edit it:
- `settings.customHtml` shell with `{{field:KEY}}` tokens (+ `{{content:}}`/`{{form:}}`/`{{summary}}`),
- generated `Section{pageBreak, premiumNativeStep, premiumStepIndex, legacyDataStep}` per step,
- `settings.{premiumNativePageBreak, premiumGeneratedShell, multiPage}=true`,
- **no `{{script:}}`** (migration strips them; behaviour must come from the engine/renderer, not injected JS).
The audit must confirm: **AI-generated premium → migrate → builder add/remove/reorder field → render → submit**
round-trips without breaking the shell (uses `syncFieldPlaceholders` / `reflowWizardFieldTokensBySchemaPages`).

---

## 4. RULES + VALIDATION — supported surface + KNOWN GAPS (audit these explicitly)
**Conditional logic (`field.showIf`)** — client `renderer/conditional.ts`, server
`FormValidationService.EvaluateShowIf/EvaluateRule`, SSR attr `FormHtmlRenderer` `data-show-if`.
Operators: Equals, NotEquals, Contains, NotContains, StartsWith, EndsWith, GreaterThan/LessThan/
GreaterOrEqual/LessOrEqual, IsEmpty, IsNotEmpty, In, NotIn; And/Or grouping.
**Validation (`field.validation`)** — client `renderer/validation.ts`, server `FormValidationService.Validate`.
required, minLength, maxLength, min, max (numeric), pattern(+patternMessage), customMessage; built-in
Email/Url/Phone/Number/Date; option-membership (Select/Radio/Checkbox); Composite per-part (required,
min/maxLength, min/max, mask, pattern, matchKey [confirm], dateAge/minAge/maxAge); Captcha.
**⚠️ KNOWN GAPS the audit must confirm + the AI must avoid emitting until fixed:**
- **In / NotIn**: supported CLIENT-side but NOT in the C# `ConditionType` enum → server won't evaluate →
  a rule using In/NotIn passes client but is unenforced server-side. (Either add to C# or stop the AI emitting it.)
- **Advanced rules** (`RuleModels.cs`: show/hide/require/optional/enable/disable/setValue/clear) exist but are
  NOT wired into the per-field `showIf` flow → AI should NOT emit `schema.rules` workflow rules expecting them
  to drive field validation until they're integrated.
- **Page-level showIf** rarely emitted; verify multi-page skip works or mark out-of-scope.
- **SSR/client parity**: confirm server `Validate` mirrors client for every type (esp. composite + pattern).

---

## 5. THE AUDIT ROUND (next session's actual work) — one pass over EVERYTHING
For **each item** below: AI-generate it (dashboard + builder paths) → confirm it lands as the **correct
catalog type/shape** (no invention, clamps fired where expected) → **render** → **submit** → check
**rules + validation** behave → **Visual-QA in the browser** (screenshot, not just DOM). Record PASS/FAIL +
the acceptance evidence.

**A. Controls / fields (one form per group, or a mega-form):** every field type in §1 (incl. Chips/Cards,
all composite presets, layout Row/3-col/Card/FlexGrid, Rating family). Acceptance: renders correctly +
self-labels right + submits the expected value + builder can select/edit it.

**B. Widgets:** ContentSlider (overlay/card/cards — now self-contained ✅), DataGrid(SQL), DataRepeater,
DynamicLabel, Map, QRCode, Signature, Calculator, ProductLineItems, VideoEmbed, RichText, Appointment, etc.
Acceptance: the **plugin loads in the AI/preview + builder + published** contexts (the autoload fix this
session removed the "empty box" class of bug — re-verify across widgets), renders, and the AI hard-blocks
fire when misused (DL-001/DG-001/DR-001).

**C. Premium templates:** the 4 migrated premium (Bulgaria, Australia, EuroYouth, Festa) + AI custom-shell
modes. Acceptance: AI emits native-editable structure (§3); builder add/remove/reorder a field round-trips;
the **summary** auto-reflects (Australia via data-au-summary fill ✅; others need `{{summary}}` adoption —
see `CLAUDE_HANDOFF_NEXT_SESSION_PREMIUM_NATIVE_EXPORT_SUMMARY.md`); top/stepper spacing OK (issue D3 there).

**D. Rules:** one form exercising each `showIf` operator (Equals…NotIn) + And/Or; show/hide a field/section;
page-level skip. Acceptance: client toggles correctly AND server `EvaluateShowIf` agrees on submit; flag the
**In/NotIn server gap** as FAIL-until-fixed.

**E. Validation:** required, pattern(+message), min/maxLength, min/max, email/url/phone/number/date,
composite per-part (confirm-match, DOB age, mask), captcha. Acceptance: client blocks + shows the right
message AND server `Validate` rejects the same bad input (no client-only enforcement).

**F. Core-logic-itself (not just AI):** the rails must work independently of the AI — author the same items
by hand in the builder and confirm render+submit+rules+validation. This separates "AI emitted it wrong" from
"the control/engine is broken."

---

## 5b. ⭐ REGENERATE the per-premium KBs (the 4 templates Codex restructured) — DO THIS FIRST
Codex's native-migration changed these 4 premium template JSONs (restructured `customHtml`, new
`Section{pageBreak}` steps, removed `{{script:}}`, reflowed `{{field:KEY}}` token positions):
`Samples/FormTemplates/Premium/{bulgaria-discovery-programme, down-under-australia, euro-youth-application,
festa-italiana}.json`. **Their AI KBs are now STALE** — verified: the 4 JSONs are modified in git but their
`*.facts.json` / `*.guide.md` / `*.md` are NOT, so they still describe the OLD shell. The AI loads these
BEFORE editing/generating a premium form, so stale KBs = the AI targets wrong token positions/steps and
breaks the new native shell. **Regenerate each premium form's KB from the NEW JSON before any AI premium QA.**

**Each premium template's KB = 3 artifacts** (in 3 dirs: `MegaForm.DNN/Resources/TemplateGuides/`,
`MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Resources/TemplateGuides/`,
`MegaForm.Web/wwwroot/Modules/MegaForm/Resources/TemplateGuides/`):
1. **`<slug>.facts.json`** — the DETERMINISTIC field/token/step/css-class map the AI reads before editing
   (every field → display kind chips/cards/input, its step, the exact `{{field:KEY}}`/`{{content:KEY}}`
   token positions). **Auto-regenerated** from the template JSON:
   `node MegaForm.UI/tools/gen-template-facts.cjs` (writes all 4 → all 3 dirs) — pure/deterministic, no AI.
   Verify no drift: `node MegaForm.UI/tools/gen-template-facts.cjs --check` (must exit 0).
2. **`<slug>.guide.md`** — the human/AI-readable design+edit guide (design contract, immutable rules,
   composite/widget policy, what's safe to edit). **NOT auto-generated** — re-author to reflect the NEW
   native structure (the steps are now `Section{premiumNativeStep}`, behaviour is engine-driven not
   `{{script:}}`, summary should use `{{summary}}` per the summary handoff). Base it on the new JSON.
3. **`<slug>.md`** — the template guide markdown that gets SEEDED into `MF_AI_Knowledge` (Kind=`template_guide`)
   and returned by the AI tool `get_template_guide(slug)`. Update to match the new shell.

**Re-seed into the AI knowledge DB:** the guides are seeded by `MegaForm.Oqtane.Server/Migrations/
01060035_SeedTemplateGuides.cs` (Codex already modified this; "01.06.34 — 33 rows Kind=template_guide,
Body={"guide_file":"<slug>.md"}") + `MegaForm.Core/Seed/ai-knowledge-template-guides.sql`. After regenerating
the .md/.guide.md, ensure these point at the fresh files; bump/re-run the seed (or re-import) so the live
`MF_AI_Knowledge` rows are refreshed. Also confirm the deployed copies in the 3 wwwroot TemplateGuides dirs
are updated (gen-template-facts writes facts to all 3; the .md/.guide.md must be copied to all 3 too).

**Acceptance for the KB regen (per template):**
- `gen-template-facts.cjs --check` exits 0 (facts in sync with the new JSON).
- The AI tool `get_template_guide(<slug>)` returns the NEW guide (token positions/steps match the migrated JSON).
- An AI premium EDIT on each of the 4 (add/remove/rename a field, change content) round-trips: the AI uses the
  correct `{{field:KEY}}` positions, the native shell stays intact (`syncFieldPlaceholders`/reflow), render +
  submit OK, and the summary populates (Australia via data-au-summary; others via `{{summary}}` once adopted).
- No drift warnings (handoff NT3 / KB-2 anti-drift) on a full `pack.cmd`/verify run.

## 6. VISUAL QA + ACCEPTANCE METHOD (per item)
- **Tooling:** Playwright/Chrome on live :5000 (host/Minh@2002), `qa5000/*.mjs` harness; render any form
  headless via `GET /api/MegaForm/render/{id}` (full ANON page) for SSR checks; the builder via
  `?mfpanel=builder&formId=N`. ⭐ Each renderer/CSS change needs an **AssetVersion bump + Shared.dll swap**
  to reach browsers (static copy alone is cached — the lesson from this session; live is at **B309**).
- **Per-item acceptance template** (record in a results table):
  1. **Generated correctly** — AI output maps to the exact catalog type/shape; off-rail input was
     clamped/rejected (cite the guard). 
  2. **Renders** — browser screenshot matches the intended control (pixel-sane, not a fallback text input).
  3. **Submits** — value collected + persisted as expected (check the submission/DB).
  4. **Rules** — show/hide + page logic behaves client AND server.
  5. **Validation** — blocks bad input + correct message, client AND server (`FormValidationService`).
  6. **Builder round-trip** — the field/widget can be selected, edited, reordered, and re-saved without
     breaking (esp. premium custom-shell).
  An item is **PASS** only when all 6 hold (mark N/A where a row doesn't apply). FAIL → file a concrete issue
  with file:line + repro + proposed fix; do NOT silently pass.
- **Output of the round:** a results matrix (items × the 6 criteria) + a prioritized issue list. ⭐ The user
  reviews this matrix and approves fixes BEFORE any are applied.

---

## 7. SUGGESTED EXECUTION ORDER (after user approval)
1. Reconcile the 4 catalog lists (§1) — list every drift (a type missing from one list). Cheap, high-value.
2. Build 1–2 **mega test forms** (one standard covering all controls+rules+validation; one premium) via the
   AI, then by hand — diff AI-vs-hand to isolate AI-emission bugs from core bugs.
3. Run §5 A→F with the §6 acceptance per item; capture the matrix.
4. Hand the matrix to the user for review; apply only approved fixes; re-QA.

## 8. Pointers (grounding file refs)
- AI gen: `dashboard/ai-form-creator.ts`, `ai-form-assistant/{chat,ops,ops-field,ops-shared,tools}.ts`,
  `ai-form-assistant/widget-catalog.gen.ts`, `scripts/{gen-ai-kb-seed,gen-ai-kb-layout-seed,build-widget-catalog}.cjs`,
  `Docs/AI_PREMIUM_CONVERT_PROMPT.md`, `MegaForm.DNN/Resources/PromptRecipes/*.md`.
- Rails: `dashboard/wizard/field-catalog.ts`, `builder/field-plugins/_index.ts`, `renderer/helpers.ts`
  (`COMPOSITE_PRESETS`/`COMPOSITE_PRESET_META` ~L289–518), `widgets/plugins/*`,
  `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs BuildAssetManifest` switch.
- Premium native: `shared/premium-native-migration.ts`, `shared/custom-html-insert.ts`.
- Rules/validation: `renderer/{conditional,validation}.ts`, `MegaForm.Core/Services/FormValidationService.cs`,
  `MegaForm.Core/Models/{FormSchema,RuleModels}.cs`, `MegaForm.Core/Services/FormHtmlRenderer.cs`.
- Related memory: [[project_image_slider_widget_redesign]], [[project_premium_native_export_summary_handoff]],
  [[project_form_creation_wizard_prep]], [[project_chips_cards_controls]].
