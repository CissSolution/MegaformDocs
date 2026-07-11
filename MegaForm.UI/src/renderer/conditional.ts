// ============================================================
// Conditional Logic — evaluates show/hide rules
// ============================================================

import type { ShowIfRule } from './helpers';
import { evaluateRuleGroup } from './rule-engine';

/** Get the current value of a field by key (reads from DOM) */
export function getFieldValue(key: string, type: string, formId?: number): string | string[] {
  // Widget types — delegate
  const W = (window as any).MegaFormWidgets;
  if (W?.widgetTypes?.[type]) {
    const container = document.getElementById(`mf-form-wrapper-${formId}`) || document;
    return W.collectWidgetValue(key, type, container) as string;
  }
  if (type === 'Radio') {
    // [RadioValueFix v20260621] Radio previously fell through to the generic
    // `[name=key]` selector below, which returns the FIRST radio input's value
    // (always the first option) regardless of which one is checked. Read the
    // checked input instead so submissions/conditional-logic capture the real
    // selection. Mirrors the Checkbox branch and the legacy megaform-renderer.
    const checked = document.querySelector<HTMLInputElement>(`input[name="${key}"]:checked`);
    return checked?.value ?? '';
  }
  // [MultiChoiceCollectFix v20260706] Checkbox & Chips are checkbox-skinned (multi → array);
  // Cards is radio-skinned (single). Previously ONLY Checkbox had a branch, so Chips/Cards fell
  // through to the generic `[name=key]` selector below, which returns the FIRST matching input's
  // value — so a multi-select Chips silently collected only ONE option and dropped the rest at
  // submit. Detect the input kind from the DOM so a single-select Chips or a multi Cards still
  // round-trips correctly. collectFormData() delegates here, so this fixes the stored value too.
  if (type === 'Checkbox' || type === 'Chips' || type === 'Cards') {
    const inputs = document.querySelectorAll<HTMLInputElement>(`input[name="${key}"]`);
    if (inputs.length) {
      const isRadio = (inputs[0].type || '').toLowerCase() === 'radio';
      const checked = document.querySelectorAll<HTMLInputElement>(`input[name="${key}"]:checked`);
      return isRadio
        ? (checked.length ? checked[0].value : '')
        : Array.from(checked).map(c => c.value);
    }
  }
  if (type === 'Rating' || type === 'Signature') {
    const hidden = document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${key}"]`);
    return hidden?.value ?? '';
  }
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${key}"]`);
  return el?.value ?? '';
}

/** Evaluate a showIf condition against current form values */
export function evaluateCondition(showIf: ShowIfRule | null | undefined): boolean {
  return evaluateRuleGroup(showIf as any, key => getFieldValue(key, ''));
}

/** Bind live conditional logic — re-evaluate on input change */
export function bindConditionalLogic(container: HTMLElement): void {
  const conditionalFields = container.querySelectorAll<HTMLElement>('[data-show-if]');
  if (conditionalFields.length === 0) return;

  const allInputs = container.querySelectorAll<HTMLElement>('input, select, textarea');
  const reevaluate = () => {
    conditionalFields.forEach(group => {
      try {
        const showIf = JSON.parse(group.getAttribute('data-show-if')!) as ShowIfRule;
        const visible = evaluateCondition(showIf);
        group.style.display = visible ? '' : 'none';
      } catch { /* ignore parse errors */ }
    });
  };

  allInputs.forEach(inp => {
    inp.addEventListener('change', reevaluate);
    const tag = inp.tagName;
    const type = (inp as HTMLInputElement).type;
    if (type === 'text' || type === 'email' || type === 'tel' || type === 'number' || tag === 'TEXTAREA') {
      inp.addEventListener('input', reevaluate);
    }
  });

  reevaluate();
}
