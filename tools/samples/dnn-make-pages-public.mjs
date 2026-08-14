/**
 * Give a DNN page the same permission grid a page that is already public has.
 *
 * Why this exists: MegaForm's `Phase2/PinToNewPage` creates the tab with `TabController.AddTab`
 * and no permission grid, so DNN falls back to Administrators-only. An anonymous visitor is
 * redirected to /Login — while the page still answers **HTTP 200**, so any check that trusts the
 * status code says the demo is fine. It is not: the first recording of the SQL-insert walkthrough
 * filmed a login form.
 *
 * The fix copies the WHOLE `permissions` object from a reference page rather than switching on
 * role -1, so the demo pages end up with exactly the grid the rest of the site uses.
 *
 * Run:
 *   node tools/samples/dnn-make-pages-public.mjs --site http://dnn_megafresh.ai \
 *        --user host --pass 'Dnn@Host2026' --from 21 --pages 37,38,39
 */
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg('site', 'http://dnn_megafresh.ai').replace(/\/$/, '');
const USER = arg('user', 'host');
const PASS = arg('pass', 'Dnn@Host2026');
const FROM = Number(arg('from', '21'));                       // a page that IS public
const PAGES = arg('pages', '').split(',').map((s) => Number(s.trim())).filter(Boolean);
if (!PAGES.length) throw new Error('pass --pages 37,38,39');

const host = new URL(SITE).hostname;
const browser = await chromium.launch({
  headless: true,
  args: /^(localhost|127\.)/.test(host) ? [] : [`--host-resolver-rules=MAP ${host} 127.0.0.1`],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto(`${SITE}/Login?returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(USER);
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
    page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
  ]);
  await page.waitForTimeout(3000);

  const result = await page.evaluate(async ({ from, pages }) => {
    const token = () => document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
    const get = async (u) => {
      const r = await fetch(u, { credentials: 'include', headers: { RequestVerificationToken: token() } });
      return { status: r.status, json: r.ok ? await r.json() : null };
    };
    const post = async (u, body) => {
      const r = await fetch(u, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', RequestVerificationToken: token() },
        body: JSON.stringify(body),
      });
      return { status: r.status, text: (await r.text()).slice(0, 300) };
    };

    // GetPageDetails answers { page: {...}, ValidationCode }, not the page object itself.
    const ref = await get('/API/PersonaBar/Pages/GetPageDetails?pageId=' + from);
    const refPage = ref.json && ref.json.page;
    if (!refPage) return { error: 'reference page ' + from + ' unreadable (' + ref.status + ')' };
    const grid = refPage.permissions;

    const out = [];
    for (const id of pages) {
      const cur = await get('/API/PersonaBar/Pages/GetPageDetails?pageId=' + id);
      const curPage = cur.json && cur.json.page;
      if (!curPage) { out.push({ pageId: id, error: 'unreadable ' + cur.status }); continue; }
      const before = (curPage.permissions?.rolePermissions || []).length;
      curPage.permissions = grid;
      const saved = await post('/API/PersonaBar/Pages/SavePageDetails', curPage);
      out.push({ pageId: id, name: curPage.name, rolesBefore: before,
                 rolesAfter: (grid.rolePermissions || []).length,
                 saveStatus: saved.status, body: saved.status >= 300 ? saved.text : undefined });
    }
    return { referenceRoles: (grid.rolePermissions || []).map((r) => r.roleName), out };
  }, { from: FROM, pages: PAGES });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
