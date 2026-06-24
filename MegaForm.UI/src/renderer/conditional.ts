// ============================================================
// Conditional Logic — evaluates show/hide rules
// ============================================================

import type { ShowIfRule } from './helpers';

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
  if (type === 'Checkbox') {
    const checks = document.querySelectorAll<HTMLInputElement>(`input[name="${key}"]:checked`);
    return Array.from(checks).map(c => c.value);
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
  if (!showIf?.conditions?.length) return true;

  const results = showIf.conditions.map(cond => {
    const val = String(getFieldValue(cond.fieldKey, '') || '');
    const target = cond.value || '';

    switch (cond.operator) {
      case 'Equals':        return val === target;
      case 'NotEquals':      return val !== target;
      case 'Contains':       return val.includes(target);
      case 'NotContains':    return !val.includes(target);
      case 'StartsWith':     return val.startsWith(target);
      case 'EndsWith':       return val.endsWith(target);
      case 'GreaterThan': {
        const nv = parseFloat(val), nt = parseFloat(target);
        return !isNaN(nv) && !isNaN(nt) && nv > nt;
      }
      case 'LessThan': {
        const nv = parseFloat(val), nt = parseFloat(target);
        return !isNaN(nv) && !isNaN(nt) && nv < nt;
      }
      case 'GreaterOrEqual': {
        const nv = parseFloat(val), nt = parseFloat(target);
        return !isNaN(nv) && !isNaN(nt) && nv >= nt;
      }
      case 'LessOrEqual': {
        const nv = parseFloat(val), nt = parseFloat(target);
        return !isNaN(nv) && !isNaN(nt) && nv <= nt;
      }
      case 'IsEmpty':    return !val || val.length === 0;
      case 'IsNotEmpty': return !!val && val.length > 0;
      case 'In':         return target.split(',').map(s => s.trim()).includes(val);
      case 'NotIn':      return !target.split(',').map(s => s.trim()).includes(val);
      default:           return true;
    }
  });

  return showIf.operator === 'Or' ? results.some(Boolean) : results.every(Boolean);
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
}
