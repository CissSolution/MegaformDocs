const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1600, height: 900 } });
  
  // Login DNN
  await page.goto('http://dnn10322_megatest.ai/login');
  await page.waitForTimeout(2000);
  
  await page.fill('input[name="username"], input[id*="Username"]', 'host');
  await page.fill('input[type="password"]', 'dnnhost');
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForTimeout(4000);
  
  // Go to builder
  await page.goto('http://dnn10322_megatest.ai/megaform/Home/mfFormId/1267#mf-builder');
  await page.waitForTimeout(15000);
  
  const html = await page.evaluate(() => {
    return {
      builderRoot: !!document.getElementById('mf-builder-root'),
      dropzone: !!document.getElementById('mf-canvas-dropzone'),
      tabs: Array.from(document.querySelectorAll('.mf-mode-tab, [data-mode]')).map(t => t.getAttribute('data-mode') || t.textContent),
    };
  });
  console.log('Builder state:', JSON.stringify(html, null, 2));
  
  await page.screenshot({ path: 'qa/b83j-dnn-form1267-build.png', fullPage: false });
  
  const designTab = await page.$('.mf-mode-tab[data-mode="theme"]');
  if (designTab) {
    await designTab.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'qa/b83j-dnn-form1267-design.png', fullPage: false });
    
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
    console.log('Design Mode:', JSON.stringify(info, null, 2));
  }
  
  await browser.close();
})();
