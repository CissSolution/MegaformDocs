using Microsoft.AspNetCore.Mvc;
using MegaForm.Umbraco.ViewModels;

namespace MegaForm.Umbraco.Host.Controllers
{
    public class TestController : Controller
    {
        [HttpGet("test/form")]
        public IActionResult Form()
        {
            var model = new MegaFormViewModel
            {
                ContentId = 1234,
                FormId = 1,
                ViewType = "submit",
                IsAdmin = false
            };
            return View("~/Views/MegaFormView.cshtml", model);
        }
    }
}
