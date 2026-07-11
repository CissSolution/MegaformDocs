/**
 * MegaForm Builder — Database Tables Tab
 *
 * Mounts INSIDE the Builder right-panel "DB" tab (#mf-tab-db / #mf-db-tables-body).
 * Lists all base tables on the DashboardDatabase via /Subform/Tables; expanding
 * a table fetches columns via /Subform/Columns and renders column chips.
 *
 * UX:
 *   - Click "+ DataGrid" on a table row → inserts a Subform widget (DataGrid)
 *     pre-configured with that table's columns (identity PKs skipped).
 *   - Click or drag a column chip → inserts a matching input field (text /
 *     number / date / checkbox) into the form schema, name = column name.
 *
 * Why not a floating FAB: the user explicitly wanted DB tools INSIDE the
 * builder. The right-panel tab is the canonical surface — same level as
 * FIELD / SETTINGS / HTML / AI / EMBED / RULES / ACCESS / BPMN / PRINT.
 *
 * Tables list is exposed on window.__MF_DB_TABLES__ so the AI Form Assistant
 * system prompt can list available tables.
 *
 * Badge: BuilderDbTablesTab v20260528-16
 */

import S from './db-tables-strings.json';

const BADGE = 'BuilderDbTablesTab v20260530-01';

interface DbTable { name: string; schema?: string; rowCount?: number; }
interface DbColumn { name: string; dataType: string; nullable: boolean; isPrimary?: boolean; isIdentity?: boolean; maxLength: number; uiType: string; }

(function init() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  (window as any).__MF_BUILDER_DBTABLES_BADGE__ = BADGE;

  function apiBase(): string {
    const w = window as any;
    if (typeof w.__MF_API_BASE__ === 'string' && w.__MF_API_BASE__) return w.__MF_API_BASE__;
    // [v20260601-B27] Honor Builder.razor's __MF_PLATFORM__.apiBase on
    // Oqtane (= '/api/MegaForm/'). Falling back to DNN /DesktopModules/...
    // makes db-tables-panel emit Subform/Tables 404s on Oqtane sites.
    const pf = w.__MF_PLATFORM__ || {};
    if (typeof pf.apiBase === 'string' && pf.apiBase) return String(pf.apiBase).replace(/\/?$/, '/');
    // [B51] Platform-aware fallback if AddHeadContent script hasn't fired yet
    const _platform = String(pf.platform || '').toLowerCase();
    if (_platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
      return '/api/MegaForm/';
    }
    return '/DesktopModules/MegaForm/API/';
  }
  function platform(): any { return (window as any).__MF_PLATFORM__ || {}; }
  function isOqtane(): boolean { return String(platform().platform || '').toLowerCase() === 'oqtane'; }
  function buildUrl(path: string, qs: Record<string, string> = {}): string {
    const pf = platform();
    // Oqtane uses Site context (no portalId param); DNN/Web need explicit portalId
    if (!isOqtane()) {
      const portalId = pf.portalId || 0;
      if (portalId && !('portalId' in qs)) qs.portalId = String(portalId);
    }
    const search = Object.entries(qs).filter(([, v]) => v != null && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&');
    // [v20260601-B27] Oqtane's SubformController is mounted at
    // /api/MegaFormPopup/Subform/* (not /api/MegaForm/Subform/*). Route any
    // "Subform/..." path to the popup root when on Oqtane.
    if (isOqtane() && /^Subform\//i.test(path)) {
      return '/api/MegaFormPopup/' + path + (search ? '?' + search : '');
    }
    return apiBase().replace(/\/?$/, '/') + path + (search ? '?' + search : '');
  }
  function antiForgery(): string {
    const inp = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
    return inp ? inp.value : '';
  }
  async function fetchJson(url: string): Promise<any> {
    const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
    const tok = antiForgery();
    if (tok) headers.RequestVerificationToken = tok;
    const r = await fetch(url, { credentials: 'same-origin', headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  }

  function injectStyles() {
    if (document.getElementById('mf-builder-dbtab-styles')) return;
    const css = `
#mf-db-tables-body .mf-bdb-search{padding:10px 12px 6px;border-bottom:1px solid #e2e8f0;background:#fff;position:sticky;top:0;z-index:2;display:flex;flex-direction:column;gap:6px}
#mf-db-tables-body .mf-bdb-search input{width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-family:inherit}
#mf-db-tables-body .mf-bdb-search input:focus{outline:2px solid #0ea5e9;outline-offset:-2px;border-color:#0ea5e9}
#mf-db-tables-body .mf-bdb-toggle{display:flex;align-items:center;gap:6px;font-size:11px;color:#64748b;cursor:pointer;user-select:none}
#mf-db-tables-body .mf-bdb-toggle input{width:auto;margin:0}
#mf-db-tables-body .mf-bdb-table-add-row{display:flex;gap:4px}
#mf-db-tables-body .mf-bdb-table-ai{padding:4px 9px;border-radius:6px;background:#7c3aed;color:#fff;border:0;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit}
#mf-db-tables-body .mf-bdb-table-ai:hover{background:#6d28d9}
#mf-db-tables-body .mf-bdb-table-ai:disabled{background:#cbd5e1;cursor:wait}
#mf-db-tables-selected{border-top:2px solid #c7d2fe;background:linear-gradient(180deg,#f5f3ff,#fff);padding:10px 14px 12px;flex-shrink:0;max-height:160px;overflow:auto}
#mf-db-tables-selected h4{margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6d28d9;font-weight:700}
#mf-db-tables-selected p.mfsel-hint{margin:0 0 8px;font-size:11px;color:#7c3aed;opacity:.7}
#mf-db-tables-selected .mfsel-empty{font-size:12px;color:#a78bfa;font-style:italic;padding:4px 0}
#mf-db-tables-selected .mfsel-list{display:flex;flex-wrap:wrap;gap:6px}
#mf-db-tables-selected .mfsel-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #c4b5fd;color:#5b21b6;font-size:12px;font-family:'Cascadia Code',Consolas,monospace}
#mf-db-tables-selected .mfsel-pill button{background:transparent;border:0;color:#a78bfa;cursor:pointer;padding:0;font-size:14px;line-height:1}
#mf-db-tables-selected .mfsel-pill button:hover{color:#dc2626}
#mf-db-tables-selected .mfsel-actions{display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px dashed #c4b5fd}
#mf-db-tables-selected .mfsel-btn-ai{flex:1;padding:7px 12px;background:#7c3aed;color:#fff;border:0;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
#mf-db-tables-selected .mfsel-btn-ai:hover:not([disabled]){background:#6d28d9}
#mf-db-tables-selected .mfsel-btn-ai[disabled]{background:#cbd5e1;cursor:not-allowed}
#mf-db-tables-selected .mfsel-btn-clear{padding:7px 14px;background:#fff;color:#7c3aed;border:1px solid #c4b5fd;border-radius:7px;font-size:12px;cursor:pointer;font-family:inherit}
#mf-db-tables-selected .mfsel-btn-clear:hover:not([disabled]){background:#f5f3ff;color:#5b21b6}
#mf-db-tables-selected .mfsel-btn-clear[disabled]{opacity:.5;cursor:not-allowed}
#mf-db-tables-body .mf-bdb-empty{padding:30px;text-align:center;color:#94a3b8;font-style:italic;font-size:12px}
#mf-db-tables-body .mf-bdb-err{padding:14px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;border-radius:8px;margin:10px 12px;font-size:12px;line-height:1.5}
#mf-db-tables-body .mf-bdb-table{border-bottom:1px solid #f1f5f9;font-size:13px}
#mf-db-tables-body .mf-bdb-table-head{padding:10px 14px;display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;cursor:pointer}
#mf-db-tables-body .mf-bdb-table-head:hover{background:#f8fafc}
#mf-db-tables-body .mf-bdb-table-schema{font-size:10px;color:#94a3b8;background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:'Cascadia Code',Consolas,monospace}
#mf-db-tables-body .mf-bdb-table-name{font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Cascadia Code',Consolas,monospace;font-size:12px}
#mf-db-tables-body .mf-bdb-table-add{padding:4px 10px;border-radius:6px;background:#0ea5e9;color:#fff;border:0;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit}
#mf-db-tables-body .mf-bdb-table-add:hover{background:#0284c7}
#mf-db-tables-body .mf-bdb-table-add:disabled{background:#cbd5e1;cursor:wait}
#mf-db-tables-body .mf-bdb-cols{padding:6px 14px 14px;display:none;flex-wrap:wrap;gap:5px;background:#fafbfd;border-top:1px solid #f1f5f9}
#mf-db-tables-body .mf-bdb-table.is-open .mf-bdb-cols{display:flex}
#mf-db-tables-body .mf-bdb-col{padding:4px 9px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;font-size:11px;color:#475569;cursor:grab;font-family:'Cascadia Code',Consolas,monospace;user-select:none;display:inline-flex;align-items:center;gap:4px;transition:all .12s}
#mf-db-tables-body .mf-bdb-col:hover{border-color:#0ea5e9;color:#0369a1;background:#f0f9ff;transform:translateY(-1px);box-shadow:0 2px 4px rgba(14,165,233,.15)}
#mf-db-tables-body .mf-bdb-col[data-pk="1"]{background:#fef3c7;border-color:#fcd34d;color:#92400e}
#mf-db-tables-body .mf-bdb-col-type{font-size:9px;color:#94a3b8;background:#f1f5f9;padding:1px 4px;border-radius:3px}
#mf-db-tables-body .mf-bdb-loading{padding:24px;text-align:center;color:#94a3b8;font-size:12px}
`;
    const s = document.createElement('style'); s.id = 'mf-builder-dbtab-styles'; s.textContent = css; document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Field-template builders
  // ─────────────────────────────────────────────────────────────────────
  function tableToDataGridProps(table: DbTable, cols: DbColumn[]): any {
    const filtered = cols.filter(c => !c.isIdentity);
    return {
      tableName:       table.name,
      parentKeyColumn: '',
      editMode:        filtered.length > 5 ? 'modal' : 'inline',
      allowAdd: true, allowDelete: true, stickyHeader: true,
      rowHeight: 'normal',
      emptyMessage: 'No ' + table.name + ' rows yet.',
      totalField: '', totalFormula: '',
      minRows: 0, maxRows: 0,
      columns: filtered.map(c => ({
        key:      c.name,
        label:    humanize(c.name),
        type:     c.uiType,
        required: !c.nullable,
        width:    c.uiType === 'number' || c.uiType === 'currency' ? '120px' : (c.uiType === 'date' ? '140px' : '1fr'),
        decimals: c.uiType === 'currency' ? 2 : (c.uiType === 'number' ? 0 : undefined),
        editor:   filtered.length > 5 ? 'modal' : 'inline',
      })),
    };
  }

  function columnToFieldTemplate(table: DbTable, col: DbColumn): any {
    const uiToType: Record<string, string> = {
      text: 'Text', number: 'Number', currency: 'Number', date: 'Date', checkbox: 'Checkbox'
    };
    return {
      type:  uiToType[col.uiType] || 'Text',
      label: humanize(col.name),
      name:  col.name,
      required: !col.nullable,
      placeholder: 'From ' + table.name + '.' + col.name,
      maxLength: col.maxLength > 0 ? col.maxLength : undefined,
    };
  }

  function humanize(snake: string): string {
    return String(snake || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Tab mount + state
  // ─────────────────────────────────────────────────────────────────────
  let tablesCache: DbTable[] | null = null;
  let columnsCache: Record<string, DbColumn[]> = {};
  let mounted = false;
  let showSystem = false;
  let selectedTables: string[] = [];

  // [v20260530-01] Persist the picked tables per form so the strip survives
  // reloads. Keyed by formId; loaded on mount, saved on every change.
  function currentFormId(): number {
    const B = (window as any).MegaFormBuilder;
    return (B && B.state && B.state.formId) || 0;
  }
  // [v20260530-27] New-form mode = formId 0 OR URL hash/query says "new".
  // For new forms we MUST NOT persist to localStorage under key
  // `mf-db-selected-tables:0` because every "create new form" session would
  // inherit the tables of the last new-form session that didn't get saved.
  function isNewFormMode(): boolean {
    if (currentFormId() <= 0) return true;
    try {
      const h = (location.hash || '').toLowerCase();
      if (h.indexOf('mf-builder-new') >= 0 || h.indexOf('mf-dashboard-new') >= 0) return true;
      const qs = (location.search || '').toLowerCase();
      if (/(\?|&)new=1\b/.test(qs)) return true;
    } catch {}
    return false;
  }
  function persistKey(): string { return 'mf-db-selected-tables:' + currentFormId(); }
  function sessionKey(): string {
    // Combine formId + hash so new-form sessions also flip when the URL changes.
    return String(currentFormId()) + '|' + (location.hash || '');
  }
  function getSchemaSettings(): any {
    const B = (window as any).MegaFormBuilder;
    if (!B || !B.state || !B.state.schema) return null;
    if (!B.state.schema.settings || typeof B.state.schema.settings !== 'object') {
      B.state.schema.settings = {};
    }
    return B.state.schema.settings;
  }
  function loadPersistedSelected(): string[] {
    // [v20260530-27] Per-form. Read THIS form's schema first; localStorage
    // fallback applies ONLY to saved forms (formId > 0). New-form mode
    // always starts with an empty list — no leak from previous new-form
    // sessions (which would all share localStorage key
    // `mf-db-selected-tables:0`).
    try {
      const settings = getSchemaSettings();
      const fromSchema = settings && (settings.aiPickedTables || settings.AiPickedTables);
      if (Array.isArray(fromSchema) && fromSchema.length > 0) {
        return fromSchema.filter((x: any) => typeof x === 'string');
      }
    } catch { /* fall through */ }
    if (isNewFormMode()) return [];
    try {
      const raw = localStorage.getItem(persistKey());
      if (!raw) return [];
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : [];
    } catch { return []; }
  }
  function savePersistedSelected(): void {
    // [v20260530-27] Persist to the form schema (travels with the form on
    // Save) AND, for SAVED forms only, also to localStorage so reloads work.
    // New-form mode skips localStorage — the schema is the only carrier.
    try {
      const settings = getSchemaSettings();
      if (settings) {
        if (selectedTables.length) settings.aiPickedTables = selectedTables.slice();
        else delete settings.aiPickedTables;
        const B = (window as any).MegaFormBuilder;
        if (B && typeof B.markDirty === 'function') {
          try { B.markDirty(); } catch {}
        }
      }
    } catch { /* schema not ready */ }
    if (isNewFormMode()) return;
    try { localStorage.setItem(persistKey(), JSON.stringify(selectedTables)); } catch { /* quota */ }
  }

  // [v20260530-27] Detect form-session change. Was: just formId. That misses
  // "new form opened twice" because both have formId=0. Now we key on
  // formId + URL hash so navigating to the New-Form route resets the strip.
  let __lastSeenSessionKey = '';
  function refreshIfFormChanged(): void {
    const k = sessionKey();
    if (k !== __lastSeenSessionKey) {
      __lastSeenSessionKey = k;
      selectedTables = loadPersistedSelected();
      (window as any).__MF_SELECTED_DB_TABLES__ = selectedTables.slice();
      try { renderSelected(); } catch { /* host not mounted yet */ }
    }
  }
  if (typeof window !== 'undefined') {
    setInterval(refreshIfFormChanged, 1200);
    // Also fire on history changes (hashchange / popstate) for instant reset
    // when the user clicks the "Create New Form" button.
    window.addEventListener('hashchange', refreshIfFormChanged);
    window.addEventListener('popstate', refreshIfFormChanged);
    // [v20260530-27] One-time cleanup of the v26 invariant break:
    // mf-db-selected-tables:0 was shared by every new-form session.
    // Wipe it once so existing users with a leak see a clean strip
    // immediately after upgrading.
    try { localStorage.removeItem('mf-db-selected-tables:0'); } catch {}
  }

  function getSelectedHost(): HTMLElement | null {
    return document.getElementById('mf-db-tables-selected');
  }

  function ensureSelectedHost(panelHost: HTMLElement): HTMLElement {
    let sel = getSelectedHost();
    if (sel) return sel;
    sel = document.createElement('div');
    sel.id = 'mf-db-tables-selected';
    sel.innerHTML =
      '<h4>' + S.selectedHeading + '</h4>' +
      '<p class="mfsel-hint">' + S.selectedHint + '</p>' +
      '<div class="mfsel-list"></div>' +
      '<div class="mfsel-actions">' +
        '<button type="button" class="mfsel-btn-ai" data-act="build-ai" title="' + escapeAttr(S.buttonBuildWithAiTitle || '') + '" disabled>' + (S.buttonBuildWithAi || '🤖 Build fields with AI') + '</button>' +
        '<button type="button" class="mfsel-btn-clear" data-act="clear" title="' + escapeAttr(S.buttonClearSelectedTitle || '') + '" disabled>' + (S.buttonClearSelected || 'Clear') + '</button>' +
      '</div>';
    // Append to the OUTER host (mf-db-tables-host) so it sits below the
    // scrollable list, above the Connection footer.
    const outer = panelHost.closest('#mf-db-tables-host') || panelHost.parentElement;
    if (outer) {
      const footer = outer.querySelector('[data-conn-footer]') || outer.lastElementChild;
      outer.insertBefore(sel, footer);
    }
    // [v20260529-07] Wire Build/Clear once (mounted host persists).
    sel.querySelector('[data-act="build-ai"]')?.addEventListener('click', () => {
      if (!selectedTables.length) return;
      const w = window as any;
      if (!w.MFAiChat || typeof w.MFAiChat.sendProgrammatic !== 'function') {
        alert('AI assistant not loaded. Enable it via dev.lock + reload.'); return;
      }
      const listStr = selectedTables.map(t => '"' + t + '"').join(', ');
      // [v20260530-06] Prompt hardened against AI hallucinating existing
      // fields. Symptoms before: AI emitted set_field_property / remove_field
      // ops targeting field keys that don't exist (e.g. round_display,
      // score_details). The dispatcher rejected them, leaving a half-built
      // form. Force-rules: only add_field, only against the listed tables,
      // verify columns via get_table_columns before SQL.
      const prompt = [
        'TASK: Build input form fields for the following SQL tables on DashboardDatabase:',
        listStr,
        '',
        'STRICT RULES — failure to follow these breaks the form:',
        '1. Use ONLY `add_field` ops. Do NOT use set_field_property or remove_field. If you want to rename a field, just emit it with the right label from the start.',
        '2. Trust the CURRENT FORM SNAPSHOT below. If a field is NOT in the snapshot, do NOT reference its key in any op. The user wants a FRESH build on top of whatever is already there.',
        '3. For EACH table call get_table_columns(tableName) ONCE before writing SQL. Do NOT guess column names. Do NOT write a WHERE clause referencing a column that does not appear in the tool result.',
        '4. For Select fields backed by SQL, use this exact shape: `properties:{optionsSource:"sql", optionsConnectionKey:"DashboardDatabase", optionsSql:"SELECT <id> AS value, <label> AS label FROM <table>"}`. Cascading children add `properties.optionsDependsOn:["parent_key"]`.',
        '5. For DataRepeater/DataGrid use widgetProps.{connectionKey:"DashboardDatabase", masterQuery, queryDependsOn:[...]}.',
        '6. Skip identity primary keys when picking columns. Keep field keys snake_case.',
        '7. End with a chat_message op summarising what was added.',
      ].join('\n');
      w.MFAiChat.sendProgrammatic(prompt);
    });
    sel.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
      if (!selectedTables.length) return;
      if (!confirm('Remove all ' + selectedTables.length + ' tables from the working set?')) return;
      selectedTables = [];
      (window as any).__MF_SELECTED_DB_TABLES__ = [];
      savePersistedSelected();
      renderSelected();
    });
    return sel;
  }

  function renderSelected() {
    const sel = getSelectedHost(); if (!sel) return;
    const list = sel.querySelector('.mfsel-list') as HTMLElement;
    const buildBtn = sel.querySelector('[data-act="build-ai"]') as HTMLButtonElement | null;
    const clearBtn = sel.querySelector('[data-act="clear"]') as HTMLButtonElement | null;
    if (buildBtn) buildBtn.disabled = selectedTables.length === 0;
    if (clearBtn) clearBtn.disabled = selectedTables.length === 0;
    if (!selectedTables.length) {
      list.innerHTML = '<span class="mfsel-empty">' + S.selectedEmpty + '</span>';
      return;
    }
    list.innerHTML = selectedTables.map((t) =>
      '<span class="mfsel-pill" data-sel="' + escapeAttr(t) + '">' + escapeHtml(t) + '<button type="button" title="Remove">×</button></span>'
    ).join('');
    list.querySelectorAll('.mfsel-pill button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const pill = (e.target as HTMLElement).closest('[data-sel]') as HTMLElement;
        const t = pill?.getAttribute('data-sel') || '';
        selectedTables = selectedTables.filter((x) => x !== t);
        (window as any).__MF_SELECTED_DB_TABLES__ = selectedTables.slice();
        savePersistedSelected();
        renderSelected();
      });
    });
  }

  function markSelected(tableName: string) {
    if (!selectedTables.includes(tableName)) selectedTables.push(tableName);
    (window as any).__MF_SELECTED_DB_TABLES__ = selectedTables.slice();
    savePersistedSelected();
    renderSelected();
  }

  function mountTabContent(host: HTMLElement) {
    if (mounted) return;
    mounted = true;
    injectStyles();
    host.innerHTML =
      '<div class="mf-bdb-search">' +
        '<input type="search" placeholder="' + S.filterPlaceholder + '" data-search />' +
        '<label class="mf-bdb-toggle"><input type="checkbox" data-show-system /> ' + S.showSystemLabel + '</label>' +
      '</div>' +
      '<div data-list><div class="mf-bdb-loading">' + S.loadingTables + '</div></div>';
    const search = host.querySelector('[data-search]') as HTMLInputElement;
    const toggle = host.querySelector('[data-show-system]') as HTMLInputElement;
    search.addEventListener('input', () => renderList(host, search.value.trim().toLowerCase()));
    toggle.addEventListener('change', () => {
      showSystem = toggle.checked;
      tablesCache = null; // force refetch
      loadAndRender(host, search.value.trim().toLowerCase());
    });
    ensureSelectedHost(host);
    // [v20260530-01] Rehydrate strip from localStorage before first render
    // so a reload of the form shows the previously-picked tables.
    selectedTables = loadPersistedSelected();
    (window as any).__MF_SELECTED_DB_TABLES__ = selectedTables.slice();
    renderSelected();
    loadAndRender(host, '');
  }

  async function loadAndRender(host: HTMLElement, filter: string) {
    try {
      if (!tablesCache) {
        const j = await fetchJson(buildUrl('Subform/Tables', showSystem ? { showAll: '1' } : {}));
        tablesCache = (j.tables || []) as DbTable[];
        (window as any).__MF_DB_TABLES__ = tablesCache;
      }
      renderList(host, filter);
    } catch (err: any) {
      const list = host.querySelector('[data-list]') as HTMLElement;
      if (list) list.innerHTML = '<div class="mf-bdb-err">' + S.errorLoadFailed + (err.message || String(err)) + '<br><br>' + S.errorConnectionHint + '</div>';
    }
  }

  function renderList(host: HTMLElement, filter: string) {
    const list = host.querySelector('[data-list]') as HTMLElement;
    if (!list) return;
    const tables = (tablesCache || []).filter(t => !filter || t.name.toLowerCase().includes(filter) || (t.schema || '').toLowerCase().includes(filter));
    if (!tables.length) { list.innerHTML = '<div class="mf-bdb-empty">' + S.noMatchPrefix + escapeHtml(filter) + S.noMatchSuffix + '</div>'; return; }
    list.innerHTML = tables.map(t => renderTableRow(t)).join('');
    list.querySelectorAll('.mf-bdb-table').forEach((el) => wireTableRow(el as HTMLElement));
  }

  function renderTableRow(t: DbTable): string {
    return '<div class="mf-bdb-table" data-table="' + escapeAttr(t.name) + '">' +
      '<div class="mf-bdb-table-head">' +
        '<span class="mf-bdb-table-schema">' + escapeHtml(t.schema || 'dbo') + '</span>' +
        '<span class="mf-bdb-table-name">' + escapeHtml(t.name) + '</span>' +
        '<span class="mf-bdb-table-add-row">' +
          '<button type="button" class="mf-bdb-table-ai" data-probe title="Dò năng lực: khoá, quyền, index, cột bắt buộc — MegaForm làm được gì với bảng này" style="background:#0f766e">⚡ Năng lực</button>' +
          '<button type="button" class="mf-bdb-table-ai" data-ai title="' + escapeAttr(S.buttonAddAiFormTitle) + '">' + S.buttonAddAiForm + '</button>' +
          '<button type="button" class="mf-bdb-table-add" data-add title="' + escapeAttr(S.buttonAddDataGridTitle) + '">' + S.buttonAddDataGrid + '</button>' +
        '</span>' +
      '</div>' +
      '<div class="mf-bdb-cols" data-cols></div>' +
    '</div>';
  }

  function wireTableRow(rowEl: HTMLElement) {
    const tableName = rowEl.getAttribute('data-table') || '';
    const head = rowEl.querySelector('.mf-bdb-table-head') as HTMLElement;
    const colsEl = rowEl.querySelector('[data-cols]') as HTMLElement;
    const addBtn = rowEl.querySelector('[data-add]') as HTMLButtonElement;
    const aiBtn  = rowEl.querySelector('[data-ai]')  as HTMLButtonElement;

    // [ATBE P0] Capability probe — what can MegaForm actually do with this table?
    const probeBtn = rowEl.querySelector('[data-probe]') as HTMLButtonElement | null;
    if (probeBtn) probeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = (window as any).__MF_OPEN_CAPABILITY_CARD__;
      if (typeof open !== 'function') return;
      const t = (tablesCache || []).find(x => x.name === tableName);
      open('DashboardDatabase', (t && t.schema) || 'dbo', tableName);
    });

    head.addEventListener('click', async (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt.hasAttribute('data-add') || tgt.hasAttribute('data-ai') || tgt.hasAttribute('data-probe')) return;
      const isOpen = rowEl.classList.toggle('is-open');
      if (isOpen && !colsEl.hasChildNodes()) {
        colsEl.innerHTML = '<span style="color:#94a3b8;font-size:11px">' + S.loadingColumns + '</span>';
        try {
          const cols = await loadColumns(tableName);
          renderColumns(colsEl, tableName, cols);
        } catch (err: any) {
          colsEl.innerHTML = '<span style="color:#b91c1c;font-size:11px">' + escapeHtml(err.message || String(err)) + '</span>';
        }
      }
    });

    addBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      addBtn.disabled = true;
      addBtn.textContent = '…';
      try {
        const cols = await loadColumns(tableName);
        const B = (window as any).MegaFormBuilder;
        if (!B || !B.createFieldFromTemplate) throw new Error(S.errorBuilderNotReady);
        const props = tableToDataGridProps({ name: tableName }, cols);
        const newField = B.createFieldFromTemplate({
          type: 'DataGrid',
          label: humanize(tableName) + ' (subform)',
          widgetProps: props,
          width: '100%',
        });
        B.state.schema.fields.push(newField);
        B.state.isDirty = true;
        B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
        try { B.syncSchemaToHtmlImmediate && B.syncSchemaToHtmlImmediate({}); } catch {}
        try { B.callModule && B.callModule('canvas', 'render', []); } catch {}
        try { B.callModule && B.callModule('properties', 'showProps', [newField]); } catch {}
        markSelected(tableName);
        addBtn.textContent = S.buttonAddedOk;
        setTimeout(() => { addBtn.textContent = S.buttonAddDataGrid; addBtn.disabled = false; }, 1500);
      } catch (err: any) {
        addBtn.textContent = S.buttonAddFailed;
        addBtn.disabled = false;
        alert('Could not add table: ' + (err.message || String(err)));
        setTimeout(() => { addBtn.textContent = S.buttonAddDataGrid; }, 1500);
      }
    });

    // [v20260529-07] "+ Use" button (formerly "+ AI Form") — adds the table
    // to the per-form working set ONLY. Does NOT fire the AI chat. The strip
    // at the bottom collects what user picked, then a separate "Build with
    // AI" button (rendered on the strip) is the explicit trigger that hands
    // the whole picked list to the assistant. Avoids the previous footgun
    // where every click ambushed the user with an AI request.
    aiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markSelected(tableName);
      aiBtn.textContent = S.buttonAddedOk;
      setTimeout(() => { aiBtn.textContent = S.buttonAddAiForm; }, 1200);
    });
  }

  async function loadColumns(tableName: string): Promise<DbColumn[]> {
    if (columnsCache[tableName]) return columnsCache[tableName];
    const j = await fetchJson(buildUrl('Subform/Columns', { tableName }));
    columnsCache[tableName] = (j.columns || []) as DbColumn[];
    return columnsCache[tableName];
  }

  function renderColumns(host: HTMLElement, table: string, cols: DbColumn[]) {
    if (!cols.length) { host.innerHTML = '<span style="color:#94a3b8;font-size:11px">(no columns)</span>'; return; }
    host.innerHTML = cols.map(c => {
      return '<span class="mf-bdb-col" draggable="true" data-table="' + escapeAttr(table) + '" data-col="' + escapeAttr(c.name) + '" data-uitype="' + escapeAttr(c.uiType) + '"' + (c.isPrimary ? ' data-pk="1"' : '') + ' title="' + escapeAttr(c.dataType + (c.nullable ? ' (nullable)' : '')) + '">' +
        escapeHtml(c.name) + '<span class="mf-bdb-col-type">' + escapeHtml(c.uiType) + '</span>' +
      '</span>';
    }).join('');
    host.querySelectorAll('.mf-bdb-col').forEach((el) => {
      el.addEventListener('click', () => addColumnAsField(el as HTMLElement));
      el.addEventListener('dragstart', (e: any) => {
        const tableName = (el as HTMLElement).getAttribute('data-table') || '';
        const colName = (el as HTMLElement).getAttribute('data-col') || '';
        const col = (columnsCache[tableName] || []).find(c => c.name === colName);
        if (col) {
          const tpl = columnToFieldTemplate({ name: tableName }, col);
          e.dataTransfer.setData('application/x-mf-field', JSON.stringify(tpl));
          e.dataTransfer.effectAllowed = 'copy';
        }
      });
    });
  }

  function addColumnAsField(el: HTMLElement) {
    const tableName = el.getAttribute('data-table') || '';
    const colName = el.getAttribute('data-col') || '';
    const col = (columnsCache[tableName] || []).find(c => c.name === colName);
    if (!col) return;
    const B = (window as any).MegaFormBuilder;
    if (!B || !B.createFieldFromTemplate) return;
    const tpl = columnToFieldTemplate({ name: tableName }, col);
    const newField = B.createFieldFromTemplate(tpl);
    B.state.schema.fields.push(newField);
    B.state.isDirty = true;
    B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
    try { B.syncSchemaToHtmlImmediate && B.syncSchemaToHtmlImmediate({}); } catch {}
    try { B.callModule && B.callModule('canvas', 'render', []); } catch {}
    try { B.callModule && B.callModule('properties', 'showProps', [newField]); } catch {}
  }

  function escapeHtml(s: string): string {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
  function escapeAttr(s: string): string { return escapeHtml(s); }

  // ─────────────────────────────────────────────────────────────────────
  //  Bootstrap: watch for the DB tab to appear + populate when activated
  // ─────────────────────────────────────────────────────────────────────
  function tryMount() {
    const host = document.getElementById('mf-db-tables-body');
    if (host && !mounted) {
      mountTabContent(host);
      return true;
    }
    return false;
  }

  function watchForTab() {
    if (tryMount()) return;
    const start = Date.now();
    const iv = setInterval(() => {
      if (tryMount()) { clearInterval(iv); return; }
      if (Date.now() - start > 180000) clearInterval(iv); // give up after 3 min
    }, 500);
  }

  // Also pre-fetch tables list so AI prompt can include them BEFORE user
  // opens the DB tab.
  (async () => {
    try {
      if (!tablesCache) {
        const j = await fetchJson(buildUrl('Subform/Tables'));
        tablesCache = (j.tables || []) as DbTable[];
        (window as any).__MF_DB_TABLES__ = tablesCache;
      }
    } catch { /* anon or pre-builder; will retry on tab open */ }
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForTab);
  } else {
    watchForTab();
  }

  // [v20260529-07] Public refresh hook for chat.ts Apply DDL flow.
  // Clears the cached tables list + re-renders the visible DB tab body
  // so a freshly created table appears in the list.
  (window as any).MFBuilderDbTabsRefresh = function refresh() {
    tablesCache = null;
    const body = document.getElementById('mf-db-tables-body');
    if (body) {
      const search = body.querySelector('[data-search]') as HTMLInputElement | null;
      loadAndRender(body, search ? search.value.trim().toLowerCase() : '');
    }
  };

  console.log('[MegaForm] ' + BADGE + ' loaded.');
})();

export {};
