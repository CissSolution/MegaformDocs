/**
 * [ExactConversion] invoice-codexo-cyan — the ICX spec, split into its own module.
 *
 * Mock: E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\app\forms\
 *       invoice-codexo\page.tsx (560 lines). Every px, colour, weight and string below is
 *       transcribed from qa-out/_buildsheet_codexo.md, which was itself read off that source line
 *       by line. Nothing here is rounded to taste and nothing is invented.
 *
 * This module exports ONE named spec and has no side effects: build-exact-conversions.mjs imports
 * ICX and puts it in its own SPECS array.
 *
 * Line-height ruling used throughout (build sheet, preamble): Tailwind v4 preflight sets
 * html{line-height:1.5}, and an arbitrary text-[Npx] sets font-size only, so text-[13px] runs at
 * 19.5px, text-[11px] at 16.5px and text-[10px] at 15px. The one exception is inside the step-04
 * review card, whose text-sm sets a unitless 1.4286 — its 11px key line is 15.71px.
 *
 * Traps this file is written around, each of which cost a debugging round elsewhere:
 *   - no backtick may appear inside a template literal, including inside a comment inside one;
 *   - no authored class name may contain "col-" or "title" (megaform.css and the compat bridge
 *     both carry substring matches with !important);
 *   - controls need the [class] suffix so the authored rule outranks the bridge's
 *     input:not([type=checkbox]):not([type=radio]) at (0,4,1);
 *   - every text rule states font-weight explicitly, because unstated resolves to 200 in the host
 *     stack;
 *   - every inline SVG goes through svgUrl(), because NeutralizeStyleBreakout corrupts a raw one.
 */

import {
  asset, svgUrl, wrapperReset, controlReset, lucideArrowLeft, lucideCheck,
} from './exact-helpers.mjs';
import { field, choiceField } from './build-euroyouth-skins.mjs';

const ICX_SLUG = 'invoice-codexo-cyan';

const INTER = `'Inter',system-ui,-apple-system,'Segoe UI',sans-serif`;
// Used on exactly two elements: .icx-brand-a ("CODEXO") and .icx-mark ("INVOICE").
// "DESIGN STUDIO" is Inter in the mock, not Barlow.
const BARLOW = `'Barlow',system-ui,-apple-system,'Segoe UI',sans-serif`;

// ─────────────────────────────────────────────────────────────────────────────
// lucide glyphs, paths read verbatim from lucide-react@0.564.0 in the mock's node_modules.
// All are viewBox 0 0 24 24, fill none, stroke-width 2, round cap and join unless stated.
// They must be BACKGROUNDS, never an <i> font glyph: a glyph as the first flex item drops the
// whole inline-flex box onto the glyph baseline and pushed every card row 3px down on the
// 08-08C batch.
// ─────────────────────────────────────────────────────────────────────────────
const lucideArrowRight = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><path d='M5 12h14'/><path d='m12 5 7 7-7 7'/></svg>`);

const lucidePlus = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><path d='M5 12h14'/><path d='M12 5v14'/></svg>`);

const lucideTrash2 = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><path d='M10 11v6'/><path d='M14 11v6'/>
  <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'/><path d='M3 6h18'/>
  <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/></svg>`);

const lucidePhone = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><path d='M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2
  2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8
  1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384'/></svg>`);

const lucideMail = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><path d='m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7'/>
  <rect x='2' y='4' width='20' height='16' rx='2'/></svg>`);

const lucideGlobe = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><circle cx='12' cy='12' r='10'/>
  <path d='M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'/><path d='M2 12h20'/></svg>`);

const lucideMapPin = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><path d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202
  0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/><circle cx='12' cy='10' r='3'/></svg>`);

// Report of fact: the wave's fill and the region under it are BOTH #0E6EB8 — the same colour as the
// sidebar column behind it. It is invisible in its own composition; its only effect is 28.87px of
// blue. Kept as authored so the path and viewBox are on record. Do not invent a contrast colour.
//
// A FUNCTION, not a const: build-exact-conversions.mjs imports this module and this module imports
// it back, so the two are a cycle. In a cycle the dependency's body runs first, while the parent's
// `export const svgUrl = …` bindings are still in their temporal dead zone — calling svgUrl at
// module-evaluation time would throw ReferenceError before a single template was built. Everything
// below that reaches into build-exact-conversions.mjs is therefore deferred to call time.
const icxWave = () => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 28'
  preserveAspectRatio='none'>
  <path d='M0 0 Q60 28 120 14 Q180 0 240 20 L240 0 Z' fill='#0E6EB8'/></svg>`);

// Clipped twice: 32 of its 112px by the 80px footer strip, then again by the card's 16px radius.
const icxSwoosh = () => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 120'>
  <path d='M180 0 Q100 40 60 120 L180 120 Z' fill='#0E6EB8' opacity='0.9'/>
  <path d='M180 20 Q120 55 90 120 L180 120 Z' fill='#0A4F85' opacity='0.7'/></svg>`);

// ─────────────────────────────────────────────────────────────────────────────
// Steps and the page-break Sections the runtime derives pages from.
//
// stepSections() is NOT exported by build-exact-conversions.mjs, so its shape is restated here
// rather than editing that file. premiumStepIndex is 1-BASED while the rail's data-step attributes
// are 0-based — reconcilePremiumNativeStepper shifts them as a set, so both conventions are kept
// exactly.
// ─────────────────────────────────────────────────────────────────────────────
const ICX_STEPS = [
  { num: '01', label: 'Client', sub: 'Bill-to info' },
  { num: '02', label: 'Services', sub: 'Line items' },
  { num: '03', label: 'Payment', sub: 'Bank & sign' },
  { num: '04', label: 'Confirm', sub: 'Review & send' },
];

const stepSections = (steps) => steps.map((st, i) => field(`step_${i + 1}`, 'Section', st.label, {
  properties: {
    pageBreak: i > 0,
    premiumNativeStep: true,
    generatedPremiumStep: true,
    premiumStepIndex: i + 1,
  },
}));

// The mock's seed, page.tsx:41-47 — five rows, four populated plus one blank.
// Seeded arithmetic: subtotal 8800.00, tax 880.00, discount 0.00, total 9680.00.
const ROWS_ICX = [
  { description: 'Graphic Design', note: 'Your Business Address', code: 'GD-01', rate: 2500 },
  { description: 'Branding Identity', note: 'Branding monthly', code: 'BI-02', rate: 1200 },
  { description: 'Magazine Design', note: '', code: 'MD-03', rate: 3200 },
  { description: 'Flyer Concept', note: '', code: 'FC-04', rate: 1900 },
  { description: '', note: '', code: '', rate: 0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Scripts.
//
// Three anchors, all of them OUTSIDE the [data-mf-native-page] containers: an anchor inside a page
// is hidden with it, and injectManagedCustomScripts resolves __mfCurrentScriptRoot from the
// anchor's position.
//
// wizard_pages and icx_recap are wizardPagesScript() / recapScript() from
// build-wizard-conversions.mjs, copied verbatim rather than imported — this module imports only
// from build-exact-conversions.mjs and build-euroyouth-skins.mjs. The em dash is written as an
// escape so this file stays ASCII; the emitted script is byte-equivalent in behaviour.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shows one wizard page at a time.
 *
 * With premiumNativePageBreak the renderer binds Back/Next, moves fields into their page containers
 * and marks the rail is-active, but NOTHING sets display on [data-mf-native-page]. Without this all
 * four pages render at once as one long form.
 */
const ICX_WIZARD_PAGES = `(function(){
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

/**
 * Mirrors every value into [data-mf-echo="KEY"], writing an em dash when empty and toggling
 * .is-empty (which is how the mock's italic em-dash fallback in the masthead is reproduced).
 *
 * It SKIPS any key beginning with "__" — that skip is the entire reason this script and icx_totals
 * can share one echo namespace. Every un-prefixed echo key in this spec is a real field name, so
 * val() always resolves; every computed echo is "__"-prefixed.
 */
const ICX_RECAP = `(function(){
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
      nodes[i].textContent = v || '\\u2014';
      nodes[i].classList.toggle('is-empty', !v);
    }
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  scope.addEventListener('click', function(){ setTimeout(paint, 60); }, true);
  setTimeout(paint, 150); setTimeout(paint, 700); paint();
})();`;

/**
 * Live totals, the MOCK's arithmetic — not invoiceTotalsScript's.
 *
 * The stock script computes disc = sub*d/100; taxed = sub - disc; tax = taxed*t/100;
 * total = taxed + tax — discount BEFORE tax. The mock takes both percentages off the raw subtotal
 * and subtracts at the end:
 *
 *   subtotal = num('grand_total')            // the DataGrid's totalField, Sum("rate")
 *   tax      = subtotal * (taxRate  || 0)/100
 *   disc     = subtotal * (discount || 0)/100
 *   total    = subtotal + tax - disc
 *
 * At 10% / 0% both formulas give 9680.00 on the seeded 8800.00, which is exactly why the
 * difference would never have been caught by eye.
 *
 * Two more jobs in the same paint():
 *   1. Write the true total into the hidden total_due field (plus a bubbling input event) so
 *      {{field:total_due}} on the success screen resolves to 9680.00, not the subtotal. Guarded
 *      against re-entry both by a flag and by only writing when the value actually changes.
 *   2. Reformat the computed Price cells. The widget stores row[key] = +v.toFixed(2), coercing back
 *      to Number, so 2500.00 renders as 2500 and there is no currency mark. paint() parses the
 *      numeric text and rewrites it as $X.XX, and because it compares before writing it never
 *      re-parses its own output into something different.
 *
 * Currency is a hardcoded "$" with Number.prototype.toFixed(2) throughout: no Intl.NumberFormat,
 * no locale, no thousands separator ($8800.00, never $8,800.00), matching the mock exactly.
 * rawString() reads the input's literal text, so 10 stays 10 and an empty box renders "Tax (%)".
 */
const ICX_TOTALS = `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var busy = false;
  function el(name) { return scope.querySelector('[name="' + name + '"]'); }
  function rawString(name) { var e = el(name); return e ? String(e.value || '') : ''; }
  function num(name) {
    var v = parseFloat(rawString(name).replace(/[^0-9.\\-]/g, ''));
    return isNaN(v) ? 0 : v;
  }
  function money(n) { return '$' + (n || 0).toFixed(2); }
  function set(k, text) {
    var n = scope.querySelectorAll('[data-mf-echo="' + k + '"]');
    for (var i = 0; i < n.length; i++) n[i].textContent = text;
  }
  function paint() {
    if (busy) return;
    var sub = num('grand_total');
    var tax = sub * (num('tax_pct') / 100);
    var disc = sub * (num('discount_pct') / 100);
    var total = sub + tax - disc;
    set('__sub', money(sub));
    set('__tax', money(tax));
    set('__disc', '-' + money(disc));
    set('__total', money(total));
    set('__tax_label', 'Tax (' + rawString('tax_pct') + '%)');
    set('__disc_label', 'Discount (' + rawString('discount_pct') + '%)');
    var due = el('total_due');
    var want = total.toFixed(2);
    if (due && String(due.value || '') !== want) {
      busy = true;
      due.value = want;
      try { due.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* older host */ }
      busy = false;
    }
    var cells = scope.querySelectorAll('.icx-items .mfw-dgrid-computed-val');
    for (var j = 0; j < cells.length; j++) {
      var t = String(cells[j].textContent || '');
      var n2 = parseFloat(t.replace(/[^0-9.\\-]/g, ''));
      if (isNaN(n2)) continue;
      var out = money(n2);
      if (t !== out) cells[j].textContent = out;
    }
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  // A DataGrid row is added or removed by a click; its total lands after its own handler runs.
  scope.addEventListener('click', function(){ setTimeout(paint, 80); }, true);
  setTimeout(paint, 150); setTimeout(paint, 700); paint();
})();`;

// ─────────────────────────────────────────────────────────────────────────────
// The spec.
//
// exactCss is a memoised GETTER rather than a plain string for the cycle reason above: it calls
// wrapperReset/controlReset/asset/svgUrl, and those bindings do not exist yet while this module's
// body is running. buildCss reads spec.exactCss twice (once to test it, once to use it), hence the
// memo — the getter is otherwise indistinguishable from the string it replaces.
// ─────────────────────────────────────────────────────────────────────────────
let icxCssMemo = null;

export const ICX = {
  slug: ICX_SLUG,
  title: 'Invoice \u2014 Codexo Design Studio',
  description:
    'Four-step Codexo invoice: a 256px blue sidebar carrying the studio lockup, contact block and '
    + 'a vertical step rail, beside an INVOICE masthead with a live bill-to line and a four-cell '
    + 'meta grid; then client fields, a line-item grid with live subtotal, tax, discount and total, '
    + 'payment chips with bank and signature blocks, and a review panel over a terms box. '
    + 'Transcribed from the invoice-codexo mock.',
  category: 'invoice',
  categories: ['invoice', 'premium', 'finance'],
  icon: 'file-text',
  prefix: 'icx',
  // The mock's card is shadow-only. House rule after the border audit: once the page background is
  // stripped, a white body on a white pane has no edge at all, so the design's outer box states the
  // border itself in the mock's own border colour, at the radius that box already has.
  outerBorder: { sel: '.icx-card', radius: 16 },
  fontStack: INTER,
  fontImport:
    `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700`
    + `&family=Barlow:wght@700;800&display=swap');`,
  wizard: { steps: ICX_STEPS, nextLabel: 'Next', backLabel: 'Back' },
  submitLabel: 'Send Invoice',
  successTitle: 'Invoice confirmed',
  successMessage: 'Invoice submitted.',
  successBody:
    'Invoice for {{field:bill_to_name}} has been submitted. Total: ${{field:total_due}}',
  // C.blueMid #1A7FCC is declared in the mock and referenced nowhere in its 560 lines, so it is
  // deliberately absent here.
  palette: {
    primary: '#0E6EB8', accent: '#00B4D8', surface: '#FFFFFF', text: '#1A1A2E',
    muted: '#6B7280', border: '#D1E4F5', onPrimary: '#FFFFFF', deco: '#00B4D8',
    page: '#F0F5FB', inputBg: '#F7FAFD',
  },

  // The required set is deliberately minimal. gateNavigationUntilValid blocks Next on EVERY
  // required field of the current page, and the mock's gates are invoiceTo (step 0),
  // items.some(description) (step 1, always true with the seed), payMethod (step 2, always true
  // because it is defaulted) and terms (step 3). Marking bill_to_email required would block a Next
  // the mock never blocks.
  exactFields: [
    ...stepSections(ICX_STEPS).slice(0, 1),
    field('bill_to_name', 'Text', 'Company / Name *', {
      required: true, placeholder: 'Trika Company',
    }),
    field('bill_to_email', 'Email', 'Email', { placeholder: 'client@company.com' }),
    field('bill_to_addr', 'Text', 'Street Address', { placeholder: 'Your Business Address' }),
    // Text, not Phone: the mock's input carries no type attribute.
    field('bill_to_phone', 'Text', 'Phone', { placeholder: '+1 (888) 000-0000' }),
    field('bill_to_city', 'Text', 'City / State', { placeholder: 'New York, NY' }),
    // No placeholder in the mock; editable, and it feeds the masthead live.
    field('invoice_no', 'Text', 'Order ID', { defaultValue: 'ORD-2025-001' }),
    field('client_id', 'Text', 'Client ID', { placeholder: 'CLT-001' }),
    // The mock has no placeholder on either date; mm/dd/yyyy is the 08-08C house patch that stops
    // MegaForm's own date string leaking into an English template.
    field('invoice_date', 'Date', 'Invoice Date', { placeholder: 'mm/dd/yyyy' }),
    field('due_date', 'Date', 'Due Date', { placeholder: 'mm/dd/yyyy' }),

    ...stepSections(ICX_STEPS).slice(1, 2),
    field('items', 'DataGrid', 'Line items', {
      defaultValue: JSON.stringify(ROWS_ICX),
      widgetProps: {
        editMode: 'inline', allowAdd: true, allowDelete: true, stickyHeader: false,
        displayTemplate: 'grid',
        // removeItem in the mock has no floor and an empty table shows nothing at all; the widget
        // always prints something, so it prints this rather than an unexplained blank.
        emptyMessage: 'No services yet \u2014 use Add service.',
        // The mock has NO qty column: Price is identically Rate.
        totalFormula: 'Sum("rate")',
        totalField: 'grand_total',
        columns: [
          {
            key: 'description', label: 'Description', type: 'text',
            placeholder: 'Service name', width: 'minmax(96px,1fr)',
          },
          // The mock stacks description and note inside ONE grid cell. A DataGrid column renders
          // exactly one editor and the row is display:contents, so note becomes its own column
          // rather than losing the data. This is the one structural deviation in the conversion.
          {
            key: 'note', label: 'Note', type: 'text',
            placeholder: 'Short note\u2026', width: 'minmax(80px,.75fr)',
          },
          { key: 'code', label: 'Code', type: 'text', placeholder: '\u2014', width: '88px' },
          { key: 'rate', label: 'Rate ($)', type: 'currency', decimals: 2, width: '108px' },
          {
            key: 'line_total', label: 'Price', type: 'computed', decimals: 2,
            computeFormula: 'rate * 1', width: '108px',
          },
        ],
      },
    }),
    // The DataGrid's total sink. Read-only so nobody edits a derived number.
    field('grand_total', 'Number', 'Items total', { properties: { readOnly: true } }),
    // Written by icx_totals so the success screen can interpolate the REAL total rather than the
    // subtotal the DataGrid sinks into grand_total.
    field('total_due', 'Number', 'Total due', { properties: { readOnly: true } }),
    field('tax_pct', 'Number', 'Tax Rate (%)', { defaultValue: '10' }),
    field('discount_pct', 'Number', 'Discount (%)', { defaultValue: '0' }),
    // Placeholder and default differ by exactly one character — an ellipsis against a full stop —
    // as the mock has them.
    field('notes', 'Textarea', 'Notes', {
      placeholder: 'Thank you for your business\u2026',
      defaultValue: 'Thank you for your business.',
    }),

    ...stepSections(ICX_STEPS).slice(2, 3),
    // The mock uses four bare buttons with no role and no radio grouping. A real Radio group is
    // better a11y at identical pixels; .mf-option-check is hidden by controlReset().
    choiceField('pay_method', 'Radio', 'Payment Method',
      ['Bank Transfer', 'Credit Card', 'Cheque', 'Online Transfer'], 'chips', null,
      { required: true, defaultValue: 'Bank Transfer' }),
    // Every placeholder on this page IS the label — the mock passes placeholder={l}.
    field('bank_name', 'Text', 'Bank Name', { placeholder: 'Bank Name' }),
    field('account_no', 'Text', 'Account No.', { placeholder: 'Account No.' }),
    field('swift_code', 'Text', 'Swift Code', { placeholder: 'Swift Code' }),
    field('bank_address', 'Text', 'Bank Address', { placeholder: 'Bank Address' }),
    field('signer_name', 'Text', 'Name', { placeholder: 'Full name' }),
    field('designation', 'Text', 'Designation', { placeholder: 'Senior Designer' }),

    ...stepSections(ICX_STEPS).slice(3, 4),
    // The mock uses a fake button role=checkbox with hard-px 16/16/16. A real input at 16x16 with a
    // 1.5px border and the same checked fill plus a 10x10 white check reads identically.
    choiceField('terms', 'Checkbox', 'Declaration', [{
      label: 'I confirm this invoice is accurate and agree to the terms above'
        + '<span class="icx-req">*</span>',
      value: 'yes',
    }], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const DASH = '\u2014';

    const contact = (mod, text) => `<div class='${p}-c-row'>`
      + `<span class='${p}-c-ico ${p}-c-ico-${mod}' aria-hidden='true'></span>`
      + `<span>${text}</span></div>`;

    // 0-based data-step, and no connector element: the mock draws no line between rail rows, which
    // also sidesteps the dead LINE_SELECTOR class the generic rail carries.
    const rail = ICX_STEPS.map((st, i) =>
      `<div class='${p}-rail-row' data-mf-native-step='1' data-step='${i}'>`
      + `<span class='${p}-rail-b'>${st.num}</span>`
      + `<span class='${p}-rail-t'><span class='${p}-rail-l'>${st.label}</span>`
      + `<span class='${p}-rail-s'>${st.sub}</span></span></div>`).join('');

    const metaRow = (label, key) => `<span class='${p}-meta-k'>${label}</span>`
      + `<span class='${p}-meta-v' data-mf-echo='${key}'>${DASH}</span>`;

    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;

    const tRow = (labelHtml, valueKey) => `<div class='${p}-t-row'>${labelHtml}`
      + `<span data-mf-echo='${valueKey}'>${DASH}</span></div>`;

    const rCell = (label, key, extra = '') => `<div class='${p}-r-cell'>`
      + `<div class='${p}-r-k'>${label}</div>`
      + `<div class='${p}-r-v${extra}' data-mf-echo='${key}'>${DASH}</div></div>`;

    const signCell = (label) => `<div class='${p}-sign-c'>`
      + `<div class='${p}-sign-h'></div><div class='${p}-sign-k'>${label}</div></div>`;

    // Attribute presence is the contract with the renderer; the .icx-* classes are styling only.
    // The bare <span> on step 1 preserves space-between with no Back button.
    const nav = (i, last) => `<div class='${p}-nav'>`
      + (i > 0
        ? `<button type='button' class='${p}-back' data-mf-native-back='1'>`
          + `<span class='${p}-ico ${p}-ico-l' aria-hidden='true'></span>Back</button>`
        : `<span></span>`)
      + (last
        ? `<button type='submit' class='${p}-submit' data-mf-native-submit='1'>Send Invoice`
          + `<span class='${p}-ico ${p}-ico-c' aria-hidden='true'></span></button>`
        : `<button type='button' class='${p}-next' data-mf-native-next='1'>Next`
          + `<span class='${p}-ico ${p}-ico-r' aria-hidden='true'></span></button>`)
      + `</div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-card'>`

      // ── row 1: blue sidebar + right masthead ──────────────────────────────
      + `<div class='${p}-head'>`
      + `<div class='${p}-side'>`
      + `<div class='${p}-mast'>`
      + `<div class='${p}-logo'><span class='${p}-logo-img'>`
      + `<img class='${p}-content-image' src='{{content:logo_image}}' alt='' aria-hidden='true'>`
      + `</span></div>`
      + `<div class='${p}-brand'><div class='${p}-brand-a'>CODEXO</div>`
      + `<div class='${p}-brand-b'>DESIGN STUDIO</div></div>`
      + `<div class='${p}-contacts'>`
      + contact('p', '+1 (888) 555-0200')
      + contact('m', 'hello@codexo.studio')
      + contact('g', 'www.codexo.studio')
      + contact('a', '456 Design Blvd, NY 10001')
      + `</div>`
      + `<div class='${p}-mast-pad'></div>`
      + `</div>`
      + `<div class='${p}-wave' role='presentation'></div>`
      + `<div class='${p}-rail'>${rail}</div>`
      + `</div>`
      + `<div class='${p}-head-r'>`
      + `<div class='${p}-head-l'>`
      + `<div class='${p}-mark'>INVOICE</div>`
      // The trailing space after the colon is literal, as the mock has it.
      + `<div class='${p}-to'><span class='${p}-to-k'>Invoice To: </span>`
      + `<span class='${p}-to-v' data-mf-echo='bill_to_name'>${DASH}</span></div>`
      + `</div>`
      // The masthead says "Date" where the FORM says "Invoice Date" — the mock's own wording.
      + `<div class='${p}-meta'>`
      + metaRow('Order ID', 'invoice_no')
      + metaRow('Client ID', 'client_id')
      + metaRow('Date', 'invoice_date')
      + metaRow('Due Date', 'due_date')
      + `</div>`
      + `</div></div>`

      // A sibling of BOTH rows, so the rule crosses the sidebar as it does in the mock.
      + `<div class='${p}-divide' role='presentation'></div>`

      // ── row 2: empty gutter under the sidebar + the form column ───────────
      + `<div class='${p}-body'>`
      + `<div class='${p}-gutter'></div>`
      + `<div class='${p}-main'>`
      + `{{script:wizard_pages}}{{script:icx_totals}}{{script:icx_recap}}`

      // step 01 — client ----------------------------------------------------
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='0'>{{field:step_1}}`
      + `<div class='${p}-eyebrow'>Invoice To</div>`
      + `<div class='${p}-g2'>${fld('Company / Name *', 'bill_to_name')}${fld('Email', 'bill_to_email')}</div>`
      + `<div class='${p}-g2'>${fld('Street Address', 'bill_to_addr')}${fld('Phone', 'bill_to_phone')}</div>`
      + `<div class='${p}-g3'>${fld('City / State', 'bill_to_city')}${fld('Order ID', 'invoice_no')}`
      + `${fld('Client ID', 'client_id')}</div>`
      + `<div class='${p}-g2'>${fld('Invoice Date', 'invoice_date')}${fld('Due Date', 'due_date')}</div>`
      + nav(0, false) + `</div>`

      // step 02 — services --------------------------------------------------
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='1'>{{field:step_2}}`
      + `<div class='${p}-eyebrow ${p}-eyebrow-s'>Description of Services</div>`
      + `<div class='${p}-items'>{{field:items}}</div>`
      + `<div class='${p}-totals'>`
      + tRow(`<span>Subtotal</span>`, '__sub')
      + tRow(`<span data-mf-echo='__tax_label'>Tax (10%)</span>`, '__tax')
      + tRow(`<span data-mf-echo='__disc_label'>Discount (0%)</span>`, '__disc')
      + `<div class='${p}-t-tot'><span>Total</span>`
      + `<span data-mf-echo='__total'>${DASH}</span></div>`
      + `</div>`
      + `<div class='${p}-g2r'>${fld('Tax Rate (%)', 'tax_pct')}${fld('Discount (%)', 'discount_pct')}</div>`
      + `<div class='${p}-notes'>${fld('Notes', 'notes')}</div>`
      + `<div class='${p}-hidden'>{{field:grand_total}}{{field:total_due}}</div>`
      + nav(1, false) + `</div>`

      // step 03 — payment and signature -------------------------------------
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='2'>{{field:step_3}}`
      + `<div class='${p}-sec'>`
      + `<div class='${p}-eyebrow'>Payment Method</div>`
      + `<div class='${p}-pays'>{{field:pay_method}}</div>`
      + `<div class='${p}-g2b'>${fld('Bank Name', 'bank_name')}${fld('Account No.', 'account_no')}`
      + `${fld('Swift Code', 'swift_code')}${fld('Bank Address', 'bank_address')}</div>`
      + `</div>`
      + `<div class='${p}-hr' role='presentation'></div>`
      + `<div class='${p}-sec'>`
      + `<div class='${p}-eyebrow'>Authorised Signature</div>`
      + `<div class='${p}-g2b'>${fld('Name', 'signer_name')}${fld('Designation', 'designation')}</div>`
      // Both boxes are decorative and capture nothing in the mock: no input, no canvas, no pad, and
      // no new Date() anywhere in its 560 lines. Nothing is invented to fill them.
      + `<div class='${p}-sign'>${signCell('Signature')}${signCell('Date')}</div>`
      + `</div>`
      + nav(2, false) + `</div>`

      // step 04 — confirm ---------------------------------------------------
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='3'>{{field:step_4}}`
      + `<div class='${p}-review'>`
      + rCell('Client', 'bill_to_name')
      + rCell('Order ID', 'invoice_no')
      + rCell('Invoice Date', 'invoice_date')
      + rCell('Due Date', 'due_date')
      + rCell('Subtotal', '__sub')
      + rCell('Tax', '__tax')
      + rCell('Total', '__total', ' is-total')
      + rCell('Payment', 'pay_method')
      + `</div>`
      + `<div class='${p}-terms'><div class='${p}-terms-h'>Terms &amp; Conditions</div>`
      + `Payment is due within 30 days of invoice date. Late payments may be subject to a 1.5% `
      + `monthly finance charge. All work remains property of Codexo Design Studio until payment `
      + `is received in full.</div>`
      + `<div class='${p}-consent'>{{field:terms}}</div>`
      + nav(3, true) + `</div>`

      + `</div></div>`

      // ── footer strip with the corner swoosh ───────────────────────────────
      + `<div class='${p}-foot'><div class='${p}-swoosh' aria-hidden='true'></div></div>`

      + `</div></div></div></div>`;
  },

  customScripts: {
    wizard_pages: ICX_WIZARD_PAGES,
    icx_totals: ICX_TOTALS,
    icx_recap: ICX_RECAP,
  },

  get exactCss() {
    if (icxCssMemo) return icxCssMemo;
    icxCssMemo = `
${wrapperReset('icx')}
/* root, page band, card -------------------------------------------------- */
@S@{container-type:inline-size;font-family:${INTER}!important;color:#1A1A2E}
/* .icx-page and .icx-shell record the mock's own outer band. buildCss force-appends
   padding:0/background:transparent/max-width:none over both of them after this block, which is the
   owner's 08-08C ruling: the template ships body + border and spans the pane. Kept so the mock's
   geometry is on record. The sidebar stays 256px; only the content column widens, so every
   content-column width below is fr/auto and nothing hard-codes the mock's 704px. */
@S@.icx-page{background:#F0F5FB}
@S@.icx-shell{max-width:1024px;margin:0 auto}
@S@.icx-card{overflow:hidden;border-radius:16px;background:#FFFFFF;
  box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}

/* row 1 - sidebar and masthead ------------------------------------------- */
/* Masthead height 32+64+12+34.5+12+(8+78)+12+8 = 260.5px; the contacts block is 4x15 + 3x6 = 78px;
   the wave is 256 x 28/240 - 1 = 28.867px. Row-1 sidebar totals about 471.4px against the right
   header's 132.5px, so the sidebar drives the row height - both columns are align-items:stretch. */
@S@.icx-head{display:flex;align-items:stretch}
@S@.icx-side{flex:0 0 256px;width:256px;background:#0E6EB8}
@S@.icx-mast{display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px 24px 0}
@S@.icx-logo{display:flex;align-items:center;justify-content:center;width:64px;height:64px;
  overflow:hidden;border-radius:12px;background:rgba(255,255,255,.15)}
@S@.icx-logo-img{display:block;width:52px;height:52px;
  position:relative;overflow:hidden;
  background-image:${asset(ICX_SLUG, 'codexo-logo.png')};
  background-size:contain;background-position:center;background-repeat:no-repeat}
@S@img.icx-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:contain!important;object-position:center!important;
  border:0!important;border-radius:0!important;pointer-events:none!important}
@S@.icx-brand{text-align:center}
@S@.icx-brand-a{font-family:${BARLOW}!important;font-size:13px;line-height:19.5px;font-weight:700;
  letter-spacing:normal;color:#FFFFFF}
@S@.icx-brand-b{font-size:10px;line-height:15px;font-weight:500;letter-spacing:3px;
  color:rgba(255,255,255,.6)}
@S@.icx-contacts{display:flex;flex-direction:column;gap:6px;width:100%;margin-top:8px;
  font-size:10px;line-height:15px;font-weight:400;color:rgba(255,255,255,.7)}
@S@.icx-c-row{display:flex;align-items:flex-start;gap:6px}
@S@.icx-c-ico{display:block;flex:0 0 10px;width:10px;height:10px;margin-top:2px;
  background-size:10px 10px;background-position:center;background-repeat:no-repeat}
@S@.icx-c-ico-p{background-image:${lucidePhone('rgba(255,255,255,0.5)')}}
@S@.icx-c-ico-m{background-image:${lucideMail('rgba(255,255,255,0.5)')}}
@S@.icx-c-ico-g{background-image:${lucideGlobe('rgba(255,255,255,0.5)')}}
@S@.icx-c-ico-a{background-image:${lucideMapPin('rgba(255,255,255,0.5)')}}
/* the mock's pb-2 w-full: 8px of height and nothing else */
@S@.icx-mast-pad{width:100%;height:8px}
@S@.icx-wave{height:29.87px;margin-top:-1px;background-image:${icxWave()};
  background-size:100% 100%;background-repeat:no-repeat}

/* step rail, vertical, inside the sidebar --------------------------------- */
/* Deterministic height 16 + 4x31.5 + 3x8 + 16 = 182px, because each row is driven by the 31.5px
   two-line text block, not by the 24px bubble. No connector lines: the mock has none. */
@S@.icx-rail{padding:16px 24px}
@S@.icx-rail-row{display:flex;align-items:center;gap:10px}
@S@.icx-rail-row+.icx-rail-row{margin-top:8px}
@S@.icx-rail-b{display:flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;
  height:24px;border:0;border-radius:9999px;background:rgba(255,255,255,.15);
  color:rgba(255,255,255,.5);font-size:10px;line-height:15px;font-weight:700;
  transition:all .15s cubic-bezier(.4,0,.2,1)}
@S@.icx-rail-t{display:flex;flex-direction:column}
@S@.icx-rail-l{font-size:11px;line-height:16.5px;font-weight:600;color:rgba(255,255,255,.45)}
@S@.icx-rail-s{font-size:10px;line-height:15px;font-weight:400;color:rgba(255,255,255,.3)}
/* the renderer toggles is-active / is-done on [data-mf-native-step] */
@S@.icx-rail-row.is-active .icx-rail-b{background:#FFFFFF;color:#0E6EB8}
@S@.icx-rail-row.is-active .icx-rail-l,@S@.icx-rail-row.is-done .icx-rail-l{color:#FFFFFF}
@S@.icx-rail-row.is-active .icx-rail-s,@S@.icx-rail-row.is-done .icx-rail-s{
  color:rgba(255,255,255,.65)}
/* completed: cyan disc, the number REPLACED by a 12x12 blue check at stroke-width 3 */
@S@.icx-rail-row.is-done .icx-rail-b{background:#00B4D8;color:transparent;font-size:0;
  background-image:${lucideCheck('#0E6EB8')};background-size:12px 12px;
  background-position:center;background-repeat:no-repeat}

/* row 1 - right header ---------------------------------------------------- */
/* -.025em at 36px is -0.9px. .is-empty is toggled by icx_recap, which is how the mock's italic
   em-dash fallback is reproduced. */
@S@.icx-head-r{flex:1 1 auto;min-width:0;display:flex;align-items:flex-start;
  justify-content:space-between;padding:32px}
@S@.icx-mark{font-family:${BARLOW}!important;font-size:36px;line-height:40px;font-weight:800;
  letter-spacing:-.025em;color:#0A4F85}
@S@.icx-to{margin-top:12px;font-size:11px;line-height:16.5px;font-weight:400;color:#6B7280}
@S@.icx-to-k{font-weight:600;color:#1A1A2E}
@S@.icx-to-v.is-empty{font-style:italic}
@S@.icx-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px;row-gap:6px;
  margin-top:4px;font-size:11px;line-height:16.5px;text-align:right}
@S@.icx-meta-k{text-align:right;font-weight:600;color:#6B7280}
@S@.icx-meta-v{font-weight:400;color:#1A1A2E}

/* divider, body row, gutter, footer --------------------------------------- */
/* rgba(14,110,184,.031) is the mock's C.blue + "08" - an EIGHT-digit hex whose alpha 0x08 is
   8/255 = 3.137%. It is not an opaque colour and not an 8px token.
   background-size:contain on a 176x112 box with an intrinsic 180:120 ratio reproduces the SVG's
   preserveAspectRatio="xMidYMid meet" exactly: content 168x112, letterboxed 4px each side. */
@S@.icx-divide{height:2px;margin:0 32px;background:#D1E4F5}
@S@.icx-body{display:flex;align-items:stretch}
@S@.icx-gutter{flex:0 0 256px;width:256px;background:rgba(14,110,184,.031)}
@S@.icx-main{flex:1 1 auto;min-width:0;padding:28px 32px}
@S@.icx-foot{position:relative;height:80px;overflow:hidden;background:#F0F5FB}
@S@.icx-swoosh{position:absolute;right:0;bottom:0;width:176px;height:112px;pointer-events:none;
  background-image:${icxSwoosh()};background-size:contain;background-position:center;
  background-repeat:no-repeat}

/* eyebrows, labels, grids ------------------------------------------------- */
@S@.icx-eyebrow{margin-bottom:12px;font-size:11px;line-height:16.5px;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:#0E6EB8}
/* step 02's eyebrow uses mb-4, not mb-3 */
@S@.icx-eyebrow-s{margin-bottom:16px}
@S@.icx-field{display:block;margin:0}
@S@.icx-label{display:block;margin:0 0 2px;font-size:11px;line-height:16.5px;font-weight:600;
  letter-spacing:.05em;text-transform:uppercase;color:#6B7280}
@S@.icx-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
@S@.icx-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
@S@.icx-g2b{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
@S@.icx-g2r{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
@S@.icx-pg>.icx-g2+.icx-g2,@S@.icx-pg>.icx-g2+.icx-g3,@S@.icx-pg>.icx-g3+.icx-g2{margin-top:20px}
/* space-y-5 wins over the eyebrow's own mb-3 */
@S@.icx-eyebrow+.icx-g2{margin-top:20px}
@S@.icx-notes{margin-top:16px}
@S@.icx-hidden{display:none}
@S@.icx-sec+.icx-hr,@S@.icx-hr+.icx-sec{margin-top:24px}
@S@.icx-hr{height:1px;background:#D1E4F5}

/* controls ---------------------------------------------------------------- */
/* controlReset() also hides .mf-section-break/.mf-section-title, which is what stops step_1 - whose
   pageBreak is false - painting a visible "Client" heading the mock has no room for. */
${controlReset()}
/* the underline field, exactly the mock's inp string */
@S@.mf-input[class],@S@.mf-select[class]{width:100%!important;box-sizing:border-box!important;
  border:0!important;border-bottom:1px solid #D1E4F5!important;border-radius:0!important;
  background:transparent!important;padding:0 0 6px!important;min-height:0!important;
  height:auto!important;color:#1A1A2E!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;font-weight:400!important;
  box-shadow:none!important;appearance:none!important;-webkit-appearance:none!important}
/* the mock declares ZERO focus variants in 560 lines - the border does not change on focus */
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-bottom-color:#D1E4F5!important;
  box-shadow:none!important;outline:none!important}
@S@.mf-input[class]::placeholder,@S@.mf-textarea[class]::placeholder{color:#B0C4D8!important;
  opacity:1}
/* tax_pct / discount_pct are Number here but type="text" in the mock, so no spinner */
@S@.mf-input[type="number"][class]{-moz-appearance:textfield!important}
@S@.mf-input[type="number"][class]::-webkit-outer-spin-button,
@S@.mf-input[type="number"][class]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
/* rows=2 at 14/20 with pt-1 pb-1.5 gives 40 + 4 + 6 = 50px */
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;border:0!important;
  border-bottom:1px solid #D1E4F5!important;border-radius:0!important;
  background:transparent!important;padding:4px 0 6px!important;min-height:50px!important;
  height:50px!important;resize:none!important;color:#1A1A2E!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:400!important;box-shadow:none!important}

/* line-item grid ---------------------------------------------------------- */
/* The widget's baked stylesheet is #mf-datagrid-styles; everything here overrides it inside
   .icx-items. Header and body necessarily share one grid-template-columns, so the ~24px
   header/body track offset the mock has cannot be reproduced - aligning is the better result and
   is recorded here so nobody "fixes" it later. */
@S@.icx-items .mfw-dgrid{display:flex!important;flex-direction:column;border:0!important;
  border-radius:0!important;background:transparent!important;margin:0!important;
  max-height:none!important;overflow:visible!important;font-family:inherit!important}
/* the mock's Add control sits BELOW the table, so the toolbar is reordered */
@S@.icx-items .mfw-dgrid-grid{order:1}
@S@.icx-items .mfw-dgrid-toolbar{order:2;position:static!important;justify-content:flex-start;
  padding:12px 0 0!important;border:0!important;background:transparent!important}
/* "Total (-> grand_total) 0.00" - the mock's totals live in .icx-totals */
@S@.icx-items .mfw-dgrid-foot{display:none!important}
/* "Items - 5 rows" */
@S@.icx-items .mfw-dgrid-title{display:none!important}
/* The mock's tracks are CONTENT widths; ours carry 4px/8px of cell padding, so add it back:
   80+8=88, 100+8=108, 100+8=108, and 32+12=44 for the widget's own hardcoded action track. */
@S@.icx-items .mfw-dgrid-grid[style]{
  grid-template-columns:minmax(96px,1fr) minmax(80px,.75fr) 88px 108px 108px 44px!important;
  column-gap:0!important;row-gap:4px!important}
/* header: no fill, blue 11px/700 uppercase .025em (tracking-WIDE, not widest) */
@S@.icx-items .mfw-dgrid-head-cell{position:static!important;min-height:0!important;
  padding:0 4px 0!important;border:0!important;background:transparent!important;
  color:#0E6EB8!important;font-size:11px!important;line-height:16.5px!important;
  font-weight:700!important;letter-spacing:.025em!important;text-transform:uppercase!important}
@S@.icx-items .mfw-dgrid-head-cell:first-child{padding-left:8px!important}
@S@.icx-items .mfw-dgrid-head-cell:nth-child(3){justify-content:center}
@S@.icx-items .mfw-dgrid-head-cell:nth-child(4),
@S@.icx-items .mfw-dgrid-head-cell:nth-child(5){justify-content:flex-end}
/* rows are display:contents, so the tint and the 4px radius live on the CELLS */
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell{min-height:0!important;padding:6px 4px!important;
  border:0!important;background:#F7FAFD!important}
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell:first-child{padding-left:8px!important;
  border-radius:4px 0 0 4px}
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell:last-child{padding-right:8px!important;
  border-radius:0 4px 4px 0;justify-content:center!important;gap:0!important}
/* alternation: child 1 is .mfw-dgrid-head, so row index i is child i+2.
   i=0,2,4 -> even -> #F7FAFD (altRow); i=1,3 -> odd -> #D6EBFA (rowBlue). */
@S@.icx-items .mfw-dgrid-row:nth-child(odd)>.mfw-dgrid-cell{background:#D6EBFA!important}
@S@.icx-items .mfw-dgrid-row:hover>.mfw-dgrid-cell{background:inherit}
/* cell typography, per track */
@S@.icx-items .mfw-dgrid-input{width:100%!important;border:0!important;
  background:transparent!important;padding:0!important;box-shadow:none!important;
  outline:none!important;font-family:inherit!important}
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell:nth-child(1) .mfw-dgrid-input{font-size:14px!important;
  line-height:20px!important;font-weight:500!important;color:#1A1A2E!important}
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell:nth-child(2) .mfw-dgrid-input{font-size:10px!important;
  line-height:15px!important;font-weight:400!important;color:#6B7280!important}
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell:nth-child(3) .mfw-dgrid-input{font-size:12px!important;
  line-height:16px!important;font-weight:400!important;color:#6B7280!important;
  text-align:center!important}
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell:nth-child(4) .mfw-dgrid-input{font-size:14px!important;
  line-height:20px!important;font-weight:400!important;color:#1A1A2E!important;
  text-align:right!important}
@S@.icx-items .mfw-dgrid-input::placeholder{color:#9CA3AF!important;opacity:1}
@S@.icx-items .mfw-dgrid-input[type="number"]{-moz-appearance:textfield!important}
@S@.icx-items .mfw-dgrid-input[type="number"]::-webkit-outer-spin-button,
@S@.icx-items .mfw-dgrid-input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;
  margin:0}
/* Price: computed, right, 600; blueDark on the blue rows - the only place blueDark appears in the
   body of the mock */
@S@.icx-items .mfw-dgrid-row>.mfw-dgrid-cell.is-computed{background:#F7FAFD!important;
  justify-content:flex-end!important}
@S@.icx-items .mfw-dgrid-row:nth-child(odd)>.mfw-dgrid-cell.is-computed{background:#D6EBFA!important}
@S@.icx-items .mfw-dgrid-computed-val{font-size:14px;line-height:20px;font-weight:600;color:#1A1A2E}
@S@.icx-items .mfw-dgrid-row:nth-child(odd) .mfw-dgrid-computed-val{color:#0A4F85}
/* delete: the widget renders a red multiplication sign; the mock is a 14x14 lucide Trash2 */
@S@.icx-items .mfw-dgrid-del{width:20px;height:20px;padding:2px!important;border:0!important;
  border-radius:4px!important;background:transparent!important;color:transparent!important;
  font-size:0!important;opacity:1!important;cursor:pointer;
  background-image:${lucideTrash2('#6B7280')}!important;background-size:14px 14px!important;
  background-position:center!important;background-repeat:no-repeat!important}
@S@.icx-items .mfw-dgrid-del:hover{opacity:.6!important;background-color:transparent!important}
/* add: the widget's label is a baked "+ Add row" */
@S@.icx-items .mfw-dgrid-add{display:inline-flex!important;align-items:center;gap:6px;
  padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;
  color:#0E6EB8!important;font-family:inherit!important;font-size:0!important;
  line-height:0!important;cursor:pointer!important}
@S@.icx-items .mfw-dgrid-add::before{content:'';display:block;flex:0 0 14px;width:14px;height:14px;
  background:${lucidePlus('#0E6EB8')} center/14px 14px no-repeat}
@S@.icx-items .mfw-dgrid-add::after{content:'Add service';font-size:12px;line-height:16px;
  font-weight:600;color:#0E6EB8}
@S@.icx-items .mfw-dgrid-add:hover{opacity:.7}
@S@.icx-items .mfw-dgrid-add:disabled{opacity:.4;cursor:not-allowed}
@S@.icx-items .mfw-dgrid-empty{padding:8px;font-size:12px;line-height:16px;font-weight:400;
  color:#6B7280}

/* totals block ------------------------------------------------------------ */
/* w-60 = 240px; px-4 py-2.5 = 16px/10px; text-base = 16px/24px. */
@S@.icx-totals{width:240px;margin:24px 0 0 auto;display:flex;flex-direction:column;gap:8px;
  font-size:14px;line-height:20px}
@S@.icx-t-row{display:flex;justify-content:space-between;font-weight:400;color:#6B7280}
@S@.icx-t-tot{display:flex;align-items:center;justify-content:space-between;
  padding:10px 16px;border-radius:8px;background:#0E6EB8;color:#FFFFFF;
  font-size:16px;line-height:24px;font-weight:700}

/* payment chips ----------------------------------------------------------- */
/* Chip box: 16 + 6 + 6 = 28px of content plus 1px of border top and bottom = 30px tall.
   controlReset() already hides .mf-option-check and lifts the min-height:36px floor off --chips. */
@S@.icx-pays{margin-bottom:16px}
@S@.icx-pays .mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.icx-pays .mf-option-group--chips .mf-option-ui{display:block;gap:0;
  padding:6px 14px;border:1px solid #D1E4F5;border-radius:9999px;background:#E8F2FB;
  color:#0E6EB8;font-size:12px;line-height:16px;font-weight:600;text-align:center;
  cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1)}
@S@.icx-pays .mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;
  font-weight:600;color:inherit}
@S@.icx-pays .mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.icx-pays .mf-option-group--chips input:checked+.mf-option-ui{background:#0E6EB8;
  border-color:#0E6EB8;color:#FFFFFF}

/* signature block --------------------------------------------------------- */
@S@.icx-sign{display:flex;gap:32px;margin-top:24px}
@S@.icx-sign-c{flex:1 1 0;min-width:0}
@S@.icx-sign-h{height:48px;border:0;border-bottom:2px solid #D1E4F5}
@S@.icx-sign-k{margin-top:4px;font-size:10px;line-height:15px;font-weight:400;
  letter-spacing:.025em;text-transform:uppercase;color:#6B7280}

/* review card, terms box, consent ----------------------------------------- */
@S@.icx-review{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:20px;
  border:1px solid #D1E4F5;border-radius:12px;background:#E8F2FB;font-size:14px;line-height:20px}
@container (min-width:640px){@S@.icx-review{grid-template-columns:repeat(2,minmax(0,1fr))}}
@S@.icx-r-cell{padding-bottom:8px;border-bottom:1px solid #D1E4F5}
@S@.icx-r-cell:last-child{border-bottom:0}
/* 11px inside a text-sm box: the unitless 1.4286 is inherited, so 15.71px and NOT 16.5px */
@S@.icx-r-k{font-size:11px;line-height:15.71px;font-weight:400;letter-spacing:.025em;
  text-transform:uppercase;color:#6B7280}
@S@.icx-r-v{font-size:14px;line-height:20px;font-weight:600;color:#1A1A2E}
@S@.icx-r-v.is-total{color:#0E6EB8}
@S@.icx-terms{margin-top:20px;padding:16px;border:1px solid #D1E4F5;border-radius:8px;
  background:#F7FAFD;font-size:12px;line-height:1.625;font-weight:400;color:#6B7280}
@S@.icx-terms-h{margin-bottom:6px;font-weight:700;letter-spacing:.025em;text-transform:uppercase;
  color:#0E6EB8}
@S@.icx-consent{margin-top:20px}
@S@.icx-consent .mf-option-item{display:flex;align-items:flex-start;gap:12px;margin:0!important}
@S@.icx-consent .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.icx-consent .mf-option-label{font-size:12px;line-height:1.625;font-weight:400;color:#6B7280}
@S@.icx-consent input[type="checkbox"],@S@.icx-consent .mf-option-control{
  appearance:none;-webkit-appearance:none;flex:0 0 16px!important;width:16px!important;
  height:16px!important;min-width:16px!important;margin:2px 0 0!important;
  border:1.5px solid #D1E4F5!important;border-radius:4px!important;background:#FFFFFF!important;
  cursor:pointer}
@S@.icx-consent input[type="checkbox"]:checked,@S@.icx-consent .mf-option-control:checked{
  border-color:#0E6EB8!important;
  background:#0E6EB8 ${lucideCheck('#ffffff')} center/10px 10px no-repeat!important}
/* text-red-400 under Tailwind v4.2.0 is oklch(70.4% .191 22.216), about #FF6467 - not v3's
   #F87171. There is no space before the asterisk, only the 2px margin. */
@S@.icx-req{margin-left:2px;color:#FF6467}

/* nav row ----------------------------------------------------------------- */
@S@.icx-nav{display:flex;align-items:center;justify-content:space-between;margin-top:32px}
@S@.icx-ico{display:block;flex:0 0 auto;background-position:center;background-repeat:no-repeat}
@S@.icx-ico-l{width:14px;height:14px;background-image:${lucideArrowLeft('#6B7280')};
  background-size:14px 14px}
@S@.icx-ico-r{width:16px;height:16px;background-image:${lucideArrowRight('#ffffff')};
  background-size:16px 16px}
@S@.icx-ico-c{width:16px;height:16px;background-image:${lucideCheck('#ffffff')};
  background-size:16px 16px}
@S@button.icx-back{display:inline-flex;align-items:center;gap:6px;padding:0!important;
  border:0!important;background:transparent!important;color:#6B7280!important;
  font-family:inherit!important;font-size:12px!important;line-height:16px!important;
  font-weight:600!important;text-transform:none!important;letter-spacing:normal!important;
  cursor:pointer!important;box-shadow:none!important}
@S@button.icx-back:hover{opacity:.7}
@S@button.icx-next,@S@button.icx-submit[type="submit"]{display:inline-flex;align-items:center;
  gap:6px;width:auto!important;padding:10px 24px!important;border:0!important;
  border-radius:8px!important;background:#0E6EB8!important;color:#FFFFFF!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  text-transform:none!important;letter-spacing:normal!important;cursor:pointer!important;
  box-shadow:none!important;transition:opacity .15s cubic-bezier(.4,0,.2,1)!important}
/* Next is font-semibold (600); Send Invoice is font-bold (700). They are NOT the same button. */
@S@button.icx-next{font-weight:600!important}
@S@button.icx-submit[type="submit"]{font-weight:700!important}
/* gateNavigationUntilValid writes inline opacity:.55; the mock's disabled state is .40 */
@S@button.icx-next.mf-nav-blocked,@S@button.icx-next[disabled],
@S@button.icx-submit.mf-nav-blocked,@S@button.icx-submit[disabled]{opacity:.4!important;
  background:#0E6EB8!important;color:#FFFFFF!important;cursor:not-allowed!important}
`;
    return icxCssMemo;
  },
};
