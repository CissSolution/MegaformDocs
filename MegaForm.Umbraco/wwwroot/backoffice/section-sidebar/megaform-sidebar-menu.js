import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import { megaFormPermissions, mfFetch } from '../contexts/megaform-permissions-context.js';
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
    this._loadForms();
    megaFormPermissions.load().then(() => {
      this._permsReady = true;
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
  `;

  render() {
    return html`
      ${this._renderDashboardItem()}
      ${this._renderFormsTree()}
      ${this._renderSubmissionsItem()}
      ${this._renderLanguagesItem()}
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
    return html`
      <uui-menu-item
        label="Forms"
        ?has-children="${true}"
        ?expanded="${this._expanded}"
        @click="${() => (this._expanded = !this._expanded)}">
        <uui-icon slot="icon" name="icon-folder"></uui-icon>
        ${this._expanded ? this._renderFormItems() : ''}
      </uui-menu-item>
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
              href="/umbraco/section/megaform/view/builder/new"
              @click="${this._navigate}">
              <uui-icon slot="icon" name="icon-add"></uui-icon>
            </uui-menu-item>
          `
        : ''}
      ${this._forms.map((f) => this._renderFormItem(f))}
    `;
  }

  _renderFormItem(f) {
    const canEdit = megaFormPermissions.has('MegaForm.Form.Edit');
    const canViewSubmissions = megaFormPermissions.has('MegaForm.Submission.Read');
    const canManageWorkflow = megaFormPermissions.has('MegaForm.Workflow.Manage');
    const canDelete = megaFormPermissions.has('MegaForm.Form.Delete');

    return html`
      <uui-menu-item
        label="${f.title} (#${f.formId})"
        ?has-children="${true}"
        href="/umbraco/section/megaform/view/builder/${f.formId}"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-umb-contour"></uui-icon>
        ${canEdit
          ? html`
              <uui-menu-item
                label="Edit"
                href="/umbraco/section/megaform/view/builder/${f.formId}"
                @click="${this._navigate}">
                <uui-icon slot="icon" name="icon-edit"></uui-icon>
              </uui-menu-item>
            `
          : ''}
        ${canViewSubmissions
          ? html`
              <uui-menu-item
                label="Submissions"
                href="/umbraco/section/megaform/view/submissions?formId=${f.formId}"
                @click="${this._navigate}">
                <uui-icon slot="icon" name="icon-inbox"></uui-icon>
              </uui-menu-item>
              <uui-menu-item
                label="Export CSV"
                @click="${(e) => this._exportCsv(e, f)}">
                <uui-icon slot="icon" name="icon-download"></uui-icon>
              </uui-menu-item>
            `
          : ''}
        ${canManageWorkflow
          ? html`
              <uui-menu-item
                label="Workflow"
                href="/umbraco/section/megaform/view/workflow/${f.formId}"
                @click="${this._navigate}">
                <uui-icon slot="icon" name="icon-wand"></uui-icon>
              </uui-menu-item>
            `
          : ''}
        ${megaFormPermissions.has('MegaForm.Security.ManagePermissions')
          ? html`
              <uui-menu-item
                label="Permissions"
                @click="${(e) => this._openPermissions(e, f)}">
                <uui-icon slot="icon" name="icon-lock"></uui-icon>
              </uui-menu-item>
            `
          : ''}
        ${canDelete
          ? html`
              <uui-menu-item
                label="Delete"
                @click="${(e) => this._confirmDelete(e, f)}">
                <uui-icon slot="icon" name="icon-delete"></uui-icon>
              </uui-menu-item>
            `
          : ''}
      </uui-menu-item>
    `;
  }

  _renderSubmissionsItem() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Submission.Read')) return '';
    return html`
      <uui-menu-item
        label="Submissions"
        href="/umbraco/section/megaform/view/submissions"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-inbox"></uui-icon>
      </uui-menu-item>
    `;
  }

  _renderLanguagesItem() {
    if (!this._permsReady || !megaFormPermissions.has('MegaForm.Language.Manage')) return '';
    return html`
      <uui-menu-item
        label="Languages"
        href="/umbraco/section/megaform/view/languages"
        @click="${this._navigate}">
        <uui-icon slot="icon" name="icon-globe"></uui-icon>
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
      const response = await mfFetch('/umbraco/MegaForm/MegaFormApi/Form/List', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const forms = await response.json();
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
