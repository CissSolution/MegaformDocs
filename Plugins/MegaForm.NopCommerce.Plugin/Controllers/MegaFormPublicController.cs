using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Newtonsoft.Json.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.NopCommerce.Plugin.Models;

namespace MegaForm.NopCommerce.Plugin.Controllers
{
    /// <summary>
    /// Public form rendering, schema, i18n, and submission endpoints for the nopCommerce plugin.
    /// Routes are chosen to match the paths the MegaForm client renderer expects:
    ///   - form page:     /megaform/form/{id} and /megaform/form/{id}/embed
    ///   - schema:        /megaform/api/Submit/Schema?formId={id}
    ///   - submit:        /megaform/api/Submit/Post
    ///   - i18n:          /megaform/api/i18n/{locale}
    /// </summary>
    [Route("megaform")]
    [AllowAnonymous]
    public class MegaFormPublicController : Controller
    {
        private readonly IFormRepository _formRepo;
        private readonly SubmissionProcessor _submissionProcessor;
        private readonly IWebHostEnvironment _env;

        public MegaFormPublicController(
            IFormRepository formRepo,
            SubmissionProcessor submissionProcessor,
            IWebHostEnvironment env)
        {
            _formRepo = formRepo;
            _submissionProcessor = submissionProcessor;
            _env = env;
        }

        [HttpGet("form/{id:int}")]
        public IActionResult Form(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null || !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase))
                return NotFound();

            if (form.RequireAuth && !(User?.Identity?.IsAuthenticated ?? false))
                return Unauthorized();

            return View("~/Plugins/MegaForm.NopCommerce.Plugin/Views/Form/Form.cshtml", BuildModel(form));
        }

        [HttpGet("form/{id:int}/embed")]
        public IActionResult Embed(int id) => Form(id);

        [HttpGet("api/Submit/Schema")]
        [AllowAnonymous]
        public IActionResult Schema(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null || !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase))
                return NotFound();

            return Ok(new
            {
                formId = form.FormId,
                title = form.Title,
                description = form.Description,
                schema = form.SchemaJson,
                submitButtonText = form.SubmitButtonText,
                enableCaptcha = form.EnableCaptcha,
                enableSaveResume = form.EnableSaveResume,
                theme = form.ThemeJson,
                themeJson = form.ThemeJson,
                settingsJson = form.SettingsJson,
                requireAuth = form.RequireAuth
            });
        }

        [HttpPost("api/Submit/Post")]
        [AllowAnonymous]
        public async Task<IActionResult> Submit([FromBody] SubmitRequest request)
        {
            if (request == null || request.FormId <= 0 || request.Data == null)
                return BadRequest(new { success = false, error = "formId and data are required." });

            var form = _formRepo.GetForm(request.FormId);
            if (form == null)
                return NotFound(new { success = false, error = "Form not found." });

            int? userId = null;
            if (User?.Identity?.IsAuthenticated == true &&
                int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
            {
                userId = uid;
            }

            if (form.RequireAuth && !userId.HasValue)
                return Unauthorized(new { success = false, error = "Authentication required." });

            var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var ua = Request.Headers["User-Agent"].ToString();

            var result = await _submissionProcessor.ProcessAsync(
                request.FormId,
                request.Data,
                ip,
                ua,
                userId,
                request.SubmissionTime,
                actor: null,
                query: null);

            return Ok(new
            {
                success = result.Success,
                submissionId = result.SubmissionId,
                error = result.ErrorMessage,
                isSpam = result.IsSpam
            });
        }

        [HttpGet("api/i18n/{locale}")]
        [AllowAnonymous]
        public IActionResult Locale(string locale)
        {
            var safe = new string((locale ?? "")
                .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_')
                .ToArray());
            if (string.IsNullOrEmpty(safe))
                return BadRequest(new { error = "invalid locale" });

            var dir = Path.Combine(_env.ContentRootPath, "Plugins", "MegaForm.NopCommerce.Plugin", "Assets", "js", "i18n");
            var path = Path.Combine(dir, safe + ".json");
            if (!System.IO.File.Exists(path))
            {
                if (string.Equals(safe, "en-US", StringComparison.OrdinalIgnoreCase))
                    return Ok(new { });
                path = Path.Combine(dir, "en-US.json");
            }

            if (!System.IO.File.Exists(path))
                return NotFound(new { error = "locale not found" });

            return PhysicalFile(path, "application/json");
        }

        private FormViewModel BuildModel(FormInfo form)
        {
            return new FormViewModel
            {
                FormId = form.FormId,
                Title = form.Title,
                Description = form.Description,
                SchemaJson = form.SchemaJson,
                SettingsJson = form.SettingsJson,
                ThemeJson = form.ThemeJson,
                SubmitButtonText = form.SubmitButtonText,
                SuccessMessage = form.SuccessMessage,
                EnableCaptcha = form.EnableCaptcha,
                RequireAuth = form.RequireAuth,
                Locale = "en-US"
            };
        }
    }
}
