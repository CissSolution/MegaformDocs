using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Newtonsoft.Json;

namespace MegaForm.Samples.CorporateWeb.FullDemo.Pages.Submissions;

public class DetailsModel : PageModel
{
    private readonly IMegaFormClient _client;

    public SubmissionDto Submission { get; private set; }
    public string FormTitle { get; private set; } = "Unknown";
    public string DataJson { get; private set; } = "";

    public DetailsModel(IMegaFormClient client)
    {
        _client = client;
    }

    public async Task<IActionResult> OnGetAsync(int id)
    {
        var scope = new MegaFormScope { PortalId = 0, UserId = 1 };
        Submission = await _client.Submissions.GetAsync(id, scope);
        if (Submission == null) return NotFound();

        var form = await _client.Forms.GetFormAsync(Submission.FormId, scope);
        FormTitle = form?.Title ?? $"Form {Submission.FormId}";

        var values = string.IsNullOrWhiteSpace(Submission.DataJson)
            ? new Dictionary<string, object>()
            : JsonConvert.DeserializeObject<Dictionary<string, object>>(Submission.DataJson);
        DataJson = JsonConvert.SerializeObject(values, Formatting.Indented);
        return Page();
    }
}
