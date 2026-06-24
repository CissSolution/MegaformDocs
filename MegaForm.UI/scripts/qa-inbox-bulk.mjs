// Visual QA — Submission Inbox UI changes:
//  1. Header text says "Submissions" (not "MegaForm Inbox")
//  2. Row checkboxes are real inputs (not text glyphs)
//  3. Toolbar select-all checkbox toggles every visible row + shows Delete button with count
//  4. "New submission" opens a form-picker modal
//  5. Bulk delete actually removes selected rows (deletes 2 throwaway recruitment seed rows)
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
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,300)); });
  page.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0,300)));

  await login(page);
  await page.goto(BASE + PAGE + '#mf-submissions', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'qa-out/inbox-01-open.png', fullPage: false });

  // [1] Header text
  console.log('[1] Verify header rename');
  const brandText = await page.evaluate(() => {
    const el = document.querySelector('.mf-sx-brand');
    return el ? el.textContent.trim() : '';
  });
  console.log('   brand =', JSON.stringify(brandText));
  const headerOk = /Submissions/.test(brandText) && !/MegaForm Inbox/.test(brandText);

  // [2] Row checkboxes are real inputs
  console.log('[2] Row checkboxes are real <input type=checkbox>');
  const cbInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[data-mf-row-cb]'));
    return { count: inputs.length, types: inputs.slice(0, 3).map(i => i.type) };
  });
  console.log('   ', cbInfo);
  const rowCbOk = cbInfo.count > 0 && cbInfo.types.every(t => t === 'checkbox');

  // [3] Select-all behaviour
  console.log('[3] Click select-all checkbox');
  await page.click('input[data-mf-checkall]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'qa-out/inbox-02-selectall.png', fullPage: false });
  const selectAllState = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('input[data-mf-row-cb]'));
    const allChecked = rows.length > 0 && rows.every(r => r.checked);
    const bulkBtn = document.querySelector('[data-mf-bulk-del]');
    const bulkVisible = !!bulkBtn && !bulkBtn.hasAttribute('hidden');
    const bulkCount = (document.querySelector('[data-mf-bulk-count]') || {}).textContent || '';
    return { rowsChecked: rows.filter(r => r.checked).length, totalRows: rows.length, allChecked, bulkVisible, bulkCount };
  });
  console.log('   ', selectAllState);

  // [4] Click select-all again → deselect everything
  console.log('[4] Click select-all again to deselect');
  await page.click('input[data-mf-checkall]');
  await page.waitForTimeout(400);
  const afterDeselect = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('input[data-mf-row-cb]'));
    const bulkBtn = document.querySelector('[data-mf-bulk-del]');
    return { anyChecked: rows.some(r => r.checked), bulkHidden: bulkBtn?.hasAttribute('hidden') };
  });
  console.log('   ', afterDeselect);

  // [5] Tick exactly the first 2 rows manually → bulk-count should be 2
  console.log('[5] Tick first 2 rows individually');
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('input[data-mf-row-cb]')).slice(0, 2);
    rows.forEach(r => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  });
  await page.waitForTimeout(300);
  const twoSelected = await page.evaluate(() => {
    const bulkBtn = document.querySelector('[data-mf-bulk-del]');
    const bulkCount = document.querySelector('[data-mf-bulk-count]');
    const checkAll = document.querySelector('input[data-mf-checkall]');
    return {
      bulkVisible: !!bulkBtn && !bulkBtn.hasAttribute('hidden'),
      bulkCount: bulkCount?.textContent,
      checkAllIndeterminate: checkAll?.indeterminate,
      checkAllChecked: checkAll?.checked
    };
  });
  console.log('   ', twoSelected);
  await page.screenshot({ path: 'qa-out/inbox-03-two-selected.png', fullPage: false });

  // [6] Click "New submission" → form-picker modal opens
  console.log('[6] Click New submission');
  await page.click('button[data-mf-act="compose"]');
  await page.waitForTimeout(700);
  const pickerState = await page.evaluate(() => {
    const ov = Array.from(document.querySelectorAll('.mf-sx-modal-overlay.is-visible'));
    const latest = ov[ov.length - 1];
    const title = latest?.querySelector('.mf-sx-modal-title')?.textContent || '';
    const rows = latest?.querySelectorAll('[data-mf-pick-form]')?.length || 0;
    return { open: ov.length > 0, title, rowCount: rows };
  });
  console.log('   ', pickerState);
  await page.screenshot({ path: 'qa-out/inbox-04-picker.png', fullPage: false });

  // Close picker (use the bound close handler if present, fall back to direct DOM removal)
  await page.evaluate(() => {
    const ov = Array.from(document.querySelectorAll('.mf-sx-modal-overlay'));
    ov.forEach(o => o.remove());
  });
  await page.waitForTimeout(400);

  // [7] Bulk delete the 2 first Interview Feedback rows for real
  console.log('[7] Bulk delete 2 selected rows');
  // Capture which submission IDs we're about to delete so we can verify
  const targetIds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[data-mf-row-cb]'))
      .slice(0, 2)
      .map(r => Number(r.getAttribute('data-mf-row-sub-id')) || 0)
      .filter(n => n > 0);
  });
  console.log('   targetIds =', targetIds);

  // Re-tick the 2 first rows (state may have been reset on re-render after picker open)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('input[data-mf-row-cb]')).slice(0, 2);
    rows.forEach(r => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  });
  await page.waitForTimeout(300);
  page.on('dialog', async d => { console.log('   dialog:', d.message().slice(0,60)); await d.accept(); });
  await page.click('button[data-mf-act="bulk-delete-selected"]');
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'qa-out/inbox-05-after-delete.png', fullPage: false });
  const afterDel = await page.evaluate((ids) => {
    const present = ids.filter(id => !!document.querySelector(`[data-mf-row-sub-id="${id}"]`));
    const pager = document.querySelector('[data-mf-pager-text]')?.textContent || '';
    return { stillPresent: present, pager };
  }, targetIds);
  console.log('   ', afterDel);

  console.log('\n[CONSOLE ERRORS]', errs.slice(0, 6));
  writeFileSync('qa-out/inbox-bulk.json', JSON.stringify({
    headerOk, brandText, cbInfo, selectAllState, afterDeselect, twoSelected, pickerState, targetIds, afterDel, errs
  }, null, 2), 'utf8');

  const pass =
    headerOk
    && rowCbOk
    && selectAllState.allChecked
    && selectAllState.bulkVisible
    && selectAllState.bulkCount === String(selectAllState.totalRows)
    && afterDeselect.anyChecked === false
    && afterDeselect.bulkHidden === true
    && twoSelected.bulkVisible
    && twoSelected.bulkCount === '2'
    && twoSelected.checkAllIndeterminate === true
    && pickerState.open
    && /pick a form/i.test(pickerState.title)
    && pickerState.rowCount > 0
    && afterDel.stillPresent.length === 0;

  console.log(pass ? '\n=== PASS — Submissions inbox rename + bulk delete + compose ===' : '\n=== FAIL — see qa-out/inbox-*.png + inbox-bulk.json ===');
  await browser.close();
  process.exit(pass ? 0 : 2);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
