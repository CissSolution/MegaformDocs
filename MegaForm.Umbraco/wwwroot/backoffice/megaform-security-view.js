import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { mfFetch, setMegaFormAuthContext } from './contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * [Security 2026-08-18] Who may do what with MegaForm, per Umbraco user group.
 *
 * The shape is Umbraco Forms': pick a group on the left, its "Package Permissions" appear as a
 * list of toggles with an explanation each, Save sits in the bottom bar. What is underneath is
 * Umbraco's own user group — MegaForm registers its permissions as granular permissions there —
 * so a change made here shows up in the Users section and vice versa. There is no second store
 * to drift out of sync.
 *
 * Admin only; the server refuses anything else, and this screen says so rather than rendering
 * an empty list.
 *
 * [ToolbarCleanup 2026-08-18] It carries a SECOND area now: per-form permissions, which used
 * to be the user-shield glyph on the builder's Design toolbar. Those are a different store —
 * MegaForm's own MF_FormPermissions rows, read and written through Permissions/Catalog and
 * Permissions/Save per formId — so the two areas are kept apart rather than merged into one
 * list that would imply a relationship that is not there. Umbraco Forms' Security node reads
 * the same way: what a group may do with the package, and what it may do with one form.
 *
 * The record scope on a form permission is deliberately kept in the UI: "may view entries"
 * means something different with scope "all" than with scope "own", and dropping the select
 * would silently widen every grant that had been narrowed.
 */
const API = '/umbraco/MegaForm/MegaFormApi/Security';
const FORMS_API = '/umbraco/MegaForm/MegaFormApi';

export default class MegaFormSecurityView extends UmbLitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0;
            font-family: var(--uui-font-family, inherit); color: var(--uui-color-text, #0f172a); }
    .body { flex: 1 1 auto; min-height: 0; display: flex; }
    .groups { flex: 0 0 240px; border-right: 1px solid var(--uui-color-border, #e2e8f0); overflow: auto;
              background: var(--uui-color-surface, #fff); }
    .groups button { display: block; width: 100%; text-align: left; border: 0; background: none;
                     padding: 10px 14px; font: inherit; font-size: 13px; cursor: pointer;
                     border-bottom: 1px solid var(--uui-color-border, #f1f5f9); }
    .groups button:hover { background: var(--uui-color-surface-alt, #f6f7f9); }
    .groups button[aria-current='true'] { background: #fbe7ea; font-weight: 700; }
    .scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px; }
    h2 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: var(--uui-color-text-alt, #64748b); font-size: 13px; margin: 0 0 16px; }
    .section { background: var(--uui-color-surface, #fff); border: 1px solid var(--uui-color-border, #e2e8f0);
               border-radius: 6px; }
    .section > h3 { margin: 0; padding: 12px 16px; font-size: 14px;
                    border-bottom: 1px solid var(--uui-color-border, #e2e8f0);
                    background: var(--uui-color-surface-alt, #f6f7f9); border-radius: 6px 6px 0 0; }
    .row { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; padding: 14px 16px;
           border-bottom: 1px solid var(--uui-color-border, #f1f5f9); align-items: start; }
    .row:last-child { border-bottom: 0; }
    .label { font-size: 13px; font-weight: 700; }
    .label small { display: block; font-weight: 400; color: var(--uui-color-text-alt, #64748b); margin-top: 4px; }
    .footer { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 10px 20px;
              border-top: 1px solid var(--uui-color-border, #e2e8f0); background: var(--uui-color-surface, #fff); }
    .crumb { font-size: 13px; color: var(--uui-color-text-alt, #64748b); }
    .grow { flex: 1; }
    button.act { font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 4px; cursor: pointer;
                 border: 1px solid var(--uui-color-border, #cbd5e1); background: var(--uui-color-surface, #fff); }
    button.act.primary { background: var(--uui-color-positive, #1b834f); border-color: transparent; color: #fff; }
    .msg { margin-bottom: 12px; padding: 10px 12px; border-radius: 4px; font-size: 13px; }
    .msg.err { background: #fef2f2; color: #b91c1c; }
    .msg.ok { background: #f0fdf4; color: #166534; }

    /* [ToolbarCleanup 2026-08-18] Two areas, one screen. */
    .areas { display: flex; gap: 2px; border-bottom: 1px solid var(--uui-color-border, #e2e8f0);
             padding: 0 20px; background: var(--uui-color-surface, #fff); flex: 0 0 auto; }
    .areas button { appearance: none; border: 0; background: none; cursor: pointer; font: inherit;
                    font-size: 13px; font-weight: 600; color: var(--uui-color-text-alt, #64748b);
                    padding: 10px 14px; border-bottom: 3px solid transparent; }
    .areas button[aria-current='true'] { color: var(--uui-color-text, #0f172a);
                                         border-bottom-color: var(--uui-color-focus, #3544b1); }
    .picker { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; font-size: 13px; }
    .picker select { font: inherit; font-size: 13px; padding: 6px 9px; min-width: 260px;
                     border: 1px solid var(--uui-color-border, #cbd5e1); border-radius: 4px;
                     background: var(--uui-color-surface, #fff); color: inherit; }
    .matrix-wrap { overflow-x: auto; }
    table.matrix { border-collapse: collapse; width: 100%; font-size: 13px; }
    table.matrix th, table.matrix td { border-bottom: 1px solid var(--uui-color-border, #f1f5f9);
                                       padding: 10px 12px; text-align: left; vertical-align: top; }
    table.matrix thead th { background: var(--uui-color-surface-alt, #f6f7f9); font-size: 12px;
                            white-space: nowrap; }
    table.matrix thead th small { display: block; font-weight: 400;
                                  color: var(--uui-color-text-alt, #64748b); }
    table.matrix td.who { font-weight: 600; white-space: nowrap; }
    table.matrix td.who small { display: block; font-weight: 400;
                                color: var(--uui-color-text-alt, #64748b); }
    table.matrix select { font: inherit; font-size: 12px; margin-top: 6px; padding: 3px 6px;
                          border: 1px solid var(--uui-color-border, #cbd5e1); border-radius: 4px;
                          background: var(--uui-color-surface, #fff); color: inherit; }
  `;

  static properties = {
    _catalog: { state: true }, _groups: { state: true }, _selected: { state: true },
    _busy: { state: true }, _error: { state: true }, _ok: { state: true },
    _area: { state: true }, _forms: { state: true }, _formId: { state: true },
    _formCatalog: { state: true }, _rules: { state: true },
  };

  constructor() {
    super();
    this._catalog = [];
    this._groups = [];
    this._selected = null;
    this._busy = false;
    this._error = '';
    this._ok = '';
    this._area = 'package';
    this._forms = [];
    this._formId = 0;
    this._formCatalog = null;
    this._rules = [];
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this.#load();
    });
  }

  async #call(url, init) {
    const res = await mfFetch(url, { credentials: 'include', ...init,
      headers: { Accept: 'application/json', ...(init?.headers || {}) } });
    const text = await res.text();
    if (res.status === 403) throw new Error('Only administrators can change MegaForm permissions.');
    if (!res.ok) throw new Error((text || `HTTP ${res.status}`).replace(/^"|"$/g, '').slice(0, 300));
    if (!(res.headers.get('content-type') || '').toLowerCase().includes('json')) {
      throw new Error('not signed in — reload the backoffice and try again');
    }
    return text ? JSON.parse(text) : null;
  }

  async #load() {
    this._busy = true; this._error = '';
    try {
      const data = await this.#call(`${API}/Groups`);
      this._catalog = data?.catalog || [];
      this._groups = data?.groups || [];
      const keep = this._selected && this._groups.find((g) => g.key === this._selected.key);
      this._selected = keep || this._groups[0] || null;
    } catch (e) {
      this._error = e.message;
      this._groups = [];
      this._selected = null;
    } finally {
      this._busy = false;
    }
  }

  // ── Form permissions ────────────────────────────────────────────────────

  async #loadForms() {
    if (this._forms.length) return;
    try {
      const list = await this.#call(`${FORMS_API}/Form/List`);
      this._forms = (list || []).map((f) => ({
        id: f.formId ?? f.FormId ?? 0,
        title: f.title ?? f.Title ?? '',
      })).filter((f) => f.id > 0);
      if (!this._formId && this._forms.length) await this.#loadFormPermissions(this._forms[0].id);
    } catch (e) {
      this._error = `Could not list the forms: ${e.message}`;
    }
  }

  async #loadFormPermissions(formId) {
    const id = Number(formId) || 0;
    this._formId = id;
    this._formCatalog = null;
    this._rules = [];
    if (!id) return;
    this._busy = true; this._error = ''; this._ok = '';
    try {
      const data = await this.#call(`${FORMS_API}/Permissions/Catalog?formId=${id}`);
      this._formCatalog = data?.catalog || data?.Catalog || null;
      this._rules = (data?.permissions || data?.Permissions || []).map((r) => ({ ...r }));
    } catch (e) {
      // 403 here is a real answer, not a bug: managing a form's permissions is itself a
      // permission, and the message says which one is missing rather than showing an
      // empty grid that reads as "nobody has any access".
      this._error = e.message.includes('403')
        ? 'You do not have permission to manage this form\u2019s permissions.'
        : e.message;
    } finally {
      this._busy = false;
    }
  }

  /** Principal identity as the API spells it, so a rule can be matched back to its row. */
  #principalKey(p) {
    const type = String(p.principalType ?? p.PrincipalType ?? '').toLowerCase();
    const id = String(p.principalId ?? p.PrincipalId ?? p.roleName ?? p.RoleName ?? '');
    return `${type}:${id.toLowerCase()}`;
  }

  #ruleKey(r) {
    const type = String(r.principalType ?? r.PrincipalType ?? '').toLowerCase();
    const id = String(r.principalId ?? r.PrincipalId ?? r.roleName ?? r.RoleName ?? '');
    return `${type}:${id.toLowerCase()}`;
  }

  #findRule(principal, permissionType) {
    const want = this.#principalKey(principal);
    return this._rules.find((r) =>
      this.#ruleKey(r) === want &&
      String(r.permissionType ?? r.PermissionType ?? '').toLowerCase() === String(permissionType).toLowerCase());
  }

  #setGrant(principal, definition, granted) {
    const existing = this.#findRule(principal, definition.key);
    if (existing) {
      // Revoking removes the row rather than storing isGranted:false — an absent rule and a
      // denied rule are not the same thing to the enforcement service, and the grid only
      // expresses "granted".
      this._rules = granted
        ? this._rules.map((r) => (r === existing ? { ...r, isGranted: true } : r))
        : this._rules.filter((r) => r !== existing);
      return;
    }
    if (!granted) return;
    this._rules = [...this._rules, {
      formId: this._formId,
      permissionType: definition.key,
      principalType: principal.principalType ?? principal.PrincipalType ?? '',
      principalId: principal.principalId ?? principal.PrincipalId ?? '',
      roleName: principal.roleName ?? principal.RoleName ?? '',
      userId: principal.userId ?? principal.UserId ?? null,
      scope: definition.supportsScope ? (definition.defaultScope || 'all') : '',
      isGranted: true,
    }];
  }

  #setScope(principal, definition, scope) {
    const existing = this.#findRule(principal, definition.key);
    if (!existing) return;
    this._rules = this._rules.map((r) => (r === existing ? { ...r, scope } : r));
  }

  async #saveFormPermissions() {
    if (!this._formId) return;
    this._busy = true; this._error = ''; this._ok = '';
    try {
      await this.#call(`${FORMS_API}/Permissions/Save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId: this._formId, permissions: this._rules }),
      });
      const name = this._forms.find((f) => f.id === this._formId)?.title || `Form #${this._formId}`;
      this._ok = `Saved permissions for ${name}.`;
      await this.#loadFormPermissions(this._formId);
    } catch (e) {
      this._error = `Save failed: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  #showArea(area) {
    this._area = area;
    this._ok = '';
    this._error = '';
    if (area === 'form') this.#loadForms();
  }

  #toggle(letter, on) {
    const current = new Set(this._selected.permissions || []);
    if (on) current.add(letter); else current.delete(letter);
    this._selected = { ...this._selected, permissions: [...current] };
    this._groups = this._groups.map((g) => (g.key === this._selected.key ? this._selected : g));
  }

  async #save() {
    if (!this._selected) return;
    this._busy = true; this._error = ''; this._ok = '';
    try {
      await this.#call(`${API}/SaveGroup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupKey: this._selected.key, permissions: this._selected.permissions || [] }),
      });
      this._ok = `Saved permissions for ${this._selected.name}.`;
      await this.#load();
    } catch (e) {
      this._error = `Save failed: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  render() {
    return html`
      <div class="areas">
        <button aria-current="${this._area === 'package' ? 'true' : 'false'}"
                @click="${() => this.#showArea('package')}">Package permissions</button>
        <button aria-current="${this._area === 'form' ? 'true' : 'false'}"
                @click="${() => this.#showArea('form')}">Form permissions</button>
      </div>
      ${this._area === 'form' ? this.#renderFormArea() : this.#renderPackageArea()}
    `;
  }

  #renderFormArea() {
    const cat = this._formCatalog;
    const types = cat?.permissionTypes || cat?.PermissionTypes || [];
    const scopes = cat?.scopes || cat?.Scopes || [];
    const principals = cat?.principals || cat?.Principals || [];
    const formName = this._forms.find((f) => f.id === this._formId)?.title || '';

    return html`
      <div class="body">
        <div class="scroll">
          <h2>Form permissions</h2>
          <p class="sub">
            Who may do what with one form's entries. These are MegaForm's own per-form rules —
            separate from the package permissions above, which say what a user group may do with
            MegaForm at all.
          </p>
          ${this._error ? html`<div class="msg err">${this._error}</div>` : nothing}
          ${this._ok ? html`<div class="msg ok">${this._ok}</div>` : nothing}

          <div class="picker">
            <label for="mf-sec-form">Form</label>
            <select id="mf-sec-form" .value="${String(this._formId)}"
                    @change="${(e) => this.#loadFormPermissions(e.target.value)}">
              ${this._forms.map((f) => html`<option value="${f.id}">${f.title || `Form #${f.id}`}</option>`)}
            </select>
          </div>

          ${!this._forms.length
            ? html`<p class="sub">${this._busy ? 'Loading\u2026' : 'No forms yet.'}</p>`
            : !types.length
              ? html`<p class="sub">${this._busy ? 'Loading\u2026' : 'No permission types for this form.'}</p>`
              : html`
          <div class="section matrix-wrap">
            <h3>${formName || `Form #${this._formId}`}</h3>
            <table class="matrix">
              <thead>
                <tr>
                  <th>Role or user</th>
                  ${types.map((t) => html`<th>${t.label || t.key}<small>${t.description || ''}</small></th>`)}
                </tr>
              </thead>
              <tbody>
                ${principals.map((p) => html`
                  <tr>
                    <td class="who">${p.displayName || p.roleName || p.principalId}
                      <small>${p.isSpecial ? 'Everyone in this category'
                                           : p.isRole ? 'User group' : 'User'}</small></td>
                    ${types.map((t) => {
                      const rule = this.#findRule(p, t.key);
                      const on = !!rule;
                      return html`
                        <td>
                          <input type="checkbox" .checked="${on}"
                                 @change="${(e) => this.#setGrant(p, t, e.target.checked)}" />
                          ${on && t.supportsScope ? html`
                            <select .value="${String(rule.scope || t.defaultScope || 'all')}"
                                    @change="${(e) => this.#setScope(p, t, e.target.value)}">
                              ${scopes.map((sc) => html`<option value="${sc.key}">${sc.label || sc.key}</option>`)}
                            </select>` : nothing}
                        </td>`;
                    })}
                  </tr>`)}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>

      <div class="footer">
        <span class="crumb">Security / Form permissions / ${formName || '\u2014'}</span>
        <span class="grow"></span>
        <button class="act" @click="${() => this.#loadFormPermissions(this._formId)}"
                ?disabled="${this._busy || !this._formId}">Reload</button>
        <button class="act primary" @click="${() => this.#saveFormPermissions()}"
                ?disabled="${this._busy || !this._formId}">Save</button>
      </div>
    `;
  }

  #renderPackageArea() {
    const g = this._selected;
    return html`
      <div class="body">
        <div class="groups">
          ${this._groups.map((row) => html`
            <button aria-current="${row.key === g?.key ? 'true' : 'false'}"
                    @click="${() => { this._selected = row; this._ok = ''; }}">${row.name}</button>
          `)}
          ${!this._groups.length ? html`<div style="padding:14px;font-size:13px;color:#64748b">
            ${this._busy ? 'Loading…' : 'No user groups.'}</div>` : nothing}
        </div>

        <div class="scroll">
          <h2>${g ? g.name : 'Security'}</h2>
          <p class="sub">
            What this user group may do with MegaForm. These are Umbraco user group permissions —
            changing them here is the same as changing them under Users.
          </p>
          ${this._error ? html`<div class="msg err">${this._error}</div>` : nothing}
          ${this._ok ? html`<div class="msg ok">${this._ok}</div>` : nothing}

          ${g ? html`
            <div class="section">
              <h3>Package Permissions</h3>
              ${this._catalog.map((c) => html`
                <div class="row">
                  <div class="label">${c.name}<small>${c.description}</small></div>
                  <div>
                    <input type="checkbox"
                           .checked="${(g.permissions || []).includes(c.letter)}"
                           @change="${(e) => this.#toggle(c.letter, e.target.checked)}" />
                  </div>
                </div>
              `)}
            </div>` : nothing}
        </div>
      </div>

      <div class="footer">
        <span class="crumb">Security / ${g ? g.name : '—'}</span>
        <span class="grow"></span>
        <button class="act" @click="${() => this.#load()}" ?disabled="${this._busy}">Reload</button>
        <button class="act primary" @click="${() => this.#save()}" ?disabled="${this._busy || !g}">Save</button>
      </div>
    `;
  }
}

customElements.define('megaform-security-view', MegaFormSecurityView);
