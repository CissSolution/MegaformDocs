// Live gallery walk on an Oqtane site: login -> Form Dashboard -> Create Form wizard
// -> template gallery -> open premium preview. Screenshots each step.
// usage: node verify-live-gallery.mjs <baseUrl> <user> <pass> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const [baseUrl, user, pass, outDirArg] = process.argv.slice(2);
const outDir = path.resolve(outDirArg);
fs.mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9351;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpJson(url) { return new Promise((res, rej) => http.get(url, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej)); }
function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': Buffer.from(String(Math.random())).toString('base64'), 'Sec-WebSocket-Version': 13 } });
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
  const chrome = spawn(CHROME, [`--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu', `--user-data-dir=${path.join(outDir, '.profile')}`, '--window-size=1440,1000', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 40 && !targets; i++) { try { targets = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const page = targets.find((t) => t.type === 'page');
    const cdp = await wsConnect(page.webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    const evalJs = async (expr) => (await cdp.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
    const shot = async (name, h) => {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: h || Math.min(Math.max(await evalJs('document.body.scrollHeight') || 1000, 900), 4000), deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      const s = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(s.data, 'base64'));
      console.log('shot', name);
    };
    const clickByText = (txt, tag) => evalJs(`(function(){
      const els=[...document.querySelectorAll('${tag || 'button,a,[role=button],.btn'}')];
      const el=els.find(e=>e.offsetParent && (e.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase().includes(${JSON.stringify(txt.toLowerCase())}));
      if(!el) return 'NOT-FOUND: ${txt}';
      el.scrollIntoView({block:'center'}); el.click(); return 'CLICKED: '+((el.textContent||'').trim().slice(0,60));
    })()`);

    // login
    await cdp.call('Page.navigate', { url: baseUrl + '/login' }); await sleep(6000);
    console.log('login:', await evalJs(`(async function(){
      function setVal(el,v){const d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');d.set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
      const p=document.querySelector('input[type=password]'); if(!p) return 'NO-PASSWORD';
      const scope=p.closest('form')||document; const u=scope.querySelector('input[type=text]'); if(!u) return 'NO-USERNAME';
      setVal(u,${JSON.stringify(user)}); setVal(p,${JSON.stringify(pass)});
      await new Promise(r=>setTimeout(r,300));
      const btn=[...document.querySelectorAll('button')].find(b=>/login/i.test(b.textContent)); btn.click(); return 'OK';
    })()`));
    await sleep(6000);

    console.log(await clickByText('form dashboard')); await sleep(5000); await shot('02-dashboard');
    // dashboard "Create Form" opens the wizard
    let r = await clickByText('create form');
    if (String(r).startsWith('NOT-FOUND')) r = await clickByText('new form');
    if (String(r).startsWith('NOT-FOUND')) r = await clickByText('create');
    console.log(r); await sleep(4000); await shot('03-wizard');
    // template gallery: setup step shows library; try "browse"/"gallery"/"template"
    r = await clickByText('browse all');
    if (String(r).startsWith('NOT-FOUND')) r = await clickByText('gallery');
    if (String(r).startsWith('NOT-FOUND')) r = await clickByText('template');
    console.log(r); await sleep(5000); await shot('04-gallery', 3200);
    // open a premium preview: search box narrows the grid, then click the card's preview (eye) button
    r = await evalJs(`(function(){
      const inp=[...document.querySelectorAll('input')].find(i=>/search template/i.test(i.placeholder||'')&&i.offsetParent);
      if(!inp) return 'NO-SEARCH';
      const d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
      d.set.call(inp,'tabbed'); inp.dispatchEvent(new Event('input',{bubbles:true})); return 'SEARCHED';
    })()`);
    console.log('search:', r); await sleep(2500);
    r = await evalJs(`(function(){
      const all=[...document.querySelectorAll('*')].filter(e=>e.children.length<12 && /tabbed account/i.test(e.textContent||'') && e.offsetParent);
      const card=all.map(e=>e.closest('[class*=card],[class*=tpl],[class*=item]')).filter(Boolean)[0];
      if(!card) return 'NO-CARD';
      card.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); card.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));
      const btns=[...card.querySelectorAll('button')];
      const eye=btns.find(b=>/preview|eye/i.test(b.className+' '+(b.title||'')+' '+(b.getAttribute('aria-label')||''))) || btns.find(b=>b.querySelector('.fa-eye'));
      if(eye){ eye.click(); return 'EYE-CLICKED'; }
      return 'NO-EYE btns='+btns.map(b=>(b.className||'').slice(0,30)).join('|');
    })()`);
    console.log('preview click:', r); await sleep(6000); await shot('05-preview', 2400);
    console.log('url:', await evalJs('location.href'));
  } finally { try { chrome.kill(); } catch { } }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
