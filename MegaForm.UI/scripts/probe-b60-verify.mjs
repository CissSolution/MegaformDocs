// [B60-Verify] Real-browser visual QA across 6 dimensions.
// (a) form 335 Phone widget has country button OR is NOT in is-national mode
// (b) builder form 339 Razor + DataRepeater card has exactly 1 button each
// (c) builder form 266 DynamicLabel card has exactly 1 button
// (d) THEME tab preset click changes --mf-primary CSS var
// (e) Unified Designer → AI sparkle button opens .mf-ai-drawer or .mf-ai-panel
// (f) dashboard form-cards include a Report button
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
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

const results = {
  login: null,
  phonePass: null,
  razorSingleButton: null,
  dynLabelSingleButton: null,
  dataRepeaterSingleButton: null,
  themePresetWorks: null,
  aiDrawerOpens: null,
  reportButtonAppears: null,
  consoleErrors: [],
  notes: []
};

function note(msg) { results.notes.push(msg); console.log('NOTE:', msg); }

// LOGIN
try {
  await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
  await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
  await page.waitForTimeout(7000);
  results.login = 'OK';
} catch (e) {
  results.login = 'FAIL: ' + e.message;
  note('Login failed: ' + e.message);
}

// ============================================================
// (a) Phone widget on form 335 — has country button OR not in is-national mode
// ============================================================
try {
  await page.goto('http://dnn10322_megaf.ai/xx?formid=335', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(8000);
  const phoneProbe = await page.evaluate(() => {
    const wrappers = Array.from(document.querySelectorAll(
      '.mf-phone-wrap, [class*="phone-pro"], [data-mf-field-type="phone"], [data-field-type="phone"], .mf-phone-pro'
    ));
    if (!wrappers.length) {
      // broader search: any element with iti or phone country indicator
      const broad = Array.from(document.querySelectorAll('[class*="phone"], [class*="iti"]'));
      const out = { found: false, total: 0, sample: broad.slice(0, 5).map(el => ({
        cls: el.className, tag: el.tagName
      })) };
      return out;
    }
    const detail = wrappers.map(w => {
      const cls = (w.className || '').toString();
      const isNational = cls.includes('is-national') || w.classList.contains('is-national') ||
                         w.dataset.mode === 'national' || w.querySelector('.is-national');
      const countryBtn = w.querySelector(
        '.mf-phone-country-btn, .mf-phone-country, .iti__flag-container, .iti__selected-country, [class*="country-btn"], [class*="flag-btn"]'
      );
      const allButtons = w.querySelectorAll('button');
      return {
        cls,
        isNational: !!isNational,
        hasCountryBtn: !!countryBtn,
        countryBtnClass: countryBtn ? countryBtn.className : null,
        buttonCount: allButtons.length,
        buttonClasses: Array.from(allButtons).map(b => b.className)
      };
    });
    return { found: true, total: wrappers.length, detail };
  });
  await page.screenshot({ path: 'qa-out/b60-phone-form335.png', fullPage: false });
  // Pass logic: either NOT in is-national mode, OR has a country button when is-national
  if (!phoneProbe.found || phoneProbe.total === 0) {
    results.phonePass = 'NO_PHONE_WIDGET (form 335 may not have Phone field rendered)';
    note('No phone wrapper found. Sample: ' + JSON.stringify(phoneProbe.sample || []).slice(0, 200));
  } else {
    const allOK = phoneProbe.detail.every(d => !d.isNational || d.hasCountryBtn);
    results.phonePass = allOK ? 'PASS' : 'FAIL';
    note('Phone widgets: ' + JSON.stringify(phoneProbe.detail).slice(0, 400));
  }
} catch (e) {
  results.phonePass = 'ERROR: ' + e.message;
}

// ============================================================
// Helper to load builder + count buttons in a typed field card
// ============================================================
async function probeBuilderCard(formId, fieldTypeFilter, label) {
  await page.goto(`http://dnn10322_megaf.ai/xx?mfFormId=${formId}#mf-builder`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(15000);
  // Try clicking the canvas/fields tab if needed
  await page.evaluate(() => {
    const tab = document.querySelector('[data-mf-tab="fields"], [data-tab="fields"], #mf-tab-link-fields');
    if (tab) tab.click();
  });
  await page.waitForTimeout(1500);

  const cardProbe = await page.evaluate((filter) => {
    const candidates = Array.from(document.querySelectorAll(
      '.mf-canvas-field, .mf-field-card, [data-field-type], [data-mf-field-type], .mf-builder-field'
    ));
    const matches = candidates.filter(c => {
      const ft = (c.getAttribute('data-field-type') || c.getAttribute('data-mf-field-type') || '').toLowerCase();
      const cls = (c.className || '').toString().toLowerCase();
      const txt = (c.textContent || '').toLowerCase();
      return ft.includes(filter) || cls.includes(filter) || txt.includes(filter);
    });
    return {
      totalCandidates: candidates.length,
      matchCount: matches.length,
      details: matches.slice(0, 5).map(m => {
        const buttons = m.querySelectorAll('button');
        const btnInfo = Array.from(buttons).map(b => ({
          text: (b.textContent || '').trim().slice(0, 30),
          cls: (b.className || '').slice(0, 80),
          title: b.title || b.getAttribute('aria-label') || ''
        }));
        // Filter out edit/delete/duplicate/settings/drag icons — focus on "Open" action buttons
        const openButtons = btnInfo.filter(b => {
          const t = (b.text + ' ' + b.title + ' ' + b.cls).toLowerCase();
          return t.includes('open') || t.includes('designer') || t.includes('studio') ||
                 t.includes('editor') || t.includes('layout') || t.includes('configure');
        });
        return {
          fieldType: m.getAttribute('data-field-type') || m.getAttribute('data-mf-field-type'),
          className: (m.className || '').slice(0, 100),
          totalButtons: buttons.length,
          openButtons: openButtons.length,
          openButtonDetails: openButtons,
          allButtonsTexts: btnInfo.map(b => b.text || b.title).filter(Boolean)
        };
      })
    };
  }, fieldTypeFilter);
  await page.screenshot({ path: `qa-out/b60-${label}.png`, fullPage: false });
  return cardProbe;
}

// ============================================================
// (b) Form 339 Razor and DataRepeater single button cards
// ============================================================
try {
  const razorProbe = await probeBuilderCard(339, 'razor', 'razor-339');
  results.razorSingleButton = JSON.stringify({
    totalCandidates: razorProbe.totalCandidates,
    matchCount: razorProbe.matchCount,
    details: razorProbe.details
  }).slice(0, 600);
  // Check details for single open-button count
  const razorPass = razorProbe.details.length > 0 &&
                    razorProbe.details.some(d => d.openButtons === 1);
  note('Razor card open-button check: ' + (razorPass ? 'PASS' : 'CHECK_DETAILS'));

  const drProbe = await probeBuilderCard(339, 'datarepeat', 'datarepeater-339');
  results.dataRepeaterSingleButton = JSON.stringify({
    totalCandidates: drProbe.totalCandidates,
    matchCount: drProbe.matchCount,
    details: drProbe.details
  }).slice(0, 600);
  const drPass = drProbe.details.length > 0 &&
                 drProbe.details.some(d => d.openButtons === 1);
  note('DataRepeater card open-button check: ' + (drPass ? 'PASS' : 'CHECK_DETAILS'));
} catch (e) {
  results.razorSingleButton = 'ERROR: ' + e.message;
  results.dataRepeaterSingleButton = 'ERROR: ' + e.message;
}

// ============================================================
// (c) Form 266 DynamicLabel single button
// ============================================================
try {
  const dynLabelProbe = await probeBuilderCard(266, 'dynamiclabel', 'dynlabel-266');
  // also try shorter token
  let chosen = dynLabelProbe;
  if (dynLabelProbe.matchCount === 0) {
    chosen = await probeBuilderCard(266, 'dynamic', 'dynlabel-266-b');
  }
  results.dynLabelSingleButton = JSON.stringify({
    totalCandidates: chosen.totalCandidates,
    matchCount: chosen.matchCount,
    details: chosen.details
  }).slice(0, 600);
  const dlPass = chosen.details.length > 0 &&
                 chosen.details.some(d => d.openButtons === 1);
  note('DynLabel card open-button check: ' + (dlPass ? 'PASS' : 'CHECK_DETAILS'));
} catch (e) {
  results.dynLabelSingleButton = 'ERROR: ' + e.message;
}

// ============================================================
// (d) THEME tab preset click changes --mf-primary CSS var
// ============================================================
try {
  await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=339#mf-builder', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(15000);
  // Click THEME tab
  const themeClick = await page.evaluate(() => {
    const selectors = [
      '#mf-tab-link-theme',
      '[data-mf-tab="theme"]',
      '[data-tab="theme"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { el.click(); return sel; }
    }
    const tabs = Array.from(document.querySelectorAll('.mf-right-tab, [class*="right-tab"], [class*="tab-link"]'));
    for (const t of tabs) {
      const txt = (t.textContent || '').trim().toUpperCase();
      if (txt === 'THEME' || txt.includes('THEME')) { t.click(); return 'text-match'; }
    }
    return null;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/b60-theme-tab.png', fullPage: false });

  // Read --mf-primary before
  const beforeVar = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const canvas = document.querySelector('#mf-canvas-dropzone, .mf-canvas-dropzone, .mf-canvas');
    const s1 = getComputedStyle(root).getPropertyValue('--mf-primary').trim();
    const s2 = getComputedStyle(body).getPropertyValue('--mf-primary').trim();
    const s3 = canvas ? getComputedStyle(canvas).getPropertyValue('--mf-primary').trim() : '';
    return { root: s1, body: s2, canvas: s3 };
  });

  // Click first preset tile
  const presetClick = await page.evaluate(() => {
    const selectors = [
      '.mf-theme-preset-tile',
      '[data-mf-preset]',
      '[data-preset]',
      '.mf-preset-tile',
      '.mf-theme-preset',
      '.mf-tlr-preset'
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      // Skip first if currently active; try second too
      if (els.length > 1) { els[1].click(); return { sel, count: els.length, idx: 1 }; }
      if (els.length > 0) { els[0].click(); return { sel, count: els.length, idx: 0 }; }
    }
    return null;
  });
  await page.waitForTimeout(2000);

  // Read --mf-primary after
  const afterVar = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const canvas = document.querySelector('#mf-canvas-dropzone, .mf-canvas-dropzone, .mf-canvas');
    const s1 = getComputedStyle(root).getPropertyValue('--mf-primary').trim();
    const s2 = getComputedStyle(body).getPropertyValue('--mf-primary').trim();
    const s3 = canvas ? getComputedStyle(canvas).getPropertyValue('--mf-primary').trim() : '';
    return { root: s1, body: s2, canvas: s3 };
  });

  const changed = JSON.stringify(beforeVar) !== JSON.stringify(afterVar);
  results.themePresetWorks = JSON.stringify({
    themeClick, presetClick, beforeVar, afterVar, changed
  }).slice(0, 600);
  note('Theme preset before: ' + JSON.stringify(beforeVar) + ' after: ' + JSON.stringify(afterVar));
} catch (e) {
  results.themePresetWorks = 'ERROR: ' + e.message;
}

// ============================================================
// (e) Unified Designer → AI sparkle button opens drawer
// ============================================================
try {
  await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=339#mf-builder', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(15000);
  // Find Razor card and click Open Unified Designer
  const openClick = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(
      '.mf-canvas-field, .mf-field-card, [data-field-type], [data-mf-field-type]'
    ));
    for (const c of cards) {
      const ft = (c.getAttribute('data-field-type') || c.getAttribute('data-mf-field-type') || '').toLowerCase();
      if (!ft.includes('razor')) continue;
      const buttons = c.querySelectorAll('button');
      for (const b of buttons) {
        const t = ((b.textContent || '') + ' ' + (b.title || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
        if (t.includes('open') || t.includes('designer') || t.includes('studio') || t.includes('unified')) {
          b.click();
          return { clicked: true, text: b.textContent.trim().slice(0, 40), title: b.title };
        }
      }
    }
    return { clicked: false };
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'qa-out/b60-unified-opened.png', fullPage: false });

  // Now find and click AI sparkle
  const aiClick = await page.evaluate(() => {
    const sels = [
      '.mf-unified-designer-ai',
      '.mf-ai-sparkle',
      '[data-mf-ai-toggle]',
      '.mf-ai-toggle',
      '[class*="ai-sparkle"]',
      '[class*="ai-toggle"]'
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) { el.click(); return { clicked: sel }; }
    }
    // fallback: any button with sparkle emoji or AI text
    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const b of btns) {
      const t = (b.textContent || '').trim();
      const cls = (b.className || '').toString().toLowerCase();
      if (t.includes('✨') || cls.includes('sparkle') || cls.includes('ai-')) {
        b.click();
        return { clicked: 'fallback: ' + (b.className || t).slice(0, 80) };
      }
    }
    return { clicked: null };
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/b60-ai-drawer.png', fullPage: false });

  // Check drawer exists
  const drawerProbe = await page.evaluate(() => {
    const sels = [
      '.mf-ai-drawer',
      '.mf-ai-panel',
      '[class*="ai-drawer"]',
      '[class*="ai-panel"]'
    ];
    const found = [];
    for (const sel of sels) {
      const els = document.querySelectorAll(sel);
      if (els.length) {
        for (const el of els) {
          const cs = getComputedStyle(el);
          const visible = cs.display !== 'none' && cs.visibility !== 'hidden';
          const r = el.getBoundingClientRect();
          found.push({
            sel, cls: el.className.slice(0, 100), display: cs.display,
            visible, width: r.width, height: r.height
          });
        }
      }
    }
    return { found };
  });
  results.aiDrawerOpens = JSON.stringify({ openClick, aiClick, drawerProbe }).slice(0, 700);
  note('AI drawer probe: ' + JSON.stringify(drawerProbe).slice(0, 300));
} catch (e) {
  results.aiDrawerOpens = 'ERROR: ' + e.message;
}

// ============================================================
// (f) Dashboard Report button
// ============================================================
try {
  // Navigate to a stable dashboard URL — host page for MegaForm should expose dashboard
  // Try in-builder dashboard chip first
  await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=339#mf-builder', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(10000);
  const dashClick = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll(
      '.mf-dashboard-chip, .mf-back-dashboard, [data-mf-back], [href*="formid="]'
    ));
    for (const c of chips) {
      const t = (c.textContent || '').toLowerCase();
      if (t.includes('dashboard') || t.includes('back')) { c.click(); return { clicked: c.tagName + ':' + (c.className || c.href).slice(0, 80) }; }
    }
    // fallback: anchor/button with "Dashboard"
    const all = Array.from(document.querySelectorAll('a, button'));
    for (const el of all) {
      const t = (el.textContent || '').trim().toLowerCase();
      if (t === 'dashboard' || t.includes('← dashboard') || t.includes('back to dashboard')) {
        el.click();
        return { clicked: 'fallback ' + el.tagName };
      }
    }
    return { clicked: null };
  });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'qa-out/b60-dashboard.png', fullPage: false });

  const reportProbe = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(
      '.mf-dash-form-card, [class*="form-card"], [class*="dash-form"], .mf-form-card'
    ));
    let totalCards = cards.length;
    let reportCount = 0;
    const samples = [];
    for (const c of cards.slice(0, 10)) {
      const buttons = c.querySelectorAll('button, a, .mf-btn');
      let cardHasReport = false;
      const btnTexts = [];
      for (const b of buttons) {
        const t = (b.textContent || '').trim();
        const title = (b.title || b.getAttribute('aria-label') || '').toLowerCase();
        const cls = (b.className || '').toLowerCase();
        btnTexts.push(t.slice(0, 30));
        if (t.includes('📊') || t.toLowerCase().includes('report') || title.includes('report') || cls.includes('report')) {
          cardHasReport = true;
        }
      }
      if (cardHasReport) reportCount++;
      samples.push({
        className: c.className.slice(0, 80),
        btnTexts: btnTexts.slice(0, 10),
        hasReport: cardHasReport
      });
    }
    // also broader: any "Report" button anywhere on the page
    const allButtons = Array.from(document.querySelectorAll('button, a'));
    const reportLikeAnywhere = allButtons.filter(b => {
      const t = (b.textContent || '').trim().toLowerCase();
      const title = (b.title || '').toLowerCase();
      return t.includes('report') || title.includes('report') || t.includes('📊');
    }).length;
    return { totalCards, reportCount, samples, reportLikeAnywhere };
  });
  results.reportButtonAppears = JSON.stringify({ dashClick, reportProbe }).slice(0, 700);
  note('Dashboard report probe: total=' + reportProbe.totalCards + ' withReport=' + reportProbe.reportCount + ' anywhere=' + reportProbe.reportLikeAnywhere);
} catch (e) {
  results.reportButtonAppears = 'ERROR: ' + e.message;
}

results.consoleErrors = consoleErrors.slice(0, 20);
await browser.close();

writeFileSync('qa-out/b60-probe.json', JSON.stringify(results, null, 2));
console.log('\n=========== B60 PROBE RESULTS ===========');
console.log(JSON.stringify(results, null, 2));
