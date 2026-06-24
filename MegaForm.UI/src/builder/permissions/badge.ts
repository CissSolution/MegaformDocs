// [PermissionsMatrix v20260502-09] Bumped to advertise the new matrix-style
// access editor (rows = principals, columns = permissions) replacing the
// legacy rule-card editor. Catalog data shape unchanged — only the UI.
export const BUILDER_PERMISSIONS_BADGE = 'PermissionsMatrix v20260502-09';

if (typeof window !== 'undefined') {
  (window as any).__MF_BUILDER_PERMISSIONS_BADGE__ = BUILDER_PERMISSIONS_BADGE;
}
