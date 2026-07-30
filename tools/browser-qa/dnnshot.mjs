// DNN host login + full-page screenshots.
// usage: node dnnshot.mjs <outDir> <width> <site> <user> <pass> <name=path> [...]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const outDir = path.resolve(process.argv[2]);
const width = parseInt(process.argv[3], 10) || 1440;
const site = process.argv[4].replace(/\/$/, '');
const user = process.argv[5];
const pass = process.argv[6];
const jobs = process.argv.slice(7).map((s) => { const i = s.indexOf('='); return { name: s.slice(0, i), url: site + s.slice(i + 1) }; });
fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9381;
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
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(outDir, '.p')}`, `--window-size=${width},1000`, '--hide-scrollbars',
    // The QA hosts live only in the Windows hosts file; DoH/async DNS would NXDOMAIN them.
    `--host-resolver-rules=MAP ${host} 127.0.0.1`,
    '--disable-features=DnsOverHttps',
    'about:blank'], { stdio: 'ignore' });
  try {
    let t = null; for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    const ev = async (e) => (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: false })).result?.value;

    // --- login ---
    await cdp.call('Page.navigate', { url: site + '/Login' });
    await sleep(6000);
    for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('input[id$=\"txtUsername\"]')")) break; await sleep(500); }
    const filled = await ev(`(() => {
      const u = document.querySelector('input[id$="txtUsername"]');
      const p = document.querySelector('input[id$="txtPassword"]');
      if (!u || !p) return 'no-fields';
      u.value = ${JSON.stringify(user)}; u.dispatchEvent(new Event('change', {bubbles:true}));
      p.value = ${JSON.stringify(pass)}; p.dispatchEvent(new Event('change', {bubbles:true}));
      const btn = document.querySelector('[id$="cmdLogin"]');
      if (!btn) return 'no-button';
      btn.click();
      return 'clicked';
    })()`);
    console.log('login:', filled);
    await sleep(9000);
    const who = await ev("document.body.innerHTML.indexOf('/ctl/Logoff') >= 0 ? 'authenticated' : 'anonymous'");
    console.log('session:', who);

    for (const j of jobs) {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
      // DNN's first post-login navigation occasionally lands on chrome-error; retry it.
      for (let attempt = 0; attempt < 4; attempt++) {
        await cdp.call('Page.navigate', { url: j.url });
        await sleep(5000);
        for (let i = 0; i < 40; i++) { if (await ev("document.readyState==='complete'")) break; await sleep(400); }
        const href = await ev('location.href');
        if (href && href.indexOf('chrome-error') < 0) break;
        await sleep(2000);
      }
      await sleep(1800);
      const h = Math.min(Math.max(await ev('document.body.scrollHeight') || 1000, 900), 9000);
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 1, mobile: width < 700 });
      await sleep(800);
      const s = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(outDir, j.name + '.png'), Buffer.from(s.data, 'base64'));
      const diag = await ev(`JSON.stringify({
        href: location.href,
        xOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mfba: !!document.querySelector('.mfba'),
        h1: (document.querySelector('.mfba h1')||{}).textContent || null,
        err: (document.querySelector('.mfba-notice.err')||{}).textContent || null,
        empty: Array.from(document.querySelectorAll('.mfba-empty')).map(e=>e.textContent.trim()).slice(0,4),
        cssLoaded: getComputedStyle(document.querySelector('.mfba')||document.body).getPropertyValue('--mfba-primary').trim() || 'NONE'
      })`);
      console.log('shot', j.name, 'h=' + h, diag);
    }
    cdp.close();
  } finally { try { chrome.kill(); } catch { } }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
