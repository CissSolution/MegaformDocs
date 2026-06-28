# HANDOFF — Form Creation Wizard · Form Builder · Field Controls (2026-06-28)

> Continue from here in a new session. Everything below is SHIPPED to `master` and DEPLOYED to
> the live Oqtane host **:5000** (`E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\`, login `host / Minh@2002`).
> This session's commits: `af77dfd` → `49f8d3b` (12 commits, listed below). Mock for visual
> compare runs at **:3100** (`form-builder-controls (10)`, `pnpm exec next dev --port 3100`,
> routes `/forms/{euro-youth,bulgaria,down-under-australia,festa-italiana,intake}`).

---

## ⚠️ READ FIRST — there is PARALLEL uncommitted work, do NOT clobber it
A separate session/actor is mid-feature on **"premium wizard → native schema migration"**. It is
UNCOMMITTED in the working tree and INTENTIONAL — do not revert/commit it as part of your work:
- New module `MegaForm.UI/src/shared/premium-native-migration.ts` (`migratePremiumWizardSchemaToNative`)
  imported by `wizard/templates.ts:13,88`, `wizard/transform.ts`, `builder/core.ts`.
- Modified (theirs): `MegaForm.Core/Services/{CustomShellCompatibilityCssService,ModuleCssComposer,ThemeFirstPaintCssService}.cs`,
  `MegaForm.DNN/Views/FormView.ascx.cs`, `MegaForm.Oqtane.Client/Index.razor`, the nuspec,
  `Migrations/01060035_SeedTemplateGuides.cs`, all `public/i18n/*.json`, `wizard/templates.ts`,
  and **`MegaForm.Oqtane.Shared/AssetVersion.cs`** (they keep bumping it — was B294 → B297 → **B301**).
- **Rule I followed (do the same):** commit ONLY the files YOU changed (`git add <explicit paths>`),
  never `git add -A`. Never bump/commit `AssetVersion.cs` yourself unless coordinating — read its
  CURRENT value and build Shared at that, don't overwrite their newer value.
- ⚠️ The live :5000 server **kept dying / being restarted** during the session (the parallel deploy
  stops it). If `:5000` is down, it's usually them mid-deploy — see "Deploy" below for the robust
  restart that survives.

---

## 1. WHAT SHIPPED THIS SESSION (commit → what)
| Commit | Area | Summary |
|---|---|---|
| `af77dfd` | Wizard ④ | Real Oqtane/DNN roles+users in the Workflow step. Server `Permissions/Catalog?formId<=0` → SITE-LEVEL catalog (Oqtane+DNN+Web). `wizard/principals.ts`. |
| `6823d3c` | Wizard ② | Real template library via `GET BuilderTemplates/List` (`wizard/templates.ts`); premium = `settings.customHtml`; faithful premium emit. |
| `d616db8` | Wizard ① | Full field palette from the registry (`wizard/field-catalog.ts`): composite presets from `COMPOSITE_PRESET_META`; Composite = `{type:'Composite', widgetProps:{preset}}`. |
| `5e2578c` | Wizard ③ | PREMIUM EDITABLE in the wizard: per-step add/remove + `syncFieldPlaceholders` reconcile of customHtml. |
| `1d42631` | deploy | AssetVersion bump (cache-bust). |
| `4a53314` | Wizard palette | Row/Columns, Card/Section, Flex Grid, Chips/Tags building blocks in the standard palette + preview. |
| `74ea42b` | Wizard | Standard single-page forms emit the AI **pure-grid shell** (`applyDefaultPureGridShell`, exported from `ai-form-creator.ts`) → one clean card, **no "card thừa"**, byte-identical to AI output. |
| `aae4164` | **Controls** | **NEW field types `Chips` (multi) + `Cards` (single)** split out from Radio/Checkbox. |
| `a92a729` | Controls | Rich default options (icon+title+meta+desc) for Cards + Option Columns for Chips/Cards. |
| `bbb3574` | CSS | Single clean border on chip/card hover+selected (removed the box-shadow ring → no doubled border). |
| `82cfca1` | **Date** | C# SSR now renders the **mf-cal** picker (not native `<input type=date>`); date-only **click-a-day commits+closes**, Apply dropped (kept only for date-time). |
| `49f8d3b` | CSS | Chips ALWAYS a tight flex-wrap pill cloud (ignore `--cols` grid); trimmed form-card top margin 24→12. |

---

## 2. FORM CREATION WIZARD — `MegaForm.UI/src/dashboard/wizard/`
A thin 5-step creation surface (Setup→Fields→Workflow→Design→Publish). On **Create Form** it emits a
full save-DTO → `POST /api/MegaForm/Form` → redirect `?mfpanel=builder&formId=N` → the EXISTING builder
opens fully populated. Entry: dashboard **New Form** button → `openFormCreationWizard()` (also
`window.MegaFormWizard.open()`). Files: `index.ts` (shell, `set()` re-render), `types.ts` (WizardData +
constants), `transform.ts` (WizardData→DTO), `save.ts` (POST + auth ctx), `ui.ts` (vanilla `h()`/CSS),
`step-{setup,fields,workflow,design,publish}.ts`, `preview.ts` (live preview mock), `field-catalog.ts`
(palette), `principals.ts` (real roles/users), `templates.ts` (real template library).
- **④ roles/users:** `principals.ts` → `GET Permissions/Catalog?formId=0` (same auth as `save.ts`).
  Server change (3 controllers): `formId<=0` returns site-level catalog (principals from portal via
  `ResolvePortalId(0)`). Workflow step `step-workflow.ts` dropdown + datalist of real roles/users; falls
  back to static `APPROVAL_ROLES` if the catalog can't load.
- **② templates:** `templates.ts loadTemplates()` → grid of REAL templates (premium badged). Premium =
  `settings.customHtml` present. Note: live :5000 catalog only had 2 PREMIUM templates (EuroYouth,
  Bulgaria) — **no standard templates**, so the standard-hydrate path is largely untested there.
- **① palette:** `field-catalog.ts` is the SINGLE source — composite presets from
  `renderer/helpers COMPOSITE_PRESET_META` + non-composite types. `transform.buildField` routes every
  type through it. `curatedFields()` shown by default + a "More fields" expander (grouped).
- **③ premium editable:** `step-fields.premiumFieldsEditor` parses the template's `data-step` panels
  (`@shared/custom-html-insert parseWizardStructure`/`fieldStepMap`) → per-step add/remove. On Create,
  `transform.premiumDto` reconciles `customHtml` with `syncFieldPlaceholders` (clone sibling wrapper into
  the right panel, clean orphan labels). The renderer's submit-guard keeps edited wizards submitting.
- **Pure-grid shell (no "card thừa"):** `transform.wizardToDto` (standard path) calls the EXPORTED
  `applyDefaultPureGridShell(schema)` from `dashboard/ai-form-creator.ts` → wraps fields in
  `<div class="mfp mfp-pure-grid">…<div class="mfp-card">`, theme `pure-grid-premium`. INVARIANT:
  a wizard standard form must use this shell to match AI output (the `:not(:has(.mfp-card))` compat
  guard then skips the wrapper card). No-op for multiPage/pageBreak/premium.

---

## 3. NEW FIELD CONTROLS — `Chips` + `Cards` (the big one)
Two FIRST-CLASS option field types, split out from Radio/Checkbox (which previously did chips/cards via
a hidden `optionDisplay` property). **Radio/Checkbox + premium templates were left UNTOUCHED.**
- **Model:** `Chips` = multi-select (checkbox inputs, forced `chips` skin). `Cards` = single-select
  (radio inputs, forced `cards` skin). Both reuse the canonical CSS class family
  `.mf-option-group--chips/--cards` + `.mf-option-item/.mf-option-control/.mf-option-ui/.mf-option-icon/
  .mf-option-check` (megaform.css:1437-1577) — so they inherit the premium skin everywhere for free.
- **Files changed (all additive; `forcedDisplay` params default null → Radio/Checkbox unchanged):**
  - `builder/field-plugins/_index.ts`: register `Chips`+`Cards` (category basic, hasOptions, options/
    general/condition groups) → palette tile + Options editor + properties for free.
  - `builder/core.ts:~597`: rich default-option seeds (Cards = icon/title/meta/desc + `allowOptionHtml`;
    Chips = clean labels) via `@shared/choice-defaults`.
  - `renderer/inputs.ts`: `getOptionGroupClass`/`renderOptionItem` gained `forcedDisplay`; switch cases
    `Chips` (checkbox, force 'chips') + `Cards` (radio, force 'cards'). dispatch at `inputs.ts:~406`.
  - **`MegaForm.Core/Services/FormHtmlRenderer.cs`**: MIRRORED SSR — `OptionItem`/`OptionGroupClass`
    `forcedDisplay` param + switch `case "Chips"`/`"Cards"`. ⭐BOTH TS+C# required (SSR/client parity) →
    **rebuild MegaForm.Core.dll**. Verified SSR HTML == client DOM.
  - `builder/canvas.ts:~3192`: Chips/Cards reuse the Radio/Checkbox inline canvas preview.
  - `wizard/field-catalog.ts`: `chips`→`Chips`, new `cards`→`Cards`; layout `card` relabeled
    "Card Container". `wizard/preview.ts` has 'chips'+'cards' preview hints.
  - `shared/choice-defaults.ts` (NEW, single source for wizard + builder): `defaultChipOptions()`,
    `defaultCardOptions()` (FA `<i class="fas fa-…">` icons — render because the form page loads FA
    (`RenderPage.cs:150 lib/fontawesome/css/all.min.css`) and both sanitizers allow `<i>`+class).
  - `builder/properties.ts`: the **Option Columns** control (Auto/1–4) shown + handler-enabled for
    Chips/Cards too (was Radio/Checkbox only at lines ~1677 + ~2125). The chips/cards "Choice Display"
    picker stays HIDDEN (skin fixed by type).
- **CSS polish:**
  - hover/selected = single clean border, NO box-shadow ring (the ring read as a doubled border); the
    focus ring is kept only for keyboard `:focus-visible`. Selected card = border + faint `color-mix`
    tint + soft lift. (megaform.css ~1484/1554/1559, marker `[ChipCardBorder v20260628]`.)
  - **Chips ALWAYS flex-wrap** — `.mf-option-group--chips.mf-option-group--cols { display:flex;
    grid-template-columns:none; }` (marker `[ChipNoColumns v20260628]`) so pills never stretch into a
    grid cell (the generic `.mf-option-group--cols` grid at megaform.css:1359 applies to any group).
    INVARIANT: columns apply to CARDS, never to chips (pills flow tight on desktop + mobile).

---

## 4. DATE PICKER — new mf-cal everywhere, click-to-close
- **OLD** = native `<input type="date">` (was emitted by C# SSR for custom-shell/pure-grid forms).
  **NEW** = the styled `mf-cal` calendar (`data-mf-cal="1"` shell + client panel).
- `FormHtmlRenderer.cs` `case "Date"` → `CalendarDatePicker()` renders the SAME mf-cal shell the client
  emits (`renderer/inputs.ts renderCalendarDatePicker`) → SSR/client parity. (rebuild Core.dll)
- `renderer/interactive.ts`: for **date-only / month-year**, clicking a day/month COMMITS + CLOSES
  immediately and the **Apply button is dropped**; only **date-time** keeps Apply (to set the time after
  picking a day). Modes: `datePickerMode`/`mode` = `date-only|date-time|month-year`.

---

## 5. DEPLOY to :5000 (the procedure that works)
Site root `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\` — module DLLs are AT THE ROOT, locked by the running
`Oqtane.Server.exe`. JS bundles at `wwwroot\Modules\MegaForm\js\…`, CSS at `wwwroot\Modules\MegaForm\css\megaform.css`.
1. **Build** what changed: TS `cd MegaForm.UI && node scripts/build-entry.cjs {renderer|builder|dashboard}`
   (or `npm run build` for all) → outputs to `Assets/js/…`. C#: `dotnet build MegaForm.Core/MegaForm.Core.csproj -c Release`.
2. **Stop** only the :5000 process (resolve by path, never bare name — there's also Oqtane.MFClean :5099):
   `Get-Process Oqtane.Server | ? { $_.Path -like '*Oqtane.10_new2*' } | Stop-Process -Force`.
3. **Swap** DLLs at root (`MegaForm.Core.dll`, `MegaForm.Oqtane.Shared.Oqtane.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`)
   + copy the changed JS bundles + `megaform.css` (retry-copy loop while the lock releases; back up once).
4. **Relaunch DETACHED so it survives** (plain `Start-Process exe` kept dying mid-session):
   `Start-Process cmd -ArgumentList '/c start "Oqtane5000" /D "<root>" "<root>\Oqtane.Server.exe"'`.
   Cold start ~50-90s on a loaded box — poll `http://127.0.0.1:5000/` for 200.
- **AssetVersion** (`MegaForm.Oqtane.Shared/AssetVersion.cs`) is the `?v=` cache-bust for ALL JS+CSS.
  It is OWNED by the parallel actor right now (currently **B301**). To cache-bust without stepping on
  them: build Shared at the CURRENT value and deploy that DLL (don't change the file). For QA, a fresh
  Playwright context (`qa5000/lib.mjs launch()`) bypasses the cache entirely.
- ⚠️ **Machine-hang gotcha:** launching multiple Next.js dev mocks at once OOM-ish hung the box. Bring
  servers up **one at a time**; kill stray mock node by command-line match (`next dev`/mock path), NEVER
  blanket-kill node (VS Code uses node). RAM was fine (7GB free) — the issue was simultaneous compiles.

---

## 6. QA HARNESS — `qa5000/*.mjs` (Playwright, host/Minh@2002, `lib.mjs` login)
`qa-wf-roles` (④), `qa-templates` (②/premium emit), `qa-palette` (① fields), `qa-premium-edit` (③),
`qa-layout-fields` (Row/Card/Chips palette), `qa-wizard-premium-look` (pure-grid == AI), `qa-chips-cards`
(Chips/Cards SSR/client parity + select), `qa-chips-cards-rich` (rich options + columns),
`qa-chip-card-border` (no doubled border), `qa-datepicker` (mf-cal + click-to-close), `inspect-form-layout`
/ `inspect-top-gap` (layout probes), `probe-templates`. Run: `node qa5000/<name>.mjs`. Render any form
headless via `GET /api/MegaForm/render/{id}` (full ANON page). Test forms created this session: 16,18,
20,21,22,33,35,39 (all NEW — originals untouched).

---

## 7. OPEN ITEMS / NEXT STEPS
- **Standard-template hydrate** untested (:5000 catalog has only 2 PREMIUM templates). Seed a standard
  template to exercise `templates.hydrateStandardFields` + the standard create path.
- **Top-gap above the inline form** — the part MegaForm controls (card `margin-top`) is trimmed to 12px.
  The DOMINANT ~75px gap is the **Oqtane module title** ("MegaForm" pane title) chrome, NOT MegaForm CSS;
  to remove it the user hides the module title in Oqtane Module Settings (config, not code).
- **Premium-native migration (parallel)** — when it lands/commits, re-verify Chips/Cards + the date
  picker still render on migrated forms (it rewrites premium `data-step` → schema Section.pageBreak).
- "Restricted" access scope in Publish; deeper premium submit/nav QA; date-time picker UX (still has Apply).

---

## 8. KEY INVARIANTS / GOTCHAS (don't relearn the hard way)
- **TS ↔ C# SSR parity:** option controls + the date picker render in BOTH `renderer/inputs.ts` AND
  `MegaForm.Core FormHtmlRenderer.cs`. Change BOTH + rebuild `MegaForm.Core.dll`, or SSR and client
  disagree (flicker / wrong control).
- **Chips never use columns** (pills flow tight); **Cards** do. Choice-Display picker stays hidden for
  both (skin fixed by type).
- **Wizard standard form must apply the pure-grid shell** (= AI output) or you get the doubled "card thừa".
- `field-catalog.ts` (wizard) + `field-plugins/_index.ts` (builder) + `FormHtmlRenderer.cs` (SSR) are the
  three places a new field type must exist to round-trip wizard→builder→render.
- Commit only YOUR explicit paths; the working tree has heavy parallel work + a fast-moving AssetVersion.
- Prior detail: [[project_form_creation_wizard_prep]], [[project_chips_cards_controls]] in memory; older
  handoffs `CLAUDE_HANDOFF_NEXT_SESSION_FORM_CREATION_WIZARD.md` + `..._FORM_SCHEMA_LABELS_CUSTOMHTML.md`.
