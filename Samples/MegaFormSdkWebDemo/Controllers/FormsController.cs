using System;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Samples.SdkWebDemo.Controllers
{
    public class FormsController : Controller
    {
        private readonly IMegaFormClient _client;
        private readonly MegaFormScope _scope;

        public FormsController(IMegaFormClient client)
        {
            _client = client;
            _scope = new MegaFormScope { PortalId = 0, UserId = 1 };
        }

        public IActionResult Index() => Redirect("/admin/builder");

        public IActionResult Details(int id) => Redirect($"/admin/builder?formId={id}");

        public IActionResult Create() => Redirect("/admin/builder");

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(CreateFormRequest request)
        {
            if (!ModelState.IsValid) return Redirect("/admin/builder");
            var form = await _client.Forms.CreateFormAsync(request, _scope);
            return Redirect($"/admin/builder?formId={form.FormId}");
        }

        public IActionResult Edit(int id) => Redirect($"/admin/builder?formId={id}");

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, UpdateFormRequest request)
        {
            await _client.Forms.UpdateFormAsync(id, request, _scope);
            return Redirect($"/admin/builder?formId={id}");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            await _client.Forms.DeleteFormAsync(id, _scope);
            return Redirect("/admin/builder");
        }
    }
}
