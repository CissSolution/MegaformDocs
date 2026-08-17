import { megaFormPermissions, setMegaFormAuthContext } from '../contexts/megaform-permissions-context.js';
import { UmbContextConsumerController } from '@umbraco-cms/backoffice/context-api';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

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

    // This condition often runs before any MegaForm element exists, so it is also the earliest
    // chance to hand the auth context to the shared fetch helper — otherwise the permission
    // load goes out on the backoffice cookie alone and returns nothing once that has timed out,
    // which hides every MegaForm menu item instead of reporting an error.
    try {
      new UmbContextConsumerController(host, UMB_AUTH_CONTEXT, (auth) => setMegaFormAuthContext(auth));
    } catch (e) {
      // No controller host: fall back to whatever another element registers.
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
