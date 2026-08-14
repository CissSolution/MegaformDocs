/**
 * MegaForm Builder — DB tab table grouping.
 *
 * [DbPaneGrouping v20260813] The DB tab used to render every base table on the connection as one
 * run-on list. On a stock Oqtane site that is 74 rows / 148 buttons / 5.3 screens of scroll, and
 * NONE of them belong to the customer — 36 are Oqtane's own, 37 are MegaForm's. Owner could not
 * follow it. Rows are now bucketed so the customer's own tables sit at the top, on their own, and
 * the plumbing collapses out of the way.
 *
 * Classification order matters:
 *   1. MegaForm's own tables — matched by an EXPLICIT NAME LIST, never by the `MF_` prefix.
 *      A prefix is not ownership: a customer table called `MF_Form10_Applications` (a real one,
 *      402 rows) is the admin's data and must land in "Your tables". Same rule, and the same
 *      reason, as MegaForm.Core/Services/Subform/MegaFormInternalTables.cs — keep the two lists
 *      in sync; a name missing here only means the row shows up as customer data, which is the
 *      safe direction to be wrong in.
 *   2. Platform plumbing — Oqtane core / DNN core / ASP.NET Identity.
 *   3. Everything else is the customer's.
 */

export type TableGroupKey = 'mine' | 'megaform' | 'platform';

/** MegaForm's own tables. Mirrors MegaFormInternalTables.Names (C#), including the Oqtane-EF
 *  spellings that list had drifted away from (MF_Apps, MF_AppQueries, MF_Permissions, MF_Views,
 *  MF_FormWorkflows, MF_WorkflowQueue, MF_WorkflowTemplates, MF_WorkflowTemplateVersions,
 *  MF_ExternalBinding). */
const MEGAFORM_TABLES = new Set([
  'mf_ai_kb_feedback', 'mf_ai_kb_rules', 'mf_ai_kb_templates', 'mf_ai_knowledge',
  'mf_ai_knowledge_history', 'mf_appqueries', 'mf_apps', 'mf_auditlog', 'mf_designerblocks',
  'mf_externalbinding', 'mf_externalbindings', 'mf_externalrowmap', 'mf_files',
  'mf_formanalytics', 'mf_formlifecycleconfig', 'mf_formpermissions', 'mf_formrelations',
  'mf_forms', 'mf_formviews', 'mf_formworkflows', 'mf_moduleviewconfig', 'mf_permissions',
  'mf_ratelimitlog', 'mf_reportdefinitions', 'mf_saveddrafts', 'mf_searchindex',
  'mf_submissionfields', 'mf_submissionhookerrors', 'mf_submissionlinks', 'mf_submissions',
  'mf_submissionvalueboolean', 'mf_submissionvaluedate', 'mf_submissionvaluejson',
  'mf_submissionvaluelongtext', 'mf_submissionvaluenumber', 'mf_submissionvalues',
  'mf_submissionvaluestring', 'mf_templates', 'mf_uniqueidcounters', 'mf_views',
  'mf_webhooklog', 'mf_widgetdata', 'mf_workflowcases', 'mf_workflowexecutions',
  'mf_workflowqueue', 'mf_workflowruns', 'mf_workflows', 'mf_workflowsteplog',
  'mf_workflowtaskactions', 'mf_workflowtasks', 'mf_workflowtemplates',
  'mf_workflowtemplateversions',
]);

/** Oqtane core tables (10.x), exact names. Oqtane's own names are plain English nouns — `User`,
 *  `Site`, `Theme` — so prefix matching would eat customer tables. Exact only. */
const PLATFORM_TABLES = new Set([
  '__efmigrationshistory',
  // Oqtane core
  'alias', 'file', 'folder', 'htmltext', 'job', 'joblog', 'language', 'log', 'module',
  'moduledefinition', 'notification', 'page', 'pagemodule', 'permission', 'profile', 'role',
  'searchcontent', 'searchcontentproperty', 'searchcontentword', 'searchword', 'setting',
  'site', 'sitegroup', 'sitegroupmember', 'sitetask', 'tenant', 'theme', 'urlmapping',
  'user', 'userrole', 'visitor',
  // DNN core (the DB tab is shared with the DNN build; its server-side blacklist already hides
  // most of these, but the pane must group correctly when an admin ticks "Show system tables").
  'portals', 'portalsettings', 'portalalias', 'tabs', 'tabsettings', 'tabmodules', 'modules',
  'modulesettings', 'moduledefinitions', 'users', 'userportals', 'userroles', 'roles',
  'rolegroups', 'hostsettings', 'eventlog', 'eventlogtypes', 'schedule', 'schedulehistory',
  'files', 'folders', 'folderpermission', 'modulepermission', 'tabpermission',
  'desktopmodules', 'packages', 'languages', 'localizations', 'lists', 'skins', 'skinpackages',
  'contentitems', 'contenttypes', 'vocabularies', 'terms', 'urlmappings', 'sitelog',
]);

/** Prefixes that are always platform plumbing regardless of platform. */
const PLATFORM_PREFIXES = ['aspnet_', 'aspnetuser', 'aspnetrole', 'dnn_', 'personabar', 'coremessaging_'];

export function classifyTable(name: string): TableGroupKey {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return 'mine';
  if (MEGAFORM_TABLES.has(n)) return 'megaform';
  if (PLATFORM_TABLES.has(n)) return 'platform';
  for (let i = 0; i < PLATFORM_PREFIXES.length; i++) {
    if (n.indexOf(PLATFORM_PREFIXES[i]) === 0) return 'platform';
  }
  return 'mine';
}

/** Render order. "Your tables" first and open; the plumbing collapses below it. */
export const GROUP_ORDER: TableGroupKey[] = ['mine', 'megaform', 'platform'];
