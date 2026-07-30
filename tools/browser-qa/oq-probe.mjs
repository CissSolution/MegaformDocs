// Probe an Oqtane site for MegaForm Blogs render state, as host AND as anonymous.
// Answers the only question that matters when a module renders nothing: is it a permission
// problem, a load problem, or a throw inside the component?
//
// usage: node oq-probe.mjs <baseUrl> <user> <pass> [extraPath ...]
//   e.g. node oq-probe.mjs http://localhost:5131 host 'Oqtane@5131' "/?view=editorial"
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const [baseUrl, user, pass, ...extra] = process.argv.slice(2);
const OUT = path.resolve('./oq');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9391;
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

// PROBE_FIND=<text> reports whether the rendered page contains that text anywhere — handy for
// "did this record reach this surface at all?" without knowing the surface's markup.
const FIND = process.env.PROBE_FIND || '';

const PROBE = `(() => {
  const q = (s) => document.querySelector(s);
  const findText = ${JSON.stringify(FIND)};
  const main = q('main.mfb') || q('.mfb');
  const wrapper = main ? main.className : null;
  return JSON.stringify({
    url: location.href,
    title: document.title,
    hasPublic: !!q('.mfb'),
    hasConsole: !!q('.mfba'),
    wrapperClass: wrapper,
    hasFilterbar: !!q('.mfb-filterbar'),
    hasPager: !!q('.mfb-pager'),
    cardCount: document.querySelectorAll('.mfb-card').length,
    heroTitle: (q('.mfb-hero h1') || {}).textContent || null,
    sectionHeading: (q('.mfb-section-head h2') || {}).textContent || null,
    stateText: Array.from(document.querySelectorAll('.mfb-state, .mfba-note')).map(e => (e.innerText||'').trim().slice(0,160)),
    articleTitle: (q('.mfb-article-head h1') || {}).textContent || null,
    pagerPages: Array.from(document.querySelectorAll('.mfb-pager-pages > *')).map(e=>(e.textContent||'').trim()),
    pagerOf: (q('.mfb-pager-of') || {}).textContent || null,
    consoleTabs: Array.from(document.querySelectorAll('.mfba-head-actions a')).map(a=>({t:(a.textContent||'').trim(),h:a.getAttribute('href')})),
    settingsView: (q('#mfb-view') || {}).value || null,
    settingsOptions: document.querySelectorAll('#mfb-view option').length,
    newFormFields: document.querySelectorAll('.mfba-fld').length,
    newFormLabels: Array.from(document.querySelectorAll('.mfba-fld > label')).map(l=>(l.textContent||'').trim()).slice(0,30),
    blogCssHref: Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(l=>l.getAttribute('href')).filter(h=>h && h.indexOf('megaform-blogs')>=0),
    paneModules: Array.from(document.querySelectorAll('[id^=app-module-]')).map(e=>e.id),
    bodyHasBlogWord: (document.body.innerText||'').indexOf('MegaForm Blogs') >= 0,
    found: findText ? ((document.body.innerText||'').indexOf(findText) >= 0) : null,
    // Windowed/fullscreen surface state + whether Oqtane put us in its admin modal.
    surfaceClass: (q('.mf-oq-surface') || {}).className || null,
    hasFsToggle: !!q('body > .mf-fs-toggle'),
    fsToggleLabel: ((q('body > .mf-fs-toggle') || {}).innerText || '').trim() || null,
    inAdminModal: !!(q('.mfba') && q('.mfba').closest('.app-admin-modal')),
    adminModalPresent: !!q('.app-admin-modal'),
    adminCssLoaded: Array.from(document.querySelectorAll('link[rel=stylesheet]'))
      .some(l => (l.getAttribute('href')||'').indexOf('megaform-blogs-admin.css') >= 0),
    // Ancestor chain of the console/public root, with position+z-index. This is how you find
    // out WHO is putting a module control inside a modal.
    ancestors: (() => {
      const el = q('.mfba') || q('.mfb');
      if (!el) return null;
      const chain = [];
      let n = el;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        chain.push({
          tag: n.tagName.toLowerCase(),
          id: n.id || null,
          cls: (typeof n.className === 'string' ? n.className : '').slice(0, 90) || null,
          pos: cs.position,
          z: cs.zIndex,
          disp: cs.display,
          role: n.getAttribute && n.getAttribute('role')
        });
        n = n.parentElement;
      }
      return chain;
    })(),
    foundInColumn: (() => {
      if (!findText) return null;
      const cols = Array.from(document.querySelectorAll('.mfba [class*="col"]'));
      for (let i = 0; i < cols.length; i++) {
        const txt = cols[i].innerText || '';
        if (txt.indexOf(findText) >= 0) return { i, head: txt.split('\\n').slice(0, 2).join(' / ') };
      }
      return 'not-in-any-column';
    })()
  });
})()`;

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(OUT, '.probe')}`, '--window-size=1440,1000', '--hide-scrollbars',
    '--disable-features=DnsOverHttps', 'about:blank'], { stdio: 'ignore' });
  try {
    let t = null; for (let i = 0; i < 80 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    const ev = async (e, awaitPromise = false) =>
      (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise })).result?.value;
    // Drive navigation through location.href rather than Page.navigate: after Blazor's
    // enhanced navigation the original CDP page target no longer accepts Page.navigate and
    // answers "Cannot navigate to invalid URL" for perfectly valid URLs.
    const goto = async (url, waitMs = 6000) => {
      await ev(`location.href = ${JSON.stringify(url)}`);
      await sleep(waitMs);
      for (let i = 0; i < 60; i++) { if (await ev("document.readyState==='complete'")) break; await sleep(500); }
      await sleep(1500);
    };

    // ---- anonymous first, before any cookie exists -------------------------------------
    await goto(baseUrl + '/', 8000);
    console.log('ANON  /            ', await ev(PROBE));

    // ---- log in as host ----------------------------------------------------------------
    await goto(baseUrl + '/login', 9000);
    let already = await ev("document.body.innerText.indexOf('Logout') >= 0");
    if (!already) {
      for (let i = 0; i < 60; i++) { if (await ev("!!document.querySelector('input[type=password]')")) break; await sleep(1000); }
      await ev(`(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const p = inputs.find(i => i.type === 'password'); if (!p) return 'no-pw';
        const u = inputs.slice(0, inputs.indexOf(p)).reverse().find(i => i.type === 'text' || i.type === '' || !i.type);
        const set = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.blur(); };
        set(u, ${JSON.stringify(user)}); set(p, ${JSON.stringify(pass)}); return 'filled';
      })()`);
      await sleep(1200);
      await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => /^\\s*login\\s*$/i.test(b.textContent||'')); if (b) { b.click(); return 'clicked'; } return 'no-btn'; })()`);
      for (let i = 0; i < 40; i++) { already = await ev("document.body.innerText.indexOf('Logout') >= 0"); if (already) break; await sleep(1000); }
    }
    console.log('authenticated:', already);

    // ---- what does the host see? -------------------------------------------------------
    await goto(baseUrl + '/', 8000);
    console.log('HOST  /            ', await ev(PROBE));

    // Is the module definition actually live in this process?
    const defs = await ev(`fetch('/api/moduledefinition?siteid=1',{headers:{'X-OQTANE-SITEID':'1'}})
      .then(r=>r.json())
      .then(d=>JSON.stringify(d.filter(x=>(x.moduleDefinitionName||'').indexOf('Blogs')>=0)
        .map(x=>({name:x.name,ver:x.version,settingsType:x.settingsType,runtimes:x.runtimes,assemblyName:x.assemblyName}))))
      .catch(e=>'ERR '+e)`, true);
    console.log('LIVE moduledefinition:', defs);

    // What does PageState think is on the home page?
    const mods = await ev(`fetch('/api/module?siteid=1',{headers:{'X-OQTANE-SITEID':'1'}})
      .then(r=>r.json())
      .then(d=>JSON.stringify(d.filter(m=>m.pageId===31).map(m=>({moduleId:m.moduleId,title:m.title,pane:m.pane,def:m.moduleDefinitionName,hasDef:!!m.moduleDefinition}))))
      .catch(e=>'ERR '+e)`, true);
    console.log('page 31 modules:', mods);

    for (const p of extra) {
      // settings=<view>|<pageSize>  drives the real Settings pane and clicks Oqtane's Save,
      // so the round-trip through ISettingsControl.UpdateSettings is what gets tested.
      if (p.startsWith('settings=')) {
        const [view, pageSize] = p.slice('settings='.length).split('|');
        await goto(baseUrl + '/*/37/Settings', 9000);
        for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('#mfb-view')")) break; await sleep(700); }
        const set = await ev(`(() => {
          const sel = document.querySelector('#mfb-view');
          if (!sel) return 'no-select';
          sel.value = ${JSON.stringify(view)};
          sel.dispatchEvent(new Event('change', {bubbles:true}));
          const ps = document.querySelector('#mfb-pagesize');
          if (ps && ${JSON.stringify(pageSize || '')}) {
            ps.value = ${JSON.stringify(pageSize || '')};
            ps.dispatchEvent(new Event('change', {bubbles:true}));
          }
          return 'set:' + sel.value + '/ps=' + (ps ? ps.value : 'n/a');
        })()`);
        await sleep(1500);
        const saved = await ev(`(() => {
          const btn = Array.from(document.querySelectorAll('button,a')).find(b => /^\\s*save\\s*$/i.test(b.textContent||''));
          if (!btn) return 'no-save-button';
          btn.click(); return 'saved';
        })()`);
        await sleep(6000);
        console.log('SETTINGS', p, '->', set, saved);
        continue;
      }
      // contrast=<url>  reports computed colour vs the nearest painted background for the text
      // that matters, with a WCAG ratio. Inherited colour loses to ANY matching rule, so a host
      // theme's bare `h1 { color: … }` beats a module's inherited ink - this is how a light
      // console ends up with invisible headings.
      if (p.startsWith('contrast=')) {
        const url = p.slice('contrast='.length);
        await goto(url, 9000);
        const r = await ev(`(() => {
          const sels = ['.mfba-head-row h1', '.mfba-head-row p', '.mfba-kcol-head h3',
                        '.mfba-kcard h4', '.mfba-kcard .mfba-ktag', '.mfba-kmeta',
                        '.mfba-panel-head h2', '.mfba-fld > label', '.mfba-stat-val',
                        '.mfb-hero h1', '.mfb-card-body h3', '.mfb-card-body p'];
          const lum = (c) => {
            const m = c.match(/[\\d.]+/g); if (!m) return null;
            const f = m.slice(0,3).map(Number).map(v => { v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); });
            return .2126*f[0] + .7152*f[1] + .0722*f[2];
          };
          const bgOf = (el) => {
            let n = el;
            while (n && n !== document.documentElement) {
              const bg = getComputedStyle(n).backgroundColor;
              const m = bg.match(/[\\d.]+/g);
              if (m && (m.length < 4 || Number(m[3]) > 0.05)) return bg;
              n = n.parentElement;
            }
            return 'rgb(255,255,255)';
          };
          const out = [];
          sels.forEach((s) => {
            const el = document.querySelector(s);
            if (!el) return;
            const cs = getComputedStyle(el);
            const fg = cs.color, bg = bgOf(el);
            const l1 = lum(fg), l2 = lum(bg);
            let ratio = null;
            if (l1 !== null && l2 !== null) {
              const hi = Math.max(l1,l2), lo = Math.min(l1,l2);
              ratio = Math.round(((hi + .05) / (lo + .05)) * 100) / 100;
            }
            out.push({ sel: s, fg: fg, bg: bg, ratio: ratio, fail: ratio !== null && ratio < 4.5 });
          });
          return JSON.stringify(out);
        })()`);
        console.log('CONTRAST', url, r);
        continue;
      }
      // shots=<name>:<url>  captures PNGs at the widths that matter. Overflow numbers do not tell
      // you a layout is UGLY - squeezed columns, a sidebar that should have dropped, a sliced
      // board - so look at it.
      if (p.startsWith('shots=')) {
        const rest = p.slice('shots='.length);
        const cut = rest.indexOf(':http');
        const name = rest.slice(0, cut);
        const url = rest.slice(cut + 1);
        const widths = [1310, 1024, 768, 390];
        await goto(url, 9000);
        for (const w of widths) {
          await cdp.call('Emulation.setDeviceMetricsOverride',
            { width: w, height: 1000, deviceScaleFactor: 1, mobile: w <= 480 });
          await sleep(1600);
          const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          const file = path.join(OUT, `${name}-${w}.png`);
          fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
          console.log('SHOT    ', file);
        }
        await cdp.call('Emulation.clearDeviceMetricsOverride');
        continue;
      }
      // resp=<url>  responsive audit: renders the page at several widths and reports what
      // overflows. "Overflow" here means an element whose right edge is past the viewport, or a
      // clipped (non-scrollable) box wider than its own content box — i.e. content the user
      // cannot reach. Elements that opt into overflow-x:auto/scroll are reported separately as
      // intentional, because a horizontally scrolled kanban is a design, not a bug.
      if (p.startsWith('resp=')) {
        const target = p.slice('resp='.length);
        const widths = [1440, 1280, 1024, 820, 768, 480, 390];
        await goto(/^https?:\/\//i.test(target) ? target : baseUrl + target, 9000);
        for (const w of widths) {
          await cdp.call('Emulation.setDeviceMetricsOverride',
            { width: w, height: 900, deviceScaleFactor: 1, mobile: w <= 480 });
          await sleep(1400);
          const r = await ev(`(() => {
            const vw = window.innerWidth;
            const doc = document.documentElement;
            const bad = [], scrollers = [];
            const seen = new Set();
            document.querySelectorAll('.mfb *, .mfba *, .mfb, .mfba').forEach((el) => {
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden') return;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return;
              const key = el.tagName + '.' + (typeof el.className === 'string' ? el.className : '');
              const scrollable = /(auto|scroll)/.test(cs.overflowX);
              if (scrollable && el.scrollWidth > el.clientWidth + 2) {
                if (!seen.has('S' + key)) { seen.add('S' + key); scrollers.push(key.slice(0, 70)); }
                return;
              }
              // clipped content the user cannot reach
              if (!scrollable && el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'hidden') {
                if (!seen.has('C' + key)) { seen.add('C' + key); bad.push('CLIPPED ' + key.slice(0, 62)); }
                return;
              }
              // sticking out past the viewport
              if (rect.right > vw + 1 && rect.width <= vw * 3) {
                if (!seen.has('O' + key)) {
                  seen.add('O' + key);
                  bad.push('PAST-VIEWPORT +' + Math.round(rect.right - vw) + 'px ' + key.slice(0, 52));
                }
              }
            });
            return JSON.stringify({
              vw: vw,
              docScroll: doc.scrollWidth - doc.clientWidth,
              bodyScroll: document.body.scrollWidth - vw,
              offenders: bad.slice(0, 12),
              intentionalScrollers: scrollers.slice(0, 6)
            });
          })()`);
          console.log('RESP ' + String(w).padStart(5) + 'px ', r);
        }
        await cdp.call('Emulation.clearDeviceMetricsOverride');
        continue;
      }
      // fs=<path>  loads a console page and CLICKS the windowed/fullscreen toggle, reporting the
      // surface state before/after and whether host chrome was made inert. Verifying the mode
      // control by clicking it is the point; reading the CSS proves nothing.
      if (p.startsWith('fs=')) {
        const target = p.slice('fs='.length);
        await goto(/^https?:\/\//i.test(target) ? target : baseUrl + target, 9000);
        for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('body > .mf-fs-toggle')")) break; await sleep(700); }
        const report = await ev(`(() => {
          const surf = () => document.querySelector('.mf-oq-surface');
          const btn = document.querySelector('body > .mf-fs-toggle');
          if (!btn) return JSON.stringify({ error: 'no-toggle' });
          const snap = (tag) => {
            const s = surf();
            const cs = s ? getComputedStyle(s) : null;
            return { tag, cls: s ? s.className : null, pos: cs ? cs.position : null,
                     z: cs ? cs.zIndex : null, label: (btn.innerText||'').trim(),
                     inerted: document.querySelectorAll('[data-mf-inerted="1"]').length };
          };
          const before = snap('before');
          btn.click();
          const after = snap('afterClick');
          btn.click();
          const back = snap('afterSecondClick');
          return JSON.stringify({ before, after, back });
        })()`);
        console.log('FS      ', target, report);
        continue;
      }
      // create-post=<title>|<category>|<status>  authors a real post through the console's
      // New-post screen, i.e. through Submissions.SubmitAsync, and reports what came back.
      if (p.startsWith('create-post=')) {
        const [title, category, status] = p.slice('create-post='.length).split('|');
        await goto(baseUrl + '/*/37/Edit?view=new', 10000);
        for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('#mfb-new-title')")) break; await sleep(700); }
        const filled = await ev(`(() => {
          const set = (id, v) => {
            const el = document.querySelector(id);
            if (!el) return id + ':missing';
            el.focus(); el.value = v;
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.blur();
            return id + ':ok';
          };
          const r = [];
          r.push(set('#mfb-new-title', ${JSON.stringify(title)}));
          r.push(set('#mfb-new-excerpt', 'Verification article created through the MegaForm Blogs console.'));
          r.push(set('#mfb-new-body', '<p>This article was authored through the new create-post screen, which writes through Submissions.SubmitAsync.</p><p>It exists to prove the create path works end to end.</p>'));
          r.push(set('#mfb-new-category', ${JSON.stringify(category)}));
          r.push(set('#mfb-new-status', ${JSON.stringify(status)}));
          return r.join(' ');
        })()`);
        await sleep(2000);
        const before = await ev(`(() => {
          const g = (id) => (document.querySelector(id)||{}).value || '';
          return JSON.stringify({slug:g('#mfb-new-slug'), catUid:g('#mfb-new-category_uid'),
            date:g('#mfb-new-publish_date'), author:g('#mfb-new-author_name'),
            email:g('#mfb-new-author_email'), ct:g('#mfb-new-content_type'), st:g('#mfb-new-status')});
        })()`);
        const clicked = await ev(`(() => {
          const b = Array.from(document.querySelectorAll('button')).find(b => /^\\s*Create /i.test(b.textContent||''));
          if (!b) return 'no-create-button';
          b.click(); return 'clicked';
        })()`);
        await sleep(9000);
        const result = await ev(`(() => {
          const ok = document.querySelector('.mfba-note-ok');
          const err = document.querySelector('.mfba-note-error');
          const fieldErrs = Array.from(document.querySelectorAll('.mfba-err')).map(e=>(e.textContent||'').trim());
          return JSON.stringify({ok: ok ? ok.innerText.trim().slice(0,220) : null,
                                 err: err ? err.innerText.trim().slice(0,220) : null, fieldErrs});
        })()`);
        console.log('CREATE   fill:', filled);
        console.log('CREATE   prefilled:', before);
        console.log('CREATE   click:', clicked, '=>', result);
        continue;
      }
      // Accept an absolute URL as well as a path. Git Bash rewrites a bare "/new-admin"
      // argument into "C:/Program Files/Git/new-admin" (MSYS path conversion), so passing the
      // full http:// URL is the reliable way to reach a root-level page from a shell.
      const target = /^https?:\/\//i.test(p) ? p : baseUrl + p;
      await goto(target, 8000);
      console.log('HOST ', p.padEnd(18), await ev(PROBE));
    }
    cdp.close();
  } finally {
    // Kill Chrome only after the CDP socket is closed, otherwise node raises an unhandled
    // ECONNRESET on the dangling websocket and the run "fails" after doing all its work.
    try { chrome.kill(); } catch { }
    await sleep(300);
  }
}
process.on('uncaughtException', (e) => {
  if (e && e.code === 'ECONNRESET') return;   // browser went away after we were done
  console.error('FAILED', e); process.exit(1);
});
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED', e); process.exit(1); });
