Blank handoff + gallery thumbnail fixes

Changes included:
- Blank Template now clears gallery preview UI state before entering builder.
- Blank Template now forces a fresh canvas interaction rebind after rendering, so Row/Columns accept drops reliably without disturbing the existing stable template-loading path.
- Template Gallery custom HTML thumbnail rendering now sanitizes embedded preview HTML more aggressively before writing into iframe srcdoc, reducing sandbox script warnings without enabling allow-scripts.

Files touched:
- MegaForm.UI/src/builder/gallery.ts
- MegaForm.UI/src/builder/canvas.ts
- MegaForm.UI/src/builder/panels.ts
- Assets/js/bundles/megaform-builder.js
