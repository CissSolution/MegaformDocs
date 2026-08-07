// [ContentGapTrim v20260720-B406]
// Companion to FixedHeaderGuard. Some Bootswatch/Oqtane themes reserve a large,
// HARD-CODED padding-top on the site's `.content` wrapper to clear their
// position:fixed navbar. E.g. Oqtane.Theme.Bootswatch ships:
//     Theme.css  .content { padding-top: 12rem }
//     Quartz.css .content { padding-top: 14rem }  and  @media(min-width:992px){ 9rem }
// Those values are a rough OVER-estimate of the navbar's real height (~112px ≈ 7rem),
// so an empty band sits above the page content — very visible above a MegaForm card,
// and worst on narrow viewports (12–14rem). This is a stock-theme quirk, not a
// MegaForm style: `.content` is the host theme's wrapper and no MegaForm stylesheet
// touches it.
//
// FixedHeaderGuard handles the OPPOSITE case (theme reserves too LITTLE → our card
// is hidden under the bar). This trims the EXCESS: on pages that host a MegaForm
// module it lowers the host `.content` padding-top toward the navbar's real bottom,
// but NEVER below `navbarBottom + GAP_PX`, so every module in `.content` still clears
// the fixed bar and nothing is ever pushed under it. No fixed navbar, or padding
// that's already tight, → no-op. Popup/preview/builder surfaces are never touched.

import { findFixedHeader } from './fixed-header-guard';

const TRIM_ATTR = 'data-mf-content-trim';
const GAP_PX = 16;         // normalize the form to a tight, consistent gap below the fixed bar
const MIN_EXCESS_PX = 10;  // act once the theme reserves more than navbar + GAP + this slack

const trimmedContents = new Set<HTMLElement>();
let resizeBound = false;

function recalcContent(content: HTMLElement): void {
  // Reset our own compensation first so we read the theme's NATURAL padding-top.
  const stored = content.getAttribute(TRIM_ATTR);
  if (stored !== null) {
    content.style.paddingTop = stored;   // '' restores the theme's CSS value
    content.removeAttribute(TRIM_ATTR);
  }
  const header = findFixedHeader();
  if (!header) return; // no fixed bar → the padding isn't a header offset → leave it alone
  const naturalPad = parseFloat(getComputedStyle(content).paddingTop) || 0;
  const headerBottom = header.getBoundingClientRect().bottom; // fixed bar pinned to top → its height
  const target = Math.ceil(headerBottom) + GAP_PX;
  // Only trim clearly-excessive reservations, and never below the navbar+gap floor.
  if (naturalPad - target < MIN_EXCESS_PX) return;
  content.setAttribute(TRIM_ATTR, content.style.paddingTop || ''); // preserve any prior inline value
  content.style.paddingTop = `${target}px`;
}

function recalcAll(): void {
  trimmedContents.forEach((c) => {
    if (!c.isConnected) { trimmedContents.delete(c); return; }
    recalcContent(c);
  });
}

let resizeTimer: number | undefined;
function onResize(): void {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(recalcAll, 150);
}

export function trimContentGap(formId: number | string): void {
  const wrapper = document.getElementById(`mf-form-wrapper-${formId}`);
  if (!wrapper) return;
  // Popup/preview/builder surfaces have their own chrome — never touch host layout there.
  if (wrapper.closest('.mf-popup-dialog, .mf-builder-preview, iframe')) return;
  const content = wrapper.closest<HTMLElement>('.content');
  if (!content) return; // not sitting inside a themed `.content` wrapper → nothing to trim
  trimmedContents.add(content);
  recalcContent(content);
  // Navbar height depends on width / nav-wrap, and fonts render late — re-measure once settled.
  window.setTimeout(() => recalcContent(content), 450);
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', onResize);
  }
}
