/**
 * Upload the demo GIFs to a DNN portal folder so the published docs can point at real images.
 *
 * The docs channel renders whatever HTML the article carries; DocFX's `../images/...` paths do not
 * exist on the site, so without this step every GIF in the published article degrades to a caption.
 *
 * Uses DNN's own file-upload service from inside an authenticated page — the session cookie and
 * the RequestVerificationToken both live there already.
 *
 * Run:
 *   node tools/samples/dnn-upload-docs-images.mjs --files 30-db-pane-groups.gif,32-sql-insert-lead.gif
 * Env: DNN_PASSWORD (required)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg('site', 'https://dnndefender.com').replace(/\/$/, '');
const USER = arg('user', process.env.DNN_USER || 'host');
const PASS = arg('pass', process.env.DNN_PASSWORD);
const FOLDER = arg('folder', 'MegaFormDocs');
const SRCDIR = arg('dir', 'demo-gifs');
const FILES = arg('files', '').split(',').map((s) => s.trim()).filter(Boolean);
if (!PASS) throw new Error('Set DNN_PASSWORD (or pass --pass).');
if (!FILES.length) throw new Error('pass --files a.gif,b.gif');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto(`${SITE}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(USER);
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
    page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
  ]);
  await page.waitForTimeout(3000);

  const out = [];
  for (const name of FILES) {
    const full = path.resolve(SRCDIR, name);
    const bytes = Array.from(fs.readFileSync(full));
    const res = await page.evaluate(async ({ name, bytes, folder }) => {
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
      const fd = new FormData();
      fd.append('folder', folder);
      fd.append('filter', '');
      fd.append('overwrite', 'true');
      fd.append('isHostMenu', 'false');
      fd.append('extract', 'false');
      fd.append('postfile', blob, name);
      const r = await fetch('/API/internalservices/fileupload/postfile', {
        method: 'POST', credentials: 'include',
        headers: { RequestVerificationToken: token },
        body: fd,
      });
      return { status: r.status, text: (await r.text()).slice(0, 400) };
    }, { name, bytes, folder: FOLDER });
    out.push({ name, sizeKB: Math.round(bytes.length / 1024), ...res });
    console.log(`${name}  ${Math.round(bytes.length / 1024)} KB  -> ${res.status}`);
  }

  console.log('\n' + JSON.stringify(out, null, 2));
  console.log('\nExpected public URLs:');
  for (const f of FILES) console.log(`  ${SITE}/Portals/0/${FOLDER}/${f}`);
} finally {
  await browser.close();
}
