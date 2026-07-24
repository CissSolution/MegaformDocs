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

function fields({ cv = false } = {}) {
  const result = [
    f('first_name', 'Text', 'First name', { placeholder: 'Anna', required: true }),
    f('last_name', 'Text', 'Last name', { placeholder: 'Müller', required: true }),
  ];
  if (cv) result.push(f('job_title', 'Text', 'Current title / position', { placeholder: 'Student — University of Munich' }));
  result.push(
    f('email', 'Email', 'Email', { placeholder: 'anna@email.eu', required: true }),
    f('phone', 'Phone', 'Phone', { placeholder: '+49 170 123456' }),
  );
  if (cv) {
    result.push(
      f('address', 'Text', 'Address', { placeholder: '123 Any St, Berlin' }),
      f('website', 'Url', 'Website', { placeholder: 'anna-portfolio.eu' }),
      ...[1, 2, 3, 4, 5].map((n) => f(`skill_${n}`, 'Text', `Skill ${n}`, { placeholder: `Skill ${n}` })),
    );
  }
  result.push(f('birth_year', 'Number', 'Year of birth', { placeholder: '2004', validation: { min: 1970, max: 2010 } }));
  if (cv) result.push(f('nationality', 'Text', 'Nationality', { placeholder: 'German' }));
  result.push(
    f('country', 'Select', 'Country of residence', { placeholder: 'Select country', required: true, options: countries }),
    f('programme', 'Select', 'Programme', { placeholder: 'Select programme', required: true, options: programmes }),
    f('duration', 'Select', 'Duration (months)', { defaultValue: '3', options: durations }),
    f('start_month', 'Select', 'Preferred start month', { placeholder: 'Select month', required: true, options: months }),
    f('language_level', 'Select', 'Language level', { placeholder: 'Select level', options: levels }),
    f('interests', 'Checkbox', 'Interests', { options: interests, ...(cv ? {} : chip()) }),
    f('accommodation', 'Radio', 'Accommodation preference', { required: true, options: accommodations, ...chip() }),
    f('scholarship', 'Checkbox', 'Mobility grant', { options: [o('I would like to apply for a mobility grant', 'yes')] }),
    f('motivation', 'Textarea', 'Motivation', {
      placeholder: 'Tell us why you want to join and what you hope to gain...',
      properties: { rows: 4 }, validation: { maxLength: 1000 },
    }),
    f('newsletter', 'Checkbox', 'Newsletter', { options: [o('Subscribe to EuroYouth newsletter', 'yes')] }),
    f('terms', 'Checkbox', 'Terms and conditions', {
      required: true, options: [o('I accept the EuroYouth terms and data processing policy', 'accepted')],
    }),
    f('utm_source', 'Hidden', 'UTM source'),
    f('utm_campaign', 'Hidden', 'UTM campaign'),
  );
  return result;
}

const section = (icon, title) => `<div class="mfp-section-head"><span class="mfp-section-icon" aria-hidden="true">${icon}</span><h2>${title}</h2><span aria-hidden="true"></span></div>`;
const nav = (slug, labels) => `<nav class="mfp-scroll-nav" aria-label="Form sections">${labels.map(([key, label]) => `<a href="#${slug}-${key}">${label}</a>`).join('')}</nav>`;
const checks = `<div class="mfp-stack"><div class="mfp-check">{{field:newsletter}}</div><div class="mfp-check">{{field:terms}}</div></div>`;
const hidden = `<div class="mfp-hidden">{{field:utm_source}}{{field:utm_campaign}}</div>`;
const actions = (label) => `<div class="mfp-actions"><span aria-hidden="true">&#8592; Back</span><button type="submit" class="mfp-btn" data-mf-native-submit>${label} &#8594;</button></div>`;

function baseCss({ slug, p, width, c, font, display }) {
  return `/* MegaForm Gen-3 scroll-aware single-page shell: ${slug} */
.mfp.mfp-${slug}{--${p}-page:${c.page};--${p}-paper:${c.paper};--${p}-ink:${c.ink};--${p}-muted:${c.muted};--${p}-line:${c.line};--${p}-input:${c.input || '#fff'};--${p}-primary:${c.primary};--${p}-soft:${c.soft};--${p}-error:#c0392b;--${p}-font:${font};--${p}-display:${display};--mf-btn-bg:var(--${p}-primary);width:100%;max-width:${width + 96}px;margin:0 auto;color:var(--${p}-ink);font-family:var(--${p}-font)}
.mfp.mfp-${slug},.mfp.mfp-${slug} *,.mfp.mfp-${slug} *::before,.mfp.mfp-${slug} *::after{box-sizing:border-box}
.mfp-${slug} .mfp-stage{width:100%;padding:36px 24px;border-radius:24px;background:var(--${p}-page)}
.mfp-${slug} .mfp-paper{position:relative;width:min(100%,${width}px);margin:0 auto;background:var(--${p}-paper);box-shadow:0 24px 70px rgba(40,31,20,.16)}
.mfp-${slug} .mfp-scroll-nav{position:sticky;z-index:18;top:12px;display:flex;gap:8px;overflow-x:auto;padding:10px 20px;border-bottom:1px solid var(--${p}-line);background:color-mix(in srgb,var(--${p}-paper) 92%,transparent);box-shadow:0 8px 18px rgba(30,25,20,.06);backdrop-filter:blur(12px);scrollbar-width:none}
.mfp-${slug} .mfp-scroll-nav::-webkit-scrollbar{display:none}.mfp-${slug} .mfp-scroll-nav a{flex:0 0 auto;border:1px solid var(--${p}-line);border-radius:999px;padding:7px 12px;background:var(--${p}-input);color:var(--${p}-muted);font-size:10px;font-weight:800;letter-spacing:.09em;text-decoration:none;text-transform:uppercase}
.mfp-${slug} .mfp-scroll-nav a:hover,.mfp-${slug} .mfp-scroll-nav a:focus-visible{border-color:var(--${p}-primary);background:var(--${p}-soft);color:var(--${p}-primary);outline:0}
.mfp-${slug} .mfp-body{position:relative;padding:12px 32px 36px}.mfp-${slug} .mfp-section{scroll-margin-top:78px}
.mfp-${slug} .mfp-section-head{display:flex;align-items:center;gap:11px;margin:26px 0 16px}.mfp-${slug} .mfp-section-head h2{margin:0;color:var(--${p}-ink);font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.mfp-${slug} .mfp-section-head>span:last-child{height:1px;flex:1;background:var(--${p}-line)}
.mfp-${slug} .mfp-section-icon{display:grid;width:30px;height:30px;flex:0 0 auto;place-items:center;border-radius:8px;background:var(--${p}-soft);color:var(--${p}-primary);font-size:14px;font-weight:900}
.mfp-${slug} .mfp-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px}.mfp-${slug} .mfp-stack{display:grid;gap:16px}.mfp-${slug} .mfp-wide{margin-top:16px}.mfp-${slug} .mf-field-group{min-width:0;margin:0}
.mfp-${slug} .mf-field-label{display:block;margin:0 0 6px;color:var(--${p}-muted);font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.mfp-${slug} .mf-required{color:var(--${p}-error)}
.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{width:100%!important;min-height:43px!important;padding:9px 12px!important;border:1px solid var(--${p}-line)!important;border-radius:8px!important;outline:0!important;background:var(--${p}-input)!important;color:var(--${p}-ink)!important;box-shadow:none!important;font:inherit!important;font-size:14px!important}
.mfp-${slug} .mf-textarea,.mfp-${slug} textarea{min-height:112px!important;resize:vertical!important}.mfp-${slug} .mf-input:focus,.mfp-${slug} .mf-select:focus,.mfp-${slug} .mf-textarea:focus,.mfp-${slug} input:focus,.mfp-${slug} select:focus,.mfp-${slug} textarea:focus{border-color:var(--${p}-primary)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--${p}-primary) 14%,transparent)!important}
.mfp-${slug} input::placeholder,.mfp-${slug} textarea::placeholder{color:color-mix(in srgb,var(--${p}-muted) 58%,transparent)}.mfp-${slug} .mf-field-error{margin-top:5px;color:var(--${p}-error);font-size:11px}
.mfp-${slug} .mfp-chip .mf-option-group{display:flex!important;flex-wrap:wrap!important;gap:8px!important;grid-template-columns:none!important}.mfp-${slug} .mfp-chip .mf-option-item{display:inline-flex!important;width:auto!important;margin:0!important;padding:0!important}.mfp-${slug} .mfp-chip .mf-option-control{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;clip-path:inset(50%)!important}
.mfp-${slug} .mfp-chip .mf-option-ui{display:inline-flex!important;min-height:32px!important;align-items:center!important;padding:7px 12px!important;border:1px solid var(--${p}-line)!important;border-radius:999px!important;background:var(--${p}-input)!important;color:var(--${p}-muted)!important;box-shadow:none!important}.mfp-${slug} .mfp-chip .mf-option-label{color:inherit!important;font-size:12px!important;font-weight:700!important}.mfp-${slug} .mfp-chip .mf-option-control:checked + .mf-option-ui{border-color:var(--${p}-primary)!important;background:var(--${p}-soft)!important;color:var(--${p}-primary)!important}
.mfp-${slug} .mfp-check .mf-option-group{display:block!important}.mfp-${slug} .mfp-check .mf-option-item{display:flex!important;align-items:flex-start!important;gap:9px!important;margin:0!important;padding:0!important}.mfp-${slug} .mfp-check .mf-option-control{position:static!important;width:17px!important;height:17px!important;margin:3px 0 0!important;accent-color:var(--${p}-primary)!important;opacity:1!important}.mfp-${slug} .mfp-check .mf-option-ui{display:block!important;padding:0!important;border:0!important;background:transparent!important;color:var(--${p}-muted)!important}.mfp-${slug} .mfp-check .mf-option-label{color:inherit!important;font-size:13px!important;line-height:1.5!important}
.mfp-${slug} .mfp-actions{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:26px;padding-top:22px;border-top:1px solid var(--${p}-line);color:var(--${p}-muted);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.mfp-${slug} .mfp-btn{display:inline-flex;min-height:44px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;padding:11px 22px;background:var(--${p}-primary)!important;color:#fff!important;font:inherit;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.mfp-${slug} .mfp-hidden{display:none!important}.mfp-${slug} .mf-form-title,.mfp-${slug} .mf-form-description,.mfp-${slug} .mf-success-message,.mfp-${slug} .mf-form-actions{display:none!important}.mf-form-wrapper:has(.mfp-${slug})>.mf-form-inner{width:100%!important;max-width:${width + 96}px!important}.mf-form-wrapper:has(.mfp-${slug}) .mf-form-actions{display:none!important}
@media(max-width:700px){.mfp-${slug} .mfp-stage{padding:12px;border-radius:18px}.mfp-${slug} .mfp-body{padding:8px 20px 28px}.mfp-${slug} .mfp-row{grid-template-columns:1fr;gap:15px}.mfp-${slug} .mfp-scroll-nav{top:6px;padding:8px 14px}}
@media(max-width:440px){.mfp-${slug} .mfp-stage{padding:0;background:transparent}.mfp-${slug} .mfp-body{padding:6px 16px 24px}.mfp-${slug} .mfp-actions{align-items:stretch;flex-direction:column-reverse}.mfp-${slug} .mfp-btn{width:100%}}
body:has(.aperture-header) .DnnModule .mfp-${slug} .mfp-scroll-nav{top:168px}
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
${nav(slug, [['personal', 'Personal'], ['programme', 'Programme'], ['support', 'Support'], ['confirm', 'Confirm']])}
<div class="mfp-body"><section class="mfp-section" id="${slug}-personal">${section('&#9786;', 'Personal Information')}<div class="mfp-row"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div>{{field:email}}</div><div>{{field:phone}}</div><div>{{field:birth_year}}</div><div>{{field:country}}</div></div></section>
<section class="mfp-section" id="${slug}-programme">${section('&#9670;', 'Programme Details')}<div class="mfp-row"><div>{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div></div><div class="mfp-chip mfp-wide">{{field:interests}}</div></section>
<section class="mfp-section" id="${slug}-support">${section('&#8962;', 'Logistics & Support')}<div class="mfp-chip">{{field:accommodation}}</div><div class="mfp-check mfp-wide">{{field:scholarship}}</div><div class="mfp-wide">{{field:motivation}}</div></section>
<section class="mfp-section" id="${slug}-confirm">${section('&#10003;', 'Declaration')}${checks}</section>${hidden}${actions('Submit Application')}</div><footer class="mfp-foot">EuroYouth Exchange &copy; 2026 <span>Brussels · Berlin · Barcelona</span></footer></article></div></div>`;
  const css = baseCss({
    slug, p: 'rey', width: 720,
    c: { page: '#f0ebe0', paper: '#fffcf5', ink: '#1c1c1e', muted: '#8a8a8f', line: '#e5e0d8', primary: '#e8881a', soft: '#fff3e0' },
    font: 'Inter,system-ui,-apple-system,"Segoe UI",sans-serif', display: '"Bricolage Grotesque",Inter,system-ui,sans-serif',
  }) + `
.mfp-${slug} .mfp-paper{overflow:visible;border-radius:20px}.mfp-${slug} .mfp-header{position:relative;overflow:hidden;border-radius:20px 20px 0 0;background:#f5a130;color:#fff}.mfp-${slug} .mfp-art{position:absolute;inset:0;background:url('/Modules/MegaForm/Assets/img/${slug}/header-illus.png') center/cover;opacity:.24;mix-blend-mode:overlay}.DnnModule .mfp-${slug} .mfp-art{background-image:url('/DesktopModules/MegaForm/Assets/img/${slug}/header-illus.png')}
.mfp-${slug} .mfp-header-copy{position:relative;z-index:1;display:flex;justify-content:space-between;gap:24px;padding:28px 32px 8px}.mfp-${slug} .mfp-brand{margin:0 0 6px;color:rgba(255,255,255,.82);font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.mfp-${slug} .mfp-header h1{margin:0;color:#fff;font-family:var(--rey-display);font-size:30px;font-weight:900}.mfp-${slug} .mfp-header-copy p:last-child{margin:6px 0 0;color:rgba(255,255,255,.76);font-size:13px}
.mfp-${slug} .mfp-date{border-radius:12px;padding:9px 14px;background:rgba(255,255,255,.18);text-align:right}.mfp-${slug} .mfp-date small{display:block;font-size:9px;text-transform:uppercase}.mfp-${slug} .mfp-date strong{font-size:13px}.mfp-${slug} .mfp-contact{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:7px 22px;padding:7px 32px 14px;color:rgba(255,255,255,.82);font-size:11px}.mfp-${slug} .mfp-wave{position:relative;z-index:1;display:block;width:100%;height:38px;margin-bottom:-1px}.mfp-${slug} .mfp-wave path{fill:var(--rey-paper)}
.mfp-${slug} .mfp-foot{display:flex;justify-content:space-between;gap:12px;padding:14px 32px 20px;color:var(--rey-muted);font-size:10px}@media(max-width:540px){.mfp-${slug} .mfp-header-copy{padding-inline:20px}.mfp-${slug} .mfp-date{display:none}.mfp-${slug} .mfp-contact{padding-inline:20px}.mfp-${slug} .mfp-foot{flex-direction:column;align-items:center}}
`;
  return makeTemplate({
    slug, title: 'EuroYouth Estate Registration',
    description: 'Warm illustrated EuroYouth registration sheet with sticky section navigation and long-form support.',
    category: 'real-estate', categories: ['real-estate', 'registration', 'premium'], icon: 'home',
    submit: 'Submit Application', success: 'Application received. Check your email for confirmation.',
    fields: fields(), html, css, prefix: 'rey',
    immutable: ['EuroYouth orange illustrated header', 'warm paper palette', 'Bricolage display treatment', 'semantic red #c0392b'],
  });
}

function botanical() {
  const slug = 'botanical-thankyou';
  const html = `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked"><div class="mfp-stage"><article class="mfp-paper"><header class="mfp-header"><div class="mfp-leaves" aria-hidden="true">&#9752; &#9752; &#10047;</div><p>EuroYouth 2026</p><h1>Application Form</h1><p>Begin your European adventure. Fill in your details below — all fields marked * are required.</p></header>
${nav(slug, [['personal', 'Personal'], ['programme', 'Programme'], ['journey', 'Journey'], ['declaration', 'Declaration']])}
<div class="mfp-body"><section class="mfp-section" id="${slug}-personal">${section('&#9752;', 'Personal Details')}<div class="mfp-row"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div>{{field:email}}</div><div>{{field:phone}}</div><div>{{field:birth_year}}</div><div>{{field:country}}</div></div></section>
<section class="mfp-section" id="${slug}-programme">${section('&#9752;', 'Programme')}<div class="mfp-row"><div>{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div></div></section>
<section class="mfp-section" id="${slug}-journey">${section('&#9752;', 'Your Journey')}<div class="mfp-chip">{{field:interests}}</div><div class="mfp-chip mfp-wide">{{field:accommodation}}</div><div class="mfp-check mfp-wide">{{field:scholarship}}</div><div class="mfp-wide">{{field:motivation}}</div></section>
<section class="mfp-section" id="${slug}-declaration">${section('&#9752;', 'Declaration')}${checks}</section>${hidden}${actions('Send Application')}</div><footer class="mfp-foot">&#9752; Grow somewhere new. &#9752;</footer></article></div></div>`;
  const css = baseCss({
    slug, p: 'bot', width: 660,
    c: { page: '#f4edd8', paper: '#fffaf0', ink: '#4b3626', muted: '#8b7a61', line: '#cdbd98', input: '#fffaf0', primary: '#6f8f4e', soft: '#edf1df' },
    font: 'Georgia,"Times New Roman",serif', display: '"Cormorant Garamond",Georgia,"Times New Roman",serif',
  }) + `
.mfp-${slug} .mfp-paper{overflow:hidden;border:1px solid #d8cba9;border-radius:30px}.mfp-${slug} .mfp-header{position:relative;padding:38px 44px 28px;text-align:center}.mfp-${slug} .mfp-header>p:first-of-type{margin:0 0 12px;color:#8b6e3a;font-size:10px;font-weight:800;letter-spacing:.28em;text-transform:uppercase}.mfp-${slug} .mfp-header h1{margin:0;font-family:var(--bot-display);font-size:48px;font-style:italic;line-height:1}.mfp-${slug} .mfp-header>p:last-child{max-width:520px;margin:22px auto 0;color:#6e5a45;font-size:13px}.mfp-${slug} .mfp-leaves{position:absolute;top:16px;left:18px;color:#91a66d;font-size:25px;transform:rotate(-20deg)}
.mfp-${slug} .mfp-scroll-nav{box-shadow:none}.mfp-${slug} .mfp-scroll-nav a{border:0;background:transparent}.mfp-${slug} .mfp-body{padding-inline:46px}.mfp-${slug} .mfp-section-icon{width:auto;height:auto;background:transparent;font-size:18px}.mfp-${slug} .mfp-section-head h2{font-family:var(--bot-display);font-size:16px}
.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{padding:8px 2px!important;border:0!important;border-bottom:1.5px solid var(--bot-line)!important;border-radius:0!important;background:transparent!important}.mfp-${slug} .mf-input:focus,.mfp-${slug} .mf-select:focus,.mfp-${slug} .mf-textarea:focus{box-shadow:none!important}.mfp-${slug} .mfp-btn{border-radius:4px}.mfp-${slug} .mfp-foot{padding:15px 24px 26px;text-align:center;color:#8b6e3a;font-size:12px;font-style:italic}@media(max-width:540px){.mfp-${slug} .mfp-header{padding-inline:22px}.mfp-${slug} .mfp-header h1{font-size:39px}.mfp-${slug} .mfp-body{padding-inline:22px}}
`;
  return makeTemplate({
    slug, title: 'Botanical Thank You Application',
    description: 'Botanical editorial application with underlined fields, sticky sections, and a warm paper finish.',
    category: 'application', categories: ['application', 'education', 'premium'], icon: 'leaf',
    submit: 'Send Application', success: 'Thank you. Your EuroYouth application has been received.',
    fields: fields(), html, css, prefix: 'bot',
    immutable: ['botanical olive and parchment palette', 'italic editorial title', 'leaf ornament system', 'semantic red #c0392b'],
  });
}

function kawaii() {
  const slug = 'kawaii-diary';
  const html = `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked"><div class="mfp-stage"><article class="mfp-paper"><header class="mfp-header"><div class="mfp-stickers" aria-hidden="true">&#10047; &#9733; &#9728; &#9829;</div><div><h1>MY APPLICATION</h1><p>EuroYouth 2026 &#10024;</p></div></header>
${nav(slug, [['profile', 'Profile'], ['programme', 'Programme'], ['dreams', 'Dreams'], ['finish', 'Finish']])}
<div class="mfp-body"><section class="mfp-section" id="${slug}-profile">${section('&#9786;', 'Profile')}<div class="mfp-row"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div>{{field:email}}</div><div>{{field:phone}}</div><div>{{field:birth_year}}</div><div>{{field:country}}</div></div></section>
<section class="mfp-section" id="${slug}-programme">${section('&#9733;', 'Programme')}<div class="mfp-row"><div>{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div></div></section>
<section class="mfp-section" id="${slug}-dreams">${section('&#9829;', 'My Dream Trip')}<div class="mfp-chip">{{field:interests}}</div><div class="mfp-chip mfp-wide">{{field:accommodation}}</div><div class="mfp-check mfp-wide">{{field:scholarship}}</div><div class="mfp-wide">{{field:motivation}}</div></section>
<section class="mfp-section" id="${slug}-finish">${section('&#10024;', 'One Last Thing')}${checks}</section>${hidden}${actions('Submit! &#128640;')}</div><footer class="mfp-foot">Dream big · travel far · stay curious</footer></article></div></div>`;
  const css = baseCss({
    slug, p: 'kw', width: 570,
    c: { page: '#fbf8ea', paper: '#fffef6', ink: '#555555', muted: '#75b9d2', line: '#d8eef5', primary: '#68b9db', soft: '#eaf8fd' },
    font: '"Trebuchet MS",Nunito,system-ui,sans-serif', display: '"Trebuchet MS",Nunito,system-ui,sans-serif',
  }) + `
.mfp-${slug} .mfp-stage{background-color:#fbf8ea;background-image:linear-gradient(rgba(130,130,100,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(130,130,100,.12) 1px,transparent 1px);background-size:28px 28px}.mfp-${slug} .mfp-paper{overflow:hidden;border:2px dashed #a8d5cb;border-radius:28px}.mfp-${slug} .mfp-header{padding:28px 36px 18px;text-align:center}.mfp-${slug} .mfp-stickers{margin-bottom:9px;color:#f7c84b;font-size:22px;word-spacing:14px}.mfp-${slug} .mfp-header>div:last-child{display:inline-block;border:2px dashed #89cfe2;border-radius:18px;padding:14px 28px 12px;background:rgba(255,255,255,.62)}.mfp-${slug} .mfp-header h1{margin:0;color:#5ab2d2;font-size:27px;font-weight:500}.mfp-${slug} .mfp-header p{margin:4px 0 0;color:#f9a875;font-size:12px;font-weight:800}
.mfp-${slug} .mfp-scroll-nav{border-block:1px dashed #c9e2df;box-shadow:none}.mfp-${slug} .mfp-scroll-nav a{border-style:dashed}.mfp-${slug} .mfp-body{padding-inline:38px}.mfp-${slug} .mfp-section-icon{border-radius:999px;background:#68b9db;color:#fff}.mfp-${slug} .mfp-section:nth-of-type(2) .mfp-section-icon{background:#f59a6f}.mfp-${slug} .mfp-section:nth-of-type(3) .mfp-section-icon{background:#b79be7}.mfp-${slug} .mfp-section:nth-of-type(4) .mfp-section-icon{background:#82c9ad}
.mfp.mfp-${slug}{--mf-btn-bg:linear-gradient(135deg,#68b9db,#b79be7)}.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{border:2px solid var(--kw-line)!important;border-radius:15px!important}.mfp-${slug} .mfp-btn{background:linear-gradient(135deg,#68b9db,#b79be7)!important;box-shadow:0 6px 18px rgba(104,185,219,.34)}.mfp-${slug} .mfp-foot{padding:15px 20px 28px;text-align:center;color:#f59a6f;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}@media(max-width:540px){.mfp-${slug} .mfp-header{padding-inline:18px}.mfp-${slug} .mfp-body{padding-inline:20px}}
`;
  return makeTemplate({
    slug, title: 'Kawaii Diary Application',
    description: 'Playful notebook-style EuroYouth application with pastel sections and sticky diary navigation.',
    category: 'application', categories: ['application', 'education', 'premium'], icon: 'sparkles',
    submit: 'Submit!', success: 'Submitted! Your next adventure is one step closer.',
    fields: fields(), html, css, prefix: 'kw',
    immutable: ['pastel kawaii palette', 'graph-paper background', 'sticker ornaments', 'semantic red #c0392b'],
  });
}

function cv() {
  const slug = 'cv-registration';
  const html = `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked"><div class="mfp-stage"><article class="mfp-paper"><header class="mfp-header"><div class="mfp-name"><div>{{field:first_name}}</div><div>{{field:last_name}}</div><div class="mfp-job">{{field:job_title}}</div></div><div class="mfp-photo" aria-hidden="true">Photo</div></header>
${nav(slug, [['contact', 'Contact'], ['profile', 'Profile'], ['programme', 'Programme'], ['declaration', 'Declaration']])}
<div class="mfp-cv-grid"><aside class="mfp-sidebar"><section class="mfp-section" id="${slug}-contact">${section('&#9742;', 'Contact')}<div class="mfp-stack">{{field:phone}}{{field:email}}{{field:address}}{{field:website}}</div></section><section class="mfp-section">${section('&#9733;', 'Skills')}<p class="mfp-note">List your top skills</p><div class="mfp-stack">{{field:skill_1}}{{field:skill_2}}{{field:skill_3}}{{field:skill_4}}{{field:skill_5}}</div></section><section class="mfp-section">${section('&#9671;', 'Interests')}<div class="mfp-list">{{field:interests}}</div></section></aside>
<main class="mfp-main"><section class="mfp-section" id="${slug}-profile">${section('&#9786;', 'Personal Info')}<div class="mfp-row"><div>{{field:birth_year}}</div><div>{{field:nationality}}</div><div class="mfp-span">{{field:country}}</div></div></section><section class="mfp-section" id="${slug}-programme">${section('&#9635;', 'Programme')}<div class="mfp-row"><div class="mfp-span">{{field:programme}}</div><div>{{field:duration}}</div><div>{{field:start_month}}</div><div>{{field:language_level}}</div><div class="mfp-chip">{{field:accommodation}}</div></div></section><section class="mfp-section">${section('&#9998;', 'Profile / Motivation')}{{field:motivation}}</section><section class="mfp-section" id="${slug}-declaration">${section('&#10003;', 'Declaration')}<div class="mfp-stack"><div class="mfp-check">{{field:scholarship}}</div>${checks}</div></section>${hidden}${actions('Submit Application')}</main></div></article></div></div>`;
  const css = baseCss({
    slug, p: 'cvx', width: 664,
    c: { page: '#f2f2f2', paper: '#ffffff', ink: '#2b2b2b', muted: '#777777', line: '#c8c8c8', primary: '#2b2b2b', soft: '#e8e8e8' },
    font: 'Georgia,"Times New Roman",serif', display: 'Georgia,"Times New Roman",serif',
  }) + `
.mfp-${slug} .mfp-header{display:grid;grid-template-columns:1fr 80px;gap:16px;padding:28px 32px 22px;border-bottom:4px solid #2b2b2b}.mfp-${slug} .mfp-name{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px}.mfp-${slug} .mfp-job{grid-column:1/-1}.mfp-${slug} .mfp-photo{display:grid;width:80px;height:96px;place-items:center;border:1px solid #c8c8c8;background:#e8e8e8;color:#9a9a9a;font-size:9px;text-transform:uppercase}.mfp-${slug} .mfp-scroll-nav{top:8px;background:rgba(255,255,255,.94)}.mfp-${slug} .mfp-scroll-nav a{border-radius:0}
.mfp-${slug} .mfp-cv-grid{display:grid;grid-template-columns:200px minmax(0,1fr)}.mfp-${slug} .mfp-sidebar{padding:8px 22px 26px;border-right:1px solid #c8c8c8;background:#f8f8f8}.mfp-${slug} .mfp-main{padding:8px 28px 30px}.mfp-${slug} .mfp-section-head{margin:22px 0 12px;padding-bottom:6px;border-bottom:1px solid #c8c8c8}.mfp-${slug} .mfp-section-icon{width:23px;height:23px;border-radius:0;background:#e8e8e8;color:#2b2b2b}.mfp-${slug} .mfp-section-head h2{font-size:11px;letter-spacing:.2em}.mfp-${slug} .mfp-section-head>span:last-child{display:none}.mfp-${slug} .mfp-note{margin:-4px 0 9px;color:#9a9a9a;font-size:11px}.mfp-${slug} .mfp-span{grid-column:1/-1}
.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{padding:7px 3px!important;border:0!important;border-bottom:1px solid #cacaca!important;border-radius:0!important;background:transparent!important;font-family:Georgia,"Times New Roman",serif!important}.mfp-${slug} .mf-input:focus,.mfp-${slug} .mf-select:focus,.mfp-${slug} .mf-textarea:focus{box-shadow:none!important}.mfp-${slug} .mfp-header .mf-input{font-size:17px!important;font-weight:700!important}.mfp-${slug} .mfp-job .mf-input{color:#c0392b!important;font-size:13px!important;font-style:italic!important;font-weight:400!important}.mfp-${slug} .mfp-sidebar .mfp-stack{gap:9px}.mfp-${slug} .mfp-sidebar .mf-input{font-size:12px!important}
.mfp-${slug} .mfp-list .mf-option-group{display:grid!important;grid-template-columns:1fr!important;gap:6px!important}.mfp-${slug} .mfp-list .mf-option-item{display:flex!important;gap:7px!important;margin:0!important;padding:0!important}.mfp-${slug} .mfp-list .mf-option-control{position:static!important;width:14px!important;height:14px!important;margin:0!important;opacity:1!important}.mfp-${slug} .mfp-list .mf-option-ui{min-width:0!important;padding:0!important;border:0!important;background:transparent!important}.mfp-${slug} .mfp-list .mf-option-label{overflow-wrap:anywhere;color:#5a5a5a!important;font-size:11px!important}.mfp-${slug} .mfp-btn{border-radius:0}
@media(max-width:680px){.mfp-${slug} .mfp-header{grid-template-columns:1fr 64px;padding:22px 20px 18px}.mfp-${slug} .mfp-photo{width:64px;height:80px}.mfp-${slug} .mfp-cv-grid{grid-template-columns:1fr}.mfp-${slug} .mfp-sidebar{border-right:0;border-bottom:1px solid #c8c8c8}.mfp-${slug} .mfp-main{padding:6px 20px 26px}}@media(max-width:440px){.mfp-${slug} .mfp-name{grid-template-columns:1fr}.mfp-${slug} .mfp-job{grid-column:auto}.mfp-${slug} .mfp-photo{display:none}.mfp-${slug} .mfp-header{grid-template-columns:1fr}}
`;
  return makeTemplate({
    slug, title: 'EuroYouth CV Registration',
    description: 'Classic two-column CV application with sticky document navigation and a responsive resume layout.',
    category: 'hr', categories: ['hr', 'application', 'premium'], icon: 'file-user',
    submit: 'Submit Application', success: 'Thank you. Your CV application has been received.',
    fields: fields({ cv: true }), html, css, prefix: 'cvx',
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
      forbiddenFieldTypes: ['Payment', 'Signature', 'File', 'Razor', 'DataRepeater', 'DataGrid', 'DynamicLabel', 'GridRepeater', 'StripePayment', 'PayPal', 'Square', 'UserTemplate', 'PdfForm'],
    },
  };
  const map = template.fields.map((item) => `- ${item.key}: ${item.type} — ${item.label}`).join('\n');
  return `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n# ${template.title} — deterministic edit guide\n\n## Protocol\n\nPreserve the shell and CSS hashes. The template is a single-page, scroll-aware premium shell; section anchors and field placeholders are structural.\n\n## Field map\n\n${map}\n\n## Deterministic formulas\n\n- C1: use set_form_meta for form metadata.\n- C2: use set_field_property for labels, placeholders, validation, and options.\n- C3: use set_html_text with an exact string from shellTexts.\n- C4: preserve all chip display metadata when editing choices.\n- C5: add a schema field and exactly one matching {{field:KEY}} token.\n- C6: remove both the schema field and its matching token.\n- C7: preserve section ids and matching sticky navigation hrefs.\n- C8: policy is locked; do not add page-color inheritance.\n\n## Hard invariants\n\n- customCss SHA-256: ${frontmatter.customCssSha256}\n- customHtml SHA-256: ${frontmatter.shellSha256}\n- theme: system\n- zero orphan and zero missing field placeholders\n- customScripts stays empty\n`;
}

const templates = [realestate(), botanical(), kawaii(), cv()];
for (const template of templates) {
  for (const dir of templateDirs) writeJson(path.join(dir, `${template.slug}.json`), template);
  for (const dir of guideDirs) write(path.join(dir, `${template.slug}.guide.md`), guide(template));
  process.stdout.write(`[template-authoring] ${template.slug}: ${template.fields.length} fields\n`);
}
