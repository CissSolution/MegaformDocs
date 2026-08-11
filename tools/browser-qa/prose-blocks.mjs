// Gan class cho cac khoi "the" trong THAN BAI blog, va xem thu ket qua trên trang that.
//
// Vi sao can: than bai cua bai launch duoc viet bang <div> tran, khong class nao het —
// <div><span>Payment</span><h3>..</h3><p>..</p></div>. Khong co gi de CSS bam vao, nen 12 nhan
// hien ra nhu chu troi giua bai. Khong phai icon hong (gia thuyet ban dau); dem DOM moi ra.
//
//   xem thu:  node tools/browser-qa/prose-blocks.mjs preview <url> <cssFile> <outDir>
//   doi chuoi: import { TRANSFORM } tu file nay va chay trong ngu canh co DOM.
//
// TRANSFORM duoc viet duoi dang CHUOI ham de chay duoc ca trong page.evaluate lan tren mot
// DOMParser — mot ban duy nhat, nen ban xem thu va ban ghi vao CSDL khong the lech nhau.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const TRANSFORM = `(root) => {
  const isBlock = (el) =>
    el.tagName === 'DIV' && el.children.length === 3 &&
    (el.children[0].tagName === 'SPAN' || el.children[0].tagName === 'DIV') &&
    el.children[0].children.length === 0 &&
    el.children[1].tagName === 'H3' && el.children[2].tagName === 'P';

  let wrappers = 0, blocks = 0;
  root.querySelectorAll('div').forEach((wrap) => {
    const kids = [...wrap.children];
    if (kids.length < 2 || !kids.every(isBlock)) return;
    wrap.classList.add('mfb-blocks');
    wrappers++;
    kids.forEach((kid) => {
      kid.classList.add('mfb-block');
      const tag = kid.children[0];
      // Phan loai theo NOI DUNG, khong theo the: nhan chu cung duoc viet bang <div> ("DB", "CRM",
      // "WF"), va neu doan theo the thi "CRM" bi nhet vao huy hieu tron 30px va cut con "CR".
      const isNumber = /^\\d+$/.test((tag.textContent || '').trim());
      tag.classList.add(isNumber ? 'mfb-block-num' : 'mfb-block-tag');
      blocks++;
    });
  });
  return { wrappers, blocks };
}`;

if (process.argv[2] === 'preview') {
  const [, , , url, cssFile, outDirArg] = process.argv;
  const outDir = path.resolve(outDirArg || 'tiles-blocks');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  if (cssFile && cssFile !== '-') {
    // Cuoi body: DNN dat <link> CSS cua module trong form, nen tiem o head se thua khi bang diem.
    await page.evaluate((css) => {
      const tag = document.createElement('style');
      tag.textContent = css;
      document.body.appendChild(tag);
    }, fs.readFileSync(cssFile, 'utf8'));
  }
  const counts = await page.evaluate(
    ([fn]) => eval('(' + fn + ')')(document.querySelector('.mfb-prose') || document.body),
    [TRANSFORM]);
  console.log('gan class: ' + counts.wrappers + ' khoi, ' + counts.blocks + ' the');

  // Chup dung nhung the vua gan class, chu khong chup ca trang: cai can nhin la tung the.
  const shots = await page.$$('.mfb-blocks');
  for (let i = 0; i < shots.length; i++) {
    await shots[i].scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shots[i].screenshot({ path: path.join(outDir, `block-${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log('da chup ' + shots.length + ' anh vao ' + outDir);
  await browser.close();
}
