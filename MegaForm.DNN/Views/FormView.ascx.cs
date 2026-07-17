using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Entities.Modules.Actions;
using DotNetNuke.Entities.Controllers;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Security;
using DotNetNuke.Services.Exceptions;
using DotNetNuke.Web.Client.ClientResourceManagement;
using MegaForm.DNN.Data;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using MegaForm.Core.ViewModes;
using MegaForm.DNN.ViewModels;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.DNN.Components
{
    public partial class FormView : PortalModuleBase, IActionable
    {
        private const string SettingKeyAutoQrCode = "MegaForm_EnableAutoQrCode";
        private const string SettingKeyModuleMode = "MegaForm_ModuleMode";

        public FormRenderViewModel ViewModel { get; set; }

        /// <summary>URL to return to when exiting the builder (strips configure=1).</summary>
        public string ReturnUrl { get; private set; }

        public string ConfigureUrl { get; private set; }

        public string DashboardJson { get; private set; } = "{}";

        public bool SuppressInlineAdminEmptyState { get; private set; }
        public bool SuppressInlineAdminShell { get; private set; }
        public bool IsUnconfiguredAdminModuleState { get; private set; }
        public bool ShowDropSafeAdminDock { get; private set; }

        public bool HasDevLock { get; private set; }
        public bool HasDemoLock { get; private set; }

        public string ThemeDesignerHostHtml { get; private set; } = string.Empty;
        // [RendererHostRetired v20260714-01] RendererHostUrl/TabId/ModuleId + IsCurrentRendererHostPage
        // are gone. The concept (one portal page hosting every public ?formid= link) was retired on
        // Oqtane first; DNN links now use the module's own clean tab path. The ASCX still binds these
        // names in a couple of legacy spots, so they stay as inert, always-empty stubs until that
        // markup is cleaned up — no reader consults them any more.
        public string RendererHostUrl { get { return string.Empty; } }
        public int RendererHostTabId { get { return 0; } }
        public int RendererHostModuleId { get { return 0; } }
        public bool IsCurrentRendererHostPage { get { return false; } }
        public int RequestedFormId { get; private set; }

        protected string GetTemplateContextJson()
        {
            var vm = ViewModel;
            var payload = new
            {
                form = new
                {
                    id = vm != null ? vm.FormId : 0,
                    title = vm != null ? (vm.Title ?? string.Empty) : string.Empty,
                    status = vm != null ? (vm.FormStatus ?? string.Empty) : string.Empty
                },
                module = new
                {
                    id = ModuleId,
                    tabId = TabId,
                    platform = "dnn",
                    viewMode = vm != null ? (vm.ActiveViewType ?? "form") : "form",
                    rendererHostUrl = RendererHostUrl ?? string.Empty,
                    queryKey = vm != null ? (vm.ActiveQueryKey ?? string.Empty) : string.Empty
                },
                user = new
                {
                    id = UserInfo != null ? UserInfo.UserID : 0,
                    userName = UserInfo != null ? (UserInfo.Username ?? string.Empty) : string.Empty,
                    displayName = UserInfo != null ? (UserInfo.DisplayName ?? string.Empty) : string.Empty,
                    isAuthenticated = UserInfo != null && UserInfo.UserID > 0,
                    isAdmin = UserInfo != null && (UserInfo.IsInRole("Administrators") || UserInfo.IsSuperUser),
                    isSuperUser = UserInfo != null && UserInfo.IsSuperUser,
                    roles = UserInfo != null ? (UserInfo.Roles ?? new string[0]) : new string[0]
                }
            };
            return JsonConvert.SerializeObject(payload);
        }

        protected string GetActiveSubmissionViewFields(string viewType)
        {
            var normalized = FormViewSelector.NormalizeViewType(viewType);
            var key = string.Equals(normalized, "card", StringComparison.OrdinalIgnoreCase) ? "cardFields" : "listFields";
            return ReadViewConfigString(ViewModel != null ? ViewModel.ActiveViewConfigJson : null, key);
        }

        protected string GetActiveSubmissionViewTemplate(string viewType)
        {
            var normalized = FormViewSelector.NormalizeViewType(viewType);
            var key = string.Equals(normalized, "card", StringComparison.OrdinalIgnoreCase) ? "cardTemplate" : "listTemplate";
            return ReadViewConfigString(ViewModel != null ? ViewModel.ActiveViewConfigJson : null, key);
        }

        private static string BuildResolvedViewConfigJson(FormViewInfo view)
        {
            if (view == null) return "{}";
            var obj = ParseViewConfigObject(view.ConfigJson);
            obj["queryKey"] = view.QueryKey ?? string.Empty;
            var normalized = FormViewSelector.NormalizeViewType(view.ViewType);
            if (!string.IsNullOrWhiteSpace(view.CustomHtml))
            {
                if (string.Equals(normalized, "list", StringComparison.OrdinalIgnoreCase))
                {
                    obj["listTemplate"] = view.CustomHtml;
                }
                else if (string.Equals(normalized, "card", StringComparison.OrdinalIgnoreCase))
                {
                    obj["cardTemplate"] = view.CustomHtml;
                }
            }
            return obj.ToString(Formatting.None);
        }

        private static string ReadViewConfigString(string rawJson, string camelKey)
        {
            var obj = ParseViewConfigObject(rawJson);
            var pascalKey = string.IsNullOrEmpty(camelKey)
                ? string.Empty
                : char.ToUpperInvariant(camelKey[0]) + camelKey.Substring(1);
            var token = obj[camelKey] ?? obj[pascalKey];
            if (token == null) return string.Empty;
            return token.Type == JTokenType.String
                ? ((string)token ?? string.Empty)
                : token.ToString(Formatting.None);
        }

        private static JObject ParseViewConfigObject(string rawJson)
        {
            if (string.IsNullOrWhiteSpace(rawJson)) return new JObject();
            try { return JObject.Parse(rawJson); } catch { return new JObject(); }
        }

        private string ReadPortalSetting(string key, string defaultValue = "")
        {
            var fullKey = "MegaForm_" + key;
            try
            {
                // Renderer Host for MegaForm must come from portal-scoped settings,
                // not host-level globals, so each portal can control its own public host page.
                return PortalController.GetPortalSetting(fullKey, PortalId, defaultValue) ?? defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private static int ParsePositiveInt(string raw)
        {
            int value;
            return int.TryParse(raw, out value) && value > 0 ? value : 0;
        }

        /// <summary>
        /// Module modes: render | admin_dashboard | myinbox.
        /// [RendererHostRetired v20260714-01] "renderer_host" is gone (Oqtane dropped the concept
        /// first). A module still carrying the old setting degrades to "render" — no migration
        /// needed. [DnnInboxMode v20260714-01] "myinbox" pins the module to the My Inbox surface,
        /// mirroring Oqtane's ModuleRole=myinbox. Keep this in step with the twin in
        /// ManageModule.ascx.cs — a mode known to only one of the two silently degrades to render.
        /// </summary>
        private static string NormalizeModuleMode(string raw)
        {
            var value = (raw ?? string.Empty).Trim();
            if (value.Equals("admin_dashboard", StringComparison.OrdinalIgnoreCase) || value.Equals("admin-dashboard", StringComparison.OrdinalIgnoreCase) || value.Equals("admindashboard", StringComparison.OrdinalIgnoreCase))
                return "admin_dashboard";
            if (value.Equals("myinbox", StringComparison.OrdinalIgnoreCase) || value.Equals("my_inbox", StringComparison.OrdinalIgnoreCase) || value.Equals("my-inbox", StringComparison.OrdinalIgnoreCase) || value.Equals("inbox", StringComparison.OrdinalIgnoreCase))
                return "myinbox";
            return "render";
        }

        private bool ShouldSuppressInlineAdminEmptyState(FormRenderViewModel vm)
        {
            // During transient add/drop, render nothing at all.
            // Do not show the MegaForm placeholder box and do not show the standard no-form paragraph.
            return IsUnconfiguredAdminModuleState;
        }

        private bool ShouldSuppressInlineAdminShell(FormRenderViewModel vm)
        {
            // Suppress only during DNN's ajax add/drop partial. The full shell loads heavy
            // dashboard/builder assets and can disturb the follow-up MoveModule request there.
            // On a normal page render, even an unconfigured module should show admin buttons
            // immediately so the user does not need Manage Module -> Save just to begin.
            return IsUnconfiguredAdminModuleState;
        }

        private bool IsDnnAjaxPartialRender()
        {
            try
            {
                var req = Request;
                if (req == null) return false;

                var xrw = req.Headers["X-Requested-With"];
                if (string.Equals(xrw, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase))
                    return true;

                var microsoftAjax = req.Headers["X-MicrosoftAjax"];
                if (!string.IsNullOrWhiteSpace(microsoftAjax))
                    return true;

                var asyncPost = req.Form["__ASYNCPOST"] ?? req.QueryString["__ASYNCPOST"];
                if (string.Equals(asyncPost, "true", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            catch { }

            return false;
        }

        private bool HasStableModuleSelectionSettings(FormRenderViewModel vm)
        {
            // IMPORTANT:
            // A module counts as "configured" only when the selection/view state has been
            // persisted for this module instance via Manage module.
            //
            // Do NOT treat transient runtime values as stable config:
            // - vm.FormId can be populated from request/shell state
            // - RequestedFormId can come from query string / renderer-host routing
            //
            // The dock/admin shell must stay hidden on a newly dropped module until the admin
            // explicitly opens Manage module and clicks Update.

            try
            {
                var moduleConfig = FormRepository.GetModuleViewConfig(ModuleId);
                if (moduleConfig != null)
                {
                    if (moduleConfig.FormId > 0) return true;
                    if (!string.IsNullOrWhiteSpace(moduleConfig.ViewType)) return true;
                    if (!string.IsNullOrWhiteSpace(moduleConfig.ViewConfigJson)) return true;
                    if (!string.IsNullOrWhiteSpace(moduleConfig.CssClass)) return true;
                }
            }
            catch { }

            try
            {
                if (Settings != null)
                {
                    if (Settings.Contains("MegaForm_ModuleConfigured") && string.Equals(Convert.ToString(Settings["MegaForm_ModuleConfigured"]), "true", StringComparison.OrdinalIgnoreCase))
                        return true;

                    if (Settings.Contains("MegaForm_FormId") && ParsePositiveInt(Convert.ToString(Settings["MegaForm_FormId"])) > 0)
                        return true;

                    if (Settings.Contains("MegaForm_DefaultView") && !string.IsNullOrWhiteSpace(Convert.ToString(Settings["MegaForm_DefaultView"])))
                        return true;

                    if (Settings.Contains("MegaForm_DisplayMode") && !string.IsNullOrWhiteSpace(Convert.ToString(Settings["MegaForm_DisplayMode"])))
                        return true;
                }
            }
            catch { }

            return false;
        }

        private static bool ResolveProductionModeFlag()
        {
            return LicenseService.IsProductionLicensed();
        }

        private void RegisterClientBootstrapFlags()
        {
            try
            {
                var productionMode = ResolveProductionModeFlag() ? "true" : "false";
                // [v20260527-04] Expose portalId/moduleId/tabId/platform on
                // __MF_PLATFORM__ so all MegaForm JS can append `?portalId=N`
                // to API calls instead of relying on DNN's TabId/ModuleId
                // headers — those 400 with "Specified page is not in this
                // site" when the page is in a child-portal subpath alias.
                // [AiFeatureGate v20260527-08] Carry an `ai: {enabled}` flag
                // so megaform-ai-form-assistant.js refuses to auto-mount
                // when the install has no dev.lock marker. Server-side
                // ALSO refuses to register the bundle in that case, but
                // shipping the flag too gives the client a quick exit.
                var aiEnabled = MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(
                    PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null) ? "true" : "false";

                // [v20260528-13] Page-per-instance routing: each MegaForm module
                // can pin its rendering to a specific form/view/inbox-scope via
                // ModuleSettings. The shell JS reads these first and falls back
                // to querystring only when the module is a generic shell.
                // Replaces the previous "one page, many ?query=" approach so
                // editing the URL bar can no longer corrupt SPA state.
                string s(string key) { try { return Settings.Contains(key) ? (Convert.ToString(Settings[key]) ?? string.Empty) : string.Empty; } catch { return string.Empty; } }
                string js(string raw) { return string.IsNullOrEmpty(raw) ? "''" : "'" + raw.Replace("\\", "\\\\").Replace("'", "\\'") + "'"; }
                int si(string key) { var v = s(key); int n; return int.TryParse(v, out n) ? n : 0; }

                var pinFormId    = si("MegaForm_FormId");
                var pinViewKey   = s("MegaForm_CustomViewKey");
                var pinAppScope  = s("MegaForm_InboxAppScope");
                var pinInboxFid  = si("MegaForm_InboxFormId");
                var pinSurface   = s("MegaForm_PageSurface"); // "builder"|"dashboard"|"submissions"|"render"|"theme"|"languages"

                var script =
                    "window.__MF_PLATFORM__=window.__MF_PLATFORM__||{};"
                    + "window.__MF_PLATFORM__.platform='dnn';"
                    + "window.__MF_PLATFORM__.portalId=" + PortalId + ";"
                    + "window.__MF_PLATFORM__.moduleId=" + ModuleId + ";"
                    + "window.__MF_PLATFORM__.tabId=" + TabId + ";"
                    + "window.__MF_PLATFORM__.productionMode=" + productionMode + ";"
                    // [v20260529-10] `verbose` mirrors dev.lock presence so the
                    // client AI chat can swap technical thinking text + raw
                    // OpenAI errors for friendly "Constructing…/Try again in a
                    // moment" copy in production. Same value as `enabled` —
                    // dev.lock is also the developer-mode marker.
                    + "window.__MF_PLATFORM__.ai={enabled:" + aiEnabled + ",verbose:" + aiEnabled + ",devLock:" + aiEnabled + ",surface:'builder'};"
                    + "window.__MF_PLATFORM__.pin={"
                    + "formId:"   + pinFormId + ","
                    + "viewKey:"  + js(pinViewKey) + ","
                    + "surface:"  + js(pinSurface) + ","
                    + "inbox:{appScope:" + js(pinAppScope) + ",formId:" + pinInboxFid + "}"
                    + "};";
                Page.ClientScript.RegisterStartupScript(GetType(), "MegaFormClientFlags_" + ModuleId, script, true);
            }
            catch { }
        }

        protected void Page_Load(object sender, EventArgs e)
        {
            try
            {
            const string V = "?v=20260717-B404";  // [B404-SourcePickerDNN+DnnModuleRole] Submissions source toggle (json⇄sql) needs the 07-16 B403 client bundle live on DNN; bump busts the 07-14 cached copies. [B200-MonacoExternalize+SourcemapOff+DnnLazyBuilder] Monaco no longer inlined into builder bundle (5.1MB→~1.2MB); sourcemaps off for prod; DNN render page lazy-loads builder via loader. [B69-StateChipsLightDarkPreview] Phase 3 of the mock migration. Adds two Design-mode-only header surfaces. (1) State-preview chip strip (Default / Hover / Focus / Disabled / Error) — clicking a chip sets data-mf-state on the canvas .mf-form-wrapper so look-alike CSS rules apply hover/focus/disabled/error visuals to every input/textarea/select inside, letting designers preview each state without mousing over individual fields. Each chip has a tiny colored dot (slate/orange/blue/grey/red) matching the state. Chip strip auto-resets to Default when leaving Design mode so a lingering Hover doesn't bleed into Build. (2) Sun/Moon color-scheme toggle — sets data-mf-color-scheme="dark" on the form-wrapper so a small dark-variant CSS block (#1e293b card, #0f172a inputs, #f1f5f9 text) renders inside the canvas. Designer-only preview; published runtime is untouched. (3) Both surfaces appear only in Design mode (body[data-mf-mode="design"] guard) so the topbar stays uncluttered in Build mode. All wiring scoped to the topbar setTimeout block in createBuilderTopbar; no other modules touched. [B68-DesignLeftRailPresetsElementsColors] Phase 2 of the mock migration. Replaces the legacy theme-left-rail tabs (IMAGES / FONTS / INSPECT / STRUCTURE — B56 utility tabs) with three mock-aligned tabs: PRESETS / ELEMENTS / COLORS. (1) PRESETS pane: 2-column tile grid of the same 12 presets the right rail uses (Default/Modern Blue/Warm Sunset/Dark Elegance/Nature Green/Material/Classic Formal/Playful/Healthcare/Executive/Tech Startup/Minimal) — each tile shows a tri-color swatch + name. Search input filters tiles client-side by name. Tile click delegates to window.MFThemeTabAdapter.setPreset(id) so the right-rail tile state, canvas iframe, and persistence all stay in lock-step (no logic forked). (2) ELEMENTS pane: scrollable list of 8 stylable element groups (Form Card / Form Header / Field Labels / Inputs / Help Text / Required Mark / Submit Button / Error Messages). Clicking emits mf:theme-element-picked window event (right-rail scroll-to wired in B69). (3) COLORS pane: native color picker + HEX text input bound to --mf-primary via MFThemeTabAdapter.setVar, plus a 12-swatch quick-pick grid (slate/blue/indigo/violet/pink/red/amber/emerald/teal/cyan/sky/dark). All three panes scoped under .mf-tlr-* selectors so existing IMAGES/FONTS/INSPECT/STRUCTURE renderers remain in DOM as hidden divs for backward-compat with the INSPECT iframe handshake. [B67-BuildDesignPillStableCanvas] Phase 1 of the builder UX migration toward the Tailwind/Radix mock at localhost:3000/builder. (1) New Build/Design segmented pill in the topbar (between form-name input and undo/redo) becomes the primary mode driver. Clicking Build activates the existing "Design Studio" right-rail tab (mf-tab-link-field); clicking Design activates the existing "Theme Designer" tab (mf-tab-link-theme). Body data-mf-mode attribute tracks active mode so future CSS can swap rails contextually. The legacy 10-tab right-rail strip remains in the DOM but is hidden in Design mode (theme tab kept) so the user has ONE canonical entry; pass ?legacy=1 to restore. (2) Hard constraint per user: "form o chinh giua khong thay doi khi bat qua lai 2 che do" — center canvas must NOT change when toggling. The B50 ThemePreviewFrame iframe mount (which swapped the FlexGrid canvas for a runtime iframe) is now opt-in via ?themeIframe=1 only. Default Theme mode = same FlexGrid canvas with body.state-theme-mode dressing-down (chrome/badges/handles hidden via existing B49 CSS). (3) Pill style: white-on-grey segmented (38×22 thumb), indigo highlight on active, hover/focus rings. Mirrors the mock pill exactly. Companion spec: docs/BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md. [B66-EnglishDefaultsCleanToggle] (1) Builder Form Settings — Submit/Previous/Next button-text inputs no longer show "Submit / Đăng ký ngay" / "Previous / Quay lại" / "Next / Tiếp tục" Vietnamese-hint placeholders. English-only placeholders ("Submit", "Previous", "Next") match the explicit guidance that English is the default UI language; VN text belongs in language packs, not in core builder markup. (2) Runtime post-submit card fallback labels switched from "Nhập tiếp" / "Đóng" to "Submit another" / "Done" so a brand-new form (no postSubmit.fillAgainLabel / doneLabel set) renders in English. (3) After-Submit Evoq toggle pills polished — removed the trailing "On"/"Off" text label next to every pill so the section header has just the title + iOS-style pill (Confirmation Message / Respondent Email / Provide Download / Redirect URL). Pill bumped 36×20→38×22 with solid #6366f1 indigo on-state + 4px hover halo + focus-visible ring. Legacy .mf-evoq-toggle-label rule kept (display:none) so any cached older markup hides cleanly. [B65z-ValidationAuditQrCorner] (1) Validation accordion noise audit — registry default fallback no longer auto-includes 'validation' so widget-based fields (QRCode, Appointment, MultiColumnCombo, Signature, TermsPrivacy, etc.) that don't take a text-length / numeric-range value now show only General + Condition. Text/Email/Number/Phone/Url/Textarea/Date keep their explicit 'validation' declaration. TermsPrivacy plugin entry also dropped 'validation' from its settingsGroups (consent is required-checkbox toggle, not min/max length). (2) QR Code widget now ALWAYS renders pinned to the form's TOP-RIGHT corner — iframe srcdoc CSS turns .mf-form-wrapper into the positioning context, .mf-field-group[data-type="QRCode"] becomes position:absolute; top:8px; right:8px; auto-width, and the standard chrome (label / placeholder / input wrapper / inline error) is hidden so only the QR canvas overlay shows. (3) QR settings panel re-laid as tidy 2-column grid (110px label / fluid input), labels normalized to slate-600 uppercase 10.5px, inputs/selects fixed 30px height + 100% width, Logo settings grouped into bordered panel with file-row + preview swatch. [B65v-TokenIntoHtmlEditor+B65w-FormDisplayStyle+B65y-GallerySearchAndSharperWireframes] (1) Token chips ([data-token]/[data-mf-token]/.mf-ps-token) now insert into the LAST-FOCUSED HTML editor at the saved caret range — capture-phase handler stops the chip from stealing focus first, mousedown preventDefault preserves the cached selection. (2) New "Display Style" section in Form Settings with 4 selects (form card corners, input corners, card shadow, card border). Live preview wiring in properties-patch.ts adds .mf-style-radius-X / .mf-style-input-X / .mf-style-shadow-X / .mf-style-border-X classes to .mf-form-wrapper in both builder canvas + iframe preview; iframe srcdoc carries the matching style rules. (3) Template gallery search wasn't accepting keystrokes on subportal aliases — added explicit removeAttribute readonly/disabled + capture-phase stopPropagation on keydown/keypress/keyup so the DNN PersonaBar SPA-route handler can't swallow them. Wireframe cards radius dropped 1rem→4px, search input radius 999px→6px, "Use template" button 9999px→4px for the squarer aesthetic user asked for. [B65t-IframeLabelStack+B65u-DashboardActionIconsColorCoded] (1) Iframe @media (max-width:767px) override forces .mf-flexgrid-item to grid-column:1/-1 + auto row so conflicting --lg-y placements stack cleanly instead of overlapping as garbled labels (e.g. Appointment + Long Text both at y=299). 768-1023px gets grid-auto-flow:dense + --lg-* placements. (2) Dashboard form-row action icons enlarged 2rem→2.25rem + color-coded per kind via data-mf-ic-kind attribute: view=blue-50, seturl=slate, edit=indigo, submissions=emerald, report=violet, delete=red, lock=amber. Hover adds translateY(-1px) + shadow. SVG icons bumped 13px→16px. [B65r-TermsPrivacyWidget+B65s-QrLogoCorsFix] (1) New Compliance widget "Terms & Privacy" (type:TermsPrivacy, palette Widgets tab). Settings: label lead-in text, terms link text + URL, privacy link text + URL, openInNewTab, requireConsent (default ON), defaultChecked (default OFF — GDPR best practice), showMarketingOptIn checkbox, marketing label, consentVersion tag, recordTimestamp. Submission value = JSON {consent:bool, version, marketingOptIn?, timestamp, labelText} for audit trail. (2) QR code center logo wasn't loading because cross-origin images without crossOrigin still draw to canvas BUT mixed-content https→http URLs were silently blocked and onerror fired with no fallback. FIX: drawLogoToCanvas now sets img.crossOrigin="anonymous" on first attempt + retries WITHOUT crossOrigin on failure (taints canvas but image still renders for display); also bumped load timeout 3s → 6s for slow CDNs. Browser-verified: Terms & Privacy palette tile present (TermsPrivacy data-type), 8 crossOrigin/tryNoCors hooks in deployed QR plugin. [B65q-TooltipSmallerLeft+AppointmentGlyphFix] (1) Help tip tooltip moved to LEFT of icon (vertically centered) + shrunk to 200px width + 10.5px font so it no longer covers the input directly below the label. (2) Appointment widget was rendering raw i18n keys "widget.appointment.prev_glyph" / "next_glyph" as visible button text because MegaFormI18n.t signature is (key, params) — returns the KEY when translation is missing, and the 3rd fallback arg in widget tr() was silently ignored. FIX: tr() now compares i18n.t result vs key, and falls through to the local English fallback ("‹" / "›") when they match. Real-browser probe: textHits.length=0 after fix (was 2 buttons leaking glyph keys). [B65p-AccordionSubmitOptionsHelpTips] (1) Design Studio launcher converted from popup modal to INLINE ACCORDION — one item open at a time, source tab body moved inline + restored on collapse. (2) FORM THEME section removed from Form Settings (already in dedicated THEME tab). (3) Submit button appearance section added: Full-width checkbox, Alignment select (left/center/right), Color style select (primary/outline/ghost), Save & Continue button toggle. Driven by classes on .mf-form-actions (mf-submit-fullwidth + mf-submit-align-X + mf-submit-variant-X). (4) Help tip (?) icons with hover tooltip added to every setting label (helpTip(text) helper in dom.ts). Browser-verified: 5 tips in Form Settings + 8 tips in Custom HTML accordion, noModal=true. [B65n-IframeRuntimeParityFix] User reported: (a) preset chosen but form shows default colors, (b) form view in builder distorted vs runtime. ROOT CAUSE: B65 iframe inline style forced .mf-form-wrapper into a white card with border+shadow AND forced inner+form bg to #fff !important — this OVERROTE the theme's --mf-form-bg variable, so preset colors only painted text inputs and CSS vars but NOT the form card surface or submit button. Also padding:0 on wrapper made the canvas form look squashed compared to runtime's 24px 16px. FIX: wrapper now transparent + padding 24px 16px (matches runtime), .mf-form/.mf-form-inner reverted to theme-driven bg, submit button explicitly bound to var(--mf-primary,#4f46e5) so preset colours win. Browser-verified: Nature Green preset now paints Submit button #2D8A4E. [B65m-MfSortableGhostDarkBandFix+BlankFormCodeGen] (1) MegaForm uses ghostClass="mf-sortable-ghost" (mf-prefixed); B65i CSS only targeted plain .sortable-ghost so the prefixed element retained dark palette tile bg #2c2f3c → user saw black bar during drag. FIX: CSS now covers both .sortable-ghost AND .mf-sortable-ghost AND .sortable-fallback (forceFallback clone) so dark palette tiles drag clean. Real-browser probe: bg #f4f4f5 opacity 0.18 at source, white opacity 0.95 at cursor. (2) Blank form template now seeds truly empty 2-row×2-column scaffolding (was prefilled with First Name/Last Name/Email/Phone/Message). [B65k-PopupBulletproof] Design Studio popup wasn't visible in user's browser despite probe confirming DOM modal exists. Hardened by (1) capture phase + stopPropagation on card click handler so no other listener (legacy properties.js bubble, tab patch capture, etc.) can cancel the open. (2) Inline forced styles with z-index 2147483646/47 (max safe int) on backdrop+modal so DNN PersonaBar overlays or host CSS cannot hide the popup. Real-browser screenshot now shows the full Form Settings modal with GENERAL checkboxes, DATABASE INSERT, AFTER SUBMIT V1 + Evoq Confirmation Message card + HTML editor toolbar (B/I/U/H/list/link). [B65j-SubportalFormGet400Fix] When the builder runs on a child-portal subpath alias (e.g. /megaform → portal 13), the dom.ts dnnHeaders for Form/Get was sending TabId+ModuleId headers from the parent portal context. DNN's framework cross-checked these against the alias-resolved portal and returned 400 "Specified page is not in this site". FIX: strip TabId/ModuleId headers from dnnHeaders — server reads portalId/moduleId from the query string instead. Same pattern as the B65h Save 401 fallback. Real-browser probe confirmed both Form/Get calls (moduleId=44132 + moduleId=0) now return 200 on /megaform/Home/mfFormId/1269. [B65i-HidePhoneTile+CleanLabel+DragGhost+SaveTokenFallback] User feedback (1) basic Phone widget removed from BASIC palette (category:'hidden'); PhonePro renamed to just 'Phone' so it's the only phone tile. (2) Sortable drag-ghost forced to light card style so dark palette tiles (B65f) no longer drag across canvas as a black bar. (3) Save endpoint 401 fixed via multi-fallback antiforgery token (state.config.servicesFramework → window.WebSF → DOM __RequestVerificationToken hidden input) — DNN $.ServicesFramework not loaded on Home tab embedded mode caused token=empty. (4) Brighter palette label color #f1f5f9 (slate-50) + slightly larger icon-box 2.5rem + label font 0.75rem for readability on dark navy panel. [B65f-DarkTilesShrinkIcons+EvoqTogglesHtmlEditor+DesignStudioPopup] (1) Palette tiles default DARK on dark panel (bg #2c2f3c, border #3a3d4d); ONLY light when body.state-theme-mode active. Icon box shrunk 3rem→2.25rem + icon font 1.25rem→1rem to fit 256px panel without oversize. User feedback "mau nen qua sang va khoi icon qua to" addressed. (2) EMBED tab removed (already in Dashboard). (3) FIELD+SETTINGS+HTML merged to single "Design" tab with launcher cards opening popup modals. (4) After-Submit cards now follow Evoq pattern with On/Off pill toggles per section (Confirmation Message default On, Respondent Email + Provide Download + Redirect URL default Off, body collapses via .is-off class). (5) HTML editor (contenteditable + B/I/U/H/UL/OL/Link toolbar) for Confirmation Message + Respondent Email body, syncs html back to hidden textarea so properties.ts wiring intact. [B65c-RowGridBreakpointLower] Form 342 + most legacy forms use .mf-row (CSS grid) not .mf-flexgrid-item. The .mf-row @media (max-width: 600px) breakpoint collapsed 2-col layouts to 1-col at iframe width ~532px, making builder THEME view diverge from runtime. Lowered breakpoint to 480px so iframe (500-700px wide due to side panels) preserves the row grid template set inline by renderer. Real mobile devices still stack at ≤480px. [B65b-IframeDesktopFlexGrid] [B65-BuilderCanvasNeutral+ThemeHeaderClean] User compared builder THEME mode (fields stacked 1-col) vs runtime /xx?formid=342 (Appointment+MultiSelect side-by-side). Root cause: iframe ~532px width triggered @media (max-width:767px) → FlexGrid items used --sm-* defaults (full-width stack) since form 342 only set --lg-* placements. FIX: iframe srcdoc inline style forces FlexGrid items to use var(--lg-x)/var(--lg-w)/var(--lg-y)/var(--lg-h) at ALL viewport widths via media query overrides with !important. Builder THEME view now matches desktop runtime layout exactly. [B65-BuilderCanvasNeutral+ThemeHeaderClean] User feedback "form bị nhét vào hộp" + "khi chọn preset nền đen kịt" + "bỏ action icons thừa" + "pane phải phải scroll được". (1) iframe srcdoc inline style forces body bg = #f5f7fa neutral so dark theme presets (Tech Startup) no longer black-out the canvas. Form-wrapper gets soft border + subtle shadow instead of heavy theme chrome. min-width:0 + overflow-x:hidden prevent horizontal scrollbar that made form look "stuffed". (2) Theme designer header device-toggle removed (duplicate of top builder bar). Reset+Apply kept. (3) STRUCTURE walker cross-frame instanceof bug fixed (B64), now form 333 shows 56-node tree. [B64-FlexGridCanvasLayoutParity+VerifyProbe5] Builder canvas FlexGrid was rendering items stacked 1-col instead of the runtime 2-col grid (form 342 Appointment+MultiSelect side-by-side). Root cause: megaform.css media queries at 768-1023px and <768px swap cell positioning from --lg-* to --md-*/--sm-*, and the builder canvas typically sits ≤1023px wide due to left+right side panels eating ~512px of a 1440px screen. canvas.ts renderFlexGridOnCanvas only set --lg-* CSS vars, so md/sm fallbacks (var(--md-x,1) / span var(--md-w,12)) forced every cell to 1/span 12 = stack. FIX: (a) canvas.ts now mirrors --lg-* to --md-*/--sm-* on each cell, (b) megaform-builder-ts.css adds defensive media-query overrides inside .mf-canvas-flexgrid that always read --lg-* so canvas matches runtime regardless of viewport width. Builder now shows true "what you see is what you publish" 12-col layout. [B63-VerifyProbe4] Build+bump+redeploy+real-browser probe (build/inspect/width/badges/aftersubmit) per parent agent spec. [B62-VerifyProbe3] Build+bump+redeploy+reprobe per parent agent spec. [B61-VerifyProbe2] Re-probe single-button card render + AI drawer open. [B60-VerifyProbe] Cache-bust bump for B60 verification probe pass: Phone widget national-mode DOM, Razor/DataRepeater single-button card, DynamicLabel single-button card, Theme preset applies --mf-primary, AI drawer opens, Report button in dashboard. [B59-SettingsEvoq] After-Submit panel restructured into Evoq-style sub-cards (Confirmation Message / Submission Details / Redirect URL) with title+description headers + clean dividers. GENERAL section checkboxes (Require Login / Save & Continue / Multi-step / Display Only / Hide Header) laid out in 2-col grid for compactness. CSS additions: .mf-checkbox-grid, .mf-evoq-card, .mf-evoq-card-head/.title/.desc/.body, .mf-evoq-token-list, .mf-evoq-input-grid (responsive collapses to 1-col below 460px). Field IDs preserved EXACTLY so properties.ts populate/sync logic unchanged. Tokens chip list moved INSIDE Confirmation Message card (used by message textarea). [B57-IframeSrcdocFix] Iframe in THEME mode was rendering EMPTY (#mf-mount stayed empty) because Vite's minifier corrupted the inline bootstrap <script> in buildThemePreviewSrcdoc — `+ // comment +` interleaving compiled to `+ undefined +` then string-coerced to literal `NaN`, producing `NaNvar s=...` SyntaxError that aborted the script before the DOMContentLoaded handler could register. FIX: rewrote canvas.ts buildThemePreviewSrcdoc to assemble via string[].join('') with all comments OUTSIDE the concat chain; renderer cache stamp inside srcdoc bumped to B57; added defensive doInit() if document.readyState!='loading' to dodge late-parse race. Probe confirmed iframe body now contains mf-form-wrapper-N > mf-form-inner > mf-form > mf-fields-container with theme class applied. [B56-ThemeTabQA] Root cause: buildOverridesCss scoped to #mf-canvas-dropzone but iframe DOM has body>#mf-mount>.mf-form-wrapper. Iframe received CSS but matched zero elements → all controls "no effect". FIX: split buildCanvasOverridesCss (parent) + buildIframeOverridesCss (iframe scope: :root, body, #mf-mount, .mf-form-wrapper, .mf-form, .mf-form-inner). Added postThemeClassToPreviewFrame for mf-theme-<id> class messages. flushPreview now always re-posts to iframe (bypasses cache). Preset click triggers canvas render for srcdoc rebuild. LEFT RAIL restored with 4 NEW utility tabs (IMAGES/FONTS/INSPECT/STRUCTURE) — NOT duplicate presets. IMAGES tab reuses TokenDesigner uploadImage + openGalleryPicker. FONTS tab shows 8 reference fonts with live Aa preview. INSPECT tab has Pick element toggle that sets body.mf-theme-inspect-mode + crosshair cursor on iframe. STRUCTURE tab keeps ThemeDesignerTemplateTree. Public API MFThemeTabAdapter exposes setVar/setCustomCss/setCustomHtml/setPreset/flushPreview so left rail can drive right rail. +  // [B53+B54+B55 autonomous cascade] B53: Designer UX revamp hard cutover (Razor Studio + Layout Designer absorbed into Unified Designer tabs), Bugs A/B/F/G fixed, AI panel re-enabled as slide-out drawer with widget-scoped KB filter, subformBase()+aiBase() platform helpers, AiKnowledge widget_type+surface columns + SearchScoped endpoint. B54: DateTimePicker variant=columns wheel picker + 3 modes + 12h/24h + 6 column labels, NEW MultiColumnCombo widget (FieldType enum + plugin + MF_DemoEmployees seed). B55: MF_SubmissionValues FormId column + indexes + SubmissionIndexerService (platform-agnostic Func<DbConnection>) hooked into SubmissionProcessor, NEW MF_ReportDefinitions table + Core models + ReportsController CRUD (DNN+Oqtane partial), NEW Submission Report MVP UI (submission-report.ts modal: date range + columns picker + CSV export) with Report button in dashboard form-card actions. +  // [B52-SrcdocPreview+BugH] Theme preview iframe switched from src=/xx?formid=N (full DNN page chrome) to srcdoc inline HTML pattern (matches old standalone theme-designer). Iframe shows ONLY the form, no skin/menu/admin chrome. buildThemePreviewSrcdoc() inlines schema + settings + theme. Bug H formId walker probes FormId/PascalCase + ?mfFormId= + hash params case-insensitive. getPlatformAssetBase() Oqtane-aware (/Modules/MegaForm vs /DesktopModules/MegaForm/Assets). +  // [B51-OqtaneXPlatform] getApiBase()/apiUrl() platform helpers in shared/platform-host.ts. 88 hardcoded /DesktopModules/ literals normalized in 36 TS files. providers/settings/feedback-log/chat/ops AI-assistant defensive Oqtane detection (window.Oqtane, __OQTANE__, [data-mf-platform]). NEW /api/MegaForm/ModuleConfig/DefaultConnectionString endpoint reads Oqtane appsettings.json DefaultConnection + masks password + detects provider. DatabaseSettings modal auto-prefills on first open + Use Site Default button + red error banner + amber no-default tip. Module.css stubs at 3 Oqtane probe paths. +  // [B50-LiveRuntimePreview] Canvas iframe-based runtime render when THEME tab active. iframe src=/xx?mfFormId=N&theme-preview=1 loads actual runtime renderer that respects settings.customHtml + customCss + theme tokens. postMessage 'mf-theme-live-css' parent→iframe propagates uncommitted theme edits without reload. 'mf-theme-preview-ready' handshake iframe→parent flushes current overrides on first paint. Edge cases: unsaved form → amber placeholder, 12s load watchdog → red error placeholder + refresh button, race-safe enter/exit via idempotent mount/unmount + restoreBuilderChildrenFromHide. window.MFCanvasThemePreview API exposed. +  // [B49-ThemePolish v20260602-B49] 3 critical fixes after B48 + ported missing features. (1) Canvas LIVE PREVIEW mode — extended state-theme-mode CSS to hide FlexGrid headers/toolbars/info/controls, Row header chrome, field-type badges (TEXT/UNIQUE ID/VIDEO EMBED chips), Custom HTML banner (purple "live sync on"), Add-description prompt, dropzone placeholders, settings/duplicate/delete icons; strips border/outline/shadow/bg on .mf-canvas-field/row/flexgrid/cell so canvas matches runtime; removes B48 dashed hover outline + tooltip. (2) Left rail theme nav CSS — 305 new lines styling .mf-tlr-* / .mf-theme-nav-tabs / .mf-theme-pane to match dark palette aesthetic (panel #1e2130 bg, indigo #6366f1 accents, preset 2-col grid, swatch 6-col grid, accordion). (3) Ported old Theme Designer features inline: 5th CUSTOM sub-tab (Custom CSS + Custom HTML wrapper textareas with monospace), 6th HTML sub-tab (Full Custom HTML Template editor with {{field:key}} placeholders + field key reference chips + Preview button), Font Family LIVE preview box, 10-step Color Tints generator (50/100/.../900), HEX text input next to Primary picker, Title align (left/center/right), Device preview toggle (desktop/tablet/mobile resizes canvas dropzone), 5 element-specific color groups (Input/Section/Buttons/File/Sidebar+Help+Required*). Deferred B50+: Color Harmony, 2D canvas+hue slider, custom font upload, live inspector hover-edit. + B48 unified Builder+Theme + B47 canonical + B46 unified heights + B45 VisualQA + B44 PDF/Video/Map + B43 BYOM + B40 DataRepeater + B39 DynLabel + B38 PreviewSql.
                const string ASSETS = "/DesktopModules/MegaForm/Assets/";

                DotNetNuke.Framework.ServicesFramework.Instance.RequestAjaxAntiForgerySupport();
                HasDevLock = HasLockFile("dev.lock");
                HasDemoLock = HasLockFile("demo.lock");


                // ── Build ViewModel first so we know ShowConfigPanel ──
                ViewModel = BuildRenderViewModel();

                // ── Return URL (single-host shell returns to current tab without hash/query UI state) ──
                ReturnUrl = BuildReturnUrl();
                ConfigureUrl = BuildReturnUrl();

                // [B48 2026-06-02] Theme Designer host removed — #mf-theme route is
                // retired. The Theme tab now lives inline inside the Builder right rail.
                // The legacy ThemeDesignerHostHtml property is kept on the view-model so
                // the ASCX <%= ThemeDesignerHostHtml %> binding compiles; it now emits
                // an empty string. The standalone #mf-host-theme-overlay div stays in
                // the ASCX as an inert placeholder until that markup is dropped too.
                ThemeDesignerHostHtml = string.Empty;

                // Stable-state gating:
                // only after Manage module has persisted module-instance config do we allow
                // dock/admin shell. A transient selected ViewModel.FormId is NOT enough.
                var hasStableModuleState = ViewModel != null
                    && HasStableModuleSelectionSettings(ViewModel);
                var isDnnAjaxPartialRender = IsDnnAjaxPartialRender();

                // [AdminDashAlwaysShow v20260506-01] Drop the IsInEditMode/IsAdminDashboardMode
                // requirement — admin should see the dock + Dashboard button on every visit
                // (no need to toggle DNN Edit mode), as long as the module is configured.
                var canShowDockButtons = ViewModel != null
                    && ViewModel.IsAdmin
                    && !ViewModel.ShowConfigPanel
                    && !ViewModel.LiveRenderMode
                    && hasStableModuleState;

                // Module is still unconfigured after add/drop. Do not depend on IsEditable here:
                // during DNN's ajax AddModule partial, edit-mode permission flags can arrive before
                // the module is fully stabilised, even though the actor is the host/admin.
                var isUnconfiguredAdminModule = ViewModel != null
                    && ViewModel.IsAdmin
                    && !ViewModel.IsAdminDashboardMode
                    // A My Inbox module has no bound form BY DESIGN — without this it would be
                    // read as a half-dropped module and the whole shell suppressed (blank page).
                    && !ViewModel.IsMyInboxMode
                    && !ViewModel.ShowConfigPanel
                    && !ViewModel.LiveRenderMode
                    && !hasStableModuleState;

                IsUnconfiguredAdminModuleState = isUnconfiguredAdminModule
                    && isDnnAjaxPartialRender;

                ShowDropSafeAdminDock = isUnconfiguredAdminModule;

                SuppressInlineAdminEmptyState = ShouldSuppressInlineAdminEmptyState(ViewModel);
                SuppressInlineAdminShell = ShouldSuppressInlineAdminShell(ViewModel);

                RegisterClientBootstrapFlags();

                if (ViewModel.ShowConfigPanel)
                {
                    // ── BUILDER MODE: load full builder CSS + Vite bundle ──
                    ClientResourceManager.RegisterStyleSheet(Page,
                        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap", 188);
                    ClientResourceManager.RegisterStyleSheet(Page,
                        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css", 189);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-builder-shell.css" + V, 200);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-builder.css" + V, 201);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-builder-ts.css" + V, 202);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-themes.css" + V, 203);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-widgets.css" + V, 204);
                    RegisterPluginStyles(210, V);

                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/Sortable.min.js", 100);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-widgets.js" + V, 101);
                    RegisterPluginScripts(110, V);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-renderer.js" + V, 130);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-rule-engine.js" + V, 131);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/bundles/megaform-builder.js" + V, 140);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-template-gallery-search.js" + V, 141);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/builder/megaform-workflow-reactflow.js" + V, 150);
                    // [AiFeatureGate v20260527-08] AI Form Assistant bundle
                    // ships ONLY on the Builder surface AND ONLY when a
                    // dev.lock marker file exists (canonical detection via
                    // MegaForm.Core.Services.AiAssistant.AiFeatureGate). The
                    // bundle is intentionally absent in production — no
                    // bytes downloaded, no global window symbols defined.
                    if (MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(
                            PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null))
                    {
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-ai-form-assistant.js" + V, 160);
                    }
                }
                else
                {
                    // ── RENDER MODE: always load only public form assets by default ──
                    ClientResourceManager.RegisterStyleSheet(Page, "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css", 190);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform.css" + V, 200);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-themes.css" + V, 201);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-submissions-ts.css" + V, 202);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-widgets.css" + V, 203);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/plugins/megaform-widgets-builtin.css" + V, 204);
                    ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-views.css" + V, 205);

                    RegisterPluginStyles(ViewModel != null ? ViewModel.PluginStyles : null, 210, V);

                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-i18n.js" + V, 95);
                    RegisterLocaleScript(96);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-widgets.js" + V, 100);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/plugins/types.js" + V, 101);
                    RegisterPluginScripts(ViewModel != null ? ViewModel.PluginScripts : null, 105, V);
                    RegisterQrCodePluginFallback(ViewModel, ASSETS, V, 109);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-renderer.js" + V, 110);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-rule-engine.js" + V, 112);
                    ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-views.js" + V, 115);

                    if (ViewModel != null && string.Equals(ViewModel.ActiveViewType, "list", StringComparison.OrdinalIgnoreCase))
                    {
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-submission-list.js" + V, 116);
                    }

                    if (ViewModel != null && string.Equals(ViewModel.ActiveViewType, "card", StringComparison.OrdinalIgnoreCase))
                    {
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-submission-card.js" + V, 117);
                    }

                    // [ListViewRouting v20260507-23] Load the dedicated ListView
                    // bundle ONLY when this module is configured for the new
                    // listview mode — keeps form-only pages slim.
                    if (ViewModel != null && string.Equals(ViewModel.ActiveViewType, "listview", StringComparison.OrdinalIgnoreCase))
                    {
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-listview.css" + V, 215);
                        ClientResourceManager.RegisterScript(Page,    ASSETS + "js/megaform-listview.js"   + V, 118);
                    }

                    // [DnnInboxMode v20260714-01] A module pinned to My Inbox renders the inbox for
                    // EVERY authenticated user — an approver is usually not an admin. Admins get it
                    // through the admin-shell overlay below; everyone else gets the inline root in
                    // the ASCX, which still needs the bundle + stylesheet.
                    var shouldLoadInboxAssetsForMember = ViewModel != null
                        && ViewModel.IsMyInboxMode
                        && !ViewModel.IsAdmin
                        && ViewModel.IsAuthenticated
                        && !ViewModel.EmbedMode;

                    if (shouldLoadInboxAssetsForMember)
                    {
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-admin-shell.css" + V, 205);
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-submissions-ts.css" + V, 210);
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-my-inbox-ts.css" + V, 211);
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-i18n.js" + V, 95);
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-my-inbox.js" + V, 121);
                    }

                    // Keep asset registration aligned with the ASCX shell gate.
                    // If the dock/shell markup is visible but these assets are skipped,
                    // buttons like "Form Dashboard" render but never open any overlay.
                    // That mismatch is what broke the DNN live admin UX on render pages.
                    var shouldLoadAdminShellAssets = ViewModel != null
                        && ViewModel.IsAdmin
                        && !ViewModel.ShowConfigPanel
                        && !ViewModel.EmbedMode
                        && !SuppressInlineAdminShell;

                    if (shouldLoadAdminShellAssets)
                    {
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-admin-shell.css" + V, 205);
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-builder-shell.css" + V, 206);
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-builder.css" + V, 207);
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-builder-ts.css" + V, 208);
                        // [B48 2026-06-02] megaform-theme-designer.css removed — Theme
                        // Designer panels now ship inside the Builder right rail bundle
                        // (Theme tab); styles fold into megaform-builder-ts.css.
                        // [SubsDetailCss v20260601-B10] megaform-submissions-ts.css
                        // hosts ALL the .mf-modal-table + .mf-subdetail-db-* +
                        // .mf-subdetail-activity styles used by the submission
                        // detail modal (Data/Form/DB/Activity tabs). Without it,
                        // the DB View shows as plain stacked text instead of
                        // tables/cards. Was only loaded in render mode; admin
                        // shell needs it too because the modal opens from the
                        // dashboard inbox.
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-submissions-ts.css" + V, 210);
                        // [DnnMyInbox v20260714-01] My Inbox surface (#mf-host-myinbox-overlay).
                        // The dashboard sidebar has always linked to it; the bundle+stylesheet
                        // were never registered on DNN, so the surface could not boot.
                        ClientResourceManager.RegisterStyleSheet(Page, ASSETS + "css/megaform-my-inbox-ts.css" + V, 211);

                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/Sortable.min.js", 116);
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-dashboard.js" + V, 118);
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-submissions.js" + V, 119);
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-my-inbox.js" + V, 121);
                        // The canonical SubmissionsShell is provided by megaform-submissions.js.
                        // The retired Gmail-style submission-inbox bundle is intentionally not
                        // registered: it is no longer built and caused a 404 on every admin page.
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-languages.js" + V, 119);
                        // [B200 2026-06-19] LAZY BUILDER ON RENDER PAGE — the ~1.2 MB builder
                        // bundle (+ the workflow ReactFlow bundle) is NO LONGER eager-loaded
                        // here. It was downloaded on every admin form-view even when the
                        // builder was never opened. megaform-dnn-host.js now injects both on
                        // demand the first time the admin opens the Builder overlay
                        // (ensureBuilderBundleLazyLoaded → open('builder')). #mf-builder-root
                        // carries data-lazy-boot="true" so nothing auto-boots before then.
                        // Sortable + megaform-widgets + schema plugins stay eager above, so
                        // the builder boots with the same plugin set — only the heavy bundle
                        // defers. (Builder MODE — ShowConfigPanel=true — still eager-loads the
                        // bundle at line ~452; only the render-page admin shell defers.)
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-template-gallery-search.js" + V, 120);
                        // [B48 2026-06-02] megaform-theme-designer.js + megaform-theme-inspector.js
                        // script registrations removed — Theme Designer panels run inside the
                        // Builder bundle now (THEME right-rail tab). #mf-theme hash is redirected
                        // by builder/index.ts to #mf-builder + auto-activates THEME tab.
                        ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-dnn-host.js" + V, 124);
                        // [AiFeatureGate v20260528-16] AI Form Assistant is gated
                        // by dev.lock. Bundle is self-mounting: auto-attaches the
                        // chat bubble only when it detects a `[data-mf-builder]`
                        // element (= the Builder host), so this universal admin
                        // registration is safe — dashboard / submissions pages
                        // just don't render the bubble.
                        if (MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(
                                PortalSettings != null ? PortalSettings.HomeDirectoryMapPath : null))
                        {
                            ClientResourceManager.RegisterScript(Page, ASSETS + "js/megaform-ai-form-assistant.js" + V, 125);
                        }
                    }

                    // Live Style Editor disabled on form view. Use Theme Builder instead.
                }
            }
            catch (Exception ex)
            {
                if (ViewModel == null) ViewModel = new FormRenderViewModel();
                ReturnUrl = ReturnUrl ?? DotNetNuke.Common.Globals.NavigateURL();
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        private string RenderThemeDesignerHostHtml(int formId, string apiBaseUrl)
        {
            try
            {
                var renderer = new ThemeDesignerHostRenderer();
                var html = renderer.Render(new ThemeDesignerHostOptions
                {
                    FormId = formId,
                    ApiBaseUrl = string.IsNullOrWhiteSpace(apiBaseUrl) ? "/DesktopModules/MegaForm/API/" : apiBaseUrl,
                    ReturnUrl = ReturnUrl ?? BuildReturnUrl(),
                    CssUrl = "/DesktopModules/MegaForm/Assets/css/megaform-theme-designer.css?v=216",
                    JsUrl = "/DesktopModules/MegaForm/Assets/js/megaform-theme-designer.js?v=216",
                    InspectorJsUrl = "/DesktopModules/MegaForm/Assets/js/megaform-theme-inspector.js?v=216"
                });
                return ExtractBodyInnerHtml(html);
            }
            catch
            {
                return "<div id=\"td-root\" class=\"td-root\" data-platform=\"dnn\" data-form-id=\"" + formId + "\" data-api-base=\"" + (apiBaseUrl ?? "/DesktopModules/MegaForm/API/") + "\" data-return-url=\"" + (ReturnUrl ?? BuildReturnUrl()) + "\"></div>";
            }
        }

        private static string ExtractBodyInnerHtml(string html)
        {
            if (string.IsNullOrWhiteSpace(html)) return string.Empty;
            var bodyOpen = html.IndexOf("<body", StringComparison.OrdinalIgnoreCase);
            if (bodyOpen < 0) return html;
            var start = html.IndexOf('>', bodyOpen);
            if (start < 0) return html;
            var end = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (end <= start) return html.Substring(start + 1);
            return html.Substring(start + 1, end - start - 1);
        }

        /// <summary>
        /// Legacy configure URL helper. DNN admin shell now uses hash-only overlay routes.
        /// </summary>
        private string BuildConfigureUrl()
        {
            try
            {
                var qs = System.Web.HttpUtility.ParseQueryString(Request.QueryString.ToString());
                qs.Remove("configure");
                string query = qs.ToString();
                string path = Request.Url.AbsolutePath;
                return string.IsNullOrEmpty(query) ? path : path + "?" + query;
            }
            catch
            {
                return Request.RawUrl ?? string.Empty;
            }
        }

        /// <summary>
        /// Build return URL: current DNN tab URL without the configure=1 query param.
        /// </summary>
        private string BuildReturnUrl()
        {
            try
            {
                var raw = DotNetNuke.Common.Globals.NavigateURL(TabId);
                if (string.IsNullOrWhiteSpace(raw))
                    raw = Request != null && Request.Url != null ? Request.Url.AbsolutePath : "/";

                Uri uri;
                if (Uri.TryCreate(raw, UriKind.Absolute, out uri))
                {
                    // already absolute
                }
                else
                {
                    var baseUri = Request != null && Request.Url != null
                        ? new Uri(Request.Url.GetLeftPart(UriPartial.Authority))
                        : new Uri("http://localhost");
                    uri = new Uri(baseUri, raw.StartsWith("/") ? raw : "/" + raw);
                }

                var qs = System.Web.HttpUtility.ParseQueryString(uri.Query ?? string.Empty);
                qs.Remove("configure");
                qs.Remove("formId");
                qs.Remove("formid");
                qs.Remove("mfFormId");
                qs.Remove("new");
                qs.Remove("embed");
                qs.Remove("mfDropReady");
                qs.Remove("mfOpenSettings");

                var query = qs.ToString();
                var path = uri.AbsolutePath;
                return string.IsNullOrEmpty(query) ? path : path + "?" + query;
            }
            catch
            {
                return DotNetNuke.Common.Globals.NavigateURL(TabId);
            }
        }

        private string BuildShellRoute(string mode)
        {
            var baseUrl = BuildReturnUrl();
            return string.IsNullOrWhiteSpace(mode) ? baseUrl : baseUrl + "#mf-" + mode.ToLowerInvariant();
        }

        private FormRenderViewModel BuildRenderViewModel()
        {
            var vm = new FormRenderViewModel();

            // Check ModuleViewConfig first (new system)
            var moduleConfig = FormRepository.GetModuleViewConfig(ModuleId);
            var currentModuleMode = NormalizeModuleMode(Settings.Contains(SettingKeyModuleMode)
                ? Convert.ToString(Settings[SettingKeyModuleMode])
                : "render");

            // Get form associated with this module / optional public live query
            int selectedFormId = 0;
            bool explicitRenderMode = false;
            // [FormIdGate 2026-06-26] The ?formid= URL override (render an ARBITRARY form by id on this
            // module page) is ADMIN-ONLY — same rule as Oqtane Index.razor so all platforms behave
            // identically. Non-admin/public visitors passing ?formid= are ignored and fall through to
            // the module's CONFIGURED form below; they can't browse arbitrary forms (incl. drafts) by id.
            var isAdminUser = UserInfo != null && (UserInfo.IsInRole("Administrators") || UserInfo.IsSuperUser);
            int requestedFormId = isAdminUser ? ResolveRequestedFormId() : 0;
            int shellFormId = ResolveRequestedShellFormId();
            RequestedFormId = requestedFormId > 0 ? requestedFormId : shellFormId;

            // ADMIN-SHELL-FIX v20260412-01:
            // ?formid=N sets explicitRenderMode=true → LiveRenderMode=true → admin shell skipped
            // → ThemeDesigner CSS not loaded, dnn-host not rendered, #mf-theme broken for admins.
            // When user is admin, ?formid= and ?mfFormId= are equivalent: both select a form.
            // Only non-admin public renderer-host requests need LiveRenderMode=true.
            // isAdminUser already computed above (FormIdGate); non-admins never reach here with requestedFormId>0.
            if (requestedFormId > 0)
            {
                selectedFormId = requestedFormId;
                // Admins using ?formid= are on admin hash routes — keep admin shell intact.
                explicitRenderMode = !isAdminUser;
            }
            else if (shellFormId > 0)
            {
                selectedFormId = shellFormId;
            }
            else if (string.Equals(currentModuleMode, "render", StringComparison.OrdinalIgnoreCase) && moduleConfig != null)
            {
                selectedFormId = moduleConfig.FormId;
            }
            else if (string.Equals(currentModuleMode, "render", StringComparison.OrdinalIgnoreCase) && Settings.Contains("MegaForm_FormId"))
            {
                int.TryParse(Settings["MegaForm_FormId"].ToString(), out selectedFormId);
            }

            var forms = FormRepository.GetFormsByModule(ModuleId);
            FormInfo form = null;

            if (selectedFormId > 0)
            {
                form = forms.FirstOrDefault(f => f.FormId == selectedFormId);
                // Template-created forms may have a different ModuleId — try direct lookup
                if (form == null)
                {
                    form = FormRepository.GetForm(selectedFormId);
                    if (form != null && !explicitRenderMode && form.ModuleId != ModuleId)
                    {
                        form.ModuleId = ModuleId;
                        try { FormRepository.SaveForm(form); } catch { /* best effort */ }
                    }
                }
                if (explicitRenderMode && form != null && !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase) && !UserInfo.IsInRole("Administrators") && !UserInfo.IsSuperUser)
                {
                    form = null;
                }
            }

            // Do not auto-fallback to the first published form for an unconfigured module.
            // A dropped-but-unconfigured module should stay empty until the admin explicitly selects a form.

            // Config panel properties — set BEFORE early return so panel works even with no form
            vm.IsAdmin = UserInfo.IsInRole("Administrators") || UserInfo.IsSuperUser;
            // IsEditable is the DNN standard: true only when the page is in Edit mode AND
            // the current user has edit permission on this module instance.
            // Standard DNN admin dock uses edit mode. Admin Dashboard mode is the one explicit
            // exception: it intentionally keeps the MegaForm dock/dashboard available for admins
            // even when the page is not in DNN Edit mode.
            vm.IsInEditMode = IsEditable;
            vm.ModuleId = ModuleId;
            vm.TabId = TabId;
            vm.ApiBaseUrl = "/DesktopModules/MegaForm/API/";
            vm.CaptchaBadgeVersion = "CaptchaVerify v20260407-05";
            vm.ReCaptchaSiteKey = ReadPortalSetting("Captcha_ReCaptcha_SiteKey");
            vm.HCaptchaSiteKey = ReadPortalSetting("Captcha_HCaptcha_SiteKey");

            // DNN admin shell now uses hash overlays only. configure=1 previously forced the
            // fullscreen builder branch, which hid the shared dashboard/submissions/languages host.
            // Disable that path and keep all admin UX on the clean tab URL.
            vm.ShowConfigPanel = false;
            vm.LiveRenderMode = explicitRenderMode;
            vm.EmbedMode = explicitRenderMode && IsEmbedRequest();

            if (vm.IsAdmin)
            {
                vm.FormsJson = JsonConvert.SerializeObject(forms.Select(f => new {
                    f.FormId, f.Title, f.Status, f.SchemaJson,
                    fieldCount = 0
                }));
                if (moduleConfig != null)
                {
                    vm.ModuleConfigJson = JsonConvert.SerializeObject(new {
                        moduleConfig.FormId, moduleConfig.ViewType,
                        moduleConfig.ViewConfigJson, moduleConfig.CssClass,
                        moduleConfig.CacheMinutes, moduleConfig.PermissionsJson
                    });
                }

                vm.ModuleMode = currentModuleMode;
                vm.IsAdminDashboardMode = string.Equals(vm.ModuleMode, "admin_dashboard", StringComparison.OrdinalIgnoreCase);
                vm.IsMyInboxMode = string.Equals(vm.ModuleMode, "myinbox", StringComparison.OrdinalIgnoreCase);
                // For builder: pass raw schema JSON
                if (form != null)
                {
                    vm.SchemaJson = form.SchemaJson ?? "{}";
                    vm.FormStatus = form.Status ?? "draft";
                }
            }

            // Build dashboard data here — before form null check — so it runs
            // even when no form is configured for this module (e.g. Default.aspx
            // admin panel module). GetFormsByPortal returns portal-wide forms
            // regardless of this module's formId setting. (CORE single trust: dashboard
            // data is portal-scoped, not module-scoped.)
            if (vm.IsAdmin)
                DashboardJson = BuildDashboardJson(vm);

            if (string.IsNullOrWhiteSpace(vm.ModuleMode))
                vm.ModuleMode = currentModuleMode;
            vm.IsAdminDashboardMode = string.Equals(vm.ModuleMode, "admin_dashboard", StringComparison.OrdinalIgnoreCase);

            if (form == null) return vm;

            ResolvedRenderModel resolvedRenderModel = null;
            FormSchema schema = null;
            try
            {
                resolvedRenderModel = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
                schema = resolvedRenderModel.Schema;
            }
            catch { /* invalid schema */ }

            vm.FormId = form.FormId;
            vm.Title = form.Title;
            vm.Description = form.Description;
            vm.Schema = schema;
            vm.SubmitButtonText = resolvedRenderModel?.SubmitButtonText ?? form.SubmitButtonText ?? "Submit";
            vm.EnableCaptcha = form.EnableCaptcha;
            vm.EnableSaveResume = form.EnableSaveResume;
            vm.RequireAuth = form.RequireAuth;
            vm.IsAuthenticated = UserInfo.UserID > 0;

            // Load saved theme/style overrides from module settings
            vm.ThemeClass = Settings.Contains("MegaForm_ThemeClass") ? Settings["MegaForm_ThemeClass"].ToString() : "";
            vm.CssOverride = Settings.Contains("MegaForm_CssOverride") ? Settings["MegaForm_CssOverride"].ToString() : "";
            vm.SelectedThemePresetKey = Settings.Contains("MegaForm_SelectedThemePresetKey") ? Settings["MegaForm_SelectedThemePresetKey"].ToString() : (Settings.Contains("SelectedThemePresetKey") ? Settings["SelectedThemePresetKey"].ToString() : "");
            vm.ThemeJson = form.ThemeJson;
            vm.SettingsJson = resolvedRenderModel?.SettingsJson ?? RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl).SettingsJson;
            // [ModuleStyleDnn v20260714-01] Module-owned style wins over the form's own (the twin of
            // Oqtane's OverlayModuleStyle, Index.razor:3201). Two modules can then render the SAME
            // form with different themes. No-op when this module never saved a style, or saved it
            // for a DIFFERENT form — binding a new form falls back to that form's CSS until reseeded.
            vm.SettingsJson = OverlayModuleStyle(vm.SettingsJson, form.FormId);
            vm.InitialInlineCss = ThemePresetInlineCssService.Build(vm.SettingsJson, vm.SelectedThemePresetKey, "#mf-form-wrapper-" + form.FormId);
            vm.AutoQrCodeEnabled = ResolveAutoQrCodeEnabled(vm);
            if (vm.AutoQrCodeEnabled)
            {
                vm.AutoQrCodeHtml = QrCodeCornerHtmlService.BuildAutoCornerHtml(form.FormId, BuildQrCodeTargetUrl(form), "Scan QR code to open on mobile", "QR");
            }
            // ResolvedSchemaJson: raw JSON from RenderModelResolver (JObject-based, preserves all
            // TS field properties). Used in ASCX instead of JsonConvert.SerializeObject(Schema)
            // so unknown field props (e.g. optionColumns) survive C# deserialization. (CORE single trust)
            vm.ResolvedSchemaJson = resolvedRenderModel?.SchemaJson ?? form.SchemaJson ?? "{}";

            // Withhold fields this visitor may not see before the schema is inlined into the page. The
            // public renderer (FormView.ascx) rebuilds the whole form from ResolvedSchemaJson client-side,
            // so a role-gated field left in it is readable in view-source regardless of the rendered HTML.
            // The builder branch uses the raw SchemaJson (vm.SchemaJson), which is untouched, and holders
            // of the manage permission are bypassed inside ProjectForActor, so an admin still sees all.
            vm.ResolvedSchemaJson = ProjectSchemaForCurrentVisitor(form.FormId, vm.ResolvedSchemaJson);
            // [SingleSource v20260624-B260] Compose the form's FULL CSS into ONE block server-side
            // (preset + scoped theme vars + authored customCss + custom-shell compat + module
            // CssOverride last) — identical Core composer to the Oqtane host. DNN public JS then
            // does NOTHING to theme CSS (the renderer early-returns on data-mf-ssr="1"); it still
            // builds the field body into the empty container. Folds the former mf-inline-preset +
            // mf-live-override blocks into this single block.
            try
            {
                var __schemaObj = Newtonsoft.Json.Linq.JObject.Parse(vm.ResolvedSchemaJson);
                var __settingsObj = __schemaObj["settings"] as Newtonsoft.Json.Linq.JObject
                                    ?? __schemaObj["Settings"] as Newtonsoft.Json.Linq.JObject;
                vm.ModuleCss = ModuleCssComposer.Compose(form.FormId, __settingsObj, vm.InitialInlineCss, vm.CssOverride);
                vm.WrapperRuntimeClasses = __settingsObj != null ? ModuleCssComposer.BuildWrapperRuntimeClasses(__settingsObj) : "";
            }
            catch { vm.ModuleCss = vm.InitialInlineCss ?? ""; vm.WrapperRuntimeClasses = ""; }
            vm.ApiBaseUrl = "/DesktopModules/MegaForm/API/";
            vm.HoneypotFieldName = schema?.Settings?.HoneypotFieldName ?? "__mf_hp";
            vm.FormLoadTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

            // Check for resume token in query string
            string token = Request.QueryString["resume"];
            if (!string.IsNullOrEmpty(token))
            {
                var draft = FormRepository.GetDraft(token);
                if (draft != null && draft.FormId == form.FormId)
                {
                    vm.ResumeToken = token;
                    vm.PrefilledDataJson = draft.DataJson;
                }
            }

            // Check for query-string prefill
            if (schema?.Fields != null)
            {
                var prefillData = new Dictionary<string, string>();
                foreach (var field in MegaFormUtils.FlattenFields(schema.Fields).Where(f => f != null && !string.IsNullOrEmpty(f.PrefillParam)))
                {
                    string val = Request.QueryString[field.PrefillParam];
                    if (!string.IsNullOrEmpty(val) && !string.IsNullOrEmpty(field.Key))
                        prefillData[field.Key] = val;
                }
                if (prefillData.Count > 0 && string.IsNullOrEmpty(vm.PrefilledDataJson))
                    vm.PrefilledDataJson = JsonConvert.SerializeObject(prefillData);
            }

            // DNN admin shell (dashboard / builder / workflow / views host) must always load the
            // full widget registry + full plugin set so the WIDGETS palette matches Web.
            // Only the public renderer should use schema-filtered assets for optimization.
            try
            {
                if (vm.IsAdmin)
                {
                    ScanPluginFiles(vm);
                    vm.PluginScripts = vm.PluginScripts
                        .Where(x => !string.IsNullOrWhiteSpace(x) && !string.Equals(Path.GetFileName(x), "types.js", StringComparison.OrdinalIgnoreCase))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                    vm.PluginStyles = vm.PluginStyles
                        .Where(x => !string.IsNullOrWhiteSpace(x))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                }
                else
                {
                    var assetManifest = BuildAssetManifest(schema);
                    vm.PluginScripts = assetManifest.ScriptFiles ?? new List<string>();
                    vm.PluginStyles = assetManifest.StyleFiles ?? new List<string>();
                }
            }
            catch
            {
                vm.PluginScripts = new List<string>();
                vm.PluginStyles = new List<string>();
            }

            // ── Multi-View Routing ──
            string viewParam = Request.QueryString["view"];
            string viewKeyParam = Request.QueryString["vk"];
            int recordId = 0;
            int.TryParse(Request.QueryString["id"], out recordId);
            vm.ActiveRecordId = recordId;

            // IMPORTANT v20260407-06:
            // Popup/fixed renderer settings for the normal submit/form view are also stored in
            // MF_ModuleViewConfig.ViewConfigJson. Previously we only copied ViewConfigJson when the
            // module was entering a non-submit multi-view (list/detail/card). That meant the normal
            // form renderer always received {} for moduleViewConfigJson, so popup runtime never
            // activated: the form stayed visible as a fixed form and click triggers did nothing.
            // Always surface the module-level ViewConfigJson to the renderer, then let explicit
            // multi-view routing override ActiveViewType below when needed.
            if (moduleConfig != null && !string.IsNullOrEmpty(moduleConfig.ViewConfigJson))
            {
                vm.ActiveViewConfigJson = moduleConfig.ViewConfigJson;
            }

            try
            {
                var allViews = form != null
                    ? (FormRepository.GetFormViews(form.FormId) ?? new List<FormViewInfo>())
                    : new List<FormViewInfo>();
                var moduleSelectedViewKey = FormViewSelector.ReadSelectedViewKey(
                    moduleConfig != null ? moduleConfig.ViewConfigJson : null,
                    Settings.Contains("MegaForm_CustomViewKey") ? Convert.ToString(Settings["MegaForm_CustomViewKey"]) : string.Empty);
                var selection = FormViewSelector.Resolve(
                    allViews,
                    viewParam,
                    viewKeyParam,
                    moduleSelectedViewKey,
                    moduleConfig != null ? moduleConfig.ViewType : null);

                vm.ActiveViewType = selection.ActiveViewType;
                vm.ActiveQueryKey = selection.ActiveQueryKey ?? string.Empty;

                if (!string.IsNullOrWhiteSpace(selection.ActiveViewType))
                {
                    if (selection.MatchedView != null)
                    {
                        vm.ActiveViewConfigJson = BuildResolvedViewConfigJson(selection.MatchedView);
                    }
                    else if (string.IsNullOrWhiteSpace(vm.ActiveViewConfigJson))
                    {
                        vm.ActiveViewConfigJson = "{}";
                    }
                }

                if (selection.MatchedView != null && HasViewPermissionRules(selection.MatchedView.PermissionsJson))
                {
                    var user = new UserContext
                    {
                        UserId = UserInfo.UserID,
                        UserName = UserInfo.Username,
                        IsAuthenticated = Request.IsAuthenticated,
                        IsAdmin = UserInfo.IsInRole("Administrators"),
                        IsSuperUser = UserInfo.IsSuperUser,
                        Roles = UserInfo.Roles?.ToList() ?? new List<string>()
                    };
                    // TODO: replace this stopgap with PermissionService.CanView once
                    // view-level rules are fully wired for DNN.
                    if (!user.IsAdmin && !user.IsSuperUser)
                    {
                        vm.ActiveViewType = null;
                        vm.ActiveViewConfigJson = moduleConfig != null && !string.IsNullOrEmpty(moduleConfig.ViewConfigJson)
                            ? moduleConfig.ViewConfigJson
                            : null;
                    }
                }
            }
            catch
            {
                if (!string.IsNullOrWhiteSpace(vm.ActiveViewType) && string.IsNullOrWhiteSpace(vm.ActiveViewConfigJson))
                {
                    vm.ActiveViewConfigJson = "{}";
                }
            }

            // ── AppScope & Inter-Instance Communication ──
            vm.AppScope = Settings.Contains("MegaForm_AppScope")
                ? Settings["MegaForm_AppScope"].ToString() : "";
            vm.BusChannel = Settings.Contains("MegaForm_BusChannel")
                ? Settings["MegaForm_BusChannel"].ToString() : vm.AppScope;
            vm.DetailModuleId = Settings.Contains("MegaForm_DetailModuleId")
                ? Settings["MegaForm_DetailModuleId"].ToString() : "";

            // If BusChannel empty, default to AppScope
            if (string.IsNullOrEmpty(vm.BusChannel))
                vm.BusChannel = vm.AppScope;

            return vm;
        }

        private static bool HasViewPermissionRules(string permissionsJson)
        {
            if (string.IsNullOrWhiteSpace(permissionsJson)) return false;
            try
            {
                var token = JToken.Parse(permissionsJson);
                if (token.Type == JTokenType.Array) return token.HasValues;
                if (token.Type == JTokenType.Object) return token.HasValues;
            }
            catch
            {
                return true;
            }

            return true;
        }



        /// <summary>
        /// [ModuleStyleDnn v20260714-01] Overlay this module's saved style (MegaForm_ModuleStyleJson,
        /// guarded by MegaForm_ModuleStyleFormId) onto the form's resolved settings JSON.
        /// customCss is deliberately NOT overlaid: an old snapshot carries a stale copy of the form's
        /// customCss and would hide every builder CSS/image edit on the public page (the bug Oqtane
        /// closed in [ModuleStyleCustomCss v20260707]).
        /// </summary>
        private string OverlayModuleStyle(string settingsJson, int formId)
        {
            try
            {
                if (formId <= 0 || string.IsNullOrWhiteSpace(settingsJson)) return settingsJson;
                if (!Settings.Contains("MegaForm_ModuleStyleFormId") || !Settings.Contains("MegaForm_ModuleStyleJson")) return settingsJson;

                int styleFormId;
                if (!int.TryParse(Convert.ToString(Settings["MegaForm_ModuleStyleFormId"]), out styleFormId) || styleFormId != formId)
                    return settingsJson;

                var styleRaw = Convert.ToString(Settings["MegaForm_ModuleStyleJson"]);
                if (string.IsNullOrWhiteSpace(styleRaw)) return settingsJson;

                var style = JObject.Parse(styleRaw);
                var settings = JObject.Parse(settingsJson);
                foreach (var key in new[] { "theme", "themeCssOverrides", "cssOverrides" })
                {
                    var token = style[key] ?? style[char.ToUpperInvariant(key[0]) + key.Substring(1)];
                    if (token != null && token.Type != JTokenType.Null) settings[key] = token;
                }
                return settings.ToString(Formatting.None);
            }
            catch
            {
                return settingsJson;   // non-fatal: fall back to the form's own settings
            }
        }

        private int ResolveRequestedFormId()
        {
            try
            {
                var raw = (Request.QueryString["formId"] ?? Request.QueryString["formid"] ?? Request.QueryString["FormId"] ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(raw)) return 0;
                if (int.TryParse(raw, out var direct) && direct > 0) return direct;
                var digits = new string(raw.Where(char.IsDigit).ToArray());
                if (int.TryParse(digits, out var parsed) && parsed > 0) return parsed;
            }
            catch { }
            return 0;
        }

        private int ResolveRequestedShellFormId()
        {
            try
            {
                var raw = (Request.QueryString["mfFormId"] ?? Request.QueryString["MfFormId"] ?? Request.QueryString["MFFormId"] ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(raw)) return 0;
                if (int.TryParse(raw, out var direct) && direct > 0) return direct;
                var digits = new string(raw.Where(char.IsDigit).ToArray());
                if (int.TryParse(digits, out var parsed) && parsed > 0) return parsed;
            }
            catch { }
            return 0;
        }

        private bool IsEmbedRequest()
        {
            try
            {
                var raw = (Request.QueryString["embed"] ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(raw)) return false;
                return raw == "1" || raw.Equals("true", StringComparison.OrdinalIgnoreCase) || raw.Equals("yes", StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private string BuildDashboardJson(FormRenderViewModel vm)
        {
            try
            {
                var forms = FormRepository.GetFormsByPortal(PortalId) ?? new List<FormInfo>();
                var statsMap = new Dictionary<int, FormStatsInfo>();
                var recentSubs = new List<SubmissionInfo>();
                int submissionsTotal = 0;
                var appDefinitions = new List<AppDefinitionInfo>();

                foreach (var form in forms)
                {
                    var stats = FormRepository.GetFormStats(form.FormId) ?? new FormStatsInfo();
                    statsMap[form.FormId] = stats;
                    submissionsTotal += stats.TotalSubmissions;
                    var recent = FormRepository.ListSubmissions(form.FormId, pageSize: 3).Items;
                    if (recent != null && recent.Count > 0) recentSubs.AddRange(recent);
                }

                recentSubs = recentSubs
                    .OrderByDescending(x => x.SubmittedOnUtc)
                    .Take(6)
                    .ToList();

                try
                {
                    appDefinitions = MegaForm.DNN.Services.DnnServiceLocator.Instance.Phase2Repo.ListAppDefinitions(PortalId, null) ?? new List<AppDefinitionInfo>();
                }
                catch
                {
                    appDefinitions = new List<AppDefinitionInfo>();
                }

                var appByScope = appDefinitions
                    .Where(a => a != null && !string.IsNullOrWhiteSpace(a.AppScope))
                    .GroupBy(a => a.AppScope.Trim(), StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(
                        g => g.Key,
                        g => g.OrderBy(a => a.SortOrder).ThenBy(a => a.AppId).FirstOrDefault(),
                        StringComparer.OrdinalIgnoreCase);

                string builderHref = vm.FormId > 0
                    ? EditUrl("formId", vm.FormId.ToString(), "Edit")
                    : EditUrl("new", "1", "Edit");

                string submissionsHref = vm.FormId > 0
                    ? EditUrl("formId", vm.FormId.ToString(), "Submissions")
                    : EditUrl("Submissions");

                var dashboard = new
                {
                    counts = new { forms = forms.Count, submissions = submissionsTotal },
                    stats = new object[]
                    {
                        new { label = "Total Forms", value = forms.Count, meta = forms.Count(f => string.Equals(f.Status, "Published", StringComparison.OrdinalIgnoreCase)) + " published", icon = "fa-regular fa-file-lines" },
                        new { label = "Submissions", value = submissionsTotal, meta = recentSubs.Count + " recent", icon = "fa-regular fa-message" },
                        new { label = "Current Form", value = vm.FormId > 0 ? (object)vm.FormId : "—", meta = !string.IsNullOrWhiteSpace(vm.Title) ? vm.Title : "No form selected", icon = "fa-solid fa-pen-ruler" },
                        new { label = "Platform", value = "DNN", meta = "Shared dashboard shell", icon = "fa-solid fa-database" },
                    },
                    recentForms = forms
                        .OrderByDescending(f => f.UpdatedOnUtc ?? f.CreatedOnUtc)
                        .ThenByDescending(f => f.FormId)
                        .Select(f =>
                        {
                            AppDefinitionInfo app = null;
                            var scope = (f.AppScope ?? string.Empty).Trim();
                            if (!string.IsNullOrWhiteSpace(scope))
                                appByScope.TryGetValue(scope, out app);
                            return new
                            {
                                formId = f.FormId,
                                title = f.Title ?? ("Form #" + f.FormId),
                                status = f.Status ?? "Draft",
                                fields = CountFields(f.SchemaJson),
                                modified = (f.UpdatedOnUtc ?? f.CreatedOnUtc).ToString("yyyy-MM-dd HH:mm"),
                                submissions = statsMap.ContainsKey(f.FormId) ? statsMap[f.FormId].TotalSubmissions : 0,
                                appScope = scope,
                                appKey = app != null ? app.AppKey ?? string.Empty : string.Empty,
                                appName = app != null ? app.AppName ?? string.Empty : string.Empty,
                                appIcon = app != null ? app.Icon ?? string.Empty : string.Empty,
                                appColor = app != null ? app.AccentColor ?? string.Empty : string.Empty,
                                appDescription = app != null ? app.Description ?? string.Empty : string.Empty,
                                formRole = InferDashboardFormRole(f.Title),
                                isAppPrimary = IsDashboardPrimaryForm(f.Title),
                                // FEATURE v20260405-18: expose custom public view URL so dashboard
                                // "View Live" opens the correct DNN page instead of Default.aspx?formid=N
                                viewUrl = ReadViewUrl(f.SettingsJson)
                            };
                        })
                        .ToArray(),
                    appDefinitions = appDefinitions
                        .Where(a => a != null)
                        .OrderBy(a => a.SortOrder)
                        .ThenBy(a => a.AppName)
                        .Select(a => new
                        {
                            appId = a.AppId,
                            appKey = a.AppKey ?? string.Empty,
                            appName = a.AppName ?? string.Empty,
                            appScope = a.AppScope ?? string.Empty,
                            description = a.Description ?? string.Empty,
                            icon = a.Icon ?? string.Empty,
                            accentColor = a.AccentColor ?? string.Empty,
                            sortOrder = a.SortOrder,
                            formCount = forms.Count(f => string.Equals((f.AppScope ?? string.Empty).Trim(), (a.AppScope ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase))
                        })
                        .ToArray(),
                    lockedFormIds = ReadLockedFormIds().OrderBy(x => x).ToArray(),
                    recentSubmissions = recentSubs.Select(s => new
                    {
                        submissionId = s.SubmissionId,
                        formId = s.FormId,
                        formTitle = forms.FirstOrDefault(f => f.FormId == s.FormId)?.Title ?? ("Form #" + s.FormId),
                        submittedOnUtc = s.SubmittedOnUtc,
                        status = s.Status ?? "Submitted"
                    }).ToArray(),
                    quickActions = new object[]
                    {
                        new { title = "Views", subtitle = "Choose which form this module renders", icon = "fa-solid fa-clone", href = BuildShellRoute("views") },
                        new { title = "Form Builder", subtitle = "Create and update forms", icon = "fa-solid fa-pen-ruler", href = BuildShellRoute("builder") },
                        new { title = "Submissions", subtitle = "Review captured responses", icon = "fa-solid fa-inbox", href = BuildShellRoute("submissions") },
                        new { title = "Theme Designer", subtitle = "Adjust colors, type and spacing", icon = "fa-solid fa-palette", href = BuildShellRoute("theme") },
                    },
                    system = new object[]
                    {
                        new { key = "Platform", value = "DNN" },
                        new { key = "Portal", value = PortalSettings?.PortalName ?? ("Portal #" + PortalId) },
                        new { key = "ModuleId", value = ModuleId.ToString() },
                        new { key = "API", value = vm.ApiBaseUrl ?? "/DesktopModules/MegaForm/API/" },
                        new { key = "Scope", value = string.IsNullOrWhiteSpace(vm.AppScope) ? "Standalone" : vm.AppScope },
                    }
                };

                return JsonConvert.SerializeObject(dashboard);
            }
            catch
            {
                return "{}";
            }
        }

        private static string InferDashboardFormRole(string title)
        {
            var value = (title ?? string.Empty).ToLowerInvariant();
            if (value.Contains("categor")) return "Categories";
            if (value.Contains("comment")) return "Comments";
            if (value.Contains("reader") || value.Contains("event") || value.Contains("analytic")) return "Analytics";
            if (value.Contains("application")) return "Applications";
            if (value.Contains("interview")) return "Interviews";
            if (value.Contains("blog") || value.Contains("post") || value.Contains("publish")) return "Primary";
            return "Form";
        }

        private static bool IsDashboardPrimaryForm(string title)
        {
            var value = (title ?? string.Empty).ToLowerInvariant();
            if (value.Contains("comment") || value.Contains("categor") || value.Contains("reader") || value.Contains("event") || value.Contains("analytic"))
                return false;
            return value.Contains("starter") || value.Contains("publish") || value.Contains("post") || value.Contains("article");
        }

        private List<int> ReadLockedFormIds()
        {
            try
            {
                var path = ResolveLockedFormsPath();
                if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return new List<int>();
                var json = File.ReadAllText(path);
                return JsonConvert.DeserializeObject<List<int>>(json) ?? new List<int>();
            }
            catch
            {
                return new List<int>();
            }
        }

        private string ResolveLockedFormsPath()
        {
            try
            {
                var portalHome = PortalSettings?.HomeDirectoryMapPath;
                if (!string.IsNullOrWhiteSpace(portalHome))
                    return Path.Combine(portalHome, "MegaForm", "locked-forms.json");
            }
            catch { }

            try
            {
                var appPath = System.Web.Hosting.HostingEnvironment.MapPath("~/");
                if (!string.IsNullOrWhiteSpace(appPath))
                    return Path.Combine(appPath, "App_Data", "MegaForm", "locked-forms.json");
            }
            catch { }

            return null;
        }

        private bool HasLockFile(string fileName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(fileName)) return false;

                var portalHome = PortalSettings?.HomeDirectoryMapPath;
                if (!string.IsNullOrWhiteSpace(portalHome) && File.Exists(Path.Combine(portalHome, fileName)))
                    return true;

                var appPath = System.Web.Hosting.HostingEnvironment.MapPath("~/");
                if (!string.IsNullOrWhiteSpace(appPath) && File.Exists(Path.Combine(appPath, fileName)))
                    return true;
            }
            catch { }

            return false;
        }

        /// <summary>
        /// FEATURE v20260405-18: Read settingsJson.viewUrl for a form.
        /// Returns null/empty if not set or parse fails.
        /// </summary>
        private static string ReadViewUrl(string settingsJson)
        {
            if (string.IsNullOrWhiteSpace(settingsJson)) return null;
            try
            {
                var s = JObject.Parse(settingsJson);
                var v = s["viewUrl"]?.ToString();
                return string.IsNullOrWhiteSpace(v) ? null : v.Trim();
            }
            catch { return null; }
        }

        /// <summary>
        /// Removes fields the current visitor may not see from a schema before it is inlined into the
        /// page. Resolves the actor from DNN's UserInfo; on any failure it projects as anonymous, which
        /// withholds more rather than less. Mirrors the schema-endpoint twins on all three platforms.
        /// </summary>
        private string ProjectSchemaForCurrentVisitor(int formId, string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return schemaJson;

            try
            {
                var actor = new UserContext
                {
                    UserId = UserInfo != null ? UserInfo.UserID : 0,
                    UserName = UserInfo != null ? (UserInfo.Username ?? string.Empty) : string.Empty,
                    Email = UserInfo != null ? (UserInfo.Email ?? string.Empty) : string.Empty,
                    IsAuthenticated = UserInfo != null && UserInfo.UserID > 0,
                    IsAdmin = UserInfo != null && UserInfo.IsInRole("Administrators"),
                    IsSuperUser = UserInfo != null && UserInfo.IsSuperUser,
                    Roles = UserInfo != null && UserInfo.Roles != null ? UserInfo.Roles.ToList() : new List<string>()
                };

                var permissions = FormRepository.GetFormPermissions(formId) ?? Enumerable.Empty<FormPermissionInfo>();

                var query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (Request != null && Request.QueryString != null)
                    foreach (string k in Request.QueryString.Keys)
                        if (!string.IsNullOrEmpty(k)) query[k] = Request.QueryString[k];

                return MegaForm.Core.Services.FormAccessProjection
                    .ProjectForActor(formId, schemaJson, actor, permissions, query).SchemaJson;
            }
            catch
            {
                // Never let projection failure fall through to serving the unfiltered schema.
                return MegaForm.Core.Services.FormAccessProjection
                    .ProjectForActor(formId, schemaJson, new UserContext(), Enumerable.Empty<FormPermissionInfo>(), null).SchemaJson;
            }
        }

        private static int CountFields(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return 0;
            try
            {
                var token = JToken.Parse(schemaJson);
                var fields = token["fields"] ?? token["Fields"];
                if (fields is JArray arr) return CountFieldsRecursive(arr);
                var pages = token["pages"] ?? token["Pages"];
                if (pages is JArray pagesArr)
                {
                    int total = 0;
                    foreach (var page in pagesArr)
                    {
                        var pf = page?["fields"] ?? page?["Fields"];
                        if (pf is JArray pfArr) total += CountFieldsRecursive(pfArr);
                    }
                    return total;
                }
            }
            catch { }
            return 0;
        }

        private static int CountFieldsRecursive(JArray arr)
        {
            int total = 0;
            foreach (var item in arr)
            {
                var type = (string)(item?["type"] ?? item?["Type"]) ?? string.Empty;
                if (string.Equals(type, "Row", StringComparison.OrdinalIgnoreCase))
                {
                    var cols = item?["columns"] ?? item?["Columns"];
                    if (cols is JArray colsArr)
                    {
                        foreach (var col in colsArr)
                        {
                            var child = col?["fields"] ?? col?["Fields"];
                            if (child is JArray childArr) total += CountFieldsRecursive(childArr);
                        }
                    }
                    continue;
                }

                if (string.Equals(type, "Section", StringComparison.OrdinalIgnoreCase) || string.Equals(type, "Html", StringComparison.OrdinalIgnoreCase))
                    continue;

                total++;
            }
            return total;
        }
        private static string ApplySettingsToSchema(string schemaJson, string settingsJson)
        {
            return RenderModelResolver.ResolveSchemaJson(schemaJson, settingsJson);
        }

        private void RegisterPluginStyles(IEnumerable<string> files, int basePriority, string versionSuffix = "")
        {
            try
            {
                if (files == null) return;
                int p = basePriority;
                foreach (var file in files.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    ClientResourceManager.RegisterStyleSheet(Page,
                        "/DesktopModules/MegaForm/Assets/css/plugins/" + Path.GetFileName(file) + versionSuffix, p++);
                }
            }
            catch { }
        }

        private bool ResolveAutoQrCodeEnabled(FormRenderViewModel vm)
        {
            try
            {
                var raw = Settings.Contains(SettingKeyAutoQrCode) ? Convert.ToString(Settings[SettingKeyAutoQrCode]) : string.Empty;
                var enabled = string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase) || string.Equals(raw, "1", StringComparison.OrdinalIgnoreCase);
                if (!enabled) return false;
                if (vm != null && vm.IsAdmin && vm.IsInEditMode && !vm.LiveRenderMode) return false;
                return vm != null && vm.FormId > 0;
            }
            catch
            {
                return false;
            }
        }

        private string BuildQrCodeTargetUrl(FormInfo form)
        {
            try
            {
                // [RendererHostRetired v20260714-01] The portal Renderer Host used to outrank the
                // form's own public URL here — the priority was backwards, and the concept is gone.
                // The form's explicit view URL is now the only override; otherwise the QR points at
                // the page the form is actually rendering on (Request.Url, resolved below).
                var explicitViewUrl = form != null ? ReadViewUrl(form.SettingsJson) : null;
                var preferred = explicitViewUrl;

                Uri baseUri = null;
                if (!string.IsNullOrWhiteSpace(preferred))
                {
                    var raw = preferred.Trim();
                    baseUri = raw.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                        ? new Uri(raw, UriKind.Absolute)
                        : new Uri(Request.Url, raw.StartsWith("/") ? raw : "/" + raw);
                }
                else if (Request != null && Request.Url != null)
                {
                    baseUri = new Uri(Request.Url.GetLeftPart(UriPartial.Path));
                }

                if (baseUri == null) return string.Empty;

                var ub = new UriBuilder(baseUri);
                var qs = System.Web.HttpUtility.ParseQueryString(ub.Query ?? string.Empty);
                foreach (var key in new[] { "formId", "formid", "FormId", "mfFormId", "embed", "configure", "new" })
                    qs.Remove(key);
                if (form != null && form.FormId > 0) qs.Set("formid", form.FormId.ToString());
                ub.Query = qs.ToString();
                ub.Fragment = string.Empty;
                return ub.Uri.ToString();
            }
            catch
            {
                return string.Empty;
            }
        }

        private void RegisterPluginScripts(IEnumerable<string> files, int basePriority, string versionSuffix = "")
        {
            try
            {
                if (files == null) return;
                int p = basePriority;
                foreach (var file in files.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    var fileName = Path.GetFileName(file);
                    if (IsExcludedLegacyPaymentPlugin(fileName)) continue;
                    ClientResourceManager.RegisterScript(Page,
                        "/DesktopModules/MegaForm/Assets/js/plugins/" + fileName + versionSuffix, p++);
                }
            }
            catch { }
        }

        private void RegisterQrCodePluginFallback(FormRenderViewModel vm, string assetsBase, string versionSuffix, int priority)
        {
            try
            {
                if (!ShouldRegisterQrCodePlugin(vm)) return;
                ClientResourceManager.RegisterScript(Page,
                    assetsBase + "js/plugins/megaform-widget-qrcode.js" + versionSuffix, priority);
            }
            catch { }
        }

        private static bool ShouldRegisterQrCodePlugin(FormRenderViewModel vm)
        {
            try
            {
                if (vm != null && vm.AutoQrCodeEnabled) return true;
                if (vm != null && vm.PluginScripts != null && vm.PluginScripts.Any(x =>
                    !string.IsNullOrWhiteSpace(x) &&
                    string.Equals(Path.GetFileName(x), "megaform-widget-qrcode.js", StringComparison.OrdinalIgnoreCase)))
                    return true;
            }
            catch { }

            var raw = vm != null
                ? (vm.ResolvedSchemaJson ?? vm.SchemaJson ?? string.Empty)
                : string.Empty;
            if (string.IsNullOrWhiteSpace(raw)) return false;

            return raw.IndexOf("\"type\":\"QRCode\"", StringComparison.OrdinalIgnoreCase) >= 0
                || raw.IndexOf("\"type\": \"QRCode\"", StringComparison.OrdinalIgnoreCase) >= 0
                || raw.IndexOf("\"type\":\"qrcode\"", StringComparison.OrdinalIgnoreCase) >= 0
                || raw.IndexOf("\"type\": \"qrcode\"", StringComparison.OrdinalIgnoreCase) >= 0
                || raw.IndexOf("\"type\":\"qr\"", StringComparison.OrdinalIgnoreCase) >= 0
                || raw.IndexOf("\"type\": \"qr\"", StringComparison.OrdinalIgnoreCase) >= 0
                || raw.IndexOf("\"type\":\"QR Code\"", StringComparison.OrdinalIgnoreCase) >= 0
                || raw.IndexOf("\"type\": \"QR Code\"", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private void RegisterPluginStyles(int basePriority, string versionSuffix = "")
        {
            try
            {
                string dir = Server.MapPath("~/DesktopModules/MegaForm/Assets/css/plugins");
                if (!Directory.Exists(dir)) return;
                int p = basePriority;
                foreach (var f in Directory.GetFiles(dir, "*.css").OrderBy(x => x))
                    ClientResourceManager.RegisterStyleSheet(Page,
                        "/DesktopModules/MegaForm/Assets/css/plugins/" + Path.GetFileName(f) + versionSuffix, p++);
            }
            catch { }
        }

        private void RegisterPluginScripts(int basePriority, string versionSuffix = "")
        {
            try
            {
                string dir = Server.MapPath("~/DesktopModules/MegaForm/Assets/js/plugins");
                if (!Directory.Exists(dir)) return;
                int p = basePriority;
                foreach (var f in Directory.GetFiles(dir, "*.js").OrderBy(x => x))
                {
                    var fileName = Path.GetFileName(f);
                    if (IsExcludedLegacyPaymentPlugin(fileName)) continue;
                    ClientResourceManager.RegisterScript(Page,
                        "/DesktopModules/MegaForm/Assets/js/plugins/" + fileName + versionSuffix, p++);
                }
            }
            catch { }
        }

        private void ScanPluginFiles(FormRenderViewModel vm)
        {
            try
            {
                string basePath = Server.MapPath("~/DesktopModules/MegaForm/Assets/");
                string jsDir = Path.Combine(basePath, "js", "plugins");
                string cssDir = Path.Combine(basePath, "css", "plugins");
                string baseUrl = "/DesktopModules/MegaForm/Assets/";

                if (Directory.Exists(jsDir))
                {
                    foreach (var file in Directory.GetFiles(jsDir, "*.js").OrderBy(f => f))
                    {
                        var fileName = Path.GetFileName(file);
                        if (IsExcludedLegacyPaymentPlugin(fileName)) continue;
                        vm.PluginScripts.Add(baseUrl + "js/plugins/" + fileName);
                    }
                }
                if (Directory.Exists(cssDir))
                {
                    foreach (var file in Directory.GetFiles(cssDir, "*.css").OrderBy(f => f))
                    {
                        vm.PluginStyles.Add(baseUrl + "css/plugins/" + Path.GetFileName(file));
                    }
                }
            }
            catch { /* folder doesn't exist yet — no plugins, that's fine */ }
        }

        private static bool IsExcludedLegacyPaymentPlugin(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName)) return false;
            var name = Path.GetFileName(fileName);
            return name.Equals("megaform-widget-payment.js", StringComparison.OrdinalIgnoreCase)
                || name.Equals("widget-payment.js", StringComparison.OrdinalIgnoreCase)
                // [B28] ProductLineItems widget retired — see token-designer / slider / image-choice designers.
                || name.Equals("megaform-widget-product-line-items.js", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Scan /plugins/ folders and register via ClientResourceManager.
        /// </summary>
        private void RegisterPluginResources(int basePriority)
        {
            try
            {
                string basePath = Server.MapPath("~/DesktopModules/MegaForm/Assets/");
                string jsDir = Path.Combine(basePath, "js", "plugins");
                string cssDir = Path.Combine(basePath, "css", "plugins");
                string baseUrl = "/DesktopModules/MegaForm/Assets/";
                int p = basePriority;

                if (Directory.Exists(cssDir))
                {
                    foreach (var file in Directory.GetFiles(cssDir, "*.css").OrderBy(f => f))
                    {
                        var cssName = Path.GetFileName(file);
                        if (IsExcludedLegacyPaymentPlugin(cssName.Replace(".css", ".js"))) continue;
                        ClientResourceManager.RegisterStyleSheet(Page,
                            baseUrl + "css/plugins/" + cssName + "?v=10041", p++);
                    }
                }
                if (Directory.Exists(jsDir))
                {
                    foreach (var file in Directory.GetFiles(jsDir, "*.js").OrderBy(f => f))
                    {
                        var jsName = Path.GetFileName(file);
                        if (IsExcludedLegacyPaymentPlugin(jsName)) continue;
                        ClientResourceManager.RegisterScript(Page,
                            baseUrl + "js/plugins/" + jsName + "?v=10041", p++);
                    }
                }
            }
            catch { }
        }

        /// <summary>
        /// Kept for backward compatibility — returns empty since plugins now load via ClientResourceManager.
        /// </summary>
        protected string RenderPluginTags()
        {
            return string.Empty;
        }

        private void RegisterLocaleScript(int priority)
        {
            try
            {
                string locale = System.Threading.Thread.CurrentThread.CurrentCulture.Name;
                if (string.IsNullOrEmpty(locale)) locale = "en-US";
                string localeFile = Server.MapPath("~/DesktopModules/MegaForm/Assets/js/locales/" + locale + ".js");
                if (System.IO.File.Exists(localeFile))
                {
                    ClientResourceManager.RegisterScript(Page,
                        "/DesktopModules/MegaForm/Assets/js/locales/" + locale + ".js?v=10041", priority);
                }
            }
            catch { }
        }

        // Inline admin dock remains the canonical rich admin surface for DNN.
        // Action menu mirrors the same canonical hash routes that dnn-host.ts handles
        // (#mf-dashboard, #mf-submissions). Keeps DNN/Oqtane/Web consistent: same routes,
        // host shell only differs in chrome.
        public const string DnnActionMenuBadge = "DNN ActionMenu v20260430-04";

        public ModuleActionCollection ModuleActions
        {
            get
            {
                var actions = new ModuleActionCollection();
                _ = DnnActionMenuBadge; // ensure compiler emits the constant string into the assembly

                // 1. Manage module (existing)
                actions.Add(
                    GetNextActionID(),
                    "Manage module",
                    ModuleActionType.EditContent,
                    string.Empty,
                    "edit.gif",
                    EditUrl("ManageModule"),
                    false,
                    SecurityAccessLevel.Edit,
                    true,
                    false);

                // 2. Form Dashboard — overlay route handled by megaform-dnn-host.js
                actions.Add(
                    GetNextActionID(),
                    "Form Dashboard",
                    ModuleActionType.ContentOptions,
                    string.Empty,
                    "view.gif",
                    BuildHashRoute("mf-dashboard", 0),
                    false,
                    SecurityAccessLevel.Edit,
                    true,
                    false);

                // 3. View Submissions — only when a form is bound to this module
                int formId = GetBoundFormIdSafe();
                if (formId > 0)
                {
                    actions.Add(
                        GetNextActionID(),
                        "View Submissions",
                        ModuleActionType.ContentOptions,
                        string.Empty,
                        "lt.gif",
                        BuildHashRoute("mf-submissions", formId),
                        false,
                        SecurityAccessLevel.Edit,
                        true,
                        false);
                }

                return actions;
            }
        }

        // Builds tab-page URL + ?mfFormId=N (when N>0) + #mf-{mode}.
        // Same shape that dnn-host.ts setHash() produces for in-page overlay navigation.
        private string BuildHashRoute(string mode, int formId)
        {
            string baseUrl;
            try { baseUrl = DotNetNuke.Common.Globals.NavigateURL(TabId) ?? string.Empty; }
            catch { baseUrl = string.Empty; }
            if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = "/";
            var hashIdx = baseUrl.IndexOf('#');
            if (hashIdx >= 0) baseUrl = baseUrl.Substring(0, hashIdx);
            var qs = string.Empty;
            if (formId > 0)
            {
                qs = (baseUrl.Contains("?") ? "&" : "?") + "mfFormId=" + formId;
            }
            return baseUrl + qs + "#" + mode;
        }

        private int GetBoundFormIdSafe()
        {
            try
            {
                int id;
                if (Settings != null && Settings.Contains("MegaForm_FormId") && Settings["MegaForm_FormId"] != null
                    && int.TryParse(Settings["MegaForm_FormId"].ToString(), out id) && id > 0)
                {
                    return id;
                }
            }
            catch { }
            return 0;
        }

        private static LocalAssetManifest BuildAssetManifest(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson))
                return new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };

            try
            {
                var schema = JsonConvert.DeserializeObject<FormSchema>(schemaJson) ?? new FormSchema();
                return BuildAssetManifest(schema);
            }
            catch
            {
                return new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };
            }
        }

        private static LocalAssetManifest BuildAssetManifest(FormSchema schema)
        {
            var manifest = new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };
            if (schema?.Fields == null || schema.Fields.Count == 0)
                return manifest;

            var scripts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var styles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var flatFields = MegaFormUtils.FlattenFields(schema.Fields);

            foreach (var field in flatFields)
            {
                var type = (field?.Type ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(type))
                    continue;

                switch (type.ToLowerInvariant())
                {
                    case "repeater":
                        AddAsset(scripts, styles, "megaform-widget-repeater.js", "megaform-widget-repeater.css");
                        break;
                    case "signature":
                        AddAsset(scripts, styles, "megaform-widget-signature.js", "megaform-widget-signature.css");
                        break;
                    case "calculator":
                        AddAsset(scripts, styles, "megaform-widget-calculator.js", "megaform-widget-calculator.css");
                        break;
                    case "rating":
                    case "likert":
                    case "nps":
                    case "opinionscale":
                    case "ranking":
                        AddAsset(scripts, styles, "megaform-widget-rating-suite.js", "megaform-widget-rating-suite.css");
                        break;
                    case "imagechoice":
                        AddScript(scripts, "megaform-widget-image-choice.js");
                        break;
                    case "advancedfile":
                        AddAsset(scripts, styles, "megaform-widget-advanced-file.js", "megaform-widget-advanced-file.css");
                        break;
                    case "richtext":
                        AddAsset(scripts, styles, "megaform-widget-rich-text.js", "megaform-widget-rich-text.css");
                        break;
                    case "payment":
                    case "paymentsummary":
                    case "paypal":
                    case "stripe":
                    case "square":
                        AddPaymentAssets(field, scripts, styles);
                        break;
                    case "appointment":
                        AddScript(scripts, "megaform-widget-appointment.js");
                        break;
                    case "geolocation":
                        AddScript(scripts, "megaform-widget-geolocation.js");
                        break;
                    case "infinitelist":
                        AddAsset(scripts, styles, "megaform-widget-infinite-list.js", "megaform-widget-infinite-list.css");
                        break;
                    case "productlineitems":
                        AddAsset(scripts, styles, "megaform-widget-product-line-items.js", "megaform-widget-product-line-items.css");
                        break;
                    case "drawonimage":
                        AddAsset(scripts, styles, "megaform-widget-draw-on-image.js", "megaform-widget-draw-on-image.css");
                        break;
                    case "videoembed":
                        AddAsset(scripts, styles, "megaform-widget-video-embed.js", "megaform-widget-video-embed.css");
                        break;
                    case "gridrepeater":
                        AddAsset(scripts, styles, "megaform-widget-grid-repeater.js", "megaform-widget-grid-repeater.css");
                        break;
                    case "pdfform":
                        // [PdfForm v20260506-01] Vite-bundled multi-file builder; CSS inlined in JS.
                        AddScript(scripts, "megaform-widget-pdf-form.js");
                        break;
                    case "phonenumberpro":
                        AddAsset(scripts, styles, "megaform-widget-phone-pro.js", "megaform-widget-phone-pro.css");
                        break;
                    case "captcha":
                        AddScript(scripts, "megaform-widget-captcha.js");
                        break;
                    // [CoreAssetManifest v20260504-05] Missing widget plugin
                    // registrations — without these the public form renderer
                    // never loaded the data-repeater / golf-scorecard / etc.
                    // plugin scripts, so the renderer iterated the field list,
                    // found no registered handler, and rendered nothing for
                    // those fields. The result was a form page with only
                    // header/customHtml visible and an empty fields container.
                    case "datarepeater":
                        AddAsset(scripts, styles, "megaform-widget-data-repeater.js", "megaform-widget-data-repeater.css");
                        break;
                    case "golfscorecard":
                        AddAsset(scripts, styles, "megaform-widget-golf-scorecard.js", "megaform-widget-golf-scorecard.css");
                        break;
                    case "subform":
                        AddScript(scripts, "megaform-widget-subform.js");
                        break;
                    case "contentslider":
                        AddScript(scripts, "megaform-widget-content-slider.js");
                        break;
                    case "qrcode":
                        AddScript(scripts, "megaform-widget-qrcode.js");
                        break;
                    case "dynamiclabel":
                        AddAsset(scripts, styles, "megaform-widget-dynamic-label.js", "megaform-widget-dynamic-label.css");
                        break;
                    case "razor":
                        AddAsset(scripts, styles, "megaform-widget-razor.js", "megaform-widget-razor.css");
                        break;
                    // [v20260531-DataGridLoader] Anonymous public renderer was
                    // dispatching MegaFormWidgets.renderWidget("DataGrid", …)
                    // against an unregistered type → "plugin not installed"
                    // fallback rendered empty cells. Load the datagrid plugin
                    // (and its SQL-display companion) whenever the schema uses
                    // a DataGrid field.
                    case "datagrid":
                        AddAsset(scripts, styles, "megaform-widget-datagrid.js", "megaform-widget-datagrid.css");
                        AddScript(scripts, "megaform-widget-datagrid-sql.js");
                        break;
                }
            }

            manifest.ScriptFiles = scripts.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            manifest.StyleFiles = styles.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            return manifest;
        }

        private static void AddPaymentAssets(FormField field, HashSet<string> scripts, HashSet<string> styles)
        {
            AddStyle(styles, "megaform-widget-payment.css");
            AddScript(scripts, "megaform-widget-payment-unified.js");

            var provider = GetWidgetProp(field, "provider");
            provider = string.IsNullOrWhiteSpace(provider) ? "both" : provider.Trim().ToLowerInvariant();
            var loadStripe = provider == "both" || provider == "stripe" || provider == "card" || provider == "all";
            var loadPaypal = provider == "both" || provider == "paypal" || provider == "all";

            if (loadStripe)
                AddAsset(scripts, styles, "megaform-widget-stripe.js", "megaform-widget-stripe.css");
            if (loadPaypal)
                AddAsset(scripts, styles, "megaform-widget-paypal.js", "megaform-widget-paypal.css");
        }

        private static string GetWidgetProp(FormField field, string key)
        {
            if (field?.WidgetProps == null || string.IsNullOrWhiteSpace(key))
                return null;

            foreach (var kv in field.WidgetProps)
            {
                if (string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase))
                    return kv.Value?.ToString();
            }
            return null;
        }

        private static void AddAsset(HashSet<string> scripts, HashSet<string> styles, string scriptFile, string styleFile)
        {
            AddScript(scripts, scriptFile);
            AddStyle(styles, styleFile);
        }

        private static void AddScript(HashSet<string> scripts, string scriptFile)
        {
            if (!string.IsNullOrWhiteSpace(scriptFile))
                scripts.Add(scriptFile);
        }

        private static void AddStyle(HashSet<string> styles, string styleFile)
        {
            if (!string.IsNullOrWhiteSpace(styleFile))
                styles.Add(styleFile);
        }


        private sealed class LocalAssetManifest
        {
            public string Badge { get; set; }
            public List<string> ScriptFiles { get; set; } = new List<string>();
            public List<string> StyleFiles { get; set; } = new List<string>();
        }

    }
}
