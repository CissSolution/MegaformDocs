using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.DNN.Services;
using Newtonsoft.Json;

namespace MegaForm.WebApi
{
    // ══════════════════════════════════════════════════════════════════════════
    //  DataRepeaterApiController — DNN mirror of Web DataRepeaterController
    //  Route: /DesktopModules/MegaForm/API/DataRepeater/{action}
    //
    //  All queries come from server-side form schema. Client sends only
    //  formId + widgetKey — NEVER raw SQL.
    //
    //  v20260428-01
    // ══════════════════════════════════════════════════════════════════════════

    [AllowAnonymous]  // Public forms need anonymous access
    public class DataRepeaterApiController : DnnApiController
    {
        // DNN portal SQL Server connection string (always available)
        private static string DnnConnStr =>
            DotNetNuke.Common.Utilities.Config.GetConnectionString();

        private string GetPortalSetting(string key, string defaultValue = "")
        {
            try
            {
                var fullKey = "MegaForm_" + key;
                var val = DotNetNuke.Entities.Controllers.HostController.Instance
                              .GetString(fullKey, null);
                return val ?? defaultValue;
            }
            catch { return defaultValue; }
        }

        private DataRepeaterService BuildService()
        {
            // Same pattern as WorkflowDatabaseController + DnnServiceLocator
            var registry = new DnnConnectionRegistry(GetPortalSetting);
            var formRepo = DnnServiceLocator.Instance.FormRepo;
            var subRepo = DnnServiceLocator.Instance.SubmissionRepo;
            return new DataRepeaterService(registry, formRepo, subRepo);
        }

        private string MergeRequestParameterJson(string json)
        {
            var dict = new System.Collections.Generic.Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            foreach (var keyObj in Request.GetQueryNameValuePairs())
            {
                var key = keyObj.Key;
                if (string.IsNullOrWhiteSpace(key) || !key.StartsWith("__p__", StringComparison.OrdinalIgnoreCase))
                    continue;
                var name = key.Substring(5);
                if (string.IsNullOrWhiteSpace(name))
                    continue;
                dict[name] = keyObj.Value ?? string.Empty;
            }

            if (!string.IsNullOrWhiteSpace(json))
            {
                try
                {
                    var parsed = JsonConvert.DeserializeObject<System.Collections.Generic.Dictionary<string, object>>(json);
                    if (parsed != null)
                    {
                        foreach (var kv in parsed)
                        {
                            if (!string.IsNullOrWhiteSpace(kv.Key))
                                dict[kv.Key] = kv.Value;
                        }
                    }
                }
                catch
                {
                    if (dict.Count == 0) return json;
                }
            }

            return dict.Count == 0 ? json : JsonConvert.SerializeObject(dict);
        }

        [HttpGet]
        [ActionName("Query")]
        public HttpResponseMessage Query(
            int formId,
            string widgetKey,
            string parentId = null,
            int level = 0,
            int page = 1,
            int pageSize = 50,
            string sortCol = null,
            string sortDir = null,
            string filterJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId and widgetKey are required." });

            var request = new DataRepeaterQueryRequest
            {
                FormId     = formId,
                WidgetKey  = widgetKey,
                ParentId   = parentId,
                Level      = level,
                Page       = Math.Max(1, page),
                PageSize   = Math.Min(Math.Max(1, pageSize), 500),
                SortCol    = sortCol,
                SortDir    = sortDir,
                FilterJson = MergeRequestParameterJson(filterJson)
            };

            var result = BuildService().ExecuteQuery(request);
            return Request.CreateResponse(HttpStatusCode.OK, result);
        }

        [HttpGet]
        [ActionName("FilterOptions")]
        public HttpResponseMessage FilterOptions(int formId, string widgetKey, string filterKey, string contextJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey) || string.IsNullOrWhiteSpace(filterKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId, widgetKey, and filterKey are required." });

            var options = BuildService().ExecuteFilterQuery(formId, widgetKey, filterKey, MergeRequestParameterJson(contextJson));
            return Request.CreateResponse(HttpStatusCode.OK, new { options });
        }

        [HttpGet]
        [ActionName("ColumnOptions")]
        public HttpResponseMessage ColumnOptions(int formId, string widgetKey, string columnKey, string contextJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey) || string.IsNullOrWhiteSpace(columnKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId, widgetKey, and columnKey are required." });

            var options = BuildService().ExecuteGridColumnOptionsQuery(formId, widgetKey, columnKey, MergeRequestParameterJson(contextJson));
            return Request.CreateResponse(HttpStatusCode.OK, options);
        }

        [HttpGet]
        [ActionName("Export")]
        public HttpResponseMessage Export(
            int formId,
            string widgetKey,
            string format = "csv",
            string filterJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId and widgetKey are required." });

            if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
            {
                var request = new DataRepeaterQueryRequest
                {
                    FormId     = formId,
                    WidgetKey  = widgetKey,
                    Page       = 1,
                    PageSize   = 5000,
                    FilterJson = MergeRequestParameterJson(filterJson)
                };

                var csv = BuildService().ExportCsv(request);
                if (string.IsNullOrEmpty(csv))
                    return Request.CreateResponse(HttpStatusCode.BadRequest,
                        new { error = "Export failed." });

                var response = new HttpResponseMessage(HttpStatusCode.OK);
                response.Content = new StringContent(csv, Encoding.UTF8, "text/csv");
                response.Content.Headers.ContentDisposition =
                    new System.Net.Http.Headers.ContentDispositionHeaderValue("attachment")
                    {
                        FileName = "data-repeater-export.csv"
                    };
                return response;
            }

            return Request.CreateResponse(HttpStatusCode.BadRequest,
                new { error = "PDF export is handled client-side." });
        }
    }
}
