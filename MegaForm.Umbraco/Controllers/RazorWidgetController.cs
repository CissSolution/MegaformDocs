using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Umbraco stub for the Razor Widget popup surface.
    /// The full Razor widget engine (RazorWidgetRegistry, HtmlRenderer, RazorCompilationService)
    /// is currently Web-host only. This controller prevents shared UI calls from 404-ing and
    /// surfaces honest 501 / empty-list responses so the builder can degrade gracefully.
    /// Routes:
    ///   /umbraco/MegaForm/MegaFormApi/RazorWidget/...
    ///   /api/MegaFormPopup/RazorWidget/... (rewritten by MegaFormApiRouteRewriteMiddleware)
    /// </summary>
    [Authorize(Policy = "MegaFormBackOffice")]
    [Route("umbraco/MegaForm/MegaFormApi/RazorWidget")]
    [ApiController]
    public class RazorWidgetController : ControllerBase
    {
        [HttpGet("List")]
        public IActionResult ListTemplates()
        {
            // No registered templates on Umbraco until the full registry is ported.
            return Ok(new List<object>());
        }

        [HttpGet("Source")]
        public IActionResult Source([FromQuery] string name)
        {
            return StatusCode(501, new { error = "Razor widget source editing is not available on Umbraco in this build." });
        }

        [HttpPost("Render")]
        public IActionResult Render([FromBody] JObject body)
        {
            return StatusCode(501, new { error = "Razor widget rendering is not available on Umbraco in this build." });
        }

        [HttpPost("Action")]
        public IActionResult Action([FromBody] JObject body)
        {
            return StatusCode(501, new { error = "Razor widget actions are not available on Umbraco in this build." });
        }

        [HttpPost("Compile")]
        public IActionResult Compile([FromBody] JObject body)
        {
            return StatusCode(501, new { error = "Razor widget compilation is not available on Umbraco in this build." });
        }

        [HttpPost("Export")]
        public IActionResult Export([FromBody] JObject body)
        {
            return StatusCode(501, new { error = "Razor widget export is not available on Umbraco in this build." });
        }

        [HttpGet("Preview")]
        public IActionResult Preview([FromQuery] string name)
        {
            return StatusCode(501, new { error = "Razor widget preview is not available on Umbraco in this build." });
        }
    }
}
