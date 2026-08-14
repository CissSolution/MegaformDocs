import { megaFormPermissions } from '../contexts/megaform-permissions-context.js';

/**
 * Bellissima extension condition that permits an extension only when the current
 * user has the specified MegaForm permission identifier.
 *
 * Usage in a manifest condition:
 *   conditions: [
 *     {
 *       alias: 'MegaForm.Condition.Permission',
 *       config: { permission: 'MegaForm.Form.Browse' }
 *     }
 *   ]
 */
export default class MegaFormPermissionCondition {
  constructor(host, args) {
    this.permitted = false;

    const permission = args?.config?.permission;
    if (!permission) {
      // eslint-disable-next-line no-console
      console.warn('[MegaForm.PermissionCondition] No permission configured.');
      return;
    }

    megaFormPermissions.load().then(() => {
      this.permitted = megaFormPermissions.has(permission);
    });
  }
}

// Backwards-compatible named export for any code-based manifest registrations.
export const api = MegaFormPermissionCondition;
export const manifest = {
  type: 'condition',
  alias: 'MegaForm.Condition.Permission',
  name: 'MegaForm Permission Condition',
  api: MegaFormPermissionCondition,
};
