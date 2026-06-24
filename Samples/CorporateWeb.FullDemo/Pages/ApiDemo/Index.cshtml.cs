using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.FullDemo.Pages.ApiDemo;

public class IndexModel : PageModel
{
    private readonly IMegaFormClient _client;

    [TempData]
    public string Message { get; set; }

    public IndexModel(IMegaFormClient client)
    {
        _client = client;
    }

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostContactAsync()
    {
        var scope = new MegaFormScope { PortalId = 0, UserId = 1 };
        var forms = await _client.Forms.ListFormsAsync(new FormQuery { Page = 1, PageSize = 100 }, scope);
        var form = forms.Items.FirstOrDefault(f => f.Title == "Contact Us");
        if (form == null)
        {
            Message = "Contact Us form not found.";
            return RedirectToPage();
        }

        var data = new Dictionary<string, object>
        {
            ["full_name"] = $"API User {DateTime.UtcNow:HHmmss}",
            ["email"] = $"api-user-{DateTime.UtcNow:HHmmss}@example.com",
            ["category"] = "general",
            ["message"] = "This submission was inserted programmatically via IMegaFormClient.Submissions.SubmitAsync.",
            ["preferred_contact"] = new[] { "email" },
            ["terms"] = new[] { "true" }
        };

        var result = await _client.Submissions.SubmitAsync(form.FormId, data, scope);
        Message = result.Success
            ? $"Contact submission inserted. SubmissionId={result.SubmissionId}"
            : $"Insert failed: {result.ErrorMessage}";
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostEventAsync()
    {
        var scope = new MegaFormScope { PortalId = 0, UserId = 1 };
        var forms = await _client.Forms.ListFormsAsync(new FormQuery { Page = 1, PageSize = 100 }, scope);
        var form = forms.Items.FirstOrDefault(f => f.Title == "Event Registration");
        if (form == null)
        {
            Message = "Event Registration form not found.";
            return RedirectToPage();
        }

        var data = new Dictionary<string, object>
        {
            ["full_name"] = $"API Attendee {DateTime.UtcNow:HHmmss}",
            ["email"] = $"api-attendee-{DateTime.UtcNow:HHmmss}@example.com",
            ["company"] = "API Corp",
            ["job_title"] = "Automation Engineer",
            ["session"] = "ai",
            ["dietary"] = "none",
            ["comments"] = "Registered programmatically via the MegaForm SDK.",
            ["terms"] = new[] { "true" }
        };

        var result = await _client.Submissions.SubmitAsync(form.FormId, data, scope);
        Message = result.Success
            ? $"Event registration inserted. SubmissionId={result.SubmissionId}"
            : $"Insert failed: {result.ErrorMessage}";
        return RedirectToPage();
    }
}
