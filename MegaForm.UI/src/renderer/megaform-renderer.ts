
function trTop(key: string, fallback?: string, params?: Record<string, any>): string {
  try {
    var i18n = (window as any).MegaFormI18n;
    if (i18n && typeof i18n.t === 'function') {
      var translated = i18n.t(key, params || {});
      if (translated && translated !== key) return String(translated);
    }
  } catch (_e) { }
  var raw = fallback || key;
  if (params) {
    Object.keys(params).forEach(function (name) {
      raw = raw.replace(new RegExp('\{' + name + '\}', 'g'), String(params[name] == null ? '' : params[name]));
    });
  }
  return raw;
}

function firstDefinedValidationExtra(a?: any, b?: any, c?: any, d?: any, e?: any, f?: any): any {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
  }
  return undefined;
}

function getValidationConfigExtra(field: any): any {
  var validation = (field && field.validation) || (field && field.Validation) || {};
  var props = (field && (field.properties || field.Properties)) || {};
  return {
    min: firstDefinedValidationExtra(validation.min, validation.Min, props.min, props.Min),
    max: firstDefinedValidationExtra(validation.max, validation.Max, props.max, props.Max),
    minLength: firstDefinedValidationExtra(validation.minLength, validation.MinLength, props.minLength, props.MinLength),
    maxLength: firstDefinedValidationExtra(validation.maxLength, validation.MaxLength, props.maxLength, props.MaxLength),
    pattern: firstDefinedValidationExtra(validation.pattern, validation.Pattern, props.pattern, props.Pattern),
    customMessage: firstDefinedValidationExtra(validation.customMessage, validation.CustomMessage, props.customMessage, props.CustomMessage)
  };
}

function validateFieldExtra(field: any, val: any): string | null {
  var v: any = getValidationConfigExtra(field);
  var hasValue = !(val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0));

  if (field.required && !hasValue) {
    return v.customMessage || trTop('form.required_field', ((field.label || field.key || 'Field') + ' is required'));
  }

  if (!hasValue) return null;

  if (field.type === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
    return trTop('form.invalid_email', 'Please enter a valid email address');
  }

  if (field.type === 'Url' && !/^https?:\/\/.+/.test(String(val))) {
    return trTop('form.invalid_url', 'Please enter a valid URL starting with http:// or https://');
  }

  if (field.type === 'Number') {
    var numVal = parseFloat(String(val));
    if (!isNaN(numVal)) {
      if (v.min != null && numVal < Number(v.min)) return v.customMessage || trTop('form.min_value', 'Value must be at least {min}.', { min: v.min });
      if (v.max != null && numVal > Number(v.max)) return v.customMessage || trTop('form.max_value', 'Value must be at most {max}.', { max: v.max });
    }
  }

  if (v.minLength != null && String(val).length < Number(v.minLength)) {
    return v.customMessage || trTop('form.min_length', 'Minimum {min} characters', { min: v.minLength });
  }

  if (v.maxLength != null && String(val).length > Number(v.maxLength)) {
    return v.customMessage || trTop('form.max_length', 'Maximum {max} characters', { max: v.maxLength });
  }

  if (v.pattern && val) {
    try {
      if (!new RegExp(String(v.pattern)).test(String(val))) return v.customMessage || trTop('form.invalid_format', 'Invalid format');
    } catch (_) { }
  }

  return null;
}

const RENDERER_SOCIAL_SHARE_BADGE = 'SocialShareMeta v20260404-04';
const CHROMELESS_EMBED_HOST_BADGE = 'ChromelessEmbedHost v20260410-03';
const RENDERER_SCHEMA_STRING_BADGE = 'RendererSchemaString v20260420-03';
const RENDERER_SUBMIT_TARGET_BADGE = 'RendererSubmitTarget v20260406-03';
const TRIAL_SUBMIT_NOTE_BADGE = 'TrialSubmitNote v20260409-05';
const RENDERER_BOOT_WAIT_BADGE = 'RendererBootWait v20260420-04';
const OQTANE_ROOT_JS_BADGE = 'OqtaneRootJs v20260420-05';
const OQTANE_INDEX_COMPILE_BADGE = 'OqtaneIndexCompile v20260420-06';
const OQTANE_INLINE_SCRIPT_RESOURCE_BADGE = 'OqtaneInlineScriptResource v20260420-08';
const THEME_PRESET_BRIDGE_BADGE = 'ThemePresetBridge v20260419-05';

/* ============================================================
   MegaForm Renderer — Public Form Rendering Engine
   Renders JSON schema to live form, handles validation & submit

   SOURCE OF TRUTH for:
     - MegaForm.Web  →  wwwroot/megaform/js/megaform-renderer.js
     - MegaForm.DNN  →  Assets/js/megaform-renderer.js

   Build:
     tsc --project tsconfig.renderer.json
   ============================================================ */

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldOption {
  label: string;
  value: string;
}

interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  customMessage?: string;
}

interface FileSettings {
  maxFiles?: number;
  maxSizeMB?: number;
  allowedExtensions?: string[];
  allowedTypes?: string | string[];
}

interface ColumnDef {
  span: number;
  fields: FormField[];
  Span?: number;
  Fields?: FormField[];
}

interface ShowIfCondition {
  fieldKey: string;
  operator: string;
  value: string;
}

interface ShowIfRule {
  operator: 'And' | 'Or';
  conditions: ShowIfCondition[];
}

interface FieldProperties {
  pageBreak?: boolean;
  PageBreak?: boolean;
  [key: string]: unknown;
}

interface FieldTranslation {
  label?: string;
  placeholder?: string;
  helpText?: string;
  htmlContent?: string;
  options?: Record<string, string>;
}

interface FormTranslation {
  title?: string;
  description?: string;
  submitButtonText?: string;
  successMessage?: string;
}

interface FormField {
  key: string;
  type: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  readOnly?: boolean;
  defaultValue?: string;
  cssClass?: string;
  width?: string;
  prefillParam?: string;
  validation?: FieldValidation | Record<string, unknown>;
  options?: FieldOption[];
  showIf?: ShowIfRule | null;
  htmlContent?: string;
  fileSettings?: FileSettings | null;
  widgetProps?: Record<string, unknown> | null;
  properties?: FieldProperties | null;
  columns?: ColumnDef[];
  translations?: Record<string, FieldTranslation>;
  Translations?: Record<string, FieldTranslation>;
  // PascalCase aliases (from .NET serialiser)
  Key?: string;
  Type?: string;
  Label?: string;
  Columns?: ColumnDef[];
  Properties?: FieldProperties;
}

interface SchemaSettings {
  multiPage?: boolean;
  customHtml?: string;
  customCss?: string;
  customContent?: Record<string, string>;
  customScripts?: Record<string, string>;
  defaultLanguage?: string;
  supportedLanguages?: string[];
  CustomHtml?: string;
  CustomCss?: string;
  CustomContent?: Record<string, string>;
  CustomScripts?: Record<string, string>;
  DefaultLanguage?: string;
  SupportedLanguages?: string[];
  themeSelector?: Record<string, unknown>;
  ThemeSelector?: Record<string, unknown>;
  [key: string]: unknown;
}

interface FormSchema {
  fields?: FormField[];
  settings?: SchemaSettings;
  customScripts?: Record<string, string>;
  translations?: Record<string, FormTranslation>;
  Fields?: FormField[];
  Settings?: SchemaSettings;
  CustomScripts?: Record<string, string>;
  Translations?: Record<string, FormTranslation>;
}

interface RendererConfig {
  formId: number;
  /** CSS selector (e.g. '#mf-form-mount') or HTMLElement — renderer builds skeleton here */
  container?: string | HTMLElement;
  /** API base URL for submit endpoint */
  apiBaseUrl?: string;
  /** Legacy alias for apiBaseUrl */
  apiBase?: string;
  schema: FormSchema | null;
  /**
   * Raw settingsJson from the platform (SettingsJson column).
   * Renderer uses this as authoritative source for customCss, theme etc.
   * Overrides stale schema.settings.customCss if present.
   */
  settingsJson?: Record<string, unknown> | string | null;
  /**
   * ThemeJson from the platform (ThemeJson column).
   * Contains cssOverrides (CSS vars) and customCss.
   * Renderer injects mf-theme-overrides style tag.
   */
  themeJson?: Record<string, unknown> | string | null;
  honeypotField?: string;
  loadTimestamp?: number;
  enableSaveResume?: boolean;
  enableCaptcha?: boolean;
  isPreview?: boolean;
  resumeToken?: string;
  prefilledData?: Record<string, unknown> | null;
  title?: string;
  description?: string;
  submitButtonText?: string;
  successMessage?: string;
  rules?: unknown[];
  theme?: Record<string, unknown> | null;
  locale?: string;
  moduleId?: number;
  moduleViewConfigJson?: Record<string, unknown> | string | null;
}


// ─── Module ────────────────────────────────────────────────────────────────────

var MegaFormRenderer = (function () {
  'use strict';

  var config: RendererConfig = {} as RendererConfig;
  var ROW_FULL_WIDTH_BADGE = 'RowFullWidth v20260409-11';
  var currentPage: number = 0;
  var totalPages: number = 1;
  var formData: Record<string, unknown> = {};
  var lastSubmittedData: Record<string, unknown> = {};
  var fieldPages: FormField[][] = [];
  var paymentWatcherTimer: number | null = null;
  var paymentStatusSnapshot: Record<string, string> = {};
  var customHtmlHasOwnSubmit: boolean = false;

  function getTrialSubmitNoteText(): string {
    var settings = ((config && config.schema && config.schema.settings) || {}) as any;
    var rawText = String((settings as any).trialFooterText || (settings as any).TrialFooterText || '').trim();
    if (!rawText) return '';
    var rawMode: any = (settings as any).productionMode;
    if (rawMode === undefined || rawMode === null) rawMode = (settings as any).ProductionMode;
    var productionMode = String(rawMode).toLowerCase() === 'true';
    return productionMode ? '' : rawText;
  }

  function ensureTrialSubmitNoteElement(): HTMLElement {
    var noteId = 'mf-trial-submit-note-' + config.formId;
    var existing = document.getElementById(noteId) as HTMLElement | null;
    if (existing) return existing;
    var note = document.createElement('div');
    note.id = noteId;
    note.className = 'mf-trial-submit-note';
    note.setAttribute('data-trial-submit-badge', TRIAL_SUBMIT_NOTE_BADGE);
    note.style.cssText = 'margin-top:10px;font-size:12px;line-height:1.45;color:#b45309;text-align:center;';
    return note;
  }

  function updateTrialSubmitNote(): void {
    if (!config) return;
    var noteText = getTrialSubmitNoteText();
    var noteId = 'mf-trial-submit-note-' + config.formId;
    var note = document.getElementById(noteId) as HTMLElement | null;
    if (!noteText) {
      if (note) note.remove();
      return;
    }

    var submitBtn = document.getElementById('mf-btn-submit-' + config.formId) as HTMLElement | null;
    var actions = document.querySelector('#mf-form-' + config.formId + ' .mf-form-actions') as HTMLElement | null;
    var container = document.getElementById('mf-fields-container-' + config.formId);
    var customSubmit = customHtmlHasOwnSubmit && container
      ? (container.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null)
      : null;
    var target = customSubmit || submitBtn || actions;
    if (!target || !target.parentElement) {
      if (note) note.remove();
      return;
    }

    note = ensureTrialSubmitNoteElement();
    note.textContent = noteText;
    if (note.parentElement !== target.parentElement || note.previousSibling !== target) {
      target.parentElement.insertBefore(note, target.nextSibling);
    }

    var hidden = target.style.display === 'none';
    if (!hidden && target === actions && submitBtn) hidden = submitBtn.style.display === 'none';
    if (!hidden && customSubmit) hidden = customSubmit.style.display === 'none';
    note.style.display = hidden ? 'none' : 'block';
  }
  var CUSTOM_SCRIPT_RENDERER_BADGE = 'ScriptRenderer v20260403-06';
  var customScriptCleanupRegistry: Record<string, Array<() => void>> = {};
  var activeLocale: string = 'en-US';
  var I18N_BADGE: string = 'I18nRuntime v20260402-18';
  var POPUP_RUNTIME_BADGE: string = 'PopupRuntime v20260617-09';
  var RENDER_CORE_BRIDGE_BADGE: string = 'RenderCoreBridge v20260408-04';
  var PLACEHOLDER_BRIDGE_BADGE: string = 'PlaceholderBridge v20260408-01';
  var RENDER_LAYOUT_GUARD_BADGE: string = 'RenderLayoutGuard v20260408-01';
  var PAGE_BREAK_START_BADGE: string = 'PageBreakStart v20260410-02';

  function tr(key: string, fallback?: string, params?: Record<string, any>): string {
    try {
      var i18n = (window as any).MegaFormI18n;
      if (i18n && typeof i18n.t === 'function') {
        var translated = i18n.t(key, params || {});
        if (translated && translated !== key) return String(translated);
      }
    } catch (_e) { }
    var raw = fallback || key;
    if (params) {
      Object.keys(params).forEach(function (name) {
        raw = raw.replace(new RegExp('\{' + name + '\}', 'g'), String(params[name] == null ? '' : params[name]));
      });
    }
    return raw;
  }

  function getLocaleCandidates(locale?: string): string[] {
    var list: string[] = [];
    function add(value: any): void {
      var raw = String(value || '').trim();
      if (!raw) return;
      if (list.indexOf(raw) < 0) list.push(raw);
      var base = raw.split('-')[0];
      if (base && list.indexOf(base) < 0) list.push(base);
    }
    add(locale);
    add((config && config.locale) || '');
    try {
      var settings: any = config && config.schema && config.schema.settings ? config.schema.settings : {};
      add(settings.defaultLanguage || settings.DefaultLanguage || '');
    } catch (_e) { }
    add(document.documentElement.getAttribute('data-mf-locale') || '');
    add(document.body && document.body.getAttribute('data-mf-locale') || '');
    add('en-US');
    add('en');
    return list;
  }

  function pickLocalized<T>(map: Record<string, T> | undefined, locale?: string): T | null {
    if (!map) return null;
    var candidates = getLocaleCandidates(locale);
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      if ((map as any)[key]) return (map as any)[key];
    }
    return null;
  }

  function cloneField(field: FormField): FormField {
    var clone = Object.assign({}, field);
    if (field.options) clone.options = field.options.map(function (opt) { return Object.assign({}, opt); });
    if (field.columns) clone.columns = field.columns.map(function (col) {
      return { span: col.span || (col as any).Span || 6, fields: (col.fields || (col as any).Fields || []).map(cloneField) } as any;
    });
    return clone;
  }

  function applyFieldTranslation(field: FormField, locale?: string): FormField {
    var next = cloneField(field);
    var translated = pickLocalized<FieldTranslation>((field.translations || (field as any).Translations) as any, locale);
    if (translated) {
      if (translated.label) next.label = translated.label;
      if (translated.placeholder) next.placeholder = translated.placeholder;
      if (translated.helpText) next.helpText = translated.helpText;
      if (translated.htmlContent) next.htmlContent = translated.htmlContent;
      if (translated.options && next.options) {
        next.options = next.options.map(function (opt) {
          var label = translated.options && translated.options[opt.value];
          return Object.assign({}, opt, label ? { label: label } : null);
        });
      }
    }
    if (next.columns) {
      next.columns.forEach(function (col) {
        col.fields = (col.fields || []).map(function (child) { return applyFieldTranslation(child, locale); });
      });
    }
    return next;
  }

  function applyLocaleToSchema(locale?: string): void {
    if (!config.schema || !config.schema.fields) return;
    activeLocale = String(locale || config.locale || 'en-US');
    var schemaAny: any = config.schema as any;
    var translatedForm = pickLocalized<FormTranslation>((schemaAny.translations || schemaAny.Translations) as any, activeLocale);
    config.schema.fields = (config.schema.fields || []).map(function (field) { return applyFieldTranslation(field, activeLocale); });
    if (translatedForm) {
      if (translatedForm.submitButtonText) config.submitButtonText = translatedForm.submitButtonText;
      if (translatedForm.successMessage) config.successMessage = translatedForm.successMessage;
      if (translatedForm.title && !config.title) config.title = translatedForm.title;
      if (translatedForm.description && !config.description) config.description = translatedForm.description;
    }
    if (!config.submitButtonText) config.submitButtonText = tr('form.submit', 'Submit');
    if (!config.successMessage) config.successMessage = tr('form.success', 'Thank you! Your submission has been received.');
  }

  function getNavigationButtonText(kind: 'previous' | 'next'): string {
    var settings = (config.schema && config.schema.settings ? config.schema.settings : {}) as any;
    if (kind === 'previous') return String(settings.previousButtonText || tr('form.previous', 'Previous')).trim() || tr('form.previous', 'Previous');
    return String(settings.nextButtonText || tr('form.next', 'Next')).trim() || tr('form.next', 'Next');
  }

  // ═══════════════════════════════════════════════════════════
  //  SKELETON BUILDER
  //  Creates all DOM the renderer needs inside the mount element.
  //  Platforms only need: <div id="mf-form-mount"></div>
  //  DNN pre-builds its own skeleton — this is a no-op in that case.
  // ═══════════════════════════════════════════════════════════
  function buildSkeleton(mountEl: HTMLElement, fid: number, submitText?: string, hasCustomHtml?: boolean, formTitle?: string, formDescription?: string): void {
    // No-op if skeleton already exists (e.g. DNN FormView.ascx pre-built it)
    if (document.getElementById('mf-fields-container-' + fid)) return;

    var btnText = esc(submitText || tr('form.submit', 'Submit'));
    var prevText = esc(getNavigationButtonText('previous'));
    var nextText = esc(getNavigationButtonText('next'));
    var wrapperClass = 'mf-form-wrapper' + (hasCustomHtml ? ' mf-custom-shell-mode' : '');
    var honeypotName = 'mf_hp_' + fid + '_' + Math.random().toString(36).slice(2, 7);

    mountEl.innerHTML =
      '<div id="mf-form-wrapper-' + fid + '" class="' + wrapperClass + '" data-form-id="' + fid + '" data-i18n-badge="' + I18N_BADGE + '">' +
        '<div class="mf-form-inner">' +
          '<div id="mf-form-' + fid + '" class="mf-form" data-multistep-layout-badge="MultiStepInner v20260402-08">' +
            '<div id="mf-progress-' + fid + '" class="mf-progress-bar" style="display:none;"></div>' +
            '<div id="mf-fields-container-' + fid + '" class="mf-fields-container"></div>' +

            '<div style="position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden;" aria-hidden="true" tabindex="-1">' +
              '<input type="text" id="mf_hp_' + fid + '" name="' + honeypotName + '" value="" autocomplete="off" tabindex="-1"/>' +
            '</div>' +

            '<input type="hidden" id="mf-form-id-' + fid + '" value="' + fid + '"/>' +
            '<div class="mf-form-actions">' +
              '<button type="button" id="mf-btn-prev-' + fid + '" class="mf-btn mf-btn-prev" style="display:none;">' +
                '<i class="fa fa-arrow-left"></i> ' + prevText + '' +
              '</button>' +
              '<button type="button" id="mf-btn-next-' + fid + '" class="mf-btn mf-btn-next" style="display:none;">' +
                '' + nextText + ' <i class="fa fa-arrow-right"></i>' +
              '</button>' +
              '<button type="button" id="mf-btn-submit-' + fid + '" class="mf-btn mf-btn-submit">' +
                '<i class="fa fa-paper-plane"></i> ' + btnText +
              '</button>' +
            '</div>' +
          '</div>' +

          '<div id="mf-success-' + fid + '" class="mf-success-message" style="display:none;">' +
            '<div id="mf-success-content-' + fid + '"></div>' +
          '</div>' +

          '<div id="mf-error-' + fid + '" class="mf-error-message" style="display:none;">' +
            '<div class="alert alert-danger">' +
              '<i class="fa fa-exclamation-triangle"></i> ' +
              '<span id="mf-error-text-' + fid + '"></span>' +
            '</div>' +
          '</div>' +

          '<div id="mf-loading-' + fid + '" class="mf-loading" style="display:none;">' +
            '<i class="fa fa-spinner fa-spin fa-2x"></i> ' + esc(tr('form.submitting', 'Submitting...')) +
          '</div>' +

        '</div>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════
  //  NORMALISATION
  // ═══════════════════════════════════════════════════════════
  function normalizeOneField(f: FormField): void {
    if (!f) return;  // guard: skip null/undefined entries in fields array
    f.key          = f.key          || (f as any).Key          || '';
    f.type         = f.type         || (f as any).Type         || '';
    f.label        = f.label        || (f as any).Label        || '';
    f.required     = f.required     || (f as any).Required     || false;
    f.placeholder  = f.placeholder  || (f as any).Placeholder  || '';
    f.helpText     = f.helpText     || (f as any).HelpText     || '';
    f.defaultValue = f.defaultValue || (f as any).DefaultValue || '';
    f.options      = f.options      || (f as any).Options      || [];
    f.validation   = f.validation   || (f as any).Validation   || {};
    f.width        = f.width        || (f as any).Width        || '100%';
    f.htmlContent  = f.htmlContent  || (f as any).HtmlContent  || '';
    f.fileSettings = f.fileSettings || (f as any).FileSettings || null;
    f.showIf       = f.showIf       || (f as any).ShowIf       || null;
    f.widgetProps  = f.widgetProps  || (f as any).WidgetProps  || null;
    if (f.widgetProps && typeof f.widgetProps === 'object') {
      var widgetPlaceholder = (f.widgetProps as any).placeholder;
      if ((!widgetPlaceholder && f.placeholder) || widgetPlaceholder === '') {
        (f.widgetProps as any).placeholder = f.placeholder || '';
      }
      if ((!f.placeholder || f.placeholder === '') && widgetPlaceholder) {
        f.placeholder = String(widgetPlaceholder);
      }
    }
    f.prefillParam = f.prefillParam || (f as any).PrefillParam || '';
    f.properties   = f.properties   || (f as any).Properties  || null;
    (f as any).translations = (f as any).translations || (f as any).Translations || null;

    if (f.type === 'Row') {
      var rawColumns: any = f.columns != null ? f.columns : (f as any).Columns;
      if (Array.isArray(rawColumns)) {
        f.columns = rawColumns;
      } else {
        var count = parseInt(String(rawColumns == null ? '' : rawColumns), 10);
        if (!isFinite(count) || count <= 0) count = 1;
        count = Math.min(Math.max(count, 1), 4);
        var flatFields: any[] = Array.isArray((f as any).fields || (f as any).Fields) ? (((f as any).fields || (f as any).Fields) as any[]) : [];
        var chunkSize = Math.max(1, Math.ceil((flatFields.length || 1) / count));
        var columns: any[] = [];
        for (var ci = 0; ci < count; ci++) {
          var start = ci * chunkSize;
          var end = ci === count - 1 ? flatFields.length : Math.min(flatFields.length, start + chunkSize);
          var span = ci === count - 1 ? (12 - ((count - 1) * Math.floor(12 / count))) : Math.floor(12 / count);
          if (span <= 0) span = 6;
          columns.push({ span: span, fields: flatFields.slice(start, end) });
        }
        f.columns = columns as any;
      }
      (f.columns || []).forEach(function (col: ColumnDef) {
        col.span   = col.span   || col.Span   || 6;
        col.fields = col.fields || col.Fields || [];
        normalizeFields(col.fields);
      });
      delete (f as any).fields;
      delete (f as any).Fields;
    }
  }

  function normalizeFields(fields: FormField[]): void {
    if (!fields) return;
    fields.forEach(function (f) { if (f != null) normalizeOneField(f); });
  }

  function normalizeSchema(): void {
    if (!config.schema) return;
    if (typeof config.schema === 'string') {
      try {
        config.schema = JSON.parse(config.schema as any);
      } catch (_schemaError) {
        console.error('[MegaFormRenderer] Failed to parse schema JSON string', _schemaError);
        config.schema = {};
      }
    }
    if (!config.schema || typeof config.schema !== 'object') config.schema = {};
    var s = config.schema as any;
    if (s.Fields && !s.fields) s.fields = s.Fields;
    if (s.Settings && !s.settings) s.settings = s.Settings;
    if (s.Translations && !s.translations) s.translations = s.Translations;
    s.settings = s.settings || {};

    // Normalise PascalCase aliases
    s.settings.customHtml = s.settings.customHtml || s.settings.CustomHtml || '';
    s.settings.customCss  = s.settings.customCss  || s.settings.CustomCss  || '';
    s.settings.customContent = s.settings.customContent || s.settings.CustomContent || {};
    s.settings.defaultLanguage = s.settings.defaultLanguage || s.settings.DefaultLanguage || '';
    s.settings.supportedLanguages = s.settings.supportedLanguages || s.settings.SupportedLanguages || [];
    if (!s.settings.customContent || typeof s.settings.customContent !== 'object') s.settings.customContent = {};
    s.customScripts = s.customScripts || s.CustomScripts || s.settings.customScripts || s.settings.CustomScripts || {};
    if (!s.customScripts || typeof s.customScripts !== 'object') s.customScripts = {};
    s.CustomScripts = s.customScripts;

    // ── Merge settingsJson (authoritative after SaveTheme) ────────────────
    // settingsJson is always updated by SaveTheme; schema.settings.customCss
    // may be stale. Platforms pass settingsJson raw — renderer resolves here
    // so DNN / Web / Oqtane shells don't need to duplicate this logic.
    var sj: any = null;
    if (config.settingsJson) {
      try {
        sj = typeof config.settingsJson === 'string'
          ? JSON.parse(config.settingsJson)
          : config.settingsJson;
      } catch { sj = null; }
    }
    if (sj) {
      // Always prefer settingsJson — it is the most recently written source
      if (sj.customCss || sj.CustomCss) {
        s.settings.customCss = sj.customCss || sj.CustomCss;
        s.settings.CustomCss = s.settings.customCss;
      }
      if (sj.theme || sj.Theme) {
        s.settings.theme = sj.theme || sj.Theme;
        s.settings.Theme = s.settings.theme;
      }
      if (sj.themeCssOverrides) {
        s.settings.themeCssOverrides = sj.themeCssOverrides;
      }
      if (sj.productionMode !== undefined || sj.ProductionMode !== undefined) {
        s.settings.productionMode = sj.productionMode !== undefined ? sj.productionMode : sj.ProductionMode;
        s.settings.ProductionMode = s.settings.productionMode;
      }
      if (sj.trialFooterText || sj.TrialFooterText) {
        s.settings.trialFooterText = sj.trialFooterText || sj.TrialFooterText;
        s.settings.TrialFooterText = s.settings.trialFooterText;
      }
      // Post-submit + success text are canonicalized server-side by RenderModelResolver.
      // Keep renderer thin here: hosts should pass resolved schema/settings, not rely on
      // client-side merges for submit button or post-submit behavior.
    }

    // ── Apply themeJson CSS vars (mf-theme-overrides) ────────────────────
    // Platforms inject themeJson; renderer handles the style tag so each
    // platform shell doesn't have to duplicate the applyTheme() function.
    var tj: any = null;
    var tjSource = config.themeJson || config.theme;
    if (tjSource) {
      try {
        tj = typeof tjSource === 'string' ? JSON.parse(tjSource as string) : tjSource;
      } catch { tj = null; }
    }
    if (tj) {
      var themeId: string = tj.theme || tj.Theme || '';
      var overrides: Record<string, string> = tj.cssOverrides || tj.CssOverrides || {};
      var themeCss: string = tj.customCss || tj.CustomCss || '';

      // 1. Load megaform-themes.css if needed
      if (themeId && themeId !== 'default' && !document.querySelector('link[href*="megaform-themes"]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        // Detect base path from an existing megaform link
        var anyMfLink = document.querySelector<HTMLLinkElement>('link[href*="megaform.css"]');
        var basePath = anyMfLink ? anyMfLink.href.replace(/megaform\.css.*$/, '') : '/megaform/css/';
        link.href = basePath + 'megaform-themes.css';
        document.head.appendChild(link);
      }

      // 2. Inject CSS var overrides into mf-theme-overrides
      var overrideKeys = Object.keys(overrides);
      if (overrideKeys.length > 0 || themeCss) {
        var existingOvr = document.getElementById('mf-theme-overrides');
        if (!existingOvr) {
          var ovrStyle = document.createElement('style');
          ovrStyle.id = 'mf-theme-overrides';
          var vars = overrideKeys.map(function(k) { return k + ':' + overrides[k]; }).join(';');
          var cssText = vars
            ? ':root{' + vars + '} .mf-form-wrapper{' + vars + '} [class*="mf-theme-"]{' + vars + '}'
            : '';
          if (themeCss) cssText += '\n' + themeCss;
          ovrStyle.textContent = cssText;
          document.head.appendChild(ovrStyle);
        }
      }

      // 3. Store theme class in schema so wrapper gets correct class
      if (themeId && s.settings) s.settings.theme = themeId;
    }

    if (s.fields) normalizeFields(s.fields);
  }

  // ═══════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════

  function readRequestedFormIdFromUrl(): number {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var raw = String(params.get('formId') || params.get('formid') || params.get('FormId') || '').trim();
      if (!raw) return 0;
      var direct = parseInt(raw, 10);
      if (isFinite(direct) && direct > 0) return direct;
      var digits = raw.replace(/\D+/g, '');
      var parsed = parseInt(digits, 10);
      return isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch (_error) {
      return 0;
    }
  }

  function getEffectiveSubmissionFormId(): number {
    var configured = Number(config && config.formId) > 0 ? Number(config.formId) : 0;
    if (configured > 0) {
      try { void RENDERER_SUBMIT_TARGET_BADGE; } catch (_error) { }
      return configured;
    }
    var requested = readRequestedFormIdFromUrl();
    return requested > 0 ? requested : 0;
  }

  function isHostedEmbedMode(): boolean {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var raw = String(params.get('embed') || '').toLowerCase();
      return raw === '1' || raw === 'true' || raw === 'yes';
    } catch (_error) {
      return false;
    }
  }

  function postHostedEmbedResize(formId: number): void {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
    try {
      var h = Math.max(
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.offsetHeight : 0,
        document.body ? document.body.offsetHeight : 0
      );
      window.parent.postMessage({ type: 'mf:resize', height: h, formId: formId, badge: CHROMELESS_EMBED_HOST_BADGE }, '*');
    } catch (_error) {
    }
  }

  function startHostedEmbedResize(shell: HTMLElement): void {
    postHostedEmbedResize(config.formId || 0);
    window.setTimeout(function(){ postHostedEmbedResize(config.formId || 0); }, 0);
    window.setTimeout(function(){ postHostedEmbedResize(config.formId || 0); }, 250);
    window.setTimeout(function(){ postHostedEmbedResize(config.formId || 0); }, 1000);
    window.addEventListener('load', function(){ postHostedEmbedResize(config.formId || 0); });
    window.addEventListener('resize', function(){ postHostedEmbedResize(config.formId || 0); });
    if (typeof MutationObserver !== 'undefined') {
      try {
        new MutationObserver(function(){ postHostedEmbedResize(config.formId || 0); }).observe(shell, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
      } catch (_error) {
      }
    }
  }

  function activateHostedEmbedMode(mountEl: HTMLElement | null): void {
    if (!isHostedEmbedMode()) return;
    var shell = (mountEl && (mountEl.closest('.mf-form-wrapper') as HTMLElement | null)) ||
                (mountEl && (mountEl.closest('.mf-view-container') as HTMLElement | null)) ||
                mountEl ||
                document.querySelector<HTMLElement>('.mf-form-wrapper, .mf-view-container, [id^="mf-form-wrapper-"]');
    if (!shell) return;

    if (!document.getElementById('mf-embed-host-style')) {
      var style = document.createElement('style');
      style.id = 'mf-embed-host-style';
      style.textContent =
        'html.mf-embed-host-route,body.mf-embed-host-route{margin:0!important;padding:0!important;background:transparent!important;overflow-x:hidden!important;min-height:100%!important;}' +
        'body.mf-embed-host-route > *:not([data-mf-embed-shell]):not(script):not(style):not(link){display:none!important;}' +
        '#personaBar-iframe,.personaBarContainer,#ctl01_PersonaBarPanel,[id*="personaBar"],[class*="personaBar"]{display:none!important;width:0!important;min-width:0!important;}' +
        '[data-mf-embed-shell]{display:block!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;border:0!important;}' +
        '[data-mf-embed-shell] .mf-form-wrapper,[data-mf-embed-shell].mf-form-wrapper{margin:0!important;max-width:100%!important;}' +
        '[data-mf-embed-shell] .mf-form-inner{padding:0!important;}' +
        '[data-mf-embed-shell] .mf-embed-footer{display:none!important;}';
      document.head.appendChild(style);
    }

    document.documentElement.classList.add('mf-embed-host-route');
    if (document.body) {
      document.body.classList.add('mf-embed-host-route');
      document.body.style.overflowX = 'hidden';
      if (shell.parentElement !== document.body) document.body.appendChild(shell);
    }
    shell.setAttribute('data-mf-embed-shell', '1');
    void CHROMELESS_EMBED_HOST_BADGE;
    startHostedEmbedResize(shell);
  }



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

  function init(cfg: RendererConfig): void {
    config = cfg;
    // Support legacy apiBase alias
    if (!config.apiBaseUrl && config.apiBase) config.apiBaseUrl = config.apiBase;
    normalizeSchema();
    if (!config.schema || !config.schema.fields) return;

    var settings = (config.schema.settings || {}) as any;
    config.locale = String(config.locale || settings.defaultLanguage || settings.DefaultLanguage || document.documentElement.getAttribute('data-mf-locale') || 'en-US');
    document.documentElement.setAttribute('data-mf-locale', String(config.locale));
    if (document.body) document.body.setAttribute('data-mf-locale', String(config.locale));
    applyLocaleToSchema(config.locale);
    settings = (config.schema.settings || {}) as any;

    formData = (config.prefilledData as Record<string, unknown>) || {};

    // Auto-prefill from URL parameters
    var urlParams = new URLSearchParams(window.location.search);
    flattenFields(config.schema.fields).forEach(function (f: FormField) {
      if (f.type === 'Row') return;
      if (urlParams.has(f.key) && !formData[f.key]) formData[f.key] = urlParams.get(f.key)!;
      if (f.prefillParam && urlParams.has(f.prefillParam) && !formData[f.key]) formData[f.key] = urlParams.get(f.prefillParam)!;
    });

    // Build DOM skeleton — always in custom-html-mode since all forms use customHtml
    var mountSelector = config.container;
    var mountEl: HTMLElement | null = null;
    if (mountSelector) {
      mountEl = typeof mountSelector === 'string'
        ? document.querySelector<HTMLElement>(mountSelector)
        : mountSelector;
    }
    if (mountEl) {
      mountEl.setAttribute('data-render-core-badge', RENDER_CORE_BRIDGE_BADGE);
      mountEl.setAttribute('data-placeholder-bridge-badge', PLACEHOLDER_BRIDGE_BADGE);
      buildSkeleton(mountEl, config.formId, config.submitButtonText, !!(settings.customHtml && String(settings.customHtml).trim()), String(config.title || ''), String(config.description || ''));
    }
    activateHostedEmbedMode(mountEl);

    // Custom HTML mode trims chrome, but standard forms keep the default shell.
    var wrapper = document.getElementById('mf-form-wrapper-' + config.formId);
    maybeActivatePopupMode(wrapper);
    if (wrapper && settings.customHtml && String(settings.customHtml).trim()) {
      wrapper.classList.add('mf-custom-html-mode');
      var header  = wrapper.querySelector<HTMLElement>('.mf-form-header');
      var footer  = wrapper.querySelector<HTMLElement>('.mf-embed-footer');
      if (header)  header.style.display  = 'none';
      if (footer)  footer.style.display  = 'none';
    }

    console.log('MegaForm: rendering', config.schema.fields.length, 'fields');

    calculatePages();
    syncMultiStepShellMode(!!(settings.customHtml && String(settings.customHtml).trim()) && totalPages > 1);
    renderFields();
    buildStepIndicator();
    updateNavigation();
    bindNavigation();
    bindSubmit();
    bindInteractiveElements();
    bindRuleEngine();
    bindSaveDraft();
    bindFieldErrorClear();
    updateTrialSubmitNote();

    var W = (window as any).MegaFormWidgets;
    if (W && W.bindWidgets) W.bindWidgets(config.formId);
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE CALCULATION
  // ═══════════════════════════════════════════════════════════
  function calculatePages(): void {
    fieldPages = [[]];
    var fields = config.schema!.fields!;

    fields.forEach(function (f: FormField) {
      if (!f.properties && (f as any).Properties) f.properties = (f as any).Properties;
      if (f.properties) {
        if ((f.properties as any).PageBreak !== undefined && (f.properties as any).pageBreak === undefined) {
          (f.properties as any).pageBreak = (f.properties as any).PageBreak;
        }
      }
    });

    var hasPageBreak = fields.some(function (f: FormField) {
      return f.type === 'Section' && f.properties && (f.properties as any).pageBreak;
    });
    var hasPageIndex = fields.some(function (f: FormField) {
      return Number((f as any).pageIndex ?? (f as any).PageIndex ?? 0) > 0;
    });

    if (!hasPageBreak && hasPageIndex) {
      var indexedPages: FormField[][] = [];
      fields.forEach(function (f: FormField) {
        var pageIndex = Number((f as any).pageIndex ?? (f as any).PageIndex ?? 0);
        if (!Number.isFinite(pageIndex) || pageIndex < 0) pageIndex = 0;
        while (indexedPages.length <= pageIndex) indexedPages.push([]);
        indexedPages[pageIndex].push(f);
      });
      fieldPages = indexedPages.filter(function (page) { return page && page.length > 0; });
      if (!fieldPages.length) fieldPages = [fields.slice()];
      totalPages = fieldPages.length;
      currentPage = 0;
      console.log('MegaForm: calculatePages → totalPages=' + totalPages + ', pageIndexFallback=true');
      return;
    }

    var multiPage = config.schema!.settings && (config.schema!.settings as any).multiPage;
    if (multiPage && !hasPageBreak) {
      var sectionCount = 0;
      fields.forEach(function (f: FormField) {
        if (f.type === 'Section') {
          sectionCount++;
          if (!f.properties) f.properties = {};
          (f.properties as any).pageBreak = sectionCount > 1;
        }
      });
      hasPageBreak = sectionCount > 1;
    }

    if (hasPageBreak) {
      fields.forEach(function (f: FormField) {
        if (f.type === 'Section' && f.properties && (f.properties as any).pageBreak) fieldPages.push([]);
        fieldPages[fieldPages.length - 1].push(f);
      });
    } else {
      fieldPages[0] = fields.slice();
    }
    totalPages = fieldPages.length;
    currentPage = 0;
    console.log('MegaForm: calculatePages → totalPages=' + totalPages + ', hasPageBreak=' + hasPageBreak);
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER FIELDS
  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  //  DEFAULT customHtml GENERATOR
  //  Called when schema has no customHtml — generates a clean
  //  single-column layout so ALL forms go through renderCustomHtml.
  // ═══════════════════════════════════════════════════════════
  function generateDefaultCustomHtml(fields: FormField[]): string {
    var tokens = fields.map(function (f: FormField) {
      if (f.type === 'Hidden') return '';
      return '    {{field:' + f.key + '}}';
    }).filter(Boolean).join('\n');

    return (
      '<div class="mfp mfp-default">\n' +
      '  <div class="mfp-default-header">\n' +
      '    <h1>{{form:title}}</h1>\n' +
      '    <p>{{form:description}}</p>\n' +
      '  </div>\n' +
      '  <div class="mfp-default-body">\n' +
      tokens + '\n' +
      '    <div class="mfp-actions">\n' +
      '      <button type="submit">{{form:submit}}</button>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '</div>'
    );
  }

  function renderFields(): void {
    var container = document.getElementById('mf-fields-container-' + config.formId);
    if (!container) return;
    container.innerHTML = '';
    customHtmlHasOwnSubmit = false;

    var settings = (config.schema!.settings || {}) as SchemaSettings;
    if (settings.customHtml && String(settings.customHtml).trim()) {
      renderCustomHtml(container, settings);
      return;
    }

    renderStandardFields(container);
  }

  function isMultiStepCustomHtmlMode(): boolean {
  const settings = (config.schema!.settings || {}) as any;
  return !!(settings.customHtml && String(settings.customHtml).trim()) && totalPages > 1;
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

function renderStandardFields(container: HTMLElement): void {
    fieldPages.forEach(function (pageFields: FormField[], pageIdx: number) {
      var pageDiv = document.createElement('div');
      pageDiv.className = 'mf-page';
      pageDiv.id = 'mf-page-' + config.formId + '-' + pageIdx;
      pageDiv.style.display = pageIdx === currentPage ? '' : 'none';

      pageFields.forEach(function (field: FormField) {
        if (field.type === 'Hidden') {
          pageDiv.innerHTML += '<input type="hidden" name="' + esc(field.key) + '" value="' + esc(String(field.defaultValue || formData[field.key] || '')) + '">';
          return;
        }
        if (field.type === 'Row' && field.columns) {
          pageDiv.appendChild(renderRowElement(field));
          return;
        }
        pageDiv.appendChild(renderSingleFieldElement(field));
      });

      container.appendChild(pageDiv);
    });
    bindConditionalLogic(container);
  }

  function cleanupManagedCustomScripts(formId: number): void {
    var bucketKey = String(formId || 0);
    var bucket = customScriptCleanupRegistry[bucketKey] || [];
    bucket.forEach(function (cleanup) {
      try { cleanup(); } catch (err) { console.warn('[MegaForm] managed script cleanup failed', err); }
    });
    customScriptCleanupRegistry[bucketKey] = [];
  }

  function registerManagedCustomScriptCleanup(formId: number, cleanup: unknown): void {
    if (Array.isArray(cleanup)) {
      cleanup.forEach(function (fn) { registerManagedCustomScriptCleanup(formId, fn); });
      return;
    }
    if (typeof cleanup !== 'function') return;
    var bucketKey = String(formId || 0);
    if (!customScriptCleanupRegistry[bucketKey]) customScriptCleanupRegistry[bucketKey] = [];
    customScriptCleanupRegistry[bucketKey].push(cleanup as () => void);
  }

  function resolveManagedScriptRoot(anchor: HTMLElement, key: string, container: HTMLElement): HTMLElement {
    var exact = anchor.closest('[data-mf-script-root="' + key.replace(/"/g, '&quot;') + '"]') as HTMLElement | null;
    if (exact) return exact;
    var generic = anchor.closest('[data-mf-script-root]') as HTMLElement | null;
    if (generic) return generic;
    return (anchor.parentElement || container);
  }


  function getThemePresetMeta(settings: SchemaSettings | undefined | null): any {
    var raw: any = (settings && (((settings as any).themeSelector) || ((settings as any).ThemeSelector))) || null;
    if (!raw || typeof raw !== 'object') return null;
    var enabledRaw = raw.enabled == null ? raw.Enabled : raw.enabled;
    var enabled = enabledRaw == null ? true : !!enabledRaw;
    if (!enabled) return null;
    var presetsRaw: any = raw.presets || raw.Presets || null;
    var presetCount = 0;
    if (presetsRaw && typeof presetsRaw === 'object') {
      try { presetCount = Object.keys(presetsRaw).length; } catch (_presetCountErr) { presetCount = 0; }
    }
    return {
      enabled: enabled,
      mode: String(raw.mode || raw.Mode || 'module-controlled').toLowerCase(),
      scriptKey: String(raw.scriptKey || raw.ScriptKey || 'theme_selector').trim() || 'theme_selector',
      presetSet: String(raw.presetSet || raw.PresetSet || '').trim(),
      defaultThemeKey: String(raw.defaultThemeKey || raw.DefaultThemeKey || '').trim(),
      presetCount: presetCount,
      hasPresetMap: presetCount > 0,
      showUpdateThemeButton: raw.showUpdateThemeButton == null
        ? (raw.ShowUpdateThemeButton == null ? true : !!raw.ShowUpdateThemeButton)
        : !!raw.showUpdateThemeButton
    };
  }

  function dispatchThemePresetState(detail: Record<string, unknown>): void {
    try {
      window.dispatchEvent(new CustomEvent('mf:theme-preset-state', { detail: detail }));
    } catch (_eventErr) { }
  }

  function createThemePresetRuntime(settings: SchemaSettings | undefined | null, key: string): any {
    var meta = getThemePresetMeta(settings);
    if (!meta || String(meta.scriptKey || 'theme_selector') !== String(key || '')) return null;
    var platform: any = (window as any).__MF_PLATFORM__ || {};
    var savedThemeKey = String(platform.presetThemeKey || meta.defaultThemeKey || (((settings as any) && ((settings as any).theme || (settings as any).Theme)) || '') || '').trim();
    var activeThemeKey = savedThemeKey;
    var selectorEnabled = !!platform.allowThemePresetSelector && !config.isPreview;
    function emit(extra?: Record<string, unknown>): void {
      var detail: any = {
        badge: THEME_PRESET_BRIDGE_BADGE,
        formId: config.formId,
        moduleId: Number(platform.moduleId || 0) || 0,
        hasSelector: true,
        selectorEnabled: selectorEnabled,
        presetSet: meta.presetSet || '',
        presetCount: Number(meta.presetCount || 0) || 0,
        hasPresetMap: !!meta.hasPresetMap,
        scriptKey: meta.scriptKey || 'theme_selector',
        defaultThemeKey: meta.defaultThemeKey || '',
        savedThemeKey: savedThemeKey || '',
        activeThemeKey: activeThemeKey || '',
        selectedThemeKey: activeThemeKey || '',
        showUpdateThemeButton: !!meta.showUpdateThemeButton,
        dirty: !!(activeThemeKey && savedThemeKey && activeThemeKey !== savedThemeKey)
      };
      if (extra && typeof extra === 'object') {
        Object.keys(extra).forEach(function (name) { detail[name] = (extra as any)[name]; });
      }
      dispatchThemePresetState(detail);
    }
    return {
      badge: THEME_PRESET_BRIDGE_BADGE,
      formId: config.formId,
      moduleId: Number(platform.moduleId || 0) || 0,
      hasSelector: true,
      selectorEnabled: selectorEnabled,
      presetSet: meta.presetSet || '',
      presetCount: Number(meta.presetCount || 0) || 0,
      hasPresetMap: !!meta.hasPresetMap,
      scriptKey: meta.scriptKey || 'theme_selector',
      defaultThemeKey: meta.defaultThemeKey || '',
      savedThemeKey: savedThemeKey || '',
      activeThemeKey: activeThemeKey || '',
      showUpdateThemeButton: !!meta.showUpdateThemeButton,
      getActiveThemeKey: function (): string { return activeThemeKey || savedThemeKey || meta.defaultThemeKey || ''; },
      setActiveThemeKey: function (nextKey: unknown, dirty: unknown): void {
        activeThemeKey = String(nextKey == null ? '' : nextKey).trim();
        emit({ activeThemeKey: activeThemeKey || '', selectedThemeKey: activeThemeKey || '', dirty: dirty == null ? true : !!dirty });
      },
      reportAvailable: function (extra?: Record<string, unknown>): void {
        emit(extra || {});
      }
    };
  }

  function injectManagedCustomScripts(container: HTMLElement, scripts: Record<string, unknown>, settings?: SchemaSettings | null): void {
    if (!scripts || typeof scripts !== 'object') return;
    var anchors = Array.from(container.querySelectorAll('[data-mf-script-key]')) as HTMLElement[];
    if (!anchors.length) return;
    anchors.forEach(function (anchor: HTMLElement) {
      var key = String(anchor.getAttribute('data-mf-script-key') || '').trim();
      if (!key) return;
      var code = scripts[key];
      if (typeof code !== 'string' || !String(code).trim()) return;
      var safeKey = key.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'inline';
      var root = resolveManagedScriptRoot(anchor, key, container);
      var ctx: any = {
        badge: CUSTOM_SCRIPT_RENDERER_BADGE,
        formId: config.formId,
        key: key,
        anchor: anchor,
        container: container,
        isPreview: !!config.isPreview,
        registerCleanup: function (cleanup: unknown): void {
          registerManagedCustomScriptCleanup(config.formId, cleanup);
        }
      };
      var themePreset = createThemePresetRuntime(settings || null, key);
      if (themePreset) {
        ctx.themePreset = themePreset;
        try { themePreset.reportAvailable({ dirty: false, selectedThemeKey: themePreset.getActiveThemeKey ? themePreset.getActiveThemeKey() : (themePreset.activeThemeKey || '') }); } catch (_themePresetErr) { }
      }
      try {
        (window as any).__mfCurrentScriptRoot = root;
        (window as any).__mfCurrentScriptAnchor = anchor;
        (window as any).__mfScriptContext = ctx;
        var scriptEl = document.createElement('script');
        scriptEl.type = 'text/javascript';
        scriptEl.setAttribute('data-mf-managed-script', key);
        scriptEl.setAttribute('data-mf-script-badge', CUSTOM_SCRIPT_RENDERER_BADGE);
        scriptEl.text = '(function(){try{\n' + String(code) + '\n}catch(__mfCustomScriptErr){console.error("[MegaForm] Custom script ' + safeKey + ' failed", __mfCustomScriptErr);}})();\n//# sourceURL=megaform-custom-script-' + safeKey + '.js';
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


  function applyInlineLayoutGuard(el: HTMLElement, styles: Record<string, string>): void {
    try {
      Object.keys(styles).forEach(function (name: string) {
        el.style.setProperty(name, styles[name], 'important');
      });
      el.setAttribute('data-mf-layout-guard', RENDER_LAYOUT_GUARD_BADGE);
    } catch (_e) { }
  }

  function repairCustomTemplateLayout(container: HTMLElement): void {
    try {
      var wrapper = document.getElementById('mf-form-wrapper-' + config.formId) as HTMLElement | null;
      if (wrapper) wrapper.setAttribute('data-render-layout-guard', RENDER_LAYOUT_GUARD_BADGE);
      (Array.from(container.querySelectorAll('.mfp-brand-header')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'flex-start',
          'flex-wrap': 'nowrap',
          gap: '12px',
          'text-align': 'left',
          'writing-mode': 'horizontal-tb',
          'text-orientation': 'mixed'
        });
      });
      (Array.from(container.querySelectorAll('.mfp-brand-text')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'flex-start',
          'justify-content': 'center',
          'flex-wrap': 'nowrap',
          flex: '0 1 auto',
          'min-width': '0',
          width: 'auto',
          'text-align': 'left',
          'writing-mode': 'horizontal-tb',
          'text-orientation': 'mixed'
        });
      });
      (Array.from(container.querySelectorAll('.mfp-brand-title, .mfp-brand-subtitle')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'block',
          width: 'auto',
          'text-align': 'left',
          'writing-mode': 'horizontal-tb',
          'text-orientation': 'mixed',
          'white-space': 'normal'
        });
      });
      (Array.from(container.querySelectorAll('.mfp-form-header')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'block',
          'text-align': 'center',
          'writing-mode': 'horizontal-tb',
          'text-orientation': 'mixed'
        });
      });
      (Array.from(container.querySelectorAll('.mfp-form-title, .mfp-form-desc')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'block',
          width: 'auto',
          'text-align': 'center',
          'writing-mode': 'horizontal-tb',
          'text-orientation': 'mixed',
          'white-space': 'normal'
        });
      });
      (Array.from(container.querySelectorAll('.mfp-section-title')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'flex-start',
          'flex-wrap': 'nowrap',
          gap: '10px',
          'text-align': 'left',
          'writing-mode': 'horizontal-tb',
          'text-orientation': 'mixed'
        });
      });
      (Array.from(container.querySelectorAll('.mfp-section-icon')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'inline-flex',
          'align-items': 'center',
          'justify-content': 'center',
          flex: '0 0 auto',
          width: el.style.width || '20px',
          height: el.style.height || '20px'
        });
      });
      (Array.from(container.querySelectorAll('.mfp-section-icon svg, .mfp-brand-logo svg')) as HTMLElement[]).forEach(function (el: HTMLElement) {
        applyInlineLayoutGuard(el, {
          display: 'block',
          width: '100%',
          height: '100%'
        });
      });
    } catch (err) {
      console.warn('[MegaForm] repairCustomTemplateLayout failed', err);
    }
  }

  function renderCustomHtml(container: HTMLElement, settings: SchemaSettings): void {
    // DO NOT add 'mfp' to .mf-fields-container — it inherits display:flex from the
    // renderer CSS, which stretches and breaks custom HTML template layouts.
    // The template's own .mfp root element handles its internal layout.
    // if (!container.classList.contains('mfp')) container.classList.add('mfp');

    // Apply theme class to the outer form wrapper so CSS vars cascade into the template
    var themeId = (settings as any).theme || (settings as any).Theme || '';
    if (themeId && themeId !== 'default') {
      var wrapper = document.getElementById('mf-form-wrapper-' + config.formId);
      if (wrapper) {
        // Remove any stale theme class first
        var prev = Array.prototype.slice.call(wrapper.classList)
          .filter(function(c: string) { return c.indexOf('mf-theme-') === 0; });
        prev.forEach(function(c: string) { wrapper!.classList.remove(c); });
        wrapper.classList.add('mf-theme-' + themeId);
      }
    }

    if (settings.customCss) {
      var styleId = 'mf-custom-css-' + config.formId;
      var oldStyle = document.getElementById(styleId);
      if (oldStyle) oldStyle.remove();
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = settings.customCss;
      document.head.appendChild(style);
    }

    var formTitle = String(config.title || '').trim();
    var formDescription = String(config.description || '').trim();
    var formSubmit = String(config.submitButtonText || tr('form.submit', 'Submit')).trim();

    cleanupManagedCustomScripts(config.formId);
    var customContent = ((settings.customContent || (settings as any).CustomContent || {}) as Record<string, unknown>);
    var customScripts = ((((config.schema as any) && (((config.schema as any).customScripts || (config.schema as any).CustomScripts))) || (settings as any).customScripts || (settings as any).CustomScripts || {}) as Record<string, unknown>);
    var html = (settings.customHtml as string)
      .replace(/<form[^>]*>/gi, '<div class="mfp-form-inner">')
      .replace(/<\/form>/gi, '</div>');

    html = html
      .replace(/\{\{form:title\}\}/gi, esc(formTitle))
      .replace(/\{\{form:description\}\}/gi, esc(formDescription))
      .replace(/\{\{form:submit\}\}/gi, esc(formSubmit))
      .replace(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g, function (_: string, key: string) {
        return esc(String((customContent as any)[key] || ''));
      })
      .replace(/\{\{script:([a-zA-Z0-9_-]+)\}\}/g, function (_: string, key: string) {
        return '<span class="mf-script-anchor" data-mf-script-key="' + esc(String(key)) + '" data-mf-script-badge="' + CUSTOM_SCRIPT_RENDERER_BADGE + '" style="display:none !important;"></span>';
      });

    var fieldMap: Record<string, FormField> = {};
    config.schema!.fields!.forEach(function (f: FormField) {
      fieldMap[f.key] = f;
      if (f.type === 'Row' && f.columns) {
        f.columns.forEach(function (col: ColumnDef) {
          (col.fields || []).forEach(function (cf: FormField) { fieldMap[cf.key] = cf; });
        });
      }
    });

    var presentTokens = new Set<string>();
    (html.match(/\{\{field:[a-zA-Z0-9_]+\}\}/g) || []).forEach(function (token: string) {
      var match = token.match(/\{\{field:([a-zA-Z0-9_]+)\}\}/);
      if (match && match[1]) presentTokens.add(match[1]);
    });

    var pageStartKeyToIndex = new Map<string, number>();
    var sectionPageBreakKeyToIndex = new Map<string, number>();
    function findPreferredPageStartKey(pageFields: FormField[]): string | null {
      for (var pageFieldIndex = 0; pageFieldIndex < pageFields.length; pageFieldIndex++) {
        var pageField = pageFields[pageFieldIndex];
        if (!pageField) continue;
        if (pageField.type === 'Section' && pageField.properties && (pageField.properties as any).pageBreak && presentTokens.has(pageField.key)) {
          return pageField.key;
        }
      }
      return findFirstRenderableKey(pageFields);
    }
    function findFirstRenderableKey(pageFields: FormField[]): string | null {
      for (var pfIndex = 0; pfIndex < pageFields.length; pfIndex++) {
        var pf = pageFields[pfIndex];
        if (pf.type === 'Hidden') continue;
        if (presentTokens.has(pf.key)) return pf.key;
        if (pf.type === 'Row' && pf.columns) {
          for (var colIndex = 0; colIndex < pf.columns.length; colIndex++) {
            var col = pf.columns[colIndex];
            var colFields = col.fields || [];
            for (var cfIndex = 0; cfIndex < colFields.length; cfIndex++) {
              var cf = colFields[cfIndex];
              if (presentTokens.has(cf.key)) return cf.key;
            }
          }
        }
      }
      return null;
    }
    if (fieldPages.length > 0) {
      for (var pageIndex = 0; pageIndex < fieldPages.length; pageIndex++) {
        var pageFields = fieldPages[pageIndex] || [];
        var firstRenderableKey = findPreferredPageStartKey(pageFields);
        if (firstRenderableKey) pageStartKeyToIndex.set(firstRenderableKey, pageIndex);
        pageFields.forEach(function (pageField: FormField) {
          if (pageField && pageField.type === 'Section' && pageField.properties && (pageField.properties as any).pageBreak) {
            sectionPageBreakKeyToIndex.set(pageField.key, pageIndex);
          }
        });
      }
    }

    html = html.replace(/\{\{field:([a-zA-Z0-9_]+)\}\}/g, function (_: string, key: string) {
      var field = fieldMap[key];
      if (!field) return '<div style="color:#ef4444;font-size:12px;">Field "' + esc(key) + '" not found</div>';

      var sectionPageIndex = sectionPageBreakKeyToIndex.has(key) ? sectionPageBreakKeyToIndex.get(key) : undefined;
      var pageAnchorPrefix = pageStartKeyToIndex.has(key) ? '<span class="mf-page-anchor" data-mf-page-anchor="' + pageStartKeyToIndex.get(key) + '" data-mf-anchor-key="' + esc(key) + '" data-mf-page-badge="' + PAGE_BREAK_START_BADGE + '" style="display:none !important;"></span>' : '';
      var sectionPageAnchor = sectionPageIndex !== undefined ? '<span class="mf-page-anchor" data-mf-page-anchor="' + sectionPageIndex + '" data-mf-page-break-key="' + esc(field.key || '') + '" style="display:none !important;"></span>' : '';

      if (field.type === 'Section' && field.properties && (field.properties as any).pageBreak) {
        return pageAnchorPrefix + sectionPageAnchor + '<div class="mf-page-anchor" data-mf-page-break-key="' + esc(field.key || '') + '" hidden></div>';
      }
      if (field.type === 'Hidden') return pageAnchorPrefix + '<input type="hidden" name="' + esc(field.key) + '" value="' + esc(String(field.defaultValue || formData[field.key] || '')) + '">';
      if (field.type === 'Section') return pageAnchorPrefix + '<div class="mf-field-group" data-key="' + esc(field.key) + '" data-type="Section"><div class="mf-section-break"><div class="mf-section-title">' + esc(field.label) + '</div></div></div>';
      if (field.type === 'Html') return pageAnchorPrefix + '<div class="mf-field-group" data-key="' + esc(field.key) + '" data-type="Html"><div class="mf-html-block">' + (field.htmlContent || '') + '</div></div>';

      if (field.type === 'Row' && field.columns) {
        var colTpl = field.columns.map(function (c: ColumnDef) { return (c.span || 6) + 'fr'; }).join(' ');
        var rowShowIfAttr = field.showIf ? ' data-show-if="' + esc(JSON.stringify(field.showIf)) + '"' : '';
        var rowShowIfStyle = field.showIf && !evaluateCondition(field.showIf) ? ' style="display:none"' : '';
        var rowH = '<div class="mf-field-group mf-field-group--row" data-key="' + field.key + '" data-type="Row"' + rowShowIfAttr + rowShowIfStyle + '>';
        rowH += '<div class="mf-row" style="display:grid;grid-template-columns:' + colTpl + ';gap:var(--mf-field-gap,20px);margin-bottom:var(--mf-field-gap,20px);width:100%;" data-row-width-badge="' + ROW_FULL_WIDTH_BADGE + '">';
        field.columns.forEach(function (col: ColumnDef) {
          rowH += '<div class="mf-row-column">';
          (col.fields || []).forEach(function (cf: FormField) {
            var W = (window as any).MegaFormWidgets;
            var isWc = W && W.widgetTypes && W.widgetTypes[cf.type];
            var sfAttr = cf.showIf ? ' data-show-if="' + esc(JSON.stringify(cf.showIf)) + '"' : '';
            var sfStyle = cf.showIf && !evaluateCondition(cf.showIf) ? ' style="display:none"' : '';
            rowH += '<div class="mf-field-group" data-key="' + cf.key + '" data-type="' + cf.type + '"' + sfAttr + sfStyle + '>';
            if (!isWc) rowH += '<label class="mf-field-label" for="mf-' + config.formId + '-' + cf.key + '">' + esc(cf.label) + (cf.required ? ' <span class="mf-required">*</span>' : '') + '</label>';
            rowH += renderInput(cf);
            if (!isWc && cf.helpText) rowH += '<div class="mf-field-help">' + esc(cf.helpText) + '</div>';
            rowH += '<div class="mf-field-error" id="mf-err-' + cf.key + '"></div></div>';
          });
          rowH += '</div>';
        });
        rowH += '</div></div>';
        return pageAnchorPrefix + rowH;
      }

      var W2 = (window as any).MegaFormWidgets;
      var isW = W2 && W2.widgetTypes && W2.widgetTypes[field.type];
      var sfA = field.showIf ? ' data-show-if="' + esc(JSON.stringify(field.showIf)) + '"' : '';
      var sfS = field.showIf && !evaluateCondition(field.showIf) ? ' style="display:none"' : '';
      var h = '<div class="mf-field-group" data-key="' + field.key + '" data-type="' + field.type + '"' + sfA + sfS + '>';
      if (!isW) h += '<label class="mf-field-label" for="mf-' + config.formId + '-' + field.key + '">' + esc(field.label) + (field.required ? ' <span class="mf-required">*</span>' : '') + '</label>';
      h += renderInput(field);
      if (!isW && field.helpText) h += '<div class="mf-field-help">' + esc(field.helpText) + '</div>';
      h += '<div class="mf-field-error" id="mf-err-' + field.key + '"></div></div>';
      return pageAnchorPrefix + h;
    });

    config.schema!.fields!.forEach(function (field: FormField) {
      if (field.type === 'Hidden' && html.indexOf('{{field:' + field.key + '}}') === -1) {
        html += '<input type="hidden" name="' + esc(field.key) + '" value="' + esc(String(field.defaultValue || formData[field.key] || '')) + '">';
      }
    });

    var template = document.createElement('template');
    template.innerHTML = html;

    var domPageCount = 0;
    if (fieldPages.length > 1) domPageCount = wrapCustomHtmlPagesFromAnchors(template.content);

    if (domPageCount > 1) {
      totalPages = domPageCount;
      currentPage = 0;
      container.innerHTML = '';
      container.appendChild(template.content);
    } else {
      var hasMultiPage = html.indexOf('<!--MF_PAGE_BREAK-->') !== -1;
      if (hasMultiPage) {
        var pageParts = balancePageParts(html.split('<!--MF_PAGE_BREAK-->'));
        rebuildFieldPages(pageParts);
        totalPages = pageParts.length;
        currentPage = 0;
        container.innerHTML = pageParts.map(function (part: string, idx: number) {
          return '<div class="mf-page" id="mf-page-' + config.formId + '-' + idx + '" style="' + (idx > 0 ? 'display:none;' : '') + '">' + part + '</div>';
        }).join('');
      } else {
        fieldPages = [config.schema!.fields!.slice()];
        totalPages = 1;
        currentPage = 0;
        container.innerHTML = html;
      }
    }

    var detectedCustomSubmit = !!container.querySelector('button[type="submit"], input[type="submit"]');
    if (isMultiStepCustomHtmlMode()) {
      hideCustomHtmlSubmitBlocks(container);
      customHtmlHasOwnSubmit = false;
    } else {
      customHtmlHasOwnSubmit = detectedCustomSubmit;
    }
    updateTrialSubmitNote();
    bindConditionalLogic(container);
    injectManagedCustomScripts(container, customScripts, settings);
  }

  function getLowestCommonAncestor(elements: Element[]): Element | null {
    if (!elements.length) return null;
    var ancestor: Element | null = elements[0];
    while (ancestor) {
      var matchesAll = elements.every(function (el: Element) { return ancestor === el || ancestor!.contains(el); });
      if (matchesAll) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function getDirectChildUnderAncestor(ancestor: Element, node: Node): Node | null {
    var current: Node | null = node;
    while (current && current.parentNode && current.parentNode !== ancestor) current = current.parentNode;
    return current && current.parentNode === ancestor ? current : null;
  }

  function isIgnorableBoundarySibling(node: Node | null): boolean {
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE) return !String(node.textContent || '').trim();
    return false;
  }

  function isStaticPageHeadingNode(node: Node | null): boolean {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    var el = node as HTMLElement;
    if (el.hasAttribute('data-key')) return false;
    if (el.querySelector('[data-key], .mf-field-group, input, select, textarea, button')) return false;
    if (el.matches('[data-mf-page-heading], [data-section-heading], .section-heading, .mf-section-heading, .mf-section-title, h1, h2, h3, h4, h5, h6')) return true;
    if ((el.getAttribute('role') || '').toLowerCase() === 'heading') return true;
    var cls = String(el.className || '').toLowerCase();
    if (cls.indexOf('section-heading') >= 0 || cls.indexOf('page-heading') >= 0 || cls.indexOf('step-heading') >= 0) return true;
    return false;
  }

  function expandBoundaryToStaticHeading(splitContainer: Element, boundary: Node | null): Node | null {
    if (!boundary) return boundary;
    var current: Node | null = boundary;
    var prev: Node | null = current.previousSibling;
    while (isIgnorableBoundarySibling(prev)) {
      current = prev!;
      prev = current.previousSibling;
    }
    if (isStaticPageHeadingNode(prev)) {
      current = prev!;
      prev = current.previousSibling;
      while (isIgnorableBoundarySibling(prev)) {
        current = prev!;
        prev = current.previousSibling;
      }
    }
    return current;
  }

  function wrapCustomHtmlPagesFromAnchors(fragment: DocumentFragment): number {
    var anchors = Array.from(fragment.querySelectorAll('[data-mf-page-anchor], [data-mf-page-break-key]')) as HTMLElement[];
    if (!anchors.length) return 0;

    var splitContainer = getLowestCommonAncestor(anchors);
    if (!splitContainer) return 0;

    var startNodes = new Map<number, Node>();
    anchors
      .map(function (anchor: HTMLElement) {
        var directBoundary = getDirectChildUnderAncestor(splitContainer, anchor);
        return {
          anchor: anchor,
          pageIndex: Number(anchor.getAttribute('data-mf-page-anchor') || '-1'),
          boundary: expandBoundaryToStaticHeading(splitContainer, directBoundary)
        };
      })
      .filter(function (item) { return item.pageIndex >= 0 && !!item.boundary; })
      .sort(function (a, b) { return a.pageIndex - b.pageIndex; })
      .forEach(function (item) {
        if (!startNodes.has(item.pageIndex) && item.boundary) startNodes.set(item.pageIndex, item.boundary);
      });

    if (startNodes.size <= 1) {
      splitContainer.querySelectorAll('[data-mf-page-anchor], [data-mf-page-break-key]').forEach(function (a) { a.remove(); });
      return 0;
    }

    var originalChildren = Array.from(splitContainer.childNodes);
    var boundaryToPage = new Map<Node, number>();
    startNodes.forEach(function (node, pageIndex) { boundaryToPage.set(node, pageIndex); });

    var rebuiltChildren: Node[] = [];
    var activeWrapper: HTMLElement | null = null;
    originalChildren.forEach(function (child: Node) {
      var newPageIndex = boundaryToPage.get(child);
      if (newPageIndex !== undefined) {
        activeWrapper = document.createElement('div');
        activeWrapper.className = 'mf-page';
        activeWrapper.id = 'mf-page-' + config.formId + '-' + newPageIndex;
        if (newPageIndex > 0) activeWrapper.style.display = 'none';
        rebuiltChildren.push(activeWrapper);
      }
      if (activeWrapper) activeWrapper.appendChild(child);
      else rebuiltChildren.push(child);
    });

    while (splitContainer.firstChild) splitContainer.removeChild(splitContainer.firstChild);
    rebuiltChildren.forEach(function (child: Node) { splitContainer.appendChild(child); });
    splitContainer.querySelectorAll('[data-mf-page-anchor], [data-mf-page-break-key]').forEach(function (a) { a.remove(); });

    return startNodes.size;
  }

  // ═══════════════════════════════════════════════════════════
  //  INPUT RENDERING
  // ═══════════════════════════════════════════════════════════
  function getPlaceholderText(field: FormField, fallback?: string): string {
    var raw = field && field.placeholder != null ? String(field.placeholder).trim() : '';
    if (raw) return raw;
    return fallback || '';
  }

  function renderPlaceholderHint(field: FormField, fallback?: string, force?: boolean): string {
    var text = getPlaceholderText(field, fallback);
    if (!text) return '';
    if (!force) {
      var current = formData[field.key];
      var hasValue = !(current === undefined || current === null || current === '' || (Array.isArray(current) && current.length === 0));
      if (!hasValue && field.defaultValue) hasValue = true;
      if (hasValue) return '';
    }
    return '<div class="mf-field-placeholder-hint" style="margin-top:8px;padding:8px 10px;border:1px dashed #dbe4f0;border-radius:10px;background:#f8fbff;color:#64748b;font-size:12px;line-height:1.45;display:flex;align-items:flex-start;gap:8px;">' +
      '<i class="fas fa-circle-info" style="color:#94a3b8;margin-top:1px;"></i>' +
      '<span style="flex:1;min-width:0;">' + esc(text) + '</span>' +
      '</div>';
  }

  function renderInput(field: FormField): string {
    var id   = 'mf-' + config.formId + '-' + field.key;
    var name = field.key;
    var val  = String(formData[field.key] != null ? formData[field.key] : (field.defaultValue || ''));
    var ph   = field.placeholder || '';
    var ro   = field.readOnly ? ' readonly disabled' : '';
    var req  = field.required  ? ' required' : '';

    switch (field.type) {
      case 'Text': case 'Phone': case 'Url': {
        var inputType = field.type === 'Phone' ? 'tel' : field.type === 'Url' ? 'url' : 'text';
        return '<input type="' + inputType + '" class="mf-input" id="' + id + '" name="' + name + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '"' + ro + req + '>';
      }
      case 'Email':
        return '<input type="email" class="mf-input" id="' + id + '" name="' + name + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '"' + ro + req + '>';
      case 'Number': {
        var v: any = field.validation || {};
        var minA = v.min != null ? ' min="' + v.min + '"' : '';
        var maxA = v.max != null ? ' max="' + v.max + '"' : '';
        return '<input type="number" class="mf-input" id="' + id + '" name="' + name + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '"' + minA + maxA + ro + req + '>';
      }
      case 'Date':
        return '<input type="date" class="mf-input" id="' + id + '" name="' + name + '" value="' + esc(val) + '"' + ro + req + '>' +
          renderPlaceholderHint(field);
      case 'Textarea':
        return '<textarea class="mf-textarea" id="' + id + '" name="' + name + '" placeholder="' + esc(ph) + '"' + ro + req + '>' + esc(val) + '</textarea>';
      case 'Select': {
        var h = '<select class="mf-select" id="' + id + '" name="' + name + '"' + ro + req + '>';
        h += '<option value="">' + esc(ph || tr('widget.select.placeholder', 'Select...')) + '</option>';
        (field.options || []).forEach(function (opt: FieldOption) {
          h += '<option value="' + esc(opt.value) + '"' + (val === opt.value ? ' selected' : '') + '>' + esc(opt.label) + '</option>';
        });
        return h + '</select>';
      }
      case 'Radio': {
        var h2 = '<div class="' + getOptionGroupClass(field) + '">';
        (field.options || []).forEach(function (opt: any) {
          h2 += renderOptionItem('radio', name, opt, val === opt.value, field);
        });
        return h2 + '</div>' + renderPlaceholderHint(field);
      }
      case 'Checkbox': {
        var selectedVals: string[] = Array.isArray(val) ? val : (val ? (val as string).split(',') : []);
        var h3 = '<div class="' + getOptionGroupClass(field) + '">';
        (field.options || []).forEach(function (opt: any) {
          h3 += renderOptionItem('checkbox', name, opt, selectedVals.indexOf(opt.value) !== -1, field);
        });
        return h3 + '</div>' + renderPlaceholderHint(field);
      }
      case 'File': {
        var fs: any = field.fileSettings || {};
        var accept = (fs.allowedExtensions || []).join(',');
        var multi = ((fs.maxFiles || 1) > 1) ? ' multiple' : '';
        var fileText = getPlaceholderText(field, tr('widget.file.drop_here', 'Click or drag files here'));
        return '<div class="mf-file-dropzone" id="' + id + '-zone">' +
          '<div class="mf-file-icon"><i class="fa fa-cloud-upload-alt"></i></div>' +
          '<div class="mf-file-text">' + esc(fileText) + '</div>' +
          '<input type="file" data-field-key="' + name + '" id="' + id + '" style="display:none;"' + (accept ? ' accept="' + accept + '"' : '') + multi + '>' +
          '<input type="hidden" name="' + name + '" id="' + id + '-value" value="' + esc(val) + '">' +
          '<div class="mf-file-list" id="' + id + '-list"></div></div>';
      }
      case 'Rating': {
        var rv = parseInt(val) || 0;
        var h4 = '<div class="mf-rating" id="' + id + '-rating" data-name="' + name + '" data-value="' + rv + '">';
        for (var i = 1; i <= 5; i++) {
          h4 += '<span class="mf-star" data-val="' + i + '" style="font-size:28px;cursor:pointer;color:' + (i <= rv ? '#fbbf24' : '#d0d5dd') + ';">&#9733;</span>';
        }
        return h4 + '<input type="hidden" name="' + name + '" value="' + (val || '') + '"></div>' + renderPlaceholderHint(field);
      }
      case 'Signature':
        return '<div style="border:1px solid #d0d5dd;border-radius:6px;padding:8px;background:#fafafa;">' +
          renderPlaceholderHint(field, tr('widget.signature.sign_here', 'Sign here'), true) +
          '<canvas id="' + id + '-canvas" width="400" height="150" style="width:100%;border:1px solid #e0e0e0;border-radius:4px;cursor:crosshair;"></canvas>' +
          '<div style="margin-top:6px;text-align:right;"><button type="button" class="mf-sig-clear" data-canvas="' + id + '-canvas" style="font-size:12px;border:1px solid #ccc;background:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;">' + esc(tr('widget.signature.clear', 'Clear')) + '</button></div>' +
          '<input type="hidden" name="' + name + '" id="' + id + '"></div>';
      case 'UniqueId': {
        if (val) {
          return '<div class="mf-uid-display" style="font-family:monospace;font-size:15px;font-weight:600;color:#6366f1;padding:8px 12px;background:#f5f3ff;border:1px solid #e0e7ff;border-radius:6px;">' + esc(val) + '</div>' +
            '<input type="hidden" name="' + name + '" id="' + id + '" value="' + esc(val) + '">';
        }
        var prefix = field.widgetProps && (field.widgetProps as any).prefix ? String((field.widgetProps as any).prefix) : '';
        var padding = field.widgetProps && (field.widgetProps as any).padding ? Number((field.widgetProps as any).padding) : 5;
        var preview = prefix + '0'.repeat(Math.max(0, padding - 1)) + '1';
        var uniqueHint = getPlaceholderText(field, tr('widget.unique_id.auto_generated', 'Auto-generated on submit'));
        return '<div class="mf-uid-preview" style="font-family:monospace;font-size:13px;color:#94a3b8;padding:8px 12px;background:#f8fafc;border:1px dashed #d1d5db;border-radius:6px;">' +
          '<i class="fas fa-fingerprint" style="margin-right:6px;"></i>' + esc(uniqueHint) + ': <span style="color:#6366f1;">' + esc(preview) + '…</span></div>' +
          '<input type="hidden" name="' + name + '" id="' + id + '" value="">';
      }
      default: {
        var W = (window as any).MegaFormWidgets;
        if (W && W.widgetTypes && W.widgetTypes[field.type]) return W.renderWidget(field, config.formId, val) + renderPlaceholderHint(field);
        return '<input type="text" class="mf-input" id="' + id + '" name="' + name + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '"' + ro + req + '>';
      }
    }
  }

  function renderSingleFieldElement(field: FormField): HTMLElement {
    if (field.type === 'Hidden') {
      var hidden = document.createElement('input');
      (hidden as any).type = 'hidden';
      hidden.name = field.key;
      hidden.value = String(field.defaultValue || formData[field.key] || '');
      return hidden;
    }
    var group = document.createElement('div');
    group.className = 'mf-field-group';
    group.setAttribute('data-key', field.key);
    group.setAttribute('data-type', field.type);
    if (field.showIf) {
      group.setAttribute('data-show-if', JSON.stringify(field.showIf));
      if (!evaluateCondition(field.showIf)) group.style.display = 'none';
    }
    var html = '';
    if (field.type === 'Section') {
      if (field.properties && (field.properties as any).pageBreak) {
        html = '<div class="mf-page-anchor" data-mf-page-break-key="' + esc(field.key || '') + '" hidden></div>';
      } else {
        html = '<div class="mf-section-break"><div class="mf-section-title">' + esc(field.label) + '</div></div>';
      }
      group.innerHTML = html;
      return group;
    }
    if (field.type === 'Html') {
      html = '<div class="mf-html-block">' + (field.htmlContent || '') + '</div>';
      group.innerHTML = html;
      return group;
    }
    var W = (window as any).MegaFormWidgets;
    var isW = W && W.widgetTypes && W.widgetTypes[field.type];
    if (!isW) {
      html += '<label class="mf-field-label" for="mf-' + config.formId + '-' + field.key + '">' +
        esc(field.label) + (field.required ? ' <span class="mf-required">*</span>' : '') + '</label>';
    }
    html += renderInput(field);
    if (!isW && field.helpText) html += '<div class="mf-field-help">' + esc(field.helpText) + '</div>';
    html += '<div class="mf-field-error" id="mf-err-' + field.key + '"></div>';
    group.innerHTML = html;
    return group;
  }

  function renderRowElement(field: FormField): HTMLElement {
    var rowWrap = document.createElement('div');
    rowWrap.className = 'mf-field-group mf-field-group--row';
    rowWrap.setAttribute('data-key', field.key);
    rowWrap.setAttribute('data-type', 'Row');

    var rowDiv = document.createElement('div');
    rowDiv.className = 'mf-row';
    rowDiv.style.display = 'grid';
    rowDiv.style.gap = 'var(--mf-field-gap, 20px)';
    rowDiv.style.gridTemplateColumns = (field.columns || []).map(function (c: ColumnDef) { return (c.span || 6) + 'fr'; }).join(' ');
    rowDiv.style.marginBottom = 'var(--mf-field-gap, 20px)';
    (field.columns || []).forEach(function (col: ColumnDef) {
      var colDiv = document.createElement('div');
      colDiv.className = 'mf-row-column';
      (col.fields || []).forEach(function (cf: FormField) { colDiv.appendChild(renderSingleFieldElement(cf)); });
      rowDiv.appendChild(colDiv);
    });
    rowWrap.appendChild(rowDiv);
    if (field.showIf) {
      rowWrap.setAttribute('data-show-if', JSON.stringify(field.showIf));
      if (!evaluateCondition(field.showIf)) rowWrap.style.display = 'none';
    }
    return rowWrap;
  }

  // ═══════════════════════════════════════════════════════════
  //  CONDITIONAL LOGIC
  // ═══════════════════════════════════════════════════════════
  function escapeNameSelector(name: string): string {
    return String(name || '').replace(/([ #;?%&,.+*~\':"!^$\[\]()=>|\/@])/g, '\\$1');
  }

  function getFormRootElement(): HTMLElement | null {
    return document.getElementById('mf-form-wrapper-' + config.formId)
      || document.getElementById('mf-form-' + config.formId)
      || null;
  }

  function getFieldValue(key: string, type: string): string | string[] {
    var W = (window as any).MegaFormWidgets;
    var formRoot = getFormRootElement() || document.body;
    var escapedKey = escapeNameSelector(key);
    if (W && W.widgetTypes && W.widgetTypes[type]) {
      return W.collectWidgetValue(key, type, formRoot) as string;
    }
    if (type === 'Radio') {
      var radioChecked = formRoot.querySelector<HTMLInputElement>('input[name="' + escapedKey + '"]:checked');
      return radioChecked ? radioChecked.value : '';
    }
    if (type === 'Checkbox') {
      var checks = formRoot.querySelectorAll<HTMLInputElement>('input[name="' + escapedKey + '"]:checked');
      return Array.from(checks).map(function (c: HTMLInputElement) { return c.value; });
    }
    if (type === 'Rating' || type === 'Signature' || type === 'File') {
      var hidden = formRoot.querySelector<HTMLInputElement>('input[type="hidden"][name="' + escapedKey + '"]');
      return hidden ? hidden.value : '';
    }
    var el = formRoot.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[name="' + escapedKey + '"]');
    return el ? el.value : '';
  }

  function evaluateCondition(showIf: ShowIfRule | null | undefined): boolean {
    if (!showIf || !showIf.conditions || !showIf.conditions.length) return true;
    var results = showIf.conditions.map(function (cond: ShowIfCondition) {
      var val = String(getFieldValue(cond.fieldKey, '') || '');
      var target = cond.value || '';
      switch (cond.operator) {
        case 'Equals':       return val === target;
        case 'NotEquals':    return val !== target;
        case 'Contains':     return val.indexOf(target) !== -1;
        case 'NotContains':  return val.indexOf(target) === -1;
        case 'StartsWith':   return val.indexOf(target) === 0;
        case 'EndsWith':     return val.slice(-target.length) === target;
        case 'GreaterThan':  { var nv1 = parseFloat(val), nt1 = parseFloat(target); return !isNaN(nv1) && !isNaN(nt1) && nv1 > nt1; }
        case 'LessThan':     { var nv2 = parseFloat(val), nt2 = parseFloat(target); return !isNaN(nv2) && !isNaN(nt2) && nv2 < nt2; }
        case 'GreaterOrEqual':{ var nv3 = parseFloat(val), nt3 = parseFloat(target); return !isNaN(nv3) && !isNaN(nt3) && nv3 >= nt3; }
        case 'LessOrEqual':  { var nv4 = parseFloat(val), nt4 = parseFloat(target); return !isNaN(nv4) && !isNaN(nt4) && nv4 <= nt4; }
        case 'IsEmpty':      return !val || val.length === 0;
        case 'IsNotEmpty':   return !!val && val.length > 0;
        case 'In':           return target.split(',').map(function (s: string) { return s.trim(); }).indexOf(val) !== -1;
        case 'NotIn':        return target.split(',').map(function (s: string) { return s.trim(); }).indexOf(val) === -1;
        default:             return true;
      }
    });
    return showIf.operator === 'Or' ? results.some(Boolean) : results.every(Boolean);
  }

  function bindConditionalLogic(container: HTMLElement): void {
    var conditionalFields = container.querySelectorAll<HTMLElement>('[data-show-if]');
    if (!conditionalFields.length) return;
    var allInputs = container.querySelectorAll<HTMLElement>('input, select, textarea');
    var reevaluate = function () {
      conditionalFields.forEach(function (group: HTMLElement) {
        try {
          var showIf = JSON.parse(group.getAttribute('data-show-if')!) as ShowIfRule;
          group.style.display = evaluateCondition(showIf) ? '' : 'none';
        } catch (_) { /* ignore */ }
      });
    };
    allInputs.forEach(function (inp: HTMLElement) {
      inp.addEventListener('change', reevaluate);
      var tag = inp.tagName;
      var type = (inp as HTMLInputElement).type;
      if (type === 'text' || type === 'email' || type === 'tel' || type === 'number' || tag === 'TEXTAREA') {
        inp.addEventListener('input', reevaluate);
      }
    });
  }


  function getRequiredPaymentFields(): FormField[] {
    var all = flattenFields(config.schema!.fields || []);
    return all.filter(function (field: FormField) {
      if (!field || field.type !== 'Payment') return false;
      var wp = (field as any).widgetProps || {};
      return wp.requiredPaid !== false;
    });
  }

  function hasRequiredPaymentMode(): boolean {
    return getRequiredPaymentFields().length > 0;
  }

  function readPaymentStatus(fieldKey: string): string {
    var inputs = document.getElementsByName(fieldKey);
    var input = null as HTMLInputElement | null;
    for (var i = 0; i < inputs.length; i++) {
      var candidate = inputs[i] as HTMLInputElement;
      if (candidate && candidate.type === 'hidden') { input = candidate; break; }
    }
    if (!input || !input.value) return 'idle';
    try {
      var parsed = JSON.parse(input.value);
      return parsed && parsed.status ? String(parsed.status) : 'idle';
    } catch (_e) {
      return 'idle';
    }
  }

  function areRequiredPaymentsPaid(): boolean {
    var fields = getRequiredPaymentFields();
    if (!fields.length) return false;
    return fields.every(function (field: FormField) { return readPaymentStatus(field.key) === 'paid'; });
  }

  function updateActionBarVisibility(): void {
    var actions = document.querySelector('#mf-form-' + config.formId + ' .mf-form-actions') as HTMLElement | null;
    if (!actions) return;
    var visible = Array.prototype.some.call(actions.querySelectorAll('button'), function (btn: HTMLButtonElement) {
      return btn.style.display !== 'none';
    });
    actions.style.display = visible ? '' : 'none';
  }

  function setPaymentCompletionButtonState(show: boolean): void {
    var submitBtn = document.getElementById('mf-btn-submit-' + config.formId) as HTMLButtonElement | null;
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
    var submitBtn = document.getElementById('mf-btn-submit-' + config.formId) as HTMLButtonElement | null;
    var container = document.getElementById('mf-fields-container-' + config.formId);
    var customBtns = container ? container.querySelectorAll<HTMLButtonElement>('button[type="submit"]') : [];
    var onLastPage = totalPages <= 1 || currentPage === totalPages - 1;
    var revealSubmit = onLastPage && areRequiredPaymentsPaid();

    if (submitBtn) {
      if (revealSubmit) {
        submitBtn.style.display = '';
        submitBtn.innerHTML = '<i class="fa fa-check-circle"></i> Complete submission';
      } else {
        submitBtn.style.display = 'none';
      }
    }

    customBtns.forEach(function (btn: HTMLButtonElement) {
      btn.style.display = revealSubmit ? '' : 'none';
    });

    updateActionBarVisibility();
  }

  function startPaymentWatcher(): void {
    if (config.isPreview || paymentWatcherTimer !== null || !hasRequiredPaymentMode()) return;

    getRequiredPaymentFields().forEach(function (field: FormField) {
      paymentStatusSnapshot[field.key] = readPaymentStatus(field.key);
    });

    paymentWatcherTimer = window.setInterval(function () {
      var fields = getRequiredPaymentFields();
      if (!fields.length) return;

      var shouldAutoSubmit = false;
      fields.forEach(function (field: FormField) {
        var prev = paymentStatusSnapshot[field.key] || 'idle';
        var next = readPaymentStatus(field.key);
        if (prev !== 'paid' && next === 'paid') {
          shouldAutoSubmit = true;
        }
        paymentStatusSnapshot[field.key] = next;
      });

      applyPaymentSubmitMode();

      if (shouldAutoSubmit && areRequiredPaymentsPaid()) {
        var submitted = doSubmit();
        if (!submitted) {
          setPaymentCompletionButtonState(true);
        }
      }
    }, 500) as unknown as number;
  }

  // ═══════════════════════════════════════════════════════════
  //  NAVIGATION (multi-page)
  // ═══════════════════════════════════════════════════════════
  function buildStepIndicator(): void {
    var bar = document.getElementById('mf-progress-' + config.formId);
    if (!bar || totalPages <= 1) return;

    var labels: string[] = ['Step 1'];
    var idx = 1;
    config.schema!.fields!.forEach(function (f: FormField) {
      if (f.type === 'Section' && f.properties && (f.properties as any).pageBreak) { idx++; labels.push(f.label || ('Step ' + idx)); }
    });
    while (labels.length < totalPages) labels.push('Step ' + (labels.length + 1));
    config.schema!.fields!.forEach(function (f: FormField) {
      if (f.type === 'Section' && (!f.properties || !(f.properties as any).pageBreak)) labels[0] = f.label || labels[0];
    });

    var html = '<div class="mf-steps">';
    for (var i = 0; i < totalPages; i++) {
      var lbl = (labels[i] || ('Step ' + (i + 1))).replace(/^Step\s*\d+[:\s]*/i, '') || ('Step ' + (i + 1));
      html += '<div class="mf-step' + (i === 0 ? ' active' : '') + '" data-step="' + i + '">';
      html += '<div class="mf-step-circle">' + (i + 1) + '</div>';
      html += '<div class="mf-step-label">' + esc(lbl) + '</div></div>';
      if (i < totalPages - 1) html += '<div class="mf-step-line"></div>';
    }
    bar.innerHTML = html + '</div>';
    bar.style.display = '';
  }

  function updateNavigation(): void {
    var prevBtn  = document.getElementById('mf-btn-prev-'   + config.formId) as HTMLButtonElement | null;
    var nextBtn  = document.getElementById('mf-btn-next-'   + config.formId) as HTMLButtonElement | null;
    var submitBtn = document.getElementById('mf-btn-submit-' + config.formId) as HTMLButtonElement | null;
    var bar      = document.getElementById('mf-progress-'   + config.formId);
    var shellSubmitMode = isMultiStepCustomHtmlMode();

    if (totalPages <= 1) {
      if (prevBtn)   prevBtn.style.display   = 'none';
      if (nextBtn)   nextBtn.style.display   = 'none';
      if (submitBtn) submitBtn.style.display = customHtmlHasOwnSubmit && !shellSubmitMode ? 'none' : '';
      if (bar)       bar.style.display       = 'none';
      applyPaymentSubmitMode();
      updateTrialSubmitNote();
      return;
    }

    for (var i = 0; i < totalPages; i++) {
      var pg = document.getElementById('mf-page-' + config.formId + '-' + i);
      if (pg) pg.style.display = (i === currentPage) ? '' : 'none';
    }
    if (prevBtn)   prevBtn.style.display   = currentPage > 0 ? '' : 'none';
    if (nextBtn)   nextBtn.style.display   = currentPage < totalPages - 1 ? '' : 'none';
    if (submitBtn) submitBtn.style.display = shellSubmitMode ? (currentPage === totalPages - 1 ? '' : 'none') : (customHtmlHasOwnSubmit ? 'none' : (currentPage === totalPages - 1 ? '' : 'none'));
    applyPaymentSubmitMode();
    updateTrialSubmitNote();

    if (bar) {
      bar.querySelectorAll('.mf-step').forEach(function (step: Element, idx2: number) {
        step.className = 'mf-step' + (idx2 < currentPage ? ' done' : '') + (idx2 === currentPage ? ' active' : '');
      });
      bar.querySelectorAll('.mf-step-line').forEach(function (line: Element, idx3: number) {
        line.className = 'mf-step-line' + (idx3 < currentPage ? ' done' : '');
      });
    }
  }

  function bindNavigation(): void {
    var prevBtn = document.getElementById('mf-btn-prev-' + config.formId);
    var nextBtn = document.getElementById('mf-btn-next-' + config.formId);
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (currentPage > 0) { currentPage--; updateNavigation(); scrollToTop(); }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (!validatePage(fieldPages[currentPage] || [])) return;
        if (currentPage < totalPages - 1) { currentPage++; updateNavigation(); scrollToTop(); }
      });
    }
  }

  function collectData(): Record<string, unknown> {
    var data: Record<string, unknown> = {};
    flattenFields(config.schema!.fields || []).forEach(function (f: FormField) {
      if (f.type === 'Row' || f.type === 'Section' || f.type === 'Html') return;
      data[f.key] = getFieldValue(f.key, f.type);
    });
    return data;
  }

  function applyRuleEffects(effects: any[], formRoot?: HTMLElement | null): void {
    var root = formRoot || getFormRootElement() || document.body;
    if (!effects || !effects.length) return;
    effects.forEach(function (effect: any) {
      var targetKey = effect && effect.target ? String(effect.target) : '';
      if (!targetKey) return;
      var target = root.querySelector<HTMLElement>('[data-key="' + escapeNameSelector(targetKey) + '"]');
      if (!target) return;
      switch (effect.action) {
        case 'show': target.style.display = ''; break;
        case 'hide': target.style.display = 'none'; break;
        case 'require': target.querySelectorAll<any>('input, select, textarea').forEach(function (el) { el.required = true; }); break;
        case 'optional': target.querySelectorAll<any>('input, select, textarea').forEach(function (el) { el.required = false; }); break;
        case 'enable': target.querySelectorAll<any>('input, select, textarea, button').forEach(function (el) { el.disabled = false; }); break;
        case 'disable': target.querySelectorAll<any>('input, select, textarea, button').forEach(function (el) { el.disabled = true; }); break;
        case 'setValue': target.querySelectorAll<any>('input, select, textarea').forEach(function (el) { el.value = effect.value != null ? String(effect.value) : ''; }); break;
        case 'clear': target.querySelectorAll<any>('input, select, textarea').forEach(function (el) { el.value = ''; }); break;
      }
    });
  }

  function bindRuleEngine(): void {
    var rules = (config as any).rules as any[] | undefined;
    if (!rules || !rules.length) return;

    var RE = (window as any).MegaFormRules || (window as any).MegaFormRuleEngine;
    if (!RE || typeof RE.evaluateRules !== 'function') return;

    var formRoot = getFormRootElement();
    var inputRoot = document.getElementById('mf-fields-container-' + config.formId) || formRoot;
    if (!inputRoot) return;

    var runRules = function (): void {
      var effects = RE.evaluateRules(rules, collectData());
      if (typeof RE.applyEffects === 'function') RE.applyEffects(effects, formRoot);
      else applyRuleEffects(effects, formRoot);
    };

    inputRoot.querySelectorAll<HTMLElement>('input, select, textarea').forEach(function (inp: HTMLElement) {
      inp.addEventListener('change', runRules);
      var type = (inp as HTMLInputElement).type;
      if (type === 'text' || type === 'email' || type === 'tel' || type === 'number' || inp.tagName === 'TEXTAREA') {
        inp.addEventListener('input', runRules);
      }
    });

    runRules();
  }

  function scrollToTop(): void {
    var wrapper = document.getElementById('mf-form-wrapper-' + config.formId);
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ═══════════════════════════════════════════════════════════
  //  VALIDATION
  // ═══════════════════════════════════════════════════════════
  function validatePage(pageFields: FormField[]): boolean {
    var flat = flattenFields(pageFields);
    var valid = true;
    clearFieldErrors();

    flat.forEach(function (field: FormField) {
      if (['Html', 'Section', 'Hidden', 'Row'].indexOf(field.type) !== -1) return;
      if (field.showIf && !evaluateCondition(field.showIf)) return;
      var val = getFieldValue(field.key, field.type);
      var errEl = document.getElementById('mf-err-' + field.key);
      var message = validateFieldExtra(field, val);
      if (errEl) {
        errEl.textContent = message || '';
        errEl.style.display = message ? 'block' : 'none';
      }
      if (message) valid = false;
    });
    return valid;
  }

  function validateForm(): boolean {
    if (!config.schema || !config.schema.fields) return false;
    var errors: Record<string, string> = {};
    var firstError: HTMLElement | null = null;
    var allFields = flattenFields(config.schema.fields);

    allFields.forEach(function (field: FormField) {
      if (['Html', 'Section', 'Hidden', 'Row'].indexOf(field.type) !== -1) return;
      if (field.showIf && !evaluateCondition(field.showIf)) return;
      var val = getFieldValue(field.key, field.type);
      var message = validateFieldExtra(field, val);
      if (message) errors[field.key] = message;

      var errEl = document.getElementById('mf-err-' + field.key);
      if (errEl) {
        errEl.textContent = errors[field.key] || '';
        errEl.style.display = errors[field.key] ? 'block' : 'none';
        var input = document.querySelector<HTMLElement>('[name="' + field.key + '"]');
        if (input) {
          if (errors[field.key]) { input.classList.add('mf-error'); if (!firstError) firstError = input; }
          else input.classList.remove('mf-error');
        }
      }
    });

    if (firstError) (firstError as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    return Object.keys(errors).length === 0;
  }

  function collectFormData(): Record<string, unknown> | null {
    if (!config.schema || !config.schema.fields) return null;
    var allFields = flattenFields(config.schema.fields);
    var data: Record<string, unknown> = {};
    var W = (window as any).MegaFormWidgets;

    if (W) {
      var wrapper = document.getElementById('mf-form-wrapper-' + config.formId) || document.body;
      for (var k = 0; k < allFields.length; k++) {
        var f = allFields[k];
        if (W.widgetTypes && W.widgetTypes[f.type] && W.validateWidget) {
          var err = W.validateWidget(f.key, f.type, wrapper);
          var errorMsg: string | null = null;
          if (typeof err === 'string' && err) errorMsg = err;
          else if (typeof err === 'boolean' && !err && f.required) errorMsg = tr('form.required_field', (f.label || f.key) + ' is required');
          if (errorMsg && f.showIf && !evaluateCondition(f.showIf)) errorMsg = null;
          if (errorMsg) {
            var errEl2 = document.getElementById('mf-err-' + f.key);
            if (errEl2) { errEl2.textContent = errorMsg; errEl2.style.display = 'block'; }
            return null;
          }
        }
      }
    }

    allFields.forEach(function (field: FormField) {
      if (['Html', 'Section', 'Row'].indexOf(field.type) !== -1) return;
      if (field.showIf && !evaluateCondition(field.showIf)) return;
      data[field.key] = getFieldValue(field.key, field.type);
    });

    var hp = document.querySelector<HTMLInputElement>('[name="' + (config.honeypotField || '__mf_hp') + '"]');
    if (hp) data[config.honeypotField || '__mf_hp'] = hp.value;
    data['__mf_ts'] = config.loadTimestamp || 0;
    return data;
  }

  function clearFieldErrors(): void {
    document.querySelectorAll('.mf-field-error').forEach(function (el: Element) { el.classList.remove('mf-field-error'); });
    document.querySelectorAll('.mf-field-error-msg').forEach(function (el: Element) { el.remove(); });
    var errDiv = document.getElementById('mf-error-' + config.formId);
    if (errDiv) errDiv.style.display = 'none';
  }

  function bindFieldErrorClear(): void {
    var form = document.getElementById('mf-form-' + config.formId);
    if (!form) return;
    var clear = function (e: Event) {
      var wrapper = (e.target as HTMLElement).closest('.mf-field-group');
      if (wrapper && wrapper.classList.contains('mf-field-error')) {
        wrapper.classList.remove('mf-field-error');
        var msg = wrapper.querySelector('.mf-field-error-msg');
        if (msg) msg.remove();
      }
    };
    form.addEventListener('input', clear);
    form.addEventListener('change', clear);
  }

  // ═══════════════════════════════════════════════════════════
  //  SUBMIT
  // ═══════════════════════════════════════════════════════════
  function bindSubmit(): void {
    var settings = (config.schema!.settings || {}) as any;
    if (settings.customHtml && settings.customHtml.trim()) {
      var wrapper = document.getElementById('mf-form-wrapper-' + config.formId);
      if (wrapper) {
        var header  = wrapper.querySelector<HTMLElement>('.mf-form-header');
        var actions = wrapper.querySelector<HTMLElement>('.mf-form-actions');
        if (header)  header.style.display  = 'none';
        if (actions) {
          if (totalPages > 1) actions.style.display = '';
          else actions.style.display = customHtmlHasOwnSubmit ? 'none' : '';
        }
        updateTrialSubmitNote();
        wrapper.style.cssText += ';padding:0;margin:0;background:none;';
        var formEl = wrapper.querySelector<HTMLElement>('.mf-form');
        if (formEl) formEl.style.cssText += ';padding:0;margin:0;';  /* MF: visual props (bg/shadow/radius) intentionally preserved for theme compat */
      }
    }

    var submitBtn = document.getElementById('mf-btn-submit-' + config.formId) as HTMLButtonElement | null;
    if (submitBtn) {
      if (config.isPreview) {
        // Preview mode: disable submit, show visual hint
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.title = 'Preview mode — submission disabled';
        submitBtn.addEventListener('click', function(e: Event) { e.preventDefault(); e.stopPropagation(); });
      } else {
        submitBtn.addEventListener('click', function (e: Event) { e.preventDefault(); doSubmit(); });
      }
    }

    var container = document.getElementById('mf-fields-container-' + config.formId);
    if (container) {
      if (config.isPreview) {
        // Preview: block all submit attempts, disable submit buttons
        container.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(function(btn) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
          btn.style.cursor = 'not-allowed';
        });
        container.addEventListener('click', function (e: Event) {
          var btn = (e.target as HTMLElement).closest('button[type="submit"]');
          if (btn) { e.preventDefault(); e.stopPropagation(); }
        });
      } else {
        container.addEventListener('click', function (e: Event) {
          var btn = (e.target as HTMLElement).closest('button[type="submit"]');
          if (btn) { e.preventDefault(); e.stopPropagation(); doSubmit(); }
        });
        container.addEventListener('submit', function (e: Event) { e.preventDefault(); e.stopPropagation(); doSubmit(); });
      }
    }
  }

  function doSubmit(): boolean {
    clearFieldErrors();
    if (!validateForm()) return false;
    var data = collectFormData();
    if (!data) return false;

    var loading   = document.getElementById('mf-loading-' + config.formId);
    var submitBtn = document.getElementById('mf-btn-submit-' + config.formId) as HTMLButtonElement | null;
    var container = document.getElementById('mf-fields-container-' + config.formId);
    var customBtns = container ? container.querySelectorAll<HTMLButtonElement>('button[type="submit"]') : [];

    if (loading)   loading.style.display   = '';
    if (submitBtn) submitBtn.disabled      = true;
    customBtns.forEach(function (b: HTMLButtonElement) { b.disabled = true; b.style.opacity = '0.6'; });

    if (config.resumeToken) (data as any).__mf_resume_token = config.resumeToken;
    lastSubmittedData = data || {};

    var apiBase = config.apiBaseUrl || config.apiBase || '/api/MegaForm/';
    var xhr = new XMLHttpRequest();
    var submitUrl = apiBase + 'Submit/Post';
    if (config.locale) submitUrl += (submitUrl.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + encodeURIComponent(String(config.locale));
    xhr.open('POST', submitUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function () {
      if (loading)   loading.style.display = 'none';
      if (submitBtn) submitBtn.disabled    = false;
      customBtns.forEach(function (b: HTMLButtonElement) { b.disabled = false; b.style.opacity = ''; });
      try {
        applyPaymentSubmitMode();
        var result = JSON.parse(xhr.responseText);
        if (xhr.status === 200 && (result.success || result.Success)) {
          clearFieldErrors();
          showSuccess(result);
        } else {
          var errMsg = result.error || result.errorMessage || result.ErrorMessage || 'Submission failed.';
          var valErrors = result.validationErrors || result.ValidationErrors || {};
          clearFieldErrors();
          var msgs: string[] = [];
          var firstErrorField: HTMLElement | null = null;
          Object.keys(valErrors).forEach(function (fieldKey: string) {
            var msg = valErrors[fieldKey];
            msgs.push(msg);
            var fieldEl = document.querySelector<HTMLElement>('[name="' + fieldKey + '"]');
            if (fieldEl) {
              var wrapEl = fieldEl.closest('.mf-field-group');
              if (wrapEl) {
                wrapEl.classList.add('mf-field-error');
                var errSpan = document.createElement('div');
                errSpan.className = 'mf-field-error-msg';
                errSpan.textContent = msg;
                wrapEl.appendChild(errSpan);
              }
              if (!firstErrorField) firstErrorField = fieldEl;
            }
          });
          if (firstErrorField) {
            (firstErrorField as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
            try { (firstErrorField as HTMLElement).focus(); } catch (_) { /* */ }
          }
          showError(msgs.length > 0 ? msgs.join(' • ') : errMsg);
          if (hasRequiredPaymentMode() && areRequiredPaymentsPaid()) setPaymentCompletionButtonState(true);
        }
      } catch (_) { showError('Server error: ' + xhr.status); if (hasRequiredPaymentMode() && areRequiredPaymentsPaid()) setPaymentCompletionButtonState(true); }
    };
    xhr.onerror = function () {
      if (loading)   loading.style.display = 'none';
      if (submitBtn) submitBtn.disabled    = false;
      customBtns.forEach(function (b: HTMLButtonElement) { b.disabled = false; b.style.opacity = ''; });
      showError('Network error. Please try again.');
      if (hasRequiredPaymentMode() && areRequiredPaymentsPaid()) setPaymentCompletionButtonState(true);
    };
    xhr.send(JSON.stringify({ formId: getEffectiveSubmissionFormId(), data: data, submissionTime: (Date.now() / 1000) - (config.loadTimestamp || Date.now() / 1000) }));
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  //  SAVE DRAFT
  // ═══════════════════════════════════════════════════════════
  function bindSaveDraft(): void {
    var saveBtn = document.getElementById('mf-btn-save-' + config.formId);
    if (!saveBtn || !config.enableSaveResume) return;
    saveBtn.addEventListener('click', function () {
      var data = collectFormData();
      var apiBase = config.apiBaseUrl || config.apiBase || '/api/MegaForm/';
      var xhr = new XMLHttpRequest();
      xhr.open('POST', apiBase + 'Draft/Save', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        if (xhr.status === 200) {
          var result = JSON.parse(xhr.responseText);
          config.resumeToken = result.resumeToken || result.ResumeToken;
          alert('Draft saved! Resume later:\n\n' + window.location.href.split('?')[0] + '?resume=' + config.resumeToken);
        } else { alert('Error saving draft'); }
      };
      xhr.send(JSON.stringify({ FormId: getEffectiveSubmissionFormId(), DataJson: JSON.stringify(data), ResumeToken: config.resumeToken || null }));
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  SUCCESS / ERROR
  // ═══════════════════════════════════════════════════════════
  function getPostSubmitConfig(): any {
    var settings = (config && config.schema && (config.schema as any).settings) || {};
    var ps = settings.postSubmitExperience || settings.PostSubmitExperience || null;
    if (!ps) return null;
    var buttons = ps.buttons || ps.Buttons || [];
    if (!Array.isArray(buttons)) buttons = [];
    return {
      enabled: ps.enabled !== false && ps.Enabled !== false,
      mode: ps.mode || ps.Mode || 'rich',
      title: ps.title || ps.Title || tr('postsubmit.title', 'Submission received'),
      message: ps.message || ps.Message || config.successMessage || 'Your submission has been received.',
      showSubmissionId: ps.showSubmissionId !== false && ps.ShowSubmissionId !== false,
      submissionIdLabel: ps.submissionIdLabel || ps.SubmissionIdLabel || 'Submission ID',
      showAnswerSummary: !!(ps.showAnswerSummary || ps.ShowAnswerSummary),
      answerSummaryTitle: ps.answerSummaryTitle || ps.AnswerSummaryTitle || 'Your answers',
      hideEmptyAnswers: ps.hideEmptyAnswers !== false && ps.HideEmptyAnswers !== false,
      allowFillAgain: ps.allowFillAgain !== false && ps.AllowFillAgain !== false,
      fillAgainLabel: ps.fillAgainLabel || ps.FillAgainLabel || tr('postsubmit.fill_again', 'Submit another response'),
      redirectUrl: ps.redirectUrl || ps.RedirectUrl || '',
      redirectDelaySeconds: parseInt(String(ps.redirectDelaySeconds != null ? ps.redirectDelaySeconds : ps.RedirectDelaySeconds != null ? ps.RedirectDelaySeconds : 5), 10) || 0,
      redirectNotice: ps.redirectNotice || ps.RedirectNotice || 'Redirecting shortly…',
      buttons: buttons
    };
  }

  function resolvePostSubmitTokens(input: any, result: any): string {
    var text = input == null ? '' : String(input);
    return text.replace(/\{\{\s*([a-zA-Z0-9_:-]+)\s*\}\}/g, function (_m: string, token: string) {
      var lower = String(token || '').toLowerCase();
      if (lower === 'submission:id' || lower === 'submission:reference') return String(result.submissionId || result.SubmissionId || '');
      if (lower === 'submission:url') return String(window.location.href || '');
      if (lower === 'form:title') return String(config.title || '');
      if (lower === 'form:description') return String(config.description || '');
      if (lower.indexOf('field:') === 0) {
        var key = token.substring(token.indexOf(':') + 1);
        var val = (lastSubmittedData as any)[key];
        return formatAnswerValue(val);
      }
      return '';
    });
  }

  function formatAnswerValue(value: any): string {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(formatAnswerValue).filter(function (x) { return x; }).join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      if (value.name) return String(value.name);
      if (value.fileName) return String(value.fileName);
      if (value.url) return String(value.url);
      try { return JSON.stringify(value); } catch (_) { return ''; }
    }
    return String(value);
  }

  function nl2br(text: string): string {
    return esc(text).replace(/\n/g, '<br/>');
  }

  function buildAnswerSummaryHtml(ps: any): string {
    if (!ps || !ps.showAnswerSummary || !config.schema || !config.schema.fields) return '';
    var rows: string[] = [];
    flattenFields(config.schema.fields).forEach(function (f: any) {
      if (!f || f.type === 'Hidden' || f.type === 'Html' || f.type === 'Section' || f.type === 'Captcha' || f.type === 'Row') return;
      var raw = (lastSubmittedData as any)[f.key];
      var value = formatAnswerValue(raw);
      if (ps.hideEmptyAnswers && !value) return;
      rows.push(
        '<div style="display:flex;gap:16px;justify-content:space-between;align-items:flex-start;padding:10px 0;border-top:1px solid #e2e8f0">' +
          '<div style="font-size:13px;color:#475569;font-weight:600;max-width:42%">' + esc(f.label || f.key || 'Field') + '</div>' +
          '<div style="font-size:13px;color:#0f172a;text-align:right;white-space:pre-wrap;max-width:58%">' + (value ? esc(value) : '<span style="color:#94a3b8">—</span>') + '</div>' +
        '</div>'
      );
    });
    if (!rows.length) return '';
    return '<div style="margin-top:18px;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;box-shadow:0 8px 30px rgba(15,23,42,.05)">' +
      '<div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:2px">' + esc(ps.answerSummaryTitle || 'Your answers') + '</div>' +
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px">Saved from the response that was just submitted.</div>' +
      rows.join('') +
    '</div>';
  }

  function buildPostSubmitButtonsHtml(ps: any, result: any): string {
    var html: string[] = [];
    var buttons = (ps && ps.buttons) || [];
    buttons.forEach(function (btn: any, index: number) {
      if (!btn || !btn.label || !btn.url) return;
      var variant = btn.variant || (index === 0 ? 'primary' : 'secondary');
      html.push(
        '<a href="' + esc(resolvePostSubmitTokens(btn.url, result)) + '" data-mf-ps-link="1" ' + (btn.newTab ? 'target="_blank" rel="noopener noreferrer" ' : '') +
        'class="mf-post-submit-btn mf-post-submit-btn-' + esc(variant) + '" ' +
        'style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:999px;font-weight:700;text-decoration:none;margin:0 6px 8px;min-width:180px;' +
        (variant === 'primary' ? 'background:#2563eb;color:#fff;border:1px solid #2563eb;' : 'background:#fff;color:#0f172a;border:1px solid #cbd5e1;') + '">' + esc(btn.label) + '</a>'
      );
    });
    if (ps && ps.allowFillAgain) {
      html.push('<button type="button" id="mf-post-submit-fill-again-' + config.formId + '" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:999px;font-weight:700;text-decoration:none;margin:0 6px 8px;min-width:180px;background:#f8fafc;color:#0f172a;border:1px dashed #94a3b8;cursor:pointer">' + esc(ps.fillAgainLabel || tr('postsubmit.fill_again', 'Submit another response')) + '</button>');
    }
    if (!html.length) return '';
    return '<div style="margin-top:20px">' + html.join('') + '</div>';
  }

  function startPostSubmitRedirect(ps: any, result: any): void {
    if (!ps || ps.mode !== 'redirect-timed' || !ps.redirectUrl) return;
    var countdownEl = document.getElementById('mf-post-submit-redirect-countdown-' + config.formId);
    var seconds = Math.max(0, ps.redirectDelaySeconds || 0);
    var targetUrl = resolvePostSubmitTokens(ps.redirectUrl, result);
    if (!targetUrl) return;
    if (countdownEl) countdownEl.textContent = String(seconds);
    var tick = window.setInterval(function () {
      seconds -= 1;
      if (countdownEl && seconds >= 0) countdownEl.textContent = String(seconds);
      if (seconds <= 0) {
        window.clearInterval(tick);
        window.location.href = targetUrl;
      }
    }, 1000);
  }

  function bindPostSubmitActions(): void {
    var btn = document.getElementById('mf-post-submit-fill-again-' + config.formId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      window.location.reload();
    });
  }

  function showSuccess(result: any): void {
    var ps = getPostSubmitConfig();
    var legacyRedirect = result.redirectUrl || result.RedirectUrl || '';
    var effectiveRedirect = ps && ps.redirectUrl ? resolvePostSubmitTokens(ps.redirectUrl, result) : legacyRedirect;
    if (ps && ps.mode === 'redirect-immediate' && effectiveRedirect) {
      window.location.href = effectiveRedirect;
      return;
    }
    if ((!ps || ps.enabled === false) && legacyRedirect) {
      window.location.href = legacyRedirect;
      return;
    }

    var form     = document.getElementById('mf-form-'          + config.formId);
    var success  = document.getElementById('mf-success-'       + config.formId);
    var progress = document.getElementById('mf-progress-'      + config.formId);
    var content  = document.getElementById('mf-success-content-' + config.formId);
    if (form)     form.style.display     = 'none';
    if (progress) progress.style.display = 'none';
    if (success) success.style.display = '';

    if (!content) return;

    if (!ps || ps.enabled === false) {
      content.innerHTML =
        '<div class="alert alert-success">' +
          '<i class="fa fa-check-circle fa-2x"></i>' +
          '<h3>Thank You!</h3>' +
          '<p>' + esc(result.successMessage || result.SuccessMessage || 'Your submission has been received.') + '</p>' +
          '<p class="mf-ref-number"><small>Reference: #<span>' + esc(String(result.submissionId || result.SubmissionId || '')) + '</span></small></p>' +
        '</div>';
      return;
    }

    var title = resolvePostSubmitTokens(ps.title || tr('postsubmit.title', 'Submission received'), result);
    var message = resolvePostSubmitTokens(ps.message || result.successMessage || result.SuccessMessage || tr('postsubmit.message', 'Your submission has been received.'), result);
    var subId = result.submissionId || result.SubmissionId || '';
    var redirectBlock = '';
    if (ps.mode === 'redirect-timed' && effectiveRedirect) {
      redirectBlock = '<div style="margin-top:14px;font-size:12px;color:#64748b">' +
        esc(ps.redirectNotice || 'Redirecting shortly…') + ' <strong id="mf-post-submit-redirect-countdown-' + config.formId + '">' + esc(String(ps.redirectDelaySeconds || 0)) + '</strong>s' +
      '</div>';
    }

    content.innerHTML =
      '<div style="max-width:760px;margin:0 auto;background:linear-gradient(180deg,#ffffff,#f8fafc);border:1px solid #e2e8f0;border-radius:24px;padding:28px 24px;box-shadow:0 18px 50px rgba(15,23,42,.08)">' +
        '<div style="width:72px;height:72px;border-radius:999px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:30px;box-shadow:0 10px 24px rgba(34,197,94,.25)"><i class="fa fa-check"></i></div>' +
        '<h2 style="margin:0 0 10px;font-size:28px;line-height:1.2;color:#0f172a">' + esc(title) + '</h2>' +
        '<div style="font-size:15px;line-height:1.7;color:#475569">' + nl2br(message) + '</div>' +
        (ps.showSubmissionId ? '<div style="margin-top:16px;display:inline-flex;gap:8px;align-items:center;padding:8px 12px;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;font-weight:700">' + esc(ps.submissionIdLabel || 'Submission ID') + ': #' + esc(String(subId)) + '</div>' : '') +
        buildPostSubmitButtonsHtml(ps, result) +
        redirectBlock +
        buildAnswerSummaryHtml(ps) +
      '</div>';

    bindPostSubmitActions();
    startPostSubmitRedirect(ps, result);
  }

  function showError(message: string): void {
    var errDiv = document.getElementById('mf-error-' + config.formId);
    if (errDiv) {
      errDiv.style.display = '';
      var textEl = document.getElementById('mf-error-text-' + config.formId);
      if (textEl) textEl.textContent = message;
      errDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  INTERACTIVE ELEMENTS
  // ═══════════════════════════════════════════════════════════
  function bindInteractiveElements(): void {
    bindRatingStars();
    bindFileUploads();
    bindSignaturePads();
  }

  function bindRatingStars(): void {
    document.querySelectorAll<HTMLElement>('.mf-rating .mf-star').forEach(function (star: HTMLElement) {
      star.addEventListener('click', function () {
        var val = star.getAttribute('data-val')!;
        var container = star.closest('.mf-rating')!;
        (container.querySelector<HTMLInputElement>('input[type="hidden"]') as HTMLInputElement).value = val;
        container.querySelectorAll<HTMLElement>('.mf-star').forEach(function (s: HTMLElement) {
          s.style.color = parseInt(s.getAttribute('data-val')!) <= parseInt(val) ? '#fbbf24' : '#d0d5dd';
        });
      });
    });
  }

  function bindFileUploads(): void {
    function parseAllowedList(raw: string): string[] {
      return (raw || '').toLowerCase().split(',').map(function (s: string) { return s.trim(); }).filter(Boolean);
    }
    function setHiddenValue(hidden: HTMLInputElement | null, filesMeta: any[]): void {
      if (!hidden) return;
      hidden.value = filesMeta.length ? JSON.stringify(filesMeta) : '';
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function renderList(list: HTMLElement | null, filesMeta: any[], uploading: boolean): void {
      if (!list) return;
      var html = filesMeta.map(function (m: any) {
        var sizeKb = m && m.fileSize ? ' (' + (Number(m.fileSize) / 1024).toFixed(1) + ' KB)' : '';
        return '<div class="mf-file-item"><span>📎 ' + esc(String((m && m.fileName) || 'file')) + sizeKb + '</span></div>';
      }).join('');
      if (uploading) html += '<div class="mf-file-item"><span>⏳ ' + esc(tr('widget.file.uploading', 'Uploading…')) + '</span></div>';
      list.innerHTML = html;
    }
    async function uploadOne(file: File, fieldKey: string): Promise<any> {
      var form = new FormData();
      form.append('file', file);
      form.append('formId', String(config.formId));
      form.append('fieldKey', fieldKey);
      var res = await fetch((config.apiBaseUrl || '/api/MegaForm/') + 'Upload/File', {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      var json = await res.json();
      if (!res.ok || (json && json.error)) throw new Error((json && json.error) || tr('widget.file.upload_failed', 'Upload failed'));
      return json;
    }
    document.querySelectorAll<HTMLElement>('.mf-file-dropzone').forEach(function (zone: HTMLElement) {
      var input = zone.querySelector<HTMLInputElement>('input[type="file"]');
      var hidden = zone.querySelector<HTMLInputElement>('input[type="hidden"]');
      if (!input || !hidden) return;
      var fieldKey = input.getAttribute('data-field-key') || hidden.name || '';
      var fieldCfg: any = null;
      (config.schema?.fields || []).forEach(function (f: FormField) { if (f.key === fieldKey) fieldCfg = f; });
      var fs: any = (fieldCfg && fieldCfg.fileSettings) || {};
      var maxFiles = Math.max(1, Number(fs.maxFiles || 1));
      var maxSizeBytes = (fs.maxSizeMB || 10) * 1024 * 1024;
      var allowedTypes: string = Array.isArray(fs.allowedTypes || fs.allowedExtensions)
        ? (fs.allowedTypes || fs.allowedExtensions).join(',')
        : (fs.allowedTypes || fs.allowedExtensions || '');
      var allowed = parseAllowedList(allowedTypes);
      var list = zone.querySelector<HTMLElement>('.mf-file-list');
      var errEl3 = fieldKey ? document.getElementById('mf-err-' + fieldKey) : null;

      zone.addEventListener('click', function () { input.click(); });
      zone.addEventListener('dragover', function (e: Event) { e.preventDefault(); zone.classList.add('mf-file-dragover'); });
      zone.addEventListener('dragleave', function () { zone.classList.remove('mf-file-dragover'); });
      zone.addEventListener('drop', function (e: Event) {
        e.preventDefault();
        zone.classList.remove('mf-file-dragover');
        var dt = (e as DragEvent).dataTransfer;
        if (dt && dt.files.length) { input.files = dt.files; input.dispatchEvent(new Event('change')); }
      });
      input.addEventListener('change', async function () {
        if (errEl3) { errEl3.textContent = ''; errEl3.style.display = 'none'; }
        if (list) list.innerHTML = '';
        var errors: string[] = [];
        var selected = Array.from(input.files || []);
        if (selected.length > maxFiles) selected = selected.slice(0, maxFiles);
        selected.forEach(function (f: File) {
          if (f.size > maxSizeBytes) { errors.push(tr('widget.file.exceeds_limit', '{file} exceeds {max}MB limit', { file: f.name, max: (fs.maxSizeMB || 10) })); return; }
          if (allowed.length > 0) {
            var ext = '.' + f.name.split('.').pop()!.toLowerCase();
            if (allowed.indexOf(ext) === -1) { errors.push(tr('widget.file.type_not_allowed_details', '{file}: type not allowed. Accepted: {types}', { file: f.name, types: allowedTypes })); return; }
          }
        });
        if (errors.length > 0) {
          input.value = '';
          setHiddenValue(hidden, []);
          if (list) list.innerHTML = '';
          if (errEl3) { errEl3.textContent = errors.join('; '); errEl3.style.display = ''; }
          return;
        }
        try {
          renderList(list, [], true);
          zone.classList.add('is-uploading');
          var uploaded: any[] = [];
          for (var i = 0; i < selected.length; i++) {
            uploaded.push(await uploadOne(selected[i], fieldKey));
            renderList(list, uploaded, i < selected.length - 1);
          }
          setHiddenValue(hidden, uploaded);
          zone.classList.remove('is-uploading');
        } catch (err: any) {
          zone.classList.remove('is-uploading');
          input.value = '';
          setHiddenValue(hidden, []);
          if (list) list.innerHTML = '';
          if (errEl3) { errEl3.textContent = (err && err.message) ? err.message : tr('widget.file.upload_failed', 'Upload failed'); errEl3.style.display = ''; }
        }
      });
      try {
        var existing = hidden.value ? JSON.parse(hidden.value) : [];
        if (existing && existing.length) renderList(list, existing, false);
      } catch (_existingErr) { }
    });
  }

  function bindSignaturePads(): void {
    document.querySelectorAll<HTMLButtonElement>('.mf-sig-clear').forEach(function (btn: HTMLButtonElement) {
      var canvasId = btn.getAttribute('data-canvas')!;
      var canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var drawing = false;
      var hiddenInput = canvas.parentElement ? canvas.parentElement.querySelector<HTMLInputElement>('input[type="hidden"]') : null;

      function resizeCanvas(): void {
        var rect = canvas!.getBoundingClientRect();
        var dpr = Math.max(window.devicePixelRatio || 1, 1);
        var width = Math.max(1, Math.round(rect.width * dpr));
        var height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas!.width === width && canvas!.height === height) return;
        var snapshot = (canvas!.width > 0 && canvas!.height > 0) ? canvas!.toDataURL('image/png') : '';
        canvas!.width = width;
        canvas!.height = height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111827';
        if (snapshot) {
          var img = new Image();
          img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); saveSignatureData(); };
          img.src = snapshot;
        }
      }

      function getPoint(clientX: number, clientY: number): { x: number; y: number } {
        var rect = canvas!.getBoundingClientRect();
        var dpr = Math.max(window.devicePixelRatio || 1, 1);
        var scaleX = rect.width > 0 ? canvas!.width / rect.width / dpr : 1;
        var scaleY = rect.height > 0 ? canvas!.height / rect.height / dpr : 1;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
      }

      function saveSignatureData(): void {
        if (!hiddenInput) return;
        var blank = document.createElement('canvas');
        blank.width = canvas!.width; blank.height = canvas!.height;
        hiddenInput.value = canvas!.toDataURL() === blank.toDataURL() ? '' : canvas!.toDataURL('image/png');
      }

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      canvas.addEventListener('mousedown', function (e: MouseEvent) { resizeCanvas(); drawing = true; var p = getPoint(e.clientX, e.clientY); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
      canvas.addEventListener('mousemove', function (e: MouseEvent) { if (!drawing) return; var p = getPoint(e.clientX, e.clientY); ctx.lineTo(p.x, p.y); ctx.stroke(); });
      canvas.addEventListener('mouseup',   function () { drawing = false; saveSignatureData(); });
      canvas.addEventListener('mouseleave',function () { if (drawing) { drawing = false; saveSignatureData(); } });
      canvas.addEventListener('touchstart', function (e: TouchEvent) { e.preventDefault(); resizeCanvas(); drawing = true; var t = e.touches[0]; var p = getPoint(t.clientX, t.clientY); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
      canvas.addEventListener('touchmove',  function (e: TouchEvent) { e.preventDefault(); if (!drawing) return; var t = e.touches[0]; var p = getPoint(t.clientX, t.clientY); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
      canvas.addEventListener('touchend',   function () { drawing = false; saveSignatureData(); });
      btn.addEventListener('click', function () { ctx.clearRect(0, 0, canvas!.width, canvas!.height); if (hiddenInput) hiddenInput.value = ''; });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════
  function flattenFields(fields: FormField[]): FormField[] {
    var result: FormField[] = [];
    (fields || []).forEach(function (f: FormField) {
      if (f.type === 'Row' && f.columns) {
        result.push(f);
        f.columns.forEach(function (col: ColumnDef) {
          (col.fields || []).forEach(function (cf: FormField) { result.push(cf); });
        });
      } else {
        result.push(f);
      }
    });
    return result;
  }


  function optionProps(field: any): any {
    return Object.assign({}, (field && field.properties) || {}, (field && field.widgetProps) || {}, field || {});
  }

  function getOptionDisplay(field: any): string {
    var props = optionProps(field);
    var raw = String(props.optionDisplay || props.choiceDisplay || props.optionVariant || '').toLowerCase().trim();
    if (raw === 'chip' || raw === 'chips' || raw === 'pill' || raw === 'pills' || raw === 'tags') return 'chips';
    if (raw === 'card' || raw === 'cards' || raw === 'rich-card' || raw === 'rich-cards' || raw === 'richcards') return 'cards';
    return 'default';
  }

  function optionHtmlEnabled(field: any, opt?: any): boolean {
    var props = optionProps(field);
    return props.allowOptionHtml === true ||
      props.optionLabelMode === 'html' ||
      (opt && opt.allowHtml === true) ||
      !!(opt && (opt.richHtml || opt.labelHtml || opt.html));
  }

  function sanitizeOptionHtml(html: string): string {
    if (typeof document === 'undefined') return esc(html);
    var template = document.createElement('template');
    template.innerHTML = String(html || '');
    var allowedTags = ['a','b','br','code','div','em','i','li','ol','p','small','span','strong','sub','sup','u','ul'];
    var globalAttrs = ['class','title','aria-label'];
    var walk = function(node: Node): void {
      Array.prototype.slice.call(node.childNodes).forEach(function(child: Node) {
        if (child.nodeType === Node.COMMENT_NODE) {
          if (child.parentNode) child.parentNode.removeChild(child);
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        var el = child as HTMLElement;
        var tag = el.tagName.toLowerCase();
        if (allowedTags.indexOf(tag) === -1) {
          if (el.parentNode) el.parentNode.replaceChild(document.createTextNode(el.textContent || ''), el);
          return;
        }
        Array.prototype.slice.call(el.attributes).forEach(function(attr: Attr) {
          var name = attr.name.toLowerCase();
          var value = attr.value || '';
          var allowed = globalAttrs.indexOf(name) !== -1 || (tag === 'a' && ['href','target','rel'].indexOf(name) !== -1);
          if (!allowed || name.indexOf('on') === 0 || name === 'style' || /^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
        });
        if (tag === 'a') {
          el.setAttribute('rel', 'noopener noreferrer');
          if (!el.getAttribute('target')) el.setAttribute('target', '_blank');
        }
        walk(el);
      });
    };
    walk(template.content);
    return template.innerHTML;
  }

  function renderOptionPart(field: any, opt: any, value: any, htmlCapable?: boolean): string {
    var text = String(value == null ? '' : value);
    if (!text) return '';
    return htmlCapable && optionHtmlEnabled(field, opt) ? sanitizeOptionHtml(text) : esc(text);
  }

  function getOptionGroupClass(field: FormField): string {
    var count = Array.isArray(field.options) ? field.options.length : 0;
    var parsed = parseInt(String((field as any).optionColumns || ''), 10);
    var display = getOptionDisplay(field);
    var cols = parsed > 0 ? Math.min(Math.max(parsed, 1), 4) : (display === 'cards' ? 1 : (count >= 9 ? 3 : count >= 6 ? 2 : 1));
    var classes = ['mf-option-group'];
    if (display !== 'default') classes.push('mf-option-group--' + display);
    if (cols > 1) classes.push('mf-option-group--cols', 'mf-cols-' + cols);
    else if (parsed === 1) classes.push('mf-cols-1');
    return classes.join(' ');
  }

  function renderOptionItem(inputType: string, name: string, opt: any, checked: boolean, field: FormField): string {
    var display = getOptionDisplay(field);
    var value = String((opt && (opt.value != null ? opt.value : opt.label)) || '');
    var labelSource = (opt && (opt.richHtml || opt.labelHtml || opt.html || opt.label || opt.value)) || '';
    var description = (opt && (opt.description || opt.desc || opt.helpText || opt.subLabel)) || '';
    var meta = (opt && (opt.meta || opt.location || opt.kicker)) || '';
    var icon = (opt && (opt.icon || opt.iconHtml)) || '';
    var badge = (opt && opt.badge) || '';
    var classes = ['mf-option-item'];
    if (display !== 'default') classes.push('mf-option-item--' + display);
    if (checked) classes.push('is-checked');
    if (optionHtmlEnabled(field, opt)) classes.push('mf-option-item--html');
    var iconHtml = icon ? '<span class="mf-option-icon" aria-hidden="true">' + renderOptionPart(field, opt, icon, true) + '</span>' : '';
    var metaHtml = meta ? '<span class="mf-option-meta">' + renderOptionPart(field, opt, meta, true) + '</span>' : '';
    var descHtml = description ? '<span class="mf-option-desc">' + renderOptionPart(field, opt, description, true) + '</span>' : '';
    var badgeHtml = badge ? '<span class="mf-option-badge">' + renderOptionPart(field, opt, badge, false) + '</span>' : '';
    var checkHtml = display === 'cards' ? '<span class="mf-option-check" aria-hidden="true">&#10003;</span>' : '';
    return '<label class="' + classes.join(' ') + '">' +
      '<input class="mf-option-control" type="' + inputType + '" name="' + name + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="mf-option-ui">' + iconHtml + '<span class="mf-option-copy"><span class="mf-option-label">' + renderOptionPart(field, opt, labelSource, true) + '</span>' + metaHtml + descHtml + '</span>' + badgeHtml + checkHtml + '</span>' +
      '</label>';
  }

  function esc(s: string | undefined | null): string {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function balancePageParts(parts: string[]): string[] {
    var openTagStack: string[] = [];
    var balanced: string[] = [];
    var trackTags = ['div','section','main','article','table','thead','tbody','tfoot','tr','td','th','ul','ol','li','nav','header','footer','aside','fieldset'];
    for (var pi = 0; pi < parts.length; pi++) {
      var part = openTagStack.join('') + parts[pi];
      var tagRegex = /<(\/?)([\w]+)(?:\s[^>]*)?>/g;
      var stack: Array<{ tag: string; full: string }> = [];
      var match: RegExpExecArray | null;
      while ((match = tagRegex.exec(part)) !== null) {
        var isClose = match[1] === '/';
        var tag = match[2].toLowerCase();
        if (trackTags.indexOf(tag) === -1) continue;
        if (match[0].indexOf('/>') !== -1) continue;
        if (!isClose) { stack.push({ tag: tag, full: match[0] }); }
        else { for (var si = stack.length - 1; si >= 0; si--) { if (stack[si].tag === tag) { stack.splice(si, 1); break; } } }
      }
      for (var ci = stack.length - 1; ci >= 0; ci--) part += '</' + stack[ci].tag + '>';
      openTagStack = stack.map(function (s: { tag: string; full: string }) { return s.full; });
      balanced.push(part);
    }
    return balanced;
  }

  function rebuildFieldPages(pageParts: string[]): void {
    fieldPages = [];
    var usedFields = new Set<string>();
    pageParts.forEach(function (part: string, idx: number) {
      var pageFieldList: FormField[] = [];
      config.schema!.fields!.forEach(function (f: FormField) {
        if (usedFields.has(f.key)) return;
        if (part.indexOf('data-key="' + f.key + '"') !== -1 || part.indexOf('name="' + f.key + '"') !== -1) {
          pageFieldList.push(f); usedFields.add(f.key);
        }
      });
      if (idx === pageParts.length - 1) {
        config.schema!.fields!.forEach(function (f: FormField) {
          if (!usedFields.has(f.key)) { pageFieldList.push(f); usedFields.add(f.key); }
        });
      }
      fieldPages.push(pageFieldList);
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════
  return { init: init, collectData: collectData, applyRuleEffects: applyRuleEffects, socialShareBadge: RENDERER_SOCIAL_SHARE_BADGE };

})();

// Register on window for script-tag usage (Web, DNN, Oqtane)
if (typeof window !== 'undefined') {
  (window as any).MegaFormRenderer = MegaFormRenderer;
  (window as any).__MegaFormRendererSocialShareBadge = RENDERER_SOCIAL_SHARE_BADGE;
  (window as any).__MegaFormChromelessEmbedHostBadge = CHROMELESS_EMBED_HOST_BADGE;
  (window as any).__MegaFormRendererSchemaStringBadge = RENDERER_SCHEMA_STRING_BADGE;
  (window as any).__MegaFormRendererBootWaitBadge = RENDERER_BOOT_WAIT_BADGE;
  (window as any).__MegaFormOqtaneRootJsBadge = OQTANE_ROOT_JS_BADGE;
  (window as any).__MegaFormOqtaneIndexCompileBadge = OQTANE_INDEX_COMPILE_BADGE;
  (window as any).__MegaFormOqtaneInlineScriptResourceBadge = OQTANE_INLINE_SCRIPT_RESOURCE_BADGE;
}
