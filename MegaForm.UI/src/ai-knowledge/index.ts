/**
 * MegaForm AI Knowledge Base — Admin editor.
 *
 * Entry: window.MFAIKnowledge.open({ host? }) opens the editor as either:
 *   - a full overlay popup (default), or
 *   - mounted inside an existing host element (when opts.host is passed).
 *
 * Lets admins list / search / view / edit / create / delete entries in
 * MF_AI_Knowledge. Backed by /DesktopModules/MegaForm/API/AiKnowledge/{action}.
 *
 * Built-in seed entries (Source='megaform-builtin') are flagged readonly by
 * default; admin must click "Override" to fork into a customer-overridden
 * entry (preserves on MegaForm upgrade).
 *
 * Badge: MfAiKnowledge v20260528-20
 */

// [SecFix 2026-07-04 P1-12] The KB admin bundle does NOT import platform-host, so install the
// antiforgery injector directly here — otherwise KB Upsert/Delete/Seed writes 400 once the
// AiKnowledge* controllers drop class-level [IgnoreAntiforgeryToken].
import '../shared/antiforgery';

const BADGE = 'MfAiKnowledge v20260528-20';
(window as any).__MF_AI_KNOWLEDGE_BADGE__ = BADGE;

interface KbSummary {
  id: number;
  slug: string;
  kind: string;
  title: string;
  summary?: string;
  tags?: string[];
  source: string;
  version: number;
  updatedOnDate?: string;
}

interface KbEntry extends KbSummary {
  body?: string;
  examples?: string;
  portalId?: number | null;
}

function apiBase(): string {
  const platform = (window as any).__MF_PLATFORM__ || {};
  if (typeof platform.apiBase === 'string' && platform.apiBase) return platform.apiBase.replace(/\/+$/, '');
  return '/DesktopModules/MegaForm/API';
}

function headers(): Record<string, string> {
  const out: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' };
  const platform = (window as any).__MF_PLATFORM__ || {};
  const token = platform.requestVerificationToken
    || (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value;
  if (token) out['RequestVerificationToken'] = token;
  return out;
}

async function getJson(path: string): Promise<any> {
  const r = await fetch(apiBase() + '/AiKnowledge/' + path, { credentials: 'same-origin', headers: headers() });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function postJson(path: string, body: any): Promise<any> {
  const r = await fetch(apiBase() + '/AiKnowledge/' + path, {
    method: 'POST', credentials: 'same-origin', headers: headers(), body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return; stylesInjected = true;
  const css = `
.mfkb-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:100000;display:flex;align-items:stretch;justify-content:center;padding:24px;}
.mfkb-shell{background:#fff;width:100%;max-width:1280px;border-radius:14px;display:grid;grid-template-columns:340px 1fr;overflow:hidden;box-shadow:0 28px 72px rgba(15,23,42,.32);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a}
.mfkb-shell.is-inline{box-shadow:none;border:1px solid #e2e8f0;border-radius:10px;height:100%}
.mfkb-header{grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;}
.mfkb-header h2{margin:0;font-size:15px;font-weight:600}
.mfkb-header h2 small{margin-left:8px;font-weight:400;opacity:.75}
.mfkb-header .mfkb-actions{display:flex;gap:8px}
.mfkb-close{background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;padding:4px 10px;border-radius:6px}
.mfkb-close:hover{background:rgba(255,255,255,.18)}
.mfkb-sidebar{border-right:1px solid #e2e8f0;display:flex;flex-direction:column;min-height:0}
.mfkb-filters{padding:12px;border-bottom:1px solid #e2e8f0;display:flex;flex-direction:column;gap:8px;background:#f8fafc}
.mfkb-filters input,.mfkb-filters select{padding:7px 10px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;background:#fff;width:100%}
.mfkb-filters .mfkb-row{display:flex;gap:6px}
.mfkb-filters .mfkb-btn{flex:1}
.mfkb-list{flex:1;overflow:auto;padding:6px}
.mfkb-item{padding:9px 12px;border-radius:8px;margin-bottom:4px;cursor:pointer;border:1px solid transparent;transition:all .12s}
.mfkb-item:hover{background:#f1f5f9}
.mfkb-item.is-selected{background:#eef2ff;border-color:#c7d2fe}
.mfkb-item-title{font-weight:600;font-size:13px;color:#0f172a;margin-bottom:2px;display:flex;align-items:center;gap:6px}
.mfkb-item-meta{font-size:11px;color:#64748b}
.mfkb-kind-pill{display:inline-block;font-size:10px;padding:1px 6px;border-radius:999px;background:#e2e8f0;color:#475569;text-transform:uppercase;letter-spacing:.04em;margin-right:6px}
.mfkb-source-pill{display:inline-block;font-size:9px;padding:1px 5px;border-radius:999px;letter-spacing:.05em;text-transform:uppercase}
.mfkb-source-builtin{background:#fef3c7;color:#92400e}
.mfkb-source-customer{background:#dcfce7;color:#166534}
.mfkb-source-overridden{background:#fce7f3;color:#9d174d}
.mfkb-detail{display:flex;flex-direction:column;min-height:0}
.mfkb-detail-empty{padding:40px;text-align:center;color:#94a3b8}
.mfkb-detail-head{padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;background:#fafbfc}
.mfkb-detail-head h3{margin:0;font-size:15px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mfkb-detail-body{flex:1;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.mfkb-field{display:flex;flex-direction:column;gap:4px}
.mfkb-field label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:600}
.mfkb-field input,.mfkb-field textarea,.mfkb-field select{padding:7px 10px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;background:#fff;color:#0f172a;width:100%}
.mfkb-field textarea{font-family:Menlo,Consolas,monospace;font-size:12px;resize:vertical;min-height:72px}
.mfkb-field .mfkb-help{font-size:11px;color:#94a3b8;margin-top:2px}
.mfkb-detail-foot{padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;background:#fafbfc}
.mfkb-status{flex:1;font-size:12px;color:#64748b}
.mfkb-status.is-ok{color:#15803d}
.mfkb-status.is-error{color:#b91c1c}
.mfkb-btn{padding:7px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;font:inherit;cursor:pointer;font-size:12px;color:#334155}
.mfkb-btn:hover{border-color:#94a3b8}
.mfkb-btn.is-primary{background:#4f46e5;border-color:#4f46e5;color:#fff}
.mfkb-btn.is-primary:hover{background:#4338ca}
.mfkb-btn.is-danger{color:#b91c1c}
.mfkb-btn.is-danger:hover{border-color:#fca5a5}
.mfkb-btn[disabled]{opacity:.5;cursor:not-allowed}
`;
  document.head.appendChild(Object.assign(document.createElement('style'), { id: 'mf-ai-knowledge-styles', textContent: css }));
}

// ───────────────────────────────────────────────────────────────────────
//  Main entry
// ───────────────────────────────────────────────────────────────────────

export interface OpenOpts {
  host?: HTMLElement;
}

export function open(opts: OpenOpts = {}): void {
  injectStyles();
  const host = opts.host || createOverlay();
  const inline = !!opts.host;
  const shell = document.createElement('div');
  shell.className = 'mfkb-shell' + (inline ? ' is-inline' : '');
  host.appendChild(shell);

  let kinds: string[] = [];
  let entries: KbSummary[] = [];
  let filteredKind = '';
  let filteredSearch = '';
  let selected: KbEntry | null = null;
  let dirty = false;

  // ── Header ───────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'mfkb-header';
  header.innerHTML = `
    <h2>AI Knowledge Base <small>${BADGE}</small></h2>
    <div class="mfkb-actions">
      <button type="button" class="mfkb-btn" data-act="new">+ New entry</button>
      ${inline ? '' : '<button type="button" class="mfkb-close" data-act="close" title="Close (Esc)">×</button>'}
    </div>
  `;
  shell.appendChild(header);

  // ── Sidebar ──────────────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.className = 'mfkb-sidebar';
  sidebar.innerHTML = `
    <div class="mfkb-filters">
      <input type="search" class="mfkb-search" placeholder="Search slug/title/tag…" />
      <select class="mfkb-kind"></select>
    </div>
    <div class="mfkb-list"></div>
  `;
  shell.appendChild(sidebar);

  // ── Detail ───────────────────────────────────────────────────────
  const detail = document.createElement('div');
  detail.className = 'mfkb-detail';
  shell.appendChild(detail);

  const searchInput = sidebar.querySelector('.mfkb-search') as HTMLInputElement;
  const kindSelect  = sidebar.querySelector('.mfkb-kind') as HTMLSelectElement;
  const listBody    = sidebar.querySelector('.mfkb-list') as HTMLElement;

  searchInput.addEventListener('input', () => { filteredSearch = searchInput.value; reloadList(); });
  kindSelect .addEventListener('change', () => { filteredKind = kindSelect.value;  reloadList(); });
  header.querySelector('[data-act="new"]')?.addEventListener('click', () => { selected = newEntry(); renderDetail(); });
  if (!inline) {
    header.querySelector('[data-act="close"]')?.addEventListener('click', closeOverlay);
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', escHandler);
    (host as any).__mfkbEscHandler = escHandler;
  }

  void boot();

  async function boot(): Promise<void> {
    try {
      const kindsResp = await getJson('Kinds');
      kinds = Array.isArray(kindsResp) ? kindsResp : (kindsResp.kinds || []);
      kindSelect.innerHTML = `<option value="">All kinds</option>` + kinds.map(k => `<option>${escHtml(k)}</option>`).join('');
      await reloadList();
    } catch (e) {
      listBody.innerHTML = `<div style="padding:18px;color:#b91c1c;">Load failed: ${escHtml((e as Error).message)}</div>`;
    }
  }

  async function reloadList(): Promise<void> {
    try {
      const params = new URLSearchParams();
      if (filteredKind)   params.set('kind', filteredKind);
      if (filteredSearch) params.set('search', filteredSearch);
      const list = await getJson('List' + (params.toString() ? '?' + params.toString() : ''));
      entries = Array.isArray(list) ? list : [];
      renderList();
    } catch (e) {
      listBody.innerHTML = `<div style="padding:18px;color:#b91c1c;">Load failed: ${escHtml((e as Error).message)}</div>`;
    }
  }

  function renderList(): void {
    listBody.innerHTML = '';
    if (!entries.length) {
      listBody.innerHTML = `<div style="padding:18px;color:#94a3b8;text-align:center;">No entries match.</div>`;
      return;
    }
    entries.forEach((e) => {
      const item = document.createElement('div');
      item.className = 'mfkb-item' + (selected && selected.id === e.id ? ' is-selected' : '');
      const sourceCls = e.source === 'megaform-builtin' ? 'mfkb-source-builtin'
                       : e.source === 'customer-overridden' ? 'mfkb-source-overridden'
                       : 'mfkb-source-customer';
      item.innerHTML = `
        <div class="mfkb-item-title">
          ${escHtml(e.title || e.slug)}
          <span class="mfkb-source-pill ${sourceCls}">${escHtml(e.source || 'customer')}</span>
        </div>
        <div class="mfkb-item-meta">
          <span class="mfkb-kind-pill">${escHtml(e.kind || '')}</span>
          ${escHtml(e.slug)} · v${e.version}
        </div>
      `;
      item.addEventListener('click', async () => { await loadEntry(e.slug); });
      listBody.appendChild(item);
    });
  }

  async function loadEntry(slug: string): Promise<void> {
    if (dirty && !confirm('You have unsaved changes. Discard?')) return;
    try {
      const full = await getJson('Get?slug=' + encodeURIComponent(slug));
      selected = full as KbEntry;
      dirty = false;
      renderList();
      renderDetail();
    } catch (e) {
      renderError('Load failed: ' + (e as Error).message);
    }
  }

  function newEntry(): KbEntry {
    return {
      id: 0, slug: '', kind: kinds[0] || 'system_arch', title: '', summary: '', body: '', tags: [],
      examples: '', portalId: null, source: 'customer', version: 1,
    };
  }

  // ── Detail rendering ─────────────────────────────────────────────
  function renderDetail(): void {
    detail.innerHTML = '';
    if (!selected) {
      const empty = document.createElement('div'); empty.className = 'mfkb-detail-empty';
      empty.textContent = 'Select an entry on the left, or click "+ New entry" to create one.';
      detail.appendChild(empty); return;
    }
    const isBuiltin = selected.source === 'megaform-builtin' && selected.id !== 0;
    const head = document.createElement('div');
    head.className = 'mfkb-detail-head';
    head.innerHTML = `
      <h3>${escHtml(selected.title || selected.slug || '(new entry)')}</h3>
      ${isBuiltin ? '<span class="mfkb-source-pill mfkb-source-builtin">Built-in (read-only)</span>' : ''}
    `;
    detail.appendChild(head);

    const body = document.createElement('div');
    body.className = 'mfkb-detail-body';
    body.innerHTML = `
      <div class="mfkb-field">
        <label>Slug</label>
        <input data-fld="slug" type="text" value="${escAttr(selected.slug || '')}" ${selected.id ? 'readonly' : ''} />
        <span class="mfkb-help">Unique identifier, lowercase-with-dashes. Locked once saved.</span>
      </div>
      <div class="mfkb-field"><label>Kind</label>
        <select data-fld="kind">${kinds.map(k => `<option ${k === selected!.kind ? 'selected' : ''}>${escHtml(k)}</option>`).join('')}</select>
      </div>
      <div class="mfkb-field"><label>Title</label>
        <input data-fld="title" type="text" value="${escAttr(selected.title || '')}" />
      </div>
      <div class="mfkb-field"><label>Summary (~1 line, shown when AI lists entries)</label>
        <input data-fld="summary" type="text" value="${escAttr(selected.summary || '')}" />
      </div>
      <div class="mfkb-field"><label>Body (markdown / JSON, fetched only when AI calls get_knowledge)</label>
        <textarea data-fld="body" rows="10">${escHtml(selected.body || '')}</textarea>
      </div>
      <div class="mfkb-field"><label>Tags (comma-separated)</label>
        <input data-fld="tags" type="text" value="${escAttr((selected.tags || []).join(','))}" />
      </div>
      <div class="mfkb-field"><label>Examples (JSON, optional)</label>
        <textarea data-fld="examples" rows="4">${escHtml(selected.examples || '')}</textarea>
      </div>
    `;
    detail.appendChild(body);

    body.querySelectorAll('[data-fld]').forEach((el) => {
      el.addEventListener('input', () => { dirty = true; updateStatus('Unsaved changes', ''); });
    });
    if (isBuiltin) {
      body.querySelectorAll('input,textarea,select').forEach((el) => el.setAttribute('disabled', ''));
    }

    const foot = document.createElement('div');
    foot.className = 'mfkb-detail-foot';
    foot.innerHTML = `
      <span class="mfkb-status"></span>
      ${selected.id && !isBuiltin ? '<button type="button" class="mfkb-btn is-danger" data-act="delete">Delete</button>' : ''}
      ${isBuiltin ? '<button type="button" class="mfkb-btn" data-act="override">Override (customer copy)</button>' : ''}
      <button type="button" class="mfkb-btn is-primary" data-act="save" ${isBuiltin ? 'disabled' : ''}>Save</button>
    `;
    detail.appendChild(foot);
    foot.querySelector('[data-act="save"]')?.addEventListener('click', save);
    foot.querySelector('[data-act="delete"]')?.addEventListener('click', remove);
    foot.querySelector('[data-act="override"]')?.addEventListener('click', () => {
      if (!selected) return;
      selected.source = 'customer-overridden';
      dirty = true;
      renderDetail();
      updateStatus('Now editable — click Save to persist your override.', '');
    });
  }

  function readDetailFields(): KbEntry | null {
    if (!selected) return null;
    const get = (name: string): string => (detail.querySelector(`[data-fld="${name}"]`) as HTMLInputElement | null)?.value || '';
    const tagsRaw = get('tags').split(',').map(s => s.trim()).filter(Boolean);
    return {
      ...selected,
      slug: selected.id ? selected.slug : get('slug'),
      kind: get('kind'),
      title: get('title'),
      summary: get('summary'),
      body: get('body'),
      tags: tagsRaw,
      examples: get('examples'),
    };
  }

  async function save(): Promise<void> {
    const next = readDetailFields(); if (!next) return;
    if (!next.slug.trim()) { updateStatus('Slug is required.', 'error'); return; }
    try {
      updateStatus('Saving…', '');
      const saved = await postJson('Upsert', next);
      selected = saved;
      dirty = false;
      updateStatus('Saved · v' + saved.version, 'ok');
      await reloadList();
      renderDetail();
    } catch (e) {
      updateStatus('Save failed: ' + (e as Error).message, 'error');
    }
  }

  async function remove(): Promise<void> {
    if (!selected || !selected.id) return;
    if (!confirm('Delete "' + (selected.title || selected.slug) + '"?')) return;
    try {
      await postJson('Delete?id=' + selected.id, {});
      updateStatus('Deleted.', 'ok');
      selected = null; dirty = false;
      await reloadList();
      renderDetail();
    } catch (e) {
      updateStatus('Delete failed: ' + (e as Error).message, 'error');
    }
  }

  function updateStatus(msg: string, kind: 'ok' | 'error' | ''): void {
    const el = detail.querySelector('.mfkb-status') as HTMLElement | null;
    if (!el) return;
    el.textContent = msg;
    el.className = 'mfkb-status' + (kind === 'ok' ? ' is-ok' : kind === 'error' ? ' is-error' : '');
  }

  function renderError(msg: string): void {
    detail.innerHTML = `<div class="mfkb-detail-empty" style="color:#b91c1c;">${escHtml(msg)}</div>`;
  }

  function createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'mfkb-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeOverlay(): void {
    if (inline) return;
    if (dirty && !confirm('Discard unsaved changes?')) return;
    const escHandler = (host as any).__mfkbEscHandler;
    if (escHandler) document.removeEventListener('keydown', escHandler);
    host.remove();
  }

  renderDetail();
}

function escHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function escAttr(s: any): string { return escHtml(s); }

(function bootstrap() {
  (window as any).MFAIKnowledge = { open, badge: BADGE };
})();

export const badge = BADGE;
