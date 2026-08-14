using System;
using System.Linq;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.Pages;

public class LandingWithFormModel : PageModel
{
    private readonly IFormRepository _formRepo;

    public int FormId { get; private set; }

    public LandingWithFormModel(IFormRepository formRepo)
    {
        _formRepo = formRepo;
    }

    public void OnGet()
    {
        var form = _formRepo.ListForms(portalId: 0, status: "published", pageSize: 100)
                            .FirstOrDefault(f => "Newsletter Signup".Equals(f.Title, StringComparison.OrdinalIgnoreCase));
        FormId = form?.FormId ?? 0;
    }
}
