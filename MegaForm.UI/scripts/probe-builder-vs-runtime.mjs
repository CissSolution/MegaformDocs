import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(4000);

const sites = [
  { label: 'RUNTIME /xx?formid=335', url: 'http://dnn10322_megaf.ai/xx?formid=335' },
  { label: 'BUILDER /xx?mfFormId=335#mf-builder', url: 'http://dnn10322_megaf.ai/xx?mfFormId=335#mf-builder' }
];
for (const s of sites) {
  await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  const probe = await page.evaluate(() => ({
    mfBuilderRoot: !!document.getElementById('mf-builder-root'),
    mfBuilderRootChildrenCount: document.getElementById('mf-builder-root')?.children?.length || 0,
    mfCanvas: !!document.querySelector('.mf-canvas'),
    mfCanvasFieldCount: document.querySelectorAll('.mf-canvas-field').length,
    mfFieldGroupCount: document.querySelectorAll('.mf-field-group').length,
    MegaFormBuilderStateExists: !!window.MegaFormBuilder?.state,
    MegaFormBuilderModulesCount: window.MegaFormBuilder?._modules ? Object.keys(window.MegaFormBuilder._modules).length : 0,
    bodyClasses: document.body.className.slice(0, 200)
  }));
  console.log(s.label, JSON.stringify(probe, null, 2));
}
await browser.close();
