#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const premium = path.join(repo, 'Samples', 'FormTemplates', 'Premium');
const templateDirs = [
  premium,
  path.join(premium, 'DONEE'),
  path.join(repo, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm', 'Templates'),
];
const guideDirs = [
  path.join(repo, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm', 'Resources', 'TemplateGuides'),
  path.join(repo, 'MegaForm.DNN', 'Resources', 'TemplateGuides'),
  path.join(repo, 'MegaForm.Web', 'wwwroot', 'Modules', 'MegaForm', 'Resources', 'TemplateGuides'),
];
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
};
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const hash = (value) => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
const f = (key, type, label, extra = {}) => ({ key, type, label, ...extra });
const o = (label, value) => ({ label, value });
const values = (items) => items.map((label) => o(label, label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')));
const chip = (columns = 4) => ({
  optionDisplay: 'chips', choiceDisplay: 'chips', optionVariant: 'chips', optionColumns: columns,
  properties: { optionDisplay: 'chips', optionColumns: columns },
  widgetProps: { optionDisplay: 'chips', optionColumns: columns },
});
const fontAsset = (file) => [
  `url('/DesktopModules/MegaForm/Assets/fonts/euro-scroll/${file}') format('woff2')`,
  `url('/Modules/MegaForm/Assets/fonts/euro-scroll/${file}') format('woff2')`,
].join(',');
const fontFaces = ({ family, file, weights, style = 'normal' }) => weights
  .map((weight) => `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:${fontAsset(file)}}`)
  .join('\n');
const templateFonts = {
  realestate: [
    fontFaces({ family: 'MF Euro Inter', file: 'inter-latin.woff2', weights: [400, 500, 600] }),
    fontFaces({ family: 'MF Euro Bricolage', file: 'bricolage-grotesque-latin.woff2', weights: [600, 700, 800] }),
  ].join('\n'),
  botanical: [
    fontFaces({ family: 'MF Euro Lato', file: 'lato-regular-latin.woff2', weights: [400] }),
    fontFaces({ family: 'MF Euro Lato', file: 'lato-bold-latin.woff2', weights: [700] }),
    fontFaces({ family: 'MF Euro Playfair', file: 'playfair-display-latin.woff2', weights: [400, 500, 700] }),
    fontFaces({ family: 'MF Euro Playfair', file: 'playfair-display-italic-latin.woff2', weights: [400, 500, 700], style: 'italic' }),
  ].join('\n'),
  kawaii: fontFaces({ family: 'MF Euro Nunito', file: 'nunito-latin.woff2', weights: [400, 600, 700, 800, 900] }),
};

const countries = values(['Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria', 'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other']);
const programmes = values(['Erasmus Exchange', 'Language Immersion', 'Solidarity Corps']);
const months = values(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const interests = values(['Art & Design', 'Technology', 'Sustainability', 'Music', 'Sports', 'Cuisine', 'History', 'Entrepreneurship']);
const accommodations = values(['Host Family', 'Student Dormitory', 'Private Apartment', 'Not Needed']);
const levels = [
  o('Beginner (A1–A2)', 'beginner'),
  o('Intermediate (B1–B2)', 'intermediate'),
  o('Advanced (C1–C2)', 'advanced'),
];
const durations = ['1', '2', '3', '6', '9', '12'].map((value) => o(`${value} month${value === '1' ? '' : 's'}`, value));

function fields({ cv = false, variant = 'base' } = {}) {
  const real = variant === 'realestate';
  const botanical = variant === 'botanical';
  const kawaii = variant === 'kawaii';
  const result = [
    f('first_name', 'Text', 'First name', { placeholder: real ? 'Eleanor' : 'Anna', required: true }),
    f('last_name', 'Text', 'Last name', { placeholder: real ? 'Hayes' : 'Müller', required: true }),
  ];
  if (cv) result.push(f('job_title', 'Text', 'Current title / position', { placeholder: 'e.g. Student — University of Munich' }));
  result.push(
    f('email', 'Email', real ? 'Email address' : 'Email', { placeholder: real ? 'eleanor@example.com' : 'anna@email.eu', required: true }),
    f('phone', 'Phone', real ? 'Phone number' : 'Phone', { placeholder: real ? '+1 555 0100' : '+49 170 123456' }),
  );
  if (cv) {
    result.push(
      f('address', 'Text', 'Address', { placeholder: '123 Any St, Berlin' }),
      f('website', 'Url', 'Website', { placeholder: 'anna-portfolio.eu' }),
      ...[1, 2, 3, 4, 5].map((n) => f(`skill_${n}`, 'Text', `Skill ${n}`, { placeholder: `Skill ${n}` })),
    );
  }
  result.push(f('birth_year', 'Number', 'Year of birth', { placeholder: real ? '2000' : '2004', validation: { min: 1970, max: 2010 } }));
  if (cv) result.push(f('nationality', 'Text', 'Nationality', { placeholder: 'German' }));
  const accommodationOptions = cv
    ? values(['University dorm', 'Host family', 'Private flat', 'Flexible'])
    : ((botanical || kawaii) ? values(['University dormitory', 'Host family', 'Private flat', 'Flexible']) : accommodations);
  const durationOptions = (botanical || kawaii || cv)
    ? ['1', '2', '3', '6', '12'].map((value) => o(value, value))
    : durations;
  result.push(
    f('country', 'Select', real ? 'Country of origin' : (kawaii ? 'Country' : 'Country of residence'), {
      placeholder: kawaii ? 'Pick one ✈' : 'Select country', required: true, options: countries,
    }),
    f('programme', 'Select', 'Programme', { placeholder: kawaii ? 'Select 🌍' : 'Select programme', required: true, options: programmes }),
    f('duration', 'Select', 'Duration (months)', { defaultValue: '3', options: durationOptions }),
    f('start_month', 'Select', (real || kawaii || cv) ? 'Start month' : 'Preferred start month', {
      placeholder: kawaii ? 'Pick month 🗓️' : (cv ? 'Select' : 'Select month'), required: !cv, options: months,
    }),
    f('language_level', 'Select', 'Language level', { placeholder: kawaii ? 'Level' : 'Select level', options: levels }),
    f('interests', 'Checkbox', 'Interests', { options: interests, ...(cv ? {} : chip()) }),
    f('accommodation', cv ? 'Select' : 'Radio', cv ? 'Accommodation' : 'Accommodation preference', {
      required: real, options: accommodationOptions, ...(real ? chip() : {}), placeholder: cv ? 'Select' : undefined,
    }),
    f('scholarship', 'Checkbox', real ? 'Scholarship / financial support' : 'Scholarship application', {
      options: [o(real ? 'Apply for scholarship / financial support' : (kawaii ? 'Apply for scholarship ✨' : (cv ? 'I wish to apply for a scholarship' : 'Apply for scholarship')), 'yes')],
    }),
    f('motivation', 'Textarea', real ? 'Motivation (optional)' : (botanical ? 'Motivation letter' : 'Motivation'), {
      placeholder: real
        ? 'Tell us why you want to join this programme…'
        : (kawaii ? 'Tell us why you want to join... 🌟' : 'Tell us in a few sentences why you want to join this programme...'),
      properties: { rows: 4 }, validation: { maxLength: 1000 },
    }),
  );
  if (botanical) {
    result.push(f('signature', 'Textarea', 'Signature', {
      placeholder: 'Sincerely, your name here...', properties: { rows: 2 },
    }));
  }
  if (real) {
    result.push(f('signature', 'Signature', 'Signature', {
      properties: { height: 96, placeholderText: 'Sign here', clearText: 'Clear', undoText: 'Undo' },
      widgetProps: { height: 96, placeholderText: 'Sign here', clearText: 'Clear', undoText: 'Undo' },
    }));
  }
  result.push(
    f('newsletter', 'Checkbox', 'Newsletter', {
      options: [o(botanical ? 'I would like to receive programme updates and news.' : (kawaii ? 'Send me updates & news 📬' : 'Subscribe to EuroYouth newsletter'), 'yes')],
    }),
    f('terms', 'Checkbox', 'Terms and conditions', {
      required: true,
      options: [o(botanical ? 'I agree to the EuroYouth terms and conditions.' : (kawaii ? 'I agree to the terms & conditions' : (cv ? 'I accept the terms and conditions' : 'I accept the EuroYouth terms and data processing policy')), 'accepted')],
    }),
    f('utm_source', 'Hidden', 'UTM source'),
    f('utm_campaign', 'Hidden', 'UTM campaign'),
  );
  return result;
}

const section = (icon, title) => `<div class="mfp-section-head"><span class="mfp-section-icon" aria-hidden="true">${icon}</span><h2>${title}</h2><span aria-hidden="true"></span></div>`;
const kawaiiHead = (label, tone) => `<div class="mfp-kawaii-head mfp-kawaii-${tone}"><span>${label}</span><i aria-hidden="true"></i></div>`;
const checks = `<div class="mfp-stack"><div class="mfp-check mfp-consent-check">{{field:newsletter}}</div><div class="mfp-check mfp-consent-check">{{field:terms}}</div></div>`;
const realChecks = `<div class="mfp-stack"><div class="mfp-check mfp-consent-check">{{field:terms}}</div><div class="mfp-check mfp-consent-check">{{field:newsletter}}</div></div>`;
const hidden = `<div class="mfp-hidden">{{field:utm_source}}{{field:utm_campaign}}</div>`;
const actions = (label) => `<div class="mfp-actions"><span aria-hidden="true">&#8592; Back</span><button type="submit" class="mfp-btn" data-mf-native-submit>${label} &#8594;</button></div>`;
const realActions = `<div class="mfp-actions mfp-real-actions"><button type="button" class="mfp-back">&#8249; <span>Back to Forms</span></button><button type="submit" class="mfp-btn" data-mf-native-submit>Submit Application <span aria-hidden="true">&#10003;</span></button></div>`;

function baseCss({ slug, p, width, c, font, display }) {
  return `/* MegaForm Gen-3 scroll-aware single-page shell: ${slug} */
.mfp.mfp-${slug}{--${p}-page:${c.page};--${p}-paper:${c.paper};--${p}-ink:${c.ink};--${p}-muted:${c.muted};--${p}-line:${c.line};--${p}-input:${c.input || '#fff'};--${p}-primary:${c.primary};--${p}-soft:${c.soft};--${p}-error:#c0392b;--${p}-font:${font};--${p}-display:${display};--mf-form-radius:0px;--mf-btn-bg:var(--${p}-primary);--mf-font-family:var(--${p}-font);display:block!important;width:100%!important;max-width:none!important;margin:0 auto!important;padding:32px 16px 48px!important;border:0!important;border-radius:0!important;outline:0!important;background:${c.page}!important;color:var(--${p}-ink)!important;box-shadow:none!important;font-family:var(--${p}-font)!important;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;opacity:1!important}
.mfp.mfp-${slug},.mfp.mfp-${slug} *,.mfp.mfp-${slug} *::before,.mfp.mfp-${slug} *::after{box-sizing:border-box}
.mf-form-wrapper .mf-form-inner .mfp.mfp-${slug}{display:block!important;width:100%!important;max-width:none!important;margin-inline:auto!important}
.mfp-${slug} .mfp-stage{width:100%;max-width:${width}px!important;margin-inline:auto!important;padding:0!important;border:0!important;border-radius:0!important;outline:0!important;background:transparent!important;box-shadow:none!important}
.mfp-${slug} .mfp-paper{position:relative;width:100%;max-width:${width}px!important;margin:0 auto!important;border:0!important;outline:0!important;background:var(--${p}-paper)!important;box-shadow:0 20px 45px rgba(40,31,20,.14)}
.mfp-${slug} .mfp-body{position:relative;padding:12px 32px 36px}
.mfp-${slug} .mfp-section-head{display:flex;align-items:center;gap:11px;margin:26px 0 16px}.mfp-${slug} .mfp-section-head h2{margin:0!important;padding:0!important;color:var(--${p}-ink)!important;font-family:var(--${p}-font)!important;font-size:12px!important;font-weight:900!important;line-height:1.2!important;letter-spacing:.14em!important;text-transform:uppercase!important}.mfp-${slug} .mfp-section-head>span:last-child{height:1px;flex:1;background:var(--${p}-line)}
.mfp-${slug} .mfp-section-icon{display:grid;width:30px;height:30px;flex:0 0 auto;place-items:center;border-radius:8px;background:var(--${p}-soft);color:var(--${p}-primary);font-size:14px;font-weight:900}
.mfp-${slug} .mfp-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px}.mfp-${slug} .mfp-stack{display:grid;gap:16px}.mfp-${slug} .mfp-wide{margin-top:16px}.mfp-${slug} .mf-field-group{min-width:0;margin:0}
.mfp-${slug} .mf-field-label{display:block;margin:0 0 6px;color:var(--${p}-muted);font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.mfp-${slug} .mf-required{color:var(--${p}-error)}
.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{width:100%!important;min-height:43px!important;padding:9px 12px!important;border:1px solid var(--${p}-line)!important;border-radius:8px!important;outline:0!important;background:var(--${p}-input)!important;color:var(--${p}-ink)!important;box-shadow:none!important;font:inherit!important;font-size:14px!important}
.mfp-${slug} .mf-textarea,.mfp-${slug} textarea{min-height:112px!important;resize:vertical!important}.mfp-${slug} .mf-input:focus,.mfp-${slug} .mf-select:focus,.mfp-${slug} .mf-textarea:focus,.mfp-${slug} input:focus,.mfp-${slug} select:focus,.mfp-${slug} textarea:focus{border-color:var(--${p}-primary)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--${p}-primary) 14%,transparent)!important}
.mfp-${slug} input::placeholder,.mfp-${slug} textarea::placeholder{color:color-mix(in srgb,var(--${p}-muted) 58%,transparent)}.mfp-${slug} .mf-field-error{margin-top:5px;color:var(--${p}-error);font-size:11px}
.mfp-${slug} .mfp-chip .mf-option-group{display:flex!important;flex-wrap:wrap!important;gap:8px!important;grid-template-columns:none!important}.mfp-${slug} .mfp-chip .mf-option-item{display:inline-flex!important;width:auto!important;margin:0!important;padding:0!important}.mfp-${slug} .mfp-chip .mf-option-control{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;clip-path:inset(50%)!important}
.mfp-${slug} .mfp-chip .mf-option-ui{display:inline-flex!important;min-height:32px!important;align-items:center!important;padding:7px 12px!important;border:1px solid var(--${p}-line)!important;border-radius:999px!important;background:var(--${p}-input)!important;color:var(--${p}-muted)!important;box-shadow:none!important}.mfp-${slug} .mfp-chip .mf-option-label{color:inherit!important;font-size:12px!important;font-weight:700!important}.mfp-${slug} .mfp-chip .mf-option-control:checked + .mf-option-ui{border-color:var(--${p}-primary)!important;background:var(--${p}-soft)!important;color:var(--${p}-primary)!important}
.mfp-${slug} .mfp-check .mf-option-group{display:block!important}.mfp-${slug} .mfp-check .mf-option-item{display:flex!important;align-items:flex-start!important;gap:9px!important;margin:0!important;padding:0!important}.mfp-${slug} .mfp-check .mf-option-control{position:static!important;width:17px!important;height:17px!important;flex:0 0 17px!important;margin:3px 0 0!important;accent-color:var(--${p}-primary)!important;opacity:1!important}.mfp-${slug} .mfp-check .mf-option-ui{display:block!important;min-width:0!important;padding:0!important;border:0!important;background:transparent!important;color:var(--${p}-muted)!important}.mfp-${slug} .mfp-check .mf-option-label{display:block!important;color:inherit!important;font-size:13px!important;line-height:1.5!important}.mfp-${slug} .mfp-consent-check .mf-field-label{display:none!important}.mfp-${slug} .mfp-consent-check .mf-option-item{align-items:center!important}.mfp-${slug} .mfp-consent-check .mf-option-control{margin:0!important}.mfp-${slug} .mfp-consent-check .mf-option-ui{display:flex!important;align-items:center!important;min-height:20px!important}
.mfp-${slug} .mfp-actions{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:26px;padding-top:22px;border-top:1px solid var(--${p}-line);color:var(--${p}-muted);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.mfp-${slug} .mfp-btn{display:inline-flex!important;min-height:44px;align-items:center;justify-content:center;gap:8px;border:0!important;border-radius:999px;padding:11px 22px;background:var(--${p}-primary)!important;color:#fff!important;font-family:var(--${p}-font)!important;font-size:12px!important;font-weight:900!important;line-height:1.4!important;letter-spacing:.08em!important;text-transform:uppercase!important;cursor:pointer}
.mfp-${slug} .mfp-hidden{display:none!important}.mfp-${slug} .mf-form-title,.mfp-${slug} .mf-form-description,.mfp-${slug} .mf-success-message,.mfp-${slug} .mf-form-actions{display:none!important}.mf-form-wrapper.mf-custom-shell-mode.mf-custom-html-mode,.mf-form-wrapper.mf-custom-shell-mode.mf-custom-html-mode>.mf-form-inner,.mf-form-wrapper.mf-custom-shell-mode.mf-custom-html-mode>.mf-form-inner>.mf-form,.mf-form-wrapper.mf-custom-shell-mode.mf-custom-html-mode .mf-fields-container,.mf-form-wrapper:has(.mfp-${slug}),.mf-form-wrapper:has(.mfp-${slug}) .mf-form,.mf-form-wrapper:has(.mfp-${slug}) .mf-form-inner,.mf-form-wrapper:has(.mfp-${slug}) .mf-fields-container{--mf-page-bg:transparent!important;--mf-form-bg:transparent!important;--mf-card-bg:transparent!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;outline:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important;filter:none!important}.mf-form-wrapper:has(.mfp-${slug})::before,.mf-form-wrapper:has(.mfp-${slug})::after,.mf-form-wrapper:has(.mfp-${slug}) .mf-form::before,.mf-form-wrapper:has(.mfp-${slug}) .mf-form::after,.mf-form-wrapper:has(.mfp-${slug}) .mf-form-inner::before,.mf-form-wrapper:has(.mfp-${slug}) .mf-form-inner::after,.mf-form-wrapper:has(.mfp-${slug}) .mf-fields-container::before,.mf-form-wrapper:has(.mfp-${slug}) .mf-fields-container::after{display:none!important;content:none!important}.mf-form-wrapper:has(.mfp-${slug}) .mf-form-actions{display:none!important}
@media(max-width:700px){.mfp-${slug} .mfp-body{padding:8px 20px 28px}.mfp-${slug} .mfp-row{grid-template-columns:1fr;gap:15px}}
@media(max-width:440px){.mfp.mfp-${slug}{padding:12px 8px 28px!important}.mfp-${slug} .mfp-body{padding:6px 16px 24px}.mfp-${slug} .mfp-actions{align-items:stretch;flex-direction:column-reverse}.mfp-${slug} .mfp-btn{width:100%}}
`;
}

function makeTemplate(meta) {
  return {
    version: '1.0', slug: meta.slug, title: meta.title, description: meta.description,
    category: meta.category, categories: meta.categories, icon: meta.icon,
    templateGuideSlug: `tpl-${meta.slug}`, submitButtonText: meta.submit, successMessage: meta.success,
    fields: meta.fields, settings: {
      theme: 'system', multiPage: false, premiumGeneratedShell: true,
      premiumNativeMigrationBadge: `form-builder-controls-10/${meta.slug}`,
      showProgressBar: false, themeSelector: { enabled: false },
      // The renderer's default display-style adapter paints a high-specificity
      // border/radius around the root .mfp shell.  These designs already own
      // their visual frame in .mfp-paper, so keep the outer canvas chrome-free.
      displayStyle: { border: 'none', shadow: 'none' },
      customHtml: meta.html, customCss: meta.css, customScripts: {},
      themeCompatibility: {
        policy: 'locked', supportsPageColors: false, supportsPageTypography: false,
        supportsDarkHost: true, prefixes: [meta.prefix], immutable: meta.immutable,
      },
    },
    rules: [], workflow: { notifications: [] }, manifestVersion: 2,
  };
}

function realestate() {
  const slug = 'realestate-registration';
  const html = `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked"><div class="mfp-stage"><article class="mfp-paper">
<header class="mfp-header"><div class="mfp-art" aria-hidden="true"></div><div class="mfp-header-copy"><div><p class="mfp-brand">&#8962; EuroYouth Exchange</p><h1>Registration Form</h1><p>Your gateway to European youth programmes</p></div><div class="mfp-date"><small>Date</small><strong>24 Jul 2026</strong></div></div><div class="mfp-contact"><span>&#9673; Brussels, Belgium</span><span>&#9742; +32 2 555 0100</span><span>&#9993; info@euroyouth.eu</span></div><svg class="mfp-wave" viewBox="0 0 960 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0,20 C120,40 240,0 360,20 C480,40 600,0 720,20 C840,40 960,10 960,20 L960,40 L0,40 Z"></path></svg></header>
<div class="mfp-body"><section class="mfp-section" id="${slug}-personal">${section('&#9786;', 'Personal Information')}<div class="mfp-row"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div>{{field:email}}</div><div>{{field:phone}}</div><div>{{field:birth_year}}</div><div>{{field:country}}</div></div></section>
<section class="mfp-section" id="${slug}-programme">${section('&#9670;', 'Programme Details')}<div class="mfp-row"><div>{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div></div><div class="mfp-chip mfp-wide">{{field:interests}}</div></section>
<section class="mfp-section" id="${slug}-support">${section('&#8962;', 'Logistics & Support')}<div class="mfp-chip">{{field:accommodation}}</div><div class="mfp-check mfp-wide">{{field:scholarship}}</div><div class="mfp-wide">{{field:motivation}}</div></section>
<section class="mfp-section" id="${slug}-summary">${section('&#9635;', 'Application Summary')}<div class="mfp-summary"><div class="mfp-summary-head"><span>Item</span><span>Duration</span><span>Start</span><span>Status</span></div><div class="mfp-summary-empty">Select a programme above to see summary</div><div class="mfp-summary-total"><strong>Total items</strong><strong>0</strong></div></div></section>
<section class="mfp-section" id="${slug}-confirm">${section('&#9635;', 'Declaration')}<div class="mfp-declaration-grid"><div class="mfp-declaration-copy"><p>By submitting this form, I confirm that the information provided is accurate and complete. I agree to the EuroYouth Exchange programme terms and conditions, including data processing consent under GDPR. I understand that submission does not guarantee acceptance into the programme.</p>${realChecks}</div><div class="mfp-signature">{{field:signature}}</div></div></section>${hidden}${realActions}</div><footer class="mfp-foot"><strong>EuroYouth Exchange &copy; 2026</strong><span>Form REG-2026-001</span></footer></article></div></div>`;
  const css = baseCss({
    slug, p: 'rey', width: 720,
    c: { page: '#f0ebe0', paper: '#fffcf5', ink: '#1c1c1e', muted: '#8a8a8f', line: '#e5e0d8', primary: '#e8881a', soft: '#fff3e0' },
    font: '"MF Euro Inter",Inter,system-ui,-apple-system,"Segoe UI",sans-serif', display: '"MF Euro Bricolage","Bricolage Grotesque",Inter,system-ui,sans-serif',
  }) + `${templateFonts.realestate}
.mfp-${slug} .mfp-paper{overflow:hidden;border:0!important;border-radius:20px!important}.mfp-${slug} .mfp-header{position:relative;overflow:hidden;border-radius:20px 20px 0 0;background:#f5a130!important;color:#fff!important}.mfp-${slug} .mfp-art{position:absolute;inset:0;background:url('/Modules/MegaForm/Assets/img/${slug}/header-illus.png') center/cover;opacity:.24;mix-blend-mode:overlay}.DnnModule .mfp-${slug} .mfp-art{background-image:url('/DesktopModules/MegaForm/Assets/img/${slug}/header-illus.png')}
.mfp-${slug} .mfp-header-copy{position:relative;z-index:1;display:flex;justify-content:space-between;gap:24px;padding:28px 32px 8px}.mfp-${slug} .mfp-brand{margin:0 0 6px!important;color:rgba(255,255,255,.88)!important;font-family:var(--rey-font)!important;font-size:10px!important;font-weight:900!important;line-height:1.3!important;letter-spacing:.18em!important;text-transform:uppercase!important}.mfp-${slug} .mfp-header h1{margin:0!important;color:#fff!important;font-family:var(--rey-display)!important;font-size:30px!important;font-weight:800!important;line-height:1.08!important;letter-spacing:-.02em!important;text-transform:none!important}.mfp-${slug} .mfp-header-copy p:last-child{margin:6px 0 0!important;color:rgba(255,255,255,.84)!important;font-size:13px!important;line-height:1.5!important}
.mfp-${slug} .mfp-date{border-radius:12px;padding:9px 14px;background:rgba(255,255,255,.18);text-align:right}.mfp-${slug} .mfp-date small{display:block;font-size:9px;text-transform:uppercase}.mfp-${slug} .mfp-date strong{font-size:13px}.mfp-${slug} .mfp-contact{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:7px 22px;padding:7px 32px 14px;color:rgba(255,255,255,.82);font-size:11px}.mfp-${slug} .mfp-wave{position:relative;z-index:1;display:block;width:100%;height:38px;margin-bottom:-1px}.mfp-${slug} .mfp-wave path{fill:var(--rey-paper)}
.mfp.mfp-${slug}{--mf-btn-radius:999px}.mfp-${slug} .mfp-summary{overflow:hidden;border:1px solid var(--rey-line);border-radius:12px}.mfp-${slug} .mfp-summary-head{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;padding:10px 16px;background:#f5a130;color:#fff;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.mfp-${slug} .mfp-summary-head span:not(:first-child){text-align:center}.mfp-${slug} .mfp-summary-head span:last-child{text-align:right}.mfp-${slug} .mfp-summary-empty{padding:13px 16px;text-align:center;color:var(--rey-muted);font-size:13px}.mfp-${slug} .mfp-summary-total{display:flex;justify-content:space-between;padding:10px 16px;background:var(--rey-soft);color:var(--rey-ink);font-size:13px}.mfp-${slug} .mfp-summary-total strong:last-child{color:var(--rey-primary)}
.mfp-${slug} .mfp-declaration-grid{display:grid;grid-template-columns:minmax(0,1fr) 180px;align-items:start;gap:20px}.mfp-${slug} .mfp-declaration-copy>p{margin:0 0 16px!important;color:var(--rey-muted)!important;font-size:12px!important;line-height:1.65!important}.mfp-${slug} .mfp-declaration-copy .mfp-stack{gap:10px}.mfp-${slug} .mfp-signature .mf-field-label{margin-bottom:8px;color:var(--rey-muted);font-size:10px;letter-spacing:.08em}.mfp-${slug} .mfp-signature .mf-signature-canvas-wrap{border:2px dashed var(--rey-line)!important;border-radius:12px!important;background:#fff!important}.mfp-${slug} .mfp-signature .mf-signature-canvas{height:92px!important;background:#fff!important}.mfp-${slug} .mfp-signature .mf-signature-placeholder{color:var(--rey-muted)!important;font-size:12px!important}.mfp-${slug} .mfp-signature .mf-signature-actions{justify-content:flex-end;margin-top:5px}.mfp-${slug} .mfp-signature .mf-sig-clear,.mfp-${slug} .mfp-signature .mf-sig-undo{min-height:25px!important;padding:3px 7px!important;border:0!important;background:transparent!important;color:var(--rey-muted)!important;font-size:10px!important}
.mfp-${slug} .mfp-real-actions{margin-top:28px;padding-top:24px}.mfp-${slug} .mfp-back{display:inline-flex!important;min-height:42px;align-items:center;gap:8px;padding:9px 20px!important;border:1.5px solid var(--rey-line)!important;border-radius:999px!important;background:#fff!important;color:#3a3a3c!important;font-family:var(--rey-font)!important;font-size:13px!important;font-weight:600!important;line-height:1.4!important;text-transform:none!important}.mfp-${slug} .mfp-foot{display:flex;justify-content:space-between;gap:12px;padding:14px 32px;background:#f5a130;color:rgba(255,255,255,.88);font-size:10px}.mfp-${slug} .mfp-foot strong{font-weight:700}@media(max-width:640px){.mfp-${slug} .mfp-declaration-grid{grid-template-columns:1fr}.mfp-${slug} .mfp-signature{max-width:280px}}@media(max-width:540px){.mfp-${slug} .mfp-header-copy{padding-inline:20px}.mfp-${slug} .mfp-date{display:none}.mfp-${slug} .mfp-contact{padding-inline:20px}.mfp-${slug} .mfp-summary-head{grid-template-columns:2fr 1fr}.mfp-${slug} .mfp-summary-head span:nth-child(3),.mfp-${slug} .mfp-summary-head span:nth-child(4){display:none}.mfp-${slug} .mfp-real-actions{align-items:stretch}.mfp-${slug} .mfp-back{justify-content:center}.mfp-${slug} .mfp-foot{flex-direction:column;align-items:center}}
`;
  return makeTemplate({
    slug, title: 'EuroYouth Estate Registration',
    description: 'Warm illustrated EuroYouth registration sheet with a source-matched single-page form flow.',
    category: 'real-estate', categories: ['real-estate', 'registration', 'premium'], icon: 'home',
    submit: 'Submit Application', success: 'Application received. Check your email for confirmation.',
    fields: fields({ variant: 'realestate' }), html, css, prefix: 'rey',
    immutable: ['EuroYouth orange illustrated header', 'warm paper palette', 'Bricolage display treatment', 'semantic red #c0392b'],
  });
}

function botanical() {
  const slug = 'botanical-thankyou';
  const html = `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked"><div class="mfp-stage"><article class="mfp-paper">
<svg class="mfp-bot-tl" viewBox="0 0 200 200" aria-hidden="true"><g fill="none"><ellipse cx="40" cy="70" rx="18" ry="32" fill="#8B9E6E" transform="rotate(-30 40 70)" opacity=".7"/><ellipse cx="70" cy="40" rx="14" ry="26" fill="#A8B87A" transform="rotate(15 70 40)" opacity=".6"/><ellipse cx="25" cy="110" rx="12" ry="22" fill="#6B7F52" transform="rotate(-50 25 110)" opacity=".65"/><ellipse cx="95" cy="25" rx="10" ry="18" fill="#C9C46B" transform="rotate(40 95 25)" opacity=".5"/><circle cx="60" cy="30" r="9" fill="#D4A844" opacity=".75"/><path d="M10 80 Q30 60 50 90" stroke="#6B7F52" stroke-width="1.5" opacity=".5"/><path d="M30 120 Q50 100 70 130" stroke="#8B9E6E" stroke-width="1.2" opacity=".45"/><path d="M80 10 Q100 30 90 60" stroke="#6B7F52" opacity=".4"/><circle cx="60" cy="21" r="4" fill="#D4A844"/><circle cx="68" cy="26" r="4" fill="#D4A844"/><circle cx="68" cy="35" r="4" fill="#D4A844"/><circle cx="60" cy="39" r="4" fill="#D4A844"/><circle cx="52" cy="35" r="4" fill="#D4A844"/><circle cx="52" cy="26" r="4" fill="#D4A844"/><circle cx="60" cy="30" r="4" fill="#F2CC6B"/></g></svg>
<svg class="mfp-bot-tr" viewBox="0 0 120 80" aria-hidden="true"><path d="M80 10 Q110 5 115 35 Q110 60 85 50" stroke="#8B9E6E" stroke-width="1.2" fill="none" opacity=".5"/><ellipse cx="100" cy="20" rx="8" ry="14" fill="#A8B87A" transform="rotate(25 100 20)" opacity=".55"/><path d="M70 5 Q95 -5 110 15" stroke="#C9C46B" stroke-width="1.5" fill="none" stroke-dasharray="3 2" opacity=".5"/></svg>
<svg class="mfp-bot-br" viewBox="0 0 200 200" aria-hidden="true"><g fill="none"><ellipse cx="160" cy="130" rx="18" ry="32" fill="#8B9E6E" transform="rotate(30 160 130)" opacity=".7"/><ellipse cx="135" cy="165" rx="14" ry="26" fill="#A8B87A" transform="rotate(-20 135 165)" opacity=".6"/><ellipse cx="175" cy="95" rx="10" ry="20" fill="#6B7F52" transform="rotate(50 175 95)" opacity=".6"/><ellipse cx="110" cy="175" rx="12" ry="18" fill="#C9C46B" transform="rotate(-35 110 175)" opacity=".5"/><path d="M190 120 Q170 140 150 110" stroke="#6B7F52" stroke-width="1.5" opacity=".5"/><path d="M170 175 Q150 155 130 180" stroke="#8B9E6E" stroke-width="1.2" opacity=".45"/><circle cx="140" cy="160" r="5" fill="#D4A844" opacity=".6"/></g></svg>
<header class="mfp-header"><p>EuroYouth 2026</p><h1>Application Form</h1><i aria-hidden="true"></i><p>Begin your European adventure. Fill in your details below &mdash; all fields marked * are required.</p></header>
<div class="mfp-body"><section class="mfp-section" id="${slug}-personal">${section('&#9752;', 'Personal Details')}<div class="mfp-row"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div>{{field:email}}</div><div>{{field:phone}}</div><div>{{field:birth_year}}</div><div>{{field:country}}</div></div></section>
<section class="mfp-section" id="${slug}-programme">${section('&#9752;', 'Programme')}<div class="mfp-row"><div>{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div></div></section>
<section class="mfp-section" id="${slug}-interests">${section('&#9752;', 'Interests')}<div class="mfp-chip">{{field:interests}}</div></section>
<section class="mfp-section" id="${slug}-logistics">${section('&#9752;', 'Logistics')}<div class="mfp-row"><div class="mfp-radio">{{field:accommodation}}</div><div class="mfp-check">{{field:scholarship}}</div></div></section>
<section class="mfp-section" id="${slug}-motivation">${section('&#9752;', 'Motivation Letter')}{{field:motivation}}</section>
<section class="mfp-section" id="${slug}-signature">${section('&#9752;', 'Signature')}<p class="mfp-sign-note">Type your full name as a digital signature</p><div class="mfp-signature">{{field:signature}}</div></section>
<section class="mfp-section" id="${slug}-consent">${section('&#9752;', 'Consent')}${checks}</section>${hidden}${actions('Send Application')}</div></article></div></div>`;
  const css = baseCss({
    slug, p: 'bot', width: 672,
    c: { page: '#f0ead6', paper: '#fdf8ee', ink: '#4a3520', muted: '#8b6e3a', line: '#c4b08a', input: '#fdf8ee', primary: '#8b6e3a', soft: '#edf1df' },
    font: '"MF Euro Lato",Lato,"Segoe UI",sans-serif', display: '"MF Euro Playfair","Playfair Display",Georgia,"Times New Roman",serif',
  }) + `${templateFonts.botanical}
.mfp-${slug} .mfp-paper{overflow:hidden;border:1.5px solid #ddd0a8!important;border-radius:24px!important;box-shadow:0 22px 52px rgba(73,55,30,.18)}.mfp-${slug} .mfp-bot-tl,.mfp-${slug} .mfp-bot-tr,.mfp-${slug} .mfp-bot-br{position:absolute;z-index:0;pointer-events:none}.mfp-${slug} .mfp-bot-tl{top:0;left:0;width:176px;height:176px;opacity:.8}.mfp-${slug} .mfp-bot-tr{top:0;right:0;width:112px;height:80px;opacity:.6}.mfp-${slug} .mfp-bot-br{right:0;bottom:0;width:176px;height:176px;opacity:.8}
.mfp-${slug} .mfp-header{position:relative;z-index:1;padding:40px 40px 24px;text-align:center}.mfp-${slug} .mfp-header>p:first-child{margin:0 0 12px!important;color:#8b6e3a!important;font-size:11px!important;font-weight:700!important;line-height:1.5!important;letter-spacing:.25em!important;text-transform:uppercase!important}.mfp-${slug} .mfp-header h1{margin:0!important;color:#4a3520!important;font-family:var(--bot-display)!important;font-size:48px!important;font-style:italic!important;font-weight:500!important;line-height:1!important;letter-spacing:-.02em!important;text-transform:none!important}.mfp-${slug} .mfp-header>i{display:block;width:128px;height:1px;margin:12px auto 0;background:linear-gradient(to right,transparent,#c4b08a,transparent)}.mfp-${slug} .mfp-header>p:last-child{max-width:520px;margin:12px auto 0!important;color:#7a6040!important;font-size:14px!important;line-height:1.55!important}
.mfp-${slug} .mfp-body{position:relative;z-index:1;padding:0 48px 40px}.mfp-${slug} .mfp-section-head{gap:12px;margin:28px 0 16px}.mfp-${slug} .mfp-section-icon{width:16px;height:16px;background:transparent;color:#7a9a56;font-size:16px}.mfp-${slug} .mfp-section-head h2{color:#6b5230!important;font-family:Georgia,serif!important;font-size:13px!important;letter-spacing:.18em!important}.mfp-${slug} .mfp-section-head>span:last-child{background:#c4b08a}
.mfp-${slug} .mf-field-label{margin-bottom:4px;color:#8b6e3a;font-size:11px;font-weight:700;letter-spacing:.14em}.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{min-height:39px!important;padding:8px 4px!important;border:0!important;border-bottom:2px solid #c4b08a!important;border-radius:0!important;background:transparent!important;color:#3d2e1e!important;font-size:15px!important}.mfp-${slug} .mf-input:focus,.mfp-${slug} .mf-select:focus,.mfp-${slug} .mf-textarea:focus{border-color:#8b6e3a!important;box-shadow:none!important}.mfp-${slug} input::placeholder,.mfp-${slug} textarea::placeholder{color:#bba97a!important}
.mfp-${slug} .mfp-chip .mf-option-ui{border-color:#c4b08a!important;background:transparent!important;color:#6b5230!important}.mfp-${slug} .mfp-chip .mf-option-control:checked + .mf-option-ui{background:#8b6e3a!important;color:#fdf8ee!important}.mfp-${slug} .mfp-radio .mf-option-group{display:grid!important;gap:8px!important}.mfp-${slug} .mfp-radio .mf-option-item{display:flex!important;align-items:center!important;gap:10px!important;margin:0!important}.mfp-${slug} .mfp-radio .mf-option-control{position:static!important;width:16px!important;height:16px!important;margin:0!important;accent-color:#8b6e3a!important;opacity:1!important}.mfp-${slug} .mfp-radio .mf-option-ui{padding:0!important;border:0!important;background:transparent!important}.mfp-${slug} .mfp-radio .mf-option-label{color:#4a3520!important;font-size:14px!important}.mfp-${slug} .mfp-sign-note{margin:-3px 0 6px!important;color:#7a6040!important;font-size:12px!important;line-height:1.5!important}.mfp-${slug} .mfp-signature textarea{font-family:cursive!important;font-size:20px!important;letter-spacing:.04em!important}.mfp.mfp-${slug}{--mf-btn-radius:999px}.mfp-${slug} .mfp-btn{border-radius:999px;background:#8b6e3a!important}
@media(max-width:540px){.mfp-${slug} .mfp-header{padding:34px 22px 22px}.mfp-${slug} .mfp-header h1{font-size:39px}.mfp-${slug} .mfp-body{padding:0 22px 30px}.mfp-${slug} .mfp-bot-tl{width:128px;height:128px}.mfp-${slug} .mfp-bot-br{width:128px;height:128px}}
`;
  return makeTemplate({
    slug, title: 'Botanical Thank You Application',
    description: 'Botanical editorial application with source-matched underlined fields and warm paper finish.',
    category: 'application', categories: ['application', 'education', 'premium'], icon: 'leaf',
    submit: 'Send Application', success: 'Thank you. Your EuroYouth application has been received.',
    fields: fields({ variant: 'botanical' }), html, css, prefix: 'bot',
    immutable: ['botanical olive and parchment palette', 'italic editorial title', 'leaf ornament system', 'semantic red #c0392b'],
  });
}

function kawaii() {
  const slug = 'kawaii-diary';
  const html = `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked"><div class="mfp-stage"><article class="mfp-paper">
<svg class="mfp-kawaii-decos" viewBox="0 0 340 80" aria-hidden="true"><ellipse cx="20" cy="18" rx="12" ry="22" fill="#7EC8A0" transform="rotate(-30 20 18)" opacity=".85"/><ellipse cx="42" cy="8" rx="10" ry="18" fill="#5BAD82" transform="rotate(15 42 8)" opacity=".7"/><ellipse cx="6" cy="45" rx="8" ry="15" fill="#9ED4B2" transform="rotate(-50 6 45)" opacity=".65"/><ellipse cx="310" cy="12" rx="12" ry="22" fill="#7EC8A0" transform="rotate(30 310 12)" opacity=".85"/><ellipse cx="295" cy="5" rx="10" ry="18" fill="#5BAD82" transform="rotate(-15 295 5)" opacity=".7"/><ellipse cx="328" cy="40" rx="8" ry="15" fill="#9ED4B2" transform="rotate(50 328 40)" opacity=".65"/><polygon points="75,7 78,16 88,16 80,22 83,32 75,26 67,32 70,22 62,16 72,16" fill="#FFDD57" stroke="#fff" stroke-width="1.5"/><polygon points="260,5 263,14 273,14 265,20 268,30 260,24 252,30 255,20 247,14 257,14" fill="#FFDD57" stroke="#fff" stroke-width="1.5"/><path d="M130 55 C130 51 124 48 120 52 C116 48 110 51 110 55 C110 61 120 68 120 68 C120 68 130 61 130 55Z" fill="#FF8FA3" opacity=".8"/><path d="M230 52 C230 48 224 45 220 49 C216 45 210 48 210 52 C210 58 220 65 220 65 C220 65 230 58 230 52Z" fill="#FF8FA3" opacity=".8"/><g opacity=".7" fill="#fff" stroke="#ccc"><ellipse cx="88" cy="38" rx="16" ry="10"/><ellipse cx="78" cy="42" rx="10" ry="8"/><ellipse cx="98" cy="42" rx="10" ry="8"/><ellipse cx="255" cy="40" rx="16" ry="10"/><ellipse cx="245" cy="44" rx="10" ry="8"/><ellipse cx="265" cy="44" rx="10" ry="8"/></g><polygon points="148,30 158,25 155,35" fill="#87CEEB" stroke="#5aa8d0"/><polygon points="195,28 205,23 202,33" fill="#F9A875" stroke="#e0855a"/><circle cx="170" cy="45" r="9" fill="#FFDD57" stroke="#e8c840" stroke-width="1.5"/><g stroke="#e8c840" stroke-width="1.5"><path d="M170 30v5M170 55v5M155 45h5M180 45h5M159 34l4 4M177 52l4 4M181 34l-4 4M163 52l-4 4"/></g></svg>
<header class="mfp-header"><div><h1>MY APPLICATION</h1><p>EuroYouth 2026 &#10024;</p></div></header>
<div class="mfp-body"><section class="mfp-section" id="${slug}-profile">${kawaiiHead('Profile', 'blue')}<div class="mfp-row"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div>{{field:email}}</div><div>{{field:phone}}</div><div>{{field:birth_year}}</div><div>{{field:country}}</div></div></section>
<section class="mfp-section" id="${slug}-programme">${kawaiiHead('Programme', 'coral')}<div class="mfp-row"><div>{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div></div></section>
<section class="mfp-section" id="${slug}-interests">${kawaiiHead('Interests &#11088;', 'green')}<div class="mfp-chip">{{field:interests}}</div></section>
<section class="mfp-section" id="${slug}-support">${kawaiiHead('Stay &amp; Support &#127968;', 'lavender')}<div class="mfp-row"><div class="mfp-radio">{{field:accommodation}}</div><div class="mfp-check">{{field:scholarship}}</div></div></section>
<section class="mfp-section" id="${slug}-story">${kawaiiHead('My Story &#128214;', 'pink')}{{field:motivation}}</section>
<section class="mfp-section" id="${slug}-finish">${kawaiiHead('Almost there &#127881;', 'green')}${checks}</section>${hidden}${actions('Submit! &#128640;')}</div><svg class="mfp-kawaii-bottom" viewBox="0 0 340 60" aria-hidden="true"><ellipse cx="30" cy="50" rx="12" ry="20" fill="#7EC8A0" transform="rotate(20 30 50)" opacity=".8"/><ellipse cx="12" cy="40" rx="8" ry="14" fill="#9ED4B2" transform="rotate(-20 12 40)" opacity=".65"/><ellipse cx="315" cy="48" rx="12" ry="20" fill="#7EC8A0" transform="rotate(-20 315 48)" opacity=".8"/><ellipse cx="333" cy="38" rx="8" ry="14" fill="#9ED4B2" transform="rotate(20 333 38)" opacity=".65"/><polygon points="170,19 173,27 181,27 175,33 177,42 170,37 163,42 165,33 159,27 167,27" fill="#FFDD57" stroke="#fff" stroke-width="1.5"/><path d="M70 40 C70 36 64 33 60 37 C56 33 50 36 50 40 C50 46 60 53 60 53 C60 53 70 46 70 40Z" fill="#FF8FA3" opacity=".75"/><path d="M290 38 C290 34 284 31 280 35 C276 31 270 34 270 38 C270 44 280 51 280 51 C280 51 290 44 290 38Z" fill="#FF8FA3" opacity=".75"/></svg><footer class="mfp-foot">Dream big &middot; travel far &middot; stay curious</footer></article></div></div>`;
  const css = baseCss({
    slug, p: 'kw', width: 576,
    c: { page: '#f8f5e4', paper: '#fffef5', ink: '#555555', muted: '#5aaacf', line: '#d8eef5', primary: '#87ceeb', soft: '#eaf8fd' },
    font: '"MF Euro Nunito",Nunito,"Trebuchet MS",system-ui,sans-serif', display: '"MF Euro Nunito",Nunito,"Trebuchet MS",system-ui,sans-serif',
  }) + `${templateFonts.kawaii}
.mfp.mfp-${slug}{background-color:#f8f5e4!important;background-image:repeating-linear-gradient(#e8e4d2 0 1px,transparent 1px 28px),repeating-linear-gradient(90deg,#e8e4d2 0 1px,transparent 1px 28px)!important}.mfp-${slug} .mfp-paper{overflow:hidden;border:2px dashed #aaddcc!important;border-radius:24px!important;box-shadow:0 20px 48px rgba(84,133,141,.22)}.mfp-${slug} .mfp-kawaii-decos{position:absolute;z-index:0;top:0;left:0;width:100%;height:80px;pointer-events:none}.mfp-${slug} .mfp-header{position:relative;z-index:1;padding:80px 32px 20px;text-align:center}.mfp-${slug} .mfp-header>div{display:inline-block;border:2.5px dashed #87ceeb;border-radius:16px;padding:12px 24px;background:rgba(255,255,255,.7)}.mfp-${slug} .mfp-header h1{margin:0!important;color:#5aaacf!important;font-family:var(--kw-display)!important;font-size:30px!important;font-weight:900!important;line-height:1.15!important;letter-spacing:.06em!important;text-transform:none!important;text-shadow:2px 2px 0 rgba(0,0,0,.06)}.mfp-${slug} .mfp-header p{margin:2px 0 0!important;color:#f9a875!important;font-size:14px!important;font-weight:700!important;line-height:1.5!important}
.mfp-${slug} .mfp-body{position:relative;z-index:1;display:grid;gap:28px;padding:0 40px 40px}.mfp-${slug} .mfp-kawaii-head{display:flex;align-items:center;gap:8px;margin:0 0 12px}.mfp-${slug} .mfp-kawaii-head span{border-radius:999px;padding:3px 12px;color:#fff;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.mfp-${slug} .mfp-kawaii-head i{height:0;flex:1;border-bottom:2px dashed currentColor;opacity:.32}.mfp-${slug} .mfp-kawaii-blue{color:#87ceeb}.mfp-${slug} .mfp-kawaii-blue span{background:#87ceeb}.mfp-${slug} .mfp-kawaii-coral{color:#f9a875}.mfp-${slug} .mfp-kawaii-coral span{background:#f9a875}.mfp-${slug} .mfp-kawaii-green{color:#7ec8a0}.mfp-${slug} .mfp-kawaii-green span{background:#7ec8a0}.mfp-${slug} .mfp-kawaii-lavender{color:#c8b8e8}.mfp-${slug} .mfp-kawaii-lavender span{background:#c8b8e8}.mfp-${slug} .mfp-kawaii-pink{color:#ffb3c1}.mfp-${slug} .mfp-kawaii-pink span{background:#ffb3c1}
.mfp-${slug} .mfp-row{gap:12px}.mfp-${slug} .mf-field-label{margin-bottom:6px;color:#5aaacf;font-size:12px;font-weight:800;letter-spacing:.12em}.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{min-height:47px!important;padding:11px 16px!important;border:2px solid #d8eef5!important;border-radius:16px!important;background:#fff!important;color:#555!important;font-size:15px!important}.mfp-${slug} input::placeholder,.mfp-${slug} textarea::placeholder{color:#b8d8e5!important}
.mfp-${slug} .mfp-chip .mf-option-ui{border:2px solid #87ceeb!important;background:#fff!important;color:#555!important}.mfp-${slug} .mfp-chip .mf-option-item:nth-child(2n) .mf-option-ui{border-color:#ffdd57!important}.mfp-${slug} .mfp-chip .mf-option-item:nth-child(3n) .mf-option-ui{border-color:#7ec8a0!important}.mfp-${slug} .mfp-chip .mf-option-item:nth-child(4n) .mf-option-ui{border-color:#ffb3c1!important}.mfp-${slug} .mfp-radio .mf-option-group{display:grid!important;gap:8px!important}.mfp-${slug} .mfp-radio .mf-option-item{display:flex!important;align-items:center!important;gap:10px!important;margin:0!important}.mfp-${slug} .mfp-radio .mf-option-control{position:static!important;width:20px!important;height:20px!important;margin:0!important;accent-color:#c8b8e8!important;opacity:1!important}.mfp-${slug} .mfp-radio .mf-option-ui{padding:0!important;border:0!important;background:transparent!important}.mfp-${slug} .mfp-radio .mf-option-label{color:#555!important;font-size:14px!important}
.mfp.mfp-${slug}{--mf-btn-bg:linear-gradient(135deg,#87ceeb,#c8b8e8);--mf-btn-radius:999px}.mfp-${slug} .mfp-btn{background:linear-gradient(135deg,#87ceeb,#c8b8e8)!important;box-shadow:0 6px 18px rgba(104,185,219,.34)}.mfp-${slug} .mfp-kawaii-bottom{position:absolute;z-index:0;right:0;bottom:0;left:0;width:100%;height:60px;pointer-events:none}.mfp-${slug} .mfp-foot{position:relative;z-index:1;padding:0 20px 28px;text-align:center;color:#f9a875;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
@media(max-width:540px){.mfp-${slug} .mfp-header{padding:72px 18px 18px}.mfp-${slug} .mfp-header>div{padding-inline:18px}.mfp-${slug} .mfp-header h1{font-size:25px!important}.mfp-${slug} .mfp-body{gap:24px;padding:0 20px 30px}}
`;
  return makeTemplate({
    slug, title: 'Kawaii Diary Application',
    description: 'Playful source-matched notebook application with pastel sections and a graph-paper canvas.',
    category: 'application', categories: ['application', 'education', 'premium'], icon: 'sparkles',
    submit: 'Submit!', success: 'Submitted! Your next adventure is one step closer.',
    fields: fields({ variant: 'kawaii' }), html, css, prefix: 'kw',
    immutable: ['pastel kawaii palette', 'graph-paper background', 'sticker ornaments', 'semantic red #c0392b'],
  });
}

function cv() {
  const slug = 'cv-registration';
  const html = `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked"><div class="mfp-stage"><article class="mfp-paper"><header class="mfp-header"><div class="mfp-name"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div class="mfp-job">{{field:job_title}}</div></div><div class="mfp-photo" aria-hidden="true">Photo</div></header>
<div class="mfp-cv-grid"><aside class="mfp-sidebar"><section class="mfp-section" id="${slug}-contact">${section('&#9742;', 'Contact')}<div class="mfp-stack">{{field:phone}}{{field:email}}{{field:address}}{{field:website}}</div></section><section class="mfp-section">${section('&#9733;', 'Skills')}<p class="mfp-note">List your top skills</p><div class="mfp-stack">{{field:skill_1}}{{field:skill_2}}{{field:skill_3}}{{field:skill_4}}{{field:skill_5}}</div></section><section class="mfp-section">${section('&#9671;', 'Interests')}<div class="mfp-list">{{field:interests}}</div></section></aside>
<main class="mfp-main"><section class="mfp-section" id="${slug}-profile">${section('&#9786;', 'Personal Info')}<div class="mfp-row"><div>{{field:birth_year}}</div><div>{{field:nationality}}</div><div class="mfp-span">{{field:country}}</div></div></section><section class="mfp-section" id="${slug}-programme">${section('&#9635;', 'Programme')}<div class="mfp-row"><div class="mfp-span">{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div><div>{{field:accommodation}}</div></div></section><section class="mfp-section">${section('&#9998;', 'Profile / Motivation')}{{field:motivation}}</section><section class="mfp-section" id="${slug}-declaration">${section('&#10003;', 'Declaration')}<div class="mfp-stack"><div class="mfp-check">{{field:scholarship}}</div>${checks}</div></section>${hidden}${actions('Submit Application')}</main></div></article></div></div>`;
  const css = baseCss({
    slug, p: 'cvx', width: 672,
    c: { page: '#f2f2f2', paper: '#ffffff', ink: '#2b2b2b', muted: '#777777', line: '#c8c8c8', primary: '#2b2b2b', soft: '#e8e8e8' },
    font: 'Georgia,"Times New Roman",serif', display: 'Georgia,"Times New Roman",serif',
  }) + `
.mfp-${slug} .mfp-paper{border:0!important;border-radius:0!important;box-shadow:0 14px 36px rgba(0,0,0,.16)}.mfp-${slug} .mfp-header{display:grid;grid-template-columns:1fr 80px;gap:20px;padding:32px 32px 20px;border-bottom:4px solid #2b2b2b}.mfp-${slug} .mfp-name{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px}.mfp-${slug} .mfp-job{grid-column:1/-1}.mfp-${slug} .mfp-photo{display:grid;width:80px;height:96px;place-items:center;border:1px solid #c8c8c8;background:#e8e8e8;color:#9a9a9a;font-size:9px;text-transform:uppercase}
.mfp-${slug} .mfp-cv-grid{display:grid;grid-template-columns:200px minmax(0,1fr)}.mfp-${slug} .mfp-sidebar{padding:6px 24px 28px;border-right:1px solid #c8c8c8;background:#f8f8f8}.mfp-${slug} .mfp-main{padding:6px 28px 30px}.mfp-${slug} .mfp-section-head{margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid #c8c8c8}.mfp-${slug} .mfp-section-icon{width:24px;height:24px;border-radius:0;background:#e8e8e8;color:#2b2b2b}.mfp-${slug} .mfp-section-head h2{font-size:11px!important;letter-spacing:.2em!important}.mfp-${slug} .mfp-section-head>span:last-child{display:none}.mfp-${slug} .mfp-note{margin:-4px 0 9px!important;color:#9a9a9a!important;font-size:11px!important;line-height:1.4!important}.mfp-${slug} .mfp-span{grid-column:1/-1}
.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{padding:7px 3px!important;border:0!important;border-bottom:1px solid #cacaca!important;border-radius:0!important;background:transparent!important;font-family:Georgia,"Times New Roman",serif!important}.mfp-${slug} .mf-input:focus,.mfp-${slug} .mf-select:focus,.mfp-${slug} .mf-textarea:focus{box-shadow:none!important}.mfp-${slug} .mfp-header .mf-input{font-size:17px!important;font-weight:700!important}.mfp-${slug} .mfp-job .mf-input{color:#c0392b!important;font-size:13px!important;font-style:italic!important;font-weight:400!important}.mfp-${slug} .mfp-sidebar .mfp-stack{gap:9px}.mfp-${slug} .mfp-sidebar .mf-input{font-size:12px!important}
.mfp-${slug} .mfp-list .mf-option-group{display:grid!important;grid-template-columns:1fr!important;gap:6px!important}.mfp-${slug} .mfp-list .mf-option-item{display:flex!important;gap:7px!important;margin:0!important;padding:0!important}.mfp-${slug} .mfp-list .mf-option-control{position:static!important;width:14px!important;height:14px!important;margin:0!important;opacity:1!important}.mfp-${slug} .mfp-list .mf-option-ui{min-width:0!important;padding:0!important;border:0!important;background:transparent!important}.mfp-${slug} .mfp-list .mf-option-label{overflow-wrap:anywhere;color:#5a5a5a!important;font-size:11px!important}.mfp.mfp-${slug}{--mf-btn-radius:0}.mfp-${slug} .mfp-btn{border-radius:0}
@media(max-width:680px){.mfp-${slug} .mfp-header{grid-template-columns:1fr 64px;padding:22px 20px 18px}.mfp-${slug} .mfp-photo{width:64px;height:80px}.mfp-${slug} .mfp-cv-grid{grid-template-columns:1fr}.mfp-${slug} .mfp-sidebar{border-right:0;border-bottom:1px solid #c8c8c8}.mfp-${slug} .mfp-main{padding:6px 20px 26px}}@media(max-width:440px){.mfp-${slug} .mfp-name{grid-template-columns:1fr}.mfp-${slug} .mfp-job{grid-column:auto}.mfp-${slug} .mfp-photo{display:none}.mfp-${slug} .mfp-header{grid-template-columns:1fr}}
`;
  return makeTemplate({
    slug, title: 'EuroYouth CV Registration',
    description: 'Classic source-matched two-column CV application with a responsive resume layout.',
    category: 'hr', categories: ['hr', 'application', 'premium'], icon: 'file-user',
    submit: 'Submit Application', success: 'Thank you. Your CV application has been received.',
    fields: fields({ cv: true, variant: 'cv' }), html, css, prefix: 'cvx',
    immutable: ['classic monochrome CV palette', 'dark-red title accent', 'Georgia document typography', 'semantic red #c0392b'],
  });
}

function shellTexts(html) {
  const result = [];
  const seen = new Set();
  for (const match of html.matchAll(/>([^<>{}]+)</g)) {
    const text = match[1].replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2 || text.length > 90 || /^[\d\s.,:;|/\\*·–—-]+$/.test(text) || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result.slice(0, 60);
}

function guide(template) {
  const settings = template.settings;
  const chipFields = template.fields.filter((item) => item.optionDisplay === 'chips').map((item) => item.key);
  const frontmatter = {
    templateGuideSlug: template.templateGuideSlug, slug: template.slug, theme: settings.theme,
    rootSelector: `.mfp.mfp-${template.slug}`, tokenStyle: 'double', stepMechanism: 'single',
    stepAnchor: null, stepCount: 1, stepFieldKeys: template.fields.map((item) => item.key),
    chipFields, cardFields: [], contentTokens: [], colorVars: {}, lockedKeys: [],
    missingFieldPlaceholders: [], shellTexts: shellTexts(settings.customHtml),
    allowedOps: ['set_form_meta', 'set_field_property', 'set_html_text', 'add_field', 'remove_field'],
    forbiddenOps: ['replace_form_schema', 'set customHtml/customCss/theme'],
    immutable: settings.themeCompatibility.immutable,
    customCssSha256: hash(settings.customCss), shellSha256: hash(settings.customHtml),
    compositeWidgetPolicy: {
      forbiddenFieldTypes: ['Payment', 'Signature', 'File', 'Razor', 'DataRepeater', 'DataGrid', 'DynamicLabel', 'GridRepeater', 'StripePayment', 'PayPal', 'Square', 'UserTemplate', 'PdfForm']
        .filter((type) => !template.fields.some((field) => field.type === type)),
    },
  };
  const map = template.fields.map((item) => `- ${item.key}: ${item.type} — ${item.label}`).join('\n');
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n# ${template.title} — deterministic edit guide\n\n## Protocol\n\nPreserve the shell and CSS hashes. The template is a single-page, scroll-aware premium shell; section anchors and field placeholders are structural.\n\n## Field map\n\n${map}\n\n## Deterministic formulas\n\n- C1: use set_form_meta for form metadata.\n- C2: use set_field_property for labels, placeholders, validation, and options.\n- C3: use set_html_text with an exact string from shellTexts.\n- C4: preserve all chip display metadata when editing choices.\n- C5: add a schema field and exactly one matching {{field:KEY}} token.\n- C6: remove both the schema field and its matching token.\n- C7: preserve section ids, source order, and natural scroll flow.\n- C8: policy is locked; do not add page-color inheritance.\n\n## Hard invariants\n\n- customCss SHA-256: ${frontmatter.customCssSha256}\n- customHtml SHA-256: ${frontmatter.shellSha256}\n- theme: system\n- zero orphan and zero missing field placeholders\n- customScripts stays empty\n`;
}

const templates = [realestate(), botanical(), kawaii(), cv()];
for (const template of templates) {
  for (const dir of templateDirs) writeJson(path.join(dir, `${template.slug}.json`), template);
  for (const dir of guideDirs) write(path.join(dir, `${template.slug}.guide.md`), guide(template));
  process.stdout.write(`[template-authoring] ${template.slug}: ${template.fields.length} fields\n`);
}
