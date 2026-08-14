/**
 * MegaForm — Capability Card  [ATBE P0]
 *
 * Admin picks any table in a customer database → this shows what MegaForm can and
 * cannot do with it, and WHY, before a single field is designed.
 *
 * Everything shown here is a machine verdict from TableCapabilityProbe. Nothing on
 * this screen is an AI opinion, and nothing here can be talked out of: if the probe
 * says the key is untrusted, edit and delete stay off.
 *
 * Badge: CapabilityCard v20260711-P0
 */

// [i18n 2026-07-13] All user-facing strings go through wt(key, EnglishFallback) —
// English is the default, translations (incl. Vietnamese) live in the i18n catalog
// (RULE: no hard-coded Vietnamese defaults).
import { wt } from '../designer-i18n';

const BADGE = 'CapabilityCard v20260711-P0';

type Mode = 'readwrite' | 'insertonly' | 'readonly' | 'unsupported';

function modeLabel(mode: Mode): string {
  switch (mode) {
    case 'readwrite': return wt('atbe.mode_readwrite', 'Read + Write + Edit');
    case 'insertonly': return wt('atbe.mode_insertonly', 'Read + Submit only');
    case 'readonly': return wt('atbe.mode_readonly', 'Read only');
    default: return wt('atbe.mode_unsupported', 'Not usable');
  }
}

const MODE_COLOR: Record<Mode, string> = {
  readwrite: '#059669',
  insertonly: '#0284c7',
  readonly: '#b45309',
  unsupported: '#b91c1c',
};

const SEV_COLOR: Record<string, string> = { error: '#b91c1c', warning: '#b45309', info: '#475569' };

function esc(s: any): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
}

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

async function probe(connectionKey: string, schema: string, table: string): Promise<any> {
  const qs = 'connectionKey=' + encodeURIComponent(connectionKey)
    + '&schema=' + encodeURIComponent(schema || '')
    + '&table=' + encodeURIComponent(table);
  const r = await fetch(apiRoot() + 'Probe?' + qs, {
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.json();
}

/** Oqtane validates POSTs with its OWN antiforgery header name — the ASP.NET default
 *  (RequestVerificationToken) and the common X-XSRF-TOKEN are both rejected with a bare 400. */
function antiforgeryHeaders(): Record<string, string> {
  const input = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
  const token = input ? input.value : '';
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (token) {
    h['X-XSRF-TOKEN-HEADER'] = token;   // Oqtane
    h['RequestVerificationToken'] = token;   // DNN / Web
  }
  return h;
}

async function bind(connectionKey: string, schema: string, table: string): Promise<any> {
  const r = await fetch(apiRoot() + 'Bind?' + siteQs(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: antiforgeryHeaders(),
    body: JSON.stringify({ connectionKey, schema, table, formId: 0, timeColumnConfirmed: true }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body && (body.message || body.error)) || ('HTTP ' + r.status));
  return body;
}

function flag(on: boolean, label: string): string {
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;'
    + (on ? 'background:#dcfce7;color:#166534' : 'background:#f1f5f9;color:#94a3b8;text-decoration:line-through')
    + '">' + esc(label) + '</span>';
}

function columnsTable(cols: any[]): string {
  const rows = cols.map((c) => {
    const badges: string[] = [];
    if (c.isPrimaryKey) badges.push('PK');
    if (c.isIdentity) badges.push('identity');
    if (c.isComputed) badges.push('computed');
    if (c.isRowVersion) badges.push('rowversion');
    if (c.serverFill) badges.push('server: ' + c.serverFill);
    if (c.valueMode) badges.push(c.valueMode);
    if (c.unsupported) badges.push(wt('atbe.badge_unsupported', 'UNSUPPORTED'));

    return '<tr>'
      + '<td style="font-family:Consolas,monospace">' + esc(c.name) + '</td>'
      + '<td style="color:#64748b">' + esc(c.sqlType) + (c.maxLengthChars ? '(' + c.maxLengthChars + ')' : '') + '</td>'
      + '<td>' + esc(c.uiType) + '</td>'
      + '<td style="text-align:center">' + (c.required ? '<b style="color:#b91c1c">' + esc(wt('atbe.required', 'required')) + '</b>' : '—') + '</td>'
      + '<td style="text-align:center">' + (c.sortable ? '↕' : '') + (c.searchable ? ' 🔍' : '') + '</td>'
      + '<td style="font-size:11px;color:#64748b">' + esc(badges.join(' · ')) + '</td>'
      + '<td style="font-size:11px;color:#94a3b8">' + esc(c.machineNote || '') + '</td>'
      + '</tr>';
  }).join('');

  return '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="text-align:left;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.04em">'
    + '<th style="padding:4px 6px">' + esc(wt('atbe.th_column', 'Column')) + '</th><th>' + esc(wt('atbe.th_sqltype', 'SQL type')) + '</th><th>UI</th><th>' + esc(wt('atbe.th_input', 'Input')) + '</th><th>' + esc(wt('atbe.th_query', 'Query')) + '</th><th>' + esc(wt('atbe.th_traits', 'Traits')) + '</th><th>' + esc(wt('atbe.th_machine_note', 'Machine note')) + '</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function render(p: any): string {
  const caps = p.capabilities || {};
  const mode: Mode = (caps.mode || 'unsupported') as Mode;
  const size = p.size || {};
  const key = p.key || {};
  const sem = p.semantics || {};

  const reasons = (caps.reasons || []).map((r: any) =>
    '<li style="margin-bottom:8px">'
    + '<b style="color:' + (SEV_COLOR[r.severity] || '#475569') + '">' + esc(r.code) + '</b> — ' + esc(r.message)
    + (r.howToFix ? '<div style="font-size:11px;color:#64748b;margin-top:2px">→ ' + esc(r.howToFix) + '</div>' : '')
    + '</li>').join('');

  const keyLine = key.columns && key.columns.length
    ? key.columns.map((k: any) => k.name + ':' + k.sqlType).join(' + ')
      + ' (' + esc(key.strategy) + ', ' + esc(wt('atbe.key_via', 'key via')) + ' ' + esc(key.retrieval) + ')'
      + (key.trusted ? '' : ' — <b style="color:#b91c1c">' + esc(wt('atbe.key_untrusted', 'NOT trusted')) + '</b>')
    : '<b style="color:#b91c1c">' + esc(wt('atbe.key_none', 'no trusted key')) + '</b>';

  return ''
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
    + '  <span style="padding:6px 14px;border-radius:8px;font-weight:700;color:#fff;background:' + MODE_COLOR[mode] + '">' + esc(modeLabel(mode)) + '</span>'
    + '  <span style="font-family:Consolas,monospace;font-size:14px">' + esc((p.obj && p.obj.schema) || '') + '.' + esc((p.obj && p.obj.name) || '') + '</span>'
    + '  <span style="color:#64748b;font-size:12px">' + esc((p.obj && p.obj.type) || '') + ' · ≈' + Number(size.approxRows || 0).toLocaleString() + ' ' + esc(wt('atbe.rows', 'rows')) + ' (' + esc(size.bucket) + ')'
    + ' · metadata ' + esc((p.coverage && p.coverage.metadataLevel) || '') + '</span>'
    + '</div>'

    + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">'
    + flag(!!caps.canOpenDetail, wt('atbe.flag_detail', 'View detail')) + flag(!!caps.canInsert, wt('atbe.flag_insert', 'Submit new'))
    + flag(!!caps.canUpdate, wt('atbe.flag_update', 'Edit')) + flag(!!caps.canDelete, wt('atbe.flag_delete', 'Delete'))
    + flag(!!caps.canSort, wt('atbe.flag_sort', 'Sort')) + flag(!!caps.canFilterServer, wt('atbe.flag_filter', 'Server-side filter'))
    + flag(caps.canSearch && caps.canSearch !== 'off', wt('atbe.flag_search', 'Search') + ' (' + String(caps.canSearch) + ')')
    + flag(!!caps.canExport, wt('atbe.flag_export', 'Export'))
    + (caps.requiresFilterBeforeList ? '<span style="padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e">' + esc(wt('atbe.must_filter', 'Filter required before listing')) + '</span>' : '')
    + '</div>'

    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;margin-bottom:14px">'
    + '  <div><b>' + esc(wt('atbe.lbl_key', 'Key:')) + '</b> ' + keyLine + '</div>'
    + '  <div><b>' + esc(wt('atbe.lbl_concurrency', 'Concurrency:')) + '</b> ' + esc((p.concurrency && p.concurrency.mode) || '-') + ' ' + esc((p.concurrency && p.concurrency.rowVersionColumn) || '') + '</div>'
    + '  <div><b>' + esc(wt('atbe.lbl_time', 'Time column:')) + '</b> ' + (sem.time ? esc(sem.time.name) + (sem.time.confirmedByAdmin ? '' : ' <span style="color:#b45309">' + esc(wt('atbe.tz_pending', '(timezone needs confirmation)')) + '</span>') : '—') + '</div>'
    + '  <div><b>' + esc(wt('atbe.lbl_status', 'Status:')) + '</b> ' + (sem.status ? esc(sem.status.name) + ' (' + esc(sem.status.kind) + ')' : '—') + '</div>'
    + '  <div><b>' + esc(wt('atbe.lbl_softdelete', 'Soft delete:')) + '</b> ' + (sem.softDelete ? esc(sem.softDelete.column) : '—') + '</div>'
    + '  <div><b>' + esc(wt('atbe.lbl_owner', 'Row owner:')) + '</b> ' + (sem.owner ? esc(sem.owner.name) : '—') + '</div>'
    + '</div>'

    + (reasons ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:14px">'
        + '<div style="font-weight:700;font-size:12px;color:#92400e;margin-bottom:6px">' + esc(wt('atbe.machine_reasons', 'The machine concluded this because:')) + '</div>'
        + '<ul style="margin:0;padding-left:18px;font-size:12px;color:#78350f">' + reasons + '</ul></div>' : '')

    + '<div style="max-height:340px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px">' + columnsTable(p.columns || []) + '</div>'
    + '<div style="font-size:10px;color:#94a3b8;margin-top:8px;font-family:Consolas,monospace">' + esc(p.hash || '') + '</div>';
}

/** Opens the card for one table. Safe to call repeatedly; the previous card is replaced. */
export async function openCapabilityCard(connectionKey: string, schema: string, table: string): Promise<void> {
  document.getElementById('mf-cap-card')?.remove();

  const back = document.createElement('div');
  back.id = 'mf-cap-card';
  back.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:200002;display:flex;align-items:center;justify-content:center;padding:24px';
  back.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:1100px;width:100%;max-height:88vh;overflow:auto;padding:20px 24px;box-shadow:0 24px 60px rgba(0,0,0,.35)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<h3 style="margin:0;font-size:16px">' + esc(wt('atbe.card_title', 'Table capability')) + ' — <span style="font-family:Consolas,monospace">' + esc(schema || 'dbo') + '.' + esc(table) + '</span></h3>'
    + '<button type="button" data-close style="border:0;background:#f1f5f9;border-radius:6px;padding:6px 12px;cursor:pointer">' + esc(wt('atbe.close', 'Close')) + '</button>'
    + '</div><div data-body style="color:#64748b">' + esc(wt('atbe.probing', 'Probing capability…')) + '</div></div>';

  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  back.querySelector('[data-close]')!.addEventListener('click', () => back.remove());
  document.body.appendChild(back);

  const body = back.querySelector('[data-body]') as HTMLElement;
  try {
    const p = await probe(connectionKey, schema, table);
    body.innerHTML = render(p);
    (window as any).__MF_LAST_CAPABILITY_PROFILE__ = p;

    // Binding is offered only when the table is usable at all. A table the probe called
    // "unsupported" has no honest read path, so there is nothing to bind.
    if (p.capabilities && p.capabilities.mode !== 'unsupported') {
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;flex-wrap:wrap';
      bar.innerHTML = '<button type="button" data-bind style="background:#0f766e;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:600;cursor:pointer">' + esc(wt('atbe.bind_btn', 'Create form (machine-generated)')) + '</button>'
        + '<button type="button" data-ai style="background:#7c3aed;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:600;cursor:pointer">✨ ' + esc(wt('atbe.ai_btn', 'Design with AI')) + '</button>'
        + '<span style="font-size:11px;color:#64748b">' + esc(wt('atbe.direct_note', 'The dashboard reads your table DIRECTLY — no data is copied.')) + '</span>'
        + '<div data-bind-msg style="font-size:12px;flex-basis:100%"></div>';
      body.appendChild(bar);

      const btn = bar.querySelector('[data-bind]') as HTMLButtonElement;
      const aiBtn = bar.querySelector('[data-ai]') as HTMLButtonElement;
      const msg = bar.querySelector('[data-bind-msg]') as HTMLElement;

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        msg.textContent = wt('atbe.creating', 'Creating…');
        try {
          const res = await bind(connectionKey, schema, table);
          msg.innerHTML = '<b style="color:#059669">' + esc(wt('atbe.done', 'Done.')) + '</b> Form #' + esc(res.formId) + ' · ' + esc(res.fields)
            + ' ' + esc(wt('atbe.fields', 'fields')) + ' · ' + Number(res.approxRows || 0).toLocaleString() + ' ' + esc(wt('atbe.rows', 'rows'))
            + '. ' + esc(wt('atbe.open_subs', 'Open Submissions to view.'));
        } catch (e: any) {
          msg.innerHTML = '<span style="color:#b91c1c">' + esc(e.message || e) + '</span>';
          btn.disabled = false;
        }
      });

      aiBtn.addEventListener('click', async () => {
        const design = (window as any).__MF_DESIGN_TABLE_WITH_AI__;
        if (typeof design !== 'function') { msg.textContent = wt('atbe.ai_not_loaded', 'AI designer is not loaded.'); return; }
        aiBtn.disabled = true; btn.disabled = true;

        try {
          const res = await design(connectionKey, schema, table, (s: string) => { msg.textContent = s; });

          // The rejected attempts are shown, not swallowed: an admin who sees WHAT the machine
          // refused can judge whether to trust the result — and it is the proof the rails work.
          const rej = (res.rejections || []).map((list: string[], i: number) =>
            '<div style="margin-top:4px"><b>' + esc(wt('atbe.attempt_rejected', 'Attempt {n} rejected:').replace('{n}', String(i + 1))) + '</b><br>' + list.map(esc).join('<br>') + '</div>').join('');

          msg.innerHTML = (res.source === 'ai'
              ? '<b style="color:#059669">' + esc(wt('atbe.ai_done', 'AI design complete')) + '</b> ' + esc(wt('atbe.ai_after', 'after {n} attempt(s) — machine-validated.').replace('{n}', String(res.attempts)))
              : '<b style="color:#b45309">' + esc(wt('atbe.ai_fallback_title', 'Using the machine-generated version')) + '</b> — ' + esc(wt('atbe.ai_fallback_note', 'the AI did not pass the validator.')))
            + ' Form #' + esc(res.formId) + ' · ' + esc(res.fields) + ' ' + esc(wt('atbe.fields', 'fields')) + '.'
            + (res.questions && res.questions.length
                ? '<div style="margin-top:6px;color:#7c3aed"><b>' + esc(wt('atbe.ai_asks', 'The AI asks you:')) + '</b> ' + res.questions.map(esc).join(' · ') + '</div>' : '')
            + (rej ? '<div style="margin-top:6px;color:#64748b;font-size:11px">' + rej + '</div>' : '');
        } catch (e: any) {
          msg.innerHTML = '<span style="color:#b91c1c">' + esc(e.message || e) + '</span>';
        } finally {
          aiBtn.disabled = false; btn.disabled = false;
        }
      });
    }
  } catch (err: any) {
    body.innerHTML = '<div style="color:#b91c1c">' + esc(wt('atbe.probe_failed', 'Could not probe this table')) + ' (' + esc(err.message || err) + ').</div>';
  }
}

(function register() {
  if (typeof window === 'undefined') return;
  (window as any).__MF_CAPABILITY_CARD_BADGE__ = BADGE;
  (window as any).__MF_OPEN_CAPABILITY_CARD__ = openCapabilityCard;
})();
