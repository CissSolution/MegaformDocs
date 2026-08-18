import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
// [StaleModuleCache 2026-08-17] Import ONLY names this module has had for a while. Umbraco
// serves every extension file with ?umb__rnd=<package version>, so a browser that already has
// one of them keeps it until that version changes: adding an export to the permissions context
// and importing it here made the whole view fail to parse —
//   "does not provide an export named 'getMegaFormBearerToken'"
// — on every session that had loaded the old file, while the server was serving the new one.
// The token comes from the auth context this element already consumes; no new export needed.
import { mfFetchJson, setMegaFormAuthContext } from './contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
// Native screens this view can render in place of the frame. Imported for the side effect
// of defining the custom element; the manifest only knows about this one view.
import './megaform-prevalue-sources-view.js';
import './megaform-form-settings-view.js';
import './megaform-security-view.js';

/**
 * [OneSectionView 2026-08-15] The single section view for MegaForm, routing internally.
 *
 * Why one and not four:
 * The section used to declare four sectionViews — Dashboard, Builder, Submissions, Languages —
 * and Umbraco renders one tab per view. Those four tabs offered exactly the same four
 * destinations as the section's own left-hand tree, and the MegaForm app inside the frame carries
 * a third navigation of its own, so the screen showed the same choices three times.
 *
 * Hiding the tab strip with CSS is not possible from a package: measured on Umbraco 16, the strip
 * is a uui-tab-group inside umb-section-main-views, eight shadow roots below document —
 *   umb-app > umb-router-slot > umb-backoffice > umb-backoffice-main > umb-router-slot >
 *   umb-section-default > umb-router-slot > umb-section-main-views
 * and a stylesheet at document level cannot cross a shadow boundary. So the tab strip goes away by
 * there being nothing to tab between: one view, and the left tree decides what it shows.
 *
 * Routes it answers, all under /umbraco/section/megaform/view/open/:
 *   builder            -> /umbraco/MegaForm/Builder          (new form)
 *   builder/new        -> /umbraco/MegaForm/Builder
 *   builder/{formId}   -> /umbraco/MegaForm/Builder/{formId}
 *   submissions        -> /umbraco/MegaForm/Submissions
 *   submissions?formId -> /umbraco/MegaForm/Submissions?formId=N
 *   languages          -> /umbraco/MegaForm/Languages
 *   anything else      -> /umbraco/MegaForm/Admin            (the dashboard)
 *
 * The element is not re-created when the route changes within the view, so the frame URL is
 * recomputed on navigation instead of only at construction.
 */
/**
 * [HeaderTabs 2026-08-17] The form tabs belong in the band Umbraco already draws.
 *
 * The section header band (umb-section-main-views > umb-body-layout, header slot) held a single
 * tab reading "MegaForm Dashboard" — a tab strip with nothing to switch between — and the form
 * tabs sat on a second band underneath it. Two header rows above a builder that wants the height,
 * and neither of them full. Umbraco Forms puts its Design / Analytics / Settings / Entries tabs on
 * the top band itself, so that is where these go.
 *
 * A package cannot reach that band with a stylesheet, but it can reach it with a reference: this
 * element sits inside umb-section-main-views' shadow root, so climbing the host chain reaches the
 * umb-body-layout and its "header" slot. The tab bar is appended there, and a <style> in the same
 * shadow root hides the one-tab strip. Both are removed again when the view is disconnected.
 */
const HEAD_STYLE_ID = 'mf-ws-head-style';

export default class MegaFormWorkspaceView extends UmbLitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
    iframe { display: block; width: 100%; flex: 1 1 auto; min-height: 0; border: 0; }

    /* [PanelFullHeight 2026-08-17] The builder's settings panel is pinned to the frame it
       lives in, so inside this iframe it could never be taller than the content area —
       while an Umbraco sidebar is as tall as the screen. When the builder reports that its
       panel is open (postMessage), the frame takes the viewport for as long as it is open,
       which makes the panel screen-height and dims everything behind it, the way Umbraco's
       own modal does. */
    :host(.mf-panel-open) iframe {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 9000;
    }
  `;

  static properties = {
    _src: { state: true }, _title: { state: true }, _native: { state: true },
    _formId: { state: true }, _tab: { state: true }, _formName: { state: true },
  };

  constructor() {
    super();
    const r = MegaFormWorkspaceView.resolve();
    this._src = r.src;
    this._title = r.title;
    this._native = r.native || '';
    this._formId = r.formId || 0;
    this._tab = r.tab || '';
    this._formName = '';

    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      // Keep the context itself: the frame asks this element for a bearer token and
      // getLatestToken() on this object is where the live one comes from.
      this._auth = auth;
      setMegaFormAuthContext(auth);
      this.#loadFormName();
    });

    // The builder tells us when its settings panel opens, so the frame can take the
    // viewport for that time. Same origin, and the origin is checked before acting.
    this.#onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data) return;

      if (data.type === 'megaform:flyout') {
        this.classList.toggle('mf-panel-open', !!data.open);
        return;
      }

      // [TokenBridge 2026-08-17] The screens inside the frame are served anonymously and
      // authenticated on the backoffice COOKIE, which lapses about half an hour into a
      // session — after which every API call is answered with the login PAGE and the screen
      // says «Unexpected token '<'». The bearer token Bellissima keeps is in memory in THIS
      // document, and the frame is same-origin, so it can ask for it. Origin is checked
      // above, and the reply is addressed to this origin only.
      if (data.type === 'megaform:request-token') {
        this.#bearerToken()
          .then((token) => {
            try { e.source?.postMessage({ type: 'megaform:token', token: token || '' }, window.location.origin); }
            catch (_e) { /* frame went away */ }
          })
          .catch(() => {
            try { e.source?.postMessage({ type: 'megaform:token', token: '' }, window.location.origin); }
            catch (_e) { /* frame went away */ }
          });
      }
    };

    this.#onNav = () => {
      const next = MegaFormWorkspaceView.resolve();
      // The tab can change without the frame URL changing (Design -> Settings is the same
      // builder page), so never gate the state update on src alone.
      this._tab = next.tab || '';
      if ((next.formId || 0) !== this._formId) {
        this._formId = next.formId || 0;
        this._formName = '';
        this.#loadFormName();
      }
      if (next.src !== this._src || (next.native || '') !== this._native) {
        this._src = next.src; this._title = next.title; this._native = next.native || '';
      }
    };
  }

  /** The backoffice's live bearer token, or '' when there is none to lend. */
  async #bearerToken() {
    try {
      const token = await this._auth?.getLatestToken?.();
      return token || '';
    } catch (_e) {
      return '';
    }
  }

  /** Name in the header, the way Umbraco shows the form it is working on. */
  async #loadFormName() {
    const id = this._formId;
    if (!(id > 0)) { this._formName = ''; return; }
    try {
      const data = await mfFetchJson(`/umbraco/MegaForm/MegaFormApi/Form/Lookup?formId=${id}`);
      if (this._formId === id) this._formName = data?.title || '';
    } catch (_e) {
      // Header falls back to "Form #id" — not worth surfacing.
    }
  }

  #go(route) {
    const href = `/umbraco/section/megaform/view/open/${route}/${this._formId}`;
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  #onNav;
  #onMsg;

  connectedCallback() {
    super.connectedCallback();
    // pushState does not fire popstate in the tab that called it, and Umbraco's router navigates
    // that way, so listen for both.
    window.addEventListener('popstate', this.#onNav);
    window.addEventListener('umb:route-change', this.#onNav);
    window.addEventListener('message', this.#onMsg);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.#onNav);
    window.removeEventListener('umb:route-change', this.#onNav);
    window.removeEventListener('message', this.#onMsg);
    // Never leave the frame pinned over the backoffice after navigating away.
    this.classList.remove('mf-panel-open');
    this.#teardownHeader();
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.#mountHeader();
  }

  updated() {
    // The bar lives outside this element's shadow root, so Lit will not re-render it.
    this.#mountHeader();
    this.#paintHeader();
  }

  /** umb-section-main-views, found by climbing out of the shadow roots we are nested in. */
  #sectionViewsHost() {
    let node = this;
    for (let hops = 0; hops < 8 && node; hops++) {
      const root = node.getRootNode();
      if (!(root instanceof ShadowRoot)) return null;
      const host = root.host;
      if (!host) return null;
      if (host.tagName && host.tagName.toLowerCase() === 'umb-section-main-views') return host;
      node = host;
    }
    return null;
  }

  #mountHeader() {
    if (this._headEl && this._headEl.isConnected) return;
    const host = this.#sectionViewsHost();
    const layout = host?.shadowRoot?.querySelector('umb-body-layout');
    if (!layout) return;

    if (!host.shadowRoot.getElementById(HEAD_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = HEAD_STYLE_ID;
      // One section view means one tab, and a tab strip you cannot switch is just a band of
      // wasted height. Hide it; the tree on the left is the navigation.
      style.textContent = `
        uui-tab-group { display: none !important; }
        .mf-ws-head {
          display: flex; align-items: center; gap: 12px; width: 100%;
          min-height: 36px; font-family: var(--uui-font-family, inherit);
        }
        .mf-ws-name {
          font-size: 15px; font-weight: 700; color: var(--uui-color-text, #0f172a);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 340px;
        }
        .mf-ws-name em { font-style: normal; font-weight: 400; opacity: .55; margin-left: 6px; }
        /* Tabs to the right, the way Umbraco Forms lays its workspace out. */
        .mf-ws-tabs { display: flex; gap: 2px; margin-left: auto; align-self: stretch; }
        .mf-ws-tab {
          appearance: none; border: 0; background: none; cursor: pointer; font: inherit;
          font-size: 13px; font-weight: 600; color: var(--uui-color-text-alt, #64748b);
          padding: 0 14px; border-bottom: 3px solid transparent;
          display: inline-flex; align-items: center; gap: 7px;
        }
        .mf-ws-tab:hover { color: var(--uui-color-text, #0f172a); background: var(--uui-color-surface-alt, #f6f7f9); }
        .mf-ws-tab[aria-current='page'] {
          color: var(--uui-color-text, #0f172a);
          border-bottom-color: var(--uui-color-focus, #3544b1);
        }
      `;
      host.shadowRoot.appendChild(style);
    }

    const bar = document.createElement('div');
    bar.className = 'mf-ws-head';
    bar.setAttribute('slot', 'header');
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest?.('.mf-ws-tab');
      if (btn?.dataset.route) this.#go(btn.dataset.route);
    });
    layout.appendChild(bar);
    this._headEl = bar;
    this.#paintHeader();
  }

  #paintHeader() {
    const bar = this._headEl;
    if (!bar || !bar.isConnected) return;
    // No form open (dashboard, languages): leave the band to whatever Umbraco puts there.
    if (!(this._formId > 0)) { bar.innerHTML = ''; return; }

    // [ToolbarCleanup 2026-08-18] Workflow is a tab, not a toolbar icon. The BPMN editor
    // takes over the whole screen when it opens — it was never an inspector pane — so it
    // belongs beside Design and Entries, which is also where Umbraco Forms puts a
    // full-screen editor.
    const tabs = [
      ['design',    'builder',       'icon-brush',        'Design'],
      ['entries',   'submissions',   'icon-inbox',        'Entries'],
      ['analytics', 'analytics',     'icon-chart-curve',  'Analytics'],
      ['workflow',  'workflow',      'icon-diagram',      'Workflow'],
      ['settings',  'form-settings', 'icon-settings',     'Settings'],
    ];
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    bar.innerHTML =
      `<span class="mf-ws-name">${esc(this._formName || 'Form')}<em>#${this._formId}</em></span>` +
      '<div class="mf-ws-tabs">' +
      tabs.map(([key, route, icon, label]) =>
        `<button type="button" class="mf-ws-tab" data-route="${route}" ` +
        `aria-current="${this._tab === key ? 'page' : 'false'}">` +
        `<uui-icon name="${icon}"></uui-icon>${label}</button>`).join('') +
      '</div>';
  }

  #teardownHeader() {
    try { this._headEl?.remove(); } catch (_e) { /* already gone */ }
    this._headEl = null;
    const host = this.#sectionViewsHost();
    try { host?.shadowRoot?.getElementById(HEAD_STYLE_ID)?.remove(); } catch (_e) { /* already gone */ }
  }

  static resolve() {
    const m = /\/view\/open\/([^?#]*)/i.exec(window.location.pathname);
    const rest = (m ? m[1] : '').replace(/^\/+|\/+$/g, '');
    // A third segment names a pane inside the builder — Settings links to the Print and Rules
    // editors that still live there, and they must not look like leaving Settings.
    const [what, arg, pane] = rest.split('/');
    const qsId = new URLSearchParams(window.location.search).get('formId') || '';
    const num = (v) => (/^\d+$/.test(v || '') ? Number(v) : 0);

    switch ((what || '').toLowerCase()) {
      case 'builder': {
        const id = num(arg);
        const qs = '?host=umbraco-workspace';
        // Leaving the builder for another tab must not leave a stale rail selection behind.
        try { sessionStorage.removeItem('mf-builder-initial-tab'); } catch (_e) {}
        return { src: id > 0 ? `/umbraco/MegaForm/Builder/${id}${qs}` : `/umbraco/MegaForm/Builder${qs}`,
                 title: 'MegaForm Builder', formId: id, tab: 'design' };
      }
      case 'submissions': {
        const id = num(arg) || num(qsId);
        return { src: id > 0 ? `/umbraco/MegaForm/Submissions?formId=${id}` : '/umbraco/MegaForm/Submissions',
                 title: 'MegaForm Submissions', formId: id, tab: 'entries' };
      }
      case 'analytics': {
        // Same grid, opened straight onto its report dialog (SubmissionsShell reads ?view=reports).
        const id = num(arg) || num(qsId);
        return { src: id > 0 ? `/umbraco/MegaForm/Submissions?formId=${id}&view=reports` : '/umbraco/MegaForm/Submissions?view=reports',
                 title: 'MegaForm Analytics', formId: id, tab: 'analytics' };
      }
      case 'form-settings': {
        // [FormSettings 2026-08-18] Its own screen, the way Umbraco Forms does it. It used to
        // open the whole builder and poke a rail tab through sessionStorage, so changing the
        // Submit caption meant loading a canvas, a palette and three toolbars first.
        const id = num(arg) || num(qsId);
        try { sessionStorage.removeItem('mf-builder-initial-tab'); } catch (_e) {}
        // [ToolbarCleanup 2026-08-18] Print and Rules are sections of Settings, but their
        // editors are builder panes and stay there. Opening one keeps the Settings tab
        // current: you have not left Settings, you are in one of its sections.
        const editors = { print: 'print', rules: 'rules' };
        const editor = editors[String(pane || '').toLowerCase()];
        if (editor && id > 0) {
          return { src: `/umbraco/MegaForm/Builder/${id}?host=umbraco-workspace&pane=${editor}`,
                   title: `MegaForm ${editor === 'print' ? 'Print Settings' : 'Rules'}`,
                   formId: id, tab: 'settings' };
        }
        return { native: 'megaform-form-settings-view', title: 'MegaForm Form Settings',
                 formId: id, tab: 'settings' };
      }
      case 'workflow': {
        // [ToolbarCleanup 2026-08-18] The BPMN editor, opened straight into its own tab. The
        // builder is what hosts the canvas; ?pane= tells it to open on that pane instead of
        // the field inspector, and survives the frame reload the workspace does on every tab
        // change (a sessionStorage handoff did not).
        const id = num(arg) || num(qsId);
        try { sessionStorage.removeItem('mf-builder-initial-tab'); } catch (_e) {}
        return { src: id > 0 ? `/umbraco/MegaForm/Builder/${id}?host=umbraco-workspace&pane=workflow`
                             : '/umbraco/MegaForm/Builder?host=umbraco-workspace',
                 title: 'MegaForm Workflow', formId: id, tab: 'workflow' };
      }
      case 'security':
        // Package permissions per Umbraco user group — the shape Umbraco Forms puts under
        // Security. Native, because it edits Umbraco's own user groups.
        return { native: 'megaform-security-view', title: 'MegaForm Security' };
      case 'prevalue-sources':
        // Native element, not a frame: this screen is administration and it authenticates
        // on the SPA's bearer token instead of the backoffice cookie the frames rely on.
        return { native: 'megaform-prevalue-sources-view', title: 'MegaForm Prevalue Sources' };
      case 'languages':
        return { src: '/umbraco/MegaForm/Languages', title: 'MegaForm Languages' };
      case 'settings':
        return { src: '/umbraco/MegaForm/Admin#settings', title: 'MegaForm Settings' };
      default:
        return { src: '/umbraco/MegaForm/Admin', title: 'MegaForm Dashboard' };
    }
  }

  render() {
    // The header is not rendered here: it is appended into Umbraco's own header band
    // (see #mountHeader), so the frame gets the whole of this element's height.
    // Native screens render in place; the rest keep the MVC frame.
    if (this._native === 'megaform-prevalue-sources-view') {
      return html`<megaform-prevalue-sources-view></megaform-prevalue-sources-view>`;
    }
    if (this._native === 'megaform-form-settings-view') {
      return html`<megaform-form-settings-view></megaform-form-settings-view>`;
    }
    if (this._native === 'megaform-security-view') {
      return html`<megaform-security-view></megaform-security-view>`;
    }
    return html`<iframe src="${this._src}" title="${this._title}" allow="fullscreen"></iframe>`;
  }
}

customElements.define('megaform-workspace-view', MegaFormWorkspaceView);
