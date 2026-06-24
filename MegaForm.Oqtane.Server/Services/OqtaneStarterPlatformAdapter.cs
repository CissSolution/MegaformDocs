// ============================================================
// [OqtaneStarterPlatformAdapter v20260518-01]
// Oqtane-side implementation of IStarterPlatformAdapter (Core).
// Keeps the original EF Core behavior that LeaveRequestStarterService
// (now in MegaForm.Core.Services.Starters) used to do inline. By
// moving these 3 operations behind the adapter, the starter service
// itself compiles cleanly under net472 for DNN — no EF / Oqtane.Repository
// types leak across the boundary.
// ============================================================

using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Services.Starters;
using MegaForm.Core.Workflow;
using MegaForm.Oqtane.Server.Data;

namespace MegaForm.Oqtane.Server.Services
{
    public sealed class OqtaneStarterPlatformAdapter : IStarterPlatformAdapter
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;

        public OqtaneStarterPlatformAdapter(IDbContextFactory<MegaFormDbContext> dbContextFactory)
        {
            _dbContextFactory = dbContextFactory ?? throw new ArgumentNullException(nameof(dbContextFactory));
        }

        public int ResolveUserIdByNameOrEmail(string userName, string email)
        {
            using var db = _dbContextFactory.CreateDbContext();
            using var connection = db.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
                connection.Open();

            using var command = connection.CreateCommand();
            command.CommandText = @"
SELECT TOP 1 UserId
FROM [User]
WHERE UPPER(Username) = @UserName OR UPPER(Email) = @Email
ORDER BY CASE WHEN UPPER(Username) = @UserName THEN 0 ELSE 1 END, UserId DESC;";

            var userNameParameter = command.CreateParameter();
            userNameParameter.ParameterName = "@UserName";
            userNameParameter.Value = (userName ?? string.Empty).Trim().ToUpperInvariant();
            command.Parameters.Add(userNameParameter);

            var emailParameter = command.CreateParameter();
            emailParameter.ParameterName = "@Email";
            emailParameter.Value = (email ?? string.Empty).Trim().ToUpperInvariant();
            command.Parameters.Add(emailParameter);

            var scalar = command.ExecuteScalar();
            if (scalar == null || scalar == DBNull.Value)
                return 0;

            try
            {
                return Convert.ToInt32(scalar);
            }
            catch
            {
                return 0;
            }
        }

        public void ResetFormRuntimeData(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();

            var taskActions = db.Set<WorkflowTaskActionRow>().Where(x => x.FormId == formId).ToList();
            if (taskActions.Count > 0) db.Set<WorkflowTaskActionRow>().RemoveRange(taskActions);

            var tasks = db.Set<WorkflowTaskRow>().Where(x => x.FormId == formId).ToList();
            if (tasks.Count > 0) db.Set<WorkflowTaskRow>().RemoveRange(tasks);

            var cases = db.Set<WorkflowCaseRow>().Where(x => x.FormId == formId).ToList();
            if (cases.Count > 0) db.Set<WorkflowCaseRow>().RemoveRange(cases);

            var executions = db.Set<WorkflowExecutionRow>().Where(x => x.FormId == formId).ToList();
            if (executions.Count > 0) db.Set<WorkflowExecutionRow>().RemoveRange(executions);

            var values = db.SubmissionValues.Where(x => db.Submissions.Any(s => s.SubmissionId == x.SubmissionId && s.FormId == formId)).ToList();
            if (values.Count > 0) db.SubmissionValues.RemoveRange(values);

            var files = db.Files.Where(x => db.Submissions.Any(s => s.SubmissionId == x.SubmissionId && s.FormId == formId)).ToList();
            if (files.Count > 0) db.Files.RemoveRange(files);

            var links = db.SubmissionLinks
                .Where(x =>
                    db.Submissions.Any(s => s.SubmissionId == x.ParentSubmissionId && s.FormId == formId) ||
                    db.Submissions.Any(s => s.SubmissionId == x.ChildSubmissionId && s.FormId == formId))
                .ToList();
            if (links.Count > 0) db.SubmissionLinks.RemoveRange(links);

            var submissions = db.Submissions.Where(x => x.FormId == formId).ToList();
            if (submissions.Count > 0) db.Submissions.RemoveRange(submissions);

            db.SaveChanges();
        }

        public void PersistSeededAttachments(int submissionId, IEnumerable<MegaForm.Core.Services.Starters.StarterSeedAttachment> attachments)
        {
            var list = (attachments ?? Enumerable.Empty<MegaForm.Core.Services.Starters.StarterSeedAttachment>()).Where(x => x != null).ToList();
            if (submissionId <= 0 || list.Count == 0)
                return;

            using var db = _dbContextFactory.CreateDbContext();
            db.Files.AddRange(list.Select(x => x.ToEntity(submissionId)));
            db.SaveChanges();
        }
    }
}
