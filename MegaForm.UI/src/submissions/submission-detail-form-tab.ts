import { h } from '@shared/dom';
import type { FormField } from '@core/types';
import { renderFormView } from './SubmissionFormView';
import { coerceSubmissionDetail, getSubmissionFields, getSubmissionValues } from './submission-detail-utils';

export function renderSubmissionFormTab(submission: any, fallbackFields: FormField[]): HTMLElement {
  const detail = coerceSubmissionDetail(submission);
  const fields = getSubmissionFields(detail, fallbackFields);
  const values = getSubmissionValues(detail);
  // [DataViewFkFix v20260601-07] Walk every casing for formId so the
  // SubmissionFormView's FK resolver can call /Field/Options?formId=N even
  // when the modal is opened from the dashboard (where window.__MF_PLATFORM__
  // has no pin.formId).
  const sub = detail?.submission as any;
  const formId = Number(
    sub?.formId || sub?.FormId ||
    (submission as any)?.formId || (submission as any)?.FormId ||
    (submission as any)?.submission?.formId || (submission as any)?.submission?.FormId ||
    (submission as any)?.Submission?.FormId || (submission as any)?.Submission?.formId ||
    0
  );
  const root = h('div', { class: 'mf-modal-form-view' });
  root.appendChild(renderFormView(values, fields, formId));
  return root;
}
