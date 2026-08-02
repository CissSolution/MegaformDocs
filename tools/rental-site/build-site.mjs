// Build the rental site on a local Oqtane host, one verifiable step at a time.
//
// usage: node build-site.mjs <baseUrl> <user> <pass> <step>
//   steps: page      create the "Cho thuê nhà" page + a MegaForm module on it
//          forms     create the five forms (building / room / reading / tenant / private docs)
//          relations declare the parent-child relations between them
//          status    report what exists so far
//
// Everything runs from a logged-in browser page so cookies, the Oqtane site header and the
// antiforgery token behave exactly as they do for the app itself. Oqtane's own REST API is used
// for pages and modules; MegaForm's API is used for forms.
//
// WHY the schema is written here rather than drawn in the builder: the builder's Number tile no
// longer emits type "number" - it emits a Composite with widgetProps.preset=number, and
// SubmissionFieldNormalizer routes Composite to the JSON table. Rent and discount would then be
// stored as STRINGS and no numeric comparison could ever touch them. Authoring the schema
// directly is the only way to get real `number` fields into MF_SubmissionValueNumber, which is
// where a "discount >= 20" filter has to look.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const [baseUrl, user, pass, step] = process.argv.slice(2);
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9395;
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
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    // awaitPromise is mandatory: without it every async probe resolves to the Promise object
    // and comes back empty with no error.
    const ev = async (e) => (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

    await cdp.call('Page.navigate', { url: baseUrl + '/login' });
    await sleep(4000);

    let authed = await ev("document.body.innerText.indexOf('Logout') >= 0");
    if (!authed) {
      for (let i = 0; i < 60; i++) { if (await ev("!!document.querySelector('input[type=password]')")) break; await sleep(1000); }
      await ev(`(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const p = inputs.find(i => i.type === 'password'); if (!p) return 'no-password';
        const idx = inputs.indexOf(p);
        const u = inputs.slice(0, idx).reverse().find(i => i.type === 'text' || i.type === '' || !i.type);
        if (!u) return 'no-username';
        const set = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.blur(); };
        set(u, ${JSON.stringify(user)}); set(p, ${JSON.stringify(pass)}); return 'filled';
      })()`);
      await sleep(1200);
      await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^\\s*login\\s*$/i.test(x.textContent||'')); if (b) { b.click(); return 'clicked'; } return 'no-button'; })()`);
      for (let i = 0; i < 40; i++) { authed = await ev("document.body.innerText.indexOf('Logout') >= 0"); if (authed) break; await sleep(1000); }
    }
    console.log('authenticated:', authed);
    if (!authed) { console.log('ABORT: not logged in'); cdp.close(); return; }

    if (step === 'page') {
      // Oqtane answers POST /api/page with 200 AND AN EMPTY BODY when a required member is
      // missing, so every field is sent explicitly and theme/container are resolved from the
      // site record (pages usually inherit them and leave their own copies blank).
      const r = await ev(`(async () => { try {
        const H = {'Content-Type':'application/json','X-OQTANE-SITEID':'1'};
        const pages = await (await fetch('/api/page?siteid=1',{headers:H})).json();
        const home = pages.find(p => (p.path||'') === '') || pages[0];
        if (!home) return 'no-home-page';
        const site = await (await fetch('/api/site/1',{headers:H})).json();
        const themeType = home.themeType || site.defaultThemeType || '';
        const containerType = home.defaultContainerType || site.defaultContainerType || '';
        if (!themeType || !containerType) return 'no-theme-or-container';

        let page = pages.find(p => (p.path||'') === 'cho-thue');
        if (!page) {
          const body = {
            siteId: 1, path: 'cho-thue', name: 'Nha cho thue', title: 'Nha cho thue',
            parentId: null, order: 10, isNavigation: true, isPersonalizable: false, isClickable: true,
            url: '', icon: 'oi oi-home',
            themeType, defaultContainerType: containerType,
            headContent: '', bodyContent: '',
            // POST /api/page cannot carry permissions, and both ways of trying fail differently:
            //   - home.permissionList verbatim  -> 200 with an EMPTY body, page created with ZERO
            //     permission rows
            //   - the same list re-keyed to entityId 0 -> 400, and the Oqtane log shows
            //     "An error occurred while saving the entity changes" from PageController.Post
            // Oqtane only accepts permission entries whose entityId is already the new page's id,
            // which the caller cannot know before the page exists. A page with no permissions is
            // then invisible to GET /api/page and 403 on GET /api/page/{id} - unfindable and
            // unrepairable through the API. So the list is sent in the shape the API tolerates and
            // the permission rows are seeded separately (see the perms step).
            // NOTE: no backticks anywhere inside this block - it lives in a template literal.
            permissionList: home.permissionList,
            layoutType: home.layoutType || '', level: 0, isDeleted: false,
            userId: null, effectiveDate: null, expiryDate: null
          };
          const res = await fetch('/api/page', {method:'POST', headers:H, body: JSON.stringify(body)});
          const txt = await res.text();
          // Do NOT trust the response body. Oqtane answered 200 with an EMPTY body here and had
          // created the page anyway (verified in the Page table), and a second attempt then
          // returned 400 for the duplicate path. Both look like failure and neither is. The only
          // reliable answer is to re-read the list.
          if (txt && res.status < 400) {
            try { page = JSON.parse(txt); } catch { page = null; }
          }
          if (!page || !page.pageId) {
            const after = await (await fetch('/api/page?siteid=1',{headers:H})).json();
            page = after.find(p => (p.path||'') === 'cho-thue');
          }
          if (!page || !page.pageId) {
            return 'page-create FAILED status=' + res.status +
                   ' | response=' + JSON.stringify(txt.slice(0, 600)) +
                   ' | sent=' + JSON.stringify(body).slice(0, 600);
          }
        }
        if (!page || !page.pageId) return 'no-pageId';

        // Several Oqtane endpoints answer 200 with an EMPTY body, which makes .json() throw a
        // message that names no endpoint. Read as text and say which one went quiet.
        const getJson = async (url) => {
          const res = await fetch(url, {headers:H});
          const txt = await res.text();
          if (!txt) throw new Error('EMPTY response from ' + url + ' (status ' + res.status + ')');
          try { return JSON.parse(txt); }
          catch (e) { throw new Error('NON-JSON from ' + url + ': ' + txt.slice(0,160)); }
        };

        const defs = await getJson('/api/moduledefinition?siteid=1');
        const def = defs.find(d => /MegaForm/.test(d.moduleDefinitionName||'') && !/Blogs/.test(d.moduleDefinitionName||''));
        if (!def) return 'megaform-moduledef-missing; have=' + defs.map(d=>d.moduleDefinitionName).join('|').slice(0,300);

        // NOTE: GET /api/pagemodule?siteid=1 is 404 on Oqtane 10.2.1 - the list-by-site form does
        // not exist here (the older driver this recipe came from targeted a build that had it).
        // Idempotency is handled by the caller checking the database instead.

        const modRes = await fetch('/api/module', {method:'POST', headers:H, body: JSON.stringify({
          siteId: 1, pageId: page.pageId, moduleDefinitionName: def.moduleDefinitionName,
          allPages: false, permissionList: home.permissionList, isDeleted: false
        })});
        const modTxt = await modRes.text();
        if (!modTxt || modRes.status >= 400) return 'module-create FAILED status=' + modRes.status + ' body=' + modTxt.slice(0,300);
        const mod = JSON.parse(modTxt);

        const pmRes = await fetch('/api/pagemodule', {method:'POST', headers:H, body: JSON.stringify({
          pageId: page.pageId, moduleId: mod.moduleId, title: 'Nha cho thue',
          pane: 'Default', order: 1, containerType: containerType, isDeleted: false
        })});
        const pmTxt = await pmRes.text();
        return 'OK pageId=' + page.pageId + ' path="' + page.path + '" moduleId=' + mod.moduleId +
               ' pagemodule=' + pmRes.status + ' ' + pmTxt.slice(0,120);
      } catch (e) {
        // An Error object serialises to {} across CDP, which hides the only useful part.
        return 'THREW: ' + (e && e.message ? e.message : String(e));
      } })()`);
      console.log('page step:', r);
    } else if (step === 'fixperm') {
      // A page created with the home page's permissionList verbatim ends up with ZERO permission
      // rows: the items carry the SOURCE page's entityId/permissionId, and Oqtane skips them. A
      // page with no permissions is invisible to GET /api/page, so it can neither be found nor
      // re-created (the path is taken) - it has to be repaired by id.
      const r = await ev(`(async () => {
        const H = {'Content-Type':'application/json','X-OQTANE-SITEID':'1'};
        const pageRes = await fetch('/api/page/${process.argv[6] || 34}?siteid=1', {headers:H});
        const pageTxt = await pageRes.text();
        if (!pageTxt) return 'GET page by id returned empty (status ' + pageRes.status + ')';
        const page = JSON.parse(pageTxt);

        const pages = await (await fetch('/api/page?siteid=1',{headers:H})).json();
        const home = pages.find(p => (p.path||'') === '') || pages[0];
        if (!home || !home.permissionList) return 'no home permissionList to copy';

        // Re-key every entry onto THIS page and let the server assign new permission ids.
        page.permissionList = home.permissionList.map(p => ({
          permissionId: 0, siteId: p.siteId, entityName: 'Page', entityId: page.pageId,
          permissionName: p.permissionName, roleId: p.roleId ?? null, roleName: p.roleName ?? null,
          userId: p.userId ?? null, isAuthorized: p.isAuthorized
        }));

        const put = await fetch('/api/page/' + page.pageId, {method:'PUT', headers:H, body: JSON.stringify(page)});
        const putTxt = await put.text();
        const after = await (await fetch('/api/page?siteid=1',{headers:H})).json();
        const visible = after.some(p => p.pageId === page.pageId);
        return 'PUT status=' + put.status + ' bodyLen=' + putTxt.length +
               ' | page now visible in list: ' + visible +
               ' | perms sent: ' + page.permissionList.length;
      })()`);
      console.log('fixperm:', r);
    } else if (step === 'status') {
      const r = await ev(`(async () => {
        const H = {'X-OQTANE-SITEID':'1'};
        const pages = await (await fetch('/api/page?siteid=1',{headers:H})).json();
        const pm = await (await fetch('/api/pagemodule?siteid=1',{headers:H})).json();
        const mf = pm.filter(x => x.module && /MegaForm/.test(x.module.moduleDefinitionName||''));
        return JSON.stringify({
          pages: pages.map(p => p.path === '' ? '(home)' : p.path),
          megaformModules: mf.map(x => ({ page: x.pageId, moduleId: x.moduleId, title: x.title }))
        });
      })()`);
      console.log('status:', r);
    } else {
      console.log('unknown step:', step);
    }

    const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'last.png'), Buffer.from(shot.data, 'base64'));
    cdp.close();
  } finally {
    try { chrome.kill(); } catch { }
  }
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
