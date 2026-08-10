// Proves the Persona Bar column sort is a SERVER sort: the order must change across the whole
// list, not just inside the 20 rows the panel happens to hold. For each column it reads page 1
// and page 2, checks the values are monotonic within the page AND that page 2 continues page 1.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const outDir = path.resolve(process.argv[5] || 'qa-out/pb-sort');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.argv[6] || 1365), height: Number(process.argv[7] || 675) } });

await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('input[id*="txtUsername"]').fill(process.argv[3] || 'admin');
await page.locator('input[id*="txtPassword"]').fill(process.argv[4] || 'dnnhost');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
                   page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);
await page.goto(site + '/mf-templates/mf-xmas-sale', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);
let pb = page.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
await pb.locator('li#Content').first().click();
await pb.waitForTimeout(600);
await pb.locator('li#MegaForm').first().click();
await pb.waitForSelector('.mf-pb-table tbody tr', { timeout: 45000 });
// The Content group's flyout stays open over the panel and eats the first clicks; move the
// pointer into the panel so it closes before anything is measured.
await page.mouse.move(900, 500);
await page.waitForTimeout(1200);

const readPage = () => pb.evaluate(() => ({
  rows: Array.from(document.querySelectorAll('.mf-pb-table tbody tr')).map((tr) => ({
    title: (tr.querySelector('.mf-pb-formtitle')?.textContent || '').trim(),
    subs: Number((tr.querySelectorAll('.mf-pb-num')[1]?.textContent || '0').trim()),
    modified: (tr.querySelector('.mf-pb-modified')?.textContent || '').trim(),
  })),
  pageInfo: (document.querySelector('.mf-pb-pageinfo')?.textContent || '').trim(),
  ariaSort: Array.from(document.querySelectorAll('.mf-pb-table th[data-mf-sort]'))
    .map((th) => th.getAttribute('data-mf-sort') + '=' + th.getAttribute('aria-sort')),
}));

const results = [];
for (const col of ['title', 'submissions', 'modified']) {
  for (const pass of [1, 2]) {           // first click, then the reverse
    await pb.locator(`.mf-pb-table th[data-mf-sort="${col}"] .mf-pb-sort`).click();
    await page.waitForTimeout(1800);
    const p1 = await readPage();
    await pb.locator('.mf-pb-next').click();
    await page.waitForTimeout(1800);
    const p2 = await readPage();
    await pb.locator('.mf-pb-prev').click();
    await page.waitForTimeout(1500);

    const key = col === 'title' ? 'title' : (col === 'submissions' ? 'subs' : 'modified');
    const vals1 = p1.rows.map((r) => r[key]);
    const vals2 = p2.rows.map((r) => r[key]);
    const cmp = (a, b) => (key === 'subs' ? a - b : String(a).localeCompare(String(b)));
    const dir = p1.ariaSort.find((s) => s.startsWith(col)).split('=')[1];
    const sign = dir === 'ascending' ? 1 : -1;
    const monotonic = (list) => list.every((v, i) => i === 0 || sign * cmp(list[i - 1], v) <= 0);

    results.push({
      column: col, click: pass, ariaSort: dir,
      page1First: vals1[0], page1Last: vals1[vals1.length - 1], page2First: vals2[0],
      page1Monotonic: monotonic(vals1),
      page2ContinuesPage1: vals2.length ? sign * cmp(vals1[vals1.length - 1], vals2[0]) <= 0 : null,
      pageInfoAfterNext: p2.pageInfo,
    });
  }
}
fs.writeFileSync(path.join(outDir, 'sort-report.json'), JSON.stringify(results, null, 2));
await page.screenshot({ path: path.join(outDir, 'sorted.png') });
console.log(JSON.stringify(results, null, 1));
await browser.close();
