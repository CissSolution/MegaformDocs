// workflow/index.ts — Entry point for the workflow builder bundle
// Vite bundles this into megaform-workflow-reactflow.js (single IIFE)
//
// Module files (use for IDE support, testing, type imports):
//   wf-types.ts      — TypeScript interfaces
//   wf-meta.ts       — NODE_META + palette arrays
//   wf-normalize.ts  — normalize* functions (pure, no DOM)
//   wf-panels.ts     — render*Config panel functions
//   wf-components.ts — React components
//   wf-app.ts        — WorkflowApp + buildInitialGraph + buildDefinition

// Re-export for external consumers
export { NODE_META, TRIGGER_TYPES, NAV_TYPES, LOGIC_TYPES, ACTION_TYPES, INTEGRATION_TYPES } from './wf-meta';
export type { AnyObj, FormSchema, FormSchemaField, WorkflowVariable, IMFWorkflowRF } from './wf-types';

// Import normalize functions — these replace the inline declarations in the IIFE
import { normalizeFieldOptions, normalizeWorkflowDef, normalizeWebhookMethod, normalizeWebhookHeaders, webhookHeadersToDictionary, normalizeWebhookAuth, normalizeWebhookBodyMappings, normalizeWebhookRetry, normalizeResponseRouteOperator, normalizeWebhookResponseRoutes, normalizeWebhookConfig, normalizeNodeConfigByType, normalizeConditionConfig, normalizeOperator, normalizeValueType, normalizeEndType } from './wf-normalize';

// Import node meta
import { NODE_META, TRIGGER_TYPES, NAV_TYPES, LOGIC_TYPES, ACTION_TYPES, INTEGRATION_TYPES, WORKFLOW_BUILD_TAG as WORKFLOW_META_BUILD_TAG, WORKFLOW_VERSION_TAG as WORKFLOW_META_VERSION_TAG } from './wf-meta';
import { getStyles } from './wf-styles';
import { createMFNode, createCustomMiniMap, createZoneBackground, createNodePalette, createFieldInsertButton, createConditionGroupEditor, createVariablesPanel, createSetVariableConfigPanel, createIssuesPanel, createToast } from './wf-components';
import { swallowWorkflowPanelEvent, buttonProps } from './wf-dom-guards';
import { normalizeUiOptions, useDatabaseNodeEffects, applyDatabaseConfigResets, resolveDatabaseSchemaOptions, resolveDatabaseItemKeyOptions, renderDatabaseConnectionAssistant, renderDatabaseMappingField, createDatabaseConfigPanel } from './wf-database';
import { renderSendEmailConfig } from './wf-email';
import { renderWebhookConfig } from './wf-webhook';
import { renderApprovalConfig } from './wf-approval';
import { APPROVAL_PANEL_BADGE, normalizeApprovalConfig, serializeApprovalConfig, isApprovalHandle, getApprovalEdgeColor, getApprovalEdgeLabel } from './wf-approval-config';
import { renderConditionConfig, CONDITION_PANEL_BADGE } from './wf-condition';
import { renderGoogleSheetsConfig, GOOGLE_SHEETS_PANEL_BADGE } from './wf-google-sheets';

(function (W: IMFWorkflowRF) {
  'use strict';

  type AnyObj = { [key: string]: any };
  type ConditionOperator =
    | 'equals' | 'notEquals'
    | 'contains' | 'notContains'
    | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual'
    | 'isEmpty' | 'isNotEmpty'
    | 'startsWith' | 'endsWith'
    | 'in' | 'notIn';

  interface FieldOption { label: string; value: string; }
  interface FormSchemaField {
    key: string;
    type: string;
    label: string;
    required: boolean;
    options?: FieldOption[];
    pageIndex?: number;
  }
  interface FormSchema {
    version: string;
    fields: FormSchemaField[];
    pages?: Array<{ index: number; title: string }>;
    settings?: AnyObj;
  }
  interface ConditionRule {
    fieldKey: string;
    operator: ConditionOperator;
    value: string;
    valueType: 'literal' | 'field' | 'variable';
  }
  interface ConditionGroup {
    logic: 'and' | 'or';
    rules: ConditionRule[];
  }
  interface WorkflowVariable {
    key: string;
    type: 'Number' | 'String' | 'Boolean';
    defaultValue: string;
    description?: string;
  }

  var WORKFLOW_BUILD_TAG = WORKFLOW_META_BUILD_TAG;
  var WORKFLOW_VERSION_TAG = WORKFLOW_META_VERSION_TAG;
  var WORKFLOW_APPROVAL_SPLIT_BADGE = APPROVAL_PANEL_BADGE;
  var WORKFLOW_CONDITION_SPLIT_BADGE = CONDITION_PANEL_BADGE;
  var WORKFLOW_WORKFLOW_CLEANUP_BADGE = 'WF Workflow cleanup v20260401-10';
  var WORKFLOW_GOOGLE_SHEETS_SPLIT_BADGE = GOOGLE_SHEETS_PANEL_BADGE;


  function inferWorkflowName(def: any, schema2: FormSchema): string {
    if (def && def.name) return String(def.name);
    var title = schema2 && schema2.settings && (schema2.settings.formTitle || schema2.settings.title || schema2.settings.name);
    if (title) return String(title) + ' Workflow';
    return 'Untitled BPMN workflow';
  }

  function inferWorkflowDescription(def: any, schema2: FormSchema): string {
    if (def && def.description) return String(def.description);
    var desc = schema2 && schema2.settings && (schema2.settings.formDescription || schema2.settings.description || schema2.settings.subtitle);
    if (desc) return 'Automation for: ' + String(desc);
    return 'Route submissions, send notifications, and trigger follow-up actions.';
  }

  function prettyNodeType(nodeType: string): string {
    return (NODE_META[nodeType] && NODE_META[nodeType].label) || nodeType || 'Node';
  }

  function renderSimpleTokensHtml(text: string): string {
    var html = String(text || '');
    html = html.replace(/\n/g, '<br/>');
    html = html.replace(/\{\{([^}]+)\}\}/g, '<span class="mf-rf-token">{{$1}}</span>');
    return html;
  }

  function buildSampleEmailHtml(title: string, intro: string, body: string, ctaLabel?: string): string {
    var cta = ctaLabel
      ? '<div style="margin-top:20px"><a href="#" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">' + escHtml(ctaLabel) + '</a></div>'
      : '';
    return ''
      + '<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">'
      + '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">'
      + '<div style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#334155);color:#fff">'
      + '<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.72;margin-bottom:8px">MegaForm Automation</div>'
      + '<h2 style="margin:0;font-size:24px;line-height:1.2">' + escHtml(title) + '</h2>'
      + '<p style="margin:10px 0 0;color:rgba(255,255,255,.82);line-height:1.7">' + escHtml(intro) + '</p>'
      + '</div>'
      + '<div style="padding:24px">'
      + '<div style="font-size:15px;line-height:1.75;color:#334155">' + body + '</div>'
      + cta
      + '<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">This message was generated by your MegaForm workflow.</div>'
      + '</div></div></div>';
  }

  function buildWorkflowWebhookPlaceholder(nodeLabel?: string): string {
    var slug = String(nodeLabel || 'workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workflow';
    return 'https://hooks.example.com/' + slug;
  }

  var SCHEMA_DRIVEN_NODE_TYPES: AnyObj = {};

  function workflowNodeSchemaPath(nodeType: string): string {
    var q = '?nodeType=' + encodeURIComponent(String(nodeType || ''));
    return getPlatform() === 'oqtane' ? '/Form/Workflow/NodeSchema' + q : '/Workflow/NodeSchema' + q;
  }
  function workflowDbConnectionsPath(): string {
    return getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Connections' : '/Workflow/Database/Connections';
  }
  function workflowDbConnectionStringSamplePath(databaseType?: string): string {
    var q = '?databaseType=' + encodeURIComponent(String(databaseType || 'Sqlite'));
    return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/ConnectionStringSample' : '/Workflow/Database/ConnectionStringSample') + q;
  }
  function workflowDbTestConnectionPath(): string {
    return getPlatform() === 'oqtane' ? '/Form/Workflow/Database/TestConnection' : '/Workflow/Database/TestConnection';
  }
  function dbMetaQuery(connectionName: string, databaseType?: string, connectionString?: string): string {
    var q = '?connectionName=' + encodeURIComponent(String(connectionName || ''));
    if (databaseType) q += '&databaseType=' + encodeURIComponent(String(databaseType || ''));
    if (connectionString) q += '&connectionString=' + encodeURIComponent(String(connectionString || ''));
    return q;
  }
  function workflowDbTablesPath(connectionName: string, databaseType?: string, connectionString?: string): string {
    return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Tables' : '/Workflow/Database/Tables') + dbMetaQuery(connectionName, databaseType, connectionString);
  }
  function workflowDbColumnsPath(connectionName: string, tableName: string, databaseType?: string, connectionString?: string): string {
    return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Columns' : '/Workflow/Database/Columns') + dbMetaQuery(connectionName, databaseType, connectionString) + '&tableName=' + encodeURIComponent(String(tableName || ''));
  }
  function workflowDbProceduresPath(connectionName: string, databaseType?: string, connectionString?: string): string {
    return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Procedures' : '/Workflow/Database/Procedures') + dbMetaQuery(connectionName, databaseType, connectionString);
  }
  function workflowDbProcedureParamsPath(connectionName: string, procedureName: string, databaseType?: string, connectionString?: string): string {
    return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/ProcedureParameters' : '/Workflow/Database/ProcedureParameters') + dbMetaQuery(connectionName, databaseType, connectionString) + '&procedureName=' + encodeURIComponent(String(procedureName || ''));
  }

  function getValueByPath(obj: any, path: string): any {
    var parts = String(path || '').split('.').filter(Boolean);
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setValueByPath(obj: any, path: string, value: any): any {
    var next = deepClone(obj || {});
    var parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return next;
    var cur = next;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
    return next;
  }

  function applyConfigPatch(baseCfg: any, patch: any): any {
    function merge(target: any, src: any): any {
      if (src == null) return target;
      if (Array.isArray(src)) return deepClone(src);
      if (typeof src !== 'object') return src;
      var out = (target && typeof target === 'object' && !Array.isArray(target)) ? deepClone(target) : {};
      Object.keys(src).forEach(function (k: string) {
        out[k] = merge(out[k], src[k]);
      });
      return out;
    }
    return merge(baseCfg || {}, patch || {});
  }

  function isSchemaFieldVisible(field: any, cfg: any): boolean {
    var rule = field && (field.visibleWhen || field.VisibleWhen);
    if (!rule) return true;
    var fieldKey = rule.fieldKey || rule.FieldKey || '';
    var current = getValueByPath(cfg || {}, fieldKey);
    var values = Array.isArray(rule.in) ? rule.in : (Array.isArray(rule.In) ? rule.In : []);
    var eqValue = rule.equals != null ? rule.equals : rule.Equals;
    var ok = true;
    if (eqValue != null && String(current || '') !== String(eqValue)) ok = false;
    if (values.length && values.indexOf(String(current || '')) < 0) ok = false;
    if (rule.not || rule.Not) ok = !ok;
    return ok;
  }

  function normalizeSchemaKeyValueRows(input: any): any[] {
    var rows: any[] = [];
    if (Array.isArray(input)) {
      input.forEach(function (row: any) { rows.push({ key: String((row && (row.key || row.Key)) || ''), value: String((row && (row.value || row.Value)) || '') }); });
      return rows;
    }
    if (input && typeof input === 'object') {
      Object.keys(input).forEach(function (k: string) { rows.push({ key: k, value: String(input[k] || '') }); });
    }
    return rows;
  }

  function normalizeSchemaMappingRows(input: any): any[] {
    var rows: any[] = [];
    if (Array.isArray(input)) {
      input.forEach(function (row: any) { rows.push({ targetColumn: String((row && (row.targetColumn || row.TargetColumn || row.column || row.Column)) || ''), sourceKey: String((row && (row.sourceKey || row.SourceKey || row.value || row.Value)) || '') }); });
      return rows;
    }
    if (input && typeof input === 'object') {
      Object.keys(input).forEach(function (k: string) { rows.push({ targetColumn: k, sourceKey: String(input[k] || '') }); });
    }
    return rows;
  }

  function ensureWorkflowVariable(vars: WorkflowVariable[], key: string, type: 'Number' | 'String' | 'Boolean', defaultValue: string, description: string): void {
    if (!key) return;
    var exists = (vars || []).some(function (v: WorkflowVariable) { return String(v.key || '').toLowerCase() === String(key).toLowerCase(); });
    if (!exists) vars.push({ key: key, type: type, defaultValue: defaultValue, description: description });
  }

  function fieldToken(fieldKey: string): string {
    return '{{field.' + String(fieldKey || '').trim() + '}}';
  }

  function variableToken(variableKey: string): string {
    return '{{variable.' + String(variableKey || '').trim() + '}}';
  }

  function buildReadyEmailRecipient(nodeLabel: string, schema2: FormSchema): string {
    var label = String(nodeLabel || '').toLowerCase();
    var emailField = pickEmailField(schema2);
    if (label.indexOf('review') >= 0) return 'ops@example.com';
    if (label.indexOf('sales') >= 0 || label.indexOf('lead') >= 0) return 'sales@example.com';
    if (label.indexOf('recruit') >= 0 || label.indexOf('talent') >= 0 || label.indexOf('approval') >= 0) return 'recruiting@example.com';
    if (label.indexOf('internal') >= 0 || label.indexOf('team') >= 0) return 'team@example.com';
    if (emailField && emailField.key) return fieldToken(emailField.key);
    return 'notifications@example.com';
  }

  function buildReadyEmailSubject(nodeLabel: string, schema2: FormSchema): string {
    var label = String(nodeLabel || '').trim();
    var title = schema2 && schema2.settings && (schema2.settings.formTitle || schema2.settings.title || schema2.settings.name);
    if (label) return label + ' / ' + (title || 'MegaForm BPMN workflow');
    return 'Process notification';
  }

  function buildReadyEmailBody(nodeLabel: string, schema2: FormSchema): string {
    var title = schema2 && schema2.settings && (schema2.settings.formTitle || schema2.settings.title || schema2.settings.name) || 'your form';
    var nameField = pickNameField(schema2);
    var emailField = pickEmailField(schema2);
    var greeting = nameField && nameField.key ? '<p>Hello <strong>' + fieldToken(nameField.key) + '</strong>,</p>' : '<p>Hello,</p>';
    var details = emailField && emailField.key ? '<p>Reference email: ' + fieldToken(emailField.key) + '</p>' : '';
    return buildSampleEmailHtml(
      nodeLabel || 'Process notification',
      'This message was generated from the "' + String(title) + '" BPMN workflow.',
      greeting + '<p>Your submission has reached the <strong>' + escHtml(nodeLabel || 'current') + '</strong> step in the BPMN workflow. Our team will continue the next action shortly.</p>' + details,
      'Open submission'
    );
  }

  function normalizeSwitchNodeConfig(cfg: any, schema2: FormSchema): any {
    var c = normalizeNodeConfigByType('Switch', deepClone(cfg || {}));
    if (!c || !Array.isArray(c.cases) || !c.cases.length) c = defaultConfigForType('Switch', schema2);
    return c;
  }

  function normalizeLoopNodeConfig(cfg: any, schema2: FormSchema): any {
    var c = normalizeNodeConfigByType('Loop', deepClone(cfg || {}));
    return c || defaultConfigForType('Loop', schema2);
  }

  function normalizeGoogleSheetsNodeConfig(cfg: any, schema2: FormSchema): any {
    var c = normalizeNodeConfigByType('GoogleSheets', deepClone(cfg || {}));
    return c || defaultConfigForType('GoogleSheets', schema2);
  }

  var REMOVED_WORKFLOW_NODE_TYPES: AnyObj = { Switch: true, Loop: true };

  function stripRemovedWorkflowNodes(def: any): any {
    var next = deepClone(def || {});
    var removed: AnyObj = {};
    next.nodes = (next.nodes || []).filter(function (node: any) {
      var type = typeof (node && node.type) === 'number' ? (NODE_TYPE_INT_MAP[node.type] || 'FormField') : String((node && node.type) || 'FormField');
      if (REMOVED_WORKFLOW_NODE_TYPES[type]) {
        if (node && node.id) removed[node.id] = true;
        return false;
      }
      return true;
    });
    next.edges = (next.edges || []).filter(function (edge: any) {
      return edge && !removed[edge.sourceNodeId] && !removed[edge.targetNodeId];
    });
    if (next.startNodeId && removed[next.startNodeId]) next.startNodeId = (next.nodes[0] && next.nodes[0].id) || null;
    return next;
  }

  function ensureWorkflowReadyToSave(def: any, schema2: FormSchema): any {
    var ready = stripRemovedWorkflowNodes(def || {});
    ready.variables = (ready.variables || []).slice(0);
    ensureWorkflowVariable(ready.variables, 'score', 'Number', '0', 'Workflow score');
    ensureWorkflowVariable(ready.variables, 'route', 'String', '', 'Workflow route');
    (ready.nodes || []).forEach(function (node: any) {
      if (!node) return;
      var type = typeof node.type === 'number' ? (NODE_TYPE_INT_MAP[node.type] || 'FormField') : String(node.type || 'FormField');
      node.type = type;
      node.config = normalizeNodeConfigByType(type, node.config || {});
      var cfg = node.config || {};
      if (type === 'Condition') {
        node.config = autoMapWorkflowToSchema({ nodes: [node], edges: [], variables: ready.variables || [] }, schema2).nodes[0].config;
        return;
      }
      if (type === 'Switch') {
        if (!String(cfg.fieldKey || '').trim()) {
          var switchField = pickChoiceField(schema2) || ((schema2.fields && schema2.fields.length) ? schema2.fields[0] : null);
          if (switchField) cfg.fieldKey = switchField.key;
        }
        if (!Array.isArray(cfg.cases) || !cfg.cases.length) cfg.cases = defaultConfigForType('Switch', schema2).cases;
        node.config = normalizeSwitchNodeConfig(cfg, schema2);
        return;
      }
      if (type === 'Loop') {
        if (String(cfg.sourceType || 'field') !== 'variable' && !String(cfg.fieldKey || '').trim()) {
          var loopField = (schema2.fields && schema2.fields.length) ? schema2.fields[0] : null;
          if (loopField) cfg.fieldKey = loopField.key;
        }
        node.config = normalizeLoopNodeConfig(cfg, schema2);
        return;
      }
      if (type === 'GoogleSheets') {
        if (!Array.isArray(cfg.columnMappings) || !cfg.columnMappings.length) cfg.columnMappings = defaultConfigForType('GoogleSheets', schema2).columnMappings;
        if (!String(cfg.range || '').trim()) cfg.range = defaultConfigForType('GoogleSheets', schema2).range;
        node.config = normalizeGoogleSheetsNodeConfig(cfg, schema2);
        return;
      }
      if (type === 'Webhook') {
        if (!String(cfg.bodyTemplate || '').trim()) {
          var emailField = pickEmailField(schema2);
          var nameField = pickNameField(schema2);
          var bodyParts = [];
          if (nameField && nameField.key) bodyParts.push('"name":"' + fieldToken(nameField.key) + '"');
          if (emailField && emailField.key) bodyParts.push('"email":"' + fieldToken(emailField.key) + '"');
          bodyParts.push('"workflow":"' + String(node.label || 'Webhook').replace(/"/g, '\"') + '"');
          cfg.bodyTemplate = '{' + bodyParts.join(',') + '}';
        }
        if (!String(cfg.responseVariableKey || '').trim()) cfg.responseVariableKey = 'route';
      }
      if (type === 'SendEmail') {
        if (!String(cfg.subject || '').trim()) cfg.subject = buildReadyEmailSubject(node.label || 'Workflow email', schema2);
        if (!String(cfg.body || '').trim()) cfg.body = buildReadyEmailBody(node.label || 'Workflow email', schema2);
      }
      if (type === 'Calculate') {
        if (!String(cfg.targetVariable || '').trim()) cfg.targetVariable = 'score';
        ensureWorkflowVariable(ready.variables, cfg.targetVariable, 'Number', '0', 'Calculated value for ' + cfg.targetVariable);
        if (!String(cfg.operand1 || '').trim()) cfg.operand1 = cfg.targetVariable;
        if (!String(cfg.operand2 || '').trim()) cfg.operand2 = '10';
        if (!String(cfg.operator || '').trim()) cfg.operator = 'add';
      }
      node.config = cfg;
    });
    return ready;
  }

  function insertAtCursor(targetId: string, textToInsert: string): void {
    var el = document.getElementById(targetId) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    var start = typeof (el as any).selectionStart === 'number' ? (el as any).selectionStart : String(el.value || '').length;
    var end = typeof (el as any).selectionEnd === 'number' ? (el as any).selectionEnd : start;
    var value = String(el.value || '');
    el.value = value.slice(0, start) + textToInsert + value.slice(end);
    var nextPos = start + textToInsert.length;
    try { (el as any).selectionStart = (el as any).selectionEnd = nextPos; } catch (_e) { }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }

  var SAMPLE_PRESET_META: AnyObj = {
    'smart-default': {
      title: 'Smart starter workflow',
      summary: 'Receives a submission, checks a key response, sends data to an external endpoint, then emails the submitter a polished confirmation.',
      details: [
        'Trigger: starts when the mapped form fields are available.',
        'Branching: true path continues to webhook + confirmation email; false path skips to a safe end state.',
        'Emails: confirmation is sent to the submitter using the mapped email field.',
        'Outcome: good starter for forms that need one external sync and one customer-facing follow-up.'
      ]
    },
    'lead-routing': {
      title: 'Lead routing workflow',
      summary: 'Scores a qualified lead, pushes it to CRM, and notifies either sales or manual review depending on the routing decision.',
      details: [
        'Trigger: form submit with name + email + a decision field such as service, category, or intent.',
        'Branching: qualified leads go to CRM + sales notification; other leads go to manual review.',
        'Emails: success path alerts sales, fallback path alerts operations.',
        'Outcome: perfect for lead capture, concierge request, booking triage, and premium intake forms.'
      ]
    },
    'approval-branching': {
      title: 'Approval / rejection workflow',
      summary: 'Routes a submission to approved or rejected outcomes, sends professional HTML emails, and optionally creates a case for the approved branch.',
      details: [
        'Trigger: submission enters the workflow with a mapped applicant name, email, and decision field.',
        'Branching: approved submissions continue to case creation; rejected submissions notify the submitter.',
        'Emails: both approval and rejection notices are HTML-ready and token friendly.',
        'Outcome: ideal for applications, onboarding approvals, scholarship review, or support escalation decisions.'
      ]
    }
  };

  function getRootEl(): HTMLElement | null {
    return document.getElementById('mf-builder-root') as HTMLElement | null;
  }

  function getPlatform(): string {
    var root = getRootEl();
    var platformCfg = (window as any).__MF_PLATFORM__ || {};
    return String((root && root.dataset.platform) || platformCfg.platform || (window as any).PLATFORM || 'aspcore').toLowerCase();
  }

  function getAssetsBase() {
    var root = getRootEl();
    var platformCfg = (window as any).__MF_PLATFORM__ || {};
    // Platform sets data-assets-base explicitly — most reliable.
    // Oqtane:   data-assets-base="/Modules/MegaForm/"
    // DNN:      data-assets-base="/DesktopModules/MegaForm/Assets/"
    // ASP Core: data-assets-base="/megaform/"
    if (root && root.dataset.assetsBase) return root.dataset.assetsBase;
    if (platformCfg.assetsBase) return String(platformCfg.assetsBase);

    var api = (root && root.dataset.apiBase) || platformCfg.apiBase || '';

    // ASP Core: /api/MegaForm/ -> /megaform/
    if (/^\/api\/[^\/]+\/?$/i.test(api)) return '/megaform/';

    // DNN: /DesktopModules/MegaForm/API/ -> /DesktopModules/MegaForm/Assets/
    if (/\/DesktopModules\/MegaForm\/API\/?$/i.test(api)) return '/DesktopModules/MegaForm/Assets/';

    // Generic fallback for custom hosts where apiBase already points under assets root.
    var stripped = api.replace(/\/api\/[^\/]+\/?$/i, '/').replace(/\/API\/?$/i, '/');
    if (stripped && stripped !== api && stripped !== '/') return stripped;

    return '/megaform/';
  }
  function getWorkflowBuilderBase() {
    return getAssetsBase() + 'js/builder/';
  }
  function getWorkflowAssetUrls() {
    var base = getWorkflowBuilderBase();
    return {
      BASE: base,
      REACT_CDN: base + 'react.production.min.js',
      REACTDOM_CDN: base + 'react-dom.production.min.js',
      RF_CDN: base + 'reactflow.min.js',
      RF_CSS_CDN: base + 'reactflow.min.css'
    };
  }

  var WORKFLOW_OVERLAY_Z_BADGE = 'Workflow ' + WORKFLOW_BUILD_TAG;
  var WORKFLOW_DNN_HOST_BADGE = 'Workflow DNN Host v20260408-02';

  W._state = W._state || {
    formId: 0,
    apiBase: '',
    dirty: false,
    formSchema: null,
    workflowVariables: [],
    dnnChromeHidden: false,
    hiddenBodySiblings: [],
    bodyCssTextBeforeWorkflow: '',
    bodyClassBeforeWorkflow: '',
    workflowHideStyles: [],
    cleanupHooksInstalled: false
  };

  function isDnnHost(): boolean {
    if (getPlatform() === 'dnn') return true;
    try {
      var jq = (window as any).jQuery;
      return !!(jq && typeof jq.ServicesFramework === 'function');
    } catch (_e) {
      return false;
    }
  }


  function getWorkflowBuilderReturnUrl(): string {
    try {
      var root = getRootEl();
      var platformCfg = (window as any).__MF_PLATFORM__ || {};
      var raw = String((root && root.dataset && root.dataset.builderUrl) || platformCfg.builderUrl || '').trim();
      if (!raw) return '';
      var url = new URL(raw, window.location.origin);
      if (!url.hash || url.hash === '#') url.hash = '#mf-builder';
      return url.origin === window.location.origin ? (url.pathname + url.search + url.hash) : url.toString();
    } catch (_e) {
      return '';
    }
  }

  function returnToBuilderShell(): void {
    var target = getWorkflowBuilderReturnUrl();
    cleanupWorkflowHostChrome(true);
    try {
      var liveTrigger = document.getElementById('mf-le-trigger');
      if (liveTrigger) liveTrigger.style.display = 'none';
    } catch (_e1) { }
    if (!target) return;
    try {
      window.location.assign(target);
      return;
    } catch (_e2) { }
    try {
      window.location.href = target;
    } catch (_e3) { }
  }

  function getSameOriginWindowChain(): any[] {
    var chain: any[] = [];
    var current: any = window;
    while (current) {
      if (chain.indexOf(current) >= 0) break;
      chain.push(current);
      try {
        if (!current.parent || current.parent === current) break;
        var _test = current.parent.document;
        current = current.parent;
      } catch (_e) {
        break;
      }
    }
    return chain;
  }

  function findFrameElementInParent(childWin: any, parentWin: any): HTMLElement | null {
    try {
      var frames = parentWin.document.querySelectorAll('iframe, frame');
      for (var i = 0; i < frames.length; i++) {
        var frame = frames[i] as any;
        try { if (frame && frame.contentWindow === childWin) return frame as HTMLElement; } catch (_e) { }
      }
    } catch (_e2) { }
    return null;
  }

  function injectWorkflowHideStyle(targetWin: any, overlayId: string, visibleFrameId?: string): AnyObj | null {
    try {
      var doc = targetWin && targetWin.document;
      if (!doc || !doc.body || !doc.head) return null;
      var style = doc.createElement('style');
      var styleId = 'mf-wfrf-hide-style-' + Math.random().toString(36).slice(2, 8);
      style.id = styleId;
      var whitelist: string[] = ['[data-mf-overlay]', 'script', 'style'];
      if (overlayId) whitelist.unshift('#' + overlayId);
      if (visibleFrameId) whitelist.unshift('#' + visibleFrameId);
      style.textContent =
        'html.mf-dnn-workflow-open,body.mf-dnn-workflow-open{margin:0!important;padding:0!important;overflow:hidden!important;}' +
        'body.mf-dnn-workflow-open > *:not(' + whitelist.join('):not(') + '){display:none!important;}' +
        'body.mf-dnn-workflow-open #Body,body.mf-dnn-workflow-open .DnnModule,body.mf-dnn-workflow-open .dnnSkinObject{overflow:hidden!important;}';
      doc.head.appendChild(style);
      return {
        win: targetWin,
        styleId: styleId,
        bodyCssText: String(doc.body.getAttribute('style') || ''),
        bodyClassName: String(doc.body.className || ''),
        htmlClassName: String(doc.documentElement.className || '')
      };
    } catch (_e3) {
      return null;
    }
  }

  function cleanupWorkflowHostChrome(removeOverlay?: boolean): void {
    try { restoreDnnChromeForWorkflow(); } catch (_e0) { }

    var chain = getSameOriginWindowChain();
    for (var i = 0; i < chain.length; i++) {
      var win2 = chain[i];
      try {
        var doc = win2 && win2.document;
        if (!doc || !doc.body || !doc.documentElement) continue;
        doc.body.classList.remove('mf-dnn-workflow-open');
        doc.documentElement.classList.remove('mf-dnn-workflow-open');
        doc.body.style.removeProperty('overflow');
        doc.body.style.removeProperty('margin');
        doc.body.style.removeProperty('padding');
        var staleStyles = doc.querySelectorAll('style[id^="mf-wfrf-hide-style-"]');
        for (var j = 0; j < staleStyles.length; j++) {
          var styleEl = staleStyles[j] as HTMLElement;
          if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        }
        var hiddenEls = doc.querySelectorAll('[data-mf-wfrf-hidden="1"]');
        for (var k = 0; k < hiddenEls.length; k++) {
          var hiddenEl = hiddenEls[k] as HTMLElement;
          var prev = hiddenEl.getAttribute('data-mf-wfrf-prev-style');
          if (typeof prev === 'string' && prev.length) hiddenEl.setAttribute('style', prev);
          else hiddenEl.removeAttribute('style');
          hiddenEl.removeAttribute('data-mf-wfrf-hidden');
          hiddenEl.removeAttribute('data-mf-wfrf-prev-style');
        }
        if (removeOverlay) {
          var overlayEl = doc.getElementById('mf-wfrf-overlay');
          if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
        }
      } catch (_e1) { }
    }
  }

  function installWorkflowCleanupHooks(): void {
    if (W._state.cleanupHooksInstalled) return;
    W._state.cleanupHooksInstalled = true;
    var cleanup = function () { cleanupWorkflowHostChrome(false); };
    try { window.addEventListener('beforeunload', cleanup); } catch (_e0) { }
    try { window.addEventListener('pagehide', cleanup); } catch (_e1) { }
  }

  function hideDnnChromeForWorkflow(overlay: HTMLElement): void {
    if (!isDnnHost()) return;
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);

    cleanupWorkflowHostChrome(false);
    restoreDnnChromeForWorkflow();

    var hidden: AnyObj[] = [];
    W._state.bodyCssTextBeforeWorkflow = String(document.body.getAttribute('style') || '');
    W._state.bodyClassBeforeWorkflow = document.body.className || '';

    document.body.classList.add('mf-dnn-workflow-open');
    document.body.style.cssText += ';margin:0!important;padding:0!important;overflow:hidden!important;';

    var nodes = document.querySelectorAll('body > *');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i] as HTMLElement;
      if (!el || el === overlay || el.id === 'mf-wfrf-overlay') continue;
      var prevCssText = String(el.getAttribute('style') || '');
      el.setAttribute('data-mf-wfrf-hidden', '1');
      el.setAttribute('data-mf-wfrf-prev-style', prevCssText);
      hidden.push({ el: el, cssText: prevCssText });
      el.style.cssText += ';display:none!important;';
    }

    var styleRows: AnyObj[] = [];
    var chain = getSameOriginWindowChain();
    for (var j = 0; j < chain.length; j++) {
      var win2 = chain[j];
      var frameEl = j > 0 ? findFrameElementInParent(chain[j - 1], win2) : null;
      if (frameEl && !frameEl.id) frameEl.id = 'mf-wfrf-frame-' + j;
      var row = injectWorkflowHideStyle(win2, j === 0 ? 'mf-wfrf-overlay' : '', frameEl && frameEl.id ? frameEl.id : undefined);
      if (!row) continue;
      try { row.win.document.body.classList.add('mf-dnn-workflow-open'); } catch (_e4) { }
      try { row.win.document.documentElement.classList.add('mf-dnn-workflow-open'); } catch (_e5) { }
      try { row.win.document.body.style.cssText += ';margin:0!important;padding:0!important;overflow:hidden!important;'; } catch (_e6) { }
      styleRows.push(row);
    }

    overlay.setAttribute('data-workflow-dnn-host-badge', WORKFLOW_DNN_HOST_BADGE);
    W._state.hiddenBodySiblings = hidden;
    W._state.workflowHideStyles = styleRows;
    W._state.dnnChromeHidden = true;
  }

  function restoreDnnChromeForWorkflow(): void {
    var hidden = (W._state && W._state.hiddenBodySiblings) || [];
    for (var i = 0; i < hidden.length; i++) {
      var row = hidden[i] || {};
      var el = row.el as HTMLElement | undefined;
      if (!el) continue;
      if (typeof row.cssText === 'string' && row.cssText.length) el.setAttribute('style', row.cssText);
      else el.removeAttribute('style');
    }
    W._state.hiddenBodySiblings = [];
    W._state.dnnChromeHidden = false;

    var styleRows = (W._state && W._state.workflowHideStyles) || [];
    for (var j = 0; j < styleRows.length; j++) {
      var styleRow = styleRows[j] || {};
      try {
        var doc = styleRow.win && styleRow.win.document;
        if (!doc) continue;
        var styleEl = styleRow.styleId ? doc.getElementById(styleRow.styleId) : null;
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        if (typeof styleRow.bodyCssText === 'string' && styleRow.bodyCssText.length) doc.body.setAttribute('style', styleRow.bodyCssText);
        else doc.body.removeAttribute('style');
        doc.body.className = typeof styleRow.bodyClassName === 'string' ? styleRow.bodyClassName : '';
        doc.documentElement.className = typeof styleRow.htmlClassName === 'string' ? styleRow.htmlClassName : '';
      } catch (_e7) { }
    }
    W._state.workflowHideStyles = [];

    if (typeof W._state.bodyCssTextBeforeWorkflow === 'string' && W._state.bodyCssTextBeforeWorkflow.length) {
      document.body.setAttribute('style', W._state.bodyCssTextBeforeWorkflow);
    } else {
      document.body.removeAttribute('style');
    }
    if (typeof W._state.bodyClassBeforeWorkflow === 'string') {
      document.body.className = W._state.bodyClassBeforeWorkflow;
    } else {
      document.body.classList.remove('mf-dnn-workflow-open');
    }
  }

  W.init = function (formId: number, apiBase: string): void {
    installWorkflowCleanupHooks();
    cleanupWorkflowHostChrome(true);
    W._state.formId = resolveCurrentFormId(formId);
    W._state.apiBase = apiBase || '';
    W._state.dirty = false;
    W._state.formSchema = null;
    W._state.workflowVariables = [];

    var old = document.getElementById('mf-wfrf-overlay');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var overlay = document.createElement('div');
    overlay.id = 'mf-wfrf-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f8fafc;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif';
    overlay.setAttribute('data-workflow-z-badge', WORKFLOW_OVERLAY_Z_BADGE);
    overlay.setAttribute('data-mf-overlay', '1'); // BUG FIX v20260405-15: whitelist from hideChrome() CSS rule
    overlay.innerHTML = '<div id="mf-wfrf-loading" style="display:flex;align-items:center;justify-content:center;flex:1;gap:12px;color:#64748b">'
      + '<div style="width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#6366f1;border-radius:50%;animation:mf-spin 0.8s linear infinite"></div>'
      + '<span style="font-size:14px;font-weight:500">Loading BPMN editor...</span>'
      + '</div><style>@keyframes mf-spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(overlay);
    hideDnnChromeForWorkflow(overlay);

    loadDeps(function (err: any) {
      if (err) {
        var loading = document.getElementById('mf-wfrf-loading');
        if (loading) loading.innerHTML = '<div style="color:#ef4444;font-size:14px">Failed to load BPMN editor: ' + escHtml(String(err)) + '</div>';
        return;
      }
      var liveSchema = readCurrentBuilderSchema();
      var schemaPromise = (liveSchema && liveSchema.fields && liveSchema.fields.length)
        ? Promise.resolve(liveSchema)
        : fetchFormSchema(W._state.formId);
      Promise.all([schemaPromise, fetchWorkflowDef(W._state.formId)])
        .then(function (res: any[]) {
          var schema = res[0] || { version: '1.0', fields: [] };
          var def = res[1] || ((schema && schema.settings && (schema.settings.workflowTemplate || schema.settings.workflow)) ? normalizeWorkflowDef(schema.settings.workflowTemplate || schema.settings.workflow) : null);
          W._state.formSchema = schema;
          mountReactApp(overlay, schema, def);
        })
        .catch(function (e: any) {
          var loading2 = document.getElementById('mf-wfrf-loading');
          if (loading2) loading2.innerHTML = '<div style="color:#ef4444;font-size:14px">❌ Failed to load data: ' + escHtml(String(e && e.message ? e.message : e)) + '</div>';
        });
    });
  };

  W.close = function (): void {
    if (isDnnHost()) {
      returnToBuilderShell();
      return;
    }
    cleanupWorkflowHostChrome(true);
  };

  W.cleanupHostChrome = function (removeOverlay?: boolean): void {
    cleanupWorkflowHostChrome(removeOverlay !== false);
  };

  function loadDeps(cb: (err?: any) => void): void {
    var workflowAssets = getWorkflowAssetUrls();
    if (!document.getElementById('mf-rf-css')) {
      var link = document.createElement('link');
      link.id = 'mf-rf-css';
      link.rel = 'stylesheet';
      link.href = workflowAssets.RF_CSS_CDN;
      document.head.appendChild(link);
    }
    if ((window as any).React && (window as any).ReactDOM && (window as any).ReactFlow) {
      cb();
      return;
    }
    loadScript(workflowAssets.REACT_CDN, function (e1: any) {
      if (e1) return cb(e1);
      loadScript(workflowAssets.REACTDOM_CDN, function (e2: any) {
        if (e2) return cb(e2);
        loadScript(workflowAssets.RF_CDN, function (e3: any) {
          if (e3) return cb(e3);
          if (!(window as any).ReactFlow) return cb('ReactFlow not found on window');
          cb();
        });
      });
    });
  }

  function loadScript(src: string, cb: (err?: any) => void): void {
    var existing = document.querySelector('script[src="' + src + '"]') as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any)._mfLoaded) return cb();
      existing.addEventListener('load', function () { cb(); });
      existing.addEventListener('error', function () { cb('Failed: ' + src); });
      return;
    }
    var s = document.createElement('script');
    s.src = src;
    (s as any)._mfLoaded = false;
    s.onload = function () { (s as any)._mfLoaded = true; cb(); };
    s.onerror = function () { cb('Failed: ' + src); };
    document.head.appendChild(s);
  }

  function fetchFormSchema(formId: number): Promise<FormSchema> {
    if (!formId) return Promise.resolve({ version: '1.0', fields: [] });
    var candidates = getPlatform() === 'oqtane'
      ? ['/Form/' + formId, '/Form/Get?formId=' + formId + '&moduleId=0&portalId=0']
      : ['/Form/Get?formId=' + formId + '&moduleId=0&portalId=0', '/Form/' + formId];
    return new Promise(function (resolve) {
      apiGetMulti(candidates, function (_err: any, data: any) {
        var schema = safeParseSchema(data && (data.schemaJson || data.SchemaJson || data.schema || data.Schema));
        resolve(schema);
      });
    });
  }

  function resolveCurrentFormId(fallback?: number): number {
    var hidden = document.getElementById('mf-builder-form-id') as HTMLInputElement | null;
    var domVal = hidden ? parseInt(hidden.value || '0', 10) : 0;
    var globalVal = parseInt(String((window as any).FORM_ID || '0'), 10) || 0;
    var base = parseInt(String(fallback || 0), 10) || 0;
    return domVal || globalVal || base || 0;
  }

  function readCurrentBuilderSchema(): FormSchema {
    try {
      var builder = (window as any).MegaFormBuilder;
      if (builder && builder.state && builder.state.schema) return safeParseSchema(builder.state.schema);
    } catch (_e) { }
    try {
      var hidden = document.getElementById('mf-builder-schema-json') as HTMLInputElement | HTMLTextAreaElement | null;
      if (hidden && hidden.value) return safeParseSchema(hidden.value);
    } catch (_e2) { }
    try {
      if ((window as any).SCHEMA_JSON) return safeParseSchema((window as any).SCHEMA_JSON);
    } catch (_e3) { }
    return { version: '1.0', fields: [] };
  }

  function fetchWorkflowDef(formId: number): Promise<any> {
    if (!formId) return Promise.resolve(null);
    var candidates = getPlatform() === 'oqtane'
      ? ['/Form/Workflow/Get?formId=' + formId, '/Workflow/Get?formId=' + formId]
      : ['/Workflow/Get?formId=' + formId, '/Form/Workflow/Get?formId=' + formId];
    return new Promise(function (resolve) {
      apiGetMulti(candidates, function (_err: any, data: any) {
        var rawWorkflow = data ? (data.workflow != null ? data.workflow : (data.Workflow != null ? data.Workflow : null)) : null;
        resolve(rawWorkflow ? normalizeWorkflowDef(rawWorkflow) : null);
      });
    });
  }

  function safeParseSchema(schemaJson: any): FormSchema {
    var schema: FormSchema = { version: '1.0', fields: [] };
    if (!schemaJson) return schema;
    try {
      var raw = typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson;
      schema.version = raw && (raw.version || raw.Version) ? String(raw.version || raw.Version) : '1.0';
      schema.pages = raw && (raw.pages || raw.Pages) ? (raw.pages || raw.Pages) : [];
      schema.settings = raw && (raw.settings || raw.Settings) ? (raw.settings || raw.Settings) : {};
      schema.fields = flattenSchemaFields(raw && (raw.fields || raw.Fields) ? (raw.fields || raw.Fields) : []);
    } catch (_e) {
      schema.fields = [];
    }
    return schema;
  }

  function flattenSchemaFields(fields: any[]): FormSchemaField[] {
    var result: FormSchemaField[] = [];
    (fields || []).forEach(function (f: any) {
      if (!f) return;
      var fieldType = String(f.type || f.Type || '').toLowerCase();
      var rowColumns = f.columns || f.Columns || [];
      if (fieldType === 'row' && rowColumns && rowColumns.length) {
        (rowColumns || []).forEach(function (col: any) {
          result = result.concat(flattenSchemaFields((col && (col.fields || col.Fields)) || []));
        });
        return;
      }
      var fieldKey = f.key || f.Key;
      if (!fieldKey) return;
      result.push({
        key: String(fieldKey || ''),
        type: String(f.type || f.Type || 'Text'),
        label: String(f.label || f.Label || fieldKey || 'Field'),
        required: !!(f.required || f.Required),
        options: normalizeFieldOptions(f.options || f.Options),
        pageIndex: typeof (f.pageIndex != null ? f.pageIndex : f.PageIndex) === 'number' ? (f.pageIndex != null ? f.pageIndex : f.PageIndex) : 0
      });
    });
    return result;
  }

  function mountReactApp(overlay: HTMLElement, schema: FormSchema, workflowDef: any): void {
    var R = (window as any).React;

    var RD = (window as any).ReactDOM;
    var RF = (window as any).ReactFlow;
    var h = R.createElement;

    // ── Component factories (wf-components.ts) — must be AFTER h/R/RF defined ──
    var _ctx = { h: h, R: R, RF: RF, NODE_META: NODE_META, schema: schema, getVariables: function () { return (W._state && W._state.workflowVariables) || []; } };
    var MFNode               = createMFNode(_ctx);
    var CustomMiniMap        = createCustomMiniMap(_ctx);
    var ZoneBackground       = createZoneBackground(_ctx);
    var NodePalette          = createNodePalette(_ctx, TRIGGER_TYPES, NAV_TYPES, LOGIC_TYPES, ACTION_TYPES, INTEGRATION_TYPES);
    var Toast                = createToast(_ctx);
    // FieldInsertButton, ConditionGroupEditor, VariablesPanel need getFieldByKey + getOperatorsForFieldType
    // — wired below after those helpers are declared

    if (!document.getElementById('mf-wfrf-styles')) {
      var style = document.createElement('style');
      style.id = 'mf-wfrf-styles';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }

    function getFieldByKey(fieldKey: string): FormSchemaField | null {
      var found: FormSchemaField | null = null;
      (schema.fields || []).forEach(function (f) { if (f.key === fieldKey) found = f; });
      return found;
    }

    function displayFieldLabel(fieldKey: string): string {
      var field = getFieldByKey(fieldKey);
      return field ? (field.label + ' (' + field.key + ')') : (fieldKey || 'Form Field');
    }

    function normalizeSwitchConfig(cfg: any): any {
      return normalizeSwitchNodeConfig(cfg, schema);
    }

    function normalizeLoopConfig(cfg: any): any {
      return normalizeLoopNodeConfig(cfg, schema);
    }

    function normalizeGoogleSheetsConfig(cfg: any): any {
      return normalizeGoogleSheetsNodeConfig(cfg, schema);
    }

    function getNodeDisplayLabel(nodeType: string, label: string, config: any): string {
      if (nodeType === 'FormField' && config) {
        if (config.isPageNode) return 'Page ' + String((typeof config.pageIndex === 'number' ? config.pageIndex : 0) + 1);
        if (config.fieldKey) return displayFieldLabel(config.fieldKey);
      }
      if (nodeType === 'Switch' && config && config.fieldKey) return 'Switch • ' + displayFieldLabel(config.fieldKey);
      if (nodeType === 'Loop' && config) {
        if (config.sourceType === 'variable' && config.variableKey) return 'Loop • ' + String(config.variableKey);
        if (config.fieldKey) return 'Loop • ' + displayFieldLabel(config.fieldKey);
      }
      if (nodeType === 'GoogleSheets' && config) {
        if (config.range) return 'Google Sheets • ' + String(config.range);
        if (config.spreadsheetId) return 'Google Sheets • ' + String(config.spreadsheetId).slice(0, 10);
      }
      return label || ((NODE_META[nodeType] && NODE_META[nodeType].label) || nodeType);
    }
    // Wire context-dependent factories (need getFieldByKey + getOperatorsForFieldType)
    var FieldInsertButton    = createFieldInsertButton(_ctx);
    var ConditionGroupEditor = createConditionGroupEditor(_ctx, getFieldByKey, getOperatorsForFieldType);
    var VariablesPanel       = createVariablesPanel(_ctx);
    var DatabaseConfigPanel  = createDatabaseConfigPanel(_ctx);
    var SetVariableConfigPanel = createSetVariableConfigPanel(_ctx);
    var IssuesPanel          = createIssuesPanel(_ctx);


    function ConfigPanel(props: any): any {
      var node = props.node;
      var onSave = props.onSave;
      var onDel = props.onDel;
      var onSetStart = props.onSetStart;
      var onDraftChange = props.onDraftChange;
      var allNodes = props.allNodes || [];
      var selectedEdge = props.selectedEdge || null;
      var onDeleteSelected = props.onDeleteSelected;
      var variables = props.variables || (((W._state && W._state.workflowVariables) || []) as any[]);
      // useState called as R.useState() directly
      // useEffect called as R.useEffect() directly

      // ── Hooks ALWAYS called (never skip) ──
      var nodeId = node ? node.id : null;
      var stateLabel = R.useState(node ? (node.data.label || '') : '');
      var label = stateLabel[0], setLabel = stateLabel[1];
      var stateZone = R.useState(node ? (node.data.zoneType || 'Action') : 'Action');
      var zoneType = stateZone[0], setZoneType = stateZone[1];
      var stateDisabled = R.useState(node ? !!node.data.isDisabled : false);
      var isDisabled = stateDisabled[0], setIsDisabled = stateDisabled[1];
      var stateConfig = R.useState(node ? deepClone(node.data.config || {}) : {});
      var config = stateConfig[0], setConfig = stateConfig[1];
      // Email preview state — always at top level (Rules of Hooks)
      var stateShowPreview = R.useState(false);
      var showPreview = stateShowPreview[0], setShowPreview = stateShowPreview[1];
      var stateUiSchema = R.useState(null as any);
      var uiSchema = stateUiSchema[0], setUiSchema = stateUiSchema[1];
      var stateUiSchemaLoading = R.useState(false);
      var uiSchemaLoading = stateUiSchemaLoading[0], setUiSchemaLoading = stateUiSchemaLoading[1];
      var stateDbMeta = R.useState({ connections: [], tables: [], procedures: [], columns: [], procedureParams: [] } as any);
      var dbMeta = stateDbMeta[0], setDbMeta = stateDbMeta[1];
      var stateDbMetaLoading = R.useState({ connections: false, tables: false, procedures: false, columns: false, procedureParams: false } as any);
      var dbMetaLoading = stateDbMetaLoading[0], setDbMetaLoading = stateDbMetaLoading[1];
      var stateDbConnectionSample = R.useState('');
      var dbConnectionSample = stateDbConnectionSample[0], setDbConnectionSample = stateDbConnectionSample[1];
      var stateDbTestState = R.useState({ status: 'idle', success: false, message: '', provider: '', supportsStoredProcedures: true, signature: '' } as any);
      var dbTestState = stateDbTestState[0], setDbTestState = stateDbTestState[1];

      R.useEffect(function () {
        if (!node) return;
        setLabel(node.data.label || '');
        setZoneType(node.data.zoneType || 'Action');
        setIsDisabled(!!node.data.isDisabled);
        setConfig(deepClone(node.data.config || {}));
      }, [nodeId]);

      R.useEffect(function () {
        if (!onDraftChange) return;
        if (!node) {
          onDraftChange(null);
          return;
        }
        onDraftChange({
          nodeId: node.id,
          nodeType: node.data.nodeType,
          label: label,
          zoneType: zoneType,
          isDisabled: isDisabled,
          config: deepClone(config || {})
        });
      }, [nodeId, label, zoneType, isDisabled, config]);

      R.useEffect(function () {
        var nodeType = node ? node.data.nodeType : '';
        if (!node || !SCHEMA_DRIVEN_NODE_TYPES[nodeType]) {
          setUiSchema(null);
          setUiSchemaLoading(false);
          return;
        }
        var cache = (W as any)._workflowNodeUiSchemaCache || ((W as any)._workflowNodeUiSchemaCache = {});
        if (cache[nodeType]) {
          setUiSchema(cache[nodeType]);
          setUiSchemaLoading(false);
          return;
        }
        setUiSchemaLoading(true);
        apiGet(workflowNodeSchemaPath(nodeType), function (err: any, data?: any) {
          if (!err && data) {
            cache[nodeType] = data;
            setUiSchema(data);
          } else {
            setUiSchema(null);
          }
          setUiSchemaLoading(false);
        });
      }, [nodeId, node ? node.data.nodeType : '']);

      useDatabaseNodeEffects({
        R: R,
        W: W,
        node: node,
        nodeId: nodeId,
        config: config,
        apiGet: apiGet,
        getPlatform: getPlatform,
        setDbMeta: setDbMeta,
        setDbMetaLoading: setDbMetaLoading,
        setDbConnectionSample: setDbConnectionSample,
        setDbTestState: setDbTestState,
        setConfig: setConfig,
        schema: schema,
        variables: variables,
        dbMeta: dbMeta,
        normalizeSchemaMappingRows: normalizeSchemaMappingRows,
        fieldToken: fieldToken,
        variableToken: variableToken
      });

      // ── No node selected ──
      if (!node) {
        return h('div', { className: 'mf-rf-empty-hint' },
          h('span', { style: { fontSize: 32 } }, '👆'),
          h('p', null, 'Select a node to edit its properties.'),
          h('small', null, 'Click any node on the canvas, or drag a new node from the palette.')
        );
      }

      var meta = NODE_META[node.data.nodeType] || NODE_META.FormField;

      function saveNode(): void {
        onSave(node.id, { label: label, zoneType: zoneType, isDisabled: isDisabled, config: sanitizeNodeConfig(node.data.nodeType, config) });
      }

      function getSchemaSourceTokenOptions(): any[] {
        var fieldTokens = (schema.fields || []).map(function (f: any) {
          var key = String((f && f.key) || '').trim();
          if (!key) return null;
          return { value: fieldToken(key), label: String((f && (f.label || f.key)) || key), kind: 'field' };
        }).filter(Boolean);
        var variableTokens = (((W._state && W._state.workflowVariables) || []) as any[]).map(function (v: any) {
          var key = String((v && (v.key || v.name || v.id)) || '').trim();
          if (!key) return null;
          return { value: variableToken(key), label: key, kind: 'variable' };
        }).filter(Boolean);
        return fieldTokens.concat(variableTokens);
      }

      function normalizeMatchName(input: any): string {
        return String(input == null ? '' : input)
          .replace(/^@+/, '')
          .replace(/\{\{field\.|\{\{variable\.|\}\}/g, '')
          .replace(/[^a-z0-9]+/gi, '')
          .toLowerCase();
      }

      function suggestMappingSource(targetField: string): string {
        var normTarget = normalizeMatchName(targetField);
        if (!normTarget) return '';
        var fields = (schema.fields || []) as any[];
        var bestField = '';
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i] || {};
          var key = String(f.key || '').trim();
          var label = String((f.label || f.key) || '').trim();
          var normKey = normalizeMatchName(key);
          var normLabel = normalizeMatchName(label);
          if (!key) continue;
          if (normKey === normTarget || normLabel === normTarget) return fieldToken(key);
          if (!bestField && (normTarget.indexOf(normKey) >= 0 || normKey.indexOf(normTarget) >= 0 || (normLabel && (normTarget.indexOf(normLabel) >= 0 || normLabel.indexOf(normTarget) >= 0)))) {
            bestField = fieldToken(key);
          }
        }
        if (bestField) return bestField;
        var vars = (((W._state && W._state.workflowVariables) || []) as any[]);
        for (var vi = 0; vi < vars.length; vi++) {
          var v = vars[vi] || {};
          var vkey = String((v.key || v.name || v.id) || '').trim();
          var normVar = normalizeMatchName(vkey);
          if (!vkey) continue;
          if (normVar === normTarget || normTarget.indexOf(normVar) >= 0 || normVar.indexOf(normTarget) >= 0) return variableToken(vkey);
        }
        return '';
      }

      function renderVisibleTokenList(targetId: string, title: string): any {
        var sourceTokens = getSchemaSourceTokenOptions();
        var fieldTokens = sourceTokens.filter(function (x: any) { return x.kind === 'field'; }).map(function (x: any) { return { token: x.value, title: x.label }; });
        var variableTokens = sourceTokens.filter(function (x: any) { return x.kind === 'variable'; }).map(function (x: any) { return { token: x.value, title: x.label }; });
        if (!fieldTokens.length && !variableTokens.length) return null;
        function tokenBtn(item: any, cls?: string): any {
          return h('button', { type: 'button', key: item.token, className: 'mf-rf-picker__item' + (cls ? ' ' + cls : ''), title: item.title, onClick: function () { insertAtCursor(targetId, item.token); } }, item.token);
        }
        return h('div', { className: 'mf-rf-helper-card', style: { marginTop: 10 } },
          h('strong', null, title),
          h('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 8 } }, 'Click a token to insert it into this field.'),
          fieldTokens.length ? h('div', null,
            h('div', { className: 'mf-rf-picker__section-label', style: { marginBottom: 6 } }, 'Form fields'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, fieldTokens.map(function (item: any) { return tokenBtn(item); }))
          ) : null,
          variableTokens.length ? h('div', { style: { marginTop: fieldTokens.length ? 8 : 0 } },
            h('div', { className: 'mf-rf-picker__section-label', style: { marginBottom: 6 } }, 'Process variables'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, variableTokens.map(function (item: any) { return tokenBtn(item, 'mf-rf-picker__item--sys'); }))
          ) : null
        );
      }

      function renderSendEmailConfigBridge(): any {
        return renderSendEmailConfig({
          h: h,
          config: config || {},
          setConfig: setConfig,
          showPreview: showPreview,
          setShowPreview: setShowPreview,
          getSchemaSourceTokenOptions: getSchemaSourceTokenOptions,
          renderSimpleTokensHtml: renderSimpleTokensHtml,
          FieldInsertButton: FieldInsertButton
        });
      }

      function renderWebhookConfigBridge(): any {
        return renderWebhookConfig({
          h: h,
          R: R,
          schema: schema,
          config: config || {},
          setConfig: setConfig,
          cfgField: cfgField,
          cfgFieldRow: cfgFieldRow,
          cfgSection: cfgSection,
          FieldInsertButton: FieldInsertButton,
          normalizeWebhookConfig: normalizeWebhookConfig,
          normalizeWebhookHeaders: normalizeWebhookHeaders,
          normalizeWebhookAuth: normalizeWebhookAuth,
          normalizeWebhookBodyMappings: normalizeWebhookBodyMappings,
          normalizeWebhookRetry: normalizeWebhookRetry,
          normalizeWebhookResponseRoutes: normalizeWebhookResponseRoutes
        });
      }

      function renderConditionConfigBridge(): any {
        return renderConditionConfig({
          h: h,
          R: R,
          config: config || {},
          setConfig: setConfig,
          cfgField: cfgField,
          ConditionGroupEditor: ConditionGroupEditor,
          normalizeConditionConfig: normalizeConditionConfig
        });
      }
      function renderApprovalConfigBridge(): any {
        return renderApprovalConfig({
          h: h,
          R: R,
          formId: W._state.formId | 0,
          config: config || {},
          setConfig: function (next: any) { setConfig(normalizeApprovalConfig(next)); },
          cfgField: cfgField
        });
      }
      function renderSwitchConfigBridge(): any {
        return h('div', { className: 'mf-rf-empty-inline', 'data-wf-cleanup-badge': WORKFLOW_WORKFLOW_CLEANUP_BADGE }, 'Switch removed from workflow.');
      }

      function renderLoopConfigBridge(): any {
        return h('div', { className: 'mf-rf-empty-inline', 'data-wf-cleanup-badge': WORKFLOW_WORKFLOW_CLEANUP_BADGE }, 'Loop removed from workflow.');
      }

      function renderGoogleSheetsConfigBridge(): any {
        return renderGoogleSheetsConfig({
          h: h,
          R: R,
          config: config,
          setConfig: function (next: any) { setConfig(normalizeGoogleSheetsConfig(next)); },
          cfgField: cfgField,
          cfgFieldRow: cfgFieldRow,
          cfgSection: cfgSection,
          FieldInsertButton: FieldInsertButton,
          schema: schema,
          normalizeGoogleSheetsConfig: normalizeGoogleSheetsConfig
        });
      }

      function renderSchemaDrivenConfig(schemaDef: any): any {
        if (!schemaDef || !node) return null;
        if (node.data.nodeType === 'Database') {
          return h(DatabaseConfigPanel, {
            config: config,
            setConfig: setConfig,
            dbMeta: dbMeta,
            dbMetaLoading: dbMetaLoading,
          });
        }
        return null;
      }

      function renderCalculateConfig(): any {
        return h(R.Fragment, null,
          cfgField('Target Variable *', h('input', { className: 'mf-rf-cfg-input', value: config.targetVariable || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { targetVariable: e.target.value })); } })),
          cfgField('Operand 1', h('input', { className: 'mf-rf-cfg-input', placeholder: 'variable.score | field.quantity | 10', value: config.operand1 || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { operand1: e.target.value })); } })),
          cfgField('Operator', h('select', { className: 'mf-rf-cfg-input', value: config.operator || 'assign', onChange: function (e: any) { setConfig(Object.assign({}, config, { operator: e.target.value })); } }, ['add', 'subtract', 'multiply', 'divide', 'assign'].map(function (m) { return h('option', { key: m, value: m }, m); }))),
          cfgField('Operand 2', h('input', { className: 'mf-rf-cfg-input', placeholder: 'variable.score | field.quantity | 10', value: config.operand2 || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { operand2: e.target.value })); } })),
          h('label', { className: 'mf-rf-cfg-check' }, h('input', { type: 'checkbox', checked: !!config.roundToInt, onChange: function (e: any) { setConfig(Object.assign({}, config, { roundToInt: !!e.target.checked })); } }), h('span', null, 'Round to int'))
        );
      }

      function renderEndConfig(): any {
        return h(R.Fragment, null,
          cfgField('End Type', h('select', { className: 'mf-rf-cfg-input', value: normalizeEndType(config.endType || 'Success'), onChange: function (e: any) { setConfig(Object.assign({}, config, { endType: e.target.value })); } }, ['Success', 'Failure', 'Cancelled'].map(function (m) { return h('option', { key: m, value: m }, m); }))),
          cfgFieldRow('Message', 'mf-end-message', h('input', { id: 'mf-end-message', className: 'mf-rf-cfg-input', value: config.message || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { message: e.target.value })); } }), h(FieldInsertButton, { targetId: 'mf-end-message' })),
          cfgField('Redirect URL', h('input', { className: 'mf-rf-cfg-input', value: config.redirectUrl || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { redirectUrl: e.target.value })); } }))
        );
      }

      function renderForkConfig(): any {
        // Fork: splits workflow into parallel branches. Each output edge runs simultaneously.
        // joinNodeId tells the executor which Join node to wait at before continuing.
        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Parallel fork'),
            h('div', null, 'Connect multiple output edges from this node. All branches run in parallel until they reach the Join node you specify below.')
          ),
          cfgField('Join Node ID *',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. join-1',
              value: config.joinNodeId || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { joinNodeId: e.target.value })); }
            })
          ),
          cfgField('Max parallel branches',
            h('input', { type: 'number', min: 2, max: 20, className: 'mf-rf-cfg-input',
              value: config.maxBranches || 2,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { maxBranches: Math.max(2, parseInt(e.target.value,10)||2) })); }
            })
          ),
          h('label', { className: 'mf-rf-cfg-check' },
            h('input', { type: 'checkbox', checked: !!config.failFast,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { failFast: !!e.target.checked })); }
            }),
            h('span', null, 'Fail fast — stop all branches if one fails')
          )
        );
      }

      function renderJoinConfig(): any {
        // Join: waits for all (or some) parallel branches from a Fork before continuing.
        var strategy = config.strategy || 'wait-all';
        var timeout = config.timeoutSeconds || 300;
        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Parallel join'),
            h('div', null, 'This node resumes the workflow when the configured number of branches have completed.')
          ),
          cfgField('Join strategy',
            h('select', { className: 'mf-rf-cfg-input', value: strategy,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { strategy: e.target.value })); }
            },
              h('option', { value: 'wait-all' }, 'Wait for ALL branches (default)'),
              h('option', { value: 'first-wins' }, 'First branch wins — cancel the rest'),
              h('option', { value: 'threshold' }, 'Wait for N branches (threshold)')
            )
          ),
          strategy === 'threshold' && cfgField('Minimum branches required',
            h('input', { type: 'number', min: 1, max: 20, className: 'mf-rf-cfg-input',
              value: config.threshold || 1,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { threshold: Math.max(1, parseInt(e.target.value,10)||1) })); }
            })
          ),
          cfgField('Timeout (seconds)',
            h('input', { type: 'number', min: 1, max: 3600, className: 'mf-rf-cfg-input',
              value: timeout,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { timeoutSeconds: Math.max(1, parseInt(e.target.value,10)||300) })); }
            })
          ),
          cfgField('On timeout',
            h('select', { className: 'mf-rf-cfg-input', value: config.onTimeout || 'fail',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { onTimeout: e.target.value })); }
            },
              h('option', { value: 'fail' }, 'Fail the workflow'),
              h('option', { value: 'continue' }, 'Continue with completed branches'),
              h('option', { value: 'skip' }, 'Skip to next node')
            )
          ),
          cfgField('Result variable (optional)',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. branchResults',
              value: config.resultVariable || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { resultVariable: e.target.value })); }
            })
          )
        );
      }

      function renderFilterConfig(): any {
        // Filter: single-branch gate. If condition passes → continue. If fails → workflow stops here.
        var groups: ConditionGroup[] = (config.conditionGroups && config.conditionGroups.length)
          ? config.conditionGroups
          : [{ id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'Equals', value: '', valueType: 'literal' }] }];
        var onFail = config.onFail || 'stop';
        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Filter / gate'),
            h('div', null, 'Workflow continues only if ALL conditions pass. Unlike Condition, Filter has one output — it either passes or stops.')
          ),
          h(ConditionGroupEditor, {
            groups: groups,
            setGroups: function (next: ConditionGroup[]) { setConfig(Object.assign({}, config, { conditionGroups: next })); }
          }),
          cfgField('If filter fails',
            h('select', { className: 'mf-rf-cfg-input', value: onFail,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { onFail: e.target.value })); }
            },
              h('option', { value: 'stop' }, 'Stop workflow (default)'),
              h('option', { value: 'end-success' }, 'End as Success'),
              h('option', { value: 'end-failure' }, 'End as Failure'),
              h('option', { value: 'skip' }, 'Skip to node ID below')
            )
          ),
          onFail === 'skip' && cfgField('Skip to node ID',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. end-1',
              value: config.skipToNodeId || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { skipToNodeId: e.target.value })); }
            })
          ),
          cfgField('Filter label (shown on edge)',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. Valid data',
              value: config.passLabel || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { passLabel: e.target.value })); }
            })
          )
        );
      }

      function renderDatabaseConfig(): any {
        var op       = config.operation   || 'select';
        var table    = config.table       || '';
        var connStr  = config.connectionString || '';
        var dbType   = config.dbType      || 'sqlite';
        var mappings: any[] = config.fieldMappings || [];
        var conditions: any[] = config.whereConditions || [];
        var resultVar = config.resultVariable || '';
        var limit    = config.limit       || 100;

        function patchDb(next: AnyObj): void { setConfig(Object.assign({}, config, next)); }

        function addMapping(): void   { patchDb({ fieldMappings:    mappings.concat([{ column:'', fieldKey:'', staticValue:'' }]) }); }
        function addCondition(): void { patchDb({ whereConditions:  conditions.concat([{ column:'', operator:'=', value:'', valueType:'field' }]) }); }
        function removeMapping(i: number): void   { patchDb({ fieldMappings:    mappings.filter(function(_:any,x:number){ return x!==i; }) }); }
        function removeCondition(i: number): void { patchDb({ whereConditions:  conditions.filter(function(_:any,x:number){ return x!==i; }) }); }

        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Database node'),
            h('div', null, 'Run SQL operations (SELECT, INSERT, UPDATE, DELETE) directly on your configured database. Map form fields to columns and optionally store results in a variable.')
          ),

          // ── Connection ──────────────────────────────────────────────────────
          cfgSection('Connection', 'Which database and table to target.', h(R.Fragment, null,
            cfgField('Database type',
              h('select', { className: 'mf-rf-cfg-input', value: dbType,
                onChange: function(e:any){ patchDb({ dbType: e.target.value }); }
              },
                h('option', { value:'sqlite' },    'SQLite'),
                h('option', { value:'sqlserver' }, 'SQL Server'),
                h('option', { value:'postgres' },  'PostgreSQL'),
                h('option', { value:'mysql' },     'MySQL')
              )
            ),
            cfgFieldRow('Connection string', 'mf-db-conn',
              h('input', { id:'mf-db-conn', className:'mf-rf-cfg-input',
                placeholder: dbType==='sqlite' ? 'megaform.db' : 'Server=...;Database=...;User=...;Password=...',
                value: connStr,
                onChange: function(e:any){ patchDb({ connectionString: e.target.value }); }
              }),
              h(FieldInsertButton, { targetId: 'mf-db-conn' })
            ),
            cfgField('Table / view name',
              h('input', { className:'mf-rf-cfg-input', placeholder:'e.g. submissions, users',
                value: table, onChange: function(e:any){ patchDb({ table: e.target.value }); }
              })
            )
          )),

          // ── Operation ───────────────────────────────────────────────────────
          cfgSection('Operation', 'What SQL operation to execute.', h(R.Fragment, null,
            cfgField('Operation',
              h('div', { style:{ display:'flex', gap:6, flexWrap:'wrap' } },
                ['select','insert','update','delete','custom'].map(function(op2:string){
                  return h('label', { key:op2, className:'mf-rf-radio' },
                    h('input', { type:'radio', checked: op===op2,
                      onChange: function(){ patchDb({ operation: op2 }); }
                    }),
                    h('span', null, op2.toUpperCase())
                  );
                })
              )
            ),

            // SELECT-specific
            op === 'select' && cfgField('Columns (comma-separated)',
              h('input', { className:'mf-rf-cfg-input', placeholder:'* or col1, col2, col3',
                value: config.columns || '',
                onChange: function(e:any){ patchDb({ columns: e.target.value }); }
              })
            ),
            op === 'select' && cfgField('Limit rows',
              h('input', { type:'number', min:1, max:10000, className:'mf-rf-cfg-input',
                value: limit, onChange: function(e:any){ patchDb({ limit: Math.max(1, parseInt(e.target.value,10)||100) }); }
              })
            ),
            op === 'select' && cfgField('ORDER BY',
              h('input', { className:'mf-rf-cfg-input', placeholder:'e.g. created_at DESC',
                value: config.orderBy || '',
                onChange: function(e:any){ patchDb({ orderBy: e.target.value }); }
              })
            ),

            // CUSTOM SQL
            op === 'custom' && cfgFieldRow('Custom SQL', 'mf-db-sql',
              h('textarea', { id:'mf-db-sql', className:'mf-rf-cfg-input mf-rf-cfg-textarea', rows:5,
                placeholder:'SELECT * FROM users WHERE email = {{field.email}}',
                value: config.customSql || '',
                onChange: function(e:any){ patchDb({ customSql: e.target.value }); }
              }),
              h(FieldInsertButton, { targetId: 'mf-db-sql' })
            )
          )),

          // ── WHERE conditions (SELECT / UPDATE / DELETE) ──────────────────────
          (op==='select' || op==='update' || op==='delete') && cfgSection(
            'WHERE conditions', 'Filter rows. All conditions are joined with AND.',
            h('div', null,
              conditions.length
                ? conditions.map(function(row:any, i:number){
                    return h('div', { key:'cond-'+i, className:'mf-rf-map-card' },
                      h('div', { className:'mf-rf-row2 mf-rf-row2--triple' },
                        cfgField('Column',
                          h('input', { className:'mf-rf-cfg-input', placeholder:'column_name',
                            value: row.column||'',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{column:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          })
                        ),
                        cfgField('Operator',
                          h('select', { className:'mf-rf-cfg-input', value: row.operator||'=',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{operator:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          },
                            ['=','!=','>','<','>=','<=','LIKE','IS NULL','IS NOT NULL'].map(function(op3:string){
                              return h('option',{key:op3,value:op3},op3);
                            })
                          )
                        ),
                        cfgField('Value type',
                          h('select', { className:'mf-rf-cfg-input', value: row.valueType||'field',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{valueType:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          },
                            h('option',{value:'field'},'Form field'),
                            h('option',{value:'literal'},'Literal value'),
                            h('option',{value:'variable'},'Variable')
                          )
                        )
                      ),
                      row.operator !== 'IS NULL' && row.operator !== 'IS NOT NULL' &&
                        cfgFieldRow('Value', 'mf-db-cond-val-'+i,
                          h('input', { id:'mf-db-cond-val-'+i, className:'mf-rf-cfg-input',
                            placeholder: row.valueType==='field' ? '{{field.email}}' : row.valueType==='variable' ? '{{variable.userId}}' : 'literal value',
                            value: row.value||'',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{value:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          }),
                          h(FieldInsertButton, { targetId: 'mf-db-cond-val-'+i })
                        ),
                      h('div', { className:'mf-rf-inline-actions' },
                        h('button', { type:'button', className:'mf-rf-cfg-btn mf-rf-cfg-btn--danger',
                          onClick: function(){ removeCondition(i); }
                        }, 'Remove')
                      )
                    );
                  })
                : h('div', { className:'mf-rf-empty-inline' }, 'No conditions — will match ALL rows.'),
              h('button', { type:'button', className:'mf-rf-cfg-btn', onClick: addCondition }, '+ Add condition')
            )
          ),

          // ── Field mappings (INSERT / UPDATE) ────────────────────────────────
          (op==='insert' || op==='update') && cfgSection(
            'Column mappings', 'Map form fields or values to database columns.',
            h('div', null,
              mappings.length
                ? mappings.map(function(row:any, i:number){
                    return h('div', { key:'map-'+i, className:'mf-rf-map-card' },
                      h('div', { className:'mf-rf-row2 mf-rf-row2--stackable' },
                        cfgField('DB column',
                          h('input', { className:'mf-rf-cfg-input', placeholder:'column_name',
                            value: row.column||'',
                            onChange: function(e:any){ mappings[i]=Object.assign({},row,{column:e.target.value}); patchDb({fieldMappings:mappings.slice(0)}); }
                          })
                        ),
                        cfgField('Source type',
                          h('select', { className:'mf-rf-cfg-input', value: row.sourceType||'field',
                            onChange: function(e:any){ mappings[i]=Object.assign({},row,{sourceType:e.target.value}); patchDb({fieldMappings:mappings.slice(0)}); }
                          },
                            h('option',{value:'field'},'Form field'),
                            h('option',{value:'static'},'Static value'),
                            h('option',{value:'variable'},'Variable'),
                            h('option',{value:'now'},'Current timestamp')
                          )
                        )
                      ),
                      row.sourceType !== 'now' && cfgFieldRow('Value', 'mf-db-map-val-'+i,
                        h('input', { id:'mf-db-map-val-'+i, className:'mf-rf-cfg-input',
                          placeholder: row.sourceType==='field' ? '{{field.email}}' : row.sourceType==='variable' ? '{{variable.score}}' : 'literal value',
                          value: row.value||'',
                          onChange: function(e:any){ mappings[i]=Object.assign({},row,{value:e.target.value}); patchDb({fieldMappings:mappings.slice(0)}); }
                        }),
                        h(FieldInsertButton, { targetId: 'mf-db-map-val-'+i })
                      ),
                      h('div', { className:'mf-rf-inline-actions' },
                        h('button', { type:'button', className:'mf-rf-cfg-btn mf-rf-cfg-btn--danger',
                          onClick: function(){ removeMapping(i); }
                        }, 'Remove')
                      )
                    );
                  })
                : h('div', { className:'mf-rf-empty-inline' }, 'No mappings yet. Add columns to write.'),
              h('button', { type:'button', className:'mf-rf-cfg-btn', onClick: addMapping }, '+ Add column mapping')
            )
          ),

          // ── Result ──────────────────────────────────────────────────────────
          cfgSection('Result', 'Store query results in a workflow variable.', h(R.Fragment, null,
            cfgField('Result variable',
              h('input', { className:'mf-rf-cfg-input', placeholder:'e.g. dbRows, insertedId',
                value: resultVar, onChange: function(e:any){ patchDb({ resultVariable: e.target.value }); }
              })
            ),
            op === 'select' && h('label', { className:'mf-rf-cfg-check' },
              h('input', { type:'checkbox', checked: !!config.firstRowOnly,
                onChange: function(e:any){ patchDb({ firstRowOnly: !!e.target.checked }); }
              }),
              h('span', null, 'Return first row only (as object, not array)')
            ),
            h('label', { className:'mf-rf-cfg-check' },
              h('input', { type:'checkbox', checked: !!config.failOnEmpty,
                onChange: function(e:any){ patchDb({ failOnEmpty: !!e.target.checked }); }
              }),
              h('span', null, 'Fail workflow if no rows affected / returned')
            )
          ))
        );
      }


      function renderFormFieldConfig(): any {
        var isPageNode = !!config.isPageNode;
        var pageIndex = typeof config.pageIndex === 'number' ? config.pageIndex : 0;
        var pageCount = schema.pages && schema.pages.length ? schema.pages.length : inferPageCount(schema);
        var pageOptions: any[] = [];
        for (var pi = 0; pi < pageCount; pi++) pageOptions.push(h('option', { key: pi, value: pi }, String(pi)));
        return h(R.Fragment, null,
          cfgField('Mode', h('div', null,
            h('label', { className: 'mf-rf-radio' }, h('input', { type: 'radio', checked: isPageNode, onChange: function () { setConfig(Object.assign({}, config, { isPageNode: true })); } }), h('span', null, 'Represent page')),
            h('label', { className: 'mf-rf-radio' }, h('input', { type: 'radio', checked: !isPageNode, onChange: function () { setConfig(Object.assign({}, config, { isPageNode: false })); } }), h('span', null, 'Choose field'))
          )),
          !isPageNode && cfgField('Field', h('select', { className: 'mf-rf-cfg-input', value: config.fieldKey || '', onChange: function (e: any) {
            var field = getFieldByKey(e.target.value);
            setConfig(Object.assign({}, config, { fieldKey: e.target.value, pageIndex: field ? field.pageIndex || 0 : 0, isPageNode: false }));
            if (field) setLabel(field.label);
          } }, h('option', { value: '' }, 'Select field...'), (schema.fields || []).map(function (f: any) { return h('option', { key: f.key, value: f.key }, f.label + ' (' + String(f.type || '').toLowerCase() + (f.required ? ', required' : '') + ')'); }))),
          cfgField('Page Index', h('select', { className: 'mf-rf-cfg-input', value: pageIndex, onChange: function (e: any) { setConfig(Object.assign({}, config, { pageIndex: parseInt(e.target.value, 10) || 0 })); } }, pageOptions))
        );
      }

      function renderTypeConfig(): any {
        if (SCHEMA_DRIVEN_NODE_TYPES[node.data.nodeType]) {
          if (uiSchemaLoading) return h('div', { className: 'mf-rf-empty-inline' }, 'Loading schema...');
          if (uiSchema && String(uiSchema.nodeType || uiSchema.NodeType || '') === String(node.data.nodeType)) {
            var schemaDriven = renderSchemaDrivenConfig(uiSchema);
            if (schemaDriven) return schemaDriven;
          }
        }
        if (node.data.nodeType === 'FormField')   return renderFormFieldConfig();
        if (node.data.nodeType === 'Condition')   return renderConditionConfigBridge();
        if (node.data.nodeType === 'Approval')    return renderApprovalConfigBridge();
        if (node.data.nodeType === 'Switch')      return renderSwitchConfigBridge();
        if (node.data.nodeType === 'Loop')        return renderLoopConfigBridge();
        if (node.data.nodeType === 'GoogleSheets') return renderGoogleSheetsConfigBridge();
        if (node.data.nodeType === 'Webhook')     return renderWebhookConfigBridge();
        if (node.data.nodeType === 'SendEmail')   return renderSendEmailConfigBridge();
        if (node.data.nodeType === 'Calculate')   return renderCalculateConfig();
        if (node.data.nodeType === 'End')         return renderEndConfig();
        if (node.data.nodeType === 'Fork')        return renderForkConfig();
        if (node.data.nodeType === 'Join')        return renderJoinConfig();
        if (node.data.nodeType === 'Database')
          return h(DatabaseConfigPanel, {
            config:    config,
            setConfig: setConfig,
            dbMeta: dbMeta,
            dbMetaLoading: dbMetaLoading,
          });
        if (node.data.nodeType === 'SetVariable')
          return h(SetVariableConfigPanel, {
            config:    config,
            setConfig: setConfig,
          });
        // Any other future node type — show placeholder if somehow loaded
        return h('div', { className: 'mf-rf-empty-inline' },
          'This node type (' + node.data.nodeType + ') is not supported in this version.'
        );
      }

      return h('div', { className: 'mf-rf-config' },
        h('div', { className: 'mf-rf-config__header', style: { borderBottomColor: meta.border } },
          h('span', { style: { fontSize: 22 } }, meta.icon),
          h('div', null,
            h('div', { className: 'mf-rf-config__type' }, meta.label),
            h('div', { className: 'mf-rf-config__id' }, node.id)
          )
        ),
        h('div', { className: 'mf-rf-config__body' },
          cfgSection('Basics', 'Name, zone, and visibility for this workflow node.', [
            cfgField('Label', h('input', { className: 'mf-rf-cfg-input', value: label, onChange: function (e: any) { setLabel(e.target.value); } })),
            cfgField('Zone', h('select', { className: 'mf-rf-cfg-input', value: zoneType, onChange: function (e: any) { setZoneType(e.target.value); } }, h('option', { value: 'Navigation' }, 'Navigation'), h('option', { value: 'Action' }, 'Action'))),
            h('label', { className: 'mf-rf-cfg-check' }, h('input', { type: 'checkbox', checked: isDisabled, onChange: function (e: any) { setIsDisabled(!!e.target.checked); } }), h('span', null, 'Disabled'))
          ]),
          cfgSection('Configuration', 'Settings below change how this node behaves during the workflow.', renderTypeConfig()),
          cfgSection('Actions', null,
            h('div', { className: 'mf-rf-config__actions' },
              h('button', buttonProps({ className: 'mf-rf-cfg-btn mf-rf-cfg-btn--primary', onClick: saveNode }), 'Apply'),
              !node.data.isStart && node.data.nodeType === 'FormField' ? h('button', buttonProps({ className: 'mf-rf-cfg-btn mf-rf-cfg-btn--ghost', onClick: function () { onSetStart(node.id); } }), '⭐ Set as Start') : null,
              h('button', buttonProps({ className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger', onClick: function () { onDel(node.id); } }), 'Delete')
            )
          )
        )
      );
    }

    function cfgField(label: string, inputEl: any): any {
      return h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' }, h('label', { className: 'mf-rf-cfg-label' }, label), inputEl);
    }
    function cfgFieldRow(label: string, targetId: string, inputEl: any, pickerEl: any): any {
      return h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' }, h('label', { className: 'mf-rf-cfg-label' }, label), h('div', { className: 'mf-rf-input-with-picker nodrag nopan nowheel', 'data-target': targetId }, inputEl, pickerEl));
    }

    function cfgSection(title: string, hint: string | null, content: any): any {
      return h('section', { className: 'mf-rf-config-section' },
        h('div', { className: 'mf-rf-config-section__head' },
          h('div', { className: 'mf-rf-config-section__title' }, title),
          hint ? h('div', { className: 'mf-rf-config-section__hint' }, hint) : null
        ),
        h('div', { className: 'mf-rf-config-section__body' }, content)
      );
    }

    function TestRunPanel(props: any): any {
      var result = props.result;
      var onClose = props.onClose;
      if (!result) return null;
      var log = result.log || [];
      var status = result.status || 'unknown';
      var isOk = status === 'completed';
      return h('div', { className: 'mf-rf-testrun' + (isOk ? ' mf-rf-testrun--ok' : ' mf-rf-testrun--err') },
        h('div', { className: 'mf-rf-testrun__header' }, h('span', null, isOk ? '✅' : '❌', ' Test Run: ', String(status).toUpperCase()), h('button', buttonProps({ onClick: onClose, className: 'mf-rf-testrun__close' }), '✕')),
        result.errorMessage && h('div', { className: 'mf-rf-testrun__err-msg' }, result.errorMessage),
        h('div', { className: 'mf-rf-testrun__log' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Node'), h('th', null, 'Status'), h('th', null, 'ms'))),
            h('tbody', null, log.map(function (e: any, i: number) {
              return h('tr', { key: i, className: e.status === 'success' ? 'mf-rf-log--ok' : 'mf-rf-log--err' }, h('td', null, e.nodeLabel || e.nodeId), h('td', null, e.status), h('td', null, e.durationMs || 0));
            }))
          )
        )
      );
    }


    function renderWorkflowSidePanel(props: any): any {
      var selNode = props.selNode;
      var rightTab = props.rightTab;
      var setRightTab = props.setRightTab;
      var variables = props.variables;
      var setVariables = props.setVariables;
      var onConfigSave = props.onConfigSave;
      var onConfigDel = props.onConfigDel;
      var onSetStart = props.onSetStart;
      var onDraftChange = props.onDraftChange;
      var allNodes = props.allNodes || [];
      var selectedEdge = props.selectedEdge || null;
      var onDeleteSelected = props.onDeleteSelected;
      var panelGuards = props.panelGuards;
      var isOpen = props.isOpen !== false;
      var onToggle = props.onToggle;
      var onStartResize = props.onStartResize;
      var panelWidth = props.panelWidth || 440;
      var rightMeta = selNode ? (NODE_META[selNode.data.nodeType] || NODE_META.FormField) : null;
      var panelStyle = { width: (isOpen ? panelWidth : 52) + 'px', minWidth: (isOpen ? panelWidth : 52) + 'px', maxWidth: isOpen ? '620px' : '52px' } as any;
      if (!isOpen) {
        return h('aside', Object.assign({ className: 'mf-rf-sidepanel-host mf-rf-sidepanel-host--collapsed nodrag nopan nowheel', style: panelStyle }, panelGuards),
          h('div', Object.assign({ className: 'mf-rf-sidepanel mf-rf-sidepanel--collapsed nodrag nopan nowheel' }, panelGuards),
            h('button', { type: 'button', className: 'mf-rf-sidepanel__peek', title: 'Open BPMN panel', onPointerDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onMouseDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onClick: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); if (onToggle) onToggle(true); } },
              h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
                h('path', { d: 'M15 3v18' })
              )
            ),
            h('button', { type: 'button', className: 'mf-rf-sidepanel__peek-tab' + (rightTab === 'properties' ? ' is-active' : ''), title: 'Properties', onPointerDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onMouseDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onClick: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); setRightTab('properties'); if (onToggle) onToggle(true); } },
              h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
                h('circle', { cx: 12, cy: 12, r: 3 }),
                h('path', { d: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83' })
              )
            ),
            h('button', { type: 'button', className: 'mf-rf-sidepanel__peek-tab' + (rightTab === 'variables' ? ' is-active' : ''), title: 'Variables', onPointerDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onMouseDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onClick: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); setRightTab('variables'); if (onToggle) onToggle(true); } },
              h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' })
              )
            )
          )
        );
      }
      return h('aside', Object.assign({ className: 'mf-rf-sidepanel-host nodrag nopan nowheel', style: panelStyle }, panelGuards),
        h('div', { className: 'mf-rf-panel-resizer', title: 'Drag to resize the workflow panel', onPointerDown: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); if (onStartResize) onStartResize(e); } }),
        h('div', Object.assign({ className: 'mf-rf-sidepanel nodrag nopan nowheel' }, panelGuards),
          h('div', { className: 'mf-rf-sidepanel__topbar' },
            h('div', { className: 'mf-rf-sidepanel__headline' },
              h('div', { className: 'mf-rf-sidepanel__title' }, rightTab === 'properties' ? (selNode ? 'BPMN node settings' : (selectedEdge ? 'Sequence flow settings' : 'Process properties')) : 'Process variables'),
              h('div', { className: 'mf-rf-sidepanel__subtitle' }, rightTab === 'properties' ? (selNode ? 'Edit the selected BPMN node and its executable behavior.' : (selectedEdge ? 'Review the selected sequence flow and delete it if needed.' : 'Select a BPMN node or sequence flow to edit its settings.')) : 'Manage reusable process variables for this BPMN workflow.')
            ),
            h('button', { type: 'button', className: 'mf-rf-sidepanel__collapse', title: 'Collapse workflow panel', onPointerDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onMouseDown: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); }, onClick: function (e: any) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); if (onToggle) onToggle(false); } },
              h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
                h('path', { d: 'M15 3v18' })
              )
            )
          ),
          h('div', Object.assign({ className: 'mf-rf-right-panel nodrag nopan nowheel' }, panelGuards),
            h('div', { className: 'mf-rf-right-tabs' },
              h('button', {
                type: 'button',
                className: 'mf-rf-right-tab nodrag nopan nowheel' + (rightTab === 'properties' ? ' mf-rf-right-tab--active' : ''),
                onPointerUp: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); setRightTab('properties'); }, onClick: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); setRightTab('properties'); }
              },
                h('span', { className: 'mf-rf-right-tab__icon', style: rightMeta ? { background: rightMeta.accent } : {} }, rightMeta ? rightMeta.icon : '🔧'),
                h('span', { className: 'mf-rf-right-tab__label' }, 'BPMN')
              ),
              h('button', {
                type: 'button',
                className: 'mf-rf-right-tab nodrag nopan nowheel' + (rightTab === 'variables' ? ' mf-rf-right-tab--active' : ''),
                onPointerUp: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); setRightTab('variables'); }, onClick: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); setRightTab('variables'); }
              },
                h('span', { className: 'mf-rf-right-tab__icon', style: { background: '#8b5cf6' } }, '📊'),
                h('span', { className: 'mf-rf-right-tab__label' }, 'Variables'),
                variables.length > 0 && h('span', { className: 'mf-rf-right-tab__badge' }, variables.length)
              )
            ),
            h('div', Object.assign({ className: 'mf-rf-right-body nodrag nopan nowheel' }, panelGuards),
              rightTab === 'properties'
                ? (selNode
                    ? h(ConfigPanel, { node: selNode, onSave: onConfigSave, onDel: onConfigDel, onSetStart: onSetStart, onDraftChange: props.onDraftChange, allNodes: props.allNodes })
                    : (selectedEdge
                        ? h(EdgeSelectionPanel, { edge: selectedEdge, onDelete: onDeleteSelected })
                        : h('div', { className: 'mf-rf-empty-state' },
                            h('div', { className: 'mf-rf-empty-state__emoji' }, '🧭'),
                            h('div', { className: 'mf-rf-empty-state__title' }, 'Nothing selected'),
                            h('div', { className: 'mf-rf-empty-state__body' }, 'Select a BPMN node to edit it, or click a sequence flow to inspect or remove that connection.')
                          )
                      )
                  )
                : h(VariablesPanel, { variables: variables, setVariables: function (next: any) { setVariables(next); } })
            )
          )
        )
      );
    }

    function EdgeSelectionPanel(props: any): any {
      var edge = props.edge;
      var onDelete = props.onDelete;
      if (!edge) {
        return h('div', { className: 'mf-rf-empty-state' },
          h('div', { className: 'mf-rf-empty-state__emoji' }, '↔️'),
          h('div', { className: 'mf-rf-empty-state__title' }, 'Select a BPMN node or sequence flow'),
          h('div', { className: 'mf-rf-empty-state__body' }, 'Click a BPMN node to edit its task settings, or click a sequence flow to inspect or remove it.')
        );
      }
      return h('div', { className: 'mf-rf-config-wrap' },
        h('div', { className: 'mf-rf-config-card' },
          h('div', { className: 'mf-rf-card-head' },
            h('div', { className: 'mf-rf-card-head__title' }, 'Selected sequence flow'),
            h('div', { className: 'mf-rf-card-head__subtitle' }, 'Review this BPMN transition or remove it from the process.')
          ),
          h('div', { className: 'mf-rf-kv-grid' },
            h('div', { className: 'mf-rf-kv' }, h('div', { className: 'mf-rf-kv__label' }, 'Link id'), h('div', { className: 'mf-rf-kv__value' }, String(edge.id || ''))),
            h('div', { className: 'mf-rf-kv' }, h('div', { className: 'mf-rf-kv__label' }, 'From'), h('div', { className: 'mf-rf-kv__value' }, String(edge.source || ''))),
            h('div', { className: 'mf-rf-kv' }, h('div', { className: 'mf-rf-kv__label' }, 'To'), h('div', { className: 'mf-rf-kv__value' }, String(edge.target || ''))),
            h('div', { className: 'mf-rf-kv' }, h('div', { className: 'mf-rf-kv__label' }, 'Handle'), h('div', { className: 'mf-rf-kv__value' }, String(edge.sourceHandle || 'default'))),
            h('div', { className: 'mf-rf-kv mf-rf-kv--full' }, h('div', { className: 'mf-rf-kv__label' }, 'Label'), h('div', { className: 'mf-rf-kv__value' }, String(edge.label || '—')))
          ),
          h('div', { className: 'mf-rf-card-actions' },
            h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger', onPointerDown: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); }, onMouseDown: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); }, onClick: function (e: any) { if (e && e.stopPropagation) e.stopPropagation(); if (onDelete) onDelete(); } }, 'Delete link'),
            h('div', { className: 'mf-rf-card-actions__hint' }, 'Tip: you can also press Delete or Backspace after selecting a link.')
          )
        )
      );
    }

    function Toolbar(props: any): any {
      return h('div', { className: 'mf-rf-toolbar' },
        h('div', { className: 'mf-rf-toolbar__left' },
          h('button', buttonProps({ className: 'mf-rf-tb-back-btn', onClick: props.onClose, title: 'Return to App Builder' }),
            h('svg', { width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 },
              h('path', { d:'M19 12H5', strokeLinecap:'round' }),
              h('path', { d:'M12 19l-7-7 7-7', strokeLinecap:'round', strokeLinejoin:'round' })
            ),
            h('span', null, 'Return to App Builder')
          ),
          h('div', { className: 'mf-rf-toolbar__logo' },
            h('svg', { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 },
              h('path', { d:'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', strokeLinecap:'round' })
            )
          ),
          h('div', { className: 'mf-rf-toolbar__name-col' },
            h('input', { className: 'mf-rf-toolbar__name-input', value: props.workflowName || '',
              onChange: function (e: any) { props.onWorkflowNameChange(e.target.value); },
              placeholder: 'Untitled BPMN workflow' }),
            h('div', { className: 'mf-rf-toolbar__meta' }, 'Executable BPMN 2.0 subset editor')
          )
        ),
        h('div', { className: 'mf-rf-toolbar__right' },
          h('button', buttonProps({ className: 'mf-rf-tb-btn mf-rf-tb-btn--accent', onClick: props.onToggleSample }),
            h('svg', { width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 },
              h('path', { d:'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' }),
              h('path', { d:'M14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2' })
            ), ' Samples'
          ),
          h('button', buttonProps({ className: 'mf-rf-tb-btn', onClick: props.onTestRun, title: 'Run a workflow test with the current graph' }),
            h('svg', { width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 },
              h('polygon', { points:'5 3 19 12 5 21 5 3' })
            ), ' Test'
          ),
          h('button', { className: 'mf-rf-tb-btn', onClick: props.onSaveDraft,
            title: 'Save as draft (no activation)', disabled: props.saveStatus === 'saving' || props.saveStatus === 'applying' },
            h('svg', { width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 },
              h('path', { d:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z' }),
              h('polyline', { points:'17 21 17 13 7 13 7 21' }),
              h('polyline', { points:'7 3 7 8 15 8' })
            ), props.saveStatus === 'saving' ? ' Saving…' : ' Save Draft'
          ),
          h('button', { className: 'mf-rf-tb-btn', onClick: props.onValidate,
            title: 'Validate current workflow without activating it', disabled: props.saveStatus === 'saving' || props.saveStatus === 'applying' },
            h('svg', { width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 },
              h('path', { d:'M9 11l3 3L22 4' }),
              h('path', { d:'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' })
            ), ' Validate BPMN'
          ),
          h('button', { className: 'mf-rf-tb-btn mf-rf-tb-btn--primary', onClick: props.onApply,
            title: 'Validate and activate for runtime', disabled: props.saveStatus === 'saving' || props.saveStatus === 'applying' },
            h('svg', { width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 },
              h('polygon', { points:'5 3 19 12 5 21 5 3' })
            ), props.saveStatus === 'applying' ? ' Applying…' : ' Apply BPMN'
          )
        )
      );
    }



    function normalizeKeyToken(v: string): string {
      return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function pickFieldByHints(schema2: FormSchema, hints: string[], fallbackIndex?: number): FormSchemaField | null {
      var fields = (schema2 && schema2.fields) || [];
      if (!fields.length) return null;
      var i: number;
      for (i = 0; i < hints.length; i++) {
        var hint = normalizeKeyToken(hints[i] || '');
        if (!hint) continue;
        var exact = fields.find(function (f) {
          var key = normalizeKeyToken(f.key || '');
          var label = normalizeKeyToken(f.label || '');
          return key === hint || label === hint;
        });
        if (exact) return exact;
        var partial = fields.find(function (f) {
          var key = normalizeKeyToken(f.key || '');
          var label = normalizeKeyToken(f.label || '');
          return key.indexOf(hint) >= 0 || label.indexOf(hint) >= 0 || hint.indexOf(key) >= 0 || hint.indexOf(label) >= 0;
        });
        if (partial) return partial;
      }
      if (typeof fallbackIndex === 'number' && fields[fallbackIndex]) return fields[fallbackIndex];
      return fields[0] || null;
    }

    function pickChoiceField(schema2: FormSchema): FormSchemaField | null {
      var fields = (schema2 && schema2.fields) || [];
      var preferred = fields.find(function (f) {
        var t = String(f.type || '').toLowerCase();
        return t === 'dropdown' || t === 'select' || t === 'radio' || t === 'checkbox' || t === 'singlechoice' || t === 'multiplechoice';
      });
      return preferred || pickFieldByHints(schema2, ['status', 'type', 'category', 'newsletter', 'consent'], 0);
    }

    function pickEmailField(schema2: FormSchema): FormSchemaField | null {
      return pickFieldByHints(schema2, ['email', 'email address', 'work email'], 0);
    }

    function pickNameField(schema2: FormSchema): FormSchemaField | null {
      return pickFieldByHints(schema2, ['full name', 'first name', 'name', 'contact name'], 0);
    }

    function pickPhoneField(schema2: FormSchema): FormSchemaField | null {
      return pickFieldByHints(schema2, ['phone', 'mobile', 'telephone'], 1);
    }

    function autoMapWorkflowToSchema(def: any, schema2: FormSchema): any {
      var mapped = deepClone(def || {});
      var fields = (schema2 && schema2.fields) || [];
      if (!fields.length) return mapped;
      var used: AnyObj = {};
      function reserve(key: string): void { if (key) used[key] = true; }
      function chooseFieldForNode(node: any, index: number): FormSchemaField | null {
        var cfg = (node && node.config) || {};
        var hints = [cfg.fieldKey, node && node.label, cfg.fieldLabel, cfg.placeholder, cfg.fieldName];
        var chosen = pickFieldByHints(schema2, hints as any, index);
        if (chosen && !used[chosen.key]) { reserve(chosen.key); return chosen; }
        if (chosen) return chosen;
        var free = fields.find(function (f) { return !used[f.key]; });
        if (free) { reserve(free.key); return free; }
        return fields[index] || fields[0] || null;
      }
      (mapped.nodes || []).forEach(function (node: any, index: number) {
        if (!node || !node.config) node.config = {};
        if (node.type === 'FormField') {
          var chosen = chooseFieldForNode(node, index);
          if (chosen) {
            node.label = chosen.label || chosen.key;
            node.config.fieldKey = chosen.key;
            node.config.pageIndex = typeof chosen.pageIndex === 'number' ? chosen.pageIndex : 0;
            node.config.isPageNode = false;
          }
        }
        if (node.type === 'Switch') {
        var switchChosen = pickChoiceField(schema2) || fields[0] || null;
        if (switchChosen) {
          node.label = 'Switch';
          node.config = normalizeSwitchNodeConfig(Object.assign({}, node.config || {}, { fieldKey: switchChosen.key }), schema2);
        }
      }
      if (node.type === 'Condition') {
          var cc = normalizeConditionConfig(node.config || {});
          (cc.conditionGroups || []).forEach(function (group: any) {
            (group.rules || []).forEach(function (rule: any) {
              var picked = pickFieldByHints(schema2, [rule.fieldKey, node.label, 'status', 'type', 'category', 'consent'], 0) || pickChoiceField(schema2) || fields[0];
              if (picked) rule.fieldKey = picked.key;
            });
          });
          node.config = cc;
        }
      });
      return mapped;
    }

    function buildSampleWorkflowPreset(kind: string, schema2: FormSchema): any {
      var allFields = (schema2 && schema2.fields) || [];
      var first = allFields[0] || { key: 'field_1', label: 'Field 1', pageIndex: 0 };
      var second = allFields[1] || first;
      var emailField = pickEmailField(schema2) || first;
      var nameField = pickNameField(schema2) || first;
      var phoneField = pickPhoneField(schema2) || second || first;
      var choiceField = pickChoiceField(schema2) || second || first;
      var vars = [
        { key: 'score', type: 'Number', defaultValue: '0', description: 'Lead/application score' },
        { key: 'route', type: 'String', defaultValue: '', description: 'Selected branch route' }
      ];
      var preset: any;
      if (kind === 'lead-routing') {
        preset = {
          version: '1.0.0',
          startNodeId: 'node-a',
          variables: vars,
          nodes: [
            { id: 'node-a', type: 'FormField', label: nameField.label || 'Name', zoneType: 'Navigation', position: { x: 70, y: 120 }, config: { fieldKey: nameField.key, isPageNode: false } },
            { id: 'node-b', type: 'FormField', label: emailField.label || 'Email', zoneType: 'Navigation', position: { x: 70, y: 260 }, config: { fieldKey: emailField.key, isPageNode: false } },
            { id: 'node-c', type: 'Condition', label: 'Qualified Lead?', zoneType: 'Navigation', position: { x: 70, y: 420 }, config: { conditionGroups: [{ logic: 'and', rules: [{ fieldKey: choiceField.key, operator: 'isNotEmpty', value: '', valueType: 'literal' }] }], trueLabel: 'Qualified', falseLabel: 'Review' } },
            { id: 'node-d', type: 'Calculate', label: 'Score +25', zoneType: 'Action', position: { x: 500, y: 320 }, config: { targetVariable: 'score', operand1: 'score', operator: 'add', operand2: '25', roundToInt: true } },
            { id: 'node-e', type: 'Webhook', label: 'Push to CRM', zoneType: 'Action', position: { x: 820, y: 320 }, config: { url: 'https://api.example.com/leads', method: 'POST', headers: [], bodyTemplate: '{"name":"{{' + nameField.key + '}}","email":"{{' + emailField.key + '}}"}', responseVariableKey: 'route', timeoutSeconds: 30 } },
            { id: 'node-f', type: 'SendEmail', label: 'Notify Sales', zoneType: 'Action', position: { x: 1140, y: 320 }, config: { to: 'sales@example.com', cc: '', subject: 'New qualified lead', body: buildSampleEmailHtml('Qualified lead ready for follow-up', 'A new lead met the routing threshold.', '<p><strong>{{' + nameField.key + '}}</strong> is ready for a sales follow-up.</p><p>Email captured: {{' + emailField.key + '}}</p>', 'Open lead'), replyTo: '' } },
            { id: 'node-g', type: 'SendEmail', label: 'Manual Review Queue', zoneType: 'Action', position: { x: 500, y: 540 }, config: { to: 'ops@example.com', cc: '', subject: 'Needs manual review', body: buildSampleEmailHtml('Manual review requested', 'A submission needs an operations review before routing.', '<p>Please review the submission for <strong>{{' + nameField.key + '}}</strong>.</p><p>This branch was selected because the routing condition did not qualify automatically.</p>', 'Review submission'), replyTo: '' } },
            { id: 'node-h', type: 'End', label: 'End', zoneType: 'Action', position: { x: 1440, y: 400 }, config: { endType: 'Success', message: 'Workflow completed', redirectUrl: '' } }
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'node-a', targetNodeId: 'node-b', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e2', sourceNodeId: 'node-b', targetNodeId: 'node-c', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e3', sourceNodeId: 'node-c', targetNodeId: 'node-d', sourceHandle: 'true', targetHandle: 'in', label: 'Qualified' },
            { id: 'e4', sourceNodeId: 'node-c', targetNodeId: 'node-g', sourceHandle: 'false', targetHandle: 'in', label: 'Review' },
            { id: 'e5', sourceNodeId: 'node-d', targetNodeId: 'node-e', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e6', sourceNodeId: 'node-e', targetNodeId: 'node-f', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e7', sourceNodeId: 'node-f', targetNodeId: 'node-h', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e8', sourceNodeId: 'node-g', targetNodeId: 'node-h', sourceHandle: 'default', targetHandle: 'in', label: '' }
          ]
        };
      } else if (kind === 'approval-branching') {
        preset = {
          version: '1.0.0',
          startNodeId: 'node-a',
          variables: vars,
          nodes: [
            { id: 'node-a', type: 'FormField', label: nameField.label || 'Applicant', zoneType: 'Navigation', position: { x: 70, y: 120 }, config: { fieldKey: nameField.key, isPageNode: false } },
            { id: 'node-b', type: 'FormField', label: phoneField.label || 'Phone', zoneType: 'Navigation', position: { x: 70, y: 260 }, config: { fieldKey: phoneField.key, isPageNode: false } },
            { id: 'node-c', type: 'Approval', label: 'Manager Review', zoneType: 'Action', position: { x: 70, y: 420 }, config: { candidateRoles: ['Reviewer'], candidateUsers: [], allowClaim: true, allowForward: true, allowReassign: true, commentRequiredOnReject: true, dueInHours: 24, pendingSubmissionStatus: 'pending_review', approvedSubmissionStatus: 'approved', rejectedSubmissionStatus: 'rejected' } },
            { id: 'node-d', type: 'SendEmail', label: 'Approval Notice', zoneType: 'Action', position: { x: 520, y: 320 }, config: { to: '{{' + emailField.key + '}}', cc: '', subject: 'Application approved', body: buildSampleEmailHtml('Your submission was approved', 'Good news — your application moved to the approved branch.', '<p>Hello <strong>{{' + nameField.key + '}}</strong>,</p><p>Your submission has been approved. Our team will follow up with the next steps shortly.</p>', 'View next steps'), replyTo: '' } },
            { id: 'node-e', type: 'Webhook', label: 'Create Case', zoneType: 'Action', position: { x: 860, y: 320 }, config: { url: 'https://api.example.com/cases', method: 'POST', headers: [], bodyTemplate: '{"name":"{{' + nameField.key + '}}","phone":"{{' + phoneField.key + '}}"}', responseVariableKey: 'route', timeoutSeconds: 30 } },
            { id: 'node-f', type: 'SendEmail', label: 'Rejection Notice', zoneType: 'Action', position: { x: 520, y: 540 }, config: { to: '{{' + emailField.key + '}}', cc: '', subject: 'Application update', body: buildSampleEmailHtml('We need one more step from you', 'Your submission is still in progress.', '<p>Hello <strong>{{' + nameField.key + '}}</strong>,</p><p>We need a little more information before we can approve your submission. Please reply with any missing details.</p>', 'Update submission'), replyTo: '' } },
            { id: 'node-g', type: 'End', label: 'Approved', zoneType: 'Action', position: { x: 1200, y: 320 }, config: { endType: 'Success', message: 'Approved branch finished', redirectUrl: '' } },
            { id: 'node-h', type: 'End', label: 'Rejected', zoneType: 'Action', position: { x: 860, y: 540 }, config: { endType: 'Failure', message: 'Rejected branch finished', redirectUrl: '' } }
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'node-a', targetNodeId: 'node-b', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e2', sourceNodeId: 'node-b', targetNodeId: 'node-c', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e3', sourceNodeId: 'node-c', targetNodeId: 'node-d', sourceHandle: 'approved', targetHandle: 'in', label: 'Approved' },
            { id: 'e4', sourceNodeId: 'node-c', targetNodeId: 'node-f', sourceHandle: 'rejected', targetHandle: 'in', label: 'Rejected' },
            { id: 'e5', sourceNodeId: 'node-d', targetNodeId: 'node-e', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e6', sourceNodeId: 'node-e', targetNodeId: 'node-g', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e7', sourceNodeId: 'node-f', targetNodeId: 'node-h', sourceHandle: 'default', targetHandle: 'in', label: '' }
          ]
        };
      } else {
        preset = {
          version: '1.0.0',
          startNodeId: 'node-a',
          variables: vars,
          nodes: [
            { id: 'node-a', type: 'FormField', label: nameField.label || 'Name', zoneType: 'Navigation', position: { x: 70, y: 120 }, config: { fieldKey: nameField.key, isPageNode: false } },
            { id: 'node-b', type: 'FormField', label: emailField.label || 'Email', zoneType: 'Navigation', position: { x: 70, y: 260 }, config: { fieldKey: emailField.key, isPageNode: false } },
            { id: 'node-c', type: 'Condition', label: 'Has Response Value?', zoneType: 'Navigation', position: { x: 70, y: 420 }, config: { conditionGroups: [{ logic: 'and', rules: [{ fieldKey: choiceField.key, operator: 'isNotEmpty', value: '', valueType: 'literal' }] }], trueLabel: 'Yes', falseLabel: 'No' } },
            { id: 'node-d', type: 'Webhook', label: 'Send to API', zoneType: 'Action', position: { x: 520, y: 320 }, config: { url: 'https://api.example.com/forms', method: 'POST', headers: [], bodyTemplate: '{"email":"{{' + emailField.key + '}}"}', responseVariableKey: 'route', timeoutSeconds: 30 } },
            { id: 'node-e', type: 'SendEmail', label: 'Confirmation Email', zoneType: 'Action', position: { x: 860, y: 320 }, config: { to: '{{' + emailField.key + '}}', cc: '', subject: 'Thanks for your submission', body: buildSampleEmailHtml('We received your form', 'Thanks for submitting your form.', '<p>Hi <strong>{{' + nameField.key + '}}</strong>,</p><p>We received your form and the workflow has started successfully. We will notify you again if any follow-up is required.</p>', 'View submission'), replyTo: '' } },
            { id: 'node-f', type: 'End', label: 'End', zoneType: 'Action', position: { x: 1200, y: 400 }, config: { endType: 'Success', message: 'Workflow completed', redirectUrl: '' } },
            { id: 'node-g', type: 'End', label: 'Skip', zoneType: 'Action', position: { x: 520, y: 560 }, config: { endType: 'Success', message: 'Skipped optional branch', redirectUrl: '' } }
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'node-a', targetNodeId: 'node-b', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e2', sourceNodeId: 'node-b', targetNodeId: 'node-c', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e3', sourceNodeId: 'node-c', targetNodeId: 'node-d', sourceHandle: 'true', targetHandle: 'in', label: 'Yes' },
            { id: 'e4', sourceNodeId: 'node-c', targetNodeId: 'node-g', sourceHandle: 'false', targetHandle: 'in', label: 'No' },
            { id: 'e5', sourceNodeId: 'node-d', targetNodeId: 'node-e', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e6', sourceNodeId: 'node-e', targetNodeId: 'node-f', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e7', sourceNodeId: 'node-g', targetNodeId: 'node-f', sourceHandle: 'default', targetHandle: 'in', label: '' }
          ]
        };
      }
      return autoMapWorkflowToSchema(preset, schema2);
    }

    var SAMPLE_WORKFLOW_JSON = JSON.stringify({
      "version": "1.0.0",
      "startNodeId": "node-start",
      "variables": [
        { "key": "score", "type": "Number", "defaultValue": "0", "description": "Calculated score" }
      ],
      "nodes": [
        { "id": "node-start",   "type": "FormField", "label": "First Name",      "zoneType": "Navigation", "position": { "x": 80,  "y": 120 }, "config": { "fieldKey": "first_name", "isPageNode": false } },
        { "id": "node-email",   "type": "FormField", "label": "Email Address",   "zoneType": "Navigation", "position": { "x": 80,  "y": 260 }, "config": { "fieldKey": "email",      "isPageNode": false } },
        { "id": "node-cond1",   "type": "Condition", "label": "Has Newsletter?", "zoneType": "Navigation", "position": { "x": 80,  "y": 400 }, "config": { "conditionGroups": [{ "logic": "and", "rules": [{ "fieldKey": "newsletter", "operator": "equals", "value": "yes", "valueType": "literal" }] }], "trueLabel": "Yes", "falseLabel": "No" } },
        { "id": "node-email1",  "type": "SendEmail", "label": "Welcome Email",   "zoneType": "Action",     "position": { "x": 620, "y": 320 }, "config": { "to": "{{email}}", "subject": "Welcome {{first_name}}!", "body": "<p>Thank you for subscribing to our newsletter.</p><p>We will send thoughtful updates to <strong>{{email}}</strong>.</p>", "fromName": "MegaForm" } },
        { "id": "node-webhook", "type": "Webhook",   "label": "CRM Sync",        "zoneType": "Action",     "position": { "x": 620, "y": 460 }, "config": { "url": "https://crm.example.com/api/contacts", "method": "POST", "headers": "{\"Authorization\":\"Bearer {{api_key}}\"}", "body": "{\"name\":\"{{first_name}}\",\"email\":\"{{email}}\"}" } },
        { "id": "node-calc",    "type": "Calculate", "label": "Score += 10",     "zoneType": "Action",     "position": { "x": 620, "y": 600 }, "config": { "targetVariable": "score", "expression": "score + 10" } },
        { "id": "node-end-ok",  "type": "End",       "label": "End (Success)",   "zoneType": "Action",     "position": { "x": 980, "y": 380 }, "config": { "endType": "Success" } },
        { "id": "node-end-skip","type": "End",       "label": "End (Skip)",      "zoneType": "Action",     "position": { "x": 980, "y": 580 }, "config": { "endType": "Success" } }
      ],
      "edges": [
        { "id": "e1", "sourceNodeId": "node-start",   "targetNodeId": "node-email",   "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e2", "sourceNodeId": "node-email",   "targetNodeId": "node-cond1",   "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e3", "sourceNodeId": "node-cond1",   "targetNodeId": "node-email1",  "sourceHandle": "true",    "targetHandle": "in", "label": "Yes" },
        { "id": "e4", "sourceNodeId": "node-cond1",   "targetNodeId": "node-end-skip","sourceHandle": "false",   "targetHandle": "in", "label": "No" },
        { "id": "e5", "sourceNodeId": "node-email1",  "targetNodeId": "node-webhook", "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e6", "sourceNodeId": "node-webhook", "targetNodeId": "node-calc",    "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e7", "sourceNodeId": "node-calc",    "targetNodeId": "node-end-ok",  "sourceHandle": "default", "targetHandle": "in", "label": "" }
      ]
    }, null, 2);

    function SampleJsonPanel(props: any): any {
      if (!props.visible) return null;
      // useState called as R.useState() directly
      var statePreset = R.useState('smart-default');
      var presetKey = statePreset[0], setPresetKey = statePreset[1];
      var stateJson = R.useState(JSON.stringify(buildSampleWorkflowPreset('smart-default', schema), null, 2));
      var jsonText = stateJson[0], setJsonText = stateJson[1];
      var stateErr = R.useState('');
      var err = stateErr[0], setErr = stateErr[1];
      var presetOptions = [
        { key: 'smart-default', label: 'Smart starter — API + email + branch' },
        { key: 'lead-routing', label: 'Lead routing — qualify / manual review' },
        { key: 'approval-branching', label: 'Approval flow — approve / reject' }
      ];
      var presetMeta = SAMPLE_PRESET_META[presetKey] || SAMPLE_PRESET_META['smart-default'];

      function applyPreset(nextKey: string): void {
        setPresetKey(nextKey);
        setJsonText(JSON.stringify(buildSampleWorkflowPreset(nextKey, schema), null, 2));
        setErr('');
      }

      function onLoad(): void {
        try {
          var parsed = JSON.parse(jsonText);
          props.onLoadJson(ensureWorkflowReadyToSave(autoMapWorkflowToSchema(parsed, schema), schema));
          setErr('');
          props.onClose();
        } catch (e: any) {
          setErr('JSON Error: ' + e.message);
        }
      }

      return h('div', {
        style: {
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font, sans-serif)'
        },
        onClick: function(e: any){ if (e.target === e.currentTarget) props.onClose(); }
      },
        h('div', { style: {
          background: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,.22)',
          width: 680, maxWidth: '96vw', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }},
        // Modal header
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 } },
          h('div', null,
            h('div', { style: { fontWeight: 700, fontSize: 14, color: '#0f172a' } }, '{ } Sample BPMN JSON'),
            h('div', { style: { fontSize: 11, color: '#64748b', marginTop: 2 } }, 'Auto-maps BPMN nodes and conditions to the current form schema.')
          ),
          h('button', buttonProps({ onClick: props.onClose, style: { border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1, padding: '4px 6px', borderRadius: 6 } }), '✕')
        ),
        // Scrollable body
        h('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, marginBottom: 12, alignItems: 'start' } },
          h('div', null,
            h('label', { style: { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 } }, 'Sample preset'),
            h('select', {
              value: presetKey,
              onChange: function (e: any) { applyPreset(e.target.value); },
              style: { width: '100%', boxSizing: 'border-box', border: '1px solid #dbe2ea', borderRadius: 8, padding: '9px 10px', fontSize: 12, background: '#fff' }
            }, presetOptions.map(function (opt: any) { return h('option', { key: opt.key, value: opt.key }, opt.label); }))
          ),
          h('div', { style: { fontSize: 11, color: '#64748b', lineHeight: 1.6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 } },
            h('div', { style: { fontWeight: 700, color: '#334155', marginBottom: 4 } }, presetMeta.title),
            h('div', { style: { marginBottom: 6, color: '#475569' } }, presetMeta.summary),
            (presetMeta.details || []).map(function (line: string, idx: number) { return h('div', { key: idx }, '• ', line); })
          )
        ),
        h('textarea', {
          value: jsonText,
          onChange: function (e: any) { setJsonText(e.target.value); setErr(''); },
          style: {
            width: '100%', boxSizing: 'border-box', height: 240, fontFamily: 'monospace',
            fontSize: 11, border: '1px solid #dbe2ea', borderRadius: 8, padding: 10,
            background: '#f8fafc', color: '#1e293b', resize: 'vertical'
          }
        }),
        err && h('div', { style: { color: '#ef4444', fontSize: 11, margin: '6px 0' } }, err)
        ), // end scrollable body
        // Footer - always visible, never covered
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 } },
          h('button', {
            onClick: onLoad,
            style: { padding: '9px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }
          }, '▶ Load into Canvas'),
          h('button', {
            onClick: function () { applyPreset(presetKey); },
            style: { padding: '9px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer' }
          }, '↺ Refresh mapping'),
          h('button', {
            onClick: function () { applyPreset('smart-default'); },
            style: { padding: '9px 14px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer' }
          }, 'Reset sample'),
          h('button', {
            onClick: props.onClose,
            style: { marginLeft: 'auto', padding: '9px 14px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer' }
          }, 'Cancel')
        )
      ));
    }

    function swallowPanelEvent(e: any): void {
      swallowWorkflowPanelEvent(e);
    }

    function WorkflowApp(): any {
      // useState called as R.useState() directly
      // useCallback called as R.useCallback() directly
      // useEffect called as R.useEffect() directly
      // useRef called as R.useRef() directly
      // useMemo called as R.useMemo() directly
      var initial = buildInitialGraph(workflowDef, schema);
      var initialFocusNode =
        (initial.nodes || []).find(function (n: any) { return n && n.data && n.data.nodeType === 'Approval'; }) ||
        (initial.nodes || []).find(function (n: any) { return n && n.id === initial.startId; }) ||
        ((initial.nodes || []).length ? initial.nodes[0] : null);
      var rfInstance = R.useRef(null);
      var nodesRef = R.useRef([]);
      var stateNodes = R.useState(initial.nodes);
      var nodes = stateNodes[0], setNodes = stateNodes[1];
      nodesRef.current = nodes;
      var stateEdges = R.useState(initial.edges);
      var edges = stateEdges[0], setEdges = stateEdges[1];
      var stateStartId = R.useState(initial.startId);
      var startId = stateStartId[0], setStartId = stateStartId[1];
      var stateSelNode = R.useState(initialFocusNode as any);
      var selNode = stateSelNode[0], setSelNode = stateSelNode[1];
      var stateSelEdgeId = R.useState(null as string | null);
      var selEdgeId = stateSelEdgeId[0], setSelEdgeId = stateSelEdgeId[1];
      var stateDirty = R.useState(false);
      var dirty = stateDirty[0], setDirty = stateDirty[1];
      var stateToast = R.useState(null as any);
      var toast = stateToast[0], setToast = stateToast[1];
      var stateTestResult = R.useState(null as any);
      var testResult = stateTestResult[0], setTestResult = stateTestResult[1];
      var stateTraced = R.useState([] as string[]);
      var tracedIds = stateTraced[0], setTracedIds = stateTraced[1];
      var stateVariables = R.useState((workflowDef && workflowDef.variables) ? workflowDef.variables : []);
      var variables = stateVariables[0], setVariables = stateVariables[1];
      var stateWorkflowName = R.useState(inferWorkflowName(workflowDef, schema));
      var workflowName = stateWorkflowName[0], setWorkflowName = stateWorkflowName[1];
      var stateWorkflowDescription = R.useState(inferWorkflowDescription(workflowDef, schema));
      var workflowDescription = stateWorkflowDescription[0], setWorkflowDescription = stateWorkflowDescription[1];

      var stateLeftCollapsed = R.useState(false);
      var leftCollapsed = stateLeftCollapsed[0], setLeftCollapsed = stateLeftCollapsed[1];
      var stateRightOpen = R.useState(!!initialFocusNode);
      var rightOpen = stateRightOpen[0], setRightOpen = stateRightOpen[1];
      var stateRightWidth = R.useState(savedPanelWidth);
      var rightWidth = stateRightWidth[0], setRightWidth = stateRightWidth[1];

      // ── Issues panel state ────────────────────────────────────────────────
      var stateIssues = R.useState([] as any[]);
      var issues = stateIssues[0], setIssues = stateIssues[1];
      var stateIssueAction = R.useState('');
      var issueAction = stateIssueAction[0], setIssueAction = stateIssueAction[1];
      var stateIssueTime = R.useState('');
      var issueTime = stateIssueTime[0], setIssueTime = stateIssueTime[1];
      var stateIssuesPanelOpen = R.useState(false);
      var issuesPanelOpen = stateIssuesPanelOpen[0], setIssuesPanelOpen = stateIssuesPanelOpen[1];

      // ── Lifecycle metadata from server ────────────────────────────────────
      var stateAppliedVersion = R.useState('');
      var appliedVersion = stateAppliedVersion[0], setAppliedVersion = stateAppliedVersion[1];
      var stateAppliedAt = R.useState('');
      var appliedAt = stateAppliedAt[0], setAppliedAt = stateAppliedAt[1];
      var stateSaveStatus = R.useState(''); // 'saving' | 'saved' | 'error' | 'applying' | 'applied'
      var saveStatus = stateSaveStatus[0], setSaveStatus = stateSaveStatus[1];
      var selectedNodeDraftRef = R.useRef(null as any);

      R.useEffect(function () {
        setNodes(function (ns: any[]) {
          return ns.map(function (n: any) {
            return n.data.isStart !== (n.id === startId) ? Object.assign({}, n, { data: Object.assign({}, n.data, { isStart: n.id === startId }) }) : n;
          });
        });
      }, [startId]);

      R.useEffect(function () { W._state.dirty = dirty; }, [dirty]);
      R.useEffect(function () { W._state.workflowVariables = (variables || []).slice ? (variables || []).slice(0) : (variables || []); }, [variables]);

      var stateRightTab = R.useState('properties' as 'properties' | 'variables');
      var rightTab = stateRightTab[0], setRightTab = stateRightTab[1];

      // Auto-switch to Properties tab when a node is clicked
      var prevSelNodeId = R.useRef(null as string | null);
      R.useEffect(function () {
        var newId = selNode ? selNode.id : null;
        if (newId && newId !== prevSelNodeId.current) {
          setRightTab('properties');
        }
        prevSelNodeId.current = newId;
      }, [selNode]);

      R.useEffect(function () {
        if (selNode) setRightOpen(true);
        else selectedNodeDraftRef.current = null;
      }, [selNode]);

      function startPanelResize(ev: any): void {
        if (ev && ev.preventDefault) ev.preventDefault();
        var startX = ev && ev.clientX ? ev.clientX : 0;
        var startWidth = rightWidth;
        function move(mev: any): void {
          var nextWidth = startWidth + (startX - ((mev && mev.clientX) || 0));
          nextWidth = Math.max(360, Math.min(620, nextWidth));
          setRightWidth(nextWidth);
        }
        function up(): void {
          try { window.localStorage.setItem('mf.workflow.panelWidth', String(rightWidth)); } catch (_storageErr2) { }
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }

      var nodesWithHandlers = R.useMemo(function () {
        return nodes.map(function (n: any) {
          return Object.assign({}, n, {
            data: Object.assign({}, n.data, {
              onSelect: function () {
                var found = findNodeById(nodesRef.current, n.id);
                if (found) {
                  setSelNode(found);
                  setRightTab('properties');
                  setRightOpen(true);
                }
              },
              traced: tracedIds.indexOf(n.id) >= 0
            })
          });
        });
      }, [nodes, tracedIds]);

      var onDrop = R.useCallback(function (e: any) {
        e.preventDefault();
        var type = e.dataTransfer.getData('application/mf-node-type');
        if (!type || !rfInstance.current) return;
        var meta = NODE_META[type] || NODE_META.FormField;
        var pos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        var id = 'n_' + Date.now().toString(36);
        var cfg = defaultConfigForType(type, schema);
        var newNode = { id: id, type: 'mfNode', position: pos, width: 180, height: 52, data: { nodeType: type, label: meta.label, zoneType: meta.zone === 'nav' ? 'Navigation' : 'Action', config: cfg, isStart: false } };
        setNodes(function (ns: any[]) { return ns.concat(newNode); });
        setDirty(true);
        setRightTab('properties');
        setRightOpen(true);
      }, []);

      function resolveEdgeColor(srcHandle: string): string {
        if (srcHandle === 'true') return '#22c55e';
        if (srcHandle === 'false') return '#ef4444';
        if (isApprovalHandle(srcHandle)) return getApprovalEdgeColor(srcHandle) || '#94a3b8';
        if (srcHandle === 'loop') return '#0ea5e9';
        if (srcHandle === 'done') return '#64748b';
        if (String(srcHandle || '').indexOf('case:') === 0) return '#7c3aed';
        return '#94a3b8';
      }

      function resolveEdgeLabel(srcNode: any, srcHandle: string): string {
        var handle = srcHandle || 'default';
        if (srcNode && srcNode.data.nodeType === 'Condition') {
          var cc = normalizeConditionConfig(srcNode.data.config || {});
          return handle === 'true' ? (cc.trueLabel || 'Yes') : handle === 'false' ? (cc.falseLabel || 'No') : '';
        }
        if (srcNode && srcNode.data.nodeType === 'Approval') {
          return getApprovalEdgeLabel(srcNode.data.config || {}, handle);
        }
        if (srcNode && srcNode.data.nodeType === 'Switch') {
          var sc = normalizeSwitchConfig(srcNode.data.config || {});
          if (String(handle).indexOf('case:') === 0) {
            var idx = parseInt(String(handle).split(':')[1], 10) || 0;
            var row = (sc.cases || [])[idx];
            return String((row && (row.label || row.value)) || ('Case ' + (idx + 1)));
          }
          return '';
        }
        if (srcNode && srcNode.data.nodeType === 'Loop') {
          var lc = normalizeLoopConfig(srcNode.data.config || {});
          return handle === 'loop' ? (lc.loopLabel || 'Loop') : handle === 'done' ? (lc.doneLabel || 'Done') : '';
        }
        if (isApprovalHandle(handle)) return getApprovalEdgeLabel(null, handle);
        return handle === 'true' ? 'Yes' : handle === 'false' ? 'No' : '';
      }

      function decorateEdge(base: any): any {
        var srcHandle = (base && base.sourceHandle) || 'default';
        var color = resolveEdgeColor(srcHandle);
        var markerEnd = (RF && RF.MarkerType) ? { type: RF.MarkerType.ArrowClosed, color: color, width: 18, height: 18 } : undefined;
        return Object.assign({}, base, {
          type: 'smoothstep',
          animated: true,
          reconnectable: true,
          selectable: true,
          interactionWidth: 28,
          markerEnd: markerEnd,
          style: Object.assign({ stroke: color, strokeWidth: 2.2 }, (base && base.style) || {}),
          labelStyle: Object.assign({ fill: color, fontWeight: 700, fontSize: 11 }, (base && base.labelStyle) || {}),
          labelBgStyle: Object.assign({ fill: 'white', opacity: 0.92 }, (base && base.labelBgStyle) || {})
        });
      }

      var onConnect = R.useCallback(function (params: any) {
        var srcHandle = params.sourceHandle || 'default';
        var srcNode = findNodeById(nodes, params.source);
        var edgeLabel = resolveEdgeLabel(srcNode, srcHandle);
        var newEdge = decorateEdge(Object.assign({}, params, { id: 'e_' + Date.now().toString(36), label: edgeLabel }));
        setEdges(function (es: any[]) { return es.concat(newEdge); });
        setDirty(true);
      }, [nodes]);

      var onReconnect = R.useCallback(function (oldEdge: any, newConnection: any) {
        setEdges(function (es: any[]) {
          return es.map(function (e: any) {
            if (e.id !== oldEdge.id) return e;
            var merged = Object.assign({}, e, newConnection, { id: e.id });
            var srcHandle = merged.sourceHandle || 'default';
            var srcNode = findNodeById(nodesRef.current, merged.source);
            var edgeLabel = resolveEdgeLabel(srcNode, srcHandle);
            merged.label = edgeLabel;
            return decorateEdge(merged);
          });
        });
        setDirty(true);
        setRightTab('properties');
        setRightOpen(true);
      }, []);

      var onNodesChange = R.useCallback(function (changes: any[]) { setNodes(function (ns: any[]) { return RF.applyNodeChanges(changes, ns); }); setDirty(true); }, []);
      var onEdgesChange = R.useCallback(function (changes: any[]) { setEdges(function (es: any[]) { return RF.applyEdgeChanges(changes, es).map(function (edge: any) { return decorateEdge(edge); }); }); setDirty(true); }, []);

      function readSelectedNodeConfigFromDom(nodeType: string, baseConfig: any): any {
        var next = deepClone(baseConfig || {});
        if (nodeType === 'SendEmail') {
          var emailTo = document.getElementById('mf-wf-email-to') as HTMLInputElement | null;
          var emailSubject = document.getElementById('mf-wf-email-subject') as HTMLInputElement | null;
          var emailBody = document.getElementById('mf-wf-email-body') as HTMLTextAreaElement | null;
          if (emailTo) next.to = emailTo.value || '';
          if (emailSubject) next.subject = emailSubject.value || '';
          if (emailBody) next.body = emailBody.value || '';
          return sanitizeNodeConfig(nodeType, next);
        }
        if (nodeType === 'Webhook') {
          var webhookUrl = document.getElementById('mf-webhook-url') as HTMLInputElement | null;
          var webhookBody = document.getElementById('mf-webhook-body') as HTMLTextAreaElement | null;
          if (webhookUrl) next.url = webhookUrl.value || '';
          if (webhookBody) next.bodyTemplate = webhookBody.value || '';
          return sanitizeNodeConfig(nodeType, next);
        }
        return sanitizeNodeConfig(nodeType, next);
      }

      function buildLatestWorkflowGraph(): any {
        var latestNodes = nodes;
        var latestEdges = edges;
        var draft = selectedNodeDraftRef.current;
        if (selNode) {
          var hasDraft = !!(draft && draft.nodeId === selNode.id);
          var draftConfigSource = hasDraft ? (draft.config || {}) : (selNode.data.config || {});
          var nextConfig = readSelectedNodeConfigFromDom(selNode.data.nodeType, draftConfigSource);
          var updates = {
            label: (hasDraft && typeof draft.label === 'string') ? draft.label : (selNode.data.label || ''),
            zoneType: (hasDraft && typeof draft.zoneType === 'string') ? draft.zoneType : (selNode.data.zoneType || 'Action'),
            isDisabled: hasDraft ? !!draft.isDisabled : !!selNode.data.isDisabled,
            config: nextConfig
          };
          latestNodes = nodes.map(function (n: any) {
            if (n.id !== selNode.id) return n;
            return Object.assign({}, n, { data: Object.assign({}, n.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
          });
          latestEdges = edges.map(function (e: any) {
            if (e.source !== selNode.id) return e;
            if (selNode.data.nodeType === 'Condition' || (updates.config && updates.config.conditionGroups)) {
              var cc = normalizeConditionConfig(updates.config || {});
              if (e.sourceHandle === 'true') return Object.assign({}, e, { label: cc.trueLabel || 'Yes' });
              if (e.sourceHandle === 'false') return Object.assign({}, e, { label: cc.falseLabel || 'No' });
            }
            if (selNode.data.nodeType === 'Approval' || isApprovalHandle(e.sourceHandle || '')) {
              return Object.assign({}, e, { label: getApprovalEdgeLabel(updates.config || {}, e.sourceHandle || 'default') });
            }
            return e;
          });
          setNodes(latestNodes);
          setSelNode(function (sn: any) {
            if (!sn || sn.id !== selNode.id) return sn;
            return Object.assign({}, sn, { data: Object.assign({}, sn.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
          });
          setEdges(latestEdges);
        }
        return { nodes: latestNodes, edges: latestEdges };
      }
      function buildLatestDefinitionPayload(): any {
        var latest = buildLatestWorkflowGraph();
        var ready = ensureWorkflowReadyToSave(stripRemovedWorkflowNodes(buildDefinition(latest.nodes, latest.edges, startId, variables, workflowName, workflowDescription)), schema);
        ready.nodes = (ready.nodes || []).map(function (n: any) {
          var type = String((n && n.type) || 'FormField');
          if (typeof (n && n.type) === 'number' && typeof NODE_TYPE_INT_MAP !== 'undefined') type = (NODE_TYPE_INT_MAP as any)[n.type] || 'FormField';
          return Object.assign({}, n, { type: type, config: serializeNodeConfigForApi(type, (n && n.config) || {}) });
        });
        return ready;
      }

      function onConfigSave(nodeId: string, updates: any, options?: any): void {
        setNodes(function (ns: any[]) {
          return ns.map(function (n: any) {
            if (n.id !== nodeId) return n;
            return Object.assign({}, n, { data: Object.assign({}, n.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
          });
        });
        setSelNode(function (sn: any) {
          if (!sn || sn.id !== nodeId) return sn;
          return Object.assign({}, sn, { data: Object.assign({}, sn.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
        });
        setEdges(function (es: any[]) {
          return es.map(function (e: any) {
            if (e.source !== nodeId) return e;
            var srcNode = findNodeById(nodes, nodeId);
            var config = updates.config || (srcNode && srcNode.data.config) || {};
            if ((srcNode && srcNode.data.nodeType === 'Condition') || (updates && updates.config && updates.config.conditionGroups)) {
              var cc = normalizeConditionConfig(config);
              if (e.sourceHandle === 'true') return Object.assign({}, e, { label: cc.trueLabel || 'Yes' });
              if (e.sourceHandle === 'false') return Object.assign({}, e, { label: cc.falseLabel || 'No' });
            }
            if ((srcNode && srcNode.data.nodeType === 'Approval') || isApprovalHandle(e.sourceHandle || '')) {
              return Object.assign({}, e, { label: getApprovalEdgeLabel(config, e.sourceHandle || 'default') });
            }
            return e;
          });
        });
        selectedNodeDraftRef.current = Object.assign({ nodeId: nodeId, nodeType: (selNode && selNode.id === nodeId) ? selNode.data.nodeType : null }, updates || {});
        setDirty(true);
        if (!(options && options.silent)) showToastMsg('Node updated ✓');
      }
      function onConfigDel(nodeId: string): void {
        setNodes(function (ns: any[]) { return ns.filter(function (n: any) { return n.id !== nodeId; }); });
        setEdges(function (es: any[]) { return es.filter(function (e: any) { return e.source !== nodeId && e.target !== nodeId; }); });
        setSelNode(null);
        if (startId === nodeId) setStartId(null);
        setDirty(true);
      }
      function onSetStart(nodeId: string): void { setStartId(nodeId); setDirty(true); showToastMsg('Start node updated'); }
      function deleteSelected(): void {
        if (selEdgeId) {
          setEdges(function (es: any[]) { return es.filter(function (e: any) { return e.id !== selEdgeId; }); });
          setSelEdgeId(null);
          setDirty(true);
          showToastMsg('Link deleted ✓');
          return;
        }
        if (selNode) {
          onConfigDel(selNode.id);
          showToastMsg('Node deleted ✓');
          return;
        }
        showToastMsg('Select a node or link first', true);
      }
      function onLoadJson(def: any): void {
        try {
          var normalized = ensureWorkflowReadyToSave(autoMapWorkflowToSchema(normalizeWorkflowDef(def), schema), schema);
          if (!normalized || !normalized.nodes) { showToastMsg('Invalid workflow JSON', true); return; }
          var built = buildInitialGraph(normalized, schema);
          setNodes(built.nodes);
          setEdges(built.edges);
          setStartId(built.startId);
          setVariables((normalized.variables || []) as WorkflowVariable[]);
          setWorkflowName(inferWorkflowName(normalized, schema));
          setWorkflowDescription(inferWorkflowDescription(normalized, schema));
          setSelNode(null);
          setDirty(true);
          if (rfInstance.current) setTimeout(function () { rfInstance.current.fitView({ padding: 0.12, duration: 400 }); }, 80);
          showToastMsg('BPMN workflow loaded ✓');
        } catch (e: any) {
          showToastMsg('Load error: ' + e.message, true);
        }
      }
      function workflowSavePath():     string { return getPlatform() === 'oqtane' ? '/Form/Workflow/SaveDraft'  : '/Workflow/SaveDraft'; }
      function workflowApplyPath():    string { return getPlatform() === 'oqtane' ? '/Form/Workflow/Apply'       : '/Workflow/Apply'; }
      function workflowValidatePath(): string { return getPlatform() === 'oqtane' ? '/Form/Workflow/Validate'    : '/Workflow/Validate'; }
      function workflowTestRunPath():  string { return getPlatform() === 'oqtane' ? '/Form/Workflow/TestRun'     : '/Workflow/TestRun'; }

      // ── Normalize server issues response → WorkflowIssue[] ────────────────
      function normalizeIssues(data: any, source: string): any[] {
        var raw: any[] = [];
        if (data && Array.isArray(data.issues)) raw = data.issues;
        else if (data && Array.isArray(data.Issues)) raw = data.Issues;
        else if (data && Array.isArray(data.errors)) raw = data.errors;
        else if (data && Array.isArray(data.Errors)) raw = data.Errors;
        return raw.map(function (e: any, idx: number) {
          return {
            id:       e.id || String(idx),
            severity: e.severity || (e.Severity ? e.Severity.toLowerCase() : 'error'),
            source:   e.source   || source,
            nodeId:   e.nodeId   || e.NodeId  || null,
            field:    e.field    || e.Field   || null,
            code:     e.code     || null,
            message:  e.message  || e.Message || 'Unknown error',
          };
        });
      }

      function showIssues(issueList: any[], action: string, isError?: boolean): void {
        var now = new Date();
        var t = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
        setIssues(issueList);
        setIssueAction(action);
        setIssueTime(t);
        setIssuesPanelOpen(true);
        if (isError && issueList.length > 0) {
          var cnt = issueList.filter(function(i: any){ return i.severity === 'error'; }).length;
          showToastMsg(cnt + ' error' + (cnt !== 1 ? 's' : '') + ' — see Issues panel below', true);
        }
      }

      function onSaveDraft(): void {
        setSaveStatus('saving');
        var def = buildLatestDefinitionPayload();
        var fid = resolveCurrentFormId(W._state.formId);
        W._state.formId = fid;
        if (!fid) {
          setSaveStatus('error');
          showIssues([{ id:'0', severity:'error', source:'save-draft', message:'Save the form first so the workflow can be attached to a real form ID.' }], 'save-draft', true);
          return;
        }
        apiPost(workflowSavePath(), { formId: fid, workflow: def }, function (err: any, data: any) {
          var list = normalizeIssues(data || (err && err.serverData), 'save-draft');
          if (err && !data) {
            setSaveStatus('error');
            showIssues(list.length ? list : [{ id:'0', severity:'error', source:'save-draft', message: err.message || 'Save failed' }], 'save-draft', true);
          } else {
            setSaveStatus('saved');
            setDirty(false);
            var activeVersion = data ? (data.activeVersion || data.ActiveVersion || '') : '';
            var appliedAt = data ? (data.appliedAt || data.AppliedAt || '') : '';
            if (activeVersion) setAppliedVersion(activeVersion);
            if (appliedAt)     setAppliedAt(String(appliedAt));
            showIssues(list, 'save-draft', list.some(function(i: any){ return i.severity === 'error'; }));
            if (!list.length) showToastMsg('Draft saved ✓');
          }
        });
      }

      function onValidate(): void {
        var def = buildLatestDefinitionPayload();
        var fid = resolveCurrentFormId(W._state.formId);
        W._state.formId = fid;
        if (!fid) {
          showIssues([{ id:'0', severity:'error', source:'validate', message:'Save the form first so validation can run against a stored workflow record.' }], 'validate', true);
          return;
        }
        apiPost(workflowValidatePath(), { formId: fid, workflow: def }, function (err: any, data: any) {
          var list = normalizeIssues(data || (err && err.serverData), 'validate');
          showIssues(list, 'validate', list.some(function(i: any){ return i.severity === 'error'; }));
          if (!list.length) showToastMsg('Validation passed ✓');
        });
      }

      function onApply(): void {
        setSaveStatus('applying');
        var def = buildLatestDefinitionPayload();
        var fid = resolveCurrentFormId(W._state.formId);
        W._state.formId = fid;
        if (!fid) {
          setSaveStatus('error');
          showIssues([{ id:'0', severity:'error', source:'apply', message:'Save the form first so the workflow can be applied to a real form ID.' }], 'apply', true);
          return;
        }
        apiPost(workflowApplyPath(), { formId: fid, workflow: def }, function (err: any, data: any) {
          var list = normalizeIssues(data || (err && err.serverData), 'apply');
          if (err && !data) {
            setSaveStatus('error');
            showIssues(list.length ? list : [{ id:'0', severity:'error', source:'apply', message: err.message || 'Apply failed' }], 'apply', true);
          } else if (data && ((data.status || data.Status) === 'apply-blocked')) {
            setSaveStatus('error');
            showIssues(list, 'apply', true);
          } else {
            setSaveStatus('applied');
            setDirty(false);
            var activeVersion = data ? (data.activeVersion || data.ActiveVersion || '') : '';
            var appliedAt = data ? (data.appliedAt || data.AppliedAt || '') : '';
            if (activeVersion) setAppliedVersion(activeVersion);
            if (appliedAt)     setAppliedAt(String(appliedAt));
            showIssues(list, 'apply', false);
            if (!list.length) showToastMsg('BPMN workflow applied ✓');
          }
        });
      }

      function onSave(): void { onApply(); }
      function formatWorkflowErrors(data: any, fallbackErr: any): string {
        var list = data && data.errors && Array.isArray(data.errors) ? data.errors
          : data && data.Errors && Array.isArray(data.Errors) ? data.Errors
          : data && data.issues && Array.isArray(data.issues) ? data.issues
          : data && data.Issues && Array.isArray(data.Issues) ? data.Issues
          : [];
        if (list.length) {
          return list.map(function (e: any) {
            var nodeLabel = e.nodeLabel || e.NodeLabel || e.nodeId || e.NodeId || '';
            var field     = e.field || e.Field || '';
            var msg       = e.message || e.Message || 'Validation error';
            var prefix    = nodeLabel ? (nodeLabel + (field ? '.' + field : '')) : field;
            return prefix ? (prefix + ': ' + msg) : msg;
          }).join('\n');
        }
        var modelState = data && data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)
          ? data.errors
          : data && data.Errors && typeof data.Errors === 'object' && !Array.isArray(data.Errors)
          ? data.Errors
          : null;
        if (modelState) {
          var msgs: string[] = [];
          Object.keys(modelState).forEach(function (k) {
            var arr: string[] = modelState[k];
            if (Array.isArray(arr)) arr.forEach(function (m) { msgs.push(m); });
          });
          if (msgs.length) return msgs.join('\n');
        }
        if (data && data.error) return String(data.error);
        if (data && data.Error) return String(data.Error);
        if (data && data.message) return String(data.message);
        if (data && data.Message) return String(data.Message);
        if (fallbackErr && fallbackErr.serverData) return formatWorkflowErrors(fallbackErr.serverData, null);
        if (fallbackErr && fallbackErr.message) return String(fallbackErr.message);
        return 'Unknown error — check browser console for details.';
      }
      function onTestRun(): void {
        var fid = resolveCurrentFormId(W._state.formId);
        W._state.formId = fid;
        if (!fid) { showToastMsg('Save the form first before running workflow tests.', true); return; }
        var def = buildLatestDefinitionPayload();
        apiPost(workflowApplyPath(), { formId: fid, workflow: def }, function (err: any, data: any) {
          var successFlag = data ? (data.success != null ? data.success : data.Success) : null;
          if (err || !data || successFlag === false) { showToastMsg('Test prepare failed: ' + formatWorkflowErrors(data, err), true); return; }
          apiPost(workflowTestRunPath(), { formId: fid, formData: {}, dryRun: true }, function (err2: any, data2: any) {
            if (err2) { showToastMsg('Test run failed: ' + (err2.message || err2), true); return; }
            setTestResult(data2);
            setTracedIds((data2.log || []).map(function (e: any) { return e.nodeId; }));
          });
        });
      }
      function onFit(): void { if (rfInstance.current) rfInstance.current.fitView({ padding: 0.1, duration: 300 }); }
      function onClear(): void { if (!(window as any).confirm('Clear all nodes and edges?')) return; setNodes([]); setEdges([]); setSelNode(null); setSelEdgeId(null); setStartId(null); setDirty(true); }
      function showToastMsg(msg: string, isError?: boolean): void { setToast({ msg: msg, isError: !!isError }); setTimeout(function () { setToast(null); }, 2600); }

      var stateShowSample = R.useState(false);
      var showSample = stateShowSample[0], setShowSample = stateShowSample[1];
      // Right panel tab: 'properties' | 'variables'

      var panelGuards = {
        onMouseDownCapture: swallowPanelEvent,
        onClickCapture: swallowPanelEvent,
        onDoubleClickCapture: swallowPanelEvent,
        onPointerDownCapture: swallowPanelEvent,
        onWheelCapture: swallowPanelEvent,
        onTouchStartCapture: swallowPanelEvent,
        onMouseUpCapture: swallowPanelEvent,
        onFocusCapture: swallowPanelEvent,
        onBlurCapture: swallowPanelEvent,
        onKeyDownCapture: swallowPanelEvent
      } as any;

      var selectedEdge = selEdgeId ? edges.find(function (e: any) { return e.id === selEdgeId; }) || null : null;
      var sidePanelEl = h(renderWorkflowSidePanel, {
        selNode: selNode,
        selectedEdge: selectedEdge,
        rightTab: rightTab,
        setRightTab: setRightTab,
        variables: variables,
        allNodes: nodes,
        setVariables: function (next: any) { setVariables(next); setDirty(true); },
        onConfigSave: onConfigSave,
        onConfigDel: onConfigDel,
        onSetStart: onSetStart,
        onDeleteSelected: deleteSelected,
        onDraftChange: function (draft: any) {
          selectedNodeDraftRef.current = draft ? deepClone(draft) : null;
        },
        panelGuards: panelGuards,
        isOpen: rightOpen,
        panelWidth: rightWidth,
        onStartResize: startPanelResize,
        onToggle: function (next: boolean) { setRightOpen(next); }
      });

      R.useEffect(function () {
        function onKey(ev: any): void {
          if (!ev) return;
          var key = String(ev.key || '').toLowerCase();
          var target = ev.target as any;
          var tag = String((target && target.tagName) || '');
          var isEditable = !!(target && (target.isContentEditable || /input|textarea|select|button/i.test(tag) || (target.closest && target.closest('input, textarea, select, button, [contenteditable="true"]'))));
          if ((key === 'delete' || key === 'backspace') && !isEditable) {
            ev.preventDefault();
            deleteSelected();
          }
        }
        document.addEventListener('keydown', onKey, true);
        return function () { document.removeEventListener('keydown', onKey, true); };
      }, [selNode, selEdgeId, nodes, edges]);

      return h('div', { className: 'mf-rf-app', 'data-workflow-z-badge': WORKFLOW_OVERLAY_Z_BADGE, 'data-workflow-host-badge': WORKFLOW_DNN_HOST_BADGE },
        h(Toolbar, {
          dirty: dirty, saveStatus: saveStatus,
          workflowName: workflowName, workflowDescription: workflowDescription,
          appliedVersion: appliedVersion, appliedAt: appliedAt,
          leftCollapsed: leftCollapsed, rightOpen: rightOpen,
          onWorkflowNameChange: function (v: string) { setWorkflowName(v); setDirty(true); },
          onWorkflowDescriptionChange: function (v: string) { setWorkflowDescription(v); setDirty(true); },
          onSaveDraft: onSaveDraft,
          onValidate: onValidate,
          onApply: onApply,
          onSave: onSave,
          onTestRun: onTestRun, onFit: onFit,
          onToggleTools: function () { setLeftCollapsed(function (v: boolean) { return !v; }); },
          onShowProperties: function () { setRightTab('properties'); setRightOpen(function (v: boolean) { return !v; }); },
          onShowVariables: function () { setRightTab('variables'); setRightOpen(true); },
          onDeleteSelected: deleteSelected,
          hasSelection: !!(selNode || selEdgeId),
          deleteLabel: selEdgeId ? 'Delete Link' : (selNode ? 'Delete Node' : 'Delete'),
          deleteHint: selEdgeId ? 'Delete selected link (Delete / Backspace)' : (selNode ? 'Delete selected node (Delete / Backspace)' : 'Select a node or link first'),
          onClear: onClear, onClose: W.close,
          onToggleSample: function () { setShowSample(function (v: boolean) { return !v; }); }
        }),
        h(SampleJsonPanel, { visible: showSample, onClose: function () { setShowSample(false); }, onLoadJson: onLoadJson }),
        h('div', { className: 'mf-rf-main' },
          h('div', { className: 'mf-rf-body' },
            h(NodePalette, { collapsed: leftCollapsed, onToggle: function () { setLeftCollapsed(function (v: boolean) { return !v; }); } }),
            h('div', { className: 'mf-rf-canvas', onDragOver: function (e: any) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, onDrop: onDrop },
                h(ZoneBackground),
                h(RF.ReactFlowProvider, null,
                  h(RF.ReactFlow, {
                    nodes: nodesWithHandlers,
                    edges: edges,
                    nodeTypes: { mfNode: MFNode },
                    onInit: function (instance: any) { rfInstance.current = instance; },
                    onNodesChange: onNodesChange,
                    onEdgesChange: onEdgesChange,
                    onConnect: onConnect,
                    onReconnect: onReconnect,
                    edgesReconnectable: true,
                    elevateEdgesOnSelect: true,
                    defaultMarkerColor: '#94a3b8',
                    onNodeClick: function (_e: any, node2: any) {
                      var stable = findNodeById(nodesRef.current, node2.id);
                      if (stable) {
                        setSelNode(stable);
                        setSelEdgeId(null);
                        setRightTab('properties');
                        setRightOpen(true);
                      }
                    },
                    onEdgeClick: function (e: any, edge2: any) {
                      if (e && e.stopPropagation) e.stopPropagation();
                      setSelNode(null);
                      setSelEdgeId(edge2 && edge2.id ? edge2.id : null);
                      setRightTab('properties');
                      setRightOpen(true);
                    },
                    onNodeDragStop: function (_e: any, node2: any) {
                      var stable = findNodeById(nodesRef.current, node2.id);
                      if (stable) {
                        setSelNode(stable);
                        setRightTab('properties');
                        setRightOpen(true);
                      }
                    },
                    onPaneClick: function (e: any) {
                      var cls = e && e.target && e.target.className ? String(e.target.className) : '';
                      if (cls.indexOf('react-flow__pane') < 0) return;
                      setSelNode(null);
                      setSelEdgeId(null);
                      setRightTab('properties');
                    },
                    fitView: true,
                    deleteKeyCode: 'Delete',
                    connectionLineStyle: { stroke: '#6366f1', strokeWidth: 2 },
                    connectionLineType: 'smoothstep',
                    defaultEdgeOptions: { type: 'smoothstep', animated: true },
                    proOptions: { hideAttribution: true }
                  },
                    h(RF.Background, { color: '#cbd5e1', gap: 24, size: 1.5, variant: 'dots' }),
                    h(RF.Controls, { className: 'mf-rf-controls' }),
                    h(CustomMiniMap, { nodes: nodes })
                  )
                )
            ),
            sidePanelEl
          )
        ),
        h(IssuesPanel, {
          issues: issues,
          actionLabel: issueAction,
          actionTime: issueTime,
          isOpen: issuesPanelOpen,
          onToggle: function () { setIssuesPanelOpen(function (v: boolean) { return !v; }); },
          onClear: function () { setIssues([]); setIssueAction(''); setIssueTime(''); },
          onSelectNode: function (nodeId: string) {
            var found = findNodeById(nodesRef.current, nodeId);
            if (found) { setSelNode(found); setRightTab('properties'); setRightOpen(true); }
          }
        }),
        h(TestRunPanel, { result: testResult, onClose: function () { setTestResult(null); setTracedIds([]); } }),
        h('div', { className: 'mf-rf-runtime-badge', title: WORKFLOW_OVERLAY_Z_BADGE + ' · ' + WORKFLOW_DNN_HOST_BADGE },
          WORKFLOW_OVERLAY_Z_BADGE,
          isDnnHost() ? ' · ' + WORKFLOW_DNN_HOST_BADGE : ''
        ),
        h('div', { style: { position: 'fixed', right: '12px', bottom: '12px', zIndex: 9999, pointerEvents: 'none', fontSize: '11px', fontWeight: 800, letterSpacing: '.08em', color: '#0f172a', background: 'rgba(255,255,255,.92)', border: '1px solid rgba(15,23,42,.16)', borderRadius: '999px', padding: '4px 8px', boxShadow: '0 8px 24px rgba(15,23,42,.12)' } }, '◆ IDX'),
        h(Toast, toast ? { msg: toast.msg, isError: toast.isError } : { msg: null })
      );
    }

    overlay.innerHTML = '';
    var root = document.createElement('div');
    root.id = 'mf-wfrf-root';
    root.style.cssText = 'height:100%;width:100%';
    var savedPanelWidth = 440;
    try { savedPanelWidth = parseInt(window.localStorage.getItem('mf.workflow.panelWidth') || '440', 10) || 440; } catch (_storageErr) { }
    savedPanelWidth = Math.max(360, Math.min(620, savedPanelWidth));
    overlay.appendChild(root);
    if (RD.createRoot) RD.createRoot(root).render(R.createElement(WorkflowApp));
    else RD.render(R.createElement(WorkflowApp), root);
  }


  function normalizeKeyToken(v: string): string {
    return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function pickFieldByHints(schema2: FormSchema, hints: string[], fallbackIndex?: number): FormSchemaField | null {
    var fields = (schema2 && schema2.fields) || [];
    if (!fields.length) return null;
    var i: number;
    for (i = 0; i < hints.length; i++) {
      var hint = normalizeKeyToken(hints[i] || '');
      if (!hint) continue;
      var exact = fields.find(function (f) {
        var key = normalizeKeyToken(f.key || '');
        var label = normalizeKeyToken(f.label || '');
        return key === hint || label === hint;
      });
      if (exact) return exact;
      var partial = fields.find(function (f) {
        var key = normalizeKeyToken(f.key || '');
        var label = normalizeKeyToken(f.label || '');
        return key.indexOf(hint) >= 0 || label.indexOf(hint) >= 0 || hint.indexOf(key) >= 0 || hint.indexOf(label) >= 0;
      });
      if (partial) return partial;
    }
    if (typeof fallbackIndex === 'number' && fields[fallbackIndex]) return fields[fallbackIndex];
    return fields[0] || null;
  }

  function pickChoiceField(schema2: FormSchema): FormSchemaField | null {
    var fields = (schema2 && schema2.fields) || [];
    var preferred = fields.find(function (f) {
      var t = String(f.type || '').toLowerCase();
      return t === 'dropdown' || t === 'select' || t === 'radio' || t === 'checkbox' || t === 'singlechoice' || t === 'multiplechoice';
    });
    return preferred || pickFieldByHints(schema2, ['status', 'type', 'category', 'newsletter', 'consent'], 0);
  }

  function pickEmailField(schema2: FormSchema): FormSchemaField | null {
    return pickFieldByHints(schema2, ['email', 'email address', 'work email'], 0);
  }

  function pickNameField(schema2: FormSchema): FormSchemaField | null {
    return pickFieldByHints(schema2, ['full name', 'first name', 'name', 'contact name'], 0);
  }

  function pickPhoneField(schema2: FormSchema): FormSchemaField | null {
    return pickFieldByHints(schema2, ['phone', 'mobile', 'telephone'], 1);
  }

  function autoMapWorkflowToSchema(def: any, schema2: FormSchema): any {
    var mapped = deepClone(def || {});
    var fields = (schema2 && schema2.fields) || [];
    if (!fields.length) return mapped;
    var used: AnyObj = {};
    function reserve(key: string): void { if (key) used[key] = true; }
    function chooseFieldForNode(node: any, index: number): FormSchemaField | null {
      var cfg = (node && node.config) || {};
      var hints = [cfg.fieldKey, node && node.label, cfg.fieldLabel, cfg.placeholder, cfg.fieldName];
      var chosen = pickFieldByHints(schema2, hints as any, index);
      if (chosen && !used[chosen.key]) { reserve(chosen.key); return chosen; }
      if (chosen) return chosen;
      var free = fields.find(function (f) { return !used[f.key]; });
      if (free) { reserve(free.key); return free; }
      return fields[index] || fields[0] || null;
    }
    (mapped.nodes || []).forEach(function (node: any, index: number) {
      if (!node || !node.config) node.config = {};
      if (node.type === 'FormField') {
        var chosen = chooseFieldForNode(node, index);
        if (chosen) {
          node.label = chosen.label || chosen.key;
          node.config.fieldKey = chosen.key;
          node.config.pageIndex = typeof chosen.pageIndex === 'number' ? chosen.pageIndex : 0;
          node.config.isPageNode = false;
        }
      }
      if (node.type === 'Switch') {
        var switchChosen = pickChoiceField(schema2) || fields[0] || null;
        if (switchChosen) {
          node.label = 'Switch';
          node.config = normalizeSwitchNodeConfig(Object.assign({}, node.config || {}, { fieldKey: switchChosen.key }), schema2);
        }
      }
      if (node.type === 'Condition') {
        var cc = normalizeConditionConfig(node.config || {});
        (cc.conditionGroups || []).forEach(function (group: any) {
          (group.rules || []).forEach(function (rule: any) {
            var picked = pickFieldByHints(schema2, [rule.fieldKey, node.label, 'status', 'type', 'category', 'consent'], 0) || pickChoiceField(schema2) || fields[0];
            if (picked) rule.fieldKey = picked.key;
          });
        });
        node.config = cc;
      }
    });
    return mapped;
  }

  function buildInitialGraph(workflowDef: any, schema: FormSchema): any {
    workflowDef = ensureWorkflowReadyToSave(autoMapWorkflowToSchema(stripRemovedWorkflowNodes(workflowDef), schema), schema);
    if (workflowDef && workflowDef.nodes && workflowDef.nodes.length) {
      return {
        nodes: workflowDef.nodes.map(function (n: any) {
          return { id: n.id, type: 'mfNode', position: n.position || { x: 100, y: 100 }, width: 180, height: 52, data: { nodeType: n.type, label: n.label, zoneType: n.zoneType || ((NODE_META[n.type] && NODE_META[n.type].zone === 'nav') ? 'Navigation' : 'Action'), config: n.config || defaultConfigForType(n.type, schema), isDisabled: !!n.isDisabled, isStart: n.id === workflowDef.startNodeId } };
        }),
        edges: (workflowDef.edges || []).map(function (e: any) { return rfEdgeFromDef(e); }),
        startId: workflowDef.startNodeId || (workflowDef.nodes[0] && workflowDef.nodes[0].id) || null
      };
    }
    return {
      nodes: [
        { id: 'start-field', type: 'mfNode', position: { x: 80, y: 140 }, width: 180, height: 52, data: { nodeType: 'FormField', label: 'Form Submitted', zoneType: 'Navigation', config: defaultConfigForType('FormField', schema), isStart: true } },
        { id: 'end-1', type: 'mfNode', position: { x: 600, y: 140 }, width: 180, height: 52, data: { nodeType: 'End', label: 'End', zoneType: 'Action', config: defaultConfigForType('End', schema), isStart: false } }
      ],
      edges: [rfEdgeFromDef({ id: 'e-start-end', sourceNodeId: 'start-field', targetNodeId: 'end-1', sourceHandle: 'default', targetHandle: 'in', label: '' })],
      startId: 'start-field'
    };
  }

  function defaultConfigForType(type: string, schema: FormSchema): any {
    if (type === 'FormField') {
      var firstField = schema.fields && schema.fields.length ? schema.fields[0] : null;
      return { fieldKey: firstField ? firstField.key : '', pageIndex: firstField ? firstField.pageIndex || 0 : 0, isPageNode: false };
    }
    if (type === 'Condition') return { conditionGroups: [{ logic: 'and', rules: [{ fieldKey: '', operator: 'equals', value: '', valueType: 'literal' }] }], trueLabel: 'Yes', falseLabel: 'No' };
    if (type === 'Approval') return normalizeApprovalConfig({});
    if (type === 'Switch') {
      var choiceField = (schema.fields || []).find(function (f: any) { return ['select','dropdown','radio','checkbox'].indexOf(String((f && f.type) || '').toLowerCase()) >= 0; }) || (schema.fields && schema.fields.length ? schema.fields[0] : null);
      var rawOptions = choiceField && Array.isArray(choiceField.options) ? choiceField.options.slice(0, 4) : [];
      var cases = rawOptions.length ? rawOptions.map(function (opt: any, idx: number) { return { id: 'case-' + idx, value: String(opt && (opt.value || opt.label) || ''), label: String(opt && (opt.label || opt.value) || ('Case ' + (idx + 1))) }; }) : [];
      while (cases.length < 4) cases.push({ id: 'case-' + cases.length, value: '', label: 'Case ' + (cases.length + 1) });
      return { fieldKey: choiceField ? choiceField.key : '', matchMode: 'equals', cases: cases.slice(0, 4) };
    }
    if (type === 'Webhook') return { url: '', method: 'POST', headers: [], auth: { type: 'None', value: '', headerName: 'X-Api-Key', username: '' }, bodyMappings: [], bodyTemplate: '', responseVariableKey: '', timeoutSeconds: 30, retry: { maxAttempts: 3, delaySeconds: 5, backoffMultiplier: 2 }, responseRoutes: [] };
    if (type === 'SendEmail') return { to: '', cc: '', subject: '', body: '', replyTo: '' };
    if (type === 'Calculate') return { targetVariable: '', operand1: '', operator: 'assign', operand2: '', roundToInt: false };
    if (type === 'End') return { endType: 'Success', message: 'Thank you!', redirectUrl: '' };
    if (type === 'Loop') {
      var firstField = schema.fields && schema.fields.length ? schema.fields[0] : null;
      return { sourceType: 'field', fieldKey: firstField ? firstField.key : '', variableKey: '', itemVariable: 'loopItem', indexVariable: 'loopIndex', maxIterations: 25, loopLabel: 'Loop', doneLabel: 'Done' };
    }
    if (type === 'GoogleSheets') {
      var firstField = schema.fields && schema.fields.length ? schema.fields[0] : null;
      return { spreadsheetId: '', sheetName: 'Sheet1', range: 'Sheet1!A:D', operation: 'append', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', columnMappings: [
        { column: 'A', source: firstField ? firstField.key : '', value: '' },
        { column: 'B', source: '', value: '' },
        { column: 'C', source: '', value: '' },
        { column: 'D', source: '', value: '' }
      ] };
    }
    if (type === 'Fork') return { joinNodeId: '', maxBranches: 2, failFast: false, branchStartNodeIds: [] };
    if (type === 'Join') return { strategy: 'wait-all', threshold: 1, timeoutSeconds: 300, onTimeout: 'fail', resultVariable: '' };
    if (type === 'Filter') return { conditionGroups: [{ id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'Equals', value: '', valueType: 'literal' }] }], onFail: 'stop', skipToNodeId: '', passLabel: '' };
    if (type === 'Database') return { connectionName: '', operation: 'Insert', tableName: '', procedureName: '', fieldMappings: [], whereMappings: [], timeoutSeconds: 30, continueOnError: false };
    return {};
  }

  function sanitizeNodeConfig(type: string, cfg: any): any {
    return normalizeNodeConfigByType(type, deepClone(cfg || {}));
  }

  function serializeNodeConfigForApi(type: string, cfg: any): any {
    var c = sanitizeNodeConfig(type, cfg || {});
    if (type === 'Condition') return c;
    if (type === 'Approval') return serializeApprovalConfig(c);
    if (type === 'Webhook') return { Url: c.url || '', Method: normalizeWebhookMethod(c.method || 'POST'), Headers: webhookHeadersToDictionary(c.headers || []), Auth: { Type: normalizeWebhookAuth(c.auth || {}).type || 'None', Value: normalizeWebhookAuth(c.auth || {}).value || '', HeaderName: normalizeWebhookAuth(c.auth || {}).headerName || 'X-Api-Key', Username: normalizeWebhookAuth(c.auth || {}).username || '' }, BodyMappings: normalizeWebhookBodyMappings(c.bodyMappings || []).map(function (row: any) { return { FormFieldKey: row.formFieldKey || '', BodyPath: row.bodyPath || '', StaticValue: row.staticValue || '' }; }), BodyTemplate: c.bodyTemplate || '', ResponseVariableKey: c.responseVariableKey || '', TimeoutSeconds: Math.max(1, Math.min(120, parseInt(c.timeoutSeconds, 10) || 30)), Retry: { MaxAttempts: normalizeWebhookRetry(c.retry || {}).maxAttempts, DelaySeconds: normalizeWebhookRetry(c.retry || {}).delaySeconds, BackoffMultiplier: normalizeWebhookRetry(c.retry || {}).backoffMultiplier }, ResponseRoutes: normalizeWebhookResponseRoutes(c.responseRoutes || []).map(function (row: any) { return { JsonPath: row.jsonPath || '', Operator: normalizeResponseRouteOperator(row.operator || 'Equals'), Value: row.value || '', NextNodeId: row.nextNodeId || '', Label: row.label || '' }; }) };
    if (type === 'SendEmail') return { To: c.to || '', Cc: c.cc || '', Subject: c.subject || '', Body: c.body || '', ReplyTo: c.replyTo || '' };
    if (type === 'FormField') return { FieldKey: c.fieldKey || '', PageIndex: typeof c.pageIndex === 'number' ? c.pageIndex : 0, IsPageNode: !!c.isPageNode };
    if (type === 'Switch') return { FieldKey: c.fieldKey || '', MatchMode: c.matchMode || 'equals', Cases: (c.cases || []).slice(0, 4).map(function (row: any, idx: number) { return { Id: 'case-' + idx, Value: row.value || '', Label: row.label || row.value || ('Case ' + (idx + 1)) }; }) };
    if (type === 'Loop') return { SourceType: c.sourceType || 'field', FieldKey: c.fieldKey || '', VariableKey: c.variableKey || '', ItemVariable: c.itemVariable || 'loopItem', IndexVariable: c.indexVariable || 'loopIndex', MaxIterations: Math.max(1, Math.min(500, parseInt(c.maxIterations, 10) || 25)), LoopLabel: c.loopLabel || 'Loop', DoneLabel: c.doneLabel || 'Done' };
    if (type === 'GoogleSheets') return { SpreadsheetId: c.spreadsheetId || '', SheetName: c.sheetName || '', Range: c.range || '', Operation: c.operation || 'append', ValueInputOption: c.valueInputOption || 'USER_ENTERED', InsertDataOption: c.insertDataOption || 'INSERT_ROWS', ColumnMappings: (c.columnMappings || []).slice(0, 6).map(function (row: any) { return { Column: row.column || '', Source: row.source || '', Value: row.value || '' }; }) };
    if (type === 'Calculate') return { TargetVariable: c.targetVariable || '', Operand1: c.operand1 || '', Operator: c.operator || 'assign', Operand2: c.operand2 || '', RoundToInt: !!c.roundToInt };
    if (type === 'End') return { EndType: normalizeEndType(c.endType || 'Success'), Message: c.message || '', RedirectUrl: c.redirectUrl || '' };
    if (type === 'Fork') return { JoinNodeId: c.joinNodeId || '', BranchStartNodeIds: c.branchStartNodeIds || [], MaxBranches: c.maxBranches || 2, FailFast: !!c.failFast };
    if (type === 'Join') return { Strategy: c.strategy || 'wait-all', Threshold: c.threshold || 1, TimeoutSeconds: c.timeoutSeconds || 300, OnTimeout: c.onTimeout || 'fail', ResultVariable: c.resultVariable || '' };
    if (type === 'Filter') return { ConditionGroups: c.conditionGroups || [], OnFail: c.onFail || 'stop', SkipToNodeId: c.skipToNodeId || '', PassLabel: c.passLabel || '' };
    if (type === 'Database') {
      var fieldMaps: any = {};
      var whereMaps: any = {};
      if (c.fieldMappings && typeof c.fieldMappings === 'object' && !Array.isArray(c.fieldMappings)) {
        fieldMaps = c.fieldMappings;
      } else if (Array.isArray(c.fieldMappings)) {
        (c.fieldMappings as any[]).forEach(function(m: any) {
          var k = String(m && m.column ? m.column : (m && m.targetColumn ? m.targetColumn : (m && m.TargetColumn ? m.TargetColumn : ''))).trim();
          var v = String(m && m.value ? m.value : (m && m.sourceKey ? m.sourceKey : (m && m.SourceKey ? m.SourceKey : ''))).trim();
          if (k) fieldMaps[k] = v;
        });
      }
      if (c.whereMappings && typeof c.whereMappings === 'object' && !Array.isArray(c.whereMappings)) {
        whereMaps = c.whereMappings;
      } else if (Array.isArray(c.whereMappings)) {
        (c.whereMappings as any[]).forEach(function(m: any) {
          var k = String(m && m.column ? m.column : (m && m.targetColumn ? m.targetColumn : (m && m.TargetColumn ? m.TargetColumn : ''))).trim();
          var v = String(m && m.value ? m.value : (m && m.sourceKey ? m.sourceKey : (m && m.SourceKey ? m.SourceKey : ''))).trim();
          if (k) whereMaps[k] = v;
        });
      }
      var dbOp = String(c.operation || 'Insert');
      return {
        ConnectionMode:  'Named',
        ConnectionName:  c.connectionName || '',
        DatabaseType:    '',
        ConnectionString:'',
        Operation:       dbOp,
        TableName:       dbOp === 'StoredProcedure' ? '' : (c.tableName || ''),
        ProcedureName:   dbOp === 'StoredProcedure' ? (c.procedureName || '') : '',
        FieldMappings:   fieldMaps,
        WhereMappings:   whereMaps,
        TimeoutSeconds:  Number(c.timeoutSeconds || 30),
        ContinueOnError: !!c.continueOnError,
      };
    }
    return c;
  }

  function getOperatorsForFieldType(fieldType: string): ConditionOperator[] {
    switch (String(fieldType || '').toLowerCase()) {
      case 'number': case 'slider': case 'rating':
        return ['equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'isEmpty', 'isNotEmpty'];
      case 'select': case 'radio':
        return ['equals', 'notEquals', 'in', 'notIn', 'isEmpty', 'isNotEmpty'];
      case 'checkbox': case 'imagechoice':
        return ['contains', 'notContains', 'isEmpty', 'isNotEmpty'];
      case 'date': case 'daterange':
        return ['equals', 'notEquals', 'greaterThan', 'lessThan', 'isEmpty', 'isNotEmpty'];
      case 'terms':
        return ['equals', 'isEmpty', 'isNotEmpty'];
      case 'fullname': case 'address':
        return ['isEmpty', 'isNotEmpty'];
      default:
        return ['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'isNotEmpty', 'startsWith', 'endsWith'];
    }
  }

  function inferPageCount(schema: FormSchema): number {
    var maxPage = 0;
    (schema.fields || []).forEach(function (f) { if (typeof f.pageIndex === 'number' && f.pageIndex > maxPage) maxPage = f.pageIndex; });
    return maxPage + 1;
  }

  function rfEdgeFromDef(e: any): any {
    var srcHandle = e.sourceHandle || 'default';
    var color = srcHandle === 'true' ? '#22c55e' : srcHandle === 'false' ? '#ef4444' : (isApprovalHandle(srcHandle) ? (getApprovalEdgeColor(srcHandle) || '#94a3b8') : '#94a3b8');
    var markerEnd = (window as any).ReactFlow && (window as any).ReactFlow.MarkerType
      ? { type: (window as any).ReactFlow.MarkerType.ArrowClosed, color: color, width: 18, height: 18 }
      : undefined;
    return { id: e.id, source: e.sourceNodeId, target: e.targetNodeId, sourceHandle: srcHandle, targetHandle: e.targetHandle || 'in', type: 'smoothstep', animated: true, reconnectable: true, selectable: true, interactionWidth: 28, markerEnd: markerEnd, label: e.label || (isApprovalHandle(srcHandle) ? getApprovalEdgeLabel(null, srcHandle) : (srcHandle === 'true' ? 'Yes' : srcHandle === 'false' ? 'No' : '')), style: { stroke: color, strokeWidth: 2.2 }, labelStyle: { fill: color, fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: 'white', opacity: 0.92 } };
  }

  function buildDefinition(nodes: any[], edges: any[], startId: string | null, variables: WorkflowVariable[], workflowName: string, workflowDescription: string): any {
    return {
      formId: W._state.formId,
      name: workflowName || 'Workflow',
      description: workflowDescription || '',
      version: '1.0.0',
      startNodeId: startId || (nodes[0] ? nodes[0].id : null),
      nodes: nodes.map(function (n: any) {
        return { id: n.id, type: n.data.nodeType, label: n.data.label, position: n.position, zoneType: n.data.zoneType, config: serializeNodeConfigForApi(n.data.nodeType, n.data.config || {}), isDisabled: !!n.data.isDisabled };
      }),
      edges: edges.map(function (e: any) { return { id: e.id, sourceNodeId: e.source, targetNodeId: e.target, sourceHandle: e.sourceHandle || 'default', targetHandle: e.targetHandle || 'in', label: e.label || '' }; }),
      variables: (variables || []).map(function (v) { return { key: v.key || '', type: v.type || 'String', defaultValue: v.defaultValue || '', description: v.description || '' }; }),
      settings: { executionTimeoutSeconds: 300, enableExecutionLog: true, dryRun: false }
    };
  }

  function findNodeById(nodes: any[], id: string): any {
    var found = null;
    (nodes || []).forEach(function (n) { if (n.id === id) found = n; });
    return found;
  }

  function getApiUrl(path: string): string {
    var base = (W._state.apiBase || '').replace(/\/+$/, '');
    var cleanPath = path.charAt(0) === '/' ? path : '/' + path;
    if (base.toLowerCase().indexOf('/api/megaform') >= 0) return base + cleanPath;
    if (base.toLowerCase().indexOf('/desktopmodules/') >= 0) return base + cleanPath;
    return base + '/api/MegaForm' + cleanPath;
  }
  function getToken(): string {
    var el = document.getElementById('mf-jwt-token') as HTMLInputElement | null || document.getElementById('mf-auth-token') as HTMLInputElement | null;
    return el ? el.value : '';
  }
  function buildRequestHeaders(): AnyObj {
    var headers: AnyObj = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var root = getRootEl();
    var platform = getPlatform();
    if (platform === 'dnn') {
      var rv = (window as any).WebSF && (window as any).WebSF.getAntiForgeryValue ? (window as any).WebSF.getAntiForgeryValue() : '';
      var mid = (window as any).MODULE_ID || (root && root.dataset.moduleId) || 0;
      var tid = (window as any).TAB_ID || (root && root.dataset.tabId) || 0;
      if (rv) headers.RequestVerificationToken = rv;
      if (mid) headers.ModuleId = String(mid);
      if (tid) headers.TabId = String(tid);
    }
    if (platform === 'oqtane' && root) {
      if (root.dataset.moduleId) headers['X-OQTANE-MODULEID'] = root.dataset.moduleId;
      if (root.dataset.portalId) headers['X-OQTANE-SITEID'] = root.dataset.portalId;
      if (root.dataset.tabId) headers['X-OQTANE-PAGEID'] = root.dataset.tabId;
    }
    return headers;
  }
  function parseResponse(r: Response): Promise<any> {
    return r.text().then(function (txt) {
      var data: any = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (_e) { data = txt; }
      if (!r.ok) {
        // Prefer structured message from body, fall back to HTTP status
        var msg = (data && typeof data === 'object')
          ? (data.error || data.message || data.title || ('HTTP ' + r.status))
          : (txt || ('HTTP ' + r.status));
        var err: any = new Error(String(msg));
        // Attach the full parsed body so formatWorkflowErrors can read errors[]
        err.serverData = data;
        err.httpStatus = r.status;
        throw err;
      }
      return data;
    });
  }
  function apiGet(path: string, cb: (err: any, data?: any) => void): void {
    fetch(getApiUrl(path), { headers: buildRequestHeaders() })
      .then(parseResponse)
      .then(function (d) { cb(null, d); })
      .catch(function (e) { cb(e); });
  }
  function apiGetMulti(paths: string[], cb: (err: any, data?: any) => void): void {
    var i = 0;
    function next(lastErr?: any): void {
      if (i >= paths.length) { cb(lastErr || new Error('Request failed')); return; }
      apiGet(paths[i++], function (err: any, data: any) {
        if (!err) cb(null, data); else next(err);
      });
    }
    next();
  }
  function apiPost(path: string, body: any, cb: (err: any, data?: any) => void): void {
    fetch(getApiUrl(path), { method: 'POST', headers: buildRequestHeaders(), body: JSON.stringify(body) })
      .then(parseResponse)
      .then(function (d) { cb(null, d); })
      .catch(function (e) {
        // Pass serverData as second arg so save handler can read errors[]
        cb(e, e && e.serverData ? e.serverData : null);
      });
  }

  function escHtml(v: string): string { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function deepClone<T>(v: T): T { try { return JSON.parse(JSON.stringify(v)); } catch (_e) { return v; } }

  // getStyles extracted to wf-styles.ts

})(window.MFWorkflowRF = window.MFWorkflowRF || {} as IMFWorkflowRF);

export {};
