using Umbraco.Cms.Core.Actions;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Base class for all MegaForm <see cref="IAction"/> implementations.
    /// All MegaForm actions are permission-assignable and grouped under the
    /// "MegaForm" category so they appear together in the user group editor.
    /// </summary>
    public abstract class MegaFormActionBase : IAction
    {
        public abstract string Letter { get; }
        public abstract string Alias { get; }
        public virtual string Category => "MegaForm";
        public virtual string Icon => "icon-document";
        public virtual bool ShowInNotifier => false;
        public virtual bool CanBePermissionAssigned => true;
    }

    public class MegaFormBrowseAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.BrowseLetter;
        public override string Alias => MegaFormPermissionConstants.BrowseAlias;
        public override string Icon => "icon-folder";
    }

    public class MegaFormCreateAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.CreateLetter;
        public override string Alias => MegaFormPermissionConstants.CreateAlias;
        public override string Icon => "icon-add";
    }

    public class MegaFormEditAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.EditLetter;
        public override string Alias => MegaFormPermissionConstants.EditAlias;
        public override string Icon => "icon-edit";
    }

    public class MegaFormDeleteAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.DeleteLetter;
        public override string Alias => MegaFormPermissionConstants.DeleteAlias;
        public override string Icon => "icon-delete";
    }

    public class MegaFormViewSubmissionsAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.ViewSubmissionsLetter;
        public override string Alias => MegaFormPermissionConstants.ViewSubmissionsAlias;
        public override string Icon => "icon-list";
    }

    public class MegaFormManageSubmissionsAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.ManageSubmissionsLetter;
        public override string Alias => MegaFormPermissionConstants.ManageSubmissionsAlias;
        public override string Icon => "icon-trash";
    }

    public class MegaFormWorkflowAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.WorkflowLetter;
        public override string Alias => MegaFormPermissionConstants.WorkflowAlias;
        public override string Icon => "icon-wand";
    }

    public class MegaFormAiAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.AiLetter;
        public override string Alias => MegaFormPermissionConstants.AiAlias;
        public override string Icon => "icon-brain";
    }

    public class MegaFormAiKnowledgeAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.AiKnowledgeLetter;
        public override string Alias => MegaFormPermissionConstants.AiKnowledgeAlias;
        public override string Icon => "icon-book";
    }

    public class MegaFormReportsAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.ReportsLetter;
        public override string Alias => MegaFormPermissionConstants.ReportsAlias;
        public override string Icon => "icon-chart";
    }

    public class MegaFormLanguagesAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.LanguagesLetter;
        public override string Alias => MegaFormPermissionConstants.LanguagesAlias;
        public override string Icon => "icon-globe";
    }

    public class MegaFormTemplatesAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.TemplatesLetter;
        public override string Alias => MegaFormPermissionConstants.TemplatesAlias;
        public override string Icon => "icon-layout";
    }

    public class MegaFormManagePermissionsAction : MegaFormActionBase
    {
        public override string Letter => MegaFormPermissionConstants.ManagePermissionsLetter;
        public override string Alias => MegaFormPermissionConstants.ManagePermissionsAlias;
        public override string Icon => "icon-lock";
    }
}
