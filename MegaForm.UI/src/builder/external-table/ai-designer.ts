/**
 * MegaForm — AI form designer for an existing SQL table  [ATBE P2]
 *
 * The loop that makes a cheap model safe:
 *
 *   machine  → envelope   (only the columns a human may fill, each with its verdict already made)
 *   model    → blueprint  (labels, grouping, widget choice — nothing that has a right answer)
 *   machine  → verdict    (server re-probes the table and marks the blueprint)
 *   on reject → the errors go BACK to the model, which fixes them (up to 3 attempts)
 *   still bad → the deterministic schema is used instead, and we say so
 *
 * The model never sees the database, never writes SQL, and never decides whether a field is
 * required. So the worst a bad answer can do is look clumsy — it cannot break the customer's data.
 *
 * Badge: ExternalAiDesigner v20260711-P2
 */

const BADGE = 'ExternalAiDesigner v20260711-P2';
const MAX_ATTEMPTS = 3;

/** Oqtane resolves site context from the URL alias; an admin XHR has none, so the site id must
 *  ride along or the server cannot tell which site a new form belongs to. */
function siteQs(): string {
  const pf = (window as any).__MF_PLATFORM__ || {};
  const siteId = Number(pf.siteId || pf.SiteId || 0);
  return siteId > 0 ? 'siteId=' + siteId : '';
}

function apiRoot(): string {
  const pf = (window as any).__MF_PLATFORM__ || {};
  const isOqtane = String(pf.platform || '').toLowerCase() === 'oqtane';
  return isOqtane ? '/api/MegaFormPopup/ExternalTable/' : '/DesktopModules/MegaForm/API/ExternalTable/';
}

function headers(json = false): Record<string, string> {
  const input = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
  const token = input ? input.value : '';
  const h: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (json) h['Content-Type'] = 'application/json';
  if (token) {
    h['X-XSRF-TOKEN-HEADER'] = token;        // Oqtane's own header name; the defaults are refused
    h['RequestVerificationToken'] = token;   // DNN / Web
  }
  return h;
}

const SYSTEM_PROMPT = [
  'You design a data-entry form for a table that already exists in the customer\'s database.',
  '',
  'You are given an envelope. It lists ONLY the columns a person may fill in. Every other column —',
  'keys, computed values, audit stamps — is handled without you and is not yours to place.',
  '',
  'Your job is the human part: a clear label for each column, help text where it earns its place,',
  'sensible grouping into sections, and a widget chosen from that column\'s allowedWidgets.',
  '',
  'You must NOT: invent, rename or drop a column; use a widget outside allowedWidgets; change what',
  'is required; write SQL; mention keys, tables or connections.',
  '',
  'Answer with JSON only:',
  '{"formTitle":"…","sections":[{"title":"…","fields":[{"column":"…","label":"…","widget":"…",',
  '"placeholder":"…","helpText":"…"}]}],"questionsForAdmin":["…"]}',
].join('\n');

export interface DesignResult {
  formId: number;
  fields: number;
  source: 'ai' | 'deterministic';
  attempts: number;
  /** What the machine rejected on each attempt — shown to the admin, not hidden. */
  rejections: string[][];
  questions: string[];
}

async function getEnvelope(connectionKey: string, schema: string, table: string): Promise<any> {
  const qs = `connectionKey=${encodeURIComponent(connectionKey)}&schema=${encodeURIComponent(schema || '')}&table=${encodeURIComponent(table)}`;
  const r = await fetch(apiRoot() + 'Envelope?' + qs, { credentials: 'same-origin', headers: headers() });
  if (!r.ok) throw new Error('Envelope HTTP ' + r.status);
  return await r.json();
}

async function apply(body: any): Promise<{ status: number; json: any }> {
  const r = await fetch(apiRoot() + 'ApplyBlueprint?' + siteQs(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: headers(true),
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function bindDeterministic(connectionKey: string, schema: string, table: string, title?: string): Promise<any> {
  const r = await fetch(apiRoot() + 'Bind?' + siteQs(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: headers(true),
    body: JSON.stringify({ connectionKey, schema, table, formId: 0, title, timeColumnConfirmed: true }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body && (body.message || body.error)) || 'Bind HTTP ' + r.status);
  return body;
}

function parseBlueprint(raw: string): any {
  const text = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Designs the form. Falls back to the machine's own schema rather than shipping something the
 * validator refused — a form the admin cannot trust is worse than a plain one.
 */
export async function designWithAi(
  connectionKey: string,
  schema: string,
  table: string,
  onStep?: (msg: string) => void,
): Promise<DesignResult> {
  const step = (m: string) => { try { onStep && onStep(m); } catch { /* UI only */ } };
  const ai = (window as any).MF_AI;
  const rejections: string[][] = [];

  step('Đang dò bảng và đóng gói dữ kiện cho AI…');
  const envelope = await getEnvelope(connectionKey, schema, table);

  if (!ai || typeof ai.chat !== 'function') {
    step('Chưa cấu hình AI — dùng bản máy sinh.');
    const res = await bindDeterministic(connectionKey, schema, table);
    return { formId: res.formId, fields: res.fields, source: 'deterministic', attempts: 0, rejections, questions: [] };
  }

  let corrections = '';
  let questions: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    step(`AI đang thiết kế (lần ${attempt}/${MAX_ATTEMPTS})…`);

    const user = corrections
      ? `${JSON.stringify(envelope)}\n\nYour previous answer was rejected by the validator:\n${corrections}\nReturn a corrected blueprint. Fix exactly these problems and change nothing else.`
      : JSON.stringify(envelope);

    let blueprint: any;
    try {
      const raw = await ai.chat({ system: SYSTEM_PROMPT, user, jsonMode: true, temperature: 0.2, maxTokens: 3000 });
      blueprint = parseBlueprint(raw);
    } catch (err: any) {
      rejections.push(['Model error: ' + (err.message || String(err))]);
      corrections = 'Your answer was not valid JSON. Return JSON only, no prose, no code fences.';
      continue;
    }

    questions = Array.isArray(blueprint.questionsForAdmin) ? blueprint.questionsForAdmin : [];

    step('Máy đang chấm bản thiết kế…');
    const res = await apply({ connectionKey, schema, table, formId: 0, title: blueprint.formTitle, blueprint });

    if (res.status === 200) {
      return { formId: res.json.formId, fields: res.json.fields, source: 'ai', attempts: attempt, rejections, questions };
    }

    if (res.status === 422 && res.json && res.json.errors) {
      const msgs = res.json.errors.map((e: any) => `- [${e.code}] ${e.message}`);
      rejections.push(msgs);
      corrections = msgs.join('\n');
      step(`Bị máy trả lại ${msgs.length} lỗi — AI sẽ tự sửa.`);
      continue;
    }

    throw new Error((res.json && (res.json.message || res.json.error)) || 'ApplyBlueprint HTTP ' + res.status);
  }

  // Three rejected attempts. The deterministic schema always maps to real columns, so it is the one
  // thing we can still ship honestly.
  step('AI không đạt sau 3 lần — dùng bản máy sinh (luôn khớp cột thật).');
  const res = await bindDeterministic(connectionKey, schema, table);
  return { formId: res.formId, fields: res.fields, source: 'deterministic', attempts: MAX_ATTEMPTS, rejections, questions };
}

(function register() {
  if (typeof window === 'undefined') return;
  (window as any).__MF_AI_DESIGNER_BADGE__ = BADGE;
  (window as any).__MF_DESIGN_TABLE_WITH_AI__ = designWithAi;
})();
