# HANDOFF — AI "on rails" KB regen + catalog/rules audit + B310 deploy (2026-06-29)

> Autonomous session. User approved P0-A+P0-B, then "làm hết P1, P2, Visual QA pixel-perfect, tự động".
> Live **:5000** (host/Minh@2002) is now at **AssetVersion 20260629-B310** and verified up (HTTP 200).
> ⚠️ Codex's premium-native work is still UNCOMMITTED in the tree — I did NOT revert/clobber it.
> ⚠️ I did NOT auto-commit (see §Commit) — entanglement with Codex's uncommitted files is high; exact
>    `git add` list is provided for you to run on return.

---

## TL;DR — what shipped to live :5000 (B310) and is VERIFIED
- **§5b DO-FIRST (KB regen) — DONE + verified end-to-end.** All 4 premium + intake now serve the NEW native
  guide with the **correct per-step field distribution**. Proven via `GET /api/AiTools/GetTemplateGuide` (admin).
- **Premium render verified** (browser, EuroYouth on `/?view=form`): 4-step stepper, step-1 shows exactly the
  6 step-0 fields, step-2 "Programme" renders as rich **Cards** (icon/title/meta/desc), multi-step nav works.
- **P1 catalog fixes live:** wizard Stripe/PayPal tiles now emit the canonical `Payment` type; the AI
  dashboard now knows **Chips/Cards**; client widget-autoload now covers **DataGrid/Razor** (+ legacy payment).
- **P2 reframed** (NOT a forbid — see §P2): `schema.rules` is a live client feature; flagged the real gap.

---

## §0. The two KB load paths (the thing the original handoff got slightly wrong)
1. **`get_template_guide(slug)` tool** → server `AiToolsController.GetTemplateGuide` → reads `MF_AI_Knowledge`
   row → `ResolveKnowledgeBody` reads the `guide_file` it points at, from
   `wwwroot/Modules/MegaForm/Resources/TemplateGuides/<file>`. The AI's `chat.ts ensureTemplateGuideLoaded()`
   calls this and parses the frontmatter. **This is the live AI premium-edit contract.**
2. `gen-template-facts.cjs` generates BOTH `<slug>.facts.json` AND `<slug>.guide.md` (the handoff said guide.md
   was hand-authored — it is **auto-generated** now). Migration **01060036 (V2, committed)** + the SQL seed
   repoint all 5 rows at `<slug>.guide.md` (NOT the old hand-authored `<slug>.md`, which is now dead).

---

## §1. P0-A — `deriveSteps` step-collapse bug (FIXED)
**File:** `MegaForm.UI/tools/gen-template-facts.cjs` (`deriveSteps`).
**Bug:** premium customHtml repeats each `data-step="N"` TWICE (stepper-nav item + content panel). The old
dedup kept the FIRST occurrence (the nav markers), so the last segment swallowed every `{{field}}` token →
the facts/guide said **all input fields are in the last step** (down-under/euro/festa; bulgaria had a single
marker set so was unaffected). This contradicted the schema's own `Section{pageBreak}` order.
**Fix:** build BOTH a keep-first and a keep-last marker set, segment each, keep whichever spreads tokens across
**more non-empty steps** (the content-panel set wins; single-marker templates tie → keep-first, unchanged).
**Verified:** down-under 5/1/7/1 · euro 6/4/4/2 · festa 5/4/4 · bulgaria 6/4/6/5 · `--check` exits 0.

## §1b. P1.4 — Section page-break markers were flagged as "missing placeholders" (FIXED)
Same tool. `missingFieldPlaceholders` listed `premium_step_1..N` (the native `Section{pageBreak}` markers,
which legitimately carry no `{{field}}` token) → invited the AI to "repair" them and break the native shell.
**Fix:** exclude structural types (`Section`, `Html`) from the missing check. `missingFieldPlaceholders` is
now `[]` for all premium.

## §0/P0-B — deploy + DB repoint (DONE)
- Regenerated facts.json + guide.md (3 repo dirs) and **deployed `.guide.md`+`.facts.json` to the live
  wwwroot** (`E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\...\TemplateGuides\`). The live dir previously had ZERO
  `.guide.md`/`.facts.json` (only the old `.md`) — the two-file native KB had **never been deployed**.
- **Live DB `MF_AI_Knowledge` had NOT run migration V2** — bulgaria/euro still pointed at `.md`,
  down-under/festa/intake rows were MISSING. Ran the idempotent V2 SQL by hand (mirrors the committed
  migration exactly) via `sqlcmd` against `(LocalDb)\MSSQLLocalDB / Oqtane-202606260147`. Now all 5 rows point
  at `<slug>.guide.md`. (Note: the live table has extra NOT NULL cols `Examples/WidgetType/Surface` — set to
  `''`; the committed migration's INSERT omits them and would fail on this schema — worth aligning.)
- **Verified live (admin fetch):** `get_template_guide` for down-under / festa / bulgaria → HTTP 200, returns
  the NEW guide (DETERMINISTIC EDIT PROTOCOL), correct step keys, `guide_file not found` = false.

---

## §2. The catalog reconciliation (§1 of the audit) — findings + what shipped
The original "4 lists" is really **6** that can drift:
1. wizard `dashboard/wizard/field-catalog.ts` · 2. builder `builder/field-plugins/_index.ts` ·
3. AI `ai-form-assistant/widget-catalog.gen.ts` · 4. C# `MegaFormController.BuildAssetManifest` switch ·
5. **client `shared/widget-plugin-autoload.ts WIDGET_TYPE_TO_PLUGIN`** (this session's autoload net) ·
6. **`builder/canvas.ts WIDGET_PLUGIN_FILES`** (per the autoload file's own "keep in sync" comment).

**Key correction to the sub-agent audit:** `widget-catalog.gen.ts` is **dead code** — nothing imports
`WIDGET_CATALOG`/`summarizeCatalogForSystemPrompt`. The dashboard AI's real field whitelist is a hardcoded
list in `ai-form-creator.ts` (~L96); the builder AI uses the server KB (`get_widget_bundle`). And the
public-render `megaform-widgets.js` is a 2 KB **registry shim**, not a widget bundle — real widgets are the
individual `js/plugins/megaform-widget-*.js`, loaded per-form by the manifest + autoload.

### Shipped (live B310)
- **Chips/Cards on rails:** added `Chips · Cards` to `ai-form-creator.ts` field whitelist + a "choice styles"
  note (Radio=single list, Checkbox=multi list, Chips=multi pill cloud, Cards=single rich tiles; both need
  `options[]`). This is the fix that actually reaches the AI. Verified in the served `megaform-dashboard.js`.
- **widget-catalog.gen.ts** regenerated + the generator (`build-widget-catalog.cjs`) extended to emit the
  14 composite-preset aliases from `COMPOSITE_PRESET_META` (it previously dropped them → 9 lost on regen).
  Now 52 entries, Chips/Cards present, no regression. (Dead code today, but kept accurate for when it's wired.)
- **Payment (HIGH):** wizard tiles emitted the **legacy** `StripePayment`/`PayPalPayment` types, which have NO
  public-render widget (the plugin only registers `Payment`) and no manifest/autoload case → blank/text field
  on the live form. **Fix (live):** wizard now emits `{type:'Payment', widgetProps:{provider:'stripe'|'paypal'}}`.
- **DataGrid/Razor/Map/DynamicLabel (autoload, live):** added to `WIDGET_TYPE_TO_PLUGIN` so the public render
  loads their plugin client-side (Map/DynamicLabel were already there). DataGrid was the real HIGH gap.

### Source-complete but NOT deployed (deferred — documented)
- **C# `BuildAssetManifest` cases** for `datagrid/map/dynamiclabel/razor/stripepayment/paypalpayment` — edited
  in `MegaFormController.cs` but the **Server DLL was not rebuilt/swapped** (heavy + redundant: the client
  autoload already loads these). Deploys on the next Server build. Functionally covered by autoload today.
- **payment-unified.ts legacy aliases** (`StripePayment`/`PayPalPayment` register → force provider) — edited
  in source, but the **individual `plugins/megaform-widget-payment-unified.js` was not rebuilt** (the per-plugin
  build mechanism is not in the main `npm run build` chain — see §Build gotcha). Only matters for OLD stored
  legacy-payment forms; the wizard fix prevents new ones. Find/run the per-plugin build to finish this.

---

## §3. P2 — REFRAMED (do NOT blindly forbid `schema.rules`)
The plan said "block the AI emitting In/NotIn/GtE/LtE + schema.rules". **Verification refuted the premise:**
- `schema.rules` (`RuleDefinition`: when/then/else, operators eq…in/notIn/gte/lte, actions show/hide/setValue)
  is the product's MAIN conditional system — KB-backed, Rules-tab, dispatcher-validated, and **applied at
  runtime client-side**: the public renderer binds `window.MegaFormRuleEngine` (built + deployed as
  `megaform-rule-engine.js`, loaded on the render page). Forbidding it would break a core feature.
- The **real, narrower gaps** (flag, don't AI-guard):
  - Per-field `field.showIf` operators **In / NotIn / GreaterOrEqual / LessOrEqual** are CLIENT-ONLY — the C#
    `ConditionType` enum (`FormSchema.cs`) has only 10 members; `FormValidationService.EvaluateRule` falls to
    `default: return true`; and SSR `data-show-if` serialization coerces the 4 unknowns to `Equals(0)`.
  - `schema.rules` (advanced) is **not re-validated server-side on submit** — `RuleEvaluator` is only reached
    via the standalone `/EvaluateRules` API, not `SubmissionProcessor`/`FormValidationService`. So a
    "require-when" rule is enforced client-side but **bypassable** server-side (integrity gap).
- **Recommended future hardening (C#, NOT an AI guard):** add the 4 operators to `ConditionType` +
  `EvaluateRule` + `SerializeShowIf`, and wire `RuleEvaluator` into the submission validation path. Until then
  the safe, fully-enforced `field.showIf` operator set is the 10 enum members + And/Or.

**Validation parity (good news):** server `FormValidationService.Validate` is a **strict superset** of the
client (it also enforces Date/Phone/option-membership/Captcha + full composite per-part). No AI guard needed.

---

## §4. Build + deploy (B310) — what I did + GOTCHAS
- Bumped `MegaForm.Oqtane.Shared/AssetVersion.cs` → `20260629-B310`; rebuilt Shared.dll (Release, net10.0).
- Rebuilt vite bundles: `renderer` (autoload), `dashboard` (wizard Payment + AI Chips/Cards), + widgets/builder/
  embed/dnn-host/ai-form-assistant for consistency. All synced to the 3 platform wwwroot dirs.
- Deploy: **backed up** live Shared.dll + `megaform-{dashboard,renderer}.js` to `…\_mf_b310_backup\`, then
  stop `Oqtane.Server.exe` → swap Shared.dll + copy the 2 JS → relaunch (`Start-Process`, hidden) → site back
  up (HTTP 200) → verified `?v=20260629-B310` + the markers in the served JS. Rollback = restore from backup.
- **GOTCHA — two renderer sources, one output:** `megaform-renderer.js` can be built from `src/renderer/index.ts`
  (vite `renderer` entry, HAS the autoload) OR `src/renderer/megaform-renderer.ts` (`build-renderer.cjs`, HAS
  `bindRuleEngine`, legacy). The LIVE one is the **vite/index.ts** build (confirmed: live had `data-mf-autoload`,
  no `bindRuleEngine`). Don't run `build-renderer.cjs` — it would overwrite the deployed renderer with the wrong source.
- **GOTCHA — per-plugin build:** `npm run build` does NOT rebuild the individual `js/plugins/megaform-widget-*.js`
  (those are dated Jun 17). `build:widgets` builds only the 2 KB shim. Find the per-plugin builder before
  shipping any widget-plugin source change (e.g. the payment alias).

---

## §5. Visual QA results (browser, live B310)
| Item | Result | Evidence |
|---|---|---|
| `get_template_guide` returns NEW guide w/ correct steps (down-under/festa/bulgaria) | ✅ PASS | admin fetch, HTTP 200, step keys correct |
| Premium render — 4-step stepper + step-1 = correct 6 step-0 fields | ✅ PASS | screenshot `premium-home-euroyouth-b310.png` |
| Multi-step native nav (step 1 → step 2) | ✅ PASS | advanced to "Programme"; `stillStep1:false` |
| Cards control rich render (icon/title/meta/desc, selected state) | ✅ PASS | screenshot `premium-euroyouth-step2-b310.png` (Starter/Growth/Scale) |
| AI dashboard knows Chips/Cards | ✅ (deployed) | markers in served `megaform-dashboard.js` (not exercised via live LLM) |
| Wizard emits Payment (not legacy) | ✅ (deployed) | `provider:"stripe"/"paypal"` in served bundle (not exercised via live wizard) |
| D3 stepper→card top gap | 🟡 acceptable | gap moderate in render; the big top region is the Oqtane module chrome (MegaForm title + admin buttons), not the shell. Re-compare vs mock in anon view. |
| AI premium EDIT round-trip per template (§5b acceptance #3) | ⏳ NOT RUN | KB verified correct; the full AI-edit test is the remaining deeper check |

Screenshots saved at repo root: `premium-home-euroyouth-b310.png`, `premium-euroyouth-step2-b310.png`.

---

## §6. ⭐ NEW USER REQUIREMENT (research/design, "làm phiền sau") — Custom-shell string editing UX
**Problem (user):** editing the premium custom-shell strings is confusing/non-standard. The B306 "HTML Token
Designer → Form strings → Premium shell strings" surfaces them with **generic labels** ("Header string 3/4/5")
and edits raw customHtml text — hard to understand/manage.

**Why it's like this:** those strings are plain text nodes baked into `settings.customHtml` (the
`facts.json shellTexts[]` list). B306 (`builder/token-designer.ts`) detects them generically from the DOM and
swaps text via `set_html_text`. No semantic naming, no visual context.

**Proposed approach (intuitive, low-risk, incremental):**
1. **Semantic labels, not "Header string N".** Map each detected node to a human role via a per-template
   class→label table (the B306 handoff already listed the classes): e.g. EuroYouth `.ey-hero-copy h1`→"Hero
   headline", `.ey-brand span`→"Brand subtitle", `.ey-stats`→"Stat", `.bg-footer`→"Footer text", step
   `.eyebrow`→"Step N label", panel `h2`→"Step N heading", panel intro `p`→"Step N intro". Drive it from the
   deterministic **`facts.json shellTexts` + a `role` field** added by `gen-template-facts.cjs` (extend the
   generator to tag each shellText with its CSS-path role — keeps it auto + per-template).
2. **WYSIWYG inline edit on the live preview (the real win).** Make the builder canvas's shell text nodes
   `contenteditable` (or click→popover) so the user **edits what they see** — click the hero headline on the
   rendered form, type, commit via the same `set_html_text` swap (structure + customCss stay byte-identical).
   This removes the modal-of-textboxes entirely for the common case.
3. **Group + preview.** Keep B306's Header / Step-nav / Step-content groups but add the element's rendered
   preview (a thumbnail or the live node) next to each field so the label is unambiguous.
4. **Never expose raw HTML.** Content tokens (`{{content:*}}`) → friendly fields; hardcoded text → `set_html_text`
   swap. The user should never see angle brackets.
5. **AI parity:** the AI already gets `shellTexts` in the guide; adding `role` labels there makes its
   `set_html_text` edits more reliable too.

**Smallest first step:** extend `gen-template-facts.cjs` to emit `shellTexts: [{text, role, selector}]`, then
have `token-designer.ts` render `role` as the label instead of "Header string N". That alone fixes the
"khó hiểu" complaint without the bigger WYSIWYG work. WYSIWYG inline-edit is the follow-on.

---

## §7. Files changed this session (for your commit — I did NOT auto-commit)
**Mine to commit (source):**
- `MegaForm.UI/tools/gen-template-facts.cjs` (deriveSteps fix + Section exclusion)
- `MegaForm.UI/scripts/build-widget-catalog.cjs` (composite-alias extraction)
- `MegaForm.UI/src/ai-form-assistant/widget-catalog.gen.ts` (regen, +Chips/Cards +14 aliases)
- `MegaForm.UI/src/dashboard/ai-form-creator.ts` (Chips/Cards whitelist)
- `MegaForm.UI/src/dashboard/wizard/field-catalog.ts` (wizard → Payment)
- `MegaForm.UI/src/shared/widget-plugin-autoload.ts` (datagrid/razor/legacy-payment)
- `MegaForm.UI/src/widgets/plugins/megaform-widget-payment-unified.ts` (legacy aliases)
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (manifest cases)
- `MegaForm.Oqtane.Shared/AssetVersion.cs` (B310)
- `MegaForm.DNN/Resources/TemplateGuides/{bulgaria-discovery-programme,down-under-australia,euro-youth-application,festa-italiana,intake-acme-ocean}.{facts.json,guide.md}` (regen KB)
- Built bundles under `Assets/js/` if tracked (`megaform-renderer.js`, `megaform-dashboard.js`, etc.)

⚠️ **Why no auto-commit:** `AssetVersion.cs` + `MegaFormController.cs` + the regen KB (derived from Codex's
UNCOMMITTED premium JSON) are entangled with Codex's pending work. Committing the KB while the source JSON is
uncommitted will make `gen-template-facts.cjs --check` fail on a fresh checkout until Codex's JSON lands.
Review + commit with Codex's work in one coherent step. Do NOT `git add -A`.

## §8. Live state / how to roll back
- Live :5000 = B310, up. Backup of pre-B310 DLL+JS at `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\_mf_b310_backup\`.
- Rollback: stop `Oqtane.Server.exe`, restore the 3 `.B309` files, relaunch.
- The DB repoint is idempotent + forward-compatible (V2 migration will MERGE the same rows when the Server DLL
  with that migration is next deployed).

---

## §9. B311 — Card-option ICON fix + shell-string SEMANTIC LABELS (2026-06-29, live)
Two follow-up user complaints, both shipped to live **AssetVersion 20260629-B311** (one more stop/swap of
Shared.dll + renderer/dashboard/builder JS; backup at `…\_mf_b311_backup\`). **Core.dll deferred** (SSR parity;
the client renderer produces the visible result — premium forms client-rebuild the body).

### 9a. Card/Chip option icons rendered the literal word "city" instead of an icon
- **Cause:** the AI emitted `"icon":"city"` on Cards options; the contract is a GLYPH (emoji ★🚀 / HTML entity
  `&#128188;`), so the renderer printed the literal text "city".
- **Fix (3 places):**
  - TS `renderer/inputs.ts` — new `resolveOptionIconHtml`: glyph (emoji/entity/HTML) → as-is; a bare ASCII
    token ("city"/"rocket"/"fa-city") → `<i class="fa-solid fa-…">` (FontAwesome is loaded site-wide). ⚠ The
    first attempt only ADDED the helper but forgot to change the call-site (esbuild tree-shook it); the
    call-site at the `iconHtml` line MUST call `resolveOptionIconHtml`, not `renderOptionPart`. Verify the
    built bundle contains `fa-solid fa-` before deploying.
  - C# `FormHtmlRenderer.cs` — mirror `ResolveOptionIcon` (SSR parity; in source, **Core.dll not yet deployed**).
  - AI guidance — `ai-form-creator.ts` ("CARD/CHIP OPTION ICONS" note) + `gen-template-facts.cjs` C7 formula:
    icon MUST be a single emoji or a `fa-*` name, never a plain descriptive word.
- **Verified live (B311):** resolver micro-test proves `city → <i class="fa-solid fa-city">`, `fa-city →` same,
  emoji/★/`&#…` → as-is. Form 51 (down-under) renders 15 card icons as emoji correctly (no regression), zero
  literal "city" in any `.mf-option-icon`. (The user's exact "Các Thành Phố"/"city" field looked like an
  UNSAVED edit — not in the saved schema; the general fix covers it.)

### 9b. Premium shell-string editing UX — semantic labels (the "khó hiểu" complaint)
- The B306 Token-Designer → Form strings → "Premium shell strings" listed header strings as opaque
  "Header string 3/4/5". **Fix:** rewrote `token-designer.ts headerTargetLabel` to return semantic roles
  (Hero headline / Brand title / Brand subtitle / Header button / Hero badge / Hero stat / Footer text /
  Image caption / Active preset label …) + a dedup counter so repeats get "… 1/2". Step nav/content already
  had semantic labels.
- **Verified live (B311)** on form 52 (premium, customHtml 13.4 KB): the section now shows **Brand title /
  Brand subtitle / Active preset label** + Step 1-4 label/heading/intro, with **zero** "Header string N"
  remaining (screenshot `shell-strings-semantic-labels-b311.png`). The existing live-sync (type → canvas
  updates) makes this an effective edit surface now that labels are readable.
- **WYSIWYG click-to-edit on canvas — DEFERRED (documented, not built):** the builder CANVAS renders only the
  fields, NOT the premium hero/header shell (that lives in the separate read-only preview), so true
  click-the-hero-text-to-edit needs the preview to become interactive — a substantial feature, too risky to
  ship + verify autonomously. The semantic-labeled + live-syncing Form-strings editor is the safe delivery;
  full inline-canvas WYSIWYG is the next step (plan in §6).
- **⚠ Detection caveat:** native-migrated premium forms (e.g. form 51) carry a TINY customHtml (≈558 chars, no
  data-step) — their hero/stepper is theme+schema-driven, so `collectShellStringDescriptors` finds 0 shell
  strings and the section is empty. Those forms' header text isn't editable via the Token Designer at all
  (a separate gap to address — the header would need {{content:}} tokens or a theme-string editor).

### 9c. Login note (for future browser QA)
Oqtane :5000 login via Playwright: the form's submit is `form button:has-text("Login")` (NOT `a.app-login`),
and the inputs need **slow/sequential typing** to trigger Blazor `@bind` (a plain `.fill()` leaves the bound
value empty → silent no-login). Type `host` / `Minh@2002` slowly, press Enter on #password.

---

## §10. INLINE EDIT — host + Oqtane edit-mode (2026-06-29, live B313) — BUILT + VERIFIED end-to-end
User: "I want Inline Edit when host-login + edit mode" (`?edit=true`) — click text on the RENDERED form and
edit in place. Approved Phase 1+2. **Shipped + verified live.**

### What it does
- **New module** `MegaForm.UI/src/shared/inline-edit.ts` (gated post-render enhancement) wired into
  `renderer/index.ts` at the end of `init()` (try/caught). **`isInlineEditContext()` gate**: `?edit=true` in
  URL AND the MegaForm admin dock (`.mf-oq-linkbtn`/`[data-mf-shared-dashboard-badge]`) present → fires ONLY
  for a host in real edit mode. Public visitors: complete no-op (verified: 0 tagged when not in edit mode).
- **Phase 1 — shell strings:** scans the rendered `.mfp` shell for hero/brand/step/heading/intro/preset text
  → `contenteditable="plaintext-only"` + dashed outline + hover chip. On blur → records a text-only swap.
- **Phase 2 — field/Section labels:** tags `.mf-field-label` (+ option-group labels), keyed by the field's
  input `name` → on blur records `field.label` change.
- **Save pill** (floating, "Lưu N chỉnh sửa") → **SAFE round-trip save**: `GET /api/MegaForm/Form/{id}`
  (reliable single-form full entity) → apply ONLY the text swaps to `settings.customHtml` + the label changes
  to `schema.fields` → `POST /api/MegaForm/Form` echoing **every other field** from the GET (Title/Status/
  ModuleId/etc.) so nothing is nulled → reload.

### Verified live (B313, form 52 "âsá" / Down Under premium, host edit-mode)
- Gate fires: 62 editable tagged = **47 shell** (incl. the exact strings the user circled: "Down Under
  Experience", "Tell us about your Australian journey", "Great Barrier") + **15 field** labels (first_name=
  "First name", email="Email address", dob="Date of birth", …).
- End-to-end: edited hero → Save pill → round-trip POST → reload → **text persisted** (DB confirmed) → reverted
  via the same flow → DB clean, **Title/Status/fields all intact** (round-trip preserved the entity).
- Screenshot `inline-edit-active-b312.png`.

### Key facts / gotchas (for future work)
- Reliable GETs: `GET Form/{id}` (single, ~483 KB) and `Form/List?moduleId&siteId` (all, ~5.9 MB) both return
  the full entity (camelCase: schemaJson/settingsJson/title/status/moduleId…). **`Submit/Schema?formId=` 404s
  for premium forms** — do NOT use it for the round-trip. SaveForm = `POST /api/MegaForm/Form` with
  `?authmoduleid&authsiteid` + the FULL entity (PascalCase) — a partial entity NULLS columns, hence round-trip.
- The home module renders **form 52** (moduleId 36, not the page module 1826) — the round-trip reads moduleId
  from the GET, not the page.
- Oqtane edit mode is NOT entered by the URL param alone via automation — must log in first, THEN `?edit=true`.
- **Known polish:** the shell scan over-tags the 12-swatch theme-preset picker labels (Reef Turquoise…) as
  editable (harmless — editing just changes a swatch label). Tighten by excluding `.au-preset-menu`/preset
  picker from the shell scan. Native-migrated premium (tiny customHtml) exposes fewer shell strings — its
  step labels/headings are covered by Phase 2 (field/Section labels) instead.
- Deploy: B312 (first cut, Submit/Schema save — superseded) → **B313** (Form/{id} round-trip save, verified).
  Backups `_mf_b312_backup`. Renderer-only JS + Shared.dll; no Core/Server/Client DLL needed (client-detected
  edit mode, reused POST /Form). Research doc: `CLAUDE_RESEARCH_20260629_INLINE_EDIT_SHELL_STRINGS.md`.
