# MegaForm Umbraco 13-18 UI and Compatibility Session Handoff

Date: 2026-09-17

Repository: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`

Branch: `feature/typed-submission-storage-core`

Published package: `MegaForm.Umbraco 2.0.62`

This document is the primary starting point for the next AI session. It consolidates the product decisions, UI acceptance rules, compatibility architecture, implementation state, release evidence, known risks, and exact next actions from the full Umbraco 13-18 session.

## 1. Start here

1. Read this file before editing code.
2. Read `HANDOFF_20260916_UMBRACO_13_18_WORKSPACE_LAYOUT_2_0_62.md` for the detailed layout regression root cause and QA measurements.
3. Read `Docs/UMBRACO_COMPATIBILITY_TECHNICAL_POSITION_2026-09-16.md` for the long-term compatibility design.
4. Read `Docs/HANDOFF_UMBRACO_13_PLUS_FORMS_IMPORT_2026-09-15.md` before changing Umbraco Forms import.
5. Run `git status --short` before any edit. The worktree contains a very large amount of unrelated, unfinished work from several agents.
6. Never use `git reset --hard`, `git clean`, broad checkout commands, or any operation that discards uncommitted files.
7. Commit only the files intentionally changed for the current task.

Important release warning: the published 2.0.62 package was built and validated from this active workspace, which contains uncommitted work. Several AI, Gemini, Languages, Gallery, licensing, import, and host-integration sources are still modified or untracked. A clean checkout at the current HEAD is not proven to reproduce every byte or feature of the published package. Preserve the working tree and audit/commit coherent slices before the next release.

Do not publish another package as 2.0.62. Any runtime change requires a new version, normally 2.0.63 or later.

## 2. Non-negotiable product decisions

### 2.1 One customer package

- Keep one package ID: `MegaForm.Umbraco`.
- Do not create separate public packages for Umbraco 13, 14, 15, 16, 17, or 18.
- The package contains `lib/net8.0`, `lib/net9.0`, and `lib/net10.0`; NuGet selects the correct runtime asset.
- Bundle `MegaForm.Core.dll`, `MegaForm.Sdk.dll`, and `MegaForm.Integrations.CloudStorage.dll` inside every target-framework group.
- Do not require customers to install separate MegaForm Core or SDK packages.
- Keep one shared `MegaForm.UI` source for dashboard, builder, submissions, languages, settings, AI, and workflows.
- Version-specific code must remain a thin Umbraco host/compatibility layer.

Current mapping:

| Umbraco | Runtime asset | Compile baseline | Backoffice host |
| --- | --- | --- | --- |
| 13 | `lib/net8.0` | Umbraco 13.16.2 | AngularJS `package.manifest` adapter |
| 14 | `lib/net8.0` | Umbraco 13.16.2-compatible binary | Bellissima `umbraco-package.json` adapter |
| 15-16 | `lib/net9.0` | Umbraco 15.4.4 | Bellissima |
| 17-18 | `lib/net10.0` | Umbraco 17.6.2 | Bellissima plus published-content ABI adapter |

### 2.2 Purchase package and trial behavior

- Marketplace license type is `Purchase`.
- Every installation is trial by default, including localhost. Do not restore a localhost-is-licensed bypass.
- Trial limits currently shown by the UI are 10 forms and 25 submissions per form; AI is locked in trial.
- Production activation is done inside MegaForm by uploading a valid `license.lic` file.
- Store the uploaded license privately at `App_Data/MegaForm/license.lic`.
- Umbraco must not use the Oqtane Marketplace license flow.
- The trial control must stay collapsed as a small right-edge `TRIAL` tab. Expanding it may show limits, Purchase, and Activate license. It must not cover workspace commands.

### 2.3 Purchase URL is configuration, not code

- Do not hard-code purchase URLs in TypeScript, Razor, or controllers.
- The default configuration is embedded from `MegaForm.Umbraco/Configuration/megaform-settings.json`.
- At runtime it is copied to the site-owned `App_Data/MegaForm/megaform-settings.json`.
- `UmbracoPurchaseSettingsService` reads `activePackageType` and the corresponding `purchaseUrl`.
- `Purchase` opens that configured URL in a new tab.
- `Activate license` opens MegaForm Settings > License and never redirects to checkout.

### 2.4 Gallery and installed templates

- Installed templates are local authoring resources. They must remain editable and reusable, including in trial mode.
- Trial users may browse and preview the Online Gallery.
- Licensing may block downloading/installing a new online template, but must not block looking at it.
- Form-specific PNG/JPG/SVG artwork belongs in the GitHub Gallery asset archives and is downloaded on demand.
- Runtime artwork required by every installation stays in the NuGet package.
- The package must remain below 10 MB and must not contain source maps, duplicate i18n catalogs, or template-specific artwork.

## 3. Required UI contract

The target is one recognizable MegaForm product across Umbraco 13, 14, 15, 16, 17, and 18. The information architecture and density should feel native to Umbraco Forms, without copying proprietary source or implementation.

### 3.1 Shared workspace structure

Every version must expose the same user workflow:

- MegaForm section and left navigation.
- Dashboard.
- Forms tree and a working `Create form` command.
- Form workspace with title/identity.
- `Design`, `Entries`, `Analytics`, and `Settings` tabs.
- Builder command row.
- Toolbox, canvas, field/property editing, preview, save/publish commands.
- Workflow Summary attached below the form canvas.
- Submissions table and detail/activity views.
- Languages and Settings screens.

Host implementation may differ, but the product must not look or behave like a different application on Umbraco 13.

### 3.2 Umbraco 13 rules

- U13 uses the AngularJS-era section/dashboard shell and `package.manifest`.
- The shared builder runs in an iframe with `data-mf-host="umbraco-v13"`.
- Because U13 cannot mount the Bellissima native form workspace header, the builder owns its title/tabs row and command row.
- These two rows must be composed tightly and visually match the U14+ structure.
- `Create form` in the left navigation must open the five-step creation wizard directly.
- The dashboard and builder must stay inside the MegaForm section. They must not appear as an unrelated standalone page.
- No blank strip is allowed below the Umbraco top navigation, around the left navigation, above the builder commands, or between commands and canvas.

### 3.3 Umbraco 14+ rules

- U14+ uses Bellissima, `umbraco-package.json`, the section sidebar app, and `megaform-workspace-view.js`.
- The native workspace owns the form title and `Design`, `Entries`, `Analytics`, `Settings` tabs.
- The iframe builder must receive `host=umbraco-workspace` and hide its duplicate internal title/tabs.
- The builder still owns the command row and canvas.
- Opening a form from the dashboard must change the outer route to `/umbraco/section/megaform/view/open/builder/{id}`.
- Dashboard and new-form routes must not mount an empty native header slot. An empty slot creates a visible blank band.
- Never render a standalone builder inside the dashboard route.

### 3.4 Spacing and responsive rules

- There must be zero unexplained vertical gap between the last visible toolbar and the builder layout.
- The first form card should begin near the top of the canvas. The accepted automated measurement is approximately 24 px, not vertical centering.
- Build mode must keep `#mf-canvas-dropzone { justify-content: flex-start; }`.
- Do not restore vertical centering for short forms.
- Do not leave an empty rail or dead margin on the left of the MegaForm navigation.
- Top commands must remain readable and clickable at 1365x768. They may compact or wrap deliberately, but must not overlap or be squeezed into unreadable fragments.
- The canvas, toolbox, and side panels must have one clear scroll owner each; nested page-level scrollbars are a regression.
- Hard-refresh after installing a package because cached ESM modules can mimic an old regression.

### 3.5 Workflow Summary is mandatory

- Workflow is intentionally not a fifth top workspace tab.
- The entry point is the friendly Workflow Summary below the form, following the same interaction idea as Umbraco Forms.
- `#mf-inline-workflow-summary` must remain inside `#mf-canvas-dropzone`, after `.mf-form-wrapper`, in the canvas scroll flow.
- Do not move it outside the center scroller; long forms will make it unreachable or clip it.
- The summary must show the current flow and a working `Configure workflow` action.
- A blank band above the canvas is not reserved space for workflow controls. It is a layout defect.

### 3.6 Trial UI

- The old full-width orange trial panel that covered top commands is not acceptable.
- Current intended design is a small collapsed vertical `TRIAL` tab at the middle-right edge.
- The expanded panel closes on Escape and outside click.
- It must not obscure Preview, Save, Publish, AI Designer, or navigation controls.

### 3.7 Languages and Settings

- Languages must render inside the MegaForm workspace using the same shell and visual language as Settings.
- It must not show raw errors such as `Unexpected token '<'` caused by parsing an HTML login page as JSON.
- API calls must use the correct U13 cookie or Bellissima bearer-token bridge.
- Settings must include AI Provider configuration and a License pane.
- Google Gemini must appear as a provider with a configurable API key, base URL, and model.
- Current source default is `https://generativelanguage.googleapis.com/v1beta/openai` with a Gemini Flash model.
- Do not hard-code a customer API key. No secret supplied in chat may be written into source, docs, commits, or package assets.

### 3.8 AI form creation and iterative editing

- The AI result must render as a real form canvas, not a bullet list of field names.
- Dashboard AI preview uses `MegaFormRenderer.init` in read-only preview mode.
- Builder AI Designer uses the existing center canvas as its live preview.
- The AI panel remains open after applying a result so the user can continue with follow-up requests such as `add company`, `make email required`, or `use two columns`.
- Follow-up requests must include the current schema, so they edit the existing form instead of starting over.
- Dashboard mode provides Regenerate, Open Builder, and Save & Use Now.
- Builder mode applies each valid result to the current canvas and hides the redundant Open Builder action.
- Preserve fields, rules, settings, custom HTML, and template identity when applying incremental edits.

## 4. Compatibility architecture already implemented

### 4.1 Multi-target package

`MegaForm.Umbraco/MegaForm.Umbraco.csproj` targets:

```xml
<TargetFrameworks>net8.0;net9.0;net10.0</TargetFrameworks>
```

The project uses conditional constants:

- `UMBRACO_13_14`
- `UMBRACO_15_16`
- `UMBRACO_17_18`

Keep unstable Umbraco APIs behind narrow compatibility helpers rather than scattering major-version checks throughout shared code.

### 4.2 Dual backoffice adapters

- U13: `MegaForm.Umbraco/wwwroot/package.manifest` plus `wwwroot/backoffice-v13/*`.
- U14+: `MegaForm.Umbraco/wwwroot/umbraco-package.json` plus Lit/Bellissima elements under `wwwroot/backoffice/*`.
- Shared UI: Razor host pages mount the same bundles produced by `MegaForm.UI`.

### 4.3 Authentication and routes

- U13 uses the native backoffice cookie behavior and path-sensitive `/umbraco/backoffice` routing.
- Bellissima uses the SPA bearer token.
- `megaform-workspace-view.js` lends the current same-origin token to framed MegaForm pages through a restricted `postMessage` bridge.
- `MegaFormBackOfficeRouteConvention` and `MegaFormApiRouteRewriteMiddleware` normalize shared UI API paths at the host boundary.
- Do not add Umbraco-major checks to every TypeScript fetch call.
- An HTML login page returned to JSON code is an authentication/routing defect, not a JSON parsing defect.

### 4.4 Umbraco 17/18 binary compatibility

- U18 exposed `MissingMethodException: IPublishedContent.get_Id()` even though the assembly compiled against U17.
- `UmbracoPublishedContentCompatibility` isolates runtime differences in published-content members.
- Page, document, and prevalue resolution must use this adapter rather than direct unstable interface calls.
- Compile success is not compatibility evidence. Each supported major must load and execute the package.

### 4.5 Bellissima route bridge and layout fix

Commit `99e32195 fix(umbraco): stabilize workspace layout across versions` implemented the main regression fix:

- iframe navigation is mirrored to the native outer route;
- builder frames receive `host=umbraco-workspace`;
- same-form tab changes reuse the existing frame;
- form-created messages replace `/builder/new` with the real form route;
- empty header slots are removed on dashboard/new-form routes;
- U13 host identity is preserved;
- short forms are top-aligned;
- Workflow Summary stays in canvas flow.

Do not remove `#syncRouteFromFrame` or change route ownership without rerunning the full workspace QA.

## 5. Feature status at this handoff

Status meanings:

- `Verified`: exercised with a build/runtime/browser or direct HTTP evidence.
- `Implemented`: code exists but the entire version matrix has not been re-proven.
- `WIP`: present in the dirty worktree and must be reviewed before commit/release.

| Area | Status | Evidence / warning |
| --- | --- | --- |
| One NuGet with net8/net9/net10 | Verified | Package verifier and clean U14 install passed |
| U13 Angular host | Verified | `:5513`, layout script passed |
| U14 Bellissima host | Verified | `:5514`, layout script and clean NuGet install passed |
| U17 Bellissima host | Verified | `:5517`, layout script passed |
| U18 Bellissima/ABI host | Verified | `:5518`, route and layout script passed |
| U15/U16 runtime hosts | Not complete | net9 builds, but clean runtime/visual hosts are still required |
| Blank header bands removed | Verified | U13/U14/U17/U18 automated measurements passed on 2026-09-16 |
| Workflow Summary below canvas | Verified | All four layout hosts reported present/displayed |
| U13 Create form direct wizard | Implemented | U13 adapter and route exist; repeat interaction QA before next release |
| Compact trial tab | Implemented/WIP | Source exists in modified `src/umbraco-host/index.ts`; re-build and visually test all hosts |
| License upload UI | Implemented | Saves to `App_Data/MegaForm/license.lic`; repeat valid/invalid upload QA |
| JSON purchase URL configuration | Implemented/WIP | Configuration/service files are currently untracked; must be committed as a coherent slice |
| Installed templates editable | Implemented | Gallery source explicitly treats installed content as editable local resources |
| Online Gallery preview in trial | Implemented | Preview-before-upgrade behavior exists; published metadata says preview fixed |
| Gemini provider and endpoint | Implemented/WIP | Provider source exists; cross-version Settings + real API QA still required |
| AI real-canvas preview | Implemented/WIP | Current dirty `ai-form-creator.ts` mounts `MegaFormRenderer`; must be built, visually QA'd, and committed |
| AI iterative follow-up edits | Implemented/WIP | Current schema is passed back on subsequent prompts; needs real Gemini QA |
| Languages styling/auth fix | Implemented/WIP | Source changed and commit `6317d84d` covers styling, but current source has further uncommitted edits |
| Umbraco Forms definition import | Verified only on U17 | Forms 17.4.7 live connector imported a draft and workflow summary |
| Umbraco Forms records import | Unit-covered, not live-proven | Real source-record fixture and file migration still required |
| Marketplace release 2.0.62 | Verified | NuGet listed and Marketplace sync returned HTTP 202 |

## 6. Umbraco Forms import contract

MegaForm should understand Umbraco Forms data and rebuild a MegaForm draft using deterministic conversion first and AI only for unsupported mappings.

Rules:

1. Never make the main package depend unconditionally on commercial Umbraco Forms assemblies.
2. Use the optional reflection connector when compatible Umbraco Forms services are installed.
3. Add/export-file support for sites where the live connector is unavailable.
4. Normalize source data into platform-neutral import contracts in `MegaForm.Core/Importing`.
5. Map known pages, columns, fields, conditions, prevalues, settings, and workflows deterministically.
6. Show an import preview with exact, compatible, manual, and unsupported items.
7. Import as Draft. Do not automatically publish or apply imported workflows.
8. Never send passwords, API keys, SMTP credentials, secret headers, or real submission values to AI by default.
9. Imported historical records must never execute current workflows.
10. Record stable source identity so repeated imports update/skip instead of duplicating.

U17 evidence from 2026-09-15:

- detected Umbraco Forms 17.4.7.0;
- listed two forms;
- previewed `Contact form` with 9 fields and 1 workflow;
- mapped `Send form to URL` to a MegaForm webhook;
- omitted the source workflow password and emitted a warning;
- created MegaForm draft #207;
- builder displayed converted fields and the bottom workflow summary.

Still required:

- test the reflection connector against every supported Forms major;
- add the export-file connector;
- import real historical records and files;
- expose imported-source badges and filters in Entries;
- add AI-assisted review only for manual/unsupported mappings;
- verify the import UI on U13, U14, U15, U16, U17, and U18.

## 7. Current code entry points

### Packaging and compatibility

- `MegaForm.Umbraco/MegaForm.Umbraco.csproj`
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.Umbraco/Routing/MegaFormBackOfficeRouteConvention.cs`
- `MegaForm.Umbraco/Middleware/MegaFormApiRouteRewriteMiddleware.cs`
- `MegaForm.Umbraco/Services/UmbracoPublishedContentCompatibility.cs`
- `MegaForm.Umbraco/wwwroot/package.manifest`
- `MegaForm.Umbraco/wwwroot/umbraco-package.json`

### Workspace and layout

- `MegaForm.Umbraco/wwwroot/backoffice/megaform-workspace-view.js`
- `MegaForm.Umbraco/wwwroot/backoffice/section-sidebar/megaform-sidebar-menu.js`
- `MegaForm.Umbraco/wwwroot/backoffice-v13/megaform-dashboard.controller.js`
- `MegaForm.Umbraco/wwwroot/backoffice-v13/megaform-dashboard.html`
- `MegaForm.Umbraco/Views/MegaFormAdmin/Dashboard.cshtml`
- `MegaForm.Umbraco/Views/MegaFormAdmin/Builder.cshtml`
- `MegaForm.UI/src/builder/dom.ts`
- `MegaForm.UI/src/styles/megaform-builder-shell.css`
- `MegaForm.UI/src/styles/megaform-builder-ts.css`

### AI, Languages, Gallery, trial and licensing

- `MegaForm.UI/src/dashboard/ai-form-creator.ts`
- `MegaForm.UI/src/dashboard/index.ts`
- `MegaForm.UI/src/ai-form-assistant/providers.ts`
- `MegaForm.UI/src/ai-form-assistant/settings.ts`
- `MegaForm.UI/src/languages/index.ts`
- `MegaForm.UI/src/dashboard/wizard/gallery-modal.ts`
- `MegaForm.UI/src/builder/gallery.ts`
- `MegaForm.UI/src/umbraco-host/index.ts`
- `MegaForm.Umbraco/Controllers/AiAssistantController.cs`
- `MegaForm.Umbraco/Services/UmbracoLicenseFileService.cs`
- `MegaForm.Umbraco/Services/UmbracoPurchaseSettingsService.cs`
- `MegaForm.Umbraco/Configuration/megaform-settings.json`

### Umbraco Forms import

- `MegaForm.Core/Importing/*`
- `MegaForm.Umbraco/Controllers/UmbracoFormsImportController.cs`
- `MegaForm.Umbraco/Services/UmbracoFormsImportService.cs`
- `MegaForm.Umbraco/Services/UmbracoFormsReflectionSource.cs`
- `MegaForm.UI/src/dashboard/index.ts`
- `MegaForm.Sdk.Tests/ExternalFormConverterTests.cs`

## 8. Current local hosts

All five ports were listening when this handoff was written.

Primary matrix root:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_260_Oqtane_um\_umbraco-test`

| Host | URL | Project/process | Credentials |
| --- | --- | --- | --- |
| U13 | `http://127.0.0.1:5513/umbraco#/megaform` | `v13/MFTest13.csproj` | `admin@example.com` / `SuperSecret123!` |
| U14 | `http://127.0.0.1:5514/umbraco/section/megaform` | `v14/MFTest14.csproj` | same |
| U17 | `http://127.0.0.1:5517/umbraco/section/megaform` | `v17/MFTest17.csproj` | same |
| U18 | `http://127.0.0.1:5518/umbraco/section/megaform` | `v18/MFTest18.csproj` | same |

Fresh public-NuGet U14 acceptance site:

- Root: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaForm-Marketplace-QA-2.0.62-U14`
- Backoffice: `http://127.0.0.1:5524/umbraco`
- Public form: `http://127.0.0.1:5524/contact-us`
- Credentials: `admin@local` / `Admin123456!`
- This site installed exact public package 2.0.62 from NuGet using an isolated empty package cache.

## 9. Existing QA evidence

### 9.1 Layout matrix from 2026-09-16

Viewport: 1365x768.

| Host | `data-mf-host` | Toolbar-to-layout gap | Canvas-to-form gap | Workflow Summary |
| --- | --- | ---: | ---: | --- |
| U13 `:5513` | `umbraco-v13` | 0 px | 24 px | present/displayed |
| U14 `:5514` | `umbraco-workspace` | 0 px | 24 px | present/displayed |
| U17 `:5517` | `umbraco-workspace` | 0 px | 24 px | present/displayed |
| U18 `:5518` | `umbraco-workspace` | 0 px | 24 px | present/displayed |

Screenshots:

- `artifacts/umbraco-workspace-qa/umbraco-5513-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5514-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5517-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5518-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5518-workflow-summary.png`

### 9.2 Fresh-package U14 acceptance

Verified from the public NuGet feed:

- clean restore and Release build succeeded;
- `MegaFormSchema` migration created the `MF_*` tables;
- section permissions were granted;
- form picker data type, document type, template, sample form, and sample pages were created;
- `/`, `/contact-us`, `/umbraco`, required static assets, and form schema endpoint returned HTTP 200;
- public HTML mounted `megaform-root`, CSS, renderer bundle, and renderer initialization;
- four NU1902 warnings came from the old Umbraco 14.3.4 host dependency graph, not from MegaForm.

### 9.3 Published artifact

- NuGet: `https://www.nuget.org/packages/MegaForm.Umbraco/2.0.62`
- Local file: `local-nuget-umbraco/MegaForm.Umbraco.2.0.62.nupkg`
- Size: 9,557,375 bytes, approximately 9.11 MB
- SHA256: `AFE810AB98164127E317C1B86B7C13A659B7F136BC3CF9A42BC67BB589A23E53`
- Marketplace API: `https://api.marketplace.umbraco.com/api/v1.0/packages/megaform.umbraco`
- Marketplace sync was accepted with HTTP 202.
- Marketplace gallery currently contains 8 real product screenshots.

Marketplace caveat: the Marketplace API has reported only Umbraco major versions 17 and 18 even though the package includes three TFM groups and a clean U14 install passed. Investigate Marketplace dependency/compatibility metadata before claiming that the Marketplace badge itself proves 13-18 support.

## 10. Build and QA commands

Run from the repository root unless noted.

### 10.1 Build the changed UI surfaces

```powershell
cd '.\MegaForm.UI'
npm run build:dashboard
npm run build:builder
npm run build:languages
npm run build:ai-form-assistant
npm run build:umbraco-host
cd '..'
```

The build scripts synchronize canonical bundles into the platform copies. Review generated diffs and do not manually edit generated bundles as the source of truth.

### 10.2 Typecheck and targeted tests

```powershell
cd '.\MegaForm.UI'
npm run typecheck
cd '..'

dotnet test '.\MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj' `
  --filter 'FullyQualifiedName~ExternalFormConverterTests'
```

### 10.3 Pack and verify

```powershell
dotnet pack '.\MegaForm.Umbraco\MegaForm.Umbraco.csproj' -c Release

& '.\scripts\verify-umbraco-package.ps1' `
  -PackagePath '.\local-nuget-umbraco\MegaForm.Umbraco.2.0.63.nupkg' `
  -MaximumPackageSizeMb 10
```

Use a new version in the example above. Never overwrite or republish 2.0.62 after source changes.

### 10.4 Workspace layout QA

```powershell
$env:MF_PLAYWRIGHT_MODULE = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'

& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' `
  '.\tools\browser-qa\verify-umbraco-workspace-layout.mjs' `
  --base-url 'http://127.0.0.1:5518' `
  --email 'admin@example.com' `
  --password 'SuperSecret123!' `
  --form-id '2' `
  --output '.\artifacts\umbraco-workspace-qa'
```

Direct checks:

```powershell
node '.\tools\browser-qa\verify-umbraco-workspace-layout.mjs' `
  --base-url 'http://127.0.0.1:5513' --direct-form-id 1 --host umbraco-v13

node '.\tools\browser-qa\verify-umbraco-workspace-layout.mjs' `
  --base-url 'http://127.0.0.1:5514' --direct-form-id 1 --host umbraco-workspace

node '.\tools\browser-qa\verify-umbraco-workspace-layout.mjs' `
  --base-url 'http://127.0.0.1:5517' --direct-form-id 1 --host umbraco-workspace

node '.\tools\browser-qa\verify-umbraco-workspace-layout.mjs' `
  --base-url 'http://127.0.0.1:5518' --direct-form-id 1 --host umbraco-workspace
```

## 11. Mandatory manual regression walk

Repeat on U13, U14, U17, and U18 after every workspace, builder, trial, Languages, Gallery, or AI change. Add U15 and U16 as soon as clean hosts exist.

1. Open MegaForm from the Umbraco top section navigation.
2. Confirm the dashboard is inside the section and the left MegaForm navigation is visible.
3. Confirm there is no dead blank rail on the left.
4. Click `Create form`; the five-step wizard must open immediately.
5. Open Installed templates; select one and confirm it is editable, not read-only.
6. Open Online Gallery in trial; open a preview without being blocked by the upgrade prompt.
7. Open an existing form from the dashboard/tree.
8. Confirm the outer route contains `/view/open/builder/{id}` on U14+.
9. Confirm exactly one form title/tabs area is visible.
10. Confirm the command row is fully readable and clickable at 1365x768.
11. Confirm no blank band exists above or below the command row.
12. Confirm the first form card starts near the top of the canvas.
13. Scroll to the end and confirm Workflow Summary and Configure workflow are visible.
14. Open Entries, Analytics, and Settings; confirm active-tab state and no duplicate frame.
15. Open Languages; confirm real UI loads and no HTML-as-JSON error appears.
16. Confirm the trial tab remains collapsed and does not cover commands.
17. Expand trial, click Purchase, and confirm the configured URL opens in a new tab.
18. Click Activate license and confirm the License pane opens in place.
19. Open AI settings; confirm Gemini provider, endpoint, model, and key fields are available.
20. Generate a form with Gemini; confirm a real form canvas appears.
21. Send a follow-up prompt; confirm the same form is edited instead of replaced from scratch.
22. Save/open the form in Builder and confirm fields, rules, layout, and theme survive.
23. Publish and render a public form; submit it and verify the entry appears in Entries.

## 12. Fragile areas and known risks

### 12.1 Dirty worktree and release reproducibility

This is the highest operational risk. The workspace has hundreds of unrelated modified and untracked files. Some sources that implement requested behavior are not committed. Do not solve this with a broad cleanup. Instead:

1. Identify one feature slice.
2. Diff its source and generated assets.
3. Build and test that slice.
4. Commit only its files.
5. Repeat until the release can be reproduced from a clean checkout.

### 12.2 Bellissima private DOM dependency

`megaform-workspace-view.js` currently climbs shadow roots to find `umb-section-main-views` and `umb-body-layout`, then mounts the MegaForm form header and hides a redundant single-tab strip. This fixed the UI but depends on private internal DOM names.

For future Umbraco releases:

- prefer official workspace/header extension points when available;
- if official APIs cannot express the design, keep the entire MegaForm workspace inside MegaForm's own section view instead of patching arbitrary Umbraco DOM globally;
- isolate selectors in one adapter and fail gracefully when they are absent;
- add a smoke test that asserts header mounting and absence of reserved blank bands.

### 12.3 U13/U14 share net8

NuGet cannot select two different assemblies solely because one site is U13 and another is U14 when both run net8. The current design compiles the net8 assembly against U13 and ships both manifests/static adapters. Preserve binary-safe server APIs and keep UI host differences in static adapters or runtime feature detection.

### 12.4 U15/U16 evidence gap

The net9 asset compiles, but U15 and U16 do not yet have the same runtime and visual evidence as U13/U14/U17/U18. Build clean hosts and add them to the automated matrix before the next broad compatibility claim.

### 12.5 Cached static assets

Umbraco backoffice ESM modules and browser cache can display old code after package replacement. Increment asset versions, restart the host, and hard-refresh before diagnosing a regression.

### 12.6 Security advisories

Current MegaForm project dependency checks previously reported no vulnerable MegaForm dependencies after pinning MailKit and MessagePack where needed. Old Umbraco 13/14 host packages may still report advisories. Attribute warnings to the actual dependency graph; do not claim MegaForm introduced them without evidence.

## 13. Recommended next-session order

### P0: Preserve and prove current WIP

1. Capture `git status` and targeted diffs for AI, Gemini, Languages, Gallery, licensing, and purchase settings.
2. Build their canonical UI entries.
3. Run U13/U14/U17/U18 manual and automated checks.
4. Commit coherent slices without including unrelated changes.
5. Verify a clean checkout can rebuild the same behavior.

### P1: Re-run the owner's reported regressions

1. U13: create a form, reopen it, inspect top/left/right whitespace, click Create form.
2. U14: inspect the top band, sidebar, and command density.
3. U18: open from dashboard, verify outer route, one header, no blank bands, and Workflow Summary.
4. Trial: verify the collapsed tab does not cover top commands.
5. Languages: verify no HTML login response is parsed as JSON.

### P2: Finish AI/Gemini experience

1. Configure a real Gemini key through Settings, never source code.
2. Use a free Gemini Flash model supported by the configured API account.
3. Generate a non-trivial form and visually compare preview with Builder canvas.
4. Issue at least three iterative edits and verify schema continuity.
5. Save, reopen, publish, submit, and inspect the entry.
6. Repeat at least U13, U14, and U18 because host/auth/layout paths differ.

### P3: Add U15/U16 clean hosts

1. Create reproducible U15 and U16 projects.
2. Install the same future package from an isolated package cache.
3. Run migrations, dashboard, builder, public render, submit, entries, workflow, license, gallery, Languages, and AI tests.
4. Add ports/credentials/scripts to this matrix.

### P4: Complete Umbraco Forms migration

1. Add export-file import.
2. Test live connectors by Forms major.
3. Add real record and file migration fixtures.
4. Add Entries source badges, filters, batch reports, retry, and idempotency evidence.
5. Add human-reviewed AI mapping for unsupported custom fields/workflows.

### P5: Reduce future-version churn

Extract or finish four narrow adapters:

1. `IUmbracoPublishedContentAdapter`
2. `IUmbracoBackOfficeAuthAdapter`
3. `IUmbracoBackOfficeUiAdapter`
4. `IUmbracoLifecycleAdapter`

Shared MegaForm code should consume capabilities, not Umbraco major numbers.

## 14. Relevant commits and release state

Relevant branch commits before this handoff:

- `99e32195 fix(umbraco): stabilize workspace layout across versions`
- `5bce39b8 release(umbraco): publish 2.0.62 marketplace metadata`
- `79490d8d docs(umbraco): expand marketplace screenshots`

Marketplace branch commit:

- `e7409559 docs(marketplace): expand MegaForm gallery and support copy`

Release copy includes:

- Google Gemini support;
- Gemini Flash positioning for the free API tier;
- Online Gallery preview fix;
- Bellissima workspace routing/layout fix;
- one package for Umbraco 13-18;
- contact wording reduced to `Contact and support`.

Do not include NuGet API keys or AI provider keys in any handoff. Keys previously entered in chat are secrets and are intentionally absent from this file.

## 15. Definition of done for the next Umbraco release

A future package is not done merely because it compiles. It is done only when:

- one package installs on clean hosts for every claimed major;
- dashboard, left navigation, Create form, Builder, Entries, Analytics, Settings, Languages, Gallery, AI, licensing, public rendering, submit, and workflow all execute;
- U13 is visually and behaviorally equivalent to U14+ within the limits of its legacy host;
- no blank bands, dead left rail, duplicate headers, clipped commands, or missing Workflow Summary remain;
- the trial control never blocks primary commands;
- installed templates are editable and Online Gallery previews work before purchase;
- Gemini can generate and iteratively edit a real canvas form;
- package verification passes below 10 MB;
- vulnerability output is attributed and documented;
- the release can be rebuilt from a clean checkout;
- the same exact package file used for QA is the file published to NuGet.
