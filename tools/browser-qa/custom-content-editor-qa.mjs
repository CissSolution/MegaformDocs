#!/usr/bin/env node
/**
 * Visual smoke test for the builder's {{content:*}} editor on the local Oqtane QA site.
 *
 * It is intentionally read-only: open two seeded forms, open HTML Token Designer, verify text and
 * image controls, and capture screenshots. No schema value is changed and Save is never clicked.
 *
 *   node tools/browser-qa/custom-content-editor-qa.mjs
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const site = arg('site', 'http://localhost:5130').replace(/\/$/, '');
const user = arg('user', 'host');
const pass = arg('pass', 'abc@ABC1024');
const outDir = resolve(arg('out', 'qa-out/content-editor'));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${site}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
let authed = await page.locator('body').innerText().then((text) => text.includes('Logout'));
if (!authed) {
  await page.locator('input[type=password]').waitFor({ state: 'visible', timeout: 60000 });
  const password = page.locator('input[type=password]');
  const inputs = page.locator('input');
  const count = await inputs.count();
  let username = null;
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    if ((await input.getAttribute('type')) !== 'password') username = input;
    else break;
  }
  if (!username) throw new Error('Oqtane username input not found');
  await username.fill(user);
  await password.fill(pass);
  const login = page.getByRole('button', { name: 'Login', exact: true });
  await login.click();
  await page.waitForFunction(() => document.body.innerText.includes('Logout'), null, { timeout: 60000 });
  authed = true;
}

async function openDesigner({ slug, formId, expectedTextKey, expectedImageKey }) {
  await page.goto(`${site}/${slug}?mfpanel=builder&formid=${formId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.locator('#mf-builder-root').waitFor({ state: 'visible', timeout: 90000 });
  const trigger = page.locator('#mf-open-token-designer, [data-mf-open-html-designer]');
  await trigger.first().waitFor({ state: 'visible', timeout: 90000 });
  await page.screenshot({ path: resolve(outDir, `${slug}-builder.png`), fullPage: false });
  await trigger.first().click();

  const modal = page.locator('#mf-token-designer-modal');
  await modal.waitFor({ state: 'visible', timeout: 30000 });
  const textRows = modal.locator('[data-pane=text] .mf-token-row');
  const imageRows = modal.locator('[data-pane=image] .mf-token-row');
  const textCount = await textRows.count();
  const imageCount = await imageRows.count();
  const textKeyCount = expectedTextKey
    ? await modal.getByText(expectedTextKey, { exact: true }).count()
    : 0;
  const imageKeyCount = expectedImageKey
    ? await modal.getByText(expectedImageKey, { exact: true }).count()
    : 0;

  await page.screenshot({ path: resolve(outDir, `${slug}-text-tokens.png`), fullPage: false });
  if (expectedImageKey) {
    await modal.locator('[data-tab=image]').click();
    await page.screenshot({ path: resolve(outDir, `${slug}-image-tokens.png`), fullPage: false });
  }

  await modal.locator('.mf-token-designer-close').click();
  return { slug, formId, textCount, imageCount, textKeyCount, imageKeyCount };
}

const results = [];
results.push(await openDesigner({
  slug: 'mf-ielts-report',
  formId: 16,
  expectedTextKey: 'ielts',
  expectedImageKey: null,
}));
results.push(await openDesigner({
  slug: 'mf-invoice-codexo',
  formId: 31,
  expectedTextKey: 'codexo',
  expectedImageKey: 'logo_image',
}));

console.log(JSON.stringify({ authed, outDir, results }, null, 2));
await browser.close();

const failed = results.some((item) =>
  item.textCount < 1
  || item.textKeyCount < 1
  || (item.slug === 'mf-invoice-codexo' && (item.imageCount < 1 || item.imageKeyCount < 1)));
process.exit(failed ? 1 : 0);
