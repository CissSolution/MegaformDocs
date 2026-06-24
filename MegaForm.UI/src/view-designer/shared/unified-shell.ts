// ============================================================
// MegaForm View Designer — Unified Designer Shell (v20260602-A1)
// File: src/view-designer/shared/unified-shell.ts
//
// A reusable modal shell that hosts several "tabs" representing
// the configuration surface of a widget (DataGrid, List, Card,
// Layout, GridRepeater, DataRepeater, ...). The shell auto
// prepends two cross-cutting tabs:
//
//   • Current Settings  — read-only inspector of the props that
//                          are currently in effect on the widget.
//   • Data              — table picker + SQL preview that stages
//                          { useSql, masterQuery, connectionKey,
//                            databaseType, queryDependsOn } into
//                          the merged draft.
//
// Visual style is cloned 1-for-1 from token-designer.ts but with
// the prefix `.mf-unified-designer-*` to avoid bleed.
//
// Mounted INSIDE #mf-builder-root (B31 pattern) and carries the
// `data-mf-overlay="1"` attribute so the Builder fullscreen
// takeover never hides it.
// ============================================================
// @ts-nocheck
'use strict';

// ── Public types ──────────────────────────────────────────────
export interface UnifiedDesignerOpts {
  /** Widget kind (e.g. 'datagrid' | 'list' | 'card' | 'layout' …). */
  widget: string;
  /** Snapshot of currently-applied widget properties. */
  currentProps?: Record<string, any>;
  /** Host-supplied tabs (rendered after the auto-prepended ones). */
  tabs?: UnifiedTabSpec[];
  /** Optional title shown in the header. Defaults to "Widget Designer". */
  title?: string;
  /** Optional version badge shown in the header. */
  badge?: string;
  /** Called when the user clicks the bottom Apply button. */
  onApply?: (mergedProps: Record<string, any>) => void;
  /** Called when the shell closes (Cancel, ESC, backdrop). */
  onClose?: () => void;
}

export interface UnifiedTabSpec {
  /** Stable id used by ctx.focusTab(). */
  id: string;
  /** Display label in the tab strip. */
  label: string;
  /** Optional Font-Awesome icon class (e.g. "fas fa-table"). */
  icon?: string;
  /** Called to populate the tab body; receives a context handle. */
  render: (host: HTMLElement, ctx: UnifiedTabContext) => void;
  /** Returns the draft slice the tab wants to merge on Apply. */
  getDraft?: () => Record<string, any>;
  /** Optional hook called when the tab gains focus. */
  onActivate?: () => void;
}

export interface UnifiedTabContext {
  /** Stage a draft slice into the shared merge bag (used by Data tab). */
  stageDraft: (slice: Record<string, any>) => void;
  /** Programmatically focus another tab by id. */
  focusTab: (id: string) => void;
  /** Show a transient toast. */
  toast: (msg: string, variant?: 'info' | 'success' | 'error') => void;
  /** Read current opts (currentProps, widget, …). */
  opts: UnifiedDesignerOpts;
}

export interface UnifiedDesignerHandle {
  /** Force-close the shell without confirm (host can wire to a global ESC). */
  close: () => void;
  /** Switch active tab. */
  focusTab: (id: string) => void;
  /** DOM root of the shell, in case host wants to query against it. */
  root: HTMLElement;
}

// ── Internal singletons ──────────────────────────────────────
var __MF_UD_LOADED__ = (window as any).__MFUnifiedDesignerLoaded;
if (!__MF_UD_LOADED__) {
  (window as any).__MFUnifiedDesignerLoaded = true;
}

var _styleInjected = false;

// [B31] Prefer #mf-builder-root so the Builder fullscreen takeover never
// hides us. Falls back to <body> only when the shell is unavailable.
function getMountTarget(): HTMLElement {
  return (document.getElementById('mf-builder-root')
    || (document.querySelector('#mf-builder-root[data-mf-hoisted="1"]') as HTMLElement | null)
    || document.body) as HTMLElement;
}

function escHtml(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escAttr(s: any): string { return escHtml(s); }

function apiBase(): string {
  var w: any = window as any;
  if (w.__MF_PLATFORM__ && w.__MF_PLATFORM__.apiBase) {
    return String(w.__MF_PLATFORM__.apiBase).replace(/\/?$/, '/');
  }
  if (w.API_BASE) return String(w.API_BASE).replace(/\/?$/, '/');
  // [B51] Platform-aware fallback (Oqtane vs DNN)
  var pf = w.__MF_PLATFORM__ || {};
  var platform = String(pf.platform || '').toLowerCase();
  if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/MegaForm/';
  }
  return '/DesktopModules/MegaForm/API/';
}

// [B53 fix Bug A] Subform endpoints live behind a DIFFERENT route prefix on
// Oqtane: SubformController is bound to /api/MegaFormPopup/[controller]
// (see MegaForm.Oqtane.Server/Controllers/SubformController.cs line 29).
// The main apiBase() returns /api/MegaForm/ for Oqtane, which 404s when the
// Data tab tries to load Tables/Columns/Preview. This helper emits the
// correct prefix per platform so Reload tables works on both DNN and Oqtane.
function subformBase(): string {
  var w: any = window as any;
  if (w.__MF_PLATFORM__ && w.__MF_PLATFORM__.subformApiBase) {
    return String(w.__MF_PLATFORM__.subformApiBase).replace(/\/?$/, '/');
  }
  var pf = w.__MF_PLATFORM__ || {};
  var platform = String(pf.platform || '').toLowerCase();
  if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/MegaFormPopup/';
  }
  return '/DesktopModules/MegaForm/API/';
}

// [B53] AiKnowledge / AiTools controllers live at /api/<Controller>/ on
// Oqtane (NOT /api/MegaForm/<Controller>/). On DNN they share the standard
// /DesktopModules/MegaForm/API/<Controller>/ prefix. This helper picks the
// right one so the Unified Designer AI drawer KB lookups + Data tab SQL
// preview both work on both platforms.
function aiBase(): string {
  var w: any = window as any;
  if (w.__MF_PLATFORM__ && w.__MF_PLATFORM__.aiApiBase) {
    return String(w.__MF_PLATFORM__.aiApiBase).replace(/\/?$/, '/');
  }
  var pf = w.__MF_PLATFORM__ || {};
  var platform = String(pf.platform || '').toLowerCase();
  if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/';
  }
  return '/DesktopModules/MegaForm/API/';
}

function antiForgeryHeader(): Record<string, string> {
  var headers: Record<string, string> = {};
  try {
    var token = (window as any).ServicesFramework
      ? (window as any).ServicesFramework(-1).getAntiForgeryValue()
      : (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value;
    if (token) headers['RequestVerificationToken'] = token;
  } catch (e) {}
  return headers;
}

function fetchJson(url: string, init?: RequestInit): Promise<any> {
  var i: RequestInit = init || {};
  i.credentials = i.credentials || 'same-origin';
  i.headers = Object.assign({}, antiForgeryHeader(), i.headers || {});
  return fetch(url, i).then(function (r) {
    if (!r.ok) {
      return r.text().then(function (t) {
        throw new Error(t || ('HTTP ' + r.status));
      });
    }
    return r.json();
  });
}

// ── Toast helper ──────────────────────────────────────────────
function showToast(msg: string, variant?: 'info' | 'success' | 'error') {
  var v = variant || 'info';
  var host = document.getElementById('mf-unified-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'mf-unified-toast-host';
    host.className = 'mf-unified-designer-toast-host';
    host.setAttribute('data-mf-overlay', '1');
    getMountTarget().appendChild(host);
  }
  var el = document.createElement('div');
  el.className = 'mf-unified-designer-toast mf-unified-designer-toast-' + v;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(function () {
    el.classList.add('is-out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
  }, 2400);
}

// ── Param extraction (for Data tab → queryDependsOn) ─────────
function extractParams(sql: string): string[] {
  var seen: Record<string, boolean> = {};
  var out: string[] = [];
  String(sql || '').replace(/(?::|@)([A-Za-z_][A-Za-z0-9_]*)/g, function (_m, name) {
    var k = String(name || '').toLowerCase();
    // Skip very common SQL keywords / operators that might mis-match.
    if (k === 'top' || k === 'as' || k === 'on' || k === 'in') return _m;
    if (!seen[k]) { seen[k] = true; out.push(name); }
    return _m;
  });
  return out;
}

// ────────────────────────────────────────────────────────────
// Public API #1 — openUnifiedDesigner()
// ────────────────────────────────────────────────────────────
export function openUnifiedDesigner(opts: UnifiedDesignerOpts): UnifiedDesignerHandle {
  injectStyleOnce();
  var existing = document.getElementById('mf-unified-designer-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  // Build the consolidated tab list — auto-prepend Current Settings + Data.
  var hostTabs = (opts.tabs || []).slice();
  var tabs: UnifiedTabSpec[] = [
    buildCurrentSettingsTab(),
    buildDataTab()
  ].concat(hostTabs);

  // Shared draft bag — each tab's getDraft() output is merged into this.
  var stagedDraft: Record<string, any> = {};

  // Build modal shell
  var modal = document.createElement('div');
  modal.id = 'mf-unified-designer-modal';
  modal.className = 'mf-unified-designer-backdrop';
  modal.setAttribute('data-mf-overlay', '1');

  var title = opts.title || 'Widget Designer';
  var badge = opts.badge || ('v20260602 · ' + (opts.widget || 'widget'));

  var tabStripHtml = tabs.map(function (t, i) {
    return '<button type="button" class="mf-unified-designer-tab' + (i === 0 ? ' active' : '') +
      '" data-tab-id="' + escAttr(t.id) + '">' +
      (t.icon ? '<i class="' + escAttr(t.icon) + '"></i> ' : '') +
      escHtml(t.label) +
    '</button>';
  }).join('');

  var paneHtml = tabs.map(function (t, i) {
    return '<div class="mf-unified-designer-pane" data-pane-id="' + escAttr(t.id) + '"' +
      (i === 0 ? '' : ' style="display:none"') + '></div>';
  }).join('');

  // ── AI assist slide-out drawer (KB-only by default) ─────────
  // [B53 fix D] Re-enabled per user decision Q2:
  //   • KB search is the DEFAULT — no LLM billing required.
  //   • POSTs to AiKnowledge/SearchScoped with { widgetType, surface }.
  //   • "Ask AI (premium)" upgrade chip is shown ONLY when
  //     window.MFAiChat.openForWidget is mounted; otherwise it's a
  //     disabled tooltip explaining the upgrade.
  //
  // The drawer slides in from the right via the existing CSS
  // .mf-unified-designer-ai-pane (already shipped in getCss()).
  var hasAiChat = (function () {
    try {
      var w: any = window as any;
      return !!(w && w.MFAiChat && typeof w.MFAiChat.openForWidget === 'function');
    } catch (_e) { return false; }
  })();

  var widgetLabel = String(opts.widget || 'widget');
  var aiSurface   = 'designer';

  var aiToggleHtml =
    '<button type="button" class="mf-unified-designer-ai" title="Ask the knowledge base about this widget" aria-label="AI assist">' +
      '<span class="mf-unified-designer-ai-icon">&#x2728;</span>' +
    '</button>';

  // [B58 ai-drawer-fix] Alias classes `mf-ai-drawer` + `mf-ai-panel` so
  // external probes / smoke harnesses can find the pane via either the
  // canonical `.mf-unified-designer-ai-pane` selector or the generic
  // `.mf-ai-drawer` / `.mf-ai-panel` selectors. No new behaviour — purely
  // a discoverability + back-compat tweak.
  var aiPaneHtml =
    '<div class="mf-unified-designer-ai-pane mf-ai-drawer mf-ai-panel" data-state="closed">' +
      '<div class="mf-unified-designer-ai-head">' +
        '<span><i class="fas fa-sparkles"></i> AI assist</span>' +
        '<button type="button" class="mf-unified-designer-ai-close" aria-label="Close AI pane">&times;</button>' +
      '</div>' +
      '<div class="mf-unified-designer-ai-body">' +
        '<div class="mf-unified-designer-ai-context">' +
          '<span class="mf-unified-designer-ai-ctxchip">' +
            '<i class="fas fa-cube"></i> Designer: <strong>' + escHtml(widgetLabel) + '</strong>' +
          '</span>' +
          '<span class="mf-unified-designer-ai-ctxchip mf-unified-designer-ai-ctxchip-alt">' +
            '<i class="fas fa-layer-group"></i> Surface: <strong>' + escHtml(aiSurface) + '</strong>' +
          '</span>' +
        '</div>' +
        '<div class="mf-unified-designer-ai-searchbox">' +
          '<i class="fas fa-search"></i>' +
          '<input type="search" class="mf-unified-designer-ai-search" placeholder="Ask the KB about this widget…" autocomplete="off"/>' +
        '</div>' +
        '<div class="mf-unified-designer-ai-results" data-state="loading">' +
          '<div class="mf-unified-designer-ai-loading">Loading top KB entries…</div>' +
        '</div>' +
        '<div class="mf-unified-designer-ai-footer">' +
          (hasAiChat
            ? '<button type="button" class="mf-unified-designer-ai-askbtn mf-unified-designer-ai-askbtn-on" title="Open the full Builder AI chat with this widget context">' +
                '<i class="fas fa-bolt"></i> Ask AI (premium)' +
              '</button>'
            : '<button type="button" class="mf-unified-designer-ai-askbtn" disabled title="Premium chat is not available on this site. Contact your admin to enable window.MFAiChat.">' +
                '<i class="fas fa-bolt"></i> Ask AI (premium)' +
              '</button>'
          ) +
        '</div>' +
      '</div>' +
    '</div>';

  modal.innerHTML =
    '<div class="mf-unified-designer-shell" role="dialog" aria-label="' + escAttr(title) + '">' +
      '<div class="mf-unified-designer-head">' +
        '<div class="mf-unified-designer-title">' +
          '<i class="fas fa-magic"></i>' +
          '<span>' + escHtml(title) + '</span>' +
          '<span class="mf-unified-designer-badge">' + escHtml(badge) + '</span>' +
        '</div>' +
        aiToggleHtml +
        '<button type="button" class="mf-unified-designer-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="mf-unified-designer-tabs">' + tabStripHtml + '</div>' +
      '<div class="mf-unified-designer-body">' +
        paneHtml +
        aiPaneHtml +
      '</div>' +
      '<div class="mf-unified-designer-foot">' +
        '<div class="mf-unified-designer-foot-hint">' +
          '<i class="fas fa-info-circle"></i> Press <kbd>Esc</kbd> to cancel. Changes apply only when you click <strong>Apply</strong>.' +
        '</div>' +
        '<button type="button" class="mf-unified-designer-btn mf-unified-designer-cancel">Cancel</button>' +
        '<button type="button" class="mf-unified-designer-btn mf-unified-designer-apply">' +
          '<i class="fas fa-check"></i> Apply' +
        '</button>' +
      '</div>' +
    '</div>';

  getMountTarget().appendChild(modal);

  // ── Context exposed to each tab ────────────────────────────
  var activeTabId = tabs[0].id;

  function focusTab(id: string) {
    var found = tabs.filter(function (x) { return x.id === id; })[0];
    if (!found) return;
    activeTabId = id;
    Array.prototype.forEach.call(
      modal.querySelectorAll('.mf-unified-designer-tab'),
      function (btn: HTMLElement) {
        btn.classList.toggle('active', btn.getAttribute('data-tab-id') === id);
      }
    );
    Array.prototype.forEach.call(
      modal.querySelectorAll('.mf-unified-designer-pane'),
      function (pane: HTMLElement) {
        (pane as any).style.display = pane.getAttribute('data-pane-id') === id ? '' : 'none';
      }
    );
    if (typeof found.onActivate === 'function') {
      try { found.onActivate(); } catch (e) { /* swallow */ }
    }
  }

  var ctx: UnifiedTabContext = {
    stageDraft: function (slice) {
      if (slice && typeof slice === 'object') {
        Object.keys(slice).forEach(function (k) { stagedDraft[k] = slice[k]; });
      }
    },
    focusTab: focusTab,
    toast: showToast,
    opts: opts
  };

  // ── Render each tab into its pane ──────────────────────────
  tabs.forEach(function (t) {
    var pane = modal.querySelector('.mf-unified-designer-pane[data-pane-id="' + cssEscape(t.id) + '"]') as HTMLElement;
    if (!pane) return;
    try {
      t.render(pane, ctx);
    } catch (e: any) {
      pane.innerHTML = '<div class="mf-unified-designer-err">' +
        '<strong>Failed to render tab "' + escHtml(t.id) + '"</strong>' +
        '<pre>' + escHtml(String(e && e.message || e)) + '</pre>' +
      '</div>';
    }
  });

  // ── Tab strip click ────────────────────────────────────────
  Array.prototype.forEach.call(
    modal.querySelectorAll('.mf-unified-designer-tab'),
    function (btn: HTMLElement) {
      btn.addEventListener('click', function () {
        focusTab(btn.getAttribute('data-tab-id') || '');
      });
    }
  );

  // ── AI assist slide-out drawer wiring (KB search + premium chip) ─
  // [B53 fix D] Wired regardless of hasAiChat: KB search is always on,
  // the premium "Ask AI" button is enabled only when MFAiChat is present.
  (function wireAiPane() {
    var aiPane = modal.querySelector('.mf-unified-designer-ai-pane') as HTMLElement | null;
    var aiToggle = modal.querySelector('.mf-unified-designer-ai') as HTMLElement | null;
    var aiClose = modal.querySelector('.mf-unified-designer-ai-close') as HTMLElement | null;
    var searchInput = modal.querySelector('.mf-unified-designer-ai-search') as HTMLInputElement | null;
    var resultsHost = modal.querySelector('.mf-unified-designer-ai-results') as HTMLElement | null;
    var askBtn = modal.querySelector('.mf-unified-designer-ai-askbtn-on') as HTMLElement | null;
    if (!aiPane || !aiToggle || !aiClose || !resultsHost) return;

    var loaded = false;

    // Click a template KB card → fetch its full Body and drop it into the active
    // template editor (Data-tab Form-Submissions template, or Config → Templates).
    resultsHost.addEventListener('click', function (ev) {
      var el = ev.target as HTMLElement;
      var card = el.closest('.mf-unified-designer-ai-card-use, .mf-unified-designer-ai-card[data-kind*="template" i]') as HTMLElement | null;
      if (!card) return;
      var slug = card.getAttribute('data-slug') || '';
      if (!slug) return;
      var ta = (modal!.querySelector('.mf-uds-sub-template')
        || document.getElementById('mfdr-masterTemplate')) as HTMLTextAreaElement | null;
      if (!ta) { ctx.toast('Open the Data tab (Form Submissions) or Config → Templates first', 'error'); return; }
      ctx.toast('Loading template…', 'info');
      fetchJson(aiBase() + 'AiKnowledge/Get?slug=' + encodeURIComponent(slug), { method: 'GET' }).then(function (resp: any) {
        var tpl = String((resp && (resp.body || resp.Body)) || '');
        if (!tpl.trim()) { ctx.toast('That entry has no template body', 'error'); return; }
        ta!.value = tpl;
        ta!.dispatchEvent(new Event('input', { bubbles: true }));
        ta!.dispatchEvent(new Event('change', { bubbles: true }));
        ctx.toast('Template applied — edit it, then Apply', 'success');
        var dataTabBtn = modal!.querySelector('.mf-uds-sub-template') ? 'data' : '';
        if (dataTabBtn) focusTab('data');
      }).catch(function () { ctx.toast('Could not load the template', 'error'); });
    });

    function renderResults(items: any[]) {
      if (!items || !items.length) {
        resultsHost!.setAttribute('data-state', 'empty');
        resultsHost!.innerHTML = '<div class="mf-unified-designer-ai-empty">No matching KB entries. Try different keywords or seed widget guidance via the Builder AI Knowledge admin panel.</div>';
        return;
      }
      resultsHost!.setAttribute('data-state', 'ready');
      resultsHost!.innerHTML = items.slice(0, 10).map(function (it: any) {
        var title = String(it && (it.title || it.Title || it.slug || it.Slug) || '(untitled)');
        var summary = String(it && (it.summary || it.Summary || '') || '');
        var slug = String(it && (it.slug || it.Slug) || '');
        var kind = String(it && (it.kind || it.Kind) || '');
        var isTpl = /template/i.test(kind);
        return '<article class="mf-unified-designer-ai-card" data-slug="' + escAttr(slug) + '" data-kind="' + escAttr(kind) + '"' +
            (isTpl ? ' style="cursor:pointer"' : '') + '>' +
          '<div class="mf-unified-designer-ai-card-head">' +
            '<span class="mf-unified-designer-ai-card-kind">' + escHtml(kind || 'kb') + '</span>' +
            '<span class="mf-unified-designer-ai-card-title">' + escHtml(title) + '</span>' +
          '</div>' +
          (summary ? '<p class="mf-unified-designer-ai-card-body">' + escHtml(summary.length > 220 ? summary.slice(0, 220) + '…' : summary) + '</p>' : '') +
          (isTpl ? '<button type="button" class="mf-unified-designer-ai-card-use" data-slug="' + escAttr(slug) + '" style="margin-top:6px;background:#0ea5e9;color:#fff;border:0;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">↳ Use this template</button>' : '') +
        '</article>';
      }).join('');
    }

    function loadKb(query?: string) {
      resultsHost!.setAttribute('data-state', 'loading');
      resultsHost!.innerHTML = '<div class="mf-unified-designer-ai-loading">Searching…</div>';
      var body: any = {
        widgetType: widgetLabel,
        surface: aiSurface,
        limit: query ? 10 : 5
      };
      if (query && query.trim()) body.query = query.trim();
      fetchJson(aiBase() + 'AiKnowledge/SearchScoped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (resp: any) {
        var items = (resp && (resp.results || resp.entries || resp)) || [];
        if (!Array.isArray(items)) items = [];
        renderResults(items);
        loaded = true;
      }).catch(function (e: any) {
        resultsHost!.setAttribute('data-state', 'error');
        resultsHost!.innerHTML = '<div class="mf-unified-designer-ai-err">' +
          '<strong>KB search unavailable.</strong><br/>' +
          '<small>' + escHtml(String(e && e.message || e)) + '</small><br/>' +
          '<small>The AiKnowledge/SearchScoped endpoint may be missing on this platform — ship B53 migration.</small>' +
          '</div>';
      });
    }

    var openAi = function () {
      aiPane!.setAttribute('data-state', 'open');
      // [B59 ai-drawer-visible] Belt-and-braces: force inline visibility in
      // case host CSS overrides `transform:translateX(0)` or hides the pane
      // with display:none. The CSS slide-in animation still runs via the
      // data-state="open" selector; these inline styles only ensure the
      // pane is rendered and reachable by smoke probes.
      try {
        aiPane!.style.display = 'flex';
        aiPane!.style.visibility = 'visible';
        aiPane!.style.transform = 'translateX(0)';
      } catch (_e) { /* defensive */ }
      if (!loaded) loadKb();
    };
    var closeAi = function () {
      aiPane!.setAttribute('data-state', 'closed');
      try { aiPane!.style.transform = ''; } catch (_e) { /* defensive */ }
    };

    aiToggle.addEventListener('click', function (ev: Event) {
      // [B59] Prevent the click from bubbling to the backdrop handler at
      // modal.addEventListener('click') below — that handler closes the
      // entire designer when target === modal, but if the sparkle button
      // event ever reaches there with the wrong target the pane vanishes.
      try { ev.stopPropagation(); } catch (_e) {}
      var open = aiPane!.getAttribute('data-state') === 'open';
      if (open) closeAi(); else openAi();
    });
    aiClose.addEventListener('click', closeAi);

    if (searchInput) {
      var debounceT: any = null;
      searchInput.addEventListener('input', function () {
        if (debounceT) clearTimeout(debounceT);
        debounceT = setTimeout(function () { loadKb(searchInput!.value); }, 250);
      });
      searchInput.addEventListener('keydown', function (e: KeyboardEvent) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (debounceT) clearTimeout(debounceT);
          loadKb(searchInput!.value);
        }
      });
    }

    if (askBtn) {
      askBtn.addEventListener('click', function () {
        try {
          var w: any = window as any;
          if (w && w.MFAiChat && typeof w.MFAiChat.openForWidget === 'function') {
            w.MFAiChat.openForWidget({
              widget: widgetLabel,
              surface: aiSurface,
              currentProps: ctx.opts.currentProps || {},
              seedQuery: (searchInput && searchInput.value) || ''
            });
          }
        } catch (e) { /* swallow */ }
      });
    }
  })();

  // ── Apply / Cancel / Close ─────────────────────────────────
  function mergeAllDrafts(): Record<string, any> {
    var merged: Record<string, any> = {};
    // Start with anything tabs staged via ctx.stageDraft (e.g. Data tab).
    Object.keys(stagedDraft).forEach(function (k) { merged[k] = stagedDraft[k]; });
    // Then layer each tab's getDraft() output (host tabs override Data tab on conflict).
    tabs.forEach(function (t) {
      if (typeof t.getDraft !== 'function') return;
      try {
        var slice = t.getDraft();
        if (slice && typeof slice === 'object') {
          Object.keys(slice).forEach(function (k) { merged[k] = (slice as any)[k]; });
        }
      } catch (e) { /* skip */ }
    });
    return merged;
  }

  function close(reason: string) {
    // [v1] no confirm-if-dirty; accept ALL closes per design contract.
    if (modal.parentNode) modal.parentNode.removeChild(modal);
    document.removeEventListener('keydown', onEsc);
    if (typeof opts.onClose === 'function') {
      try { opts.onClose(); } catch (e) {}
    }
  }
  function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') close('esc'); }
  document.addEventListener('keydown', onEsc);

  (modal.querySelector('.mf-unified-designer-close') as HTMLElement)
    .addEventListener('click', function () { close('x'); });
  (modal.querySelector('.mf-unified-designer-cancel') as HTMLElement)
    .addEventListener('click', function () { close('cancel'); });
  (modal.querySelector('.mf-unified-designer-apply') as HTMLElement)
    .addEventListener('click', function () {
      var merged = mergeAllDrafts();
      try {
        if (typeof opts.onApply === 'function') opts.onApply(merged);
      } catch (e: any) {
        showToast('Apply failed: ' + (e && e.message || e), 'error');
        return;
      }
      showToast('Applied changes', 'success');
      close('apply');
    });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) close('backdrop');
  });

  return {
    close: function () { close('host'); },
    focusTab: focusTab,
    root: modal
  };
}

// ────────────────────────────────────────────────────────────
// Public API #2 — buildCurrentSettingsTab()
// ────────────────────────────────────────────────────────────
export function buildCurrentSettingsTab(): UnifiedTabSpec {
  return {
    id: 'current-settings',
    label: 'Current Settings',
    icon: 'fas fa-clipboard-list',
    getDraft: function () { return {}; }, // read-only tab
    render: function (host, ctx) {
      var p = (ctx.opts.currentProps || {}) as Record<string, any>;
      // [B53 fix Bug B] Recipe/Template group keys were missing per-widget
      // canonical names — Razor uses templateName + razorSourceOverride,
      // DynLabel uses tplKey + mode + displayMode, DataGrid uses layoutPreset,
      // etc. Expanded the key list so the group renders for every widget
      // that has ANY of these props set. The catch-all "Other" section
      // below still picks up novel keys silently.
      var groups = [
        {
          title: 'Data binding',
          keys: ['useSql', 'dataSource', 'connectionKey', 'databaseType', 'masterQuery', 'queryDependsOn']
        },
        {
          title: 'Recipe / template',
          keys: [
            // Razor
            'templateName', 'razorSourceOverride', 'razorRecipe', 'razorRecipeId', 'razorTemplate',
            // DynamicLabel
            'tplKey', 'mode', 'displayMode', 'renderingMode', 'templateKey',
            // Cross-widget
            'recipe', 'recipeName', 'recipeId', 'recipeFile',
            'preset', 'variant', 'cardStyle', 'layout',
            'layoutPreset', 'sliderPreset', 'imageGalleryPreset', 'cardPreset'
          ]
        },
        {
          title: 'Display',
          keys: ['height', 'width', 'columns', 'rows', 'autoplay', 'interval', 'pageSize', 'showHeader', 'showFooter', 'striped']
        }
      ];

      var parts: string[] = [];
      parts.push(
        '<div class="mf-unified-designer-curset-head">' +
          '<div class="mf-unified-designer-curset-title">' +
            '<i class="fas fa-eye"></i> Current widget configuration (read-only)' +
          '</div>' +
          '<button type="button" class="mf-unified-designer-btn mf-unified-designer-curset-copy">' +
            '<i class="fas fa-copy"></i> Copy JSON' +
          '</button>' +
        '</div>'
      );

      groups.forEach(function (g) {
        var rows: string[] = [];
        g.keys.forEach(function (k) {
          if (!(k in p)) return;
          var raw = p[k];
          var disp = '';
          if (raw == null) {
            disp = '<em class="mf-unified-designer-curset-null">(unset)</em>';
          } else if (k === 'masterQuery' && typeof raw === 'string') {
            disp = '<code class="mf-unified-designer-curset-sql">' +
              escHtml(raw.length > 240 ? raw.slice(0, 240) + '…' : raw) +
            '</code>';
          } else if (Array.isArray(raw)) {
            disp = '<code>' + escHtml(JSON.stringify(raw)) + '</code>';
          } else if (typeof raw === 'object') {
            disp = '<code>' + escHtml(JSON.stringify(raw)) + '</code>';
          } else {
            disp = '<code>' + escHtml(String(raw)) + '</code>';
          }
          rows.push(
            '<div class="mf-unified-designer-curset-row">' +
              '<div class="mf-unified-designer-curset-key">' + escHtml(k) + '</div>' +
              '<div class="mf-unified-designer-curset-val">' + disp + '</div>' +
            '</div>'
          );
        });
        // [VisualQA-B45] Skip empty groups — do not render header strip or placeholder
        // when the group has zero matching props. Matches the catch-all "Other" pattern below.
        if (!rows.length) return;
        parts.push(
          '<section class="mf-unified-designer-curset-group">' +
            '<header class="mf-unified-designer-curset-group-head">' + escHtml(g.title) + '</header>' +
            '<div class="mf-unified-designer-curset-group-body">' + rows.join('') + '</div>' +
          '</section>'
        );
      });

      // Other / catch-all
      var known: Record<string, boolean> = {};
      groups.forEach(function (g) { g.keys.forEach(function (k) { known[k] = true; }); });
      var leftover = Object.keys(p).filter(function (k) { return !known[k]; });
      if (leftover.length) {
        var otherRows: string[] = [];
        leftover.forEach(function (k) {
          var raw = p[k];
          var disp = (raw == null) ? '<em class="mf-unified-designer-curset-null">(unset)</em>'
            : '<code>' + escHtml(typeof raw === 'object' ? JSON.stringify(raw) : String(raw)) + '</code>';
          otherRows.push(
            '<div class="mf-unified-designer-curset-row">' +
              '<div class="mf-unified-designer-curset-key">' + escHtml(k) + '</div>' +
              '<div class="mf-unified-designer-curset-val">' + disp + '</div>' +
            '</div>'
          );
        });
        parts.push(
          '<section class="mf-unified-designer-curset-group">' +
            '<header class="mf-unified-designer-curset-group-head">Other</header>' +
            '<div class="mf-unified-designer-curset-group-body">' + otherRows.join('') + '</div>' +
          '</section>'
        );
      }

      host.innerHTML = parts.join('');

      // Copy-JSON button
      var copyBtn = host.querySelector('.mf-unified-designer-curset-copy') as HTMLButtonElement;
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var text = JSON.stringify(ctx.opts.currentProps || {}, null, 2);
          var done = function () { ctx.toast('Copied current props to clipboard', 'success'); };
          var fail = function () { ctx.toast('Copy failed — open dev tools to read', 'error'); };
          try {
            if ((navigator as any).clipboard && (navigator as any).clipboard.writeText) {
              (navigator as any).clipboard.writeText(text).then(done, fail);
            } else {
              // legacy fallback
              var ta = document.createElement('textarea');
              ta.value = text;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              done();
            }
          } catch (e) { fail(); }
        });
      }
      // NOTE: Reset-to-defaults is intentionally deferred to v1.1.
    }
  };
}

// ────────────────────────────────────────────────────────────
// Public API #3 — buildDataTab()
// ────────────────────────────────────────────────────────────
export function buildDataTab(): UnifiedTabSpec {
  // Captured outer state so getDraft() can return what was last staged.
  var stagedSlice: Record<string, any> = {};

  return {
    id: 'data',
    label: 'Data',
    icon: 'fas fa-database',
    getDraft: function () { return stagedSlice; },
    render: function (host, ctx) {
      var initial = ctx.opts.currentProps || {};
      var defaultConn = String(initial.connectionKey || 'DashboardDatabase');
      var defaultDbType = String(initial.databaseType || 'auto');
      var defaultSql = String(initial.masterQuery || '');

      var initWl = initial.fieldWhitelistCsv ? String(initial.fieldWhitelistCsv)
        : (Array.isArray(initial.fieldWhitelist) ? initial.fieldWhitelist.join(', ') : '');

      host.innerHTML =
        // ── Data-source toggle: SQL vs Form Submissions (SDK) ──
        '<div class="mf-uds-source-toggle" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #e2e8f0;margin-bottom:8px">' +
          '<span class="mf-unified-designer-lbl" style="margin:0">Data source</span>' +
          '<button type="button" class="mf-unified-designer-btn mf-uds-src-btn" data-src="sql">SQL Database</button>' +
          '<button type="button" class="mf-unified-designer-btn mf-uds-src-btn" data-src="megaform_submissions">Form Submissions (SDK)</button>' +
        '</div>' +
        // ── Form Submissions mode (reads via the MegaForm SDK — no SQL) ──
        '<div class="mf-uds-sub-mode" style="display:none">' +
          '<div style="padding:4px 10px 12px;display:flex;flex-direction:column;gap:10px;max-width:680px">' +
            '<div><label class="mf-unified-designer-lbl">Source form ID <span style="color:#64748b">(0 = this form)</span></label>' +
              '<div style="display:flex;gap:6px;align-items:center">' +
                '<input type="number" class="mf-unified-designer-input mf-uds-sub-formid" value="' + escAttr(String(initial.submissionsFormId || '')) + '" placeholder="e.g. 56" style="max-width:160px"/>' +
                '<button type="button" class="mf-unified-designer-btn mf-uds-sub-loadfields"><i class="fas fa-list"></i> Load field keys</button>' +
              '</div>' +
            '</div>' +
            '<div class="mf-uds-sub-fields" style="display:flex;flex-wrap:wrap;gap:6px"></div>' +
            '<div><label class="mf-unified-designer-lbl">Status filter <span style="color:#64748b">(blank = all non-spam)</span></label>' +
              '<input type="text" class="mf-unified-designer-input mf-uds-sub-status" value="' + escAttr(String(initial.statusFilter || '')) + '" placeholder="e.g. approved" style="max-width:240px"/></div>' +
            '<div><label class="mf-unified-designer-lbl">Public fields — comma-separated keys; <strong>ONLY these are shown</strong></label>' +
              '<textarea class="mf-unified-designer-input mf-uds-sub-whitelist" rows="2" spellcheck="false" placeholder="first_name, last_name, __date">' + escHtml(initWl) + '</textarea></div>' +
            '<div><label class="mf-unified-designer-lbl">Row/table template ' +
                '<span style="color:#64748b">(empty = auto table — this is exactly what renders the grid)</span> ' +
                '<button type="button" class="mf-unified-designer-btn mf-uds-sub-gentpl" style="font-size:11px;margin-left:6px"><i class="fas fa-bolt"></i> Generate from fields</button></label>' +
              '<textarea class="mf-unified-designer-input mf-uds-sub-template" rows="6" spellcheck="false" placeholder="Leave empty for an auto table, or click Generate to see/edit the HTML. Tokens = field keys: {first_name}, {__date}. Wrap rows in {#each row}…{/each}.">' + escHtml(String(initial.masterTemplate || '')) + '</textarea></div>' +
            '<div class="mf-unified-designer-data-hint"><i class="fas fa-shield-alt"></i> Reads via the MegaForm SDK (no SQL). Only whitelisted fields leave the server — email/phone stay private unless listed; spam always excluded. Pseudo-keys: <code>__date</code>, <code>__id</code>, <code>__status</code>.</div>' +
          '</div>' +
        '</div>' +
        // ── SQL mode (existing) ──
        '<div class="mf-uds-sql-mode">' +
        '<div class="mf-unified-designer-data-grid">' +
          // ── Left rail: table list ─────────────────────────
          '<aside class="mf-unified-designer-data-left">' +
            '<div class="mf-unified-designer-data-conn">' +
              '<label class="mf-unified-designer-lbl">Connection</label>' +
              '<input type="text" class="mf-unified-designer-input mf-unified-designer-data-conn-input" value="' + escAttr(defaultConn) + '" placeholder="DashboardDatabase"/>' +
              '<label class="mf-unified-designer-lbl">Database type</label>' +
              '<select class="mf-unified-designer-input mf-unified-designer-data-dbtype">' +
                ['auto', 'SqlServer', 'Sqlite', 'PostgreSql', 'MySql'].map(function (v) {
                  return '<option value="' + v + '"' + (v === defaultDbType ? ' selected' : '') + '>' + v + '</option>';
                }).join('') +
              '</select>' +
              '<button type="button" class="mf-unified-designer-btn mf-unified-designer-data-reload">' +
                '<i class="fas fa-sync"></i> Reload tables' +
              '</button>' +
            '</div>' +
            '<div class="mf-unified-designer-data-search">' +
              '<input type="search" class="mf-unified-designer-input mf-unified-designer-data-search-input" placeholder="Search tables…"/>' +
            '</div>' +
            '<div class="mf-unified-designer-data-tables" data-state="idle">' +
              '<div class="mf-unified-designer-data-loading">Loading tables…</div>' +
            '</div>' +
          '</aside>' +
          // ── Right: SQL editor + preview ───────────────────
          '<section class="mf-unified-designer-data-right">' +
            '<div class="mf-unified-designer-data-sql-head">' +
              '<label class="mf-unified-designer-lbl">Generated SQL</label>' +
              '<div class="mf-unified-designer-data-sql-actions">' +
                '<button type="button" class="mf-unified-designer-btn mf-unified-designer-data-gen" title="Generate SELECT for the picked table">' +
                  '<i class="fas fa-bolt"></i> Generate SELECT' +
                '</button>' +
                '<button type="button" class="mf-unified-designer-btn mf-unified-designer-data-run">' +
                  '<i class="fas fa-play"></i> Run preview' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<textarea class="mf-unified-designer-data-sql" rows="6" spellcheck="false" placeholder="SELECT TOP 50 * FROM dbo.YourTable">' + escHtml(defaultSql) + '</textarea>' +
            '<div class="mf-unified-designer-data-err" style="display:none"></div>' +
            '<div class="mf-unified-designer-data-preview"></div>' +
            '<div class="mf-unified-designer-data-footer">' +
              '<div class="mf-unified-designer-data-hint">' +
                '<i class="fas fa-info-circle"></i> Apply data view stages the query; click <strong>Apply</strong> at the bottom to commit.' +
              '</div>' +
              '<button type="button" class="mf-unified-designer-btn mf-unified-designer-data-apply">' +
                '<i class="fas fa-check-circle"></i> Apply data view' +
              '</button>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '</div>'; // close .mf-uds-sql-mode

      var connInput = host.querySelector('.mf-unified-designer-data-conn-input') as HTMLInputElement;
      var dbSelect = host.querySelector('.mf-unified-designer-data-dbtype') as HTMLSelectElement;
      var searchInput = host.querySelector('.mf-unified-designer-data-search-input') as HTMLInputElement;
      var tableHost = host.querySelector('.mf-unified-designer-data-tables') as HTMLElement;
      var sqlInput = host.querySelector('.mf-unified-designer-data-sql') as HTMLTextAreaElement;
      var errBox = host.querySelector('.mf-unified-designer-data-err') as HTMLElement;
      var previewHost = host.querySelector('.mf-unified-designer-data-preview') as HTMLElement;

      var tablesCache: any[] = [];
      var pickedTable: { schema: string; name: string; columns?: any[] } | null = null;

      function showErr(msg: string) {
        if (!msg) { errBox.style.display = 'none'; errBox.textContent = ''; return; }
        errBox.style.display = '';
        errBox.textContent = msg;
      }

      function renderTables(list: any[]) {
        var q = String(searchInput.value || '').toLowerCase().trim();
        var filt = q ? list.filter(function (t) {
          return String(t.name || '').toLowerCase().indexOf(q) >= 0
            || String(t.schema || '').toLowerCase().indexOf(q) >= 0;
        }) : list;
        if (!filt.length) {
          tableHost.innerHTML = '<div class="mf-unified-designer-data-empty">No tables matched.</div>';
          return;
        }
        var html = filt.map(function (t) {
          var schema = String(t.schema || 'dbo');
          var name = String(t.name || '');
          return '<div class="mf-unified-designer-data-table" data-name="' + escAttr(name) + '" data-schema="' + escAttr(schema) + '">' +
            '<div class="mf-unified-designer-data-table-head">' +
              '<span class="mf-unified-designer-data-table-schema">' + escHtml(schema) + '</span>' +
              '<span class="mf-unified-designer-data-table-name">' + escHtml(name) + '</span>' +
            '</div>' +
            '<div class="mf-unified-designer-data-table-cols"></div>' +
          '</div>';
        }).join('');
        tableHost.innerHTML = html;

        Array.prototype.forEach.call(
          tableHost.querySelectorAll('.mf-unified-designer-data-table'),
          function (row: HTMLElement) {
            row.querySelector('.mf-unified-designer-data-table-head')!.addEventListener('click', function () {
              var name = row.getAttribute('data-name') || '';
              var schema = row.getAttribute('data-schema') || 'dbo';
              var open = row.classList.toggle('is-open');
              // collapse siblings
              Array.prototype.forEach.call(
                tableHost.querySelectorAll('.mf-unified-designer-data-table'),
                function (r: HTMLElement) { if (r !== row) r.classList.remove('is-open'); }
              );
              if (!open) return;
              pickedTable = { schema: schema, name: name };
              loadColumns(name).then(function (cols) {
                pickedTable!.columns = cols;
                var colHost = row.querySelector('.mf-unified-designer-data-table-cols') as HTMLElement;
                colHost.innerHTML = (cols || []).map(function (c: any) {
                  var isPk = !!c.isPrimary;
                  return '<span class="mf-unified-designer-data-col' + (isPk ? ' is-pk' : '') + '">' +
                    escHtml(c.name) +
                    '<span class="mf-unified-designer-data-col-type">' + escHtml(c.dataType || '') + '</span>' +
                  '</span>';
                }).join('') || '<em>No columns.</em>';
                // Seed SQL if textarea is empty
                if (!sqlInput.value.trim()) seedSelect();
              }).catch(function (e: any) {
                showErr('Columns: ' + (e && e.message || e));
              });
            });
          }
        );
      }

      function seedSelect() {
        if (!pickedTable) return;
        var schema = pickedTable.schema || 'dbo';
        var cols = (pickedTable.columns || []).map(function (c: any) {
          return '[' + String(c.name) + ']';
        });
        var colList = cols.length ? cols.join(', ') : '*';
        var sql = 'SELECT TOP 50 ' + colList + '\nFROM [' + schema + '].[' + pickedTable.name + ']';
        sqlInput.value = sql;
      }

      function loadTables() {
        tableHost.innerHTML = '<div class="mf-unified-designer-data-loading">Loading tables…</div>';
        // [B53 fix Bug A] Use subformBase() so Oqtane resolves to
        // /api/MegaFormPopup/Subform/Tables (the actual route on
        // MegaForm.Oqtane.Server/Controllers/SubformController.cs).
        var url = subformBase() + 'Subform/Tables?connectionKey=' + encodeURIComponent(connInput.value || 'DashboardDatabase');
        fetchJson(url).then(function (resp) {
          tablesCache = (resp && resp.tables) || [];
          if (!tablesCache.length) {
            showToast('No tables found on connection "' + (connInput.value || 'DashboardDatabase') + '" — check connection key or permissions', 'error');
          }
          renderTables(tablesCache);
        }).catch(function (e: any) {
          var msg = String(e && e.message || e);
          tableHost.innerHTML = '<div class="mf-unified-designer-data-err">Failed: ' + escHtml(msg) + '</div>';
          showToast('Reload tables failed: ' + msg, 'error');
        });
      }

      function loadColumns(tableName: string): Promise<any[]> {
        var url = subformBase() + 'Subform/Columns?tableName=' + encodeURIComponent(tableName) +
          '&connectionKey=' + encodeURIComponent(connInput.value || 'DashboardDatabase');
        return fetchJson(url).then(function (resp) { return (resp && resp.columns) || []; });
      }

      function runPreview() {
        showErr('');
        previewHost.innerHTML = '<div class="mf-unified-designer-data-loading">Running…</div>';
        var body = {
          sql: sqlInput.value || '',
          connectionKey: connInput.value || 'DashboardDatabase',
          databaseType: dbSelect.value || 'auto',
          page: 1,
          pageSize: 25
        };
        // [B53] AiTools controller routes at /api/AiTools/ on Oqtane (NOT
        // /api/MegaForm/AiTools/). Use aiBase() so Run preview works on both
        // platforms — was silently 404ing on Oqtane via the wrong prefix.
        fetchJson(aiBase() + 'AiTools/PreviewSql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (resp) {
          renderPreview(resp);
        }).catch(function (e: any) {
          previewHost.innerHTML = '';
          showErr(String(e && e.message || e));
        });
      }

      function renderPreview(resp: any) {
        var cols: string[] = (resp && resp.columns) || [];
        var rows: any[] = (resp && resp.rows) || [];
        if (!cols.length && !rows.length) {
          previewHost.innerHTML = '<div class="mf-unified-designer-data-empty">No rows.</div>';
          return;
        }
        var head = '<thead><tr>' + cols.map(function (c) {
          return '<th>' + escHtml(c) + '</th>';
        }).join('') + '</tr></thead>';
        var limited = rows.slice(0, 25);
        var body = '<tbody>' + limited.map(function (r: any) {
          return '<tr>' + cols.map(function (c) {
            var v = r && (r[c] != null ? r[c] : '');
            return '<td>' + escHtml(typeof v === 'object' ? JSON.stringify(v) : String(v)) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody>';
        previewHost.innerHTML =
          '<div class="mf-unified-designer-data-preview-meta">' +
            'Showing ' + limited.length + ' of ' + rows.length + ' rows' +
          '</div>' +
          '<div class="mf-unified-designer-data-preview-scroll">' +
            '<table class="mf-unified-designer-data-preview-table">' + head + body + '</table>' +
          '</div>';
      }

      function applyDataView() {
        var sql = sqlInput.value || '';
        if (!sql.trim()) {
          ctx.toast('Enter a query first', 'error');
          return;
        }
        var slice: Record<string, any> = {
          // Set dataSource so switching back to SQL overrides a prior "megaform_submissions".
          dataSource: (String(initial.dataSource || '') === 'storedproc' ? 'storedproc' : 'sql'),
          useSql: true,
          masterQuery: sql,
          connectionKey: connInput.value || 'DashboardDatabase',
          databaseType: dbSelect.value || 'auto',
          queryDependsOn: extractParams(sql)
        };
        stagedSlice = slice;
        ctx.stageDraft(slice);
        ctx.toast('Data view staged — click Apply at the bottom to commit', 'success');
        // Per design contract, focus the FIRST HOST tab (not current-settings, not data).
        var allTabIds = Array.prototype.map.call(
          host.closest('.mf-unified-designer-shell')!.querySelectorAll('.mf-unified-designer-tab'),
          function (b: HTMLElement) { return b.getAttribute('data-tab-id') || ''; }
        ) as string[];
        var firstHost = allTabIds.filter(function (id) {
          return id !== 'current-settings' && id !== 'data';
        })[0];
        if (firstHost) ctx.focusTab(firstHost);
      }

      // Wiring
      searchInput.addEventListener('input', function () { renderTables(tablesCache); });
      (host.querySelector('.mf-unified-designer-data-reload') as HTMLElement)
        .addEventListener('click', loadTables);
      (host.querySelector('.mf-unified-designer-data-gen') as HTMLElement)
        .addEventListener('click', seedSelect);
      (host.querySelector('.mf-unified-designer-data-run') as HTMLElement)
        .addEventListener('click', runPreview);
      (host.querySelector('.mf-unified-designer-data-apply') as HTMLElement)
        .addEventListener('click', applyDataView);

      // ── Data-source mode: SQL vs Form Submissions (SDK) ──
      var sqlModeEl = host.querySelector('.mf-uds-sql-mode') as HTMLElement;
      var subModeEl = host.querySelector('.mf-uds-sub-mode') as HTMLElement;
      var srcBtns = host.querySelectorAll('.mf-uds-src-btn');
      var subFormId = host.querySelector('.mf-uds-sub-formid') as HTMLInputElement;
      var subStatus = host.querySelector('.mf-uds-sub-status') as HTMLInputElement;
      var subWhitelist = host.querySelector('.mf-uds-sub-whitelist') as HTMLTextAreaElement;
      var subFieldsHost = host.querySelector('.mf-uds-sub-fields') as HTMLElement;
      var subTemplate = host.querySelector('.mf-uds-sub-template') as HTMLTextAreaElement;
      var subLabels: Record<string, string> = {};   // key -> label (from Load field keys / Generate)
      var currentMode = (String(initial.dataSource || '') === 'megaform_submissions') ? 'megaform_submissions' : 'sql';

      function paintMode() {
        if (sqlModeEl) sqlModeEl.style.display = currentMode === 'sql' ? '' : 'none';
        if (subModeEl) subModeEl.style.display = currentMode === 'megaform_submissions' ? '' : 'none';
        Array.prototype.forEach.call(srcBtns, function (b: HTMLElement) {
          var on = b.getAttribute('data-src') === currentMode;
          b.style.background = on ? '#0ea5e9' : '';
          b.style.color = on ? '#fff' : '';
          b.style.fontWeight = on ? '600' : '';
        });
      }

      function stageSubmissions() {
        var wl = String(subWhitelist.value || '').split(',').map(function (s) { return s.trim(); })
          .filter(function (s, i, a) { return !!s && a.indexOf(s) === i; });
        stagedSlice = {
          dataSource: 'megaform_submissions',
          useSql: false,
          submissionsFormId: parseInt(subFormId.value, 10) || 0,
          statusFilter: String(subStatus.value || ''),
          fieldWhitelist: wl,                       // canonical array (overwrites any prior array on Apply)
          fieldWhitelistCsv: String(subWhitelist.value || ''),
          masterTemplate: subTemplate ? String(subTemplate.value || '') : ''  // empty = auto table
        };
        ctx.stageDraft(stagedSlice);
      }

      // Build a starter table template from the whitelist keys (+ labels when known).
      function genSubmissionTemplate(keys: string[]): string {
        var hdr = '<tr>' + keys.map(function (k) { return '<th>' + escHtml(subLabels[k] || k) + '</th>'; }).join('') + '</tr>';
        var body = '<tr class="mfdr-row">' + keys.map(function (k) { return '<td>{' + k + '}</td>'; }).join('') + '</tr>';
        return '<table class="mfdr-table">\n  <thead>' + hdr + '</thead>\n  <tbody>{#each row}' + body + '{/each}</tbody>\n</table>';
      }

      Array.prototype.forEach.call(srcBtns, function (b: HTMLElement) {
        b.addEventListener('click', function () {
          currentMode = b.getAttribute('data-src') || 'sql';
          paintMode();
          if (currentMode === 'megaform_submissions') stageSubmissions();
        });
      });
      [subFormId, subStatus, subWhitelist, subTemplate].forEach(function (el) {
        if (el) el.addEventListener('input', function () { if (currentMode === 'megaform_submissions') stageSubmissions(); });
      });

      // "Generate from fields" — build a visible/editable table template from the whitelist.
      var genBtn = host.querySelector('.mf-uds-sub-gentpl') as HTMLElement;
      if (genBtn) genBtn.addEventListener('click', function () {
        var keys = String(subWhitelist.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!keys.length) { ctx.toast('Add some whitelist fields first', 'error'); return; }
        function apply() { subTemplate.value = genSubmissionTemplate(keys); stageSubmissions(); ctx.toast('Template generated — edit it, then Apply', 'success'); }
        var fid = parseInt(subFormId.value, 10) || 0;
        if (fid && Object.keys(subLabels).length === 0) {
          fetchJson(apiBase() + 'Form/Get?formId=' + fid, { method: 'GET' }).then(function (form: any) {
            try {
              var sc = JSON.parse((form && (form.schemaJson || form.SchemaJson)) || '{}');
              (function w(fl: any[]) { (fl || []).forEach(function (f: any) { if (f && f.key) subLabels[f.key] = f.label || f.key; if (f && f.columns) f.columns.forEach(function (c: any) { w(c && c.fields); }); }); })(sc.fields);
              (sc.pages || []).forEach(function (p: any) { (function w(fl: any[]) { (fl || []).forEach(function (f: any) { if (f && f.key) subLabels[f.key] = f.label || f.key; }); })(p && p.fields); });
            } catch (_e) {}
            apply();
          }).catch(function () { apply(); });
        } else { apply(); }
      });

      var loadFieldsBtn = host.querySelector('.mf-uds-sub-loadfields') as HTMLElement;
      if (loadFieldsBtn) loadFieldsBtn.addEventListener('click', function () {
        var fid = parseInt(subFormId.value, 10) || 0;
        if (!fid) { ctx.toast('Enter a form ID first', 'error'); return; }
        subFieldsHost.innerHTML = '<span class="mf-unified-designer-lbl">Loading…</span>';
        fetchJson(apiBase() + 'Form/Get?formId=' + fid, { method: 'GET' }).then(function (form: any) {
          var schemaRaw = (form && (form.schemaJson || form.SchemaJson)) || '{}';
          var schema: any = {}; try { schema = JSON.parse(schemaRaw); } catch (_e) {}
          var keys: any[] = [];
          function walk(fl: any[]) {
            (fl || []).forEach(function (f: any) {
              if (f && f.key) keys.push({ key: f.key, label: f.label || f.key });
              if (f && f.columns) f.columns.forEach(function (c: any) { walk(c && c.fields); });
            });
          }
          walk(schema.fields); (schema.pages || []).forEach(function (p: any) { walk(p && p.fields); });
          if (!keys.length) { subFieldsHost.innerHTML = '<span class="mf-unified-designer-lbl">No fields found — type keys manually.</span>'; return; }
          subFieldsHost.innerHTML =
            '<span class="mf-unified-designer-lbl" style="width:100%">Click to add to the whitelist:</span>' +
            keys.map(function (k) {
              return '<button type="button" class="mf-unified-designer-btn mf-uds-chip" data-key="' + escAttr(k.key) + '" title="' + escAttr(k.label) + '" style="font-size:11px">+ ' + escHtml(k.key) + '</button>';
            }).join('');
          Array.prototype.forEach.call(subFieldsHost.querySelectorAll('.mf-uds-chip'), function (chip: HTMLElement) {
            chip.addEventListener('click', function () {
              var k = chip.getAttribute('data-key') || '';
              var cur = String(subWhitelist.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
              if (cur.indexOf(k) < 0) { cur.push(k); subWhitelist.value = cur.join(', '); stageSubmissions(); }
            });
          });
        }).catch(function () { subFieldsHost.innerHTML = '<span class="mf-unified-designer-lbl">Could not load fields — type keys manually.</span>'; });
      });

      paintMode();
      if (currentMode === 'megaform_submissions') stageSubmissions(); // stage initial so Apply keeps it

      loadTables();
    }
  };
}

// ────────────────────────────────────────────────────────────
// CSS helpers
// ────────────────────────────────────────────────────────────
function cssEscape(s: string): string {
  // Minimal CSS.escape polyfill for attribute-value matching.
  try {
    if ((window as any).CSS && (CSS as any).escape) return (CSS as any).escape(s);
  } catch (e) {}
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function injectStyleOnce() {
  if (_styleInjected) return;
  _styleInjected = true;
  var st = document.createElement('style');
  st.id = 'mf-unified-designer-styles';
  st.textContent = getCss();
  document.head.appendChild(st);
}

function getCss(): string {
  return [
    // ── Backdrop + shell (cloned from .mf-token-designer-*) ──
    '.mf-unified-designer-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;animation:mf-ud-fade .15s ease-out}',
    '@keyframes mf-ud-fade{from{opacity:0}to{opacity:1}}',
    '.mf-unified-designer-shell{width:min(1100px,100%);max-height:min(92vh,860px);background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(15,23,42,.45);display:flex;flex-direction:column;overflow:hidden;font-family:Inter,system-ui,sans-serif;position:relative}',

    // ── Head ──
    '.mf-unified-designer-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg,#0f172a,#1e293b);color:#f8fafc}',
    '.mf-unified-designer-title{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;flex:1}',
    '.mf-unified-designer-title i{color:#a5b4fc}',
    '.mf-unified-designer-badge{font-size:10px;font-weight:600;background:rgba(99,102,241,.18);color:#a5b4fc;padding:3px 8px;border-radius:999px;margin-left:6px}',
    '.mf-unified-designer-ai{appearance:none;background:rgba(99,102,241,.18);border:0;color:#fde68a;font-size:16px;line-height:1;cursor:pointer;padding:6px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:4px}',
    '.mf-unified-designer-ai:hover{background:rgba(253,224,71,.25)}',
    '.mf-unified-designer-ai-icon{font-size:16px}',
    '.mf-unified-designer-close{appearance:none;background:transparent;border:0;color:#cbd5e1;font-size:26px;line-height:1;cursor:pointer;padding:0 6px;border-radius:6px}',
    '.mf-unified-designer-close:hover{background:rgba(248,250,252,.12);color:#fff}',

    // ── Tab strip ──
    '.mf-unified-designer-tabs{display:flex;gap:4px;padding:8px 12px 0;border-bottom:1px solid #e2e8f0;background:#f8fafc;flex-wrap:wrap}',
    '.mf-unified-designer-tab{appearance:none;background:transparent;border:0;padding:8px 14px;font-size:12px;font-weight:600;color:#64748b;cursor:pointer;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:6px;border-bottom:2px solid transparent;margin-bottom:-1px}',
    '.mf-unified-designer-tab i{font-size:11px}',
    '.mf-unified-designer-tab:hover{background:#f1f5f9;color:#0f172a}',
    '.mf-unified-designer-tab.active{background:#fff;color:#0f172a;border-bottom-color:#6366f1}',

    // ── Body + panes ──
    '.mf-unified-designer-body{flex:1;overflow:hidden;padding:0;background:#f8fafc;position:relative;display:flex;flex-direction:column}',
    '.mf-unified-designer-pane{flex:1;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}',
    '.mf-unified-designer-err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:12px;font-size:12px}',
    '.mf-unified-designer-err pre{margin:6px 0 0;font-size:11px;white-space:pre-wrap}',

    // ── Footer ──
    '.mf-unified-designer-foot{display:flex;align-items:center;gap:12px;padding:12px 18px;border-top:1px solid #e2e8f0;background:#fff}',
    '.mf-unified-designer-foot-hint{flex:1;font-size:11px;color:#64748b}',
    '.mf-unified-designer-foot-hint kbd{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:1px 5px;font-size:10px;font-family:inherit}',

    // ── Button base ──
    '.mf-unified-designer-btn{appearance:none;background:#fff;border:1px solid #cbd5e1;color:#0f172a;padding:7px 14px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
    '.mf-unified-designer-btn:hover{background:#f1f5f9;border-color:#94a3b8}',
    '.mf-unified-designer-cancel{}',
    '.mf-unified-designer-apply{background:#10b981;color:#fff;border-color:#10b981}',
    '.mf-unified-designer-apply:hover{background:#059669;border-color:#059669}',

    // ── Input base ──
    '.mf-unified-designer-input{appearance:none;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;font-size:12px;background:#fff;color:#0f172a;outline:none}',
    '.mf-unified-designer-input:focus{border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.15)}',
    '.mf-unified-designer-lbl{display:block;font-size:11px;font-weight:600;color:#475569;margin-top:6px;margin-bottom:3px}',

    // ── AI slide-in pane ──
    '.mf-unified-designer-ai-pane{position:absolute;top:0;right:0;bottom:0;width:380px;max-width:100%;background:#fff;border-left:1px solid #e2e8f0;box-shadow:-10px 0 30px rgba(15,23,42,.12);transform:translateX(100%);transition:transform .2s ease-out;display:flex;flex-direction:column;z-index:5}',
    '.mf-unified-designer-ai-pane[data-state="open"]{transform:translateX(0)}',
    '.mf-unified-designer-ai-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-size:13px;font-weight:700;color:#0f172a}',
    '.mf-unified-designer-ai-close{appearance:none;background:transparent;border:0;color:#64748b;font-size:22px;cursor:pointer;line-height:1;padding:0 4px}',
    '.mf-unified-designer-ai-close:hover{color:#0f172a}',
    '.mf-unified-designer-ai-body{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}',
    '.mf-unified-designer-ai-stub{background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:12px;font-size:12px;color:#854d0e}',
    // [B53] KB search drawer
    '.mf-unified-designer-ai-context{display:flex;flex-wrap:wrap;gap:6px}',
    '.mf-unified-designer-ai-ctxchip{display:inline-flex;align-items:center;gap:5px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;border:1px solid #c7d2fe}',
    '.mf-unified-designer-ai-ctxchip i{font-size:10px}',
    '.mf-unified-designer-ai-ctxchip-alt{background:#ecfeff;color:#0e7490;border-color:#a5f3fc}',
    '.mf-unified-designer-ai-searchbox{position:relative;display:flex;align-items:center}',
    '.mf-unified-designer-ai-searchbox i{position:absolute;left:10px;color:#94a3b8;font-size:11px}',
    '.mf-unified-designer-ai-search{flex:1;width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px 7px 28px;font-size:12px;background:#fff;color:#0f172a;outline:none}',
    '.mf-unified-designer-ai-search:focus{border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.15)}',
    '.mf-unified-designer-ai-results{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;overflow:auto}',
    '.mf-unified-designer-ai-loading,.mf-unified-designer-ai-empty,.mf-unified-designer-ai-err{font-size:12px;padding:10px;border-radius:10px;text-align:center}',
    '.mf-unified-designer-ai-loading{color:#64748b;background:#f8fafc;border:1px dashed #e2e8f0}',
    '.mf-unified-designer-ai-empty{color:#94a3b8;background:#fff;border:1px dashed #e2e8f0;font-style:italic}',
    '.mf-unified-designer-ai-err{color:#991b1b;background:#fef2f2;border:1px solid #fecaca;text-align:left}',
    '.mf-unified-designer-ai-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;cursor:default}',
    '.mf-unified-designer-ai-card:hover{border-color:#0ea5e9;background:#f0f9ff}',
    '.mf-unified-designer-ai-card-head{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}',
    '.mf-unified-designer-ai-card-kind{background:#eef2ff;color:#4338ca;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}',
    '.mf-unified-designer-ai-card-title{font-size:12px;font-weight:700;color:#0f172a;flex:1}',
    '.mf-unified-designer-ai-card-body{font-size:11px;color:#475569;margin:0;line-height:1.45}',
    '.mf-unified-designer-ai-footer{display:flex;justify-content:flex-end;padding-top:6px;border-top:1px dashed #e2e8f0}',
    '.mf-unified-designer-ai-askbtn{appearance:none;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;font-size:11px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:not-allowed;display:inline-flex;align-items:center;gap:6px}',
    '.mf-unified-designer-ai-askbtn-on{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-color:transparent;cursor:pointer}',
    '.mf-unified-designer-ai-askbtn-on:hover{filter:brightness(1.05)}',

    // ── Current settings ──
    '.mf-unified-designer-curset-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
    '.mf-unified-designer-curset-title{flex:1;font-size:13px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px}',
    '.mf-unified-designer-curset-title i{color:#0ea5e9}',
    '.mf-unified-designer-curset-group{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:8px}',
    '.mf-unified-designer-curset-group-head{padding:8px 12px;font-size:11px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:.05em;background:#eef2ff;border-bottom:1px solid #e2e8f0}',
    '.mf-unified-designer-curset-group-body{padding:6px 12px}',
    '.mf-unified-designer-curset-row{display:grid;grid-template-columns:180px 1fr;gap:10px;padding:6px 0;border-bottom:1px dashed #f1f5f9}',
    '.mf-unified-designer-curset-row:last-child{border-bottom:0}',
    '.mf-unified-designer-curset-key{font-size:12px;font-weight:600;color:#475569}',
    '.mf-unified-designer-curset-val{font-size:12px;color:#0f172a;word-break:break-word}',
    '.mf-unified-designer-curset-val code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px;font-family:Menlo,Consolas,monospace}',
    '.mf-unified-designer-curset-sql{display:block;white-space:pre-wrap;max-height:96px;overflow:auto}',
    '.mf-unified-designer-curset-null{color:#94a3b8;font-style:italic}',
    '.mf-unified-designer-curset-empty{font-size:11px;color:#94a3b8;padding:6px 0}',

    // ── Data tab ──
    '.mf-unified-designer-data-grid{flex:1;display:grid;grid-template-columns:280px 1fr;gap:14px;min-height:0}',
    '.mf-unified-designer-data-left{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;overflow:hidden;min-height:0}',
    '.mf-unified-designer-data-conn{display:flex;flex-direction:column;gap:4px;padding-bottom:8px;border-bottom:1px dashed #e2e8f0}',
    '.mf-unified-designer-data-search{position:sticky;top:0;background:#fff;z-index:1}',
    '.mf-unified-designer-data-search-input{width:100%}',
    '.mf-unified-designer-data-tables{flex:1;overflow:auto;display:flex;flex-direction:column;gap:4px;min-height:0}',
    '.mf-unified-designer-data-loading{font-size:11px;color:#64748b;padding:8px;text-align:center}',
    '.mf-unified-designer-data-empty{font-size:11px;color:#94a3b8;padding:8px;text-align:center;font-style:italic}',
    '.mf-unified-designer-data-table{border:1px solid #e2e8f0;border-radius:8px;background:#fff;overflow:hidden}',
    '.mf-unified-designer-data-table-head{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;font-size:12px}',
    '.mf-unified-designer-data-table-head:hover{background:#f8fafc}',
    '.mf-unified-designer-data-table-schema{background:#e0e7ff;color:#4338ca;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px}',
    '.mf-unified-designer-data-table-name{font-weight:600;color:#0f172a}',
    '.mf-unified-designer-data-table-cols{display:none;flex-wrap:wrap;gap:4px;padding:6px 8px;background:#fafbfd;border-top:1px solid #e2e8f0}',
    '.mf-unified-designer-data-table.is-open .mf-unified-designer-data-table-cols{display:flex}',
    '.mf-unified-designer-data-col{display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:2px 8px;font-size:11px;color:#0f172a}',
    '.mf-unified-designer-data-col.is-pk{background:#fef3c7;border-color:#fde68a}',
    '.mf-unified-designer-data-col-type{font-size:9px;color:#64748b;background:#fff;padding:1px 6px;border-radius:999px;border:1px solid #e2e8f0}',

    '.mf-unified-designer-data-right{display:flex;flex-direction:column;gap:8px;min-height:0}',
    '.mf-unified-designer-data-sql-head{display:flex;align-items:center;gap:10px}',
    '.mf-unified-designer-data-sql-head label{flex:1;margin:0;font-size:11px;font-weight:700;color:#475569}',
    '.mf-unified-designer-data-sql-actions{display:flex;gap:6px}',
    '.mf-unified-designer-data-sql{width:100%;min-height:120px;font-family:Menlo,Consolas,monospace;font-size:12px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#0f172a;color:#e2e8f0;resize:vertical;outline:none}',
    '.mf-unified-designer-data-sql:focus{border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.2)}',
    '.mf-unified-designer-data-err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:10px;font-size:12px;white-space:pre-wrap}',
    '.mf-unified-designer-data-preview{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}',
    '.mf-unified-designer-data-preview-meta{font-size:11px;color:#64748b;margin-bottom:4px}',
    '.mf-unified-designer-data-preview-scroll{flex:1;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff}',
    '.mf-unified-designer-data-preview-table{width:100%;border-collapse:collapse;font-size:12px}',
    '.mf-unified-designer-data-preview-table th{position:sticky;top:0;background:#f8fafc;font-weight:700;color:#0f172a;padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:.04em}',
    '.mf-unified-designer-data-preview-table td{padding:6px 10px;border-bottom:1px dashed #f1f5f9;color:#0f172a;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}',
    '.mf-unified-designer-data-footer{display:flex;align-items:center;gap:10px;padding-top:6px;border-top:1px dashed #e2e8f0;margin-top:6px}',
    '.mf-unified-designer-data-hint{flex:1;font-size:11px;color:#64748b}',

    // ── Toasts ──
    '.mf-unified-designer-toast-host{position:fixed;bottom:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:6px;pointer-events:none}',
    '.mf-unified-designer-toast{pointer-events:auto;min-width:240px;max-width:360px;background:#0f172a;color:#f8fafc;padding:10px 14px;border-radius:10px;font-size:12px;box-shadow:0 8px 30px rgba(15,23,42,.35);animation:mf-ud-toast .2s ease-out}',
    '.mf-unified-designer-toast.is-out{opacity:0;transform:translateY(8px);transition:.2s}',
    '.mf-unified-designer-toast-success{background:#065f46}',
    '.mf-unified-designer-toast-error{background:#7f1d1d}',
    '@keyframes mf-ud-toast{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',

    // ── Responsive ──
    '@media (max-width:780px){.mf-unified-designer-data-grid{grid-template-columns:1fr}.mf-unified-designer-curset-row{grid-template-columns:1fr}}'
  ].join('\n');
}

// ── Optional: window namespace for legacy callers ────────────
try {
  (window as any).MFUnifiedDesigner = {
    open: openUnifiedDesigner,
    buildCurrentSettingsTab: buildCurrentSettingsTab,
    buildDataTab: buildDataTab
  };
} catch (e) {}
