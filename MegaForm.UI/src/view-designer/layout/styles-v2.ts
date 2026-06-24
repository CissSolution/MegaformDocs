/**
 * Layout Designer v2 — CSS
 *
 * Scope: `.mfldv2-*`. Self-contained so it can run alongside the v1 styles
 * during migration.
 *
 * Visual style is inspired by Umbraco Block Grid editor: clean white
 * canvas, subtle dotted drop zones, soft drop shadows, indigo accents.
 */

let injected = false;

export function injectStylesV2(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'mfldv2-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
/* ───────────────── Shell ───────────────── */
.mfldv2-shell{display:grid;grid-template-columns:260px 1fr 340px;height:100%;min-height:520px;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.mfldv2-shell.is-welcome{display:block}
.mfldv2-shell.is-welcome .mfldv2-main{height:100%}
/* Grid cells need to be flex containers themselves so the tray/inspector
   panels inside them can size their scrollable bodies correctly. */
.mfldv2-shell > div{display:flex;flex-direction:column;min-height:0;min-width:0}
.mfldv2-tray,.mfldv2-inspector{flex:1;min-height:0;height:100%}
.mfldv2-shell *{box-sizing:border-box}
.mfldv2-main{display:flex;flex-direction:column;min-width:0;overflow:hidden}

/* ───────────────── Toolbar ───────────────── */
.mfldv2-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#fff;flex-wrap:wrap}
.mfldv2-toolbar-title{font-size:13px;font-weight:600;color:#475569;margin-right:auto;display:flex;align-items:center;gap:8px}
.mfldv2-toolbar-title-tag{font-size:10px;background:#eef2ff;color:#6366f1;padding:2px 6px;border-radius:4px;letter-spacing:.04em}
.mfldv2-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;font-size:12px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;cursor:pointer;color:#334155;transition:all .12s}
.mfldv2-btn:hover{border-color:#6366f1;color:#4338ca}
.mfldv2-btn.is-primary{background:#6366f1;color:#fff;border-color:#6366f1}
.mfldv2-btn.is-primary:hover{background:#4f46e5}
.mfldv2-btn.is-ghost{background:transparent;border-color:transparent;color:#64748b}
.mfldv2-btn.is-ghost:hover{background:#f1f5f9;color:#0f172a}

/* ───────────────── Tray (left) ───────────────── */
.mfldv2-tray{background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;min-height:0}
.mfldv2-tray-head{padding:14px;border-bottom:1px solid #e2e8f0;display:flex;flex-direction:column;gap:8px}
.mfldv2-tray-head strong{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#475569}
.mfldv2-tray-filter{padding:6px 10px;border:1px solid #e2e8f0;border-radius:7px;font-size:12px;outline:none}
.mfldv2-tray-filter:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}
.mfldv2-tray-body{flex:1;overflow:auto;padding:10px 8px}
.mfldv2-tray-group{margin-bottom:14px}
.mfldv2-tray-grouphead{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;padding:4px 8px;font-weight:700;display:flex;align-items:center;gap:6px}
.mfldv2-tray-item{display:flex;align-items:center;gap:10px;padding:8px 10px;margin:4px 0;border-radius:8px;border:1px solid transparent;background:#fff;cursor:grab;transition:all .12s}
.mfldv2-tray-item:hover{background:#f8fafc;border-color:#e2e8f0;box-shadow:0 2px 8px rgba(15,23,42,.06)}
.mfldv2-tray-item.is-dragging{opacity:.4}
.mfldv2-tray-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.mfldv2-tray-meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.mfldv2-tray-label{font-size:12px;font-weight:600;color:#0f172a}
.mfldv2-tray-desc{font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.35}
.mfldv2-tray-add{width:24px;height:24px;border-radius:6px;border:1px dashed #cbd5e1;background:#fff;color:#64748b;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center}
.mfldv2-tray-add:hover{border-color:#6366f1;color:#6366f1;border-style:solid}
.mfldv2-tray-noresults{padding:20px;text-align:center;color:#94a3b8;font-size:12px}

/* ───────────────── Canvas (center) ───────────────── */
.mfldv2-canvas{flex:1;overflow:auto;padding:20px;background:#f8fafc}
.mfldv2-zone{margin-bottom:18px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
.mfldv2-zone-head{padding:10px 14px;border-bottom:1px solid #f1f5f9;background:#fafbfc;display:flex;align-items:baseline;gap:10px}
.mfldv2-zone-label{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#475569;font-weight:700}
.mfldv2-zone-hint{font-size:11px;color:#94a3b8}
.mfldv2-zone-body{padding:12px;min-height:60px;display:flex;flex-direction:column;gap:8px;transition:background .15s}
.mfldv2-zone-body.is-dropover{background:rgba(99,102,241,.06);outline:2px dashed #6366f1;outline-offset:-6px}
.mfldv2-zone-empty{padding:18px;text-align:center;color:#94a3b8;font-size:12px;border:1px dashed #e2e8f0;border-radius:8px;background:#fafafa}
.mfldv2-zone-loophint{font-size:11px;color:#64748b;padding:6px 10px;background:#eef2ff;border-radius:6px;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px}

/* ───────────────── Block card ───────────────── */
.mfldv2-block-card{border:1px solid #e2e8f0;border-radius:10px;background:#fff;overflow:hidden;transition:all .12s;cursor:grab}
.mfldv2-block-card:hover{border-color:#cbd5e1;box-shadow:0 4px 12px rgba(15,23,42,.06)}
.mfldv2-block-card.is-selected{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
.mfldv2-block-card.is-dragging{opacity:.5}
.mfldv2-block-bar{display:flex;align-items:center;gap:8px;padding:7px 10px;background:#fafbfc;border-bottom:1px solid #f1f5f9;font-size:12px}
.mfldv2-block-grip{color:#cbd5e1;cursor:grab;font-size:10px}
.mfldv2-block-icon{font-size:12px;width:18px;text-align:center}
.mfldv2-block-name{font-weight:600;color:#334155;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mfldv2-block-spacer{flex:1}
.mfldv2-block-act{width:24px;height:24px;border-radius:5px;border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center}
.mfldv2-block-act:hover{background:#f1f5f9;color:#334155}
.mfldv2-block-act-del:hover{background:#fef2f2;color:#dc2626}
.mfldv2-block-preview{padding:12px;background:#fff;font-size:13px;min-height:30px}
.mfldv2-block-preview *{max-width:100%}

/* ───────────────── Inspector (right) ───────────────── */
.mfldv2-inspector{background:#fff;border-left:1px solid #e2e8f0;display:flex;flex-direction:column;min-height:0}
.mfldv2-inspector-head{padding:14px;border-bottom:1px solid #e2e8f0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#475569}
.mfldv2-inspector-body{flex:1;overflow:auto;padding:14px}
.mfldv2-inspector-empty{padding:24px 14px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.5;background:#fafafa;border:1px dashed #e2e8f0;border-radius:8px}
.mfldv2-inspector-blockhead{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:12px;background:#fafbfc;border-radius:8px}
.mfldv2-inspector-blockicon{font-size:18px}
.mfldv2-inspector-blocklabel{font-size:13px;font-weight:600;color:#0f172a}
.mfldv2-inspector-blockdesc{font-size:11px;color:#94a3b8;line-height:1.35}
.mfldv2-inspector-advanced{margin-top:18px;padding:10px 12px;background:#fef9e7;border:1px solid #fde68a;border-radius:8px}
.mfldv2-inspector-advanced summary{font-size:12px;font-weight:600;color:#92400e;cursor:pointer;outline:none}
.mfldv2-inspector-advanced[open]{padding-bottom:14px}
.mfldv2-inspector-advanced-note{font-size:11px;color:#a16207;margin:6px 0 8px;line-height:1.45}
.mfldv2-inspector-advanced-ta{width:100%;font-family:Menlo,Consolas,monospace;font-size:11px;padding:8px;border:1px solid #fde68a;border-radius:6px;background:#fff;resize:vertical}

/* ───────────────── Form (inline-form.ts) ───────────────── */
.mfldv2-form{display:flex;flex-direction:column;gap:14px}
.mfldv2-form-section{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
.mfldv2-form-legend{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;padding:0;margin-bottom:2px}
.mfldv2-form-row{display:flex;flex-direction:column;gap:4px}
.mfldv2-form-label{font-size:11px;font-weight:600;color:#475569}
.mfldv2-form-input,.mfldv2-form-select,.mfldv2-form-textarea{font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;outline:none;background:#fff;color:#0f172a;width:100%}
.mfldv2-form-input:focus,.mfldv2-form-select:focus,.mfldv2-form-textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
.mfldv2-form-textarea{resize:vertical;min-height:60px;font-family:Menlo,Consolas,monospace}
.mfldv2-form-help{font-size:10px;color:#94a3b8;line-height:1.4}
.mfldv2-form-color{display:flex;gap:6px;align-items:center}
.mfldv2-form-color-swatch{width:34px;height:30px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;background:transparent}
.mfldv2-form-check{display:flex;align-items:center;gap:8px;font-size:12px;color:#334155;cursor:pointer}
.mfldv2-form-token{display:flex;flex-direction:column;gap:6px}
.mfldv2-form-chips{display:flex;flex-wrap:wrap;gap:4px}
.mfldv2-form-chip{font-family:Menlo,Consolas,monospace;font-size:10px;padding:3px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;cursor:pointer;transition:all .12s}
.mfldv2-form-chip:hover{background:#6366f1;color:#fff;border-color:#6366f1}

/* ───────────────── Welcome (template picker) ───────────────── */
.mfldv2-welcome{height:100%;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:40px 30px;overflow:auto}
.mfldv2-welcome-wrap{max-width:900px;width:100%;display:flex;flex-direction:column;gap:24px}
.mfldv2-welcome-head{text-align:center}
.mfldv2-welcome-title{margin:0 0 8px;font-size:22px;color:#0f172a;font-weight:700}
.mfldv2-welcome-sub{margin:0;font-size:13px;color:#64748b;line-height:1.5}
.mfldv2-welcome-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.mfldv2-welcome-card{display:flex;flex-direction:column;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;cursor:pointer;transition:all .18s;padding:0;font-family:inherit}
.mfldv2-welcome-card:hover{border-color:#6366f1;transform:translateY(-2px);box-shadow:0 8px 24px rgba(15,23,42,.08)}
.mfldv2-welcome-thumb{background:#f1f5f9;height:130px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.mfldv2-welcome-thumb svg{width:100%;height:100%;display:block}
.mfldv2-welcome-meta{padding:14px;display:flex;flex-direction:column;gap:4px}
.mfldv2-welcome-label{font-size:14px;font-weight:600;color:#0f172a}
.mfldv2-welcome-desc{font-size:12px;color:#64748b;line-height:1.4}
.mfldv2-welcome-foot{text-align:center}
.mfldv2-welcome-link{background:transparent;border:0;color:#6366f1;font-size:12px;cursor:pointer;text-decoration:underline}
@media(max-width:700px){.mfldv2-welcome-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* ───────────────── Mock bar ───────────────── */
.mfldv2-mockbar{padding:8px 14px;font-size:11px;color:#64748b;background:#fafbfc;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:10px}
.mfldv2-mockbar.is-error{color:#dc2626;background:#fef2f2;border-color:#fecaca}
.mfldv2-mockbar strong{color:#0f172a;font-weight:600}
`;
