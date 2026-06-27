// Wizard step 1 — Setup: name, description, category, template.
// Templates come from TWO sources: built-in "quick start" field-sets (TEMPLATES) and the
// REAL library loaded from GET /api/MegaForm/BuilderTemplates/List (templates.ts). Picking
// a premium (custom-shell) library template flags it for faithful emit (② / ③).
import { WizardData, SetFn, CATEGORIES, TEMPLATES, FIELD_TYPES, WizardField } from './types';
import { h, icon } from './ui';
import { loadTemplates, templatesState, hydrateStandardFields, WizardTemplate } from './templates';

let counter = 1000;
const fid = () => 'wf-' + (++counter);

// Apply a built-in quick-start template's field set (flat single-page).
function applyTemplate(tplId: string, set: SetFn): void {
  const tpl = TEMPLATES.find(t => t.id === tplId);
  const fields: WizardField[] = (tpl?.fieldTypes || []).map(ft => {
    const meta = FIELD_TYPES.find(f => f.type === ft);
    return { id: fid(), type: ft, label: meta ? meta.label : 'Field', required: ft === 'email' };
  });
  set({ template: tplId, templateRecord: null, templateIsPremium: false, isMultiStep: false, fields, formPages: [{ id: 'page-1', title: 'Step 1', fields: [] }] });
}

// Apply a REAL library template. Premium (custom-shell) → faithful emit, no field hydration.
// Standard → hydrate the editable wizard fields from the template's fields.
function applyRealTemplate(t: WizardTemplate, set: SetFn): void {
  if (t.isPremium) {
    set({ template: t.id, templateRecord: t, templateIsPremium: true, isMultiStep: false, fields: [], formPages: [{ id: 'page-1', title: 'Step 1', fields: [] }] });
  } else {
    set({ template: t.id, templateRecord: t, templateIsPremium: false, isMultiStep: false, fields: hydrateStandardFields(t), formPages: [{ id: 'page-1', title: 'Step 1', fields: [] }] });
  }
}

function templateCard(label: string, desc: string, iconName: string, selected: boolean, onClick: () => void, badge?: string, badgeColor?: string): HTMLElement {
  return h('button', { type: 'button', class: 'mfw-pick' + (selected ? ' sel' : ''), style: 'display:flex;align-items:center;gap:12px', onclick: onClick }, [
    h('span', { style: 'width:36px;height:36px;border-radius:10px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;flex:0 0 36px' }, [iconName.indexOf('fa-') === 0 ? icon(iconName) : document.createTextNode(iconName || '✦')]),
    h('span', { style: 'min-width:0;flex:1' }, [
      h('span', { style: 'display:flex;align-items:center;gap:7px' }, [
        h('b', { style: 'font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, label),
        badge ? h('span', { class: 'mfw-badge', style: badgeColor ? 'color:' + badgeColor + ';background:' + badgeColor + '1a' : '' }, badge) : null,
      ]),
      h('span', { style: 'font-size:12px;color:#94a3b8;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, desc),
    ]),
  ]);
}

export function renderSetup(data: WizardData, set: SetFn): HTMLElement {
  const tpls = templatesState();
  if (tpls.status === 'idle' || tpls.status === 'loading') loadTemplates(() => set({}, { rerender: true }));

  // Built-in quick-start cards (skip the 'blank' entry — there's an explicit Blank card).
  const quickStarts = TEMPLATES.filter(t => t.id !== 'blank');

  const libraryGrid =
    tpls.status === 'loading' ? h('div', { style: 'font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:6px;padding:8px 0' }, [icon('fa-spinner fa-spin'), document.createTextNode('Loading template library…')]) :
    tpls.status === 'error' ? h('div', { style: 'font-size:12px;color:#d97706;padding:8px 0' }, 'Template library unavailable — use a quick start above.') :
    tpls.list.length === 0 ? h('div', { style: 'font-size:12px;color:#94a3b8;padding:8px 0' }, 'No saved templates on this site yet.') :
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(2,1fr)' },
      tpls.list.map(t => templateCard(
        t.title,
        (t.category || 'general') + (t.fieldCount ? ' · ' + t.fieldCount + ' fields' : ''),
        t.icon || 'fa-file-lines',
        data.template === t.id,
        () => applyRealTemplate(t, set),
        t.isPremium ? 'Premium' : undefined,
        t.isPremium ? '#7c3aed' : undefined,
      )));

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

    // Quick start (built-in field sets) + explicit Blank.
    h('label', { class: 'mfw-flbl', style: 'margin-bottom:10px' }, 'Quick start'),
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(2,1fr);margin-bottom:22px' }, [
      templateCard('Blank Form', 'Start from scratch', 'fa-file', data.template === 'blank', () => applyTemplate('blank', set)),
      ...quickStarts.map(t => templateCard(t.label, t.desc + (t.fieldTypes.length ? ' · ' + t.fieldTypes.length + ' fields' : ''), t.icon, data.template === t.id, () => applyTemplate(t.id, set), t.badge)),
    ]),

    // Real saved template library (standard + premium).
    h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px' }, [
      h('label', { class: 'mfw-flbl', style: 'margin:0' }, 'Template library'),
      tpls.status === 'ok' && tpls.list.length ? h('span', { style: 'font-size:11px;color:#94a3b8' }, '(' + tpls.list.length + ' from this site)') : null,
    ]),
    libraryGrid,
  ]);
}
