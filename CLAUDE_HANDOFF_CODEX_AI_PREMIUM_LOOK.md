# HANDOFF → CODEX: make AI generate PREMIUM-looking forms by default

> **Author:** Claude (Opus) session 2026-06-29. **For:** Codex.
> **Goal (user's words):** login :5000, run a Visual-QA pass, then **fix the KBs so the AI creates forms that look premium out-of-the-box** — Chips/Cards instead of plain checkboxes, **no extra gray wrapper card** ("card thừa"), and **adjustable vertical row spacing**. In short: AI должен emit clean, premium forms.
> Grounded by a live code map (file:line below were verified 2026-06-29, not memory).

---

## 0. ACCEPTANCE CRITERIA (what "done" looks like)
Generate a generic form from a plain prompt (e.g. *"a member registration form with interests and a plan picker"*) and verify the OUTPUT:
1. **Multi-select / tags / interests → Chips** (`.mf-option-group--chips`, pill cloud) — NOT a plain checkbox list.
2. **Single-choice plan/tier/option with ≤6 options → Cards** (`.mf-option-group--cards`, rich tiles) — NOT a plain radio list.
3. **No gray wrapper card** around the white form card (no `card thừa`).
4. **Comfortable vertical row spacing** (~18px) and it is **adjustable** (Theme Designer `--mf-field-gap`).
5. Looks like the GOLD premium templates (down-under / festa) — clean, modern.
Both AI surfaces must pass (§1).

---

## 1. TWO AI PATHS — BOTH must be fixed (this is the #1 trap)
| Surface | File | Prompt source | Reads KB? |
|---|---|---|---|
| **A. Dashboard "Create with AI"** | `MegaForm.UI/src/dashboard/ai-form-creator.ts` | static `AI_SYSTEM_PROMPT` (L64-173) | **NO** (no tools — `:1412` calls `chatWithTools` without `tools:`) |
| **B. In-builder "MegaForm AI" chat** | `MegaForm.UI/src/ai-form-assistant/chat.ts` | dynamic `systemPrompt()` (L202-413) | **YES** (`list_widgets`, `get_knowledge`, `get_template_guide`, `prompt_rule` rows) |
- Path A teaches Chips/Cards in its inline prompt but **keyword-gated** (only when user says "tags/interests") → defaults to plain Radio/Checkbox.
- Path B is "on-rails to compose from the KB" — and the **KB has NO `widget-chips`/`widget-cards` rows and NO `prompt_rule` rows** → the chat AI literally cannot pick Chips/Cards and has no rule telling it to. (`chat.ts` inline rules never mention Chips/Cards either.)
- **Gold reference look:** `MegaForm.DNN/Resources/TemplateGuides/down-under-australia.facts.json` + `festa-italiana.facts.json` — they get the premium look via `type:Radio/Checkbox` + `optionDisplay:"chips"|"cards"` (a property), which renders the SAME `.mf-option-group--chips/--cards` DOM. The new `type:"Chips"/"Cards"` field types render it too. **Renderer support is COMPLETE** (`FormHtmlRenderer.cs:439-468` for the types, `:1163-1186` for `optionDisplay`) — the ONLY gap is the AI never emits them.

---

## 2. LOGIN + VISUAL-QA RECIPE (:5000)
- Live: `localhost:5000` (Oqtane.10_new2), host **`host` / `Minh@2002`**. net10.0. AssetVersion currently **B328**.
- Render any saved form headless (anon, full SSR page): `GET /api/MegaForm/render/{formId}`.
- Authenticated form GET/save: `GET /api/MegaForm/Form/{id}` (resolved) · `POST /api/MegaForm/Form` (full entity).
- **QA harness** in `qa5000/` (Playwright via root `node_modules`): `lib.mjs` exports `launch/login/getForm/saveForm/shot`; `ai-core.mjs` exports `sanitizeForSave`. Login has a race — wrap it with the `robustLogin` retry pattern used in every `qa5000/qa-*.mjs` I added this session (login → on throw, navigate home + check for "Logout").
- Useful form IDs: 4=bulgaria, 5=euro-youth, 9=down-under, 10=festa, 12=intake (all premium GOLD), 52=flexgrid demo.
- **Visual-QA pass:** (a) generate 3-4 forms via the dashboard creator + the builder chat from plain prompts; (b) save each; (c) `render/{id}` + screenshot to `qa5000/out/`; (d) score against §0. Screenshot reading: the renderer SSRs then hydrates — wait ~2.5s after `domcontentloaded`.

---

## 3. GAP → FIX BRIEF (file:line precise, ordered by impact)

### GAP 1 — plain checkboxes/radios instead of Chips/Cards
**Fix 1 (highest leverage — Path B on-rails). Add KB rows.**
- `MegaForm.Core/Seed/ai-knowledge-seed.json` — add `"Kind":"widget"` rows **`widget-chips`** + **`widget-cards`** (mirror the existing `widget-radio`/`widget-checkbox` shape). Generator: `MegaForm.UI/scripts/gen-ai-kb-seed.cjs` (widgets array ~L29-338) — add them there + re-run, OR edit the JSON + re-export via `MegaForm.UI/scripts/export-kb-seed.cjs`.
- Effect: `list_widgets`/`get_widget` (`AiToolsController.cs:367-384`) finally surface Chips/Cards to the chat AI.

**Fix 2 (covers BOTH paths). Seed a default `prompt_rule`.**
- Add a `"Kind":"prompt_rule"` row "rich-choices-by-default", `Tags` incl. `critical` (so `chat.ts:136-139` ranks it top; it joins into the prompt at `chat.ts:207-209`, which is **currently empty** because there are zero prompt_rule rows). Mirror the existing recipe migration `MegaForm.Oqtane.Server/Migrations/01060033_SeedNativeRichChoicesRecipe.cs` but as `Kind='prompt_rule'` (not `prompt_recipe`, which the AI must proactively fetch and almost never does).
- Suggested body: *"For any option/choice field, prefer the rich display BY DEFAULT: single-choice ≤6 short options → `type:Cards` (or Radio + `properties.optionDisplay:'cards'`); multi-choice tags/interests/short labels → `type:Chips` (or Checkbox + `optionDisplay:'chips'`). Plain Radio/Checkbox ONLY for >8 options or long sentence labels. Always include `options:[{value,label}]`; Cards options may add icon (single emoji or FontAwesome name)/meta/description. Do NOT wrap the form in an extra card; use `--mf-field-gap` (themeCssOverrides) for spacing, never hand-rolled wrapper CSS."*

**Fix 3 (Path A — dashboard, inline prompt). Make rich choices the DEFAULT, not keyword-gated.**
- `ai-form-creator.ts:97` — rewrite the CHOICE STYLES line: *"DEFAULT to rich choices: single-choice ≤6 options → `Cards`; multi-choice tags/interests → `Chips`. Fall back to plain `Radio`/`Checkbox` only for >8 options or long labels. You may instead use `Radio`/`Checkbox` + `properties.optionDisplay:'cards'|'chips'` — identical look (this is what the premium templates do)."*
- `ai-form-creator.ts:96` keep `Chips · Cards` in the type list (already there); `:99` add `properties.optionDisplay:"cards|chips"` to the field-shape so the model knows the property exists.

**Fix 4 (Path B inline fallback grammar).** `chat.ts:348` (`⚠ TOP RULE — LAYOUT + FIELD-TYPE grammar`) — add Chips (multi-select tags) + Cards (option tiles) to the keyword→type map. Best done config-driven via the `form_pattern-layout-grammar` KB row it references (edit that row in the seed JSON).

### GAP 2 — gray WRAPPER card ("card thừa")
- The white card = inner `.mfp-card` (good). The gray frame = OUTER `.mf-form-wrapper` (`background:var(--mf-page-bg)=#f5f5f5` + `padding`, `megaform.css:138-150`). It's stripped by `megaform.css:620-624` `.mf-form-wrapper[data-mf-has-custom-html]{padding:0;background:transparent}` — but ONLY if the host stamps `data-mf-has-custom-html` (a B263-class fragility: SSR/innerHTML rebuilds drop it).
- **Fix 5 (deterministic):** in `Assets/css/megaform.css` next to L620-624 add `.mf-form-wrapper.mf-theme-pure-grid-premium{padding:0;background:transparent}`. The pure-grid shell always carries that theme class (`applyDefaultPureGridShell` sets `theme='pure-grid-premium'`), so the gray frame is killed regardless of the host attribute. (Double-card is already guarded by `CustomShellCompatibilityCssService.cs:33,127-138` NOINNER.)

### GAP 3 — vertical row spacing too tight + not adjustable
- `applyDefaultPureGridShell` uses `PURE_GRID_SHELL_CSS` (`ai-form-creator.ts:1971-1984`) with a HARDCODED `.mfp-card-body{gap:16px}` + `.mfp-section{gap:14px}` (`:1978-1979`) — cramped vs the gold templates (~18-22px) and NOT a `var()`.
- **Fix 6:** token-ize + loosen: `.mfp-card-body{… gap:var(--mf-field-gap,18px)}`, `.mfp-section{… gap:var(--mf-field-gap,16px)}`, bump card-body top padding 22→28px. The Theme Designer / settings-popup already write `--mf-field-gap`, so this makes spacing adjustable with ZERO new UI.

---

## 4. KB SEEDING MECHANICS (read this before editing the KB)
- Table `MF_AI_Knowledge` (migration `01060028`; widget cols `01060031`). Seed content = `MegaForm.Core/Seed/ai-knowledge-seed.json` (embedded resource), loaded by `OqtaneKbSeederHostedService.SeedEntries` (`:82-121`).
- ⚠️ **The seeder is IDEMPOTENT** (`OqtaneKbSeederHostedService.cs:68` returns early if ANY entry exists). So editing the JSON only affects FRESH installs. **For the live :5000 DB you MUST apply manual SQL** (`INSERT`/`MERGE` into `MF_AI_Knowledge`) — same pattern as `01060036_SeedPremiumTemplateGuidesV2.cs`. Or wipe the KB rows and let it reseed.
- Template-guide rows are seeded by migration (`01060035`/`01060036`), Body = `{"guide_file":"<slug>.md"}`; the `.md` is read at runtime from `wwwroot/Modules/MegaForm/Resources/TemplateGuides/`. Per-template chips/cards guidance is generated by `MegaForm.UI/tools/gen-template-facts.cjs buildGuide()` (`:344-345`).
- **DEAD, do NOT touch/rely on:** `MegaForm.UI/src/ai-form-assistant/widget-catalog.gen.ts` (lists Chips/Cards but has NO importer — never injected; `list_widgets` is server/KB-driven).

---

## 5. DEPLOY + VERIFY (:5000)
- **TS prompt edits (Fix 3,4)** → rebuild renderer/builder bundle that owns the file, copy to live, bump AssetVersion. Builder/dashboard bundles: `cd MegaForm.UI && node scripts/build-entry.cjs <entry>` (e.g. `builder`, or the dashboard entry) → `Assets/js/...` (auto-syncs to platform wwwroot). Then copy the changed JS to `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\wwwroot\Modules\MegaForm\js\...`. Bump `MegaForm.Oqtane.Shared/AssetVersion.cs` (currently B328 → B329), rebuild Shared, swap the DLL (stop `Oqtane.Server.exe` → copy → relaunch → poll :5000).
- **CSS edits (Fix 5,6)** → edit `Assets/css/megaform.css` (source) → copy to live `wwwroot/Modules/MegaForm/css/megaform.css` + bump AssetVersion. (Note `ai-form-creator.ts` `PURE_GRID_SHELL_CSS` is INLINE JS, so Fix 6 is a JS rebuild, not a megaform.css edit.)
- **KB edits (Fix 1,2)** → edit seed JSON + regenerate, AND run manual SQL against the live `MF_AI_Knowledge` (idempotent seeder won't re-seed). No DLL change needed for SQL.
- **VERIFY:** generate forms again (both paths) → `render/{id}` + screenshot → confirm §0. The full deploy recipe + the per-file deploy steps are in the sibling handoff `CLAUDE_HANDOFF_20260629_4ITEMS_PREMIUM_BUTTONS_PDFGRID.md` §5.

---

## 6. GOTCHAS
- **Fix BOTH paths** (dashboard inline prompt AND chat KB) — a fix to one leaves the other plain.
- Live KB ≠ seed JSON (idempotent) → manual SQL for :5000.
- `widget-catalog.gen.ts` is dead — don't edit it expecting effect.
- Renderer/SSR ALREADY supports Chips/Cards + optionDisplay — no renderer change needed; this is purely a prompt/KB/CSS task.
- Don't break the GOLD premium templates (4,5,9,10,12) — they use `optionDisplay` + bespoke customCss; the AI rules must not force `type:Chips/Cards` onto premium-template edits (those are immutable-design; see `ops-shared.ts guideForbiddenTypes`).
- This repo has parallel uncommitted work (Claude's Items 1-4 + your premium-native migration). Build on it; the renderer/inline-edit TS files are entangled — coordinate commits.

## 7. KEY FILES (absolute under repo root)
- `MegaForm.UI/src/dashboard/ai-form-creator.ts` — Path A prompt (L64-173; choice line :96-99; `applyDefaultPureGridShell` :1991-2028; `PURE_GRID_SHELL_CSS` :1971-1984).
- `MegaForm.UI/src/ai-form-assistant/chat.ts` — Path B `systemPrompt()` (:202-413), prompt-rule loader (:108-150), layout grammar (:348).
- `MegaForm.Core/Seed/ai-knowledge-seed.json` — LIVE KB content (NO prompt_rule, NO chips/cards widget rows).
- `MegaForm.UI/scripts/gen-ai-kb-seed.cjs` + `export-kb-seed.cjs` — KB seed generators.
- `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:367-384` (ListWidgets/GetWidget KB-driven), `:311-365` (GetTemplateGuide).
- `MegaForm.Oqtane.Server/Services/OqtaneKbSeederHostedService.cs:68,82-121` (idempotent seeder).
- `MegaForm.Oqtane.Server/Migrations/01060033_SeedNativeRichChoicesRecipe.cs` (existing optionDisplay recipe to mirror).
- `MegaForm.Core/Services/FormHtmlRenderer.cs:439-468,1163-1186` (Chips/Cards + optionDisplay render — already works).
- `Assets/css/megaform.css:138-150,584-624,631-633` (wrapper bg, DoubleCardFix, pure-grid card border) + chips/cards skin.
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs:33,127-138` (NOINNER double-card guard).
- GOLD: `MegaForm.DNN/Resources/TemplateGuides/{down-under-australia,festa-italiana}.facts.json` (`chipFields`/`cardFields`, `display:chips|cards`).
