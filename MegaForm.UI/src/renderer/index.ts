// ============================================================
// MegaForm Renderer — Public Form Rendering Engine
// Renders JSON schema to live form, handles validation & submit
// ============================================================

import type { FormField } from '@core/types';
import type { RendererConfig, ShowIfRule } from './helpers';
import { displayText, esc, flattenFields, normalizeSchema } from './helpers';
import { RENDERER_SIGNATURE_SIZING_BADGE, renderInput, renderSingleFieldElement, renderRowElement, renderFlexGridElement } from './inputs';
import { evaluateCondition, getFieldValue, bindConditionalLogic } from './conditional';
import { validatePage, validateForm, collectFormData, clearFieldErrors, bindFieldErrorClear } from './validation';
import { bindInteractiveElements } from './interactive';
import { collectUnloadedWidgetTypes, injectWidgetPlugins, isWidgetTypeRegistered } from '@shared/widget-plugin-autoload';
import { buildSummaryHtml } from '@shared/summary-html';
import { initInlineEdit } from '@shared/inline-edit';
import { applyFixedHeaderGuard } from './fixed-header-guard';
import { reconcilePremiumNativeStepper } from './premium-step-reconcile';
import { t } from '@i18n';

let config: RendererConfig;
// [PostSubmitSummary v20260619] Captured at submit time so the post-submit
// "answer summary" + the pre-submit review can list what the user entered.
let lastSubmittedData: Record<string, unknown> = {};
// [DoubleSubmitGuard v20260705] Premium-native custom submit buttons are reached by
// TWO paths in one click: the fields-container delegated `button[type=submit]` handler
// (bindSubmit) AND the premium-native proxy that forwards to `#mf-btn-submit` → doSubmit.
// Both call doSubmit() synchronously in the same tick → two POSTs → duplicate submissions.
// This re-entrancy flag is set right before the network POST and cleared on completion,
// so the second synchronous doSubmit() bails. It does NOT block the legitimate
// review→confirm sequence (the review path returns before the flag is ever set).
let submitInFlight = false;
const ROW_FULL_WIDTH_BADGE = 'RowFullWidth v20260409-11';
let currentPage = 0;
let totalPages = 1;
let formData: Record<string, unknown> = {};
let fieldPages: FormField[][] = [];
let paymentWatcherTimer: number | null = null;
let paymentStatusSnapshot: Record<string, string> = {};
let customHtmlHasOwnSubmit = false;
const TRIAL_SUBMIT_NOTE_BADGE = 'TrialSubmitNote v20260409-05';
const CUSTOM_SCRIPT_RENDERER_BADGE = 'CustomScript v20260501-05';
const CUSTOM_SHELL_BUILDER_COMPAT_BADGE = 'CustomShellBuilderCompat v20260623-B243-cardthua';
const CUSTOM_SCRIPT_SCHEMA_REPAIR_BADGE = 'CustomScriptSchemaRepair v20260622-B228';
const customScriptCleanupRegistry: Record<string, Array<() => void>> = {};

function repairKnownBrokenCustomScriptSource(value: string): string {
  let text = String(value || '');
  if (text.indexOf("'''}") === -1 && text.indexOf("''}") === -1 && text.indexOf("':'\"'") === -1) return text;
  text = text
    .split("'\\\"':'\"'").join("'\\\"':'\\\"'")
    .split("\"'\":'''}").join("\"'\":'&#39;'}")
    .split("\"'\":''}").join("\"'\":'&#39;'}")
    .split("\\\"'\\\":'''}").join("\\\"'\\\":'&#39;'}")
    .split("\\\"'\\\":''}").join("\\\"'\\\":'&#39;'}")
    .replace(/'\\+"':'"'/g, "'\\\"':'\\\"'")
    .replace(/\\+"'\\+":'''}/g, "\\\"'\\\":'&#39;'}")
    .replace(/\\+"'\\+":''}/g, "\\\"'\\\":'&#39;'}");
  return text;
}

// [2026-06-27 WizardGuard] Premium multi-step shells (au-family) gate each step with a
// HARD-CODED `canProceed()` keyed by step index + field name, e.g.
//   if(current===1)return checked('purpose');
// When a field is later removed (AI/builder edit changes the form's purpose), that step
// can NEVER be satisfied → the "Continue" button stays disabled → the form is UNSUBMITTABLE
// (and the wizard can't be paged through in the theme designer either). This presence-guards
// every field check so a check for a field that NO LONGER EXISTS in the DOM is treated as
// satisfied. On a PRISTINE form every field is present → `!byName('x')` is false → the
// original check runs verbatim → behaviour is byte-identical (verified on form 9). Applied at
// render time (no stored-data change); scoped to au-family scripts that define byName+canProceed.
const WIZARD_VALIDATION_GUARD_BADGE = 'WizardValidationPresenceGuard v20260627';
function guardWizardStepValidation(code: string): string {
  const text = String(code || '');
  if (!/function\s+canProceed\s*\(\s*\)/.test(text) || !/function\s+byName\s*\(/.test(text)) return text;
  if (text.indexOf('__mfGuarded') !== -1) return text;                       // idempotent
  let changed = false;
  const out = text.replace(/function\s+canProceed\s*\(\s*\)\s*\{([\s\S]*?)\}/, (full, body) => {
    if (/[{}]/.test(body)) return full;                                      // only the simple one-liner shape
    const g = String(body)
      .replace(/\bemailOk\(\)/g, "(!byName('email')||emailOk())")
      .replace(/\bchecked\('([^']+)'\)/g, "(!byName('$1')||checked('$1'))")
      .replace(/\bvalue\('([^']+)'\)/g, "(!byName('$1')||value('$1'))");
    changed = true;
    return 'function canProceed(){/*__mfGuarded*/' + g + '}';
  });
  if (changed) { try { (window as any).__MF_WIZARD_VALIDATION_GUARDED__ = WIZARD_VALIDATION_GUARD_BADGE; } catch { /* */ } }
  return out;
}

function repairRendererSchemaStrings(value: any): any {
  if (typeof value === 'string') return repairKnownBrokenCustomScriptSource(value);
  if (Array.isArray(value)) return value.map(repairRendererSchemaStrings);
  if (value && typeof value === 'object') {
    const next: any = {};
    Object.keys(value).forEach(key => { next[key] = repairRendererSchemaStrings(value[key]); });
    return next;
  }
  return value;
}

function syncPlatformTrialFlags(): void {
  const settings = (config?.schema?.settings || {}) as any;
  const platform = ((window as any).__MF_PLATFORM__ = (window as any).__MF_PLATFORM__ || {}) as any;
  const rawMode = settings.productionMode ?? settings.ProductionMode;
  const productionMode = String(rawMode).toLowerCase() === 'true';
  platform.productionMode = productionMode;
  const rawText = String(settings.trialFooterText || settings.TrialFooterText || '').trim();
  if (rawText) platform.trialFooterText = rawText;
  else delete platform.trialFooterText;
}

function getTrialSubmitNoteText(): string {
  const settings = (config?.schema?.settings || {}) as any;
  const rawText = String(settings.trialFooterText || settings.TrialFooterText || '').trim();
  if (!rawText) return '';
  const rawMode = settings.productionMode ?? settings.ProductionMode;
  const productionMode = String(rawMode).toLowerCase() === 'true';
  return productionMode ? '' : rawText;
}

function ensureTrialSubmitNoteElement(): HTMLElement {
  const noteId = `mf-trial-submit-note-${config.formId}`;
  const existing = document.getElementById(noteId) as HTMLElement | null;
  if (existing) return existing;
  const note = document.createElement('div');
  note.id = noteId;
  note.className = 'mf-trial-submit-note';
  note.setAttribute('data-trial-submit-badge', TRIAL_SUBMIT_NOTE_BADGE);
  note.style.cssText = 'margin-top:10px;font-size:12px;line-height:1.45;color:#b45309;text-align:center;';
  return note;
}

function updateTrialSubmitNote(): void {
  if (!config) return;
  const noteText = getTrialSubmitNoteText();
  const noteId = `mf-trial-submit-note-${config.formId}`;
  let note = document.getElementById(noteId) as HTMLElement | null;
  if (!noteText) {
    if (note) note.remove();
    return;
  }
  const submitBtn = document.getElementById(`mf-btn-submit-${config.formId}`) as HTMLElement | null;
  const actions = document.querySelector<HTMLElement>(`#mf-form-${config.formId} .mf-form-actions`);
  const container = document.getElementById(`mf-fields-container-${config.formId}`);
  const customSubmit = customHtmlHasOwnSubmit && container
    ? (container.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null)
    : null;
  const target = customSubmit || submitBtn || actions;
  if (!target || !target.parentElement) {
    if (note) note.remove();
    return;
  }
  note = ensureTrialSubmitNoteElement();
  note.textContent = noteText;
  if (note.parentElement !== target.parentElement || note.previousSibling !== target) {
    target.parentElement.insertBefore(note, target.nextSibling);
  }
  let hidden = target.style.display === 'none';
  if (!hidden && target === actions && submitBtn) hidden = submitBtn.style.display === 'none';
  if (!hidden && customSubmit) hidden = customSubmit.style.display === 'none';
  note.style.display = hidden ? 'none' : 'block';
}

function getNavigationButtonText(kind: 'previous' | 'next'): string {
  const settings = (config.schema?.settings || {}) as any;
  if (kind === 'previous') return String(settings.previousButtonText || 'Previous').trim() || 'Previous';
  return String(settings.nextButtonText || 'Next').trim() || 'Next';
}

// ═══════════════════════════════════════════════════════════
//  SKELETON BUILDER
//  Creates all DOM structure the renderer needs.
//  Platform views (Web, DNN, Oqtane) only need an empty mount div.
//  If skeleton already exists (DNN pre-builds it), this is a no-op.
// ═══════════════════════════════════════════════════════════
function buildSkeleton(mountEl: HTMLElement, fid: number, submitText?: string, hasCustomHtml?: boolean): void {
  // No-op only if a FULL skeleton is already present (DNN FormView.ascx pre-builds the entire
  // shell including the submit button; or a prior build of this same form).
  const existingFc0 = document.getElementById(`mf-fields-container-${fid}`);
  if (existingFc0 && document.getElementById(`mf-btn-submit-${fid}`)) return;

  // [SSR hydrate v20260620-B213] Server-rendered minimal markup case: a fields-container with
  // field-groups but no shell (no progress/actions/submit). Preserve the ACTUAL server DOM nodes
  // (so images/inputs are NOT re-fetched), build the full shell below, then move the nodes back in.
  const ssrNodes: Node[] | null = existingFc0 ? Array.from(existingFc0.childNodes) : null;

  // [SSR flicker fix v20260624-B263] Capture the server SSR wrapper's signal + classes BEFORE the
  // mountEl.innerHTML rebuild below destroys them. On the in-place SSR path for custom-HTML forms
  // the server emits <div id=mf-form-wrapper-{id} data-mf-ssr="1" class="… mf-theme-* …"> + a
  // single-source <style id=mf-custom-css-{id}>, but this rebuild drops data-mf-ssr (it was only
  // re-applied to the fields-container, never the wrapper). Without the signal,
  // applyFormPresentationSettings' guard (≈278) is skipped, it removes the server CSS block and
  // re-injects a client RendererThemeVars block → the ~200ms post-paint flicker. We re-stamp the
  // signal + server classes onto the rebuilt wrapper (see end of fn) so the guard fires and the
  // single-source server CSS is preserved.
  const existingWrapper0 = document.getElementById(`mf-form-wrapper-${fid}`);
  const wasSsr = existingWrapper0?.getAttribute('data-mf-ssr') === '1'
    || existingFc0?.getAttribute('data-mf-ssr') === '1';
  const ssrWrapperClass = (wasSsr && existingWrapper0) ? existingWrapper0.className : '';

  const btnText = esc(submitText || 'Submit');
  const prevText = esc(getNavigationButtonText('previous'));
  const nextText = esc(getNavigationButtonText('next'));
  const wrapperClass = `mf-form-wrapper${hasCustomHtml ? ' mf-custom-shell-mode' : ''}`;
  const honeypotName = `mf_hp_${fid}_${Math.random().toString(36).slice(2, 7)}`;

  const moduleIdAttr = (config as any).moduleId ? ` data-module-id="${(config as any).moduleId}"` : '';

  // [B114] Default header band for STANDARD forms (customHtml templates render
  // their own header). Without this, a plain/AI-generated form shows no title.
  // Hidden via CSS when the wrapper carries .mf-hide-header (settings.hideHeader).
  const cfgAny = config as any;
  const schemaObj = cfgAny.schema || {};
  const schemaSettings = schemaObj.settings || {};
  const hideHeaderFlag = schemaSettings.hideHeader === true || schemaSettings.HideHeader === true;
  const headerTitle = esc(String(cfgAny.title || schemaObj.title || schemaSettings.title || '').trim());
  const headerDesc  = esc(String(cfgAny.description || schemaObj.description || schemaSettings.description || '').trim());
  const headerHtml = (!hasCustomHtml && !hideHeaderFlag && (headerTitle || headerDesc))
    ? `<div class="mf-form-header">` +
        (headerTitle ? `<h1 class="mf-form-title">${headerTitle}</h1>` : '') +
        (headerDesc  ? `<p class="mf-form-description">${headerDesc}</p>` : '') +
      `</div>`
    : '';

  mountEl.innerHTML =
    `<div id="mf-form-wrapper-${fid}" class="${wrapperClass}${hideHeaderFlag ? ' mf-hide-header' : ''}" data-form-id="${fid}"${moduleIdAttr}>` +
      `<div class="mf-form-inner">` +
        headerHtml +

        `<div id="mf-form-${fid}" class="mf-form" data-multistep-layout-badge="MultiStepInner v20260402-08">` +
          `<div id="mf-progress-${fid}" class="mf-progress-bar" style="display:none;"></div>` +
          `<div id="mf-fields-container-${fid}" class="mf-fields-container"></div>` +

          // Honeypot (anti-spam)
          `<div style="position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden;" aria-hidden="true" tabindex="-1">` +
            `<input type="text" id="mf_hp_${fid}" name="${honeypotName}" value="" autocomplete="off" tabindex="-1"/>` +
          `</div>` +

          `<input type="hidden" id="mf-form-id-${fid}" value="${fid}"/>` +

          `<div class="mf-form-actions">` +
            `<button type="button" id="mf-btn-prev-${fid}" class="mf-btn mf-btn-prev" style="display:none;">` +
              `<i class="fa fa-arrow-left"></i> ${prevText}` +
            `</button>` +
            `<button type="button" id="mf-btn-next-${fid}" class="mf-btn mf-btn-next" style="display:none;">` +
              `${nextText} <i class="fa fa-arrow-right"></i>` +
            `</button>` +
            `<button type="button" id="mf-btn-submit-${fid}" class="mf-btn mf-btn-submit">` +
              `<i class="fa fa-paper-plane"></i> ${btnText}` +
            `</button>` +
          `</div>` +
        `</div>` +  // .mf-form

        `<div id="mf-success-${fid}" class="mf-success-message" style="display:none;">` +
          `<div class="alert alert-success">` +
            `<i class="fa fa-check-circle fa-2x"></i>` +
            `<h3>Thank You!</h3>` +
            `<p id="mf-success-text-${fid}"></p>` +
            `<p class="mf-ref-number"><small>Reference: #<span id="mf-success-ref-${fid}"></span></small></p>` +
          `</div>` +
        `</div>` +

        `<div id="mf-error-${fid}" class="mf-error-message" style="display:none;">` +
          `<div class="alert alert-danger">` +
            `<i class="fa fa-exclamation-triangle"></i> ` +
            `<span id="mf-error-text-${fid}"></span>` +
          `</div>` +
        `</div>` +

        `<div id="mf-loading-${fid}" class="mf-loading" style="display:none;">` +
          `<i class="fa fa-spinner fa-spin fa-2x"></i> Submitting...` +
        `</div>` +

      `</div>` +  // .mf-form-inner
    `</div>`;    // .mf-form-wrapper

  // [SSR hydrate v20260620-B213] Move the preserved server-rendered field nodes into the rebuilt
  // shell's fields-container (no innerHTML re-parse → images/inputs keep their DOM, no reload).
  if (ssrNodes && ssrNodes.length) {
    const newFc = document.getElementById(`mf-fields-container-${fid}`);
    if (newFc) {
      newFc.textContent = '';
      ssrNodes.forEach(n => newFc.appendChild(n));
      newFc.setAttribute('data-mf-ssr', '1');
    }
  }

  // [SSR flicker fix v20260624-B263] Re-stamp the server SSR signal + theme/mode classes onto the
  // rebuilt wrapper so applyFormPresentationSettings' data-mf-ssr guard (≈278) short-circuits: the
  // single-source server <style id=mf-custom-css-{id}> stays, the client RendererThemeVars re-inject
  // is skipped, and no CSS-source swap (= the flicker) occurs. Colours are #mf-form-wrapper-{id}
  // ID-scoped so this is palette-safe; copying the server classes also restores mf-theme-* /
  // mf-custom-html-mode for any class-scoped consumer. Gated on wasSsr → preview / non-SSR hosts
  // (no server data-mf-ssr) are untouched and keep full client theming.
  if (wasSsr) {
    const newWrapper = document.getElementById(`mf-form-wrapper-${fid}`);
    if (newWrapper) {
      newWrapper.setAttribute('data-mf-ssr', '1');
      if (ssrWrapperClass) {
        ssrWrapperClass.split(/\s+/).filter(Boolean).forEach(c => newWrapper.classList.add(c));
      }
    }
  }
}

function normalizeDisplayStyleToken(value: unknown, allowed: string[]): string {
  const token = String(value == null ? '' : value).trim().toLowerCase();
  return allowed.indexOf(token) >= 0 ? token : '';
}

function applyDisplayStyleClasses(wrapper: HTMLElement, settings: any): void {
  const ds = settings?.displayStyle || settings?.DisplayStyle || {};
  const classes = [
    'mf-style-radius-square','mf-style-radius-rounded','mf-style-radius-pill',
    'mf-style-input-square','mf-style-input-rounded','mf-style-input-pill',
    'mf-style-shadow-none','mf-style-shadow-soft','mf-style-shadow-medium','mf-style-shadow-large',
    'mf-style-border-none','mf-style-border-hairline','mf-style-border-prominent',
    'mf-style-pad-compact','mf-style-pad-comfortable','mf-style-pad-spacious',
  ];
  classes.forEach(name => wrapper.classList.remove(name));
  if (!ds || typeof ds !== 'object') return;

  const radius = normalizeDisplayStyleToken(ds.radius ?? ds.Radius, ['square', 'rounded', 'pill']);
  const inputRadius = normalizeDisplayStyleToken(ds.inputRadius ?? ds.InputRadius, ['square', 'rounded', 'pill']);
  const shadow = normalizeDisplayStyleToken(ds.shadow ?? ds.Shadow, ['none', 'soft', 'medium', 'large']);
  const border = normalizeDisplayStyleToken(ds.border ?? ds.Border, ['none', 'hairline', 'prominent']);
  const pad = normalizeDisplayStyleToken(ds.pad ?? ds.Pad, ['compact', 'comfortable', 'spacious']);

  if (radius) wrapper.classList.add('mf-style-radius-' + radius);
  if (inputRadius) wrapper.classList.add('mf-style-input-' + inputRadius);
  if (shadow) wrapper.classList.add('mf-style-shadow-' + shadow);
  if (border) wrapper.classList.add('mf-style-border-' + border);
  if (pad && pad !== 'comfortable') wrapper.classList.add('mf-style-pad-' + pad);
}

function applyFormPresentationSettings(settings: any): void {
  const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
  const hideHeaderFlag = settings?.hideHeader === true || settings?.HideHeader === true;
  if (wrapper) {
    wrapper.classList.toggle('mf-hide-header', !!hideHeaderFlag);
    applyDisplayStyleClasses(wrapper, settings);
  }

  // [SingleSource v20260624-B260] The server now composes the form's ENTIRE CSS into ONE
  // <style id=mf-custom-css-{id}> (ModuleCssComposer: preset + scoped theme vars + authored
  // customCss + custom-shell compat) and marks the wrapper data-mf-ssr="1". The public renderer
  // must do NOTHING to CSS — the SSR block is the single source. Early-return on the data-mf-ssr
  // signal ALONE (NOT node-existence): a default-theme form whose composed CSS is empty has no
  // #mf-custom-css node, but must STILL skip the rebuild (otherwise the mf-theme class churn at
  // 295-300 + applyThemeVarsToElement re-introduce a one-frame flash). The hide-header /
  // display-style class toggles above are already applied. Builder preview (config.isPreview, no
  // data-mf-ssr) and any host that has not yet adopted SSR fall through to full client theming.
  if (wrapper?.getAttribute('data-mf-ssr') === '1') {
    return;
  }

  const themePatch = readThemePatch(settings);
  let themeId = String(settings?.theme || settings?.Theme || themePatch.theme || 'default').trim();
  // [B114] A `theme:"custom"` with NO customCss/customHtml triggers the
  // DoubleCardFix strip-rule (which removes the default card, expecting the
  // theme's own CSS to supply one) but provides NOTHING in return → bare,
  // border-less form. Weak/cheap AI models emit exactly this combo. Treat it
  // as the default theme so the standard card renders.
  const themeCustomCss = String(settings?.customCss || settings?.CustomCss || themePatch.customCss || '').trim();
  const themeCustomHtml = String(settings?.customHtml || settings?.CustomHtml || '').trim();
  if (themeId === 'custom' && !themeCustomCss && !themeCustomHtml) themeId = 'default';
  if (wrapper) {
    Array.from(wrapper.classList)
      .filter(c => c.startsWith('mf-theme-'))
      .forEach(c => wrapper.classList.remove(c));
    if (themeId && themeId !== 'default') wrapper.classList.add('mf-theme-' + themeId);
  }

  const cssOverrides = collectThemeCssOverrides(settings, themePatch);
  const customCss = String(settings?.customCss || settings?.CustomCss || themePatch.customCss || '');
  const customHtml = String(settings?.customHtml || settings?.CustomHtml || '');
  const effectiveCssOverrides = Object.assign(
    {},
    buildPremiumThemeAliasVars(cssOverrides, customCss + '\n' + customHtml),
    cssOverrides
  );
  if (wrapper) applyThemeVarsToElement(wrapper, effectiveCssOverrides);

  const styleId = `mf-custom-css-${config.formId}`;
  document.getElementById(styleId)?.remove();
  const scopedVarsCss = buildScopedThemeVarsCss(config.formId, effectiveCssOverrides);
  const customShellCompatCss = buildCustomShellCompatibilityCss(config.formId, settings, customCss);
  const cssText = [scopedVarsCss, customCss, customShellCompatCss].filter(Boolean).join('\n\n');
  if (cssText) {
    const style = document.createElement('style');
    style.id = styleId;
    style.setAttribute('data-mf-theme-runtime', 'RendererThemeVars v20260609-B103');
    style.textContent = cssText;
    document.head.appendChild(style);
  }
}

function readThemePatch(settings: any): any {
  const raw = settings?.themeJson || settings?.ThemeJson || null;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function collectThemeCssOverrides(settings: any, themePatch?: any): Record<string, string> {
  const out: Record<string, string> = {};
  const merge = (src: any) => {
    if (!src || typeof src !== 'object') return;
    Object.keys(src).forEach(name => {
      if (!/^--[a-zA-Z0-9_-]+$/.test(name)) return;
      const value = src[name];
      if (value == null) return;
      out[name] = String(value);
    });
  };
  merge(themePatch?.cssOverrides || themePatch?.CssOverrides || themePatch?.themeCssOverrides || themePatch?.ThemeCssOverrides);
  merge(settings?.cssOverrides || settings?.CssOverrides || settings?.themeCssOverrides || settings?.ThemeCssOverrides);
  return out;
}

function applyThemeVarsToElement(el: HTMLElement, vars: Record<string, string>): void {
  const prev = String(el.getAttribute('data-mf-theme-var-names') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  prev.forEach(name => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) el.style.removeProperty(name);
  });
  Object.keys(vars).forEach(name => {
    el.style.setProperty(name, vars[name], 'important');
  });
  el.setAttribute('data-mf-theme-var-names', Object.keys(vars).join(','));
}

function cssEscapeValue(value: string): string {
  return String(value).replace(/<\/style/gi, '<\\/style');
}

const KNOWN_PREMIUM_VAR_PREFIXES = ['mfp', 'au', 'bg', 'fr', 'it', 'aur', 'nola', 'hw', 'ey'];

function pickThemeVar(vars: Record<string, string>, names: string[], fallback = ''): string {
  for (const name of names) {
    const value = vars[name];
    if (value != null && String(value).trim() !== '') return String(value);
  }
  return fallback;
}

function putThemeAlias(out: Record<string, string>, source: Record<string, string>, name: string, value: string): void {
  if (!name || !value || source[name] != null || out[name] != null) return;
  out[name] = value;
}

function detectPremiumVarPrefixes(templateText: string): string[] {
  const found: Record<string, true> = {};
  KNOWN_PREMIUM_VAR_PREFIXES.forEach(prefix => { found[prefix] = true; });
  const text = String(templateText || '');
  const re = /--([a-z][a-z0-9]{1,14})-[a-z0-9_-]+/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const prefix = String(match[1] || '').toLowerCase();
    if (!prefix || prefix === 'mf') continue;
    found[prefix] = true;
  }
  return Object.keys(found);
}

function collectAuthoredCssVarDeclarations(templateText: string): Record<string, true> {
  const found: Record<string, true> = {};
  const re = /(--[a-zA-Z0-9_-]+)\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(templateText || '')))) {
    found[match[1]] = true;
  }
  return found;
}

function buildPremiumThemeAliasVars(vars: Record<string, string>, templateText = ''): Record<string, string> {
  const out: Record<string, string> = {};
  const primary = pickThemeVar(vars, ['--mf-primary', '--mf-btn-bg', '--primary', '--mfp-primary']);
  const primaryHover = pickThemeVar(vars, ['--mf-primary-hover', '--mf-btn-hover-bg', '--mf-btn-bg-hover'], primary);
  const primaryLight = pickThemeVar(vars, ['--mf-primary-light', '--mf-accent', '--accent', '--muted'], primary);
  const pageBg = pickThemeVar(vars, ['--mf-page-bg', '--background']);
  const formBg = pickThemeVar(vars, ['--mf-form-bg', '--mf-input-bg', '--card', '--background'], pageBg);
  const foreground = pickThemeVar(vars, ['--mf-text', '--mf-color-text', '--foreground', '--mfp-text']);
  const mutedText = pickThemeVar(vars, ['--mf-color-text-muted', '--mf-help-color', '--mf-label-color', '--muted-foreground'], foreground);
  const titleText = pickThemeVar(vars, ['--mf-title-color', '--mf-section-title', '--mf-text', '--mf-color-text'], foreground);
  const labelText = pickThemeVar(vars, ['--mf-label-color', '--mf-color-text', '--mf-text'], foreground);
  const border = pickThemeVar(vars, ['--mf-input-border-color', '--mf-border', '--mf-section-border', '--border', '--mfp-border']);
  const inputBg = pickThemeVar(vars, ['--mf-input-bg', '--input', '--card'], formBg);
  const inputText = pickThemeVar(vars, ['--mf-input-text', '--mf-text', '--mf-color-text'], foreground);
  const buttonText = pickThemeVar(vars, ['--mf-btn-color', '--mf-btn-text', '--mf-color-text-inverse', '--primary-foreground'], '#ffffff');
  const formRadius = pickThemeVar(vars, ['--mf-form-radius', '--radius']);
  const inputRadius = pickThemeVar(vars, ['--mf-input-radius'], formRadius);
  const formShadow = pickThemeVar(vars, ['--mf-form-shadow', '--shadow']);
  const transition = pickThemeVar(vars, ['--mf-transition-duration'], '200ms');

  if (!primary && !formBg && !foreground && !border) return out;

  const authoredVars = collectAuthoredCssVarDeclarations(templateText);
  if (Object.keys(authoredVars).length) {
    vars = { ...vars };
    Object.keys(authoredVars).forEach(name => {
      if (vars[name] == null) vars[name] = '__mf-authored-template-var__';
    });
  }

  putThemeAlias(out, vars, '--mf-primary', primary);
  putThemeAlias(out, vars, '--mf-primary-hover', primaryHover);
  putThemeAlias(out, vars, '--mf-primary-light', primaryLight);
  putThemeAlias(out, vars, '--mf-form-bg', formBg);
  putThemeAlias(out, vars, '--mf-input-bg', inputBg);
  putThemeAlias(out, vars, '--mf-text', foreground);
  putThemeAlias(out, vars, '--mf-color-text', foreground);
  putThemeAlias(out, vars, '--mf-color-text-muted', mutedText);
  putThemeAlias(out, vars, '--mf-title-color', titleText);
  putThemeAlias(out, vars, '--mf-label-color', labelText);
  putThemeAlias(out, vars, '--mf-input-text', inputText);
  putThemeAlias(out, vars, '--mf-border', border);
  putThemeAlias(out, vars, '--mf-input-border-color', border);
  putThemeAlias(out, vars, '--mf-btn-bg', primary);
  putThemeAlias(out, vars, '--mf-btn-bg-hover', primaryHover);
  putThemeAlias(out, vars, '--mf-btn-hover-bg', primaryHover);
  putThemeAlias(out, vars, '--mf-btn-color', buttonText);
  putThemeAlias(out, vars, '--mf-btn-text', buttonText);
  putThemeAlias(out, vars, '--mf-color-text-inverse', buttonText);

  putThemeAlias(out, vars, '--background', pageBg || formBg);
  putThemeAlias(out, vars, '--foreground', foreground);
  putThemeAlias(out, vars, '--card', formBg || pageBg);
  putThemeAlias(out, vars, '--card-foreground', foreground);
  putThemeAlias(out, vars, '--primary', primary);
  putThemeAlias(out, vars, '--primary-foreground', buttonText);
  putThemeAlias(out, vars, '--secondary', inputBg || formBg);
  putThemeAlias(out, vars, '--secondary-foreground', foreground);
  putThemeAlias(out, vars, '--muted', primaryLight || inputBg || formBg);
  putThemeAlias(out, vars, '--muted-foreground', mutedText);
  putThemeAlias(out, vars, '--accent', primaryLight || primary);
  putThemeAlias(out, vars, '--accent-foreground', foreground);
  putThemeAlias(out, vars, '--border', border);
  putThemeAlias(out, vars, '--input', inputBg || formBg);
  putThemeAlias(out, vars, '--ring', primary);
  putThemeAlias(out, vars, '--radius', formRadius);

  putThemeAlias(out, vars, '--mfp-primary', primary);
  putThemeAlias(out, vars, '--mfp-primary-dark', primaryHover);
  putThemeAlias(out, vars, '--mfp-accent', primaryLight || primary);
  putThemeAlias(out, vars, '--mfp-bg', pageBg || formBg);
  putThemeAlias(out, vars, '--mfp-card-bg', formBg || pageBg);
  putThemeAlias(out, vars, '--mfp-text', foreground);
  putThemeAlias(out, vars, '--mfp-text-muted', mutedText);
  putThemeAlias(out, vars, '--mfp-border', border);
  putThemeAlias(out, vars, '--mfp-border-focus', primary);
  putThemeAlias(out, vars, '--mfp-section', mutedText);
  putThemeAlias(out, vars, '--mfp-radius', formRadius);
  putThemeAlias(out, vars, '--mfp-input-radius', inputRadius);
  putThemeAlias(out, vars, '--mfp-shadow', formShadow);

  putThemeAlias(out, vars, '--au-primary', primary);
  putThemeAlias(out, vars, '--au-primary-d', primaryHover);
  putThemeAlias(out, vars, '--au-soft', primaryLight || inputBg || formBg);
  putThemeAlias(out, vars, '--au-ink', foreground);
  putThemeAlias(out, vars, '--au-sub', mutedText);
  putThemeAlias(out, vars, '--au-border', border);
  putThemeAlias(out, vars, '--au-surface', formBg || pageBg);

  putThemeAlias(out, vars, '--ink', foreground);
  putThemeAlias(out, vars, '--paper', formBg || pageBg);
  putThemeAlias(out, vars, '--surface', formBg || pageBg);
  putThemeAlias(out, vars, '--surface-2', inputBg || formBg);
  putThemeAlias(out, vars, '--line', border);
  putThemeAlias(out, vars, '--shadow', formShadow);
  putThemeAlias(out, vars, '--transition', transition);

  detectPremiumVarPrefixes(templateText).forEach(prefix => {
    const base = `--${prefix}-`;
    putThemeAlias(out, vars, base + 'primary', primary);
    putThemeAlias(out, vars, base + 'primary-dark', primaryHover);
    putThemeAlias(out, vars, base + 'primary-hover', primaryHover);
    putThemeAlias(out, vars, base + 'accent', primaryLight || primary);
    putThemeAlias(out, vars, base + 'bg', pageBg || formBg);
    putThemeAlias(out, vars, base + 'background', pageBg || formBg);
    putThemeAlias(out, vars, base + 'surface', formBg || pageBg);
    putThemeAlias(out, vars, base + 'card', formBg || pageBg);
    putThemeAlias(out, vars, base + 'card-bg', formBg || pageBg);
    putThemeAlias(out, vars, base + 'paper', formBg || pageBg);
    putThemeAlias(out, vars, base + 'input-bg', inputBg || formBg);
    putThemeAlias(out, vars, base + 'ink', foreground);
    putThemeAlias(out, vars, base + 'text', foreground);
    putThemeAlias(out, vars, base + 'foreground', foreground);
    putThemeAlias(out, vars, base + 'muted', mutedText);
    putThemeAlias(out, vars, base + 'sub', mutedText);
    putThemeAlias(out, vars, base + 'border', border);
    putThemeAlias(out, vars, base + 'line', border);
    putThemeAlias(out, vars, base + 'radius', formRadius);
    putThemeAlias(out, vars, base + 'input-radius', inputRadius);
    putThemeAlias(out, vars, base + 'shadow', formShadow);
  });

  return out;
}

function buildScopedThemeVarsCss(formId: number, vars: Record<string, string>): string {
  const names = Object.keys(vars);
  if (!names.length) return '';
  const declarations = names
    .map(name => `  ${name}: ${cssEscapeValue(vars[name])} !important;`)
    .join('\n');
  return [
    `#mf-form-wrapper-${formId},`,
    `#mf-form-wrapper-${formId} .mf-form,`,
    `#mf-form-wrapper-${formId} .mf-form-inner,`,
    `#mf-form-wrapper-${formId} .mf-fields-container,`,
    `#mf-form-wrapper-${formId} .mfp,`,
    `#mf-form-wrapper-${formId} .mfp-card,`,
    `#mf-form-wrapper-${formId} .fr-card {`,
    declarations,
    `}`
  ].join('\n');
}

function buildCustomShellCompatibilityCss(formId: number, settings: any, customCss: string): string {
  const customHtml = String(settings?.customHtml || settings?.CustomHtml || '');
  const hasCustomShell = !!customHtml.trim() || /(?:^|[\s.{#>])mfp(?:[\s.#:{>]|-|$)/i.test(String(customCss || ''));
  if (!hasCustomShell) return '';
  const W = `#mf-form-wrapper-${formId}`;
  const authoredVars = collectAuthoredCssVarDeclarations(`${customCss}\n${customHtml}`);
  const themeOverrides = collectThemeCssOverrides(settings, readThemePatch(settings));
  const enableTemplateVarBridge = Object.keys(themeOverrides).length > 0;
  const templateVar = (name: string, value: string) =>
    enableTemplateVarBridge || !authoredVars[name] ? `  ${name}: ${value};` : '';
  const australiaButtonAccent = enableTemplateVarBridge
    ? 'var(--mf-btn-bg, var(--mf-primary, var(--au-primary)))'
    : 'var(--mf-btn-bg, var(--au-primary))';
  // [CardThuaFix 2026-06-23] Discriminator for "card-in-child" premium templates
  // (e.g. pure-grid: .mfp > .mfp-container > .mfp-card). When .mfp already contains an
  // inner card we must NOT also paint .mfp as a card, or the form shows a double card
  // ("card thừa") around the body. :has() is supported on all modern browsers the
  // renderer targets. See Docs/AUDIT_20260623_CARD_THUA_AND_INPUT_HEIGHT.md.
  // [StrayShellBorderFix 2026-07-01] Also skip when the shell nests .ey-card (euro-youth) —
  // keeps the transparent outer .mfp borderless so no stray 1px edge shows above the shell.
  // Mirrors CustomShellCompatibilityCssService.NOINNER (SSR parity).
  const NOINNER = ':not(:has(.mfp-card)):not(:has(.fr-card)):not(:has(.ey-card))';
  return [
    `/* ${CUSTOM_SHELL_BUILDER_COMPAT_BADGE} */`,
    `${W}[data-mf-has-custom-html] .mfp,`,
    `${W}.mf-custom-shell-mode .mfp,`,
    `${W}.mf-custom-html-mode .mfp {`,
    `  box-sizing: border-box !important;`,
    `  width: 100% !important;`,
    `  max-width: var(--mf-form-max-width, 100%) !important;`,
    `  margin-left: auto !important;`,
    `  margin-right: auto !important;`,
    `}`,
    `${W}[data-mf-has-custom-html] > .mf-form-inner,`,
    `${W}.mf-custom-shell-mode > .mf-form-inner,`,
    `${W}.mf-custom-html-mode > .mf-form-inner {`,
    `  width: 100% !important;`,
    `  max-width: none !important;`,
    `  margin-left: 0 !important;`,
    `  margin-right: 0 !important;`,
    `  padding-left: 0 !important;`,
    `  padding-right: 0 !important;`,
    `}`,
    `${W}[data-mf-has-custom-html] .mf-fields-container,`,
    `${W}.mf-custom-shell-mode .mf-fields-container,`,
    `${W}.mf-custom-html-mode .mf-fields-container,`,
    `${W}[data-mf-has-custom-html] .mf-multistep-frame,`,
    `${W}.mf-custom-shell-mode .mf-multistep-frame,`,
    `${W}.mf-custom-html-mode .mf-multistep-frame,`,
    `${W}[data-mf-has-custom-html] .mf-multistep-body,`,
    `${W}.mf-custom-shell-mode .mf-multistep-body,`,
    `${W}.mf-custom-html-mode .mf-multistep-body {`,
    `  width: 100% !important;`,
    `  max-width: none !important;`,
    `  margin-left: 0 !important;`,
    `  margin-right: 0 !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"] {`,
    `  --background: var(--mf-page-bg, var(--mf-form-bg, var(--background, #ffffff)));`,
    `  --foreground: var(--mf-text, var(--mf-color-text, var(--foreground, #0f172a)));`,
    `  --card: var(--mf-form-bg, var(--card, #ffffff));`,
    `  --card-foreground: var(--mf-text, var(--mf-color-text, var(--card-foreground, #0f172a)));`,
    `  --primary: var(--mf-primary, var(--primary, #3b82f6));`,
    `  --primary-foreground: var(--mf-btn-color, var(--mf-btn-text, var(--primary-foreground, #ffffff)));`,
    `  --muted: var(--mf-primary-light, var(--muted, #f1f5f9));`,
    `  --muted-foreground: var(--mf-color-text-muted, var(--mf-label-color, var(--muted-foreground, #64748b)));`,
    `  --accent: var(--mf-primary-light, var(--accent, var(--mf-primary, #3b82f6)));`,
    `  --border: var(--mf-input-border-color, var(--mf-border, var(--border, #e2e8f0)));`,
    `  --input: var(--mf-input-bg, var(--input, #ffffff));`,
    `  --ring: var(--mf-primary, var(--ring, #3b82f6));`,
    `  --mfp-primary: var(--mf-primary, var(--mfp-primary, var(--primary, #3b82f6)));`,
    `  --mfp-primary-dark: var(--mf-primary-hover, var(--mf-btn-hover-bg, var(--mfp-primary-dark, var(--mf-primary, #2563eb))));`,
    `  --mfp-accent: var(--mf-primary-light, var(--mfp-accent, var(--accent, #dbeafe)));`,
    `  --mfp-bg: var(--mf-page-bg, var(--mf-form-bg, var(--mfp-bg, #ffffff)));`,
    `  --mfp-card-bg: var(--mf-form-bg, var(--mfp-card-bg, #ffffff));`,
    `  --mfp-text: var(--mf-text, var(--mf-color-text, var(--mfp-text, #0f172a)));`,
    `  --mfp-text-muted: var(--mf-color-text-muted, var(--mf-label-color, var(--mfp-text-muted, #64748b)));`,
    `  --mfp-border: var(--mf-input-border-color, var(--mf-border, var(--mfp-border, #e2e8f0)));`,
    `  --mfp-border-focus: var(--mf-primary, var(--mfp-border-focus, #3b82f6));`,
    `  --mfp-radius: var(--mf-form-radius, var(--mfp-radius, 8px));`,
    `  --mfp-shadow: var(--mf-form-shadow, var(--mfp-shadow, none));`,
    `  --ink: var(--mf-text, var(--mf-color-text, var(--ink, #0f172a)));`,
    `  --paper: var(--mf-form-bg, var(--paper, #ffffff));`,
    `  --surface: var(--mf-form-bg, var(--surface, #ffffff));`,
    `  --line: var(--mf-input-border-color, var(--mf-border, var(--line, #e2e8f0)));`,
    `  border-color: var(--mf-input-border-color, var(--mf-border, var(--border, #e2e8f0))) !important;`,
    `  color: var(--mf-text, var(--mf-color-text, var(--foreground, #0f172a))) !important;`,
    `  font-family: var(--mf-font-family, inherit) !important;`,
    `}`,
    // [CardThuaFix 2026-06-23] Paint .mfp as a CARD (bg + border) ONLY when it has no
    // inner .mfp-card / .fr-card. Card-in-child templates keep their own single card and
    // .mfp stays transparent+borderless (megaform.css killer rule wins) → no double card.
    `${W} .mfp[class*="mfp-"]${NOINNER} {`,
    `  background: var(--mf-form-bg, var(--card, var(--background, #ffffff))) !important;`,
    `}`,
    `${W}:not(.mf-style-border-none):not(.mf-style-border-hairline):not(.mf-style-border-prominent) .mfp[class*="mfp-"]${NOINNER} {`,
    `  --mfp-shell-border: var(--aur-border, var(--au-border, var(--fr-border, var(--bg-border, var(--it-border, var(--nola-border, var(--hw-border, var(--ey-border, var(--mf-input-border-color, var(--mf-border, var(--mfp-border, var(--border, #e2e8f0))))))))))));`,
    `  border: 1px solid var(--mfp-shell-border) !important;`,
    `}`,
    `${W}:not(.mf-style-radius-square):not(.mf-style-radius-rounded):not(.mf-style-radius-pill) .mfp[class*="mfp-"] {`,
    `  border-radius: var(--mf-form-radius, var(--mfp-radius, var(--aur-radius, 8px))) !important;`,
    `  background-clip: padding-box !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"],`,
    `${W} .mfp[class*="mfp-"] > .mfp-container {`,
    `  overflow: visible !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"] > .mfp-container {`,
    `  box-sizing: border-box !important;`,
    `  border: 1px solid transparent !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"] > .mfp-card,`,
    `${W} .mfp[class*="mfp-"] > .mfp-container > .mfp-card,`,
    `${W} .mfp[class*="mfp-"] > .fr-card,`,
    `${W} .mfp[class*="mfp-"] > .mfp-container > .fr-card {`,
    `  background-clip: padding-box !important;`,
    `}`,
    `${W} .mfp.mfp-australia {`,
    templateVar('--au-primary', 'var(--mf-primary, var(--primary, #0bb39b))'),
    templateVar('--au-primary-d', 'var(--mf-primary-hover, var(--mf-btn-hover-bg, var(--mf-primary, #079a85)))'),
    templateVar('--au-soft', 'var(--mf-primary-light, var(--muted, #e2f7f2))'),
    templateVar('--au-ink', 'var(--mf-text, var(--foreground, #06363a))'),
    templateVar('--au-sub', 'var(--mf-label-color, var(--muted-foreground, #5b8a8c))'),
    templateVar('--au-border', 'var(--mf-input-border-color, var(--mf-border, var(--border, #d2ece8)))'),
    templateVar('--au-surface', 'var(--mf-form-bg, var(--card, #ffffff))'),
    templateVar('--au-band', 'linear-gradient(120deg, var(--mf-form-bg, #eafaf7), var(--mf-primary-light, #f3fbff))'),
    `  background: var(--au-surface) !important;`,
    `  border-color: var(--au-border) !important;`,
    `  border-radius: var(--mf-form-radius, 39px) !important;`,
    `  color: var(--au-ink) !important;`,
    `  font-family: var(--mf-font-family, 'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif) !important;`,
    `}`,
    `${W}.mf-style-radius-square .mfp,`,
    `${W}.mf-style-radius-square .mfp-card,`,
    `${W}.mf-style-radius-square .fr-card {`,
    `  border-radius: 0 !important;`,
    `}`,
    `${W}.mf-style-radius-rounded .mfp,`,
    `${W}.mf-style-radius-rounded .mfp-card,`,
    `${W}.mf-style-radius-rounded .fr-card {`,
    `  border-radius: var(--mf-form-radius, 8px) !important;`,
    `}`,
    `${W}.mf-style-radius-pill .mfp,`,
    `${W}.mf-style-radius-pill .mfp-card,`,
    `${W}.mf-style-radius-pill .fr-card {`,
    `  border-radius: 16px !important;`,
    `}`,
    `${W} .mfp.mfp-australia h1,`,
    `${W} .mfp.mfp-australia h2,`,
    `${W} .mfp.mfp-australia h3,`,
    `${W} .mfp.mfp-australia .au-brand-tx strong,`,
    `${W} .mfp.mfp-australia .au-section-title {`,
    `  color: var(--mf-title-color, var(--au-ink)) !important;`,
    `  font-family: var(--mf-heading-font, var(--mf-font-family, 'Sora', system-ui, sans-serif)) !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"] h1,`,
    `${W} .mfp[class*="mfp-"] h2,`,
    `${W} .mfp[class*="mfp-"] h3,`,
    `${W} .mfp[class*="mfp-"] .mf-form-title,`,
    `${W} .mfp[class*="mfp-"] .mfp-form-title,`,
    `${W} .mfp[class*="mfp-"] [class*="title"] {`,
    `  color: var(--mf-title-color, var(--mf-text, var(--mf-color-text, var(--foreground, #0f172a)))) !important;`,
    `  font-family: var(--mf-heading-font, var(--mf-font-family, inherit)) !important;`,
    `}`,
    `${W} .mfp.mfp-australia .mf-field-label,`,
    `${W} .mfp.mfp-australia label {`,
    `  color: var(--mf-label-color, var(--au-sub)) !important;`,
    `  font-family: var(--mf-font-family, 'Outfit', system-ui, sans-serif) !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"] .mf-field-label,`,
    `${W} .mfp[class*="mfp-"] label {`,
    `  color: var(--mf-label-color, var(--mf-color-text-muted, var(--foreground, #334155))) !important;`,
    `  font-family: var(--mf-font-family, inherit) !important;`,
    `}`,
    `${W} .mfp.mfp-australia .mf-input,`,
    `${W} .mfp.mfp-australia .mf-textarea,`,
    `${W} .mfp.mfp-australia .mf-select,`,
    `${W} .mfp.mfp-australia input:not([type="checkbox"]):not([type="radio"]),`,
    `${W} .mfp.mfp-australia textarea,`,
    `${W} .mfp.mfp-australia select {`,
    `  background-color: var(--mf-input-bg, #ffffff) !important;`,
    `  border-color: var(--mf-input-border-color, var(--au-border)) !important;`,
    `  border-radius: var(--mf-input-radius, 14px) !important;`,
    `  color: var(--mf-text, var(--au-ink)) !important;`,
    `  font-family: var(--mf-font-family, 'Outfit', system-ui, sans-serif) !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"] .mf-input,`,
    `${W} .mfp[class*="mfp-"] .mf-textarea,`,
    `${W} .mfp[class*="mfp-"] .mf-select,`,
    `${W} .mfp[class*="mfp-"] input:not([type="checkbox"]):not([type="radio"]),`,
    `${W} .mfp[class*="mfp-"] textarea,`,
    `${W} .mfp[class*="mfp-"] select,`,
    `${W} .mfp[class*="mfp-"] button.mf-input,`,
    `${W} .mfp[class*="mfp-"] .mf-cal-trigger {`,
    `  background-color: var(--mf-input-bg, var(--input, #ffffff)) !important;`,
    `  border-color: var(--mf-input-border-color, var(--mf-border, var(--border, #e2e8f0))) !important;`,
    `  border-radius: var(--mf-input-radius, var(--mfp-input-radius, 6px)) !important;`,
    `  color: var(--mf-input-text, var(--mf-text, var(--mf-color-text, #0f172a))) !important;`,
    `  font-family: var(--mf-font-family, inherit) !important;`,
    `}`,
    `${W}.mf-style-input-square .mfp input:not([type="checkbox"]):not([type="radio"]),`,
    `${W}.mf-style-input-square .mfp textarea,`,
    `${W}.mf-style-input-square .mfp select {`,
    `  border-radius: 0 !important;`,
    `}`,
    `${W}.mf-style-input-rounded .mfp input:not([type="checkbox"]):not([type="radio"]),`,
    `${W}.mf-style-input-rounded .mfp textarea,`,
    `${W}.mf-style-input-rounded .mfp select,`,
    `${W}.mf-style-input-rounded .mfp button.mf-input,`,
    `${W}.mf-style-input-rounded .mfp .mf-cal-trigger {`,
    `  border-radius: var(--mf-input-radius, 6px) !important;`,
    `}`,
    `${W}.mf-style-input-pill .mfp input:not([type="checkbox"]):not([type="radio"]),`,
    `${W}.mf-style-input-pill .mfp textarea,`,
    `${W}.mf-style-input-pill .mfp select,`,
    `${W}.mf-style-input-pill .mfp button.mf-input,`,
    `${W}.mf-style-input-pill .mfp .mf-cal-trigger {`,
    `  border-radius: 999px !important;`,
    `}`,
    `${W} .mfp.mfp-australia button[type="submit"],`,
    `${W} .mfp.mfp-australia .mf-btn-submit,`,
    `${W} .mfp.mfp-australia .mfp-submit,`,
    `${W} .mfp.mfp-australia .au-next,`,
    `${W} .mfp.mfp-australia .au-prev {`,
    `  background: ${australiaButtonAccent} !important;`,
    `  border-color: ${australiaButtonAccent} !important;`,
    `  border-radius: var(--mf-btn-radius, 14px) !important;`,
    `  color: var(--mf-btn-color, var(--mf-color-text-inverse, #ffffff)) !important;`,
    `  font-family: var(--mf-font-family, 'Outfit', system-ui, sans-serif) !important;`,
    `}`,
    `${W} .mfp[class*="mfp-"] button[type="submit"],`,
    `${W} .mfp[class*="mfp-"] .mf-btn-submit,`,
    `${W} .mfp[class*="mfp-"] .mfp-submit,`,
    `${W} .mfp[class*="mfp-"] .mf-submit,`,
    `${W} .mfp[class*="mfp-"] .mf-btn-primary {`,
    `  background: var(--mf-btn-bg, var(--mf-primary, var(--primary, #3b82f6))) !important;`,
    `  border-color: var(--mf-btn-bg, var(--mf-primary, var(--primary, #3b82f6))) !important;`,
    `  border-radius: var(--mf-btn-radius, var(--mf-input-radius, 8px)) !important;`,
    `  box-shadow: var(--mf-btn-shadow, none) !important;`,
    `  color: var(--mf-btn-color, var(--mf-btn-text, var(--primary-foreground, #ffffff))) !important;`,
    `  font-family: var(--mf-font-family, inherit) !important;`,
    `}`,
  ].join('\n');
}

/** [B79] Inject the .mf-style-* utility rules at runtime so they ship with
 *  the renderer bundle (cache-busted by V stamp) instead of relying on
 *  megaform.css. DNN's CRM serves megaform.css with ?cdv=N which only
 *  changes when the host explicitly bumps cdv — meaning newly-deployed CSS
 *  files can remain unreachable to browsers for days. By injecting at
 *  runtime we sidestep that trap entirely: the rules ship inside
 *  megaform-renderer.js?v=BNN which IS cache-busted on every release.
 *  Idempotent: the style tag carries a fixed id so re-running init() never
 *  duplicates rules.
 */
function installDisplayStyleSheet(): void {
  var id = 'mf-display-style-rules';
  if (document.getElementById(id)) return;
  // [SingleSource v20260624-B260] On a server-rendered public form (data-mf-ssr=1) these static
  // utility rules already ship in megaform.css — skip the runtime duplicate so the public JS does
  // NOTHING to CSS. Builder preview / non-SSR hosts (no data-mf-ssr) still inject them at runtime.
  var _ssrW = document.getElementById('mf-form-wrapper-' + config.formId);
  if (_ssrW && _ssrW.getAttribute('data-mf-ssr') === '1') return;
  // [B79 FIX] Selector specificity matters. The existing rule
  //   .mf-form-wrapper[class*="mf-theme-"]:not(.mf-theme-default) .mf-form
  //   { border-radius: 0 !important; box-shadow: none !important; ... }
  // wins over a plain .mf-form-wrapper.mf-style-radius-rounded .mf-form rule
  // when both use !important (theirs has 4 specificity points to my 3).
  // To override it, I match the same 4-component chain by adding the
  // attribute matcher [class*="mf-form-wrapper"] (always true) which bumps
  // my rule's specificity to 0,0,4,1 — beating theirs at 0,0,4,1 too via
  // source-order (we append later via document.head.appendChild).
  // Plus, I include the > .mf-form-inner > .mf-form descendant chain
  // explicitly so the chained-children-of-wrapper rule loses on equality.
  var W = '.mf-form-wrapper[class*="mf-form-wrapper"]';
  // [B82-D] Wstd = standard (non-customHtml) wrapper. Rules targeting
  // .mf-form ONLY apply when the wrapper does NOT have customHtml mode —
  // otherwise the outer .mf-form should stay transparent (killer rule wins)
  // and the inner .mfp shell receives the display-style chrome instead.
  var Wstd = W + ':not([data-mf-has-custom-html])';
  // Wch = customHtml wrapper. Rules apply to the inner shell (.mfp, .mfp-card,
  // .fr-card) so the user's display-style picks paint the inner card without
  // creating a double-card outer chrome.
  var Wch = W + '[data-mf-has-custom-html]';
  var F = '.mf-form-inner > .mf-form';
  function rad(suffix: string, value: string): string {
    return Wstd + '.mf-style-radius-' + suffix + ',' +
           Wstd + '.mf-style-radius-' + suffix + ' > .mf-form,' +
           Wstd + '.mf-style-radius-' + suffix + ' > ' + F + ',' +
           Wch + '.mf-style-radius-' + suffix + ' .mfp,' +
           Wch + '.mf-style-radius-' + suffix + ' .mfp-card,' +
           Wch + '.mf-style-radius-' + suffix + ' .fr-card' +
           '{border-radius:' + value + ' !important}';
  }
  function shadow(suffix: string, value: string): string {
    return Wstd + '.mf-style-shadow-' + suffix + ' > .mf-form,' +
           Wstd + '.mf-style-shadow-' + suffix + ' > ' + F + ',' +
           Wch + '.mf-style-shadow-' + suffix + ' .mfp,' +
           Wch + '.mf-style-shadow-' + suffix + ' .mfp-card,' +
           Wch + '.mf-style-shadow-' + suffix + ' .fr-card' +
           '{box-shadow:' + value + ' !important}';
  }
  function border(suffix: string, value: string): string {
    return Wstd + '.mf-style-border-' + suffix + ' > .mf-form,' +
           Wstd + '.mf-style-border-' + suffix + ' > ' + F + ',' +
           Wch + '.mf-style-border-' + suffix + ' .mfp,' +
           Wch + '.mf-style-border-' + suffix + ' .mfp-card,' +
           Wch + '.mf-style-border-' + suffix + ' .fr-card' +
           '{border:' + value + ' !important}';
  }
  function inputRad(suffix: string, value: string): string {
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
    // Pill inputs exclude checkbox/radio so those stay square
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
    // Submit / primary buttons consume --mf-btn-radius so right-rail
    // Button-Shape slider paints on runtime.
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
    // [B82] When the form is in customHtml mode the outer .mf-form is
    // stripped to transparent by megaform.css's killer rule. Apply the
    // display-style chrome to the inner .mfp-card instead so the user's
    // explicit display-style picks DO paint without creating a double-card.
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
    // [B82] Submit button bg + color bindings — consume --mf-primary and
    // --mf-color-text-inverse so when user picks a Theme preset and SAVES,
    // the runtime applies the colors too (not just inside the builder
    // iframe via B71 element-overrides). Targets BOTH .mf-submit /
    // .mfp-submit AND .fr-btn-submit (form-receiver custom HTML class)
    // because customHtml templates commonly hardcode this class.
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
  var tag = document.createElement('style');
  tag.id = id;
  tag.setAttribute('data-mf-injected', 'B79');
  tag.textContent = css;
  document.head.appendChild(tag);
}

// ═══════════════════════════════════════════════════════════
//  POPUP DISPLAY-MODE RUNTIME  [ported 2026-06-17]
//  The ACTIVE renderer (this file) never carried the popup runtime — only the
//  dead src/renderer/megaform-renderer.ts did — so Display Mode = Popup rendered
//  an inline form. Ported here and wired into init(). Reads the module view
//  config (displayMode + popup) the host boot passes as config.moduleViewConfigJson.
//  For displayMode !== 'popup' it is a no-op (zero impact on inline/fixed forms).
// ═══════════════════════════════════════════════════════════
const POPUP_RUNTIME_BADGE = 'PopupRuntime v20260617-09';

function parseModuleViewConfig(): any {
  var raw: any = (config as any).moduleViewConfigJson || (config as any).ModuleViewConfigJson || null;
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_error) {
    return {};
  }
}

function normalizePopupConfig(rawCfg?: any): any {
  var cfg = rawCfg || parseModuleViewConfig() || {};
  var popup = cfg.popup || cfg.Popup || {};
  var triggerType = String(popup.triggerType || popup.TriggerType || 'time_delay').toLowerCase();
  if (triggerType !== 'click_trigger' && triggerType !== 'scroll_depth') triggerType = 'time_delay';
  var clickSelector = String(popup.clickSelector || popup.ClickSelector || '').trim();
  if (triggerType === 'click_trigger' && !clickSelector) clickSelector = '.open-megaform-popup';
  return {
    displayMode: String(cfg.displayMode || cfg.DisplayMode || 'fixed').toLowerCase() === 'popup' ? 'popup' : 'fixed',
    triggerType: triggerType,
    delaySeconds: Math.max(0, parseInt(String(popup.delaySeconds || popup.DelaySeconds || '5'), 10) || 5),
    scrollPercent: Math.max(5, Math.min(95, parseInt(String(popup.scrollPercent || popup.ScrollPercent || '50'), 10) || 50)),
    clickSelector: clickSelector,
    borderMode: 'transparent_popup',
    showOncePerSession: popup.showOncePerSession == null && popup.ShowOncePerSession == null ? true : !!(popup.showOncePerSession != null ? popup.showOncePerSession : popup.ShowOncePerSession),
    closeOnOverlay: popup.closeOnOverlay == null && popup.CloseOnOverlay == null ? true : !!(popup.closeOnOverlay != null ? popup.closeOnOverlay : popup.CloseOnOverlay),
    startAt: String(popup.startAt || popup.StartAt || '').trim(),
    endAt: String(popup.endAt || popup.EndAt || '').trim(),
  };
}

function getPopupConfig(): any {
  return normalizePopupConfig();
}

function ensurePopupRuntimeStyle(): void {
  if (document.getElementById('mf-popup-runtime-style')) return;
  var style = document.createElement('style');
  style.id = 'mf-popup-runtime-style';
  style.textContent =
    'body.mf-popup-open{overflow:hidden!important;touch-action:none!important;}' +
    '.mf-popup-overlay{position:fixed;inset:0;display:none;padding:20px;background:transparent;backdrop-filter:none;z-index:2147483200;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;text-align:center;}' +
    '.mf-popup-overlay.is-open{display:block;}' +
    '.mf-popup-dialog{position:relative;display:inline-block;vertical-align:top;width:fit-content;max-width:min(96vw,960px);max-height:none;overflow:visible;border-radius:0;background:transparent;border:0;box-shadow:none;padding:0;margin:0 auto;text-align:left;}' +
    '.mf-popup-dialog.is-transparent-popup{background:transparent;border:0;box-shadow:none;padding:0;}' +
    '.mf-popup-close{position:absolute;top:12px;right:12px;z-index:2;width:40px;height:40px;border-radius:999px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.96);color:#0f172a;font:700 18px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.18);}' +
    '.mf-popup-body{width:100%;overflow:visible;background:transparent;border:0;box-shadow:none;padding:0;}' +
    '.mf-popup-dialog .mf-form-wrapper,.mf-popup-dialog .mf-form-inner{background:transparent;}' +
    '@media (max-width: 768px){.mf-popup-overlay{padding:12px;text-align:left;}.mf-popup-dialog{display:block;width:100%;max-width:100%;}}';
  document.head.appendChild(style);
}

function parsePopupWindowValue(raw: string): number | null {
  var value = String(raw || '').trim();
  if (!value) return null;
  var dt = new Date(value);
  var ts = dt.getTime();
  return isFinite(ts) ? ts : null;
}

function isPopupWithinSchedule(popup: any): boolean {
  var now = Date.now();
  var startAt = parsePopupWindowValue(String(popup.startAt || ''));
  var endAt = parsePopupWindowValue(String(popup.endAt || ''));
  if (startAt != null && now < startAt) return false;
  if (endAt != null && now > endAt) return false;
  return true;
}

function shouldRememberPopupDismissal(popup: any): boolean {
  if (!popup || !popup.showOncePerSession) return false;
  return popup.triggerType !== 'click_trigger';
}

function canAutoOpenPopup(popup: any, dismissed: boolean): boolean {
  if (!popup) return false;
  if (!isPopupWithinSchedule(popup)) return false;
  if (popup.triggerType === 'click_trigger') return false;
  if (dismissed) return false;
  return true;
}

function canManualOpenPopup(popup: any): boolean {
  if (!popup) return false;
  if (popup.triggerType !== 'click_trigger') return false;
  return isPopupWithinSchedule(popup);
}

function maybeActivatePopupMode(wrapper: HTMLElement | null): void {
  if (!wrapper) return;
  var popup = getPopupConfig();
  if (popup.displayMode !== 'popup') return;
  if (!isPopupWithinSchedule(popup)) {
    wrapper.style.display = 'none';
    return;
  }
  ensurePopupRuntimeStyle();
  var moduleId = Number((wrapper.getAttribute('data-module-id') || (config as any).moduleId || 0));
  var sessionKey = 'mf:popup:' + String(config.formId || 0) + ':' + String(moduleId || 0) + ':dismissed';
  var dismissed = false;
  try {
    dismissed = popup.showOncePerSession && sessionStorage.getItem(sessionKey) === '1';
    if (dismissed && popup.triggerType !== 'click_trigger') {
      wrapper.style.display = 'none';
      return;
    }
  } catch (_error) { }

  var overlay = document.createElement('div');
  overlay.className = 'mf-popup-overlay';
  overlay.setAttribute('data-badge', POPUP_RUNTIME_BADGE);
  var dialog = document.createElement('div');
  dialog.className = 'mf-popup-dialog is-transparent-popup';
  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mf-popup-close';
  closeBtn.setAttribute('aria-label', 'Close popup form');
  closeBtn.innerHTML = '&times;';
  var body = document.createElement('div');
  body.className = 'mf-popup-body';
  dialog.appendChild(closeBtn);
  dialog.appendChild(body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  body.appendChild(wrapper);
  wrapper.style.display = 'block';

  function markDismissed(): void {
    if (!shouldRememberPopupDismissal(popup)) return;
    try {
      sessionStorage.setItem(sessionKey, '1');
      dismissed = true;
    } catch (_error) { }
  }

  function closePopup(markSession: boolean): void {
    overlay.classList.remove('is-open');
    document.body.classList.remove('mf-popup-open');
    if (markSession) markDismissed();
  }

  function openPopup(forceOpen?: boolean): void {
    if (forceOpen) {
      if (!canManualOpenPopup(popup)) return;
    } else if (!canAutoOpenPopup(popup, dismissed)) {
      return;
    }
    dismissed = false;
    overlay.classList.add('is-open');
    document.body.classList.add('mf-popup-open');
  }

  closeBtn.addEventListener('click', function () { closePopup(true); });
  if (popup.closeOnOverlay) {
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePopup(true);
    });
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) closePopup(true);
  });

  // [SampleTrigger 2026-06-17] The Display & Popup "Sample HTML triggers" use
  // [data-mf-open-form="<formId>"] (button + sticky tabs). Let any such element
  // open THIS form's popup on click, regardless of the configured auto-trigger —
  // the snippets promise "paste to open this form". Explicit user action, so it
  // bypasses the auto-open/dismissed gates (still honours the schedule window).
  document.addEventListener('click', function (event) {
    var origin = event.target as HTMLElement | null;
    if (!origin) return;
    var trigger = origin.closest('[data-mf-open-form]') as HTMLElement | null;
    if (!trigger) return;
    if (String(trigger.getAttribute('data-mf-open-form')) !== String(config.formId)) return;
    event.preventDefault();
    if (!isPopupWithinSchedule(popup)) return;
    dismissed = false;
    overlay.classList.add('is-open');
    document.body.classList.add('mf-popup-open');
  });

  if (popup.triggerType === 'scroll_depth') {
    var fired = false;
    var onScroll = function (): void {
      if (fired) return;
      var root = document.documentElement || document.body;
      var maxScroll = Math.max(1, (root.scrollHeight || 0) - window.innerHeight);
      var current = Math.max(window.scrollY || window.pageYOffset || 0, document.documentElement ? document.documentElement.scrollTop : 0);
      var percent = current / maxScroll * 100;
      if (percent >= popup.scrollPercent) {
        fired = true;
        window.removeEventListener('scroll', onScroll);
        openPopup(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true } as any);
    onScroll();
  } else if (popup.triggerType === 'click_trigger') {
    var selector = popup.clickSelector;
    if (selector) {
      document.addEventListener('click', function (event) {
        var target = event.target as HTMLElement | null;
        if (!target) return;
        var match = target.closest(selector) as HTMLElement | null;
        if (!match) return;
        event.preventDefault();
        openPopup(true);
      });
    }
  } else {
    window.setTimeout(function () { openPopup(false); }, popup.delaySeconds * 1000);
  }
}

/** Initialize the renderer */
// [WidgetAutoload 2026-06-28] Returns true when it injected missing widget
// plugin <script>s and deferred the render (init will be re-invoked once they
// register). Returns false (render proceeds now) when nothing is missing or a
// retry has already been attempted. Capped at ~5s so a never-loading plugin
// still falls through to the existing text-input fallback rather than hanging.
function maybeDeferForWidgetPlugins(cfg: RendererConfig): boolean {
  try {
    if ((cfg as any).__mfWidgetAutoloadTried) return false;
    const types = collectUnloadedWidgetTypes((cfg.schema && (cfg.schema as any).fields) || []);
    if (!types.length) return false;
    (cfg as any).__mfWidgetAutoloadTried = true;
    injectWidgetPlugins(types);
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      const ready = types.every((t) => isWidgetTypeRegistered(t));
      if (ready || tries > 40) {
        window.clearInterval(timer);
        try { init(cfg); } catch (e) { try { console.warn('MegaForm: widget autoload retry failed', e); } catch (_e) { /* noop */ } }
      }
    }, 120);
    return true;
  } catch (_err) {
    return false;
  }
}

function hasServerPagedSsr(container?: HTMLElement | null): boolean {
  const fc = container || document.getElementById(`mf-fields-container-${config.formId}`);
  if (!fc || fc.getAttribute('data-mf-ssr-multistep') !== '1') return false;
  return Array.from(fc.children).some(child => child.classList && child.classList.contains('mf-page'));
}

function hasServerCustomSsr(hasCustom: boolean, container?: HTMLElement | null): boolean {
  if (!hasCustom) return false;
  const fc = container || document.getElementById(`mf-fields-container-${config.formId}`);
  const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
  if (!fc) return false;
  const marked = fc.getAttribute('data-mf-ssr') === '1' || wrapper?.getAttribute('data-mf-ssr') === '1';
  if (!marked) return false;
  return !!fc.querySelector('.mfp,.mfp-native-generated,.mf-field-group,[data-mf-native-page],.au-page,.bg-page,.ey-page,.fi-page');
}

function init(cfg: RendererConfig): void {
  config = cfg;
  try {
    if (config.schema) {
      config.schema = repairRendererSchemaStrings(config.schema) as any;
      (window as any).__MF_RENDERER_SCRIPT_SCHEMA_REPAIR__ = CUSTOM_SCRIPT_SCHEMA_REPAIR_BADGE;
    }
  } catch (_e) { /* best effort */ }
  // [B79] Install display-style rules BEFORE schema render so the form
  // paints correctly on first frame (no flash of unstyled card).
  try { installDisplayStyleSheet(); } catch (_e) { /* defensive */ }
  // Support legacy apiBase alias
  if (!config.apiBaseUrl && (config as any).apiBase) config.apiBaseUrl = (config as any).apiBase;
  // [Submit 400 fix] Defensive: guarantee apiBaseUrl is set AND ends with '/' so the raw
  // concatenations `config.apiBaseUrl + 'Submit/Post'` (~2994) and `+ 'Draft/Save'` (~3068)
  // never collapse to '/api/MegaFormSubmit/Post'. platform-host getApiBase() returns the base
  // WITHOUT a trailing slash by design; this single chokepoint runs before every consumer.
  config.apiBaseUrl = String(config.apiBaseUrl || '/api/MegaForm/').replace(/\/?$/, '/');
  normalizeSchema(config);
  if (!config.schema?.fields) return;

  var settings = (config.schema!.settings || {}) as any;
  var hasCustom = !!(settings.customHtml && String(settings.customHtml).trim());
  const ssrPreWrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
  const ssrPreFc = document.getElementById(`mf-fields-container-${config.formId}`);
  const isSsr = !hasCustom && !!(ssrPreFc && ssrPreFc.querySelector('.mf-field-group') &&
    (ssrPreFc.getAttribute('data-mf-ssr') === '1' || ssrPreWrapper?.getAttribute('data-mf-ssr') === '1'));
  const isCustomSsr = hasServerCustomSsr(hasCustom, ssrPreFc);

  // [B359] "1 module = 1 form": on a Blazor enhanced-nav from Form A → Form B in the same tab,
  // Blazor can insert Form B's SSR wrapper BEFORE Form A's wrapper is removed. The renderer would
  // then hydrate BOTH and they visibly overlap. A MegaForm module hosts exactly one form, so drop
  // any OTHER .mf-form-wrapper left inside THIS form's module container before rendering — only the
  // current form (config.formId) survives. Scoped to the module host so a page with two genuine
  // MegaForm modules keeps both.
  try {
    const moduleHost = ssrPreWrapper?.closest('.megaform-module');
    if (moduleHost) {
      moduleHost.querySelectorAll<HTMLElement>('.mf-form-wrapper').forEach((w) => {
        if (w.id && w.id !== `mf-form-wrapper-${config.formId}`) w.remove();
      });
    }
  } catch (_e) { /* stale-wrapper cleanup is best-effort — never block render */ }

  // Oqtane Interactive can run this boot twice during prerender -> circuit handoff.
  // Once the SSR DOM is hydrated, the second pass must not rebuild or double-bind it.
  if ((isSsr || isCustomSsr) && ssrPreFc?.getAttribute('data-mf-hydrated') === '1') {
    console.log('MegaForm: SSR already hydrated (skip duplicate init)', config.formId);
    return;
  }

  // [WidgetAutoload 2026-06-28] If this form uses a widget whose plugin <script>
  // is NOT on the page (e.g. ?formid= admin override, inline render, embeds — the
  // server manifest was built for a DIFFERENT form), the widget would fall back to
  // a plain text input. Inject the missing plugin(s) and DEFER the whole render
  // until they register, then re-run init ONCE. We return BEFORE buildSkeleton /
  // any binding here, so the retry renders + binds exactly once (no double-bind).
  if (maybeDeferForWidgetPlugins(cfg)) return;

  formData = (config.prefilledData as Record<string, unknown>) || {};
  syncPlatformTrialFlags();

  // [R3 v20260531-i18n-01] Locale chip strip — when the schema declares
  // settings.supportedLanguages (string[] of locale codes), render a small
  // strip of clickable chips above the form. Click reloads the page with
  // ?locale=<code> so the server-side Schema endpoint applies overrides
  // from MF_FieldTranslations.
  try {
    const langs: string[] = Array.isArray((settings as any).supportedLanguages) ? (settings as any).supportedLanguages : [];
    if (langs.length >= 1) {
      const url = new URL(window.location.href);
      const cur = url.searchParams.get('locale') || (settings as any).defaultLanguage || langs[0];
      const formId = config.formId;
      const stripId = 'mf-locale-strip-' + formId;
      if (!document.getElementById(stripId)) {
        const strip = document.createElement('div');
        strip.id = stripId;
        strip.className = 'mf-locale-strip';
        strip.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;font-size:12px;color:#475569;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
        strip.innerHTML = '<span style="font-weight:600">🌐 Language:</span>' + langs.map(l => {
          const active = l === cur;
          return `<button type="button" data-mf-locale="${l}" style="padding:3px 10px;border-radius:999px;border:1px solid ${active ? '#6366f1' : '#cbd5e1'};background:${active ? '#6366f1' : '#fff'};color:${active ? '#fff' : '#0f172a'};font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">${l}</button>`;
        }).join('');
        strip.addEventListener('click', (ev) => {
          const t = ev.target as HTMLElement;
          if (!t.matches || !t.matches('[data-mf-locale]')) return;
          const loc = t.getAttribute('data-mf-locale') || '';
          url.searchParams.set('locale', loc);
          window.location.href = url.toString();
        });
        const formRoot = document.getElementById('mf-form-' + formId) || document.querySelector('.mf-form-container, form, [data-mf-form-root]');
        if (formRoot && formRoot.parentNode) formRoot.parentNode.insertBefore(strip, formRoot);
      }
    }
  } catch (_localeErr) { /* swallow — never block render */ }

  // Auto-prefill from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  flattenFields(config.schema.fields).forEach(f => {
    if (f.type === 'Row') return;
    if (urlParams.has(f.key) && !formData[f.key]) formData[f.key] = urlParams.get(f.key)!;
    if (f.prefillParam && urlParams.has(f.prefillParam) && !formData[f.key]) formData[f.key] = urlParams.get(f.prefillParam)!;
  });

  // Build DOM skeleton (no-op if platform pre-built it, e.g. DNN)
  const mountSelector = config.container;
  const mountEl = mountSelector
    ? (typeof mountSelector === 'string' ? document.querySelector<HTMLElement>(mountSelector) : mountSelector)
    : null;
  // [SSR hydrate v20260620-B213] Detect server-rendered field markup BEFORE buildSkeleton (which
  // moves the nodes into the rebuilt shell). When present (and not custom-HTML), HYDRATE the
  // existing DOM instead of rebuilding it from schema → single load, no image re-fetch.
  const hasFullSsrShell = (isSsr || isCustomSsr) && !!document.getElementById(`mf-btn-submit-${config.formId}`);
  if (mountEl && !hasFullSsrShell) buildSkeleton(mountEl, config.formId, config.submitButtonText, hasCustom);
  applyFormPresentationSettings(settings);

  if (hasCustom) {
    var wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
    if (wrapper) {
      wrapper.classList.add('mf-custom-html-mode');
      if ((settings as any).premiumNativePageBreak === true || (settings as any).PremiumNativePageBreak === true) {
        wrapper.classList.add('mf-premium-native-mode');
      } else {
        wrapper.classList.remove('mf-premium-native-mode');
      }
      const header = wrapper.querySelector<HTMLElement>('.mf-form-header');
      const actions = wrapper.querySelector<HTMLElement>('.mf-form-actions');
      const footer = wrapper.querySelector<HTMLElement>('.mf-embed-footer');
      if (header) header.style.display = 'none';
      if (actions) actions.style.display = 'none';
      if (footer) footer.style.display = 'none';
    }
  }

  // [BindOnlyLog v20260707] The old unconditional "MegaForm: rendering N fields" log here
  // printed even when the branch below takes an SSR HYDRATE (bind-only) path — reading a
  // console trace it looked like the client REBUILT the form right before "HYDRATED …
  // (bind-only)", i.e. a phantom double render. It now logs only on the real client-build
  // path (no SSR markup), inside the else-branch below.

  // [B355 first-paint anti-jank] The wrapper ships with .mf-booting baked into the SSR
  // markup (Index.razor / RenderPage) because premium shells run their per-step entrance
  // (auFade/amFade) at SERVER first paint — before the schema even returns. .mf-booting
  // pushes those one-shot entrances to their final frame (see megaform.css). We keep the
  // class ON (re-adding is a no-op for SSR forms; needed for client-rendered ones) and
  // lift it one frame after hydrate. Before lifting we PIN the on-screen step's entrance
  // OFF permanently so restoring animation-delay cannot replay it late (the actual bug).
  const bootWrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
  if (bootWrapper) {
    bootWrapper.classList.add('mf-booting');
    let lifted = false;
    const liftBootCloak = () => {
      if (lifted) return;
      lifted = true;
      try {
        const scope = document.getElementById(`mf-fields-container-${config.formId}`) || bootWrapper;
        scope.querySelectorAll<HTMLElement>('*').forEach(el => {
          const cs = getComputedStyle(el);
          // Pin only what is VISIBLE and NON-LOOPING now: hidden steps keep their entrance
          // for real navigation; spinners (infinite) keep spinning.
          if (cs.animationName && cs.animationName !== 'none' &&
              cs.animationIterationCount !== 'infinite' && el.offsetParent !== null) {
            el.style.animation = 'none';
          }
        });
      } catch (_e) { /* pin is best-effort — never block the lift */ }
      bootWrapper.classList.remove('mf-booting');
    };
    requestAnimationFrame(() => requestAnimationFrame(liftBootCloak));
    setTimeout(liftBootCloak, 1200); // safety net if a frame is dropped/backgrounded
  }

  calculatePages();
  syncMultiStepShellMode(hasCustom && totalPages > 1);
  if (isSsr) { hydrateSsrFields(); }
  else if (isCustomSsr) { hydrateCustomSsrFields(settings); }
  else {
    console.log('MegaForm: rendering', config.schema.fields.length, 'fields (client build — no SSR markup)');
    renderFields();
  }
  buildStepIndicator();
  updateNavigation();
  bindNavigation();
  bindSubmit();
  applyPaymentSubmitMode();
  startPaymentWatcher();
  bindInteractiveElements(config);
  bindSaveDraft();
  bindFieldErrorClear(config.formId);
  bindPremiumSummary();
  applyFixedHeaderGuard(config.formId);

  // Phase 1: hydrate SQL-sourced options (badge: FieldOptionsRenderer v20260430-01)
  void hydrateSqlOptions();

  // Display Only mode: hide submit/nav/save-draft, lock fields readonly
  if (settings.displayOnly || settings.DisplayOnly) {
    const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
    const actions = wrapper?.querySelector<HTMLElement>('.mf-form-actions');
    if (actions) actions.style.display = 'none';
    const saveBtn = document.getElementById(`mf-btn-save-${config.formId}`);
    if (saveBtn) saveBtn.style.display = 'none';
    const fc = document.getElementById(`mf-fields-container-${config.formId}`);
    if (fc) {
      const shouldKeepInteractive = (el: Element): boolean =>
        !!el.closest('[data-mf-displayonly-keep="1"]');
      fc.querySelectorAll<HTMLElement>('input, textarea, select, button').forEach(inp => {
        if (shouldKeepInteractive(inp)) return;
        inp.setAttribute('readonly', 'readonly');
        inp.setAttribute('disabled', 'disabled');
        inp.style.pointerEvents = 'none';
        inp.style.opacity = '0.7';
      });
      fc.querySelectorAll<HTMLElement>('button[type="submit"]').forEach(b => {
        if (shouldKeepInteractive(b)) return;
        b.style.display = 'none';
      });
    }
  }

  // Bind widget interactivity
  const W = (window as any).MegaFormWidgets;
  if (W?.bindWidgets) W.bindWidgets(config.formId);

  // [PopupRuntime 2026-06-17] Activate Popup display mode when the module is
  // configured for it (config.moduleViewConfigJson.displayMode === 'popup').
  // No-op for inline/fixed forms. Runs last so the fully-built form wrapper is
  // moved into the popup overlay. Never blocks render.
  try {
    var popupWrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
    maybeActivatePopupMode(popupWrapper);
  } catch (_popupErr) { /* defensive — popup must never break the form */ }

  // [InlineEdit 2026-06-29] Host + Oqtane edit-mode ONLY: make shell strings (hero/brand/
  // step labels/headings) + field labels click-to-edit in place, with a Save pill that
  // round-trips the full form. Strictly gated (isInlineEditContext) → no-op for public
  // visitors, and wrapped so it can never break the render.
  try {
    initInlineEdit({
      formId: config.formId,
      apiBaseUrl: config.apiBaseUrl,
      schema: config.schema,
      // [InlineEdit→Builder 20260630] Activates ONLY in the builder DESIGN preview (config.isPreview);
      // in preview, save() posts a patch to the parent builder instead of writing the DB. Public
      // ?view=form&edit=true no longer triggers inline-edit (retired — was unstable).
      isPreview: !!config.isPreview,
      container: (document.getElementById(`mf-form-wrapper-${config.formId}`)
        || document.getElementById(`mf-form-${config.formId}`)) as HTMLElement | null,
    });
  } catch (_ieErr) { /* defensive — inline edit must never break the form */ }

  // [PreviewStepNav 2026-06-29] Builder DESIGN/preview only: make the wizard step pills clickable so
  // the host can jump to any step (incl. the review/summary) without filling fields or pressing Next.
  // Runs last so all step markup (standard + premium-native shell) is in the DOM. Public form: no-op.
  try { enablePreviewStepNav(); } catch (_psnErr) { /* defensive — never break the form */ }
  try { enableTabbedStepNav(); } catch (_tabNavErr) { /* defensive — never break the form */ }
}

// ═══════════════════════════════════════════════════════════
//  PAGE CALCULATION
// ═══════════════════════════════════════════════════════════
function calculatePages(): void {
  fieldPages = [[]];
  const fields = config.schema!.fields;

  // Normalize properties
  fields.forEach(f => {
    if (!f.properties && (f as any).Properties) f.properties = (f as any).Properties;
    if (f.properties) {
      if ((f.properties as any).PageBreak !== undefined && (f.properties as any).pageBreak === undefined) {
        (f.properties as any).pageBreak = (f.properties as any).PageBreak;
      }
    }
  });

  let hasPageBreak = fields.some(f => f.type === 'Section' && f.properties?.pageBreak);
  const hasPageIndex = fields.some(f => Number((f as any).pageIndex ?? (f as any).PageIndex ?? 0) > 0);

  if (!hasPageBreak && hasPageIndex) {
    const indexedPages: FormField[][] = [];
    fields.forEach(f => {
      let pageIndex = Number((f as any).pageIndex ?? (f as any).PageIndex ?? 0);
      if (!Number.isFinite(pageIndex) || pageIndex < 0) pageIndex = 0;
      while (indexedPages.length <= pageIndex) indexedPages.push([]);
      indexedPages[pageIndex].push(f);
    });
    fieldPages = indexedPages.filter(page => page && page.length > 0);
    if (!fieldPages.length) fieldPages = [fields.slice()];
    totalPages = fieldPages.length;
    currentPage = 0;
    return;
  }

  // Fallback: multiPage setting → auto-assign pageBreak to sections
  const multiPage = (config.schema!.settings as any)?.multiPage;
  if (multiPage && !hasPageBreak) {
    let sectionCount = 0;
    fields.forEach(f => {
      if (f.type === 'Section') {
        sectionCount++;
        if (!f.properties) f.properties = {};
        (f.properties as any).pageBreak = sectionCount > 1;
      }
    });
    hasPageBreak = sectionCount > 1;
  }

  if (hasPageBreak) {
    fields.forEach(f => {
      // [EmptyFirstPageFix B285 2026-06-26] Only start a NEW page on a page-break Section when the
      // current page ALREADY has content. A page-break on the FIRST field (very common from the AI
      // multi-step generator, which marks every section incl. the first with pageBreak:true) used to
      // push an empty leading page → a blank "Step 1" with no fields before the real first section.
      // The same guard collapses any consecutive/leading page breaks instead of emitting empty pages.
      if (f.type === 'Section' && f.properties?.pageBreak && fieldPages[fieldPages.length - 1].length > 0) {
        fieldPages.push([]);
      }
      fieldPages[fieldPages.length - 1].push(f);
    });
    // Defensive: drop any page that ended up with no fields (e.g. trailing page break).
    fieldPages = fieldPages.filter(page => page && page.length > 0);
    if (!fieldPages.length) fieldPages = [fields.slice()];
  } else {
    fieldPages[0] = fields.slice();
  }
  totalPages = fieldPages.length;
  currentPage = 0;
}

// ═══════════════════════════════════════════════════════════
//  RENDER FIELDS
// ═══════════════════════════════════════════════════════════
function renderFields(): void {
  const container = document.getElementById(`mf-fields-container-${config.formId}`);
  if (!container) return;
  container.innerHTML = '';
  customHtmlHasOwnSubmit = false;

  const settings = (config.schema!.settings || {}) as any;

  // [DoubleCardFix v20260601-B13] Reset the custom-html marker each render so
  // toggling between custom and standard cleanly removes the wrapper-strip
  // CSS. renderCustomHtml() re-adds it when needed.
  const wrap = document.getElementById(`mf-form-wrapper-${config.formId}`);
  if (wrap) wrap.removeAttribute('data-mf-has-custom-html');

  // [LighterChrome v20260602-B46] Apply per-form chrome toggle. settings.chrome
  // can be 'flat' (default, soft hairline) | 'card' (legacy heavy card) | 'none'
  // (chromeless). Backward-compat: settings.useCard === false → 'none', true → 'card'.
  // Empty/undefined leaves the attribute off so the :root defaults win.
  if (wrap) {
    let chrome = String((settings.chrome ?? settings.Chrome) || '').toLowerCase().trim();
    if (!chrome && Object.prototype.hasOwnProperty.call(settings, 'useCard')) {
      chrome = settings.useCard === false ? 'none' : 'card';
    }
    if (chrome === 'flat' || chrome === 'card' || chrome === 'none') {
      wrap.setAttribute('data-mf-chrome', chrome);
    } else {
      wrap.removeAttribute('data-mf-chrome');
    }
  }

  // Custom HTML layout mode
  if (settings.customHtml?.trim()) {
    renderCustomHtml(container, settings);
    return;
  }
  // Standard auto-render mode
  renderStandardFields(container);
}

// ═══════════════════════════════════════════════════════════
//  SSR HYDRATE  (v20260620-B213)
//  Attach to server-rendered field DOM instead of rebuilding it. Preserves the existing
//  .mf-field-group nodes (no innerHTML wipe → no image re-fetch, single load) and reorganizes
//  them into mf-page wrappers (matching renderStandardFields) so multi-step nav works. Falls
//  back to a full rebuild if anything looks off. Custom-HTML forms never take this path.
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  RULE ENGINE (form-level RulesJson: show/hide/require/setValue + formula calc)
//  [RuleEnginePort v20260706] The active renderer previously executed ONLY per-field
//  showIf (conditional.ts); form-level `settings.rules` (RulesJson — the format the
//  builder + AI KB produce) was NEVER applied at public render (only the dead
//  megaform-renderer.ts wired MegaFormRules). Ported here so conditional/require/setValue
//  rules work, PLUS a `= <expr>` formula in setValue so calcs (e.g. people×nights×rate)
//  actually compute (the engine's raw setValue only writes a literal).
// ═══════════════════════════════════════════════════════════
function evalRuleFormula(expr: string, data: Record<string, any>): string {
  // Replace bare field-key identifiers with their numeric value, then safe-eval pure arithmetic.
  const sub = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    const raw = data[name];
    const v = parseFloat(Array.isArray(raw) ? raw[0] : String(raw == null ? '' : raw));
    return isNaN(v) ? '0' : String(v);
  });
  if (!/^[0-9+\-*/().%\s]*$/.test(sub)) return '';           // safety: only arithmetic after substitution
  try { const r = Function('"use strict";return(' + (sub.trim() || '0') + ')')(); return isFinite(r) ? String(r) : ''; }
  catch { return ''; }
}

function bindRuleEngine(container: HTMLElement): void {
  const settings: any = (config.schema && (config.schema.settings as any)) || {};
  const rules: any[] = settings.rules || settings.Rules || (config as any).rules || [];
  if (!Array.isArray(rules) || !rules.length) return;
  const RE: any = (window as any).MegaFormRules || (window as any).MegaFormRuleEngine;
  if (!RE || typeof RE.evaluateRules !== 'function') return;

  const fields: any[] = flattenFields(((config.schema && config.schema.fields) || []) as any) || [];
  const collectData = (): Record<string, any> => {
    const data: Record<string, any> = {};
    fields.forEach((f: any) => { if (f && f.key) data[f.key] = getFieldValue(f.key, f.type, config.formId); });
    return data;
  };
  const findGroup = (key: string): HTMLElement | null =>
    Array.from(container.querySelectorAll<HTMLElement>('.mf-field-group[data-key]'))
      .find(g => g.getAttribute('data-key') === key) || null;

  const applyRuleEffects = (effects: any[], data: Record<string, any>): void => {
    (effects || []).forEach((effect: any) => {
      const key = effect && effect.target;
      if (!key) return;
      const group = findGroup(key);
      if (!group) return;
      switch (effect.action) {
        case 'show':     group.style.display = ''; group.removeAttribute('hidden'); break;
        case 'hide':     group.style.display = 'none'; break;
        case 'require':  group.querySelectorAll<any>('input,select,textarea').forEach((el: any) => { el.required = true; }); group.classList.add('mf-required'); break;
        case 'optional': group.querySelectorAll<any>('input,select,textarea').forEach((el: any) => { el.required = false; }); group.classList.remove('mf-required'); break;
        case 'enable':   group.querySelectorAll<any>('input,select,textarea,button').forEach((el: any) => { el.disabled = false; }); break;
        case 'disable':  group.querySelectorAll<any>('input,select,textarea,button').forEach((el: any) => { el.disabled = true; }); break;
        case 'setValue': {
          const raw = effect.value;
          const v = (typeof raw === 'string' && raw.charAt(0) === '=') ? evalRuleFormula(raw.slice(1), data) : (raw == null ? '' : String(raw));
          group.querySelectorAll<any>('input,select,textarea').forEach((el: any) => { el.value = v; });
          break;
        }
        case 'clear':    group.querySelectorAll<any>('input,select,textarea').forEach((el: any) => { el.value = ''; }); break;
      }
    });
  };

  let running = false;
  const runRules = (): void => {
    if (running) return;                       // setValue must not re-trigger the loop
    running = true;
    try { const data = collectData(); applyRuleEffects(RE.evaluateRules(rules, data), data); }
    catch (e) { /* never let a rule error break the form */ }
    finally { running = false; }
  };

  container.querySelectorAll<HTMLElement>('input, select, textarea').forEach((inp: HTMLElement) => {
    inp.addEventListener('change', runRules);
    const type = (inp as HTMLInputElement).type;
    if (type === 'text' || type === 'email' || type === 'tel' || type === 'number' || inp.tagName === 'TEXTAREA') {
      inp.addEventListener('input', runRules);
    }
  });
  runRules();
}

// [WidgetHydrateOnHydratePath v20260706] The SSR bind-only hydrate paths (below) rebind conditional
// + rules but historically did NOT hydrate widget fields, so a widget host (e.g. ContentSlider,
// data-mf-widget-hydrate) rendered by SSR stayed an empty, dead placeholder on a standard form that
// was SSR-hydrated (only the full client rebuild called bindWidgets). Call the plugin bind on these
// paths too. Plugin bind() is idempotent (marks hydrated hosts), so it is safe alongside the
// full-render finalize call.
function bindWidgetsSafe(container: HTMLElement): void {
  const W = (window as any).MegaFormWidgets;
  if (!W) return;
  // SSR emits an EMPTY widget host <div data-mf-widget-hydrate="Type" data-field-key="k"> (see
  // FormHtmlRenderer) and delegates the real markup to the client. The full client render fills it
  // via inputs.ts renderWidget; the SSR bind-only path never did, so the widget stayed empty. Fill
  // each un-hydrated host with the plugin's rendered HTML, then bind.
  if (typeof W.renderWidget === 'function') {
    const flat: any[] = flattenFields(((config.schema && config.schema.fields) || []) as any) || [];
    const byKey: Record<string, any> = {};
    flat.forEach((f: any) => { if (f && f.key) byKey[f.key] = f; });
    container.querySelectorAll<HTMLElement>('[data-mf-widget-hydrate]').forEach((host: HTMLElement) => {
      if (host.getAttribute('data-mf-widget-hydrated') === '1') return;
      const key = host.getAttribute('data-field-key') || '';
      const field = byKey[key];
      if (!field) return;
      try {
        const hidden = host.querySelector('input[type="hidden"]') as HTMLInputElement | null;
        const val = hidden ? hidden.value : '';
        host.innerHTML = W.renderWidget(field, config.formId, val);
        host.setAttribute('data-mf-widget-hydrated', '1');
      } catch (e) { /* leave the host as-is on render error */ }
    });
  }
  if (typeof W.bindWidgets === 'function') {
    try { W.bindWidgets(config.formId); } catch (e) { /* never let a widget bind error break hydration */ }
  }
}

function hydrateSsrFields(): void {
  const container = document.getElementById(`mf-fields-container-${config.formId}`);
  if (!container) { renderFields(); return; }
  const groups = Array.from(container.querySelectorAll<HTMLElement>('.mf-field-group[data-key]'))
    .filter(el => el.closest(`#mf-fields-container-${config.formId}`) === container);
  if (groups.length === 0) { renderFields(); return; }

  if (hasServerPagedSsr(container)) {
    Array.from(container.children).forEach((child, idx) => {
      if (child.classList && child.classList.contains('mf-page')) {
        (child as HTMLElement).style.display = idx === currentPage ? '' : 'none';
      }
    });
    container.setAttribute('data-mf-hydrated', '1');
    bindConditionalLogic(container);
  bindRuleEngine(container);
    bindWidgetsSafe(container);
    console.log('MegaForm: HYDRATED SSR multi-step (bind-only)', groups.length, 'fields');
    return;
  }

  const byKey = new Map<string, HTMLElement>();
  groups.forEach(el => { const k = el.getAttribute('data-key'); if (k && !byKey.has(k)) byKey.set(k, el); });

  // [PDF-grid / FlexGrid layout v20260629] Single-page flexgrid hydrate: the SSR already emitted
  // .mf-flexgrid > .mf-flexgrid-item > .mf-field-group with the --lg/md/sm vars. PRESERVE that grid
  // (do NOT strip the field-groups out of their items, which the flow path below would do) — just
  // host the existing grid inside one .mf-page so the rest of the renderer's page logic is happy.
  // Multi-page flexgrid falls through to the flow hydrate (graceful degrade) — not yet supported.
  const fgSettings = (config.schema!.settings || {}) as any;
  const fgMode = fgSettings.layoutMode === 'flexgrid' || fgSettings.LayoutMode === 'flexgrid';
  if (fgMode && fieldPages.length <= 1) {
    const ssrGrid = container.querySelector<HTMLElement>('.mf-flexgrid[data-mf-flexgrid]');
    if (ssrGrid) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'mf-page';
      pageDiv.id = `mf-page-${config.formId}-0`;
      const rest = Array.from(container.children).filter(c => c !== ssrGrid) as HTMLElement[];
      pageDiv.appendChild(ssrGrid);
      rest.forEach(c => { if (!c.classList || !c.classList.contains('mf-page')) pageDiv.appendChild(c); });
      container.textContent = '';
      container.appendChild(pageDiv);
      container.setAttribute('data-mf-hydrated', '1');
      bindConditionalLogic(container);
  bindRuleEngine(container);
      bindWidgetsSafe(container);
      console.log('MegaForm: HYDRATED flexgrid (single-page, preserved grid)');
      return;
    }
  }

  // Strays = non-field-group direct children (e.g. bare hidden inputs from FormHtmlRenderer).
  const strays = Array.from(container.children).filter(c => !c.classList || !c.classList.contains('mf-field-group')) as HTMLElement[];

  const pages: HTMLElement[] = [];
  fieldPages.forEach((pageFields, pageIdx) => {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'mf-page';
    pageDiv.id = `mf-page-${config.formId}-${pageIdx}`;
    pageDiv.style.display = pageIdx === currentPage ? '' : 'none';
    pageFields.forEach(field => {
      const el = byKey.get(field.key);
      if (el) { pageDiv.appendChild(el); byKey.delete(field.key); }   // MOVE (preserves node)
    });
    pages.push(pageDiv);
  });
  if (pages.length === 0) {
    const d = document.createElement('div');
    d.className = 'mf-page'; d.id = `mf-page-${config.formId}-0`;
    pages.push(d);
  }
  const page0 = pages[0];
  byKey.forEach(el => page0.appendChild(el));   // any field-group not placed by a page → page 0
  strays.forEach(el => page0.appendChild(el));  // hidden inputs etc. → page 0
  container.textContent = '';                    // clear leftover whitespace/text nodes
  pages.forEach(p => container.appendChild(p));
  container.setAttribute('data-mf-hydrated', '1');   // definitive marker: SSR DOM was reused, not rebuilt

  // Conditional show/hide logic binds the same way renderStandardFields does.
  bindConditionalLogic(container);
  bindRuleEngine(container);
  bindWidgetsSafe(container);
  console.log('MegaForm: HYDRATED', groups.length, 'server-rendered fields (no rebuild)');
}

function hydrateCustomSsrFields(settings: any): void {
  const container = document.getElementById(`mf-fields-container-${config.formId}`);
  if (!container) { renderFields(); return; }

  customHtmlHasOwnSubmit = !!container.querySelector('button[type="submit"], input[type="submit"]');
  if (isMultiStepCustomHtmlMode()) {
    if (isPremiumNativeCustomHtmlMode()) {
      bindPremiumNativeShellControls(container);
    } else {
      hideCustomHtmlSubmitBlocks(container);
    }
    customHtmlHasOwnSubmit = false;
  }

  bindConditionalLogic(container);
  bindRuleEngine(container);
  bindWidgetsSafe(container);

  const schemaAny = config.schema as any;
  const customScripts = (schemaAny.customScripts || schemaAny.CustomScripts ||
    settings.customScripts || settings.CustomScripts || {}) as Record<string, unknown>;
  injectManagedCustomScripts(container, customScripts, settings);

  container.setAttribute('data-mf-hydrated', '1');
  container.setAttribute('data-mf-custom-ssr', '1');
  console.log('MegaForm: HYDRATED custom SSR (bind-only)');
}

// [CustomScript v20260501-05] Cleanup any prior managed-script subscriptions
// for this form before re-render. Scripts call ctx.registerCleanup(fn) to be
// invoked here (e.g. clear interval timers, remove window listeners).
function cleanupManagedCustomScripts(formId: number): void {
  const bucket = customScriptCleanupRegistry[String(formId || 0)] || [];
  bucket.forEach(fn => { try { fn(); } catch (err) { console.warn('[MegaForm] managed script cleanup failed', err); } });
  customScriptCleanupRegistry[String(formId || 0)] = [];
}

function registerManagedCustomScriptCleanup(formId: number, cleanup: unknown): void {
  if (Array.isArray(cleanup)) { cleanup.forEach(fn => registerManagedCustomScriptCleanup(formId, fn)); return; }
  if (typeof cleanup !== 'function') return;
  const key = String(formId || 0);
  if (!customScriptCleanupRegistry[key]) customScriptCleanupRegistry[key] = [];
  customScriptCleanupRegistry[key].push(cleanup as () => void);
}

function resolveManagedScriptRoot(anchor: HTMLElement, key: string, container: HTMLElement): HTMLElement {
  const safeKey = String(key).replace(/"/g, '&quot;');
  const exact = anchor.closest(`[data-mf-script-root="${safeKey}"]`) as HTMLElement | null;
  if (exact) return exact;
  const generic = anchor.closest('[data-mf-script-root]') as HTMLElement | null;
  if (generic) return generic;
  return (anchor.parentElement || container);
}

// [ThemePresetBridge v20260502-05] Port of the legacy renderer's preset
// runtime. Without this, settings.customScripts.theme_selector runs but
// receives ctx.themePreset === undefined → preset dropdown opens but
// clicking an option is a no-op (form CSS doesn't switch). Active renderer
// previously omitted this bridge, causing "form bị lệch CSS" — the selected
// preset shows in the pill but the form keeps its old colors.
const THEME_PRESET_BRIDGE_BADGE = 'ThemePresetBridge v20260502-05';
function getThemePresetMeta(settings: any): any {
  const raw: any = (settings && (settings.themeSelector || settings.ThemeSelector)) || null;
  if (!raw || typeof raw !== 'object') return null;
  const enabledRaw = raw.enabled == null ? raw.Enabled : raw.enabled;
  const enabled = enabledRaw == null ? true : !!enabledRaw;
  if (!enabled) return null;
  const presetsRaw: any = raw.presets || raw.Presets || null;
  let presetCount = 0;
  if (presetsRaw && typeof presetsRaw === 'object') {
    try { presetCount = Object.keys(presetsRaw).length; } catch { presetCount = 0; }
  }
  return {
    enabled,
    mode: String(raw.mode || raw.Mode || 'module-controlled').toLowerCase(),
    scriptKey: String(raw.scriptKey || raw.ScriptKey || 'theme_selector').trim() || 'theme_selector',
    presetSet: String(raw.presetSet || raw.PresetSet || '').trim(),
    defaultThemeKey: String(raw.defaultThemeKey || raw.DefaultThemeKey || '').trim(),
    presetCount,
    hasPresetMap: presetCount > 0,
    showUpdateThemeButton: raw.showUpdateThemeButton == null
      ? (raw.ShowUpdateThemeButton == null ? true : !!raw.ShowUpdateThemeButton)
      : !!raw.showUpdateThemeButton,
  };
}

function dispatchThemePresetState(detail: Record<string, unknown>): void {
  try { window.dispatchEvent(new CustomEvent('mf:theme-preset-state', { detail })); } catch { /* */ }
}

function createThemePresetRuntime(settings: any, key: string): any {
  const meta = getThemePresetMeta(settings);
  if (!meta || String(meta.scriptKey || 'theme_selector') !== String(key || '')) return null;
  const platform: any = (window as any).__MF_PLATFORM__ || {};
  const savedThemeKey = String(platform.presetThemeKey || meta.defaultThemeKey ||
    ((settings && (settings.theme || settings.Theme)) || '') || '').trim();
  let activeThemeKey = savedThemeKey;
  const selectorEnabled = !!platform.allowThemePresetSelector && !config.isPreview;
  function emit(extra?: Record<string, unknown>): void {
    const detail: any = {
      badge: THEME_PRESET_BRIDGE_BADGE,
      formId: config.formId,
      moduleId: Number(platform.moduleId || 0) || 0,
      hasSelector: true,
      selectorEnabled,
      presetSet: meta.presetSet || '',
      presetCount: Number(meta.presetCount || 0) || 0,
      hasPresetMap: !!meta.hasPresetMap,
      scriptKey: meta.scriptKey || 'theme_selector',
      defaultThemeKey: meta.defaultThemeKey || '',
      savedThemeKey: savedThemeKey || '',
      activeThemeKey: activeThemeKey || '',
      selectedThemeKey: activeThemeKey || '',
      showUpdateThemeButton: !!meta.showUpdateThemeButton,
      dirty: !!(activeThemeKey && savedThemeKey && activeThemeKey !== savedThemeKey),
    };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(name => { detail[name] = (extra as any)[name]; });
    }
    dispatchThemePresetState(detail);
  }
  return {
    badge: THEME_PRESET_BRIDGE_BADGE,
    formId: config.formId,
    moduleId: Number(platform.moduleId || 0) || 0,
    hasSelector: true,
    selectorEnabled,
    presetSet: meta.presetSet || '',
    presetCount: Number(meta.presetCount || 0) || 0,
    hasPresetMap: !!meta.hasPresetMap,
    scriptKey: meta.scriptKey || 'theme_selector',
    defaultThemeKey: meta.defaultThemeKey || '',
    savedThemeKey: savedThemeKey || '',
    activeThemeKey: activeThemeKey || '',
    showUpdateThemeButton: !!meta.showUpdateThemeButton,
    getActiveThemeKey: (): string => activeThemeKey || savedThemeKey || meta.defaultThemeKey || '',
    setActiveThemeKey: (nextKey: unknown, dirty: unknown): void => {
      activeThemeKey = String(nextKey == null ? '' : nextKey).trim();
      emit({
        activeThemeKey: activeThemeKey || '',
        selectedThemeKey: activeThemeKey || '',
        dirty: dirty == null ? true : !!dirty,
      });
    },
    reportAvailable: (extra?: Record<string, unknown>): void => emit(extra || {}),
  };
}

function injectManagedCustomScripts(container: HTMLElement, scripts: Record<string, unknown>, settings?: any): void {
  if (!scripts || typeof scripts !== 'object') return;
  const anchors = Array.from(container.querySelectorAll<HTMLElement>('[data-mf-script-key]'));
  if (!anchors.length) return;
  anchors.forEach(anchor => {
    const key = String(anchor.getAttribute('data-mf-script-key') || '').trim();
    if (!key) return;
    const code = scripts[key];
    if (typeof code !== 'string' || !String(code).trim()) return;
    const repairedCode = guardWizardStepValidation(repairKnownBrokenCustomScriptSource(code));
    if (repairedCode !== code) {
      try { (window as any).__MF_RENDERER_SCRIPT_REPAIRED__ = CUSTOM_SCRIPT_SCHEMA_REPAIR_BADGE; } catch { /* */ }
    }
    const safeKey = key.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'inline';
    const root = resolveManagedScriptRoot(anchor, key, container);
    const ctx: any = {
      badge: CUSTOM_SCRIPT_RENDERER_BADGE,
      formId: config.formId,
      key, anchor, container,
      isPreview: !!config.isPreview,
      registerCleanup: (cleanup: unknown) => registerManagedCustomScriptCleanup(config.formId, cleanup),
    };
    // [ThemePresetBridge v20260502-05] Inject themePreset runtime into ctx so
    // the customScripts.theme_selector script can switch presets via
    // ctx.themePreset.setActiveThemeKey() and emit the state event the
    // module shell listens to. Without this the dropdown rendered but
    // selecting an option did nothing.
    const themePreset = createThemePresetRuntime(settings || null, key);
    if (themePreset) {
      ctx.themePreset = themePreset;
      try { themePreset.reportAvailable({ dirty: false, selectedThemeKey: themePreset.getActiveThemeKey() }); } catch { /* */ }
    }
    try {
      (window as any).__mfCurrentScriptRoot = root;
      (window as any).__mfCurrentScriptAnchor = anchor;
      (window as any).__mfScriptContext = ctx;
      const scriptEl = document.createElement('script');
      scriptEl.type = 'text/javascript';
      scriptEl.setAttribute('data-mf-managed-script', key);
      scriptEl.setAttribute('data-mf-script-badge', CUSTOM_SCRIPT_RENDERER_BADGE);
      scriptEl.text =
        '(function(){try{\n' + String(repairedCode) + '\n}catch(__mfErr){console.error("[MegaForm] Custom script ' + safeKey + ' failed", __mfErr);}})();' +
        '\n//# sourceURL=megaform-custom-script-' + safeKey + '.js';
      if (anchor.parentNode) anchor.parentNode.insertBefore(scriptEl, anchor.nextSibling);
      else container.appendChild(scriptEl);
    } catch (err) {
      console.error('[MegaForm] Failed to inject managed custom script', key, err);
    } finally {
      try { delete (window as any).__mfCurrentScriptRoot; } catch { (window as any).__mfCurrentScriptRoot = null; }
      try { delete (window as any).__mfCurrentScriptAnchor; } catch { (window as any).__mfCurrentScriptAnchor = null; }
      try { delete (window as any).__mfScriptContext; } catch { (window as any).__mfScriptContext = null; }
    }
  });
}

function renderCustomHtml(container: HTMLElement, settings: any): void {
  // DO NOT add 'mfp' to .mf-fields-container — it inherits display:flex which
  // breaks custom HTML layouts. The custom HTML template provides its own .mfp root.
  // container.classList.add('mfp');  ← intentionally removed
  cleanupManagedCustomScripts(config.formId);

  // [DoubleCardFix v20260601-B13] Mark wrapper so the CSS rule
  // .mf-form-wrapper[data-mf-has-custom-html] .mf-form{...} can strip the
  // outer wrapper-card chrome. Without this, the default .mf-form's white
  // background + shadow + padding wraps the custom-HTML inner card → user
  // sees a heavy double-card border at the corners.
  const wrapperEl = document.getElementById(`mf-form-wrapper-${config.formId}`);
  if (wrapperEl) {
    wrapperEl.setAttribute('data-mf-has-custom-html', '1');
    wrapperEl.classList.toggle('mf-premium-native-mode', !!(settings?.premiumNativePageBreak === true || settings?.PremiumNativePageBreak === true));
  }

  // Apply theme class to the form wrapper (not the container) so theme CSS vars work
  const themeId = settings.theme || settings.Theme || '';
  if (themeId && themeId !== 'default') {
    const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
    if (wrapper) {
      // Remove any previous theme class
      Array.from(wrapper.classList)
        .filter(c => c.startsWith('mf-theme-'))
        .forEach(c => wrapper.classList.remove(c));
      wrapper.classList.add('mf-theme-' + themeId);
    }
  }

  applyFormPresentationSettings(settings);

  const customContent = ((settings.customContent || (settings as any).CustomContent || {}) as Record<string, unknown>);
  let html = settings.customHtml as string;
  html = html.replace(/<form[^>]*>/gi, '<div class="mfp-form-inner">');
  html = html.replace(/<\/form>/gi, '</div>');
  html = html
    .replace(/\{\{form:title\}\}/gi, esc(String(config.title || '').trim()))
    .replace(/\{\{form:description\}\}/gi, esc(String(config.description || '').trim()))
    .replace(/\{\{form:submit\}\}/gi, esc(String(config.submitButtonText || 'Submit').trim()))
    .replace(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g, (_match, key) => esc(String(customContent[key] ?? '')))
    // [ScriptAnchor v20260501-05] Replace {{script:KEY}} with hidden anchor.
    // injectManagedCustomScripts() walks each anchor and executes the matching
    // settings.customScripts[KEY] body with __mfCurrentScriptRoot resolved to
    // the closest [data-mf-script-root="KEY"] (or any [data-mf-script-root]).
    .replace(/\{\{script:([a-zA-Z0-9_-]+)\}\}/g, (_m, key) =>
      `<span class="mf-script-anchor" data-mf-script-key="${esc(String(key))}" data-mf-script-badge="${CUSTOM_SCRIPT_RENDERER_BADGE}" style="display:none !important;"></span>`);

  // Build field map
  const fieldMap: Record<string, FormField> = {};
  config.schema!.fields.forEach(f => {
    fieldMap[f.key] = f;
    if (f.type === 'Row' && f.columns) {
      f.columns.forEach(col => {
        (col.fields || []).forEach(cf => { fieldMap[cf.key] = cf; });
      });
    }
  });

  const presentTokens = new Set<string>();
  (html.match(/\{\{field:[a-zA-Z0-9_]+\}\}/g) || []).forEach(token => {
    const m = token.match(/\{\{field:([a-zA-Z0-9_]+)\}\}/);
    if (m && m[1]) presentTokens.add(m[1]);
  });

  const pageStartKeyToIndex = new Map<string, number>();
  const sectionPageBreakKeyToIndex = new Map<string, number>();
  const findFirstRenderableKey = (pageFields: FormField[]): string | null => {
    for (const pf of pageFields) {
      if (pf.type === 'Hidden') continue;
      if (presentTokens.has(pf.key)) return pf.key;
      if (pf.type === 'Row' && pf.columns) {
        for (const col of pf.columns) {
          for (const cf of (col.fields || [])) {
            if (presentTokens.has(cf.key)) return cf.key;
          }
        }
      }
    }
    return null;
  };
  if (fieldPages.length > 0) {
    for (let pageIndex = 0; pageIndex < fieldPages.length; pageIndex++) {
      const pageFields = fieldPages[pageIndex] || [];
      const firstRenderableKey = findFirstRenderableKey(pageFields);
      if (firstRenderableKey) pageStartKeyToIndex.set(firstRenderableKey, pageIndex);
      pageFields.forEach(pageField => {
        if (pageField && pageField.type === 'Section' && pageField.properties?.pageBreak) {
          sectionPageBreakKeyToIndex.set(pageField.key, pageIndex);
        }
      });
    }
  }

  // [SchemaSummary 2026-06-28] {{summary}} → schema-driven review summary (a label +
  // empty value-slot per input field; values filled live by updateLiveSummary). Replaces
  // hard-coded per-template summary rows so it auto-reflects the current schema after edits.
  // Parity with C# FormHtmlRenderer.BuildSummaryHtml (SSR).
  if (html.indexOf('{{summary}}') !== -1) {
    html = html.split('{{summary}}').join(buildSummaryHtml((config.schema && (config.schema as any).fields) || []));
  }

  // Replace {{field:key}} placeholders
  html = html.replace(/\{\{field:([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    const field = fieldMap[key];
    if (!field) return `<div style="color:#ef4444;font-size:12px;">Field "${esc(key)}" not found</div>`;

    const sectionPageIndex = sectionPageBreakKeyToIndex.has(key) ? sectionPageBreakKeyToIndex.get(key) : undefined;
    const pageAnchorPrefix = pageStartKeyToIndex.has(key) ? `<span class="mf-page-anchor" data-mf-page-anchor="${pageStartKeyToIndex.get(key)}" data-mf-anchor-key="${esc(key)}" style="display:none !important;"></span>` : '';
    const sectionPageAnchor = sectionPageIndex !== undefined ? `<span class="mf-page-anchor" data-mf-page-anchor="${sectionPageIndex}" data-mf-page-break-key="${esc(field.key || '')}" style="display:none !important;"></span>` : '';

    if (field.type === 'Section' && field.properties?.pageBreak) {
      return pageAnchorPrefix + sectionPageAnchor + `<div class="mf-page-anchor" data-mf-page-break-key="${esc(field.key || '')}" hidden></div>`;
    }
    if (field.type === 'Hidden') return pageAnchorPrefix + `<input type="hidden" name="${esc(field.key)}" value="${esc(String(field.defaultValue || formData[field.key] || ''))}">`;
    if (field.type === 'Section') return pageAnchorPrefix + `<div class="mf-section-break"><div class="mf-section-title">${esc(field.label)}</div></div>`;
    if (field.type === 'Html') return pageAnchorPrefix + `<div class="mf-html-block">${field.htmlContent || ''}</div>`;

    // Row
    if (field.type === 'Row' && field.columns) {
      const colTpl = field.columns.map(c => `${c.span || 6}fr`).join(' ');
      let rowH = `<div class="mf-row" style="display:grid;grid-template-columns:${colTpl};gap:var(--mf-field-gap,20px);margin-bottom:var(--mf-field-gap,20px);width:100%;" data-row-width-badge="${ROW_FULL_WIDTH_BADGE}">`;
      field.columns.forEach(col => {
        rowH += '<div class="mf-row-column">';
        (col.fields || []).forEach(cf => {
          const W = (window as any).MegaFormWidgets;
          const isWidgetSelfLabeled = W?.widgetTypes?.[cf.type]
            && cf.type !== 'Rating'
            && cf.type !== 'Signature'
            && cf.type !== 'Appointment';
          const sfAttr = cf.showIf ? ` data-show-if="${esc(JSON.stringify(cf.showIf))}"` : '';
          const sfStyle = cf.showIf && !evaluateCondition(cf.showIf as any) ? ' style="display:none"' : '';
          rowH += `<div class="mf-field-group" data-key="${cf.key}" data-type="${cf.type}"${sfAttr}${sfStyle}>`;
          if (!isWidgetSelfLabeled) {
            rowH += `<label class="mf-field-label" for="mf-${config.formId}-${cf.key}">${esc(cf.label)}${cf.required ? ' <span class="mf-required">*</span>' : ''}</label>`;
          }
          rowH += renderInput(cf, config.formId, formData);
          if (!isWidgetSelfLabeled && cf.helpText) rowH += `<div class="mf-field-help">${esc(cf.helpText)}</div>`;
          rowH += `<div class="mf-field-error" id="mf-err-${cf.key}"></div></div>`;
        });
        rowH += '</div>';
      });
      return pageAnchorPrefix + rowH + '</div>';
    }

    // Normal field
    const W = (window as any).MegaFormWidgets;
    const isWidgetSelfLabeled = W?.widgetTypes?.[field.type]
      && field.type !== 'Rating'
      && field.type !== 'Signature'
      && field.type !== 'Appointment';
    const showIfAttr = field.showIf ? ` data-show-if="${esc(JSON.stringify(field.showIf))}"` : '';
    const showIfStyle = field.showIf && !evaluateCondition(field.showIf as any) ? ' style="display:none"' : '';
    const widthAttr = (field as any).width && (field as any).width !== '100%' ? ` data-width="${esc(String((field as any).width))}"` : '';
    let h = `<div class="mf-field-group" data-key="${field.key}" data-type="${field.type}"${widthAttr}${showIfAttr}${showIfStyle}>`;
    if (!isWidgetSelfLabeled) {
      h += `<label class="mf-field-label" for="mf-${config.formId}-${field.key}">${esc(field.label)}${field.required ? ' <span class="mf-required">*</span>' : ''}</label>`;
    }
    h += renderInput(field, config.formId, formData);
    if (!isWidgetSelfLabeled && field.helpText) h += `<div class="mf-field-help">${esc(field.helpText)}</div>`;
    h += `<div class="mf-field-error" id="mf-err-${field.key}"></div></div>`;
    return pageAnchorPrefix + h;
  });

  // Append hidden fields not in customHtml
  config.schema!.fields.forEach(field => {
    if (field.type === 'Hidden' && !html.includes(`{{field:${field.key}}}`)) {
      html += `<input type="hidden" name="${esc(field.key)}" value="${esc(String(field.defaultValue || formData[field.key] || ''))}">`;
    }
  });

  const template = document.createElement('template');
  template.innerHTML = html;

  let domPageCount = 0;
  if (fieldPages.length > 1) {
    domPageCount = wrapCustomHtmlPagesFromAnchors(template.content);
  }

  if (domPageCount > 1) {
    totalPages = domPageCount;
    currentPage = 0;
    container.innerHTML = '';
    container.appendChild(template.content);
  } else {
    // Legacy fallback for older templates that still rely on page-break markers.
    const hasMultiPage = html.includes('<!--MF_PAGE_BREAK-->');
    if (hasMultiPage) {
      const pageParts = balancePageParts(html.split('<!--MF_PAGE_BREAK-->'));
      rebuildFieldPages(pageParts);
      totalPages = pageParts.length;
      currentPage = 0;
      container.innerHTML = pageParts.map((part, idx) =>
        `<div class="mf-page" id="mf-page-${config.formId}-${idx}" style="${idx > 0 ? 'display:none;' : ''}">${part}</div>`
      ).join('');
    } else {
      fieldPages = [config.schema!.fields.slice()];
      totalPages = 1;
      currentPage = 0;
      container.innerHTML = html;
    }
  }

  const detectedCustomSubmit = !!container.querySelector('button[type="submit"], input[type="submit"]');
  if (isMultiStepCustomHtmlMode()) {
    if (isPremiumNativeCustomHtmlMode()) {
      bindPremiumNativeShellControls(container);
    } else {
      hideCustomHtmlSubmitBlocks(container);
    }
    customHtmlHasOwnSubmit = false;
  } else {
    customHtmlHasOwnSubmit = detectedCustomSubmit;
  }
  bindConditionalLogic(container);
  bindRuleEngine(container);

  // [CustomScript v20260501-05] Run managed scripts referenced by {{script:KEY}}.
  // Source: schema.customScripts | settings.customScripts (PascalCase tolerated).
  // [ThemePresetBridge v20260502-05] Pass settings so the script runner can
  // build a themePreset runtime for the theme_selector script (otherwise
  // theme dropdown opens but selecting an item is a no-op).
  const schemaAny = config.schema as any;
  const customScripts = (schemaAny.customScripts || schemaAny.CustomScripts ||
    settings.customScripts || settings.CustomScripts || {}) as Record<string, unknown>;
  injectManagedCustomScripts(container, customScripts, settings);
}

function getLowestCommonAncestor(elements: Element[]): Element | null {
  if (!elements.length) return null;
  let ancestor: Element | null = elements[0];
  while (ancestor) {
    const matchesAll = elements.every(el => ancestor === el || ancestor!.contains(el));
    if (matchesAll) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

function getDirectChildUnderAncestor(ancestor: Element, node: Node): Node | null {
  let current: Node | null = node;
  while (current && current.parentNode && current.parentNode !== ancestor) current = current.parentNode;
  return current && current.parentNode === ancestor ? current : null;
}

function isPersistentCustomShellChrome(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const cls = String(node.className || '');
  if (/\b(?:au|bg|ey|fi)-actions\b|\bmfp-actions\b|\bmf-custom-actions\b/i.test(cls)) return true;
  if (node.hasAttribute('data-mf-native-actions')) return true;
  return false;
}

function wrapCustomHtmlPagesFromAnchors(fragment: DocumentFragment): number {
  const anchors = Array.from(fragment.querySelectorAll<HTMLElement>('[data-mf-page-anchor], [data-mf-page-break-key]'));
  if (!anchors.length) return 0;

  const splitContainer = getLowestCommonAncestor(anchors);
  if (!splitContainer) return 0;

  const startNodes = new Map<number, Node>();
  anchors
    .map(anchor => ({
      anchor,
      pageIndex: Number(anchor.getAttribute('data-mf-page-anchor') || '-1'),
      boundary: getDirectChildUnderAncestor(splitContainer, anchor)
    }))
    .filter(item => item.pageIndex >= 0 && !!item.boundary)
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .forEach(item => {
      if (!startNodes.has(item.pageIndex) && item.boundary) startNodes.set(item.pageIndex, item.boundary);
    });

  if (startNodes.size <= 1) {
    splitContainer.querySelectorAll('[data-mf-page-anchor], [data-mf-page-break-key]').forEach(a => a.remove());
    return 0;
  }

  const originalChildren = Array.from(splitContainer.childNodes);
  const boundaryToPage = new Map<Node, number>();
  startNodes.forEach((node, pageIndex) => boundaryToPage.set(node, pageIndex));

  const rebuiltChildren: Node[] = [];
  let activeWrapper: HTMLElement | null = null;
  originalChildren.forEach(child => {
    const newPageIndex = boundaryToPage.get(child);
    if (newPageIndex !== undefined) {
      activeWrapper = document.createElement('div');
      activeWrapper.className = 'mf-page';
      activeWrapper.id = `mf-page-${config.formId}-${newPageIndex}`;
      if (newPageIndex > 0) activeWrapper.style.display = 'none';
      rebuiltChildren.push(activeWrapper);
    }
    if (activeWrapper && isPersistentCustomShellChrome(child)) {
      rebuiltChildren.push(child);
      return;
    }
    if (activeWrapper) activeWrapper.appendChild(child);
    else rebuiltChildren.push(child);
  });

  while (splitContainer.firstChild) splitContainer.removeChild(splitContainer.firstChild);
  rebuiltChildren.forEach(child => splitContainer.appendChild(child));
  splitContainer.querySelectorAll('[data-mf-page-anchor], [data-mf-page-break-key]').forEach(a => a.remove());

  return startNodes.size;
}

function isMultiStepCustomHtmlMode(): boolean {
  const settings = (config.schema!.settings || {}) as any;
  return !!(settings.customHtml && String(settings.customHtml).trim()) && totalPages > 1;
}

function isPremiumNativeCustomHtmlMode(): boolean {
  const settings = (config.schema!.settings || {}) as any;
  return isMultiStepCustomHtmlMode() && !!(settings.premiumNativePageBreak === true || settings.PremiumNativePageBreak === true);
}

function isTabbedNavigationMode(): boolean {
  const settings = (config.schema!.settings || {}) as any;
  const rawMode = String(
    settings.pageNavigationMode || settings.PageNavigationMode ||
    settings.navigationMode || settings.NavigationMode ||
    settings.multiPageMode || settings.MultiPageMode ||
    settings.displayMode || settings.DisplayMode || ''
  ).trim().toLowerCase();
  const rawLayout = String(settings.layout || settings.Layout || '').trim().toLowerCase();
  return totalPages > 1 && (
    rawMode === 'tabs' ||
    rawMode === 'tabbed' ||
    rawLayout === 'tabs' ||
    settings.tabbedForm === true ||
    settings.TabbedForm === true ||
    settings.enableTabs === true ||
    settings.EnableTabs === true
  );
}

function getPremiumNativeRoot(): HTMLElement | null {
  const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
  if (!wrapper || !wrapper.classList.contains('mf-premium-native-mode')) return null;
  return wrapper.querySelector<HTMLElement>('.mfp-native-generated, .mfp');
}

function premiumNativeActionButtons(root: HTMLElement, kind: 'back' | 'next' | 'submit'): HTMLElement[] {
  const selectors: Record<string, string> = {
    back: '.au-back,.bg-back,.ey-back,.fi-back,[data-mf-native-back]',
    next: '.au-next,.bg-next,.ey-next,.fi-next,[data-mf-native-next]',
    submit: '.au-submit,.bg-submit,.ey-submit,.fi-submit,[data-mf-native-submit]',
  };
  return Array.from(root.querySelectorAll<HTMLElement>(selectors[kind]));
}

function hasPremiumNativeCustomActions(): boolean {
  const root = getPremiumNativeRoot();
  if (!root) return false;
  return premiumNativeActionButtons(root, 'next').length > 0 || premiumNativeActionButtons(root, 'submit').length > 0;
}

function bindPremiumNativeShellControls(container: HTMLElement): void {
  if (!isPremiumNativeCustomHtmlMode()) return;
  const root = getPremiumNativeRoot() || container.querySelector<HTMLElement>('.mfp-native-generated, .mfp');
  if (!root) return;
  premiumNativeActionButtons(root, 'back').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      goPrevPage();
    });
  });
  premiumNativeActionButtons(root, 'next').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      goNextPage();
    });
  });
  premiumNativeActionButtons(root, 'submit').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      document.getElementById(`mf-btn-submit-${config.formId}`)?.click();
    });
  });
}

function setButtonState(btn: HTMLElement, visible: boolean, disabled: boolean): void {
  btn.hidden = !visible;
  btn.style.display = visible ? '' : 'none';
  if ('disabled' in btn) (btn as HTMLButtonElement).disabled = !!disabled;
  btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updatePremiumNativeShellState(): void {
  const root = getPremiumNativeRoot();
  if (!root) return;

  // [StepIndexNullFix v20260707] getAttribute returns null when the attribute is MISSING and
  // Number(null) === 0 (not NaN) → every unindexed step/line resolved to index 0 and ALL of them
  // took is-active at page 0 (seen live: every .bg-step rendered rose). Missing/empty attr must
  // fall back to the DOM position instead.
  const attrIndex = (el: HTMLElement, name: string, idx: number): number => {
    const a = el.getAttribute(name);
    if (a === null || a.trim() === '') return idx;
    const n = Number(a);
    return Number.isFinite(n) ? n : idx;
  };

  const pageEls = Array.from(root.querySelectorAll<HTMLElement>('.au-page,.bg-page,.ey-page,.fi-page,[data-mf-native-page]'));
  pageEls.forEach((el, idx) => {
    const pageIndex = attrIndex(el, 'data-step', idx);
    el.classList.toggle('is-active', pageIndex === currentPage);
    el.classList.toggle('is-done', pageIndex < currentPage);
  });

  // [StepBarReconcile v20260707] The static rail can have MORE items than schema pages
  // (page break deleted in the builder) — hide the dead item and map page→rail index.
  const pageToStep = reconcilePremiumNativeStepper(root, fieldPages);
  const activeStep = pageToStep[currentPage] ?? currentPage;
  const stepEls = Array.from(root.querySelectorAll<HTMLElement>('.au-step,.bg-step,.ey-step,.fi-step,[data-mf-native-step]'));
  stepEls.forEach((el, idx) => {
    const pageIndex = attrIndex(el, 'data-step', idx);
    el.classList.toggle('is-active', pageIndex === activeStep);
    el.classList.toggle('is-done', pageIndex < activeStep);
  });

  const lineEls = Array.from(root.querySelectorAll<HTMLElement>('.au-line,.bg-line,.ey-line,.fi-step-line,[data-line]'));
  lineEls.forEach((el, idx) => {
    const lineIndex = attrIndex(el, 'data-line', idx);
    el.classList.toggle('is-active', lineIndex === currentPage);
    el.classList.toggle('is-done', lineIndex < currentPage);
  });

  const pct = Math.max(0, Math.min(100, Math.round(((currentPage + 1) / Math.max(1, totalPages)) * 100)));
  root.querySelectorAll<HTMLElement>('.au-progress i,[data-mf-native-progress-fill]').forEach(el => { el.style.width = pct + '%'; });
  root.querySelectorAll<HTMLElement>('[data-bg-current],[data-ey-current],[data-mf-native-current]').forEach(el => { el.textContent = String(currentPage + 1); });

  premiumNativeActionButtons(root, 'back').forEach(btn => setButtonState(btn, currentPage > 0, currentPage === 0));
  premiumNativeActionButtons(root, 'next').forEach(btn => setButtonState(btn, currentPage < totalPages - 1, false));
  premiumNativeActionButtons(root, 'submit').forEach(btn => setButtonState(btn, currentPage === totalPages - 1, false));
  root.querySelectorAll<HTMLElement>('.ey-cancel,[data-mf-native-cancel]').forEach(el => {
    el.hidden = currentPage !== 0;
    el.style.display = currentPage === 0 ? '' : 'none';
  });
}

function syncMultiStepShellMode(enable: boolean): void {
  const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
  const form = document.getElementById(`mf-form-${config.formId}`);
  const progress = document.getElementById(`mf-progress-${config.formId}`);
  const fields = document.getElementById(`mf-fields-container-${config.formId}`);
  const actions = document.querySelector<HTMLElement>(`#mf-form-${config.formId} .mf-form-actions`);
  if (!wrapper || !form || !progress || !fields || !actions) return;

  const existingShell = document.getElementById(`mf-multistep-shell-${config.formId}`);
  if (!enable) {
    wrapper.classList.remove('mf-has-multistep-shell');
    form.classList.remove('mf-multistep-custom-form');
    if (existingShell) {
      const body = existingShell.querySelector<HTMLElement>('.mf-multistep-body');
      const footer = existingShell.querySelector<HTMLElement>('.mf-multistep-footer');
      const header = existingShell.querySelector<HTMLElement>('.mf-multistep-header');
      if (header && progress.parentElement === header) form.insertBefore(progress, form.firstChild);
      if (body && fields.parentElement === body) form.insertBefore(fields, actions);
      if (footer && actions.parentElement === footer) form.appendChild(actions);
      existingShell.remove();
    }
    return;
  }

  wrapper.classList.add('mf-has-multistep-shell');
  form.classList.add('mf-multistep-custom-form');

  let shell = existingShell as HTMLElement | null;
  if (!shell) {
    shell = document.createElement('div');
    shell.id = `mf-multistep-shell-${config.formId}`;
    shell.className = 'mf-multistep-shell';
    form.appendChild(shell);
  }

  let frame = shell.querySelector<HTMLElement>('.mf-multistep-frame');
  if (!frame) {
    shell.innerHTML =
      `<div class="mf-multistep-frame">` +
        `<div class="mf-multistep-header"></div>` +
        `<div class="mf-multistep-body"></div>` +
        `<div class="mf-multistep-footer"></div>` +
      `</div>`;
    frame = shell.querySelector<HTMLElement>('.mf-multistep-frame');
  }

  const header = shell.querySelector<HTMLElement>('.mf-multistep-header');
  const body = shell.querySelector<HTMLElement>('.mf-multistep-body');
  const footer = shell.querySelector<HTMLElement>('.mf-multistep-footer');
  if (!header || !body || !footer) return;

  if (progress.parentElement !== header) header.appendChild(progress);
  if (fields.parentElement !== body) body.appendChild(fields);
  if (actions.parentElement !== footer) footer.appendChild(actions);
}

function hideCustomHtmlSubmitBlocks(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.mfp-actions').forEach(el => {
    if (el.querySelector('button[type="submit"], input[type="submit"]')) el.style.display = 'none';
  });
  container.querySelectorAll<HTMLElement>('button[type="submit"], input[type="submit"]').forEach(el => {
    const actionHost = el.closest('.mfp-actions');
    if (!actionHost) el.style.display = 'none';
  });
}

// [PDF-grid / FlexGrid layout v20260629] helpers for the flat-field flexgrid presentation layer.
// Mirror MegaForm.Core/Services/FormHtmlRenderer.cs (RenderFlexGridFields) + inputs.ts
// renderFlexGridElement (1-based x/y). Used by the client REBUILD path below; the SSR/HYDRATE path
// reuses the server-emitted grid (see hydrateSsrFields flexgrid branch).
function _fgClamp(v: any, min: number, max: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function _fgSetVars(cell: HTMLElement, pl: any, bp: string, cols: number, idx: number): void {
  const p = pl || { x: 0, y: idx, w: cols, h: 1 };
  cell.style.setProperty(`--${bp}-x`, String(_fgClamp(p.x, 0, cols - 1, 0) + 1));
  cell.style.setProperty(`--${bp}-y`, String(_fgClamp(p.y, 0, 999, 0) + 1));
  cell.style.setProperty(`--${bp}-w`, String(_fgClamp(p.w, 1, cols, cols)));
  cell.style.setProperty(`--${bp}-h`, String(_fgClamp(p.h, 1, 12, 1)));
}
function _fgCell(field: any, cols: number, idx: number): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'mf-flexgrid-item';
  const pl = field.placement || field.Placement || {};
  _fgSetVars(cell, pl.lg || pl.Lg, 'lg', cols, idx);
  _fgSetVars(cell, pl.md || pl.Md || pl.lg || pl.Lg, 'md', cols, idx);
  _fgSetVars(cell, pl.sm || pl.Sm, 'sm', cols, idx);
  return cell;
}
function _fgLayoutActive(): boolean {
  const s = (config.schema!.settings || {}) as any;
  return s.layoutMode === 'flexgrid' || s.LayoutMode === 'flexgrid';
}

function renderStandardFields(container: HTMLElement): void {
  const s = (config.schema!.settings || {}) as any;
  const fgMode = _fgLayoutActive();
  const cfg = (s.gridConfig || s.GridConfig || {}) as any;
  // [PDF-grid finer v20260629] default 24 cols (finer snap) when unspecified.
  const fgCols = fgMode ? (Number(cfg.cols) > 0 ? _fgClamp(cfg.cols, 1, 24, 24) : 24) : 12;

  fieldPages.forEach((pageFields, pageIdx) => {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'mf-page';
    pageDiv.id = `mf-page-${config.formId}-${pageIdx}`;
    pageDiv.style.display = pageIdx === currentPage ? '' : 'none';

    let grid: HTMLElement | null = null;
    if (fgMode) {
      grid = document.createElement('div');
      grid.className = 'mf-flexgrid';
      grid.setAttribute('data-mf-flexgrid', '1');
      grid.style.setProperty('--mf-grid-cols', String(fgCols));
      grid.style.setProperty('--mf-grid-rh', _fgClamp(cfg.rowHeight, 20, 400, 64) + 'px');
      grid.style.setProperty('--mf-grid-gap', _fgClamp(cfg.gap, 0, 64, 12) + 'px');
      pageDiv.appendChild(grid);
    }

    let gi = 0;
    pageFields.forEach(field => {
      if (field.type === 'Hidden') {
        pageDiv.innerHTML += `<input type="hidden" name="${esc(field.key)}" value="${esc(String(field.defaultValue || formData[field.key] || ''))}">`;
        return;
      }
      let el: HTMLElement;
      if (field.type === 'Row' && field.columns) {
        el = renderRowElement(field, config.formId, formData);
      } else if (field.type === 'FlexGrid' && Array.isArray((field as any).items)) {
        // [FlexGrid P1] nested FlexGrid container field — parallel codepath, unchanged.
        el = renderFlexGridElement(field, config.formId, formData);
      } else {
        el = renderSingleFieldElement(field, config.formId, formData);
      }
      if (fgMode && grid) {
        const cell = _fgCell(field, fgCols, gi); gi++;
        cell.appendChild(el);
        grid.appendChild(cell);
      } else {
        pageDiv.appendChild(el);
      }
    });

    container.appendChild(pageDiv);
  });
  bindConditionalLogic(container);
  bindRuleEngine(container);
}


function getRequiredPaymentFields(): FormField[] {
  const all = flattenFields(config.schema!.fields || []);
  return all.filter(field => {
    if (!field || field.type !== 'Payment') return false;
    const wp = (field as any).widgetProps || {};
    return wp.requiredPaid !== false;
  });
}

function hasRequiredPaymentMode(): boolean {
  return getRequiredPaymentFields().length > 0;
}

function readPaymentStatus(fieldKey: string): string {
  const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="' + fieldKey.replace(/([ #;?%&,.+*~\':"!^$\[\]()=>|\/])/g, '\\$1') + '"]');
  if (!input || !input.value) return 'idle';
  try {
    const parsed = JSON.parse(input.value);
    return parsed?.status ? String(parsed.status) : 'idle';
  } catch {
    return 'idle';
  }
}

function areRequiredPaymentsPaid(): boolean {
  const fields = getRequiredPaymentFields();
  if (!fields.length) return false;
  return fields.every(field => readPaymentStatus(field.key) === 'paid');
}

function updateActionBarVisibility(): void {
  const actions = document.querySelector<HTMLElement>(`#mf-form-${config.formId} .mf-form-actions`);
  if (!actions) return;
  const visible = Array.from(actions.querySelectorAll<HTMLButtonElement>('button')).some(btn => btn.style.display !== 'none');
  actions.style.display = visible ? '' : 'none';
}

function setPaymentCompletionButtonState(show: boolean): void {
  const submitBtn = document.getElementById(`mf-btn-submit-${config.formId}`) as HTMLButtonElement | null;
  if (!submitBtn) return;
  if (show) {
    submitBtn.style.display = '';
    submitBtn.innerHTML = '<i class="fa fa-check-circle"></i> Complete submission';
  } else {
    submitBtn.style.display = 'none';
  }
  updateActionBarVisibility();
  updateTrialSubmitNote();
}

function applyPaymentSubmitMode(): void {
  if (!hasRequiredPaymentMode()) return;
  const submitBtn = document.getElementById(`mf-btn-submit-${config.formId}`) as HTMLButtonElement | null;
  const container = document.getElementById(`mf-fields-container-${config.formId}`);
  const customBtns = container ? container.querySelectorAll<HTMLButtonElement>('button[type="submit"]') : [];
  const onLastPage = totalPages <= 1 || currentPage === totalPages - 1;
  const revealSubmit = onLastPage && areRequiredPaymentsPaid();

  if (submitBtn) {
    if (revealSubmit) {
      submitBtn.style.display = '';
      submitBtn.innerHTML = '<i class="fa fa-check-circle"></i> Complete submission';
    } else {
      submitBtn.style.display = 'none';
    }
  }

  customBtns.forEach(btn => { btn.style.display = revealSubmit ? '' : 'none'; });
  updateActionBarVisibility();
}

function startPaymentWatcher(): void {
  if (config.isPreview || paymentWatcherTimer !== null || !hasRequiredPaymentMode()) return;
  getRequiredPaymentFields().forEach(field => { paymentStatusSnapshot[field.key] = readPaymentStatus(field.key); });
  paymentWatcherTimer = window.setInterval(() => {
    const fields = getRequiredPaymentFields();
    if (!fields.length) return;
    let shouldAutoSubmit = false;
    fields.forEach(field => {
      const prev = paymentStatusSnapshot[field.key] || 'idle';
      const next = readPaymentStatus(field.key);
      if (prev !== 'paid' && next === 'paid') shouldAutoSubmit = true;
      paymentStatusSnapshot[field.key] = next;
    });
    applyPaymentSubmitMode();
    if (shouldAutoSubmit && areRequiredPaymentsPaid()) {
      const submitted = doSubmit();
      if (!submitted) setPaymentCompletionButtonState(true);
    }
  }, 500);
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION (multi-page)
// ═══════════════════════════════════════════════════════════
function buildStepIndicator(): void {
  const bar = document.getElementById(`mf-progress-${config.formId}`);
  if (!bar || totalPages <= 1) return;
  if (hasServerPagedSsr() && bar.querySelector('.mf-steps')) {
    bar.style.display = '';
    return;
  }

  // [fix 20260630] ANY multi-step customHtml shell (premium au/bg/ey/fi-stepband OR a custom wizard)
  // renders its OWN stepper inside the customHtml — NEVER also emit the generic .mf-steps (that
  // produced a DOUBLE stepper). Broadened from premium-native to isMultiStepCustomHtmlMode so it also
  // covers shells not flagged premiumNativePageBreak (e.g. euro-youth). The prior hide lived in
  // updateNavigation gated on hasPremiumNativeCustomActions(), which races/misses; suppress
  // deterministically at build time instead.
  if (isMultiStepCustomHtmlMode()) { bar.innerHTML = ''; bar.style.display = 'none'; return; }

  // [B286 2026-06-26] Derive each step's label from the ACTUAL page structure (fieldPages) —
  // the page's leading Section heading, else a generic "Step N". The old logic counted pageBreak
  // sections and pushed labels AFTER page 0, which went off-by-one once calculatePages stopped
  // emitting an empty leading page (a leading page-break Section now lives ON page 0, so its name
  // must label step 1 instead of the generic "Step 1").
  const labels: string[] = [];
  for (let p = 0; p < totalPages; p++) {
    const pageFields = fieldPages[p] || [];
    const sec = pageFields.find(f => f.type === 'Section' && f.label);
    labels.push(sec && sec.label ? sec.label : `Step ${p + 1}`);
  }

  let html = '<div class="mf-steps">';
  const tabbed = isTabbedNavigationMode();
  for (let i = 0; i < totalPages; i++) {
    let lbl = (labels[i] || `Step ${i + 1}`).replace(/^Step\s*\d+[:\s]*/i, '') || `Step ${i + 1}`;
    html += `<div class="mf-step${i === 0 ? ' active' : ''}" data-step="${i}"${tabbed ? ` data-mf-tabnav="1" role="tab" tabindex="${i === 0 ? '0' : '-1'}" aria-selected="${i === 0 ? 'true' : 'false'}" aria-controls="mf-page-${config.formId}-${i}"` : ''}>`;
    html += `<div class="mf-step-circle">${i + 1}</div>`;
    html += `<div class="mf-step-label">${esc(lbl)}</div></div>`;
    if (i < totalPages - 1) html += '<div class="mf-step-line"></div>';
  }
  bar.innerHTML = html + '</div>';
  bar.style.display = '';
}

function updateNavigation(): void {
  const prevBtn = document.getElementById(`mf-btn-prev-${config.formId}`);
  const nextBtn = document.getElementById(`mf-btn-next-${config.formId}`);
  const submitBtn = document.getElementById(`mf-btn-submit-${config.formId}`);
  const bar = document.getElementById(`mf-progress-${config.formId}`);

  const shellSubmitMode = isMultiStepCustomHtmlMode();

  if (totalPages <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (submitBtn) submitBtn.style.display = customHtmlHasOwnSubmit && !shellSubmitMode ? 'none' : '';
    if (bar) bar.style.display = 'none';
    updatePremiumNativeShellState();
    applyPaymentSubmitMode();
    return;
  }

  for (let i = 0; i < totalPages; i++) {
    const pg = document.getElementById(`mf-page-${config.formId}-${i}`);
    if (pg) pg.style.display = i === currentPage ? '' : 'none';
  }

  if (prevBtn) prevBtn.style.display = currentPage > 0 ? '' : 'none';
  if (nextBtn) nextBtn.style.display = currentPage < totalPages - 1 ? '' : 'none';
  if (submitBtn) submitBtn.style.display = shellSubmitMode ? (currentPage === totalPages - 1 ? '' : 'none') : (customHtmlHasOwnSubmit ? 'none' : (currentPage === totalPages - 1 ? '' : 'none'));
  // Any multi-step customHtml shell owns the stepper → always hide the generic .mf-steps
  // (deterministic, not gated on action-button detection which races → no more double stepper).
  if (isMultiStepCustomHtmlMode() && bar) bar.style.display = 'none';
  // [fix 20260701] Hide the generic Next/Prev/Submit DETERMINISTICALLY for premium-native shells.
  // bindPremiumNativeShellControls (init, same isPremiumNativeCustomHtmlMode gate) already bound the
  // shell's OWN au/bg/ey/fi-next/back/submit, so the generic actions are redundant. Dropped the racy
  // hasPremiumNativeCustomActions() gate — it fired for down-under/festa but MISSED euro-youth/intake
  // (the §6 double-button leak: generic "Next" showing alongside the shell's "Continue").
  if (isPremiumNativeCustomHtmlMode()) {
    const actions = document.querySelector<HTMLElement>(`#mf-form-${config.formId} .mf-form-actions`);
    if (actions) actions.style.display = 'none';
  }
  updatePremiumNativeShellState();
  applyPaymentSubmitMode();
  updateTrialSubmitNote();

  if (bar) {
    bar.querySelectorAll('.mf-step').forEach((step, idx) => {
      step.className = 'mf-step' + (idx < currentPage ? ' done' : '') + (idx === currentPage ? ' active' : '');
    });
    bar.querySelectorAll('.mf-step-line').forEach((line, idx) => {
      line.className = 'mf-step-line' + (idx < currentPage ? ' done' : '');
    });
  }
  syncTabbedStepNavState();
}

function bindNavigation(): void {
  document.getElementById(`mf-btn-prev-${config.formId}`)?.addEventListener('click', () => {
    goPrevPage();
  });
  document.getElementById(`mf-btn-next-${config.formId}`)?.addEventListener('click', () => {
    goNextPage();
  });
}

function goPrevPage(): void {
  if (currentPage > 0) {
    currentPage--;
    updateNavigation();
    scrollToTop();
  }
}

function goNextPage(): void {
  // [PreviewStepNav v20260629] In the builder DESIGN/preview (config.isPreview) skip the per-step
  // required-field gate so the host can page through the whole wizard — incl. the review/summary —
  // without filling anything. The PUBLIC form is unchanged: validation still gates Next there.
  if (!config.isPreview && !validatePage(fieldPages[currentPage] || [], config.formId)) return;
  if (currentPage < totalPages - 1) {
    currentPage++;
    updateNavigation();
    scrollToTop();
  }
}

/** Jump straight to a wizard step (no validation). Used by the preview-only clickable step pills so
 *  the host can inspect any step — including the final review/summary — in the Design Live Preview. */
function goToStep(stepIndex: number): void {
  if (!Number.isFinite(stepIndex) || stepIndex < 0 || stepIndex >= totalPages) return;
  currentPage = stepIndex;
  updateNavigation();
  scrollToTop();
}

function stepIndexOf(el: HTMLElement, fallback: number): number {
  const raw = el.getAttribute('data-step') || el.getAttribute('data-mf-native-step') || '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function syncTabbedStepNavState(): void {
  const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
  const tabbed = isTabbedNavigationMode();
  if (wrapper) wrapper.classList.toggle('mf-tabbed-form-mode', tabbed);
  if (!tabbed || totalPages <= 1) return;

  const root = wrapper || document;
  const sel = '.mf-step[data-step],.au-step[data-step],.bg-step[data-step],.ey-step[data-step],.fi-step[data-step],[data-mf-native-step]';
  (root as ParentNode).querySelectorAll<HTMLElement>(sel).forEach((pill, idx) => {
    const stepIndex = stepIndexOf(pill, idx);
    pill.setAttribute('data-mf-tabnav', '1');
    pill.setAttribute('role', 'tab');
    pill.setAttribute('aria-selected', stepIndex === currentPage ? 'true' : 'false');
    pill.setAttribute('tabindex', stepIndex === currentPage ? '0' : '-1');
    if (!pill.getAttribute('aria-controls')) pill.setAttribute('aria-controls', `mf-page-${config.formId}-${stepIndex}`);
  });
}

/** Public tabbed mode: step/tab indicators jump directly to their page without validating
 *  previous pages. Next/Continue still uses the existing per-page validation gate. */
function enableTabbedStepNav(): void {
  if (!isTabbedNavigationMode() || totalPages <= 1) return;
  const root = document.getElementById(`mf-form-wrapper-${config.formId}`) || document;
  const sel = '.mf-step[data-step],.au-step[data-step],.bg-step[data-step],.ey-step[data-step],.fi-step[data-step],[data-mf-native-step]';
  (root as ParentNode).querySelectorAll<HTMLElement>(sel).forEach((pill, idx) => {
    if (pill.getAttribute('data-mf-tabnav-bound') === '1') return;
    pill.setAttribute('data-mf-tabnav-bound', '1');
    pill.setAttribute('data-mf-tabnav', '1');
    pill.style.cursor = 'pointer';
    pill.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      goToStep(stepIndexOf(pill, idx));
    });
    pill.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); e.stopPropagation();
      goToStep(stepIndexOf(pill, idx));
    });
  });
  syncTabbedStepNavState();
}

/** [PreviewStepNav v20260629] DESIGN/preview only: make every wizard step-indicator pill clickable
 *  to jump straight to that step. Covers the standard `.mf-step` pills and the premium-native shell
 *  steppers (`.au-step`/`.bg-step`/`.ey-step`/`.fi-step`/`[data-mf-native-step]`). No-op (and the
 *  pills stay inert) on the public form, since it is gated to config.isPreview. */
function enablePreviewStepNav(): void {
  if (!config.isPreview || totalPages <= 1) return;
  const root = document.getElementById(`mf-form-wrapper-${config.formId}`) || document;
  const sel = '.mf-step[data-step],.au-step[data-step],.bg-step[data-step],.ey-step[data-step],.fi-step[data-step],[data-mf-native-step]';
  (root as ParentNode).querySelectorAll<HTMLElement>(sel).forEach((pill, idx) => {
    if (pill.getAttribute('data-mf-prevnav') === '1') return;
    pill.setAttribute('data-mf-prevnav', '1');
    pill.style.cursor = 'pointer';
    pill.title = t('renderer.view_step_design');
    pill.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const raw = Number(pill.getAttribute('data-step'));
      goToStep(Number.isFinite(raw) ? raw : idx);
    });
  });
}

function scrollToTop(): void {
  document.getElementById(`mf-form-wrapper-${config.formId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cssEscapeIdent(value: string): string {
  try {
    const css = (window as any).CSS;
    if (css && typeof css.escape === 'function') return css.escape(value);
  } catch (_e) { /* noop */ }
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function pageIndexForField(fieldKey: string): number {
  const key = String(fieldKey || '');
  if (!key) return -1;
  for (let i = 0; i < fieldPages.length; i++) {
    const flat = flattenFields(fieldPages[i] || []);
    if (flat.some(f => f && f.key === key)) return i;
  }
  return -1;
}

function findFieldFocusTarget(fieldKey: string, preferred?: HTMLElement | null): HTMLElement | null {
  if (preferred && document.body.contains(preferred)) return preferred;
  const escaped = cssEscapeIdent(fieldKey);
  const form = document.getElementById(`mf-form-${config.formId}`) || document;
  const control = (form as ParentNode).querySelector<HTMLElement>(
    `[name="${escaped}"],[data-key="${escaped}"] input,[data-key="${escaped}"] select,[data-key="${escaped}"] textarea,[data-key="${escaped}"] button`
  );
  if (control) return control;
  return (form as ParentNode).querySelector<HTMLElement>(`[data-key="${escaped}"]`);
}

function jumpToFieldError(fieldKey: string, preferred?: HTMLElement | null): void {
  const pageIndex = pageIndexForField(fieldKey);
  const switched = pageIndex >= 0 && totalPages > 1 && pageIndex !== currentPage;
  if (switched) {
    currentPage = pageIndex;
    updateNavigation();
  }

  window.setTimeout(() => {
    const target = findFieldFocusTarget(fieldKey, preferred);
    const err = document.getElementById(`mf-err-${fieldKey}`);
    const scrollTarget = target || (err as HTMLElement | null);
    if (scrollTarget) {
      try { scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* noop */ }
    }
    if (target && typeof (target as any).focus === 'function') {
      try { (target as HTMLElement).focus(); } catch (_e) { /* noop */ }
    }
  }, switched ? 40 : 0);
}

function focusFirstValidationError(): void {
  const form = document.getElementById(`mf-form-${config.formId}`) || document;
  const errorEl = Array.from((form as ParentNode).querySelectorAll<HTMLElement>('[id^="mf-err-"]'))
    .find(el => String(el.textContent || '').trim().length > 0);
  if (errorEl && errorEl.id.indexOf('mf-err-') === 0) {
    jumpToFieldError(errorEl.id.substring('mf-err-'.length));
    return;
  }
  const badInput = (form as ParentNode).querySelector<HTMLElement>('.mf-error[name]');
  const key = badInput ? badInput.getAttribute('name') : '';
  if (key) jumpToFieldError(key, badInput);
}

// ═══════════════════════════════════════════════════════════
//  SUBMIT
// ═══════════════════════════════════════════════════════════
// ─── SQL-sourced options for Dropdown/Radio/Checkbox ───────────────────────
// Walks all rendered fields, finds those with properties.optionsSource === 'sql',
// fetches options from the FieldOptions endpoint, and replaces options in DOM.
// Cascading: fields with properties.optionsDependsOn = ['year', ...] re-fetch when
// any listed parent field changes; current parent values become __p__<key>=value
// query params and bind to :key tokens (or stored proc @-params) on the server.
// Badge: FieldOptionsRenderer v20260516-02 (cascading)
const FIELD_OPTIONS_RENDERER_BADGE = 'FieldOptionsRenderer v20260516-02 (cascading)';
if (typeof window !== 'undefined') (window as any).__MF_FIELD_OPTIONS_RENDERER_BADGE__ = FIELD_OPTIONS_RENDERER_BADGE;

function fieldOptionsBaseUrl(): (fieldKey: string, params?: Record<string, string>) => string {
  const apiBase = (config.apiBaseUrl || '/api/MegaForm/').replace(/\/?$/, '/');
  const platform = String(((window as any).__MF_PLATFORM__ || {}).platform || '').toLowerCase();
  // DNN routes: /api/MegaForm/Submit/FieldOptions ; Oqtane/Web: /api/MegaForm/Field/Options
  const route = platform === 'dnn' ? 'Submit/FieldOptions' : 'Field/Options';
  return (fieldKey: string, params?: Record<string, string>) => {
    let qs = `formId=${config.formId}&fieldKey=${encodeURIComponent(fieldKey)}`;
    if (params) {
      Object.keys(params).forEach(k => {
        const v = params[k];
        if (v === undefined || v === null) return;
        qs += `&__p__${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
      });
    }
    return `${apiBase}${route}?${qs}`;
  };
}

function readParentValues(parentKeys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!parentKeys || !parentKeys.length) return out;
  const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`) || document;
  parentKeys.forEach(key => {
    if (!key) return;
    const id = `mf-${config.formId}-${key}`;
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (el && 'value' in el && el.value !== '' && el.value != null) { out[key] = String(el.value); return; }
    // Radio: pick the checked input
    const radio = wrapper.querySelector<HTMLInputElement>(`input[name="${key}"]:checked`);
    if (radio) { out[key] = radio.value; return; }
    // Checkbox group: comma-join checked values
    const checks = Array.from(wrapper.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${key}"]:checked`));
    if (checks.length) { out[key] = checks.map(c => c.value).join(','); return; }
    // Plain text input fallback
    const text = wrapper.querySelector<HTMLInputElement>(`[name="${key}"]`);
    if (text && text.value) out[key] = text.value;
  });
  return out;
}

async function fetchAndApply(field: FormField, urlFn: (k: string, p?: Record<string, string>) => string, params?: Record<string, string>): Promise<void> {
  try {
    const r = await fetch(urlFn(field.key, params), { credentials: 'same-origin' });
    if (!r.ok) return;
    const raw = await r.json() as Array<{ value: string; label: string; Value?: string; Label?: string }>;
    if (!Array.isArray(raw)) return;
    const norm = raw.map(o => ({ value: String(o.value ?? o.Value ?? ''), label: displayText(String(o.label ?? o.Label ?? o.value ?? o.Value ?? '')) }));
    replaceFieldOptions(field, norm);
  } catch (_e) { /* swallow — keep static fallback */ }
}

async function hydrateSqlOptions(): Promise<void> {
  if (!config?.schema?.fields) return;
  const urlFn = fieldOptionsBaseUrl();

  const flat = flattenFields(config.schema.fields).filter(f => {
    if (!f || !f.key) return false;
    const t = String(f.type || '');
    if (!['Select', 'Dropdown', 'Radio', 'Checkbox', 'MultiSelect'].includes(t)) return false;
    const p: any = f.properties || (f as any).Properties;
    // [FormLookup v20260519-03] Accept both 'sql' (cascading SQL) and
    // 'form-lookup' (options from another form's submissions). Both go
    // through the same /Submit/FieldOptions endpoint server-side.
    const src = String((p && p.optionsSource) || '').toLowerCase();
    return src === 'sql' || src === 'form-lookup' || src === 'formlookup' || src === 'form_lookup';
  });

  for (const f of flat) {
    const p: any = f.properties || {};
    const depsRaw = p.optionsDependsOn;
    const deps: string[] = Array.isArray(depsRaw)
      ? depsRaw.filter(Boolean).map(String)
      : (typeof depsRaw === 'string' ? depsRaw.split(',').map(s => s.trim()).filter(Boolean) : []);
    const reload = deps.length > 0 && (p.optionsReloadOnChange !== false);

    // Initial fetch — include any prefilled parent values
    const initialParams = deps.length ? readParentValues(deps) : undefined;
    await fetchAndApply(f, urlFn, initialParams);

    // Wire change listeners on each parent so this field re-fetches when they change
    if (reload) {
      const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`) || document;
      deps.forEach(parentKey => {
        const targets: Element[] = [];
        const byId = document.getElementById(`mf-${config.formId}-${parentKey}`);
        if (byId) targets.push(byId);
        Array.from(wrapper.querySelectorAll(`[name="${parentKey}"]`)).forEach(el => {
          if (!targets.includes(el)) targets.push(el);
        });
        if (!targets.length) return;
        targets.forEach(el => {
          el.addEventListener('change', () => {
            const params = readParentValues(deps);
            void fetchAndApply(f, urlFn, params);
          });
        });
      });
    }
  }
}

function replaceFieldOptions(field: FormField, opts: Array<{ value: string; label: string }>): void {
  const id = `mf-${config.formId}-${field.key}`;
  const t = String(field.type || '');
  if (t === 'Select' || t === 'Dropdown') {
    const customRoot = document.getElementById(`${id}-ms`) || document.getElementById(`${id}-mccb`);
    if (customRoot) {
      customRoot.dataset.options = JSON.stringify(opts);
      customRoot.dispatchEvent(new CustomEvent('mf:options-updated', { bubbles: true }));
      return;
    }
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (!sel) return;
    const preferredValue = String(
      (sel.value != null && sel.value !== '' ? sel.value : '')
      || (formData[field.key] != null ? formData[field.key] : '')
      || field.defaultValue
      || ''
    );
    const ph = sel.querySelector('option[value=""]')?.textContent || 'Select...';
    sel.innerHTML = '';
    const phOpt = document.createElement('option');
    phOpt.value = ''; phOpt.textContent = ph;
    sel.appendChild(phOpt);
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = displayText(o.label);
      sel.appendChild(opt);
    });
    if (preferredValue && opts.some(o => o.value === preferredValue)) {
      sel.value = preferredValue;
      formData[field.key] = preferredValue;
      // Re-emit change so dependent widgets like DataRepeater can reload from the resolved SQL value.
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else if (t === 'MultiSelect') {
    const customRoot = document.getElementById(`${id}-ms`);
    if (customRoot) {
      customRoot.dataset.options = JSON.stringify(opts);
      customRoot.dispatchEvent(new CustomEvent('mf:options-updated', { bubbles: true }));
    }
  } else if (t === 'Radio' || t === 'Checkbox') {
    // Find the wrapper div the input lives in (renderer wrapped in .mf-option-group)
    const wrap = document.querySelector(`#mf-form-wrapper-${config.formId} [data-mf-key="${field.key}"]`)
              || document.querySelector(`#mf-form-wrapper-${config.formId} input[name="${field.key}"]`)?.parentElement?.parentElement;
    if (!wrap) return;
    const inputType = t === 'Radio' ? 'radio' : 'checkbox';
    const html = opts.map(o =>
      `<label class="mf-option-item"><input type="${inputType}" name="${field.key}" value="${esc(o.value)}"/> ${esc(displayText(o.label))}</label>`
    ).join('');
    // Replace inputs container only if we found one with same field name pattern
    const container = (wrap.querySelector('.mf-option-group') as HTMLElement) || (wrap as HTMLElement);
    container.innerHTML = html;
  }
}

function bindSubmit(): void {
  const settings = (config.schema!.settings || {}) as any;
  const hasCustom = settings.customHtml?.trim();

  // Custom HTML mode: hide default header, but keep navigation shell for multi-step.
  if (hasCustom) {
    const wrapper = document.getElementById(`mf-form-wrapper-${config.formId}`);
    if (wrapper) {
      const header = wrapper.querySelector<HTMLElement>('.mf-form-header');
      const actions = wrapper.querySelector<HTMLElement>('.mf-form-actions');
      if (header) header.style.display = 'none';
      if (actions) {
        if (totalPages > 1) actions.style.display = '';
        else actions.style.display = customHtmlHasOwnSubmit ? 'none' : '';
      }
      wrapper.style.padding = '0'; wrapper.style.margin = '0';
      wrapper.style.background = 'none'; wrapper.style.backgroundImage = 'none';
      const form = wrapper.querySelector<HTMLElement>('.mf-form');
      if (form) { form.style.padding = '0'; form.style.margin = '0'; form.style.background = 'none'; form.style.boxShadow = 'none'; form.style.border = 'none'; form.style.borderRadius = '0'; form.style.maxWidth = 'none'; }
      const fc = wrapper.querySelector<HTMLElement>('.mf-fields-container');
      if (fc) { fc.style.padding = '0'; fc.style.margin = '0'; }
    }
  }

  // Default submit button
  document.getElementById(`mf-btn-submit-${config.formId}`)?.addEventListener('click', e => {
    e.preventDefault();
    doSubmit();
  });

  // Custom submit buttons inside container
  const container = document.getElementById(`mf-fields-container-${config.formId}`);
  if (container) {
    container.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest('button[type="submit"]');
      if (btn) { e.preventDefault(); e.stopPropagation(); doSubmit(); }
    });
    container.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); doSubmit(); });
  }
}

function doSubmit(confirmed?: boolean): boolean {
  // [DoubleSubmitGuard v20260705] Bail if a POST is already in flight — kills the
  // second synchronous doSubmit() from a premium-native button's dual submit paths.
  if (submitInFlight) return false;
  clearFieldErrors(config.formId);
  if (!validateForm(config)) {
    focusFirstValidationError();
    return false;
  }

  const data = collectFormData(config);
  if (!data) {
    focusFirstValidationError();
    return false;
  }

  // [ReviewStep v20260619] Optional pre-submit "Summary / Review" — show all
  // answers on one screen so users can check/edit before the real submit. Renders
  // INSIDE the form's own card (.mf-form) so it inherits the form's theme (any
  // form). Confirm → doSubmit(true) actually posts. Toggle: settings
  // postSubmitExperience.reviewBeforeSubmit.
  if (!confirmed) {
    const rSettings: any = (config && config.schema && (config.schema as any).settings) || {};
    const rps = rSettings.postSubmitExperience || rSettings.PostSubmitExperience || {};
    if (rps.reviewBeforeSubmit === true || rps.ReviewBeforeSubmit === true) {
      showReview(data as Record<string, unknown>, rps);
      return false;
    }
  }

  const loading = document.getElementById(`mf-loading-${config.formId}`);
  const submitBtn = document.getElementById(`mf-btn-submit-${config.formId}`) as HTMLButtonElement;
  const container = document.getElementById(`mf-fields-container-${config.formId}`);
  const customBtns = container ? container.querySelectorAll<HTMLButtonElement>('button[type="submit"]') : [];

  if (loading) loading.style.display = '';
  if (submitBtn) submitBtn.disabled = true;
  customBtns.forEach(b => { b.disabled = true; b.style.opacity = '0.6'; });

  if (config.resumeToken) (data as any).__mf_resume_token = config.resumeToken;
  // Remember the answers for the post-submit "answer summary" card.
  lastSubmittedData = data as Record<string, unknown>;
  const submissionTime = (Date.now() / 1000) - (config.loadTimestamp || Date.now() / 1000);

  submitInFlight = true;
  const xhr = new XMLHttpRequest();
  // Clear the re-entrancy flag on any terminal state (load / error / abort) so a
  // later submit (e.g. "Submit another") is allowed.
  xhr.onloadend = () => { submitInFlight = false; };
  xhr.open('POST', config.apiBaseUrl + 'Submit/Post', true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = () => {
    if (loading) loading.style.display = 'none';
    applyPaymentSubmitMode();
    if (submitBtn) submitBtn.disabled = false;
    customBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; });

    try {
      const result = JSON.parse(xhr.responseText);
      if (xhr.status === 200 && (result.success || result.Success)) {
        clearFieldErrors(config.formId);
        showSuccess(result);
        // [ListViewActions v20260507-29] Public event so embedders (like the
        // ListView modal) can react to a successful submit without polling.
        try {
          document.dispatchEvent(new CustomEvent('mf:submission-success', {
            detail: { formId: config.formId, submissionId: result.submissionId || result.SubmissionId, result },
          }));
        } catch { /* old browsers without CustomEvent ctor */ }
      } else {
        const errMsg = result.error || result.errorMessage || result.ErrorMessage || mfI18nT('form.submission_failed', 'Submission failed.');
        const valErrors = result.validationErrors || result.ValidationErrors || {};
        clearFieldErrors(config.formId);
        const msgs: string[] = [];
        let firstErrorField: HTMLElement | null = null;

        Object.keys(valErrors).forEach(fieldKey => {
          const msg = valErrors[fieldKey];
          msgs.push(msg);
          const fieldEl = document.querySelector<HTMLElement>(`[name="${fieldKey}"]`);
          if (fieldEl) {
            const wrapper = fieldEl.closest('.mf-field-group');
            if (wrapper) {
              wrapper.classList.add('mf-field-error');
              const errSpan = document.createElement('div');
              errSpan.className = 'mf-field-error-msg';
              errSpan.textContent = msg;
              wrapper.appendChild(errSpan);
            }
            if (!firstErrorField) firstErrorField = fieldEl;
          }
        });

        if (firstErrorField) {
          jumpToFieldError(firstErrorField.getAttribute('name') || '', firstErrorField);
        } else {
          const firstKey = Object.keys(valErrors)[0];
          if (firstKey) jumpToFieldError(firstKey);
        }
        showError(msgs.length > 0 ? msgs.join(' • ') : errMsg);
      }
    } catch {
      showError('Server error: ' + xhr.status);
    }
  };
  xhr.onerror = () => {
    if (loading) loading.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
    customBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
    showError('Network error. Please try again.');
  };
  xhr.send(JSON.stringify({ formId: config.formId, data, submissionTime }));
}

// ═══════════════════════════════════════════════════════════
//  SAVE DRAFT
// ═══════════════════════════════════════════════════════════
function bindSaveDraft(): void {
  const saveBtn = document.getElementById(`mf-btn-save-${config.formId}`);
  if (!saveBtn || !config.enableSaveResume) return;

  saveBtn.addEventListener('click', () => {
    const data = collectFormData(config);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', config.apiBaseUrl + 'Draft/Save', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        config.resumeToken = result.resumeToken || result.ResumeToken;
        alert(`${mfI18nT('form.draft_saved', 'Draft saved! Resume later:')}\n\n${window.location.href.split('?')[0]}?resume=${config.resumeToken}`);
      } else alert(mfI18nT('form.error_saving_draft', 'Error saving draft'));
    };
    xhr.send(JSON.stringify({ FormId: config.formId, DataJson: JSON.stringify(data), ResumeToken: config.resumeToken || null }));
  });
}

// ═══════════════════════════════════════════════════════════
//  SUCCESS / ERROR
//  [PostSubmitRich v20260507-20] Bug fix: canonical renderer was looking up
//  `mf-success-text-${fid}` + `mf-success-ref-${fid}` which don't exist in
//  DNN's pre-built FormView.ascx skeleton (uses `mf-success-content-${fid}`).
//  Result: success container shown BUT EMPTY → blank page after PDF submit.
//  Now: read postSubmitExperience from schema settings, render rich card into
//  `mf-success-content-${fid}` (or fall back to legacy `mf-success-text-`),
//  and create the container on demand if neither exists. Also honours the
//  redirect-immediate / redirect-timed modes from the After Submit panel.
// ═══════════════════════════════════════════════════════════
const POST_SUBMIT_RICH_BADGE = 'PostSubmitRich v20260507-20';
if (typeof window !== 'undefined') (window as any).__MF_POST_SUBMIT_RICH_BADGE__ = POST_SUBMIT_RICH_BADGE;

function escHtml(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function nl2brHtml(s: string): string {
  return escHtml(s).replace(/\n/g, '<br>');
}

function getPostSubmitConfig(): any {
  const settings: any = (config && config.schema && (config.schema as any).settings) || {};
  const ps = settings.postSubmitExperience || settings.PostSubmitExperience || null;
  if (!ps) return null;
  return {
    enabled: ps.enabled !== false && ps.Enabled !== false,
    mode: ps.mode || ps.Mode || 'rich',
    title: ps.title || ps.Title || mfI18nT('form.ps_title_default', 'Submission received'),
    message: ps.message || ps.Message || mfI18nT('form.ps_message_default', 'Your submission has been received.'),
    showSubmissionId: ps.showSubmissionId !== false && ps.ShowSubmissionId !== false,
    submissionIdLabel: ps.submissionIdLabel || ps.SubmissionIdLabel || mfI18nT('form.ps_submission_id_label', 'Submission ID'),
    // [PostSubmitSummary v20260619] Optional list of the submitted answers.
    showAnswerSummary: ps.showAnswerSummary === true || ps.ShowAnswerSummary === true,
    answerSummaryTitle: ps.answerSummaryTitle || ps.AnswerSummaryTitle || mfI18nT('form.ps_answers_title', 'Your answers'),
    hideEmptyAnswers: ps.hideEmptyAnswers !== false && ps.HideEmptyAnswers !== false,
    allowFillAgain: ps.allowFillAgain !== false && ps.AllowFillAgain !== false,
    fillAgainLabel: ps.fillAgainLabel || ps.FillAgainLabel || mfI18nT('form.ps_fill_again', 'Submit another'),
    doneLabel: ps.doneLabel || ps.DoneLabel || mfI18nT('form.ps_done', 'Done'),
    redirectUrl: ps.redirectUrl || ps.RedirectUrl || '',
    redirectDelaySeconds: Number(ps.redirectDelaySeconds || ps.RedirectDelaySeconds || 0),
    redirectNotice: ps.redirectNotice || ps.RedirectNotice || mfI18nT('form.ps_redirecting', 'Redirecting shortly…'),
    buttons: Array.isArray(ps.buttons || ps.Buttons) ? (ps.buttons || ps.Buttons) : [],
  };
}

function resolvePostSubmitTokens(text: string, result: any): string {
  if (!text) return '';
  const subId = String(result && (result.submissionId || result.SubmissionId) || '');
  const settings: any = (config && config.schema && (config.schema as any).settings) || {};
  const formTitle = String(config?.title || settings.title || settings.Title || '');
  const formDesc  = String(config?.description || settings.description || settings.Description || '');
  return text
    .replace(/\{\{\s*submission:id\s*\}\}/gi, subId)
    .replace(/\{\{\s*form:title\s*\}\}/gi, formTitle)
    .replace(/\{\{\s*form:description\s*\}\}/gi, formDesc);
}

function buildPostSubmitButtonsHtml(ps: any): string {
  if (!ps.buttons || !ps.buttons.length) return '';
  // [v20260601-postsubmit-01] Only emit buttons that have BOTH a label AND a
  // url. Empty-row buttons (label:"", url:"") leaked into a "Continue" +
  // href:"#" cascade — users saw 2+ identical Continue buttons.
  const html = ps.buttons
    .filter((b: any) => b && (b.label || b.Label) && (b.url || b.Url))
    .map((b: any) => {
      const label = escHtml(b.label || b.Label);
      const url = escHtml(b.url || b.Url);
      const variant = (b.variant || b.Variant || 'primary') === 'secondary'
        ? 'background:#fff;color:#1e40af;border:1px solid #bfdbfe'
        : 'background:#2563eb;color:#fff;border:0';
      return '<a href="' + url + '" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;margin:6px 4px 0;' + variant + '">' + label + '</a>';
    }).join('');
  if (!html) return '';
  return '<div style="margin-top:18px">' + html + '</div>';
}

// [ThemeMatch v20260619] Copy the LIVE .mf-form card's *computed* chrome onto a
// pane (Review / Thank-you) so it matches ANY form's theme without knowing the
// theme's CSS-var names — themes set arbitrary --mf-* overrides + scoped CSS, so
// reading the resolved style of the real card is the only theme-agnostic way to
// guarantee the pane "fits" the original form design.
function inheritFormChrome(fid: number, target: HTMLElement | null): void {
  try {
    if (!target) return;
    const card = document.getElementById('mf-form-' + fid);
    const wrapper = document.getElementById('mf-form-wrapper-' + fid);
    const inner = wrapper ? (wrapper.querySelector('.mf-form-inner') as HTMLElement | null) : null;
    // The visible "card" surface differs per form: standard forms paint .mf-form;
    // themed/custom forms paint .mf-form-inner (or the wrapper) and leave .mf-form
    // transparent. Probe in that order and copy from whichever is actually painted.
    const cands = [card, inner, wrapper].filter(Boolean) as HTMLElement[];
    if (!cands.length) return;
    const isPainted = (bg: string) => !!bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    // 1) background from the first painted surface; else TRANSPARENT so the box never
    //    keeps the hard-coded green `.alert-success` fill. Use !important to beat the
    //    megaform.css rule (which is otherwise more specific than inline). [GreenStrip B197]
    let bg = '';
    for (const el of cands) { const c = getComputedStyle(el).backgroundColor; if (isPainted(c)) { bg = c; break; } }
    target.style.setProperty('background', bg || 'transparent', 'important');
    target.style.setProperty('background-image', 'none', 'important');
    const textCs = getComputedStyle(card || cands[0]);
    if (textCs.color) target.style.setProperty('color', textCs.color, 'important');
    if (textCs.fontFamily) target.style.fontFamily = textCs.fontFamily;
    // 2) border / radius / shadow from the first surface with real card chrome; else a
    //    neutral subtle border (never the green `.alert-success` border).
    let chromeSet = false;
    for (const el of cands) {
      const c = getComputedStyle(el);
      const hasBorder = c.borderTopWidth !== '0px' && c.borderTopStyle && c.borderTopStyle !== 'none';
      const hasRadius = !!c.borderTopLeftRadius && c.borderTopLeftRadius !== '0px';
      const hasShadow = !!c.boxShadow && c.boxShadow !== 'none';
      if (hasBorder || hasRadius || hasShadow) {
        if (hasBorder) target.style.setProperty('border', c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor, 'important');
        if (hasRadius) target.style.setProperty('border-radius', c.borderTopLeftRadius, 'important');
        if (hasShadow) target.style.setProperty('box-shadow', c.boxShadow, 'important');
        chromeSet = true;
        break;
      }
    }
    if (!chromeSet) {
      target.style.setProperty('border', '1px solid rgba(127,127,127,.18)', 'important');
      target.style.setProperty('border-radius', '12px', 'important');
    }
    // megaform.css hard-codes the success heading + reference GREEN; re-tint them to
    // the form's own title / body colour so the thank-you fully follows the theme.
    try {
      const titleEl = wrapper ? (wrapper.querySelector('.mf-form-title') as HTMLElement | null) : null;
      const headColor = titleEl ? getComputedStyle(titleEl).color : (textCs.color || '');
      if (headColor) target.querySelectorAll('h3').forEach((h: any) => { h.style.color = headColor; });
      if (textCs.color) target.querySelectorAll('.mf-ref-number, .mf-ref-number *').forEach((p: any) => { p.style.color = textCs.color; p.style.opacity = '0.65'; });
    } catch (_e) { /* noop */ }
  } catch (_e) { /* defensive */ }
}

// [PostSubmitCard v20260619-2] Ensure the post-submit pane reads as a bordered card sitting
// INSIDE the form body, for every template.
//  • Standard forms: .mf-form is itself the painted card and the pane already lives inside it,
//    so we only inherit its chrome (inheritFormChrome) — NO own border, to avoid a card-in-card.
//  • Custom-HTML / premium forms: megaform.css force-strips .mf-form to transparent/no-border
//    (data-mf-has-custom-html) and the visible premium card lived inside #mf-fields-container,
//    which showSuccess has just hidden — so the pane would float as bare text on a transparent
//    surface (the live #184/#185 bug). Detect that "no painted card around me" case and give the
//    pane its own self-contained, readable card (white bg + dark text + border + radius + shadow
//    + padding) so the thank-you stays in the form body WITH a real border.
function ensurePostSubmitCard(fid: number, pane: HTMLElement | null): void {
  try {
    if (!pane) return;
    const transparent = (c: string) => !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
    let el = pane.parentElement as HTMLElement | null;
    let insidePaintedCard = false;
    while (el && el !== document.body && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      const painted = !transparent(cs.backgroundColor)
        || (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none')
        || (!!cs.boxShadow && cs.boxShadow !== 'none');
      if (painted) { insidePaintedCard = true; break; }
      if (el.classList && el.classList.contains('mf-form-wrapper')) break;
      el = el.parentElement as HTMLElement | null;
    }
    if (insidePaintedCard) { inheritFormChrome(fid, pane); return; }
    // Bare/transparent context — self-contained, readable card (theme bg if the wrapper
    // exposes --mf-form-bg, else white; dark text so it never inverts on a light card).
    const wrapper = document.getElementById('mf-form-wrapper-' + fid) || pane.closest('.mf-form-wrapper');
    const wcs = wrapper ? getComputedStyle(wrapper as Element) : null;
    const themeBg = wcs ? String(wcs.getPropertyValue('--mf-form-bg') || '').trim() : '';
    const themeBorder = wcs ? String(wcs.getPropertyValue('--mf-form-border') || '').trim() : '';
    const lightBg = !themeBg || /^#?fff|^white|^rgb\(\s*2(4[5-9]|5[0-5])/i.test(themeBg);
    pane.style.setProperty('background', themeBg || '#ffffff', 'important');
    pane.style.setProperty('border', '1px solid ' + (themeBorder || 'rgba(15,23,42,.12)'), 'important');
    pane.style.setProperty('border-radius', '14px', 'important');
    pane.style.setProperty('box-shadow', '0 10px 30px rgba(15,23,42,.07)', 'important');
    pane.style.setProperty('padding', '34px 28px', 'important');
    pane.style.setProperty('max-width', '560px', 'important');
    pane.style.setProperty('margin', '24px auto', 'important');
    if (lightBg) {
      pane.style.setProperty('color', '#334155', 'important');
      pane.querySelectorAll('h3').forEach((h: any) => h.style.setProperty('color', '#0f172a', 'important'));
    }
  } catch (_e) { /* defensive */ }
}

// [PostSubmitSummary v20260619] Answer-summary row builder for the post-submit
// "answer summary". Mirrors the look of the pre-submit review rows so the two
// features render a consistent themed label/value list.
function mfFmtSummaryValue(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(mfFmtSummaryValue).filter(x => x !== '').join(', ');
  if (typeof v === 'object') { try { return Object.keys(v).map(k => mfFmtSummaryValue((v as any)[k])).filter(x => x !== '').join(' '); } catch (_e) { return ''; } }
  return String(v);
}
function buildSummaryRows(data: Record<string, unknown>, rowClass: string, hideEmpty: boolean): string[] {
  const labelByKey: Record<string, string> = {};
  try {
    (flattenFields(((config.schema && config.schema.fields) || []) as any) || []).forEach((f: any) => {
      if (f && f.key) labelByKey[f.key] = f.label || f.key;
    });
  } catch (_e) { /* noop */ }
  const rows: string[] = [];
  Object.keys(data || {}).forEach(k => {
    if (/^__mf|^mf_hp_|honeypot/i.test(k)) return;
    const v = mfFmtSummaryValue((data as any)[k]);
    if (v === '' && hideEmpty !== false) return;
    rows.push(
      '<div class="' + rowClass + '" style="display:flex;justify-content:space-between;gap:18px;padding:10px 2px;border-bottom:1px solid;border-bottom-color:rgba(127,127,127,.18)">' +
        '<div style="font-weight:600;opacity:.66;flex:0 0 40%;text-align:left">' + escHtml(labelByKey[k] || k) + '</div>' +
        '<div style="flex:1;text-align:right;word-break:break-word;white-space:pre-wrap">' + escHtml(v || '—') + '</div>' +
      '</div>'
    );
  });
  return rows;
}

// [ReviewStep v20260619] Pre-submit summary/review rendered INSIDE the form's own
// .mf-form card (so it inherits the card chrome + the themed .mf-btn buttons).
// [PremiumSummary 2026-06-28] Premium templates carry a hard-coded review-step
// summary (nodes with data-au-summary="KEY") that USED to be filled by an injected
// {{script:}} updateSummary(). The premium→native migration STRIPS those scripts,
// so the summary stopped populating after an edit ("không tự động summary"). Re-
// implement it centrally: fill every [data-au-summary] node from the LIVE form data
// on input/change, so the premium review auto-reflects what the user entered. Only
// activates when the form actually contains data-au-summary nodes (premium shells).
function fmtPremiumSummaryVal(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(fmtPremiumSummaryVal).filter((x) => x !== '').join(', ');
  if (typeof v === 'object') { try { return Object.keys(v).map((k) => fmtPremiumSummaryVal((v as any)[k])).filter((x) => x !== '').join(' '); } catch (_e) { return ''; } }
  return String(v);
}
function updatePremiumSummary(): void {
  const form = document.getElementById('mf-form-' + config.formId);
  if (!form) return;
  // Fill BOTH the schema-driven {{summary}} value-slots (data-mf-summary-key, any form) AND the
  // legacy per-template static rows. Those static slots use a template-prefixed attribute
  // (data-au/ey/bg/fi-summary) — historically only 'au' was matched, so euro-youth/bulgaria/festa
  // review values stayed blank ("summary không ăn khớp"). Match every prefix so existing forms fill;
  // NEW forms use the Core {{summary}} token (data-mf-summary-key) which auto-tracks the schema.
  const nodes = form.querySelectorAll(MF_SUMMARY_SEL);
  if (!nodes.length) return;
  let data: Record<string, any> = {};
  try { data = (collectFormData(config) as Record<string, any>) || {}; } catch (_e) { data = {}; }
  nodes.forEach((node) => {
    const key = mfSummaryKeyOf(node as HTMLElement);
    if (!key) return;
    let v: any = data[key];
    // 'name' is the au/premium-template alias for the first_name + last_name Row.
    if ((v == null || v === '') && key === 'name') v = [data.first_name, data.last_name].filter(Boolean).join(' ');
    (node as HTMLElement).textContent = fmtPremiumSummaryVal(v);
  });
}
// Selector + key reader shared by updatePremiumSummary/bindPremiumSummary — covers the Core
// {{summary}} slot (data-mf-summary-key) and every legacy per-template static slot prefix.
const MF_SUMMARY_SEL = '[data-mf-summary-key],[data-au-summary],[data-ey-summary],[data-bg-summary],[data-fi-summary]';
function mfSummaryKeyOf(node: HTMLElement): string {
  return (node.getAttribute('data-mf-summary-key')
    || node.getAttribute('data-au-summary') || node.getAttribute('data-ey-summary')
    || node.getAttribute('data-bg-summary') || node.getAttribute('data-fi-summary') || '').trim();
}
function bindPremiumSummary(): void {
  const form = document.getElementById('mf-form-' + config.formId);
  if (!form || !form.querySelector(MF_SUMMARY_SEL)) return;
  const upd = () => { try { updatePremiumSummary(); } catch (_e) { /* noop */ } };
  form.addEventListener('input', upd);
  form.addEventListener('change', upd);
  upd();
}

function showReview(data: Record<string, unknown>, ps: any): void {
  const fid = config.formId;
  const form = document.getElementById('mf-form-' + fid);
  if (!form) { doSubmit(true); return; }
  const fieldsC = document.getElementById('mf-fields-container-' + fid);
  const progress = document.getElementById('mf-progress-' + fid);
  const actions = form.querySelector('.mf-form-actions:not(.mf-review-actions)') as HTMLElement | null;

  const labelByKey: Record<string, string> = {};
  try {
    (flattenFields(((config.schema && config.schema.fields) || []) as any) || []).forEach((f: any) => {
      if (f && f.key) labelByKey[f.key] = f.label || f.key;
    });
  } catch (_e) { /* noop */ }

  const fmt = (v: any): string => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(fmt).filter(x => x !== '').join(', ');
    if (typeof v === 'object') { try { return Object.keys(v).map(k => fmt((v as any)[k])).filter(x => x !== '').join(' '); } catch (_e) { return ''; } }
    return String(v);
  };

  const rows: string[] = [];
  Object.keys(data).forEach(k => {
    if (/^__mf|^mf_hp_|honeypot/i.test(k)) return;
    const v = fmt(data[k]);
    if (v === '') return;
    rows.push(
      '<div class="mf-review-row" style="display:flex;justify-content:space-between;gap:18px;padding:11px 2px;border-bottom:1px solid;border-bottom-color:rgba(127,127,127,.18)">' +
        '<div class="mf-review-label" style="font-weight:600;opacity:.66;flex:0 0 40%">' + escHtml(labelByKey[k] || k) + '</div>' +
        '<div class="mf-review-value" style="flex:1;text-align:right;word-break:break-word;white-space:pre-wrap">' + escHtml(v) + '</div>' +
      '</div>'
    );
  });
  if (!rows.length) rows.push('<div style="opacity:.6;padding:11px 0">' + escHtml(mfI18nT('form.review_empty', 'No answers to review.')) + '</div>');

  if (fieldsC) fieldsC.style.display = 'none';
  if (progress) progress.style.display = 'none';
  if (actions) actions.style.display = 'none';

  let pane = document.getElementById('mf-review-' + fid) as HTMLElement | null;
  if (!pane) {
    pane = document.createElement('div');
    pane.id = 'mf-review-' + fid;
    pane.className = 'mf-review-pane';
    form.appendChild(pane);
  }
  const title = escHtml(ps.reviewTitle || ps.ReviewTitle || mfI18nT('form.review_title', 'Review your answers'));
  pane.innerHTML =
    '<div class="mf-review-head" style="font-size:17px;font-weight:700;margin:0 0 4px">' + title + '</div>' +
    '<div class="mf-review-hint" style="opacity:.6;font-size:13px;margin:0 0 14px">' + escHtml(mfI18nT('form.review_hint', 'Please check your answers. You can go back to edit before submitting.')) + '</div>' +
    '<div class="mf-review-list">' + rows.join('') + '</div>' +
    '<div class="mf-form-actions mf-review-actions" style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">' +
      '<button type="button" class="mf-btn mf-btn-prev" id="mf-review-edit-' + fid + '"><i class="fa fa-arrow-left"></i> ' + escHtml(mfI18nT('form.review_edit', 'Edit')) + '</button>' +
      '<button type="button" class="mf-btn mf-btn-submit" id="mf-review-confirm-' + fid + '"><i class="fa fa-check"></i> ' + escHtml(mfI18nT('form.review_confirm', 'Confirm & Submit')) + '</button>' +
    '</div>';
  pane.style.display = '';

  const editBtn = document.getElementById('mf-review-edit-' + fid);
  if (editBtn) editBtn.onclick = () => {
    pane!.style.display = 'none';
    if (fieldsC) fieldsC.style.display = '';
    if (actions) actions.style.display = '';
    try { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_e) { /* noop */ }
  };
  const confirmBtn = document.getElementById('mf-review-confirm-' + fid);
  if (confirmBtn) confirmBtn.onclick = () => { pane!.style.display = 'none'; doSubmit(true); };

  try { pane.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_e) { /* noop */ }
}

// [PostSubmitInCard v20260619] The thank-you / post-submit message ALWAYS renders
// as ONE themed block INSIDE the form's own .mf-form card (the input UI is hidden,
// the card chrome stays) so it matches ANY form/theme and is never a detached green
// alert sitting outside the form. Honours the configured postSubmitExperience
// (title/message/answer-summary/buttons/redirect) and falls back to a clean neutral
// card when a form has no postSubmitExperience configured.
const POST_SUBMIT_IN_CARD_BADGE = 'PostSubmitInCard v20260619-2';
if (typeof window !== 'undefined') (window as any).__MF_POST_SUBMIT_IN_CARD_BADGE__ = POST_SUBMIT_IN_CARD_BADGE;

function showSuccess(result: any): void {
  void POST_SUBMIT_RICH_BADGE;
  void POST_SUBMIT_IN_CARD_BADGE;
  const fid = config.formId;
  const ps = getPostSubmitConfig();
  const legacyRedirect = result.redirectUrl || result.RedirectUrl || '';
  const effectiveRedirect = ps && ps.redirectUrl ? resolvePostSubmitTokens(ps.redirectUrl, result) : legacyRedirect;

  // Redirect modes short-circuit before any rendering (unchanged behaviour).
  if (ps && ps.mode === 'redirect-immediate' && effectiveRedirect) { window.location.href = effectiveRedirect; return; }
  if ((!ps || ps.enabled === false) && legacyRedirect && (!ps || ps.mode !== 'redirect-timed')) {
    window.location.href = legacyRedirect; return;
  }

  const form     = document.getElementById('mf-form-' + fid);
  const wrapper  = document.getElementById('mf-form-wrapper-' + fid);
  const progress = document.getElementById('mf-progress-' + fid);
  const fieldsC  = document.getElementById('mf-fields-container-' + fid);
  const actions  = form ? form.querySelector('.mf-form-actions:not(.mf-postsubmit-actions)') as HTMLElement | null : null;
  const submitBtn = document.getElementById('mf-btn-submit-' + fid);
  const skeletonSuccess = document.getElementById('mf-success-' + fid); // legacy green box — keep hidden

  // Hide the input UI but KEEP the .mf-form card so the message inherits its theme.
  if (fieldsC) fieldsC.style.display = 'none';
  if (progress) progress.style.display = 'none';
  if (actions) actions.style.display = 'none';
  if (submitBtn) submitBtn.style.display = 'none';
  if (skeletonSuccess) skeletonSuccess.style.display = 'none';
  const errDiv = document.getElementById('mf-error-' + fid); if (errDiv) errDiv.style.display = 'none';
  // Multi-step / custom forms may carry extra submit buttons inside the fields.
  if (fieldsC) fieldsC.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(b => { b.style.display = 'none'; });

  const subId   = String(result.submissionId || result.SubmissionId || '');
  const title   = resolvePostSubmitTokens((ps && ps.title) || mfI18nT('form.ps_thank_you', 'Thank You!'), result);
  const message = resolvePostSubmitTokens((ps && ps.message) || result.successMessage || result.SuccessMessage || config.successMessage || mfI18nT('form.ps_message_default', 'Your submission has been received.'), result);
  const showSubId = !ps || ps.showSubmissionId !== false;
  const subIdLabel = (ps && ps.submissionIdLabel) || mfI18nT('form.ps_reference', 'Reference:');

  // [PostSubmitSummary v20260619] Optional list of the answers the user submitted.
  let summaryBlock = '';
  if (ps && ps.showAnswerSummary) {
    const rows = buildSummaryRows(lastSubmittedData || {}, 'mf-answer-row', ps.hideEmptyAnswers !== false);
    if (rows.length) {
      summaryBlock =
        '<div class="mf-answer-summary" style="margin:18px auto 0;max-width:520px;text-align:left">' +
          '<div style="font-size:13px;font-weight:700;opacity:.7;margin:0 0 4px">' + escHtml(ps.answerSummaryTitle || mfI18nT('form.ps_answers_title', 'Your answers')) + '</div>' +
          rows.join('') +
        '</div>';
    }
  }

  // Action buttons (only when a postSubmitExperience is configured — keeps bare
  // forms minimal, exactly as before for the no-config case).
  let buttonsBlock = '';
  if (ps && ps.enabled !== false) {
    const fillBtn = ps.allowFillAgain !== false
      ? '<button type="button" class="mf-btn mf-btn-submit" id="mf-post-submit-fill-again-' + fid + '"><i class="fa fa-plus"></i> ' + escHtml(ps.fillAgainLabel || mfI18nT('form.ps_fill_again', 'Submit another')) + '</button>'
      : '';
    const doneBtn = '<button type="button" class="mf-btn mf-btn-prev" id="mf-post-submit-done-' + fid + '">' + escHtml(ps.doneLabel || mfI18nT('form.ps_done', 'Done')) + '</button>';
    if (fillBtn) buttonsBlock += '<div class="mf-form-actions mf-postsubmit-actions" style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center">' + fillBtn + doneBtn + '</div>';
    buttonsBlock += buildPostSubmitButtonsHtml(ps);
  }

  let redirectBlock = '';
  if (ps && ps.mode === 'redirect-timed' && effectiveRedirect && ps.redirectDelaySeconds > 0) {
    redirectBlock = '<div style="margin-top:14px;font-size:12px;opacity:.6">' +
      escHtml(ps.redirectNotice) + ' <strong id="mf-post-submit-redirect-countdown-' + fid + '">' +
      escHtml(String(ps.redirectDelaySeconds)) + '</strong>s</div>';
  }

  // Transparent block — inherits the card's background/border/text colour, so it
  // looks like part of the themed form rather than a separate (green) alert box.
  const inner =
    '<div class="mf-postsubmit-body" style="text-align:center;padding:6px 2px;color:inherit">' +
      '<div class="mf-postsubmit-check" style="width:46px;height:46px;border-radius:999px;background:rgba(34,197,94,.14);color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 12px">' +
        '<i class="fa fa-check"></i>' +
      '</div>' +
      '<h3 class="mf-postsubmit-title" style="margin:0 0 6px;font-size:19px;font-weight:700;color:inherit">' + escHtml(title) + '</h3>' +
      '<div class="mf-postsubmit-msg" style="margin:0;font-size:14px;line-height:1.5;opacity:.82">' + nl2brHtml(message) + '</div>' +
      (showSubId && subId
        ? '<div class="mf-ref-number" style="margin:10px 0 0;font-size:12px;opacity:.6">' + escHtml(subIdLabel) + ' #' + escHtml(subId) + '</div>'
        : '') +
      summaryBlock +
      buttonsBlock +
      redirectBlock +
    '</div>';

  // Render INSIDE the form card when possible; otherwise fall back to a standalone
  // pane that we theme-match / give its own card via ensurePostSubmitCard.
  const host = form || wrapper || (skeletonSuccess ? skeletonSuccess.parentElement : null) || document.body;
  let pane = document.getElementById('mf-postsubmit-' + fid) as HTMLElement | null;
  if (!pane) {
    pane = document.createElement('div');
    pane.id = 'mf-postsubmit-' + fid;
    pane.className = 'mf-postsubmit-pane';
    pane.setAttribute('data-mf-guard', POST_SUBMIT_IN_CARD_BADGE);
    (host as HTMLElement).appendChild(pane);
  }
  pane.innerHTML = inner;
  pane.style.display = '';
  // [PostSubmitCard v20260619-2] Guarantee the thank-you sits as a bordered card INSIDE
  // the form body for EVERY form. Standard forms paint .mf-form and the pane inherits it;
  // custom-HTML / premium forms force .mf-form transparent (and their real card lives in the
  // now-hidden #mf-fields-container), so the pane would float bare — give it its own card.
  ensurePostSubmitCard(fid, pane);

  // Public event for embedders (parity with prior behaviour).
  try {
    const fillBtnEl = document.getElementById('mf-post-submit-fill-again-' + fid);
    if (fillBtnEl) fillBtnEl.addEventListener('click', () => { window.location.reload(); });
    const doneBtnEl = document.getElementById('mf-post-submit-done-' + fid);
    if (doneBtnEl) doneBtnEl.addEventListener('click', () => {
      if (document.referrer && document.referrer.indexOf(window.location.host) >= 0) {
        window.location.href = document.referrer;
      } else {
        try { window.close(); } catch {/* noop */}
        try { window.history.back(); } catch {/* noop */}
      }
    });
  } catch {/* noop */}

  try { pane.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) {}

  if (ps && ps.mode === 'redirect-timed' && effectiveRedirect && ps.redirectDelaySeconds > 0) {
    let remaining = ps.redirectDelaySeconds;
    const tick = () => {
      remaining -= 1;
      const cnt = document.getElementById('mf-post-submit-redirect-countdown-' + fid);
      if (cnt) cnt.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) { window.location.href = effectiveRedirect; return; }
      window.setTimeout(tick, 1000);
    };
    window.setTimeout(tick, 1000);
  }
}

function showError(message: string): void {
  const errDiv = document.getElementById(`mf-error-${config.formId}`);
  if (errDiv) {
    errDiv.style.display = '';
    const textEl = document.getElementById(`mf-error-text-${config.formId}`);
    if (textEl) textEl.textContent = message;
    errDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ═══════════════════════════════════════════════════════════
//  HELPERS — page balancing for customHtml
// ═══════════════════════════════════════════════════════════
function balancePageParts(parts: string[]): string[] {
  let openTagStack: string[] = [];
  const balanced: string[] = [];
  const trackTags = ['div', 'section', 'main', 'article', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'nav', 'header', 'footer', 'aside', 'fieldset'];

  for (const rawPart of parts) {
    let part = openTagStack.join('') + rawPart;
    const tagRegex = /<(\/?)([\w]+)(?:\s[^>]*)?>/g;
    const stack: Array<{ tag: string; full: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(part)) !== null) {
      const isClose = match[1] === '/';
      const tag = match[2].toLowerCase();
      if (!trackTags.includes(tag)) continue;
      if (match[0].includes('/>')) continue;
      if (!isClose) {
        stack.push({ tag, full: match[0] });
      } else {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) { stack.splice(i, 1); break; }
        }
      }
    }

    // Close unclosed tags
    for (let i = stack.length - 1; i >= 0; i--) part += `</${stack[i].tag}>`;
    openTagStack = stack.map(s => s.full);
    balanced.push(part);
  }
  return balanced;
}

function rebuildFieldPages(pageParts: string[]): void {
  fieldPages = [];
  const usedFields = new Set<string>();
  pageParts.forEach((part, idx) => {
    const pageFieldList: FormField[] = [];
    config.schema!.fields.forEach(f => {
      if (usedFields.has(f.key)) return;
      if (part.includes(`data-key="${f.key}"`) || part.includes(`name="${f.key}"`)) {
        pageFieldList.push(f);
        usedFields.add(f.key);
      }
    });
    if (idx === pageParts.length - 1) {
      config.schema!.fields.forEach(f => {
        if (!usedFields.has(f.key)) { pageFieldList.push(f); usedFields.add(f.key); }
      });
    }
    fieldPages.push(pageFieldList);
  });
}

// ═══════════════════════════════════════════════════════════
//  B50 — Live theme propagation listener (preview-iframe mode)
// ═══════════════════════════════════════════════════════════
// When the runtime renderer is hosted inside the Theme Tab's preview
// iframe (URL flag ?theme-preview=1), it must react to live CSS edits
// pushed from the Builder parent via postMessage. Avoids reloading the
// entire iframe on every color tweak.
// -----------------------------------------------------------
(function installThemeLivePreviewBridge() {
  if (typeof window === 'undefined') return;
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('theme-preview') !== '1') return;
    if ((window as any).__MF_THEME_LIVE_PREVIEW_BOUND__) return;
    (window as any).__MF_THEME_LIVE_PREVIEW_BOUND__ = true;

    var styleTag: HTMLStyleElement | null = null;
    var expectedParentOrigin = window.location.origin;
    try {
      if (document.referrer) expectedParentOrigin = new URL(document.referrer).origin;
    } catch (_originErr) { /* defensive */ }
    window.addEventListener('message', function (e: MessageEvent) {
      if (e.source !== window.parent || e.origin !== expectedParentOrigin) return;
      var d: any = e && e.data;
      if (!d || d.type !== 'mf-theme-live-css') return;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'mf-theme-live-preview';
        styleTag.setAttribute('data-mf-source', 'theme-tab-adapter');
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = String(d.css || '');
    }, false);

    // Signal readiness so the parent can flush its current CSS into us
    // immediately on first load (covers uncommitted theme edits that
    // happened before the iframe finished booting).
    var announce = function () {
      try { window.parent.postMessage({ type: 'mf-theme-preview-ready' }, expectedParentOrigin); } catch (_e) { /* defensive */ }
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      announce();
    } else {
      document.addEventListener('DOMContentLoaded', announce, { once: true });
    }
  } catch (_e) { /* defensive */ }
})();

// ═══════════════════════════════════════════════════════════
//  EXPORT — backward compatible global
// ═══════════════════════════════════════════════════════════
const MegaFormRenderer = { init };
export default MegaFormRenderer;

if (typeof window !== 'undefined') {
  (window as any).MegaFormRenderer = MegaFormRenderer;
  (window as any).__MegaFormRendererSignatureSizingBadge = RENDERER_SIGNATURE_SIZING_BADGE;
}

// [B79] Side-effect: install display-style rules on bundle parse so they
// land even on server-rendered ASCX pages where init() never runs. The
// runtime form page (/Home/formid/N) emits the form HTML via FormView.ascx
// and only loads megaform-renderer.js for validation/handlers; init() is
// not called there. By running this at module load we guarantee the
// .mf-style-* / button-radius rules apply regardless of how the form
// reached the DOM. Idempotent via id-check.
(function bootDisplayStyle() {
  try {
    if (typeof document === 'undefined' || !document) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        try { installDisplayStyleSheet(); } catch (_e) { /* defensive */ }
      }, { once: true });
    } else {
      installDisplayStyleSheet();
    }
  } catch (_e) { /* defensive */ }
})();

// ═══════════════════════════════════════════════════════════
//  FORM-CHROME LOCALIZER  (i18n)
//  The runtime form is server-rendered (DNN FormView.ascx) OR built by the
//  JS skeleton, both with hardcoded ENGLISH chrome (Previous/Next/Save Draft/
//  Submit/Submitting…/Select…). init() is not called on server-rendered pages,
//  so — like bootDisplayStyle above — we run a post-load pass that translates
//  ONLY the chrome elements still showing their English default (custom author
//  text like "Submit Application" is matched-and-skipped, so it's preserved).
//  Works on BOTH platforms because it operates on the final DOM, not the render
//  path. Idempotent: once translated the text no longer matches the default.
// ═══════════════════════════════════════════════════════════
function mfI18nT(key: string, fallback: string): string {
  try {
    const i18n = (window as any).MegaFormI18n;
    if (i18n && typeof i18n.t === 'function') { const v = i18n.t(key); if (v && v !== key) return v; }
  } catch (_e) { /* no i18n */ }
  return fallback;
}
function localizeChromeText(el: Element, englishDefault: string, key: string): void {
  // Replace the direct TEXT-node child matching englishDefault (preserves the
  // <i> icon sibling + surrounding whitespace). Buttons render "<i></i> Next".
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 3) {
      const raw = n.nodeValue || '';
      if (raw.trim() === englishDefault) {
        const tr = mfI18nT(key, englishDefault);
        if (tr && tr !== englishDefault) n.nodeValue = raw.replace(englishDefault, tr);
        return;
      }
    }
  }
}
function localizeFormChrome(scope?: ParentNode): void {
  try {
    const i18n = (window as any).MegaFormI18n;
    const loc = i18n && typeof i18n.getLocale === 'function' ? i18n.getLocale() : 'en-US';
    if (!loc || loc === 'en-US') return; // English is the source — nothing to do
    const root: ParentNode = scope || document;
    const CHROME: Array<[string, string, string]> = [
      ['.mf-btn-prev', 'Previous', 'form.previous'],
      ['.mf-btn-next', 'Next', 'form.next'],
      ['.mf-btn-save', 'Save Draft', 'form.save_draft'],
      ['.mf-btn-submit', 'Submit', 'form.submit'],
      ['.mf-loading', 'Submitting...', 'form.submitting'],
    ];
    for (let i = 0; i < CHROME.length; i++) {
      const sel = CHROME[i][0], def = CHROME[i][1], key = CHROME[i][2];
      const els = root.querySelectorAll(sel);
      for (let j = 0; j < els.length; j++) localizeChromeText(els[j], def, key);
    }
    // Empty-value placeholder <option> ("Select…") on every dropdown.
    const opts = root.querySelectorAll('option[value=""]');
    for (let k = 0; k < opts.length; k++) {
      const o = opts[k];
      if ((o.textContent || '').trim() === 'Select...') {
        const tr = mfI18nT('widget.select.placeholder', 'Select...');
        if (tr && tr !== 'Select...') o.textContent = tr;
      }
    }
    // Date/month input placeholders (server- or JS-rendered) — match the English
    // default only, so a custom placeholder is left untouched.
    const PH: Array<[string, string]> = [
      ['Select date...', 'form.select_date'],
      ['Select date & time...', 'form.select_datetime'],
      ['Select month...', 'form.select_month'],
    ];
    const inps = root.querySelectorAll('input[placeholder]');
    for (let m = 0; m < inps.length; m++) {
      const cur = inps[m].getAttribute('placeholder') || '';
      for (let p = 0; p < PH.length; p++) {
        if (cur === PH[p][0]) {
          const tr = mfI18nT(PH[p][1], PH[p][0]);
          if (tr && tr !== PH[p][0]) inps[m].setAttribute('placeholder', tr);
          break;
        }
      }
    }
    // File-upload drop zone hint + signature placeholder (text-node widgets).
    const TEXTUAL: Array<[string, string, string]> = [
      ['.mf-file-text', 'Drop files here or click to upload', 'form.file_drop'],
      ['.mf-signature-placeholder span', 'Sign here', 'form.sign_here'],
      ['.mf-sig-clear', 'Clear', 'form.dtp_clear'],
      ['.mf-sig-undo', 'Undo', 'form.undo'],
    ];
    for (let t = 0; t < TEXTUAL.length; t++) {
      const els = root.querySelectorAll(TEXTUAL[t][0]);
      for (let j = 0; j < els.length; j++) localizeChromeText(els[j], TEXTUAL[t][1], TEXTUAL[t][2]);
    }
    // The date-picker trigger shows its placeholder as the value span's text
    // (not an input attribute) until a date is chosen — match the English default.
    const valSpans = root.querySelectorAll('.mf-dtp-value, .mf-cal-value');
    for (let v = 0; v < valSpans.length; v++) {
      const cur = (valSpans[v].textContent || '').trim();
      for (let p = 0; p < PH.length; p++) {
        if (cur === PH[p][0]) {
          const tr = mfI18nT(PH[p][1], PH[p][0]);
          if (tr && tr !== PH[p][0]) valSpans[v].textContent = tr;
          break;
        }
      }
    }
    // Rating value readout: "<n> out of 5" — localize only the suffix, keep the count.
    const outOf = mfI18nT('form.out_of_5', 'out of 5');
    if (outOf && outOf !== 'out of 5') {
      const ratings = root.querySelectorAll('.mf-rating-value');
      for (let r = 0; r < ratings.length; r++) {
        const cur = (ratings[r].textContent || '').trim();
        const mt = /^(\d+)\s+out of 5$/.exec(cur);
        if (mt) ratings[r].textContent = mt[1] + ' ' + outOf;
      }
    }
  } catch (_e) { /* defensive — never block the form */ }
}
(function bootChromeLocalizer() {
  try {
    if (typeof document === 'undefined' || !document) return;
    let raf = 0;
    const run = function () {
      // [RTL B-Phase2] Re-apply text direction AFTER the form wrapper is in the DOM.
      // setDir() runs once at i18n boot — before the renderer builds the form — so the
      // late-rendered .mf-form-wrapper never got dir=rtl. Re-applying on each localize
      // pass (ready + delays + mutations) makes Arabic/Hebrew forms render RTL.
      try { const I = (window as any).MegaFormI18n; if (I && typeof I.setDir === 'function') I.setDir(I.getLocale && I.getLocale()); } catch (_e) { /* harmless */ }
      localizeFormChrome(document);
    };
    const debounced = function () { if (raf) return; raf = (window.setTimeout(function () { raf = 0; run(); }, 60) as unknown) as number; };
    const boot = function () {
      // Run once the locale catalog is ready (each bundle resolves its own).
      const ready = (window as any).MegaFormI18nReady;
      if (ready && typeof ready.then === 'function') ready.then(run); else run();
      // Catch late/async-rendered forms (Oqtane Blazor, AJAX paging) for a while.
      [300, 1000, 2500].forEach(function (ms) { window.setTimeout(run, ms); });
      try {
        const obs = new MutationObserver(debounced);
        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
        window.setTimeout(function () { try { obs.disconnect(); } catch (_e) { /* */ } }, 12000);
      } catch (_e) { /* observer optional */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  } catch (_e) { /* defensive */ }
})();
if (typeof window !== 'undefined') (window as any).MegaFormLocalizeChrome = localizeFormChrome;
