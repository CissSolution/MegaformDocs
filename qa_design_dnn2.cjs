const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  
  await page.goto('http://dnn10322_megatest.ai/megaform/Home/mfFormId/1267#mf-builder');
  await page.waitForTimeout(15000);
  
  // Check builder mounted
  const html = await page.evaluate(() => {
    return {
      builderRoot: !!document.getElementById('mf-builder-root'),
      dropzone: !!document.getElementById('mf-canvas-dropzone'),
      bodyText: document.body.innerText.substring(0, 200),
    };
  });
  console.log('Page state:', JSON.stringify(html, null, 2));
  
  await page.screenshot({ path: 'qa/b83j-dnn-form1267-wait.png', fullPage: false });
  
  // Try click Design tab
  const designTab = await page.$('.mf-mode-tab[data-mode="theme"]');
  if (designTab) {
    await designTab.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'qa/b83j-dnn-form1267-design2.png', fullPage: false });
    
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
  } else {
    console.log('Design tab not found');
  }
  
  await browser.close();
})();
