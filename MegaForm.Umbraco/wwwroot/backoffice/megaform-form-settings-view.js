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
    /* [AfterSubmitFlow 2026-08-20] Chuỗi bước theo lối Umbraco Forms: mỗi việc
       chạy sau khi gửi là một BƯỚC trong một dòng chảy, không phải một ô nhập
       nằm rời trong màn cài đặt. Trước đây "After submission" và "Notifications"
       là hai mục cách nhau nửa màn hình, nên không đọc ra được rằng cả hai đều
       xảy ra sau cùng một cú bấm Gửi. */
    .flow { padding: 6px 16px 14px; }
    .flow-head { display: flex; align-items: center; gap: 10px; padding: 10px 0 2px; }
    .flow-head .bullet { width: 26px; height: 26px; border-radius: 50%; flex: 0 0 26px;
            display: flex; align-items: center; justify-content: center; font-size: 13px;
            background: var(--uui-color-surface-alt, #f1f5f9); color: var(--uui-color-text, #0f172a); }
    .flow-head b { font-size: 14px; }
    .flow-head small { display: block; color: var(--uui-color-text-alt, #64748b); font-size: 12px; }
    /* Đường nối dọc: thứ khiến các bước đọc ra như một dòng chảy chứ không phải
       một danh sách rời. */
    .flow-steps { margin: 6px 0 0 12px; padding: 0 0 0 20px; border-left: 2px solid var(--uui-color-border, #e2e8f0); }
    .step { position: relative; margin: 8px 0; }
    .step > .head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
            background: var(--uui-color-surface, #fff); border: 1px solid var(--uui-color-border, #e2e8f0);
            border-radius: 6px; padding: 10px 12px; cursor: pointer; font: inherit; color: inherit; }
    .step > .head:hover { border-color: var(--uui-color-border-emphasis, #cbd5e1); }
    .step > .head .ic { width: 24px; height: 24px; flex: 0 0 24px; display: flex; align-items: center;
            justify-content: center; color: var(--uui-color-text-alt, #64748b); }
    .step > .head .txt b { display: block; font-size: 13px; }
    .step > .head .txt small { color: var(--uui-color-text-alt, #64748b); font-size: 12px; }
    .step .body { padding: 10px 12px 4px 46px; }
    .step .body label { display: block; font-size: 12px; font-weight: 600; margin: 8px 0 4px; }
    .step.add > .head { border-style: dashed; color: var(--uui-color-text-alt, #64748b); }
    .flow .empty { color: var(--uui-color-text-alt, #64748b); font-size: 12px; padding: 8px 0 2px 32px; }
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
    /* [ToolbarCleanup 2026-08-18] A section whose control is a way in, not a value. */
    .state { font-size: 13px; color: var(--uui-color-text-alt, #64748b); margin: 0 0 8px; }
    .state strong { color: var(--uui-color-text, #0f172a); font-weight: 700; }
    button.link { background: var(--uui-color-surface, #fff); }
  `;

  static properties = { _form: { state: true }, _busy: { state: true }, _error: { state: true }, _ok: { state: true },
                        _openStep: { state: true }, _adding: { state: true } };

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
      // [ToolbarCleanup 2026-08-18] Read-only, and only so the Print and Rules sections can
      // report what is configured instead of offering an unlabelled button. It is never
      // written back: Form/Save is called with the settings columns alone.
      let schema = {};
      try { schema = JSON.parse(raw.schemaJson || raw.SchemaJson || '{}') || {}; } catch { schema = {}; }
      this._form = {
        formId: id,
        title: raw.title ?? raw.Title ?? '',
        description: raw.description ?? raw.Description ?? '',
        submitButtonText: raw.submitButtonText ?? raw.SubmitButtonText ?? '',
        successMessage: raw.successMessage ?? raw.SuccessMessage ?? '',
        redirectUrl: raw.redirectUrl ?? raw.RedirectUrl ?? '',
        notifyEmails: raw.notifyEmails ?? raw.NotifyEmails ?? '',
        // Cột riêng trên MF_Forms — lưu nhầm vào settingsJson thì bước webhook
        // hiện đủ trên màn hình mà lúc gửi form chẳng gọi đi đâu cả.
        webhookUrl: raw.webhookUrl ?? raw.WebhookUrl ?? '',
        requireAuth: !!(raw.requireAuth ?? raw.RequireAuth),
        enableCaptcha: !!(raw.enableCaptcha ?? raw.EnableCaptcha),
        enableSaveResume: !!(raw.enableSaveResume ?? raw.EnableSaveResume),
        settings,
        schema,
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
          webhookUrl: f.webhookUrl,
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

  /**
   * [AfterSubmitFlow 2026-08-20] Những gì xảy ra SAU khi gửi, đọc như một dòng chảy.
   *
   * Umbraco Forms trình bày phần này thành các BƯỚC dưới hai sự kiện — "On Submit"
   * và "On Approve" — nên nhìn một cái là biết cú bấm Gửi kéo theo những việc gì,
   * theo thứ tự nào. MegaForm trước đây có đúng những việc ấy nhưng nằm rải: lời
   * cảm ơn ở mục "After submission", địa chỉ nhận thư ở mục "Notifications" cách
   * đó nửa màn hình, và không chỗ nào nói rằng cả hai cùng chạy sau một cú bấm.
   *
   * Đây KHÔNG phải tính năng mới: mỗi bước đọc và ghi đúng những trường vốn có
   * (successMessage, redirectUrl, notifyEmails, webhookUrl). Chỉ cách bày là mới.
   */
  #afterSubmitFlow(f) {
    const st = f.settings || {};
    const hasEmail = !!String(f.notifyEmails || '').trim();
    const hasHook = !!String(f.webhookUrl || '').trim();
    // Bước "hiện lời cảm ơn / chuyển trang" luôn có mặt: mọi form đều làm một
    // trong hai việc đó, kể cả khi biên tập viên chưa gõ gì.
    const steps = [
      {
        key: 'message',
        icon: 'icon-message',
        title: f.redirectUrl ? 'Go to page' : 'Submit message',
        desc: f.redirectUrl
          ? `Chuyển tới ${f.redirectUrl}`
          : 'Hiện một lời nhắn thay cho form sau khi gửi',
        body: () => html`
          <label>Lời nhắn</label>
          <textarea @input="${(e) => this.#set('successMessage', e.target.value)}">${f.successMessage}</textarea>
          <label>Hoặc chuyển tới trang</label>
          <input type="text" .value="${f.redirectUrl}" placeholder="/thank-you/"
                 @input="${(e) => this.#set('redirectUrl', e.target.value)}" />
          <p class="hint">Để trống ô này thì lời nhắn ở trên được hiện; điền vào thì trình duyệt đi tới trang đó.</p>`,
      },
    ];

    if (hasEmail) {
      steps.push({
        key: 'email',
        icon: 'icon-message',
        title: `Send email to ${f.notifyEmails}`,
        desc: 'Gửi nội dung bài vừa nhận tới các địa chỉ này',
        body: () => html`
          <label>Địa chỉ nhận</label>
          <input type="text" .value="${f.notifyEmails}" placeholder="team@example.com, ops@example.com"
                 @input="${(e) => this.#set('notifyEmails', e.target.value)}" />
          <p class="hint">Cách nhau bằng dấu phẩy. Bỏ trống là gỡ bước này khỏi dòng chảy.</p>`,
      });
    }

    if (hasHook) {
      steps.push({
        key: 'webhook',
        icon: 'icon-brackets',
        title: 'Send to webhook',
        desc: String(f.webhookUrl),
        body: () => html`
          <label>Địa chỉ webhook</label>
          <input type="text" .value="${f.webhookUrl}" placeholder="https://…"
                 @input="${(e) => this.#set('webhookUrl', e.target.value)}" />`,
      });
    }

    const addable = [
      !hasEmail ? { key: 'email', label: 'Send email', run: () => this.#set('notifyEmails', 'team@example.com') } : null,
      !hasHook ? { key: 'webhook', label: 'Send to webhook', run: () => this.#set('webhookUrl', 'https://') } : null,
    ].filter(Boolean);

    return html`
      <div class="flow">
        <div class="flow-head">
          <span class="bullet">✓</span>
          <span><b>On Submit</b><small>Những bước này chạy ngay khi form được gửi đi</small></span>
        </div>
        <div class="flow-steps">
          ${steps.map((step) => this.#flowStep(step))}
          ${addable.length
            ? html`
              <div class="step add">
                <button class="head" @click="${() => { this._adding = !this._adding; }}">
                  <span class="ic">+</span>
                  <span class="txt"><b>Add workflow</b><small>Thêm một việc chạy sau khi gửi</small></span>
                </button>
                ${this._adding
                  ? html`<div class="body">
                      ${addable.map((a) => html`
                        <button class="link" @click="${() => { a.run(); this._adding = false; this._openStep = a.key; }}">
                          ${a.label}
                        </button><br />`)}
                    </div>`
                  : nothing}
              </div>`
            : nothing}
        </div>

        <div class="flow-head" style="margin-top:14px">
          <span class="bullet">👍</span>
          <span><b>On Approve</b><small>Chạy khi một bài gửi được duyệt</small></span>
        </div>
        <div class="flow-steps">
          <p class="empty">
            ${this.#hasWorkflow()
              ? 'Các bước duyệt được dựng ở màn Workflow của form này.'
              : 'Form này chưa có bước duyệt nào. Bật duyệt ở màn Workflow thì các bước sẽ hiện ở đây.'}
          </p>
        </div>
      </div>`;
  }

  #flowStep(step) {
    const open = this._openStep === step.key;
    return html`
      <div class="step">
        <button class="head" @click="${() => { this._openStep = open ? '' : step.key; }}">
          <span class="ic"><uui-icon name="${step.icon}"></uui-icon></span>
          <span class="txt"><b>${step.title}</b><small>${step.desc}</small></span>
        </button>
        ${open ? html`<div class="body">${step.body()}</div>` : nothing}
      </div>`;
  }

  /** Form có bước duyệt hay không — đọc từ schema, không gọi thêm mạng. */
  #hasWorkflow() {
    const wf = (this._form && this._form.schema && (this._form.schema.workflow || this._form.schema.Workflow)) || null;
    if (!wf) return false;
    const nodes = wf.nodes || wf.Nodes || [];
    return Array.isArray(nodes) && nodes.length > 0;
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
          <h3>After submit</h3>
          ${this.#afterSubmitFlow(f)}
        </div>

        <div class="section">
          <h3>Print</h3>
          ${this.#row('Printable version',
            'The layout used when a submission is printed or saved as PDF — page size, header, logo, signature areas, footer.',
            html`<p class="state">Currently <strong>${this.#printEnabled() ? 'on' : 'off'}</strong>.</p>
                 <button class="link" @click="${() => this.#openEditor('print')}">Open print settings</button>`)}
        </div>

        <div class="section">
          <h3>Rules</h3>
          ${this.#row('Form rules',
            'Conditions that show, hide or require fields as the form is filled in. They apply to the whole form, which is why they are configured here and not on a field.',
            html`<p class="state"><strong>${this.#ruleCount()}</strong>
                   ${this.#ruleCount() === 1 ? 'rule' : 'rules'} defined.</p>
                 <button class="link" @click="${() => this.#openEditor('rules')}">Open rule builder</button>`)}
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

  /**
   * [ToolbarCleanup 2026-08-18] Print and Rules used to be two of the ten glyphs on the
   * builder's Design toolbar, which is a row for authoring the form — not for configuring it.
   * Both are form-wide settings, so this screen is where they are listed. Their editors are
   * builder panes and stay there; opening one keeps the Settings tab current (see the
   * form-settings route in megaform-workspace-view.js), so this is one door, not two.
   */
  #openEditor(pane) {
    const id = this._form?.formId || this.#formId();
    if (!id) return;
    const href = `/umbraco/section/megaform/view/open/form-settings/${id}/${pane}`;
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  #printEnabled() {
    const print = this._form?.settings?.printSettings || this._form?.settings?.PrintSettings;
    return !!(print && (print.enabled ?? print.Enabled));
  }

  /** Rules live on the schema, under settings.rules with rulesJson as the older spelling. */
  #ruleCount() {
    const schema = this._form?.schema || {};
    const fromSettings = schema.settings?.rules ?? schema.Settings?.rules;
    if (Array.isArray(fromSettings)) return fromSettings.length;
    const raw = schema.rulesJson ?? schema.RulesJson ?? schema.rules ?? schema.Rules;
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch { return 0; }
    }
    return 0;
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
