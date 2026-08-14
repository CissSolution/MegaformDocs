// My Inbox — detail enrichment (Phase 1, 2026-06-11)
// Turns the rich submission-detail + task-detail API payloads into the mock's
// presentation shape (fields grid / attachments / timeline / submitter contact).
// Pure mappers — no DOM, no network. The backend already returns everything via
// GET /Submissions/{id} (fieldSnapshots, files, transparency.returnCount) and
// GET /Workflow/Tasks/Get?taskId= (actions → history). No backend change needed.
import type { SubmissionDetailInfo, SubmissionFieldSnapshot } from '@core/types';
import type { WorkflowInboxTaskAction } from '../workflow-inbox/types';
import type { InboxField, InboxAttachment, InboxHistoryItem } from './types';
import { actionTypeToHistoryType, parseServerDate } from './types';

export interface EnrichedDetail {
  fields: InboxField[];
  attachments: InboxAttachment[];
  history: InboxHistoryItem[];
  submitter?: string;
  submitterEmail?: string;
  submitterPhone?: string;
  submitterDept?: string;
  tags?: string[];
  hasAttachment: boolean;
  returnCount: number;
}

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) { if (o && o[k] != null && o[k] !== '') return o[k]; }
  return undefined;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return ''; }
}

// Human-readable file size matching the mock ("1.2 MB", "320 KB").
export function humanSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1).replace(/\.0$/, '') : Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
  return (m ? m[1] : 'file').toUpperCase();
}

// Heuristic field typing for the 2-col grid (amount→bold green, long→full-width).
export function inferFieldType(label: string, value: string, snapType?: string): InboxField['type'] {
  const l = (label || '').toLowerCase();
  const v = (value || '').trim();
  const st = (snapType || '').toLowerCase();
  if (/amount|total|price|cost|budget|salary|fee|subtotal|grand/.test(l)
      || /^[$€£¥]\s?[\d,]+(\.\d+)?$/.test(v)
      || /^[\d,]+(\.\d+)?\s?(usd|vnd|eur|gbp)$/i.test(v)) return 'amount';
  if (st.includes('date')
      || /(^|_)(date|from|to|due|by|when|deadline|start|end)(_|$)/.test(l)
      || (v.length <= 24 && /\d{4}|\d{1,2}[\/\-]\d{1,2}/.test(v) && !Number.isNaN(Date.parse(v)))) return 'date';
  if (v.length > 60
      || st.includes('textarea') || st.includes('long') || st.includes('paragraph')
      || /reason|justification|note|description|comment|plan|detail|address|message|summary/.test(l)) return 'long';
  return 'text';
}

// Skip snapshots that are not real "answers" (file uploads → attachments; layout/
// presentational widgets carry no value).
// [DetailShowsEveryAnswer v20260726] The submission detail must mirror the FORM, not just the
// non-empty answers. Two filters used to eat real fields:
//   • `signature` / `image` were type-skipped even though the renderer has an <img> branch for
//     exactly those — a signed form showed no signature (owner report).
//   • any blank answer disappeared, so an optional field left empty looked like it was never on
//     the form (EuroYouth: Year of birth / Language level / Motivation all vanished).
// The server already builds one snapshot per schema field (MegaFormUtils.BuildSubmissionSnapshots
// skips only Html/Section/Captcha), so keeping everything here is what makes the panel complete.
// Layout-only types stay out — they carry no answer — and file/upload stay out because they have
// their own Attachments block below the grid (rendering them twice was never the intent).
const LAYOUT_ONLY_FIELD = /^(html|htmlblock|heading|divider|section|spacer|paragraph_static|captcha|pagebreak)$/;
const ATTACHMENT_FIELD = /^(file|fileupload|upload|files)$/;

function isSkippableField(snapType: string, value: string): boolean {
  const st = (snapType || '').toLowerCase();
  if (LAYOUT_ONLY_FIELD.test(st)) return true;
  if (ATTACHMENT_FIELD.test(st)) return true;
  // An unknown/blank type with no value is junk (legacy rows), not an unanswered field.
  if (!st && !value.trim()) return true;
  return false;
}

export function mapFields(detail: SubmissionDetailInfo): InboxField[] {
  const snaps: SubmissionFieldSnapshot[] = Array.isArray(detail.fieldSnapshots) ? detail.fieldSnapshots : [];
  const out: InboxField[] = [];
  // [Dedup 2026-07-12] Snapshots can repeat a field (composite widgets emit the
  // combined value alongside parts; legacy double-writes) — without dedup the
  // Details pane rendered those answers twice.
  const seen = new Set<string>();
  for (const s of snaps) {
    const label = (s.label || s.key || '').trim();
    const rawValue = str(s.value);
    const display = (s.displayValue != null && s.displayValue !== '') ? String(s.displayValue) : '';
    // [DetailShowsEveryAnswer v20260726] Signature/Image DisplayValue is a DELIBERATE placeholder
    // ("[signature]", see MegaFormUtils.ToDisplayString) so CSV / e-mail / summary columns never
    // carry a base64 blob. The detail panel wants the real pixels — take the RAW value for those,
    // otherwise <img src="[signature]"> renders as a broken image.
    const snapType = String(s.type || '').toLowerCase();
    const wantsRawPixels = /^(signature|image)$/.test(snapType) && /^(data:|https?:)/i.test(rawValue);
    // [GridRowsInDetail v20260726] Same deal for line-item grids: DescribeGridValue (Core) returns
    // just "3 rows" so lists/CSV/e-mail stay short. The detail panel is the one place that must show
    // WHAT the rows were, and the raw value is the JSON array the grid submitted.
    const wantsRawRows = /^(datagrid|gridrepeater|datarepeater)$/.test(snapType) && /^\s*\[/.test(rawValue);
    const value = (wantsRawPixels || wantsRawRows) ? rawValue : (display || rawValue);
    if (!label) continue;
    if (isSkippableField(String(s.type || ''), value)) continue;
    const dedupKey = String(s.key || label).trim().toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const ftype = String(s.type || '').toLowerCase();
    out.push({ label, value, type: inferFieldType(label, value, ftype), fieldType: ftype });
  }
  // Fallback: if no snapshots, flatten the raw values map.
  if (!out.length && detail.values && typeof detail.values === 'object') {
    for (const [k, raw] of Object.entries(detail.values)) {
      const value = str(raw);
      if (!value.trim()) continue;
      out.push({ label: k, value, type: inferFieldType(k, value), fieldType: '' });
    }
  }
  return out;
}

export function mapAttachments(detail: SubmissionDetailInfo, downloadBase: string): InboxAttachment[] {
  const files = Array.isArray(detail.files) ? detail.files : [];
  return files.map((raw) => {
    const f = raw as Record<string, unknown>;
    const name = str(pick(f, 'originalName', 'OriginalName', 'fileName', 'FileName', 'name', 'Name')) || 'file';
    const bytes = Number(pick(f, 'fileSizeBytes', 'FileSizeBytes', 'size', 'Size') || 0);
    const path = str(pick(f, 'storedPath', 'StoredPath', 'path', 'Path'));
    const base = String(downloadBase || '').replace(/\/+$/, '');
    return {
      name,
      size: humanSize(bytes),
      type: fileExt(name),
      url: path ? `${base}/Files/Download?path=${encodeURIComponent(path)}` : undefined,
    };
  });
}

const ACTION_VERB: Record<number, string> = {
  1: 'Submitted', 2: 'Claimed', 3: 'Approved', 4: 'Rejected', 5: 'Forwarded', 6: 'Commented',
};

function fmtStamp(iso: string): string {
  if (!iso) return '—';
  const d = parseServerDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toLocaleDateString();
  }
}

export function mapHistory(actions: WorkflowInboxTaskAction[]): InboxHistoryItem[] {
  const list = Array.isArray(actions) ? actions : [];
  return list
    .slice()
    .sort((a, b) => (a.createdAt ? parseServerDate(a.createdAt).getTime() : 0) - (b.createdAt ? parseServerDate(b.createdAt).getTime() : 0))
    .map((h, i) => {
      const verb = ACTION_VERB[h.actionType] || 'Action';
      const action = h.outcome ? `${verb} (${h.outcome})` : verb;
      return {
        id: h.actionId || `h-${i}`,
        action,
        actor: h.actorDisplayName || h.actorUserName || 'System',
        timestamp: fmtStamp(h.createdAt),
        note: (h.comment && h.comment !== action) ? h.comment : undefined,
        type: actionTypeToHistoryType(h.actionType),
      };
    });
}

// Pull submitter contact info out of the form answers (no separate user lookup).
export function deriveSubmitterContact(detail: SubmissionDetailInfo): { name?: string; email?: string; phone?: string; dept?: string } {
  const snaps: SubmissionFieldSnapshot[] = Array.isArray(detail.fieldSnapshots) ? detail.fieldSnapshots : [];
  const out: { name?: string; email?: string; phone?: string; dept?: string } = {};
  for (const s of snaps) {
    const key = `${s.key || ''} ${s.label || ''}`.toLowerCase();
    const type = String(s.type || '').toLowerCase();
    const val = (s.displayValue != null && s.displayValue !== '') ? String(s.displayValue) : str(s.value);
    if (!val.trim()) continue;
    if (!out.email && (type === 'email' || /e-?mail/.test(key)) && /@/.test(val)) out.email = val;
    else if (!out.phone && (type === 'phone' || /phone|mobile|\btel\b|contact number/.test(key))) out.phone = val;
    else if (!out.dept && /depart|division|team|unit|office/.test(key)) out.dept = val;
    else if (!out.name && /(full ?name|submitter|your name|employee name|requested by|requestor)/.test(key)) out.name = val;
  }
  return out;
}

// Derive real tags from the submission's own answers (Category / Type / Tags /
// Department / Topic fields) — splitting multi-value cells. Falls back to the
// form-title keyword tags (set by adaptTask) when no such field exists.
export function deriveTagsFromFields(detail: SubmissionDetailInfo): string[] {
  const snaps: SubmissionFieldSnapshot[] = Array.isArray(detail.fieldSnapshots) ? detail.fieldSnapshots : [];
  const tags = new Set<string>();
  for (const s of snaps) {
    const key = `${s.key || ''} ${s.label || ''}`.toLowerCase();
    if (!/(^|[ _-])(category|categories|type|tag|tags|label|labels|department|dept|division|topic|priority)([ _-]|$)/.test(key)) continue;
    const val = (s.displayValue != null && s.displayValue !== '') ? String(s.displayValue) : str(s.value);
    val.split(/[,;/|]/).map((x) => x.trim()).filter(Boolean).forEach((x) => {
      const slug = x.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 24);
      if (slug) tags.add(slug);
    });
    if (tags.size >= 6) break;
  }
  return Array.from(tags).slice(0, 6);
}

export function buildEnrichedDetail(
  detail: SubmissionDetailInfo,
  actions: WorkflowInboxTaskAction[],
  downloadBase: string,
): EnrichedDetail {
  const fields = mapFields(detail);
  const attachments = mapAttachments(detail, downloadBase);
  const history = mapHistory(actions);
  const contact = deriveSubmitterContact(detail);
  const tags = deriveTagsFromFields(detail);
  const returnCount = Number(detail.workflowDetail?.transparency?.returnCount || 0);
  return {
    fields,
    attachments,
    history,
    submitter: contact.name,
    submitterEmail: contact.email,
    submitterPhone: contact.phone,
    submitterDept: contact.dept,
    tags: tags.length ? tags : undefined,
    hasAttachment: attachments.length > 0,
    returnCount: Number.isFinite(returnCount) ? returnCount : 0,
  };
}
