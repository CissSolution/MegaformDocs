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
 */
const API = '/umbraco/MegaForm/MegaFormApi/Security';

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
  `;

  static properties = {
    _catalog: { state: true }, _groups: { state: true }, _selected: { state: true },
    _busy: { state: true }, _error: { state: true }, _ok: { state: true },
  };

  constructor() {
    super();
    this._catalog = [];
    this._groups = [];
    this._selected = null;
    this._busy = false;
    this._error = '';
    this._ok = '';
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
