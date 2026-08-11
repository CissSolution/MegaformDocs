// Dem cac truong SE DUOC POST tren man Posts cua console Blogs, voi trinh soan Rich Text BAT.
// Ly do: ASP.NET gop input trung ten thanh mot chuoi noi bang dau phay, va trinh soan thay the
// ca khoi <textarea name="body"> bang widget cua no - neu widget de lai them mot truong cung ten
// thi than bai (hoac o khac) bi hong ma khong bao gi.
import { chromium } from 'playwright';
const BASE = process.env.DNN_BASE_URL || 'https://dnndefender.com';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(process.env.DNN_USER || 'host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(process.env.DNN_PASSWORD);
await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click()]);
await page.goto(`${BASE}/BlogAdmin?view=posts&edit=${process.argv[2]}`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => {
  const named = {};
  document.querySelectorAll('input[name],select[name],textarea[name]').forEach((el) => {
    const n = el.getAttribute('name');
    if (!/^(dnn|__)/.test(n)) named[n] = (named[n] || 0) + 1;
  });
  return {
    duplicates: Object.entries(named).filter(([, c]) => c > 1),
    body: named['body'] || 0,
    content_type: named['content_type'] || 0,
    editorPresent: !!document.querySelector('.ql-editor, .mfw-rte-wrap'),
  };
}), null, 2));
await browser.close();
