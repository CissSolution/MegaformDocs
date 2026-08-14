using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.Pages;

public class ApiDemoModel : PageModel
{
    private readonly IMegaFormClient _megaForm;

    public PagedResult<FormDto> Forms { get; private set; } = new() { Items = new List<FormDto>() };
    public List<SubmissionRow> SubmissionRows { get; private set; } = new();

    public ApiDemoModel(IMegaFormClient megaForm)
    {
        _megaForm = megaForm;
    }

    public async Task OnGetAsync()
    {
        var scope = new MegaFormScope { PortalId = 0 };

        Forms = await _megaForm.Forms.ListFormsAsync(
            new FormQuery { Status = "published", PageSize = 50 }, scope);

        var formTitles = Forms.Items.ToDictionary(f => f.FormId, f => f.Title ?? $"Form {f.FormId}");

        var firstForm = Forms.Items.FirstOrDefault();
        if (firstForm != null)
        {
            var submissions = await _megaForm.Submissions.FindAsync(
                new SubmissionQuery { FormId = firstForm.FormId, PageSize = 20 }, scope);

            SubmissionRows = (submissions.Items ?? new List<SubmissionDto>())
                .Select(s => new SubmissionRow
                {
                    SubmissionId = s.SubmissionId,
                    FormId = s.FormId,
                    FormTitle = formTitles.TryGetValue(s.FormId, out var title) ? title : $"Form {s.FormId}",
                    Status = s.Status ?? "new",
                    SubmittedOnUtc = s.SubmittedOnUtc,
                    DataPreview = Truncate(s.DataJson, 120)
                })
                .ToList();
        }
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value)) return "{}";
        var normalized = value.Replace("\n", " ").Replace("\r", " ").Trim();
        return normalized.Length <= maxLength
            ? normalized
            : normalized.Substring(0, maxLength) + "…";
    }

    public class SubmissionRow
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FormTitle { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime SubmittedOnUtc { get; set; }
        public string DataPreview { get; set; } = string.Empty;
    }
}
