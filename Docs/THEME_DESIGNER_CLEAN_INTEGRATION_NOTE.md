# Theme Designer Clean Integration Note

This patch moves the Theme Designer runtime enhancements into the Vite source-of-truth entry:

- `MegaForm.UI/src/theme-designer/index.ts`
- `MegaForm.Core/Templates/ThemeDesignerHost.html`

What changed:
- Theme Designer no longer depends on the extra runtime loader for `megaform-theme-designer-patch.js`
- Host button labels are updated in the HTML source
- Save / Update / Download handlers are attached from the bundled `index.ts`
- `BuildTS -> build.cmd -> pack.cmd` now preserves these changes because they live in the compiled Vite entry

Notes:
- The legacy `Assets/js/megaform-theme-designer-patch.js` file may still exist in the repo, but the host no longer loads it.
- The built runtime is `Assets/js/megaform-theme-designer.js` and is synced to Web/Oqtane by the Vite build plugin.
