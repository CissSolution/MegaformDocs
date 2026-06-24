import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(5000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(8000);
await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);
const themeClickRes = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('[data-mf-tab="theme"], [data-tab="theme"], #mf-tab-link-theme, [data-mf-rail-tab="theme"], button, .mf-tab, .mf-rail-tab'));
  for (const t of tabs) {
    const txt = (t.textContent || '').trim().toUpperCase();
    const attr = (t.getAttribute('data-mf-tab') || t.getAttribute('data-tab') || t.getAttribute('data-mf-rail-tab') || '').toLowerCase();
    if (attr === 'theme' || txt === 'THEME' || txt.startsWith('🎨')) {
      t.click();
      return { ok: true, txt: txt.slice(0, 30), cls: (t.className || '').slice(0, 100) };
    }
  }
  return { ok: false };
});
console.log('THEME-CLICK:', JSON.stringify(themeClickRes));
await page.waitForTimeout(8000);
// Click INSPECT first to ensure iframe is materialized
await page.evaluate(() => { const t = document.querySelector('[data-tlr-tab="inspect"]'); if (t) t.click(); });
await page.waitForTimeout(2000);
// Click STRUCTURE
await page.evaluate(() => { const t = document.querySelector('[data-tlr-tab="structure"]'); if (t) t.click(); });
await page.waitForTimeout(4000);
// Click INSPECT then STRUCTURE again to force re-mount
await page.evaluate(() => { const t = document.querySelector('[data-tlr-tab="inspect"]'); if (t) t.click(); });
await page.waitForTimeout(1000);
await page.evaluate(() => { const t = document.querySelector('[data-tlr-tab="structure"]'); if (t) t.click(); });
await page.waitForTimeout(3000);
// Probe all iframes
const allFrames = await page.evaluate(() => {
  const frs = Array.from(document.querySelectorAll('iframe'));
  return frs.map(f => ({
    cls: (f.className || '').slice(0, 100),
    id: f.id || '',
    src: (f.src || '').slice(0, 100),
    hasSrcdoc: f.hasAttribute('srcdoc'),
    visible: f.offsetParent !== null,
    dataAttrs: Array.from(f.attributes).filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value.slice(0, 40))
  }));
});
console.log('ALL-IFRAMES:', JSON.stringify(allFrames, null, 2));
const dbg = await page.evaluate(() => {
  const fr = document.querySelector('iframe.mf-theme-preview-frame');
  if (!fr) return { err: 'no-frame' };
  const doc = fr.contentDocument;
  if (!doc) return { err: 'no-doc' };
  if (!doc.body) return { err: 'no-body' };
  const out = [];
  const children = doc.body.children;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    out.push({
      tag: c.tagName, id: c.id || '',
      cls: (c.className || '').toString().slice(0, 80),
      hasMfClass: /\bmf-/.test(c.className || ''),
      hasId: !!c.id,
      childrenCount: c.children.length,
      rect: (() => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()
    });
  }
  // Also check #mf-mount internals
  const mount = doc.getElementById('mf-mount');
  let mountKids = [];
  if (mount) {
    for (let i = 0; i < mount.children.length && i < 10; i++) {
      const k = mount.children[i];
      mountKids.push({ tag: k.tagName, id: k.id, cls: (k.className || '').toString().slice(0, 80) });
    }
  }
  return { children: out, mountKids };
});
console.log('IFRAME-DEBUG:', JSON.stringify(dbg, null, 2));
// Now ALSO probe the structure pane internal HTML
const paneHtml = await page.evaluate(() => {
  const p = document.querySelector('#td-structure-tree');
  return p ? p.innerHTML.slice(0, 800) : null;
});
console.log('STRUCTURE-PANE-HTML:', paneHtml);

// Mimic walkIframeNode logic in-page
const walkOutput = await page.evaluate(() => {
  const fr = document.querySelector('iframe.mf-theme-preview-frame');
  if (!fr) return { err: 'no-frame' };
  const doc = fr.contentDocument;
  if (!doc) return { err: 'no-doc' };
  function isInteresting(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link' || tag === 'br') return false;
    const cls = String(el.className || '');
    if (/\bmf-/.test(cls)) return true;
    if (el.id) return true;
    return false;
  }
  function walk(el, depth, max, log) {
    if (!isInteresting(el)) {
      if (depth >= max) return null;
      let kids = [];
      for (let c of el.children) {
        const v = walk(c, depth + 1, max, log);
        if (v) kids.push(v);
      }
      if (!kids.length) return null;
      return { synth: true, tag: el.tagName, id: el.id, cls: el.className, kids };
    }
    let kids = [];
    if (depth < max) {
      for (let c of el.children) {
        const v = walk(c, depth + 1, max, log);
        if (v) kids.push(v);
      }
    }
    return { synth: false, tag: el.tagName, id: el.id, cls: el.className, kids };
  }
  const result = [];
  for (let c of doc.body.children) {
    const v = walk(c, 0, 8, []);
    if (v) result.push(v);
  }
  return { result, count: result.length };
});
console.log('WALK-OUTPUT:', JSON.stringify(walkOutput, null, 2));

// Try calling readDraftCustomHtml
const customHtmlCheck = await page.evaluate(() => {
  try {
    const w = window;
    const draft = w.MFBuilder?.getDraft?.() || w.MegaFormBuilder?.getDraft?.();
    return {
      hasDraft: !!draft,
      customHtml: (draft?.settings?.customHtml || draft?.settings?.CustomHtml || '').slice(0, 200),
      hasCustomHtml: !!(draft?.settings?.customHtml || draft?.settings?.CustomHtml || '')
    };
  } catch (e) { return { err: e.message }; }
});
console.log('CUSTOM-HTML:', JSON.stringify(customHtmlCheck, null, 2));
await browser.close();
