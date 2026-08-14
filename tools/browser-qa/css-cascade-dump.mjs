#!/usr/bin/env node
/**
 * Dump every CSS rule that matches an element, in cascade order, with its specificity.
 *
 * Written after two sessions guessed wrong about why the compat bridge kept beating a template's
 * authored input styling. The guess was "our rule is 4 class-level selectors, the bridge is 3, so
 * something must be re-emitting the bridge later". The measurement said otherwise: the bridge's
 * selector LIST also contains
 *     :where(#mf-form-wrapper-N) .mfp[class*="mfp-"] input:not([type="checkbox"]):not([type="radio"])
 * which matches the same element at (0,4,1) — one element token above the authored (0,4,0).
 *
 * `el.matches()` is true for a rule if ANY branch of its selector list matches, and the branch that
 * wins the cascade is the most specific one — which is why reading only the first branch misleads.
 * This prints every branch that matches, so the winner is visible rather than inferred.
 *
 *   node tools/browser-qa/css-cascade-dump.mjs <url> [selector] [--prop background-color,color]
 */

import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const URL_ = argv[0];
const SEL = argv[1] && !argv[1].startsWith('--') ? argv[1] : '.mf-input';
const pi = argv.indexOf('--prop');
const PROPS = pi >= 0 && argv[pi + 1] ? argv[pi + 1].split(',') : null;
const hi = argv.indexOf('--host-map');
const HOST_MAP = hi >= 0 && argv[hi + 1] ? argv[hi + 1] : 'megaclean008.ai';

if (!URL_) { console.error('usage: css-cascade-dump.mjs <url> [selector] [--prop a,b]'); process.exit(2); }

const DUMP = `(sel, props) => {
  const el = document.querySelector(sel);
  if (!el) return { error: 'not found: ' + sel };

  // Specificity of ONE compound selector. :where() contributes nothing by definition; :not() takes
  // the weight of its most specific argument, which is what makes input:not([type]) land at (0,1,1).
  const spec = (raw) => {
    let s = String(raw), prev;
    do { prev = s; s = s.replace(/:where\\(([^()]*)\\)/g, ' '); } while (s !== prev);
    const ids = (s.match(/#[A-Za-z0-9_-]+/g) || []).length;
    const cls = (s.match(/\\.[A-Za-z0-9_-]+/g) || []).length
              + (s.match(/\\[[^\\]]*\\]/g) || []).length
              + (s.match(/:(?!:)(?!where\\b)[A-Za-z-]+/g) || []).length;
    const tag = (s.match(/(^|[\\s>+~(,])[a-zA-Z][a-zA-Z0-9]*/g) || []).length;
    return ids + ',' + cls + ',' + tag;
  };

  const out = [];
  const walk = (rules, sheet, label) => {
    if (!rules) return;
    for (const r of rules) {
      if (r.cssRules && !r.selectorText) { walk(r.cssRules, sheet, label + '>' + r.constructor.name); continue; }
      if (!r.selectorText) continue;
      // EVERY matching branch, not the first: the most specific one is what the cascade uses.
      const branches = r.selectorText.split(',').map((x) => x.trim())
        .filter((x) => { try { return el.matches(x); } catch (e) { return false; } });
      if (!branches.length) continue;
      const decls = {};
      for (const p of (props || [])) {
        const v = r.style.getPropertyValue(p);
        if (v) decls[p] = v + (r.style.getPropertyPriority(p) === 'important' ? ' !important' : '');
      }
      if (props && !Object.keys(decls).length) continue;
      out.push({
        sheet, label,
        branches: branches.map((b) => b + '  (' + spec(b) + ')'),
        decls: props ? decls : undefined,
        css: props ? undefined : r.cssText.slice(0, 300),
      });
    }
  };
  Array.from(document.styleSheets).forEach((s, i) => {
    let rules = null; try { rules = s.cssRules; } catch (e) { return; }   // cross-origin
    walk(rules, i, s.href ? s.href.split('/').slice(-1)[0] : '<inline#' + ((s.ownerNode && s.ownerNode.id) || '') + '>');
  });

  const cs = getComputedStyle(el);
  const computed = {};
  for (const p of (props || ['background-color', 'color'])) computed[p] = cs.getPropertyValue(p);
  return { el: el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.'), computed, rules: out };
}`;

const browser = await chromium.launch({
  channel: 'chrome',
  args: [`--host-resolver-rules=MAP ${HOST_MAP} 127.0.0.1`],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const p = await ctx.newPage();
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
await p.waitForTimeout(2500);
// Invoked, not passed: Playwright treats a bare function-literal string as an expression and the
// argument would be dropped, handing back undefined.
console.log(JSON.stringify(
  await p.evaluate(`(${DUMP})(${JSON.stringify(SEL)}, ${JSON.stringify(PROPS)})`), null, 1));
await browser.close();
