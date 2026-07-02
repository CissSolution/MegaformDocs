// [2026-07-02] Curated colour-palette popover for the right-rail CSS Inspector.
// The inspector colour rows used only a native <input type=color> (OS picker). Users asked
// for a quick swatch palette. This tiny module renders a popover: curated swatches + recent
// colours + a "Custom…" entry that falls back to the native picker. Kept in its own small file.

const CURATED: string[] = [
  '#000000', '#334155', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

const recent: string[] = [];
function pushRecent(hex: string): void {
  const h = String(hex || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(h)) return;
  const i = recent.indexOf(h);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(h);
  if (recent.length > 8) recent.length = 8;
}

let styleInjected = false;
function ensureCss(): void {
  if (styleInjected || document.getElementById('mf-insp-palette-style')) { styleInjected = true; return; }
  styleInjected = true;
  const s = document.createElement('style');
  s.id = 'mf-insp-palette-style';
  s.textContent = `
.mf-insp-palette{position:fixed;z-index:2147483647;width:212px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 18px 44px rgba(15,23,42,.22);padding:10px;font-family:'Inter',system-ui,sans-serif}
.mf-insp-palette h6{margin:0 0 6px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8}
.mf-insp-swgrid{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-bottom:8px}
.mf-insp-sw{width:100%;aspect-ratio:1;border-radius:6px;border:1px solid rgba(15,23,42,.12);cursor:pointer;padding:0;transition:transform .1s}
.mf-insp-sw:hover{transform:scale(1.12);box-shadow:0 0 0 2px rgba(99,102,241,.35)}
.mf-insp-palette-foot{display:flex;align-items:center;gap:8px;border-top:1px solid #f1f5f9;padding-top:8px}
.mf-insp-custom{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;border:1px solid #c7d2fe;border-radius:8px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700;cursor:pointer}
.mf-insp-custom:hover{background:#e0e7ff}
.mf-insp-custom input[type=color]{width:0;height:0;opacity:0;position:absolute;pointer-events:none}
`;
  document.head.appendChild(s);
}

let openEl: HTMLElement | null = null;
export function closeInspectorColorPalette(): void {
  if (openEl) { try { openEl.remove(); } catch { /* */ } openEl = null; }
  document.removeEventListener('mousedown', onDocDown, true);
}
function onDocDown(e: MouseEvent): void {
  if (openEl && !openEl.contains(e.target as Node)) closeInspectorColorPalette();
}

/** Open the curated palette anchored to `anchor`. `onPick(hex)` fires on any colour choice. */
export function openInspectorColorPalette(anchor: HTMLElement, currentHex: string, onPick: (hex: string) => void): void {
  ensureCss();
  closeInspectorColorPalette();
  const pop = document.createElement('div');
  pop.className = 'mf-insp-palette';
  const swatch = (hex: string) => `<button type="button" class="mf-insp-sw" data-hex="${hex}" title="${hex}" style="background:${hex}"></button>`;
  const recentHtml = recent.length ? `<h6>Recent</h6><div class="mf-insp-swgrid">${recent.map(swatch).join('')}</div>` : '';
  pop.innerHTML =
    recentHtml +
    `<h6>Palette</h6><div class="mf-insp-swgrid">${CURATED.map(swatch).join('')}</div>` +
    `<div class="mf-insp-palette-foot">` +
      `<label class="mf-insp-custom"><i class="fas fa-eye-dropper"></i>Custom…<input type="color" value="${/^#[0-9a-f]{6}$/i.test(currentHex) ? currentHex : '#000000'}" /></label>` +
    `</div>`;
  document.body.appendChild(pop);
  openEl = pop;

  // position near the anchor, clamped to viewport
  const r = anchor.getBoundingClientRect();
  const w = 212, h = pop.offsetHeight || 240;
  let left = r.left; let top = r.bottom + 6;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  pop.style.left = Math.max(8, left) + 'px';
  pop.style.top = top + 'px';

  const pick = (hex: string) => { pushRecent(hex); onPick(hex); closeInspectorColorPalette(); };
  pop.querySelectorAll<HTMLElement>('.mf-insp-sw').forEach((b) => {
    b.addEventListener('click', () => pick(String(b.getAttribute('data-hex') || '')));
  });
  const custom = pop.querySelector<HTMLInputElement>('input[type=color]');
  if (custom) {
    custom.addEventListener('input', () => pick(custom.value));
    // clicking the label opens the native picker (default behaviour)
  }
  setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
}
