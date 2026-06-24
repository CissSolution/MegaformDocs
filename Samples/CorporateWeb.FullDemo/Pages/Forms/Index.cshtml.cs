using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.FullDemo.Pages.Forms;

public class IndexModel : PageModel
{
    private readonly IMegaFormClient _client;

    public IReadOnlyList<FormDto> Forms { get; private set; } = new List<FormDto>();

    public IndexModel(IMegaFormClient client)
    {
        _client = client;
    }

    public async Task OnGetAsync()
    {
        var result = await _client.Forms.ListFormsAsync(
            new FormQuery { Page = 1, PageSize = 100 },
            new MegaFormScope { PortalId = 0, UserId = 1 });
        Forms = result.Items;
    }
}
