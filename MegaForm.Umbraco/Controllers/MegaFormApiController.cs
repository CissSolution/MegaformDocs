using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Web.Common.Controllers;
using Umbraco.Cms.Web.Common.Attributes;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using MegaForm.Umbraco.Services;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// MegaForm API for Umbraco — maps to same contract as DNN/Oqtane.
    /// Route: /umbraco/api/megaform/...
    /// </summary>
    [PluginController("MegaForm")]
    public class MegaFormApiController : UmbracoApiController
    {
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionRepository _subRepo;
        private readonly IPhase2Repository _phase2Repo;
        private readonly SubmissionProcessor _processor;
        private readonly IPlatformContext _platform;
        private readonly IUmbracoModuleConfigService _moduleConfigService;
        private readonly ILogger<MegaFormApiController> _logger;

        public MegaFormApiController(
            IFormRepository formRepo,
            ISubmissionRepository subRepo,
            IPhase2Repository phase2Repo,
            SubmissionProcessor processor,
            IPlatformContext platform,
            IUmbracoModuleConfigService moduleConfigService,
            ILogger<MegaFormApiController> logger)
        {
            _formRepo = formRepo;
            _subRepo = subRepo;
            _phase2Repo = phase2Repo;
            _processor = processor;
            _platform = platform;
            _moduleConfigService = moduleConfigService;
            _logger = logger;
        }

        // ── Form CRUD ──

        [HttpGet]
        public IActionResult GetForm(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();
            return Ok(form);
        }

        [HttpGet]
        public IActionResult ListForms(int siteId = 0)
        {
            // In Umbraco, siteId maps to portalId concept
            var forms = _formRepo.ListForms(siteId > 0 ? siteId : _platform.PortalId);
            return Ok(forms);
        }

        [HttpPost]
        public IActionResult SaveForm([FromBody] FormInfo form)
        {
            if (form == null) return BadRequest(new { error = "Form payload is required" });

            if (form.PortalId <= 0) form.PortalId = _platform.PortalId;
            if (form.ModuleId <= 0) form.ModuleId = _platform.ModuleId;
            if (form.CreatedByUserId <= 0) form.CreatedByUserId = _platform.UserId;
            form.UpdatedByUserId = _platform.UserId > 0 ? _platform.UserId : form.UpdatedByUserId;
            form.UpdatedOnUtc = DateTime.UtcNow;

            _logger.LogInformation("[MegaForm.Umbraco] SaveForm formId={FormId} moduleId={ModuleId} portalId={PortalId} title={Title}", form.FormId, form.ModuleId, form.PortalId, form.Title);
            int formId = _formRepo.SaveForm(form);
            return Ok(new { formId, moduleId = form.ModuleId, siteId = form.PortalId });
        }

        [HttpDelete]
        public IActionResult DeleteForm(int formId)
        {
            _formRepo.DeleteForm(formId);
            return Ok(new { success = true });
        }

        // ── Submissions ──

        [HttpGet]
        public IActionResult GetSubmissions(int formId, string status = null,
            string search = null, int pageIndex = 0, int pageSize = 50)
        {
            var result = _subRepo.List(formId, status, search, null, null, pageIndex, pageSize);
            return Ok(new { items = result.Items, totalCount = result.TotalCount });
        }

        [HttpPost]
        public async Task<IActionResult> Submit([FromBody] JObject body)
        {
            int formId = body.Value<int>("formId");
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found" });

            string dataJson = body["data"]?.ToString() ?? "{}";
            var formData = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson) ?? new Dictionary<string, object>();
            string ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
            string ua = Request.Headers["User-Agent"].FirstOrDefault() ?? "";
            int? userId = _platform.IsAuthenticated ? _platform.UserId : null;

            var result = await _processor.ProcessAsync(formId, formData, ip, ua, userId);
            if (result.Success)
                return Ok(new { submissionId = result.SubmissionId, success = true });
            return BadRequest(new { error = result.ErrorMessage });
        }

        [HttpGet]
        public IActionResult GetSubmission(int submissionId)
        {
            var sub = _subRepo.Get(submissionId);
            if (sub == null) return NotFound();
            return Ok(sub);
        }

        [HttpPost]
        public IActionResult UpdateSubmissionStatus(int submissionId, string status)
        {
            _subRepo.UpdateStatus(submissionId, status);
            return Ok(new { success = true });
        }

        // ── Schema (public, for form rendering) ──

        [HttpGet]
        public IActionResult Schema(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null || form.Status != "Published") return NotFound();
            return Ok(new
            {
                formId = form.FormId,
                title = form.Title,
                description = form.Description,
                schema = form.SchemaJson,
                submitButtonText = form.SubmitButtonText ?? "Submit",
                enableCaptcha = form.EnableCaptcha,
                themeJson = form.ThemeJson
            });
        }

        // ── Module/Content Config ──

        [HttpGet]
        public IActionResult GetModuleConfig(int contentId)
        {
            if (contentId <= 0) contentId = _platform.ModuleId;
            var portalId = _platform.PortalId;
            var cfg = _moduleConfigService.GetConfig(contentId);
            var forms = _formRepo.ListForms(portalId);
            return Ok(new
            {
                contentId,
                portalId,
                moduleConfigured = cfg != null,
                formId = cfg?.FormId ?? 0,
                viewType = cfg?.ViewType ?? "submit",
                viewConfigJson = cfg?.ViewConfigJson ?? "{}",
                cssClass = cfg?.CssClass,
                cacheMinutes = cfg?.CacheMinutes ?? 0,
                permissionsJson = cfg?.PermissionsJson,
                forms = forms.Select(f => new { f.FormId, f.Title, f.Status })
            });
        }

        [HttpPost]
        public IActionResult SaveModuleConfig([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "Payload is required" });

            int contentId = body.Value<int?>("contentId") ?? body.Value<int?>("moduleId") ?? _platform.ModuleId;
            int formId = body.Value<int?>("formId") ?? 0;
            string viewType = body.Value<string>("viewType") ?? "submit";
            string viewConfigJson = body["viewConfigJson"]?.ToString()
                ?? body["configJson"]?.ToString()
                ?? body["viewConfig"]?.ToString()
                ?? "{}";
            string cssClass = body.Value<string>("cssClass");
            int cacheMinutes = body.Value<int?>("cacheMinutes") ?? 0;
            string permissionsJson = body["permissionsJson"]?.ToString() ?? body["permissions"]?.ToString();

            if (contentId <= 0) return BadRequest(new { error = "contentId is required" });
            if (formId <= 0) return BadRequest(new { error = "formId is required" });

            var cfg = new ModuleViewConfigInfo
            {
                ModuleId = contentId,
                FormId = formId,
                ViewType = string.IsNullOrWhiteSpace(viewType) ? "submit" : viewType,
                ViewConfigJson = string.IsNullOrWhiteSpace(viewConfigJson) ? "{}" : viewConfigJson,
                CssClass = cssClass,
                CacheMinutes = cacheMinutes,
                PermissionsJson = permissionsJson
            };

            var saved = _moduleConfigService.SaveConfig(cfg);
            _logger.LogInformation("[MegaForm.Umbraco] SaveModuleConfig contentId={ContentId} formId={FormId} viewType={ViewType}", contentId, formId, saved.ViewType);

            return Ok(new
            {
                success = true,
                contentId = saved.ModuleId,
                formId = saved.FormId,
                viewType = saved.ViewType,
                viewConfigJson = saved.ViewConfigJson ?? "{}",
                cssClass = saved.CssClass,
                cacheMinutes = saved.CacheMinutes,
                permissionsJson = saved.PermissionsJson
            });
        }

        // ── Fields (for view config) ──

        [HttpGet]
        public IActionResult GetFields(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();

            FormSchema schema = null;
            try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); } catch { }

            var fields = new List<object>();
            if (schema != null)
            {
                fields = MegaFormUtils.FlattenFields(schema.Fields)
                    .Where(f => f.Type != "Html" && f.Type != "Section" && f.Type != "Hidden" && f.Type != "Row")
                    .Select(f => (object)new { f.Key, f.Label, f.Type })
                    .ToList();
            }
            return Ok(new { fields });
        }
    }
}
