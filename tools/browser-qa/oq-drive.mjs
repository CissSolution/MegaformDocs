// Drive an Oqtane site through CDP: log in as host, then run fetches from page context
// (so cookies + antiforgery behave exactly as they do for the app itself).
// usage: node oq-drive.mjs <baseUrl> <user> <pass> <step> [arg]
//   steps: login | blog-setup | forms | shot=<name>:<path>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const [baseUrl, user, pass, ...steps] = process.argv.slice(2);
// Relative to THIS script, not the shell's cwd: `./oq` meant the driver dropped screenshots
// wherever it happened to be invoked from, which littered the repo root the first time it was
// run from there instead of writing next to the other QA output.
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'oq');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9390;
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
    `--user-data-dir=${path.join(OUT, '.p')}`, '--window-size=1440,1000', '--hide-scrollbars',
    '--disable-features=DnsOverHttps', 'about:blank'], { stdio: 'ignore' });
  try {
    let t = null; for (let i = 0; i < 80 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    const ev = async (e, awaitPromise = false) =>
      (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise })).result?.value;

    const goto = async (url, waitMs = 6000) => {
      await cdp.call('Page.navigate', { url });
      await sleep(waitMs);
      for (let i = 0; i < 60; i++) { if (await ev("document.readyState==='complete'")) break; await sleep(500); }
      await sleep(1500);
    };

    // ── login ────────────────────────────────────────────────────────────
    await goto(baseUrl + '/login', 9000);
    let already = await ev("document.body.innerText.indexOf('Logout') >= 0");
    if (!already) {
      // Blazor renders the login form only once the interactive circuit is up, so poll for
      // the password box instead of guessing a delay.
      let ready = false;
      for (let i = 0; i < 60; i++) {
        ready = await ev("!!document.querySelector('input[type=password]')");
        if (ready) break;
        await sleep(1000);
      }
      console.log('login form ready:', ready);

      const filled = await ev(`(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const p = inputs.find(i => i.type === 'password');
        if (!p) return 'no-password-field';
        // the username box is the text input immediately before the password one
        const idx = inputs.indexOf(p);
        const u = inputs.slice(0, idx).reverse().find(i => i.type === 'text' || i.type === '' || !i.type);
        if (!u) return 'no-username-field';
        const set = (el, v) => {
          el.focus();
          el.value = v;
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
          el.blur();
        };
        set(u, ${JSON.stringify(user)});
        set(p, ${JSON.stringify(pass)});
        return 'filled:' + u.placeholder + '/' + p.placeholder;
      })()`);
      console.log('login fill:', filled);
      await sleep(1200);

      const clicked = await ev(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /^\\s*login\\s*$/i.test(b.textContent||''));
        if (!btn) return 'no-button';
        btn.click();
        return 'clicked';
      })()`);
      console.log('login click:', clicked);

      for (let i = 0; i < 40; i++) {
        already = await ev("document.body.innerText.indexOf('Logout') >= 0");
        if (already) break;
        await sleep(1000);
      }
    }
    console.log('authenticated:', already);
    if (!already) {
      const msg = await ev("(document.querySelector('.alert,.mud-alert,[role=alert]')||{}).innerText||''");
      console.log('login message:', JSON.stringify(msg).slice(0, 300));
    }

    // ── steps ────────────────────────────────────────────────────────────
    for (const step of steps) {
      if (step === 'forms') {
        const r = await ev(`fetch('/api/MegaForm/Form/List?siteId=1',{headers:{'X-OQTANE-SITEID':'1'}})
          .then(r=>r.text()).then(t=>'HTTP-OK '+t.slice(0,900)).catch(e=>'ERR '+e)`, true);
        console.log('forms:', r);
      } else if (step === 'blog-setup') {
        const r = await ev(`(async () => {
          const res = await fetch('/api/MegaForm/Starter/Blog/Setup?siteId=1', {
            method:'POST',
            headers:{'Content-Type':'application/json','X-OQTANE-SITEID':'1'},
            body:'{}'
          });
          const t = await res.text();
          return res.status + ' :: ' + t.slice(0,1500);
        })()`, true);
        console.log('blog-setup:', r);
      } else if (step.startsWith('add-to-page=')) {
        // Adding a module to an EXISTING page avoids Oqtane 10's page-create payload, which
        // answers 200 with an empty body for reasons it will not disclose.
        const targetPath = step.slice('add-to-page='.length);
        const r = await ev(`(async () => {
          const H = {'Content-Type':'application/json','X-OQTANE-SITEID':'1'};
          const pages = await (await fetch('/api/page?siteid=1',{headers:H})).json();
          const page = pages.find(p => (p.path||'') === ${JSON.stringify(targetPath)});
          if (!page) return 'page-not-found: ' + ${JSON.stringify(targetPath)};

          const site = await (await fetch('/api/site/1',{headers:H})).json();
          const containerType = page.defaultContainerType || site.defaultContainerType || '';

          const defs = await (await fetch('/api/moduledefinition?siteid=1',{headers:H})).json();
          const def = defs.find(d => /MegaForm\\.Blogs/.test(d.moduleDefinitionName||''));
          if (!def) return 'blog-moduledef-missing';

          const pms = await (await fetch('/api/pagemodule?siteid=1',{headers:H})).json();
          const already = pms.find(pm => pm.pageId === page.pageId && pm.module &&
            /MegaForm\\.Blogs/.test(pm.module.moduleDefinitionName||''));
          if (already) return 'already pageId=' + page.pageId + ' pageModuleId=' + already.pageModuleId +
                                ' moduleId=' + already.moduleId;

          const modRes = await fetch('/api/module', {method:'POST', headers:H, body: JSON.stringify({
            siteId: 1, pageId: page.pageId, moduleDefinitionName: def.moduleDefinitionName,
            allPages: false, permissionList: page.permissionList, isDeleted: false
          })});
          const modTxt = await modRes.text();
          if (!modTxt) return 'module-create EMPTY status=' + modRes.status;
          const mod = JSON.parse(modTxt);

          const pmRes = await fetch('/api/pagemodule', {method:'POST', headers:H, body: JSON.stringify({
            pageId: page.pageId, moduleId: mod.moduleId, title: 'MegaForm Blogs',
            pane: 'Content', order: 99, containerType: containerType, isDeleted: false
          })});
          const pmTxt = await pmRes.text();
          return 'OK pageId=' + page.pageId + ' path="' + page.path + '" moduleId=' + mod.moduleId +
                 ' pagemodule=' + pmRes.status + ' ' + pmTxt.slice(0,200);
        })()`, true);
        console.log('add-to-page:', r);
      } else if (step === 'pages') {
        const r = await ev(`fetch('/api/page?siteid=1',{headers:{'X-OQTANE-SITEID':'1'}}).then(r=>r.json())
          .then(l=>JSON.stringify(l.map(p=>({id:p.pageId,path:p.path,name:p.name,theme:p.themeType,cont:p.defaultContainerType})))).catch(e=>'ERR '+e)`, true);
        console.log('pages:', r);
      } else if (step.startsWith('make-blog-page')) {
        // Clone the home page's theme/container so the new page renders with the site skin,
        // then add the MegaForm Blogs module to it. Oqtane's POST /api/page silently returns an
        // empty body when required members are missing, so every field is copied explicitly.
        const r = await ev(`(async () => {
          const H = {'Content-Type':'application/json','X-OQTANE-SITEID':'1'};
          const pages = await (await fetch('/api/page?siteid=1',{headers:H})).json();
          const home = pages.find(p => (p.path||'') === '') || pages[0];
          if (!home) return 'no-home-page';

          // Pages inherit theme/container from the Site, so home.themeType is usually blank.
          // POST /api/page answers 200 with an EMPTY BODY when they are missing, so resolve
          // the real defaults from the site record.
          const site = await (await fetch('/api/site/1',{headers:H})).json();
          const themeType = home.themeType || site.defaultThemeType || '';
          const containerType = home.defaultContainerType || site.defaultContainerType || '';
          if (!themeType || !containerType) return 'no-theme/container: theme=' + themeType + ' cont=' + containerType;

          let page = pages.find(p => (p.path||'') === 'blog');
          if (!page) {
            const body = {
              siteId: 1, path: 'blog', name: 'Blog', title: 'Blog',
              parentId: null, order: 99, isNavigation: true, isPersonalizable: false, isClickable: true,
              url: '', icon: 'oi oi-book',
              themeType: themeType, defaultContainerType: containerType,
              headContent: '', bodyContent: '',
              // Oqtane 10 renamed Page.Permissions to PermissionList. Sending the old name
              // leaves permissions null and the API answers 200 with an EMPTY BODY.
              permissionList: home.permissionList,
              layoutType: home.layoutType || '', level: 0, isDeleted: false,
              userId: null, effectiveDate: null, expiryDate: null
            };
            const res = await fetch('/api/page', {method:'POST', headers:H, body: JSON.stringify(body)});
            const txt = await res.text();
            if (!txt || res.status >= 400) {
              return 'page-create FAILED status=' + res.status +
                     ' body=' + JSON.stringify(txt.slice(0, 500)) +
                     ' sent=' + JSON.stringify(body).slice(0, 400) +
                     ' homeKeys=' + Object.keys(home).join(',');
            }
            page = JSON.parse(txt);
          }
          if (!page || !page.pageId) return 'no-pageId';

          const defs = await (await fetch('/api/moduledefinition?siteid=1',{headers:H})).json();
          const def = defs.find(d => /MegaForm\\.Blogs/.test(d.moduleDefinitionName||''));
          if (!def) return 'blog-moduledef-missing';

          const existing = await (await fetch('/api/pagemodule?siteid=1',{headers:H})).json();
          const already = existing.find(pm => pm.pageId === page.pageId &&
            (pm.module && /MegaForm\\.Blogs/.test(pm.module.moduleDefinitionName||'')));
          if (already) return 'already pageId=' + page.pageId + ' pageModuleId=' + already.pageModuleId;

          const modRes = await fetch('/api/module', {method:'POST', headers:H, body: JSON.stringify({
            siteId: 1, pageId: page.pageId, moduleDefinitionName: def.moduleDefinitionName,
            allPages: false, permissionList: home.permissionList, isDeleted: false
          })});
          const modTxt = await modRes.text();
          if (!modTxt) return 'module-create-empty status=' + modRes.status;
          const mod = JSON.parse(modTxt);

          const pmRes = await fetch('/api/pagemodule', {method:'POST', headers:H, body: JSON.stringify({
            pageId: page.pageId, moduleId: mod.moduleId, title: 'MegaForm Blogs',
            pane: 'Content', order: 1, containerType: containerType
          })});
          const pmTxt = await pmRes.text();
          return 'created pageId=' + page.pageId + ' path=' + page.path +
                 ' moduleId=' + mod.moduleId + ' pagemodule=' + pmRes.status + ' ' + pmTxt.slice(0,150);
        })()`, true);
        console.log('make-blog-page:', r);
      } else if (step === 'install-upgrade') {
        // Oqtane installs everything sitting in Packages/ and then restarts itself, so the
        // fetch may never resolve. Fire it and do not wait on the response.
        await ev(`fetch('/api/installation/upgrade',{headers:{'X-OQTANE-SITEID':'1'}}).catch(()=>{});'fired'`);
        console.log('install-upgrade: fired (site will restart)');
        await sleep(4000);
      } else if (step === 'probe-install') {
        // Find which installation route this Oqtane build exposes, without changing anything.
        const r = await ev(`(async () => {
          const routes = ['/api/installation/installed','/api/installation/upgrade','/api/installation/restart',
                          '/api/installation/install','/api/moduledefinition?siteid=1','/api/package'];
          const out = [];
          for (const p of routes) {
            try { const res = await fetch(p, {headers:{'X-OQTANE-SITEID':'1'}}); out.push(p + ' GET=' + res.status); }
            catch (e) { out.push(p + ' GET=ERR'); }
          }
          return out.join(' | ');
        })()`, true);
        console.log('probe-install:', r);
      } else if (step === 'install') {
        const r = await ev(`(async () => {
          const res = await fetch('/api/installation/install', {
            method:'POST', headers:{'Content-Type':'application/json','X-OQTANE-SITEID':'1'}, body:'{}'
          });
          return res.status + ' :: ' + (await res.text()).slice(0,400);
        })()`, true);
        console.log('install:', r);
      } else if (step === 'moduledefs') {
        const r = await ev(`fetch('/api/moduledefinition?siteid=1',{headers:{'X-OQTANE-SITEID':'1'}})
          .then(r=>r.json())
          .then(list => list.filter(m => /blog|megaform/i.test(m.name + ' ' + m.moduleDefinitionName))
                            .map(m => m.moduleDefinitionName + ' | ' + m.name + ' | v' + (m.version||'?')).join(' ;; '))
          .catch(e=>'ERR '+e)`, true);
        console.log('moduledefs:', r);
      } else if (step.startsWith('shot=')) {
        const spec = step.slice(5);
        const i = spec.indexOf(':');
        const name = spec.slice(0, i), p = spec.slice(i + 1);
        await goto(baseUrl + p, 8000);
        const h = Math.min(Math.max(await ev('document.body.scrollHeight') || 1000, 900), 9000);
        await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: h, deviceScaleFactor: 1, mobile: false });
        await sleep(900);
        const s = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
        const diag = await ev(`JSON.stringify({href:location.href,h:document.body.scrollHeight,
          mfb:!!document.querySelector('.mfb'),mfba:!!document.querySelector('.mfba'),
          err:(document.querySelector('.mfb-state-error,.mfba-notice.err')||{}).textContent||null})`);
        console.log('shot', name, diag);
      }
    }
    cdp.close();
  } finally { try { chrome.kill(); } catch { } }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
