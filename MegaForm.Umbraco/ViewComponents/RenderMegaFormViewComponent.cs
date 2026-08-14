using Microsoft.AspNetCore.Mvc;
using MegaForm.Umbraco.ViewModels;

namespace MegaForm.Umbraco.ViewComponents
{
    /// <summary>
    /// Renders a selected MegaForm on an Umbraco content page.
    /// Usage in Razor:
    ///   @await Component.InvokeAsync("RenderMegaForm", new { formId = Model.Value&lt;int?&gt;("megaFormPicker"), contentId = Model.Id })
    /// </summary>
    public class RenderMegaFormViewComponent : ViewComponent
    {
        public IViewComponentResult Invoke(int formId, int contentId = 0, string viewType = "submit", string configJson = null)
        {
            var model = new MegaFormViewModel
            {
                ContentId = contentId > 0 ? contentId : formId,
                FormId = formId,
                ViewType = viewType,
                IsAdmin = false,
                ConfigJson = configJson
            };

            return View("~/Views/Partials/MegaForm/MegaForm.cshtml", model);
        }
    }
}
