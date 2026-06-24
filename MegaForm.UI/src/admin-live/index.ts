// ============================================================
// MegaForm Admin Live Style Editor — Entry Point
// Bundled as IIFE: megaform-admin-live.js
// Loaded only when user is admin (FormView.ascx.cs)
// ============================================================

import { LiveEditor } from './LiveEditor';
import { LiveCssInspector } from './cssInspector';

// Self-initialize once DOM is ready
function bootstrap(): void {
  const editor = new LiveEditor();
  editor.init();
  // Expose for debugging
  (window as unknown as Record<string, unknown>)['MegaFormLiveEditor'] = editor;
  (window as unknown as Record<string, unknown>)['__MF_LIVE_EDITOR_BADGE__'] = LiveEditor.BADGE;
  (window as unknown as Record<string, unknown>)['__MF_LIVE_CSS_INSPECTOR_BADGE__'] = LiveCssInspector.BADGE;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
