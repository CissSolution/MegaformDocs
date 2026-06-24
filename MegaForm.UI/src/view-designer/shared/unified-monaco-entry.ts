// ============================================================
// MegaForm View Designer — Unified Monaco entry (v20260602-B41)
// File: src/view-designer/shared/unified-monaco-entry.ts
//
// Standalone Vite entry that bundles the monaco-editor package
// + the MegaForm Monaco adapter. Builds to:
//   Assets/js/megaform-unified-monaco.js
//
// Why a dedicated entry?
//   monaco-editor weighs ~5 MB raw (~150 KB gz). With vite.config's
//   `inlineDynamicImports: true` + `format: 'iife'`, any `await
//   import('monaco-editor')` inside another entry (e.g. the builder
//   bundle, or any widget launcher that pulls in monaco-editor-adapter
//   via dynamic import) would otherwise be inlined into THAT entry's
//   single IIFE — bloating megaform-builder.js to >5 MB.
//
//   By giving Monaco its own entry AND marking `monaco-editor` as
//   external for every other entry, the dynamic import inside the
//   builder bundle no longer pulls Monaco's source — it becomes a
//   runtime reference. Launchers that need Monaco lazy-load THIS
//   bundle via <script> injection (mirroring the MFLayoutDesigner
//   pattern used by DynamicLabel) and the adapter then talks to the
//   `monaco-editor` namespace via the global `MegaFormMonaco` handle
//   exposed below.
//
// Public surface — the module exports both the adapter `mountMonacoEditor`
// helper and the raw `monaco-editor` namespace as `monaco`. Callers can
// either import the bundle as ES (when used inside another bundler) or
// rely on the IIFE-side-effect that publishes `window.MegaFormMonaco`.
// ============================================================
// @ts-nocheck
'use strict';

import * as monaco from 'monaco-editor';
import { mountMonacoEditor } from './monaco-editor-adapter';

// Re-export so downstream ES consumers can import * from this entry.
export { monaco, mountMonacoEditor };

// Publish a global handle so the IIFE side-effect satisfies the
// `monaco-editor` external declared in vite.config.ts for every other
// entry. The `globals` option there maps the bare specifier
// `monaco-editor` → `MegaFormMonaco`, so once this bundle has loaded,
// any sibling IIFE that referenced `import 'monaco-editor'` will find
// the namespace under window.MegaFormMonaco at runtime.
declare const window: any;
if (typeof window !== 'undefined') {
  window.MegaFormMonaco = monaco;
  // Convenience helper — mirrors the MFLayoutDesigner pattern, lets
  // the adapter (or the BYOM "Source" tab) await a ready-promise
  // instead of polling for the global.
  if (!window.__mfMonacoReady) {
    window.__mfMonacoReady = Promise.resolve(monaco);
  }
}
