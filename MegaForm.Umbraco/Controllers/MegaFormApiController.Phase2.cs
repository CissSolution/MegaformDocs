using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Phase 2 form-view and permission parity endpoints for Umbraco.
    /// Mirrors MegaForm.Web.Controllers.MegaFormController Phase2 section.
    /// </summary>
    public partial class MegaFormApiController
    {
        // ── FORM VIEWS ─────────────────────────────────────────

        [HttpGet]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter, FormIdParameter = "formId")]
        [Route("Phase2/GetViewConfigs")]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/GetViewConfigs")]
        [Route("/api/MegaForm/Phase2/GetViewConfigs")]
        public IActionResult GetViewConfigs(int formId)
        {
            var views = _phase2Repo.GetFormViews(formId);
            return Ok(new { views });
        }

        [HttpPost]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        [Route("Phase2/SaveViewConfig")]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/SaveViewConfig")]
        [Route("/api/MegaForm/Phase2/SaveViewConfig")]
        public IActionResult SaveViewConfig([FromBody] FormViewInfo view)
        {
            if (view == null) return BadRequest(new { error = "view required" });
            int viewId = _phase2Repo.SaveFormView(view);
            return Ok(new { viewId });
        }

        [HttpPost]
        [MegaFormAuthorize(MegaFormPermissionConstants.DeleteLetter)]
        [Route("Phase2/DeleteViewConfig")]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/DeleteViewConfig")]
        [Route("/api/MegaForm/Phase2/DeleteViewConfig")]
        public IActionResult DeleteViewConfig([FromQuery] int? viewId, [FromBody] JObject body = null)
        {
            int id = viewId ?? body?.Value<int>("viewId") ?? 0;
            if (id == 0) return BadRequest(new { error = "viewId required" });
            _phase2Repo.DeleteFormView(id);
            return Ok(new { success = true });
        }
    }
}
