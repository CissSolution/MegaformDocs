using System;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// Creates the 2 external-table tables (MF_ExternalBinding + MF_ExternalRowMap)
    /// on existing MegaForm databases that were created before external-table binding
    /// was ported to this host. The DDL is provider-specific and is idempotent
    /// (sentinel check on MF_ExternalBinding).
    /// </summary>
    public static class ExternalTableSchemaBootstrapper
    {
        public static void EnsureExternalTables(MegaFormDbContext db)
        {
            if (db == null) throw new ArgumentNullException(nameof(db));

            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var conn = db.Database.GetDbConnection();
            var shouldClose = conn.State != System.Data.ConnectionState.Open;
            if (shouldClose) conn.Open();

            try
            {
                if (TableExists(conn, provider, "MF_ExternalBinding"))
                    return;

                var batches = GetDdl(provider);
                foreach (var sql in batches)
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = sql;
                    cmd.ExecuteNonQuery();
                }
            }
            finally
            {
                if (shouldClose) conn.Close();
            }
        }

        private static bool TableExists(DbConnection conn, string provider, string tableName)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = provider switch
            {
                var p when p.Contains("sqlserver") =>
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE LOWER(TABLE_NAME) = @tableName",
                var p when p.Contains("npgsql") =>
                    "SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name) = @tableName",
                var p when p.Contains("mysql") =>
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND LOWER(table_name) = @tableName",
                _ =>
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND LOWER(name) = @tableName"
            };

            var param = cmd.CreateParameter();
            param.ParameterName = "@tableName";
            param.Value = tableName.ToLowerInvariant();
            cmd.Parameters.Add(param);

            var scalar = cmd.ExecuteScalar();
            var count = Convert.ToInt32(scalar ?? 0);
            return count > 0;
        }

        private static string[] GetDdl(string provider)
        {
            if (provider.Contains("sqlserver")) return SqlServerDdl;
            if (provider.Contains("npgsql")) return PostgreSqlDdl;
            if (provider.Contains("mysql")) return MySqlDdl;
            return SqliteDdl;
        }

        private static readonly string[] SqlServerDdl = new[]
        {
            @"CREATE TABLE [MF_ExternalBinding] (
                [FormId] int NOT NULL,
                [ConnectionKey] nvarchar(100) NULL,
                [DatabaseType] nvarchar(50) NULL,
                [SchemaName] nvarchar(128) NULL,
                [TableName] nvarchar(128) NULL,
                [ProfileJson] nvarchar(max) NULL,
                [ProfileHash] nvarchar(80) NULL,
                [Mode] nvarchar(20) NULL,
                [TimeColumnConfirmed] bit NOT NULL DEFAULT 0,
                [CreatedOnUtc] datetime2 NOT NULL,
                CONSTRAINT [PK_MF_ExternalBinding] PRIMARY KEY ([FormId])
            );",

            @"CREATE TABLE [MF_ExternalRowMap] (
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [RowKeyHash] nvarchar(64) NOT NULL,
                [RowKeyJson] nvarchar(900) NOT NULL,
                [FirstSeenUtc] datetime2 NOT NULL,
                CONSTRAINT [PK_MF_ExternalRowMap] PRIMARY KEY ([SubmissionId])
            );",
            @"CREATE UNIQUE INDEX [IX_MF_ExternalRowMap_FormId_RowKeyHash] ON [MF_ExternalRowMap] ([FormId], [RowKeyHash]);"
        };

        private static readonly string[] PostgreSqlDdl = new[]
        {
            @"CREATE TABLE ""MF_ExternalBinding"" (
                ""FormId"" integer NOT NULL,
                ""ConnectionKey"" varchar(100) NULL,
                ""DatabaseType"" varchar(50) NULL,
                ""SchemaName"" varchar(128) NULL,
                ""TableName"" varchar(128) NULL,
                ""ProfileJson"" text NULL,
                ""ProfileHash"" varchar(80) NULL,
                ""Mode"" varchar(20) NULL,
                ""TimeColumnConfirmed"" boolean NOT NULL DEFAULT FALSE,
                ""CreatedOnUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""PK_MF_ExternalBinding"" PRIMARY KEY (""FormId"")
            );",

            @"CREATE TABLE ""MF_ExternalRowMap"" (
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""RowKeyHash"" varchar(64) NOT NULL,
                ""RowKeyJson"" varchar(900) NOT NULL,
                ""FirstSeenUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""PK_MF_ExternalRowMap"" PRIMARY KEY (""SubmissionId"")
            );",
            @"CREATE UNIQUE INDEX ""IX_MF_ExternalRowMap_FormId_RowKeyHash"" ON ""MF_ExternalRowMap"" (""FormId"", ""RowKeyHash"");"
        };

        private static readonly string[] MySqlDdl = new[]
        {
            @"CREATE TABLE `MF_ExternalBinding` (
                `FormId` int NOT NULL,
                `ConnectionKey` varchar(100) NULL,
                `DatabaseType` varchar(50) NULL,
                `SchemaName` varchar(128) NULL,
                `TableName` varchar(128) NULL,
                `ProfileJson` longtext NULL,
                `ProfileHash` varchar(80) NULL,
                `Mode` varchar(20) NULL,
                `TimeColumnConfirmed` tinyint(1) NOT NULL DEFAULT 0,
                `CreatedOnUtc` datetime(6) NOT NULL,
                PRIMARY KEY (`FormId`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

            @"CREATE TABLE `MF_ExternalRowMap` (
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `RowKeyHash` varchar(64) NOT NULL,
                `RowKeyJson` varchar(900) NOT NULL,
                `FirstSeenUtc` datetime(6) NOT NULL,
                PRIMARY KEY (`SubmissionId`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE UNIQUE INDEX `IX_MF_ExternalRowMap_FormId_RowKeyHash` ON `MF_ExternalRowMap` (`FormId`, `RowKeyHash`);"
        };

        private static readonly string[] SqliteDdl = new[]
        {
            @"CREATE TABLE IF NOT EXISTS MF_ExternalBinding (
                FormId INTEGER NOT NULL CONSTRAINT PK_MF_ExternalBinding PRIMARY KEY,
                ConnectionKey TEXT NULL,
                DatabaseType TEXT NULL,
                SchemaName TEXT NULL,
                TableName TEXT NULL,
                ProfileJson TEXT NULL,
                ProfileHash TEXT NULL,
                Mode TEXT NULL,
                TimeColumnConfirmed INTEGER NOT NULL DEFAULT 0,
                CreatedOnUtc TEXT NOT NULL
            );",

            @"CREATE TABLE IF NOT EXISTS MF_ExternalRowMap (
                SubmissionId INTEGER NOT NULL CONSTRAINT PK_MF_ExternalRowMap PRIMARY KEY,
                FormId INTEGER NOT NULL,
                RowKeyHash TEXT NOT NULL,
                RowKeyJson TEXT NOT NULL,
                FirstSeenUtc TEXT NOT NULL
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS IX_MF_ExternalRowMap_FormId_RowKeyHash ON MF_ExternalRowMap (FormId, RowKeyHash);"
        };
    }
}
