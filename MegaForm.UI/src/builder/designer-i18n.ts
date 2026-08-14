// ============================================================
// [DesignerI18n v20260706] Shared translate-with-fallback helper for the builder's
// field / token designers (composite / slider / map / imagechoice / video / token shell).
//
// Reads the canonical i18n catalog via @i18n `t()`. Renders the inline English `fallback`
// if the key is somehow absent (typo / not yet in the catalog), so a missing key never
// surfaces as a raw "des.xxx" token in the admin UI. Usage:
//   import { wt } from './designer-i18n';
//   wt('des.comp.addPart', 'Add Part')
//   wt('des.comp.min_n', 'Minimum {n}', { n: 3 })
// ============================================================
import { t as i18nT } from '@i18n';

export function wt(key: string, fallback: string, params?: Record<string, string | number>): string {
  const v = i18nT(key, params);
  return (!v || v === key) ? fallback : v;
}
