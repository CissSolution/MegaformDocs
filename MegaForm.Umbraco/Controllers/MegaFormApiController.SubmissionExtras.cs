using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Extra submission endpoints for Umbraco parity: bulk delete, export, data update.
    /// </summary>
    public partial class MegaFormApiController
    {
        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Submissions/BulkDelete")]
        [Authorize(Policy = "MegaFormApi")]
        public IActionResult BulkDeleteSubmissions([FromBody] JObject body)
        {
            int formId = body?.Value<int>("formId") ?? 0;
            var ids = (body?["ids"]?.ToObject<int[]>() ?? Array.Empty<int>()).Distinct().ToArray();
            if (formId <= 0) return BadRequest(new { error = "formId required" });
            if (ids.Length == 0) return BadRequest(new { error = "ids required" });

            var actor = BuildUserContext();
            var permissions = MatrixPermissions;
            var rows = ids.Select(_subRepo.Get).ToList();
            if (rows.Any(row => row == null || row.FormId != formId)) return NotFound();
            if (rows.Any(row => !CanMutateSubmission(row, actor, permissions, delete: true)))
                return Forbid();

            _subRepo.BulkDelete(formId, ids);
            return Ok(new { success = true, deleted = ids.Length });
        }

        [HttpDelete]
        [Authorize(Policy = "MegaFormApi")]
        [Route("/umbraco/MegaForm/MegaFormApi/Submissions/{submissionId:int}")]
        public IActionResult DeleteSubmission(int submissionId)
        {
            if (submissionId <= 0) return BadRequest(new { error = "submissionId required" });
            var row = _subRepo.Get(submissionId);
            if (row == null) return NotFound();
            if (!CanMutateSubmission(row, BuildUserContext(), MatrixPermissions, delete: true))
                return Forbid();
            _subRepo.Delete(submissionId);
            return Ok(new { success = true });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Submissions/UpdateData")]
        [Authorize(Policy = "MegaFormApi")]
        public IActionResult UpdateSubmissionData(int submissionId, [FromBody] JObject body)
        {
            if (submissionId <= 0) return BadRequest(new { error = "submissionId required" });
            var row = _subRepo.Get(submissionId);
            if (row == null) return NotFound();
            if (!CanMutateSubmission(row, BuildUserContext(), MatrixPermissions, delete: false))
                return Forbid();
            _subRepo.UpdateData(submissionId, body != null ? body.ToString() : "{}");
            return Ok(new { success = true });
        }

        // [MySubmissions] Portal endpoint ("My Tickets"), mirrors Oqtane
        // MegaFormController.ListMySubmissions: an authenticated user lists ONLY their own
        // submissions. The owner predicate is forced server-side (the client cannot override
        // it) and runs in SQL via SubmissionQueryService + ISubmissionOwnerFilterableRepository,
        // so TotalCount and paging are exact. No admin gate and no explicit-view-rule
        // requirement: ownership alone grants read, mirroring the OwnerGrant in
        // CanViewSubmissionRow — a submitter must be able to follow their own ticket even on
        // forms with no permission rules.
        [HttpGet]
        [Authorize(Policy = "MegaFormApi")]
        [Route("/umbraco/MegaForm/MegaFormApi/Submissions/Mine")]
        public async Task<IActionResult> ListMySubmissions(
            [FromServices] SubmissionQueryService submissionQueries,
            int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 25)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required" });
            var actor = await BuildUserContextAsync();
            if (actor == null || !actor.IsAuthenticated || actor.UserId <= 0)
                return StatusCode(403, new { error = "You must be signed in to view your submissions." });
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound();
            if (pageSize <= 0 || pageSize > 100) pageSize = 100;

            var query = new SubmissionListQuery
            {
                FormId = formId,
                Status = status,
                Search = search,
                DateFrom = dateFrom,
                DateTo = dateTo,
                PageIndex = pageIndex,
                PageSize = pageSize,
                // Server-forced owner filter — the whole point of this endpoint.
                UserId = actor.UserId
            };
            var result = submissionQueries.List(query);
            return Ok(new
            {
                items = (result.Items ?? new List<SubmissionListItem>())
                    .Select(x => new
                    {
                        x.SubmissionId,
                        x.FormId,
                        data = x.Data ?? new Dictionary<string, object>(),
                        x.Status,
                        x.IsSpam,
                        x.SubmittedOnUtc,
                        x.IpAddress
                    })
                    .ToList(),
                result.TotalCount,
                result.PageIndex,
                result.PageSize
            });
        }

        // [ExportFailClosed v20260728-01] This action dumps every row of a form, so it is NOT
        // anonymous-reachable: it carries the submission-read permission letter like the rest
        // of the submission surface, and CanBulkExport refuses the "no rules configured = open"
        // fallback that CanExport applies. Both are needed — the letter alone still let any
        // backoffice user with that letter dump a rule-less form's whole table.
        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Submissions/Export")]
        [MegaFormAuthorize(MegaFormPermissionConstants.ViewSubmissionsLetter, FormIdParameter = "formId")]
        public IActionResult ExportSubmissions(int formId, string format = "csv")
        {
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "form not found" });

            var actor = BuildUserContext();
            var permissions = MatrixPermissions;
            if (!permissions.CanBulkExport(formId, actor)) return Forbid();

            // [ExportFailClosed v20260728-01] Bounded read (rule 11): the same ceiling the
            // other hosts' export path clamps to, instead of an ad-hoc 10000 that this host
            // passes straight to the repository with no facade clamp behind it.
            var ownOnly = permissions.IsOwnOnlyScope(formId, actor, "export");
            var result = ownOnly && _subRepo is ISubmissionOwnerFilterableRepository ownerRepo
                ? ownerRepo.ListOwnedBy(formId, actor.UserId, pageSize: SubmissionQueryService.TrustedMaxPageSize)
                : _subRepo.List(formId, pageSize: SubmissionQueryService.TrustedMaxPageSize);
            var items = result.Items ?? new List<SubmissionInfo>();
            if (permissions.RequiresSubmissionScopeEvaluation(formId, actor, "export"))
            {
                items = items
                    .Where(row => permissions.CanExportSubmission(formId, row, actor))
                    .ToList();
            }

            if (string.Equals(format, "json", StringComparison.OrdinalIgnoreCase))
            {
                var jsonData = items.Select(s => new
                {
                    s.SubmissionId,
                    s.SubmittedOnUtc,
                    s.Status,
                    s.IpAddress,
                    data = TryParseJson(s.DataJson),
                }).ToList();
                var json = JsonConvert.SerializeObject(jsonData, Formatting.Indented);
                return File(Encoding.UTF8.GetBytes(json), "application/json", $"submissions-form{formId}-{DateTime.UtcNow:yyyyMMdd}.json");
            }

            var sb = new StringBuilder();
            var headers = new List<string> { "SubmissionId", "SubmittedOn", "Status", "IpAddress" };
            var fieldKeys = new List<string>();
            FormSchema schema = null;
            if (!string.IsNullOrWhiteSpace(form.SchemaJson))
            {
                try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); } catch { }
            }

            if (schema?.Fields != null)
            {
                foreach (var field in MegaFormUtils.FlattenFields(schema.Fields))
                {
                    if (field.Type == "Html" || field.Type == "Section" || field.Type == "Row") continue;
                    headers.Add(field.Label ?? field.Key);
                    fieldKeys.Add(field.Key);
                }
            }

            sb.AppendLine(string.Join(",", headers.Select(EscapeCsv)));

            foreach (var s in items)
            {
                var data = TryParseJson(s.DataJson);
                var row = new List<string>
                {
                    s.SubmissionId.ToString(),
                    s.SubmittedOnUtc.ToString("yyyy-MM-dd HH:mm:ss"),
                    EscapeCsv(s.Status ?? ""),
                    EscapeCsv(s.IpAddress ?? "")
                };
                foreach (var key in fieldKeys)
                {
                    data.TryGetValue(key, out var val);
                    row.Add(EscapeCsv(val?.ToString() ?? ""));
                }
                sb.AppendLine(string.Join(",", row));
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            return File(bytes, "text/csv", $"submissions-form{formId}-{DateTime.UtcNow:yyyyMMdd}.csv");
        }

        private static Dictionary<string, object> TryParseJson(string json)
        {
            try
            {
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
            }
            catch
            {
                return new Dictionary<string, object>();
            }
        }

        private static string EscapeCsv(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            if (value.Contains(",") || value.Contains("\"") || value.Contains("\n") || value.Contains("\r"))
            {
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            }
            return value;
        }
    }
}
