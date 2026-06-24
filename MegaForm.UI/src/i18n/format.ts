// ============================================================
// MegaForm i18n — locale-aware formatting (Intl)
//
// Single source of truth for date / number / currency / plural formatting.
// All extraction streams MUST route through these instead of
// toLocaleDateString('en-US'), hardcoded '$'/USD, or English month arrays.
//   import { formatDate, formatNumber, formatCurrency, plural } from '@i18n/format';
// ============================================================
import { getLocale } from './index';

function activeLocale(locale?: string): string {
  try { return locale || getLocale() || 'en-US'; } catch { return locale || 'en-US'; }
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Locale date, e.g. en-US "6/10/2026", de-DE "10.6.2026", ar-SA Arabic digits. */
export function formatDate(
  value: Date | string | number | null | undefined,
  locale?: string,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' },
): string {
  const d = toDate(value);
  if (!d) return '';
  try { return new Intl.DateTimeFormat(activeLocale(locale), opts).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}

/** Locale time, e.g. "2:36 PM" / "14:36". */
export function formatTime(
  value: Date | string | number | null | undefined,
  locale?: string,
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  const d = toDate(value);
  if (!d) return '';
  try { return new Intl.DateTimeFormat(activeLocale(locale), opts).format(d); }
  catch { return ''; }
}

/** Locale date + time. */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale?: string,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
): string {
  const d = toDate(value);
  if (!d) return '';
  try { return new Intl.DateTimeFormat(activeLocale(locale), opts).format(d); }
  catch { return d.toISOString(); }
}

/** Locale number, e.g. de-DE "1.000,5", fr-FR "1 000,5", en-US "1,000.5". */
export function formatNumber(
  value: number | string | null | undefined,
  locale?: string,
  opts?: Intl.NumberFormatOptions,
): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n == null || !isFinite(Number(n))) return '';
  try { return new Intl.NumberFormat(activeLocale(locale), opts).format(Number(n)); }
  catch { return String(n); }
}

/** Locale currency, e.g. en-US "$1,000.50", de-DE "1.000,50 €". Defaults USD. */
export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'USD',
  locale?: string,
): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n == null || !isFinite(Number(n))) return '';
  try {
    return new Intl.NumberFormat(activeLocale(locale), { style: 'currency', currency: currency || 'USD' }).format(Number(n));
  } catch {
    return (currency || 'USD') + ' ' + String(n);
  }
}

/**
 * Locale plural category for `n` (Intl.PluralRules: zero/one/two/few/many/other).
 * Pass a map of category → string; falls back to 'other'.
 *   plural(n, locale, { one: '{n} item', other: '{n} items' })
 */
export function plural(
  n: number,
  locale: string | undefined,
  forms: Partial<Record<Intl.LDMLPluralRule, string>>,
): string {
  let cat: Intl.LDMLPluralRule = 'other';
  try { cat = new Intl.PluralRules(activeLocale(locale)).select(n); } catch { cat = 'other'; }
  const tpl = forms[cat] ?? forms.other ?? '';
  return tpl.replace(/\{n\}/g, String(n));
}

if (typeof window !== 'undefined') {
  (window as any).MegaFormFormat = { formatDate, formatTime, formatDateTime, formatNumber, formatCurrency, plural };
}
