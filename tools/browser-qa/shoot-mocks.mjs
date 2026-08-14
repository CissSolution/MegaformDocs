#!/usr/bin/env node
/**
 * Photograph every mock BEFORE any conversion work, and record what it measures.
 *
 * A conversion that is only ever compared to a mock after the fact has no reference to fail
 * against. This builds that reference: one full-page shot and one shot of the form card alone for
 * every page under app/forms, plus the card's real width - which is the number that decides
 * whether a later comparison is even meaningful.
 *
 * The card is found the same way the diff harness finds it (innermost width-constrained ancestor of
 * the controls), so the reference and the comparison agree on what "the form" is.
 *
 *   node tools/browser-qa/shoot-mocks.mjs [--src "<path to form-builder-controls>"] [--out qa-out/mocks]
 *                                         [--only xmas-sale,newsletter] [--base http://localhost:3000/forms]
 */

import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { COLLECT_SRC } from './lib/mock-collect.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const SRC = arg('src', 'E:\\DNNDEFENDER AND AI DESIGNES\\AI DESIGNES\\form-builder-controls (10)');
const OUT = resolve(arg('out', 'qa-out/mocks'));
const BASE = arg('base', 'http://localhost:3000/forms');
const ONLY = (arg('only') || '').split(',').filter(Boolean);
const WIDTH = Number(arg('width', 1440));

const formsDir = join(SRC, 'app', 'forms');
if (!existsSync(formsDir)) { console.error('no such directory: ' + formsDir); process.exit(2); }

let slugs = readdirSync(formsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(formsDir, d.name, 'page.tsx')))
  .map((d) => d.name)
  .sort();
if (ONLY.length) slugs = slugs.filter((s) => ONLY.includes(s));

mkdirSync(OUT, { recursive: true });
console.log(`${slugs.length} mock(s) from ${formsDir}\n`);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1100 } });

// Hide anything fixed or sticky outside the card, or it paints over the card's own shot.
const HIDE = `() => {
  const root = document.querySelector('[data-mfqa-root]');
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (root && (el.contains(root) || root.contains(el))) continue;
    el.style.setProperty('visibility', 'hidden', 'important');
  }
}`;

const rows = [];
for (const slug of slugs) {
  const url = `${BASE}/${slug}`;
  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  let rec = { slug, url, ok: false };
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    const spec = await page.evaluate(`(${COLLECT_SRC})(null)`);
    await page.evaluate(`(${HIDE})()`);
    await page.screenshot({ path: join(dir, 'full.png'), fullPage: true });
    const card = await page.$('[data-mfqa-root]');
    if (card) await card.screenshot({ path: join(dir, 'card.png') });
    rec = {
      slug, url, ok: true, status: resp ? resp.status() : null,
      cardWidth: spec.root ? spec.root.w : null,
      cardHeight: spec.root ? spec.root.h : null,
      pageBg: spec.pageBg,
      keyed: spec.order ? spec.order.length : 0,
      painted: spec.struct ? spec.struct.length : 0,
    };
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec, null, 2));
    console.log(`ok   ${slug.padEnd(28)} card ${String(rec.cardWidth).padStart(5)}x${rec.cardHeight}  ${rec.keyed} keyed`);
  } catch (e) {
    rec.error = String(e).split('\n')[0];
    console.log(`FAIL ${slug.padEnd(28)} ${rec.error}`);
  }
  rows.push(rec);
  await page.close();
}

writeFileSync(join(OUT, 'mocks.json'), JSON.stringify(rows, null, 2));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const index = `<style>
*{box-sizing:border-box}body{margin:0;background:#0f1115;color:#e8ecf2;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{padding:24px}h1{margin:0 0 4px;font-size:20px}
.meta{color:#9aa6b8;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:18px}
.card{background:#171a21;border:1px solid #272c37;border-radius:10px;padding:10px}
.card .n{font-weight:700;margin-bottom:2px}
.card .w{color:#7dd3fc;font-size:12px;margin-bottom:8px}
.card img{width:100%;border-radius:6px;border:1px solid #272c37;background:#fff}
.bad{color:#fb7185}
</style><div class="wrap"><h1>Mock reference shots - ${rows.filter((r) => r.ok).length}/${rows.length}</h1>
<div class="meta">Taken before conversion. "card" is the form's own width-constrained container - the width any comparison must be made at.</div>
<div class="grid">
${rows.map((r) => `<div class="card">
  <div class="n">${esc(r.slug)}</div>
  <div class="w">${r.ok ? `card ${r.cardWidth}x${r.cardHeight}px &middot; ${r.keyed} keyed &middot; ${r.painted} painted` : `<span class="bad">${esc(r.error || 'failed')}</span>`}</div>
  ${r.ok ? `<a href="./${esc(r.slug)}/full.png"><img src="./${esc(r.slug)}/card.png"></a>` : ''}
</div>`).join('\n')}
</div></div>`;
writeFileSync(join(OUT, 'index.html'), index);

console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} shot -> ${join(OUT, 'index.html')}`);
await browser.close();
process.exit(rows.some((r) => !r.ok) ? 1 : 0);
