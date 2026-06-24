using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using DotNetNuke.Common.Utilities;
using DotNetNuke.Data;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// Phase 2 data access: Templates, Views, Permissions, Workflows.
    /// Extension of FormRepository.
    /// </summary>
    public static partial class FormRepository
    {
        // ============================================================
        // TEMPLATES
        // ============================================================

        public static int SaveTemplate(TemplateInfo tpl)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        MERGE MF_Templates AS t
                        USING (SELECT @PortalId AS PortalId, @Slug AS Slug) AS s
                        ON t.PortalId = s.PortalId AND t.Slug = s.Slug
                        WHEN MATCHED THEN UPDATE SET
                            Name=@Name, Description=@Description, Category=@Category, Icon=@Icon,
                            Version=@Version, Author=@Author, FieldCount=@FieldCount,
                            HasCustomHtml=@HasCustomHtml, HasCustomJs=@HasCustomJs,
                            ThumbnailPath=@ThumbnailPath, FolderPath=@FolderPath,
                            MetadataJson=@MetadataJson, JsScanResult=@JsScanResult, IsEnabled=@IsEnabled
                        WHEN NOT MATCHED THEN INSERT
                            (PortalId,Slug,Name,Description,Category,Icon,Version,Author,FieldCount,
                             HasCustomHtml,HasCustomJs,ThumbnailPath,FolderPath,MetadataJson,JsScanResult,IsEnabled,InstalledBy)
                        VALUES
                            (@PortalId,@Slug,@Name,@Description,@Category,@Icon,@Version,@Author,@FieldCount,
                             @HasCustomHtml,@HasCustomJs,@ThumbnailPath,@FolderPath,@MetadataJson,@JsScanResult,@IsEnabled,@InstalledBy)
                        OUTPUT INSERTED.TemplateId;";

                    cmd.Parameters.AddWithValue("@PortalId", tpl.PortalId);
                    cmd.Parameters.AddWithValue("@Slug", tpl.Slug);
                    cmd.Parameters.AddWithValue("@Name", tpl.Name);
                    cmd.Parameters.AddWithValue("@Description", (object)tpl.Description ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Category", tpl.Category ?? "general");
                    cmd.Parameters.AddWithValue("@Icon", (object)tpl.Icon ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Version", tpl.Version ?? "1.0");
                    cmd.Parameters.AddWithValue("@Author", (object)tpl.Author ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@FieldCount", tpl.FieldCount);
                    cmd.Parameters.AddWithValue("@HasCustomHtml", tpl.HasCustomHtml);
                    cmd.Parameters.AddWithValue("@HasCustomJs", tpl.HasCustomJs);
                    cmd.Parameters.AddWithValue("@ThumbnailPath", (object)tpl.ThumbnailPath ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@FolderPath", tpl.FolderPath);
                    cmd.Parameters.AddWithValue("@MetadataJson", (object)tpl.MetadataJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@JsScanResult", (object)tpl.JsScanResult ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@IsEnabled", tpl.IsEnabled);
                    cmd.Parameters.AddWithValue("@InstalledBy", tpl.InstalledBy);

                    return (int)cmd.ExecuteScalar();
                }
            }
        }

        public static List<TemplateInfo> ListTemplates(int portalId, string category = null)
        {
            var list = new List<TemplateInfo>();
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"SELECT * FROM MF_Templates 
                        WHERE PortalId=@PortalId AND IsEnabled=1
                        AND (@Category IS NULL OR Category=@Category)
                        ORDER BY Category, Name";
                    cmd.Parameters.AddWithValue("@PortalId", portalId);
                    cmd.Parameters.AddWithValue("@Category", (object)category ?? DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                        while (r.Read()) list.Add(MapTemplate(r));
                }
            }
            return list;
        }

        public static TemplateInfo GetTemplate(int portalId, string slug)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM MF_Templates WHERE PortalId=@PortalId AND Slug=@Slug";
                    cmd.Parameters.AddWithValue("@PortalId", portalId);
                    cmd.Parameters.AddWithValue("@Slug", slug);
                    using (var r = cmd.ExecuteReader())
                        return r.Read() ? MapTemplate(r) : null;
                }
            }
        }

        public static void DeleteTemplate(int portalId, string slug)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "DELETE FROM MF_Templates WHERE PortalId=@PortalId AND Slug=@Slug";
                    cmd.Parameters.AddWithValue("@PortalId", portalId);
                    cmd.Parameters.AddWithValue("@Slug", slug);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static TemplateInfo MapTemplate(IDataReader r)
        {
            return new TemplateInfo
            {
                TemplateId = (int)r["TemplateId"],
                PortalId = (int)r["PortalId"],
                Slug = r["Slug"].ToString(),
                Name = r["Name"].ToString(),
                Description = r["Description"]?.ToString(),
                Category = r["Category"]?.ToString() ?? "general",
                Icon = r["Icon"]?.ToString(),
                Version = r["Version"]?.ToString(),
                Author = r["Author"]?.ToString(),
                FieldCount = (int)r["FieldCount"],
                HasCustomHtml = (bool)r["HasCustomHtml"],
                HasCustomJs = (bool)r["HasCustomJs"],
                ThumbnailPath = r["ThumbnailPath"]?.ToString(),
                FolderPath = r["FolderPath"].ToString(),
                IsEnabled = (bool)r["IsEnabled"],
                InstallDate = (DateTime)r["InstallDate"],
                InstalledBy = (int)r["InstalledBy"]
            };
        }

        // ============================================================
        // FORM VIEWS
        // ============================================================

        public static int SaveFormView(FormViewInfo view)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                var hasQueryKeyColumn = FormViewQueryKeyColumnExists(conn);
                if (view.IsDefault)
                {
                    using (var clearCmd = conn.CreateCommand())
                    {
                        if (view.ViewId > 0)
                        {
                            clearCmd.CommandText = "UPDATE MF_FormViews SET IsDefault=0 WHERE FormId=@FormId AND ViewId<>@ViewId";
                            clearCmd.Parameters.AddWithValue("@ViewId", view.ViewId);
                        }
                        else
                        {
                            clearCmd.CommandText = "UPDATE MF_FormViews SET IsDefault=0 WHERE FormId=@FormId";
                        }
                        clearCmd.Parameters.AddWithValue("@FormId", view.FormId);
                        clearCmd.ExecuteNonQuery();
                    }
                }
                using (var cmd = conn.CreateCommand())
                {
                    if (view.ViewId > 0)
                    {
                        cmd.CommandText = hasQueryKeyColumn
                            ? @"UPDATE MF_FormViews SET 
                            ViewKey=@ViewKey, QueryKey=@QueryKey, ViewType=@ViewType, ViewName=@ViewName, IsDefault=@IsDefault,
                            SortOrder=@SortOrder, ConfigJson=@ConfigJson, CustomHtml=@CustomHtml,
                            CustomCss=@CustomCss, PermissionsJson=@PermissionsJson
                            WHERE ViewId=@ViewId"
                            : @"UPDATE MF_FormViews SET 
                            ViewKey=@ViewKey, ViewType=@ViewType, ViewName=@ViewName, IsDefault=@IsDefault,
                            SortOrder=@SortOrder, ConfigJson=@ConfigJson, CustomHtml=@CustomHtml,
                            CustomCss=@CustomCss, PermissionsJson=@PermissionsJson
                            WHERE ViewId=@ViewId";
                        cmd.Parameters.AddWithValue("@ViewId", view.ViewId);
                    }
                    else
                    {
                        cmd.CommandText = hasQueryKeyColumn
                            ? @"INSERT INTO MF_FormViews 
                            (FormId,ViewKey,QueryKey,ViewType,ViewName,IsDefault,SortOrder,ConfigJson,CustomHtml,CustomCss,PermissionsJson)
                            VALUES (@FormId,@ViewKey,@QueryKey,@ViewType,@ViewName,@IsDefault,@SortOrder,@ConfigJson,@CustomHtml,@CustomCss,@PermissionsJson);
                            SELECT SCOPE_IDENTITY();"
                            : @"INSERT INTO MF_FormViews 
                            (FormId,ViewKey,ViewType,ViewName,IsDefault,SortOrder,ConfigJson,CustomHtml,CustomCss,PermissionsJson)
                            VALUES (@FormId,@ViewKey,@ViewType,@ViewName,@IsDefault,@SortOrder,@ConfigJson,@CustomHtml,@CustomCss,@PermissionsJson);
                            SELECT SCOPE_IDENTITY();";
                        cmd.Parameters.AddWithValue("@FormId", view.FormId);
                    }
                    cmd.Parameters.AddWithValue("@ViewKey", view.ViewKey);
                    if (hasQueryKeyColumn)
                        cmd.Parameters.AddWithValue("@QueryKey", string.IsNullOrWhiteSpace(view.QueryKey) ? (object)DBNull.Value : view.QueryKey);
                    cmd.Parameters.AddWithValue("@ViewType", view.ViewType);
                    cmd.Parameters.AddWithValue("@ViewName", view.ViewName);
                    cmd.Parameters.AddWithValue("@IsDefault", view.IsDefault);
                    cmd.Parameters.AddWithValue("@SortOrder", view.SortOrder);
                    cmd.Parameters.AddWithValue("@ConfigJson", (object)view.ConfigJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@CustomHtml", (object)view.CustomHtml ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@CustomCss", (object)view.CustomCss ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@PermissionsJson", (object)view.PermissionsJson ?? DBNull.Value);

                    if (view.ViewId > 0) { cmd.ExecuteNonQuery(); return view.ViewId; }
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        public static List<FormViewInfo> GetFormViews(int formId)
        {
            var list = new List<FormViewInfo>();
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM MF_FormViews WHERE FormId=@FormId ORDER BY SortOrder, ViewId";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                        while (r.Read()) list.Add(MapFormView(r));
                }
            }
            return list;
        }

        public static FormViewInfo GetFormView(int formId, string viewKey)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM MF_FormViews WHERE FormId=@FormId AND ViewKey=@ViewKey";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@ViewKey", viewKey);
                    using (var r = cmd.ExecuteReader())
                        return r.Read() ? MapFormView(r) : null;
                }
            }
        }

        public static void DeleteFormView(int viewId)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "DELETE FROM MF_FormViews WHERE ViewId=@ViewId";
                    cmd.Parameters.AddWithValue("@ViewId", viewId);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static FormViewInfo MapFormView(IDataReader r)
        {
            return new FormViewInfo
            {
                ViewId = (int)r["ViewId"],
                FormId = (int)r["FormId"],
                ViewKey = r["ViewKey"].ToString(),
                QueryKey = HasColumn(r, "QueryKey") && r["QueryKey"] != DBNull.Value ? r["QueryKey"].ToString() : string.Empty,
                ViewType = r["ViewType"].ToString(),
                ViewName = r["ViewName"].ToString(),
                IsDefault = (bool)r["IsDefault"],
                SortOrder = (int)r["SortOrder"],
                ConfigJson = r["ConfigJson"]?.ToString(),
                CustomHtml = r["CustomHtml"]?.ToString(),
                CustomCss = r["CustomCss"]?.ToString(),
                PermissionsJson = r["PermissionsJson"]?.ToString(),
                CreatedOnUtc = (DateTime)r["CreatedOnUtc"]
            };
        }

        private static bool FormViewQueryKeyColumnExists(IDbConnection conn)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT CASE WHEN COL_LENGTH('dbo.MF_FormViews', 'QueryKey') IS NULL THEN 0 ELSE 1 END";
                var value = cmd.ExecuteScalar();
                return Convert.ToInt32(value ?? 0) == 1;
            }
        }

        // ============================================================
        // PERMISSIONS
        // ============================================================

        public static void SaveFormPermissions(int formId, List<FormPermissionInfo> permissions)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var tx = conn.BeginTransaction())
                {
                    // Delete existing
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = tx;
                        cmd.CommandText = "DELETE FROM MF_FormPermissions WHERE FormId=@FormId";
                        cmd.Parameters.AddWithValue("@FormId", formId);
                        cmd.ExecuteNonQuery();
                    }
                    // Insert new
                    foreach (var p in permissions)
                    {
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.Transaction = tx;
                            cmd.CommandText = @"INSERT INTO MF_FormPermissions 
                                (FormId,PermissionType,PrincipalType,PrincipalId,RoleName,UserId,Scope,IsGranted,FieldRestrictions)
                                VALUES (@FormId,@PermissionType,@PrincipalType,@PrincipalId,@RoleName,@UserId,@Scope,@IsGranted,@FieldRestrictions)";
                            cmd.Parameters.AddWithValue("@FormId", formId);
                            cmd.Parameters.AddWithValue("@PermissionType", (object)p.PermissionType ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@PrincipalType", (object)p.PrincipalType ?? DBNull.Value);
                            // [StarterPermissionsFix v20260518-08] MF_FormPermissions.PrincipalId
                            // is NOT NULL but Business Starter rows arrive with only RoleName set
                            // (roles are provisioned AFTER permissions in the seed sequence).
                            // Fall back to RoleName so the row inserts cleanly; the runtime
                            // permission check honors RoleName first when PrincipalId is empty.
                            var principalIdValue = !string.IsNullOrWhiteSpace(p.PrincipalId)
                                ? (object)p.PrincipalId
                                : (!string.IsNullOrWhiteSpace(p.RoleName) ? (object)p.RoleName : (object)string.Empty);
                            cmd.Parameters.AddWithValue("@PrincipalId", principalIdValue);
                            cmd.Parameters.AddWithValue("@RoleName", string.IsNullOrWhiteSpace(p.RoleName) ? (object)DBNull.Value : p.RoleName);
                            cmd.Parameters.AddWithValue("@UserId", p.UserId.HasValue ? (object)p.UserId.Value : DBNull.Value);
                            cmd.Parameters.AddWithValue("@Scope", string.IsNullOrWhiteSpace(p.Scope) ? "all" : p.Scope);
                            cmd.Parameters.AddWithValue("@IsGranted", p.IsGranted);
                            // FieldRestrictions is also NOT NULL — default to "" rather than NULL.
                            cmd.Parameters.AddWithValue("@FieldRestrictions", string.IsNullOrWhiteSpace(p.FieldRestrictions) ? (object)string.Empty : p.FieldRestrictions);
                            cmd.ExecuteNonQuery();
                        }
                    }
                    tx.Commit();
                }
            }
        }

        public static List<FormPermissionInfo> GetFormPermissions(int formId)
        {
            var list = new List<FormPermissionInfo>();
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM MF_FormPermissions WHERE FormId=@FormId";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                        while (r.Read())
                        {
                            list.Add(new FormPermissionInfo
                            {
                                PermissionId = (int)r["PermissionId"],
                                FormId = (int)r["FormId"],
                                PermissionType = r["PermissionType"].ToString(),
                                PrincipalType = r["PrincipalType"].ToString(),
                                PrincipalId = r["PrincipalId"].ToString(),
                                RoleName = HasColumn(r, "RoleName") && r["RoleName"] != DBNull.Value ? r["RoleName"].ToString() : string.Empty,
                                UserId = HasColumn(r, "UserId") && r["UserId"] != DBNull.Value ? Convert.ToInt32(r["UserId"]) : (int?)null,
                                Scope = HasColumn(r, "Scope") && r["Scope"] != DBNull.Value ? r["Scope"].ToString() : "all",
                                IsGranted = (bool)r["IsGranted"],
                                FieldRestrictions = HasColumn(r, "FieldRestrictions") && r["FieldRestrictions"] != DBNull.Value ? r["FieldRestrictions"].ToString() : string.Empty
                            });
                        }
                }
            }
            return list;
        }

        private static bool HasColumn(IDataReader reader, string columnName)
        {
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (string.Equals(reader.GetName(i), columnName, StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            return false;
        }

        // Audit Log
        public static void InsertAuditLog(AuditLogInfo log)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"INSERT INTO MF_AuditLog 
                        (UserId,UserName,IpAddress,Action,EntityType,EntityId,FormId,Details,Result)
                        VALUES (@UserId,@UserName,@IpAddress,@Action,@EntityType,@EntityId,@FormId,@Details,@Result)";
                    cmd.Parameters.AddWithValue("@UserId", log.UserId);
                    cmd.Parameters.AddWithValue("@UserName", log.UserName ?? "");
                    cmd.Parameters.AddWithValue("@IpAddress", (object)log.IpAddress ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Action", log.Action);
                    cmd.Parameters.AddWithValue("@EntityType", log.EntityType);
                    cmd.Parameters.AddWithValue("@EntityId", (object)log.EntityId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@FormId", (object)log.FormId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Details", (object)log.Details ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Result", log.Result ?? "success");
                    cmd.ExecuteNonQuery();
                }
            }
        }

        // ============================================================
        // WORKFLOWS
        // ============================================================

        public static int SaveWorkflow(WorkflowInfo wf)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    if (wf.WorkflowId > 0)
                    {
                        cmd.CommandText = @"UPDATE MF_Workflows SET 
                            WorkflowName=@Name, Description=@Desc, TriggerType=@TriggerType,
                            TriggerConfig=@TriggerConfig, StepsJson=@StepsJson, IsEnabled=@IsEnabled,
                            Version=Version+1, ModifiedOnUtc=SYSUTCDATETIME()
                            WHERE WorkflowId=@WorkflowId";
                        cmd.Parameters.AddWithValue("@WorkflowId", wf.WorkflowId);
                    }
                    else
                    {
                        cmd.CommandText = @"INSERT INTO MF_Workflows 
                            (FormId,WorkflowName,Description,TriggerType,TriggerConfig,StepsJson,IsEnabled,CreatedByUserId)
                            VALUES (@FormId,@Name,@Desc,@TriggerType,@TriggerConfig,@StepsJson,@IsEnabled,@CreatedBy);
                            SELECT SCOPE_IDENTITY();";
                        cmd.Parameters.AddWithValue("@FormId", wf.FormId);
                        cmd.Parameters.AddWithValue("@CreatedBy", wf.CreatedByUserId);
                    }
                    cmd.Parameters.AddWithValue("@Name", wf.WorkflowName);
                    cmd.Parameters.AddWithValue("@Desc", (object)wf.Description ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@TriggerType", wf.TriggerType);
                    cmd.Parameters.AddWithValue("@TriggerConfig", (object)wf.TriggerConfig ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@StepsJson", wf.StepsJson);
                    cmd.Parameters.AddWithValue("@IsEnabled", wf.IsEnabled);

                    if (wf.WorkflowId > 0) { cmd.ExecuteNonQuery(); return wf.WorkflowId; }
                    return Convert.ToInt32(cmd.ExecuteScalar());
                }
            }
        }

        public static List<WorkflowInfo> GetWorkflows(int formId)
        {
            var list = new List<WorkflowInfo>();
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM MF_Workflows WHERE FormId=@FormId ORDER BY CreatedOnUtc";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                        while (r.Read())
                        {
                            list.Add(new WorkflowInfo
                            {
                                WorkflowId = (int)r["WorkflowId"],
                                FormId = (int)r["FormId"],
                                WorkflowName = r["WorkflowName"].ToString(),
                                Description = r["Description"]?.ToString(),
                                TriggerType = r["TriggerType"].ToString(),
                                TriggerConfig = r["TriggerConfig"]?.ToString(),
                                StepsJson = r["StepsJson"].ToString(),
                                IsEnabled = (bool)r["IsEnabled"],
                                Version = (int)r["Version"],
                                CreatedByUserId = (int)r["CreatedByUserId"],
                                CreatedOnUtc = (DateTime)r["CreatedOnUtc"],
                                ModifiedOnUtc = r["ModifiedOnUtc"] == DBNull.Value ? null : (DateTime?)r["ModifiedOnUtc"]
                            });
                        }
                }
            }
            return list;
        }

        public static void DeleteWorkflow(int workflowId)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "DELETE FROM MF_Workflows WHERE WorkflowId=@Id";
                    cmd.Parameters.AddWithValue("@Id", workflowId);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public static long CreateWorkflowRun(int workflowId, int submissionId)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"INSERT INTO MF_WorkflowRuns (WorkflowId,SubmissionId,Status)
                        VALUES (@WfId,@SubId,'running'); SELECT SCOPE_IDENTITY();";
                    cmd.Parameters.AddWithValue("@WfId", workflowId);
                    cmd.Parameters.AddWithValue("@SubId", submissionId);
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        public static void CompleteWorkflowRun(long runId, string status, string error = null)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"UPDATE MF_WorkflowRuns SET 
                        Status=@Status, CompletedOnUtc=SYSUTCDATETIME(), ErrorMessage=@Error
                        WHERE RunId=@RunId";
                    cmd.Parameters.AddWithValue("@RunId", runId);
                    cmd.Parameters.AddWithValue("@Status", status);
                    cmd.Parameters.AddWithValue("@Error", (object)error ?? DBNull.Value);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public static void LogWorkflowStep(long runId, string stepId, string stepType,
            string stepName, string status, string inputJson = null, string outputJson = null, string error = null)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"INSERT INTO MF_WorkflowStepLog 
                        (RunId,StepId,StepType,StepName,Status,InputJson,OutputJson,ErrorMessage)
                        VALUES (@RunId,@StepId,@StepType,@StepName,@Status,@InputJson,@OutputJson,@Error)";
                    cmd.Parameters.AddWithValue("@RunId", runId);
                    cmd.Parameters.AddWithValue("@StepId", stepId);
                    cmd.Parameters.AddWithValue("@StepType", stepType);
                    cmd.Parameters.AddWithValue("@StepName", (object)stepName ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Status", status);
                    cmd.Parameters.AddWithValue("@InputJson", (object)inputJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@OutputJson", (object)outputJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Error", (object)error ?? DBNull.Value);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        // Helper: get connection (used by existing code)
        private static SqlConnection GetConnection()
        {
            string connStr = DotNetNuke.Common.Utilities.Config.GetConnectionString();
            return new SqlConnection(connStr);
        }

        #region AppScope — Multi-Purpose Data Isolation

        /// <summary>
        /// Get all forms with matching AppScope on a portal.
        /// Used to find related forms (articles form + comments form in same scope).
        /// </summary>
        public static List<FormInfo> GetFormsByAppScope(int portalId, string appScope)
        {
            var list = new List<FormInfo>();
            if (string.IsNullOrWhiteSpace(appScope)) return list;

            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(
                "SELECT * FROM MF_Forms WHERE PortalId=@PortalId AND AppScope=@AppScope AND [Status]='Published' ORDER BY Title", conn))
            {
                cmd.Parameters.AddWithValue("@PortalId", portalId);
                cmd.Parameters.AddWithValue("@AppScope", appScope);
                conn.Open();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) list.Add(MapForm(r));
                }
            }
            return list;
        }

        /// <summary>
        /// Update AppScope for a form.
        /// </summary>
        public static void SetFormAppScope(int formId, string appScope)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(
                "UPDATE MF_Forms SET AppScope=@AppScope WHERE FormId=@FormId", conn))
            {
                cmd.Parameters.AddWithValue("@FormId", formId);
                cmd.Parameters.AddWithValue("@AppScope", (object)appScope ?? DBNull.Value);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// Get distinct AppScope values for a portal (for dropdown).
        /// </summary>
        public static List<string> GetAppScopes(int portalId)
        {
            var list = new List<string>();
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(
                "SELECT DISTINCT AppScope FROM MF_Forms WHERE PortalId=@PortalId AND AppScope IS NOT NULL ORDER BY AppScope", conn))
            {
                cmd.Parameters.AddWithValue("@PortalId", portalId);
                conn.Open();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) list.Add(r.GetString(0));
                }
            }
            return list;
        }

        #endregion

        #region Form Relations — Cross-Form Linking

        public static List<FormRelationInfo> GetFormRelations(int formId)
        {
            var list = new List<FormRelationInfo>();
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(
                "SELECT * FROM MF_FormRelations WHERE ParentFormId=@FormId OR ChildFormId=@FormId", conn))
            {
                cmd.Parameters.AddWithValue("@FormId", formId);
                conn.Open();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        list.Add(new FormRelationInfo
                        {
                            RelationId = r.GetInt32(r.GetOrdinal("RelationId")),
                            ParentFormId = r.GetInt32(r.GetOrdinal("ParentFormId")),
                            ChildFormId = r.GetInt32(r.GetOrdinal("ChildFormId")),
                            RelationType = r.GetString(r.GetOrdinal("RelationType")),
                            ForeignKey = r.GetString(r.GetOrdinal("ForeignKey")),
                            ParentKey = r.GetString(r.GetOrdinal("ParentKey")),
                            Label = r.IsDBNull(r.GetOrdinal("Label")) ? null : r.GetString(r.GetOrdinal("Label")),
                            CascadeDelete = r.GetBoolean(r.GetOrdinal("CascadeDelete"))
                        });
                    }
                }
            }
            return list;
        }

        public static int SaveFormRelation(FormRelationInfo rel)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                if (rel.RelationId > 0)
                {
                    using (var cmd = new SqlCommand(
                        @"UPDATE MF_FormRelations SET ParentFormId=@P, ChildFormId=@C, RelationType=@T,
                          ForeignKey=@FK, ParentKey=@PK, Label=@L, CascadeDelete=@CD WHERE RelationId=@Id", conn))
                    {
                        cmd.Parameters.AddWithValue("@Id", rel.RelationId);
                        cmd.Parameters.AddWithValue("@P", rel.ParentFormId);
                        cmd.Parameters.AddWithValue("@C", rel.ChildFormId);
                        cmd.Parameters.AddWithValue("@T", rel.RelationType);
                        cmd.Parameters.AddWithValue("@FK", rel.ForeignKey);
                        cmd.Parameters.AddWithValue("@PK", rel.ParentKey ?? "SubmissionId");
                        cmd.Parameters.AddWithValue("@L", (object)rel.Label ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@CD", rel.CascadeDelete);
                        cmd.ExecuteNonQuery();
                    }
                    return rel.RelationId;
                }
                else
                {
                    using (var cmd = new SqlCommand(
                        @"INSERT INTO MF_FormRelations (ParentFormId,ChildFormId,RelationType,ForeignKey,ParentKey,Label,CascadeDelete)
                          VALUES (@P,@C,@T,@FK,@PK,@L,@CD); SELECT SCOPE_IDENTITY();", conn))
                    {
                        cmd.Parameters.AddWithValue("@P", rel.ParentFormId);
                        cmd.Parameters.AddWithValue("@C", rel.ChildFormId);
                        cmd.Parameters.AddWithValue("@T", rel.RelationType);
                        cmd.Parameters.AddWithValue("@FK", rel.ForeignKey);
                        cmd.Parameters.AddWithValue("@PK", rel.ParentKey ?? "SubmissionId");
                        cmd.Parameters.AddWithValue("@L", (object)rel.Label ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@CD", rel.CascadeDelete);
                        return Convert.ToInt32(cmd.ExecuteScalar());
                    }
                }
            }
        }

        public static void DeleteFormRelation(int relationId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("DELETE FROM MF_FormRelations WHERE RelationId=@Id", conn))
            {
                cmd.Parameters.AddWithValue("@Id", relationId);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// Link child submission to parent. Used by workflow or auto-link on submit.
        /// </summary>
        public static void LinkSubmissions(int relationId, int parentSubmissionId, int childSubmissionId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(
                @"IF NOT EXISTS (
                      SELECT 1 FROM MF_SubmissionLinks
                      WHERE RelationId=@R AND ParentSubmissionId=@P AND ChildSubmissionId=@C
                  )
                  INSERT INTO MF_SubmissionLinks (RelationId, ParentSubmissionId, ChildSubmissionId)
                  VALUES (@R, @P, @C)", conn))
            {
                cmd.Parameters.AddWithValue("@R", relationId);
                cmd.Parameters.AddWithValue("@P", parentSubmissionId);
                cmd.Parameters.AddWithValue("@C", childSubmissionId);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// Get child submissions (e.g. replies for a thread).
        /// </summary>
        public static (List<SubmissionInfo> Items, int TotalCount) GetChildSubmissions(
            int parentSubmissionId, int? relationId = null, int page = 1, int pageSize = 50)
        {
            var items = new List<SubmissionInfo>();
            int total = 0;

            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(
                    @"SELECT s.SubmissionId, s.FormId, s.DataJson, s.[Status],
                             s.IpAddress, s.UserAgent, s.UserId, s.IsSpam, s.SpamScore,
                             s.SubmittedOnUtc, s.ReadOnUtc
                      FROM MF_SubmissionLinks sl
                      INNER JOIN MF_Submissions s ON s.SubmissionId = sl.ChildSubmissionId
                      WHERE sl.ParentSubmissionId = @PId
                        AND (@RId IS NULL OR sl.RelationId = @RId)
                        AND s.[Status] <> 'Deleted'
                      ORDER BY s.SubmittedOnUtc ASC
                      OFFSET (@P - 1) * @PS ROWS FETCH NEXT @PS ROWS ONLY", conn))
                {
                    cmd.Parameters.AddWithValue("@PId", parentSubmissionId);
                    cmd.Parameters.AddWithValue("@RId", (object)relationId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@P", page);
                    cmd.Parameters.AddWithValue("@PS", pageSize);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read()) items.Add(MapSubmission(r));
                    }
                }
                using (var cmd2 = new SqlCommand(
                    @"SELECT COUNT(*) FROM MF_SubmissionLinks sl
                      INNER JOIN MF_Submissions s ON s.SubmissionId = sl.ChildSubmissionId
                      WHERE sl.ParentSubmissionId = @PId
                        AND (@RId IS NULL OR sl.RelationId = @RId)
                        AND s.[Status] <> 'Deleted'", conn))
                {
                    cmd2.Parameters.AddWithValue("@PId", parentSubmissionId);
                    cmd2.Parameters.AddWithValue("@RId", (object)relationId ?? DBNull.Value);
                    total = (int)cmd2.ExecuteScalar();
                }
            }
            return (items, total);
        }

        #endregion
    }
}
