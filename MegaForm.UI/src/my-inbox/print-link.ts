// [SubmissionPrint v20260713] URL of the server-rendered per-submission print
// document (GET {apiBase}Submissions/{id}/Print — the form's Print layout with
// the submitted values merged in; server enforces the same row-level view gate
// as GET Submissions/{id}). Same URL shape on all 4 platforms — DNN maps it via
// an explicit MegaFormSubmissionPrint route.
let printBase = '';

/** Hosts (My Inbox board / Submissions detail sheet) register their API base once. */
export function setSubmissionPrintBase(base: string): void {
  if (base) printBase = String(base);
}

export function submissionPrintUrl(submissionId: number): string | null {
  if (!submissionId || submissionId <= 0) return null;
  const platform = String((window as any).__MF_PLATFORM__?.platform || '').toLowerCase();
  const base = (printBase || '/api/MegaForm/').replace(/\/+$/, '') + '/';
  let url = `${base}Submissions/${submissionId}/Print`;
  if (platform === 'oqtane') {
    const p = (window as any).__MF_PLATFORM__ || {};
    const mid = parseInt(String(p.moduleId ?? ''), 10);
    const sid = parseInt(String(p.siteId ?? p.portalId ?? ''), 10);
    const q: string[] = [];
    if (Number.isFinite(mid) && mid > 0) q.push(`authmoduleid=${mid}`);
    if (Number.isFinite(sid) && sid > 0) q.push(`authsiteid=${sid}`);
    if (q.length) url += '?' + q.join('&');
  }
  return url;
}

/** Open the print document in a new tab; false when unsupported on this platform. */
export function openSubmissionPrint(submissionId: number): boolean {
  const url = submissionPrintUrl(submissionId);
  if (!url) return false;
  try { window.open(url, '_blank', 'noopener'); } catch { return false; }
  return true;
}
