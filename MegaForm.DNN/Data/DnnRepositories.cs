using System;
using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

using MfFileInfo = MegaForm.Core.Models.FileInfo;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// DNN implementation of IFormRepository.
    /// Wraps existing FormRepository static methods for backward compatibility.
    /// When porting to Oqtane, create OqtFormRepository implementing same interface with EF Core.
    /// </summary>
    public class DnnFormRepository : IFormRepository
    {
        public FormInfo GetForm(int formId)
        {
            return FormRepository.GetForm(formId);
        }

        public List<FormInfo> GetFormsByModule(int moduleId)
        {
            return FormRepository.GetFormsByModule(moduleId);
        }

        public List<FormInfo> ListForms(int portalId, string status = null, string search = null,
            int pageIndex = 0, int pageSize = 20)
        {
            return FormRepository.ListForms(portalId, status, search, pageIndex, pageSize);
        }

        public int SaveForm(FormInfo form)
        {
            return FormRepository.SaveForm(form);
        }

        public void DeleteForm(int formId)
        {
            FormRepository.DeleteForm(formId);
        }

        public FormStatsInfo GetFormStats(int formId)
        {
            return FormRepository.GetFormStats(formId);
        }

        public int DuplicateForm(int formId, int userId)
        {
            // Use existing static method if available, otherwise stub
            // TODO: implement FormRepository.DuplicateForm if not exists
            var form = FormRepository.GetForm(formId);
            if (form == null) return 0;
            form.FormId = 0;
            form.Title = form.Title + " (Copy)";
            form.CreatedByUserId = userId;
            form.CreatedOnUtc = DateTime.UtcNow;
            form.Status = "Draft";
            return FormRepository.SaveForm(form);
        }
    }

    /// <summary>
    /// DNN implementation of ISubmissionRepository.
    /// </summary>
    public class DnnSubmissionRepository : ISubmissionRepository
    {
        public int Insert(SubmissionInfo sub)
        {
            return FormRepository.InsertSubmission(sub);
        }

        public SubmissionInfo Get(int submissionId)
        {
            return FormRepository.GetSubmission(submissionId);
        }

        public List<SubmissionValueInfo> GetValues(int submissionId)
        {
            return new List<SubmissionValueInfo>();
        }

        public (List<SubmissionInfo> Items, int TotalCount) List(int formId,
            string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50)
        {
            return FormRepository.ListSubmissions(formId, status, search, dateFrom, dateTo, pageIndex, pageSize);
        }

        public void UpdateStatus(int submissionId, string status)
        {
            FormRepository.UpdateSubmissionStatus(submissionId, status);
        }

        public void UpdateData(int submissionId, string dataJson)
        {
            FormRepository.UpdateSubmissionData(submissionId, dataJson);
        }

        public void Delete(int submissionId)
        {
            FormRepository.DeleteSubmission(submissionId);
        }

        public void BulkDelete(int formId, int[] submissionIds)
        {
            if (submissionIds == null) return;
            foreach (var id in submissionIds)
            {
                FormRepository.DeleteSubmission(id);
            }
        }

        public void InsertValues(int submissionId, List<SubmissionValueInfo> values)
        {
            // DNN stores submission data as JSON in SubmissionInfo.DataJson
            // Individual values are not stored separately in DNN implementation
            // This is a no-op for DNN; data is saved via Insert() with DataJson
        }
    }

    /// <summary>
    /// DNN implementation of IFileRepository.
    /// </summary>
    public class DnnFileRepository : IFileRepository
    {
        public int InsertFile(MfFileInfo file)
        {
            return FormRepository.InsertFile(file);
        }

        public List<MfFileInfo> GetBySubmission(int submissionId)
        {
            return FormRepository.GetFilesBySubmission(submissionId);
        }

        public void DeleteBySubmission(int submissionId)
        {
            // TODO: implement in FormRepository if needed
        }
    }

    /// <summary>
    /// DNN implementation of IDraftRepository.
    /// </summary>
    public class DnnDraftRepository : IDraftRepository
    {
        public int SaveDraft(SavedDraftInfo draft)
        {
            return FormRepository.SaveDraft(draft);
        }

        public SavedDraftInfo GetDraft(string resumeToken)
        {
            return FormRepository.GetDraft(resumeToken);
        }

        public void DeleteDraft(string resumeToken)
        {
            FormRepository.DeleteDraft(resumeToken);
        }

        public void CleanExpiredDrafts()
        {
            // TODO: implement cleanup query
            // DELETE FROM MF_SavedDrafts WHERE ExpiresOnUtc < SYSUTCDATETIME()
        }
    }
}
