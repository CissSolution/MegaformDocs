/**
 * MegaForm Razor Template Studio — Recipe-first redesign
 * Badge: RazorStudio v20260601-recipe-01
 *
 * Tab layout (new):
 *   1. Recipe       — gallery of canonical recipe tiles → click a tile to
 *                     reveal a grouped, typed params form on the right.
 *                     This is the DEFAULT tab — replaces the old "Current"
 *                     dual-mode panel that mixed Custom + Bound.
 *   2. Live preview — iframe sample-render of every registered recipe.
 *   3. Advanced     — sub-tabs for: (a) read-only built-in source, (b) raw
 *                     .razor source editor + Roslyn JIT compile. Only one
 *                     in twenty users ever needs this.
 *
 * The host launches the studio the same way as before:
 *   MFRazorStudio.open({ currentProps, onApplyProps, onSaveOverride,
 *                        fieldKey, formId, initialTemplate, onPick })
 *
 * Shipped API + payload shape unchanged: widgetProps still carries
 * `templateName`, `parameters`, `useSql`, `connectionKey`, `masterQuery`,
 * `queryDependsOn`, and the optional `razorSource` escape hatch.
 *
 * UI strings are English by default per the designer-popup-language rule.
 */
(function (global: any) {
  'use strict';

  var BADGE = 'RazorStudio v20260601-recipe-01';
  var POPUP_ID = 'mf-razor-studio-popup';

  function esc(v: any): string {
    var s = v == null ? '' : String(v);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function lowerFirst(s: string) { return s ? s.charAt(0).toLowerCase() + s.substring(1) : s; }

  // ── URL helpers (mirror megaform-widget-razor.ts) ──────────────────
  function getApiBase(): string {
    var pf = (global.__MF_PLATFORM__ || {}) as any;
    if (pf && typeof pf.apiBase === 'string' && pf.apiBase) return String(pf.apiBase).replace(/\/?$/, '/');
    if (pf && typeof pf.apiBaseUrl === 'string' && pf.apiBaseUrl) return String(pf.apiBaseUrl).replace(/\/?$/, '/');
    if ((global as any).$ && (global as any).$.ServicesFramework) return '/DesktopModules/MegaForm/API/';
    return '/api/MegaForm/';
  }
  function popupUrl(suffix: string): string {
    var base = getApiBase();
    if (/\/api\/MegaForm\//i.test(base) || /\/api\/MegaFormPopup\//i.test(base)) {
      return base.replace(/\/api\/.*$/i, '') + '/api/MegaFormPopup/RazorWidget/' + suffix;
    }
    return base + 'RazorWidget/' + suffix;
  }
  function listUrl()     { return popupUrl('List'); }
  function sourceUrl(name: string) { return popupUrl('Source') + '?name=' + encodeURIComponent(name); }
  function compileUrl()  { return popupUrl('Compile'); }
  function previewUrl()  { return popupUrl('Preview'); }
  function renderUrl()   { return popupUrl('Render'); }

  function getAuthToken(): string {
    var pf = (global as any).__MF_PLATFORM__ || {};
    return (global as any).__MF_TOKEN || pf.authToken || '';
  }
  function getAntiForgery(): string {
    try {
      var sf = (global as any).$ && (global as any).$.ServicesFramework;
      if (sf) {
        var inst = sf(0);
        if (inst && typeof inst.getAntiForgeryValue === 'function') return inst.getAntiForgeryValue() || '';
      }
    } catch (_e) { /* ignore */ }
    return '';
  }
  function ajaxGet(url: string, cb: (err: any, data: any) => void): void {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    var t = getAuthToken(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
    var af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      try {
        var data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) cb(null, data);
        else cb({ status: xhr.status, payload: data }, null);
      } catch (e) { cb({ status: xhr.status, raw: xhr.responseText }, null); }
    };
    xhr.send();
  }
  function ajaxPost(url: string, body: any, cb: (err: any, data: any) => void): void {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    var t = getAuthToken(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
    var af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      try {
        var data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) cb(null, data);
        else cb({ status: xhr.status, payload: data }, null);
      } catch (e) { cb({ status: xhr.status }, null); }
    };
    xhr.send(JSON.stringify(body || {}));
  }

  // ── Styles ────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('mf-razor-studio-style')) return;
    var css = [
      '.mfrs-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px}',
      '.mfrs-modal{background:#fff;border-radius:16px;width:min(1280px,95vw);height:min(820px,92vh);display:flex;flex-direction:column;box-shadow:0 30px 60px rgba(0,0,0,.35);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
      '.mfrs-header{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff}',
      '.mfrs-title{font-weight:700;font-size:17px;display:flex;align-items:center;gap:10px}',
      '.mfrs-badge{font-size:10px;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:99px;font-weight:600;letter-spacing:.02em}',
      '.mfrs-close{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:6px 10px;border-radius:6px}',
      '.mfrs-close:hover{background:rgba(255,255,255,.15)}',
      '.mfrs-tabs{display:flex;gap:0;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:0 22px}',
      '.mfrs-tab{background:transparent;border:0;padding:14px 18px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;border-bottom:3px solid transparent;transition:all .15s}',
      '.mfrs-tab:hover{color:#0f172a}',
      '.mfrs-tab.is-active{color:#7c3aed;border-bottom-color:#7c3aed}',
      '.mfrs-body{flex:1;display:flex;min-height:0;overflow:hidden}',
      '.mfrs-footer{padding:12px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;align-items:center}',
      '.mfrs-footer .mfrs-hint{margin-right:auto;font-size:12px;color:#64748b}',
      '.mfrs-btn{padding:8px 18px;font-size:13px;font-weight:600;border:0;border-radius:8px;cursor:pointer;transition:all .15s}',
      '.mfrs-btn-primary{background:#7c3aed;color:#fff}',
      '.mfrs-btn-primary:hover{background:#6d28d9}',
      '.mfrs-btn-ghost{background:transparent;color:#475569;border:1px solid #cbd5e1}',
      '.mfrs-btn-ghost:hover{background:#f1f5f9}',
      '.mfrs-error{padding:14px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;font-size:13px;margin-bottom:12px}',
      '.mfrs-empty{padding:30px;color:#94a3b8;font-style:italic;text-align:center}',
      // RECIPE GALLERY (left tile grid + right config form)
      '.mfrs-rec-wrap{flex:1;display:flex;min-height:0}',
      '.mfrs-rec-gallery{width:340px;border-right:1px solid #e2e8f0;overflow-y:auto;padding:14px;background:#f8fafc}',
      '.mfrs-rec-config{flex:1;overflow-y:auto;padding:18px 22px;background:#fff}',
      '.mfrs-rec-search{width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;margin-bottom:12px;box-sizing:border-box}',
      '.mfrs-rec-tile{display:flex;gap:10px;padding:10px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all .15s;align-items:flex-start}',
      '.mfrs-rec-tile:hover{border-color:#a78bfa;box-shadow:0 4px 10px rgba(124,58,237,.08)}',
      '.mfrs-rec-tile.is-selected{border-color:#7c3aed;background:#faf5ff;box-shadow:0 4px 12px rgba(124,58,237,.18)}',
      '.mfrs-rec-icon{width:36px;height:36px;flex-shrink:0;border-radius:8px;background:linear-gradient(135deg,#ede9fe,#ddd6fe);display:flex;align-items:center;justify-content:center;color:#6d28d9;font-size:15px}',
      '.mfrs-rec-tile.is-selected .mfrs-rec-icon{background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff}',
      '.mfrs-rec-meta{flex:1;min-width:0}',
      '.mfrs-rec-name{font-weight:700;font-size:13px;color:#0f172a;margin-bottom:2px}',
      '.mfrs-rec-cat{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#7c3aed;font-weight:700;margin-bottom:3px}',
      '.mfrs-rec-when{font-size:11px;color:#64748b;line-height:1.4}',
      '.mfrs-rec-chips{display:flex;gap:4px;margin-top:4px}',
      '.mfrs-rec-chip{font-size:9px;padding:1px 6px;border-radius:99px;font-weight:700;letter-spacing:.02em}',
      '.mfrs-rec-chip.sql{background:#dbeafe;color:#1d4ed8}',
      '.mfrs-rec-chip.emit{background:#fce7f3;color:#be185d}',
      '.mfrs-rec-chip.live{background:#dcfce7;color:#166534}',
      // RECIPE CONFIG (right pane)
      '.mfrs-rc-head{padding:0 0 14px;border-bottom:1px solid #e2e8f0;margin-bottom:16px}',
      '.mfrs-rc-h1{font-size:18px;font-weight:700;color:#0f172a;margin:0 0 4px;display:flex;align-items:center;gap:8px}',
      '.mfrs-rc-when{color:#64748b;font-size:13px;margin:0 0 8px;line-height:1.5}',
      '.mfrs-rc-desc{color:#475569;font-size:12px;margin:0;line-height:1.5}',
      '.mfrs-rc-group{margin-bottom:18px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff}',
      '.mfrs-rc-group-h{padding:8px 12px;background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475569;font-weight:700;border-bottom:1px solid #e2e8f0}',
      '.mfrs-rc-group-body{padding:12px}',
      '.mfrs-rc-row{margin-bottom:10px}',
      '.mfrs-rc-row:last-child{margin-bottom:0}',
      '.mfrs-rc-row label{display:block;font-size:12px;font-weight:600;color:#0f172a;margin-bottom:4px}',
      '.mfrs-rc-row label .req{color:#ef4444;margin-left:3px}',
      '.mfrs-rc-row input,.mfrs-rc-row select,.mfrs-rc-row textarea{width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box}',
      '.mfrs-rc-row input:focus,.mfrs-rc-row select:focus,.mfrs-rc-row textarea:focus{outline:none;border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.12)}',
      '.mfrs-rc-row textarea{font-family:"DM Mono",ui-monospace,monospace;min-height:60px;resize:vertical}',
      '.mfrs-rc-row .hint{font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.4}',
      '.mfrs-rc-row input[type=color]{height:36px;padding:3px 6px;cursor:pointer}',
      '.mfrs-rc-bool{display:flex;align-items:center;gap:8px}',
      '.mfrs-rc-bool input[type=checkbox]{width:auto;margin:0}',
      // Live preview pane (inside Recipe tab right-side)
      '.mfrs-rc-prev{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}',
      '.mfrs-rc-prev-h{padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475569;font-weight:700;display:flex;justify-content:space-between;align-items:center}',
      '.mfrs-rc-prev-h button{padding:3px 9px;background:#fff;border:1px solid #cbd5e1;border-radius:5px;font-size:11px;cursor:pointer;color:#475569;font-weight:600}',
      '.mfrs-rc-prev-h button:hover{background:#f1f5f9}',
      '.mfrs-rc-prev-host{padding:14px;min-height:120px;background:#fff}',
      // Advanced tab
      '.mfrs-adv-tabs{display:flex;gap:0;border-bottom:1px solid #e2e8f0;background:#f8fafc;padding:0 18px}',
      '.mfrs-adv-tab{background:transparent;border:0;padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;cursor:pointer;border-bottom:2px solid transparent}',
      '.mfrs-adv-tab.is-active{color:#7c3aed;border-bottom-color:#7c3aed}',
      '.mfrs-adv-body{flex:1;overflow-y:auto;padding:18px 22px}',
      '.mfrs-source{width:100%;font-family:"DM Mono",ui-monospace,monospace;font-size:12px;border:1px solid #cbd5e1;border-radius:8px;padding:12px;background:#0f172a;color:#e2e8f0;line-height:1.5;min-height:340px;box-sizing:border-box}',
      '.mfrs-banner{padding:8px 12px;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:6px;font-size:12px;margin-bottom:12px}',
      '.mfrs-list{width:240px;border-right:1px solid #e2e8f0;overflow-y:auto;padding:8px 0;background:#f8fafc;flex-shrink:0}',
      '.mfrs-list-item{padding:8px 14px;font-size:13px;color:#475569;cursor:pointer;border-left:3px solid transparent}',
      '.mfrs-list-item:hover{background:#fff;color:#0f172a}',
      '.mfrs-list-item.is-selected{background:#fff;color:#7c3aed;font-weight:700;border-left-color:#7c3aed}',
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'mf-razor-studio-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Types ─────────────────────────────────────────────────────────
  interface StudioOptions {
    initialTemplate?: string;
    onPick?: (templateName: string) => void;
    onSaveOverride?: (source: string) => void;
    initialOverride?: string;
    currentProps?: any;
    onApplyProps?: (newProps: any) => void;
    fieldKey?: string;
    formId?: number;
  }

  interface ParamMeta {
    name: string; typeName: string; isRequired: boolean; description: string;
    label: string; hint: string; group: string; widget: string; options: string;
    placeholder: string; order: number;
  }
  interface RecipeMeta {
    name: string; category: string; description: string;
    emitsValue: boolean; supportsSql: boolean; requiresInteractive: boolean;
    icon: string; whenToUse: string; isRecipe: boolean;
    parameters: ParamMeta[];
  }

  // ── Studio ────────────────────────────────────────────────────────
  function open(opts?: StudioOptions): void {
    opts = opts || {};
    injectStyles();
    var existing = document.getElementById(POPUP_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = POPUP_ID;
    overlay.className = 'mfrs-overlay';
    // [B30] Builder fullscreen-takeover hides every body > * without this attr.
    overlay.setAttribute('data-mf-overlay', '1');
    overlay.innerHTML = [
      '<div class="mfrs-modal" role="dialog" aria-modal="true">',
      '  <div class="mfrs-header">',
      '    <div class="mfrs-title"><span>&#x2728;</span> Razor Template Studio <span class="mfrs-badge">' + esc(BADGE) + '</span></div>',
      '    <button class="mfrs-close" aria-label="Close">&times;</button>',
      '  </div>',
      '  <div class="mfrs-tabs" role="tablist">',
      '    <button class="mfrs-tab is-active" data-tab="recipe" role="tab">&#127859; Recipe</button>',
      '    <button class="mfrs-tab" data-tab="preview" role="tab">&#128064; Live preview</button>',
      '    <button class="mfrs-tab" data-tab="advanced" role="tab">&#9881;&#65039; Advanced</button>',
      '  </div>',
      '  <div class="mfrs-body"></div>',
      '  <div class="mfrs-footer">',
      '    <span class="mfrs-hint" data-mfrs-hint></span>',
      '    <button class="mfrs-btn mfrs-btn-ghost" data-action="close">Close</button>',
      '    <button class="mfrs-btn mfrs-btn-primary" data-action="primary" style="display:none">Apply to field</button>',
      '  </div>',
      '</div>',
    ].join('');
    // [B31] mount inside Builder shell to dodge fullscreen-takeover
    var __mt: HTMLElement = (document.getElementById('mf-builder-root') || document.body) as HTMLElement;
    __mt.appendChild(overlay);

    var body = overlay.querySelector('.mfrs-body') as HTMLElement;
    var primary = overlay.querySelector('[data-action="primary"]') as HTMLButtonElement;
    var hint = overlay.querySelector('[data-mfrs-hint]') as HTMLElement;
    var tabs = Array.prototype.slice.call(overlay.querySelectorAll('.mfrs-tab')) as HTMLElement[];

    var initialTpl = (opts.currentProps && (opts.currentProps.templateName || opts.currentProps.template)) || opts.initialTemplate || '';
    var state: {
      active: string;
      selected: string;
      catalog: RecipeMeta[] | null;
      sources: { [k: string]: string };
      workingProps: any;
      advTab: string;
      search: string;
    } = {
      active: 'recipe',
      selected: initialTpl,
      catalog: null,
      sources: {},
      workingProps: opts.currentProps ? JSON.parse(JSON.stringify(opts.currentProps)) : {},
      advTab: 'source',
      search: '',
    };

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    (overlay.querySelector('.mfrs-close') as HTMLElement).addEventListener('click', close);
    (overlay.querySelector('[data-action="close"]') as HTMLElement).addEventListener('click', close);
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('is-active'); });
        t.classList.add('is-active');
        state.active = String(t.getAttribute('data-tab') || 'recipe');
        renderPanel();
      });
    });

    function setPrimary(label: string, handler: () => void) {
      primary.style.display = '';
      primary.textContent = label;
      primary.onclick = handler;
    }
    function hidePrimary() { primary.style.display = 'none'; primary.onclick = null as any; }
    function setHint(text: string) { hint.textContent = text || ''; }

    function ensureCatalog(cb: (err: any) => void) {
      if (state.catalog) { cb(null); return; }
      body.innerHTML = '<div class="mfrs-empty" style="flex:1">Loading recipes…</div>';
      ajaxGet(listUrl(), function (err, data) {
        if (err) { cb(err); return; }
        state.catalog = (Array.isArray(data) ? data : []).map(function (t: any): RecipeMeta {
          return {
            name: String(t.name || ''),
            category: String(t.category || ''),
            description: String(t.description || ''),
            emitsValue: !!t.emitsValue,
            supportsSql: !!t.supportsSql,
            requiresInteractive: !!t.requiresInteractive,
            icon: String(t.icon || 'fa-cube'),
            whenToUse: String(t.whenToUse || ''),
            isRecipe: t.isRecipe !== false,
            parameters: Array.isArray(t.parameters) ? t.parameters.map(function (p: any): ParamMeta {
              return {
                name: String(p.name || ''),
                typeName: String(p.typeName || ''),
                isRequired: !!p.isRequired,
                description: String(p.description || ''),
                label: String(p.label || p.name || ''),
                hint: String(p.hint || ''),
                group: String(p.group || 'General'),
                widget: String(p.widget || 'text'),
                options: String(p.options || ''),
                placeholder: String(p.placeholder || ''),
                order: typeof p.order === 'number' ? p.order : 100,
              };
            }) : [],
          };
        }).sort(function (a: RecipeMeta, b: RecipeMeta) {
          return (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name);
        });
        cb(null);
      });
    }

    function ensureSource(name: string, cb: (err: any, src: string) => void) {
      if (state.sources[name]) { cb(null, state.sources[name]); return; }
      ajaxGet(sourceUrl(name), function (err, data) {
        if (err) { cb(err, ''); return; }
        var src = data && typeof data.source === 'string' ? data.source : '';
        state.sources[name] = src;
        cb(null, src);
      });
    }

    // ── RECIPE TAB ──────────────────────────────────────────────────
    function renderRecipe() {
      ensureCatalog(function (err) {
        if (err) {
          body.innerHTML = '<div style="flex:1;padding:20px"><div class="mfrs-error">Could not load recipe catalog. ' + esc(err.payload && err.payload.error ? err.payload.error : 'HTTP ' + (err.status || '?')) + '</div></div>';
          hidePrimary();
          return;
        }
        var cat = (state.catalog || []).filter(function (r) { return r.isRecipe; });
        if (!cat.length) {
          body.innerHTML = '<div class="mfrs-empty" style="flex:1">No recipes registered.</div>';
          hidePrimary();
          return;
        }
        if (!state.selected) state.selected = cat[0].name;

        // Build gallery
        var galleryHtml = '<input type="text" class="mfrs-rec-search" id="mfrs-rec-search" placeholder="🔍 Search recipes…" value="' + esc(state.search) + '" />';
        var q = state.search.toLowerCase();
        var filtered = cat.filter(function (r) {
          if (!q) return true;
          return r.name.toLowerCase().indexOf(q) >= 0
              || r.category.toLowerCase().indexOf(q) >= 0
              || r.whenToUse.toLowerCase().indexOf(q) >= 0
              || r.description.toLowerCase().indexOf(q) >= 0;
        });
        filtered.forEach(function (r) {
          var chips = '';
          if (r.supportsSql)         chips += '<span class="mfrs-rec-chip sql">SQL</span>';
          if (r.emitsValue)          chips += '<span class="mfrs-rec-chip emit">Emits</span>';
          if (r.requiresInteractive) chips += '<span class="mfrs-rec-chip live">Live</span>';
          galleryHtml += '<div class="mfrs-rec-tile ' + (r.name === state.selected ? 'is-selected' : '') + '" data-name="' + esc(r.name) + '">'
            + '<div class="mfrs-rec-icon"><i class="fas ' + esc(r.icon) + '"></i></div>'
            + '<div class="mfrs-rec-meta">'
            + '<div class="mfrs-rec-cat">' + esc(r.category || '') + '</div>'
            + '<div class="mfrs-rec-name">' + esc(r.name) + '</div>'
            + '<div class="mfrs-rec-when">' + esc(r.whenToUse || r.description || '') + '</div>'
            + (chips ? '<div class="mfrs-rec-chips">' + chips + '</div>' : '')
            + '</div></div>';
        });
        if (!filtered.length) galleryHtml += '<div class="mfrs-empty">No recipes match "' + esc(state.search) + '"</div>';

        // Build config (right pane) for selected recipe
        var sel = cat.filter(function (x) { return x.name === state.selected; })[0] || cat[0];
        var configHtml = renderRecipeConfigHtml(sel);

        body.innerHTML = '<div class="mfrs-rec-wrap">'
          + '<div class="mfrs-rec-gallery">' + galleryHtml + '</div>'
          + '<div class="mfrs-rec-config">' + configHtml + '</div>'
          + '</div>';

        // Wire gallery clicks
        var search = document.getElementById('mfrs-rec-search') as HTMLInputElement;
        if (search) {
          search.oninput = function () { state.search = search.value; renderRecipe(); };
        }
        Array.prototype.forEach.call(body.querySelectorAll('.mfrs-rec-tile'), function (el: HTMLElement) {
          el.addEventListener('click', function () {
            state.selected = String(el.getAttribute('data-name') || '');
            state.workingProps = state.workingProps || {};
            state.workingProps.templateName = state.selected;
            // Clear razorSource when switching to a built-in recipe so the
            // /Render endpoint uses the registry path, not inline compile.
            state.workingProps.razorSource = '';
            renderRecipe();
          });
        });

        // Wire config form
        wireConfigEvents(sel);

        // Primary footer button
        if (opts && typeof opts.onApplyProps === 'function') {
          setPrimary('Apply to field', function () {
            collectFormIntoState(sel);
            try { (opts as any).onApplyProps(state.workingProps); } catch (_e) { /* ignore */ }
            close();
          });
        } else if (opts && typeof opts.onPick === 'function') {
          setPrimary('Use ' + sel.name, function () {
            try { (opts as any).onPick(sel.name); } catch (_e) { /* ignore */ }
            close();
          });
        } else {
          hidePrimary();
        }

        setHint('Pick a recipe → fill the parameters → Apply to field. No code required.');

        // Auto-preview after first paint
        setTimeout(function () {
          var btn = document.getElementById('mfrs-rc-refresh') as HTMLButtonElement;
          if (btn) btn.click();
        }, 200);
      });
    }

    function renderRecipeConfigHtml(meta: RecipeMeta): string {
      var wp = state.workingProps || {};
      // Pre-fill missing params with empty
      var params: { [k: string]: any } = wp.parameters && typeof wp.parameters === 'object' ? wp.parameters : {};
      meta.parameters.forEach(function (p) {
        if (!(p.name in params) && !(lowerFirst(p.name) in params)) {
          params[lowerFirst(p.name)] = '';
        }
      });

      // Group params by `group`
      var groupOrder: string[] = [];
      var groupMap: { [k: string]: ParamMeta[] } = {};
      meta.parameters.forEach(function (p) {
        var g = p.group || 'General';
        if (!groupMap[g]) { groupMap[g] = []; groupOrder.push(g); }
        groupMap[g].push(p);
      });

      var headerHtml = '<div class="mfrs-rc-head">'
        + '<div class="mfrs-rc-h1"><i class="fas ' + esc(meta.icon || 'fa-cube') + '" style="color:#7c3aed"></i> ' + esc(meta.name) + '</div>'
        + (meta.whenToUse ? '<p class="mfrs-rc-when"><strong>When to use:</strong> ' + esc(meta.whenToUse) + '</p>' : '')
        + (meta.description ? '<p class="mfrs-rc-desc">' + esc(meta.description) + '</p>' : '')
        + '</div>';

      // SQL data source section (when supportsSql)
      var sqlHtml = '';
      if (meta.supportsSql) {
        sqlHtml = '<div class="mfrs-rc-group">'
          + '<div class="mfrs-rc-group-h">SQL data source</div>'
          + '<div class="mfrs-rc-group-body">'
          + '<div class="mfrs-rc-row mfrs-rc-bool">'
          +   '<input type="checkbox" id="mfrs-rc-usesql" ' + (wp.useSql ? 'checked' : '') + ' />'
          +   '<label for="mfrs-rc-usesql" style="margin:0;cursor:pointer">Use SQL pre-fetch (rows feed into the recipe)</label>'
          + '</div>'
          + '<div class="mfrs-rc-row"><label>Connection</label>'
          +   '<input type="text" id="mfrs-rc-conn" value="' + esc(wp.connectionKey || 'DashboardDatabase') + '" placeholder="DashboardDatabase" />'
          + '</div>'
          + '<div class="mfrs-rc-row"><label>SQL query <span class="hint" style="font-weight:normal">(use :paramName for cascade values from sibling fields)</span></label>'
          +   '<textarea id="mfrs-rc-sql" rows="3" placeholder="SELECT Region, Category, SalesAmount FROM Sales WHERE Year = :year">' + esc(wp.masterQuery || '') + '</textarea>'
          + '</div>'
          + '<div class="mfrs-rc-row"><label>Cascade fields (csv) <span class="hint" style="font-weight:normal">— sibling field keys to re-fetch on change</span></label>'
          +   '<input type="text" id="mfrs-rc-deps" value="' + esc(((wp.queryDependsOn || []) as any).join ? (wp.queryDependsOn || []).join(',') : (wp.queryDependsOn || '')) + '" placeholder="year,region" />'
          + '</div>'
          + '</div></div>';
      }

      // Param groups
      var paramsHtml = '';
      groupOrder.forEach(function (g) {
        paramsHtml += '<div class="mfrs-rc-group">'
          + '<div class="mfrs-rc-group-h">' + esc(g) + '</div>'
          + '<div class="mfrs-rc-group-body">';
        groupMap[g].forEach(function (p) {
          var camelKey = lowerFirst(p.name);
          var v = (camelKey in params) ? params[camelKey] : (p.name in params ? params[p.name] : '');
          var displayVal = (v == null) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
          paramsHtml += '<div class="mfrs-rc-row" data-pname="' + esc(p.name) + '" data-pcamel="' + esc(camelKey) + '" data-widget="' + esc(p.widget) + '">';
          if (p.widget === 'bool') {
            paramsHtml += '<div class="mfrs-rc-bool">'
              + '<input type="checkbox" id="mfrs-rc-p-' + esc(camelKey) + '" ' + (String(v).toLowerCase() === 'true' || v === true ? 'checked' : '') + ' />'
              + '<label for="mfrs-rc-p-' + esc(camelKey) + '" style="margin:0;cursor:pointer">' + esc(p.label) + (p.isRequired ? '<span class="req">*</span>' : '') + '</label>'
              + '</div>';
          } else {
            paramsHtml += '<label for="mfrs-rc-p-' + esc(camelKey) + '">' + esc(p.label) + (p.isRequired ? '<span class="req">*</span>' : '') + '</label>';
            if (p.widget === 'select') {
              paramsHtml += '<select id="mfrs-rc-p-' + esc(camelKey) + '">';
              var optList = (p.options || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
              optList.forEach(function (o) {
                paramsHtml += '<option value="' + esc(o) + '"' + (displayVal === o ? ' selected' : '') + '>' + esc(o) + '</option>';
              });
              paramsHtml += '</select>';
            } else if (p.widget === 'textarea') {
              paramsHtml += '<textarea id="mfrs-rc-p-' + esc(camelKey) + '" rows="3" placeholder="' + esc(p.placeholder) + '">' + esc(displayVal) + '</textarea>';
            } else if (p.widget === 'color') {
              paramsHtml += '<input type="color" id="mfrs-rc-p-' + esc(camelKey) + '" value="' + esc(displayVal || '#7c3aed') + '" />';
            } else if (p.widget === 'number') {
              paramsHtml += '<input type="number" id="mfrs-rc-p-' + esc(camelKey) + '" value="' + esc(displayVal) + '" placeholder="' + esc(p.placeholder) + '" />';
            } else {
              // text / sql-column / sql / default
              paramsHtml += '<input type="text" id="mfrs-rc-p-' + esc(camelKey) + '" value="' + esc(displayVal) + '" placeholder="' + esc(p.placeholder) + '" />';
            }
          }
          if (p.hint) paramsHtml += '<div class="hint">' + esc(p.hint) + '</div>';
          paramsHtml += '</div>';
        });
        paramsHtml += '</div></div>';
      });

      // Live preview block
      var previewHtml = '<div class="mfrs-rc-prev">'
        + '<div class="mfrs-rc-prev-h"><span>Live preview</span><button type="button" id="mfrs-rc-refresh">&#8635; Refresh</button></div>'
        + '<div class="mfrs-rc-prev-host" id="mfrs-rc-prev-host"><em style="color:#94a3b8">Click Refresh to render.</em></div>'
        + '</div>';

      return headerHtml + sqlHtml + paramsHtml + previewHtml;
    }

    function wireConfigEvents(meta: RecipeMeta) {
      var refresh = document.getElementById('mfrs-rc-refresh') as HTMLButtonElement;
      if (refresh) refresh.onclick = function () {
        collectFormIntoState(meta);
        renderLivePreview(meta);
      };
    }

    function collectFormIntoState(meta: RecipeMeta) {
      var wp = state.workingProps || {};
      wp.templateName = meta.name;
      wp.razorSource = '';

      if (meta.supportsSql) {
        var useSqlEl = document.getElementById('mfrs-rc-usesql') as HTMLInputElement;
        wp.useSql        = useSqlEl ? useSqlEl.checked : !!wp.useSql;
        var connEl = document.getElementById('mfrs-rc-conn') as HTMLInputElement;
        if (connEl) wp.connectionKey = connEl.value;
        var sqlEl = document.getElementById('mfrs-rc-sql') as HTMLTextAreaElement;
        if (sqlEl) wp.masterQuery = sqlEl.value;
        var depsEl = document.getElementById('mfrs-rc-deps') as HTMLInputElement;
        if (depsEl) wp.queryDependsOn = depsEl.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      }

      var params: any = {};
      meta.parameters.forEach(function (p) {
        var key = lowerFirst(p.name);
        var el = document.getElementById('mfrs-rc-p-' + key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (!el) return;
        if (p.widget === 'bool') {
          params[key] = (el as HTMLInputElement).checked;
        } else if (p.widget === 'number') {
          var n = parseFloat((el as HTMLInputElement).value);
          params[key] = isNaN(n) ? '' : n;
        } else {
          params[key] = (el as any).value;
        }
      });
      wp.parameters = params;
      state.workingProps = wp;
    }

    function renderLivePreview(meta: RecipeMeta) {
      var host = document.getElementById('mfrs-rc-prev-host');
      if (!host) return;
      var wp = state.workingProps || {};
      if (!wp.templateName) { host.innerHTML = '<em style="color:#f43f5e">Pick a recipe first.</em>'; return; }
      host.innerHTML = '<em style="color:#94a3b8">Loading…</em>';

      function postRender(rows: any[]) {
        var payload: any = {
          templateName: wp.templateName,
          parameters: wp.parameters || {},
          widgetKey: opts!.fieldKey || 'preview',
          sqlRows: rows && rows.length ? rows : undefined,
        };
        ajaxPost(renderUrl(), payload, function (e2, data) {
          if (e2) {
            var detail = e2 && e2.payload && (e2.payload.error || e2.payload.hint) ? (e2.payload.hint || e2.payload.error) : '';
            host!.innerHTML = '<div class="mfrs-error">Render failed (HTTP ' + esc(String(e2.status || '?')) + ')' + (detail ? ' — ' + esc(detail) : '') + '</div>';
            return;
          }
          if (!data || typeof data.html !== 'string') {
            host!.innerHTML = '<div class="mfrs-error">Empty response.</div>';
            return;
          }
          host!.innerHTML = data.html;
        });
      }

      if (meta.supportsSql && wp.useSql && opts!.formId && opts!.fieldKey) {
        var parts = ['formId=' + encodeURIComponent(String(opts!.formId)),
                     'widgetKey=' + encodeURIComponent(opts!.fieldKey!),
                     'page=1', 'pageSize=2000'];
        var url = getApiBase() + 'DataRepeater/Query?' + parts.join('&');
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        var t = getAuthToken(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
        var af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          if (xhr.status < 200 || xhr.status >= 300) { postRender([]); return; }
          try {
            var d = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            var cols = (d && (d.columns || d.Columns)) || [];
            var rrows = (d && (d.rows || d.Rows)) || [];
            if (Array.isArray(cols) && cols.length && rrows.length && Array.isArray(rrows[0])) {
              var names = cols.map(function (c: any) { return String(c.name || c.Name || ''); });
              rrows = rrows.map(function (r: any[]) {
                var o: any = {};
                for (var i = 0; i < names.length; i++) o[names[i]] = r[i];
                return o;
              });
            }
            postRender(rrows);
          } catch (_e) { postRender([]); }
        };
        xhr.send();
      } else {
        postRender([]);
      }
    }

    // ── LIVE PREVIEW TAB (iframe of /Preview) ───────────────────────
    function renderPreviewTab() {
      body.innerHTML = '<div style="flex:1"><iframe src="' + esc(previewUrl()) + '" style="width:100%;height:100%;border:0"></iframe></div>';
      hidePrimary();
      setHint('Server-side preview of every registered recipe with sample data.');
    }

    // ── ADVANCED TAB (source viewer + custom razor) ─────────────────
    function renderAdvanced() {
      ensureCatalog(function (err) {
        if (err) {
          body.innerHTML = '<div style="flex:1;padding:20px"><div class="mfrs-error">Catalog unavailable.</div></div>';
          hidePrimary();
          return;
        }
        body.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;min-height:0">'
          + '<div class="mfrs-adv-tabs">'
          +   '<button class="mfrs-adv-tab ' + (state.advTab === 'source' ? 'is-active' : '') + '" data-adv="source">View built-in source (read-only)</button>'
          +   '<button class="mfrs-adv-tab ' + (state.advTab === 'custom' ? 'is-active' : '') + '" data-adv="custom">Write custom .razor (escape hatch)</button>'
          + '</div>'
          + '<div class="mfrs-adv-body" id="mfrs-adv-body"></div>'
          + '</div>';

        Array.prototype.forEach.call(body.querySelectorAll('.mfrs-adv-tab'), function (el: HTMLElement) {
          el.addEventListener('click', function () {
            state.advTab = String(el.getAttribute('data-adv') || 'source');
            renderAdvanced();
          });
        });

        var sub = document.getElementById('mfrs-adv-body') as HTMLElement;
        if (state.advTab === 'source') renderAdvSource(sub);
        else renderAdvCustom(sub);
      });
    }

    function renderAdvSource(host: HTMLElement) {
      var cat = state.catalog || [];
      if (!state.selected && cat.length) state.selected = cat[0].name;
      var listHtml = '<div class="mfrs-list" style="height:100%">';
      cat.forEach(function (t) {
        listHtml += '<div class="mfrs-list-item ' + (t.name === state.selected ? 'is-selected' : '') + '" data-name="' + esc(t.name) + '">' + esc(t.name) + '</div>';
      });
      listHtml += '</div>';
      host.style.padding = '0';
      host.style.display = 'flex';
      host.innerHTML = listHtml + '<div style="flex:1;padding:18px 22px;overflow:auto" id="mfrs-adv-srcpane"><em>Loading…</em></div>';
      Array.prototype.forEach.call(host.querySelectorAll('.mfrs-list-item'), function (el: HTMLElement) {
        el.addEventListener('click', function () {
          state.selected = String(el.getAttribute('data-name') || '');
          renderAdvSource(host);
        });
      });
      var pane = document.getElementById('mfrs-adv-srcpane') as HTMLElement;
      ensureSource(state.selected, function (e2, src) {
        if (e2) { pane.innerHTML = '<div class="mfrs-error">Could not load source for <strong>' + esc(state.selected) + '</strong>.</div>'; return; }
        pane.innerHTML = '<div class="mfrs-banner">Built-in templates are read-only. Switch to <strong>Write custom .razor</strong> to author a bespoke widget.</div>'
          + '<textarea class="mfrs-source" readonly spellcheck="false">' + esc(src) + '</textarea>';
      });
      hidePrimary();
      setHint('Read-only source of a built-in recipe — useful as a starting point for custom widgets.');
    }

    function renderAdvCustom(host: HTMLElement) {
      var wp = state.workingProps || {};
      var existingSrc = String(wp.razorSource || opts!.initialOverride || '');
      var initial = existingSrc || defaultCustomSkeleton(opts!.fieldKey || 'CustomField');
      host.style.padding = '18px 22px';
      host.style.display = 'block';
      host.innerHTML = '<div class="mfrs-banner">Escape hatch — only use when no built-in recipe fits. Server JIT-compiles via Roslyn; errors land in the result box below.</div>'
        + '<div style="margin-bottom:8px"><label style="font-size:12px;font-weight:600">Template name</label>'
        + '<input id="mfrs-cus-name" type="text" value="' + esc(opts!.fieldKey ? opts!.fieldKey.replace(/[^A-Za-z0-9]/g,'') + '_Custom' : 'CustomTemplate') + '" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;box-sizing:border-box" /></div>'
        + '<textarea id="mfrs-cus-src" class="mfrs-source" style="min-height:280px">' + esc(initial) + '</textarea>'
        + '<div id="mfrs-cus-result" style="margin-top:10px"></div>';

      setPrimary('Compile + apply', function () {
        var name = (document.getElementById('mfrs-cus-name') as HTMLInputElement).value;
        var src = (document.getElementById('mfrs-cus-src') as HTMLTextAreaElement).value;
        var box = document.getElementById('mfrs-cus-result') as HTMLElement;
        box.innerHTML = '<em style="color:#94a3b8">Compiling…</em>';
        ajaxPost(compileUrl(), { templateName: name, source: src }, function (err, data) {
          if (err) {
            box.innerHTML = '<div class="mfrs-error">Compile call failed: HTTP ' + esc(err.status || '?') + '</div>';
            return;
          }
          if (data && data.success) {
            box.innerHTML = '<div style="background:#dcfce7;border:1px solid #86efac;color:#166534;padding:10px;border-radius:8px;font-size:13px">Compiled OK. Registered as <strong>' + esc(name) + '</strong>.</div>';
            state.workingProps = state.workingProps || {};
            state.workingProps.razorSource = src;
            state.workingProps.templateName = '';
            state.catalog = null;
            if (opts && typeof opts.onApplyProps === 'function') {
              try { (opts as any).onApplyProps(state.workingProps); } catch (_e) { /* ignore */ }
              close();
            } else if (opts && typeof opts.onSaveOverride === 'function') {
              try { (opts as any).onSaveOverride(src); } catch (_e) { /* ignore */ }
              close();
            }
          } else {
            var errs = (data && data.errors) || [];
            box.innerHTML = '<div class="mfrs-error">Compile failed (' + errs.length + ' error(s)):<ul style="margin:6px 0 0 18px">'
              + errs.map(function (e: any) { return '<li>L' + (e.line || '?') + ' C' + (e.column || '?') + ' [' + esc(e.code || '') + ']: ' + esc(e.message || '') + '</li>'; }).join('')
              + '</ul></div>';
          }
        });
      });
      setHint('Custom .razor source — Roslyn-compiled on Apply. Default to a recipe instead when possible.');
    }

    function defaultCustomSkeleton(fieldKey: string): string {
      var name = String(fieldKey || 'Custom').replace(/[^A-Za-z0-9]/g, '');
      return [
        '@*  Custom Razor — designed for field `' + fieldKey + '`. AI/host can edit freely. *@',
        '@using MegaForm.Razor',
        '@using MegaForm.Core.Interfaces',
        '@using System.Linq',
        '@inherits MfRazorWidgetBase',
        '@attribute [RazorTemplate("' + name + '_Custom", Category = "Custom", Description = "Bespoke widget for ' + fieldKey + '", SupportsSql = true, EmitsValue = false, IsRecipe = false)]',
        '',
        '@{ var rows = SqlRows == null ? new System.Collections.Generic.List<object>() : SqlRows.Cast<object>().ToList(); }',
        '<div class="mf-custom-' + name.toLowerCase() + '" style="font-family:system-ui">',
        '    @if (!rows.Any()) { <em style="color:#94a3b8">No data.</em> }',
        '    else {',
        '        <table style="width:100%;border-collapse:collapse">',
        '            <thead><tr>',
        '                @{ var first = rows.First() as System.Collections.Generic.IDictionary<string, object>; }',
        '                @foreach (var k in first?.Keys ?? System.Array.Empty<string>()) {',
        '                    <th style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left">@k</th>',
        '                }',
        '            </tr></thead>',
        '            <tbody>',
        '                @foreach (var r in rows) {',
        '                    var d = r as System.Collections.Generic.IDictionary<string, object>;',
        '                    <tr>',
        '                        @foreach (var k in d?.Keys ?? System.Array.Empty<string>()) {',
        '                            <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">@d[k]</td>',
        '                        }',
        '                    </tr>',
        '                }',
        '            </tbody>',
        '        </table>',
        '    }',
        '</div>',
      ].join('\n');
    }

    function renderPanel() {
      // Make body a flex container so panels stretch
      body.style.display = 'flex';
      if (state.active === 'recipe')        renderRecipe();
      else if (state.active === 'preview')  renderPreviewTab();
      else                                  renderAdvanced();
    }
    renderPanel();
  }

  (global as any).MFRazorStudio = { open: open, badge: BADGE };
})(typeof window !== 'undefined' ? window : (this as any));
