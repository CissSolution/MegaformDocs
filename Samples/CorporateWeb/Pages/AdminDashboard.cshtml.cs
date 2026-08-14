using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MegaForm.Samples.CorporateWeb.Pages;

public class AdminDashboardModel : PageModel
{
    private readonly IFormRepository _formRepo;
    private readonly ISubmissionRepository _submissionRepo;

    public IReadOnlyList<FormInfo> Forms { get; private set; } = new List<FormInfo>();
    public int PublishedFormCount { get; private set; }
    public int TotalSubmissionCount { get; private set; }
    public int FirstFormId { get; private set; }

    public AdminDashboardModel(IFormRepository formRepo, ISubmissionRepository submissionRepo)
    {
        _formRepo = formRepo;
        _submissionRepo = submissionRepo;
    }

    public void OnGet()
    {
        Forms = _formRepo.ListForms(portalId: 0, status: "published", pageSize: 100);
        PublishedFormCount = Forms.Count;
        FirstFormId = Forms.FirstOrDefault()?.FormId ?? 0;

        TotalSubmissionCount = 0;
        foreach (var form in Forms)
        {
            var (_, total) = _submissionRepo.List(form.FormId, pageSize: 1);
            TotalSubmissionCount += total;
        }
    }
}
