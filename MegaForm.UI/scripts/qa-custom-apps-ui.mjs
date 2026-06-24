// Visual QA — Custom Apps section in Business Starters modal.
// Flow:
//   1. Login → dashboard → click Business Starters → modal opens
//   2. Verify "Custom Apps" section exists + "+ New Custom App" button visible
//   3. Click + → editor modal opens
//   4. Fill name + scope + description + click Save
//   5. Verify card appears in custom grid
//   6. Click Manage → checkbox list of forms appears
//   7. Tick 2 form checkboxes
//   8. Verify card shows "2 forms" badge after refresh
//   9. Click Delete → confirm → verify removed
// Each step takes a screenshot for the visual review.

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE='http://dnn10322_megatest.ai';
const PAGE='/Shop/New-Arrivals';
const USER='host'; const PASS='dnnhost';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function login(page) {
  await page.goto(BASE+'/Login?ReturnUrl='+encodeURIComponent(PAGE), { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(2000);
}

(async () => {
  // Cleanup state before
  // (let SQL handle leftover via init step in PowerShell wrapper)
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,300)); });
  page.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0,300)));

  await login(page);
  await page.goto(BASE + PAGE + '#mf-dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Step 1: click "Business Starters" header button
  console.log('[1] Click Business Starters');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /business starters/i.test(b.textContent||''));
    if (btn) btn.click(); else throw new Error('Business Starters button missing');
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'qa-out/custom-apps-01-modal.png', fullPage: false });

  // Step 2: confirm Custom Apps section visible
  const sectionState = await page.evaluate(() => {
    const has = document.body.innerText.includes('Custom Apps');
    const newBtn = Array.from(document.querySelectorAll('button')).find(b => /New Custom App/i.test(b.textContent||''));
    return { customAppsTextVisible: has, newBtnFound: !!newBtn };
  });
  console.log('[2] sectionState =', sectionState);

  // Step 3: click + New Custom App
  console.log('[3] Click + New Custom App');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /New Custom App/i.test(b.textContent||''));
    btn?.click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa-out/custom-apps-02-editor-empty.png', fullPage: false });

  // Step 4: fill fields + save
  console.log('[4] Fill name/scope/desc + Save');
  await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.mf-modal-overlay'));
    const overlay = overlays[overlays.length - 1];
    const fillInput = (placeholder, value) => {
      const el = overlay.querySelector('input[placeholder*="' + placeholder + '"]');
      if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    fillInput('Recruitment Pipeline', 'Inventory Tracker');
    fillInput('auto-derived', 'inventory-tracker');
    const desc = overlay.querySelector('textarea');
    if (desc) { desc.value = 'Tracks inventory items across warehouses'; desc.dispatchEvent(new Event('input', { bubbles: true })); }
    const saveBtn = Array.from(overlay.querySelectorAll('button')).find(b => /Save/i.test(b.textContent||''));
    saveBtn?.click();
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'qa-out/custom-apps-03-after-save.png', fullPage: false });

  const afterSave = await page.evaluate(() => {
    return {
      cardVisible: document.body.innerText.includes('Inventory Tracker'),
      scopeVisible: document.body.innerText.includes('inventory-tracker')
    };
  });
  console.log('[5] afterSave =', afterSave);

  // Step 6: click Manage on Inventory Tracker
  console.log('[6] Click Manage');
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('strong')).filter(s => /Inventory Tracker/i.test(s.textContent||''));
    if (!cards.length) throw new Error('No Inventory Tracker card');
    const card = cards[0].closest('div');
    let p = card; for (let i=0;i<6 && p;i++) { p = p.parentElement; if (p && p.querySelector('button')) break; }
    const mgr = Array.from((p||card).querySelectorAll('button')).find(b => /Manage/i.test(b.textContent||''));
    mgr?.click();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'qa-out/custom-apps-04-manage.png', fullPage: false });

  // Step 7: tick 2 form checkboxes
  console.log('[7] Tick 2 form checkboxes');
  const tickedInfo = await page.evaluate(async () => {
    const overlays = Array.from(document.querySelectorAll('.mf-modal-overlay'));
    const overlay = overlays[overlays.length - 1];
    const list = overlay.querySelector('div[style*="overflow-y: auto"], div[style*="overflowY: auto"]');
    // Find first 2 unchecked checkboxes
    const cbs = Array.from((list||overlay).querySelectorAll('input[type="checkbox"]')).filter(c => !c.checked).slice(0, 2);
    cbs.forEach(c => { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await new Promise(r => setTimeout(r, 1500));  // let API calls complete
    return { ticked: cbs.length, labels: cbs.map(c => c.parentElement?.textContent?.trim().slice(0, 60)) };
  });
  console.log('   ticked', tickedInfo);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa-out/custom-apps-05-forms-ticked.png', fullPage: false });

  // Step 8: close editor + refresh grid + verify "2 forms" badge
  console.log('[8] Close editor + verify card count');
  await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.mf-modal-overlay'));
    const overlay = overlays[overlays.length - 1];
    const cancel = Array.from(overlay.querySelectorAll('button')).find(b => /Cancel/i.test(b.textContent||''));
    cancel?.click();
  });
  await page.waitForTimeout(1000);
  // Close + reopen the parent modal to force refresh
  await page.evaluate(() => {
    // Close all modals
    document.querySelectorAll('.mf-modal-overlay').forEach(o => o.remove());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /business starters/i.test(b.textContent||''));
    if (btn) btn.click();
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/custom-apps-06-refresh.png', fullPage: false });
  const formsBadge = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('strong')).filter(s => /Inventory Tracker/i.test(s.textContent||''));
    if (!cards.length) return { found: false };
    // Badge sits in the same head div as the <strong>, as a sibling span with border-radius:999px
    const head = cards[0].parentElement;
    const badge = head?.querySelector('span[style*="border-radius:999px"]');
    return { found: true, badgeText: badge?.textContent?.trim() };
  });
  console.log('   formsBadge =', formsBadge);

  // Step 9: delete app
  console.log('[9] Delete the app');
  page.on('dialog', async d => { await d.accept(); });
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('strong')).filter(s => /Inventory Tracker/i.test(s.textContent||''));
    if (!cards.length) return;
    const card = cards[0].closest('div');
    let p = card; for (let i=0;i<6 && p;i++) { p = p.parentElement; if (p && p.querySelectorAll('button').length >= 2) break; }
    const delBtn = Array.from((p||card).querySelectorAll('button')).find(b => /Delete/i.test(b.textContent||''));
    delBtn?.click();
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/custom-apps-07-after-delete.png', fullPage: false });
  const afterDelete = await page.evaluate(() => ({ stillVisible: document.body.innerText.includes('Inventory Tracker') }));
  console.log('   afterDelete =', afterDelete);

  console.log('\n[CONSOLE ERRORS]', errs.slice(0, 6));
  writeFileSync('qa-out/custom-apps-ui.json', JSON.stringify({ sectionState, afterSave, tickedInfo, formsBadge, afterDelete, errs }, null, 2), 'utf8');

  const pass = sectionState.customAppsTextVisible
    && sectionState.newBtnFound
    && afterSave.cardVisible
    && tickedInfo.ticked === 2
    && formsBadge.found && /2 forms/.test(formsBadge.badgeText || '')
    && !afterDelete.stillVisible;
  console.log(pass ? '\n=== PASS — Custom Apps UI Create/Assign/Refresh/Delete cycle ===' : '\n=== FAIL — see qa-out screenshots + json ===');
  await browser.close();
  process.exit(pass ? 0 : 2);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
