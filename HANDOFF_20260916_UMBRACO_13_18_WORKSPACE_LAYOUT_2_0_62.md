# MegaForm Umbraco 13-18 Workspace Layout Handoff

Date: 2026-09-16

Repository: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`

Branch: `feature/typed-submission-storage-core`
Package version: `MegaForm.Umbraco 2.0.62`

## Current result

The Umbraco 18 regression shown on 2026-09-16 is fixed and verified. The builder no longer opens as a standalone screen inside the dashboard workspace, the two empty header bands are gone, the command row fits, the canvas begins immediately below the command row, and Workflow Summary remains at the bottom of the form.

The same builder runtime was checked on Umbraco 13, 14, 17, and 18 at 1365x768. All four passed the automated layout assertions.

## Regression root cause

The screenshot at `http://127.0.0.1:5518/umbraco/section/megaform` showed that the outer Bellissima route remained on the dashboard while the same-origin iframe navigated itself to `/umbraco/MegaForm/Builder/{id}`.

That route drift had two effects:

1. Bellissima did not receive a form id, so the native form title and Design/Entries/Analytics/Settings header was not mounted correctly.
2. The iframe-loaded builder did not receive `host=umbraco-workspace`, so it rendered its standalone title/tabs and standalone reserved padding inside the Umbraco workspace.

The result was the old duplicate-header layout with large blank bands.

A separate canvas issue amplified the visual gap on short forms: `#mf-canvas-dropzone` centered its flex contents vertically. The form and its Workflow Summary footer therefore appeared far below the command bar.

## Product changes

### Bellissima route bridge

File: `MegaForm.Umbraco/wwwroot/backoffice/megaform-workspace-view.js`

- Added `#syncRouteFromFrame` to map same-origin iframe navigation back to native Umbraco routes.
- Maps Builder, Submissions, Languages, Settings, and Dashboard iframe URLs.
- Builder navigation now changes the outer URL to `/umbraco/section/megaform/view/open/builder/{id}`.
- The replacement builder frame is loaded with `host=umbraco-workspace`.
- Dashboard, new-form, and settings frame URLs now preserve `host=umbraco-workspace`.
- Dashboard/new-form routes do not mount an empty Umbraco header slot. This avoids an otherwise empty reserved band.
- Same-form tab changes activate the existing builder frame instead of reloading it.
- Form-created messages replace `/builder/new` with the real form route.

### Umbraco host propagation

File: `MegaForm.Umbraco/Views/MegaFormAdmin/Dashboard.cshtml`

- Preserves the requested host mode in dashboard and builder links.
- U13 keeps `umbraco-v13`.
- U14+ keeps `umbraco-workspace`.
- Builder roots receive the matching `data-mf-host` value.

### Canvas and Workflow Summary

Files:

- `MegaForm.UI/src/styles/megaform-builder-ts.css`
- `MegaForm.UI/src/styles/megaform-builder-shell.css`
- `MegaForm.UI/src/builder/dom.ts`

Important invariants:

- Build mode uses `justify-content: flex-start` for `#mf-canvas-dropzone`.
- Do not restore vertical centering for short forms.
- U13 owns its title/tabs and command row inside the builder because Angular does not provide the Bellissima form workspace header.
- U14+ hides the duplicate internal primary tabs because the native workspace supplies them.
- Workflow Summary remains inside the canvas scroll flow below `.mf-form-wrapper`.
- Do not move `#mf-inline-workflow-summary` outside `#mf-canvas-dropzone`; long forms would hide it below the clipped center panel.

### Version and package metadata

Files:

- `MegaForm.Umbraco/MegaForm.Umbraco.csproj`
- `MegaForm.Umbraco/README.md`
- `MegaForm.Umbraco/wwwroot/umbraco-package.json`
- `MegaForm.Umbraco/wwwroot/package.manifest`

Version is `2.0.62`. This remains one NuGet package for Umbraco 13 through 18:

| Target | Umbraco line |
| --- | --- |
| `net8.0` | Umbraco 13 and 14 |
| `net9.0` | Umbraco 15 and 16 |
| `net10.0` | Umbraco 17 and 18 |

Do not split this into per-Umbraco NuGet packages.

## QA automation

New reusable script:

`tools/browser-qa/verify-umbraco-workspace-layout.mjs`

It supports two modes:

1. Workspace route mode logs into Umbraco, loads the dashboard, navigates its iframe to a real builder, verifies that the outer route changes, measures layout gaps, and captures screenshots.
2. Direct builder mode verifies each platform host without requiring a backoffice session.

The script asserts:

- expected `data-mf-host`
- `body[data-mf-mode="build"]`
- zero gap between the last visible toolbar and builder layout
- form anchored near the top of the canvas
- Workflow Summary exists and is visible after scrolling

The Bellissima dashboard uses a closed shadow root. For deterministic route QA, workspace mode may use `--form-id` to navigate the dashboard iframe directly. This exercises the same iframe `load` event and `#syncRouteFromFrame` path as clicking a dashboard form.

## Verification completed

### Build and package

- `npm run build:builder`: passed, 93 modules bundled.
- `dotnet pack MegaForm.Umbraco/MegaForm.Umbraco.csproj -c Release`: passed.
- U13/U14/U17/U18 test host builds with package `2.0.62`: passed.
- All test-host `MegaForm.Umbraco.dll` files report assembly version `2.0.62.0`.
- Runtime HTTP checks confirmed the new workspace module and flex-start CSS on all four ports.
- `scripts/verify-umbraco-package.ps1`: passed.

Final local package:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\local-nuget-umbraco\MegaForm.Umbraco.2.0.62.nupkg`

Package verification result:

- Size: 9.11 MB, 9,556,877 bytes
- Contains `lib/net8.0`, `lib/net9.0`, and `lib/net10.0` assemblies
- Contains the workspace module and builder CSS
- Contains 271 runtime flag SVG files
- Contains no template-specific images
- Contains no source maps or duplicate locale catalogs
- Contains no separate MegaForm Core/SDK package dependency

### Visual matrix

| Host | Mode | Toolbar-layout gap | Canvas-form gap | Workflow Summary | Result |
| --- | --- | ---: | ---: | --- | --- |
| U13 `:5513` | `umbraco-v13` | 0 px | 24 px | present/displayed | pass |
| U14 `:5514` | `umbraco-workspace` | 0 px | 24 px | present/displayed | pass |
| U17 `:5517` | `umbraco-workspace` | 0 px | 24 px | present/displayed | pass |
| U18 `:5518` | `umbraco-workspace` | 0 px | 24 px | present/displayed | pass |

U18 workspace route mode also passed:

- Dashboard route became `/umbraco/section/megaform/view/open/dashboard`.
- Opening form id 2 changed the outer URL to `/umbraco/section/megaform/view/open/builder/2`.
- Native header displayed `Tutoring Request Form #2` and the four expected tabs.
- Builder iframe width was 1065 px inside the Umbraco navigation layout.
- Command row, toolbox, canvas, and form did not overlap.
- Workflow Summary was visible after scrolling to the end of the canvas.

Screenshots:

- `artifacts/umbraco-workspace-qa/umbraco-5513-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5514-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5517-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5518-workspace.png`
- `artifacts/umbraco-workspace-qa/umbraco-5518-workflow-summary.png`

## Local test hosts

Root:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_260_Oqtane_um\_umbraco-test`

| Version | URL | Project |
| --- | --- | --- |
| U13 | `http://127.0.0.1:5513/umbraco#/megaform` | `v13/MFTest13.csproj` |
| U14 | `http://127.0.0.1:5514/umbraco/section/megaform` | `v14/MFTest14.csproj` |
| U17 | `http://127.0.0.1:5517/umbraco/section/megaform` | `v17/MFTest17.csproj` |
| U18 | `http://127.0.0.1:5518/umbraco/section/megaform` | `v18/MFTest18.csproj` |

Local credentials:

- Email: `admin@example.com`
- Password: `SuperSecret123!`

All four hosts were left running at handoff time.

## Commands

### Rebuild UI and package

```powershell
cd 'E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI'
npm run build:builder

cd '..'
dotnet pack '.\MegaForm.Umbraco\MegaForm.Umbraco.csproj' -c Release
& '.\scripts\verify-umbraco-package.ps1' `
  -PackagePath '.\local-nuget-umbraco\MegaForm.Umbraco.2.0.62.nupkg' `
  -MaximumPackageSizeMb 10
```

### Run U18 end-to-end workspace regression QA

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

### Run direct layout QA

```powershell
# U13
node '.\tools\browser-qa\verify-umbraco-workspace-layout.mjs' `
  --base-url 'http://127.0.0.1:5513' --direct-form-id 1 --host umbraco-v13

# U14/U17/U18
node '.\tools\browser-qa\verify-umbraco-workspace-layout.mjs' `
  --base-url 'http://127.0.0.1:5518' --direct-form-id 1 --host umbraco-workspace
```

## Mandatory regression checklist

Before publishing another Umbraco package:

1. Build and install the same package into U13, U14, U17, and U18.
2. Hard-refresh old backoffice tabs after installation so a cached ESM workspace module is not mistaken for a current regression.
3. From the MegaForm dashboard, open an existing form. The outer URL must contain `/view/open/builder/{id}`.
4. Confirm U13 shows its internal title/tabs row and command row.
5. Confirm U14+ shows native Umbraco title/tabs plus only the builder command row.
6. Confirm there is no empty band above or below the command row.
7. Confirm command labels do not overlap at 1365x768.
8. Confirm the first form card starts near the top of the canvas.
9. Scroll to the end of a long form and confirm Workflow Summary and Configure workflow are visible.
10. Run `verify-umbraco-package.ps1` and keep the package under 10 MB.

## Warnings and boundaries

- U13 and U14 builds report known NuGet vulnerability advisories for their pinned Umbraco CMS versions. They do not fail the build and are not introduced by MegaForm 2.0.62.
- U18 reports one existing nullable warning in `VerifyApiClientComposer.cs` in the test host.
- The repository contains many unrelated modified/untracked files from other ongoing MegaForm work. Do not use `git reset --hard`, `git clean`, or broad checkout commands.
- The layout commit is intentionally scoped to the Umbraco workspace/layout sources, metadata, QA script, generated builder CSS needed by this fix, and this handoff. Other dirty worktree changes must remain untouched.
- Do not publish the package until a release owner explicitly requests a NuGet push.

## Next session starting point

1. Read this file and run `git log -1 --oneline` to identify the commit containing it.
2. Confirm ports 5513, 5514, 5517, and 5518 are listening; restart only the missing host.
3. Run the U18 end-to-end QA command above.
4. Open U18 manually and repeat Dashboard -> Tutoring Request Form -> scroll to Workflow Summary.
5. If all checks pass, use `MegaForm.Umbraco.2.0.62.nupkg` as the release candidate. Do not rebuild under the same version after making further runtime changes; increment the package version.
