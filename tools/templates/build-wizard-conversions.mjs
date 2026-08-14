#!/usr/bin/env node
/**
 * [WizardConversions v20260807] The four stepped mocks: one 3-step registration and three 4-step
 * invoices. Shares every builder with build-euroyouth-skins.mjs.
 *
 * What a stepped conversion needs beyond a skin:
 *
 *  1. A step rail and per-step pages the renderer will actually drive. Contract, from
 *     premium-step-reconcile.ts: rail items match [data-mf-native-step], pages match
 *     [data-mf-native-page], both keyed by a 0-BASED data-step, and each page's leading Section
 *     field carries a 1-BASED properties.premiumStepIndex. settings.premiumNativePageBreak must be
 *     true or none of it is bound.
 *
 *  2. A confirm step that shows back what was entered. This is the "curated review table" the
 *     handoff listed as a missing engine feature. It is not: a {{script:…}} anchor plus
 *     [data-mf-echo="KEY"] nodes gives a review panel that lists exactly the fields the DESIGN
 *     chose, in the design's order — which is better than the built-in reviewBeforeSubmit, whose
 *     whole point of failure was that it dumps every key into a pane of its own with its own
 *     buttons.
 *
 *  3. Live totals for the invoices. The DataGrid computes a per-row total and writes the sum into
 *     its totalField; the script reads that field plus the live tax/discount inputs and paints the
 *     summary. Same mechanism the shipped invoice templates use.
 *
 * Run:  node tools/templates/build-wizard-conversions.mjs [--only slug] [--check]
 */

import { resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  field, choiceField, writeTemplates, SERIF, SANS,
} from './build-euroyouth-skins.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Scripts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shows one wizard page at a time.
 *
 * MEASURED, not assumed: with settings.premiumNativePageBreak the renderer binds the shell's own
 * Back/Next, moves each field into its [data-mf-native-page] container and marks the live rail item
 * with is-active — but nothing in the renderer sets display on those page containers. All four
 * pages rendered at once as one long form. The shipped tabbed-account-setup template carries its
 * own script for this same reason, so the shell owning its page visibility is the established
 * contract rather than a workaround.
 *
 * Driven off the rail's is-active class (a MutationObserver) so it follows the renderer's idea of
 * the current step instead of keeping a second copy of it.
 */
export function wizardPagesScript() {
  return `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  function pages() { return scope.querySelectorAll('[data-mf-native-page]'); }
  function steps() { return scope.querySelectorAll('[data-mf-native-step]'); }
  function activeStep() {
    var s = steps();
    for (var i = 0; i < s.length; i++) if (s[i].classList.contains('is-active')) return s[i].getAttribute('data-step') || String(i);
    return '0';
  }
  function apply() {
    var want = String(activeStep());
    var p = pages();
    for (var i = 0; i < p.length; i++) {
      var mine = String(p[i].getAttribute('data-step') || i);
      var on = mine === want;
      p[i].style.display = on ? '' : 'none';
      p[i].setAttribute('aria-hidden', on ? 'false' : 'true');
    }
  }
  try {
    var mo = new MutationObserver(function(){ apply(); });
    var s = steps();
    for (var i = 0; i < s.length; i++) mo.observe(s[i], { attributes: true, attributeFilter: ['class'] });
  } catch (e) { /* no observer: the timers below still cover Back/Next */ }
  scope.addEventListener('click', function(){ setTimeout(apply, 40); setTimeout(apply, 160); }, true);
  setTimeout(apply, 60); setTimeout(apply, 400); apply();
})();`;
}

/** Mirrors every value into [data-mf-echo="KEY"]. Used by the confirm step of all four. */
export function recapScript() {
  return `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  function labelFor(input) {
    var ui = input.nextElementSibling;
    var lab = ui && ui.querySelector ? ui.querySelector('.mf-option-label') : null;
    return lab ? lab.textContent.trim() : String(input.value || '');
  }
  function val(key) {
    var els = scope.querySelectorAll('[name="' + key + '"]');
    if (!els.length) return '';
    var f = els[0];
    if (f.type === 'checkbox' || f.type === 'radio') {
      var picked = [];
      for (var i = 0; i < els.length; i++) if (els[i].checked) picked.push(labelFor(els[i]));
      return picked.join(', ');
    }
    if (f.tagName === 'SELECT') { var o = f.options[f.selectedIndex]; return o && o.value ? o.textContent.trim() : ''; }
    return String(f.value || '').trim();
  }
  function paint() {
    var nodes = scope.querySelectorAll('[data-mf-echo]');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute('data-mf-echo');
      if (k.indexOf('__') === 0) continue;
      var v = val(k);
      nodes[i].textContent = v || '—';
      nodes[i].classList.toggle('is-empty', !v);
    }
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  scope.addEventListener('click', function(){ setTimeout(paint, 60); }, true);
  setTimeout(paint, 150); setTimeout(paint, 700); paint();
})();`;
}

/**
 * Live invoice totals. Subtotal comes from the DataGrid's totalField (it already sums qty*price),
 * tax and discount from live percent inputs.
 */
export function invoiceTotalsScript(currency) {
  return `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var CUR = ${JSON.stringify(currency)};
  function num(name) {
    var el = scope.querySelector('[name="' + name + '"]');
    if (!el) return 0;
    var v = parseFloat(String(el.value || '').replace(/[^0-9.\\-]/g, ''));
    return isNaN(v) ? 0 : v;
  }
  function fmt(n) { return CUR + (Math.round((n || 0) * 100) / 100).toFixed(2); }
  function set(k, text) {
    var n = scope.querySelectorAll('[data-mf-echo="' + k + '"]');
    for (var i = 0; i < n.length; i++) n[i].textContent = text;
  }
  function paint() {
    var sub = num('grand_total');
    var disc = sub * (num('discount_pct') / 100);
    var taxed = sub - disc;
    var tax = taxed * (num('tax_pct') / 100);
    set('__sub', fmt(sub));
    set('__disc', fmt(disc));
    set('__tax', fmt(tax));
    set('__total', fmt(taxed + tax));
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  // A DataGrid row is added or removed by a click; its total lands after its own handler runs.
  scope.addEventListener('click', function(){ setTimeout(paint, 80); }, true);
  setTimeout(paint, 150); setTimeout(paint, 700); paint();
})();`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────
const recapRow = (p, label, key) =>
  `<div class='${p}-rc-row'><span class='${p}-rc-k'>${label}</span>`
  + `<span class='${p}-rc-v' data-mf-echo='${key}'>—</span></div>`;

const totalsBlock = (p, { discount = true } = {}) =>
  `<div class='${p}-totals'>`
  + `<div class='${p}-tot-row'><span>Sub total</span><span data-mf-echo='__sub'>—</span></div>`
  + (discount ? `<div class='${p}-tot-row'><span>Discount</span><span data-mf-echo='__disc'>—</span></div>` : '')
  + `<div class='${p}-tot-row'><span>Tax</span><span data-mf-echo='__tax'>—</span></div>`
  + `<div class='${p}-tot-grand'><span>Total due</span><span data-mf-echo='__total'>—</span></div>`
  + `</div>`;

const TOTALS_CSS = (p) => `
@S@.${p}-totals{margin-top:8px;padding:14px 16px;border:1px solid var(--${p}-border);border-radius:8px;background:color-mix(in srgb, var(--${p}-primary) 4%, var(--${p}-surface))}
@S@.${p}-tot-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:13px;color:var(--${p}-muted)}
@S@.${p}-tot-row span:last-child{color:var(--${p}-text);font-weight:700}
@S@.${p}-tot-grand{display:flex;justify-content:space-between;gap:12px;margin-top:8px;padding-top:10px;border-top:2px solid var(--${p}-primary);font-size:16px;font-weight:900;color:var(--${p}-text)}
@S@.${p}-rc{margin:0;padding:14px 16px;border:1px solid var(--${p}-border);border-radius:8px;background:color-mix(in srgb, var(--${p}-text) 3%, var(--${p}-surface))}
@S@.${p}-rc-row{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid var(--${p}-hairline);font-size:13px}
@S@.${p}-rc-row:last-child{border-bottom:0}
@S@.${p}-rc-k{color:var(--${p}-muted)}
@S@.${p}-rc-v{color:var(--${p}-text);font-weight:700;text-align:right;word-break:break-word}
@S@.${p}-rc-v.is-empty{color:var(--${p}-muted);font-weight:400}
@S@.${p}-note{margin:10px 0 0;font-size:11px;line-height:1.5;color:var(--${p}-muted)}
`;

/** The line-items grid + its total sink. Lifted from the shipped invoice templates. */
export function itemsFields(rows, { label = 'Description', currencyLabel = 'Rate' } = {}) {
  return [
    field('items', 'DataGrid', 'Line items', {
      defaultValue: JSON.stringify(rows),
      widgetProps: {
        editMode: 'inline', allowAdd: true, allowDelete: true, stickyHeader: false,
        emptyMessage: 'No items yet — click + Add item.',
        totalFormula: 'Sum("qty * price")',
        totalField: 'grand_total',
        columns: [
          { key: 'description', label, type: 'text', placeholder: 'Item description', width: 'minmax(80px,1fr)' },
          { key: 'qty', label: 'Qty', type: 'number', decimals: 0, width: 'minmax(0,64px)' },
          { key: 'price', label: currencyLabel, type: 'currency', decimals: 2, width: 'minmax(0,104px)' },
          { key: 'line_total', label: 'Amount', type: 'computed', decimals: 2, width: 'minmax(0,104px)', computeFormula: 'qty * price' },
        ],
      },
    }),
    // The DataGrid writes its sum here; the totals script reads it. Read-only so nobody edits a
    // derived number.
    field('grand_total', 'Number', 'Items total', { properties: { readOnly: true } }),
    field('tax_pct', 'Number', 'Tax %', { defaultValue: '10', placeholder: '10' }),
    field('discount_pct', 'Number', 'Discount %', { defaultValue: '0', placeholder: '0' }),
  ];
}

// Every spec below declares its own fields; the shared EuroYouth body is omitted wholesale.
const OMIT_ALL = ['first_name', 'last_name', 'email', 'phone', 'birth_year', 'country', 'programme',
  'start_month', 'duration', 'language_level', 'accommodation', 'interests', 'motivation',
  'newsletter', 'terms'];

// ─────────────────────────────────────────────────────────────────────────────
function invoiceSpec(o) {
  const p = o.prefix;
  return {
    slug: o.slug,
    title: o.title,
    description: o.description,
    category: 'invoice',
    categories: ['invoice', 'premium', 'finance'],
    icon: 'file-invoice',
    prefix: p,
    fontStack: o.fontStack || SANS,
    displayFontStack: o.displayFontStack || SANS,
    submitLabel: o.submitLabel || 'Send Invoice',
    successMessage: 'Invoice created.',
    successTitle: o.successTitle || 'Invoice created',
    successBody: 'Invoice for {{field:bill_to_name}} is created. A copy has gone to {{field:bill_to_email}}. Reference {{submission:id}}.',
    palette: o.palette,
    hero: o.hero,
    strips: o.strips || [],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'rule',
    cardMaxWidth: '900px',
    cardRadius: o.cardRadius || '8px',
    submitRadius: o.submitRadius || '8px',
    submitBackground: o.submitBackground,
    captions: {},
    optionColumns: { pay_method: 2 },
    wizard: {
      nextLabel: 'Continue',
      backLabel: 'Back',
      steps: [
        { num: '01', label: 'Parties', sub: o.step1sub || 'Bill to / from' },
        { num: '02', label: 'Items', sub: 'Line items' },
        { num: '03', label: 'Payment', sub: 'Method & contact' },
        { num: '04', label: 'Confirm', sub: 'Review & send' },
      ],
    },
    extraCss: TOTALS_CSS(p),
    customScripts: {
      wizard_pages: wizardPagesScript(),
      invoice_totals: invoiceTotalsScript(o.currency || '$'),
      invoice_recap: recapScript(),
    },
    body: { omit: OMIT_ALL },
    extraFields: [
      field('invoice_no', 'Text', 'Invoice No.', { required: true, defaultValue: o.invoiceNo || 'INV-001' }),
      field('invoice_date', 'Date', 'Invoice Date', { required: true }),
      field('due_date', 'Date', 'Due Date'),
      field('bill_to_name', 'Text', 'Company / Name', { required: true, placeholder: o.toPlaceholder || 'Acme Ltd' }),
      field('bill_to_email', 'Email', 'Email', { required: true, placeholder: 'billing@acme.com' }),
      field('bill_to_addr', 'Text', 'Street Address', { placeholder: '123 Main Street' }),
      field('bill_to_city', 'Text', 'City / State', { placeholder: 'Portland, OR' }),
      field('bill_to_phone', 'Phone', 'Phone', { placeholder: '(555) 010-2233' }),
      field('bill_from_name', 'Text', 'Your company', { required: true, placeholder: o.fromPlaceholder || 'My Company' }),
      field('bill_from_email', 'Email', 'Your email', { placeholder: 'hello@mycompany.com' }),
      field('bill_from_addr', 'Text', 'Your address', { placeholder: '9 Studio Lane' }),
      ...itemsFields(o.rows, { currencyLabel: `Rate (${o.currency || '$'})` }),
      choiceField('pay_method', 'Radio', 'Payment method',
        ['Bank Transfer', 'Card', 'PayPal', 'Cheque'], 'cards', 2, { required: true }),
      field('bank_name', 'Text', 'Bank name', { placeholder: 'First National' }),
      field('account_no', 'Text', 'Account number', { placeholder: '0123456789' }),
      field('notes', 'Textarea', 'Notes', { placeholder: 'Payment terms, thank-you note…' }),
      choiceField('terms', 'Checkbox', 'Declaration',
        [{ label: 'The details above are correct and may be sent to the client', value: 'yes' }],
        'list', null, { required: true }),
    ],
    sections: () => [
      { step: 0, caption: 'Invoice', grid: [['Invoice No. *', 'invoice_no'], ['Invoice Date *', 'invoice_date'], ['Due Date', 'due_date']] },
      {
        step: 0, caption: 'Invoice To',
        grid: [['Company / Name *', 'bill_to_name'], ['Email *', 'bill_to_email'],
          ['Street Address', 'bill_to_addr'], ['City / State', 'bill_to_city'], ['Phone', 'bill_to_phone']],
      },
      {
        step: 0, caption: 'Invoice From',
        grid: [['Your company *', 'bill_from_name'], ['Your email', 'bill_from_email']],
        slots: [['Your address', 'bill_from_addr']],
      },
      { step: 1, caption: 'Line Items', slots: [['Line items', 'items']] },
      { step: 1, grid: [['Items total', 'grand_total'], ['Tax %', 'tax_pct'], ['Discount %', 'discount_pct']] },
      { step: 1, html: totalsBlock(p) },
      { step: 1, script: 'invoice_totals' },
      { step: 2, caption: 'Payment Method', slots: [['Payment method *', 'pay_method']] },
      { step: 2, grid: [['Bank name', 'bank_name'], ['Account number', 'account_no']] },
      { step: 2, slots: [['Notes', 'notes']] },
      {
        step: 3, caption: 'Review & Send',
        html: `<div class='${p}-rc'>`
          + recapRow(p, 'Invoice No.', 'invoice_no')
          + recapRow(p, 'Invoice date', 'invoice_date')
          + recapRow(p, 'Due date', 'due_date')
          + recapRow(p, 'Bill to', 'bill_to_name')
          + recapRow(p, 'Email', 'bill_to_email')
          + recapRow(p, 'From', 'bill_from_name')
          + recapRow(p, 'Payment', 'pay_method')
          + `</div>`
          + totalsBlock(p)
          + `<p class='${p}-note'>Only the fields this design chose are listed, in this order — a curated review, not a dump of every key.</p>`,
      },
      { step: 3, script: 'invoice_recap' },
      { step: 3, consent: [['Declaration', 'terms']] },
    ],
  };
}

const ROWS_FORM = [
  { description: 'Brand strategy workshop', qty: 1, price: 1200 },
  { description: 'Website design (5 pages)', qty: 1, price: 4800 },
  { description: 'Monthly retainer', qty: 3, price: 650 },
];
const ROWS_SPINERA = [
  { description: 'Logo Design', qty: 1, price: 500 },
  { description: 'Website Design', qty: 1, price: 4800 },
  { description: 'Social Media Kit', qty: 2, price: 350 },
];
const ROWS_CODEXO = [
  { description: 'Graphic Design', qty: 1, price: 2500 },
  { description: 'Branding Identity', qty: 1, price: 1200 },
  { description: 'Magazine Design', qty: 1, price: 900 },
];

const SPECS = [
  // invoice-request-navy-orange MOVED to build-exact-conversions.mjs on 2026-08-08: its mock is a
  // 768px card with a navy masthead cut by an orange diagonal and a full-width 4-tab step strip.
  // invoice-spinera-blue MOVED to build-exact-conversions.mjs on 2026-08-08: an 896px card whose
  // masthead is a document header (navy edge stripe, red-underlined wordmark, live To/From
  // address blocks) over a currency band, and underline-only fields.
  invoiceSpec({
    slug: 'invoice-codexo-cyan', prefix: 'icx',
    title: 'Invoice — Codexo Design Studio',
    description: 'Four-step invoice wizard in Codexo blue and cyan: client details, service line items with live totals, bank and signature, then a curated review step.',
    submitLabel: 'Confirm Invoice', successTitle: 'Invoice confirmed',
    currency: '$', invoiceNo: 'ORD-2025-001', rows: ROWS_CODEXO,
    toPlaceholder: 'Client company', fromPlaceholder: 'Codexo Design Studio',
    palette: {
      primary: '#0E6EB8', accent: '#00B4D8', surface: '#FFFFFF', text: '#1A1A2E',
      muted: '#6B7280', border: '#D1E4F5', onPrimary: '#FFFFFF', deco: '#00B4D8',
      page: '#F0F5FB', inputBg: '#F7FAFD',
    },
    hero: {
      background: 'linear-gradient(135deg,#0A4F85 0%,#0E6EB8 55%,#00B4D8 100%)',
      padding: '36px 30px 30px',
      emblemIcon: 'fa-pen-nib',
      eyebrow: 'Codexo', display: 'Design Studio', displaySize: '38px', displayWeight: 800,
      subtitle: 'Invoice & statement of work',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(232,242,251,.72)', onHeroSoft: 'rgba(255,255,255,.9)',
    },
    strips: [{ kind: 'tagline', text: 'Graphic · Branding · Magazine' }],
    submitBackground: 'linear-gradient(135deg,#0E6EB8,#00B4D8)',
  }),

  // ── golden-pro: 3-step agent registration with a review & sign step ─────────
  // golden-pro-agent-registration MOVED to build-exact-conversions.mjs on 2026-08-08: its mock
  // is a 1024px document block with a masthead, gold stripes and a 256px olive sidebar carrying
  // the agent photograph and a VERTICAL stepper - not the horizontal rail this file builds.
];

// The main block only runs when this file IS the entry point. build-exact-conversions.mjs imports
// wizardPagesScript from here, and an import that also rewrote three templates - and then called
// process.exit, killing the importer before it wrote anything - is exactly the trap the
// build-euroyouth-skins.mjs guard already avoids.
const isMain = (() => {
  try { return resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); }
  catch { return false; }
})();

if (isMain) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const checkOnly = args.includes('--check');
  const r = writeTemplates(SPECS, { only, checkOnly });
  console.log(`\n${checkOnly ? 'checked' : 'wrote'} ${checkOnly ? r.total : r.wrote} template(s), ${r.failed} failure(s)`);
  process.exit(r.failed ? 1 : 0);
}