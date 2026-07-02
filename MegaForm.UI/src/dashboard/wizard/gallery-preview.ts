// [WizardGalleryPreview 2026-07-02] Live template thumbnails + in-memory preview modal
// for the Form Creation Wizard's Template Gallery. Ported from builder/gallery.ts (which the
// dashboard bundle can't import — separate bundle), adapted to the wizard's WizardTemplate
// shape and kept fully self-contained:
//   • buildTemplateThumbnail(t) → a *live* card thumbnail: an <iframe srcdoc> render of the
//     custom-shell HTML for premium templates, or a mock field-skeleton for standard ones.
//   • openTemplatePreview(t, onUse) → a full preview dialog that renders the template with the
//     real MegaFormRenderer engine in memory when present (window.MegaFormRenderer), else a
//     static mock. "Use this template" fires onUse() (the gallery then picks it into the wizard).
//
// No form is ever created by previewing — everything is rendered in memory.
import { getPlatformHostConfig } from '@shared/platform-host';
import { WizardTemplate } from './templates';

type AnyObj = any;

// ── escaping ──────────────────────────────────────────────────────────────────
function escHtml(value: any): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escAttr(value: any): string { return escHtml(value); }
function escRegExp(value: string): string { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function getApiBase(): string {
  const cfg: any = getPlatformHostConfig() || {};
  const base = String(cfg.apiBase || '/api/MegaForm/');
  return base.replace(/\/?$/, '/');
}

// ── template stats (walks the field tree once) ──────────────────────────────────
function collectTemplateStats(tpl: AnyObj): AnyObj {
  const info: AnyObj = {
    items: [], fields: [], fieldCount: 0, hiddenCount: 0, sectionCount: 0,
    pageBreakCount: 0, rowCount: 0, htmlBlockCount: 0,
    customLayout: !!(tpl && (tpl.customHtml || (tpl.settings && tpl.settings.customHtml))),
  };
  function walk(list: any[]): void {
    (list || []).forEach((field: AnyObj) => {
      if (!field) return;
      const type = String(field.type || '').toLowerCase();
      if (type === 'section') {
        info.sectionCount += 1;
        if (field.properties && field.properties.pageBreak) info.pageBreakCount += 1;
        info.items.push({ kind: 'section', field }); return;
      }
      if (type === 'row') {
        info.rowCount += 1;
        info.items.push({ kind: 'row', field });
        (field.columns || []).forEach((col: AnyObj) => walk((col && col.fields) || []));
        return;
      }
      if (type === 'html') { info.htmlBlockCount += 1; info.items.push({ kind: 'html', field }); return; }
      if (type === 'hidden') { info.hiddenCount += 1; info.items.push({ kind: 'hidden', field }); return; }
      info.fieldCount += 1; info.items.push({ kind: 'field', field }); info.fields.push(field);
    });
  }
  walk((tpl && tpl.fields) || []);
  info.pageCount = Math.max(1, info.pageBreakCount + (info.fieldCount || info.sectionCount || info.rowCount || info.htmlBlockCount ? 1 : 0));
  return info;
}

// ── field label / control helpers ──────────────────────────────────────────────
function getFieldLabel(field: AnyObj): string {
  return String((field && (field.label || field.title || field.key || field.name)) || 'Untitled Field');
}
function getFieldPlaceholder(field: AnyObj): string {
  const placeholder = field && field.placeholder;
  if (placeholder) return String(placeholder);
  const type = String((field && field.type) || 'Text').toLowerCase();
  if (type === 'email') return 'name@example.com';
  if (type === 'phone') return '+84 900 000 000';
  if (type === 'date') return 'Select date';
  if (type === 'number') return '0';
  if (type === 'textarea') return 'Type your answer';
  return 'Enter ' + getFieldLabel(field).toLowerCase();
}
function getFieldKindText(field: AnyObj): string {
  const type = String((field && field.type) || 'Text');
  const map: Record<string, string> = {
    Text: 'text', Textarea: 'textarea', Select: 'select', Checkbox: 'checkbox', Radio: 'radio',
    Email: 'email', Phone: 'phone', Date: 'date', File: 'upload', Payment: 'payment', PayNow: 'payment', Paypal: 'payment',
  };
  return map[type] || type.toLowerCase();
}
function getOptionLabels(field: AnyObj, limit?: number): string[] {
  const out: string[] = [];
  ((field && field.options) || []).slice(0, limit || 3).forEach((opt: AnyObj) => {
    out.push(String((opt && (opt.label || opt.value)) || 'Option'));
  });
  return out;
}

// ── static preview (fallback when the renderer isn't on the page) ───────────────
function buildFieldControlHtml(field: AnyObj, compact: boolean): string {
  const type = String((field && field.type) || 'Text').toLowerCase();
  const label = escHtml(getFieldLabel(field));
  const placeholder = escHtml(getFieldPlaceholder(field));
  let control = '';
  let options: string[];
  switch (type) {
    case 'textarea':
      control = '<div class="tpl-pv-control tpl-pv-control-textarea">' + placeholder + '</div>'; break;
    case 'select':
      options = getOptionLabels(field, compact ? 2 : 3);
      control = '<div class="tpl-pv-control tpl-pv-control-select"><span>' + (options.length ? escHtml(options[0]) : placeholder) + '</span><i class="fa-solid fa-chevron-down"></i></div>'; break;
    case 'checkbox':
    case 'radio':
      options = getOptionLabels(field, compact ? 2 : 3);
      control = '<div class="tpl-pv-options">' + options.map((opt) =>
        '<span class="tpl-pv-option"><i class="fa-regular ' + (type === 'checkbox' ? 'fa-square' : 'fa-circle') + '"></i>' + escHtml(opt) + '</span>').join('') + '</div>'; break;
    case 'file':
      control = '<div class="tpl-pv-control tpl-pv-control-upload"><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload a file</span></div>'; break;
    case 'rating':
      control = '<div class="tpl-pv-rating">★★★★★</div>'; break;
    case 'signature':
      control = '<div class="tpl-pv-control tpl-pv-control-signature"><i class="fa-solid fa-signature"></i><span>Signature area</span></div>'; break;
    case 'payment':
    case 'paypal':
    case 'paynow':
      control = '<div class="tpl-pv-control tpl-pv-control-payment"><i class="fa-solid fa-credit-card"></i><span>Payment step</span></div>'; break;
    default:
      control = '<div class="tpl-pv-control tpl-pv-control-input">' + placeholder + '</div>'; break;
  }
  return '<div class="tpl-pv-field">'
    + '<div class="tpl-pv-label-row"><label>' + label + '</label><span class="tpl-pv-type">' + escHtml(getFieldKindText(field)) + '</span></div>'
    + control + '</div>';
}

function buildGenericPreview(fields: any[]): string {
  const html: string[] = [];
  function walk(list: any[]): void {
    (list || []).forEach((field: AnyObj) => {
      if (!field) return;
      const type = String(field.type || '').toLowerCase();
      if (type === 'section') { html.push('<div class="tpl-pv-section">' + escHtml(getFieldLabel(field)) + '</div>'); return; }
      if (type === 'html') { html.push('<div class="tpl-pv-html-block"><i class="fa-solid fa-code"></i><span>Custom HTML block</span></div>'); return; }
      if (type === 'row') {
        const cols = (field.columns || []).map((col: AnyObj) => '<div class="tpl-pv-col">' + buildGenericPreview((col && col.fields) || []) + '</div>').join('');
        html.push('<div class="tpl-pv-row">' + cols + '</div>'); return;
      }
      if (type === 'hidden') return;
      html.push(buildFieldControlHtml(field, false));
    });
  }
  walk(fields || []);
  return html.join('');
}

// ── mock "token" field (used to fill {{field:key}} slots in custom-shell HTML) ───
function buildMockTokenField(field: AnyObj, compact?: boolean): string {
  const type = String((field && field.type) || 'Text').toLowerCase();
  const label = escHtml(getFieldLabel(field));
  const placeholder = escHtml(getFieldPlaceholder(field));
  const rootCls = 'tpl-token-field' + (compact ? ' tpl-token-field-compact' : '');
  const inputCls = 'tpl-token-input' + (compact ? ' tpl-token-input-compact' : '');
  if (type === 'checkbox' || type === 'radio') {
    return '<div class="' + rootCls + ' tpl-token-field-options"><div class="tpl-token-label">' + label + '</div>'
      + '<div class="tpl-token-options' + (compact ? ' compact' : '') + '">' + getOptionLabels(field, compact ? 2 : 3).map((opt) =>
        '<span class="tpl-token-option"><i class="fa-regular ' + (type === 'checkbox' ? 'fa-square' : 'fa-circle') + '"></i>' + escHtml(opt) + '</span>').join('') + '</div></div>';
  }
  if (type === 'select') return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-select">' + placeholder + '<i class="fa-solid fa-chevron-down"></i></div></div>';
  if (type === 'textarea') return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-textarea">' + placeholder + '</div></div>';
  if (type === 'file') return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-upload"><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload file</span></div></div>';
  if (type === 'payment' || type === 'paypal' || type === 'paynow') return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-payment"><i class="fa-solid fa-credit-card"></i><span>Payment widget</span></div></div>';
  return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + '">' + placeholder + '</div></div>';
}

// ── strip active content from author custom HTML before we render it in-page ─────
function sanitizeCustomPreviewHtml(html: string): string {
  html = String(html || '');
  try {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<!DOCTYPE html><html><body>' + html + '</body></html>', 'text/html');
      doc.querySelectorAll('script,noscript,iframe,object,embed,meta[http-equiv="refresh"],link[rel="preload"][as="script"],link[rel="modulepreload"]').forEach((node) => {
        node.parentNode && node.parentNode.removeChild(node);
      });
      doc.querySelectorAll('*').forEach((el) => {
        Array.prototype.slice.call(el.attributes || []).forEach((attr: Attr) => {
          const name = String(attr.name || '').toLowerCase();
          const value = String(attr.value || '');
          if (!name) return;
          if (name.indexOf('on') === 0 || name === 'srcdoc') { el.removeAttribute(attr.name); return; }
          if ((name === 'src' || name === 'href' || name === 'xlink:href' || name === 'formaction') && /^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
        });
      });
      html = doc.body ? doc.body.innerHTML : html;
    }
  } catch { /* */ }
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/<object[\s\S]*?<\/object>/gi, '');
  html = html.replace(/<embed[^>]*>/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '');
  html = html.replace(/\s(?:src|href|xlink:href|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '');
  return html;
}

// ── resolve a custom-shell template: swap {{form:*}} / {{field:*}} / {{content:*}} ─
function customHtmlOf(tpl: AnyObj): string { return String(tpl.customHtml || (tpl.settings && tpl.settings.customHtml) || ''); }
function customCssOf(tpl: AnyObj): string { return String(tpl.customCss || (tpl.settings && tpl.settings.customCss) || ''); }

function buildResolvedCustomTemplateHtml(tpl: AnyObj, compact?: boolean): string {
  let html = customHtmlOf(tpl);
  if (!html) return '';
  const stats = collectTemplateStats(tpl);
  const fieldsByKey: Record<string, string> = {};
  stats.fields.forEach((field: AnyObj) => { if (field && field.key) fieldsByKey[String(field.key)] = buildMockTokenField(field, compact); });
  const contentValues = ((tpl.settings && (tpl.settings.customContent || tpl.settings.CustomContent)) || tpl.customContent || {}) as Record<string, unknown>;
  html = sanitizeCustomPreviewHtml(html);
  html = html.replace(/\{\{form:title\}\}/g, escHtml(tpl.title || 'Untitled Form'));
  html = html.replace(/\{\{form:description\}\}/g, escHtml(tpl.description || ''));
  html = html.replace(/\{\{form:submit\}\}/g, '<span class="tpl-token-submit-label">' + escHtml(tpl.submitButtonText || 'Submit') + '</span>');
  html = html.replace(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g, (_m: string, key: string) => escHtml(String((contentValues as any)[key] || '')));
  Object.keys(fieldsByKey).forEach((key) => { html = html.replace(new RegExp('\\{\\{field:' + escRegExp(key) + '\\}\\}', 'g'), fieldsByKey[key]); });
  html = html.replace(/\{\{field:[^}]+\}\}/g, '<div class="tpl-token-field tpl-token-field-missing' + (compact ? ' tpl-token-field-compact' : '') + '"><div class="tpl-token-label">Field</div><div class="tpl-token-input' + (compact ? ' tpl-token-input-compact' : '') + '">Field placeholder</div></div>');
  return html;
}

function buildCustomPreview(tpl: AnyObj): string {
  const html = buildResolvedCustomTemplateHtml(tpl, false);
  const css = customCssOf(tpl);
  if (!html) return '';
  return '<div class="tpl-preview-live tpl-preview-live-custom">'
    + '<style>' + css + '</style>'
    + '<div class="tpl-preview-custom-banner"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Custom layout preview · rendered from template HTML/CSS in memory</span></div>'
    + '<div class="tpl-preview-custom-body">' + html + '</div></div>';
}

// ── live card thumbnail ─────────────────────────────────────────────────────────
function buildCustomThumbnailMarkup(tpl: AnyObj): string {
  const html = buildResolvedCustomTemplateHtml(tpl, true);
  const css = customCssOf(tpl);
  if (!html) return '';
  const srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=760, initial-scale=1"><style>'
    + 'html,body{margin:0;padding:0;background:#ffffff;color:#0f172a;font-family:Inter,Segoe UI,Arial,sans-serif;}'
    + 'body{width:760px;min-height:520px;overflow:hidden;}'
    + '.tpl-thumb-doc{padding:18px;box-sizing:border-box;min-height:520px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);}'
    + '.tpl-thumb-doc .mfp,.tpl-thumb-doc form{pointer-events:none;}'
    + '.tpl-token-field{margin-bottom:10px;}'
    + '.tpl-token-label{margin-bottom:5px;color:#0f172a;font-size:11px;font-weight:700;line-height:1.35;}'
    + '.tpl-token-input{min-height:28px;border-radius:10px;border:1px solid #dbe4f0;background:#ffffff;color:#64748b;padding:7px 10px;box-sizing:border-box;font-size:11px;display:flex;align-items:center;justify-content:space-between;gap:8px;}'
    + '.tpl-token-input-textarea{min-height:58px;align-items:flex-start;padding-top:10px;}'
    + '.tpl-token-input-upload,.tpl-token-input-payment{justify-content:flex-start;}'
    + '.tpl-token-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}'
    + '.tpl-token-options.compact{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}'
    + '.tpl-token-option{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:6px 9px;border-radius:999px;border:1px solid #dbe4f0;background:#ffffff;color:#334155;font-size:10px;font-weight:600;line-height:1.3;box-sizing:border-box;}'
    + '.tpl-token-submit-label{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 16px;border-radius:999px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;font-weight:800;font-size:12px;}'
    + '.tpl-token-field-missing .tpl-token-input{border-style:dashed;color:#cbd5e1;}'
    + css
    + '</style></head><body><div class="tpl-thumb-doc">' + html + '</div></body></html>';
  return '<div class="tpl-thumb-live tpl-thumb-live-custom">'
    + '<div class="tpl-thumb-frame-shell">'
    + '<iframe class="tpl-thumb-frame" loading="lazy" tabindex="-1" aria-hidden="true" sandbox="allow-same-origin" srcdoc="' + escAttr(srcdoc) + '"></iframe>'
    + '</div><div class="tpl-thumb-live-fade"></div></div>';
}

/** Live card thumbnail HTML for a template: iframe render for custom-shell, mock skeleton otherwise.
 *  Returns '' when there is nothing to show (caller falls back to an icon). */
export function buildTemplateThumbnail(tpl: WizardTemplate): string {
  const stats = collectTemplateStats(tpl as AnyObj);
  if (stats.customLayout) {
    const live = buildCustomThumbnailMarkup(tpl as AnyObj);
    if (live) return live;
  }
  const snippets = stats.items.filter((item: AnyObj) => item.kind === 'field' || item.kind === 'section').slice(0, 4);
  if (!snippets.length) return '';
  return '<div class="tpl-mini-shell">'
    + '<div class="tpl-mini-head"><span></span><span></span><span></span></div>'
    + '<div class="tpl-mini-title"></div>'
    + snippets.map((item: AnyObj) => {
      if (item.kind === 'section') return '<div class="tpl-mini-section">' + escHtml(getFieldLabel(item.field)) + '</div>';
      const type = String((item.field && item.field.type) || 'Text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return '<div class="tpl-mini-row tpl-mini-row-options"><div class="tpl-mini-label"></div><div class="tpl-mini-option-line"></div><div class="tpl-mini-option-line short"></div></div>';
      if (type === 'textarea') return '<div class="tpl-mini-row"><div class="tpl-mini-label"></div><div class="tpl-mini-input tall"></div></div>';
      if (type === 'select') return '<div class="tpl-mini-row"><div class="tpl-mini-label"></div><div class="tpl-mini-input select"></div></div>';
      return '<div class="tpl-mini-row"><div class="tpl-mini-label"></div><div class="tpl-mini-input"></div></div>';
    }).join('') + '</div>';
}

// ── preview modal ───────────────────────────────────────────────────────────────
function buildPreviewStageHtml(tpl: AnyObj): string {
  const stats = collectTemplateStats(tpl);
  if (stats.customLayout) { const custom = buildCustomPreview(tpl); if (custom) return custom; }
  return '<div class="tpl-preview-live">'
    + '<div class="tpl-pv-head"><div class="tpl-pv-kicker">Template Preview</div><h3>' + escHtml(tpl.title || 'Untitled Form') + '</h3><p>' + escHtml(tpl.description || '') + '</p></div>'
    + '<div class="tpl-pv-body">' + buildGenericPreview((tpl && tpl.fields) || []) + '</div>'
    + '<div class="tpl-pv-footer"><button type="button" class="tpl-pv-submit" disabled>' + escHtml(tpl.submitButtonText || 'Submit') + '</button></div></div>';
}

function buildPreviewSummary(tpl: AnyObj): string {
  const stats = collectTemplateStats(tpl || {});
  const fieldLabels = stats.fields.slice(0, 7).map((field: AnyObj) => '<span class="tpl-preview-chip">' + escHtml(getFieldLabel(field)) + '</span>').join('');
  return '<div class="tpl-preview-summary-grid">'
    + '<div class="tpl-preview-stat"><strong>' + stats.fieldCount + '</strong><span>Fields</span></div>'
    + '<div class="tpl-preview-stat"><strong>' + stats.pageCount + '</strong><span>Pages</span></div>'
    + '<div class="tpl-preview-stat"><strong>' + stats.sectionCount + '</strong><span>Sections</span></div>'
    + '<div class="tpl-preview-stat"><strong>' + (stats.customLayout ? 'Yes' : 'No') + '</strong><span>Custom HTML</span></div></div>'
    + '<div class="tpl-preview-note">Preview uses the same MegaForm renderer engine in memory. No form is created until you choose <em>Use this template</em>.</div>'
    + '<div class="tpl-preview-chip-list">' + fieldLabels + '</div>';
}

function renderPreviewWithRenderer(stageEl: HTMLElement, tpl: AnyObj): boolean {
  try {
    const renderer = (window as any).MegaFormRenderer;
    if (!renderer || typeof renderer.init !== 'function') return false;
    const previewSchema = {
      version: '1.0',
      fields: JSON.parse(JSON.stringify((tpl && tpl.fields) || [])),
      settings: Object.assign({}, (tpl && tpl.settings) || {}, {
        customHtml: customHtmlOf(tpl),
        customCss: customCssOf(tpl),
        rules: (tpl && (tpl.rules || (tpl.settings && tpl.settings.rules))) || [],
        workflowTemplate: (tpl && (tpl.workflow || (tpl.settings && tpl.settings.workflowTemplate))) || null,
      }),
    };
    const previewId = 990000 + Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) % 100000);
    stageEl.innerHTML = '<div class="tpl-preview-render-host"></div>';
    const host = stageEl.querySelector('.tpl-preview-render-host') as HTMLElement | null;
    if (!host) return false;
    renderer.init({
      formId: previewId, container: host, apiBaseUrl: getApiBase(), apiBase: getApiBase(),
      schema: previewSchema, isPreview: true,
      title: String((tpl && tpl.title) || ''), description: String((tpl && tpl.description) || ''),
      submitButtonText: String((tpl && tpl.submitButtonText) || 'Submit'),
      successMessage: String((tpl && tpl.successMessage) || ''),
      rules: Array.isArray(tpl && tpl.settings && tpl.settings.rules) ? tpl.settings.rules : [],
    });
    return true;
  } catch (err) { try { console.warn('[MegaForm] Wizard preview renderer fallback:', err); } catch { /* */ } return false; }
}

let _previewModalEl: HTMLElement | null = null;
let _previewDevice: 'desktop' | 'tablet' | 'mobile' = 'desktop';
let _previewOnUse: (() => void) | null = null;

function ensurePreviewModal(): HTMLElement {
  if (_previewModalEl && _previewModalEl.isConnected) return _previewModalEl;
  const modal = document.createElement('div');
  modal.id = 'mfw-tpl-preview-modal';
  modal.className = 'tpl-preview-modal';
  modal.innerHTML = ''
    + '<div class="tpl-preview-backdrop" data-preview-close="1"></div>'
    + '<div class="tpl-preview-dialog">'
    + '  <div class="tpl-preview-top">'
    + '    <div class="tpl-preview-title-wrap"><div class="tpl-preview-kicker">Template Preview</div><h3 id="mfw-tpl-preview-title">Template</h3><p id="mfw-tpl-preview-description"></p></div>'
    + '    <div class="tpl-preview-top-actions">'
    + '      <div class="tpl-preview-devices">'
    + '        <button type="button" class="tpl-preview-device is-active" data-device="desktop"><i class="fa-solid fa-desktop"></i><span>Desktop</span></button>'
    + '        <button type="button" class="tpl-preview-device" data-device="tablet"><i class="fa-solid fa-tablet-screen-button"></i><span>Tablet</span></button>'
    + '        <button type="button" class="tpl-preview-device" data-device="mobile"><i class="fa-solid fa-mobile-screen"></i><span>Mobile</span></button>'
    + '      </div>'
    + '      <button type="button" class="tpl-preview-close" data-preview-close="1" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'
    + '    </div>'
    + '  </div>'
    + '  <div class="tpl-preview-content">'
    + '    <aside class="tpl-preview-sidebar">'
    + '      <div class="tpl-preview-summary" id="mfw-tpl-preview-summary"></div>'
    + '      <div class="tpl-preview-sidebar-actions">'
    + '        <button type="button" class="tpl-preview-primary" id="mfw-tpl-preview-use-btn"><i class="fa-solid fa-bolt"></i><span>Use this template</span></button>'
    + '        <button type="button" class="tpl-preview-secondary" data-preview-close="1">Close</button>'
    + '      </div>'
    + '    </aside>'
    + '    <div class="tpl-preview-stage-wrap"><div class="tpl-preview-stage is-desktop" id="mfw-tpl-preview-stage"></div></div>'
    + '  </div>'
    + '</div>';
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-preview-close="1"]')) { closeTemplatePreview(); return; }
    const btn = target.closest('.tpl-preview-device') as HTMLElement | null;
    if (btn) setPreviewDevice(String(btn.getAttribute('data-device') || 'desktop') as 'desktop' | 'tablet' | 'mobile');
  });
  const useBtn = modal.querySelector('#mfw-tpl-preview-use-btn') as HTMLButtonElement | null;
  if (useBtn) useBtn.addEventListener('click', () => { const cb = _previewOnUse; closeTemplatePreview(); if (cb) cb(); });
  document.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && modal.classList.contains('is-visible')) closeTemplatePreview(); });

  _previewModalEl = modal;
  return modal;
}

function setPreviewDevice(device: 'desktop' | 'tablet' | 'mobile'): void {
  _previewDevice = device;
  const modal = ensurePreviewModal();
  modal.querySelectorAll('.tpl-preview-device').forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-device') === device));
  const stage = modal.querySelector('#mfw-tpl-preview-stage') as HTMLElement | null;
  if (!stage) return;
  stage.classList.remove('is-desktop', 'is-tablet', 'is-mobile');
  stage.classList.add('is-' + device);
}

/** Open the in-memory preview dialog for a template. `onUse` fires when the user clicks "Use this template". */
export function openTemplatePreview(tpl: WizardTemplate, onUse: () => void): void {
  ensurePreviewCss();
  _previewOnUse = onUse;
  const modal = ensurePreviewModal();
  const titleEl = modal.querySelector('#mfw-tpl-preview-title') as HTMLElement | null;
  const descEl = modal.querySelector('#mfw-tpl-preview-description') as HTMLElement | null;
  const summaryEl = modal.querySelector('#mfw-tpl-preview-summary') as HTMLElement | null;
  const stageEl = modal.querySelector('#mfw-tpl-preview-stage') as HTMLElement | null;
  if (titleEl) titleEl.textContent = tpl.title || 'Template';
  if (descEl) descEl.textContent = tpl.description || 'Preview this template before adding it to your form.';
  if (summaryEl) summaryEl.innerHTML = buildPreviewSummary(tpl as AnyObj);
  if (stageEl && !renderPreviewWithRenderer(stageEl, tpl as AnyObj)) stageEl.innerHTML = buildPreviewStageHtml(tpl as AnyObj);
  setPreviewDevice(_previewDevice || 'desktop');
  modal.classList.add('is-visible');
  document.body.classList.add('tpl-preview-open');
}

export function closeTemplatePreview(): void {
  if (_previewModalEl) _previewModalEl.classList.remove('is-visible');
  document.body.classList.remove('tpl-preview-open');
}

// ── CSS (lifted from megaform-builder-shell.css; var(--font) → concrete stack, and
//    the preview modal z-index is bumped above the wizard/gallery overlays) ──────
const FONT = "'Inter',system-ui,-apple-system,sans-serif";
let previewCssInjected = false;
export function ensurePreviewCss(): void {
  if (previewCssInjected || document.getElementById('mfw-tpl-preview-style')) { previewCssInjected = true; return; }
  previewCssInjected = true;
  const s = document.createElement('style');
  s.id = 'mfw-tpl-preview-style';
  s.textContent = `
/* live thumbnail — mock skeleton */
.tpl-mini-shell{position:absolute;inset:0;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.08));border:1px solid rgba(255,255,255,.24);box-shadow:inset 0 1px 0 rgba(255,255,255,.18);overflow:hidden;padding:12px 12px 10px}
.tpl-mini-head{display:flex;align-items:center;gap:5px;margin-bottom:10px}
.tpl-mini-head span{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.7)}
.tpl-mini-title{width:54%;height:9px;border-radius:999px;background:rgba(255,255,255,.58);margin-bottom:12px}
.tpl-mini-row,.tpl-mini-section{position:relative;border-radius:12px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.16);margin-bottom:9px}
.tpl-mini-row{padding:9px 10px}
.tpl-mini-section{display:inline-flex;align-items:center;padding:4px 10px;font-size:9px;font-weight:800;letter-spacing:.04em;color:rgba(255,255,255,.96);text-transform:uppercase}
.tpl-mini-label{width:40%;height:5px;border-radius:999px;background:rgba(255,255,255,.58);margin-bottom:7px}
.tpl-mini-input,.tpl-mini-option-line{width:100%;height:10px;border-radius:999px;background:rgba(255,255,255,.28)}
.tpl-mini-input.tall{height:24px;border-radius:12px}
.tpl-mini-row-options .tpl-mini-option-line{margin-bottom:5px}
.tpl-mini-option-line.short{width:72%;margin-bottom:0}
/* live thumbnail — iframe render */
.tpl-thumb-live{position:absolute;inset:0;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.22)}
.tpl-thumb-frame-shell{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.tpl-thumb-frame{width:760px;height:520px;border:0;background:#fff;transform:scale(.315);transform-origin:top left;pointer-events:none}
.tpl-thumb-live-fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(15,23,42,.08) 100%);pointer-events:none}
.tpl-thumb-live-custom{box-shadow:inset 0 1px 0 rgba(255,255,255,.2)}
/* preview modal */
.tpl-preview-modal{position:fixed;inset:0;z-index:2147483647;display:none;font-family:${FONT}}
.tpl-preview-modal.is-visible{display:block}
.tpl-preview-modal *{box-sizing:border-box}
.tpl-preview-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.46);backdrop-filter:blur(6px)}
.tpl-preview-dialog{position:absolute;inset:28px;border-radius:28px;background:#f8fafc;box-shadow:0 32px 100px rgba(15,23,42,.28);overflow:hidden;display:flex;flex-direction:column}
.tpl-preview-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px 24px 18px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(248,250,252,.98))}
.tpl-preview-title-wrap h3{margin:4px 0 6px;font-size:1.4rem;line-height:1.2;color:#0f172a}
.tpl-preview-title-wrap p{margin:0;color:#64748b;font-size:.87rem;line-height:1.5}
.tpl-preview-kicker{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6366f1}
.tpl-preview-top-actions{display:flex;align-items:center;gap:12px}
.tpl-preview-devices{display:inline-flex;align-items:center;gap:6px;padding:4px;border-radius:999px;background:#eef2ff;border:1px solid #c7d2fe}
.tpl-preview-device{display:inline-flex;align-items:center;gap:6px;height:2rem;padding:0 .85rem;border-radius:999px;background:transparent;border:0;cursor:pointer;color:#475569;font:800 .72rem/1 ${FONT}}
.tpl-preview-device.is-active{background:#fff;color:#312e81;box-shadow:0 10px 24px rgba(99,102,241,.16)}
.tpl-preview-close{width:2.4rem;height:2.4rem;border-radius:999px;border:0;cursor:pointer;background:#fff;color:#334155;box-shadow:0 10px 24px rgba(15,23,42,.08)}
.tpl-preview-content{flex:1;min-height:0;display:grid;grid-template-columns:320px minmax(0,1fr)}
.tpl-preview-sidebar{padding:22px;border-right:1px solid #e2e8f0;background:linear-gradient(180deg,#fff,#f8fafc);display:flex;flex-direction:column;gap:18px;overflow-y:auto}
.tpl-preview-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tpl-preview-stat{padding:14px;border-radius:18px;background:#fff;border:1px solid #e2e8f0}
.tpl-preview-stat strong{display:block;font-size:1.15rem;color:#0f172a}
.tpl-preview-stat span{display:block;margin-top:4px;font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
.tpl-preview-note{padding:14px 15px;border-radius:16px;background:#eef2ff;color:#4338ca;font-size:.82rem;line-height:1.5}
.tpl-preview-chip-list{display:flex;flex-wrap:wrap;gap:8px}
.tpl-preview-chip{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;background:#fff;border:1px solid #dbe4f0;color:#334155;font-size:.75rem;font-weight:700}
.tpl-preview-sidebar-actions{display:flex;flex-direction:column;gap:10px;margin-top:auto}
.tpl-preview-primary,.tpl-preview-secondary{height:2.7rem;border-radius:999px;border:0;cursor:pointer;font:800 .8rem/1 ${FONT}}
.tpl-preview-primary{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}
.tpl-preview-secondary{background:#fff;border:1px solid #dbe4f0;color:#334155}
.tpl-preview-stage-wrap{padding:22px;overflow:auto;background:radial-gradient(circle at top,rgba(148,163,184,.12),transparent 36%),linear-gradient(180deg,#f8fafc,#eef2f7)}
.tpl-preview-stage{margin:0 auto;transition:width .18s ease}
.tpl-preview-stage.is-desktop{width:min(100%,980px)}
.tpl-preview-stage.is-tablet{width:min(100%,760px)}
.tpl-preview-stage.is-mobile{width:min(100%,430px)}
.tpl-preview-live{background:#fff;border:1px solid #dbe4f0;border-radius:28px;box-shadow:0 18px 48px rgba(15,23,42,.08);overflow:hidden}
.tpl-pv-head{padding:28px 28px 16px;border-bottom:1px solid #edf2f7;background:linear-gradient(180deg,#fff,#fcfdff)}
.tpl-pv-kicker{font-size:.72rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#6366f1}
.tpl-pv-head h3{margin:7px 0 8px;font-size:1.45rem;line-height:1.2;color:#0f172a}
.tpl-pv-head p{margin:0;color:#64748b;line-height:1.6}
.tpl-pv-body{padding:24px 28px}
.tpl-pv-section{margin:2px 0 14px;font-size:.78rem;font-weight:800;letter-spacing:.08em;color:#6366f1;text-transform:uppercase}
.tpl-pv-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:14px}
.tpl-pv-col{min-width:0}
.tpl-pv-field{margin-bottom:14px}
.tpl-pv-label-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}
.tpl-pv-label-row label{color:#0f172a;font-size:.84rem;font-weight:700}
.tpl-pv-type{color:#94a3b8;font-size:.67rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.tpl-pv-control,.tpl-token-input{min-height:46px;border-radius:14px;border:1px solid #dbe4f0;background:#fff;color:#94a3b8;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.tpl-pv-control-textarea,.tpl-token-input-textarea{min-height:94px;padding-top:14px;align-items:flex-start}
.tpl-pv-control-upload,.tpl-pv-control-payment,.tpl-pv-control-signature,.tpl-token-input-upload,.tpl-token-input-payment{justify-content:center;color:#64748b;font-weight:700;background:#f8fafc}
.tpl-pv-options,.tpl-token-options{display:flex;flex-wrap:wrap;gap:10px}
.tpl-pv-option,.tpl-token-option{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 12px;border-radius:999px;background:#f8fafc;border:1px solid #dbe4f0;color:#475569;font-size:.8rem;font-weight:600}
.tpl-pv-html-block{min-height:76px;margin-bottom:14px;border-radius:18px;border:1px dashed #cbd5e1;background:#f8fafc;color:#64748b;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:700}
.tpl-pv-rating{color:#f59e0b;letter-spacing:.12em;font-size:1.05rem}
.tpl-pv-footer{padding:18px 28px 26px;border-top:1px solid #edf2f7;background:#fff}
.tpl-pv-submit{width:100%;height:3rem;border-radius:999px;border:0;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font:800 .85rem/1 ${FONT};opacity:.92}
.tpl-preview-live-custom{overflow:hidden}
.tpl-preview-custom-banner{display:flex;align-items:center;gap:.55rem;padding:16px 18px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,#eef2ff,#f8fafc);color:#4338ca;font-size:.8rem;font-weight:700}
.tpl-preview-custom-body{position:relative;padding:20px}
.tpl-preview-custom-body .mfp,.tpl-preview-custom-body form{pointer-events:none}
.tpl-token-field{margin-bottom:14px}
.tpl-token-field-compact{margin-bottom:10px}
.tpl-token-input-compact{min-height:34px;padding:8px 10px;font-size:.76rem}
.tpl-token-options.compact{gap:8px}
.tpl-token-label{margin-bottom:6px;color:#0f172a;font-size:.82rem;font-weight:700}
.tpl-token-field-missing .tpl-token-input{border-style:dashed;color:#cbd5e1}
.tpl-token-submit-label{display:inline-flex;align-items:center}
.tpl-preview-open{overflow:hidden}
@media (max-width:1180px){.tpl-preview-dialog{inset:20px}.tpl-preview-content{grid-template-columns:290px minmax(0,1fr)}}
@media (max-width:820px){.tpl-preview-content{grid-template-columns:1fr;overflow-y:auto}.tpl-preview-sidebar{border-right:0;border-bottom:1px solid #e2e8f0}}
`;
  document.head.appendChild(s);
}
