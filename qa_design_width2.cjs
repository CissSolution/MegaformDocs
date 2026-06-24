const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=1');
  await page.waitForTimeout(12000);
  
  const html = await page.evaluate(() => ({
    builderRoot: !!document.getElementById('mf-builder-root'),
    dropzone: !!document.getElementById('mf-canvas-dropzone'),
    tabs: Array.from(document.querySelectorAll('.mf-mode-tab')).map(t => ({text: t.textContent?.trim(), mode: t.getAttribute('data-mode'), visible: t.offsetWidth > 0})),
  }));
  console.log('Builder state:', JSON.stringify(html, null, 2));
  
  await page.screenshot({ path: 'qa/b83j-oq-form1-build.png', fullPage: false });
  
  // Click by text
  const designBtn = await page.$('text=Design');
  if (designBtn) {
    await designBtn.click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: 'qa/b83j-oq-form1-design.png', fullPage: false });
    
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
    console.log('Design button not found');
  }
  
  await browser.close();
})();
