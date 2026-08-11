// Mo panel MegaForm tren Persona Bar bang Playwright va chup lai + do kich thuoc that.
//
//   node tools/browser-qa/pb-megaform-shot.mjs <outDir> [nhan]
//
// Vi sao khong dung personabar-megaform.mjs co san: cong cu do dieu khien Chrome that qua CDP va
// chet khi tren may dang co cua so Chrome mo. Playwright tu bung Chromium rieng nen khong dinh.
//
// Persona Bar la SPA Knockout nam trong <iframe id="personaBar-iframe">, moi thu nap sau khi JS
// chay - nen phai click that, khong doc duoc bang curl.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.DNN_BASE_URL || 'https://dnndefender.com';
const outDir = path.resolve(process.argv[2] || 'pb-shot');
const label = process.argv[3] || 'pb';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(process.env.DNN_USER || 'host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(process.env.DNN_PASSWORD);
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {}),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(4000);

const frame = page.frames().find((f) => /personabar/i.test(f.url())) || null;
console.log('iframe persona bar: ' + (frame ? 'co' : 'KHONG THAY'));

let clicked = false;
if (frame) {
  // Muc menu that la li#MegaForm (do pb-menu-probe.mjs in ra). Khong dung :has-text hay getByText:
  // ca hai deu khop trung vao node "MegaForm" trong CAY TRANG cua man Pages, va anh chup ra man
  // Pages chu khong phai dashboard - da dinh hai lan.
  const item = frame.locator('li#MegaForm').first();
  if (await item.count()) {
    await item.click({ timeout: 15000 }).catch(() => {});
    clicked = true;
    await page.waitForTimeout(8000);
  }
}
console.log('da bam MegaForm: ' + clicked);

const size = await page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left) };
  };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    iframe: box('#personaBar-iframe'),
    panel: box('.personabarpanel, #personabar-panel, .socialpanel'),
    bodyClasses: document.body.className,
  };
});
console.log(JSON.stringify(size));
fs.writeFileSync(path.join(outDir, `${label}-metrics.json`), JSON.stringify(size, null, 2));
await page.screenshot({ path: path.join(outDir, `${label}.png`) });
console.log('anh: ' + path.join(outDir, `${label}.png`));
await browser.close();
