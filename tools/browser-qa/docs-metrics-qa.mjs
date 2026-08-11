// Di het cac trang tai lieu cua mot kenh docs va DOC bo dem tren man hinh, khong doan qua HTML.
//
//   node tools/browser-qa/docs-metrics-qa.mjs <url> <outDir> [maxPages]
//
// Vi sao khong dem chuoi trong HTML: bo dem hien o HAI cho (dau bai va dong cay ben trai) va cai
// hong lan truoc la "ghi khong xuong" chu khong phai "khong in ra" - nen phai doc dung phan tu tren
// trang da render, va chup lai de nhin.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://dnndefender.com/MegaFormDocsT';
const outDir = path.resolve(process.argv[3] || 'docs-qa');
const maxPages = parseInt(process.argv[4], 10) || 100;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
// Mot context duy nhat = mot phien: module dem MOT lan cho moi bai tren moi phien, nen di het luot
// nay moi bai duoc +1, khong phai +N.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });

const docs = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="doc="]')]
    .map((a) => a.href)
    .filter((h) => /[?&]doc=[^&]+/.test(h)))]);
console.log('tim thay ' + docs.length + ' trang tai lieu');

const rows = [];
for (const href of docs.slice(0, maxPages)) {
  const key = decodeURIComponent((href.match(/[?&]doc=([^&]+)/) || [])[1] || '');
  await page.goto(href, { waitUntil: 'networkidle', timeout: 180000 });
  const seen = await page.evaluate(() => {
    const head = document.querySelector('.mfb-tree-main .mfb-nodemeta, .mfb-tree-main .mfb-docmeta');
    const active = document.querySelector('.mfb-tree-nav .active .mfb-nodemeta, .mfb-tree-nav [aria-current] .mfb-nodemeta');
    const text = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
    // Du phong: bat cu doan nao co dang "N views" trong khung noi dung.
    const anyMain = (document.querySelector('.mfb-tree-main')?.innerText || '').match(/\d+\s+views?/);
    return { head: text(head), treeRow: text(active), anyMain: anyMain ? anyMain[0] : null };
  });
  rows.push({ key, ...seen });
  console.log(`${key.padEnd(34)} dau bai: ${String(seen.head || seen.anyMain).slice(0, 40)}`);
}

fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(rows, null, 2));
const missing = rows.filter((r) => !/\d+\s+views?/.test(`${r.head || ''} ${r.anyMain || ''}`));
console.log(`\nkhong thay bo dem: ${missing.length}/${rows.length}` +
  (missing.length ? ' -> ' + missing.map((m) => m.key).join(', ') : ''));

// Chup lai trang dau tien va mot trang giua de nhin bang mat.
await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
await page.screenshot({ path: path.join(outDir, 'index.png') });
if (docs.length > 1) {
  await page.goto(docs[Math.floor(docs.length / 2)], { waitUntil: 'networkidle', timeout: 180000 });
  await page.screenshot({ path: path.join(outDir, 'middle.png') });
}
await browser.close();
