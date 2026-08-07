#!/usr/bin/env node
/**
 * [EuroYouthSkins v20260807] One generator, many decorative skins over ONE shared form body.
 *
 * Why this exists: the 2026-08 mock batch contains five designs whose form BODY is byte-for-byte
 * the same EuroYouth application (name / email / phone / birth year / country / programme /
 * start / duration / language level / accommodation / interests / motivation / newsletter /
 * terms) wearing five different skins. That body had already been hand-written four times in
 * Samples/FormTemplates/Premium/DONEE before anyone noticed. So: the body is written ONCE here,
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
export const OUT_DIR = join(REPO, 'Samples', 'FormTemplates', 'Premium', 'DONEE');

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

const opts = (list) => list.map((v) => (typeof v === 'string' ? { label: v, value: v } : v));

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

  // Order the emitted fields the way the shell reads them, so a human diffing the JSON against
  // the design walks them top to bottom.
  if (spec.fieldOrder) {
    const rank = new Map(spec.fieldOrder.map((k, i) => [k, i]));
    list.sort((a, b) => (rank.has(a.key) ? rank.get(a.key) : 999) - (rank.has(b.key) ? rank.get(b.key) : 999));
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

export function buildShell(spec) {
  const p = spec.prefix;
  const cap = (t) => caption(p, t, spec.sectionCaptionStyle);
  const sections = spec.sections ? spec.sections(spec) : defaultSections(spec);

  const chunks = [buildStrips(spec)];
  // A design with a live sidebar (a booking summary, an order total) splits the body so the aside
  // can be sticky. The aside is markup only — a {{script:…}} section is what makes it live.
  if (spec.asideHtml) chunks.push(`<div class='${p}-split'><div class='${p}-main'>`);
  chunks.push(`<div class='${p}-body'>`);
  sections.forEach((s) => {
    if (s.html) { chunks.push(s.html); return; }
    // {{script:KEY}} becomes a hidden anchor; the renderer executes settings.customScripts[KEY]
    // next to it with __mfCurrentScriptRoot resolved. This is how a template gets live behaviour
    // without an engine change.
    if (s.script) { chunks.push(`{{script:${s.script}}}`); return; }
    if (s.consent) {
      chunks.push(`<div class='${p}-consent'>`);
      s.consent.forEach(([label, key]) => chunks.push(slot(p, label, key, `${p}-consent-item`)));
      chunks.push(`</div>`);
      return;
    }
    if (s.caption) chunks.push(cap(s.caption));
    if (s.grid && s.grid.length) {
      chunks.push(`<div class='${p}-grid ${p}-2'>`);
      s.grid.forEach(([label, key]) => chunks.push(slot(p, label, key)));
      chunks.push(`</div>`);
    }
    (s.slots || []).forEach(([label, key]) => chunks.push(slot(p, label, key)));
  });
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

const TEXTURES = { snow: snowTexture, confetti: confettiTexture };

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
  const S = `.mfp.mfp-${p} `;

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
  parts.push(`${S}.${p}-hero h1.${p}-hero-display{margin:0;font-family:${spec.displayFontStack};`
    + `font-size:${h.displaySize || '48px'};line-height:1!important;font-weight:${h.displayWeight || 500};`
    + `${h.displayItalic ? 'font-style:italic;' : ''}color:${h.onHero}!important;`
    // The bridge forces a weight onto headings too, so the weight needs !important or a 500-weight
    // serif display renders at 700 and stops matching the mock.
    + `font-weight:${h.displayWeight || 500}!important;`
    + `letter-spacing:${h.displayTracking || '-.01em'}}`);
  parts.push(`${S}.${p}-hero-hairline{display:flex;align-items:center;justify-content:center;`
    + `gap:12px;margin:16px 0}`);
  parts.push(`${S}.${p}-hr{height:1px;width:40px;background:${v('deco')};opacity:.7}`);
  parts.push(`${S}.${p}-hr-word{font-size:10px;font-weight:400;text-transform:uppercase;`
    + `letter-spacing:.3em;color:${h.onHeroMuted}}`);
  parts.push(`${S}.${p}-hero-sub{font-family:${spec.displayFontStack};font-size:18px;font-weight:400;`
    + `${h.displayItalic ? 'font-style:italic;' : ''}color:${h.onHeroSoft || h.onHeroMuted}}`);

  // Strips
  parts.push(`${S}.${p}-tagline{display:flex;align-items:center;justify-content:center;gap:12px;`
    + `padding:13px 16px;background:${v('surface')};border-top:1px solid ${v('border')};`
    + `border-bottom:1px solid ${v('border')}}`);
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
  parts.push(`${S}.${p}-body{padding:24px 30px 30px;display:flex;flex-direction:column;gap:16px}`);
  parts.push(`${S}.${p}-caption{margin:6px 0 0;font-size:11px;font-weight:900;`
    + `text-transform:uppercase;letter-spacing:.16em;text-align:center;color:${v('primary')}}`);
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
  parts.push(`${S}.${p}-field>span{display:block;margin:0 0 6px!important;color:${v('muted')};`
    + `font-size:10px;line-height:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}`);
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
  parts.push(`${S}.mf-textarea${AT}{min-height:92px!important;height:auto!important;resize:vertical}`);
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
  parts.push(`${S}.mf-option-group--chips .mf-option-ui{padding:6px 13px;border-radius:999px;`
    + `border:1px solid ${v('border')};background:transparent;color:${v('muted')};font-size:12px;`
    + `font-weight:600;cursor:pointer;transition:all .15s ease}`);
  // A chip's text lives in .mf-option-label, which the CARD rule below sizes at 13px/700. Without
  // this the chips measured 13px/700/text-colour against the mock's 12px/600/muted.
  parts.push(`${S}.mf-option-group--chips .mf-option-label{font-size:12px;font-weight:600;color:inherit}`);
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
    + `border-radius:${spec.submitRadius || '12px'}!important;padding:14px 20px!important;`
    + `background:${spec.submitBackground || v('primary')}!important;color:${v('on-primary')}!important;`
    + `font-family:inherit!important;font-size:14px!important;font-weight:900!important;line-height:20px!important;text-transform:uppercase!important;letter-spacing:.14em!important;`
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

  if (spec.extraCss) parts.push(spec.extraCss.replace(/@S@/g, S));

  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Template assembly
// ─────────────────────────────────────────────────────────────────────────────
export function buildTemplate(spec) {
  const fields = buildFields(spec);
  const customHtml = buildShell(spec);
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
      multiPage: !!spec.multiPage,
      showProgressBar: false,
      customContent: spec.customContent || {},
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
  const slots = (html.match(/\{\{field:([A-Za-z0-9_]+)\}\}/g) || [])
    .map((m) => m.slice(8, -2));
  slots.forEach((k) => { if (!flat.includes(k)) errs.push(`customHtml references unknown field '${k}'`); });

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

  // The success screen is the whole point of shipping feature 3 first.
  const ps = s.postSubmitExperience || {};
  if (!/\{\{field:/.test(String(ps.message || ''))) {
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
  {
    slug: 'xmas-sale-euroyouth-application',
    title: 'Christmas Offer — EuroYouth Application',
    description: 'Emerald and gold Christmas application: snowflake hero, "Five days of OFFER" promo panel, programme cards, chip interests. Submit stays locked until the form is valid, and the thank-you greets the applicant by name.',
    category: 'application',
    categories: ['application', 'premium', 'seasonal'],
    icon: 'snowflake',
    prefix: 'xms',
    fontStack: SANS,
    displayFontStack: SERIF,
    submitLabel: 'Apply Now',
    successMessage: 'Application received. We will be in touch within 5 working days.',
    successTitle: 'Application received!',
    successBody: '{{field:first_name}}, your application is confirmed.\nCheck {{field:email}} in 5 working days.',
    palette: {
      primary: '#1B8C6E', accent: '#0E5C47', surface: '#FFFFFF', text: '#1A2E26',
      muted: '#5A7A6F', border: '#B8D9CF', onPrimary: '#FFFFFF', deco: '#D9B45B', page: '#F4FAF8',
    },
    hero: {
      background: 'linear-gradient(160deg,#1B8C6E 0%,#0E5C47 100%)',
      texture: 'snow', textureArgs: ['white'],
      emblemIcon: 'fa-snowflake',
      eyebrow: 'Merry', display: 'Christmas', displayItalic: true, displaySize: '48px',
      hairlineWord: 'and', subtitle: 'Happy New Year',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(255,255,255,.7)', onHeroSoft: 'rgba(255,255,255,.85)',
    },
    strips: [
      { kind: 'tagline', text: 'Online & in Stores' },
      {
        kind: 'promo', kicker: 'Five days of', headline: 'OFFER',
        body: 'Apply during the Christmas season and receive priority placement, a reduced application fee waiver, and early access to 2026 programme spots across Europe.',
      },
    ],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'centered-caps',
    captions: {
      programme: 'Choose Your Programme', personal: 'Personal Information',
      details: 'Programme Details', interests: 'Interests', motivation: 'Motivation',
    },
    optionColumns: { programme: 1, accommodation: 2 },
  },
  {
    slug: 'xmas-newsletter-euroyouth-application',
    title: 'Christmas Newsletter — EuroYouth Application',
    description: 'Crimson and gold festive application on cream: underlined fields, gold rule work, programme cards and chip interests. Gated submit and a name-aware thank-you.',
    category: 'application',
    categories: ['application', 'premium', 'seasonal'],
    icon: 'gift',
    prefix: 'xnl',
    fontStack: SANS,
    displayFontStack: SERIF,
    submitLabel: 'Subscribe & Apply',
    successMessage: 'Application received. Watch your inbox for the Christmas edition.',
    successTitle: 'You are on the list!',
    successBody: 'Thank you {{field:first_name}}. The Christmas edition is on its way to {{field:email}}.',
    palette: {
      primary: '#C41E3A', accent: '#9B0E25', surface: '#FFF9F5', text: '#2D1F1F',
      muted: '#7A5C5C', border: '#E8D5D0', onPrimary: '#FFFFFF', deco: '#D4A017', page: '#F5EDE8',
    },
    hero: {
      background: 'linear-gradient(165deg,#C41E3A 0%,#9B0E25 100%)',
      texture: 'snow', textureArgs: ['#FFF3CC'],
      emblemIcon: 'fa-gift',
      eyebrow: 'Season of', display: 'Giving', displayItalic: true, displaySize: '50px',
      hairlineWord: 'est. 2026', subtitle: 'The EuroYouth Christmas Edition',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(255,243,204,.75)', onHeroSoft: 'rgba(255,255,255,.86)',
    },
    strips: [
      { kind: 'tagline', text: 'Twelve Programmes · One Europe' },
      {
        kind: 'promo', kicker: 'Inside this issue', headline: 'Winter Intake',
        body: 'Programme spots for the winter intake, host-family stories from Florence and Lisbon, and the 2026 mobility calendar — delivered before the new year.',
      },
    ],
    inputVariant: 'underline',
    sectionCaptionStyle: 'centered-caps',
    captions: {
      programme: 'Pick a Programme', personal: 'Your Details',
      details: 'Timing & Stay', interests: 'What to Send You', motivation: 'Tell Us More',
    },
    optionColumns: { programme: 1, accommodation: 2 },
    cardRadius: '4px',
    submitRadius: '4px',
  },
  {
    slug: 'agency-flyer-euroyouth-application',
    title: 'Agency Flyer — EuroYouth Application',
    description: 'Magenta-to-cyan agency flyer application: confetti hero, bold captions, programme cards and chip interests. Gated submit and a name-aware thank-you.',
    category: 'application',
    categories: ['application', 'premium', 'marketing'],
    icon: 'megaphone',
    prefix: 'agf',
    fontStack: SANS,
    displayFontStack: SANS,
    submitLabel: 'Send Application',
    successMessage: 'Application received. Our team will reply shortly.',
    successTitle: 'Brief received!',
    successBody: 'Thanks {{field:first_name}} — we have your brief and will reply to {{field:email}} within two working days.',
    palette: {
      primary: '#E91E8C', accent: '#29B6F6', surface: '#FFFFFF', text: '#1A1A2E',
      muted: '#6B7280', border: '#E5E7EB', onPrimary: '#FFFFFF', deco: '#29B6F6', page: '#F8F9FE',
    },
    hero: {
      background: 'linear-gradient(135deg,#E91E8C 0%,#AD1169 45%,#0288D1 100%)',
      texture: 'confetti', textureArgs: ['#FCE4F3', '#E1F5FE'],
      emblemIcon: 'fa-bullhorn',
      eyebrow: 'Creative Agency', display: 'Let us build it', displaySize: '42px',
      displayWeight: 900, displayTracking: '-.03em',
      subtitle: 'Strategy · Branding · Development',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(255,255,255,.72)', onHeroSoft: 'rgba(255,255,255,.88)',
    },
    strips: [
      { kind: 'tagline', text: 'Strategy · Branding · SEO · Hosting · Advertising' },
      {
        kind: 'promo', kicker: 'What you get', headline: '5 Services',
        body: 'Strategy and branding, web hosting and development, design and advertising, digital marketing and management — highly experienced, 100% proven.',
      },
    ],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'rule',
    captions: {
      programme: 'Choose a service track', personal: 'Contact details',
      details: 'Timing', interests: 'Areas of interest', motivation: 'Project brief',
    },
    optionColumns: { programme: 1, accommodation: 2 },
    submitBackground: 'linear-gradient(135deg,#E91E8C,#29B6F6)',
    cardRadius: '20px',
  },
  // ───────────────────────────────────────────────────────────────────────────
  // From the mock filed as "hotel-concierge". It is NOT a hotel form: its copy says
  // "saved to your first book", its fields are SCHOOL / AUTHOR / ADDRESS, its placeholders are
  // "Mia" / "Meadowlark School", and its hero PNG is never referenced. The mock's slug is
  // misleading, so this ships as what the design actually is. Flagged for the owner.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'kids-first-book-registration',
    title: 'My First Book — Registration',
    description: "Pastel children's registration: rounded Nunito fields, mint and sky accents, school and author details, interests as chips, wishes as free text. Submit stays locked until the form is valid, and the thank-you greets the child by name. Converted from the mock filed as hotel-concierge, whose slug does not match its design.",
    category: 'registration',
    categories: ['registration', 'premium', 'education'],
    icon: 'book-open',
    prefix: 'kfb',
    fontStack: `'Nunito','Quicksand',system-ui,-apple-system,sans-serif`,
    displayFontStack: `'Nunito','Quicksand',system-ui,sans-serif`,
    submitLabel: 'Save to My Book',
    successMessage: 'Yay! Your registration has been saved to your first book.',
    successTitle: 'Yay!',
    successBody: '{{field:first_name}}, your registration has been saved to your first book.\nWe sent a copy to {{field:email}}.',
    palette: {
      primary: '#E8607A', accent: '#4A90D9', surface: '#FFFFFF', text: '#5A3A4A',
      muted: '#B09AA8', border: '#F0C8D8', onPrimary: '#FFFFFF', deco: '#7DD4B8', page: '#FDF0F4',
    },
    hero: {
      background: 'linear-gradient(150deg,#F9C8D4 0%,#A8D8EA 55%,#B5EAD7 100%)',
      texture: 'confetti', textureArgs: ['#FFFFFF', '#FDEEA0'],
      padding: '34px 30px 28px',
      emblemIcon: 'fa-star',
      eyebrow: 'My very own', display: 'First Book', displaySize: '42px', displayWeight: 800,
      hairlineWord: 'and me', subtitle: 'Let us fill the first page together',
      onHero: '#5A3A4A', onHeroMuted: 'rgba(90,58,74,.62)', onHeroSoft: 'rgba(90,58,74,.8)',
    },
    strips: [{ kind: 'tagline', text: 'Stories · Drawings · Dreams' }],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'centered-caps',
    cardRadius: '24px',
    submitRadius: '999px',
    cardMaxWidth: '640px',
    captions: {
      programme: 'Programme Details', personal: 'Personal Details',
      details: 'Programme Details', interests: 'My Interests', motivation: 'Notes & Wishes',
    },
    optionColumns: { programme: 1, accommodation: 2 },
    body: {
      interests: ['Art', 'Music', 'Dance', 'Sports', 'Reading', 'Cooking', 'Travel', 'Science'],
      countries: ['Germany', 'France', 'Spain', 'Italy', 'United Kingdom', 'United States',
        'Japan', 'Australia', 'Other'],
      omit: ['language_level', 'accommodation'],
      labels: { motivation: 'Notes & Wishes', interests: 'My Interests', programme: 'Choose a club' },
      // Same content bug as gold-suite: the mock keeps EuroYouth's Erasmus / Language Immersion /
      // Solidarity Corps cards inside a children's book form. Resolved on conversion instead of
      // shipped.
      options: {
        programme: [
          { label: 'Story Time Club', value: 'story', description: 'Wednesdays · read aloud together' },
          { label: 'Drawing Workshop', value: 'drawing', description: 'Saturdays · crayons provided' },
          { label: 'Reading Buddies', value: 'buddies', description: 'Weekly · paired with an older reader' },
        ],
      },
      placeholders: {
        first_name: 'Mia', last_name: 'Robinson', email: 'mia@email.com',
        phone: '(555) 010-2233', birth_year: '2006',
        motivation: 'Write your dreams and wishes here…',
      },
      termsText: 'I agree to the terms & privacy policy',
      newsletterText: 'Send me story ideas and activity sheets',
    },
    extraFields: [
      field('school', 'Text', 'School', { placeholder: 'Meadowlark School' }),
      field('author', 'Text', 'Author', { placeholder: 'Your name' }),
      field('address', 'Text', 'Address', { placeholder: '123 Main Street' }),
    ],
    fieldOrder: ['first_name', 'last_name', 'school', 'email', 'phone', 'birth_year', 'author',
      'address', 'programme', 'country', 'duration', 'start_month', 'interests', 'motivation',
      'newsletter', 'terms'],
    sections: (spec) => [
      {
        caption: 'Personal Details',
        grid: [['First name', 'first_name'], ['Last name', 'last_name'], ['School', 'school'],
          ['Email', 'email'], ['Phone', 'phone'], ['Birth year', 'birth_year'],
          ['Author', 'author'], ['Address', 'address']],
      },
      { caption: 'My Book Club', slots: [['Choose a club', 'programme']] },
      {
        caption: 'When & Where',
        grid: [['Country', 'country'], ['Duration', 'duration'], ['Start month', 'start_month']],
      },
      { caption: 'My Interests', slots: [['My Interests', 'interests']] },
      { caption: 'Notes & Wishes', slots: [['Notes & Wishes', 'motivation']] },
      { consent: [['Newsletter', 'newsletter'], ['Declaration', 'terms']] },
    ],
  },

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
  {
    slug: 'gold-suite-membership-application',
    title: 'Gold Suite — Membership Application',
    description: 'Cream and gold luxury membership application: serif display hero, three tier cards with pre-baked popularity bars and perks, guest and occasion details, experience chips. Submit stays locked until the form is valid, and the thank-you greets the member by name.',
    category: 'application',
    categories: ['application', 'premium', 'hospitality'],
    icon: 'crown',
    prefix: 'gsu',
    fontStack: `'DM Sans','Inter',system-ui,-apple-system,sans-serif`,
    displayFontStack: SERIF,
    submitLabel: 'Request Membership',
    successMessage: 'Membership request received. Our concierge will be in touch.',
    successTitle: 'Request received',
    successBody: 'Thank you {{field:first_name}}. Our concierge will contact you at {{field:email}} within one working day to confirm your {{field:tier}} membership.',
    palette: {
      primary: '#B8860B', accent: '#8B5E0A', surface: '#FFFFFF', text: '#1A1A1A',
      muted: '#8C7A5E', border: '#E8D9B0', onPrimary: '#FFFFFF', deco: '#D4A520', page: '#FFFBF2',
    },
    hero: {
      background: 'linear-gradient(160deg,#1A1A1A 0%,#3a2f14 55%,#8B5E0A 100%)',
      padding: '40px 30px 34px',
      emblemIcon: 'fa-crown',
      eyebrow: 'Exclusive Membership', display: 'Gold Suite', displayItalic: true, displaySize: '46px',
      hairlineWord: 'since 1974', subtitle: 'A residence, not a room',
      onHero: '#F5E6B8', onHeroMuted: 'rgba(245,230,184,.66)', onHeroSoft: 'rgba(245,230,184,.86)',
    },
    strips: [{ kind: 'tagline', text: 'Member Satisfaction 98% · 42 Destinations · Avg. Savings 24%' }],
    inputVariant: 'boxed',
    sectionCaptionStyle: 'rule',
    cardRadius: '6px',
    submitRadius: '4px',
    cardMaxWidth: '660px',
    captions: {
      programme: 'Suite Preference', personal: 'Member Details',
      details: 'Stay & Preferences', interests: 'Preferred Experiences', motivation: 'Why Gold Suite?',
    },
    optionColumns: { tier: 1, programme: 1 },
    tierBars: { gold: 82, platinum: 75, diamond: 91 },
    body: {
      omit: ['language_level', 'accommodation'],
      interests: ['Private Dining', 'Wine Cellar', 'Infinity Pool', 'Heli Transfers',
        'Art Gallery', 'Yacht Charter', 'Golf Course', 'Spa & Wellness'],
      countries: ['Germany', 'France', 'Spain', 'Italy', 'United Kingdom', 'United States',
        'Japan', 'UAE', 'Switzerland', 'Other'],
      labels: { programme: 'Suite preference', motivation: 'Why Gold Suite?' },
      options: {
        programme: [
          { label: 'Signature Suite', value: 'signature', description: 'Sea view · 68 m² · king bed' },
          { label: 'Garden Villa', value: 'villa', description: 'Private pool · 120 m² · two bedrooms' },
          { label: 'Penthouse Residence', value: 'penthouse', description: 'Rooftop terrace · 210 m² · butler' },
        ],
      },
      placeholders: { motivation: 'Tell us about your expectations and travel lifestyle…' },
      termsText: 'I agree to the membership terms & privacy policy',
      newsletterText: 'Send me member offers and seasonal openings',
    },
    extraFields: [
      choiceField('tier', 'Radio', 'Membership tier', [
        { label: 'Gold Membership', value: 'gold', description: '$480 per year · Priority check-in, daily breakfast, late checkout, 2 spa visits a month' },
        { label: 'Platinum Membership', value: 'platinum', description: '$980 per year · Dedicated butler, airport transfer, unlimited dining, suite upgrades' },
        { label: 'Diamond Membership', value: 'diamond', description: '$1,880 per year · Everything in Platinum, plus yacht days and private aviation credits' },
      ], 'cards', 1, { required: true }),
      choiceField('guests', 'Select', 'Number of guests', ['1', '2', '3', '4', '5', '6+'], 'dropdown', null, { defaultValue: '2' }),
      field('occasion', 'Text', 'Special occasion', { placeholder: 'Anniversary, honeymoon, milestone celebration…' }),
    ],
    fieldOrder: ['tier', 'first_name', 'last_name', 'email', 'phone', 'birth_year', 'country',
      'programme', 'guests', 'start_month', 'duration', 'occasion', 'interests', 'motivation',
      'newsletter', 'terms'],
    sections: () => [
      { caption: 'Choose Your Tier', slots: [['Membership tier *', 'tier']] },
      {
        caption: 'Member Details',
        grid: [['First name *', 'first_name'], ['Last name *', 'last_name'], ['Email *', 'email'],
          ['Phone', 'phone'], ['Birth year', 'birth_year'], ['Country *', 'country']],
      },
      {
        caption: 'Stay & Preferences',
        slots: [['Suite preference *', 'programme']],
        grid: [['Number of guests', 'guests'], ['Preferred start *', 'start_month'],
          ['Duration (months)', 'duration'], ['Special occasion', 'occasion']],
      },
      { caption: 'Preferred Experiences', slots: [['Preferred Experiences', 'interests']] },
      { caption: 'Why Gold Suite?', slots: [['Why Gold Suite? (optional)', 'motivation']] },
      { consent: [['Newsletter', 'newsletter'], ['Declaration', 'terms']] },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  // rose-registration. The mock's hero is a photograph, `/images/rose-wellness-hero.png`, which
  // is NOT in this repository — the handoff listed it as a blocker needing someone to source the
  // asset. Rather than ship a template with a dead <img> (which also makes the overlay text read
  // wrong against the fallback), the hero degrades to a rose gradient with a petal texture. Drop
  // the photo in later and add one background-image rule; nothing else has to change.
  // The mock also fetches Google Fonts remotely; this uses a local serif stack instead.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'rose-wellness-registration',
    title: 'Rose Wellness — Registration',
    description: 'Deep rose and cream wellness registration: serif display hero with petal texture, underlined fields, programme cards and chip interests. Ships without the mock\'s hero photograph (not in the repo) — the hero is a gradient until that asset arrives. Submit stays locked until the form is valid, and the thank-you greets the guest by name.',
    category: 'registration',
    categories: ['registration', 'premium', 'wellness'],
    icon: 'spa',
    prefix: 'rws',
    fontStack: `'Inter',system-ui,-apple-system,'Segoe UI',sans-serif`,
    displayFontStack: SERIF,
    submitLabel: 'Reserve My Place',
    successMessage: 'Registration received. A confirmation is on its way.',
    successTitle: 'You are booked',
    successBody: 'Thank you {{field:first_name}}. We will send the confirmation to {{field:email}}, along with what to bring.',
    palette: {
      primary: '#C2185B', accent: '#880E4F', surface: '#FFFFFF', text: '#1C1C1E',
      muted: '#6B6B6E', border: '#F0D9E2', onPrimary: '#FFFFFF', deco: '#F48FB1', page: '#FFF8F5',
    },
    hero: {
      background: 'linear-gradient(155deg,#C2185B 0%,#880E4F 60%,#4a0726 100%)',
      texture: 'confetti', textureArgs: ['#FCE4EC', '#F48FB1'],
      padding: '40px 30px 32px',
      emblemIcon: 'fa-leaf',
      eyebrow: 'A quiet week for', display: 'Rose Wellness', displayItalic: true, displaySize: '46px',
      hairlineWord: 'retreat', subtitle: 'Breathe, move, and begin again',
      onHero: '#FFFFFF', onHeroMuted: 'rgba(252,228,236,.72)', onHeroSoft: 'rgba(255,255,255,.88)',
    },
    strips: [
      { kind: 'tagline', text: 'Yoga · Nutrition · Stillness' },
      {
        kind: 'promo', kicker: 'Seven mornings of', headline: 'Retreat',
        body: 'Sunrise movement, seasonal cooking, and long afternoons with nothing scheduled. Small groups only — twelve guests to a week.',
      },
    ],
    inputVariant: 'underline',
    sectionCaptionStyle: 'rule',
    cardRadius: '10px',
    submitRadius: '999px',
    cardMaxWidth: '620px',
    captions: {
      programme: 'Choose Your Week', personal: 'Your Details',
      details: 'Stay', interests: 'What You Would Like', motivation: 'Anything We Should Know',
    },
    optionColumns: { programme: 1, accommodation: 2 },
    body: {
      interests: ['Yoga', 'Breathwork', 'Nutrition', 'Hiking', 'Massage', 'Meditation',
        'Cold Water', 'Journalling'],
      // The third EuroYouth leftover in this batch: a CEFR language level has no business in a
      // wellness retreat booking.
      omit: ['language_level'],
      labels: { programme: 'Retreat week', motivation: 'Anything we should know' },
      options: {
        programme: [
          { label: 'Restorative Week', value: 'restorative', description: 'Slow mornings · gentle movement' },
          { label: 'Active Week', value: 'active', description: 'Hiking · strength · cold water' },
          { label: 'Silent Week', value: 'silent', description: 'No phones · guided stillness' },
        ],
        accommodation: ['Garden room', 'Shared cabin', 'Private suite', 'Arriving daily'],
      },
      placeholders: { motivation: 'Injuries, dietary needs, anything at all…' },
      termsText: 'I agree to the terms and the Privacy Policy',
      newsletterText: 'Send me seasonal retreat dates',
    },
    sections: () => [
      { caption: 'Choose Your Week', slots: [['Retreat week *', 'programme']] },
      {
        caption: 'Your Details',
        grid: [['First name *', 'first_name'], ['Last name *', 'last_name'], ['Email *', 'email'],
          ['Phone', 'phone'], ['Birth year', 'birth_year'], ['Country *', 'country']],
      },
      {
        caption: 'Stay',
        grid: [['Start month *', 'start_month'], ['Duration (months)', 'duration']],
        slots: [['Room', 'accommodation']],
      },
      { caption: 'What You Would Like', slots: [['What you would like', 'interests']] },
      { caption: 'Anything We Should Know', slots: [['Anything we should know', 'motivation']] },
      { consent: [['Newsletter', 'newsletter'], ['Terms', 'terms']] },
    ],
  },
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
