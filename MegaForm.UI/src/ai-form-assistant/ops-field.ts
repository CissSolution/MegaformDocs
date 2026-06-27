/* [split 2026-06-27] Extracted from the former 2408-line ops.ts. */
import { insertIntoCardBody, syncFieldPlaceholders } from '@shared/custom-html-insert';
import { applyHtmlTextSwaps, collectHtmlTextNodes } from '@shared/html-text-swap';
import {
  type Op, type OpResult,
  getSchema, getBuilder, findField, setByPath, uniqKey, reRenderCanvas,
  resolveCompositeAlias, normalizeFieldType, normalizeCompositeField,
  normalizeOptionFields, normalizeDynamicLabelProps, normalizeDataRepeaterProps,
  isAllowedImageUrl, getActiveTemplateGuide, guideForbiddenTypes, guideLockedKeys,
  guideImmutableDesign, validateRuleArray,
} from './ops-shared';
export function opAddField(op: Op): OpResult {
  const schema = getSchema();
  if (!schema) return { op: op.op, ok: false, message: 'No active form schema' };
  const aliasPreset = resolveCompositeAlias(String(op.type || ''));
  const type = aliasPreset ? 'Composite' : normalizeFieldType(String(op.type || 'Text'));
  const label = String(op.label || type);
  const proposedKey = String(op.key || label);
  const existingKeys = schema.fields.map((f: any) => String(f.key || ''));
  const key = existingKeys.indexOf(proposedKey) >= 0 ? uniqKey(proposedKey, existingKeys) : (proposedKey || uniqKey('field', existingKeys));

  // [v20260530-02] SQL-driven Select/Radio/Checkbox props MUST live under
  // field.properties.* — that's where FieldOptionsService.FindFieldProperties
  // reads from + where the Properties UI looks. We accept the LLM emitting
  // them at top level or under widgetProps.dataSource (common mistakes) and
  // normalise into field.properties below.
  const field: any = {
    key,
    type,
    label,
    required: !!op.required,
    placeholder: op.placeholder || '',
    helpText: op.helpText || '',
    defaultValue: op.defaultValue !== undefined ? op.defaultValue : '',
    cssClass: op.cssClass || '',
    width: op.width || '100%',
    readOnly: !!op.readOnly,
    prefillParam: op.prefillParam || '',
    validation: op.validation || {},
    options: Array.isArray(op.options) ? op.options : [],
    showIf: op.showIf || null,
    htmlContent: op.htmlContent || '',
    fileSettings: op.fileSettings || null,
    properties: op.properties ? { ...op.properties } : {},
    widgetProps: op.widgetProps || {},
    // Top-level shadow copies — normalizeOptionFields hoists them into
    // field.properties and then deletes them.
    optionsSource:        op.optionsSource        || '',
    optionsType:          op.optionsType          || '',
    optionsConnectionKey: op.optionsConnectionKey || '',
    optionsDatabaseType:  op.optionsDatabaseType  || '',
    optionsSql:           op.optionsSql           || '',
    optionsDependsOn:     Array.isArray(op.optionsDependsOn) ? op.optionsDependsOn : [],
    optionsReloadOnChange: op.optionsReloadOnChange,
  };
  // [B172] Composite alias → ensure widgetProps.preset is set so the renderer can
  // resolve the sub-input layout (phone/name/address/ssn/dob/time/…).
  if (aliasPreset) {
    field.widgetProps = (field.widgetProps && typeof field.widgetProps === 'object') ? field.widgetProps : {};
    if (!field.widgetProps.preset) field.widgetProps.preset = aliasPreset;
  }
  normalizeOptionFields(field);
  normalizeDynamicLabelProps(field);
  normalizeDataRepeaterProps(field);

  // [v20260530-10] HARD BLOCK: don't add a DynamicLabel with placeholder
  // text and no SQL — the user sees meaningless "Hello World" / "Dynamic
  // label" copy. AI must supply a real template or a SQL source.
  if (String(type).toLowerCase() === 'dynamiclabel') {
    const wp = field.widgetProps || {};
    const hasSql = !!String(wp.masterQuery || '').trim();
    const html = String(wp.htmlContent || field.htmlContent || '').trim();
    const isPlaceholder = !html || /^(<p>)?\s*(hello\s+world|dynamic\s+label|placeholder|sample\s+text|\.\.\.+)?\s*(<\/p>)?$/i.test(html);
    if (!hasSql && isPlaceholder) {
      return {
        op: op.op, ok: false,
        message: '[DL-001] Refused to add "' + key + '" (DynamicLabel): no SQL (widgetProps.masterQuery) AND no real htmlContent — would render placeholder "Hello World"/"Dynamic label" text only. Either: (1) wire SQL → set widgetProps.{useSql:true, dataSource:"sql", resultMode:"multi", connectionKey:"DashboardDatabase", masterQuery, wrapperTemplate, rowTemplate}; or (2) supply a real widgetProps.htmlContent with {{field:KEY}} or {{submission:KEY}} tokens.',
      };
    }
  }

  // [v20260530-16] HARD BLOCK: PRESERVE-001 — form has non-empty customHtml,
  // meaning the runtime renders THAT HTML instead of auto-laying out the
  // schema fields. A new field added without extending customHtml will be
  // INVISIBLE at runtime — silently broken from the user's perspective.
  // Require AI to either (a) inject {{field:key}} placeholders into the
  // existing customHtml, or (b) pass forceAddDespiteCustomHtml:true after
  // confirming with the user.
  {
    const ex = (schema.settings || (schema as any).Settings || {}) as any;
    const customHtml = (ex.customHtml || ex.CustomHtml || '').toString().trim();
    if (customHtml && !op.forceAddDespiteCustomHtml) {
      const placeholderRegex = new RegExp('\\{\\{\\s*field\\s*:\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'i');
      if (!placeholderRegex.test(customHtml)) {
        return {
          op: op.op, ok: false,
          message: '[PRESERVE-001] Refused to add "' + key + '" (' + type + '): the form has a non-empty settings.customHtml (' + customHtml.length + ' chars) and the new field key is NOT referenced as {{field:' + key + '}} anywhere in it. Adding the field anyway would make it INVISIBLE at runtime (custom HTML mode bypasses auto-layout). Pick ONE: (1) update settings.customHtml first to include the new placeholder (use set_form_meta or replace_form_schema); (2) re-emit with forceAddDespiteCustomHtml:true after ASKING the user via chat_message whether they accept that the field will not render until customHtml is updated.',
        };
      }
    }
  }

  // [v20260530-16] HARD BLOCK: PRESERVE-003 — Html field with inline <style>
  // that defines global classes will fight the premium theme's CSS.
  // Inline element-scoped styles via style="…" attribute are fine; full
  // <style> blocks belong in settings.customCss so theme overrides survive.
  if (String(type).toLowerCase() === 'html') {
    const html = String(field.htmlContent || '');
    const styleBlocks = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
    if (styleBlocks.length > 0) {
      // Allow <style scoped> or trivial <=300ch single-purpose rules. Reject
      // anything that defines global class names.
      const allowed = styleBlocks.every(block => {
        const inner = block.replace(/<style\b[^>]*>|<\/style>/gi, '');
        const hasGlobalClass = /(^|\}|\s)\.[a-z][\w-]+(\s|,|\{)/i.test(inner);
        return inner.length <= 200 && !hasGlobalClass;
      });
      if (!allowed) {
        return {
          op: op.op, ok: false,
          message: '[PRESERVE-003] Refused to add "' + key + '" (Html): htmlContent contains a <style> block that defines global CSS classes — this fights the premium theme. Pick ONE: (1) move CSS to settings.customCss via set_form_meta or replace_form_schema; (2) use INLINE style="..." attributes scoped to specific elements; (3) reuse existing theme classes (mf-grid, mf-card, mf-section, mfp-* for premium themes, acme-* if loaded). Do NOT invent new global class names.',
        };
      }
    }
  }

  // [v20260530-15] HARD BLOCK: Retired widgets. The Subform widget was
  // removed entirely (0 live forms used it). GridRepeater is deprecated
  // but kept in runtime so the 2 live forms still render — AI must NOT
  // suggest either for new forms. DataGrid (input mode + SQL display mode)
  // covers both use cases.
  const lower = String(type).toLowerCase();
  // [GUIDE-003] Template-guide forbidden field types.
  const guide = getActiveTemplateGuide();
  const forbiddenTypes = guideForbiddenTypes(guide);
  if (forbiddenTypes.length > 0 && forbiddenTypes.indexOf(lower) >= 0) {
    return {
      op: op.op, ok: false,
      message: '[GUIDE-003] Refused to add "' + key + '" (' + type + '): the template guide forbids field type "' + type + '" for this Premium form. Allowed alternatives depend on the template; check the guide\'s compositeWidgetPolicy.forbiddenFieldTypes.',
    };
  }

  if (lower === 'subform') {
    return {
      op: op.op, ok: false,
      message: '[RETIRED-001] Refused to add "' + key + '" (Subform): the Subform widget was retired on 2026-05-29. Use DataGrid instead — widgetProps.columns:[{key,label,type,required?},…] gives the same row-collector UI with inline + modal edit modes. See widget-datagrid bundle.',
    };
  }
  if (lower === 'gridrepeater') {
    return {
      op: op.op, ok: false,
      message: '[GR-DEPRECATED] Refused to add "' + key + '" (GridRepeater): widget is deprecated. Use DataGrid instead — for invoice/line-items input: widgetProps.columns; for SQL display: widgetProps.{useSql:true, masterQuery, queryDependsOn}. The 2 existing live forms using GridRepeater still render (runtime is retained) but new forms must use DataGrid.',
    };
  }

  // [v20260530-13] HARD BLOCK: Html with an <img src="…"> URL from a
  // disallowed host. The AI used to hallucinate URLs (e.g.
  // source.unsplash.com/random/...) that 404'd at runtime and rendered
  // as a broken-image icon. Allowlist: picsum.photos, placehold.co,
  // data: URIs, images.unsplash.com (deep-link only — NOT source.unsplash.com),
  // and any same-origin / relative path. Anything else → reject with the
  // get_safe_image_url tool as the fix.
  if (String(type).toLowerCase() === 'html') {
    const html = String(field.htmlContent || '');
    const imgSrcs = (html.match(/<img\b[^>]*?\bsrc\s*=\s*['"]([^'"]+)['"]/gi) || [])
      .map(m => /src\s*=\s*['"]([^'"]+)['"]/.exec(m)?.[1] || '')
      .filter(Boolean);
    if (imgSrcs.length > 0) {
      const bad = imgSrcs.find(u => !isAllowedImageUrl(u));
      if (bad) {
        return {
          op: op.op, ok: false,
          message: '[IMG-001] Refused to add "' + key + '" (Html): contains <img src="' + bad.slice(0, 100) + '..."> from a host the renderer cannot verify. Image will likely render as a broken icon. FIX: Use one of these methods instead — (1) call the `get_safe_image_url` tool to get a guaranteed-working URL, then emit it; (2) call `set_field_image_unsplash` op (target:"htmlContent") which writes the <img> tag for you using picsum.photos; or (3) use one of these allowed hosts in the URL: picsum.photos/seed/<keyword>/W/H, placehold.co/WxH/<bg>/<fg>?text=Label, data: URI, or a same-origin / relative path.',
        };
      }
    }
  }

  // [v20260530-11] HARD BLOCK: DataGrid without SQL config AND without
  // a custom columns schema falls back to the invoice-style defaults
  // (ITEM/QTY/PRICE/TOTAL) which never match the user's intent. Force AI
  // to either wire SQL display mode or supply a real columns schema.
  if (String(type).toLowerCase() === 'datagrid') {
    const wp = field.widgetProps || {};
    const hasSql = !!String(wp.masterQuery || '').trim();
    const customCols = Array.isArray(wp.columns) ? wp.columns : [];
    const hasCustomColumns = customCols.length > 0;
    if (!hasSql && !hasCustomColumns) {
      return {
        op: op.op, ok: false,
        message: '[DG-001] Refused to add "' + key + '" (DataGrid): no widgetProps.masterQuery AND no widgetProps.columns — would render the default invoice template (ITEM/QTY/PRICE/TOTAL) which never matches the user\'s intent. Pick ONE: (1) DISPLAY mode for parent-cascade data → set widgetProps.{useSql:true, dataSource:"sql", connectionKey:"DashboardDatabase", masterQuery, queryDependsOn:"parent_key"}; or (2) INPUT mode for line-items entry → set widgetProps.columns=[{key,label,type,required?,decimals?,computeFormula?}...]. For most "show/display/list data related to X" requests, DynamicLabel with cascade SQL is the better default — use DataGrid SQL only when the user explicitly wants tabular rows.',
      };
    }
  }

  // [v20260530-11] HARD BLOCK: DataRepeater without SQL config is broken —
  // the widget needs widgetProps.masterQuery to render anything. Bare emits
  // produce a "Loading…" spinner that never resolves.
  if (String(type).toLowerCase() === 'datarepeater' || String(type).toLowerCase() === 'gridrepeater') {
    const wp = field.widgetProps || {};
    const hasSql = !!String(wp.masterQuery || '').trim();
    if (!hasSql) {
      return {
        op: op.op, ok: false,
        message: '[DR-001] Refused to add "' + key + '" (' + type + '): no widgetProps.masterQuery. Set widgetProps.{useSql:true, dataSource:"sql", connectionKey:"DashboardDatabase", masterQuery:"SELECT ... WHERE ParentId = :parent_key", queryDependsOn:"parent_key", masterTemplate, detailTemplate}. If you only need to display fields against a parent without tabular rows, DynamicLabel is the simpler choice.',
      };
    }
  }

  // [v20260530-08] HARD BLOCK: don't add a field whose cascade parent is
  // missing OR is a display-only widget (DataRepeater). Soft warnings from
  // v20260530-05 left the canvas half-broken. Now we refuse with ok:false
  // so AI sees actionable failure on next turn.
  const blockingDeps: string[] = [];
  if (Array.isArray(field.properties?.optionsDependsOn)) blockingDeps.push(...field.properties.optionsDependsOn);
  if (Array.isArray(field.widgetProps?.queryDependsOn)) blockingDeps.push(...field.widgetProps.queryDependsOn);
  else if (typeof field.widgetProps?.queryDependsOn === 'string') {
    blockingDeps.push(...String(field.widgetProps.queryDependsOn).split(/[ ,]+/).filter(Boolean));
  }
  for (const parentKey of blockingDeps) {
    const parent = schema.fields.find((f: any) => String(f.key) === parentKey);
    if (!parent) {
      return {
        op: op.op, ok: false,
        message: 'Refused to add "' + key + '" (' + type + '): depends on "' + parentKey + '" which does not exist. Add a Select (with optionsSql or static options) for "' + parentKey + '" FIRST, then re-emit add_field for "' + key + '". DataRepeater is display-only — the cascade parent MUST be a Select / Text / Number, never another DataRepeater.',
      };
    }
    const parentType = String(parent.type).toLowerCase();
    if (parentType === 'datarepeater' || parentType === 'gridrepeater') {
      return {
        op: op.op, ok: false,
        message: 'Refused to add "' + key + '": parent "' + parentKey + '" is a ' + parent.type + ' (display-only). User cannot pick a value from it to drive the cascade. Replace "' + parentKey + '" with a Select (use its existing SQL as properties.optionsSql) so user can pick a row before "' + key + '" fetches.',
      };
    }
    const inputTypes = ['select','dropdown','text','number','hidden','date','radio','checkbox'];
    if (!inputTypes.includes(parentType)) {
      return {
        op: op.op, ok: false,
        message: 'Refused to add "' + key + '": parent "' + parentKey + '" has type "' + parent.type + '" which does not produce a pickable value. Use Select / Text / Number / Date as the cascade parent.',
      };
    }
    if (parentType === 'select' || parentType === 'dropdown' || parentType === 'radio' || parentType === 'checkbox') {
      const parentHasStatic = Array.isArray(parent.options) && parent.options.length > 0;
      const parentHasSql = parent.properties && parent.properties.optionsSql;
      if (!parentHasStatic && !parentHasSql) {
        return {
          op: op.op, ok: false,
          message: 'Refused to add "' + key + '": parent "' + parentKey + '" is an empty ' + parent.type + ' with no options source. Set properties.optionsSql on "' + parentKey + '" (via set_field_property) OR re-create it with options, then re-emit "' + key + '".',
        };
      }
    }
  }

  const insertAt = typeof op.insertAt === 'number' && op.insertAt >= 0 && op.insertAt <= schema.fields.length
    ? op.insertAt
    : schema.fields.length;
  schema.fields.splice(insertAt, 0, field);
  reRenderCanvas();

  // [v20260530-03] Warn when an option-bearing widget lands with NO source
  // of options. Silently empty dropdowns are the most common "AI looks like
  // it worked but the form is broken" failure mode.
  const t = String(type).toLowerCase();
  const warnings: string[] = [];
  if (t === 'select' || t === 'dropdown' || t === 'radio' || t === 'checkbox') {
    const hasStatic = Array.isArray(field.options) && field.options.length > 0;
    const hasSql = field.properties && (field.properties.optionsSql || field.properties.optionsSource === 'form-lookup');
    if (!hasStatic && !hasSql) {
      warnings.push('no options yet — give ' + key + ' static options or properties.optionsSql against a table');
    }
  }
  // [v20260530-08] Cascade-parent validation is now a HARD BLOCK above (no
  // field ever lands with a broken cascade). Only "no options yet" warning
  // for terminal Select/Radio/Checkbox remains here.
  if (warnings.length) {
    return {
      op: op.op, ok: true,
      message: 'Added field ' + key + ' (' + type + ') — ⚠ ' + warnings.join('; '),
      detail: { key, type, warnings },
    };
  }

  return { op: op.op, ok: true, message: 'Added field ' + key + ' (' + type + ')', detail: { key, type } };
}

export function opRemoveField(op: Op): OpResult {
  const schema = getSchema();
  if (!schema) return { op: op.op, ok: false, message: 'No active form schema' };
  const key = String(op.key || '');
  // [GUIDE-004] Template-guide locked/required keys cannot be removed.
  const guide = getActiveTemplateGuide();
  const locked = guideLockedKeys(guide);
  if (locked.indexOf(key) >= 0) {
    return {
      op: op.op, ok: false,
      message: '[GUIDE-004] Refused to remove "' + key + '": this key is part of the template design contract (locked/required). You may only change its label/options/required flag via set_field_property.',
    };
  }
  const idx = schema.fields.findIndex((f: any) => String(f.key) === key);
  if (idx < 0) return { op: op.op, ok: false, message: 'Field not found: ' + key };
  schema.fields.splice(idx, 1);
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Removed field ' + key };
}

export function opSetFieldProperty(op: Op): OpResult {
  // [GUIDE-005] Renaming or retyping locked keys is forbidden.
  const guide = getActiveTemplateGuide();
  const locked = guideLockedKeys(guide);
  if (locked.indexOf(String(op.key || '')) >= 0) {
    const path = String(op.path || '');
    if (path === 'key' || path === 'type' || path === 'fieldType') {
      return {
        op: op.op, ok: false,
        message: '[GUIDE-005] Refused to ' + path + ' the locked field "' + op.key + '". Locked keys are structural in this Premium template; only label, placeholder, required, options, and properties may be edited.',
      };
    }
  }
  const field = findField(op.key);
  if (!field) {
    // [v20260530-06] More actionable error than the bare "Field not found:".
    // This is THE most common AI mistake — emitting set_field_property
    // against a key that doesn't exist (hallucinated from history). The
    // user sees this error in the op result list; the AI sees it in the
    // next turn when we forward the chat history.
    return {
      op: op.op, ok: false,
      message: 'Field "' + op.key + '" does not exist on this form. To create it use add_field. To edit an existing field, first list_forms / get_form to confirm its real key.',
    };
  }
  const propPath = String(op.path || op.propPath || '');
  if (!propPath) return { op: op.op, ok: false, message: 'No property path' };

  // [v20260530-17] STYLE-001 — Row renders through columns[].fields[] and
  // never reads widgetProps.*. set_field_property with widgetProps.style /
  // widgetProps.* on a Row is a guaranteed no-op. Reject so AI uses
  // settings.customCss + field.cssClass instead (KB form_pattern-form-styling).
  if (String(field.type) === 'Row' && /^widgetProps\b/i.test(propPath)) {
    return {
      op: op.op, ok: false,
      message: '[STYLE-001] Refused to set ' + op.key + '.' + propPath + ': Row renders through its columns[].fields[] and does NOT read widgetProps.*. This op would be a no-op at runtime. For row background/padding/border: (1) add the CSS class via settings.customCss using a single set_form_meta op, e.g. customCss:".mf-form .mf-field-group--row.row-highlight { background:#eef2ff;padding:16px;border-radius:10px }"; (2) set_field_property key:"' + op.key + '" path:"cssClass" value:"row-highlight". Per-row inline styling spreads CSS work across many ops and fights the active theme.',
    };
  }

  // [v20260530-17] STYLE-003 — AI sometimes emits widgetProps.style on
  // field types that do not render via widgetProps (basic inputs +
  // Section + Hidden). Reject those too — they are no-ops.
  const noWidgetStyle = ['Text','Email','Number','Phone','Date','Time','Datetime','Select','Radio','Checkbox','File','Hidden','Section'];
  if (noWidgetStyle.indexOf(String(field.type)) >= 0 && /^widgetProps\.style\b/i.test(propPath)) {
    return {
      op: op.op, ok: false,
      message: '[STYLE-003] Refused to set ' + op.key + '.' + propPath + ': ' + field.type + ' fields do NOT read widgetProps.style at runtime. Use ONE of: (a) settings.customCss with .mf-field-group[data-key="' + op.key + '"] { … } for per-field styling; (b) field.cssClass + a class in settings.customCss; (c) for Radio/Checkbox multi-column layout use field.optionColumns (integer 1..4) — that is the BUILT-IN renderer prop (auto-applies class .mf-cols-N).',
    };
  }

  setByPath(field, propPath, op.value);
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Set ' + op.key + '.' + propPath };
}

export function opSetFieldSql(op: Op): OpResult {
  const field = findField(op.key);
  if (!field) return { op: op.op, ok: false, message: 'Field not found: ' + op.key };
  if (!field.widgetProps) field.widgetProps = {};
  const wp = field.widgetProps;
  wp.useSql = true;
  wp.dataSource = 'sql';
  if (!wp.connectionKey) wp.connectionKey = 'DashboardDatabase';
  if (op.masterQuery !== undefined) wp.masterQuery = String(op.masterQuery);
  if (op.mode) wp.resultMode = String(op.mode);
  if (op.queryDependsOn !== undefined) wp.queryDependsOn = String(op.queryDependsOn);
  if (op.templates && typeof op.templates === 'object') {
    if (op.templates.header !== undefined) wp.headerTemplate = String(op.templates.header);
    if (op.templates.detail !== undefined) wp.detailTemplate = String(op.templates.detail);
    if (op.templates.footer !== undefined) wp.footerTemplate = String(op.templates.footer);
    if (op.templates.pager !== undefined) wp.pagerTemplate = String(op.templates.pager);
    if (op.templates.simple !== undefined) wp.sqlTemplate = String(op.templates.simple);
  }
  if (typeof op.pageSize === 'number') wp.pageSize = op.pageSize;
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Applied SQL to ' + op.key };
}

export function opApplyDynLabelPreset(op: Op): OpResult {
  const field = findField(op.key || op.fieldKey);
  if (!field) return { op: op.op, ok: false, message: 'Field not found' };
  // Look up the registered DynamicLabel widget plugin and pull samples from it
  const W = (window as any).MegaFormWidgets;
  if (!W || typeof W.getPlugin !== 'function') {
    return { op: op.op, ok: false, message: 'MegaFormWidgets registry not available' };
  }
  const plugin = W.getPlugin('DynamicLabel');
  if (!plugin || !plugin.properties) return { op: op.op, ok: false, message: 'DynamicLabel plugin not registered' };
  const helpProp = plugin.properties.find((p: any) => p && p.type === 'help' && Array.isArray(p.samples));
  const samples = (helpProp && helpProp.samples) || [];
  let preset: any = null;
  if (typeof op.presetIndex === 'number') preset = samples[op.presetIndex];
  else if (op.presetLabel) {
    const target = String(op.presetLabel).toLowerCase();
    preset = samples.find((s: any) => String(s.label || '').toLowerCase().indexOf(target) >= 0);
  }
  if (!preset || !preset.apply) return { op: op.op, ok: false, message: 'Preset not found' };
  field.widgetProps = field.widgetProps || {};
  Object.keys(preset.apply).forEach((k) => { field.widgetProps[k] = preset.apply[k]; });
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Applied preset to ' + field.key };
}
export function opReorderFields(op: Op): OpResult {
  const schema = getSchema();
  if (!schema) return { op: op.op, ok: false, message: 'No schema' };
  const keys = Array.isArray(op.keys) ? op.keys : [];
  const map: Record<string, any> = {};
  schema.fields.forEach((f: any) => { map[String(f.key)] = f; });
  const next: any[] = [];
  keys.forEach((k: string) => { if (map[k]) { next.push(map[k]); delete map[k]; } });
  Object.keys(map).forEach((k) => next.push(map[k]));
  schema.fields = next;
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Fields reordered (' + keys.length + ')' };
}

export function opSaveForm(op: Op): OpResult {
  const B = getBuilder();
  if (!B) return { op: op.op, ok: false, message: 'Builder not available' };
  try {
    // [SaveHandlerFix v20260601-B13] toolbar.ts registers the module with
    // `saveForm: saveForm` (the actual function name), not `save`. Earlier
    // code probed B.toolbar.save → undefined → "No Save handler found".
    // Default status to "Draft" so AI ops match the user's manual click.
    if (B.toolbar && typeof B.toolbar.saveForm === 'function') {
      B.toolbar.saveForm(op.status || 'Draft');
      return { op: op.op, ok: true, message: 'Save triggered (' + (op.status || 'Draft') + ')' };
    }
    if (B.toolbar && typeof B.toolbar.save === 'function') {
      B.toolbar.save();
      return { op: op.op, ok: true, message: 'Save triggered' };
    }
    const btn = document.querySelector('#mf-btn-save-draft, [data-mf-action="save"], #mf-builder-save, .mf-builder-save') as HTMLElement | null;
    if (btn) { btn.click(); return { op: op.op, ok: true, message: 'Save button clicked' }; }
    return { op: op.op, ok: false, message: 'No Save handler found (looked for toolbar.saveForm / toolbar.save / save button)' };
  } catch (e) {
    return { op: op.op, ok: false, message: 'Save failed: ' + (e as Error).message };
  }
}

export function opChatMessage(op: Op): OpResult {
  // No-op for state; the chat UI prints op.text. Returning ok lets the
  // dispatcher echo a message into the chat log.
  return { op: op.op, ok: true, message: String(op.text || op.message || ''), detail: { text: op.text || op.message || '' } };
}

/**
 * [v20260528-14] Replace the entire form schema. Used when the AI wants to
 * make a large structural change (e.g. "rebuild this as a 3-step wizard")
 * rather than emit dozens of per-field ops. The builder canvas is re-rendered
 * after replacement so the new fields show up immediately.
 *
 *   { op: 'replace_form_schema', schema: { version: '1.0', fields: [...], settings: {...} } }
 */
export function opReplaceFormSchema(op: Op): OpResult {
  const B = getBuilder();
  if (!B || !B.state) return { op: op.op, ok: false, message: 'Builder not available' };
  const next = op.schema || op.value;
  if (!next || !Array.isArray(next.fields)) {
    return { op: op.op, ok: false, message: 'replace_form_schema requires { schema: { fields: [...] } }' };
  }
  // [B172] Normalise any composite alias field-types to the canonical Composite shape.
  next.fields.forEach(normalizeCompositeField);

  // [v20260530-16] PRESERVE-002 — refuse to wipe a customised premium form.
  // When the existing form has non-empty customHtml / customCss / customScripts
  // (or a non-default `theme`), blindly replacing the schema discards work the
  // user paid for. Require an explicit `preserveCustomizations:false` flag
  // OR a `mergeWithCustomHtml:true` flag to confirm intent.
  const existing = B.state.schema || {};
  const ex = (existing.settings || existing.Settings || {}) as any;
  const has = (v: any) => v != null && (typeof v === 'string' ? v.trim().length > 0 : Object.keys(v).length > 0);
  const customised = {
    customHtml:    has(ex.customHtml || ex.CustomHtml),
    customCss:     has(ex.customCss || ex.CustomCss),
    customScripts: has(ex.customScripts || ex.CustomScripts),
    theme:         has(ex.theme || ex.Theme),
    themeCssOverrides: has(ex.themeCssOverrides || ex.ThemeCssOverrides),
  };
  const customisedKeys = Object.keys(customised).filter(k => (customised as any)[k]);

  // [GUIDE-002] If the template guide declares design fields immutable,
  // block any replace_form_schema that does not preserve them.
  const guide = getActiveTemplateGuide();
  if (guide && customisedKeys.length > 0 && !op.preserveCustomizations && !op.mergeWithCustomHtml) {
    const immutable = guideImmutableDesign(guide);
    const immutableKeys = Object.keys(immutable).filter(k => (immutable as any)[k] && customisedKeys.includes(k === 'scripts' ? 'customScripts' : 'custom' + k.charAt(0).toUpperCase() + k.slice(1)));
    if (immutableKeys.length > 0) {
      return {
        op: op.op, ok: false,
        message: '[GUIDE-002] Refused to replace_form_schema: the template guide marks ' + immutableKeys.join(', ') + ' as immutable. Re-emit with preserveCustomizations:true to keep the existing design while changing fields/logic.',
      };
    }
  }

  // [v20260530-20 CONVERT-001 fix] Shared auto-merge — runs WHENEVER the
  // existing form has customisations, regardless of whether AI passed the
  // preserveCustomizations flag. The earlier code only merged inside the
  // reject branch, so when AI passed preserveCustomizations:true with
  // settings.customCss='' the wipe went through. The merge now ALWAYS
  // back-fills any empty/null design field from the existing settings.
  const nextSettings = (next.settings && typeof next.settings === 'object') ? next.settings : {};
  customisedKeys.forEach(k => {
    const sourceKey = k === 'customHtml' ? (ex.customHtml || ex.CustomHtml)
                    : k === 'customCss'  ? (ex.customCss  || ex.CustomCss)
                    : k === 'customScripts' ? (ex.customScripts || ex.CustomScripts)
                    : k === 'theme'      ? (ex.theme      || ex.Theme)
                    :                       (ex.themeCssOverrides || ex.ThemeCssOverrides);
    const v = (nextSettings as any)[k];
    const empty = v == null || (typeof v === 'string' && v.length === 0)
                || (typeof v === 'object' && Object.keys(v).length === 0);
    if (empty) (nextSettings as any)[k] = sourceKey;
  });
  next.settings = nextSettings;

  // [v20260611-PRESERVE-SYNC] When customHtml is preserved (auto-merge or
  // preserveCustomizations:true), ensure EVERY field key in the new schema has
  // a {{field:key}} placeholder inside customHtml. Fields without a placeholder
  // are INVISIBLE in custom-shell mode because the renderer bypasses auto-layout.
  // We silently append minimal placeholders for missing keys so the user sees
  // all fields without losing their premium design.
  const customHtmlAfterMerge = String(nextSettings.customHtml || nextSettings.CustomHtml || '');
  if (customHtmlAfterMerge.length > 0 && Array.isArray(next.fields)) {
    // [2026-06-27] Structure-aware sync (replaces the old flat append): a field that
    // renders via a parent Row gets NO own token (else first_name/last_name render
    // twice — once in the Row, once crammed at the end); a newly-added field's token
    // lands INSIDE its data-step panel rather than before the shared actions row at the
    // very end (which collapsed the multi-step wizard onto one cramped page); orphan +
    // duplicate tokens are dropped.
    const before = customHtmlAfterMerge;
    const patched = syncFieldPlaceholders(before, next.fields);
    if (patched !== before) {
      nextSettings.customHtml = patched;
      const synced: string[] = [];
      (function collect(arr: any[]) { for (const f of arr || []) { if (!f) continue; if (f.type === 'Row' && Array.isArray(f.columns)) { f.columns.forEach((c: any) => collect(c.fields || [])); } else if (f.key && before.indexOf('{{field:' + f.key + '}}') < 0 && patched.indexOf('{{field:' + f.key + '}}') >= 0) synced.push(f.key); } })(next.fields);
      if (synced.length) (op as any).__autoSyncFields = synced;
    }
  }

  if (customisedKeys.length > 0 && !op.preserveCustomizations && !op.mergeWithCustomHtml) {
    return {
      op: op.op, ok: false,
      message: '[PRESERVE-002] Refused to replace_form_schema: the existing form has customisations (' + customisedKeys.join(', ') + ') that would be wiped. Pick ONE: (1) re-emit with `preserveCustomizations:true` to AUTO-MERGE existing customHtml / customCss / customScripts / theme into your new settings; (2) re-emit with `mergeWithCustomHtml:true` to extend the existing customHtml with placeholders for your new fields ({{field:newkey}}); (3) ASK the user via chat_message before destroying their premium customisation. Hand-rolled schemas usually want option (1).',
    };
  }

  // [v20260530-28 RULES-001] Lift top-level next.rules INTO settings.rules
  // so the rule-builder-ui and renderer both find it. Production templates
  // put rules at the schema top level, but the AI dispatcher canonical
  // location is settings.rules. Mirror both — and stamp rulesJson — so every
  // load path works.
  const finalSettings = next.settings && typeof next.settings === 'object' ? next.settings : {};
  const topLevelRules = Array.isArray((next as any).rules) ? (next as any).rules : null;
  if (topLevelRules && !Array.isArray(finalSettings.rules)) {
    finalSettings.rules = topLevelRules;
  }
  // Validate whatever rules are about to be committed.
  const finalRulesArr = Array.isArray(finalSettings.rules) ? finalSettings.rules : [];
  if (finalRulesArr.length > 0) {
    const v = validateRuleArray(finalRulesArr);
    if (!v.ok) {
      return { op: op.op, ok: false, message: '[RULES-001] schema.rules failed validation: ' + v.error + '. See form_pattern-rules-overview.' };
    }
    finalSettings.rules = v.rules;
  }
  B.state.schema = {
    version: String(next.version || '1.0'),
    fields:  next.fields,
    settings: finalSettings,
  };
  if (Array.isArray(finalSettings.rules)) {
    (B.state.schema as any).rules = finalSettings.rules.slice();
    try { (B.state.schema as any).rulesJson = JSON.stringify(finalSettings.rules); } catch {}
  }
  reRenderCanvas();
  try {
    if (B.rulesUi && typeof B.rulesUi.loadRules === 'function') B.rulesUi.loadRules();
    else if (B.rules && typeof B.rules.loadRules === 'function') B.rules.loadRules();
  } catch {}
  const mergedHint = customisedKeys.length > 0 ? ' (preserved ' + customisedKeys.join(', ') + ')' : '';
  const rulesHint  = finalRulesArr.length > 0 ? ' [' + finalRulesArr.length + ' rules]' : '';
  const syncHint   = (op as any).__autoSyncFields?.length > 0
    ? ' [auto-sync placeholders: ' + (op as any).__autoSyncFields.join(', ') + ']'
    : '';
  return { op: op.op, ok: true, message: 'Schema replaced (' + next.fields.length + ' fields)' + mergedHint + rulesHint + syncHint };
}

/**
 * [v20260528-14] Attach a real Unsplash image URL to a field. Uses
 * source.unsplash.com which serves a working JPEG with no API key and is
 * always cacheable + visible. The AI passes a search query ("ocean", "team
 * meeting", etc.); we build the URL deterministically so the AI can't
 * hallucinate a 404.
 *
 *   { op:'set_field_image_unsplash', key:'hero', query:'mountain sunrise',
 *     width:1200, height:600, target:'defaultValue'|'widgetProps.imageUrl' }
 */
export function opSetFieldImageUnsplash(op: Op): OpResult {
  const field = findField(op.key);
  if (!field) return { op: op.op, ok: false, message: 'Field not found: ' + op.key };
  const q = String(op.query || op.search || '').trim();
  if (!q) return { op: op.op, ok: false, message: 'set_field_image_unsplash needs a query' };
  const w = Number(op.width)  > 0 ? Math.min(2400, Number(op.width))  : 800;
  const h = Number(op.height) > 0 ? Math.min(2400, Number(op.height)) : 600;
  // [v20260530-13] source.unsplash.com/random was deprecated in 2024 and
  // now returns intermittent 404 / redirect chains that frequently render
  // as a broken-image icon in the form. Picsum.photos with a seed derived
  // from the user's keywords is a stable, no-API-key alternative that
  // always returns a real cacheable JPEG. The seed makes the image
  // deterministic per query so the same prompt always renders the same
  // photo (useful for preview testing). See KB rule IMG-001.
  const seed = encodeURIComponent(q.replace(/\s+/g, '-').slice(0, 60));
  const url = 'https://picsum.photos/seed/' + seed + '/' + w + '/' + h;
  const target = String(op.target || '').trim() || 'defaultValue';
  if (target.indexOf('widgetProps') === 0) {
    field.widgetProps = field.widgetProps || {};
    const k = target.replace(/^widgetProps\.?/, '') || 'imageUrl';
    field.widgetProps[k] = url;
  } else if (target === 'htmlContent') {
    const alt = String(op.alt || q).replace(/"/g, '&quot;');
    field.htmlContent = '<img src="' + url + '" alt="' + alt + '" style="max-width:100%;height:auto;border-radius:12px;display:block;">';
  } else {
    field.defaultValue = url;
  }
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Set Unsplash image on ' + field.key + ' (' + q + ')', detail: { url, query: q } };
}

/**
 * [B2 2026-06-27] set_html_text — rebrand a HARDCODED heading / caption inside a
 * premium form's settings.customHtml. Text-only swap: the tag structure + every
 * attribute (so settings.customCss selectors + SHELL_HASH) stay byte-identical.
 * This is how "Discover Australia" → "Đăng ký Khai báo Thuế" without touching the
 * design. Shared mechanism with the builder AI Designer (ai-form-creator.ts) via
 * @shared/html-text-swap so there is exactly ONE rebrand implementation.
 *
 *   { op:'set_html_text', find:'<exact current shell text>', replace:'<new plain text>' }
 *
 * `find` must match an EXACT text node already present (validated against the
 * template-guide shellTexts when loaded, else the form's own text nodes).
 * `replace` must be plain text (no `<` `>`), so it can never inject markup.
 */
export function opSetHtmlText(op: Op): OpResult {
  const schema = getSchema();
  if (!schema) return { op: op.op, ok: false, message: 'No active form schema' };
  const settings = (schema.settings || (schema as any).Settings || {}) as any;
  const html = String(settings.customHtml || settings.CustomHtml || '');
  if (!html) {
    return { op: op.op, ok: false, message: '[HTMLTEXT-001] set_html_text needs a premium form with customHtml. This form has none — change copy via set_form_meta / set_field_property instead.' };
  }
  const find = String(op.find == null ? '' : op.find);
  if (!find.trim()) return { op: op.op, ok: false, message: 'set_html_text needs a non-empty "find".' };
  const replace = String(op.replace == null ? '' : op.replace);
  // Allowlist: prefer the active template guide's shellTexts; else derive from
  // the form's own text nodes so the op is safe even with no guide seeded.
  const guide = getActiveTemplateGuide();
  const allow: string[] = (guide && Array.isArray((guide as any).shellTexts) && (guide as any).shellTexts.length)
    ? (guide as any).shellTexts
    : collectHtmlTextNodes(html);
  const res = applyHtmlTextSwaps(html, [{ find, replace }], allow);
  if (!res.applied.length) {
    const why = (res.rejected[0] && res.rejected[0].reason) || 'no matching text node';
    return {
      op: op.op, ok: false,
      message: '[HTMLTEXT-002] set_html_text("' + find.slice(0, 40) + '") not applied: ' + why + '. `find` must be the EXACT current text shown in the shell, and `replace` must be plain text (no tags).',
    };
  }
  settings.customHtml = res.html;
  if (schema.settings) schema.settings = settings; else (schema as any).Settings = settings;
  reRenderCanvas();
  const hits = res.applied[0].hits;
  return {
    op: op.op, ok: true,
    message: 'Rebranded shell text "' + find.slice(0, 30) + '" → "' + replace.slice(0, 30) + '" (' + hits + ' node' + (hits === 1 ? '' : 's') + ')',
    detail: { find, replace, hits },
  };
}
