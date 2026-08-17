import { UmbUfmElementBase, UMB_UFM_RENDER_CONTEXT } from '@umbraco-cms/backoffice/ufm';
import { html } from '@umbraco-cms/backoffice/external/lit';
import { mfFetchJson, setMegaFormAuthContext } from '../contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * Companion element for the megaformFormName UFM component.
 * Consumes the UFM render context to read the referenced property value,
 * resolves it as a MegaForm id, and fetches the form title.
 */
export default class MegaFormFormNameElement extends UmbUfmElementBase {
  static properties = {
    alias: { type: String },
    value: { type: Object, state: true },
    _formName: { type: String, state: true },
    _loading: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.alias = '';
    this.value = undefined;
    this._formName = '';
    this._loading = false;
    this.__cachedFormId = 0;
    this.__cachedFormName = '';

    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
    });

    this.consumeContext(UMB_UFM_RENDER_CONTEXT, (context) => {
      this.observe(
        context?.value,
        (value) => {
          if (this.alias !== undefined && value !== undefined && typeof value === 'object') {
            this.value = value[this.alias];
          } else {
            this.value = value;
          }
          this._resolveFormName();
        },
        'observeValue'
      );
    });
  }

  async _resolveFormName() {
    const formId = this._parseFormId(this.value);
    if (!formId) {
      this._formName = '';
      return;
    }

    if (this.__cachedFormId === formId && this.__cachedFormName) {
      this._formName = this.__cachedFormName;
      return;
    }

    this._loading = true;
    try {
      // mfFetchJson, not fetch: Form/Lookup is behind the MegaFormApi policy, which answers a
      // cookie-less call with a redirect to the login page. A plain fetch follows it and hands
      // back HTML, so the label would silently fall back to "Form #n" on every board.
      const data = await mfFetchJson(`/umbraco/MegaForm/MegaFormApi/Form/Lookup?formId=${formId}`);
      this._formName = data?.title || `Form #${formId}`;
    } catch {
      this._formName = `Form #${formId}`;
    } finally {
      this._loading = false;
    }

    this.__cachedFormId = formId;
    this.__cachedFormName = this._formName;
  }

  _parseFormId(value) {
    if (value == null) {
      return 0;
    }
    if (typeof value === 'number') {
      return value > 0 ? value : 0;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
      }
    }
    return 0;
  }

  render() {
    if (this._loading) {
      return html`<span>Loading…</span>`;
    }
    return html`<span>${this._formName}</span>`;
  }
}

customElements.define('megaform-form-name', MegaFormFormNameElement);
