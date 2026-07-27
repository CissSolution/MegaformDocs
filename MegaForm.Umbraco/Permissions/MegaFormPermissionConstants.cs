namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Permission identifiers and context identifiers for MegaForm in Umbraco.
    /// Umbraco 14+ stores permissions as opaque strings, so we use namespaced
    /// values to avoid collisions with built-in actions (e.g. "Umb.Document.Read").
    /// </summary>
    public static class MegaFormPermissionConstants
    {
        /// <summary>
        /// Custom granular permission context key used for per-form permissions.
        /// </summary>
        public const string GranularContext = "MegaForm";

        /// <summary>
        /// Section alias. A user must have this section in at least one group
        /// before any MegaForm permission is evaluated.
        /// </summary>
        public const string SectionAlias = "MegaForm.Section";

        // ── Default (coarse) action identifiers ──

        /// <summary>Browse / list forms and open the MegaForm section.</summary>
        public const string BrowseLetter = "MegaForm.Form.Browse";

        /// <summary>Create new forms.</summary>
        public const string CreateLetter = "MegaForm.Form.Create";

        /// <summary>Edit existing forms.</summary>
        public const string EditLetter = "MegaForm.Form.Edit";

        /// <summary>Delete forms.</summary>
        public const string DeleteLetter = "MegaForm.Form.Delete";

        /// <summary>View submissions.</summary>
        public const string ViewSubmissionsLetter = "MegaForm.Submission.Read";

        /// <summary>Delete / manage submissions.</summary>
        public const string ManageSubmissionsLetter = "MegaForm.Submission.Manage";

        /// <summary>Manage workflows (save workflow definition).</summary>
        public const string WorkflowLetter = "MegaForm.Workflow.Manage";

        /// <summary>Use AI assistant / AI tools.</summary>
        public const string AiLetter = "MegaForm.Ai.Use";

        /// <summary>Manage AI knowledge base.</summary>
        public const string AiKnowledgeLetter = "MegaForm.AiKnowledge.Manage";

        /// <summary>View reports and analytics.</summary>
        public const string ReportsLetter = "MegaForm.Reports.Read";

        /// <summary>Manage language packs / i18n.</summary>
        public const string LanguagesLetter = "MegaForm.Language.Manage";

        /// <summary>Import/export templates and use the template library.</summary>
        public const string TemplatesLetter = "MegaForm.Template.Manage";

        /// <summary>Manage granular form permissions (assign user-group permissions per form).</summary>
        public const string ManagePermissionsLetter = "MegaForm.Security.ManagePermissions";

        // ── Aliases ──

        public const string BrowseAlias = "megaFormBrowse";
        public const string CreateAlias = "megaFormCreate";
        public const string EditAlias = "megaFormEdit";
        public const string DeleteAlias = "megaFormDelete";
        public const string ViewSubmissionsAlias = "megaFormViewSubmissions";
        public const string ManageSubmissionsAlias = "megaFormManageSubmissions";
        public const string WorkflowAlias = "megaFormWorkflow";
        public const string AiAlias = "megaFormAi";
        public const string AiKnowledgeAlias = "megaFormAiKnowledge";
        public const string ReportsAlias = "megaFormReports";
        public const string LanguagesAlias = "megaFormLanguages";
        public const string TemplatesAlias = "megaFormTemplates";
        public const string ManagePermissionsAlias = "megaFormManagePermissions";
    }
}
