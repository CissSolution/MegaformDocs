#!/usr/bin/env node
/**
 * [ExactConversions v20260808] Conversions that reproduce their mock's OWN layout.
 *
 * The first pass put every mock through one shared "EuroYouth skin" — hero band, tagline strip,
 * promo box, single centred card — and tuned colours afterwards. Measured against the mocks that
 * bought almost nothing: most of these designs are not a centred card at all. They are two-column
 * pages with a photographic panel or a sidebar, and several of them had copy invented for them
 * that the mock never contained. A letter-spacing fix cannot close that gap.
 *
 * So each template here declares its own fields, its own markup and its own CSS, and every value
 * is transcribed from the mock's source at
 *   E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\app\forms\<slug>\page.tsx
 * Tailwind classes are translated to the px they actually mean (text-xs = 12px/16px,
 * tracking-widest = .1em, py-3.5 = 14px, gap-6 = 24px, rounded-3xl = 24px …). Nothing is rounded
 * "to taste" and nothing is invented.
 *
 * Images are the mock's real files, copied into Assets/img/<slug>/ and served from the module.
 * They are painted as a two-layer background so ONE authored URL works on both mounts:
 *   DNN      /DesktopModules/MegaForm/Assets/img/
 *   Oqtane   /Modules/MegaForm/img/
 * The first layer wins where it exists; where it 404s the browser simply paints the second.
 *
 * Run:  node tools/templates/build-exact-conversions.mjs [--only slug] [--check]
 */

import {
  field, choiceField, buildTemplate, validate, OUT_DIR, writeTemplates, TEXTURES,
} from './build-euroyouth-skins.mjs';
import {
  wizardPagesScript, itemsFields, invoiceTotalsScript, recapScript,
} from './build-wizard-conversions.mjs';
import { ICX } from './spec-icx.mjs';
import { FES } from './spec-festa.mjs';
import { DRC } from './spec-document-registration.mjs';

// The helpers now live in a leaf module so a spec file can import them without creating an
// import cycle with this one; re-exported here because 14 specs and several tools import
// them from this path.
export {
  asset, svgUrl, wrapperReset, controlReset, underlineControls, boxedControls,
  lucideArrowLeft, lucideCheck,
} from './exact-helpers.mjs';
import {
  asset, svgUrl, wrapperReset, controlReset, underlineControls, boxedControls,
  lucideArrowLeft, lucideCheck,
} from './exact-helpers.mjs';

const INTER = `'Inter',system-ui,-apple-system,'Segoe UI',sans-serif`;
const PLAYFAIR = `'Playfair Display',Georgia,'Times New Roman',serif`;
const FONT_IMPORT =
  `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700`
  + `&family=Playfair+Display:wght@600;700;800&display=swap');`;

// ─────────────────────────────────────────────────────────────────────────────
// rose-registration — mock: app/forms/rose-registration/page.tsx
//
// Layout, verbatim from the source:
//   main            min-h-screen, background #FFF8F5
//   grid            mx-auto max-w-6xl (1152px) lg:grid-cols-[420px_1fr]
//   aside 420px     background #1C1C1E, hidden below lg, two rotated rose accents
//     photo         h-[52%], /images/rose-wellness-hero.png, object-cover object-top
//                   + tint linear-gradient(to bottom,#C2185B22 0%,#1C1C1Eee 100%)
//                   + brand badge top-6 left-6 (36px rose tile + "EuroYouth 2026")
//     panel         p-8, flex column justify-between: headline, stats row, team list
//   section         px-14 py-12, background #FFF8F5 — back link, header, white form card
//     card          rounded-3xl bg white p-8 border 1px #F0D9E2
//     inputs        border-0 border-b-2, px-0 py-2.5, 15px  (underline, NOT boxed)
//     programme     pill chips, 13px/500, #FCE4EC on #F0D9E2 border
//     motivation    rounded-xl border-2, px-4 py-3, 14px
//     progress      "N of 7 fields complete" + percentage + 6px bar
//     submit        full width, rounded-full, py-3.5, gradient 135deg #C2185B→#880E4F
// ─────────────────────────────────────────────────────────────────────────────
const ROSE = {
  slug: 'rose-wellness-registration',
  title: 'EuroYouth 2026 — Registration',
  description:
    'Two-column EuroYouth registration: a dark rose panel carrying the programme photograph, '
    + 'headline, member statistics and the team, beside a cream column whose white card holds seven '
    + 'underlined fields, programme pills and a live completion meter. Converted from the '
    + 'rose-registration mock, structure and values transcribed from its source.',
  category: 'registration',
  categories: ['registration', 'premium', 'education'],
  icon: 'user-plus',
  prefix: 'rws',
  outerBorder: { sel: '.rws-grid' },
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  submitLabel: 'Submit Application',
  successTitle: 'You\u2019re registered!',
  successMessage: 'Registration received. A confirmation is on its way.',
  successBody:
    'Thank you, {{field:first_name}}. We\u2019ll send confirmation to {{field:email}} within 48 hours.',
  palette: {
    primary: '#C2185B', accent: '#880E4F', surface: '#FFFFFF', text: '#1C1C1E',
    muted: '#6B6B6E', border: '#F0D9E2', onPrimary: '#FFFFFF', deco: '#F48FB1', page: '#FFF8F5',
  },

  exactFields: [
    field('first_name', 'Text', 'First name', { required: true, placeholder: 'Elena' }),
    field('last_name', 'Text', 'Last name', { required: true, placeholder: 'M\u00fcller' }),
    field('email', 'Email', 'Email address', { required: true, placeholder: 'elena@example.com' }),
    field('phone', 'Phone', 'Phone', { required: true, placeholder: '+49 123 456 789' }),
    choiceField('country', 'Select', 'Country', [
      'Germany', 'France', 'Spain', 'Italy', 'Portugal',
      'Netherlands', 'Austria', 'Belgium', 'Greece', 'Poland',
      'Sweden', 'Ireland', 'United Kingdom', 'Other',
    ], 'dropdown', null, { required: true, placeholder: 'Select\u2026' }),
    choiceField('programme', 'Radio', 'Programme', [
      'Erasmus Exchange', 'Language Immersion', 'Solidarity Corps',
      'Youth Leadership', 'Creative Arts',
    ], 'chips', null, { required: true }),
    field('motivation', 'Textarea', 'Why do you want to join?', {
      required: true, placeholder: 'Tell us a little about your motivation\u2026',
    }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const stat = (v, l) => `<div class='${p}-stat'><div class='${p}-stat-v'>${v}</div>`
      + `<div class='${p}-stat-l'>${l}</div></div>`;
    const member = (ini, name, role) => `<div class='${p}-member'>`
      + `<span class='${p}-avatar'>${ini}</span>`
      + `<span class='${p}-member-text'><span class='${p}-member-name'>${name}</span>`
      + `<span class='${p}-member-role'>${role}</span></span></div>`;
    const fld = (label, icon, key, extra = '') => `<label class='${p}-field${extra}'>`
      + `<span class='${p}-label'><i class='fa ${icon}'></i>${label}</span>{{field:${key}}}</label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-grid'>`

      // ── left panel ────────────────────────────────────────────────────────
      + `<aside class='${p}-aside'>`
      + `<div class='${p}-accent-a' role='presentation'></div>`
      + `<div class='${p}-accent-b' role='presentation'></div>`
      + `<div class='${p}-photo'>`
      + `<img class='${p}-content-image' src='{{content:hero_image}}' alt='' aria-hidden='true'>`
      + `<div class='${p}-photo-tint' role='presentation'></div>`
      + `<div class='${p}-brand'><span class='${p}-brand-mark'><i class='fa fa-globe'></i></span>`
      + `<span class='${p}-brand-text'>EuroYouth 2026</span></div>`
      + `</div>`
      + `<div class='${p}-panel'>`
      + `<div class='${p}-panel-top'>`
      + `<span class='${p}-pill'></span>`
      + `<h2 class='${p}-aside-title'>Shape your<br><em>future</em> in Europe.</h2>`
      + `<p class='${p}-aside-lede'>Join a community of young leaders, explorers and changemakers `
      + `across 40+ countries. One application opens every door.</p>`
      + `</div>`
      + `<div class='${p}-stats'>${stat('12K+', 'Members')}${stat('98%', 'Satisfaction')}${stat('40+', 'Countries')}</div>`
      + `<div class='${p}-team'><p class='${p}-team-cap'>Our Team</p><div class='${p}-team-list'>`
      + member('AM', 'Aria Morel', 'Programme Director')
      + member('JS', 'Jonas Steyn', 'Community Lead')
      + member('LK', 'Lena Kovacs', 'Youth Coordinator')
      + `</div></div></div></aside>`

      // ── right column ──────────────────────────────────────────────────────
      + `<section class='${p}-main'>`
      + `<div class='${p}-head'>`
      + `<div class='${p}-eyebrow-row'><span class='${p}-pill-sm'></span>`
      + `<span class='${p}-eyebrow'>Registration 2026</span></div>`
      + `<h1 class='${p}-title'>Apply now</h1>`
      // &apos; in the source is U+0027, not a typographic apostrophe - the harness matched the two
      // strings as different copy until this was the plain one the mock actually renders.
      + `<p class='${p}-lede'>Fill in the 7 fields below and we'll match you with the perfect programme.</p>`
      + `</div>`
      + `<div class='${p}-card'>`
      + `<div class='${p}-row2'>${fld('First name', 'fa-user', 'first_name')}${fld('Last name', 'fa-user', 'last_name')}</div>`
      + fld('Email address', 'fa-envelope', 'email', ` ${p}-solo`)
      + `<div class='${p}-row2'>${fld('Phone', 'fa-phone', 'phone')}${fld('Country', 'fa-map-marker', 'country')}</div>`
      + fld('Programme', 'fa-briefcase', 'programme', ` ${p}-solo`)
      + fld('Why do you want to join?', 'fa-calendar', 'motivation', ` ${p}-solo ${p}-solo-last`)
      + `{{script:progress}}`
      + `<div class='${p}-progress'><div class='${p}-progress-row'>`
      + `<span class='${p}-progress-text' data-mf-echo='progress_count'>0 of 7 fields complete</span>`
      + `<span class='${p}-progress-pct' data-mf-echo='progress_pct'>0%</span></div>`
      + `<div class='${p}-bar'><div class='${p}-bar-fill' data-mf-echo='progress_bar'></div></div></div>`
      + `<button class='${p}-submit' type='submit'>Submit Application<i class='fa fa-check'></i></button>`
      + `<p class='${p}-foot'>By submitting you agree to our <span class='${p}-link'>Privacy Policy</span> &amp; Terms.</p>`
      + `</div></section></div></div>`;
  },

  // The mock counts filled fields out of seven and paints a meter. `data-mf-echo` nodes are filled
  // by this script; the bar's width is set directly because it is geometry, not text.
  customScripts: {
    progress: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var KEYS = ['first_name','last_name','email','phone','country','programme','motivation'];
  function filled(key){
    var els = scope.querySelectorAll('[name="' + key + '"]');
    if (!els.length) return false;
    var first = els[0];
    if (first.type === 'checkbox' || first.type === 'radio') {
      for (var i = 0; i < els.length; i++) if (els[i].checked) return true;
      return false;
    }
    return String(first.value || '').trim().length > 0;
  }
  function paint(){
    var n = 0;
    for (var i = 0; i < KEYS.length; i++) if (filled(KEYS[i])) n++;
    var pct = Math.round((n / KEYS.length) * 100);
    var c = scope.querySelector('[data-mf-echo="progress_count"]');
    var t = scope.querySelector('[data-mf-echo="progress_pct"]');
    var b = scope.querySelector('[data-mf-echo="progress_bar"]');
    if (c) c.textContent = n + ' of ' + KEYS.length + ' fields complete';
    if (t) { t.textContent = pct + '%'; t.style.color = (n === KEYS.length) ? '#C2185B' : '#6B6B6E'; }
    if (b) b.style.width = pct + '%';
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  paint();
})();`,
  },

  exactCss: `
${wrapperReset('rws')}
/* page ------------------------------------------------------------------ */
@S@{container-type:inline-size;font-family:${INTER}!important;color:#1C1C1E}
/* min-h-screen on the mock's <main>: the panel is as tall as the window, which is what gives the
   photograph its 52% and leaves the team list room. Without it the aside collapsed to the form's
   height and clipped Lena Kovacs. */
@S@.rws-grid{display:grid;grid-template-columns:1fr;max-width:1152px;margin:0 auto;
  min-height:100vh;background:#FFF8F5}
/* The mock hides the panel below lg (1024px). A CONTAINER query, not a media query: the form is
   embedded in a CMS pane whose width has nothing to do with the viewport's. */
@container (min-width:1024px){@S@.rws-grid{grid-template-columns:420px 1fr}}

/* left panel ------------------------------------------------------------ */
@S@.rws-aside{position:relative;display:none;flex-direction:column;overflow:hidden;
  background:#1C1C1E;min-height:760px}
@container (min-width:1024px){@S@.rws-aside{display:flex}}
@S@.rws-accent-a{position:absolute;top:-64px;right:-64px;width:256px;height:256px;
  transform:rotate(45deg);background:#C2185B;opacity:.18;pointer-events:none}
@S@.rws-accent-b{position:absolute;bottom:-80px;left:-80px;width:288px;height:288px;
  transform:rotate(12deg);background:#880E4F;opacity:.22;pointer-events:none}
@S@.rws-photo{position:relative;height:52%;width:100%;overflow:hidden;
  background-image:${asset('rose-wellness-registration', 'rose-wellness-hero.png')};
  background-size:cover;background-position:50% 0}
@S@img.rws-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 0!important;
  border:0!important;border-radius:0!important;pointer-events:none!important}
@S@.rws-photo-tint{position:absolute;inset:0;
  background:linear-gradient(to bottom,rgba(194,24,91,.13) 0%,rgba(28,28,30,.93) 100%)}
@S@.rws-brand{position:absolute;top:24px;left:24px;display:flex;align-items:center;gap:10px}
@S@.rws-brand-mark{display:flex;align-items:center;justify-content:center;width:36px;height:36px;
  border-radius:12px;background:#C2185B;color:#fff;font-size:20px;line-height:1}
@S@.rws-brand-text{font-size:12px;line-height:16px;font-weight:700;letter-spacing:.15em;
  text-transform:uppercase;color:#fff}
@S@.rws-panel{position:relative;display:flex;flex:1 1 auto;flex-direction:column;
  justify-content:space-between;padding:32px}
@S@.rws-pill{display:inline-block;width:40px;height:4px;border-radius:999px;background:#C2185B;
  margin-bottom:12px}
/* Headings and paragraphs need the element in the selector AND !important: the compat bridge
   qualifies h1/h2/p with an element token, which outranks a class-only rule, and it was silently
   turning the Playfair panel headline back into Inter and every 12px caption into 15px/200. */
@S@h2.rws-aside-title{margin:0!important;font-family:${PLAYFAIR}!important;font-size:30px!important;
  line-height:1.25!important;font-weight:700!important;color:#fff!important}
@S@h2.rws-aside-title em{font-style:normal;color:#F48FB1}
@S@p.rws-aside-lede{margin:12px 0 0!important;font-size:14px!important;line-height:1.625!important;
  font-weight:400!important;color:#A8A8AA!important}
@S@.rws-stats{display:flex;align-items:center;gap:24px;padding:20px 0;
  border-top:1px solid #2E2E30;border-bottom:1px solid #2E2E30}
@S@.rws-stat{flex:1 1 0;text-align:center}
/* text-2xl is 24px/32px, not 24px/1.2 */
@S@.rws-stat-v{font-family:${PLAYFAIR};font-size:24px;line-height:32px;font-weight:700;color:#F48FB1}
@S@.rws-stat-l{margin-top:2px;font-size:11px;line-height:16px;font-weight:400;
  text-transform:uppercase;letter-spacing:.1em;color:#6B6B6E}
@S@p.rws-team-cap{margin:0 0 12px!important;font-size:11px!important;line-height:16px!important;
  text-transform:uppercase!important;letter-spacing:.1em!important;font-weight:600!important;
  color:#6B6B6E!important}
@S@.rws-team-list{display:flex;flex-direction:column;gap:12px}
@S@.rws-member{display:flex;align-items:center;gap:12px}
@S@.rws-avatar{display:flex;align-items:center;justify-content:center;flex:0 0 auto;
  width:40px;height:40px;border-radius:999px;background:#C2185B;color:#fff;font-size:12px;
  line-height:16px;font-weight:700;box-shadow:0 0 0 2px #831843}
@S@.rws-member-text{display:flex;flex-direction:column}
@S@.rws-member-name{font-size:14px;line-height:20px;font-weight:600;color:#fff}
@S@.rws-member-role{font-size:11px;line-height:16px;font-weight:400;color:#6B6B6E}

/* right column ---------------------------------------------------------- */
@S@.rws-main{display:flex;flex-direction:column;justify-content:center;padding:48px 24px;
  background:#FFF8F5}
@container (min-width:640px){@S@.rws-main{padding:48px 40px}}
@container (min-width:1024px){@S@.rws-main{padding:48px 56px}}
@S@.rws-back{display:inline-flex;align-items:center;gap:6px;margin-bottom:32px;font-size:14px;
  line-height:20px;font-weight:500;color:#6B6B6E}
@S@.rws-head{margin-bottom:32px}
@S@.rws-eyebrow-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
@S@.rws-pill-sm{width:32px;height:4px;border-radius:999px;background:#C2185B}
@S@.rws-eyebrow{font-size:11px;line-height:16px;font-weight:700;text-transform:uppercase;
  letter-spacing:.18em;color:#C2185B}
@S@h1.rws-title{margin:0!important;font-family:${PLAYFAIR}!important;font-size:36px!important;
  line-height:1.25!important;font-weight:700!important;color:#1C1C1E!important}
@S@p.rws-lede{margin:8px 0 0!important;font-size:14px!important;line-height:1.625!important;
  font-weight:400!important;color:#6B6B6E!important}

/* form card ------------------------------------------------------------- */
@S@.rws-card{padding:32px;border:1px solid #F0D9E2;border-radius:24px;background:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,.05)}
/* .rws-field FIRST: it zeroes the margin, and at equal specificity the later rule wins - declared
   after .rws-solo it silently ate every 28px gap between the single-column fields. */
@S@.rws-field{display:block;margin:0}
@S@.rws-row2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
@S@.rws-solo{margin-bottom:28px}
@S@.rws-solo-last{margin-bottom:32px}
@S@.rws-label{display:block;margin:0 0 6px;font-size:12px;line-height:16px;font-weight:600;
  text-transform:uppercase;letter-spacing:.1em;color:#6B6B6E}
@S@.rws-label i{margin-right:4px;font-size:12px;line-height:16px}
@S@.mf-field-label{display:none!important}
/* A wizard's page-break Section renders a visible heading the mock has no room for - it exists to
   split the pages, not to be seen. */
@S@.mf-section-break,@S@.mf-section-title{display:none!important}
@S@.mf-field-group{margin:0!important;width:100%}
@S@.mf-form-title,@S@.mf-form-description{display:none!important}
@S@.mf-form-actions{display:none!important}

/* controls: the mock's inputs are an UNDERLINE, not a box -------------- */
@S@.mf-input[class],@S@.mf-select[class]{width:100%!important;box-sizing:border-box!important;
  border:0!important;border-bottom:2px solid #F0D9E2!important;border-radius:0!important;
  background:transparent!important;padding:10px 0!important;min-height:0!important;
  height:auto!important;color:#1C1C1E!important;font-family:inherit!important;
  font-size:15px!important;line-height:24px!important;font-weight:400!important;
  box-shadow:none!important;appearance:none!important;-webkit-appearance:none!important}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-bottom-color:#C2185B!important;
  box-shadow:none!important;outline:none!important}
@S@.mf-input[class]::placeholder,@S@.mf-textarea[class]::placeholder{color:#C8C8CA!important;opacity:1}
/* The mock greys a select until it has a value. It is required, so an empty one is :invalid -
   that is the only hook CSS has for "nothing chosen yet". */
@S@.mf-select[class]:invalid{color:#C8C8CA!important}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;margin-top:4px!important;
  border:2px solid #F0D9E2!important;border-radius:12px!important;background:transparent!important;
  padding:12px 16px!important;min-height:96px!important;height:auto!important;resize:none!important;
  color:#1C1C1E!important;font-family:inherit!important;font-size:14px!important;
  line-height:1.625!important;box-shadow:none!important}
@S@.mf-textarea[class]:focus{border-color:#C2185B!important;box-shadow:none!important}

/* programme pills ------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
@S@.mf-option-item{margin:0!important}
@S@.mf-option-group--chips .mf-option-check{display:none!important}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 16px;
  border:1.5px solid #F0D9E2;border-radius:9999px;background:#FCE4EC;color:#C2185B;
  font-size:13px;line-height:20px;font-weight:500;text-align:center;cursor:pointer;
  transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:13px;line-height:20px;font-weight:500;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#C2185B;border-color:#C2185B;
  color:#fff}

/* completion meter ------------------------------------------------------ */
@S@.rws-progress{margin-bottom:24px}
@S@.rws-progress-row{display:flex;justify-content:space-between;margin-bottom:6px}
@S@.rws-progress-text{font-size:12px;line-height:16px;font-weight:500;color:#6B6B6E}
@S@.rws-progress-pct{font-size:12px;line-height:16px;font-weight:700;color:#6B6B6E}
@S@.rws-bar{width:100%;height:6px;border-radius:999px;overflow:hidden;background:#FCE4EC}
@S@.rws-bar-fill{width:0;height:100%;border-radius:999px;background:#C2185B;
  transition:width .5s ease}

/* submit + footnote ----------------------------------------------------- */
@S@button.rws-submit[type="submit"]{display:flex;align-items:center;justify-content:center;gap:8px;
  width:100%!important;padding:14px 0!important;border:0!important;border-radius:9999px!important;
  background:linear-gradient(135deg,#C2185B 0%,#880E4F 100%)!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:700!important;letter-spacing:normal!important;text-transform:none!important;
  cursor:pointer!important;box-shadow:none!important}
@S@button.rws-submit[type="submit"]:hover{opacity:.9}
/* The mock's CTA has no disabled state - it validates on click and stays full colour. Fading it
   while blocked was our addition, and it is visible in the diff. */
@S@button.rws-submit.mf-nav-blocked,@S@button.rws-submit[disabled]{opacity:1;
  background:linear-gradient(135deg,#C2185B 0%,#880E4F 100%)!important;
  cursor:not-allowed!important;filter:none!important}
@S@p.rws-foot{margin:16px 0 0!important;text-align:center!important;font-size:12px!important;
  line-height:16px!important;font-weight:400!important;color:#6B6B6E!important}
@S@.rws-link{text-decoration:underline;color:#C2185B;cursor:pointer;font-size:12px;
  line-height:16px;font-weight:400}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// xmas-newsletter — mock: app/forms/xmas-newsletter/page.tsx
//
// It is an EMAIL MOCKUP, not a form card: a 768px column holding two stacked panels — client
// chrome (maroon tab bar + sender row) above a white email body (hero → gold band → 32px body →
// footer band) — with a back link on the page below. The previous conversion started at the hero
// and invented "Season of Giving" in an italic serif; the mock has no serif anywhere and says
// "MERRY CHRISTMAS" on a maroon badge plate over a Santa illustration.
// ─────────────────────────────────────────────────────────────────────────────
const XNL_SLUG = 'xmas-newsletter-euroyouth-application';

const XNL = {
  slug: XNL_SLUG,
  title: 'EuroYouth Christmas — 2026 Applications',
  description:
    'Christmas email mockup: client chrome and sender row above a white email body whose crimson '
    + 'hero carries the Santa illustration and a MERRY CHRISTMAS badge, followed by a gold urgency '
    + 'band, programme cards, two underlined field grids, interest chips, consent rows, a pill CTA, '
    + 'a three-tile programme strip and an email footer. Transcribed from the xmas-newsletter mock.',
  category: 'application',
  categories: ['application', 'premium', 'seasonal'],
  icon: 'mail',
  prefix: 'xnl',
  outerBorder: { sel: '.xnl-card', radius: 12 },
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  submitLabel: 'Submit Application',
  successTitle: 'Ho ho ho!',
  successMessage: 'Application received. Check your inbox within 5 working days.',
  successBody:
    '{{field:first_name}}, your application is wrapped and on its way. Check {{field:email}} in 5 working days.',
  palette: {
    primary: '#C41E3A', accent: '#9B0E25', surface: '#FFFFFF', text: '#2D1F1F',
    muted: '#7A5C5C', border: '#E8D5D0', onPrimary: '#FFFFFF', deco: '#D4A017', page: '#F5EDE8',
  },

  exactFields: [
    choiceField('programme', 'Radio', 'Programme', [
      { label: 'Erasmus Exchange', value: 'erasmus', description: 'Berlin · Paris · Madrid', icon: '🎓' },
      { label: 'Language Immersion', value: 'language', description: 'Florence · Lisbon · Vienna', icon: '💬' },
      { label: 'Solidarity Corps', value: 'solidarity', description: 'Amsterdam · Prague · Athens', icon: '🌍' },
    ], 'cards', 2, { required: true }),
    field('first_name', 'Text', 'First name *', { required: true, placeholder: 'Anna' }),
    field('last_name', 'Text', 'Last name *', { required: true, placeholder: 'Müller' }),
    field('email', 'Email', 'Email *', { required: true, placeholder: 'anna@email.eu' }),
    field('phone', 'Text', 'Phone', { placeholder: '+49 170 1234567' }),
    field('birth_year', 'Text', 'Year of birth', { placeholder: '2004' }),
    choiceField('country', 'Select', 'Country *', [
      'Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria',
      'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other',
    ], 'dropdown', null, { required: true, placeholder: 'Select country' }),
    choiceField('start_month', 'Select', 'Start month *', [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ], 'dropdown', null, { required: true, placeholder: 'Select month' }),
    // A text input in the mock, not a select — its state default is the string '3'.
    field('duration', 'Text', 'Duration (months)', { placeholder: '3' }),
    choiceField('language_level', 'Select', 'Language level',
      ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], 'dropdown', null, { placeholder: 'Select level' }),
    choiceField('accommodation', 'Select', 'Accommodation',
      ['Host family', 'Student dorm', 'Private flat', 'Not needed'], 'dropdown', null,
      { placeholder: 'Select type' }),
    choiceField('interests', 'Checkbox', 'Interests', [
      'Art & Design', 'Technology', 'Sustainability', 'Music',
      'Sports', 'Cuisine', 'History', 'Entrepreneurship',
    ], 'chips'),
    field('motivation', 'Textarea', 'Motivation', {
      placeholder: 'Tell us why you want to join EuroYouth this year...',
    }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [
      { label: 'Send me the EuroYouth newsletter with programme updates', value: 'yes' },
    ], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [
      { label: 'I agree to the terms and conditions *', value: 'yes' },
    ], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const sec = (icon, text) => `<div class='${p}-sec'><span class='${p}-sec-ico'>`
      + `<i class='fa ${icon}'></i></span><span class='${p}-sec-t'>${text}</span></div>`;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const tile = (cls, emoji, label, sub) => `<div class='${p}-tile ${cls}'>`
      + `<div class='${p}-tile-e'>${emoji}</div><div class='${p}-tile-l'>${label}</div>`
      + `<div class='${p}-tile-s'>${sub}</div></div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'>`

      // client chrome
      + `<div class='${p}-wrap ${p}-wrap-top'><div class='${p}-chrome'>`
      + `<div class='${p}-tabbar'>`
      + `<span class='${p}-dot ${p}-dot-r'></span><span class='${p}-dot ${p}-dot-y'></span>`
      + `<span class='${p}-dot ${p}-dot-g'></span>`
      + `<span class='${p}-url'>euroyouth.eu / apply</span></div>`
      + `<div class='${p}-sender'><span class='${p}-avatar'>EY</span>`
      + `<span class='${p}-sender-text'>`
      + `<span class='${p}-sender-name'>EuroYouth Exchange &lt;no-reply@euroyouth.eu&gt;</span>`
      + `<span class='${p}-sender-to'>To: applicant@email.eu · <span data-mf-echo='mail_date'>7 Aug 2026</span></span>`
      + `</span></div></div></div>`

      // email body
      + `<div class='${p}-wrap ${p}-wrap-body'><div class='${p}-card'>`
      + `<div class='${p}-hero'><div class='${p}-hero-tex' role='presentation'></div>`
      + `<div class='${p}-hero-art' role='presentation'>`
      + `<img class='${p}-content-image' src='{{content:hero_image}}' alt='' aria-hidden='true'></div>`
      + `<div class='${p}-badge-wrap'><div class='${p}-badge'>`
      + `<div class='${p}-badge-eyebrow'>EuroYouth</div>`
      + `<div class='${p}-badge-head'>MERRY CHRISTMAS</div>`
      + `<div class='${p}-badge-sub'>2026 Applications Open</div>`
      + `</div></div></div>`
      + `<div class='${p}-gold'><i class='fa fa-star'></i>`
      + `<span class='${p}-gold-t'>Limited spots available — apply before 31 December</span>`
      + `<i class='fa fa-star'></i></div>`
      + `<div class='${p}-body'>`
      + `<p class='${p}-intro'>Dear future explorer, this holiday season we are opening a special `
      + `round of applications for our 2026 European exchange programmes. Fill in your details below `
      + `to reserve your spot and receive your welcome package.</p>`
      + `<div class='${p}-programme'>{{field:programme}}</div>`
      + `<hr class='${p}-hr'>`
      + sec('fa-users', 'Personal Information')
      + `<div class='${p}-grid2'>`
      + fld('First name *', 'first_name') + fld('Last name *', 'last_name')
      + fld('Email *', 'email') + fld('Phone', 'phone')
      + fld('Year of birth', 'birth_year') + fld('Country *', 'country')
      + `</div>`
      + sec('fa-globe', 'Programme Details')
      + `<div class='${p}-grid2'>`
      + fld('Start month *', 'start_month') + fld('Duration (months)', 'duration')
      + fld('Language level', 'language_level') + fld('Accommodation', 'accommodation')
      + `</div>`
      + sec('fa-magic', 'Your Interests')
      + `<div class='${p}-chips'>{{field:interests}}</div>`
      + sec('fa-envelope', 'Motivation')
      + `<div class='${p}-ta'>{{field:motivation}}</div>`
      + `<hr class='${p}-hr2'>`
      + `<div class='${p}-consent'>{{field:newsletter}}{{field:terms}}</div>`
      + `<button class='${p}-submit' type='submit'>Submit Application</button>`
      + `<div class='${p}-tiles'>`
      + tile(`${p}-tile-a`, '🏛️', 'Erasmus Exchange', 'Berlin · Paris · Madrid')
      + tile(`${p}-tile-b`, '🗣️', 'Language Immersion', 'Florence · Lisbon')
      + tile(`${p}-tile-c`, '🌿', 'Solidarity Corps', 'Amsterdam · Athens')
      + `</div>`
      + `</div>`
      + `<div class='${p}-footer'>`
      + `<div class='${p}-footer-a'>EuroYouth Exchange · Erasmus+ Partner · euroyouth.eu</div>`
      + `<div class='${p}-footer-b'>You received this because you requested programme information.</div>`
      + `</div></div>`
      + `{{script:mail_date}}`
      + `</div></div></div>`;
  },

  // The mock stamps the mail with today's date via toLocaleDateString('en-GB'); a static string
  // would be wrong the day after it shipped.
  customScripts: {
    mail_date: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var el = scope.querySelector('[data-mf-echo="mail_date"]');
  if (el) el.textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
})();`,
  },

  exactCss: `
${wrapperReset('xnl')}
@S@{font-family:${INTER}!important;color:#2D1F1F}
/* NAMING TRAP, measured not guessed: megaform.css ships
     .mf-form-wrapper [class*="col-"]{padding-left:0!important;padding-right:0!important}
   to neutralise Bootstrap grids, and
     .mfp[class*="mfp-"] [class*="title"]{color:var(--mf-title-color)!important}
   in the compat bridge. A class named "xnl-col-top" or "xnl-badge-title" is matched by those
   substring selectors and loses its padding / colour to an !important nobody wrote for it.
   Hence -wrap and -badge-head. Never put "col-" or "title" in an authored class name. */
@S@.xnl-page{background:#F5EDE8;padding:0 0 40px}
@S@.xnl-wrap{max-width:768px;margin:0 auto;padding:0 16px}
@S@.xnl-wrap-top{padding-top:24px;padding-bottom:8px}

/* email client chrome ---------------------------------------------------- */
@S@.xnl-chrome{border-radius:12px 12px 0 0;overflow:hidden;
  box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -2px rgba(0,0,0,.1)}
@S@.xnl-tabbar{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#3C2020}
@S@.xnl-dot{width:12px;height:12px;border-radius:999px;flex:0 0 auto}
@S@.xnl-dot-r{background:#F87171}
@S@.xnl-dot-y{background:#FACC15}
@S@.xnl-dot-g{background:#4ADE80}
@S@.xnl-url{flex:1 1 auto;margin-left:12px;border-radius:4px;background:rgba(255,255,255,.1);
  padding:4px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:11px;line-height:16px;font-weight:400;color:rgba(255,255,255,.6)}
@S@.xnl-sender{display:flex;align-items:center;gap:12px;padding:12px 20px;background:#FFFFFF;
  border-bottom:1px solid #E8D5D0}
@S@.xnl-avatar{display:flex;align-items:center;justify-content:center;flex:0 0 auto;
  width:32px;height:32px;border-radius:999px;background:#C41E3A;color:#fff;font-size:12px;
  line-height:16px;font-weight:700}
@S@.xnl-sender-text{display:flex;flex-direction:column}
@S@.xnl-sender-name{font-size:12px;line-height:16px;font-weight:600;color:#2D1F1F}
@S@.xnl-sender-to{font-size:11px;line-height:16px;font-weight:400;color:#7A5C5C}

/* email body card -------------------------------------------------------- */
@S@.xnl-card{border-radius:0 0 12px 12px;overflow:hidden;background:#FFFFFF;
  box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -2px rgba(0,0,0,.1)}
@S@.xnl-hero{position:relative;overflow:hidden;min-height:220px;
  background:linear-gradient(135deg,#C41E3A 0%,#9B0E25 100%)}
@S@.xnl-hero-tex{position:absolute;inset:0;background-image:${TEXTURES.snow('white')};
  background-size:cover;background-repeat:no-repeat;pointer-events:none}
@S@.xnl-hero-art{position:relative;height:128px;margin:32px auto 16px;
  background-image:${asset(XNL_SLUG, 'xmas-newsletter-hero.png')};
  background-size:contain;background-repeat:no-repeat;background-position:50% 50%;
  filter:drop-shadow(0 10px 8px rgba(0,0,0,.04)) drop-shadow(0 4px 3px rgba(0,0,0,.1))}
@S@img.xnl-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:contain!important;object-position:50% 50%!important;
  border:0!important;border-radius:0!important;pointer-events:none!important}
@S@.xnl-badge-wrap{position:relative;display:flex;justify-content:center;padding-bottom:24px}
@S@.xnl-badge{border-radius:16px;padding:12px 32px;text-align:center;background:#5C0A1A;
  box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}
@S@.xnl-badge-eyebrow{margin-bottom:2px;font-size:11px;line-height:17px;font-weight:700;
  letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.6)}
@S@.xnl-badge-head{font-size:24px;line-height:24px;font-weight:800;letter-spacing:-.025em;
  color:#fff}
@S@.xnl-badge-sub{margin-top:4px;font-size:11px;line-height:17px;font-weight:500;
  letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7)}

/* gold urgency band ------------------------------------------------------ */
@S@.xnl-gold{display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 24px;
  text-align:center;background:#FFF3CC}
@S@.xnl-gold i{font-size:14px;line-height:14px;color:#D4A017}
@S@.xnl-gold-t{font-size:12px;line-height:16px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:#D4A017}

/* body ------------------------------------------------------------------- */
@S@.xnl-body{padding:32px}
@S@p.xnl-intro{margin:0 0 16px!important;font-size:14px!important;line-height:1.625!important;
  font-weight:400!important;color:#7A5C5C!important}
@S@.xnl-hr{margin:0 0 32px;border:0;border-top:1px solid #E8D5D0}
@S@.xnl-hr2{margin:0 0 24px;border:0;border-top:1px solid #E8D5D0}
@S@.xnl-programme{margin-bottom:32px}
@S@.xnl-sec{display:flex;align-items:center;gap:12px;padding-bottom:8px;margin-bottom:20px;
  border-bottom:2px solid #F5D5DB}
@S@.xnl-sec-ico{display:flex;align-items:center;justify-content:center;flex:0 0 auto;
  width:28px;height:28px;border-radius:6px;background:#C41E3A;color:#fff;font-size:14px;
  line-height:14px}
@S@.xnl-sec-t{font-size:13px;line-height:20px;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:#C41E3A}
@S@.xnl-grid2{display:grid;grid-template-columns:1fr 1fr;column-gap:24px;row-gap:20px;
  margin-bottom:32px}
@S@.xnl-field{display:flex;flex-direction:column;gap:4px;margin:0}
@S@.xnl-label{display:block;margin:0;font-size:11px;line-height:17px;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:#7A5C5C}
@S@.mf-field-label{display:none!important}
/* A wizard's page-break Section renders a visible heading the mock has no room for - it exists to
   split the pages, not to be seen. */
@S@.mf-section-break,@S@.mf-section-title{display:none!important}
@S@.mf-field-group{margin:0!important;width:100%}
@S@.mf-form-title,@S@.mf-form-description,@S@.mf-form-actions{display:none!important}

/* underline controls ----------------------------------------------------- */
@S@.mf-input[class],@S@.mf-select[class]{width:100%!important;box-sizing:border-box!important;
  border:0!important;border-bottom:2px solid #E8D5D0!important;border-radius:0!important;
  background:transparent!important;padding:10px 0!important;min-height:0!important;
  height:auto!important;color:#2D1F1F!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;font-weight:400!important;
  box-shadow:none!important;appearance:none!important;-webkit-appearance:none!important}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-bottom-color:#C41E3A!important;
  box-shadow:none!important;outline:none!important}
@S@.mf-input[class]::placeholder,@S@.mf-textarea[class]::placeholder{color:#B09090!important;opacity:1}
/* :invalid only fires on a REQUIRED select; :has() covers the optional ones too. */
@S@.mf-select[class]:invalid,
@S@.mf-select[class]:has(option[value=""]:checked){color:#B09090!important}
@S@.xnl-ta{margin-bottom:32px}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #E8D5D0!important;border-radius:12px!important;background:#FFF9F5!important;
  padding:12px!important;min-height:106px!important;height:106px!important;resize:none!important;
  color:#2D1F1F!important;font-family:inherit!important;font-size:14px!important;
  line-height:20px!important;box-shadow:none!important}
@S@.mf-textarea[class]:focus{border-color:#C41E3A!important;box-shadow:none!important}

/* programme cards: two columns, 12px gap -------------------------------- */
@S@.mf-option-group--cards{display:grid!important;grid-template-columns:1fr 1fr!important;
  gap:12px!important}
@S@.mf-option-item{margin:0!important}
@S@.mf-option-group--cards .mf-option-item{display:flex}
@S@.mf-option-group--cards .mf-option-check{display:none!important}
/* align-items:stretch, not flex-start: with flex-start the copy column shrank to its longest word
   and the location line measured 120px against the mock's 302px. */
@S@.mf-option-group--cards .mf-option-ui{display:flex;flex-direction:column;align-items:stretch;
  gap:0;width:100%;box-sizing:border-box;padding:12px;border:2px solid #E8D5D0;border-radius:12px;
  background:#FFF9F5;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--cards .mf-option-copy{display:block;width:100%}
/* megaform paints .mf-option-icon as a rounded 36px chip; in the mock it is a plain 18px/28
   emoji line running the full width of the card above the label. */
@S@.mf-option-group--cards .mf-option-icon{display:block!important;width:100%!important;
  height:auto!important;margin:0 0 4px!important;padding:0!important;background:transparent!important;
  border:0!important;border-radius:0!important;text-align:left!important;font-size:18px!important;
  line-height:28px!important;min-height:0!important;height:28px!important;
  flex:0 0 28px!important;
  font-weight:400!important;
  color:rgb(8,12,15)!important}
@S@.mf-option-group--cards .mf-option-label{font-size:13px;line-height:1.25;font-weight:700;
  color:#2D1F1F}
@S@.mf-option-group--cards .mf-option-desc{display:block;width:100%;margin-top:2px;
  font-size:11px;line-height:17px;font-weight:400;color:#7A5C5C}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--cards input:checked+.mf-option-ui{border-color:#C41E3A;background:#F5D5DB}

/* interest chips --------------------------------------------------------- */
@S@.xnl-chips{margin-bottom:32px}
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
/* Inter's browser build is 1-2px wider than the mock font on the middle labels. Keep flex sizing
   intact and align the visible labels without changing wrap points. */
@S@.xnl-chips .mf-option-item:nth-child(n+3):nth-child(-n+7){position:relative;left:-4px}
@S@.mf-option-group--chips .mf-option-check{display:none!important}
/* min-height:0 is load-bearing: megaform gives .mf-option-ui a 36px floor, and the mock's chip
   is 30px (6+6 padding, 16px line, 1px border each side). */
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 12px;
  min-height:0!important;height:auto!important;
  border:1px solid #E8D5D0;border-radius:9999px;background:transparent;color:#7A5C5C;
  font-size:12px;line-height:16px;font-weight:600;text-align:center;cursor:pointer;
  transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;font-weight:600;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#C41E3A;border-color:#C41E3A;
  color:#fff}

/* consent ---------------------------------------------------------------- */
@S@.xnl-consent{display:flex;flex-direction:column;gap:12px;margin-bottom:32px}
@S@.xnl-consent .mf-option-group--list{display:flex;flex-direction:column;gap:12px}
@S@.xnl-consent .mf-option-ui{display:flex;align-items:flex-start;gap:12px;padding:0;border:0;
  background:transparent}
@S@.xnl-consent .mf-option-label{font-size:14px;line-height:23px;font-weight:400;color:#7A5C5C}

/* CTA, tiles, footer, back link ----------------------------------------- */
@S@button.xnl-submit[type="submit"]{display:block;width:100%!important;padding:16px 0!important;
  border:0!important;border-radius:9999px!important;
  background:linear-gradient(135deg,#C41E3A 0%,#9B0E25 100%)!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:800!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  cursor:pointer!important;
  box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)!important}
@S@button.xnl-submit.mf-nav-blocked,@S@button.xnl-submit[disabled]{opacity:1;
  background:#E8D5D0!important;cursor:not-allowed!important;filter:none!important}
@S@.xnl-tiles{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:40px}
@S@.xnl-tile{border-radius:12px;padding:16px;text-align:center}
@S@.xnl-tile-a{background:#FFF3CC}
@S@.xnl-tile-b{background:#FFE4E8}
@S@.xnl-tile-c{background:#E8F4FF}
@S@.xnl-tile-e{margin-bottom:8px;font-size:30px;line-height:36px;font-weight:400;
  color:rgb(8,12,15)}
@S@.xnl-tile-l{font-size:12px;line-height:1.25;font-weight:700;color:#2D1F1F}
@S@.xnl-tile-s{margin-top:2px;font-size:10px;line-height:15px;font-weight:400;color:#7A5C5C}
@container (max-width:520px){
  @S@.xnl-tiles{grid-template-columns:1fr}
}
@S@.xnl-footer{padding:20px 32px;text-align:center;border-top:1px solid #E8D5D0;background:#F5EDE8}
@S@.xnl-footer-a{font-size:11px;line-height:17px;font-weight:400;color:#7A5C5C}
@S@.xnl-footer-b{margin-top:2px;font-size:11px;line-height:17px;font-weight:400;color:#7A5C5C}
@S@.xnl-back{margin-top:16px;text-align:center}
@S@.xnl-back-link{display:inline-flex;align-items:center;gap:8px;font-size:14px;line-height:20px;
  font-weight:500;color:#7A5C5C}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// hotel-suite — mock: app/forms/hotel-suite/page.tsx
//
//   main            min-h-screen, background #FFFBF2, DM Sans body / Cormorant Garamond display
//   hero            FULL-BLEED, height 320px: photo + left-to-right scrim, copy inset px-8/sm:px-16,
//                   three stat pills pinned bottom-5 right-5
//   column          mx-auto max-w-4xl px-4 py-10 sm:px-8  — a bare column, NOT a card
//     GoldSection   6x20 gold pill + 20px serif h2, 12px bottom padding, 1px bottom rule
//     tiers         THREE cards ACROSS (sm:grid-cols-3, gap-4), each: 40px icon tile, name, price,
//                   period, a popularity bar, and a four-item perk list
//     details       2-col grid, gap-x-6 gap-y-5, boxed rounded-xl inputs on white
//     experiences   pill chips, white filled
//     motivation    label + 4-row textarea
//     terms         white rounded-2xl bordered box holding the two consent rows
//     cta           rounded-2xl, py-4, gradient 135deg #8B5E0A → #D4A520
// ─────────────────────────────────────────────────────────────────────────────
const GSU_SLUG = 'gold-suite-membership-application';
const DMSANS = `'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif`;
const CORMORANT = `'Cormorant Garamond',Georgia,'Times New Roman',serif`;

/** The tier card interior. `class` survives SanitizeOptionHtml; `style` does not, so it is CSS. */
const tierDesc = (price, period, pct, delta, perks) =>
  `<span class='gsu-price'>${price}</span>`
  + `<span class='gsu-period'>${period}</span>`
  + `<span class='gsu-pop'><span class='gsu-pop-row'><span class='gsu-pop-l'>Popularity</span>`
  + `<span class='gsu-pop-r'>${pct}% <span class='gsu-pop-d'>${delta}</span></span></span>`
  + `<span class='gsu-bar'><span class='gsu-bar-f gsu-bar-${pct}'></span></span></span>`
  + `<span class='gsu-perks'>`
  + perks.map((k) => `<span class='gsu-perk'>${k}</span>`).join('')
  + `</span>`;

const GSU = {
  slug: GSU_SLUG,
  title: 'Gold Suite — Membership Application',
  description:
    'Full-bleed suite photograph with member statistics over it, then a bare 896px column: three '
    + 'membership tiers side by side with price, popularity meter and perk list, boxed member '
    + 'details, experience pills, a bordered consent box and a bronze-to-gold CTA. Transcribed from '
    + 'the hotel-suite mock.',
  category: 'application',
  categories: ['application', 'premium', 'hospitality'],
  icon: 'crown',
  prefix: 'gsu',
  outerBorder: {},
  fontStack: DMSANS,
  fontImport:
    `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700`
    + `&family=Cormorant+Garamond:wght@400;500;600;700&display=swap');`,
  submitLabel: 'Apply for Membership',
  successTitle: 'Welcome',
  successMessage: 'Membership application received. Our team replies within 24 hours.',
  successBody:
    'Welcome, {{field:first_name}}. Your application has been received. We will reach you at {{field:email}} within 24 hours.',
  palette: {
    primary: '#B8860B', accent: '#D4A520', surface: '#FFFFFF', text: '#1A1A1A',
    muted: '#8C7A5E', border: '#E8D9B0', onPrimary: '#FFFFFF', deco: '#F5E6B8', page: '#FFFBF2',
  },

  exactFields: [
    choiceField('tier', 'Radio', 'Membership tier', [
      { label: 'Gold Membership', value: 'gold', icon: 'fa-star',
        description: tierDesc('$480', 'per year', 82, '+2.5%',
          ['Priority Check-in', 'Daily Breakfast', 'Late Checkout', '2 Spa Visits/Month']) },
      { label: 'Platinum Membership', value: 'platinum', icon: 'fa-crown',
        description: tierDesc('$980', 'per year', 75, '+1.2%',
          ['Dedicated Butler', 'Airport Transfer', 'Unlimited Dining', 'Suite Upgrades']) },
      { label: 'Diamond Membership', value: 'diamond', icon: 'fa-gem',
        description: tierDesc('$2,400', 'per year', 68, '+0.8%',
          ['Private Jet Transfers', 'Personal Chef', 'Island Buyouts', 'Custom Experiences']) },
    ], 'cards', 3, { required: true }),
    field('first_name', 'Text', 'First name *', { required: true, placeholder: 'Eleanor' }),
    field('last_name', 'Text', 'Last name *', { required: true, placeholder: 'Hartley' }),
    field('email', 'Email', 'Email address *', { required: true, placeholder: 'eleanor@email.com' }),
    field('phone', 'Text', 'Phone', { placeholder: '+ 1 212 555 0100' }),
    field('birth_year', 'Text', 'Year of birth', { placeholder: '1990' }),
    choiceField('country', 'Select', 'Country *', [
      'Germany', 'France', 'Spain', 'Italy', 'United Kingdom',
      'United States', 'Japan', 'UAE', 'Switzerland', 'Other',
    ], 'dropdown', null, { required: true, placeholder: 'Select country' }),
    choiceField('guests', 'Select', 'Number of guests',
      ['1 guest', '2 guests', '3 guests', '4 guests', '5 guests', '6 guests'],
      'dropdown', null, { defaultValue: '2 guests' }),
    choiceField('start_month', 'Select', 'Preferred start', [
      'January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026',
      'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026',
    ], 'dropdown', null, { placeholder: 'Select month' }),
    choiceField('programme', 'Select', 'Programme track',
      ['Erasmus Exchange', 'Language Immersion', 'Solidarity Corps'],
      'dropdown', null, { placeholder: 'Select' }),
    choiceField('language_level', 'Select', 'Language level', [
      'A1 — Beginner', 'A2 — Elementary', 'B1 — Intermediate',
      'B2 — Upper-int.', 'C1 — Advanced', 'C2 — Fluent',
    ], 'dropdown', null, { placeholder: 'Select level' }),
    field('occasion', 'Text', 'Special occasion', {
      placeholder: 'Anniversary, honeymoon, milestone celebration...',
    }),
    choiceField('interests', 'Checkbox', 'Preferred Experiences', [
      'Private Dining', 'Wine Cellar', 'Infinity Pool', 'Heli Transfers',
      'Art Gallery', 'Yacht Charter', 'Golf Course', 'Spa & Wellness',
    ], 'chips'),
    field('motivation', 'Textarea', 'Why join Gold Suite? (optional)', {
      placeholder: 'Tell us about your expectations and travel lifestyle...',
    }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [
      { label: 'Send me exclusive member previews and priority offers.', value: 'yes' },
    ], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [
      { label: 'I accept the <span class="gsu-link">membership terms &amp; privacy policy</span>. *', value: 'yes' },
    ], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const sec = (label) => `<div class='${p}-sec'><span class='${p}-sec-pill'></span>`
      + `<h2 class='${p}-sec-h'>${label}</h2></div>`;
    const fld = (label, key, extra = '') => `<label class='${p}-field${extra}'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const pill = (icon, val, sub) => `<div class='${p}-pill'>`
      + `<div class='${p}-pill-top'><i class='fa ${icon}'></i><span class='${p}-pill-v'>${val}</span></div>`
      + `<div class='${p}-pill-s'>${sub}</div></div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'>`
      + `<div class='${p}-hero'>`
      + `<img class='${p}-content-image' src='{{content:hero_image}}' alt='' aria-hidden='true'>`
      + `<div class='${p}-hero-scrim' role='presentation'></div>`
      + `<div class='${p}-hero-copy'>`
      + `<p class='${p}-hero-eyebrow'>Exclusive Membership</p>`
      + `<h1 class='${p}-hero-h'>Gold Suite<br><em>Membership</em></h1>`
      + `<p class='${p}-hero-lede'>Join an elite circle of members with unrivalled access to the `
      + `world's finest hotel experiences.</p></div>`
      + `<div class='${p}-pills'>`
      + pill('fa-star', '92%', '4,218 reviews')
      + pill('fa-line-chart', '47', 'Countries')
      + pill('fa-magic', '$3,200', 'Per year')
      + `</div></div>`

      + `<div class='${p}-main'>`
      + sec('Choose Your Tier')
      + `<div class='${p}-tiers'>{{field:tier}}</div>`
      + `<div class='${p}-block'>` + sec('Member Details')
      + `<div class='${p}-grid2'>`
      + fld('First name *', 'first_name') + fld('Last name *', 'last_name')
      + fld('Email address *', 'email') + fld('Phone', 'phone')
      + fld('Year of birth', 'birth_year') + fld('Country *', 'country')
      + `</div></div>`
      + `<div class='${p}-block'>` + sec('Stay &amp; Preferences')
      + `<div class='${p}-grid2'>`
      + fld('Number of guests', 'guests') + fld('Preferred start', 'start_month')
      + fld('Programme track', 'programme') + fld('Language level', 'language_level')
      + fld('Special occasion', 'occasion', ` ${p}-span2`)
      + `</div></div>`
      + `<div class='${p}-block'>` + sec('Preferred Experiences')
      + `<div class='${p}-chips'>{{field:interests}}</div></div>`
      + `<label class='${p}-field ${p}-mot'><span class='${p}-label'>Why join Gold Suite? (optional)</span>`
      + `{{field:motivation}}</label>`
      + `<div class='${p}-terms'>{{field:newsletter}}{{field:terms}}</div>`
      + `<button class='${p}-submit' type='submit'>Apply for Membership</button>`
      + `<p class='${p}-foot'>Our membership team reviews all applications within 24 hours. `
      + `No commitment required.</p>`
      + `</div></div></div>`;
  },

  exactCss: `
${wrapperReset('gsu')}
@S@{container-type:inline-size;font-family:${DMSANS}!important;color:#1A1A1A}
@S@.gsu-page{background:#FFFBF2}

/* full-bleed hero -------------------------------------------------------- */
@S@.gsu-hero{position:relative;overflow:hidden;height:320px;
  background-image:${asset(GSU_SLUG, 'hotel-suite-hero.png')};
  background-size:cover;background-position:50% 50%}
@S@img.gsu-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 50%!important;
  border:0!important;border-radius:0!important;pointer-events:none!important}
@S@.gsu-hero-scrim{position:absolute;inset:0;
  background:linear-gradient(to right,rgba(26,26,26,.7) 0%,rgba(26,26,26,.1) 60%)}
@S@.gsu-hero-copy{position:absolute;inset:0;display:flex;flex-direction:column;
  justify-content:center;padding:0 32px}
@container (min-width:640px){@S@.gsu-hero-copy{padding:0 64px}}
@S@p.gsu-hero-eyebrow{margin:0 0 8px!important;font-size:12px!important;line-height:16px!important;
  font-weight:700!important;letter-spacing:.25em!important;text-transform:uppercase!important;
  color:#D4A520!important}
@S@h1.gsu-hero-h{margin:0!important;font-family:${CORMORANT}!important;font-size:60px!important;
  line-height:1!important;font-weight:700!important;color:#fff!important}
@S@h1.gsu-hero-h em{font-style:normal;color:#D4A520}
@S@p.gsu-hero-lede{margin:12px 0 0!important;max-width:384px;font-size:14px!important;
  line-height:20px!important;font-weight:400!important;color:rgba(255,255,255,.75)!important}
@S@.gsu-pills{position:absolute;right:20px;bottom:20px;display:flex;gap:12px}
@S@.gsu-pill{border-radius:16px;padding:10px 16px;text-align:center;
  background:rgba(253,240,204,.92)}
@container (max-width:520px){
  @S@.gsu-pills{left:12px;right:12px;gap:6px}
  @S@.gsu-pill{flex:1 1 0;min-width:0;padding:8px 6px}
}
@S@.gsu-pill-top{display:flex;align-items:center;justify-content:center;gap:6px}
@S@.gsu-pill-top i{font-size:14px;line-height:14px;color:#B8860B}
@S@.gsu-pill-v{font-size:16px;line-height:24px;font-weight:700;color:#1A1A1A}
@S@.gsu-pill-s{font-size:10px;line-height:15px;font-weight:500;color:#8C7A5E}

/* content column --------------------------------------------------------- */
@S@.gsu-main{max-width:896px;margin:0 auto;padding:40px 32px}
@S@.gsu-block{margin-top:40px}
@S@.gsu-sec{display:flex;align-items:center;gap:12px;padding-bottom:12px;
  border-bottom:1px solid #E8D9B0}
@S@.gsu-sec-pill{width:6px;height:20px;border-radius:999px;background:#D4A520;flex:0 0 auto}
@S@h2.gsu-sec-h{margin:0!important;font-family:${CORMORANT}!important;font-size:20px!important;
  line-height:28px!important;font-weight:600!important;color:#1A1A1A!important}
@S@.gsu-tiers{margin-top:16px}
@S@.gsu-grid2{display:grid;grid-template-columns:1fr 1fr;column-gap:24px;row-gap:20px;
  margin-top:20px}
@S@.gsu-span2{grid-column:1/-1}
@S@.gsu-field{display:block;margin:0}
@S@.gsu-label{display:block;margin:0 0 6px;font-size:10px;line-height:15px;font-weight:600;
  letter-spacing:.1em;text-transform:uppercase;color:#8C7A5E}
@S@.gsu-chips{margin-top:16px}
@S@.gsu-mot{display:block;margin-top:32px}
@S@.gsu-mot .mf-textarea[class]{margin-top:6px!important}
${controlReset()}
${boxedControls({ border: '#E8D9B0', focus: '#D4A520', text: '#1A1A1A', ph: '#8C7A5E',
  bg: '#FFFFFF', radius: 12, padY: 12, padX: 16, size: 14, line: 20, greyEmpty: false })}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #E8D9B0!important;border-radius:12px!important;background:#fff!important;
  padding:12px 16px!important;min-height:106px!important;height:106px!important;
  resize:none!important;color:#1A1A1A!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;box-shadow:none!important}

/* tier cards ------------------------------------------------------------- */
@S@.mf-option-group--cards{display:grid!important;grid-template-columns:1fr 1fr 1fr!important;
  gap:16px!important}
@S@.mf-option-group--cards .mf-option-ui{display:flex;flex-direction:column;align-items:stretch;
  gap:0;width:100%;box-sizing:border-box;padding:20px;border:2px solid #E8D9B0;
  border-radius:16px;background:#fff;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--cards .mf-option-icon{display:flex!important;align-items:center!important;
  justify-content:center!important;width:40px!important;height:40px!important;flex:0 0 40px!important;
  margin:0 0 12px!important;padding:0!important;border:0!important;border-radius:12px!important;
  background:#F5E6B8!important;color:#B8860B!important;font-size:20px!important;
  line-height:20px!important}
@S@.mf-option-group--cards .mf-option-label{font-size:14px;line-height:20px;font-weight:700;
  color:#1A1A1A}
@S@.mf-option-group--cards .mf-option-desc{display:block;width:100%;margin:0;font-size:12px;
  line-height:16px;font-weight:400;color:#8C7A5E}
@S@.gsu-price{display:block;margin-top:2px;font-size:20px;line-height:28px;font-weight:700;
  color:#B8860B}
@S@.gsu-period{display:block;margin-top:2px;margin-bottom:12px;font-size:12px;line-height:16px;
  color:#8C7A5E}
@S@.gsu-pop{display:block;margin-bottom:12px}
@S@.gsu-pop-row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:10px;
  line-height:15px}
@S@.gsu-pop-l{color:#8C7A5E}
@S@.gsu-pop-r{font-weight:700;color:#8C7A5E}
@S@.gsu-pop-d{font-weight:400}
@S@.gsu-bar{display:block;height:6px;border-radius:999px;overflow:hidden;background:#E8D9B0}
@S@.gsu-bar-f{display:block;height:100%;border-radius:999px;background:#F5E6B8}
@S@.gsu-bar-82{width:82%}
@S@.gsu-bar-75{width:75%}
@S@.gsu-bar-68{width:68%}
@S@.gsu-perks{display:block}
@S@.gsu-perk{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;
  line-height:16px;color:#8C7A5E}
@S@.gsu-perk:last-child{margin-bottom:0}
@S@.gsu-perk::before{content:'\\2713';flex:0 0 auto;font-size:12px;line-height:16px;
  font-weight:700;color:#B8860B}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--cards input:checked+.mf-option-ui{border-color:#D4A520;background:#FEF6E0}
@container (max-width:520px){
  @S@.mf-option-group--cards{grid-template-columns:1fr!important}
}

/* experience pills ------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 16px;
  border:1px solid #E8D9B0;border-radius:9999px;background:#fff;color:#8C7A5E;font-size:14px;
  line-height:20px;font-weight:500;text-align:center;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:14px;line-height:20px;font-weight:500;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#D4A520;border-color:#D4A520;
  color:#1A1A1A}

/* consent box, CTA, footnote -------------------------------------------- */
@S@.gsu-terms{display:flex;flex-direction:column;gap:12px;margin-top:32px;padding:20px;
  border:1px solid #E8D9B0;border-radius:16px;background:#fff}
@S@.gsu-terms .mf-option-group--list{display:flex;flex-direction:column;gap:12px}
@S@.gsu-terms .mf-option-ui{display:flex;align-items:flex-start;gap:12px;padding:0;border:0;
  background:transparent}
@S@.gsu-terms .mf-option-label{font-size:14px;line-height:20px;font-weight:400;color:#8C7A5E}
@S@.gsu-link{text-decoration:underline;font-weight:600;color:#B8860B}
@S@button.gsu-submit[type="submit"]{display:block;width:100%!important;margin-top:24px!important;
  padding:16px 0!important;border:0!important;border-radius:16px!important;
  background:linear-gradient(135deg,#8B5E0A 0%,#D4A520 100%)!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:700!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  cursor:pointer!important;box-shadow:none!important}
@S@button.gsu-submit.mf-nav-blocked,@S@button.gsu-submit[disabled]{opacity:1;
  background:linear-gradient(135deg,#8B5E0A 0%,#D4A520 100%)!important;
  cursor:not-allowed!important;filter:none!important}
@S@p.gsu-foot{margin:16px 0 0!important;text-align:center!important;font-size:12px!important;
  line-height:16px!important;font-weight:400!important;color:#8C7A5E!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// newsletter — mock: app/forms/newsletter/page.tsx (a shadcn Card, measured values from the
// browser because the classes resolve through the ui kit rather than being literal).
//
//   main    min-h-screen, py-16, gradient amber-50 → orange-50 (#FFFBEB → #FFF7ED)
//   column  max-w-md (448px) px-4  → the white Card measures 416x464
//   card    radius 12, 1px #D2D8DD border, shadow-sm, py-6, 24px gap header→content
//   header  centred: 48px yellow→orange tile, 24px/32 weight 600 title, 14px muted description
//   body    px-6, space-y-5; label 14px/500 over control; input 36px, select 40px
//   freq    two REAL checkboxes side by side, 16px apart — not chips
//   cta     full width 36px, radius 6, gradient #EAB308 → #F97316, "Subscribe", sentence case
// ─────────────────────────────────────────────────────────────────────────────
const NLT = {
  slug: 'newsletter-signup-amber',
  title: 'Newsletter Signup',
  description:
    'Amber newsletter card: a 448px column on a warm gradient wash, a white card with a '
    + 'yellow-to-orange mail tile, an email field, a business-type select and two frequency '
    + 'checkboxes side by side above a gradient Subscribe button. Transcribed from the newsletter mock.',
  category: 'marketing',
  categories: ['marketing', 'premium', 'newsletter'],
  icon: 'mail',
  prefix: 'nlt',
  outerBorder: false,   // .nlt-card already draws the mock's own 1px border
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  submitLabel: 'Subscribe',
  successTitle: 'You\'re Subscribed!',
  successMessage: 'Thank you for joining our newsletter.',
  // Verbatim from the mock's success card, which names nobody. Inventing a greeting to satisfy
  // the shared validator is precisely the habit this pass is correcting.
  successBody: 'Thank you for joining our newsletter.',
  successNoInterpolation: true,
  palette: {
    primary: '#EAB308', accent: '#F97316', surface: '#FFFFFF', text: '#080C0F',
    muted: '#5E6468', border: '#D2D8DD', onPrimary: '#FCFCFC', deco: '#F97316', page: '#FFFBEB',
  },

  exactFields: [
    field('email', 'Email', 'Email Address *', { required: true, placeholder: 'you@example.com' }),
    choiceField('business_type', 'Select', 'Business Type',
      ['Startup', 'Small / Medium Business', 'Enterprise', 'Agency'],
      'dropdown', null, { placeholder: 'Select type' }),
    choiceField('frequency', 'Checkbox', 'Frequency Preference', ['Weekly', 'Monthly'], 'list'),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-card'>`
      + `<div class='${p}-head'><div class='${p}-tile'><i class='fa fa-envelope-o'></i></div>`
      + `<div class='${p}-head-h'>Newsletter Signup</div>`
      + `<div class='${p}-head-d'>Get the latest updates delivered to your inbox.</div></div>`
      + `<div class='${p}-body'>`
      + `<label class='${p}-field'><span class='${p}-label'>Email Address *</span>{{field:email}}</label>`
      + `<label class='${p}-field'><span class='${p}-label'>Business Type</span>{{field:business_type}}</label>`
      + `<label class='${p}-field ${p}-freq'><span class='${p}-label'>Frequency Preference</span>`
      + `{{field:frequency}}</label>`
      + `<button class='${p}-submit' type='submit'>Subscribe</button>`
      + `</div></div></div></div></div>`;
  },

  exactCss: `
${wrapperReset('nlt')}
@S@{font-family:${INTER}!important;color:#080C0F}
@S@.nlt-page{padding:64px 0;background:linear-gradient(to bottom right,#FFFBEB 0%,#FFF7ED 100%)}
@S@.nlt-shell{max-width:448px;margin:0 auto;padding:0 16px}
@S@.nlt-back{line-height:0}
/* mb-6 sits on the LINK in the mock, not on a wrapper. */
@S@.nlt-back-link{display:inline-flex;align-items:center;margin-bottom:24px;font-size:14px;
  line-height:20px;font-weight:400;color:#5E6468}
@S@.nlt-back-link i{margin-right:4px;font-size:14px;line-height:16px}
@S@.nlt-card{display:flex;flex-direction:column;gap:24px;padding:24px 0;border:1px solid #D2D8DD;
  border-radius:12px;background:#fff;box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}
/* CardHeader is a grid with gap-2; the description carries no margin of its own. */
@S@.nlt-head{display:grid;gap:8px;padding:0 24px;text-align:center}
@S@.nlt-tile{display:flex;align-items:center;justify-content:center;width:48px;height:48px;
  margin:0 auto 16px;border-radius:8px;color:#fff;font-size:24px;line-height:24px;
  background:linear-gradient(to right,#EAB308 0%,#F97316 100%)}
@S@.nlt-head-h{font-size:24px;line-height:32px;font-weight:600;color:#080C0F}
@S@.nlt-head-d{margin:0;font-size:14px;line-height:20px;font-weight:400;color:#5E6468}
@S@.nlt-body{display:flex;flex-direction:column;gap:20px;padding:0 24px}
@S@.nlt-field{display:block;margin:0}
/* shadcn's Label is flex/items-center/gap-2 - the gap is measurable even with one child. */
@S@.nlt-label{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;
  line-height:14px;font-weight:500;color:#080C0F}
@S@.nlt-freq .nlt-label{margin-bottom:12px}
${controlReset()}
@S@.mf-input[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #D2D8DD!important;border-radius:6px!important;background:transparent!important;
  padding:4px 12px!important;min-height:0!important;height:36px!important;color:#080C0F!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:400!important;box-shadow:0 1px 2px 0 rgba(0,0,0,.05)!important}
@S@.mf-select[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #D2D8DD!important;border-radius:6px!important;
  background:rgb(247,249,250)!important;padding:0 12px!important;min-height:0!important;
  height:40px!important;color:#080C0F!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;font-weight:400!important;
  box-shadow:none!important;appearance:none!important;-webkit-appearance:none!important}
@S@.mf-input[class]::placeholder{color:#5E6468!important;opacity:1}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-color:#D2D8DD!important;
  box-shadow:none!important;outline:none!important}
/* Two real checkboxes on ONE row, 16px apart - the mock has no chips here. */
@S@.nlt-freq .mf-option-group{display:flex!important;flex-direction:row!important;gap:16px!important;
  flex-wrap:nowrap!important}
@S@.nlt-freq .mf-option-item{margin:0!important}
@S@.nlt-freq .mf-option-ui{display:flex;align-items:center;gap:8px;padding:0;border:0;
  background:transparent}
@S@.nlt-freq .mf-option-label{display:flex;align-items:center;gap:8px;font-size:14px;
  line-height:14px;font-weight:400;color:#080C0F}
@S@.nlt-freq input[type="checkbox"]{width:16px!important;height:16px!important;margin:0!important;
  flex:0 0 16px!important;border:1px solid #D2D8DD!important;border-radius:4px!important}
@S@button.nlt-submit[type="submit"]{display:flex;align-items:center;justify-content:center;gap:8px;
  width:100%!important;height:36px!important;padding:8px 16px!important;border:0!important;
  border-radius:6px!important;
  background:linear-gradient(to right,#EAB308 0%,#F97316 100%)!important;color:#FCFCFC!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:500!important;letter-spacing:normal!important;text-transform:none!important;
  cursor:pointer!important;box-shadow:none!important}
/* The mock's button is never gated. */
@S@button.nlt-submit.mf-nav-blocked,@S@button.nlt-submit[disabled]{opacity:1;
  background:linear-gradient(to right,#EAB308 0%,#F97316 100%)!important;filter:none!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// agency-flyer — mock: app/forms/agency-flyer/page.tsx
//
//   main    #F8F9FE
//   hero    FULL-BLEED, min-height 320: photo + 105deg pink overlay + 6px #29B6F6 bottom strip.
//           Its copy box is max-w-5xl WITHOUT mx-auto, so the headline is LEFT-anchored.
//   column  mx-auto max-w-5xl px-6 py-8 md:px-14 — four blocks with the page showing between them
//     1     white "What we offer:" card, a 3-column grid of five service groups
//     2     three programme cards on the bare page, above the form card
//     3     white form card: four CENTRED captions between flexing hairlines (pink / blue /
//           #10B981 / grey), boxed 2px controls, square-ish chips, transparent textarea
//     4     charcoal "Development" strip, then the back link
// ─────────────────────────────────────────────────────────────────────────────
const AGF_SLUG = 'agency-flyer-euroyouth-application';

const AGF = {
  slug: AGF_SLUG,
  title: 'EuroYouth Exchange — Agency Flyer Application',
  description:
    'Agency flyer: a full-bleed photographic hero under a magenta diagonal wash with a stacked '
    + 'italic wordmark, then a services card, three programme cards, a white form card whose four '
    + 'sections are captioned between coloured hairlines, and a charcoal development strip. '
    + 'Transcribed from the agency-flyer mock.',
  category: 'application',
  categories: ['application', 'premium', 'agency'],
  icon: 'zap',
  prefix: 'agf',
  outerBorder: {},
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  submitLabel: 'Submit Application',
  successTitle: 'Application Sent!',
  successMessage: 'Application received. Expect a reply shortly.',
  successBody:
    '{{field:first_name}}, we received your submission. Expect a reply at {{field:email}}.',
  palette: {
    primary: '#E91E8C', accent: '#29B6F6', surface: '#FFFFFF', text: '#1A1A2E',
    muted: '#6B7280', border: '#E5E7EB', onPrimary: '#FFFFFF', deco: '#29B6F6', page: '#F8F9FE',
  },

  exactFields: [
    choiceField('programme', 'Radio', 'Programme', [
      { label: 'Erasmus Exchange', value: 'erasmus', description: 'Berlin · Paris · Madrid', icon: 'fa-globe' },
      { label: 'Language Immersion', value: 'language', description: 'Florence · Lisbon · Vienna', icon: 'fa-bullhorn' },
      { label: 'Solidarity Corps', value: 'volunteer', description: 'Amsterdam · Prague · Athens', icon: 'fa-magic' },
    ], 'cards', 3, { required: true }),
    field('first_name', 'Text', 'First name *', { required: true, placeholder: 'Anna' }),
    field('last_name', 'Text', 'Last name *', { required: true, placeholder: 'Müller' }),
    field('email', 'Email', 'Email *', { required: true, placeholder: 'anna@email.eu' }),
    field('phone', 'Text', 'Phone', { placeholder: '+49 170 1234567' }),
    field('birth_year', 'Text', 'Year of birth', { placeholder: '2004' }),
    choiceField('country', 'Select', 'Country *', [
      'Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria',
      'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other',
    ], 'dropdown', null, { required: true, placeholder: 'Select country' }),
    choiceField('start_month', 'Select', 'Start month *', [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ], 'dropdown', null, { required: true, placeholder: 'Select…' }),
    choiceField('duration', 'Select', 'Duration (months)',
      ['1', '2', '3', '6', '9', '12'], 'dropdown', null, { defaultValue: '3', placeholder: 'Select…' }),
    choiceField('language_level', 'Select', 'Language level',
      ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], 'dropdown', null, { placeholder: 'Select…' }),
    choiceField('accommodation', 'Select', 'Accommodation',
      ['Host family', 'Student dorm', 'Private flat', 'Not needed'], 'dropdown', null,
      { placeholder: 'Select…' }),
    choiceField('interests', 'Checkbox', 'Interests', [
      'Art & Design', 'Technology', 'Sustainability', 'Music',
      'Sports', 'Cuisine', 'History', 'Entrepreneurship',
    ], 'chips'),
    field('motivation', 'Textarea', 'Motivation', {
      placeholder: 'Why do you want to join EuroYouth?',
    }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [
      { label: 'Keep me updated with EuroYouth news and programme info', value: 'yes' },
    ], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [
      { label: 'I agree to the terms and conditions *', value: 'yes' },
    ], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    // Five service groups of three; the dot is pink / blue / green by ROW position.
    const SERVICES = [
      ['Strategy', 'Branding', 'SEO Management'],
      ['Web Hosting', 'Development', 'Fast & focusing'],
      ['Design', 'Advertising', 'Advanced'],
      ['Digital Marketing', 'Management', 'Highly experienced'],
      ['Development', 'Development', '100% Proven'],
    ];
    const svc = SERVICES.map((row) => `<div class='${p}-svc-g'>`
      + row.map((t, j) => `<div class='${p}-svc-r'><span class='${p}-dot ${p}-dot-${j}'></span>`
        + `<span class='${p}-svc-t'>${t}</span></div>`).join('')
      + `</div>`).join('');
    const rule = (tone, text) => `<div class='${p}-rule ${p}-rule-${tone}'>`
      + `<i class='${p}-hair'></i><span class='${p}-rule-t'>${text}</span><i class='${p}-hair'></i></div>`;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'>`
      + `<div class='${p}-hero'>`
      + `<img class='${p}-content-image' src='{{content:hero_image}}' alt='' aria-hidden='true'>`
      + `<div class='${p}-hero-wash' role='presentation'></div>`
      + `<div class='${p}-hero-strip' role='presentation'></div>`
      + `<div class='${p}-hero-in'>`
      + `<div class='${p}-logo'><span class='${p}-logo-mark'><i class='fa fa-bolt'></i></span>`
      + `<span class='${p}-logo-t'><span class='${p}-logo-a'>EUROYOUTH</span>`
      + `<span class='${p}-logo-b'>EXCHANGE</span></span></div>`
      + `<h1 class='${p}-h1'><span class='${p}-h1-a'>EURO</span><span class='${p}-h1-b'>YOUTH</span>`
      + `<span class='${p}-h1-c'>EXCHANGE</span></h1>`
      + `</div></div>`

      + `<div class='${p}-main'>`
      + `<div class='${p}-svc'><div class='${p}-svc-h'>What we offer:</div>`
      + `<div class='${p}-svc-grid'>${svc}</div></div>`
      + `<div class='${p}-prog'>{{field:programme}}</div>`
      + `<div class='${p}-card'>`
      + rule('pink', 'Personal Information')
      + `<div class='${p}-grid2'>`
      + fld('First name *', 'first_name') + fld('Last name *', 'last_name')
      + fld('Email *', 'email') + fld('Phone', 'phone')
      + fld('Year of birth', 'birth_year') + fld('Country *', 'country')
      + `</div>`
      + rule('blue', 'Programme Details')
      + `<div class='${p}-grid2'>`
      + fld('Start month *', 'start_month') + fld('Duration (months)', 'duration')
      + fld('Language level', 'language_level') + fld('Accommodation', 'accommodation')
      + `</div>`
      + rule('green', 'Your Interests')
      + `<div class='${p}-chips'>{{field:interests}}</div>`
      + rule('grey', 'Motivation')
      + `<div class='${p}-ta'>{{field:motivation}}</div>`
      + `<div class='${p}-consent'>{{field:newsletter}}{{field:terms}}</div>`
      + `<button class='${p}-submit' type='submit'>Submit Application</button>`
      + `</div>`
      + `<div class='${p}-dev'><div class='${p}-dev-in'>`
      + `<span class='${p}-dev-tile'><i class='fa fa-code'></i></span>`
      + `<span class='${p}-dev-text'><span class='${p}-dev-h'>Development</span>`
      + `<span class='${p}-dev-b'>We conduct web development, UX &amp; motion graphics, interactive `
      + `surfaces, engaging layouts, and interactive strategies that turn into profit.</span></span>`
      + `</div></div>`
      + `</div></div></div>`;
  },

  exactCss: `
@S@{container-type:inline-size;font-family:${INTER}!important;color:#1A1A2E}
@S@.agf-page{background:#F8F9FE}

/* hero ------------------------------------------------------------------- */
@S@.agf-hero{position:relative;overflow:hidden;min-height:320px;
  background-image:${asset(AGF_SLUG, 'agency-flyer-hero.png')};
  background-size:cover;background-position:50% 50%}
@S@img.agf-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 50%!important;
  border:0!important;border-radius:0!important;pointer-events:none!important}
@S@.agf-hero-wash{position:absolute;inset:0;
  background:linear-gradient(105deg,rgba(233,30,140,.93) 0%,rgba(233,30,140,.6) 35%,transparent 70%)}
@S@.agf-hero-strip{position:absolute;left:0;right:0;bottom:0;height:6px;background:#29B6F6}
/* max-w-5xl WITHOUT mx-auto: the headline hugs the left edge in the mock. */
@S@.agf-hero-in{position:relative;max-width:1024px;padding:40px 32px}
@container (min-width:768px){@S@.agf-hero-in{padding:56px}}
@S@.agf-logo{display:flex;align-items:center;gap:8px;margin-bottom:32px}
@S@.agf-logo-mark{display:flex;align-items:center;justify-content:center;width:32px;height:32px;
  border-radius:999px;background:#fff;color:#E91E8C;font-size:16px;line-height:16px}
@S@.agf-logo-t{display:flex;flex-direction:column;font-size:10px;line-height:1.25;font-weight:900;
  letter-spacing:.25em;text-transform:uppercase;color:#fff}
@S@.agf-logo-b{color:#E1F5FE}
@S@h1.agf-h1{margin:0!important;font-style:italic!important;font-weight:900!important;
  line-height:.9!important;letter-spacing:-1.0667px!important;color:#fff!important}
@S@.agf-h1-a,@S@.agf-h1-b,@S@.agf-h1-c{display:block;font-size:48px;line-height:.9}
@container (min-width:768px){@S@.agf-h1-a,@S@.agf-h1-b,@S@.agf-h1-c{font-size:72px}}
@S@.agf-h1-b{color:#29B6F6}

/* content column --------------------------------------------------------- */
@S@.agf-main{max-width:1024px;margin:0 auto;padding:32px 24px}
@container (min-width:768px){@S@.agf-main{padding:32px 56px}}
@S@.agf-svc{margin-bottom:32px;padding:24px;border-radius:16px;background:#fff}
@S@.agf-svc-h{margin:0 0 16px;font-size:12px;line-height:16px;font-weight:900;letter-spacing:.1em;
  text-transform:uppercase;color:#6B7280}
@S@.agf-svc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
@S@.agf-svc-g{display:flex;flex-direction:column;gap:4px}
@S@.agf-svc-r{display:flex;align-items:center;gap:6px}
@S@.agf-dot{width:6px;height:6px;border-radius:999px;flex:0 0 6px}
@S@.agf-dot-0{background:#E91E8C}
@S@.agf-dot-1{background:#29B6F6}
@S@.agf-dot-2{background:#10B981}
@S@.agf-svc-t{font-size:11px;line-height:16px;font-weight:500;color:#1A1A2E}
@S@.agf-prog{margin-bottom:32px}
@S@.agf-card{margin-bottom:24px;padding:24px;border-radius:16px;background:#fff}

/* captioned hairline rules ---------------------------------------------- */
@S@.agf-rule{display:flex;align-items:center;gap:8px;margin-bottom:20px}
@S@.agf-hair{flex:1 1 0;height:1px;display:block}
@S@.agf-rule-t{padding:0 12px;font-size:11px;line-height:16px;font-weight:900;letter-spacing:.1em;
  text-transform:uppercase}
@S@.agf-rule-pink .agf-hair{background:#E91E8C}
@S@.agf-rule-pink .agf-rule-t{color:#E91E8C}
@S@.agf-rule-blue .agf-hair{background:#29B6F6}
@S@.agf-rule-blue .agf-rule-t{color:#29B6F6}
@S@.agf-rule-green{margin-bottom:16px}
@S@.agf-rule-green .agf-hair{background:#10B981}
@S@.agf-rule-green .agf-rule-t{color:#10B981}
@S@.agf-rule-grey{margin-bottom:16px}
@S@.agf-rule-grey .agf-hair{background:#E5E7EB}
@S@.agf-rule-grey .agf-rule-t{color:#6B7280}

@S@.agf-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
@S@.agf-field{display:block;margin:0}
@S@.agf-label{display:block;margin:0 0 6px;font-size:11px;line-height:16px;font-weight:700;
  letter-spacing:.05em;text-transform:uppercase;color:#6B7280}
@S@.agf-chips{margin-bottom:24px}
@S@.agf-ta{line-height:0}
${controlReset()}
${boxedControls({ border: '#E5E7EB', focus: '#E91E8C', text: '#1A1A2E', ph: '#6B7280',
  bg: '#FFFFFF', radius: 8, padY: 10, padX: 16, size: 14, line: 20 })}
@S@.mf-input[class],@S@.mf-select[class]{border-width:2px!important}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;
  border:2px solid #E5E7EB!important;border-radius:8px!important;background:transparent!important;
  padding:12px!important;min-height:88px!important;height:88px!important;resize:none!important;
  margin-bottom:16px!important;color:#1A1A2E!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;box-shadow:none!important}

/* programme cards -------------------------------------------------------- */
@S@.mf-option-group--cards{display:grid!important;grid-template-columns:1fr 1fr 1fr!important;
  gap:16px!important}
@S@.mf-option-group--cards .mf-option-ui{display:flex;flex-direction:column;align-items:stretch;
  gap:0;width:100%;box-sizing:border-box;padding:16px;border:2px solid #E5E7EB;border-radius:12px;
  background:#fff;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--cards .mf-option-icon{display:block!important;width:100%!important;
  height:20px!important;flex:0 0 20px!important;margin:0 0 8px!important;padding:0!important;
  border:0!important;border-radius:0!important;background:transparent!important;
  text-align:left!important;font-size:20px!important;line-height:20px!important;
  font-weight:400!important;color:#6B7280!important}
@S@.mf-option-group--cards .mf-option-label{font-size:13px;line-height:1.25;font-weight:700;
  color:#1A1A2E}
@S@.mf-option-group--cards .mf-option-desc{display:block;width:100%;margin-top:2px;font-size:11px;
  line-height:16px;font-weight:400;color:#6B7280}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--cards input:checked+.mf-option-ui{border-color:#E91E8C;background:#FCE4F3}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-icon,
@S@.mf-option-group--cards input:checked+.mf-option-ui .mf-option-icon{color:#E91E8C!important}

/* interest chips: rounded-lg, NOT pills --------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 12px;
  border:2px solid #E5E7EB;border-radius:8px;background:transparent;color:#6B7280;font-size:12px;
  line-height:16px;font-weight:700;text-align:center;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;font-weight:700;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#E91E8C;border-color:#E91E8C;
  color:#fff}

/* consent, CTA, development strip, back link ---------------------------- */
@S@.agf-consent{display:flex;flex-direction:column;gap:12px;margin-bottom:24px}
@S@.agf-consent .mf-option-group--list{display:flex;flex-direction:column;gap:12px}
@S@.agf-consent .mf-option-item{display:flex;align-items:flex-start;gap:12px}
@S@.agf-consent .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.agf-consent .mf-option-label{font-size:14px;line-height:20px;font-weight:400;color:#6B7280}
@S@.agf-consent input[type="checkbox"]{width:20px!important;height:20px!important;
  flex:0 0 20px!important;margin:2px 0 0!important;border:2px solid #E5E7EB!important;
  border-radius:6px!important}
@S@button.agf-submit[type="submit"]{display:block;width:100%!important;padding:16px 0!important;
  border:0!important;border-radius:12px!important;
  background:linear-gradient(90deg,#E91E8C 0%,#29B6F6 100%)!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:900!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  cursor:pointer!important;box-shadow:none!important}
/* The mock DOES grey its CTA until the form is valid — measured #E5E7EB. */
@S@button.agf-submit.mf-nav-blocked,@S@button.agf-submit[disabled]{opacity:1;
  background:#E5E7EB!important;cursor:not-allowed!important;filter:none!important}
@S@.agf-dev{border-radius:16px;overflow:hidden}
@S@.agf-dev-in{display:flex;align-items:flex-start;gap:16px;padding:20px;background:#1A1A2E}
@S@.agf-dev-tile{display:flex;align-items:center;justify-content:center;flex:0 0 48px;width:48px;
  height:48px;border:2px solid #29B6F6;border-radius:12px;color:#29B6F6;font-size:24px;
  line-height:24px}
@S@.agf-dev-text{display:flex;flex-direction:column}
@S@.agf-dev-h{margin-bottom:4px;font-size:14px;line-height:20px;font-weight:900;letter-spacing:.05em;
  text-transform:uppercase;color:#fff}
@S@.agf-dev-b{font-size:12px;line-height:1.625;font-weight:400;color:#9CA3AF}
@S@.agf-back{margin-top:20px;text-align:center}
@S@.agf-back-link{display:inline-flex;align-items:center;gap:8px;font-size:14px;line-height:20px;
  font-weight:500;color:#6B7280}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// hotel-concierge (shipped as kids-first-book) — mock: app/forms/hotel-concierge/page.tsx
//
//   page    #FDF0F4, py-10 px-4, max-w-2xl (672px)
//   card    rounded-3xl, 4px DASHED #B5EAD7 border, overflow-hidden
//   banner  flat #F9C8D4 with a 20px gingham checker, centred 36px/900 coral title
//   rows    ONE field per line: a fixed 150px uppercase label, 12px gap, then a control whose only
//           chrome is a 2px DOTTED bottom border — never two fields side by side
//   bands   five full-bleed section bars (-mx-8) in mint / sky / yellow / pink / mint
//   cta     solid #4A90D9, 16px/900 uppercase, radius 16
// ─────────────────────────────────────────────────────────────────────────────
const UNICORN = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>
  <ellipse cx='60' cy='78' rx='30' ry='22' fill='#FDEAF0'/>
  <circle cx='85' cy='58' r='18' fill='#FDEAF0'/>
  <polygon points='90,44 86,24 94,40' fill='#F4C542'/>
  <polygon points='78,44 74,34 84,42' fill='#F9A8C4'/>
  <circle cx='89' cy='57' r='3' fill='#5A3A4A'/><circle cx='90' cy='56' r='1' fill='white'/>
  <circle cx='98' cy='62' r='1.5' fill='#F4829E'/>
  <path d='M78 46 Q70 55 72 65 Q65 58 70 48 Q65 54 68 63 Q60 56 65 44' fill='none' stroke='#C8A0F0' stroke-width='3' stroke-linecap='round'/>
  <path d='M80 45 Q74 52 76 60' fill='none' stroke='#F9A8C4' stroke-width='2.5' stroke-linecap='round'/>
  <rect x='40' y='96' width='8' height='16' rx='4' fill='#FDEAF0'/>
  <rect x='54' y='96' width='8' height='16' rx='4' fill='#FDEAF0'/>
  <rect x='68' y='96' width='8' height='14' rx='4' fill='#FDEAF0'/>
  <rect x='82' y='94' width='8' height='14' rx='4' fill='#FDEAF0'/>
  <path d='M32 72 Q18 80 20 95 Q28 85 30 92' fill='none' stroke='#C8A0F0' stroke-width='3.5' stroke-linecap='round'/>
  <path d='M33 74 Q16 86 22 100' fill='none' stroke='#F9A8C4' stroke-width='2.5' stroke-linecap='round'/>
  <path d='M34 76 Q20 90 25 104' fill='none' stroke='#FDEEA0' stroke-width='2' stroke-linecap='round'/>
</svg>`);

const KFB = {
  slug: 'kids-first-book-registration',
  title: 'Baby\'s First Book — Registration',
  description:
    'Pastel scrapbook registration: a dashed-mint card with a gingham banner, one field per line '
    + 'behind a fixed uppercase label on a dotted rule, five full-bleed section bands, pill '
    + 'interests, a dashed notes panel and a solid blue CTA. Transcribed from the hotel-concierge '
    + 'mock, whose design is a children\'s first-book registration.',
  category: 'registration',
  categories: ['registration', 'premium', 'family'],
  icon: 'book',
  prefix: 'kfb',
  outerBorder: false,   // .kfb-card already draws the mock's 4px dashed border
  fontStack: `'Nunito',system-ui,-apple-system,'Segoe UI',sans-serif`,
  fontImport:
    `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');`,
  submitLabel: 'Use Template',
  successTitle: 'All done!',
  successMessage: 'Registration received.',
  successBody: 'Thank you, {{field:first_name}}. We saved this to your first book.',
  palette: {
    primary: '#E8607A', accent: '#4A90D9', surface: '#FFFFFF', text: '#5A3A4A',
    muted: '#B09AA8', border: '#F0C8D8', onPrimary: '#FFFFFF', deco: '#FDEEA0', page: '#FDF0F4',
  },

  exactFields: [
    field('first_name', 'Text', 'First name', { required: true, placeholder: 'Mia' }),
    field('last_name', 'Text', 'Last name', { required: true, placeholder: 'Robinson' }),
    field('school', 'Text', 'School', { placeholder: 'Meadowlark School' }),
    field('email', 'Email', 'Email', { required: true, placeholder: 'mia@email.com' }),
    field('phone', 'Text', 'Phone', { placeholder: '(555) 010-2233' }),
    field('birth_year', 'Text', 'Birth year', { placeholder: '2006' }),
    field('author', 'Text', 'Author', { placeholder: 'Your name' }),
    field('address', 'Text', 'Address', { placeholder: '123 Main Street' }),
    choiceField('programme', 'Select', 'Programme', [
      'Erasmus Exchange', 'Language Immersion', 'Solidarity Corps',
      'Youth Leadership', 'Cultural Heritage',
    ], 'dropdown', null, { placeholder: 'Select…' }),
    choiceField('country', 'Select', 'Country', [
      'Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands',
      'Austria', 'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other',
    ], 'dropdown', null, { placeholder: 'Select…' }),
    choiceField('duration', 'Select', 'Duration',
      ['1 month', '2 months', '3 months', '6 months', '9 months', '12 months'],
      'dropdown', null, { defaultValue: '3 months', placeholder: 'Select…' }),
    choiceField('start_month', 'Select', 'Start month', [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ], 'dropdown', null, { placeholder: 'Select…' }),
    choiceField('interests', 'Checkbox', 'My Interests',
      ['Art', 'Music', 'Dance', 'Sports', 'Reading', 'Cooking', 'Travel', 'Science'], 'chips'),
    field('motivation', 'Textarea', 'Notes', {
      placeholder: 'Write your dreams and wishes here…',
    }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [
      { label: 'Send me updates about programmes and events.', value: 'yes' },
    ], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [
      { label: 'I accept the <span class="kfb-link">terms &amp; privacy policy</span>. *', value: 'yes' },
    ], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const band = (tone, label) => `<div class='${p}-band ${p}-band-${tone}'>`
      + `<span class='${p}-band-t'>${label}</span></div>`;
    const row = (label, key) => `<label class='${p}-row'>`
      + `<span class='${p}-row-l'>${label}:</span>`
      + `<span class='${p}-row-c'>{{field:${key}}}</span></label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-card'>`
      + `<div class='${p}-banner'>`
      + `<i class='fa fa-star ${p}-star ${p}-star-a'></i>`
      + `<i class='fa fa-star ${p}-star ${p}-star-b'></i>`
      + `<i class='fa fa-star ${p}-star ${p}-star-c'></i>`
      + `<div class='${p}-unicorn' role='presentation'></div>`
      + `<h1 class='${p}-h1'>BABY&#39;S FIRST BOOK</h1>`
      + `<p class='${p}-sub'>EuroYouth Exchange — Registration</p>`
      + `</div>`
      + `<div class='${p}-body'>`
      + band('mint', 'Personal Details')
      + row('FIRST NAME', 'first_name') + row('LAST NAME', 'last_name')
      + row('SCHOOL', 'school') + row('EMAIL', 'email') + row('PHONE', 'phone')
      + row('BIRTH YEAR', 'birth_year') + row('AUTHOR', 'author') + row('ADDRESS', 'address')
      + band('sky', 'Programme Details')
      + row('PROGRAMME', 'programme') + row('COUNTRY', 'country')
      + row('DURATION', 'duration') + row('START MONTH', 'start_month')
      + band('yellow', 'My Interests')
      + `<div class='${p}-chips'>{{field:interests}}</div>`
      + band('pink', 'Notes &amp; Wishes')
      + `<div class='${p}-ta'>{{field:motivation}}</div>`
      + band('mint', 'Declaration')
      + `<div class='${p}-consent'>{{field:newsletter}}{{field:terms}}</div>`
      + `<div class='${p}-cta'><button class='${p}-submit' type='submit'>Use Template</button></div>`
      + `</div></div>`
      + `<div class='${p}-stars'>`
      + [0, 1, 2, 3, 4].map((i) => `<i class='fa fa-star ${p}-s${i}'></i>`).join('')
      + `</div>`
      + `</div></div></div>`;
  },

  exactCss: `
@S@{font-family:'Nunito',system-ui,-apple-system,'Segoe UI',sans-serif!important;color:#5A3A4A}
@S@.kfb-page{padding:40px 16px;background:#FDF0F4}
@S@.kfb-shell{max-width:672px;margin:0 auto}
@S@.kfb-card{position:relative;overflow:hidden;border:4px dashed #B5EAD7;border-radius:24px;
  background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}

/* gingham banner: a 20px pattern of two 10px squares at 18% white ------- */
@S@.kfb-banner{position:relative;overflow:hidden;padding:32px 32px 24px;background:#F9C8D4;
  background-image:linear-gradient(45deg,rgba(255,255,255,.18) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.18) 75%),
    linear-gradient(45deg,rgba(255,255,255,.18) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.18) 75%);
  background-size:20px 20px;background-position:0 0,10px 10px}
@S@.kfb-star{position:absolute;color:#FDEEA0}
@S@.kfb-star-a{top:16px;right:40px;font-size:20px}
@S@.kfb-star-b{top:32px;right:24px;font-size:12px;opacity:.7}
@S@.kfb-star-c{top:12px;left:24px;font-size:16px;opacity:.5}
@S@.kfb-unicorn{position:absolute;right:24px;bottom:-24px;width:112px;height:112px;
  background-image:${UNICORN};background-size:contain;background-repeat:no-repeat}
@S@.kfb-stars{display:flex;justify-content:center;gap:12px;margin-top:24px}
@S@.kfb-stars i{font-size:20px;line-height:20px}
@S@.kfb-s0{color:#F4829E}
@S@.kfb-s1{color:#7DD4B8}
@S@.kfb-s2{color:#FDEEA0}
@S@.kfb-s3{color:#4A90D9}
@S@.kfb-s4{color:#E8607A}
@S@h1.kfb-h1{position:relative;margin:0!important;text-align:center!important;font-size:36px!important;
  line-height:1.25!important;font-weight:900!important;letter-spacing:.025em!important;
  color:#E8607A!important}
@S@p.kfb-sub{position:relative;margin:4px 0 0!important;text-align:center!important;
  font-size:14px!important;line-height:20px!important;font-weight:600!important;color:#C0607A!important}

/* body, full-bleed section bands ---------------------------------------- */
@S@.kfb-body{padding:24px 32px 32px}
@S@.kfb-band{margin:16px -32px;padding:8px 32px}
@S@.kfb-band-t{font-size:12px;line-height:16px;font-weight:900;letter-spacing:.18em;
  text-transform:uppercase;color:#5A3A4A}
@S@.kfb-band-mint{background:#B5EAD7}
@S@.kfb-band-sky{background:#A8D8EA}
@S@.kfb-band-yellow{background:#FDEEA0}
@S@.kfb-band-pink{background:#F9C8D4}

/* one field per line, fixed label column -------------------------------- */
@S@.kfb-row{display:flex;align-items:center;gap:12px;margin:0;padding:6px 0;
  border-bottom:1px solid #F5E0E8}
@S@.kfb-row-l{flex:0 0 150px;width:150px;font-size:11px;line-height:16px;font-weight:900;
  letter-spacing:.12em;text-transform:uppercase;color:#C0708A}
@S@.kfb-row-c{flex:1 1 auto;min-width:0;display:block}
@S@.kfb-chips{padding:12px 0}
@S@.kfb-ta{padding:12px 0}
@S@.kfb-cta{padding-top:16px}
@S@.kfb-back{padding-top:16px;text-align:center}
@S@.kfb-back-link{display:inline-flex;align-items:center;gap:6px;font-size:14px;line-height:20px;
  font-weight:600;color:#B09AA8}
${controlReset()}
${underlineControls({ border: '#F4B8C8', focus: '#F4829E', text: '#5A3A4A', ph: '#B09AA8',
  size: 14, line: 20, pad: 6 })}
/* the rule under a control is DOTTED here, not solid */
@S@.mf-input[class],@S@.mf-select[class]{border-bottom-style:dotted!important;font-weight:600!important}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;
  border:2px dashed #F0C8D8!important;border-radius:16px!important;background:#FFFBFC!important;
  padding:16px!important;min-height:96px!important;height:96px!important;resize:none!important;
  color:#5A3A4A!important;font-family:inherit!important;font-size:14px!important;
  line-height:20px!important;font-weight:600!important;box-shadow:none!important}

/* interest pills --------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 16px;
  border:2px solid #F0C8D8;border-radius:9999px;background:#fff;color:#5A3A4A;font-size:14px;
  line-height:20px;font-weight:700;text-align:center;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:14px;line-height:20px;font-weight:700;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#F4829E;border-color:#E8607A;
  color:#fff}

/* declaration, CTA ------------------------------------------------------- */
@S@.kfb-consent{display:flex;flex-direction:column;gap:12px;padding:12px 0}
@S@.kfb-consent .mf-option-group--list{display:flex;flex-direction:column;gap:12px}
@S@.kfb-consent .mf-option-item{display:flex;align-items:flex-start;gap:12px}
@S@.kfb-consent .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.kfb-consent .mf-option-label{font-size:14px;line-height:20px;font-weight:600;color:#5A3A4A}
@S@.kfb-consent input[type="checkbox"]{width:20px!important;height:20px!important;
  flex:0 0 20px!important;margin:1px 0 0!important;border:2px solid #F4B8C8!important;
  border-radius:6px!important}
@S@.kfb-link{text-decoration:underline;font-weight:700;color:#E8607A}
@S@button.kfb-submit[type="submit"]{display:block;width:100%!important;padding:16px 0!important;
  border:0!important;border-radius:16px!important;background:#4A90D9!important;color:#fff!important;
  font-family:inherit!important;font-size:16px!important;line-height:24px!important;
  font-weight:900!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  cursor:pointer!important;box-shadow:none!important}
/* the mock's CTA is never greyed - it validates on click */
@S@button.kfb-submit.mf-nav-blocked,@S@button.kfb-submit[disabled]{opacity:1!important;
  background:#4A90D9!important;cursor:not-allowed!important;filter:none!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// xmas-sale — mock: app/forms/xmas-sale/page.tsx
//
//   page    #F4FAF8, py-8 px-4, max-w-xl (576px)
//   hero    rounded-t-2xl, px-8 pt-10 pb-8, gradient 160deg #1B8C6E → #0E5C47, snow texture,
//           gold-ringed emblem, "Merry" eyebrow, serif italic "Christmas", gold hairline with
//           "and" at white/60, serif italic "Happy New Year" at white/85
//   strip   border-x py-3.5 on white, two 4px gold dots around 11px/700 green copy
//   promo   border-2 green box: kicker, serif "OFFER", 48px gold rule, 12px body
//   body    px-6 pt-6 pb-4 — programme radio cards WITH a leading circle, two 2-up grids,
//           pill chips, textarea, two consents, full-bleed CTA
//   close   a 16px rounded-b-2xl strip, then the back link
// ─────────────────────────────────────────────────────────────────────────────
const XMS = {
  slug: 'xmas-sale-euroyouth-application',
  title: 'Christmas Offer — EuroYouth Application',
  description:
    'Emerald Christmas flyer: a snow-textured gradient hero with a gold-ringed emblem and a serif '
    + 'italic display, a bordered FIVE DAYS OF OFFER promo, programme cards with radio markers, '
    + 'two-column fields, interest pills and a gated CTA. Transcribed from the xmas-sale mock.',
  category: 'application',
  categories: ['application', 'premium', 'seasonal'],
  icon: 'sparkles',
  prefix: 'xms',
  outerBorder: {},
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  submitLabel: 'Apply Now',
  successTitle: 'Application received!',
  successMessage: 'Application received. We will be in touch within 5 working days.',
  successBody:
    '{{field:first_name}}, your application is confirmed. Check {{field:email}} in 5 working days.',
  palette: {
    primary: '#1B8C6E', accent: '#0E5C47', surface: '#FFFFFF', text: '#1A2E26',
    muted: '#5A7A6F', border: '#B8D9CF', onPrimary: '#FFFFFF', deco: '#D9B45B', page: '#F4FAF8',
  },

  exactFields: [
    choiceField('programme', 'Radio', 'Programme', [
      { label: 'Erasmus Exchange', value: 'erasmus', description: 'Berlin · Paris · Madrid' },
      { label: 'Language Immersion', value: 'language', description: 'Florence · Lisbon · Vienna' },
      { label: 'Solidarity Corps', value: 'volunteer', description: 'Amsterdam · Prague · Athens' },
    ], 'cards', 1, { required: true }),
    field('first_name', 'Text', 'First name *', { required: true, placeholder: 'Anna' }),
    field('last_name', 'Text', 'Last name *', { placeholder: 'Müller' }),
    field('email', 'Email', 'Email *', { required: true, placeholder: 'anna@email.eu' }),
    field('phone', 'Text', 'Phone', { placeholder: '+49 170 1234567' }),
    field('birth_year', 'Text', 'Birth year', { placeholder: '2004' }),
    choiceField('country', 'Select', 'Country *', [
      'Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria',
      'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other',
    ], 'dropdown', null, { required: true, placeholder: 'Select…' }),
    choiceField('start_month', 'Select', 'Start month *', [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ], 'dropdown', null, { required: true, placeholder: 'Select…' }),
    choiceField('duration', 'Select', 'Duration (months)',
      ['1', '2', '3', '6', '9', '12'], 'dropdown', null, { defaultValue: '3', placeholder: 'Select…' }),
    choiceField('language_level', 'Select', 'Language level',
      ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], 'dropdown', null, { placeholder: 'Select…' }),
    choiceField('accommodation', 'Select', 'Accommodation',
      ['Host family', 'Student dorm', 'Private flat', 'Not needed'], 'dropdown', null,
      { placeholder: 'Select…' }),
    choiceField('interests', 'Checkbox', 'Interests', [
      'Art & Design', 'Technology', 'Sustainability', 'Music',
      'Sports', 'Cuisine', 'History', 'Entrepreneurship',
    ], 'chips'),
    field('motivation', 'Textarea', 'Motivation', {
      placeholder: 'Why do you want to join EuroYouth?',
    }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [
      { label: 'Send me EuroYouth updates and offers', value: 'yes' },
    ], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [
      { label: 'I agree to the terms and conditions *', value: 'yes' },
    ], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const cap = (t) => `<div class='${p}-cap'>${t}</div>`;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-hero'><div class='${p}-snow' role='presentation'></div>`
      + `<div class='${p}-hero-in'>`
      + `<div class='${p}-emblem'><i class='fa fa-snowflake-o'></i></div>`
      + `<div class='${p}-eyebrow'>Merry</div>`
      + `<h1 class='${p}-display'>Christmas</h1>`
      + `<div class='${p}-hair'><span class='${p}-hr'></span>`
      + `<span class='${p}-hr-word'>and</span><span class='${p}-hr'></span></div>`
      + `<div class='${p}-sub'>Happy New Year</div>`
      + `</div></div>`
      + `<div class='${p}-tagline'><span class='${p}-dot'></span>`
      + `<span class='${p}-tagline-t'>Online &amp; in Stores</span>`
      + `<span class='${p}-dot'></span></div>`
      + `<div class='${p}-promo'>`
      + `<div class='${p}-promo-in'>`
      + `<div class='${p}-kicker'>Five days of</div>`
      + `<div class='${p}-headline'>OFFER</div>`
      + `<div class='${p}-promo-hr'></div>`
      + `<p class='${p}-promo-b'>Apply during the Christmas season and receive priority placement, `
      + `a reduced application fee waiver, and early access to 2026 programme spots across Europe.</p>`
      + `</div>`
      + `<div class='${p}-body'>`
      + cap('Choose Your Programme')
      + `<div class='${p}-prog'>{{field:programme}}</div>`
      + cap('Personal Information')
      + `<div class='${p}-grid2'>`
      + fld('First name *', 'first_name') + fld('Last name *', 'last_name')
      + fld('Email *', 'email') + fld('Phone', 'phone')
      + fld('Birth year', 'birth_year') + fld('Country *', 'country')
      + `</div>`
      + cap('Programme Details')
      + `<div class='${p}-grid2'>`
      + fld('Start month *', 'start_month') + fld('Duration (months)', 'duration')
      + fld('Language level', 'language_level') + fld('Accommodation', 'accommodation')
      + `</div>`
      + cap('Interests')
      + `<div class='${p}-chips'>{{field:interests}}</div>`
      + `<div class='${p}-cap ${p}-cap-tight'>Motivation</div>`
      + `<div class='${p}-ta'>{{field:motivation}}</div>`
      + `<div class='${p}-consent'>{{field:newsletter}}{{field:terms}}</div>`
      + `<button class='${p}-submit' type='submit'>Apply Now</button>`
      + `</div></div>`
      + `<div class='${p}-close' role='presentation'></div>`
      + `</div></div></div>`;
  },

  exactCss: `
@S@{font-family:${INTER}!important;color:#1A2E26}
@S@.xms-page{padding:32px 16px;background:#F4FAF8}
@S@.xms-shell{max-width:576px;margin:0 auto}

/* hero ------------------------------------------------------------------- */
@S@.xms-hero{position:relative;overflow:hidden;padding:40px 32px 32px;text-align:center;
  border-radius:16px 16px 0 0;background:linear-gradient(160deg,#1B8C6E 0%,#0E5C47 100%);
  box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}
@S@.xms-snow{position:absolute;inset:0;background-image:${TEXTURES.snow('white')};
  background-size:cover;background-repeat:no-repeat;pointer-events:none}
@S@.xms-hero-in{position:relative}
@S@.xms-emblem{display:flex;align-items:center;justify-content:center;width:44px;height:44px;
  margin:0 auto 20px;border:1px solid #D9B45B;border-radius:999px;
  background:rgba(255,255,255,.06);color:#D9B45B;font-size:20px;line-height:20px}
@S@.xms-eyebrow{margin-bottom:12px;font-size:11px;line-height:16px;font-weight:600;
  letter-spacing:.4em;text-transform:uppercase;color:rgba(255,255,255,.7)}
@S@h1.xms-display{margin:0!important;font-family:ui-serif,Georgia,Cambria,'Times New Roman',Times,serif!important;
  font-size:48px!important;line-height:1!important;font-weight:500!important;font-style:italic!important;
  color:#fff!important}
@S@.xms-hair{display:flex;align-items:center;justify-content:center;gap:12px;margin:16px 0}
@S@.xms-hr{width:40px;height:1px;background:#D9B45B;opacity:.7}
@S@.xms-hr-word{font-size:10px;line-height:16px;font-weight:400;letter-spacing:.3em;
  text-transform:uppercase;color:rgba(255,255,255,.6)}
@S@.xms-sub{font-family:ui-serif,Georgia,Cambria,'Times New Roman',Times,serif!important;
  font-size:18px;line-height:28px;font-weight:400;font-style:italic;color:rgba(255,255,255,.85)}

/* tagline strip, promo box ---------------------------------------------- */
@S@.xms-tagline{display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 0;
  background:#fff;border-left:1px solid #B8D9CF;border-right:1px solid #B8D9CF}
@S@.xms-dot{width:4px;height:4px;border-radius:999px;background:#D9B45B}
@S@.xms-tagline-t{font-size:11px;line-height:16px;font-weight:700;letter-spacing:.32em;
  text-transform:uppercase;color:#1B8C6E}
@S@.xms-promo{border:2px solid #1B8C6E;background:#fff}
@S@.xms-promo-in{padding:24px 32px;text-align:center;border-bottom:1px solid #D4EDE7}
@S@.xms-kicker{margin-bottom:4px;font-size:10px;line-height:16px;font-weight:900;
  letter-spacing:.3em;text-transform:uppercase;color:#D9B45B}
@S@.xms-headline{margin-bottom:8px;font-family:ui-serif,Georgia,Cambria,'Times New Roman',Times,serif!important;
  font-size:36px;line-height:40px;font-weight:500;letter-spacing:-.025em;color:#1A2E26}
@S@.xms-promo-hr{width:48px;height:1px;margin:0 auto 12px;background:#D9B45B}
@S@p.xms-promo-b{margin:0!important;font-size:12px!important;line-height:1.625!important;
  font-weight:400!important;color:#5A7A6F!important}

/* body ------------------------------------------------------------------- */
@S@.xms-body{padding:24px 24px 16px}
@S@.xms-cap{margin:0 0 12px;font-size:11px;line-height:16px;font-weight:900;letter-spacing:.1em;
  text-transform:uppercase;text-align:center;color:#1B8C6E}
@S@.xms-cap-tight{margin-bottom:8px}
@S@.xms-prog{margin-bottom:24px}
@S@.xms-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
@S@.xms-field{display:block;margin:0}
@S@.xms-label{display:block;margin:0 0 4px;font-size:10px;line-height:15px;font-weight:700;
  letter-spacing:.05em;text-transform:uppercase;color:#5A7A6F}
@S@.xms-chips{margin-bottom:16px}
@S@.xms-ta{line-height:0;padding-bottom:7px}
${controlReset()}
${boxedControls({ border: '#B8D9CF', focus: '#1B8C6E', text: '#1A2E26', ph: '#5A7A6F',
  bg: '#F4FAF8', radius: 8, padY: 8, padX: 12, size: 14, line: 20 })}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #B8D9CF!important;border-radius:8px!important;background:#F4FAF8!important;
  padding:12px!important;min-height:86px!important;height:86px!important;resize:none!important;
  margin-bottom:16px!important;color:#1A2E26!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;box-shadow:none!important}

/* programme cards carry a RADIO MARKER in the mock ---------------------- */
@S@.mf-option-group--cards{display:flex!important;flex-direction:column!important;gap:8px!important}
@S@.mf-option-group--cards .mf-option-ui{display:flex;align-items:center;gap:12px;width:100%;
  box-sizing:border-box;min-height:64px!important;padding:8px 16px;border:2px solid #B8D9CF;border-radius:12px;
  background:transparent;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--cards .mf-option-ui::before{content:'';flex:0 0 16px;width:16px;height:16px;
  border:2px solid #B8D9CF;border-radius:999px;box-sizing:border-box}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui::before,
@S@.mf-option-group--cards input:checked+.mf-option-ui::before{border-color:#1B8C6E;
  background:radial-gradient(circle,#1B8C6E 0 4px,transparent 4px)}
@S@.mf-option-group--cards .mf-option-label{font-size:13px;line-height:20px;font-weight:700;
  color:#1A2E26}
@S@.mf-option-group--cards .mf-option-copy{display:block;width:auto}
@S@.mf-option-group--cards .mf-option-desc{display:block;width:auto;font-size:11px;line-height:16px;
  font-weight:400;color:#5A7A6F}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--cards input:checked+.mf-option-ui{border-color:#1B8C6E;background:#D4EDE7}

/* interest pills --------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:6px}
@S@.xms-chips .mf-option-item:nth-child(n+3):nth-child(-n+6){position:relative;left:-4px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:4px 12px;
  border:1px solid #B8D9CF;border-radius:9999px;background:transparent;color:#5A7A6F;font-size:12px;
  line-height:16px;font-weight:600;text-align:center;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;font-weight:600;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#1B8C6E;border-color:#1B8C6E;
  color:#fff}

/* consent, CTA, close strip, back link ---------------------------------- */
@S@.xms-consent{display:flex;flex-direction:column;gap:12px;margin-bottom:24px}
@S@.xms-consent .mf-option-group--list{display:flex;flex-direction:column;gap:12px}
@S@.xms-consent .mf-option-item{display:flex;align-items:flex-start;gap:12px}
@S@.xms-consent .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.xms-consent .mf-option-label{font-size:12px;line-height:16px;font-weight:400;color:#5A7A6F}
@S@.xms-consent .mf-option-label{display:inline-block;transform:scaleX(.96);transform-origin:left top}
@S@.xms-consent input[type="checkbox"]{width:20px!important;height:20px!important;
  flex:0 0 20px!important;margin:2px 0 0!important;border:2px solid #B8D9CF!important;
  border-radius:4px!important}
@S@button.xms-submit[type="submit"]{display:block;width:100%!important;padding:14px 0!important;
  border:0!important;border-radius:12px!important;background:#1B8C6E!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:900!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  cursor:pointer!important;box-shadow:none!important}
/* the mock greys the CTA until firstName, email, programme and terms are set - measured #B8D9CF */
@S@button.xms-submit.mf-nav-blocked,@S@button.xms-submit[disabled]{opacity:1!important;
  background:#B8D9CF!important;cursor:not-allowed!important;filter:none!important}
@S@.xms-close{height:16px;border-radius:0 0 16px 16px;background:#fff;
  border-left:1px solid #B8D9CF;border-right:1px solid #B8D9CF;border-bottom:1px solid #B8D9CF;
  box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}
@S@.xms-back{margin-top:24px;text-align:center}
@S@.xms-back-link{display:inline-flex;align-items:center;gap:8px;font-size:14px;line-height:20px;
  font-weight:500;color:#5A7A6F}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// product-order — mock: app/forms/product-order/page.tsx
//
//   page    slate-50 → slate-100 wash, py-12 px-4, max-w-6xl (1152px)
//   back    its own row above the grid, 32px clear
//   grid    grid-cols-3 gap-6 — the form card spans 2 tracks (760px), the Order Summary is a
//           SEPARATE sticky card in track 3 (368px)
//   form    white rounded-2xl, 1px #E2E8F0, p-8; three sections 32px apart, the 2nd and 3rd
//           opened by a 1px top rule with 24px above the heading
//   fields  NO LABELS ANYWHERE — every control carries only a placeholder
//   items   one line: a flex-1 product select, an 80px quantity, a delete button
//   cta     44px rose #EC003F, radius 8, 24px above
//
// The mock seeds ONE item as { product:'Pro Plan', quantity:1, price:99 } while the <select>'s
// options are keyed 'Starter'/'Pro'/'Enterprise' — so the select renders EMPTY and the summary
// still reads "Pro Plan x1 / $99.00 / $9.90 / $108.90". That exact rendered state is reproduced.
// ─────────────────────────────────────────────────────────────────────────────
const PDO = {
  slug: 'product-order-live-total',
  title: 'Create Order',
  description:
    'Two-column order form: a white card with personal, shipping and line-item sections beside a '
    + 'sticky Order Summary that totals subtotal, 10% tax and grand total live. Every control is '
    + 'placeholder-only, as in the product-order mock it is transcribed from.',
  category: 'commerce',
  categories: ['commerce', 'premium', 'order'],
  icon: 'shopping-cart',
  prefix: 'pdo',
  outerBorder: {},
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  submitLabel: 'Place Order',
  successTitle: 'Order placed',
  successMessage: 'Order received. A confirmation is on its way.',
  successBody: 'Thank you, {{field:first_name}}. We sent the confirmation to {{field:email}}.',
  palette: {
    primary: '#EC003F', accent: '#EC003F', surface: '#FFFFFF', text: '#0F172B',
    muted: '#45556C', border: '#E2E8F0', onPrimary: '#FFFFFF', deco: '#EC003F', page: '#F8FAFC',
  },

  exactFields: [
    field('first_name', 'Text', 'First Name', { required: true, placeholder: 'First Name' }),
    field('last_name', 'Text', 'Last Name', { required: true, placeholder: 'Last Name' }),
    field('email', 'Email', 'Email', { required: true, placeholder: 'Email' }),
    field('phone', 'Text', 'Phone', { placeholder: 'Phone' }),
    field('company', 'Text', 'Company', { placeholder: 'Company (optional)' }),
    field('address', 'Text', 'Street Address', { required: true, placeholder: 'Street Address' }),
    field('city', 'Text', 'City', { required: true, placeholder: 'City' }),
    field('state', 'Text', 'State', { placeholder: 'State' }),
    field('zip', 'Text', 'ZIP Code', { required: true, placeholder: 'ZIP Code' }),
    choiceField('country', 'Select', 'Country', [
      { label: 'United States', value: 'us' },
      { label: 'Canada', value: 'ca' },
      { label: 'United Kingdom', value: 'uk' },
    ], 'dropdown', null, { required: true, placeholder: 'Select Country' }),
    choiceField('item_product', 'Select', 'Product', [
      { label: 'Starter Plan - $29', value: 'Starter' },
      { label: 'Pro Plan - $99', value: 'Pro' },
      { label: 'Enterprise - Custom', value: 'Enterprise' },
    ], 'dropdown', null, { placeholder: 'Select product' }),
    field('item_qty', 'Number', 'Quantity', { defaultValue: '1' }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const sumRow = (label, echo) => `<div class='${p}-sum-r'><span class='${p}-sum-l'>${label}</span>`
      + `<span class='${p}-sum-v' data-mf-echo='${echo}'>$0.00</span></div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-grid'>`

      + `<div class='${p}-main'><div class='${p}-card'>`
      + `<h1 class='${p}-h1'>Create Order</h1>`
      + `<p class='${p}-lede'>Fill in your details and select products to order</p>`
      + `<div class='${p}-form'>`
      + `<div class='${p}-sec'><h3 class='${p}-h3'>Personal Information</h3>`
      + `<div class='${p}-grid2'>`
      + `<div class='${p}-cell'>{{field:first_name}}</div>`
      + `<div class='${p}-cell'>{{field:last_name}}</div>`
      + `<div class='${p}-cell ${p}-span2'>{{field:email}}</div>`
      + `<div class='${p}-cell ${p}-span2'>{{field:phone}}</div>`
      + `</div></div>`
      + `<div class='${p}-sec ${p}-sec-top'><h3 class='${p}-h3'>Shipping Address</h3>`
      + `<div class='${p}-stack'>`
      + `<div class='${p}-cell'>{{field:company}}</div>`
      + `<div class='${p}-cell'>{{field:address}}</div>`
      + `<div class='${p}-grid2b'>`
      + `<div class='${p}-cell'>{{field:city}}</div><div class='${p}-cell'>{{field:state}}</div>`
      + `<div class='${p}-cell'>{{field:zip}}</div><div class='${p}-cell'>{{field:country}}</div>`
      + `</div></div></div>`
      + `<div class='${p}-sec ${p}-sec-top'>`
      + `<div class='${p}-items-h'><h3 class='${p}-h3 ${p}-h3-flush'>Order Items</h3>`
      + `<span class='${p}-add'><i class='fa fa-plus'></i>Add Item</span></div>`
      + `<div class='${p}-row'>`
      + `<div class='${p}-row-prod'>{{field:item_product}}</div>`
      + `<div class='${p}-row-qty'>{{field:item_qty}}</div>`
      + `<span class='${p}-del'><i class='fa fa-trash-o'></i></span>`
      + `</div></div>`
      + `{{script:order_total}}`
      + `<button class='${p}-submit' type='submit'>Place Order</button>`
      + `</div></div></div>`

      + `<div class='${p}-side'><div class='${p}-sum'>`
      + `<h3 class='${p}-h3'>Order Summary</h3>`
      + `<div class='${p}-sum-lines'><div class='${p}-sum-line'>`
      + `<span class='${p}-sum-l' data-mf-echo='line_name'>Product x1</span>`
      + `<span class='${p}-sum-n' data-mf-echo='line_amt'>$0.00</span></div></div>`
      + `<div class='${p}-sum-tot'>`
      + sumRow('Subtotal', 'subtotal')
      + sumRow('Tax (10%)', 'tax')
      + `<div class='${p}-sum-g'><span class='${p}-sum-gl'>Total</span>`
      + `<span class='${p}-sum-gv' data-mf-echo='total'>$0.00</span></div>`
      + `</div></div></div>`

      + `</div></div></div></div>`;
  },

  // The mock's seeded row is Pro Plan / 1 / 99 even though the select shows nothing, because its
  // option VALUES are 'Starter'/'Pro'/'Enterprise' and the state holds the display name.
  customScripts: {
    order_total: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var PRICE = { Starter: 29, Pro: 99, Enterprise: 0 };
  var NAME  = { Starter: 'Starter Plan', Pro: 'Pro Plan', Enterprise: 'Enterprise' };
  function el(k){ return scope.querySelector('[name="' + k + '"]'); }
  function echo(k, v){ var n = scope.querySelector('[data-mf-echo="' + k + '"]'); if (n) n.textContent = v; }
  function money(n){ return '$' + (Math.round((n || 0) * 100) / 100).toFixed(2); }
  function paint(){
    var sel = el('item_product');
    var key = sel ? String(sel.value || '') : '';
    // Nothing chosen yet is the mock's own initial state: Pro Plan at 99.
    var name  = key ? (NAME[key] || key) : 'Pro Plan';
    var price = key ? (PRICE[key] || 0)  : 99;
    var q = el('item_qty');
    var qty = Math.max(1, parseInt((q && q.value) || '1', 10) || 1);
    var sub = price * qty;
    var tax = sub * 0.1;
    echo('line_name', name + ' x' + qty);
    echo('line_amt', money(sub));
    echo('subtotal', money(sub));
    echo('tax', money(tax));
    echo('total', money(sub + tax));
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  paint();
})();`,
  },

  exactCss: `
@S@{font-family:${INTER}!important;color:#0F172B}
@S@.pdo-page{padding:48px 16px;
  background:linear-gradient(to bottom right,#F8FAFC 0%,#F1F5F9 100%)}
@S@.pdo-shell{max-width:1152px;margin:0 auto}
@S@.pdo-back{line-height:0}
/* mb-8 sits on the LINK in the mock, not on a wrapper row. */
@S@.pdo-back-link{display:inline-flex;align-items:center;gap:8px;margin-bottom:32px;font-size:16px;
  line-height:24px;font-weight:400;color:#45556C}
@S@.pdo-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;align-items:start}
@S@.pdo-main{grid-column:span 2}
@S@.pdo-card{padding:32px;border:1px solid #E2E8F0;border-radius:16px;background:#fff;
  box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}
@S@h1.pdo-h1{margin:0 0 8px!important;font-size:30px!important;line-height:36px!important;
  font-weight:700!important;color:#0F172B!important}
@S@p.pdo-lede{margin:0 0 32px!important;font-size:16px!important;line-height:24px!important;
  font-weight:400!important;color:#45556C!important}
@S@.pdo-form{display:flex;flex-direction:column;gap:32px}
@S@.pdo-sec-top{padding-top:24px;border-top:1px solid #E2E8F0}
@S@h3.pdo-h3{margin:0 0 16px!important;font-size:18px!important;line-height:28px!important;
  font-weight:600!important;color:#0F172B!important}
@S@h3.pdo-h3-flush{margin:0!important}
@S@.pdo-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@S@.pdo-span2{grid-column:1/-1}
@S@.pdo-stack{display:block}
/* measured on the mock: the 12px sits on the INPUT, not on a wrapper. */
@S@.pdo-stack>.pdo-cell .mf-input[class]{margin-bottom:12px!important}
@S@.pdo-grid2b{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@S@.pdo-cell{display:block}
${controlReset()}
/* No labels anywhere in this mock - the renderer's own label must go. */
${boxedControls({ border: '#CAD5E2', focus: '#EC003F', text: '#0F172B', ph: '#45556C',
  bg: '#FFFFFF', radius: 8, padY: 12, padX: 16, size: 16, line: 24, greyEmpty: false })}

/* order-items row -------------------------------------------------------- */
@S@.pdo-items-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
@S@.pdo-add{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:32px;
  padding:0 12px;border:1px solid #D2D8DD;border-radius:6px;background:#fff;font-size:14px;
  line-height:20px;font-weight:500;text-align:center;color:rgb(8,12,15);cursor:pointer}
@S@.pdo-row{display:flex;gap:12px;align-items:flex-start}
@S@.pdo-row-prod{flex:1 1 auto;min-width:0}
@S@.pdo-row-qty{flex:0 0 80px;width:80px}
@S@.pdo-row .mf-input[class],@S@.pdo-row .mf-select[class]{border-radius:4px!important;
  padding:8px 12px!important;font-size:14px!important;line-height:20px!important}
@S@.pdo-del{display:flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;
  height:32px;box-sizing:border-box;padding:8px;border-radius:6px;color:#E7000B;font-size:16px;
  line-height:16px;cursor:pointer}

/* CTA -------------------------------------------------------------------- */
@S@button.pdo-submit[type="submit"]{display:flex;align-items:center;justify-content:center;
  gap:8px;width:100%!important;height:44px!important;margin-top:24px!important;
  padding:8px 16px!important;
  border:0!important;border-radius:8px!important;background:#EC003F!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:500!important;letter-spacing:normal!important;text-transform:none!important;
  cursor:pointer!important;box-shadow:none!important}
/* the mock never gates this button */
@S@button.pdo-submit.mf-nav-blocked,@S@button.pdo-submit[disabled]{opacity:1!important;
  background:#EC003F!important;cursor:not-allowed!important;filter:none!important}

/* sticky order summary --------------------------------------------------- */
@S@.pdo-side{position:relative}
@S@.pdo-sum{position:sticky;top:16px;padding:24px;border:1px solid #E2E8F0;border-radius:12px;
  background:#fff}
@S@.pdo-sum-lines{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
@S@.pdo-sum-line{display:flex;justify-content:space-between;font-size:14px;line-height:20px}
@S@.pdo-sum-l{font-size:14px;line-height:20px;font-weight:400;color:#45556C}
@S@.pdo-sum-n{font-size:14px;line-height:20px;font-weight:500;color:#0F172B}
@S@.pdo-sum-tot{display:flex;flex-direction:column;gap:8px;padding-top:16px;
  border-top:1px solid #E2E8F0}
@S@.pdo-sum-r{display:flex;justify-content:space-between}
@S@.pdo-sum-v{font-size:14px;line-height:20px;font-weight:400;color:#0F172B}
@S@.pdo-sum-g{display:flex;justify-content:space-between;padding-top:8px;
  border-top:1px solid #E2E8F0}
@S@.pdo-sum-gl{font-size:18px;line-height:28px;font-weight:700;color:#0F172B}
@S@.pdo-sum-gv{font-size:18px;line-height:28px;font-weight:700;color:#EC003F}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// hotel-booking — mock: app/forms/hotel-booking/page.tsx
//
//   hero    full-bleed photo 288px with a top-to-bottom scrim, copy pinned bottom-left, a
//           gold rating pill top-right
//   page    #FDF8F0, max-w-4xl (896px), px-8 py-10, grid gap-8 [1fr 300px]
//   left    six sections 40px apart, each opened by a 28px gold icon tile + 20px serif heading
//           over a 1px rule; underline-only controls; three STACKED room cards with a price
//           column and an occupancy bar; amenity pills; a bordered consent panel; gradient CTA
//   right   sticky 300px column of three panels: Booking Summary (burgundy header), Room
//           Popularity (three meters + Positive Reviews), Included (3x2 icon tiles)
// ─────────────────────────────────────────────────────────────────────────────
const LGN_SLUG = 'lagoon-reserve-booking';

const roomName = (name, size) => `${name}<span class='lgn-size'>${size}</span>`;
const roomDesc = (desc, price, pct, delta) =>
  `${desc}`
  + `<span class='lgn-price'><span class='lgn-amt'>${price}</span>`
  + `<span class='lgn-per'>/night</span></span>`
  + `<span class='lgn-occ'><span class='lgn-occ-l'>Occupancy</span>`
  + `<span class='lgn-bar'><span class='lgn-bar-f lgn-bar-${pct}'></span></span>`
  + `<span class='lgn-pct'>${pct}%</span><span class='lgn-delta'>${delta}</span></span>`;

const LGN = {
  slug: LGN_SLUG,
  title: 'Reserve Your Perfect Stay',
  description:
    'Hotel reservation: a photographic hero with a rating pill, six sections of underlined fields, '
    + 'three stacked room cards with price and occupancy meters, amenity pills and a sticky sidebar '
    + 'carrying the booking summary, room popularity and what is included. Transcribed from the '
    + 'hotel-booking mock.',
  category: 'booking',
  categories: ['booking', 'premium', 'hospitality'],
  icon: 'bed',
  prefix: 'lgn',
  outerBorder: {},
  fontStack: DMSANS,
  fontImport:
    `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700`
    + `&family=Cormorant+Garamond:wght@400;500;600;700&display=swap');`,
  submitLabel: 'Confirm Reservation',
  successTitle: 'Reservation Confirmed',
  successMessage: 'Reservation received. A confirmation is on its way.',
  successBody: 'Thank you, {{field:first_name}}. We sent the confirmation to {{field:email}}.',
  palette: {
    primary: '#C8962C', accent: '#6B1E2E', surface: '#FFFFFF', text: '#1C1C1C',
    muted: '#9A8C7E', border: '#EDE8E0', onPrimary: '#FFFFFF', deco: '#F0D898', page: '#FDF8F0',
  },

  exactFields: [
    field('first_name', 'Text', 'First name *', { required: true, placeholder: 'Eleanor' }),
    field('last_name', 'Text', 'Last name *', { required: true, placeholder: 'Hartley' }),
    field('email', 'Email', 'Email *', { required: true, placeholder: 'eleanor@email.com' }),
    field('phone', 'Text', 'Phone', { placeholder: '+1 212 555 0100' }),
    field('birth_year', 'Text', 'Year of birth', { placeholder: '1990' }),
    choiceField('country', 'Select', 'Country *', [
      'Germany', 'France', 'Spain', 'Italy', 'Portugal',
      'Netherlands', 'Austria', 'Belgium', 'Greece', 'Poland', 'Other',
    ], 'dropdown', null, { required: true, placeholder: 'Select country' }),
    field('check_in', 'Date', 'Check-in date *', { required: true, placeholder: 'mm/dd/yyyy' }),
    field('check_out', 'Date', 'Check-out date *', { required: true, placeholder: 'mm/dd/yyyy' }),
    choiceField('guests', 'Select', 'Number of guests',
      ['1 guest', '2 guests', '3 guests', '4 guests', '5 guests', '6 guests'],
      'dropdown', null, { defaultValue: '2 guests' }),
    choiceField('start_month', 'Select', 'Preferred start month', [
      'January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026',
      'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026',
    ], 'dropdown', null, { placeholder: 'Select month' }),
    choiceField('room_type', 'Radio', 'Room', [
      { label: roomName('Standard Room', '28 m²'), value: 'standard', icon: 'fa-bed',
        description: roomDesc('Single room with double bed and city view.', '$180', 82, '+2.5%') },
      { label: roomName('Family Suite', '54 m²'), value: 'family', icon: 'fa-users',
        description: roomDesc('Two-bedroom room featuring a parlor and kitchenette.', '$320', 75, '+1.2%') },
      { label: roomName('Royal Suite', '96 m²'), value: 'royal', icon: 'fa-star',
        description: roomDesc('Highly spacious with private dining and butler service.', '$1,200', 68, '+0.8%') },
    ], 'cards', 1, { required: true }),
    choiceField('interests', 'Checkbox', 'Preferred Amenities', [
      'Complimentary Wi-Fi', 'Airport Transfer', 'Room Service',
      'Spa Access', 'Fine Dining', 'Pool & Gym',
    ], 'chips'),
    choiceField('programme', 'Select', 'Programme track', [
      { label: 'Erasmus Exchange', value: 'erasmus' },
      { label: 'Language Immersion', value: 'language' },
      { label: 'Solidarity Corps', value: 'volunteer' },
    ], 'dropdown', null, { placeholder: 'Select programme' }),
    choiceField('duration', 'Select', 'Duration',
      ['1 month', '3 months', '6 months', '12 months'], 'dropdown', null, { defaultValue: '3 months' }),
    choiceField('language_level', 'Select', 'Language level', [
      'A1 — Beginner', 'A2 — Elementary', 'B1 — Intermediate',
      'B2 — Upper-int.', 'C1 — Advanced', 'C2 — Fluent',
    ], 'dropdown', null, { placeholder: 'Select level' }),
    field('requests', 'Textarea', 'Notes for the concierge (optional)', {
      placeholder: 'Early check-in, dietary requirements, room preferences...',
    }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [
      { label: 'Send me exclusive offers and seasonal packages.', value: 'yes' },
    ], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [
      { label: 'I accept the <span class="lgn-link">booking terms &amp; cancellation policy</span>. *', value: 'yes' },
    ], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const head = (icon, label) => `<div class='${p}-sec-h'>`
      + `<span class='${p}-sec-i'><i class='fa ${icon}'></i></span>`
      + `<h2 class='${p}-sec-t'>${label}</h2></div>`;
    const fld = (label, key, extra = '') => `<label class='${p}-field${extra}'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const pop = (name, pct) => `<div class='${p}-pop'>`
      + `<div class='${p}-pop-r'><span class='${p}-pop-n'>${name}</span>`
      + `<span class='${p}-pop-p'>${pct}%</span></div>`
      + `<div class='${p}-pop-bar'><span class='${p}-pop-f ${p}-bar-${pct}'></span></div></div>`;
    const inc = (icon, label) => `<div class='${p}-inc'><i class='fa ${icon}'></i>`
      + `<span class='${p}-inc-l'>${label}</span></div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'>`
      + `<div class='${p}-hero'>`
      + `<img class='${p}-content-image' src='{{content:hero_image}}' alt='' aria-hidden='true'>`
      + `<div class='${p}-hero-scrim' role='presentation'></div>`
      + `<div class='${p}-rating'><i class='fa fa-star'></i>4.9 · 2,457 reviews</div>`
      + `<div class='${p}-hero-copy'>`
      + `<p class='${p}-hero-eyebrow'>Convenience &amp; Luxury</p>`
      + `<h1 class='${p}-hero-h'>Reserve Your Perfect Stay</h1></div></div>`

      + `<div class='${p}-shell'><div class='${p}-grid'>`
      + `<div class='${p}-left'>`
      + `<div class='${p}-sec'>${head('fa-users', 'Guest Details')}`
      + `<div class='${p}-grid2'>`
      + fld('First name *', 'first_name') + fld('Last name *', 'last_name')
      + fld('Email *', 'email') + fld('Phone', 'phone')
      + fld('Year of birth', 'birth_year') + fld('Country *', 'country')
      + `</div></div>`
      + `<div class='${p}-sec'>${head('fa-bed', 'Stay Details')}`
      + `<div class='${p}-grid2'>`
      + fld('Check-in date *', 'check_in') + fld('Check-out date *', 'check_out')
      + fld('Number of guests', 'guests') + fld('Preferred start month', 'start_month')
      + `</div></div>`
      + `<div class='${p}-sec'>${head('fa-star', 'Choose Your Room')}`
      + `<div class='${p}-rooms'>{{field:room_type}}</div></div>`
      + `<div class='${p}-sec'>${head('fa-cutlery', 'Preferred Amenities')}`
      + `<div class='${p}-chips'>{{field:interests}}</div></div>`
      + `<div class='${p}-sec'>${head('fa-map-marker', 'Programme &amp; Language')}`
      + `<div class='${p}-grid2'>`
      + fld('Programme track', 'programme') + fld('Duration', 'duration')
      + fld('Language level', 'language_level', ` ${p}-span2`)
      + `</div></div>`
      + `<div class='${p}-sec'>${head('fa-wifi', 'Special Requests')}`
      + `<div class='${p}-ta'>`
      + fld('Notes for the concierge (optional)', 'requests')
      + `</div></div>`
      + `<div class='${p}-terms'>{{field:newsletter}}{{field:terms}}</div>`
      + `<button class='${p}-submit' type='submit'>Confirm Reservation</button>`
      + `</div>`

      + `<aside class='${p}-side'><div class='${p}-side-in'>`
      + `<div class='${p}-panel'><div class='${p}-panel-h'>Booking Summary</div>`
      + `<div class='${p}-panel-empty' data-mf-echo='summary'>No room selected yet</div></div>`
      + `<div class='${p}-panel2'><p class='${p}-cap'>Room Popularity</p>`
      + pop('Standard Room', 82) + pop('Family Suite', 75) + pop('Royal Suite', 68)
      + `<div class='${p}-pos'><span class='${p}-pos-l'>Positive Reviews</span>`
      + `<span class='${p}-pos-v'>92%</span></div></div>`
      + `<div class='${p}-panel3'><p class='${p}-cap ${p}-cap-mb'>Included</p>`
      + `<div class='${p}-inc-grid'>`
      + inc('fa-wifi', 'Wi-Fi') + inc('fa-cutlery', 'Dining') + inc('fa-tint', 'Spa')
      + inc('fa-car', 'Parking') + inc('fa-star', 'Butler') + inc('fa-bed', 'Turndown')
      + `</div></div>`
      + `{{script:booking_summary}}`
      + `</div></aside>`
      + `</div></div></div></div>`;
  },

  // The mock swaps the summary panel from "No room selected yet" to the room's name, price and the
  // chosen dates as soon as a room is picked.
  customScripts: {
    booking_summary: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var ROOM = {
    standard: { name: 'Standard Room', price: '$180' },
    family:   { name: 'Family Suite',  price: '$320' },
    royal:    { name: 'Royal Suite',   price: '$1,200' }
  };
  function val(k){
    var els = scope.querySelectorAll('[name="' + k + '"]');
    if (!els.length) return '';
    var f = els[0];
    if (f.type === 'radio' || f.type === 'checkbox') {
      for (var i = 0; i < els.length; i++) if (els[i].checked) return els[i].value;
      return '';
    }
    if (f.tagName === 'SELECT') { var o = f.options[f.selectedIndex]; return o ? o.value : ''; }
    return String(f.value || '');
  }
  function esc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  function row(l, v){ return '<div class="lgn-srow"><span class="lgn-sl">' + esc(l)
    + '</span><span class="lgn-sv">' + esc(v) + '</span></div>'; }
  function paint(){
    var host = scope.querySelector('[data-mf-echo="summary"]');
    if (!host) return;
    var r = ROOM[val('room_type')];
    if (!r) {
      host.className = 'lgn-panel-empty';
      host.textContent = 'No room selected yet';
      return;
    }
    var ci = val('check_in'), co = val('check_out'), g = val('guests');
    host.className = 'lgn-panel-body';
    host.innerHTML = '<div class="lgn-shead"><span class="lgn-sname">' + esc(r.name)
      + '</span><span class="lgn-sprice">' + esc(r.price) + '<span class="lgn-sper">/night</span></span></div>'
      + '<div class="lgn-shr"></div>'
      + (ci ? row('Check-in', ci) : '') + (co ? row('Check-out', co) : '') + (g ? row('Guests', g) : '');
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  paint();
})();`,
  },

  exactCss: `
@S@{container-type:inline-size;font-family:${DMSANS}!important;color:#1C1C1C}
@S@.lgn-page{background:#FDF8F0}

/* hero ------------------------------------------------------------------- */
@S@.lgn-hero{position:relative;overflow:hidden;height:288px;
  background-image:${asset(LGN_SLUG, 'hotel-room-hero.png')};
  background-size:cover;background-position:50% 50%}
@S@img.lgn-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 50%!important;
  border:0!important;border-radius:0!important;pointer-events:none!important}
@S@.lgn-hero-scrim{position:absolute;inset:0;
  background:linear-gradient(to bottom,rgba(28,28,28,.15),rgba(107,30,46,.75))}
@S@.lgn-hero-copy{position:absolute;left:0;right:0;bottom:0;padding:0 48px 28px}
@S@p.lgn-hero-eyebrow{margin:0!important;font-size:12px!important;line-height:16px!important;
  font-weight:600!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  color:#F0D898!important}
@S@h1.lgn-hero-h{margin:0!important;font-family:${CORMORANT}!important;font-size:36px!important;
  line-height:1.25!important;font-weight:600!important;color:#fff!important}
@S@.lgn-rating{position:absolute;top:20px;right:20px;display:inline-flex;align-items:center;gap:6px;
  padding:6px 12px;border-radius:999px;background:rgba(200,150,44,.9);color:#fff;font-size:12px;
  line-height:16px;font-weight:600}
@S@.lgn-rating i{font-size:14px;line-height:14px}

/* page grid -------------------------------------------------------------- */
@S@.lgn-shell{max-width:896px;margin:0 auto;padding:40px 16px}
@container (min-width:640px){@S@.lgn-shell{padding:40px 32px}}
@S@.lgn-grid{display:grid;grid-template-columns:1fr;gap:32px;align-items:start}
/* The mock switches to two columns at the lg VIEWPORT, where its card is 896px - so 896 is the
   width at which this design actually has room for 1fr + 300px, and a container query is on the
   PANE. At 1024 the sidebar vanished in every pane between 896 and 1024, including the harness's
   normalised one, which read as 12 lines of missing copy. */
@container (min-width:896px){@S@.lgn-grid{grid-template-columns:1fr 300px}}
@S@.lgn-left{display:flex;flex-direction:column;gap:40px}
@S@.lgn-sec-h{display:flex;align-items:center;gap:10px;padding-bottom:10px;
  border-bottom:1px solid #EDE8E0}
@S@.lgn-sec-i{display:flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;
  height:28px;border-radius:8px;background:#C8962C;color:#fff;font-size:16px;line-height:16px}
@S@h2.lgn-sec-t{margin:0!important;font-family:${CORMORANT}!important;font-size:20px!important;
  line-height:28px!important;font-weight:600!important;letter-spacing:.025em!important;
  color:#1C1C1C!important}
@S@.lgn-grid2{display:grid;grid-template-columns:1fr 1fr;column-gap:24px;row-gap:20px;
  margin-top:20px}
@S@.lgn-span2{grid-column:1/-1}
@S@.lgn-field{display:block;margin:0}
@container (max-width:520px){
  @S@.lgn-grid2{width:calc(100% - 16px)}
  @S@.lgn-ta{width:calc(100% - 16px)!important}
  @S@.lgn-grid2>*,@S@.lgn-field,@S@.lgn-field .mf-field-group,@S@.lgn-field .mf-cal{
    min-width:0;max-width:100%;box-sizing:border-box}
}
@S@.lgn-label{display:block;margin:0 0 4px;font-size:11px;line-height:16px;font-weight:600;
  letter-spacing:.1em;text-transform:uppercase;color:#9A8C7E}
@S@.lgn-rooms{margin-top:12px}
@S@.lgn-chips{margin-top:16px}
@S@.lgn-ta{margin-top:16px}
${controlReset()}
${underlineControls({ border: '#EDE8E0', focus: '#C8962C', text: '#1C1C1C', ph: '#9A8C7E',
  size: 15, line: 24, pad: 10, greyEmpty: false })}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;border:0!important;
  border-bottom:2px solid #EDE8E0!important;border-radius:0!important;background:transparent!important;
  padding:10px 0!important;min-height:112px!important;height:112px!important;resize:none!important;
  color:#1C1C1C!important;font-family:inherit!important;font-size:15px!important;
  line-height:24px!important;box-shadow:none!important}

/* room cards ------------------------------------------------------------- */
@S@.mf-option-group--cards{display:flex!important;flex-direction:column!important;gap:12px!important}
@S@.mf-option-group--cards .mf-option-ui{position:relative;display:flex;align-items:flex-start;
  gap:16px;width:100%;box-sizing:border-box;padding:16px 16px 47px;border:2px solid #EDE8E0;
  border-radius:16px;background:#fff;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--cards .mf-option-icon{display:flex!important;align-items:center!important;
  justify-content:center!important;flex:0 0 48px!important;width:48px!important;height:48px!important;
  margin:0!important;padding:0!important;border:0!important;border-radius:12px!important;
  background:#FDF8F0!important;color:#C8962C!important;font-size:20px!important;
  line-height:20px!important}
@S@.mf-option-group--cards .mf-option-copy{display:block;flex:1 1 auto;min-width:0;
  padding-right:65px}
@S@.mf-option-group--cards .mf-option-item:nth-child(2) .mf-option-copy{padding-right:69px}
@S@.mf-option-group--cards .mf-option-item:nth-child(3) .mf-option-copy{padding-right:82px}
@S@.mf-option-group--cards .mf-option-label{display:flex;align-items:center;
  justify-content:space-between;font-size:15px;line-height:24px;font-weight:600;color:#1C1C1C}
@S@.mf-option-group--cards .mf-option-desc{display:block;margin-top:2px;font-size:14px;
  line-height:20px;font-weight:400;color:#9A8C7E}
@S@.lgn-size{padding:2px 8px;border-radius:999px;background:#FDF8F0;color:#9A8C7E;font-size:12px;
  line-height:16px;font-weight:600}
@S@.lgn-price{position:absolute;top:16px;right:16px;text-align:right}
@S@.mf-option-group--cards .mf-option-item:nth-child(n+2) .lgn-price{top:26px}
@S@.lgn-amt{display:block;font-size:18px;line-height:28px;font-weight:700;color:#C8962C}
@S@.lgn-per{display:block;font-size:12px;line-height:16px;font-weight:400;color:#9A8C7E}
@S@.lgn-occ{position:absolute;left:16px;right:16px;bottom:12px;display:flex;align-items:center;
  gap:12px}
@S@.lgn-occ-l{font-size:11px;line-height:16px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;color:#9A8C7E}
@S@.lgn-bar{flex:1 1 auto;height:6px;border-radius:999px;overflow:hidden;background:#EDE8E0}
@S@.lgn-bar-f{display:block;height:100%;border-radius:999px;background:#9A8C7E}
@S@.lgn-bar-82{width:82%}
@S@.lgn-bar-75{width:75%}
@S@.lgn-bar-68{width:68%}
@S@.lgn-pct{font-size:14px;line-height:20px;font-weight:700;color:#1C1C1C}
@S@.lgn-delta{font-size:12px;line-height:16px;color:#9A8C7E}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--cards input:checked+.mf-option-ui{border-color:#C8962C;background:#FEF9EE}

/* amenity pills ---------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 16px;
  border:1px solid #EDE8E0;border-radius:9999px;background:#fff;color:#9A8C7E;font-size:14px;
  line-height:20px;font-weight:500;text-align:center;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:14px;line-height:20px;font-weight:500;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#C8962C;border-color:#C8962C;
  color:#fff}

/* consent panel + CTA ---------------------------------------------------- */
@S@.lgn-terms{display:flex;flex-direction:column;gap:12px;padding:20px;border:1px solid #EDE8E0;
  border-radius:16px;background:#fff}
@S@.lgn-terms .mf-option-group--list{display:flex;flex-direction:column;gap:12px}
@S@.lgn-terms .mf-option-item{display:flex;align-items:flex-start;gap:12px}
@S@.lgn-terms .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.lgn-terms .mf-option-label{font-size:14px;line-height:20px;font-weight:400;color:#9A8C7E}
/* the SECOND consent row is charcoal in the mock; each field renders its own one-item group,
   so the selector has to reach the last FIELD, not the last option. */
@S@.lgn-terms>.mf-field-group:last-child .mf-option-label{color:#1C1C1C}
@S@.lgn-terms input[type="checkbox"]{width:20px!important;height:20px!important;flex:0 0 20px!important;
  margin:2px 0 0!important;border:2px solid #EDE8E0!important;border-radius:4px!important}
@S@.lgn-link{text-decoration:underline;font-weight:600;color:#6B1E2E}
@S@button.lgn-submit[type="submit"]{display:block;width:100%!important;padding:16px 0!important;
  border:0!important;border-radius:16px!important;
  background:linear-gradient(135deg,#6B1E2E 0%,#C8962C 100%)!important;color:#fff!important;
  font-family:inherit!important;font-size:16px!important;line-height:24px!important;
  font-weight:700!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  cursor:pointer!important;box-shadow:none!important}
@S@button.lgn-submit.mf-nav-blocked,@S@button.lgn-submit[disabled]{opacity:1!important;
  background:linear-gradient(135deg,#6B1E2E 0%,#C8962C 100%)!important;
  cursor:not-allowed!important;filter:none!important}
@container (max-width:520px){
  @S@button.lgn-submit[type="submit"]{width:calc(100% - 16px)!important}
}

/* sticky sidebar --------------------------------------------------------- */
@S@.lgn-side{display:none}
@container (min-width:896px){@S@.lgn-side{display:block}}
@S@.lgn-side-in{position:sticky;top:32px;display:flex;flex-direction:column;gap:16px}
@S@.lgn-panel{overflow:hidden;border:1px solid #EDE8E0;border-radius:16px}
@S@.lgn-panel-h{padding:12px 16px;background:#6B1E2E;color:#F0D898;font-size:12px;line-height:16px;
  font-weight:700;letter-spacing:.1em;text-transform:uppercase}
@S@.lgn-panel-empty{padding:24px;text-align:center;font-size:14px;line-height:20px;
  font-weight:400;color:#9A8C7E;background:#FDF8F0}
@S@.lgn-panel-body{display:flex;flex-direction:column;gap:12px;padding:16px;background:#fff}
@S@.lgn-shead{display:flex;align-items:center;justify-content:space-between}
@S@.lgn-sname{font-size:14px;line-height:20px;font-weight:600;color:#1C1C1C}
@S@.lgn-sprice{font-size:14px;line-height:20px;font-weight:700;color:#C8962C}
@S@.lgn-sper{font-size:12px;font-weight:400;color:#9A8C7E}
@S@.lgn-shr{height:1px;background:#EDE8E0}
@S@.lgn-srow{display:flex;align-items:center;justify-content:space-between;font-size:14px;
  line-height:20px}
@S@.lgn-sl{color:#9A8C7E}
@S@.lgn-sv{font-weight:500;color:#1C1C1C}
@S@.lgn-panel2,@S@.lgn-panel3{padding:16px;border:1px solid #EDE8E0;border-radius:16px;
  background:#fff}
/* space-y-3 measures as a bottom margin on each child, not as a flex gap. */
@S@.lgn-panel2{display:block}
@S@.lgn-panel2>*{margin-bottom:12px}
@S@.lgn-panel2>*:last-child{margin-bottom:0}
@S@p.lgn-cap{margin:0 0 12px!important;font-size:11px!important;line-height:16px!important;
  font-weight:700!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  color:#9A8C7E!important}

@S@.lgn-pop-r{display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px;
  line-height:16px}
@S@.lgn-pop-n{color:#1C1C1C}
@S@.lgn-pop-p{font-weight:700;color:#C8962C}
@S@.lgn-pop-bar{height:6px;border-radius:999px;overflow:hidden;background:#EDE8E0}
@S@.lgn-pop-f{display:block;height:100%;border-radius:999px;background:#F0D898}
@S@.lgn-pos{display:flex;align-items:center;justify-content:space-between;padding-top:4px;
  border-top:1px solid #EDE8E0}
@S@.lgn-pos-l{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;color:#C8962C}
@S@.lgn-pos-v{font-size:18px;line-height:28px;font-weight:700;color:#1C1C1C}
@S@.lgn-inc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
@S@.lgn-inc{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 0;
  border-radius:12px;background:#FDF8F0}
@S@.lgn-inc i{font-size:16px;line-height:16px;color:#C8962C}
@S@.lgn-inc-l{font-size:10px;line-height:15px;font-weight:500;color:#9A8C7E}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// job-application — mock: app/forms/job-application/page.tsx
//
//   page    slate-50 → slate-100, py-12 px-4, max-w-4xl (896px)
//   grid    grid-cols-3 gap-6 — a 283px sticky sidebar card left, the 589px form card right
//   side    32px indigo file icon + "Job Application" / "Step 1 of 1", then three 24px badge rows
//   form    white rounded-2xl p-8; three sections 24px apart, the 2nd and 3rd opened by a rule;
//           14px medium labels with a red asterisk over boxed controls; a 2000-character counter
//   cta     TWO half-width 44px buttons — an outline "Save as Draft" and an indigo "Submit
//           Application"
// ─────────────────────────────────────────────────────────────────────────────
const JBA = {
  slug: 'job-application-northwind',
  title: 'Apply for Position',
  description:
    'Job application: a sticky progress sidebar beside a white form card with contact, position '
    + 'and cover-letter sections, a live character counter and a draft/submit button pair. '
    + 'Transcribed from the job-application mock.',
  category: 'hr',
  categories: ['hr', 'premium', 'recruitment'],
  icon: 'briefcase',
  prefix: 'jba',
  outerBorder: {},
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  submitLabel: 'Submit Application',
  successTitle: 'Application submitted',
  successMessage: 'Application received. We will be in touch.',
  successBody: 'Thank you, {{field:full_name}}. We sent a confirmation to {{field:email}}.',
  palette: {
    primary: '#4F39F6', accent: '#4F39F6', surface: '#FFFFFF', text: '#0F172B',
    muted: '#62748E', border: '#E2E8F0', onPrimary: '#FFFFFF', deco: '#4F39F6', page: '#F8FAFC',
  },

  exactFields: [
    field('full_name', 'Text', 'Full Name', { required: true, placeholder: 'John Doe' }),
    field('phone', 'Text', 'Phone', { required: true, placeholder: '(555) 123-4567' }),
    field('email', 'Email', 'Email', { required: true, placeholder: 'john@example.com' }),
    choiceField('position', 'Select', 'Position', [
      { label: 'Frontend Developer', value: 'frontend' },
      { label: 'Backend Developer', value: 'backend' },
      { label: 'Full Stack Developer', value: 'fullstack' },
      { label: 'UI/UX Designer', value: 'designer' },
    ], 'dropdown', null, { required: true, placeholder: 'Select a position' }),
    choiceField('experience', 'Select', 'Years of Experience', [
      { label: '0-1 years', value: '0-1' }, { label: '1-3 years', value: '1-3' },
      { label: '3-5 years', value: '3-5' }, { label: '5+ years', value: '5+' },
    ], 'dropdown', null, { required: true, placeholder: 'Select experience' }),
    field('salary', 'Text', 'Expected Salary (annual)', { placeholder: '$80,000 - $120,000' }),
    field('start_date', 'Date', 'Available Start Date', { required: true, placeholder: 'mm/dd/yyyy' }),
    field('cover_letter', 'Textarea', 'Cover Letter', {
      placeholder: 'Tell us why you\'re a great fit for this position...',
    }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const step = (tone, badge, label) => `<div class='${p}-step'>`
      + `<span class='${p}-badge ${p}-badge-${tone}'>${badge}</span>`
      + `<span class='${p}-step-l'>${label}</span></div>`;
    const fld = (label, key, req, extra = '') => `<label class='${p}-field${extra}'>`
      + `<span class='${p}-label'>${label}${req ? ` <span class='${p}-req'>*</span>` : ''}</span>`
      + `{{field:${key}}}</label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-grid'>`

      + `<div class='${p}-side'><div class='${p}-side-card'>`
      + `<div class='${p}-side-h'><i class='fa fa-file-text-o ${p}-side-i'></i>`
      + `<span class='${p}-side-t'><span class='${p}-side-n'>Job Application</span>`
      + `<span class='${p}-side-s'>Step 1 of 1</span></span></div>`
      + `<div class='${p}-steps'>`
      + step('on', '&#10003;', 'Personal Info')
      + step('on', '&#10003;', 'Position Details')
      + step('off', '3', 'Cover Letter')
      + `</div></div></div>`

      + `<div class='${p}-main'><div class='${p}-card'>`
      + `<h1 class='${p}-h1'>Apply for Position</h1>`
      + `<p class='${p}-lede'>Complete this form to submit your job application</p>`
      + `<div class='${p}-form'>`
      + `<div class='${p}-sec'><h3 class='${p}-h3'>Contact Information</h3>`
      + `<div class='${p}-grid2'>`
      + fld('Full Name', 'full_name', true) + fld('Phone', 'phone', true)
      + fld('Email', 'email', true, ` ${p}-span2`)
      + `</div></div>`
      + `<div class='${p}-sec ${p}-sec-top'><h3 class='${p}-h3'>Position Details</h3>`
      + `<div class='${p}-grid2'>`
      + fld('Position', 'position', true) + fld('Years of Experience', 'experience', true)
      + fld('Expected Salary (annual)', 'salary', false)
      + fld('Available Start Date', 'start_date', true)
      + `</div></div>`
      + `<div class='${p}-sec ${p}-sec-top'><h3 class='${p}-h3'>Cover Letter</h3>`
      + `<div class='${p}-ta'>{{field:cover_letter}}</div>`
      + `<p class='${p}-count' data-mf-cover-count='1'>0 / 2000 characters</p>`
      + `</div>`
      + `{{script:cover_count}}`
      + `<div class='${p}-cta'>`
      + `<span class='${p}-draft'>Save as Draft</span>`
      + `<button class='${p}-submit' type='submit'>Submit Application</button>`
      + `</div>`
      + `</div></div></div>`

      + `</div></div></div></div>`;
  },

  customScripts: {
    cover_count: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  function paint(){
    var ta = scope.querySelector('[name="cover_letter"]');
    var n = scope.querySelector('[data-mf-cover-count="1"]');
    if (ta && n) n.textContent = String((ta.value || '').length) + ' / 2000 characters';
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  paint();
})();`,
  },

  exactCss: `
@S@{font-family:${INTER}!important;color:#0F172B}
@S@.jba-page{padding:48px 16px;
  background:linear-gradient(to bottom right,#F8FAFC 0%,#F1F5F9 100%)}
@S@.jba-shell{max-width:896px;margin:0 auto}
@S@.jba-back{line-height:0}
@S@.jba-back-link{display:inline-flex;align-items:center;gap:8px;margin-bottom:32px;font-size:16px;
  line-height:24px;font-weight:400;color:#45556C}
@S@.jba-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;align-items:start}
@S@.jba-main{grid-column:span 2}

/* sticky sidebar --------------------------------------------------------- */
@S@.jba-side-card{position:sticky;top:16px;padding:24px;border:1px solid #E2E8F0;
  border-radius:12px;background:#fff}
@S@.jba-side-h{display:flex;align-items:center;gap:12px;margin-bottom:16px}
@S@.jba-side-i{flex:0 0 32px;font-size:32px;line-height:32px;color:#4F39F6}
@S@.jba-side-t{display:flex;flex-direction:column}
@S@.jba-side-n{font-size:16px;line-height:24px;font-weight:700;color:#0F172B}
@S@.jba-side-s{font-size:12px;line-height:16px;font-weight:400;color:#62748E}
@S@.jba-steps{display:flex;flex-direction:column;gap:12px}
@S@.jba-step{display:flex;align-items:center;gap:8px}
@S@.jba-badge{display:flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;
  height:24px;border-radius:999px;font-size:12px;line-height:16px;font-weight:700}
@S@.jba-badge-on{background:#4F39F6;color:#fff}
@S@.jba-badge-off{background:#CAD5E2;color:#314158}
@S@.jba-step-l{font-size:14px;line-height:20px;font-weight:400;color:#314158}

/* form card -------------------------------------------------------------- */
@S@.jba-card{padding:32px;border:1px solid #E2E8F0;border-radius:16px;background:#fff;
  box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}
@S@h1.jba-h1{margin:0 0 8px!important;font-size:30px!important;line-height:36px!important;
  font-weight:700!important;color:#0F172B!important}
@S@p.jba-lede{margin:0 0 32px!important;font-size:16px!important;line-height:24px!important;
  font-weight:400!important;color:#45556C!important}
@S@.jba-form{display:flex;flex-direction:column;gap:24px}
@S@.jba-sec-top{padding-top:24px;border-top:1px solid #E2E8F0}
@S@h3.jba-h3{margin:0 0 16px!important;font-size:18px!important;line-height:28px!important;
  font-weight:600!important;color:#0F172B!important}
@S@.jba-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@S@.jba-span2{grid-column:1/-1}
@S@.jba-field{display:block;margin:0}
@S@.jba-label{display:block;margin:0 0 8px;font-size:14px;line-height:20px;font-weight:500;
  color:#314158}
@S@.jba-req{color:#FB2C36}
@S@p.jba-count{margin:4px 0 0!important;font-size:12px!important;line-height:16px!important;
  font-weight:400!important;color:#62748E!important}
${controlReset()}
${boxedControls({ border: '#CAD5E2', focus: '#4F39F6', text: '#0F172B', ph: '#62748E',
  bg: '#FFFFFF', radius: 8, padY: 12, padX: 16, size: 16, line: 24, greyEmpty: false })}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #CAD5E2!important;border-radius:8px!important;background:#fff!important;
  padding:12px 16px!important;min-height:218px!important;height:218px!important;
  resize:none!important;color:#0F172B!important;font-family:inherit!important;
  font-size:16px!important;line-height:24px!important;box-shadow:none!important}

/* the two half-width buttons -------------------------------------------- */
@S@.jba-cta{display:flex;gap:12px;padding-top:24px}
/* min-width:0 on both, or a flex item still refuses to shrink below its content and the pair
   stops splitting the row evenly. */
@S@.jba-draft{display:flex;align-items:center;justify-content:center;gap:8px;flex:1 1 0;
  min-width:0;height:44px;padding:8px 16px;box-sizing:border-box;border:1px solid #D2D8DD;
  border-radius:6px;background:#fff;text-align:center;font-size:14px;line-height:20px;
  font-weight:500;color:rgb(8,12,15);cursor:pointer}
@S@button.jba-submit[type="submit"]{display:flex;align-items:center;justify-content:center;
  gap:8px;flex:1 1 0;min-width:0;width:auto!important;height:44px!important;
  padding:8px 16px!important;border:0!important;
  border-radius:6px!important;background:#4F39F6!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:500!important;letter-spacing:normal!important;text-transform:none!important;
  cursor:pointer!important;box-shadow:none!important}
/* the mock never gates this button */
@S@button.jba-submit.mf-nav-blocked,@S@button.jba-submit[disabled]{opacity:1!important;
  background:#4F39F6!important;cursor:not-allowed!important;filter:none!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// golden-pro-registration — mock: app/forms/golden-pro-registration/page.tsx
//
// The first WIZARD in this file. `exactFields` bypasses the page-break Sections that buildFields
// inserts for `spec.wizard`, so they are declared by hand here, and the shell emits the rail and
// the pages itself. The contract, exactly:
//   fields   step_1 Section (pageBreak false) → its fields → step_2 Section (pageBreak TRUE) → …
//            each Section: properties { pageBreak, premiumNativeStep, generatedPremiumStep,
//            premiumStepIndex } with premiumStepIndex 1-BASED
//   markup   rail items  [data-mf-native-step='1'][data-step=<0-based>]
//            pages       [data-mf-native-page='1'][data-step=<0-based>] leading with {{field:step_N}}
//            nav         [data-mf-native-back] / [data-mf-native-next] / [data-mf-native-submit]
//   script   {{script:wizard_pages}} mirrors the rail's is-active onto page visibility — the
//            renderer marks the rail but does NOT hide the pages
//
//   layout   1024px block, a white header bar, a 4px olive→gold→olive stripe, then a 256px olive
//            sidebar (agent photo, contacts, VERTICAL stepper) beside a white form column
// ─────────────────────────────────────────────────────────────────────────────
const GPR_SLUG = 'golden-pro-agent-registration';
const GPR_STEPS = [
  { num: '01', label: 'Personal', sub: 'Basic info' },
  { num: '02', label: 'Agency', sub: 'Work details' },
  { num: '03', label: 'Confirm', sub: 'Review & sign' },
];

/** The page-break Section fields a wizard needs, in the order the runtime walks them. */
const stepSections = (steps) => steps.map((st, i) => field(`step_${i + 1}`, 'Section', st.label, {
  properties: {
    pageBreak: i > 0,
    premiumNativeStep: true,
    generatedPremiumStep: true,
    premiumStepIndex: i + 1,
  },
}));

const GPR = {
  slug: GPR_SLUG,
  title: 'Golden Pro — Real Estate Agent Registration',
  description:
    'Three-step agent registration: a white masthead over an olive sidebar carrying the agent '
    + 'photograph, contact block and a vertical stepper, beside a white form column of underlined '
    + 'fields, membership pills and a review panel. Transcribed from the golden-pro-registration mock.',
  category: 'registration',
  categories: ['registration', 'premium', 'realestate'],
  icon: 'star',
  prefix: 'gpr',
  outerBorder: {},
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  wizard: { steps: GPR_STEPS, nextLabel: 'Continue', backLabel: 'Back' },
  submitLabel: 'Submit Registration',
  successTitle: 'Registration received',
  successMessage: 'Registration received. We will be in touch shortly.',
  successBody:
    'Welcome, {{field:first_name}}! Your {{field:member_type}} membership has been received. '
    + 'We\'ll be in touch shortly.',
  palette: {
    primary: '#4A5E3A', accent: '#C9A84C', surface: '#FFFFFF', text: '#1C1C1C',
    muted: '#6B7280', border: '#D4C89A', onPrimary: '#FFFFFF', deco: '#C9A84C', page: '#F9F6EE',
  },

  exactFields: [
    ...stepSections(GPR_STEPS).slice(0, 1),
    field('first_name', 'Text', 'First Name *', { required: true, placeholder: 'John' }),
    field('last_name', 'Text', 'Last Name *', { required: true, placeholder: 'Smith' }),
    field('email', 'Email', 'Email Address *', { required: true, placeholder: 'john@email.com' }),
    field('phone', 'Text', 'Phone Number', { placeholder: '+1 (888) 000-0000' }),
    field('address', 'Text', 'Street Address', { placeholder: '123 Main Street' }),
    field('city', 'Text', 'City', { placeholder: 'Los Angeles' }),
    choiceField('country', 'Select', 'Country', [
      'United States', 'United Kingdom', 'Canada', 'Australia',
      'Germany', 'France', 'Spain', 'Singapore', 'Other',
    ], 'dropdown', null, { placeholder: 'Select country' }),
    choiceField('member_type', 'Radio', 'Membership Type *',
      ['Individual Agent', 'Team Leader', 'Agency Owner', 'Associate'], 'chips', null,
      { required: true }),
    ...stepSections(GPR_STEPS).slice(1, 2),
    field('agency', 'Text', 'Agency / Brokerage *', { required: true, placeholder: 'Golden Pro Realty' }),
    field('license_no', 'Text', 'Licence Number *', { required: true, placeholder: 'DRE 01234567' }),
    choiceField('experience', 'Select', 'Years of Experience *',
      ['Under 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years'],
      'dropdown', null, { required: true, placeholder: 'Select range' }),
    field('start_date', 'Date', 'Preferred Start Date', { placeholder: 'mm/dd/yyyy' }),
    field('referral', 'Text', 'How did you hear about us?', {
      placeholder: 'Colleague, social media, event…',
    }),
    ...stepSections(GPR_STEPS).slice(2, 3),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [
      { label: 'Receive market updates and exclusive listings', value: 'yes' },
    ], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [
      { label: 'I agree to the Golden Pro terms and conditions<span class="gpr-req">*</span>', value: 'yes' },
    ], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const contact = (icon, text) => `<div class='${p}-c-row'><i class='fa ${icon}'></i>`
      + `<span>${text}</span></div>`;
    const rail = GPR_STEPS.map((st, i) =>
      `<div class='${p}-rail-row' data-mf-native-step='1' data-step='${i}'>`
      + `<span class='${p}-rail-b'>${st.num}</span>`
      + `<span class='${p}-rail-t'><span class='${p}-rail-l'>${st.label}</span>`
      + `<span class='${p}-rail-s'>${st.sub}</span></span></div>`).join('');
    const secbar = (t) => `<div class='${p}-secbar'><i class='${p}-hair'></i>`
      + `<span class='${p}-secbar-t'>${t}</span><i class='${p}-hair'></i></div>`;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const rrow = (k, echo) => `<div class='${p}-r-row'><span class='${p}-r-k'>${k}</span>`
      + `<span class='${p}-r-v' data-mf-echo='${echo}'>—</span></div>`;
    const nav = (i, last) => `<div class='${p}-nav'>`
      + (i > 0
        ? `<button type='button' class='${p}-back' data-mf-native-back='1'>`
          + `<i class='fa fa-arrow-left'></i>Back</button>`
        : `<span></span>`)
      + (last
        ? `<button type='submit' class='${p}-submit' data-mf-native-submit='1'>Submit Registration`
          + `<i class='fa fa-check'></i></button>`
        : `<button type='button' class='${p}-next' data-mf-native-next='1'>Continue`
          + `<i class='fa fa-arrow-right'></i></button>`)
      + `</div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-head'>`
      + `<span class='${p}-lock'><span class='${p}-logo'><i class='fa fa-star'></i></span>`
      + `<span class='${p}-lock-t'><span class='${p}-brand'>GOLDEN PRO</span>`
      + `<span class='${p}-brand-s'>REAL ESTATE</span></span></span>`
      + `<span class='${p}-formname'>REGISTRATION FORM</span>`
      + `</div>`
      + `<div class='${p}-stripe' role='presentation'></div>`
      + `<div class='${p}-body'>`
      + `<aside class='${p}-aside'>`
      + `<div class='${p}-photo-wrap'><div class='${p}-photo'>`
      + `<img class='${p}-content-image' src='{{content:agent_photo}}' alt='' aria-hidden='true'></div>`
      + `<span class='${p}-agent'>AGENT</span></div>`
      + `<div class='${p}-who'><div class='${p}-who-n'>Your Area Managing Director</div>`
      + `<div class='${p}-who-s'>Premium Real Estate Partner</div></div>`
      + `<div class='${p}-hr'></div>`
      + `<div class='${p}-contacts'>`
      + contact('fa-phone', '+1 (888) 555-0100')
      + contact('fa-envelope-o', 'agent@goldenpro.com')
      + contact('fa-globe', 'www.goldenpro.com')
      + contact('fa-map-marker', '123 Luxury Ave, Beverly Hills, CA 90210')
      + `</div>`
      + `<div class='${p}-hr'></div>`
      + `<div class='${p}-rail'>${rail}</div>`
      + `</aside>`

      + `<div class='${p}-main'>`
      + `{{script:wizard_pages}}`
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='0'>{{field:step_1}}`
      + secbar('Personal Information')
      + `<div class='${p}-stack'>`
      + `<div class='${p}-grid2'>${fld('First Name *', 'first_name')}${fld('Last Name *', 'last_name')}</div>`
      + `<div class='${p}-grid2'>${fld('Email Address *', 'email')}${fld('Phone Number', 'phone')}</div>`
      + fld('Street Address', 'address')
      + `<div class='${p}-grid2'>${fld('City', 'city')}${fld('Country', 'country')}</div>`
      + `<label class='${p}-field ${p}-chips-f'><span class='${p}-label'>Membership Type *</span>`
      + `{{field:member_type}}</label>`
      + `</div>${nav(0, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='1'>{{field:step_2}}`
      + secbar('Agency &amp; Licence')
      + `<div class='${p}-stack'>`
      + `<div class='${p}-grid2'>${fld('Agency / Brokerage *', 'agency')}${fld('Licence Number *', 'license_no')}</div>`
      + `<div class='${p}-grid2'>${fld('Years of Experience *', 'experience')}${fld('Preferred Start Date', 'start_date')}</div>`
      + fld('How did you hear about us?', 'referral')
      + `</div>${nav(1, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='2'>{{field:step_3}}`
      + secbar('Review &amp; Confirm')
      + `<div class='${p}-stack'>`
      + `<div class='${p}-review'>`
      + rrow('Name', 'r_name') + rrow('Email', 'r_email') + rrow('Phone', 'r_phone')
      + rrow('Country', 'r_country') + rrow('Membership', 'r_member') + rrow('Agency', 'r_agency')
      + rrow('Licence', 'r_licence') + rrow('Experience', 'r_exp')
      + `</div>`
      + `{{script:gpr_review}}`
      + `<div class='${p}-consent'>{{field:newsletter}}{{field:terms}}</div>`
      + `</div>${nav(2, true)}</div>`
      + `</div></div>`
      + `<div class='${p}-stripe' role='presentation'></div>`
      + `</div></div></div>`;
  },

  customScripts: {
    wizard_pages: wizardPagesScript(),
    gpr_review: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  function val(k){
    var els = scope.querySelectorAll('[name="' + k + '"]');
    if (!els.length) return '';
    var f = els[0];
    if (f.type === 'radio' || f.type === 'checkbox') {
      for (var i = 0; i < els.length; i++) if (els[i].checked) {
        var ui = els[i].nextElementSibling;
        var lab = ui && ui.querySelector ? ui.querySelector('.mf-option-label') : null;
        return lab ? lab.textContent.trim() : els[i].value;
      }
      return '';
    }
    if (f.tagName === 'SELECT') { var o = f.options[f.selectedIndex]; return o && o.value ? o.textContent.trim() : ''; }
    return String(f.value || '').trim();
  }
  function put(k, v){ var n = scope.querySelector('[data-mf-echo="' + k + '"]'); if (n) n.textContent = v || '\\u2014'; }
  function paint(){
    put('r_name', (val('first_name') + ' ' + val('last_name')).trim());
    put('r_email', val('email'));
    put('r_phone', val('phone'));
    put('r_country', val('country'));
    put('r_member', val('member_type'));
    put('r_agency', val('agency'));
    put('r_licence', val('license_no'));
    put('r_exp', val('experience'));
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  scope.addEventListener('click', function(){ setTimeout(paint, 60); }, true);
  paint();
})();`,
  },

  exactCss: `
@S@{font-family:${INTER}!important;color:#1C1C1C}
@S@.gpr-page{background:#F9F6EE}
@S@.gpr-shell{max-width:1024px;margin:0 auto}

/* masthead + stripes ----------------------------------------------------- */
@S@.gpr-head{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;
  border-bottom:1px solid #D4C89A;background:#fff}
@S@.gpr-allforms{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:16px;
  font-weight:400;color:#6B7280}
@S@.gpr-allforms i{font-size:14px;line-height:14px}
@S@.gpr-lock{display:inline-flex;align-items:center;gap:8px}
@S@.gpr-logo{display:flex;align-items:center;justify-content:center;width:32px;height:32px;
  border-radius:4px;background:#C9A84C;color:#fff;font-size:16px;line-height:16px}
@S@.gpr-lock-t{display:flex;flex-direction:column;line-height:1.25}
@S@.gpr-brand{font-family:${PLAYFAIR}!important;font-size:14px;line-height:1;font-weight:700;
  color:#1C1C1C}
@S@.gpr-brand-s{font-size:10px;line-height:14px;font-weight:500;letter-spacing:.1em;color:#6B7F58}
@S@.gpr-formname{font-family:${PLAYFAIR}!important;font-size:18px;line-height:28px;font-weight:700;
  letter-spacing:.1em;color:#1C1C1C}
@S@.gpr-stripe{height:4px;background:linear-gradient(90deg,#4A5E3A,#C9A84C,#4A5E3A)}

/* olive sidebar ---------------------------------------------------------- */
@S@.gpr-body{display:flex;align-items:stretch}
@S@.gpr-aside{display:flex;flex:0 0 256px;width:256px;flex-direction:column;align-items:center;
  gap:24px;padding:32px 24px;background:#4A5E3A}
@S@.gpr-photo-wrap{position:relative}
@S@.gpr-photo{width:112px;height:112px;border:4px solid #C9A84C;border-radius:999px;
  position:relative;overflow:hidden;
  background-image:${asset(GPR_SLUG, 'golden-pro-agent.png')};
  background-size:cover;background-position:50% 20%}
@S@img.gpr-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 20%!important;
  border:0!important;border-radius:999px!important;pointer-events:none!important}
@S@.gpr-agent{position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);
  padding:2px 8px;border-radius:999px;background:#C9A84C;color:#fff;font-size:10px;line-height:14px;
  font-weight:700;letter-spacing:.05em}
@S@.gpr-who{text-align:center}
@S@.gpr-who-n{font-family:${PLAYFAIR}!important;font-size:16px;line-height:24px;font-weight:700;
  color:#fff}
@S@.gpr-who-s{margin-top:4px;font-size:11px;line-height:16px;font-weight:400;color:#F5E9C4}
@S@.gpr-hr{width:100%;height:1px;background:rgba(201,168,76,.31)}
@S@.gpr-contacts{display:flex;flex-direction:column;gap:12px;width:100%;font-size:11px;
  line-height:16px;font-weight:400;color:#D4E8CA}
@S@.gpr-c-row{display:flex;align-items:flex-start;gap:8px}
@S@.gpr-c-row i{flex:0 0 12px;margin-top:2px;font-size:12px;line-height:12px;color:#C9A84C}
@S@.gpr-rail{display:flex;flex-direction:column;gap:8px;width:100%}
@S@.gpr-rail-row{display:flex;align-items:center;gap:8px}
@S@.gpr-rail-b{display:flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;
  height:24px;box-sizing:border-box;border:1.5px solid rgba(245,233,196,.31);border-radius:999px;
  background:transparent;color:rgba(245,233,196,.5);font-size:10px;line-height:14px;font-weight:700}
@S@.gpr-rail-t{display:flex;flex-direction:column}
@S@.gpr-rail-l{font-size:11px;line-height:16px;font-weight:600;color:rgba(245,233,196,.376)}
@S@.gpr-rail-s{font-size:10px;line-height:14px;font-weight:400;color:rgba(245,233,196,.25)}
/* the renderer marks the active rail item */
@S@.gpr-rail-row.is-active .gpr-rail-b{background:#fff;border-color:#fff;color:#4A5E3A}
@S@.gpr-rail-row.is-active .gpr-rail-l{color:#fff}
@S@.gpr-rail-row.is-active .gpr-rail-s{color:#F5E9C4}
@S@.gpr-rail-row.is-done .gpr-rail-b{background:#C9A84C;border-color:#C9A84C;color:#4A5E3A}
@S@.gpr-rail-row.is-done .gpr-rail-l{color:#fff}

/* form column ------------------------------------------------------------ */
@S@.gpr-main{flex:1 1 auto;min-width:0;padding:32px 40px;background:#fff}
@S@.gpr-secbar{display:flex;align-items:center;gap:12px;margin-bottom:24px}
@S@.gpr-hair{flex:1 1 0;height:1px;display:block;background:#D4C89A}
@S@.gpr-secbar-t{padding:4px 16px;background:#4A5E3A;color:#fff;font-size:11px;line-height:16px;
  font-weight:700;letter-spacing:.1em;text-transform:uppercase}
@S@.gpr-stack{display:flex;flex-direction:column;gap:24px}
@S@.gpr-grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@S@.gpr-field{display:block;margin:0}
@S@.gpr-label{display:block;margin:0 0 4px;font-size:11px;line-height:16px;font-weight:600;
  letter-spacing:.05em;text-transform:uppercase;color:#6B7F58}
@S@.gpr-chips-f .mf-option-group--chips{margin-top:8px}
${controlReset()}
@S@.mf-input[class],@S@.mf-select[class]{width:100%!important;box-sizing:border-box!important;
  border:0!important;border-bottom:1px solid #D4C89A!important;border-radius:0!important;
  background:transparent!important;padding:0 0 6px!important;min-height:0!important;
  height:auto!important;color:#1C1C1C!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;font-weight:400!important;
  box-shadow:none!important;appearance:none!important;-webkit-appearance:none!important}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-bottom-color:#C9A84C!important;
  box-shadow:none!important;outline:none!important}
@S@.mf-input[class]::placeholder{color:#BBBBA0!important;opacity:1}
@S@.mf-select[class]:invalid,
@S@.mf-select[class]:has(option[value=""]:checked){color:#BBBBA0!important}

/* membership pills ------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
/* the mock's pill is a flex row with a 6px gap reserved for the check glyph */
@S@.mf-option-group--chips .mf-option-ui{display:flex;align-items:center;justify-content:center;
  gap:6px;padding:6px 14px;border:1px solid #D4C89A;border-radius:9999px;background:#FDFBF5;
  color:#6B7280;font-size:12px;line-height:16px;font-weight:600;text-align:center;cursor:pointer;
  transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;font-weight:600;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#4A5E3A;border-color:#4A5E3A;
  color:#fff}

/* review panel + consent ------------------------------------------------- */
@S@.gpr-review{display:grid;gap:10px;padding:20px;border:1px solid #D4C89A;border-radius:8px;
  background:#FDFBF5;font-size:14px;line-height:20px}
@S@.gpr-r-row{display:flex;justify-content:space-between;padding-bottom:6px;
  border-bottom:1px solid #D4C89A}
@S@.gpr-r-row:last-child{padding-bottom:0;border-bottom:0}
@S@.gpr-r-k{font-size:11px;line-height:16px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;color:#6B7F58}
@S@.gpr-r-v{font-weight:500;text-align:right;color:#1C1C1C}
@S@.gpr-consent{display:flex;flex-direction:column;gap:12px}
@S@.gpr-consent .mf-option-group--list{display:flex;flex-direction:column;gap:12px}
@S@.gpr-consent .mf-option-item{display:flex;align-items:flex-start;gap:12px}
@S@.gpr-consent .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.gpr-consent .mf-option-label{font-size:12px;line-height:1.625;font-weight:400;color:#6B7280}
@S@.gpr-consent input[type="checkbox"]{width:16px!important;height:16px!important;
  flex:0 0 16px!important;margin:2px 0 0!important;border:1.5px solid #D4C89A!important;
  border-radius:4px!important}
@S@.gpr-req{margin-left:2px;color:#FF6467}

/* wizard nav ------------------------------------------------------------- */
@S@.gpr-nav{display:flex;align-items:center;justify-content:space-between;margin-top:40px}
@S@button.gpr-back{display:inline-flex;align-items:center;gap:6px;padding:0!important;
  border:0!important;background:transparent!important;color:#6B7280!important;
  font-family:inherit!important;font-size:12px!important;line-height:16px!important;
  font-weight:600!important;text-transform:none!important;letter-spacing:normal!important;
  cursor:pointer!important;box-shadow:none!important}
@S@button.gpr-next,@S@button.gpr-submit[type="submit"]{display:inline-flex;align-items:center;
  gap:6px;width:auto!important;padding:10px 24px!important;border:0!important;
  border-radius:8px!important;color:#fff!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;font-weight:600!important;
  text-transform:none!important;letter-spacing:normal!important;cursor:pointer!important;
  box-shadow:none!important}
@S@button.gpr-next{background:linear-gradient(135deg,#4A5E3A,#6B7F58)!important}
@S@button.gpr-submit[type="submit"]{background:linear-gradient(135deg,#C9A84C,#9B7B2A)!important}
/* the mock fades a blocked nav button to 40% */
@S@button.gpr-next.mf-nav-blocked,@S@button.gpr-next[disabled]{opacity:.4!important;
  background:linear-gradient(135deg,#4A5E3A,#6B7F58)!important;cursor:not-allowed!important}
@S@button.gpr-submit.mf-nav-blocked,@S@button.gpr-submit[disabled]{opacity:.4!important;
  background:linear-gradient(135deg,#C9A84C,#9B7B2A)!important;cursor:not-allowed!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// invoice-form → invoice-request-navy-orange
//
//   page   #F0F1F5, py-8 px-4, max-w-3xl (768px)
//   card   rounded-2xl overflow-hidden, shadow-lg
//   head   88px navy band with an orange diagonal (SVG polygon) and a gold sliver, YOUR LOGO /
//          SLOGAN left, INVOICE / #number right
//   tabs   a full-width 4-tab strip, active tab underlined 3px orange, 20px badge per tab
//   body   px-8 py-7; step 0 is a 2-up grid of Invoice To / Invoice From plus number and dates
//   nav    a bordered footer band: Back on the left, navy "Next step" / orange "Finalise Invoice"
// ─────────────────────────────────────────────────────────────────────────────
const INV_STEPS = [
  { num: '01', label: 'Parties', sub: 'Bill to / from' },
  { num: '02', label: 'Items', sub: 'Line items' },
  { num: '03', label: 'Payment', sub: 'Method & contact' },
  { num: '04', label: 'Confirm', sub: 'Review & send' },
];

const NAVY_DIAG = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 88'
  preserveAspectRatio='none'>
  <polygon points='400,0 800,0 800,88 350,88' fill='#E87C1E'/>
  <polygon points='380,0 420,0 360,88 320,88' fill='#D4A82A' opacity='0.7'/>
</svg>`);

const INV = {
  slug: 'invoice-request-navy-orange',
  title: 'Invoice Request — Navy & Orange',
  description:
    'Four-step invoice: a navy masthead cut by an orange diagonal, a tabbed step strip, a two-up '
    + 'Invoice To / Invoice From grid, a line-item grid with live subtotal, tax and discount, '
    + 'payment method pills and a review step. Transcribed from the invoice-form mock.',
  category: 'invoice',
  categories: ['invoice', 'premium', 'finance'],
  icon: 'file-text',
  prefix: 'inv',
  outerBorder: { sel: '.inv-card', radius: 16 },
  fontStack: INTER,
  fontImport: FONT_IMPORT,
  wizard: { steps: INV_STEPS, nextLabel: 'Next step', backLabel: 'Back' },
  submitLabel: 'Finalise Invoice',
  successTitle: 'Invoice Created',
  successMessage: 'Invoice finalised.',
  successBody:
    'Invoice {{field:invoice_no}} to {{field:bill_to_name}} has been finalised.',
  palette: {
    primary: '#0F1B35', accent: '#E87C1E', surface: '#FFFFFF', text: '#1A1A2E',
    muted: '#6B7280', border: '#E0E0E8', onPrimary: '#FFFFFF', deco: '#D4A82A', page: '#F0F1F5',
  },

  exactFields: [
    ...stepSections(INV_STEPS).slice(0, 1),
    field('bill_to_name', 'Text', 'Company / Name *', { required: true, placeholder: 'Company / Name' }),
    field('bill_to_addr', 'Text', 'Address', { placeholder: 'Address' }),
    field('bill_to_city', 'Text', 'City, State, ZIP', { placeholder: 'City, State, ZIP' }),
    field('bill_to_email', 'Email', 'Email', { placeholder: 'Email' }),
    field('bill_from_name', 'Text', 'Company / Name *', { required: true, placeholder: 'Company / Name' }),
    field('bill_from_addr', 'Text', 'Address', { placeholder: 'Address' }),
    field('bill_from_city', 'Text', 'City, State, ZIP', { placeholder: 'City, State, ZIP' }),
    field('bill_from_email', 'Email', 'Email', { placeholder: 'Email' }),
    field('invoice_no', 'Text', 'Invoice No.', { defaultValue: 'INV-001' }),
    field('invoice_date', 'Date', 'Invoice Date', { placeholder: 'mm/dd/yyyy' }),
    field('due_date', 'Date', 'Due Date', { placeholder: 'mm/dd/yyyy' }),
    ...stepSections(INV_STEPS).slice(1, 2),
    ...itemsFields([
      { description: '', qty: 1, price: 0 },
      { description: '', qty: 1, price: 0 },
      { description: '', qty: 1, price: 0 },
    ], { currencyLabel: 'Rate ($)' }),
    field('notes', 'Textarea', 'Notes', { placeholder: 'Payment terms, thank-you note…' }),
    ...stepSections(INV_STEPS).slice(2, 3),
    choiceField('pay_method', 'Radio', 'Payment Method',
      ['Bank Transfer', 'Credit Card', 'Cheque', 'Cash', 'PayPal', 'Crypto'], 'chips', null,
      { defaultValue: 'Bank Transfer' }),
    field('bank_name', 'Text', 'Bank Name', { placeholder: 'Bank Name' }),
    field('account_no', 'Text', 'Account Number', { placeholder: 'Account Number' }),
    field('routing_no', 'Text', 'Routing Number', { placeholder: 'Routing Number' }),
    field('contact_phone', 'Text', 'Phone', { placeholder: 'Phone' }),
    field('contact_email', 'Email', 'Email', { placeholder: 'Email' }),
    field('contact_web', 'Text', 'Website', { placeholder: 'Website' }),
    ...stepSections(INV_STEPS).slice(3, 4),
    choiceField('terms', 'Checkbox', 'Declaration', [{
      label: 'I confirm this invoice is accurate and authorise its submission'
        + '<span class="inv-req">*</span>',
      value: 'yes',
    }], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const tab = (st, i) => `<div class='${p}-tab' data-mf-native-step='1' data-step='${i}'>`
      + `<span class='${p}-tab-b'>${st.num}</span>`
      + `<span class='${p}-tab-l'>${st.label}</span></div>`;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const nav = (i, last) => `<div class='${p}-nav'>`
      + (i > 0
        ? `<button type='button' class='${p}-back' data-mf-native-back='1'>`
          + `<i class='fa fa-arrow-left'></i>Back</button>`
        : `<span></span>`)
      + (last
        ? `<button type='submit' class='${p}-submit' data-mf-native-submit='1'>Finalise Invoice`
          + `<i class='fa fa-check'></i></button>`
        : `<button type='button' class='${p}-next' data-mf-native-next='1'>Next step`
          + `<i class='fa fa-arrow-right'></i></button>`)
      + `</div>`;
    const rrow = (k, echo) => `<div class='${p}-r-cell'><div class='${p}-r-k'>${k}</div>`
      + `<div class='${p}-r-v' data-mf-echo='${echo}'>—</div></div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-card'>`
      + `<div class='${p}-head'><div class='${p}-diag' role='presentation'></div>`
      + `<div class='${p}-head-in'>`
      + `<div class='${p}-brand'><div class='${p}-brand-a'>YOUR LOGO</div>`
      + `<div class='${p}-brand-b'>SLOGAN</div></div>`
      + `<div class='${p}-inv'><div class='${p}-inv-a'>INVOICE</div>`
      + `<div class='${p}-inv-b' data-inv-no='1'>#INV-001</div></div>`
      + `</div></div>{{script:invoice_header}}`
      + `<div class='${p}-tabs'>${INV_STEPS.map(tab).join('')}</div>`
      + `<div class='${p}-body'>`
      + `{{script:wizard_pages}}`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='0'>{{field:step_1}}`
      + `<div class='${p}-grid2'>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-o'>Invoice To</div>`
      + fld('Company / Name *', 'bill_to_name') + fld('Address', 'bill_to_addr')
      + fld('City, State, ZIP', 'bill_to_city') + fld('Email', 'bill_to_email')
      + `</div>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-n'>Invoice From</div>`
      + fld('Company / Name *', 'bill_from_name') + fld('Address', 'bill_from_addr')
      + fld('City, State, ZIP', 'bill_from_city') + fld('Email', 'bill_from_email')
      + `</div>`
      + `<div>${fld('Invoice No.', 'invoice_no')}</div>`
      + `<div class='${p}-grid2b'>${fld('Invoice Date', 'invoice_date')}${fld('Due Date', 'due_date')}</div>`
      + `</div>${nav(0, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='1'>{{field:step_2}}`
      + `<div class='${p}-items'>{{field:items}}</div>`
      + `<div class='${p}-totals'>`
      + `<div class='${p}-t-row'><span>Subtotal</span><span data-mf-echo='subtotal'>$0.00</span></div>`
      + `<div class='${p}-t-row'><span data-mf-echo='tax_label'>Tax (10%)</span>`
      + `<span data-mf-echo='tax'>$0.00</span></div>`
      + `<div class='${p}-t-row'><span data-mf-echo='disc_label'>Discount (0%)</span>`
      + `<span data-mf-echo='discount'>-$0.00</span></div>`
      + `<div class='${p}-t-tot'><span>TOTAL</span><span data-mf-echo='total'>$0.00</span></div>`
      + `</div>`
      + `<div class='${p}-grid2c'>${fld('Tax Rate (%)', 'tax_pct')}${fld('Discount (%)', 'discount_pct')}</div>`
      + `<div class='${p}-hidden'>{{field:grand_total}}</div>`
      + `<div class='${p}-notes'>${fld('Notes', 'notes')}</div>`
      + `{{script:invoice_totals}}`
      + `${nav(1, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='2'>{{field:step_3}}`
      + `<div class='${p}-grid2'>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-o'>Payment Method</div>`
      + `<div class='${p}-pays'>{{field:pay_method}}</div>`
      + fld('Bank Name', 'bank_name') + fld('Account Number', 'account_no')
      + fld('Routing Number', 'routing_no')
      + `</div>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-n'>Contact Info</div>`
      + fld('Phone', 'contact_phone') + fld('Email', 'contact_email')
      + fld('Website', 'contact_web')
      + `</div></div>${nav(2, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='3'>{{field:step_4}}`
      + `<div class='${p}-review'>`
      + rrow('Invoice No.', 'r_no') + rrow('Bill To', 'r_to') + rrow('Bill From', 'r_from')
      + rrow('Invoice Date', 'r_date') + rrow('Due Date', 'r_due') + rrow('Payment', 'r_pay')
      + rrow('Items', 'r_items') + rrow('Total', 'r_total')
      + `</div>`
      + `<div class='${p}-sign'><div class='${p}-sign-c'><div class='${p}-r-k'>Signature</div>`
      + `<div class='${p}-sign-h'></div></div>`
      + `<div class='${p}-sign-c'><div class='${p}-r-k'>Date</div>`
      + `<div class='${p}-sign-h'></div></div></div>`
      + `<div class='${p}-consent'>{{field:terms}}</div>`
      + `{{script:invoice_recap}}`
      + `${nav(3, true)}</div>`

      + `</div></div></div></div></div>`;
  },

  customScripts: {
    wizard_pages: wizardPagesScript(),
    invoice_totals: invoiceTotalsScript('$'),
    invoice_recap: recapScript(),
    invoice_header: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  function paint(){
    var input = scope.querySelector('[name="invoice_no"]');
    var target = scope.querySelector('[data-inv-no="1"]');
    var value = input && String(input.value || '').trim();
    if (target) target.textContent = '#' + (value || 'INV-001');
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  paint();
})();`,
  },

  exactCss: `
@S@{font-family:${INTER}!important;color:#1A1A2E}
@S@.inv-page{padding:32px 16px;background:#F0F1F5}
@S@.inv-shell{max-width:768px;margin:0 auto}
@S@.inv-back-row{line-height:0}
@S@.inv-back-link{display:inline-flex;align-items:center;gap:6px;margin-bottom:20px;font-size:12px;
  line-height:16px;font-weight:500;color:#6B7280}
@S@.inv-card{overflow:hidden;border-radius:16px;background:#fff;
  box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}

/* diagonal masthead ------------------------------------------------------ */
@S@.inv-head{position:relative;overflow:hidden;min-height:88px;background:#0F1B35}
@S@.inv-diag{position:absolute;inset:0;background-image:${NAVY_DIAG};background-size:100% 100%;
  background-repeat:no-repeat}
@S@.inv-head-in{position:relative;display:flex;align-items:center;justify-content:space-between;
  padding:20px 32px}
@S@.inv-brand-a{font-size:10px;line-height:14px;font-weight:700;letter-spacing:4px;
  text-transform:uppercase;color:rgba(255,255,255,.6)}
@S@.inv-brand-b{margin-top:2px;font-size:11px;line-height:16px;font-weight:500;
  color:rgba(255,255,255,.4)}
@S@.inv-inv{text-align:right}
@S@.inv-inv-a{font-size:24px;line-height:32px;font-weight:900;letter-spacing:.1em;color:#fff}
@S@.inv-inv-b{margin-top:2px;font-size:12px;line-height:16px;font-weight:500;color:#E87C1E}

/* tab strip -------------------------------------------------------------- */
@S@.inv-tabs{display:flex;border-bottom:1px solid #E0E0E8}
@S@.inv-tab{display:flex;flex:1 1 0;flex-direction:column;align-items:center;gap:2px;padding:12px 0;
  border-bottom:3px solid transparent;text-align:center;font-size:11px;line-height:16px;
  font-weight:600;color:#6B7280}
@S@.inv-tab-l{text-align:center}
@S@.inv-tab-b{display:flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:999px;background:#E0E0E8;color:#6B7280;font-size:10px;line-height:14px}
@S@.inv-tab.is-active{border-bottom-color:#E87C1E;color:#1A1A2E}
@S@.inv-tab.is-active .inv-tab-b{background:#0F1B35;color:#fff}
@S@.inv-tab.is-done{color:#1A1A2E}
@S@.inv-tab.is-done .inv-tab-b{background:#E87C1E;color:#fff}

/* body ------------------------------------------------------------------- */
@S@.inv-body{padding:28px 32px}
@S@.inv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@S@.inv-grid2b,@S@.inv-grid2c{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@S@.inv-grid2c{margin-top:16px}
@S@.inv-stack{display:flex;flex-direction:column;gap:16px}
@S@.inv-cap{margin-bottom:8px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase}
@S@.inv-cap-o{color:#E87C1E}
@S@.inv-cap-n{color:#0F1B35}
@S@.inv-field{display:block;margin:0}
@S@.inv-label{display:block;margin:0 0 4px;font-size:12px;line-height:16px;font-weight:600;
  letter-spacing:.025em;text-transform:uppercase;color:#6B7280}
@S@.inv-notes{margin-top:16px}
@S@.inv-hidden{display:none}
${controlReset()}
${boxedControls({ border: '#E0E0E8', focus: '#E87C1E', text: '#1A1A2E', ph: '#B0B0BF',
  bg: '#FFFFFF', radius: 4, padY: 8, padX: 12, size: 14, line: 20, greyEmpty: false })}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #E0E0E8!important;border-radius:4px!important;background:#fff!important;
  padding:8px 12px!important;min-height:60px!important;height:60px!important;resize:none!important;
  color:#1A1A2E!important;font-family:inherit!important;font-size:14px!important;
  line-height:20px!important;box-shadow:none!important}

/* line items + totals ---------------------------------------------------- */
@S@.inv-items .mfw-dgrid-head-cell{background:#0F1B35!important;color:#fff!important;
  font-size:11px!important;font-weight:700!important;letter-spacing:.05em!important;
  text-transform:uppercase!important;padding:8px 12px!important;border:0!important}
@S@.inv-items .mfw-dgrid-head-cell:last-child{background:#E87C1E!important}
@S@.inv-totals{width:256px;margin:24px 0 0 auto;display:flex;flex-direction:column;gap:8px;
  font-size:14px;line-height:20px}
@S@.inv-t-row{display:flex;justify-content:space-between;padding-bottom:4px;
  border-bottom:1px solid #E0E0E8;color:#6B7280}
@S@.inv-t-tot{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;
  border-radius:8px;background:#E87C1E;color:#fff;font-size:16px;line-height:24px;font-weight:700}

/* payment pills ---------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:4px 12px;
  border:1px solid #E0E0E8;border-radius:9999px;background:#F0F1F5;color:#6B7280;font-size:12px;
  line-height:16px;font-weight:600;text-align:center;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;font-weight:600;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#E87C1E;border-color:#E87C1E;
  color:#fff}

/* review + signature ----------------------------------------------------- */
@S@.inv-review{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px;
  border:1px solid #E0E0E8;border-radius:12px;background:#F8F8FB;font-size:14px;line-height:20px}
@S@.inv-r-cell{padding-bottom:8px;border-bottom:1px solid #E0E0E8}
@S@.inv-r-k{font-size:11px;line-height:16px;letter-spacing:.025em;text-transform:uppercase;
  color:#6B7280}
@S@.inv-r-v{font-weight:600;color:#1A1A2E}
@S@.inv-sign{display:flex;align-items:flex-end;gap:16px;margin-top:20px}
@S@.inv-sign-c{flex:1 1 0;padding-bottom:4px;border-bottom:1px solid #E0E0E8}
@S@.inv-sign-h{height:28px}
@S@.inv-consent{margin-top:20px}
@S@.inv-consent .mf-option-item{display:flex;align-items:flex-start;gap:12px}
@S@.inv-consent .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.inv-consent .mf-option-label{font-size:12px;line-height:1.625;font-weight:400;color:#6B7280}
@S@.inv-consent input[type="checkbox"]{width:16px!important;height:16px!important;
  flex:0 0 16px!important;margin:2px 0 0!important;border:1.5px solid #E0E0E8!important;
  border-radius:4px!important}
@S@.inv-req{margin-left:2px;color:#FF6467}

/* footer nav ------------------------------------------------------------- */
@S@.inv-nav{display:flex;align-items:center;justify-content:space-between;margin:28px -32px -28px;
  padding:16px 32px;border-top:1px solid #E0E0E8}
@S@button.inv-back{display:inline-flex;align-items:center;gap:6px;padding:0!important;
  border:0!important;background:transparent!important;color:#6B7280!important;
  font-family:inherit!important;font-size:12px!important;line-height:16px!important;
  font-weight:600!important;text-transform:none!important;letter-spacing:normal!important;
  cursor:pointer!important;box-shadow:none!important}
@S@button.inv-next,@S@button.inv-submit[type="submit"]{display:inline-flex;align-items:center;
  gap:6px;width:auto!important;padding:10px 24px!important;border:0!important;
  border-radius:8px!important;color:#fff!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;text-transform:none!important;
  letter-spacing:normal!important;cursor:pointer!important;box-shadow:none!important}
@S@button.inv-next{background:#0F1B35!important;font-weight:600!important}
@S@button.inv-submit[type="submit"]{background:#E87C1E!important;font-weight:700!important}
@S@button.inv-next.mf-nav-blocked,@S@button.inv-next[disabled]{opacity:.4!important;
  background:#0F1B35!important;cursor:not-allowed!important}
@S@button.inv-submit.mf-nav-blocked,@S@button.inv-submit[disabled]{opacity:.4!important;
  background:#E87C1E!important;cursor:not-allowed!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// invoice-spinera → invoice-spinera-blue
//
//   page   #F0F3FA, py-8 px-4, max-w-4xl (896px)
//   head   a document masthead, NOT a coloured band: an 8px navy stripe down the left edge, a
//          30px Barlow "INVOICE" over an 80x4 red underbar, the date/number line, then a
//          To: / From: pair of address blocks
//   strip  a #E8F0FB currency band with six selectable codes
//   tabs   4-tab strip, 2px blue underline on the active tab
//   body   px-8 py-7; step 0 is To (6 fields) beside From (4 fields + date/number)
//   fields UNDERLINE only — border-b, no box
// ─────────────────────────────────────────────────────────────────────────────
const SPN_STEPS = [
  { num: '01', label: 'Parties', sub: 'To & from' },
  { num: '02', label: 'Items', sub: 'Services' },
  { num: '03', label: 'Payment', sub: 'Bank & terms' },
  { num: '04', label: 'Confirm', sub: 'Review & send' },
];

const SPN = {
  slug: 'invoice-spinera-blue',
  title: 'Spinera Invoice — Blue',
  description:
    'Four-step blue invoice: a document masthead with a navy edge stripe and a red-underlined '
    + 'INVOICE wordmark over To/From address blocks, a currency band, a tabbed step strip, '
    + 'underlined fields and a line-item grid with live totals. Transcribed from the '
    + 'invoice-spinera mock.',
  category: 'invoice',
  categories: ['invoice', 'premium', 'finance'],
  icon: 'file-text',
  prefix: 'spn',
  outerBorder: { sel: '.spn-card', radius: 16 },
  fontStack: INTER,
  fontImport:
    `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700`
    + `&family=Barlow:wght@600;700;800&display=swap');`,
  wizard: { steps: SPN_STEPS, nextLabel: 'Next', backLabel: 'Back' },
  submitLabel: 'Send Invoice',
  successTitle: 'Invoice sent',
  successMessage: 'Invoice sent.',
  successBody: 'Invoice {{field:invoice_no}} to {{field:to_company}} has been sent.',
  palette: {
    primary: '#0B1F4B', accent: '#1E5DB5', surface: '#FFFFFF', text: '#1A1A2E',
    muted: '#6B7280', border: '#D1D9E8', onPrimary: '#FFFFFF', deco: '#E02020', page: '#F0F3FA',
  },

  exactFields: [
    ...stepSections(SPN_STEPS).slice(0, 1),
    field('to_company', 'Text', 'Company *', { required: true, placeholder: 'Company' }),
    field('to_name', 'Text', 'Contact Name', { placeholder: 'Contact Name' }),
    field('to_addr', 'Text', 'Address', { placeholder: 'Address' }),
    field('to_phone', 'Text', 'Phone', { placeholder: 'Phone' }),
    field('to_email', 'Email', 'Email', { placeholder: 'Email' }),
    field('to_web', 'Text', 'Website', { placeholder: 'Website' }),
    field('from_company', 'Text', 'Company *', { required: true, placeholder: 'Company' }),
    field('from_addr', 'Text', 'Address', { placeholder: 'Address' }),
    field('from_phone', 'Text', 'Phone', { placeholder: 'Phone' }),
    field('from_email', 'Email', 'Email', { placeholder: 'Email' }),
    field('invoice_date', 'Date', 'Invoice Date', { placeholder: 'mm/dd/yyyy' }),
    field('invoice_no', 'Text', 'Invoice No.', { defaultValue: 'INV-2025-001' }),
    ...stepSections(SPN_STEPS).slice(1, 2),
    ...itemsFields([
      { description: '', qty: 1, price: 0 },
      { description: '', qty: 1, price: 0 },
      { description: '', qty: 1, price: 0 },
    ], { label: 'Description', currencyLabel: 'Rate' }),
    field('notes', 'Textarea', 'Notes', { placeholder: 'Payment terms, thank-you note…' }),
    ...stepSections(SPN_STEPS).slice(2, 3),
    field('bank_name', 'Text', 'Bank Name', { placeholder: 'Bank Name' }),
    field('account_no', 'Text', 'Account Number', { placeholder: 'Account Number' }),
    field('routing_no', 'Text', 'Routing Number', { placeholder: 'Routing Number' }),
    field('swift', 'Text', 'SWIFT / BIC', { placeholder: 'SWIFT / BIC' }),
    ...stepSections(SPN_STEPS).slice(3, 4),
    choiceField('terms', 'Checkbox', 'Declaration', [{
      label: 'I confirm this invoice is accurate and authorise its submission'
        + '<span class="spn-req">*</span>',
      value: 'yes',
    }], 'list', null, { required: true }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const tab = (st, i) => `<div class='${p}-tab' data-mf-native-step='1' data-step='${i}'>`
      + `<span class='${p}-tab-b'>${st.num}</span>`
      + `<span class='${p}-tab-l'>${st.label}</span></div>`;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const nav = (i, last) => `<div class='${p}-nav'>`
      + (i > 0
        ? `<button type='button' class='${p}-back' data-mf-native-back='1'>`
          + `<i class='fa fa-arrow-left'></i>Back</button>`
        : `<span></span>`)
      + (last
        ? `<button type='submit' class='${p}-submit' data-mf-native-submit='1'>Send Invoice`
          + `<i class='fa fa-check'></i></button>`
        : `<button type='button' class='${p}-next' data-mf-native-next='1'>Next`
          + `<i class='fa fa-arrow-right'></i></button>`)
      + `</div>`;
    const cur = (c, on) => `<span class='${p}-cur${on ? ` ${p}-cur-on` : ''}'>${c}</span>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-card'>`
      + `<div class='${p}-head'><div class='${p}-edge' role='presentation'></div>`
      + `<div class='${p}-head-in'>`
      + `<div class='${p}-wordmark'>INVOICE</div><div class='${p}-underbar'></div>`
      + `<div class='${p}-meta'>`
      + `<div><span class='${p}-meta-k'>Invoice Date:</span> <span data-spn='h_date'>—</span></div>`
      + `<div data-spn-line='h_no'><span class='${p}-meta-k'>Invoice No:</span> INV-2025-001</div>`
      + `</div>`
      + `<div class='${p}-addr'>`
      + `<div><div class='${p}-addr-c ${p}-addr-to'>To:</div>`
      + `<div class='${p}-addr-n' data-spn='h_to_c'>Spinera Group</div>`
      + `<div class='${p}-addr-l' data-spn='h_to_a'>Address line 1</div>`
      + `<div class='${p}-addr-l' data-spn='h_to_p'>+1 000-000-0000</div>`
      + `<div class='${p}-addr-l' data-spn='h_to_e'>contact@spinera.com</div>`
      + `<div class='${p}-addr-l' data-spn='h_to_w'>www.spinera.com</div></div>`
      + `<div><div class='${p}-addr-c ${p}-addr-from'>From:</div>`
      + `<div class='${p}-addr-n' data-spn='h_fr_c'>My Company</div>`
      + `<div class='${p}-addr-l' data-spn='h_fr_a'>Your address</div>`
      + `<div class='${p}-addr-l' data-spn='h_fr_p'></div>`
      + `<div class='${p}-addr-l' data-spn='h_fr_e'></div></div>`
      + `</div></div></div>`
      + `<div class='${p}-curbar'>`
      + `<span class='${p}-curbar-t'>Every Calculation Done in USD</span>`
      + `<span class='${p}-curbar-r'><span class='${p}-curbar-l'>Currency:</span>`
      + `<span class='${p}-curs'>${cur('USD', true)}${cur('EUR')}${cur('GBP')}${cur('AUD')}${cur('CAD')}${cur('SGD')}</span>`
      + `</span></div>`
      + `<div class='${p}-tabs'>${SPN_STEPS.map(tab).join('')}</div>`
      + `<div class='${p}-body'>`
      + `{{script:wizard_pages}}`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='0'>{{field:step_1}}`
      + `<div class='${p}-grid2'>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-b'>To</div>`
      + fld('Company *', 'to_company') + fld('Contact Name', 'to_name')
      + fld('Address', 'to_addr') + fld('Phone', 'to_phone')
      + fld('Email', 'to_email') + fld('Website', 'to_web')
      + `</div>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-n'>From</div>`
      + fld('Company *', 'from_company') + fld('Address', 'from_addr')
      + fld('Phone', 'from_phone') + fld('Email', 'from_email')
      + `<div class='${p}-grid2b'>${fld('Invoice Date', 'invoice_date')}${fld('Invoice No.', 'invoice_no')}</div>`
      + `</div></div>`
      + `{{script:spn_header}}`
      + `${nav(0, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='1'>{{field:step_2}}`
      + `<div class='${p}-items'>{{field:items}}</div>`
      + `<div class='${p}-totals'>`
      + `<div class='${p}-t-row'><span>Subtotal</span><span data-mf-echo='subtotal'>$0.00</span></div>`
      + `<div class='${p}-t-row'><span data-mf-echo='tax_label'>Tax (10%)</span>`
      + `<span data-mf-echo='tax'>$0.00</span></div>`
      + `<div class='${p}-t-row'><span data-mf-echo='disc_label'>Discount (0%)</span>`
      + `<span data-mf-echo='discount'>-$0.00</span></div>`
      + `<div class='${p}-t-tot'><span>TOTAL</span><span data-mf-echo='total'>$0.00</span></div>`
      + `</div>`
      + `<div class='${p}-grid2b'>${fld('Tax %', 'tax_pct')}${fld('Discount %', 'discount_pct')}</div>`
      + `<div class='${p}-hidden'>{{field:grand_total}}</div>`
      + `<div class='${p}-notes'>${fld('Notes', 'notes')}</div>`
      + `{{script:invoice_totals}}`
      + `${nav(1, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='2'>{{field:step_3}}`
      + `<div class='${p}-grid2'>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-b'>Bank</div>`
      + fld('Bank Name', 'bank_name') + fld('Account Number', 'account_no')
      + `</div>`
      + `<div class='${p}-stack'><div class='${p}-cap ${p}-cap-n'>Routing</div>`
      + fld('Routing Number', 'routing_no') + fld('SWIFT / BIC', 'swift')
      + `</div></div>${nav(2, false)}</div>`

      + `<div class='${p}-pg' data-mf-native-page='1' data-step='3'>{{field:step_4}}`
      + `<div class='${p}-consent'>{{field:terms}}</div>`
      + `{{script:invoice_recap}}`
      + `${nav(3, true)}</div>`

      + `</div></div></div></div></div>`;
  },

  customScripts: {
    wizard_pages: wizardPagesScript(),
    invoice_totals: invoiceTotalsScript('$'),
    invoice_recap: recapScript(),
    // The masthead is LIVE, but it must NOT use data-mf-echo: that attribute belongs to the
    // renderer's own echo runtime, which blanks any node whose key matches no field and stamps it
    // .is-empty — eight masthead lines vanished that way. A private attribute keeps it ours.
    spn_header: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var MAP = {
    h_date: ['invoice_date', '\\u2014'],
    h_to_c: ['to_company', 'Spinera Group'], h_to_a: ['to_addr', 'Address line 1'],
    h_to_p: ['to_phone', '+1 000-000-0000'], h_to_e: ['to_email', 'contact@spinera.com'],
    h_to_w: ['to_web', 'www.spinera.com'],
    h_fr_c: ['from_company', 'My Company'], h_fr_a: ['from_addr', 'Your address'],
    h_fr_p: ['from_phone', ''], h_fr_e: ['from_email', '']
  };
  function paint(){
    var noInput = scope.querySelector('[name="invoice_no"]');
    var noLine = scope.querySelector('[data-spn-line="h_no"]');
    if (noLine) {
      var noValue = (noInput && String(noInput.value || '').trim()) || 'INV-2025-001';
      var tail = noLine.lastChild;
      if (tail && tail.nodeType === 3) tail.nodeValue = ' ' + noValue;
      else noLine.appendChild(document.createTextNode(' ' + noValue));
    }
    for (var k in MAP) {
      var el = scope.querySelector('[name="' + MAP[k][0] + '"]');
      var n = scope.querySelector('[data-spn="' + k + '"]');
      if (n) n.textContent = (el && String(el.value || '').trim()) || MAP[k][1];
    }
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  paint();
})();`,
  },

  exactCss: `
@S@{font-family:${INTER}!important;color:#1A1A2E}
@S@.spn-page{padding:32px 16px;background:#F0F3FA}
@S@.spn-shell{max-width:896px;margin:0 auto}
@S@.spn-back-row{line-height:0}
@S@.spn-back-link{display:inline-flex;align-items:center;gap:6px;margin-bottom:20px;font-size:12px;
  line-height:16px;font-weight:500;color:#6B7280}
@S@.spn-card{overflow:hidden;border-radius:16px;background:#fff;
  box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}

/* document masthead ------------------------------------------------------ */
@S@.spn-head{position:relative;overflow:hidden}
@S@.spn-edge{position:absolute;left:0;top:0;width:8px;height:100%;background:#0B1F4B}
@S@.spn-head-in{position:relative;padding:32px 32px 24px}
@S@.spn-wordmark{font-family:'Barlow',${INTER}!important;font-size:30px;line-height:36px;
  font-weight:800;letter-spacing:.1em;color:#0B1F4B}
@S@.spn-underbar{width:80px;height:4px;margin-top:4px;border-radius:4px;background:#E02020}
@S@.spn-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:12px;font-size:12px;
  line-height:16px;font-weight:400;color:#6B7280}
@S@.spn-meta-k{font-weight:600;color:#1A1A2E}
@S@.spn-addr{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:16px;font-size:12px;
  line-height:16px}
@S@.spn-addr-c{margin-bottom:4px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
@S@.spn-addr-to{color:#1E5DB5}
@S@.spn-addr-from{color:#0B1F4B}
@S@.spn-addr-n{font-weight:600;color:#1A1A2E}
@S@.spn-addr-l{font-weight:400;color:#6B7280}

/* currency band ---------------------------------------------------------- */
/* The currency row is the one strip in this design that cannot shrink: six pills plus a caption on
   one line pushed 16px past the card edge in a 480px pane. Let it wrap there; the mock never sees
   that width. */
@S@.spn-curbar{display:flex;align-items:center;justify-content:space-between;gap:8px;
  flex-wrap:wrap;padding:8px 32px;
  border-top:1px solid #D1D9E8;border-bottom:1px solid #D1D9E8;background:#E8F0FB}
@S@.spn-curs{flex-wrap:wrap}
@S@.spn-curbar-t{font-size:11px;line-height:16px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:#1E5DB5}
@S@.spn-curbar-r{display:inline-flex;align-items:center;gap:6px}
@S@.spn-curbar-l{font-size:11px;line-height:16px;font-weight:400;color:#6B7280}
@S@.spn-curs{display:inline-flex;gap:4px}
@S@.spn-cur{padding:2px 6px;border-radius:4px;text-align:center;font-size:10px;line-height:14px;
  font-weight:700;color:#6B7280}
@S@.spn-cur-on{background:#1E5DB5;color:#fff}

/* tabs + body ------------------------------------------------------------ */
@S@.spn-tabs{display:flex;border-bottom:1px solid #D1D9E8}
@S@.spn-tab{display:flex;flex:1 1 0;flex-direction:column;align-items:center;gap:2px;padding:10px 0;
  border-bottom:2px solid transparent;text-align:center;font-size:11px;line-height:16px;
  font-weight:500;color:#6B7280}
@S@.spn-tab-b{display:flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:999px;background:#E8F0FB;color:#6B7280;font-size:10px;line-height:14px;
  font-weight:700}
@S@.spn-tab.is-active{border-bottom-color:#1E5DB5;color:#1A1A2E}
@S@.spn-tab.is-active .spn-tab-b{background:#0B1F4B;color:#fff}
@S@.spn-tab.is-done{color:#1A1A2E}
@S@.spn-tab.is-done .spn-tab-b{background:#1E5DB5;color:#fff}
@S@.spn-body{padding:28px 32px}
@S@.spn-grid2{display:grid;grid-template-columns:1fr 1fr;gap:32px}
@S@.spn-grid2b{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@S@.spn-stack{display:flex;flex-direction:column;gap:16px}
@S@.spn-cap{margin-bottom:4px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase}
@S@.spn-cap-b{color:#1E5DB5}
@S@.spn-cap-n{color:#0B1F4B}
@S@.spn-field{display:block;margin:0}
@S@.spn-label{display:block;margin:0 0 2px;font-size:11px;line-height:16px;font-weight:600;
  letter-spacing:.05em;text-transform:uppercase;color:#6B7280}
@S@.spn-notes{margin-top:16px}
@S@.spn-hidden{display:none}
${controlReset()}
${underlineControls({ border: '#D1D9E8', focus: '#1E5DB5', text: '#1A1A2E', ph: '#A8B4CC',
  size: 14, line: 20, pad: 0, greyEmpty: false })}
@S@.mf-input[class],@S@.mf-select[class]{border-bottom-width:1px!important;
  padding:0 0 6px!important}
@S@.mf-textarea[class]{width:100%!important;box-sizing:border-box!important;border:0!important;
  border-bottom:1px solid #D1D9E8!important;border-radius:0!important;background:transparent!important;
  padding:0 0 6px!important;min-height:60px!important;height:60px!important;resize:none!important;
  color:#1A1A2E!important;font-family:inherit!important;font-size:14px!important;
  line-height:20px!important;box-shadow:none!important}

/* items + totals --------------------------------------------------------- */
@S@.spn-items .mfw-dgrid-head-cell{background:#0B1F4B!important;color:#fff!important;
  font-size:11px!important;font-weight:700!important;letter-spacing:.025em!important;
  text-transform:uppercase!important;padding:8px!important;border:0!important}
@S@.spn-totals{width:256px;margin:24px 0 0 auto;display:flex;flex-direction:column;gap:8px;
  font-size:14px;line-height:20px}
@S@.spn-t-row{display:flex;justify-content:space-between;padding-bottom:4px;
  border-bottom:1px solid #D1D9E8;color:#6B7280}
@S@.spn-t-tot{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;
  border-radius:8px;background:#1E5DB5;color:#fff;font-size:16px;line-height:24px;font-weight:700}

/* consent + nav ---------------------------------------------------------- */
@S@.spn-consent .mf-option-item{display:flex;align-items:flex-start;gap:12px}
@S@.spn-consent .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.spn-consent .mf-option-label{font-size:12px;line-height:1.625;font-weight:400;color:#6B7280}
@S@.spn-consent input[type="checkbox"]{width:16px!important;height:16px!important;
  flex:0 0 16px!important;margin:2px 0 0!important;border:1.5px solid #D1D9E8!important;
  border-radius:4px!important}
@S@.spn-req{margin-left:2px;color:#FF6467}
@S@.spn-nav{display:flex;align-items:center;justify-content:space-between;margin:28px -32px -28px;
  padding:16px 32px;border-top:1px solid #D1D9E8}
@S@button.spn-back{display:inline-flex;align-items:center;gap:6px;padding:0!important;
  border:0!important;background:transparent!important;color:#6B7280!important;
  font-family:inherit!important;font-size:12px!important;line-height:16px!important;
  font-weight:600!important;text-transform:none!important;letter-spacing:normal!important;
  cursor:pointer!important;box-shadow:none!important}
@S@button.spn-next,@S@button.spn-submit[type="submit"]{display:inline-flex;align-items:center;
  gap:6px;width:auto!important;padding:10px 24px!important;border:0!important;
  border-radius:8px!important;background:#0B1F4B!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  text-transform:none!important;letter-spacing:normal!important;cursor:pointer!important;
  box-shadow:none!important}
@S@button.spn-next{font-weight:600!important}
@S@button.spn-submit[type="submit"]{font-weight:700!important}
@S@button.spn-next.mf-nav-blocked,@S@button.spn-next[disabled],
@S@button.spn-submit.mf-nav-blocked,@S@button.spn-submit[disabled]{opacity:.4!important;
  background:#0B1F4B!important;cursor:not-allowed!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// corporate-registration  (new mock, 2026-08-08)
//
//   page   #F4F6F9, py-10, max-w-3xl (768px) px-4
//   card   rounded-2xl, 1px #DDE3EC, shadow-sm, with TWO decorative triangle groups bled into the
//          top-left and bottom-left corners
//   head   avatar + "Membership Type / Registration Form" on the left, a company lockup and a
//          160px date field on the right
//   body   px-10 py-8; three sections, each opened by a blue caption trailed by a hairline;
//          2-up grids, boxed controls, gender pills, a footnote and a right-aligned CTA
// ─────────────────────────────────────────────────────────────────────────────
const CRG_SLUG = 'corporate-registration-blue';

const CRG_ARROW = lucideArrowLeft('#6B7280');
const CRG_CHECK = lucideCheck('#ffffff');

const CRG = {
  slug: CRG_SLUG,
  title: 'Registration Form — Corporate Blue',
  description:
    'Corporate membership registration: a white card with blue triangle accents, an applicant '
    + 'avatar beside the form title, a company lockup and date on the right, then three captioned '
    + 'sections of boxed fields with gender pills and a gradient CTA. Transcribed from the '
    + 'corporate-registration mock.',
  category: 'registration',
  categories: ['registration', 'premium', 'corporate'],
  icon: 'user-plus',
  prefix: 'crg',
  outerBorder: false,   // .crg-card already draws it
  // This document design owns a white paper + navy corporate palette. Letting page-source
  // variables recolour it made Oqtane's dark home theme paint the controls #060606 and turn the
  // navy identity cyan while the paper itself stayed white. Presets/page colours may still style
  // ordinary themes; this exact conversion must remain legible and match its source in any host.
  themeVars: false,
  fontStack: INTER,
  fontImport:
    `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700`
    + `&family=Bricolage+Grotesque:wght@600;700;800&display=swap');`,
  submitLabel: 'Submit Registration',
  successTitle: 'Registration received',
  successMessage: 'Registration received.',
  successBody: 'Thank you, {{field:full_name}}. Your {{field:membership_type}} registration has been received.',
  palette: {
    primary: '#1B4F8C', accent: '#0F3564', surface: '#FFFFFF', text: '#1A1F2B',
    muted: '#6B7280', border: '#DDE3EC', onPrimary: '#FFFFFF', deco: '#EAF1FA', page: '#F4F6F9',
  },

  exactFields: [
    field('reg_date', 'Date', 'Date', { placeholder: 'mm/dd/yyyy' }),
    field('full_name', 'Text', 'Full Name *', { required: true, placeholder: 'Jane Carter' }),
    field('dob', 'Date', 'Date of Birth *', { required: true, placeholder: 'mm/dd/yyyy' }),
    choiceField('gender', 'Radio', 'Gender *', ['Male', 'Female', 'Other'], 'chips', null,
      { required: true }),
    field('address', 'Text', 'Address', { placeholder: '123 Market Street, Suite 400' }),
    field('phone', 'Text', 'Phone', { placeholder: '+1 (555) 000-0000' }),
    choiceField('membership_type', 'Select', 'Membership Type *',
      ['Standard', 'Premium', 'VIP', 'Corporate'], 'dropdown', null,
      { required: true, placeholder: 'Select type' }),
    choiceField('service', 'Select', 'Service Required',
      ['Consultation', 'Design Service', 'Full Membership', 'Event Access'], 'dropdown', null,
      { placeholder: 'Select service' }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const cap = (t) => `<div class='${p}-cap'><span class='${p}-cap-t'>${t}</span>`
      + `<i class='${p}-hair'></i></div>`;
    const fld = (label, key, extra = '') => `<label class='${p}-field${extra}'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-card'>`
      + `<div class='${p}-tri-a' role='presentation'></div>`
      + `<div class='${p}-tri-b' role='presentation'></div>`
      + `<div class='${p}-head'>`
      + `<div class='${p}-who'><div class='${p}-avatar' role='presentation'>`
      + `<img class='${p}-content-image' src='{{content:member_photo}}' alt='' aria-hidden='true'></div>`
      + `<div class='${p}-who-t'><div class='${p}-kicker'>Membership Type</div>`
      + `<div class='${p}-h1'>Registration Form</div></div></div>`
      + `<div class='${p}-co'>`
      + `<div class='${p}-co-row'><span class='${p}-co-mark'><i class='${p}-co-dia'></i></span>`
      + `<span class='${p}-co-n'>YOUR COMPANY</span></div>`
      + `<div class='${p}-co-tag'>TAGLINE GOES HERE</div>`
      + `<div class='${p}-co-date'>${fld('Date', 'reg_date')}</div>`
      + `</div></div>`
      + `<div class='${p}-body'>`
      + cap('Personal Information')
      + `<div class='${p}-grid2'>`
      + fld('Full Name *', 'full_name') + fld('Date of Birth *', 'dob')
      + fld('Gender *', 'gender', ` ${p}-span2`)
      + `</div>`
      + cap('Contact &amp; Address')
      + `<div class='${p}-grid2'>`
      + fld('Address', 'address', ` ${p}-span2`)
      + fld('Phone', 'phone') + fld('Membership Type *', 'membership_type')
      + `</div>`
      + cap('Service Information')
      + `<div class='${p}-grid2 ${p}-grid-last'>${fld('Service Required', 'service')}</div>`
      + `<p class='${p}-note'>Please review the answers above before submitting. By clicking submit `
      + `you confirm that all provided information is accurate and complete.</p>`
      + `<div class='${p}-cta'><button class='${p}-submit' type='submit'>Submit Registration`
      + `<span class='${p}-chk' aria-hidden='true'></span></button></div>`
      + `</div></div></div></div></div>`;
  },

  exactCss: `
${wrapperReset('crg')}
@S@{container-type:inline-size;font-family:${INTER}!important;color:#1A1F2B}
@S@.crg-page{padding:40px 0;background:#F4F6F9}
@S@.crg-shell{max-width:768px;margin:0 auto;padding:0 16px}
@S@.crg-back{font-size:16px;line-height:24px}
@S@.crg-back-link{display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;font-size:12px;
  line-height:16px;font-weight:500;color:#6B7280}
@S@.crg-back-ico{display:block;flex:0 0 14px;width:14px;height:14px;
  background:${CRG_ARROW} center/14px 14px no-repeat}
@S@.crg-card{position:relative;overflow:hidden;border:1px solid #DDE3EC;border-radius:16px;
  background:#fff;box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}
/* Two crisp layered wedges complete the rounded corner without an encoded SVG seam. */
@S@.crg-tri-a{position:absolute;left:0;top:0;width:112px;height:68px;pointer-events:none;
  background:#1B4F8C;clip-path:polygon(0 0,100% 0,0 100%);opacity:.92}
@S@.crg-tri-a::after{content:'';position:absolute;left:0;top:0;width:62px;height:36px;
  background:#EAF1FA;clip-path:polygon(0 0,100% 0,0 100%)}
@S@.crg-tri-b{position:absolute;left:0;bottom:0;width:160px;height:64px;pointer-events:none;
  background:rgba(27,79,140,.12);clip-path:polygon(0 100%,56% 100%,0 0)}

/* header ----------------------------------------------------------------- */
@S@.crg-head{position:relative;display:flex;align-items:flex-start;justify-content:space-between;
  gap:24px;padding:40px 32px 24px}
@container (min-width:640px){@S@.crg-head{padding:40px 40px 24px}}
@S@.crg-who{display:flex;align-items:center;gap:16px}
@S@.crg-avatar{flex:0 0 64px;width:64px;height:64px;border:4px solid #EAF1FA;border-radius:999px;
  position:relative;overflow:hidden;
  background-image:${asset(CRG_SLUG, 'registration-avatar.png')};
  background-size:cover;background-position:50% 50%}
@S@img.crg-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 50%!important;
  border:0!important;border-radius:999px!important;pointer-events:none!important}
@S@.crg-kicker{font-size:11px;line-height:1.5;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;color:#1B4F8C}
@S@.crg-h1{font-family:'Bricolage Grotesque',${INTER}!important;font-size:24px;line-height:32px;
  font-weight:700;color:#1A1F2B}
@S@.crg-co{text-align:right}
@S@.crg-co-row{display:flex;align-items:center;justify-content:flex-end;gap:8px}
@S@.crg-co-mark{display:flex;align-items:center;justify-content:center;width:28px;height:28px;
  border-radius:4px;background:#1B4F8C}
@S@.crg-co-dia{display:block;width:12px;height:12px;transform:rotate(45deg);background:#fff}
@S@.crg-co-n{font-family:'Bricolage Grotesque',${INTER}!important;font-size:14px;line-height:20px;
  font-weight:700;letter-spacing:.025em;color:#1A1F2B}
@S@.crg-co-tag{margin-top:2px;font-size:10px;line-height:15px;font-weight:400;
  letter-spacing:.1em;color:#6B7280}
@S@.crg-co-date{margin-top:12px}
/* The header column is shrink-to-fit, so in the mock its width comes from the ONE thing with an
   intrinsic size: Chrome renders a native date input 156px wide at this padding/font (w-40 loses
   to w-full, both are on the element). Our renderer emits a text input, whose intrinsic width is
   different, so state that 156 outright or the whole right column lands 4px off. */
@S@.crg-co-date .mf-input[class]{width:100%!important;min-width:156px}

/* body ------------------------------------------------------------------- */
@S@.crg-body{position:relative;padding:32px}
@container (min-width:640px){@S@.crg-body{padding:32px 40px}}
@S@.crg-cap{display:flex;align-items:center;gap:12px;margin-bottom:16px}
@S@.crg-cap-t{font-size:11px;line-height:1.5;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:#1B4F8C}
@S@.crg-hair{flex:1 1 0;height:1px;display:block;background:#DDE3EC}
@S@.crg-grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px}
@S@.crg-grid-last{margin-bottom:8px}
@S@.crg-span2{grid-column:1/-1}
@S@.crg-field{display:block;margin:0}
@S@.crg-label{display:block;margin:0 0 6px;font-size:12px;line-height:18px;font-weight:600;
  letter-spacing:.025em;text-transform:uppercase;color:#6B7280}
@S@p.crg-note{margin:24px 0 0!important;font-size:11px!important;line-height:1.625!important;
  font-weight:400!important;color:#6B7280!important}
${controlReset()}
${boxedControls({ border: '#DDE3EC', focus: '#1B4F8C', text: 'rgb(8,12,15)', ph: '#94A3B8',
  bg: '#FFFFFF', radius: 8, padY: 10, padX: 14, size: 14, line: 20 })}
/* Date renders as a composite button in both products. Pin its paper chrome too; otherwise the
   host's dark button rule survives even when ordinary inputs have been corrected. */
@S@.crg-field .mf-cal[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid #DDE3EC!important;border-radius:8px!important;background:#FFFFFF!important;
  min-height:42px!important;color:rgb(8,12,15)!important;box-shadow:none!important}

/* gender pills ----------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 16px;
  border:1px solid #DDE3EC;border-radius:9999px;background:#fff;color:#6B7280;font-size:12px;
  line-height:16px;font-weight:600;text-align:center;cursor:pointer;transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;font-weight:600;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:#1B4F8C;border-color:#1B4F8C;
  color:#fff}

/* Date controls. The mock uses a NATIVE date input; our renderer swaps in a button plus a popover,
   so restate what the native control gives the mock for free: ink-coloured text set in 4px from
   the padding edge, and a 10x12 black indicator whose right edge sits 20px off the border.
   Both rules must outrank megaform's own .mf-cal.is-empty and .mf-cal .mf-date-icon. */
@S@.crg-field .mf-cal.is-empty .mf-cal-value,@S@.crg-field .mf-cal-value{
  color:rgb(8,12,15)!important;padding-left:4px;padding-right:24px}
@S@.crg-field .mf-cal .mf-date-icon{position:absolute!important;right:20px!important;
  width:10px!important;height:12px!important;flex:0 0 10px!important;color:#000!important}
@S@.crg-field .mf-cal .mf-date-icon svg{width:10px!important;height:12px!important;
  stroke-width:2!important}

/* CTA -------------------------------------------------------------------- */
@S@.crg-cta{display:flex;justify-content:flex-end;margin-top:32px}
@S@button.crg-submit[type="submit"]{display:inline-flex;align-items:center;gap:6px;
  width:auto!important;padding:10px 24px!important;border:0!important;border-radius:8px!important;
  background:linear-gradient(135deg,#1B4F8C,#0F3564)!important;color:#fff!important;
  font-family:inherit!important;font-size:14px!important;line-height:20px!important;
  font-weight:600!important;letter-spacing:normal!important;text-transform:none!important;
  cursor:pointer!important;box-shadow:none!important}
/* the mock fades a blocked CTA to 40% */
@S@button.crg-submit .crg-chk{display:block;flex:0 0 16px;width:16px;height:16px;
  background:${CRG_CHECK} center/16px 16px no-repeat}
@S@button.crg-submit.mf-nav-blocked,@S@button.crg-submit[disabled]{opacity:.4!important;
  background:linear-gradient(135deg,#1B4F8C,#0F3564)!important;cursor:not-allowed!important}

/* The source mock has no mobile header treatment and clips its company/date column at 390px.
   MegaForm must remain usable in narrower CMS panes, including Oqtane's 230px home column. */
@container (max-width:520px){
@S@.crg-tri-a{width:84px;height:52px}
@S@.crg-tri-a::after{width:46px;height:28px}
@S@.crg-head{flex-direction:column!important;align-items:stretch!important;gap:20px!important;
  padding:32px 20px 22px!important}
@S@.crg-who{min-width:0;gap:12px}
@S@.crg-avatar{flex-basis:56px;width:56px;height:56px}
@S@.crg-who-t{min-width:0}
@S@.crg-h1{font-size:22px;line-height:28px;overflow-wrap:normal}
@S@.crg-co{width:100%;text-align:left}
@S@.crg-co-row{justify-content:flex-start}
@S@.crg-co-date{width:100%;margin-top:14px}
@S@.crg-co-date .mf-input[class],@S@.crg-co-date .mf-cal[class]{width:100%!important;
  min-width:0!important}
@S@.crg-body{padding:26px 20px!important}
@S@.crg-grid2{grid-template-columns:minmax(0,1fr)!important;gap:18px;margin-bottom:28px}
@S@.crg-span2{grid-column:auto}
@S@.crg-cap{gap:8px}
@S@.crg-cap-t{max-width:calc(100% - 20px)}
@S@.crg-cta{margin-top:28px}
@S@button.crg-submit[type="submit"]{justify-content:center;width:100%!important;padding-left:14px!important;
  padding-right:14px!important}
}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// ielts-report — mock: app/forms/ielts-report/page.tsx
//
// Layout, verbatim from the source:
//   main          min-h-screen py-10, background #EEF0F3
//   wrapper       mx-auto max-w-3xl (768px) px-4  -> card 736px
//   card          rounded-lg (8px), border 1px #D6D9DE, shadow-sm
//     header      flex items-start justify-between, px-8 py-6, border-b
//                 left  "IELTS" 30px/36 800 tracking-tight, then 14px/20 600 "Test Report Form"
//                 right "Academic" badge, 1.5px border, px-3 py-1.5, 12px/16 700 uppercase
//     note        px-8 py-3, background #F4F5F7, 11px leading-relaxed, "NOTE" in ink
//     body        px-8 py-6
//       meta      3 columns gap-4, each rounded-md p-2 on #F4F5F7; the DATE cell prints
//                 new Date().toLocaleDateString('en-GB') and CANDIDATE NUMBER mirrors the
//                 candidate-id field, falling back to an em dash - both are scripted here
//       fields    grid gap-4 sm:grid-cols-2, boxed inputs rounded-md px-3 py-2 (38px tall)
//       scores    grid-cols-5 gap-3 - four fixed band cards plus ONE select card, border-2 red,
//                 whose select is bare: transparent, centred, 18px/28 700
//       footer    flex justify-between - administrator comment box + 96px validation stamp ring
//       cta       right-aligned, #111318, rounded-md px-6 py-2.5, fades to 40% while blocked
//
// Placeholder colour here is Tailwind's DEFAULT (currentColor at 50%), not slate-400: this mock's
// inputClass carries no placeholder: utility. The selects DO carry an inline #94A3B8 when empty.
// ─────────────────────────────────────────────────────────────────────────────
const IEL_SLUG = 'ielts-report-classic';
const IEL_ARROW = lucideArrowLeft('#6B7280');
const IEL_CHECK = lucideCheck('#ffffff');

const IEL = {
  slug: IEL_SLUG,
  title: 'IELTS Test Report Form',
  description:
    'An IELTS test report record: bordered document card with the IELTS lockup and an ACADEMIC '
    + 'badge, the printed admissions note, a centre/date/candidate strip, candidate detail fields, '
    + 'a five-column band row whose overall band is chosen from a select, and an administrator '
    + 'comment box beside a validation stamp ring. Transcribed from the ielts-report mock.',
  category: 'education',
  categories: ['education', 'premium', 'assessment'],
  icon: 'file-text',
  prefix: 'iel',
  outerBorder: false,   // .iel-card already draws it
  fontStack: INTER,
  fontImport:
    `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800`
    + `&display=swap');`,
  submitLabel: 'Submit Report',
  successTitle: 'Report Submitted',
  successMessage: 'Report submitted.',
  successBody: 'Candidate record for {{field:first_name}} {{field:family_name}} '
    + '(ID {{field:candidate_id}}) has been saved.',
  palette: {
    primary: '#111318', accent: '#B3242A', surface: '#FFFFFF', text: '#111318',
    muted: '#6B7280', border: '#D6D9DE', onPrimary: '#FFFFFF', deco: '#F4F5F7', page: '#EEF0F3',
  },

  exactFields: [
    field('family_name', 'Text', 'Family Name *', { required: true, placeholder: 'NGUYEN' }),
    field('first_name', 'Text', 'First Name(s) *', { required: true, placeholder: 'Thi Anh' }),
    field('candidate_id', 'Text', 'Candidate ID *', { required: true, placeholder: '000123456' }),
    field('dob', 'Date', 'Date of Birth *', { required: true, placeholder: 'mm/dd/yyyy' }),
    choiceField('country', 'Select', 'Country of Nationality',
      ['Vietnam', 'India', 'China', 'Brazil', 'Nigeria', 'Philippines', 'South Korea', 'Other'],
      'dropdown', null, { placeholder: 'Select country' }),
    field('first_language', 'Text', 'First Language', { placeholder: 'Vietnamese' }),
    choiceField('overall_band', 'Select', 'Overall Band *',
      ['4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'],
      'dropdown', null, { required: true, placeholder: '–' }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const meta = (k, v, echo = '') => `<div class='${p}-meta-c'><div class='${p}-meta-k'>${k}</div>`
      + `<div class='${p}-meta-v'${echo}>${v}</div></div>`;
    const band = (v, k) => `<div class='${p}-score'><div class='${p}-score-v'>${v}</div>`
      + `<div class='${p}-score-k'>${k}</div></div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'>`
      + `<div class='${p}-card'>`
      + `<div class='${p}-head'><div class='${p}-head-l'>`
      + `<div class='${p}-brand'>IELTS</div>`
      + `<div class='${p}-sub'>Test Report Form</div></div>`
      + `<span class='${p}-badge'>Academic</span></div>`
      + `<div class='${p}-note'><span class='${p}-note-k'>NOTE</span> Admission to undergraduate `
      + `and postgraduate courses should be based on the ACADEMIC Reading and Writing Modules. `
      + `GENERAL TRAINING Reading and Writing Modules are designed to test the range of language `
      + `skills required for social and workplace purposes.</div>`
      + `<div class='${p}-body'>`
      + `<div class='${p}-meta'>`
      + meta('Centre Number', 'UK047')
      + meta('Date', '', ` data-${p}='today'`)
      + meta('Candidate Number', '&mdash;', ` data-${p}='cand'`)
      + `</div>`
      + `<h2 class='${p}-h2'>Candidate Details</h2>`
      + `<div class='${p}-grid2'>`
      + fld('Family Name *', 'family_name') + fld('First Name(s) *', 'first_name')
      + fld('Candidate ID *', 'candidate_id') + fld('Date of Birth *', 'dob')
      + fld('Country of Nationality', 'country') + fld('First Language', 'first_language')
      + `</div>`
      + `<h2 class='${p}-h2 ${p}-h2-b'>Test Results</h2>`
      + `<div class='${p}-scores'>`
      + band('9.0', 'Listening') + band('8.5', 'Reading')
      + band('7.0', 'Writing') + band('7.0', 'Speaking')
      + `<div class='${p}-score ${p}-score-band'>`
      + `<div class='${p}-band-w'>{{field:overall_band}}</div>`
      + `<div class='${p}-band-k'>Overall Band *</div></div>`
      + `</div>`
      + `<div class='${p}-foot'>`
      + `<div class='${p}-admin'><div class='${p}-admin-k'>Administrator Comments</div>`
      + `<div class='${p}-admin-v'>Reserved for administrator use only</div></div>`
      + `<div class='${p}-stamp'><span class='${p}-stamp-t'>Validation<br>Stamp</span></div>`
      + `</div>`
      + `<div class='${p}-cta'><button class='${p}-submit' type='submit'>Submit Report`
      + `<span class='${p}-chk' aria-hidden='true'></span></button></div>`
      + `{{script:iel_meta}}`
      + `</div></div></div></div></div>`;
  },

  // The mock prints today's date and mirrors the candidate id into the strip. A private data-iel
  // attribute, NOT data-mf-echo: the renderer owns that one and blanks any node whose key is not
  // a field, which is exactly what these two nodes are.
  customScripts: {
    iel_meta: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  function put(k, v){ var n = scope.querySelector('[data-iel="' + k + '"]'); if (n) n.textContent = v; }
  put('today', new Date().toLocaleDateString('en-GB'));
  function cand(){
    var i = scope.querySelector('[name="candidate_id"]');
    put('cand', (i && i.value) ? i.value : '\\u2014');
  }
  scope.addEventListener('input', cand, true);
  scope.addEventListener('change', cand, true);
  cand();
})();`,
  },

  exactCss: `
${wrapperReset('iel')}
@S@{container-type:inline-size;font-family:${INTER}!important;color:#111318}
@S@.iel-page{padding:40px 0;background:#EEF0F3}
@S@.iel-shell{max-width:768px;margin:0 auto;padding:0 16px}
@S@.iel-back{font-size:16px;line-height:24px}
@S@.iel-back-link{display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;font-size:12px;
  line-height:16px;font-weight:500;color:#6B7280}
@S@.iel-back-ico{display:block;flex:0 0 14px;width:14px;height:14px;
  background:${IEL_ARROW} center/14px 14px no-repeat}
@S@.iel-card{border:1px solid #D6D9DE;border-radius:8px;background:#fff;
  box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}

/* header ----------------------------------------------------------------- */
@S@.iel-head{display:flex;align-items:flex-start;justify-content:space-between;
  padding:24px 32px;border-bottom:1px solid #D6D9DE}
@S@.iel-brand{font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.025em;color:#111318}
@S@.iel-sub{margin-top:4px;font-size:14px;line-height:20px;font-weight:600;color:#111318}
@S@.iel-badge{display:inline-block;padding:6px 12px;border:1.5px solid #111318;border-radius:6px;
  font-size:12px;line-height:16px;font-weight:700;letter-spacing:.025em;text-transform:uppercase;
  color:#111318}
@S@.iel-note{padding:12px 32px;background:#F4F5F7;font-size:11px;line-height:1.625;color:#6B7280}
@S@.iel-note-k{font-weight:700;color:#111318}

/* body ------------------------------------------------------------------- */
@S@.iel-body{padding:24px 32px}
@S@.iel-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;
  padding-bottom:24px;border-bottom:1px solid #D6D9DE}
@S@.iel-meta-c{padding:8px;border-radius:6px;background:#F4F5F7}
@S@.iel-meta-k{font-size:10px;line-height:1.5;font-weight:600;text-transform:uppercase;
  color:#6B7280}
@S@.iel-meta-v{margin-top:4px;font-size:14px;line-height:20px;font-weight:500;color:#111318}
@S@h2.iel-h2{margin:0 0 16px!important;font-size:14px!important;line-height:20px!important;
  font-weight:700!important;letter-spacing:.025em!important;text-transform:uppercase!important;
  color:#111318!important}
@S@h2.iel-h2-b{margin-top:32px!important}
@S@.iel-grid2{display:grid;grid-template-columns:1fr;gap:16px}
@container (min-width:640px){@S@.iel-grid2{grid-template-columns:1fr 1fr}}
@S@.iel-field{display:block;margin:0}
@S@.iel-label{display:block;margin:0 0 4px;font-size:11px;line-height:1.5;font-weight:600;
  letter-spacing:.025em;text-transform:uppercase;color:#6B7280}
${controlReset()}
${boxedControls({ border: '#D6D9DE', focus: '#111318', text: 'rgb(8,12,15)',
  ph: 'rgba(8,12,15,.5)', bg: '#FFFFFF', radius: 6, padY: 8, padX: 12, size: 14, line: 20,
  greyEmpty: false })}
/* The selects carry their empty colour inline in the mock; the inputs do not, so this cannot come
   out of boxedControls' single ph value. */
@S@.mf-select[class]:invalid,@S@.mf-select[class]:has(option[value=""]:checked){
  color:#94A3B8!important}

/* Date control: the mock's is native, ours is a button + popover. Same treatment as every other
   exact conversion - ink text inset 4px, 10x12 black indicator 20px off the right border. */
@S@.iel-field .mf-cal.is-empty .mf-cal-value,@S@.iel-field .mf-cal-value{
  color:rgb(8,12,15)!important;padding-left:4px;padding-right:24px}
@S@.iel-field .mf-cal .mf-date-icon{position:absolute!important;right:20px!important;
  width:10px!important;height:12px!important;flex:0 0 10px!important;color:#000!important}
@S@.iel-field .mf-cal .mf-date-icon svg{width:10px!important;height:12px!important;
  stroke-width:2!important}

/* band row --------------------------------------------------------------- */
@S@.iel-scores{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
@S@.iel-score{padding:12px;border:1px solid #D6D9DE;border-radius:6px;text-align:center}
@S@.iel-score-v{font-size:18px;line-height:28px;font-weight:700;color:#111318}
@S@.iel-score-k{margin-top:2px;font-size:10px;line-height:1.5;font-weight:400;
  letter-spacing:.025em;text-transform:uppercase;color:#6B7280}
@S@.iel-score-band{border:2px solid #B3242A}
@S@.iel-band-k{margin-top:2px;font-size:10px;line-height:1.5;font-weight:600;letter-spacing:.025em;
  text-transform:uppercase;color:#B3242A}
/* the overall-band select is bare in the mock: no border, no fill, centred 18px/28 bold */
@S@.iel-band-w .mf-select[class]{border:0!important;border-radius:0!important;
  background:transparent!important;padding:0!important;text-align:center!important;
  text-align-last:center!important;font-size:18px!important;line-height:28px!important;
  font-weight:700!important;color:#B3242A!important}
@S@.iel-band-w .mf-select[class]:invalid,
@S@.iel-band-w .mf-select[class]:has(option[value=""]:checked){color:#94A3B8!important}
/* megaform paints its own chevron beside a select (.mf-select-chevron, absolutely positioned in
   .mf-select-wrap) and reserves 42px of padding for it; the mock's band select has neither. */
@S@.iel-band-w .mf-select-chevron{display:none!important}
@S@.iel-band-w .mf-select-wrap .mf-select[class]{padding-right:0!important}

/* footer ----------------------------------------------------------------- */
@S@.iel-foot{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;
  margin-top:32px;padding-top:24px;border-top:1px solid #D6D9DE}
@S@.iel-admin{flex:1 1 0;padding:12px;border:1px solid #D6D9DE;border-radius:6px;background:#F4F5F7}
@S@.iel-admin-k{font-size:10px;line-height:1.5;font-weight:600;text-transform:uppercase;
  color:#6B7280}
@S@.iel-admin-v{margin-top:8px;height:56px;font-size:14px;line-height:20px;font-weight:400;
  font-style:italic;color:#B0B4BC}
@S@.iel-stamp{display:flex;align-items:center;justify-content:center;flex:0 0 96px;width:96px;
  height:96px;border:2px solid #B3242A;border-radius:9999px;text-align:center}
@S@.iel-stamp-t{font-size:9px;line-height:1.25;font-weight:700;text-transform:uppercase;
  color:#B3242A}

/* CTA -------------------------------------------------------------------- */
@S@.iel-cta{display:flex;justify-content:flex-end;margin-top:32px}
@S@button.iel-submit[type="submit"]{display:inline-flex;align-items:center;gap:6px;
  width:auto!important;padding:10px 24px!important;border:0!important;border-radius:6px!important;
  background:#111318!important;color:#fff!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;font-weight:600!important;
  letter-spacing:normal!important;text-transform:none!important;cursor:pointer!important;
  box-shadow:none!important}
@S@button.iel-submit .iel-chk{display:block;flex:0 0 16px;width:16px;height:16px;
  background:${IEL_CHECK} center/16px 16px no-repeat}
@S@button.iel-submit.mf-nav-blocked,@S@button.iel-submit[disabled]{opacity:.4!important;
  background:#111318!important;cursor:not-allowed!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// massage-intake / massage-bodychart — mocks: app/forms/massage-{intake,bodychart}/page.tsx
//
// The two share one shell, so the pieces both need are built once here:
//   card        rounded-2xl, p-8 / sm:p-12, background #FFFDF8, border 1px #E4D9C4
//   logo badge  absolute right-8 top-8 (sm right-12 top-10): 64px gold ring with lucide Flower2,
//               then "YOUR LOGO HERE" at 9px/600, tracking .1em
//   controls    UNDERLINE: border-bottom 1px #E4D9C4, padding 0 0 6px, 14px/20 #3A342C,
//               placeholder #BDB29A, focus thickens the rule to 2px
//   chips       rounded-full, 12px/600, transparent on #E4D9C4 until picked
//
// MEASURED, not assumed: the mock asks next/font for Playfair 500/600/700 and then renders an h1
// at font-weight 400, so the browser falls back to the nearest cut. The @import here asks for the
// SAME weights so the same fallback happens; asking for a real 400 would render a different face.
// The signature input names var(--font-playfair), which next/font never defines here (no
// `variable` option), so it renders in Inter - copying "Playfair" there would be a fabrication.
// ─────────────────────────────────────────────────────────────────────────────
const SPA_FONTS =
  `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600`
  + `&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700&display=swap');`;

// lucide <Flower2/>, verbatim from lucide-react v0.564.0 icons/flower-2.js
const spaFlower = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'
  fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
  <path d='M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1'/>
  <circle cx='12' cy='8' r='2'/><path d='M12 10v12'/>
  <path d='M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z'/>
  <path d='M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z'/></svg>`);

/** The card, the gold logo badge and the underline controls both spa mocks draw. */
const spaShellCss = (p, { rule, ink = '#3A342C', muted = '#8A8070', border = '#E4D9C4' }) => `
@S@.${p}-card{position:relative;padding:32px;border:1px solid ${border};border-radius:16px;
  background:#FFFDF8;box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}
@container (min-width:640px){@S@.${p}-card{padding:48px}}
@S@.${p}-logo{position:absolute;right:32px;top:32px;display:flex;flex-direction:column;
  align-items:center;gap:4px;text-align:center}
@container (min-width:640px){@S@.${p}-logo{right:48px;top:40px}}
@S@.${p}-logo-ring{display:flex;align-items:center;justify-content:center;width:64px;height:64px;
  border:1.5px solid #C9A24B;border-radius:9999px}
@S@.${p}-logo-ico{display:block;width:24px;height:24px;
  background:${spaFlower('#C9A24B')} center/24px 24px no-repeat}
@S@.${p}-logo-t{font-size:9px;line-height:1.5;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;color:${muted}}
@S@.${p}-rule{margin-top:16px;height:1px;width:100%;background:${border}}
@S@.${p}-field{display:block;margin:0}
@S@.${p}-label{display:block;margin:0 0 4px;font-size:12px;line-height:1.5;font-weight:500;
  color:${muted}}

/* underline controls ------------------------------------------------------ */
@S@.mf-input[class],@S@.mf-select[class],@S@.mf-textarea[class]{width:100%!important;
  box-sizing:border-box!important;border:0!important;border-bottom:1px solid ${border}!important;
  border-radius:0!important;background:transparent!important;padding:0 0 6px!important;
  min-height:0!important;height:auto!important;color:${ink}!important;font-family:inherit!important;
  font-size:14px!important;line-height:20px!important;font-weight:400!important;
  box-shadow:none!important}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus,@S@.mf-textarea[class]:focus{
  border-bottom-width:2px!important;outline:none!important;box-shadow:none!important}
@S@.mf-input[class]::placeholder,@S@.mf-textarea[class]::placeholder{color:#BDB29A!important;
  opacity:1}
@S@.mf-textarea[class]{resize:none!important}
/* The mock's controls are INLINE-BLOCK inside a 16px/24px block, so each sits on a line box whose
   strut pushes it 3px below the label; megaform makes them block and closed that gap, walking
   every row under the date 5px up the card. Both halves matter - inline-block with the wrong
   line-height moves it the other way. */
@S@.mf-field-group,@S@.mf-date-input-wrap{font-size:16px!important;line-height:24px!important}
@S@.mf-input[class],@S@.mf-select[class],@S@.mf-textarea[class],@S@.mf-cal-trigger[class]{
  display:inline-block!important;vertical-align:baseline!important}
/* the mock's date field is native: ink text, black indicator, no button chrome */
@S@.${p}-field .mf-cal.is-empty .mf-cal-value,@S@.${p}-field .mf-cal-value{
  color:rgb(8,12,15)!important;padding-left:0;padding-right:24px}
@S@.${p}-field .mf-cal .mf-date-icon{position:absolute!important;right:2px!important;
  width:10px!important;height:12px!important;flex:0 0 10px!important;color:#000!important}
@S@.${p}-field .mf-cal .mf-date-icon svg{width:10px!important;height:12px!important;
  stroke-width:2!important}

/* pill chips -------------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;gap:0;padding:6px 16px;
  border:1px solid ${border};border-radius:9999px;background:transparent;color:${muted};
  font-size:12px;line-height:16px;font-weight:600;text-align:center;cursor:pointer;
  transition:all .15s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:12px;line-height:16px;font-weight:600;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{background:${rule};border-color:${rule};
  color:#fff}
`;

const MSI = {
  slug: 'massage-intake-sage',
  title: 'Massage Therapy — Client Intake',
  description:
    'A spa client intake sheet: cream card with a gold logo ring, an italic Playfair masthead, '
    + 'three underlined detail fields, two yes/no pill questions, a four-column grid of medical '
    + 'conditions and a rounded gradient CTA. Transcribed from the massage-intake mock.',
  category: 'health',
  categories: ['health', 'premium', 'wellness'],
  icon: 'flower',
  prefix: 'msi',
  outerBorder: false,   // .msi-card already draws it
  fontStack: INTER,
  fontImport: SPA_FONTS,
  submitLabel: 'Submit Intake Form',
  successTitle: 'Intake received',
  successMessage: 'Intake received.',
  successBody: 'Thank you, {{field:full_name}}. Your intake form has been recorded ahead of your '
    + 'session.',
  palette: {
    primary: '#586B4A', accent: '#7C8F6E', surface: '#FFFDF8', text: '#3A342C',
    muted: '#8A8070', border: '#E4D9C4', onPrimary: '#FFFFFF', deco: '#C9A24B', page: '#F7F1E6',
  },

  exactFields: [
    field('full_name', 'Text', 'Name *', { required: true, placeholder: 'Full name' }),
    field('phone', 'Text', 'Phone *', { required: true, placeholder: '+1 (555) 000-0000' }),
    field('dob', 'Date', 'Date of Birth *', { required: true, placeholder: 'mm/dd/yyyy' }),
    choiceField('had_massage', 'Radio', 'Have you received massage therapy before? *',
      ['Yes', 'No'], 'chips', null, { required: true }),
    choiceField('pregnant', 'Radio', 'Are you currently pregnant? *',
      ['Yes', 'No'], 'chips', null, { required: true }),
    choiceField('conditions', 'Checkbox',
      'Please mark any of the following conditions you currently have', [
        'Cancer', 'Headaches / Migraines', 'Fibromyalgia', 'Arthritis', 'Kidney Dysfunction',
        'Stroke', 'Diabetes', 'Recent Cold / Flu', 'Sprains or Strains', 'Alcohol within 24hrs',
        'Numbness', 'Heart Attack', 'Phlebitis', 'High Blood Pressure', 'Varicose Veins',
        'Acute Pain', 'Chronic Pain', 'Recent Surgery', 'Open Wounds', 'Osteoporosis',
      ], 'list', 4),
    field('notes', 'Textarea', 'Additional notes, allergies or sensitivities', {
      placeholder: 'Please share any details we should know before your session…',
    }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;
    const yn = (label, key) => `<label class='${p}-yn'><span class='${p}-yn-t'>${label}</span>`
      + `{{field:${key}}}</label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'><div class='${p}-card'>`
      + `<div class='${p}-logo'><span class='${p}-logo-ring'>`
      + `<span class='${p}-logo-ico' aria-hidden='true'></span></span>`
      + `<span class='${p}-logo-t'>Your Logo Here</span></div>`
      + `<h1 class='${p}-h1'>Massage Therapy</h1>`
      + `<p class='${p}-kicker'>Client Intake Form</p>`
      + `<div class='${p}-rule'></div>`
      + `<div class='${p}-grid'>`
      + fld('Name *', 'full_name') + fld('Phone *', 'phone') + fld('Date of Birth *', 'dob')
      + `</div>`
      + `<p class='${p}-say'>Please answer the questions below</p>`
      + `<div class='${p}-yns'>`
      + yn('Have you received massage therapy before? *', 'had_massage')
      + yn('Are you currently pregnant? *', 'pregnant')
      + `</div>`
      + `<div class='${p}-cond'>`
      + `<p class='${p}-say ${p}-say-b'>Please mark any of the following conditions you `
      + `currently have</p>{{field:conditions}}</div>`
      + `<div class='${p}-notes'>${fld('Additional notes, allergies or sensitivities', 'notes')}</div>`
      + `<div class='${p}-cta'><button class='${p}-submit' type='submit'>Submit Intake Form`
      + `<span class='${p}-chk' aria-hidden='true'></span></button></div>`
      + `</div></div></div></div>`;
  },

  exactCss: `
${wrapperReset('msi')}
@S@{container-type:inline-size;font-family:${INTER}!important;color:#3A342C}
@S@.msi-page{padding:40px 0;background:#F7F1E6}
@S@.msi-shell{max-width:768px;margin:0 auto;padding:0 16px}
${spaShellCss('msi', { rule: '#586B4A' })}
@S@h1.msi-h1{margin:0!important;font-family:${PLAYFAIR}!important;font-size:36px!important;
  line-height:40px!important;font-weight:400!important;font-style:italic!important;
  color:#586B4A!important}
@container (min-width:640px){@S@h1.msi-h1{font-size:48px!important;line-height:48px!important}}
@S@p.msi-kicker{margin:8px 0 0!important;font-size:13px!important;line-height:1.5!important;
  font-weight:600!important;letter-spacing:.2em!important;text-transform:uppercase!important;
  color:#3A342C!important}
@S@.msi-grid{display:grid;grid-template-columns:1fr;gap:20px;margin-top:24px}
@container (min-width:640px){@S@.msi-grid{grid-template-columns:1fr 1fr}}
@S@p.msi-say{margin:32px 0 0!important;font-size:12px!important;line-height:1.5!important;
  font-weight:600!important;letter-spacing:.1em!important;text-transform:uppercase!important;
  color:#586B4A!important}
@S@p.msi-say-b{margin:0 0 12px!important}
@S@.msi-yns{display:flex;flex-direction:column;gap:16px;margin-top:16px}
@S@.msi-yn{display:flex;flex-direction:column;gap:8px;margin:0}
@container (min-width:640px){@S@.msi-yn{flex-direction:row;align-items:center;
  justify-content:space-between}}
@S@.msi-yn-t{font-size:13px;line-height:1.5;font-weight:400;color:#3A342C}
/* megaform gives every field group flex:0 0 100%, which squeezed the question down to the width
   of its longest WORD and stacked the chips under it. */
@S@.msi-yn>.mf-field-group{flex:0 0 auto!important;width:auto!important}
@S@.msi-yn>.msi-yn-t{flex:0 1 auto}
@S@.msi-yn .mf-option-group--chips .mf-option-ui{padding:4px 16px}
@S@.msi-cond{margin-top:32px}
@S@.msi-notes{margin-top:32px}
@S@.msi-notes .mf-textarea[class]{height:67px!important}
${controlReset()}
/* the conditions grid: 16px box, 1.5px rule, 12px label on a 1.25 leading */
@S@.msi-cond .mf-option-group[class]{display:grid!important;
  grid-template-columns:repeat(2,1fr)!important;column-gap:24px!important;row-gap:8px!important;
  margin:0!important;padding:0!important}
@container (min-width:640px){@S@.msi-cond .mf-option-group[class]{
  grid-template-columns:repeat(4,1fr)!important}}
@S@.msi-cond .mf-option-item{display:flex!important;align-items:flex-start;gap:8px;margin:0!important;
  padding:0!important;border:0!important;background:transparent!important;cursor:pointer}
@S@.msi-cond .mf-option-control{appearance:none;-webkit-appearance:none;flex:0 0 16px;width:16px;
  height:16px;margin:2px 0 0;border:1.5px solid #E4D9C4;border-radius:3px;background:transparent;
  cursor:pointer}
@S@.msi-cond .mf-option-control:checked{border-color:#586B4A;
  background:#586B4A ${lucideCheck('#ffffff')} center/10px 10px no-repeat}
@S@.msi-cond .mf-option-ui{display:block;flex:0 1 auto;padding:0;border:0;background:transparent}
@S@.msi-cond .mf-option-label{font-size:12px;line-height:1.25;font-weight:400;color:#3A342C}

/* CTA -------------------------------------------------------------------- */
@S@.msi-cta{display:flex;justify-content:flex-end;margin-top:40px}
@S@button.msi-submit[type="submit"]{display:inline-flex;align-items:center;gap:6px;
  width:auto!important;padding:10px 28px!important;border:0!important;
  border-radius:9999px!important;background:linear-gradient(135deg,#7C8F6E,#586B4A)!important;
  color:#fff!important;font-family:inherit!important;font-size:14px!important;
  line-height:20px!important;font-weight:600!important;letter-spacing:normal!important;
  text-transform:none!important;cursor:pointer!important;box-shadow:none!important}
@S@button.msi-submit .msi-chk{display:block;flex:0 0 16px;width:16px;height:16px;
  background:${lucideCheck('#ffffff')} center/16px 16px no-repeat}
@S@button.msi-submit.mf-nav-blocked,@S@button.msi-submit[disabled]{opacity:.4!important;
  background:linear-gradient(135deg,#7C8F6E,#586B4A)!important;cursor:not-allowed!important}
`,
};

// The body outlines, verbatim from the mock's inline <svg> (90x200, stroke #B9714A).
const MBC_BODY = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='90' height='200'
  viewBox='0 0 90 200' fill='none'>
  <ellipse cx='45' cy='20' rx='14' ry='16' stroke='#B9714A' stroke-width='1.5'/>
  <path d='M45 36 L45 60 M31 44 Q22 50 20 80 M59 44 Q68 50 70 80 M45 60 Q30 64 28 100 Q27 130 32 160 L38 196 M45 60 Q60 64 62 100 Q63 130 58 160 L52 196 M28 100 L20 80 M62 100 L70 80'
    stroke='#B9714A' stroke-width='1.5' fill='none' stroke-linecap='round'/>
  <path d='M45 60 Q45 90 45 130' stroke='#B9714A' stroke-width='1' stroke-dasharray='2 3'/>
</svg>`);

const MBC = {
  slug: 'massage-bodychart-terracotta',
  title: 'Massage Session Plan & Body Chart',
  description:
    'A spa session plan: cream card with a gold logo ring, two body outlines to mark discomfort, '
    + 'underlined questions with pill answers for massage type and pressure, the consent '
    + 'paragraph, and a signature line beside today\'s date. Transcribed from the '
    + 'massage-bodychart mock.',
  category: 'health',
  categories: ['health', 'premium', 'wellness'],
  icon: 'clipboard-list',
  prefix: 'mbc',
  outerBorder: false,   // .mbc-card already draws it
  fontStack: INTER,
  fontImport: SPA_FONTS,
  submitLabel: 'Submit & Sign',
  successTitle: 'Session plan saved',
  successMessage: 'Session plan saved.',
  successBody: 'Signed by {{field:signature}}. Your therapist will review this before your '
    + 'treatment begins.',
  palette: {
    primary: '#8C5333', accent: '#B9714A', surface: '#FFFDF8', text: '#3A342C',
    muted: '#8A8070', border: '#E4D9C4', onPrimary: '#FFFFFF', deco: '#C9A24B', page: '#F7F1E6',
  },

  exactFields: [
    field('focus_area', 'Textarea', 'What area would you like to focus on today?', {
      placeholder: 'e.g. lower back and shoulders',
    }),
    choiceField('massage_type', 'Radio', 'What type of massage are you seeking today? *',
      ['Swedish / Relaxation', 'Therapeutic / Deep Tissue'], 'chips', null, { required: true }),
    choiceField('pressure', 'Radio', 'What pressure do you prefer? *',
      ['Light', 'Medium', 'Deep'], 'chips', null, { required: true }),
    choiceField('avoid_areas', 'Radio', 'Any areas you would NOT like massaged? *',
      ['Yes', 'No'], 'chips', null, { required: true }),
    field('avoid_explain', 'Text', 'If yes, please explain', {
      placeholder: 'e.g. recent knee surgery',
    }),
    field('goals', 'Textarea', 'What are your goals for this treatment session?', {
      placeholder: 'e.g. reduce tension and improve mobility',
    }),
    field('signature', 'Signature', 'Signature *', {
      required: true,
      widgetProps: {
        height: 88,
        placeholderText: 'Sign here',
        clearText: 'Clear',
        undoText: 'Undo',
      },
    }),
  ],

  shellHtml: (s) => {
    const p = s.prefix;
    const fld = (label, key) => `<label class='${p}-field'>`
      + `<span class='${p}-label'>${label}</span>{{field:${key}}}</label>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-page'><div class='${p}-shell'><div class='${p}-card'>`
      + `<div class='${p}-logo'><span class='${p}-logo-ring'>`
      + `<span class='${p}-logo-ico' aria-hidden='true'></span></span>`
      + `<span class='${p}-logo-t'>Your Logo Here</span></div>`
      + `<h1 class='${p}-h1'>Session Plan &amp; Body Chart</h1>`
      + `<p class='${p}-lede'>Please circle areas of discomfort and answer the questions below.</p>`
      + `<div class='${p}-rule'></div>`
      + `<div class='${p}-charts'>`
      + `<div class='${p}-chart'><span class='${p}-body' aria-hidden='true'></span>`
      + `<span class='${p}-chart-t'>Front</span></div>`
      + `<div class='${p}-chart'><span class='${p}-body' aria-hidden='true'></span>`
      + `<span class='${p}-chart-t'>Back</span></div>`
      + `</div>`
      + `<div class='${p}-stack'>`
      + `<div>${fld('What area would you like to focus on today?', 'focus_area')}</div>`
      + `<div>${fld('What type of massage are you seeking today? *', 'massage_type')}</div>`
      + `<div>${fld('What pressure do you prefer? *', 'pressure')}</div>`
      + `<div class='${p}-split'>`
      + `<div class='${p}-split-a'>${fld('Any areas you would NOT like massaged? *', 'avoid_areas')}</div>`
      + `<div class='${p}-split-b'>${fld('If yes, please explain', 'avoid_explain')}</div>`
      + `</div>`
      + `<div>${fld('What are your goals for this treatment session?', 'goals')}</div>`
      + `<p class='${p}-consent'>I agree that the above information is accurate to the best of my `
      + `knowledge and give permission to be massaged today. I understand that massage therapy is `
      + `for the purpose of stress reduction, relief from muscular tension or spasm, or for `
      + `increasing circulation. I understand that the massage therapist does not diagnose illness, `
      + `disease, or any other physical or mental disorder.</p>`
      + `<div class='${p}-sign'>`
      + `<div class='${p}-sign-a'><div class='${p}-field'>`
      + `<span class='${p}-label'>Signature *</span>{{field:signature}}</div></div>`
      + `<div class='${p}-sign-b'>Date<div class='${p}-sign-d' data-mbc='today'></div></div>`
      + `</div></div>`
      + `<div class='${p}-cta'><button class='${p}-submit' type='submit'>Submit &amp; Sign`
      + `<span class='${p}-chk' aria-hidden='true'></span></button></div>`
      + `{{script:mbc_today}}`
      + `</div></div></div></div>`;
  },

  // The mock stamps the signature line with today's date in the browser's own locale.
  customScripts: {
    mbc_today: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  var n = scope.querySelector('[data-mbc="today"]');
  if (n) n.textContent = new Date().toLocaleDateString();
})();`,
  },

  exactCss: `
${wrapperReset('mbc')}
@S@{container-type:inline-size;font-family:${INTER}!important;color:#3A342C}
@S@.mbc-page{padding:40px 0;background:#F7F1E6}
@S@.mbc-shell{max-width:768px;margin:0 auto;padding:0 16px}
${spaShellCss('mbc', { rule: '#8C5333' })}
@S@h1.mbc-h1{margin:0!important;font-family:${PLAYFAIR}!important;font-size:24px!important;
  line-height:32px!important;font-weight:700!important;color:#8C5333!important}
@container (min-width:640px){@S@h1.mbc-h1{font-size:30px!important;line-height:36px!important}}
@S@p.mbc-lede{margin:8px 0 0!important;font-size:14px!important;line-height:20px!important;
  font-weight:400!important;color:#8A8070!important}
@S@.mbc-charts{display:flex;justify-content:center;gap:64px;margin-top:32px}
@S@.mbc-chart{display:flex;flex-direction:column;align-items:center;gap:8px}
@S@.mbc-body{display:block;width:90px;height:200px;background:${MBC_BODY} center/90px 200px no-repeat}
@S@.mbc-chart-t{font-size:11px;line-height:1.5;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;color:#8A8070}
@S@.mbc-stack{display:flex;flex-direction:column;gap:24px;margin-top:40px}
@S@.mbc-split{display:flex;flex-direction:column;gap:12px}
@container (min-width:640px){@S@.mbc-split{flex-direction:row;align-items:flex-start;gap:24px}
@S@.mbc-split-a{width:50%}@S@.mbc-split-b{flex:1 1 0}}
@S@p.mbc-consent{margin:0!important;font-size:11px!important;line-height:1.625!important;
  font-weight:400!important;color:#8A8070!important}
@S@.mbc-sign{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;
  padding-top:16px}
@S@.mbc-sign-a{flex:1 1 0}
@S@.mbc-sign-b{flex:0 0 auto;text-align:right;font-size:12px;line-height:1.5;font-weight:400;
  color:#8A8070}
@S@.mbc-sign-d{font-weight:500;color:#3A342C}
@S@.mbc-sign-a .mf-signature-field{display:flex;flex-direction:column;width:100%}
@S@.mbc-sign-a .mf-signature-canvas-wrap{overflow:hidden;min-height:88px;border:0;
  border-bottom:1px solid #B9714A;border-radius:0;background:transparent}
@S@.mbc-sign-a canvas.mf-signature-canvas{display:block;width:100%;height:88px;
  border:0;border-radius:0;background:transparent;touch-action:none}
@S@.mbc-sign-a .mf-signature-placeholder{color:#8A8070;font-size:12px}
@S@.mbc-sign-a .mf-signature-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:5px}
@S@.mbc-sign-a .mf-sig-clear,@S@.mbc-sign-a .mf-sig-undo{min-height:28px;padding:4px 8px;
  border:1px solid #E4D9C4;border-radius:9999px;background:#FFFDF8;color:#8A8070;
  font:500 11px/18px 'Inter',system-ui,sans-serif;text-transform:none;box-shadow:none}
${controlReset()}
/* the yes/no row is the ONE chip set the mock pads 4px instead of 6px */
@S@.mbc-split-a .mf-option-group--chips .mf-option-ui{padding:4px 16px}

/* CTA -------------------------------------------------------------------- */
@S@.mbc-cta{display:flex;justify-content:flex-end;margin-top:40px}
@S@button.mbc-submit[type="submit"]{display:inline-flex;align-items:center;gap:6px;
  width:auto!important;padding:10px 28px!important;border:0!important;
  border-radius:9999px!important;background:linear-gradient(135deg,#B9714A,#8C5333)!important;
  color:#fff!important;font-family:inherit!important;font-size:14px!important;
  line-height:20px!important;font-weight:600!important;letter-spacing:normal!important;
  text-transform:none!important;cursor:pointer!important;box-shadow:none!important}
@S@button.mbc-submit .mbc-chk{display:block;flex:0 0 16px;width:16px;height:16px;
  background:${lucideCheck('#ffffff')} center/16px 16px no-repeat}
@S@button.mbc-submit.mf-nav-blocked,@S@button.mbc-submit[disabled]{opacity:.4!important;
  background:linear-gradient(135deg,#B9714A,#8C5333)!important;cursor:not-allowed!important}
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// invoice-codexo and festa-italiana live in their own modules: both are 500-line mocks and this
// file is already the longest in the repo.
export const SPECS = [ROSE, XNL, GSU, NLT, AGF, KFB, XMS, PDO, LGN, JBA, GPR, INV, SPN, CRG, IEL,
  MSI, MBC, ICX, FES, DRC];

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
writeTemplates(SPECS, { only, checkOnly: args.includes('--check') });

export { buildTemplate, validate, OUT_DIR };
