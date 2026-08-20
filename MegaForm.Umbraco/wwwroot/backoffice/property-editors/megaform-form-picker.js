import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import { UmbPropertyValueChangeEvent } from '@umbraco-cms/backoffice/property-editor';
import { mfFetchJson, setMegaFormAuthContext } from '../contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * Native Bellissima property editor UI for MegaForm.
 * Picks a MegaForm form and stores its id as a string value.
 */
export class MegaFormFormPickerElement extends UmbLitElement {
  static properties = {
    value: { type: String },
    _forms: { type: Array, state: true },
    _filteredForms: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _error: { type: String, state: true },
    _search: { type: String, state: true },
  };

  constructor() {
    super();
    this.value = '';
    this._forms = [];
    this._filteredForms = [];
    this._loading = true;
    this._error = '';
    this._search = '';

    // Load only once the auth context is available, so the very first request already carries
    // the bearer token. Loading in the constructor left it to the backoffice cookie, which is
    // what produced "Unable to load forms" on a session whose cookie had timed out.
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this._loadForms();
    });
  }

  static styles = css`
    :host {
      display: block;
    }
    .empty,
    .error {
      color: var(--uui-color-text-alt, #64748b);
      font-size: 0.875rem;
      padding: 0.5rem 0;
      margin: 0;
    }
    .error {
      color: var(--uui-color-danger, #dc2626);
    }
    uui-select,
    uui-input {
      width: 100%;
    }
    uui-input {
      margin-bottom: 0.5rem;
    }
    .selected {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
      font-size: 0.875rem;
      color: var(--uui-color-text, #1e293b);
    }
    .selected .title {
      color: var(--uui-color-text-alt, #64748b);
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Cùng chỗ, cùng thứ tự với picker của Umbraco Forms: các liên kết nằm
       cuối hàng đã chọn, không phải một hàng nút riêng bên dưới. */
    .actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex: 0 0 auto;
    }
    .actions button {
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
      font: inherit;
      color: var(--uui-color-interactive, #1b264f);
      text-decoration: none;
    }
    .actions button:hover {
      text-decoration: underline;
    }
    .actions button.remove {
      color: var(--uui-color-danger, #dc2626);
    }
  `;

  render() {
    if (this._loading) {
      return html`<p class="empty">Loading MegaForm list…</p>`;
    }

    if (this._error) {
      return html`<p class="error">${this._error}</p>`;
    }

    if (this._forms.length === 0) {
      return html`
        <p class="empty">
          No MegaForm forms available.
          <a href="/umbraco/section/megaform/view/builder" target="_blank" rel="noopener">
            Create one in the MegaForm section.
          </a>
        </p>
      `;
    }

    const selected = this._forms.find((f) => String(f.formId) === String(this.value));
    const options = this._buildOptions(this._filteredForms);

    return html`
      <uui-input
        type="search"
        placeholder="Search forms…"
        .value="${this._search}"
        @input="${this._onSearch}">
      </uui-input>
      <uui-select
        .options="${options}"
        .value="${String(this.value)}"
        @change="${this._onChange}"
        label="Select a MegaForm">
      </uui-select>
      ${selected
        ? html`
            <div class="selected">
              <uui-tag color="${(selected.status ?? '').toLowerCase() === 'published' ? 'positive' : 'warning'}">
                ${selected.status ?? 'draft'}
              </uui-tag>
              <span class="title">${selected.title} (#${selected.formId})</span>
              <span class="actions">
                <button type="button" @click="${() => this._goTo(`builder/${selected.formId}`)}">Edit</button>
                <button type="button" @click="${() => this._goTo(`submissions?formId=${selected.formId}`)}">Open</button>
                <button type="button" class="remove" @click="${this._clear}">Remove</button>
              </span>
            </div>
          `
        : ''}
    `;
  }

  _buildOptions(forms) {
    return [
      { name: '-- Select a MegaForm --', value: '', selected: this.value === '' },
      ...forms.map((f) => ({
        name: `${f.title} (#${f.formId}) · ${f.status ?? 'draft'}`,
        value: String(f.formId),
        selected: String(this.value) === String(f.formId),
      })),
    ];
  }

  _onSearch(event) {
    const term = (event.target.value ?? '').toLowerCase().trim();
    this._search = term;
    this._filteredForms = term
      ? this._forms.filter((f) =>
          (f.title ?? '').toLowerCase().includes(term) ||
          String(f.formId).includes(term))
      : [...this._forms];
  }

  async _loadForms() {
    try {
      this._loading = true;
      // Must go through mfFetchJson: a plain cookie-only fetch is redirected to the login
      // page once the backoffice cookie lapses, and the picker then reports a JSON parse
      // error on the login HTML instead of "session expired".
      const forms = await mfFetchJson('/umbraco/MegaForm/MegaFormApi/Form/List');
      this._forms = Array.isArray(forms) ? forms : [];
      this._filteredForms = [...this._forms];
    } catch (error) {
      this._error = `Unable to load forms. (${error.message})`;
      // eslint-disable-next-line no-console
      console.error('[MegaForm.FormPicker] Failed to load forms', error);
    } finally {
      this._loading = false;
    }
  }

  /**
   * Sang một màn MegaForm khác mà KHÔNG tải lại trang.
   *
   * `location.href` sẽ nạp lại cả backoffice, và Umbraco 17 giữ token OIDC
   * trong bộ nhớ — nạp lại là mất token, rồi bị đẩy về màn đăng nhập. Đẩy vào
   * history rồi bắn popstate là cách chính thanh điều hướng bên trái đang dùng.
   */
  _goTo(route) {
    window.history.pushState({}, '', `/umbraco/section/megaform/view/open/${route}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  /**
   * Bỏ chọn form. Phải bắn UmbPropertyValueChangeEvent y như khi chọn, nếu
   * không thì ô hiển thị trống mà giá trị cũ vẫn nằm trong tài liệu và quay lại
   * ngay lần mở sau — người dùng tưởng đã gỡ, thực ra chưa.
   */
  _clear() {
    if (this.value === '') return;
    this.value = '';
    this._search = '';
    this._filteredForms = [...this._forms];
    this.dispatchEvent(new UmbPropertyValueChangeEvent());
  }

  _onChange(event) {
    const select = event.target;
    const newValue = select.value ?? '';
    if (this.value === newValue) return;

    this.value = newValue;
    this.dispatchEvent(new UmbPropertyValueChangeEvent());
  }
}

customElements.define('megaform-form-picker', MegaFormFormPickerElement);
export default MegaFormFormPickerElement;
