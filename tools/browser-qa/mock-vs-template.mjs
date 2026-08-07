#!/usr/bin/env node
/**
 * [MockDiff v20260807] Objective visual QA: measure the mock and the converted template, then
 * print the deltas.
 *
 * Why not a raw pixel diff. The two pages are different DOMs on different hosts — the DNN page
 * carries site chrome the mock does not, the markup differs, and a bitmap subtraction of the two
 * would be 100% "different" while telling you nothing about WHAT to fix. What actually converges
 * a conversion on its design is per-element geometry and colour, so this matches elements across
 * the two pages BY THEIR VISIBLE TEXT (the copy is identical on both sides by construction) and
 * reports the numeric differences: width, height, font size, weight, colour, background.
 *
 * It also writes both screenshots side by side so the remaining judgement calls can be eyeballed.
 *
 * Usage:
 *   node tools/browser-qa/mock-vs-template.mjs \
 *        --mock http://localhost:3000/forms/xmas-sale \
 *        --page http://megaclean008.ai/mf-xmas-sale \
 *        --out qa-out/xmas-sale [--width 1440] [--tolerance 2]
 *
 * Exit code is 1 when any compared element differs beyond tolerance, so it can gate a commit.
 */

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const args = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const MOCK = arg('mock');
const PAGE = arg('page');
const OUT = arg('out', 'qa-out/mock-diff');
const WIDTH = Number(arg('width', 1440));
const HEIGHT = Number(arg('height', 1100));
const TOL = Number(arg('tolerance', 2));
const HOST_MAP = arg('host-map', 'megaclean008.ai');

if (!MOCK || !PAGE) {
  console.error('need --mock <url> --page <url>');
  process.exit(2);
}

// Collected in the browser. Keyed by normalised visible text so the same label can be found on
// both sides regardless of how each page nests it.
const COLLECT = `() => {
  const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();

  // Colours must be normalised IN THE PAGE. Tailwind v4 emits oklab(), which Chrome reports
  // verbatim from getComputedStyle, so "oklab(0.999994 … / 0.7)" and "rgba(255,255,255,0.7)" are
  // the same colour and compared as different — three of the first run's differences were this
  // false positive. A 1x1 canvas fill is the one conversion that handles every colour space the
  // browser itself understands.
  const cvs = document.createElement('canvas'); cvs.width = 1; cvs.height = 1;
  const cx = cvs.getContext('2d', { willReadFrequently: true });
  const colourCache = {};
  const toRgba = (value) => {
    const v = String(value || '');
    if (!v || v === 'none') return v;
    if (colourCache[v]) return colourCache[v];
    let out = v;
    try {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = v;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      out = 'rgba(' + d[0] + ', ' + d[1] + ', ' + d[2] + ', ' + (Math.round((d[3] / 255) * 100) / 100) + ')';
    } catch (e) { out = v; }
    colourCache[v] = out;
    return out;
  };
  const out = {};
  const seen = new Set();
  const els = Array.from(document.querySelectorAll('h1,h2,h3,label,span,div,p,button,a,input,select,textarea'));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;

    // Own text only: a wrapper repeating its child's text would otherwise win the key.
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    let key = norm(own);
    if (!key && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      key = 'placeholder:' + norm(el.getAttribute('placeholder'));
    }
    if (!key && el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      key = 'select:' + norm(o ? o.textContent : '');
    }
    if (!key || key.length < 2 || key.length > 60) continue;
    if (seen.has(key)) { out[key] = null; continue; }   // ambiguous -> drop
    seen.add(key);
    out[key] = {
      tag: el.tagName.toLowerCase(),
      w: Math.round(r.width), h: Math.round(r.height),
      fontSize: Math.round(parseFloat(cs.fontSize) * 10) / 10,
      fontWeight: cs.fontWeight,
      color: toRgba(cs.color),
      bg: toRgba(cs.backgroundColor),
      radius: cs.borderTopLeftRadius,
      transform: cs.textTransform,
      letter: cs.letterSpacing,
    };
  }
  Object.keys(out).forEach((k) => { if (!out[k]) delete out[k]; });
  return out;
}`;

const rgb = (s) => {
  const m = String(s || '').match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const colourDelta = (a, b) => {
  const x = rgb(a); const y = rgb(b);
  if (!x || !y) return a === b ? 0 : 999;
  if (x.a === 0 && y.a === 0) return 0;
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
};

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: [`--host-resolver-rules=MAP ${HOST_MAP} 127.0.0.1`],
  });
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });

  async function measure(url, shotPath, clip) {
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
    // The renderer builds the shell after boot; give it a moment and wait for a form to exist.
    await p.waitForTimeout(1500);
    await p.waitForSelector('form, .mfp, main', { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(800);
    // Invoked, not passed: page.evaluate treats a bare "() => {…}" string as an EXPRESSION, which
    // evaluates to a function object, is not serialisable, and comes back as undefined.
    const data = await p.evaluate(`(${COLLECT})()`);
    mkdirSync(dirname(shotPath), { recursive: true });
    const target = clip ? await p.$(clip) : null;
    if (target) await target.screenshot({ path: shotPath }).catch(() => p.screenshot({ path: shotPath, fullPage: true }));
    else await p.screenshot({ path: shotPath, fullPage: true });
    await p.close();
    return data;
  }

  console.log(`mock : ${MOCK}`);
  const mock = await measure(MOCK, join(OUT, 'mock.png'), null);
  console.log(`page : ${PAGE}`);
  const ours = await measure(PAGE, join(OUT, 'template.png'), '.mfp');

  const keys = Object.keys(mock).filter((k) => Object.prototype.hasOwnProperty.call(ours, k));
  const onlyMock = Object.keys(mock).filter((k) => !ours[k]);
  const onlyOurs = Object.keys(ours).filter((k) => !mock[k]);

  const rows = [];
  for (const k of keys) {
    const a = mock[k]; const b = ours[k];
    const diffs = [];
    if (Math.abs(a.fontSize - b.fontSize) > 0.6) diffs.push(`font ${a.fontSize}->${b.fontSize}`);
    if (String(a.fontWeight) !== String(b.fontWeight)) diffs.push(`weight ${a.fontWeight}->${b.fontWeight}`);
    if (colourDelta(a.color, b.color) > 12) diffs.push(`colour ${a.color} -> ${b.color}`);
    if (colourDelta(a.bg, b.bg) > 12) diffs.push(`bg ${a.bg} -> ${b.bg}`);
    if (a.transform !== b.transform) diffs.push(`case ${a.transform}->${b.transform}`);
    if (Math.abs(a.h - b.h) > Math.max(TOL, a.h * 0.15)) diffs.push(`height ${a.h}->${b.h}`);
    if (diffs.length) rows.push({ key: k, diffs });
  }

  const report = {
    mock: MOCK, page: PAGE, viewport: `${WIDTH}x${HEIGHT}`,
    matched: keys.length, differing: rows.length,
    onlyInMock: onlyMock.slice(0, 40), onlyInTemplate: onlyOurs.slice(0, 40),
    rows,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  console.log(`\nmatched ${keys.length} element(s) by text; ${rows.length} differ beyond tolerance`);
  rows.slice(0, 30).forEach((r) => console.log(`  ~ ${r.key}\n      ${r.diffs.join(' | ')}`));
  if (onlyMock.length) console.log(`\nin MOCK but not in the template (${onlyMock.length}):\n  ${onlyMock.slice(0, 18).join(' / ')}`);
  if (onlyOurs.length) console.log(`\nin TEMPLATE but not in the mock (${onlyOurs.length}):\n  ${onlyOurs.slice(0, 18).join(' / ')}`);
  console.log(`\nshots + report -> ${OUT}`);

  await browser.close();
  process.exit(rows.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
