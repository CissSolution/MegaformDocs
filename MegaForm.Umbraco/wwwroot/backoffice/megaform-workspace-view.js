import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { mfFetchJson, setMegaFormAuthContext } from './contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

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
export default class MegaFormWorkspaceView extends UmbLitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
    iframe { display: block; width: 100%; flex: 1 1 auto; min-height: 0; border: 0; }

    /* Workspace header: form name + the tabs that act on that form, the shape Umbraco Forms
       uses (Design / Entries / Analytics / Settings). It only appears once a form is open —
       the dashboard and the languages screen are not about one form. */
    .mf-ws-head {
      display: flex; align-items: center; gap: var(--uui-size-space-4, 12px);
      padding: 10px 16px 0; background: var(--uui-color-surface, #fff);
      border-bottom: 1px solid var(--uui-color-border, #e2e8f0);
    }
    .mf-ws-name {
      font-size: 14px; font-weight: 700; color: var(--uui-color-text, #0f172a);
      padding-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 320px;
    }
    .mf-ws-name em { font-style: normal; font-weight: 400; opacity: .6; margin-left: 6px; }
    .mf-ws-tabs { display: flex; gap: 2px; }
    .mf-ws-tab {
      appearance: none; border: 0; background: none; cursor: pointer; font: inherit;
      font-size: 13px; font-weight: 600; color: var(--uui-color-text-alt, #64748b);
      padding: 8px 14px 10px; border-bottom: 3px solid transparent;
      display: inline-flex; align-items: center; gap: 7px;
    }
    .mf-ws-tab:hover { color: var(--uui-color-text, #0f172a); }
    .mf-ws-tab[aria-current='page'] {
      color: var(--uui-color-text, #0f172a);
      border-bottom-color: var(--uui-color-focus, #3544b1);
    }
  `;

  static properties = {
    _src: { state: true }, _title: { state: true },
    _formId: { state: true }, _tab: { state: true }, _formName: { state: true },
  };

  constructor() {
    super();
    const r = MegaFormWorkspaceView.resolve();
    this._src = r.src;
    this._title = r.title;
    this._formId = r.formId || 0;
    this._tab = r.tab || '';
    this._formName = '';

    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this.#loadFormName();
    });

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
      if (next.src !== this._src) { this._src = next.src; this._title = next.title; }
    };
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

  connectedCallback() {
    super.connectedCallback();
    // pushState does not fire popstate in the tab that called it, and Umbraco's router navigates
    // that way, so listen for both.
    window.addEventListener('popstate', this.#onNav);
    window.addEventListener('umb:route-change', this.#onNav);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.#onNav);
    window.removeEventListener('umb:route-change', this.#onNav);
    super.disconnectedCallback();
  }

  static resolve() {
    const m = /\/view\/open\/([^?#]*)/i.exec(window.location.pathname);
    const rest = (m ? m[1] : '').replace(/^\/+|\/+$/g, '');
    const [what, arg] = rest.split('/');
    const qsId = new URLSearchParams(window.location.search).get('formId') || '';
    const num = (v) => (/^\d+$/.test(v || '') ? Number(v) : 0);

    switch ((what || '').toLowerCase()) {
      case 'builder': {
        const id = num(arg);
        // Leaving the builder for another tab must not leave a stale rail selection behind.
        try { sessionStorage.removeItem('mf-builder-initial-tab'); } catch (_e) {}
        return { src: id > 0 ? `/umbraco/MegaForm/Builder/${id}` : '/umbraco/MegaForm/Builder',
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
        // The builder holds form settings in its right rail; it activates a rail tab from
        // sessionStorage on first paint, and a same-origin iframe shares that storage with us.
        const id = num(arg) || num(qsId);
        try { sessionStorage.setItem('mf-builder-initial-tab', 'settings'); } catch (_e) {}
        return { src: id > 0 ? `/umbraco/MegaForm/Builder/${id}` : '/umbraco/MegaForm/Builder',
                 title: 'MegaForm Form Settings', formId: id, tab: 'settings' };
      }
      case 'languages':
        return { src: '/umbraco/MegaForm/Languages', title: 'MegaForm Languages' };
      case 'settings':
        return { src: '/umbraco/MegaForm/Admin#settings', title: 'MegaForm Settings' };
      default:
        return { src: '/umbraco/MegaForm/Admin', title: 'MegaForm Dashboard' };
    }
  }

  render() {
    return html`
      ${this.#renderHead()}
      <iframe src="${this._src}" title="${this._title}" allow="fullscreen"></iframe>
    `;
  }

  #renderHead() {
    if (!(this._formId > 0)) return nothing;

    const tabs = [
      ['design',    'builder',       'icon-brush',      'Design'],
      ['entries',   'submissions',   'icon-inbox',      'Entries'],
      ['analytics', 'analytics',     'icon-chart-curve','Analytics'],
      ['settings',  'form-settings', 'icon-settings',   'Settings'],
    ];

    return html`
      <div class="mf-ws-head">
        <span class="mf-ws-name">
          ${this._formName || 'Form'}<em>#${this._formId}</em>
        </span>
        <div class="mf-ws-tabs">
          ${tabs.map(([key, route, icon, label]) => html`
            <button
              type="button"
              class="mf-ws-tab"
              aria-current="${this._tab === key ? 'page' : 'false'}"
              @click="${() => this.#go(route)}">
              <uui-icon name="${icon}"></uui-icon>${label}
            </button>
          `)}
        </div>
      </div>
    `;
  }
}

customElements.define('megaform-workspace-view', MegaFormWorkspaceView);
