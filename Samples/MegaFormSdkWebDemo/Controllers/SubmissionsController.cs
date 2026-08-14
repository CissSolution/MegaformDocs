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

        public IActionResult Index(int formId = 0) =>
            formId > 0 ? Redirect($"/admin/submissions?formId={formId}") : Redirect("/admin/submissions");

        public IActionResult Details(int id) => Redirect($"/admin/submissions?submissionId={id}");

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id, int formId = 0)
        {
            await _client.Submissions.DeleteAsync(id, _scope);
            return Index(formId);
        }
    }
}
