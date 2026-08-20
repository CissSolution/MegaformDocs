using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Security;
using MegaForm.Core.Services;
using MegaForm.Umbraco.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// MegaForm Headless/AJAX Forms Delivery API.
    /// Mirrors the Umbraco Forms Delivery API route shape so existing headless clients can consume MegaForm forms.
    /// </summary>
    [Route("/umbraco/forms/delivery/api/v1")]
    [AllowAnonymous]
    [ApiController]
    [ApiExplorerSettings(IgnoreApi = false, GroupName = "megaform")]
    public class FormsDeliveryController : ControllerBase
    {
        private readonly FormDeliveryService _deliveryService;
        private readonly FormsApiSecurityOptions _securityOptions;
        private readonly IAntiforgery _antiforgery;
        private readonly IUmbracoMemberContext _memberContext;
        private readonly ILogger<FormsDeliveryController> _logger;

        public FormsDeliveryController(
            FormDeliveryService deliveryService,
            FormsApiSecurityOptions securityOptions,
            IAntiforgery antiforgery,
            IUmbracoMemberContext memberContext,
            ILogger<FormsDeliveryController> logger)
        {
            _deliveryService = deliveryService ?? throw new ArgumentNullException(nameof(deliveryService));
            _securityOptions = securityOptions ?? throw new ArgumentNullException(nameof(securityOptions));
            _antiforgery = antiforgery ?? throw new ArgumentNullException(nameof(antiforgery));
            _memberContext = memberContext;
            _logger = logger;
        }

        /// <summary>
        /// Gets the public form definition for the supplied form id.
        /// </summary>
        [HttpGet("definitions/{id}")]
        public async Task<IActionResult> GetDefinition(string id, [FromQuery] string culture = null, [FromQuery] int contentId = 0)
        {
            if (!_securityOptions.EnableFormsApi)
                return StatusCode(503, new { error = "Forms Delivery API is disabled." });

            if (!int.TryParse(id, out var formId) || formId <= 0)
                return BadRequest(new { error = "Form id must be a positive integer." });

            var actor = await BuildUserContextAsync();
            var query = Request.Query.ToDictionary(
                pair => pair.Key,
                pair => pair.Value.ToString(),
                StringComparer.OrdinalIgnoreCase);

            var definition = await _deliveryService.BuildDefinitionAsync(formId, culture, actor, query);
            if (definition == null)
                return NotFound(new { error = "Form not found." });

            return Ok(definition);
        }

        /// <summary>
        /// Submits a form entry via the Delivery API.
        /// </summary>
        [HttpPost("entries/{id}")]
        [Consumes("application/json")]
        public async Task<IActionResult> PostEntry(string id, [FromBody] FormEntryRequest request)
        {
            if (!_securityOptions.EnableFormsApi)
                return StatusCode(503, new { error = "Forms Delivery API is disabled." });

            if (!int.TryParse(id, out var formId) || formId <= 0)
                return BadRequest(new { error = "Form id must be a positive integer." });

            if (request == null)
                return BadRequest(new { error = "Request body is required." });

            // Antiforgery or API key gate.
            if (_securityOptions.EnableAntiForgeryTokenForFormsApi)
            {
                try
                {
                    await _antiforgery.ValidateRequestAsync(HttpContext);
                }
                catch (AntiforgeryValidationException aex)
                {
                    _logger.LogWarning(aex, "[MegaForm.Umbraco] FormsDeliveryController antiforgery validation failed for form {FormId}", formId);
                    return StatusCode(400, new { error = "Antiforgery token validation failed." });
                }
            }
            else
            {
                var apiKey = Request.Headers["Api-Key"].FirstOrDefault();
                if (string.IsNullOrWhiteSpace(apiKey)
                    || !string.Equals(apiKey, _securityOptions.FormsApiKey, StringComparison.Ordinal))
                {
                    return Unauthorized(new { error = "A valid Api-Key header is required." });
                }
            }

            var actor = await BuildUserContextAsync();
            var query = Request.Query.ToDictionary(
                pair => pair.Key,
                pair => pair.Value.ToString(),
                StringComparer.OrdinalIgnoreCase);

            var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty;
            var ua = Request.Headers["User-Agent"].FirstOrDefault() ?? string.Empty;

            var result = await _deliveryService.SubmitEntryAsync(formId, request, actor, ip, ua, query);
            if (result == null)
                return NotFound(new { error = "Form not found." });

            if (result.Success)
                return Accepted(new { result.SubmissionId, result.Success, result.MessageOnSubmit, result.GotoPageOnSubmit });

            if (result.IsValidationError)
                return UnprocessableEntity(new FormValidationErrorDto { Errors = result.Errors, Message = result.MessageOnSubmit });

            return BadRequest(new { error = result.MessageOnSubmit });
        }

        private async Task<UserContext> BuildUserContextAsync()
        {
            var user = User;
            var actor = new UserContext
            {
                UserId = 0,
                UserName = user?.Identity?.Name ?? string.Empty,
                DisplayName = user?.Identity?.Name ?? string.Empty,
                IsAuthenticated = user?.Identity?.IsAuthenticated ?? false,
                IsAdmin = false,
                Roles = user?.Claims
                    .Where(c => c.Type == System.Security.Claims.ClaimTypes.Role
                        || string.Equals(c.Type, "role", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(c.Type, "roles", StringComparison.OrdinalIgnoreCase))
                    .Select(c => c.Value)
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? new List<string>()
            };

            var member = _memberContext != null ? await _memberContext.GetCurrentAsync() : null;
            if (member?.MemberId > 0)
            {
                actor.UserId = member.MemberId;
                actor.UserName = member.Username ?? actor.UserName;
                actor.DisplayName = member.Name ?? actor.DisplayName;
                actor.Email = member.Email ?? actor.Email;
                actor.IsAuthenticated = true;
            }

            return actor;
        }
    }
}
