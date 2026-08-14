import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import { UmbPropertyValueChangeEvent } from '@umbraco-cms/backoffice/property-editor';

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
    this._loadForms();
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
    .selected span {
      color: var(--uui-color-text-alt, #64748b);
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
              <span>${selected.title} (#${selected.formId})</span>
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
      const response = await fetch('/umbraco/MegaForm/MegaFormApi/Form/List', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const forms = await response.json();
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
