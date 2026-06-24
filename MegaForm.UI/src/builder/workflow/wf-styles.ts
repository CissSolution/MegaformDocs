// wf-styles.ts — All CSS for the workflow builder canvas
// Extracted from index.ts for maintainability.
// No imports needed — pure string return.

export function getStyles(): string {
    return [
      // ── Base ─────────────────────────────────────────────────────────────────
      "#mf-wfrf-overlay{font-family:'Inter',system-ui,sans-serif;--wf-border:#e2e8f0;--wf-bg:#ffffff;--wf-muted:#f8fafc;--wf-text:#0f172a;--wf-text2:#64748b;--wf-primary:#0f172a;--wf-primary-fg:#fff;--wf-accent:#6366f1;--wf-green:#16a34a;--wf-radius:8px}",
      ".mf-rf-app{display:flex;flex-direction:column;height:100%;background:#f8fafc;color:var(--wf-text);font-family:Inter,'Geist',system-ui,sans-serif;font-size:13px}",
      ".mf-rf-main{display:flex;flex:1;overflow:hidden;min-height:0;position:relative}.mf-rf-body{display:flex;flex:1;overflow:hidden;position:relative;min-width:0;isolation:isolate}",

      // ── Toolbar — reference style ─────────────────────────────────────────────
      ".mf-rf-toolbar{height:56px;background:#fff;border-bottom:1px solid var(--wf-border);display:flex;align-items:center;justify-content:space-between;padding:0 12px;flex-shrink:0;gap:10px;box-shadow:0 1px 3px rgba(15,23,42,.06);z-index:10}",
      ".mf-rf-toolbar__left{display:flex;align-items:center;gap:10px;min-width:0;flex:1}",
      ".mf-rf-toolbar__center{display:none}",
      ".mf-rf-toolbar__right{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:nowrap}",
      ".mf-rf-toolbar__logo{width:28px;height:28px;border-radius:7px;background:#f1f5f9;border:1px solid var(--wf-border);display:flex;align-items:center;justify-content:center;color:#475569;flex-shrink:0}",
      ".mf-rf-toolbar__name-col{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
      ".mf-rf-toolbar__name-row{display:none}",
      ".mf-rf-toolbar__name-input{font-size:16px;font-weight:700;color:var(--wf-text);border:none;background:transparent;outline:none;padding:0;min-width:160px;max-width:340px}",
      ".mf-rf-toolbar__name-input:focus{color:#4f46e5}",
      ".mf-rf-toolbar__meta{font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".mf-rf-toolbar__id-row{display:none}",
      ".mf-rf-toolbar__id{display:none}",
      ".mf-rf-toolbar__sep{display:none}",
      ".mf-rf-toolbar__zoom{display:none}",
      ".mf-rf-toolbar__unsaved{display:none}",
      ".mf-rf-toolbar__saved{display:none}",

      // Status badges
      ".mf-rf-status-badge{display:none}",
      ".mf-rf-status-badge--draft{background:#fef3c7;border-color:#fcd34d;color:#92400e}",
      ".mf-rf-build-tag{display:none}",
      ".mf-rf-build-tag--internal{display:none}",

      // Toolbar buttons
      ".mf-rf-tb-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--wf-border);background:#fff;color:#374151;transition:background .12s,border-color .12s,box-shadow .12s;white-space:nowrap;flex-shrink:0;height:34px}",
      ".mf-rf-tb-btn:hover{background:#f8fafc;border-color:#cbd5e1;box-shadow:0 1px 4px rgba(15,23,42,.08)}",
      ".mf-rf-tb-btn--primary{background:var(--wf-primary);color:#fff;border-color:var(--wf-primary)}",
      ".mf-rf-tb-btn--primary:hover{background:#1e293b;border-color:#1e293b;box-shadow:0 2px 8px rgba(15,23,42,.2)}",
      ".mf-rf-tb-btn--accent{background:#f5f3ff;color:#6d28d9;border-color:#ddd6fe}",
      ".mf-rf-tb-btn--accent:hover{background:#ede9fe;border-color:#c4b5fd}",
      ".mf-rf-tb-btn--danger{color:#ef4444;border-color:#fca5a5;background:#fff}",
      ".mf-rf-tb-btn--danger:hover{background:#fef2f2}",
      ".mf-rf-tb-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:7px;border:1px solid transparent;background:transparent;color:#64748b;cursor:pointer;transition:background .12s,color .12s;flex-shrink:0}",
      ".mf-rf-tb-icon-btn:hover{background:#f1f5f9;border-color:var(--wf-border);color:#0f172a}",
      ".mf-rf-tb-back-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;border-radius:8px;border:1px solid var(--wf-border);background:#fff;color:#334155;cursor:pointer;transition:background .12s,color .12s,border-color .12s;flex-shrink:0;padding:0 12px;font-size:12px;font-weight:700;white-space:nowrap}",
      ".mf-rf-tb-back-btn:hover{background:#f8fafc;border-color:#cbd5e1;color:#0f172a}",
      ".mf-rf-cfg-btn{padding:6px 11px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--wf-border);background:#fff;color:#374151;transition:background .12s;white-space:nowrap}",
      ".mf-rf-cfg-btn:hover{background:#f8fafc}.mf-rf-cfg-btn--primary{background:var(--wf-primary);color:#fff;border-color:var(--wf-primary)}.mf-rf-cfg-btn--danger{color:#ef4444;border-color:#fca5a5}.mf-rf-cfg-btn--ghost{color:#64748b}.mf-rf-cfg-btn--xs{padding:3px 8px;font-size:11px}",

      // ── Left palette — reference: white, compact ─────────────────────────────
      // ── Left palette — exact reference style ─────────────────────────────────
      ".mf-rf-palette{width:210px;background:#fff;border-right:1px solid var(--wf-border);display:flex;flex-direction:column;gap:0;transition:width .18s ease;overflow-y:auto;flex-shrink:0}",
      ".mf-rf-palette--collapsed{width:52px}",
      ".mf-rf-palette__head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 8px;border-bottom:1px solid var(--wf-border);gap:6px;flex-shrink:0;height:44px}",
      ".mf-rf-palette__head-title{font-size:11px;font-weight:600;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase}",
      ".mf-rf-palette__toggle{width:26px;height:26px;border-radius:6px;border:1px solid var(--wf-border);background:#f8fafc;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:background .1s}",
      ".mf-rf-palette__toggle:hover{background:#f1f5f9;color:#0f172a}",
      // Search box — reference style
      ".mf-rf-palette__search{padding:8px 8px 6px;position:relative;flex-shrink:0}",
      ".mf-rf-palette__search-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none}",
      ".mf-rf-palette__search-input{width:100%;box-sizing:border-box;padding:5px 8px 5px 26px;border:1px solid var(--wf-border);border-radius:6px;font-size:12px;background:#f8fafc;color:var(--wf-text);outline:none;height:30px}",
      ".mf-rf-palette__search-input:focus{border-color:#a5b4fc;background:#fff}",
      ".mf-rf-palette__search-input::placeholder{color:#94a3b8}",
      // Group headers — reference: text-xs font-medium text-muted, hover:bg-muted hover:text-foreground
      ".mf-rf-palette__group{padding:4px 0}",
      ".mf-rf-palette__group-head{display:flex;align-items:center;gap:6px;width:100%;padding:5px 10px;border:none;background:transparent;cursor:pointer;font-size:11px;font-weight:500;color:#64748b;text-align:left;border-radius:6px;transition:background .1s,color .1s;box-sizing:border-box}",
      ".mf-rf-palette__group-head:hover{background:#f1f5f9;color:#0f172a}",
      ".mf-rf-palette__group-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}",
      ".mf-rf-palette__group-label{flex:1;letter-spacing:.01em}",
      ".mf-rf-palette__group-count{font-size:10px;color:#94a3b8;background:#f1f5f9;border-radius:9999px;padding:0 5px;font-weight:600;min-width:16px;text-align:center}",
      // Items — reference: dashed border on hover, bg-muted on hover, smooth transition
      ".mf-rf-palette-item{display:flex;align-items:center;gap:8px;padding:5px 8px;margin:0 4px;cursor:grab;border:1px dashed transparent;border-radius:6px;background:transparent;transition:border-color .15s,background .15s;user-select:none;width:calc(100% - 8px);box-sizing:border-box}",
      ".mf-rf-palette-item:hover{background:#f8fafc;border-color:rgba(99,102,241,.3)}",
      ".mf-rf-palette-item:active{cursor:grabbing;background:#f1f5f9;border-color:rgba(99,102,241,.5)}",
      // Icon — reference: size-6 rounded, bg is light version of accent color
      ".mf-rf-palette-icon{width:24px;height:24px;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;line-height:1}",
      ".mf-rf-palette-label{font-size:12px;font-weight:400;color:#374151;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".mf-rf-palette-count-badge{display:none}", // hidden — reference shows it via count on group head
      ".mf-rf-palette--collapsed .mf-rf-palette-label,.mf-rf-palette--collapsed .mf-rf-palette__group-label,.mf-rf-palette--collapsed .mf-rf-palette__group-dot,.mf-rf-palette--collapsed .mf-rf-palette__group-count{display:none}",
      ".mf-rf-palette--collapsed .mf-rf-palette-item{justify-content:center;padding:7px 0;margin:0;width:100%;border:none}",
      ".mf-rf-palette--collapsed .mf-rf-palette__group-head{justify-content:center;padding:6px 0}",
      ".mf-rf-palette__version-tag{padding:10px 10px 6px;font-size:10px;color:#c0c9d8;margin-top:auto}",

      // ── Canvas ───────────────────────────────────────────────────────────────
      ".mf-rf-canvas{flex:1;min-width:0;position:relative;overflow:hidden;background:#f8fafc;z-index:1}",
      ".mf-rf-zones{position:absolute;inset:0;pointer-events:none;z-index:0;display:flex}.mf-rf-zone{flex:1;position:relative}.mf-rf-zone--nav{background:rgba(238,242,255,.3);border-right:1.5px dashed rgba(165,180,252,.5)}.mf-rf-zone--action{background:rgba(254,243,199,.15)}",
      ".mf-rf-zone__label{position:absolute;top:14px;left:16px;font-size:11px;font-weight:600;letter-spacing:.04em;opacity:.6;pointer-events:none}.mf-rf-zone__label--nav{color:#6366f1}.mf-rf-zone__label--action{color:#d97706}",
      ".mf-rf-canvas .react-flow{z-index:1}.react-flow__edge-path,.react-flow__connection-path{stroke-width:2}.react-flow__edge.selected .react-flow__edge-path{stroke-width:2.5;filter:drop-shadow(0 0 3px rgba(99,102,241,.35))}.react-flow__edge-textbg{fill:#fff;opacity:.9}",

      // ── Nodes — reference: white card, thin top accent border ────────────────
      ".mf-rf-node{width:180px;min-height:60px;border-radius:8px;border:1px solid var(--wf-border);display:flex;flex-direction:column;position:relative;box-shadow:0 1px 3px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.06);transition:box-shadow .15s,transform .15s;cursor:default;background:#fff}",
      ".mf-rf-node:hover{box-shadow:0 4px 12px rgba(15,23,42,.12);transform:translateY(-1px)}",
      ".mf-rf-node--traced{box-shadow:0 0 0 2px rgba(245,158,11,.7)!important;border-color:#f59e0b!important}",
      ".mf-rf-node__accent{height:3px;border-radius:7px 7px 0 0;flex-shrink:0;width:100%}",
      ".mf-rf-node__body{flex:1;padding:10px 12px 10px 10px;display:flex;align-items:center;gap:10px}",
      ".mf-rf-node__body--switch{padding-right:42px}",
      ".mf-rf-node__icon-wrap{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}",
      ".mf-rf-node__icon{font-size:14px}",
      ".mf-rf-node__info{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}",
      ".mf-rf-node__label{font-size:12px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3}",
      ".mf-rf-node__type{font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".mf-rf-node__start-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:800;letter-spacing:.06em;background:var(--wf-primary);color:#fff;padding:2px 8px;border-radius:9999px}",
      ".mf-rf-node__status{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;border:1px solid;flex-shrink:0}",
      ".mf-rf-node__status--ok{background:#dcfce7;border-color:#86efac}.mf-rf-node__status--warn{background:#fef9c3;border-color:#fde047}.mf-rf-node__status--err{background:#fee2e2;border-color:#fca5a5}",
      ".mf-rf-node__disabled{position:absolute;bottom:4px;right:8px;font-size:9px;color:#94a3b8;font-style:italic}",
      ".mf-rf-node--switch{width:222px;min-height:98px;background:transparent;border:none!important;box-shadow:none;isolation:isolate;overflow:visible}",
      ".mf-rf-node--switch::before{content:'';position:absolute;inset:0;background:#fff;border:1px solid var(--wf-border);clip-path:polygon(12% 0,88% 0,100% 50%,88% 100%,12% 100%,0 50%);box-shadow:0 1px 3px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.06);z-index:0}",
      ".mf-rf-node--switch:hover{transform:none;box-shadow:none}",
      ".mf-rf-node--switch:hover::before{box-shadow:0 4px 12px rgba(15,23,42,.12)}",
      ".mf-rf-node--switch.mf-rf-node--sel::before{border-color:#8b5cf6;box-shadow:0 0 0 2px rgba(139,92,246,.20),0 6px 16px rgba(15,23,42,.12)}",
      ".mf-rf-node--switch.mf-rf-node--traced::before{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.55),0 6px 16px rgba(15,23,42,.12)!important}",
      ".mf-rf-node--switch .mf-rf-node__accent{position:absolute;top:0;left:30px;right:32px;height:4px;border-radius:999px;z-index:2}",
      ".mf-rf-node--switch .mf-rf-node__body{position:relative;z-index:2;padding:14px 40px 14px 24px;min-height:94px;align-items:center}",
      ".mf-rf-node--switch .mf-rf-node__label,.mf-rf-node--switch .mf-rf-node__type,.mf-rf-node--switch .mf-rf-node__icon-wrap,.mf-rf-node--switch .mf-rf-node__disabled{position:relative;z-index:2}",
      ".mf-rf-node--switch .mf-rf-handle--in{left:-4px!important;top:50%!important;transform:translateY(-50%)!important}",
      ".mf-rf-node--loop{min-height:70px}",
      ".mf-rf-switch-rail{position:absolute;top:16px;right:10px;bottom:16px;width:26px;display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:8px;z-index:4;pointer-events:none}",
      ".mf-rf-switch-port{position:relative;display:flex;align-items:center;justify-content:flex-end;width:26px;height:18px}",
      ".mf-rf-switch-port__label{width:18px;height:18px;border-radius:6px;background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;line-height:1;box-shadow:0 1px 2px rgba(15,23,42,.08);margin:0 8px 0 0}",
      ".mf-rf-switch-port__handle{pointer-events:auto}",
      ".mf-rf-node--switch::after{content:'';position:absolute;top:14px;bottom:14px;right:22px;width:1px;background:rgba(124,58,237,.22);z-index:2}",
      ".mf-rf-loop-rail{position:relative}",
      ".mf-rf-loop-port{position:absolute;bottom:6px;display:flex;align-items:center;justify-content:center;width:18px;height:16px;transform:translateX(-50%);pointer-events:none}",
      ".mf-rf-loop-port--loop{left:35%}.mf-rf-loop-port--done{left:65%}",
      ".mf-rf-loop-port__label{position:absolute;bottom:7px;min-width:14px;height:14px;border-radius:999px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;line-height:1;box-shadow:0 1px 2px rgba(15,23,42,.08)}",
      ".mf-rf-loop-port--done .mf-rf-loop-port__label{background:#f8fafc;color:#475569;border-color:#cbd5e1}",
      ".mf-rf-loop-port .mf-rf-handle{pointer-events:auto}",
      ".mf-rf-handle{width:10px!important;height:10px!important;border:2px solid!important;background:#fff!important;border-radius:50%!important}.mf-rf-handle--in{border-color:#cbd5e1!important;left:-5px!important}.mf-rf-handle--out{border-color:#6366f1!important;right:-5px!important}.mf-rf-handle--true{border-color:#22c55e!important;bottom:-5px!important}.mf-rf-handle--false{border-color:#ef4444!important;bottom:-5px!important}",

      // ── Right panel ──────────────────────────────────────────────────────────
      ".mf-rf-sidepanel-host{position:relative;display:flex;flex:0 0 auto;height:100%;width:56px;min-width:56px;max-width:640px;z-index:20;pointer-events:auto;transition:width .18s ease,min-width .18s ease;border-left:1px solid var(--wf-border);background:#fff}",
      ".mf-rf-sidepanel{width:100%;height:100%;background:#fff;display:flex;flex-direction:column;flex-shrink:0;position:relative;z-index:40;isolation:isolate;pointer-events:auto}",
      ".mf-rf-sidepanel--collapsed{align-items:center;padding-top:10px;background:#fff}",
      ".mf-rf-sidepanel__peek,.mf-rf-sidepanel__peek-tab{width:36px;height:36px;border-radius:8px;border:1px solid var(--wf-border);background:#f8fafc;cursor:pointer;color:#475569;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;padding:0;transition:background .12s,color .12s,border-color .12s;position:relative;z-index:80;pointer-events:auto}",
      ".mf-rf-sidepanel__peek:hover{background:#f1f5f9;color:#0f172a;border-color:#cbd5e1}",
      ".mf-rf-sidepanel__peek-tab.is-active{background:#eef2ff;color:#4f46e5;border-color:#c7d2fe}",
      ".mf-rf-sidepanel__peek-tab:hover:not(.is-active){background:#f1f5f9;color:#0f172a}",
      ".mf-rf-sidepanel__topbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--wf-border);background:#fff;flex-shrink:0;position:relative;z-index:70}",
      ".mf-rf-sidepanel__headline{display:flex;flex-direction:column;gap:2px}",
      ".mf-rf-sidepanel__title{font-size:12px;font-weight:700;color:#0f172a}",
      ".mf-rf-sidepanel__subtitle{font-size:11px;color:#64748b;max-width:240px;line-height:1.4}",
      ".mf-rf-sidepanel__collapse{width:32px;height:32px;border-radius:8px;border:1px solid var(--wf-border);background:#f8fafc;cursor:pointer;color:#64748b;display:flex;align-items:center;justify-content:center;padding:0;transition:background .12s,color .12s;position:relative;z-index:80;pointer-events:auto}",
      ".mf-rf-sidepanel__collapse:hover{background:#f1f5f9;color:#0f172a;border-color:#cbd5e1}",
      ".mf-rf-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:240px;margin:18px;border:1px dashed #dbe4f0;border-radius:16px;background:linear-gradient(180deg,#fcfdff 0%,#f8fafc 100%);padding:28px 22px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}",
      ".mf-rf-empty-state__emoji{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:#eef2ff;border:1px solid #c7d2fe;font-size:28px;box-shadow:0 10px 24px rgba(99,102,241,.12)}",
      ".mf-rf-empty-state__title{font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-.01em}",
      ".mf-rf-empty-state__body{max-width:300px;font-size:12px;line-height:1.65;color:#64748b}",
      ".mf-rf-right-panel{flex:1;min-height:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;position:relative;z-index:41;pointer-events:auto}",

      // Right tabs — reference style
      ".mf-rf-right-tabs{display:flex;border-bottom:1px solid var(--wf-border);background:#fff;flex-shrink:0;padding:0 8px;gap:0}",
      ".mf-rf-right-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 8px;border:none;border-bottom:2px solid transparent;background:transparent;cursor:pointer;font-size:11.5px;font-weight:600;color:#64748b;margin-bottom:-1px;transition:color .12s,border-color .12s}",
      ".mf-rf-right-tab:hover{color:#374151}",
      ".mf-rf-right-tab--active{color:#6366f1;border-bottom-color:#6366f1}",
      ".mf-rf-right-tab__icon{width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;flex-shrink:0}",
      ".mf-rf-right-tab__label{letter-spacing:.01em}",
      ".mf-rf-right-tab__badge{background:#6366f1;color:#fff;font-size:9px;font-weight:800;border-radius:20px;padding:1px 5px;min-width:16px;text-align:center}",
      ".mf-rf-right-body{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#e2e8f0 transparent;position:relative;z-index:31;pointer-events:auto;padding:0 0 16px}",

      // Config panel
      ".mf-rf-config{display:flex;flex-direction:column;height:100%;gap:0}",
      ".mf-rf-config__header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--wf-border);background:#fff;flex-shrink:0;position:sticky;top:0;z-index:2}",
      ".mf-rf-config__body{padding:14px 14px 20px;overflow:auto;flex:1}",
      ".mf-rf-config__type{font-size:13px;font-weight:700;color:#0f172a}",
      ".mf-rf-config__id{font-size:11px;color:#94a3b8;background:#f1f5f9;padding:1px 6px;border-radius:5px;font-family:monospace}",
      ".mf-rf-config__actions{display:flex;gap:8px;margin-top:14px}",
      ".mf-rf-config-section{border:1px solid var(--wf-border);border-radius:8px;background:#fff;overflow:hidden;margin-bottom:12px}",
      ".mf-rf-config-section__head{padding:10px 12px;border-bottom:1px solid #f1f5f9;background:#f8fafc}",
      ".mf-rf-config-section__title{font-size:11px;font-weight:700;color:#0f172a;letter-spacing:.04em;text-transform:uppercase}",
      ".mf-rf-config-section__hint{margin-top:3px;font-size:11px;color:#64748b;line-height:1.4}",
      ".mf-rf-config-section__body{padding:10px 12px}",

      // Form fields in panel
      ".mf-rf-cfg-field{margin-bottom:12px}",
      ".mf-rf-cfg-label{display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}",
      ".mf-rf-cfg-input{width:100%;box-sizing:border-box;border:1px solid var(--wf-border);border-radius:6px;padding:8px 10px;font-size:12px;background:#fff;color:#111827;outline:none;transition:border-color .12s,box-shadow .12s}",
      ".mf-rf-cfg-input:focus{border-color:#a5b4fc;box-shadow:0 0 0 2px rgba(165,180,252,.2)}",
      ".mf-rf-cfg-textarea{resize:vertical;min-height:90px}.mf-rf-cfg-check{display:flex;align-items:center;gap:8px;font-size:12px;color:#334155;margin:10px 0}.mf-rf-radio{display:inline-flex;align-items:center;gap:6px;margin-right:12px;font-size:12px;color:#334155}",

      // Misc
      ".mf-rf-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}.mf-rf-row2--stackable{grid-template-columns:1fr 1fr}.mf-rf-row2--header{grid-template-columns:160px minmax(0,1fr) auto}.mf-rf-row2--triple{grid-template-columns:repeat(3,minmax(0,1fr))}",
      ".mf-rf-input-with-picker{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:start}.mf-rf-picker{position:relative}.mf-rf-picker__btn{width:32px;height:32px;border-radius:6px;border:1px solid var(--wf-border);background:#fff;cursor:pointer;color:#64748b}.mf-rf-picker__btn:hover{background:#f1f5f9}.mf-rf-picker__menu{position:absolute;right:0;top:36px;z-index:20;min-width:220px;max-height:260px;overflow:auto;background:#fff;border:1px solid var(--wf-border);border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.12);padding:4px 0}.mf-rf-picker__section-label{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.07em;text-transform:uppercase;padding:5px 8px 2px;display:block}.mf-rf-picker__item{display:block;width:100%;text-align:left;padding:5px 8px;border:0;background:transparent;border-radius:4px;font-size:11px;cursor:pointer;font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-rf-picker__item:hover{background:#f1f5f9;color:#4f46e5}.mf-rf-picker__item--sys{color:#0ea5e9}.mf-rf-picker__item--sys:hover{background:#e0f2fe;color:#0369a1}",
      ".mf-rf-helper-card{background:#f8fafc;border:1px solid var(--wf-border);border-radius:8px;padding:10px 12px;font-size:11px;color:#64748b;line-height:1.6;margin-bottom:12px}.mf-rf-helper-card strong{display:block;color:#334155;margin-bottom:3px}.mf-rf-meta-chip{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:10px;font-weight:700;border:1px solid #c7d2fe}",
      ".mf-rf-empty-inline{padding:8px 10px;border:1px dashed #dbe2ea;border-radius:8px;background:#f8fafc;font-size:11px;color:#64748b;margin-bottom:8px}",
      ".mf-rf-config-wrap{padding:14px}",
      ".mf-rf-config-card{background:#fff;border:1px solid var(--wf-border);border-radius:12px;box-shadow:0 4px 16px rgba(15,23,42,.06);overflow:hidden}",
      ".mf-rf-card-head{padding:14px 14px 10px;border-bottom:1px solid var(--wf-border);background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)}",
      ".mf-rf-card-head__title{font-size:14px;font-weight:800;color:#0f172a}",
      ".mf-rf-card-head__subtitle{margin-top:4px;font-size:12px;line-height:1.45;color:#64748b}",
      ".mf-rf-kv-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px}",
      ".mf-rf-kv{border:1px solid var(--wf-border);border-radius:10px;background:#f8fafc;padding:10px 12px;min-width:0}",
      ".mf-rf-kv--full{grid-column:1 / -1}",
      ".mf-rf-kv__label{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px}",
      ".mf-rf-kv__value{font-size:12px;font-weight:600;line-height:1.5;color:#0f172a;word-break:break-word}",
      ".mf-rf-card-actions{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:0 14px 14px}",
      ".mf-rf-card-actions__hint{font-size:11px;line-height:1.5;color:#64748b}",
      ".mf-rf-cond-group{padding:10px;border:1px solid var(--wf-border);border-radius:8px;background:#f8fafc;margin-bottom:10px}.mf-rf-cond-group__head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.mf-rf-cond-rule{padding:10px;border:1px dashed #dbe2ea;border-radius:6px;background:#fff;margin-bottom:8px}",
      ".mf-rf-inline-actions{display:flex;gap:6px}",
      ".mf-rf-var-row{border:1px solid var(--wf-border);border-radius:8px;padding:10px;margin-bottom:8px;background:#f8fafc}.mf-rf-var-row__head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.mf-rf-var-name{flex:1;font-size:12px;font-weight:700;color:#1e293b;font-family:monospace}.mf-rf-var-badge{font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}.mf-rf-var-badge--number{background:#dbeafe;color:#1d4ed8}.mf-rf-var-badge--string{background:#dcfce7;color:#15803d}.mf-rf-var-badge--boolean{background:#fef9c3;color:#854d0e}",
      ".mf-rf-map-card{padding:10px;border:1px solid var(--wf-border);border-radius:8px;background:#f8fafc;margin-bottom:8px}",
      ".mf-rf-map-grid{display:flex;flex-direction:column;border:1px solid var(--wf-border);border-radius:12px;overflow:hidden;background:#fff}",
      ".mf-rf-map-grid__head,.mf-rf-map-grid__row{display:grid;grid-template-columns:minmax(150px,1.05fr) minmax(128px,.8fr) minmax(0,1.6fr);gap:10px;align-items:start}",
      ".mf-rf-map-grid__head{padding:10px 12px;background:#f8fafc;border-bottom:1px solid var(--wf-border);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b}",
      ".mf-rf-map-grid__row{padding:12px;border-top:1px solid #f1f5f9}",
      ".mf-rf-map-grid__row:first-of-type{border-top:none}",
      ".mf-rf-map-grid__cell{min-width:0}",
      ".mf-rf-map-grid__cell--type .mf-rf-cfg-input{min-width:120px}",
      ".mf-rf-map-grid__field-title{font-size:13px;font-weight:700;color:#0f172a;line-height:1.35}",
      ".mf-rf-map-grid__field-key{margin-top:4px;font-size:11px;color:#64748b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word}",
      ".mf-rf-map-review{display:flex;flex-direction:column;border:1px solid var(--wf-border);border-radius:12px;overflow:hidden;background:#fff}.mf-rf-map-review__head,.mf-rf-map-review__row{display:grid;grid-template-columns:minmax(160px,220px) 1fr;gap:12px;align-items:start}.mf-rf-map-review__head--triple,.mf-rf-map-review__row--triple{grid-template-columns:minmax(160px,220px) minmax(150px,180px) minmax(0,1fr)}.mf-rf-map-review__head{padding:10px 12px;background:#f8fafc;border-bottom:1px solid var(--wf-border);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b}.mf-rf-map-review__row{padding:12px;border-top:1px solid #f1f5f9}.mf-rf-map-review__row:first-of-type{border-top:none}.mf-rf-map-review__target{min-width:0}.mf-rf-map-review__target-label{font-size:12px;font-weight:700;color:#0f172a}.mf-rf-map-review__target-key{margin-top:4px;font-size:11px;color:#64748b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word}.mf-rf-map-review__type,.mf-rf-map-review__value{min-width:0}.mf-rf-map-review__value{display:flex;gap:8px;align-items:center;min-width:0}.mf-rf-map-review__value--stack{flex-direction:column;align-items:stretch}.mf-rf-map-review__value .mf-rf-cfg-input,.mf-rf-map-review__type .mf-rf-cfg-input{width:100%}.mf-rf-map-review__status{font-size:11px;color:#64748b}.mf-rf-sql-preview{border:1px solid #dbeafe;background:#f8fbff;border-radius:12px;padding:12px 14px}.mf-rf-sql-preview__title{font-size:12px;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}.mf-rf-sql-preview__code{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}",
      ".mf-rf-token{display:inline-block;padding:1px 6px;border-radius:9999px;background:#eef2ff;color:#4f46e5;font-weight:700;font-size:11px}",

      "@media (max-width: 920px){.mf-rf-map-grid__head{display:none}.mf-rf-map-grid__row{grid-template-columns:1fr;gap:8px}.mf-rf-map-grid__cell--type,.mf-rf-map-grid__cell--value{padding-top:0}.mf-rf-map-review__head{display:none}.mf-rf-map-review__row,.mf-rf-map-review__row--triple{grid-template-columns:1fr;gap:8px}}",
      // Email composer
      ".mf-rf-email-shell{display:flex;flex-direction:column;gap:12px}.mf-rf-email-shell__toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin-bottom:2px}.mf-rf-email-shell__toolbar--card{padding:10px;border:1px solid var(--wf-border);border-radius:8px;background:#fff}.mf-rf-email-shell__group{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mf-rf-email-shell__group--wrap{flex:1}.mf-rf-email-shell__label{font-size:11px;font-weight:700;color:#475569}.mf-rf-cfg-input--sm{min-width:160px;padding:6px 8px;font-size:12px}.mf-rf-chip-btn{border:1px solid var(--wf-border);background:#fff;border-radius:9999px;padding:5px 10px;font-size:11px;font-weight:600;color:#475569;cursor:pointer}.mf-rf-chip-btn:hover{border-color:#a5b4fc;color:#4338ca;background:#eef2ff}",
      ".mf-rf-email-editor{border:1px solid var(--wf-border);border-radius:8px;background:#fff;overflow:hidden}.mf-rf-email-editor__meta{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:#f8fafc;border-bottom:1px solid var(--wf-border);font-size:11px;color:#64748b}.mf-rf-email-editor__textarea{border:0!important;border-radius:0!important;min-height:160px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5}.mf-rf-email-editor__actions{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 10px;border-top:1px solid var(--wf-border);background:#fff}",
      ".mf-rf-email-preview-shell{border:1px solid var(--wf-border);border-radius:8px;background:#fff;overflow:hidden}.mf-rf-email-preview-shell__head{padding:10px 12px;background:#f8fafc;border-bottom:1px solid var(--wf-border)}.mf-rf-email-preview-shell__subject{font-size:13px;font-weight:700;color:#0f172a}.mf-rf-email-preview-shell__to{margin-top:3px;font-size:11px;color:#64748b}.mf-rf-email-preview{background:#fff;padding:10px;font-size:12px;line-height:1.6;color:#334155;max-height:200px;overflow:auto}",

      // Empty state
      ".mf-rf-empty-hint{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 16px;text-align:center;color:#94a3b8;height:100%;gap:6px}.mf-rf-empty-hint p{margin:4px 0;font-size:13px;font-weight:600;color:#64748b}.mf-rf-empty-hint small{font-size:11px;color:#94a3b8;max-width:200px;line-height:1.5}",

      // Test run
      ".mf-rf-testrun{position:absolute;left:220px;right:340px;bottom:12px;background:#fff;border:1px solid var(--wf-border);border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12);overflow:hidden;z-index:12}.mf-rf-testrun--ok{border-color:#bbf7d0}.mf-rf-testrun--err{border-color:#fecaca}.mf-rf-testrun__header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;font-weight:700;font-size:12px;background:#f8fafc;border-bottom:1px solid var(--wf-border)}.mf-rf-testrun__close{border:0;background:transparent;cursor:pointer;color:#64748b}.mf-rf-testrun__err-msg{padding:8px 12px;color:#b91c1c;font-size:12px}.mf-rf-testrun__log{max-height:200px;overflow:auto}.mf-rf-testrun table{width:100%;border-collapse:collapse}.mf-rf-testrun th,.mf-rf-testrun td{padding:7px 10px;border-top:1px solid var(--wf-border);font-size:12px;text-align:left}.mf-rf-log--ok td{background:#f0fdf4}.mf-rf-log--err td{background:#fef2f2}",

      // Toast + Minimap
      ".mf-rf-runtime-badge{position:fixed;left:16px;bottom:16px;z-index:10000;pointer-events:none;display:inline-flex;align-items:center;gap:6px;max-width:calc(100vw - 180px);padding:6px 10px;border-radius:999px;border:1px solid rgba(99,102,241,.26);background:rgba(255,255,255,.96);box-shadow:0 10px 28px rgba(15,23,42,.14);font-size:11px;font-weight:800;letter-spacing:.03em;color:#4338ca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mf-rf-toast{position:fixed;right:16px;bottom:16px;z-index:9999;background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;font-size:12px;font-weight:500;box-shadow:0 8px 24px rgba(15,23,42,.2);max-width:420px;word-break:break-word}.mf-rf-toast--err{background:#b91c1c}",

      // ── Palette groups count badge ───────────────────────────────────────────
      ".mf-rf-palette__group-count{font-size:10px;color:#94a3b8;background:#f1f5f9;border-radius:9999px;padding:0px 5px;font-weight:600;margin-left:auto;margin-right:4px}",

      // ── Email composer — reference exact ─────────────────────────────────────
      ".mf-rf-email-compose{display:flex;flex-direction:column;gap:0}",
      ".mf-rf-email-compose__header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:1px solid var(--wf-border)}",
      ".mf-rf-email-compose__title{font-size:10px;font-weight:800;letter-spacing:.1em;color:#94a3b8;text-transform:uppercase}",
      ".mf-rf-email-preview-toggle{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#64748b;background:transparent;border:1px solid var(--wf-border);border-radius:6px;padding:4px 8px;cursor:pointer;transition:all .12s}",
      ".mf-rf-email-preview-toggle:hover,.mf-rf-email-preview-toggle.is-active{color:#4f46e5;border-color:#a5b4fc;background:#eef2ff}",
      ".mf-rf-email-row{display:flex;align-items:center;padding:0 14px;border-bottom:1px solid var(--wf-border);min-height:36px;gap:8px}",
      ".mf-rf-email-row__label{font-size:11px;font-weight:600;color:#64748b;width:52px;flex-shrink:0}",
      ".mf-rf-email-row__input-wrap{display:flex;align-items:center;flex:1;gap:4px;min-width:0}",
      ".mf-rf-email-row__input{flex:1;border:none;outline:none;font-size:12px;color:#0f172a;background:transparent;padding:0;min-width:0}",
      ".mf-rf-email-row__input::placeholder{color:#94a3b8}",
      ".mf-rf-email-toolbar{display:flex;align-items:center;gap:1px;padding:6px 10px;border-bottom:1px solid var(--wf-border);background:#f8fafc}",
      ".mf-rf-email-tb-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;border-radius:5px;border:none;background:transparent;color:#475569;cursor:pointer;font-size:12px;font-weight:700;transition:background .1s}",
      ".mf-rf-email-tb-btn:hover{background:#e2e8f0;color:#0f172a}",
      ".mf-rf-email-tb-btn--token{width:auto;padding:0 4px}",
      ".mf-rf-email-body{width:100%;box-sizing:border-box;border:none;outline:none;resize:none;font-family:'Courier New',ui-monospace,monospace;font-size:12px;line-height:1.7;color:#334155;padding:14px;background:#fff;min-height:200px}",
      ".mf-rf-email-body::placeholder{color:#94a3b8}",
      // Preview mode
      ".mf-rf-email-preview-panel{display:flex;flex-direction:column}",
      ".mf-rf-email-preview-panel__header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:1px solid var(--wf-border)}",
      ".mf-rf-email-preview-panel__subject{font-size:13px;font-weight:700;color:#0f172a}",
      ".mf-rf-email-preview-panel__meta{display:flex;align-items:baseline;gap:8px;padding:6px 14px;border-bottom:1px solid #f1f5f9}",
      ".mf-rf-email-preview-panel__label{font-size:11px;font-weight:600;color:#64748b;width:52px;flex-shrink:0}",
      ".mf-rf-email-preview-panel__value{font-size:12px;color:#0f172a}",
      ".mf-rf-email-preview-panel__body{padding:14px;font-size:12px;line-height:1.7;color:#334155;white-space:pre-wrap;font-family:'Courier New',monospace;overflow:auto;flex:1}",

      // ── Custom Minimap ────────────────────────────────────────────────────────
      ".mf-rf-minimap{background:#fff;border:1px solid var(--wf-border);border-radius:10px;box-shadow:0 4px 16px rgba(15,23,42,.12);overflow:hidden;width:168px;user-select:none}",
      ".mf-rf-minimap__header{display:flex;align-items:center;justify-content:space-between;padding:7px 10px 6px;background:#f8fafc;border-bottom:1px solid var(--wf-border);cursor:grab}",
      ".mf-rf-minimap__title{font-size:11px;font-weight:700;color:#64748b;letter-spacing:.04em}",
      ".mf-rf-minimap__close{background:transparent;border:none;font-size:15px;color:#94a3b8;cursor:pointer;line-height:1;padding:0 2px}",
      ".mf-rf-minimap__close:hover{color:#0f172a}",
      ".mf-rf-minimap__canvas{background:#f8fafc;position:relative}",
      ".mf-rf-minimap__node{position:absolute;width:8px;height:8px;border-radius:50%;transform:translate(-50%,-50%)}",
      ".mf-rf-minimap__reopen{position:absolute;bottom:12px;right:12px;width:32px;height:32px;border-radius:8px;border:1px solid var(--wf-border);background:#fff;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(15,23,42,.08);z-index:20}",
      ".mf-rf-minimap__reopen:hover{background:#f1f5f9;color:#0f172a}",

      // ── Variables panel ───────────────────────────────────────────────────────
      ".mf-rf-vars-panel{display:flex;flex-direction:column;height:100%}",
      ".mf-rf-vars-panel__head{padding:14px 14px 10px;border-bottom:1px solid var(--wf-border);flex-shrink:0}",
      ".mf-rf-vars-panel__head>span:first-child{display:block;font-size:12px;font-weight:700;color:#0f172a;line-height:1.4}",
      ".mf-rf-vars-panel__sub{display:block;font-size:11px;color:#64748b;margin-top:3px;line-height:1.4}",
      ".mf-rf-vars-list{flex:1;overflow-y:auto;padding:10px 12px 0;scrollbar-width:thin;scrollbar-color:#e2e8f0 transparent}",
      ".mf-rf-vars-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px 16px;text-align:center;flex:1}",
      ".mf-rf-var-row{border:1px solid var(--wf-border);border-radius:8px;margin-bottom:8px;background:#fff;overflow:hidden}",
      ".mf-rf-var-row.is-editing{border-color:#a5b4fc;box-shadow:0 0 0 2px rgba(165,180,252,.2)}",
      ".mf-rf-var-row__summary{display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer;user-select:none;transition:background .1s}",
      ".mf-rf-var-row__summary:hover{background:#f8fafc}",
      ".mf-rf-var-row__key{flex:1;font-size:12px;font-weight:700;color:#1e293b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".mf-rf-var-row__type{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#dbeafe;color:#1d4ed8;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}",
      ".mf-rf-var-row__del{width:22px;height:22px;border:none;background:transparent;color:#94a3b8;cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0;padding:0;transition:background .1s,color .1s}",
      ".mf-rf-var-row__del:hover{background:#fee2e2;color:#ef4444}",
      ".mf-rf-var-row__form{padding:10px 12px 12px;border-top:1px solid var(--wf-border);background:#f8fafc;display:flex;flex-direction:column;gap:8px}",
      ".mf-rf-vars-add-btn{display:block;margin:10px 12px 14px;padding:9px 12px;border:1.5px dashed #a5b4fc;border-radius:8px;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:600;cursor:pointer;text-align:center;transition:background .12s,border-color .12s;width:calc(100% - 24px);box-sizing:border-box}",
      ".mf-rf-vars-add-btn:hover{background:#e0e7ff;border-color:#818cf8}",

      // ── Panel resizer (drag handle between canvas and right panel) ────────────
      ".mf-rf-panel-resizer{position:absolute;left:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:30;background:transparent;transition:background .15s}",
      ".mf-rf-panel-resizer:hover,.mf-rf-panel-resizer:active{background:rgba(99,102,241,.4)}",

      // ── Issues Panel (persistent docked validation feedback) ──────────────
      ".mf-rf-issues-panel{background:#fff;border-top:1px solid var(--wf-border);flex-shrink:0;display:flex;flex-direction:column;max-height:220px;z-index:10}",
      ".mf-rf-issues-panel__head{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#f8fafc;border-bottom:1px solid var(--wf-border);flex-shrink:0;gap:8px}",
      ".mf-rf-issues-panel__title{font-size:11px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".mf-rf-issues-panel__source{font-weight:400;color:#64748b}",
      ".mf-rf-issues-panel__time{font-weight:400;color:#94a3b8;font-size:10px}",
      ".mf-rf-issues-panel__actions{display:flex;align-items:center;gap:4px;flex-shrink:0}",
      ".mf-rf-issues-panel__clear,.mf-rf-issues-panel__collapse{border:none;background:transparent;cursor:pointer;font-size:11px;color:#64748b;padding:2px 6px;border-radius:4px;transition:background .1s}",
      ".mf-rf-issues-panel__clear:hover,.mf-rf-issues-panel__collapse:hover{background:#e2e8f0;color:#0f172a}",
      ".mf-rf-issues-panel__body{overflow-y:auto;flex:1;scrollbar-width:thin;scrollbar-color:#e2e8f0 transparent}",
      ".mf-rf-issues-panel__empty{padding:10px 14px;font-size:12px;color:#22c55e;font-weight:500}",
      ".mf-rf-issue-row{display:flex;align-items:flex-start;gap:8px;padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:11.5px;transition:background .1s}",
      ".mf-rf-issue-row--error .mf-rf-issue-row__icon{color:#ef4444}",
      ".mf-rf-issue-row--warning .mf-rf-issue-row__icon{color:#f59e0b}",
      ".mf-rf-issue-row--info .mf-rf-issue-row__icon{color:#3b82f6}",
      ".mf-rf-issue-row--error{background:#fff5f5}",
      ".mf-rf-issue-row--warning{background:#fffbeb}",
      ".mf-rf-issue-row--clickable{cursor:pointer}",
      ".mf-rf-issue-row--clickable:hover{background:#f1f5f9}",
      ".mf-rf-issue-row__icon{font-size:12px;flex-shrink:0;margin-top:1px;width:14px;text-align:center}",
      ".mf-rf-issue-row__content{flex:1;min-width:0;line-height:1.5;color:#334155}",
      ".mf-rf-issue-row__node{font-weight:700;color:#0f172a;font-family:ui-monospace,monospace;font-size:11px}",
      ".mf-rf-issue-row__field{color:#64748b;font-family:ui-monospace,monospace;font-size:11px}",
      ".mf-rf-issue-row__msg{color:#334155}",
      ".mf-rf-issue-row__go{font-size:12px;color:#94a3b8;flex-shrink:0;margin-top:1px}",
      // Collapsed bar
      ".mf-rf-issues-bar{display:flex;align-items:center;gap:6px;padding:5px 12px;background:#f8fafc;border-top:1px solid var(--wf-border);cursor:pointer;flex-shrink:0;transition:background .1s}",
      ".mf-rf-issues-bar:hover{background:#f1f5f9}",
      ".mf-rf-issues-bar--collapsed{}",
      ".mf-rf-issues-bar__label{font-size:11px;font-weight:600;color:#64748b}",
      ".mf-rf-issues-badge{font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;min-width:18px;text-align:center}",
      ".mf-rf-issues-badge--err{background:#fee2e2;color:#ef4444}",
      ".mf-rf-issues-badge--warn{background:#fef9c3;color:#92400e}",
      ".mf-rf-issues-badge--ok{background:#dcfce7;color:#16a34a}",

      // ── Responsive
      "@media(max-width:1280px){.mf-rf-palette{width:180px}.mf-rf-sidepanel-host{max-width:50vw}.mf-rf-toolbar{padding:0 10px}.mf-rf-toolbar__right{gap:6px}.mf-rf-tb-btn{padding:7px 10px}}",
      "@media(max-width:1000px){.mf-rf-palette{width:56px}.mf-rf-palette .mf-rf-palette-label,.mf-rf-palette .mf-rf-palette__group-label,.mf-rf-palette .mf-rf-palette__head-title{display:none}.mf-rf-palette .mf-rf-palette-item{justify-content:center}.mf-rf-right-tab__label{display:none}}"
    ].join('');
  }


+'.mf-rf-tokenboard{display:flex;flex-wrap:wrap;gap:8px}'
+'.mf-rf-tokenboard__chip{display:inline-flex;align-items:center;gap:6px;padding:4px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}'
+'.mf-rf-tokenboard__chip--sys{background:#f8fafc}'
+'.mf-rf-tokenboard__token{border:0;background:transparent;padding:4px 6px;border-radius:8px;font:600 12px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#334155;cursor:pointer}'
+'.mf-rf-tokenboard__copy{border:1px solid #e2e8f0;background:#fff;padding:4px 8px;border-radius:8px;font:600 11px/1.2 Inter,system-ui,sans-serif;color:#475569;cursor:pointer}'
