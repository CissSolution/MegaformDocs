const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=1');
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'qa/b83j-oq-form1-build-wait.png', fullPage: false });
  
  // Trigger design mode via JS
  await page.evaluate(() => {
    const tab = document.querySelector('.mf-mode-tab[data-mode="theme"]');
    if (tab) tab.click();
    else {
      // fallback: dispatch event
      window.dispatchEvent(new CustomEvent('mf:theme-tab-activated'));
    }
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'qa/b83j-oq-form1-design-js.png', fullPage: false });
  
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
  
  await browser.close();
})();
