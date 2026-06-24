// [B64-Verify] Real-browser probe per parent agent spec.
// 5 dimensions verification:
//   (a) Left panel: open builder form 333, click THEME tab.
//       Measure getComputedStyle of #mf-panel-left-content bg (should be ~white) and text color (dark).
//   (b) INSPECT editable: click INSPECT tab -> Pick element -> click iframe input -> wait
//       -> click one style value row -> type new value (font-size: 24px) -> Enter
//       -> verify iframe element computed style changed.
//   (c) STRUCTURE: click STRUCTURE tab -> verify left rail shows tree > 5 nodes.
//   (d) FlexGrid parity: open builder form 342, get bounding boxes of Appointment + MultiSelect cards.
//       y-positions should be roughly same (side by side).  Diff > 50px = FAIL.
//   (e) Single card: form 342 builder, count .mf-form elements (should be 1).
//       Check no nested .mf-form-inner > .mf-form > .mf-form chains.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('qa-out', { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 240)); });
page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message.slice(0, 240)));

const R = {
  build: 'B64',
  login: null,
  builder333Loaded: null,
  leftPanelLight: null,
  inspectEditable: null,
  structureTree: null,
  builder342Loaded: null,
  flexGridParity: null,
  singleCard: null,
  consoleErrors: [],
  steps: []
};
const note = (m) => { R.steps.push(m); console.log('STEP:', m); };

// ---------- LOGIN ----------
try {
  await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
  await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
  await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'qa-out/b64-01-login.png', fullPage: false });
  R.login = 'OK';
  note('Login OK');
} catch (e) {
  R.login = 'FAIL: ' + e.message;
  note('Login FAIL: ' + e.message);
}

// ---------- BUILDER 333 + THEME TAB ----------
try {
  await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'qa-out/b64-02-333-builder-loaded.png', fullPage: false });
  R.builder333Loaded = 'OK';

  // Click THEME tab
  const themeTabClick = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(
      '[data-mf-tab="theme"], [data-tab="theme"], #mf-tab-link-theme, [data-mf-rail-tab="theme"], button, .mf-tab, .mf-rail-tab'
    ));
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
  note('THEME tab click: ' + JSON.stringify(themeTabClick));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'qa-out/b64-03-333-theme-active.png', fullPage: false });
} catch (e) {
  R.builder333Loaded = 'FAIL: ' + e.message;
  note('Builder 333 FAIL: ' + e.message);
}

// ---------- DIMENSION (a): LEFT PANEL LIGHT ----------
try {
  const leftPanelData = await page.evaluate(() => {
    // Try multiple candidate selectors for the left rail panel
    const candidates = [
      '#mf-panel-left-content',
      '.mf-panel-left-content',
      '.mf-panel-left',
      '#mf-panel-left',
      '.mf-theme-left-rail',
      '.mf-tlr-pane',
      '.mf-tlr',
      '[data-mf-panel="left"]',
      '.mf-left-rail'
    ];
    const found = [];
    for (const s of candidates) {
      const els = document.querySelectorAll(s);
      for (const el of els) {
        const cs = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          found.push({
            sel: s,
            cls: (el.className || '').slice(0, 120),
            id: el.id,
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            width: Math.round(r.width),
            height: Math.round(r.height),
            x: Math.round(r.x),
            y: Math.round(r.y)
          });
        }
      }
    }
    // Also dump container itself for sanity
    return { count: found.length, items: found.slice(0, 10) };
  });
  R.leftPanelLight = leftPanelData;
  note('Left panel measure: ' + JSON.stringify(leftPanelData).slice(0, 500));
} catch (e) {
  R.leftPanelLight = { error: e.message };
  note('Left panel ERROR: ' + e.message);
}

// ---------- DIMENSION (b): INSPECT EDITABLE ----------
try {
  // Click INSPECT tab
  const inspectTabClick = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(
      '[data-mf-tlr-tab="inspect"], [data-tlr-tab="inspect"], .mf-tlr-tab, button'
    ));
    for (const t of tabs) {
      const txt = (t.textContent || '').trim().toUpperCase();
      const attr = (t.getAttribute('data-mf-tlr-tab') || t.getAttribute('data-tlr-tab') || '').toLowerCase();
      if (attr === 'inspect' || txt === 'INSPECT' || txt.startsWith('INSPECT')) {
        t.click();
        return { ok: true, txt: txt.slice(0, 30), attr };
      }
    }
    return { ok: false };
  });
  note('INSPECT tab click: ' + JSON.stringify(inspectTabClick));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa-out/b64-04-inspect-tab.png', fullPage: false });

  // Click Pick element button
  const pickBtnClick = await page.evaluate(() => {
    const sels = [
      '#mf-tlr-inspect-toggle',
      '.mf-tlr-inspect-pick',
      '.mf-tlr-pick-btn',
      '[data-mf-action="theme-pick"]',
      '[data-mf-action="inspect-pick"]'
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) {
        el.click();
        return { ok: true, sel: s, text: (el.textContent || '').trim().slice(0, 40) };
      }
    }
    return { ok: false };
  });
  note('Pick btn click: ' + JSON.stringify(pickBtnClick));
  await page.waitForTimeout(1000);

  // Click iframe input via dispatch
  const iframeClick = await page.evaluate(() => {
    const fr = document.querySelector('iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]');
    if (!fr || !fr.contentDocument) return { ok: false, reason: 'no-iframe-doc' };
    const doc = fr.contentDocument;
    const candidates = ['input[type="text"]', 'input[type="email"]', 'input[type="date"]', 'input'];
    for (const sel of candidates) {
      const els = Array.from(doc.querySelectorAll(sel));
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const dEvt = new doc.defaultView.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: doc.defaultView, button: 0 });
          el.dispatchEvent(dEvt);
          const evt = new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true, view: doc.defaultView });
          el.dispatchEvent(evt);
          try { el.click(); } catch (e) {}
          // Read computed style BEFORE edit
          const csBefore = doc.defaultView.getComputedStyle(el);
          return {
            ok: true, sel, tag: el.tagName, type: el.type || '',
            name: el.name || '', id: el.id || '',
            cls: (el.className || '').toString().slice(0, 120),
            fontSizeBefore: csBefore.fontSize,
            colorBefore: csBefore.color,
            x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height)
          };
        }
      }
    }
    return { ok: false, reason: 'no-input-found' };
  });
  note('Iframe click: ' + JSON.stringify(iframeClick));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/b64-05-after-iframe-click.png', fullPage: false });

  // Probe inspect result panel and look for editable style rows
  const inspectPanelProbe = await page.evaluate(() => {
    const sels = ['.mf-tlr-inspect-result', '.mf-tlr-inspect-output', '[data-mf-tlr-result]', '.mf-tlr-pane-inspect'];
    const found = [];
    for (const s of sels) {
      const els = document.querySelectorAll(s);
      for (const el of els) {
        const txt = (el.textContent || '').trim();
        const r = el.getBoundingClientRect();
        if (r.width > 0 || r.height > 0 || txt.length > 0) {
          // Look for editable rows — inputs / contenteditable / .mf-tlr-style-row
          const inputs = el.querySelectorAll('input, [contenteditable], .mf-tlr-style-row');
          const styleRows = el.querySelectorAll('.mf-tlr-style-row, [data-mf-css-prop], [data-mf-style-row]');
          found.push({
            sel: s,
            textLen: txt.length,
            textPreview: txt.slice(0, 300),
            inputCount: inputs.length,
            styleRowCount: styleRows.length,
            hasFontSize: /font-size/i.test(txt)
          });
        }
      }
    }
    return found;
  });
  note('Inspect panel probe: ' + JSON.stringify(inspectPanelProbe).slice(0, 400));

  // Attempt to edit a style row — find font-size and change to 24px
  const editAttempt = await page.evaluate(async () => {
    // Look for a "font-size" style row input by data-css-key
    const fontSizeInput = document.querySelector('.mf-tlr-style-val-input[data-css-key="font-size"]');
    const allInputs = Array.from(document.querySelectorAll('.mf-tlr-style-val-input'));
    const allRows = Array.from(document.querySelectorAll('.mf-tlr-style-row'));
    let target = fontSizeInput;
    const dataKeys = allInputs.map(i => i.getAttribute('data-css-key') || '');
    if (!target && allInputs.length) {
      // Take by name attribute lookup if data-css-key list omits font-size
      const byKey = allInputs.find(i => (i.getAttribute('data-css-key') || '').toLowerCase() === 'font-size');
      target = byKey || allInputs[0];
    }
    if (!target) return { ok: false, reason: 'no-editable-row', allInputsCount: allInputs.length, allRowsCount: allRows.length, dataKeys };
    target.focus();
    target.value = '24px';
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
    // Wait briefly for postMessage to traverse to iframe
    await new Promise(r => setTimeout(r, 1500));
    target.blur();
    return {
      ok: true,
      targetCssKey: target.getAttribute('data-css-key'),
      targetCls: (target.className || '').slice(0, 100),
      targetValueAfter: target.value,
      allInputsCount: allInputs.length,
      allRowsCount: allRows.length,
      dataKeys: dataKeys.slice(0, 50)
    };
  });
  note('Edit attempt: ' + JSON.stringify(editAttempt).slice(0, 300));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/b64-06-after-edit.png', fullPage: false });

  // Re-read computed font-size on the SAME picked iframe element (by id if available)
  const pickedId = iframeClick.id;
  const styleAfter = await page.evaluate((id) => {
    const fr = document.querySelector('iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]');
    if (!fr || !fr.contentDocument) return { ok: false };
    const doc = fr.contentDocument;
    let el = null;
    if (id) el = doc.getElementById(id);
    if (!el) {
      const els = Array.from(doc.querySelectorAll('input[type="text"], input'));
      el = els.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    }
    if (!el) return { ok: false, reason: 'no-el', searchedId: id };
    const cs = doc.defaultView.getComputedStyle(el);
    return {
      ok: true,
      id: el.id,
      inlineStyle: el.getAttribute('style') || '',
      fontSize: cs.fontSize,
      color: cs.color,
      fontFamily: cs.fontFamily.slice(0, 40)
    };
  }, pickedId);
  note('Style after edit: ' + JSON.stringify(styleAfter));

  R.inspectEditable = {
    inspectTabClick, pickBtnClick, iframeClick, inspectPanelProbe,
    editAttempt, styleAfter,
    changedFontSize: iframeClick.fontSizeBefore !== styleAfter.fontSize
  };
} catch (e) {
  R.inspectEditable = { error: e.message };
  note('Inspect editable ERROR: ' + e.message);
}

// ---------- DIMENSION (c): STRUCTURE TAB ----------
try {
  const structTabClick = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[data-mf-tlr-tab="structure"], .mf-tlr-tab, button'));
    for (const t of tabs) {
      const txt = (t.textContent || '').trim().toUpperCase();
      const attr = (t.getAttribute('data-mf-tlr-tab') || '').toLowerCase();
      if (attr === 'structure' || txt === 'STRUCTURE' || txt.startsWith('STRUCTURE')) {
        t.click();
        return { ok: true, txt: txt.slice(0, 30), attr };
      }
    }
    return { ok: false };
  });
  note('STRUCTURE tab click: ' + JSON.stringify(structTabClick));
  await page.waitForTimeout(12000);
  await page.screenshot({ path: 'qa-out/b64-07-structure-tab.png', fullPage: false });

  // Diagnostic: confirm iframe is present + body children
  const iframeState = await page.evaluate(() => {
    const fr = document.querySelector('.mf-theme-preview-frame, iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]');
    if (!fr) return { found: false };
    const doc = fr.contentDocument;
    if (!doc) return { found: true, hasDoc: false };
    const body = doc.body;
    const children = body ? Array.from(body.children).map(c => ({
      tag: c.tagName, id: c.id, cls: (c.className || '').slice(0, 80)
    })) : [];
    return {
      found: true, hasDoc: true,
      bodyChildren: children,
      bodyChildrenCount: children.length,
      frVisible: fr.offsetParent !== null,
      frClass: (fr.className || '').slice(0, 80)
    };
  });
  note('Iframe state during STRUCTURE: ' + JSON.stringify(iframeState).slice(0, 400));

  // Try clicking STRUCTURE again to retrigger mountStructureTree
  await page.evaluate(() => {
    const tab = document.querySelector('[data-tlr-tab="structure"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(2000);

  const treeProbe = await page.evaluate(() => {
    const sels = [
      '#mf-tlr-pane-structure',
      '#td-structure-tree',
      '.mf-tlr-structure-tree',
      '.td-structure-root',
      '.mf-tlr-iframe-tree',
      '.td-structure-node',
      '.mf-tlr-iframe-node',
      '.td-structure-item'
    ];
    const found = [];
    for (const s of sels) {
      const els = document.querySelectorAll(s);
      for (const el of els) {
        const txt = (el.textContent || '').trim();
        const r = el.getBoundingClientRect();
        const nodes = el.querySelectorAll('.td-structure-node, .mf-tlr-iframe-node, .td-structure-item, li');
        const hasNoFound = /no\s+customhtml|no\s+structure\s+found|preview\s+not\s+ready/i.test(txt);
        found.push({
          sel: s,
          visible: r.width > 0 && r.height > 0,
          width: Math.round(r.width),
          height: Math.round(r.height),
          textLen: txt.length,
          textPreview: txt.slice(0, 250),
          nodeCount: nodes.length,
          hasNoFoundMsg: hasNoFound
        });
      }
    }
    // Also probe document HTML for known empty-state strings
    const allText = document.body.textContent || '';
    const hasLoading = /loading\s+structure\s+tree/i.test(allText);
    return { found, hasLoadingText: hasLoading, iframeState: window.__iframeStateDbg };
  });
  R.structureTree = treeProbe;
  note('Structure tree probe: ' + JSON.stringify(treeProbe).slice(0, 400));
} catch (e) {
  R.structureTree = { error: e.message };
  note('Structure tab ERROR: ' + e.message);
}

// ---------- DIMENSION (d) + (e): FORM 342 BUILDER ----------
try {
  await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=342#mf-builder', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'qa-out/b64-08-342-builder.png', fullPage: false });
  R.builder342Loaded = 'OK';

  // FlexGrid parity probe — find Appointment and MultiSelect cards in builder canvas
  const flexProbe = await page.evaluate(() => {
    // Search canvas for any element whose label/header contains the words
    const allLabels = Array.from(document.querySelectorAll(
      '.mf-canvas-field, [data-mf-field], .mf-field, .mf-canvas-cell, [data-mf-widget]'
    ));
    const matchByText = (regex) => {
      for (const el of allLabels) {
        const txt = (el.textContent || '').toLowerCase();
        if (regex.test(txt)) {
          const r = el.getBoundingClientRect();
          return {
            cls: (el.className || '').slice(0, 120),
            id: el.id,
            dataWidget: el.getAttribute('data-mf-widget'),
            dataField: el.getAttribute('data-mf-field'),
            x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
            textPreview: txt.slice(0, 100)
          };
        }
      }
      return null;
    };
    const appt = matchByText(/appointment|appt\b/i);
    const multi = matchByText(/multi[\s-]?select|multiselect/i);
    return {
      totalCandidates: allLabels.length,
      appointment: appt,
      multiSelect: multi,
      yDiff: appt && multi ? Math.abs(appt.y - multi.y) : null,
      sideBySide: appt && multi ? Math.abs(appt.y - multi.y) <= 50 : null
    };
  });
  R.flexGridParity = flexProbe;
  note('FlexGrid parity: ' + JSON.stringify(flexProbe).slice(0, 400));
  await page.screenshot({ path: 'qa-out/b64-09-342-flexgrid.png', fullPage: false });

  // Single card probe
  const cardProbe = await page.evaluate(() => {
    const formCount = document.querySelectorAll('.mf-form').length;
    const wrapperCount = document.querySelectorAll('.mf-form-wrapper').length;
    const innerCount = document.querySelectorAll('.mf-form-inner').length;
    // Nested .mf-form > .mf-form chains
    const nested = Array.from(document.querySelectorAll('.mf-form .mf-form')).length;
    const tripleNested = Array.from(document.querySelectorAll('.mf-form-inner > .mf-form > .mf-form')).length;
    // Iframe inside (theme preview)
    let iframeCardCount = null;
    const fr = document.querySelector('iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]');
    if (fr && fr.contentDocument) {
      try { iframeCardCount = fr.contentDocument.querySelectorAll('.mf-form').length; } catch (e) {}
    }
    // List the .mf-form parents for diagnostic
    const forms = Array.from(document.querySelectorAll('.mf-form')).map(el => ({
      cls: (el.className || '').slice(0, 120),
      parentCls: (el.parentElement?.className || '').slice(0, 120),
      grandparentCls: (el.parentElement?.parentElement?.className || '').slice(0, 120)
    }));
    return {
      formCount, wrapperCount, innerCount,
      nestedFormPairs: nested,
      tripleNestedChains: tripleNested,
      iframeCardCount,
      forms: forms.slice(0, 5)
    };
  });
  R.singleCard = cardProbe;
  note('Single card probe: ' + JSON.stringify(cardProbe).slice(0, 500));
} catch (e) {
  R.builder342Loaded = 'FAIL: ' + e.message;
  note('Builder 342 ERROR: ' + e.message);
}

R.consoleErrors = consoleErrors.slice(0, 20);
writeFileSync('qa-out/b64-result.json', JSON.stringify(R, null, 2));
console.log('\n========= B64 PROBE RESULTS =========');
console.log(JSON.stringify(R, null, 2));
console.log('=====================================\n');
await browser.close();
