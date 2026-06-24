// [B65l] Verify blank form scaffolding via dashboard "New Form" click.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

// Open builder with ?new=1 to trigger blank flow
await page.goto(SITE + '/megaform/Home/mfFormId/0?new=1#mf-builder-new', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

await page.screenshot({ path: 'qa-out/b65l-01-gallery.png', fullPage: false });

// Inspect gallery to find blank tile structure
const galleryState = await page.evaluate(() => {
  const galleryRoot = document.getElementById('tpl-gallery');
  const cards = Array.from(document.querySelectorAll('.tpl-card, [data-tpl-id]'));
  return {
    galleryVisible: galleryRoot ? getComputedStyle(galleryRoot).display !== 'none' : false,
    cardCount: cards.length,
    blankCards: cards.filter(c => (c.getAttribute('data-tpl-id') || '') === 'blank').length,
    firstCardSample: cards.length ? {
      tplId: cards[0].getAttribute('data-tpl-id'),
      txt: (cards[0].textContent || '').trim().slice(0, 60),
      cls: cards[0].className.slice(0, 80)
    } : null
  };
});

// Click "Start Blank" tile precisely
const blankClick = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('[data-tpl-id="blank"]'));
  if (cards.length) { cards[0].click(); return { ok: true, sel: '[data-tpl-id=blank]', count: cards.length }; }
  return { ok: false };
});
await page.waitForTimeout(2500);

// Look for "Use this template" / "Start with this template" button
const useBlankClick = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button, a'));
  const candidates = btns.filter(b => /use this template|start blank|use template/i.test((b.textContent || '').trim()));
  if (candidates.length) { candidates[0].click(); return { ok: true, txt: candidates[0].textContent.trim().slice(0, 30), count: candidates.length }; }
  return { ok: false };
});
await page.waitForTimeout(4000);

await page.screenshot({ path: 'qa-out/b65l-02-after-blank.png', fullPage: false });

const schemaState = await page.evaluate(() => {
  const builder = window.MegaFormBuilder;
  const schema = builder && builder.state && builder.state.schema;
  return {
    hasSchema: !!schema,
    fieldCount: schema && schema.fields ? schema.fields.length : 0,
    fieldsSummary: schema && schema.fields ? schema.fields.map(f => ({
      type: f.type,
      key: f.key,
      columnCount: f.columns ? f.columns.length : 0,
      columnFieldCounts: f.columns ? f.columns.map(c => (c.fields || []).length) : []
    })) : []
  };
});

await browser.close();
console.log(JSON.stringify({ galleryState, blankClick, useBlankClick, schemaState }, null, 2));
