const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  
  await page.goto('http://localhost:5005/');
  await page.waitForTimeout(2000);
  
  const loginLink = await page.$('a[href*="login"]');
  if (loginLink) await loginLink.click();
  await page.waitForTimeout(1000);
  
  const userInput = await page.$('input[name="username"], input[id*="Username"], input[placeholder*="Username"], input[type="text"]');
  if (userInput) {
    await userInput.fill('host');
    const passInput = await page.$('input[type="password"]');
    if (passInput) {
      await passInput.fill('Minh@2002');
      const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Login")');
      if (submitBtn) await submitBtn.click();
    }
  }
  await page.waitForTimeout(3000);
  
  await page.goto('http://localhost:5005/?mfpanel=builder&formId=1');
  await page.waitForTimeout(8000);
  
  // Check what's on page
  const html = await page.evaluate(() => {
    const builderRoot = document.getElementById('mf-builder-root');
    const dropzone = document.getElementById('mf-canvas-dropzone');
    const tabs = Array.from(document.querySelectorAll('.mf-mode-tab, [data-mode], button')).map(b => ({
      text: b.textContent?.trim(),
      class: b.className,
      dataMode: b.getAttribute('data-mode'),
    }));
    return { builderRoot: !!builderRoot, dropzone: !!dropzone, tabs: tabs.slice(0, 20) };
  });
  console.log('PAGE STATE:', JSON.stringify(html, null, 2));
  
  // Try clicking Design tab by text
  const designBtn = await page.$('button:has-text("Design"), .mf-mode-tab:has-text("Design"), [data-mode="theme"]');
  if (designBtn) {
    await designBtn.click();
    await page.waitForTimeout(3000);
  }
  
  const info = await page.evaluate(() => {
    const dropzone = document.getElementById('mf-canvas-dropzone');
    const iframe = document.querySelector('.mf-theme-preview-frame');
    const wrapper = document.querySelector('#mf-canvas-dropzone .mf-form-wrapper');
    
    const result = {
      stateTheme: document.body.classList.contains('state-theme-mode'),
      htmlIframe: document.documentElement.getAttribute('data-mf-theme-iframe'),
      dropzoneWidth: dropzone ? dropzone.offsetWidth : null,
      dropzoneDevice: dropzone ? dropzone.getAttribute('data-mf-theme-device') : null,
      iframePresent: !!iframe,
      iframeWidth: iframe ? iframe.offsetWidth : null,
      iframeHeight: iframe ? iframe.offsetHeight : null,
      wrapperPresent: !!wrapper,
      wrapperWidth: wrapper ? wrapper.offsetWidth : null,
      wrapperMaxWidth: wrapper ? getComputedStyle(wrapper).maxWidth : null,
      wrapperComputedWidth: wrapper ? getComputedStyle(wrapper).width : null,
    };
    
    if (iframe) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          const innerWrapper = doc.querySelector('.mf-form-wrapper');
          result.iframeDoc = {
            bodyWidth: doc.body ? doc.body.offsetWidth : null,
            wrapperPresent: !!innerWrapper,
            wrapperWidth: innerWrapper ? innerWrapper.offsetWidth : null,
            wrapperMaxWidth: innerWrapper ? getComputedStyle(innerWrapper).maxWidth : null,
            wrapperComputedWidth: innerWrapper ? getComputedStyle(innerWrapper).width : null,
          };
        }
      } catch (e) {
        result.iframeError = e.message;
      }
    }
    
    return result;
  });
  
  console.log('DESIGN STATE:', JSON.stringify(info, null, 2));
  
  await browser.close();
})();
