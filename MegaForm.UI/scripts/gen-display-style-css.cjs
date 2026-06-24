/*
 * gen-display-style-css.cjs
 *
 * Mirrors MegaForm.UI/src/renderer/index.ts : installDisplayStyleSheet() — the
 * STATIC, form-INDEPENDENT `.mf-style-*` utility rules the renderer injects at
 * runtime as <style id="mf-display-style-rules">. Historically [B79] these were
 * moved OUT of megaform.css into runtime injection to dodge DNN's broken
 * megaform.css?cdv=N cache. On Oqtane the cache-bust is ?v=AssetVersion (works),
 * so injecting them at runtime instead caused a FOUC: the form first-paints
 * WITHOUT these rules, then the renderer injects them -> visible color/radius
 * flash. Fix: emit the SAME rules into megaform.css (a render-blocking
 * first-paint <link>) so they are present at first paint. The renderer's
 * runtime injection then becomes a harmless idempotent duplicate (and still
 * covers DNN's stale-cdv case).
 *
 * KEEP IN SYNC with index.ts:installDisplayStyleSheet(). Re-run after editing it:
 *   node MegaForm.UI/scripts/gen-display-style-css.cjs
 */
const fs = require('fs');
const path = require('path');

// ── VERBATIM copy of the css-building portion of installDisplayStyleSheet() ──
var W = '.mf-form-wrapper[class*="mf-form-wrapper"]';
var Wstd = W + ':not([data-mf-has-custom-html])';
var Wch = W + '[data-mf-has-custom-html]';
var F = '.mf-form-inner > .mf-form';
function rad(suffix, value) {
  return Wstd + '.mf-style-radius-' + suffix + ',' +
         Wstd + '.mf-style-radius-' + suffix + ' > .mf-form,' +
         Wstd + '.mf-style-radius-' + suffix + ' > ' + F + ',' +
         Wch + '.mf-style-radius-' + suffix + ' .mfp,' +
         Wch + '.mf-style-radius-' + suffix + ' .mfp-card,' +
         Wch + '.mf-style-radius-' + suffix + ' .fr-card' +
         '{border-radius:' + value + ' !important}';
}
function shadow(suffix, value) {
  return Wstd + '.mf-style-shadow-' + suffix + ' > .mf-form,' +
         Wstd + '.mf-style-shadow-' + suffix + ' > ' + F + ',' +
         Wch + '.mf-style-shadow-' + suffix + ' .mfp,' +
         Wch + '.mf-style-shadow-' + suffix + ' .mfp-card,' +
         Wch + '.mf-style-shadow-' + suffix + ' .fr-card' +
         '{box-shadow:' + value + ' !important}';
}
function border(suffix, value) {
  return Wstd + '.mf-style-border-' + suffix + ' > .mf-form,' +
         Wstd + '.mf-style-border-' + suffix + ' > ' + F + ',' +
         Wch + '.mf-style-border-' + suffix + ' .mfp,' +
         Wch + '.mf-style-border-' + suffix + ' .mfp-card,' +
         Wch + '.mf-style-border-' + suffix + ' .fr-card' +
         '{border:' + value + ' !important}';
}
function inputRad(suffix, value) {
  return W + '.mf-style-input-' + suffix + ' input,' +
         W + '.mf-style-input-' + suffix + ' textarea,' +
         W + '.mf-style-input-' + suffix + ' select' +
         '{border-radius:' + value + ' !important}';
}
var css = [
  rad('square',  '0'),
  rad('rounded', '8px'),
  rad('pill',    '16px'),
  inputRad('square',  '0'),
  inputRad('rounded', '6px'),
  W + '.mf-style-input-pill input:not([type=checkbox]):not([type=radio]),' +
  W + '.mf-style-input-pill textarea,' +
  W + '.mf-style-input-pill select' +
  '{border-radius:999px !important}',
  shadow('none',   'none'),
  shadow('soft',   '0 1px 3px rgba(15,23,42,.08)'),
  shadow('medium', '0 6px 18px rgba(15,23,42,.10)'),
  shadow('large',  '0 18px 48px rgba(15,23,42,.16)'),
  border('none',     '0'),
  border('hairline', '1px solid #e4e4e7'),
  border('prominent','2px solid #cbd5e1'),
  W + ' button[type="submit"],' +
    W + ' .mf-submit,' +
    W + ' .mfp-submit,' +
    W + ' .mf-btn-primary,' +
    W + ' .mf-form-actions button' +
    '{border-radius:var(--mf-btn-radius,6px) !important}',
  W + '.mf-style-radius-square button[type="submit"],' +
    W + '.mf-style-radius-square .mf-submit,' +
    W + '.mf-style-radius-square .mfp-submit,' +
    W + '.mf-style-radius-square .mf-form-actions button' +
    '{border-radius:0 !important}',
  W + '.mf-style-radius-pill button[type="submit"],' +
    W + '.mf-style-radius-pill .mf-submit,' +
    W + '.mf-style-radius-pill .mfp-submit,' +
    W + '.mf-style-radius-pill .mf-form-actions button' +
    '{border-radius:999px !important}',
  W + '[data-mf-has-custom-html].mf-style-radius-square .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-radius-square .mfp-card' +
    '{border-radius:0 !important}',
  W + '[data-mf-has-custom-html].mf-style-radius-rounded .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-radius-rounded .mfp-card' +
    '{border-radius:8px !important}',
  W + '[data-mf-has-custom-html].mf-style-radius-pill .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-radius-pill .mfp-card' +
    '{border-radius:16px !important}',
  W + '[data-mf-has-custom-html].mf-style-shadow-none .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-shadow-none .mfp-card' +
    '{box-shadow:none !important}',
  W + '[data-mf-has-custom-html].mf-style-shadow-soft .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-shadow-soft .mfp-card' +
    '{box-shadow:0 1px 3px rgba(15,23,42,.08) !important}',
  W + '[data-mf-has-custom-html].mf-style-shadow-medium .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-shadow-medium .mfp-card' +
    '{box-shadow:0 6px 18px rgba(15,23,42,.10) !important}',
  W + '[data-mf-has-custom-html].mf-style-shadow-large .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-shadow-large .mfp-card' +
    '{box-shadow:0 18px 48px rgba(15,23,42,.16) !important}',
  W + '[data-mf-has-custom-html].mf-style-border-none .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-border-none .mfp-card' +
    '{border:0 !important}',
  W + '[data-mf-has-custom-html].mf-style-border-hairline .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-border-hairline .mfp-card' +
    '{border:1px solid #e4e4e7 !important}',
  W + '[data-mf-has-custom-html].mf-style-border-prominent .mfp-card,' +
    W + '.mf-custom-html-mode.mf-style-border-prominent .mfp-card' +
    '{border:2px solid #cbd5e1 !important}',
  W + ' button[type="submit"],' +
    W + ' .mf-submit,' +
    W + ' .mfp-submit,' +
    W + ' .mf-btn-primary,' +
    W + ' .mf-form-actions button,' +
    W + ' .fr-btn-submit,' +
    W + ' .mfp button.fr-btn-submit,' +
    W + ' .mfp-card button[type="submit"]' +
    '{background:var(--mf-btn-bg,var(--mf-primary,inherit));color:var(--mf-btn-color,var(--mf-btn-text,var(--mf-color-text-inverse,#ffffff)))}',
].join('\n');
// ── end verbatim copy ──

const cssFile = path.resolve(__dirname, '..', '..', 'Assets', 'css', 'megaform.css');
const BEGIN = '/* === MF-DISPLAY-STYLE-RULES first-paint mirror of index.ts:installDisplayStyleSheet (gen-display-style-css.cjs — KEEP IN SYNC) BEGIN === */';
const END   = '/* === MF-DISPLAY-STYLE-RULES END === */';
const block = BEGIN + '\n' + css + '\n' + END;

let content = fs.readFileSync(cssFile, 'utf8');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = new RegExp(esc(BEGIN) + '[\\s\\S]*?' + esc(END));
if (re.test(content)) { content = content.replace(re, block); console.log('[gen] replaced existing block'); }
else { content = content.replace(/\s*$/, '') + '\n\n' + block + '\n'; console.log('[gen] appended new block'); }
fs.writeFileSync(cssFile, content, 'utf8');
console.log('[gen] display-style css =', css.length, 'chars; megaform.css now', content.length, 'chars');
console.log('[gen] target:', cssFile);
