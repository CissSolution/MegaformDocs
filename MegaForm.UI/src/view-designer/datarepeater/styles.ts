let stylesInjected = false;

export function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
.mf-drd-shell { display:grid;grid-template-columns:280px minmax(0,1fr);width:100%;height:100% }
.mf-drd-pane { min-width:0;height:100% }
.mf-drd-presets { overflow:auto;padding:16px;background:#f8fafc;border-right:1px solid #e2e8f0 }
.mf-drd-presets h3 { margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-weight:700 }
.mf-drd-presets-help { margin:0 0 14px;font-size:12px;line-height:1.45;color:#64748b }
.mf-drd-preset { display:block;width:100%;text-align:left;padding:13px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer;margin-bottom:10px;transition:all .12s;font-family:inherit }
.mf-drd-preset:hover { border-color:#6366f1;background:#eef2ff }
.mf-drd-preset.is-active { border-color:#6366f1;background:#eef2ff;box-shadow:0 0 0 2px rgba(99,102,241,.12) }
.mf-drd-preset-name { display:block;font-size:13px;font-weight:600;color:#1f2a44;margin-bottom:4px }
.mf-drd-preset-desc { display:block;font-size:11px;color:#64748b;line-height:1.45 }
.mf-drd-main { display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff }
.mf-drd-toolbar { display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid #e2e8f0;background:#fff;flex-shrink:0 }
.mf-drd-summary { display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px 0;flex-shrink:0 }
.mf-drd-pill { display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:11px;color:#475569 }
.mf-drd-pill strong { color:#1f2a44;font-weight:700 }
.mf-drd-tabs { display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px 0;flex-shrink:0 }
.mf-drd-tab { border:1px solid #dbe4f0;background:#fff;color:#475569;border-radius:999px;padding:8px 13px;font-size:12px;font-weight:600;cursor:pointer;transition:all .12s }
.mf-drd-tab:hover { border-color:#94a3b8;background:#f8fafc }
.mf-drd-tab.is-active { border-color:#6366f1;background:#eef2ff;color:#4338ca }
.mf-drd-panels { flex:1;min-height:0;padding:14px 18px 18px }
.mf-drd-panel { display:none;height:100%;overflow:auto;padding-right:2px }
.mf-drd-panel.is-active { display:block }
.mf-drd-panel-head { margin-bottom:14px }
.mf-drd-panel-title { margin:0 0 4px;font-size:15px;font-weight:700;color:#0f172a }
.mf-drd-panel-desc { margin:0;font-size:12px;line-height:1.5;color:#64748b }
.mf-drd-formgrid { display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px }
.mf-drd-field { grid-column:span 12;display:flex;flex-direction:column;gap:6px }
.mf-drd-field.is-half { grid-column:span 6 }
.mf-drd-field.is-third { grid-column:span 4 }
.mf-drd-label { font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700 }
.mf-drd-help { font-size:11px;color:#94a3b8;line-height:1.45 }
.mf-drd-input,
.mf-drd-select,
.mf-drd-textarea { width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#1f2a44;padding:10px 12px;font:inherit;line-height:1.45 }
.mf-drd-input:focus,
.mf-drd-select:focus,
.mf-drd-textarea:focus { outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12) }
.mf-drd-textarea { min-height:120px;resize:vertical;font-family:'Cascadia Code','Consolas',monospace;font-size:12px }
.mf-drd-toggle { display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #dbe4f0;border-radius:12px;background:#fff }
.mf-drd-toggle input { width:16px;height:16px }
.mf-drd-card { border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:14px 14px 16px;margin-bottom:14px }
.mf-drd-card-head { display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px }
.mf-drd-card-title { margin:0;font-size:14px;font-weight:700;color:#0f172a }
.mf-drd-card-badge { display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:11px;color:#475569 }
.mf-drd-callout { padding:12px 13px;border-radius:12px;border:1px solid #dbe4f0;background:#f8fafc;color:#475569;font-size:12px;line-height:1.5;margin-bottom:14px }
.mf-drd-callout strong { color:#1f2a44 }
.mf-drd-callout code { padding:1px 4px;border-radius:4px;background:#e2e8f0;font-family:'Cascadia Code','Consolas',monospace;font-size:11px }
.mf-drd-helpdoc { display:flex;flex-direction:column;gap:14px;min-height:0 }
.mf-drd-helpgrid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px }
.mf-drd-helptext { margin:0 0 10px;font-size:12px;line-height:1.6;color:#475569 }
.mf-drd-ul,
.mf-drd-steps { margin:0;padding-left:18px;color:#475569;font-size:12px;line-height:1.6 }
.mf-drd-ul li,
.mf-drd-steps li { margin:0 0 6px }
.mf-drd-code { margin:0 0 12px;padding:12px 13px;border-radius:12px;border:1px solid #dbe4f0;background:#0f172a;color:#e2e8f0;font-family:'Cascadia Code','Consolas',monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow:auto }
.mf-drd-json-wrap { display:flex;flex-direction:column;gap:10px;height:100% }
.mf-drd-json-toolbar { display:flex;gap:8px;flex-wrap:wrap }
.mf-drd-jsonbox { width:100%;flex:1;min-height:360px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#1f2a44;padding:12px;font-family:'Cascadia Code','Consolas',monospace;font-size:12px;line-height:1.5;resize:vertical;box-sizing:border-box }
.mf-drd-jsonbox:focus { outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12) }
.mf-drd-jsonbox.is-invalid { border-color:#dc2626;background:#fef2f2 }
.mf-drd-json-status { font-size:12px;color:#64748b }
.mf-drd-json-status.is-error { color:#dc2626 }
.mf-drd-statusline { font-size:12px;color:#64748b;padding:0 18px 14px;flex-shrink:0 }
.mf-drd-statusline.is-error { color:#dc2626 }
.mf-drd-toast { position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#15803d;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;z-index:99100;box-shadow:0 8px 24px rgba(15,23,42,.3);animation:mf-drd-in .18s ease-out }
@keyframes mf-drd-in { from { opacity:0;transform:translate(-50%,10px) } to { opacity:1;transform:translate(-50%,0) } }
@media (max-width: 980px) {
  .mf-drd-shell { grid-template-columns:1fr }
  .mf-drd-presets { border-right:0;border-bottom:1px solid #e2e8f0;max-height:220px }
  .mf-drd-helpgrid { grid-template-columns:1fr }
  .mf-drd-field.is-half,
  .mf-drd-field.is-third { grid-column:span 12 }
}
`;
  const style = document.createElement('style');
  style.id = 'mf-datarepeater-designer-styles';
  style.textContent = css;
  document.head.appendChild(style);
}
