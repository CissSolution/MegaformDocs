// Wizard step 1 — Setup: name, description, category, template.
import { WizardData, SetFn, CATEGORIES, TEMPLATES, FIELD_TYPES, WizardField } from './types';
import { h, icon } from './ui';

let counter = 1000;
const fid = () => 'wf-' + (++counter);

// Apply a template's field set to the wizard (flat single-page).
function applyTemplate(tplId: string, set: SetFn): void {
  const tpl = TEMPLATES.find(t => t.id === tplId);
  const fields: WizardField[] = (tpl?.fieldTypes || []).map(ft => {
    const meta = FIELD_TYPES.find(f => f.type === ft);
    return { id: fid(), type: ft, label: meta ? meta.label : 'Field', required: ft === 'email' };
  });
  set({ template: tplId, isMultiStep: false, fields });
}

export function renderSetup(data: WizardData, set: SetFn): HTMLElement {
  return h('div', null, [
    h('h2', null, 'Set up your form'),
    h('p', { class: 'sub' }, 'Give your form a name and choose a starting point.'),

    h('div', { style: 'margin-bottom:18px' }, [
      h('label', { class: 'mfw-flbl' }, [document.createTextNode('Form Name '), h('span', { class: 'mfw-req' }, '*')]),
      h('input', { class: 'mfw-in', placeholder: 'e.g. Employee Leave Request', value: data.formName, oninput: (e: any) => set({ formName: e.target.value }, { rerender: false }) }),
    ]),
    h('div', { style: 'margin-bottom:22px' }, [
      h('label', { class: 'mfw-flbl' }, 'Description (optional)'),
      h('textarea', { class: 'mfw-in', rows: '3', placeholder: 'Briefly describe the purpose of this form…', oninput: (e: any) => set({ formDescription: e.target.value }, { rerender: false }) }, data.formDescription || ''),
    ]),

    h('label', { class: 'mfw-flbl', style: 'margin-bottom:10px' }, 'Category'),
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(4,1fr);margin-bottom:24px' },
      CATEGORIES.map(c => h('button', { type: 'button', class: 'mfw-pick' + (data.category === c.id ? ' sel' : ''), style: 'display:flex;flex-direction:column;align-items:flex-start;gap:8px', onclick: () => set({ category: c.id }) }, [
        h('span', { style: 'width:30px;height:30px;border-radius:9px;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center' }, [icon(c.icon)]),
        h('span', { style: 'font-size:13px;font-weight:600' }, c.label),
      ]))
    ),

    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px' }, [
      h('label', { class: 'mfw-flbl', style: 'margin:0' }, 'Start from a template'),
    ]),
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(2,1fr)' },
      TEMPLATES.map(t => h('button', { type: 'button', class: 'mfw-pick' + (data.template === t.id ? ' sel' : ''), style: 'display:flex;align-items:center;gap:12px', onclick: () => applyTemplate(t.id, set) }, [
        h('span', { style: 'width:36px;height:36px;border-radius:10px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;flex:0 0 36px' }, [icon(t.icon)]),
        h('span', { style: 'min-width:0' }, [
          h('span', { style: 'display:flex;align-items:center;gap:7px' }, [h('b', { style: 'font-size:14px' }, t.label), t.badge ? h('span', { class: 'mfw-badge' }, t.badge) : null]),
          h('span', { style: 'font-size:12px;color:#94a3b8;display:block' }, t.desc + (t.fieldTypes.length ? ' · ' + t.fieldTypes.length + ' fields' : '')),
        ]),
      ]))
    ),
  ]);
}
