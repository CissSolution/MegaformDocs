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
await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);
await page.evaluate(() => { const t = document.querySelector('#mf-tab-link-theme'); if (t) t.click(); });
await page.waitForTimeout(10000);

const result = await page.evaluate(() => {
  // Replicate buildIframeFallbackTree EXACTLY in parent context
  function getPreviewIframeDoc() {
    try {
      const frame = document.querySelector('.mf-theme-preview-frame');
      if (!frame) return null;
      return frame.contentDocument || (frame.contentWindow && frame.contentWindow.document) || null;
    } catch { return null; }
  }
  function isInterestingIframeNode(el) {
    try {
      const tag = el.tagName.toLowerCase();
      if (['script','style','meta','link','br'].includes(tag)) return false;
      const cls = String(el.className || '');
      if (/\bmf-/.test(cls)) return true;
      if (el.id) return true;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const SEMANTIC = ['form','section','header','footer','main','aside','article','nav','figure','figcaption','details','summary','label','fieldset','legend','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','h1','h2','h3','h4','h5','h6','p','a','img','input','textarea','select','button'];
        if (SEMANTIC.includes(tag)) return true;
      }
      return false;
    } catch { return false; }
  }
  function buildIframeSelector(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''); }
  function buildIframeLabel(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
  function renderIframeNodeHtml(view) {
    return '<div class="td-structure-node">' + escapeHtml(view.label) + (view.childrenHtml ? '<div class="td-structure-children">' + view.childrenHtml + '</div>' : '') + '</div>';
  }
  function walkIframeNode(el, depth, maxDepth) {
    if (!isInterestingIframeNode(el)) {
      if (depth >= maxDepth) return null;
      const kids = [];
      const children = el.children;
      for (let i = 0; i < children.length && i < 200; i++) {
        const child = children[i];
        if (!(child instanceof HTMLElement)) continue;
        const view = walkIframeNode(child, depth + 1, maxDepth);
        if (view) kids.push(renderIframeNodeHtml(view));
      }
      if (!kids.length) return null;
      return { selector: buildIframeSelector(el), label: buildIframeLabel(el), cls: '', childrenHtml: kids.join('') };
    }
    const view = { selector: buildIframeSelector(el), label: buildIframeLabel(el), cls: '', childrenHtml: '' };
    if (depth < maxDepth) {
      const kids = [];
      const children = el.children;
      for (let i = 0; i < children.length && i < 200; i++) {
        const child = children[i];
        if (!(child instanceof HTMLElement)) continue;
        const v = walkIframeNode(child, depth + 1, maxDepth);
        if (v) kids.push(renderIframeNodeHtml(v));
      }
      view.childrenHtml = kids.join('');
    }
    return view;
  }
  function buildIframeFallbackTree() {
    const doc = getPreviewIframeDoc();
    if (!doc || !doc.body) return '';
    const roots = [];
    const topChildren = doc.body.children;
    for (let i = 0; i < topChildren.length && i < 50; i++) {
      const child = topChildren[i];
      if (!(child instanceof HTMLElement)) continue;
      const view = walkIframeNode(child, 0, 8);
      if (view) roots.push(renderIframeNodeHtml(view));
    }
    if (!roots.length) return '';
    return '<div class="td-structure-root">' + roots.join('') + '</div>';
  }

  const html = buildIframeFallbackTree();
  const doc = getPreviewIframeDoc();
  const mfMount = doc ? doc.getElementById('mf-mount') : null;
  const mfMountKids = mfMount ? Array.from(mfMount.children).map(c => ({ tag: c.tagName, cls: c.className.slice(0, 60), id: c.id, kidCount: c.children.length, interesting: isInterestingIframeNode(c) })) : null;
  return { walkerResult: html.slice(0, 500), htmlLen: html.length, mfMountKids, hasDoc: !!doc, hasBody: !!(doc && doc.body), bodyKidsCount: (doc && doc.body) ? doc.body.children.length : 0 };
});

await browser.close();
console.log(JSON.stringify(result, null, 2));
