using System.Linq;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.Pages;

public class ServicesModel : PageModel
{
    private readonly IFormRepository _formRepo;

    public int FormId { get; private set; }

    public ServicesModel(IFormRepository formRepo)
    {
        _formRepo = formRepo;
    }

    public void OnGet()
    {
        // Embed the "Patient Intake Form" if it exists; otherwise fall back
        // to the first published form so the sample still renders.
        var forms = _formRepo.ListForms(portalId: 0, status: "published", pageSize: 100);
        var form = forms.FirstOrDefault(f =>
            f.Title != null && f.Title.Contains("Patient", System.StringComparison.OrdinalIgnoreCase))
            ?? forms.FirstOrDefault();
        FormId = form?.FormId ?? 0;
    }
}
