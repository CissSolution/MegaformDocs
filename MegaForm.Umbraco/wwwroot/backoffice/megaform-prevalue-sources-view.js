import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { mfFetchJson, setMegaFormAuthContext } from './contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * [PrevalueSources 2026-08-17] The shared catalog of option lists — one place, many forms.
 *
 * The catalog itself (store, four providers, resolver, controller, migration) already existed
 * and answered every call correctly the first time it was made; what it had never had was a
 * screen. This is that screen: list, create, edit, test against the live provider, delete.
 *
 * Native backoffice element rather than the MVC/iframe route the other MegaForm screens use.
 * Two reasons, both measured: the iframe screens authenticate on the backoffice COOKIE, which
 * lapses about half an hour into a session and then answers HTML to a fetch that wanted JSON;
 * and this screen is administration, not form authoring, so it belongs beside Umbraco's own
 * tree rather than inside the builder frame.
 *
 * The per-type field descriptors below mirror each provider's Settings class in C#. They are a
 * convenience for rendering only — every save is validated by the provider itself through the
 * Test/Save endpoints, so a descriptor that drifts shows up as a validation message rather
 * than as silently wrong data.
 */
const API = '/umbraco/MegaForm/MegaFormApi/PrevalueSources';

const PROVIDERS = [
  {
    type: 'sql',
    label: 'SQL database',
    hint: 'A query against a configured connection. Return one column named value and one named label.',
    fields: [
      { key: 'connectionKey', label: 'Connection', placeholder: 'DashboardDatabase', required: true },
      { key: 'sql', label: 'Query', placeholder: 'SELECT Id AS value, Name AS label FROM MF_DemoDepartments', textarea: true, required: true },
      { key: 'databaseType', label: 'Database type', placeholder: 'leave empty for the connection default' },
    ],
  },
  {
    type: 'textfile',
    label: 'Text file',
    hint: 'One option per line. "value|label" splits the two; a bare line is used for both.',
    fields: [
      { key: 'relativePath', label: 'File path', placeholder: '~/App_Data/MegaForm/countries.txt', required: true },
    ],
  },
  {
    type: 'umbracoDataType',
    label: 'Umbraco data type',
    hint: 'The prevalues of an existing Umbraco data type.',
    fields: [
      { key: 'dataTypeAlias', label: 'Editor alias', placeholder: 'Umbraco.DropDown.Flexible' },
      { key: 'dataTypeId', label: 'Data type id', placeholder: 'or the numeric id' },
    ],
  },
  {
    type: 'umbracoDocuments',
    label: 'Umbraco documents',
    hint: 'Content nodes under a start node, as value/label pairs.',
    fields: [
      { key: 'startNodeId', label: 'Start node id', placeholder: '1234' },
      { key: 'documentTypeAlias', label: 'Document type alias', placeholder: 'newsArticle' },
      { key: 'valueProperty', label: 'Value property', placeholder: 'id | key | a property alias' },
      { key: 'labelProperty', label: 'Label property', placeholder: 'name | a property alias' },
    ],
  },
];

export default class MegaFormPrevalueSourcesView extends UmbLitElement {
  static styles = css`
    :host { display: block; padding: 20px; overflow: auto; height: 100%; box-sizing: border-box;
            font-family: var(--uui-font-family, inherit); color: var(--uui-color-text, #0f172a); }
    h2 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: var(--uui-color-text-alt, #64748b); font-size: 13px; margin: 0 0 16px; }
    .bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .grow { flex: 1; }
    table { width: 100%; border-collapse: collapse; background: var(--uui-color-surface, #fff);
            border: 1px solid var(--uui-color-border, #e2e8f0); border-radius: 6px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--uui-color-border, #e2e8f0); font-size: 13px; }
    th { font-weight: 700; background: var(--uui-color-surface-alt, #f6f7f9); }
    tr:last-child td { border-bottom: 0; }
    .type { font-size: 11px; padding: 2px 8px; border-radius: 999px;
            background: var(--uui-color-surface-alt, #eef2ff); color: #4338ca; }
    button { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 4px; cursor: pointer;
             border: 1px solid var(--uui-color-border, #cbd5e1); background: var(--uui-color-surface, #fff); }
    button:hover { background: var(--uui-color-surface-alt, #f1f5f9); }
    button.primary { background: var(--uui-color-positive, #1b834f); border-color: transparent; color: #fff; }
    button.danger { color: #b91c1c; }
    .editor { margin-top: 16px; background: var(--uui-color-surface, #fff);
              border: 1px solid var(--uui-color-border, #e2e8f0); border-radius: 6px; padding: 16px; }
    .row { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
    label.f { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    input, select, textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
        padding: 7px 9px; border: 1px solid var(--uui-color-border, #cbd5e1); border-radius: 4px;
        background: var(--uui-color-surface, #fff); color: inherit; }
    textarea { min-height: 84px; font-family: ui-monospace, Menlo, Consolas, monospace; }
    .hint { font-size: 12px; color: var(--uui-color-text-alt, #64748b); margin-top: 4px; }
    .msg { margin-top: 12px; padding: 10px 12px; border-radius: 4px; font-size: 13px; }
    .msg.err { background: #fef2f2; color: #b91c1c; }
    .msg.ok { background: #f0fdf4; color: #166534; }
    .sample { margin-top: 10px; font-size: 12px; }
    .sample code { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; border-radius: 4px;
                   background: var(--uui-color-surface-alt, #f1f5f9); }
    .empty { padding: 24px; text-align: center; color: var(--uui-color-text-alt, #64748b); font-size: 13px; }
  `;

  static properties = {
    _items: { state: true }, _editing: { state: true }, _busy: { state: true },
    _error: { state: true }, _ok: { state: true }, _sample: { state: true },
  };

  constructor() {
    super();
    this._items = [];
    this._editing = null;
    this._busy = false;
    this._error = '';
    this._ok = '';
    this._sample = null;
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this.#load();
    });
  }

  async #load() {
    this._busy = true;
    try {
      this._items = await mfFetchJson(`${API}/List`) || [];
      this._error = '';
    } catch (e) {
      this._error = `Could not read the catalog: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  #descriptor(type) {
    return PROVIDERS.find((p) => p.type === type) || PROVIDERS[0];
  }

  #settingsOf(item) {
    try { return JSON.parse(item?.settingsJson || '{}') || {}; } catch { return {}; }
  }

  #new() {
    this._sample = null; this._error = ''; this._ok = '';
    this._editing = { id: 0, name: '', type: 'sql', cacheMinutes: 0, culture: '', settings: {} };
  }

  #edit(item) {
    this._sample = null; this._error = ''; this._ok = '';
    this._editing = {
      id: item.id, name: item.name, type: item.type,
      cacheMinutes: item.cacheMinutes || 0, culture: item.culture || '',
      settings: this.#settingsOf(item),
    };
  }

  #payload() {
    const e = this._editing;
    return {
      id: e.id, name: e.name, type: e.type,
      cacheMinutes: Number(e.cacheMinutes) || 0, culture: e.culture || '',
      settingsJson: JSON.stringify(e.settings || {}),
    };
  }

  async #test() {
    this._error = ''; this._ok = ''; this._sample = null; this._busy = true;
    try {
      const res = await mfFetchJson(`${API}/Test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.#payload()),
      });
      this._sample = res;
      this._ok = `${res.total} option${res.total === 1 ? '' : 's'} returned.`;
    } catch (e) {
      // The provider's own validation message arrives as the body of a 400; mfFetchJson
      // only reports the status, so say which step failed and keep the status visible.
      this._error = `Test failed (${e.message}). Check the settings against the provider.`;
    } finally {
      this._busy = false;
    }
  }

  async #save() {
    this._error = ''; this._ok = ''; this._busy = true;
    try {
      await mfFetchJson(`${API}/Save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.#payload()),
      });
      this._editing = null;
      this._ok = 'Saved.';
      await this.#load();
    } catch (e) {
      this._error = `Save failed (${e.message}).`;
    } finally {
      this._busy = false;
    }
  }

  async #delete(item) {
    if (!confirm(`Delete the prevalue source "${item.name}"? Fields using it fall back to their own options.`)) return;
    this._busy = true;
    try {
      await mfFetchJson(`${API}/Delete/${item.id}`, { method: 'POST' });
      await this.#load();
    } catch (e) {
      this._error = `Delete failed (${e.message}).`;
    } finally {
      this._busy = false;
    }
  }

  render() {
    return html`
      <h2>Prevalue Sources</h2>
      <p class="sub">
        Option lists that many forms share. A field points at one of these instead of carrying
        its own copy of the options, so the list is maintained here once.
      </p>
      <div class="bar">
        <span class="grow"></span>
        <button @click="${() => this.#load()}" ?disabled="${this._busy}">Refresh</button>
        <button class="primary" @click="${() => this.#new()}">Create</button>
      </div>
      ${this.#renderTable()}
      ${this._editing ? this.#renderEditor() : nothing}
      ${this._error ? html`<div class="msg err">${this._error}</div>` : nothing}
      ${this._ok && !this._editing ? html`<div class="msg ok">${this._ok}</div>` : nothing}
    `;
  }

  #renderTable() {
    if (!this._items.length) {
      return html`<div class="empty">${this._busy ? 'Loading…' : 'No prevalue sources yet.'}</div>`;
    }
    return html`
      <table>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Cache</th><th>Updated</th><th></th></tr>
        </thead>
        <tbody>
          ${this._items.map((item) => html`
            <tr>
              <td>${item.name}</td>
              <td><span class="type">${this.#descriptor(item.type).label}</span></td>
              <td>${item.cacheMinutes ? `${item.cacheMinutes} min` : '—'}</td>
              <td>${(item.updatedOnUtc || '').slice(0, 16).replace('T', ' ')}</td>
              <td style="text-align:right;white-space:nowrap">
                <button @click="${() => this.#edit(item)}">Edit</button>
                <button class="danger" @click="${() => this.#delete(item)}">Delete</button>
              </td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }

  #renderEditor() {
    const e = this._editing;
    const d = this.#descriptor(e.type);
    const set = (k, v) => { this._editing = { ...e, [k]: v }; };
    const setSetting = (k, v) => { this._editing = { ...e, settings: { ...e.settings, [k]: v } }; };

    return html`
      <div class="editor">
        <div class="row">
          <div style="flex:2">
            <label class="f">Name</label>
            <input .value="${e.name}" @input="${(ev) => set('name', ev.target.value)}"
                   placeholder="Departments" />
          </div>
          <div style="flex:1">
            <label class="f">Type</label>
            <select .value="${e.type}" @change="${(ev) => set('type', ev.target.value)}">
              ${PROVIDERS.map((p) => html`<option value="${p.type}" ?selected="${p.type === e.type}">${p.label}</option>`)}
            </select>
          </div>
          <div style="flex:0 0 120px">
            <label class="f">Cache (min)</label>
            <input type="number" min="0" .value="${String(e.cacheMinutes)}"
                   @input="${(ev) => set('cacheMinutes', ev.target.value)}" />
          </div>
        </div>

        ${d.fields.map((f) => html`
          <div class="row"><div style="flex:1">
            <label class="f">${f.label}${f.required ? ' *' : ''}</label>
            ${f.textarea
              ? html`<textarea placeholder="${f.placeholder || ''}" .value="${e.settings[f.key] ?? ''}"
                        @input="${(ev) => setSetting(f.key, ev.target.value)}"></textarea>`
              : html`<input placeholder="${f.placeholder || ''}" .value="${e.settings[f.key] ?? ''}"
                        @input="${(ev) => setSetting(f.key, ev.target.value)}" />`}
          </div></div>
        `)}
        <div class="hint">${d.hint}</div>

        ${this._sample ? html`
          <div class="sample">
            First options: ${(this._sample.options || []).slice(0, 8).map((o) => html`<code>${o.label}</code>`)}
            ${(this._sample.total || 0) > 8 ? html`<span>… ${this._sample.total} total</span>` : nothing}
          </div>` : nothing}

        ${this._error ? html`<div class="msg err">${this._error}</div>` : nothing}
        ${this._ok ? html`<div class="msg ok">${this._ok}</div>` : nothing}

        <div class="bar" style="margin-top:14px">
          <button @click="${() => this.#test()}" ?disabled="${this._busy}">Test</button>
          <span class="grow"></span>
          <button @click="${() => { this._editing = null; this._sample = null; }}">Cancel</button>
          <button class="primary" @click="${() => this.#save()}" ?disabled="${this._busy || !e.name}">Save</button>
        </div>
      </div>
    `;
  }
}

customElements.define('megaform-prevalue-sources-view', MegaFormPrevalueSourcesView);
