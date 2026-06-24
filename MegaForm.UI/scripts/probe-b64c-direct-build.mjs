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

await page.evaluate(() => {
  const t = document.querySelector('#mf-tab-link-theme');
  if (t) t.click();
});
await page.waitForTimeout(5000);

// Click STRUCTURE
await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.mf-tlr-tab'));
  const s = tabs.find(t => (t.textContent || '').trim().toUpperCase() === 'STRUCTURE');
  if (s) s.click();
});
await page.waitForTimeout(800);

// At this moment, replicate buildIframeFallbackTree in parent context and see what it returns
const result = await page.evaluate(() => {
  const iframe = document.querySelector('.mf-theme-preview-frame');
  if (!iframe) return { reason: 'no iframe' };
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return { reason: 'no body' };

  const isInteresting = (el) => {
    const tag = el.tagName.toLowerCase();
    if (['script','style','meta','link','br'].includes(tag)) return false;
    if (/\bmf-/.test(el.className || '')) return true;
    if (el.id) return true;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const SEMANTIC = ['form','section','header','footer','main','aside','article','nav','figure','figcaption','details','summary','label','fieldset','legend','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','h1','h2','h3','h4','h5','h6','p','a','img','input','textarea','select','button'];
      if (SEMANTIC.includes(tag)) return true;
    }
    return false;
  };

  const interest = [];
  Array.from(doc.body.children).forEach(c => {
    interest.push({ tag: c.tagName, cls: c.className.slice(0,80), id: c.id, interesting: isInteresting(c), childCount: c.children.length });
  });

  // Now call the actual deployed function via the module
  // Look in window for any exposed structure refresh
  const exposed = Object.keys(window).filter(k => /MFTheme|StructureTree|themeLeft/i.test(k));

  // Force a refresh attempt — toggle STRUCTURE tab off and on
  const tabs = Array.from(document.querySelectorAll('.mf-tlr-tab'));
  const inspectTab = tabs.find(t => (t.textContent || '').trim().toUpperCase() === 'INSPECT');
  const structTab = tabs.find(t => (t.textContent || '').trim().toUpperCase() === 'STRUCTURE');
  if (inspectTab && structTab) { inspectTab.click(); structTab.click(); }

  return { bodyChildren: interest, exposedKeys: exposed };
});

await page.waitForTimeout(5000);

// Re-check
const after = await page.evaluate(() => {
  const treeBox = document.querySelector('#td-structure-tree, .mf-tlr-structure-tree');
  return treeBox ? { textLen: treeBox.textContent.length, text: treeBox.textContent.slice(0, 200), htmlLen: treeBox.innerHTML.length, htmlPreview: treeBox.innerHTML.slice(0, 400) } : null;
});

await browser.close();
console.log(JSON.stringify({ result, after }, null, 2));
