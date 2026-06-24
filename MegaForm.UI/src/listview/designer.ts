// ============================================================
// MegaForm ListView — Admin Configuration UI
// Lazy-loaded designer popup. Lets admins:
//   1. Pick which form (schema) the ListView shows submissions of
//   2. Toggle which fields appear as columns
//   3. Edit the row HTML template (with token cheat-sheet)
//   4. Preview how it renders against real submissions
//   5. Persist settings via host save callback (DNN/Oqtane wires this)
// ============================================================

import { ListViewRuntime } from './runtime';
import type { ListViewSchemaField } from './template';
import { escapeHtml } from './template';

export const LISTVIEW_DESIGNER_BADGE = 'ListViewDesigner v20260507-26';
if (typeof window !== 'undefined') (window as any).__MF_LISTVIEW_DESIGNER_BADGE__ = LISTVIEW_DESIGNER_BADGE;

export interface ListViewDesignerSettings {
  formId: number;
  fields: ListViewSchemaField[];
  rowTemplate: string;
  wrapperTemplate: string;
  pageSize: number;
  enableSearch: boolean;
  enableSort: boolean;
  emptyMessage: string;
  title: string;
}

export interface ListViewDesignerOptions {
  apiBase: string;
  initial: Partial<ListViewDesignerSettings>;
  onSave(next: ListViewDesignerSettings): Promise<void> | void;
  onClose?(): void;
  // [ListViewDesignerForms v20260507-26] Hosts that already loaded the form
  // list (e.g. the settings popup) can pass it in directly so the designer
  // doesn't need to refetch — avoids auth/route mismatch (DNN uses
  // /DesktopModules/.../Form/List, Oqtane uses /api/MegaForm/Form/List, etc.).
  forms?: FormSummary[];
  moduleId?: number;
  siteId?: number;
}

export interface FormSummary {
  formId: number;
  title: string;
  schemaJson?: string;
}

const TOKENS_HINT = `Available tokens: {{field:KEY}}, {{submission:id}}, {{submission:date}}, {{submission:status}}.`;

function defaultSettings(initial: Partial<ListViewDesignerSettings>): ListViewDesignerSettings {
  return {
    formId: Number(initial.formId || 0),
    fields: Array.isArray(initial.fields) ? initial.fields.slice() : [],
    rowTemplate: String(initial.rowTemplate || ''),
    wrapperTemplate: String(initial.wrapperTemplate || ''),
    pageSize: Number(initial.pageSize || 25),
    enableSearch: initial.enableSearch !== false,
    enableSort: initial.enableSort !== false,
    emptyMessage: String(initial.emptyMessage || 'No submissions yet.'),
    title: String(initial.title || ''),
  };
}

// [ListViewDesignerForms v20260507-26] Try the endpoints MegaForm exposes for
// listing forms in priority order. First two are the standard list endpoints
// (Form/List on DNN/Oqtane). Third is the ModuleConfig payload which embeds
// `forms` for the popup. Returns the first non-empty result.
async function fetchForms(apiBase: string, moduleId?: number, siteId?: number): Promise<FormSummary[]> {
  const base = apiBase.replace(/\/?$/, '/');
  const qsParts: string[] = [];
  if (moduleId && moduleId > 0) qsParts.push('moduleId=' + encodeURIComponent(String(moduleId)));
  if (siteId   && siteId   > 0) qsParts.push('siteId='   + encodeURIComponent(String(siteId)));
  const qs = qsParts.length ? '?' + qsParts.join('&') : '';

  const candidates = [
    base + 'Form/List' + qs,
    base + 'Forms'     + qs,
    moduleId && moduleId > 0 ? base + 'ModuleConfig/' + moduleId + qs : '',
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) continue;
      const body = await r.json().catch(() => null) as any;
      if (!body) continue;
      // ModuleConfig response: { config: …, forms: [ … ] }
      let arr: any[] = [];
      if (Array.isArray(body))           arr = body;
      else if (Array.isArray(body.forms))   arr = body.forms;
      else if (Array.isArray(body.Forms))   arr = body.Forms;
      else if (Array.isArray(body.items))   arr = body.items;
      else if (Array.isArray(body.Items))   arr = body.Items;
      const mapped = arr.map((f: any) => ({
        formId: Number(f.formId || f.FormId || 0),
        title: String(f.title || f.Title || ('Form #' + (f.formId || f.FormId || ''))),
        schemaJson: String(f.schemaJson || f.SchemaJson || ''),
      })).filter((f: FormSummary) => f.formId > 0);
      if (mapped.length > 0) return mapped;
    } catch { /* try next */ }
  }
  return [];
}

function extractFieldsFromSchema(schemaJson: string): ListViewSchemaField[] {
  if (!schemaJson) return [];
  let schema: any;
  try { schema = JSON.parse(schemaJson); } catch { return []; }
  const out: ListViewSchemaField[] = [];
  function walk(arr: any[]): void {
    for (const f of arr || []) {
      const type = String(f?.type || f?.Type || '');
      const cols = f?.columns || f?.Columns;
      if (type === 'Row' && Array.isArray(cols)) {
        for (const c of cols) walk(c?.fields || c?.Fields || []);
        continue;
      }
      if (['Html', 'Section', 'Hidden', 'Row'].indexOf(type) >= 0) continue;
      const key = String(f?.key || f?.Key || f?.id || f?.Id || '').trim();
      if (!key) continue;
      out.push({ key, label: String(f?.label || f?.Label || key), type });
    }
  }
  walk(schema?.fields || schema?.Fields || []);
  return out;
}

export async function openDesigner(opts: ListViewDesignerOptions): Promise<void> {
  void LISTVIEW_DESIGNER_BADGE;
  const settings = defaultSettings(opts.initial || {});

  // ── Modal scaffold ────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'mflv-d-overlay';
  overlay.innerHTML =
    '<div class="mflv-d-modal" role="dialog" aria-label="ListView settings" data-mflv-designer-badge="' + LISTVIEW_DESIGNER_BADGE + '">' +
      '<div class="mflv-d-hd">' +
        '<h3 class="mflv-d-title">ListView settings</h3>' +
        '<button type="button" class="mflv-d-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="mflv-d-body">' +
        '<div class="mflv-d-row"><label class="mflv-d-lbl">Form</label><select class="mflv-d-form-sel"><option value="0">— pick a form —</option></select></div>' +
        '<div class="mflv-d-row"><label class="mflv-d-lbl">Title</label><input type="text" class="mflv-d-title-inp" placeholder="(optional) shown above the list" /></div>' +
        '<div class="mflv-d-row"><label class="mflv-d-lbl">Visible fields</label><div class="mflv-d-fields"><div class="mflv-d-fields-empty">Pick a form first.</div></div></div>' +
        '<div class="mflv-d-row"><label class="mflv-d-lbl">Row template <small style="color:#94a3b8;font-weight:400">(optional — leave blank for auto)</small></label>' +
          '<textarea class="mflv-d-row-tpl" rows="4" placeholder="Default: one &lt;tr&gt; with selected fields" spellcheck="false"></textarea>' +
          '<small class="mflv-d-hint">' + TOKENS_HINT + '</small>' +
        '</div>' +
        '<div class="mflv-d-row mflv-d-row-2col">' +
          '<div><label class="mflv-d-lbl">Page size</label><input type="number" class="mflv-d-page-size" min="5" max="500" /></div>' +
          '<div><label class="mflv-d-lbl">Empty message</label><input type="text" class="mflv-d-empty-msg" /></div>' +
        '</div>' +
        '<div class="mflv-d-row mflv-d-row-flags">' +
          '<label class="mflv-d-flag"><input type="checkbox" class="mflv-d-search" checked /> Show search box</label>' +
          '<label class="mflv-d-flag"><input type="checkbox" class="mflv-d-sort" checked /> Allow column sort</label>' +
        '</div>' +
        '<div class="mflv-d-row"><label class="mflv-d-lbl">Live preview</label>' +
          '<div class="mflv-d-preview" data-mf-listview="1"></div>' +
        '</div>' +
      '</div>' +
      '<div class="mflv-d-ft">' +
        '<button type="button" class="mflv-d-btn mflv-d-btn-ghost mflv-d-btn-cancel">Cancel</button>' +
        '<button type="button" class="mflv-d-btn mflv-d-btn-primary mflv-d-btn-save">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  // ── Element refs ──────────────────────────────────────────
  const formSel  = overlay.querySelector('.mflv-d-form-sel')  as HTMLSelectElement;
  const titleInp = overlay.querySelector('.mflv-d-title-inp') as HTMLInputElement;
  const fieldsBox = overlay.querySelector('.mflv-d-fields')   as HTMLElement;
  const rowTplEl  = overlay.querySelector('.mflv-d-row-tpl')  as HTMLTextAreaElement;
  const pageSize  = overlay.querySelector('.mflv-d-page-size') as HTMLInputElement;
  const emptyMsg  = overlay.querySelector('.mflv-d-empty-msg') as HTMLInputElement;
  const searchCb  = overlay.querySelector('.mflv-d-search')   as HTMLInputElement;
  const sortCb    = overlay.querySelector('.mflv-d-sort')     as HTMLInputElement;
  const previewEl = overlay.querySelector('.mflv-d-preview')  as HTMLElement;
  const saveBtn   = overlay.querySelector('.mflv-d-btn-save') as HTMLButtonElement;
  const cancelBtn = overlay.querySelector('.mflv-d-btn-cancel') as HTMLButtonElement;
  const closeBtn  = overlay.querySelector('.mflv-d-close')    as HTMLButtonElement;

  // ── Hydrate from initial settings ─────────────────────────
  titleInp.value = settings.title;
  rowTplEl.value = settings.rowTemplate;
  pageSize.value = String(settings.pageSize);
  emptyMsg.value = settings.emptyMessage;
  searchCb.checked = settings.enableSearch;
  sortCb.checked   = settings.enableSort;

  // ── Populate forms dropdown ───────────────────────────────
  // [ListViewDesignerForms v20260507-26] Prefer injected list (settings popup
  // already loaded it), only fetch as fallback to keep the picker populated.
  const injected = Array.isArray(opts.forms) ? opts.forms.filter(f => f && f.formId > 0) : [];
  const forms = injected.length > 0 ? injected : await fetchForms(opts.apiBase, opts.moduleId, opts.siteId);
  forms.forEach(f => {
    const opt = document.createElement('option');
    opt.value = String(f.formId); opt.textContent = f.title;
    if (f.formId === settings.formId) opt.selected = true;
    formSel.appendChild(opt);
  });

  let currentFormFields: ListViewSchemaField[] = [];

  function refreshFields(): void {
    const formId = parseInt(formSel.value || '0', 10) || 0;
    settings.formId = formId;
    if (!formId) {
      fieldsBox.innerHTML = '<div class="mflv-d-fields-empty">Pick a form first.</div>';
      currentFormFields = [];
      schedulePreview();
      return;
    }
    const form = forms.find(f => f.formId === formId);
    currentFormFields = form ? extractFieldsFromSchema(form.schemaJson || '') : [];
    if (!currentFormFields.length) {
      fieldsBox.innerHTML = '<div class="mflv-d-fields-empty">No fields found in this form.</div>';
      schedulePreview(); return;
    }
    const selectedKeys = new Set(settings.fields.map(f => f.key));
    fieldsBox.innerHTML = currentFormFields.map(f => {
      const checked = selectedKeys.has(f.key) || settings.fields.length === 0;
      return '<label class="mflv-d-field">' +
        '<input type="checkbox" data-mflv-key="' + escapeHtml(f.key) + '"' + (checked ? ' checked' : '') + ' />' +
        '<span class="mflv-d-field-lbl">' + escapeHtml(f.label) + '</span>' +
        (f.type ? '<span class="mflv-d-field-type">' + escapeHtml(f.type) + '</span>' : '') +
      '</label>';
    }).join('');
    fieldsBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => { settings.fields = collectVisibleFields(); schedulePreview(); });
    });
    settings.fields = collectVisibleFields();
    schedulePreview();
  }

  function collectVisibleFields(): ListViewSchemaField[] {
    const out: ListViewSchemaField[] = [];
    fieldsBox.querySelectorAll('input[type="checkbox"]').forEach(el => {
      const cb = el as HTMLInputElement;
      if (!cb.checked) return;
      const key = cb.getAttribute('data-mflv-key') || '';
      const def = currentFormFields.find(f => f.key === key);
      if (def) out.push(def);
    });
    return out;
  }

  let _previewTimer: number | null = null;
  function schedulePreview(): void {
    if (_previewTimer) window.clearTimeout(_previewTimer);
    _previewTimer = window.setTimeout(runPreview, 250);
  }

  function runPreview(): void {
    if (!settings.formId) { previewEl.innerHTML = '<div class="mflv-empty">Pick a form to preview.</div>'; return; }
    previewEl.innerHTML = '';
    delete (previewEl as any).dataset.mfListviewBooted;
    void ListViewRuntime.init(previewEl, {
      formId: settings.formId,
      apiBase: opts.apiBase,
      fields: settings.fields,
      rowTemplate: rowTplEl.value,
      wrapperTemplate: '',
      pageSize: parseInt(pageSize.value || '25', 10) || 25,
      enableSearch: searchCb.checked,
      enableSort: sortCb.checked,
      emptyMessage: emptyMsg.value || 'No submissions yet.',
      title: titleInp.value,
    });
  }

  formSel.addEventListener('change', refreshFields);
  [titleInp, rowTplEl, pageSize, emptyMsg].forEach(el => el.addEventListener('input', schedulePreview));
  [searchCb, sortCb].forEach(el => el.addEventListener('change', schedulePreview));
  refreshFields();

  function close(): void {
    overlay.remove();
    if (opts.onClose) opts.onClose();
  }

  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  saveBtn.addEventListener('click', async () => {
    settings.title       = titleInp.value;
    settings.rowTemplate = rowTplEl.value;
    settings.pageSize    = parseInt(pageSize.value || '25', 10) || 25;
    settings.enableSearch = searchCb.checked;
    settings.enableSort   = sortCb.checked;
    settings.emptyMessage = emptyMsg.value || 'No submissions yet.';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try { await opts.onSave(settings); close(); }
    catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      console.error('[MegaForm.ListView] save failed', err);
      alert('Save failed: ' + ((err as any)?.message || err));
    }
  });
}
