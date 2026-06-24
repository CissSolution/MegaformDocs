// Small DOM + formatting helpers for the My Inbox board (kept local so the module
// is a self-contained subproject). Mirrors the helper style used by SubmissionsShell.
import { t as i18nT } from '@i18n';

/** Translate with an English fallback (en-US value baked in → never blanks/breaks). */
export function T(key: string, fallback: string, params?: Record<string, string | number>): string {
  try {
    const out = i18nT(key, params);
    if (out && out !== key) return out;
  } catch { /* engine not ready */ }
  let raw = fallback;
  if (params) for (const p in params) raw = raw.replace(new RegExp('\\{' + p + '\\}', 'g'), String(params[p]));
  return raw;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function div(className?: string, text?: string): HTMLDivElement {
  return el('div', className, text);
}

export function span(className?: string, text?: string): HTMLSpanElement {
  return el('span', className, text);
}

export function btn(
  className: string,
  innerHtml: string,
  onClick?: (e: MouseEvent) => void,
): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.innerHTML = innerHtml;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function mk(parent: HTMLElement, ...children: (Node | null | undefined)[]): HTMLElement {
  children.forEach((c) => { if (c) parent.appendChild(c); });
  return parent;
}

export function escapeHtml(value: string): string {
  const d = document.createElement('div');
  d.textContent = value == null ? '' : String(value);
  return d.innerHTML;
}

// Escape a value for safe interpolation inside a double-quoted HTML attribute.
export function escapeAttr(value: string): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Field-value typing helpers (My Inbox detail render) ──────────────────────
// A submission field's stored VALUE can be rich HTML (article body), an inline
// image (data: URI or image URL), or a plain link — not just text. These detect
// the kind so the detail panel renders it properly instead of as escaped text.

export function isImageDataUri(value: string): boolean {
  return /^\s*data:image\//i.test(String(value || ''));
}

export function isImageUrl(value: string): boolean {
  const v = String(value || '').trim();
  if (isImageDataUri(v)) return true;
  // absolute or root-relative URL ending in a known image extension
  return /^(https?:\/\/|\/)[^\s'"]+\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?[^\s'"]*)?$/i.test(v);
}

export function isHttpUrl(value: string): boolean {
  return /^\s*https?:\/\/[^\s'"]+$/i.test(String(value || ''));
}

// Heuristic: does the value contain real HTML markup (an open tag plus a close
// or void/self-closing tag)? Tuned to avoid false positives on "a < b" / "5<10".
export function looksLikeHtml(value: string): boolean {
  const s = String(value || '');
  if (!/<[a-z][a-z0-9]*[\s>/]/i.test(s)) return false;
  return /<\/[a-z][a-z0-9]*>/i.test(s) || /<(br|hr|img)\b[^>]*\/?>/i.test(s);
}

// Tag/attribute whitelist sanitizer. Parses with DOMParser (no script execution,
// no resource loading) and rebuilds an allow-listed tree. Drops dangerous tags
// entirely, unwraps unknown tags (keeping their text), scrubs every attribute,
// and only keeps safe href/src URLs. Used to render rich-text field values.
const SANITIZE_ALLOWED = new Set([
  'P', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I',
  'U', 'S', 'SMALL', 'SUB', 'SUP', 'BLOCKQUOTE', 'Q', 'UL', 'OL', 'LI', 'DL',
  'DT', 'DD', 'A', 'IMG', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY',
  'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'CODE', 'PRE', 'SPAN', 'DIV', 'MARK',
]);
const SANITIZE_DROP = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'NOSCRIPT',
  'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'MATH',
  'HEAD', 'TITLE', 'BASE',
]);

function sanitizeUrl(url: string, allowDataImage: boolean): string | null {
  const v = String(url || '').trim();
  if (!v) return null;
  if (/^\s*(javascript|vbscript):/i.test(v)) return null;
  if (/^\s*data:/i.test(v)) return allowDataImage && /^\s*data:image\//i.test(v) ? v : null;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(v)) return v;
  if (/^[\w.\-]/.test(v) && !/^[a-z][a-z0-9+.\-]*:/i.test(v)) return v; // relative path
  return null;
}

function sanitizeInto(src: Node, dest: Node, doc: Document): void {
  src.childNodes.forEach((child) => {
    if (child.nodeType === 3) { // text
      dest.appendChild(doc.createTextNode(child.textContent || ''));
      return;
    }
    if (child.nodeType !== 1) return; // skip comments etc.
    const elc = child as Element;
    const tag = elc.tagName.toUpperCase();
    if (SANITIZE_DROP.has(tag)) return; // strip entirely (with content)
    if (!SANITIZE_ALLOWED.has(tag)) { sanitizeInto(elc, dest, doc); return; } // unwrap
    const clean = doc.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = sanitizeUrl(elc.getAttribute('href') || '', false);
      if (href) { clean.setAttribute('href', href); clean.setAttribute('target', '_blank'); clean.setAttribute('rel', 'noopener noreferrer'); }
    } else if (tag === 'IMG') {
      const s = sanitizeUrl(elc.getAttribute('src') || '', true);
      if (!s) return; // drop image with unsafe src
      clean.setAttribute('src', s);
      clean.setAttribute('loading', 'lazy');
    }
    const alt = elc.getAttribute('alt'); if (alt) clean.setAttribute('alt', alt);
    const title = elc.getAttribute('title'); if (title) clean.setAttribute('title', title);
    if (tag === 'TD' || tag === 'TH') {
      const cs = elc.getAttribute('colspan'); if (cs && /^\d+$/.test(cs)) clean.setAttribute('colspan', cs);
      const rs = elc.getAttribute('rowspan'); if (rs && /^\d+$/.test(rs)) clean.setAttribute('rowspan', rs);
    }
    dest.appendChild(clean);
    sanitizeInto(elc, clean, doc);
  });
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    const out = doc.createElement('div');
    sanitizeInto(doc.body, out, doc);
    return out.innerHTML;
  } catch {
    return escapeHtml(html);
  }
}

// ── Lucide-style inline icons (16px default, stroke=currentColor) ─────────────
const ICONS: Record<string, string> = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  forward: '<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  // ── New icons for 3-pane inbox ──
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  starOff: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/><line x1="2" x2="22" y1="2" y2="22"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  building: '<path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M12 6h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/><path d="M8 6h.01"/><path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><rect height="20" rx="2" ry="2" width="16" x="4" y="2"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect height="14" rx="2" width="20" x="2" y="4"/><polyline points="22,4 12,14 2,4"/>',
  thumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbsDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M15 9 6 4l9 5z"/>',
  workflow: '<rect height="8" rx="2" width="8" x="3" y="3"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect height="8" rx="2" width="8" x="13" y="13"/>',
  rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  stickyNote: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M16 3v5h5"/>',
  messageSquare: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  alertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  checkCheck: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  moreHorizontal: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  archive: '<rect height="20" rx="2" ry="2" width="20" x="2" y="4"/><path d="M12 12h.01"/><path d="M8 12h.01"/><path d="M16 12h.01"/>',
  trash2: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  tag: '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  briefcase: '<rect height="13" rx="2" ry="2" width="20" x="2" y="7"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  circleDot: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  cornerUpRight: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
};

export function ic(name: string, size = 16): string {
  const body = ICONS[name] || '';
  return `<svg class="mf-mi-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// ── Date / status formatting ────────────────────────────────────────────────
export function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return T('inbox.time_just_now', 'just now');
  if (mins < 60) return T('inbox.time_minutes_ago', '{n}m ago', { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return T('inbox.time_hours_ago', '{n}h ago', { n: hrs });
  const days = Math.round(hrs / 24);
  if (days < 30) return T('inbox.time_days_ago', '{n}d ago', { n: days });
  return d.toLocaleDateString();
}

export function dueLabel(iso?: string | null): { text: string; overdue: boolean } {
  if (!iso) return { text: '—', overdue: false };
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return { text: '—', overdue: false };
  const diff = t - Date.now();
  const days = Math.round(diff / 86400000);
  if (diff < 0) return { text: T('inbox.due_overdue', '{n}d overdue', { n: Math.abs(days) }), overdue: true };
  if (days === 0) return { text: T('inbox.due_today', 'Due today'), overdue: false };
  if (days === 1) return { text: T('inbox.due_tomorrow', 'Due tomorrow'), overdue: false };
  return { text: T('inbox.due_in_days', 'Due in {n}d', { n: days }), overdue: false };
}

// Map the workflow status / pending-status string to a friendly chip label.
export function statusChip(raw: string): { label: string; tone: string } {
  const s = (raw || '').toLowerCase();
  if (!s) return { label: T('inbox.status_pending', 'Pending'), tone: 'wait' };
  if (s.indexOf('approve') >= 0) return { label: prettyStatus(raw), tone: 'ok' };
  if (s.indexOf('reject') >= 0) return { label: prettyStatus(raw), tone: 'bad' };
  if (s.indexOf('complete') >= 0) return { label: prettyStatus(raw), tone: 'ok' };
  if (s.indexOf('wait') >= 0 || s.indexOf('pending') >= 0) return { label: prettyStatus(raw), tone: 'wait' };
  return { label: prettyStatus(raw), tone: 'neutral' };
}

export function prettyStatus(raw: string): string {
  if (!raw) return T('inbox.status_pending', 'Pending');
  return String(raw)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
