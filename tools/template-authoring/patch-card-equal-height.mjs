// Append an equal-height rule to premium templates whose choice CARDS render ragged.
//
//   node tools/template-authoring/patch-card-equal-height.mjs [slug ...]
//
// A card option group is a CSS grid, and each .mf-option-ui is only as tall as its own text —
// so a 3-up row of cards with descriptions of different lengths comes out stepped. Stretching
// the grid items and giving the option's own box height:100% levels the row.
//
// Deliberately ADDITIVE and scoped to each template's own .mfp-<shell> root: the block is
// appended to customCss, never rewritten in place, so an existing design is untouched apart
// from the card heights. Re-running is a no-op — the marker comment is the guard.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const srcDir = path.join(repo, 'Samples', 'FormTemplates', 'Premium', 'GALLERY-PUBLISHED');
const mirrorDirs = [path.join(repo, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm', 'Templates')];

const MARKER = '[CardEqualHeight v20260801]';
const wanted = process.argv.slice(2);

/** The shell root class the template paints on, e.g. "mfp-euro-youth". */
function shellClass(tpl) {
  const html = tpl?.settings?.customHtml || tpl?.settings?.CustomHtml || '';
  const m = html.match(/class=['"]mfp\s+(mfp-[A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function block(shell) {
  const s = `.mfp.${shell}`;
  return `\n/* ${MARKER} Choice cards in a row are laid out on a grid, so each card was only as
   tall as its own copy and a 3-up row came out stepped. Stretch the items and let the option's
   own box fill its track. Scoped to this shell; nothing else in the design changes. */
${s} .mf-option-group--cards{align-items:stretch}
${s} .mf-option-group--cards .mf-option-item{display:flex}
${s} .mf-option-group--cards .mf-option-ui{width:100%;height:100%;box-sizing:border-box}
`;
}

let changed = 0;
for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.json'))) {
  const full = path.join(srcDir, file);
  let tpl;
  try { tpl = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }

  const slug = tpl.slug || path.basename(file, '.json');
  if (wanted.length && !wanted.includes(slug)) continue;

  const settings = tpl.settings || {};
  const key = 'customCss' in settings ? 'customCss' : ('CustomCss' in settings ? 'CustomCss' : null);
  if (!key) { console.log(`${slug}: no customCss — skipped`); continue; }
  if (String(settings[key]).includes(MARKER)) { console.log(`${slug}: already patched`); continue; }

  const hasCards = (tpl.fields || []).some((f) =>
    String(f.optionDisplay || f.choiceDisplay || '').toLowerCase() === 'cards');
  if (!hasCards) { console.log(`${slug}: no card groups — skipped`); continue; }

  const shell = shellClass(tpl);
  if (!shell) { console.log(`${slug}: shell class not found — skipped`); continue; }

  // Some templates carry both spellings of the same payload; keep them in step.
  for (const k of ['customCss', 'CustomCss']) {
    if (k in settings) settings[k] = String(settings[k]) + block(shell);
  }
  tpl.settings = settings;

  const out = JSON.stringify(tpl, null, 2) + '\n';
  fs.writeFileSync(full, out, 'utf8');
  for (const dir of mirrorDirs) {
    const mirror = path.join(dir, file);
    if (fs.existsSync(mirror)) fs.writeFileSync(mirror, out, 'utf8');
  }
  console.log(`${slug}: patched (${shell})`);
  changed++;
}
console.log(`\n${changed} template(s) patched.`);
