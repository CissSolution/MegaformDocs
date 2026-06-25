// Is .app-pane-admin-border per-MODULE (safe for :has scoping) or per-PANE (would leak to
// sibling modules)? And does the candidate scoped selector match ONLY MegaForm toggles?
import { login, BASE } from './lib.mjs';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const page = await ctx.newPage();
await login(page);
await page.goto(`${BASE}/mfqa-panes?edit=true`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);

const out = await page.evaluate(() => {
  const MEGA = '.mf-form-wrapper, .mf-oq-admin-dock, .megaform-module';
  const borders = [...document.querySelectorAll('.app-pane-admin-border')].map((b, i) => ({
    i,
    moduleActionsInside: b.querySelectorAll('.app-moduleactions').length,
    hasMegaMarker: !!b.querySelector(MEGA),
    nestedBorders: b.querySelectorAll('.app-pane-admin-border').length,
  }));

  const CANDIDATE = '.app-pane-admin-border:has(' + MEGA + ') .app-moduleactions .dropdown-toggle';
  const matched = [...document.querySelectorAll(CANDIDATE)];
  const allToggles = [...document.querySelectorAll('.app-moduleactions .dropdown-toggle')];

  // ground-truth: a toggle is MegaForm's if its INNERMOST module border has a mega marker
  const truth = allToggles.map(t => {
    // innermost border that wraps THIS toggle and exactly one module
    const innermost = t.closest('.app-pane-admin-border');
    return { isMegaByCandidate: matched.includes(t), innermostHasMega: innermost ? !!innermost.querySelector(MEGA) : null };
  });

  return {
    borderCount: borders.length,
    borders,
    totalToggles: allToggles.length,
    candidateMatchCount: matched.length,
    perToggle: truth,
  };
});
console.log(JSON.stringify(out, null, 1));
await ctx.close(); await browser.close();
