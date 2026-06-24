// ============================================================
// MegaForm Core - Starter Status Service
// ------------------------------------------------------------
// Returns "is this starter already installed?" for each of the
// 4 Business Starters in this portal/site. The Dashboard
// Business Starters modal uses this to:
//   - show a green check + "Open Board" button when installed
//   - show the normal "Launch" button when not installed
//   - offer a "Reseed" action to wipe + reseed sample data
//
// Detection rule: look up the form by AppScope (for Leave /
// Proposal / Document Exchange) OR by exact form title (for
// Purchase Order which is a lean starter without an AppScope).
// If the form exists and is Published, count submissions for
// extra context in the UI.
// ============================================================

using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services.Starters
{
    public sealed class StarterStatusItem
    {
        public string Key { get; set; }
        public string Name { get; set; }
        public string Scope { get; set; }
        public bool Installed { get; set; }
        public int FormId { get; set; }
        public string FormTitle { get; set; }
        public string Status { get; set; }
        public string DefaultViewKey { get; set; }
        public int SubmissionCount { get; set; }
        public DateTime? LastSubmittedOnUtc { get; set; }
        // [MultiFormStarter v20260519-01] Multi-form starters (e.g. Recruitment)
        // own > 1 form. FormId above stays as the "primary" / Board form for
        // back-compat; additional forms are listed here so the UI can show
        // "3 forms" badge and per-form open links.
        public List<StarterFormInfo> Forms { get; set; } = new List<StarterFormInfo>();
    }

    public sealed class StarterFormInfo
    {
        public int FormId { get; set; }
        public string Title { get; set; }
        public string FormRole { get; set; }
        public int SubmissionCount { get; set; }
    }

    public sealed class StarterStatusService
    {
        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;

        public StarterStatusService(IFormRepository forms, ISubmissionRepository submissions)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
        }

        /// <summary>
        /// Return install-state for all 4 Business Starters for this portal.
        /// </summary>
        public List<StarterStatusItem> GetAll(int portalId)
        {
            var portalForms = _forms.ListForms(portalId, status: null, search: null, pageIndex: 0, pageSize: 1000) ?? new List<FormInfo>();
            var blog = ConfiguredAppStarterDefinitions.Get("blog");

            return new List<StarterStatusItem>
            {
                BuildByScope(portalForms,  "leave-request",     LeaveRequestStarterService.StarterAppName,     LeaveRequestStarterService.StarterAppScope,     LeaveRequestStarterService.StarterFormTitle,     "leave-request-board"),
                BuildByScope(portalForms,  "proposal",          ProposalStarterService.StarterAppName,         ProposalStarterService.StarterAppScope,         ProposalStarterService.StarterFormTitle,         "proposal-review-board"),
                BuildByScope(portalForms,  "document-exchange", DocumentExchangeStarterService.StarterAppName, DocumentExchangeStarterService.StarterAppScope, DocumentExchangeStarterService.StarterFormTitle, "document-routing-board"),
                BuildByTitle(portalForms,  "purchase-order",    PurchaseOrderStarterService.FormTitle,         PurchaseOrderStarterService.FormTitle,           string.Empty),
                BuildMultiForm(portalForms, "recruitment",      RecruitmentStarterService.StarterAppName,      RecruitmentStarterService.StarterAppScope,      RecruitmentStarterService.JobPostingFormTitle,   "recruitment-job-board"),
                BuildByScope(portalForms,  "blog",              blog.AppName,                                  blog.AppScope,                                  blog.FormTitle,                                  blog.DefaultViewKey),
            };
        }

        /// <summary>
        /// Multi-form starter (e.g. Recruitment Pipeline) detection: a starter
        /// owns >1 form under the same AppScope. Primary FormId is the one
        /// matching primaryFormTitle so the "Open Board" button has a known
        /// landing form; the Forms list carries the others so UI can show
        /// "3 forms · 12 submissions" and per-form links.
        /// </summary>
        private StarterStatusItem BuildMultiForm(List<FormInfo> forms, string key, string name, string scope, string primaryFormTitle, string defaultViewKey)
        {
            var matched = forms.Where(f => f != null && string.Equals(f.AppScope ?? string.Empty, scope ?? string.Empty, StringComparison.OrdinalIgnoreCase)).ToList();
            var primary = matched.FirstOrDefault(f => string.Equals(f.Title ?? string.Empty, primaryFormTitle ?? string.Empty, StringComparison.OrdinalIgnoreCase)) ?? matched.FirstOrDefault();
            var item = BuildFrom(primary, key, name, scope, primaryFormTitle, defaultViewKey);
            foreach (var f in matched)
            {
                int subCount = 0;
                try { subCount = _submissions.List(f.FormId, pageIndex: 0, pageSize: 1).TotalCount; } catch { }
                item.Forms.Add(new StarterFormInfo
                {
                    FormId   = f.FormId,
                    Title    = f.Title,
                    FormRole = ReadFormRole(f),
                    SubmissionCount = subCount
                });
            }
            return item;
        }

        private static string ReadFormRole(FormInfo f)
        {
            if (string.IsNullOrWhiteSpace(f?.SettingsJson)) return string.Empty;
            try
            {
                var obj = Newtonsoft.Json.Linq.JObject.Parse(f.SettingsJson);
                return (string)obj["formRole"] ?? string.Empty;
            }
            catch { return string.Empty; }
        }

        private StarterStatusItem BuildByScope(List<FormInfo> forms, string key, string name, string scope, string formTitle, string defaultViewKey)
        {
            var match = forms.FirstOrDefault(f => f != null
                && string.Equals(f.AppScope ?? string.Empty, scope ?? string.Empty, StringComparison.OrdinalIgnoreCase));
            return BuildFrom(match, key, name, scope, formTitle, defaultViewKey);
        }

        private StarterStatusItem BuildByTitle(List<FormInfo> forms, string key, string name, string formTitle, string defaultViewKey)
        {
            var match = forms.FirstOrDefault(f => f != null
                && string.Equals(f.Title ?? string.Empty, formTitle ?? string.Empty, StringComparison.OrdinalIgnoreCase));
            return BuildFrom(match, key, name, string.Empty, formTitle, defaultViewKey);
        }

        private StarterStatusItem BuildFrom(FormInfo form, string key, string name, string scope, string formTitle, string defaultViewKey)
        {
            var item = new StarterStatusItem
            {
                Key = key,
                Name = name,
                Scope = scope ?? string.Empty,
                Installed = false,
                FormId = 0,
                FormTitle = formTitle,
                Status = string.Empty,
                DefaultViewKey = defaultViewKey ?? string.Empty,
                SubmissionCount = 0,
                LastSubmittedOnUtc = null
            };
            if (form == null || form.FormId <= 0) return item;

            item.Installed       = true;
            item.FormId          = form.FormId;
            item.FormTitle       = form.Title ?? formTitle;
            item.Status          = form.Status ?? string.Empty;

            try
            {
                var page = _submissions.List(form.FormId, pageIndex: 0, pageSize: 1);
                item.SubmissionCount = page.TotalCount;
                if (page.Items != null && page.Items.Count > 0 && page.Items[0] != null)
                    item.LastSubmittedOnUtc = page.Items[0].SubmittedOnUtc;
            }
            catch { /* submissions read is best-effort */ }

            return item;
        }
    }
}
