#!/usr/bin/env node
/**
 * [MockConversions v20260807] The mocks that are NOT EuroYouth-body skins.
 *
 * Shares every builder with build-euroyouth-skins.mjs (imported, not copied — that file exports
 * its builders and its main block is guarded, so importing it writes nothing). What differs here
 * is that these designs need LIVE behaviour, not just a skin:
 *
 *   hotel-booking   a sticky reservation summary that updates as the guest types
 *   product-order   a live order total (subtotal / tax / total)
 *
 * Both are done with `settings.customScripts` + a `{{script:KEY}}` anchor, which is the mechanism
 * the shipped invoice templates already use for live totals. Worth stating plainly because the
 * previous handoff called this "an engine feature MegaForm does not have" and listed five
 * templates as blocked on it: `{{content:*}}` is indeed a one-shot substitution, but a managed
 * custom script gets `__mfCurrentScriptRoot` and can bind input/change itself. Nothing was
 * blocked.
 *
 * Run:  node tools/templates/build-mock-conversions.mjs [--only slug] [--check]
 */

import {
  field, choiceField, buildTemplate, validate, OUT_DIR, writeTemplates, SERIF, SANS,
} from './build-euroyouth-skins.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Live-echo runtime.
//
// Mirrors form values into [data-mf-echo="KEY"] nodes on every input/change, and computes the
// order/reservation totals declared in `money`. Written as a string because it ships inside the
// template JSON; the renderer wraps it in its own try/catch and gives it a sourceURL.
//
// Reads values from the form, NOT from a cached copy, because a widget (date picker, DataGrid)
// writes its value into a hidden input rather than firing on the visible control.
// ─────────────────────────────────────────────────────────────────────────────
function echoScript({ money = null, labels = {}, empty = '—' } = {}) {
  return `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var LABELS = ${JSON.stringify(labels)};
  var MONEY = ${JSON.stringify(money)};
  var EMPTY = ${JSON.stringify(empty)};

  function val(key) {
    var els = scope.querySelectorAll('[name="' + key + '"]');
    if (!els.length) return '';
    var first = els[0];
    if (first.type === 'checkbox' || first.type === 'radio') {
      var picked = [];
      for (var i = 0; i < els.length; i++) if (els[i].checked) picked.push(labelFor(els[i]));
      return picked.join(', ');
    }
    if (first.tagName === 'SELECT') {
      var o = first.options[first.selectedIndex];
      return o && o.value ? o.textContent.trim() : '';
    }
    return String(first.value || '').trim();
  }
  function raw(key) {
    var el = scope.querySelector('[name="' + key + '"]');
    if (!el) return '';
    if (el.tagName === 'SELECT') { var o = el.options[el.selectedIndex]; return o ? o.value : ''; }
    if (el.type === 'checkbox' || el.type === 'radio') {
      var els = scope.querySelectorAll('[name="' + key + '"]');
      for (var i = 0; i < els.length; i++) if (els[i].checked) return els[i].value;
      return '';
    }
    return String(el.value || '');
  }
  function labelFor(input) {
    var ui = input.nextElementSibling;
    var lab = ui && ui.querySelector ? ui.querySelector('.mf-option-label') : null;
    if (lab) return lab.textContent.trim();
    return String(input.value || '');
  }
  function money(n) {
    var cur = (MONEY && MONEY.currency) || '';
    return cur + (Math.round((n || 0) * 100) / 100).toFixed(2);
  }

  function paint() {
    var nodes = scope.querySelectorAll('[data-mf-echo]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-mf-echo');
      var v;
      if (key === '__subtotal' || key === '__tax' || key === '__total') { continue; }
      v = val(key);
      if (!v && LABELS[key]) v = '';
      nodes[i].textContent = v || EMPTY;
      nodes[i].classList.toggle('is-empty', !v);
    }
    if (MONEY) {
      var unit = 0;
      var prices = MONEY.prices || {};
      var picked = raw(MONEY.productField);
      if (Object.prototype.hasOwnProperty.call(prices, picked)) unit = Number(prices[picked]) || 0;
      var qty = parseFloat(raw(MONEY.qtyField)) || 0;
      var sub = unit * qty;
      var tax = sub * (Number(MONEY.taxRate) || 0);
      var tot = sub + tax;
      var quoted = MONEY.quoted && picked === MONEY.quoted;
      set('__subtotal', quoted ? MONEY.quotedText : money(sub));
      set('__tax', quoted ? MONEY.quotedText : money(tax));
      set('__total', quoted ? MONEY.quotedText : money(tot));
    }
  }
  function set(key, text) {
    var n = scope.querySelectorAll('[data-mf-echo="' + key + '"]');
    for (var i = 0; i < n.length; i++) n[i].textContent = text;
  }

  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  // A card/chip click updates the hidden input after its own handler, so re-read on the next tick.
  scope.addEventListener('click', function () { setTimeout(paint, 60); }, true);
  setTimeout(paint, 120); setTimeout(paint, 600); paint();
})();`;
}

const asideRow = (p, label, key) =>
  `<div class='${p}-aside-row'><span>${label}</span><span data-mf-echo='${key}'>—</span></div>`;

// ─────────────────────────────────────────────────────────────────────────────
const SPECS = [
  // ── newsletter ─────────────────────────────────────────────────────────────
  // newsletter-signup-amber MOVED to build-exact-conversions.mjs on 2026-08-08: its mock is a
  // shadcn Card on an amber gradient wash with two REAL checkboxes side by side, not the premium
  // shell this file builds.

  // ── job-application ────────────────────────────────────────────────────────
  // Save-and-resume is enabled: the endpoint, the renderer handler and the DNN button all exist
  // (FormView.ascx emits mf-btn-save-<id> under ViewModel.EnableSaveResume). It is the one mock
  // that asked for "save as draft", and it needs no new engine work — only the flag.
  // job-application-northwind MOVED to build-exact-conversions.mjs on 2026-08-08: a sticky
  // progress sidebar beside the form card, and a draft/submit button pair.

  // ── hotel-booking: form + LIVE sticky reservation summary ───────────────────
  // lagoon-reserve-booking MOVED to build-exact-conversions.mjs on 2026-08-08: a full-bleed photo
  // hero over a two-column page whose 300px sidebar carries three panels, and room cards with a
  // price column and an occupancy meter.

  // ── product-order: form + LIVE order total ─────────────────────────────────
  // ⚠️ PRICING RULE IS AN ASSUMPTION. The mock's own arithmetic is broken: handleItemChange never
  // writes item.price and addItem seeds price:0, so the $99 / $9.90 / $108.90 on its screen is a
  // fixture, not a computation — there was no correct behaviour to copy. Implemented here as the
  // only rule the mock's own labels support: unit price by plan (Starter 29, Pro 99), times
  // quantity, plus 10% tax. Enterprise is "Custom" in the mock, so it reports Quoted instead of a
  // number. Confirm or replace this rule.
  // product-order-live-total MOVED to build-exact-conversions.mjs on 2026-08-08: its mock is a
  // two-column page with a SEPARATE sticky Order Summary card and placeholder-only controls.
];

// These specs declare their fields outright rather than deriving them from the EuroYouth body.
// buildFields is bypassed by handing buildTemplate a spec whose extraFields ARE the whole form and
// whose body omits everything else — cheaper and clearer than teaching buildFields a second mode.
for (const s of SPECS) {
  s.extraFields = s.fields;
  s.body = Object.assign({}, s.body, {
    omit: ['first_name', 'last_name', 'email', 'phone', 'birth_year', 'country', 'programme',
      'start_month', 'duration', 'language_level', 'accommodation', 'interests', 'motivation',
      'newsletter', 'terms'],
  });
  delete s.fields;
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const checkOnly = args.includes('--check');
const r = writeTemplates(SPECS, { only, checkOnly });
console.log(`\n${checkOnly ? 'checked' : 'wrote'} ${checkOnly ? r.total : r.wrote} template(s), ${r.failed} failure(s)`);
process.exit(r.failed ? 1 : 0);
