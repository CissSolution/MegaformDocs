# Theme Designer Live CSS Reinjection + Debug Log Note

This patch updates only Vite/TS source for Theme Designer:

- `MegaForm.UI/src/theme-designer/inspector.ts`
- `MegaForm.UI/src/theme-designer/index.ts`

Changes:
- keeps live CSS apply without iframe rebuild
- re-injects `mfi-lo` and `td-live-overrides` after preview iframe reload
- stops wiping `state.overrides` on `importCustomCss()`
- adds console logs:
  - `[MFI] applyOverride ...`
  - `[MFI] applyCssVar ...`
  - `[MFI] frame reload`
  - `[MFI] reInjectIntoFrame ...`
  - `[TD] applyCssVarToCore ...`
  - `[TD] applyStyleOverride ...`

JS outputs were rebuilt and synced like the normal TS pipeline:
- `Assets/js/megaform-theme-designer.js`
- `Assets/js/megaform-theme-inspector.js`
- Web/Oqtane synced copies
