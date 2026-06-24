using System.Linq;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.FullDemo.Pages;

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
        var form = _formRepo.ListForms(portalId: 0, status: "published", pageSize: 10)
            .FirstOrDefault(f => f.Title == "Contact Us");
        FormId = form?.FormId ?? 0;
    }
}
