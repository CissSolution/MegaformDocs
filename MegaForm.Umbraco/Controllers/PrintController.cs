using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Newtonsoft.Json;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Public print preview + QR code endpoints for Umbraco.
    /// Mirrors MegaForm.Web.Controllers.PrintController.
    /// Routes: /megaform/form/{formId}/print/...
    /// </summary>
    [Route("megaform/form/{formId:int}/print")]
    public class PrintController : Controller
    {
        private readonly IFormRepository _formRepo;
        private readonly PrintFormRenderer _renderer;

        public PrintController(
            IFormRepository formRepo,
            PrintFormRenderer renderer)
        {
            _formRepo = formRepo;
            _renderer = renderer;
        }

        [HttpGet("")]
        [HttpGet("index")]
        public async Task<IActionResult> PrintPreview(int formId)
        {
            var form = await Task.FromResult(_formRepo.GetForm(formId));
            if (form == null) return NotFound("Form not found.");

            var schema = ParseSchema(form.SchemaJson);
            if (schema?.Settings?.PrintSettings == null || !schema.Settings.PrintSettings.Enabled)
                return NotFound("Print layout is not enabled for this form.");

            string baseUrl = $"{Request.Scheme}://{Request.Host}";
            string html = _renderer.RenderHtml(form, schema, baseUrl);
            string withToolbar = InjectToolbar(html, formId, form.Title);

            return Content(withToolbar, "text/html");
        }

        [HttpGet("settings")]
        public IActionResult GetPrintSettings(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();

            var schema = ParseSchema(form.SchemaJson);
            return Ok(new
            {
                enabled = schema?.Settings?.PrintSettings != null,
                printSettings = schema?.Settings?.PrintSettings,
            });
        }

        [HttpPost("settings")]
        [Authorize(Policy = "MegaFormBackOffice")]
        public IActionResult SavePrintSettings(int formId, [FromBody] PrintSettings settings)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();

            try
            {
                var schema = ParseSchema(form.SchemaJson) ?? new FormSchema();
                if (schema.Settings == null)
                    schema.Settings = new FormSettings();

                schema.Settings.PrintSettings = settings;
                form.SchemaJson = JsonConvert.SerializeObject(schema);
                _formRepo.SaveForm(form);

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [HttpGet("qr")]
        public IActionResult GetQrCode(int formId, [FromQuery] string url = null, [FromQuery] int size = 100)
        {
            string target = !string.IsNullOrWhiteSpace(url)
                ? url
                : $"{Request.Scheme}://{Request.Host}/megaform/form/{formId}";

            string qrUrl = $"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={Uri.EscapeDataString(target)}";
            return Redirect(qrUrl);
        }

        private static FormSchema ParseSchema(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JsonConvert.DeserializeObject<FormSchema>(json); }
            catch { return null; }
        }

        private static string InjectToolbar(string html, int formId, string title)
        {
            string toolbar = $@"
<div class=""mf-print-toolbar"">
  <span>🖨️ Print Preview: <b style=""color:#e2e8f0"">{System.Net.WebUtility.HtmlEncode(title ?? "Form")}</b></span>
  <div style=""flex:1""></div>
  <button class=""mf-print-tb-btn ghost"" onclick=""window.close()"">✕ Close</button>
  <button class=""mf-print-tb-btn primary"" onclick=""window.print()"">🖨️ Print / Save PDF</button>
</div>
<div style=""height:44px""></div>
";
            return html.Replace("<body>", "<body>" + toolbar);
        }
    }
}
