#!/usr/bin/env node
/**
 * [EuroYouthSkins v20260807] One generator, many decorative skins over ONE shared form body.
 *
 * Why this exists: the 2026-08 mock batch contains five designs whose form BODY is byte-for-byte
 * the same EuroYouth application (name / email / phone / birth year / country / programme /
 * start / duration / language level / accommodation / interests / motivation / newsletter /
 * terms) wearing five different skins. That body had already been hand-written four times in
 * Samples/FormTemplates/Premium/GALLERY-PUBLISHED before anyone noticed. So: the body is written ONCE here,
 * and each skin is a data spec.
 *
 * Contract the emitted templates must satisfy (lifted from the shipped
 * dance-competition-registration.json, which is the reference implementation):
 *   settings.customHtml     `.mfp .mfp-<prefix> .mfp-native-generated` shell with {{field:KEY}} slots
 *   settings.customCss      scoped to `.mfp-<prefix>`, every var chained
 *                           --mf-page-* -> --mf-preset-* -> literal fallback
 *   settings.themeCompatibility  { policy:'hybrid', ... } - the ONLY consumer is
 *                           ThemeFirstPaintCssService; `prefixes` is decorative, nothing reads it
 *   settings.premiumGeneratedShell  true
 *
 * Two engine features shipped 2026-08-07 are used here for the first time, which is what lets
 * these conversions behave like their mocks instead of merely looking like them:
 *   settings.gateNavigationUntilValid   the mock's CTA is disabled until valid
 *   {{field:KEY}} in postSubmitExperience  the mock's success screen greets the applicant by name
 *
 * Run:  node tools/templates/build-euroyouth-skins.mjs [--only slug] [--check]
 *       --check validates without writing (used by QA before a gallery publish).
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
// Two folders, deliberately: GALLERY-PUBLISHED holds the 48 templates that are LIVE on
// https://CissSolution.github.io/megaform-gallery/ and is what build-gallery.mjs publishes from;
// PENDING-REVIEW holds everything converted but not yet approved. A template is promoted by
// MOVING its file, not by editing a list - so a publish can never sweep up work still in review.
export const OUT_DIR = join(REPO, 'Samples', 'FormTemplates', 'Premium', 'PENDING-REVIEW');
export const GALLERY_DIR = join(REPO, 'Samples', 'FormTemplates', 'Premium', 'GALLERY-PUBLISHED');

// ─────────────────────────────────────────────────────────────────────────────
// Shared option sets. Every mock ships the same lists; a skin overrides only
// what its own design actually changes.
// ─────────────────────────────────────────────────────────────────────────────
const COUNTRIES = ['Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria',
  'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const DURATIONS = ['1', '2', '3', '6', '9', '12'];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const ACCOMMODATION = ['Host family', 'Student dorm', 'Private flat', 'Not needed'];
const INTERESTS = ['Art & Design', 'Technology', 'Sustainability', 'Music', 'Sports', 'Cuisine',
  'History', 'Entrepreneurship'];
const PROGRAMMES = [
  { label: 'Erasmus Exchange', value: 'erasmus', description: 'Berlin · Paris · Madrid' },
  { label: 'Language Immersion', value: 'language', description: 'Florence · Lisbon · Vienna' },
  { label: 'Solidarity Corps', value: 'volunteer', description: 'Amsterdam · Prague · Athens' },
];

export const opts = (list) => list.map((v) => (typeof v === 'string' ? { label: v, value: v } : v));

// ─────────────────────────────────────────────────────────────────────────────
// Field body — written once.
//
// The verbose per-field scaffolding (placeholder/helpText/cssClass/width/readOnly/prefillParam/
// validation/showIf/htmlContent/fileSettings/properties) mirrors what the builder writes. It is
// not decoration: readers disagree about where a property lives, which is why optionDisplay is
// repeated in `properties`, at top level, in `widgetProps`, and under the `choiceDisplay` /
// `optionVariant` aliases. Emitting one place only is how a card group silently renders as a
// plain radio list.
// ─────────────────────────────────────────────────────────────────────────────
export function field(key, type, label, extra = {}) {
  const f = {
    placeholder: '', helpText: '', defaultValue: '', cssClass: '', width: '100%',
    readOnly: false, prefillParam: '', validation: {}, options: null, showIf: null,
    htmlContent: '', fileSettings: null, properties: {},
    key, type, label, required: false,
  };
  Object.assign(f, extra);
  if (!f.options) delete f.options;
  return f;
}

export function choiceField(key, type, label, options, display, columns, extra = {}) {
  const props = { optionDisplay: display };
  if (columns) props.optionColumns = columns;
  const f = field(key, type, label, {
    options: opts(options),
    properties: props,
    optionDisplay: display,
    choiceDisplay: display,
    optionVariant: display,
    widgetProps: { ...props },
    allowOptionHtml: true,
    ...extra,
  });
  if (columns) f.optionColumns = columns;
  return f;
}

export function buildFields(spec) {
  // [ExactConversion 2026-08-08] A mock that is its OWN form - not a variant of the EuroYouth
  // application - declares its fields outright. The shared list below is seven fields wrong for
  // such a design, and relabelling it produced conversions that shared nothing with their mock
  // but a colour.
  if (spec.exactFields) return spec.exactFields;
  const s = spec.body || {};
  const programmeOptions = s.programmes || PROGRAMMES;
  const interests = s.interests || INTERESTS;
  const countries = s.countries || COUNTRIES;
  const cols = spec.optionColumns || {};

  const out = [
    field('first_name', 'Text', 'First name', { required: true, placeholder: s.phFirst || 'Anna' }),
    field('last_name', 'Text', 'Last name', { required: true, placeholder: s.phLast || 'Müller' }),
    field('email', 'Email', 'Email', { required: true, placeholder: s.phEmail || 'anna@email.eu' }),
    field('phone', 'Phone', 'Phone', { placeholder: s.phPhone || '+49 170 1234567' }),
    field('birth_year', 'Text', 'Birth year', { placeholder: '2004' }),
    choiceField('country', 'Select', 'Country', countries, 'dropdown', null, { required: true, placeholder: 'Select…' }),
    choiceField('programme', 'Radio', s.programmeLabel || 'Programme', programmeOptions, 'cards', cols.programme || 1, { required: true }),
    choiceField('start_month', 'Select', 'Start month', MONTHS, 'dropdown', null, { required: true, placeholder: 'Select…' }),
    choiceField('duration', 'Select', 'Duration (months)', DURATIONS, 'dropdown', null, { defaultValue: '3', placeholder: 'Select…' }),
    choiceField('language_level', 'Select', 'Language level', LEVELS, 'dropdown', null, { placeholder: 'Select…' }),
    choiceField('accommodation', 'Radio', 'Accommodation', ACCOMMODATION, 'cards', cols.accommodation || 2),
    choiceField('interests', 'Checkbox', s.interestsLabel || 'Interests', interests, 'chips'),
    field('motivation', 'Textarea', s.motivationLabel || 'Motivation', { placeholder: s.phMotivation || 'Why do you want to join EuroYouth?' }),
    choiceField('newsletter', 'Checkbox', 'Newsletter', [{ label: s.newsletterText || 'Send me EuroYouth updates and offers', value: 'yes' }], 'list'),
    choiceField('terms', 'Checkbox', 'Terms', [{ label: s.termsText || 'I agree to the terms and conditions', value: 'yes' }], 'list', null, { required: true }),
  ];
  // A skin whose design is genuinely a different form (kids' book, membership tiers) drops or
  // relabels core fields rather than inheriting a label that does not belong to it. Two of the
  // mocks in this batch carry EuroYouth's "Programme track" and "Language level" into a form that
  // has nothing to do with student mobility; `omit` and `labels` are how that gets resolved on
  // conversion instead of shipping the mock's own content bug.
  const omit = new Set(s.omit || []);
  let list = out.filter((f) => !omit.has(f.key));
  const labels = s.labels || {};
  list.forEach((f) => { if (labels[f.key]) f.label = labels[f.key]; });
  const overrideOptions = s.options || {};
  list.forEach((f) => { if (overrideOptions[f.key]) f.options = opts(overrideOptions[f.key]); });
  const placeholders = s.placeholders || {};
  list.forEach((f) => { if (placeholders[f.key] != null) f.placeholder = placeholders[f.key]; });

  (spec.extraFields || []).forEach((f) => list.push(f));

  // [Wizard v20260807] A stepped form needs one leading Section per step, because the runtime
  // derives pages FROM THE FIELDS (Section.properties.pageBreak), not from a page count. Deleting
  // a step in the builder therefore means deleting its page-break Section.
  // premiumStepIndex is 1-BASED here while the rail's data-step attributes are 0-based —
  // reconcilePremiumNativeStepper shifts them as a set, so both conventions must be kept exactly.
  // Order the emitted fields the way the shell reads them, so a human diffing the JSON against
  // the design walks them top to bottom.
  if (spec.fieldOrder) {
    const rank = new Map(spec.fieldOrder.map((k, i) => [k, i]));
    list.sort((a, b) => (rank.has(a.key) ? rank.get(a.key) : 999) - (rank.has(b.key) ? rank.get(b.key) : 999));
  }

  if (spec.wizard) {
    // The step's Section must LEAD its page, and the fields of each step must follow it in order,
    // because the runtime derives pages by walking the field list and splitting at every
    // Section.properties.pageBreak — there is no page count anywhere to disagree with.
    // Interleaving is driven by the SAME sections array the shell is built from, so the JSON and
    // the markup can never claim different steps for a field.
    // premiumStepIndex is 1-BASED while the rail's data-step attributes are 0-based;
    // reconcilePremiumNativeStepper shifts them as a set, so keep both conventions exactly.
    const declared = spec.sections(spec);
    const byKey = new Map(list.map((f) => [f.key, f]));
    const used = new Set();
    const out = [];
    (spec.wizard.steps || []).forEach((st, i) => {
      out.push(field(`step_${i + 1}`, 'Section', st.label, {
        properties: {
          pageBreak: i > 0,
          premiumNativeStep: true,
          generatedPremiumStep: true,
          premiumStepIndex: i + 1,
        },
      }));
      declared.filter((s) => (s.step || 0) === i).forEach((s) => {
        [...(s.grid || []), ...(s.slots || []), ...(s.consent || [])].forEach(([, key]) => {
          const f = byKey.get(key);
          if (f && !used.has(key)) { used.add(key); out.push(f); }
        });
      });
    });
    // A field the shell never places would otherwise vanish from the schema entirely.
    list.forEach((f) => { if (!used.has(f.key)) out.push(f); });
    return out;
  }
  return list;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell (customHtml)
// ─────────────────────────────────────────────────────────────────────────────
export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function slot(p, label, key, extraClass = '') {
  const cls = extraClass ? `${p}-field ${extraClass}` : `${p}-field`;
  return `<label class='${cls}'><span>${esc(label)}</span>{{field:${key}}}</label>`;
}

export function caption(p, text, style) {
  return style === 'rule'
    ? `<div class='${p}-rule'><span>${esc(text)}</span><i></i></div>`
    : `<div class='${p}-caption'>${esc(text)}</div>`;
}

export function buildHero(spec) {
  const p = spec.prefix;
  const h = spec.hero;
  const bits = [];
  if (h.texture) bits.push(`<div class='${p}-hero-texture' role='presentation'></div>`);
  const inner = [];
  if (h.emblemIcon) inner.push(`<div class='${p}-hero-emblem'><i class='fa ${h.emblemIcon}'></i></div>`);
  if (h.eyebrow) inner.push(`<div class='${p}-hero-eyebrow'>${esc(h.eyebrow)}</div>`);
  if (h.display) inner.push(`<h1 class='${p}-hero-display'>${esc(h.display)}</h1>`);
  if (h.hairlineWord) {
    inner.push(`<div class='${p}-hero-hairline'><span class='${p}-hr'></span>`
      + `<span class='${p}-hr-word'>${esc(h.hairlineWord)}</span><span class='${p}-hr'></span></div>`);
  }
  if (h.subtitle) inner.push(`<div class='${p}-hero-sub'>${esc(h.subtitle)}</div>`);
  bits.push(`<div class='${p}-hero-inner'>${inner.join('')}</div>`);
  return `<div class='${p}-hero'>${bits.join('')}</div>`;
}

export function buildStrips(spec) {
  const p = spec.prefix;
  return (spec.strips || []).map((s) => {
    if (s.kind === 'tagline') {
      return `<div class='${p}-tagline'><span class='${p}-dot'></span>`
        + `<span class='${p}-tagline-text'>${esc(s.text)}</span><span class='${p}-dot'></span></div>`;
    }
    if (s.kind === 'promo') {
      return `<div class='${p}-promo'>`
        + (s.kicker ? `<div class='${p}-promo-kicker'>${esc(s.kicker)}</div>` : '')
        + (s.headline ? `<div class='${p}-promo-headline'>${esc(s.headline)}</div>` : '')
        + `<div class='${p}-promo-hr'></div>`
        + (s.body ? `<p class='${p}-promo-body'>${esc(s.body)}</p>` : '')
        + `</div>`;
    }
    return '';
  }).join('');
}

/**
 * The default body layout — the EuroYouth section order, which is what the three seasonal /
 * marketing skins share. A skin whose design genuinely differs (a kids' book form with SCHOOL and
 * AUTHOR, a membership form with tiers) passes its own `sections` instead of forcing the shared
 * one and then fighting it with CSS.
 *
 * Section shapes:
 *   { caption, grid: [[label, key], …] }   two-column grid
 *   { caption, slots: [[label, key], …] }  full-width, one per row
 *   { consent: [[label, key], …] }         plain sentence rows, no caption
 *   { html }                               raw decorative markup, no field
 */
export function defaultSections(spec) {
  const b = spec.body || {};
  const c = spec.captions;
  return [
    { caption: c.programme, slots: [[b.programmeLabel || 'Programme', 'programme']] },
    {
      caption: c.personal,
      grid: [['First name *', 'first_name'], ['Last name *', 'last_name'], ['Email *', 'email'],
        ['Phone', 'phone'], ['Birth year', 'birth_year'], ['Country *', 'country']],
    },
    {
      caption: c.details,
      grid: [['Start month *', 'start_month'], ['Duration (months)', 'duration'],
        ['Language level', 'language_level']],
      slots: [['Accommodation', 'accommodation']],
    },
    { caption: c.interests, slots: [[b.interestsLabel || 'Interests', 'interests']] },
    { caption: c.motivation, slots: [[b.motivationLabel || 'Motivation', 'motivation']] },
    { consent: [['Newsletter', 'newsletter'], ['Terms', 'terms']] },
  ];
}

/** One section of the body. Shared by the flat shell and by each wizard page so a section means
 *  the same thing in both. */
export function renderSection(spec, s, cap) {
  const p = spec.prefix;
  if (s.html) return s.html;
  // {{script:KEY}} becomes a hidden anchor; the renderer executes settings.customScripts[KEY]
  // next to it with __mfCurrentScriptRoot resolved. This is how a template gets live behaviour
  // without an engine change.
  if (s.script) return `{{script:${s.script}}}`;
  if (s.consent) {
    return `<div class='${p}-consent'>`
      + s.consent.map(([label, key]) => slot(p, label, key, `${p}-consent-item`)).join('')
      + `</div>`;
  }
  const out = [];
  if (s.caption) out.push(cap(s.caption));
  if (s.grid && s.grid.length) {
    out.push(`<div class='${p}-grid ${p}-2'>`);
    s.grid.forEach(([label, key]) => out.push(slot(p, label, key)));
    out.push(`</div>`);
  }
  (s.slots || []).forEach(([label, key]) => out.push(slot(p, label, key)));
  return out.join('');
}

export function buildShell(spec) {
  // [ExactConversion 2026-08-08] Several of these mocks are not a card at all - they are
  // two-column pages with a photographic panel or a sidebar. Such a design supplies its own
  // markup, mirroring the mock's DOM, instead of being bent into hero + strips + body.
  if (spec.shellHtml) return spec.shellHtml(spec);
  const p = spec.prefix;
  const cap = (t) => caption(p, t, spec.sectionCaptionStyle);
  const sections = spec.sections ? spec.sections(spec) : defaultSections(spec);

  // [Wizard v20260807] Stepped shell. The renderer finds the rail through
  // STEP_SELECTOR ([data-mf-native-step]) and the pages through PAGE_SELECTOR
  // ([data-mf-native-page]), both keyed by a 0-BASED data-step. Fields are authored inside their
  // own page container, so reconcilePremiumNativePageFields has nothing left to move — it only
  // repairs shells whose markup and schema disagree.
  if (spec.wizard) {
    const steps = spec.wizard.steps || [];
    const rail = steps.map((st, i) =>
      `<div class='${p}-step' data-mf-native-step='1' data-step='${i}'>`
      + `<span class='${p}-step-num'>${esc(st.num || String(i + 1).padStart(2, '0'))}</span>`
      + `<span class='${p}-step-text'><span class='${p}-step-label'>${esc(st.label)}</span>`
      + (st.sub ? `<span class='${p}-step-sub'>${esc(st.sub)}</span>` : '')
      + `</span></div>`).join(`<i class='${p}-step-line'></i>`);

    const pages = steps.map((st, i) => {
      const body = sections.filter((s) => (s.step || 0) === i)
        .map((s) => renderSection(spec, s, cap)).join('');
      const isLast = i === steps.length - 1;
      const nav = `<div class='${p}-nav'>`
        + (i > 0 ? `<button type='button' class='${p}-back' data-mf-native-back='1'>${esc(spec.wizard.backLabel || 'Back')}</button>` : `<span></span>`)
        + (isLast
          ? `<button type='submit' class='${p}-submit' data-mf-native-submit='1'>${esc(spec.submitLabel)}</button>`
          : `<button type='button' class='${p}-next' data-mf-native-next='1'>${esc(spec.wizard.nextLabel || 'Continue')}</button>`)
        + `</div>`;
      return `<div class='${p}-page' data-mf-native-page='1' data-step='${i}'>`
        + `{{field:step_${i + 1}}}${body}${nav}</div>`;
    }).join('');

    const shell = `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
      + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
      + `padding:0!important;box-shadow:none!important">`
      + `<div class='${p}-card'>${buildHero(spec)}${buildStrips(spec)}`
      + `<div class='${p}-rail'>${rail}</div>`
      // The anchor sits OUTSIDE the pages on purpose. The renderer marks the active rail item but
      // does NOT hide [data-mf-native-page] containers — the shipped tabbed-account-setup template
      // carries its own script for exactly this reason. Ours mirrors the rail's is-active onto page
      // visibility; anchored inside a page it would be hidden along with it.
      + `{{script:wizard_pages}}`
      + `<div class='${p}-body'>${pages}</div></div></div>`;
    return shell;
  }

  const chunks = [buildStrips(spec)];
  // A design with a live sidebar (a booking summary, an order total) splits the body so the aside
  // can be sticky. The aside is markup only — a {{script:…}} section is what makes it live.
  if (spec.asideHtml) chunks.push(`<div class='${p}-split'><div class='${p}-main'>`);
  chunks.push(`<div class='${p}-body'>`);
  sections.forEach((s) => { chunks.push(renderSection(spec, s, cap)); });
  chunks.push(`<button class='${p}-submit' type='submit'>${esc(spec.submitLabel)}</button>`);
  chunks.push(`</div>`);
  if (spec.asideHtml) chunks.push(`</div><aside class='${p}-aside'>${spec.asideHtml}</aside></div>`);
  const body = chunks.join('');

  // The inline overrides on the root are the de-carding contract: the host paints .mfp as a card,
  // and a skin that draws its own card must flatten that one or you get a card inside a card.
  return `<div class='mfp mfp-${p} mfp-native-generated' data-mf-flexgrid="locked"`
    + ` style="background:transparent!important;border:0!important;border-radius:0!important;`
    + `padding:0!important;box-shadow:none!important">`
    + `<div class='${p}-card'>${buildHero(spec)}${body}</div></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Textures
//
// ⚠️ ModuleCssComposer.NeutralizeStyleBreakout rewrites every "</" in authored CSS to "<\/" so
// customCss cannot close the <style> element early. An inline data:image/svg+xml URI contains
// "</svg>", which that rewrite would corrupt into a broken image with no error anywhere. So the
// payload is FULLY percent-encoded: "<" becomes %3C and "/" becomes %2F, the literal "</" never
// appears, and the browser decodes it when it parses the URI.
// ─────────────────────────────────────────────────────────────────────────────
export function svgDataUri(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}

export function snowTexture(stroke = 'white') {
  const flakes = [[40, 30, 0.6], [110, 64, 0.4], [210, 24, 0.5], [300, 50, 0.35], [400, 28, 0.5],
    [500, 60, 0.4], [560, 110, 0.5], [40, 150, 0.4], [540, 170, 0.45], [90, 200, 0.35],
    [480, 210, 0.4], [300, 220, 0.3], [180, 180, 0.4]];
  const g = flakes.map(([x, y, o]) =>
    `<g transform="translate(${x},${y})" opacity="${o}" stroke="${stroke}" stroke-width="1" fill="none">`
    + `<line x1="-6" y1="0" x2="6" y2="0"/><line x1="0" y1="-6" x2="0" y2="6"/>`
    + `<line x1="-4.2" y1="-4.2" x2="4.2" y2="4.2"/><line x1="4.2" y1="-4.2" x2="-4.2" y2="4.2"/></g>`).join('');
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240">${g}</svg>`);
}

export function confettiTexture(a, b) {
  const dots = [];
  for (let i = 0; i < 26; i++) {
    const x = (i * 47) % 600, y = (i * 83) % 240, r = 2 + (i % 3);
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? a : b}" opacity="0.35"/>`);
  }
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240">${dots.join('')}</svg>`);
}

export const TEXTURES = { snow: snowTexture, confetti: confettiTexture };

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
export function buildCss(spec) {
  const p = spec.prefix;
  const c = spec.palette;
  const v = (n) => `var(--${p}-${n})`;
  const parts = [];

  // ⭐ SPECIFICITY CONTRACT — do not weaken this scope.
  // CustomShellCompatibilityCssService emits a bridge for every custom shell, scoped as
  //   :where(#mf-form-wrapper-N) .mfp[class*="mfp-"] <target> { …!important }
  // The :where() carries no weight (deliberate, so authored CSS can win), but `.mfp[class*="mfp-"]`
  // is TWO class-level selectors, and the bridge still says !important. A rule written
  // `.mfp-<prefix> .x` is only ONE class-level selector deep, so the bridge outranked it and won
  // even though both were !important. Measured live on the xmas-sale skin: the white serif hero
  // headline rendered near-black (bridge forced h1 to the host text colour) and the emerald submit
  // rendered #3b82f6 (bridge forced button[type=submit] to the host primary).
  // `.mfp.mfp-<prefix>` is two class-level selectors, which puts every authored rule one notch
  // above the bridge. Targets the bridge qualifies with an element (h1, button[type=submit]) need
  // the element on our side too — see the two rules that spell that out below.
  //
  // [2026-08-07] That was still not enough, and the reason was measured rather than reasoned:
  // the bridge's selector LIST does not stop at `.mfp[class*="mfp-"] .mf-input`. It also carries
  //   :where(#wrapper) .mfp[class*="mfp-"] input:not([type="checkbox"]):not([type="radio"])
  // which matches the same element at (0,4,1) — one element token ABOVE `.mfp.mfp-<p> .mf-input
  // [class]` at (0,4,0) — so the bridge kept the input background and colour. Dumped every rule
  // matching .mf-input in cascade order on form 59 to establish it.
  // A third class on the root lifts every authored rule to (0,5,0). The shell always carries
  // `mfp-native-generated` (see the customHtml emitters above), and this is the same escape the
  // premium templates already use.
  const S = `.mfp.mfp-${p}.mfp-native-generated `;

  // Var block. Surface/text/muted/border chain page -> preset -> literal, which is what makes a
  // dark host readable and what themeCompatibility.policy 'hybrid' promises.
  //
  // primary/accent/deco are DIFFERENT. For a skin whose identity IS its colour — a Christmas
  // emerald, a crimson newsletter — letting --mf-page-primary win repaints the design in the host
  // brand: the emerald Christmas CTA rendered host blue on the QA page. Those three stay literal
  // and are declared in themeCompatibility.immutable so the contract is stated, not implied.
  // A skin that WANTS host recolouring sets `brandFollowsHost: true`.
  const brand = (name, literal) => (spec.brandFollowsHost
    ? `var(--mf-page-primary,var(--mf-preset-primary,${literal}))`
    : literal);
  parts.push(`${S}{`
    + `--${p}-primary:${brand('primary', c.primary)};`
    + `--${p}-accent:${brand('accent', c.accent)};`
    + `--${p}-surface:var(--mf-page-surface,var(--mf-preset-surface,${c.surface}));`
    + `--${p}-text:var(--mf-page-text,var(--mf-preset-text,${c.text}));`
    + `--${p}-muted:var(--mf-page-muted,var(--mf-preset-muted,${c.muted}));`
    + `--${p}-border:var(--mf-page-border,var(--mf-preset-border,${c.border}));`
    + `--${p}-on-primary:var(--mf-preset-on-primary,${c.onPrimary || '#fff'});`
    + `--${p}-deco:${c.deco || c.primary};`
    + `--${p}-page:${c.page || '#fff'};`
    + `--${p}-fill:${c.inputBg || c.page || c.surface};`
    + `--${p}-fill-strong:color-mix(in srgb, ${v('text')} 9%, ${v('surface')});`
    + `--${p}-soft:color-mix(in srgb, ${v('primary')} 12%, ${v('surface')});`
    + `--${p}-hairline:color-mix(in srgb, ${v('text')} 12%, ${v('surface')});`
    + `}`);

  parts.push(`${S}{background:transparent!important;border:0!important;padding:0!important;`
    + `font-family:${spec.fontStack}}`);

  // [ExactConversion 2026-08-08] An exact conversion owns every rule below this point. It still
  // gets the scoped variables and the de-carding flatten above, because those are contracts with
  // the host rather than design decisions. `@S@` in the authored CSS expands to the scoped root,
  // which is three class-level selectors deep so the compat bridge cannot outrank it.
  if (spec.exactCss) {
    // [ThemePresets 2026-08-08, owner: "cac template chua dap ung duoc theme compatible, va cac
    // preset CSS chua co tac dung"] An exact conversion writes the mock's colours as literals, so
    // the Theme & Layout preset picker had nothing to recolour. Two changes fix that without
    // costing the fidelity the conversions exist for:
    //
    //   1. the palette vars are re-declared here on a PRESET-ONLY chain. The block above chains
    //      surface/text/muted/border through --mf-page-* first, which is the HOST page's colour -
    //      on Oqtane's dark theme that would turn every white card dark uninvited. --mf-preset-* is
    //      emitted only when someone actually picks a preset, so absent = the mock's own colour.
    //   2. every literal in the authored CSS that equals a palette entry is rewritten to that var.
    //      Default rendering is unchanged (the var falls back to the same literal); with a preset
    //      active the whole design follows it.
    //
    // Colours inside a data-URI SVG are percent-encoded (%23...) and are deliberately NOT swapped:
    // those are drawings, and a half-recoloured drawing looks worse than an honest one.
    // [ThemeSources 2026-08-08, owner: "Typography source / Color source: From page chua ap dung"]
    // The chain has to carry BOTH channels, page first: "Color source: From page" injects
    // --mf-page-*, the preset picker injects --mf-preset-*, and with neither the mock's own colour
    // stands. A preset-only chain (the first version of this) made "From page" a no-op.
    const presetVar = (name, literal) =>
      `var(--mf-page-${name === 'bg' ? 'bg' : name},var(--mf-preset-${name},${literal}))`;
    parts.push(`${S}{`
      + `--${p}-primary:${presetVar('primary', c.primary)};`
      + `--${p}-accent:${presetVar('accent', c.accent)};`
      + `--${p}-surface:${presetVar('surface', c.surface)};`
      + `--${p}-text:${presetVar('text', c.text)};`
      + `--${p}-border:${presetVar('border', c.border)};`
      + `--${p}-on-primary:${presetVar('on-primary', c.onPrimary || '#fff')};`
      // NOT via --mf-page-bg: unlike --mf-page-primary/text/border (injected only when someone
      // turns "Color source: From page" on), --mf-page-bg is emitted by the theme service for every
      // form from the HOST page background. Chaining through it painted the frame with Oqtane's
      // dark theme by default - measured, gold-suite went from 4.2% to 49.29% against its DNN twin.
      + `--${p}-page:var(--mf-preset-bg,${c.page || '#fff'});`
      + `}`);

    let css = spec.exactCss;
    if (spec.themeVars !== false) {
      const swap = [
        ['primary', c.primary], ['accent', c.accent], ['surface', c.surface], ['text', c.text],
        ['border', c.border], ['page', c.page], ['on-primary', c.onPrimary],
      ];
      const seen = new Set();
      for (const [name, hex] of swap) {
        if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex) || seen.has(hex.toLowerCase())) continue;
        seen.add(hex.toLowerCase());
        css = css.split(new RegExp(hex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
          .join(`var(--${p}-${name})`);
      }
    }
    // [Responsive 2026-08-08, owner: "rat nhieu form khong responsive duoc"] The mocks are desktop
    // pages: their multi-column grids are unconditional, so in a narrow pane (a sidebar, a phone, a
    // 600px module column) the form column collapsed to ~190px and every label wrapped three deep.
    // These substring selectors are safe BECAUSE they are scoped under the design root - the
    // col-/title hazard is megaform matching OUR class names, not the other way round.
    // 680 was too eager: the narrowest mocks are 576px (xmas-sale) and 448px (newsletter) cards
    // that still show their desktop layout at that width, so the fallback fired against the mock
    // itself and xmas-sale went from 9 to 26 differing rows. 520 sits under every mock measure (576 is the narrowest).
    parts.push(`@container (max-width:520px){`
      + `${S}[class*="-grid"],${S}[class*="-meta"],${S}[class*="-scores"],${S}[class*="-charts"],`
      + `${S}[class*="-cols"]{grid-template-columns:1fr!important}`
      + `${S}[class*="-body"],${S}[class*="-split"],${S}[class*="-foot"],${S}[class*="-head"],`
      + `${S}[class*="-row"]{flex-wrap:wrap!important}`
      + `${S}[class*="-aside"],${S}[class*="-side"]{flex:1 1 100%!important;width:100%!important;`
      + `max-width:none!important}`
      + `}`);
    // and nothing may push the pane wider than it is
    parts.push(`${S} img{max-width:100%!important;height:auto}`);
    parts.push(`${S}{overflow-wrap:break-word}`);
    parts.push(css.replace(/@S@/g, S));
    // [2026-08-08, owner] A template ships the DESIGN, not the demo page around it. The mock's
    // outer band - its page background, its 32-48px page padding and its centring max-width - read
    // as a SECOND card once the form sits in a CMS pane, and the pane already supplies that frame.
    // Emitted after the spec's own rules and with !important so no spec has to remember it; the
    // "All forms" link the same page chrome carried is deleted from the markup, not hidden.
    parts.push(`${S}.${p}-page{padding:0!important;background:transparent!important;`
      + `min-height:0!important}`);
    // Width yes, GUTTER no: zeroing the shell padding as well is what pushed the content flat
    // against the pane edge ("bi sat mep" - lagoon-booking's first name label started at x=0). The
    // padding on this box is the mock's own page gutter, so it stays; only the centring measure goes.
    parts.push(`${S}.${p}-shell,${S}.${p}-wrap{max-width:none!important;margin:0!important}`);
    // ...and the design containers underneath it keep their padding but stop centring inside a
    // fixed measure: the owner wants the CONTENT full width in the pane, not a 768px column
    // floating in the middle of a 1192px page.
    parts.push(`${S}.${p}-grid,${S}.${p}-main,${S}.${p}-hero-in,${S}.${p}-card{`
      + `max-width:none!important;margin-left:0!important;margin-right:0!important}`);
    // [2026-08-08, owner] "mot so form bi mat 1 phan hoac tat ca border" — several designs never
    // drew a border of their own: the mock's page background was what separated the card from the
    // page, and taking that background away left a white body on a white pane with no edge at all.
    // MEASURED with tools/browser-qa/border-audit.mjs, which walks the first levels under .mfp:
    // xnl/inv/spn painted white + shadow and nothing else; agf/gsu/jba/lgn/pdo/gpr/xms painted
    // nothing at the top level. So the design's outer box states the border itself, in the design's
    // OWN border colour (the palette token the mock declares), at the radius that box already has.
    // A spec whose card already carries the border - and now spans the pane - sets
    // `outerBorder: false` so the frame is not drawn twice.
    if (spec.outerBorder !== false) {
      const ob = spec.outerBorder || {};
      const sel = ob.sel || `.${p}-page`;
      const col = ob.colour || v('border');
      const rad = ob.radius == null ? 12 : ob.radius;
      // The box also needs the design's OWN page colour back. Measured on Oqtane: with the
      // background transparent the host theme shows through, and stock Oqtane is a DARK theme - the
      // gold-suite section headings rendered near-black on black. This is not the outer card the
      // owner had removed (the design spans the pane now, so nothing is banded beside it); it is
      // the colour the mock paints under this very design.
      const bg = ob.bg === false ? null : (ob.bg || (ob.sel ? null : v('page')));
      // overflow:hidden or the radius is decoration only - a hero image, a coloured edge bar or a
      // masthead paints straight over the rounded corner and the frame reads as "mat goc".
      parts.push(`${S}${sel}{border:1px solid ${col}!important;border-radius:${rad}px!important;`
        + `overflow:hidden` + (bg ? `;background:${bg}!important` : '') + `}`);
      // ...except while a date popover is open: megaform lifts overflow on ITS OWN containers for
      // exactly this reason, and that list does not know about authored class names.
      parts.push(`.mf-form-wrapper.mf-has-date-popover ${S}${sel}{overflow:visible!important}`);
    }
    // customCss is emitted FIRST inside <style id="mf-custom-css-N"> (theme vars and the compat
    // bridge are appended after it), so an @import here really is the first thing in the sheet,
    // which is the only place the browser accepts one.
    return (spec.fontImport ? spec.fontImport + '\n' : '') + parts.join('');
  }
  // The mocks are narrow centred flyers (Tailwind max-w-xl = 576px), not full-bleed forms. Left
  // unconstrained the shell stretched to the host pane — 1192px on the full-width QA page — which
  // spreads a 2-column grid so wide the design stops reading as the mock at all.
  parts.push(`${S}.${p}-card{overflow:hidden;border-radius:${spec.cardRadius || '16px'};`
    + `max-width:${spec.cardMaxWidth || '620px'};margin:0 auto;`
    + `background:${v('surface')};box-shadow:0 2px 14px color-mix(in srgb, ${v('text')} 10%, transparent)}`);

  // Hero
  const h = spec.hero;
  parts.push(`${S}.${p}-hero{position:relative;overflow:hidden;text-align:center;`
    + `padding:${h.padding || '38px 30px 30px'};background:${h.background}}`);
  if (h.texture) {
    const tex = TEXTURES[h.texture](...(h.textureArgs || []));
    parts.push(`${S}.${p}-hero-texture{position:absolute;inset:0;background-image:${tex};`
      + `background-size:cover;background-repeat:no-repeat;pointer-events:none}`);
  }
  parts.push(`${S}.${p}-hero-inner{position:relative}`);
  if (h.emblemIcon) {
    parts.push(`${S}.${p}-hero-emblem{width:44px;height:44px;margin:0 auto 18px;border-radius:999px;`
      + `display:flex;align-items:center;justify-content:center;border:1px solid ${v('deco')};`
      + `background:rgba(255,255,255,.07);color:${v('deco')};font-size:18px}`);
  }
  parts.push(`${S}.${p}-hero-eyebrow{margin:0 0 12px;font-size:11px;font-weight:600;`
    + `text-transform:uppercase;letter-spacing:.4em;color:${h.onHeroMuted}}`);
  // The bridge qualifies headings with an element (`.mfp[class*="mfp-"] h1`), so this side needs
  // the element AND !important on the colour or the hero headline turns into host body text.
  // font-family needs !important for the same reason the colour does: the bridge sets
  // `h1{font-family:var(--mf-heading-font)!important}`, and without it the hero display measured
  // as Inter against the mock's serif while every OTHER serif element in the skin was correct.
  parts.push(`${S}.${p}-hero h1.${p}-hero-display{margin:0;font-family:${spec.displayFontStack}!important;`
    + `font-size:${h.displaySize || '48px'};line-height:1!important;font-weight:${h.displayWeight || 500};`
    + `${h.displayItalic ? 'font-style:italic;' : ''}color:${h.onHero}!important;`
    // The bridge forces a weight onto headings too, so the weight needs !important or a 500-weight
    // serif display renders at 700 and stops matching the mock.
    + `font-weight:${h.displayWeight || 500}!important;`
    + `letter-spacing:${h.displayTracking || '-.01em'}}`);
  parts.push(`${S}.${p}-hero-hairline{display:flex;align-items:center;justify-content:center;`
    + `gap:12px;margin:16px 0}`);
  parts.push(`${S}.${p}-hr{height:1px;width:40px;background:${v('deco')};opacity:.7}`);
  // The hairline word is text-white/60 in the mock, one step fainter than the eyebrow's /70.
  // Sharing onHeroMuted for both rendered it at .7 and the harness measured the .1 difference.
  parts.push(`${S}.${p}-hr-word{font-size:10px;font-weight:400;text-transform:uppercase;`
    + `letter-spacing:.3em;color:${h.onHeroFaint || h.onHeroMuted}}`);
  parts.push(`${S}.${p}-hero-sub{font-family:${spec.displayFontStack};font-size:18px;font-weight:400;`
    + `${h.displayItalic ? 'font-style:italic;' : ''}color:${h.onHeroSoft || h.onHeroMuted}}`);

  // Strips
  // Mock: `flex items-center justify-center gap-3 border-x py-3.5`. It is the card's SIDE walls
  // that continue through the strip, not a pair of horizontal rules — measured 0/1/0/1 against our
  // 1/0/1/0 — and there is no horizontal padding.
  parts.push(`${S}.${p}-tagline{display:flex;align-items:center;justify-content:center;gap:12px;`
    + `padding:14px 0;background:${v('surface')};border-left:1px solid ${v('border')};`
    + `border-right:1px solid ${v('border')}}`);
  parts.push(`${S}.${p}-dot{width:4px;height:4px;border-radius:999px;background:${v('deco')}}`);
  parts.push(`${S}.${p}-tagline-text{font-size:11px;font-weight:700;text-transform:uppercase;`
    + `letter-spacing:.32em;color:${v('primary')}}`);
  parts.push(`${S}.${p}-promo{padding:24px 30px;text-align:center;background:${v('surface')};`
    + `border-bottom:1px solid ${v('border')}}`);
  parts.push(`${S}.${p}-promo-kicker{margin:0 0 4px;font-size:10px;font-weight:900;`
    + `text-transform:uppercase;letter-spacing:.3em;color:${v('deco')}}`);
  parts.push(`${S}.${p}-promo-headline{font-family:${spec.displayFontStack};font-size:${spec.promoHeadlineSize || '36px'};`
    + `font-weight:500;line-height:1.1!important;letter-spacing:-.02em;color:${v('text')}}`);
  parts.push(`${S}.${p}-promo-hr{width:48px;height:1px;margin:12px auto;background:${v('deco')}}`);
  parts.push(`${S}.${p}-promo-body{margin:0;font-size:12px;line-height:1.6;color:${v('muted')}}`);

  // Body + captions
  // Mock body: `px-6 pt-6 pb-4` = 24/24/16. We had 30px sides, which pushed every field 5px in.
  parts.push(`${S}.${p}-body{padding:24px 24px 16px;display:flex;flex-direction:column;gap:16px}`);
  // Mock caption: `text-[11px] font-black uppercase tracking-widest mb-3 text-center`.
  // tracking-widest is .1em, NOT .16em, and the space is BELOW the caption, not above it.
  parts.push(`${S}.${p}-caption{margin:0 0 12px;font-size:11px;font-weight:900;`
    + `text-transform:uppercase;letter-spacing:.1em;text-align:center;color:${v('primary')}}`);
  parts.push(`${S}.${p}-rule{display:flex;align-items:center;gap:12px;padding-top:6px}`);
  parts.push(`${S}.${p}-rule span{font-size:11px;font-weight:600;letter-spacing:.12em;`
    + `text-transform:uppercase;color:${v('muted')}}`);
  parts.push(`${S}.${p}-rule i{flex:1;height:1px;background:${v('hairline')}}`);
  parts.push(`${S}.${p}-grid{display:grid;gap:12px}`);
  parts.push(`${S}.${p}-2{grid-template-columns:1fr 1fr}`);
  parts.push(`${S}.${p}-consent{display:flex;flex-direction:column;gap:8px}`);

  // Field chrome. The authored <span> replaces the renderer's own label, so that one is hidden
  // rather than removed - the renderer still needs it for error targeting.
  parts.push(`${S}.${p}-field{display:block;margin:0}`);
  // Mock label: `mb-1 block text-[10px] font-bold uppercase tracking-wider`.
  // tracking-wider is .05em, NOT .08em; mb-1 is 4px, not 6px.
  parts.push(`${S}.${p}-field>span{display:block;margin:0 0 4px!important;color:${v('muted')};`
    + `font-size:10px;line-height:15px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}`);
  parts.push(`${S}.${p}-field .mf-field-label{display:none!important}`);
  parts.push(`${S}.mf-field-group{margin:0!important;width:100%}`);
  parts.push(`${S}.mf-form-title,${S}.mf-form-description{display:none!important}`);

  // Inputs
  // MEASURED, not guessed. Five rules set an input's background here. The compat bridge's
  // ":where(#wrapper) .mfp[class*=\"mfp-\"] .mf-input" is (0,3,0) !important - the SAME weight as
  // "${S}.mf-input" - so source order decided it, and the bridge is emitted after customCss. It
  // won, and the input rendered host #FAFAFA / #09090B instead of the skin's colours. Adding
  // .mf-field-group takes this to (0,4,0), which is above both the bridge and the module CSS.
  const AT = '[class]';
  const inputSel = `${S}.mf-input${AT},${S}.mf-select${AT},${S}.mf-textarea${AT}`;
  if (spec.inputVariant === 'underline') {
    parts.push(`${inputSel}{width:100%!important;box-sizing:border-box!important;border:0!important;`
      + `border-bottom:2px solid ${v('border')}!important;border-radius:0!important;`
      + `background:transparent!important;padding:9px 0!important;color:${v('text')}!important;`
      + `font-family:inherit!important;font-size:14px!important;font-weight:400!important;line-height:20px!important;min-height:40px!important;outline:0!important;`
      + `box-shadow:none!important;transition:border-color .15s ease!important}`);
    parts.push(`${S}.mf-input${AT}:focus,${S}.mf-select${AT}:focus,${S}.mf-textarea${AT}:focus`
      + `{border-bottom-color:${v('primary')}!important;background:transparent!important}`);
  } else {
    parts.push(`${inputSel}{width:100%!important;box-sizing:border-box!important;`
      + `border:1px solid ${v('border')}!important;border-radius:8px!important;`
      + `background:${v('fill')}!important;padding:9px 12px!important;color:${v('text')}!important;`
      + `font-family:inherit!important;font-size:14px!important;font-weight:400!important;line-height:20px!important;min-height:42px!important;outline:0!important;`
      + `box-shadow:none!important;transition:border-color .15s ease,background .15s ease!important}`);
    parts.push(`${S}.mf-input${AT}:focus,${S}.mf-select${AT}:focus,${S}.mf-textarea${AT}:focus`
      + `{border-color:${v('primary')}!important;background:${v('surface')}!important}`);
  }
  // Mock textarea is `p-3` (12px all round) where the single-line inputs are `px-3 py-2`.
  parts.push(`${S}.mf-textarea${AT}{min-height:92px!important;height:auto!important;`
    + `padding:12px!important;resize:vertical}`);
  parts.push(`${S}.mf-input${AT}::placeholder,${S}.mf-textarea${AT}::placeholder`
    + `{color:color-mix(in srgb, ${v('text')} 40%, transparent)!important;opacity:1}`);
  parts.push(`${S}.mf-field-error{color:#dc2626;font-size:11px;margin-top:4px}`);

  // Option cards
  parts.push(`${S}.mf-option-group--cards{display:grid;gap:8px;align-items:stretch}`);
  parts.push(`${S}.mf-option-item{margin:0!important}`);
  parts.push(`${S}.mf-option-group--cards .mf-option-item{display:flex}`);
  parts.push(`${S}.mf-option-group--cards .mf-option-ui{position:relative;display:flex;`
    + `flex-direction:column;align-items:flex-start;gap:3px;width:100%;height:100%;`
    + `box-sizing:border-box;padding:12px 34px 12px 14px;border:2px solid ${v('border')};`
    + `border-radius:12px;background:transparent;cursor:pointer;transition:all .15s ease}`);
  parts.push(`${S}.mf-option-group--cards .mf-option-check,`
    + `${S}.mf-option-group--chips .mf-option-check{display:none!important}`);
  parts.push(`${S}.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui,`
    + `${S}.mf-option-group--cards input:checked+.mf-option-ui`
    + `{border-color:${v('primary')};background:${v('soft')}}`);
  parts.push(`${S}.mf-option-group--cards .mf-option-item.is-selected .mf-option-ui::after,`
    + `${S}.mf-option-group--cards input:checked+.mf-option-ui::after`
    + `{content:'';position:absolute;top:15px;right:15px;width:11px;height:6px;`
    + `border-left:2.5px solid ${v('primary')};border-bottom:2.5px solid ${v('primary')};`
    + `transform:rotate(-45deg);border-radius:1px}`);
  parts.push(`${S}.mf-option-label{color:${v('text')};font-size:13px;font-weight:700}`);
  parts.push(`${S}.mf-option-desc{color:${v('muted')};font-size:11px;font-weight:400}`);

  // Chips
  parts.push(`${S}.mf-option-group--chips{display:flex;flex-wrap:wrap;gap:6px}`);
  // Mock chip: `rounded-full px-3 py-1 text-xs font-semibold border` on a <button>, so 4/12
  // padding, 12px/16px type and the UA's centred button text. Ours inherited the option row's
  // flex gap and a 20px line-height and measured 36px tall against the mock's 26px.
  parts.push(`${S}.mf-option-group--chips .mf-option-ui{padding:4px 12px;border-radius:9999px;`
    + `display:block;gap:0;text-align:center;line-height:16px;`
    + `border:1px solid ${v('border')};background:transparent;color:${v('muted')};font-size:12px;`
    + `font-weight:600;cursor:pointer;transition:all .15s ease}`);
  // A chip's text lives in .mf-option-label, which the CARD rule below sizes at 13px/700. Without
  // this the chips measured 13px/700/text-colour against the mock's 12px/600/muted.
  parts.push(`${S}.mf-option-group--chips .mf-option-label{font-size:12px;font-weight:600;line-height:16px;color:inherit}`);
  parts.push(`${S}.mf-option-group--chips .mf-option-item.is-selected .mf-option-label,`
    + `${S}.mf-option-group--chips input:checked+.mf-option-ui .mf-option-label{color:inherit}`);
  parts.push(`${S}.mf-option-group--chips .mf-option-item.is-selected .mf-option-ui,`
    + `${S}.mf-option-group--chips input:checked+.mf-option-ui`
    + `{background:${v('primary')};border-color:${v('primary')};color:${v('on-primary')}}`);

  // Pre-baked popularity bars.
  //
  // The mock draws a percentage bar inside each tier card. That percentage cannot travel in the
  // markup: `style=` is stripped on BOTH render paths (FormHtmlRenderer and renderer/inputs.ts),
  // and an option's rich content admits no <svg> and no <img>. So the width is baked into CSS,
  // selected by the option's own input value. The consequence is worth stating: the tier list is
  // fixed by this generator — an editor adding a fourth tier in the builder gets no bar.
  if (spec.tierBars) {
    parts.push(`${S}.mf-field-group[data-key='tier'] .mf-option-ui::before`
      + `{content:'';position:absolute;left:14px;right:44px;bottom:10px;height:4px;border-radius:999px;`
      + `background:color-mix(in srgb, ${v('text')} 10%, ${v('surface')})}`);
    parts.push(`${S}.mf-field-group[data-key='tier'] .mf-option-ui{padding-bottom:24px}`);
    Object.keys(spec.tierBars).forEach((val) => {
      const pct = Number(spec.tierBars[val]) || 0;
      // `content` is not optional here. The base card rule only declares content on the SELECTED
      // tick, so a rule that merely restyles ::after produces no box at all — the bar rendered as
      // its empty grey track and nothing else until this line existed.
      parts.push(`${S}.mf-field-group[data-key='tier'] input[value='${val}']+.mf-option-ui::after`
        + `{content:'';position:absolute;top:auto;bottom:10px;right:auto;left:14px;`
        + `width:calc((100% - 58px) * ${pct / 100});`
        + `height:4px;border:0;border-radius:999px;transform:none;`
        + `background:linear-gradient(90deg,${v('primary')},${v('deco')})}`);
    });
    // The tick that ::after normally draws is reused by the bar above, so selection is shown by
    // the border/fill alone for this one field.
    parts.push(`${S}.mf-field-group[data-key='tier'] .mf-option-item.is-selected .mf-option-ui`
      + `{box-shadow:0 0 0 1px ${v('primary')} inset}`);
  }

  // Per-field column overrides
  const cols = spec.optionColumns || {};
  Object.keys(cols).forEach((k) => {
    parts.push(`${S}.mf-field-group[data-key='${k}'] .mf-option-group--cards`
      + `{grid-template-columns:repeat(${cols[k]},1fr)!important}`);
  });

  // Consent rows render as a plain sentence, not a card.
  parts.push(`${S}.${p}-consent-item>span{display:none!important}`);
  parts.push(`${S}.${p}-consent-item .mf-field-label{display:none!important}`);
  parts.push(`${S}.${p}-consent-item .mf-option-group{display:block}`);
  parts.push(`${S}.${p}-consent-item .mf-option-ui{border:0!important;background:none!important;`
    + `padding:0!important;color:${v('muted')}!important;font-weight:400!important;`
    + `font-size:12px!important;line-height:18px!important}`);

  // Submit. The authored button is the only one on screen; the generic rail is hidden through
  // :has() on the wrapper, which is how every shipped premium shell does it.
  parts.push(`.mf-form-wrapper:has(.mfp-${p}) .mf-form-actions{display:none!important}`);
  // Same story as the hero headline: the bridge targets `button[type="submit"]`, so this needs the
  // element + the attribute to outrank it. Without them the skin's button renders host-primary blue.
  const SUB = `${S}button.${p}-submit[type="submit"]`;
  parts.push(`${SUB}{width:100%!important;border:0!important;`
    // Mock CTA: `w-full rounded-xl py-3.5 … tracking-widest` — full-bleed, so no side padding.
    + `border-radius:${spec.submitRadius || '12px'}!important;padding:14px 0!important;`
    + `background:${spec.submitBackground || v('primary')}!important;color:${v('on-primary')}!important;`
    + `font-family:inherit!important;font-size:14px!important;font-weight:900!important;line-height:20px!important;text-transform:uppercase!important;letter-spacing:.1em!important;`
    + `cursor:pointer!important;box-shadow:none!important;transition:filter .15s ease,opacity .15s ease}`);
  parts.push(`${SUB}:hover{filter:brightness(1.06)}`);
  // GateUntilValid paints the blocked state on the button the renderer manages; the authored
  // button forwards to it, so it needs the same affordance or the form looks interactive when
  // it is not.
  parts.push(`${S}button.${p}-submit.mf-nav-blocked,${S}button.${p}-submit[disabled]`
    + `{background:${v('border')}!important;cursor:not-allowed!important;filter:none!important}`);
  parts.push(`${S}.mf-form-actions button,${S}.mf-btn-submit`
    + `{background:${spec.submitBackground || v('primary')}!important}`);

  // Sticky aside layout
  if (spec.asideHtml) {
    parts.push(`${S}.${p}-split{display:grid;grid-template-columns:1fr ${spec.asideWidth || '270px'};`
      + `gap:0;align-items:start}`);
    parts.push(`${S}.${p}-main{min-width:0}`);
    parts.push(`${S}.${p}-aside{position:sticky;top:16px;align-self:start;padding:22px 20px;`
      + `border-left:1px solid ${v('border')};background:color-mix(in srgb, ${v('primary')} 5%, ${v('surface')})}`);
    parts.push(`${S}.${p}-aside-title{margin:0 0 12px;font-size:11px;font-weight:900;`
      + `text-transform:uppercase;letter-spacing:.16em;color:${v('primary')}}`);
    parts.push(`${S}.${p}-aside-row{display:flex;justify-content:space-between;gap:10px;`
      + `padding:7px 0;font-size:12px;border-bottom:1px solid ${v('hairline')}}`);
    parts.push(`${S}.${p}-aside-row span:first-child{color:${v('muted')}}`);
    parts.push(`${S}.${p}-aside-row span:last-child{color:${v('text')};font-weight:700;text-align:right}`);
    parts.push(`${S}.${p}-aside-total{display:flex;justify-content:space-between;gap:10px;`
      + `margin-top:12px;padding-top:12px;border-top:2px solid ${v('primary')};font-size:15px;`
      + `font-weight:900;color:${v('text')}}`);
    parts.push(`${S}.${p}-aside-empty{color:${v('muted')};font-size:12px;font-style:italic}`);
    // Inside the guard on purpose: emitted unconditionally, this rule changed all six existing
    // templates by 169 bytes each and added CSS for markup they do not have.
    parts.push(`@media (max-width:860px){${S}.${p}-split{grid-template-columns:1fr}`
      + `${S}.${p}-aside{position:static;border-left:0;border-top:1px solid ${v('border')}}}`);
  }
  parts.push(`@media (max-width:640px){${S}.${p}-2{grid-template-columns:1fr}`
    + `${S}.${p}-hero-display{font-size:34px}`
    + `${S}.mf-option-group--cards{grid-template-columns:1fr!important}}`);

  // [Wizard v20260807] Rail, pages and per-step nav.
  if (spec.wizard) {
    parts.push(`${S}.${p}-rail{display:flex;align-items:center;gap:10px;padding:18px 26px;`
      + `background:color-mix(in srgb, ${v('primary')} 5%, ${v('surface')});`
      + `border-bottom:1px solid ${v('border')}}`);
    parts.push(`${S}.${p}-step{display:flex;align-items:center;gap:9px;opacity:.45;`
      + `transition:opacity .15s ease}`);
    // The renderer marks the live step with is-active; without an opacity/colour change the rail
    // renders identically on every page and the wizard looks broken.
    parts.push(`${S}.${p}-step.is-active,${S}.${p}-step.done{opacity:1}`);
    parts.push(`${S}.${p}-step-num{display:flex;align-items:center;justify-content:center;`
      + `width:26px;height:26px;border-radius:999px;border:1.5px solid ${v('border')};`
      + `font-size:11px;font-weight:800;color:${v('muted')};flex:0 0 auto}`);
    parts.push(`${S}.${p}-step.is-active .${p}-step-num,${S}.${p}-step.done .${p}-step-num`
      + `{background:${v('primary')};border-color:${v('primary')};color:${v('on-primary')}}`);
    parts.push(`${S}.${p}-step-text{display:flex;flex-direction:column;line-height:1.2}`);
    parts.push(`${S}.${p}-step-label{font-size:12px;font-weight:800;color:${v('text')}}`);
    parts.push(`${S}.${p}-step-sub{font-size:10px;color:${v('muted')}}`);
    parts.push(`${S}.${p}-step-line{flex:1;height:1px;background:${v('border')};min-width:12px}`);
    parts.push(`${S}.${p}-page{display:flex;flex-direction:column;gap:16px}`);
    parts.push(`${S}.${p}-nav{display:flex;align-items:center;justify-content:space-between;`
      + `gap:12px;margin-top:8px;padding-top:16px;border-top:1px solid ${v('hairline')}}`);
    const btn = `border:0!important;border-radius:${spec.submitRadius || '10px'}!important;`
      + `padding:12px 22px!important;font-family:inherit!important;font-size:13px!important;`
      + `font-weight:800!important;line-height:20px!important;cursor:pointer!important;`
      + `box-shadow:none!important`;
    parts.push(`${S}button.${p}-next[data-mf-native-next]{${btn};`
      + `background:${spec.submitBackground || v('primary')}!important;color:${v('on-primary')}!important}`);
    parts.push(`${S}button.${p}-back[data-mf-native-back]{${btn};`
      + `background:transparent!important;color:${v('muted')}!important;`
      + `border:1px solid ${v('border')}!important}`);
    // In a wizard the submit button is the LAST page's action, so it sits in the nav row rather
    // than spanning the card.
    parts.push(`${S}button.${p}-submit[data-mf-native-submit]{width:auto!important}`);
    parts.push(`${S}button.${p}-next.mf-nav-blocked,${S}button.${p}-next[disabled]`
      + `{background:${v('border')}!important;cursor:not-allowed!important;filter:none!important}`);
    parts.push(`@media (max-width:640px){${S}.${p}-rail{flex-wrap:wrap;gap:8px}`
      + `${S}.${p}-step-line{display:none}}`);
  }

  if (spec.extraCss) parts.push(spec.extraCss.replace(/@S@/g, S));

  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Template assembly
// ─────────────────────────────────────────────────────────────────────────────
const TRANSPARENT_CONTENT_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

const CONTENT_IMAGE_HINTS = new Set([
  'avatar', 'background', 'banner', 'bg', 'cover', 'gallery', 'hero', 'icon', 'image', 'img',
  'logo', 'mascot', 'photo', 'pic', 'picture', 'slide', 'slider', 'thumb', 'thumbnail',
  'wallpaper',
]);

const CONTENT_ENTITIES = {
  amp: '&', apos: "'", copy: '\u00a9', euro: '\u20ac', gt: '>', laquo: '\u00ab',
  ldquo: '\u201c', lsaquo: '\u2039', lsquo: '\u2018', lt: '<', mdash: '\u2014',
  middot: '\u00b7', nbsp: '\u00a0', ndash: '\u2013', quot: '"', raquo: '\u00bb',
  rdquo: '\u201d', reg: '\u00ae', rsaquo: '\u203a', rsquo: '\u2019', trade: '\u2122',
};

function decodeContentText(value) {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (all, code) => {
    if (code[0] === '#') {
      const radix = code[1].toLowerCase() === 'x' ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const point = Number.parseInt(digits, radix);
      return Number.isFinite(point) ? String.fromCodePoint(point) : all;
    }
    const decoded = CONTENT_ENTITIES[code.toLowerCase()];
    if (decoded === undefined) {
      throw new Error(`Unsupported HTML entity in editable template content: &${code};`);
    }
    return decoded;
  });
}

function contentKeyBase(value) {
  let key = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 52)
    .replace(/_+$/g, '');
  if (!key) key = 'text';
  if (/^[0-9]/.test(key)) key = `text_${key}`;
  return key;
}

function isContentImageKey(key) {
  return String(key || '').toLowerCase().split(/[_\-\s]+/).some((part) => CONTENT_IMAGE_HINTS.has(part));
}

/**
 * Turn every user-visible literal text node in an exact shell into an encoded {{content:key}}
 * token. Keys are deterministic and copy-derived, so regenerating a template does not churn the
 * schema and repeated labels such as "Back" intentionally share one setting.
 *
 * This is deliberately a text-node lexer, not an HTML rewrite: authored tags, whitespace,
 * field/script/form tokens and all measured geometry remain byte-for-byte where they were. Image
 * tokens authored in safe attributes are also seeded here; image-like keys get a transparent
 * pixel so the mock's cross-platform CSS background remains the default until the owner chooses
 * an uploaded replacement.
 */
export function tokenizeEditableContent(html, initialContent = {}) {
  const content = {};
  Object.keys(initialContent || {}).forEach((key) => {
    content[key] = String(initialContent[key] ?? '');
  });

  const valueToKey = new Map();
  Object.keys(content).forEach((key) => {
    if (!valueToKey.has(content[key])) valueToKey.set(content[key], key);
  });

  const keyFor = (value) => {
    if (valueToKey.has(value)) return valueToKey.get(value);
    const base = contentKeyBase(value);
    let key = base;
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(content, key) && content[key] !== value) {
      key = `${base}_${suffix++}`;
    }
    content[key] = value;
    valueToKey.set(value, key);
    return key;
  };

  const tokenPattern = /(\{\{(?:content|field|form|script):[a-zA-Z0-9_-]+\}\})/g;
  const output = String(html || '').split(/(<[^>]+>)/g).map((part) => {
    if (!part || part[0] === '<') return part;
    return part.split(tokenPattern).map((piece) => {
      if (!piece || /^\{\{(?:content|field|form|script):/.test(piece)) return piece;
      const lead = (piece.match(/^\s*/) || [''])[0];
      const tail = (piece.match(/\s*$/) || [''])[0];
      const coreEnd = piece.length - tail.length;
      const core = piece.slice(lead.length, coreEnd < lead.length ? lead.length : coreEnd);
      if (!core || !/[\p{L}\p{N}]/u.test(decodeContentText(core))) return piece;
      const value = decodeContentText(core);
      return `${lead}{{content:${keyFor(value)}}}${tail}`;
    }).join('');
  }).join('');

  const anchors = output.matchAll(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g);
  for (const match of anchors) {
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(content, key)) {
      content[key] = isContentImageKey(key) ? TRANSPARENT_CONTENT_IMAGE : '';
    }
  }

  return { html: output, content };
}

export function buildTemplate(spec) {
  const fields = buildFields(spec);
  const editable = tokenizeEditableContent(buildShell(spec), spec.customContent || {});
  const customHtml = editable.html;
  const customCss = buildCss(spec);

  return {
    version: '1.0',
    slug: spec.slug,
    title: spec.title,
    description: spec.description,
    category: spec.category || 'application',
    categories: spec.categories || ['application', 'premium'],
    icon: spec.icon || 'file-text',
    submitButtonText: spec.submitLabel,
    successMessage: spec.successMessage,
    settings: {
      theme: spec.theme || 'custom',
      multiPage: !!spec.multiPage || !!spec.wizard,
      // isPremiumNativeCustomHtmlMode() needs BOTH multi-step custom HTML and this flag; without
      // it the shell's own rail and nav buttons are never bound and the form renders as one long
      // page with the generic Next/Previous rail underneath.
      premiumNativePageBreak: spec.wizard ? true : undefined,
      showProgressBar: false,
      customContent: editable.content,
      customScripts: spec.customScripts || {},
      customHtml,
      customCss,
      themeSelector: false,
      premiumGeneratedShell: true,
      // Shipped 2026-08-07: the mock's CTA is dead until the form is valid. Opt-in per form.
      gateNavigationUntilValid: true,
      // Shipped 2026-08-07: {{field:*}} resolves here. Before that, the success screen could
      // only interpolate {{submission:id}}/{{form:title}}/{{form:description}}.
      postSubmitExperience: {
        enabled: true,
        mode: 'rich',
        title: spec.successTitle || 'Application received!',
        message: spec.successBody,
        showSubmissionId: true,
        submissionIdLabel: 'Reference:',
        showAnswerSummary: false,
        allowFillAgain: true,
        fillAgainLabel: 'Submit another',
        doneLabel: 'Done',
      },
      themeCompatibility: {
        policy: 'hybrid',
        supportsPageColors: !!spec.brandFollowsHost,
        supportsPageTypography: true,
        supportsDarkHost: true,
        prefixes: [spec.prefix],
        // Stated, not implied: these three do NOT follow the host brand (see buildCss).
        immutable: spec.brandFollowsHost ? [] : ['primary', 'accent', 'deco'],
      },
    },
    fields,
    rules: [],
    workflow: { notifications: [] },
    // Non-enumerable so it never reaches the shipped JSON; validate() reads it.
    ...(spec.successNoInterpolation ? { __successNoInterpolation: true } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation. Every check here is a failure mode that has actually shipped.
// ─────────────────────────────────────────────────────────────────────────────
export function validate(tpl) {
  const errs = [];
  const s = tpl.settings;
  const css = s.customCss;
  const html = s.customHtml;

  // An unbalanced comment silently deletes the rule that FOLLOWS it: a CSS parser meeting
  // garbage resyncs at the next '}'. Braces stay balanced, devtools still shows the source,
  // and the rule simply never applies. Cost us a whole round on invoice-blue.
  const open = (css.match(/\/\*/g) || []).length;
  const close = (css.match(/\*\//g) || []).length;
  if (open !== close) errs.push(`CSS comment imbalance: ${open} "/*" vs ${close} "*/"`);

  const ob = (css.match(/\{/g) || []).length;
  const cb = (css.match(/\}/g) || []).length;
  if (ob !== cb) errs.push(`CSS brace imbalance: ${ob} "{" vs ${cb} "}"`);

  // Every field must have exactly one slot, or the renderer appends the orphans below the shell
  // and the design grows a second, unstyled copy of the field.
  const flat = [];
  const walk = (arr) => arr.forEach((f) => {
    if (f.columns) { f.columns.forEach((c) => walk(c.fields || [])); return; }
    if (!['Section', 'Html', 'Row'].includes(f.type)) flat.push(f.key);
  });
  walk(tpl.fields);
  flat.forEach((k) => {
    const n = (html.match(new RegExp(`\\{\\{field:${k}\\}\\}`, 'g')) || []).length;
    if (n !== 1) errs.push(`field '${k}' appears ${n}x in customHtml (need exactly 1)`);
  });
  // Structural fields (Section/Html/Row) MAY be placed — a wizard puts each step's Section at the
  // head of its page, which is where the runtime expects it — but are not REQUIRED to be, so they
  // are legal slot targets without joining the exactly-once check above.
  const structural = [];
  const walkStructural = (arr) => arr.forEach((f) => {
    if (['Section', 'Html', 'Row'].includes(f.type)) structural.push(f.key);
    if (f.columns) f.columns.forEach((c) => walkStructural(c.fields || []));
  });
  walkStructural(tpl.fields);
  const placeable = flat.concat(structural);
  const slots = (html.match(/\{\{field:([A-Za-z0-9_]+)\}\}/g) || [])
    .map((m) => m.slice(8, -2));
  slots.forEach((k) => { if (!placeable.includes(k)) errs.push(`customHtml references unknown field '${k}'`); });

  // Exact shells expose their authored copy through customContent. The renderer HTML-encodes this
  // channel, which is safe in text and ordinary attributes but not in a CSS string after entity
  // decoding, so content tokens in style attributes are rejected outright.
  const contentAnchors = new Set((html.match(/\{\{content:([A-Za-z0-9_-]+)\}\}/g) || [])
    .map((m) => m.slice(10, -2)));
  const contentValues = s.customContent || {};
  contentAnchors.forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(contentValues, k)) {
      errs.push(`{{content:${k}}} has no customContent value`);
    } else if (typeof contentValues[k] !== 'string') {
      errs.push(`customContent['${k}'] must be a string`);
    }
  });
  Object.keys(contentValues).forEach((k) => {
    if (!contentAnchors.has(k)) errs.push(`customContent['${k}'] has no {{content:${k}}} anchor`);
  });
  if (/style\s*=\s*(['"])[^'"]*\{\{content:/i.test(html)) {
    errs.push('customContent token is inside a style attribute — use an img/src token instead');
  }
  const literalText = html.split(/<[^>]+>/g).find((part) => {
    const withoutTokens = part.replace(/\{\{(?:content|field|form|script):[A-Za-z0-9_-]+\}\}/g, '');
    return /[\p{L}\p{N}]/u.test(decodeContentText(withoutTokens));
  });
  if (literalText) errs.push(`user-visible literal text was not tokenized: '${literalText.trim().slice(0, 80)}'`);

  // A data URI whose "</" survived would be a silently broken image.
  if (/data:image\/svg\+xml,[^"]*<\//.test(css)) {
    errs.push('data-URI SVG is not fully percent-encoded — NeutralizeStyleBreakout will corrupt it');
  }

  // Every {{script:KEY}} anchor must have a body, and every body must have an anchor. A script
  // with no anchor never runs and a form that quietly lost its live totals looks identical to one
  // that never had them.
  const anchors = new Set((html.match(/\{\{script:([A-Za-z0-9_-]+)\}\}/g) || [])
    .map((m) => m.slice(9, -2)));
  const bodies = new Set(Object.keys(s.customScripts || {}));
  anchors.forEach((k) => { if (!bodies.has(k)) errs.push(`{{script:${k}}} has no customScripts body`); });
  bodies.forEach((k) => { if (!anchors.has(k)) errs.push(`customScripts['${k}'] has no {{script:${k}}} anchor`); });

  // A live-echo script writes into [data-mf-echo="…"] nodes. A node the script never targets is
  // dead decoration; a target with no node is a silent no-op.
  const echoNodes = new Set((html.match(/data-mf-echo=['"]([A-Za-z0-9_.-]+)['"]/g) || [])
    .map((m) => m.replace(/.*=['"]/, '').replace(/['"]$/, '')));
  if (echoNodes.size && !bodies.size) {
    errs.push(`customHtml has ${echoNodes.size} data-mf-echo node(s) but no customScripts to fill them`);
  }

  // The success screen is the whole point of shipping feature 3 first — but only where the MOCK
  // greets the applicant. The newsletter mock's success card is two lines with no name in them,
  // and inventing one to satisfy this check would be exactly the habit these conversions are
  // being corrected for. An exact conversion whose mock interpolates nothing sets
  // successNoInterpolation and says so.
  const ps = s.postSubmitExperience || {};
  if (!tpl.__successNoInterpolation && !/\{\{field:/.test(String(ps.message || ''))) {
    errs.push('postSubmitExperience.message interpolates no field — the mock greets the applicant');
  }

  try { JSON.parse(JSON.stringify(tpl)); } catch (e) { errs.push('not JSON-serialisable: ' + e.message); }
  return errs;
}

// ─────────────────────────────────────────────────────────────────────────────
// The skins
// ─────────────────────────────────────────────────────────────────────────────
export const SERIF = `'Cormorant Garamond','Playfair Display',Georgia,'Times New Roman',serif`;
export const SANS = `'Inter',system-ui,-apple-system,'Segoe UI',sans-serif`;

const SKINS = [
  // xmas-sale-euroyouth-application MOVED to build-exact-conversions.mjs on 2026-08-08. It was
  // the closest of the originals and still measured 24 differing rows: the programme cards had
  // no radio marker, the renderer's own labels duplicated the authored ones, and the body's
  // 16px flex gap double-counted spacing the mock puts on each block's own margin.
  // xmas-newsletter-euroyouth-application MOVED to build-exact-conversions.mjs on 2026-08-08:
  // its mock is an EMAIL MOCKUP (client chrome + sender row above the body card) and carries no
  // serif anywhere, while this skin gave it an italic Cormorant hero reading "Season of Giving"
  // that the mock never contained.
  // agency-flyer-euroyouth-application MOVED to build-exact-conversions.mjs on 2026-08-08: its
  // mock is a full-bleed photo hero with a LEFT-anchored italic wordmark over four separate
  // blocks on the page background, not a centred card with a hero band.
  // ───────────────────────────────────────────────────────────────────────────
  // From the mock filed as "hotel-concierge". It is NOT a hotel form: its copy says
  // "saved to your first book", its fields are SCHOOL / AUTHOR / ADDRESS, its placeholders are
  // "Mia" / "Meadowlark School", and its hero PNG is never referenced. The mock's slug is
  // misleading, so this ships as what the design actually is. Flagged for the owner.
  // ───────────────────────────────────────────────────────────────────────────
  // kids-first-book-registration MOVED to build-exact-conversions.mjs on 2026-08-08: the mock is
  // a dashed-border scrapbook card with ONE field per line behind a fixed 150px uppercase label
  // on a dotted rule, and five full-bleed pastel section bands - none of which a skin can express.

  // ───────────────────────────────────────────────────────────────────────────
  // hotel-suite. Membership tiers with a popularity bar per tier.
  //
  // The mock carries EuroYouth's "Programme track" and "Language level" selects into a luxury
  // hotel form — the handoff flagged that as a content bug to resolve on conversion, so the track
  // is relabelled with suite options and the CEFR level is dropped rather than shipped.
  //
  // The popularity bars are PRE-BAKED CSS widths keyed off each option's input value. `style=` is
  // stripped on both render paths, so a percentage cannot travel in the markup; and an option's
  // rich content cannot carry an <svg> or an <img>. A baked class per value is what is left, and
  // it is why the tier list is fixed rather than editable.
  // ───────────────────────────────────────────────────────────────────────────
  // gold-suite-membership-application MOVED to build-exact-conversions.mjs on 2026-08-08: the
  // mock has no hero band and no card at all - a full-bleed 320px photograph with stat pills over
  // it, then a bare 896px column whose three membership tiers sit SIDE BY SIDE with a price, a
  // popularity meter and a perk list each. This skin stacked them inside an invented dark hero.
  // ───────────────────────────────────────────────────────────────────────────
  // rose-registration. The mock's hero is a photograph, `/images/rose-wellness-hero.png`, which
  // is NOT in this repository — the handoff listed it as a blocker needing someone to source the
  // asset. Rather than ship a template with a dead <img> (which also makes the overlay text read
  // wrong against the fallback), the hero degrades to a rose gradient with a petal texture. Drop
  // the photo in later and add one background-image rule; nothing else has to change.
  // The mock also fetches Google Fonts remotely; this uses a local serif stack instead.
  // ───────────────────────────────────────────────────────────────────────────
  // rose-wellness-registration MOVED to tools/templates/build-exact-conversions.mjs on
  // 2026-08-08. Measured against its mock it matched TWO elements: the mock
  // (/forms/rose-registration) is a two-column EuroYouth 2026 registration with a photographic
  // panel, member statistics and a team list, and this file had converted it into a single-card
  // wellness retreat whose copy the mock never contained. A skin variant could not express it.
];

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────
// The generator body only runs when this file IS the entry point. build-mock-conversions.mjs
// imports the builders above, and an import that also wrote 6 templates as a side effect would
// be a trap for whoever added the next one.
const isMain = (() => {
  try { return resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); }
  catch { return false; }
})();

export function writeTemplates(specs, { only = null, checkOnly = false } = {}) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  let failed = 0;
  let wrote = 0;
  for (const spec of specs) {
    if (only && spec.slug !== only) continue;
    const tpl = buildTemplate(spec);
    const errs = validate(tpl);
    // A validator-only flag; it must never reach the shipped template.
    delete tpl.__successNoInterpolation;
    const dest = join(OUT_DIR, `${spec.slug}.json`);
    const json = JSON.stringify(tpl, null, 2) + '\n';
    if (errs.length) {
      failed++;
      console.error(`FAIL ${spec.slug}`);
      errs.forEach((e) => console.error(`      ${e}`));
      continue;
    }
    let note = ' (new)';
    if (existsSync(dest)) note = readFileSync(dest, 'utf8') === json ? ' (byte-identical)' : ' (updated)';
    if (!checkOnly) { writeFileSync(dest, json); wrote++; }
    console.log(`ok   ${spec.slug}  ${json.length} bytes, ${tpl.fields.length} fields,`
      + ` css ${tpl.settings.customCss.length}, html ${tpl.settings.customHtml.length}${note}`);
  }
  return { wrote, failed, total: specs.length };
}

if (isMain) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const checkOnly = args.includes('--check');

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  let failed = 0;
  let wrote = 0;
  for (const spec of SKINS) {
    if (only && spec.slug !== only) continue;
    const tpl = buildTemplate(spec);
    const errs = validate(tpl);
    // A validator-only flag; it must never reach the shipped template.
    delete tpl.__successNoInterpolation;
    const dest = join(OUT_DIR, `${spec.slug}.json`);
    const json = JSON.stringify(tpl, null, 2) + '\n';

    if (errs.length) {
      failed++;
      console.error(`FAIL ${spec.slug}`);
      errs.forEach((e) => console.error(`      ${e}`));
      continue;
    }

    let note = '';
    if (existsSync(dest)) {
      note = readFileSync(dest, 'utf8') === json ? ' (byte-identical)' : ' (updated)';
    } else {
      note = ' (new)';
    }
    if (!checkOnly) { writeFileSync(dest, json); wrote++; }
    console.log(`ok   ${spec.slug}  ${json.length} bytes, ${tpl.fields.length} fields,`
      + ` css ${tpl.settings.customCss.length}, html ${tpl.settings.customHtml.length}${note}`);
  }

  console.log(`\n${checkOnly ? 'checked' : 'wrote'} ${checkOnly ? SKINS.length : wrote} template(s), ${failed} failure(s)`);
    process.exit(failed ? 1 : 0);
}
