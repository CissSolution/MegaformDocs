// Proves "Add to current page" really targets the page behind the panel: opens the panel from a
// known tab, checks the label, the pre-selected entry, and that Confirm reports back that tab.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const hostPage = process.argv[5] || '/mfqa-wide?mfFormId=221';
const outDir = path.resolve(process.argv[6] || 'qa-out/pb-currentpage');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 700 } });

await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('input[id*="txtUsername"]').fill(process.argv[3] || 'admin');
await page.locator('input[id*="txtPassword"]').fill(process.argv[4] || 'dnnhost');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
                   page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);
await page.goto(site + hostPage, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);

const hostTabId = await page.evaluate(() => {
  try { return parseInt(window.dnn.getVar('sf_tabId'), 10) || 0; } catch { return 0; }
});
const pb = page.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
await pb.locator('li#Content').first().click();
await pb.waitForTimeout(600);
await pb.locator('li#MegaForm').first().click();
await pb.waitForSelector('.mf-pb-table tbody tr', { timeout: 45000 });
await page.mouse.move(900, 500);
await page.waitForTimeout(1500);

const actionLabel = (await pb.locator('.mf-pb-addto').first().textContent()).trim();
await pb.locator('.mf-pb-addto').first().click();
await pb.waitForSelector('.mf-pb-drop', { timeout: 30000 });
await page.waitForTimeout(1500);

const picker = await pb.evaluate(() => {
  const box = document.querySelector('.mf-pb-drop');
  const buttons = Array.from(box.querySelectorAll('.mf-pb-pagelist button'));
  const first = buttons[0];
  const active = box.querySelector('.mf-pb-pagelist button.is-active');
  return {
    title: box.querySelector('h4')?.textContent.trim(),
    firstIsCurrent: !!first?.classList.contains('is-current'),
    firstText: (first?.textContent || '').trim().slice(0, 60),
    badge: first?.querySelector('.mf-pb-here')?.textContent.trim() || null,
    activeIsFirst: active === first,
    confirmEnabled: !document.querySelector('.mf-pb-confirm')?.disabled,
    pageCount: buttons.length,
  };
});
await page.screenshot({ path: path.join(outDir, 'picker.png') });

// Confirm, then read what the server said it did.
const posted = [];
page.on('request', (r) => { if (r.url().includes('AddToPage')) posted.push(r.postData()); });
await pb.locator('.mf-pb-confirm').click();
await page.waitForTimeout(4000);
const result = await pb.evaluate(() => (document.querySelector('.mf-pb-alert')?.textContent || '').trim().slice(0, 160));
await page.screenshot({ path: path.join(outDir, 'after-add.png') });

const report = { hostPage, hostTabId, actionLabel, picker, posted, result };
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
