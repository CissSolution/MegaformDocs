// Authenticated POST to a DNN API, from a real logged-in browser session.
//
// usage: node dnn-api-post.mjs <outDir> <site> <user> <pass> <hostMap|-> <apiPath> <jsonBody>
//   e.g. node dnn-api-post.mjs .\out https://example.com host pw - \
//          /API/PersonaBar/SqlConsole/RunQuery "{\"connection\":\"SiteSqlServer\",\"query\":\"SELECT 1\"}"
//
// Some DNN endpoints (SqlConsole, Pages) need forms-auth cookies AND the page's
// RequestVerificationToken, which only exist inside an authenticated page. Logging in with a
// browser and posting from page context gets both without reimplementing DNN's login.
//
// hostMap: "-" for a publicly resolvable domain; otherwise the host to pin to 127.0.0.1
// (local QA hosts live only in the Windows hosts file).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const outDir = path.resolve(process.argv[2]);
const site = process.argv[3].replace(/\/$/, '');
const user = process.argv[4];
const pass = process.argv[5];
const hostMapArg = process.argv[6];
const apiPath = process.argv[7];
// One or more bodies. Several are POSTed sequentially over the SAME logged-in session, which
// beats paying a Chrome launch + login per call.
const jsonBodies = process.argv.slice(8);
if (jsonBodies.length === 0) jsonBodies.push('{}');

// MF_HEADERS='{"ModuleId":"10603","TabId":"1009"}' adds request headers.
// Most MegaForm DNN endpoints sit behind [DnnModuleAuthorize], which resolves the module from
// the ModuleId/TabId headers — without them DNN answers 401 no matter how good the session is.
// An env var rather than another positional argument, so existing callers keep working.
let extraHeaders = {};
if (process.env.MF_HEADERS) {
  try { extraHeaders = JSON.parse(process.env.MF_HEADERS); }
  catch (e) { console.error('MF_HEADERS is not valid JSON:', e.message); process.exit(2); }
}

fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9386;
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
  const host = new URL(site).hostname;
  const mapHost = hostMapArg === '-' ? null : (hostMapArg || host);
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(outDir, '.p')}`, '--window-size=1440,1000', '--hide-scrollbars',
    ...(mapHost ? [`--host-resolver-rules=MAP ${mapHost} 127.0.0.1`] : []),
    '--disable-features=DnsOverHttps', 'about:blank'], { stdio: 'ignore' });
  try {
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    // A thrown expression comes back as exceptionDetails with result.value undefined. Reading
    // only .value turned every such failure into a silent `undefined`, which reads as "the call
    // returned nothing" instead of "the call blew up" — say which.
    const ev = async (e) => {
      const r = await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        console.error('  [evaluate threw]', d.exception?.description || d.text || JSON.stringify(d).slice(0, 400));
      }
      return r.result?.value;
    };

    await cdp.call('Page.navigate', { url: site + '/Login' });
    await sleep(7000);
    for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('input[id$=\"txtUsername\"]')")) break; await sleep(500); }
    await ev(`(() => {
      const u = document.querySelector('input[id$="txtUsername"]');
      const p = document.querySelector('input[id$="txtPassword"]');
      if (!u || !p) return 'no-fields';
      u.value = ${JSON.stringify(user)}; u.dispatchEvent(new Event('change', {bubbles:true}));
      p.value = ${JSON.stringify(pass)}; p.dispatchEvent(new Event('change', {bubbles:true}));
      const b = document.querySelector('[id$="cmdLogin"]'); if (!b) return 'no-button';
      b.click(); return 'clicked';
    })()`);
    await sleep(10000);
    console.log('session:', await ev("document.body.innerHTML.indexOf('/ctl/Logoff') >= 0 ? 'authenticated' : 'ANONYMOUS'"));
    // The POST is a same-origin fetch from THIS page, so where the login left us decides where it
    // goes. A redirect to another alias or an error page turns every call into "Failed to fetch".
    console.log('page:   ', await ev('location.href'));

    for (const body of jsonBodies) {
      const out = await ev(`(async () => {
        let token = '';
        try { const sf = window.jQuery && window.jQuery.ServicesFramework && window.jQuery.ServicesFramework(0); if (sf) token = sf.getAntiForgeryValue(); } catch (e) {}
        if (!token) { const el = document.querySelector('input[name="__RequestVerificationToken"]'); if (el) token = el.value; }
        const r = await fetch(${JSON.stringify(apiPath)}, {
          method: 'POST', credentials: 'same-origin',
          headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json',
                     'X-Requested-With': 'XMLHttpRequest', RequestVerificationToken: token },
                     ${JSON.stringify(extraHeaders)}),
          body: ${JSON.stringify(body)} });
        const text = await r.text();
        return { status: r.status, hadToken: !!token, body: text.slice(0, 20000) };
      })()`);
      console.log('HTTP', out && out.status, '|', body.slice(0, 60));
      // Full body when MF_FULL=1 - reading a stored HTML block needs all of it, not a preview.
      console.log(process.env.MF_FULL === '1'
        ? (out && out.body)
        : '   ' + (out && out.body || '').replace(/\s+/g, ' ').slice(0, 400));
    }
    cdp.close();
  } finally {
    try { chrome.kill(); } catch { }
  }
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
