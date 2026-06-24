using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.DNN.Data;
using MegaForm.DNN.Services;

namespace MegaForm.WebApi
{
    /// <summary>
    /// Back-compat DNN route for field option lookups used by builder/admin UIs.
    /// Route: /DesktopModules/MegaForm/API/Field/Options?formId=...&fieldKey=...
    /// Reuses the canonical FieldOptionsService and "__p__*" cascading parameter pattern.
    /// </summary>
    [AllowAnonymous]
    public class FieldController : DnnApiController
    {
        private HttpResponseMessage WithCors(HttpResponseMessage response)
        {
            try
            {
                response.Headers.Remove("Access-Control-Allow-Origin");
                response.Headers.Remove("Access-Control-Allow-Methods");
                response.Headers.Remove("Access-Control-Allow-Headers");
                response.Headers.Add("Access-Control-Allow-Origin", "*");
                response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS");
                response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
            }
            catch { }
            return response;
        }

        [HttpGet]
        [ActionName("Options")]
        public HttpResponseMessage Options(int formId, string fieldKey)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return WithCors(Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId and fieldKey required" }));

            try
            {
                var parameters = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                foreach (var kv in Request.GetQueryNameValuePairs())
                {
                    if (string.IsNullOrWhiteSpace(kv.Key) || !kv.Key.StartsWith("__p__", StringComparison.OrdinalIgnoreCase))
                        continue;
                    var name = kv.Key.Substring(5);
                    if (string.IsNullOrWhiteSpace(name))
                        continue;
                    parameters[name] = kv.Value;
                }

                Func<string, string, string> hostLookup = (key, def) =>
                {
                    try
                    {
                        var val = DotNetNuke.Entities.Controllers.HostController.Instance.GetString("MegaForm_" + key, null);
                        return string.IsNullOrWhiteSpace(val) ? def : val;
                    }
                    catch { return def; }
                };

                var registry = new DnnConnectionRegistry(hostLookup);
                var formRepo = DnnServiceLocator.Instance.FormRepo;
                var submissionRepo = DnnServiceLocator.Instance.SubmissionRepo;
                var defaultConn = hostLookup("Database_ConnectionAlias", "DashboardDatabase");
                var svc = new MegaForm.Core.Services.FieldOptionsService(registry, formRepo, submissionRepo, defaultConn);

                // [v20260531-DataGridSqlCols] Optional ?columnKey=X — when set,
                // routes to GetColumnOptions which reads widgetProps.columns[X]
                // .optionsSql instead of the field's own properties.optionsSql.
                // Lets DataGrid SELECT cells fetch from a parent table.
                string columnKey = null;
                foreach (var kv in Request.GetQueryNameValuePairs())
                {
                    if (string.Equals(kv.Key, "columnKey", StringComparison.OrdinalIgnoreCase))
                    { columnKey = kv.Value; break; }
                }
                var options = !string.IsNullOrWhiteSpace(columnKey)
                    ? svc.GetColumnOptions(formId, fieldKey, columnKey, parameters)
                    : svc.GetOptions(formId, fieldKey, parameters);
                return WithCors(Request.CreateResponse(HttpStatusCode.OK, options));
            }
            catch
            {
                return WithCors(Request.CreateResponse(HttpStatusCode.OK, new List<MegaForm.Core.Services.FieldOption>()));
            }
        }

        [HttpOptions]
        [ActionName("Options")]
        public HttpResponseMessage OptionsOptions()
        {
            return WithCors(Request.CreateResponse(HttpStatusCode.OK));
        }
    }
}
