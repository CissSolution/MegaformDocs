using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Umbraco.Host.Controllers
{
    /// <summary>
    /// Minimal Umbraco-host parity for the MegaForm AI assistant config endpoint.
    /// Returns the local Knowledge-Base provider so the front-end AI assistant can
    /// call /api/MegaFormAi/chat/completions without an external API key.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [AllowAnonymous]
    public class AiAssistantController : ControllerBase
    {
        [HttpGet("DefaultConfig")]
        public IActionResult DefaultConfig()
        {
            return Ok(new
            {
                provider = "megaform-local",
                baseUrl = "/api/MegaFormAi",
                model = "megaform-local-kb",
                apiKey = "",
                enabled = true
            });
        }
    }
}
