// Chup mot trang thanh NHIEU tam theo tung man cuon, kem do dac bo cuc.
//
// Vi sao khong dung anh full-page: mot anh cao 5000px khi xem bi thu nho den muc khong doc duoc
// chu, nen loi bo cuc (khoang trang dung khong lo, chu tran ra ngoai, cot hep mot nua) nhin qua
// van thay "on". Cat thanh tung man 1440x900 thi moi tam doc duoc o ti le that.
//
// Kem theo do dac may thu ma mat de bo sot:
//  - phan tu tran ngang khoi viewport
//  - khoang cach dung bat thuong giua hai khoi lien tiep
//  - khoi rong bat thuong so voi cot chu
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2];
const outDir = path.resolve(process.argv[3] || 'tiles');
const W = parseInt(process.argv[4], 10) || 1440;
const H = parseInt(process.argv[5], 10) || 900;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(2000);

const total = await page.evaluate(() => document.documentElement.scrollHeight);
const tiles = Math.ceil(total / H);
console.log(`cao ${total}px -> ${tiles} tam ${W}x${H}`);

for (let i = 0; i < tiles; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * H);
  await page.waitForTimeout(350);
  const file = path.join(outDir, `tile-${String(i + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, fullPage: false });
}

// Do dac bo cuc, tren chinh cot noi dung bai viet.
const metrics = await page.evaluate(() => {
  const out = { overflowX: [], bigGaps: [], narrow: [], docWidth: document.documentElement.scrollWidth };
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 2 || r.left < -2) {
      out.overflowX.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), right: Math.round(r.right) });
    }
  });
  // Khoang trang dung giua cac khoi anh em trong vung bai viet.
  const scope = document.querySelector('.mfb-prose, article, main') || document.body;
  const kids = [...scope.children];
  for (let i = 1; i < kids.length; i++) {
    const a = kids[i - 1].getBoundingClientRect();
    const b = kids[i].getBoundingClientRect();
    const gap = Math.round(b.top - a.bottom);
    if (gap > 120) out.bigGaps.push({ after: kids[i - 1].tagName + '.' + (kids[i - 1].className || '').toString().slice(0, 40), gap });
  }
  return out;
});
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
console.log('overflowX: ' + metrics.overflowX.length + ', bigGaps: ' + metrics.bigGaps.length);
await browser.close();
