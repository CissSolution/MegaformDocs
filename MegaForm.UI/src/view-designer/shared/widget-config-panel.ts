/**
 * Reusable Widget Configuration Panel — Umbraco-style typed inspector.
 *
 * Mount this at the top of any widget designer popup (Layout Designer v2,
 * GridRepeater Designer, DataRepeater Designer, etc.) so admins can see
 * EVERY widgetProp the AI assistant (or a previous human edit) set on the
 * field, and tweak any of them without leaving the popup.
 *
 * Reads the field from MegaFormBuilder.state.schema.fields by key.
 * Inspects values and infers the editor type:
 *   - string with newline / >120 chars → textarea
 *   - boolean → checkbox
 *   - number → number input
 *   - hex color "#rrggbb" → color picker
 *   - URL-ish (starts with http/https/data) → url input
 *   - small array of {label,value} → select
 *   - small array of strings → multi-text
 *   - object/array → JSON textarea (advanced)
 *   - otherwise → text input
 *
 * Sectioning: groups props by common prefix (sql.* / display.* / pager.* /
 * empty.* etc.) into <details> collapsible sections; uncategorised props go
 * under "General". Order: General first, then alphabetical by section.
 *
 * Edits write back to MegaFormBuilder.state.schema.fields[N].widgetProps
 * and call MegaFormBuilder.callModule('canvas', 'render') so the canvas
 * updates instantly. State is also marked dirty.
 *
 * Used by both DNN and Oqtane — both ship the same view-designer bundle.
 *
 * Badge: WidgetConfigPanel v20260529-01
 */

export const WIDGET_CONFIG_PANEL_BADGE = 'WidgetConfigPanel v20260529-01';

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return; stylesInjected = true;
  const css = `
.mfwcp-wrap{background:linear-gradient(180deg,#eef2ff,#fff);border:1px solid #c7d2fe;border-radius:10px;padding:0;margin:0 0 12px;overflow:hidden;font:13px/1.45 system-ui,-apple-system,sans-serif;color:#0f172a}
.mfwcp-head{display:flex;align-items:center;gap:10px;padding:9px 14px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;font-weight:600;font-size:13px}
.mfwcp-head .mfwcp-pill{margin-left:auto;font-size:10px;letter-spacing:.04em;text-transform:uppercase;background:rgba(255,255,255,.18);padding:2px 8px;border-radius:999px}
.mfwcp-empty{padding:18px;color:#7c3aed;font-size:12px;text-align:center;font-style:italic}
.mfwcp-section{border-top:1px solid #e0e7ff}
.mfwcp-section:first-child{border-top:0}
.mfwcp-section summary{padding:7px 14px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4f46e5;background:#fafbff;outline:none;user-select:none}
.mfwcp-section summary:hover{background:#eef2ff}
.mfwcp-section[open]>summary{background:#eef2ff}
.mfwcp-section-body{padding:8px 14px 12px;display:flex;flex-direction:column;gap:8px;background:#fff}
.mfwcp-row{display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:start}
.mfwcp-label{font-size:11px;color:#475569;padding-top:6px;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.mfwcp-control input,.mfwcp-control select,.mfwcp-control textarea{width:100%;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;background:#fff;color:#0f172a;font-size:12px}
.mfwcp-control input:focus,.mfwcp-control select:focus,.mfwcp-control textarea:focus{outline:0;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.mfwcp-control textarea{font-family:Menlo,Consolas,monospace;font-size:11px;resize:vertical;min-height:60px}
.mfwcp-control-check{display:flex;align-items:center;gap:6px;padding-top:6px}
.mfwcp-control-color{display:flex;gap:5px;align-items:center}
.mfwcp-control-color input[type=color]{width:32px;height:28px;padding:0;border:1px solid #cbd5e1;border-radius:5px;background:transparent;cursor:pointer}
.mfwcp-status{font-size:10px;color:#15803d;padding:0 14px 10px;font-style:italic}
.mfwcp-status.is-error{color:#b91c1c}
`;
  document.head.appendChild(Object.assign(document.createElement('style'), { id: 'mfwcp-styles', textContent: css }));
}

// ───────────────────────────────────────────────────────────────────────
//  Public API
// ───────────────────────────────────────────────────────────────────────

export interface MountWidgetConfigPanelOpts {
  /** Where to mount the panel — typically the designer popup body's first child. */
  host: HTMLElement;
  /** Field key in MegaFormBuilder.state.schema.fields. If not provided, panel reads selected field. */
  fieldKey?: string;
  /** Optional title override (defaults to "AI Configuration"). */
  title?: string;
  /** Called after each prop edit. */
  onChange?: (newProps: Record<string, any>) => void;
}

export function mountWidgetConfigPanel(opts: MountWidgetConfigPanelOpts): { destroy: () => void; refresh: () => void } {
  injectStyles();
  const builder = (window as any).MegaFormBuilder;
  const wrap = document.createElement('div');
  wrap.className = 'mfwcp-wrap';
  opts.host.insertBefore(wrap, opts.host.firstChild);

  const status = document.createElement('div');
  status.className = 'mfwcp-status';

  function findField(): { idx: number; field: any } | null {
    if (!builder || !builder.state || !builder.state.schema || !Array.isArray(builder.state.schema.fields)) return null;
    const fields = builder.state.schema.fields as any[];
    let idx = -1;
    if (opts.fieldKey) {
      idx = fields.findIndex((f) => f && f.key === opts.fieldKey);
    } else if (typeof builder.state.selectedFieldIndex === 'number') {
      idx = builder.state.selectedFieldIndex;
    }
    if (idx < 0) return null;
    return { idx, field: fields[idx] };
  }

  function flashStatus(msg: string, kind: 'ok' | 'error' = 'ok'): void {
    status.textContent = msg;
    status.classList.toggle('is-error', kind === 'error');
    status.style.display = '';
    window.clearTimeout((status as any).__t);
    (status as any).__t = window.setTimeout(() => { status.style.display = 'none'; }, 2000);
  }

  function saveProp(field: any, path: string, value: any): void {
    if (!field.widgetProps) field.widgetProps = {};
    setByPath(field.widgetProps, path, value);
    builder.state.isDirty = true;
    try { builder.syncSchemaToHtmlImmediate && builder.syncSchemaToHtmlImmediate({}); } catch { /* noop */ }
    try { builder.callModule && builder.callModule('canvas', 'render', []); } catch { /* noop */ }
    flashStatus('Saved ' + path);
    if (opts.onChange) opts.onChange(field.widgetProps);
  }

  function render(): void {
    wrap.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'mfwcp-head';
    head.innerHTML = '<i class="fa fa-robot"></i><span>' + (opts.title || 'AI Configuration') + '</span><span class="mfwcp-pill">Umbraco-style</span>';
    wrap.appendChild(head);

    const sel = findField();
    if (!sel || !sel.field) {
      const empty = document.createElement('div');
      empty.className = 'mfwcp-empty';
      empty.textContent = 'No field selected — open this popup from a field to inspect its AI-configured properties.';
      wrap.appendChild(empty);
      return;
    }

    const field = sel.field;
    const widgetProps = (field.widgetProps && typeof field.widgetProps === 'object') ? field.widgetProps : {};
    const flatRows: Array<{ section: string; path: string; key: string; value: any; }> = [];
    walk(widgetProps, '', flatRows);

    if (!flatRows.length) {
      const empty = document.createElement('div');
      empty.className = 'mfwcp-empty';
      empty.textContent = 'This field has no widgetProps yet. AI or admin edits will appear here automatically.';
      wrap.appendChild(empty);
      return;
    }

    // Group by section
    const sections = new Map<string, Array<typeof flatRows[number]>>();
    flatRows.forEach((r) => {
      if (!sections.has(r.section)) sections.set(r.section, []);
      sections.get(r.section)!.push(r);
    });
    const orderedSections = Array.from(sections.keys()).sort((a, b) => {
      if (a === 'General') return -1; if (b === 'General') return 1; return a.localeCompare(b);
    });

    orderedSections.forEach((sname) => {
      const sec = document.createElement('details');
      sec.className = 'mfwcp-section';
      sec.open = true;
      const sum = document.createElement('summary');
      sum.textContent = sname + ' (' + sections.get(sname)!.length + ')';
      sec.appendChild(sum);
      const body = document.createElement('div');
      body.className = 'mfwcp-section-body';
      sections.get(sname)!.forEach((row) => body.appendChild(renderRow(row, field, saveProp)));
      sec.appendChild(body);
      wrap.appendChild(sec);
    });

    wrap.appendChild(status);
  }

  function refresh(): void { render(); }
  function destroy(): void { wrap.remove(); }

  render();
  return { destroy, refresh };
}

// ───────────────────────────────────────────────────────────────────────
//  Internals
// ───────────────────────────────────────────────────────────────────────

function walk(obj: any, basePath: string, out: Array<{ section: string; path: string; key: string; value: any; }>): void {
  Object.keys(obj || {}).forEach((k) => {
    const v = obj[k];
    const path = basePath ? basePath + '.' + k : k;
    // Section: top-level keys with dot-style grouping use the prefix; deeply
    // nested objects collapse into a JSON editor at the top key.
    let section = 'General';
    const top = path.split('.')[0];
    if (top !== path) section = sectionFor(top);
    else section = sectionFor(k);
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 4) {
      // Flatten shallow object
      walk(v, path, out);
    } else {
      out.push({ section, path, key: humanize(k), value: v });
    }
  });
}

function sectionFor(key: string): string {
  const k = key.toLowerCase();
  if (/(sql|query|database|connection|sproc|table)/.test(k)) return 'SQL & Data';
  if (/(template|row|wrap|pager|empty|html|preset)/.test(k))  return 'Templates';
  if (/(column|field|input|option|widget|grid)/.test(k))      return 'Columns & Inputs';
  if (/(style|css|color|font|class|theme|skin|background)/.test(k)) return 'Styling';
  if (/(label|placeholder|title|description|message|text)/.test(k)) return 'Labels & Text';
  if (/(total|formula|aggregate|sum|calculate)/.test(k))      return 'Calculation';
  if (/(min|max|default|required|allow|deny|edit|read)/.test(k)) return 'Validation';
  return 'General';
}

function humanize(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

function renderRow(
  row: { path: string; key: string; value: any },
  field: any,
  saveProp: (field: any, path: string, value: any) => void
): HTMLElement {
  const div = document.createElement('div');
  div.className = 'mfwcp-row';
  const label = document.createElement('div');
  label.className = 'mfwcp-label';
  label.textContent = row.key;
  label.title = row.path;
  div.appendChild(label);

  const control = document.createElement('div');
  control.className = 'mfwcp-control';
  control.appendChild(buildEditor(row.path, row.value, (newVal) => saveProp(field, row.path, newVal)));
  div.appendChild(control);
  return div;
}

function buildEditor(path: string, value: any, onChange: (v: any) => void): HTMLElement {
  // Boolean
  if (typeof value === 'boolean') {
    const wrap = document.createElement('label');
    wrap.className = 'mfwcp-control-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    const span = document.createElement('span');
    span.textContent = cb.checked ? 'Enabled' : 'Disabled';
    cb.addEventListener('change', () => { span.textContent = cb.checked ? 'Enabled' : 'Disabled'; });
    wrap.appendChild(span);
    return wrap;
  }
  // Number
  if (typeof value === 'number') {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = String(value);
    inp.addEventListener('input', () => onChange(Number(inp.value || 0)));
    return inp;
  }
  // Object / array — JSON editor
  if (value && typeof value === 'object') {
    const ta = document.createElement('textarea');
    ta.rows = 4;
    try { ta.value = JSON.stringify(value, null, 2); } catch { ta.value = String(value); }
    ta.addEventListener('change', () => {
      try { onChange(JSON.parse(ta.value)); } catch { /* invalid JSON: keep old */ }
    });
    return ta;
  }
  // String — pick textarea/url/color/text
  const s = value == null ? '' : String(value);
  const lowerPath = path.toLowerCase();
  if (/^#[0-9a-fA-F]{6}$/.test(s) || lowerPath.includes('color')) {
    const wrap = document.createElement('div');
    wrap.className = 'mfwcp-control-color';
    const c = document.createElement('input');
    c.type = 'color';
    c.value = /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#cccccc';
    const t = document.createElement('input');
    t.type = 'text'; t.value = s;
    c.addEventListener('input', () => { t.value = c.value; onChange(c.value); });
    t.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(t.value)) { c.value = t.value; } onChange(t.value); });
    wrap.appendChild(c); wrap.appendChild(t);
    return wrap;
  }
  if (s.indexOf('\n') >= 0 || s.length > 120 || /(template|html|content|body|sql|query)/i.test(path)) {
    const ta = document.createElement('textarea');
    ta.rows = 4;
    ta.value = s;
    ta.addEventListener('change', () => onChange(ta.value));
    return ta;
  }
  if (/^https?:|^data:|^\/|url|href|src/i.test(s) || /url|href|src/i.test(lowerPath)) {
    const inp = document.createElement('input');
    inp.type = 'url'; inp.value = s;
    inp.addEventListener('change', () => onChange(inp.value));
    return inp;
  }
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = s;
  inp.addEventListener('change', () => onChange(inp.value));
  return inp;
}

function setByPath(obj: any, path: string, value: any): void {
  const segs = path.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    if (typeof cur[segs[i]] !== 'object' || cur[segs[i]] == null) cur[segs[i]] = {};
    cur = cur[segs[i]];
  }
  cur[segs[segs.length - 1]] = value;
}

// Expose globally so non-typed callers (legacy designer popups) can mount it.
(window as any).MFWidgetConfigPanel = {
  mount: mountWidgetConfigPanel,
  badge: WIDGET_CONFIG_PANEL_BADGE,
};
