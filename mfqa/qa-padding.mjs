// Issue 1 Visual QA: measure each pane form's card padding + alignment within its pane.
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'mfqa', 'out');
const browser = await chromium.launch({ headless: true });

async function probe(label, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5070/mfqa-panes', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  const data = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('.mf-form-wrapper')];
    return wraps.map(wr => {
      const wrR = wr.getBoundingClientRect();
      const pane = wr.closest('[class*="-pane"], [class*="col-md"], .container, .row') || wr.parentElement;
      const paneR = pane.getBoundingClientRect();
      // candidate "card" = the visible bordered/filled box that holds the fields
      const card = wr.querySelector('.mfp-card, .fr-card, .ey-card, .mf-form-inner, .mfp') || wr;
      const cR = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      const inner = wr.querySelector('.mf-form-inner') ? getComputedStyle(wr.querySelector('.mf-form-inner')) : null;
      const wcs = getComputedStyle(wr);
      return {
        formId: wr.getAttribute('data-form-id'),
        paneW: Math.round(paneR.width),
        wrapW: Math.round(wrR.width),
        wrapPad: wcs.paddingLeft + ' / ' + wcs.paddingRight,
        wrapLeftGap: Math.round(wrR.left - paneR.left),
        wrapRightGap: Math.round(paneR.right - wrR.right),
        cardCls: (card.className || '').toString().slice(0, 40),
        cardW: Math.round(cR.width),
        cardPadLR: cs.paddingLeft + ' / ' + cs.paddingRight,
        cardMarginLR: cs.marginLeft + ' / ' + cs.marginRight,
        innerPadLR: inner ? inner.paddingLeft + ' / ' + inner.paddingRight : null,
        // content offset inside card: where does the first field start vs card left
        contentLeftGap: (() => { const f = card.querySelector('input,select,textarea,.mf-field-group'); if (!f) return null; return Math.round(f.getBoundingClientRect().left - cR.left); })(),
      };
    });
  });
  console.log(`\n[${label} ${w}px]`);
  console.log(JSON.stringify(data, null, 1));
  await page.screenshot({ path: join(OUT, `b284-padding-${label}.png`), fullPage: true });
  await ctx.close();
}
await probe('desktop', 1280, 900);
await browser.close();
