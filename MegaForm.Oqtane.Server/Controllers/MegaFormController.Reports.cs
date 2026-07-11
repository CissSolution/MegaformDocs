// ════════════════════════════════════════════════════════════════════════
//  MegaFormController.Reports
//  ──────────────────────────────────────────────
//  B55 P2-P3 v20260603 — AUTHOR (Reporting System)
//
//  Adds Oqtane parity for the DNN ReportApiController.cs endpoints:
//    GET    /api/MegaForm/Reports/List              ?portalId=N&appScope=...
//    GET    /api/MegaForm/Reports/Get               ?reportId=N
//    POST   /api/MegaForm/Reports/Save              (body: { name, appScope, definition })
//    DELETE /api/MegaForm/Reports/Delete            ?reportId=N
//    GET    /api/MegaForm/Reports/SubmissionData    ?formId=N&fromDate=&toDate=&fields=
//    GET    /api/MegaForm/Reports/Backfill          ?formId=N
//
//  All actions require the EditModule policy (mirrors the rest of the
//  admin-only popups). PortalId is resolved from PortalSettings on
//  requests that don't pass it explicitly. The runtime reads
//  MF_SubmissionValues which the SubmissionIndexerService keeps in
//  sync with MF_Submissions on every ProcessAsync call.
// ════════════════════════════════════════════════════════════════════════
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using MegaForm.Oqtane.Server.Data;
using Newtonsoft.Json;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    public partial class MegaFormController
    {
        // Resolved from DI on the main partial-class constructor — the
        // Startup.cs scope already binds SubmissionIndexerService.
        private SubmissionIndexerService _reportingIndexerLazy;
        private SubmissionIndexerService GetReportingIndexer()
        {
            if (_reportingIndexerLazy == null)
                _reportingIndexerLazy = HttpContext.RequestServices
                    .GetService(typeof(SubmissionIndexerService)) as SubmissionIndexerService;
            return _reportingIndexerLazy;
        }

        // ── List ───────────────────────────────────────────────────────
        [HttpGet("Reports/List")]
        [Authorize]
        public IActionResult ReportsList(int portalId = -1, string appScope = null)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var pid = portalId >= 0 ? portalId : ResolvePortalId();
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var rows = db.ReportDefinitions.AsNoTracking()
                    .Where(r => r.PortalId == pid
                                && (string.IsNullOrEmpty(appScope) || r.AppScope == appScope))
                    .OrderByDescending(r => r.UpdatedOnUtc ?? r.CreatedOnUtc)
                    .Select(r => new
                    {
                        reportId = r.ReportId,
                        portalId = r.PortalId,
                        name = r.Name,
                        appScope = r.AppScope,
                        createdByUserId = r.CreatedByUserId,
                        createdOnUtc = r.CreatedOnUtc,
                        updatedOnUtc = r.UpdatedOnUtc,
                    })
                    .ToList();
                return Ok(rows);
            }
        }

        // ── FormsOverview ───────────────────────────────────────────────
        // [2026-06-14] WPForms-style entries overview: per-form created date, all-time
        // submission count, last-N-days count, and a daily series for a sparkline. One
        // round-trip for the whole Submissions landing list.
        //   GET /api/MegaForm/Reports/FormsOverview?days=7&siteId=1
        [HttpGet("Reports/FormsOverview")]
        [Authorize]
        public IActionResult ReportsFormsOverview(int days = 7, int siteId = 0)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (days < 1) days = 7;
            if (days > 90) days = 90;
            // Scope forms exactly like Form/List: explicit siteId wins, else the
            // authenticated site. The repo owns the PortalId↔siteId mapping, so we
            // read through it instead of querying db.Forms.PortalId directly (which
            // resolved to 0 → empty for cookie-auth admins).
            if (siteId <= 0) siteId = AuthEntityId(EntityNames.Site);
            var formInfos = siteId > 0 ? _formRepo.ListForms(siteId, pageSize: 0) : null;
            if (formInfos == null || formInfos.Count == 0)
                return Ok(new { days, generatedAtUtc = DateTime.UtcNow, forms = new object[0] });
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var forms = formInfos
                    .Select(f => new { f.FormId, f.Title, f.Status, f.CreatedOnUtc })
                    .ToList();

                var formIds = forms.Select(f => f.FormId).ToList();
                var nowUtc = DateTime.UtcNow;
                var since = nowUtc.Date.AddDays(-(days - 1)); // first day of the window (inclusive)

                var allTime = db.Submissions.AsNoTracking()
                    .Where(s => !s.IsSpam && formIds.Contains(s.FormId))
                    .GroupBy(s => s.FormId)
                    .Select(g => new { FormId = g.Key, Count = g.Count() })
                    .ToList()
                    .ToDictionary(x => x.FormId, x => x.Count);

                // [Perf 2026-07-11] Count per (form, day) IN SQL. This used to project every
                // submission inside the window into memory and bucket it in C# — on a site with a
                // million submissions in the last 30 days that meant materialising a million rows
                // for a sparkline, which took ~30s and made the Submissions landing page time out
                // (the browser aborted and reported "Unexpected end of JSON input").
                // The result set is now at most forms × days rows.
                var dayCounts = db.Submissions.AsNoTracking()
                    .Where(s => !s.IsSpam && s.SubmittedOnUtc >= since && formIds.Contains(s.FormId))
                    .GroupBy(s => new { s.FormId, Day = s.SubmittedOnUtc.Date })
                    .Select(g => new { g.Key.FormId, g.Key.Day, Count = g.Count() })
                    .ToList();

                var byForm = dayCounts.ToLookup(r => r.FormId);

                // [Completion 2026-06-14] REAL field-completion per form: average over the
                // form's (non-spam) submissions of (filled input fields / total input fields).
                // Only computed for forms that actually have submissions (cheap — the rest are
                // null → the UI shows "—"). This is a genuine metric, not a placeholder.
                var completionByForm = new Dictionary<int, int?>();
                foreach (var fid in allTime.Where(kv => kv.Value > 0).Select(kv => kv.Key))
                    completionByForm[fid] = ComputeFormCompletion(db, fid);

                // [ATBE P1] A form bound to a customer table has no submissions of its own — only the
                // anchor rows for records an admin has already looked at. Counting those would report
                // "59 submissions" for a table holding half a million. The honest number is the row
                // count the probe measured, and completion is meaningless for a table we do not own.
                var externalRows = new Dictionary<int, long>();
                foreach (var b in db.ExternalBindings.AsNoTracking()
                                    .Where(x => formIds.Contains(x.FormId))
                                    .Select(x => new { x.FormId, x.ProfileJson })
                                    .ToList())
                {
                    long approx = 0;
                    try
                    {
                        var size = Newtonsoft.Json.Linq.JObject.Parse(b.ProfileJson ?? "{}")["Size"];
                        if (size != null) approx = size.Value<long?>("ApproxRows") ?? 0;
                    }
                    catch { /* a malformed profile must not take the overview down */ }
                    externalRows[b.FormId] = approx;
                    completionByForm[b.FormId] = null;
                }

                var result = forms.Select(f =>
                {
                    var fr = byForm[f.FormId];           // already aggregated per day in SQL
                    var series = new int[days];
                    int frCount = 0;
                    foreach (var r in fr)
                    {
                        frCount += r.Count;
                        var idx = (int)(r.Day - since).TotalDays;
                        if (idx >= 0 && idx < days) series[idx] += r.Count;
                    }
                    bool isExternal = externalRows.TryGetValue(f.FormId, out var extRows);
                    return new
                    {
                        formId = f.FormId,
                        title = string.IsNullOrWhiteSpace(f.Title) ? ("Form #" + f.FormId) : f.Title,
                        status = f.Status ?? string.Empty,
                        createdOnUtc = f.CreatedOnUtc.Year > 1 ? (DateTime?)f.CreatedOnUtc : null,
                        allTime = isExternal
                            ? (extRows > int.MaxValue ? int.MaxValue : (int)extRows)
                            : (allTime.TryGetValue(f.FormId, out var c) ? c : 0),
                        last7 = isExternal ? 0 : frCount,
                        completion = completionByForm.TryGetValue(f.FormId, out var comp) ? comp : null,
                        series = isExternal ? new int[days] : series,
                        external = isExternal,
                    };
                })
                .OrderByDescending(x => x.allTime)
                .ThenByDescending(x => x.last7)
                .ToList();

                return Ok(new { days, generatedAtUtc = nowUtc, forms = result });
            }
        }

        // ── Get ────────────────────────────────────────────────────────
        [HttpGet("Reports/Get")]
        [Authorize]
        public IActionResult ReportsGet(int reportId)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var pid = ResolvePortalId();
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var r = db.ReportDefinitions.AsNoTracking()
                    .FirstOrDefault(x => x.ReportId == reportId && x.PortalId == pid);
                if (r == null) return NotFound(new { error = "Report not found" });
                return Ok(new
                {
                    reportId = r.ReportId,
                    portalId = r.PortalId,
                    name = r.Name,
                    appScope = r.AppScope,
                    definitionJson = r.DefinitionJson,
                    createdByUserId = r.CreatedByUserId,
                    createdOnUtc = r.CreatedOnUtc,
                    updatedOnUtc = r.UpdatedOnUtc,
                });
            }
        }

        // ── Save ───────────────────────────────────────────────────────
        public sealed class ReportSavePayload
        {
            public int ReportId { get; set; }
            public string Name { get; set; }
            public string AppScope { get; set; }
            public object Definition { get; set; }
            public string DefinitionJson { get; set; }
        }

        [HttpPost("Reports/Save")]
        [Authorize]
        public IActionResult ReportsSave([FromBody] ReportSavePayload body)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (body == null) return BadRequest(new { error = "Body required" });
            if (string.IsNullOrWhiteSpace(body.Name))
                return BadRequest(new { error = "name is required" });

            string definitionJson = body.DefinitionJson;
            if (string.IsNullOrWhiteSpace(definitionJson) && body.Definition != null)
                definitionJson = JsonConvert.SerializeObject(body.Definition);
            if (string.IsNullOrWhiteSpace(definitionJson))
                return BadRequest(new { error = "definition is required" });

            var pid = ResolvePortalId();
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var set = db.ReportDefinitions;
                ReportDefinitionRow row;
                if (body.ReportId > 0)
                {
                    row = set.FirstOrDefault(r => r.ReportId == body.ReportId && r.PortalId == pid);
                    if (row == null) return NotFound(new { error = "Report not found" });
                    row.Name = body.Name;
                    row.AppScope = body.AppScope;
                    row.DefinitionJson = definitionJson;
                    row.UpdatedOnUtc = DateTime.UtcNow;
                }
                else
                {
                    row = new ReportDefinitionRow
                    {
                        PortalId = pid,
                        Name = body.Name,
                        AppScope = body.AppScope,
                        DefinitionJson = definitionJson,
                        CreatedByUserId = ResolveCurrentUserId(),
                        CreatedOnUtc = DateTime.UtcNow,
                    };
                    set.Add(row);
                }
                db.SaveChanges();
                return Ok(new { reportId = row.ReportId, success = true });
            }
        }

        // ── Delete ─────────────────────────────────────────────────────
        [HttpDelete("Reports/Delete")]
        [Authorize]
        public IActionResult ReportsDelete(int reportId)
        {
            if (!CanUseAdminPopup()) return Forbid();
            var pid = ResolvePortalId();
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var row = db.ReportDefinitions
                    .FirstOrDefault(r => r.ReportId == reportId && r.PortalId == pid);
                if (row == null) return NotFound(new { error = "Report not found" });
                db.Remove(row);
                db.SaveChanges();
                return Ok(new { success = true });
            }
        }

        // ── SubmissionData ─────────────────────────────────────────────
        [HttpGet("Reports/SubmissionData")]
        [Authorize]
        public IActionResult ReportsSubmissionData(
            int formId,
            string fromDate = null,
            string toDate = null,
            string fields = null,
            int top = 1000)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (formId <= 0) return BadRequest(new { error = "formId is required" });
            top = Math.Max(1, Math.Min(top, 5000));

            DateTime? fromDt = TryParseDateLite(fromDate);
            DateTime? toDt = TryParseDateLite(toDate);

            var fieldKeys = (fields ?? string.Empty)
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            using (var db = _dbContextFactory.CreateDbContext())
            {
                var subs = db.Submissions.AsNoTracking()
                    .Where(s => s.FormId == formId
                                && (!fromDt.HasValue || s.SubmittedOnUtc >= fromDt.Value)
                                && (!toDt.HasValue || s.SubmittedOnUtc <= toDt.Value))
                    .OrderByDescending(s => s.SubmittedOnUtc)
                    .Take(top)
                    .Select(s => new { s.SubmissionId, s.SubmittedOnUtc, s.Status })
                    .ToList();

                if (subs.Count == 0)
                    return Ok(new { rows = new List<Dictionary<string, object>>(), count = 0 });

                var ids = subs.Select(s => s.SubmissionId).ToList();
                var rows = subs.Select(s => new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["submissionId"] = s.SubmissionId,
                    ["submittedOnUtc"] = s.SubmittedOnUtc,
                    ["status"] = s.Status,
                }).ToList();

                if (fieldKeys.Count > 0)
                {
                    // Raw SQL keeps us off the EF mapping for MF_SubmissionValues
                    // (already bound to SubmissionValueInfo with the legacy
                    // ValueId column). The B55 flat index is keyed on
                    // (SubmissionId, FieldKey) so the raw read is straightforward.
                    var conn = db.Database.GetDbConnection();
                    if (conn.State != System.Data.ConnectionState.Open) conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        var idParam = string.Join(",", ids.Select((id, i) => "@s" + i));
                        var keyParam = string.Join(",", fieldKeys.Select((k, i) => "@k" + i));
                        cmd.CommandText = string.Format(
                            "SELECT SubmissionId, FieldKey, ValueText, ValueNumber, ValueDate " +
                            "FROM MF_SubmissionValues " +
                            "WHERE SubmissionId IN ({0}) AND FieldKey IN ({1})", idParam, keyParam);
                        for (int i = 0; i < ids.Count; i++)
                        {
                            var p = cmd.CreateParameter();
                            p.ParameterName = "@s" + i;
                            p.Value = ids[i];
                            cmd.Parameters.Add(p);
                        }
                        for (int i = 0; i < fieldKeys.Count; i++)
                        {
                            var p = cmd.CreateParameter();
                            p.ParameterName = "@k" + i;
                            p.Value = fieldKeys[i];
                            cmd.Parameters.Add(p);
                        }
                        var rowsBySid = rows.ToDictionary(r => Convert.ToInt32(r["submissionId"]));
                        using (var r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                int sid = r.GetInt32(0);
                                string key = r.IsDBNull(1) ? string.Empty : r.GetString(1);
                                object val = null;
                                if (!r.IsDBNull(3)) val = r.GetDecimal(3);
                                else if (!r.IsDBNull(4)) val = r.GetDateTime(4);
                                else if (!r.IsDBNull(2)) val = r.GetString(2);
                                if (rowsBySid.TryGetValue(sid, out var row))
                                    row[key] = val;
                            }
                        }
                    }
                }

                return Ok(new { rows, count = rows.Count });
            }
        }

        // ── Backfill ───────────────────────────────────────────────────
        [HttpGet("Reports/Backfill")]
        [Authorize]
        public IActionResult ReportsBackfill(int formId)
        {
            if (!CanUseAdminPopup()) return Forbid();
            if (formId <= 0) return BadRequest(new { error = "formId is required" });

            var indexer = GetReportingIndexer();
            if (indexer == null)
                return StatusCode(500, new { error = "Reporting indexer not registered" });

            var form = _formRepo.GetForm(formId);
            FormSchema schema = null;
            try
            {
                if (form != null && !string.IsNullOrWhiteSpace(form.SchemaJson))
                    schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
            }
            catch { schema = null; }

            var fields = MegaFormUtils.FlattenFields(schema?.Fields);
            int processed = 0;
            using (var db = _dbContextFactory.CreateDbContext())
            {
                var subs = db.Submissions.AsNoTracking()
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
                    try
                    {
                        indexer.IndexSubmission(sub.SubmissionId, formId, data, fields);
                        processed++;
                    }
                    catch { /* index failures don't abort backfill */ }
                }
            }
            return Ok(new { processed, formId });
        }

        // ── Helpers ────────────────────────────────────────────────────

        // Display/layout field types that don't count toward form completion.
        private static readonly HashSet<string> _nonInputFieldTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "heading","header","title","subtitle","paragraph","text-block","textblock","html",
            "richtext","rich-text","divider","separator","spacer","image","staticimage","banner",
            "section","pagebreak","page-break","page","label","captcha","recaptcha","hidden","button",
        };

        // REAL field-completion for a form: average over its non-spam submissions of
        // (filled input fields / total input fields). Null when the form has no schema
        // fields or no submissions.
        //
        // [Perf 2026-06-19 fix #3] This runs once PER FORM on the FormsOverview landing
        // (an N+1), and each call previously deserialized up to 500 full DataJson blobs.
        // The "filled" definition here (live-schema input-field denominator + IsEmptyValue
        // treating "[]"/"{}"/"null"/whitespace as empty + _nonInputFieldTypes exclusion)
        // cannot be reproduced byte-identically from the flat MF_SubmissionValues index
        // (that index has no row for empty values and no per-submission notion of the
        // CURRENT schema's input-field count), so we keep the DataJson path but make it
        // cheap: cap to the 50 most-recent submissions (a stable, representative sample
        // for an average) and project ONLY DataJson. The completion % is a sampled
        // average, not an all-time exact figure — acceptable for an overview sparkline KPI.
        private const int CompletionSampleCap = 50;
        private int? ComputeFormCompletion(MegaFormDbContext db, int formId)
        {
            try
            {
                var form = _formRepo.GetForm(formId);
                if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson)) return null;
                FormSchema schema;
                try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
                catch { return null; }

                var fieldKeys = MegaFormUtils.FlattenFields(schema?.Fields)
                    ?.Where(x => x != null && !string.IsNullOrEmpty(x.Key) && !_nonInputFieldTypes.Contains(x.Type ?? string.Empty))
                    .Select(x => x.Key)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                if (fieldKeys == null || fieldKeys.Count == 0) return null;

                var dataJsons = db.Submissions.AsNoTracking()
                    .Where(s => s.FormId == formId && !s.IsSpam)
                    .OrderByDescending(s => s.SubmittedOnUtc)
                    .Take(CompletionSampleCap) // [fix #3] sample the 50 most-recent only; project DataJson alone
                    .Select(s => s.DataJson)
                    .ToList();
                if (dataJsons.Count == 0) return null;

                double ratioSum = 0; int counted = 0;
                foreach (var dj in dataJsons)
                {
                    if (string.IsNullOrWhiteSpace(dj)) continue;
                    Dictionary<string, object> data;
                    try { data = JsonConvert.DeserializeObject<Dictionary<string, object>>(dj); }
                    catch { continue; }
                    if (data == null) continue;
                    var ci = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    foreach (var kv in data) ci[kv.Key] = kv.Value;
                    int filled = 0;
                    foreach (var k in fieldKeys)
                        if (ci.TryGetValue(k, out var v) && !IsEmptyValue(v)) filled++;
                    ratioSum += (double)filled / fieldKeys.Count;
                    counted++;
                }
                if (counted == 0) return null;
                return (int)Math.Round(ratioSum / counted * 100.0);
            }
            catch { return null; }
        }

        private static bool IsEmptyValue(object v)
        {
            if (v == null) return true;
            var s = v.ToString();
            return string.IsNullOrWhiteSpace(s) || s == "[]" || s == "{}" || s == "null";
        }

        private int ResolvePortalId()
        {
            try
            {
                var claim = User?.FindFirst("siteid")?.Value
                          ?? User?.FindFirst("SiteId")?.Value;
                if (int.TryParse(claim, out var pid) && pid >= 0) return pid;
            }
            catch { }
            return 0;
        }

        private int? ResolveCurrentUserId()
        {
            try
            {
                var claim = User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                          ?? User?.FindFirst("UserId")?.Value;
                if (int.TryParse(claim, out var uid) && uid > 0) return uid;
            }
            catch { }
            return null;
        }

        private static DateTime? TryParseDateLite(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;
            return DateTime.TryParse(s, out var dt) ? dt : (DateTime?)null;
        }
    }

    // ── Report definition row ──────────────────────────────────────
    // Lives in MF_ReportDefinitions; full mapping (table + indexes)
    // is configured in MegaFormDbContext.OnModelCreating. Reads/writes
    // for MF_SubmissionValues go through raw SQL because the table is
    // already EF-mapped to the legacy SubmissionValueInfo shape.
    public class ReportDefinitionRow
    {
        public int ReportId { get; set; }
        public int PortalId { get; set; }
        public string Name { get; set; }
        public string AppScope { get; set; }
        public string DefinitionJson { get; set; }
        public int? CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }
    }
}
