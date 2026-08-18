import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';

/**
 * [UmbRouteParams 2026-08-15] Submissions, filtered to the form the route names.
 *
 * Same fault as the builder view: the sidebar links to
 * /umbraco/section/megaform/view/submissions?formId=N (megaform-sidebar-menu.js:145) and
 * MegaFormAdminController.Submissions already takes formId, but the fixed iframe src dropped it,
 * so "Submissions" on any single form opened the unfiltered inbox for every form.
 */
export default class MegaFormSubmissionsView extends UmbLitElement {
  static styles = css`
    :host { display: block; width: 100%; height: 100%; min-height: 0; }
    iframe { display: block; width: 100%; height: 100%; border: 0; }
  `;

  static properties = { _src: { state: true } };

  constructor() {
    super();
    this._src = this.#resolve();
    this.#onNav = () => {
      const next = this.#resolve();
      if (next !== this._src) this._src = next;
    };
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

  #resolve() {
    const raw = new URLSearchParams(window.location.search).get('formId') || '';
    const id = /^\d+$/.test(raw) ? Number(raw) : 0;
    return id > 0 ? `/umbraco/MegaForm/Submissions?formId=${id}` : '/umbraco/MegaForm/Submissions';
  }

  render() {
    return html`<iframe src="${this._src}" title="MegaForm Submissions" allow="fullscreen"></iframe>`;
  }
}

customElements.define('megaform-submissions-view', MegaFormSubmissionsView);
