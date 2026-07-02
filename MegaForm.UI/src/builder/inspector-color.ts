// [2026-07-02] Pure color helpers for the right-rail CSS Inspector (theme-tab-adapter.ts).
// Kept in a tiny module so the (already large) adapter file doesn't grow further.

/** True when a CSS property/value pair represents a color the user can pick with a swatch. */
export function isColorProp(key: string, val: string): boolean {
  const k = String(key || '').toLowerCase();
  if (k === 'color' || k === 'background' || k === 'fill' || k === 'stroke' || /color$/.test(k)) return true;
  const v = String(val || '').trim().toLowerCase();
  return /^#[0-9a-f]{3,8}$/.test(v) || /^rgb/.test(v) || /^hsl/.test(v);
}

/** Normalize a CSS color value to a #rrggbb string for an <input type="color">.
 *  Returns '' when the value isn't a solid, convertible color (e.g. gradients, 'transparent'). */
export function colorToHex(val: string): string {
  let v = String(val || '').trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'none' || v.indexOf('gradient') >= 0) return '';
  // #rgb / #rgba / #rrggbb / #rrggbbaa
  const hexM = v.match(/^#([0-9a-f]{3,8})$/);
  if (hexM) {
    let h = hexM[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; // drop alpha nibble
    if (h.length >= 6) return '#' + h.slice(0, 6);
    return '';
  }
  // rgb()/rgba()
  const rgbM = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgbM) {
    const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + to2(parseFloat(rgbM[1])) + to2(parseFloat(rgbM[2])) + to2(parseFloat(rgbM[3]));
  }
  // Named colors — resolve via the browser (only for solid keywords).
  try {
    const el = document.createElement('span');
    el.style.color = '';
    el.style.color = v;
    if (el.style.color) {
      document.body.appendChild(el);
      const cs = getComputedStyle(el).color;
      document.body.removeChild(el);
      const m = String(cs || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      if (m) {
        const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
        return '#' + to2(parseFloat(m[1])) + to2(parseFloat(m[2])) + to2(parseFloat(m[3]));
      }
    }
  } catch { /* defensive */ }
  return '';
}
