// Wizard step 1 — Setup: name, description, category, template.
// Templates come from TWO sources: built-in "quick start" field-sets (TEMPLATES) and the
// REAL library loaded from GET /api/MegaForm/BuilderTemplates/List (templates.ts). Picking
// a premium (custom-shell) library template flags it for faithful emit (② / ③).
import { WizardData, SetFn, CATEGORIES, TEMPLATES, FIELD_TYPES, WizardField } from './types';
import { h, icon, wt, wizardToast } from './ui';
import { loadTemplates, templatesState, hydrateStandardFields, WizardTemplate } from './templates';
import { premiumNativeFieldsFor, premiumStepDetailsFor } from './premium-steps';
import { openWizardGallery, openImportJson, openImportJsonPaste } from './gallery-modal';
import { isTrialMode, showTrialUpgrade } from '@shared/trial';

// [Wizard 2026-07-18] Clean a library template's display name: drop a trailing ".json"
// (uploads default the title to the file name) and tidy separator underscores/dashes.
function cleanTemplateName(raw: string): string {
  return String(raw || 'Template').replace(/\.json$/i, '').replace(/[_-]+/g, ' ').trim() || 'Template';
}

let counter = 1000;
const fid = () => 'wf-' + (++counter);

// [WizardAutoName 2026-08-15] Picking a template names the form after it.
//
// Form Name is required and Continue is DISABLED until it is filled — so someone who picked
// "Media Inquiry", saw the whole form appear in the live preview, and pressed Continue got a
// button that did nothing and said nothing (owner: "click next nhưng không chạy tiếp được vì
// chưa có tên form"). The template already carries the obvious name; not using it made the user
// retype what they had just chosen.
//
// Never clobbers a typed name: it fills only when the box is empty or still holds a name WE put
// there (formNameAuto), so trying several templates keeps following along, and the moment the
// user types, the name is theirs. Returns a patch so the name rides in the SAME set() call as
// the template — two set() calls would render the step twice and fight over the input.
function autoNamePatch(data: WizardData, title: string): Partial<WizardData> {
  const typed = String(data.formName || '').trim();
  if (typed && !data.formNameAuto) return {};
  const name = cleanTemplateName(title);
  if (!name || name === 'Template') return {};
  return { formName: name, formNameAuto: true };
}

// Apply a built-in quick-start template's field set (flat single-page).
function applyTemplate(tplId: string, data: WizardData, set: SetFn): void {
  const tpl = TEMPLATES.find(t => t.id === tplId);
  const fields: WizardField[] = (tpl?.fieldTypes || []).map(ft => {
    const meta = FIELD_TYPES.find(f => f.type === ft);
    return { id: fid(), type: ft, label: meta ? meta.label : 'Field', required: ft === 'email' };
  });
  // 'blank' is deliberately excluded: "Blank Form" is not a form name, it is the absence of a
  // choice, and pre-filling it would push a meaningless title into the site's form list.
  const named = tplId === 'blank' ? {} : autoNamePatch(data, tpl?.label || '');
  set({ template: tplId, templateRecord: null, templateIsCustomShell: false, premiumFields: null, premiumStepDetails: [], isMultiStep: false, fields, formPages: [{ id: 'page-1', title: 'Step 1', fields: [] }], ...named });
}

// Apply a REAL library template. Custom-shell → editable working copy of its fields
// (③ — add/remove in the wizard) and the shell survives Create. Standard → hydrate the
// editable wizard fields. Routing is on SHAPE (isCustomShell), never on licensing:
// the free quick-start starters carry a layout wrapper and would lose it otherwise.
function applyRealTemplate(t: WizardTemplate, data: WizardData, set: SetFn): void {
  const named = autoNamePatch(data, t.title);
  if (t.isCustomShell) {
    set({ template: t.id, templateRecord: t, templateIsCustomShell: true, premiumFields: premiumNativeFieldsFor(t), premiumStepDetails: premiumStepDetailsFor(t), isMultiStep: false, fields: [], formPages: [{ id: 'page-1', title: 'Step 1', fields: [] }], ...named });
  } else {
    set({ template: t.id, templateRecord: t, templateIsCustomShell: false, premiumFields: null, premiumStepDetails: [], isMultiStep: false, fields: hydrateStandardFields(t), formPages: [{ id: 'page-1', title: 'Step 1', fields: [] }], ...named });
  }
}

function templateCard(label: string, desc: string, iconName: string, selected: boolean, onClick: () => void, badge?: string, badgeColor?: string, locked?: boolean): HTMLElement {
  // Only real FontAwesome classes (fa-*) render as glyphs. Catalog icons are often lucide-style
  // names (compass / sparkles / flower-2) that aren't FA classes → render a neutral glyph, NEVER
  // the raw name as text (matches gallery-modal.ts). Premium picks get the wand, others a file.
  const glyph = iconName && iconName.indexOf('fa-') === 0 ? iconName : (badge ? 'fa-wand-magic-sparkles' : 'fa-file-lines');
  // [TrialTighten v20260706] Premium templates in trial are dimmed + show a lock; clicking opens the
  // Upgrade CTA (wired by the caller) instead of applying.
  const cardStyle = 'display:flex;align-items:center;gap:12px' + (locked ? ';opacity:.6' : '');
  return h('button', { type: 'button', class: 'mfw-pick' + (selected ? ' sel' : '') + (locked ? ' mfw-locked' : ''), style: cardStyle, onclick: onClick }, [
    h('span', { style: 'width:36px;height:36px;border-radius:10px;background:#f1f5f9;color:' + (locked ? '#7c3aed' : '#475569') + ';display:flex;align-items:center;justify-content:center;flex:0 0 36px' }, [icon(locked ? 'fa-lock' : glyph)]),
    h('span', { style: 'min-width:0;flex:1' }, [
      h('span', { style: 'display:flex;align-items:center;gap:7px' }, [
        h('b', { style: 'font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, label),
        badge ? h('span', { class: 'mfw-badge', style: badgeColor ? 'color:' + badgeColor + ';background:' + badgeColor + '1a' : '' }, badge) : null,
      ]),
      h('span', { style: 'font-size:12px;color:#94a3b8;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, desc),
    ]),
  ]);
}

const PREVIEW_GRADIENTS: Record<string, string> = {
  general: 'linear-gradient(135deg,#5b8def,#7c3aed)',
  hr: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
  healthcare: 'linear-gradient(135deg,#10b981,#0ea5e9)',
  events: 'linear-gradient(135deg,#8b5cf6,#ec4899)',
  survey: 'linear-gradient(135deg,#f59e0b,#ef4444)',
  finance: 'linear-gradient(135deg,#14b8a6,#3b82f6)',
  education: 'linear-gradient(135deg,#f97316,#ec4899)',
};

function previewGradient(cat: string): string {
  return PREVIEW_GRADIENTS[(cat || 'general').toLowerCase()] || PREVIEW_GRADIENTS.general;
}

const INLINE_LIBRARY_PAGE_SIZE = 6;
let inlineLibraryPage = 0;
let inlineLibraryQuery = '';

// Setup only needs a quick picker. Rich previews stay in the gallery modal, while this compact
// card keeps a 100+ template catalog from stretching the wizard over many screens.
function compactTemplateCard(t: WizardTemplate, selected: boolean, onClick: () => void, locked?: boolean): HTMLElement {
  const name = cleanTemplateName(t.title);
  const glyph = t.icon && t.icon.indexOf('fa-') === 0 ? t.icon : (t.isPremium ? 'fa-wand-magic-sparkles' : 'fa-file-lines');
  const meta = [t.category || 'general', t.fieldCount > 0 ? t.fieldCount + ' fields' : ''].filter(Boolean).join(' · ');
  return h('button', {
    type: 'button',
    class: 'mfw-library-card' + (selected ? ' sel' : '') + (locked ? ' mfw-locked' : ''),
    title: name,
    'aria-label': name,
    onclick: onClick,
  }, [
    h('span', { class: 'mfw-library-card-icon', style: 'background:' + previewGradient(t.category) }, [icon(locked ? 'fa-lock' : glyph)]),
    h('span', { class: 'mfw-library-card-copy' }, [
      h('b', null, name),
      h('small', null, meta),
    ]),
    selected ? h('span', { class: 'mfw-library-card-check', 'aria-hidden': 'true' }, [icon('fa-check')]) : null,
  ]);
}

export function renderSetup(data: WizardData, set: SetFn): HTMLElement {
  const tpls = templatesState();
  if (tpls.status === 'idle' || tpls.status === 'loading') loadTemplates(() => set({}, { rerender: true }));

  // Built-in quick-start cards (skip the 'blank' entry — there's an explicit Blank card).
  const quickStarts = TEMPLATES.filter(t => t.id !== 'blank');

  // [WizardGallery 2026-07-01] Parallel entry paths — browse the full Template Gallery
  // (category + search + preview) or import a MegaForm export .json — both land back here
  // with the template loaded, ready to edit. Starting from scratch = ignore these + fill
  // the name / pick a Quick start below.
  const applyPicked = (t: WizardTemplate): void => {
    applyRealTemplate(t, data, set);
  };
  // Import path also shows a toast — imports were silent before, so a valid file that
  // only changed the (off-screen) name field felt like "nothing happened".
  const importPicked = (t: WizardTemplate): void => {
    // applyRealTemplate now carries the name across (autoNamePatch), so the separate
    // formName set() that used to live here is gone — it fired a second render for the
    // same pick, and it wrote the raw title with the ".json" the upload left on it.
    applyPicked(t);
    const n = t.fieldCount || (t.fields && t.fields.length) || 0;
    wizardToast(wt('wiz.import_ok', 'Imported "{title}" — {n} fields loaded', { title: t.title || 'form', n }));
  };

  const libraryPanel = h('div', { class: 'mfw-library', 'data-page-size': String(INLINE_LIBRARY_PAGE_SIZE) });
  const paintLibrary = (): void => {
    libraryPanel.innerHTML = '';
    const search = h('input', {
      type: 'search', class: 'mfw-library-search', value: inlineLibraryQuery,
      placeholder: wt('wiz.gallery.search_ph', 'Search templates…'),
      'aria-label': wt('wiz.gallery.search_ph', 'Search templates…'),
    }) as HTMLInputElement;
    search.addEventListener('input', () => {
      inlineLibraryQuery = search.value;
      inlineLibraryPage = 0;
      paintLibrary();
      const nextSearch = libraryPanel.querySelector('.mfw-library-search') as HTMLInputElement | null;
      if (nextSearch) { nextSearch.focus(); nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length); }
    });

    libraryPanel.appendChild(h('div', { class: 'mfw-library-head' }, [
      h('div', null, [
        h('label', { class: 'mfw-flbl' }, wt('wiz.setup.template_library', 'Template library')),
        tpls.status === 'ok' && tpls.list.length
          ? h('span', { class: 'mfw-library-count' }, wt('wiz.setup.library_count', '({n} from this site)', { n: tpls.list.length }))
          : null,
      ]),
      h('div', { class: 'mfw-library-tools' }, [
        search,
        h('button', { type: 'button', class: 'mfw-library-all', onclick: () => openWizardGallery(applyPicked, importPicked) }, [
          icon('fa-layer-group'), document.createTextNode(' ' + wt('wiz.gallery.all', 'All templates')),
        ]),
      ]),
    ]));

    if (tpls.status === 'loading' || tpls.status === 'idle') {
      libraryPanel.appendChild(h('div', { class: 'mfw-library-empty' }, [icon('fa-spinner fa-spin'), document.createTextNode(' ' + wt('wiz.setup.library_loading', 'Loading template library…'))]));
      return;
    }
    if (tpls.status === 'error') {
      libraryPanel.appendChild(h('div', { class: 'mfw-library-empty warn' }, wt('wiz.setup.library_error', 'Template library unavailable — use a quick start above.')));
      return;
    }

    const q = inlineLibraryQuery.trim().toLowerCase();
    const items = tpls.list.filter(t => !q || (t.title + ' ' + t.description + ' ' + t.category).toLowerCase().includes(q));
    if (!items.length) {
      libraryPanel.appendChild(h('div', { class: 'mfw-library-empty' }, q ? wt('wiz.gallery.no_match', 'No templates match your search.') : wt('wiz.setup.library_empty', 'No saved templates on this site yet.')));
      return;
    }

    const pages = Math.max(1, Math.ceil(items.length / INLINE_LIBRARY_PAGE_SIZE));
    inlineLibraryPage = Math.min(Math.max(0, inlineLibraryPage), pages - 1);
    const start = inlineLibraryPage * INLINE_LIBRARY_PAGE_SIZE;
    const visible = items.slice(start, start + INLINE_LIBRARY_PAGE_SIZE);
    const grid = h('div', { class: 'mfw-library-grid', 'data-page': String(inlineLibraryPage + 1) });
    visible.forEach(t => {
      const locked = isTrialMode() && t.isPremium;
      grid.appendChild(compactTemplateCard(
        t,
        data.template === t.id,
        locked
          ? () => showTrialUpgrade({ title: wt('trial.premium_title', 'Premium template'), message: wt('trial.premium_msg', 'Premium templates need a paid license. Upgrade to use this template.') })
          : () => applyRealTemplate(t, data, set),
        locked,
      ));
    });
    libraryPanel.appendChild(grid);

    const go = (page: number): void => { inlineLibraryPage = page; paintLibrary(); };
    libraryPanel.appendChild(h('div', { class: 'mfw-library-pager' }, [
      h('span', { class: 'mfw-library-range' }, (start + 1) + '-' + Math.min(start + INLINE_LIBRARY_PAGE_SIZE, items.length) + ' / ' + items.length),
      h('span', { class: 'mfw-library-page' }, wt('form.page_of', 'Page {current} of {total}', { current: inlineLibraryPage + 1, total: pages })),
      h('button', { type: 'button', disabled: inlineLibraryPage === 0 ? '' : null, title: wt('form.previous', 'Previous'), 'aria-label': wt('form.previous', 'Previous'), onclick: () => go(inlineLibraryPage - 1) }, [icon('fa-chevron-left')]),
      h('button', { type: 'button', disabled: inlineLibraryPage >= pages - 1 ? '' : null, title: wt('form.next', 'Next'), 'aria-label': wt('form.next', 'Next'), onclick: () => go(inlineLibraryPage + 1) }, [icon('fa-chevron-right')]),
    ]));
  };
  paintLibrary();
  const entryBtn = (iconName: string, title: string, sub: string, onClick: () => void): HTMLElement =>
    h('button', { type: 'button', class: 'mfw-pick', style: 'display:flex;align-items:center;gap:12px;flex:1', onclick: onClick }, [
      h('span', { style: 'width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#eef2ff,#faf5ff);color:#6366f1;display:flex;align-items:center;justify-content:center;flex:0 0 38px;font-size:15px' }, [icon(iconName)]),
      h('span', { style: 'min-width:0;text-align:left' }, [
        h('b', { style: 'display:block;font-size:13.5px' }, title),
        h('span', { style: 'font-size:12px;color:#94a3b8;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, sub),
      ]),
    ]);

  return h('div', null, [
    h('h2', null, wt('wiz.setup.title', 'Set up your form')),
    h('p', { class: 'sub' }, wt('wiz.setup.subtitle', 'Start from a template, import a form, or build from scratch below.')),

    h('div', { class: 'mfw-entry-grid', style: 'display:flex;gap:10px;margin-bottom:8px' }, [
      entryBtn('fa-layer-group', wt('wiz.setup.gallery', 'Template Gallery'), wt('wiz.setup.gallery_sub', 'Browse the full library'), () => openWizardGallery(applyPicked, importPicked)),
      entryBtn('fa-file-arrow-up', wt('wiz.setup.import', 'Import a form'), wt('wiz.setup.import_sub', 'Load a saved MegaForm export'), () => openImportJson(importPicked)),
    ]),

    // The button above opens the file picker directly, which is what people expect. But some
    // browser sessions never show that picker — an attached debugger/automation extension swallows
    // it, and the button then looks dead. This link is the way through when that happens.
    h('div', { style: 'margin-bottom:20px;text-align:right' }, [
      h('button', {
        type: 'button',
        style: 'background:none;border:0;padding:0;color:#6366f1;font-size:12px;cursor:pointer;text-decoration:underline',
        title: wt('wiz.setup.paste_hint', 'If the file picker does not open, use this: choose a file, drop one, or paste the exported form.'),
        onclick: () => openImportJsonPaste(importPicked),
      }, wt('wiz.setup.paste', 'File picker not opening? Paste or drop the form file instead')),
    ]),

    h('div', { style: 'margin-bottom:18px' }, [
      h('label', { class: 'mfw-flbl' }, [document.createTextNode(wt('wiz.setup.form_name', 'Form Name') + ' '), h('span', { class: 'mfw-req' }, '*')]),
      // formNameAuto:false — once it is typed, the name belongs to the user and no template
      // pick may overwrite it.
      h('input', { class: 'mfw-in', placeholder: wt('wiz.setup.form_name_ph', 'e.g. Employee Leave Request'), value: data.formName, oninput: (e: any) => set({ formName: e.target.value, formNameAuto: false }, { rerender: false }) }),
    ]),
    h('div', { style: 'margin-bottom:22px' }, [
      h('label', { class: 'mfw-flbl' }, wt('wiz.setup.description', 'Description (optional)')),
      h('textarea', { class: 'mfw-in', rows: '3', placeholder: wt('wiz.setup.description_ph', 'Briefly describe the purpose of this form…'), oninput: (e: any) => set({ formDescription: e.target.value }, { rerender: false }) }, data.formDescription || ''),
    ]),

    h('label', { class: 'mfw-flbl', style: 'margin-bottom:10px' }, wt('wiz.setup.category', 'Category')),
    h('div', { class: 'mfw-grid mfw-category-grid', style: 'grid-template-columns:repeat(4,1fr);margin-bottom:24px' },
      CATEGORIES.map(c => h('button', { type: 'button', class: 'mfw-pick' + (data.category === c.id ? ' sel' : ''), style: 'display:flex;flex-direction:column;align-items:flex-start;gap:8px', onclick: () => set({ category: c.id }) }, [
        h('span', { style: 'width:30px;height:30px;border-radius:9px;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center' }, [icon(c.icon)]),
        h('span', { style: 'font-size:13px;font-weight:600' }, c.label),
      ]))
    ),

    // Quick start (built-in field sets) + explicit Blank.
    h('label', { class: 'mfw-flbl', style: 'margin-bottom:10px' }, wt('wiz.setup.quick_start', 'Quick start')),
    h('div', { class: 'mfw-grid mfw-quick-grid', style: 'grid-template-columns:repeat(2,1fr);margin-bottom:22px' }, [
      templateCard(wt('wiz.setup.blank', 'Blank Form'), wt('wiz.setup.blank_sub', 'Start from scratch'), 'fa-file', data.template === 'blank', () => applyTemplate('blank', data, set)),
      ...quickStarts.map(t => templateCard(t.label, t.desc + (t.fieldTypes.length ? ' · ' + t.fieldTypes.length + ' fields' : ''), t.icon, data.template === t.id, () => applyTemplate(t.id, data, set), t.badge)),
    ]),

    // Real saved template library: compact, searchable, and paged.
    libraryPanel,
  ]);
}
