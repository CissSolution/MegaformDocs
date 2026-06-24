// ============================================================
// MegaForm Admin Live — Shell style overrides
// TS-owned visual polish so the panel can evolve without hand-editing JS/CSS
// ============================================================

const STYLE_ID = 'mf-le-shell-overrides';

export function ensureLiveEditorShellStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .mf-le-panel{
    right:-468px !important;
    width:468px !important;
    max-width:min(96vw,468px) !important;
    background:#fff !important;
    border-left:1px solid #dbe4f0 !important;
    box-shadow:-24px 0 56px rgba(15,23,42,.18) !important;
  }
  .mf-le-panel.open{right:0 !important;}
  .mf-le-header{padding:14px 16px !important;}
  .mf-le-actions{
    flex-wrap:wrap !important;
    align-items:center !important;
    gap:8px !important;
    padding:12px 14px !important;
  }
  .mf-le-btn{
    border-radius:10px !important;
    padding:8px 11px !important;
    font-size:11px !important;
    line-height:1.1 !important;
  }
  .mf-le-btn-edit{margin-left:0 !important;}
  .mf-le-tabs{
    padding:0 6px !important;
    gap:2px !important;
    background:#fff !important;
  }
  .mf-le-tab{
    min-width:0 !important;
    padding:10px 6px 9px !important;
    border-bottom-width:2px !important;
    border-radius:0 !important;
  }
  .mf-le-tab span{white-space:nowrap !important;}
  .mf-le-body{
    background:#f8fafc !important;
    padding:14px !important;
  }
  .mf-le-pane.active{
    display:flex !important;
    flex-direction:column !important;
    gap:12px !important;
    min-height:100% !important;
  }
  .mf-le-section{
    margin:0 0 12px !important;
    padding:12px !important;
    border:1px solid #e5e7eb !important;
    border-radius:16px !important;
    background:#fff !important;
    box-shadow:0 4px 18px rgba(15,23,42,.05) !important;
  }
  .mf-le-section + .mf-le-section{
    margin-top:0 !important;
    padding-top:12px !important;
    border-top:1px solid #e5e7eb !important;
  }
  .mf-le-section-title{
    margin-bottom:10px !important;
    padding-bottom:0 !important;
    border-bottom:none !important;
    font-size:10px !important;
    color:#64748b !important;
  }
  .mf-le-row,
  .mf-le-row-col{
    margin-bottom:10px !important;
    gap:6px !important;
  }
  .mf-le-row{
    display:grid !important;
    grid-template-columns:minmax(0,1fr) !important;
    align-items:start !important;
  }
  .mf-le-label{
    font-size:11px !important;
    font-weight:800 !important;
    color:#334155 !important;
  }
  .mf-le-label small{
    font-size:10px !important;
    line-height:1.4 !important;
  }
  .mf-le-input,
  .mf-le-select,
  .mf-le-color-text{
    min-height:36px !important;
    border-radius:12px !important;
    border-color:#dbe4f0 !important;
    box-sizing:border-box !important;
  }
  .mf-le-color-picker{
    width:36px !important;
    height:36px !important;
    border-radius:12px !important;
  }
  .mf-le-range-wrap{gap:10px !important;}
  .mf-le-font-preview{
    border-radius:12px !important;
    min-height:42px !important;
    display:flex !important;
    align-items:center !important;
  }
  .mf-le-theme-grid{gap:8px !important;}
  .mf-le-swatch{
    border-radius:14px !important;
    padding:10px 6px 8px !important;
  }
  .mf-le-pane-footer{
    position:sticky !important;
    bottom:0 !important;
    z-index:2 !important;
  }
  @media (max-width: 640px){
    .mf-le-panel{
      width:100vw !important;
      right:-100vw !important;
      max-width:100vw !important;
    }
    .mf-le-actions{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}
    .mf-le-btn{justify-content:center !important;}
  }
  `;
  document.head.appendChild(style);
}
