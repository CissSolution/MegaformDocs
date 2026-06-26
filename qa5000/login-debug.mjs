import { launch, BASE, OUT } from './lib.mjs';
import { join } from 'node:path';

const { browser, page } = await launch(true);
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT, 'login-page.png'), fullPage: true });
  const dom = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map(i => ({ id: i.id, name: i.name, type: i.type, ph: i.placeholder }));
    const buttons = [...document.querySelectorAll('button,a.btn,input[type=submit]')].map(b => ({ tag: b.tagName, id: b.id, cls: b.className, text: (b.textContent || b.value || '').trim().slice(0, 40) }));
    return { url: location.href, title: document.title, inputs, buttons, bodyLen: document.body.innerHTML.length };
  });
  console.log(JSON.stringify(dom, null, 2));
  // Probe a few "current user" endpoints anonymously to learn shape/route.
  const probes = await page.evaluate(async () => {
    const urls = ['/api/User/current', '/api/User/0', '/api/Site/1'];
    const out = {};
    for (const u of urls) {
      try { const r = await fetch(u, { credentials: 'same-origin' }); out[u] = r.status; } catch (e) { out[u] = 'ERR ' + (e.message || e); }
    }
    return out;
  });
  console.log('PROBES', JSON.stringify(probes));
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }
