import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import { css, html } from '@umbraco-cms/backoffice/external/lit';

/**
 * Modal for assigning MegaForm granular permissions to user groups for a single form.
 *
 * Data:  { formId: number, formTitle: string }
 * Value: { saved: boolean }
 */
export class MegaFormFormPermissionsModalElement extends UmbModalBaseElement {
  static properties = {
    _formId: { type: Number, state: true },
    _formTitle: { type: String, state: true },
    _assignable: { type: Array, state: true },
    _assignments: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _saving: { type: Boolean, state: true },
    _error: { type: String, state: true },
  };

  constructor() {
    super();
    this._formId = this.data?.formId ?? 0;
    this._formTitle = this.data?.formTitle ?? `Form #${this._formId}`;
    this._assignable = [];
    this._assignments = [];
    this._loading = true;
    this._saving = false;
    this._error = '';
    this._load();
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .header {
      padding: 1rem;
      border-bottom: 1px solid var(--uui-color-border, #e5e5e5);
    }
    .body {
      flex: 1;
      overflow: auto;
      padding: 1rem;
    }
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding: 1rem;
      border-top: 1px solid var(--uui-color-border, #e5e5e5);
    }
    .error {
      color: var(--uui-color-danger, #dc2626);
      margin-bottom: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 0.5rem;
      border-bottom: 1px solid var(--uui-color-border, #e5e5e5);
    }
    th {
      font-weight: 600;
      white-space: nowrap;
    }
    td {
      vertical-align: middle;
    }
    .checkbox-cell {
      text-align: center;
    }
    .permission-label {
      display: block;
      font-size: 0.75rem;
      max-width: 8rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  render() {
    return html`
      <div class="header">
        <h3>Permissions for ${this._formTitle}</h3>
        <p>Assign user-group permissions for this form. Global default permissions are also effective.</p>
      </div>

      <div class="body">
        ${this._error ? html`<p class="error">${this._error}</p>` : ''}

        ${this._loading
          ? html`<uui-loader></uui-loader>`
          : html`
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    ${this._assignable.map((p) => html`<th><span class="permission-label" title="${p}">${this._shortName(p)}</span></th>`)}
                  </tr>
                </thead>
                <tbody>
                  ${this._assignments.map((a, idx) => html`
                    <tr>
                      <td>${a.groupName}</td>
                      ${this._assignable.map((p) => html`
                        <td class="checkbox-cell">
                          <uui-checkbox
                            .checked="${a.permissions.includes(p)}"
                            @change="${(e) => this._togglePermission(idx, p, e.target.checked)}">
                          </uui-checkbox>
                        </td>
                      `)}
                    </tr>
                  `)}
                </tbody>
              </table>
            `}
      </div>

      <div class="footer">
        <uui-button label="Cancel" look="secondary" @click="${this._cancel}" ?disabled="${this._saving}"></uui-button>
        <uui-button label="Save" look="primary" color="positive" @click="${this._save}" ?disabled="${this._loading || this._saving}"></uui-button>
      </div>
    `;
  }

  _shortName(permission) {
    const parts = permission.split('.');
    return parts[parts.length - 1];
  }

  _togglePermission(index, permission, checked) {
    const assignment = this._assignments[index];
    if (checked) {
      if (!assignment.permissions.includes(permission)) {
        assignment.permissions.push(permission);
      }
    } else {
      assignment.permissions = assignment.permissions.filter((p) => p !== permission);
    }
    this.requestUpdate();
  }

  async _load() {
    try {
      this._loading = true;
      const response = await fetch(`/umbraco/MegaForm/MegaFormApi/FormPermissionAssignments?formId=${this._formId}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._assignable = Array.isArray(data.assignablePermissions) ? data.assignablePermissions : [];
      this._assignments = (data.assignments || []).map((a) => ({
        groupKey: a.groupKey,
        groupAlias: a.groupAlias,
        groupName: a.groupName,
        permissions: Array.isArray(a.permissions) ? a.permissions : [],
      }));
    } catch (err) {
      this._error = `Failed to load assignments: ${err.message}`;
      // eslint-disable-next-line no-console
      console.error('[MegaForm.PermissionsModal] Load failed', err);
    } finally {
      this._loading = false;
    }
  }

  async _save() {
    try {
      this._saving = true;
      const payload = {
        formId: this._formId,
        assignments: this._assignments.map((a) => ({
          groupKey: a.groupKey,
          groupAlias: a.groupAlias,
          groupName: a.groupName,
          permissions: a.permissions,
        })),
      };

      const response = await fetch('/umbraco/MegaForm/MegaFormApi/FormPermissionAssignments', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `HTTP ${response.status}`);
      }

      this.value = { saved: true };
      this.modalContext?.submit();
    } catch (err) {
      this._error = `Failed to save assignments: ${err.message}`;
      // eslint-disable-next-line no-console
      console.error('[MegaForm.PermissionsModal] Save failed', err);
    } finally {
      this._saving = false;
    }
  }

  _cancel() {
    this.value = { saved: false };
    this.modalContext?.reject();
  }
}

customElements.define('megaform-form-permissions-modal', MegaFormFormPermissionsModalElement);
export default MegaFormFormPermissionsModalElement;
