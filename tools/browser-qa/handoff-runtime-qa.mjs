#!/usr/bin/env node
/**
 * Runtime checks for the 2026-08-09 template-set handoff.
 *
 * Reproduces the reported invoice date order and records the actual wizard gate state. It also
 * records the Oqtane wrapper/font state so page-typography inheritance can be diagnosed from a
 * real browser rather than inferred from source code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const dnn = arg('dnn', 'http://megaclean008.ai').replace(/\/$/, '');
const oq = arg('oq', 'http://localhost:5130').replace(/\/$/, '');
const outDir = resolve(arg('out', 'qa-out/handoff-runtime'));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

async function invoiceQa() {
  await page.goto(`${dnn}/mfqa-wide?mfFormId=70`, {
    waitUntil: 'domcontentloaded', timeout: 90000,
  });
  const wrapper = page.locator('#mf-form-wrapper-70');
  await wrapper.waitFor({ state: 'visible', timeout: 90000 });
  const next = wrapper.locator('[data-mf-native-page][data-step="0"] [data-mf-native-next]');
  await next.waitFor({ state: 'visible', timeout: 30000 });

  await wrapper.locator('[name="bill_to_name"]').fill('Owner QA');
  await wrapper.locator('[name="bill_from_name"]').fill('MegaForm QA');
  await wrapper.evaluate((root) => {
    const setDate = (name, value) => {
      const input = root.querySelector(`input[name="${name}"]`);
      if (!(input instanceof HTMLInputElement)) throw new Error(`${name} input not found`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setDate('invoice_date', '2026-08-13');
    setDate('due_date', '2026-08-05');
  });

  const before = await wrapper.evaluate((root) => {
    const button = root.querySelector('[data-mf-native-page][data-step="0"] [data-mf-native-next]');
    const active = root.querySelector('[data-mf-native-step].is-active');
    return {
      activeStep: active?.getAttribute('data-step') ?? null,
      disabled: button instanceof HTMLButtonElement ? button.disabled : null,
      classes: button?.className ?? '',
      visibleErrors: Array.from(root.querySelectorAll('.mf-field-error'))
        .filter((el) => getComputedStyle(el).display !== 'none' && el.textContent?.trim())
        .map((el) => el.textContent.trim()),
    };
  });
  await next.click();
  await page.waitForTimeout(300);
  const after = await wrapper.evaluate((root) => ({
    activeStep: root.querySelector('[data-mf-native-step].is-active')?.getAttribute('data-step') ?? null,
    visiblePage: root.querySelector('[data-mf-native-page]:not([style*="display: none"])')
      ?.getAttribute('data-step') ?? null,
    visibleErrors: Array.from(root.querySelectorAll('.mf-field-error'))
      .filter((el) => getComputedStyle(el).display !== 'none' && el.textContent?.trim())
      .map((el) => el.textContent.trim()),
  }));
  await page.screenshot({ path: resolve(outDir, 'invoice-navy-backdated-due.png'), fullPage: false });
  return { before, after, passed: after.activeStep === '1' && after.visiblePage === '1' };
}

async function loginOqtane() {
  await page.goto(`${oq}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if ((await page.locator('body').innerText()).includes('Logout')) return;
  const password = page.locator('input[type=password]');
  await password.waitFor({ state: 'visible', timeout: 60000 });
  const inputs = page.locator('input');
  const count = await inputs.count();
  let username = null;
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    if ((await input.getAttribute('type')) !== 'password') username = input;
    else break;
  }
  if (!username) throw new Error('Oqtane username input not found');
  await username.fill(arg('user', 'host'));
  await password.fill(arg('pass', 'abc@ABC1024'));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Logout'), null, { timeout: 60000 });
}

async function typographyQa() {
  await loginOqtane();
  await page.goto(`${oq}/mf-ielts-report`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let wrapper = page.locator('#mf-form-wrapper-16');
  await wrapper.waitFor({ state: 'visible', timeout: 90000 });
  const readState = (target) => target.evaluate((el) => ({
    classes: el.className,
    wrapperFont: getComputedStyle(el).fontFamily,
    parentFont: el.parentElement ? getComputedStyle(el.parentElement).fontFamily : null,
    inheritFlag: el.classList.contains('mf-inherit-type'),
    ssr: el.getAttribute('data-mf-ssr'),
    moduleId: el.closest('[data-module-id]')?.getAttribute('data-module-id') ?? null,
  }));
  const original = await readState(wrapper);
  if (!original.moduleId) throw new Error('Oqtane module id not found for typography QA');

  const saveFlag = (value) => page.evaluate(async ({ moduleId, enabled }) => {
    const response = await fetch(`/api/MegaForm/Form/SaveTheme?authmoduleid=${encodeURIComponent(moduleId)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        FormId: 16,
        InheritPageTypography: enabled,
        InheritPageColors: false,
      }),
    });
    return { status: response.status, ok: response.ok, body: await response.text() };
  }, { moduleId: original.moduleId, enabled: value });

  let enabled;
  let restored;
  const enableResponse = await saveFlag(true);
  if (!enableResponse.ok) throw new Error(`SaveTheme enable failed: HTTP ${enableResponse.status}`);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    wrapper = page.locator('#mf-form-wrapper-16');
    await wrapper.waitFor({ state: 'visible', timeout: 90000 });
    enabled = await readState(wrapper);
    await page.screenshot({ path: resolve(outDir, 'oqtane-typography-inherit.png'), fullPage: false });
  } finally {
    const restoreResponse = await saveFlag(original.inheritFlag);
    if (!restoreResponse.ok) throw new Error(`SaveTheme restore failed: HTTP ${restoreResponse.status}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    wrapper = page.locator('#mf-form-wrapper-16');
    await wrapper.waitFor({ state: 'visible', timeout: 90000 });
    restored = await readState(wrapper);
  }
  await page.screenshot({ path: resolve(outDir, 'oqtane-typography-state.png'), fullPage: false });
  return {
    original,
    enabled,
    restored,
    passed: enabled?.inheritFlag === true
      && enabled.wrapperFont === enabled.parentFont
      && restored.inheritFlag === original.inheritFlag,
  };
}

async function mobileGeometryQa() {
  const mobile = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const mobilePage = await mobile.newPage();
  const inspect = async (formId, rootSelector, selectors) => {
    await mobilePage.goto(`${dnn}/mfqa-wide?mfFormId=${formId}`, {
      waitUntil: 'domcontentloaded', timeout: 90000,
    });
    const root = mobilePage.locator(rootSelector);
    await root.waitFor({ state: 'visible', timeout: 90000 });
    await mobilePage.waitForTimeout(800);
    return root.evaluate((el, wanted) => {
      const rr = el.getBoundingClientRect();
      const rows = {};
      wanted.forEach((selector) => {
        rows[selector] = Array.from(el.querySelectorAll(selector)).map((node) => {
          const r = node.getBoundingClientRect();
          const cs = getComputedStyle(node);
          return {
            className: node.className,
            x: Math.round((r.x - rr.x) * 100) / 100,
            right: Math.round((rr.right - r.right) * 100) / 100,
            width: Math.round(r.width * 100) / 100,
            display: cs.display,
            boxSizing: cs.boxSizing,
            minWidth: cs.minWidth,
            maxWidth: cs.maxWidth,
            padding: cs.padding,
          };
        });
      });
      const leaves = Array.from(el.querySelectorAll('input,select,textarea,button,label,h1,h2,h3,p,span,div'))
        .filter((node) => {
          const cs = getComputedStyle(node);
          const text = (node.textContent || '').trim();
          const control = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(node.tagName);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && node.getClientRects().length
            && (control || (text && !node.children.length));
        })
        .map((node) => {
          const r = node.getBoundingClientRect();
          return {
            className: String(node.className || node.tagName).split(' ')[0],
            text: (node.textContent || '').trim().slice(0, 32),
            left: Math.round((r.left - rr.left) * 100) / 100,
            right: Math.round((rr.right - r.right) * 100) / 100,
            width: Math.round(r.width * 100) / 100,
          };
        })
        .filter((row) => row.width >= 2);
      return {
        root: { x: rr.x, width: rr.width },
        rows,
        tightLeft: leaves.sort((a, b) => a.left - b.left).slice(0, 8),
        tightRight: leaves.sort((a, b) => a.right - b.right).slice(0, 8),
      };
    }, selectors);
  };
  const result = {
    lagoon: await inspect(64, '.lgn-page', ['.lgn-shell', '.lgn-grid2', '.lgn-field', '.mf-cal', '.mf-cal-trigger']),
    festa: await inspect(72, '.fes-wrap', ['.fes-body', '.fes-rail', '.fes-rail-item', '.fes-rail-lbl', '.fes-rail-sub', '.fes-foot']),
  };
  for (const [slug, formId] of [
    ['xmas-newsletter', 58], ['gold-suite', 60], ['lagoon-booking', 64], ['festa-italiana', 72],
  ]) {
    await mobilePage.goto(`${dnn}/mfqa-wide?mfFormId=${formId}`, {
      waitUntil: 'networkidle', timeout: 90000,
    }).catch(() => {});
    await mobilePage.waitForTimeout(700);
    await mobilePage.screenshot({
      path: resolve(outDir, `${slug}-375.png`),
      fullPage: true,
    });
  }
  await mobile.close();
  return result;
}

const result = {
  invoice: await invoiceQa(),
  typography: await typographyQa(),
  mobileGeometry: await mobileGeometryQa(),
};
writeFileSync(resolve(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ outDir, ...result }, null, 2));
await browser.close();
process.exit(result.invoice.passed ? 0 : 1);
