// In ra cau truc menu Persona Bar de biet phai bam vao dau (chay mot lan, khong doan).
import { chromium } from 'playwright';
const BASE = process.env.DNN_BASE_URL || 'https://dnndefender.com';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(process.env.DNN_USER || 'host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(process.env.DNN_PASSWORD);
await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click()]);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(5000);
const frame = page.frames().find((f) => /personabar/i.test(f.url()));
console.log(JSON.stringify(await frame.evaluate(() => {
  const out = [];
  document.querySelectorAll('li, a, div[class*="menu"]').forEach((el) => {
    const t = (el.textContent || '').trim();
    if (t === 'MegaForm' || /^MegaForm$/i.test(t)) {
      out.push({ tag: el.tagName, cls: el.className, id: el.id, parent: el.parentElement?.className || '' });
    }
  });
  return { hits: out.slice(0, 10), rail: [...document.querySelectorAll('#personabar-iconbar li, .personabar-iconbar li')].map(l => l.className).slice(0, 12) };
}), null, 2));
await browser.close();
