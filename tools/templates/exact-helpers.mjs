/**
 * Leaf helpers shared by every exact conversion.
 *
 * These used to live in build-exact-conversions.mjs, which was fine while that file held all the
 * specs. Once a spec moved into its own module the import graph became a CYCLE - the spec imports
 * the builder for svgUrl, the builder imports the spec - and in a cycle the dependency's body runs
 * while the parent's `export const svgUrl = ...` bindings are still in the temporal dead zone. A
 * spec that calls svgUrl() at module scope then dies with "Cannot access 'svgUrl' before
 * initialization". A leaf module has no such edge.
 */
import { field } from './build-euroyouth-skins.mjs';

/** Both mount roots for a module image, as a layered background-image value. */
export const asset = (slug, file) =>
  `url('/DesktopModules/MegaForm/Assets/img/${slug}/${file}'),url('/Modules/MegaForm/img/${slug}/${file}')`;

/**
 * The neutralisation every exact conversion needs, learned one measurement at a time.
 *
 * ⚠️ NEVER put "col-" or "title" in an authored class name. megaform.css carries
 *      .mf-form-wrapper [class*="col-"]{padding-left:0!important;padding-right:0!important}
 *    and the compat bridge carries
 *      .mfp[class*="mfp-"] [class*="title"]{color:var(--mf-title-color)!important}
 *    Both are substring matches with !important, and both cost a debugging round here.
 *
 * ⚠️ Controls need the `[class]` suffix. The bridge's own selector list reaches the same element
 *    through `input:not([type="checkbox"]):not([type="radio"])` at (0,4,1); an authored
 *    `@S@.mf-input` is (0,4,0) and loses. `@S@.mf-input[class]` is (0,5,0) and wins.
 *
 * ⚠️ h1/h2/p need the ELEMENT in the selector AND !important, for the same reason.
 */
/**
 * Kill the host's own card around an exact conversion.
 *
 * The shell flattens `.mfp` inline, but `.mf-form-wrapper` OUTSIDE it still paints a white card
 * with 24px/16px padding and a max-width — so the email mockup rendered inside a second frame and
 * the design was squeezed into whatever the pane allowed. `:has()` is the only way to reach an
 * ancestor from authored CSS, and the shared kit already uses this exact shape for
 * `.mf-form-actions`.
 */
export const wrapperReset = (p) => `
/* The wrapper itself: strip the host's card, but NOT its width. Layout > Max width in the module
   settings (480/640/768/960/Full) is a max-width on THIS element, and the previous version of this
   rule overrode it with max-width:none!important - so picking 960 did nothing at all. */
.mf-form-wrapper:has(.mfp-${p}){background:transparent!important;border:0!important;
  border-radius:0!important;box-shadow:none!important;padding:0!important}
/* The boxes INSIDE it have their own measures, and those are what squeezed the design. */
.mf-form-wrapper:has(.mfp-${p}) > .mf-form-inner,
.mf-form-wrapper:has(.mfp-${p}) .mf-form,
.mf-form-wrapper:has(.mfp-${p}) .mf-fields-container{background:transparent!important;
  border:0!important;border-radius:0!important;box-shadow:none!important;padding:0!important;
  margin:0!important;max-width:none!important;width:100%!important}
`;

export const controlReset = () => `
/* megaform sets font-family on label/input/select/textarea with !important, so an authored
   <span> inside a <label> inherits the HOST typeface no matter what the shell root declares.
   Element selectors are (0,3,1) here - above megaform, below every authored class rule - and
   <i> is left alone so Font Awesome keeps its own family. */
@S@label,@S@span,@S@p,@S@div,@S@ul,@S@li,@S@h1,@S@h2,@S@h3,@S@button{font-family:inherit!important}
@S@.mf-field-label{display:none!important}
/* A wizard's page-break Section renders a visible heading the mock has no room for - it exists to
   split the pages, not to be seen. */
@S@.mf-section-break,@S@.mf-section-title{display:none!important}
@S@.mf-field-group{margin:0!important;width:100%}
@S@.mf-form-title,@S@.mf-form-description,@S@.mf-form-actions{display:none!important}
@S@.mf-option-item{margin:0!important}
/* megaform gives every option chip a 36px floor and paints .mf-option-icon as a rounded tile. */
@S@.mf-option-group--chips .mf-option-check,
@S@.mf-option-group--cards .mf-option-check{display:none!important}
@S@.mf-option-group--chips .mf-option-ui{min-height:0!important;height:auto!important}
@S@.mf-option-group--cards .mf-option-copy{display:block;width:100%}
`;

/** An underline control, as several of these mocks draw it. */
export const underlineControls = ({ border, focus, text, ph, size = 14, line = 20, pad = 10, greyEmpty = true }) => `
@S@.mf-input[class],@S@.mf-select[class]{width:100%!important;box-sizing:border-box!important;
  border:0!important;border-bottom:2px solid ${border}!important;border-radius:0!important;
  background:transparent!important;padding:${pad}px 0!important;min-height:0!important;
  height:auto!important;color:${text}!important;font-family:inherit!important;
  font-size:${size}px!important;line-height:${line}px!important;font-weight:400!important;
  box-shadow:none!important;appearance:none!important;-webkit-appearance:none!important}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-bottom-color:${focus}!important;
  box-shadow:none!important;outline:none!important}
@S@.mf-input[class]::placeholder,@S@.mf-textarea[class]::placeholder{color:${ph}!important;opacity:1}
/* :invalid only fires on a REQUIRED select; :has() covers the optional ones too. */
${greyEmpty ? `@S@.mf-select[class]:invalid,
@S@.mf-select[class]:has(option[value=""]:checked){color:${ph}!important}` : ''}
`;

/** A boxed control, as the rest of them draw it. */
export const boxedControls = ({ border, focus, text, ph, bg, radius = 8, padY = 10, padX = 12, size = 14, line = 20, greyEmpty = true }) => `
@S@.mf-input[class],@S@.mf-select[class]{width:100%!important;box-sizing:border-box!important;
  border:1px solid ${border}!important;border-radius:${radius}px!important;background:${bg}!important;
  padding:${padY}px ${padX}px!important;min-height:0!important;height:auto!important;
  color:${text}!important;font-family:inherit!important;font-size:${size}px!important;
  line-height:${line}px!important;font-weight:400!important;box-shadow:none!important}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-color:${focus}!important;
  box-shadow:none!important;outline:none!important}
@S@.mf-input[class]::placeholder,@S@.mf-textarea[class]::placeholder{color:${ph}!important;opacity:1}
${greyEmpty ? `@S@.mf-select[class]:invalid,
@S@.mf-select[class]:has(option[value=""]:checked){color:${ph}!important}` : ''}
`;


/**
 * An inline SVG as a background-image, fully percent-encoded.
 *
 * ModuleCssComposer.NeutralizeStyleBreakout rewrites every "</" in authored CSS so customCss cannot
 * close its <style> early. An un-encoded data:image/svg+xml contains "</svg>" and would be silently
 * corrupted into a broken image with no error anywhere, so "<" and "/" never appear literally.
 */
export const svgUrl = (svg) => "url(\"data:image/svg+xml,"
  + svg.replace(/\s+/g, ' ').trim()
    .replace(/%/g, '%25').replace(/</g, '%3C').replace(/>/g, '%3E')
    .replace(/\//g, '%2F').replace(/#/g, '%23').replace(/"/g, "'")
    .replace(/\{/g, '%7B').replace(/\}/g, '%7D')
  + "\")";

/**
 * The two lucide glyphs these mocks reuse, at the stroke weights lucide-react ships.
 *
 * They must be BACKGROUNDS, not <i> glyphs: a font icon as the first flex item puts the whole
 * inline-flex box on the glyph's baseline, which sat 3px below the mock's and pushed every row of
 * the card down with it.
 */
export const lucideArrowLeft = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round'
  stroke-linejoin='round'><path d='M19 12H5'/><path d='m12 19-7-7 7-7'/></svg>`);

export const lucideCheck = (stroke) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg'
  viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='3' stroke-linecap='round'
  stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>`);
