// Wizard step 2 — Fields: palette + field list + the multi-step STEPS panel.
// formPages[] maps 1:1 to MegaForm Section pageBreak (see transform.ts).
import { WizardData, SetFn, WizardField, FormPage, FIELD_TYPES, fieldMeta } from './types';
import { h, icon, toggle } from './ui';

let counter = 2000;
const fid = () => 'wf-' + (++counter);
let activePageId = 'page-1';
export function resetFields(): void { activePageId = 'page-1'; }

// ── Field palette (10 types) ──
function palette(onAdd: (type: string) => void): HTMLElement {
  return h('div', null, [
    h('div', { class: 'mfw-flbl', style: 'margin-bottom:8px' }, 'Add field'),
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(5,1fr);margin-bottom:14px' },
      FIELD_TYPES.map(ft => h('button', { type: 'button', class: 'mfw-pick', style: 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px', onclick: () => onAdd(ft.type) }, [
        h('span', { style: 'width:30px;height:30px;border-radius:9px;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center' }, [icon(ft.icon)]),
        h('span', { style: 'font-size:11px;font-weight:600;color:#475569' }, ft.label),
      ]))
    ),
  ]);
}

// ── One field row ──
function fieldRow(f: WizardField, onLabel: (id: string, v: string) => void, onReq: (id: string) => void, onDel: (id: string) => void): HTMLElement {
  const m = fieldMeta(f.type);
  return h('div', { style: 'display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:11px;background:#fff;padding:8px 10px;margin-bottom:7px' }, [
    h('span', { style: 'color:#cbd5e1;cursor:grab' }, [icon('fa-grip-vertical')]),
    h('span', { style: 'width:28px;height:28px;border-radius:8px;background:#f1f5f9;color:#6366f1;display:flex;align-items:center;justify-content:center;flex:0 0 28px' }, [icon(m.icon)]),
    h('input', { class: 'mfw-in', style: 'height:32px;border:0;font-weight:600;flex:1;padding:0', value: f.label, oninput: (e: any) => onLabel(f.id, e.target.value) }),
    h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8' }, [document.createTextNode('Req'), toggle(f.required, () => onReq(f.id))]),
    h('button', { type: 'button', style: 'border:0;background:none;color:#cbd5e1;cursor:pointer', title: 'Delete', onclick: () => onDel(f.id) }, [icon('fa-trash-can')]),
  ]);
}

function fieldListEl(fields: WizardField[], onAdd: (t: string) => void, onLabel: (id: string, v: string) => void, onReq: (id: string) => void, onDel: (id: string) => void, emptyLabel: string): HTMLElement {
  return h('div', null, [
    palette(onAdd),
    h('div', { class: 'mfw-flbl', style: 'margin-bottom:8px' }, 'Fields'),
    fields.length
      ? h('div', null, fields.map(f => fieldRow(f, onLabel, onReq, onDel)))
      : h('div', { style: 'border:1.5px dashed #e2e8f0;border-radius:12px;padding:26px;text-align:center;color:#94a3b8' }, [
          h('div', { style: 'font-size:22px;margin-bottom:4px' }, [icon('fa-circle-plus')]),
          h('div', { style: 'font-size:13px' }, emptyLabel),
        ]),
  ]);
}

export function renderFields(data: WizardData, set: SetFn): HTMLElement {
  const total = data.isMultiStep ? data.formPages.reduce((n, p) => n + p.fields.length, 0) : data.fields.length;

  // ── single-page handlers ──
  const sAdd = (t: string) => set({ fields: [...data.fields, { id: fid(), type: t, label: fieldMeta(t).label, required: false }] });
  const sLabel = (id: string, v: string) => { const f = data.fields.find(x => x.id === id); if (f) f.label = v; set({}, { rerender: false }); };
  const sReq = (id: string) => set({ fields: data.fields.map(f => f.id === id ? { ...f, required: !f.required } : f) });
  const sDel = (id: string) => set({ fields: data.fields.filter(f => f.id !== id) });

  // ── multi-page helpers ──
  const active = data.formPages.find(p => p.id === activePageId) || data.formPages[0];
  const patchActive = (mut: (p: FormPage) => FormPage) => set({ formPages: data.formPages.map(p => p.id === active.id ? mut(p) : p) });
  const pAdd = (t: string) => patchActive(p => ({ ...p, fields: [...p.fields, { id: fid(), type: t, label: fieldMeta(t).label, required: false }] }));
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
    return h('div', null, [header, h('div', { class: 'mfw-card', style: 'background:#fafbfc' }, [fieldListEl(data.fields, sAdd, sLabel, sReq, sDel, 'No fields yet — click a type above to add')])]);
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
    fieldListEl(active.fields, pAdd, pLabel, pReq, pDel, 'No fields on ' + active.title),
  ]);

  return h('div', null, [header, h('div', { style: 'display:flex;gap:12px;background:#f8fafc;border-radius:14px;padding:8px' }, [sidebar, editor])]);
}
