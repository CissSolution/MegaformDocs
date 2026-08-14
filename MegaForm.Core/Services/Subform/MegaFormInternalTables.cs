using System;
using System.Collections.Generic;
using System.Linq;

namespace MegaForm.Core.Services.Subform
{
    /// <summary>
    /// [InternalTableList v20260726] The tables MegaForm creates for ITSELF.
    ///
    /// The table pickers hide platform plumbing so an admin only sees their own data. That filter
    /// used to drop everything matching `MF\_%`, which is wrong the moment an admin names a data
    /// table with the same prefix — `MF_Form10_Applications` (a real customer table holding 402
    /// application rows) vanished from the Database tab and from every "build a form from a table"
    /// flow, with no hint that a filter had eaten it. A prefix is not ownership: this explicit list
    /// is. Anything NOT in it is the admin's table and must stay visible.
    ///
    /// Keep in sync with the install scripts (MegaForm.DNN/SqlScripts, Oqtane EF model). A table
    /// missing from this list is only cosmetic — it shows up in the picker as if it were user data.
    /// </summary>
    public static class MegaFormInternalTables
    {
        public static readonly string[] Names =
        {
            "MF_AI_KB_Feedback", "MF_AI_KB_Rules", "MF_AI_KB_Templates", "MF_AI_Knowledge",
            "MF_AI_Knowledge_History", "MF_AuditLog", "MF_DesignerBlocks", "MF_ExternalBindings",
            "MF_ExternalRowMap", "MF_Files", "MF_FormAnalytics", "MF_FormLifecycleConfig",
            "MF_FormPermissions", "MF_FormRelations", "MF_Forms", "MF_FormViews",
            "MF_ModuleViewConfig", "MF_RateLimitLog", "MF_ReportDefinitions", "MF_SavedDrafts",
            "MF_SearchIndex", "MF_SubmissionFields", "MF_SubmissionHookErrors", "MF_SubmissionLinks",
            "MF_Submissions", "MF_SubmissionValueBoolean", "MF_SubmissionValueDate",
            "MF_SubmissionValueJson", "MF_SubmissionValueLongText", "MF_SubmissionValueNumber",
            "MF_SubmissionValues", "MF_SubmissionValueString", "MF_Templates", "MF_UniqueIdCounters",
            "MF_WebhookLog", "MF_WidgetData", "MF_WorkflowCases", "MF_WorkflowExecutions",
            "MF_WorkflowRuns", "MF_Workflows", "MF_WorkflowStepLog", "MF_WorkflowTaskActions",
            "MF_WorkflowTasks",
            // [Drift2026-08-13] Nine tables the Oqtane EF model creates that this list had never
            // caught up with — checked name-by-name against a live Oqtane 10.1 database (:5131).
            // Until now each one showed in the Database tab as if it were the customer's own data.
            // Note the singular/plural and Form-prefix splits between the DNN and Oqtane spellings:
            // both spellings are kept, because both databases exist in the field.
            "MF_Apps", "MF_AppQueries", "MF_ExternalBinding", "MF_FormWorkflows", "MF_Permissions",
            "MF_Views", "MF_WorkflowQueue", "MF_WorkflowTemplates", "MF_WorkflowTemplateVersions",
        };

        private static readonly HashSet<string> Set =
            new HashSet<string>(Names, StringComparer.OrdinalIgnoreCase);

        public static bool IsInternal(string tableName)
        {
            return !string.IsNullOrWhiteSpace(tableName) && Set.Contains(tableName.Trim());
        }

        /// <summary>
        /// `'MF_Forms','MF_Submissions',…` — ready to drop into a `TABLE_NAME NOT IN (…)` clause.
        /// The names are compile-time constants matching ^[A-Za-z0-9_]+$, so this cannot inject.
        /// </summary>
        public static string SqlNameList()
        {
            return string.Join(",", Names.Select(n => "'" + n + "'"));
        }
    }
}
