const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  
  await page.goto('http://localhost:5005/login', { waitUntil: 'load', timeout: 60000 });
  await page.fill('#username', 'host');
  await page.fill('#password', 'Minh@2002');
  await page.click('button:has-text("Login")');
  await page.waitForTimeout(3000);
  
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=2', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(12000);
  
  // List available palette items
  const items = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.mf-palette-item')).map(el => ({
      type: el.getAttribute('data-type'),
      label: el.textContent?.trim()
    }))
  );
  console.log('Palette items:', JSON.stringify(items));
  
  // Add available fields
  const toAdd = ['Text', 'Email', 'Select', 'Textarea', 'Checkbox'];
  for (const type of toAdd) {
    const sel = `.mf-palette-item[data-type="${type}"]`;
    const exists = await page.$(sel);
    if (exists) {
      await page.click(sel);
      await page.waitForTimeout(800);
      console.log('Added', type);
    } else {
      console.log('Not found', type);
    }
  }
  
  await page.screenshot({ path: 'tmp-qa/oqtane-with-fields.png' });
  console.log('✓ Oqtane with fields');
  
  // Click first Text field
  const textField = await page.$('.mf-canvas-field[data-type="Text"]');
  if (textField) {
    await textField.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'tmp-qa/oqtane-selected.png' });
    console.log('✓ Oqtane selected');
  }
  
  // Design mode
  const designBtn = await page.$('[data-mf-mode="design"], #mf-mode-pill-design, .w-mode-pill button:nth-child(2)');
  if (designBtn) {
    await designBtn.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tmp-qa/oqtane-design.png' });
    console.log('✓ Oqtane Design mode');
  }
  
  await browser.close();
})();
