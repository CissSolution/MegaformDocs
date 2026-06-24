import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ bypassCache: true });
const page = await context.newPage();

const allLogs = [];
page.on('console', msg => {
  allLogs.push({ type: msg.type(), text: msg.text() });
});
page.on('response', res => {
  const url = res.url();
  if (url.includes('/api/')) {
    allLogs.push({ type: 'api', status: res.status(), url: url.split('?')[0] });
  }
});

await page.goto('http://localhost:5005/?mfpanel=submissions', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(5000);

// Inspect JS state
const jsState = await page.evaluate(() => {
  const root = document.getElementById('mf-submissions-root');
  return {
    rootHTML: root ? root.outerHTML.substring(0, 800) : 'NO ROOT',
    hasMegaForm: !!window.MegaForm,
    hasInitSubmissions: typeof window.MegaForm?.initSubmissions === 'function',
    bodyChildCount: document.body.children.length,
    subsContent: document.querySelector('[data-mf-subs-content]') ? 'FOUND' : 'NOT FOUND',
  };
});

console.log('=== JS STATE ===');
console.log(JSON.stringify(jsState, null, 2));
console.log('\n=== ALL LOGS ===');
allLogs.forEach(l => console.log(l.type + ':', l.text || l.status + ' ' + l.url));

await page.screenshot({ path: 'tmp-qa/submissions-debug.png', fullPage: true });
await browser.close();
