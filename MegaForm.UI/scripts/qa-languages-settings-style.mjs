import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MF_QA_BASE || 'http://localhost:5138';
const CHROME = process.env.MF_QA_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(SCRIPT_DIR, '../../_tmp_puppeteer');
const results = [];
const errors = [];

mkdirSync(OUT, { recursive: true });

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : ''));
}

async function login(page) {
  await page.goto(BASE + '/umbraco/login', { waitUntil: 'networkidle', timeout: 60000 });
  const status = await page.evaluate(async () => (await fetch('/umbraco/management/api/v1/security/back-office/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@local', password: 'Admin123456!' }),
  })).status);
  if (status !== 200) throw new Error('Login failed: ' + status);
}

async function openLanguages(page) {
  await page.goto(BASE + '/umbraco/section/megaform/view/open/languages', { waitUntil: 'networkidle', timeout: 120000 });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => /\/umbraco\/MegaForm\/Languages/i.test(candidate.url()));
    if (frame && await frame.locator('.mf-loc-grid').count()) return frame;
    await page.waitForTimeout(250);
  }
  throw new Error('Languages frame not found');
}

async function layoutMetrics(frame) {
  return frame.evaluate(() => {
    const read = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return {
        selector,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        radius: css.borderRadius,
        background: css.backgroundColor,
        borderRight: css.borderRightWidth,
        borderBottom: css.borderBottomWidth,
        columns: css.gridTemplateColumns,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      badge: window.__MF_LANG_DASH_BADGE__ || '',
      grid: read('.mf-loc-grid'),
      side: read('.mf-loc-side'),
      switcher: read('.mf-loc-switcher'),
      search: read('.mf-loc-search'),
      button: read('.mf-loc-btn'),
      row: read('.mf-loc-row'),
    };
  });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/UmbAuthClient|mandatory 'refresh_token'|Failed to load resource/i.test(message.text())) return;
    errors.push(message.text());
  });

  await login(page);
  let frame = await openLanguages(page);
  let metrics = await layoutMetrics(frame);

  check('new Languages CSS bundle is live', metrics.badge === 'LanguageSettingsStyle v20260822-01', metrics.badge);
  check('desktop workspace matches Settings radius', metrics.grid.radius === '10px', metrics.grid.radius);
  check('desktop uses unified settings workspace', metrics.grid.columns.split(' ').length === 2 && metrics.side.borderRight !== '0px', metrics.grid.columns);
  check('settings rail uses neutral background', metrics.side.background === 'rgb(248, 250, 252)', metrics.side.background);
  check('display language toolbar uses compact radius', metrics.switcher.radius === '8px', metrics.switcher.radius);
  check('search input uses Settings radius', metrics.search.radius === '6px', metrics.search.radius);
  check('action buttons use Settings radius', metrics.button.radius === '6px', metrics.button.radius);
  check('translation rows use compact radius', metrics.row.radius === '8px', metrics.row.radius);
  check('desktop has no horizontal overflow', metrics.scrollWidth <= metrics.viewport.width, `${metrics.scrollWidth}/${metrics.viewport.width}`);

  const initialRows = await frame.locator('.mf-loc-row').count();
  await frame.locator('#mf-loc-search').fill('widget.file');
  await page.waitForTimeout(250);
  const filteredRows = await frame.locator('.mf-loc-row').count();
  check('search filters the language rows', filteredRows > 0 && filteredRows < initialRows, `${filteredRows}/${initialRows}`);
  check('search clear action becomes visible', await frame.locator('#mf-loc-search-clear').isVisible());
  await frame.locator('#mf-loc-search-clear').click();
  check('search clear action works', await frame.locator('#mf-loc-search').inputValue() === '');

  const downloadButton = frame.locator('#mf-loc-download');
  await downloadButton.hover();
  await page.waitForTimeout(180);
  const hoverBg = await downloadButton.evaluate((el) => getComputedStyle(el).backgroundColor);
  check('toolbar button has hover feedback', hoverBg === 'rgb(244, 244, 245)', hoverBg);

  await frame.locator('.mf-loc-tab[data-tab="widgets"]').click();
  check('category tab click selects the tab', await frame.locator('.mf-loc-tab.active').getAttribute('data-tab') === 'widgets');

  await frame.locator('#mf-langpick-trigger').click();
  await page.waitForTimeout(150);
  const picker = await frame.evaluate(() => {
    const panel = document.querySelector('#mf-langpick-panel');
    const trigger = document.querySelector('#mf-langpick-trigger');
    return {
      visible: !!panel && !panel.hidden,
      expanded: trigger?.getAttribute('aria-expanded'),
      radius: panel ? getComputedStyle(panel).borderRadius : '',
      cells: panel ? panel.querySelectorAll('.mf-langpick-cell').length : 0,
    };
  });
  check('display-language dropdown opens', picker.visible && picker.expanded === 'true', JSON.stringify(picker));
  check('dropdown matches Settings radius and has choices', picker.radius === '10px' && picker.cells >= 10, `${picker.radius}, ${picker.cells} choices`);
  await frame.locator('#mf-langpick-search').fill('English');
  const visibleChoices = await frame.locator('.mf-langpick-cell:not([hidden])').count();
  check('display-language dropdown search works', visibleChoices >= 1 && visibleChoices < picker.cells, String(visibleChoices));
  await page.keyboard.press('Escape');
  check('Escape closes the language dropdown', await frame.locator('#mf-langpick-panel').evaluate((el) => el.hidden));
  await page.screenshot({ path: resolve(OUT, 'languages-settings-desktop.png') });

  await page.setViewportSize({ width: 768, height: 900 });
  frame = await openLanguages(page);
  metrics = await layoutMetrics(frame);
  check('narrow workspace collapses to one column', metrics.grid.columns.split(' ').length === 1, metrics.grid.columns);
  check('narrow rail divider moves below rail', metrics.side.borderRight === '0px' && metrics.side.borderBottom !== '0px', `${metrics.side.borderRight}/${metrics.side.borderBottom}`);
  check('narrow view has no horizontal overflow', metrics.scrollWidth <= metrics.viewport.width, `${metrics.scrollWidth}/${metrics.viewport.width}`);
  check('narrow controls keep usable height', metrics.search.height >= 40 && metrics.button.height >= 36, `${metrics.search.height}/${metrics.button.height}`);
  await page.screenshot({ path: resolve(OUT, 'languages-settings-narrow.png') });

  check('no unexpected browser errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${results.filter((item) => item.pass).length}/${results.length} checks passed`);
  if (results.some((item) => !item.pass)) process.exitCode = 1;
} finally {
  await browser.close();
}
