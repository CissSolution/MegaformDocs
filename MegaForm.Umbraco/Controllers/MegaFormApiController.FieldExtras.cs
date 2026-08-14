using System;
using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Extra field endpoints for Umbraco parity: runtime SQL options and database insert test.
    /// </summary>
    public partial class MegaFormApiController
    {
        [HttpGet]
        [AllowAnonymous]
        [Route("/umbraco/MegaForm/MegaFormApi/Field/Options")]
        public IActionResult GetFieldOptions(
            int formId,
            string fieldKey,
            [FromServices] IConnectionRegistry connectionRegistry,
            [FromServices] MegaForm.Core.Services.TypedSubmission.SubmissionDataResolver dataResolver = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return BadRequest(new { error = "formId and fieldKey required" });

            var parameters = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in Request.Query)
            {
                if (string.IsNullOrEmpty(kv.Key)) continue;
                if (!kv.Key.StartsWith("__p__", StringComparison.OrdinalIgnoreCase)) continue;
                var name = kv.Key.Substring(5);
                if (string.IsNullOrWhiteSpace(name)) continue;
                parameters[name] = kv.Value.ToString();
            }

            var svc = new FieldOptionsService(connectionRegistry, _formRepo, _subRepo, "DashboardDatabase", dataResolver);
            var options = svc.GetOptions(formId, fieldKey, parameters);
            return Ok(options);
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Field/TestInsert")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult TestFieldInsert(
            [FromBody] JObject body,
            [FromServices] IConnectionRegistry connectionRegistry)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            try
            {
                var settings = new FormSettings
                {
                    DatabaseInsert = new FormDatabaseInsertSettings
                    {
                        Enabled = true,
                        ConnectionKey = (string)body["connectionKey"] ?? string.Empty,
                        DatabaseType = (string)body["databaseType"] ?? string.Empty,
                        InsertSql = (string)body["insertSql"] ?? string.Empty,
                        ParameterMapping = body["parameterMapping"] is JObject pm
                            ? pm.ToObject<Dictionary<string, string>>() ?? new Dictionary<string, string>()
                            : new Dictionary<string, string>()
                    }
                };
                var sample = body["sampleData"] is JObject sd
                    ? sd.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>()
                    : new Dictionary<string, object>();
                var svc = new FormDatabaseInsertService(connectionRegistry);
                var result = svc.TestExecute(settings, sample);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return Ok(new FormDatabaseInsertTestResult { Success = false, Error = ex.Message });
            }
        }
    }
}
