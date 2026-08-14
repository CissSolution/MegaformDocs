const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outDir = path.resolve('qa-out', 'mock11-premium');
fs.mkdirSync(outDir, { recursive: true });

const cases = [
  ['insurance-enrollment', 'http://localhost:3101/forms/insurance-enrollment', 'http://megaclean008.ai/?mfFormId=231', 'main', '.mfp-insurance-enrollment'],
  ['event-registration-premium', 'http://localhost:3101/forms/event-registration', 'http://megaclean008.ai/?mfFormId=229', 'main', '.mfp-event-registration-premium'],
  ['elderly-care-donation', 'http://localhost:3101/forms/elderly-care-donation', 'http://megaclean008.ai/?mfFormId=228', 'main', '.mfp-elderly-care-donation'],
  ['professional-application', 'http://localhost:3101/forms/professional-application', 'http://megaclean008.ai/?mfFormId=232', 'main', '.mfp-premium-wave'],
  ['healthcare-intake', 'http://localhost:3101/forms/healthcare-intake', 'http://megaclean008.ai/?mfFormId=230', 'main', '.mfp-premium-wave'],
  ['travel-consultation', 'http://localhost:3101/forms/travel-consultation', 'http://megaclean008.ai/?mfFormId=233', 'main', '.mfp-premium-wave'],
  ['creative-workshop', 'http://localhost:3101/forms/creative-workshop', 'http://megaclean008.ai/?mfFormId=227', 'main', '.mfp-premium-wave'],
  ['volunteer-profile', 'http://localhost:3101/forms/volunteer-profile', 'http://megaclean008.ai/?mfFormId=234', 'main', '.mfp-premium-wave'],
];

async function shot(page, url, selector, file) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.addStyleTag({ content: `
    * { caret-color: transparent !important; }
    html { scroll-behavior: auto !important; }
    .toast, .dnnFormMessage, #ControlBar_ControlPanel, .personalBarContainer,
    .navbar, .navbar-nav, .main-nav, .mainmenu, .skin-nav, .dnnnav, #dnnMenu,
    .mfqa-nav, .site-nav, .top-nav, .Header, .header-bar { display:none!important; }
  `});
  await page.evaluate(() => {
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if ((cs.position === 'fixed' || cs.position === 'sticky') && r.top < 140 && r.height > 20 && r.height < 180) {
        el.style.setProperty('display', 'none', 'important');
      }
    }
  });
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 30000 });
  await loc.screenshot({ path: file });
  const metrics = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      width: Math.round(r.width),
      height: Math.round(r.height),
      background: cs.backgroundColor,
      color: cs.color,
      fontFamily: cs.fontFamily,
    };
  });
  return metrics;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1220, height: 760 }, deviceScaleFactor: 1 });
  const results = [];
  for (const [slug, mockUrl, liveUrl, mockSelector, liveSelector] of cases) {
    const mockFile = path.join(outDir, `${slug}-mock.png`);
    const liveFile = path.join(outDir, `${slug}-live.png`);
    const mockMetrics = await shot(page, mockUrl, mockSelector, mockFile);
    const liveMetrics = await shot(page, liveUrl, liveSelector, liveFile);
    results.push({ slug, mockUrl, liveUrl, mockFile, liveFile, mockMetrics, liveMetrics });
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
