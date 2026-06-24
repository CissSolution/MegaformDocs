// Deep DOM inspector for form 293 DataGrids — verifies which display
// template each grid actually rendered.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const FORMID = process.env.MF_FORMID || '293';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });
const stamp = process.env.MF_STAMP || 'deep';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/xx?formid=${FORMID}`, { waitUntil: 'networkidle', timeout: 45000 });

// Pick ACME
const sup = page.locator('select[name="supplier_id"]').first();
await sup.selectOption('1');
await sup.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await page.waitForTimeout(1500);

// Click each "+ Add row" button so each DataGrid has at least 1 row
const addBtns = page.locator('[data-mfw-add]');
const addCount = await addBtns.count();
for (let i = 0; i < addCount; i++) {
  await addBtns.nth(i).click();
  await page.waitForTimeout(300);
}

// Inspect each DataGrid wrap and its rendered structure
const inspection = await page.evaluate(() => {
  const wraps = Array.from(document.querySelectorAll('[data-mfw-dgrid="1"]'));
  return wraps.map(w => {
    const props = w.getAttribute('data-props') || '';
    let parsed = null;
    try { parsed = JSON.parse(props); } catch {}
    return {
      fieldKey: w.getAttribute('data-field-key'),
      displayTemplate: parsed?.displayTemplate || '(missing)',
      imageColumn: parsed?.imageColumn || '',
      hasCardsContainer: !!w.querySelector('.mfw-dgrid-cards'),
      hasCard: !!w.querySelector('.mfw-dgrid-card'),
      hasCardCover: !!w.querySelector('.mfw-dgrid-card-cover'),
      hasCardImg: !!w.querySelector('.mfw-dgrid-card-cover img'),
      hasMDRow: !!w.querySelector('.mfw-dgrid-md-row'),
      hasOldGrid: !!w.querySelector('.mfw-dgrid-grid'),
      childCount: w.children.length,
      firstChildClass: w.firstElementChild ? w.firstElementChild.className : null,
      bindBadge: w.__mfwDgridBound ? 'bound' : 'NOT-BOUND',
      outerHTMLSnippet: w.outerHTML.slice(0, 600)
    };
  });
});

await page.screenshot({ path: join(OUT, `form${FORMID}-${stamp}.png`), fullPage: true });

console.log(JSON.stringify({ wrapCount: inspection.length, inspection, consoleErrors: errs }, null, 2));
writeFileSync(join(OUT, `form${FORMID}-${stamp}-report.json`), JSON.stringify({ wrapCount: inspection.length, inspection, consoleErrors: errs }, null, 2));
await browser.close();
