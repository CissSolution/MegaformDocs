// [B63-Verify] Real-browser probe per parent agent spec.
//   1. Login host/dnnhost on http://dnn10322_megaf.ai
//   2. Open builder form 333 -> click THEME tab -> wait iframe ready
//   3. Click INSPECT tab in left rail -> click Pick element button
//   4. Inside iframe: dispatch real click on Date Picker input via querySelector
//   5. Wait 1s -> check left-rail .mf-tlr-inspect-result for breadcrumb + style rows
//   6. Measure iframe form wrapper width vs builder canvas width (print both)
//   7. Open runtime form 333 (/xx?formid=333)
//      - probe palette tiles for "v20260602" substring (should be 0)
//      - find Date Picker input, fill required fields, click Submit, wait 2s,
//        check mf-success-* or success-msg panel renders with B59 success title
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
  build: 'B63',
  login: null,
  themeIframeReady: null,
  inspectPick: null,
  widthParity: null,
  runtimeBadges: null,
  afterSubmit: null,
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
  await page.screenshot({ path: 'qa-out/b63-01-login.png', fullPage: false });
  R.login = 'OK';
  note('Login OK');
} catch (e) {
  R.login = 'FAIL: ' + e.message;
  note('Login FAIL: ' + e.message);
}

// ---------- BUILDER + THEME TAB ----------
try {
  await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'qa-out/b63-02-builder-loaded.png', fullPage: false });

  // Try to click THEME tab — try multiple possible selectors
  const themeTabClick = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(
      '[data-mf-tab="theme"], [data-tab="theme"], #mf-tab-link-theme, [data-mf-rail-tab="theme"], button, .mf-tab, .mf-rail-tab'
    ));
    const tried = [];
    for (const t of tabs) {
      const txt = (t.textContent || '').trim().toUpperCase();
      const attr = (t.getAttribute('data-mf-tab') || t.getAttribute('data-tab') || t.getAttribute('data-mf-rail-tab') || '').toLowerCase();
      tried.push({ txt: txt.slice(0, 30), attr });
      if (attr === 'theme' || txt === 'THEME' || txt.startsWith('🎨')) {
        t.click();
        return { ok: true, txt: txt.slice(0, 30), cls: (t.className || '').slice(0, 100) };
      }
    }
    return { ok: false, sample: tried.slice(0, 15) };
  });
  note('THEME tab click: ' + JSON.stringify(themeTabClick).slice(0, 300));
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'qa-out/b63-03-theme-active.png', fullPage: false });

  // Check iframe ready — scope to theme preview iframe ONLY
  const iframeProbe = await page.evaluate(() => {
    const fr = document.querySelector('iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]');
    if (!fr) return { found: false };
    const r = fr.getBoundingClientRect();
    let body = null;
    let wrapper = null;
    try {
      body = fr.contentDocument && fr.contentDocument.body ? fr.contentDocument.body.innerHTML.length : 0;
      wrapper = fr.contentDocument && fr.contentDocument.querySelector('.mf-form-wrapper, .mf-form');
    } catch (e) {}
    return {
      found: true,
      src: (fr.src || '').slice(0, 120),
      srcdoc: fr.hasAttribute('srcdoc'),
      width: Math.round(r.width),
      height: Math.round(r.height),
      bodyLen: body,
      hasWrapper: !!wrapper,
      wrapperWidth: wrapper ? Math.round(wrapper.getBoundingClientRect().width) : null
    };
  });
  R.themeIframeReady = iframeProbe;
  note('Iframe probe: ' + JSON.stringify(iframeProbe));
} catch (e) {
  R.themeIframeReady = { error: e.message };
  note('Theme iframe ERROR: ' + e.message);
}

// ---------- INSPECT TAB + PICK ELEMENT ----------
try {
  // Click INSPECT left-rail tab
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
  await page.screenshot({ path: 'qa-out/b63-04-inspect-tab.png', fullPage: false });

  // Click Pick element button — canonical id is #mf-tlr-inspect-toggle
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
        return { ok: true, sel: s, cls: (el.className || '').slice(0, 100), text: (el.textContent || '').trim().slice(0, 40) };
      }
    }
    // fallback: any button text containing "pick" inside inspect pane
    const pane = document.querySelector('.mf-tlr-pane-inspect, [data-mf-tlr-pane="inspect"], .mf-tlr-inspect');
    if (pane) {
      const btns = Array.from(pane.querySelectorAll('button'));
      for (const b of btns) {
        const t = (b.textContent || '').toLowerCase();
        if (t.includes('pick') || t.includes('inspect') || t.includes('crosshair')) {
          b.click();
          return { ok: true, sel: 'pane-fallback', text: (b.textContent || '').trim().slice(0, 40), cls: (b.className || '').slice(0, 100) };
        }
      }
    }
    return { ok: false };
  });
  note('Pick btn click: ' + JSON.stringify(pickBtnClick));
  await page.waitForTimeout(1000);

  // Dispatch click on Date Picker input inside iframe — scope to theme preview iframe
  const iframeClick = await page.evaluate(() => {
    const fr = document.querySelector('iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]');
    if (!fr || !fr.contentDocument) return { ok: false, reason: 'no-iframe-doc' };
    const doc = fr.contentDocument;
    const candidates = [
      'input[type="date"]',
      'input[type="datetime-local"]',
      '[data-mf-widget="datepicker"]',
      '.mf-datepicker input',
      '.mf-date-picker input',
      '[data-field-type="date"] input',
      '[data-field-type="datetime"] input',
      'input[name*="date" i]',
      'input.mfp-date',
      '.flatpickr-input',
      'input'
    ];
    for (const sel of candidates) {
      const els = Array.from(doc.querySelectorAll(sel));
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // The iframe inspect handler listens on `mousedown` capture-phase.
          // Dispatch mousedown FIRST (this fires the bridge), then click.
          const dEvt = new doc.defaultView.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: doc.defaultView, button: 0 });
          el.dispatchEvent(dEvt);
          const evt = new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true, view: doc.defaultView });
          el.dispatchEvent(evt);
          // Also call .click() directly as a fallback
          try { el.click(); } catch (e) {}
          return {
            ok: true,
            sel,
            tag: el.tagName,
            type: el.type || '',
            cls: (el.className || '').toString().slice(0, 120),
            name: el.name || '',
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height)
          };
        }
      }
    }
    return { ok: false, reason: 'no-input-found' };
  });
  note('Iframe Date click: ' + JSON.stringify(iframeClick));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/b63-05-after-iframe-click.png', fullPage: false });

  // Check left rail inspect result panel for breadcrumb + styles
  const resultProbe = await page.evaluate(() => {
    const sels = ['.mf-tlr-inspect-result', '.mf-tlr-inspect-output', '[data-mf-tlr-result]', '.mf-tlr-pane-inspect'];
    const found = [];
    for (const s of sels) {
      const els = document.querySelectorAll(s);
      for (const el of els) {
        const txt = (el.textContent || '').trim();
        const r = el.getBoundingClientRect();
        found.push({
          sel: s,
          cls: (el.className || '').slice(0, 120),
          textLen: txt.length,
          textPreview: txt.slice(0, 400),
          width: Math.round(r.width),
          height: Math.round(r.height),
          hasBreadcrumb: /breadcrumb|>|»|→|\bbody\b|\bhtml\b/i.test(txt),
          hasStyleRows: /color|font|width|height|padding|margin|background|border/i.test(txt),
          styleRowCount: (txt.match(/(color|font|width|height|padding|margin|background|border)\s*:/gi) || []).length
        });
      }
    }
    return { count: found.length, items: found };
  });
  R.inspectPick = { inspectTabClick, pickBtnClick, iframeClick, resultProbe };
  note('Inspect result: ' + JSON.stringify(resultProbe).slice(0, 400));
} catch (e) {
  R.inspectPick = { error: e.message };
  note('Inspect probe ERROR: ' + e.message);
}

// ---------- WIDTH PARITY: iframe form wrapper vs builder canvas ----------
try {
  const widthData = await page.evaluate(() => {
    const fr = document.querySelector('iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]');
    let iframeWrapperWidth = null;
    let iframeBodyWidth = null;
    let iframeMountWidth = null;
    if (fr && fr.contentDocument) {
      const doc = fr.contentDocument;
      const wrap = doc.querySelector('.mf-form-wrapper');
      const inner = doc.querySelector('.mf-form-inner');
      const form = doc.querySelector('.mf-form');
      const mount = doc.querySelector('#mf-mount');
      if (wrap) iframeWrapperWidth = Math.round(wrap.getBoundingClientRect().width);
      if (mount) iframeMountWidth = Math.round(mount.getBoundingClientRect().width);
      iframeBodyWidth = Math.round(doc.body.getBoundingClientRect().width);
      var innerW = inner ? Math.round(inner.getBoundingClientRect().width) : null;
      var formW = form ? Math.round(form.getBoundingClientRect().width) : null;
      var iframeOuterWidth = Math.round(fr.getBoundingClientRect().width);
      var dropzone = document.querySelector('#mf-canvas-dropzone, .mf-canvas-dropzone, .mf-canvas');
      var canvasW = dropzone ? Math.round(dropzone.getBoundingClientRect().width) : null;
      return {
        iframePresent: true,
        canvasDropzoneWidth: canvasW,
        iframeOuterWidth,
        iframeBodyWidth,
        iframeMountWidth,
        iframeWrapperWidth,
        iframeInnerWidth: innerW,
        iframeFormWidth: formW
      };
    }
    var dropzoneOnly = document.querySelector('#mf-canvas-dropzone, .mf-canvas-dropzone, .mf-canvas');
    return { iframePresent: false, canvasDropzoneWidth: dropzoneOnly ? Math.round(dropzoneOnly.getBoundingClientRect().width) : null };
  });
  R.widthParity = { theme: widthData };
  note('Theme widths: ' + JSON.stringify(widthData));
} catch (e) {
  R.widthParity = { error: e.message };
  note('Width probe ERROR: ' + e.message);
}

// ---------- RUNTIME FORM 333 ----------
try {
  await page.goto('http://dnn10322_megaf.ai/xx?formid=333', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: 'qa-out/b63-06-runtime.png', fullPage: true });

  // Measure runtime form wrapper width
  const runtimeWidths = await page.evaluate(() => {
    const wrap = document.querySelector('.mf-form-wrapper');
    const inner = document.querySelector('.mf-form-inner');
    const form = document.querySelector('.mf-form');
    return {
      wrapperWidth: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
      innerWidth: inner ? Math.round(inner.getBoundingClientRect().width) : null,
      formWidth: form ? Math.round(form.getBoundingClientRect().width) : null
    };
  });
  R.widthParity.runtime = runtimeWidths;
  note('Runtime widths: ' + JSON.stringify(runtimeWidths));

  // Check palette tiles / widget labels for v20260602 in document text
  const badges = await page.evaluate(() => {
    // For runtime, "palette tiles" appear if mode=builder. On pure runtime
    // we look for any rendered widget that exposes a build badge label.
    const allText = document.body.innerText || '';
    const allHtml = document.body.innerHTML || '';
    const textHits = (allText.match(/v20260602[^\s\<]*/gi) || []);
    const htmlHits = (allHtml.match(/v20260602[^\s\<]*/gi) || []);
    // Also look for Map and Phone widget labels specifically
    const mapEls = Array.from(document.querySelectorAll('[data-field-type="map"], [data-mf-widget="map"], .mfp-map, .mf-map'));
    const phoneEls = Array.from(document.querySelectorAll('[data-field-type="phone-pro"], [data-mf-widget="phone-pro"], .mfp-phone, .mf-phone-pro'));
    return {
      textHitCount: textHits.length,
      textHitsSample: textHits.slice(0, 5),
      htmlHitCount: htmlHits.length,
      htmlHitsSample: htmlHits.slice(0, 5),
      mapPresent: mapEls.length,
      phonePresent: phoneEls.length,
      mapLabelText: mapEls.length ? (mapEls[0].textContent || '').trim().slice(0, 200) : null,
      phoneLabelText: phoneEls.length ? (phoneEls[0].textContent || '').trim().slice(0, 200) : null
    };
  });
  R.runtimeBadges = { runtime: badges };
  note('Runtime badges: ' + JSON.stringify(badges));

  // Now go BACK to builder THEME palette to probe palette tile text directly
  await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(12000);
  // Force palette open on FIELDS tab (default)
  const paletteBadges = await page.evaluate(() => {
    // Palette tiles for widgets
    const tiles = Array.from(document.querySelectorAll(
      '.mf-palette-tile, .mf-widget-tile, .mf-palette-item, [data-mf-widget], [data-mf-palette-widget]'
    ));
    const mapTile = tiles.find(t => {
      const txt = (t.textContent || '').toLowerCase();
      const w = (t.getAttribute('data-mf-widget') || t.getAttribute('data-mf-palette-widget') || '').toLowerCase();
      return txt.includes('map') || w === 'map';
    });
    const phoneTile = tiles.find(t => {
      const txt = (t.textContent || '').toLowerCase();
      const w = (t.getAttribute('data-mf-widget') || t.getAttribute('data-mf-palette-widget') || '').toLowerCase();
      return txt.includes('phone') || w.includes('phone');
    });
    return {
      paletteTileCount: tiles.length,
      mapTileText: mapTile ? (mapTile.textContent || '').trim().slice(0, 120) : null,
      mapTileHasBadge: mapTile ? (mapTile.textContent || '').includes('v20260602') : null,
      phoneTileText: phoneTile ? (phoneTile.textContent || '').trim().slice(0, 120) : null,
      phoneTileHasBadge: phoneTile ? (phoneTile.textContent || '').includes('v20260602') : null,
      allTilesSample: tiles.slice(0, 25).map(t => (t.textContent || '').trim().slice(0, 60))
    };
  });
  R.runtimeBadges.palette = paletteBadges;
  note('Palette badges: ' + JSON.stringify(paletteBadges).slice(0, 400));
  await page.screenshot({ path: 'qa-out/b63-07-palette.png', fullPage: false });
} catch (e) {
  R.runtimeBadges = { error: e.message };
  note('Runtime badges ERROR: ' + e.message);
}

// ---------- AFTER-SUBMIT RUNTIME ----------
try {
  await page.goto('http://dnn10322_megaf.ai/xx?formid=333', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForTimeout(10000);

  // Fill any required fields with sensible test values
  const fillResult = await page.evaluate(() => {
    const filled = [];
    const inputs = Array.from(document.querySelectorAll(
      '.mf-form input:not([type="hidden"]):not([type="submit"]):not([type="button"]), .mf-form textarea, .mf-form select'
    ));
    let counter = 1;
    for (const inp of inputs) {
      const r = inp.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const type = (inp.type || '').toLowerCase();
      const tag = inp.tagName;
      try {
        if (tag === 'SELECT') {
          if (inp.options && inp.options.length > 1) {
            inp.selectedIndex = 1;
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            filled.push({ name: inp.name || inp.id, type: 'select', val: inp.value });
          }
        } else if (type === 'checkbox' || type === 'radio') {
          inp.checked = true;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type, checked: true });
        } else if (type === 'date') {
          inp.value = '2026-06-15';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type: 'date', val: inp.value });
        } else if (type === 'datetime-local') {
          inp.value = '2026-06-15T10:00';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type: 'datetime-local', val: inp.value });
        } else if (type === 'email') {
          inp.value = 'qa-b63@example.com';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type: 'email', val: inp.value });
        } else if (type === 'number') {
          inp.value = '42';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type: 'number', val: inp.value });
        } else if (type === 'tel') {
          inp.value = '0900123456';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type: 'tel', val: inp.value });
        } else if (tag === 'TEXTAREA') {
          inp.value = 'B63 probe test value ' + counter;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type: 'textarea' });
        } else {
          inp.value = 'B63test' + counter;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push({ name: inp.name || inp.id, type: type || 'text', val: inp.value });
        }
        counter++;
      } catch (e) {}
    }
    return { fillCount: filled.length, filled: filled.slice(0, 30) };
  });
  note('Filled fields: ' + JSON.stringify(fillResult).slice(0, 300));
  await page.screenshot({ path: 'qa-out/b63-08-filled.png', fullPage: true });

  // Click submit button
  const submitResult = await page.evaluate(() => {
    const sels = [
      '.mf-submit-btn',
      'button.mf-submit',
      '.mf-form button[type="submit"]',
      '.mf-form input[type="submit"]',
      '[data-mf-action="submit"]',
      '.mf-form button:last-of-type'
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          el.click();
          return { ok: true, sel: s, text: (el.textContent || '').trim().slice(0, 40), cls: (el.className || '').slice(0, 120) };
        }
      }
    }
    // fallback: any button containing "submit", "send", "save"
    const btns = Array.from(document.querySelectorAll('.mf-form button, .mf-form-inner button, .mf-form-wrapper button'));
    for (const b of btns) {
      const t = (b.textContent || '').toLowerCase();
      if (t.includes('submit') || t.includes('send') || t.includes('save') || t.includes('gửi')) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          b.click();
          return { ok: true, sel: 'btn-text-fallback', text: (b.textContent || '').trim().slice(0, 40), cls: (b.className || '').slice(0, 120) };
        }
      }
    }
    return { ok: false };
  });
  note('Submit click: ' + JSON.stringify(submitResult));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'qa-out/b63-09-after-submit.png', fullPage: true });

  // Check for success panel
  const successProbe = await page.evaluate(() => {
    const sels = [
      '.mf-success', '.mf-success-msg', '.mf-success-panel',
      '[class*="mf-success"]', '.success-msg', '.mf-evoq-card',
      '.mf-confirmation', '.mf-thank-you'
    ];
    const found = [];
    for (const s of sels) {
      const els = document.querySelectorAll(s);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0;
        found.push({
          sel: s,
          cls: (el.className || '').slice(0, 140),
          textLen: (el.textContent || '').length,
          textPreview: (el.textContent || '').trim().slice(0, 400),
          width: Math.round(r.width),
          height: Math.round(r.height),
          visible
        });
      }
    }
    // Also look for any node containing common success/thank-you strings
    const all = Array.from(document.querySelectorAll('*'));
    const titleMatches = [];
    const titleRegex = /(thank you|cảm ơn|submitted|success|đã gửi|hoàn tất|confirmation|message received)/i;
    for (const el of all) {
      const t = (el.textContent || '').trim();
      if (t.length > 0 && t.length < 200 && titleRegex.test(t)) {
        // skip if a child also matches (we want the deepest text node)
        const childMatches = Array.from(el.children).some(c => titleRegex.test(c.textContent || ''));
        if (!childMatches) {
          titleMatches.push({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 120),
            text: t.slice(0, 200)
          });
          if (titleMatches.length >= 10) break;
        }
      }
    }
    return {
      panelCount: found.length,
      panels: found,
      titleMatches
    };
  });
  R.afterSubmit = { fillResult, submitResult, successProbe };
  note('Success probe: panels=' + successProbe.panelCount + ' titleMatches=' + successProbe.titleMatches.length);
  if (successProbe.titleMatches.length) note('Title hit: ' + JSON.stringify(successProbe.titleMatches[0]));
} catch (e) {
  R.afterSubmit = { error: e.message };
  note('After-submit ERROR: ' + e.message);
}

R.consoleErrors = consoleErrors.slice(0, 30);
await browser.close();

writeFileSync('qa-out/b63-probe.json', JSON.stringify(R, null, 2));
console.log('\n=========== B63 PROBE RESULTS ===========');
console.log(JSON.stringify(R, null, 2));
