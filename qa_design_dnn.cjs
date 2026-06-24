const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  
  // === DNN ===
  await page.goto('http://dnn10322_megatest.ai/');
  await page.waitForTimeout(2000);
  
  // DNN login
  const loginLink = await page.$('a[href*="login"], a[href*="Login"]');
  if (loginLink) await loginLink.click();
  await page.waitForTimeout(1000);
  
  const userInput = await page.$('input[name="username"], input[id*="Username"], input[type="text"]');
  if (userInput) {
    await userInput.fill('host');
    const passInput = await page.$('input[type="password"]');
    if (passInput) {
      await passInput.fill('dnnhost');
      const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Login")');
      if (submitBtn) await submitBtn.click();
    }
  }
  await page.waitForTimeout(4000);
  
  // Form 1267 Build Mode
  await page.goto('http://dnn10322_megatest.ai/megaform/Home/mfFormId/1267#mf-builder');
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'qa/b83j-dnn-form1267-build.png', fullPage: false });
  
  // Click Design tab
  const designTab = await page.$('.mf-mode-tab[data-mode="theme"], button:has-text("Design")');
  if (designTab) {
    await designTab.click();
    await page.waitForTimeout(4000);
  }
  await page.screenshot({ path: 'qa/b83j-dnn-form1267-design.png', fullPage: false });
  
  // Inspect widths
  const info = await page.evaluate(() => {
    const dropzone = document.getElementById('mf-canvas-dropzone');
    const iframe = document.querySelector('.mf-theme-preview-frame');
    const wrapper = document.querySelector('#mf-canvas-dropzone .mf-form-wrapper');
    return {
      dropzoneWidth: dropzone ? dropzone.offsetWidth : null,
      iframePresent: !!iframe,
      iframeWidth: iframe ? iframe.offsetWidth : null,
      wrapperPresent: !!wrapper,
      wrapperWidth: wrapper ? wrapper.offsetWidth : null,
      wrapperMaxWidth: wrapper ? getComputedStyle(wrapper).maxWidth : null,
      stateTheme: document.body.classList.contains('state-theme-mode'),
      htmlIframe: document.documentElement.getAttribute('data-mf-theme-iframe'),
    };
  });
  console.log('DNN Design Mode:', JSON.stringify(info, null, 2));
  
  await browser.close();
})();
