// Install MegaForm_01.06.28_Install.zip on DNN10322_MegaTest via Playwright.
// Login as host, navigate to PersonaBar > Settings > Extensions > Install Extension wizard.
import { chromium } from 'playwright-core';

const SITE = 'http://DNN10322_MegaTest.AI';
const PKG  = 'e:\\DNNDEFENDER AND AI DESIGNES\\AI DESIGNES\\MegaFormSolution_280_Oqtane_um\\MegaForm.DNN\\Install\\MegaForm_01.06.28_Install.zip';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

console.log('[install] step 1: open login');
await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);

console.log('[install] step 2: fill host credentials');
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(8000);

console.log('[install] step 3: navigate to PersonaBar Extensions');
// PersonaBar URL: /Host/Extensions or /settings/extensions
await page.goto(SITE + '/Host/Extensions', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(10000);

await page.screenshot({ path: 'qa-out/megatest-install-01-extensions.png', fullPage: false });

const pageState = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  hasInstallBtn: !!document.querySelector('[class*="install" i], button[id*="install" i], a[href*="install" i]'),
  buttons: Array.from(document.querySelectorAll('button, a.btn, [role="button"]')).slice(0, 15).map(b => (b.textContent || '').trim().slice(0, 40))
}));
console.log('[install] pageState=' + JSON.stringify(pageState).slice(0, 1000));

// Click Install Extension button
console.log('[install] step 4: click Install Extension');
const clickRes = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="btn"]'));
  for (const b of btns) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (t === 'install extension' || t.includes('install extension') || t.includes('upload extension')) {
      b.click();
      return { ok: true, txt: t.slice(0, 40) };
    }
  }
  return { ok: false };
});
console.log('[install] click install btn: ' + JSON.stringify(clickRes));
await page.waitForTimeout(4000);

await page.screenshot({ path: 'qa-out/megatest-install-02-after-install-click.png', fullPage: false });

// Find file input and upload
console.log('[install] step 5: find file input');
let inputHandle = await page.$('input[type="file"]');
if (!inputHandle) {
  // Try iframe
  const frames = page.frames();
  for (const f of frames) {
    const ih = await f.$('input[type="file"]');
    if (ih) { inputHandle = ih; break; }
  }
}
if (inputHandle) {
  console.log('[install] step 6: upload file');
  await inputHandle.setInputFiles(PKG);
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'qa-out/megatest-install-03-after-upload.png', fullPage: false });
  console.log('[install] file uploaded');
} else {
  console.log('[install] ERROR: no file input found');
}

// Try clicking Next/Install buttons
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(3000);
  const next = await page.evaluate(() => {
    const sels = ['button', 'a.btn', 'input[type="submit"]', '[role="button"]'];
    const targets = ['next', 'install', 'continue', 'accept', 'agree', 'finish', 'done', 'close', 'review'];
    for (const sel of sels) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const t = (el.textContent || el.value || '').trim().toLowerCase();
        if (targets.some(tg => t === tg || t.startsWith(tg + ' '))) {
          el.click();
          return { ok: true, txt: t.slice(0, 30) };
        }
      }
    }
    // Try in iframes
    const frames = document.querySelectorAll('iframe');
    return { ok: false, frameCount: frames.length };
  });
  console.log('[install] click step ' + i + ': ' + JSON.stringify(next));
  if (!next.ok) {
    // Try iframe internals
    const frames = page.frames();
    let advanced = false;
    for (const f of frames) {
      const r = await f.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, a.btn, input[type="submit"], [role="button"]'));
        const targets = ['next', 'install', 'continue', 'accept', 'agree', 'finish', 'done', 'close', 'review'];
        for (const el of els) {
          const t = (el.textContent || el.value || '').trim().toLowerCase();
          if (targets.some(tg => t === tg || t.startsWith(tg + ' '))) {
            el.click();
            return { ok: true, txt: t.slice(0, 30) };
          }
        }
        return { ok: false };
      }).catch(() => ({ ok: false }));
      if (r.ok) { console.log('[install] iframe click: ' + JSON.stringify(r)); advanced = true; break; }
    }
    if (!advanced) break;
  }
  await page.screenshot({ path: 'qa-out/megatest-install-step-' + i + '.png', fullPage: false });
}

await page.waitForTimeout(5000);
await page.screenshot({ path: 'qa-out/megatest-install-final.png', fullPage: false });

const finalState = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  bodyTextPreview: document.body.innerText.slice(0, 800)
}));
console.log('[install] final state: ' + JSON.stringify(finalState).slice(0, 1500));

await browser.close();
console.log('[install] DONE');
console.log('Errors during install: ' + errors.length);
errors.slice(0, 8).forEach(e => console.log('  ' + e.slice(0, 200)));
