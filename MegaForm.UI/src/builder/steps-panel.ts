import { MegaFormBuilder } from './core';
import { addStep, listSteps, moveStep, removeStep, renameStep } from '@shared/form-steps';

(function () {
  'use strict';

  const B: any = MegaFormBuilder;

  function t(key: string, fallback: string, params?: Record<string, any>): string {
    return B.builderT ? B.builderT(key, fallback, params) : fallback;
  }

  function schemaFields(): any[] {
    const schema = B.state && B.state.schema;
    return schema && Array.isArray(schema.fields) ? schema.fields : [];
  }

  function contentFieldCount(fields: any[]): number {
    return (fields || []).filter(field => {
      const type = String(field?.type ?? field?.Type ?? '');
      return type !== 'Section' && type !== 'Hidden';
    }).length;
  }

  function button(icon: string, title: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.title = title;
    element.setAttribute('aria-label', title);
    element.disabled = disabled;
    element.style.cssText = [
      'width:28px',
      'height:28px',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'border:1px solid #dbe4f0',
      'border-radius:8px',
      'background:#fff',
      'color:#64748b',
      'cursor:' + (disabled ? 'not-allowed' : 'pointer'),
      'opacity:' + (disabled ? '.4' : '1'),
      'padding:0',
    ].join(';');
    const iconElement = document.createElement('i');
    iconElement.className = 'fas ' + icon;
    element.appendChild(iconElement);
    if (!disabled) element.addEventListener('click', onClick);
    return element;
  }

  function customHtmlValue(): string {
    const settings = (B.state?.schema?.settings || {});
    return String(settings.customHtml ?? settings.CustomHtml ?? '');
  }

  function applyFields(nextFields: any[], toast: string): void {
    const beforeHtml = customHtmlValue();
    B.state.schema.fields = nextFields;
    B.state.schema.Fields = nextFields;
    const settings = B.state.schema.settings || (B.state.schema.settings = {});
    const multiPage = listSteps(nextFields).length > 1;
    settings.multiPage = multiPage;
    settings.MultiPage = multiPage;
    B.state.selectedFieldIndex = -1;
    B.state._rowFieldRef = null;
    B.state.isDirty = true;
    B.callModule('properties', 'hideProps');
    B.callModule('canvas', 'render');
    if (typeof B.syncFormActionEditorsFromSchema === 'function') B.syncFormActionEditorsFromSchema();
    render();
    if (customHtmlValue() !== beforeHtml) {
      console.error('[MegaForm Steps] customHtml changed during a schema-only step operation.');
    }
    if (toast) B.showToast(toast, 'success');
  }

  function remove(ordinal: number): void {
    const steps = listSteps(schemaFields());
    if (steps.length <= 1) {
      B.showToast(t('steps.cannot_remove_last', 'A form must keep at least one step.'), 'error');
      return;
    }
    if (!window.confirm(t('steps.remove_confirm', 'Remove this step? Its fields will be merged into the previous step.'))) return;
    applyFields(
      removeStep(schemaFields(), ordinal, 'merge-prev'),
      t('steps.removed', 'Step removed. Its fields were kept.'),
    );
  }

  function rename(ordinal: number, value: string): void {
    const label = String(value || '').trim() || t('steps.step_default', 'Step {n}', { n: ordinal });
    applyFields(
      renameStep(schemaFields(), ordinal, label),
      t('steps.renamed', 'Step renamed.'),
    );
  }

  function move(ordinal: number, direction: -1 | 1): void {
    const target = ordinal + direction;
    const steps = listSteps(schemaFields());
    if (target < 1 || target > steps.length) return;
    applyFields(
      moveStep(schemaFields(), ordinal, target),
      t('steps.reordered', 'Step order updated.'),
    );
  }

  function add(): void {
    const fields = schemaFields();
    const selected = Number(B.state.selectedFieldIndex);
    const atIndex = Number.isFinite(selected) && selected >= 0 ? Math.min(selected + 1, fields.length) : fields.length;
    const ordinal = listSteps(fields).length + 1;
    const label = t('steps.step_default', 'Step {n}', { n: ordinal });
    const settings = B.state?.schema?.settings || {};
    const isPremium = settings.premiumNativePageBreak === true || settings.PremiumNativePageBreak === true;
    const properties: Record<string, any> = {};
    if (isPremium) {
      let maxLegacyStep = -1;
      fields.forEach(field => {
        const props = field?.properties || field?.Properties || {};
        const raw = props.legacyDataStep ?? props.LegacyDataStep;
        if (raw != null && Number.isFinite(Number(raw))) maxLegacyStep = Math.max(maxLegacyStep, Number(raw));
      });
      properties.premiumNativeStep = true;
      properties.generatedPremiumStep = true;
      properties.legacyDataStep = maxLegacyStep + 1;
    }
    applyFields(
      addStep(fields, atIndex, { label, properties }),
      t('steps.added', 'Step added.'),
    );
  }

  function render(): void {
    const host = document.getElementById('mf-form-steps-panel');
    if (!host) return;
    host.innerHTML = '';

    const steps = listSteps(schemaFields());
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;';
    const headingWrap = document.createElement('div');
    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:14px;font-weight:800;color:#0f172a;';
    heading.textContent = t('steps.title', 'Steps') + ' (' + steps.length + ')';
    const description = document.createElement('div');
    description.style.cssText = 'font-size:11px;line-height:1.45;color:#64748b;margin-top:3px;';
    description.textContent = t('steps.panel_desc', 'Add, rename, remove, or reorder form steps.');
    headingWrap.append(heading, description);
    header.appendChild(headingWrap);
    host.appendChild(header);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    steps.forEach(step => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px;border:1px solid #e2e8f0;border-radius:11px;background:#fff;';

      const ordinal = document.createElement('span');
      ordinal.style.cssText = 'width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex:0 0 24px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:11px;font-weight:800;';
      ordinal.textContent = String(step.ordinal);

      const copy = document.createElement('div');
      copy.style.cssText = 'min-width:0;flex:1;';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = step.label;
      input.setAttribute('aria-label', t('steps.rename', 'Rename step'));
      input.style.cssText = 'width:100%;height:30px;border:0;border-bottom:1px solid transparent;background:transparent;color:#334155;font-size:12px;font-weight:700;padding:0 2px;outline:none;box-sizing:border-box;';
      input.addEventListener('focus', () => { input.style.borderBottomColor = '#818cf8'; });
      input.addEventListener('blur', () => {
        input.style.borderBottomColor = 'transparent';
        if (input.value !== step.label) rename(step.ordinal, input.value);
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') input.blur();
        if (event.key === 'Escape') {
          input.value = step.label;
          input.blur();
        }
      });
      const count = document.createElement('div');
      count.style.cssText = 'font-size:10px;color:#94a3b8;margin-top:2px;';
      const n = contentFieldCount(step.fields);
      count.textContent = t('steps.field_count', '{n} fields', { n });
      copy.append(input, count);

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;align-items:center;gap:4px;flex:0 0 auto;';
      actions.append(
        button('fa-arrow-up', t('steps.move_up', 'Move step up'), step.ordinal === 1, () => move(step.ordinal, -1)),
        button('fa-arrow-down', t('steps.move_down', 'Move step down'), step.ordinal === steps.length, () => move(step.ordinal, 1)),
        button('fa-trash-can', steps.length === 1 ? t('steps.cannot_remove_last', 'A form must keep at least one step.') : t('steps.remove', 'Remove step'), steps.length === 1, () => remove(step.ordinal)),
      );
      row.append(ordinal, copy, actions);
      list.appendChild(row);
    });
    host.appendChild(list);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:7px;width:100%;margin-top:10px;padding:9px 10px;border:1.5px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#475569;font-size:12px;font-weight:700;cursor:pointer;';
    const addIcon = document.createElement('i');
    addIcon.className = 'fas fa-plus';
    const addLabel = document.createElement('span');
    addLabel.textContent = Number(B.state.selectedFieldIndex) >= 0
      ? t('steps.add_after_selected', 'Add Step after selected field')
      : t('steps.add', 'Add Step');
    addButton.append(addIcon, addLabel);
    addButton.addEventListener('click', add);
    host.appendChild(addButton);
  }

  function init(): void {
    render();
    const toggle = document.querySelector<HTMLElement>('[data-mf-design-toggle="steps"]');
    if (toggle && toggle.dataset.mfStepsBound !== '1') {
      toggle.dataset.mfStepsBound = '1';
      toggle.addEventListener('click', () => window.setTimeout(render, 0));
    }
  }

  B.registerModule('steps', { init, render, remove, rename, move, add });
})();
