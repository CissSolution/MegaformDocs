/**
 * Layout Designer — one-time CSS injection.
 *
 * Style scope: `.mf-ld-*`. We deliberately don't reuse `.mf-vd-*` to avoid
 * colliding with the popup chrome from shared.ts. Anything inside the
 * designer body must stay inside `.mf-ld-shell` to be styled.
 */

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'mf-layout-designer-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
.mf-ld-shell { display:grid;grid-template-columns:240px 1fr 320px;width:100%;height:100%;min-height:0;background:#f8fafc }
.mf-ld-tray { background:#fff;border-right:1px solid #e2e8f0;padding:12px 12px 24px;overflow:auto;min-width:0 }
.mf-ld-tray h4 { margin:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700 }
.mf-ld-tray h4:first-child { margin-top:0 }
.mf-ld-tray-search { width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;margin-bottom:6px }
.mf-ld-block-item { padding:8px 10px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:grab;font-size:12px;display:flex;align-items:center;gap:8px;line-height:1.3;transition:all .12s }
.mf-ld-block-item:hover { border-color:#6366f1;background:#fafbff;box-shadow:0 1px 4px rgba(99,102,241,.12) }
.mf-ld-block-item:active { cursor:grabbing }
.mf-ld-block-item.is-custom { border-style:dashed }
.mf-ld-block-name { flex:1;font-weight:600;color:#1f2a44;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.mf-ld-block-cat { font-size:9px;color:#94a3b8;background:#f1f5f9;border-radius:4px;padding:2px 6px;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0 }
.mf-ld-block-del { background:transparent;border:0;color:#ef4444;cursor:pointer;font-size:14px;padding:0 4px;opacity:.5 }
.mf-ld-block-del:hover { opacity:1 }
.mf-ld-tray-help { font-size:11px;color:#64748b;line-height:1.4;margin-top:8px }

.mf-ld-canvas-wrap { display:flex;flex-direction:column;min-height:0;background:#f1f5f9;overflow:hidden }
.mf-ld-toolbar { padding:10px 16px;display:flex;align-items:center;gap:8px;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0 }
.mf-ld-mode-toggle { display:inline-flex;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden }
.mf-ld-mode-toggle button { padding:6px 14px;border:0;background:#fff;font-size:12px;cursor:pointer;color:#64748b;border-right:1px solid #e2e8f0 }
.mf-ld-mode-toggle button:last-child { border-right:0 }
.mf-ld-mode-toggle button.is-active { background:#6366f1;color:#fff;font-weight:600 }
.mf-ld-toolbar .mf-ld-spacer { flex:1 }
.mf-ld-toolbar button.mf-ld-btn { padding:6px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;font-size:12px;cursor:pointer;color:#1f2a44 }
.mf-ld-toolbar button.mf-ld-btn:hover { background:#f1f5f9 }
.mf-ld-banner { padding:6px 16px;background:#fef3c7;color:#92400e;font-size:11px;border-bottom:1px solid #fcd34d }
.mf-ld-banner.is-error { background:#fee2e2;color:#991b1b;border-bottom-color:#fecaca }

.mf-ld-canvas-body { flex:1;min-height:0;display:grid;overflow:hidden }
.mf-ld-canvas-body.is-visual { grid-template-columns:1fr }
.mf-ld-canvas-body.is-split { grid-template-columns:1fr 1fr;gap:1px;background:#e2e8f0 }
.mf-ld-canvas-body.is-code { grid-template-columns:1fr }

.mf-ld-canvas { overflow:auto;padding:18px;background:#fff;display:flex;flex-direction:column;gap:14px }
.mf-ld-zone { border:2px dashed #cbd5e1;border-radius:10px;padding:12px;min-height:80px;background:#fafbfd;position:relative;transition:all .12s }
.mf-ld-zone.is-over { border-color:#6366f1;background:#eef2ff }
.mf-ld-zone-label { position:absolute;top:-9px;left:14px;background:#fff;padding:0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700 }
.mf-ld-zone-empty { color:#94a3b8;font-size:12px;font-style:italic;text-align:center;padding:20px }
.mf-ld-zone-loop-hint { font-size:10px;color:#0f766e;font-weight:600;background:#ccfbf1;padding:2px 6px;border-radius:999px;margin-left:8px }
.mf-ld-block { position:relative;border:1px solid #e2e8f0;border-radius:8px;background:#fff;margin-bottom:8px;overflow:hidden;transition:all .12s }
.mf-ld-block:last-child { margin-bottom:0 }
.mf-ld-block.is-selected { border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.18) }
.mf-ld-block-head { padding:6px 10px;display:flex;align-items:center;gap:8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;cursor:move;font-size:11px }
.mf-ld-block-head-label { flex:1;font-weight:600;color:#1f2a44 }
.mf-ld-block-head-action { background:transparent;border:0;color:#64748b;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:12px }
.mf-ld-block-head-action:hover { background:#e2e8f0 }
.mf-ld-block-head-action.is-del { color:#ef4444 }
.mf-ld-block-body { padding:10px;font-size:13px;color:#0f172a;background:#fff }
.mf-ld-block-body * { max-width:100% }
.mf-ld-block-body img { max-height:120px;object-fit:cover }

.mf-ld-code { overflow:hidden;display:flex;flex-direction:column;background:#0f172a }
.mf-ld-code-head { padding:6px 12px;font-size:11px;color:#94a3b8;background:#1e293b;border-bottom:1px solid #334155;flex-shrink:0;display:flex;align-items:center;gap:8px }
.mf-ld-code-head .mf-ld-code-warn { color:#fbbf24 }
.mf-ld-code-textarea { flex:1;border:0;background:#0f172a;color:#e2e8f0;font-family:'Cascadia Code','Consolas',monospace;font-size:12px;line-height:1.55;padding:14px;resize:none;outline:none;min-height:0 }

.mf-ld-inspector { background:#fff;border-left:1px solid #e2e8f0;padding:14px 14px 24px;overflow:auto;min-width:0 }
.mf-ld-inspector h4 { margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700 }
.mf-ld-inspector p { font-size:12px;color:#475569;line-height:1.45;margin:0 0 12px }
.mf-ld-inspector .mf-ld-row { display:grid;gap:4px;margin-bottom:10px }
.mf-ld-inspector label { font-size:11px;font-weight:600;color:#475569 }
.mf-ld-inspector input,
.mf-ld-inspector select,
.mf-ld-inspector textarea { width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;background:#fff }
.mf-ld-inspector textarea { font-family:'Cascadia Code','Consolas',monospace;min-height:90px;resize:vertical }
.mf-ld-inspector .mf-ld-save-block { margin-top:14px;width:100%;padding:8px 12px;background:#6366f1;color:#fff;border:0;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer }
.mf-ld-inspector .mf-ld-save-block:hover { background:#4f46e5 }
.mf-ld-inspector .mf-ld-save-block:disabled { background:#a5b4fc;cursor:not-allowed }

.mf-ld-mock { background:#fff;border-top:1px solid #e2e8f0;padding:8px 16px;display:flex;align-items:center;gap:8px;font-size:11px;color:#64748b;flex-shrink:0 }
.mf-ld-mock strong { color:#0f172a }
.mf-ld-mock button { margin-left:auto;padding:5px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;font-size:11px }
.mf-ld-mock button:hover { background:#f1f5f9 }
.mf-ld-mock.is-error { color:#b91c1c;background:#fef2f2 }

/* Render preview inline within the canvas blocks — match runtime styling so
   admins see something close to the rendered output. */
.mf-ld-block-body .mf-grid-title { margin:0;font-size:18px;color:#0f172a }
.mf-ld-block-body .mf-grid-portal-hint { font-size:11px;color:#94a3b8;font-weight:400;margin-left:6px }
.mf-ld-block-body .mf-grid-search { display:flex;gap:6px }
.mf-ld-block-body .mf-grid-search-input { flex:1;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px }
.mf-ld-block-body .mf-grid-search-btn { padding:5px 12px;border:1px solid #6366f1;background:#6366f1;color:#fff;border-radius:6px;cursor:pointer;font-size:12px }
.mf-ld-block-body .mf-grid-actions,
.mf-ld-block-body .mf-grid-filters { display:flex;gap:6px;flex-wrap:wrap }
.mf-ld-block-body .mf-grid-btn,
.mf-ld-block-body .mf-grid-pill { padding:5px 10px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;font-size:12px;text-decoration:none;color:#1f2a44 }
.mf-ld-block-body .mf-grid-btn-primary { background:#6366f1;border-color:#6366f1;color:#fff }
.mf-ld-block-body .mf-grid-card { border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#fafbfd }
.mf-ld-block-body .mf-grid-card-title { margin:0 0 4px;font-size:13px }
.mf-ld-block-body .mf-grid-card-body { margin:0;font-size:11px;color:#475569 }
.mf-ld-block-body .mf-grid-media { display:flex;gap:10px;align-items:flex-start }
.mf-ld-block-body .mf-grid-media-img { width:80px;height:54px;object-fit:cover;border-radius:6px;flex-shrink:0 }
.mf-ld-block-body .mf-grid-media-title { font-weight:600;color:#1f2a44 }
.mf-ld-block-body .mf-grid-list-item { display:flex;justify-content:space-between;align-items:baseline;gap:8px;list-style:none;padding:6px 0;border-bottom:1px dashed #e2e8f0 }
.mf-ld-block-body .mf-grid-pager { display:flex;justify-content:center;gap:10px;font-size:12px;color:#475569 }
.mf-ld-block-body .mf-grid-pager-info { font-size:11px;color:#64748b }
.mf-ld-block-body .mf-grid-empty { text-align:center;padding:14px;color:#64748b }
`;
