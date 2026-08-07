// [FixedHeaderGuard v20260707-B376]
// Some host themes (e.g. Oqtane's default theme) paint their site header as a
// position:fixed/sticky bar whose REAL height can exceed the offset the theme
// reserves for page content: the nav menu wraps to extra rows when the site has
// many pages, the logged-in control row appears, or the window is narrow. Any
// content that starts inside that shortfall is painted UNDER the fixed bar — for
// MegaForm that means the top of the form card (rounded corners, hero, title)
// is hidden. The theme cannot be fixed from inside a module, so this guard
// measures the shortfall at runtime and pushes ONLY our own module container
// down by exactly that amount. No fixed header / no overlap → no-op.

const GUARD_ATTR = 'data-mf-header-guard';
const EXTRA_GAP_PX = 8;        // breathing room below the bar
const MAX_SANE_SHORTFALL = 400; // ignore absurd measurements (broken themes/overlays)

const guardedHosts = new Set<HTMLElement>();
let resizeBound = false;

export function findFixedHeader(): HTMLElement | null {
  // Topmost full-width fixed/sticky element pinned to the viewport top.
  const cands = document.elementsFromPoint(Math.floor(window.innerWidth / 2), 2);
  for (const el of cands) {
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.top <= 1 && r.width >= window.innerWidth * 0.6 && r.height >= 40 && r.height <= window.innerHeight * 0.6) {
      return el;
    }
  }
  return null;
}

function recalcHost(host: HTMLElement): void {
  // Reset our own compensation first so the measurement reflects the theme's natural layout.
  if (host.getAttribute(GUARD_ATTR)) {
    host.style.marginTop = '';
    host.removeAttribute(GUARD_ATTR);
  }
  const header = findFixedHeader();
  if (!header) return;
  const headerBottom = header.getBoundingClientRect().bottom; // viewport-relative; fixed bar → constant
  const hostAbsTop = host.getBoundingClientRect().top + window.scrollY; // document position
  // At scroll 0 the bar covers document rows [0, headerBottom). Being under it while
  // SCROLLED is normal for a fixed header — only the resting position matters.
  const shortfall = Math.ceil(headerBottom - hostAbsTop) + EXTRA_GAP_PX;
  if (shortfall <= EXTRA_GAP_PX || shortfall > MAX_SANE_SHORTFALL) return;
  host.style.marginTop = `${shortfall}px`;
  host.setAttribute(GUARD_ATTR, String(shortfall));
}

function recalcAll(): void {
  guardedHosts.forEach(host => {
    if (!host.isConnected) { guardedHosts.delete(host); return; }
    recalcHost(host);
  });
}

let resizeTimer: number | undefined;
function onResize(): void {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(recalcAll, 150);
}

export function applyFixedHeaderGuard(formId: number | string): void {
  const wrapper = document.getElementById(`mf-form-wrapper-${formId}`);
  if (!wrapper) return;
  // Popup/preview surfaces have their own chrome — never compensate there.
  if (wrapper.closest('.mf-popup-dialog, .mf-builder-preview, iframe')) return;
  const host = (wrapper.closest('.megaform-module') as HTMLElement) || wrapper;
  guardedHosts.add(host);
  recalcHost(host);
  // Nav wrapping (the usual cause) depends on width, and fonts/nav render late —
  // re-measure once after layout settles and on every resize.
  window.setTimeout(() => recalcHost(host), 400);
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', onResize);
  }
}
