using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Samples.SdkWebDemo.Controllers
{
    public class SubmissionsController : Controller
    {
        private readonly IMegaFormClient _client;
        private readonly MegaFormScope _scope;

        public SubmissionsController(IMegaFormClient client)
        {
            _client = client;
            _scope = new MegaFormScope { PortalId = 0, UserId = 1 };
        }

        public async Task<IActionResult> Index(int formId = 0, int page = 0, int pageSize = 20)
        {
            ViewBag.FormId = formId;
            if (formId > 0)
            {
                ViewBag.Form = await _client.Forms.GetFormAsync(formId, _scope);
            }

            var query = new SubmissionQuery { FormId = formId, Page = page, PageSize = pageSize };
            var result = await _client.Submissions.FindAsync(query, _scope);
            return View(result);
        }

        public async Task<IActionResult> Details(int id)
        {
            var submission = await _client.Submissions.GetAsync(id, _scope);
            if (submission == null) return NotFound();

            ViewBag.Form = await _client.Forms.GetFormAsync(submission.FormId, _scope);
            ViewBag.Files = await _client.Files.ListForSubmissionAsync(id, _scope);
            return View(submission);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id, int formId = 0)
        {
            await _client.Submissions.DeleteAsync(id, _scope);
            return RedirectToAction(nameof(Index), new { formId });
        }
    }
}
