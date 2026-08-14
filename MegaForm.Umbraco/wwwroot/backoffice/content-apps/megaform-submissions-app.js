import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import { UMB_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/workspace';

/**
 * Native Bellissima Content App for MegaForm.
 * Shows a summary of the MegaForm linked to the current document workspace.
 */
export class MegaFormSubmissionsAppElement extends UmbLitElement {
  static properties = {
    _contentId: { type: Number, state: true },
    _data: { type: Object, state: true },
    _loading: { type: Boolean, state: true },
    _error: { type: String, state: true },
  };

  constructor() {
    super();
    this._contentId = 0;
    this._data = null;
    this._loading = true;
    this._error = '';

    this.consumeContext(UMB_WORKSPACE_CONTEXT, (workspaceContext) => {
      this._observeWorkspace(workspaceContext);
    });
  }

  _observeWorkspace(workspaceContext) {
    if (!workspaceContext) return;

    // Workspace unique id may be a GUID string; try to map to integer content id.
    this.observe(workspaceContext.unique, (unique) => {
      const numericId = this._extractNumericId(unique);
      if (numericId && numericId !== this._contentId) {
        this._contentId = numericId;
        this._loadInfo();
      }
    });
  }

  _extractNumericId(unique) {
    if (unique == null) return 0;
    const asString = String(unique);
    const match = asString.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  static styles = css`
    :host {
      display: block;
      padding: var(--uui-size-space-4, 1rem);
    }
    .empty,
    .error {
      color: var(--uui-color-text-alt, #64748b);
    }
    .error {
      color: var(--uui-color-danger, #dc2626);
    }
    .header {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3, 0.75rem);
      margin-bottom: var(--uui-size-space-4, 1rem);
    }
    .badge {
      background: var(--uui-color-surface-alt, #e2e8f0);
      color: var(--uui-color-text-alt, #475569);
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    uui-table {
      margin-bottom: var(--uui-size-space-4, 1rem);
    }
    .actions {
      display: flex;
      gap: var(--uui-size-space-3, 0.5rem);
    }
  `;

  render() {
    if (this._loading) {
      return html`<p class="empty">Loading MegaForm summary…</p>`;
    }

    if (this._error) {
      return html`<p class="error">Unable to load MegaForm summary: ${this._error}</p>`;
    }

    if (!this._data) {
      return html`<p class="empty">No MegaForm data available.</p>`;
    }

    if (!this._data.configured) {
      return html`
        <uui-box headline="MegaForm">
          <p>No MegaForm is configured for this content item.</p>
          <uui-button
            look="primary"
            href="/umbraco/section/megaform/view/dashboard"
            target="_blank"
            label="Open MegaForm Dashboard">
          </uui-button>
        </uui-box>
      `;
    }

    const recentRows = (this._data.recentSubmissions || []).map(
      (s) => html`
        <uui-table-row>
          <uui-table-cell>#${s.submissionId}</uui-table-cell>
          <uui-table-cell>${s.status || 'new'}</uui-table-cell>
          <uui-table-cell>
            ${s.submittedOnUtc ? new Date(s.submittedOnUtc).toLocaleString() : '-'}
          </uui-table-cell>
        </uui-table-row>
      `
    );

    return html`
      <uui-box headline="${this._data.formTitle || `Form #${this._data.formId}`}">
        <div slot="header" class="header">
          <span class="badge">${this._data.viewType || 'submit'}</span>
        </div>

        <p>
          <strong>${this._data.submissionsTotal || 0}</strong> total submissions
        </p>

        <uui-table>
          <uui-table-head>
            <uui-table-head-cell>ID</uui-table-head-cell>
            <uui-table-head-cell>Status</uui-table-head-cell>
            <uui-table-head-cell>Submitted</uui-table-head-cell>
          </uui-table-head>
          <uui-table-body>
            ${recentRows.length
              ? recentRows
              : html`
                  <uui-table-row>
                    <uui-table-cell colspan="3">No submissions yet.</uui-table-cell>
                  </uui-table-row>
                `}
          </uui-table-body>
        </uui-table>

        <div class="actions">
          <uui-button
            look="primary"
            href="/umbraco/section/megaform/view/submissions?formId=${this._data.formId}"
            target="_blank"
            label="View Submissions">
          </uui-button>
          <uui-button
            look="secondary"
            href="/umbraco/section/megaform/view/builder/${this._data.formId}"
            target="_blank"
            label="Edit Form">
          </uui-button>
        </div>
      </uui-box>
    `;
  }

  async _loadInfo() {
    if (!this._contentId) {
      this._loading = false;
      return;
    }

    try {
      this._loading = true;
      const res = await fetch(
        `/umbraco/MegaForm/MegaFormApi/ContentApp/Info?contentId=${this._contentId}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._data = await res.json();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }
}

customElements.define('megaform-submissions-app', MegaFormSubmissionsAppElement);
export default MegaFormSubmissionsAppElement;
