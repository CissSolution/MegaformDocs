using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Samples.SdkWebDemo.Controllers
{
    public class ApiDemoController : Controller
    {
        private readonly IMegaFormClient _client;
        private readonly MegaFormScope _scope;

        public ApiDemoController(IMegaFormClient client)
        {
            _client = client;
            _scope = new MegaFormScope { PortalId = 0, UserId = 1 };
        }

        public IActionResult Index()
        {
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> CreateSampleForm()
        {
            var request = new CreateFormRequest
            {
                Title = $"Sample Form {System.DateTime.UtcNow:yyyyMMdd-HHmmss}",
                Description = "Created via SDK API demo",
                Status = "published",
                SchemaJson = GetSampleSchemaJson()
            };
            var form = await _client.Forms.CreateFormAsync(request, _scope);
            return RedirectToAction("Details", "Forms", new { id = form.FormId });
        }

        [HttpPost]
        public async Task<IActionResult> SubmitSample(int formId)
        {
            var data = new Dictionary<string, object>
            {
                ["name"] = "Demo User",
                ["email"] = "demo@example.com",
                ["message"] = "This submission was created using IMegaFormClient.Submissions.SubmitAsync."
            };
            var result = await _client.Submissions.SubmitAsync(formId, data, _scope);
            TempData["ApiDemoResult"] = result.Success
                ? $"Submit succeeded. SubmissionId={result.SubmissionId}"
                : $"Submit failed: {result.ErrorMessage}";
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> ParseSchema(int formId)
        {
            var form = await _client.Forms.GetFormAsync(formId, _scope);
            var info = form != null ? _client.Schema.ParseForm(form) : null;
            ViewBag.SchemaInfo = info;
            return View("Index");
        }

        private static string GetSampleSchemaJson() =>
            "{\"fields\":[" +
            "{\"key\":\"name\",\"type\":\"text\",\"label\":\"Full Name\",\"required\":true," +
            "\"validation\":{\"minLength\":2,\"maxLength\":100}}," +
            "{\"key\":\"email\",\"type\":\"email\",\"label\":\"Email\",\"required\":true}," +
            "{\"key\":\"message\",\"type\":\"textarea\",\"label\":\"Message\",\"required\":true}" +
            "]}";
    }
}
