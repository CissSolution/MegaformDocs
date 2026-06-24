using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// BUG FIX v20260405-16: Workflow Database sub-endpoints for DNN.
    ///
    /// The workflow canvas calls URLs like:
    ///   GET /DesktopModules/MegaForm/API/Workflow/Database/Connections
    ///   GET /DesktopModules/MegaForm/API/Workflow/Database/ConnectionStringSample?databaseType=X
    ///   POST /DesktopModules/MegaForm/API/Workflow/Database/TestConnection
    ///   GET /DesktopModules/MegaForm/API/Workflow/Database/Tables?connectionName=X
    ///   GET /DesktopModules/MegaForm/API/Workflow/Database/Columns?connectionName=X&tableName=Y
    ///   GET /DesktopModules/MegaForm/API/Workflow/Database/Procedures?connectionName=X
    ///   GET /DesktopModules/MegaForm/API/Workflow/Database/ProcedureParameters?connectionName=X&procedureName=Y
    ///
    /// DNN's default route {controller}/{action}/{id} resolves "Workflow/Database/Connections" as
    ///   controller=Workflow, action=Database, id=Connections — no such action → 404.
    ///
    /// Fix: explicit routes in MegaFormRouteMapper map "Workflow/Database/{action}" to this
    /// WorkflowDatabaseController. All routes are registered before the generic catch-all.
    ///
    /// DNN SQL Server context: "DefaultConnection" maps to the DNN portal database via
    /// DotNetNuke.Common.Utilities.Config.GetConnectionString(). Users can also supply
    /// an explicit connectionString + databaseType for external databases.
    /// </summary>
    [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
    public class WorkflowDatabaseController : DnnApiController
    {
        // DNN portal SQL Server connection string (always available in DNN)
        private static string DnnConnStr =>
            DotNetNuke.Common.Utilities.Config.GetConnectionString();

        // Reads the MegaForm portal setting (same store as ModuleConfig/DatabaseSettings)
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

        private DatabaseWorkflowMetadataService BuildService()
        {
            return new DatabaseWorkflowMetadataService(new DnnConnectionRegistry(GetPortalSetting));
        }

        // ── GET Workflow/Database/Connections ────────────────────────────
        /// <summary>
        /// Returns available named database connections for the workflow Database node.
        /// In DNN SQL Server installs, "DefaultConnection" always maps to the portal DB.
        /// Additional connections configured via Dashboard → Database Settings are also listed.
        /// </summary>
        [HttpGet]
        [ActionName("Connections")]
        public HttpResponseMessage Connections()
        {
            try
            {
                var options = new List<object>();

                // Always offer DefaultConnection → DNN portal SQL Server database
                options.Add(new
                {
                    value = "DefaultConnection",
                    label = "DefaultConnection (DNN Portal SQL Server)"
                });

                // Also offer the MegaForm-configured external connection if set
                var alias = GetPortalSetting("Database_ConnectionAlias", "");
                var connStr = GetPortalSetting("Database_ConnectionString", "");
                if (!string.IsNullOrWhiteSpace(alias) && !string.IsNullOrWhiteSpace(connStr)
                    && !string.Equals(alias, "DefaultConnection", StringComparison.OrdinalIgnoreCase))
                {
                    options.Add(new
                    {
                        value = alias,
                        label = alias + " (MegaForm Dashboard DB)"
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, options);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message });
            }
        }

        // ── GET Workflow/Database/ConnectionStringSample ─────────────────
        /// <summary>
        /// Returns a sample connection string for the requested database type.
        /// DNN uses SQL Server, so sqlserver is the default.
        /// </summary>
        [HttpGet]
        [ActionName("ConnectionStringSample")]
        public HttpResponseMessage ConnectionStringSample(string databaseType = "sqlserver")
        {
            var type = (databaseType ?? "sqlserver").Trim().ToLowerInvariant();
            string sample;
            switch (type)
            {
                case "sqlite":
                    sample = "Data Source=./App_Data/megaform.db;Cache=Shared";
                    break;
                case "postgres":
                case "postgresql":
                    sample = "Host=localhost;Port=5432;Database=megaform;Username=postgres;Password=yourpassword";
                    break;
                case "mysql":
                    sample = "Server=localhost;Port=3306;Database=megaform;Uid=root;Pwd=yourpassword;";
                    break;
                default: // sqlserver / mssql
                    sample = "Server=localhost;Database=MegaForm;Trusted_Connection=True;TrustServerCertificate=True;";
                    break;
            }
            return Request.CreateResponse(HttpStatusCode.OK, new { sample, databaseType = type });
        }

        // ── POST Workflow/Database/TestConnection ────────────────────────
        [HttpPost]
        [ActionName("TestConnection")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage TestConnection([FromBody] JObject body)
        {
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });

            var connectionName   = body.Value<string>("connectionName");
            var databaseType     = body.Value<string>("databaseType");
            var connectionString = body.Value<string>("connectionString");

            // Special case: "DefaultConnection" → use DNN portal SQL Server
            if (string.Equals(connectionName, "DefaultConnection", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(connectionString))
            {
                connectionString = DnnConnStr;
                databaseType = "sqlserver";
                connectionName = null; // force direct test
            }

            try
            {
                var svc = BuildService();
                var result = svc.TestConnection(connectionName, databaseType, connectionString);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success                  = result.Success,
                    provider                 = result.Provider,
                    databaseName             = result.DatabaseName,
                    serverVersion            = result.ServerVersion,
                    supportsStoredProcedures = result.SupportsStoredProcedures,
                    message                  = result.Message
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message, success = false });
            }
        }

        // ── GET Workflow/Database/Tables ─────────────────────────────────
        [HttpGet]
        [ActionName("Tables")]
        public HttpResponseMessage Tables(
            string connectionName   = null,
            string databaseType     = null,
            string connectionString = null)
        {
            ResolveDefaultConnection(ref connectionName, ref databaseType, ref connectionString);
            try
            {
                var svc = BuildService();
                var tables = svc.GetTables(connectionName, databaseType, connectionString);
                return Request.CreateResponse(HttpStatusCode.OK, tables);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message, tables = new object[0] });
            }
        }

        // ── GET Workflow/Database/Columns ────────────────────────────────
        [HttpGet]
        [ActionName("Columns")]
        public HttpResponseMessage Columns(
            string connectionName   = null,
            string tableName        = null,
            string databaseType     = null,
            string connectionString = null)
        {
            if (string.IsNullOrWhiteSpace(tableName))
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "tableName is required" });

            ResolveDefaultConnection(ref connectionName, ref databaseType, ref connectionString);
            try
            {
                var svc = BuildService();
                var columns = svc.GetColumns(connectionName, tableName, databaseType, connectionString);
                return Request.CreateResponse(HttpStatusCode.OK, columns);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message, columns = new object[0] });
            }
        }

        // ── GET Workflow/Database/Procedures ─────────────────────────────
        [HttpGet]
        [ActionName("Procedures")]
        public HttpResponseMessage Procedures(
            string connectionName   = null,
            string databaseType     = null,
            string connectionString = null)
        {
            ResolveDefaultConnection(ref connectionName, ref databaseType, ref connectionString);
            try
            {
                var svc = BuildService();
                var procedures = svc.GetProcedures(connectionName, databaseType, connectionString);
                return Request.CreateResponse(HttpStatusCode.OK, procedures);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message, procedures = new object[0] });
            }
        }

        // ── GET Workflow/Database/ProcedureParameters ─────────────────────
        [HttpGet]
        [ActionName("ProcedureParameters")]
        public HttpResponseMessage ProcedureParameters(
            string connectionName   = null,
            string procedureName    = null,
            string databaseType     = null,
            string connectionString = null)
        {
            if (string.IsNullOrWhiteSpace(procedureName))
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "procedureName is required" });

            ResolveDefaultConnection(ref connectionName, ref databaseType, ref connectionString);
            try
            {
                var svc = BuildService();
                var parameters = svc.GetProcedureParameters(connectionName, procedureName,
                    databaseType, connectionString);
                return Request.CreateResponse(HttpStatusCode.OK, parameters);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message, parameters = new object[0] });
            }
        }

        /// <summary>
        /// When connectionName is "DefaultConnection" and no explicit connectionString is given,
        /// substitute the DNN portal SQL Server connection string directly so
        /// DatabaseWorkflowMetadataService can open it without a registry lookup.
        /// </summary>
        private void ResolveDefaultConnection(
            ref string connectionName,
            ref string databaseType,
            ref string connectionString)
        {
            if (string.Equals(connectionName, "DefaultConnection",
                    StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(connectionString))
            {
                connectionString = DnnConnStr;
                databaseType     = "sqlserver";
                connectionName   = null; // direct connection, not named lookup
            }
        }
    }
}
