using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Services.Starters;
using MegaForm.Umbraco.Data;
using Microsoft.EntityFrameworkCore;
using Umbraco.Cms.Core.Services;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// [UmbracoStarterPlatformAdapter v20260710] Umbraco implementation of
    /// IStarterPlatformAdapter. Lets the Core Business Starter services run on
    /// Umbraco without leaking platform-specific types into MegaForm.Core.
    /// </summary>
    public sealed class UmbracoStarterPlatformAdapter : IStarterPlatformAdapter
    {
        private readonly MegaFormDbContext _db;
        private readonly IUserService _userService;

        public UmbracoStarterPlatformAdapter(MegaFormDbContext db, IUserService userService)
        {
            _db = db ?? throw new ArgumentNullException(nameof(db));
            _userService = userService;
        }

        public int ResolveUserIdByNameOrEmail(string userName, string email)
        {
            var normalizedUserName = (userName ?? string.Empty).Trim();
            var normalizedEmail = (email ?? string.Empty).Trim();

            // Umbraco back-office user ids are ints; return the first match.
            if (!string.IsNullOrWhiteSpace(normalizedUserName))
            {
                var byName = _userService.GetByUsername(normalizedUserName);
                if (byName != null) return byName.Id;
            }

            if (!string.IsNullOrWhiteSpace(normalizedEmail))
            {
                var byEmail = _userService.GetByEmail(normalizedEmail);
                if (byEmail != null) return byEmail.Id;
            }

            return 0;
        }

        public void ResetFormRuntimeData(int formId)
        {
            var taskActions = _db.WorkflowTaskActions.Where(x => x.FormId == formId).ToList();
            if (taskActions.Count > 0) _db.WorkflowTaskActions.RemoveRange(taskActions);

            var tasks = _db.WorkflowTasks.Where(x => x.FormId == formId).ToList();
            if (tasks.Count > 0) _db.WorkflowTasks.RemoveRange(tasks);

            var cases = _db.WorkflowCases.Where(x => x.FormId == formId).ToList();
            if (cases.Count > 0) _db.WorkflowCases.RemoveRange(cases);

            var executions = _db.WorkflowExecutions.Where(x => x.FormId == formId).ToList();
            if (executions.Count > 0) _db.WorkflowExecutions.RemoveRange(executions);

            var submissionIds = _db.Submissions.Where(s => s.FormId == formId).Select(s => s.SubmissionId).ToList();
            if (submissionIds.Count > 0)
            {
                var values = _db.SubmissionValues.Where(x => submissionIds.Contains(x.SubmissionId)).ToList();
                if (values.Count > 0) _db.SubmissionValues.RemoveRange(values);

                var files = _db.Files.Where(x => submissionIds.Contains(x.SubmissionId)).ToList();
                if (files.Count > 0) _db.Files.RemoveRange(files);

                var links = _db.SubmissionLinks
                    .Where(x => submissionIds.Contains(x.ParentSubmissionId) || submissionIds.Contains(x.ChildSubmissionId))
                    .ToList();
                if (links.Count > 0) _db.SubmissionLinks.RemoveRange(links);

                var submissions = _db.Submissions.Where(x => x.FormId == formId).ToList();
                if (submissions.Count > 0) _db.Submissions.RemoveRange(submissions);
            }

            _db.SaveChanges();
        }

        public void PersistSeededAttachments(int submissionId, IEnumerable<StarterSeedAttachment> attachments)
        {
            var list = (attachments ?? Enumerable.Empty<StarterSeedAttachment>()).Where(x => x != null).ToList();
            if (submissionId <= 0 || list.Count == 0)
                return;

            _db.Files.AddRange(list.Select(x => x.ToEntity(submissionId)));
            _db.SaveChanges();
        }
    }
}
