/**
 * MegaForm AI — Feedback log.
 *
 * Fire-and-forget POST to /AiTools/LogFeedback whenever the dispatcher
 * rejects an op (ok:false) or the AI self-corrects after a previous fail.
 * Rows land in MF_AI_KB_Feedback for admin review + promotion to
 * MF_AI_KB_Templates (the "AI learns from production failures" loop).
 *
 * Why a sibling module: keeps ops.ts focused on dispatch + business
 * rules, and keeps the feedback payload shape + endpoint URL handling
 * here. Per the 2026-05-29 "split TS when too big" directive.
 */
export interface FeedbackPayload {
  sessionId?: string;
  ruleId?: string;
  knowledgeId?: number;
  widgetType?: string;
  op?: string;
  attemptedJson: string;
  rejectionMessage?: string;
  fixedJson?: string;
  outcome: 'rejected' | 'fixed' | 'abandoned' | 'reported';
  formId?: number;
}

const SESSION_KEY = '__mfai_session_id';

function sessionId(): string {
  const w = window as any;
  if (w[SESSION_KEY]) return w[SESSION_KEY];
  const id = 'sess_' + Math.random().toString(36).slice(2, 10) + '_' + Math.random().toString(36).slice(2, 10);
  w[SESSION_KEY] = id;
  return id;
}

function getApiBase(): string {
  const w = window as any;
  const pf = w.__MF_PLATFORM__ || {};
  if (pf && typeof pf.apiBase === 'string' && pf.apiBase) return pf.apiBase.replace(/\/$/, '') + '/';
  if (w.__MF_API_BASE__) return String(w.__MF_API_BASE__).replace(/\/$/, '') + '/';
  // [B51] Platform-aware fallback (Oqtane = /api/MegaForm/, DNN = legacy)
  const platform = String(pf.platform || '').toLowerCase();
  if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/MegaForm/';
  }
  return '/DesktopModules/MegaForm/API/';
}

function getAntiForgery(): string {
  try {
    const sf = (window as any).$ && (window as any).$.ServicesFramework;
    if (sf) {
      const inst = sf(0);
      if (inst && typeof inst.getAntiForgeryValue === 'function') return inst.getAntiForgeryValue() || '';
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * Best-effort feedback log. Never throws. The dispatcher path treats this
 * as fire-and-forget — a network failure must not abort the form-build
 * loop.
 */
export function logFeedback(payload: FeedbackPayload): void {
  try {
    const body = {
      sessionId: payload.sessionId || sessionId(),
      ruleId: payload.ruleId || null,
      knowledgeId: payload.knowledgeId || null,
      widgetType: payload.widgetType || null,
      op: payload.op || null,
      attemptedJson: payload.attemptedJson || '',
      rejectionMessage: payload.rejectionMessage || null,
      fixedJson: payload.fixedJson || null,
      outcome: payload.outcome || 'rejected',
      formId: payload.formId || (window as any).MegaFormBuilder?.state?.formId || null,
    };
    const url = getApiBase() + 'AiTools/LogFeedback';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    const af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
    xhr.timeout = 2500;
    xhr.send(JSON.stringify(body));
  } catch { /* ignore — fire-and-forget */ }
}

/**
 * Heuristic to extract `RuleId` (e.g. "DL-001") from a rejection message
 * that mentions it. Returns undefined when no match.
 */
export function pickRuleId(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const m = /\b([A-Z]{2,6}-\d{1,4})\b/.exec(message);
  return m ? m[1] : undefined;
}
