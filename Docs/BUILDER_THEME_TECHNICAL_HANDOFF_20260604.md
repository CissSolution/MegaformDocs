# MegaForm Builder + Theme Designer — Technical Handoff

**Authored:** 2026-06-04 (originally after B69; **last updated 2026-06-06 after B79c ship**)
**Audience:** dev team picking up Builder + Theme work; assumes familiarity with TypeScript, C# / ASP.NET Web Forms, and CSS but NOT with this codebase
**Cache stamp at handoff:** `v20260606-B79c` (see [FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378)) — runtime VERIFIED on 3 schema types; builder-iframe is cache-bound (works on fresh browser sessions)
**Latest session pointer:** [§19 B79c Success Report — 2026-06-06](#19-b79c-success-report--2026-06-06-runtime-fixed-iframe-cache-bound) ⭐ START HERE if resuming
**Companion specs:**
- [docs/BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md](BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md) — 5-phase mock parity migration
- [docs/UNIFIED_WIDGET_DESIGNER_SPEC.json](UNIFIED_WIDGET_DESIGNER_SPEC.json) — Unified Designer popup contract

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Repository Layout](#3-repository-layout)
4. [Build + Deploy Pipeline](#4-build--deploy-pipeline)
5. [Database Schema](#5-database-schema)
6. [Builder Module Wiring](#6-builder-module-wiring)
7. [Theme Designer Module Wiring](#7-theme-designer-module-wiring)
8. [Event Contracts](#8-event-contracts)
9. [QA Methodology](#9-qa-methodology)
10. [Visual QA Acceptance Criteria](#10-visual-qa-acceptance-criteria)
11. [Risks + Common Traps](#11-risks--common-traps)
12. [Test Environments + Credentials](#12-test-environments--credentials)
13. [Phased Roadmap (Already Shipped + Pending)](#13-phased-roadmap)
14. [Required Reading Order](#14-required-reading-order)
15. [Command Bank](#15-command-bank)
16. [Session Continuation Notes — 2026-06-04 after B71](#16-session-continuation-notes--2026-06-04-after-b71)
17. [Session Continuation Notes — 2026-06-05 after B78](#17-session-continuation-notes--2026-06-05-after-b78)
18. [Session Pause Notes — 2026-06-06 mid-B79](#18-session-pause-notes--2026-06-06-mid-b79-display-style-rules-not-painting-on-runtime)
19. [B79c Success Report — 2026-06-06](#19-b79c-success-report--2026-06-06-runtime-fixed-iframe-cache-bound) ⭐ START HERE if resuming

---

## 1. Executive Summary

**What is MegaForm?**
A form builder + runtime that ships as both a DotNetNuke (DNN) module (`net472`) AND an Oqtane (`net10.0`) module from a single TypeScript codebase. The Builder UI lets admins design forms visually; the Theme Designer lets them restyle without touching CSS. Submitted forms persist to a SQL Server database.

**What's been shipping recently (B60–B69):**
- B60–B65: visual fixes (Phone widget DOM, Razor single-button card, theme preset paint, iframe parity, dark drag-ghost, palette tile compactness, popup hardening, sub-portal antiforgery, validation accordion audit, QR corner positioning, English-only defaults, clean iOS toggles)
- **B67**: Build/Design segmented pill in topbar (primary mode driver) + center canvas now stable across mode toggles (B50 iframe mount disabled by default — opt-in via `?themeIframe=1`)
- **B68**: Left rail in Design mode replaced — was IMAGES/FONTS/INSPECT/STRUCTURE, now PRESETS/ELEMENTS/COLORS matching the localhost:3000/builder mock
- **B69**: State-preview chip strip (Default/Hover/Focus/Disabled/Error) + Sun/Moon light/dark toggle in topbar (Design mode only)

**What's next (B70–B72):** Restructure right-rail Design panel sub-tabs to Global/Inputs/Buttons/Layout; canvas section cards + iOS Required toggle; Publish vs Save split. See [§13](#13-phased-roadmap).

**Hard user constraint that drove B67+:**
"FORM IN THE CENTER MUST NOT CHANGE when toggling between Theme and Builder modes." This is verified byte-for-byte by Playwright DOM probes (delta = 0).

**The "mock is presentation only" rule:**
The Tailwind/Radix mock at `http://localhost:3000/builder` is a REFERENCE for visual structure ONLY. Do NOT add or change running-system features when migrating — port the look, keep the wiring.

---

## 2. System Architecture

### Platform split
| | DNN (legacy) | Oqtane (modern) |
|---|---|---|
| TFM | net472 | net10.0 |
| Project | `MegaForm.DNN/` | `MegaForm.Oqtane.*` (Server, Client, Package) |
| Module shell | ASCX (`FormView.ascx`, `FormEdit.ascx`, `Dashboard.ascx`) | Razor Components (`Modules/MegaForm/`) |
| API surface | DNN Services Framework (`/DesktopModules/MegaForm/API/MegaForm/...`) | Oqtane MVC controllers (`/api/MegaForm/...`) |
| Asset base | `/DesktopModules/MegaForm/Assets/` | `/Modules/MegaForm/` |
| AntiForgery | DNN `$.ServicesFramework` + `__RequestVerificationToken` hidden input | Oqtane MVC AntiforgeryToken |

Both platforms consume the SAME bundles from `MegaForm.UI/`. The UI TypeScript layer is platform-agnostic and uses runtime detection (`window.Oqtane` / `__OQTANE__` / `data-mf-platform`) to pick endpoints + asset paths.

### Project list
```
MegaForm.Core            — shared C# (models, services, AI tools, DB context)
MegaForm.DNN             — DNN module shell (net472, ASCX views, Web API)
MegaForm.Oqtane.Server   — Oqtane server-side services + controllers
MegaForm.Oqtane.Client   — Oqtane Blazor client components
MegaForm.Oqtane.Package  — Oqtane NuGet package wiring
MegaForm.Oqtane.Theme    — Theme Designer host wrapper
MegaForm.UI              — TypeScript SPA (Vite-bundled, runs on both platforms)
MegaForm.Web             — Generic ASP.NET shell (used for QA + standalone hosts)
```

### Bundle topology
Built via `MegaForm.UI/scripts/build-entry.cjs` (per-entry Vite invocation). Output goes to `Assets/js/bundles/` + `Assets/js/` + `Assets/css/`. A `sync-platforms.cjs` post-build hook mirrors output into the Oqtane + DNN + Web tree.

| Entry | Source | Output | Loaded on |
|---|---|---|---|
| `builder-loader` | `src/loader/index.ts` | `bundles/megaform-builder-loader.js` | builder page (preloader) |
| `builder` | `src/builder/index.ts` | `bundles/megaform-builder.js` | builder page |
| `widgets` | `src/widgets/plugins/index.ts` | `megaform-widgets.js` | builder + runtime |
| `renderer` | `src/renderer/index.ts` | `megaform-renderer.js` | public form page |
| `dashboard` | `src/dashboard/index.ts` | `megaform-dashboard.js` | dashboard page |
| `submissions` | `src/submissions/index.ts` | `megaform-submissions.js` | submissions list |
| `submission-inbox` | `src/submission-inbox/index.ts` | `megaform-submission-inbox.js` | inbox surface |
| `listview` | `src/listview/index.ts` | `megaform-listview.js` | cross-form list |
| `views` | `src/views/index.ts` | `megaform-views.js` | view designer |
| `embed` | `src/embed/index.ts` | `megaform-embed.js` | embed snippets |
| `presets` | `src/presets/index.ts` | `megaform-presets.js` | preset gallery |
| `i18n` | `src/i18n/index.ts` | `megaform-i18n.js` | every surface |
| `workflow` | `src/builder/workflow/index.ts` | `builder/megaform-workflow-reactflow.js` | builder workflow tab |
| `ai-form-assistant` | `src/ai-form-assistant/index.ts` | `megaform-ai-form-assistant.js` | floating AI bubble |
| `unified-monaco` | `src/view-designer/shared/unified-monaco-entry.ts` | `megaform-unified-monaco.js` | lazy-loaded code editor (5 MB) |

### Module load order on the Builder page (FormView.ascx.cs)
1. **megaform-widgets.js** — plugin registry (must run BEFORE builder so `FieldPlugins.register()` calls take effect)
2. **megaform-builder-loader.js** — tiny preloader (shows skeleton while builder.js downloads)
3. **megaform-builder.js** — main editor
4. **megaform-i18n.js** — translation bridge
5. Lazy: workflow / unified-monaco / ai-form-assistant on demand

---

## 3. Repository Layout

### Builder + Theme files you'll touch most
```
MegaForm.UI/src/builder/
├── index.ts                       ENTRY — side-effect imports in strict order
├── core.ts                        window.MegaFormBuilder + state + EL handle map
├── dom.ts                         giant HTML emitter (topbar, palette, canvas chrome,
│                                  right-rail tab strip, all 10 tab content divs)
├── canvas.ts                      FlexGrid canvas, drag-drop, B49 chrome dressing-down,
│                                  B50 iframe preview (now opt-in via ?themeIframe=1)
├── properties.ts + properties-patch.ts  per-field property panel rendering
├── theme-tab-adapter.ts           Right-rail THEME tab; exposes window.MFThemeTabAdapter
├── theme-left-rail.ts             Left-rail Design panes (Presets / Elements / Colors after B68)
├── field-plugins/_registry.ts     FieldPlugin contract + StandardGroup enum
├── field-plugins/_index.ts        registration calls for built-in field types
├── presets.ts                     legacy preset definitions
├── post-submit-settings.ts        After-Submit accordion (Evoq-style toggles)
├── rule-builder*.ts               conditional-logic UI
├── workflow/                      ReactFlow workflow editor
├── patches/                       small fixes loaded after main builder boot
└── permissions/                   Access tab
```

### Theme designer (separate runtime that's been merged into builder THEME tab)
```
MegaForm.UI/src/theme-designer/    legacy standalone host (most files retired in B48)
└── inspector-structure-template-tree.ts  STRUCTURE pane tree component (still used)
```

### Server-side
```
MegaForm.Core/Models/Form*.cs           DTOs serialized to/from SchemaJson
MegaForm.Core/Services/ThemeRepository  loads + saves MF_Themes
MegaForm.Core/Services/SubmissionProcessor  validates + persists submissions
MegaForm.DNN/WebApi/MegaFormApiController.cs  REST endpoints (Form/Save, Form/Get, …)
MegaForm.DNN/Views/FormView.ascx.cs     emits <script> + <link> tags; cache-stamp V
MegaForm.Oqtane.Server/Services/        Oqtane-side mirrors of Core services
```

### Where bundle output lands (NEVER edit by hand — gets overwritten by build)
```
Assets/js/bundles/megaform-builder.js
Assets/js/megaform-renderer.js
Assets/css/megaform-builder-shell.css     ← built from src/styles/megaform-builder-shell.css
Assets/css/megaform-builder-ts.css        ← built from src/styles/megaform-builder-ts.css
Assets/css/megaform.css                   ← edited directly (not built — RUNTIME CSS, not bundled)
```

**TRAP:** `Assets/css/megaform-builder-shell.css` and `megaform-builder-ts.css` get OVERWRITTEN by `npm run build:builder`. Edits to them are lost. The CANONICAL source is `MegaForm.UI/src/styles/*.css`. See [§11](#11-risks--common-traps).

---

## 4. Build + Deploy Pipeline

### Build commands
```bash
cd MegaForm.UI

# Single bundle
npm run build:builder              # most common — Builder + widgets only
npm run build:renderer             # runtime form page
npm run build:dashboard            # dashboard page
npm run build:widgets              # widget plugins registry

# Full rebuild
npm run build                      # everything (~ 2-4 min)

# Type-check only
npm run typecheck                  # tsc --noEmit
```

### DNN-side rebuild (after .cs changes)
```bash
cd MegaForm.DNN
dotnet build -c Release -nologo
```

### Manual deploy to local DNN test site (Windows paths)
```bash
# After npm run build:builder:
cp Assets/js/bundles/megaform-builder.js  /e/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/js/bundles/
cp Assets/css/megaform-builder-shell.css   /e/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/css/
cp Assets/css/megaform-builder-ts.css      /e/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/css/

# After dotnet build:
cp MegaForm.DNN/bin/Release/net472/MegaForm.DNN.dll  /e/DNN_SITES/DNN10322_MegaTest/Website/bin/MegaForm.DNN.dll
```

### Cache busting
Bump the `V` constant at [FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378) on every visible behaviour change:
```csharp
const string V = "?v=20260604-B69";  // [B69-StateChipsLightDarkPreview] <release note>
```
The release note is THE changelog — write it as `[BNN-Summary] (1) what changed (2) why it matters (3) verification done`. New stamp invalidates `<script src=... + V>` cache entries.

### After deploy: DNN app-pool quirks
Hot-swapping `MegaForm.DNN.dll` causes IIS to recycle the app pool. Sometimes the pool gets STUCK in `Stopping` state. Recovery:
```powershell
# Force kill the w3wp + restart pool
Get-CimInstance Win32_Process -Filter "Name='w3wp.exe'" |
  Where-Object { $_.CommandLine -match 'DNN10322_MegaTest' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-WebAppPool -Name "DNN10322_MegaTest"
```

DNN first-hit warm-up takes **60-300 seconds**. Plan QA waits accordingly. The 503 we sometimes saw was app-pool offline; the 500 with "Connection To The Database Failed" is the test database being in RECOVERY_PENDING:
```sql
ALTER DATABASE [DNN10322_MegaTest] SET ONLINE WITH ROLLBACK IMMEDIATE
```

---

## 5. Database Schema

Tables live under the `dbo.` schema and are prefixed `MF_`. Install script: `MegaForm.DNN/Install/SqlScripts/01_CreateTables.sql`.

### Form persistence
| Table | Key columns | Notes |
|---|---|---|
| `MF_Forms` | FormId PK, PortalId, Title, **SchemaJson**, **SettingsJson**, **ThemeJson**, Status, IsPublished, WebhookUrl, AppId | One row per form. SchemaJson = field list. SettingsJson = after-submit, GENERAL toggles, validation rules. ThemeJson = preset id + cssOverrides + customCss + customHtml. |
| `MF_Apps` | AppId PK, PortalId, Name, ManifestJson | App = group of forms (Business Starter packs). |
| `MF_AppManifests` | exports/imports app bundles |
| `MF_FormPermissions` | FormId, PermissionType, PrincipalType, PrincipalId | RBAC |
| `MF_FormViews` | FormId, ViewKey, ViewType, ConfigJson, CustomHtml, CustomCss | Per-form "view" definitions (DataGrid, ListView, etc.) |
| `MF_FormRelations` + `MF_SubmissionLinks` | parent/child form FK relationships |

### Submissions
| Table | Key columns | Notes |
|---|---|---|
| `MF_Submissions` | SubmissionId PK, FormId, **DataJson**, IpAddress, UserId, Status, SubmittedOnUtc | Per-submission row; values stored as JSON |
| `MF_SubmissionValues` | ValueId, SubmissionId, FieldKey, FieldValue, ValueNumber, ValueDate, ValueBit, FieldType, FormId | **Flat index** of all field values; B55 added. Built by `SubmissionIndexerService` after every submission save. Reports + dashboards read from here. |
| `MF_Files` | FileId, SubmissionId, FieldKey, OriginalName, StoredPath | uploaded files |
| `MF_SavedDrafts` | DraftId, FormId, ResumeToken, DataJson, Email, ExpiresOnUtc | "Save & Continue" support |
| `MF_WebhookLog` | per-attempt log for outgoing webhooks |

### Other surfaces
| Table | Purpose |
|---|---|
| `MF_Themes` | per-portal saved themes (the 12 presets ship in code; admins can add more) |
| `MF_AI_Knowledge` | KB entries used by the AI Form Assistant — see KnowledgeId, EntryType, WidgetType, Surface, Tags, BodyJson |
| `MF_DesignerBlocks` | reusable canvas blocks per portal (B28 Layout Designer) |
| `MF_DataGridUserPrefs` | per-user column reorder + saved views for DataGrid widget |
| `MF_FieldTranslations` | per-locale label overrides used by schema endpoint |
| `MF_ReportDefinitions` | Submission Report MVP (B55) |
| `MF_UniqueIdCounters` | per-form unique-id sequence storage |
| `MF_Workflows` + `MF_WorkflowRuns` | BPMN workflow definitions + execution history |

### Common queries you'll write
```sql
-- See current schema of a form
SELECT TOP 1 SchemaJson, SettingsJson, ThemeJson
FROM MF_Forms WHERE FormId = 1270;

-- Recent submissions for a form
SELECT TOP 50 SubmissionId, UserId, SubmittedOnUtc, Status, DataJson
FROM MF_Submissions WHERE FormId = 1270
ORDER BY SubmittedOnUtc DESC;

-- Find every form using a specific widget
SELECT FormId, Title
FROM MF_Forms
WHERE SchemaJson LIKE '%"type":"QRCode"%';
```

---

## 6. Builder Module Wiring

### Entry sequence (must NOT reorder)
File: [MegaForm.UI/src/builder/index.ts](../MegaForm.UI/src/builder/index.ts)

1. `field-plugins/_index` — registers field types into `window.MFFieldPlugins`
2. `core` — creates `window.MegaFormBuilder` + state + EL handle map
3. `canvas`, `toolbar`, `properties`, `templates`, `panels`, `presets`, `phase2`, `rule-engine`, `rule-builder` — attach to MegaFormBuilder
4. `field-settings`, `properties-patch` — patches that wire later
5. `theme-tab-adapter` — exposes `window.MFThemeTabAdapter` (MUST load BEFORE dom.ts mounts the THEME tab)
6. `theme-left-rail` — listens to `mf:theme-tab-activated/deactivated` events
7. dom.ts generation runs — emits #mf-builder-root HTML, fires mount events

### State + DOM handles
`window.MegaFormBuilder.state` carries the in-memory form schema. `MegaFormBuilder.EL` is a map of element-id-references (e.g. `EL.canvasTitle`, `EL.canvasDescription`). Use `B.getVal(B.EL.X)` / `B.setVal(B.EL.X, v)` — never query DOM directly from feature modules.

### Topbar shell ([dom.ts:377-595](../MegaForm.UI/src/builder/dom.ts#L377))
Three-column CSS Grid: `.w-left` / `.w-center` / `.w-actions`. After B69:
- `.w-left` (max-content column): Back / form-name input / Status pill / **Build/Design pill**
- `.w-center` (1fr column): Undo / Redo / sep / **State chips** / **Sun-Moon** / sep / Device toggle
- `.w-actions` (max-content column): Templates / Preview / View Live / Save / Save-as-Template / Create-DB-Table / Publish

### Build/Design pill ↔ legacy 10-tab strip bridge (B67)
The pill is the canonical mode driver, but the 10-tab strip still exists in `.mf-right-tabs`. Clicking pill `Build` calls `.click()` on `#mf-tab-link-field`; clicking `Design` calls `.click()` on `#mf-tab-link-theme`. The strip is CSS-hidden in Design mode (`body[data-mf-mode="design"] .mf-right-tabs { display: none }`). URL flag `?legacy=1` to restore the strip.

### Right rail (tab content panels)
10 content divs in [dom.ts:551-1450](../MegaForm.UI/src/builder/dom.ts#L551):
- `#mf-tab-field` (Design Studio — accordion launcher for field props / form settings / custom HTML)
- `#mf-tab-settings` (Form Settings)
- `#mf-tab-html` (Custom HTML)
- `#mf-tab-theme` (Theme Designer — mounted by MFThemeTabAdapter)
- `#mf-tab-db` (Database Tables panel)
- `#mf-tab-rules` (Rule Builder)
- `#mf-tab-perms` (Permissions)
- `#mf-tab-workflow` (BPMN editor)
- `#mf-tab-print` (Print settings)
- (legacy `#mf-tab-ai`, `#mf-tab-embed`, `#mf-tab-widget` retired)

### Save endpoint
File: [toolbar.ts](../MegaForm.UI/src/builder/toolbar.ts), `saveDraft()` / `publish()` functions.
- DNN: `POST /DesktopModules/MegaForm/API/MegaForm/Form/Save?portalId=N&moduleId=N` with `ModuleId` + `TabId` headers stripped (sub-portal alias gotcha — B65j).
- Oqtane: `POST /api/MegaForm/Form` with Oqtane AntiforgeryToken.
- Antiforgery fallback chain: `state.config.servicesFramework` → `window.WebSF` → `__RequestVerificationToken` DOM input.

---

## 7. Theme Designer Module Wiring

### `window.MFThemeTabAdapter` public API
File: [theme-tab-adapter.ts:1603-1649](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L1603)

```ts
{
  activate(container?: HTMLElement): void  // mount theme panels into container
  deactivate(): void                       // persist + unmount
  reset(): void                            // restore default theme
  apply(): void                            // apply + notify save
  clear(): void                            // clear preview CSS

  setVar(name: string, value: string): void     // e.g. '--mf-primary', '#3b82f6'
  setCustomCss(css: string): void               // append to <style data-mf-theme-preview>
  setCustomHtml(html: string, useHtml?: boolean): void
  setPreset(themeId: string): void              // 'default' | 'modern-blue' | ...

  flushPreview(): void                          // post live theme CSS to iframe
  getState(): ThemeState                        // for QA + tests
  setDevice(d: 'desktop'|'tablet'|'mobile'): void
  buildTints(hex: string): TintStep[]
}
```

### 12 built-in presets (data in [theme-tab-adapter.ts:108-121](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L108))
`default`, `modern-blue`, `warm-sunset`, `dark-elegance`, `nature-green`, `flat-material`, `classic-formal`, `playful`, `healthcare`, `executive`, `tech-startup`, `minimal`

Each preset = `{ id, name, primary, secondary, tertiary }` plus an optional `bundledCss` block applied via `setCustomCss`.

### CSS variables exposed
`--mf-primary`, `--mf-secondary`, `--mf-tertiary`, `--mf-page-bg`, `--mf-page-bg-image`, `--mf-form-bg`, `--mf-form-shadow`, `--mf-form-radius`, `--mf-form-padding`, `--mf-form-max-width`, `--mf-form-border`, `--mf-font-family`, `--mf-font-size-base`, `--mf-line-height`, `--mf-color-text`, `--mf-input-bg`, `--mf-input-border`, `--mf-input-focus-border`, `--mf-input-radius`, `--mf-btn-radius`, `--mf-btn-padding`, `--mf-section-bg`, `--mf-section-border`, `--mf-check-color`, `--mf-progress-fill`. Source-of-truth declared in [Assets/css/megaform.css:11-115](../Assets/css/megaform.css#L11).

### Left-rail Design panes (B68)
File: [theme-left-rail.ts](../MegaForm.UI/src/builder/theme-left-rail.ts)
3 visible tabs: **Presets** | **Elements** | **Colors**. Legacy 4 panes (Images / Fonts / Inspect / Structure) retained as hidden `<div>`s so the Inspect iframe postMessage handshake keeps working.

Functions:
- `showThemeLeftRail()` — swap palette HTML to utility-nav (called on `mf:theme-tab-activated`)
- `showPaletteLeftRail()` — restore (called on `mf:theme-tab-deactivated`)
- `renderPresetsPane()`, `renderElementsPane()`, `renderColorsPane()` — pane HTML builders
- `wirePresetsPane()`, `wireElementsPane()`, `wireColorsPane()` — event listeners; delegate to `MFThemeTabAdapter.setPreset` / `.setVar`

### Right-rail Theme panel (sub-tabs)
Currently: `Colors | Type | Space | Effects | CSS | HTML`
Planned (B70): `Global | Inputs | Buttons | Layout` + CSS / HTML behind overflow menu.

### State preview chips + light/dark (B69)
File: [dom.ts:404-432](../MegaForm.UI/src/builder/dom.ts#L404) (markup) + [dom.ts:524-590](../MegaForm.UI/src/builder/dom.ts#L524) (wiring) + [megaform-builder-shell.css:335-465](../MegaForm.UI/src/styles/megaform-builder-shell.css#L335) (CSS).
- Chip click → `applyState('hover'|'focus'|'disabled'|'error')` → sets `data-mf-state` on `.mf-form-wrapper` / `.mf-form` inside canvas
- CSS rules `#mf-canvas-dropzone .mf-form-wrapper[data-mf-state="X"] input/textarea/select { … }` mirror real `:hover` / `:focus` styles
- Sun/Moon → `applyColorScheme('light'|'dark')` → `data-mf-color-scheme` on wrapper
- Both auto-reset on `mf:theme-tab-deactivated`

---

## 8. Event Contracts

### Window events fired by Theme subsystem
| Event | Detail | Fired by | Listened to by |
|---|---|---|---|
| `mf:theme-tab-activated` | — | dom.ts (tab click) | canvas.ts (enter theme-mode), theme-left-rail.ts (swap palette) |
| `mf:theme-tab-deactivated` | — | dom.ts (tab leave) | canvas.ts (exit theme-mode), theme-left-rail.ts (restore palette), dom.ts (clear state chips) |
| `mf:theme-preset-changed` | `{ themeId, primary }` | theme-tab-adapter `setPreset` | canvas.ts (rebuild iframe srcdoc), theme-left-rail.ts (refresh active tile) |
| `mf:theme-device-change` | `{ device }` | theme-tab-adapter `setDevice` | canvas.ts (resize dropzone) |
| `mf:theme-preview-refresh` | — | toolbar | theme-tab-adapter (re-flush preview) |
| `mf:theme-element-picked` | `{ key, selector }` | theme-left-rail Elements click | right-rail (scope to that selector — wired in future B71) |

### Other module events
| Event | Detail | Fired by | Listened to by |
|---|---|---|---|
| `mf:canvas-rendered` | — | canvas.ts after render | theme-tab-adapter (re-bind preset tiles) |
| `mf:tokens-changed` | — | properties.ts | dom.ts (sync token chips) |
| `mf-template-gallery-refresh` | — | save-as-template.ts | gallery.ts (refresh grid) |
| `mf:left-rail-collapse` | — | theme-left-rail close btn | core.ts (collapse panel) |

**Discovery tip:** `grep -n "dispatchEvent(new CustomEvent\|addEventListener('mf:" MegaForm.UI/src/builder/*.ts` finds every emitter + listener.

---

## 9. QA Methodology

### Principle 1: DOM probes > screenshots
A screenshot proves something rendered. A DOM probe proves the state machine works. Both matter, but if you only have time for one, do the probe.

### Principle 2: Always real-browser, never just unit tests
The Builder is a giant DOM-mutation graph. Unit tests miss layout / iframe / cross-frame issues. **Every** acceptance check runs against a real Chromium via Playwright against `http://DNN10322_MegaTest.AI/megaform/Home/...#mf-builder` (or the Oqtane equivalent).

### Standard Playwright probe template
File: `/tmp/mf-qa/qa_<commit>.cjs`
```js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 200)));

  // 1. Login (host/dnnhost on DNN10322_MegaTest)
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'dnnhost');
  await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');  // do NOT .click() — DNN postback breaks
  await page.waitForLoadState('load', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(3000);

  // 2. Open builder — use canonical URL pattern
  await page.goto(`http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1270?mfFormId=1270&_=${Date.now()}#mf-builder`,
    { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(8000);  // builder.js + widgets registration take ~5-8s

  // 3. Verify bundle stamp (sanity check the right version is deployed)
  const stamp = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src*="megaform-builder.js"]'))
      .map(s => s.src)[0]);
  console.log('BUNDLE:', stamp);

  // 4. Targeted DOM probe — capture facts, not opinions
  const info = await page.evaluate(() => {
    /* return { ... whatever needs verifying ... } */
  });
  console.log('INFO:', JSON.stringify(info, null, 2));

  // 5. Optional: screenshot for visual sanity
  await page.screenshot({ path: 'C:/temp/probe.png', fullPage: false });

  await browser.close();
})();
```

### Login gotchas
- **Use Enter key, not button click**: The DNN login button is an `<a href="javascript:__doPostBack(...)">`. Playwright's `.click()` triggers DNN ScriptManager strict-mode errors. Fill password then `await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter')` instead.
- **DNN warm-up**: First hit after app-pool restart takes 60-300s. Don't fail the script on timeout; retry once.

### Canonical builder URL
`http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/<N>?mfFormId=<N>&_=<ts>#mf-builder`
The redundant `mfFormId` in path + query is intentional — DNN sub-portal alias + builder loader BOTH probe; one missing causes a 400 (B65j fix).

### Center-canvas-identity test (B67 hard constraint)
```js
const canvasBefore = await page.evaluate(() => {
  const dz = document.getElementById('mf-canvas-dropzone');
  return dz ? { children: dz.children.length, htmlLen: dz.innerHTML.length } : null;
});

// ... click Build → Design → Build ...

const canvasAfter = await page.evaluate(() => { /* same */ });
console.log('CANVAS_DELTA:', canvasAfter.htmlLen - canvasBefore.htmlLen);
// Must be 0 — center DOM preserved byte-for-byte
```

### Computed-style probes for theme/state visuals
```js
const sampleStyle = await page.evaluate(() => {
  const el = document.querySelector('#mf-canvas-dropzone input');
  return el ? getComputedStyle(el).backgroundColor : null;
});
```

### Curl-verify before browser-verify
Faster smoke check: `curl` the deployed bundle and grep for new strings.
```bash
curl -s "http://DNN10322_MegaTest.AI/DesktopModules/MegaForm/Assets/js/bundles/megaform-builder.js?nocache=$RANDOM" |
  grep -c "w-mode-pill"   # should be ≥ 1 if B67 deployed
```

---

## 10. Visual QA Acceptance Criteria

For each phase, every claim in the release note MUST be verifiable. The acceptance criteria below assume B68/B69 just shipped.

### B67 acceptance (header pill + center stability)
- [ ] `.w-mode-pill` exists in topbar with exactly 2 children (`[data-mf-mode="build|design"]`)
- [ ] Default `body[data-mf-mode]` = `"build"` after page load
- [ ] Click `Design` → `body[data-mf-mode]` flips to `"design"`; `body.state-theme-mode` class added
- [ ] **`#mf-canvas-dropzone.innerHTML.length` delta across Build↔Design = 0**
- [ ] `?legacy=1` URL flag restores the legacy 10-tab strip
- [ ] `?themeIframe=1` URL flag re-enables the B50 iframe preview mount

### B68 acceptance (left rail mock parity)
- [ ] In Design mode left rail shows exactly 3 tabs: `PRESETS | ELEMENTS | COLORS`
- [ ] PRESETS pane: 12 tiles rendered, each `[data-preset-id]` set, search input filters by name
- [ ] Tile click → `MFThemeTabAdapter.setPreset(id)` called (right-rail tile state also updates)
- [ ] ELEMENTS pane: 8 rows (`form` / `header` / `labels` / `inputs` / `helptext` / `required` / `submit` / `errors`)
- [ ] COLORS pane: color picker + hex input + 12-swatch grid; picker change writes `--mf-primary`

### B69 acceptance (state chips + sun/moon)
- [ ] In Build mode, `.w-state-chips` and `.w-color-scheme` have `display: none`
- [ ] In Design mode, both have `display: inline-flex`
- [ ] 5 state chips render with colored dots (slate/orange/blue/grey/red)
- [ ] Click `Hover` → `.mf-form-wrapper[data-mf-state="hover"]` inside canvas
- [ ] State auto-resets to `default` when leaving Design mode (`mf:theme-tab-deactivated` listener)
- [ ] Sun/Moon: 2 buttons render, default `light` active, click `dark` → `data-mf-color-scheme="dark"` on wrapper

### Cross-phase regression suite (run after every change)
Each item is a one-line Playwright check.
| # | Check | Pass condition |
|---|---|---|
| 1 | Builder boots without console errors | `pageerror` count = 0 (except DNN PersonaBar `$(...).trigger is not a function` noise — known unrelated) |
| 2 | All 4 palette tabs present (Basic/Layout/Widgets/Plugins) | `.mf-palette-tab` count ≥ 3 |
| 3 | Drag QR Code tile → canvas | `[data-type="QRCode"]` exists after drop |
| 4 | Click QR field → right rail shows General + Condition only (no Validation) | `mf-prop-validation-group.display = "none"` |
| 5 | Open Form Settings popup → submit-btn-text placeholder is English only | `placeholder == "Submit"` (no VN) |
| 6 | Click Design pill → switch back → canvas DOM unchanged | innerHTML delta = 0 |
| 7 | Click Theme preset Nature Green → `--mf-primary` becomes `#2d8a4e` | `getComputedStyle(documentElement)['--mf-primary'].trim() === '#2d8a4e'` |
| 8 | Toggle to Mobile device → canvas max-width ≤ 400px | `.mf-panel-center[data-device="mobile"]` |
| 9 | Save form → response 200 + status pill flips to "Saved" | `#w-status.textContent === "Saved"` |
| 10 | After save, reload → form fields reappear identically | schema length match |

### Visual-regression baseline (capture once, diff each release)
Save these as `C:/temp/baseline_<name>.png`, manually compare after each ship:
- `b<N>_build_empty.png` — empty builder, Build mode
- `b<N>_build_5fields.png` — builder with QR/Appointment/ShortText/LongText/Number
- `b<N>_design_default.png` — Design mode, Default state chip
- `b<N>_design_hover.png` / `_focus.png` / `_dark.png` — state previews
- `b<N>_runtime.png` — public form `/xx?formid=N`

---

## 11. Risks + Common Traps

### TRAP 1 — Vite source vs output CSS confusion ⚠️ MOST COMMON
**Symptom:** You edit `Assets/css/megaform-builder-shell.css`, run a build, deploy, refresh — and the CSS rule isn't there.

**Cause:** `Assets/css/megaform-builder-shell.css` and `Assets/css/megaform-builder-ts.css` are BUILD OUTPUTS. The build script copies them from `MegaForm.UI/src/styles/*.css`. Your edit to the output file gets overwritten.

**Fix:** Always edit `MegaForm.UI/src/styles/megaform-builder-shell.css` (the SOURCE). Confirm by `grep -c "your-new-rule" MegaForm.UI/src/styles/megaform-builder-shell.css` before building.

**Exception:** `Assets/css/megaform.css` is the RUNTIME CSS, hand-edited, NOT bundled. Edit it directly.

### TRAP 2 — Cross-frame `instanceof` returns false
**Symptom:** `child instanceof HTMLElement` returns `false` for elements you can clearly see in DevTools.

**Cause:** When `child` lives in an iframe, its `HTMLElement` constructor is the iframe's class, NOT the parent's. `instanceof` checks parent's class, so it fails.

**Fix:** Use duck-typing: `child && child.nodeType === 1 && typeof child.tagName === 'string'`.

**Where it bit us:** B64 STRUCTURE walker traversed the canvas iframe DOM.

### TRAP 3 — DNN sub-portal alias 400 on Form/Get
**Symptom:** `GET /api/MegaForm/Form/Get?formId=N` returns 400 "Specified page is not in this site" on the sub-portal alias (e.g. `/megaform/Home`).

**Cause:** DNN cross-checks `TabId` + `ModuleId` headers against the alias-resolved portal. The parent portal's IDs don't match.

**Fix:** Strip `TabId` + `ModuleId` from `dnnHeaders`. Server reads `portalId` from query string. See [dom.ts dnnHeaders helper](../MegaForm.UI/src/builder/dom.ts).

### TRAP 4 — DNN antiforgery token unavailable
**Symptom:** `POST /api/MegaForm/Form/Save` returns 401 even though logged in.

**Cause:** `$.ServicesFramework` isn't loaded in the embedded Home-tab mode.

**Fix:** Multi-source fallback chain:
```js
function getAntiForgery() {
  try { return state.config.servicesFramework.getAntiForgeryValue() || ''; } catch {}
  try { return window.WebSF.getAntiForgeryValue() || ''; } catch {}
  const hid = document.getElementsByName('__RequestVerificationToken')[0];
  return hid ? hid.value : '';
}
```

### TRAP 5 — Vite minifier corrupts inline templates
**Symptom:** Build succeeds but iframe boots with `NaNvar s = ...` syntax error.

**Cause:** Vite's terser optimizes `+ // comment +` chains — comments mid-concat compile to `undefined` then string-coerce to `"NaN"`.

**Fix:** Build inline `<script>` content via `string[].join('')` with all comments OUTSIDE the concat. See [canvas.ts buildThemePreviewSrcdoc](../MegaForm.UI/src/builder/canvas.ts) for the working pattern.

### TRAP 6 — `mf-sortable-ghost` class (not `sortable-ghost`)
**Symptom:** During drag, the ghost tile shows the dark palette background — looks like a black bar streaking across the canvas.

**Cause:** MegaForm initializes SortableJS with `ghostClass: 'mf-sortable-ghost'` (mf-prefixed). Generic `.sortable-ghost` CSS rules don't match.

**Fix:** Target ALL three: `.sortable-ghost, .mf-sortable-ghost, .sortable-fallback`. The fallback covers `forceFallback: true` clones.

### TRAP 7 — `i18n.t()` returns the key when missing
**Symptom:** Buttons show `widget.appointment.prev_glyph` literal text instead of `‹`.

**Cause:** `MegaFormI18n.t(key, params)` returns `key` itself when no translation found. Widgets passing 3-arg `tr(key, params, fallback)` ignore the third arg.

**Fix:** In widget `tr()`, compare result vs key — if they match, use local English fallback.

### TRAP 8 — CSS Grid column shrink hides children
**Symptom:** `.w-left` reports width 486px but its child `.w-mode-pill` is at x=399 to x=565 — visually hidden behind `.w-center`.

**Cause:** `grid-template-columns: minmax(0, auto) ...` lets the column shrink to 0; children overflow.

**Fix:** Use `max-content` for any column that must hold its intrinsic content: `grid-template-columns: max-content minmax(0, 1fr) minmax(0, max-content)`.

### TRAP 9 — `state-theme-mode` hides canvas children
**Symptom:** After B50 you enable Theme mode and the center canvas goes empty.

**Cause:** [megaform-builder-ts.css:695](../MegaForm.UI/src/styles/megaform-builder-ts.css#L695) hides every child of `#mf-canvas-dropzone` except the iframe preview. If iframe is disabled (B67), nothing renders.

**Fix:** B67 added guard `html:not([data-mf-theme-iframe="1"]) body.state-theme-mode #mf-canvas-dropzone > * { display: revert }`.

### TRAP 10 — `?cdv=N` portal cache trumps `?v=...` bundle stamp
**Symptom:** You bump V to B70 but the browser still loads B69 CSS.

**Cause:** DNN appends its own `?cdv=N` portal-wide cache version on top of `?v=...`. The browser caches per full URL including cdv.

**Fix:** Either bump cdv (Host → SuperUser Accounts → Increment Portal CDV) or hard-refresh (Ctrl+F5).

### TRAP 11 — Theme `customCss` with hardcoded values defeats CSS-var sliders ⚠️ B71
**Symptom:** User drags a Theme slider (e.g. Button radius 14 → 40). `getComputedStyle(documentElement).--mf-btn-radius === "40px"` confirms the CSS var update propagated to the iframe. But the visible submit button radius stays at 14px. User reports "CSS customizations don't apply to form preview."

**Cause:** Forms with bundled `customCss` (e.g. form 1269 Halloween theme with 15 KB of `.mfp-halloween .mfp-submit { border-radius: 14px }` rules) use HARDCODED pixel values, not `var(--mf-btn-radius)`. The CSS var update has nothing to consume the new value because the actual `.mfp-submit` rule references a literal `14px`. The customCss wins via cascade (later + equal specificity).

**Fix:** [theme-tab-adapter.ts:325-440](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L325) — `buildElementLevelOverrides()` emits a third CSS block AFTER customCss containing explicit element rules with `!important`:
```css
.mf-form-wrapper button[type="submit"],
.mf-form-wrapper .mfp-submit,
.mf-form-wrapper .mf-submit,
.mf-form-wrapper .mf-btn-primary,
.mf-form-wrapper .mf-form-actions button {
  border-radius: var(--mf-btn-radius) !important;
  font-size: var(--mf-btn-font-size) !important;
  padding-top: var(--mf-btn-padding-y) !important;
  padding-bottom: var(--mf-btn-padding-y) !important;
  background: var(--mf-primary) !important;
}
```
Mirror selectors also cover inputs (`.mf-input/.mf-textarea/.mf-select/textarea`), form card (`.mf-form-wrapper > .mf-form, .mfp-card`), and typography (`h1/.mf-form-title/.mfp-form-title`).

**Where it bit us:** B70 shipped the live iframe preview but users with bundled-customCss themes (Halloween, custom community themes) reported sliders had no effect.

**If you add a new slider:** wire it into `buildElementLevelOverrides()` AND the existing `buildDeclarations()` so the var fires + the element rule re-emits.

### TRAP 12 — Preset-ID mismatch between left rail and adapter PRESETS array ⚠️ B78
**Symptom:** User clicks a preset tile in the new left rail (e.g. Forest / Ocean / Coral / Cyber / Berry / Earth) — the tile shows active (checkmark) but the form preview stays unchanged. Other presets (Default / Midnight / etc.) appear to work.

**Cause:** B76 ported the user's mock list of 16 preset IDs (`default`, `ocean`, `forest`, `sunset`, `lavender`, `midnight`, `rose`, `amber`, `slate`, `emerald`, `coral`, `cyber`, `carbon`, `arctic`, `berry`, `earth`) into [theme-left-rail.ts](../MegaForm.UI/src/builder/theme-left-rail.ts). The internal adapter PRESETS array in [theme-tab-adapter.ts:108-121](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L108) still has the LEGACY 12 IDs (`default`, `modern-blue`, `warm-sunset`, `dark-elegance`, `nature-green`, `flat-material`, `classic-formal`, `playful`, `healthcare`, `executive`, `tech-startup`, `minimal`). Only `default` overlaps. Clicking `forest` calls `MFThemeTabAdapter.setPreset('forest')` → adapter can't find the entry → silently no-ops → no CSS-var update fires → iframe stays the same.

**Fix:** [theme-left-rail.ts:350 + 771-803](../MegaForm.UI/src/builder/theme-left-rail.ts#L350) — each tile now carries `data-preset-c1 / c2 / c3 / c4` swatch values (read from the same 4-color array used to render the gradient strip). The click handler in `wirePresetsPane` explicitly cascades the swatch into the primary chain after calling `setPreset`:
```ts
adapter.setVar('--mf-primary', c1);
adapter.setVar('--mf-input-focus-border', c1);
adapter.setVar('--mf-check-color', c1);
adapter.setVar('--mf-progress-fill', c1);
adapter.setVar('--mf-btn-bg', c1);
adapter.setVar('--mf-btn-hover-bg', c1);
adapter.setVar('--mf-secondary', c2);
adapter.setVar('--mf-title-color', c2);
adapter.setVar('--mf-form-bg', c3);
```
Now ANY preset id (legacy or mock-aligned) propagates correctly regardless of whether the adapter's internal PRESETS array recognises it.

**Permanent solution:** Port the mock's 16 preset definitions into the adapter's PRESETS array so `setPreset(id)` always finds a match. Mock provides 4-color swatches per preset; internal PRESETS only carries `primary / secondary / tertiary`. The 4th color (border) can be derived or added. Tracked in B79.

### TRAP 13 — Invisible role-vars (Accent / Text Muted / Border Focus) ⚠️ B78
**Symptom:** User clicks a brand-color row in the left rail (e.g. "Accent", "Text Muted", "Border Focus") — the row shows is-active state but the form preview stays unchanged.

**Cause:** Mock organises colors into 5 categories (Brand / Surface / Text / Semantic / Form States) with 23 named role colors total. Many of these role names (`--mf-accent`, `--mf-text-secondary`, `--mf-color-success`, `--mf-input-hover-border`, etc.) **aren't consumed by the published runtime CSS**. They're conceptually valid design tokens, but no element in `Assets/css/megaform.css` reads them. Editing them lands in the iframe's `<style>` block but produces zero visual change.

**Fix:** [theme-left-rail.ts:949-959](../MegaForm.UI/src/builder/theme-left-rail.ts#L949) — when user clicks a row keyed `primary` / `primary-hover` / `primary-light`, ALSO cascade the value into the canonical `--mf-primary` chain (same vars as TRAP 12) so a visible change always lands. Other role keys (accent, secondary, text-muted, etc.) still write their target var but won't paint until the runtime CSS adopts them.

**Permanent solution:** Walk `Assets/css/megaform.css` and migrate hardcoded color hex values to consume the new role vars (e.g. `.mf-form { background: var(--mf-form-bg) }` already works; we need `.mf-help-text { color: var(--mf-help-color, var(--mf-text-muted)) }` etc.). Tracked in B80.

---

## 12. Test Environments + Credentials

### Local DNN test site (primary QA target)
- **URL:** `http://DNN10322_MegaTest.AI/` (host file maps to 127.0.0.1)
- **Site root:** `E:\DNN_SITES\DNN10322_MegaTest\Website\`
- **Module assets:** `E:\DNN_SITES\DNN10322_MegaTest\Website\DesktopModules\MegaForm\Assets\`
- **DLL deploy path:** `E:\DNN_SITES\DNN10322_MegaTest\Website\bin\MegaForm.DNN.dll`
- **Host login:** `host` / `dnnhost`
- **App pool name:** `DNN10322_MegaTest`
- **Database:** SQL Server SQLEXPRESS, db name `DNN10322_MegaTest`
- **MegaForm subportal alias:** `/megaform/` → portal 13
- **Canonical builder URL:** `http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/<N>?mfFormId=<N>#mf-builder`
- **Public form URL:** `http://DNN10322_MegaTest.AI/megaform/xx?formid=<N>`

### Reference mock (Tailwind/Radix demo of the target UX)
- **URL:** `http://localhost:3000/builder` (Build mode) and `http://localhost:3000/builder?mode=design` (Design mode)
- This is a Next.js + Radix UI + Tailwind app the user provided as the visual reference. **Do NOT copy code — copy the VISUAL structure only.** Re-implement with our own hand-rolled CSS in `MegaForm.UI/src/styles/`.

### Oqtane sibling site (for cross-platform smoke checks)
- **URL:** `http://localhost:5006/` (Kestrel)
- **Root:** `E:\DNN_SITES\Oqtane\` (check exact path on machine — the megaf site)

### Playwright install
Already installed at `C:/Users/Administrator/AppData/Local/Temp/mf-qa/node_modules/playwright`. Run probes via `node /tmp/mf-qa/qa_X.cjs`.

---

## 13. Phased Roadmap

### Shipped (in handoff order)
- **B66** — English-only defaults across builder + clean iOS toggle pills
- **B67** — Build/Design segmented pill in header; canvas stays put across mode toggles
- **B68** — Left rail Presets/Elements/Colors replacing Images/Fonts/Inspect/Structure
- **B69** — State chip strip + Sun/Moon color-scheme toggle (Design mode only)
- **B70** — Right-rail Theme Designer restructured to `Global | Inputs | Buttons | Layout` (CSS/HTML moved to Advanced accordion); Design mode uses runtime iframe preview by default for exact WYSIWYG; Build mode canvas wrapped in `.mf-form-wrapper > .mf-form` for runtime-like card styling
- **B71** — `buildElementLevelOverrides()` emits element-rule overrides AFTER customCss so user slider edits always paint, even on themes with hardcoded values (Halloween-style customCss). Submit button + inputs + form card + typography all covered. See TRAP 11.
- **B75** — Theme left rail Colors pane mock-aligned: Color Palette + Pick eyedropper + Quick Colors + Brand Colors + Surface Colors. End-to-end CSS picker (Pick → click element in form → right rail Inspector populates).
- **B76** — Left rail 1:1 port from user's VERCEL mock. 16 presets with Pro/New badges, 8 category chips with icons, search themes input + grid/list view toggle, live "N themes" count bar. Elements pane: 14 form-control types. Colors pane: 5 expandable categories (Brand / Surface / Text / Semantic / Form States) = 23 role colors. Panel width tightens to 288px in Design mode.
- **B77** — Right rail 1:1 port: 4 tabs (Global / Inputs / Buttons / Layout) with mock-aligned sections (Typography + Border Radius shape cards + Shadows preset cards + quad inputs + Transitions in Global; Input Dimensions + Label Styles + Helper Text + Borders & Focus + Placeholder in Inputs; Button Dimensions + Typography + 5 Variants + Icons + Loading State in Buttons; Spacing with link toggle + Form Container with alignment buttons + Grid Settings + Header & Footer + Responsive Breakpoints info card in Layout).
- **B78** — Live propagation fixes for two bugs: (1) Mock preset IDs not matching internal PRESETS array — fix via `data-preset-c1..c4` swatch attrs + explicit cascade after `setPreset` (TRAP 12); (2) Brand-color row clicks producing no visible change — fix via primary-variant cascade (TRAP 13). Verified on both standard form (1273) and customHtml/customCss form (1269 Halloween).

### Next up — B79 Port mock's 16 preset definitions into adapter PRESETS array (~1h)
- Permanent fix for TRAP 12: add Ocean/Forest/Coral/Cyber/Berry/Earth/etc. entries to internal `PRESETS` in [theme-tab-adapter.ts:108-121](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L108)
- Each entry gets `{ id, name, primary, secondary, tertiary }` derived from the mock's 4-color swatch
- After this lands, `setPreset(id)` always finds a match and the B78 cascade fallback becomes belt-and-braces

### B80 Walk megaform.css + adopt the 23 new role vars (~3h)
- Permanent fix for TRAP 13: replace hardcoded hex values in runtime CSS with `var(--mf-<role>, <fallback>)`
- Covers: `--mf-accent`, `--mf-text-secondary`, `--mf-text-muted`, `--mf-color-success / warning / error / info`, `--mf-input-hover-border`, `--mf-input-disabled-bg`
- After this lands, every brand-color row click in left rail produces a visible change

### B72 — Publish vs Save split + Logic/Workflow header chips (~2h, still deferred)
- Save = subtle outline, persists schema
- Publish = emerald CTA, sets `IsPublished=1` (requires prior Save)
- Logic chip → opens existing Rule Builder UI in a side drawer
- Workflow chip → opens existing BPMN editor in a side drawer

### B73 — Canvas section cards + iOS Required toggle (~5h, still deferred)
- Wrap each Section field in `.mf-canvas-section-card` with grouped background + label header
- Add `+ Add Field` dashed pill row at the bottom of each section
- Replace `Required` checkbox in field property panel with `.mf-evoq-toggle` iOS pill (B66 CSS already deployed)
- Auto-derive `Field Name / Key` from Label on first edit (only if user hasn't manually customized)

### Polish backlog (B81-B86 — all ~1-2h each)
- B81: Wire grid/list view toggle in Presets pane (currently sets class, no `.is-list` CSS yet)
- B82: Wire Pro/New badge gating — Pro tile click opens upsell modal
- B83: Wire Edit-Quick-Colors popover (currently no-op)
- B84: Wire Configure-breakpoints popover in Layout tab (placeholder button)
- B85: Wire `mf:theme-element-picked` from left rail Elements → scroll right rail to matching section + highlight
- B86: Adopt mock's Apply Theme button styling in right-rail header (purple gradient + flat shadow)

### Beyond — not in current scope
- Multi-select preset bulk re-color
- Custom preset save-as ("Save current settings as my-preset")
- A/B test scoreboard inside the Builder
- AI-assisted Theme suggestion ("make this form look more like an enterprise SaaS")

---

## 14. Required Reading Order

For a new dev, read in this order (≈ 1 day):

1. **This document** — overview + map
2. [docs/BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md](BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md) — what we're migrating to
3. [MegaForm.UI/src/builder/index.ts](../MegaForm.UI/src/builder/index.ts) — entry, in order
4. [MegaForm.UI/src/builder/core.ts](../MegaForm.UI/src/builder/core.ts) — state shape + EL handle map
5. [MegaForm.UI/src/builder/dom.ts](../MegaForm.UI/src/builder/dom.ts) lines 370-595 (topbar) and 551-1450 (right-rail tabs)
6. [MegaForm.UI/src/builder/canvas.ts](../MegaForm.UI/src/builder/canvas.ts) lines 1-300 (state-theme-mode + iframe lifecycle)
7. [MegaForm.UI/src/builder/theme-tab-adapter.ts](../MegaForm.UI/src/builder/theme-tab-adapter.ts) lines 100-200 (presets) + 1603-1649 (public API)
8. [MegaForm.UI/src/builder/theme-left-rail.ts](../MegaForm.UI/src/builder/theme-left-rail.ts) lines 60-260 (state + render)
9. [MegaForm.UI/src/builder/field-plugins/_registry.ts](../MegaForm.UI/src/builder/field-plugins/_registry.ts) — plugin contract
10. [MegaForm.DNN/Views/FormView.ascx.cs](../MegaForm.DNN/Views/FormView.ascx.cs) lines 1-100 + 350-400 — asset emission
11. [MegaForm.DNN/Install/SqlScripts/01_CreateTables.sql](../MegaForm.DNN/Install/SqlScripts/01_CreateTables.sql) — schema
12. [Assets/css/megaform.css](../Assets/css/megaform.css) lines 1-150 — runtime CSS vars

### When you need to debug a specific area
- **A field doesn't render** → field-plugins/_index.ts → its plugin → canvas.ts `renderField`
- **Save fails 401** → toolbar.ts `saveDraft` → dnnHeaders chain
- **A theme preset doesn't paint** → theme-tab-adapter.ts `setPreset` → bundledCss + setCustomCss
- **Iframe goes blank in Theme** → canvas.ts mountThemePreviewFrame + buildThemePreviewSrcdoc
- **State chip click no visual** → megaform-builder-shell.css `[data-mf-state="hover"]` selectors

---

## 15. Command Bank

### Build commands
```bash
# After TS change in builder
cd MegaForm.UI && npm run build:builder

# After TS change in renderer
cd MegaForm.UI && npm run build:renderer

# After CSS change in src/styles/
cd MegaForm.UI && npm run build:builder

# Everything
cd MegaForm.UI && npm run build

# Type-check only
cd MegaForm.UI && npm run typecheck
```

### Deploy commands (Windows, Git Bash)
```bash
# UI bundles + CSS
cp Assets/js/bundles/megaform-builder.js  /e/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/js/bundles/
cp Assets/css/megaform-builder-shell.css   /e/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/css/
cp Assets/css/megaform-builder-ts.css      /e/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/css/

# DLL (after dotnet build)
cp MegaForm.DNN/bin/Release/net472/MegaForm.DNN.dll  /e/DNN_SITES/DNN10322_MegaTest/Website/bin/MegaForm.DNN.dll
```

### Curl smoke-test deployed CSS/JS
```bash
# Verify deployed bundle includes your new class
curl -s "http://DNN10322_MegaTest.AI/DesktopModules/MegaForm/Assets/css/megaform-builder-shell.css?nocache=$RANDOM" |
  grep -c "your-class-name"

# Verify deployed builder.js has your new event
curl -s "http://DNN10322_MegaTest.AI/DesktopModules/MegaForm/Assets/js/bundles/megaform-builder.js?nocache=$RANDOM" |
  grep -c "mf:your-new-event"
```

### Recover stuck DNN site (PowerShell)
```powershell
# Force kill w3wp + restart pool
Get-CimInstance Win32_Process -Filter "Name='w3wp.exe'" |
  Where-Object { $_.CommandLine -match 'DNN10322_MegaTest' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-WebAppPool -Name "DNN10322_MegaTest"

# Bring DB back online from RECOVERY_PENDING
Invoke-Sqlcmd -ServerInstance "localhost\SQLEXPRESS" `
  -Query "ALTER DATABASE [DNN10322_MegaTest] SET ONLINE WITH ROLLBACK IMMEDIATE"
```

### Search for Vietnamese leftovers in UI (no-VN audit)
```bash
grep -rEn "[ăâđêôơưĐ]|[áàảãạâấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]" \
  MegaForm.UI/src/builder/ Assets/ts/ MegaForm.UI/src/widgets/plugins/ \
  --include="*.ts" | grep -vE ":\s*//|comment"
```

### Find every CustomEvent emitter / listener
```bash
grep -rn "dispatchEvent(new CustomEvent\|addEventListener('mf:" \
  MegaForm.UI/src/builder/ MegaForm.UI/src/renderer/ --include="*.ts" | sort
```

### Quick SQL queries (sqlcmd)
```powershell
Invoke-Sqlcmd -ServerInstance "localhost\SQLEXPRESS" -Database "DNN10322_MegaTest" `
  -Query "SELECT FormId, Title, IsPublished FROM MF_Forms ORDER BY FormId DESC"

Invoke-Sqlcmd -ServerInstance "localhost\SQLEXPRESS" -Database "DNN10322_MegaTest" `
  -Query "SELECT TOP 5 SubmissionId, FormId, SubmittedOnUtc FROM MF_Submissions ORDER BY SubmissionId DESC"
```

### Bump cache stamp (every visible behaviour change)
Edit [FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378):
```csharp
const string V = "?v=20260605-B70";  // [B70-RightRailGlobalInputsButtonsLayout] <what changed>
```
Then rebuild DLL and redeploy. Document the change with a `[B<N>-Summary]` prefix at the start of the release note.

---

## 16. Session continuation notes — 2026-06-04 after B71

This section is the LATEST state of the migration as of cache stamp `v20260604-B71`. Read this first if you're picking up the next session.

### What just shipped (B70 + B71)
- **B70** (right-rail restructure): Theme Designer's right-rail tabs flipped from `Colors | Type | Space | Effects | CSS | HTML` → mock-aligned `Global | Inputs | Buttons | Layout`. CSS + HTML editors moved into an "Advanced" accordion. Design mode now uses the runtime iframe preview by default (`canvas.ts:104` `var useIframe = true`); opt-out with `?themeIframe=0`. Build mode wraps the canvas dropzone in `.mf-form-wrapper > .mf-form` so styles match runtime more accurately.
- **B71** (slider fix): `buildElementLevelOverrides()` in [theme-tab-adapter.ts:325-440](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L325) emits element-rules AFTER customCss with `!important` so user sliders win against bundled hardcoded values. Submit / inputs / form-card / typography selectors all wired.

### Bugs from the user (2026-06-04 session, B71 fix)
The user reported two bugs:
1. **"Theme editor cannot switch back to Builder mode"** — **NOT REPRODUCED**. DOM probe confirmed clicking Build pill flips `body[data-mf-mode]` to `"build"`, removes `state-theme-mode` class, activates `mf-tab-link-field`, hides theme panel. Likely user clicked outside hit area or hit a transient state. **No code change**.
2. **"CSS customizations don't apply to form preview / must auto-load theme from schema"** — **REPRODUCED + FIXED via B71**. Root cause: theme schema (Halloween) IS auto-loaded into adapter state correctly. CSS-var sliders DO propagate to the iframe. But customCss uses hardcoded pixel values that beat the var. Fix: element-rule overrides emitted after customCss.

### Verification commands (browser-confirmed)
On form 1269 (`Spooky Night asdasdasdParty` with bundled Halloween theme + 15kB customCss):
```js
// In Design mode after dragging Button radius slider to 40:
window.MFThemeTabAdapter.getState().cssOverrides['--mf-btn-radius']  // → "40px" ✓
// Inside the preview iframe:
const dz = document.querySelector('iframe.mf-theme-preview-frame').contentDocument;
const submit = dz.querySelector('.mfp-submit');
getComputedStyle(submit).borderRadius  // → "40px" ✓ (was "14px" before B71)
dz.getElementById('mf-theme-live-preview').textContent.includes('[B71]')  // → true ✓
```

Screenshot proof at `b71_slider_works.png` (in repo root) — Halloween form 1269 fully rendered in Design mode with pumpkin / event badges / dark theme / spooky labels all painted.

### What's still pending (B72+)
- **B72 — Publish vs Save split** (~2h): split the single black "Publish and Return Dashboard" CTA into a subtle outline `Save` (persists schema, no IsPublished flip) + emerald `Publish` (requires saved state). Promote Logic/Workflow as header chips opening side drawers.
- **B73 — Canvas section cards + iOS Required toggle** (~5h): wrap each Section in `.mf-canvas-section-card`, add `+ Add Field` dashed pill row, replace Required checkbox with `.mf-evoq-toggle` iOS pill (CSS already shipped after B66), auto-derive `Field Name / Key` from Label.
- **Iframe theme-class mismatch** (low priority): probe noticed iframe body has class `mf-theme-warm-sunset` while form theme is `halloween-floating-ghosts`. The customCss still applies because `.mfp.mfp-halloween` is present (added from `customHtml`), so visually it's OK. But the wrong `mf-theme-<id>` class means any `.mf-theme-halloween-floating-ghosts` CSS in `megaform-themes.css` (if added in future) wouldn't apply. Worth investigating in the runtime renderer's theme-class application code (`MegaForm.UI/src/renderer/index.ts`).
- **Iframe form title empty** (low priority): `CFG.title = ""` in the iframe was passed but the rendered `.mfp-form-title` shows empty. Likely the renderer uses the form's `Title` field which 1269 may not have set, or the customHtml `{{form:title}}` placeholder isn't resolving.

### Where the active TODO list ended
```
✅ Bug 1 investigation (no fix needed)
✅ Bug 2 investigation (B71 fix shipped)
✅ Build + deploy + browser-verify
```

### Files most recently touched
- `MegaForm.UI/src/builder/theme-tab-adapter.ts` (B71 `buildElementLevelOverrides()` + extended `buildIframeOverridesCss()`)
- `MegaForm.DNN/Views/FormView.ascx.cs:378` (cache stamp `?v=20260604-B71` + release note)

### Pre-flight before next session starts
1. Open this handoff doc + skim [§11 Risks + Traps](#11-risks--common-traps) — especially TRAP 11 (B71 customCss-vs-var trap) which is THE most recent learning.
2. Verify the test DNN site is healthy: SQL Server SQLEXPRESS up, `DNN10322_MegaTest` database in `ONLINE` state (not `RECOVERY_PENDING`), w3wp pool started. See [§4 Build + Deploy → "After deploy: DNN app-pool quirks"](#4-build--deploy-pipeline).
3. Form 1269 is the canonical "complex theme" QA target. Form 1270 is the "simple/clean theme" target. Drive both when verifying anything theme-related.

---

## 17. Session continuation notes — 2026-06-05 after B78

This is the FRESHEST state. Read this first if you're resuming after this handoff.

### What shipped between B71 → B78
- **B75** — Theme left rail Colors pane redesigned with mock-aligned Color Palette + Pick eyedropper + Quick Colors + Brand Colors + Surface Colors layout. Inspect mode (Pick) reuses existing iframe handshake. CSS picker now end-to-end working.
- **B76** — Left rail 1:1 port from the user's VERCEL mock (`E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/VERCEL_mega_form-admin-redesign/components/theme-designer/theme-designer-body.tsx`). 16 presets with badges (Pro / New), 8 category chips with icons, search themes input + grid/list view toggle, live "N themes" count bar. Elements pane: 14 form-control types (Text Input / Text Area / Select / Checkbox / Radio / Toggle / Button / Date Picker / File Upload / Rating / Label / Heading / Divider / Card). Colors pane: 5 expandable categories (Brand 5 / Surface 5 / Text 4 / Semantic 4 / Form States 5) = 23 role colors. Panel width tightens to 288px in Design mode (matches Tailwind `w-72`).
- **B77** — Right rail 1:1 port from the same mock. 4 tabs (Global / Inputs / Buttons / Layout). Global: Typography (Heading/Body font + 3 sliders) + Border Radius (4 shape preset cards + custom slider) + Shadows (6 preset cards + 4 quad inputs X/Y/Blur/Spread) + Transitions (toggle + duration + easing). Inputs: Input Dimensions + Label Styles + Helper Text + Borders & Focus + Placeholder. Buttons: Button Dimensions + Typography + 5 Variants + Icons + Loading State. Layout: Spacing (with link toggle) + Form Container (max-width + alignment buttons + border/shadow) + Grid Settings + Header & Footer + Responsive Breakpoints info card.
- **B78** — Live propagation fixes for both bugs surfaced by user QA (see TRAP 12 + TRAP 13 above). Left rail preset clicks now propagate to iframe even for forms with bundled customHtml + 15 KB customCss (e.g. Halloween form 1269). Brand color row clicks visibly paint when their key is in the primary chain.

### Verification commands (browser-confirmed on B78)

**On form 1273 (STANDARD, 2 fields, no customHtml):**
- Click Forest preset → `getComputedStyle(iframe.documentElement).getPropertyValue('--mf-primary') === '#22c55e'` ✓ + Submit button renders green
- Click quick-color red → `--mf-primary === '#ef4444'` ✓
- Click Pick → `body.classList.contains('mf-theme-inspect-mode')` ✓

**On form 1269 (CUSTOM_HTML, 9 fields, useCustomHtml=true, customCssLen=15567):**
- Click Forest preset → `--mf-primary === '#22c55e'` AND `getComputedStyle(iframe.querySelector('.mfp-submit')).backgroundColor === 'rgb(34, 197, 94)'` ✓ — Halloween form re-skins to green
- Click quick-color red → Submit button becomes red ✓ (B71 element-level overrides + B78 cascade combo wins against hardcoded `.mfp-halloween` values)
- Pumpkin emoji + Halloween customHtml preserved during recoloring ✓

Probe script: `/tmp/mf-qa/qa_b78_live.cjs` — covers both form types in one run.

### What's still pending (B79+)

| ID | Goal | Effort |
|---|---|---|
| **B72** | Publish vs Save split + Logic/Workflow header chips (originally Phase 6 of migration spec) | ~2h |
| **B73** | Canvas section cards + iOS Required toggle (Phase 5) | ~5h |
| **B79** | Port the mock's 16 preset definitions into adapter PRESETS array so `setPreset(id)` always finds a match (PERMANENT TRAP 12 fix) | ~1h |
| **B80** | Walk `Assets/css/megaform.css` + adopt missing role vars (`--mf-accent`, `--mf-text-secondary`, semantic colors, form-state colors) so all 23 brand-color rows paint visibly (PERMANENT TRAP 13 fix) | ~3h |
| **B81** | Wire grid-list view toggle in Presets pane (currently sets class but no CSS for `.is-list`) | ~1h |
| **B82** | Wire Pro/New badge gating — clicking a Pro tile should open the upsell modal | ~2h |
| **B83** | Wire Edit-Quick-Colors popover (currently no-op + console log) | ~2h |
| **B84** | Wire Configure-breakpoints popover in Layout tab (placeholder button) | ~2h |
| **B85** | Wire `mf:theme-element-picked` from left-rail Elements tab → scroll right rail to matching section + highlight | ~2h |
| **B86** | Adopt mock's Apply Theme button styling in right-rail header (purple gradient + flat shadow) | ~1h |

### Active TODO list state at session end
```
✅ B78-1: Probe form 1273 + 1269 — identify propagation bugs
✅ B78-2: FIX preset click — data-preset-primary + explicit setVar fallback
✅ B78-3: FIX brand-color rows — primary-variant cascade
✅ B78-4: Re-probe confirms live updates on both standard + customHtml forms
```

### Files most recently touched
- `MegaForm.UI/src/builder/theme-left-rail.ts` — left rail panes (B75/B76/B78); both `wirePresetsPane` + `wireColorsPane` carry the B78 cascade fallbacks
- `MegaForm.UI/src/builder/theme-tab-adapter.ts` — right rail 4 panels (B77); helpers `fontSelectHtml` / `shapeCardsHtml` / `shadowPresetsHtml` / `shadowQuadHtml` added
- `MegaForm.UI/src/styles/megaform-builder-shell.css` — left rail mock styles (B76) + right rail primitives (B77) = ~600 added CSS lines under `.mf-tlr-*` and `.mf-tr-*` namespaces
- `MegaForm.DNN/Views/FormView.ascx.cs:378` — cache stamp `?v=20260605-B78`

### Pre-flight checks before next session starts
1. `SELECT name, state_desc FROM sys.databases WHERE name='DNN10322_MegaTest'` should return `ONLINE`. If `RECOVERY_PENDING`: `ALTER DATABASE [DNN10322_MegaTest] SET ONLINE WITH ROLLBACK IMMEDIATE`.
2. App pool `DNN10322_MegaTest` should be `Started`. If `Stopping`/`Stopped`: force-kill `w3wp.exe` and `Start-WebAppPool` (see §4 recovery procedure).
3. Form 1273 = canonical "simple form" QA target. Form 1269 = canonical "Halloween customHtml + 15 KB customCss" QA target. Drive BOTH when verifying anything theme-related — they exercise different propagation paths (var-only vs element-override).
4. Mock source of truth: `E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/VERCEL_mega_form-admin-redesign/` running on `localhost:3000/builder?mode=design`. Read `HANDOFF-BUILDER.md` in that repo if you need the original architectural rationale.

### Key behavioural contract (don't accidentally break)
- **Build/Design pill must preserve center canvas DOM byte-for-byte** when toggling modes (B67 user constraint). Verify via `dz.innerHTML.length` delta = 0 across mode switches.
- **Preset clicks must cascade colors via `data-preset-c1..c4` AND `setPreset(id)` BOTH**. Dropping the cascade re-introduces TRAP 12.
- **Brand color rows with `primary` / `primary-hover` / `primary-light` keys must cascade to `--mf-primary` chain.** Dropping this re-introduces TRAP 13.
- **`buildElementLevelOverrides()` must remain ordered AFTER `customCss` in `buildIframeOverridesCss()`** so element rules win over bundled hardcoded values (B71).

---

## Hand-off complete

If you find this document drift from reality, please update it in the same PR that introduces the drift. The doc is meant to age WITH the codebase, not lag behind it.

For questions about why a specific design decision was made, search the FormView.ascx.cs cache-stamp release notes — they carry the historical context the way commit messages would in a regular git workflow.

— Handoff authored 2026-06-04 after B69 ship.
— Updated 2026-06-04 after B71 ship (Section 16 added).
— Updated 2026-06-05 after B78 ship (Section 17 added, TRAPs 12 + 13 added).
— Paused 2026-06-06 mid-B79 (Section 18 added — diagnosis complete, verification pending).
— Resumed + COMPLETED 2026-06-06 as B79c (Section 19 added — runtime success on all 3 schema types).

---

## 19. B79c success report — 2026-06-06 (runtime FIXED, iframe cache-bound)

**Status: RUNTIME FIXED + 3 schema types verified. Builder iframe carries the new srcdoc V stamp on disk but Playwright cache still holds the older bundle — real users with fresh sessions get the fix automatically.**

### Resume actions taken (per §18 checklist)
1. Bumped cache stamp `B79` → `B79c` ([FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378)) with full release note
2. Rebuilt DLL + renderer + CSS + redeployed all
3. Restarted DNN app pool after DLL hot-swap (DB was in RECOVERY_PENDING — recovered with `ALTER DATABASE SET ONLINE WITH ROLLBACK IMMEDIATE`)
4. Bumped hardcoded iframe-srcdoc renderer V stamp [canvas.ts:532](../MegaForm.UI/src/builder/canvas.ts#L532) from `v=20260603-B57` → `v=20260606-B79c` (this was a separate pinned stamp inside `buildThemePreviewSrcdoc`, NOT updated by the global V constant). Rebuilt builder bundle + redeployed.
5. Real-browser DOM probe via Playwright on three forms.

### Verification table (real-browser DOM probe on runtime view `/Home/formid/N`)

| Form | Schema | Before B79 | After B79c | Pass |
|---|---|---|---|---|
| 1272 | customHtml + sunset theme + 7.64 KB customCss | `formRadius:0, formShadow:none, formBorder:none` | `formRadius:8px, formShadow:0 1px 3px rgba(15,23,42,.08), formBorder:solid, submit:6px` | ✓ |
| 1269 | Halloween customHtml + 15 KB customCss + warm-sunset theme | killer rule wiped everything | `formRadius:8px, formShadow:soft, formBorder:solid, submit:8px` | ✓ |
| 1273 | plain schema (no theme, no customHtml) | killer rule still applied via `[data-mf-has-custom-html]` fallback | `formRadius:8px, formShadow:soft, formBorder:solid, submit:8px` | ✓ |

All three forms show `injectedTagPresent: true` (4117 byte `<style id="mf-display-style-rules">` injected by the module-level IIFE) + the wrapper's display-style classes (`mf-style-radius-rounded mf-style-input-rounded mf-style-shadow-soft mf-style-border-hairline`) now drive visible form rendering.

### What worked (final ship)
- **Module-level IIFE `bootDisplayStyle` at end of [renderer/index.ts](../MegaForm.UI/src/renderer/index.ts) runs on bundle parse.** Doesn't depend on `init()` being called (which it isn't, on server-rendered ASCX pages).
- **Specificity-bust via `[class*="mf-form-wrapper"]` prefix** (always-true attribute matcher) bumps every generated rule to 0,0,4,1 + `!important` — ties the killer rule at megaform.css:543 and wins by source-order (injected later).
- **DNN cdv cache bypassed via stamp re-bump to `B79c`**. Different from `B79` → different URL → browser fetches new content. This was the missing step in §18 — the original `B79` stamp matched what the cdv had already served once, so the browser kept reusing the cached bundle.

### Iframe caveat (cache-bound, not a code bug)
The hardcoded iframe-srcdoc renderer URL in [canvas.ts:532](../MegaForm.UI/src/builder/canvas.ts#L532) is now `v=20260606-B79c` ON DISK (confirmed by `grep -o "v=20260606-B79c\|v=20260603-B57" deployed-builder.js` → 1 / 0 hit). But the Playwright browser session in this verification run held a CACHED OLDER builder.js bundle that still emits the `B57` srcdoc URL. The fetched-with-`cache:'no-store'` builder URL confirms `bundleHasB79c: true, bundleHasB57: false`. This is a Playwright-instance artefact, NOT a production issue. Real users with fresh browser sessions will fetch the new builder bundle on first visit and the iframe will then load the new renderer with the IIFE.

If a next session needs to verify iframe inside Playwright: launch with `--disable-cache` or invalidate the local browser profile. Or simply increment the V stamp once more — the additional change forces a fresh fetch.

### Files modified across B79 + B79c (final state)
- [Assets/css/megaform.css:134-188](../Assets/css/megaform.css#L134) — 16 fallback rules + submit cascade (belt-and-braces; runtime IIFE is the primary path)
- [MegaForm.UI/src/renderer/index.ts:180-237 + module-bottom IIFE](../MegaForm.UI/src/renderer/index.ts#L180) — `installDisplayStyleSheet()` with specificity-bust `W = '.mf-form-wrapper[class*="mf-form-wrapper"]'` prefix + `bootDisplayStyle` IIFE that runs on bundle parse
- [MegaForm.UI/src/builder/theme-tab-adapter.ts:1768-1830](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L1768) — shape-card click cascades all 3 radius vars + writes wrapper class + persists `settings.displayStyle.{radius,inputRadius}` to schema
- [MegaForm.UI/src/builder/canvas.ts:532](../MegaForm.UI/src/builder/canvas.ts#L532) — iframe-srcdoc renderer URL bumped `v=20260603-B57` → `v=20260606-B79c` so iframe loads renderer with IIFE
- [MegaForm.DNN/Views/FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378) — `?v=20260606-B79c` with release note covering Attempts 1-4 + specificity fix

### Cache stamp at completion
`?v=20260606-B79c` — RUNTIME VERIFIED on all 3 schema types. Builder iframe verification pending fresh browser session.

### What B79 + B79c collectively address
- ✅ TRAP 14 (display-style classes had no runtime CSS rules)
- ✅ TRAP 15 (killer rule with specificity 0,0,4,1 wiped lower-specificity overrides)
- ⏳ B80 (still pending — walk `megaform.css` and adopt 23 new role vars from B76 so all brand-color rows paint visibly; orthogonal to B79c work)

### Permanent path forward (B81+)
The killer rule at [megaform.css:543-555](../Assets/css/megaform.css#L543) (`.mf-form-wrapper[class*="mf-theme-"]:not(.mf-theme-default) .mf-form { border-radius: 0 !important; ... }`) was originally added to let theme-CSS files paint without competing with default `.mf-form` styling. It now creates a downstream cost: every new CSS feature for the form card needs a specificity-bust workaround. Permanent fix is to delete the killer rule and migrate the theme CSS files to consume the `--mf-form-*` vars directly so the cascade resolves naturally. Estimated ~1-2 hours of CSS surgery + visual QA across the 12 preset themes. Tracked as B81-cleanup.

---

## 18. Session pause notes — 2026-06-06 mid-B79 (display-style rules not painting on runtime)

**Status: PAUSED MID-FIX.** Diagnosis complete + fix attempted but not yet browser-verified. Next session picks up here.

### What the user reported
On `http://dnn10322_megatest.ai/Home/formid/1272` (form 1272 = customHtml form, 8 fields, 1.45 KB customHtml + 7.64 KB customCss, themeId=sunset), the right-rail Border Radius / Shadows / Custom-CSS sliders produce **NO visible change** on the runtime view. Same complaint applies to the builder iframe preview when the form has bundled customHtml + customCss. User asked to survey all form schema types.

### Diagnosis (browser-confirmed)
Form 1272 wrapper carries `mf-style-radius-rounded mf-style-input-rounded mf-style-shadow-soft mf-style-border-hairline` — these classes are written by [properties-patch.ts:186-196](../MegaForm.UI/src/builder/properties-patch.ts#L186) (B65w Display Style). But the matching CSS rules **only live inside the builder iframe srcdoc** at [canvas.ts:498-510](../MegaForm.UI/src/builder/canvas.ts#L498) — NOT in any file the production runtime loads.

Runtime probe on form 1272 (B78 deployed): `form.borderRadius=0px, form.boxShadow=none, form.borderStyle=none, input.borderRadius=999px, submit.borderRadius=4px`. The wrapper classes carry no visual weight.

### TRAP 14 (new) — Display-style classes have no runtime CSS rules ⚠️ B79
**Symptom:** User picks "Rounded" form-card style in builder. Saved. Live form `/Home/formid/N` renders as a sharp-cornered card with no shadow. Same setting works inside the builder iframe preview because canvas.ts injects the rules inline.

**Cause:** The display-style class catalogue (`.mf-style-radius-{square,rounded,pill}`, `.mf-style-input-*`, `.mf-style-shadow-{none,soft,medium,large}`, `.mf-style-border-{none,hairline,prominent}`) was authored in canvas.ts iframe srcdoc only. The runtime CSS (`Assets/css/megaform.css`) has zero rules for these classes — they're just decorative markers on the wrapper.

**Compounding issue (TRAP 15):** Even when matching rules are added with `!important`, an EXISTING higher-specificity rule wipes them. [megaform.css:543-555](../Assets/css/megaform.css#L543) defines:
```css
.mf-form-wrapper[class*="mf-theme-"]:not(.mf-theme-default) .mf-form,
.mf-form-wrapper[data-mf-has-custom-html] .mf-form {
  background: transparent !important;
  box-shadow: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 0 !important;
  ...
}
```
Specificity `0,0,4,1` + `!important`. Any plain rule like `.mf-form-wrapper.mf-style-radius-rounded .mf-form { border-radius: 8px !important }` has specificity `0,0,3,0` + `!important` → loses to the `[class*="mf-theme-"]` rule by 1 specificity point.

### Three attempted fixes (this session)

**Attempt 1 (B79 part A) — Append rules to `Assets/css/megaform.css`** ([line 134-188](../Assets/css/megaform.css#L134)):
- Added 16 rules covering all 13 display-style classes + submit-button radius cascade
- **Result:** File deployed correctly (`curl` confirms 2 matches for `mf-style-radius-rounded`). Browser still serves OLD CSS because DNN's CRM appends `?cdv=142` and `Cache-Control: public,max-age=31536000`. Even `location.reload(true)` keeps the cached version. The new rules NEVER reach the browser without an explicit cdv bump.

**Attempt 2 (B79 part B) — Inject `<style id="mf-display-style-rules">` from `MegaFormRenderer.init()`** ([renderer/index.ts:180-237](../MegaForm.UI/src/renderer/index.ts#L180)):
- Added `installDisplayStyleSheet()` called at top of `init()`
- **Result:** `init()` is NEVER called on `/Home/formid/N`. The runtime form HTML is generated server-side by `FormView.ascx.cs`'s RenderControl. The renderer JS is loaded for validation handlers only — its `init` is invoked solely from JS-driven mount paths (builder iframe, dashboard embeds, AJAX rendering).

**Attempt 3 (B79 part C) — Module-level IIFE side-effect** ([renderer/index.ts:end](../MegaForm.UI/src/renderer/index.ts#L1850)):
- Added `bootDisplayStyle` IIFE at the END of the module that runs on bundle parse
- Idempotent guard via `document.getElementById('mf-display-style-rules')`
- Bundles `installDisplayStyleSheet` as a module-scope function (renamed by minifier but logic intact)
- **Result on last probe:** `injectedTagPresent: false` STILL. `fetch(rendererUrl, {cache:'no-store'})` confirms the deployed file has `mf-display-style-rules` string. Possible causes (next session investigates):
  1. The deployed bundle is correct on disk but browser still loads a cached older one — `?v=...?cdv=142` double-query may collapse to a single cdv-keyed cache entry
  2. The minifier mangled the IIFE wrapper — but the string literal IS in the file, so logic should reach it
  3. Browser was probed BEFORE the new bundle finished loading

**Attempt 4 (B79 part D) — Specificity bust via `[class*="mf-form-wrapper"]` attribute matcher** ([renderer/index.ts:185-205](../MegaForm.UI/src/renderer/index.ts#L185)):
- Updated all generated rules to use `W = '.mf-form-wrapper[class*="mf-form-wrapper"]'` prefix (always-true matcher) which adds an attribute selector to bump specificity from `0,0,3,0` to `0,0,4,1` — equal to the killer rule. Source-order wins because we append later.
- **Result: not yet browser-verified.** Bundle deployed but probe still showed `injectedTagPresent: false`. May be a browser-cache artefact (Playwright was reusing the same browser context across navigations).

### Files modified this session (not reverted)
- [Assets/css/megaform.css:134-188](../Assets/css/megaform.css#L134) — 16 fallback display-style rules + submit radius cascade
- [MegaForm.UI/src/renderer/index.ts:180-237](../MegaForm.UI/src/renderer/index.ts#L180) — `installDisplayStyleSheet()` function with specificity-bust selectors via `W` constant
- [MegaForm.UI/src/renderer/index.ts:end](../MegaForm.UI/src/renderer/index.ts#L1850) — `bootDisplayStyle` IIFE at module bottom
- [MegaForm.UI/src/builder/theme-tab-adapter.ts:1768-1830](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L1768) — shape-card click handler now cascades to all 3 radius vars (form/input/btn) + adds `.mf-style-radius-{X}` to wrapper in canvas + iframe + writes `settings.displayStyle.{radius,inputRadius}` to schema
- [MegaForm.DNN/Views/FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378) — cache stamp `?v=20260605-B79` with full release note for Attempts 1+2 (Attempts 3+4 release note not appended yet)

### What to do NEXT SESSION
1. **Close browser fully + reopen with `chromium.launch({args:['--disable-cache']})`** or use Playwright `context.clearCookies()` + `Cache-Control: no-cache` request interceptor to bypass DNN's aggressive cdv cache.
2. **Re-probe form 1272 at `http://dnn10322_megatest.ai/Home/formid/1272?bust=$RANDOM`** with the cache-busted context.
3. **Verify `injectedTagPresent: true`** after fresh navigation. If still false, investigate:
   - Does the bundle URL the browser fetches actually return new content? Use `fetch(url, {cache:'no-store'})` from console and grep response.
   - Is the IIFE running but `installDisplayStyleSheet()` early-exiting? Add a `console.log` inside the function and check DevTools console.
4. **If `injectedTag` IS present but rules still don't paint**, run this DevTools probe:
   ```js
   var f = document.querySelector('.mf-form');
   getMatchedCSSRules(f) // or use Chrome DevTools "Computed" pane
   ```
   to confirm the cascade. Specificity comparison with the `[class*="mf-theme-"]` killer rule must resolve in our favour.
5. **Bump DNN portal cdv as a permanent fix.** Login as host → Host menu → Portals → click DNN10322_MegaTest → "Increment Composite Cache" button. This regenerates the cdv version + invalidates the browser cache for all `megaform.css?cdv=N` URLs. After this, Attempt 1's runtime CSS file becomes reachable.
6. **Replicate the test on form 1269 (Halloween customHtml)** and a plain schema form (e.g. 1273) to ensure the fix works across ALL schema types per user's explicit ask.
7. **Update FormView.ascx.cs:378 release note** to bump cache stamp to `?v=20260606-B79` and append the Attempts 3+4 narrative (specificity-bust selector + module-level IIFE).
8. **Then write the `<style data-mf-injected="B79">` proof to the handoff doc + take side-by-side screenshots** of form 1272 BEFORE/AFTER for the user.

### Open question for the user
The cleanest permanent fix is to **delete the `[class*="mf-theme-"]` killer rule** in [megaform.css:543](../Assets/css/megaform.css#L543) — it was originally added to let theme-CSS files paint without competing with default `.mf-form` styling. But now it actively prevents user customization. We should ask:
> Should the killer rule be replaced with a per-property reset that ONLY zeroes the props the user hasn't customized? Or should it be made conditional on `:not(.mf-style-radius-*)` etc.?

Either path takes ~30 min of CSS surgery + visual QA. The Attempt-4 specificity-bust is a tactical workaround — fine for shipping but accumulates technical debt.

### Cache stamp at pause
`?v=20260605-B79` at [FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378). Will bump to `?v=20260606-B79` on first commit of next session.

---

## 20. Session continuation notes — 2026-06-06 after B79c → B82d ship ⭐ LATEST

**Status: COMPLETE.** Cache stamp `?v=20260606-B82d`. Runtime + builder both render display-style chrome correctly across all 3 schema types (1272 customHtml+sunset, 1269 Halloween customHtml, 1273 plain). Submit button now consumes `--mf-primary` on runtime so preset color changes paint after Save.

### What shipped this session

**B79c** — Runtime display-style CSS rules + module-level IIFE injection. Cache stamp re-bump from B79 to B79c forced DNN cdv cache to fetch fresh content. Iframe-srcdoc renderer URL at [canvas.ts:532](../MegaForm.UI/src/builder/canvas.ts#L532) was a separate hardcoded V stamp and had to be bumped independently.

**B80** — Role-var consumption ([megaform.css:2532-end](../Assets/css/megaform.css#L2532), ~85 new lines). Added runtime rules consuming the 9 B76 role vars that previously had no consumers: `--mf-primary-light` (focus ring shadow), `--mf-secondary` (secondary button bg), `--mf-accent` (focus-visible outline), `--mf-color-text-inverse` (submit text), `--mf-color-success/warning/error/info` (banners, validation borders, field-error text), `--mf-input-hover-border`. Each rule uses `var(--mf-X, fallback)` so existing forms without the var paint unchanged. After B80, clicks on Brand Colors / Surface Colors / Text Colors / Semantic Colors / Form States rows in the left rail produce visible runtime changes.

**B81** — Killer-rule conditional guards ([megaform.css:602-620](../Assets/css/megaform.css#L602)). Added `:not([class*="mf-style-radius"]):not([class*="mf-style-shadow"]):not([class*="mf-style-border"])` qualifiers to the DoubleCardFix B14 strip-rule selectors so the rule yields to the B79c display-style rules when user has explicit choices. Initially applied to BOTH `[class*="mf-theme-"]` AND `[data-mf-has-custom-html]` selectors.

**B82 + B82d** — customHtml double-card fix + submit color binding. User reported on form 1272 that the live runtime had a HEAVY outer card wrapping the inner Halloween-styled card (double card), AND the submit button color differed builder (orange) vs live (dark brown).
- **Bug A (double card):** B81 guards over-corrected for `[data-mf-has-custom-html]` selectors. Reverted the guards there (kept guards on `[class*="mf-theme-"]`). Strip-rule now ALWAYS fires for customHtml forms so the outer `.mf-form` chrome stays transparent.
- **Bug A continued:** B79c IIFE rules at the renderer used base selector `W = '.mf-form-wrapper[class*="mf-form-wrapper"]'` which doesn't discriminate customHtml vs standard. B82-D split into `Wstd = W:not([data-mf-has-custom-html])` (rules on `.mf-form` for standard forms) + `Wch = W[data-mf-has-custom-html]` (rules on `.mfp / .mfp-card / .fr-card` for customHtml forms). Form 1272's actual customHtml shell is `.mfp.fr-inv` (form-receiver invitation template), NOT `.mfp-card`. Form 1269 Halloween uses `.mfp.mfp-halloween`. Selectors cover all three variants.
- **Bug B (submit color):** Builder iframe applied B71 element-level overrides binding submit bg to `var(--mf-primary)`; runtime had no equivalent. B82-C extended the IIFE injected `<style id="mf-display-style-rules">` to add `background: var(--mf-primary, inherit); color: var(--mf-color-text-inverse, #ffffff)` on submit selectors including `.fr-btn-submit` (form-receiver custom HTML class), `.mfp-submit`, `.mf-submit`, `.mf-btn-primary`, `button[type="submit"]`, `.mf-form-actions button`. When user picks a preset and SAVES, runtime now picks up colors too.

### Browser-confirmed verification

Real-browser DOM probe via Playwright after B82d:

| Form | Schema | Outer `.mf-form` chrome | Inner shell chrome | Submit color |
|---|---|---|---|---|
| **1272** | customHtml + sunset + 7.64 KB customCss | stripped (radius 0 / shadow none / border none) ✓ | `.mfp.fr-inv`: 8px / soft / solid ✓ | `rgb(74,144,217)` = #4a90d9 (--mf-primary) ✓ |
| **1269** | Halloween customHtml + 15 KB customCss | stripped ✓ | `.mfp.mfp-halloween`: 8px / soft / solid ✓ | `rgb(255,107,53)` = #ff6b35 (warm-sunset preset) ✓ |
| **1273** | plain schema | 8px / soft / solid ✓ (no double card to fix) | n/a (no customHtml) | `rgb(79,70,229)` = #4f46e5 (default indigo) ✓ |

### TRAP 16 (new) — Iframe srcdoc renderer V stamp is hardcoded ⚠️ B82d-ish
**Symptom:** After deploying a new renderer build, the runtime form `/Home/formid/N` picks up the new bundle via the global `V` stamp, but the builder iframe preview still loads an OLDER renderer.

**Cause:** [canvas.ts:532](../MegaForm.UI/src/builder/canvas.ts#L532) emits the iframe srcdoc with a HARDCODED V stamp for the renderer script tag (originally `v=20260603-B57`, then `B79c`, then `B81`, then `B82d`). The global V constant in FormView.ascx.cs does NOT reach into this srcdoc string. When the renderer ships a fix that needs to land in the iframe preview too, you MUST bump THIS STRING IN canvas.ts SEPARATELY.

**Fix used:** Each B79c → B82d release stamp also updates canvas.ts:532 in lockstep. Long-term, this should be replaced with a string-interpolation that reads from a shared constant.

### Architectural cleanup pending
- **B83-cleanup (future)** — Replace the [class*="mf-form-wrapper"] specificity-bust prefix with a cleaner approach now that B81 killer-rule guards exist. The bust was a tactical workaround that's no longer strictly needed for standard forms. For customHtml forms B82-D's Wch path handles cleanly. Estimated 1h CSS surgery + visual QA across 12 presets + 3 schema types.
- **B84-cleanup** — Replace hardcoded `v=20260606-B82d` at canvas.ts:532 with a shared constant pulled from the build pipeline (similar to how megaform-builder.js gets V). This would prevent TRAP 16 recurring.
- **B85-runtime-preset-persistence** — When user picks a preset in builder + saves, persist theme overrides (--mf-primary, --mf-form-radius, etc.) to `schema.themeCssOverrides`. The runtime renderer should then emit those vars into `<style>` so the saved theme paints automatically without re-loading. This closes the builder-vs-live gap for ALL theme controls, not just the slider cascade B71 already handles.

### Files modified across B79c → B82d (final state)
- [Assets/css/megaform.css:134-188](../Assets/css/megaform.css#L134) — 16 fallback display-style rules + submit cascade
- [Assets/css/megaform.css:602-620](../Assets/css/megaform.css#L602) — B81 killer-rule guards on `[class*="mf-theme-"]` selectors (B82-A reverted guards on `[data-mf-has-custom-html]` selectors)
- [Assets/css/megaform.css:2532-end](../Assets/css/megaform.css#L2532) — B80 role-var consumption (~85 lines)
- [renderer/index.ts:189-264](../MegaForm.UI/src/renderer/index.ts#L189) — `installDisplayStyleSheet()` with Wstd/Wch split + .mfp/.mfp-card/.fr-card variants + submit bg/color var bindings
- [renderer/index.ts:bottom IIFE](../MegaForm.UI/src/renderer/index.ts#L1886) — `bootDisplayStyle` module-level IIFE
- [theme-tab-adapter.ts:1768-1830](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L1768) — shape-card cascade + schema persistence
- [canvas.ts:532](../MegaForm.UI/src/builder/canvas.ts#L532) — iframe srcdoc renderer V stamp = `v=20260606-B82d`
- [FormView.ascx.cs:378](../MegaForm.DNN/Views/FormView.ascx.cs#L378) — cache stamp `?v=20260606-B82d` with combined release note

### Cache stamp at session end
`?v=20260606-B82d` — runtime VERIFIED + builder iframe VERIFIED on all 3 schema types.

### Next session checklist (when resuming)
1. Read this §20 first.
2. Open `MEMORY.md` to confirm the latest project pointers.
3. If user reports a new bug on form display chrome, check first whether wrapper has `data-mf-has-custom-html` — that decides whether rules target `.mf-form` (Wstd) or `.mfp/.mfp-card/.fr-card` (Wch).
4. Pending future work (low priority): B83-cleanup, B84-cleanup, B85-runtime-preset-persistence (see "Architectural cleanup pending" above).
5. Pending UX migration work (from §17): B72 (Publish/Save split), B73 (canvas section cards + iOS Required toggle), B82-B86 polish (Pro upsell modal, Edit Quick Colors popover, Configure breakpoints popover, etc.). All independent of B79c/B80/B81/B82d work.

---

## 21. Session continuation notes — 2026-06-06 after B83 → B83h ship ⭐ LATEST

**Status: COMPLETE.** Cache stamp `?v=20260606-B83h`. Full builder chrome (left palette + center canvas + right pane + 4 edge triggers + tooltips + dividers + scrollbars) pixel-perfect ported from VERCEL mock at `localhost:3000/builder`. Mock source: `E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/VERCEL_mega_form-admin-redesign/app/builder/page.tsx`.

### What shipped this session (9 micro-releases)

| # | Stamp | Scope |
|---|---|---|
| 1 | **B83** | Left palette CSS pipe: pill tabs (Basic/Layout/Widgets), vertical card grid, `--mf-tile-bg`/`--mf-tile-fg` CSS vars from `plugin.color`, tinted icon-chip + colored icon |
| 2 | **B83a** | Tabs radius 8→10px exact match + light panel-header bg |
| 3 | **B83b** | Search box + close × REMOVED from palette header. Left collapse trigger rebuilt as 16×64 white card with inline Lucide PanelLeftClose SVG. Widgets tab `populatePluginPalette()` refactored — emits CSS vars + curated `widgetColorMap` (Payment emerald, DataGrid violet, Webhook cyan, etc.) + Pro/Advanced/Custom corner badges |
| 4 | **B83c** | Open triggers (when own pane collapsed) replaced from 28×28 floating pills at left:8/right:8 → 16×64 flush at viewport edges. Right resizer slimmed from 14px gradient bar with 4×76 pill → 8px transparent hit zone with 1px hairline. THEME tab hidden from right-tabs strip (Build/Design pill handles theme mode). Right-tabs strip restyled mock-aligned |
| 5 | **B83d** | Edge open triggers source fix — dom.ts pre-rendered them with old `<div class="mf-edge-mini">` markup; setupLeftPanel/setupRightPanel were skipping creation when element already exists. Fix: dom.ts now pre-renders `<a class="mf-edge-open">` with inline Lucide PanelLeftOpen/PanelRightOpen SVG; B73 28×28 floating pill CSS block in megaform-builder-shell.css replaced with 16×64 flush spec |
| 6 | **B83e** | Right collapse trigger `#mf-right-collapse-btn` rebuilt as 16×64 white card with Lucide PanelRightClose SVG (mirror of left). Removed legacy 3×24 gray pill-bar `::after` chrome |
| 7 | **B83f** | 5 mock divider hairlines (1px slate-200/zinc-200): (1) below palette tabs via `::after` extending -12px on each side; (2) below `.mf-canvas-header` with 24px padding + margin; (3) left aside `border-right`; (4) right aside `border-left`; (5) right-tabs strip `border-bottom` |
| 8 | **B83g** | Tooltip system switch (TRAP 18). Custom `.mf-edge-tooltip::after` rule LOST specificity war with pre-existing `[data-tip]:hover::after` in megaform-builder-shell.css:44 — right tooltip got clipped BELOW trigger. Fix: removed all custom tooltip CSS, switched to canonical `data-tip="..."` + `data-tip-pos="left|right"` system. All 4 edge triggers now show "Hide/Show Toolbox/Properties" pills flanking the trigger |
| 9 | **B83h** | Hide native Windows scrollbar in `.mf-panel-body`, `.mf-settings-scroll`, `.mf-right-tab-content` — was rendering as gray vertical track right next to pane vertical dividers, making them look doubled/thick. Default invisible, on `:hover` reveals thin 6px slate-300 thumb. Mock's Radix ScrollArea look |

### Files modified across the B83 cascade

| File | Lines | What |
|---|---|---|
| [MegaForm.UI/src/builder/dom.ts](../MegaForm.UI/src/builder/dom.ts) | 643-693, 715-728, 1675-1693 | New tabs HTML (no search box + no close ×), new collapse triggers with inline Lucide SVG + data-tip-pos, edge-open triggers pre-rendered |
| [MegaForm.UI/src/builder/canvas.ts](../MegaForm.UI/src/builder/canvas.ts) | 1106-1196 | `populatePluginPalette()` emits `--mf-tile-bg/--mf-tile-fg` + Pro/Advanced/Custom badges per widget type |
| [MegaForm.UI/src/builder/field-plugins/_registry.ts](../MegaForm.UI/src/builder/field-plugins/_registry.ts) | 111-132 | `renderPaletteItem()` Basic/Layout pipeline emits CSS vars instead of inline `style="background:{hex}"` on chip |
| [MegaForm.UI/src/builder/panels.ts](../MegaForm.UI/src/builder/panels.ts) | 610-700 | Removed duplicate edge-mini creation (dom.ts handles it now); kept only collapse/open event wiring |
| [MegaForm.UI/src/styles/megaform-builder-ts.css](../MegaForm.UI/src/styles/megaform-builder-ts.css) | 130-340, 387-395, 955, 1037, 1160-1190, 1608-1700 | Full palette block rewrite, divider hairlines, scrollbar hide, right resizer slim, right-tabs strip restyle, THEME tab hidden |
| [MegaForm.UI/src/styles/megaform-builder-shell.css](../MegaForm.UI/src/styles/megaform-builder-shell.css) | 2068-2112 | B73 28×28 floating pill → B83c 16×64 flush spec |
| [MegaForm.DNN/Views/FormView.ascx.cs](../MegaForm.DNN/Views/FormView.ascx.cs) | 378 | Cache stamp `?v=20260606-B83h` |

### New TRAPs discovered

#### TRAP 17 — Multiple DOM-creation paths for same element
**Symptom:** Updated `panels.ts setupLeftPanel` to create open-btn with new class+SVG. Probe showed old class still applied. Wasted ~20min.

**Cause:** `dom.ts createBuilderLayout` pre-renders edge-mini buttons BEFORE `panels.ts setupLeftPanel/setupRightPanel` runs. Setup functions check `if (!openBtn && center)` and SKIP creation when element already exists. So updating only panels.ts had no effect on the live element.

**Rule:** When changing an element's markup, search the codebase for ALL places that create or reference it. Don't assume one creation path.

#### TRAP 18 — Tooltip CSS specificity wars
**Symptom:** B83e custom `.mf-edge-tooltip::after { top: 50% }` rule didn't position right tooltip correctly — it ended up BELOW the trigger instead of LEFT-OF it.

**Cause:** Pre-existing `[data-tip]:hover::after` rule in [megaform-builder-shell.css:44](../MegaForm.UI/src/styles/megaform-builder-shell.css#L44) (the canonical B65q tooltip system) sets `top: calc(100% + 10px)`. Both rules had same specificity (0,0,1,1) but shell.css was defined LATER in the cascade → won by source order.

**Rule:** When adding hover tooltips, ALWAYS check `megaform-builder-shell.css [data-tip]:hover::after` first. Use the canonical system: `data-tip="..."` + optional `data-tip-pos="bottom|left|right"` instead of rolling your own.

### Browser-confirmed verification (B83h, form 1267)

All 14+ attributes pixel-match VERCEL mock. Logged in as `host/dnnhost`. Tested both EXPANDED and COLLAPSED states.

| Element | Spec | Verified |
|---|---|---|
| Left palette tabs | pill `bg-muted/50` 10px radius 36×full | exact ✓ |
| Tab active state | white card + shadow-sm | exact ✓ |
| Widget cards | white 14px radius, slate-200 border, hover lift | exact ✓ |
| Icon chips | 36×36 10px radius, --mf-tile-bg (10% tint) + --mf-tile-fg (full sat) | exact ✓ |
| Pro/Advanced/Custom badges | -6px -6px corners, gradient bg | exact ✓ |
| Left collapse trigger | 16×64 + PanelLeftClose SVG + slate-500 + shadow-sm + right-rounded | exact ✓ |
| Right collapse trigger | 16×64 + PanelRightClose SVG + left-rounded (mirror) | exact ✓ |
| Left open trigger (collapsed) | 16×64 flush at left:0 | exact ✓ |
| Right open trigger (collapsed) | 16×64 flush at right:0 | exact ✓ |
| All 4 tooltips | dark slate-900 pill with arrow, flanking trigger | exact ✓ |
| Right resizer | 1px hairline (8px hit zone) | exact ✓ |
| 5 mock divider hairlines | 1px slate-200 | exact ✓ |
| Scrollbar gutter | 0 (invisible default) | exact ✓ |
| THEME tab visible | false | exact ✓ |

### Files needed to load for next session

If next session resumes B83 work:
- `MEMORY.md` — pointers updated
- `memory/project_b83_left_palette_mock_parity.md` — full B83 → B83h ship log
- `memory/project_megaform_cache_version.md` — current stamp B83h
- This handoff §21
- Mock source: `E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/VERCEL_mega_form-admin-redesign/app/builder/page.tsx` (1810 lines)
- Mock dev server: `cd "E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/VERCEL_mega_form-admin-redesign" && npm run dev` (port 3000). Last task ID running mock: `b72tpa26q`. May have been killed by reboot — restart if needed.

### Resume checklist for next session

1. **Read this §21 first** for the full B83 → B83h scope.
2. **Open MEMORY.md** to confirm latest pointers.
3. **Restart the mock** if not running: `cd "E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/VERCEL_mega_form-admin-redesign" && npm run dev`. Check `netstat -ano | findstr :3000` first.
4. **For any new builder chrome work** — open BOTH mock (localhost:3000/builder) AND prod (dnn10322_megatest.ai/Home/mfFormId/1267?mfFormId=1267#mf-builder) tabs side-by-side. Login prod as `host/dnnhost`. Production needs warming after deploy (curl Login URL once to wake app pool).
5. **DNN deploy pattern unchanged from §20.** After `npm run build:builder` + `dotnet build -c Release`:
   - Copy `Assets/js/bundles/megaform-builder.js` → `E:/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/js/bundles/`
   - Copy `Assets/css/megaform-builder-ts.css` (and `megaform-builder-shell.css` if changed) → same path
   - Copy `MegaForm.DNN/bin/Release/net472/MegaForm.DNN.dll` → `E:/DNN_SITES/DNN10322_MegaTest/Website/bin/`
   - PowerShell `(Get-Item "...\web.config").LastWriteTime = Get-Date` to recycle app pool
6. **Pending future work — visual:**
   - Left collapse trigger sometimes overlaps with the left-open trigger when collapsed (both at left:1, left:0 respectively). Cosmetic — barely visible because both are white-on-white. Could hide left-collapse via `.mf-panel-left.mf-collapsed .mf-left-collapse-trigger { display: none }`.
   - Mock has a small "1 Issue" red pill in bottom-left of left pane. Production doesn't have an analog. Could add status pill if useful.
   - Mock has an indigo gradient FAB "✨" button (bottom-left of canvas) that opens AI assistant. Production has the AI Form button elsewhere — could relocate to match.
7. **Pending future work — non-visual:**
   - B85-runtime-preset-persistence (from §20) — persist theme overrides to `schema.themeCssOverrides` so runtime renderer emits theme vars in `<style>` automatically.
   - B83-cleanup: drop the `[class*="mf-form-wrapper"]` specificity-bust prefix in renderer/index.ts now that B81 killer-rule guards exist. ~1h surgery + 12-preset visual QA.

### Build + deploy commands (one-liner)

```powershell
cd "e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"; npm run build:builder; cd ..\MegaForm.DNN; dotnet build -c Release -nologo -v minimal; $src = "e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"; $dst = "E:\DNN_SITES\DNN10322_MegaTest\Website"; Copy-Item -Force "$src\Assets\js\bundles\megaform-builder.js" "$dst\DesktopModules\MegaForm\Assets\js\bundles\megaform-builder.js"; Copy-Item -Force "$src\Assets\css\megaform-builder-ts.css" "$dst\DesktopModules\MegaForm\Assets\css\megaform-builder-ts.css"; Copy-Item -Force "$src\Assets\css\megaform-builder-shell.css" "$dst\DesktopModules\MegaForm\Assets\css\megaform-builder-shell.css"; Copy-Item -Force "$src\MegaForm.DNN\bin\Release\net472\MegaForm.DNN.dll" "$dst\bin\MegaForm.DNN.dll"; (Get-Item "$dst\web.config").LastWriteTime = Get-Date
```

### Cache stamp at session end
`?v=20260606-B83h` — runtime VERIFIED + builder VERIFIED on form 1267. All 9 micro-ships browser-confirmed pixel-match VERCEL mock.
