import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import { megaFormPermissions, mfFetch, mfFetchJson, setMegaFormAuthContext } from '../contexts/megaform-permissions-context.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { UMB_MODAL_MANAGER_CONTEXT } from '@umbraco-cms/backoffice/modal';
import { MEGAFORM_FORM_PERMISSIONS_MODAL } from '../modals/megaform-form-permissions-modal-token.js';

/**
 * MegaForm section sidebar menu.
 * Renders a dynamic list of forms plus static links to Dashboard, Submissions and Languages.
 * Items are hidden when the current user does not have the matching MegaForm permission.
 */
export class MegaFormSidebarMenuElement extends UmbLitElement {
  static properties = {
    _forms: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _error: { type: String, state: true },
    _expanded: { type: Boolean, state: true },
    _permsReady: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this._forms = [];
    this._loading = true;
    this._error = '';
    this._expanded = true;
    this._permsReady = false;
    this._modalManager = null;

    // Hand the backoffice auth context to the shared fetch helper before loading anything:
    // Umbraco 17 holds the token in memory, so without this every call falls back to the
    // backoffice cookie and starts failing as soon as that cookie times out.
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      setMegaFormAuthContext(auth);
      this._loadForms();
      megaFormPermissions.load().then(() => {
        this._permsReady = true;
      });
    });
    this.consumeContext(UMB_MODAL_MANAGER_CONTEXT, (manager) => {
      this._modalManager = manager;
    });
  }

  static styles = css`
    :host {
      display: block;
    }
    .error {
      color: var(--uui-color-danger, #dc2626);
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    /* The action menu behind "...", built from the same surface tokens the back office
       uses for its own popovers so it does not read as a foreign panel. */
    .mf-actions {
      display: flex;
      flex-direction: column;
      min-width: 220px;
      padding: var(--uui-size-space-2, 6px) 0;
      background: var(--uui-color-surface, #fff);
      border-radius: var(--uui-border-radius, 3px);
      box-shadow: var(--uui-shadow-depth-3, 0 10px 30px rgba(0, 0, 0, 0.16));
    }
    .mf-actions-title {
      padding: 4px var(--uui-size-space-4, 12px) 8px;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--uui-color-text-alt, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .mf-actions-title em {
      font-style: normal;
      font-weight: 400;
      opacity: 0.7;
    }
    .mf-action {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 9px);
      width: 100%;
      padding: 8px var(--uui-size-space-4, 12px);
      border: 0;
      background: none;
      font: inherit;
      font-size: 0.875rem;
      color: var(--uui-color-text, #1e293b);
      text-align: left;
      cursor: pointer;
    }
    .mf-action:hover {
      background: var(--uui-color-surface-alt, #f4f4f6);
    }
    .mf-action.danger {
      color: var(--uui-color-danger, #d42054);
    }
  `;

  render() {
    return html`
      ${this._renderDashboardItem()}
      ${this._renderFormsTree()}
      ${this._renderSubmissionsItem()}
      ${this._renderPrevalueSourcesItem()}
      ${this._renderLanguagesItem()}
      ${this._renderSettingsItem()}
    `;
  }

  _renderDashboardItem() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Form.Browse')) return '';
    return html`
      <uui-menu-item
        label="Dashboard"
        href="/umbraco/section/megaform/dashboard/megaform-dashboard"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-home"></uui-icon>
      </uui-menu-item>
    `;
  }

  _renderFormsTree() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Form.Browse')) return '';
    const canCreate = megaFormPermissions.has('MegaForm.Form.Create');
    const closeRoot = () => this._closeActionMenus();

    return html`
      <!--
        [uui-menu-item 2026-08-16] The expansion property is show-children, NOT expanded.
        With ?expanded the attribute was simply ignored: the forms were rendered into the
        slot on every pass and the component kept them hidden, so the tree counted 17 items
        in its shadow root while the caret never opened. Nothing errored — the branch just
        looked permanently empty. The component also raises show-children / hide-children
        when its own caret is used, which the bare @click handler below could not see.
      -->
      <uui-menu-item
        label="Forms"
        ?has-children="${true}"
        ?show-children="${this._expanded}"
        @show-children="${() => (this._expanded = true)}"
        @hide-children="${() => (this._expanded = false)}"
        @click-label="${() => (this._expanded = !this._expanded)}">
        <uui-icon slot="icon" name="icon-folder"></uui-icon>
        <uui-action-bar slot="actions">
          <uui-button compact label="Open actions for Forms" popovertarget="mf-actions-root" @click="${this._stop}">
            <uui-symbol-more></uui-symbol-more>
          </uui-button>
        </uui-action-bar>
        ${this._expanded ? this._renderFormItems() : ''}
      </uui-menu-item>
      <uui-popover-container id="mf-actions-root" placement="bottom-end">
        <div class="mf-actions">
          <span class="mf-actions-title">Forms</span>
          ${canCreate
            ? html`
                <button
                  type="button"
                  class="mf-action"
                  @click="${() => {
                    closeRoot();
                    window.history.pushState({}, '', '/umbraco/section/megaform/view/open/builder/new');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}">
                  <uui-icon name="icon-add"></uui-icon><span>Create form…</span>
                </button>
              `
            : ''}
          <button type="button" class="mf-action" @click="${() => { closeRoot(); this._loadForms(); }}">
            <uui-icon name="icon-refresh"></uui-icon><span>Reload</span>
          </button>
        </div>
      </uui-popover-container>
    `;
  }

  _renderFormItems() {
    if (this._loading) {
      return html`<uui-loader></uui-loader>`;
    }

    if (this._error) {
      return html`<p class="error">${this._error}</p>`;
    }

    const canCreate = megaFormPermissions.has('MegaForm.Form.Create');

    if (this._forms.length === 0 && !canCreate) {
      return html`
        <uui-menu-item disabled label="No forms yet">
          <uui-icon slot="icon" name="icon-info"></uui-icon>
        </uui-menu-item>
      `;
    }

    return html`
      ${canCreate
        ? html`
            <uui-menu-item
              label="Create form"
              href="/umbraco/section/megaform/view/open/builder/new"
              @click="${this._navigate}">
              <uui-icon slot="icon" name="icon-add"></uui-icon>
            </uui-menu-item>
          `
        : ''}
      ${this._forms.map((f) => this._renderFormItem(f))}
    `;
  }

  /**
   * One form = one leaf node, exactly like a form in Umbraco's own Forms tree: clicking the
   * label opens it, and everything you can DO to it lives behind the "..." action menu.
   *
   * It used to hang Edit/Submissions/Export/Workflow/Permissions/Delete off the node as child
   * items, so every form looked like a folder holding six things, the tree grew six rows per
   * form when opened, and "expand" meant "show the verbs" instead of "show what is inside" —
   * the opposite of what the same triangle does everywhere else in the back office.
   */
  _renderFormItem(f) {
    const popoverId = `mf-actions-${f.formId}`;

    return html`
      <uui-menu-item
        label="${f.title}"
        href="/umbraco/section/megaform/view/open/builder/${f.formId}"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-umb-contour"></uui-icon>
        <uui-action-bar slot="actions">
          <uui-button
            compact
            label="Open actions for ${f.title}"
            popovertarget="${popoverId}"
            @click="${this._stop}">
            <uui-symbol-more></uui-symbol-more>
          </uui-button>
        </uui-action-bar>
      </uui-menu-item>
      <uui-popover-container id="${popoverId}" placement="bottom-end">
        <div class="mf-actions">
          <span class="mf-actions-title">${f.title} <em>#${f.formId}</em></span>
          ${this._renderFormActions(f, popoverId)}
        </div>
      </uui-popover-container>
    `;
  }

  /**
   * Closes every open action menu. Hiding only the one that was clicked left it on screen
   * after an action navigated: the component re-renders on the route change and the reopened
   * container came back visible, so the menu sat over the tree until the next click.
   */
  _closeActionMenus() {
    this.renderRoot.querySelectorAll('uui-popover-container').forEach((popover) => {
      try {
        popover.hidePopover?.();
      } catch (e) {
        // Not open — hidePopover throws on a container that was never shown.
      }
    });
  }

  _renderFormActions(f, popoverId) {
    const close = () => this._closeActionMenus();
    // Same SPA navigation _navigate() performs, without faking an anchor event for it.
    const go = (href) => () => {
      close();
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
    const run = (fn) => (e) => { close(); fn(e); };

    const actions = [
      ['MegaForm.Form.Edit', 'icon-edit', 'Design', go(`/umbraco/section/megaform/view/open/builder/${f.formId}`)],
      ['MegaForm.Submission.Read', 'icon-inbox', 'View entries', go(`/umbraco/section/megaform/view/open/submissions?formId=${f.formId}`)],
      ['MegaForm.Submission.Read', 'icon-download', 'Export entries (CSV)', run((e) => this._exportCsv(e, f))],
      ['MegaForm.Form.Create', 'icon-documents', 'Duplicate…', run((e) => this._duplicate(e, f))],
      ['MegaForm.Security.ManagePermissions', 'icon-lock', 'Permissions…', run((e) => this._openPermissions(e, f))],
      ['MegaForm.Form.Delete', 'icon-delete', 'Delete…', run((e) => this._confirmDelete(e, f))],
    ];

    return actions
      .filter(([permission]) => megaFormPermissions.has(permission))
      .map(
        ([, icon, label, handler]) => html`
          <button type="button" class="mf-action ${label.startsWith('Delete') ? 'danger' : ''}" @click="${handler}">
            <uui-icon name="${icon}"></uui-icon><span>${label}</span>
          </button>
        `,
      );
  }

  _stop(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  async _duplicate(event, form) {
    event.preventDefault();
    event.stopPropagation();

    try {
      const response = await mfFetch(`/umbraco/MegaForm/MegaFormApi/Form/Duplicate?formId=${form.formId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const created = await response.json();
      await this._loadForms();

      // Open the copy straight away: an editor duplicates a form in order to change it, and a
      // tree that only grows one more row leaves them hunting for which row is the new one.
      if (created?.formId) {
        const href = `/umbraco/section/megaform/view/open/builder/${created.formId}`;
        window.history.pushState({}, '', href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[MegaForm.SidebarMenu] Failed to duplicate form', err);
      alert(`Failed to duplicate form: ${err.message}`);
    }
  }

  _renderSubmissionsItem() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Submission.Read')) return '';
    return html`
      <uui-menu-item
        label="Submissions"
        href="/umbraco/section/megaform/view/open/submissions"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-inbox"></uui-icon>
      </uui-menu-item>
    `;
  }

  /**
   * [PrevalueSources 2026-08-17] The shared option lists, beside Umbraco Forms' own
   * "Prevalue Sources" node in shape and in purpose: a catalog many forms point at,
   * maintained in one place rather than copied into each field.
   */
  _renderPrevalueSourcesItem() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Form.Browse')) return '';
    return html`
      <uui-menu-item
        label="Prevalue Sources"
        href="/umbraco/section/megaform/view/open/prevalue-sources"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-list"></uui-icon>
      </uui-menu-item>
    `;
  }

  _renderLanguagesItem() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Language.Manage')) return '';
    return html`
      <uui-menu-item
        label="Languages"
        href="/umbraco/section/megaform/view/open/languages"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-globe"></uui-icon>
      </uui-menu-item>
    `;
  }

  _renderSettingsItem() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Form.Browse')) return '';
    return html`
      <uui-menu-item
        label="Settings"
        href="/umbraco/section/megaform/view/open/settings"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-settings"></uui-icon>
      </uui-menu-item>
    `;
  }

  _navigate(event) {
    const href = event.currentTarget.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();
    // Navigate within the Umbraco backoffice SPA
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  _openPermissions(event, form) {
    event.preventDefault();
    event.stopPropagation();

    if (!this._modalManager) {
      // eslint-disable-next-line no-console
      console.warn('[MegaForm.SidebarMenu] Modal manager not available.');
      return;
    }

    const modal = this._modalManager.open(this, MEGAFORM_FORM_PERMISSIONS_MODAL, {
      data: { formId: form.formId, formTitle: form.title },
    });

    modal?.onSubmit().then(() => {
      // Permissions saved; the context cache for this form is now stale.
      megaFormPermissions.loadForForm(form.formId);
    }).catch(() => {
      // Cancelled.
    });
  }

  async _confirmDelete(event, form) {
    event.preventDefault();
    event.stopPropagation();

    const hasPerm = await megaFormPermissions.hasForForm('MegaForm.Form.Delete', form.formId);
    if (!hasPerm) {
      alert('You do not have permission to delete this form.');
      return;
    }

    if (!confirm(`Delete form "${form.title}"? This cannot be undone.`)) return;

    try {
      const response = await mfFetch('/umbraco/MegaForm/MegaFormApi/Form/Delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ formId: form.formId.toString() }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this._loadForms();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[MegaForm.SidebarMenu] Failed to delete form', err);
      alert(`Failed to delete form: ${err.message}`);
    }
  }

  async _exportCsv(event, form) {
    event.preventDefault();
    event.stopPropagation();

    try {
      const response = await mfFetch(`/umbraco/MegaForm/MegaFormApi/Submissions/Export?formId=${form.formId}&format=csv`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'text/csv,application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `submissions-form${form.formId}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[MegaForm.SidebarMenu] Failed to export CSV', err);
      alert(`Failed to export CSV: ${err.message}`);
    }
  }

  async _loadForms() {
    try {
      this._loading = true;
      const forms = await mfFetchJson('/umbraco/MegaForm/MegaFormApi/Form/List');
      this._forms = Array.isArray(forms) ? forms : [];
    } catch (error) {
      this._error = `Unable to load forms (${error.message})`;
      // eslint-disable-next-line no-console
      console.error('[MegaForm.SidebarMenu] Failed to load forms', error);
    } finally {
      this._loading = false;
    }
  }
}

customElements.define('megaform-sidebar-menu', MegaFormSidebarMenuElement);
export default MegaFormSidebarMenuElement;
