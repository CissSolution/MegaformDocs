// ============================================================
// [ThumbCrop fix 2026-07-24] Fit a live template thumbnail to its card.
//
// Both template galleries (the wizard's and the builder's) render a card thumbnail as an
// <iframe srcdoc> of the template's own HTML, shrunk with a CSS transform. Both did it with
// a HARD-CODED scale over a fixed 520px viewport:
//
//   wizard : 760 x 520, scale(.315) -> 239 x 164 painted into a 220px-tall card
//   builder: 760 x 520, scale(.22)  -> 167 x 114
//
// Card width comes from a responsive grid, so the number was never right for long: the render
// sat in the top-left corner and the rest of the card was bare gradient (~56px under it in the
// wizard). A fixed scale cannot work — the card width is only known after layout.
//
// So: scale to the shell's WIDTH (nothing is ever cropped horizontally) and then hand the
// iframe as much VIEWPORT HEIGHT as that scale needs to fill the shell. The template renders
// more of itself instead of leaving a gap, which is also the more useful thumbnail.
//
// The document inside must paint its background to the full height it is given
// (min-height:100vh, not a fixed px) or short templates leave a bare strip.
// ============================================================

// Logical CSS width the thumbnail documents render at. Deliberately DESKTOP-wide (> the common
// 1024px hero/split breakpoint) so a premium template's hero / side pane shows in the card too;
// fitThumbFrames then scales it down to the small card. At the old 760px the hero collapsed and
// the card showed only the form column (parity with the preview fix at 1240px).
export const THUMB_SRC_WIDTH = 1200;

const _observed = new WeakSet<Element>();

function fitOne(shell: HTMLElement, frameSelector: string): void {
  const frame = shell.querySelector(frameSelector) as HTMLElement | null;
  if (!frame) return;
  const w = shell.clientWidth;
  const h = shell.clientHeight;
  if (!w || !h) return;
  const scale = w / THUMB_SRC_WIDTH;
  frame.style.width = THUMB_SRC_WIDTH + 'px';
  // +1px absorbs sub-pixel rounding, which otherwise leaves a hairline of card background.
  frame.style.height = Math.ceil(h / scale) + 1 + 'px';
  frame.style.transform = 'scale(' + scale + ')';
  frame.style.transformOrigin = 'top left';
}

/**
 * Size every thumbnail iframe under `root` to its card.
 *
 * Idempotent and cheap — safe to call after every grid repaint. Each shell is observed once
 * (ResizeObserver where available) so a window resize or a grid reflow re-fits it.
 */
export function fitThumbFrames(
  root: ParentNode | null | undefined,
  shellSelector = '.tpl-thumb-frame-shell',
  frameSelector = '.tpl-thumb-frame',
): void {
  if (!root) return;
  const RO = (window as any).ResizeObserver;
  const shells = Array.from(root.querySelectorAll(shellSelector)) as HTMLElement[];
  for (const shell of shells) {
    fitOne(shell, frameSelector);
    if (_observed.has(shell)) continue;
    _observed.add(shell);
    if (typeof RO === 'function') {
      try { new RO(() => fitOne(shell, frameSelector)).observe(shell); } catch { /* fixed size is fine */ }
    }
  }
}
