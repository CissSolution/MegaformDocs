// ============================================================
// Umbraco Platform Adapter
// Uses Umbraco backoffice XSRF token auth
// ============================================================

import type { PlatformAdapter, InitContext } from '@core/platform';

export function createUmbracoAdapter(ctx: InitContext): PlatformAdapter {
  // TODO: Implement Umbraco-specific API client
  // Pattern identical to DNN adapter but:
  // - Auth: X-UMB-XSRF-TOKEN from cookie
  // - API base: /umbraco/api/megaform/
  // - Navigation: Umbraco backoffice router
  throw new Error('Umbraco adapter not yet implemented');
}
