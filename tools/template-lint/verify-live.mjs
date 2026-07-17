// Live verification: login to an Oqtane site, screenshot pages/selectors.
// usage: node verify-live.mjs <baseUrl> <user> <pass> <outDir>
// Steps are driven via CDP (same no-dep ws client as qa-shot).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const [baseUrl, user, pass, outDirArg] = process.argv.slice(2);
const outDir = path.resolve(outDirArg);
fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpJson(url) { return new Promise((res, rej) => http.get(url, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej)); }

function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const key = Buffer.from(String(Math.random())).toString('base64');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': 13 } });
    req.on('upgrade', (res, socket) => {
      socket.setNoDelay(true);
      const pending = new Map(); let nextId = 1; let buf = Buffer.alloc(0); let frag = null;
      function sendFrame(op, payload) {
        const mask = Buffer.from([5, 6, 7, 8]); let header;
        if (payload.length < 126) { header = Buffer.alloc(6); header[1] = 0x80 | payload.length; mask.copy(header, 2); }
        else if (payload.length < 65536) { header = Buffer.alloc(8); header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); mask.copy(header, 4); }
        else { header = Buffer.alloc(14); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); mask.copy(header, 10); }
        header[0] = 0x80 | op;
        const masked = Buffer.from(payload);
        for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
        socket.write(Buffer.concat([header, masked]));
      }
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (true) {
          if (buf.length < 2) break;
          const fin = (buf[0] & 0x80) !== 0; const op = buf[0] & 0x0f;
          let len = buf[1] & 0x7f; let off = 2;
          if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) break;
          const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
          if (op === 0x1 || op === 0x0) {
            frag = (op === 0x1) ? payload : Buffer.concat([frag || Buffer.alloc(0), payload]);
            if (fin) { try { const msg = JSON.parse(frag.toString('utf8')); frag = null; if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } } catch { frag = null; } }
          } else if (op === 0x9) sendFrame(0x0a, payload);
        }
      });
      resolve({ call: (m, p) => new Promise((rs, rj) => { const id = nextId++; pending.set(id, { res: rs, rej: rj }); sendFrame(0x1, Buffer.from(JSON.stringify({ id, method: m, params: p || {} }), 'utf8')); }), close: () => { try { socket.destroy(); } catch { } } });
    });
    req.on('error', reject); req.end();
  });
}

async function main() {
  const profile = path.join(outDir, '.chrome-profile');
  const chrome = spawn(CHROME, [`--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--window-size=1440,1000', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 40 && !targets; i++) { try { targets = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const page = targets.find((t) => t.type === 'page');
    const cdp = await wsConnect(page.webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    const evalJs = async (expr) => (await cdp.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
    const shot = async (name, fullH) => {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: fullH || 1000, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      const s = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(s.data, 'base64'));
      console.log('shot', name);
    };
    const goto = async (url, waitMs) => { await cdp.call('Page.navigate', { url }); await sleep(waitMs || 4000); };

    // 1) login (Blazor: set input values natively + dispatch events)
    await goto(baseUrl + '/login', 6000);
    const loginResult = await evalJs(`(async function(){
      function setVal(el, v){ const d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
      const p=document.querySelector('#Password,input[name=Password],input[type=password]');
      if(!p) return 'NO-PASSWORD:'+document.title;
      const scope=p.closest('form')||p.closest('.container,.mx-auto,main')||document;
      const u=scope.querySelector('#Username,input[name=Username],input[type=text]');
      if(!u) return 'NO-USERNAME';
      setVal(u,${JSON.stringify(user)}); setVal(p,${JSON.stringify(pass)});
      await new Promise(r=>setTimeout(r,300));
      const btn=[...document.querySelectorAll('button')].find(b=>/login/i.test(b.textContent));
      if(!btn) return 'NO-BUTTON';
      btn.click(); return 'CLICKED';
    })()`);
    console.log('login:', loginResult);
    await sleep(6000);
    await shot('01-after-login');
    console.log('url now:', await evalJs('location.href'));
  } finally { try { chrome.kill(); } catch { } }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
