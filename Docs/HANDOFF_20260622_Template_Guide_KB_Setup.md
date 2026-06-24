# HANDOFF 2026-06-22 — Template Guide KB Setup for Premium Forms

> Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
> Next session focus: **QA test on a clean DNN site** — verify AI can create/refine Premium forms without breaking custom HTML/CSS.  
> Test target: `http://dnn10322_megaclean.ai/` (login: `host` / `dnnhost`).

---

## 1. What is already implemented and building

### 1.1 Backend resolver / endpoint

- `ResolveKnowledgeBody()` in all three `AiToolsController`s resolves `guide_file` pointers.
- `GET /AiTools/GetTemplateGuide?slug=...` added to DNN, Oqtane, and Web.
- Guide files read from:
  - DNN: `~/DesktopModules/MegaForm/Resources/TemplateGuides/`
  - Oqtane/Web: `wwwroot/Modules/MegaForm/Resources/TemplateGuides/`

### 1.2 Client tool

- `get_template_guide` tool + dispatch case in `tools.ts`.
- `inspect_form_customizations` returns `templateGuideSlug`.

### 1.3 `templateGuideSlug` propagation

- 34 Premium template JSONs carry `templateGuideSlug: "tpl-<slug>"`.
- `BuilderTemplateCatalogStore.Normalize()` exposes `TemplateGuideSlug`.
- `gallery.ts` / `core.ts` preserve the slug through apply/reload.

### 1.4 System prompt + client enforcement

- `chat.ts` loads the guide before the first AI message and injects a `TEMPLATE DESIGN CONTRACT` block.
- Parsed frontmatter is cached on `window.__mfai_session.templateGuide`.
- `ops.ts` hard gates:
  - `GUIDE-001` — mutate immutable design fields (`customHtml`, `customCss`, `theme`, `customScripts`).
  - `GUIDE-002` — `replace_form_schema` without `preserveCustomizations` on immutable-design form.
  - `GUIDE-003` — add forbidden field types.
  - `GUIDE-004` — remove locked/required keys.
  - `GUIDE-005` — rename/retype locked keys.

### 1.5 Server-side gate

- `DesignPreservationGate.cs` extended with `TemplateGuideContract` and overload `Inspect(..., guideMarkdown)`.
- Blocks blanking, design mutation, locked-key removal, and forbidden types.
- Ready to wire into save endpoints; not yet called from a controller.

### 1.6 Build status

| Project / Command | Result |
|-------------------|--------|
| `dotnet build MegaForm.Core.csproj -f net10.0` | ✅ 0 errors |
| `dotnet build MegaForm.Oqtane.Server.csproj -f net10.0` | ✅ 0 errors |
| `dotnet build MegaForm.Web.csproj -f net9.0` | ✅ 0 errors |
| `dotnet build MegaForm.DNN.csproj -f net472` | ✅ 0 errors |
| `npm run build:builder` | ✅ bundle built + synced |

`npm run typecheck` still reports one pre-existing error in `src/builder/workflow/wf-app.ts:785`.

---

## 2. Known gaps / review list

1. **Guide drafts are auto-generated** — panel selectors, token `maxLength`, and `conversionExamples` need manual review.
2. **Duplicate slug** — `invitation-ceremony-another.json` + `invitation-ceremony-v6.json` share `tpl-invitation-ceremony`.
3. **Server gate not wired into save endpoints** — gate is implemented but not invoked by a controller yet.
4. **Existing saved Premium forms** will not have `templateGuideSlug`; only newly-applied templates carry it.

---

## 3. Next-session QA plan — clean DNN site

### 3.1 Target environment

- URL: `http://dnn10322_megaclean.ai/`
- Admin: `host` / `dnnhost`
- Goal: confirm AI can create and refine Premium forms without breaking custom HTML/CSS.

### 3.2 Pre-test checklist

- [ ] MegaForm module installed on the clean portal.
- [ ] `dev.lock` present so AI assistant is enabled.
- [ ] `MF_AI_Knowledge` table seeded with `Kind = 'template_guide'` rows (run `MegaForm.Core/Seed/ai-knowledge-template-guides.sql` or install the package containing the Oqtane migration/DNN SQL script).
- [ ] Guide markdown files deployed to `DesktopModules/MegaForm/Resources/TemplateGuides/`.
- [ ] Premium template JSONs with `templateGuideSlug` deployed to `App_Data/MegaForm/Templates/`.
- [ ] Latest `megaform-builder.js` bundle deployed (run `npm run build:builder` and copy to DNN `Resources/.../js/bundles/`).

### 3.3 Test scenarios

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1 | Template guide is fetchable | Login → open a Premium form in builder → DevTools Network → filter `GetTemplateGuide` | Request returns HTTP 200 with full guide markdown + `bodySource: "file:<slug>.md"`. |
| 2 | `templateGuideSlug` travels with template | Apply a Premium template from gallery → `MegaFormBuilder.state.schema.settings.templateGuideSlug` | Equals `tpl-<template-slug>`. |
| 3 | AI loads guide before planning | Open AI chat → ask "add a phone field" → watch tool calls | `get_template_guide` is called before `add_field` is emitted. |
| 4 | AI refuses to remove locked key | Ask "remove the first name field" on a template that locks `first_name` | `GUIDE-004` rejection in op result; field stays. |
| 5 | AI refuses to replace customHtml | Ask "change the header HTML" | `GUIDE-001` / `PRESERVE-002` rejection. |
| 6 | Convert purpose keeps design | Ask "convert this booking form to a job application" → choose A (preserve) | `replace_form_schema` with `preserveCustomizations:true` succeeds; `customHtml`/`customCss`/`theme` survive. |
| 7 | New fields stay visible | Add a new field while preserving design | `customHtml` auto-syncs `{{field:newKey}}` placeholder; field renders in preview. |
| 8 | Save does not wipe design | Save after AI changes | Form reloads with original `customHtml`/`customCss`/`theme` intact. |
| 9 | Theme mutation blocked | Ask "change theme to modern-blue" on a Premium template | `GUIDE-001` or `THEME-001` rejection if theme is immutable. |
| 10 | Clean form creation | Ask AI to "create a contact form" from scratch | No Premium template guide is loaded; AI builds a normal form without triggering GUIDE rules. |

### 3.4 Data to capture during QA

- Screenshot before/after each AI operation.
- DevTools Network HAR for `GetTemplateGuide`, `GetKnowledge`, and op dispatches.
- Browser console logs (watch for JS errors in `chat.ts` / `ops.ts`).
- Op result messages (especially rejections `GUIDE-*`, `PRESERVE-*`, `CONVERT-001`, `THEME-001`).
- Final form JSON (`settings.customHtml`, `settings.customCss`, `settings.theme`, `fields[]`).

### 3.5 Pass / fail criteria

- **Pass**: all 10 scenarios behave as expected; no broken layouts; no `customHtml` wipe; locked keys survive.
- **Fail**: AI overwrites `customHtml`/`customCss`, removes locked key silently, or guide is not fetched. Capture repro steps + form JSON for bug report.

---

## 4. Useful debug snippets

Check guide load in browser console:

```js
// Should return the full guide markdown
fetch('/DesktopModules/MegaForm/API/AiTools/GetTemplateGuide?slug=tpl-alpine-retreat-escape')
  .then(r => r.json()).then(console.log);
```

Check active guide contract:

```js
window.__mfai_session?.templateGuide;
```

Check current form slug:

```js
MegaFormBuilder.state.schema.settings.templateGuideSlug;
```

---

## 5. Rollback

- DNN KB rows: `DELETE FROM MF_AI_Knowledge WHERE Kind = 'template_guide' AND Source = 'megaform-builtin'`.
- Oqtane migration: revert `MegaForm.01.06.00.34` if not applied; else delete migration file + remove `__EFMigrationsHistory` row.
- Remove `templateGuideSlug` from the 34 Premium JSONs if it causes issues.
- Revert controller / chat.ts / ops.ts / core.ts / gallery.ts / catalog store / gate edits via git.
