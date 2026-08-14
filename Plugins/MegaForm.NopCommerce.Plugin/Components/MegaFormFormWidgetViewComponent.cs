using Microsoft.AspNetCore.Mvc;
using Nop.Web.Framework.Components;

namespace MegaForm.NopCommerce.Plugin.Components
{
    /// <summary>
    /// Widget component that renders a MegaForm form in an iframe.
    /// Add to a widget zone and configure the widget with formId = the MegaForm form id.
    /// </summary>
    [ViewComponent(Name = "MegaFormFormWidget")]
    public class MegaFormFormWidgetViewComponent : NopViewComponent
    {
        public IViewComponentResult Invoke(int formId = 0)
        {
            if (formId <= 0)
                return Content("<div class=\"text-danger\">MegaForm: formId is not configured.</div>");

            return View("~/Plugins/MegaForm.NopCommerce.Plugin/Views/Shared/Components/MegaFormFormWidget/Default.cshtml", formId);
        }
    }
}
