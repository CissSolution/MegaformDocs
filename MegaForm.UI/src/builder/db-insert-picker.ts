// ─────────────────────────────────────────────────────────────
//  db-insert-picker.ts — Connection + table + real-column picker for the
//  Form Settings → "Database (save submission to custom DB)" panel.
//
//  Before this, the panel had a free-text "Connection name" box and a
//  "Generate sample SQL" button that guessed columns by PascalCasing field
//  keys — so a Country form emitted INSERT INTO Country ([Name],[Code]) while
//  the real table has [CountryName],[CountryCode], and every submit / Test
//  failed with "Invalid column name". This mirrors what the AI creator already
//  does: pick a server-allowed connection (AiTools/SqlConnections), pick a
//  table (AiTools/SqlTables), load the table's REAL columns (AiTools/SqlColumns),
//  then generate an INSERT whose columns match the table and whose :tokens map
//  to the closest form fields.
//
//  Self-contained (computes its own API base + auth headers from
//  window.__MF_PLATFORM__, the same convention the Test-insert button uses) so
//  properties.ts only has to hand it the panel's config accessors.
//  Fail-soft: any network / parse error leaves the panel usable as a plain
//  free-text fallback — it never throws into the settings wiring.
// ─────────────────────────────────────────────────────────────

export interface DbInsertColumn {
  name: string;
  dataType?: string;
  type?: string;      // DNN's SqlColumns returns the SQL type under `type`, not `dataType`
  nullable?: boolean;
  isPrimary?: boolean;
  uiType?: string;
}

// Oqtane returns the SQL type as `dataType`, DNN as `type` — read whichever is present.
function colType(c: DbInsertColumn | undefined): string { return String((c && (c.dataType || c.type)) || ''); }

export interface DbInsertPickerDeps {
  /** The live databaseInsert config object (connectionKey/insertSql/parameterMapping are read + written). */
  getConfig: () => { connectionKey: string; databaseType?: string; insertSql: string; parameterMapping: Record<string, string> };
  /** Flat form field keys, in order. */
  getFieldKeys: () => string[];
  /** Mark the builder dirty after a change. */
  markDirty: () => void;
}

// ── API base + headers (mirror ai-form-creator.aiBase / buildFetchHeaders) ──
function plat(): any { return (window as any).__MF_PLATFORM__ || {}; }
function isOqtane(): boolean { return String(plat().platform || '').toLowerCase() === 'oqtane'; }

function aiBase(): string {
  const p = plat();
  const explicit = String(p.aiBase || '');
  if (explicit) return explicit.charAt(explicit.length - 1) === '/' ? explicit : explicit + '/';
  return isOqtane() ? '/api/' : '/DesktopModules/MegaForm/API/';
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const p = plat();
  if (isOqtane()) {
    const token = p.authToken || (window as any).__MF_TOKEN;
    if (token) h['Authorization'] = 'Bearer ' + token;
    if ((p.moduleId || 0) > 0) h['X-OQTANE-MODULEID'] = String(p.moduleId);
    if ((p.siteId || 0) > 0) h['X-OQTANE-SITEID'] = String(p.siteId);
    if ((p.aliasId || 0) > 0) h['X-OQTANE-ALIASID'] = String(p.aliasId);
  }
  return h;
}

async function getJson(path: string): Promise<any> {
  const r = await fetch(aiBase() + path, { credentials: 'same-origin', headers: headers() });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ── column ⇄ field matching ──────────────────────────────────────────────
function norm(s: string): string { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

/** True for columns the DB fills itself (identity PK / rowversion) — omit from INSERT. */
function isLikelyAuto(c: DbInsertColumn): boolean {
  const dt = colType(c).toLowerCase();
  const numericOrGuid = /\b(int|bigint|smallint|tinyint|uniqueidentifier|rowversion|timestamp)\b/.test(dt);
  return !!c.isPrimary && numericOrGuid;
}

interface Pair { col: string; field: string; }
export interface GenResult { sql: string; mapping: Record<string, string>; pairs: Pair[]; missingRequired: string[]; }

/** Build an INSERT whose columns are the table's real columns, each valued by its closest form field. */
export function generateInsert(qualifiedTable: string, columns: DbInsertColumn[], fieldKeys: string[]): GenResult {
  const fields = fieldKeys.map(k => ({ key: k, n: norm(k) })).filter(f => f.n);
  const pairs: Pair[] = [];
  const used: Record<string, boolean> = {};
  const missingRequired: string[] = [];

  for (const c of columns || []) {
    const cn = norm(c.name);
    if (!cn) continue;
    let best: { key: string; n: string } | null = null;
    let bestScore = 0;
    for (const f of fields) {
      if (used[f.key]) continue;
      let score = 0;
      if (f.n === cn) score = 1000;
      else if (cn.length >= f.n.length && (cn.indexOf(f.n) === 0 || cn.lastIndexOf(f.n) === cn.length - f.n.length)) score = 500 + f.n.length;
      else if (cn.indexOf(f.n) >= 0) score = 300 + f.n.length;
      else if (f.n.indexOf(cn) >= 0) score = 200 + cn.length;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (best && bestScore >= 200) {
      pairs.push({ col: c.name, field: best.key });
      used[best.key] = true;
    } else if (!c.nullable && !isLikelyAuto(c)) {
      missingRequired.push(c.name);
    }
  }

  const cols = pairs.map(p => '[' + p.col + ']').join(', ');
  const vals = pairs.map(p => ':' + p.field).join(', ');
  const sql = pairs.length
    ? 'INSERT INTO ' + qualifiedTable + ' (' + cols + ')\nVALUES (' + vals + ')'
    : '';
  const mapping: Record<string, string> = {};
  pairs.forEach(p => { mapping[':' + p.field] = p.field; });
  return { sql, mapping, pairs, missingRequired };
}

// ── qualified table helpers ──────────────────────────────────────────────
function qualify(schema: string, name: string): string {
  const s = String(schema || '').trim();
  const n = String(name || '').trim();
  return (s ? '[' + s + '].' : '') + '[' + n + ']';
}

// Separator packed into each <option value>; a control char can't occur in a SQL identifier.
const TSEP = String.fromCharCode(1);
/** value stored on each option: "schema<sep>name" (schema may be empty). */
function tableValue(schema: string, name: string): string { return String(schema || '') + TSEP + String(name || ''); }
function splitTableValue(v: string): { schema: string; name: string } {
  const i = String(v || '').indexOf(TSEP);
  if (i < 0) return { schema: '', name: String(v || '') };
  return { schema: v.substring(0, i), name: v.substring(i + 1) };
}

// ── wire-up ──────────────────────────────────────────────────────────────
export function wireDbInsertPicker(deps: DbInsertPickerDeps): void {
  const connSel = document.getElementById('mf-setting-db-insert-conn') as HTMLSelectElement | null;
  const tableSel = document.getElementById('mf-setting-db-insert-table') as HTMLSelectElement | null;
  const colsBox = document.getElementById('mf-setting-db-insert-cols') as HTMLElement | null;
  const sqlTa = document.getElementById('mf-setting-db-insert-sql') as HTMLTextAreaElement | null;
  const genBtn = document.getElementById('mf-setting-db-insert-sample') as HTMLElement | null;
  if (!connSel || !tableSel) return; // markup not present (older template) — nothing to wire

  let loadedColumns: DbInsertColumn[] = [];

  function setOptions(sel: HTMLSelectElement, opts: Array<{ value: string; label: string }>, placeholder: string) {
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = placeholder;
    sel.appendChild(ph);
    opts.forEach(o => { const el = document.createElement('option'); el.value = o.value; el.textContent = o.label; sel.appendChild(el); });
  }

  async function loadConnections(): Promise<void> {
    const current = String(deps.getConfig().connectionKey || '');
    let list: string[] = [];
    try {
      const j = await getJson('AiTools/SqlConnections');
      list = (j && (j.connections || j.Connections)) || [];
      if (!Array.isArray(list)) list = [];
    } catch (_e) { list = []; }
    // Always offer the site DB; include whatever the form already had so a legacy
    // connection stays selectable even if the server list doesn't return it.
    if (list.indexOf('DashboardDatabase') < 0) list.push('DashboardDatabase');
    if (current && list.indexOf(current) < 0) list.unshift(current);
    setOptions(connSel!, list.map(c => ({ value: c, label: c })), '— select connection —');
    if (current) connSel!.value = current;
    if (connSel!.value) void loadTables(connSel!.value);
  }

  async function loadTables(conn: string): Promise<void> {
    tableSel!.disabled = true;
    setOptions(tableSel!, [], 'Loading tables…');
    let rows: Array<{ schema?: string; name?: string; Schema?: string; Name?: string }> = [];
    try {
      const j = await getJson('AiTools/SqlTables?top=500' + (conn ? '&connectionKey=' + encodeURIComponent(conn) : ''));
      // Oqtane returns the list under `tables`, DNN under `results` — accept either (or a bare array).
      rows = (j && (j.tables || j.Tables || j.results || j.Results || j)) || [];
      if (!Array.isArray(rows)) rows = [];
    } catch (_e) { rows = []; }
    const opts = rows.map(t => {
      const schema = String(t.schema != null ? t.schema : (t.Schema != null ? t.Schema : ''));
      const name = String(t.name != null ? t.name : (t.Name != null ? t.Name : ''));
      return { value: tableValue(schema, name), label: (schema ? schema + '.' : '') + name };
    }).filter(o => o.label);
    setOptions(tableSel!, opts, opts.length ? '— select table —' : 'No tables (check connection)');
    tableSel!.disabled = opts.length === 0;
    // Best-effort preselect from an existing INSERT INTO [schema].[table].
    const existing = existingTableFromSql(deps.getConfig().insertSql);
    if (existing) {
      const match = opts.find(o => {
        const st = splitTableValue(o.value);
        return norm(st.name) === norm(existing.name) && (!existing.schema || norm(st.schema) === norm(existing.schema));
      });
      if (match) { tableSel!.value = match.value; void loadColumns(conn, match.value); }
    }
  }

  async function loadColumns(conn: string, tv: string): Promise<void> {
    loadedColumns = [];
    if (colsBox) { colsBox.style.display = 'none'; colsBox.innerHTML = ''; }
    if (!tv) return;
    const st = splitTableValue(tv);
    // SqlColumns / SqlSchemaReader.ListColumns resolves by the UNQUALIFIED table name — passing
    // "dbo.Country" returns 0 columns, "Country" returns the real 3. The schema is still used to
    // qualify the generated INSERT ([dbo].[Country]).
    const tableArg = st.name;
    try {
      const j = await getJson('AiTools/SqlColumns?table=' + encodeURIComponent(tableArg) + (conn ? '&connectionKey=' + encodeURIComponent(conn) : ''));
      loadedColumns = (j && (j.columns || j.Columns)) || [];
      if (!Array.isArray(loadedColumns)) loadedColumns = [];
    } catch (_e) { loadedColumns = []; }
    renderColumns();
  }

  function renderColumns(): void {
    if (!colsBox) return;
    if (!loadedColumns.length) { colsBox.style.display = 'none'; colsBox.innerHTML = ''; return; }
    const gen = generateInsert('x', loadedColumns, deps.getFieldKeys());
    const matched: Record<string, boolean> = {};
    gen.pairs.forEach(p => { matched[p.col] = true; });
    colsBox.style.display = '';
    colsBox.innerHTML = '<div style="font-weight:600;margin-bottom:4px">Columns (' + loadedColumns.length + ') — <span style="color:#059669">green</span> = auto-mapped to a field, <span style="color:#b91c1c">red *</span> = required but unmatched</div>'
      + loadedColumns.map(c => {
        const ok = matched[c.name];
        const color = ok ? '#065f46' : ((c.nullable || isLikelyAuto(c)) ? '#94a3b8' : '#b91c1c');
        const req = (!c.nullable && !isLikelyAuto(c)) ? ' <span style="color:#b91c1c">*</span>' : '';
        return '<span style="display:inline-block;margin:1px 6px 1px 0;color:' + color + '">' + esc(c.name) + req + '</span>';
      }).join('');
  }

  function esc(s: any): string { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function existingTableFromSql(sql: string): { schema: string; name: string } | null {
    const m = /insert\s+into\s+\[?([A-Za-z0-9_]+)\]?\s*(?:\.\s*\[?([A-Za-z0-9_]+)\]?)?/i.exec(String(sql || ''));
    if (!m) return null;
    return m[2] ? { schema: m[1], name: m[2] } : { schema: '', name: m[1] };
  }

  // — events —
  connSel.addEventListener('change', function () {
    const c = deps.getConfig(); c.connectionKey = connSel!.value; deps.markDirty();
    if (colsBox) { colsBox.style.display = 'none'; colsBox.innerHTML = ''; }
    loadedColumns = [];
    if (connSel!.value) void loadTables(connSel!.value);
  });

  tableSel.addEventListener('change', function () {
    void loadColumns(connSel!.value, tableSel!.value);
  });

  // "Generate INSERT" — column-aware when a table is loaded. Registered in the
  // CAPTURE phase and stops propagation so it pre-empts the legacy naive
  // generator; when no table is loaded it does nothing and the legacy handler runs.
  if (genBtn) {
    genBtn.addEventListener('click', function (ev) {
      if (!loadedColumns.length || !tableSel!.value) return; // let the legacy handler run
      ev.stopImmediatePropagation();
      ev.preventDefault();
      const st = splitTableValue(tableSel!.value);
      const gen = generateInsert(qualify(st.schema, st.name), loadedColumns, deps.getFieldKeys());
      if (!gen.sql) { alert('No form field matched any column of ' + st.name + '. Add fields whose names resemble the columns first.'); return; }
      const cfg = deps.getConfig();
      cfg.insertSql = gen.sql;
      cfg.parameterMapping = gen.mapping;
      if (sqlTa) sqlTa.value = gen.sql;
      deps.markDirty();
      renderColumns();
      if (gen.missingRequired.length && colsBox) {
        const note = document.createElement('div');
        note.style.cssText = 'margin-top:6px;color:#b91c1c;font-weight:600';
        note.textContent = '⚠ Required columns with no matching field (add fields or they will fail NOT NULL): ' + gen.missingRequired.join(', ');
        colsBox.appendChild(note);
      }
    }, true); // capture phase so we run before the legacy click handler
  }

  // Column-typed sample values for the Test button — so a char(2) code column gets 'A', not the
  // 7-char '__test_code' that truncates. Keyed by the FIELD the column maps to (the Test payload
  // binds :field tokens by field key). Falls back to the legacy generator when no table is loaded.
  function sampleValueFor(c: DbInsertColumn | undefined): string {
    const dt = colType(c).toLowerCase();
    if (/\bbit\b/.test(dt)) return '0';
    if (/(int|decimal|numeric|float|real|money)/.test(dt)) return '1';
    if (/(date|time)/.test(dt)) return '2000-01-01';
    if (/uniqueidentifier/.test(dt)) return '00000000-0000-0000-0000-000000000000';
    return 'A'; // short text — fits char(1)+ without truncation
  }
  (window as any).MFDbInsertSampleData = function (): Record<string, string> | null {
    if (!loadedColumns.length) return null;
    const out: Record<string, string> = {};
    const gen = generateInsert('x', loadedColumns, deps.getFieldKeys());
    gen.pairs.forEach(p => {
      const col = loadedColumns.filter(x => x.name === p.col)[0];
      out[p.field] = sampleValueFor(col);
    });
    return out;
  };

  // Re-hydrate when a different form loads (core.ts calls this after settings load),
  // and once now for the current form.
  (window as any).MFReloadDbInsertPicker = function () { void loadConnections(); };
  void loadConnections();
}
