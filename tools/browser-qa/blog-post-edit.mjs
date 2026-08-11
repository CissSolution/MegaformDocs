// Doc / sua THAN BAI mot bai blog qua chinh console Blogs, bang trinh duyet dang nhap that.
//
//   dump:  node tools/browser-qa/blog-post-edit.mjs dump  <submissionId> <outFile>
//   apply: node tools/browser-qa/blog-post-edit.mjs apply <submissionId> <bodyFile> [contentType]
//
// DNN_PASSWORD bat buoc. DNN_BASE_URL / DNN_USER co mac dinh nhu cac cong cu live khac.
//
// ⭐ Chan megaform-widgets.js: o che do binh thuong console THAY the <textarea name="body"> bang
// trinh soan Rich Text, nen ghi thang vao textarea se bi trinh soan ghi de luc submit. Chan file
// do lai thi nhanh du phong (chinh cai textarea) duoc giu nguyen va la thu duoc POST. Day la cach
// duy nhat ghi 50KB HTML vao than bai ma khong phai lai mot trinh soan WYSIWYG.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.DNN_BASE_URL || 'https://dnndefender.com';
const USERNAME = process.env.DNN_USER || 'host';
const PASSWORD = process.env.DNN_PASSWORD;
const [, , mode, submissionId, fileArg, contentType] = process.argv;

if (!PASSWORD) throw new Error('Set DNN_PASSWORD before running this script.');
if (!['dump', 'apply'].includes(mode)) throw new Error('mode phai la dump hoac apply');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.route('**/megaform-widgets.js*', (route) => route.abort());
await context.route('**/megaform-widget-rich-text.js*', (route) => route.abort());
const page = await context.newPage();

await page.goto(`${BASE_URL}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(USERNAME);
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(PASSWORD);
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

const editUrl = `${BASE_URL}/BlogAdmin?view=posts&edit=${submissionId}`;
await page.goto(editUrl, { waitUntil: 'networkidle', timeout: 120000 });

const body = await page.locator('textarea[name="body"]').inputValue();
console.log('than bai doc duoc: ' + body.length + ' ky tu');

if (mode === 'dump') {
  fs.writeFileSync(fileArg, body, 'utf8');
  console.log('da ghi ' + fileArg);
} else {
  const next = fs.readFileSync(fileArg, 'utf8');
  console.log('than bai moi: ' + next.length + ' ky tu');
  await page.locator('textarea[name="body"]').fill(next);
  if (contentType) {
    await page.selectOption('select[name="content_type"]', contentType);
    console.log('content_type -> ' + contentType);
  }
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {}),
    page.locator('button[name="mfb_action"][value="save"]').click(),
  ]);
  await page.waitForTimeout(1500);
  const notice = await page.locator('.mfba-notice, .mfb-notice').first().innerText().catch(() => '(khong thay thong bao)');
  console.log('thong bao: ' + notice.trim().slice(0, 200));
}

await browser.close();
