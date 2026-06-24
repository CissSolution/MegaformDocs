# Theme Designer internal state fix (TS-only)

This patch updates only Vite/TS source files:

- `MegaForm.UI/src/theme-designer/index.ts`
- `MegaForm.UI/src/theme-designer/inspector.ts`

Then rebuilds the official Vite entries:

- `theme-designer`
- `theme-inspector`

Key change:
- Theme Designer core now exposes internal state APIs from inside the core closure.
- Inspector writes directly into those APIs instead of only patching preview-local CSS.
- Save / Update Theme reads the same merged state.

Result:
- Preview edit, dirty state, save/update, and reload should use one shared state path.
