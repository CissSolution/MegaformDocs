using System;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// Creates the MF_DataSources table on existing MegaForm databases.
    /// Idempotent: sentinel-checks MF_DataSources before running DDL.
    /// </summary>
    public static class DataSourceSchemaBootstrapper
    {
        public static void EnsureDataSourceTable(MegaFormDbContext db)
        {
            if (db == null) throw new ArgumentNullException(nameof(db));

            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var conn = db.Database.GetDbConnection();
            var shouldClose = conn.State != System.Data.ConnectionState.Open;
            if (shouldClose) conn.Open();

            try
            {
                if (TableExists(conn, provider, "MF_DataSources"))
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
            @"CREATE TABLE [MF_DataSources] (
                [Id] int NOT NULL IDENTITY(1,1),
                [Name] nvarchar(200) NOT NULL,
                [ConnectionKey] nvarchar(100) NOT NULL,
                [DatabaseType] nvarchar(50) NULL DEFAULT '',
                [TableName] nvarchar(256) NULL DEFAULT '',
                [Query] nvarchar(max) NULL DEFAULT '',
                [Description] nvarchar(max) NULL DEFAULT '',
                [CreatedOnUtc] datetime2 NOT NULL,
                [UpdatedOnUtc] datetime2 NOT NULL,
                CONSTRAINT [PK_MF_DataSources] PRIMARY KEY ([Id]),
                CONSTRAINT [UQ_MF_DataSources_Name] UNIQUE ([Name])
            );"
        };

        private static readonly string[] PostgreSqlDdl = new[]
        {
            @"CREATE TABLE ""MF_DataSources"" (
                ""Id"" serial NOT NULL,
                ""Name"" varchar(200) NOT NULL,
                ""ConnectionKey"" varchar(100) NOT NULL,
                ""DatabaseType"" varchar(50) NULL DEFAULT '',
                ""TableName"" varchar(256) NULL DEFAULT '',
                ""Query"" text NULL DEFAULT '',
                ""Description"" text NULL DEFAULT '',
                ""CreatedOnUtc"" timestamp with time zone NOT NULL,
                ""UpdatedOnUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""PK_MF_DataSources"" PRIMARY KEY (""Id""),
                CONSTRAINT ""UQ_MF_DataSources_Name"" UNIQUE (""Name"")
            );"
        };

        private static readonly string[] MySqlDdl = new[]
        {
            @"CREATE TABLE `MF_DataSources` (
                `Id` int NOT NULL AUTO_INCREMENT,
                `Name` varchar(200) NOT NULL,
                `ConnectionKey` varchar(100) NOT NULL,
                `DatabaseType` varchar(50) NULL DEFAULT '',
                `TableName` varchar(256) NULL DEFAULT '',
                `Query` longtext NULL DEFAULT '',
                `Description` longtext NULL DEFAULT '',
                `CreatedOnUtc` datetime(6) NOT NULL,
                `UpdatedOnUtc` datetime(6) NOT NULL,
                PRIMARY KEY (`Id`),
                UNIQUE KEY `UQ_MF_DataSources_Name` (`Name`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
        };

        private static readonly string[] SqliteDdl = new[]
        {
            @"CREATE TABLE IF NOT EXISTS MF_DataSources (
                Id INTEGER NOT NULL CONSTRAINT PK_MF_DataSources PRIMARY KEY AUTOINCREMENT,
                Name TEXT NOT NULL,
                ConnectionKey TEXT NOT NULL,
                DatabaseType TEXT NULL DEFAULT '',
                TableName TEXT NULL DEFAULT '',
                Query TEXT NULL DEFAULT '',
                Description TEXT NULL DEFAULT '',
                CreatedOnUtc TEXT NOT NULL,
                UpdatedOnUtc TEXT NOT NULL
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS UQ_MF_DataSources_Name ON MF_DataSources (Name);"
        };
    }
}
