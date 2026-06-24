# MegaForm — Full Hardcoded Text Audit Report

> **Scope:** Builder, Widgets, Controls, Dashboard, AI Assistant, Server (C#), Razor/ASCX Views  
> **Date:** 2026-06-11  
> **Auditor:** Kimi Code CLI (multi-agent codebase scan)  
> **Verdict:** ~2,500+ hardcoded user-facing strings across 150+ files. ~25-30% i18n-capable today.

---

## 1. Executive Summary

### 1.1 Scale of the problem

| Surface | Files | ~Hardcoded Strings | i18n Coverage Today | Priority |
|---------|-------|-------------------|---------------------|----------|
| **Builder Chrome** (topbar, tabs, canvas, properties) | 12 | ~470 | ~15% | P0 |
| **Dashboard & Admin** (settings, modals, forms list) | 8 | ~200 | ~20% | P0 |
| **AI Form Assistant** (chat, prompts, tool descriptions) | 7 | ~80 | ~10% | P1 |
| **Submissions / Inbox / Workflow** | 18 | ~350 | ~25% | P1 |
| **Widgets** (plugins + grid-repeater + PDF builder) | 25 | ~350 | ~30% | P1 |
| **Runtime Renderer** (validation, date picker, etc.) | 6 | ~95 | ~40% | P1 |
| **Theme Designer** (left rail, right rail, presets) | 4 | ~70 | ~5% | P2 |
| **Workflow Editor** (BPMN nodes, panels, email) | 10 | ~120 | ~5% | P2 |
| **Designers** (image choice, slider, map, token, video) | 5 | ~40 | ~10% | P2 |
| **Templates / Gallery / Presets** | 5 | ~130 | ~0% | P2 |
| **Permissions / DB Tables / Rules** | 6 | ~50 | ~15% | P3 |
| **Live Style Editor** (`admin-live/`) | 5 | ~70 | ~10% | P3 |
| **Server C#** (controllers, services, validators) | 60+ | ~740 | ~15% | P1-P2 |
| **Razor / ASCX Views** | 12 | ~200 | ~5% | P2 |
| **Starter App Seeds** | 6 | ~150 | ~0% | P3 |
| **CSS `content:"…"`** | 3 | ~5 | ~0% | P4 |
| **TOTAL** | **~200** | **~2,550** | **~25-30%** | — |

### 1.2 Existing i18n Infrastructure (reuse, don't reinvent)

- **Client:** `MegaForm.UI/src/i18n/index.ts` — `t(key, params)` with 3-step fallback, `{param}` interpolation, lazy JSON load. **en-US inline catalog = 346 keys** (in `index.ts`) + `public/i18n/en-US.json` = **863 keys**.
- **Server:** `MegaForm.Core/i18n/MegaFormStrings.cs` + `JsonLocalizationProvider.cs`. **Currently only ~40 keys** in `DefaultLocalizationProvider`.
- **Builder bridge:** `builderT(key, fallback, params)` in `builder/core.ts:158`; `trTop()/tr()` in `megaform-renderer.ts:19`.
- **Locale files shipped:** `en-US`, `es-ES`, `fr-FR`, `de-DE`, `pt-BR`, `ar-SA` (full 863 keys); `ja-JP`, `ko-KR`, `vi-VN`, `zh-CN` (partial ~100 keys).
- **Per-form content translation:** Already works at runtime via `schema.translations[locale]`.

### 1.3 Two divergent stacks (root cause of partial translation)

1. **Static chrome catalog** (`t()` keys) — dev-authored, flat dot-namespace keys.
2. **Per-form content** (`schema.translations`) — end-user authored field labels.

These two stacks are **unaware of each other**. Builder chrome strings are NOT in `schema.translations`, and form field labels are NOT in the static catalog. This causes "half-translated" UIs.

---

## 2. Detailed Findings by Namespace

### 2.1 `builder.*` — Builder Chrome & Topbar (~470 strings)

**Key files:**
- `MegaForm.UI/src/builder/dom.ts` — topbar, tabs, right-rail panels, form settings (~120 strings)
- `MegaForm.UI/src/builder/canvas.ts` — canvas preview, drag-drop, flexgrid, toasts (~80 strings)
- `MegaForm.UI/src/builder/core.ts` — field type labels, defaults, buttons (~30 strings)
- `MegaForm.UI/src/builder/field-plugins/_index.ts` — 25+ field type names, property labels, placeholders (~80 strings)
- `MegaForm.UI/src/builder/properties.ts` — property panel, theme info, token designer, tests (~70 strings)
- `MegaForm.UI/src/builder/fields.ts` — tab labels, placeholders (~25 strings)
- `MegaForm.UI/src/builder/theme-left-rail.ts` + `theme-tab-adapter.ts` — preset names, color roles, font names, button variants (~65 strings)

**Representative hardcoded examples:**
```ts
// dom.ts:468
`<span class="w-mode-label">Build</span>`  // → builder.mode.build

// dom.ts:500
`<button data-tip="Preview form">Preview</button>`  // → builder.aria.previewForm

// field-plugins/_index.ts:129
`label: 'Short Text'`  // → field.type.shortText

// canvas.ts:259
`submitButtonText || 'Submit'`  // → builder.button.defaultSubmit

// theme-tab-adapter.ts:1156
`label: 'Rounded'`  // → theme.radius.rounded
```

**Vietnamese residue found:** `admin-live/presets.ts` has mixed Vietnamese hints in some control labels (per builder agent scan).

---

### 2.2 `dash.*` — Dashboard & Admin (~200 strings)

**Key file:** `MegaForm.UI/src/dashboard/index.ts` (~4,300 lines, 200+ strings)

**Categories:**
- Demo lock guards (`"{area} is disabled on the demo site"`)
- Google Sheets settings (`"Service Account JSON"`, `"Spreadsheet ID *"`)
- Database settings (`"Connection String"`, `"Test Connection"`)
- Payment settings (Stripe / PayPal labels, hints, test results)
- Email / SMTP settings (provider names, sender, test)
- Captcha settings (reCAPTCHA, hCaptcha labels)
- Upload settings (limits, storage mode, extension policy)
- Portal & Access settings
- AI settings (provider, base URL, model, API key)
- Sidebar navigation (`"Dashboard"`, `"Form Builder"`, `"Languages"`, `"Submissions"`, `"My Inbox"`)
- User menu (`"Administrator"`, `"Log out"`)

**Representative example:**
```ts
`"These defaults are shared across every admin on this site..."`  // → dash.ai.settingsHint
```

---

### 2.3 `ai.*` — AI Form Assistant (~80 strings)

**Key files:**
- `MegaForm.UI/src/ai-form-assistant/chat.ts` — chat UI labels, staged changes UI, DDL confirm (~25 strings)
- `MegaForm.UI/src/ai-form-assistant/ops.ts` — op result messages, style/preserve guards (~15 strings)
- `MegaForm.UI/src/ai-form-assistant/providers.ts` — provider names, settings labels (~15 strings)
- `MegaForm.UI/src/ai-form-assistant/settings.ts` — admin settings UI (~10 strings)
- `MegaForm.UI/src/ai-form-assistant/tools.ts` — ~20 AI tool descriptions (product decision needed)
- `MegaForm.UI/src/ai-form-assistant/inline-edit.ts` — inline mode labels (~5 strings)

**Representative example:**
```ts
// chat.ts
`title="Đính kèm ảnh / .txt / .md / .json"`  // → ai.input.attachTitle (VIETNAMESE!)

// ops.ts
`'[STYLE-001] Refused to set...'`  // → ai.ops.error.style001
```

---

### 2.4 `subs.*` / `inbox.*` / `flow.*` — Submissions, Inbox, Workflow (~350 strings)

**Key files:**
- `MegaForm.UI/src/submissions/SubmissionsShell.ts` — inbox shell, stats, bulk actions, filters (~120 strings)
- `MegaForm.UI/src/submissions/SubmissionModal.ts` — detail modal, print, fullscreen, nav (~25 strings)
- `MegaForm.UI/src/submissions/submission-activity-timeline.ts` — timeline events, actors, statuses (~40 strings)
- `MegaForm.UI/src/submissions/submission-detail-*.ts` — data tab, DB tab, flow tab, workflow panel (~80 strings)
- `MegaForm.UI/src/submissions/submission-flow-*.ts` — canvas, history, inspector, sidebar, model (~85 strings)

**Representative examples:**
```ts
// SubmissionsShell.ts
`'No submissions found'`  // → subs.empty.noSubmissions

// submission-activity-timeline.ts
`'Submission received'`  // → activity.event.submissionReceived

// submission-flow-sidebar.ts
`'Current Step'`  // → flow.sidebar.currentStep
```

---

### 2.5 `widget.*` — Widgets (~350 strings)

**Key files:**
- `MegaForm.UI/src/widgets/plugins/megaform-widget-payment-unified.ts` (~23 `t()` calls, many fallbacks)
- `MegaForm.UI/src/widgets/plugins/megaform-widget-phone-pro.ts` (~14 `t()` calls)
- `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts` (~13 `t()` calls)
- `MegaForm.UI/src/widgets/megaform-widget-grid-repeater.ts` (~150 strings: properties, validation, designer)
- `MegaForm.UI/src/widgets/pdf-form-builder/**/*.ts` (~120 strings: labels, modes, validation, modals)
- `MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid*.ts`
- `MegaForm.UI/src/widgets/plugins/megaform-widget-signature.ts`
- `MegaForm.UI/src/widgets/plugins/megaform-widget-qrcode.ts`

**Representative examples:**
```ts
// megaform-widget-grid-repeater.ts:118
`addRowLabel: '+ Add Row'`  // → widget.grid.addRow

// megaform-widget-payment-unified.ts
`'Complete payment before submitting the form.'`  // → widget.payment.completeBeforeSubmit

// pdf-form-builder/renderer/PdfFormBuilderRenderer.ts
`'Label', 'Whiteout', 'Text', 'Textarea', 'Checkbox', ...`  // → widget.pdf.palette.*
```

---

### 2.6 `form.*` — Runtime Renderer & Validation (~95 strings)

**Key files:**
- `MegaForm.UI/src/renderer/megaform-renderer.ts` — validation, date picker months, currency, success messages (~40 strings)
- `MegaForm.UI/src/renderer/validation.ts` — client-side validation messages (~20 strings)
- `MegaForm.UI/src/renderer/interactive.ts` — interactive widget messages (~15 strings)
- `MegaForm.UI/src/submissions/SubmissionsShell.ts` (report section)

**Note:** Many validation strings are ALREADY in `MegaFormStrings.cs` (`form.required_field`, `form.invalid_email`, etc.) but the **client-side renderer duplicates them** or uses `toLocaleDateString('en-US')` hardcoded.

---

### 2.7 `theme.*` — Theme Designer (~70 strings)

**Key files:**
- `MegaForm.UI/src/builder/theme-left-rail.ts` — preset names, filter chips, element names, color roles (~40 strings)
- `MegaForm.UI/src/builder/theme-tab-adapter.ts` — subtab names, radius shapes, shadow labels, button variants (~20 strings)
- `MegaForm.UI/src/styles/megaform-builder-shell.css` + `megaform-builder-ts.css` — `content:"Theme: "`, `content:"✓"`, etc. (~5 strings)

---

### 2.8 `workflow.*` — BPMN Workflow Editor (~120 strings)

**Key files:**
- `MegaForm.UI/src/builder/workflow/wf-meta.ts` — node type names (~25 strings)
- `MegaForm.UI/src/builder/workflow/wf-app.ts` — template names, node labels, edge labels (~40 strings)
- `MegaForm.UI/src/builder/workflow/wf-panels.ts` — email placeholder, SQL placeholder (~5 strings)
- `MegaForm.UI/src/builder/workflow/wf-email.ts` — email composer labels, toolbar (~15 strings)
- `MegaForm.UI/src/builder/workflow/wf-components.ts` — minimap, issues, collapse (~10 strings)
- `MegaForm.UI/src/builder/workflow/wf-database.ts`, `wf-webhook.ts`, `wf-google-sheets.ts`, `wf-approval.ts` (~25 strings)

---

### 2.9 `designer.*` — Popup Designers (~40 strings)

**Key files:**
- `MegaForm.UI/src/builder/imagechoice-designer.ts`
- `MegaForm.UI/src/builder/slider-designer.ts`
- `MegaForm.UI/src/builder/map-designer.ts`
- `MegaForm.UI/src/builder/token-designer.ts`
- `MegaForm.UI/src/builder/video-designer.ts`

---

### 2.10 `template.*` / `gallery.*` / `preset.*` — Templates (~130 strings)

**Key files:**
- `MegaForm.UI/src/builder/templates.ts` — import/export messages, golf/job/patient templates (~30 strings)
- `MegaForm.UI/src/builder/gallery.ts` — pagination, upload, dev bulk create (~25 strings)
- `MegaForm.UI/src/builder/presets.ts` — 25 preset titles + field labels (~50 strings)
- `MegaForm.UI/src/builder/save-as-template.ts` (~5 strings)
- `MegaForm.UI/src/presets/index.ts` — 50 form presets × 8 fields = ~400 labels (explosion)

**Note:** `presets/index.ts` is the biggest single source of hardcoded text (~400 strings). These are user-facing form template labels.

---

### 2.11 `server.*` / `api.*` — C# Server-Side (~740 strings)

**Key files:**
- `MegaForm.Core/i18n/MegaFormStrings.cs` — only ~40 keys today (severely under-populated)
- `MegaForm.DNN/WebApi/*.cs` — 10 controllers with hardcoded JSON error/success messages (~180 strings)
- `MegaForm.Oqtane.Server/Controllers/*.cs` — mirrored controllers (~120 strings)
- `MegaForm.Core/Services/FormValidationService.cs` — validation messages (~15 strings)
- `MegaForm.Core/Services/WorkflowEngine*.cs` — workflow status/errors (~40 strings)
- `MegaForm.Core/Services/WorkflowTaskService.cs` — task permission errors (~15 strings)
- `MegaForm.Core/Services/Starters/*.cs` — starter app seed labels (~150 strings)
- `MegaForm.DNN/Views/*.ascx` + `MegaForm.Oqtane.Client/*.razor` — server-rendered UI (~200 strings)

---

### 2.12 `report.*` — Submission Analytics (~60 strings)

**Key files:**
- `MegaForm.UI/src/dashboard/submission-report.ts`
- `MegaForm.UI/src/submissions/SubmissionsShell.ts` (report section)

---

### 2.13 `live.*` — Live Style Editor (~70 strings)

**Key files:**
- `MegaForm.UI/src/admin-live/LiveEditor.ts`
- `MegaForm.UI/src/admin-live/cssInspector.ts`
- `MegaForm.UI/src/admin-live/inspector.ts`
- `MegaForm.UI/src/admin-live/panelBuilder.ts`
- `MegaForm.UI/src/admin-live/presets.ts`

---

### 2.14 `lang.*` — Language Admin UI (~80 strings)

**Key file:** `MegaForm.UI/src/languages/index.ts`
- Tab labels (`"General"`, `"Dashboard"`, `"Controls"`, `"Widgets"`, `"Builder"`, `"Navigation"`, `"Validation"`, `"Server"`)
- Button labels, search placeholder, empty states, toast messages
- Language names (`"English"`, `"Español"`, `"Français"`, `"Deutsch"`, `"Português"`, `"العربية"`)
- AI translation prompt generation text

---

### 2.15 CSS `content` strings (~5 strings)

| File | Text | Issue |
|------|------|-------|
| `megaform-builder-shell.css:707` | `content: "✓"` | Cannot i18n natively in CSS |
| `megaform-builder-ts.css:2145` | `content: "Theme: "` | Cannot i18n natively in CSS |
| `megaform-builder-ts.css:2936` | `content: "Tokens load here..."` | Cannot i18n natively in CSS |
| `megaform-listview.css:21` | `content: " ⇅"` | Sort indicator |
| `megaform-submissions-ts.css:134` | `content: "—"` | Empty dash |

---

## 3. Key Issues Discovered

### 3.1 `builderT(key, 'FALLBACK')` anti-pattern
Across the builder, `builderT()` and `t()` are called with **English fallback strings as the 2nd argument**. Every fallback literal is a **hidden hardcoded string** that bypasses the translation catalog. These must be extracted into keys.

### 3.2 `toLocaleDateString('en-US')` hardcoded
Date pickers, submission timestamps, and report charts force `en-US` locale formatting. Non-US users see wrong date formats.

### 3.3 Currency hardcoded to `'USD'`
Payment widgets use `currency: 'USD'` with no locale override.

### 3.4 Font stack is Latin-only (`Inter`)
CJK (Chinese/Japanese/Korean) and Arabic text will render as mojibake. Need `Noto Sans CJK` + `Noto Sans Arabic` fallback chain.

### 3.5 Zero RTL support
No `dir` toggle, no `isRTL()`, pervasive physical CSS (left/right margins, translateX, etc.). Arabic (`ar-SA`) would break the builder and inbox visually.

### 3.6 Oqtane culture NOT bridged to JS
`Index.razor` injects `__MF_PLATFORM__` but **omits `culture`**. JS falls back to `navigator.language`, ignoring the site language setting.

### 3.7 Vietnamese residue in admin surfaces
- `dashboard/ai-form-creator.ts:91` — `title="Đính kèm ảnh / .txt / .md / .json"`
- `admin-live/presets.ts` — mixed Vietnamese control hints
- Some builder QA surfaces still have Vietnamese comments/labels.

### 3.8 Server-side i18n is nearly unused
`MegaFormStrings.cs` has only ~40 keys. Controllers return raw English strings directly in JSON responses. DNN uses `.resx` but coverage is minimal; Oqtane has no server-side localization wired.

### 3.9 Duplicate locale deploy copies
Same `es-ES.json` appears in ~8 different output directories (`Assets/`, `DesktopModules/`, `Oqtane.Server/`, `Umbraco/`, `Web/`). Changing one requires syncing all.

### 3.10 Per-form content authoring gap
`schema.translations[locale]` works at runtime, but the **builder has no "Languages" sub-tab** to author these translations. Oqtane lacks `MF_FieldTranslations` parity.

---

## 4. Recommended Fix Strategy (Optimal Approach)

### 4.1 Architecture: Single Pipeline, 2 Layers, One Resolved Culture

```
User Request
    → Culture Resolver (server-injected __MF_PLATFORM__.culture + BCP-47 fuzzy match)
    → Layer A: Static Chrome Catalog (dev-authored keys)
    → Layer B: Per-Form Content (end-user authored via builder)
    → Render (RTL-aware, Intl-formatted, font-fallback)
```

#### Layer A — Static Chrome (dev-authored)
- **Reuse `t()`/`builderT()`** for all TS/JS strings.
- **Flat dot-namespace keys:** `builder.*`, `widget.*`, `form.*`, `dash.*`, `ai.*`, `theme.*`, `workflow.*`, `designer.*`, `server.*`.
- **en-US inline = source of truth** (currently 346 keys in `index.ts`, must expand to ~1,200).
- **Build-time `i18n:check` gate:** CI script that fails if a `t()`/`builderT()` key is missing from the en-US catalog.
- **Server C#:** New `IMegaFormLocalizer` that shares the SAME JSON key set. Controllers return `L("key")` instead of raw strings.

#### Layer B — Per-Form Content (end-user authored)
- **Reuse existing `schema.translations[locale]`** path.
- **Add builder "Languages" sub-tab** to author translations for field labels, options, placeholders, button text.
- **Oqtane parity:** Persist translations in schema JSON (both platforms already save schema).

### 4.2 Culture Resolver (fixes Oqtane bridge)

1. `Index.razor` injects `window.__MF_PLATFORM__.culture` from `PageState/SiteState`.
2. `detectLocale()` in `i18n/index.ts` prioritizes:
   - `window.__MF_PLATFORM__.culture`
   - `data-mf-locale`
   - BCP-47 fuzzy match (`en` → `en-US`, `ar` → `ar-SA`)
   - `navigator.language` (last resort)
3. `initI18n()` loads locale, sets `dir`, all consumers read one `currentLocale`.

### 4.3 RTL + Layout Hardening

1. `isRTL()` + `setDir()` in `setLocale/initI18n`.
2. Single `mf-rtl.css` with `[dir=rtl]` logical-property overrides. LTR untouched.
3. **Ship `de-DE`** to force length-robust layouts (German text is ~30% longer than English).
4. **Ship `ar-SA`** at launch to harden the hardest case immediately.
5. Noto CJK + Arabic font fallback chain in one CSS line.

### 4.4 Intl Formatting (fixes functional bugs)

1. Replace ALL `toLocaleDateString('en-US')` with `toLocaleDateString(currentLocale)`.
2. Replace hardcoded `MF_DTP_MONTHS` array with `Intl.DateTimeFormat`.
3. Replace hardcoded `currency: 'USD'` with locale-aware currency from form settings.
4. Use `Intl.NumberFormat` for decimal/thousand separators.

### 4.5 Server-Side Localization (C#)

1. **Expand `MegaFormStrings.cs`** to ~300+ keys covering all controller messages, validation, workflow, and service errors.
2. **Implement `IMegaFormLocalizer` per platform:**
   - DNN: reads from `App_GlobalResources/*.resx` (standard DNN), falls back to `MegaFormStrings.cs`.
   - Oqtane/Web: reads from JSON files (`/i18n/server/{locale}.json`), falls back to `MegaFormStrings.cs`.
3. **Controllers return localized JSON:**
   ```csharp
   return Json(new { error = localizer.L("api.error.form_not_found") });
   ```
4. **Razor/ASCX views:** Inject `ILocalizationProvider`, use `@L("ui.settings.formBuilder")`.

### 4.6 CSS `content` Strings

CSS pseudo-elements cannot read JSON catalogs. Two options:
1. **Preferred:** Move `content` text into HTML/JS and use `::before` only for decorative symbols. Use `data-content` attribute driven by JS.
2. **Alternative:** Keep for decorative-only symbols (`✓`, `—`, `⇅`) and accept they are universal.

---

## 5. Implementation Phases (MVP = Phases 1-4)

| Phase | Scope | Effort | Deliverable |
|-------|-------|--------|-------------|
| **1** | **Baseline + culture bridge + lifecycle** | ~2-3d | De-Vietnamese baseline; inject Oqtane culture; BCP-47 fuzzy match; `isRTL()/setDir()`; missing-key logger |
| **2** | **Catalog tooling + completeness gate + 6 locales** | ~4-5d | `i18n:check` CI gate; create `de-DE`/`pt-BR`/`ar-SA` (already exist but verify); bring `es`/`fr` to full parity; expand server `MegaFormStrings.cs` |
| **3** | **Runtime + widgets** | ~4-5d | Extract ~95 runtime strings; Intl dates/numbers/currency; `mf-rtl.css` on form/inbox/submissions; prove live on Oqtane formId 2 in `ar-SA` + `de-DE` |
| **4** | **Per-form content authoring** | ~4-6d | Builder "Languages" sub-tab → `schema.translations`; Oqtane field-translation parity; end-user form language picker |
| **5** | **Builder chrome (~470) + dashboard (~200) + server/Razor (~200)** | ~8-10d | The big extraction; `[dir=rtl]` CSS for builder/dashboard; localize controller JSON + status enums by request culture |
| **6** | **AI/templates/exports + fonts + hardening** | ~4-5d | Localize AI chat + pass culture to LLM; email/PDF/CSV per-locale; Noto font swap; secure Language Dashboard + cache locale endpoint |

**Total effort:** ~26-34 dev-days full (~5-7 weeks).  
**MVP (Phases 1-4):** ~14-19d (~3 weeks) delivers "pick a language → runtime form + field content + inbox translate, RTL correct".

---

## 6. Quick Wins (Do First — High Leverage)

1. **Inject `__MF_PLATFORM__.culture`** in `Index.razor` (~1h) — stops `navigator.language` fallback.
2. **BCP-47 fuzzy match** in `detectLocale()` (~1h) — kills raw-key leakage.
3. **Create 3 missing locale files** (`de-DE`/`pt-BR`/`ar-SA` already exist in `public/i18n/` but verify completeness) (~2h).
4. **`isRTL()` + `setDir()`** in `setLocale/initI18n` (~2h) — Arabic gets correct direction immediately.
5. **Swap Inter-only font** for Noto/CJK/Arabic fallback chain (1 CSS line) (~30min) — kills mojibake.
6. **`i18n:check` completeness script** in CI (~4h) — stops future drift.
7. **Hand-seed `schema.translations`** on form 2 (~1h) — proves end-user field-label translation works TODAY.
8. **Remove Vietnamese residue** (`ai-form-creator.ts:91`, `admin-live/presets.ts`) (~1h).

---

## 7. File Inventory (All Files with Hardcoded Text)

### TypeScript / JavaScript (MegaForm.UI)
```
src/builder/core.ts
src/builder/dom.ts
src/builder/canvas.ts
src/builder/fields.ts
src/builder/properties.ts
src/builder/theme-tab-adapter.ts
src/builder/theme-left-rail.ts
src/builder/templates.ts
src/builder/gallery.ts
src/builder/presets.ts
src/builder/save-as-template.ts
src/builder/db-tables-panel.ts
src/builder/post-submit-settings.ts
src/builder/print-settings.ts
src/builder/toolbar.ts
src/builder/phase2.ts
src/builder/rule-builder-ui.ts
src/builder/imagechoice-designer.ts
src/builder/slider-designer.ts
src/builder/map-designer.ts
src/builder/token-designer.ts
src/builder/video-designer.ts
src/builder/field-plugins/_index.ts
src/builder/patches/megaform-template-gallery-search.ts
src/builder/workflow/wf-meta.ts
src/builder/workflow/wf-app.ts
src/builder/workflow/wf-panels.ts
src/builder/workflow/wf-email.ts
src/builder/workflow/wf-components.ts
src/builder/workflow/wf-database.ts
src/builder/workflow/wf-webhook.ts
src/builder/workflow/wf-google-sheets.ts
src/builder/workflow/wf-approval.ts
src/builder/workflow/wf-principal-picker.ts
src/builder/permissions/init.ts
src/builder/permissions/render.ts
src/dashboard/index.ts
src/dashboard/submission-report.ts
src/dashboard/ai-form-creator.ts
src/dashboard/embed-modal.ts
src/embed/embed-iframe.ts
src/languages/index.ts
src/presets/index.ts
src/admin-live/LiveEditor.ts
src/admin-live/cssInspector.ts
src/admin-live/cssUtils.ts
src/admin-live/inspector.ts
src/admin-live/panelBuilder.ts
src/admin-live/presets.ts
src/ai-form-assistant/chat.ts
src/ai-form-assistant/ops.ts
src/ai-form-assistant/providers.ts
src/ai-form-assistant/settings.ts
src/ai-form-assistant/tools.ts
src/ai-form-assistant/inline-edit.ts
src/submissions/SubmissionsShell.ts
src/submissions/SubmissionModal.ts
src/submissions/submission-activity-timeline.ts
src/submissions/submission-detail-shell.ts
src/submissions/submission-detail-data-tab.ts
src/submissions/submission-detail-db-tab.ts
src/submissions/submission-detail-flow-tab.ts
src/submissions/submission-detail-workflow-panel.ts
src/submissions/submission-flow-canvas.ts
src/submissions/submission-flow-history.ts
src/submissions/submission-flow-inspector.ts
src/submissions/submission-flow-model.ts
src/submissions/submission-flow-sidebar.ts
src/submissions/submission-livedb-modal.ts
src/submissions/submission-detail-utils.ts
src/views/SubmissionsList.ts
src/widgets/index.ts
src/widgets/megaform-widget-grid-repeater.ts
src/widgets/pdf-form-builder/builder/PdfFormBuilderConfig.ts
src/widgets/pdf-form-builder/index.ts
src/widgets/pdf-form-builder/renderer/FieldOverlay.ts
src/widgets/pdf-form-builder/renderer/PdfFormBuilderRenderer.ts
src/widgets/pdf-form-builder/renderer/PdfRenderer.ts
src/widgets/plugins/megaform-datarepeater-adapter.ts
src/widgets/plugins/megaform-datarepeater-launcher.ts
src/widgets/plugins/megaform-dynlabel-adapter.ts
src/widgets/plugins/megaform-dynlabel-launcher.ts
src/widgets/plugins/megaform-razor-launcher.ts
src/widgets/plugins/megaform-razor-studio-adapter.ts
src/widgets/plugins/megaform-razor-studio.ts
src/widgets/plugins/megaform-widget-content-slider.ts
src/widgets/plugins/megaform-widget-data-repeater.ts
src/widgets/plugins/megaform-widget-datagrid-sql.ts
src/widgets/plugins/megaform-widget-datagrid-studio.ts
src/widgets/plugins/megaform-widget-datagrid.ts
src/widgets/plugins/megaform-widget-dynamic-label.ts
src/widgets/plugins/megaform-widget-golf-scorecard.ts
src/widgets/plugins/megaform-widget-map-launcher.ts
src/widgets/plugins/megaform-widget-map.ts
src/widgets/plugins/megaform-widget-multicolumn-combo.ts
src/widgets/plugins/megaform-widget-payment-unified.ts
src/widgets/plugins/megaform-widget-phone-pro.ts
src/widgets/plugins/megaform-widget-qrcode.ts
src/widgets/plugins/megaform-widget-razor.ts
src/widgets/plugins/megaform-widget-signature.ts
src/renderer/megaform-renderer.ts
src/renderer/validation.ts
src/renderer/interactive.ts
src/styles/megaform-builder-shell.css
src/styles/megaform-builder-ts.css
src/styles/megaform-listview.css
src/styles/megaform-submissions-ts.css
```

### C# / Razor / ASCX
```
MegaForm.Core/i18n/MegaFormStrings.cs
MegaForm.Core/Services/FormValidationService.cs
MegaForm.Core/Services/WorkflowEngine.cs
MegaForm.Core/Services/WorkflowEngineV2.cs
MegaForm.Core/Services/WorkflowTaskService.cs
MegaForm.Core/Services/WorkflowEvaluator.cs
MegaForm.Core/Services/WorkflowTransparencyService.cs
MegaForm.Core/Services/AppQueryRegistryService.cs
MegaForm.Core/Services/BuilderTemplateCatalogStore.cs
MegaForm.Core/Services/GoogleSheetsAuthService.cs
MegaForm.Core/Services/DataRepeaterService.cs
MegaForm.Core/Services/FormDatabaseInsertService.cs
MegaForm.Core/Services/LifecycleRunner.cs
MegaForm.Core/Services/TemplatePackageService.cs
MegaForm.Core/Services/QrCodeCornerHtmlService.cs
MegaForm.Core/Services/EmailWorkflowNodeUiService.cs
MegaForm.Core/Services/PermissionCatalogService.cs
MegaForm.Core/Workflow/DatabaseNodeExecutor.cs
MegaForm.Core/Workflow/GoogleSheetsNodeExecutor.cs
MegaForm.Core/Workflow/ApprovalNodeExecutor.cs
MegaForm.Core/Workflow/ConditionNodeExecutor.cs
MegaForm.Core/Workflow/EmailNodeExecutor.cs
MegaForm.Core/Workflow/EndAndCalculateNodeExecutors.cs
MegaForm.Core/Workflow/WebhookNodeExecutor.cs
MegaForm.Core/Templating/UserTemplateManifestParser.cs
MegaForm.Core/Templating/UserTemplateScanner.cs
MegaForm.Core/Utilities/MegaFormUtils.cs
MegaForm.Core/ViewModes/FormViewSelector.cs
MegaForm.Core/Models/DataRepeaterModels.cs
MegaForm.Core/Models/WorkflowModels.cs
MegaForm.Core/Rendering/ResolvedRenderModel.cs
MegaForm.Core/Rendering/RenderModelResolver.cs
MegaForm.Core/Services/Starters/*.cs (6 files)
MegaForm.DNN/WebApi/AiAssistantController.cs
MegaForm.DNN/WebApi/AiKnowledgeController.cs
MegaForm.DNN/WebApi/AiKnowledgeFeedbackController.cs
MegaForm.DNN/WebApi/AiKnowledgeRulesController.cs
MegaForm.DNN/WebApi/AiKnowledgeTemplatesController.cs
MegaForm.DNN/WebApi/AiToolsController.cs
MegaForm.DNN/WebApi/BuilderTemplatesController.cs
MegaForm.DNN/WebApi/DataRepeaterApiController.cs
MegaForm.DNN/WebApi/MegaFormApiController.cs
MegaForm.DNN/WebApi/WorkflowApiController.cs
MegaForm.DNN/Services/DnnEmailSender.cs
MegaForm.DNN/Services/DnnWorkflowEmailSender.cs
MegaForm.DNN/Services/DnnWorkflowIdentityProvisioningService.cs
MegaForm.DNN/UserTemplates/AscxHostWidget.cs
MegaForm.DNN/Views/FormEdit.ascx / .ascx.cs
MegaForm.DNN/Views/FormEditOld.ascx
MegaForm.DNN/Views/FormView.ascx / .ascx.cs
MegaForm.DNN/Views/ManageModule.ascx / .ascx.cs
MegaForm.DNN/Views/Settings.ascx / .ascx.cs
MegaForm.Oqtane.Server/Controllers/*.cs (all)
MegaForm.Oqtane.Server/Data/EfPhase2Repository.cs
MegaForm.Oqtane.Server/Data/EfWorkflowRepository.cs
MegaForm.Oqtane.Server/Services/OqtaneWorkflowIdentityProvisioningService.cs
MegaForm.Oqtane.Server/Services/Startup.cs
MegaForm.Oqtane.Client/BuilderView.razor
MegaForm.Oqtane.Client/Dashboard.razor
MegaForm.Oqtane.Client/DashboardView.razor
MegaForm.Oqtane.Client/Index.razor
MegaForm.Oqtane.Client/Languages.razor
MegaForm.Oqtane.Client/Settings.razor
MegaForm.Oqtane.Client/Submissions.razor
MegaForm.Web/Data/EfWorkflowRepository.cs
MegaForm.Web/Services/WebConnectionRegistry.cs
MegaForm.Web/Services/WebServices.cs
MegaForm.Umbraco/Composers/MegaFormComposer.cs
```

---

## 8. Recommendations Summary

| # | Recommendation | Impact | Effort |
|---|---------------|--------|--------|
| 1 | **Expand `public/i18n/en-US.json`** from 863 → ~1,200 keys to cover all builder, widget, dashboard, AI, and server strings. | High | 2-3d |
| 2 | **Replace ALL `builderT(key, 'English fallback')`** with `builderT(key)` only; move fallbacks into en-US catalog. | High | 3-4d |
| 3 | **Implement `IMegaFormLocalizer` on server**; replace all raw controller strings with `L("key")`. | High | 3-4d |
| 4 | **Inject `__MF_PLATFORM__.culture`** in Oqtane `Index.razor` + `BuilderView.razor`. | Critical | 1h |
| 5 | **Add BCP-47 fuzzy match** in `detectLocale()` (`en`→`en-US`, `ar`→`ar-SA`). | High | 1h |
| 6 | **Add `isRTL()/setDir()`** in `setLocale/initI18n`; ship `mf-rtl.css`. | Critical | 4-6h |
| 7 | **Use `Intl.DateTimeFormat`/`Intl.NumberFormat`** everywhere; remove hardcoded `toLocaleDateString('en-US')`. | Functional fix | 2-3d |
| 8 | **Swap Inter font** for Noto Sans + CJK + Arabic fallback chain. | Visual fix | 30min |
| 9 | **Create builder "Languages" sub-tab** for per-form `schema.translations` authoring. | High UX | 4-6d |
| 10 | **Add `i18n:check` CI gate** to prevent future drift. | Process | 4h |
| 11 | **Sync `src/i18n/locales/` with `public/i18n/`** or eliminate the duplicate. | Maintenance | 2h |
| 12 | **Centralize locale deploy** to a single build-step copy instead of 8 manual directories. | Maintenance | 2h |
| 13 | **Move preset template labels** from `presets/index.ts` into JSON catalog (`preset.{id}.*`). | Scalability | 1-2d |
| 14 | **Localize Razor/ASCX views** via `@L("key")` / code-behind injection. | Completeness | 3-4d |

---

*Report generated by automated codebase scan. No code was modified. All findings are research-only for planning purposes.*
