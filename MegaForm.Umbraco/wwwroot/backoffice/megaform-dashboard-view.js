import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';

export default class MegaFormDashboardView extends UmbLitElement {
  static styles = css`
    :host { display: block; width: 100%; height: 100%; min-height: 0; }
    iframe { display: block; width: 100%; height: 100%; border: 0; }
  `;

  render() {
    return html`<iframe src="/umbraco/MegaForm/Admin" title="MegaForm Dashboard" allow="fullscreen"></iframe>`;
  }
}

customElements.define('megaform-dashboard-view', MegaFormDashboardView);
