// Wizard step 2 — Fields: palette + field list + the multi-step STEPS panel.
// formPages[] maps 1:1 to MegaForm Section pageBreak (see transform.ts).
import { WizardData, SetFn, WizardField, FormPage } from './types';
import { curatedFields, fieldsInGroup, FIELD_GROUPS, catalogLabel, catalogIcon, buildFieldFromCatalog, FieldDef } from './field-catalog';
import { parseWizardStructure, fieldStepMap } from '@shared/custom-html-insert';
import { h, icon, toggle } from './ui';

let counter = 2000;
const fid = () => 'wf-' + (++counter);
let activePageId = 'page-1';
let paletteExpanded = false;
export function resetFields(): void { activePageId = 'page-1'; paletteExpanded = false; }

// ── Field palette: curated tiles + an expandable "more fields" registry view ──
function paletteTile(d: FieldDef, onAdd: (type: string) => void): HTMLElement {
  return h('button', { type: 'button', class: 'mfw-pick', title: d.label, style: 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px', onclick: () => onAdd(d.key) }, [
    h('span', { style: 'width:30px;height:30px;border-radius:9px;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center' }, [icon(d.icon)]),
    h('span', { style: 'font-size:11px;font-weight:600;color:#475569;text-align:center;line-height:1.2' }, d.label),
  ]);
}
function palette(onAdd: (type: string) => void, onMore: () => void): HTMLElement {
  const grid = (defs: FieldDef[]) => h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(5,1fr);margin-bottom:10px' }, defs.map(d => paletteTile(d, onAdd)));
  const children: Array<Node> = [
    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' }, [
      h('div', { class: 'mfw-flbl', style: 'margin:0' }, 'Add field'),
      h('button', { type: 'button', style: 'border:0;background:none;color:#6366f1;font-weight:700;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px', onclick: onMore }, [document.createTextNode(paletteExpanded ? 'Less' : 'More fields'), icon(paletteExpanded ? 'fa-chevron-up' : 'fa-chevron-down')]),
    ]),
  ];
  if (paletteExpanded) {
    FIELD_GROUPS.forEach(g => {
      const defs = fieldsInGroup(g.id);
      if (!defs.length) return;
      children.push(h('div', { class: 'mfw-flbl', style: 'margin:6px 0 6px;font-size:11px;color:#94a3b8' }, g.label));
      children.push(grid(defs));
    });
  } else {
    children.push(grid(curatedFields()));
  }
  return h('div', { style: 'margin-bottom:6px' }, children);
}

// ── One field row ──
function fieldRow(f: WizardField, onLabel: (id: string, v: string) => void, onReq: (id: string) => void, onDel: (id: string) => void): HTMLElement {
  return h('div', { style: 'display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:11px;background:#fff;padding:8px 10px;margin-bottom:7px' }, [
    h('span', { style: 'color:#cbd5e1;cursor:grab' }, [icon('fa-grip-vertical')]),
    h('span', { style: 'width:28px;height:28px;border-radius:8px;background:#f1f5f9;color:#6366f1;display:flex;align-items:center;justify-content:center;flex:0 0 28px' }, [icon(catalogIcon(f.type))]),
    h('input', { class: 'mfw-in', style: 'height:32px;border:0;font-weight:600;flex:1;padding:0', value: f.label, oninput: (e: any) => onLabel(f.id, e.target.value) }),
    h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8' }, [document.createTextNode('Req'), toggle(f.required, () => onReq(f.id))]),
    h('button', { type: 'button', style: 'border:0;background:none;color:#cbd5e1;cursor:pointer', title: 'Delete', onclick: () => onDel(f.id) }, [icon('fa-trash-can')]),
  ]);
}

function fieldListEl(fields: WizardField[], onAdd: (t: string) => void, onLabel: (id: string, v: string) => void, onReq: (id: string) => void, onDel: (id: string) => void, emptyLabel: string, onMore: () => void): HTMLElement {
  return h('div', null, [
    palette(onAdd, onMore),
    h('div', { class: 'mfw-flbl', style: 'margin-bottom:8px' }, 'Fields'),
    fields.length
      ? h('div', null, fields.map(f => fieldRow(f, onLabel, onReq, onDel)))
      : h('div', { style: 'border:1.5px dashed #e2e8f0;border-radius:12px;padding:26px;text-align:center;color:#94a3b8' }, [
          h('div', { style: 'font-size:22px;margin-bottom:4px' }, [icon('fa-circle-plus')]),
          h('div', { style: 'font-size:13px' }, emptyLabel),
        ]),
  ]);
}

// ── ③ PREMIUM (custom-shell) EDITOR ──────────────────────────────────────────
// Premium templates ship their own layout (customHtml + data-step panels + *_wizard
// scripts). They ARE editable here: fields are shown per step and can be added/removed. On
// Create, transform.ts reconciles customHtml via syncFieldPlaceholders — new fields inherit
// the template's field styling and land in the right data-step panel; removed fields' labels
// + review-summary rows are cleaned. The renderer's submit-guard keeps edited wizards
// submitting even when the *_wizard script's per-index validation references a removed field.
function collectFieldKeys(fields: any[]): Set<string> {
  const s = new Set<string>();
  (function walk(arr: any[]) { for (const f of arr || []) { if (f && f.key) s.add(String(f.key)); if (f && Array.isArray(f.columns)) for (const c of f.columns) walk(c.fields || []); } })(fields);
  return s;
}
function uniqueFieldKey(label: string, used: Set<string>): string {
  let base = String(label || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  let k = base, i = 2; while (used.has(k)) k = base + '_' + (i++); used.add(k); return k;
}
function premiumFieldIcon(f: any): string {
  if (f && f.type === 'Composite' && f.widgetProps && f.widgetProps.preset) return catalogIcon(f.widgetProps.preset);
  const M: Record<string, string> = { Select: 'fa-caret-down', MultiSelect: 'fa-list-check', Radio: 'fa-circle-dot', Checkbox: 'fa-square-check', Date: 'fa-calendar', Rating: 'fa-star', File: 'fa-paperclip', Signature: 'fa-signature', RichText: 'fa-paragraph', Row: 'fa-table-columns', Html: 'fa-heading', Section: 'fa-grip-lines', Hidden: 'fa-eye-slash', UniqueId: 'fa-fingerprint', Captcha: 'fa-shield-halved', TermsPrivacy: 'fa-file-contract' };
  return (f && M[f.type]) || 'fa-font';
}
function addFieldSelect(onPick: (catalogKey: string) => void): HTMLElement {
  return h('select', { class: 'mfw-in', style: 'height:34px;font-size:12px;background:#fff', onchange: (e: any) => { const v = e.target.value; e.target.value = ''; if (v) onPick(v); } },
    [h('option', { value: '' }, '+ Add field to this step…') as Node].concat(
      FIELD_GROUPS.map(g => h('optgroup', { label: g.label }, fieldsInGroup(g.id).map(d => h('option', { value: d.key }, d.label))))
    ));
}
function premiumRow(f: any, onLabel: (v: string) => void, onReq: () => void, onDel: () => void): HTMLElement {
  return h('div', { style: 'display:flex;align-items:center;gap:9px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:7px 10px;margin-bottom:6px' }, [
    h('span', { style: 'width:26px;height:26px;border-radius:7px;background:#f3e8ff;color:#7c3aed;display:flex;align-items:center;justify-content:center;flex:0 0 26px' }, [icon(premiumFieldIcon(f))]),
    h('input', { class: 'mfw-in', style: 'height:30px;border:0;font-weight:600;flex:1;padding:0', value: f.label || '', oninput: (e: any) => onLabel(e.target.value) }),
    h('label', { style: 'display:flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8' }, [document.createTextNode('Req'), toggle(!!f.required, onReq)]),
    h('button', { type: 'button', title: 'Remove field', style: 'border:0;background:none;color:#cbd5e1;cursor:pointer', onclick: onDel }, [icon('fa-trash-can')]),
  ]);
}

function premiumFieldsEditor(data: WizardData, set: SetFn): HTMLElement {
  const t = data.templateRecord || {};
  const html = String((t.settings && t.settings.customHtml) || '');
  const struct = parseWizardStructure(html);
  const stepMap = fieldStepMap(html);
  const fields: any[] = data.premiumFields || [];
  const used = collectFieldKeys(fields);
  const ownField = (f: any) => f && f.type !== 'Section' && f.type !== 'Hidden';

  // Annotate own fields with a display step ordinal (originals from the parsed shell; new
  // ones keep the ordinal assigned at add time).
  fields.forEach(f => { if (f && f.__step == null && f.key && stepMap[f.key]) f.__step = stepMap[f.key].ordinal; });

  const byKey = (k: string) => fields.find(f => f.key === k);
  const setLabel = (key: string, v: string) => { const f = byKey(key); if (f) f.label = v; set({}, { rerender: false }); };
  const toggleReq = (key: string) => { const f = byKey(key); if (f) f.required = !f.required; set({ premiumFields: fields.slice() }); };
  const removeKey = (key: string) => set({ premiumFields: fields.filter(f => f.key !== key) });
  const addField = (ordinal: number | null, stepVal: number | null, catalogKey: string) => {
    const label = catalogLabel(catalogKey);
    const nf = buildFieldFromCatalog(catalogKey, uniqueFieldKey(label, used), label, false);
    if (!nf) return;
    if (ordinal != null) nf.__step = ordinal;
    if (stepVal != null) nf.step = stepVal;
    // Insert right after the last field already in this step (else the nearest earlier step)
    // so syncFieldPlaceholders clones that sibling's wrapper → the new field lands in the
    // same data-step panel with the template's label styling.
    let insertAt = fields.length, found = false;
    if (ordinal != null) for (let target = ordinal; target >= 1 && !found; target--) {
      for (let i = fields.length - 1; i >= 0; i--) { if (fields[i].__step === target) { insertAt = i + 1; found = true; break; } }
    }
    const next = fields.slice(); next.splice(insertAt, 0, nf);
    set({ premiumFields: next });
  };

  const fieldRows = (stepFields: any[], ordinal: number | null, stepVal: number | null) => {
    const items = stepFields.map((f: any) => premiumRow(f, v => setLabel(f.key, v), () => toggleReq(f.key), () => removeKey(f.key)));
    return h('div', null, [
      items.length ? h('div', null, items) : h('div', { style: 'font-size:12px;color:#94a3b8;padding:4px 0 8px' }, 'No fields in this step'),
      h('div', { style: 'margin-top:6px' }, [addFieldSelect(ck => addField(ordinal, stepVal, ck))]),
    ]);
  };

  const cards: Array<Node> = [];
  if (struct.isWizard) {
    struct.steps.forEach((s, i) => {
      const ordinal = i + 1;
      const stepFields = fields.filter(f => ownField(f) && f.__step === ordinal);
      cards.push(h('div', { class: 'mfw-card', style: 'margin-bottom:12px' }, [
        h('div', { style: 'display:flex;align-items:center;gap:9px;margin-bottom:10px' }, [
          h('span', { style: 'width:24px;height:24px;border-radius:50%;background:#7c3aed;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 24px' }, String(ordinal)),
          h('div', { style: 'font-weight:700;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, s.stepLabel || ('Step ' + ordinal)),
          h('span', { style: 'font-size:11px;color:#94a3b8' }, stepFields.length + ' field' + (stepFields.length !== 1 ? 's' : '')),
        ]),
        fieldRows(stepFields, ordinal, s.step),
      ]));
    });
    const orphan = fields.filter(f => ownField(f) && f.__step == null);
    if (orphan.length) cards.push(h('div', { class: 'mfw-card', style: 'margin-bottom:12px' }, [h('div', { style: 'font-weight:700;font-size:13px;margin-bottom:8px' }, 'Other fields'), fieldRows(orphan, null, null)]));
  } else {
    cards.push(h('div', { class: 'mfw-card', style: 'margin-bottom:12px' }, [h('div', { style: 'font-weight:700;font-size:14px;margin-bottom:10px' }, 'Fields'), fieldRows(fields.filter(ownField), null, null)]));
  }

  return h('div', null, [
    h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:4px' }, [
      h('h2', { style: 'margin:0' }, 'Edit ' + (t.title || 'premium form')),
      h('span', { class: 'mfw-badge', style: 'color:#7c3aed;background:#7c3aed1a' }, 'Premium'),
    ]),
    h('p', { class: 'sub' }, struct.isWizard ? 'Add or remove fields in each step. The premium layout, styling and step flow stay in sync.' : 'Add or remove fields. The premium layout and styling stay in sync.'),
    ...cards,
    h('div', { style: 'display:flex;align-items:flex-start;gap:10px;border:1.5px dashed #ddd6fe;border-radius:12px;background:#faf5ff;padding:11px 13px;font-size:12px;color:#6b21a8;line-height:1.5' }, [
      h('span', { style: 'color:#7c3aed;margin-top:1px' }, [icon('fa-circle-info')]),
      document.createTextNode('New fields inherit the template’s field styling and drop into the right step; removed fields are cleaned from the layout and the review screen on Create.'),
    ]),
  ]);
}

export function renderFields(data: WizardData, set: SetFn): HTMLElement {
  if (data.templateIsPremium && data.templateRecord) return premiumFieldsEditor(data, set);

  const total = data.isMultiStep ? data.formPages.reduce((n, p) => n + p.fields.length, 0) : data.fields.length;
  const onMore = () => { paletteExpanded = !paletteExpanded; set({}, { rerender: true }); };

  // ── single-page handlers ──
  const sAdd = (t: string) => set({ fields: [...data.fields, { id: fid(), type: t, label: catalogLabel(t), required: false }] });
  const sLabel = (id: string, v: string) => { const f = data.fields.find(x => x.id === id); if (f) f.label = v; set({}, { rerender: false }); };
  const sReq = (id: string) => set({ fields: data.fields.map(f => f.id === id ? { ...f, required: !f.required } : f) });
  const sDel = (id: string) => set({ fields: data.fields.filter(f => f.id !== id) });

  // ── multi-page helpers ──
  const active = data.formPages.find(p => p.id === activePageId) || data.formPages[0];
  const patchActive = (mut: (p: FormPage) => FormPage) => set({ formPages: data.formPages.map(p => p.id === active.id ? mut(p) : p) });
  const pAdd = (t: string) => patchActive(p => ({ ...p, fields: [...p.fields, { id: fid(), type: t, label: catalogLabel(t), required: false }] }));
  const pLabel = (id: string, v: string) => { const f = active.fields.find(x => x.id === id); if (f) f.label = v; set({}, { rerender: false }); };
  const pReq = (id: string) => patchActive(p => ({ ...p, fields: p.fields.map(f => f.id === id ? { ...f, required: !f.required } : f) }));
  const pDel = (id: string) => patchActive(p => ({ ...p, fields: p.fields.filter(f => f.id !== id) }));

  const addPage = () => { const id = 'page-' + (++counter); activePageId = id; set({ formPages: [...data.formPages, { id, title: 'Step ' + (data.formPages.length + 1), fields: [] }] }); };
  const delPage = (id: string) => { if (data.formPages.length <= 1) return; const rest = data.formPages.filter(p => p.id !== id); if (activePageId === id) activePageId = rest[0].id; set({ formPages: rest }); };
  const renamePage = (id: string, v: string) => { const p = data.formPages.find(x => x.id === id); if (p) p.title = v; set({}, { rerender: false }); };

  const toggleMulti = (v: boolean) => {
    if (v) { activePageId = 'page-1'; set({ isMultiStep: true, formPages: [{ id: 'page-1', title: 'Step 1', fields: data.fields.slice() }, ...data.formPages.slice(1)] }); }
    else set({ isMultiStep: false, fields: data.formPages.flatMap(p => p.fields) });
  };

  const header = h('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px' }, [
    h('div', null, [h('h2', null, 'Build your form'), h('p', { class: 'sub', style: 'margin:4px 0 0' }, 'Add fields' + (data.isMultiStep ? ' to each step' : '') + '. ' + total + ' field' + (total !== 1 ? 's' : '') + ' total.')]),
    h('div', { style: 'display:flex;flex-direction:column;gap:8px;align-items:flex-end' }, [
      h('div', { class: 'mfw-card', style: 'display:flex;align-items:center;gap:12px;padding:9px 12px' }, [
        h('div', null, [h('div', { style: 'font-size:12px;font-weight:700' }, 'Multi-step form'), h('div', { style: 'font-size:10px;color:#94a3b8' }, 'Split fields into pages')]),
        toggle(data.isMultiStep, toggleMulti),
      ]),
      data.isMultiStep ? h('div', { class: 'mfw-card', style: 'display:flex;align-items:center;gap:12px;padding:9px 12px' }, [
        h('div', { style: 'font-size:12px;font-weight:600' }, 'Progress bar'),
        toggle(data.showProgressBar, (v) => set({ showProgressBar: v })),
      ]) : null,
    ]),
  ]);

  if (!data.isMultiStep) {
    return h('div', null, [header, h('div', { class: 'mfw-card', style: 'background:#fafbfc' }, [fieldListEl(data.fields, sAdd, sLabel, sReq, sDel, 'No fields yet — click a type above to add', onMore)])]);
  }

  // multi-step: steps sidebar + active page editor
  const sidebar = h('div', { style: 'width:170px;flex:0 0 170px;background:#fff;border-radius:11px;padding:9px;box-shadow:0 1px 3px rgba(15,23,42,.05)' }, [
    h('div', { class: 'mfw-flbl', style: 'margin-bottom:6px' }, 'Steps (' + data.formPages.length + ')'),
    ...data.formPages.map((page, i) => h('div', { style: 'position:relative;margin-bottom:4px' }, [
      h('button', { type: 'button', style: 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;border-radius:9px;padding:8px 9px;cursor:pointer;font-size:12px;font-weight:600;' + (page.id === activePageId ? 'background:#eef2ff;color:#6366f1' : 'background:none;color:#64748b'), onclick: () => { activePageId = page.id; set({}); }, ondblclick: () => { activePageId = page.id; set({}); } }, [
        h('span', { style: 'width:20px;height:20px;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 20px;' + (page.id === activePageId ? 'background:#6366f1;color:#fff' : 'background:#e2e8f0;color:#64748b') }, String(i + 1)),
        h('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, page.title),
        h('span', { style: 'font-size:9px;color:#94a3b8' }, String(page.fields.length)),
      ]),
      data.formPages.length > 1 ? h('button', { type: 'button', title: 'Remove step', style: 'position:absolute;right:-4px;top:-4px;width:16px;height:16px;border-radius:50%;border:0;background:#ef4444;color:#fff;font-size:9px;cursor:pointer;display:none', onclick: (e: any) => { e.stopPropagation(); delPage(page.id); } }, '✕') : null,
    ])),
    h('button', { type: 'button', style: 'display:flex;align-items:center;gap:6px;width:100%;border:1.5px dashed #cbd5e1;border-radius:9px;padding:8px;font-size:12px;font-weight:600;color:#64748b;background:none;cursor:pointer;margin-top:4px', onclick: addPage }, [icon('fa-plus'), document.createTextNode(' Add Step')]),
    h('div', { style: 'margin-top:10px;background:#f8fafc;border-radius:8px;padding:7px;text-align:center;font-size:10px;color:#94a3b8;font-weight:600' }, total + ' fields across ' + data.formPages.length + ' steps'),
  ]);
  // reveal delete X on hover
  sidebar.querySelectorAll('div[style*="position:relative"]').forEach(row => {
    const x = row.querySelector('button[title="Remove step"]') as HTMLElement | null;
    if (x) { row.addEventListener('mouseenter', () => x.style.display = 'block'); row.addEventListener('mouseleave', () => x.style.display = 'none'); }
  });

  const editor = h('div', { style: 'flex:1;min-width:0;background:#fff;border-radius:11px;padding:13px;box-shadow:0 1px 3px rgba(15,23,42,.05)' }, [
    h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:12px' }, [
      h('span', { style: 'width:20px;height:20px;border-radius:50%;background:#6366f1;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center' }, String(data.formPages.findIndex(p => p.id === active.id) + 1)),
      h('input', { class: 'mfw-in', style: 'height:28px;border:0;font-weight:700;font-size:14px;padding:0;flex:1', value: active.title, oninput: (e: any) => renamePage(active.id, e.target.value) }),
    ]),
    fieldListEl(active.fields, pAdd, pLabel, pReq, pDel, 'No fields on ' + active.title, onMore),
  ]);

  return h('div', null, [header, h('div', { style: 'display:flex;gap:12px;background:#f8fafc;border-radius:14px;padding:8px' }, [sidebar, editor])]);
}
