using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.ViewModes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
namespace MegaForm.Oqtane.Server.Controllers
{
    [ApiController]
    [Route("api/MegaFormPopup/Phase2")]
    [IgnoreAntiforgeryToken]
    [Authorize]
    public class MegaFormPopupPhase2Controller : ControllerBase
    {
        private readonly IPhase2Repository _phase2Repo;
        private readonly IFormRepository _formRepo;
        private readonly AppDefinitionService _apps;
        private readonly AppQueryRegistryService _queries;

        public MegaFormPopupPhase2Controller(
            IPhase2Repository phase2Repo,
            IFormRepository formRepo,
            AppDefinitionService apps,
            AppQueryRegistryService queries)
        {
            _phase2Repo = phase2Repo;
            _formRepo = formRepo;
            _apps = apps;
            _queries = queries;
        }

        private ContentResult JsonOk(object payload)
        {
            var json = JsonConvert.SerializeObject(payload);
            return new ContentResult
            {
                Content = json,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        private static object BuildAppSummary(AppDefinitionBundle bundle)
        {
            if (bundle?.App == null) return null;
            return new
            {
                appId = bundle.App.AppId,
                appKey = bundle.App.AppKey,
                appName = bundle.App.AppName,
                appScope = bundle.App.AppScope
            };
        }

        [HttpGet("GetViewConfigs")]
        public IActionResult GetViewConfigs(int formId)
        {
            try
            {
                if (formId <= 0) return BadRequest(new { error = "formId required" });
                var views = _phase2Repo.GetFormViews(formId) ?? new List<FormViewInfo>();
                var form = _formRepo.GetForm(formId);
                var bundle = form == null ? null : _apps.GetByScope(form.PortalId, form.AppScope, hydrateManifest: false);
                var queries = form == null ? new List<AppQueryDefinitionInfo>() : _queries.ListForForm(form.PortalId, form.FormId);
                return JsonOk(new
                {
                    views = views,
                    app = BuildAppSummary(bundle),
                    queries = queries
                });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveViewConfig")]
        public IActionResult SaveViewConfig([FromBody] FormViewInfo view)
        {
            try
            {
                if (view == null || view.FormId <= 0) return BadRequest(new { error = "Invalid view data" });
                var existingViews = _phase2Repo.GetFormViews(view.FormId) ?? new List<FormViewInfo>();
                var validation = FormViewSelector.ValidateAndNormalizeForSave(view, existingViews);
                if (!validation.IsValid || validation.View == null)
                    return BadRequest(new { error = validation.Error ?? "Invalid view data" });

                var form = _formRepo.GetForm(validation.View.FormId);
                var queryValidation = _queries.ValidateBinding(form != null ? form.PortalId : 0, form, validation.View.QueryKey);
                if (!queryValidation.IsValid)
                    return BadRequest(new { error = queryValidation.Error ?? "Invalid query binding" });

                validation.View.QueryKey = queryValidation.NormalizedQueryKey ?? string.Empty;
                var id = _phase2Repo.SaveFormView(validation.View);
                return JsonOk(new { viewId = id });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("DeleteViewConfig")]
        public IActionResult DeleteViewConfig([FromQuery] int? viewId, [FromBody] FormViewDeleteRequest body = null)
        {
            try
            {
                var id = viewId.GetValueOrDefault();
                if (id <= 0) id = body?.ViewId ?? 0;
                if (id <= 0) return BadRequest(new { error = "viewId required" });
                _phase2Repo.DeleteFormView(id);
                return JsonOk(new { success = true });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}
