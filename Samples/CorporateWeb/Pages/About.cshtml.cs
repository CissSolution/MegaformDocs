using System.Linq;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.Pages;

public class AboutModel : PageModel
{
    private readonly IFormRepository _formRepo;

    public int FormId { get; private set; }

    public AboutModel(IFormRepository formRepo)
    {
        _formRepo = formRepo;
    }

    public void OnGet()
    {
        // Pick the first published MegaForm so the page always renders
        // a live form even if the seeded data changes.
        var form = _formRepo.ListForms(portalId: 0, status: "published", pageSize: 1).FirstOrDefault();
        FormId = form?.FormId ?? 0;
    }
}
