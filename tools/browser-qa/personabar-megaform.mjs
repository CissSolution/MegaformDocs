// Persona Bar QA: host login -> open the MegaForm panel -> probe it -> screenshot.
//
// usage: node personabar-megaform.mjs <outDir> <site> <user> <pass>
//
// Why a browser and not curl: the Persona Bar is a Knockout SPA living in an iframe
// (#personaBar-iframe). Its menu items, the AMD module load and the /API/personaBar
// calls all happen client-side, so the only honest verification is a real click.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const outDir = path.resolve(process.argv[2]);
const site = process.argv[3].replace(/\/$/, '');
const user = process.argv[4];
const pass = process.argv[5];

fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9384;
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

async function main() {
  const host = new URL(site).hostname;
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(outDir, '.p')}`, '--window-size=1440,1200', '--hide-scrollbars',
    // The QA hosts exist only in the Windows hosts file; Chrome's async DNS would NXDOMAIN them.
    `--host-resolver-rules=MAP ${host} 127.0.0.1`,
    '--disable-features=DnsOverHttps',
    'about:blank'], { stdio: 'ignore' });

  try {
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    const ev = async (e, awaitPromise = false) =>
      (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise })).result?.value;

    // --- host login ---
    await cdp.call('Page.navigate', { url: site + '/Login' });
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

    // --- the API, straight from the authenticated page ---
    // Proves routing + the MenuPermission gate independently of any UI wiring.
    const api = await ev(`(async () => {
      const r = await fetch('/API/personaBar/MegaForm/GetDashboard', { credentials: 'same-origin' });
      const text = await r.text();
      return r.status + ' ' + text.slice(0, 400);
    })()`, true);
    console.log('API GetDashboard:', api);

    const apiForms = await ev(`(async () => {
      const r = await fetch('/API/personaBar/MegaForm/GetForms?pageIndex=0&pageSize=5', { credentials: 'same-origin' });
      const text = await r.text();
      return r.status + ' ' + text.slice(0, 400);
    })()`, true);
    console.log('API GetForms:', apiForms);

    // A client asking for 9999 rows must come back capped, not with the whole portal.
    const clamp = await ev(`(async () => {
      const r = await fetch('/API/personaBar/MegaForm/GetForms?pageIndex=0&pageSize=9999', { credentials: 'same-origin' });
      const j = await r.json();
      return JSON.stringify({ status: r.status, pageSize: j.pageSize, returned: (j.items || []).length });
    })()`, true);
    console.log('API pageSize clamp:', clamp);

    // --- open the panel through the menu, the way a human does ---
    await cdp.call('Page.navigate', { url: site + '/' });
    await sleep(7000);

    const menu = await ev(`(() => {
      const f = document.getElementById('personaBar-iframe');
      if (!f || !f.contentDocument) return 'no-iframe';
      const d = f.contentDocument;
      const items = Array.from(d.querySelectorAll('[data-path]')).map(x => x.getAttribute('data-path'));
      return JSON.stringify({ paths: items });
    })()`);
    console.log('menu paths:', menu);

    const clicked = await ev(`(() => {
      const d = document.getElementById('personaBar-iframe').contentDocument;
      // Top-level group first (Content), then the MegaForm entry inside its hover menu.
      const group = d.querySelector(".btn_panel[id='Content']") || d.querySelector("[id='Content']");
      if (group) group.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const item = d.querySelector("li[data-path='MegaForm'] a, li[data-path='MegaForm'], [data-path='MegaForm']");
      if (!item) return 'no-megaform-item';
      item.click();
      return 'clicked';
    })()`);
    console.log('menu click:', clicked);
    await sleep(7000);

    // The hover fly-out stays open after a synthetic mouseover and would cover the
    // left third of the panel in the screenshot. Close it the way moving the mouse does.
    await ev(`(() => {
      const d = document.getElementById('personaBar-iframe').contentDocument;
      const group = d.querySelector(".btn_panel[id='Content']") || d.querySelector("[id='Content']");
      if (group) group.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      if (group) group.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      d.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 900, clientY: 600 }));
      return 'closed';
    })()`);
    await sleep(1500);

    const probe = await ev(`(() => {
      const d = document.getElementById('personaBar-iframe').contentDocument;
      const panel = d.querySelector('.mf-pb-body');
      if (!panel) return JSON.stringify({ panel: 'missing', panels: Array.from(d.querySelectorAll('.socialpanel')).map(p => p.id) });
      const stat = (k) => { const el = panel.querySelector('[data-mf-stat="' + k + '"]'); return el ? el.textContent.trim() : null; };
      const rows = Array.from(panel.querySelectorAll('.mf-pb-rows tr')).map(tr =>
        Array.from(tr.children).map(td => td.textContent.trim()).slice(0, 4));
      const alert = panel.querySelector('.mf-pb-alert');
      return JSON.stringify({
        panel: 'present',
        stats: { forms: stat('forms'), published: stat('publishedForms'), submissions: stat('submissions'), last: stat('lastSubmission') },
        rowCount: rows.length,
        firstRows: rows.slice(0, 3),
        alert: (alert && !alert.classList.contains('mf-pb-hidden')) ? alert.textContent.trim() : null,
        cssLoaded: !!Array.from(d.styleSheets).find(s => (s.href || '').indexOf('/MegaForm/css/MegaForm.css') >= 0),
        actionHrefs: Array.from(panel.querySelectorAll('.mf-pb-action')).slice(0, 2).map(a => a.className)
      });
    })()`);
    console.log('panel probe:', probe);

    // --- Add to page, driven through the panel exactly as an admin would ---
    // The Persona Bar cannot drag a form onto a pane (its panel is an iframe overlay and DNN's
    // drag-to-pane lives in the Edit Bar), so this picker is the supported equivalent. Driving
    // the real controls also exercises the antiforgery token that utility.sf.post attaches.
    const addFlow = await ev(`(async () => {
      const d = document.getElementById('personaBar-iframe').contentDocument;
      const w = document.getElementById('personaBar-iframe').contentWindow;
      const sleep = (ms) => new Promise(r => w.setTimeout(r, ms));
      const link = d.querySelector('.mf-pb-addto');
      if (!link) return 'no-add-link';
      link.click();
      await sleep(1800);
      const box = d.querySelector('.mf-pb-drop');
      if (!box) return 'picker-did-not-open';
      const first = box.querySelector('.mf-pb-pagelist button');
      if (!first) return 'no-pages-listed';
      const pageName = first.textContent.trim().slice(0, 40);
      first.click();
      await sleep(300);
      // Report where the popover actually landed relative to the link that opened it —
      // an absolutely positioned box with no positioned ancestor drifts silently.
      const panel = d.querySelector('.mf-pb-body');
      const bb = box.getBoundingClientRect(), lb = link.getBoundingClientRect(), pb = panel.getBoundingClientRect();
      w.__mfPop = JSON.stringify({
        boxTop: Math.round(bb.top), linkBottom: Math.round(lb.bottom),
        below: bb.top >= lb.bottom - 2,
        insidePanel: bb.left >= pb.left - 1 && bb.right <= pb.right + 1,
        boxLeft: Math.round(bb.left - pb.left), boxRight: Math.round(pb.right - bb.right)
      });
      const confirm = box.querySelector('.mf-pb-confirm');
      if (!confirm || confirm.disabled) return 'confirm-disabled';
      w.__mfHoldOpen = true;
      await sleep(200);
      confirm.click();
      await sleep(4000);
      const alert = d.querySelector('.mf-pb-alert');
      return JSON.stringify({
        placement: w.__mfPop,
        picked: pageName,
        pickerClosed: !d.querySelector('.mf-pb-drop'),
        result: alert && !alert.classList.contains('mf-pb-hidden') ? alert.textContent.trim().slice(0, 120) : null,
        success: !!(alert && alert.classList.contains('is-success'))
      });
    })()`, true);
    console.log('add-to-page:', addFlow);

    const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(outDir, 'personabar-megaform.png'), Buffer.from(shot.data, 'base64'));
    console.log('screenshot:', path.join(outDir, 'personabar-megaform.png'));

    // --- the hand-off actually lands on the builder, not a 404 ---
    const builderUrl = await ev(`(async () => {
      const r = await fetch('/API/personaBar/MegaForm/GetForms?pageIndex=0&pageSize=1', { credentials: 'same-origin' });
      const j = await r.json();
      return (j.items && j.items[0]) ? j.items[0].builderUrl : null;
    })()`, true);
    if (builderUrl) {
      await cdp.call('Page.navigate', { url: builderUrl });
      await sleep(9000);
      const landed = await ev(`JSON.stringify({
        href: location.href,
        title: document.title,
        builder: !!document.querySelector('[id*="mf-builder"], .mf-builder, #mfBuilderRoot, [data-mf-builder]'),
        megaformMarkup: document.body.innerHTML.indexOf('MegaForm') >= 0,
        notFound: document.body.innerText.indexOf('does not exist') >= 0
      })`);
      console.log('builder hand-off:', landed);
      const shot2 = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(outDir, 'personabar-megaform-builder.png'), Buffer.from(shot2.data, 'base64'));
    } else {
      console.log('builder hand-off: no form to test with');
    }

    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
