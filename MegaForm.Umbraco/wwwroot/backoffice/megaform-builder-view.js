import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';

/**
 * [UmbRouteParams 2026-08-15] The builder, for the form the route names.
 *
 * This used to render a fixed `<iframe src="/umbraco/MegaForm/Builder">`. The sidebar has always
 * linked to /umbraco/section/megaform/view/builder/{formId} (megaform-sidebar-menu.js:128), and
 * MegaFormAdminController already accepts Builder/{formId:int?} — but the id never travelled from
 * one to the other, so "Edit" on every form in the list opened the same empty builder. Nothing
 * failed; the wrong form simply loaded, which is the kind of bug a screenshot catches and a status
 * code never does.
 *
 * The element is NOT re-created when the route changes from one form to another inside the same
 * view, so the src has to be recomputed on navigation rather than only in the constructor.
 */
export default class MegaFormBuilderView extends UmbLitElement {
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
    // pushState does not raise popstate in the tab that called it, and Umbraco's router navigates
    // that way, so a same-view form switch would otherwise keep the previous form on screen.
    window.addEventListener('umb:route-change', this.#onNav);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.#onNav);
    window.removeEventListener('umb:route-change', this.#onNav);
    super.disconnectedCallback();
  }

  /** /umbraco/section/megaform/view/builder[/{id}|/new] -> /umbraco/MegaForm/Builder[/{id}] */
  #resolve() {
    const m = /\/view\/builder\/([^/?#]+)/i.exec(window.location.pathname);
    const raw = m ? decodeURIComponent(m[1]) : '';
    // "new" and a missing segment both mean "start a new form"; the controller treats 0 that way.
    const id = /^\d+$/.test(raw) ? Number(raw) : 0;
    return id > 0 ? `/umbraco/MegaForm/Builder/${id}` : '/umbraco/MegaForm/Builder';
  }

  render() {
    return html`<iframe src="${this._src}" title="MegaForm Builder" allow="fullscreen"></iframe>`;
  }
}

customElements.define('megaform-builder-view', MegaFormBuilderView);
