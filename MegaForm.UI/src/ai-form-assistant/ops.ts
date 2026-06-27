/**
 * MegaForm AI Form Assistant — operations dispatcher (barrel).
 *
 * AI returns a JSON array of ops. dispatchOps() walks the array, applies each
 * op via the HANDLERS map, then triggers canvas re-render. The op handlers now
 * live in sibling modules; this file owns the dispatcher, the ASK-DESIGN gate,
 * listOpSchemas(), and the window.MFAI_Ops binding.
 *
 *   ops-shared.ts    — shared accessors, types, guide-guard, field-normalize, validateRuleArray
 *   ops-field.ts     — add/remove/set field, replace_form_schema, save_form, chat_message, unsplash
 *   ops-meta.ts      — set_form_meta
 *   ops-app-batch.ts — create_form / app_batch / execute_sql / table ops / record visibility
 */

import { logFeedback, pickRuleId } from './feedback-log';
import { type Op, type OpResult, getSchema } from './ops-shared';
export type { Op, OpResult } from './ops-shared';
export { readCurrentFormSnapshot } from './ops-shared';

import {
  opAddField, opRemoveField, opSetFieldProperty, opSetFieldSql, opApplyDynLabelPreset,
  opReorderFields, opSaveForm, opChatMessage, opReplaceFormSchema, opSetFieldImageUnsplash,
  opSetHtmlText,
} from './ops-field';
import { opSetFormMeta } from './ops-meta';
import {
  opAddSubformFromTable, opAddFieldFromColumn, opExecuteSql, opCreateForm,
  opAppBatch, opSetRecordVisibility,
} from './ops-app-batch';

const OPS_BADGE = 'MfAiOps v20260627-01';

const HANDLERS: Record<string, (op: Op) => OpResult> = {
  add_field: opAddField,
  remove_field: opRemoveField,
  set_field_property: opSetFieldProperty,
  set_field_sql: opSetFieldSql,
  apply_dynlabel_preset: opApplyDynLabelPreset,
  set_form_meta: opSetFormMeta,
  // [B2 2026-06-27] Rebrand hardcoded shell text (premium keep-style edit).
  set_html_text: opSetHtmlText,
  reorder_fields: opReorderFields,
  save_form: opSaveForm,
  chat_message: opChatMessage,
  // [v20260528-14] AI-driven schema editing — bulk replace + Unsplash image.
  replace_form_schema: opReplaceFormSchema,
  set_field_image_unsplash: opSetFieldImageUnsplash,
  // [v20260528-16] Relation-database ops — AI can list SQL tables & spawn
  // a Subform/DataGrid from a table name. Builder UI mirrors this via the
  // DB Tables FAB; AI uses these ops so prompts like "create an Invoice
  // form with subform OrderItems and auto Total" work end-to-end.
  add_subform_from_table: opAddSubformFromTable,
  add_field_from_column:  opAddFieldFromColumn,
  // [v20260531-AppBatch] Multi-form + tables in one AI turn — no chat exit.
  execute_sql:            opExecuteSql,
  create_form:            opCreateForm,
  app_batch:              opAppBatch,
  // [B86] Portal / row-level security — turn the form into a private per-user portal.
  set_record_visibility:  opSetRecordVisibility,
};

// [v20260530-24 ASK-DESIGN] Per-batch token so the orange bubble re-renders
// on EVERY new AI turn (not just the first one in the page lifetime).
let __askBubbleBatchToken = 0;

// [v20260530-25 ASK-DESIGN] Snapshot of the ops the dispatcher REJECTED at the
// ASK-DESIGN gate, so the A/B button click can REPLAY them automatically
// without making the user re-type their prompt.
let __lastRejectedBatch: Op[] = [];

// [v20260530-21 ASK-DESIGN] Ops that don't touch the form schema at all —
// safe to run on a customised form without asking the user first.
const NON_MUTATING_OPS = new Set(['chat_message', 'save_form']);

// [v20260602-B37] Detect a pure form-width tweak — set_form_meta touching ONLY
// themeCssOverrides[--mf-form-max-width] (and nothing else). When true the
// ASK-DESIGN gate is skipped because container width is not a "design" change.
function isPureWidthChange(op: any): boolean {
  if (!op || op.op !== 'set_form_meta') return false;
  // Recognise width-only intent across the 3 channels AI may emit
  const keys = Object.keys(op).filter(k => k !== 'op' && k !== 'designDecision' && k !== 'explain');
  // Allow themeCssOverrides path
  if (keys.length === 1 && keys[0] === 'themeCssOverrides') {
    const tco = op.themeCssOverrides || {};
    const tcoKeys = Object.keys(tco);
    return tcoKeys.length === 1 && tcoKeys[0] === '--mf-form-max-width';
  }
  // Allow customCssAppend path when the appended block is a single width rule
  if (keys.length === 1 && keys[0] === 'customCssAppend') {
    var s = String(op.customCssAppend || '').trim();
    var widthOnly = /^[^{}]*\{\s*(?:max-width|width)\s*:[^;}]+;?\s*(?:(?:max-width|width)\s*:[^;}]+;?\s*)?\}\s*$/i.test(s);
    return widthOnly;
  }
  return false;
}

/**
 * Default = PRESERVE design. When the current form has any non-empty
 * customisation (customHtml / customCss / customScripts / theme /
 * themeCssOverrides), the AI must FIRST chat_message ask the user "keep
 * design or change it?", get an explicit answer, then re-emit each op
 * with op.designDecision='preserve' or 'change' (or set
 * window.__mfai_session.designDecision before dispatching).
 *
 * Once a decision is recorded on window.__mfai_session.designDecision,
 * subsequent ops in the same browser session don't need to re-ask.
 * The user-side chat UI can reset this by calling
 * `window.MFAI_Ops.resetDesignDecision()` (exposed below).
 */
function checkDesignConfirmation(op: Op): OpResult | null {
  if (NON_MUTATING_OPS.has(String(op.op))) return null;
  // [v20260602-B37] WIDTH-ONLY exemption — when the op is a pure width
  // change (themeCssOverrides[--mf-form-max-width] only, no field/style/HTML
  // touches), it's NOT a design change. Container width grows/shrinks but
  // interior layout, theme, fonts, customHtml, customCss all stay intact.
  // Without this exemption the user has to answer A/B every time they say
  // "make form 100% width" on any premium form.
  if (op.op === 'set_form_meta' && isPureWidthChange(op)) return null;
  const schema = getSchema();
  const settings = (schema?.settings || (schema as any)?.Settings || {}) as any;
  const lengths: Record<string, number> = {};
  const has = (v: any): number => {
    if (v == null) return 0;
    if (typeof v === 'string') return v.trim().length;
    if (typeof v === 'object') return Object.keys(v).length;
    return 0;
  };
  const fields = [
    ['customHtml',     has(settings.customHtml     || settings.CustomHtml)],
    ['customCss',      has(settings.customCss      || settings.CustomCss)],
    ['customScripts',  has(settings.customScripts  || settings.CustomScripts)],
    ['theme',          has(settings.theme          || settings.Theme)],
    ['themeCssOverrides', has(settings.themeCssOverrides || settings.ThemeCssOverrides)],
  ] as Array<[string, number]>;
  const presentList = fields.filter(([, n]) => n > 0);
  if (presentList.length === 0) return null;  // no design to protect

  // Session-level decision: once set, all subsequent ops skip this check.
  const w = window as any;
  const session = w.__mfai_session = w.__mfai_session || {};
  if (session.designDecision === 'preserve' || session.designDecision === 'change') return null;

  // Per-op opt-in flag
  if (op.designDecision === 'preserve' || op.designDecision === 'change') {
    session.designDecision = op.designDecision;
    return null;
  }

  const detail = presentList.map(([k, n]) => k + ':' + (typeof n === 'number' && n > 0 && (k === 'customScripts' || k === 'themeCssOverrides') ? n + 'keys' : (n + 'ch'))).join(', ');
  const askText = 'Form này đã có thiết kế tuỳ biến (' + detail + '). Bạn muốn tôi: (A) GIỮ NGUYÊN thiết kế và chỉ cập nhật fields/logic theo yêu cầu của bạn — mặc định, an toàn nhất; hay (B) cho phép tôi cập nhật cả thiết kế (vd thay đổi màu/font/layout cho khớp mục đích mới)?';
  renderAskDesignBubble(askText);
  return {
    op: op.op, ok: false,
    message: '[ASK-DESIGN] This form has a custom design (' + detail + '). STOP — do NOT retry this op, do NOT call save_form, do NOT try alternative ops in this batch. Your VERY NEXT and ONLY action must be: {"op":"chat_message","text":' + JSON.stringify(askText) + '}. Then WAIT for the user reply. When the user replies (A / "giữ nguyên" / "preserve") → re-emit your real ops with `designDecision:"preserve"` on the FIRST op only. When the user replies (B / "thay đổi" / "change") → re-emit with `designDecision:"change"`. The session marker remembers the decision so subsequent ops in the same chat skip this gate.',
  };
}

// [v20260530-26] When the user has chosen `designDecision='preserve'`, the
// dispatcher strips ALL destructive design fields from incoming ops before any
// handler runs. This prevents the "AI edited customHtml once, second edit
// wipes it" bug — even if AI emits {customHtml:'', replaceCustomHtml:true} in
// a second turn (after the gate has been satisfied), the destructive fields
// silently fall off and the form's design survives intact.
const DESTRUCTIVE_FIELDS = ['customHtml', 'customCss', 'customScripts', 'theme', 'themeCssOverrides'];
const DESTRUCTIVE_FLAGS  = ['replaceCustomHtml', 'replaceCustomCss', 'replaceTheme'];
function scrubPreserveDesign(op: Op): Op {
  if (!op) return op;
  const w = window as any;
  if (w.__mfai_session?.designDecision !== 'preserve') return op;  // only scrub on preserve
  if (NON_MUTATING_OPS.has(String(op.op))) return op;
  const dropped: string[] = [];
  const copy: Op = { ...op };
  DESTRUCTIVE_FIELDS.forEach((f) => {
    const v = (copy as any)[f];
    // Strip when AI is BLANKING (most common wipe path).
    if (typeof v === 'string' && v.length === 0) { delete (copy as any)[f]; dropped.push(f + '=""'); return; }
    if (v && typeof v === 'object' && Object.keys(v).length === 0) { delete (copy as any)[f]; dropped.push(f + '={}'); return; }
  });
  // Also strip the explicit destructive-confirmation flags. With preserve
  // chosen, AI does not get to override the user's stated intent.
  DESTRUCTIVE_FLAGS.forEach((f) => {
    if ((copy as any)[f]) { delete (copy as any)[f]; dropped.push(f); }
  });
  // For replace_form_schema, scrub the embedded settings as well so the
  // auto-merge sees an empty value and back-fills from the existing settings.
  if (copy.op === 'replace_form_schema' && copy.schema && typeof copy.schema === 'object' && copy.schema.settings) {
    DESTRUCTIVE_FIELDS.forEach((f) => {
      const v = (copy.schema.settings as any)[f];
      if (typeof v === 'string' && v.length === 0) { delete (copy.schema.settings as any)[f]; dropped.push('schema.settings.' + f + '=""'); }
      else if (v && typeof v === 'object' && Object.keys(v).length === 0) { delete (copy.schema.settings as any)[f]; dropped.push('schema.settings.' + f + '={}'); }
    });
  }
  if (dropped.length) {
    try { console.info('[mfai preserve-scrub]', op.op, 'dropped:', dropped.join(', ')); } catch {}
  }
  return copy;
}

// Render the ASK-DESIGN question as an assistant message bubble directly in the
// chat log so the user sees it even if the AI fails to emit chat_message. The
// dispatcher does this once per session-design-decision cycle.
function renderAskDesignBubble(text: string): void {
  try {
    const w = window as any;
    const session = w.__mfai_session = w.__mfai_session || {};
    // [v20260530-24] Dedupe ONLY within the same dispatchOps batch. Fresh AI
    // turn ⇒ fresh batch token ⇒ bubble re-renders so user always sees the
    // A/B buttons in the latest chat scroll position.
    if (session.lastBubbleBatchToken === __askBubbleBatchToken) return;
    session.lastBubbleBatchToken = __askBubbleBatchToken;
    const log = document.getElementById('mf-ai-log');
    if (!log) return;
    const bubble = document.createElement('div');
    bubble.className = 'mf-ai-msg mf-ai-msg-assistant mf-ai-ask-design';
    bubble.style.cssText = 'align-self:flex-start;max-width:85%;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.5;box-shadow:0 1px 2px rgba(0,0,0,0.04);';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:600;margin-bottom:4px;color:#c2410c;';
    head.textContent = '⚠ Form có thiết kế tuỳ biến — xác nhận';
    bubble.appendChild(head);
    const body = document.createElement('div');
    body.textContent = text;
    bubble.appendChild(body);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;';
    const makeBtn = (label: string, bg: string, fg: string, decision: 'preserve' | 'change') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'flex:1 1 auto;min-width:140px;padding:8px 12px;background:' + bg + ';color:' + fg + ';border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;';
      b.textContent = label;
      b.addEventListener('click', () => {
        const s = (w.__mfai_session = w.__mfai_session || {});
        s.designDecision = decision;
        try {
          btnRow.style.opacity = '0.55';
          btnRow.style.pointerEvents = 'none';
          Array.from(btnRow.querySelectorAll('button')).forEach((x: any) => { x.disabled = true; });
        } catch {}

        // [v20260530-25] Auto-replay the rejected batch right away so the user
        // doesn't have to re-type their prompt. The session marker is set, so
        // the gate releases.
        const replay = __lastRejectedBatch.slice();
        const ack = document.createElement('div');
        ack.style.cssText = 'align-self:flex-start;max-width:85%;background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:8px 11px;border-radius:8px;font-size:12px;';
        ack.textContent = decision === 'preserve'
          ? '✓ GIỮ NGUYÊN thiết kế — đang áp dụng ' + replay.length + ' thay đổi…'
          : '✓ CHO PHÉP thay đổi thiết kế — đang áp dụng ' + replay.length + ' thay đổi…';
        log.appendChild(ack);
        log.scrollTop = log.scrollHeight;

        if (replay.length) {
          // dispatchOps fires synchronously; render each result inline
          const results = dispatchOps(replay);
          results.forEach((r) => {
            const line = document.createElement('div');
            line.style.cssText = 'align-self:flex-start;max-width:90%;padding:6px 10px;border-radius:6px;font-size:12px;background:' + (r.ok ? '#f0fdf4' : '#fef2f2') + ';color:' + (r.ok ? '#15803d' : '#991b1b') + ';border:1px solid ' + (r.ok ? '#bbf7d0' : '#fecaca') + ';';
            line.textContent = (r.ok ? '✓ ' : '✗ ') + r.op + (r.message ? ' — ' + r.message : '');
            log.appendChild(line);
          });
          const successCount = results.filter((r) => r.ok).length;
          const tail = document.createElement('div');
          tail.style.cssText = 'align-self:flex-start;font-size:11px;color:#475569;margin-top:2px;';
          tail.textContent = successCount === results.length
            ? 'Hoàn tất — nhớ bấm Save để lưu form.'
            : (successCount + '/' + results.length + ' thành công. Xem chi tiết bên trên.');
          log.appendChild(tail);
          log.scrollTop = log.scrollHeight;
        }
      });
      return b;
    };
    btnRow.appendChild(makeBtn('A · Giữ nguyên thiết kế (an toàn)', '#fb923c', '#ffffff', 'preserve'));
    btnRow.appendChild(makeBtn('B · Cho phép thay đổi thiết kế', '#fff', '#9a3412', 'change'));
    bubble.appendChild(btnRow);

    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:6px;font-size:11px;color:#7c2d12;opacity:0.8;';
    hint.textContent = 'Hoặc gõ "A" / "B" trong ô chat.';
    bubble.appendChild(hint);

    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  } catch { /* DOM not ready or chat log missing — silent fallback */ }
}

export function dispatchOps(ops: Op[]): OpResult[] {
  __askBubbleBatchToken++;  // new batch ⇒ allow one bubble render this round
  __lastRejectedBatch = [];  // reset; gate will refill if it rejects anything
  const out: OpResult[] = [];
  if (!Array.isArray(ops)) return out;
  ops = ops.map(scrubPreserveDesign);  // [v20260530-26] strip destructive design fields when user chose PRESERVE
  // [AskDesignGateAbortBatch v20260601-B13] When the gate fires for the FIRST
  // op in a batch, the dispatcher used to keep iterating — every remaining op
  // ran the gate too and emitted an identical ASK-DESIGN reject. AI saw 6
  // copies of the same error and got confused. Abort the batch on first gate
  // fire; subsequent ops get a soft "batch-aborted" result that's NOT a real
  // reject the AI should react to.
  let batchAbortedByGate = false;
  ops.forEach((op) => {
    if (batchAbortedByGate) {
      __lastRejectedBatch.push(op);  // queue for auto-replay on A/B click
      const r: OpResult = { op: op.op, ok: false, message: '[ASK-DESIGN] Batch paused — waiting for user A/B decision (see bubble above). This op will auto-replay after the choice. DO NOT re-emit it.' };
      out.push(r);
      return;
    }
    if (!op || !op.op) {
      const r: OpResult = { op: '(unknown)', ok: false, message: 'Missing op field' };
      out.push(r);
      reportFeedback(op, r);
      return;
    }
    const handler = HANDLERS[op.op];
    if (!handler) {
      const r: OpResult = { op: op.op, ok: false, message: 'Unknown op: ' + op.op };
      out.push(r);
      reportFeedback(op, r);
      return;
    }
    // ASK-DESIGN gate — runs before every handler.
    const askResult = checkDesignConfirmation(op);
    if (askResult) {
      out.push(askResult);
      __lastRejectedBatch.push(op);  // snapshot for A/B click auto-replay
      reportFeedback(op, askResult);
      // [AskDesignGateAbortBatch v20260601-B13] Flag the batch as aborted so
      // remaining ops short-circuit instead of re-firing the gate.
      batchAbortedByGate = true;
      return;
    }
    try {
      const r = handler(op);
      out.push(r);
      if (!r.ok) reportFeedback(op, r);
    } catch (e) {
      const r: OpResult = { op: op.op, ok: false, message: 'Op error: ' + (e as Error).message };
      out.push(r);
      reportFeedback(op, r);
    }
  });
  return out;
}

// Expose a session reset hook so the chat UI / user can clear the
// design decision (e.g. when starting a new prompt where context changes).
function resetDesignDecision(): void {
  const w = window as any;
  if (w.__mfai_session) {
    delete w.__mfai_session.designDecision;
    delete w.__mfai_session.lastBubbleBatchToken;
  }
}

/**
 * [v20260530-13] Fire-and-forget dispatcher feedback log. Every ok:false
 * result lands in MF_AI_KB_Feedback so admin can review + promote good
 * fix patterns into MF_AI_KB_Templates. Includes the original op JSON
 * (so the AI's exact attempt is preserved) and an inferred ruleId when
 * the rejection message cites one (e.g. "DL-001").
 */
function reportFeedback(op: any, result: OpResult): void {
  try {
    const ruleId = pickRuleId(result?.message);
    const widgetType = op && (op.type || op.widgetType) ? String(op.type || op.widgetType) : undefined;
    logFeedback({
      ruleId,
      widgetType,
      op: result?.op || (op && op.op),
      attemptedJson: JSON.stringify(op ?? null),
      rejectionMessage: result?.message,
      outcome: 'rejected',
    });
  } catch { /* never throw from dispatcher */ }
}

export function listOpSchemas(): Array<{ op: string; description: string; params: string }> {
  return [
    { op: 'add_field', description: 'Insert a new MegaForm field', params: '{type, key?, label, required?, placeholder?, helpText?, defaultValue?, validation?, options?, widgetProps?, insertAt?}' },
    { op: 'remove_field', description: 'Remove a field by key', params: '{key}' },
    { op: 'set_field_property', description: 'Set a property of an existing field (dot path)', params: '{key, path, value}' },
    { op: 'set_field_sql', description: 'Configure SQL widget settings on a field', params: '{key, masterQuery, mode?: "simple"|"multi", templates?: {header,detail,footer,pager,simple}, queryDependsOn?, pageSize?}' },
    { op: 'apply_dynlabel_preset', description: 'Apply a DynamicLabel widget preset by index or label match', params: '{key, presetIndex?, presetLabel?}' },
    { op: 'set_form_meta', description: 'Set form title/description/buttons OR mutate settings.customCss / customHtml / customScripts / theme / themeCssOverrides. PREFER customCssAppend over customCss when modifying a premium form so you do not need to re-send the existing 5-10KB stylesheet. customHtml replacement requires replaceCustomHtml:true (PRESERVE-002).', params: '{title?, description?, submitButtonText?, successMessage?, customCss?, customCssAppend?, customHtml?, customHtmlAppend?, replaceCustomHtml?, customScripts?, theme?, themeCssOverrides?}' },
    { op: 'set_html_text', description: 'Rebrand a HARDCODED heading / caption / step label inside a PREMIUM form\'s customHtml. Text-only swap: tag structure + customCss stay byte-identical (SHELL_HASH unchanged). Use this — NOT customHtml replacement — to change brand copy baked into the shell (hero title, step labels, section captions). find MUST be the exact current text; replace MUST be plain text (no tags).', params: '{find, replace}' },
    { op: 'reorder_fields', description: 'Reorder fields by an array of keys (unmentioned keys keep their order at the end)', params: '{keys: [string]}' },
    { op: 'save_form', description: 'Trigger the Save button', params: '{}' },
    { op: 'chat_message', description: 'Send a textual message back to the user (the AI uses this to explain its actions)', params: '{text}' },
    { op: 'replace_form_schema', description: 'Replace the entire form schema in one shot (use for big structural rewrites instead of dozens of small ops)', params: '{schema: {version, fields:[...], settings:{...}}}' },
    { op: 'set_field_image_unsplash', description: 'Set a real visible Unsplash image URL on a field (no API key needed, always renders). Pass `query` keywords; we generate the URL.', params: '{key, query, width?, height?, alt?, target?: "defaultValue"|"htmlContent"|"widgetProps.imageUrl"}' },
    { op: 'add_subform_from_table', description: 'Insert a Subform (DataGrid) bound to a SQL table on the DashboardDatabase. Columns auto-detected via /Subform/Columns. Set totalField + totalFormula="Sum(\"qty * price\")" for live totals.', params: '{tableName, parentKeyColumn?, totalField?, totalFormula?, label?}' },
    { op: 'add_field_from_column', description: 'Insert a single input field bound to a SQL column from a DashboardDatabase table. Type inferred from data type.', params: '{tableName, columnName, key?}' },
    // [v20260531-AppBatch] Multi-form + relational-DB-table creation in ONE turn.
    { op: 'execute_sql', description: 'Host-only. Run ONE additive SQL statement on DashboardDatabase. Server guard (SqlDdlGuard) enforces EXACTLY ONE statement and an additive allow-list: CREATE TABLE / CREATE INDEX / ALTER TABLE ... ADD / INSERT. DROP, DELETE, TRUNCATE, UPDATE, MERGE, multi-statement (";"-separated), GO batches and EXEC/xp_ are REJECTED. Use this for CREATE TABLE in the app_batch flow; pass {dryRun:true} to validate without persisting.', params: '{sql, connectionKey?, dryRun?}' },
    { op: 'create_form', description: 'Create a brand-new MegaForm without leaving the chat. Pass {title, fields, settings?, bindToTable?:{tableName, schemaName?, mapping?}}. When bindToTable is set the form auto-wires settings.databaseInsert so each submission INSERTs a row into the target table.', params: '{title, description?, fields:[...], settings?, bindToTable?:{tableName, schemaName?, mapping?}}' },
    { op: 'app_batch', description: 'Atomic multi-form + multi-table app creation. Pass {tables:[{ddl}], forms:[{title, fields, settings?, tableName?, schemaName?, mapping?}]}. Server runs every DDL then every create_form sequentially; chat summary lists created formIds. Use this for "create an app with forms for X, Y, Z + relational DB" prompts.', params: '{tables:[{ddl}], forms:[{title, fields, tableName?, bindToTable?, ...}]}' },
    { op: 'set_record_visibility', description: 'Turn the CURRENT form into an end-user PORTAL with row-level security. mode "private-own" = every signed-in user sees ONLY the records they submitted (customer portal, support tickets, "my applications"); admins always see all; anonymous is blocked. mode "public" = anyone can browse (default). Use when the user says: "make this a customer portal", "each user/customer should only see their own", "mỗi khách chỉ thấy ticket/đơn của mình", "biến form này thành cổng khách hàng", "private submissions per user". After applying, the end-user page is /Modules/MegaForm/portal.html?formId=N (or mfpanel=portal).', params: '{mode: "private-own"|"public"}' },
  ];
}

export const opsBadge = OPS_BADGE;

// Expose for chat.ts and external callers.
(window as any).MFAI_Ops = { dispatchOps, listOpSchemas, resetDesignDecision, badge: OPS_BADGE };
