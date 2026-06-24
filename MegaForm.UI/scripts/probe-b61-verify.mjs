// [B61-Verify v2] Focused re-probe per parent agent spec, with DOM-shape discovery.
//   1. Form 339 builder -> Razor card: count launcher buttons + capture text/cls
//   2. Form 339 builder -> DataRepeater card: same
//   3. Form 266 builder -> DynamicLabel card: same
//   4. Form 339 builder -> Click Razor unified launcher (2s), click .mf-unified-designer-ai sparkle (1s),
//      verify .mf-ai-drawer or .mf-ai-panel exists in DOM with visible state.
//   Screenshot every step.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('qa-out', { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 240)); });
page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message.slice(0, 240)));

const results = {
  build: 'B61',
  login: null,
  domDiscovery339: null,
  domDiscovery266: null,
  razorCard: null,            // dimension 1
  dataRepeaterCard: null,     // dimension 2
  dynLabelCard: null,         // dimension 3
  aiDrawer: null,             // dimension 4
  consoleErrors: [],
  steps: []
};

const note = (m) => { results.steps.push(m); console.log('STEP:', m); };

// ---------- LOGIN ----------
try {
  await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
  await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'qa-out/b61-01-login.png', fullPage: false });
  results.login = 'OK';
  note('Login OK');
} catch (e) {
  results.login = 'FAIL: ' + e.message;
  note('Login FAIL: ' + e.message);
}

async function openBuilder(formId, label, stepIdx) {
  await page.goto(`http://dnn10322_megaf.ai/xx?mfFormId=${formId}#mf-builder`, { waitUntil: 'commit', timeout: 120000 });
  // longer wait + scroll to materialize lazy cards
  await page.waitForTimeout(18000);
  // Activate fields tab
  await page.evaluate(() => {
    const tab = document.querySelector('[data-mf-tab="fields"], [data-tab="fields"], #mf-tab-link-fields');
    if (tab) tab.click();
  });
  await page.waitForTimeout(2000);
  // Scroll canvas to bottom to force render
  await page.evaluate(() => {
    const canvas = document.querySelector('#mf-canvas-dropzone, .mf-canvas-dropzone, .mf-canvas, [class*="canvas"]');
    if (canvas) canvas.scrollTop = canvas.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `qa-out/b61-${stepIdx}-${label}-loaded.png`, fullPage: true });
}

// Discovery helper — surface every data-field-type value present so we know the real tokens
async function discoverFieldTypes() {
  return await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[data-field-type], [data-mf-field-type]'));
    const counts = {};
    for (const el of all) {
      const v = (el.getAttribute('data-field-type') || el.getAttribute('data-mf-field-type') || '').toLowerCase();
      counts[v] = (counts[v] || 0) + 1;
    }
    // Also collect distinct mf-canvas-field classes
    const cards = Array.from(document.querySelectorAll('.mf-canvas-field, .mf-field-card, .mf-builder-field'));
    const cardClasses = Array.from(new Set(cards.map(c => (c.className || '').toString().slice(0, 120))));
    // Look for studio launcher buttons anywhere
    const launchers = Array.from(document.querySelectorAll(
      '.mfrz-studio-launcher, .mfdr-studio-launcher, .mfdl-studio-launcher, [class*="studio-launcher"], .mf-unified-designer-open, [data-mf-action="open-unified-designer"]'
    )).map(b => ({ cls: (b.className || '').slice(0, 120), text: (b.textContent || '').trim().slice(0, 60) }));
    return {
      totalFieldEls: all.length,
      fieldTypeCounts: counts,
      cardCount: cards.length,
      cardClassesSample: cardClasses.slice(0, 12),
      studioLaunchersFound: launchers
    };
  });
}

// Probe by token (matches data-field-type or class) — returns rich detail
async function probeCardByToken(tokens) {
  const tokensLower = tokens.map(t => t.toLowerCase());
  return await page.evaluate((tokensLower) => {
    // Broaden candidate pool: any card-like element
    const candidates = Array.from(document.querySelectorAll(
      '.mf-canvas-field, .mf-field-card, .mf-builder-field, [data-field-type], [data-mf-field-type]'
    ));
    // Dedupe: prefer outermost
    const seen = new Set();
    const uniq = [];
    for (const c of candidates) {
      // skip if already covered by an ancestor in the list
      let dup = false;
      for (const u of uniq) { if (u.contains(c) && u !== c) { dup = true; break; } }
      if (!dup && !seen.has(c)) { seen.add(c); uniq.push(c); }
    }
    const matches = uniq.filter(c => {
      const ft = (c.getAttribute('data-field-type') || c.getAttribute('data-mf-field-type') || '').toLowerCase();
      const cls = (c.className || '').toString().toLowerCase();
      // Look for studio launcher tokens that signal which widget type
      const hasMfrz = !!c.querySelector('.mfrz-studio-launcher, [class*="mfrz-"]');
      const hasMfdr = !!c.querySelector('.mfdr-studio-launcher, [class*="mfdr-"]');
      const hasMfdl = !!c.querySelector('.mfdl-studio-launcher, [class*="mfdl-"]');
      const txt = (c.textContent || '').toLowerCase();
      for (const tk of tokensLower) {
        if (ft.includes(tk) || cls.includes(tk)) return true;
        if (tk === 'razor' && hasMfrz) return true;
        if ((tk === 'datarepeater' || tk === 'datarepeat' || tk === 'repeater') && hasMfdr) return true;
        if ((tk === 'dynamiclabel' || tk === 'dynamic-label' || tk === 'dynamic') && hasMfdl) return true;
        if (txt.includes(tk + ' studio')) return true;
      }
      return false;
    });
    return {
      totalCandidates: uniq.length,
      matchCount: matches.length,
      cards: matches.slice(0, 5).map(m => {
        const buttons = Array.from(m.querySelectorAll('button'));
        return {
          fieldType: m.getAttribute('data-field-type') || m.getAttribute('data-mf-field-type') || '',
          className: (m.className || '').slice(0, 160),
          buttonCount: buttons.length,
          buttons: buttons.map(b => ({
            text: (b.textContent || '').trim().slice(0, 80),
            cls: (b.className || '').toString().slice(0, 160),
            title: (b.title || b.getAttribute('aria-label') || '').slice(0, 80)
          }))
        };
      })
    };
  }, tokensLower);
}

// ---------- FORM 339 BUILDER ----------
try {
  await openBuilder(339, 'form339', '02');
  const disc339 = await discoverFieldTypes();
  results.domDiscovery339 = disc339;
  note('339 discovery: cards=' + disc339.cardCount + ' types=' + JSON.stringify(disc339.fieldTypeCounts) + ' launchers=' + disc339.studioLaunchersFound.length);

  // 1. Razor
  const razor = await probeCardByToken(['razor']);
  results.razorCard = razor;
  note('Razor 339: matches=' + razor.matchCount + ' (of ' + razor.totalCandidates + ' candidates)');
  if (razor.cards.length) note('Razor[0] buttonCount=' + razor.cards[0].buttonCount + ' buttons=' + JSON.stringify(razor.cards[0].buttons));

  // 2. DataRepeater
  const dr = await probeCardByToken(['datarepeater', 'datarepeat', 'repeater']);
  results.dataRepeaterCard = dr;
  note('DR 339: matches=' + dr.matchCount + ' (of ' + dr.totalCandidates + ' candidates)');
  if (dr.cards.length) note('DR[0] buttonCount=' + dr.cards[0].buttonCount + ' buttons=' + JSON.stringify(dr.cards[0].buttons));
} catch (e) {
  results.razorCard = results.razorCard || { error: e.message };
  results.dataRepeaterCard = results.dataRepeaterCard || { error: e.message };
  note('339 probe ERROR: ' + e.message);
}

// ---------- FORM 266 BUILDER ----------
try {
  await openBuilder(266, 'form266', '03');
  const disc266 = await discoverFieldTypes();
  results.domDiscovery266 = disc266;
  note('266 discovery: cards=' + disc266.cardCount + ' types=' + JSON.stringify(disc266.fieldTypeCounts) + ' launchers=' + disc266.studioLaunchersFound.length);

  // 3. DynamicLabel
  const dl = await probeCardByToken(['dynamiclabel', 'dynamic-label', 'dynamic']);
  results.dynLabelCard = dl;
  note('DL 266: matches=' + dl.matchCount + ' (of ' + dl.totalCandidates + ' candidates)');
  if (dl.cards.length) note('DL[0] buttonCount=' + dl.cards[0].buttonCount + ' buttons=' + JSON.stringify(dl.cards[0].buttons));
} catch (e) {
  results.dynLabelCard = results.dynLabelCard || { error: e.message };
  note('266 probe ERROR: ' + e.message);
}

// ---------- 4. Razor card -> launcher -> AI sparkle -> drawer ----------
try {
  await openBuilder(339, 'form339-ai', '04');

  // Click the canonical UNIFIED launcher (not the studio launcher) on Razor card
  const launcherClick = await page.evaluate(() => {
    const sel = '.mfrz-unified-launcher';
    const els = Array.from(document.querySelectorAll(sel));
    if (els.length) {
      const r = els[0].getBoundingClientRect();
      const cs = getComputedStyle(els[0]);
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0;
      if (visible) {
        els[0].click();
        return { mode: sel, text: (els[0].textContent || '').trim().slice(0, 80), cls: (els[0].className || '').slice(0, 120), visible };
      }
    }
    return { mode: null };
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/b61-05-after-launcher-click.png', fullPage: false });
  note('Launcher click: ' + JSON.stringify(launcherClick));

  // Capture popup/modal/drawer DOM shape after unified launcher click
  const popupShape = await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll(
      '.mf-unified-designer, [class*="unified-designer"], .mf-modal, .mf-drawer, [class*="popup"], .mf-popup'
    ));
    const seen = new Set();
    const uniq = [];
    for (const p of popups) {
      let dup = false;
      for (const u of uniq) { if (u.contains(p) && u !== p) { dup = true; break; } }
      if (!dup && !seen.has(p)) { seen.add(p); uniq.push(p); }
    }
    return uniq.slice(0, 5).map(p => ({
      cls: (p.className || '').toString().slice(0, 160),
      id: p.id || '',
      buttonCount: p.querySelectorAll('button').length,
      sampleButtons: Array.from(p.querySelectorAll('button')).slice(0, 14).map(b => ({
        text: (b.textContent || '').trim().slice(0, 50),
        cls: (b.className || '').toString().slice(0, 120)
      }))
    }));
  });

  // Click AI sparkle button (.mf-unified-designer-ai canonical)
  const aiClick = await page.evaluate(() => {
    const sels = [
      'button.mf-unified-designer-ai',
      '.mf-unified-designer-ai',
      '.mf-ai-sparkle',
      '[data-mf-ai-toggle]',
      '.mf-ai-toggle',
      '[class*="unified-designer-ai"]',
      '[class*="ai-sparkle"]',
      '[class*="ai-toggle"]'
    ];
    const tried = [];
    for (const sel of sels) {
      const els = document.querySelectorAll(sel);
      tried.push({ sel, count: els.length });
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0;
        if (visible) {
          el.click();
          return { sel, cls: (el.className || '').toString().slice(0, 140), visible, width: r.width, height: r.height, tried };
        }
      }
    }
    // fallback: any button containing sparkle or AI text inside an open popup/modal
    const popups = Array.from(document.querySelectorAll(
      '.mf-unified-designer, [class*="unified-designer"], .mf-modal, .mf-popup, .mf-drawer'
    ));
    for (const p of popups) {
      const btns = Array.from(p.querySelectorAll('button, [role="button"]'));
      for (const b of btns) {
        const t = (b.textContent || '').trim();
        const cls = (b.className || '').toString().toLowerCase();
        if (t.includes('✨') || t.toLowerCase().includes('ai') || cls.includes('sparkle') || cls.includes('-ai')) {
          const r = b.getBoundingClientRect();
          if (r.width > 0) {
            b.click();
            return { sel: 'popup-fallback', text: t.slice(0, 80), cls: (b.className || '').slice(0, 140), tried };
          }
        }
      }
    }
    return { sel: null, tried };
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa-out/b61-06-after-ai-click.png', fullPage: false });
  note('AI click: ' + JSON.stringify(aiClick));

  // Drawer DOM check
  const drawerProbe = await page.evaluate(() => {
    const sels = ['.mf-ai-drawer', '.mf-ai-panel', '[class*="ai-drawer"]', '[class*="ai-panel"]'];
    const out = [];
    for (const sel of sels) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && r.width > 0 && r.height > 0;
        out.push({
          sel,
          cls: (el.className || '').toString().slice(0, 160),
          id: el.id || '',
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          width: Math.round(r.width),
          height: Math.round(r.height),
          x: Math.round(r.x),
          y: Math.round(r.y),
          visible
        });
      }
    }
    return { count: out.length, items: out };
  });

  results.aiDrawer = { launcherClick, popupShape, aiClick, drawerProbe };
  note('Popup shape: ' + JSON.stringify(popupShape).slice(0, 200));
  note('Drawer probe: count=' + drawerProbe.count + ' visibleAny=' + drawerProbe.items.some(i => i.visible));
} catch (e) {
  results.aiDrawer = { error: e.message };
  note('AI drawer flow ERROR: ' + e.message);
}

results.consoleErrors = consoleErrors.slice(0, 25);
await browser.close();

writeFileSync('qa-out/b61-probe.json', JSON.stringify(results, null, 2));
console.log('\n=========== B61 PROBE RESULTS ===========');
console.log(JSON.stringify(results, null, 2));
