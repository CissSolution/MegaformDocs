// ============================================================
// MegaForm View Designer — Monaco Editor Adapter (v20260602-A1)
// File: src/view-designer/shared/monaco-editor-adapter.ts
//
// Lazy-loads the `monaco-editor` package and mounts an editor
// into a supplied host pane. Returns a UnifiedTabApi-compatible
// handle so callers (typically the BYOM UserTemplate "Source"
// tab, but also any other tab that wants a code editor) can
// stage the edited source as a `source` slice on Apply.
//
// Why a separate module?
//   monaco-editor weighs ~150KB minified+gzipped (~5MB raw).
//   We do NOT want it in the main builder bundle. Every entry in
//   vite.config.ts is built with `inlineDynamicImports: true` +
//   `format: 'iife'`, which means a `await import('monaco-editor')`
//   inside a launcher gets inlined into THAT launcher's bundle.
//   The intended ship plan (per the scout report) is to give this
//   module its own Vite entry (`'unified-monaco'`) and lazy-load
//   the resulting `megaform-unified-monaco.js` via <script>
//   injection — mirroring the MFLayoutDesigner pattern used by
//   DynamicLabel. Until then, callers that import this adapter
//   pay the bundle cost only in their own launcher entry.
//
// Public surface — see MonacoEditorAdapterOptions / mountMonacoEditor.
// ============================================================
// @ts-nocheck
'use strict';

import type { UnifiedTabContext } from './unified-shell';

// ── UnifiedTabApi (mirrored from the B38 plugin adapters) ────
// Kept local so this module has no runtime dep on any plugin file.
// The shape must stay byte-for-byte identical to the one declared
// in megaform-razor-studio-adapter.ts / megaform-dynlabel-adapter.ts.
export interface UnifiedTabApi {
  /** Returns the merge slice the tab wants to contribute on Apply. */
  getDraft(): Record<string, any>;
  /** Hydrate the tab UI from a freshly-supplied widgetProps snapshot. */
  setProps(props: Record<string, any>): void;
  /** True when the user has staged a change relative to setProps(). */
  isDirty(): boolean;
  /** Tear down DOM + listeners (called by the host when the shell closes). */
  destroy(): void;
}

// ── Public options for the adapter ───────────────────────────
export interface MonacoEditorAdapterOptions {
  /**
   * Language id understood by Monaco. Common values:
   *   "html", "razor", "javascript", "typescript", "css", "json", "xml".
   * Anything Monaco does not recognise falls back to "plaintext".
   */
  language: string;
  /** Source string painted into the editor on mount. */
  initialValue: string;
  /** Fires on every keystroke / paste / undo with the new buffer. */
  onChange?: (value: string) => void;
  /** Render the editor read-only (still scrollable + selectable). */
  readOnly?: boolean;
  /** "vs" | "vs-dark" | "hc-black". Defaults to "vs-dark" (matches Data-tab SQL editor). */
  theme?: string;
  /**
   * Optional explicit base URL for Monaco's web workers. When omitted
   * we attempt to derive it from the unified-monaco bundle's <script src>;
   * if that also fails we let Monaco fall back to inline workers (slower,
   * may trip strict CSP — log a warning to the console).
   */
  workerBaseUrl?: string;
}

// ── Module-level cache so a second mount reuses the load ────
var _monacoLoadPromise: Promise<any> | null = null;

function loadMonaco(workerBaseUrl?: string): Promise<any> {
  if (_monacoLoadPromise) return _monacoLoadPromise;

  // Configure MonacoEnvironment BEFORE the package's side-effecting
  // import runs, otherwise editor workers default to inline blob URLs
  // which fail in strict-CSP DNN installs (sandboxConstraints note (C)).
  try {
    var w: any = window as any;
    if (!w.MonacoEnvironment) {
      var base = workerBaseUrl || sniffMonacoBase() || '';
      w.MonacoEnvironment = {
        getWorkerUrl: function (_moduleId: string, label: string) {
          if (!base) return ''; // Monaco will fall back to inline workers
          // Standard Monaco worker filename pattern. The unified-monaco
          // build entry is expected to emit these sibling files under
          // the same Assets/js directory as the main bundle.
          var name = 'editor.worker.js';
          switch (label) {
            case 'json':       name = 'json.worker.js'; break;
            case 'css':
            case 'scss':
            case 'less':       name = 'css.worker.js'; break;
            case 'html':
            case 'handlebars':
            case 'razor':      name = 'html.worker.js'; break;
            case 'typescript':
            case 'javascript': name = 'ts.worker.js'; break;
          }
          return base.replace(/\/?$/, '/') + name;
        }
      };
    }
  } catch (_e) { /* swallow — Monaco can still load with inline workers */ }

  // [VisualQA-B45-fix1b] Vite's rollupOptions.output.globals rewrites STATIC
  // imports only — dynamic `import('monaco-editor')` ships as a literal
  // browser dynamic import which 404s in IIFE-built bundles. The
  // unified-monaco entry publishes window.MegaFormMonaco as a side-effect
  // so we resolve directly off that global. The dynamic import is kept
  // only as a last-resort fallback for ES-module contexts (e.g. when
  // unified-monaco is consumed via npm by a downstream Vite project).
  var w: any = (typeof window !== 'undefined' ? (window as any) : {});
  if (w.MegaFormMonaco) {
    _monacoLoadPromise = Promise.resolve(w.MegaFormMonaco);
    return _monacoLoadPromise;
  }
  if (w.__mfMonacoReady && typeof w.__mfMonacoReady.then === 'function') {
    _monacoLoadPromise = w.__mfMonacoReady.then(function () {
      return w.MegaFormMonaco || Promise.reject(new Error('MegaFormMonaco never published'));
    }).catch(function (e: any) {
      _monacoLoadPromise = null;
      throw e;
    });
    return _monacoLoadPromise;
  }
  _monacoLoadPromise = import('monaco-editor').catch(function (e) {
    _monacoLoadPromise = null; // allow caller to retry next mount
    throw e;
  });
  return _monacoLoadPromise;
}

/**
 * Walk `<script>` tags on the page looking for the unified-monaco bundle
 * so worker siblings (editor.worker.js, html.worker.js, …) can resolve
 * next to it. Returns "" if no match is found (callers fall back to
 * inline workers).
 */
function sniffMonacoBase(): string {
  try {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src') || '';
      var m = src.match(/^(.*?\/)megaform-unified-monaco\.js(?:\?.*)?$/i);
      if (m && m[1]) return m[1];
    }
  } catch (_e) {}
  return '';
}

/**
 * Mount a Monaco editor inside `host` and return a UnifiedTabApi handle.
 *
 * While Monaco is being lazy-imported the host shows a "Loading editor…"
 * placeholder. If the import fails the adapter falls back to a plain
 * <textarea> with the same getDraft / setProps contract, so customers on
 * air-gapped DNN installs (where the npm bundle may not have been built)
 * still get a functional Source tab.
 *
 * @param host  Pane DOM node — adapter takes full ownership of its
 *              innerHTML until `destroy()` is called.
 * @param opts  See MonacoEditorAdapterOptions.
 */
export function mountMonacoEditor(
  host: HTMLElement,
  opts: MonacoEditorAdapterOptions
): UnifiedTabApi {
  injectStyleOnce();

  var initialValue = String(opts.initialValue == null ? '' : opts.initialValue);
  var currentValue = initialValue;          // updated by Monaco / textarea
  var baselineValue = initialValue;         // updated by setProps()
  var disposed = false;

  // ── Live editor handles (one or the other gets populated) ──
  var monacoEditor: any = null;             // monaco.editor.IStandaloneCodeEditor
  var monacoChangeSub: any = null;          // IDisposable from onDidChangeContent
  var fallbackTextarea: HTMLTextAreaElement | null = null;

  // ── Paint loading placeholder ─────────────────────────────
  host.innerHTML =
    '<div class="mf-monaco-adapter-wrap" data-state="loading">' +
      '<div class="mf-monaco-adapter-loading">' +
        '<i class="fas fa-spinner fa-spin"></i> Loading editor…' +
      '</div>' +
      '<div class="mf-monaco-adapter-mount" data-role="mount"></div>' +
    '</div>';
  var wrap = host.querySelector('.mf-monaco-adapter-wrap') as HTMLElement;
  var mountEl = host.querySelector('[data-role="mount"]') as HTMLElement;

  function handleChange(next: string) {
    currentValue = next;
    if (typeof opts.onChange === 'function') {
      try { opts.onChange(next); } catch (_e) { /* swallow */ }
    }
  }

  // ── Kick off the lazy import ──────────────────────────────
  loadMonaco(opts.workerBaseUrl).then(function (monaco) {
    if (disposed || !mountEl.isConnected) return;

    var lang = normaliseLanguage(monaco, opts.language);
    var theme = opts.theme || 'vs-dark';

    try {
      monacoEditor = monaco.editor.create(mountEl, {
        value: initialValue,
        language: lang,
        theme: theme,
        readOnly: !!opts.readOnly,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        fontFamily: 'Menlo, Consolas, "Courier New", monospace',
        wordWrap: 'on',
        tabSize: 2,
        renderWhitespace: 'selection',
        lineNumbersMinChars: 3,
        folding: true,
        bracketPairColorization: { enabled: true }
      });
      var model = monacoEditor.getModel();
      if (model && typeof model.onDidChangeContent === 'function') {
        monacoChangeSub = model.onDidChangeContent(function () {
          if (!monacoEditor) return;
          handleChange(monacoEditor.getValue());
        });
      }
      wrap.setAttribute('data-state', 'ready');
    } catch (e) {
      // Monaco loaded but couldn't construct (e.g. WebWorker blocked).
      try { console.warn('[mf-monaco-adapter] Monaco create failed, falling back to <textarea>', e); } catch (_e) {}
      mountFallbackTextarea(initialValue);
    }
  }).catch(function (err) {
    if (disposed) return;
    try { console.warn('[mf-monaco-adapter] Failed to load monaco-editor, falling back to <textarea>', err); } catch (_e) {}
    mountFallbackTextarea(initialValue);
  });

  // ── Fallback path: plain <textarea> with same contract ────
  function mountFallbackTextarea(value: string) {
    if (disposed) return;
    wrap.setAttribute('data-state', 'fallback');
    mountEl.innerHTML = '';
    fallbackTextarea = document.createElement('textarea');
    fallbackTextarea.className = 'mf-monaco-adapter-fallback';
    fallbackTextarea.spellcheck = false;
    fallbackTextarea.value = value;
    if (opts.readOnly) fallbackTextarea.readOnly = true;
    fallbackTextarea.addEventListener('input', function () {
      if (!fallbackTextarea) return;
      handleChange(fallbackTextarea.value);
    });
    mountEl.appendChild(fallbackTextarea);

    // Surface a small banner so the user knows they're on the
    // degraded path. Doesn't disturb the getDraft contract.
    var banner = document.createElement('div');
    banner.className = 'mf-monaco-adapter-banner';
    banner.innerHTML =
      '<i class="fas fa-info-circle"></i> ' +
      'Rich editor unavailable — using a plain text fallback. ' +
      '<small>(install monaco-editor or check network/CSP to enable syntax highlighting)</small>';
    wrap.insertBefore(banner, mountEl);
  }

  // ── UnifiedTabApi surface ─────────────────────────────────
  var api: UnifiedTabApi = {
    getDraft: function () {
      return { source: currentValue };
    },
    setProps: function (props) {
      if (disposed) return;
      if (!props || typeof props !== 'object') return;
      if (typeof (props as any).source !== 'string') return;
      var next = String((props as any).source);
      baselineValue = next;
      currentValue = next;
      if (monacoEditor) {
        try {
          var sel = monacoEditor.getSelection ? monacoEditor.getSelection() : null;
          monacoEditor.setValue(next);
          if (sel && monacoEditor.setSelection) monacoEditor.setSelection(sel);
        } catch (_e) {
          try { monacoEditor.setValue(next); } catch (__e) {}
        }
      } else if (fallbackTextarea) {
        fallbackTextarea.value = next;
      } else {
        // Monaco still loading — update initialValue so the deferred
        // create() picks up the freshest snapshot.
        initialValue = next;
      }
    },
    isDirty: function () {
      return currentValue !== baselineValue;
    },
    destroy: function () {
      if (disposed) return;
      disposed = true;
      try { if (monacoChangeSub && typeof monacoChangeSub.dispose === 'function') monacoChangeSub.dispose(); } catch (_e) {}
      monacoChangeSub = null;
      try {
        if (monacoEditor) {
          var model = monacoEditor.getModel && monacoEditor.getModel();
          monacoEditor.dispose();
          if (model && typeof model.dispose === 'function') {
            try { model.dispose(); } catch (_e) {}
          }
        }
      } catch (_e) {}
      monacoEditor = null;
      fallbackTextarea = null;
      try { host.innerHTML = ''; } catch (_e) {}
    }
  };
  return api;
}

// ── Helpers ──────────────────────────────────────────────────
function normaliseLanguage(monaco: any, lang: string): string {
  var requested = String(lang || '').trim().toLowerCase();
  if (!requested) return 'plaintext';
  try {
    var langs = monaco.languages && monaco.languages.getLanguages ? monaco.languages.getLanguages() : [];
    for (var i = 0; i < langs.length; i++) {
      var L = langs[i];
      if (!L) continue;
      if (String(L.id || '').toLowerCase() === requested) return L.id;
      var aliases = L.aliases || [];
      for (var j = 0; j < aliases.length; j++) {
        if (String(aliases[j] || '').toLowerCase() === requested) return L.id;
      }
    }
  } catch (_e) {}
  // Razor is not always registered out-of-the-box — fall back to html
  // which gives the closest syntax highlighting for .cshtml content.
  if (requested === 'razor' || requested === 'cshtml') return 'html';
  return requested; // let Monaco resolve / default to plaintext
}

// ── Styles (scoped via .mf-monaco-adapter-*) ─────────────────
var _styleInjected = false;
function injectStyleOnce() {
  if (_styleInjected) return;
  _styleInjected = true;
  try {
    var st = document.createElement('style');
    st.id = 'mf-monaco-adapter-styles';
    st.textContent = [
      '.mf-monaco-adapter-wrap{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:280px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;background:#1e1e1e}',
      '.mf-monaco-adapter-wrap[data-state="loading"] [data-role="mount"]{visibility:hidden}',
      '.mf-monaco-adapter-wrap[data-state="ready"] .mf-monaco-adapter-loading{display:none}',
      '.mf-monaco-adapter-wrap[data-state="fallback"] .mf-monaco-adapter-loading{display:none}',
      '.mf-monaco-adapter-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;font-family:Inter,system-ui,sans-serif;background:#1e1e1e;z-index:1;gap:8px}',
      '.mf-monaco-adapter-mount{flex:1;min-height:240px;height:100%}',
      '.mf-monaco-adapter-banner{font-size:11px;color:#fde68a;background:#451a03;border-bottom:1px solid #78350f;padding:6px 10px;display:flex;align-items:center;gap:6px}',
      '.mf-monaco-adapter-banner small{color:#fcd34d;opacity:.85;font-size:10px}',
      '.mf-monaco-adapter-fallback{flex:1;width:100%;min-height:240px;height:100%;border:0;outline:0;background:#0f172a;color:#e2e8f0;font-family:Menlo,Consolas,"Courier New",monospace;font-size:12px;padding:10px;resize:none;white-space:pre;tab-size:2}'
    ].join('\n');
    document.head.appendChild(st);
  } catch (_e) { /* swallow — styles are nice-to-have */ }
}

// ── Optional: convenience factory that doubles as a UnifiedTabSpec ──
// Not required by the prompt's public surface, but cheap to expose so
// the BYOM launcher can do:
//   tabs: [buildSourceTab({ language: 'razor', getSource: () => current })]
// instead of writing the wiring boilerplate inline. Left here for the
// L3 launcher to consume when it lands.
export function buildSourceTabSpec(args: {
  id?: string;
  label?: string;
  icon?: string;
  language: string;
  getInitialValue: () => string | Promise<string>;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}): {
  id: string;
  label: string;
  icon: string;
  render: (host: HTMLElement, ctx: UnifiedTabContext) => void;
  getDraft: () => Record<string, any>;
  onActivate?: () => void;
  __apiRef: { current: UnifiedTabApi | null };
} {
  var apiRef: { current: UnifiedTabApi | null } = { current: null };
  return {
    id: args.id || 'source',
    label: args.label || 'Source',
    icon: args.icon || 'fas fa-code',
    render: function (host, ctx) {
      Promise.resolve()
        .then(function () { return args.getInitialValue(); })
        .then(function (value) {
          apiRef.current = mountMonacoEditor(host, {
            language: args.language,
            initialValue: String(value == null ? '' : value),
            readOnly: !!args.readOnly,
            onChange: args.onChange
          });
        })
        .catch(function (e) {
          host.innerHTML = '<div style="padding:14px;font-size:12px;color:#991b1b">Failed to load source: ' +
            String(e && e.message || e) + '</div>';
        });
    },
    getDraft: function () {
      return apiRef.current ? apiRef.current.getDraft() : {};
    },
    __apiRef: apiRef
  };
}
