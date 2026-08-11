// Bien doi than bai blog: gan class cho cac khoi the, va bo cac doan bien tap lot vao bai.
//
//   node tools/browser-qa/blog-body-transform.mjs <inFile> <outFile>
//
// Chay trong DOM that (headless) chu khong bang regex: than bai la HTML bien tap 19KB, mot regex
// nham the dong se lam hong ca bai. Dung chung ham TRANSFORM voi prose-blocks.mjs de ban xem thu
// va ban ghi vao CSDL khong the lech nhau.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { TRANSFORM } from './prose-blocks.mjs';

const [, , inFile, outFile] = process.argv;
const source = fs.readFileSync(inFile, 'utf8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const result = await page.evaluate(([html, fn]) => {
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const counts = eval('(' + fn + ')')(doc.body);

  // Ghi chu bien tap lot vao ban dang: no nam ngay duoi tieu de dau tien va doc nhu sapo.
  let notes = 0;
  doc.body.querySelectorAll('p').forEach((p) => {
    if (/A more article-like introduction to why MegaForm matters/i.test(p.textContent || '')) {
      p.remove();
      notes++;
    }
  });

  return { html: doc.body.innerHTML, ...counts, notes };
}, [source, TRANSFORM]);
await browser.close();

fs.writeFileSync(outFile, result.html, 'utf8');
console.log(`khoi: ${result.wrappers} · the: ${result.blocks} · ghi chu bien tap da bo: ${result.notes}`);
console.log(`do dai: ${source.length} -> ${result.html.length}`);
