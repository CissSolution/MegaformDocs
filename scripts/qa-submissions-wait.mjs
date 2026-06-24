import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ bypassCache: true });
const page = await context.newPage();

const apiLog = [];
page.on('response', res => {
  const url = res.url();
  if (url.includes('/api/')) {
    apiLog.push({ url: url.split('?')[0], status: res.status() });
  }
});
page.on('console', msg => {
  if (msg.type() === 'error') console.log('[CONSOLE ERROR]', msg.text());
});

await page.goto('http://localhost:5005/?mfpanel=submissions', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(8000);

const html = await page.content();
const hasStats = html.includes('mf-stats-pillbar');
const hasTable = html.includes('mf-subs-t');
const hasLoading = html.includes('Loading submissions');
const hasError = html.includes('mf-sub-error');

await page.screenshot({ path: 'tmp-qa/submissions-after-wait.png', fullPage: true });

console.log('hasStatsBar:', hasStats);
console.log('hasTable:', hasTable);
console.log('stillLoading:', hasLoading);
console.log('hasError:', hasError);
console.log('\nAPI calls:');
apiLog.forEach(x => console.log(' ', x.status, x.url));

await browser.close();
