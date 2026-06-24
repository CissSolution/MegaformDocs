/**
 * MegaForm UserTemplate (BYOM Layer 2) Widget Plugin
 * Badge: UserTemplate v20260602-L2
 *
 * Registers a new field type "UserTemplate" that hosts customer-authored
 * .html / .cshtml / .ascx files dropped into:
 *
 *   DNN    : <webroot>/DesktopModules/MegaForm/Resources/UserTemplates/
 *   Oqtane : <webroot>/Modules/MegaForm/Resources/UserTemplates/
 *
 * Layer 2 scope (this file):
 *   - Field type appears in Builder palette + canvas
 *   - Right-pane inspector exposes Template picker + Show-in-error flag
 *   - Canvas renders a static placeholder badge ("BYOM: <name>") so the
 *     author can see the slot. The runtime renderer (/API/UserTemplate/Render)
 *     is wired in a later layer; Layer 2 only ships the Builder-side UI.
 *   - No user input → collect() + validate() return null / true.
 *
 * Template list is fetched ONCE per page load (cached in module scope) from
 * /DesktopModules/MegaForm/API/UserTemplate/List. The properties[] schema
 * exposes templateName as a "select" with an "options" array — that array is
 * the cached list. NOTE: because the Builder property panel reads
 * properties[] at register-time (not at panel-render-time), the dropdown
 * will only be populated AFTER the List call resolves. We mutate the same
 * options array in place so subsequent panel paints (every field re-select)
 * pick up the entries. If the panel renders before the fetch completes, the
 * options stay empty until the next paint — acceptable for L2; L3 should
 * add a proper dynamic-options hook to the field-plugin contract (see notes
 * in the parent task report).
 */

(function (global: any) {
  'use strict';

  var BADGE = 'UserTemplate v20260602-L2';
  var MegaFormWidgets: any = global.MegaFormWidgets;

  if (!MegaFormWidgets || typeof MegaFormWidgets.register !== 'function') return;

  // ───────────────────────────────────────────────────────────────────────────
  //  Module-scoped cache + bootstrap fetch
  // ───────────────────────────────────────────────────────────────────────────

  // The mutable options array consumed by the Builder property panel.
  // Each entry has { label, value } shape so it slots straight into a
  // <select> control.
  var _userTemplateOptions: any[] = [
    { label: '-- pick a template --', value: '' }
  ];

  // Raw template-descriptor list straight from the server (for downstream
  // tooling that may want richer metadata than just label/value).
  // Exposed on the plugin object via getTemplateList() for diagnostics.
  var _userTemplateList: any[] = [];

  function normalizeList(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.Items)) return payload.Items;
    if (payload && Array.isArray(payload.templates)) return payload.templates;
    if (payload && Array.isArray(payload.Templates)) return payload.Templates;
    return [];
  }

  function toOption(entry: any): any {
    if (!entry) return null;
    if (typeof entry === 'string') return { label: entry, value: entry };
    var value = entry.name || entry.Name || entry.path || entry.Path || entry.id || entry.Id || '';
    if (!value) return null;
    var label = entry.label || entry.Label || entry.displayName || entry.DisplayName || entry.title || entry.Title || value;
    var kind = entry.kind || entry.Kind || '';
    var suffix = kind ? ' [' + String(kind) + ']' : '';
    return { label: String(label) + suffix, value: String(value) };
  }

  // [B51] Platform-aware API base resolver — inlined because this is an IIFE
  // plugin that loads before module bundles. Mirrors getApiBase() in shared/platform-host.ts.
  function _resolveApiBase(): string {
    var w = global as any;
    if (w.__MF_API_BASE__) return String(w.__MF_API_BASE__).replace(/\/$/, '');
    var pf = (w.__MF_PLATFORM__ || {}) as any;
    if (pf.apiBase) return String(pf.apiBase).replace(/\/$/, '');
    var platform = String(pf.platform || '').toLowerCase();
    if (platform === 'oqtane') return '/api/MegaForm';
    if (platform === 'dnn') return '/DesktopModules/MegaForm/API';
    if (w.Oqtane || w.__OQTANE__) return '/api/MegaForm';
    if (typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-mf-platform="oqtane"]')) return '/api/MegaForm';
    return '/DesktopModules/MegaForm/API';
  }

  function refreshOptions(list: any[]): void {
    // Mutate the SAME array reference (don't reassign) so any property-panel
    // code that captured a pointer to it sees the new entries.
    _userTemplateOptions.length = 0;
    _userTemplateOptions.push({ label: '-- pick a template --', value: '' });
    for (var i = 0; i < list.length; i++) {
      var opt = toOption(list[i]);
      if (opt) _userTemplateOptions.push(opt);
    }
  }

  function fetchTemplateList(): void {
    try {
      var url = _resolveApiBase() + '/UserTemplate/List';
      // Use fetch when available; fall back to XHR for older runtimes.
      if (typeof global.fetch === 'function') {
        global.fetch(url, { credentials: 'same-origin' })
          .then(function (r: any) { return r && r.ok ? r.json() : []; })
          .then(function (payload: any) {
            _userTemplateList = normalizeList(payload);
            refreshOptions(_userTemplateList);
          })
          .catch(function () { /* leave defaults */ });
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            _userTemplateList = normalizeList(JSON.parse(xhr.responseText || '[]'));
            refreshOptions(_userTemplateList);
          } catch (_e) { /* swallow — keep defaults */ }
        }
      };
      xhr.onerror = function () { /* swallow — keep defaults */ };
      xhr.send();
    } catch (_e) { /* swallow — keep defaults */ }
  }

  // Kick off once at plugin load. The Builder is single-page so one fetch
  // per page life-cycle is plenty.
  fetchTemplateList();

  // ───────────────────────────────────────────────────────────────────────────
  //  HTML escape helper (mirrors the dynamic-label plugin)
  // ───────────────────────────────────────────────────────────────────────────

  function esc(v: any): string {
    var s = v == null ? '' : String(v);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(v: any): string { return esc(v); }
  function toBool(v: any, fallback: boolean): boolean {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    var s = String(v).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }

  function getProps(field: any): any {
    var wp = field && (field.widgetProps || field.WidgetProps) ? (field.widgetProps || field.WidgetProps) : {};
    return {
      templateName: String(wp.templateName || ''),
      showInError: toBool(wp.showInError, false)
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  Plugin registration
  // ───────────────────────────────────────────────────────────────────────────

  MegaFormWidgets.register('UserTemplate', {
    meta: {
      type: 'UserTemplate',
      label: 'User Template (BYOM)',
      icon: 'fas fa-puzzle-piece',
      category: 'Layout',
      color: '#a855f7',
      defaultWidth: '100%'
    },
    defaults: {
      templateName: ''
    },
    properties: [
      {
        key: '__userTemplateHelp',
        label: 'User Template (BYOM) Help',
        type: 'help',
        html:
          '<div class="mfw-user-template-help">' +
          '<p><strong>Bring Your Own Module (BYOM)</strong> — drop a <code>.html</code>, ' +
          '<code>.cshtml</code>, or <code>.ascx</code> file into ' +
          '<code>Resources/UserTemplates/</code> on the server. MegaForm will discover it ' +
          'and list it below.</p>' +
          '<p>Layer 2 ships the Builder side only — the runtime render endpoint ' +
          '(<code>/API/UserTemplate/Render</code>) lands in the next layer. Until then ' +
          'the canvas shows a placeholder badge.</p>' +
          '</div>'
      },
      {
        key: 'templateName',
        label: 'Template',
        type: 'select',
        // Shared array reference — mutated in place when the List API resolves.
        options: _userTemplateOptions,
        default: '',
        defaultValue: ''
      },
      {
        key: 'showInError',
        label: 'Show in error',
        type: 'checkbox',
        default: false,
        defaultValue: false
      }
    ],

    /**
     * Canvas-time render. Emits a wrapper div that BYOM Layer 3's runtime
     * piece will later populate via /API/UserTemplate/Render. For Layer 2
     * we only need a visible placeholder so the field exists on the canvas.
     */
    render: function (field: any, formId: number): string {
      var props = getProps(field);
      var fieldKey = field && field.key ? String(field.key) : 'utpl';
      var wrapId = 'mf-' + formId + '-' + fieldKey + '-user-template';
      var badge = props.templateName ? 'BYOM: ' + props.templateName : 'Pick a template…';
      var hint = props.templateName
        ? 'This slot will render the <strong>' + esc(props.templateName) + '</strong> user template at runtime.'
        : 'Open the right-hand inspector and pick a template from <code>Resources/UserTemplates/</code>.';
      return '<div class="mfw-user-template-wrap" id="' + attr(wrapId) + '"' +
        ' data-badge="' + attr(BADGE) + '"' +
        ' data-formid="' + attr(formId) + '"' +
        ' data-field-key="' + attr(fieldKey) + '"' +
        ' data-mfut-key="' + attr(fieldKey) + '"' +
        ' data-mfut-name="' + attr(props.templateName) + '"' +
        ' data-mfut-show-in-error="' + attr(props.showInError ? '1' : '0') + '"' +
        ' style="border:1px dashed #c084fc;border-radius:6px;padding:10px;background:#faf5ff;color:#4c1d95;">' +
        '<div class="mfw-user-template-badge" style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px;">' +
        esc(badge) +
        '</div>' +
        '<div class="mfw-user-template-content" style="font-size:12px;color:#6b21a8;">' +
        hint +
        '</div>' +
        '</div>';
    },

    /**
     * BYOM Layer 3 runtime hydration.
     * For each `.mfw-user-template-wrap` on the page, POST to
     * `/DesktopModules/MegaForm/API/UserTemplate/Render` with the
     * widget name + form context, then paint the returned HTML into
     * `.mfw-user-template-content`. On error, optionally paint a red
     * inline error block (gated by `data-mfut-show-in-error`).
     *
     * This mirrors DynamicLabel's `refresh()` pattern — the wrapper
     * keeps its dashed border + badge so Builder mode still flags the
     * slot, only the inner content target is swapped.
     */
    bind: function (_formId: number) {
      function paintError(target: HTMLElement, wrap: HTMLElement, message: string) {
        var showInError = wrap.getAttribute('data-mfut-show-in-error') === '1';
        if (!showInError) {
          // Hide errors silently — leave the placeholder copy in place.
          return;
        }
        target.innerHTML =
          '<div class="mfw-user-template-error" style="' +
          'border:1px solid #fecaca;background:#fef2f2;color:#991b1b;' +
          'padding:8px 10px;border-radius:6px;font-size:12px;' +
          'font-family:Consolas,Menlo,monospace;white-space:pre-wrap;">' +
          '<strong>BYOM render error:</strong> ' + esc(message) +
          '</div>';
      }

      function renderOne(wrap: HTMLElement) {
        var name = wrap.getAttribute('data-mfut-name') || '';
        var target = wrap.querySelector('.mfw-user-template-content') as HTMLElement | null;
        if (!target) return;
        if (!name) {
          // No template picked yet — leave the placeholder copy.
          return;
        }
        var formId = wrap.getAttribute('data-formid') || '';
        var fieldKey = wrap.getAttribute('data-field-key') || wrap.getAttribute('data-mfut-key') || '';

        var url = _resolveApiBase() + '/UserTemplate/Render';
        var body = JSON.stringify({
          Name: name,
          FormId: formId ? Number(formId) || 0 : 0,
          FieldKey: fieldKey,
          Row: {},
          Form: {},
          Params: {}
        });
        var headers: any = { 'Content-Type': 'application/json' };
        // Best-effort anti-forgery token pick-up (DNN uses an input on the page).
        try {
          var tokenInput = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
          if (tokenInput && tokenInput.value) headers['RequestVerificationToken'] = tokenInput.value;
        } catch (_e) { /* ignore */ }

        function handleResponse(status: number, payload: any) {
          if (status >= 200 && status < 300 && payload && typeof payload.html === 'string') {
            target!.innerHTML = payload.html;
            return;
          }
          var msg = (payload && (payload.error || payload.Error || payload.message)) ||
                    ('HTTP ' + status);
          paintError(target!, wrap, String(msg));
        }

        try {
          if (typeof (global as any).fetch === 'function') {
            (global as any).fetch(url, {
              method: 'POST',
              credentials: 'same-origin',
              headers: headers,
              body: body
            })
              .then(function (r: any) {
                return r.json().then(function (p: any) { return { status: r.status, payload: p }; })
                  .catch(function () { return { status: r.status, payload: null }; });
              })
              .then(function (res: any) { handleResponse(res.status, res.payload); })
              .catch(function (e: any) {
                paintError(target!, wrap, e && e.message ? String(e.message) : 'Network error');
              });
            return;
          }
          var xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          for (var k in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, k)) {
              try { xhr.setRequestHeader(k, headers[k]); } catch (_e) { /* ignore */ }
            }
          }
          xhr.onload = function () {
            var payload: any = null;
            try { payload = JSON.parse(xhr.responseText || 'null'); } catch (_e) { /* ignore */ }
            handleResponse(xhr.status, payload);
          };
          xhr.onerror = function () { paintError(target!, wrap, 'Network error'); };
          xhr.send(body);
        } catch (e: any) {
          paintError(target!, wrap, e && e.message ? String(e.message) : String(e));
        }
      }

      try {
        var wraps = document.querySelectorAll('.mfw-user-template-wrap');
        for (var i = 0; i < wraps.length; i++) {
          renderOne(wraps[i] as HTMLElement);
        }
      } catch (_e) { /* swallow — bind failures must not break the form */ }
    },

    /**
     * Display-only widget — never contributes a value to the submission
     * payload. Returning null tells the collector to skip this field.
     */
    collect: function () { return null; },

    /**
     * Display-only widget — no validation required.
     */
    validate: function () { return null; }
  });

  // Expose a tiny diagnostics surface so the next-layer runtime + future
  // dynamic-options hook can introspect the cache without re-fetching.
  try {
    var plugins = global.MegaFormWidgets && global.MegaFormWidgets._plugins;
    if (plugins && plugins.UserTemplate) {
      plugins.UserTemplate.getTemplateList = function () { return _userTemplateList.slice(); };
      plugins.UserTemplate.refreshTemplateList = fetchTemplateList;
    }
  } catch (_e) { /* swallow — diagnostics only */ }

})(window as any);
