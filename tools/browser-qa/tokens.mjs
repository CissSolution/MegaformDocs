// Dump computed design tokens from the running mock. usage: node tokens.mjs <url>
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const url = process.argv[2];
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9378;
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
const PROBE = `(() => {
  const cs = getComputedStyle(document.documentElement);
  const vars = {};
  for (const n of ['--background','--foreground','--card','--card-foreground','--primary','--primary-foreground','--muted','--muted-foreground','--border','--input','--ring','--radius','--font-sans']) {
    vars[n] = cs.getPropertyValue(n).trim();
  }
  const pick = (sel, props) => {
    const el = document.querySelector(sel); if (!el) return sel + ' :: MISSING';
    const s = getComputedStyle(el); const o = {};
    for (const p of props) o[p] = s.getPropertyValue(p);
    const r = el.getBoundingClientRect(); o.__box = Math.round(r.width) + 'x' + Math.round(r.height);
    return o;
  };
  return JSON.stringify({
    vars,
    body: pick('body', ['background-color','color','font-family','font-size']),
    page: pick('div.min-h-screen', ['background-color']),
    header: pick('header', ['background-color','border-bottom-color','padding-top','padding-bottom']),
    h1: pick('h1', ['font-size','font-weight','line-height','letter-spacing','color']),
    sub: pick('header p', ['font-size','color']),
    statCard: pick('main .grid > div', ['background-color','border-color','border-radius','border-width','padding','box-shadow']),
    statValue: pick('main .grid > div p', ['font-size','font-weight','color']),
    btnPrimary: pick('header button.gap-2, header a.gap-2, header .inline-flex', ['background-color','color','height','border-radius','padding-left','font-size','font-weight']),
    input: pick('input', ['height','border-color','border-radius','background-color','font-size','padding-left']),
    crumb: pick('nav a', ['font-size','color']),
    panel: pick('.rounded-2xl', ['border-radius','border-color','background-color']),
    panelHead: pick('.rounded-2xl h2', ['font-size','font-weight'])
  }, null, 1);
})()`;
async function main() {
  const chrome = spawn(CHROME, [`--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu', `--user-data-dir=${path.join(process.cwd(), '.tp')}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
  try {
    let t = null; for (let i = 0; i < 40 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    await cdp.call('Page.navigate', { url }); await sleep(6000);
    const r = await cdp.call('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    console.log(r.result?.value || JSON.stringify(r));
    cdp.close();
  } finally { try { chrome.kill(); } catch { } }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
