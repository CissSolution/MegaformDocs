using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using Newtonsoft.Json;

// ══════════════════════════════════════════════════════════════════════════════
//  MegaForm.Web.Controllers.PrintController
//
//  GET  /f/{formId}/print          → print preview HTML (full page)
//  GET  /f/{formId}/print/settings → current PrintSettings JSON
//  POST /f/{formId}/print/settings → save PrintSettings JSON
//  GET  /f/{formId}/print/qr       → QR code image (redirect to qrserver CDN)
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Web.Controllers
{
    [Route("f/{formId:int}/print")]
    public class PrintController : Controller
    {
        private readonly IFormRepository   _formRepo;
        private readonly PrintFormRenderer _renderer;
        private readonly ILogService       _log;

        public PrintController(
            IFormRepository    formRepo,
            PrintFormRenderer  renderer,
            ILogService        log = null)
        {
            _formRepo = formRepo;
            _renderer = renderer;
            _log      = log;
        }

        // ── GET /f/{formId}/print ────────────────────────────────────────────

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
            string html    = _renderer.RenderHtml(form, schema, baseUrl);

            // Inject print toolbar into the HTML
            string withToolbar = InjectToolbar(html, formId, form.Title);

            return Content(withToolbar, "text/html");
        }

        // ── GET /f/{formId}/print/settings ───────────────────────────────────

        [HttpGet("settings")]
        public IActionResult GetPrintSettings(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();

            var schema = ParseSchema(form.SchemaJson);
            return Ok(new
            {
                enabled       = schema?.Settings?.PrintSettings != null,
                printSettings = schema?.Settings?.PrintSettings,
            });
        }

        // ── POST /f/{formId}/print/settings ──────────────────────────────────

        [HttpPost("settings")]
        public IActionResult SavePrintSettings(int formId, [FromBody] MegaForm.Core.Models.PrintSettings settings)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();

            try
            {
                var schema = ParseSchema(form.SchemaJson) ?? new MegaForm.Core.Models.FormSchema();
                if (schema.Settings == null)
                    schema.Settings = new MegaForm.Core.Models.FormSettings();

                schema.Settings.PrintSettings = settings;
                form.SchemaJson = JsonConvert.SerializeObject(schema);
                _formRepo.SaveForm(form);

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _log?.LogError("MegaForm.Print", "Save print settings error: " + ex.Message, ex);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ── GET /f/{formId}/print/qr ─────────────────────────────────────────

        [HttpGet("qr")]
        public IActionResult GetQrCode(int formId, [FromQuery] string url = null, [FromQuery] int size = 100)
        {
            string target = !string.IsNullOrWhiteSpace(url)
                ? url
                : $"{Request.Scheme}://{Request.Host}/f/{formId}";

            string qrUrl = $"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={Uri.EscapeDataString(target)}";
            return Redirect(qrUrl);
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static MegaForm.Core.Models.FormSchema ParseSchema(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JsonConvert.DeserializeObject<MegaForm.Core.Models.FormSchema>(json); }
            catch { return null; }
        }

        private static string InjectToolbar(string html, int formId, string title)
        {
            string toolbar = $@"
<div class=""mf-print-toolbar"">
  <span>🖨️ Print Preview: <b style=""color:#e2e8f0"">{System.Web.HttpUtility.HtmlEncode(title ?? "Form")}</b></span>
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
