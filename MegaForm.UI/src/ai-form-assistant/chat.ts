/**
 * MegaForm AI Form Assistant — floating bubble + side panel chat UI.
 *
 * Minimal canonical port of acme-ai-chat.js focused on the MegaForm builder
 * scenario: the AI receives a system prompt that explains MegaForm widgets +
 * the op vocabulary (from ops.ts), then returns JSON ops that the dispatcher
 * applies to the live builder state.
 *
 * Surfaces (configured via mount(opts.surface)):
 *   - 'builder'   : bubble in the bottom-right of the form builder
 *   - 'dashboard' : bubble in the bottom-right of the admin dashboard
 *   - 'inline'    : bubble that toggles inline edit overlay (skeleton only v1)
 *
 * History: localStorage 'mf-ai-chat-history' (per origin).
 */

import { dispatchOps, listOpSchemas, readCurrentFormSnapshot, type Op, type OpResult } from './ops';
import type { Attachment, ChatMessage, ChatOpts, MfAiApi, ChatMessageWithTools, ToolCall } from './providers';
import { TOOL_DEFS, dispatchToolCall, serializeToolResult } from './tools';
import { t as i18nT } from '@i18n';
import { ensureDbDialect } from '@shared/ddl-dialect';

// [i18n] Localize the AI chat bubble chrome + status/error messages. Uses this
// bundle's embedded @i18n catalog, falling back to the global, then the English
// literal — so a French/German/… admin sees the chat UI in their language.
function T(key: string, fallback: string, params?: Record<string, string>): string {
  let out = fallback;
  try { const v = i18nT(key, params as any); if (v && v !== key) out = String(v); } catch { /* embedded n/a */ }
  if (out === fallback) {
    try { const I = (window as any).MegaFormI18n; if (I && typeof I.t === 'function') { const v = I.t(key, params); if (v && v !== key) out = String(v); } } catch { /* global n/a */ }
  }
  if (params) for (const k in params) out = out.replace('{' + k + '}', params[k]);
  return out;
}

const CHAT_BADGE = 'MfAiChat v20260615-QA';
// [v20260529-05] Bumped from 6 to 12. Real conversations chain
// list_knowledge → get_knowledge → list_sql_tables → get_table_columns →
// propose_table_schema → ... easily, and 6 was hitting the cap silently.
// On iteration MAX-1 we ALSO switch toolChoice to "none" so the model is
// forced to return final text (else it would just loop until the cap and
// die silently).
// [QA-20260615] Bumped from 12 to 20. App-batch prompts (multiple tables +
// multiple forms + DB introspection) can easily exceed 12 tool calls in one
// turn; stopping early leaves the user with no final reply and no created forms.
const MAX_TOOL_ITERATIONS = 20;
const FORCE_FINALIZE_AT = 18;
const HISTORY_KEY = 'mf-ai-chat-history';
const MAX_HISTORY = 20;

interface MountOpts {
  surface?: 'builder' | 'dashboard' | 'inline';
  containerId?: string;
}

function getApi(): MfAiApi | null {
  return (window as any).MF_AI || null;
}

function esc(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory(history: ChatMessage[]): void {
  try {
    const trimmed = history.slice(-MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* quota */ }
}

function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

/**
 * [v20260528-20] Compact system prompt for the tool-use loop.
 *
 * Big change from v20260528-19: the widget catalog + DB tables list + designer
 * docs are NO LONGER stuffed into the prompt. AI fetches them on-demand via
 * the tool functions defined in tools.ts:
 *     list_widgets / get_widget   — widget schemas
 *     list_sql_tables / get_table_columns — DashboardDatabase introspection
 *     list_forms / get_form       — other forms in this portal
 *     list_knowledge / get_knowledge — every other doc category (sql_sample,
 *     row_template, pager_template, form_pattern, designer, cascade_pattern,
 *     system_arch — extensible via the MF_AI_Knowledge SQL table)
 *
 * Result: prompt drops from ~8 KB to ~1.5 KB; with OpenAI prompt caching the
 * static prefix hits 50% discount on repeat calls.
 */
// [v20260531-KbRules] Cache of prompt-rule bodies fetched from KB at session
// start. Populated by ensurePromptRulesLoaded(); falls back to the inline
// safety rules below if the fetch fails. Sorted by Tags-derived priority
// (critical → high → medium → low).
let __kbPromptRulesCache: string[] | null = null;
let __kbTemplateGuideCache: string | null = null;
let __kbTemplateGuideSlug: string | null = null;

async function ensurePromptRulesLoaded(): Promise<string[]> {
  if (__kbPromptRulesCache !== null) return __kbPromptRulesCache;
  try {
    const w = window as any;
    const platform = w.__MF_PLATFORM__ || {};
    const platformName = String(platform.platform || '').toLowerCase();
    const isOqtane = platformName === 'oqtane' || !!w.Oqtane || !!w.__OQTANE__ || !!document.querySelector('[data-mf-platform="oqtane"]');
    // [QA-20260615b] A1-1 FIX: AiTools lives at /api/AiTools on Oqtane (NOT
    // /api/MegaForm/AiTools). Use platform.aiApiBase (mirrors tools.ts aiBase()),
    // NOT platform.apiBase (= '/api/MegaForm/') which 404s and silently degrades
    // every session to inline rules.
    const aiDefaultBase = isOqtane ? '/api/' : '/DesktopModules/MegaForm/API/';
    const apiBase = String(platform.aiApiBase || aiDefaultBase).replace(/\/?$/, '/');
    const url = apiBase + 'AiTools/Knowledge?kind=prompt_rule&top=80&full=1';
    const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = await r.json();
    if (!Array.isArray(list?.results || list)) throw new Error('bad shape');
    const rows = (list.results || list) as any[];
    const slugSet = new Set<string>();
    const ranked = rows
      .filter(e => {
        if (slugSet.has(e.slug)) return false; slugSet.add(e.slug);
        const t = String(e.tags || '');
        return !/\bdisabled\b/i.test(t);
      })
      .map(e => {
        const tagsArr = Array.isArray(e.tags) ? e.tags.join(',') : String(e.tags || '');
        const pri = /\bcritical\b/i.test(tagsArr) ? 0
                 : /\bhigh\b/i.test(tagsArr)     ? 1
                 : /\bmedium\b/i.test(tagsArr)   ? 2
                 : 3;
        return { pri, body: '- ' + String(e.title || e.slug) + ': ' + String(e.body || e.summary || '') };
      })
      .sort((a, b) => a.pri - b.pri)
      .map(x => x.body);
    __kbPromptRulesCache = ranked;
    return ranked;
  } catch {
    __kbPromptRulesCache = []; // empty array → fallback to inline rules
    return [];
  }
}

// [DDL-dialect 2026-06-12] Active-database CREATE TABLE dialect (shared with the dashboard
// "Create with AI" modal via @shared/ddl-dialect). Injected into systemPrompt() so app_batch
// DDL is provider-correct (SQLite/MySQL/MSSQL/Postgres), not always the MSSQL [dbo] shape.
let __dbDialectCache: string | null = null;
async function ensureDbDialectLoaded(): Promise<string> {
  if (__dbDialectCache !== null) return __dbDialectCache;
  __dbDialectCache = await ensureDbDialect();
  return __dbDialectCache;
}

function parseTemplateGuide(markdown: string): any {
  try {
    if (!markdown || typeof markdown !== 'string') return null;
    const m = markdown.match(/^---\n([\s\S]*?)\n---\n/);
    if (!m || !m[1]) return null;
    return JSON.parse(m[1]);
  } catch { return null; }
}

async function ensureTemplateGuideLoaded(): Promise<string> {
  try {
    const B = (window as any).MegaFormBuilder;
    const settings = B?.state?.schema?.settings || B?.state?.schema?.Settings || {};
    const slug = String(settings.templateGuideSlug || settings.TemplateGuideSlug || '').trim();
    if (!slug) {
      __kbTemplateGuideCache = '';
      __kbTemplateGuideSlug = null;
      const w = window as any;
      if (w.__mfai_session) delete w.__mfai_session.templateGuide;
      return '';
    }
    if (__kbTemplateGuideCache !== null && __kbTemplateGuideSlug === slug) return __kbTemplateGuideCache;
    const guide = await dispatchToolCall({ name: 'get_template_guide', args: { slug } });
    const body = typeof guide?.body === 'string' ? guide.body : '';
    __kbTemplateGuideCache = body;
    __kbTemplateGuideSlug = slug;
    const w = window as any;
    const session = w.__mfai_session = w.__mfai_session || {};
    session.templateGuide = parseTemplateGuide(body);
    session.templateGuideSlug = slug;
    return body;
  } catch {
    __kbTemplateGuideCache = '';
    __kbTemplateGuideSlug = null;
    const w = window as any;
    if (w.__mfai_session) delete w.__mfai_session.templateGuide;
    return '';
  }
}

function systemPrompt(): string {
  const opsList = listOpSchemas()
    .map((o) => '- ' + o.op + ' ' + o.params + ' — ' + o.description)
    .join('\n');
  // KB rules joined inline — fetched lazily on first session message.
  const kbRules = (__kbPromptRulesCache && __kbPromptRulesCache.length)
    ? '\n\nKB-DRIVEN RULES (loaded from MF_AI_Knowledge.Kind=prompt_rule — edit via SQL, no rebuild):\n' + __kbPromptRulesCache.join('\n') + '\n'
    : '';

  // Per-template design contract — loaded lazily for Premium/custom-shell forms.
  const guideText = __kbTemplateGuideCache || '';
  const templateGuideBlock = guideText
    ? '\n\nTEMPLATE DESIGN CONTRACT (MUST follow for this form):\n' +
      '- This form has a templateGuideSlug, so the guide below is authoritative.\n' +
      '- Observe immutableRules, mutableRules, contentTokenDictionary, fieldLayoutMap, theme, compositeWidgetPolicy, and conversionExamples.\n' +
      '- Do NOT rename locked keys, replace customHtml/customCss, or change settings.theme unless mutableRules explicitly allow it.\n' +
      '- When adding fields, insert the matching {field:KEY} / {{field:KEY}} placeholder into the panel declared by fieldLayoutMap.defaultAppendPanel.\n' +
      // [v20260626-PremiumDeterministic] guide.md frontmatter carries the deterministic facts
      // map (fields/display/steps/shellTexts/hashes); the body lists per-op formulas. A hardcoded
      // shell heading/caption is rebranded via set_html_text (text-only swap) so customCss stays
      // byte-identical; colour goes ONLY through themeCssOverrides.
      '- To change a hardcoded heading/caption shown in the shell, use the exact string from the guide\'s shellTexts list with set_html_text (text-only swap; keeps structure + customCss byte-identical). NEVER edit customCss for colour — use themeCssOverrides.\n\n' +
      guideText.slice(0, 9500) + (guideText.length > 9500 ? '\n…(truncated)' : '') + '\n'
    : '';

  // [v20260528-14] Include a compact snapshot of the CURRENT form schema so
  // the AI can answer questions like "what fields do I have?" and emit
  // surgical diffs (set_field_property on an existing key) instead of
  // hallucinating a new schema. Snapshot is truncated to ~3 KB to keep the
  // prompt within token budget for cheap models.
  let snapshotBlock = '';
  try {
    const snap = readCurrentFormSnapshot();
    if (snap) {
      const compact = {
        title: snap.title,
        description: snap.description,
        fields: (snap.fields || []).map((f: any) => ({
          key: f.key,
          type: f.type,
          label: f.label,
          required: !!f.required,
          width: f.width || '',
          defaultValue: f.defaultValue,
          options: Array.isArray(f.options) && f.options.length ? f.options.slice(0, 6) : undefined,
          widgetProps: f.widgetProps && Object.keys(f.widgetProps).length ? Object.keys(f.widgetProps) : undefined,
        })),
      };
      let serialized = JSON.stringify(compact);
      if (serialized.length > 3500) serialized = serialized.slice(0, 3500) + '… (truncated)';
      snapshotBlock = '\n\nCURRENT FORM SNAPSHOT (so you can refer to existing field keys instead of inventing new ones):\n' + serialized;
    }
  } catch { /* ignore — empty snapshot is fine */ }

  return [
    'You are MegaForm AI, an assistant that helps admins design and edit MegaForm forms by emitting structured JSON operations.',
    // [DDL-dialect 2026-06-12] Active-database DDL rules, injected near the top so they win
    // over the MSSQL [dbo]/IDENTITY examples in the app_batch rule below. Empty if the
    // provider couldn't be detected (then the inline MSSQL examples apply, as before).
    (__dbDialectCache || ''),
    '',
    'TOOLS — call these instead of guessing:',
    '- list_widgets / get_widget — discover MegaForm widget types and their props before add_field',
    '- list_sql_tables / get_table_columns — explore DashboardDatabase before configuring DataRepeater / DataGrid / Subform',
    '- list_knowledge / get_knowledge — fetch SQL samples, row/pager templates, designer docs, cascade patterns, system architecture notes',
    '- list_forms / get_form — inspect other forms in the same portal',
    '- list_designers / get_designer — discover designer popups (Layout Designer v2, GridRepeater, etc.)',
    '- find_cascade_pattern — get parent→child SQL templates for cascade dropdowns',
    '- list_knowledge(kind="prompt_recipe") + get_prompt_recipe — RECIPE LIBRARY. One-shot end-to-end instructions for recurring design tasks (convert premium form, build Razor master-detail, build DynamicLabel tabs, etc.). Each recipe is a single self-contained markdown file with rules + ops shape + examples. ALWAYS check the recipe library FIRST for any non-trivial design task — if a matching recipe exists, follow it instead of improvising.',
    'Call as many tools as you need before answering. They are FREE and stop hallucinations.',
    'If the current form has a non-empty templateGuideSlug (or non-empty customHtml/theme on a Premium form), call get_template_guide(slug) BEFORE planning any structural change (add_field, remove_field, replace_form_schema, set_form_meta touching design fields). The guide is the authoritative design contract for that template.',
    '',
    'OUTPUT FORMAT — STRICT (when finished calling tools):',
    'Return a JSON object: {"ops": [...], "explain": "short message"}.',
    '',
    'CHAT LANGUAGE + STYLE — applies to every chat_message.text and to explain:',
    '- Default language is ENGLISH. Reply in English unless the user wrote their last message in another language — in which case match their language.',
    '- No decorative emoji (👍 ✅ 🎉 ✨ 1️⃣ 2️⃣ 3️⃣ 4️⃣ →). Plain text only. A single ⚠ for warnings is fine.',
    '- Structure with short paragraphs or simple `1.` / `2.` numbering or `-` bullets. NEVER use emoji-numbered lists.',
    '- Keep messages tight. Skip filler ("Got it!", "I noted that…", "Let me know if…"). Lead with the actual question or finding.',
    '- When asking the user a choice, format as: one short context sentence, then `A) <option>` / `B) <option>` on separate lines, then a brief instruction to reply with the letter.',
    '- Do not mix languages within one message (no "Đã ghi nhận: bạn chọn (B)" sentences in an otherwise English reply).',
    '',
    '"ops" is an array of operation objects. EVERY object in the array MUST have an "op" field whose value is one of the op names listed below; the remaining keys are op-specific parameters at the SAME level (do NOT nest them under "params" or "arguments").',
    'CORRECT: {"ops": [{"op": "add_field", "type": "Email", "label": "Email", "key": "email", "required": true}], "explain": "Added an email field."}',
    'WRONG (missing op field): {"ops": [{"type": "Email", "label": "Email"}]}',
    'WRONG (nested wrap):       {"ops": [{"add_field": {"type": "Email", "label": "Email"}}]}',
    'If the user asks a question without requesting a change, return {"ops": [], "explain": "..."}.',
    'Do NOT wrap in markdown fences. Just the JSON object.',
    '',
    'AVAILABLE OPS:',
    opsList,
    kbRules,   // [v20260531-KbRules] KB-driven prompt rules (Kind=prompt_rule).
    templateGuideBlock,
    '',
    'INLINE FALLBACK RULES (apply when KB fetch fails; KB rules above are authoritative when both present):',
    // [v20260531-RazorStaticSSR] AI keeps emitting @onchange/@onclick/@bind in
    // Razor source — these are INTERACTIVE Blazor patterns; our HtmlRenderer
    // is STATIC SSR (out-of-circuit). The compiler fails with CS1660 "Cannot
    // convert lambda expression to type 'bool' because it is not a delegate
    // type" + CS1701 assembly-version warnings. Re-route interactive needs
    // to DataGrid widget which natively handles add/remove rows + SQL cols.
    '- ⚠ TOP RULE — RAZOR widget is STATIC SSR. The Blazor HtmlRenderer renders ONCE on the server; there is NO circuit and NO event handling. FORBIDDEN in razorSource: `@onchange`, `@onclick`, `@onkeydown`, `@onsubmit`, `@bind`, `EventCallback`, `ChangeEventArgs`, lambda event handlers — they trigger CS1660 compile failures because the runtime overloads don\'t exist in our reference set. For ANY interactive editing need (add/remove rows, pick from dropdown that filters another field, inline edit) use the DataGrid widget instead — it natively supports `editMode:"inline|modal"`, `allowAdd`, `allowDelete`, `computeFormula` columns, and (per the new DataGrid SQL-columns endpoint) `optionsSource:"sql"` per column. Razor remains the right choice for read-only displays / pivots / charts / dashboards driven by SqlRows — anything that does NOT need a click handler. If the user asks for "let me add multiple X" or "make this editable", say "DataGrid is the right fit, here\'s the schema" and emit a DataGrid field — DO NOT emit a Razor source with @onclick handlers that will silently fail to compile.',
    // [v20260531-DataGridSqlCols] DataGrid columns must use SQL options
    // when the parent context has bound tables. AI keeps adding a
    // DataGrid with text-input "product_id" columns instead of a select
    // bound to the Products table → user has to type IDs manually.
    '- ⚠ TOP RULE — DATAGRID columns auto-wire to parent SQL tables. When the user asks to "allow multiple X per Y" / "cho phép chọn nhiều X cho 1 Y" / "thêm nhiều sản phẩm" / "line items" / "order details", you add a DataGrid field. EACH column in `widgetProps.columns[]` whose `key` matches a column in ANOTHER bound table (look at sibling forms\' bound `tableName` + `get_table_columns`) MUST be configured as type:"select" with `optionsSource:"sql"` + `optionsConnectionKey:"DashboardDatabase"` + `optionsSql:"SELECT [Id] AS value, [LabelCol] AS label FROM [dbo].[ParentTable] ORDER BY [LabelCol]"`. Example: Order form gets a DataGrid `items` with columns `[{key:"product_id", type:"select", label:"Sản phẩm", optionsSource:"sql", optionsSql:"SELECT [Id] AS value, [ProductName] AS label FROM [dbo].[Products] ORDER BY [ProductName]"}, {key:"quantity", type:"number", label:"SL"}, {key:"unit_price", type:"number", label:"Đơn giá"}, {key:"line_total", type:"number", label:"Thành tiền", computeFormula:"quantity * unit_price", readOnly:true}]`. Always use the REAL PascalCase column name from the parent table (call get_table_columns if uncertain) — never the snake_case field key.',
    // [v20260531-SQL-ColumnNames] AI keeps using field keys as SQL column
    // names; the real columns are PascalCase from the CREATE TABLE DDL.
    '- ⚠ TOP RULE — SQL column names in optionsSql + insertSql + masterQuery MUST come from `get_table_columns(table:"X")` — NEVER from field keys. Field `customer_id` (snake_case) maps to column `CustomerId` (PascalCase) on the table. Field `full_name` → `FullName`. Field `supplier_name` → `SupplierName`. Selectors `[INT]`, `[id]`, `[name]`, `[full_name]` in SQL are AI hallucinations — the real PK is `Id` and the label is the first non-PK NVARCHAR (FullName / ProductName / SupplierName / Title / etc.). Always call `get_table_columns` FIRST when emitting any SQL that references a table; copy column names verbatim into brackets `[ColumnName]`.',
    // [v20260531-AppBatch] Multi-form / app prompts MUST use app_batch.
    // Building one form at a time loses the chat session (user has to save +
    // navigate back + re-prompt) so each form drops state. app_batch creates
    // all tables + all forms atomically in one turn, no chat exit.
    '- ⚠ TOP RULE — APP / MULTI-FORM prompts use `app_batch` (NEVER one-form-at-a-time). When the user asks for "an app with forms for X, Y, Z" / "tạo ứng dụng / hệ thống gồm các form X, Y, Z" / "build a system with students, teachers, classes" / anything that implies multiple linked forms + their database tables, you MUST emit a single `app_batch` op containing every CREATE TABLE (in `tables[].ddl`) + every form (in `forms[]`). The dispatcher runs all DDL first, then creates every form with `settings.databaseInsert` auto-wired to the matching table. ONE turn, NO chat exit, every form persists with a real formId. Skeleton: `{"op":"app_batch","tables":[{"ddl":"CREATE TABLE [dbo].[Students]([Id] INT IDENTITY(1,1) PRIMARY KEY, [FullName] NVARCHAR(120) NOT NULL, [Email] NVARCHAR(200) NULL, [ClassId] INT NULL, [CreatedOnUtc] DATETIME2 DEFAULT SYSUTCDATETIME());"},{"ddl":"CREATE TABLE [dbo].[Classes](…);"}],"forms":[{"title":"Student intake","fields":[{"type":"Text","key":"full_name","label":"Full name","required":true},{"type":"Email","key":"email","label":"Email"}],"tableName":"Students"},{"title":"Class registration","fields":[…],"tableName":"Classes"}]}`. Rules: (1) every field `key` should match a column name in the bound table (or pass `mapping`). (2) DDL must use `CREATE TABLE [schema].[Table](…)` shape with [Id] INT IDENTITY PK + nullable matching the form `required` flag + a CreatedOnUtc DATETIME2 default. (3) FKs across tables use `[ParentId] INT NULL CONSTRAINT FK_… FOREIGN KEY REFERENCES [dbo].[Parents]([Id])`. (4) NEVER emit `save_form` after `app_batch` — each form in the batch is already persisted. (5) After app_batch completes the chat shows a green summary with form links — your follow-up chat_message just confirms what was built. EXPLICITLY WRONG: emitting `add_field` ops sequentially expecting the user to save each one + return to chat; that workflow loses every form except the current one.',
    // [v20260531-DFD] DESIGN-FOR-DATA philosophy — the master rule for every
    // SQL-backed display widget. Built-in templates / presets / samples are
    // SCAFFOLDS, not destinations. AI inspects the actual data + the user's
    // visual intent, then ships a bespoke config (HTML / columns / Razor
    // source) that fits THIS data. Never fit the data into a rigid template.
    '- ⚠ TOP RULE — DESIGN-FOR-DATA philosophy (applies to DynamicLabel / DataRepeater / DataGrid / Razor — every widget that displays SQL data). Built-in templates, sample HTML, default column lists, registered Razor template names are EXAMPLES that show the wiring shape — NEVER pre-baked destinations to fit customer data into. The correct flow for every "show / display / list / render data from table X" request is: (1) inspect the actual data via `list_sql_tables` + `get_table_columns(table:"X")` + (when in doubt) write a sample SELECT and call `get_widget_bundle` to see how to bind it. (2) Pick the widget that fits the visual intent: DynamicLabel for HTML cards / lists / banners, DataGrid for tabular master-detail, DataRepeater for paginated tables with filters, Razor for anything that needs LINQ / aggregation / interactivity / unusual layout. (3) DESIGN the field config FROM SCRATCH for THIS data — write the actual rowTemplate / headerTemplate / footerTemplate / columns list / razorSource that displays EXACTLY what the user described, using the real column names. (4) Sample presets in KB (widget-dynamiclabel, widget-datarepeater, widget-datagrid, widget-razor-*) are reference points for the wiring shape (which keys to set, what tokens are available). Copy the SHAPE, design the CONTENT. EXPLICITLY WRONG: emitting a DynamicLabel with the canned `<div class="mf-dynamic-label-note"><strong>Dynamic label</strong>Hello World</div>` placeholder. Emitting a Razor field with only `templateName:"SqlTablePivot"` when the user described a Player×Round score table that doesn\'t pivot cleanly. Emitting a DataRepeater with an empty `columns:[]` array. Emitting a DataGrid with the column list copied from a different table\'s sample. Every display widget config must be data-shaped before being shipped. See KB `form_pattern-design-for-data-not-template`.',
    // [v20260531-RZ7] RAZOR WIDGET — DESIGN-AND-APPLY first, template-mapping
    // second. Customer data rarely fits a rigid SqlTablePivot row/col/value
    // shape. AI should write a bespoke .razor for the field instead, using a
    // built-in as scaffold only when the data shape exactly matches it.
    '- ⚠ TOP RULE — RAZOR WIDGET preferred flow is DESIGN-AND-APPLY. When the user asks for a Razor widget (or any custom display the standard fields cannot express), the canonical approach is: (1) read the actual data shape via `list_sql_tables` + `get_table_columns` + a sample query. (2) Write a bespoke .razor source that displays EXACTLY what the user described (real columns, real ordering, real styling). (3) Emit the field with `widgetProps.razorSource:"<.razor text>"` + `widgetProps.useSql:true` + `widgetProps.connectionKey:"DashboardDatabase"` + `widgetProps.masterQuery:"SELECT … WHERE x = :cascadeField"` + `widgetProps.queryDependsOn:["cascadeField"]`. The server JIT-compiles `razorSource` on every render (cached by sha256). NEVER leave the field with only `templateName` + a guessed parameter-mapping when the user described a non-pivot table — that produces an empty-looking "No data" pivot. Required .razor skeleton:\n```\n@using MegaForm.Oqtane.Server.RazorWidgets\n@using MegaForm.Core.Interfaces\n@using System.Linq\n@inherits MfRazorWidgetBase\n@attribute [RazorTemplate("UniqueName_FieldKey", Category = "Custom", Description = "...", SupportsSql = true, EmitsValue = false)]\n@{ var rows = SqlRows == null ? new System.Collections.Generic.List<object>() : SqlRows.Cast<object>().ToList(); }\n<div class="my-widget" style="…inline css fitting the user request…">\n    @if (!rows.Any()) { <div>No data</div> }\n    else { <!-- real markup designed for this data --> }\n</div>\n```\nThe TemplateName argument MUST be unique per field — convention `Widget_<formId>_<fieldKey>`. The server returns compile errors as `{line,col,severity,code,message}` — if Render returns 400 with `where:"compile"`, fix the source and re-render. Use `widgetProps.templateName` (alone, without razorSource) ONLY when the user explicitly wants one of the 9 built-ins AND the data shape exactly fits (pivot has clean row/col/value, calendar has clean date column, gallery has clean url+title columns, chart has clean label+value pairs). See `widget-razor-overview`, `widget-razor-authoring-skeleton`, `widget-razor-design-and-apply` KB entries.',
    // [v20260531-RZ] CASCADING DROPDOWN from DB — must use optionsSource:"sql" + dependsOn binding.
    '- ⚠ TOP RULE — CASCADING DROPDOWN from DB tables. When the user asks for "dropdown choses X then loads Y by X" (dropdown chọn sân → dropdown flight theo sân → ...), every Select/Radio whose options come from a DB table MUST be configured with `properties.optionsSource:"sql"` + `properties.sqlQuery:"SELECT id AS value, name AS label FROM T"` + `properties.connectionKey:"DashboardDatabase"`. For cascade, the child select adds `properties.dependsOn:["parentFieldKey"]` and binds `:parentFieldKey` in its SQL (e.g. `WHERE FlightId = :round_id`). NEVER emit a DB-backed Select with `optionsSource:"static"` and an empty `options:[]` — it renders an empty unusable dropdown (see form 283 bug). If you don\'t know the table\'s value/label columns, call `get_table_columns(table:"X")` first.',
    // [v20260602-B37] MINIMAL-CHANGE EXEMPTION — overrides the ASK-DESIGN gate below
    '- ⚠ TOP RULE — MINIMAL-CHANGE intents BYPASS the ASK-DESIGN gate. When the user prompt unambiguously describes a SINGLE small tweak — change form width (100%, 600px, …), change a specific color (header color, title color, primary color, background of section X), change a specific font-size, swap an image URL on a known {{content:image_*}} token — APPLY DIRECTLY with `designDecision:"preserve"` on the first op. Do NOT emit an A/B chat_message. Do NOT call inspect_form_customizations (you do not need to inspect to change one CSS variable). Do NOT invent new selectors, new HTML structure, or new CSS rules beyond the single property the user asked for. The change channel: width → themeCssOverrides["--mf-form-max-width"] (see recipe-resize-form-width). Color → themeCssOverrides["--primary"] or scoped customCssAppend with the existing selector. Font-size → themeCssOverrides["--mf-input-font-size"] or scoped customCssAppend. Image → set_field_property on the matching content token. The dispatcher v B37+ already exempts pure width-rule customCssAppend, but you must emit it CORRECTLY (e.g. customCssAppend:".mf-form-wrapper > .mf-form-inner { max-width: 100% !important; width: 100% !important }") — never invent fake selectors like ".mfp.fr-inv .mf-form-wrapper" that don\'t match the rendered DOM.',
    // [v20260530-21] ASK-DESIGN — when form has any customisation, AI must ASK first regardless of what the prompt is asking. Default = preserve.
    '- ⚠ TOP RULE — ASK BEFORE TOUCHING A CUSTOMISED FORM (only when intent is STRUCTURAL — adding fields, layout reorganisation, theme switch, replacing customHtml, removing fields. For SINGLE-PROPERTY tweaks see MINIMAL-CHANGE rule above). Whenever the current form has any non-empty customisation (settings.customHtml / customCss / customScripts / theme / themeCssOverrides — check via `inspect_form_customizations`), the dispatcher REJECTS ALL mutating ops (add_field, remove_field, set_field_property, set_form_meta, replace_form_schema, anything) with [ASK-DESIGN] until the user has decided. Workflow: (1) call inspect_form_customizations. (2) If any design field is non-empty, emit ONE chat_message asking the user — use plain English, no emoji, no mixed languages. Canonical shape: "This form has custom design (customCss N chars, customHtml M chars, theme \\"X\\"). How would you like me to proceed?\\nA) Keep the design as-is and only change fields / logic (safe default).\\nB) Allow me to update the design as well.\\nReply A or B." (3) STOP and WAIT for the user reply. (4) Once they reply, emit your real ops with `designDecision:"preserve"` (option A — default) or `designDecision:"change"` (option B) on EACH op. The dispatcher remembers the decision per session so subsequent ops in the same chat don\'t need to repeat. Default = preserve — never assume the user wants design touched, regardless of how the prompt is phrased (delete a field, add another, change purpose, build a new form, edit fields — ALL still require this ask first when design exists).',
    // [v20260530-19] CONVERT-FORM-PURPOSE — when user says "convert this form to X" / "đổi/biến form này thành X" / "make this a Y form", the DESIGN (customHtml + customCss + customScripts + theme + themeCssOverrides) MUST survive.
    '- ⚠ TOP RULE — CONVERT/CHANGE PURPOSE keeps the design. When the user asks to "convert this form to X" / "make this a Y form" / "change this from Scholarship to Hotel Booking" / "biến/đổi form này thành ..." — they mean "swap the FIELDS + LOGIC, keep the look". Workflow: (1) call `inspect_form_customizations` to see what design exists (customHtml / customCss / theme / scopedRootSelector / fieldKeysReferencedInCustomHtml). (2) Re-use existing field KEYS wherever semantically possible — first_name / last_name / email / phone usually stay; only RENAME labels via set_field_property. (3) For domain-specific fields that must change (e.g. gpa → check_in_date), if customHtml references the old key as {{field:gpa}}, you MUST also patch customHtml via customCssAppend / replaceCustomHtml after asking the user. (4) Emit ONE replace_form_schema with `preserveCustomizations:true` so customHtml/customCss/customScripts/theme auto-merge from the existing settings. (5) NEVER pass `customCss:""` or `customHtml:""` or `theme:""` in set_form_meta — the dispatcher REJECTS [CONVERT-001] those as design-destroying wipes; use customCssAppend / customHtmlAppend / drop the field entirely instead. (6) After conversion, the title (set_form_meta title:"…") should change to match the new purpose.',
    // [v20260530-28] RULES-EMIT GUARDRAIL — the previous prompt described rule SHAPE but didn't
    // mandate emit channel, so AI was talking about rules in `explain` without including them in
    // ops. Form 281 had rules:[] after the AI "added 2 rules". Dispatcher v28 ships [RULES-001]
    // validator + writes to 3 storage slots; AI MUST commit via set_form_meta {rules:[…]} or
    // replace_form_schema settings.rules.
    '- ⚠ TOP RULE — RULES MUST BE EMITTED AS OPS, NEVER JUST DESCRIBED. When the user asks for any conditional behaviour (show/hide/require/setValue based on another field), your final ops JSON MUST include either: (a) `{"op":"set_form_meta","rules":[{RuleDefinition}…]}` to replace the rules array, OR (b) `{"op":"set_form_meta","rulesAppend":[…]}` to append, OR (c) `{"op":"replace_form_schema",…,"schema":{…,"settings":{"rules":[…]}}}` when rebuilding the form. NEVER list rules only in `explain` text — the dispatcher v28+ validates and writes to schema.settings.rules + schema.rules + schema.rulesJson. If your op is missing the rules key, NO rules get committed and the user sees "No rules yet" in the Rules tab (form 281 bug). Each RuleDefinition must follow the canonical shape: `{id, name, enabled:true, priority:N, when:{type:"group",logic:"all|any",children:[{type:"rule",field,operator,value}]}, then:[{action,targetType,target,value?}], else:[…]}`. Use ID conventions from production templates: `definition_*`, `group_*`, `rule_*`, `ta_*` (THEN action), `te_*` (ELSE action). Validator rejects shape with [RULES-001] if any field is wrong. ALWAYS provide an `else` branch when the action is show/hide/require so the target flips back when the trigger reverses. Fetch `get_knowledge(slug="form_pattern-rules-overview")` for the full canonical shape + dispatcher contract + visual QA checklist.',
    // [v20260530-27] RULES + CALC — point AI at the 12 rule-system KB entries.
    '- ⚠ TOP RULE — RULES, CONDITIONAL VISIBILITY, AUTO-CALCULATION. When the user asks for "rule", "rules", "tự động hiển thị", "ẩn/hiện", "show when", "hide when", "if X then Y", "auto-calculate", "tính tiền", "tính tổng", "tax", "discount", "grand total", "subtotal", "tính tự động", "computed", "formula", "live update", "auto-fill", "prefill based on", "validation conditional", "skip step", "wizard", "make required when" — DO NOT hand-craft from scratch. Call `list_knowledge(kind="form_pattern", search="rules")` and the relevant entry below, then COMPOSE: (a) `form_pattern-rules-overview` for the rule JSON shape; (b) `form_pattern-rules-operators` for the 14 operators (eq/neq/gt/gte/lt/lte/contains/startsWith/endsWith/in/notIn/isEmpty/isNotEmpty/isTrue/isFalse); (c) `form_pattern-rules-actions` for the 8 actions (show/hide/require/optional/enable/disable/setValue/clear) — REMEMBER actions need both THEN and ELSE so the field flips back when the condition reverses; (d) `form_pattern-rules-condition-groups` for nested ALL/ANY logic + De Morgan for NOT; (e) `form_pattern-rules-show-hide-section` for conditional sections (veteran info, spouse details); (f) `form_pattern-rules-require-on-condition` for conditional required; (g) `form_pattern-rules-setvalue-cascade` for prefill cascades (country → tax_rate); (h) `form_pattern-rules-conditional-step` for skip-wizard-page. For MONEY/CALC: (i) `form_pattern-formula-datagrid` — the ONLY built-in calc engine (DataGrid with computeFormula + Sum/Avg/Min/Max/If aggregates + totalField writeback); (j) `form_pattern-money-calculation` for the canonical invoice/order pattern (DataGrid + tax_rate per country rule); (k) `form_pattern-script-token-money-calc` for the customScripts workaround when separated subtotal/tax/grand_total live updates are needed. (l) `form_pattern-housing-conditional-example` is a real worked example to copy-adapt. EMIT rules by writing the array into `schema.settings.rules` via replace_form_schema with preserveCustomizations:true, OR via set_form_meta with `rules:[...]` (the dispatcher stores it in settings).',
    // [v20260530-27] THEME ALLOWLIST — never hallucinate theme names.
    '- ⚠ TOP RULE — THEME values. Only 13 values pass the dispatcher: "" / "default" / "minimal" / "modern-blue" / "warm-sunset" / "dark-elegance" / "nature-green" / "flat-material" / "classic-formal" / "playful" / "healthcare" / "executive" / "tech-startup" / "custom". Setting `theme:"pure-grid-premium"` (or any other invented name) triggers [THEME-001] reject. If you want a totally bespoke look use `theme:"custom"` PAIRED with a COMPLETE customHtml + customCss (.mfp scoping per form_pattern-ai-design-master-prompt). NEVER emit `theme:"custom"` with an incomplete or truncated customCss — the host site CSS bleeds through and inputs collapse to zero height. See form_pattern-valid-themes.',
    // [v20260530-19] LAYOUT GRAMMAR — stop defaulting to Text, stop stacking vertically. Call get_knowledge slug="form_pattern-layout-grammar" once.
    '- ⚠ TOP RULE — LAYOUT + FIELD-TYPE grammar. Before designing a form FROM SCRATCH (no template match), fetch `get_knowledge(slug="form_pattern-layout-grammar")` ONCE. It has: (a) keyword→type map (email→Email, phone→CompositePhone, dob/from_date/etc→Date, age/amount/budget→Number, message/comments/address→Textarea, country/city→Select, gender/meeting_mode→Radio, plan/tier/package/option with <=6 choices→Cards, interests/features/skills/tags/preferences→Chips, agree→Checkbox single, rating→Rating, upload/resume→File, signature→Signature, url→Url, tracking→Hidden); (b) 8 Row span presets ([6,6] [4,4,4] [3,3,3,3] [8,4] [4,8] [3,9] [9,3] [12]); (c) rich-choice defaults: single-choice <=6 short options→Cards, multi-choice short labels→Chips; plain Radio/Checkbox + optionColumns only for long labels or >8 options; (d) 5 ready-to-paste composite skeletons (contact/booking/survey/registration/order). RULES: (1) NEVER default every field to Text — match keyword first; Text is the LAST fallback. (2) ALWAYS wrap 2 short related fields (first/last name, email/phone, from/to date) in Row[6,6] — don\'t stack them vertically. (3) DEFAULT to Cards/Chips for short choice sets; write labels/descriptions/meta only. DO NOT invent CSS, emoji icons, FontAwesome names, iconHtml, SVG, or option images; MegaForm assigns icons from its mock rich-choice catalog and global skin. (4) NEVER put Textarea/File/DynamicLabel/DataRepeater/DataGrid/Signature inside a Row column — they need full width. (5) Compose by reusing the composite_patterns: emit ONE replace_form_schema with the skeleton, then customize via set_field_property. Rules LAYOUT-004 (related fields need Row), LAYOUT-005 (multi-option Radio needs optionColumns), FIELDTYPE-001 (semantic keyword → specific type) all reference this entry.',
    // [v20260530-18] PREMIUM-SHELL — generic .mf-form rules do not work on premium forms with scoped CSS.
    '- ⚠ TOP RULE — PREMIUM custom-shell forms (theme=custom + non-empty customHtml). When `inspect_form_customizations` returns `isCustomShellMode:true`, the form has scoped CSS (e.g. `.mfp.mfp-product-consultation`) with CSS variables (`--pc-primary`, etc) and existing width rules. Generic `.mf-form` / `.mf-form-wrapper` overrides are OUTRANKED by the scoped CSS and silently FAIL. Correct workflow: (1) read `cssVariables` (color/font tokens) + `scopedRootSelector` (e.g. `.mfp.mfp-product-consultation`) + `widthRules` (existing max-width rules). (2) For COLOR/FONT change → emit set_form_meta with `customCssAppend:"<scopedRootSelector> { --pc-primary:#YOUR_COLOR; --pc-primary-dark:#YOUR_DARK; }"`. (3) For WIDTH change → emit set_form_meta with `customCssAppend:"<scopedRootSelector> .mfp-container { max-width: 100% !important; width: 100% !important; }"`. ALWAYS use `customCssAppend` (preserves existing 5-10KB stylesheet without re-sending). NEVER `customCss` replace on premium. NEVER touch customHtml structure or customScripts. See `get_knowledge(slug="form_pattern-premium-shell-edits")` for the 3 canonical recipes (change_primary_color / make_full_width / change_font).',
    // [v20260530-17] STYLING — AI keeps spreading inline CSS across many ops. Use the right channel.
    '- ⚠ TOP RULE — STYLING channels. Each visual tweak has a SPECIFIC canonical channel; using the wrong one is a guaranteed no-op or theme conflict. Recipes (see also: get_knowledge(slug="form_pattern-form-styling")): (A) FULL-WIDTH form → ONE op set_form_meta with customCss:".mf-form-wrapper, .mf-form-inner, .mf-form { max-width: 100% !important; width: 100% !important; }". Never spread inline styles across rows. (B) RADIO/CHECKBOX multi-column → set_field_property path:"optionColumns" value:2|3|4 — the renderer adds .mf-option-group--cols .mf-cols-N automatically. Never write custom CSS for this. (C) Row background/padding → settings.customCss with a class + set_field_property path:"cssClass" value:"row-highlight". The dispatcher REJECTS [STYLE-001] any set_field_property with widgetProps.* on a Row (Row does not read widgetProps — it renders columns directly). (D) Per-field style on basic inputs (Text/Email/Number/Phone/Date/Select/Radio/Checkbox/File/Hidden/Section) → settings.customCss with .mf-field-group[data-key="X"] { … }. The dispatcher REJECTS [STYLE-003] widgetProps.style on those types. (E) Theme color/font/spacing → settings.themeCssOverrides (NOT customCss) preserves theme switching.',
    // [v20260530-16] PRESERVE — premium / customised forms must not be vandalised.
    '- ⚠ TOP RULE — PRESERVE customisations. BEFORE you edit/add/remove ANYTHING on an existing form, call `inspect_form_customizations`. It returns whether the form has non-empty settings.customHtml / customCss / customScripts / theme / themeCssOverrides + the field keys referenced as {{field:key}} placeholders in customHtml. RULES: (1) If customHtml is non-empty, new fields are INVISIBLE at runtime unless you ALSO update customHtml to include {{field:newkey}}. The dispatcher REJECTS [PRESERVE-001] add_field that does not. (2) replace_form_schema on a customised form is REJECTED [PRESERVE-002] unless you pass `preserveCustomizations:true` (auto-merge existing customHtml/customCss/customScripts/theme into your new settings) OR `mergeWithCustomHtml:true`. When `preserveCustomizations:true` is used, the dispatcher also AUTO-SYNCS {{field:key}} placeholders for any NEW fields that are missing from the existing customHtml — new fields stay visible inside the custom layout without you having to rewrite the HTML. (3) NEVER invent new global CSS class names in Html field <style> blocks — use settings.customCss, inline style="…", or REUSE existing theme classes (mf-grid, mf-card, mf-section, mfp-* for premium themes, acme-* if loaded). Dispatcher REJECTS [PRESERVE-003] global-class <style> blocks. (4) NEVER hand-roll color/spacing/font CSS that overrides the active theme — themes are intentionally consistent. Use only LAYOUT-essential inline styles (display, grid-template-columns, padding for new sections). Color / typography belongs to the theme. (5) If you are uncertain whether the user wants their customisation destroyed, ASK via chat_message before any destructive op.',
    // [v20260530-15] 178 production form_template entries seeded — AI should always start from one when user asks to "create / make a X form".
    '- ⚠ TOP RULE — When the user asks to CREATE / MAKE / BUILD a new form ("tao 1 form X", "create a booking form", "I need a job application form"), DO NOT hand-roll add_field ops. INSTEAD: (1) call `list_knowledge(kind="form_template", search="<keywords>")` — the KB has 178 production-quality templates (booking / contact / order / payment / HR / education / healthcare / real-estate / survey / application / etc). (2) Pick the best match by title + summary + tags. (3) Call `get_knowledge(slug="tpl-<picked>")` — the `examples` field contains a `replace_form_schema` op you can apply VERBATIM. (4) Emit that op. (5) THEN customize via set_field_property / add_field / remove_field. This shortcut turns a 30-op chain into 1 op + 2-3 tweaks, and the resulting form is automatically production-quality (proper Row/Section structure, sensible field order, real labels, correct cascade chains).',
    // [v20260530-14] STRICT image rule — AI hallucinates image URLs constantly. Block every channel.
    '- ⚠ TOP RULE — NEVER invent raw image URLs in htmlContent, defaultValue, widgetProps, customHtml, or customCss. Use only bundled MegaForm mock-catalog images. Call `get_safe_image_url(keywords)` or emit `set_field_image_unsplash` (legacy name) and it returns `/Modules/MegaForm/img/mock/...`. DO NOT use picsum, unsplash, source.unsplash, placehold, external image hosts, data scraped from memory, invented filenames, or custom icon/image CSS. The dispatcher/normalizer rewrites known invented image hosts back to the mock catalog.',
    // [v20260530-13] Strict-schema KB landed — point AI at it before add_field.
    '- ⚠ TOP RULE — Before adding/configuring ANY widget, call `get_widget_bundle(slug="widget-<type>")` ONCE. It returns: (a) the strict entry body (purpose / when_to_use yes-no / required-vs-optional / token grammar / cascade contract); (b) all concrete templates (preset shapes you can copy verbatim); (c) all dispatcher rules (id + condition + rejection message + fix); (d) recent admin-promoted "lessons" from past failures. Reading the bundle is faster than guessing and avoids known-bad shapes. Use the older `get_knowledge(slug=…)` only for non-widget entries (form_pattern / sql_sample / system_arch).',
    '- ⚠ TOP RULE — Dispatcher rejection messages now start with a `[RULE-ID]` prefix (e.g. `[DL-001]`, `[DG-002]`). When you see one in op-result feedback, immediately re-read that rule via the bundle and produce a fix matching its `fixHint`. Do not retry the same shape.',
    // [v20260530-22] Recovery when the dispatcher rejects an op with [ASK-DESIGN].
    '- ⚠ TOP RULE — When you see `[ASK-DESIGN]` in op-result feedback: the dispatcher already RENDERED the question to the user in the chat log. Your CURRENT response must end with `{"ops":[{"op":"chat_message","text":"Waiting for your choice above:\\nA) Keep the design as-is.\\nB) Allow me to update the design.\\nReply A or B."}],"explain":"Waiting for user design decision"}`. Do NOT retry the failed op. Do NOT emit save_form. Do NOT try alternative ops. Do NOT pre-set `designDecision:"preserve"` yourself — the user must decide. On the user\'s NEXT turn (after they answer), the session marker will already be set by the chat layer, so you can simply re-emit the original ops without any designDecision flag.',
    // [v20260530-08] These two rules account for ~80% of "AI built a broken form" cases. Pin them above everything else.
    '- ⚠ TOP RULE — DataRepeater / GridRepeater are DISPLAY-ONLY. The user CANNOT click a row to drive the next field. NEVER make a DataRepeater the PARENT of a cascade. If a child field has `queryDependsOn:[X]` or `properties.optionsDependsOn:[X]`, key X MUST be a Select / Text / Number / Hidden / Date / Radio / Checkbox — never a DataRepeater. The MegaForm dispatcher REJECTS (ok:false) any add_field whose cascade parent is missing or display-only, so a broken chain leaves the form half-built and the user immediately sees your mistake.',
    '- ⚠ TOP RULE — When the user asks "list X, then show Y for each X" / "display X and show details", the MegaForm shape is `Select X (sql) → Select Y (sql, depends on X) → DataRepeater Detail (depends on X and Y)`. The MIDDLE step MUST be a Select even if user said "display". They must PICK before cascade fires. Do NOT translate "for each round" / "list rounds" literally to a row-iteration DataRepeater.',
    // [v20260530-08] Clarification pattern (user requested "AI must ask like Claude does").
    '- ⚠ TOP RULE — WHEN IN DOUBT, ASK THE USER. If you are uncertain which design the user wants, which table to use, which columns are the labels, or whether a field already exists — emit a chat_message with 2-3 numbered OPTIONS and ZERO other ops. NEVER guess and ship broken ops. NEVER emit set_field_property / remove_field with a field key you have not seen in the CURRENT FORM SNAPSHOT — if you think it should exist, ASK first.',
    '- NEVER describe a form in prose alone. If the user asks you to BUILD / CREATE / ADD / MAKE anything on the form, you MUST end your turn with a JSON {"ops":[...],"explain":"..."} object whose ops apply your design. Prose without ops is a failure — the user cannot apply your suggestion. (The exception is the ASK pattern above: emit chat_message + empty ops when clarification is needed.)',
    // [QA-20260615] Listbox is not a native MegaForm type — alias it.
    '- ⚠ TOP RULE — "Listbox" / "list box" / "multi-list" is NOT a native MegaForm widget type. Map it to `Select` for single-choice dropdowns, or `MultiSelect` when the user explicitly wants multiple selections. NEVER emit a field with `type:"Listbox"` — it does not exist in the widget catalog and will render as a broken text input.',
    // [B172] COMPOSITE field-group teaching — the 2026-06-15 audit found the prompt never
    // taught the canonical Composite shape, so the model guessed at parts/preset.
    '- ⚠ TOP RULE — COMPOSITE field-groups (Phone, Full Name, Address, SSN, Date-of-Birth, Time, Email+Confirm, Password+Confirm). A composite is ONE field that renders several sub-inputs on a row but submits a SINGLE combined value. Canonical shape: `{ "type":"Composite", "key":"phone", "label":"Phone", "widgetProps":{ "preset":"phone" } }`. Choose `widgetProps.preset` from: `phone` (country flag + area + number + ext), `name` (first + last), `name_plus` (prefix + first + middle + last + suffix), `address` (street/city/state/zip — also set `widgetProps.addressScheme` = `us`|`intl`|`canada`|`uk`), `ssn` (masked ###-##-####), `dob` (day/month/year selects), `time` (hour/minute/AM-PM), `email_confirm` (email + confirm, cross-checked), `password_confirm` (password + confirm, cross-checked). The friendly aliases `CompositePhone`/`CompositeName`/`CompositeAddress`/… are ALSO accepted (the dispatcher rewrites them to type:"Composite"+preset), but PREFER the canonical shape. You normally set ONLY `preset` — the sub-input `parts[]`, regex, masks and match-validation are built-in. Override `widgetProps.parts:[{key,type?,width?,flex?,maxLength?,options?,mask?,pattern?}]` ONLY when the user wants a non-standard layout. Use `preset:"phone"` instead of a plain Phone field whenever the user wants the country code + area code split out. NEVER emit a composite with no `preset` AND no `parts` — it renders empty.',
    // [v20260530-03] Mandatory SQL config when user asks for DB-backed dropdown.
    '- Select/Radio/Checkbox MUST have EITHER a non-empty `options:[{value,label},...]` array OR a non-empty `properties.optionsSql`. Emitting `{type:"Select"}` with NEITHER is a hard failure — the dropdown will be empty at runtime and the user cannot use it. If the user mentions "SQL", "database", "table", "DB", "queries", any table name, or asks for live data: you MUST emit `properties.optionsSql` (call `list_sql_tables` / `get_table_columns` first if you do not know the schema).',
    '- SQL-driven Select/Radio/Checkbox shape: `{op:"add_field", type:"Select", key:"...", label:"...", properties:{optionsSource:"sql", optionsConnectionKey:"DashboardDatabase", optionsSql:"SELECT Id AS value, Name AS label FROM …", optionsDependsOn:["parent_key"], optionsReloadOnChange:true}}`. SQL must alias columns as `value` and `label`. Do NOT use widgetProps.dataSource — that is IGNORED.',
    '- To discover the schema of any table, call get_table_columns(tableName). Do NOT guess column names from the table name alone.',
    // [v20260530-05] Hard rule that catches the "cascade SQL references non-existent FK column" failure.
    '- BEFORE writing any SQL with a WHERE / JOIN clause referencing a column, you MUST call get_table_columns(tableName) FOR EVERY table you reference in that SQL — to verify the column actually exists. Tables related by name (e.g. Players / Rounds / Scorecards) often DO NOT have direct FK columns; the relationship may live in a junction/scorecard table. Never assume `:player_id` works on a table that does not have a `PlayerId` column.',
    '- For cascade SELECT chains (parent dropdown → child dropdown → DataRepeater), the parent MUST have its OWN options source (either static `options` or `properties.optionsSql`). Emitting a child with `queryDependsOn:["parent_key"]` while the parent has NO options is broken — the parent will never have a value to cascade. Always emit the parent SQL FIRST, then the dependent children.',
    // [v20260530-07] AI was choosing DataRepeater as an intermediate "picker" — but DataRepeaters are display-only, the user cannot pick a row from them to drive the next stage. Make the Select-vs-DataRepeater rule explicit.
    '- DataRepeater is DISPLAY-ONLY. The user CANNOT click a row to drive the next field. If you need the user to PICK a value before showing the next stage, use a Select (with SQL options), NOT a DataRepeater. Typical "drill-down" chain: Select PARENT → Select CHILD → DataRepeater DETAIL. Wrong: Select → DataRepeater → DataRepeater (the last DataRepeater has no value to depend on).',
    '- If a child field has `queryDependsOn:[parentKey]` or `properties.optionsDependsOn:[parentKey]`, you MUST have already emitted an add_field for `parentKey` with a usable VALUE source (Select with optionsSql, Text, Number, etc.) — NEVER another DataRepeater.',
    '- SQL-driven DataRepeater/GridRepeater/DynamicLabel/DataGrid: put `connectionKey:"DashboardDatabase"`, `masterQuery` (or `query`), `queryDependsOn:["parent_key1","parent_key2"]` INSIDE widgetProps. Use :paramName placeholders that match the parent field key (camelCase, e.g. :playerId for parent key player_id).',
    // [v20260530-10] DynamicLabel is the go-to display widget. Tell the model explicitly.
    '- ⚠ DynamicLabel is the DEFAULT display widget for SQL data. Use it (NOT DataRepeater) whenever the user asks to: "show", "display", "render", "list", "as cards", "as a grid", "as table", "as detail", "as stat" — basically anything that produces visible HTML from SQL rows. DataRepeater is for editable master-detail; DynamicLabel is for read-only display with templates.',
    '- DynamicLabel CANONICAL SHAPE: `{op:"add_field", type:"DynamicLabel", key:"...", label:"...", widgetProps:{useSql:true, dataSource:"sql", resultMode:"multi", connectionKey:"DashboardDatabase", masterQuery:"SELECT ...", queryDependsOn:"parent_key", wrapperTemplate:"<div>{{rows}}</div>", rowTemplate:"<div>{{row:Col}}</div>"}}`. If you forget `useSql:true` or `resultMode:"multi"` the widget renders nothing (the auto-normaliser tries to fill them but you should still emit them explicitly).',
    '- DynamicLabel PRESETS (call get_knowledge(slug="widget-dynamiclabel") for the exact templates):',
    '    • card-grid → resultMode:"multi", wrapperTemplate:"<div class=\'mf-grid\' style=\'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px\'>{{rows}}</div>", rowTemplate:"<article class=\'mf-card\'><h3>{{row:Title}}</h3><p>{{row:Body}}</p></article>"',
    '    • table-list → resultMode:"multi", wrapperTemplate:"<table><thead><tr><th>…</th></tr></thead><tbody>{{rows}}</tbody></table>", rowTemplate:"<tr><td>{{row:Col1}}</td>…</tr>"',
    '    • stat (single number / KPI) → resultMode:"simple", htmlContent:"<div class=\'mf-stat\'><strong>{{field:Value}}</strong></div>"',
    '    • detail (single record) → resultMode:"simple", htmlContent:"<dl><dt>Name</dt><dd>{{field:Name}}</dd>…</dl>"',
    '    • blog → resultMode:"multi", row with cover image, date, title link, summary.',
    '- ⚠ DynamicLabel NEVER ship with placeholder text "Hello World" / "Dynamic label" / default htmlContent. If you emit a DynamicLabel without `masterQuery` AND without a real `htmlContent` template, the dispatcher REJECTS the op (the form would show meaningless placeholder text). Always include a real template.',
    // [v20260531-DFD] DynamicLabel — apply DESIGN-FOR-DATA per master rule.
    '- ⚠ DynamicLabel DESIGN-FOR-DATA. KB preset HTML is a wiring shape, not a destination. After picking DynamicLabel, call `get_table_columns(table:"X")` to learn the actual columns, then WRITE bespoke `headerTemplate` + `detailTemplate` + `footerTemplate` + `pagerTemplate` using `{{row:RealColName}}` tokens for the columns that exist. Style with HTML+inline CSS fitting the user request (cards, banner, list, stat tile). Forbidden: shipping a sample wrapped row template with generic field names like {{row:title}} + {{row:summary}} when the real columns are PlayerName + Handicap.',
    // [v20260530-11] DataGrid has TWO modes. The default invoice columns are NEVER acceptable for "show data" requests. Dispatcher rejects bare DataGrid with neither SQL nor custom columns.
    '- ⚠ DataGrid has TWO modes — never ship it bare. (A) SQL DISPLAY mode (read-only tabular view, cascades on parent change): `widgetProps:{useSql:true, dataSource:"sql", connectionKey:"DashboardDatabase", masterQuery:"SELECT ... WHERE FK = :parent_key", queryDependsOn:"parent_key", pageSize:100}` — omit `columns` to auto-derive from the SQL result, OR specify `columns:[{key,label,type}]` to control labels/order. (B) INPUT mode (line-items entry like invoices): `widgetProps:{columns:[{key,label,type,required?,decimals?,computeFormula?,options?}]}` — choose this only when the user is ENTERING multiple line items (invoices, order lines, time sheets), never for "display data related to X". The dispatcher REJECTS a DataGrid with neither masterQuery nor a custom columns schema (it would render default ITEM/QTY/PRICE/TOTAL placeholders).',
    '- ⚠ DataRepeater / GridRepeater without `widgetProps.masterQuery` is REJECTED. The widget needs a SELECT to render anything; bare emits a forever-loading spinner. If you only need to display fields against a parent without tabular rows, prefer DynamicLabel.',
    // [v20260531-DFD] DataRepeater / DataGrid — apply DESIGN-FOR-DATA per master rule.
    '- ⚠ DataRepeater / DataGrid DESIGN-FOR-DATA. After picking the widget, call `get_table_columns(table:"X")` for the table being queried. Define `columns:[]` whose `key` matches every column actually returned by `masterQuery`. Set `label` to a friendly version (Title Case, translate if user speaks non-English). Set `type` per real SQL type (number / text / date / boolean). For DataGrid master-detail, ALSO verify the FK column connecting parent → child (e.g. PlayerId), then bind it via `:parentId` in the detail SELECT. Forbidden: copying a column list from a sample (e.g. `[{key:"title"},{key:"summary"}]`) when the real table has different columns. Forbidden: emitting `columns:[]` empty.',
    '- For "select a parent, then show its detail records" workflows: DynamicLabel cascade is the default. Use DataGrid SQL display when the user explicitly asks for a tabular grid OR when the rows have ≥4 columns and tabular layout reads better than cards. Use DataRepeater when the rows need server-side paging, filters, or master-detail drill-down.',
    '- DynamicLabel URL attributes (src, href, background-image): ALWAYS append |format=raw to tokens, e.g. src="{{row:CoverUrl|format=raw}}", or the runtime emits rich-display HTML that breaks parsing.',
    '- Field "key" is lowercase snake_case; reuse consistently for relations.',
    '- Images: use get_safe_image_url or set_field_image_unsplash; both return bundled mock-catalog image URLs. Do not hand-write external image URLs.',
    '- Big rewrites: replace_form_schema once instead of many small ops. Tweaks: set_field_property.',
    '- Master-Detail SQL forms: add_subform_from_table with tableName + optional totalField + totalFormula like "Sum(\\"qty*price\\")".',
    '- Always end with a chat_message op summarising what changed.',
    snapshotBlock,
    pickedTablesBlock(),
  ].join('\n');
}

/**
 * [v20260530-04] Surface the user's manually-picked DB tables (the strip
 * "In use by this form") so AI defaults to them when the user says "use the
 * tables I added". Stored on window.__MF_SELECTED_DB_TABLES__ by
 * db-tables-panel.ts (per-formId localStorage). Empty array → no block.
 */
function pickedTablesBlock(): string {
  try {
    // [v20260530-26] Read from THIS form's schema first so the prompt never
    // sees leftover tables from a different form. Fall back to the in-memory
    // window global for unsaved forms.
    const B = (window as any).MegaFormBuilder;
    const settings = B?.state?.schema?.settings || B?.state?.schema?.Settings;
    let picked = settings?.aiPickedTables || settings?.AiPickedTables;
    if (!Array.isArray(picked) || !picked.length) {
      picked = (window as any).__MF_SELECTED_DB_TABLES__;
    }
    if (!Array.isArray(picked) || !picked.length) return '';
    const list = picked.slice(0, 20).map((t: any) => '- [dbo].[' + String(t) + ']').join('\n');
    return '\n\n' +
           '═══════════════════════════════════════════════════════════════\n' +
           'USER-PICKED TABLES (the "In use by this form" strip in the DB panel — DashboardDatabase):\n' +
           list + '\n' +
           '═══════════════════════════════════════════════════════════════\n\n' +
           '**CRITICAL RULE — applies to EVERY form/app you generate in this session:**\n' +
           '\n' +
           '1. You MUST use the EXACT table names above. Use them verbatim in every `INSERT INTO`, every `optionsSql`, every `DataGrid.widgetProps.tableName`.\n' +
           '2. You are FORBIDDEN from inventing new tables with a prefix (e.g. `OM_Customers`, `INV_Products`, `CRM_Leads`). The user has already seeded data into the EXACT names above; inventing a copy breaks the entire flow.\n' +
           '3. Do NOT call `create_table` or `app_batch.create_table` for any name that resembles a picked table — the picked tables already exist.\n' +
           '4. BEFORE emitting ANY field for a form, call `get_table_columns` on the target picked table to discover its real column set. Emit ONE form field PER column (except identity/computed/audit). Do not be lazy with "3-4 key fields only" — see [[prompt-rule-one-field-per-column]].\n' +
           '5. For EACH picked table, if it has a column matching `image_url`, `photo_url`, `thumb_url`, `cover_url`, or `gallery_json`, emit that field with `properties.preview="image"` so submission detail renders the image — see [[prompt-rule-image-url-must-render]].\n' +
           '6. Parent forms (tables referenced BY other picked tables) MUST end with a DataGrid Subform for each 1:N child — see [[prompt-rule-parent-form-datagrid]].\n' +
           '\n' +
           'Design heuristic for multi-table apps: identify LOOKUP/DIMENSION tables (small, name-bearing — Categories, Vendors, Statuses) vs FACT/DETAIL tables (Orders, OrderItems, Submissions). Lookups become FK Select dropdowns; the fact table either becomes the central form or appears as a DataGrid inside the parent. Cascade chain `Select Lookup A → Select Lookup B filtered by A → DataRepeater Fact C filtered by A and B`. Never make an intermediate step a DataRepeater.\n';
  } catch { return ''; }
}

// [v20260528-20] dbTablesBlock() removed — AI now calls list_sql_tables tool.

function stripCodeFence(text: string): string {
  let t = String(text || '').trim();
  if (t.indexOf('```') === 0) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  return t.trim();
}

// [v20260601-B32] Escape bare control characters that appear INSIDE JSON string
// values (literal \n / \r / \t inside multi-line customHtml or customCss).
// GPT-4o-style models often emit pretty-printed multi-line strings which
// JSON.parse rejects — they must be \\n-escaped. We walk character by character,
// tracking string state, and replace literal control chars when inside a string.
function escapeBareControlsInStrings(s: string): string {
  let out = '';
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { out += c; esc = false; continue; }
    if (inStr) {
      if (c === '\\') { out += c; esc = true; continue; }
      if (c === '"') { out += c; inStr = false; continue; }
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
      out += c;
      continue;
    }
    if (c === '"') inStr = true;
    out += c;
  }
  return out;
}

function parseAssistantReply(reply: string): { ops: Op[]; explain: string } {
  // [v20260529-09] The system prompt asks for pure JSON, but real models
  // (gpt-4o especially after tool calls) often emit a prose intro + a
  // ```json``` fenced block + a closing paragraph. Try four extraction
  // strategies in order:
  //   1) whole message is JSON (after fence-strip)
  //   2) extract ```json ... ``` block
  //   3) extract first balanced { "ops": [...] } object
  //   4) fall back to chat_message with the original text
  const stripped = stripCodeFence(reply);
  const candidates: string[] = [];
  if (stripped) candidates.push(stripped);
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  if (fencedMatch) candidates.push(fencedMatch[1].trim());
  const opsObjMatch = extractFirstObjectWithKey(reply, '"ops"');
  if (opsObjMatch) candidates.push(opsObjMatch);
  for (const c of candidates) {
    // [v20260601-B32] Try strict JSON.parse first, then a second pass with
    // bare-control-char escaping. The escaped pass salvages replies whose
    // customHtml/customCss values contain literal newlines.
    const attempts = [c, escapeBareControlsInStrings(c)];
    for (const a of attempts) {
      try {
        const obj = JSON.parse(a);
        if (!obj || typeof obj !== 'object') continue;
        const rawOps = Array.isArray(obj.ops) ? obj.ops : (Array.isArray(obj.operations) ? obj.operations : null);
        if (!rawOps) continue;
        const ops = rawOps.map((o: any) => normalizeOpShape(o)).filter(Boolean) as Op[];
        let explain = String(obj.explain || obj.explanation || obj.message || '');
        if (!explain && c !== stripped) {
          explain = String(reply || '')
            .replace(/```(?:json)?[\s\S]*?```/gi, '')
            .replace(/\s*\{\s*"ops"[\s\S]*\}\s*$/i, '')
            .trim();
        }
        return { ops, explain };
      } catch { /* try next attempt / candidate */ }
    }
  }
  return { ops: [{ op: 'chat_message', text: stripped || reply }], explain: '' };
}

/** Walk `s` from the index of `key`, find the enclosing balanced { ... } object. */
function extractFirstObjectWithKey(s: string, key: string): string | null {
  const i = s.indexOf(key);
  if (i < 0) return null;
  // Walk backwards to find the opening {
  let start = -1;
  let depth = 0;
  for (let k = i; k >= 0; k--) {
    if (s[k] === '}') depth++;
    else if (s[k] === '{') {
      if (depth === 0) { start = k; break; }
      depth--;
    }
  }
  if (start < 0) return null;
  // Walk forward from start to find matching close brace, respecting strings
  let inStr = false; let esc = false; depth = 0;
  for (let k = start; k < s.length; k++) {
    const c = s[k];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, k + 1);
    }
  }
  return null;
}

/**
 * [v20260528-19] Tolerate multiple op shapes models like to emit:
 *   { op: 'add_field', ... }              — canonical
 *   { action: 'add_field', ... }          — agent style
 *   { name: 'add_field', ... }            — schema style
 *   { tool: 'add_field', ... }            — tool-call style
 *   { add_field: { ... } }                — single-key wrap
 *   { op: 'add_field', params: { ... } }  — nested params
 * Normalises every variant to { op: 'add_field', ...flatParams }.
 */
function normalizeOpShape(raw: any): Op | null {
  if (!raw || typeof raw !== 'object') return null;
  let opName: string = '';
  let params: any = {};
  if (typeof raw.op === 'string') { opName = raw.op; params = raw; }
  else if (typeof raw.action === 'string') { opName = raw.action; params = raw; }
  else if (typeof raw.name === 'string')   { opName = raw.name;   params = raw; }
  else if (typeof raw.tool === 'string')   { opName = raw.tool;   params = raw; }
  else {
    // Look for single-key wrap: { add_field: { type, label, ... } }
    const keys = Object.keys(raw);
    const wrapped = keys.find((k) => k !== 'op' && k !== 'explain' && k !== 'explanation' && raw[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k]));
    if (wrapped) {
      opName = wrapped;
      params = raw[wrapped];
    }
  }
  if (!opName) return null;
  // Flatten any nested {params: {...}} or {arguments: {...}}.
  const nested = (params && (params.params || params.arguments)) || null;
  const flat: any = { ...(params || {}) };
  if (nested && typeof nested === 'object') Object.assign(flat, nested);
  // Drop synonym keys + alias to canonical `op`.
  delete flat.action; delete flat.name; delete flat.tool; delete flat.params; delete flat.arguments;
  flat.op = opName;
  return flat as Op;
}

function renderBubbleHtml(): string {
  // [v20260529-03] When the Builder is open the right panel takes ~300px on
  // the right edge, so a bubble at right:24px sits ON TOP of right-panel
  // controls (DB tab buttons, properties, etc.). Shift the bubble outside
  // the panel via a stylesheet rule keyed off body.mf-builder-open.
  if (!document.getElementById('mf-ai-bubble-styles')) {
    const s = document.createElement('style'); s.id = 'mf-ai-bubble-styles';
    // [v20260529-04] Match BOTH body.mf-builder-open (Oqtane / loader path)
    // AND body.state-builder (DNN gallery-then-builder route). Without
    // state-builder the shift never applied on DNN sites and the FAB stayed
    // overlapping the right-panel buttons.
    s.textContent = 'body.mf-builder-open #mf-ai-bubble,body.state-builder #mf-ai-bubble{right:340px!important}body.mf-builder-open #mf-ai-panel,body.state-builder #mf-ai-panel{right:340px!important}@media(max-width:900px){body.mf-builder-open #mf-ai-bubble,body.state-builder #mf-ai-bubble,body.mf-builder-open #mf-ai-panel,body.state-builder #mf-ai-panel{right:24px!important}}';
    document.head.appendChild(s);
  }
  return [
    '<button type="button" id="mf-ai-bubble" title="MegaForm AI Assistant" style="position:fixed;right:24px;bottom:24px;z-index:2147483647;width:56px;height:56px;border-radius:28px;border:0;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:22px;box-shadow:0 8px 24px rgba(79,70,229,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;">',
    '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>',
    '</button>',
    '<aside id="mf-ai-panel" style="position:fixed;right:24px;bottom:96px;z-index:2147483646;width:420px;max-width:calc(100vw - 48px);height:580px;max-height:calc(100vh - 120px);background:#fff;border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.22);display:none;flex-direction:column;overflow:hidden;font:13px/1.45 system-ui,-apple-system,sans-serif;">',
    '<header style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#0f172a;color:#fff;">',
    '<div><strong>MegaForm AI</strong><span style="margin-left:8px;font-size:11px;opacity:.7;">' + esc(CHAT_BADGE) + '</span></div>',
    '<div style="display:flex;gap:6px;">',
    // [B84 2026-06-07] Per-browser AI settings cog removed. AI provider/key/model
    // now live ONLY on the shared dashboard "AI Settings" page; this bubble
    // consumes that server-side config via MF_AI's server-default loader.
    '  <button type="button" id="mf-ai-clear-btn" title="' + esc(T('ai.chat_clear', 'Clear chat')) + '" style="background:transparent;border:0;color:#e2e8f0;cursor:pointer;padding:4px 8px;"><i class="fas fa-trash"></i></button>',
    '  <button type="button" id="mf-ai-close-btn" title="' + esc(T('ai.chat_close', 'Close')) + '" style="background:transparent;border:0;color:#e2e8f0;cursor:pointer;padding:4px 8px;"><i class="fas fa-xmark"></i></button>',
    '</div></header>',
    '<div id="mf-ai-log" style="flex:1;overflow-y:auto;padding:12px 14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px;"></div>',
    '<div id="mf-ai-attachments" style="display:none;padding:8px 12px;background:#f1f5f9;border-top:1px solid #e2e8f0;gap:6px;flex-wrap:wrap;font-size:12px;"></div>',
    '<form id="mf-ai-form" style="display:flex;gap:6px;align-items:flex-end;padding:10px 12px;border-top:1px solid #e2e8f0;background:#fff;">',
    '<button type="button" id="mf-ai-attach-btn" title="' + esc(T('ai.chat_attach', 'Attach image or text file (paste image works too)')) + '" style="background:#e2e8f0;border:0;border-radius:8px;width:42px;height:42px;color:#475569;font-size:16px;cursor:pointer;flex:0 0 auto;"><i class="fas fa-paperclip"></i></button>',
    '<input type="file" id="mf-ai-file" accept="image/*,.txt,.md,.json,.csv,.log,.xml,.html,.css,.js,.ts,.cs,.sql" multiple hidden>',
    '<textarea id="mf-ai-input" rows="2" placeholder="' + esc(T('ai.chat_input_ph', 'Ask MegaForm AI to add a field, configure SQL, apply a sample… (paste images / drop files supported)')) + '" style="flex:1;resize:vertical;min-height:42px;max-height:160px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:13px/1.4 inherit;"></textarea>',
    '<button type="submit" id="mf-ai-send-btn" style="background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:0 14px;height:42px;font-weight:600;cursor:pointer;flex:0 0 auto;">' + esc(T('ai.chat_send', 'Send')) + '</button>',
    '</form>',
    '</aside>',
  ].join('');
}

const ATTACH_MAX_BYTES = 4 * 1024 * 1024; // 4 MB per file
const ATTACH_TEXT_EXT = /\.(?:txt|md|json|csv|log|xml|html?|css|js|ts|cs|sql|ya?ml|env)$/i;

function fileToAttachment(file: File): Promise<Attachment | null> {
  return new Promise((resolve) => {
    if (!file) { resolve(null); return; }
    if (file.size > ATTACH_MAX_BYTES) {
      resolve({
        type: 'text',
        name: file.name + ' (too large, skipped)',
        content: '[File ' + file.name + ' is ' + Math.round(file.size / 1024) + ' KB — limit is 4 MB]',
        size: file.size,
        dropped: true,
      });
      return;
    }
    const isImage = file.type && file.type.indexOf('image/') === 0;
    const isText = (file.type && file.type.indexOf('text/') === 0) || ATTACH_TEXT_EXT.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    if (isImage) {
      reader.onload = () => resolve({
        type: 'image',
        name: file.name,
        mediaType: file.type || 'image/png',
        dataUrl: String(reader.result || ''),
        size: file.size,
      });
      reader.readAsDataURL(file);
    } else if (isText) {
      reader.onload = () => resolve({
        type: 'text',
        name: file.name,
        mediaType: file.type || 'text/plain',
        content: String(reader.result || ''),
        size: file.size,
      });
      reader.readAsText(file);
    } else {
      resolve({
        type: 'text',
        name: file.name + ' (binary, not embedded)',
        content: '[binary file omitted: ' + file.name + ', ' + file.size + ' bytes]',
        size: file.size,
        dropped: true,
      });
    }
  });
}

function renderAttachmentChips(host: HTMLElement, pending: Attachment[]): void {
  if (!pending.length) {
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }
  host.style.display = 'flex';
  host.innerHTML = pending.map((a, i) => {
    const icon = a.type === 'image' ? '🖼️' : '📄';
    const label = esc(a.name);
    const thumb = a.type === 'image' && a.dataUrl
      ? '<img src="' + esc(a.dataUrl) + '" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:cover;margin-right:6px;border:1px solid #cbd5e1;">'
      : '<span style="margin-right:6px;">' + icon + '</span>';
    return '<span data-attach-chip="' + i + '" style="display:inline-flex;align-items:center;padding:4px 6px 4px 4px;background:#fff;border:1px solid #cbd5e1;border-radius:14px;">' +
      thumb + label +
      '<button type="button" data-attach-remove="' + i + '" title="Remove" style="background:transparent;border:0;color:#64748b;margin-left:6px;cursor:pointer;font-size:14px;line-height:1;">&times;</button>' +
      '</span>';
  }).join('');
}

function appendMessageDom(log: HTMLElement, role: 'user' | 'assistant' | 'system' | 'op', text: string, detail?: string): void {
  const bg = role === 'user' ? '#e0e7ff' : role === 'assistant' ? '#fff' : role === 'op' ? '#fef3c7' : '#e2e8f0';
  const align = role === 'user' ? 'flex-end' : 'flex-start';
  const label = role === 'user' ? T('ai.role_you', 'You') : role === 'assistant' ? T('ai.role_ai', 'AI') : role === 'op' ? T('ai.role_op', 'Op result') : T('ai.role_system', 'System');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'align-self:' + align + ';max-width:88%;';
  wrap.innerHTML =
    '<div style="font-size:10px;color:#64748b;margin-bottom:2px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;">' + esc(label) + '</div>' +
    '<div style="background:' + bg + ';color:#0f172a;padding:8px 11px;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;">' + esc(text) + '</div>' +
    (detail ? '<div style="font-size:11px;color:#475569;margin-top:3px;">' + esc(detail) + '</div>' : '');
  log.appendChild(wrap);
  // [v20260529-07] Detect CREATE TABLE DDL in assistant messages and render
  // an Apply button below. Clicking POSTs the DDL to /Subform/ApplyDdl which
  // safely runs the statement on DashboardDatabase, then we invalidate the
  // tables cache + ask the DB tab to refresh.
  if (role === 'assistant') decorateDdlBlock(wrap, text);
  log.scrollTop = log.scrollHeight;
}

function extractCreateTableDdl(text: string): string | null {
  if (!text) return null;
  const t = String(text);
  // 1) fenced ```sql ... ``` block
  const fence = /```(?:sql)?\s*([\s\S]*?)```/i.exec(t);
  if (fence && /create\s+table/i.test(fence[1])) return fence[1].trim();
  // 2) inline CREATE TABLE ... ;
  const inline = /CREATE\s+TABLE[\s\S]*?\);/i.exec(t);
  if (inline) return inline[0].trim();
  return null;
}

function decorateDdlBlock(wrap: HTMLElement, text: string): void {
  const ddl = extractCreateTableDdl(text);
  if (!ddl) return;
  const card = document.createElement('div');
  card.style.cssText = 'margin-top:8px;padding:10px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;display:flex;gap:8px;align-items:center;';
  const tableMatch = /create\s+table\s+(?:\[?([A-Za-z0-9_]+)\]?\s*\.\s*)?\[?([A-Za-z0-9_]+)\]?/i.exec(ddl);
  const tableName = tableMatch ? (tableMatch[2] || '?') : '?';
  card.innerHTML =
    '<span style="font-size:12px;color:#065f46;flex:1;">' + T('ai.ddl_ready', 'Ready to create {table} on DashboardDatabase?', { table: '<strong>' + esc(tableName) + '</strong>' }) + '</span>' +
    '<button type="button" data-apply-ddl style="background:#10b981;color:#fff;border:0;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">✓ ' + esc(T('ai.ddl_apply', 'Apply')) + '</button>' +
    '<button type="button" data-discard-ddl style="background:#fff;color:#065f46;border:1px solid #6ee7b7;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;">' + esc(T('ai.ddl_discard', 'Discard')) + '</button>';
  wrap.appendChild(card);
  card.querySelector('[data-discard-ddl]')?.addEventListener('click', () => card.remove());
  card.querySelector('[data-apply-ddl]')?.addEventListener('click', async () => {
    const btn = card.querySelector('[data-apply-ddl]') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = T('ai.ddl_applying', 'Applying…');
    try {
      // [v20260601-B27] Platform-aware Subform URL — Oqtane mounts at /api/MegaFormPopup/Subform/
      const pf: any = (window as any).__MF_PLATFORM__ || {};
      const isOqtane = String(pf.platform || '').toLowerCase() === 'oqtane';
      const applyDdlUrl = isOqtane
        ? '/api/MegaFormPopup/Subform/ApplyDdl'
        : (((window as any).__MF_API_BASE__ || pf.apiBase || '/DesktopModules/MegaForm/API/').replace(/\/?$/, '/') + 'Subform/ApplyDdl');
      const token = (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';
      const r = await fetch(applyDdlUrl, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'RequestVerificationToken': token },
        body: JSON.stringify({ ddl }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
      card.innerHTML = '<span style="font-size:12px;color:#065f46;font-weight:600;">✓ ' + T('ai.ddl_created', 'Created {table} — table list refreshed.', { table: esc(String(j.fullName || j.tableName)) }) + '</span>';
      // Refresh the DB tab table list if it exists.
      try {
        (window as any).__MF_DB_TABLES__ = null;
        const w: any = window as any;
        if (w.MFBuilderDbTabsRefresh) w.MFBuilderDbTabsRefresh();
        else {
          // Force re-mount: clear marker so the next tab activation refetches.
          const body = document.getElementById('mf-db-tables-body');
          if (body) body.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">' + esc(T('ai.ddl_reloading', 'Reloading…')) + '</div>';
        }
      } catch { /* noop */ }
    } catch (e) {
      btn.disabled = false; btn.textContent = '✓ ' + T('ai.ddl_apply', 'Apply');
      const msg = document.createElement('div');
      msg.style.cssText = 'margin-top:6px;color:#b91c1c;font-size:11px';
      msg.textContent = T('ai.ddl_apply_failed', 'Apply failed:') + ' ' + ((e as Error).message || String(e));
      card.appendChild(msg);
    }
  });
}

function renderLog(log: HTMLElement, history: ChatMessage[]): void {
  log.innerHTML = '';
  history.forEach((m) => {
    if (m.role === 'system') return; // never render system to the user
    appendMessageDom(log, m.role as any, m.content || '');
  });
}

async function sendMessage(
  input: HTMLTextAreaElement,
  log: HTMLElement,
  history: ChatMessage[],
  pending: Attachment[],
  attachmentsHost: HTMLElement,
): Promise<void> {
  const api = getApi();
  if (!api) {
    appendMessageDom(log, 'system', T('ai.lib_not_loaded', 'AI library not loaded (window.MF_AI missing).'));
    return;
  }
  // [v20260531-KbRules] Ensure prompt rules are loaded from KB before
  // building the system prompt. First call hits the network (~150ms);
  // subsequent calls are instant (cached).
  await ensurePromptRulesLoaded();
  await ensureDbDialectLoaded();
  await ensureTemplateGuideLoaded();
  const text = String(input.value || '').trim();
  const attachments = pending.slice();
  if (!text && !attachments.length) return;
  input.value = '';
  pending.length = 0;
  renderAttachmentChips(attachmentsHost, pending);
  const displayText = text || (attachments.length ? '(' + attachments.length + ' attachment' + (attachments.length > 1 ? 's' : '') + ')' : '');
  history.push({ role: 'user', content: text, attachments });
  appendMessageDom(log, 'user', displayText, attachments.length ? attachments.map((a) => a.name).join(', ') : '');

  // [v20260530-22] Auto-detect user's design decision when ASK-DESIGN bubble
  // is on screen. If user types A / "giữ nguyên" / "preserve" → designDecision='preserve'.
  // If user types B / "thay đổi" / "change" / "đồng ý" → designDecision='change'.
  // This unlocks the dispatcher gate so AI's next ops apply automatically.
  try {
    const w = window as any;
    const session = w.__mfai_session;
    // [v20260530-24] Bubble may have rendered in a prior batch — rely on the
    // settings probe instead of the flag, which now resets per dispatch batch.
    const needsDecision = (() => {
      try {
        const s = w.MegaFormBuilder?.state?.schema?.settings || {};
        return (
          (s.customHtml || s.CustomHtml || '').length > 0 ||
          (s.customCss || s.CustomCss || '').length > 0 ||
          (s.theme || s.Theme || '').length > 0 ||
          Object.keys(s.customScripts || s.CustomScripts || {}).length > 0
        );
      } catch { return false; }
    })();
    if (session && needsDecision && !session.designDecision && text) {
      const norm = text.toLowerCase().trim();
      const preserveHit = /^(a\b|a\)|giữ\s*nguyên|giu\s*nguyen|preserve|không\s*thay\s*đổi|khong\s*thay\s*doi|no\b)/.test(norm);
      const changeHit = /^(b\b|b\)|thay\s*đổi|thay\s*doi|change|đồng\s*ý|dong\s*y|ok\b|yes\b|cho\s*phép|cho\s*phep)/.test(norm);
      if (preserveHit && !changeHit) {
        session.designDecision = 'preserve';
        appendMessageDom(log, 'system', T('ai.decision_keep', 'Decision recorded: KEEP the current design. AI will only change fields and logic.'));
      } else if (changeHit && !preserveHit) {
        session.designDecision = 'change';
        appendMessageDom(log, 'system', T('ai.decision_allow', 'Decision recorded: design changes are ALLOWED.'));
      }
    }
  } catch { /* non-fatal */ }

  // Show "thinking" placeholder.
  const thinking = document.createElement('div');
  thinking.style.cssText = 'align-self:flex-start;font-size:12px;color:#64748b;font-style:italic;';
  thinking.textContent = isAiVerbose() ? T('ai.thinking', 'AI thinking…') : nextFriendlyTick();
  log.appendChild(thinking);
  log.scrollTop = log.scrollHeight;

  // [v20260528-20] Tool-use conversation loop.
  // Send chat → if assistant returns tool_calls, dispatch them, append the
  // results as `role: 'tool'` history items, send again. Repeat up to
  // MAX_TOOL_ITERATIONS to bound runaway loops.
  const opts: ChatOpts = {
    system: systemPrompt(),
    history: history as ChatMessageWithTools[],
    attachments,
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 2000,
    tools: TOOL_DEFS,
    toolChoice: 'auto',
  };

  try {
    let finalReply = '';
    let iter = 0;
    while (iter < MAX_TOOL_ITERATIONS) {
      iter++;
      // [v20260529-05] On the final allowed iteration, force the model to
      // return text by disabling tool calls. Without this, the model could
      // emit a 12th tool call and we'd exit the loop with finalReply still
      // empty — the user sees nothing.
      if (iter >= FORCE_FINALIZE_AT) {
        opts.toolChoice = 'none';
      }
      console.log('[MfAiChat] calling chatWithTools iter', iter, 'history', opts.history?.length);
      const result = await api.chatWithTools(opts);
      console.log('[MfAiChat] chatWithTools result', { text: result.text?.substring(0,100), toolCalls: result.toolCalls?.length });
      const calls: ToolCall[] | null | undefined = result.toolCalls;
      if (!calls || !calls.length) {
        finalReply = result.text || '';
        if (finalReply) {
          // Push final assistant turn to history once we're done.
          (opts.history as ChatMessageWithTools[]).push({ role: 'assistant', content: finalReply });
        }
        break;
      }
      // Show what tools the AI is calling, so users see progress not "AI thinking…" forever.
      thinking.textContent = isAiVerbose()
        ? 'AI calling: ' + calls.map((c) => c.name).join(', ') + '…'
        : nextFriendlyTick();
      // Push assistant turn with tool_calls (no visible content)
      (opts.history as ChatMessageWithTools[]).push({
        role: 'assistant',
        content: result.text || '',
        toolCalls: calls,
      });
      // Dispatch tools and append results
      for (const call of calls) {
        let toolResult: any;
        try { toolResult = await dispatchToolCall(call); }
        catch (e) { toolResult = { error: 'Tool ' + call.name + ' failed: ' + (e as Error).message }; }
        (opts.history as ChatMessageWithTools[]).push({
          role: 'assistant',
          content: '',
          toolCallId: call.id,
          toolResult: serializeToolResult(toolResult),
        });
      }
    }
    thinking.remove();

    if (iter >= MAX_TOOL_ITERATIONS && !finalReply) {
      // Last-ditch retry with text-only mode in case the toolChoice='none'
      // turn above still slipped through (e.g. the model emitted an empty
      // tool result). Give the model ONE more shot to wrap up in prose.
      try {
        const wrap = await api.chatWithTools({
          ...opts,
          tools: undefined,
          toolChoice: undefined,
          user: 'You have used your tool budget. Please finalize a JSON {"ops":[...],"explain":"..."} reply now with what you already know.',
        });
        finalReply = wrap.text || '';
      } catch { /* ignore — fall through to message below */ }
      if (!finalReply) {
        appendMessageDom(log, 'system', isAiVerbose()
          ? T('ai.tools_exhausted_verbose', 'AI used many tools but did not produce a final answer (tried {n} iterations). Try a smaller scope, e.g. ask for one widget or one table at a time.', { n: String(MAX_TOOL_ITERATIONS) })
          : T('ai.tools_exhausted', 'The AI ran out of room. Try asking for a smaller piece of the form at a time.'));
        return;
      }
    }

    let parsed = parseAssistantReply(finalReply);

    // [v20260529-11] If the AI just described the form in prose but did not
    // emit any actionable ops (no add_field / set_field_property / etc.),
    // fire ONE auto-retry that asks it to convert its own description into
    // ops JSON. This catches the common "Let's proceed with adding these
    // fields to the form…" dead-end where the user sees the design but no
    // Apply card appears.
    const ACTIONABLE = (o: any) => o && o.op && o.op !== 'chat_message';
    const looksLikeFormDesign = /\b(add_field|select widget|dropdown|repeater|datagrid|field\s*[:\-]|widgetProps|Type\s*[:\-]\s*(Select|DataRepeater|DynamicLabel|DataGrid|Text|Number)|Build|let'?s\s+(create|add|proceed))/i.test(finalReply || '');
    if ((!parsed.ops || !parsed.ops.some(ACTIONABLE)) && looksLikeFormDesign) {
      try {
        // Show the prose immediately so user knows AI is thinking.
        if (finalReply) appendMessageDom(log, 'assistant', finalReply);
        thinking.textContent = isAiVerbose() ? T('ai.reasking_ops', 'Re-asking for ops JSON…') : nextFriendlyTick();
        log.appendChild(thinking);
        const retry = await api.chatWithTools({
          ...opts,
          tools: undefined,
          toolChoice: undefined,
          user: 'Your last reply DESCRIBED the form but did not include the JSON ops to apply it. Convert your design into the strict {"ops":[...],"explain":"..."} JSON now. Each op must be an object with an "op" field (add_field / set_field_property / set_field_sql / etc.). Do NOT wrap in markdown fences. Output JSON only.',
        });
        thinking.remove();
        if (retry.text) {
          const re = parseAssistantReply(retry.text);
          if (re.ops && re.ops.some(ACTIONABLE)) {
            // Use the retry result instead of the prose-only first reply.
            parsed = re;
            finalReply = retry.text;
            // Don't double-print the explain if it's the same prose.
          }
        }
      } catch { /* if retry fails, fall through and show the original prose */ }
    }

    if (parsed.explain) {
      history.push({ role: 'assistant', content: parsed.explain });
      appendMessageDom(log, 'assistant', parsed.explain);
    }
    if (parsed.ops && parsed.ops.length) {
      const muteOps = parsed.ops.filter((o) => o && o.op === 'chat_message');
      const stagedOps = parsed.ops.filter((o) => o && o.op !== 'chat_message');
      muteOps.forEach((o) => {
        const r = dispatchOps([o])[0];
        if (r && r.detail && (r.detail as any).text) {
          appendMessageDom(log, 'assistant', String((r.detail as any).text));
        }
      });
      if (stagedOps.length) {
        appendStagedOpsCard(log, stagedOps);
      }
    } else if (!parsed.explain && finalReply) {
      history.push({ role: 'assistant', content: finalReply });
      appendMessageDom(log, 'assistant', finalReply);
    }
  } catch (e) {
    thinking.remove();
    appendMessageDom(log, 'system', describeError(e));
  } finally {
    saveHistory(history);
  }
}

/**
 * [v20260528-14] Render an inline Preview card listing every op the AI wants
 * to apply, with `Apply` and `Discard` buttons. Apply dispatches the ops and
 * replaces the card with the per-op result log. Discard removes the card.
 */
function appendStagedOpsCard(log: HTMLElement, ops: Op[]): void {
  const summary = ops.map((o, i) => {
    const params = Object.keys(o).filter((k) => k !== 'op').slice(0, 4);
    let detail = '';
    if (o.op === 'add_field') detail = String(o.type || '') + (o.label ? ' "' + o.label + '"' : '') + (o.key ? ' [' + o.key + ']' : '');
    else if (o.op === 'remove_field') detail = String(o.key || '');
    else if (o.op === 'set_field_property') detail = String(o.key || '') + '.' + String(o.path || '') + ' = ' + JSON.stringify(o.value);
    else if (o.op === 'set_field_image_unsplash') detail = String(o.key || '') + ' ← image:"' + String(o.query || '') + '"';
    else if (o.op === 'replace_form_schema') detail = (o.schema && Array.isArray(o.schema.fields) ? o.schema.fields.length : '?') + ' fields';
    else if (o.op === 'set_form_meta') detail = (o.title ? 'title="' + o.title + '" ' : '') + (o.description ? 'desc=…' : '');
    else if (o.op === 'apply_dynlabel_preset') detail = String(o.key || '') + ' ← "' + String(o.presetLabel || o.presetIndex || '') + '"';
    else if (params.length) detail = params.map((k) => k + '=' + JSON.stringify((o as any)[k]).slice(0, 30)).join(' ');
    return '<li style="padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#0f172a;"><strong>' + esc(o.op) + '</strong>' + (detail ? ' — <span style="color:#475569;">' + esc(detail) + '</span>' : '') + '</li>';
  }).join('');
  const card = document.createElement('div');
  card.style.cssText = 'align-self:stretch;background:#fff;border:1px solid #c7d2fe;border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(79,70,229,.10);';
  card.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
    '  <strong style="font-size:13px;color:#1e293b;">AI proposes ' + ops.length + ' change' + (ops.length === 1 ? '' : 's') + '</strong>' +
    '  <span style="font-size:11px;color:#64748b;">review before apply</span>' +
    '</div>' +
    '<ul style="list-style:none;padding:0;margin:0 0 10px;max-height:240px;overflow-y:auto;">' + summary + '</ul>' +
    '<div style="display:flex;gap:6px;justify-content:flex-end;">' +
    '  <button type="button" data-mfai-stage-discard style="background:#fff;border:1px solid #cbd5e1;color:#475569;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Discard</button>' +
    '  <button type="button" data-mfai-stage-apply style="background:#4f46e5;color:#fff;border:0;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Apply</button>' +
    '</div>';
  log.appendChild(card);
  log.scrollTop = log.scrollHeight;

  card.querySelector('[data-mfai-stage-discard]')?.addEventListener('click', () => {
    card.remove();
    appendMessageDom(log, 'system', 'Discarded ' + ops.length + ' proposed change' + (ops.length === 1 ? '' : 's') + '.');
  });
  card.querySelector('[data-mfai-stage-apply]')?.addEventListener('click', () => {
    (card.querySelector('[data-mfai-stage-apply]') as HTMLButtonElement).disabled = true;
    const results: OpResult[] = dispatchOps(ops);
    card.remove();
    results.forEach((r) => {
      appendMessageDom(log, 'op', (r.ok ? '✓ ' : '✗ ') + r.op + (r.message ? ' — ' + r.message : ''));
    });
  });
}

export function mountChatUi(opts?: MountOpts): void {
  console.log('[MfAiChat] mountChatUi called', opts);
  const containerId = (opts && opts.containerId) || 'mf-ai-root';
  let host = document.getElementById(containerId);
  if (!host) {
    host = document.createElement('div');
    host.id = containerId;
    document.body.appendChild(host);
    console.log('[MfAiChat] created host in body');
  }
  if (host.getAttribute('data-mf-ai-mounted') === '1') { console.log('[MfAiChat] already mounted'); return; }
  host.setAttribute('data-mf-ai-mounted', '1');
  // [BuilderOverlayFix v20260528-17] Builder enters a fullscreen-takeover
  // mode (body.mf-builder-open) that CSS-hides every direct body child
  // without [data-mf-overlay]. Marker keeps the host visible above the
  // takeover (same trick the LayoutDesigner popup uses) — covers the
  // edge case where the AI root ends up on <body> instead of in the
  // builder root.
  host.setAttribute('data-mf-overlay', '1');
  host.innerHTML = renderBubbleHtml();

  const bubble = document.getElementById('mf-ai-bubble') as HTMLButtonElement | null;
  const panel = document.getElementById('mf-ai-panel') as HTMLElement | null;
  const closeBtn = document.getElementById('mf-ai-close-btn') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('mf-ai-clear-btn') as HTMLButtonElement | null;
  const log = document.getElementById('mf-ai-log') as HTMLElement | null;
  const form = document.getElementById('mf-ai-form') as HTMLFormElement | null;
  const input = document.getElementById('mf-ai-input') as HTMLTextAreaElement | null;
  const attachBtn = document.getElementById('mf-ai-attach-btn') as HTMLButtonElement | null;
  const fileInput = document.getElementById('mf-ai-file') as HTMLInputElement | null;
  const attachmentsHost = document.getElementById('mf-ai-attachments') as HTMLElement | null;
  if (!bubble || !panel || !closeBtn || !clearBtn || !log || !form || !input || !attachBtn || !fileInput || !attachmentsHost) {
    console.log('[MfAiChat] mountChatUi early return - missing elements', { bubble, panel, closeBtn, clearBtn, log, form, input, attachBtn, fileInput, attachmentsHost });
    return;
  }

  const history: ChatMessage[] = loadHistory();
  renderLog(log, history);
  const pendingAttachments: Attachment[] = [];

  async function addFiles(files: FileList | File[] | null): Promise<void> {
    if (!files) return;
    const list = Array.from(files);
    for (const f of list) {
      const att = await fileToAttachment(f);
      if (att) pendingAttachments.push(att);
    }
    renderAttachmentChips(attachmentsHost!, pendingAttachments);
  }

  function show(): void {
    if (panel) {
      panel.style.display = 'flex';
      if (input) input.focus();
    }
  }
  function hide(): void {
    if (panel) panel.style.display = 'none';
  }

  bubble.addEventListener('click', () => {
    if (panel.style.display === 'flex') hide();
    else show();
  });
  closeBtn.addEventListener('click', hide);
  clearBtn.addEventListener('click', () => {
    if (!window.confirm('Clear chat history?')) return;
    history.length = 0;
    clearHistory();
    renderLog(log, history);
  });
  // [B84 2026-06-07] AI settings cog handler removed — settings are managed on
  // the shared dashboard "AI Settings" page (Configuration menu), not per-browser.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void sendMessage(input, log, history, pendingAttachments, attachmentsHost);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      void sendMessage(input, log, history, pendingAttachments, attachmentsHost);
    }
  });
  // Attach button → open file picker
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    void addFiles(fileInput.files);
    fileInput.value = '';
  });
  // Remove chip
  attachmentsHost.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-attach-remove]') as HTMLElement | null;
    if (!t) return;
    const idx = parseInt(t.getAttribute('data-attach-remove') || '-1', 10);
    if (idx >= 0 && idx < pendingAttachments.length) {
      pendingAttachments.splice(idx, 1);
      renderAttachmentChips(attachmentsHost, pendingAttachments);
    }
  });
  // Paste images / files from clipboard
  input.addEventListener('paste', (e) => {
    const items = (e as ClipboardEvent).clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  });
  // Drag-and-drop on the panel
  ['dragenter', 'dragover'].forEach((ev) => panel!.addEventListener(ev, (e) => {
    if ((e as DragEvent).dataTransfer && Array.from((e as DragEvent).dataTransfer!.types).indexOf('Files') >= 0) {
      e.preventDefault();
      panel!.style.outline = '2px dashed #4f46e5';
    }
  }));
  ['dragleave', 'drop'].forEach((ev) => panel!.addEventListener(ev, () => {
    panel!.style.outline = '';
  }));
  panel.addEventListener('drop', (e) => {
    const files = (e as DragEvent).dataTransfer?.files;
    if (files && files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  });
}

/**
 * [B84 2026-06-07] The AI Form Assistant chatbot is governed by the shared
 * "Enable AI Assistant" toggle saved on the dashboard AI Settings page
 * (MegaForm_AI_Enabled site setting), NOT by the dev.lock-based
 * `__MF_PLATFORM__.ai.enabled` sentinel anymore. We fetch the toggle from the
 * AiAssistant DefaultConfig endpoint once at startup; the bubble mounts on the
 * Builder surface only when it is true. dev.lock still seeds the server-side
 * DEFAULT for that toggle, so existing dev.lock installs keep the chatbot until
 * an admin flips it off.
 *
 * Because the builder UI mounts asynchronously (SPA bootstraps, hash routes,
 * iframes), the sentinel may not exist at DOMContentLoaded — we observe the
 * DOM for up to 30s and bail when it disappears.
 */
function aiAssistantConfigUrl(): string {
  const w = window as any;
  const pf = (w.__MF_PLATFORM__ || {}) as any;
  const platform = String(pf.platform || '').toLowerCase();
  const isOqtane = platform === 'oqtane' || !!w.Oqtane || !!w.__OQTANE__ || !!document.querySelector('[data-mf-platform="oqtane"]');
  if (isOqtane) {
    const sid = pf.siteId ?? pf.SiteId ?? pf.portalId ?? 0;
    return '/api/AiAssistant/DefaultConfig?entityid=' + encodeURIComponent(String(sid)) + '&entityname=Site&siteId=' + encodeURIComponent(String(sid));
  }
  const apiBase = String(pf.apiBase || '/DesktopModules/MegaForm/API/').replace(/\/?$/, '/');
  const pid = pf.portalId ?? pf.PortalId ?? 0;
  return apiBase + 'AiAssistant/DefaultConfig?portalId=' + encodeURIComponent(String(pid));
}

let __aiActivationCache: boolean | null = null;
async function fetchAiActivation(): Promise<boolean> {
  if (__aiActivationCache !== null) return __aiActivationCache;
  try {
    const url = aiAssistantConfigUrl();
    console.log('[MfAiChat] fetchAiActivation →', url);
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { console.log('[MfAiChat] fetchAiActivation not ok', r.status); __aiActivationCache = false; return false; }
    const j = await r.json();
    __aiActivationCache = !!(j && (j.enabled === true || j.Enabled === true));
    console.log('[MfAiChat] fetchAiActivation result', __aiActivationCache, j);
  } catch (e) {
    console.log('[MfAiChat] fetchAiActivation error', e);
    __aiActivationCache = false;
  }
  return __aiActivationCache;
}

/**
 * [v20260529-10] "Verbose" mode = developer mode (dev.lock present). When
 * absent, hide technical chatter — tool names, raw OpenAI errors, iteration
 * counts — and replace with friendly "Thinking… / Constructing…" cycle so
 * production users see a smooth experience.
 *
 * Source of truth: window.__MF_PLATFORM__.ai.verbose if explicitly set,
 * otherwise fall back to ai.devLock (server-side check), otherwise default
 * to false (production-friendly). Developer machines should always set
 * `__MF_PLATFORM__.ai.verbose = true` via host page.
 */
function isAiVerbose(): boolean {
  const pf = ((window as any).__MF_PLATFORM__ || {}) as any;
  const ai = pf.ai || {};
  if (typeof ai.verbose === 'boolean') return ai.verbose;
  if (typeof ai.Verbose === 'boolean') return ai.Verbose;
  if (ai.devLock === true || ai.DevLock === true) return true;
  return false;
}

const FRIENDLY_THINKING: Array<[string, string]> = [['ai.tick_thinking', 'Thinking…'], ['ai.tick_constructing', 'Constructing…'], ['ai.tick_reviewing', 'Reviewing schema…'], ['ai.tick_drafting', 'Drafting fields…'], ['ai.tick_almost', 'Almost done…']];
let friendlyTickIdx = 0;
function nextFriendlyTick(): string { const e = FRIENDLY_THINKING[(friendlyTickIdx++) % FRIENDLY_THINKING.length]; return T(e[0], e[1]); }

function describeError(e: unknown): string {
  const raw = (e instanceof Error) ? e.message : String(e);
  if (isAiVerbose()) return 'Error: ' + raw;
  // Production-friendly summary.
  if (/429|rate limit/i.test(raw)) return 'AI is busy right now. Please try again in a moment.';
  if (/401|invalid api key|unauthorized/i.test(raw)) return 'AI is not configured. Ask an administrator to add the API key.';
  if (/timeout|network|fetch/i.test(raw)) return 'Could not reach the AI service. Check your connection and try again.';
  return 'Something went wrong while talking to the AI. Try again in a moment.';
}

function isBuilderSurface(): boolean {
  const pf = ((window as any).__MF_PLATFORM__ || {}) as any;
  const surface = String(pf.ai && (pf.ai.surface || pf.ai.Surface) || '').toLowerCase();
  if (surface === 'builder') return true;
  // Even when server didn't tag the surface, only consider it Builder when
  // a builder-root element is in the DOM. Dashboard / runtime get nothing.
  return !!document.querySelector('#mf-builder-root, [data-mf-builder]');
}

// ── [UNIFY 2026-06-10] ONE AI surface ───────────────────────────────────────
// The in-builder "MegaForm AI" no longer renders the bare chat popup. It now
// launches the SAME rich studio used on the dashboard (Chat + Database + Live
// preview), with a builder host whose Apply writes the schema to the canvas via
// the existing `replace_form_schema` op. The studio lives in the dashboard
// bundle (window.MFDashboardAiFormCreator) — loaded on demand here, mirroring
// how the dashboard loads the AI bundle (ensureMfAi).
let __studioBundleLoading: Promise<void> | null = null;

function ensureStudioBundle(): Promise<void> {
  const w = window as any;
  const ready = () => w.MFDashboardAiFormCreator && typeof w.MFDashboardAiFormCreator.open === 'function';
  if (ready()) return Promise.resolve();
  if (!__studioBundleLoading) {
    __studioBundleLoading = new Promise<void>((resolve) => {
      const srcs = Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src);
      const mine = srcs.find((u) => /megaform-(ai-form-assistant|builder-loader|builder)\.js/i.test(u))
                || srcs.find((u) => /\/Modules\/MegaForm\/js\//i.test(u));
      const url = mine ? mine.replace(/megaform-[a-z-]+\.js/i, 'megaform-dashboard.js')
                       : '/Modules/MegaForm/js/megaform-dashboard.js';
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve(); // resolve anyway; caller guards on open()
      document.head.appendChild(s);
    });
  }
  return __studioBundleLoading.then(() => new Promise<void>((resolve) => {
    const t0 = Date.now();
    const tick = () => { if (ready() || Date.now() - t0 > 8000) return resolve(); setTimeout(tick, 100); };
    tick();
  }));
}

function builderApplySchema(schema: any): void {
  try {
    const w = window as any;
    const exS = (w.MegaFormBuilder && w.MegaFormBuilder.state && w.MegaFormBuilder.state.schema && w.MegaFormBuilder.state.schema.settings) || {};
    const nKeys = (v: any) => (v && typeof v === 'object') ? Object.keys(v).length : 0;
    const exTheme = String(exS.theme || exS.Theme || '').trim().toLowerCase();
    // Does the CURRENT canvas form carry premium design worth keeping?
    const hasPremium = !!(
      (exS.customHtml || exS.CustomHtml) || (exS.customCss || exS.CustomCss) ||
      nKeys(exS.customScripts || exS.CustomScripts) ||
      (exTheme && exTheme !== 'default') ||
      nKeys(exS.themeCssOverrides || exS.ThemeCssOverrides)
    );
    const settings = (schema && schema.settings) || {};
    const op: any = { op: 'replace_form_schema', schema: { version: String(schema?.version || '1.0'), fields: schema?.fields || [], settings } };
    if (hasPremium) {
      // Apply the new structure but PRESERVE the user's premium design: scrub the
      // generated chrome (designDecision:'preserve') so PRESERVE-002 back-fills
      // every design field from the existing form.
      op.designDecision = 'preserve';
      op.preserveCustomizations = true;
    } else {
      // Plain form → clean replace with the generated form's chrome (card+header).
      op.designDecision = 'change';
    }
    dispatchOps([op]);
    if (schema && (schema.title || schema.description)) {
      dispatchOps([{ op: 'set_form_meta', title: schema.title || '', description: schema.description || '' } as any]);
    }
  } catch (e) { console.warn('[MfAiChat] builder apply failed', e); }
}

export async function openBuilderStudio(initialPrompt?: string): Promise<void> {
  await ensureStudioBundle();
  const w = window as any;
  if (!(w.MFDashboardAiFormCreator && typeof w.MFDashboardAiFormCreator.open === 'function')) {
    console.warn('[MfAiChat] studio bundle unavailable'); return;
  }
  w.MFDashboardAiFormCreator.open({ mode: 'builder', onApply: builderApplySchema, initialPrompt });
}

function mountBuilderStudioLauncher(): void {
  // [AiDesignerTopbar 20260617] The floating ✨ corner FAB is RETIRED. The AI
  // Designer is now launched from a first-class top-bar button ("AI Designer",
  // #mf-btn-ai-designer in dom.ts, wired in toolbar.ts) so there is exactly ONE
  // AI entry point inside the builder. Both call window.MFAiChat.open() →
  // openBuilderStudio(), so this launcher no longer needs to inject anything.
  // Kept as a documented no-op (NOT deleted) because autoMount()/
  // __MfAiChat_remount still reference it. If a corner FAB is ever wanted again,
  // re-add the button here; the studio + apply-to-canvas path is unchanged.
  return;
}

function tryMountWhenBuilderReady(): boolean {
  const hasRoot = !!document.querySelector('#mf-builder-root, [data-mf-builder]');
  const isBuilder = isBuilderSurface();
  console.log('[MfAiChat] tryMountWhenBuilderReady', { hasRoot, isBuilder });
  if (!hasRoot) return false;
  if (!isBuilder) return false;
  mountBuilderStudioLauncher(); // [UNIFY] open the studio, not the bare chat
  return true;
}

function autoMount(): void {
  // [B84] Gate on the shared "Enable AI Assistant" toggle (fetched once).
  void fetchAiActivation().then((active) => {
    if (!active) return; // toggle off → chatbot stays hidden
    if (tryMountWhenBuilderReady()) return;

    // Builder isn't in the DOM yet — observe up to 30s for SPA bootstrap.
    const start = Date.now();
    const observer = new MutationObserver(() => {
      if (Date.now() - start > 30000) { observer.disconnect(); return; }
      if (tryMountWhenBuilderReady()) observer.disconnect();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    // Safety stop after 30s regardless.
    window.setTimeout(() => observer.disconnect(), 31000);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount);
} else {
  autoMount();
}

(window as any).__MFAI_CHAT_BADGE__ = CHAT_BADGE;

// [v20260529-01] Programmatic send API used by db-tables-panel.ts "+ AI Form"
// button. Opens the AI bubble (if closed), fills the input with the given
// text, and submits — same code path as the human Send button.
// [UNIFY] Legacy entry points now open the unified studio.
(window as any).__MfAiChat_remount = function() { mountBuilderStudioLauncher(); };
(window as any).MFAiChat = {
  // db-tables-panel.ts "+ AI Form" → open the studio with the prompt pre-filled.
  sendProgrammatic(text: string): void { void openBuilderStudio(text); },
  open(): void { void openBuilderStudio(); },
  _applySchema: builderApplySchema,   // [QA] faithful apply-to-canvas test hook
  badge: CHAT_BADGE,
};

// [v20260529-03] Widget-drop AI auto-greet. Polls MegaFormBuilder schema
// length; when a new field of an "interesting" type lands (DataRepeater /
// DynamicLabel / DataGrid / GridRepeater) AND its widgetProps look
// unconfigured, fire a contextual prompt. Skipped on bulk replace
// (replace_form_schema) so AI doesn't greet 20× when admin picks a
// template. Stored seen-uids in a Set to suppress repeated greets.
(function startWidgetDropWatcher() {
  const greeted = new Set<string>();
  let lastLen = -1;
  // Patterns the AI should chime in on.
  const interesting: Record<string, string> = {
    DataRepeater:  'You added a DataRepeater. Which SQL table or query should it read? I can also call list_sql_tables to show what is available.',
    GridRepeater:  'You added a GridRepeater. Want me to configure it from a SQL table? I can call list_sql_tables to show options.',
    DataGrid:      'You added a DataGrid (Subform). Pick a table from DashboardDatabase and I will set columns and totals — say which one or ask me to list options.',
    DynamicLabel:  'You added a DynamicLabel. Should it show a SQL list, a single-record detail, or static HTML? I can apply a preset (Card grid / Table list / Stat / Detail / Blog).',
  };
  function tick(): void {
    const B = (window as any).MegaFormBuilder;
    const fields = B && B.state && B.state.schema && B.state.schema.fields;
    if (!Array.isArray(fields)) return;
    if (lastLen < 0) { lastLen = fields.length; return; }
    if (fields.length <= lastLen) { lastLen = fields.length; return; }
    // Schema grew. If it grew by MORE than 2 in one tick assume bulk replace.
    if (fields.length - lastLen > 2) { lastLen = fields.length; return; }
    for (let i = lastLen; i < fields.length; i++) {
      const f = fields[i]; if (!f) continue;
      const t = String(f.type || '');
      const help = interesting[t]; if (!help) continue;
      const uid = String(f.key || (t + ':' + i));
      if (greeted.has(uid)) continue;
      // Treat widgetProps with <=1 keys as "unconfigured" (often {} or just label).
      const props = (f.widgetProps && typeof f.widgetProps === 'object') ? f.widgetProps : {};
      const propCount = Object.keys(props).length;
      if (propCount > 2) continue;
      greeted.add(uid);
      const w = window as any;
      if (w.MFAiChat && typeof w.MFAiChat.sendProgrammatic === 'function') {
        w.MFAiChat.sendProgrammatic(help + ' (field key: ' + uid + ')');
      }
      break; // only one greet per tick — avoid spam
    }
    lastLen = fields.length;
  }
  setInterval(tick, 800);
})();
