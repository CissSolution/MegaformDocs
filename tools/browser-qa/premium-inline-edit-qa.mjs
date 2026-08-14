#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const forms = [
  ['xmas-sale', 25], ['xmas-newsletter', 30], ['agency-flyer', 26], ['first-book', 24],
  ['gold-suite', 28], ['rose-wellness', 29], ['newsletter-amber', 27], ['job-application', 21],
  ['lagoon-booking', 22], ['product-order', 23], ['golden-pro', 18], ['invoice-navy', 19],
  ['invoice-spinera', 20], ['invoice-codexo', 31], ['corporate-reg', 17], ['ielts-report', 16],
  ['massage-intake', 15], ['massage-body', 14], ['festa-italiana', 32],
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const site = arg('site', 'http://localhost:5130').replace(/\/$/, '');
const outDir = resolve(arg('out', 'qa-out/premium-inline-edit'));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(60000);

await page.goto(`${site}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
if (!(await page.locator('body').innerText()).includes('Logout')) {
  const password = page.locator('input[type=password]');
  await password.waitFor({ state: 'visible' });
  const inputs = page.locator('input');
  let username = null;
  for (let i = 0; i < await inputs.count(); i++) {
    const input = inputs.nth(i);
    if ((await input.getAttribute('type')) === 'password') break;
    username = input;
  }
  if (!username) throw new Error('Username input not found');
  await username.fill(arg('user', 'host'));
  await password.fill(arg('pass', 'abc@ABC1024'));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Logout'));
}

const results = [];
for (const [slug, formId] of forms) {
  const row = { slug, formId, errors: [] };
  try {
    await page.goto(`${site}/?mfpanel=builder&formId=${formId}&qa=${Date.now()}`, {
      waitUntil: 'domcontentloaded', timeout: 90000,
    });
    const designerTrigger = page.locator('#mf-open-token-designer,[data-mf-open-html-designer]').first();
    await designerTrigger.waitFor({ state: 'visible' });

    const source = await page.locator('#mf-builder-root').evaluate((root) => {
      const raw = root.getAttribute('data-schema-json') || '{}';
      const schema = JSON.parse(raw);
      const settings = schema.settings || schema.Settings || {};
      const html = String(settings.customHtml || settings.CustomHtml || '');
      return {
        tokenImageCount: (html.match(/<img\b[^>]*\{\{content:[a-zA-Z0-9_-]+\}\}/gi) || []).length,
        hasFooter: /<footer\b|class=["'][^"']*footer/i.test(html),
      };
    });

    await designerTrigger.click();
    const modal = page.locator('#mf-token-designer-modal');
    await modal.waitFor({ state: 'visible' });
    row.headerTab = await modal.locator('[data-tab=header]').count();
    row.headerFields = await modal.locator('[data-pane=header] .mf-slide-field').count();
    row.inlineDuplicate = await modal.locator('.mf-token-inline-section').count();
    const imageTab = modal.locator('[data-tab=image]');
    row.imageRows = 0;
    row.brokenPreviews = 0;
    if (await imageTab.count()) {
      await imageTab.click();
      await page.waitForTimeout(120);
      row.imageRows = await modal.locator('[data-pane=image] .mf-token-row').count();
      row.brokenPreviews = await modal.locator('[data-pane=image] .mf-token-image-preview img').evaluateAll(
        (images) => images.filter((img) => !img.complete || img.naturalWidth <= 1 || img.naturalHeight <= 1).length,
      );
    }
    await modal.locator('.mf-token-designer-close').click();

    const designMode = page.locator('#mf-mode-design');
    await designMode.waitFor({ state: 'visible' });
    await designMode.evaluate((button) => button.click());
    const preview = page.frameLocator('#mf-builder-preview-frame');
    await preview.locator('.mfp').waitFor({ state: 'visible' });
    await preview.locator('[data-mf-ie]').first().waitFor({ state: 'attached' });
    const inline = await preview.locator('body').evaluate(() => {
      const blocks = [...document.querySelectorAll('.mf-ieblk')];
      const footerBlocks = blocks.filter((el) => el.getAttribute('data-mf-ie-block-kind') === 'footer');
      const headerBlocks = blocks.filter((el) => el.getAttribute('data-mf-ie-block-kind') === 'header');
      return {
        contentCount: document.querySelectorAll('[data-mf-ie-kind=content]').length,
        shellCount: document.querySelectorAll('[data-mf-ie-kind=shell]').length,
        tokenImages: document.querySelectorAll('img[data-mf-ie-content-key]').length,
        imageButtons: document.querySelectorAll('.mf-ie-img-btn').length,
        footerBlocks: footerBlocks.length,
        footerGears: footerBlocks.filter((el) => el.querySelector('.mf-ieblk-btn')).length,
        headerBlocks: headerBlocks.length,
        headerGears: headerBlocks.filter((el) => el.querySelector('.mf-ieblk-btn')).length,
        duplicateContentKeys: (() => {
          const keys = [...document.querySelectorAll('[data-mf-ie-kind=content]')].map((el) => el.getAttribute('data-mf-ie-key'));
          return keys.filter((key, i) => key && keys.indexOf(key) !== i).length;
        })(),
      };
    });
    Object.assign(row, source, inline);

    if (!row.headerTab || !row.headerFields) row.errors.push('header editor missing');
    if (row.inlineDuplicate) row.errors.push('token image duplicated as inline image');
    if (row.brokenPreviews) row.errors.push(`${row.brokenPreviews} broken image previews`);
    if (!row.contentCount) row.errors.push('no token-backed inline text');
    if (!row.headerGears) row.errors.push('header block action missing');
    if (row.hasFooter && !row.footerGears) row.errors.push('footer block action missing');
    if (row.tokenImages < row.tokenImageCount) row.errors.push(`token images tagged ${row.tokenImages}/${row.tokenImageCount}`);

    if (slug === 'gold-suite') {
      await page.screenshot({ path: resolve(outDir, 'gold-suite-design-preview.png'), fullPage: false });
    }
  } catch (error) {
    row.errors.push(String(error && error.message || error).split('\n')[0]);
  }
  results.push(row);
  console.log(`${slug}: ${row.errors.length ? 'FAIL ' + row.errors.join('; ') : 'PASS'}`);
}

const report = {
  site,
  checked: results.length,
  passed: results.filter((row) => !row.errors.length).length,
  failed: results.filter((row) => row.errors.length).length,
  results,
};
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checked: report.checked, passed: report.passed, failed: report.failed, outDir }, null, 2));
await browser.close();
process.exit(report.failed ? 1 : 0);
