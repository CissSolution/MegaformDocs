// ============================================================
// MegaForm Admin Live Style Editor — CSS Utilities
// ============================================================

export function getCssVar(el: HTMLElement, varName: string): string {
  return getComputedStyle(el).getPropertyValue(varName).trim();
}

export function setCssVar(el: HTMLElement, varName: string, value: string): void {
  el.style.setProperty(varName, value);
}

export function removeCssVar(el: HTMLElement, varName: string): void {
  el.style.removeProperty(varName);
}

export function clearCssVars(el: HTMLElement, vars: string[]): void {
  vars.forEach(v => el.style.removeProperty(v));
}

export function toHex(val: string): string {
  if (!val) return '#000000';
  val = val.trim();
  if (/^#[0-9a-f]{6}$/i.test(val)) return val.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(val)) {
    const [, r, g, b] = val;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

export function getFirstPx(val: string): number {
  const m = String(val).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/** Collect inline CSS var overrides from an element */
export function collectInlineVars(el: HTMLElement, vars: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  vars.forEach(v => {
    const val = el.style.getPropertyValue(v).trim();
    if (val) result[v] = val;
  });
  return result;
}

/**
 * Build a combined CSS override string from wrapper + inner vars.
 * Format: .mf-form-wrapper{...} .mf-form-inner{...}
 */
export function buildCssOverride(
  wrapperVars: Record<string, string>,
  innerVars: Record<string, string>,
): string {
  let css = '';
  const we = Object.entries(wrapperVars);
  const ie = Object.entries(innerVars);
  if (we.length) css += `.mf-form-wrapper{${we.map(([k, v]) => `${k}:${v}`).join(';')}}`;
  if (ie.length) css += `.mf-form-inner{${ie.map(([k, v]) => `${k}:${v}`).join(';')}}`;

  // CRITICAL: override mọi hardcode trong template CSS (mfp-*, v.v.)
  // Template dùng display:flex nên con co lại — cần width:100% !important
  const maxW = innerVars['--mf-form-max-width'] || wrapperVars['--mf-form-max-width'];
  if (maxW) {
    css += `.mf-form-wrapper{--mf-form-max-width:${maxW}}`;
    css += `.mf-form-inner,.mf-form-wrapper [class^="mfp"],.mf-form-wrapper [class*=" mfp"]{width:100%!important;max-width:${maxW}!important;box-sizing:border-box!important}`;
  } else {
    // Luôn đảm bảo template fill đúng width dù chưa set max-width
    css += `.mf-form-wrapper [class^="mfp"],.mf-form-wrapper [class*=" mfp"]{width:100%!important;box-sizing:border-box!important}`;
  }
  return css;
}

export function applyVarsMap(el: HTMLElement, vars: Record<string, string>): void {
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
}

// ── Shadow presets for the shadow picker ──
export interface ShadowPreset { label: string; value: string }

export const SHADOW_PRESETS: ShadowPreset[] = [
  { label: 'None',       value: 'none' },
  { label: 'Subtle',     value: '0 1px 4px rgba(0,0,0,0.08)' },
  { label: 'Soft',       value: '0 2px 12px rgba(0,0,0,0.10)' },
  { label: 'Medium',     value: '0 4px 20px rgba(0,0,0,0.12)' },
  { label: 'Elevated',   value: '0 8px 32px rgba(0,0,0,0.14)' },
  { label: 'Deep',       value: '0 16px 48px rgba(0,0,0,0.18)' },
  { label: 'Colored',    value: '0 4px 20px rgba(74,144,217,0.25)' },
  { label: 'Inner',      value: 'inset 0 1px 3px rgba(0,0,0,0.12)' },
];
