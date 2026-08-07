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
  {
    slug: 'newsletter-signup-amber',
    title: 'Newsletter Signup',
    description: 'Small amber-to-orange newsletter card: email, business type, and weekly/monthly frequency. Subscribe stays locked until the email is valid, and the thank-you repeats the address back.',
    category: 'contact',
    categories: ['contact', 'marketing'],
    icon: 'envelope',
    prefix: 'nlt',
    fontStack: SANS,
    displayFontStack: SANS,
    submitLabel: 'Subscribe',
    successMessage: 'Thank you for joining our newsletter.',
    successTitle: "You're subscribed!",
    successBody: 'Thank you for joining our newsletter. We will send it to {{field:email}}.',
    palette: {
      primary: '#F59E0B', accent: '#EA580C', surface: '#FFFFFF', text: '#1F2937',
      muted: '#6B7280', border: '#E5E7EB', onPrimary: '#FFFFFF', deco: '#EA580C', page: '#FFFBEB',
    },
    hero: {
      background: 'linear-gradient(135deg,#F59E0B 0%,#EA580C 100%)',
      padding: '30px 26px 26px',
      emblemIcon: 'fa-envelope',
      display: 'Newsletter Signup', displaySize: '26px', displayWeight: 800,
      subtitle: 'Get the latest updates delivered to your inbox.',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(255,255,255,.75)', onHeroSoft: 'rgba(255,255,255,.9)',
    },
    strips: [],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'rule',
    cardMaxWidth: '430px',
    cardRadius: '14px',
    submitBackground: 'linear-gradient(135deg,#F59E0B,#EA580C)',
    captions: {},
    optionColumns: {},
    fields: [
      field('email', 'Email', 'Email Address', { required: true, placeholder: 'you@example.com' }),
      choiceField('business_type', 'Select', 'Business Type',
        ['Startup', 'Small / Medium Business', 'Enterprise', 'Agency'], 'dropdown', null,
        { placeholder: 'Select type' }),
      choiceField('frequency', 'Checkbox', 'Frequency Preference', ['Weekly', 'Monthly'], 'chips'),
    ],
    sections: () => [
      { slots: [['Email Address *', 'email'], ['Business Type', 'business_type']] },
      { slots: [['Frequency Preference', 'frequency']] },
    ],
  },

  // ── job-application ────────────────────────────────────────────────────────
  // Save-and-resume is enabled: the endpoint, the renderer handler and the DNN button all exist
  // (FormView.ascx emits mf-btn-save-<id> under ViewModel.EnableSaveResume). It is the one mock
  // that asked for "save as draft", and it needs no new engine work — only the flag.
  {
    slug: 'job-application-northwind',
    title: 'Careers at Northwind — Job Application',
    description: 'Slate job application: personal info, position and experience, cover letter. Submit stays locked until the form is valid, and the thank-you names the role applied for. Save-and-resume enabled (DNN renders the Save Draft button).',
    category: 'hr',
    categories: ['hr', 'application'],
    icon: 'briefcase',
    prefix: 'job',
    fontStack: SANS,
    displayFontStack: SANS,
    submitLabel: 'Submit Application',
    successMessage: 'Application received. Our team will review it shortly.',
    successTitle: 'Application received',
    successBody: 'Thank you {{field:full_name}}. We have your application for {{field:position}} and will reply to {{field:email}}.',
    enableSaveResume: true,
    palette: {
      primary: '#0F172A', accent: '#334155', surface: '#FFFFFF', text: '#0F172A',
      muted: '#64748B', border: '#E2E8F0', onPrimary: '#FFFFFF', deco: '#64748B', page: '#F8FAFC',
    },
    hero: {
      background: 'linear-gradient(150deg,#0F172A 0%,#334155 100%)',
      padding: '34px 30px 28px',
      emblemIcon: 'fa-briefcase',
      eyebrow: 'Careers at', display: 'Northwind', displaySize: '38px', displayWeight: 800,
      subtitle: 'Tell us who you are and what you would like to build',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(255,255,255,.66)', onHeroSoft: 'rgba(255,255,255,.86)',
    },
    strips: [{ kind: 'tagline', text: 'Remote first · Four-day week · Equity for everyone' }],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'rule',
    cardMaxWidth: '620px',
    captions: {},
    optionColumns: { position: 1 },
    fields: [
      field('full_name', 'Text', 'Full name', { required: true, placeholder: 'Alex Morgan' }),
      field('email', 'Email', 'Email', { required: true, placeholder: 'alex@email.com' }),
      field('phone', 'Phone', 'Phone', { placeholder: '(555) 010-2233' }),
      field('linkedin', 'Url', 'LinkedIn or portfolio', { placeholder: 'https://…' }),
      choiceField('position', 'Radio', 'Position', [
        { label: 'Frontend Developer', value: 'frontend', description: 'TypeScript · design systems' },
        { label: 'Backend Developer', value: 'backend', description: 'C# · SQL · queues' },
        { label: 'Full Stack Developer', value: 'fullstack', description: 'Both of the above' },
        { label: 'UI/UX Designer', value: 'design', description: 'Research · prototypes · handoff' },
      ], 'cards', 1, { required: true }),
      choiceField('experience', 'Select', 'Years of experience',
        ['Less than 1', '1–3', '3–5', '5–8', '8+'], 'dropdown', null, { required: true, placeholder: 'Select experience' }),
      choiceField('availability', 'Select', 'Earliest start',
        ['Immediately', 'In 2 weeks', 'In a month', 'In 3 months'], 'dropdown', null, { placeholder: 'Select…' }),
      field('cover_letter', 'Textarea', 'Cover letter', {
        required: true,
        placeholder: 'What would you like to work on, and why here?',
        validation: { minLength: 80, customMessage: 'A short paragraph please — at least 80 characters.' },
      }),
      choiceField('terms', 'Checkbox', 'Consent',
        [{ label: 'I agree to Northwind storing my application for 12 months', value: 'yes' }],
        'list', null, { required: true }),
    ],
    sections: () => [
      {
        caption: 'Contact Information',
        grid: [['Full name *', 'full_name'], ['Email *', 'email'], ['Phone', 'phone'],
          ['LinkedIn or portfolio', 'linkedin']],
      },
      { caption: 'Position Details', slots: [['Position *', 'position']] },
      { grid: [['Years of experience *', 'experience'], ['Earliest start', 'availability']] },
      { caption: 'Cover Letter', slots: [['Cover letter *', 'cover_letter']] },
      { consent: [['Consent', 'terms']] },
    ],
  },

  // ── hotel-booking: form + LIVE sticky reservation summary ───────────────────
  {
    slug: 'lagoon-reserve-booking',
    title: 'Lagoon Reserve — Reservation',
    description: 'Cream, gold and burgundy hotel reservation with a STICKY summary aside that updates live as the guest types: dates, room, occupancy and requests mirror into the panel. Submit stays locked until the form is valid, and the confirmation names the guest.',
    category: 'booking',
    categories: ['booking', 'premium', 'hospitality'],
    icon: 'bed',
    prefix: 'lgn',
    fontStack: `'DM Sans','Inter',system-ui,sans-serif`,
    displayFontStack: SERIF,
    submitLabel: 'Confirm Reservation',
    successMessage: 'Reservation confirmed. A confirmation email is on its way.',
    successTitle: 'Reservation confirmed',
    successBody: 'Thank you {{field:first_name}}. Your {{field:room_type}} is held from {{field:check_in}} to {{field:check_out}} for {{field:guests}} guest(s). Confirmation sent to {{field:email}}.',
    palette: {
      primary: '#6B1E2E', accent: '#C8962C', surface: '#FFFFFF', text: '#1C1C1C',
      muted: '#9A8C7E', border: '#EDE8E0', onPrimary: '#FFFFFF', deco: '#C8962C', page: '#FDF8F0',
    },
    hero: {
      background: 'linear-gradient(155deg,#6B1E2E 0%,#3d0f1a 60%,#1C1C1C 100%)',
      padding: '40px 30px 32px',
      emblemIcon: 'fa-bed',
      eyebrow: 'Convenience & Luxury', display: 'Lagoon Reserve', displayItalic: true, displaySize: '44px',
      hairlineWord: 'est. 1908', subtitle: 'Stay a while',
      onHero: '#F0D898', onHeroMuted: 'rgba(240,216,152,.68)', onHeroSoft: 'rgba(255,255,255,.86)',
    },
    strips: [{ kind: 'tagline', text: 'Lagoon views · Spa · Two restaurants' }],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'rule',
    cardMaxWidth: '940px',
    cardRadius: '8px',
    captions: {},
    optionColumns: { room_type: 1 },
    asideWidth: '280px',
    asideHtml:
      `<div class='lgn-aside-title'>Your stay</div>`
      + asideRow('lgn', 'Guest', 'first_name')
      + asideRow('lgn', 'Check-in', 'check_in')
      + asideRow('lgn', 'Check-out', 'check_out')
      + asideRow('lgn', 'Guests', 'guests')
      + asideRow('lgn', 'Room', 'room_type')
      + asideRow('lgn', 'Occupancy', 'occupancy')
      + `<div class='lgn-aside-total'><span>Requests</span><span data-mf-echo='requests'>—</span></div>`,
    customScripts: {
      stay_summary: echoScript({ empty: '—' }),
    },
    fields: [
      field('first_name', 'Text', 'First name', { required: true, placeholder: 'Anna' }),
      field('last_name', 'Text', 'Last name', { required: true, placeholder: 'Müller' }),
      field('email', 'Email', 'Email', { required: true, placeholder: 'anna@email.eu' }),
      field('phone', 'Phone', 'Phone', { placeholder: '+49 170 1234567' }),
      choiceField('country', 'Select', 'Country',
        ['Germany', 'France', 'Spain', 'Italy', 'United Kingdom', 'United States', 'Japan', 'Other'],
        'dropdown', null, { required: true, placeholder: 'Select country' }),
      field('check_in', 'Date', 'Check-in date', { required: true }),
      field('check_out', 'Date', 'Check-out date', { required: true }),
      choiceField('guests', 'Select', 'Number of guests', ['1', '2', '3', '4', '5', '6+'],
        'dropdown', null, { defaultValue: '2' }),
      choiceField('room_type', 'Radio', 'Room', [
        { label: 'Lagoon Room', value: 'lagoon', description: '32 m² · lagoon view · king bed' },
        { label: 'Garden Suite', value: 'garden', description: '58 m² · terrace · separate living room' },
        { label: 'Reserve Villa', value: 'villa', description: '110 m² · private pool · butler' },
      ], 'cards', 1, { required: true }),
      choiceField('occupancy', 'Radio', 'Occupancy', ['Single', 'Double', 'Family'], 'cards', 3),
      field('requests', 'Textarea', 'Special requests', {
        placeholder: 'Late arrival, dietary needs, celebrations…',
      }),
      choiceField('newsletter', 'Checkbox', 'Newsletter',
        [{ label: 'Send me seasonal offers', value: 'yes' }], 'list'),
      choiceField('terms', 'Checkbox', 'Terms',
        [{ label: 'I agree to the reservation terms and privacy policy', value: 'yes' }], 'list',
        null, { required: true }),
    ],
    sections: () => [
      {
        caption: 'Guest Details',
        grid: [['First name *', 'first_name'], ['Last name *', 'last_name'], ['Email *', 'email'],
          ['Phone', 'phone']],
        slots: [['Country *', 'country']],
      },
      {
        caption: 'Dates & Occupancy',
        grid: [['Check-in date *', 'check_in'], ['Check-out date *', 'check_out'],
          ['Number of guests', 'guests']],
      },
      { caption: 'Room', slots: [['Room *', 'room_type'], ['Occupancy', 'occupancy']] },
      { caption: 'Requests', slots: [['Special requests', 'requests']] },
      { consent: [['Newsletter', 'newsletter'], ['Terms', 'terms']] },
      { script: 'stay_summary' },
    ],
  },

  // ── product-order: form + LIVE order total ─────────────────────────────────
  // ⚠️ PRICING RULE IS AN ASSUMPTION. The mock's own arithmetic is broken: handleItemChange never
  // writes item.price and addItem seeds price:0, so the $99 / $9.90 / $108.90 on its screen is a
  // fixture, not a computation — there was no correct behaviour to copy. Implemented here as the
  // only rule the mock's own labels support: unit price by plan (Starter 29, Pro 99), times
  // quantity, plus 10% tax. Enterprise is "Custom" in the mock, so it reports Quoted instead of a
  // number. Confirm or replace this rule.
  {
    slug: 'product-order-live-total',
    title: 'Product Order',
    description: 'Product order with a LIVE order summary aside: subtotal, 10% tax and total recompute as the plan and quantity change. Submit stays locked until the form is valid. The pricing rule is an assumption — the source mock never computed a price.',
    category: 'ecommerce',
    categories: ['ecommerce', 'order'],
    icon: 'shopping-cart',
    prefix: 'pod',
    fontStack: SANS,
    displayFontStack: SANS,
    submitLabel: 'Place Order',
    successMessage: 'Order received. A confirmation is on its way.',
    successTitle: 'Order received',
    successBody: 'Thank you {{field:full_name}}. Your order for {{field:product}} (x{{field:quantity}}) is confirmed and a receipt is on its way to {{field:email}}.',
    palette: {
      primary: '#4F46E5', accent: '#0EA5E9', surface: '#FFFFFF', text: '#0F172A',
      muted: '#64748B', border: '#E2E8F0', onPrimary: '#FFFFFF', deco: '#0EA5E9', page: '#F8FAFC',
    },
    hero: {
      background: 'linear-gradient(135deg,#4F46E5 0%,#0EA5E9 100%)',
      padding: '32px 28px 26px',
      emblemIcon: 'fa-shopping-cart',
      eyebrow: 'Checkout', display: 'Place your order', displaySize: '34px', displayWeight: 800,
      subtitle: 'Pick a plan, tell us where to ship',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(255,255,255,.72)', onHeroSoft: 'rgba(255,255,255,.9)',
    },
    strips: [],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'rule',
    cardMaxWidth: '940px',
    captions: {},
    optionColumns: { product: 1 },
    asideWidth: '270px',
    asideHtml:
      `<div class='pod-aside-title'>Order summary</div>`
      + asideRow('pod', 'Plan', 'product')
      + asideRow('pod', 'Quantity', 'quantity')
      + `<div class='pod-aside-row'><span>Subtotal</span><span data-mf-echo='__subtotal'>—</span></div>`
      + `<div class='pod-aside-row'><span>Tax (10%)</span><span data-mf-echo='__tax'>—</span></div>`
      + `<div class='pod-aside-total'><span>Total</span><span data-mf-echo='__total'>—</span></div>`
      + `<div class='pod-aside-note'>Enterprise is quoted per seat — we will confirm before charging.</div>`,
    extraCss: `@S@.pod-aside-note{margin-top:12px;font-size:11px;line-height:1.5;color:var(--pod-muted)}`,
    customScripts: {
      order_total: echoScript({
        money: {
          currency: '$', taxRate: 0.10, productField: 'product', qtyField: 'quantity',
          prices: { starter: 29, pro: 99 }, quoted: 'enterprise', quotedText: 'Quoted',
        },
      }),
    },
    fields: [
      field('full_name', 'Text', 'Full name', { required: true, placeholder: 'Alex Morgan' }),
      field('email', 'Email', 'Email', { required: true, placeholder: 'alex@email.com' }),
      field('phone', 'Phone', 'Phone', { placeholder: '(555) 010-2233' }),
      field('address', 'Text', 'Street address', { required: true, placeholder: '123 Main Street' }),
      field('city', 'Text', 'City', { required: true, placeholder: 'Portland' }),
      field('postcode', 'Text', 'Postal code', { required: true, placeholder: '97201' }),
      choiceField('country', 'Select', 'Country',
        ['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia', 'Other'],
        'dropdown', null, { required: true, placeholder: 'Select Country' }),
      choiceField('product', 'Radio', 'Product', [
        { label: 'Starter Plan', value: 'starter', description: '$29 per month · one workspace' },
        { label: 'Pro Plan', value: 'pro', description: '$99 per month · unlimited workspaces' },
        { label: 'Enterprise', value: 'enterprise', description: 'Custom · SSO, audit log, SLA' },
      ], 'cards', 1, { required: true }),
      choiceField('quantity', 'Select', 'Quantity', ['1', '2', '3', '5', '10', '25'],
        'dropdown', null, { defaultValue: '1', required: true }),
      field('order_notes', 'Textarea', 'Order notes', { placeholder: 'Purchase order number, delivery window…' }),
      choiceField('terms', 'Checkbox', 'Terms',
        [{ label: 'I agree to the terms of sale', value: 'yes' }], 'list', null, { required: true }),
    ],
    sections: () => [
      {
        caption: 'Personal Information',
        grid: [['Full name *', 'full_name'], ['Email *', 'email'], ['Phone', 'phone']],
      },
      {
        caption: 'Shipping Address',
        grid: [['Street address *', 'address'], ['City *', 'city'], ['Postal code *', 'postcode'],
          ['Country *', 'country']],
      },
      {
        caption: 'Order Items',
        slots: [['Product *', 'product']],
        grid: [['Quantity *', 'quantity']],
      },
      { caption: 'Notes', slots: [['Order notes', 'order_notes']] },
      { consent: [['Terms', 'terms']] },
      { script: 'order_total' },
    ],
  },
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
