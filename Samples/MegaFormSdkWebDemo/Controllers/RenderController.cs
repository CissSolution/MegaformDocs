using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Samples.SdkWebDemo.Controllers
{
    [Route("render")]
    public class RenderController : Controller
    {
        private readonly IMegaFormClient _client;
        private readonly MegaFormScope _scope;

        public RenderController(IMegaFormClient client)
        {
            _client = client;
            _scope = new MegaFormScope { PortalId = 0, UserId = 0 };
        }

        [HttpGet("form/{id:int}")]
        public async Task<IActionResult> Form(int id)
        {
            var form = await _client.Forms.GetFormAsync(id, _scope);
            if (form == null) return NotFound();
            if (form.Status != "published") return BadRequest("Form is not published.");

            var schema = _client.Schema.ParseForm(form);
            ViewBag.Schema = schema;
            return View(form);
        }

        [HttpPost("form/{id:int}")]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> Submit(int id, [FromForm] Dictionary<string, string> values)
        {
            var data = new Dictionary<string, object>();
            foreach (var kv in values) data[kv.Key] = kv.Value;
            var result = await _client.Submissions.SubmitAsync(id, data, _scope);

            if (!result.Success)
            {
                var form = await _client.Forms.GetFormAsync(id, _scope);
                ViewBag.Schema = _client.Schema.ParseForm(form);
                ViewBag.SubmitResult = result;
                return View("Form", form);
            }

            return RedirectToAction(nameof(Thanks), new { submissionId = result.SubmissionId });
        }

        [HttpGet("thanks")]
        public IActionResult Thanks(int submissionId)
        {
            ViewBag.SubmissionId = submissionId;
            return View();
        }
    }
}
