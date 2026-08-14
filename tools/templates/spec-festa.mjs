#!/usr/bin/env node
/**
 * [ExactConversion 20260808] festa-italiana — the THREE-step Italian festival registration.
 *
 * Mock: E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\app\forms\festa-italiana\page.tsx
 * Build sheet: qa-out/_buildsheet_festa.md — every px, colour, weight and string below is
 * transcribed from one of those two. Nothing here is rounded "to taste" and nothing is invented.
 *
 * This module is a SPEC ONLY. It exports one object and has no top-level side effects; the
 * generator that owns build-exact-conversions.mjs imports FES and feeds it to writeTemplates().
 *
 * Shape notes that cost a debugging round elsewhere and are honoured here:
 *   - no backtick ever appears inside a template literal, including inside a comment inside one;
 *   - no authored class name contains "col-" or "title" (megaform.css and the compat bridge both
 *     substring-match those with !important);
 *   - every control rule carries the [class] suffix, every h1/h2/p rule carries its ELEMENT and
 *     !important, because the bridge reaches the same nodes at (0,4,1);
 *   - every text rule states font-weight outright: unstated resolves to 200 in the host stack;
 *   - the one inline SVG goes through svgUrl(), because NeutralizeStyleBreakout rewrites a literal
 *     "</svg>" and would silently leave a broken image behind.
 */

import {
  asset, svgUrl, wrapperReset, controlReset,
} from './exact-helpers.mjs';
import { field, choiceField } from './build-euroyouth-skins.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const FES_SLUG = 'festa-italiana';

const CORM = `'Cormorant Garamond',Georgia,'Times New Roman',serif`;
const PLAY = `'Playfair Display',Georgia,'Times New Roman',serif`;

const FES_FONT_IMPORT =
  `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700`
  + `&family=Playfair+Display:wght@400;500;600;700;800;900&display=swap');`;

// Straight U+0027 apostrophes, exactly as the mock's `steps` array declares them.
const FES_STEPS = [
  { num: 'I', label: "L'Ospite", sub: 'The Guest' },
  { num: 'II', label: "L'Esperienza", sub: 'The Experience' },
  { num: 'III', label: 'La Conferma', sub: 'Confirmation' },
];

/**
 * The page-break Section fields a wizard needs, in the order the runtime walks them.
 *
 * Copied rather than imported: build-exact-conversions.mjs keeps stepSections private, and this
 * module is allowed exactly two imports. The contract it encodes is the renderer's, not that
 * file's — pages are derived by walking the field list and splitting at each
 * Section.properties.pageBreak, and premiumStepIndex is 1-BASED while the rail's data-step is
 * 0-based, because reconcilePremiumNativeStepper shifts them as a set.
 */
const stepSections = (steps) => steps.map((st, i) => field(`step_${i + 1}`, 'Section', st.label, {
  properties: {
    pageBreak: i > 0,
    premiumNativeStep: true,
    generatedPremiumStep: true,
    premiumStepIndex: i + 1,
  },
}));

/**
 * The mock's one and only <svg>: the success tick, polyline "20 6 9 17 4 12" at stroke-width 2.5.
 * NOT lucideCheck() — that glyph is a different path at a different weight, and this conversion
 * does not substitute a near-miss for a value the mock states outright.
 */
const FESTA_CHECK = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'
  fill='none' stroke='#fff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'>
  <polyline points='20 6 9 17 4 12'/></svg>`);

// ─────────────────────────────────────────────────────────────────────────────
// festa-italiana
//
//   main    #f6f1e7 tiled with festa-italiana-texture.png at 600px, blend multiply
//   flag    an 8px tricolour bar, full bleed: #1a7a4c / #f4f1ea / #b5322e in equal thirds
//   card    max-w-3xl, radius 24, 1px #e3d8c2, shadow-2xl, overflow hidden
//     hero  224px (md 288px) photograph under a to-top scrim, eyebrow + Playfair wordmark + lede
//     body  #fbf8f1, px-6 py-8 (md px-12 py-10)
//           a centred three-circle stepper, then one page per step: profile fields, three pass
//           cards with prices, dietary chips, and a confirm step whose summary card is live
//   foot   one italic line under the card
// ─────────────────────────────────────────────────────────────────────────────
export const FES = {
  slug: FES_SLUG,
  title: 'Festa Italiana \u2014 Iscrizione',
  description:
    'Three-step Italian festival registration: a tricolour bar over a photographic hero card, a '
    + 'Roman-numeral stepper, guest details, three priced pass cards with dietary chips, and a '
    + 'confirm step whose summary card fills in live. Transcribed from the festa-italiana mock.',
  category: 'event',
  categories: ['event', 'premium', 'registration'],
  icon: 'glass-cheers',
  prefix: 'fes',
  // The card already draws exactly this frame; declaring it here stops buildCss() adding a second
  // 12px one on .fes-page.
  outerBorder: { sel: '.fes-card', colour: '#e3d8c2', radius: 24 },
  fontStack: CORM,
  fontImport: FES_FONT_IMPORT,
  wizard: { steps: FES_STEPS, nextLabel: 'Continua \u2192', backLabel: '\u2190 Indietro' },
  submitLabel: 'Conferma Iscrizione',
  successTitle: 'Grazie, {{field:first_name}}!',
  successMessage: 'Iscrizione confermata.',
  successBody:
    'La tua iscrizione \u00e8 confermata. Ti abbiamo inviato i dettagli a {{field:email}}. '
    + 'Ci vediamo alla festa!',
  // Carried over from the hand-authored JSON this replaces. buildTemplate() does not emit either
  // key today; they are stated here so the guide link survives the two-line change that would.
  templateGuideSlug: 'tpl-festa-italiana',
  manifestVersion: 2,
  palette: {
    primary: '#b5322e', accent: '#1a7a4c', surface: '#fbf8f1', text: '#3a2a1a',
    muted: '#7a6a55', border: '#e3d8c2', onPrimary: '#FFFFFF', deco: '#d4af6a', page: '#f6f1e7',
  },

  // The required set is exactly the mock's canProceed(): step 0 wants first/last/email, step 1
  // wants pass, step 2 wants terms. gateNavigationUntilValid then reproduces the dead CTA with no
  // extra rules. phone is Text, NOT Phone: the mock's input has no type and no mask, while
  // MegaForm's Phone type ships a country-code widget the mock does not have.
  exactFields: [
    ...stepSections(FES_STEPS).slice(0, 1),
    field('first_name', 'Text', 'Nome', { required: true, placeholder: 'Giulia' }),
    field('last_name', 'Text', 'Cognome', { required: true, placeholder: 'Rossi' }),
    field('email', 'Email', 'Email', { required: true, placeholder: 'giulia@email.it' }),
    field('phone', 'Text', 'Telefono', { placeholder: '+39 333 123 4567' }),
    field('city', 'Text', 'Citt\u00e0', { placeholder: 'Firenze' }),
    ...stepSections(FES_STEPS).slice(1, 2),
    choiceField('pass', 'Radio', 'Pass', [
      {
        label: 'Piazza',
        value: 'piazza',
        badge: '\u20ac45',
        description: 'Accesso generale, degustazioni e musica dal vivo',
      },
      {
        label: 'Terrazza',
        value: 'terrazza',
        badge: '\u20ac95',
        description: 'Posto riservato, cena a 4 portate e vini selezionati',
      },
      {
        label: 'Villa',
        value: 'villa',
        badge: '\u20ac180',
        description: 'Esperienza completa, tavolo privato e chef incontro',
      },
    ], 'cards', 1, { required: true }),
    choiceField('guests', 'Select', 'Numero di ospiti',
      ['1', '2', '3', '4', '5', '6+'], 'dropdown', null, { defaultValue: '1' }),
    choiceField('wine_pairing', 'Select', 'Abbinamento vini', [
      { label: 'Rosso Toscano', value: 'rosso' },
      { label: 'Bianco Friulano', value: 'bianco' },
      { label: 'Bollicine Franciacorta', value: 'bollicine' },
      { label: 'Nessuno, grazie', value: 'nessuno' },
    ], 'dropdown', null, { placeholder: 'Seleziona\u2026' }),
    choiceField('dietary', 'Checkbox', 'Preferenze alimentari',
      ['Vegetariano', 'Vegano', 'Senza glutine', 'Senza lattosio', 'Pescetariano'], 'chips'),
    ...stepSections(FES_STEPS).slice(2, 3),
    choiceField('arrival', 'Select', 'Orario di arrivo', [
      { label: '18:00 \u2014 Aperitivo', value: '18' },
      { label: '19:00 \u2014 Cena', value: '19' },
      { label: '21:00 \u2014 Musica e danze', value: '21' },
    ], 'dropdown', null, { placeholder: 'Seleziona\u2026' }),
    field('notes', 'Textarea', 'Note speciali', {
      placeholder: 'Allergie, richieste particolari, anniversari\u2026',
      properties: { rows: 3 },
    }),
    // The trailing " *" is SENTENCE TEXT in #5a4a35, not the red required marker: the mock prints
    // it inside the same span as the rest of the clause.
    choiceField('terms', 'Checkbox', 'Termini', [{
      value: 'yes',
      label: 'Accetto i termini e le condizioni della Festa Italiana e autorizzo il trattamento '
        + 'dei dati. *',
    }], 'list', null, { required: true }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [{
      value: 'yes',
      label: 'Desidero ricevere aggiornamenti sui prossimi eventi.',
    }], 'list'),
  ],

  shellHtml: (s) => {
    const p = s.prefix;

    const fld = (label, sub, key, req) => `<label class='${p}-field'>`
      + `<span class='${p}-lbl-row'><span class='${p}-lbl'>${label}`
      + (req ? `<span class='${p}-req'> *</span>` : '') + `</span>`
      + `<span class='${p}-sub-lbl'>${sub}</span></span>{{field:${key}}}</label>`;

    const head = (t) => `<div class='${p}-head'><h2 class='${p}-heading'>${t}</h2>`
      + `<span class='${p}-rule'></span></div>`;

    const rail = FES_STEPS.map((st, i) =>
      `<div class='${p}-rail-item' data-mf-native-step='1' data-step='${i}'>`
      + `<span class='${p}-rail-num'><span class='${p}-rail-n'>${st.num}</span></span>`
      + `<span class='${p}-rail-lbl'>${st.label}</span>`
      + `<span class='${p}-rail-sub'>${st.sub}</span></div>`
      + (i < FES_STEPS.length - 1 ? `<span class='${p}-rail-line' data-line='${i}'></span>` : ''))
      .join('');

    // The mock renders Back on step 0 too, as a real disabled button at opacity 0 — it still
    // occupies its box, so the row must not shift. .is-ghost is that, not a hidden element.
    const nav = (i, last) => `<div class='${p}-nav'>`
      + `<button type='button' class='${p}-back${i === 0 ? ' is-ghost' : ''}' `
      + `data-mf-native-back='1'>\u2190 Indietro</button>`
      + (last
        ? `<button type='submit' class='${p}-submit' data-mf-native-submit='1'>`
          + `Conferma Iscrizione</button>`
        : `<button type='button' class='${p}-next' data-mf-native-next='1'>`
          + `Continua \u2192</button>`)
      + `</div>`;

    const rrow = (k, echo, extra = '') => `<div class='${p}-recap-row${extra}'>`
      + `<span class='${p}-recap-k'>${k}</span>`
      + `<span class='${p}-recap-v' data-mf-echo='${echo}'>\u2014</span></div>`;

    return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-wrap'>`

      // ── tricolour ────────────────────────────────────────────────────────
      + `<div class='${p}-flag' role='presentation'>`
      + `<span class='${p}-flag-g'></span><span class='${p}-flag-w'></span>`
      + `<span class='${p}-flag-r'></span></div>`

      + `<div class='${p}-card'>`

      // ── hero ─────────────────────────────────────────────────────────────
      + `<div class='${p}-hero'>`
      + `<div class='${p}-hero-img' role='img' `
      + `aria-label='Festa Italiana in a historic piazza at golden hour'>`
      + `<img class='${p}-content-image' src='{{content:hero_image}}' alt='' aria-hidden='true'></div>`
      + `<div class='${p}-hero-scrim' role='presentation'></div>`
      + `<div class='${p}-hero-copy'>`
      + `<p class='${p}-eyebrow'>Benvenuti alla</p>`
      + `<h1 class='${p}-h1'>Festa Italiana</h1>`
      + `<p class='${p}-hero-sub'>Una serata di vino, musica e tradizione \u00b7 14 Settembre</p>`
      + `</div></div>`

      // ── body ─────────────────────────────────────────────────────────────
      + `<div class='${p}-body'>`
      + `<div class='${p}-rail'>${rail}</div>`
      // The anchor sits OUTSIDE the pages: anchored inside one it would be hidden along with it.
      + `{{script:wizard_pages}}`

      // step I — L'Ospite
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='0'>{{field:step_1}}`
      + head('Raccontaci di te')
      + `<div class='${p}-stack'>`
      + `<div class='${p}-grid2'>`
      + fld('Nome', 'First name', 'first_name', true)
      + fld('Cognome', 'Last name', 'last_name', true)
      + `</div>`
      + fld('Email', 'Indirizzo email', 'email', true)
      + `<div class='${p}-grid2'>`
      + fld('Telefono', 'Phone', 'phone')
      + fld('Citt\u00e0', 'City', 'city')
      + `</div>`
      + `</div>`
      + nav(0, false) + `</div>`

      // step II — L'Esperienza
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='1'>{{field:step_2}}`
      + head('Scegli la tua esperienza')
      + `<div class='${p}-stack ${p}-stack-6'>`
      // bare: the mock gives its pass list no label at all
      + `<div class='${p}-passes'>{{field:pass}}</div>`
      + `<div class='${p}-grid2'>`
      + fld('Numero di ospiti', 'Number of guests', 'guests')
      + fld('Abbinamento vini', 'Wine pairing', 'wine_pairing')
      + `</div>`
      + fld('Preferenze alimentari', 'Dietary preferences', 'dietary')
      + `</div>`
      + nav(1, false) + `</div>`

      // step III — La Conferma
      + `<div class='${p}-pg' data-mf-native-page='1' data-step='2'>{{field:step_3}}`
      + head('Ultimi dettagli')
      + `<div class='${p}-stack'>`
      + fld('Orario di arrivo', 'Arrival time', 'arrival')
      + fld('Note speciali', 'Special notes', 'notes')
      + `<div class='${p}-recap'>`
      + `<p class='${p}-recap-h'>Riepilogo</p>`
      + `<div class='${p}-recap-list'>`
      + rrow('Ospite', 's_guest')
      + rrow('Pass', 's_pass')
      + rrow('Ospiti', 's_guests')
      + rrow('Dieta', 's_diet', ' ' + p + '-recap-diet')
      + `</div></div>`
      + `{{script:fes_recap}}`
      + `{{field:terms}}`
      + `{{field:newsletter}}`
      + `</div>`
      + nav(2, true) + `</div>`

      + `</div></div>`

      + `<p class='${p}-foot'>Festa Italiana \u00b7 Piazza del Sole \u00b7 `
      + `info@festaitaliana.it</p>`
      + `</div></div>`;
  },

  customScripts: {
    // Shows one wizard page at a time. The renderer marks the live rail item with is-active and
    // moves the fields, but nothing in it sets display on a [data-mf-native-page] container — all
    // three pages render at once as one long form otherwise. Driven off the rail's is-active class
    // through a MutationObserver, so it follows the renderer's idea of the current step instead of
    // keeping a second copy of it.
    wizard_pages: `(function(){
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
})();`,

    // The confirm step's summary card, live. Four curated rows in the design's own order — not the
    // built-in reviewBeforeSubmit, which dumps every key into a pane of its own.
    // Dieta is hidden while empty because the mock omits that row entirely, rather than printing
    // an em dash for it.
    fes_recap: `(function(){
  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;
  var scope = (root && root.closest) ? (root.closest('.mfp') || document) : document;
  function val(k){
    var els = scope.querySelectorAll('[name="' + k + '"]');
    if (!els.length) return '';
    var f = els[0];
    if (f.type === 'radio' || f.type === 'checkbox') {
      var out = [];
      for (var i = 0; i < els.length; i++) if (els[i].checked) {
        var ui = els[i].nextElementSibling;
        var lab = ui && ui.querySelector ? ui.querySelector('.mf-option-label') : null;
        out.push(lab ? lab.textContent.trim() : els[i].value);
      }
      return out.join(', ');
    }
    if (f.tagName === 'SELECT') { var o = f.options[f.selectedIndex]; return o && o.value ? o.textContent.trim() : ''; }
    return String(f.value || '').trim();
  }
  function put(k, v){ var n = scope.querySelector('[data-mf-echo="' + k + '"]'); if (n) n.textContent = v; }
  function paint(){
    put('s_guest', (val('first_name') + ' ' + val('last_name')).replace(/^\\s+|\\s+$/g, ''));
    put('s_pass', val('pass') || '\\u2014');
    put('s_guests', val('guests') || '1');
    var d = val('dietary');
    put('s_diet', d);
    var row = scope.querySelector('.fes-recap-diet');
    if (row) row.style.display = d ? '' : 'none';
  }
  scope.addEventListener('input', paint, true);
  scope.addEventListener('change', paint, true);
  scope.addEventListener('click', function(){ setTimeout(paint, 60); }, true);
  setTimeout(paint, 150); paint();
})();`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CSS
  //
  // @S@ expands to ".mfp.mfp-fes.mfp-native-generated " — three class-level selectors, one notch
  // above the compat bridge, which reaches controls at (0,4,1) through
  // input:not([type="checkbox"]):not([type="radio"]). Hence [class] on every control rule.
  // Every Playfair element restates font-family with !important in a class-bearing selector,
  // because controlReset() emits @S@h1,@S@h2,@S@span,@S@button{font-family:inherit!important}
  // at (0,3,1).
  // ───────────────────────────────────────────────────────────────────────────
  exactCss: `
${wrapperReset('fes')}
${controlReset()}

/* root ------------------------------------------------------------------- */
@S@{container-type:inline-size;font-family:${CORM}!important;font-size:16px;line-height:1.5;
  font-weight:400;color:#3a2a1a}

/* page band + tricolour --------------------------------------------------- */
@S@.fes-wrap{background-color:#f6f1e7;
  background-image:${asset(FES_SLUG, 'festa-italiana-texture.png')};
  background-size:600px;background-repeat:repeat;background-blend-mode:multiply}
@S@.fes-flag{display:flex;width:100%;height:8px}
@S@.fes-flag>span{flex:1 1 0;height:8px}
@S@.fes-flag-g{background:#1a7a4c}
@S@.fes-flag-w{background:#f4f1ea}
@S@.fes-flag-r{background:#b5322e}

/* card + hero ------------------------------------------------------------- */
@S@.fes-card{overflow:hidden;border:1px solid #e3d8c2;border-radius:24px;background:transparent;
  box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}
@S@.fes-hero{position:relative;height:224px}
/* The mock's md: breakpoint is the VIEWPORT (768px), at which its card is 736px wide - 704px of
   content plus its border. A container query is on the PANE, so 768 would keep the small variant
   at the design's own width and the card rendered 120px too tall with a 36px masthead. */
@container (min-width:704px){@S@.fes-hero{height:288px}}
@S@.fes-hero-img{position:absolute;inset:0;display:block;width:100%;height:100%;
  background-image:${asset(FES_SLUG, 'festa-italiana-hero.png')};
  background-size:cover;background-position:50% 50%;background-repeat:no-repeat}
@S@img.fes-content-image{position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 50%!important;
  border:0!important;border-radius:0!important;pointer-events:none!important}
@S@.fes-hero-scrim{position:absolute;inset:0;
  background:linear-gradient(to top,rgba(40,24,16,.85),rgba(40,24,16,.15))}
@S@.fes-hero-copy{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:flex-end;padding-bottom:28px;text-align:center}
/* tracking .4em = 5.6px at 14px; the trailing letter-space on the last glyph shifts the optical
   centre ~2.8px left of geometric centre. The mock has that. Do not "correct" it. */
@S@p.fes-eyebrow{margin:0 0 4px!important;font-family:${CORM}!important;font-size:14px!important;
  line-height:20px!important;font-weight:400!important;text-transform:uppercase!important;
  letter-spacing:.4em!important;color:#f2d9a0!important}
/* leading-none beats text-4xl's 40px AND text-6xl's own line-height: it is 1 at both widths */
@S@h1.fes-h1{margin:0!important;font-family:${PLAY}!important;font-size:36px!important;
  line-height:1!important;font-weight:700!important;color:#fff!important;
  text-shadow:0 2px 20px rgba(0,0,0,.4)}
@container (min-width:704px){@S@h1.fes-h1{font-size:60px!important}}
/* MEASURED: the mock renders this line upright - the italic class is on the h1 above it, not here */
@S@p.fes-hero-sub{margin:8px 0 0!important;font-family:${CORM}!important;font-size:18px!important;
  line-height:28px!important;font-weight:400!important;font-style:normal!important;
  width:fit-content;max-width:calc(100% - 24px);color:#f6f1e7!important}

/* body panel -------------------------------------------------------------- */
@S@.fes-body{padding:32px 24px;background:#fbf8f1}
@container (min-width:704px){@S@.fes-body{padding:40px 48px}}

/* stepper ----------------------------------------------------------------- */
@S@.fes-rail{display:flex;align-items:center;justify-content:center;margin-bottom:40px}
@S@.fes-rail-item{display:flex;flex-direction:column;align-items:center}
@S@.fes-rail-num{display:flex;align-items:center;justify-content:center;width:48px;height:48px;
  box-sizing:border-box;border:2px solid #d8cab0;border-radius:9999px;background:transparent;
  font-family:${PLAY}!important;font-size:18px;line-height:28px;font-weight:700;color:#b3a387;
  transition:all .18s ease}
@S@.fes-rail-lbl{margin-top:8px;font-family:${PLAY}!important;font-size:14px;line-height:20px;
  font-weight:600;color:#b3a387}
/* sublabel colour is CONSTANT — it never follows the step state */
@S@.fes-rail-sub{font-family:${CORM}!important;font-size:12px;line-height:16px;font-weight:400;
  text-transform:uppercase;letter-spacing:.05em;color:#b3a387}
/* the column is 92px tall (48+8+20+16); this 33px margin box centres to y=29.5px, i.e. 5.5px
   BELOW the circle's centreline (y=24). Deliberate in the mock. */
@S@.fes-rail-line{display:block;flex:0 0 48px;width:48px;height:1px;margin:0 8px 32px;
  background:#d8cab0}
@container (min-width:704px){@S@.fes-rail-line{flex-basis:80px;width:80px}}
@S@.fes-rail-item.is-active .fes-rail-num{border-color:#b5322e;background:#fbf8f1;color:#b5322e}
@S@.fes-rail-item.is-active .fes-rail-lbl{color:#3a2a1a}
@S@.fes-rail-item.is-done .fes-rail-num{border-color:#b5322e;background:#b5322e;color:#fff}
@S@.fes-rail-item.is-done .fes-rail-lbl{color:#3a2a1a}
@S@.fes-rail-item.is-done .fes-rail-n{display:none}
/* the tick is the TEXT glyph U+2713, not an SVG — the mock has exactly one <svg> and it is on
   the success screen */
@S@.fes-rail-item.is-done .fes-rail-num::after{content:'\\2713';font-family:${PLAY}!important;
  font-size:18px;line-height:28px;font-weight:700}
@S@.fes-rail-item.is-done+.fes-rail-line{background:#b5322e}
@container (max-width:520px){
  @S@.fes-rail{width:auto;margin-left:8px;margin-right:8px}
  @S@.fes-rail-item{flex:1 1 0;min-width:0}
  @S@.fes-rail-num{width:40px;height:40px}
  @S@.fes-rail-line{flex:0 1 12px;width:12px;margin:0 4px 32px}
  @S@.fes-rail-lbl{display:block;width:100%;max-width:100%;font-size:11px;line-height:16px;
    overflow-wrap:anywhere;text-align:center}
  @S@.fes-rail-sub{display:block;width:100%;max-width:100%;font-size:10px;line-height:14px;
    overflow-wrap:anywhere;text-align:center}
}

/* section heading + gold rule + stacks ------------------------------------ */
@S@.fes-head{margin-bottom:8px;text-align:center}
@S@h2.fes-heading{margin:0!important;font-family:${PLAY}!important;font-size:24px!important;
  line-height:32px!important;font-weight:700!important;color:#3a2a1a!important}
@container (min-width:704px){@S@h2.fes-heading{font-size:30px!important;line-height:36px!important}}
@S@.fes-rule{display:block;width:64px;height:1px;margin:8px auto 0;background:#d4af6a}
/* space-y-5 / space-y-6. Flex gap does NOT collapse with .fes-head's 8px, so heading to first
   control is 8+20=28px (steps I and III) and 8+24=32px (step II) — which is what the mock
   measures. */
@S@.fes-stack{display:flex;flex-direction:column;gap:20px}
@S@.fes-stack-6{gap:24px}
@S@.fes-grid2{display:grid;grid-template-columns:1fr;gap:20px}
@container (min-width:704px){@S@.fes-grid2{grid-template-columns:1fr 1fr}}

/* field label row --------------------------------------------------------- */
@S@.fes-field{display:block;margin:0}
@S@.fes-lbl-row{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
@S@.fes-lbl{font-family:${CORM}!important;font-size:16px;line-height:24px;font-weight:600;
  letter-spacing:.025em;color:#3a2a1a}
@S@.fes-req{font-family:${CORM}!important;font-size:16px;line-height:24px;font-weight:600;
  color:#b5322e}
@S@.fes-sub-lbl{font-family:${CORM}!important;font-size:12px;line-height:16px;font-weight:400;
  text-transform:uppercase;letter-spacing:.05em;color:#b3a387}

/* controls — .festa-input, transcribed ------------------------------------ */
/* 0.6rem=9.6px, 0.7rem=11.2px, 0.95rem=15.2px, 1.15rem=18.4px, lh inherit 1.5 gives 27.6px
   => single-line height 52.0px, textarea rows=3 => 107.2px */
@S@.mf-select-wrap{display:block;position:static;width:100%}
/* the mock does NOT reset select appearance: native OS arrow, native option list */
@S@.mf-select-chevron{display:none!important}
@S@.mf-input[class],@S@.mf-select[class],@S@.mf-textarea[class]{display:block!important;
  width:100%!important;box-sizing:border-box!important;border:1px solid #d8cab0!important;
  border-radius:9.6px!important;background:#fff!important;padding:11.2px 15.2px!important;
  min-height:0!important;height:auto!important;font-family:${CORM}!important;
  font-size:18.4px!important;line-height:27.6px!important;font-weight:400!important;
  color:#3a2a1a!important;box-shadow:none!important;transition:all .18s ease!important}
@S@.mf-select[class]{appearance:auto!important;-webkit-appearance:auto!important;
  padding-right:15.2px!important}
@S@.mf-textarea[class]{height:107.2px!important;resize:none!important}
@S@.mf-input[class]::placeholder,@S@.mf-textarea[class]::placeholder{color:#bcab90!important;
  opacity:1}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus,@S@.mf-textarea[class]:focus{
  outline:none!important;border-color:#b5322e!important;
  box-shadow:0 0 0 3px rgba(181,50,46,.12)!important}
/* the two selects that carry "Seleziona…" grey out until chosen; guests has no empty option in
   the mock, so the renderer-injected one is hidden rather than styled */
@S@.mf-select[class]:has(option[value=""]:checked){color:#bcab90!important}
@S@.mf-field-group[data-key="guests"] .mf-select option[value=""]{display:none}

/* pass cards -------------------------------------------------------------- */
@S@.fes-passes .mf-option-group--cards{display:flex!important;flex-direction:column!important;
  gap:12px!important}
@S@.mf-option-group--cards .mf-option-ui{display:flex;align-items:center;gap:16px;width:100%;
  box-sizing:border-box;padding:20px;border:2px solid #e3d8c2;border-radius:12px;background:#fff;
  text-align:left;cursor:pointer;transition:all .18s ease}
/* the radio ring is a ::before, never an <i>: a font icon as the first flex item drops the whole
   card 3px onto the glyph baseline (measured on the 08-08 batch) */
@S@.mf-option-group--cards .mf-option-ui::before{content:'';flex:0 0 20px;width:20px;height:20px;
  box-sizing:border-box;border:2px solid #cabba0;border-radius:9999px;background:transparent}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui::before,
@S@.mf-option-group--cards input:checked+.mf-option-ui::before{border-color:#b5322e;
  background:radial-gradient(circle,#b5322e 0 5px,transparent 5px)}
@S@.mf-option-group--cards .mf-option-copy{display:block;width:auto;gap:0}
@S@.mf-option-group--cards .mf-option-label{display:block;font-family:${PLAY}!important;
  font-size:20px;line-height:28px;font-weight:700;color:#3a2a1a}
@S@.mf-option-group--cards .mf-option-desc{display:block;font-family:${CORM}!important;
  font-size:16px;line-height:24px;font-weight:400;color:#7a6a55}
@S@.mf-option-group--cards .mf-option-badge{margin-left:auto;font-family:${PLAY}!important;
  font-size:24px;line-height:32px;font-weight:700;color:#b5322e}
@S@.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--cards input:checked+.mf-option-ui{border-color:#b5322e;background:#fcf2ec}
/* derived card height: 20+20 pad + 2+2 border + (28 name + 24 desc) = 96px */

/* dietary chips ----------------------------------------------------------- */
@S@.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:8px}
@S@.mf-option-group--chips .mf-option-ui{display:block;box-sizing:border-box;padding:6px 16px;
  border:2px solid #e3d8c2;border-radius:9999px;background:#fff;color:#7a6a55;
  font-family:${CORM}!important;font-size:16px;line-height:24px;font-weight:600;text-align:center;
  cursor:pointer;transition:all .18s ease}
@S@.mf-option-group--chips .mf-option-label{font-size:16px;line-height:24px;font-weight:600;
  color:inherit}
@S@.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,
@S@.mf-option-group--chips input:checked+.mf-option-ui{border-color:#1a7a4c;background:#1a7a4c;
  color:#fff}
/* derived chip height: 24 + 6+6 + 2+2 = 40px */

/* summary card ------------------------------------------------------------ */
@S@.fes-recap{padding:20px;border:1px solid #e3d8c2;border-radius:12px;background:#fcf9f2}
@S@p.fes-recap-h{margin:0 0 12px!important;font-family:${PLAY}!important;font-size:18px!important;
  line-height:28px!important;font-weight:700!important;color:#3a2a1a!important}
@S@.fes-recap-list{display:flex;flex-direction:column;gap:6px;font-family:${CORM}!important;
  font-size:16px;line-height:24px;font-weight:400;color:#7a6a55}
@S@.fes-recap-row{display:flex;justify-content:space-between}
@S@.fes-recap-k{font-size:16px;line-height:24px;font-weight:400;color:#7a6a55}
@S@.fes-recap-v{font-size:16px;line-height:24px;font-weight:600;color:#3a2a1a;text-align:right}

/* consent checkboxes ------------------------------------------------------ */
@S@.mf-option-group--list{display:flex;flex-direction:column;gap:20px}
@S@.mf-option-group--list .mf-option-item{display:flex;align-items:flex-start;gap:12px;
  cursor:pointer}
@S@.mf-option-group--list .mf-option-ui{display:block;padding:0;border:0;background:transparent}
@S@.mf-option-group--list .mf-option-label{font-family:${CORM}!important;font-size:16px;
  line-height:24px;font-weight:400;color:#5a4a35}
/* native box + accent-color: the mock draws no custom tick */
@S@.mf-option-group--list input[type="checkbox"]{appearance:auto!important;
  -webkit-appearance:auto!important;flex:0 0 20px!important;width:20px!important;
  height:20px!important;margin:4px 0 0!important;border:0!important;border-radius:0!important;
  background:none!important;box-shadow:none!important}
@S@.mf-field-group[data-key="terms"] input[type="checkbox"]{accent-color:#b5322e!important}
@S@.mf-field-group[data-key="newsletter"] input[type="checkbox"]{accent-color:#1a7a4c!important}

/* nav row ----------------------------------------------------------------- */
@S@.fes-nav{display:flex;align-items:center;justify-content:space-between;margin-top:40px;
  padding-top:24px;border-top:1px solid #ece2cf}
@S@button.fes-back[type="button"]{padding:10px 24px!important;border:0!important;
  border-radius:9999px!important;background:transparent!important;color:#7a6a55!important;
  font-family:${CORM}!important;font-size:18px!important;line-height:28px!important;
  font-weight:600!important;letter-spacing:normal!important;text-transform:none!important;
  cursor:pointer!important;box-shadow:none!important;transition:all .18s ease}
/* disabled:opacity-0 — invisible but STILL occupies its box; the row must not shift */
/* megaform hides its own Back on step 1 with display:none; the mock keeps the BOX (opacity-0) so
   Next stays right-aligned. Without this the nav row collapses and Next jumps to the left. */
@S@button.fes-back.is-ghost{display:inline-flex!important;opacity:0;pointer-events:none}
@S@button.fes-next[type="button"],@S@button.fes-submit[type="submit"]{padding:12px 32px!important;
  border:0!important;border-radius:9999px!important;color:#fff!important;
  font-family:${CORM}!important;font-size:18px!important;line-height:28px!important;
  font-weight:600!important;letter-spacing:.025em!important;text-transform:none!important;
  cursor:pointer!important;box-shadow:none!important;transition:all .18s ease}
@S@button.fes-next[type="button"]{background:#b5322e!important}
@S@button.fes-submit[type="submit"]{background:#1a7a4c!important}
@S@button.fes-next[type="button"]:hover,@S@button.fes-submit[type="submit"]:hover{
  transform:scale(1.05)}
@S@button.fes-next.mf-nav-blocked,@S@button.fes-next[disabled],
@S@button.fes-submit.mf-nav-blocked,@S@button.fes-submit[disabled]{opacity:.4!important;
  cursor:not-allowed!important;transform:none!important;filter:none!important}

/* page footer line -------------------------------------------------------- */
@S@p.fes-foot{width:calc(100% - 24px)!important;margin:24px auto 0!important;text-align:center!important;font-family:${CORM}!important;
  font-size:16px!important;line-height:24px!important;font-weight:400!important;
  font-style:italic!important;color:#9a8a72!important}

/* success screen — OUTSIDE @S@ ------------------------------------------- */
/* .mf-postsubmit-pane is appended to the <form>, a SIBLING of the shell, so no @S@ rule reaches
   it. :has() is the same escape wrapperReset() already uses. Every declaration the renderer
   writes there is an INLINE style, so each override needs !important. */
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-pane{border:1px solid #e3d8c2!important;
  border-radius:24px!important;background:#fbf8f1!important;
  box-shadow:0 25px 50px -12px rgba(0,0,0,.25)!important;padding:0 48px!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-body{padding:48px 0!important;
  text-align:center!important;font-family:${CORM}!important;color:#3a2a1a!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-check{width:80px!important;height:80px!important;
  margin:0 auto 24px!important;border-radius:9999px!important;
  background:#1a7a4c ${FESTA_CHECK} no-repeat center/40px 40px!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-check i{display:none!important}
.mf-form-wrapper:has(.mfp-fes) h3.mf-postsubmit-title{margin:0!important;
  font-family:${PLAY}!important;font-size:30px!important;line-height:36px!important;
  font-weight:700!important;color:#3a2a1a!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-msg{max-width:448px!important;
  margin:12px auto 0!important;font-family:${CORM}!important;font-size:20px!important;
  line-height:28px!important;font-weight:400!important;color:#7a6a55!important;opacity:1!important}
.mf-form-wrapper:has(.mfp-fes) .mf-ref-number{display:none!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-actions{margin-top:32px!important;
  justify-content:center!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-actions .mf-btn-submit{padding:12px 32px!important;
  border:0!important;border-radius:9999px!important;background:#b5322e!important;
  color:#fff!important;font-family:${CORM}!important;font-size:18px!important;
  line-height:28px!important;font-weight:600!important;letter-spacing:.025em!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-actions .mf-btn-submit i{display:none!important}
.mf-form-wrapper:has(.mfp-fes) .mf-postsubmit-actions .mf-btn-prev{display:none!important}
`,
};
