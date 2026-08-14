// ─────────────────────────────────────────────────────────────
//  after-submit-script.ts — Form Settings → "Server Script (host only)".
//
//  [AfterSubmitScript v20260813-01]
//
//  Unlike every other panel in this folder, this one does NOT read or write
//  schema.settings. It cannot: FormSchemaSensitivePropertyStripper removes
//  settings.afterSubmitScript from every schema payload the client receives,
//  because the block is server code plus the approval hash that authorises it.
//  So the panel talks to its own host-gated endpoints instead:
//
//    GET  {apiBase}FormScript/Get?formId=N
//    POST {apiBase}FormScript/Validate   { formId, source }
//    POST {apiBase}FormScript/TestRun    { formId, source, sampleData }
//    POST {apiBase}FormScript/Save       { formId, source, enabled, onFailure, timeoutSeconds }
//
//  A consequence worth stating: Save here is independent of the builder's own
//  Save button. Saving the form does not save the script, and saving the script
//  does not save the form. That is deliberate — the two have different authority.
//
//  The panel does no permission logic of its own. It asks the server, and shows
//  whatever the server says (403 host_only / 403 feature_disabled / 503
//  compiler_missing). Deciding in JavaScript who is a host would be the exact
//  mistake this feature is built to avoid.
// ─────────────────────────────────────────────────────────────

import { MegaFormBuilder } from './core';

(function () {
  'use strict';

  var B = MegaFormBuilder;
  var bound = false;
  var loadedForFormId = -1;
  var fieldKeys: string[] = [];

  var STARTER = [
    '// Runs on the server after the submission is saved.',
    '// ctx.GetString / GetDecimal / GetInt / GetBool read submitted values.',
    '// ctx.SetVariable records a result, ctx.Log writes to the run record.',
    '',
    'ctx.Log("Received " + ctx.GetString("' + '{FIRST_FIELD}' + '"));',
    ''
  ].join('\n');

  function el<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
  }

  // ── api plumbing (same shape as cloud-storage-settings.ts) ──
  function platformName(): string {
    var root = document.getElementById('mf-builder-root');
    var pf = (window as any).__MF_PLATFORM__ || {};
    return String((root && root.dataset && root.dataset.platform) || pf.platform || '').toLowerCase();
  }

  function apiBase(): string {
    var w = window as any;
    var cfg = (B.state.config || {}) as any;
    var base = (cfg && cfg.apiBaseUrl)
      || (typeof w.__MF_API_BASE__ === 'string' && w.__MF_API_BASE__)
      || (typeof w.API_BASE === 'string' && w.API_BASE)
      || ((w.__MF_PLATFORM__ || {}).apiBase) || '';
    if (!base) {
      var root = document.getElementById('mf-builder-root');
      base = (root && root.dataset && root.dataset.apiBase) || '';
    }
    if (!base) {
      var p = platformName();
      base = p === 'dnn' ? '/DesktopModules/MegaForm/API/'
           : p === 'umbraco' ? '/umbraco/MegaForm/MegaFormApi/'
           : '/api/MegaFormPopup/';
    }
    base = String(base);
    return base.charAt(base.length - 1) === '/' ? base : base + '/';
  }

  function dnnAntiForgery(): string {
    var tok = '';
    try {
      var sf = ((B.state.config || {}) as any).servicesFramework;
      if (sf && typeof sf.getAntiForgeryValue === 'function') tok = sf.getAntiForgeryValue() || '';
    } catch (_e) { tok = ''; }
    if (!tok) {
      try {
        var inputs = document.getElementsByName('__RequestVerificationToken');
        for (var i = 0; i < inputs.length; i++) {
          var v = (inputs[i] as HTMLInputElement).value;
          if (v && v.length > 10) { tok = v; break; }
        }
      } catch (_e) { /* noop */ }
    }
    return tok;
  }

  function headers(): Record<string, string> {
    var h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (platformName() === 'dnn') {
      var tok = dnnAntiForgery();
      if (tok) h['RequestVerificationToken'] = tok;
      return h;
    }
    var pf = (window as any).__MF_PLATFORM__ || {};
    var bearer = (window as any).__MF_TOKEN || pf.authToken;
    if (bearer) h['Authorization'] = 'Bearer ' + bearer;
    return h;
  }

  function url(path: string): string { return apiBase() + path; }

  function currentFormId(): number {
    var id = (B.state && (B.state as any).formId) || 0;
    if (!id && B.state && (B.state as any).config) id = (B.state as any).config.formId || 0;
    return Number(id) || 0;
  }

  // ── status line ────────────────────────────────────────────
  function setStatus(text: string, kind: 'ok' | 'error' | 'busy' | 'muted') {
    var box = el<HTMLDivElement>('mf-script-status');
    if (!box) return;
    var color = kind === 'ok' ? '#047857' : kind === 'error' ? '#b91c1c' : '#475569';
    box.style.color = color;
    box.textContent = text || '';
  }

  function renderDiagnostics(list: any[]) {
    var box = el<HTMLDivElement>('mf-script-diagnostics');
    if (!box) return;
    if (!list || !list.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = 'block';
    var rows = list.map(function (d) {
      // ScriptDiagnostic is a TYPED class, so DNN's WebAPI serialises it with its declared
      // PascalCase member names (Line/Code/Message) while the anonymous response objects around
      // it keep the lowercase names they were written with. Reading only one casing produced a
      // diagnostics row that rendered as "line 1 · —": right box, right colour, no content.
      // Caught by looking at the screenshot, not by the request succeeding.
      var line = d.line != null ? d.line : d.Line;
      var code = d.code != null ? d.code : d.Code;
      var message = d.message != null ? d.message : d.Message;
      var severity = d.severity != null ? d.severity : d.Severity;
      var isErr = severity === 'error';
      return '<div style="padding:4px 6px;border-left:3px solid ' + (isErr ? '#dc2626' : '#f59e0b') +
        ';background:' + (isErr ? '#fef2f2' : '#fffbeb') + ';margin-bottom:4px;font-size:11px">' +
        '<strong>line ' + (line || 1) + '</strong> · ' + escapeHtml(code || '') + ' — ' +
        escapeHtml(message || '') + '</div>';
    });
    box.innerHTML = rows.join('');
  }

  function escapeHtml(s: string): string {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setEditorEnabled(on: boolean) {
    ['mf-script-source', 'mf-script-enabled', 'mf-script-onfailure', 'mf-script-timeout',
     'mf-script-check', 'mf-script-test', 'mf-script-save'].forEach(function (id) {
      var e = el<HTMLInputElement>(id);
      if (e) e.disabled = !on;
    });
  }

  // ── load ───────────────────────────────────────────────────
  function load(force?: boolean) {
    var formId = currentFormId();
    var panel = el<HTMLDivElement>('mf-script-panel');
    if (!panel) return;
    if (!formId) {
      setStatus('Save the form once before adding a script.', 'muted');
      setEditorEnabled(false);
      return;
    }
    if (!force && loadedForFormId === formId) return;
    loadedForFormId = formId;

    setStatus('Loading…', 'busy');
    fetch(url('FormScript/Get?formId=' + formId), { headers: headers(), credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        if (res.status !== 200) {
          // 403 host_only / 403 feature_disabled / 503 compiler_missing — the server's own
          // wording, not a guess made here.
          setEditorEnabled(false);
          setStatus(res.body && res.body.message ? res.body.message : 'Not available.', 'error');
          return;
        }
        var b = res.body || {};
        fieldKeys = Array.isArray(b.fieldKeys) ? b.fieldKeys : [];
        var src = el<HTMLTextAreaElement>('mf-script-source');
        if (src) {
          src.value = b.Source || b.source ||
            STARTER.replace('{FIRST_FIELD}', fieldKeys[0] || 'full_name');
        }
        var en = el<HTMLInputElement>('mf-script-enabled');
        if (en) en.checked = !!(b.Enabled || b.enabled);
        var of = el<HTMLSelectElement>('mf-script-onfailure');
        if (of) of.value = (b.OnFailure || b.onFailure) === 'report' ? 'report' : 'continue';
        var to = el<HTMLInputElement>('mf-script-timeout');
        if (to) to.value = String(b.timeoutSeconds || 10);

        setEditorEnabled(true);
        renderDiagnostics([]);
        var keys = el<HTMLDivElement>('mf-script-fieldkeys');
        if (keys) {
          keys.innerHTML = fieldKeys.length
            ? 'Field keys: ' + fieldKeys.map(function (k) {
                return '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">' + escapeHtml(k) + '</code>';
              }).join(' ')
            : '';
        }
        if (b.approvedBy) {
          setStatus((b.runnable ? 'Active. ' : 'Saved but not running. ') +
            'Approved by ' + b.approvedBy +
            (b.runnableReason && !b.runnable ? ' — ' + b.runnableReason : ''),
            b.runnable ? 'ok' : 'muted');
        } else {
          setStatus('No script saved for this form yet.', 'muted');
        }
      })
      .catch(function () {
        setEditorEnabled(false);
        setStatus('Could not reach the server.', 'error');
      });
  }

  function payload(): any {
    return {
      formId: currentFormId(),
      source: (el<HTMLTextAreaElement>('mf-script-source') || ({} as any)).value || '',
      enabled: !!(el<HTMLInputElement>('mf-script-enabled') || ({} as any)).checked,
      onFailure: (el<HTMLSelectElement>('mf-script-onfailure') || ({} as any)).value || 'continue',
      timeoutSeconds: parseInt((el<HTMLInputElement>('mf-script-timeout') || ({} as any)).value, 10) || 10
    };
  }

  function post(path: string, body: any): Promise<{ status: number; body: any }> {
    return fetch(url(path), {
      method: 'POST', headers: headers(), credentials: 'same-origin', body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; });
    });
  }

  function check() {
    setStatus('Compiling…', 'busy');
    post('FormScript/Validate', payload()).then(function (res) {
      var b = res.body || {};
      renderDiagnostics(b.diagnostics || []);
      if (res.status !== 200) { setStatus(b.message || 'Not available.', 'error'); return; }
      setStatus(b.success ? 'Compiles cleanly.' : 'Does not compile — see below.', b.success ? 'ok' : 'error');
    });
  }

  function testRun() {
    // Sample values so a host can see the script run before any visitor does. Nothing is
    // persisted and no submission is created.
    var sample: any = {};
    fieldKeys.forEach(function (k) { sample[k] = 'sample ' + k.replace(/_/g, ' '); });
    var body = payload();
    body.sampleData = sample;

    setStatus('Running against sample values…', 'busy');
    post('FormScript/TestRun', body).then(function (res) {
      var b = res.body || {};
      renderDiagnostics(b.diagnostics || []);
      if (res.status !== 200) { setStatus(b.message || 'Not available.', 'error'); return; }
      if (!b.compiled) { setStatus('Does not compile — see below.', 'error'); return; }

      var out = el<HTMLDivElement>('mf-script-output');
      if (out) {
        var lines: string[] = [];
        (b.log || []).forEach(function (l: string) { lines.push(escapeHtml(l)); });
        var vars = b.variables || {};
        Object.keys(vars).forEach(function (k) {
          lines.push('<span style="color:#7c3aed">' + escapeHtml(k) + '</span> = ' + escapeHtml(String(vars[k])));
        });
        if (b.error) lines.push('<span style="color:#b91c1c">' + escapeHtml(b.error) + '</span>');
        out.style.display = lines.length ? 'block' : 'none';
        out.innerHTML = lines.join('<br/>');
      }
      setStatus(b.success ? ('Ran in ' + (b.durationMs || 0) + ' ms.') : ('Failed: ' + (b.error || '')),
        b.success ? 'ok' : 'error');
    });
  }

  function save() {
    setStatus('Compiling and saving…', 'busy');
    post('FormScript/Save', payload()).then(function (res) {
      var b = res.body || {};
      renderDiagnostics(b.diagnostics || []);
      if (res.status !== 200) {
        setStatus(b.message || 'Could not save.', 'error');
        return;
      }
      setStatus(b.message || 'Saved.', 'ok');
      loadedForFormId = -1;
      load(true);
    });
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', function (ev) {
      var t = (ev.target as HTMLElement);
      if (!t) return;
      var btn = t.closest ? (t.closest('#mf-script-check,#mf-script-test,#mf-script-save') as HTMLElement) : null;
      if (!btn) return;
      ev.preventDefault();
      if (btn.id === 'mf-script-check') check();
      else if (btn.id === 'mf-script-test') testRun();
      else if (btn.id === 'mf-script-save') save();
    });
  }

  B.registerModule('after-submit-script', {
    init: function () { bindUi(); load(false); },
    // panels.ts calls syncFromSchema when the Settings tab opens; for this panel that means
    // "re-ask the server", because the schema does not carry the block at all.
    syncFromSchema: function () { load(false); },
    readFromUi: function () { /* nothing to write into the schema — see file header */ }
  });
})();

export {};
