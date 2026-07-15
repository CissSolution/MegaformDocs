using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using MegaForm.Umbraco.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// MegaForm Reporting API for Umbraco.
    /// Mirrors Web/Oqtane: List / Get / Save / Delete / SubmissionData / Backfill.
    /// </summary>
    [Route("/umbraco/MegaForm/MegaFormApi/[controller]")]
    [Authorize(Policy = "MegaFormBackOffice")]
    public class ReportsController : ControllerBase
    {
        private readonly MegaFormDbContext _db;
        private readonly IFormRepository _formRepo;
        private readonly IPlatformContext _platform;
        private readonly SubmissionIndexerService _indexer;

        public ReportsController(MegaFormDbContext db, IFormRepository formRepo, IPlatformContext platform, SubmissionIndexerService indexer)
        {
            _db = db;
            _formRepo = formRepo;
            _platform = platform;
            _indexer = indexer;
        }

        private int PortalId => _platform?.PortalId >= 0 ? _platform.PortalId : 0;
        private int? CurrentUserId => _platform?.UserId > 0 ? (int?)_platform.UserId : null;

        [HttpGet("List")]
        public IActionResult List(int portalId = -1, string appScope = null)
        {
            var pid = portalId >= 0 ? portalId : PortalId;
            var rows = _db.ReportDefinitions.AsNoTracking()
                .Where(r => r.PortalId == pid && (string.IsNullOrEmpty(appScope) || r.AppScope == appScope))
                .OrderByDescending(r => r.UpdatedOnUtc ?? r.CreatedOnUtc)
                .Select(r => new
                {
                    reportId = r.ReportId, portalId = r.PortalId, name = r.Name, appScope = r.AppScope,
                    createdByUserId = r.CreatedByUserId, createdOnUtc = r.CreatedOnUtc, updatedOnUtc = r.UpdatedOnUtc,
                }).ToList();
            return Ok(rows);
        }

        [HttpGet("Get")]
        public IActionResult Get(int reportId)
        {
            var r = _db.ReportDefinitions.AsNoTracking()
                .FirstOrDefault(x => x.ReportId == reportId && x.PortalId == PortalId);
            if (r == null) return NotFound(new { error = "Report not found" });
            return Ok(new
            {
                reportId = r.ReportId, portalId = r.PortalId, name = r.Name, appScope = r.AppScope,
                definitionJson = r.DefinitionJson,
                createdByUserId = r.CreatedByUserId, createdOnUtc = r.CreatedOnUtc, updatedOnUtc = r.UpdatedOnUtc,
            });
        }

        [HttpGet("FormsOverview")]
        public IActionResult FormsOverview(int days = 30, int siteId = 0)
        {
            if (days < 1) days = 7;
            if (days > 90) days = 90;

            var pid = PortalId;
            var forms = _formRepo.ListForms(pid, pageSize: 0) ?? new List<FormInfo>();
            if (forms.Count == 0)
                return Ok(new { days, generatedAtUtc = DateTime.UtcNow, forms = new object[0] });

            var formIds = forms.Select(f => f.FormId).ToList();
            var nowUtc = DateTime.UtcNow;
            var since = nowUtc.Date.AddDays(-(days - 1));

            var allTime = _db.Submissions.AsNoTracking()
                .Where(s => !s.IsSpam && formIds.Contains(s.FormId))
                .GroupBy(s => s.FormId)
                .Select(g => new { FormId = g.Key, Count = g.Count() })
                .ToList()
                .ToDictionary(x => x.FormId, x => x.Count);

            // [Bounded-read 2026-07-15] Count per (form, day) IN SQL — was materialising every
            // submission in the window just for a sparkline (times out on a busy site). Ported from
            // the Oqtane twin. Result set is at most forms × days rows.
            var dayCounts = _db.Submissions.AsNoTracking()
                .Where(s => !s.IsSpam && s.SubmittedOnUtc >= since && formIds.Contains(s.FormId))
                .GroupBy(s => new { s.FormId, Day = s.SubmittedOnUtc.Date })
                .Select(g => new { g.Key.FormId, g.Key.Day, Count = g.Count() })
                .ToList();

            var byForm = dayCounts.ToLookup(r => r.FormId);

            var result = forms.Select(f =>
            {
                var fr = byForm[f.FormId];
                var series = new int[days];
                int frCount = 0;
                foreach (var r in fr)
                {
                    frCount += r.Count;
                    var idx = (int)(r.Day - since).TotalDays;
                    if (idx >= 0 && idx < days) series[idx] += r.Count;
                }
                return new
                {
                    formId = f.FormId,
                    title = string.IsNullOrWhiteSpace(f.Title) ? ("Form #" + f.FormId) : f.Title,
                    status = f.Status ?? string.Empty,
                    createdOnUtc = f.CreatedOnUtc.Year > 1 ? (DateTime?)f.CreatedOnUtc : null,
                    allTime = allTime.TryGetValue(f.FormId, out var c) ? c : 0,
                    last7 = frCount,
                    completion = (int?)null,
                    series,
                };
            })
            .OrderByDescending(x => x.allTime)
            .ThenByDescending(x => x.last7)
            .ToList();

            return Ok(new { days, generatedAtUtc = nowUtc, forms = result });
        }

        public sealed class ReportSavePayload
        {
            public int ReportId { get; set; }
            public string Name { get; set; }
            public string AppScope { get; set; }
            public object Definition { get; set; }
            public string DefinitionJson { get; set; }
        }

        [HttpPost("Save")]
        public IActionResult Save([FromBody] ReportSavePayload body)
        {
            if (body == null) return BadRequest(new { error = "Body required" });
            if (string.IsNullOrWhiteSpace(body.Name)) return BadRequest(new { error = "name is required" });
            var definitionJson = body.DefinitionJson;
            if (string.IsNullOrWhiteSpace(definitionJson) && body.Definition != null)
                definitionJson = JsonConvert.SerializeObject(body.Definition);
            if (string.IsNullOrWhiteSpace(definitionJson)) return BadRequest(new { error = "definition is required" });

            ReportDefinitionInfo row;
            if (body.ReportId > 0)
            {
                row = _db.ReportDefinitions.FirstOrDefault(r => r.ReportId == body.ReportId && r.PortalId == PortalId);
                if (row == null) return NotFound(new { error = "Report not found" });
                row.Name = body.Name;
                row.AppScope = body.AppScope;
                row.DefinitionJson = definitionJson;
                row.UpdatedOnUtc = DateTime.UtcNow;
            }
            else
            {
                row = new ReportDefinitionInfo
                {
                    PortalId = PortalId,
                    Name = body.Name,
                    AppScope = body.AppScope,
                    DefinitionJson = definitionJson,
                    CreatedByUserId = CurrentUserId,
                    CreatedOnUtc = DateTime.UtcNow,
                };
                _db.ReportDefinitions.Add(row);
            }
            _db.SaveChanges();
            return Ok(new { reportId = row.ReportId, success = true });
        }

        [HttpDelete("Delete")]
        public IActionResult Delete(int reportId)
        {
            var row = _db.ReportDefinitions.FirstOrDefault(r => r.ReportId == reportId && r.PortalId == PortalId);
            if (row == null) return NotFound(new { error = "Report not found" });
            _db.ReportDefinitions.Remove(row);
            _db.SaveChanges();
            return Ok(new { success = true });
        }

        [HttpGet("SubmissionData")]
        public IActionResult SubmissionData(int formId, string fromDate = null, string toDate = null, string fields = null, int top = 1000)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required" });
            top = Math.Max(1, Math.Min(top, 5000));
            DateTime? fromDt = TryParseDateLite(fromDate);
            DateTime? toDt = TryParseDateLite(toDate);
            var fieldKeys = (fields ?? string.Empty).Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            var subs = _db.Submissions.AsNoTracking()
                .Where(s => s.FormId == formId
                            && (!fromDt.HasValue || s.SubmittedOnUtc >= fromDt.Value)
                            && (!toDt.HasValue || s.SubmittedOnUtc <= toDt.Value))
                .OrderByDescending(s => s.SubmittedOnUtc)
                .Take(top)
                .Select(s => new { s.SubmissionId, s.SubmittedOnUtc, s.Status })
                .ToList();

            if (subs.Count == 0) return Ok(new { rows = new List<Dictionary<string, object>>(), count = 0 });

            var ids = subs.Select(s => s.SubmissionId).ToList();
            var rows = subs.Select(s => new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["submissionId"] = s.SubmissionId,
                ["submittedOnUtc"] = s.SubmittedOnUtc,
                ["status"] = s.Status,
            }).ToList();

            if (fieldKeys.Count > 0)
            {
                var conn = _db.Database.GetDbConnection();
                if (conn.State != System.Data.ConnectionState.Open) conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    var idParam = string.Join(",", ids.Select((id, i) => "@s" + i));
                    var keyParam = string.Join(",", fieldKeys.Select((k, i) => "@k" + i));
                    cmd.CommandText = $"SELECT SubmissionId, FieldKey, ValueText, ValueNumber, ValueDate FROM MF_SubmissionValues WHERE SubmissionId IN ({idParam}) AND FieldKey IN ({keyParam})";
                    for (int i = 0; i < ids.Count; i++) { var p = cmd.CreateParameter(); p.ParameterName = "@s" + i; p.Value = ids[i]; cmd.Parameters.Add(p); }
                    for (int i = 0; i < fieldKeys.Count; i++) { var p = cmd.CreateParameter(); p.ParameterName = "@k" + i; p.Value = fieldKeys[i]; cmd.Parameters.Add(p); }
                    var rowsBySid = rows.ToDictionary(r => Convert.ToInt32(r["submissionId"]));
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        int sid = r.GetInt32(0);
                        string key = r.IsDBNull(1) ? string.Empty : r.GetString(1);
                        object val = null;
                        if (!r.IsDBNull(3)) val = r.GetDecimal(3);
                        else if (!r.IsDBNull(4)) val = r.GetDateTime(4);
                        else if (!r.IsDBNull(2)) val = r.GetString(2);
                        if (rowsBySid.TryGetValue(sid, out var row)) row[key] = val;
                    }
                }
            }
            return Ok(new { rows, count = rows.Count });
        }

        [HttpGet("Backfill")]
        public IActionResult Backfill(int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required" });
            if (_indexer == null) return StatusCode(500, new { error = "Reporting indexer not registered" });
            var form = _formRepo.GetForm(formId);
            FormSchema schema = null;
            try { if (form != null && !string.IsNullOrWhiteSpace(form.SchemaJson)) schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
            catch { schema = null; }
            var fields = MegaFormUtils.FlattenFields(schema?.Fields);
            int processed = 0;
            var subs = _db.Submissions.AsNoTracking()
                .Where(s => s.FormId == formId)
                .Select(s => new { s.SubmissionId, s.DataJson })
                .ToList();
            foreach (var sub in subs)
            {
                if (string.IsNullOrWhiteSpace(sub.DataJson)) continue;
                Dictionary<string, object> data;
                try { data = JsonConvert.DeserializeObject<Dictionary<string, object>>(sub.DataJson); }
                catch { continue; }
                if (data == null) continue;
                try { _indexer.IndexSubmission(sub.SubmissionId, formId, data, fields); processed++; }
                catch { /* index failures don't abort backfill */ }
            }
            return Ok(new { processed, formId });
        }

        private static DateTime? TryParseDateLite(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;
            return DateTime.TryParse(s, out var dt) ? dt : (DateTime?)null;
        }
    }
}
