import { launch, BASE } from './lib.mjs';
const { browser, page } = await launch(true);
try {
  await page.goto(`${BASE}/?view=form`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  const out = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const wrap = document.querySelector('.mf-form-wrapper');
    if (!wrap) return { err: 'no wrapper' };
    // walk parent chain from wrapper up to body, report margins/padding
    const chain = [];
    let el = wrap;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      const c = cs(el);
      chain.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 60), mt: c.marginTop, pt: c.paddingTop, top: Math.round(el.getBoundingClientRect().top), h: Math.round(el.getBoundingClientRect().height) });
      el = el.parentElement;
    }
    // first few children inside the wrapper (the card / inner / title / steps)
    const inner = [];
    const walk = (node, depth) => {
      if (depth > 3) return;
      Array.from(node.children).slice(0, 4).forEach(ch => {
        const c = cs(ch);
        const r = ch.getBoundingClientRect();
        inner.push({ d: depth, tag: ch.tagName.toLowerCase(), cls: (ch.className || '').toString().slice(0, 50), mt: c.marginTop, pt: c.paddingTop, top: Math.round(r.top), h: Math.round(r.height) });
        if (r.height > 0) walk(ch, depth + 1);
      });
    };
    walk(wrap, 0);
    // the steps / stepper element
    const steps = document.querySelector('.mf-steps, .mf-stepper, [class*="step"]');
    const stepsBox = steps ? { cls: steps.className.toString().slice(0, 50), mt: cs(steps).marginTop, pt: cs(steps).paddingTop, mb: cs(steps).marginBottom, top: Math.round(steps.getBoundingClientRect().top) } : null;
    // the real inner card
    const innerCard = document.querySelector('.mf-form-inner');
    const innerCardBox = innerCard ? { mt: cs(innerCard).marginTop, pt: cs(innerCard).paddingTop, top: Math.round(innerCard.getBoundingClientRect().top) } : null;
    return { wrapperTop: Math.round(wrap.getBoundingClientRect().top), chain, inner: inner.slice(0, 16), stepsBox, innerCardBox };
  });
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
