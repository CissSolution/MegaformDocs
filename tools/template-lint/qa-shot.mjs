// CDP screenshot runner for the template harness. Pure node (raw WebSocket to Chrome).
// usage: node qa-shot.mjs <templateFolder> <outDir> [port] [debugPort] [onlyFile]
// Per template: capture default state, then best-effort click "next step" up to 6x
// (generic selectors) capturing each step. Filenames: <slug>__s<step>.png
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const tplFolder = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
const port = Number(process.argv[4] || 5199);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG_PORT = Number(process.argv[5] || 9333);
const ONLY = process.argv[6] || null;

fs.mkdirSync(outDir, { recursive: true });

function httpJson(url) {
  return new Promise((res, rej) => http.get(url, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// minimal WS client (no deps) — text frames only, handles fragmentation + large payloads
function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const key = Buffer.from(String(Math.random())).toString('base64');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': 13 } });
    req.on('upgrade', (res, socket) => {
      socket.setNoDelay(true);
      const pending = new Map(); let nextId = 1; let buf = Buffer.alloc(0);
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
            wsConnect._frag = (op === 0x1) ? payload : Buffer.concat([wsConnect._frag || Buffer.alloc(0), payload]);
            if (fin) {
              try { const msg = JSON.parse(wsConnect._frag.toString('utf8')); wsConnect._frag = null;
                if (msg.id && pending.has(msg.id)) { const { res: rs, rej: rj } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rj(new Error(JSON.stringify(msg.error))) : rs(msg.result); }
              } catch { wsConnect._frag = null; }
            }
          } else if (op === 0x9) { // ping -> pong
            const pong = Buffer.alloc(2 + payload.length); pong[0] = 0x8a; pong[1] = 0x80 | payload.length; // masked? client must mask
            sendFrame(0x0a, payload);
          }
        }
      });
      function sendFrame(op, payload) {
        const mask = Buffer.from([1, 2, 3, 4]);
        let header;
        if (payload.length < 126) { header = Buffer.alloc(6); header[1] = 0x80 | payload.length; mask.copy(header, 2); }
        else if (payload.length < 65536) { header = Buffer.alloc(8); header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); mask.copy(header, 4); }
        else { header = Buffer.alloc(14); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); mask.copy(header, 10); }
        header[0] = 0x80 | op;
        const masked = Buffer.from(payload);
        for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
        socket.write(Buffer.concat([header, masked]));
      }
      resolve({
        call(method, params) {
          return new Promise((rs, rj) => { const id = nextId++; pending.set(id, { res: rs, rej: rj }); sendFrame(0x1, Buffer.from(JSON.stringify({ id, method, params: params || {} }), 'utf8')); });
        },
        close() { try { socket.destroy(); } catch { } },
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const chrome = spawn(CHROME, [`--remote-debugging-port=${DEBUG_PORT}`, '--headless=new', '--disable-gpu', '--window-size=1080,1400', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 40 && !targets; i++) { try { targets = await httpJson(`http://127.0.0.1:${DEBUG_PORT}/json`); } catch { await sleep(250); } }
    if (!targets) throw new Error('chrome CDP not reachable');
    const page = targets.find((t) => t.type === 'page');
    const cdp = await wsConnect(page.webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');

    const files = fs.readdirSync(tplFolder).filter((f) => f.endsWith('.json')).filter((f) => !ONLY || f === ONLY).sort();
    for (const f of files) {
      const slug = f.replace(/\.json$/, '');
      await cdp.call('Page.navigate', { url: `http://127.0.0.1:${port}/harness.html?tpl=${encodeURIComponent(f)}` });
      // wait QA-READY + web fonts loaded + all images complete (kills font-swap/image races).
      // NOTE: fonts.status==='loaded' is vacuously true BEFORE @import registers any
      // FontFace — so first give @import a fixed 2s window to register, THEN require loaded.
      for (let i = 0; i < 100; i++) {
        const r = await cdp.call('Runtime.evaluate', { expression: 'window.__MF_QA_READY===true', returnByValue: true });
        if (r.result && r.result.value === true) break;
        await sleep(200);
      }
      await sleep(2000); // @import font-face registration window
      for (let i = 0; i < 60; i++) {
        const r = await cdp.call('Runtime.evaluate', {
          expression: `document.fonts.status==='loaded' && Array.from(document.images).every(im=>im.complete)`,
          returnByValue: true,
        });
        if (r.result && r.result.value === true) break;
        await sleep(200);
      }
      await sleep(800); // paint settle
      const shoot = async (step) => {
        const metrics = await cdp.call('Runtime.evaluate', { expression: 'JSON.stringify({w:1080,h:Math.min(Math.max(document.body.scrollHeight,900),6000)})', returnByValue: true });
        const { w, h } = JSON.parse(metrics.result.value);
        await cdp.call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        await sleep(150);
        const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(path.join(outDir, `${slug}__s${step}.png`), Buffer.from(shot.data, 'base64'));
      };
      await shoot(1);
      // best-effort step walking (same procedure before/after => consistent comparator)
      const NEXT_SEL = ['.mf-step-next', '.mf-btn-next', '[data-mf-next]', '.mf-wizard-next', 'button.mf-next', '.mfp-next', '[data-action="next"]'];
      for (let step = 2; step <= 6; step++) {
        const clicked = await cdp.call('Runtime.evaluate', { expression: `(function(){for(const s of ${JSON.stringify(NEXT_SEL)}){const b=document.querySelector(s);if(b&&b.offsetParent){b.click();return s;}}return null;})()`, returnByValue: true });
        if (!clicked.result || !clicked.result.value) break;
        await sleep(700);
        await shoot(step);
      }
      console.log('shot', slug);
    }
    cdp.close();
  } finally { try { chrome.kill(); } catch { } }
}
main().then(() => { console.log('done'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
