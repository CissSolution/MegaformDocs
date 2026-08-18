import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { mfFetch, setMegaFormAuthContext } from './contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * [FormSettings 2026-08-18] The form's own settings, as a screen rather than a panel.
 *
 * Umbraco Forms puts these on the Settings tab of the form workspace: a plain list of
 * label + description on the left, the control on the right, grouped into sections, with
 * Save pinned to the bottom bar. MegaForm kept the same settings inside the builder's
 * flyout, which meant opening the whole builder — and its canvas, palette and toolbars —
 * to change the Submit button caption.
 *
 * This screen replaces the frame for the Settings tab. It is deliberately NOT a mirror of
 * every switch the builder offers: it carries the settings that live on the form record
 * itself (captions, storage, after-submit, notifications), which are exactly the ones
 * Umbraco Forms exposes here. Anything schema-shaped — fields, layout, theme, workflow —
 * stays in the builder, where the canvas gives it meaning.
 *
 * Saving goes through Form/Save, the same endpoint the builder uses. That endpoint keeps
 * any column this payload does not carry (PreserveNullStrings), so a partial save cannot
 * clear the workflow, the schema, or the theme.
 */
const API = '/umbraco/MegaForm/MegaFormApi';

export default class MegaFormFormSettingsView extends UmbLitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0;
            font-family: var(--uui-font-family, inherit); color: var(--uui-color-text, #0f172a); }
    .scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 20px 28px; }
    .section { background: var(--uui-color-surface, #fff); border: 1px solid var(--uui-color-border, #e2e8f0);
               border-radius: 6px; margin-bottom: 16px; }
    .section > h3 { margin: 0; padding: 12px 16px; font-size: 14px; border-bottom: 1px solid var(--uui-color-border, #e2e8f0);
                    background: var(--uui-color-surface-alt, #f6f7f9); border-radius: 6px 6px 0 0; }
    /* Umbraco Forms' proportions: the explanation is part of the label, not a tooltip. */
    .row { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 20px; padding: 14px 16px;
           border-bottom: 1px solid var(--uui-color-border, #f1f5f9); align-items: start; }
    .row:last-child { border-bottom: 0; }
    .label { font-size: 13px; font-weight: 700; }
    .label small { display: block; font-weight: 400; color: var(--uui-color-text-alt, #64748b); margin-top: 4px; line-height: 1.45; }
    input[type="text"], input[type="email"], textarea, select {
      width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 7px 9px;
      border: 1px solid var(--uui-color-border, #cbd5e1); border-radius: 4px;
      background: var(--uui-color-surface, #fff); color: inherit; }
    textarea { min-height: 90px; }
    .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
    /* The footer stays put while the settings scroll — the bar Umbraco Forms keeps at the bottom. */
    .footer { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 10px 20px;
              border-top: 1px solid var(--uui-color-border, #e2e8f0); background: var(--uui-color-surface, #fff); }
    .crumb { font-size: 13px; color: var(--uui-color-text-alt, #64748b); }
    .grow { flex: 1; }
    button { font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 4px; cursor: pointer;
             border: 1px solid var(--uui-color-border, #cbd5e1); background: var(--uui-color-surface, #fff); }
    button.primary { background: var(--uui-color-positive, #1b834f); border-color: transparent; color: #fff; }
    .msg { margin: 0 20px 12px; padding: 10px 12px; border-radius: 4px; font-size: 13px; }
    .msg.err { background: #fef2f2; color: #b91c1c; }
    .msg.ok { background: #f0fdf4; color: #166534; }
  `;

  static properties = { _form: { state: true }, _busy: { state: true }, _error: { state: true }, _ok: { state: true } };

  constructor() {
    super();
    this._form = null;
    this._busy = false;
    this._error = '';
    this._ok = '';
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this.#load();
    });
    this.#onNav = () => { if (this.#formId() !== this._form?.formId) this.#load(); };
  }

  #onNav;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('popstate', this.#onNav);
    window.addEventListener('umb:route-change', this.#onNav);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.#onNav);
    window.removeEventListener('umb:route-change', this.#onNav);
    super.disconnectedCallback();
  }

  #formId() {
    const m = /\/view\/open\/form-settings\/(\d+)/i.exec(window.location.pathname);
    return m ? Number(m[1]) : 0;
  }

  async #call(url, init) {
    const res = await mfFetch(url, { credentials: 'include', ...init,
      headers: { Accept: 'application/json', ...(init?.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error((text || `HTTP ${res.status}`).replace(/^"|"$/g, '').slice(0, 300));
    if (!(res.headers.get('content-type') || '').toLowerCase().includes('json')) {
      throw new Error('not signed in — reload the backoffice and try again');
    }
    return text ? JSON.parse(text) : null;
  }

  async #load() {
    const id = this.#formId();
    if (!id) { this._form = null; return; }
    this._busy = true; this._error = '';
    try {
      const raw = await this.#call(`${API}/Form/Get?formId=${id}`);
      let settings = {};
      try { settings = JSON.parse(raw.settingsJson || raw.SettingsJson || '{}') || {}; } catch { settings = {}; }
      this._form = {
        formId: id,
        title: raw.title ?? raw.Title ?? '',
        description: raw.description ?? raw.Description ?? '',
        submitButtonText: raw.submitButtonText ?? raw.SubmitButtonText ?? '',
        successMessage: raw.successMessage ?? raw.SuccessMessage ?? '',
        redirectUrl: raw.redirectUrl ?? raw.RedirectUrl ?? '',
        notifyEmails: raw.notifyEmails ?? raw.NotifyEmails ?? '',
        requireAuth: !!(raw.requireAuth ?? raw.RequireAuth),
        enableCaptcha: !!(raw.enableCaptcha ?? raw.EnableCaptcha),
        enableSaveResume: !!(raw.enableSaveResume ?? raw.EnableSaveResume),
        settings,
      };
    } catch (e) {
      this._error = `Could not load the form: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  async #save() {
    const f = this._form;
    if (!f) return;
    this._busy = true; this._error = ''; this._ok = '';
    try {
      // Only the columns this screen edits travel. Form/Save keeps every column a payload
      // omits, so the schema, theme and workflow are safe from a settings save.
      await this.#call(`${API}/Form/Save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: f.formId,
          title: f.title,
          description: f.description,
          submitButtonText: f.submitButtonText,
          successMessage: f.successMessage,
          redirectUrl: f.redirectUrl,
          notifyEmails: f.notifyEmails,
          requireAuth: f.requireAuth,
          enableCaptcha: f.enableCaptcha,
          enableSaveResume: f.enableSaveResume,
          settingsJson: JSON.stringify(f.settings || {}),
        }),
      });
      this._ok = 'Saved.';
      await this.#load();
    } catch (e) {
      this._error = `Save failed: ${e.message}`;
    } finally {
      this._busy = false;
    }
  }

  #set(key, value) { this._form = { ...this._form, [key]: value }; }
  #setSetting(key, value) { this._form = { ...this._form, settings: { ...this._form.settings, [key]: value } }; }

  render() {
    const f = this._form;
    if (!f) return html`<div class="scroll">${this._busy ? 'Loading…' : (this._error || 'No form selected.')}</div>`;
    const st = f.settings || {};

    return html`
      <div class="scroll">
        ${this._error ? html`<div class="msg err">${this._error}</div>` : nothing}
        ${this._ok ? html`<div class="msg ok">${this._ok}</div>` : nothing}

        <div class="section">
          <h3>Form</h3>
          ${this.#row('Name', 'The name editors see in the tree and the dashboard.',
            html`<input type="text" .value="${f.title}" @input="${(e) => this.#set('title', e.target.value)}" />`)}
          ${this.#row('Description', 'Shown under the title on the form itself, when the header is visible.',
            html`<textarea @input="${(e) => this.#set('description', e.target.value)}">${f.description}</textarea>`)}
        </div>

        <div class="section">
          <h3>Store records</h3>
          ${this.#row('Keep submitted records',
            'Submissions are stored so they can be read and exported from Entries. Turn it off and the form still runs its workflow and notifications, but nothing is kept.',
            html`<label class="toggle"><input type="checkbox" .checked="${st.storeRecords !== false}"
                    @change="${(e) => this.#setSetting('storeRecords', e.target.checked)}" />
                  Yes, keep submitted records</label>`)}
          ${this.#row('Require login', 'Only signed-in members can submit this form.',
            html`<label class="toggle"><input type="checkbox" .checked="${f.requireAuth}"
                    @change="${(e) => this.#set('requireAuth', e.target.checked)}" /> Require login</label>`)}
          ${this.#row('Save and continue', 'Lets a visitor come back to a part-filled form.',
            html`<label class="toggle"><input type="checkbox" .checked="${f.enableSaveResume}"
                    @change="${(e) => this.#set('enableSaveResume', e.target.checked)}" /> Enable save and continue</label>`)}
          ${this.#row('Captcha', 'Adds the configured captcha challenge before a submission is accepted.',
            html`<label class="toggle"><input type="checkbox" .checked="${f.enableCaptcha}"
                    @change="${(e) => this.#set('enableCaptcha', e.target.checked)}" /> Enable captcha</label>`)}
        </div>

        <div class="section">
          <h3>Captions</h3>
          ${this.#row('Submit button', 'The label on the button that sends the form.',
            html`<input type="text" .value="${f.submitButtonText}" placeholder="Submit"
                    @input="${(e) => this.#set('submitButtonText', e.target.value)}" />`)}
          ${this.#row('Next button', 'Multi-step forms only.',
            html`<input type="text" .value="${st.nextButtonText || ''}" placeholder="Next"
                    @input="${(e) => this.#setSetting('nextButtonText', e.target.value)}" />`)}
          ${this.#row('Previous button', 'Multi-step forms only.',
            html`<input type="text" .value="${st.prevButtonText || ''}" placeholder="Previous"
                    @input="${(e) => this.#setSetting('prevButtonText', e.target.value)}" />`)}
        </div>

        <div class="section">
          <h3>After submission</h3>
          ${this.#row('Message', 'Shown in place of the form once it has been sent.',
            html`<textarea @input="${(e) => this.#set('successMessage', e.target.value)}">${f.successMessage}</textarea>`)}
          ${this.#row('Redirect URL', 'Leave empty to show the message instead of navigating away.',
            html`<input type="text" .value="${f.redirectUrl}" placeholder="/thank-you/"
                    @input="${(e) => this.#set('redirectUrl', e.target.value)}" />`)}
        </div>

        <div class="section">
          <h3>Notifications</h3>
          ${this.#row('Notify these addresses',
            'Comma-separated. Each submission is emailed to them using the notification template.',
            html`<input type="text" .value="${f.notifyEmails}" placeholder="team@example.com, ops@example.com"
                    @input="${(e) => this.#set('notifyEmails', e.target.value)}" />`)}
        </div>
      </div>

      <div class="footer">
        <span class="crumb">Forms / ${f.title || `Form #${f.formId}`}</span>
        <span class="grow"></span>
        <button @click="${() => this.#load()}" ?disabled="${this._busy}">Discard changes</button>
        <button class="primary" @click="${() => this.#save()}" ?disabled="${this._busy}">Save</button>
      </div>
    `;
  }

  #row(label, description, control) {
    return html`
      <div class="row">
        <div class="label">${label}<small>${description}</small></div>
        <div>${control}</div>
      </div>
    `;
  }
}

customElements.define('megaform-form-settings-view', MegaFormFormSettingsView);
