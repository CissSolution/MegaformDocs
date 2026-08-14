/**
 * [MockDiff v2 20260807] The in-page collector.
 *
 * Exported as a SOURCE STRING because it runs inside the page. Callers must INVOKE it —
 * `page.evaluate('(' + COLLECT_SRC + ')(arg)')` — since Playwright treats a bare function-literal
 * string as an expression and would hand back an unserialisable function object.
 *
 * v1 matched elements by visible text and compared font/colour only. That let a form with every
 * colour right and every gap wrong pass, and it could not see anything without text — rules,
 * dividers, hero bands, cards. v2 adds:
 *   - full box geometry (padding, margin, gap, border, radius, width) per matched element
 *   - the vertical gap to the PREVIOUS matched element, which is what actually encodes spacing
 *     without accumulating drift down the page
 *   - a structure sequence that includes box-only elements, so a missing divider shows up
 */

export const COLLECT_SRC = `(rootSel) => {
  const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();

  // Colours must be normalised IN THE PAGE. Tailwind v4 emits oklab()/lab(), which Chrome reports
  // verbatim from getComputedStyle, so "oklab(0.999994 … / 0.7)" and "rgba(255,255,255,0.7)" are
  // the same colour compared as different. A 1x1 canvas fill is the one conversion that handles
  // every colour space the browser itself understands.
  const cvs = document.createElement('canvas'); cvs.width = 1; cvs.height = 1;
  const cx = cvs.getContext('2d', { willReadFrequently: true });
  const cache = {};
  const toRgba = (value) => {
    const v = String(value || '');
    if (!v || v === 'none') return v;
    if (cache[v]) return cache[v];
    let out = v;
    try {
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = v; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      out = 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (Math.round((d[3] / 255) * 100) / 100) + ')';
    } catch (e) { out = v; }
    cache[v] = out; return out;
  };
  const px = (v) => Math.round(parseFloat(v) || 0);

  // ---- the root of the comparison ------------------------------------------------------------
  // The mock's card is the outermost ancestor of the controls that constrains its own width
  // (Tailwind max-w-xl / max-w-md). Ours is passed in explicitly (.mfp).
  // Take the INNERMOST constrained ancestor, not the outermost. A mock that wraps its card in a
  // max-w-6xl page shell would otherwise anchor the whole comparison on the 1152px page instead of
  // the 576px card, and every element then reports an x-offset and a width difference that is an
  // artefact of the wrong root. That is exactly what happened to 13 of the 14 in the first batch.
  // If nothing is constrained, fall back to the nearest ancestor that actually draws a card.
  const pickRoot = () => {
    if (rootSel) { const r = document.querySelector(rootSel); if (r) return r; }
    const ctl = document.querySelector('input, select, textarea, button');
    let painted = null;
    let n = ctl;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (cs.maxWidth !== 'none') return n;
      if (!painted && n.getBoundingClientRect().width >= 300 &&
          (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0)) painted = n;
      n = n.parentElement;
    }
    return painted || document.querySelector('main') || document.body;
  };
  const root = pickRoot();
  if (!root) return { error: 'no root' };
  root.setAttribute('data-mfqa-root', '1');   // so the driver can screenshot exactly this box
  const rb = root.getBoundingClientRect();

  const visible = (el, cs, r) => r.width >= 2 && r.height >= 2 &&
    cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;

  const measure = (el, cs, r) => ({
    tag: el.tagName.toLowerCase(),
    w: Math.round(r.width), h: Math.round(r.height),
    dx: Math.round(r.x - rb.x), dy: Math.round(r.y - rb.y),
    fontSize: Math.round(parseFloat(cs.fontSize) * 10) / 10,
    fontWeight: String(cs.fontWeight),
    fontStyle: cs.fontStyle,
    fontFamily: String(cs.fontFamily).split(',')[0].replace(/["']/g, '').trim().toLowerCase(),
    lineHeight: cs.lineHeight === 'normal' ? 'normal' : Math.round(parseFloat(cs.lineHeight)),
    letter: cs.letterSpacing === 'normal' ? 0 : Math.round(parseFloat(cs.letterSpacing) * 100) / 100,
    transform: cs.textTransform,
    // 'start'/'end' and 'left'/'right' are the same thing in an LTR page; comparing them raw
    // reported every left-aligned element in the mock as a difference.
    align: cs.textAlign === 'start' ? 'left' : (cs.textAlign === 'end' ? 'right' : cs.textAlign),
    color: toRgba(cs.color),
    bg: toRgba(cs.backgroundColor),
    borderW: [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)].join('/'),
    // Per side. A strip with border-x has no top border, so its borderTopColor is the UA default
    // and comparing that one value reported a colour difference nobody can see.
    borderC: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(toRgba).join(' '),
    // rounded-full resolves to a clamped 33554400px and an authored 999px is the same pill; both
    // collapse to one value or every chip reports a radius difference that is not visible.
    radius: px(cs.borderTopLeftRadius) >= 500 ? 9999 : px(cs.borderTopLeftRadius),
    pad: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)].join('/'),
    mar: [px(cs.marginTop), px(cs.marginBottom)].join('/'),
    gap: [px(cs.rowGap), px(cs.columnGap)].join('/'),
    display: cs.display,
    shadow: cs.boxShadow === 'none' ? 'none' : 'set',
  });

  // ---- keyed elements (matched across the two pages by their visible text) --------------------
  const keyed = {};
  const order = [];
  const seen = new Set();
  for (const el of root.querySelectorAll('h1,h2,h3,h4,label,span,div,p,button,a,input,select,textarea,li')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!visible(el, cs, r)) continue;
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    let key = norm(own);
    if (!key && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) key = 'placeholder:' + norm(el.getAttribute('placeholder'));
    if (!key && el.tagName === 'SELECT') { const o = el.options[el.selectedIndex]; key = 'select:' + norm(o ? o.textContent : ''); }
    if (!key || key.length < 2 || key.length > 60) continue;
    if (seen.has(key)) { keyed[key] = null; continue; }   // ambiguous -> drop
    seen.add(key); order.push(key);

    // Align the two sides on the box that DRAWS the thing. A chip is a bordered <button> in the
    // mock but a <span> inside a <label> in our renderer; measuring the span reported "no border,
    // no padding, height 16" for a chip that is plainly a chip on screen. If the text-owning
    // element paints nothing, climb to the nearest ancestor that paints and still owns only this
    // text.
    const paints = (e, s) => toRgba(s.backgroundColor) !== 'rgba(0,0,0,0)' ||
      px(s.borderTopWidth) + px(s.borderRightWidth) + px(s.borderBottomWidth) + px(s.borderLeftWidth) > 0;
    let vel = el; let vcs = cs; let vr = r;
    if (!paints(el, cs) && px(cs.paddingLeft) === 0) {
      // innerText, NOT textContent: the renderer keeps its own <label> in the DOM and hides it, so
      // textContent carried "First name" on top of the authored "FIRST NAME:" and the climb never
      // fired - the mock's bordered row then compared against our bare label span.
      let p = el.parentElement; let hop = 0;
      while (p && p !== root && hop < 3 && norm(p.innerText) === key) {
        const pcs = getComputedStyle(p);
        if (paints(p, pcs)) { vel = p; vcs = pcs; vr = p.getBoundingClientRect(); break; }
        p = p.parentElement; hop++;
      }
    }
    // Box geometry comes from the box that paints; TYPOGRAPHY still comes from the element that
    // owns the text. Taking both from the painting ancestor reported the strip wrapper's inherited
    // 16px/400 against the mock's 11px/700 span - a difference that is not on the screen.
    keyed[key] = measure(vel, vcs, vr);
    if (vel !== el) {
      const tm = measure(el, cs, r);
      for (const f of ['fontSize', 'fontWeight', 'fontStyle', 'fontFamily', 'lineHeight', 'letter', 'transform', 'align', 'color']) {
        keyed[key][f] = tm[f];
      }
    }
  }
  const keys = order.filter((k) => keyed[k]);
  keys.forEach((k) => { if (!keyed[k]) delete keyed[k]; });
  Object.keys(keyed).forEach((k) => { if (!keyed[k]) delete keyed[k]; });

  // Vertical gap to the previous KEYED element in document order. Local, so one wrong margin does
  // not smear a delta over every element below it.
  let prev = null;
  for (const k of keys) {
    const m = keyed[k];
    m.gapPrev = prev ? m.dy - (prev.dy + prev.h) : 0;
    m.prevKey = prev ? prev._k : null;
    m._k = k; prev = m;
  }
  keys.forEach((k) => { delete keyed[k]._k; });

  // ---- structure sequence, INCLUDING elements with no text -----------------------------------
  // A hairline rule, a hero band or a card frame carries no text and was invisible to v1. Anything
  // that paints - a background, a border, or a non-trivial box - gets a descriptor here.
  const struct = [];
  const walk = (el, depth) => {
    for (const child of el.children) {
      const cs = getComputedStyle(child);
      const r = child.getBoundingClientRect();
      if (!visible(child, cs, r)) continue;
      const paints = toRgba(cs.backgroundColor) !== 'rgba(0,0,0,0)' ||
        px(cs.borderTopWidth) + px(cs.borderRightWidth) + px(cs.borderBottomWidth) + px(cs.borderLeftWidth) > 0 ||
        cs.backgroundImage !== 'none';
      let own = '';
      for (const n of child.childNodes) if (n.nodeType === 3) own += n.nodeValue;
      const t = norm(own);
      const tag = child.tagName.toLowerCase();
      const isCtl = tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button';
      if (paints || t || isCtl || tag === 'svg' || tag === 'img') {
        struct.push({
          d: depth, tag,
          role: isCtl ? (tag === 'input' ? 'input:' + (child.getAttribute('type') || 'text') : tag)
              : (t ? 'text' : (px(r.height) <= 3 ? 'rule' : 'box')),
          w: Math.round(r.width), h: Math.round(r.height),
          bg: toRgba(cs.backgroundColor),
          text: t.slice(0, 40),
        });
      }
      if (child.children.length && depth < 12 && tag !== 'svg') walk(child, depth + 1);
    }
  };
  walk(root, 0);

  return {
    root: { sel: rootSel || '(auto)', w: Math.round(rb.width), h: Math.round(rb.height),
            bg: toRgba(getComputedStyle(root).backgroundColor) },
    pageBg: toRgba(getComputedStyle(document.body).backgroundColor),
    order: keys, keyed, struct,
  };
}`;
