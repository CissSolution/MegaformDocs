// ============================================================
// MegaForm UserTemplate — Unified Designer Launcher (v20260602-L3)
// File: src/widgets/plugins/megaform-widget-user-template-launcher.ts
//
// Side-effect module. Injects a "🧬 Open Unified Designer" button on
// every BYOM UserTemplate field card in the Builder canvas (selector:
// .mf-canvas-field[data-type="UserTemplate"], .mf-field-group
// [data-type="UserTemplate"]).
//
// On click it opens openUnifiedDesigner() with TWO host tabs:
//   • Source  — Monaco-backed editor for the underlying .html /
//                .cshtml / .ascx source file. Lazy-loads the Monaco
//                adapter on tab activation so the editor allocation
//                only happens when the user actually opens Source.
//                GET  /API/UserTemplate/Source?name=<name>
//                PUT  /API/UserTemplate/Source (on Apply)
//   • Params  — Show-in-error toggle + descriptor-driven param form.
//
// The legacy right-pane Properties stay in place for backward compat
// (matching the Razor / DynamicLabel launcher policy from B39).
// ============================================================
// @ts-nocheck
'use strict';

import { openUnifiedDesigner } from '../../view-designer/shared/unified-shell';

(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  // [VisualQA-B45] Builder-only gate. The .mf-field-group / .mf-canvas-field
  // selectors match BOTH the Builder canvas AND the runtime form view —
  // without this gate, the "Open Unified Designer" / "Edit Video" / etc.
  // buttons leak into the customer-facing rendered form. We bail unless we
  // can detect the Builder shell.
  function isBuilderMode(): boolean {
    // [VisualQA-B45-fix2c] URL-based gate — see razor-launcher for context.
    if (typeof window === 'undefined' || !window.location) return false;
    var h = String(window.location.hash || '').toLowerCase();
    if (h.indexOf('#mf-builder') === 0) return true;
    var s = String(window.location.search || '').toLowerCase();
    if (/[?&]mfformid=/.test(s)) return true;
    return false;
  }

  var WIDGET_TYPE = 'UserTemplate';
  var BTN_CLASS   = 'mfut-unified-launcher';
  var INJECTED    = 'mfutUnifiedInjected';
  var BTN_LABEL   = '🧬 Open Unified Designer';

  // [B51] Platform-aware API base for UserTemplate endpoints. Resolved at
  // call time (not module load) so __MF_PLATFORM__ injected by Oqtane Razor
  // AddHeadContent has had a chance to land before first fetch.
  function _resolveApiBase(): string {
    var w = window as any;
    if (w.__MF_API_BASE__) return String(w.__MF_API_BASE__).replace(/\/$/, '');
    var pf = (w.__MF_PLATFORM__ || {}) as any;
    if (pf.apiBase) return String(pf.apiBase).replace(/\/$/, '');
    var platform = String(pf.platform || '').toLowerCase();
    if (platform === 'oqtane') return '/api/MegaForm';
    if (platform === 'dnn') return '/DesktopModules/MegaForm/API';
    if (w.Oqtane || w.__OQTANE__) return '/api/MegaForm';
    if (document.querySelector('[data-mf-platform="oqtane"]')) return '/api/MegaForm';
    return '/DesktopModules/MegaForm/API';
  }
  function API_BASE(): string { return _resolveApiBase() + '/UserTemplate'; }

  // ── helpers ─────────────────────────────────────────────────

  function esc(s: any): string {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getAfToken(): string {
    try {
      var t = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
      return t && t.value ? t.value : '';
    } catch (_e) { return ''; }
  }

  function fetchJson(url: string, init?: any): Promise<{ status: number; payload: any }> {
    init = init || {};
    init.credentials = 'same-origin';
    init.headers = init.headers || {};
    var tok = getAfToken();
    if (tok && !init.headers['RequestVerificationToken']) {
      init.headers['RequestVerificationToken'] = tok;
    }
    return (window as any).fetch(url, init).then(function (r: any) {
      return r.json().then(function (p: any) { return { status: r.status, payload: p }; })
        .catch(function () { return { status: r.status, payload: null }; });
    });
  }

  function inferLanguageFromKind(kind: string, file: string): string {
    var k = String(kind || '').toLowerCase();
    var f = String(file || '').toLowerCase();
    if (k === 'razor' || /\.cshtml$/.test(f)) return 'razor';
    if (k === 'ascx' || /\.ascx$/.test(f))   return 'html';
    return 'html';
  }

  function inferFileFromKind(kind: string): string {
    var k = String(kind || '').toLowerCase();
    if (k === 'razor') return 'template.cshtml';
    if (k === 'ascx')  return 'template.ascx';
    return 'template.html';
  }

  // ── Monaco bundle bootstrap ─────────────────────────────────
  // The unified-monaco bundle is shipped as a separate ~4MB IIFE script
  // (megaform-unified-monaco.js) which sets window.MegaFormMonaco as a
  // side-effect. Vite externalizes `monaco-editor` in monaco-editor-adapter.ts
  // to `window.MegaFormMonaco`, so the adapter's `import('monaco-editor')`
  // will silently fail unless this <script> tag has been injected and
  // resolved BEFORE adapter.mountMonacoEditor() is called.
  //
  // Mirrors the lazy-<script> dance used by megaform-widget-dynamic-label.ts
  // for MFLayoutDesigner. Cached via window.__mfMonacoReady so multiple
  // Source-tab mounts share a single load.
  async function ensureMonacoLoaded(): Promise<boolean> {
    if ((window as any).MegaFormMonaco) return true;
    if ((window as any).__mfMonacoReady) {
      try {
        await (window as any).__mfMonacoReady;
        return !!(window as any).MegaFormMonaco;
      } catch (_e) { return false; }
    }
    var p = new Promise<boolean>(function (resolve) {
      // Find the megaform-builder.js script tag and derive the base path
      // from it so we work regardless of whether we're on DNN
      // (/DesktopModules/MegaForm/Assets/js/) or Oqtane
      // (/Modules/Oqtane.MegaForm/Resources/Assets/js/).
      var scripts = document.getElementsByTagName('script');
      var base = '/DesktopModules/MegaForm/Assets/js/';
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute('src') || '';
        var m = src.match(/^(.*\/Assets\/js\/)(?:bundles\/)?megaform-builder\.js/);
        if (m) { base = m[1]; break; }
      }
      // Reuse an already-injected tag if a previous mount started loading.
      var existing = document.querySelector('script[data-mf-monaco="1"]') as HTMLScriptElement | null;
      if (existing) {
        if ((window as any).MegaFormMonaco) { resolve(true); return; }
        existing.addEventListener('load', function () { resolve(!!(window as any).MegaFormMonaco); });
        existing.addEventListener('error', function () { resolve(false); });
        return;
      }
      var s = document.createElement('script');
      s.src = base + 'megaform-unified-monaco.js?v=20260619-B200';
      s.async = true;
      s.setAttribute('data-mf-monaco', '1');
      s.onload  = function () { resolve(!!(window as any).MegaFormMonaco); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    (window as any).__mfMonacoReady = p;
    return p;
  }

  // ── find field in builder state (mirrors razor launcher) ────

  function findField(key: string): any {
    var B = (window as any).MegaFormBuilder;
    var fields = B && B.state && B.state.schema && B.state.schema.fields ? B.state.schema.fields : [];
    function walk(list: any[]): any {
      for (var i = 0; i < list.length; i++) {
        var f = list[i]; if (!f) continue;
        if (f.key === key) return f;
        if (f.type === 'Row' && f.columns) {
          for (var ci = 0; ci < f.columns.length; ci++) {
            var col = f.columns[ci];
            if (col && col.fields) { var hit = walk(col.fields); if (hit) return hit; }
          }
        }
      }
      return null;
    }
    return walk(fields);
  }

  // ── Source tab: lazy Monaco mount ────────────────────────────

  function mountSourceTab(host: HTMLElement, ctx: any): any {
    host.innerHTML =
      '<div class="mfut-source-wrap" style="display:flex;flex-direction:column;height:100%;min-height:420px;">' +
      '  <div class="mfut-source-toolbar" style="padding:8px 10px;border-bottom:1px solid #e5e7eb;background:#f9fafb;font-size:12px;color:#374151;display:flex;gap:8px;align-items:center;">' +
      '    <span class="mfut-source-status">Loading source…</span>' +
      '    <span style="flex:1"></span>' +
      '    <span class="mfut-source-file" style="font-family:Consolas,Menlo,monospace;color:#6b7280;"></span>' +
      '  </div>' +
      '  <div class="mfut-source-editor" style="flex:1;min-height:380px;border:1px solid #e5e7eb;"></div>' +
      '</div>';

    var status   = host.querySelector('.mfut-source-status') as HTMLElement;
    var fileLbl  = host.querySelector('.mfut-source-file') as HTMLElement;
    var editorEl = host.querySelector('.mfut-source-editor') as HTMLElement;

    var state: any = {
      name: (ctx && ctx.opts && ctx.opts.currentProps && (ctx.opts.currentProps.templateName || '')) || '',
      file: '',
      kind: '',
      content: '',
      original: '',
      monacoApi: null,
      adapter: null,
      mounted: false
    };

    function setStatus(text: string, kind?: string) {
      status.textContent = text;
      status.style.color = kind === 'error' ? '#b91c1c' : (kind === 'success' ? '#15803d' : '#374151');
    }

    function fallbackToTextarea(initial: string) {
      editorEl.innerHTML = '';
      var ta = document.createElement('textarea');
      ta.value = initial || '';
      ta.style.cssText =
        'width:100%;height:100%;min-height:380px;font-family:Consolas,Menlo,monospace;' +
        'font-size:12px;line-height:1.45;padding:10px;box-sizing:border-box;' +
        'border:0;outline:0;resize:vertical;';
      editorEl.appendChild(ta);
      state.monacoApi = {
        getValue: function () { return ta.value; },
        setValue: function (v: string) { ta.value = v == null ? '' : String(v); },
        dispose:  function () { /* noop */ }
      };
      state.mounted = true;
    }

    async function loadSource() {
      if (!state.name) {
        setStatus('No template selected — pick one in the Params tab first.', 'error');
        fallbackToTextarea('');
        return;
      }
      setStatus('Fetching source…');
      try {
        var url = API_BASE() + '/Source?name=' + encodeURIComponent(state.name);
        var res = await fetchJson(url, { method: 'GET' });
        if (res.status < 200 || res.status >= 300 || !res.payload) {
          var em = (res.payload && (res.payload.error || res.payload.Error)) || ('HTTP ' + res.status);
          setStatus('Failed to load source: ' + em, 'error');
          fallbackToTextarea('');
          return;
        }
        state.file    = String(res.payload.file || res.payload.File || inferFileFromKind(res.payload.kind || res.payload.Kind || ''));
        state.kind    = String(res.payload.kind || res.payload.Kind || '');
        state.content = String(res.payload.content || res.payload.Content || '');
        state.original = state.content;
        fileLbl.textContent = state.file;
        setStatus('Loaded ' + state.file + ' (' + state.content.length + ' bytes)', 'success');
        await mountEditor();
      } catch (e: any) {
        setStatus('Error loading source: ' + (e && e.message ? e.message : String(e)), 'error');
        fallbackToTextarea('');
      }
    }

    async function mountEditor() {
      var lang = inferLanguageFromKind(state.kind, state.file);
      try {
        // STEP 1: ensure the unified-monaco bundle (~4MB IIFE) is loaded
        // so window.MegaFormMonaco is set BEFORE the adapter's internal
        // `import('monaco-editor')` (which Vite-externalizes to that
        // global) is evaluated. Without this the dynamic import rejects
        // and the adapter silently falls back to a plaintext textarea.
        var monacoOk = await ensureMonacoLoaded();
        // STEP 2: import the adapter shim itself. The adapter is bundled
        // inline into this launcher entry, so this import resolves
        // immediately — we still await defensively in case the build
        // changes shape later.
        var adapter: any = await import(/* @vite-ignore */ '../../view-designer/shared/monaco-editor-adapter')
          .catch(function () { return null; });
        if (adapter && typeof adapter.mountMonacoEditor === 'function') {
          state.adapter = adapter;
          editorEl.innerHTML = '';
          // BUG-FIX (B44): adapter reads `opts.initialValue`, NOT
          // `opts.value`. Previously the launcher passed `value:` so
          // even when the editor mounted it was always empty.
          var unifiedApi: any = adapter.mountMonacoEditor(editorEl, {
            initialValue: state.content,
            language: lang,
            theme: 'vs'
          });
          // The adapter returns a UnifiedTabApi (getDraft/setProps/
          // isDirty/destroy). The Source-tab launcher however reads
          // state.monacoApi.getValue() / .dispose() — adapt the shape.
          state.monacoApi = {
            getValue: function () {
              try {
                var d = unifiedApi && typeof unifiedApi.getDraft === 'function'
                  ? unifiedApi.getDraft() : null;
                return d && typeof d.source === 'string' ? d.source : '';
              } catch (_e) { return ''; }
            },
            setValue: function (v: string) {
              try {
                if (unifiedApi && typeof unifiedApi.setProps === 'function') {
                  unifiedApi.setProps({ source: v == null ? '' : String(v) });
                }
              } catch (_e) {}
            },
            dispose: function () {
              try { if (unifiedApi && typeof unifiedApi.destroy === 'function') unifiedApi.destroy(); } catch (_e) {}
            }
          };
          state.mounted = true;
          if (!monacoOk) {
            // Adapter mounted but Monaco bundle never loaded —
            // user is on the degraded textarea fallback. Surface
            // it on the toolbar so they know why no syntax colors.
            setStatus('Loaded ' + state.file + ' (' + state.content.length +
              ' bytes) — rich editor unavailable, plain textarea fallback.', 'success');
          }
          return;
        }
        // Adapter not present — fall back.
        fallbackToTextarea(state.content);
      } catch (_e) {
        fallbackToTextarea(state.content);
      }
    }

    // Kick off load + mount immediately (the shell calls render on activation).
    loadSource();

    return {
      getDraft: function () {
        var current = state.monacoApi && typeof state.monacoApi.getValue === 'function'
          ? state.monacoApi.getValue() : '';
        // Always return name + file so the launcher can PUT regardless of
        // whether the user typed. Apply-handler decides whether to skip.
        return {
          __mfutSource: {
            name: state.name,
            file: state.file,
            content: current,
            original: state.original,
            dirty: current !== state.original
          }
        };
      },
      dispose: function () {
        try { if (state.monacoApi && state.monacoApi.dispose) state.monacoApi.dispose(); } catch (_e) {}
      }
    };
  }

  // ── Params tab: showInError + templateName + descriptor params

  function mountParamsTab(host: HTMLElement, ctx: any): any {
    var wp = (ctx && ctx.opts && ctx.opts.currentProps) || {};
    var draft: any = {
      templateName: String(wp.templateName || ''),
      showInError: !!wp.showInError
    };

    host.innerHTML =
      '<div class="mfut-params-wrap" style="padding:14px 16px;">' +
      '  <h4 style="margin:0 0 10px;font-size:13px;color:#374151;">UserTemplate (BYOM) Parameters</h4>' +
      '  <div style="margin-bottom:10px;">' +
      '    <label style="display:block;font-size:12px;color:#374151;margin-bottom:4px;font-weight:600;">Template name</label>' +
      '    <input type="text" class="mfut-pf-name" value="' + esc(draft.templateName) + '" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:Consolas,Menlo,monospace;" />' +
      '    <div style="font-size:11px;color:#6b7280;margin-top:3px;">Folder name under <code>Resources/UserTemplates/</code>.</div>' +
      '  </div>' +
      '  <div style="margin-bottom:10px;">' +
      '    <label style="display:flex;gap:8px;align-items:center;font-size:12px;color:#374151;">' +
      '      <input type="checkbox" class="mfut-pf-showerror" ' + (draft.showInError ? 'checked' : '') + ' />' +
      '      <span><strong>Show in error</strong> — paint a red error block on the form when render fails.</span>' +
      '    </label>' +
      '  </div>' +
      '  <div class="mfut-pf-extra" style="margin-top:14px;border-top:1px dashed #e5e7eb;padding-top:10px;">' +
      '    <div style="font-size:11px;color:#6b7280;">Descriptor-driven params (loaded from /Detail) will appear here.</div>' +
      '  </div>' +
      '</div>';

    var nameInput = host.querySelector('.mfut-pf-name') as HTMLInputElement;
    var showInErr = host.querySelector('.mfut-pf-showerror') as HTMLInputElement;

    nameInput.addEventListener('input', function () { draft.templateName = nameInput.value || ''; });
    showInErr.addEventListener('change', function () { draft.showInError = !!showInErr.checked; });

    return {
      getDraft: function () {
        return {
          templateName: draft.templateName || '',
          showInError: !!draft.showInError
        };
      }
    };
  }

  // ── Apply handler: optional source PUT then merge into widgetProps

  async function applyChanges(field: any, merged: any) {
    var B = (window as any).MegaFormBuilder;

    // Extract the Source-tab payload (if any).
    var src: any = merged && merged.__mfutSource;
    if (src && typeof src === 'object') {
      delete merged.__mfutSource;
      if (src.dirty && src.name && src.file) {
        try {
          var res = await fetchJson(API_BASE() + '/Source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              Name: src.name,
              File: src.file,
              Content: src.content
            })
          });
          if (res.status < 200 || res.status >= 300) {
            var em = (res.payload && (res.payload.error || res.payload.Error)) || ('HTTP ' + res.status);
            try { alert('Failed to save source: ' + em); } catch (_e) {}
            return;
          }
        } catch (e: any) {
          try { alert('Failed to save source: ' + (e && e.message ? e.message : String(e))); } catch (_e) {}
          return;
        }
      }
    }

    try {
      field.widgetProps = Object.assign({}, field.widgetProps || {}, merged || {});
      if (B && B.state) B.state.isDirty = true;
      if (B && B.callModule) {
        try { B.callModule('canvas', 'render', []); } catch (_e) {}
        try { B.callModule('properties', 'showProps', [field]); } catch (_e) {}
      }
    } catch (e: any) {
      try { console.error('[mf-usertemplate-launcher] apply failed', e); } catch (_e) {}
    }
  }

  // ── Launcher entry ──────────────────────────────────────────

  function openDesigner(field: any) {
    if (!field) { try { alert('Field not found in builder state.'); } catch (_e) {} return; }
    var wp = (field && field.widgetProps) || {};

    openUnifiedDesigner({
      widget: 'usertemplate',
      title: 'User Template (BYOM) Designer',
      badge: 'v20260602 · usertemplate',
      currentProps: JSON.parse(JSON.stringify(wp || {})),
      tabs: [
        {
          id: 'source',
          label: 'Source',
          icon: 'fas fa-code',
          render: function (host, ctx) {
            (host as any).__mfutSourceTabApi = mountSourceTab(host, ctx);
          },
          getDraft: function () {
            var pane = document.querySelector('.mf-unified-designer-pane[data-pane-id="source"]') as HTMLElement | null;
            var api = pane && (pane as any).__mfutSourceTabApi;
            return api && typeof api.getDraft === 'function' ? api.getDraft() : {};
          }
        },
        {
          id: 'params',
          label: 'Params',
          icon: 'fas fa-sliders-h',
          render: function (host, ctx) {
            (host as any).__mfutParamsTabApi = mountParamsTab(host, ctx);
          },
          getDraft: function () {
            var pane = document.querySelector('.mf-unified-designer-pane[data-pane-id="params"]') as HTMLElement | null;
            var api = pane && (pane as any).__mfutParamsTabApi;
            return api && typeof api.getDraft === 'function' ? api.getDraft() : {};
          }
        }
      ],
      onApply: function (merged) {
        // Fire-and-forget so the shell's Apply button isn't blocked.
        applyChanges(field, merged || {});
      }
    });
  }

  // ── DOM injector ────────────────────────────────────────────

  function inject(card: HTMLElement) {
    if (!card || (card as any).dataset[INJECTED] === '1') return;
    (card as any).dataset[INJECTED] = '1';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.title = 'Open the unified Widget Designer — Source + Params for this BYOM template.';
    btn.innerHTML = BTN_LABEL;
    btn.style.cssText = 'background:#a855f7;color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:6px;line-height:1.3';
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var key = card.getAttribute('data-key') || '';
      var field = findField(key);
      openDesigner(field);
    });

    var actions = card.querySelector('.mf-canvas-field-actions');
    if (actions && actions.parentNode) {
      actions.parentNode.insertBefore(btn, actions);
    } else {
      card.appendChild(btn);
    }
  }

  function scan() {
    // Accept both .mf-canvas-field and .mf-field-group (matches the
    // DynamicLabel fix from B39 — some widget cards use the latter).
    var cards = document.querySelectorAll(
      '.mf-canvas-field[data-type="' + WIDGET_TYPE + '"], ' +
      '.mf-field-group[data-type="' + WIDGET_TYPE + '"]'
    );
    for (var i = 0; i < cards.length; i++) inject(cards[i] as HTMLElement);
  }

  function bootstrap() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scan);
    } else {
      scan();
    }
    if (typeof MutationObserver !== 'undefined') {
      try {
        new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true });
      } catch (_e) { /* ignore */ }
    }
  }

  if (!isBuilderMode()) {
    // Re-check after DOMContentLoaded in case the launcher runs before the
    // Builder shell mounts. If still not builder, give up silently.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        if (isBuilderMode()) bootstrap();
      });
    }
    return;
  }
  bootstrap();
})();
