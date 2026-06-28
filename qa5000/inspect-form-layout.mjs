// Inspect the homepage inline form (?view=form): the top-padding gap above the card + the
// chips layout at desktop vs mobile widths, to pinpoint the CSS to fix.
import { launch, BASE, OUT, shot } from './lib.mjs';
const { browser, page } = await launch(true);
try {
  await page.goto(`${BASE}/?view=form`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  const probe = async (label) => page.evaluate((label) => {
    const out = { label };
    const cs = (el) => el ? getComputedStyle(el) : null;
    const box = (el) => el ? { mt: cs(el).marginTop, mb: cs(el).marginBottom, pt: cs(el).paddingTop, pb: cs(el).paddingBottom, cls: el.className } : null;
    // form shell candidates
    const card = document.querySelector('.mfp-card');
    const container = document.querySelector('.mfp-container');
    const pureGrid = document.querySelector('.mfp.mfp-pure-grid, .mfp-pure-grid');
    const cardBody = document.querySelector('.mfp-card-body');
    const cardHeader = document.querySelector('.mfp-card-header');
    const wrapper = document.querySelector('.mf-form-wrapper');
    const moduleRoot = document.querySelector('[id^="mf-render-"], .megaform-module, #mf-form-mount');
    out.card = box(card); out.container = box(container); out.pureGrid = box(pureGrid);
    out.cardBody = box(cardBody); out.cardHeader = box(cardHeader); out.wrapper = box(wrapper);
    out.moduleRoot = box(moduleRoot);
    // gap above the card = card.top - (previous sibling chain bottom)
    if (card) { const r = card.getBoundingClientRect(); out.cardTop = Math.round(r.top); }
    // chips
    const chips = document.querySelector('.mf-option-group--chips');
    if (chips) {
      const c = cs(chips);
      out.chips = { cls: chips.className, display: c.display, flexWrap: c.flexWrap, gap: c.gap, justify: c.justifyContent, gridCols: c.gridTemplateColumns, width: Math.round(chips.getBoundingClientRect().width) };
      const items = Array.from(chips.querySelectorAll('.mf-option-item')).map(it => { const b = it.getBoundingClientRect(); return { w: Math.round(b.width), x: Math.round(b.left) }; });
      out.chipItems = items;
    } else { out.chips = 'NONE'; }
    return out;
  }, label);

  // Desktop
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  console.log('=== DESKTOP 1280 ===');
  console.log(JSON.stringify(await probe('desktop'), null, 1));
  await shot(page, 'inspect-desktop.png', { full: true });

  // Mobile
  await page.setViewportSize({ width: 390, height: 850 });
  await page.waitForTimeout(400);
  console.log('=== MOBILE 390 ===');
  console.log(JSON.stringify(await probe('mobile'), null, 1));
  await shot(page, 'inspect-mobile.png', { full: true });
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
