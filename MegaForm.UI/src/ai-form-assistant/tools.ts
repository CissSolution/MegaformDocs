/**
 * MegaForm AI Form Assistant — Tool dispatcher (client-side).
 *
 * Defines the function-calling tools exposed to the AI provider (OpenAI / Anthropic
 * native function-calling). Each tool maps to a REST endpoint on
 * /DesktopModules/MegaForm/API/AiTools/{action} backed by AiToolsController.cs.
 *
 * Why tools-on-demand instead of a giant system prompt:
 *   - System prompt size drops from ~8 KB to ~1.5 KB
 *   - With OpenAI prompt caching the static prefix hits 50% discount
 *   - AI only fetches widget/SQL/form details when it actually needs them
 *   - Knowledge base lives in SQL (MF_AI_Knowledge) so admins extend it without
 *     code redeploy
 *
 * Badge: MfAiTools v20260528-20
 */

import type { ToolDef, ToolCall } from './providers';

export const TOOLS_BADGE = 'MfAiTools v20260622-01';

// ────────────────────────────────────────────────────────────────────────────
//  Tool schemas — exposed to OpenAI / Anthropic
// ────────────────────────────────────────────────────────────────────────────

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_kinds',
    description: 'List the categories of knowledge entries available (widget, sql_sample, row_template, pager_template, form_pattern, designer, cascade_pattern, system_arch). Call this first if you do not know what kinds exist.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_knowledge',
    description: 'List knowledge entries (slug + title + summary) filtered by kind and/or full-text search. Returns short summaries only; use get_knowledge to load full body of an entry.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Filter by kind, e.g. "widget", "sql_sample", "designer".' },
        search: { type: 'string', description: 'Search across title/summary/tags/slug.' },
        top: { type: 'number', description: 'Max results (default 40, max 80).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_knowledge',
    description: 'Fetch the full body (markdown / JSON) + examples for a specific knowledge entry by slug. Use after list_knowledge surfaces a relevant slug.',
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'The slug returned by list_knowledge.' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_widgets',
    description: 'Shortcut: list every MegaForm widget/field type with a 1-line summary. Use to discover available widget types before add_field.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_widget',
    description: 'Fetch full props + presets + defaults for a single widget type. Pass the widget slug (e.g. "widget-datarepeater") returned by list_widgets.',
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Widget slug, e.g. "widget-datarepeater".' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_form_customizations',
    description: 'PREFERRED before modifying any form that may be customized. Returns the current form\'s customHtml / customCss / customScripts / theme / themeCssOverrides presence + length so you know what to preserve. Always call this when the user asks to "edit" / "update" / "modify" / "add to" an existing form before you emit any add_field / replace_form_schema op. If customHtml is non-empty, new fields are INVISIBLE at runtime unless you add a {{field:key}} placeholder.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_safe_image_url',
    description: 'Returns a GUARANTEED-WORKING image URL you can paste into <img src="…">. Never hallucinate image URLs — call this first. The URL is from an allowlisted host (picsum.photos seed-based — same keyword always returns the same photo).',
    parameters: {
      type: 'object',
      properties: {
        keywords: { type: 'string', description: 'Subject keywords, e.g. "ocean sunrise" or "team meeting".' },
        width: { type: 'number', description: 'Image width in px (default 800, max 2400).' },
        height: { type: 'number', description: 'Image height in px (default 400, max 2400).' },
        style: { type: 'string', description: 'Optional style hint: "photo" (default, real photo via picsum.photos), or "placeholder" (placehold.co labeled box, useful for logos/banners without subject matter).' },
      },
      required: ['keywords'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_widget_bundle',
    description: 'PREFERRED for widgets — one fetch returns the strict entry body, all concrete templates (preset shapes), all dispatcher rules (IDs + condition + fix), and recent admin-promoted feedback "lessons" so you do not repeat past failures. Always call this when about to add or re-configure a widget.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Widget slug, e.g. "widget-dynamiclabel".' },
        recentLessons: { type: 'number', description: 'How many recent promoted feedback patterns to include (default 5, max 25).' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_prompt_recipe',
    description: 'PREFERRED for design tasks. Fetches a one-shot recipe markdown file that walks you through a recurring design task end-to-end (convert premium form, build Razor master-detail, build DynamicLabel tabs, etc.). Call list_knowledge(kind="prompt_recipe", search=...) first to discover relevant slugs, then call this. Recipe body returns full markdown with rules + ops shape + examples.',
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Recipe slug, e.g. "recipe-convert-premium-form" or "recipe-build-razor-master-detail".' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_template_guide',
    description: 'REQUIRED before modifying a Premium form. Fetches the per-template design contract (immutable/mutable rules, panel layout, locked field keys, token dictionary, conversion examples). Call this when the current form has a non-empty templateGuideSlug or non-empty customHtml with a premium shell. The returned body is the full guide markdown with JSON frontmatter.',
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Template guide slug, e.g. "tpl-alpine-retreat-escape".' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_forms',
    description: 'List forms in the current portal (id + title + status). Use when the user mentions another form by name.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter by title/description substring.' },
        top: { type: 'number', description: 'Max results (default 50).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_form',
    description: 'Fetch a form by id, returning its title + description + simplified field list (key, type, label, required).',
    parameters: {
      type: 'object',
      properties: { formId: { type: 'number', description: 'Numeric form id.' } },
      required: ['formId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_sql_tables',
    description: 'List tables on the DashboardDatabase. Use before configuring DataRepeater / DataGrid / Subform.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter by table name substring.' },
        top: { type: 'number', description: 'Max results (default 80, max 200).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_table_columns',
    description: 'Get columns (name + sql type + nullability) of a DashboardDatabase table. Use before add_subform_from_table / add_field_from_column.',
    parameters: {
      type: 'object',
      properties: { table: { type: 'string', description: 'Table name (without schema).' } },
      required: ['table'],
      additionalProperties: false,
    },
  },
  {
    name: 'preview_sql',
    description: 'Run a SELECT on the DashboardDatabase and return up to 200 real rows (live preview). Use to confirm a query returns the expected columns/rows BEFORE binding it to a Select optionsSql / DataRepeater masterQuery / DataGrid.',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A SELECT statement (parameters as :name).' },
        connectionKey: { type: 'string', description: 'Default DashboardDatabase.' },
        pageSize: { type: 'number', description: 'Rows to return (default 25, max 200).' },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },
  {
    name: 'dry_run_validate',
    description: 'Verify EVERY table referenced by a SQL statement actually exists on the DashboardDatabase. Returns {ok, referenced, missing, suggestions}. ALWAYS call before shipping any optionsSql / masterQuery / insertSql so the form does not silently break on a hallucinated table name.',
    parameters: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'The SQL to validate.' } },
      required: ['sql'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_designers',
    description: 'List available designer popups (Layout Designer v2, GridRepeater, etc.) the admin can launch.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_designer',
    description: 'Get details about a specific designer popup (how to launch, what it outputs).',
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Designer slug e.g. "designer-layout-v2".' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_cascade_pattern',
    description: 'Get cascade-dropdown patterns (parent → child SQL pairs) appropriate for the user request. Returns reusable templates the AI can adapt.',
    parameters: {
      type: 'object',
      properties: {
        parentColumn: { type: 'string', description: 'Optional: hint about the parent column name (e.g. "ProvinceId").' },
        childTable: { type: 'string', description: 'Optional: hint about the child table (e.g. "Cities").' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'propose_table_schema',
    description: 'Generate a CREATE TABLE DDL proposal for the given form. Maps each form field to a sensible SQL column type. Returns the DDL string — do NOT execute it; emit the DDL via chat_message so the admin can review and run it.',
    parameters: {
      type: 'object',
      properties: {
        formId: { type: 'number', description: 'The form id whose schema you want to mirror in SQL.' },
        tableName: { type: 'string', description: 'Optional: override the auto-generated table name (slug of form title prefixed with App_).' },
        schemaName: { type: 'string', description: 'Optional: SQL schema (default dbo).' },
      },
      required: ['formId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_razor_templates',
    description: 'List every registered .razor widget template (name, category, EmitsValue, SupportsSql, parameters). Use when the user asks for advanced display (pivot, calendar from SQL, gallery, chart) or interactive (calculator, map picker) widgets that standard fields cannot express. Prefer Razor templates over hand-rolling DynamicLabel HTML when the catalog has a fit.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_razor_template_source',
    description: 'Fetch the full .razor source code (markup + @code block) for a registered template. Use after list_razor_templates to read the template the AI will configure or to suggest customer edits.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Template name from list_razor_templates (e.g. "SqlTablePivot").' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
//  REST dispatcher
// ────────────────────────────────────────────────────────────────────────────

function apiBase(): string {
  const platform = (window as any).__MF_PLATFORM__ || {};
  if (typeof platform.apiBase === 'string' && platform.apiBase) return platform.apiBase.replace(/\/+$/, '');
  return '/DesktopModules/MegaForm/API';
}

// [P0-1 route fix 20260609] AiTools / AiKnowledge live at /api/<Controller>/ on
// Oqtane — NOT /api/MegaForm/<Controller>/. apiBase() returns /api/MegaForm on
// Oqtane, so `${apiBase()}/AiTools/...` = /api/MegaForm/AiTools/... → 404
// (confirmed live). Mirror unified-shell.ts aiBase() so AI tool calls resolve on
// both platforms. Returns WITHOUT a trailing slash to match the buildUrl join.
function aiBase(): string {
  const w = window as any;
  const pf = w.__MF_PLATFORM__ || {};
  if (typeof pf.aiApiBase === 'string' && pf.aiApiBase) return String(pf.aiApiBase).replace(/\/+$/, '');
  const platform = String(pf.platform || '').toLowerCase();
  if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api';
  }
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

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { credentials: 'same-origin', headers: headers() });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

// [TASK A] POST helper for the SQL proof tools (PreviewSql / DryRunValidate take
// a body). Routes through aiBase() so it resolves on both DNN + Oqtane.
async function postJson(action: string, body: any): Promise<any> {
  const res = await fetch(`${aiBase()}/AiTools/${action}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + action);
  return res.json();
}

function buildUrl(action: string, query: Record<string, any>): string {
  const usp = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v == null || v === '') return;
    usp.append(k, String(v));
  });
  const qs = usp.toString();
  return `${aiBase()}/AiTools/${action}${qs ? '?' + qs : ''}`;
}

// Razor List endpoint lives on its own controller (not AiTools) — same on
// DNN and Oqtane via the MegaFormPopup namespace.
function razorListUrl(): string {
  const base = apiBase();
  if (/\/api\/MegaForm\//i.test(base) || /\/api\/MegaFormPopup\//i.test(base)) {
    const origin = base.replace(/\/api\/.*$/i, '');
    return origin + '/api/MegaFormPopup/RazorWidget/List';
  }
  // DNN catch-all
  return base.replace(/\/$/, '') + '/RazorWidget/List';
}

/**
 * Dispatch one tool call. Returns a small JSON-serialisable object;
 * caller converts it to a string for the assistant context.
 */
export async function dispatchToolCall(call: ToolCall): Promise<any> {
  const a = call.args || {};
  switch (call.name) {
    case 'list_kinds':
      return fetchJson(buildUrl('Kinds', {}));
    case 'list_knowledge':
      return fetchJson(buildUrl('Knowledge', { kind: a.kind, search: a.search, top: a.top }));
    case 'get_knowledge':
      return fetchJson(buildUrl('GetKnowledge', { slug: a.slug }));
    case 'list_widgets':
      return fetchJson(buildUrl('Widgets', {}));
    case 'get_widget':
      return fetchJson(buildUrl('Widget', { slug: a.slug }));
    case 'inspect_form_customizations':
      return (() => {
        const B = (window as any).MegaFormBuilder;
        if (!B || !B.state || !B.state.schema) return { error: 'Builder state not available' };
        const s = (B.state.schema.settings || B.state.schema.Settings || {}) as any;
        const len = (v: any) => (v == null ? 0 : typeof v === 'string' ? v.length : Object.keys(v).length);
        const sample = (v: string, n = 200) => (typeof v === 'string' && v ? v.slice(0, n) + (v.length > n ? '…' : '') : null);
        const customHtmlStr = String(s.customHtml || s.CustomHtml || '');
        const customCssStr  = String(s.customCss  || s.CustomCss  || '');
        const theme         = String(s.theme || s.Theme || '');
        const templateGuideSlug = String(s.templateGuideSlug || s.TemplateGuideSlug || '').trim();

        // [v20260530-18] Detect premium custom-shell mode (theme=custom +
        // non-empty customHtml). In this mode the runtime renders customHtml
        // verbatim and inserts widget output at {{field:key}} placeholders —
        // AI's generic .mf-form / .mf-form-wrapper CSS rules get OVERRIDDEN
        // by the form's own scoped CSS (e.g. .mfp.mfp-product-consultation).
        const isCustomShellMode = (theme === 'custom') && customHtmlStr.length > 0;

        // Extract CSS variables declared in customCss — these are the
        // canonical "color/font/spacing tweak surface" of a premium form.
        // Edit them by APPENDING a new selector that re-declares the var
        // value, never by hand-rolling a new color rule.
        const cssVars = Array.from(customCssStr.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;]+);/gi))
          .slice(0, 40)
          .map((m: any) => ({ name: '--' + m[1], value: String(m[2]).trim() }));

        // Extract the scoped root container class(es) — usually the most
        // specific selector at the start of the customHtml's root element.
        const rootClassMatch = customHtmlStr.match(/^\s*<[a-z]+\b[^>]*\bclass\s*=\s*['"]([^'"]+)['"]/i);
        const rootClasses = rootClassMatch
          ? rootClassMatch[1].split(/\s+/).filter(c => /^[a-z]/i.test(c)).slice(0, 6)
          : [];
        const scopedSelector = rootClasses.length
          ? '.' + rootClasses.join('.')
          : null;

        // Extract width / max-width rules so AI knows what to override for
        // full-width requests.
        const widthRules = Array.from(customCssStr.matchAll(/(\.[a-zA-Z][^{}\n]{0,160})\{[^}]{0,500}?(max-width|width)\s*:\s*([^;}]+)[;}]/g))
          .slice(0, 10)
          .map((m: any) => ({ selector: String(m[1]).trim(), prop: m[2], value: String(m[3]).trim() }));

        return {
          formId: B.state.formId || null,
          templateGuideSlug: templateGuideSlug || null,
          isCustomShellMode,
          theme: theme || null,
          customHtml: { present: customHtmlStr.length > 0, length: customHtmlStr.length, preview: sample(customHtmlStr) },
          customCss:  { present: customCssStr.length > 0,  length: customCssStr.length,  preview: sample(customCssStr) },
          customScripts: { present: !!(s.customScripts || s.CustomScripts), keys: Object.keys(s.customScripts || s.CustomScripts || {}) },
          themeCssOverrides: { present: !!(s.themeCssOverrides || s.ThemeCssOverrides), keys: Object.keys(s.themeCssOverrides || s.ThemeCssOverrides || {}) },
          fieldKeysReferencedInCustomHtml: (typeof customHtmlStr === 'string'
            ? Array.from(customHtmlStr.matchAll(/\{\{\s*field\s*:\s*([a-zA-Z0-9_-]+)\s*\}\}/g)).map((m: any) => m[1])
            : []),
          cssVariables: cssVars,            // ← tweakable color/font/spacing tokens
          scopedRootSelector: scopedSelector, // ← e.g. ".mfp.mfp-product-consultation"
          widthRules,                       // ← AI sees existing max-width rules to override
          rule: isCustomShellMode
            ? '[PREMIUM-SHELL] This is a premium custom-shell form. (1) To change COLOR/FONT/SPACING → APPEND to customCss a re-declaration of the relevant CSS variable scoped to the root, e.g. ' + (scopedSelector || '.mfp') + ' { --pc-primary: #YOUR_COLOR; }. The 13 variables are listed in cssVariables. NEVER hand-roll new .mf-form rules — they get overridden by scoped CSS. (2) To make full-width → APPEND scoped override with !important, e.g. ' + (scopedSelector || '.mfp') + ' .mfp-container { max-width: 100% !important; width: 100% !important; padding: 0 24px; }. The existing max-width rules are listed in widthRules. (3) NEVER edit customHtml structure or customScripts without explicit user approval (PRESERVE-001/002 rules apply).'
            : 'PRESERVE-001: when customHtml is non-empty, new fields must appear as {{field:key}} placeholders in customHtml OR the field will be invisible at runtime. PRESERVE-002: replace_form_schema auto-rejects unless preserveCustomizations:true or mergeWithCustomHtml:true is set. PRESERVE-003: Html field cannot define new global CSS classes via <style> blocks — use settings.customCss or inline style="…" only.',
        };
      })();
    case 'get_safe_image_url':
      // Client-side helper — no round trip needed. Build the URL inline
      // so the AI never sees a placeholder it could hallucinate around.
      return (() => {
        const kw = String(a.keywords || '').trim();
        if (!kw) return { error: 'keywords required' };
        const w = Math.min(2400, Math.max(80, Number(a.width)  || 800));
        const h = Math.min(2400, Math.max(80, Number(a.height) || 400));
        const seed = encodeURIComponent(kw.replace(/\s+/g, '-').slice(0, 60));
        if (String(a.style || '').toLowerCase() === 'placeholder') {
          const label = encodeURIComponent(kw.slice(0, 40));
          return { url: 'https://placehold.co/' + w + 'x' + h + '/eef2ff/6366f1?text=' + label, source: 'placehold.co' };
        }
        return { url: 'https://picsum.photos/seed/' + seed + '/' + w + '/' + h, source: 'picsum.photos' };
      })();
    case 'get_widget_bundle':
      return fetchJson(buildUrl('GetWidgetBundle', { slug: a.slug, recentLessons: a.recentLessons }));
    case 'get_prompt_recipe':
      return fetchJson(buildUrl('GetPromptRecipe', { slug: a.slug }));
    case 'get_template_guide':
      return fetchJson(buildUrl('GetTemplateGuide', { slug: a.slug }));
    case 'list_forms':
      return fetchJson(buildUrl('Forms', { search: a.search, top: a.top }));
    case 'get_form':
      return fetchJson(buildUrl('Form', { formId: a.formId }));
    case 'list_sql_tables':
      return fetchJson(buildUrl('SqlTables', { search: a.search, top: a.top }));
    case 'get_table_columns':
      return fetchJson(buildUrl('SqlColumns', { table: a.table }));
    case 'preview_sql':
      return postJson('PreviewSql', { sql: a.sql, connectionKey: a.connectionKey, pageSize: a.pageSize });
    case 'dry_run_validate':
      return postJson('DryRunValidate', { sql: a.sql, connectionKey: a.connectionKey });
    case 'list_designers':
      return fetchJson(buildUrl('Designers', {}));
    case 'get_designer':
      return fetchJson(buildUrl('Designer', { slug: a.slug }));
    case 'find_cascade_pattern':
      return fetchJson(buildUrl('Cascade', { parentColumn: a.parentColumn, childTable: a.childTable }));
    case 'propose_table_schema':
      return fetchJson(buildUrl('ProposeTableSchema', { formId: a.formId, tableName: a.tableName, schemaName: a.schemaName }));
    case 'list_razor_templates':
      return fetchJson(razorListUrl());
    case 'get_razor_template_source':
      return fetchJson(buildUrl('RazorTemplateSource', { name: a.name }));
    default:
      return { error: 'Unknown tool: ' + call.name };
  }
}

/**
 * [v20260529-08] Serialize a tool result, capping size so the model's TPM
 * budget isn't blown after a few tool calls. OpenAI gpt-4o caps at 30k
 * TPM; a chain of 8-12 tool calls each returning 4-8 KB of JSON easily
 * exceeds that and the user sees a 429 mid-conversation. We:
 *   - Cap the serialized string at MAX_TOOL_RESULT_CHARS
 *   - Trim huge string fields (body / DDL / sample data) to a hint
 *   - Keep the small summary fields (slug, title, summary) intact
 */
const MAX_TOOL_RESULT_CHARS = 3000;

export function serializeToolResult(value: any): string {
  try {
    const slim = slimDeep(value);
    let s = JSON.stringify(slim);
    if (s.length > MAX_TOOL_RESULT_CHARS) {
      s = s.slice(0, MAX_TOOL_RESULT_CHARS) + '…(truncated; ask for a more specific slug)"}';
    }
    return s;
  } catch { return String(value); }
}

function slimDeep(v: any): any {
  if (v == null) return v;
  if (Array.isArray(v)) return v.slice(0, 50).map(slimDeep);
  if (typeof v === 'string') {
    return v.length > 600 ? v.slice(0, 600) + '…(truncated)' : v;
  }
  if (typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = slimDeep(v[k]);
    return out;
  }
  return v;
}

// Expose globally so admin tooling can inspect.
(window as any).MFAI_Tools = { TOOL_DEFS, dispatchToolCall, serializeToolResult, badge: TOOLS_BADGE };
