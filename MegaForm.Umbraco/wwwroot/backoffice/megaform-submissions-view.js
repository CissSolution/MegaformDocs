const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
  </style>
  <iframe src="/umbraco/MegaForm/Submissions" title="MegaForm Submissions" allow="fullscreen"></iframe>
`;

export default class MegaFormSubmissionsView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
}

customElements.define('megaform-submissions-view', MegaFormSubmissionsView);
