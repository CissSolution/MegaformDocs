import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, bypassCSP: true });
const p = await ctx.newPage();
await p.goto('http://localhost:5000/api/MegaForm/render/13?probe=' + Date.now(), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await p.addStyleTag({ content: 'html,body{background:#0b0b0b!important}' });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const root = document.querySelector('.mfp.mfp-australia');
  const wrapper = root ? root.closest('.mf-form-wrapper') : null;
  const r1 = root ? getComputedStyle(root).backgroundColor : null;
  // inject a guaranteed-winning rule, re-measure
  const st = document.createElement('style');
  st.textContent = '.mf-form-wrapper[data-mf-has-custom-html] .mfp.mfp-australia,.mf-form-wrapper .mfp.mfp-australia,.mfp.mfp-australia{background:#ff0000!important}';
  document.head.appendChild(st);
  const r2 = root ? getComputedStyle(root).backgroundColor : null;
  return {
    rootFound: !!root,
    wrapperClass: wrapper ? wrapper.className : '(no .mf-form-wrapper ancestor)',
    wrapperHasCustomHtmlAttr: wrapper ? wrapper.hasAttribute('data-mf-has-custom-html') : null,
    wrapperAttrs: wrapper ? Array.from(wrapper.attributes).map(a => a.name).join(',') : null,
    bgBefore: r1,
    bgAfterInject: r2,
  };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
