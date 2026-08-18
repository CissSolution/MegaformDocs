import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { mfFetch, setMegaFormAuthContext } from './contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * [DataSources 2026-08-18] Shared catalog of named database sources.
 *
 * A data source is a named pointer to a registered connection. Connection strings live
 * server-side; this screen only ever sees the connection *name*, never a secret.
 */
const API = '/umbraco/MegaForm/MegaFormApi/DataSources';

export default class MegaFormDataSourcesView extends UmbLitElement {
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
    .frow { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start;
            padding: 10px 0; border-bottom: 1px solid var(--uui-color-border, #f1f5f9); }
    .frow:last-of-type { border-bottom: 0; }
    .flabel { font-size: 13px; font-weight: 700; padding-top: 7px; }
    .flabel small { display: block; font-weight: 400; color: var(--uui-color-text-alt, #64748b); }
    input, select, textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
        padding: 7px 9px; border: 1px solid var(--uui-color-border, #cbd5e1); border-radius: 4px;
        background: var(--uui-color-surface, #fff); color: inherit; }
    textarea { min-height: 84px; font-family: ui-monospace, Menlo, Consolas, monospace; }
    .hint { font-size: 12px; color: var(--uui-color-text-alt, #64748b); margin-top: 6px; }
    .msg { margin-top: 12px; padding: 10px 12px; border-radius: 4px; font-size: 13px; white-space: pre-wrap; }
    .msg.err { background: #fef2f2; color: #b91c1c; }
    .msg.ok { background: #f0fdf4; color: #166534; }
    .empty { padding: 24px; text-align: center; color: var(--uui-color-text-alt, #64748b); font-size: 13px; }
  `;

  static properties = {
    _items: { state: true }, _editing: { state: true }, _busy: { state: true },
    _error: { state: true }, _ok: { state: true }, _connections: { state: true },
  };

  constructor() {
    super();
    this._items = [];
    this._editing = null;
    this._busy = false;
    this._error = '';
    this._ok = '';
    this._connections = [];
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this.#load();
      this.#loadConnections();
    });
  }

  async #call(url, init) {
    const res = await mfFetch(url, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers || {}) },
    });
    const text = await res.text();
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
      const detail = text ? text.replace(/^"|"$/g, '').slice(0, 300) : '';
      throw new Error(detail ? `${detail}` : `HTTP ${res.status}`);
    }
    if (!contentType.includes('json')) throw new Error('not signed in — reload the backoffice and try again');
    return text ? JSON.parse(text) : null;
  }

  async #load() {
    this._busy = true;
    try {
      this._items = (await this.#call(`${API}/List`)) || [];
      this._error = '';
    } catch (e) {
      this._error = `Could not read the catalog: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  async #loadConnections() {
    try {
      const res = await this.#call(`${API}/Connections`);
      const list = res?.connections || [];
      this._connections = list.filter((c) => c && !c.toLowerCase().endsWith('_providername'));
    } catch (e) {
      this._connections = [];
    }
  }

  #new() {
    this._error = ''; this._ok = '';
    this._editing = { id: 0, name: '', connectionKey: '', databaseType: '', tableName: '', query: '', description: '' };
    this.requestUpdate();
  }

  #edit(item) {
    this._error = ''; this._ok = '';
    this._editing = { ...item };
    this.requestUpdate();
  }

  async #test() {
    this._error = ''; this._ok = ''; this._busy = true;
    try {
      const res = await this.#call(`${API}/Test/${this._editing.id}`, { method: 'POST' });
      this._ok = `Connected. Provider: ${res.provider}. ${res.tableCount} table(s) visible.`;
    } catch (e) {
      this._error = `Test failed: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  async #save() {
    this._error = ''; this._ok = ''; this._busy = true;
    try {
      await this.#call(`${API}/Save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._editing),
      });
      this._editing = null;
      this._ok = 'Saved.';
      await this.#load();
    } catch (e) {
      this._error = `Save failed: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  async #delete(item) {
    if (!confirm(`Delete the data source "${item.name}"?`)) return;
    this._busy = true;
    try {
      await this.#call(`${API}/Delete/${item.id}`, { method: 'POST' });
      await this.#load();
    } catch (e) {
      this._error = `Delete failed: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  render() {
    return html`
      <h2>Data Sources</h2>
      <p class="sub">
        Named database sources that forms can read from or write to. Connection strings stay
        server-side; only the registered connection name is stored here.
      </p>
      <div class="bar">
        <span class="grow"></span>
        <button @click="${() => this.#load()}" ?disabled="${this._busy}">Refresh</button>
        <button class="primary" @click="${() => this.#new()}">Create</button>
      </div>
      ${this.#renderTable()}
      ${this._editing ? this.#renderEditor() : nothing}
      ${this._error && !this._editing ? html`<div class="msg err">${this._error}</div>` : nothing}
      ${this._ok && !this._editing ? html`<div class="msg ok">${this._ok}</div>` : nothing}
    `;
  }

  #renderTable() {
    if (!this._items.length) {
      return html`<div class="empty">${this._busy ? 'Loading…' : 'No data sources yet.'}</div>`;
    }
    return html`
      <table>
        <thead><tr><th>Name</th><th>Connection</th><th>Table</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          ${this._items.map((item) => html`
            <tr>
              <td>${item.name}</td>
              <td><span class="type">${item.connectionKey}</span></td>
              <td>${item.tableName || '—'}</td>
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
    const set = (k, v) => { this._editing = { ...e, [k]: v }; };
    const connOptions = this._connections.map((c) => html`<option value="${c}" ?selected="${c === e.connectionKey}">${c}</option>`);

    return html`
      <div class="editor">
        <div class="frow">
          <div class="flabel">Name <small>Unique identifier</small></div>
          <div><input .value="${e.name}" placeholder="Customer CRM"
                 @input="${(ev) => set('name', ev.target.value)}" /></div>
        </div>
        <div class="frow">
          <div class="flabel">Connection <small>Registered server-side</small></div>
          <div>
            <select @change="${(ev) => set('connectionKey', ev.target.value)}">
              <option value="">— choose —</option>
              ${connOptions}
            </select>
          </div>
        </div>
        <div class="frow">
          <div class="flabel">Database type <small>Optional override</small></div>
          <div>
            <select @change="${(ev) => set('databaseType', ev.target.value)}">
              <option value="" ?selected="${!e.databaseType}">— connection default —</option>
              <option value="sqlite" ?selected="${e.databaseType === 'sqlite'}">SQLite</option>
              <option value="sqlserver" ?selected="${e.databaseType === 'sqlserver'}">SQL Server</option>
              <option value="mysql" ?selected="${e.databaseType === 'mysql'}">MySQL / MariaDB</option>
              <option value="postgresql" ?selected="${e.databaseType === 'postgresql'}">PostgreSQL</option>
            </select>
          </div>
        </div>
        <div class="frow">
          <div class="flabel">Default table <small>Optional schema.table</small></div>
          <div><input .value="${e.tableName}" placeholder="dbo.Contacts"
                 @input="${(ev) => set('tableName', ev.target.value)}" /></div>
        </div>
        <div class="frow">
          <div class="flabel">Query <small>Optional read-only SQL</small></div>
          <div>
            <textarea .value="${e.query || ''}" placeholder="SELECT Id AS value, Name AS label FROM dbo.Contacts"
                      @input="${(ev) => set('query', ev.target.value)}"></textarea>
            <div class="hint">Leave empty when this source is used for table binding rather than a picker.</div>
          </div>
        </div>
        <div class="frow">
          <div class="flabel">Description</div>
          <div><textarea .value="${e.description || ''}"
                 @input="${(ev) => set('description', ev.target.value)}"></textarea></div>
        </div>

        ${this._error ? html`<div class="msg err">${this._error}</div>` : nothing}
        ${this._ok ? html`<div class="msg ok">${this._ok}</div>` : nothing}

        <div class="bar" style="margin-top:14px">
          ${e.id > 0 ? html`<button @click="${() => this.#test()}" ?disabled="${this._busy}">Test</button>` : nothing}
          <span class="grow"></span>
          <button @click="${() => { this._editing = null; }}">Cancel</button>
          <button class="primary" @click="${() => this.#save()}" ?disabled="${this._busy || !e.name || !e.connectionKey}">Save</button>
        </div>
      </div>
    `;
  }
}

customElements.define('megaform-data-sources-view', MegaFormDataSourcesView);
