using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Newtonsoft.Json;

namespace MegaForm.Samples.CorporateWeb.FullDemo.Pages.Submissions;

public class CardModel : PageModel
{
    private readonly IMegaFormClient _client;

    public int FormId { get; private set; }
    public IReadOnlyList<FormDto> Forms { get; private set; } = new List<FormDto>();
    public List<SubmissionCard> Cards { get; private set; } = new();

    public CardModel(IMegaFormClient client)
    {
        _client = client;
    }

    public async Task OnGetAsync(int formId = 0)
    {
        FormId = formId;
        var scope = new MegaFormScope { PortalId = 0, UserId = 1 };

        var formsResult = await _client.Forms.ListFormsAsync(new FormQuery { Page = 1, PageSize = 100 }, scope);
        Forms = formsResult.Items;

        var result = await _client.Submissions.FindAsync(
            new SubmissionQuery { FormId = formId, Page = 0, PageSize = 50 },
            scope);

        foreach (var sub in result.Items)
        {
            var form = Forms.FirstOrDefault(f => f.FormId == sub.FormId);
            Cards.Add(BuildCard(sub, form));
        }
    }

    private static SubmissionCard BuildCard(SubmissionDto sub, FormDto form)
    {
        var values = string.IsNullOrWhiteSpace(sub.DataJson)
            ? new Dictionary<string, object>()
            : JsonConvert.DeserializeObject<Dictionary<string, object>>(sub.DataJson) ?? new Dictionary<string, object>();

        var formTitle = form?.Title ?? $"Form {sub.FormId}";

        string title;
        string subtitle = "";
        string body = "";

        if (formTitle.Contains("Contact", StringComparison.OrdinalIgnoreCase))
        {
            title = GetString(values, "full_name") ?? $"Submission #{sub.SubmissionId}";
            subtitle = GetString(values, "email") ?? "";
            body = GetString(values, "message") ?? "";
        }
        else if (formTitle.Contains("Event", StringComparison.OrdinalIgnoreCase))
        {
            title = GetString(values, "full_name") ?? $"Registration #{sub.SubmissionId}";
            subtitle = $"{GetString(values, "company")} — {GetString(values, "job_title")}";
            body = $"Session: {GetString(values, "session")}. {GetString(values, "comments")}";
        }
        else
        {
            title = $"Submission #{sub.SubmissionId}";
            body = "Form submission data";
        }

        return new SubmissionCard
        {
            SubmissionId = sub.SubmissionId,
            FormTitle = formTitle,
            Title = title,
            Subtitle = subtitle,
            Body = body,
            Footer = $"Submitted {sub.SubmittedOnUtc:g} • Status: {sub.Status}"
        };
    }

    private static string GetString(IDictionary<string, object> values, string key)
    {
        if (values == null || !values.TryGetValue(key, out var value)) return null;
        if (value == null) return null;
        if (value is string s) return s;
        return value.ToString();
    }

    public class SubmissionCard
    {
        public int SubmissionId { get; set; }
        public string FormTitle { get; set; }
        public string Title { get; set; }
        public string Subtitle { get; set; }
        public string Body { get; set; }
        public string Footer { get; set; }
    }
}
