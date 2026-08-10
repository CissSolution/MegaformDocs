// Ground truth: what stylesheets/scripts does the REAL DNN page load for each surface?
// Source of record beats reading the .ascx.cs, because conditionals and plugin loops resolve here.
import fs from 'node:fs';
import { chromium } from 'playwright';

const site = 'http://megaclean008.ai';
fs.mkdirSync('qa-out/truth', { recursive: true });
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('input[id*="txtUsername"]').fill('admin');
await page.locator('input[id*="txtPassword"]').fill('dnnhost');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
                   page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click()]);

const out = {};
for (const [name, url] of [
  ['dashboard',   '/mfqa-admin'],
  ['submissions', '/mfqa-admin?mfFormId=223#mf-submissions'],
  ['builder',     '/mfqa-admin?mfFormId=223#mf-builder'],
  ['myinbox',     '/mfqa-admin#mf-myinbox'],
  ['languages',   '/mfqa-admin#mf-languages'],
]) {
  const css = [], js = [];
  const onResp = (r) => {
    const u = r.url().replace(site, '');
    if (/\.css(\?|$)/i.test(u)) css.push(`${r.status()} ${u}`);
    if (/\.js(\?|$)/i.test(u) && /megaform|Sortable/i.test(u)) js.push(`${r.status()} ${u}`);
  };
  page.on('response', onResp);
  await page.goto(site + url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(9000);
  page.off('response', onResp);
  out[name] = {
    css: css.filter((x) => /megaform|font-?awesome/i.test(x)),
    js,
    allCssCount: css.length,
  };
}
fs.writeFileSync('qa-out/truth/page-assets.json', JSON.stringify(out, null, 2));
for (const k of Object.keys(out)) {
  console.log(`\n=== ${k} ===`);
  console.log('CSS:'); out[k].css.forEach((x) => console.log('   ' + x));
  console.log('JS:');  out[k].js.forEach((x) => console.log('   ' + x));
}
await b.close();
