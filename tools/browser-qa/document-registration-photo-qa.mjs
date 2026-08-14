#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const fixture = 'C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-6e7203b3-21ad-4027-b0c1-0d134aaabb06.png';
const outDir = resolve('qa-out/final/document-registration-photo');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function login(page) {
  await page.goto('http://localhost:5130/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  if ((await page.locator('body').innerText()).includes('Logout')) return;
  const pw = page.locator('input[type=password]');
  await pw.waitFor({ state: 'visible' });
  const inputs = page.locator('input');
  let un = null;
  for (let i = 0; i < await inputs.count(); i++) {
    const candidate = inputs.nth(i);
    if ((await candidate.getAttribute('type')) === 'password') break;
    un = candidate;
  }
  await un.fill('host');
  await pw.fill('abc@ABC1024');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Logout'));
}

async function audit(name, url, needsLogin = false) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.setDefaultTimeout(60000);
  if (needsLogin) await login(page);
  const uploads = [];
  let chooserCount = 0;
  page.on('filechooser', () => { chooserCount += 1; });
  page.on('response', (response) => {
    if (/Upload\/File/i.test(response.url())) uploads.push({ url: response.url(), status: response.status() });
  });
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}qa=${Date.now()}`, {
    waitUntil: 'networkidle', timeout: 90000,
  });
  const scope = name === 'dnn' ? page.locator('#dnn_ctr10610_ModuleContent') : page.locator('body');
  const photo = scope.locator('.drc-photo');
  const zone = photo.locator('.mf-file-dropzone');
  const input = zone.locator('input[type=file]');
  await photo.scrollIntoViewIfNeeded();
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
  await zone.click({ position: { x: 30, y: 35 } });
  const chooser = await chooserPromise;
  await chooser.setFiles(fixture);
  await page.waitForFunction(() => document.querySelector('.drc-photo')?.classList.contains('has-photo'));
  await page.waitForFunction(() => {
    const img = document.querySelector('.drc-photo-preview');
    return img && img.complete && img.naturalWidth > 1;
  });
  await page.waitForTimeout(5000);
  const result = await photo.evaluate((root) => {
    const fileInput = root.querySelector('input[type=file]');
    const hidden = root.querySelector('input[type=hidden]');
    const preview = root.querySelector('.drc-photo-preview');
    const error = root.closest('.mf-field-group')?.querySelector('.mf-field-error');
    return {
      role: root.getAttribute('role') || '',
      tabindex: root.getAttribute('tabindex') || '',
      selectedFiles: fileInput?.files?.length || 0,
      hiddenPresent: !!hidden,
      hiddenLength: hidden?.value?.length || 0,
      previewWidth: preview?.naturalWidth || 0,
      previewHeight: preview?.naturalHeight || 0,
      uploadedClass: root.classList.contains('is-uploaded'),
      error: error?.textContent?.trim() || '',
    };
  });
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: false });
  await page.close();
  return { name, ...result, chooserCount, uploads, pass: chooserCount === 1
    && result.role === 'button' && result.tabindex === '0'
    && result.selectedFiles === 1 && result.previewWidth > 1 && result.uploadedClass
    && uploads.some((upload) => upload.status >= 200 && upload.status < 300)
    && (!result.hiddenPresent || result.hiddenLength > 0) && !result.error };
}

const results = [];
try {
  results.push(await audit('dnn', 'http://megaclean008.ai/mfqa-wide?mfFormId=221'));
  results.push(await audit('oqtane', 'http://localhost:5130/mf-document-registration', true));
} finally {
  await browser.close();
}
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(results, null, 2));
for (const result of results) console.log(`${result.name}: ${result.pass ? 'PASS' : 'FAIL'}`, result);
if (results.some((result) => !result.pass)) process.exitCode = 1;
