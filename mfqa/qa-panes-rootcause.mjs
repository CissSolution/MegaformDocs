// Root-cause probe for Issue B: (1) duplicate form-id DOM collision in 33% panes,
// (2) exact overflow culprit on mobile. Prints structured JSON.
import { chromium } from 'playwright';
const BASE = 'http://localhost:5070';
const browser = await chromium.launch({ headless: true });

async function probe(label, w, h, waitMs) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/mfqa-panes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(waitMs);
  const data = await page.evaluate(() => {
    const vw = window.innerWidth;

    // (1) duplicate id detection for the form-scoped containers
    const allIds = [...document.querySelectorAll('[id^="mf-fields-container-"]')].map(e => e.id);
    const dupCount = {};
    allIds.forEach(id => { dupCount[id] = (dupCount[id] || 0) + 1; });

    // per wrapper: form id, module id, pane, width, hydrated?, ssr?, field count
    const wrappers = [...document.querySelectorAll('.mf-form-wrapper')].map(wr => {
      const r = wr.getBoundingClientRect();
      const fc = wr.querySelector('[id^="mf-fields-container-"]');
      let pane = '';
      let p = wr.parentElement;
      while (p && !pane) {
        const c = (p.className || '').toString();
        const m = c.match(/(Left|Right|Center|Top)[^"']*?(50%|33%|Full|Width)?/);
        if (/pane/i.test(c) || /50%|33%/.test(c)) pane = c.slice(0, 60);
        p = p.parentElement;
      }
      return {
        formId: wr.getAttribute('data-form-id'),
        moduleId: wr.getAttribute('data-module-id'),
        w: Math.round(r.width),
        hydrated: fc ? fc.getAttribute('data-mf-hydrated') : null,
        ssr: fc ? fc.getAttribute('data-mf-ssr') : null,
        fieldGroups: wr.querySelectorAll('.mf-field-group').length,
        inputs: wr.querySelectorAll('input,select,textarea').length,
        pane,
      };
    });

    // (2) overflow culprits: elements wider than viewport, with computed min-width
    const culprits = [];
    document.querySelectorAll('.mf-form-wrapper, .mf-form-wrapper *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 2 || r.right > vw + 2) {
        const cs = getComputedStyle(el);
        culprits.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 50),
          w: Math.round(r.width),
          right: Math.round(r.right),
          minW: cs.minWidth,
          gridCols: cs.gridTemplateColumns !== 'none' ? cs.gridTemplateColumns.slice(0, 60) : '',
        });
      }
    });
    culprits.sort((a, b) => b.w - a.w);

    return {
      vw,
      scrollW: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > vw + 2,
      duplicateIds: Object.entries(dupCount).filter(([, n]) => n > 1),
      wrappers,
      culprits: culprits.slice(0, 10),
    };
  });
  console.log(`\n===== [${label} ${w}x${h}] =====`);
  console.log(JSON.stringify(data, null, 1));
  await ctx.close();
}

await probe('desktop', 1440, 900, 11000);
await probe('mobile', 390, 850, 11000);
await browser.close();
console.log('\ndone');
