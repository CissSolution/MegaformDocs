using System;
using System.Linq;
using System.Web;
using System.Web.UI.WebControls;
using DotNetNuke.Common;
using DotNetNuke.Entities.Controllers;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Services.Exceptions;
using MegaForm.DNN.Data;

namespace MegaForm.DNN.Components
{
    public partial class FormSettings : ModuleSettingsBase
    {
        private const string SettingKey_FormId = "MegaForm_FormId";
        private const string SettingKey_DefaultView = "MegaForm_DefaultView";
        private const string SettingKey_CustomViewKey = "MegaForm_CustomViewKey";
        private const string SettingKey_AppScope = "MegaForm_AppScope";
        private const string SettingKey_BusChannel = "MegaForm_BusChannel";
        private const string SettingKey_DetailModuleId = "MegaForm_DetailModuleId";


        #region Base Method Implementations

        public override void LoadSettings()
        {
            try
            {
                if (!IsPostBack)
                {
                    var forms = FormRepository.ListForms(PortalId);
                    ddlForms.Items.Clear();
                    ddlForms.Items.Add(new ListItem("-- Select a Form --", "0"));
                    foreach (var form in forms)
                    {
                        string scope = !string.IsNullOrEmpty(form.AppScope) ? " [" + form.AppScope + "]" : "";
                        string label = form.Title + scope + " (ID: " + form.FormId + ", " + form.Status + ")";
                        ddlForms.Items.Add(new ListItem(label, form.FormId.ToString()));
                    }

                    string savedFormId = GetSetting(SettingKey_FormId, "0");
                    if (ddlForms.Items.FindByValue(savedFormId) != null)
                        ddlForms.SelectedValue = savedFormId;

                    ddlDefaultView.Items.Clear();
                    ddlDefaultView.Items.Add(new ListItem("Form (Submit)", "edit"));
                    ddlDefaultView.Items.Add(new ListItem("List View (Table)", "list"));
                    ddlDefaultView.Items.Add(new ListItem("Card View (Grid)", "card"));
                    ddlDefaultView.Items.Add(new ListItem("Detail View (Single Record)", "detail"));

                    string savedView = GetSetting(SettingKey_DefaultView, "edit");
                    if (ddlDefaultView.Items.FindByValue(savedView) != null)
                        ddlDefaultView.SelectedValue = savedView;

                    LoadCustomViews(savedFormId);
                    string savedCustomView = GetSetting(SettingKey_CustomViewKey, "");
                    if (!string.IsNullOrEmpty(savedCustomView) &&
                        ddlCustomView.Items.FindByValue(savedCustomView) != null)
                        ddlCustomView.SelectedValue = savedCustomView;

                    LoadAppScopes();
                    string savedScope = GetSetting(SettingKey_AppScope, "");
                    if (ddlAppScope.Items.FindByValue(savedScope) != null)
                        ddlAppScope.SelectedValue = savedScope;

                    txtBusChannel.Text = GetSetting(SettingKey_BusChannel, "");
                    txtDetailModuleId.Text = GetSetting(SettingKey_DetailModuleId, "");
                    lnkCreateNew.NavigateUrl = EditUrl("new", "1", "Edit");

                }
            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        public override void UpdateSettings()
        {
            try
            {
                var mc = new ModuleController();
                mc.UpdateModuleSetting(ModuleId, SettingKey_FormId, ddlForms.SelectedValue);
                mc.UpdateModuleSetting(ModuleId, SettingKey_DefaultView, ddlDefaultView.SelectedValue);
                mc.UpdateModuleSetting(ModuleId, SettingKey_CustomViewKey, ddlCustomView.SelectedValue);

                string scope = !string.IsNullOrWhiteSpace(txtNewScope.Text)
                    ? txtNewScope.Text.Trim().ToLowerInvariant().Replace(" ", "-")
                    : ddlAppScope.SelectedValue;
                mc.UpdateModuleSetting(ModuleId, SettingKey_AppScope, scope);

                int formId;
                if (int.TryParse(ddlForms.SelectedValue, out formId) && formId > 0 && !string.IsNullOrEmpty(scope))
                {
                    FormRepository.SetFormAppScope(formId, scope);
                }

                mc.UpdateModuleSetting(ModuleId, SettingKey_BusChannel,
                    !string.IsNullOrWhiteSpace(txtBusChannel.Text) ? txtBusChannel.Text.Trim() : scope);
                mc.UpdateModuleSetting(ModuleId, SettingKey_DetailModuleId,
                    txtDetailModuleId.Text.Trim());

            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        #endregion

        protected void ddlForms_Changed(object sender, EventArgs e)
        {
            LoadCustomViews(ddlForms.SelectedValue);
        }

        private void LoadCustomViews(string formIdStr)
        {
            ddlCustomView.Items.Clear();
            ddlCustomView.Items.Add(new ListItem("(Use default)", ""));
            int formId;
            if (!string.IsNullOrEmpty(formIdStr) && int.TryParse(formIdStr, out formId) && formId > 0)
            {
                try
                {
                    var views = FormRepository.GetFormViews(formId);
                    if (views != null && views.Count > 0)
                    {
                        divCustomViews.Visible = true;
                        foreach (var v in views)
                        {
                            string label = v.ViewName + " (" + v.ViewType + ")";
                            if (v.IsDefault) label += " ★";
                            ddlCustomView.Items.Add(new ListItem(label, v.ViewKey));
                        }
                    }
                    else { divCustomViews.Visible = false; }
                }
                catch { divCustomViews.Visible = false; }
            }
            else { divCustomViews.Visible = false; }
        }

        private void LoadAppScopes()
        {
            ddlAppScope.Items.Clear();
            ddlAppScope.Items.Add(new ListItem("(None - standalone form)", ""));
            ddlAppScope.Items.Add(new ListItem("articles", "articles"));
            ddlAppScope.Items.Add(new ListItem("forum", "forum"));
            ddlAppScope.Items.Add(new ListItem("helpdesk", "helpdesk"));
            ddlAppScope.Items.Add(new ListItem("qa", "qa"));
            ddlAppScope.Items.Add(new ListItem("crm", "crm"));
            ddlAppScope.Items.Add(new ListItem("projects", "projects"));
            try
            {
                var existing = FormRepository.GetAppScopes(PortalId);
                foreach (var s in existing)
                {
                    if (ddlAppScope.Items.FindByValue(s) == null)
                        ddlAppScope.Items.Add(new ListItem(s, s));
                }
            }
            catch { }
        }


        private string ReadPortalSetting(string key, string defaultValue = "")
        {
            var fullKey = "MegaForm_" + key;
            try
            {
                return PortalController.GetPortalSetting(fullKey, PortalId, defaultValue) ?? defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private void SetPortalSetting(string key, string value)
        {
            try
            {
                PortalController.UpdatePortalSetting(PortalId, "MegaForm_" + key, value ?? string.Empty, true);
            }
            catch { }
        }

        private static int ParsePositiveInt(string raw)
        {
            int value;
            return int.TryParse(raw, out value) && value > 0 ? value : 0;
        }

        private string GetSetting(string key, string defaultValue)
        {
            return Settings.Contains(key) ? Settings[key].ToString() : defaultValue;
        }
    }
}
