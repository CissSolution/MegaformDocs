// Re-shoot the template gallery screenshots used by CissSolution/DNN_MegaformDocs.
//
// usage: node docs-gallery-shots.mjs <outDir> [width] [height]
//
// Source of truth for the shots is megademo.ai (host/dnnhost) — its SHOWCASE-* pages are
// the 2-column demo pages the original docs images were taken from, one per template.
// The pages bounce anonymous visitors to /Login, so the run logs in as host and then hides
// the Persona Bar + edit chrome so the frame matches what a visitor would see.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const outDir = path.resolve(process.argv[2]);
const width = parseInt(process.argv[3], 10) || 1700;
const height = parseInt(process.argv[4], 10) || 1200;

// page slug -> the file name the docs site already references.
const SHOTS = [
  ['SHOWCASE-Outback', 'dnn-gallery-outback.png'],
  ['SHOWCASE-Youth', 'dnn-gallery-youth.png'],
  ['SHOWCASE-Christmas', 'dnn-gallery-christmas.png'],
  ['SHOWCASE-Wellness', 'dnn-gallery-wellness.png'],
  ['SHOWCASE-Tabbed', 'dnn-gallery-tabbed.png'],
  ['SHOWCASE-Project', 'dnn-gallery-project-intake.png'],
  ['SHOWCASE-Discovery', 'dnn-gallery-discovery.png'],
  ['SHOWCASE-Event', 'dnn-gallery-event.png'],
];

const SITE = 'http://megademo.ai';
const HOST = 'megademo.ai';
const USER = process.env.DNN_USER || 'host';
const PASS = process.env.DNN_PASS || 'dnnhost';

fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9388;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(u) {
  return new Promise((res, rej) => http.get(u, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej));
}

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

// A host session paints three things a visitor never sees: the Persona Bar (plus the dark
// gutter it reserves on the left), the Logout / account links, and — because the demo site
// has grown QA pages since the originals were shot — a menu full of DEMO2COL/DEMOERP/QA/
// SHOWCASE entries. All three are removed so the frame shows the product, not the workbench.
// A host session paints three things a visitor never sees: the Persona Bar (plus the gutter
// it reserves down the left), the account links, and — the demo site has grown QA pages since
// the originals were shot — a menu full of DEMO2COL/DEMOERP/QA/SHOWCASE entries.
//
// Only EXACT selectors are hidden. A wildcard like [class*="personabar"] also matches the
// skin wrapper the whole page lives in, which blanks the screenshot.
const HIDE_CHROME = `(() => {
  const hide = (el) => { if (el) el.style.setProperty('display', 'none', 'important'); };

  // #personabar-placeholder is the one that matters for framing: it reserves the bar's 80px
  // and pushes form#Form right, leaving a dark gutter down the left of the screenshot even
  // after the bar itself is hidden.
  ['#personabar-wrap', '#personaBar-iframe', '#personaBar-loadingbar', '#personabar',
   '#personabar-placeholder', '.personabar-placeholder',
   '.dnn-edit-bar', '#EditBar', '#dnn-edit-bar', '#ControlBar', '.controlBar_wrapper',
   '.loginGroup', '.userGroup', '.registerGroup', '#dnn_dnnLogin_loginLink', '#dnn_dnnUser_registerLink']
    .forEach(sel => document.querySelectorAll(sel).forEach(hide));

  // Demo/QA pages added to the menu after the original screenshots were taken.
  const NOISE = /^(DEMO2COL|DEMOERP|QA |SHOWCASE)/i;
  document.querySelectorAll('a').forEach(a => {
    const text = (a.textContent || '').trim().replace(/\\s+/g, ' ');
    if (NOISE.test(text)) hide(a.closest('li') || a);
  });

  for (const n of [document.documentElement, document.body]) {
    n.style.setProperty('padding-left', '0', 'important');
    n.style.setProperty('margin-left', '0', 'important');
  }

  const form = document.querySelector('form#Form');
  return JSON.stringify({
    formLeft: form ? Math.round(form.getBoundingClientRect().left) : null
  });
})()`;

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(outDir, '.p')}`, `--window-size=${width},${height}`, '--hide-scrollbars',
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1`, '--disable-features=DnsOverHttps',
    'about:blank'], { stdio: 'ignore' });

  try {
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    const ev = async (e) => (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value;

    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    // --- host login ---
    await cdp.call('Page.navigate', { url: SITE + '/Login' });
    await sleep(6000);
    for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('input[id$=\"txtUsername\"]')")) break; await sleep(500); }
    await ev(`(() => {
      const u = document.querySelector('input[id$="txtUsername"]');
      const p = document.querySelector('input[id$="txtPassword"]');
      if (!u || !p) return 'no-fields';
      u.value = ${JSON.stringify(USER)}; u.dispatchEvent(new Event('change', {bubbles:true}));
      p.value = ${JSON.stringify(PASS)}; p.dispatchEvent(new Event('change', {bubbles:true}));
      document.querySelector('[id$="cmdLogin"]').click();
      return 'clicked';
    })()`);
    await sleep(9000);

    for (const [slug, file] of SHOTS) {
      await cdp.call('Page.navigate', { url: `${SITE}/${slug}` });
      await sleep(7000);
      for (let i = 0; i < 40; i++) { if (await ev("document.readyState==='complete'")) break; await sleep(400); }
      // Wait for the renderer to hydrate; a shot taken mid-hydrate shows a bare skeleton.
      for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('.mf-field-group')")) break; await sleep(500); }
      await sleep(2500);
      const chrome = await ev(HIDE_CHROME);
      await sleep(600);

      const guard = await ev(`(() => {
        const w = document.querySelector('[class*="mf-form-wrapper"]');
        if (!w) return 'NO-FORM';
        const inner = w.querySelector(':scope > .mf-form-inner');
        if (!inner) return 'ok(no-inner)';
        const cs = getComputedStyle(inner);
        const painted = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0;
        return painted ? 'EXTRA-CARD-STILL-PRESENT' : 'ok';
      })()`);

      const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(outDir, file), Buffer.from(shot.data, 'base64'));
      console.log(`${file.padEnd(32)} ${slug.padEnd(20)} ${guard}  ${chrome}`);
    }

    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
