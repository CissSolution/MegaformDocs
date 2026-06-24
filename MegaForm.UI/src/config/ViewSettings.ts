// ============================================================
// View Settings — view type picker + config per type
// ============================================================

import { h, clear, delegate, $$ } from '@shared/dom';
import type { FieldMeta, ViewType } from '@core/types';
import { parseJson } from '@shared/utils';

export interface ViewSettingsOptions {
  container: HTMLElement;
  fields: FieldMeta[];
  initialViewType: ViewType;
  initialConfig: string;
  onChange: (viewType: ViewType, config: string) => void;
}

const VIEW_TYPES: Array<{ type: ViewType; icon: string; title: string; desc: string }> = [
  { type: 'submit', icon: 'fa-edit', title: 'Submit Form', desc: 'Data entry form' },
  { type: 'list', icon: 'fa-table', title: 'List View', desc: 'Table with pagination' },
  { type: 'card', icon: 'fa-th-large', title: 'Card View', desc: 'Grid of cards' },
  { type: 'detail', icon: 'fa-file-alt', title: 'Detail View', desc: 'Single record' },
  { type: 'continuous', icon: 'fa-stream', title: 'Master-Detail', desc: 'List + detail side by side' },
];

export function renderViewSettings(opts: ViewSettingsOptions): void {
  const { container, fields, initialConfig, onChange } = opts;
  let activeType: ViewType = opts.initialViewType || 'submit';
  const existingConfig = parseJson<Record<string, unknown>>(initialConfig, {});

  function buildFieldCheckboxes(containerId: string, selectedKeys?: string[]): HTMLElement {
    const div = h('div', { class: 'mf-cfg-checklist', id: containerId });
    fields.forEach((f, i) => {
      const checked = selectedKeys ? selectedKeys.includes(f.key) : i < 5;
      const label = h('label', { class: 'mf-cfg-check-item' },
        h('input', { type: 'checkbox', value: f.key, checked }),
        ` ${f.label} `,
        h('small', null, `(${f.type})`),
      );
      div.appendChild(label);
    });
    return div;
  }

  function buildFieldSelect(id: string, includeNone: boolean, selected?: string): HTMLElement {
    const sel = h('select', { class: 'mf-cfg-input', id }) as HTMLSelectElement;
    if (includeNone) sel.appendChild(h('option', { value: '' }, '(none)'));
    fields.forEach(f => {
      const opt = h('option', { value: f.key }, `${f.label} (${f.type})`) as HTMLOptionElement;
      if (selected === f.key) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function buildSortSelect(id: string, selected?: string): HTMLElement {
    const sel = h('select', { class: 'mf-cfg-input', id }) as HTMLSelectElement;
    sel.appendChild(h('option', { value: 'SubmittedOnUtc' }, 'Date Created'));
    fields.forEach(f => {
      const opt = h('option', { value: f.key }, f.label) as HTMLOptionElement;
      if (selected === f.key) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function renderTypeOptions(): HTMLElement {
    const wrap = h('div', { class: 'mf-cfg-view-opts' });
    const ec = existingConfig;

    if (activeType === 'list') {
      wrap.appendChild(h('h4', null, h('i', { class: 'fas fa-table' }), ' List View Settings'));
      // Columns
      wrap.appendChild(h('div', { class: 'mf-cfg-row' },
        h('label', null, 'Columns to display'),
        buildFieldCheckboxes('mf-ts-list-cols', ec.columns as string[]),
      ));
      // Sort + pagesize
      wrap.appendChild(h('div', { class: 'mf-cfg-row-grid' },
        h('div', null, h('label', null, 'Page Size'),
          h('input', { type: 'number', class: 'mf-cfg-input', id: 'mf-ts-list-pagesize',
            value: String(ec.pageSize || 20), min: '5', max: '100' })),
        h('div', null, h('label', null, 'Sort By'), buildSortSelect('mf-ts-list-sortby', ec.sortBy as string)),
        h('div', null, h('label', null, 'Sort Direction'),
          (() => {
            const sel = h('select', { class: 'mf-cfg-input', id: 'mf-ts-list-sortdir' }) as HTMLSelectElement;
            sel.innerHTML = '<option value="desc">Newest First</option><option value="asc">Oldest First</option>';
            if (ec.sortDir === 'asc') (sel.querySelector('option[value="asc"]') as HTMLOptionElement).selected = true;
            return sel;
          })()),
      ));
      // Checkboxes
      wrap.appendChild(h('div', { class: 'mf-cfg-row' },
        h('label', null,
          h('input', { type: 'checkbox', id: 'mf-ts-list-searchable', checked: !!ec.searchable }),
          ' Enable search bar')));
      wrap.appendChild(h('div', { class: 'mf-cfg-row' },
        h('label', null,
          h('input', { type: 'checkbox', id: 'mf-ts-list-filterable', checked: !!ec.filterable }),
          ' Enable column filters')));

    } else if (activeType === 'card') {
      wrap.appendChild(h('h4', null, h('i', { class: 'fas fa-th-large' }), ' Card View Settings'));
      wrap.appendChild(h('div', { class: 'mf-cfg-row-grid' },
        h('div', null, h('label', null, 'Columns'),
          (() => {
            const sel = h('select', { class: 'mf-cfg-input', id: 'mf-ts-card-cols' }) as HTMLSelectElement;
            [2, 3, 4].forEach(n => {
              const opt = h('option', { value: String(n) }, String(n)) as HTMLOptionElement;
              if ((ec.cardColumns || 3) === n) opt.selected = true;
              sel.appendChild(opt);
            });
            return sel;
          })()),
        h('div', null, h('label', null, 'Title Field'), buildFieldSelect('mf-ts-card-title', false, ec.titleField as string)),
        h('div', null, h('label', null, 'Excerpt Field'), buildFieldSelect('mf-ts-card-excerpt', true, ec.excerptField as string)),
      ));
      wrap.appendChild(h('div', { class: 'mf-cfg-row-grid' },
        h('div', null, h('label', null, 'Image Field'), buildFieldSelect('mf-ts-card-image', true, ec.imageField as string)),
        h('div', null, h('label', null, 'Category Field'), buildFieldSelect('mf-ts-card-category', true, ec.categoryField as string)),
        h('div', null, h('label', null, 'Page Size'),
          h('input', { type: 'number', class: 'mf-cfg-input', id: 'mf-ts-card-pagesize',
            value: String(ec.pageSize || 12), min: '3', max: '100' })),
      ));

    } else if (activeType === 'detail') {
      wrap.appendChild(h('h4', null, h('i', { class: 'fas fa-file-alt' }), ' Detail View Settings'));
      wrap.appendChild(h('div', { class: 'mf-cfg-row' },
        h('label', null, 'Fields to display'),
        buildFieldCheckboxes('mf-ts-detail-fields', ec.fields as string[]),
      ));

    } else if (activeType === 'continuous') {
      wrap.appendChild(h('h4', null, h('i', { class: 'fas fa-stream' }), ' Master-Detail Settings'));
      wrap.appendChild(h('div', { class: 'mf-cfg-row-grid' },
        h('div', null, h('label', null, 'Title Field'), buildFieldSelect('mf-ts-cont-title', false, ec.titleField as string)),
        h('div', null, h('label', null, 'Subtitle Field'), buildFieldSelect('mf-ts-cont-subtitle', true, ec.subtitleField as string)),
      ));
      wrap.appendChild(h('div', { class: 'mf-cfg-row' },
        h('label', null, 'Detail Fields'),
        buildFieldCheckboxes('mf-ts-cont-fields', ec.fields as string[]),
      ));
    }

    return wrap;
  }

  function render() {
    clear(container);

    // View type section
    const section = h('div', { class: 'mf-cfg-section' },
      h('label', null, 'View Type'),
    );

    const typeGrid = h('div', { class: 'mf-cfg-view-types' });
    VIEW_TYPES.forEach(vt => {
      typeGrid.appendChild(
        h('div', {
          class: `mf-cfg-vt-card${vt.type === activeType ? ' active' : ''}`,
          'data-type': vt.type,
        },
          h('i', { class: `fas ${vt.icon}` }),
          h('strong', null, vt.title),
          h('span', null, vt.desc),
        )
      );
    });
    section.appendChild(typeGrid);
    container.appendChild(section);

    // Type-specific options
    const optsEl = renderTypeOptions();
    if (optsEl.children.length > 0) container.appendChild(optsEl);

    // Events
    delegate(typeGrid, 'click', '.mf-cfg-vt-card', (_e, el) => {
      activeType = (el.getAttribute('data-type') || 'submit') as ViewType;
      render();
      onChange(activeType, JSON.stringify(collectConfig()));
    });
  }

  function getChecked(containerId: string): string[] {
    const el = document.getElementById(containerId);
    if (!el) return [];
    return $$('input[type=checkbox]:checked', el).map(cb => (cb as HTMLInputElement).value);
  }

  function getVal(id: string): string {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    return el?.value || '';
  }

  function isChecked(id: string): boolean {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el?.checked || false;
  }

  function collectConfig(): Record<string, unknown> {
    if (activeType === 'list') {
      return {
        columns: getChecked('mf-ts-list-cols'),
        pageSize: parseInt(getVal('mf-ts-list-pagesize')) || 20,
        sortBy: getVal('mf-ts-list-sortby'),
        sortDir: getVal('mf-ts-list-sortdir'),
        searchable: isChecked('mf-ts-list-searchable'),
        filterable: isChecked('mf-ts-list-filterable'),
      };
    }
    if (activeType === 'card') {
      return {
        cardColumns: parseInt(getVal('mf-ts-card-cols')) || 3,
        titleField: getVal('mf-ts-card-title'),
        excerptField: getVal('mf-ts-card-excerpt'),
        imageField: getVal('mf-ts-card-image'),
        categoryField: getVal('mf-ts-card-category'),
        pageSize: parseInt(getVal('mf-ts-card-pagesize')) || 12,
      };
    }
    if (activeType === 'detail') {
      return { fields: getChecked('mf-ts-detail-fields') };
    }
    if (activeType === 'continuous') {
      return {
        titleField: getVal('mf-ts-cont-title'),
        subtitleField: getVal('mf-ts-cont-subtitle'),
        fields: getChecked('mf-ts-cont-fields'),
      };
    }
    return {};
  }

  // Public method to get current config
  (container as unknown as Record<string, unknown>)._collectConfig = () => ({
    viewType: activeType,
    config: JSON.stringify(collectConfig()),
  });

  render();
}
