# Visual QA Form 747 - Layer 1 + Layer 4 (B232)

Date: 2026-06-22  
Target: `http://localhost:5070/?mfpanel=builder&formId=747` and `http://localhost:5070/?formid=747`

## Scope implemented

Layer 1 - runtime alias bridge:

- Added auto alias generation from builder `--mf-*` variables to:
  - shadcn/Tailwind names: `--background`, `--foreground`, `--primary`, `--border`, `--card`, etc.
  - premium names: `--mfp-*`, `--au-*`.
  - template prefixes: `--bg-*`, `--fr-*`, `--it-*`, `--aur-*`, `--nola-*`, `--hw-*`, `--ey-*`.
  - standalone semantic names: `--ink`, `--paper`, `--surface`, `--line`, `--shadow`.
- Same alias bridge now runs in:
  - public renderer,
  - builder Theme Designer live preview,
  - server first-paint inline preset CSS.

Layer 4 - generic premium fallback:

- Added generic `.mfp[class*="mfp-"]` compatibility CSS for custom/premium shells.
- Fallback applies form background, border, text color, font, inputs, buttons, heading/label typography, radius and shadow.
- Kept `.mfp.mfp-australia` specific bridge after the generic bridge so Form 747 keeps its Australia template behavior.

## Files changed

- `MegaForm.UI/src/renderer/index.ts`
- `MegaForm.UI/src/builder/theme-tab-adapter.ts`
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs`
- `MegaForm.Core/Services/ThemePresetInlineCssService.cs`
- `MegaForm.UI/src/loader/index.ts`
- `MegaForm.UI/src/dnn-host/index.ts`
- `MegaForm.Oqtane.Shared/AssetVersion.cs`

## Build/deploy

Builds passed:

- `npm run build:renderer`
- `npm run build:builder`
- `npm run build:loader`
- `npm run build:dnn-host`
- `dotnet build MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj -c Debug -f net10.0`
- `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Debug -f net10.0`
- final B232 rebuild: builder, loader, dnn-host, shared.

Live deployment backups:

- `_mfbackup_B231_20260622-160149`
- `_mfbackup_B232_20260622-161352`

Runtime process after final deploy:

- `Oqtane.Server.exe` restarted on localhost:5070.
- Builder scripts loaded with `?v=20260622-B232`.

## Visual QA results

Builder load:

- Form 747 no longer loads blank.
- No console error/warn during builder load.
- Schema input exists and remains large (`#mf-builder-schema-json`, about 328 KB).
- Builder bundle observed: `/Modules/MegaForm/js/bundles/megaform-builder.js?v=20260622-B232`.

Design mode / left preset pane:

- Switching to top `Design` mode opens the intended view with `Live Preview`, `Presets`, `Colors`, and `Theme Designer`.
- Clicking `Forest` updates the preview shell, not only inputs:
  - header/band background changes to green,
  - form border changes to green,
  - icon accents change to green,
  - input borders/backgrounds stay aligned.
- Iframe live CSS contains form-specific high-specificity selectors:
  - `#mf-form-wrapper-747 .mfp[class*="mfp-"]`
  - `#mf-form-wrapper-747 .mfp.mfp-australia`
- Alias evidence in live CSS:
  - `--mfp-primary: #22c55e`
  - `--au-primary: #22c55e`
  - `--bg-primary: #22c55e`
  - `--fr-primary: #22c55e`

Right pane:

- `SHARP` radius applies in preview:
  - `--mf-form-radius: 0px`
  - `--mf-input-radius: 0px`
  - `--mf-btn-radius: 0px`
  - visible input/form corners become square.
- `XL` shadow preset applies:
  - `--mf-form-shadow: 0 16px 32px rgba(0,0,0,0.16)`
  - `--mf-btn-shadow: 0 16px 32px rgba(0,0,0,0.16)`
- Body font selection applies:
  - selecting `Georgia` emits `--mf-font-family: 'Georgia', Georgia, serif`.
- Colors tab quick swatch applies:
  - selecting `#8b5cf6` emits `--mf-primary`, `--mfp-primary`, `--au-primary`, `--bg-primary`, and `--fr-primary` with the purple value.

Public live view:

- Public renderer loads with `?v=20260622-B232`.
- `#mf-custom-css-747` includes `CustomShellBuilderCompat v20260622-B231`.
- Runtime custom shell CSS includes `.mfp[class*="mfp-"]` fallback and alias rules.
- No console errors/warnings observed.
- The form shell now fills its parent Oqtane pane (`width:100%` behavior inside the pane).

## Remaining note

The public page still contains an `HtmlText` module in the left column and the MegaForm module in a right-side Oqtane pane. Because of that page layout, the form cannot span the full browser viewport unless the module is moved to a full-width pane or the Oqtane page layout is changed. The CSS fix makes the form full-width within its actual parent pane; it does not override page/pane layout.

Also note: Visual QA changed presets/colors/radius inside builder preview but did not click `Apply` to save those experimental changes. Public live view still shows the saved Ocean-style state unless the user applies/saves a new preset.

