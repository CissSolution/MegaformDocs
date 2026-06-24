using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.FullDemo.Pages.Submissions;

public class IndexModel : PageModel
{
    private readonly IMegaFormClient _client;

    public PagedResult<SubmissionDto> Result { get; private set; } = new();
    public IReadOnlyList<FormDto> Forms { get; private set; } = new List<FormDto>();
    public int FormId { get; private set; }
    public string FormTitle { get; private set; }

    public IndexModel(IMegaFormClient client)
    {
        _client = client;
    }

    public async Task OnGetAsync(int formId = 0, int page = 1, int pageSize = 10)
    {
        FormId = formId;
        var scope = new MegaFormScope { PortalId = 0, UserId = 1 };

        var formsResult = await _client.Forms.ListFormsAsync(new FormQuery { Page = 1, PageSize = 100 }, scope);
        Forms = formsResult.Items;
        FormTitle = formId > 0 ? Forms.FirstOrDefault(f => f.FormId == formId)?.Title : null;

        Result = await _client.Submissions.FindAsync(
            new SubmissionQuery { FormId = formId, Page = page, PageSize = pageSize },
            scope);
    }

    public string GetFormTitle(int id)
    {
        return Forms.FirstOrDefault(f => f.FormId == id)?.Title ?? $"Form {id}";
    }
}
