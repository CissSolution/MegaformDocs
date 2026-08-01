// Card-in-card probe: walk the rendered form shell and report what actually paints a card.
//
// usage: node card-probe.mjs <outDir> <url> [width] [hostMap]
//   hostMap: "site.ai" when the host only exists in the Windows hosts file.
//
// Prints, for every element from .mf-form-wrapper down to the first fields, the computed
// background / border / radius / shadow plus its rect — so "which box draws the extra card"
// is measured, never inferred from markup.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const outDir = path.resolve(process.argv[2]);
// Comma-separated: one browser, many pages — a regression sweep should not pay 20s of
// Chrome startup per template.
const urls = process.argv[3].split(',').map((s) => s.trim()).filter(Boolean);
const width = parseInt(process.argv[4], 10) || 1440;
const hostMap = process.argv[5] || '';
// Optional: a CSS file injected before measuring. Lets a candidate fix be proven against the
// real broken page before anything is deployed.
const injectCssPath = process.argv[6] || '';
// Optional host login — the showcase pages on megademo.ai bounce anonymous visitors to /Login.
const user = process.argv[7] || '';
const pass = process.argv[8] || '';

fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9386;
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

const PROBE = `(() => {
  const wrapper = document.querySelector('[class*="mf-form-wrapper"]');
  if (!wrapper) return JSON.stringify({ error: 'no .mf-form-wrapper' });

  const paints = (cs) => {
    const bg = cs.backgroundColor;
    const opaque = bg && bg !== 'transparent' && !/rgba\\(0,\\s*0,\\s*0,\\s*0\\)/.test(bg);
    const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    const shadowed = cs.boxShadow && cs.boxShadow !== 'none';
    return opaque || bordered || shadowed;
  };

  const rows = [];
  const walk = (el, depth) => {
    if (depth > 8) return;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    rows.push({
      depth: depth,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).trim().slice(0, 120),
      paintsCard: paints(cs),
      bg: cs.backgroundColor,
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      radius: cs.borderTopLeftRadius,
      shadow: (cs.boxShadow || 'none').slice(0, 60),
      padTop: cs.paddingTop,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    });
    for (const child of el.children) {
      if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue;
      walk(child, depth + 1);
      // One representative branch is enough; the card chain is the first painted path.
      if (rows.length > 40) return;
    }
  };
  walk(wrapper, 0);

  // The gap the user circled: distance between the outer painted box's top and the next one.
  const painted = rows.filter(r => r.paintsCard);
  const gap = painted.length >= 2 ? (painted[1].rect.y - painted[0].rect.y) : null;

  // The flags that decide whether the standard card chrome is stripped off
  // .mf-form-inner. If the shell is premium but none of these are set, the wrapper
  // paints its own card underneath the template's card.
  const attrs = {};
  for (const a of wrapper.attributes) attrs[a.name] = a.value.slice(0, 200);
  const mfp = wrapper.querySelector('[class*="mfp-"]');

  return JSON.stringify({
    url: location.href,
    viewport: window.innerWidth,
    wrapperAttrs: attrs,
    mfpClass: mfp ? String(mfp.className).slice(0, 160) : null,
    paintedBoxes: painted.map(p => ({ cls: p.cls, id: p.id, bg: p.bg, border: p.border, radius: p.radius, rect: p.rect })),
    emptyStripPx: gap,
    chain: rows
  });
})()`;

async function main() {
  const args = [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(outDir, '.p')}`, `--window-size=${width},1200`, '--hide-scrollbars',
    '--disable-features=DnsOverHttps'
  ];
  if (hostMap) args.push(`--host-resolver-rules=MAP ${hostMap} 127.0.0.1`);
  args.push('about:blank');
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });

  try {
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    // awaitPromise so an async probe expression resolves instead of returning a bare Promise
    // (a silent empty result, which reads exactly like "the page had nothing to report").
    const ev = async (e) => (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 1200, deviceScaleFactor: 1, mobile: false });
    const css = injectCssPath ? fs.readFileSync(injectCssPath, 'utf8') : null;

    if (user) {
      const origin = new URL(urls[0]).origin;
      await cdp.call('Page.navigate', { url: origin + '/Login' });
      await sleep(6000);
      for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('input[id$=\"txtUsername\"]')")) break; await sleep(500); }
      await ev(`(() => {
        const u = document.querySelector('input[id$="txtUsername"]');
        const p = document.querySelector('input[id$="txtPassword"]');
        if (!u || !p) return 'no-fields';
        u.value = ${JSON.stringify(user)}; u.dispatchEvent(new Event('change', {bubbles:true}));
        p.value = ${JSON.stringify(pass)}; p.dispatchEvent(new Event('change', {bubbles:true}));
        document.querySelector('[id$="cmdLogin"]').click();
        return 'clicked';
      })()`);
      await sleep(9000);
      console.log('session:', await ev("document.body.innerHTML.indexOf('/ctl/Logoff') >= 0 ? 'authenticated' : 'anonymous'"));
    }

    for (const url of urls) {
      await cdp.call('Page.navigate', { url });
      await sleep(7000);
      for (let i = 0; i < 40; i++) { if (await ev("document.readyState==='complete'")) break; await sleep(400); }
      // The renderer hydrates after load; wait for fields to exist before measuring.
      for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('.mf-field-group, .mfp-card, .mf-fields-container')")) break; await sleep(500); }
      await sleep(2000);

      if (css) {
        await ev(`(() => {
          const s = document.createElement('style');
          s.id = 'mf-card-probe-inject';
          s.textContent = ${JSON.stringify(css)};
          document.head.appendChild(s);
          return 'injected';
        })()`);
        await sleep(800);
      }

      // A logged-in host sees the Persona Bar and the edit chrome; a marketing screenshot
      // must not. Hiding them here keeps the shot identical to what a visitor gets.
      if (user) {
        await ev(`(() => {
          const kill = ['#personabar-wrap', '#personaBar-iframe', '.dnn-edit-bar', '#EditBar',
                        '#personaBar-loadingbar', '.personabar', '#dnn-edit-bar'];
          kill.forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; }));
          document.documentElement.style.paddingLeft = '0';
          document.body.style.paddingLeft = '0';
          document.body.style.marginLeft = '0';
          return 'chrome-hidden';
        })()`);
        await sleep(400);
      }

      // MF_PROBE_EXPR lets a one-off question be asked against the same logged-in,
      // fully-hydrated page without writing another driver.
      const out = await ev(process.env.MF_PROBE_EXPR || PROBE);
      // The query string is part of the identity here — several probes differ only by
      // ?formId=, and naming by pathname alone made them overwrite each other.
      const u = new URL(url);
      const name = (u.pathname + u.search).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page';
      fs.writeFileSync(path.join(outDir, name + '.json'), out || '{}');
      console.log('###', name, out);

      const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(shot.data, 'base64'));
    }

    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
