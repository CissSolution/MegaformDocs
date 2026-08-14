// [GalleryPreviewBlank 2026-07-27] Static template previews (wizard gallery card thumbnails and
// the builder's in-memory preview) render the template's customHtml *without* running the step
// engine. Multi-step premium templates hide every page in CSS and let the engine reveal one:
//
//   .mfp.mfp-x .mfp-page            { display:none !important; }
//   .mfp.mfp-x .mfp-page.is-active  { display:block !important; }
//
// With no engine, nothing ever gets `is-active`, so every field disappears and the card shows
// only the hero + stepper + buttons ("preview mất field"). Marking the FIRST page active makes
// the static preview show step 1, which is what a viewer expects from a thumbnail.
//
// Every DONEE premium template uses the same `is-active` reveal class; only the page container
// class differs per design family (mfp-/ey-/bg-/au-/am-), so both an explicit list and a generic
// `*-page` fallback are handled.

const PAGE_SELECTORS = [
  '.mfp-page', '.ey-page', '.bg-page', '.au-page', '.am-page',
  '.mfp-tab-panel', '.mf-ms-panel',
];
const STEP_SELECTORS = [
  '.mfp-stepper-item', '.ey-step', '.mfp-tab', '.mfp-step',
];
const ACTIVE = 'is-active';

function activateFirst(doc: Document, selector: string): void {
  let nodes: Element[];
  try { nodes = Array.prototype.slice.call(doc.querySelectorAll(selector)); } catch { return; }
  if (!nodes.length) return;
  // Respect a template that already ships one marked active.
  if (nodes.some((n) => n.classList && n.classList.contains(ACTIVE))) return;
  const first = nodes[0];
  if (first && first.classList) first.classList.add(ACTIVE);
}

/**
 * Give a static (engine-less) template preview a visible first page.
 * Returns the HTML unchanged when DOMParser is unavailable or parsing fails.
 */
export function activateFirstPreviewPage(html: string): string {
  const input = String(html || '');
  if (!input || typeof DOMParser === 'undefined') return input;
  try {
    const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + input + '</body></html>', 'text/html');
    if (!doc || !doc.body) return input;

    PAGE_SELECTORS.forEach((sel) => activateFirst(doc, sel));
    STEP_SELECTORS.forEach((sel) => activateFirst(doc, sel));

    // Generic fallback: a design family we do not know about yet still names its page
    // container `<something>-page`. Only fires when none of the known selectors matched.
    const knownHit = PAGE_SELECTORS.some((sel) => {
      try { return !!doc.querySelector(sel); } catch { return false; }
    });
    if (!knownHit) {
      const all = Array.prototype.slice.call(doc.querySelectorAll('[class]')) as Element[];
      const pages = all.filter((el) => /(^|\s)[a-z0-9]+-page(\s|$)/i.test(String(el.className || '')));
      if (pages.length && !pages.some((p) => p.classList.contains(ACTIVE))) pages[0].classList.add(ACTIVE);
    }
    return doc.body.innerHTML;
  } catch {
    return input;
  }
}
