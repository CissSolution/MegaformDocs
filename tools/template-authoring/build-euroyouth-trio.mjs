// Build the three EuroYouth-family premium templates from the mock designs at
// form-builder-controls/app/forms/{holiday-request,dance-competition,volunteer-application}.
//
//   node tools/template-authoring/build-euroyouth-trio.mjs
//
// Manifest-v2 / theme-compat rules these follow (see ThemeFirstPaintCssService):
//  * settings.themeCompatibility.policy = "hybrid" — opts the shell INTO borrowing the host
//    palette when the author turns on "colours from page". Without it the borrow is refused
//    for any template that declares its own palette vars.
//  * every layer token chains  var(--mf-page-<role>, var(--mf-preset-<role>, <authored>))
//    so the authored look is pixel-identical when borrowing is off, and the whole shell
//    recolours coherently when it is on.
//  * soft fills/borders are derived with color-mix() FROM the ink/surface tokens instead of
//    being hardcoded light greys. That is what makes these readable on stock Oqtane, whose
//    default theme is DARK — a literal #f4f4f6 fill would stay light-on-light there.
//    Only --bs-body-bg / --bs-body-color are dependable host vars; --bs-secondary-bg and
//    friends are LIGHT even on dark themes, so nothing load-bearing derives from them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outDirs = [
  path.join(repo, 'Samples', 'FormTemplates', 'Premium', 'DONEE'),
  path.join(repo, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm', 'Templates'),
];

/* ── field helpers ─────────────────────────────────────────────────────────── */

const base = {
  placeholder: '', helpText: '', defaultValue: '', cssClass: '', width: '100%',
  readOnly: false, prefillParam: '', validation: {}, options: [], showIf: null,
  htmlContent: '', fileSettings: null, properties: {},
};

const f = (key, type, label, extra = {}) => ({ ...base, key, type, label, required: false, ...extra });
const opts = (list) => list.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));

// The renderer reads the option layout from a different place on each platform, so every
// known spelling is written. Dropping one silently falls back to a plain radio list.
const display = (kind, columns) => ({
  optionDisplay: kind, choiceDisplay: kind, optionVariant: kind,
  ...(columns ? { optionColumns: columns } : {}),
  properties: { optionDisplay: kind, ...(columns ? { optionColumns: columns } : {}) },
  widgetProps: { optionDisplay: kind, ...(columns ? { optionColumns: columns } : {}) },
});

const cards = (key, label, list, { required = false, columns = 1, allowHtml = true } = {}) =>
  f(key, 'Radio', label, {
    required, options: opts(list), ...display('cards', columns),
    ...(allowHtml ? { allowOptionHtml: true } : {}),
  });

const chips = (key, label, list, { required = false, type = 'Checkbox' } = {}) =>
  f(key, type, label, { required, options: opts(list), ...display('chips') });

const consent = (key, label, required = false) =>
  f(key, 'Checkbox', label, { required, options: [{ label, value: 'yes' }] });

/* ── shared option data (mirrors the mocks) ────────────────────────────────── */

const COUNTRIES = ['Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria',
  'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'].map((m) => ({ label: `${m} 2026`, value: m }));
const LANG_LEVELS = ['A1 — Beginner', 'A2 — Elementary', 'B1 — Intermediate',
  'B2 — Upper-intermediate', 'C1 — Advanced', 'C2 — Fluent'];
const INTERESTS = ['Art & Design', 'Technology', 'Sustainability', 'Music', 'Sports', 'Cuisine',
  'History', 'Entrepreneurship'];
const ACCOMMODATION = [
  { label: 'Host family', value: 'host', description: 'Live with locals' },
  { label: 'Student dorm', value: 'dorm', description: 'On campus' },
  { label: 'Shared flat', value: 'shared', description: 'With peers' },
];

/* ── theme-compat token block ──────────────────────────────────────────────── */

/**
 * The palette layer every template starts with. `authored` supplies the literal fallbacks
 * that reproduce the mock exactly when the form is NOT borrowing page colours.
 */
function tokens(p, authored) {
  const chain = (role, lit) => `--${p}-${role}:var(--mf-page-${role},var(--mf-preset-${role},${lit}));`;
  return [
    chain('primary', authored.primary),
    chain('surface', authored.surface),
    chain('text', authored.text),
    chain('muted', authored.muted),
    chain('border', authored.border),
    `--${p}-on-primary:var(--mf-preset-on-primary,${authored.onPrimary || '#fff'});`,
    `--${p}-accent:var(--mf-page-primary,var(--mf-preset-primary,${authored.accent || authored.primary}));`,
    // Derived, never literal: these follow whatever surface/text resolved to, so the shell
    // stays legible on a dark host instead of painting light greys onto a dark page.
    `--${p}-fill:color-mix(in srgb, var(--${p}-text) 5%, var(--${p}-surface));`,
    `--${p}-fill-strong:color-mix(in srgb, var(--${p}-text) 9%, var(--${p}-surface));`,
    `--${p}-soft:color-mix(in srgb, var(--${p}-primary) 12%, var(--${p}-surface));`,
    `--${p}-hairline:color-mix(in srgb, var(--${p}-text) 12%, var(--${p}-surface));`,
    `--${p}-page:color-mix(in srgb, var(--${p}-text) 4%, var(--${p}-surface));`,
    `--${p}-input-bg:var(--mf-page-input-bg,var(--${p}-fill));`,
  ].join('');
}

/** Field chrome shared by all three shells: the authored <span> label replaces MegaForm's. */
function fieldCss(p, { radius = '10px', inputBg = `var(--${p}-input-bg)`, border = `1px solid var(--${p}-border)`, pad = '11px 14px' } = {}) {
  const s = `.mfp-${p}`;
  return [
    `${s} .${p}-field{display:block;margin:0}`,
    `${s} .${p}-field>span{display:block;margin:0 0 6px!important;color:var(--${p}-muted);font-size:11px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}`,
    `${s} .${p}-field .mf-field-label{display:none!important}`,
    `${s} .mf-field-group{margin:0!important;width:100%}`,
    `${s} .mf-input,${s} .mf-select,${s} .mf-textarea{width:100%!important;box-sizing:border-box!important;border:${border}!important;border-radius:${radius}!important;background:${inputBg}!important;padding:${pad}!important;color:var(--${p}-text)!important;font:500 14px/20px inherit!important;min-height:42px!important;outline:0!important;box-shadow:none!important;transition:border-color .15s ease,background .15s ease!important}`,
    `${s} .mf-textarea{min-height:96px!important;height:auto!important;resize:vertical}`,
    `${s} .mf-input::placeholder,${s} .mf-textarea::placeholder{color:color-mix(in srgb, var(--${p}-text) 42%, transparent)!important;opacity:1}`,
    `${s} .mf-input:focus,${s} .mf-select:focus,${s} .mf-textarea:focus{border-color:var(--${p}-primary)!important;background:var(--${p}-fill-strong)!important}`,
    `${s} .mf-field-error{color:#dc2626;font-size:11px;margin-top:4px}`,
    // Option groups — cards and chips.
    `${s} .mf-option-group--cards{display:grid;gap:8px}`,
    `${s} .mf-option-item{margin:0!important}`,
    `${s} .mf-option-group--cards{align-items:stretch}`,
    `${s} .mf-option-group--cards .mf-option-item{display:flex}`,
    // height:100% + stretch is what keeps a 3-up row level: without it each card is
    // only as tall as its own text and the row looks ragged.
    `${s} .mf-option-group--cards .mf-option-ui{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;height:100%;box-sizing:border-box;padding:12px;border:1.5px solid var(--${p}-hairline);border-radius:12px;background:var(--${p}-fill);cursor:pointer;transition:all .15s ease}`,
    `${s} .mf-option-group--cards .mf-option-check,${s} .mf-option-group--chips .mf-option-check{display:none!important}`,
    `${s} .mf-option-group--cards .mf-option-ui{position:relative;padding-right:34px}`,
    `${s} .mf-option-group--cards .mf-option-item.is-selected .mf-option-ui::after,${s} .mf-option-group--cards input:checked+.mf-option-ui::after{content:'';position:absolute;top:14px;right:14px;width:11px;height:6px;border-left:2.5px solid var(--${p}-primary);border-bottom:2.5px solid var(--${p}-primary);transform:rotate(-45deg);border-radius:1px}`,
    `${s} .mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,${s} .mf-option-group--cards input:checked+.mf-option-ui{border-color:var(--${p}-primary);background:var(--${p}-soft)}`,
    `${s} .mf-option-label{color:var(--${p}-text);font-size:13px;font-weight:600}`,
    `${s} .mf-option-desc{color:var(--${p}-muted);font-size:11px;margin-top:2px}`,
    `${s} .mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}`,
    `${s} .mf-option-group--chips .mf-option-ui{padding:7px 14px;border-radius:999px;border:1.5px solid var(--${p}-hairline);background:var(--${p}-fill);color:var(--${p}-muted);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s ease}`,
    `${s} .mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,${s} .mf-option-group--chips input:checked+.mf-option-ui{background:var(--${p}-primary);border-color:var(--${p}-primary);color:var(--${p}-on-primary)}`,
    // Submit. MegaForm renders .mf-form-actions as a SIBLING of the shell, outside .mfp — a
    // rule scoped to .mfp can never reach it, and styling .mf-form-actions unscoped would
    // leak onto every other form on the page. So the shell carries its own submit button and
    // the stock one is hidden through the wrapper that contains this shell.
    `.mf-form-wrapper:has(${s}) .mf-form-actions{display:none!important}`,
    `${s} .${p}-submit{width:100%!important;border:0!important;border-radius:12px!important;padding:13px 20px!important;background:var(--${p}-primary)!important;color:var(--${p}-on-primary)!important;font:700 14px/20px inherit!important;cursor:pointer!important;box-shadow:none!important}`,
    `${s} .${p}-submit:hover{filter:brightness(1.05)}`,
    // Consent rows: the authored <span> is hidden, so only the option's own text shows —
    // otherwise the sentence appears twice, once as field label and once as option label.
    `${s} .${p}-consent-item{display:block}`,
    `${s} .${p}-consent-item>span{display:none!important}`,
    `${s} .${p}-consent-item .mf-field-label{display:none!important}`,
    `${s} .${p}-consent-item .mf-option-group{display:block}`,
    `${s} .${p}-consent-item .mf-option-ui{border:0!important;background:none!important;padding:0!important;color:var(--${p}-muted)!important;font-weight:400!important;font-size:12px!important;line-height:18px!important}`,
    // The host page's own form title/description would duplicate the shell header.
    `${s} .mf-form-title,${s} .mf-form-description{display:none!important}`,
  ].join('');
}

const compat = (prefixes) => ({
  policy: 'hybrid',
  supportsPageColors: true,
  supportsPageTypography: true,
  supportsDarkHost: true,
  prefixes,
  immutable: [],
});

const settings = (slug, prefix, css, html, theme) => ({
  theme,
  multiPage: false,
  customContent: {},
  customScripts: {},
  customHtml: html,
  customCss: css,
  themeSelector: { enabled: true },
  premiumGeneratedShell: true,
  showProgressBar: false,
  themeCompatibility: compat([prefix]),
});

/* ══ 1. Holiday Request ═══════════════════════════════════════════════════════ */

const holPrefix = 'hol';
const holidayFields = [
  f('prefix', 'Select', 'Prefix', { options: opts(['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Mx.']), placeholder: '—' }),
  f('first_name', 'Text', 'First name', { required: true, placeholder: 'First name' }),
  f('last_name', 'Text', 'Last name', { required: true, placeholder: 'Last name' }),
  f('mobile', 'Phone', 'Mobile number', { placeholder: '(888) 000-0000' }),
  f('email', 'Email', 'Email', { required: true, placeholder: 'name@example.com' }),
  f('country', 'Select', 'Country of residence', { options: opts(COUNTRIES), placeholder: 'Select country' }),
  f('language_level', 'Select', 'Language level', { options: opts(LANG_LEVELS), placeholder: 'Select level' }),
  f('destination', 'Select', 'Destination', {
    required: true, placeholder: 'Select destination',
    options: opts(['Amsterdam', 'Athens', 'Barcelona', 'Berlin', 'Brussels', 'Dublin', 'Florence',
      'Lisbon', 'Madrid', 'Paris', 'Prague', 'Vienna', 'Other']),
  }),
  f('duration', 'Select', 'Duration', {
    defaultValue: '7 days',
    options: opts(['3 days', '5 days', '7 days', '10 days', '14 days', '21 days', '30 days']),
  }),
  cards('travel_type', 'Travel type', [
    { label: 'Domestic', value: 'domestic', description: 'Within your country' },
    { label: 'International', value: 'international', description: 'Overseas travel' },
    { label: 'Multi-country', value: 'multi-country', description: 'Several destinations' },
  ], { required: true, columns: 3 }),
  cards('programme', 'Programme', [
    { label: 'Erasmus Exchange', value: 'erasmus', description: 'Berlin · Paris · Madrid' },
    { label: 'Language Immersion', value: 'language', description: 'Florence · Lisbon · Vienna' },
    { label: 'Solidarity Corps', value: 'volunteer', description: 'Amsterdam · Prague · Athens' },
  ]),
  f('start_month', 'Select', 'Preferred start', { options: MONTHS, placeholder: 'Select month' }),
  f('accommodation', 'Select', 'Accommodation', {
    placeholder: 'Select type',
    options: ACCOMMODATION.map((a) => ({ label: `${a.label} — ${a.description}`, value: a.value })),
  }),
  chips('interests', 'Interests', INTERESTS),
  f('motivation', 'Textarea', 'Motivation', { placeholder: 'What are you hoping to get out of this experience?' }),
  consent('newsletter', 'Send me updates about new programmes and destinations'),
  consent('terms', 'I agree to the terms and conditions', true),
];

const holSection = (icon, title, sub) =>
  `<div class='hol-sec'><div class='hol-sec-icon'>${icon}</div><div><div class='hol-sec-t'>${title}</div><div class='hol-sec-s'>${sub}</div></div></div>`;

const ICON_USER = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>";
const ICON_PIN = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/><circle cx='12' cy='10' r='3'/></svg>";
const ICON_CAP = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M22 10 12 5 2 10l10 5 10-5z'/><path d='M6 12v5c3 3 9 3 12 0v-5'/></svg>";
const ICON_SPARK = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8'/></svg>";
const ICON_CAL = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/></svg>";

const holidayHtml = [
  `<div class='mfp mfp-hol mfp-native-generated' data-mf-flexgrid="locked" style="background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important">`,
  `<div class='hol-card'>`,
  `<div class='hol-accent'></div>`,
  `<header class='hol-head'><div><h1>Holiday Request Form</h1><p>Domestic &amp; International</p></div><div class='hol-art' role='presentation'></div></header>`,
  `<div class='hol-rule'></div>`,
  `<div class='hol-body'>`,
  `<section>`, holSection(ICON_USER, 'Personal Information', 'Your basic details'),
  `<div class='hol-grid hol-name'><label class='hol-field'><span>Prefix</span>{{field:prefix}}</label><label class='hol-field'><span>First name *</span>{{field:first_name}}</label><label class='hol-field'><span>Last name *</span>{{field:last_name}}</label></div>`,
  `<div class='hol-grid hol-2'><label class='hol-field'><span>Mobile number</span>{{field:mobile}}</label><label class='hol-field'><span>Email *</span>{{field:email}}</label></div>`,
  `<div class='hol-grid hol-2'><label class='hol-field'><span>Country of residence</span>{{field:country}}</label><label class='hol-field'><span>Language level</span>{{field:language_level}}</label></div>`,
  `</section>`,
  `<section>`, holSection(ICON_PIN, 'Holiday Destination', 'Where would you like to go?'),
  `<div class='hol-grid hol-2'><label class='hol-field'><span>Destination *</span>{{field:destination}}</label><label class='hol-field'><span>Duration</span>{{field:duration}}</label></div>`,
  `<label class='hol-field hol-wide'><span>Travel type *</span>{{field:travel_type}}</label>`,
  `</section>`,
  `<section>`, holSection(ICON_CAP, 'Programme', 'Select your preferred track'),
  `<label class='hol-field hol-wide'><span class='hol-hide'>Programme</span>{{field:programme}}</label>`,
  `<div class='hol-grid hol-2'><label class='hol-field'><span>Preferred start</span>{{field:start_month}}</label><label class='hol-field'><span>Accommodation</span>{{field:accommodation}}</label></div>`,
  `</section>`,
  `<section>`, holSection(ICON_SPARK, 'Interests', 'Pick what excites you (optional)'),
  `<label class='hol-field hol-wide'><span class='hol-hide'>Interests</span>{{field:interests}}</label>`,
  `</section>`,
  `<section>`, holSection(ICON_CAL, 'Motivation', 'Tell us about your goals (optional)'),
  `<label class='hol-field hol-wide'><span class='hol-hide'>Motivation</span>{{field:motivation}}</label>`,
  `</section>`,
  `<section class='hol-consent'><label class='hol-field hol-consent-item'><span>Newsletter</span>{{field:newsletter}}</label><label class='hol-field hol-consent-item'><span>Terms</span>{{field:terms}}</label></section>`,
  `<button class='hol-submit' type='submit' style="background:var(--hol-primary)!important;color:var(--hol-on-primary)!important;border:0!important;border-radius:12px!important;padding:13px 20px!important;width:100%!important;font-weight:700!important;box-shadow:none!important;cursor:pointer!important">Submit Holiday Request</button>`,
  `</div></div></div>`,
].join('');

const holidayCss = [
  `.mfp.mfp-hol{${tokens(holPrefix, {
    primary: '#7B5EA7', surface: '#ffffff', text: '#1A1A2E', muted: '#6B6B80',
    border: 'transparent', accent: '#A989D1',
  })}}`,
  `.mfp.mfp-hol{background:transparent!important;border:0!important;padding:0!important;font-family:'Inter',system-ui,-apple-system,sans-serif}`,
  `.mfp-hol .hol-card{position:relative;overflow:hidden;border-radius:16px;background:var(--hol-surface);box-shadow:0 4px 18px color-mix(in srgb, var(--hol-text) 10%, transparent)}`,
  `.mfp-hol .hol-accent{position:absolute;inset:0 0 auto 0;height:4px;background:linear-gradient(90deg,var(--hol-primary),var(--hol-accent))}`,
  `.mfp-hol .hol-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:30px 32px 22px}`,
  `.mfp-hol .hol-art{flex:0 0 auto;width:96px;height:76px;background-repeat:no-repeat;background-position:center;background-size:contain}`,
  `.mfp-hol .hol-art{background-image:url('/Modules/MegaForm/img/holiday-request-travel/holiday-luggage.png');}`,
  `.DnnModule .mfp-hol .hol-art{background-image:url('/DesktopModules/MegaForm/Assets/img/holiday-request-travel/holiday-luggage.png')}`,
  `.mfp-hol .hol-head h1{margin:0;font-size:24px;line-height:1.2;font-weight:700;color:var(--hol-text)}`,
  `.mfp-hol .hol-head p{margin:4px 0 0;font-size:14px;font-weight:500;color:var(--hol-accent)}`,
  `.mfp-hol .hol-rule{height:1px;margin:0 32px;background:var(--hol-hairline)}`,
  `.mfp-hol .hol-body{padding:26px 32px 30px;display:flex;flex-direction:column;gap:30px}`,
  `.mfp-hol .hol-sec{display:flex;align-items:center;gap:10px;margin-bottom:16px}`,
  `.mfp-hol .hol-sec-icon{flex:0 0 auto;width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--hol-soft);color:var(--hol-primary)}`,
  `.mfp-hol .hol-sec-icon svg{width:14px;height:14px}`,
  `.mfp-hol .hol-sec-t{font-size:14px;font-weight:700;color:var(--hol-text)}`,
  `.mfp-hol .hol-sec-s{font-size:12px;color:var(--hol-muted)}`,
  `.mfp-hol .hol-grid{display:grid;gap:12px;margin-bottom:12px}`,
  `.mfp-hol .hol-2{grid-template-columns:1fr 1fr}`,
  `.mfp-hol .hol-name{grid-template-columns:100px 1fr 1fr}`,
  `.mfp-hol .hol-wide{display:block;margin-top:4px}`,
  `.mfp-hol .hol-hide{display:none!important}`,
  `.mfp-hol .hol-consent{display:flex;flex-direction:column;gap:10px}`,
  fieldCss(holPrefix, { radius: '10px', border: '1.5px solid transparent', inputBg: `var(--hol-input-bg)` }),
  `.mfp-hol .mf-field-group[data-key='travel_type'] .mf-option-group{grid-template-columns:repeat(3,1fr)!important}`,
  `.mfp-hol .mf-field-group[data-key='programme'] .mf-option-group{grid-template-columns:1fr!important}`,
  `@media (max-width:640px){.mfp-hol .hol-2,.mfp-hol .hol-name{grid-template-columns:1fr}.mfp-hol .mf-option-group{grid-template-columns:1fr!important}}`,
].join('');

const holiday = {
  version: '1.0',
  slug: 'holiday-request-travel',
  title: 'Holiday Request Form',
  description: 'A soft violet travel request form — personal details, destination, programme track, interests and consent on a single page.',
  category: 'registration',
  categories: ['registration', 'premium', 'travel'],
  icon: 'plane',
  submitButtonText: 'Submit Holiday Request',
  successMessage: 'Request received. We will be in touch within 2 business days.',
  fields: holidayFields,
  settings: settings('holiday-request-travel', holPrefix, holidayCss, holidayHtml, 'holiday-request-premium'),
  rules: [],
  workflow: { notifications: [] },
};

/* ══ 2. Dance Competition ═════════════════════════════════════════════════════ */

const dcpPrefix = 'dcp';
const danceFields = [
  f('first_name', 'Text', 'First name', { required: true }),
  f('last_name', 'Text', 'Last name', { required: true }),
  f('email', 'Email', 'E-mail', { required: true, placeholder: 'example@example.com' }),
  f('phone', 'Phone', 'Phone', { placeholder: '(888) 000-0000' }),
  f('birth_year', 'Text', 'Year of birth', { placeholder: '2004' }),
  f('country', 'Select', 'Country', { options: opts(COUNTRIES), placeholder: 'Select country' }),
  chips('category', 'Category', ['Solo', 'Duo', 'Group (3–5)', 'Crew (6+)'], { required: true, type: 'Radio' }),
  f('style', 'Select', 'Dance style', {
    placeholder: 'Select style',
    options: opts(['Hip-Hop', 'Contemporary', 'Ballet', 'Breakdance', 'Salsa', 'Jazz', 'Tap', 'K-Pop', 'Ballroom', 'Freestyle']),
  }),
  chips('level', 'Experience level', ['Beginner', 'Intermediate', 'Advanced', 'Professional'], { type: 'Radio' }),
  cards('programme', 'Programme', [
    { label: 'Erasmus Exchange', value: 'erasmus', description: 'Berlin · Paris · Madrid' },
    { label: 'Language Immersion', value: 'language', description: 'Florence · Lisbon · Vienna' },
    { label: 'Performing Arts', value: 'arts', description: 'Amsterdam · Prague · Athens' },
  ]),
  f('start_month', 'Select', 'Preferred start', { options: MONTHS, placeholder: 'Select month' }),
  f('duration', 'Select', 'Duration (months)', {
    defaultValue: '3', options: opts(['1', '3', '6', '12']).map((o) => ({ label: `${o.value} months`, value: o.value })),
  }),
  cards('accommodation', 'Accommodation', ACCOMMODATION, { columns: 3 }),
  f('language_level', 'Select', 'Language level', { options: opts(LANG_LEVELS), placeholder: 'Select level' }),
  chips('interests', 'Interests', INTERESTS),
  f('motivation', 'Textarea', 'Why do you want to join?', { placeholder: 'Tell us about your goals…' }),
  consent('newsletter', 'Send me updates about upcoming competitions and events'),
  consent('terms', 'I agree to the terms and conditions', true),
];

const dcpRule = (label) => `<div class='dcp-rule'><span>${label}</span><i></i></div>`;

const danceHtml = [
  `<div class='mfp mfp-dcp mfp-native-generated' data-mf-flexgrid="locked" style="background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important">`,
  `<div class='dcp-card'>`,
  `<div class='dcp-hero'><div class='dcp-hero-photo' role='presentation'></div><div class='dcp-hero-wash'></div><div class='dcp-hero-text'>DANCE COMPETITION</div></div>`,
  `<div class='dcp-body'>`,
  `<div class='dcp-title'><h1>Dance Registration</h1><p>Fill the registration form below keenly to enter the dancing competition.</p></div>`,
  `<div class='dcp-block'><p class='dcp-group'>Name</p><div class='dcp-grid dcp-2'><label class='dcp-field'><span>First name</span>{{field:first_name}}</label><label class='dcp-field'><span>Last name</span>{{field:last_name}}</label></div></div>`,
  `<label class='dcp-field'><span>E-mail *</span>{{field:email}}</label>`,
  `<div class='dcp-grid dcp-2'><label class='dcp-field'><span>Phone</span>{{field:phone}}</label><label class='dcp-field'><span>Year of birth</span>{{field:birth_year}}</label></div>`,
  `<label class='dcp-field'><span>Country</span>{{field:country}}</label>`,
  dcpRule('Competition details'),
  `<label class='dcp-field'><span>Category *</span>{{field:category}}</label>`,
  `<label class='dcp-field'><span>Dance style</span>{{field:style}}</label>`,
  `<label class='dcp-field'><span>Experience level</span>{{field:level}}</label>`,
  dcpRule('Programme &amp; logistics'),
  `<label class='dcp-field'><span>Programme</span>{{field:programme}}</label>`,
  `<div class='dcp-grid dcp-2'><label class='dcp-field'><span>Preferred start</span>{{field:start_month}}</label><label class='dcp-field'><span>Duration</span>{{field:duration}}</label></div>`,
  `<label class='dcp-field'><span>Accommodation</span>{{field:accommodation}}</label>`,
  `<label class='dcp-field'><span>Language level</span>{{field:language_level}}</label>`,
  dcpRule('Interests &amp; motivation'),
  `<label class='dcp-field'><span>Interests</span>{{field:interests}}</label>`,
  `<label class='dcp-field'><span>Why do you want to join?</span>{{field:motivation}}</label>`,
  dcpRule('Consent'),
  `<div class='dcp-consent'><label class='dcp-field dcp-consent-item'><span>Newsletter</span>{{field:newsletter}}</label><label class='dcp-field dcp-consent-item'><span>Terms</span>{{field:terms}}</label></div>`,
  `<button class='dcp-submit' type='submit' style="background:linear-gradient(135deg,var(--dcp-primary),var(--dcp-accent))!important;color:var(--dcp-on-primary)!important;border:0!important;border-radius:12px!important;padding:13px 20px!important;width:100%!important;font-weight:700!important;box-shadow:none!important;cursor:pointer!important">Submit Registration</button>`,
  `</div></div></div>`,
].join('');

const danceCss = [
  `.mfp.mfp-dcp{${tokens(dcpPrefix, {
    primary: '#E040A0', surface: '#ffffff', text: '#1A1A2E', muted: '#9CA3AF',
    border: '#D1D5DB', accent: '#3B9EE8',
  })}}`,
  `.mfp.mfp-dcp{background:transparent!important;border:0!important;padding:0!important;font-family:'Inter',system-ui,-apple-system,sans-serif}`,
  `.mfp-dcp .dcp-card{overflow:hidden;border-radius:14px;background:var(--dcp-surface);box-shadow:0 2px 12px color-mix(in srgb, var(--dcp-text) 9%, transparent)}`,
  // The hero is a pink→blue wash, not a photo: a bundled bitmap would have to ship with the
  // template and would not recolour with the palette.
  `.mfp-dcp .dcp-hero{position:relative;height:210px;overflow:hidden;background:linear-gradient(135deg,var(--dcp-primary) 0%,color-mix(in srgb, var(--dcp-primary) 45%, var(--dcp-accent)) 50%,var(--dcp-accent) 100%)}`,
  `.mfp-dcp .dcp-hero-photo{position:absolute;inset:0;background-repeat:no-repeat;background-position:center 30%;background-size:cover}`,
  `.mfp-dcp .dcp-hero-photo{background-image:url('/Modules/MegaForm/img/dance-competition-registration/dance-hero.png');}`,
  `.DnnModule .mfp-dcp .dcp-hero-photo{background-image:url('/DesktopModules/MegaForm/Assets/img/dance-competition-registration/dance-hero.png')}`,
  // The pink/blue wash sits OVER the photo so the palette still drives the hero when the
  // shell borrows page colours; the photo reads as texture underneath.
  `.mfp-dcp .dcp-hero-wash{mix-blend-mode:multiply}`,
  `.mfp-dcp .dcp-hero-wash{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 20%, transparent 0%, rgba(0,0,0,.28) 100%)}`,
  `.mfp-dcp .dcp-hero-text{position:absolute;left:24px;right:24px;bottom:20px;color:#fff;font-size:40px;line-height:1;font-weight:900;letter-spacing:-.02em;text-transform:uppercase;text-shadow:0 2px 12px rgba(0,0,0,.4)}`,
  `.mfp-dcp .dcp-body{padding:24px 28px 28px;display:flex;flex-direction:column;gap:18px}`,
  `.mfp-dcp .dcp-title h1{margin:0;font-size:20px;font-weight:700;color:var(--dcp-text)}`,
  `.mfp-dcp .dcp-title p{margin:3px 0 0;font-size:13px;color:var(--dcp-muted)}`,
  `.mfp-dcp .dcp-group{margin:0 0 8px;font-size:14px;font-weight:600;color:var(--dcp-text)}`,
  `.mfp-dcp .dcp-grid{display:grid;gap:12px}`,
  `.mfp-dcp .dcp-2{grid-template-columns:1fr 1fr}`,
  `.mfp-dcp .dcp-rule{display:flex;align-items:center;gap:12px;padding-top:6px}`,
  `.mfp-dcp .dcp-rule span{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--dcp-muted)}`,
  `.mfp-dcp .dcp-rule i{flex:1;height:1px;background:var(--dcp-hairline)}`,
  `.mfp-dcp .dcp-consent{display:flex;flex-direction:column;gap:8px}`,
  fieldCss(dcpPrefix, { radius: '6px', border: `1px solid var(--dcp-border)`, inputBg: `var(--dcp-surface)`, pad: '9px 12px' }),
  `.mfp-dcp .dcp-field>span{text-transform:none;letter-spacing:0;font-size:13px;font-weight:500;color:color-mix(in srgb, var(--dcp-text) 78%, var(--dcp-surface))}`,
  `.mfp-dcp .mf-option-group--chips .mf-option-ui{border-radius:6px;padding:9px 14px;background:var(--dcp-surface);border-color:var(--dcp-border);color:color-mix(in srgb, var(--dcp-text) 78%, var(--dcp-surface))}`,
  `.mfp-dcp .mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,.mfp-dcp .mf-option-group--chips input:checked+.mf-option-ui{background:linear-gradient(135deg,var(--dcp-primary),var(--dcp-accent));border-color:transparent;color:#fff}`,
  `.mfp-dcp .mf-field-group[data-key='interests'] .mf-option-ui{border-radius:999px}`,
  `.mfp-dcp .mf-field-group[data-key='programme'] .mf-option-group{grid-template-columns:1fr!important}`,
  `.mfp-dcp .mf-field-group[data-key='accommodation'] .mf-option-group{grid-template-columns:repeat(3,1fr)!important}`,
  `.mfp-dcp .mf-form-actions button,.mfp-dcp .mf-btn-submit{background:linear-gradient(135deg,var(--dcp-primary),var(--dcp-accent))!important}`,
  `@media (max-width:640px){.mfp-dcp .dcp-2{grid-template-columns:1fr}.mfp-dcp .dcp-hero-text{font-size:30px}.mfp-dcp .mf-option-group{grid-template-columns:1fr!important}}`,
].join('');

const dance = {
  version: '1.0',
  slug: 'dance-competition-registration',
  title: 'Dance Competition Registration',
  description: 'A bold pink-to-blue competition entry form: hero banner, JotForm-style fields, category and level pickers, logistics and consent.',
  category: 'event-registration',
  categories: ['event-registration', 'premium', 'arts'],
  icon: 'music',
  submitButtonText: 'Submit Registration',
  successMessage: 'Registration complete. Your entry has been received.',
  fields: danceFields,
  settings: settings('dance-competition-registration', dcpPrefix, danceCss, danceHtml, 'dance-competition-premium'),
  rules: [],
  workflow: { notifications: [] },
};

/* ══ 3. Volunteer Application ═════════════════════════════════════════════════ */

const volPrefix = 'vol';
const volunteerFields = [
  f('prefix', 'Select', 'Prefix', { options: opts(['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Mx.']), placeholder: '—' }),
  f('first_name', 'Text', 'First name', { required: true, placeholder: 'Anna' }),
  f('last_name', 'Text', 'Last name', { required: true, placeholder: 'Müller' }),
  f('email', 'Email', 'Email address', { required: true, placeholder: 'anna@email.eu' }),
  f('phone', 'Phone', 'Phone number', { placeholder: '+49 170 1234567' }),
  f('birth_year', 'Text', 'Year of birth', { placeholder: '2000' }),
  f('country', 'Select', 'Country of residence', { options: opts(COUNTRIES), placeholder: 'Select country' }),
  cards('programme', 'Volunteer programme', [
    { label: 'Community Care', value: 'community', description: 'Berlin · Athens · Warsaw — support local families and social services.' },
    { label: 'Education Support', value: 'education', description: 'Lisbon · Budapest · Sofia — assist teachers and youth literacy projects.' },
    { label: 'Environmental', value: 'environment', description: 'Amsterdam · Vienna · Oslo — sustainability and conservation volunteering.' },
    { label: 'Health & Wellbeing', value: 'health', description: 'Madrid · Lyon · Rotterdam — support clinics and health awareness drives.' },
  ], { required: true, columns: 2 }),
  f('duration', 'Select', 'Duration', {
    defaultValue: '1 month',
    options: opts(['1 month', '3 months', '6 months', '12 months']),
  }),
  f('start_month', 'Select', 'Preferred start', { options: MONTHS, placeholder: 'Select month' }),
  chips('interests', 'Areas of interest', ['Teaching', 'Healthcare', 'Environment', 'Community',
    'Youth Work', 'Arts', 'Sports', 'Elderly Care', 'Refugees', 'Literacy']),
  cards('accommodation', 'Accommodation preference', ACCOMMODATION, { columns: 3 }),
  f('language_level', 'Select', 'Language level', { options: opts(LANG_LEVELS), placeholder: 'Select level' }),
  f('motivation', 'Textarea', 'Why do you want to volunteer? (optional)', { placeholder: 'Share your motivation…' }),
  consent('scholarship', 'I am applying for a scholarship / stipend to cover travel and accommodation costs.'),
  consent('newsletter', 'I would like to receive updates about future volunteer programmes and opportunities.'),
  consent('terms', 'I confirm that the information provided is accurate and I agree to the terms & conditions and privacy policy.', true),
];

const volRule = (label) => `<div class='vol-rule'><span>${label}</span><i></i></div>`;

const volunteerHtml = [
  `<div class='mfp mfp-vol mfp-native-generated' data-mf-flexgrid="locked" style="background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important">`,
  `<header class='vol-banner'><div class='vol-banner-copy'><div class='vol-eyebrow'>EUROYOUTH 2026</div><h1>Volunteer Application Form</h1><div class='vol-rating'><span>★★★★★</span>12,000+ volunteers placed</div></div><div class='vol-thumb' role='presentation'><span class='vol-badge'>VOLUNTEER</span></div></header>`,
  `<div class='vol-intro'><p>EuroYouth is a nonprofit organization that provides basic healthcare, education, nutrition, job skills, and community development programs to those who, due to the harsh circumstances of their lives, have been deprived of the most basic living conditions.</p><p>We encourage the participation of volunteers who support our mission and are willing to contribute. The information provided through this form will be kept confidential and will help us determine the most satisfying and appropriate volunteer opportunity for you.</p></div>`,
  `<div class='vol-card'>`,
  volRule('Personal information'),
  `<div class='vol-grid vol-name'><label class='vol-field'><span>Prefix</span>{{field:prefix}}</label><label class='vol-field'><span>First name *</span>{{field:first_name}}</label><label class='vol-field'><span>Last name *</span>{{field:last_name}}</label></div>`,
  `<div class='vol-grid vol-2'><label class='vol-field'><span>Email address *</span>{{field:email}}</label><label class='vol-field'><span>Phone number</span>{{field:phone}}</label></div>`,
  `<div class='vol-grid vol-2'><label class='vol-field'><span>Year of birth</span>{{field:birth_year}}</label><label class='vol-field'><span>Country of residence</span>{{field:country}}</label></div>`,
  volRule('Volunteer programme'),
  `<label class='vol-field'><span class='vol-hide'>Programme</span>{{field:programme}}</label>`,
  `<div class='vol-grid vol-2'><label class='vol-field'><span>Duration</span>{{field:duration}}</label><label class='vol-field'><span>Preferred start</span>{{field:start_month}}</label></div>`,
  volRule('Areas of interest'),
  `<label class='vol-field'><span class='vol-hide'>Interests</span>{{field:interests}}</label>`,
  volRule('Stay &amp; support'),
  `<label class='vol-field'><span>Accommodation preference</span>{{field:accommodation}}</label>`,
  `<label class='vol-field'><span>Language level</span>{{field:language_level}}</label>`,
  `<label class='vol-field'><span>Why do you want to volunteer? (optional)</span>{{field:motivation}}</label>`,
  `<div class='vol-consent'><label class='vol-field vol-consent-item'><span>Scholarship</span>{{field:scholarship}}</label></div>`,
  volRule('Declaration'),
  `<div class='vol-consent'><label class='vol-field vol-consent-item'><span>Newsletter</span>{{field:newsletter}}</label><label class='vol-field vol-consent-item'><span>Terms</span>{{field:terms}}</label></div>`,
  `<button class='vol-submit' type='submit' style="background:var(--vol-primary)!important;color:var(--vol-on-primary)!important;border:0!important;border-radius:12px!important;padding:13px 20px!important;width:100%!important;font-weight:700!important;box-shadow:none!important;cursor:pointer!important">Submit Application</button>`,
  `<p class='vol-gdpr'>* Required fields. Your data is protected under GDPR.</p>`,
  `</div></div>`,
].join('');

const volunteerCss = [
  `.mfp.mfp-vol{${tokens(volPrefix, {
    primary: '#F97316', surface: '#ffffff', text: '#1A1A2E', muted: '#6B7280',
    border: 'transparent', accent: '#FB923C',
  })}}`,
  `.mfp.mfp-vol{background:transparent!important;border:0!important;padding:0!important;font-family:'Inter',system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;gap:18px}`,
  `.mfp-vol .vol-banner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 26px;border-radius:14px;background:var(--vol-primary);color:#fff}`,
  `.mfp-vol .vol-eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em}`,
  `.mfp-vol .vol-banner h1{margin:6px 0 6px;font-size:24px;line-height:1.2;font-weight:700}`,
  `.mfp-vol .vol-rating{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.95}`,
  `.mfp-vol .vol-thumb{position:relative;flex:0 0 auto;width:132px;height:88px;border-radius:10px;overflow:hidden;background-repeat:no-repeat;background-position:center;background-size:cover}`,
  `.mfp-vol .vol-thumb{background-image:url('/Modules/MegaForm/img/volunteer-application-euroyouth/volunteer-hero.png');}`,
  `.DnnModule .mfp-vol .vol-thumb{background-image:url('/DesktopModules/MegaForm/Assets/img/volunteer-application-euroyouth/volunteer-hero.png')}`,
  `.mfp-vol .vol-badge{position:absolute;top:6px;right:6px;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.55);font-size:9px;font-weight:700;letter-spacing:.08em;color:#fff}`,
  `.mfp-vol .vol-intro{padding:0 8px;text-align:center;font-style:italic;font-size:14px;line-height:1.6;color:color-mix(in srgb, var(--vol-text) 78%, var(--vol-surface))}`,
  `.mfp-vol .vol-intro p{margin:0 0 12px}`,
  `.mfp-vol .vol-card{padding:26px 30px 30px;border-radius:16px;background:var(--vol-surface);box-shadow:0 4px 18px color-mix(in srgb, var(--vol-text) 9%, transparent);display:flex;flex-direction:column;gap:14px}`,
  `.mfp-vol .vol-rule{display:flex;align-items:center;gap:12px;margin-top:8px}`,
  `.mfp-vol .vol-rule span{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--vol-primary)}`,
  `.mfp-vol .vol-rule i{flex:1;height:1px;background:color-mix(in srgb, var(--vol-primary) 35%, transparent)}`,
  `.mfp-vol .vol-grid{display:grid;gap:14px}`,
  `.mfp-vol .vol-2{grid-template-columns:1fr 1fr}`,
  `.mfp-vol .vol-name{grid-template-columns:90px 1fr 1fr}`,
  `.mfp-vol .vol-hide{display:none!important}`,
  `.mfp-vol .vol-consent{display:flex;flex-direction:column;gap:8px}`,
  `.mfp-vol .vol-gdpr{margin:6px 0 0;text-align:center;font-size:11px;color:var(--vol-muted)}`,
  // Underline inputs — the distinguishing trait of this design.
  fieldCss(volPrefix, { radius: '0', border: '0', inputBg: 'transparent', pad: '8px 2px' }),
  `.mfp-vol .mf-input,.mfp-vol .mf-select,.mfp-vol .mf-textarea{border-bottom:1.5px solid var(--vol-hairline)!important;border-radius:0!important;background:transparent!important}`,
  `.mfp-vol .mf-input:focus,.mfp-vol .mf-select:focus,.mfp-vol .mf-textarea:focus{border-bottom-color:var(--vol-primary)!important;background:transparent!important}`,
  `.mfp-vol .mf-textarea{border:1.5px solid var(--vol-hairline)!important;border-radius:10px!important;padding:12px 14px!important}`,
  `.mfp-vol .mf-field-group[data-key='programme'] .mf-option-group{grid-template-columns:repeat(2,1fr)!important}`,
  `.mfp-vol .mf-field-group[data-key='accommodation'] .mf-option-group{grid-template-columns:repeat(3,1fr)!important}`,
  `@media (max-width:640px){.mfp-vol .vol-2,.mfp-vol .vol-name{grid-template-columns:1fr}.mfp-vol .mf-option-group{grid-template-columns:1fr!important}}`,
].join('');

const volunteer = {
  version: '1.0',
  slug: 'volunteer-application-euroyouth',
  title: 'Volunteer Application Form',
  description: 'A nonprofit volunteer intake: orange banner, mission copy, four programme cards, interest chips and a GDPR declaration.',
  category: 'application',
  categories: ['application', 'premium', 'nonprofit'],
  icon: 'heart-handshake',
  submitButtonText: 'Submit Application',
  successMessage: 'Application received. Our volunteer team will contact you shortly.',
  fields: volunteerFields,
  settings: settings('volunteer-application-euroyouth', volPrefix, volunteerCss, volunteerHtml, 'volunteer-application-premium'),
  rules: [],
  workflow: { notifications: [] },
};

/* ── emit ──────────────────────────────────────────────────────────────────── */

const templates = [holiday, dance, volunteer];
for (const dir of outDirs) {
  if (!fs.existsSync(dir)) { console.log(`skip (missing): ${dir}`); continue; }
  for (const t of templates) {
    const file = path.join(dir, `${t.slug}.json`);
    fs.writeFileSync(file, JSON.stringify(t, null, 2) + '\n', 'utf8');
    console.log(`wrote ${file}`);
  }
}

for (const t of templates) {
  const tokenCount = (t.settings.customHtml.match(/\{\{field:/g) || []).length;
  const keys = new Set(t.fields.filter((x) => x.type !== 'Section').map((x) => x.key));
  const placed = new Set([...t.settings.customHtml.matchAll(/\{\{field:([^}]+)\}\}/g)].map((m) => m[1]));
  const missing = [...keys].filter((k) => !placed.has(k));
  const unknown = [...placed].filter((k) => !keys.has(k));
  console.log(`${t.slug}: ${t.fields.length} fields, ${tokenCount} placeholders` +
    (missing.length ? `  MISSING=${missing.join(',')}` : '') +
    (unknown.length ? `  UNKNOWN=${unknown.join(',')}` : ''));
}
