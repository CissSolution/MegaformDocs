# Theme Designer Live Style Tag Restore

This patch updates only the Vite/TS source for Theme Designer.

## Goal
Restore live CSS application in the preview iframe without triggering a full iframe rebuild.

## Key changes
- Added live preview helpers in `MegaForm.UI/src/theme-designer/index.ts`:
  - `updateLiveVarsInPreview(...)`
  - `updateLiveCustomCssInPreview(...)`
  - `updateLivePreviewFromState()`
- `applyCssVar(...)` now updates the iframe live vars style tag immediately.
- `applyStyleOverride(...)` now updates the iframe live overrides style tag immediately.
- `setCustomCss(...)`, `setCssOverrides(...)`, and `setThemeState(...)` were overridden inside the TS source to avoid full preview rebuilds.

## Build
Run your normal pipeline after applying this source:
- BuildTS
- build.cmd
- pack.cmd
