using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.UI.WebControls;
using DotNetNuke.Common;
using DotNetNuke.Entities.Controllers;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Services.Exceptions;
using MegaForm.Core.Models;
using MegaForm.DNN.Data;
using Newtonsoft.Json.Linq;

namespace MegaForm.DNN.Components
{
    public partial class ManageModule : PortalModuleBase
    {
        private const string SettingKeyFormId = "MegaForm_FormId";
        private const string SettingKeyDefaultView = "MegaForm_DefaultView";
        private const string SettingKeyCustomViewKey = "MegaForm_CustomViewKey";
        private const string SettingKeyModuleConfigured = "MegaForm_ModuleConfigured";
        private const string SettingKeyAutoQrCode = "MegaForm_EnableAutoQrCode";
        private const string SettingKeyModuleMode = "MegaForm_ModuleMode";

        private string RendererHostUrl { get; set; }
        private int RendererHostTabId { get; set; }
        private int RendererHostModuleId { get; set; }

        private sealed class PopupDisplayConfig
        {
            public string DisplayMode { get; set; }
            public string TriggerType { get; set; }
            public int DelaySeconds { get; set; }
            public int ScrollPercent { get; set; }
            public string ClickSelector { get; set; }
            public bool ShowOncePerSession { get; set; }
            public bool CloseOnOverlay { get; set; }
            public string StartAt { get; set; }
            public string EndAt { get; set; }
        }

        protected void Page_Load(object sender, EventArgs e)
        {
            try
            {
                if (!IsPostBack)
                {
                    BindForms();
                    BindViews();
                    LoadCurrentConfiguration();
                }
                else
                {
                    LoadRendererHostSettings();
                }

                txtTriggerSample.Text = BuildClickTriggerSample(txtClickSelector.Text);
                BindDashboardButtons();
                ApplyConditionalUi();
                RefreshRendererHostStatus();
            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        protected void ConfigurationSelectionChanged(object sender, EventArgs e)
        {
            txtTriggerSample.Text = BuildClickTriggerSample(txtClickSelector.Text);
            LoadRendererHostSettings();
            BindDashboardButtons();
            ApplyConditionalUi();
            RefreshRendererHostStatus();
        }

        protected void btnUpdate_Click(object sender, EventArgs e)
        {
            try
            {
                if (SaveModuleState(requireSelectedFormWhenFormsExist: true))
                    RedirectToModuleView();
            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        protected void btnGoToDashboard_Click(object sender, EventArgs e)
        {
            try
            {
                if (SaveModuleState(requireSelectedFormWhenFormsExist: false))
                    RedirectToDashboard();
            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        protected void btnCancel_Click(object sender, EventArgs e)
        {
            RedirectToModuleView();
        }

        private bool SaveModuleState(bool requireSelectedFormWhenFormsExist)
        {
            var moduleMode = GetSelectedModuleMode();
            PersistRendererHostSelection(moduleMode);

            var hasForms = HasAvailableForms();
            var selectedFormId = ParsePositiveInt(ddlForms.SelectedValue);
            var needsSelectedForm = string.Equals(moduleMode, "render", StringComparison.OrdinalIgnoreCase);

            if (hasForms && selectedFormId > 0)
            {
                var viewType = "submit";
                var existing = FormRepository.GetModuleViewConfig(ModuleId);
                var popupConfig = ReadPopupConfigFromInputs();
                var savedViewConfigJson = BuildPopupDisplayConfigForSave(existing != null ? existing.ViewConfigJson : null, popupConfig, viewType);

                var cfg = new ModuleViewConfigInfo
                {
                    ModuleId = ModuleId,
                    FormId = selectedFormId,
                    ViewType = viewType,
                    ViewConfigJson = savedViewConfigJson,
                    CssClass = existing != null ? existing.CssClass : null,
                    CacheMinutes = existing != null ? existing.CacheMinutes : 0,
                    PermissionsJson = existing != null ? existing.PermissionsJson : null
                };

                FormRepository.SaveModuleViewConfig(cfg);

                var mc = new ModuleController();
                mc.UpdateModuleSetting(ModuleId, SettingKeyFormId, selectedFormId.ToString());
                mc.UpdateModuleSetting(ModuleId, SettingKeyDefaultView, viewType == "submit" ? string.Empty : viewType);
                mc.UpdateModuleSetting(ModuleId, SettingKeyCustomViewKey, string.Empty);
                mc.UpdateModuleSetting(ModuleId, SettingKeyModuleConfigured, "true");
                mc.UpdateModuleSetting(ModuleId, SettingKeyModuleMode, moduleMode);
                mc.UpdateModuleSetting(ModuleId, SettingKeyAutoQrCode, chkEnableAutoQrCode != null && chkEnableAutoQrCode.Checked ? "true" : "false");
                return true;
            }

            if (hasForms && requireSelectedFormWhenFormsExist && needsSelectedForm)
            {
                lblMessage.Text = "Please choose a form first.";
                ApplyConditionalUi();
                RefreshRendererHostStatus();
                return false;
            }

            MarkModuleConfigured();
            return true;
        }

        private void MarkModuleConfigured()
        {
            try
            {
                var mc = new ModuleController();
                mc.UpdateModuleSetting(ModuleId, SettingKeyModuleConfigured, "true");
                mc.UpdateModuleSetting(ModuleId, SettingKeyModuleMode, GetSelectedModuleMode());
                mc.UpdateModuleSetting(ModuleId, SettingKeyAutoQrCode, chkEnableAutoQrCode != null && chkEnableAutoQrCode.Checked ? "true" : "false");
            }
            catch
            {
            }
        }

        private void BindDashboardButtons()
        {
            if (btnOpenDashboard != null)
                btnOpenDashboard.Visible = !HasAvailableForms();

            if (btnGoToDashboard != null)
                btnGoToDashboard.Visible = true;
        }

        private string BuildDashboardUrl()
        {
            var url = Globals.NavigateURL(TabId) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(url)) return "#mf-dashboard";
            var hashIndex = url.IndexOf('#');
            if (hashIndex >= 0) url = url.Substring(0, hashIndex);
            return url + "#mf-dashboard";
        }

        private void BindForms()
        {
            var forms = FormRepository.GetFormsByPortal(PortalId) ?? new List<FormInfo>();
            ddlForms.Items.Clear();
            ddlForms.Items.Add(new ListItem("-- Select a Form --", "0"));
            foreach (var form in forms)
            {
                var scope = !string.IsNullOrEmpty(form.AppScope) ? " [" + form.AppScope + "]" : string.Empty;
                var status = !string.IsNullOrEmpty(form.Status) ? form.Status : "Draft";
                var label = form.Title + scope + " (ID: " + form.FormId + ", " + status + ")";
                ddlForms.Items.Add(new ListItem(label, form.FormId.ToString()));
            }
        }

        private void BindViews()
        {
            ddlDefaultView.Items.Clear();
            ddlDefaultView.Items.Add(new ListItem("Form Renderer", "render"));
            ddlDefaultView.Items.Add(new ListItem("Renderer Host", "renderer_host"));
            ddlDefaultView.Items.Add(new ListItem("Admin Dashboard", "admin_dashboard"));
        }

        private void LoadCurrentConfiguration()
        {
            LoadRendererHostSettings();

            var moduleConfig = FormRepository.GetModuleViewConfig(ModuleId);
            var selectedFormId = moduleConfig != null && moduleConfig.FormId > 0
                ? moduleConfig.FormId
                : ParsePositiveInt(GetSetting(SettingKeyFormId, "0"));
            var selectedViewType = NormalizeModuleMode(GetSetting(SettingKeyModuleMode, IsCurrentPageRendererHost(BuildCurrentPageRendererHostUrl()) ? "renderer_host" : "render"));

            var popupConfig = ParsePopupDisplayConfig(moduleConfig != null ? moduleConfig.ViewConfigJson : null);

            if (ddlForms.Items.FindByValue(selectedFormId.ToString()) != null)
                ddlForms.SelectedValue = selectedFormId.ToString();
            if (ddlDefaultView.Items.FindByValue(selectedViewType) != null)
                ddlDefaultView.SelectedValue = selectedViewType;
            if (ddlDisplayMode.Items.FindByValue(popupConfig.DisplayMode) != null)
                ddlDisplayMode.SelectedValue = popupConfig.DisplayMode;
            if (ddlPopupTrigger.Items.FindByValue(popupConfig.TriggerType) != null)
                ddlPopupTrigger.SelectedValue = popupConfig.TriggerType;

            txtDelaySeconds.Text = popupConfig.DelaySeconds.ToString();
            txtScrollPercent.Text = popupConfig.ScrollPercent.ToString();
            txtClickSelector.Text = popupConfig.ClickSelector ?? string.Empty;
            txtStartAt.Text = popupConfig.StartAt ?? string.Empty;
            txtEndAt.Text = popupConfig.EndAt ?? string.Empty;
            chkShowOncePerSession.Checked = popupConfig.ShowOncePerSession;
            chkCloseOnOverlay.Checked = popupConfig.CloseOnOverlay;
            chkEnableAutoQrCode.Checked = GetSetting(SettingKeyAutoQrCode, "false").Equals("true", StringComparison.OrdinalIgnoreCase);
        }

        private void ApplyConditionalUi()
        {
            var hasForms = HasAvailableForms();
            var moduleMode = GetSelectedModuleMode();
            var isRenderMode = string.Equals(moduleMode, "render", StringComparison.OrdinalIgnoreCase);
            var isRendererHostMode = string.Equals(moduleMode, "renderer_host", StringComparison.OrdinalIgnoreCase);
            var isAdminDashboardMode = string.Equals(moduleMode, "admin_dashboard", StringComparison.OrdinalIgnoreCase);
            var viewType = "submit";
            var isSubmitView = true;
            var isPopupMode = string.Equals(ddlDisplayMode.SelectedValue, "popup", StringComparison.OrdinalIgnoreCase);
            var triggerType = NormalizeTriggerType(ddlPopupTrigger.SelectedValue);

            if (lblDefaultView != null)
            {
                lblDefaultView.Text = "Module mode";
                lblDefaultView.HelpText = "Choose one clear role for this module instance on this page: render one selected form, act as the portal Renderer Host for public links, or open the Admin Dashboard for administrators.";
            }

            if (lblFormSelect != null)
            {
                lblFormSelect.Text = "Select form";
                lblFormSelect.HelpText = "Shown only in Form Renderer mode. Pick the single form this module instance should render directly on this page.";
            }

            if (pnlDisplayModeNotApplicable != null)
            {
                pnlDisplayModeNotApplicable.Controls.Clear();
                pnlDisplayModeNotApplicable.Visible = true;
                var modeHtml = isRendererHostMode
                    ? "<strong>Renderer Host mode:</strong> this page becomes the public host for View, Embed, and <code>?formid=</code> links across the portal. The fixed form selector is hidden here because the requested form is chosen by the incoming public URL."
                    : (isAdminDashboardMode
                        ? "<strong>Admin Dashboard mode:</strong> administrators land directly in MegaForm Dashboard on this page. When they close the dashboard, the dock stays available for quick access on the same page."
                        : "<strong>Form Renderer mode:</strong> choose one form below, then use Display mode settings to decide whether this page shows it directly or as a popup experience.");
                pnlDisplayModeNotApplicable.Controls.Add(new System.Web.UI.LiteralControl(modeHtml));
            }

            if (chkUseThisPageAsRendererHost != null)
            {
                chkUseThisPageAsRendererHost.Checked = isRendererHostMode;
                chkUseThisPageAsRendererHost.Visible = false;
                chkUseThisPageAsRendererHost.Enabled = false;
            }

            pnlNoFormsInfo.Visible = !hasForms && !isAdminDashboardMode;
            litNoFormsInfo.Text = !hasForms
                ? "No forms exist yet in this portal. You can go to Form Dashboard now to create one, or click Close to mark this module as configured and return to the page."
                : string.Empty;

            if (btnOpenDashboard != null)
                btnOpenDashboard.Visible = !hasForms;

            pnlFormSelectRow.Visible = hasForms && isRenderMode;
            pnlDefaultViewRow.Visible = true;

            pnlDisplaySettings.Visible = hasForms && isRenderMode && isSubmitView && !isAdminDashboardMode;
            pnlPopupSettings.Visible = isPopupMode;
            pnlPopupTriggerRow.Visible = isPopupMode;
            pnlStartAtRow.Visible = isPopupMode;
            pnlEndAtRow.Visible = isPopupMode;
            pnlPopupFlagsRow.Visible = isPopupMode;
            pnlAutoQrCodeRow.Visible = hasForms && isRenderMode && isSubmitView && !isAdminDashboardMode;

            pnlDelaySecondsRow.Visible = isPopupMode && string.Equals(triggerType, "time_delay", StringComparison.OrdinalIgnoreCase);
            pnlScrollPercentRow.Visible = isPopupMode && string.Equals(triggerType, "scroll_depth", StringComparison.OrdinalIgnoreCase);
            pnlClickSelectorRow.Visible = isPopupMode && string.Equals(triggerType, "click_trigger", StringComparison.OrdinalIgnoreCase);
            pnlTriggerSampleRow.Visible = isPopupMode && string.Equals(triggerType, "click_trigger", StringComparison.OrdinalIgnoreCase);

            btnUpdate.Text = (hasForms || isAdminDashboardMode || isRendererHostMode) ? "Update" : "Close";
            btnCancel.Text = hasForms ? "Cancel" : "Back";
            if (btnGoToDashboard != null)
                btnGoToDashboard.Text = "Go To Dashboard";
        }

        private bool HasAvailableForms()
        {
            return ddlForms.Items.Cast<ListItem>().Any(i => ParsePositiveInt(i.Value) > 0);
        }

        private string GetSelectedModuleMode()
        {
            return NormalizeModuleMode(ddlDefaultView != null ? ddlDefaultView.SelectedValue : null);
        }

        private static string NormalizeModuleMode(string raw)
        {
            var value = (raw ?? string.Empty).Trim();
            if (value.Equals("renderer_host", StringComparison.OrdinalIgnoreCase) || value.Equals("renderer-host", StringComparison.OrdinalIgnoreCase) || value.Equals("rendererhost", StringComparison.OrdinalIgnoreCase))
                return "renderer_host";
            if (value.Equals("admin_dashboard", StringComparison.OrdinalIgnoreCase) || value.Equals("admin-dashboard", StringComparison.OrdinalIgnoreCase) || value.Equals("admindashboard", StringComparison.OrdinalIgnoreCase))
                return "admin_dashboard";
            return "render";
        }

        private PopupDisplayConfig ReadPopupConfigFromInputs()
        {
            return new PopupDisplayConfig
            {
                DisplayMode = string.Equals(ddlDisplayMode.SelectedValue, "popup", StringComparison.OrdinalIgnoreCase) ? "popup" : "fixed",
                TriggerType = NormalizeTriggerType(ddlPopupTrigger.SelectedValue),
                DelaySeconds = Clamp(ParsePositiveInt(txtDelaySeconds.Text), 0, 600),
                ScrollPercent = Clamp(ParsePositiveInt(txtScrollPercent.Text), 5, 95),
                ClickSelector = (txtClickSelector.Text ?? string.Empty).Trim(),
                ShowOncePerSession = chkShowOncePerSession.Checked,
                CloseOnOverlay = chkCloseOnOverlay.Checked,
                StartAt = (txtStartAt.Text ?? string.Empty).Trim(),
                EndAt = (txtEndAt.Text ?? string.Empty).Trim()
            };
        }

        private static PopupDisplayConfig ParsePopupDisplayConfig(string raw)
        {
            var cfg = new PopupDisplayConfig
            {
                DisplayMode = "fixed",
                TriggerType = "time_delay",
                DelaySeconds = 5,
                ScrollPercent = 50,
                ClickSelector = string.Empty,
                ShowOncePerSession = true,
                CloseOnOverlay = true,
                StartAt = string.Empty,
                EndAt = string.Empty
            };

            if (string.IsNullOrWhiteSpace(raw)) return cfg;

            try
            {
                var obj = JObject.Parse(raw);
                cfg.DisplayMode = string.Equals((string)obj["displayMode"] ?? (string)obj["DisplayMode"], "popup", StringComparison.OrdinalIgnoreCase)
                    ? "popup"
                    : "fixed";

                var popup = obj["popup"] as JObject ?? obj["Popup"] as JObject ?? new JObject();
                cfg.TriggerType = NormalizeTriggerType((string)popup["triggerType"] ?? (string)popup["TriggerType"]);
                cfg.DelaySeconds = Clamp(ParsePositiveInt((string)popup["delaySeconds"] ?? (string)popup["DelaySeconds"]), 0, 600, 5);
                cfg.ScrollPercent = Clamp(ParsePositiveInt((string)popup["scrollPercent"] ?? (string)popup["ScrollPercent"]), 5, 95, 50);
                cfg.ClickSelector = ((string)popup["clickSelector"] ?? (string)popup["ClickSelector"] ?? string.Empty).Trim();
                cfg.ShowOncePerSession = ReadBoolean(popup, "showOncePerSession", "ShowOncePerSession", true);
                cfg.CloseOnOverlay = ReadBoolean(popup, "closeOnOverlay", "CloseOnOverlay", true);
                cfg.StartAt = ((string)popup["startAt"] ?? (string)popup["StartAt"] ?? string.Empty).Trim();
                cfg.EndAt = ((string)popup["endAt"] ?? (string)popup["EndAt"] ?? string.Empty).Trim();
            }
            catch
            {
                return cfg;
            }

            return cfg;
        }

        private static bool ReadBoolean(JObject obj, string camelKey, string pascalKey, bool defaultValue)
        {
            var token = obj[camelKey] ?? obj[pascalKey];
            if (token == null) return defaultValue;
            var text = token.ToString();
            bool parsed;
            return bool.TryParse(text, out parsed) ? parsed : defaultValue;
        }

        private static string BuildPopupDisplayConfigForSave(string existingRaw, PopupDisplayConfig nextCfg, string viewType)
        {
            var baseObj = ParseObject(existingRaw);
            var normalizedViewType = NormalizeViewType(viewType);
            var effectiveDisplayMode = normalizedViewType == "submit" ? nextCfg.DisplayMode : "fixed";
            var effectiveTriggerType = effectiveDisplayMode == "popup" ? nextCfg.TriggerType : "time_delay";

            baseObj["displayMode"] = effectiveDisplayMode;
            baseObj["popup"] = new JObject
            {
                ["triggerType"] = effectiveTriggerType,
                ["delaySeconds"] = nextCfg.DelaySeconds,
                ["scrollPercent"] = nextCfg.ScrollPercent,
                ["clickSelector"] = nextCfg.ClickSelector ?? string.Empty,
                ["borderMode"] = "transparent_popup",
                ["showOncePerSession"] = nextCfg.ShowOncePerSession,
                ["closeOnOverlay"] = nextCfg.CloseOnOverlay,
                ["startAt"] = nextCfg.StartAt ?? string.Empty,
                ["endAt"] = nextCfg.EndAt ?? string.Empty
            };
            return baseObj.ToString(Newtonsoft.Json.Formatting.None);
        }

        private static JObject ParseObject(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return new JObject();
            try
            {
                return JObject.Parse(raw);
            }
            catch
            {
                return new JObject();
            }
        }

        private void LoadRendererHostSettings()
        {
            RendererHostUrl = NormalizeRendererHostUrl(ReadPortalSetting("RendererHostUrl", string.Empty));
            RendererHostTabId = ParsePositiveInt(ReadPortalSetting("RendererHostTabId", "0"));
            RendererHostModuleId = ParsePositiveInt(ReadPortalSetting("RendererHostModuleId", "0"));

            var currentUrl = BuildCurrentPageRendererHostUrl();
            if (!IsPostBack)
                chkUseThisPageAsRendererHost.Checked = IsCurrentPageRendererHost(currentUrl);
        }

        private void RefreshRendererHostStatus()
        {
            var currentUrl = BuildCurrentPageRendererHostUrl();
            var isCurrentPage = IsCurrentPageRendererHost(currentUrl);
            var wantsCurrentPage = string.Equals(GetSelectedModuleMode(), "renderer_host", StringComparison.OrdinalIgnoreCase);

            if (litRendererHostStatus == null) return;

            if (wantsCurrentPage && !isCurrentPage)
            {
                litRendererHostStatus.Text = "After you click Update or Go To Dashboard, this page will become the portal's public Renderer Host for View, Embed, and <code>?formid=</code> links.";
                return;
            }

            if (!wantsCurrentPage && isCurrentPage)
            {
                litRendererHostStatus.Text = "This page is currently the portal Renderer Host. Switch Module mode and click Update if you want to move public MegaForm links back to another page or unset this host.";
                return;
            }

            if (isCurrentPage)
                litRendererHostStatus.Text = "This page is currently the portal Renderer Host for public View and Embed links.";
            else if (!string.IsNullOrWhiteSpace(RendererHostUrl))
                litRendererHostStatus.Text = "Renderer Host is already set on another page: " + Server.HtmlEncode(RendererHostUrl);
            else
                litRendererHostStatus.Text = "Renderer Host is not set yet. Choose the page that should handle public MegaForm links for this portal.";
        }

        private void PersistRendererHostSelection(string moduleMode)
        {
            var currentUrl = BuildCurrentPageRendererHostUrl();
            var isCurrentPage = IsCurrentPageRendererHost(currentUrl);
            var wantsCurrentPage = string.Equals(NormalizeModuleMode(moduleMode), "renderer_host", StringComparison.OrdinalIgnoreCase);

            if (wantsCurrentPage)
            {
                SetPortalSetting("RendererHostUrl", currentUrl);
                SetPortalSetting("RendererHostTabId", TabId > 0 ? TabId.ToString() : string.Empty);
                SetPortalSetting("RendererHostModuleId", ModuleId > 0 ? ModuleId.ToString() : string.Empty);
            }
            else if (isCurrentPage)
            {
                SetPortalSetting("RendererHostUrl", string.Empty);
                SetPortalSetting("RendererHostTabId", string.Empty);
                SetPortalSetting("RendererHostModuleId", string.Empty);
            }
        }

        private bool IsCurrentPageRendererHost(string currentUrl)
        {
            if (!string.IsNullOrWhiteSpace(RendererHostUrl) && string.Equals(RendererHostUrl, currentUrl, StringComparison.OrdinalIgnoreCase))
                return true;
            return RendererHostTabId > 0 && RendererHostTabId == TabId;
        }

        private string BuildCurrentPageRendererHostUrl()
        {
            return NormalizeRendererHostUrl(Globals.NavigateURL(TabId));
        }

        private void RedirectToModuleView()
        {
            var url = Globals.NavigateURL(TabId);
            Response.Redirect(url, false);
            Context.ApplicationInstance.CompleteRequest();
        }

        private void RedirectToDashboard()
        {
            var url = BuildDashboardUrl();
            Response.Redirect(url, false);
            Context.ApplicationInstance.CompleteRequest();
        }

        private string ReadPortalSetting(string key, string defaultValue)
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
            catch
            {
            }
        }

        private string GetSetting(string key, string defaultValue)
        {
            return Settings.Contains(key) ? Convert.ToString(Settings[key]) : defaultValue;
        }

        private static string NormalizeRendererHostUrl(string urlLike)
        {
            var raw = (urlLike ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            try
            {
                Uri absolute;
                var hasAbsolute = Uri.TryCreate(raw, UriKind.Absolute, out absolute);
                var uri = hasAbsolute ? absolute : new Uri(new Uri("http://localhost"), raw);
                var query = HttpUtility.ParseQueryString(uri.Query ?? string.Empty);
                query.Remove("formId");
                query.Remove("formid");
                query.Remove("FormId");
                query.Remove("embed");
                query.Remove("configure");
                query.Remove("new");
                var path = uri.AbsolutePath;
                var nextQuery = query.ToString();
                var hash = string.Empty;
                if (!string.IsNullOrWhiteSpace(uri.Fragment) && !uri.Fragment.StartsWith("#mf-", StringComparison.OrdinalIgnoreCase))
                    hash = uri.Fragment;
                var result = path + (string.IsNullOrWhiteSpace(nextQuery) ? string.Empty : "?" + nextQuery) + hash;
                if (hasAbsolute && !string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase))
                    result = uri.GetLeftPart(UriPartial.Authority) + result;
                return result;
            }
            catch
            {
                return raw;
            }
        }

        private static string NormalizeViewType(string value)
        {
            var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
            if (normalized == "list" || normalized == "card" || normalized == "detail") return normalized;
            return "submit";
        }

        private static string NormalizeTriggerType(string value)
        {
            var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
            if (normalized == "scroll_depth" || normalized == "click_trigger") return normalized;
            return "time_delay";
        }

        private static int ParsePositiveInt(string raw)
        {
            int value;
            return int.TryParse(raw, out value) && value > 0 ? value : 0;
        }

        private static int Clamp(int value, int min, int max)
        {
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        private static int Clamp(int value, int min, int max, int fallback)
        {
            return value > 0 ? Clamp(value, min, max) : fallback;
        }

        private static string BuildClickTriggerSample(string selector)
        {
            var value = (selector ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value)) value = ".open-megaform-popup";

            if (value.StartsWith("#", StringComparison.Ordinal))
            {
                var id = CleanSelectorToken(value.Substring(1), "open-form");
                return "<button type=\"button\" id=\"" + id + "\">Open form popup</button>";
            }

            if (value.StartsWith(".", StringComparison.Ordinal))
            {
                var cssClass = CleanSelectorToken(value.Substring(1), "open-megaform-popup");
                return "<button type=\"button\" class=\"" + cssClass + "\">Open form popup</button>";
            }

            if (value.StartsWith("[", StringComparison.Ordinal) && value.EndsWith("]", StringComparison.Ordinal))
            {
                var content = value.Substring(1, value.Length - 2);
                var pieces = content.Split(new[] { '=' }, 2);
                var attrName = CleanAttributeName(pieces.Length > 0 ? pieces[0] : string.Empty, "data-megaform-trigger");
                var attrValue = pieces.Length > 1 ? pieces[1].Trim().Trim('\'', '"') : "open";
                if (string.IsNullOrWhiteSpace(attrValue)) attrValue = "open";
                return "<button type=\"button\" " + attrName + "=\"" + HttpUtility.HtmlAttributeEncode(attrValue) + "\">Open form popup</button>";
            }

            return "<button type=\"button\" class=\"open-megaform-popup\">Open form popup</button>";
        }

        private static string CleanSelectorToken(string value, string fallback)
        {
            var chars = (value ?? string.Empty)
                .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_')
                .ToArray();
            var cleaned = new string(chars);
            return string.IsNullOrWhiteSpace(cleaned) ? fallback : cleaned;
        }

        private static string CleanAttributeName(string value, string fallback)
        {
            var chars = (value ?? string.Empty)
                .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' || c == ':')
                .ToArray();
            var cleaned = new string(chars);
            return string.IsNullOrWhiteSpace(cleaned) ? fallback : cleaned;
        }
    }
}
