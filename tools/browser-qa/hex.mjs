// Resolve the mock's CSS custom properties to exact sRGB hex via canvas readback.
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const url = process.argv[2];
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9379;
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
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px';
  document.body.appendChild(probe);
  const hex = (css) => {
    probe.style.backgroundColor = '';
    probe.style.backgroundColor = css;
    const c = getComputedStyle(probe).backgroundColor;
    ctx.clearRect(0,0,1,1); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,1,1);
    ctx.fillStyle = c; ctx.fillRect(0,0,1,1);
    const d = ctx.getImageData(0,0,1,1).data;
    return '#' + [d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase() + ' a=' + (d[3]/255).toFixed(2);
  };
  const out = {};
  for (const n of ['--background','--foreground','--card','--primary','--muted','--muted-foreground','--border','--accent','--secondary','--destructive']) out[n] = hex('var(' + n + ')');
  out['page-bg (muted/30 over background)'] = (() => {
    const el = document.querySelector('div.min-h-screen');
    const layer = getComputedStyle(el).backgroundColor;
    ctx.clearRect(0,0,1,1); ctx.fillStyle = hexOnly('var(--background)'); ctx.fillRect(0,0,1,1);
    ctx.fillStyle = layer; ctx.fillRect(0,0,1,1);
    const d = ctx.getImageData(0,0,1,1).data;
    return '#' + [d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase();
  })();
  function hexOnly(css){ probe.style.backgroundColor=''; probe.style.backgroundColor=css; return getComputedStyle(probe).backgroundColor; }
  // tailwind palette utilities used by the mock
  const pal = {};
  for (const cls of ['bg-blue-50','text-blue-600','bg-emerald-50','text-emerald-600','bg-violet-50','text-violet-600','bg-amber-50','text-amber-600','bg-emerald-100','text-emerald-700','bg-amber-100','text-amber-700','bg-blue-100','text-blue-700','bg-purple-100','text-purple-700','bg-cyan-100','text-cyan-700','bg-slate-100','text-slate-600','bg-red-50','text-red-600','bg-red-100','text-red-700','bg-blue-500','bg-violet-500','bg-amber-500','bg-emerald-500','bg-pink-500','bg-slate-500','bg-green-500','bg-cyan-500','bg-purple-500','bg-red-500','text-red-500','text-red-400','text-emerald-500','text-blue-500','text-violet-500','text-orange-500','text-amber-500','text-green-600','bg-green-100','text-green-700','text-slate-700','bg-slate-100']) {
    const p = document.createElement('div'); p.className = cls; p.style.cssText='position:fixed;left:-9999px;width:1px;height:1px';
    document.body.appendChild(p);
    const s = getComputedStyle(p);
    const c = cls.startsWith('bg-') ? s.backgroundColor : s.color;
    ctx.clearRect(0,0,1,1); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,1,1); ctx.fillStyle=c; ctx.fillRect(0,0,1,1);
    const d = ctx.getImageData(0,0,1,1).data;
    pal[cls] = '#' + [d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
    p.remove();
  }
  probe.remove();
  return JSON.stringify({ vars: out, palette: pal }, null, 1);
})()`;
async function main() {
  const chrome = spawn(CHROME, [`--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu', `--user-data-dir=${path.join(process.cwd(), '.hp')}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
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
