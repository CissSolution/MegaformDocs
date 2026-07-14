using System;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Web.Api;
using MegaForm.Core.Rendering;
using MegaForm.DNN.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// [ModuleStyleDnn v20260714-01] Per-module CSS source — the DNN twin of Oqtane's
    /// ModuleConfig/ModuleStyle + ModuleConfig/SaveModuleStyle (MegaFormController.cs:2969-3065).
    ///
    /// Each module instance owns ONE style (theme + CSS var map) for the form it currently renders,
    /// stored in module settings MegaForm_ModuleStyleJson keyed by MegaForm_ModuleStyleFormId. The
    /// public render overlays it onto the form's settings (module-setting-wins, see
    /// FormView.ascx.cs OverlayModuleStyle), so two modules can render the SAME form with different
    /// looks. Without these endpoints the shared Settings popup's "Theme &amp; Layout" tab was dead on
    /// DNN (404 → it silently fell back to defaults).
    ///
    /// Auth: Edit permission on the module — this writes module settings that change what every
    /// visitor sees. POST also requires the antiforgery token (the popup sends it).
    /// </summary>
    [DnnAuthorize]
    public class ModuleStyleController : DnnApiController
    {
        private const string SettingKeyStyleJson = "MegaForm_ModuleStyleJson";
        private const string SettingKeyStyleFormId = "MegaForm_ModuleStyleFormId";

        /// <summary>Style fields the snapshot owns. customCss is deliberately NOT among them — a copied
        /// customCss goes stale the moment the form is edited and then wins over the form's live CSS
        /// (the bug Oqtane fixed in [ModuleStyleCustomCss v20260707]).</summary>
        private static readonly string[] StyleKeys = { "theme", "themeCssOverrides", "cssOverrides" };

        /// <summary>GET api/ModuleConfig/ModuleStyle?moduleId=1&amp;formId=2</summary>
        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(int moduleId = 0, int formId = 0)
        {
            if (!IsPortalAdmin())
                return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "Administrators only." });
            if (moduleId <= 0 || formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "moduleId and formId required" });

            var settings = new ModuleController().GetModuleSettings(moduleId);
            var storedFormId = ReadSetting(settings, SettingKeyStyleFormId);
            var storedJson = ReadSetting(settings, SettingKeyStyleJson);

            int parsedFormId;
            if (int.TryParse(storedFormId, out parsedFormId) && parsedFormId == formId && !string.IsNullOrWhiteSpace(storedJson))
            {
                try
                {
                    var existing = JObject.Parse(storedJson);
                    return Request.CreateResponse(HttpStatusCode.OK, new { moduleId, formId, seeded = false, style = existing });
                }
                catch { /* corrupt → reseed below */ }
            }

            // No style yet, or the module was bound to a DIFFERENT form → seed from this form's CSS.
            var seeded = SeedFromForm(moduleId, formId);
            return Request.CreateResponse(HttpStatusCode.OK, new { moduleId, formId, seeded = true, style = seeded });
        }

        /// <summary>POST api/ModuleConfig/SaveModuleStyle — { moduleId, formId, theme, themeCssOverrides }</summary>
        [HttpPost]
        [ActionName("Save")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Save([FromBody] JObject body)
        {
            if (!IsPortalAdmin())
                return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "Administrators only." });
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Request body is empty" });
            var moduleId = body.Value<int?>("moduleId") ?? 0;
            var formId = body.Value<int?>("formId") ?? 0;
            if (moduleId <= 0 || formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "moduleId and formId required" });

            var style = new JObject();
            foreach (var key in StyleKeys)
            {
                var token = body[key];
                if (token != null && token.Type != JTokenType.Null) style[key] = token;
            }

            Write(moduleId, formId, style);
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, moduleId, formId });
        }

        // ── helpers ──────────────────────────────────────────────────────────────

        /// <summary>
        /// Admin gate. [DnnModuleAuthorize] was the obvious choice but it resolves the module from
        /// the ModuleId/TabId REQUEST HEADERS, which the shared Settings popup does not send (and
        /// which DNN rejects outright on child-portal subpath aliases — see the ServicesFramework
        /// note in dnn-host). Resolve the actor from UserInfo instead: never from the request.
        /// </summary>
        private bool IsPortalAdmin()
        {
            var user = UserInfo;
            return user != null && user.UserID > 0 && (user.IsSuperUser || user.IsInRole("Administrators"));
        }
        private static string ReadSetting(System.Collections.Hashtable settings, string key)
        {
            if (settings == null || !settings.ContainsKey(key)) return string.Empty;
            return Convert.ToString(settings[key]) ?? string.Empty;
        }

        /// <summary>Copy the form's own theme/var-map style into the module snapshot.</summary>
        private static JObject SeedFromForm(int moduleId, int formId)
        {
            var style = new JObject();
            try
            {
                var form = FormRepository.GetForm(formId);
                if (form != null)
                {
                    var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson);
                    var schemaJson = resolved != null ? resolved.SchemaJson : null;
                    var settingsObj = string.IsNullOrWhiteSpace(schemaJson) ? null : JObject.Parse(schemaJson)["settings"] as JObject;
                    if (settingsObj != null)
                    {
                        foreach (var key in StyleKeys)
                        {
                            var token = settingsObj[key] ?? settingsObj[char.ToUpperInvariant(key[0]) + key.Substring(1)];
                            if (token != null && token.Type != JTokenType.Null) style[key] = token;
                        }
                    }
                }
            }
            catch { /* seed is best-effort: an empty style just means "render the form's own CSS" */ }
            Write(moduleId, formId, style);
            return style;
        }

        private static void Write(int moduleId, int formId, JObject style)
        {
            var mc = new ModuleController();
            mc.UpdateModuleSetting(moduleId, SettingKeyStyleJson, style != null ? style.ToString(Formatting.None) : "{}");
            mc.UpdateModuleSetting(moduleId, SettingKeyStyleFormId, formId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
    }
}
