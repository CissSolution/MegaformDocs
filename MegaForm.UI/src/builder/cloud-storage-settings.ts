// ─────────────────────────────────────────────────────────────
//  cloud-storage-settings.ts — Form Settings → "Cloud Storage" section.
//
//  Reads/writes schema.settings.cloudStorage:
//    { enabled: boolean,
//      mappings: [{ providerName, connectionSettingsId, targetFolder,
//                   uploadFieldKeys: string[], organizeBySubmission }] }
//
//  The static shell (enable checkbox + mappings container + Add button) lives
//  in dom.ts next to Custom URL / Google Analytics; this module renders the
//  mapping rows and the "Manage connections" modal, and talks to the
//  server-side connection store:
//    GET  {apiBase}/ModuleConfig/CloudStorageConnectionsList
//    POST {apiBase}/ModuleConfig/CloudStorageConnectionSave
//    POST {apiBase}/ModuleConfig/CloudStorageConnectionDelete
//    POST {apiBase}/ModuleConfig/CloudStorageConnectionTest
//
//  API base + auth headers mirror the builder's existing fetch pattern
//  (toolbar.applySaveHeaders / db-insert-picker): DNN antiforgery token,
//  bearer token for Oqtane/Umbraco/Web, X-OQTANE-* context headers.
// ─────────────────────────────────────────────────────────────

import { MegaFormBuilder } from './core';
import { wt } from './designer-i18n';

(function () {
  'use strict';

  var B = MegaFormBuilder;
  var bound = false;

  var PROVIDERS = ['GoogleDrive', 'AmazonS3'];  // [AzureBlobRemoved v20260726] Azure Blob dropped (Azure.Core net472 crash risk)
  var FILE_FIELD_TYPES = ['File', 'FileUpload', 'PdfForm'];
  var SECRET_MASK = '***';
  var NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

  // Server-side connection catalog cache (shared by every mapping row).
  var connections: any[] = [];
  var providers: string[] = PROVIDERS.slice();
  var connectionsPromise: Promise<any> | null = null;

  // ── settings state ─────────────────────────────────────────
  function ensureSettings(): any {
    if (!B.state.schema.settings) B.state.schema.settings = {};
    var s = B.state.schema.settings as any;
    if (!s.cloudStorage && s.CloudStorage) s.cloudStorage = s.CloudStorage;
    if (!s.cloudStorage || typeof s.cloudStorage !== 'object') s.cloudStorage = {};
    var cs = s.cloudStorage;
    if (cs.enabled == null && cs.Enabled == null) cs.enabled = false;
    var maps = cs.mappings || cs.Mappings;
    if (!Array.isArray(maps)) maps = [];
    cs.mappings = maps.map(function (m: any) {
      m = m || {};
      return {
        providerName: m.providerName || m.provider || m.ProviderName || PROVIDERS[0],
        connectionSettingsId: m.connectionSettingsId || m.connectionName || m.ConnectionSettingsId || '',
        targetFolder: m.targetFolder || m.TargetFolder || '',
        uploadFieldKeys: Array.isArray(m.uploadFieldKeys) ? m.uploadFieldKeys
                       : (Array.isArray(m.UploadFieldKeys) ? m.UploadFieldKeys : []),
        organizeBySubmission: !!(m.organizeBySubmission != null ? m.organizeBySubmission : m.OrganizeBySubmission)
      };
    });
    return s;
  }

  // ── api base + headers (mirror toolbar.applySaveHeaders) ───
  function platformName(): string {
    var root = document.getElementById('mf-builder-root');
    var pf = (window as any).__MF_PLATFORM__ || {};
    return String((root && root.dataset && root.dataset.platform) || pf.platform || '').toLowerCase();
  }

  function apiBase(): string {
    var w = window as any;
    var base = (B.state.config && B.state.config.apiBaseUrl)
      || (typeof w.__MF_API_BASE__ === 'string' && w.__MF_API_BASE__)
      || (typeof w.API_BASE === 'string' && w.API_BASE) // dom.ts exposes data-api-base here
      || ((w.__MF_PLATFORM__ || {}).apiBase)
      || '';
    if (!base) {
      var root = document.getElementById('mf-builder-root');
      base = (root && root.dataset && root.dataset.apiBase) || '';
    }
    if (!base) {
      var p = platformName();
      base = p === 'dnn' ? '/DesktopModules/MegaForm/API/'
           : p === 'umbraco' ? '/umbraco/MegaForm/MegaFormApi/'
           : '/api/MegaForm/';
    }
    base = String(base);
    return base.charAt(base.length - 1) === '/' ? base : base + '/';
  }

  function dnnAntiForgery(): string {
    var tok = '';
    try {
      var sf = B.state.config && B.state.config.servicesFramework;
      if (sf && typeof sf.getAntiForgeryValue === 'function') tok = sf.getAntiForgeryValue() || '';
    } catch (_e) { tok = ''; }
    if (!tok) {
      try {
        if ((window as any).WebSF && typeof (window as any).WebSF.getAntiForgeryValue === 'function') {
          tok = (window as any).WebSF.getAntiForgeryValue() || '';
        }
      } catch (_e) { /* noop */ }
    }
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
    var p = platformName();
    if (p === 'dnn') {
      // [v20260527-04] No TabId/ModuleId headers on DNN — the framework cross-checks
      // them against the alias-resolved portal and 400s on child-portal subpaths.
      var tok = dnnAntiForgery();
      if (tok) h['RequestVerificationToken'] = tok;
      return h;
    }
    var pf = (window as any).__MF_PLATFORM__ || {};
    var bearer = (window as any).__MF_TOKEN || pf.authToken;
    if (bearer) h['Authorization'] = 'Bearer ' + bearer;
    if (p === 'oqtane') {
      if ((pf.moduleId || 0) > 0) h['X-OQTANE-MODULEID'] = String(pf.moduleId);
      if ((pf.siteId || 0) > 0) h['X-OQTANE-SITEID'] = String(pf.siteId);
      if ((pf.aliasId || 0) > 0) h['X-OQTANE-ALIASID'] = String(pf.aliasId);
    }
    return h;
  }

  function buildUrl(path: string): string {
    var url = apiBase() + path;
    // DNN: scope to the caller's portal via query (see toolbar.appendDnnPortalQuery).
    if (platformName() === 'dnn' && !/[?&]portalId=/i.test(url)) {
      var pf = (window as any).__MF_PLATFORM__ || {};
      var raw = pf.portalId !== undefined ? pf.portalId : pf.PortalId;
      var n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '' : raw), 10);
      if (!isFinite(n) || n < 0) n = 0;
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + n;
    }
    return url;
  }

  async function getJson(path: string): Promise<any> {
    var r = await fetch(buildUrl(path), { credentials: 'same-origin', headers: headers() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function postJson(path: string, body: any): Promise<any> {
    var r = await fetch(buildUrl(path), {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers(),
      body: JSON.stringify(body)
    });
    var j: any = await r.json().catch(function () { return {}; });
    if (!r.ok && !j.message) j.message = 'HTTP ' + r.status;
    return j;
  }

  // ── connection catalog ─────────────────────────────────────
  function loadConnections(force?: boolean): Promise<any> {
    if (connectionsPromise && !force) return connectionsPromise;
    connectionsPromise = getJson('ModuleConfig/CloudStorageConnectionsList')
      .then(function (j) {
        var items = (j && (j.connections || j.Connections)) || [];
        connections = Array.isArray(items) ? items : [];
        var prov = (j && (j.providers || j.Providers)) || [];
        providers = Array.isArray(prov) && prov.length ? prov.map(String) : PROVIDERS.slice();
        return j;
      })
      .catch(function () { connections = []; })
      .then(function () { connectionsPromise = null; });
    return connectionsPromise;
  }

  // ── form file fields ───────────────────────────────────────
  function fileFields(): Array<{ key: string; label: string }> {
    var fields = (B.state.schema && B.state.schema.fields) || [];
    return fields
      .filter(function (f: any) { return f && FILE_FIELD_TYPES.indexOf(String(f.type || '')) >= 0 && f.key; })
      .map(function (f: any) { return { key: String(f.key), label: String(f.label || f.key) }; });
  }

  // ── DOM helpers ────────────────────────────────────────────
  function esc(s: any): string {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c];
    });
  }
  function container(): HTMLElement | null { return document.getElementById('mf-cloud-storage-mappings'); }

  // ── mapping rows ───────────────────────────────────────────
  function providerOptions(selected: string): string {
    return providers.map(function (p) {
      return '<option value="' + esc(p) + '"' + (p === selected ? ' selected' : '') + '>' + esc(p) + '</option>';
    }).join('');
  }

  function connectionOptions(selected: string): string {
    var opts = '<option value="">' + esc(wt('builder.cloudStorage.connection_none', '— select connection —')) + '</option>';
    connections.forEach(function (c) {
      var name = String(c.name || c.Name || '');
      if (!name) return;
      opts += '<option value="' + esc(name) + '"' + (name === selected ? ' selected' : '') + '>' + esc(name) + '</option>';
    });
    // Keep a legacy/removed connection selectable (same convention as the DB pickers).
    if (selected && connections.every(function (c) { return String(c.name || c.Name || '') !== selected; })) {
      opts += '<option value="' + esc(selected) + '" selected>' + esc(selected) + '</option>';
    }
    return opts;
  }

  function renderMappings(): void {
    var host = container();
    if (!host) return;
    var cs = ensureSettings().cloudStorage;
    var maps = cs.mappings as any[];
    if (!maps.length) {
      host.innerHTML =
        '<div style="font-size:11px;color:#94a3b8;padding:6px 2px">' + esc(wt('builder.cloudStorage.empty_hint', 'No mappings yet.')) + ' ' +
        '<button type="button" data-cs-manage class="btn btn-link btn-sm p-0" style="font-size:11px">' + esc(wt('builder.cloudStorage.manage', 'Manage connections…')) + '</button></div>';
      return;
    }
    var fields = fileFields();
    host.innerHTML = maps.map(function (m, i) {
      var fieldsHtml = fields.length
        ? fields.map(function (f) {
            var ck = m.uploadFieldKeys.indexOf(f.key) >= 0 ? ' checked' : '';
            return '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#475569;font-weight:400;margin:0;padding:1px 0;cursor:pointer">' +
              '<input type="checkbox" data-cs-field value="' + esc(f.key) + '"' + ck + ' style="margin:0"/> ' + esc(f.label) + '</label>';
          }).join('')
        : '<div style="font-size:11px;color:#94a3b8;font-style:italic">' + esc(wt('builder.cloudStorage.upload_fields_none', '(no file upload fields in this form)')) + '</div>';
      return '<div class="mf-cs-mapping" data-index="' + i + '" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#f8fafc">' +
        '<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">' +
          '<select data-cs-provider class="form-control form-control-sm" style="flex:1;min-width:0" title="' + esc(wt('builder.cloudStorage.provider', 'Provider')) + '">' + providerOptions(m.providerName) + '</select>' +
          '<select data-cs-conn class="form-control form-control-sm" style="flex:1.3;min-width:0" title="' + esc(wt('builder.cloudStorage.connection', 'Connection')) + '">' + connectionOptions(m.connectionSettingsId) + '</select>' +
          '<button type="button" data-cs-refresh class="btn btn-default btn-sm" title="' + esc(wt('builder.cloudStorage.refresh_title', 'Refresh connections')) + '" style="padding:2px 7px"><i class="fas fa-sync-alt"></i></button>' +
          '<button type="button" data-cs-manage class="btn btn-default btn-sm" title="' + esc(wt('builder.cloudStorage.manage', 'Manage connections…')) + '" style="padding:2px 7px"><i class="fas fa-cog"></i></button>' +
          '<button type="button" data-cs-del class="btn btn-default btn-sm" title="' + esc(wt('builder.cloudStorage.remove_title', 'Remove mapping')) + '" style="padding:2px 7px;color:#dc2626"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<input type="text" data-cs-folder class="form-control form-control-sm" value="' + esc(m.targetFolder) + '" placeholder="' + esc(wt('builder.cloudStorage.target_folder_ph', 'Target folder (e.g. uploads/{formId})')) + '" style="margin-bottom:6px"/>' +
        '<div style="margin-bottom:4px"><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em">' + esc(wt('builder.cloudStorage.upload_fields', 'Upload fields')) + '</div>' +
          fieldsHtml +
          (fields.length ? '<div style="font-size:10px;color:#94a3b8">' + esc(wt('builder.cloudStorage.upload_fields_hint', 'None selected = all file fields')) + '</div>' : '') +
        '</div>' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#475569;font-weight:400;margin:0;cursor:pointer">' +
          '<input type="checkbox" data-cs-organize style="margin:0"' + (m.organizeBySubmission ? ' checked' : '') + '/> ' + esc(wt('builder.cloudStorage.organize', 'Organize by submission')) +
        '</label>' +
      '</div>';
    }).join('');
  }

  // ── state <-> UI ───────────────────────────────────────────
  function readFromUi(): void {
    var cs = ensureSettings().cloudStorage;
    var on = document.getElementById('mf-setting-cloud-storage-enabled') as HTMLInputElement | null;
    cs.enabled = !!(on && on.checked);
    var maps: any[] = [];
    var host = container();
    if (host) {
      var rows = host.querySelectorAll('.mf-cs-mapping');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var keys: string[] = [];
        row.querySelectorAll('input[data-cs-field]:checked').forEach(function (cb) {
          keys.push((cb as HTMLInputElement).value);
        });
        maps.push({
          providerName: (row.querySelector('[data-cs-provider]') as HTMLSelectElement).value || PROVIDERS[0],
          connectionSettingsId: (row.querySelector('[data-cs-conn]') as HTMLSelectElement).value || '',
          targetFolder: (row.querySelector('[data-cs-folder]') as HTMLInputElement).value || '',
          uploadFieldKeys: keys,
          organizeBySubmission: !!(row.querySelector('[data-cs-organize]') as HTMLInputElement).checked
        });
      }
    }
    cs.mappings = maps;
    B.state.isDirty = true;
  }

  function syncFromSchema(): void {
    var cs = ensureSettings().cloudStorage;
    var on = document.getElementById('mf-setting-cloud-storage-enabled') as HTMLInputElement | null;
    if (on) on.checked = !!(cs.enabled || cs.Enabled);
    renderMappings();
  }

  function refreshConnectionsAndRows(): void {
    readFromUi(); // keep current row values in state before re-render
    void loadConnections(true).then(renderMappings);
  }

  // ── manage-connections modal ───────────────────────────────
  function modalEl(): HTMLElement | null { return document.getElementById('mf-cs-conn-modal'); }

  function buildModal(): HTMLElement {
    var ov = document.createElement('div');
    ov.id = 'mf-cs-conn-modal';
    ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.45);align-items:center;justify-content:center;';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:12px;width:560px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.25)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e8f0">' +
          '<strong style="font-size:14px">' + esc(wt('builder.cloudStorage.conn_modal_title', 'Cloud Storage Connections')) + '</strong>' +
          '<button type="button" data-cs-close class="btn btn-link btn-sm" style="font-size:18px;line-height:1;color:#64748b;text-decoration:none">&times;</button>' +
        '</div>' +
        '<div style="padding:14px 18px;overflow:auto">' +
          '<div data-cs-list style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>' +
          '<button type="button" data-cs-add class="mf-builder-btn" style="width:100%;margin-bottom:10px"><i class="fas fa-plus"></i> ' + esc(wt('builder.cloudStorage.conn_add', 'Add connection')) + '</button>' +
          '<div data-cs-form style="display:none;border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc">' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_name', 'Name')) + '</label>' +
              '<input type="text" data-cs-f-name class="form-control form-control-sm" maxlength="64"/></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_provider', 'Provider')) + '</label>' +
              '<select data-cs-f-provider class="form-control form-control-sm"></select></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_access_token', 'Access token')) + '</label>' +
              '<input type="password" data-cs-f-accesstoken class="form-control form-control-sm" autocomplete="new-password"/></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_refresh_token', 'Refresh token')) + '</label>' +
              '<input type="text" data-cs-f-refreshtoken class="form-control form-control-sm" autocomplete="off"/></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_client_id', 'Client ID')) + '</label>' +
              '<input type="text" data-cs-f-clientid class="form-control form-control-sm" autocomplete="off"/></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_client_secret', 'Client secret')) + '</label>' +
              '<input type="password" data-cs-f-clientsecret class="form-control form-control-sm" autocomplete="new-password"/></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_base_folder', 'Base folder / bucket / container')) + '</label>' +
              '<input type="text" data-cs-f-basefolder class="form-control form-control-sm"/></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_base_url', 'Base URL')) + '</label>' +
              '<input type="text" data-cs-f-baseurl class="form-control form-control-sm" placeholder="https://…"/></div>' +
            '<div class="form-group"><label style="font-size:11px">' + esc(wt('builder.cloudStorage.conn_extra', 'Extra (JSON or key=value lines)')) + '</label>' +
              '<textarea data-cs-f-extra class="form-control form-control-sm" rows="2" style="font-family:ui-monospace,Consolas,monospace"></textarea></div>' +
            '<div style="font-size:10px;color:#94a3b8;margin-bottom:8px">' + esc(wt('builder.cloudStorage.conn_secret_hint', '"***" keeps the stored secret; type a new value to replace it.')) + '</div>' +
            '<div style="display:flex;gap:6px;align-items:center">' +
              '<button type="button" data-cs-test class="mf-builder-btn" style="flex:0 0 auto"><i class="fas fa-bolt"></i> ' + esc(wt('builder.cloudStorage.conn_test', 'Test')) + '</button>' +
              '<button type="button" data-cs-save class="mf-builder-btn" style="flex:0 0 auto;background:#0ea5e9;color:#fff;border-color:#0ea5e9"><i class="fas fa-check"></i> ' + esc(wt('builder.cloudStorage.conn_save', 'Save')) + '</button>' +
              '<button type="button" data-cs-cancel class="mf-builder-btn" style="flex:0 0 auto">' + esc(wt('builder.cloudStorage.conn_cancel', 'Cancel')) + '</button>' +
              '<span data-cs-status style="font-size:11px;flex:1"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    return ov;
  }

  function setStatus(text: string, ok?: boolean): void {
    var ov = modalEl();
    var st = ov && ov.querySelector('[data-cs-status]') as HTMLElement | null;
    if (!st) return;
    st.textContent = text || '';
    st.style.color = ok == null ? '#64748b' : (ok ? '#047857' : '#b91c1c');
  }

  function formField(sel: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    var ov = modalEl();
    return ov ? ov.querySelector('[data-cs-f-' + sel + ']') as any : null;
  }

  // The server contract expects `extra` as a JSON object (Dictionary<string,string>), not a
  // string — accept either a JSON object or "key=value" lines in the textarea and normalize.
  function parseExtra(raw: string): any {
    var text = String(raw || '').trim();
    if (!text) return {};
    if (text.charAt(0) === '{') {
      try {
        var parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) { /* fall through to key=value parsing */ }
    }
    var out: any = {};
    text.split(/\r?\n/).forEach(function (line) {
      var idx = line.indexOf('=');
      if (idx > 0) out[String(line.substring(0, idx)).trim()] = String(line.substring(idx + 1)).trim();
    });
    return out;
  }

  function readConnForm(): any {
    return {
      name: String((formField('name') as HTMLInputElement).value || '').trim(),
      provider: (formField('provider') as HTMLSelectElement).value || PROVIDERS[0],
      accessToken: (formField('accesstoken') as HTMLInputElement).value || '',
      refreshToken: (formField('refreshtoken') as HTMLInputElement).value || '',
      clientId: (formField('clientid') as HTMLInputElement).value || '',
      clientSecret: (formField('clientsecret') as HTMLInputElement).value || '',
      baseFolder: (formField('basefolder') as HTMLInputElement).value || '',
      baseUrl: (formField('baseurl') as HTMLInputElement).value || '',
      extra: parseExtra((formField('extra') as HTMLTextAreaElement).value)
    };
  }

  function fillConnForm(c: any): void {
    (formField('name') as HTMLInputElement).value = String(c.name || '');
    var provSel = formField('provider') as HTMLSelectElement;
    provSel.innerHTML = providerOptions(String(c.provider || PROVIDERS[0]));
    provSel.value = String(c.provider || PROVIDERS[0]);
    (formField('accesstoken') as HTMLInputElement).value = c.accessToken || '';
    (formField('refreshtoken') as HTMLInputElement).value = c.refreshToken || '';
    (formField('clientid') as HTMLInputElement).value = c.clientId || '';
    (formField('clientsecret') as HTMLInputElement).value = c.clientSecret || '';
    (formField('basefolder') as HTMLInputElement).value = c.baseFolder || '';
    (formField('baseurl') as HTMLInputElement).value = c.baseUrl || '';
    (formField('extra') as HTMLTextAreaElement).value = typeof c.extra === 'string' ? c.extra : (c.extra ? JSON.stringify(c.extra) : '');
  }

  function showConnForm(c: any): void {
    var ov = modalEl();
    if (!ov) return;
    fillConnForm(c || { provider: PROVIDERS[0], accessToken: '', refreshToken: '', clientId: '', clientSecret: '', baseFolder: '', baseUrl: '', extra: '' });
    (ov.querySelector('[data-cs-form]') as HTMLElement).style.display = '';
    setStatus('');
    var nameEl = formField('name') as HTMLInputElement;
    if (nameEl) nameEl.focus();
  }

  function hideConnForm(): void {
    var ov = modalEl();
    if (ov) (ov.querySelector('[data-cs-form]') as HTMLElement).style.display = 'none';
  }

  function renderConnList(): void {
    var ov = modalEl();
    var list = ov && ov.querySelector('[data-cs-list]') as HTMLElement | null;
    if (!list) return;
    list.innerHTML = '<div style="font-size:12px;color:#94a3b8">' + esc(wt('builder.cloudStorage.conn_loading', 'Loading connections…')) + '</div>';
    void loadConnections(true).then(function () {
      if (!connections.length) {
        list.innerHTML = '<div style="font-size:12px;color:#64748b">' + esc(wt('builder.cloudStorage.conn_empty', 'No connections yet — add one below.')) + '</div>';
        return;
      }
      list.innerHTML = '';
      connections.forEach(function (c) {
        var name = String(c.name || '');
        var prov = String(c.provider || '');
        var detail = String(c.baseFolder || c.baseUrl || '');
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;background:#fff;';
        row.innerHTML =
          '<span style="font-weight:700;font-size:12.5px;min-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(name) + '</span>' +
          '<span style="font-size:11px;color:#64748b;flex-shrink:0">' + esc(prov) + '</span>' +
          '<span style="font-size:11px;color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(detail) + '">' + esc(detail) + '</span>' +
          '<button type="button" data-cs-edit class="btn btn-default btn-sm" style="padding:2px 8px">' + esc(wt('builder.cloudStorage.conn_edit', 'Edit')) + '</button>' +
          '<button type="button" data-cs-del-conn class="btn btn-default btn-sm" style="padding:2px 8px;color:#dc2626">' + esc(wt('builder.cloudStorage.conn_delete', 'Delete')) + '</button>';
        (row.querySelector('[data-cs-edit]') as HTMLButtonElement).addEventListener('click', function () { showConnForm(c); });
        (row.querySelector('[data-cs-del-conn]') as HTMLButtonElement).addEventListener('click', function () {
          if (!window.confirm(wt('builder.cloudStorage.conn_delete_confirm', 'Delete connection "{name}"?', { name: name }))) return;
          void postJson('ModuleConfig/CloudStorageConnectionDelete', { name: name }).then(function (res) {
            if (res && res.success === false) { window.alert(res.message || wt('builder.cloudStorage.conn_delete_failed', 'Delete failed')); return; }
            renderConnList();
            refreshConnectionsAndRows();
          });
        });
        list.appendChild(row);
      });
    }).catch(function () {
      list.innerHTML = '<div style="font-size:12px;color:#b91c1c">' + esc(wt('builder.cloudStorage.conn_load_failed', 'Could not load connections.')) + '</div>';
    });
  }

  function openModal(): void {
    var ov = modalEl() || buildModal();
    ov.style.display = 'flex';
    hideConnForm();
    renderConnList();
  }

  function closeModal(): void {
    var ov = modalEl();
    if (ov) ov.style.display = 'none';
  }

  function saveConnection(): void {
    var payload = readConnForm();
    if (!NAME_RE.test(payload.name)) {
      setStatus(wt('builder.cloudStorage.conn_name_invalid', 'Name must start with a letter; letters, digits, "-" and "_" only (max 64).'), false);
      return;
    }
    setStatus(wt('builder.cloudStorage.conn_saving', 'Saving…'));
    void postJson('ModuleConfig/CloudStorageConnectionSave', payload).then(function (res) {
      if (res && res.success === false) { setStatus(res.message || wt('builder.cloudStorage.conn_save_failed', 'Save failed'), false); return; }
      setStatus((res && res.message) || wt('builder.cloudStorage.conn_saved', 'Connection saved'), true);
      hideConnForm();
      renderConnList();
      refreshConnectionsAndRows();
    }).catch(function () {
      setStatus(wt('builder.cloudStorage.network_error', 'Network error'), false);
    });
  }

  function testConnection(): void {
    var payload = readConnForm();
    setStatus(wt('builder.cloudStorage.conn_testing', 'Testing…'));
    void postJson('ModuleConfig/CloudStorageConnectionTest', payload).then(function (res) {
      var ok = !!(res && res.success);
      setStatus((ok ? '✓ ' : '✗ ') + ((res && res.message) || ''), ok);
    }).catch(function () {
      setStatus('✗ ' + wt('builder.cloudStorage.network_error', 'Network error'), false);
    });
  }

  // ── wiring ─────────────────────────────────────────────────
  function bindUi(): void {
    if (bound) return;
    bound = true;

    var on = document.getElementById('mf-setting-cloud-storage-enabled');
    if (on) on.addEventListener('change', readFromUi);

    var addBtn = document.getElementById('mf-cloud-storage-add-mapping');
    if (addBtn) addBtn.addEventListener('click', function () {
      readFromUi();
      var cs = ensureSettings().cloudStorage;
      cs.mappings.push({
        providerName: PROVIDERS[0], connectionSettingsId: '',
        targetFolder: '', uploadFieldKeys: [], organizeBySubmission: false
      });
      B.state.isDirty = true;
      renderMappings();
    });

    var host = container();
    if (host) {
      // Rows are re-rendered on every state change — delegate events to the container.
      host.addEventListener('change', readFromUi);
      host.addEventListener('input', function (ev) {
        if ((ev.target as HTMLElement).hasAttribute('data-cs-folder')) readFromUi();
      });
      host.addEventListener('click', function (ev) {
        var t = (ev.target as HTMLElement).closest('[data-cs-del],[data-cs-refresh],[data-cs-manage]') as HTMLElement | null;
        if (!t) return;
        if (t.hasAttribute('data-cs-del')) {
          readFromUi();
          var row = t.closest('.mf-cs-mapping') as HTMLElement | null;
          var idx = row ? parseInt(row.getAttribute('data-index') || '-1', 10) : -1;
          var cs = ensureSettings().cloudStorage;
          if (idx >= 0 && idx < cs.mappings.length) {
            cs.mappings.splice(idx, 1);
            B.state.isDirty = true;
          }
          renderMappings();
        } else if (t.hasAttribute('data-cs-refresh')) {
          refreshConnectionsAndRows();
        } else if (t.hasAttribute('data-cs-manage')) {
          openModal();
        }
      });
    }

    // Modal events (delegated — the modal element is created lazily).
    document.addEventListener('click', function (ev) {
      var t = (ev.target as HTMLElement).closest('#mf-cs-conn-modal [data-cs-close],#mf-cs-conn-modal [data-cs-add],#mf-cs-conn-modal [data-cs-cancel],#mf-cs-conn-modal [data-cs-save],#mf-cs-conn-modal [data-cs-test]') as HTMLElement | null;
      if (!t) return;
      if (t.hasAttribute('data-cs-close')) closeModal();
      else if (t.hasAttribute('data-cs-add')) showConnForm(null);
      else if (t.hasAttribute('data-cs-cancel')) hideConnForm();
      else if (t.hasAttribute('data-cs-save')) saveConnection();
      else if (t.hasAttribute('data-cs-test')) testConnection();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && modalEl() && modalEl()!.style.display !== 'none') closeModal();
    });
  }

  B.registerModule('cloud-storage-settings', {
    init: function () {
      bindUi();
      syncFromSchema();
      // Pre-fetch the connection catalog so each row's select is populated on first render.
      void loadConnections(false).then(renderMappings);
    },
    syncFromSchema: syncFromSchema,
    readFromUi: readFromUi
  });
})();

export {};
