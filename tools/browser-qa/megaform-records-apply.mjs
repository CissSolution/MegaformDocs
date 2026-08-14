// Tao / cap nhat ban ghi MegaForm tren site that, qua chinh API cua MegaForm.
//
//   node tools/browser-qa/megaform-records-apply.mjs <planFile.json>
//
// plan = { "creates": [ { "formId": 385, "data": {...} } ],
//          "updates": [ { "submissionId": 123, "data": {...TOAN BO...} } ] }
//
// ⚠️ UpdateData GHI DE TOAN BO DataJson roi resync typed rows - no khong phai patch. Nen "data"
// cua moi update phai la ban DAY DU (doc DataJson hien tai ra, sua truong can sua, gui lai ca cum).
// Gui thieu = xoa im lang nhung truong khong gui.
//
// Dung API chinh chu KHONG viet thang vao MF_SubmissionFields: doc di qua typed storage, ma typed
// rows chi dung khi di qua Normalize. SQL tay se lam DataJson va typed lech nhau - dung loi da tung
// lam chet ca blog mot lan (xem Tools/Repair-TypedDateValues.ps1).
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.DNN_BASE_URL || 'https://dnndefender.com';
const USERNAME = process.env.DNN_USER || 'host';
const PASSWORD = process.env.DNN_PASSWORD;
if (!PASSWORD) throw new Error('Set DNN_PASSWORD before running this script.');

const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE_URL}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(USERNAME);
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(PASSWORD);
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);
// networkidle is swallowed by .catch(), so without this the FIRST post can fire before the auth
// cookie lands: on 2026-08-13 a 13-record plan answered 401 on record #1 and 200 on the other 12,
// reporting "thanh cong 12, that bai 1" and leaving the published doc tree HALF re-ordered - the
// branch root still in its old position while all its children had moved.
await page.waitForFunction(() => !!document.querySelector('input[name="__RequestVerificationToken"]'),
  { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);

// POST tu trong ngu canh trang da dang nhap: cookie forms-auth VA RequestVerificationToken deu co
// san o day, khong phai dung lai quy trinh dang nhap cua DNN.
const post = (url, body) => page.evaluate(async ([u, b]) => {
  const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
  const res = await fetch(u, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      RequestVerificationToken: token,
      ModuleId: '-1', TabId: '-1',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(b),
  });
  return { status: res.status, text: (await res.text()).slice(0, 300) };
}, [url, body]);

// An auth failure here is never a real answer about the record - it is a stale/absent token. Mint a
// fresh one from an authenticated page and try that record once more, so a whole plan does not have
// to be re-planned around one 401.
async function postWithRetry(url, body) {
  let r = await post(url, body);
  if (r.status === 401 || r.status === 403) {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const again = await post(url, body);
    console.log(`  (${r.status} -> refreshed antiforgery token -> ${again.status})`);
    r = again;
  }
  return r;
}

let ok = 0, failed = 0;
for (const item of plan.creates || []) {
  const r = await postWithRetry(`${BASE_URL}/API/MegaForm/Submit/Post`, { formId: item.formId, data: item.data, submissionTime: 5 });
  const label = item.data.doc_key || item.data.slug || '(?)';
  console.log(`create ${label.padEnd(30)} ${r.status} ${r.status === 200 ? '' : r.text}`);
  r.status === 200 ? ok++ : failed++;
}
for (const item of plan.updates || []) {
  const r = await postWithRetry(`${BASE_URL}/API/MegaForm/Submissions/UpdateData?submissionId=${item.submissionId}`, item.data);
  console.log(`update #${String(item.submissionId).padEnd(6)} ${String(item.data.doc_key || '').padEnd(24)} ${r.status} ${r.status === 200 ? '' : r.text}`);
  r.status === 200 ? ok++ : failed++;
}
console.log(`\nthanh cong ${ok}, that bai ${failed}`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
