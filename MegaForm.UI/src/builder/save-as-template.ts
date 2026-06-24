// ============================================================
// MegaForm Builder — Save as Template
// ----------------------------------------------------------------
// Lets the form author publish the current form to the Builder
// Template Gallery (POST /api/MegaForm/BuilderTemplates/UploadJson).
// Pure DOM dialog + fetch, no extra dependencies. Toolbar wires
// a click handler on #mf-btn-save-as-template that calls
// openSaveAsTemplateDialog(getCurrentPayload).
// ============================================================

import { MegaFormBuilder } from './core';

export const SAVE_AS_TEMPLATE_BADGE = 'BuilderSaveAsTemplate v20260518-02';
if (typeof window !== 'undefined') {
  (window as any).__MF_BUILDER_SAVE_AS_TEMPLATE_BADGE__ = SAVE_AS_TEMPLATE_BADGE;
}

const B: any = MegaFormBuilder;

/** Producer that returns the canonical save payload (toolbar's buildPayload). */
export type PayloadProducer = (status: string) => any;

function getApiBase(): string {
  let base = String((B && B.state && B.state.config && B.state.config.apiBaseUrl) || '/api/MegaForm/');
  if (base.charAt(base.length - 1) !== '/') base += '/';
  return base;
}

function getDnnAuthHeaders(): Record<string, string> {
  // [BuilderSaveAsTemplateAuth v20260518-02] DNN's [ValidateAntiForgeryToken]
  // requires the RequestVerificationToken header. ServicesFramework returns
  // it for the page's module instance. Mirror the same pattern used by
  // dashboard/index.ts dnnAuthHeaders() so the POST passes the antiforgery
  // check that previously failed with 401.
  const headers: Record<string, string> = {};
  try {
    const ctx: any = (window as any).__MF_PLATFORM__ || {};
    const platform = String(ctx.platform || '').toLowerCase();
    if (platform !== 'dnn') {
      // Oqtane: send Bearer token + site-id when host injected them.
      if (ctx.authToken) headers['Authorization'] = 'Bearer ' + ctx.authToken;
      if (ctx.siteId)    headers['X-Oqtane-SiteId'] = String(ctx.siteId);
      return headers;
    }
    const moduleId = ctx.moduleId || ctx.instanceId || B?.state?.config?.moduleId || 0;
    const sf = (window as any).jQuery?.ServicesFramework?.(moduleId);
    if (sf) {
      headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
      headers['TabId']    = String(sf.getTabId());
      headers['ModuleId'] = String(sf.getModuleId());
    }
  } catch (_e) { /* ServicesFramework not available */ }
  return headers;
}

function toast(msg: string, kind: 'success' | 'error' | 'info' = 'info'): void {
  const t = document.createElement('div');
  t.className = 'mf-sat-toast mf-sat-toast--' + kind;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('is-visible'); }, 16);
  setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 320); }, 4000);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function field(label: string, ctrl: HTMLElement, hint?: string): HTMLElement {
  const wrap = el('label', 'mf-sat-field');
  wrap.appendChild(el('span', 'mf-sat-label', label));
  wrap.appendChild(ctrl);
  if (hint) wrap.appendChild(el('small', 'mf-sat-hint', hint));
  return wrap;
}

/**
 * Build the JSON record the backend stores. Matches the shape that
 * BuilderTemplateCatalogStore.Normalize expects + that the gallery
 * already produces for uploaded templates (createUploadedTemplatePayload).
 */
function buildTemplateRecord(payload: any, meta: { title: string; description: string; category: string; icon: string; }): any {
  let schema: any = {};
  try { schema = payload && payload.SchemaJson ? JSON.parse(payload.SchemaJson) : {}; } catch (_e) { schema = {}; }
  let settings: any = {};
  try { settings = payload && payload.SettingsJson ? JSON.parse(payload.SettingsJson) : (schema.settings || {}); } catch (_e) { settings = schema.settings || {}; }
  let rules: any[] = [];
  try { rules = payload && payload.RulesJson ? JSON.parse(payload.RulesJson) : (settings.rules || schema.rules || []); } catch (_e) { rules = []; }

  const customHtml = String((schema.settings && schema.settings.customHtml) || settings.customHtml || '');
  const customCss  = String((schema.settings && schema.settings.customCss)  || settings.customCss  || '');
  const workflow   = schema.workflow || settings.workflowTemplate || null;
  const fields     = Array.isArray(schema.fields) ? schema.fields : [];

  return {
    title:            meta.title.trim(),
    description:      meta.description.trim() || 'Form template saved from Builder',
    category:         meta.category.trim() || 'Custom',
    categories:       [meta.category.trim() || 'Custom'],
    icon:             meta.icon.trim() || '📄',
    fields,
    submitButtonText: payload && payload.SubmitButtonText ? payload.SubmitButtonText : (settings.submitButtonText || 'Submit'),
    successMessage:   payload && payload.SuccessMessage   ? payload.SuccessMessage   : (settings.successMessage   || ''),
    customHtml,
    customCss,
    rules,
    workflow,
    settings: Object.assign({}, settings, { customHtml, customCss, rules, workflowTemplate: workflow }),
  };
}

async function postTemplate(tpl: any): Promise<{ ok: boolean; data?: any; error?: string }> {
  const form = new FormData();
  form.append('templateJson', JSON.stringify(tpl));
  try {
    const res = await fetch(getApiBase() + 'BuilderTemplates/UploadJson', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: getDnnAuthHeaders(),
    });
    if (!res.ok) {
      let msg = 'Save failed (' + res.status + ')';
      try { const j = await res.json(); msg = (j && (j.error || j.message)) || msg; } catch (_e) { /* ignore */ }
      return { ok: false, error: msg };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: 'Network error: ' + (e && e.message ? e.message : String(e)) };
  }
}

/**
 * Open the modal. `getPayload` must be the toolbar's buildPayload function
 * so the dialog always reads the FRESH builder state at submit time
 * (not the state at button-mount time).
 */
export function openSaveAsTemplateDialog(getPayload: PayloadProducer): void {
  // Pre-fill title from the canvas title field if present
  const defaultTitle = String((B.getVal && B.getVal(B.EL && B.EL.canvasTitle)) || '').trim() || 'My Custom Form Template';
  const defaultDesc  = String((B.getVal && B.getVal(B.EL && B.EL.canvasDescription)) || '').trim();

  const ov = el('div', 'mf-sat-overlay');
  const card = el('div', 'mf-sat-card');
  const head = el('div', 'mf-sat-head');
  head.appendChild(el('div', 'mf-sat-title-bar', 'Save form as template'));
  const closeBtn = el('button', 'mf-sat-close', '×'); closeBtn.type = 'button';
  head.appendChild(closeBtn);
  card.appendChild(head);

  const subtitle = el('div', 'mf-sat-sub', 'The current form schema (fields, custom HTML/CSS, rules, workflow) will be saved to the template gallery for reuse.');
  card.appendChild(subtitle);

  const body = el('div', 'mf-sat-body');
  const titleInp = el('input', 'mf-sat-input'); (titleInp as HTMLInputElement).type = 'text'; (titleInp as HTMLInputElement).value = defaultTitle;
  const descInp  = el('textarea', 'mf-sat-input mf-sat-textarea') as HTMLTextAreaElement; descInp.rows = 3; descInp.value = defaultDesc;
  const catInp   = el('input', 'mf-sat-input') as HTMLInputElement; catInp.type = 'text'; catInp.value = 'Custom';
  const iconInp  = el('input', 'mf-sat-input mf-sat-input--small') as HTMLInputElement; iconInp.type = 'text'; iconInp.value = '📄'; iconInp.maxLength = 4;

  body.appendChild(field('Template name', titleInp, 'Required. Shown as the card title in the gallery.'));
  body.appendChild(field('Description',  descInp,  'Optional. Short summary of what this template is for.'));
  body.appendChild(field('Category',     catInp,   'Used as the gallery filter chip (e.g. HR, Sales, Survey).'));
  body.appendChild(field('Icon',         iconInp,  'One emoji shown on the template card.'));
  card.appendChild(body);

  const foot = el('div', 'mf-sat-foot');
  const cancelBtn = el('button', 'mf-sat-btn', 'Cancel'); (cancelBtn as HTMLButtonElement).type = 'button';
  const saveBtn   = el('button', 'mf-sat-btn mf-sat-btn--primary', 'Save to Gallery'); (saveBtn as HTMLButtonElement).type = 'button';
  foot.appendChild(cancelBtn);
  foot.appendChild(saveBtn);
  card.appendChild(foot);

  ov.appendChild(card);
  document.body.appendChild(ov);
  setTimeout(() => { ov.classList.add('is-visible'); (titleInp as HTMLInputElement).focus(); (titleInp as HTMLInputElement).select(); }, 16);

  const close = () => { ov.classList.remove('is-visible'); setTimeout(() => ov.remove(), 220); };
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  ov.addEventListener('click', (ev) => { if (ev.target === ov) close(); });
  document.addEventListener('keydown', function onKey(ev) {
    if (ev.key === 'Escape' && document.body.contains(ov)) { close(); document.removeEventListener('keydown', onKey); }
  });

  saveBtn.addEventListener('click', async () => {
    const title = (titleInp as HTMLInputElement).value.trim();
    if (!title) { (titleInp as HTMLInputElement).focus(); toast('Template name is required.', 'error'); return; }
    (saveBtn as HTMLButtonElement).disabled = true;
    (saveBtn as HTMLButtonElement).textContent = 'Saving…';
    try {
      const payload = getPayload('Draft');
      const tpl = buildTemplateRecord(payload, {
        title,
        description: (descInp as HTMLTextAreaElement).value || '',
        category:    (catInp as HTMLInputElement).value || '',
        icon:        (iconInp as HTMLInputElement).value || '',
      });
      const result = await postTemplate(tpl);
      if (!result.ok) {
        toast(result.error || 'Save failed.', 'error');
        (saveBtn as HTMLButtonElement).disabled = false;
        (saveBtn as HTMLButtonElement).textContent = 'Save to Gallery';
        return;
      }
      toast('Template "' + title + '" saved to the gallery.', 'success');
      // Tell any open gallery to refresh its list
      try { window.dispatchEvent(new CustomEvent('mf-template-gallery-refresh', { detail: { source: 'save-as-template', saved: result.data } })); } catch (_e) { /* ignore */ }
      close();
    } catch (e: any) {
      toast('Save failed: ' + (e && e.message ? e.message : String(e)), 'error');
      (saveBtn as HTMLButtonElement).disabled = false;
      (saveBtn as HTMLButtonElement).textContent = 'Save to Gallery';
    }
  });
}
