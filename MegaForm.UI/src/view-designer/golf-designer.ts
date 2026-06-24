/**
 * MegaForm Golf Scorecard Designer — popup with preset gallery + live JSON
 * editor + live preview pane.
 *
 * Output bundle:  Assets/js/megaform-golf-designer.js
 * Entry:          window.MFGolfDesigner.open({ initialJson, onApply })
 *
 * Cross-platform: same bundle works on Oqtane / DNN / Web. Reuses popup
 * chrome from view-designer/shared.ts (no duplication). Preview pane calls
 * window.MFGolfScorecard.renderers.* — the SAME renderer functions used at
 * runtime, so what admins see in the preview matches the live form exactly
 * (single source of truth).
 *
 * Design tenets per project rules:
 *   - Canonical TS only (this file is the source; bundles are derived).
 *   - No new "vars" — everything goes through the existing widget Config JSON
 *     contract (CustomCSS, CustomHTML, displayMode, dataSource, options).
 *   - Lazy-loadable: `window.MFGolfDesigner.open()` works on first call;
 *     embed via plain <script src="megaform-golf-designer.js">.
 *   - No coupling to host: writes JSON to clipboard + invokes optional
 *     onApply(json) callback. Admins paste into the widget's Config JSON.
 *
 * Badge: GolfDesigner v20260504-01
 */

import { h, openPopup, htmlEscape, type PopupHandle } from './shared';

const BADGE = 'GolfDesigner v20260504-01';
if (typeof window !== 'undefined') (window as any).__MF_GOLF_DESIGNER_BADGE__ = BADGE;

export interface GolfDesignerOpts {
  initialJson?: string;                          // current widget Config JSON, if any
  onApply?: (json: string) => void;              // host callback when admin clicks Apply
}

interface GsHostApi {
  listPresets: () => { key: string; label: string; mode: string }[];
  loadPreset:  (key: string) => string;
  importConfig: (raw: string) => any;
  renderers:   {
    foursome:  (data: any, opts: any) => string;
    scorecard: (data: any) => string;
    template:  (data: any, tpl: string) => string;
  };
  getSampleData: (mode: string) => any;
}

function getHost(): GsHostApi | null {
  return (window as any).MFGolfScorecard || null;
}

// One-time CSS injection (scoped to .mf-gd-*) — kept tight per MINIMAL CHANGE
// rule and the project's "no random vars" guidance. Reuses shared popup
// chrome from view-designer/shared.ts; only adds the 3-pane grid + tile
// gallery + JSON-editor specifics.
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
.mf-gd-grid { display:grid;grid-template-columns:260px 1fr 1fr;width:100%;height:100% }
.mf-gd-pane { overflow:auto;padding:14px 16px;background:#fff }
.mf-gd-pane.mf-gd-presets { background:#f8fafc;border-right:1px solid #e2e8f0 }
.mf-gd-pane.mf-gd-editor  { border-right:1px solid #e2e8f0 }
.mf-gd-pane.mf-gd-preview { background:#fafafa }
.mf-gd-pane h3 { margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-weight:700 }
.mf-gd-tile { display:block;width:100%;text-align:left;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;margin-bottom:8px;transition:all .12s;font-family:inherit }
.mf-gd-tile:hover { border-color:#6366f1;background:#eef2ff }
.mf-gd-tile.is-active { border-color:#6366f1;background:#eef2ff;box-shadow:0 0 0 2px rgba(99,102,241,.15) }
.mf-gd-tile-name { display:block;font-size:13px;font-weight:600;color:#1f2a44;margin-bottom:3px }
.mf-gd-tile-mode { display:inline-block;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;background:#f1f5f9;color:#64748b;padding:2px 6px;border-radius:4px }
.mf-gd-toolbar { display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap }
.mf-gd-toolbar .mf-vd-btn { padding:6px 12px;font-size:12px }
.mf-gd-jsonbox { width:100%;height:calc(100% - 110px);min-height:240px;font-family:'Cascadia Code','Consolas',monospace;font-size:12px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#fff;color:#1f2a44;line-height:1.5;resize:none;box-sizing:border-box }
.mf-gd-jsonbox:focus { outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15) }
.mf-gd-jsonbox.is-invalid { border-color:#dc2626;background:#fef2f2 }
.mf-gd-status { font-size:11px;color:#64748b;padding:4px 0;display:flex;align-items:center;gap:6px }
.mf-gd-status.is-ok    { color:#15803d }
.mf-gd-status.is-err   { color:#dc2626 }
.mf-gd-status .mf-gd-dot { width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block }
.mf-gd-preview-frame { background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;min-height:300px;overflow:auto;box-shadow:0 1px 3px rgba(15,23,42,.04) }
.mf-gd-preview-empty { color:#94a3b8;font-style:italic;font-size:12px;padding:20px;text-align:center }
.mf-gd-toast { position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#15803d;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;z-index:99100;box-shadow:0 8px 24px rgba(15,23,42,.3);animation:mf-gd-in .2s ease-out }
@keyframes mf-gd-in { from{opacity:0;transform:translate(-50%,10px)} to{opacity:1;transform:translate(-50%,0)} }
`;
  document.head.appendChild(h('style', { id: 'mf-golf-designer-styles', html: css }));
}

function showToast(msg: string, kind: 'ok' | 'err' = 'ok'): void {
  const t = h('div', { class: 'mf-gd-toast', style: kind === 'err' ? { background: '#dc2626' } : undefined }, msg);
  document.body.appendChild(t);
  setTimeout(() => { try { t.remove(); } catch {/*noop*/} }, 2200);
}

export function open(opts: GolfDesignerOpts = {}): void {
  injectStyles();
  const host = getHost();
  if (!host) {
    alert('Golf Scorecard widget bundle not loaded. Make sure megaform-widget-golf-scorecard.js is included on the page.');
    return;
  }

  // ── State ───────────────────────────────────────────────────────────────
  let currentJson = (opts.initialJson || '').trim() || host.loadPreset('foursome-stableford');
  let activePresetKey = '';
  // Try to detect which preset matches the current JSON
  try {
    const parsed = JSON.parse(currentJson);
    const presets = host.listPresets();
    for (const p of presets) {
      const presetParsed = JSON.parse(host.loadPreset(p.key));
      if (presetParsed.displayMode === parsed.displayMode && presetParsed.title === parsed.title) {
        activePresetKey = p.key; break;
      }
    }
  } catch { /* ignore */ }

  // ── Build panes ─────────────────────────────────────────────────────────
  const presetsPane = h('div', { class: 'mf-gd-pane mf-gd-presets' }, h('h3', {}, 'Starter presets'));
  const editorPane  = h('div', { class: 'mf-gd-pane mf-gd-editor'  }, h('h3', {}, 'Config JSON'));
  const previewPane = h('div', { class: 'mf-gd-pane mf-gd-preview' }, h('h3', {}, 'Live preview'));

  // Editor pane controls
  const statusEl = h('div', { class: 'mf-gd-status is-ok' }, h('span', { class: 'mf-gd-dot' }), h('span', {}, 'Valid JSON'));
  const jsonBox = h('textarea', {
    class: 'mf-gd-jsonbox',
    spellcheck: 'false',
    oninput: () => {
      currentJson = (jsonBox as HTMLTextAreaElement).value;
      validateAndPreview();
    },
  }) as HTMLTextAreaElement;
  jsonBox.value = currentJson;

  const toolbar = h('div', { class: 'mf-gd-toolbar' },
    h('button', {
      class: 'mf-vd-btn', title: 'Import JSON from a file (.json) — works on any browser',
      onclick: () => {
        // [ImportFilePicker v20260504-10] Synchronous user-gesture file pick.
        // Opens an OS file dialog; on selection FileReader reads UTF-8 text
        // into the JSON editor + runs validateAndPreview. Append + click
        // happen inside the same event tick to satisfy Chromium's
        // user-gesture requirement for programmatic file inputs.
        console.log('[golf-designer] Import button clicked');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.style.position = 'fixed';
        input.style.left    = '-10000px';
        input.style.top     = '-10000px';
        input.style.opacity = '0';
        input.addEventListener('change', () => {
          const f = input.files && input.files[0];
          console.log('[golf-designer] file picked:', f && f.name, f && f.size);
          if (!f) { try { input.remove(); } catch {/*noop*/} return; }
          const reader = new FileReader();
          reader.onload = () => {
            const txt = String(reader.result || '');
            if (!txt.trim()) { showToast('File is empty.', 'err'); try { input.remove(); } catch {/*noop*/} return; }
            jsonBox.value = txt;
            currentJson = txt;
            validateAndPreview();
            showToast('Imported ' + f.name);
            try { input.remove(); } catch {/*noop*/}
          };
          reader.onerror = () => { showToast('Could not read file.', 'err'); try { input.remove(); } catch {/*noop*/} };
          reader.readAsText(f, 'utf-8');
        });
        document.body.appendChild(input);
        input.click();
        console.log('[golf-designer] input.click() invoked — OS dialog should be opening');
        // Cleanup if user dismisses without picking
        setTimeout(() => { try { if (!input.files || !input.files.length) input.remove(); } catch (_e) { /* ignore */ } }, 30000);
      },
    }, '\u{1F4E5} Import'),
    h('button', {
      class: 'mf-vd-btn', title: 'Copy current JSON to clipboard',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(jsonBox.value || '');
          showToast('JSON copied to clipboard.');
        } catch {
          // Fallback: select + execCommand
          jsonBox.select(); document.execCommand('copy');
          showToast('JSON copied (fallback).');
        }
      },
    }, '\u{1F4CB} Copy'),
    h('button', {
      class: 'mf-vd-btn', title: 'Download JSON as a file',
      onclick: () => {
        const blob = new Blob([jsonBox.value || ''], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'golf-scorecard-config.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    }, '\u{1F4BE} Export'),
    h('button', {
      class: 'mf-vd-btn', title: 'Pretty-print the JSON',
      onclick: () => {
        try {
          const obj = JSON.parse(jsonBox.value || '{}');
          jsonBox.value = JSON.stringify(obj, null, 2);
          currentJson = jsonBox.value;
          validateAndPreview();
        } catch { showToast('Cannot format — JSON is invalid.', 'err'); }
      },
    }, '\u{2728} Format'),
  );

  editorPane.append(toolbar, jsonBox, statusEl);

  // Preview pane
  const previewFrame = h('div', { class: 'mf-gd-preview-frame' });
  previewPane.appendChild(previewFrame);

  // ── Validate + render preview using the SAME engine as runtime ──────────
  function validateAndPreview(): void {
    let parsed: any = null;
    let parseErr: string | null = null;
    try { parsed = JSON.parse(jsonBox.value || '{}'); }
    catch (e) { parseErr = (e instanceof Error ? e.message : String(e)); }

    if (parseErr) {
      jsonBox.classList.add('is-invalid');
      statusEl.classList.remove('is-ok');
      statusEl.classList.add('is-err');
      (statusEl.children[1] as HTMLElement).textContent = 'Invalid JSON: ' + parseErr;
      previewFrame.innerHTML = '<div class="mf-gd-preview-empty">Fix JSON to see preview.</div>';
      return;
    }
    jsonBox.classList.remove('is-invalid');
    statusEl.classList.remove('is-err');
    statusEl.classList.add('is-ok');
    const mode = String(parsed.displayMode || 'scorecard');
    (statusEl.children[1] as HTMLElement).textContent = 'Valid JSON · displayMode = ' + mode;

    // Inject preset CSS into preview if provided
    if (parsed.css) {
      const styleId = 'mf-gd-preview-css';
      let st = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!st) { st = document.createElement('style'); st.id = styleId; document.head.appendChild(st); }
      st.textContent = parsed.css;
    }

    // Render via same engine as runtime
    const sample = host!.getSampleData(mode);
    let html = '';
    try {
      if (mode === 'foursome') html = host!.renderers.foursome(sample, parsed.options || {});
      else if (mode === 'custom' && parsed.template) html = host!.renderers.template(sample, String(parsed.template));
      else html = host!.renderers.scorecard(sample);
    } catch (e) {
      html = '<div class="mf-gd-preview-empty">Renderer error: ' + htmlEscape(e instanceof Error ? e.message : String(e)) + '</div>';
    }
    previewFrame.innerHTML = html;
  }

  // ── Preset gallery (left pane) ──────────────────────────────────────────
  function renderPresetTiles(): void {
    // Remove existing tiles (keep the <h3> heading)
    while (presetsPane.children.length > 1) presetsPane.removeChild(presetsPane.lastChild!);
    for (const p of host!.listPresets()) {
      const tile = h('button', {
        class: 'mf-gd-tile' + (p.key === activePresetKey ? ' is-active' : ''),
        onclick: () => {
          activePresetKey = p.key;
          jsonBox.value = host!.loadPreset(p.key);
          currentJson = jsonBox.value;
          renderPresetTiles();
          validateAndPreview();
        },
      },
        h('span', { class: 'mf-gd-tile-name' }, p.label),
        h('span', { class: 'mf-gd-tile-mode' }, p.mode)
      );
      presetsPane.appendChild(tile);
    }
  }
  renderPresetTiles();

  const grid = h('div', { class: 'mf-gd-grid' }, presetsPane, editorPane, previewPane);

  const popup: PopupHandle = openPopup({
    title: 'Golf Scorecard Designer',
    subtitle: 'Single source of truth: preview pane uses the same renderer as the live form',
    body: grid,
    width: '1280px',
    saveLabel: 'Apply',
    onSave: async () => {
      // Validate before applying
      try { JSON.parse(jsonBox.value || '{}'); } catch (e) {
        showToast('Cannot apply — JSON is invalid.', 'err');
        return false;
      }
      // 1. Always copy to clipboard so admin can paste into Config JSON
      try { await navigator.clipboard.writeText(jsonBox.value); } catch { /* ignore */ }
      // 2. Invoke host callback if provided (Phase 3 will wire this from
      //    the form builder properties panel)
      if (opts.onApply) { try { opts.onApply(jsonBox.value); } catch { /* ignore */ } }
      showToast('Config copied to clipboard · paste into widget Config JSON.');
      return true;
    },
  });

  // Initial render
  validateAndPreview();

  // Make popup reference available for tests / debugging
  (window as any).__MF_GOLF_DESIGNER_POPUP__ = popup;
}

(function bootstrap() {
  (window as any).MFGolfDesigner = { open: open, badge: BADGE };
})();

export const badge = BADGE;
