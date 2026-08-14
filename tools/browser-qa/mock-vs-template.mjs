#!/usr/bin/env node
/**
 * [MockDiff v2 20260807] Objective visual QA: measure the mock and the converted template, then
 * print the deltas.
 *
 * v1 matched elements by visible text and compared font and colour only. Its report was NOT
 * evidence of visual parity: it never looked at padding, margin, gap or position, and anything
 * without text - rules, dividers, hero bands, card frames - was invisible to it. v2 adds the three
 * checks that were missing:
 *
 *   1. box geometry per matched element, plus the vertical gap to the previous matched element
 *   2. a structure comparison that counts painted boxes, rules and controls on both sides
 *   3. a real per-pixel diff of the form region, after normalising our pane to the mock's card
 *      width - because comparing a 576px card against a 1184px pane is the one mistake that
 *      wastes a whole review pass
 *
 * The mock is the source of truth: its card element is found by its own width constraint
 * (Tailwind max-w-xl / max-w-md), not guessed.
 *
 * Usage:
 *   node tools/browser-qa/mock-vs-template.mjs \
 *        --mock http://localhost:3000/forms/xmas-sale \
 *        --page "http://megaclean008.ai/mfqa-wide?mfFormId=59" \
 *        --out qa-out/xmas-sale [--width 1440] [--our-root .mfp] [--no-normalise]
 *
 * Exit code 1 when anything differs beyond tolerance, so it can gate a commit.
 */

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { COLLECT_SRC } from './lib/mock-collect.mjs';
import { compareKeyed, compareStructure } from './lib/mock-compare.mjs';
import { diffPngs } from './lib/mock-bitmap.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);

const MOCK = arg('mock');
const PAGE = arg('page');
const OUT = arg('out', 'qa-out/mock-diff');
const WIDTH = Number(arg('width', 1440));
const HEIGHT = Number(arg('height', 1100));
const HOST_MAP = arg('host-map', 'megaclean008.ai');
const MOCK_ROOT = arg('mock-root', null);
const OUR_ROOT = arg('our-root', '.mfp');
const BITMAP_TOL = Number(arg('bitmap-tolerance', 28));
const NORMALISE = !flag('no-normalise');
// The templates no longer carry the mock's page chrome (owner, 2026-08-08): no back link, no page
// padding, no centring measure. To keep comparing like with like, the mock side can be told to
// hide the elements we deleted and to zero the padding on its own root before it is measured.
const MOCK_DROP = arg('mock-drop', null);          // comma-separated selectors
const MOCK_STRIP_PADDING = flag('mock-strip-padding');

if (!MOCK || !PAGE) { console.error('need --mock <url> --page <url>'); process.exit(2); }

const collect = (p, rootSel) => p.evaluate(`(${COLLECT_SRC})(${JSON.stringify(rootSel)})`);

/** Narrow our form pane to the mock's card width, inline so no stylesheet can outrank it. */
const NORMALISE_SRC = `(rootSel, target) => {
  const root = document.querySelector(rootSel);
  if (!root) return { error: 'no root' };
  const host = root.closest('.mf-form-wrapper') || root.parentElement || root;
  let got = root.getBoundingClientRect().width;
  let cap = target + (host.getBoundingClientRect().width - got);   // allow for the wrapper padding
  for (let i = 0; i < 4; i++) {
    host.style.setProperty('max-width', cap + 'px', 'important');
    host.style.setProperty('margin-left', 'auto', 'important');
    host.style.setProperty('margin-right', 'auto', 'important');
    got = root.getBoundingClientRect().width;
    if (Math.abs(target - got) < 1) break;
    cap += target - got;
  }
  return { host: host.id || String(host.className).split(' ')[0], cap: Math.round(cap), got: Math.round(got) };
}`;

/**
 * An element screenshot captures the element's BOX on the page, so a sticky site header sits on
 * top of it - the DNN skin's nav painted itself across the first 100px of our hero and went
 * straight into the bitmap diff. Hide anything fixed or sticky that is not part of the form.
 */
const HIDE_OVERLAY_SRC = `() => {
  const root = document.querySelector('[data-mfqa-root]');
  let n = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (root && (el.contains(root) || root.contains(el))) continue;
    el.style.setProperty('visibility', 'hidden', 'important');
    n++;
  }
  return n;
}`;

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: [`--host-resolver-rules=MAP ${HOST_MAP} 127.0.0.1`],
  });
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  mkdirSync(OUT, { recursive: true });

  async function open(url) {
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(1500);
    await p.waitForSelector('form, .mfp, main', { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(800);
    return p;
  }

  // ---- the mock, which is the reference ------------------------------------------------------
  console.log(`mock : ${MOCK}`);
  const mp = await open(MOCK);
  if (MOCK_DROP || MOCK_STRIP_PADDING) {
    const n = await mp.evaluate(`((sels, strip, rootSel) => {
      let hidden = 0;
      (sels || '').split(',').filter(Boolean).forEach((sel) => {
        document.querySelectorAll(sel.trim()).forEach((el) => { el.style.display = 'none'; hidden++; });
      });
      if (strip) {
        // the same rule the collector uses to find the card: innermost width-constrained ancestor
        let root = rootSel ? document.querySelector(rootSel) : null;
        if (!root) {
          const cands = [...document.querySelectorAll('main *')].filter((el) => {
            const cs = getComputedStyle(el);
            return cs.maxWidth !== 'none' && parseFloat(cs.maxWidth) > 300;
          });
          root = cands[cands.length - 1];
        }
        if (root) root.style.padding = '0px';
      }
      return hidden;
    })(${JSON.stringify(MOCK_DROP)}, ${MOCK_STRIP_PADDING}, ${JSON.stringify(MOCK_ROOT)})`);
    console.log(`       mock: ${n} element(s) hidden${MOCK_STRIP_PADDING ? ', root padding zeroed' : ''}`);
    await mp.waitForTimeout(300);
  }
  const mock = await collect(mp, MOCK_ROOT);
  if (mock.error) { console.error('mock: ' + mock.error); process.exit(2); }
  await mp.evaluate(`(${HIDE_OVERLAY_SRC})()`);
  const mockPng = await (await mp.$('[data-mfqa-root]')).screenshot();
  writeFileSync(join(OUT, 'mock.png'), mockPng);
  console.log(`       card ${mock.root.w}x${mock.root.h}, ${mock.order.length} keyed element(s)`);

  // ---- ours, normalised to the mock's card width ---------------------------------------------
  console.log(`page : ${PAGE}`);
  const op = await open(PAGE);
  const natural = await collect(op, OUR_ROOT);
  if (natural.error) { console.error('page: ' + natural.error); process.exit(2); }
  const naturalWidth = natural.root.w;

  let ours = natural;
  let capped = null;
  if (NORMALISE && naturalWidth !== mock.root.w) {
    // The mock caps its own card with max-width at a 1440 viewport, so do the same to ours rather
    // than shrinking the viewport - the SAME media queries stay live on both sides.
    //
    // An injected `.mfp{max-width:…!important}` sheet rule is NOT enough: the template's own
    // `.mfp.mfp-<slug>` rules are two classes and outrank it. Set it INLINE on the wrapper, which
    // no stylesheet can outrank, and correct once for the wrapper's own padding.
    capped = await op.evaluate(`(${NORMALISE_SRC})(${JSON.stringify(OUR_ROOT)}, ${mock.root.w})`);
    await op.waitForTimeout(500);
    ours = await collect(op, OUR_ROOT);
  }
  const hidden = await op.evaluate(`(${HIDE_OVERLAY_SRC})()`);
  const oursPng = await (await op.$('[data-mfqa-root]')).screenshot();
  writeFileSync(join(OUT, 'template.png'), oursPng);
  console.log(`       pane ${naturalWidth}px natural -> ${ours.root.w}px compared, ${ours.order.length} keyed element(s), ${hidden} overlay(s) hidden`);

  // ---- compare --------------------------------------------------------------------------------
  const rows = compareKeyed(mock, ours);
  const structure = compareStructure(mock, ours);
  const matched = mock.order.filter((k) => ours.keyed[k]);
  const onlyMock = mock.order.filter((k) => !ours.keyed[k]);
  const onlyOurs = ours.order.filter((k) => !mock.keyed[k]);

  const blank = await ctx.newPage();
  await blank.goto('about:blank');
  const bitmap = await diffPngs(blank, mockPng, oursPng, BITMAP_TOL);
  if (bitmap.buffer) { writeFileSync(join(OUT, 'diff.png'), bitmap.buffer); delete bitmap.buffer; }

  const widthGap = naturalWidth - mock.root.w;
  const report = {
    mock: MOCK, page: PAGE, viewport: `${WIDTH}x${HEIGHT}`,
    cardWidth: { mock: mock.root.w, oursNatural: naturalWidth, comparedAt: ours.root.w, delta: widthGap, normalised: capped },
    pageBg: { mock: mock.pageBg, ours: ours.pageBg },
    matched: matched.length, differing: rows.length,
    bitmap, structure,
    onlyInMock: onlyMock.slice(0, 40), onlyInTemplate: onlyOurs.slice(0, 40),
    rows,
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  // Raw collector output for both sides: report.json only keeps rows that DIFFER, so without this
  // there is no way to ask "how wide is that element on each side" when chasing a few-px offset.
  writeFileSync(join(OUT, 'mock.nodes.json'), JSON.stringify(mock, null, 1));
  writeFileSync(join(OUT, 'ours.nodes.json'), JSON.stringify(ours, null, 1));

  // ---- print ----------------------------------------------------------------------------------
  console.log(`\nmatched ${matched.length} element(s) by text; ${rows.length} differ beyond tolerance`);
  rows.slice(0, 40).forEach((r) => console.log(`  ~ ${r.key}\n      ${r.diffs.join('\n      ')}`));
  if (widthGap) console.log(`\n! card width: mock ${mock.root.w}px, ours ${naturalWidth}px natural (delta ${widthGap})`);
  if (structure.roleCounts.length) {
    console.log('\nstructure - painted elements that do not tally:');
    structure.roleCounts.forEach((c) => console.log(`  ${c.role.padEnd(14)} mock ${c.mock}  ours ${c.ours}`));
  }
  if (structure.missingText.length) console.log(`\ncopy in MOCK not found in ours (${structure.missingText.length}):\n  ${structure.missingText.slice(0, 12).join(' / ')}`);
  if (structure.extraText.length) console.log(`\ncopy in OURS not in the mock (${structure.extraText.length}):\n  ${structure.extraText.slice(0, 12).join(' / ')}`);
  console.log(`\nbitmap: ${bitmap.mismatch}% of ${bitmap.width}x${bitmap.comparedHeight} differs (mock ${bitmap.mockHeight}px vs ours ${bitmap.oursHeightScaled}px scaled)`);
  console.log(`shots + report -> ${OUT}`);

  await browser.close();
  const failed = rows.length || onlyMock.length || structure.roleCounts.length || widthGap;
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
