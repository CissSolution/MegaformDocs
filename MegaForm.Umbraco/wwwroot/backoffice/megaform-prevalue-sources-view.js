import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { mfFetch, setMegaFormAuthContext } from './contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * [PrevalueSources 2026-08-17] The shared catalog of option lists — one place, many forms.
 *
 * Modelled on the Umbraco Forms editor, after driving it: **nothing there is typed by hand.**
 * Root node is a picker, Document type is a list, and the Value field is a list of the standard
 * fields (Id / Key / Name) plus that document type's own properties. The first version of this
 * screen asked for an "Editor alias" and a numeric id instead, which is how it answered a
 * perfectly reasonable "Umbraco.DropDown.Flexible" with «Test failed (HTTP 400)».
 *
 * Three things that failure taught, all fixed here:
 *
 *  1. **Every field is a picker where a picker is possible.** The lists come from
 *     PrevalueMetadataController, which resolves them in the shape the PROVIDERS consume — a
 *     document type ALIAS, an INTEGER root node id — rather than the GUIDs the management API
 *     speaks in.
 *  2. **An empty box must not travel.** `{"dataTypeId":""}` cannot deserialize into an int, so
 *     Newtonsoft threw, the settings object came back empty, and validation reported the field
 *     as missing — from a form where it was filled in. Empty values are omitted, numbers are
 *     numbers, toggles are booleans.
 *  3. **Say what the server said.** "HTTP 400" hides "Data type id, key, or alias is required."
 *     Errors now carry the provider's own message.
 *
 * Native backoffice element rather than the MVC/iframe route the other MegaForm screens use:
 * the frames authenticate on the backoffice cookie, which lapses about half an hour in, and
 * this is administration rather than form authoring.
 */
const API = '/umbraco/MegaForm/MegaFormApi/PrevalueSources';
const META = '/umbraco/MegaForm/MegaFormApi/PrevalueMeta';

/**
 * Field kinds: text | textarea | number | bool | select.
 * A select names a `source` (loaded from metadata) or carries its own `options`.
 * `dependsOn` reloads the source whenever that other field changes.
 */
const PROVIDERS = [
  {
    type: 'sql',
    label: 'SQL database',
    hint: 'A query against a registered connection. Return one column named value and one named label.',
    fields: [
      { key: 'connectionKey', label: 'Connection', kind: 'select', source: 'sqlConnections', required: true },
      { key: 'sql', label: 'Query', kind: 'textarea', required: true,
        placeholder: 'SELECT Id AS value, Name AS label FROM MF_DemoDepartments' },
      { key: 'databaseType', label: 'Database type', kind: 'text', placeholder: 'leave empty for the connection default' },
    ],
  },
  {
    type: 'textfile',
    label: 'Text file',
    hint: 'One option per line. "value|label" splits the two; a bare line is used for both.',
    fields: [
      { key: 'relativePath', label: 'File path', kind: 'text', required: true,
        placeholder: '~/App_Data/MegaForm/countries.txt' },
    ],
  },
  {
    type: 'umbracoDataType',
    label: 'Umbraco data type',
    hint: 'The prevalues configured on an existing Umbraco data type.',
    fields: [
      { key: 'dataTypeKey', label: 'Data type', kind: 'select', source: 'dataTypes', required: true },
    ],
  },
  {
    type: 'umbracoDocuments',
    label: 'Umbraco documents',
    hint: 'Content nodes under a root, as value/label pairs.',
    fields: [
      { key: 'useCurrentPageAsRoot', label: 'Use current page as root', kind: 'bool',
        note: 'The page the form is rendered on becomes the root. Nothing to configure below.' },
      { key: 'rootNodeId', label: 'Root node', kind: 'select', source: 'contentRoots', number: true,
        hideWhen: (st) => st.useCurrentPageAsRoot || st.dynamicRoot?.originAlias,
        note: 'A fixed node. Leave it and use a dynamic root when the answer depends on the page.' },
      { key: 'dynamicRoot', label: 'Dynamic root', kind: 'dynamicRoot',
        hideWhen: (st) => st.useCurrentPageAsRoot,
        note: 'An origin relative to the current page, then steps that walk to the real root.' },
      { key: 'documentTypeAlias', label: 'Document type', kind: 'select', source: 'documentTypes',
        empty: 'Any document type' },
      { key: 'valuePropertyAlias', label: 'Value field', kind: 'select', source: 'fields',
        dependsOn: 'documentTypeAlias', empty: 'Id' },
      { key: 'labelPropertyAlias', label: 'Label field', kind: 'select', source: 'fields',
        dependsOn: 'documentTypeAlias', empty: 'Name' },
      { key: 'includeDescendants', label: 'Include descendants', kind: 'bool' },
      { key: 'sortBy', label: 'Sort by', kind: 'select', options: [
        { value: '', label: 'Tree order' },
        { value: 'name', label: 'Name' },
        { value: 'createDate', label: 'Created date' },
      ] },
    ],
  },
];

const ORIGINS = [
  { value: '', label: 'No dynamic root' },
  { value: 'ContentRoot', label: 'Content Root — top of the content tree' },
  { value: 'Root', label: 'Root — root of the current page tree' },
  { value: 'Site', label: 'Site — nearest site root above the current page' },
  { value: 'Parent', label: 'Parent — the current page parent' },
  { value: 'Current', label: 'Current — the page the form is on' },
  { value: 'SpecificNode', label: 'Specific Node — a node picked here' },
];

const STEPS = [
  { value: 'NearestAncestorOrSelf', label: 'Nearest Ancestor Or Self' },
  { value: 'FurthestAncestorOrSelf', label: 'Furthest Ancestor Or Self' },
  { value: 'NearestDescendantOrSelf', label: 'Nearest Descendant Or Self' },
  { value: 'FurthestDescendantOrSelf', label: 'Furthest Descendant Or Self' },
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
    /* Label left, control right — the proportions Umbraco Forms uses for its own editor. */
    .frow { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start;
            padding: 10px 0; border-bottom: 1px solid var(--uui-color-border, #f1f5f9); }
    .frow:last-of-type { border-bottom: 0; }
    .flabel { font-size: 13px; font-weight: 700; padding-top: 7px; }
    .flabel small { display: block; font-weight: 400; color: var(--uui-color-text-alt, #64748b); }
    .head { display: flex; gap: 16px; }
    .head > div { flex: 1; }
    input, select, textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
        padding: 7px 9px; border: 1px solid var(--uui-color-border, #cbd5e1); border-radius: 4px;
        background: var(--uui-color-surface, #fff); color: inherit; }
    input[type="checkbox"] { width: auto; }
    textarea { min-height: 84px; font-family: ui-monospace, Menlo, Consolas, monospace; }
    .hint { font-size: 12px; color: var(--uui-color-text-alt, #64748b); margin-top: 10px; }
    .msg { margin-top: 12px; padding: 10px 12px; border-radius: 4px; font-size: 13px; white-space: pre-wrap; }
    .msg.err { background: #fef2f2; color: #b91c1c; }
    .msg.ok { background: #f0fdf4; color: #166534; }
    .sample { margin-top: 10px; font-size: 12px; }
    .sample code { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; border-radius: 4px;
                   background: var(--uui-color-surface-alt, #f1f5f9); }
    .empty { padding: 24px; text-align: center; color: var(--uui-color-text-alt, #64748b); font-size: 13px; }
  `;

  static properties = {
    _items: { state: true }, _editing: { state: true }, _busy: { state: true },
    _error: { state: true }, _ok: { state: true }, _sample: { state: true }, _meta: { state: true },
  };

  constructor() {
    super();
    this._items = [];
    this._editing = null;
    this._busy = false;
    this._error = '';
    this._ok = '';
    this._sample = null;
    this._meta = {};              // source name -> [{value,label}]
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this.#load();
    });
  }

  // ── plumbing ────────────────────────────────────────────────────────────────

  /** Calls the API and keeps the SERVER's message when it refuses. */
  async #call(url, init) {
    const res = await mfFetch(url, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers || {}) },
    });
    const text = await res.text();
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
      // ASP.NET returns BadRequest("Data type id, key, or alias is required.") as a bare string;
      // reporting only "HTTP 400" throws that away and leaves the editor guessing.
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

  /** Loads a picker's options once, in the shape {value,label}. */
  async #loadSource(name, arg) {
    const cacheKey = this.#cacheKey(name, arg);
    if (this._meta[cacheKey]) return this._meta[cacheKey];
    let list = [];
    try {
      if (name === 'dataTypes') {
        const rows = await this.#call(`${META}/DataTypes`);
        list = (rows || []).map((r) => ({ value: r.key, label: `${r.name} (${r.editorAlias})` }));
      } else if (name === 'documentTypes') {
        const rows = await this.#call(`${META}/DocumentTypes`);
        list = (rows || []).map((r) => ({ value: r.alias, label: r.name }));
      } else if (name === 'contentRoots') {
        const rows = await this.#call(`${META}/ContentRoots`);
        list = (rows || []).map((r) => ({ value: String(r.id), label: (r.depth ? '— ' : '') + r.name }));
      } else if (name === 'fields') {
        const rows = await this.#call(`${META}/DocumentTypeFields?alias=${encodeURIComponent(arg || '')}`);
        list = (rows || []).map((r) => ({ value: r.alias, label: r.standard ? r.name : `${r.name} (${r.alias})` }));
      } else if (name === 'sqlConnections') {
        const body = await this.#call('/umbraco/MegaForm/MegaFormApi/AiTools/SqlConnections');
        const names = ['DashboardDatabase', ...((body && body.connections) || [])];
        list = [...new Set(names)].map((n) => ({ value: n, label: n }));
      }
    } catch (e) {
      list = [];
      this._error = `Could not list ${name}: ${e.message}`;
    }
    this._meta = { ...this._meta, [cacheKey]: list };
    return list;
  }

  /** One spelling for the cache key, used by both the loader and the renderer. */
  #cacheKey(name, arg) {
    return `${name}:${arg ?? ''}`;
  }

  #descriptor(type) {
    return PROVIDERS.find((p) => p.type === type) || PROVIDERS[0];
  }

  /** Loads every picker the current provider needs. */
  async #primeSources() {
    const e = this._editing;
    if (!e) return;
    for (const f of this.#descriptor(e.type).fields) {
      if (f.kind !== 'select' || !f.source) continue;
      await this.#loadSource(f.source, f.dependsOn ? e.settings[f.dependsOn] : undefined);
    }
  }

  /**
   * Settings as the PROVIDER wants them: numbers typed, toggles boolean, and empty boxes left
   * out entirely — an empty string in a numeric field breaks the whole object on the server.
   */
  #settingsPayload() {
    const e = this._editing;
    const out = {};
    for (const f of this.#descriptor(e.type).fields) {
      const raw = e.settings[f.key];
      if (f.kind === 'bool') { if (raw) out[f.key] = true; continue; }
      if (f.kind === 'dynamicRoot') {
        // Only travels when an origin was chosen; an empty object would read as "configured".
        if (raw && raw.originAlias) {
          out[f.key] = {
            originAlias: raw.originAlias,
            originKey: raw.originKey || undefined,
            steps: (raw.steps || []).filter((st) => st.alias),
          };
        }
        continue;
      }
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      out[f.key] = f.number ? Number(raw) : raw;
    }
    return out;
  }

  #payload() {
    const e = this._editing;
    return {
      id: e.id, name: e.name, type: e.type,
      cacheMinutes: Number(e.cacheMinutes) || 0, culture: e.culture || '',
      settingsJson: JSON.stringify(this.#settingsPayload()),
    };
  }

  // ── actions ─────────────────────────────────────────────────────────────────

  async #new() {
    this._sample = null; this._error = ''; this._ok = '';
    this._editing = { id: 0, name: '', type: 'sql', cacheMinutes: 0, culture: '', settings: {} };
    await this.#primeSources();
    this.requestUpdate();
  }

  async #edit(item) {
    this._sample = null; this._error = ''; this._ok = '';
    let settings = {};
    try { settings = JSON.parse(item.settingsJson || '{}') || {}; } catch { settings = {}; }
    this._editing = {
      id: item.id, name: item.name, type: item.type,
      cacheMinutes: item.cacheMinutes || 0, culture: item.culture || '', settings,
    };
    await this.#primeSources();
    this.requestUpdate();
  }

  async #test() {
    this._error = ''; this._ok = ''; this._sample = null; this._busy = true;
    try {
      const page = Number(this._editing.previewPageId) || 0;
      const res = await this.#call(`${API}/Test${page ? `?pageId=${page}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.#payload()),
      });
      this._sample = res;
      const needsPage = this._editing.settings.useCurrentPageAsRoot
        || this._editing.settings.dynamicRoot?.originAlias;
      this._ok = res.total === 0 && needsPage && !page
        ? '0 options — this source resolves against a page. Pick one under "Preview from page" to test it.'
        : `${res.total} option${res.total === 1 ? '' : 's'} returned.`;
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
        body: JSON.stringify(this.#payload()),
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
    if (!confirm(`Delete the prevalue source "${item.name}"? Fields using it fall back to their own options.`)) return;
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

  // ── rendering ───────────────────────────────────────────────────────────────

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
      ${this._error && !this._editing ? html`<div class="msg err">${this._error}</div>` : nothing}
      ${this._ok && !this._editing ? html`<div class="msg ok">${this._ok}</div>` : nothing}
    `;
  }

  #renderTable() {
    if (!this._items.length) {
      return html`<div class="empty">${this._busy ? 'Loading…' : 'No prevalue sources yet.'}</div>`;
    }
    return html`
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Cache</th><th>Updated</th><th></th></tr></thead>
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
    const setSetting = async (f, v) => {
      this._editing = { ...e, settings: { ...e.settings, [f.key]: v } };
      // A dependent picker (Value field) has to reload when its parent (Document type) moves.
      const dependents = d.fields.filter((x) => x.dependsOn === f.key);
      for (const dep of dependents) await this.#loadSource(dep.source, v);
      this.requestUpdate();
    };

    return html`
      <div class="editor">
        <div class="head">
          <div>
            <div class="flabel">Name</div>
            <input .value="${e.name}" placeholder="Departments"
                   @input="${(ev) => set('name', ev.target.value)}" />
          </div>
          <div>
            <div class="flabel">Type</div>
            <select @change="${async (ev) => { set('type', ev.target.value); this._editing.settings = {}; await this.#primeSources(); this.requestUpdate(); }}">
              ${PROVIDERS.map((p) => html`<option value="${p.type}" ?selected="${p.type === e.type}">${p.label}</option>`)}
            </select>
          </div>
          <div style="flex:0 0 130px">
            <div class="flabel">Cache (min)</div>
            <input type="number" min="0" .value="${String(e.cacheMinutes)}"
                   @input="${(ev) => set('cacheMinutes', ev.target.value)}" />
          </div>
        </div>

        <div style="margin-top:12px">
          ${d.fields.filter((f) => !(f.hideWhen && f.hideWhen(e.settings))).map((f) => html`
            <div class="frow">
              <div class="flabel">${f.label}${f.required ? ' *' : ''}</div>
              <div>
                ${this.#renderField(f, e, setSetting)}
                ${f.note ? html`<div class="hint" style="margin-top:6px">${f.note}</div>` : nothing}
              </div>
            </div>
          `)}
          ${this.#needsPageContext(e) ? html`
            <div class="frow">
              <div class="flabel">Preview from page<small>Test only</small></div>
              <div>
                <select @change="${(ev) => { this._editing = { ...e, previewPageId: ev.target.value }; }}">
                  <option value="">— none —</option>
                  ${(this._meta[this.#cacheKey('contentRoots')] || []).map((o) => html`
                    <option value="${o.value}" ?selected="${String(o.value) === String(e.previewPageId || '')}">${o.label}</option>`)}
                </select>
                <div class="hint" style="margin-top:6px">
                  A relative root has no answer without a page. This is the page Test pretends the
                  form is on; the live form sends its own.
                </div>
              </div>
            </div>` : nothing}
        </div>
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

  #renderField(f, e, setSetting) {
    const value = e.settings[f.key] ?? '';
    if (f.kind === 'textarea') {
      return html`<textarea placeholder="${f.placeholder || ''}" .value="${value}"
                    @input="${(ev) => setSetting(f, ev.target.value)}"></textarea>`;
    }
    if (f.kind === 'bool') {
      return html`<input type="checkbox" .checked="${!!e.settings[f.key]}"
                    @change="${(ev) => setSetting(f, ev.target.checked)}" />`;
    }
    if (f.kind === 'number') {
      return html`<input type="number" placeholder="${f.placeholder || ''}" .value="${String(value)}"
                    @input="${(ev) => setSetting(f, ev.target.value)}" />`;
    }
    if (f.kind === 'dynamicRoot') return this.#renderDynamicRoot(f, e, setSetting);
    if (f.kind === 'select') {
      const cacheKey = this.#cacheKey(f.source, f.dependsOn ? e.settings[f.dependsOn] : undefined);
      const options = (f.options || this._meta[cacheKey] || []);
      return html`
        <select @change="${(ev) => setSetting(f, ev.target.value)}">
          <option value="">${f.empty || (f.required ? '— choose —' : '—')}</option>
          ${options.map((o) => html`
            <option value="${o.value}" ?selected="${String(o.value) === String(value)}">${o.label}</option>`)}
        </select>
        ${!f.options && !options.length ? html`<div class="hint">Nothing to choose from yet.</div>` : nothing}
      `;
    }
    return html`<input placeholder="${f.placeholder || ''}" .value="${value}"
                  @input="${(ev) => setSetting(f, ev.target.value)}" />`;
  }
  /** True when the configured root only means something relative to a page. */
  #needsPageContext(e) {
    const st = e.settings || {};
    return !!(st.useCurrentPageAsRoot || (st.dynamicRoot && st.dynamicRoot.originAlias));
  }

  /**
   * Origin, then steps — the Umbraco Forms shape. The origin says where to start relative to the
   * page being rendered; each step walks up or down to the nearest or furthest node of the
   * document types picked for it.
   */
  #renderDynamicRoot(f, e, setSetting) {
    const dr = e.settings[f.key] || { originAlias: '', originKey: '', steps: [] };
    const write = (next) => setSetting(f, next);
    const docTypes = this._meta[this.#cacheKey('documentTypes')] || [];
    const nodes = this._meta[this.#cacheKey('contentRoots')] || [];

    return html`
      <select @change="${(ev) => write({ ...dr, originAlias: ev.target.value })}">
        ${ORIGINS.map((o) => html`
          <option value="${o.value}" ?selected="${o.value === (dr.originAlias || '')}">${o.label}</option>`)}
      </select>

      ${dr.originAlias === 'SpecificNode' ? html`
        <select style="margin-top:8px" @change="${(ev) => write({ ...dr, originKey: ev.target.value })}">
          <option value="">— pick a node —</option>
          ${nodes.map((o) => html`
            <option value="${o.key || o.value}" ?selected="${String(o.key || o.value) === String(dr.originKey || '')}">${o.label}</option>`)}
        </select>` : nothing}

      ${dr.originAlias ? html`
        <div style="margin-top:10px">
          ${(dr.steps || []).map((step, i) => html`
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <select style="flex:1" @change="${(ev) => {
                const steps = [...(dr.steps || [])];
                steps[i] = { ...steps[i], alias: ev.target.value };
                write({ ...dr, steps });
              }}">
                ${STEPS.map((o) => html`
                  <option value="${o.value}" ?selected="${o.value === step.alias}">${o.label}</option>`)}
              </select>
              <select style="flex:1" @change="${(ev) => {
                const steps = [...(dr.steps || [])];
                steps[i] = { ...steps[i], documentTypeAliases: ev.target.value ? [ev.target.value] : [] };
                write({ ...dr, steps });
              }}">
                <option value="">Any document type</option>
                ${docTypes.map((o) => html`
                  <option value="${o.value}" ?selected="${(step.documentTypeAliases || [])[0] === o.value}">${o.label}</option>`)}
              </select>
              <button @click="${() => write({ ...dr, steps: (dr.steps || []).filter((_, k) => k !== i) })}">Remove</button>
            </div>`)}
          <button @click="${() => write({ ...dr, steps: [...(dr.steps || []), { alias: 'NearestAncestorOrSelf', documentTypeAliases: [] }] })}">
            Add query step
          </button>
        </div>` : nothing}
    `;
  }
}

customElements.define('megaform-prevalue-sources-view', MegaFormPrevalueSourcesView);
