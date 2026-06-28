// [2026-06-28] Pixel polish: chips/cards must have a SINGLE clean border on hover + selected
// (the old box-shadow ring stacked on the 1px border = a doubled border). Verify the ring is
// gone (no "0px 0px 0px Npx" inset/ring in box-shadow) on mouse hover + selected, + screenshot.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };
const FORM_ID = process.argv[2] || '35'; // a form that has both a Chips and a Cards field

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  // Render page = full ANON form; fresh context picks up the new CSS regardless of ?v cache.
  await page.goto(`${BASE}/api/MegaForm/render/${FORM_ID}`, { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(1800);
  ok('cards group present', await page.$('.mf-option-group--cards') !== null);
  ok('chips group present', await page.$('.mf-option-group--chips') !== null);

  // Select a card (2nd) + a chip (2nd), and hover the 1st card.
  const res = await page.evaluate(() => {
    const ring = (bs) => /\b0px 0px 0px [1-9]\d*px\b/.test(bs || ''); // a solid-colour ring/inset
    const cards = Array.from(document.querySelectorAll('.mf-option-group--cards .mf-option-item'));
    const chips = Array.from(document.querySelectorAll('.mf-option-group--chips .mf-option-item'));
    // selected
    cards[1]?.querySelector('.mf-option-control')?.click();
    chips[1]?.querySelector('.mf-option-control')?.click();
    const selCardUi = cards[1]?.querySelector('.mf-option-ui');
    const selChipUi = chips[1]?.querySelector('.mf-option-ui');
    const selCardBs = selCardUi ? getComputedStyle(selCardUi).boxShadow : '';
    const selCardBg = selCardUi ? getComputedStyle(selCardUi).backgroundColor : '';
    const selCardBorder = selCardUi ? getComputedStyle(selCardUi).borderTopWidth + ' ' + getComputedStyle(selCardUi).borderTopColor : '';
    // hover (synthetic) on 1st card
    cards[0]?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const hovCardUi = cards[0]?.querySelector('.mf-option-ui');
    const hovCardBs = hovCardUi ? getComputedStyle(hovCardUi).boxShadow : '';
    return {
      selCardRing: ring(selCardBs), selCardBs, selCardBg, selCardBorder,
      hovCardRing: ring(hovCardBs), hovCardBs,
    };
  });
  console.log('  selected card box-shadow:', res.selCardBs);
  console.log('  selected card bg:', res.selCardBg, '| border:', res.selCardBorder);
  ok('selected CARD has NO ring (single border)', res.selCardRing === false);
  ok('selected card has a tint background (not pure white)', !/rgba?\(255,\s*255,\s*255/.test(res.selCardBg) && res.selCardBg !== 'rgb(255, 255, 255)');
  ok('selected card border is the single primary border', /px /.test(res.selCardBorder));

  await page.waitForTimeout(400);
  await shot(page, 'qa-border-1-selected.png');

  // Zoomed screenshot of just the cards group for a close pixel look.
  const grp = await page.$('.mf-option-group--cards');
  if (grp) await grp.screenshot({ path: OUT + '/qa-border-2-cards-closeup.png' });
  const cgrp = await page.$('.mf-option-group--chips');
  if (cgrp) await cgrp.screenshot({ path: OUT + '/qa-border-3-chips-closeup.png' });

  const fatal = errs.filter(e => /Cannot read|is not a function|TypeError/.test(e));
  ok('no fatal console errors', fatal.length === 0);

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-border-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
