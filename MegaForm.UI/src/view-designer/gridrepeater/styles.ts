let injected = false;

export function injectStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const css = `
.mf-grd-shell { display:grid; grid-template-columns:280px minmax(0,1fr); gap:16px; min-height:480px; height:100%; max-height:calc(84vh - 96px); min-height:0; overflow:hidden; }
.mf-grd-pane { min-width:0; min-height:0; }
.mf-grd-main { display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.mf-grd-presets { border-right:1px solid #e5e7eb; padding-right:14px; display:flex; flex-direction:column; gap:10px; overflow:auto; min-height:0; }
.mf-grd-presets h3 { margin:0; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#64748b; }
.mf-grd-help { margin:0; font-size:12px; line-height:1.5; color:#64748b; }
.mf-grd-toolbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.mf-grd-btn { border:1px solid #cbd5e1; background:#fff; color:#334155; border-radius:10px; padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer; }
.mf-grd-btn:hover { border-color:#6366f1; color:#4338ca; }
.mf-grd-summary { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.mf-grd-pill { border:1px solid #cbd5e1; background:#f8fafc; border-radius:999px; padding:5px 10px; font-size:11px; font-weight:700; color:#475569; }
.mf-grd-tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.mf-grd-tab { border:1px solid #cbd5e1; background:#fff; color:#475569; border-radius:999px; padding:7px 12px; font-size:12px; font-weight:700; cursor:pointer; }
.mf-grd-tab.is-active { border-color:#6366f1; background:#eef2ff; color:#4338ca; }
.mf-grd-panels { flex:1 1 auto; min-height:0; overflow:hidden; padding-right:0; }
.mf-grd-panel { display:none; min-height:0; height:100%; }
.mf-grd-panel.is-active { display:block; overflow:auto; padding-right:8px; }
.mf-grd-card { border:1px solid #e2e8f0; background:#fff; border-radius:14px; padding:14px; margin-bottom:12px; }
.mf-grd-card h4 { margin:0 0 6px; font-size:15px; }
.mf-grd-card p { margin:0; color:#64748b; font-size:12px; line-height:1.5; }
.mf-grd-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
.mf-grd-row, .mf-grd-col { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.mf-grd-label { font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:#64748b; }
.mf-grd-input, .mf-grd-select, .mf-grd-textarea { width:100%; border:1px solid #cbd5e1; border-radius:10px; padding:9px 11px; font-size:13px; color:#0f172a; background:#fff; box-sizing:border-box; }
.mf-grd-textarea { min-height:120px; max-height:320px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.mf-grd-inline { display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; }
.mf-grd-note { border:1px solid #dbeafe; background:#f8fbff; color:#1d4ed8; border-radius:12px; padding:10px 12px; font-size:12px; line-height:1.5; margin-bottom:12px; }
.mf-grd-warning { border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:12px; padding:10px 12px; font-size:12px; line-height:1.5; margin-bottom:12px; }
.mf-grd-columns-head { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.mf-grd-column-list { display:flex; flex-direction:column; gap:12px; padding-bottom:20px; }
.mf-grd-column { border:1px solid #e2e8f0; border-radius:14px; padding:12px; background:#fff; }
.mf-grd-column-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.mf-grd-column-title { font-size:13px; font-weight:800; color:#0f172a; }
.mf-grd-column-type { font-size:11px; font-weight:700; color:#6366f1; background:#eef2ff; border-radius:999px; padding:4px 8px; }
.mf-grd-column-del { border:0; background:#fff1f2; color:#be123c; border-radius:10px; padding:6px 9px; cursor:pointer; font-size:12px; font-weight:700; }
.mf-grd-column-del:hover { background:#ffe4e6; }
.mf-grd-json-status { margin-top:8px; font-size:12px; color:#64748b; }
.mf-grd-json-status.is-error { color:#b91c1c; }
.mf-grd-panel.is-active::-webkit-scrollbar, .mf-grd-presets::-webkit-scrollbar { width:10px; }
.mf-grd-panel.is-active::-webkit-scrollbar-thumb, .mf-grd-presets::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:999px; }
.mf-grd-panel.is-active::-webkit-scrollbar-track, .mf-grd-presets::-webkit-scrollbar-track { background:transparent; }
@media (max-width: 980px) {
  .mf-grd-shell { grid-template-columns:1fr; }
  .mf-grd-presets { border-right:0; padding-right:0; border-bottom:1px solid #e5e7eb; padding-bottom:14px; }
  .mf-grd-grid { grid-template-columns:1fr; }
}
`;
  const style = document.createElement('style');
  style.id = 'mf-gridrepeater-designer-styles';
  style.textContent = css;
  document.head.appendChild(style);
}
