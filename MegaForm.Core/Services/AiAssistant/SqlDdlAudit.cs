using System;
using System.Data.Common;
using MegaForm.Core.Services.Subform; // SqlSchemaReader.ProviderKind / Detect

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>One audit record for an AI <c>ExecuteDdl</c> attempt.</summary>
    public sealed class DdlAuditEntry
    {
        public int? PortalId { get; set; }
        public int? UserId { get; set; }
        public string UserName { get; set; }
        public string ConnectionKey { get; set; }
        public string Verb { get; set; }
        public bool Allowed { get; set; }
        public string BlockReason { get; set; }
        public bool? Success { get; set; }
        public int? Affected { get; set; }
        public bool DryRun { get; set; }
        public int DurationMs { get; set; }
        public string Error { get; set; }
        public string Sql { get; set; }
    }

    /// <summary>
    /// [P1-3] Provider-aware audit writer for the AI <c>ExecuteDdl</c> path.
    /// Records who/when/what/verdict/result into <c>MF_AiDdlAudit</c> on the
    /// SAME database the statement targeted. Honors the multi-provider
    /// constraint (Oqtane runs SQLite / PostgreSQL / MySQL / SQL Server) by
    /// dialect-switching both the CREATE and the INSERT (identifier quoting +
    /// auto-increment + boolean/timestamp types differ per provider).
    ///
    /// Best-effort: every failure is swallowed so auditing can never block or
    /// break the real operation. The column is named <c>SqlText</c> (not
    /// <c>Sql</c>) to avoid the reserved word across dialects.
    /// </summary>
    public static class SqlDdlAudit
    {
        public static void TryWrite(DbConnection conn, DdlAuditEntry e)
        {
            try
            {
                var kind = SqlSchemaReader.Detect(conn);
                Ensure(conn, kind);
                Insert(conn, kind, e);
            }
            catch { /* auditing is best-effort */ }
        }

        private static void Ensure(DbConnection conn, SqlSchemaReader.ProviderKind kind)
        {
            string ddl;
            switch (kind)
            {
                case SqlSchemaReader.ProviderKind.Sqlite:
                    ddl = "CREATE TABLE IF NOT EXISTS MF_AiDdlAudit (" +
                          "Id INTEGER PRIMARY KEY AUTOINCREMENT, CreatedOnUtc TEXT, PortalId INTEGER, UserId INTEGER, " +
                          "UserName TEXT, ConnectionKey TEXT, Verb TEXT, Allowed INTEGER, BlockReason TEXT, " +
                          "Success INTEGER, Affected INTEGER, DryRun INTEGER, DurationMs INTEGER, Error TEXT, SqlText TEXT)";
                    break;
                case SqlSchemaReader.ProviderKind.PostgreSql:
                    ddl = "CREATE TABLE IF NOT EXISTS \"MF_AiDdlAudit\" (" +
                          "\"Id\" SERIAL PRIMARY KEY, \"CreatedOnUtc\" TIMESTAMP, \"PortalId\" INTEGER, \"UserId\" INTEGER, " +
                          "\"UserName\" TEXT, \"ConnectionKey\" TEXT, \"Verb\" TEXT, \"Allowed\" BOOLEAN, \"BlockReason\" TEXT, " +
                          "\"Success\" BOOLEAN, \"Affected\" INTEGER, \"DryRun\" BOOLEAN, \"DurationMs\" INTEGER, \"Error\" TEXT, \"SqlText\" TEXT)";
                    break;
                case SqlSchemaReader.ProviderKind.MySql:
                    ddl = "CREATE TABLE IF NOT EXISTS MF_AiDdlAudit (" +
                          "Id INT AUTO_INCREMENT PRIMARY KEY, CreatedOnUtc DATETIME, PortalId INT, UserId INT, " +
                          "UserName TEXT, ConnectionKey TEXT, Verb TEXT, Allowed TINYINT(1), BlockReason TEXT, " +
                          "Success TINYINT(1), Affected INT, DryRun TINYINT(1), DurationMs INT, Error TEXT, SqlText TEXT)";
                    break;
                default: // SQL Server (+ best-effort Unknown)
                    ddl = "IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='MF_AiDdlAudit') " +
                          "CREATE TABLE [dbo].[MF_AiDdlAudit] (" +
                          "[Id] INT IDENTITY(1,1) PRIMARY KEY, [CreatedOnUtc] DATETIME2, [PortalId] INT, [UserId] INT, " +
                          "[UserName] NVARCHAR(256), [ConnectionKey] NVARCHAR(128), [Verb] NVARCHAR(64), [Allowed] BIT, [BlockReason] NVARCHAR(512), " +
                          "[Success] BIT, [Affected] INT, [DryRun] BIT, [DurationMs] INT, [Error] NVARCHAR(1024), [SqlText] NVARCHAR(MAX))";
                    break;
            }
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = ddl;
                cmd.CommandTimeout = 15;
                cmd.ExecuteNonQuery();
            }
        }

        private static void Insert(DbConnection conn, SqlSchemaReader.ProviderKind kind, DdlAuditEntry e)
        {
            // Quote identifiers per dialect; @-prefixed parameter markers work
            // on Microsoft.Data.Sqlite, Npgsql, MySqlConnector and SqlClient.
            string tbl = QuoteTable(kind);
            string cols =
                Q(kind, "CreatedOnUtc") + "," + Q(kind, "PortalId") + "," + Q(kind, "UserId") + "," +
                Q(kind, "UserName") + "," + Q(kind, "ConnectionKey") + "," + Q(kind, "Verb") + "," +
                Q(kind, "Allowed") + "," + Q(kind, "BlockReason") + "," + Q(kind, "Success") + "," +
                Q(kind, "Affected") + "," + Q(kind, "DryRun") + "," + Q(kind, "DurationMs") + "," +
                Q(kind, "Error") + "," + Q(kind, "SqlText");

            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText =
                    "INSERT INTO " + tbl + " (" + cols + ") VALUES " +
                    "(@c,@p,@u,@un,@ck,@v,@a,@br,@s,@af,@dr,@d,@e,@sql)";
                cmd.CommandTimeout = 15;
                AddParam(cmd, "@c", (object)DateTime.UtcNow);
                AddParam(cmd, "@p", Box(e.PortalId));
                AddParam(cmd, "@u", Box(e.UserId));
                AddParam(cmd, "@un", (object)e.UserName ?? DBNull.Value);
                AddParam(cmd, "@ck", (object)e.ConnectionKey ?? DBNull.Value);
                AddParam(cmd, "@v", (object)e.Verb ?? DBNull.Value);
                AddParam(cmd, "@a", BoolParam(kind, e.Allowed));
                AddParam(cmd, "@br", (object)e.BlockReason ?? DBNull.Value);
                AddParam(cmd, "@s", e.Success.HasValue ? BoolParam(kind, e.Success.Value) : DBNull.Value);
                AddParam(cmd, "@af", Box(e.Affected));
                AddParam(cmd, "@dr", BoolParam(kind, e.DryRun));
                AddParam(cmd, "@d", (object)e.DurationMs);
                AddParam(cmd, "@e", (object)e.Error ?? DBNull.Value);
                AddParam(cmd, "@sql", (object)(e.Sql ?? string.Empty));
                cmd.ExecuteNonQuery();
            }
        }

        // SQLite/MySQL store booleans as 0/1; SqlClient/Npgsql take real bools.
        private static object BoolParam(SqlSchemaReader.ProviderKind kind, bool v)
        {
            if (kind == SqlSchemaReader.ProviderKind.Sqlite || kind == SqlSchemaReader.ProviderKind.MySql)
                return v ? 1 : 0;
            return v;
        }

        private static object Box(int? n)
        {
            return n.HasValue ? (object)n.Value : DBNull.Value;
        }

        private static string QuoteTable(SqlSchemaReader.ProviderKind kind)
        {
            switch (kind)
            {
                case SqlSchemaReader.ProviderKind.PostgreSql: return "\"MF_AiDdlAudit\"";
                case SqlSchemaReader.ProviderKind.SqlServer:
                case SqlSchemaReader.ProviderKind.Unknown: return "[dbo].[MF_AiDdlAudit]";
                default: return "MF_AiDdlAudit"; // SQLite / MySQL
            }
        }

        private static string Q(SqlSchemaReader.ProviderKind kind, string ident)
        {
            switch (kind)
            {
                case SqlSchemaReader.ProviderKind.PostgreSql: return "\"" + ident + "\"";
                case SqlSchemaReader.ProviderKind.SqlServer:
                case SqlSchemaReader.ProviderKind.Unknown: return "[" + ident + "]";
                default: return ident; // SQLite / MySQL — none of our names are reserved
            }
        }

        private static void AddParam(DbCommand cmd, string name, object value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }
    }
}
