// Browser-driven QA for form 293 (Supplier + Razor card grid with images
// + DataGrid for new products). Drives Chrome via Playwright on the live
// DNN site, picks the supplier, waits for the Razor widget to render its
// image cards, captures a screenshot, prints what it sees + console errors.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE   = 'http://dnn10322_megaf.ai';
const FORMID = process.env.MF_FORMID || '293';
const SUPPLIER_LABEL = process.env.MF_SUP_LABEL || 'ACME';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT    = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });
const stamp = process.env.MF_STAMP || 'latest';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
const networkErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('requestfailed', (req) => {
  networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

const result = { url: `${BASE}/xx?formid=${FORMID}`, steps: [] };

try {
  const url = `${BASE}/xx?formid=${FORMID}`;
  console.log(`→ goto ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  result.steps.push({ step: 'goto', ok: true });

  // Take initial screenshot
  await page.screenshot({ path: join(OUT, `form${FORMID}-${stamp}-01-initial.png`), fullPage: true });

  // Find the supplier select. Try a few selectors.
  const candidates = [
    'select[name="supplier_id"]',
    'select[data-mf-field-key="supplier_id"]',
    '[name="supplier_id"]',
  ];
  let supSel = null;
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0) { supSel = loc; result.steps.push({ step: 'supplier-locate', selector: sel }); break; }
  }
  if (!supSel) {
    // Some Select widgets are custom — search for a select-style trigger button
    const trigger = page.locator('[data-mf-field-key="supplier_id"]').first();
    if (await trigger.count() > 0) {
      supSel = trigger;
      result.steps.push({ step: 'supplier-locate', selector: 'data-mf-field-key' });
    }
  }

  if (!supSel) {
    result.steps.push({ step: 'supplier-locate', ok: false, error: 'No supplier_id element found' });
  } else {
    // For a real <select> element, use selectOption
    const tagName = await supSel.evaluate((el) => el.tagName.toLowerCase());
    result.steps.push({ step: 'supplier-tagname', tagName });
    if (tagName === 'select') {
      // Pick the option whose label contains SUPPLIER_LABEL
      const options = await supSel.evaluate((el) =>
        Array.from(el.options).map((o) => ({ value: o.value, label: o.textContent }))
      );
      result.steps.push({ step: 'supplier-options', options });
      const target = options.find((o) => (o.label || '').includes(SUPPLIER_LABEL));
      if (target) {
        await supSel.selectOption(target.value);
        result.steps.push({ step: 'supplier-pick', value: target.value, label: target.label });
        // Fire change event explicitly so cascade kicks in
        await supSel.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
      } else {
        result.steps.push({ step: 'supplier-pick', ok: false, error: `no option matching ${SUPPLIER_LABEL}` });
      }
    }
  }

  // Wait for Razor card grid to populate
  await page.waitForTimeout(1500); // first cascade
  // Wait for the cards container
  const cardsLoc = page.locator('.mf-supplier-products-grid');
  await cardsLoc.first().waitFor({ timeout: 15000 }).catch(() => {});
  const cardCount = await page.locator('.mf-supplier-product-card').count();
  const imgCount  = await page.locator('.mf-supplier-product-card img').count();
  const imgSrcs   = await page.locator('.mf-supplier-product-card img').evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute('src')));
  result.steps.push({ step: 'razor-render', cardCount, imgCount, sampleImgSrcs: imgSrcs });

  await page.screenshot({ path: join(OUT, `form${FORMID}-${stamp}-02-after-supplier.png`), fullPage: true });

  // Look for the DataGrid wrap + Add row button
  const dgridWrap = page.locator('[data-mfw-dgrid="1"]').first();
  const dgridFound = await dgridWrap.count() > 0;
  let addBtnText = null, dgridHeaderCols = 0;
  if (dgridFound) {
    const addBtn = page.locator('[data-mfw-add]').first();
    addBtnText = (await addBtn.textContent().catch(() => '') || '').trim();
    dgridHeaderCols = await page.locator('.mfw-dgrid-head .mfw-dgrid-cell').count();
    // Click Add row to populate one row
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
  }
  result.steps.push({ step: 'datagrid', found: dgridFound, addBtnText, headerCols: dgridHeaderCols });

  await page.screenshot({ path: join(OUT, `form${FORMID}-${stamp}-03-datagrid-add.png`), fullPage: true });

  result.consoleErrors = consoleErrors;
  result.networkErrors = networkErrors;
} catch (e) {
  result.error = e?.message || String(e);
}

writeFileSync(join(OUT, `form${FORMID}-${stamp}-report.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
