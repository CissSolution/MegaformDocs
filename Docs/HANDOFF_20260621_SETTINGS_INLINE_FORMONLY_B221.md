# HANDOFF 2026-06-21 - Settings inline FormOnly B221

## Summary

We fixed the MegaForm Oqtane module Settings regression on:

- `http://localhost:5070/?mfpanel=submissions`
- Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
- Live site root: `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3`
- Current deployed asset version: `20260621-B221`
- Current live Oqtane PID after deploy: `24996`

The regression had two parts:

1. The Settings UI appeared as a popup/modal-style overlay on top of the Submissions panel.
2. The newer JS settings UI regressed from the older Oqtane FormOnly settings behavior:
   - Module form dropdown could be empty.
   - View mode/ListView/List/Card/named-views UI appeared in Module Settings.

Both are fixed in B221:

- Settings opens inline, not as a fixed modal/backdrop.
- Submissions surface temporarily switches from `is-fs` to `is-inline` while Settings is open, so the inline settings panel occupies real layout flow.
- Closing Settings restores the surface back to `is-fs`.
- Module form dropdown is populated via the proven `Form/List` fallback when `ModuleConfig` returns no forms.
- Module Settings is FormOnly again: no View mode, no Named views, no ListView/List/Card choices.

Do not write credentials into docs or repo. The host session was already authenticated during QA.

## Important context

Previous session had concluded:

- Static render for public/anonymous form is the real target for the load/flicker work.
- Admin and public share `Index.razor`, and Oqtane render mode is per component.
- If the module goes static, Blazor `@onclick` admin controls stop working.
- The minimal admin path is: keep admin controls as links/JS, and make Settings work without Blazor interactivity.

This session focused only on Settings regression in the admin panel, not the static-render anonymous form work.

## Version found

The "correct older Settings version" was already present in `MegaForm.Oqtane.Client\Index.razor` as the old inline Blazor settings panel:

- It has the comment:
  - `[FormOnly 2026-06-17] Inline View Mode (list/card/listview) was removed from Module Settings`
- It uses `_forms` in the Bound Form dropdown.
- It uses fallback logic in `LoadAdminConfigAsync`:
  - Call `MegaFormService.GetModuleConfigAsync(...)`.
  - If `response.Forms` is empty, call `MegaFormService.ListFormsAsync(...)`.
  - Result: the form dropdown is populated even when the ModuleConfig response lacks the form list.

That old panel cannot be used directly under static render because its controls rely on Blazor `@onclick`/`@bind`. The correct move was to port the behavior into the JS Settings bundle while preserving inline static-safe behavior.

## Files changed

### `MegaForm.Oqtane.Client\Index.razor`

Key changes:

- Settings dock link opens inline using an `onclick` JS payload rather than relying on Blazor interactivity.
- Inline host exists under the admin dock:
  - `id="@SettingsInlineHostId"`
  - `data-mf-settings-inline-host="1"`
- Admin dock/inline host z-index is raised so chart SVGs in Submissions do not cover the Settings button.
- `BuildSettingsInlineOpenScript()` now:
  - Passes `siteId = GetCurrentSiteId()`.
  - Passes `moduleId`, `currentPageId`, `currentPageUrl`, `inline`, and `inlineHostId`.
  - Dynamically loads `megaform-settings-popup.js` if `window.MFSettings.open` is unavailable.
  - Temporarily converts the active `.mf-oq-surface.is-fs` to `.is-inline` while Settings is open.
  - Sets `data-mf-settings-inline-surface="1"` while inline settings is active.
  - Restores the original surface state when the settings host empties/Settings closes.

Useful line anchors after B221:

- Settings link: `Index.razor:21`
- Inline host: `Index.razor:29`
- `SettingsInlineHostId`: `Index.razor:1485`
- `siteId = GetCurrentSiteId()`: `Index.razor:2620`
- Inline surface preparation/restoration logic: starts around `Index.razor:2627`

### `MegaForm.UI\src\view-designer\shared.ts`

Key change:

- `getModuleConfig(...)` now falls back to the proven `Form/List` endpoint when `ModuleConfig` returns an empty form list.

Exact behavior:

```ts
if (normalized) {
  if (!normalized.forms.length) {
    normalized.forms = await fetchFormOptions(normalized.siteId || siteId, moduleId);
  }
  return normalized;
}
```

Line anchor after B221:

- `normalized.forms = await fetchFormOptions(...)`: `shared.ts:946`

### `MegaForm.UI\src\view-designer\settings-popup.ts`

Key changes:

- Added `enterInlineSettingsMode(...)` for inline mode restore support.
- Force FormOnly module settings:
  - `current.viewMode = 'form'`
  - `current.viewType = 'submit'`
  - `current.selectedViewKey = ''`
- `rerender()` no longer appends the old `View mode` section.
- `rerender()` now appends:
  - `Module form`
  - `Current Form settings`
  - `Renderer host`
  - `Page binding`
- Added `buildFormSettingsSection()` which wraps `buildFormModePanel()`.
- Module form help text changed to:
  - `Pick the published form this module will render.`
- Page binding option text changed:
  - from `Render (form / list / card / listview)`
  - to `Render (form)`

Important: the file still contains older helper functions for saved views/List/Card/ListView below, but they are not rendered from `rerender()` in B221. The bundle dropped from ~103 KB to ~38 KB after tree-shaking.

Line anchors after B221:

- FormOnly comment/force behavior: `settings-popup.ts:171`
- `appendSafe('Current Form settings', ...)`: `settings-popup.ts:222`
- `buildFormSettingsSection`: starts around `settings-popup.ts:247`
- Form dropdown help text: `settings-popup.ts:558`
- Page binding text `Render (form)`: `settings-popup.ts:1512`

### `MegaForm.UI\src\view-designer\shared.ts`

Earlier inline popup support already exists:

- `.mf-vd-overlay.mf-vd-inline`
- `PopupOpts.inlineHost`
- Inline mode appends the overlay into the inline host instead of `document.body`.
- Inline mode does not lock `document.body.style.overflow`.

Useful anchors:

- inline CSS: `shared.ts:229`
- `inlineHost` option: `shared.ts:363`
- inline mount: `shared.ts:444`

### `MegaForm.UI\vite.config.ts`

Settings bundle entry restored/kept:

```ts
'settings-popup': resolve(__dirname, 'src/view-designer/settings-popup.ts'),
```

### `BuildTS.ps1`

`settings-popup` is included in the TS build module list.

### `MegaForm.Oqtane.Shared\AssetVersion.cs`

Current:

```csharp
public static readonly string Current = "20260621-B221";
```

Line anchor:

- `AssetVersion.cs:29`

## Build commands run

From repo root unless noted.

Frontend settings bundle:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"
node scripts/build-entry.cjs settings-popup
```

Result:

- Build succeeded.
- Output:
  - `Assets\js\megaform-settings-popup.js`
  - synced to Oqtane/Web/DNN platform assets.
- Bundle size after FormOnly cleanup:
  - `37.82 kB`
  - gzip `11.34 kB`

.NET:

```powershell
dotnet build MegaForm.Oqtane.Shared\MegaForm.Oqtane.Shared.csproj -c Debug -f net10.0
dotnet build MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj -c Debug -f net10.0
```

Result:

- Build succeeded.
- Warnings only, pre-existing/non-blocking:
  - `NU1510` for `System.Net.Http.Json`
  - nullable warnings in `SdkDemoView.razor`
  - unused `_showDashboardPanel`

## Live deploy

Live root:

```text
E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3
```

Deployed files:

- `MegaForm.Oqtane.Client.Oqtane.dll`
- `MegaForm.Oqtane.Shared.Oqtane.dll`
- `wwwroot\Modules\MegaForm\js\megaform-settings-popup.js`

Last B221 backup before deploy:

```text
E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_201504_preSettingsFormOnlyB221
```

B221 live details:

- Previous PID stopped: `23368`
- New PID started: `24996`
- Live settings JS length: `37853`
- Live settings JS SHA256 prefix: `CEB180159FE7DDB6`

## Visual QA performed

Target:

```text
http://localhost:5070/?mfpanel=submissions&qa=settings-formonly-B221
```

Browser state:

- Host session was already authenticated.
- Settings script loaded:

```text
/Modules/MegaForm/js/megaform-settings-popup.js?v=20260621-B221
```

DOM/functional QA after clicking Settings:

```json
{
  "overlayClass": "mf-vd-overlay mf-vd-inline",
  "fixedOverlayCount": 0,
  "surfaceClass": "mf-oq-surface is-inline",
  "settingsTitle": true,
  "hasCurrentFormSettings": true,
  "hasViewModeLabel": false,
  "hasNamedViews": false,
  "hasListViewText": false,
  "formOptionCount": 43,
  "realFormOptionCount": 11,
  "formSelect.value": "743"
}
```

Observed form dropdown entries include:

- `Contact Form (#744, Published)`
- `bulgaria-discovery-programme.json (#743, Published)`
- `summary.json (#742, Published)`
- `american-auto-dealership-registration.json (#741, Published)`
- `aurora-style-consultation.json (#737, Published)`

Visual screenshot saved:

```text
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\tmp-qa\settings-formonly-B221.png
```

Close/restore QA:

```json
{
  "bodyOverflow": "visible",
  "overlayCount": 0,
  "surfaceClass": "mf-oq-surface is-fs",
  "surfacePosition": "fixed"
}
```

This confirms:

- Settings is inline, not popup/fixed overlay.
- No body scroll lock.
- Surface becomes inline while settings is open.
- Surface restores to fullscreen fixed after closing.

## Rollback

Rollback B221 by copying from:

```text
E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_201504_preSettingsFormOnlyB221
```

Files to restore:

- `MegaForm.Oqtane.Client.Oqtane.dll`
- `MegaForm.Oqtane.Shared.Oqtane.dll`
- `megaform-settings-popup.js`

Then restart:

```powershell
$live='E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3'
$serverPid=(Get-NetTCPConnection -LocalPort 5070 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)
if($serverPid){ Get-Process -Id $serverPid -ErrorAction SilentlyContinue | Stop-Process -Force }
Start-Sleep -Milliseconds 800
Start-Process -FilePath (Join-Path $live 'Oqtane.Server.exe') -WorkingDirectory $live -WindowStyle Hidden
```

## Next-session checklist

1. Start by verifying live is still B221:

```powershell
Get-NetTCPConnection -LocalPort 5070 -State Listen -ErrorAction SilentlyContinue
Get-Item "E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\js\megaform-settings-popup.js"
```

2. Open:

```text
http://localhost:5070/?mfpanel=submissions
```

3. Click Settings and confirm:

- Form dropdown is populated.
- No `View mode`.
- No `Named views`.
- No `ListView/List/Card` options.
- Settings is inline.

4. If continuing static-render work:

- Keep this Settings path static-safe.
- Do not reintroduce Blazor-only `@onclick`/`@bind` for admin dock Settings.
- The old Blazor settings panel in `Index.razor` is useful as behavior reference, but not as the static-safe implementation.

## Known caveats

- The `settings-popup.ts` file still contains old List/Card/ListView helper functions below the FormOnly rendering path. They are not active in B221 because `rerender()` no longer calls the View Mode section. Vite tree-shaking already removed most of this from the built bundle.
- `Index.razor` still has legacy ListView runtime support elsewhere, but the FormOnly settings UI no longer exposes those modes in Module Settings.
- The repo appears as a large untracked tree under `git status --short`; do not rely on `git diff` alone for scoping. Use file/line inspection.

