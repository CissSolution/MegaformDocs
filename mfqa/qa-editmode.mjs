// Probe the Oqtane edit-mode pencil on /mfqa-panes vs homepage.
import { launch, login, shot, BASE } from './lib.mjs';
const { browser, page, errs } = await launch();
await login(page);

async function probe(path, label) {
  errs.length = 0;
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const before = await page.evaluate(() => ({ url: location.href, editChrome: !!document.querySelector('.app-controlpanel, [class*="controlpanel"], .app-actions, [class*="edit-mode"]') }));
  // find the edit pencil (Oqtane control panel toggle)
  const found = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('a, button')].filter(b => /edit/i.test((b.getAttribute('title') || '') + (b.getAttribute('aria-label') || '')) || (b.querySelector('.fa-edit, .fa-pen, [class*="pencil"]')));
    if (cands.length) { cands[0].click(); return { clicked: true, title: cands[0].getAttribute('title') || cands[0].className }; }
    return { clicked: false };
  });
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => ({
    url: location.href,
    // edit-mode signals: module action menus / "Add Module" / pane dropzones visible
    addModule: /add module/i.test(document.body.innerText || ''),
    moduleActions: document.querySelectorAll('[class*="moduleactions"], .app-menu, [title*="Manage"]').length,
    paneLabels: /Full Width Pane|50% Pane|33% Pane/i.test(document.body.innerText || ''),
  }));
  console.log(`[${label} ${path}]`, JSON.stringify({ found, before, after, errs: errs.slice(0, 6) }));
  await shot(page, `b277-editmode-${label}.png`);
}

await probe('/mfqa-panes', 'panes');
await probe('/', 'home');
await browser.close();
