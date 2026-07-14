using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Data;
using MegaForm.Core.Models.ExternalTable;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// [ShellParity v20260714-03] DNN's IExternalBindingStore.
    ///
    /// The binding is SERVER-OWNED (see ExternalBinding): which table and which connection a form
    /// reads is a data-access decision, never a design choice the builder may post back inside
    /// SchemaJson. Oqtane keeps it in an EF table; DNN keeps it in the same MF_ExternalBindings
    /// table, written with plain ADO.NET like every other DNN repository here.
    ///
    /// The table is created on first use: DNN's SqlDataProvider scripts stopped at 01.06.32, so a
    /// site upgraded by DLL hot-swap has no MF_ExternalBindings — and a missing table would surface
    /// as "bind failed" with no way for an admin to know why. Same pattern DnnWorkflowRepository
    /// already uses for its own tables.
    /// </summary>
    public class DnnExternalBindingStore : IExternalBindingStore
    {
        private static readonly object SchemaLock = new object();
        private static bool _schemaReady;

        private static string ConnectionString => DataProvider.Instance().ConnectionString;

        private static void EnsureSchema(SqlConnection conn)
        {
            if (_schemaReady) return;
            lock (SchemaLock)
            {
                if (_schemaReady) return;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
IF OBJECT_ID(N'[dbo].[MF_ExternalBindings]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MF_ExternalBindings] (
        [FormId] int NOT NULL PRIMARY KEY,
        [ConnectionKey] nvarchar(128) NOT NULL DEFAULT '',
        [DatabaseType] nvarchar(32) NULL,
        [SchemaName] nvarchar(128) NOT NULL DEFAULT '',
        [TableName] nvarchar(256) NOT NULL DEFAULT '',
        [ProfileJson] nvarchar(max) NOT NULL DEFAULT '',
        [ProfileHash] nvarchar(128) NOT NULL DEFAULT '',
        [Mode] nvarchar(32) NOT NULL DEFAULT 'readonly',
        [TimeColumnConfirmed] bit NOT NULL DEFAULT 0,
        [CreatedOnUtc] datetime2 NOT NULL
    );
END;";
                    cmd.ExecuteNonQuery();
                }
                _schemaReady = true;
            }
        }

        public ExternalBinding GetByForm(int formId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                EnsureSchema(conn);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"SELECT FormId, ConnectionKey, DatabaseType, SchemaName, TableName,
                                               ProfileJson, ProfileHash, Mode, TimeColumnConfirmed, CreatedOnUtc
                                        FROM dbo.MF_ExternalBindings WHERE FormId = @f";
                    cmd.Parameters.Add(new SqlParameter("@f", SqlDbType.Int) { Value = formId });
                    using (var r = cmd.ExecuteReader())
                    {
                        if (!r.Read()) return null;
                        return new ExternalBinding
                        {
                            FormId = r.GetInt32(0),
                            ConnectionKey = Str(r, 1),
                            DatabaseType = r.IsDBNull(2) ? null : r.GetString(2),
                            Schema = Str(r, 3),
                            Table = Str(r, 4),
                            ProfileJson = Str(r, 5),
                            ProfileHash = Str(r, 6),
                            Mode = Str(r, 7),
                            TimeColumnConfirmed = !r.IsDBNull(8) && r.GetBoolean(8),
                            CreatedOnUtc = r.IsDBNull(9) ? DateTime.UtcNow : r.GetDateTime(9),
                        };
                    }
                }
            }
        }

        public void Save(ExternalBinding b)
        {
            if (b == null) throw new ArgumentNullException(nameof(b));

            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                EnsureSchema(conn);
                using (var cmd = conn.CreateCommand())
                {
                    // One binding per form: re-binding a form REPLACES where it reads from.
                    cmd.CommandText = @"
UPDATE dbo.MF_ExternalBindings
   SET ConnectionKey = @key, DatabaseType = @dbt, SchemaName = @sch, TableName = @tbl,
       ProfileJson = @pj, ProfileHash = @ph, Mode = @mode, TimeColumnConfirmed = @tc
 WHERE FormId = @f;
IF @@ROWCOUNT = 0
    INSERT INTO dbo.MF_ExternalBindings
        (FormId, ConnectionKey, DatabaseType, SchemaName, TableName, ProfileJson, ProfileHash, Mode, TimeColumnConfirmed, CreatedOnUtc)
    VALUES (@f, @key, @dbt, @sch, @tbl, @pj, @ph, @mode, @tc, @now);";
                    cmd.Parameters.Add(new SqlParameter("@f", SqlDbType.Int) { Value = b.FormId });
                    cmd.Parameters.Add(new SqlParameter("@key", SqlDbType.NVarChar, 128) { Value = (object)b.ConnectionKey ?? string.Empty });
                    cmd.Parameters.Add(new SqlParameter("@dbt", SqlDbType.NVarChar, 32) { Value = (object)b.DatabaseType ?? DBNull.Value });
                    cmd.Parameters.Add(new SqlParameter("@sch", SqlDbType.NVarChar, 128) { Value = (object)b.Schema ?? string.Empty });
                    cmd.Parameters.Add(new SqlParameter("@tbl", SqlDbType.NVarChar, 256) { Value = (object)b.Table ?? string.Empty });
                    cmd.Parameters.Add(new SqlParameter("@pj", SqlDbType.NVarChar, -1) { Value = (object)b.ProfileJson ?? string.Empty });
                    cmd.Parameters.Add(new SqlParameter("@ph", SqlDbType.NVarChar, 128) { Value = (object)b.ProfileHash ?? string.Empty });
                    cmd.Parameters.Add(new SqlParameter("@mode", SqlDbType.NVarChar, 32) { Value = (object)b.Mode ?? "readonly" });
                    cmd.Parameters.Add(new SqlParameter("@tc", SqlDbType.Bit) { Value = b.TimeColumnConfirmed });
                    cmd.Parameters.Add(new SqlParameter("@now", SqlDbType.DateTime2) { Value = DateTime.UtcNow });
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public void Delete(int formId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                EnsureSchema(conn);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "DELETE FROM dbo.MF_ExternalBindings WHERE FormId = @f";
                    cmd.Parameters.Add(new SqlParameter("@f", SqlDbType.Int) { Value = formId });
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public List<int> BoundFormIds()
        {
            var ids = new List<int>();
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                EnsureSchema(conn);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT FormId FROM dbo.MF_ExternalBindings";
                    using (var r = cmd.ExecuteReader())
                        while (r.Read()) ids.Add(r.GetInt32(0));
                }
            }
            return ids;
        }

        private static string Str(IDataRecord r, int i) => r.IsDBNull(i) ? string.Empty : r.GetString(i);
    }
}
