const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  
  await page.goto('http://DNN10322_MegaTest.AI/Login', { waitUntil: 'load', timeout: 180000 });
  await page.fill('#dnn_ctr_Login_Login_DNN_txtUsername', 'host');
  await page.fill('#dnn_ctr_Login_Login_DNN_txtPassword', 'dnnhost');
  await page.press('#dnn_ctr_Login_Login_DNN_txtPassword', 'Enter');
  await page.waitForLoadState('load', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(3000);
  
  await page.goto('http://DNN10322_MegaTest.AI/megaform/Home/mfFormId/1273?mfFormId=1273&_=' + Date.now() + '#mf-builder', { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(12000);
  
  // Add a Text field
  await page.click('.mf-palette-item[data-type="Text"]');
  await page.waitForTimeout(2000);
  
  const html = await page.evaluate(() => {
    const el = document.querySelector('.mf-canvas-field[data-type="Text"]');
    return el ? el.outerHTML : 'NOT FOUND';
  });
  console.log('FIELD HTML:', html.substring(0, 800));
  
  const styles = await page.evaluate(() => {
    const el = document.querySelector('.mf-canvas-field[data-type="Text"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { height: el.offsetHeight, display: cs.display, padding: cs.padding, border: cs.border };
  });
  console.log('FIELD STYLES:', JSON.stringify(styles));
  
  await browser.close();
})();
