using System;
using System.Linq;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.Pages;

public class ContactModel : PageModel
{
    private readonly IFormRepository _formRepo;

    public int FormId { get; private set; }

    public ContactModel(IFormRepository formRepo)
    {
        _formRepo = formRepo;
    }

    public void OnGet()
    {
        // Load the specific "Contact Us" form so this page is stable even when
        // other sample forms (newsletter, support ticket) exist in the same host.
        var form = _formRepo.ListForms(portalId: 0, status: "published", pageSize: 100)
                            .FirstOrDefault(f => "Contact Us".Equals(f.Title, StringComparison.OrdinalIgnoreCase));
        FormId = form?.FormId ?? 0;
    }
}
