using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Samples.SdkWebDemo.Controllers
{
    public class DashboardController : Controller
    {
        private readonly IMegaFormClient _client;
        private readonly MegaFormScope _scope;

        public DashboardController(IMegaFormClient client)
        {
            _client = client;
            _scope = new MegaFormScope { PortalId = 0, UserId = 1 };
        }

        public async Task<IActionResult> Index()
        {
            var forms = await _client.Forms.ListFormsAsync(new FormQuery { Page = 0, PageSize = 100 }, _scope);
            var recentSubmissions = await _client.Submissions.FindAsync(
                new SubmissionQuery { Page = 0, PageSize = 10 }, _scope);

            ViewBag.FormCount = forms.TotalCount;
            ViewBag.SubmissionCount = recentSubmissions.TotalCount;
            ViewBag.RecentSubmissions = recentSubmissions.Items;
            return View(forms.Items);
        }
    }
}
