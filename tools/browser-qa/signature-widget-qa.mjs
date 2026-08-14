#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const outDir = resolve('qa-out/final/document-registration-signature');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function loginOqtane(page) {
  await page.goto('http://localhost:5130/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  if ((await page.locator('body').innerText()).includes('Logout')) return;

  const password = page.locator('input[type=password]');
  await password.waitFor({ state: 'visible' });
  const inputs = page.locator('input');
  let username = null;
  for (let i = 0; i < await inputs.count(); i++) {
    const input = inputs.nth(i);
    if ((await input.getAttribute('type')) === 'password') break;
    username = input;
  }
  if (!username) throw new Error('Oqtane username input not found');
  await username.fill('host');
  await password.fill('abc@ABC1024');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Logout'));
}

async function audit(name, url, login = false) {
  const page = await browser.newPage({ viewport: { width: 1216, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  if (login) await loginOqtane(page);
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}qa=${Date.now()}`, {
    waitUntil: 'networkidle', timeout: 90000,
  });

  const scope = name === 'dnn' ? page.locator('#dnn_ctr10610_ModuleContent') : page.locator('body');
  const paper = scope.locator('.drc-paper');
  await paper.waitFor({ state: 'visible' });
  const canvas = scope.locator('.drc-sign canvas');
  const hidden = scope.locator('.drc-sign input[type=hidden][name=signature]');
  const clear = scope.locator('.drc-sign .mf-sig-clear');
  const undo = scope.locator('.drc-sign .mf-sig-undo');
  const select = scope.locator('.drc-paper select.mf-select').first();

  const counts = {
    canvas: await canvas.count(), hidden: await hidden.count(), clear: await clear.count(),
    undo: await undo.count(), select: await select.count(),
  };
  if (counts.canvas !== 1 || counts.hidden !== 1 || counts.clear !== 1) {
    throw new Error(`${name}: signature widget incomplete ${JSON.stringify(counts)}`);
  }

  const before = await hidden.inputValue();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box || box.width < 120 || box.height < 60) throw new Error(`${name}: invalid canvas bounds`);
  await page.mouse.move(box.x + box.width * .18, box.y + box.height * .62);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .34, box.y + box.height * .28, { steps: 8 });
  await page.mouse.move(box.x + box.width * .50, box.y + box.height * .68, { steps: 8 });
  await page.mouse.move(box.x + box.width * .72, box.y + box.height * .34, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const input = document.querySelector('.drc-sign input[type=hidden][name=signature]');
    return String(input?.value || '').startsWith('data:image/png;base64,');
  });
  const drawn = await hidden.inputValue();
  const isEmptyAfterDraw = await scope.locator('.drc-sign .mf-signature-field').evaluate(
    (el) => el.classList.contains('mf-signature-empty'),
  );

  const selectStyle = await select.evaluate((el) => {
    const style = getComputedStyle(el);
    const rendererChevron = el.parentElement?.querySelector('.mf-select-chevron');
    return {
      appearance: style.appearance,
      webkitAppearance: style.webkitAppearance,
      backgroundImage: style.backgroundImage,
      backgroundPosition: style.backgroundPosition,
      paddingLeft: style.paddingLeft,
      backgroundUrlCount: (style.backgroundImage.match(/url\(/g) || []).length,
      rendererChevronDisplay: rendererChevron ? getComputedStyle(rendererChevron).display : 'absent',
    };
  });

  await paper.screenshot({ path: resolve(outDir, `${name}-desktop.png`) });
  await clear.click();
  const cleared = await hidden.inputValue();
  const isEmptyAfterClear = await scope.locator('.drc-sign .mf-signature-field').evaluate(
    (el) => el.classList.contains('mf-signature-empty'),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobile = await paper.evaluate((el) => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    paperWidth: el.getBoundingClientRect().width,
    canvasWidth: el.querySelector('.drc-sign canvas')?.getBoundingClientRect().width || 0,
  }));
  await page.screenshot({ path: resolve(outDir, `${name}-mobile-390.png`), fullPage: true });
  await page.close();

  return {
    name, url, counts, beforeLength: before.length, drawnLength: drawn.length,
    drawnIsPng: drawn.startsWith('data:image/png;base64,'), isEmptyAfterDraw,
    clearedLength: cleared.length, isEmptyAfterClear, selectStyle,
    canvas: { width: Math.round(box.width), height: Math.round(box.height) }, mobile,
    pass: before === '' && drawn.startsWith('data:image/png;base64,') && !isEmptyAfterDraw
      && cleared === '' && isEmptyAfterClear && selectStyle.appearance === 'none'
      && selectStyle.backgroundUrlCount === 1
      && /10px/.test(selectStyle.backgroundPosition)
      && selectStyle.paddingLeft === '8px'
      && (selectStyle.rendererChevronDisplay === 'none' || selectStyle.rendererChevronDisplay === 'absent')
      && mobile.documentWidth <= mobile.viewportWidth,
  };
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
