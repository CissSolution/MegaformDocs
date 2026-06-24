using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.FullDemo.Pages.Dashboard;

public class IndexModel : PageModel
{
    private readonly IMegaFormClient _client;

    public IReadOnlyList<FormDto> Forms { get; private set; } = new List<FormDto>();
    public IReadOnlyList<SubmissionDto> RecentSubmissions { get; private set; } = new List<SubmissionDto>();
    public int FormCount { get; private set; }
    public int SubmissionCount { get; private set; }

    public IndexModel(IMegaFormClient client)
    {
        _client = client;
    }

    public async Task OnGetAsync()
    {
        var scope = new MegaFormScope { PortalId = 0, UserId = 1 };

        var formsResult = await _client.Forms.ListFormsAsync(new FormQuery { Page = 1, PageSize = 100 }, scope);
        Forms = formsResult.Items;
        FormCount = formsResult.TotalCount;

        var submissionsResult = await _client.Submissions.FindAsync(
            new SubmissionQuery { Page = 0, PageSize = 10 }, scope);
        RecentSubmissions = submissionsResult.Items;
        SubmissionCount = submissionsResult.TotalCount;
    }

    public string GetFormTitle(int id)
    {
        return Forms.FirstOrDefault(f => f.FormId == id)?.Title ?? $"Form {id}";
    }
}
