#!/usr/bin/env node
/**
 * Build a side-by-side comparison sheet per template, plus one index page for the whole batch.
 *
 * The batch run already writes mock.png, template.png and diff.png at the SAME width (our pane is
 * normalised to the mock's card width), so they can be laid next to each other honestly. This
 * turns that into something a person can look at, with the mock URL and the live URL printed on
 * the sheet so there is never a question about what is being compared to what.
 *
 *   node tools/browser-qa/make-compare-sheets.mjs [--out qa-out/batch3]
 */

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(arg('out', 'qa-out/batch3'));
const SITE = arg('site', 'http://megaclean008.ai');
const MOCK_BASE = arg('mock-base', 'http://localhost:3000/forms');

// PowerShell 5.1's ConvertTo-Json unwraps a single-element array into a bare object, so a
// one-template iteration writes {…} where the batch writes [{…}].
const parsed = JSON.parse(readFileSync(join(OUT, 'summary.json'), 'utf8').replace(/^﻿/, ''));
const summary = Array.isArray(parsed) ? parsed : [parsed];

// Review page slugs where one exists; otherwise the scratch page, which exists for every form.
const REVIEW_PAGE = {
  'xmas-sale': '/mf-xmas-sale', 'xmas-newsletter': '/mf-xmas-newsletter',
  'agency-flyer': '/mf-agency-flyer', 'first-book': '/mf-first-book',
  'gold-suite': '/mf-gold-suite', 'rose-wellness': '/mf-rose-wellness',
};

const CSS = `
*{box-sizing:border-box} body{margin:0;background:#0f1115;color:#e8ecf2;
  font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{padding:24px}
h1{margin:0 0 4px;font-size:20px;letter-spacing:-.01em}
.meta{color:#9aa6b8;font-size:12px;margin-bottom:2px}
.meta b{color:#e8ecf2;font-weight:600}
.stats{display:flex;gap:18px;margin:12px 0 18px;flex-wrap:wrap}
.stat{background:#171a21;border:1px solid #272c37;border-radius:8px;padding:8px 12px}
.stat .k{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8b97a9}
.stat .v{font-size:17px;font-weight:700}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
.col{background:#171a21;border:1px solid #272c37;border-radius:10px;overflow:hidden}
.col h2{margin:0;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.1em;
  background:#1f2430;border-bottom:1px solid #272c37;color:#cbd4e1;font-weight:700}
.col h2 span{float:right;text-transform:none;letter-spacing:0;color:#8b97a9;font-weight:400}
.col img{display:block;width:100%;height:auto}
.ok{color:#4ade80}.bad{color:#fb7185}.warn{color:#fbbf24}
`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sheetHtml(r, mockUrl, liveUrl) {
  const grade = r.bitmap == null ? 'warn' : (r.bitmap < 8 ? 'ok' : (r.bitmap < 20 ? 'warn' : 'bad'));
  return `<style>${CSS}</style><div class="wrap">
<h1>${esc(r.slug)} <span style="color:#8b97a9;font-weight:400">— form ${r.form}</span></h1>
<div class="meta">MOCK &nbsp;<b>${esc(mockUrl)}</b></div>
<div class="meta">LIVE &nbsp;<b>${esc(liveUrl)}</b></div>
<div class="stats">
  <div class="stat"><div class="k">matched</div><div class="v">${r.matched ?? '-'}</div></div>
  <div class="stat"><div class="k">differing</div><div class="v ${r.differing ? 'bad' : 'ok'}">${r.differing ?? '-'}</div></div>
  <div class="stat"><div class="k">pixels differ</div><div class="v ${grade}">${r.bitmap ?? '-'}%</div></div>
  <div class="stat"><div class="k">card width</div><div class="v">${r.cardMock ?? '-'}px</div></div>
  <div class="stat"><div class="k">copy missing</div><div class="v ${r.missingCopy ? 'warn' : 'ok'}">${r.missingCopy ?? '-'}</div></div>
</div>
<div class="cols">
  <div class="col"><h2>Mock <span>reference</span></h2><img src="./mock.png"></div>
  <div class="col"><h2>Template <span>normalised to ${r.cardMock ?? '?'}px</span></h2><img src="./template.png"></div>
  <div class="col"><h2>Pixel diff <span>red = differs</span></h2><img src="./diff.png"></div>
</div></div>`;
}

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const cards = [];
for (const r of summary) {
  const dir = join(OUT, r.slug);
  if (!existsSync(join(dir, 'mock.png')) || !existsSync(join(dir, 'template.png'))) {
    console.log(`skip ${r.slug} — no shots`);
    continue;
  }
  const mockUrl = `${MOCK_BASE}/${r.mock}`;
  const liveUrl = `${SITE}${REVIEW_PAGE[r.slug] || `/mfqa-wide?mfFormId=${r.form}`}`;
  writeFileSync(join(dir, 'compare.html'), sheetHtml(r, mockUrl, liveUrl));
  await page.goto(pathToFileURL(join(dir, 'compare.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(dir, 'compare.png'), fullPage: true });
  console.log(`ok   ${r.slug} -> ${join(dir, 'compare.png')}`);
  cards.push({ r, mockUrl, liveUrl });
}

const index = `<style>${CSS}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:#171a21;border:1px solid #272c37;border-radius:10px;padding:12px}
.card a{color:#7dd3fc;text-decoration:none;font-size:12px;word-break:break-all}
.card img{width:100%;border-radius:6px;margin-top:8px;border:1px solid #272c37}
.name{font-weight:700;margin-bottom:6px}
</style><div class="wrap"><h1>Mock vs template — ${cards.length} form(s)</h1>
<div class="meta">Each sheet shows the mock, our template normalised to the mock's card width, and the per-pixel diff.</div>
<div class="grid" style="margin-top:18px">
${cards.map(({ r, mockUrl, liveUrl }) => `<div class="card">
  <div class="name">${esc(r.slug)} — form ${r.form} <span class="${r.bitmap < 8 ? 'ok' : (r.bitmap < 20 ? 'warn' : 'bad')}">${r.bitmap}% px</span></div>
  <div class="meta">mock <a href="${esc(mockUrl)}">${esc(mockUrl)}</a></div>
  <div class="meta">live <a href="${esc(liveUrl)}">${esc(liveUrl)}</a></div>
  <a href="./${esc(r.slug)}/compare.png"><img src="./${esc(r.slug)}/diff.png"></a>
</div>`).join('\n')}
</div></div>`;
writeFileSync(join(OUT, 'index.html'), index);
console.log(`\nindex -> ${join(OUT, 'index.html')}`);

await browser.close();
