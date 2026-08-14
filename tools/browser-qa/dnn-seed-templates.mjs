/**
 * Re-seed the DNN dev site's forms from the template folder, over a Playwright session.
 *
 * Same job as `dnn-api-post.mjs … DevBulkCreateForms`, but it does not spawn the machine's own
 * Chrome: that helper attaches to whatever chrome.exe is already running, and once the owner had
 * their own Chrome open every call came back "TypeError: Failed to fetch" while the endpoint
 * itself answered 401/200 to curl. Playwright brings its own browser, so the session is ours.
 *
 *   node tools/browser-qa/dnn-seed-templates.mjs [site] [user] [pass]
 */
import { chromium } from 'playwright';

const SITE = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const USER = process.argv[3] || 'admin';
const PASS = process.argv[4] || 'dnnhost';
const API = '/DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${SITE}/Login?returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', USER).catch(async () => {
  await page.fill('input[id*="txtUsername"]', USER);
});
await page.fill('input[id*="txtPassword"]', PASS);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}),
  page.click('a[id*="cmdLogin"], input[id*="cmdLogin"], #dnn_ctr_Login_Login_DNN_cmdLogin'),
]);
await page.waitForTimeout(2500);

const authed = await page.evaluate(() => document.body.innerHTML.indexOf('/ctl/Logoff') >= 0);
console.log('session:', authed ? 'authenticated' : 'ANONYMOUS');
if (!authed) { await browser.close(); process.exit(2); }

const out = await page.evaluate(async (api) => {
  let token = '';
  try {
    const sf = window.jQuery && window.jQuery.ServicesFramework && window.jQuery.ServicesFramework(0);
    if (sf) token = sf.getAntiForgeryValue();
  } catch (e) { /* fall through to the hidden input */ }
  if (!token) {
    const el = document.querySelector('input[name="__RequestVerificationToken"]');
    if (el) token = el.value;
  }
  try {
    const r = await fetch(api, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', RequestVerificationToken: token,
      },
      body: '{}',
    });
    return { status: r.status, hadToken: !!token, body: (await r.text()).slice(0, 4000) };
  } catch (e) {
    return { status: 0, hadToken: !!token, body: 'fetch failed: ' + e.message };
  }
}, API);

console.log('HTTP', out.status, 'token', out.hadToken);
const m = out.body.match(/"totalTemplates":(\d+).*?"created":(\d+),"updated":(\d+),"failed":(\d+)/);
console.log(m ? `templates ${m[1]}  created ${m[2]}  updated ${m[3]}  failed ${m[4]}`
              : out.body.slice(0, 600));
await browser.close();
process.exit(out.status === 200 ? 0 : 1);
