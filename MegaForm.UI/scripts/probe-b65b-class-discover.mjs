import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto('http://dnn10322_megaf.ai/xx?formid=342', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);
await page.screenshot({ path: 'qa-out/b65b-runtime-discover.png', fullPage: false });

const result = await page.evaluate(() => {
  const url = location.href;
  // Find any element containing "Appointment" text
  const all = Array.from(document.querySelectorAll('*'));
  const apptHits = all.filter(el => (el.textContent || '').includes('Appointment') && (el.textContent || '').length < 200);
  const sample = apptHits.slice(0, 3).map(el => ({
    tag: el.tagName,
    id: el.id,
    cls: el.className.toString().slice(0, 100),
    parentCls: el.parentElement ? el.parentElement.className.toString().slice(0, 100) : '',
    grandParentCls: el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement.className.toString().slice(0, 100) : ''
  }));
  // Find any grid container
  const grids = Array.from(document.querySelectorAll('[class*="grid"], [class*="flex"]')).slice(0, 6).map(el => ({
    cls: el.className.toString().slice(0, 100),
    childCount: el.children.length,
    width: Math.round(el.getBoundingClientRect().width)
  }));
  // Look specifically for .mf-form-wrapper and .mf-fields-container content
  const wrapper = document.querySelector('.mf-form-wrapper');
  const fields = document.querySelector('.mf-fields-container');
  const flexgridItems = document.querySelectorAll('.mf-flexgrid-item');
  const fieldGroups = document.querySelectorAll('.mf-field-group');
  const rowColumns = document.querySelectorAll('.mf-row-column, .mf-row, [class*="mf-row"]');
  return {
    url,
    apptHitCount: apptHits.length,
    sample,
    grids,
    wrapperExists: !!wrapper,
    wrapperWidth: wrapper ? Math.round(wrapper.getBoundingClientRect().width) : null,
    fieldsExists: !!fields,
    flexgridItemCount: flexgridItems.length,
    fieldGroupCount: fieldGroups.length,
    rowColumnCount: rowColumns.length,
    title: document.title
  };
});

await browser.close();
console.log(JSON.stringify(result, null, 2));
