// Convert the Christmas mock export into a shippable MegaForm premium template, replaying the
// exact recipe that turned the Classic Car Show mock into GALLERY-PUBLISHED/classic-registration.json:
//   fields   : Input->Text, Section gets premium step properties, Checkbox label -> options[]
//   customHtml: flexgrid lock + data-mf-native-step/page + literal step texts + hostshell <style>
//   customCss : dual-channel tokens (--mf-page-X -> --mf-preset-X -> authored) + QA blocks
// Run: node convert-xmas.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const MOCK = 'E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/4NewTemplateForms/megaform-template-christmas-americana.json';
const SHIPPED_CLASSIC = 'e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/Samples/FormTemplates/Premium/GALLERY-PUBLISHED/classic-registration.json';
const OUT = 'e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/Samples/FormTemplates/Premium/GALLERY-PUBLISHED/christmas-signup.json';

const mock = JSON.parse(readFileSync(MOCK, 'utf8'));
const classic = JSON.parse(readFileSync(SHIPPED_CLASSIC, 'utf8'));

const SLUG_OLD = 'mfp-classic-americana-registration';
const SLUG_NEW = 'mfp-christmas-americana-signup';

// ── palette map: classic (americana) -> christmas ─────────────────────────────
const COLOR = [
  ['#b0342a', '#b91c1c'],   // primary
  ['#7c1f18', '#7f1d1d'],   // primary ink
  ['#1f3a5f', '#166534'],   // heading (navy -> forest green)
  ['#c69749', '#b45309'],   // accent (gold)
  ['#f6efe2', '#fdf6ee'],   // page background
  ['#f1e7d5', '#f7ece0'],   // muted surface
  ['#fffaf0', '#fffdf9'],   // input / raised surface
  ['#e2d3ba', '#e8d5c4'], ['#ddc9a8', '#e8d5c4'], ['#e6d7bd', '#e8d5c4'], ['#d8c4a2', '#e8d5c4'],
  ['#3a2f28', '#3b1f1f'],   // text
  ['#7d6c58', '#7c5252'], ['#8a7a68', '#7c5252'], ['#b3a189', '#a98080'],  // muted / placeholder
  ['#fff8ef', '#fff8f0'],   // on-primary
  ['#fdf6e9', '#fefce8'],   // hero text
  ['rgba(176,52,42,', 'rgba(185,28,28,'],   // focus soft
  ['rgba(58,47,40,', 'rgba(59,31,31,'],     // shadow
  ['rgb(246,239,226)', 'rgb(253,246,238)'],
  ['vintage-americana-header.png', 'christmas-americana-header.png'],
];
const recolor = (s) => COLOR.reduce((acc, [a, b]) => acc.split(a).join(b), s)
  .split(SLUG_OLD).join(SLUG_NEW);

// field keys differ between the two forms
const KEYMAP = [
  ['[data-key="entry_package"]', '[data-key="ticket_type"]'],
];
const rekey = (s) => KEYMAP.reduce((acc, [a, b]) => acc.split(a).join(b), s);

// ── 1. fields ────────────────────────────────────────────────────────────────
let stepIndex = 0;
const fields = mock.fields.map((f) => {
  const out = { ...f };
  if (out.type === 'Input') out.type = 'Text';
  if (out.type === 'Section') {
    stepIndex += 1;
    const props = { pageBreak: false, premiumNativeStep: true, generatedPremiumStep: true, premiumStepIndex: stepIndex };
    out.properties = props;
    out.Properties = props;          // the DNN reader looks at the PascalCase twin
  }
  // the mock calls it `hint`; the renderer only draws `helpText`
  if (out.hint && !out.helpText) out.helpText = out.hint;
  if (out.type === 'Checkbox' && !out.options) {
    // the mock puts the consent sentence in `label`; MegaForm renders it as a single option
    out.options = [{ label: out.label, value: 'yes' }];
    out.label = out.key === 'consent_rules' ? 'Rules consent' : 'Photo consent';
  }
  return out;
});

// ── 2. customHtml ────────────────────────────────────────────────────────────
const sections = mock.fields.filter((f) => f.type === 'Section');
let html = mock.customHtml;
html = html.replace(`<div class="mfp ${SLUG_NEW} mfp-native-generated">`,
                    `<div class="mfp ${SLUG_NEW} mfp-native-generated" data-mf-flexgrid="locked">`);
html = html.replace(/<li class="mfp-stepper-item" data-step="(\d)"/g,
                    (_m, n) => `<li class="mfp-stepper-item" data-step="${n}" data-mf-native-step="${n}"`);
html = html.replace(/<section class="mfp-page" data-step="(\d)"/g,
                    (_m, n) => `<section class="mfp-page" data-step="${n}" data-mf-native-page="${n}"`);
// The step engine drives the shell's own buttons only through these hooks; the mock ships plain
// buttons (and no submit at all), so wire Back/Next and append the missing Submit.
html = html.replace('<button type="button" class="mfp-btn mfp-btn-ghost" data-action="back">',
                    '<button type="button" class="mfp-btn mfp-btn-ghost" data-action="back" data-mf-native-back>');
html = html.replace('<button type="button" class="mfp-btn mfp-btn-primary" data-action="next">',
                    '<button type="button" class="mfp-btn mfp-btn-primary" data-action="next" data-mf-native-next>');
html = html.replace(/(<button type="button" class="mfp-btn mfp-btn-primary" data-action="next" data-mf-native-next>[^<]*<\/button>)/,
                    '$1\n      <button type="submit" class="mfp-btn mfp-btn-primary" data-action="submit" data-mf-native-submit>Submit Sign-Up &#127876;</button>');

// {{field:step_x.heading}} style tokens never resolve at runtime — bake the literals in
html = html.replace(/\{\{field:([a-z_]+)\.(stepSubtitle|heading|intro|stepLabel|label)\}\}/g, (m, key, prop) => {
  const s = sections.find((x) => x.key === key);
  return s && s[prop] != null ? String(s[prop]) : m;
});

// host-shell guard: the DNN/Oqtane form wrapper resets fonts and card chrome, so the shell
// re-states the measured mock values with !important, inline, before any host stylesheet.
const HOSTSHELL = `<style data-mf-qa="hostshell-v11">
/* MF-QA-HOSTSHELL-v11 */
.mfp.${SLUG_NEW}.mfp-native-generated{font-family:ui-sans-serif,system-ui,sans-serif!important;font-size:16px!important;line-height:24px!important;color:#3b1f1f!important;background:#fdf6ee!important;border:1px solid #e8d5c4!important;border-radius:14px!important;box-shadow:0 24px 64px rgba(59,31,31,.26)!important;overflow:hidden!important;max-width:720px!important;width:100%!important;--mf-form-bg:#fdf6ee;--mf-input-bg:#fffdf9;--mf-input-border-color:#e8d5c4;--mf-input-radius:10px;--mf-input-unified-height:48px;--mf-font-size-base:16px;--mf-line-height:1.5;}
.mf-form-wrapper[data-mf-has-custom-html] .mfp.${SLUG_NEW}.mfp-native-generated.mfp-native-generated.mfp-native-generated{border-radius:14px!important;background:#fdf6ee!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mf-field-label{font-size:13px!important;line-height:19.5px!important;margin-bottom:6px!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mf-input,.mfp.${SLUG_NEW}.mfp-native-generated input:not([type='checkbox']):not([type='radio']){min-height:48px!important;height:48px!important;padding:11px 13px!important;background:#fffdf9!important;border:1px solid #e8d5c4!important;border-radius:10px!important;color:#3b1f1f!important;font-size:16px!important;line-height:24px!important;}
/* END-MF-QA-HOSTSHELL-v11 */
</style>`;
html = html.replace(`data-mf-flexgrid="locked">`, `data-mf-flexgrid="locked">\n${HOSTSHELL}`);

// ── 3. customCss ─────────────────────────────────────────────────────────────
// 3a. dual-channel tokens: var(--mf-X, authored) -> var(--mf-page-Y, var(--mf-preset-Z, authored))
const TOKEN = {
  'mf-accent-ink': (v) => `var(--mf-page-primary, var(--mf-preset-primary, ${v}))`,
  'mf-accent':     (v) => `var(--mf-page-primary, var(--mf-preset-primary, ${v}))`,
  'mf-green-light':(v) => `var(--mf-page-focus-soft, ${v})`,
  'mf-green':      (v) => `var(--mf-page-heading, var(--mf-preset-text, ${v}))`,
  'mf-gold':       (v) => `var(--mf-preset-accent, ${v})`,
  'mf-bg':         (v) => `var(--mf-page-surface, var(--mf-preset-bg, ${v}))`,
  'mf-surface':    (v) => `var(--mf-page-surface, var(--mf-preset-surface, ${v}))`,
  'mf-border':     (v) => `var(--mf-page-border, var(--mf-preset-border, ${v}))`,
  'mf-text':       (v) => `var(--mf-page-text, var(--mf-preset-text, ${v}))`,
  'mf-muted':      (v) => `var(--mf-page-muted, ${v})`,
  'mf-placeholder':(v) => `var(--mf-page-muted, ${v})`,
  'mf-on-accent':  (v) => `var(--mf-preset-on-primary, ${v})`,
  'mf-focus-ring': (v) => `var(--mf-page-focus-soft, ${v})`,
};
/** Rewrite `var(--name, fallback)` with balanced-paren awareness (fallbacks contain rgba(...)). */
function tokenize(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const start = css.indexOf('var(--', i);
    if (start < 0) { out += css.slice(i); break; }
    out += css.slice(i, start);
    // find the matching close paren
    let depth = 0, j = start + 3;                    // at '('
    for (; j < css.length; j++) {
      if (css[j] === '(') depth++;
      else if (css[j] === ')') { depth--; if (depth === 0) break; }
    }
    const whole = css.slice(start, j + 1);           // var(--name, fallback)
    const inner = whole.slice(4, -1);                // --name, fallback
    const comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim().replace(/^--/, '');
    const fallback = comma < 0 ? '' : inner.slice(comma + 1).trim();
    const fn = TOKEN[name];
    out += (fn && fallback && !fallback.startsWith('var(')) ? fn(fallback) : whole;
    i = j + 1;
  }
  return out;
}
let css = tokenize(mock.customCss);
// The hero asset ships with the module, and the platform override (.DnnModule below) only works
// when the URL goes through --mf-hero-image — the mock hard-codes it, so add the indirection.
css = css.split("background-image: url('/christmas-americana-header.png')")
         .join("background-image: var(--mf-hero-image, url('/Modules/MegaForm/img/christmas-americana-header.png'))");
css = css.split("url('/christmas-americana-header.png')").join("url('/Modules/MegaForm/img/christmas-americana-header.png')");

// 3b. the QA blocks proven on the classic template, recoloured for Christmas
const classicCss = classic.settings.customCss;
const qaStart = classicCss.indexOf('/* MF-QA-PAGING-v2 */');
const qaBlocks = rekey(recolor(classicCss.slice(qaStart)));
// the multiselect block is written per field key — Christmas has two multiselects
const msStart = qaBlocks.indexOf('/* MF-QA-CLASSIC-MS-v20 */');
const msBlock = qaBlocks.slice(msStart);
const msDietary = msBlock.split('[data-key="addons"]').join('[data-key="dietary"]')
  .split('MF-QA-CLASSIC-MS-v20').join('MF-QA-XMAS-MS-DIETARY-v1');

const FIX = `/* MF-QA-FIX-v1 */
.mfp.${SLUG_NEW}{--mf-primary:var(--mf-page-primary, var(--mf-preset-primary, #b91c1c));--mf-accent:var(--mf-page-primary, var(--mf-preset-primary, #b91c1c));--mf-primary-hover:var(--mf-page-primary, var(--mf-preset-primary, #7f1d1d));--mf-primary-light:var(--mf-page-focus-soft, #fde8e8);--primary:var(--mf-page-primary, var(--mf-preset-primary, #b91c1c));}
/* END-MF-QA-FIX */
`;
const IMGPATH = `
/* MF-QA-IMGPATH-v1: DNN serves module assets under /DesktopModules/MegaForm/Assets */
.DnnModule .mfp.${SLUG_NEW}{--mf-hero-image:url('/DesktopModules/MegaForm/Assets/img/christmas-americana-header.png')}
`;

// Measured against the mock preview (Next.js) — the recoloured Americana blocks carry that
// design's hero treatment, so restate the Christmas values last and with !important (the form
// wrapper's own !important rules otherwise win on typography).
const XMAS_HERO = `
/* MF-QA-XMAS-HERO-v1 */
.mfp.${SLUG_NEW}.mfp-native-generated .mfp-hero-image{background-image:var(--mf-hero-image, url('/Modules/MegaForm/img/christmas-americana-header.png'))!important;background-size:cover!important;background-position:50% 38%!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mfp-hero-eyebrow{font-size:13px!important;line-height:19.5px!important;letter-spacing:.24em!important;text-transform:uppercase!important;font-weight:700!important;color:#fde047!important;text-shadow:0 1px 6px rgba(0,0,0,.55)!important;margin:0 0 7px!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mfp-hero-title{font-family:Georgia,'Times New Roman',serif!important;font-size:50px!important;line-height:52px!important;font-weight:800!important;letter-spacing:.5px!important;color:#fefce8!important;text-shadow:0 2px 12px rgba(0,0,0,.48)!important;margin:0!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mfp-hero-tagline{font-size:14px!important;line-height:21px!important;font-weight:600!important;letter-spacing:.04em!important;color:#fef9c3!important;text-shadow:0 1px 6px rgba(0,0,0,.5)!important;margin:5px 0 0!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mfp-stepper-item.is-done .mfp-step-badge{color:transparent!important;position:relative!important;border-color:#166534!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mfp-stepper-item.is-done .mfp-step-badge::after{content:'\\2713';position:absolute!important;inset:0!important;display:grid!important;place-items:center!important;color:#166534!important;font-size:14px!important;font-weight:800!important;}
.mfp.${SLUG_NEW}.mfp-native-generated .mfp-body{margin-top:-32px!important;padding:8px 32px 32px!important;background:repeating-linear-gradient(45deg, rgba(185,28,28,.022) 0 2px, transparent 2px 22px),repeating-linear-gradient(-45deg, rgba(22,101,52,.022) 0 2px, transparent 2px 22px),var(--mf-page-surface, var(--mf-preset-bg, #fdf6ee))!important;}
/* END-MF-QA-XMAS-HERO-v1 */
`;
css = FIX + css + '\n\n' + qaBlocks + '\n' + msDietary + IMGPATH + XMAS_HERO;

// ── 4. assemble ──────────────────────────────────────────────────────────────
const out = {
  title: mock.title,
  slug: mock.slug,
  description: mock.description,
  category: mock.category,
  theme: mock.theme,
  fields,
  customScripts: mock.customScripts || {},
  settings: {
    ...mock.settings,
    multiPage: true,
    customCss: css,
    customHtml: html,
    themeCompatibility: {
      policy: 'hybrid',
      supportsPageColors: true,
      supportsPageTypography: true,
      supportsDarkHost: true,
      prefixes: [],
      immutable: ['christmas-americana-header.png photo header'],
    },
  },
  templateGuideSlug: 'tpl-christmas-americana-signup',
  manifestVersion: 2,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log('written', OUT);
console.log('fields', fields.length, '| html', html.length, '| css', css.length);
console.log('unresolved tokens in html:', (html.match(/\{\{field:[a-z_]+\.[a-zA-Z]+\}\}/g) || []).length);
