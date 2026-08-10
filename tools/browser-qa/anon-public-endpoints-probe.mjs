// The two endpoints an anonymous visitor MUST keep: form submit and file upload.
//
// Run before and after any authorization change. Each is probed with a body the handler itself
// rejects, so nothing is submitted and nothing is stored - the point is the STATUS:
//   400 (or any handler-level error) = still reachable anonymously  -> good
//   401 / 403                        = the lockdown reached too far -> revert
//
//   node tools/browser-qa/anon-public-endpoints-probe.mjs [site] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const outDir = path.resolve(process.argv[3] || 'qa-out/anon-endpoints');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();          // no cookies: a stranger
const page = await ctx.newPage();
await page.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });

const results = await page.evaluate(async () => {
  const api = '/DesktopModules/MegaForm/API/';
  const out = [];
  const probe = async (name, url, init) => {
    try {
      const r = await fetch(url, init);
      out.push({ name, status: r.status, body: (await r.text()).slice(0, 140).replace(/\s+/g, ' ') });
    } catch (e) { out.push({ name, status: -1, body: String(e && e.message).slice(0, 140) }); }
  };
  // GET the public schema an anonymous renderer needs
  await probe('Submit/Schema', api + 'Submit/Schema?formId=223', { credentials: 'include' });
  // POST with an empty body: the handler validates and rejects; nothing is stored
  await probe('Submit/Post', api + 'Submit/Post', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  // POST with no multipart payload: rejected at the handler; nothing is written
  await probe('Upload/File', api + 'Upload/File', { method: 'POST', credentials: 'include', body: new FormData() });
  await probe('Upload/Captcha', api + 'Upload/Captcha', { credentials: 'include' });
  return out;
});

fs.writeFileSync(path.join(outDir, 'anon-endpoints.json'), JSON.stringify({ site, results }, null, 2));
console.log(`\nanonymous, at ${site}`);
let locked = 0;
for (const r of results) {
  const verdict = (r.status === 401 || r.status === 403) ? '  <<< LOCKED OUT' : '';
  if (verdict) locked++;
  console.log(`  ${String(r.status).padEnd(5)} ${r.name.padEnd(16)} ${r.body}${verdict}`);
}
console.log(`\n${locked} public endpoint(s) locked out.${locked ? ' REVERT.' : ''}`);
await browser.close();
