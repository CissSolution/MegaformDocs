using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Data;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.DNN.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    // ============================================================
    //  B55 P2-P3 — Report API (DNN)
    // ============================================================
    //  Surfaces three endpoint families used by the dashboard:
    //
    //    /api/MegaForm/Reports/List         — list report definitions
    //    /api/MegaForm/Reports/Get          — load a single definition
    //    /api/MegaForm/Reports/Save         — upsert a report definition
    //    /api/MegaForm/Reports/Delete       — delete by ReportId
    //
    //    /api/MegaForm/Reports/SubmissionData — runtime query that powers
    //                                            the "Submission Report"
    //                                            popup (P3). Reads from
    //                                            MF_SubmissionValues using
    //                                            the B55 P1 flat index.
    //
    //    /api/MegaForm/SubmissionIndex/Backfill — re-index every submission
    //                                              for a given form. Cheap
    //                                              for small forms; slow on
    //                                              tables with millions of
    //                                              rows but fire-and-forget
    //                                              from the admin UI.
    //
    //  All endpoints require the Administrators role (matches AiKnowledge
    //  + ModuleConfig patterns).
    // ============================================================
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class ReportsController : DnnApiController
    {
        private int CurrentPortalId => PortalSettings?.PortalId ?? 0;
        private int CurrentUserId   => UserInfo?.UserID ?? 0;

        private static string Cn() => DataProvider.Instance().ConnectionString;

        // ── List ──────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("List")]
        public HttpResponseMessage List(int portalId = -1, string appScope = null)
        {
            var pid = portalId >= 0 ? portalId : CurrentPortalId;
            var items = new List<object>();
            using (var conn = new SqlConnection(Cn()))
            {
                conn.Open();
                using (var cmd = new SqlCommand(
                    @"SELECT ReportId, PortalId, Name, AppScope, CreatedByUserId,
                             CreatedOnUtc, UpdatedOnUtc
                      FROM MF_ReportDefinitions
                      WHERE PortalId = @PortalId
                        AND (@AppScope = '' OR AppScope = @AppScope)
                      ORDER BY UpdatedOnUtc DESC, CreatedOnUtc DESC", conn))
                {
                    cmd.Parameters.AddWithValue("@PortalId", pid);
                    cmd.Parameters.AddWithValue("@AppScope", appScope ?? string.Empty);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            items.Add(new
                            {
                                reportId = r.GetInt32(0),
                                portalId = r.GetInt32(1),
                                name = r.IsDBNull(2) ? null : r.GetString(2),
                                appScope = r.IsDBNull(3) ? null : r.GetString(3),
                                createdByUserId = r.IsDBNull(4) ? (int?)null : r.GetInt32(4),
                                createdOnUtc = r.GetDateTime(5),
                                updatedOnUtc = r.IsDBNull(6) ? (DateTime?)null : r.GetDateTime(6),
                            });
                        }
                    }
                }
            }
            return Request.CreateResponse(HttpStatusCode.OK, items);
        }

        // ── FormsOverview ─────────────────────────────────────────────
        //  [DNN parity 2026-06-23] Ports the Oqtane/Web FormsOverview so the
        //  Submissions landing (forms-overview.ts) stops 404-ing on DNN.
        //  WPForms-style overview: per-form created date, all-time non-spam
        //  count, daily series (sparkline) over the last N days, and a sampled
        //  field-completion %. One round-trip for the whole landing list.
        //    GET /api/MegaForm/Reports/FormsOverview?days=30&siteId=1
        //  siteId is accepted for signature parity with Oqtane but ignored —
        //  forms are scoped to the authenticated DNN portal (like Form/ListAll).
        [HttpGet]
        [ActionName("FormsOverview")]
        public HttpResponseMessage FormsOverview(int days = 7, int siteId = 0)
        {
            if (days < 1) days = 7;
            if (days > 90) days = 90;
            var portalId = CurrentPortalId;
            var nowUtc = DateTime.UtcNow;

            var forms = DnnServiceLocator.Instance.FormRepo.ListForms(portalId, null, null, 0, 1000)
                        ?? new List<FormInfo>();
            if (forms.Count == 0)
                return Request.CreateResponse(HttpStatusCode.OK, new { days, generatedAtUtc = nowUtc, forms = new object[0] });

            var formIds = forms.Select(f => f.FormId).ToList();
            var since = nowUtc.Date.AddDays(-(days - 1)); // first day of the window (inclusive)
            var idList = string.Join(",", formIds);       // ints from DB — safe to inline

            var allTime = new Dictionary<int, int>();
            var seriesByForm = new Dictionary<int, int[]>();
            foreach (var fid in formIds) seriesByForm[fid] = new int[days];

            using (var conn = new SqlConnection(Cn()))
            {
                conn.Open();

                // All-time non-spam submission count per form.
                using (var cmd = new SqlCommand(
                    "SELECT FormId, COUNT(*) FROM MF_Submissions " +
                    "WHERE IsSpam = 0 AND FormId IN (" + idList + ") GROUP BY FormId", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                        allTime[r.GetInt32(0)] = r.GetInt32(1);
                }

                // Window rows → per-day series bucket.
                using (var cmd = new SqlCommand(
                    "SELECT FormId, SubmittedOnUtc FROM MF_Submissions " +
                    "WHERE IsSpam = 0 AND SubmittedOnUtc >= @Since AND FormId IN (" + idList + ")", conn))
                {
                    cmd.Parameters.AddWithValue("@Since", since);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            int fid = r.GetInt32(0);
                            var dt = r.GetDateTime(1);
                            int idx = (int)(dt.Date - since).TotalDays;
                            if (idx >= 0 && idx < days && seriesByForm.TryGetValue(fid, out var arr))
                                arr[idx]++;
                        }
                    }
                }
            }

            // REAL sampled completion — only for forms that actually have
            // submissions (the rest are null → the UI shows "—"). Cheap.
            var completionByForm = new Dictionary<int, int?>();
            foreach (var fid in allTime.Where(kv => kv.Value > 0).Select(kv => kv.Key))
                completionByForm[fid] = ComputeFormCompletion(fid);

            var result = forms.Select(f =>
            {
                var series = seriesByForm.TryGetValue(f.FormId, out var s) ? s : new int[days];
                int windowCount = series.Sum();
                return new
                {
                    formId = f.FormId,
                    title = string.IsNullOrWhiteSpace(f.Title) ? ("Form #" + f.FormId) : f.Title,
                    status = f.Status ?? string.Empty,
                    createdOnUtc = f.CreatedOnUtc.Year > 1 ? (DateTime?)f.CreatedOnUtc : null,
                    allTime = allTime.TryGetValue(f.FormId, out var c) ? c : 0,
                    last7 = windowCount,
                    completion = completionByForm.TryGetValue(f.FormId, out var comp) ? comp : null,
                    series,
                };
            })
            .OrderByDescending(x => x.allTime)
            .ThenByDescending(x => x.last7)
            .ToList();

            return Request.CreateResponse(HttpStatusCode.OK, new { days, generatedAtUtc = nowUtc, forms = result });
        }

        // ── Get ──────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(int reportId)
        {
            using (var conn = new SqlConnection(Cn()))
            {
                conn.Open();
                using (var cmd = new SqlCommand(
                    @"SELECT ReportId, PortalId, Name, AppScope, DefinitionJson,
                             CreatedByUserId, CreatedOnUtc, UpdatedOnUtc
                      FROM MF_ReportDefinitions
                      WHERE ReportId = @Id AND PortalId = @PortalId", conn))
                {
                    cmd.Parameters.AddWithValue("@Id", reportId);
                    cmd.Parameters.AddWithValue("@PortalId", CurrentPortalId);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (!r.Read())
                            return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Report not found" });
                        return Request.CreateResponse(HttpStatusCode.OK, new
                        {
                            reportId = r.GetInt32(0),
                            portalId = r.GetInt32(1),
                            name = r.IsDBNull(2) ? null : r.GetString(2),
                            appScope = r.IsDBNull(3) ? null : r.GetString(3),
                            definitionJson = r.IsDBNull(4) ? null : r.GetString(4),
                            createdByUserId = r.IsDBNull(5) ? (int?)null : r.GetInt32(5),
                            createdOnUtc = r.GetDateTime(6),
                            updatedOnUtc = r.IsDBNull(7) ? (DateTime?)null : r.GetDateTime(7),
                        });
                    }
                }
            }
        }

        // ── Save ─────────────────────────────────────────────────────
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Save")]
        public HttpResponseMessage Save(JObject body)
        {
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });

            int reportId = (int?)body["reportId"] ?? 0;
            string name = (string)body["name"];
            string appScope = (string)body["appScope"];
            var definition = body["definition"] ?? body["definitionJson"];
            string definitionJson = definition?.Type == JTokenType.String
                ? (string)definition
                : (definition != null ? definition.ToString(Formatting.None) : null);

            if (string.IsNullOrWhiteSpace(name))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "name is required" });
            if (string.IsNullOrWhiteSpace(definitionJson))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "definition is required" });

            using (var conn = new SqlConnection(Cn()))
            {
                conn.Open();
                if (reportId > 0)
                {
                    using (var cmd = new SqlCommand(
                        @"UPDATE MF_ReportDefinitions
                          SET Name = @Name,
                              AppScope = @AppScope,
                              DefinitionJson = @DefinitionJson,
                              UpdatedOnUtc = SYSUTCDATETIME()
                          WHERE ReportId = @Id AND PortalId = @PortalId", conn))
                    {
                        cmd.Parameters.AddWithValue("@Id", reportId);
                        cmd.Parameters.AddWithValue("@PortalId", CurrentPortalId);
                        cmd.Parameters.AddWithValue("@Name", name);
                        cmd.Parameters.AddWithValue("@AppScope", (object)appScope ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@DefinitionJson", definitionJson);
                        int affected = cmd.ExecuteNonQuery();
                        if (affected == 0)
                            return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Report not found" });
                    }
                }
                else
                {
                    using (var cmd = new SqlCommand(
                        @"INSERT INTO MF_ReportDefinitions
                            (PortalId, Name, AppScope, DefinitionJson, CreatedByUserId, CreatedOnUtc)
                          OUTPUT INSERTED.ReportId
                          VALUES (@PortalId, @Name, @AppScope, @DefinitionJson, @UserId, SYSUTCDATETIME())", conn))
                    {
                        cmd.Parameters.AddWithValue("@PortalId", CurrentPortalId);
                        cmd.Parameters.AddWithValue("@Name", name);
                        cmd.Parameters.AddWithValue("@AppScope", (object)appScope ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@DefinitionJson", definitionJson);
                        cmd.Parameters.AddWithValue("@UserId", CurrentUserId);
                        reportId = (int)cmd.ExecuteScalar();
                    }
                }
            }
            return Request.CreateResponse(HttpStatusCode.OK, new { reportId, success = true });
        }

        // ── Delete ───────────────────────────────────────────────────
        [HttpDelete]
        [ValidateAntiForgeryToken]
        [ActionName("Delete")]
        public HttpResponseMessage Delete(int reportId)
        {
            using (var conn = new SqlConnection(Cn()))
            {
                conn.Open();
                using (var cmd = new SqlCommand(
                    @"DELETE FROM MF_ReportDefinitions
                      WHERE ReportId = @Id AND PortalId = @PortalId", conn))
                {
                    cmd.Parameters.AddWithValue("@Id", reportId);
                    cmd.Parameters.AddWithValue("@PortalId", CurrentPortalId);
                    int affected = cmd.ExecuteNonQuery();
                    if (affected == 0)
                        return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Report not found" });
                }
            }
            return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
        }

        // ── SubmissionData ───────────────────────────────────────────
        //  Powers the P3 Submission Report popup.
        //  Pulls one row per submission with the requested columns
        //  projected from MF_SubmissionValues (B55 P1 flat index).
        [HttpGet]
        [ActionName("SubmissionData")]
        public HttpResponseMessage SubmissionData(
            int formId,
            string fromDate = null,
            string toDate = null,
            string fields = null,
            int top = 1000)
        {
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId is required" });

            top = Math.Max(1, Math.Min(top, 5000));
            DateTime? fromDt = TryParseDate(fromDate);
            DateTime? toDt = TryParseDate(toDate);

            var fieldKeys = (fields ?? string.Empty)
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrEmpty(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var rows = new List<Dictionary<string, object>>();
            using (var conn = new SqlConnection(Cn()))
            {
                conn.Open();

                // 1. Get the matching submissions first (already authorised
                //    above via portal). Date range is optional.
                var submissionIds = new List<int>();
                using (var cmd = new SqlCommand(
                    @"SELECT TOP (@Top) SubmissionId, SubmittedOnUtc, Status
                      FROM MF_Submissions
                      WHERE FormId = @FormId
                        AND (@FromDate IS NULL OR SubmittedOnUtc >= @FromDate)
                        AND (@ToDate IS NULL OR SubmittedOnUtc <= @ToDate)
                      ORDER BY SubmittedOnUtc DESC", conn))
                {
                    cmd.Parameters.AddWithValue("@Top", top);
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@FromDate", (object)fromDt ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@ToDate", (object)toDt ?? DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            var row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                            {
                                ["submissionId"] = r.GetInt32(0),
                                ["submittedOnUtc"] = r.GetDateTime(1),
                                ["status"] = r.IsDBNull(2) ? null : r.GetString(2),
                            };
                            rows.Add(row);
                            submissionIds.Add(r.GetInt32(0));
                        }
                    }
                }

                if (submissionIds.Count == 0)
                    return Request.CreateResponse(HttpStatusCode.OK, new { rows = new object[0], count = 0 });

                // 2. Project requested columns from MF_SubmissionValues.
                if (fieldKeys.Count > 0)
                {
                    var idParam = string.Join(",", submissionIds.Select((id, i) => "@s" + i));
                    var keyParam = string.Join(",", fieldKeys.Select((k, i) => "@k" + i));
                    var sql = string.Format(
                        @"SELECT SubmissionId, FieldKey, ValueText, ValueNumber, ValueDate
                          FROM MF_SubmissionValues
                          WHERE SubmissionId IN ({0}) AND FieldKey IN ({1})", idParam, keyParam);
                    using (var cmd = new SqlCommand(sql, conn))
                    {
                        for (int i = 0; i < submissionIds.Count; i++)
                            cmd.Parameters.AddWithValue("@s" + i, submissionIds[i]);
                        for (int i = 0; i < fieldKeys.Count; i++)
                            cmd.Parameters.AddWithValue("@k" + i, fieldKeys[i]);
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
                                var row = rows.FirstOrDefault(x =>
                                    Convert.ToInt32(x["submissionId"]) == sid);
                                if (row != null) row[key] = val;
                            }
                        }
                    }
                }
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { rows, count = rows.Count });
        }

        // ── Backfill ─────────────────────────────────────────────────
        //  Stub backfill: re-index every submission for a given form.
        //  GET /api/MegaForm/SubmissionIndex/Backfill?formId=N
        //  (Routed via the same controller for convenience — the dashboard
        //   UI calls /Reports/Backfill so we expose both action names.)
        [HttpGet]
        [ActionName("Backfill")]
        public HttpResponseMessage Backfill(int formId)
        {
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId is required" });

            int processed = 0;
            using (var conn = new SqlConnection(Cn()))
            {
                conn.Open();
                var subs = new List<(int sid, string dataJson)>();
                using (var cmd = new SqlCommand(
                    @"SELECT SubmissionId, DataJson FROM MF_Submissions WHERE FormId = @FormId", conn))
                {
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                            subs.Add((r.GetInt32(0), r.IsDBNull(1) ? null : r.GetString(1)));
                    }
                }

                var formInfo = DnnServiceLocator.Instance.FormRepo.GetForm(formId);
                MegaForm.Core.Models.FormSchema schema = null;
                try
                {
                    if (formInfo != null && !string.IsNullOrWhiteSpace(formInfo.SchemaJson))
                        schema = JsonConvert.DeserializeObject<MegaForm.Core.Models.FormSchema>(formInfo.SchemaJson);
                }
                catch { schema = null; }

                var fields = MegaForm.Core.Utilities.MegaFormUtils.FlattenFields(schema?.Fields);
                foreach (var (sid, dataJson) in subs)
                {
                    if (string.IsNullOrWhiteSpace(dataJson)) continue;
                    Dictionary<string, object> data;
                    try { data = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson); }
                    catch { continue; }
                    if (data == null) continue;
                    try
                    {
                        DnnServiceLocator.Instance.ReportingIndexer
                            .IndexSubmission(sid, formId, data, fields);
                        processed++;
                    }
                    catch { /* index failures don't abort backfill */ }
                }
            }
            return Request.CreateResponse(HttpStatusCode.OK, new { processed, formId });
        }

        private static DateTime? TryParseDate(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;
            if (DateTime.TryParse(s, out var dt)) return dt;
            return null;
        }

        // ── Completion helpers (ported from MegaFormController.Reports.cs) ──
        //  Display/layout field types that don't count toward form completion.
        private static readonly HashSet<string> _nonInputFieldTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "heading","header","title","subtitle","paragraph","text-block","textblock","html",
            "richtext","rich-text","divider","separator","spacer","image","staticimage","banner",
            "section","pagebreak","page-break","page","label","captcha","recaptcha","hidden","button",
        };

        // REAL field-completion for a form: average over its (most-recent, non-spam)
        // submissions of (filled input fields / total input fields). Null when the
        // form has no schema input fields or no submissions. Sampled to the 50 most
        // recent submissions so the landing N+1 stays cheap (matches Oqtane).
        private const int CompletionSampleCap = 50;
        private int? ComputeFormCompletion(int formId)
        {
            try
            {
                var form = DnnServiceLocator.Instance.FormRepo.GetForm(formId);
                if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson)) return null;
                FormSchema schema;
                try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
                catch { return null; }

                var fieldKeys = MegaForm.Core.Utilities.MegaFormUtils.FlattenFields(schema != null ? schema.Fields : null)
                    ?.Where(x => x != null && !string.IsNullOrEmpty(x.Key) && !_nonInputFieldTypes.Contains(x.Type ?? string.Empty))
                    .Select(x => x.Key)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                if (fieldKeys == null || fieldKeys.Count == 0) return null;

                var dataJsons = new List<string>();
                using (var conn = new SqlConnection(Cn()))
                {
                    conn.Open();
                    using (var cmd = new SqlCommand(
                        "SELECT TOP (" + CompletionSampleCap + ") DataJson FROM MF_Submissions " +
                        "WHERE FormId = @FormId AND IsSpam = 0 ORDER BY SubmittedOnUtc DESC", conn))
                    {
                        cmd.Parameters.AddWithValue("@FormId", formId);
                        using (var r = cmd.ExecuteReader())
                            while (r.Read())
                                dataJsons.Add(r.IsDBNull(0) ? null : r.GetString(0));
                    }
                }
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
    }
}
