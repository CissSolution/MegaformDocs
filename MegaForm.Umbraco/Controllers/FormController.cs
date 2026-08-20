using System;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Umbraco.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Web.Common.Authorization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Public form viewer for Umbraco.
    ///   GET /megaform/form/{id}          — standalone hosted page
    ///   GET /megaform/form/{id}/embed    — iframe-friendly (no chrome)
    ///   GET /megaform/form/{id}/preview  — builder preview
    ///   GET /megaform/form/{id}/script   — JS embed snippet
    /// </summary>
    public class FormController : Controller
    {
        private readonly IFormRepository _formRepo;
        private readonly Services.IUmbracoMemberContext _memberContext;

        public FormController(IFormRepository formRepo, Services.IUmbracoMemberContext memberContext)
        {
            _formRepo = formRepo;
            _memberContext = memberContext;
        }

        [HttpGet("/megaform/form/{id:int}")]
        [HttpGet("/f/{id:int}")]
        public async Task<IActionResult> View(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound("Form not found.");
            if (form.Status == "draft" && !IsPreviewAllowed())
                return NotFound("This form is not published yet.");

            var vm = await BuildViewModel(form, embedMode: false, previewMode: false);
            return View("~/Views/Form/Public.cshtml", vm);
        }

        [HttpGet("/megaform/form/{id:int}/embed")]
        [HttpGet("/f/{id:int}/embed")]
        public async Task<IActionResult> Embed(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound();
            if (form.Status == "draft") return NotFound();

            var vm = await BuildViewModel(form, embedMode: true, previewMode: false);
            return View("~/Views/Form/Public.cshtml", vm);
        }

        [HttpGet("/megaform/form/{id:int}/preview")]
        [HttpGet("/f/{id:int}/preview")]
        [Authorize(Policy = "MegaFormBackOffice")]
        public async Task<IActionResult> Preview(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound();
            var vm = await BuildViewModel(form, embedMode: true, previewMode: true);
            return View("~/Views/Form/Public.cshtml", vm);
        }

        [HttpGet("/megaform/form/{id:int}/script")]
        public IActionResult Script(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null || form.Status == "draft") return NotFound();

            var apiBase = $"{Request.Scheme}://{Request.Host}/umbraco/MegaForm/MegaFormApi/";
            var js = $@"
(function() {{
    var containerId = 'mf-embed-' + {id};
    var existing = document.getElementById(containerId);
    if (!existing) {{
        existing = document.createElement('div');
        existing.id = containerId;
        document.currentScript.parentNode.insertBefore(existing, document.currentScript.nextSibling);
    }}
    function renderForm(payload) {{
        if (!payload || !payload.schema) {{
            existing.innerHTML = '<p style=""padding:1rem;color:#dc2626;"">Unable to load form.</p>';
            return;
        }}
        var schema = typeof payload.schema === 'string' ? JSON.parse(payload.schema) : payload.schema;
        if (window.MegaFormRenderer && window.MegaFormRenderer.init) {{
            window.MegaFormRenderer.init({{
                container: existing,
                formId: {id},
                apiBaseUrl: '{apiBase}',
                schema: schema,
                title: payload.title || '',
                description: payload.description || '',
                submitButtonText: payload.submitButtonText || 'Submit',
                locale: '{GetRequestLocale(form)}'
            }});
        }} else {{
            existing.innerHTML = '<p style=""padding:1rem;color:#dc2626;"">MegaForm renderer not loaded.</p>';
        }}
    }}

    var currentSrc = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
    var scriptOrigin = '';
    try {{ scriptOrigin = new URL(currentSrc).origin; }} catch (e) {{}}
    var apiBase = scriptOrigin ? scriptOrigin + '/umbraco/MegaForm/MegaFormApi/' : '{apiBase}';
    var rendererUrl = scriptOrigin ? scriptOrigin + '/App_Plugins/MegaForm/js/megaform-renderer.js' : '{apiBase}../App_Plugins/MegaForm/js/megaform-renderer.js';

    function loadRenderer() {{
        return new Promise(function(resolve, reject) {{
            if (window.MegaFormRenderer && window.MegaFormRenderer.init) {{
                resolve();
                return;
            }}
            var s = document.createElement('script');
            s.src = rendererUrl;
            s.async = true;
            s.onload = function() {{ resolve(); }};
            s.onerror = function() {{ reject(new Error('Failed to load MegaForm renderer')); }};
            document.head.appendChild(s);
        }});
    }}

    loadRenderer()
        .then(function() {{ return fetch(apiBase + 'schema?formId={id}'); }})
        .then(function(r) {{ return r.ok ? r.json() : Promise.reject(r.statusText); }})
        .then(renderForm)
        .catch(function(e) {{
            existing.innerHTML = '<p style=""padding:1rem;color:#dc2626;"">Error loading form.</p>';
        }});
}})();
";
            return Content(js.Trim(), "application/javascript; charset=utf-8");
        }

        private async Task<MegaFormPublicFormViewModel> BuildViewModel(FormInfo form, bool embedMode, bool previewMode)
        {
            var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            var locale = GetRequestLocale(form);
            var member = await _memberContext.GetCurrentAsync();

            return new MegaFormPublicFormViewModel
            {
                FormId = form.FormId,
                Title = form.Title ?? "Untitled Form",
                Description = form.Description ?? string.Empty,
                SchemaJson = resolved.SchemaJson,
                SettingsJson = resolved.SettingsJson,
                ThemeJson = form.ThemeJson ?? "{}",
                RulesJson = form.RulesJson ?? "[]",
                SubmitButtonText = resolved.SubmitButtonText,
                SuccessMessage = resolved.SuccessMessage,
                Locale = locale,
                EmbedMode = embedMode,
                PreviewMode = previewMode,
                EnableCaptcha = form.EnableCaptcha,
                RequireAuth = form.RequireAuth,
                ApiBase = "/umbraco/MegaForm/MegaFormApi/",
                MemberPrefillJson = member != null ? JsonConvert.SerializeObject(member.Properties) : "{}"
            };
        }

        private static readonly System.Text.RegularExpressions.Regex LocalePattern =
            new System.Text.RegularExpressions.Regex(@"^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$", System.Text.RegularExpressions.RegexOptions.Compiled);

        // Only accept well-formed locale tags (en, en-US, vi-VN, ...). The value is
        // interpolated raw into a JS string by the /script endpoint, so anything
        // else is rejected and we fall back to the next candidate.
        private static bool IsValidLocale(string value)
            => !string.IsNullOrWhiteSpace(value) && LocalePattern.IsMatch(value.Trim());

        private string GetRequestLocale(FormInfo form)
        {
            var qLang = Request?.Query["lang"].ToString();
            if (IsValidLocale(qLang)) return qLang.Trim();

            try
            {
                var schemaObj = string.IsNullOrWhiteSpace(form?.SchemaJson) ? null : JObject.Parse(form.SchemaJson);
                var schemaSettings = schemaObj?["settings"] as JObject;
                var schemaDefault = schemaSettings?["defaultLanguage"] ?? schemaSettings?["DefaultLanguage"];
                var schemaValue = schemaDefault?.ToString();
                if (IsValidLocale(schemaValue)) return schemaValue.Trim();
            }
            catch { }

            var accept = Request?.Headers["Accept-Language"].ToString();
            if (!string.IsNullOrWhiteSpace(accept))
            {
                var locale = accept.Split(',')
                    .Select(l => l.Split(';')[0].Trim())
                    .FirstOrDefault(l => IsValidLocale(l));
                if (!string.IsNullOrWhiteSpace(locale)) return locale;
            }

            return "en-US";
        }

        private bool IsPreviewAllowed()
        {
            return User?.Identity?.IsAuthenticated == true && (User.IsInRole("admin") || User.IsInRole("Administrator") || User.IsInRole("Administrators"));
        }
    }
}
