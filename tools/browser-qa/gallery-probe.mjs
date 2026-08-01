// Gallery probe: ask a LIVE site what its Online Gallery actually returns.
//
// usage: node gallery-probe.mjs <outDir> <site> <user> <pass> [hostMap]
//   e.g. node gallery-probe.mjs .\out http://dnn_acme_guide.ai admin dnnhost dnn_acme_guide.ai
//
// Logs in, then calls RemoteGalleryList exactly the way the builder does (same URL, same
// headers, same cookies) and prints what came back: how many templates, and which of the
// expected slugs are missing. The badge in the UI only shows NOT-YET-INSTALLED templates,
// so it cannot answer "did the server drop any" - this can.
//
// [StaleListing v20260801] Reason it exists: GetTemplatesManifestAsync reconciles the
// manifest against a repo listing and silently drops entries the listing cannot see. On
// jsDelivr that listing froze on a six-day-old commit, so seven published templates never
// reached the grid with no error anywhere. Measuring the response is the only way to tell
// that apart from "the template was never published".
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const outDir = path.resolve(process.argv[2] || '.');
const site = (process.argv[3] || '').replace(/\/$/, '');
const user = process.argv[4];
const pass = process.argv[5];
// "-" for a publicly resolvable domain; omitted = pin the site's own host to 127.0.0.1,
// which is what the local QA hosts need.
const hostMapArg = process.argv[6];
const hostMap = hostMapArg === '-' ? null : (hostMapArg || new URL(site).hostname);
// The UI-driving phase clicks through the wizard. Harmless, but noisy on a live site when all
// you want is the checkPath report.
const skipUi = process.env.MF_SKIP_UI === '1';

// The templates this session published or repaired; "missing" here is the finding.
const EXPECT = [
  'holiday-request-travel',
  'dance-competition-registration',
  'volunteer-application-euroyouth',
  'christmas-americana-signup',
  'invoice-dark-application',
  'invoice-minimal-application',
  'invoice-orange-application',
];

fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9384;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpJson(u) { return new Promise((res, rej) => http.get(u, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej)); }

function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': Buffer.from(String(Math.random())).toString('base64'), 'Sec-WebSocket-Version': 13 } });
    req.on('upgrade', (res, socket) => {
      socket.setNoDelay(true);
      const pending = new Map(); let nextId = 1; let buf = Buffer.alloc(0); let frag = null;
      function send(op, payload) { const mask = Buffer.from([5, 6, 7, 8]); let h; if (payload.length < 126) { h = Buffer.alloc(6); h[1] = 0x80 | payload.length; mask.copy(h, 2); } else if (payload.length < 65536) { h = Buffer.alloc(8); h[1] = 0x80 | 126; h.writeUInt16BE(payload.length, 2); mask.copy(h, 4); } else { h = Buffer.alloc(14); h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(payload.length), 2); mask.copy(h, 10); } h[0] = 0x80 | op; const m = Buffer.from(payload); for (let i = 0; i < m.length; i++) m[i] ^= mask[i % 4]; socket.write(Buffer.concat([h, m])); }
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (true) { if (buf.length < 2) break; const fin = (buf[0] & 0x80) !== 0; const op = buf[0] & 0x0f; let len = buf[1] & 0x7f; let off = 2; if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; } if (buf.length < off + len) break; const payload = buf.slice(off, off + len); buf = buf.slice(off + len); if (op === 0x1 || op === 0x0) { frag = (op === 0x1) ? payload : Buffer.concat([frag || Buffer.alloc(0), payload]); if (fin) { try { const msg = JSON.parse(frag.toString('utf8')); frag = null; if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } } catch { frag = null; } } } else if (op === 0x9) send(0x0a, payload); }
      });
      resolve({ call: (m, p) => new Promise((rs, rj) => { const id = nextId++; pending.set(id, { res: rs, rej: rj }); send(0x1, Buffer.from(JSON.stringify({ id, method: m, params: p || {} }), 'utf8')); }), close: () => { try { socket.destroy(); } catch { } } });
    });
    req.on('error', reject); req.end();
  });
}

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(outDir, '.p')}`, '--window-size=1440,1000', '--hide-scrollbars',
    // QA hosts live only in the Windows hosts file; DoH would NXDOMAIN them.
    ...(hostMap ? [`--host-resolver-rules=MAP ${hostMap} 127.0.0.1`] : []), '--disable-features=DnsOverHttps',
    'about:blank'], { stdio: 'ignore' });
  try {
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    // awaitPromise MUST be true: Runtime.evaluate resolves the Promise OBJECT otherwise,
    // and every async probe comes back empty with no error at all.
    const ev = async (e) => (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

    // --- login ---
    await cdp.call('Page.navigate', { url: site + '/Login' });
    await sleep(6000);
    for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('input[id$=\"txtUsername\"]')")) break; await sleep(500); }
    console.log('login:', await ev(`(() => {
      const u = document.querySelector('input[id$="txtUsername"]');
      const p = document.querySelector('input[id$="txtPassword"]');
      if (!u || !p) return 'no-fields';
      u.value = ${JSON.stringify(user)}; u.dispatchEvent(new Event('change', {bubbles:true}));
      p.value = ${JSON.stringify(pass)}; p.dispatchEvent(new Event('change', {bubbles:true}));
      const b = document.querySelector('[id$="cmdLogin"]'); if (!b) return 'no-button';
      b.click(); return 'clicked';
    })()`));
    await sleep(9000);
    console.log('session:', await ev("document.body.innerHTML.indexOf('/ctl/Logoff') >= 0 ? 'authenticated' : 'ANONYMOUS'"));

    // --- land on the page that hosts the MegaForm dashboard ---
    await cdp.call('Page.navigate', { url: site + '/' });
    await sleep(5000);
    for (let i = 0; i < 40; i++) { if (await ev("document.readyState==='complete'")) break; await sleep(400); }

    // What the page itself resolved - the client builds the URL from this, and guessing
    // it wrong is how the first run of this probe got an IIS 404 instead of the catalog.
    const cfg = await ev(`(() => {
      const w = window;
      const pick = (o) => { try { return o ? JSON.stringify(o).slice(0, 300) : null; } catch (e) { return 'unserialisable'; } };
      return { apiBaseOverride: w.__MF_API_BASE__ || null,
               platform: pick(w.__MF_PLATFORM__),
               hostCfg: pick(w.__MF_HOST_CONFIG__ || w.__MF_HOST__ || null) };
    })()`);
    console.log('\n=== config trang tu khai ===');
    console.log(' ', JSON.stringify(cfg));

    // --- ask the server, exactly as remote-gallery.ts does ---
    const res = await ev(`(async () => {
      let token = '';
      try {
        const sf = window.jQuery && window.jQuery.ServicesFramework && window.jQuery.ServicesFramework(0);
        if (sf) token = sf.getAntiForgeryValue();
      } catch (e) { /* fall through to the hidden input */ }
      if (!token) {
        const el = document.querySelector('input[name="__RequestVerificationToken"]');
        if (el) token = el.value;
      }
      const hd = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
      if (token) hd['RequestVerificationToken'] = token;
      // The DNN catch-all route is {controller}/{action}, but the client calls apiUrl()
      // with the bare action name - so try both shapes rather than assume either.
      const bases = ['/DesktopModules/MegaForm/API'];
      const paths = [];
      for (const b of bases) { paths.push(b + '/BuilderTemplates/RemoteGalleryList'); paths.push(b + '/RemoteGalleryList'); }
      const tried = [];
      for (const url of paths) {
        try {
          const r = await fetch(url, { method: 'GET', credentials: 'same-origin', headers: hd });
          const text = await r.text();
          let j = null; try { j = JSON.parse(text); } catch (e) { /* html error page */ }
          tried.push({ url: url, status: r.status, json: !!j });
          if (r.ok && j && Array.isArray(j.templates)) {
            return { url: url, tried: tried, status: r.status, hadToken: !!token,
                     trial: !!j.trial, offline: !!j.offline,
                     count: j.templates.length,
                     installed: j.templates.filter(function (x) { return x.installed; }).length,
                     notInstalled: j.templates.filter(function (x) { return !x.installed; }).map(function (x) { return x.slug; }),
                     slugs: j.templates.map(function (x) { return x.slug; }) };
          }
        } catch (e) { tried.push({ url: url, status: 'threw', err: String(e).slice(0, 80) }); }
      }
      return { tried: tried, hadToken: !!token, count: null, slugs: [] };
    })()`);
    console.log('\n=== URL da thu ===');
    (res && res.tried ? res.tried : []).forEach((t) => console.log('  ' + t.status + '  ' + t.url));

    console.log('\n=== RemoteGalleryList ===');
    console.log('  HTTP        :', res && res.status, '| antiforgery token:', res && res.hadToken);
    if (res && res.raw) console.log('  body        :', res.raw);
    console.log('  templates   :', res && res.count);
    console.log('  da cai      :', res && res.installed, '=> con lai de cai:', (res && res.count != null) ? res.count - res.installed : null);
    console.log('  trial       :', res && res.trial, '| offline:', res && res.offline);
    if (res && res.notInstalled && res.notInstalled.length) {
      console.log('\n=== chua cai (' + res.notInstalled.length + ') ===');
      res.notInstalled.forEach((s) => console.log('  -', s));
    }

    if (res && Array.isArray(res.slugs) && res.slugs.length) {
      const have = new Set(res.slugs);
      console.log('\n=== 7 template dang nghi bi an ===');
      for (const s of EXPECT) console.log('  ' + (have.has(s) ? 'CO   ' : 'THIEU') + '  ' + s);
      fs.writeFileSync(path.join(outDir, 'gallery-slugs.json'), JSON.stringify(res.slugs, null, 2));
    }

    const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, 'dashboard.png'), Buffer.from(shot.data, 'base64'));
    console.log('\nscreenshot:', path.join(outDir, 'dashboard.png'));

    // --- and the same answer as a human sees it ---
    // The API count above is the server's answer; this is the grid the owner looks at.
    // Both are reported because they measure different things: the badge counts only
    // NOT-YET-INSTALLED templates, so it can disagree with the catalog size and still be right.
    // On failure this reports the labels it DID see - guessing a selector twice costs more
    // than printing the DOM once.
    const clickText = (sel, text) => `(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(sel)}));
      const el = els.find((e) => (e.textContent || '').toLowerCase().indexOf(${JSON.stringify(text)}.toLowerCase()) >= 0);
      if (el) { el.click(); return 'clicked'; }
      const seen = els.map((e) => (e.textContent || '').replace(/\\s+/g, ' ').trim())
                      .filter((s) => s && s.length < 40);
      return 'not-found | nhan thay: ' + JSON.stringify(seen.slice(0, 25));
    })()`;

    // [PersonaBarIframe] The MegaForm panel renders inside an iframe that covers the page,
    // so evaluating against the top document finds only the DNN skin. Walk the frame tree
    // and drive whichever frame actually owns the MegaForm UI.
    async function frameContexts() {
      const tree = await cdp.call('Page.getFrameTree');
      const ids = [];
      (function walk(n) { ids.push(n.frame.id); (n.childFrames || []).forEach(walk); })(tree.frameTree);
      const ctx = [];
      for (const frameId of ids) {
        try {
          const w = await cdp.call('Page.createIsolatedWorld', { frameId, worldName: 'mfprobe' });
          ctx.push({ frameId, contextId: w.executionContextId });
        } catch { /* frame gone */ }
      }
      return ctx;
    }
    // Same evaluate, but pinned to one frame's world.
    const evIn = async (contextId, e) =>
      (await cdp.call('Runtime.evaluate', { expression: e, contextId, returnByValue: true, awaitPromise: true })).result?.value;

    // No frame-sniffing heuristic: every guess at "which frame owns MegaForm" was either too
    // strict (missed the panel after it navigated) or too loose (matched the DNN skin in the
    // top document). Just attempt the action in every frame and keep the one that worked.
    async function inMegaFormFrame(expr) {
      let last = 'no-frame';
      for (const c of await frameContexts()) {
        const v = await evIn(c.contextId, expr);
        if (typeof v === 'string' && v.indexOf('not-found') === 0) { last = v; continue; }
        if (v === null || v === undefined) continue;
        return { ctx: c.contextId, value: v };
      }
      return { ctx: null, value: last };
    }

    if (skipUi) console.log('\n=== lai UI: BO QUA (MF_SKIP_UI=1) ===');
    if (!skipUi) {
    console.log('\n=== lai UI ===');
    // Drive the SAME url the owner uses. The Persona Bar panel is a different surface
    // (its own iframe, its own template picker) and does not host the wizard gallery.
    await cdp.call('Page.navigate', { url: site + '/#mf-dashboard' });
    await sleep(9000);
    const ctxs = await frameContexts();
    console.log('  frames        :', ctxs.length);
    for (const c of ctxs) {
      const labels = await evIn(c.contextId, `(() => Array.from(document.querySelectorAll('button,a,[role="button"],[class*="entry"]'))
        .map((e) => (e.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter((s) => s && s.length < 40).slice(0, 30))()`);
      console.log('   frame', c.frameId.slice(0, 8), '->', JSON.stringify(labels));
    }
    let r = await inMegaFormFrame(clickText('button,a,[role="button"]', 'new form'));
    console.log('  New form      :', r.value);
    await sleep(4000);
    // Two screens can follow "New form": the wizard (whose Setup step carries a Template
    // Gallery entry) or the template picker. Try the gallery entry FIRST - taking
    // Start Blank -> Use This Template first lands in the builder, where it no longer exists,
    // which is exactly how this probe missed the modal on the production site.
    const galleryBtn = () => inMegaFormFrame(clickText('button,a,[role="button"],[class*="entry"]', 'template gallery'));
    r = await galleryBtn();
    if (typeof r.value === 'string' && r.value.indexOf('not-found') === 0) {
      r = await inMegaFormFrame(clickText('button,a,[role="button"],div[class*="blank"]', 'start blank'));
      console.log('  Start Blank   :', r.value);
      await sleep(2500);
      // Start Blank only SELECTS the card; the footer button is what enters the wizard.
      r = await inMegaFormFrame(clickText('button,a,[role="button"]', 'use this template'));
      console.log('  Use Template  :', r.value);
      await sleep(4500);
      r = await galleryBtn();
    }
    console.log('  Template Gall.:', r.value);
    await sleep(3500);
    r = await inMegaFormFrame(clickText('.mfwg-source', 'online'));
    console.log('  Online gallery:', r.value);
    await sleep(7000);

    const ui = (await inMegaFormFrame(`(() => {
      const hint = document.querySelector('.mfwg-hint');
      return { badge: hint ? hint.textContent.trim() : null,
               cards: document.querySelectorAll('.mfwg-card').length };
    })()`)).value;
    console.log('  badge tren UI :', ui && ui.badge);
    console.log('  the dang hien :', ui && ui.cards);

    const shot2 = await cdp.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, 'gallery.png'), Buffer.from(shot2.data, 'base64'));
    console.log('  screenshot    :', path.join(outDir, 'gallery.png'));
    }

    // Optional 7th arg: a path to open with the logged-in session and report on. Fetched
    // rather than navigated - a DNN module control URL renders fine but headless navigation
    // to it kept landing on chrome-error, and the HTML is what the question is about.
    const checkPath = process.argv[7];
    if (checkPath) {
      const page = await ev(`(async () => {
        const r = await fetch(${JSON.stringify(checkPath)}, { credentials: 'same-origin' });
        const html = await r.text();
        const has = (s) => html.indexOf(s) >= 0;
        // A 200 is not success: ASP.NET serves runtime compile errors with 200 inside the
        // module's own container, so "no empty state" can mean "an exception instead".
        const err = html.match(/(CS\\d{4}|Compilation Error|Parser Error)[^<]{0,200}/);
        return { status: r.status, url: r.url, bytes: html.length,
                 emptyState: has('No form has been configured'),
                 dashboard:  has('mf-dash-title') || has('Manage and track all your forms'),
                 compileError: err ? err[0].replace(/\\s+/g, ' ').trim() : null,
                 loginPage:  has('txtUsername') || has('dnn_ctr_Login') };
      })()`);
      console.log('\n=== kiem tra', checkPath, '===');
      console.log('  HTTP          :', page && page.status, '| bytes:', page && page.bytes);
      console.log('  ve trang login:', page && page.loginPage);
      console.log('  "No form has been configured" :', page && page.emptyState);
      console.log('  co dashboard  :', page && page.dashboard);
      console.log('  LOI BIEN DICH :', page && page.compileError);

      await cdp.call('Page.navigate', { url: site + checkPath });
      await sleep(7000);
      // The UI phase above leaves the Persona Bar panel open, and it covers the page we
      // came here to look at. Escape closes it.
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(1500);
      console.log('  href sau nav  :', await ev('location.href'));
      const shot3 = await cdp.call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, 'checked.png'), Buffer.from(shot3.data, 'base64'));
      console.log('  screenshot    :', path.join(outDir, 'checked.png'));
    }
    cdp.close();
  } finally {
    try { chrome.kill(); } catch { /* already gone */ }
  }
}
main().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
