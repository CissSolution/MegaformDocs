import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, bypassCSP: true });
const p = await ctx.newPage();
await p.goto('http://localhost:5000/api/MegaForm/render/13?p3=' + Date.now(), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const matches = [];
  let order = 0;
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    const walk = (rlist, media) => {
      for (const r of rlist) {
        if (r.cssRules) { walk(r.cssRules, (r.media && r.media.mediaText) || media); continue; }
        order++;
        const sel = r.selectorText || '';
        const txt = r.cssText || '';
        if (/mfp-australia|\.mfp[\s,{]/.test(sel) && /background/.test(txt) && (/transparent|--au-surface|#fff|#0|var\(/i.test(txt))) {
          matches.push({ order, media: media || '', sel: sel.slice(0, 90), bg: (txt.match(/background[^;]*/) || [''])[0].slice(0, 60), imp: /!important/.test(txt), src: (sheet.href || 'inline').split('/').pop() });
        }
      }
    };
    walk(rules, '');
  }
  // test escalating specificity
  const root = document.querySelector('.mfp.mfp-australia');
  const tries = [
    ['A 0,4,0', '.mf-form-wrapper[data-mf-has-custom-html] .mfp.mfp-australia{background:#ff0001!important}'],
    ['B 0,5,0', '.mf-form-wrapper.mf-custom-shell-mode[data-mf-has-custom-html] .mfp.mfp-australia{background:#ff0002!important}'],
    ['C body>style late', null],
  ];
  const results = {};
  for (const [name, css] of tries) {
    if (!css) continue;
    const s = document.createElement('style'); s.textContent = css; document.body.appendChild(s);
    results[name] = getComputedStyle(root).backgroundColor;
  }
  return { matchingRules: matches, escalation: results };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
