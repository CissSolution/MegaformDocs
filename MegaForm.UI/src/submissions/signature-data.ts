import { h } from '@shared/dom';

export const SUBMISSION_SIGNATURE_DATA_BADGE = 'SubmissionSignatureData v20260424-01';

export function getSubmissionSignatureDataUrl(rawValue: unknown): string {
  if (typeof rawValue !== 'string') return '';
  const trimmed = rawValue.trim();
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed) ? trimmed : '';
}

export function isSubmissionSignatureDataUrl(rawValue: unknown): boolean {
  return getSubmissionSignatureDataUrl(rawValue).length > 0;
}

export function renderSubmissionSignatureImage(rawValue: unknown, className: string): HTMLElement {
  const src = getSubmissionSignatureDataUrl(rawValue);
  return h('img', { src, class: className, alt: 'Signature' }) as HTMLElement;
}
