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

        public async Task<IActionResult> Index(string search = null)
        {
            var query = new FormQuery { Search = search, Page = 0, PageSize = 100 };
            var result = await _client.Forms.ListFormsAsync(query, _scope);
            ViewBag.Search = search;
            return View(result.Items);
        }

        public async Task<IActionResult> Details(int id)
        {
            var form = await _client.Forms.GetFormAsync(id, _scope);
            if (form == null) return NotFound();
            return View(form);
        }

        public IActionResult Create()
        {
            return View(new CreateFormRequest { Status = "draft" });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(CreateFormRequest request)
        {
            if (!ModelState.IsValid) return View(request);

            var form = await _client.Forms.CreateFormAsync(request, _scope);
            return RedirectToAction(nameof(Details), new { id = form.FormId });
        }

        public async Task<IActionResult> Edit(int id)
        {
            var form = await _client.Forms.GetFormAsync(id, _scope);
            if (form == null) return NotFound();

            var request = new UpdateFormRequest
            {
                Title = form.Title,
                Description = form.Description,
                SchemaJson = form.SchemaJson,
                Status = form.Status,
                RequireAuth = form.RequireAuth
            };
            ViewBag.FormId = id;
            return View(request);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, UpdateFormRequest request)
        {
            if (!ModelState.IsValid)
            {
                ViewBag.FormId = id;
                return View(request);
            }

            await _client.Forms.UpdateFormAsync(id, request, _scope);
            return RedirectToAction(nameof(Details), new { id });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            await _client.Forms.DeleteFormAsync(id, _scope);
            return RedirectToAction(nameof(Index));
        }
    }
}
