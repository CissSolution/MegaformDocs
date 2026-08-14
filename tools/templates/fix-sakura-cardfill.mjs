// Fix: Cherry Blossom hero cards show a white gap because the template's generic
// responsive-media guard cancels the card image's fill.
//
//   .mf-form-wrapper .mfp img, ... { max-width:100%!important; height:auto!important }
//
// sits AFTER `.mfp-sakura .event-card img{width:100%;height:100%;object-fit:cover}` and
// carries !important, so the photo renders at its intrinsic ratio (259x172) inside a
// 3/4 aspect-ratio card (259x346) -> 174px of white, caption floating at the bottom.
// `object-fit:cover` is a no-op without a constrained box.
//
// Re-assert fill after the guard with a higher-specificity selector. Also restore the
// card's own overflow clipping, which `[class*="card"]{overflow:visible!important}`
// (same guard block) had cancelled, so the 16px border-radius crops the photo again.
//
// Run: node tools/templates/fix-sakura-cardfill.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';

const MARKER = 'MF-QA-SAKURA-CARDFILL-20260727';
const BLOCK = `
/* [${MARKER}] The responsive-media guard above (.mf-form-wrapper .mfp img{height:auto!important})
   cancels .event-card img{height:100%}, so the photo keeps its intrinsic ratio and leaves a white
   gap inside the aspect-ratio card. Re-assert fill AFTER the guard, and restore the card's own
   clipping that [class*="card"]{overflow:visible!important} had cancelled. */
.mf-form-wrapper .mfp.mfp-sakura .event-card,
.mfp.mfp-sakura .event-card {
    overflow: hidden !important;
}
.mf-form-wrapper .mfp.mfp-sakura .event-card img,
.mfp.mfp-sakura .event-card img {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    display: block !important;
}
`;

const TARGETS = ['Samples/FormTemplates/Premium/GALLERY-PUBLISHED/cherry-blossom-festival-registration.json'];
const check = process.argv.includes('--check');

for (const path of TARGETS) {
  const raw = readFileSync(path, 'utf8');
  const json = JSON.parse(raw);
  const slots = [];
  if (typeof json.customCss === 'string') slots.push(['customCss', json, 'customCss']);
  if (json.settings) {
    for (const k of ['customCss', 'CustomCss']) {
      if (typeof json.settings[k] === 'string') slots.push([`settings.${k}`, json.settings, k]);
    }
  }
  let changed = 0;
  for (const [label, obj, key] of slots) {
    const css = obj[key];
    if (!css.includes('.event-card')) { console.log(`  skip ${label} (no .event-card)`); continue; }
    if (css.includes(MARKER)) { console.log(`  ${label}: already patched`); continue; }
    obj[key] = css + BLOCK;
    changed++;
    console.log(`  ${label}: +${BLOCK.length} chars (was ${css.length})`);
  }
  if (!check && changed) {
    writeFileSync(path, JSON.stringify(json, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
    console.log(`WROTE ${path} (${changed} css slot(s))`);
  } else if (check) {
    console.log(`CHECK only, ${changed} slot(s) would change in ${path}`);
  } else {
    console.log(`no change needed: ${path}`);
  }
}
