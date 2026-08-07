// ============================================================
// Validation — form validation + data collection
// ============================================================

import type { FormField } from '@core/types';
import type { RendererConfig } from './helpers';
import { flattenFields, compositePartsFor, compositePartLabel, calculateAge, scalarPresetBaseType } from './helpers';

// [Unify v2 2026-06-18] A single-part scalar-preset Composite (text/textarea/email/number/url)
// validates/behaves as its base type. Map Composite+preset → effective type so the per-type
// format checks below (Email/Url) fire for the unified controls too. Multi-part composites
// (name/phone/…) return their own 'Composite' type and stay on the per-part path.
function effectiveFieldType(field: FormField): string {
  if (field.type !== 'Composite') return field.type;
  const preset = (field as any).widgetProps?.preset || (field as any).preset || '';
  return scalarPresetBaseType(preset) || 'Composite';
}
import { getFieldValue, evaluateCondition } from './conditional';

// [i18n] Validation messages are generated at submit time (no DOM pass can catch
// them), so translate via the loaded catalog with an English fallback. {field}
// is substituted with the field label. en-US returns the fallback unchanged.
function vtr(key: string, fallback: string, params?: Record<string, string>): string {
  let out = fallback;
  try {
    const i18n = (window as any).MegaFormI18n;
    if (i18n && typeof i18n.t === 'function') { const v = i18n.t(key, params); if (v && v !== key) out = v; }
  } catch (_e) { /* no i18n */ }
  if (params) for (const k in params) out = out.replace('{' + k + '}', params[k]);
  return out;
}
function requiredMsg(label: string): string {
  return vtr('form.field_required', '{field} is required', { field: String(label || '') });
}

// [GateUntilValid v20260807] Composite per-part rules — required part, matchKey (Confirm
// Email / Confirm Password), mask completeness, pattern, numeric bounds, DOB age — lifted
// out of validateForm as a READ-ONLY evaluation. validateForm still owns the painting; this
// owns the rules, so the nav gate can enforce exactly what submit enforces instead of
// growing a second, weaker copy.
// Returns the FIRST failing part's message plus EVERY failing part key, because validateForm
// rings all of them and that behaviour is preserved.
interface CompositeFailure { msg: string; badPartKeys: string[]; }

function compositePartFailure(field: FormField): CompositeFailure | null {
  const hiddenEl = document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${field.key}"]`);
  const grp = hiddenEl ? hiddenEl.closest('.mf-field-group') : null;
  if (!grp) return null;

  const cParts = compositePartsFor(field).filter((p: any) => !p.hidden);
  // Snapshot every sibling value BEFORE judging, so matchKey and dateAge can compare parts.
  const siblingValues: Record<string, string> = {};
  cParts.forEach((p: any) => {
    const el = grp.querySelector<HTMLInputElement>(`[data-mf-part="${p.key}"]`);
    siblingValues[p.key] = el ? String(el.value || '') : '';
  });

  let msg = '';
  const badPartKeys: string[] = [];
  cParts.forEach((p: any) => {
    if (!grp.querySelector<HTMLElement>(`[data-mf-part="${p.key}"]`)) return;
    const pv = siblingValues[p.key];
    const lbl = compositePartLabel(p);
    let e = '';
    if (p.required && !pv) e = requiredMsg(lbl);
    else if (pv) {
      // [Composite v1.4] numeric VALUE bounds (distinct from char-length min/maxLength)
      // and mask completeness join the existing length/pattern checks.
      const isNum = p.type === 'number' || p.min != null || p.max != null;
      if (p.minLength && pv.length < p.minLength) {
        e = vtr('form.min_length', 'Minimum {n} characters', { n: String(p.minLength), min: String(p.minLength) });
      } else if (p.maxLength && pv.length > p.maxLength) {
        e = vtr('form.max_length', 'Maximum {n} characters', { n: String(p.maxLength), max: String(p.maxLength) });
      } else if (isNum) {
        const num = Number(pv);
        if (Number.isNaN(num)) e = vtr('form.invalid_number', 'Must be a number');
        else if (p.min != null && num < Number(p.min)) e = vtr('form.min_value', 'Minimum {n}', { n: String(p.min) });
        else if (p.max != null && num > Number(p.max)) e = vtr('form.max_value', 'Maximum {n}', { n: String(p.max) });
      } else if (p.mask && pv.length < String(p.mask).length) {
        e = p.patternMsg || vtr('form.incomplete', 'Incomplete — please fill all digits');
      } else if (p.pattern) {
        try { if (!new RegExp(p.pattern).test(pv)) e = p.patternMsg || vtr('form.invalid_format', 'Invalid format'); } catch { /* bad regex */ }
      }
    }
    // [Composite v1.4] Cross-part match. Runs even when pv is empty so a required confirm
    // part reports "required" before it reports "does not match".
    if (!e && p.matchKey) {
      if (pv !== siblingValues[p.matchKey]) {
        e = p.matchMsg || vtr('form.match', '{field} does not match', { field: String(lbl || '') });
      }
    }
    // [Composite v1.4] DOB age validation (uses the sibling day/month/year values).
    if (!e && p.dateAge) {
      const age = calculateAge(siblingValues.day, siblingValues.month, siblingValues.year);
      if (!Number.isNaN(age)) {
        if (p.minAge != null && age < Number(p.minAge)) e = vtr('form.min_age', 'Must be at least {n} years old', { n: String(p.minAge) });
        else if (p.maxAge != null && age > Number(p.maxAge)) e = vtr('form.max_age', 'Must be at most {n} years old', { n: String(p.maxAge) });
      }
    }
    if (e) {
      badPartKeys.push(p.key);
      if (!msg) msg = lbl ? lbl + ': ' + e : e;
    }
  });
  return msg ? { msg, badPartKeys } : null;
}

// [GateUntilValid v20260807] The page-level rule set, extracted as a READ-ONLY pass so the
// painting gate (validatePage, on Next/Continue) and the silent gate that drives the disabled
// state of Next/Submit (syncNavigationGate in index.ts) can never drift apart. Two copies of a
// rule set in this codebase has already cost us once — role-visibility grew two rule systems and
// only one of them was known to callers. Returns { key: message } for the fields that FAIL;
// writes nothing to the DOM.
//
// Note on precedence: `required` short-circuits the format checks. That is not a behaviour change
// — the Email/Url checks require a truthy value, so an empty required field could never reach them.
export function pageFieldErrors(
  pageFields: FormField[],
  formId: number,
  includeCompositeParts = false,
): Record<string, string> {
  const errors: Record<string, string> = {};
  flattenFields(pageFields).forEach(field => {
    if (['Html', 'Section', 'Hidden', 'Row'].includes(field.type)) return;
    if (field.showIf && !evaluateCondition(field.showIf as any)) return;

    const val = getFieldValue(field.key, field.type, formId);
    const effType = effectiveFieldType(field);   // [Unify v2] scalar-preset Composite → base type

    if (field.required && (!val || (Array.isArray(val) && val.length === 0))) {
      errors[field.key] = requiredMsg(field.label);
    } else if (effType === 'Email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
      errors[field.key] = vtr('form.invalid_email', 'Invalid email');
    } else if (effType === 'Url' && val && !/^https?:\/\/.+/.test(String(val))) {
      errors[field.key] = vtr('form.invalid_url', 'Please enter a valid URL starting with http:// or https://');
    }

    // Opt-in, and only for the nav gate. A Composite hides its per-part rules behind ONE
    // combined value: password_confirm combines to `v.password`, so judging the combined
    // value alone declared the field valid the moment the FIRST box had text — the gate
    // unblocked Submit on a password that did not match its confirmation. validatePage
    // keeps its original (combined-value-only) semantics so no existing form's Next
    // button gets stricter; the gate asks for the full rule set.
    if (includeCompositeParts && !errors[field.key] && field.type === 'Composite') {
      const fail = compositePartFailure(field);
      if (fail) errors[field.key] = fail.msg;
    }
  });
  return errors;
}

/** Validate current page fields (multi-step) */
export function validatePage(pageFields: FormField[], formId: number): boolean {
  const errors = pageFieldErrors(pageFields, formId);
  clearFieldErrors(formId);

  Object.keys(errors).forEach(key => {
    const errEl = document.getElementById(`mf-err-${key}`);
    if (errEl) { errEl.textContent = errors[key]; errEl.style.display = 'block'; }
  });
  return Object.keys(errors).length === 0;
}

/** Full form validation */
export function validateForm(config: RendererConfig): boolean {
  if (!config.schema?.fields) return false;
  const errors: Record<string, string> = {};
  let firstError: HTMLElement | null = null;
  const allFields = flattenFields(config.schema.fields);
  const formId = config.formId;

  allFields.forEach(field => {
    if (['Html', 'Section', 'Hidden', 'Row'].includes(field.type)) return;
    if (field.showIf && !evaluateCondition(field.showIf as any)) return;

    const val = getFieldValue(field.key, field.type, formId);
    const v = field.validation || {} as any;
    const effType = effectiveFieldType(field);   // [Unify v2] scalar-preset Composite → base type

    if (field.required && (!val || (Array.isArray(val) && val.length === 0))) {
      errors[field.key] = v.customMessage || requiredMsg(field.label);
    }
    if (effType === 'Email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
      errors[field.key] = vtr('form.invalid_email_address', 'Please enter a valid email address');
    }
    if (effType === 'Url' && val && !/^https?:\/\/.+/.test(String(val))) {
      errors[field.key] = vtr('form.invalid_url', 'Please enter a valid URL starting with http:// or https://');
    }
    if (v.minLength && val && String(val).length < v.minLength) {
      // pass both {n} (en source) and {min} (the name translators used) so either substitutes
      errors[field.key] = v.customMessage || vtr('form.min_length', 'Minimum {n} characters', { n: String(v.minLength), min: String(v.minLength) });
    }
    if (v.maxLength && val && String(val).length > v.maxLength) {
      errors[field.key] = v.customMessage || vtr('form.max_length', 'Maximum {n} characters', { n: String(v.maxLength), max: String(v.maxLength) });
    }
    // [InputMask v20260723-01] Field-level mask completeness: the stored value IS the masked
    // string, so a complete value has exactly the mask length (same rule as composite parts).
    if (v.mask && val && String(val).length < String(v.mask).length) {
      errors[field.key] = v.customMessage || vtr('form.incomplete', 'Incomplete — please fill the required format');
    }
    if (v.pattern && val) {
      try {
        if (!new RegExp(v.pattern).test(String(val))) {
          errors[field.key] = v.customMessage || vtr('form.invalid_format', 'Invalid format');
        }
      } catch { /* invalid regex */ }
    }

    // [Composite v1.3] Per-part validation. The whole-field checks above run on the
    // combined hidden value; this enforces each sub-input's own required/min/max/pattern
    // rules (configured in the Composite Designer) against its live DOM value. The first
    // failing part wins the field-level error message + the red ring lands on that part.
    if (field.type === 'Composite') {
      const hiddenEl = document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${field.key}"]`);
      const grp = hiddenEl ? hiddenEl.closest('.mf-field-group') : null;
      if (grp) {
        // The rules themselves live in compositePartFailure so the nav gate applies the
        // same ones; this block owns only the painting.
        grp.querySelectorAll<HTMLElement>('[data-mf-part]').forEach(el => el.classList.remove('mf-error'));
        const fail = compositePartFailure(field);
        if (fail) {
          if (!errors[field.key]) errors[field.key] = fail.msg;
          fail.badPartKeys.forEach(pk => {
            const el = grp.querySelector<HTMLElement>(`[data-mf-part="${pk}"]`);
            if (!el) return;
            el.classList.add('mf-error');
            if (!firstError) firstError = el;
          });
        }
      }
    }

    // Display
    const errEl = document.getElementById(`mf-err-${field.key}`);
    if (errEl) {
      errEl.textContent = errors[field.key] || '';
      const input = document.querySelector<HTMLElement>(`[name="${field.key}"]`);
      if (input) {
        if (errors[field.key]) { input.classList.add('mf-error'); if (!firstError) firstError = input; }
        else input.classList.remove('mf-error');
      }
    }
  });

  if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return Object.keys(errors).length === 0;
}

/** Collect all form data */
export function collectFormData(config: RendererConfig): Record<string, unknown> | null {
  if (!config.schema?.fields) return null;
  const allFields = flattenFields(config.schema.fields);
  const data: Record<string, unknown> = {};
  const formId = config.formId;
  const W = (window as any).MegaFormWidgets;

  // Validate widgets first
  if (W) {
    const wrapper = document.getElementById(`mf-form-wrapper-${formId}`) || document.body;
    for (const f of allFields) {
      if (W.widgetTypes?.[f.type] && W.validateWidget) {
        const err = W.validateWidget(f.key, f.type, wrapper);
        let errorMsg: string | null = null;
        if (typeof err === 'string' && err) errorMsg = err;
        else if (typeof err === 'boolean' && !err && f.required) errorMsg = requiredMsg(f.label || f.key);
        if (errorMsg && f.showIf && !evaluateCondition(f.showIf as any)) errorMsg = null;
        if (errorMsg) {
          const errEl = document.getElementById(`mf-err-${f.key}`);
          if (errEl) { errEl.textContent = errorMsg; errEl.style.display = 'block'; }
          return null;
        }
      }
    }
  }

  allFields.forEach(field => {
    if (['Html', 'Section', 'Row'].includes(field.type)) return;
    if (field.showIf && !evaluateCondition(field.showIf as any)) return;
    if (field.type === 'File') {
      // [ReceiptUploadFix v20260713-01] The dropzone uploader stores the uploaded-file
      // metadata JSON in the field's hidden value input — send THAT, it is what the
      // server's PersistSubmissionFiles* reads to record MF_Files rows against the
      // submission. Without it the submission saved file-less even after a successful
      // upload (the old code only sent picked filenames, and only when the file input
      // carried a name attribute — the SSR markup keeps the name on the hidden input).
      const hiddenVal = document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${field.key}"]`)?.value || '';
      if (hiddenVal.trim()) {
        data[field.key] = hiddenVal;
        return;
      }
      // [FileRequiredValueFix v20260502-08] Fallback: include selected filename(s) so a
      // required File field passes the server's required check even when no upload
      // metadata exists (e.g. upload endpoint unavailable).
      const fileInput = document.querySelector<HTMLInputElement>(
        `input[type="file"][name="${field.key}"], input[type="file"][data-field-key="${field.key}"]`);
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const names: string[] = [];
        for (let i = 0; i < fileInput.files.length; i++) names.push(fileInput.files[i].name);
        data[field.key] = names.join(', ');
      }
      return;
    }
    data[field.key] = getFieldValue(field.key, field.type, formId);
  });

  // [Composite server-validate v20260616] Also send the raw per-part values so the SERVER can
  // re-enforce per-part rules (required/mask/pattern/matchKey/dateAge/min/max) — the client
  // otherwise posts ONLY the combined hidden value, so a request that bypasses our JS could
  // skip every per-part rule. Additive + safe: the server validates then STRIPS __mf_parts
  // before storing, so DataJson still holds the combined values exactly as before.
  const compositeParts: Record<string, Record<string, string>> = {};
  allFields.forEach((field) => {
    if (field.type !== 'Composite') return;
    if (field.showIf && !evaluateCondition(field.showIf as any)) return;
    const hiddenEl = document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${field.key}"]`);
    const grp = hiddenEl ? hiddenEl.closest('.mf-field-group') : null;
    if (!grp) return;
    const partVals: Record<string, string> = {};
    grp.querySelectorAll<HTMLElement>('[data-mf-part]').forEach((el) => {
      const pk = el.getAttribute('data-mf-part') || '';
      if (pk) partVals[pk] = String((el as HTMLInputElement).value || '');
    });
    if (Object.keys(partVals).length) compositeParts[field.key] = partVals;
  });
  if (Object.keys(compositeParts).length) data['__mf_parts'] = compositeParts;

  // Honeypot
  const hp = document.querySelector<HTMLInputElement>(`[name="${config.honeypotField || '__mf_hp'}"]`);
  if (hp) data[config.honeypotField || '__mf_hp'] = hp.value;
  data['__mf_ts'] = config.loadTimestamp || 0;

  return data;
}

/** Clear all field error indicators */
export function clearFieldErrors(formId: number): void {
  document.querySelectorAll('.mf-field-error').forEach(el => el.classList.remove('mf-field-error'));
  document.querySelectorAll('.mf-field-error-msg').forEach(el => el.remove());
  const errDiv = document.getElementById(`mf-error-${formId}`);
  if (errDiv) errDiv.style.display = 'none';
}

/** Bind input/change to clear errors on interaction */
export function bindFieldErrorClear(formId: number): void {
  const form = document.getElementById(`mf-form-${formId}`);
  if (!form) return;
  const clear = (e: Event) => {
    const wrapper = (e.target as HTMLElement).closest('.mf-field-group');
    if (wrapper?.classList.contains('mf-field-error')) {
      wrapper.classList.remove('mf-field-error');
      wrapper.querySelector('.mf-field-error-msg')?.remove();
    }
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);
}
