using System;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Web.Data
{
    /// <summary>
    /// Creates the 7 typed-submission tables (MF_SubmissionFields + 6 value tables)
    /// on existing MegaForm databases that were created before typed storage was
    /// introduced. Web's schema bootstrapper calls this after it has ensured the
    /// legacy tables exist. The DDL is provider-specific and is idempotent.
    /// </summary>
    public static class TypedSubmissionSchemaBootstrapper
    {
        public static void EnsureTypedTables(MegaFormDbContext db)
        {
            if (db == null) throw new ArgumentNullException(nameof(db));

            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var conn = db.Database.GetDbConnection();
            var shouldClose = conn.State != System.Data.ConnectionState.Open;
            if (shouldClose) conn.Open();

            try
            {
                if (TableExists(conn, provider, "MF_SubmissionFields"))
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
            @"CREATE TABLE [MF_SubmissionFields] (
                [SubmissionFieldId] bigint NOT NULL IDENTITY,
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [FormFieldId] bigint NULL,
                [FieldKey] nvarchar(256) NULL,
                [FieldId] nvarchar(256) NULL,
                [FieldAlias] nvarchar(256) NULL,
                [FieldType] nvarchar(128) NULL,
                [DataType] nvarchar(64) NULL,
                [LabelSnapshot] nvarchar(512) NULL,
                [PageIndex] int NULL,
                [FieldOrder] int NULL,
                [DisplayValue] nvarchar(max) NULL,
                [HasValue] bit NOT NULL DEFAULT 0,
                [IsSensitive] bit NOT NULL DEFAULT 0,
                [CreatedOnUtc] datetime2 NOT NULL,
                [UpdatedOnUtc] datetime2 NULL,
                CONSTRAINT [PK_MF_SubmissionFields] PRIMARY KEY ([SubmissionFieldId])
            );",
            @"CREATE INDEX [IX_MF_SubmissionFields_Submission_FieldKey] ON [MF_SubmissionFields] ([SubmissionId], [FieldKey]);",
            @"CREATE INDEX [IX_MF_SubmissionFields_Form_FieldKey] ON [MF_SubmissionFields] ([FormId], [FieldKey]);",
            @"CREATE INDEX [IX_MF_SubmissionFields_SubmissionId] ON [MF_SubmissionFields] ([SubmissionId]);",
            @"CREATE INDEX [IX_MF_SubmissionFields_Form_DataType] ON [MF_SubmissionFields] ([FormId], [DataType]);",

            @"CREATE TABLE [MF_SubmissionValueString] (
                [Id] bigint NOT NULL IDENTITY,
                [SubmissionFieldId] bigint NOT NULL,
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [FieldKey] nvarchar(256) NULL,
                [Ordinal] int NOT NULL,
                [Value] nvarchar(1024) NULL,
                CONSTRAINT [PK_MF_SubmissionValueString] PRIMARY KEY ([Id])
            );",
            @"CREATE INDEX [IX_MF_SubmissionValueString_FieldId] ON [MF_SubmissionValueString] ([SubmissionFieldId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueString_SubmissionId] ON [MF_SubmissionValueString] ([SubmissionId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueString_Form_Field] ON [MF_SubmissionValueString] ([FormId], [FieldKey]);",

            @"CREATE TABLE [MF_SubmissionValueLongText] (
                [Id] bigint NOT NULL IDENTITY,
                [SubmissionFieldId] bigint NOT NULL,
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [FieldKey] nvarchar(256) NULL,
                [Ordinal] int NOT NULL,
                [Value] nvarchar(max) NULL,
                CONSTRAINT [PK_MF_SubmissionValueLongText] PRIMARY KEY ([Id])
            );",
            @"CREATE INDEX [IX_MF_SubmissionValueLongText_FieldId] ON [MF_SubmissionValueLongText] ([SubmissionFieldId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueLongText_SubmissionId] ON [MF_SubmissionValueLongText] ([SubmissionId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueLongText_Form_Field] ON [MF_SubmissionValueLongText] ([FormId], [FieldKey]);",

            @"CREATE TABLE [MF_SubmissionValueNumber] (
                [Id] bigint NOT NULL IDENTITY,
                [SubmissionFieldId] bigint NOT NULL,
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [FieldKey] nvarchar(256) NULL,
                [Ordinal] int NOT NULL,
                [Value] decimal(18,6) NULL,
                CONSTRAINT [PK_MF_SubmissionValueNumber] PRIMARY KEY ([Id])
            );",
            @"CREATE INDEX [IX_MF_SubmissionValueNumber_FieldId] ON [MF_SubmissionValueNumber] ([SubmissionFieldId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueNumber_SubmissionId] ON [MF_SubmissionValueNumber] ([SubmissionId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueNumber_Form_Field_Value] ON [MF_SubmissionValueNumber] ([FormId], [FieldKey], [Value]);",

            @"CREATE TABLE [MF_SubmissionValueDate] (
                [Id] bigint NOT NULL IDENTITY,
                [SubmissionFieldId] bigint NOT NULL,
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [FieldKey] nvarchar(256) NULL,
                [Ordinal] int NOT NULL,
                [Value] datetime2 NULL,
                CONSTRAINT [PK_MF_SubmissionValueDate] PRIMARY KEY ([Id])
            );",
            @"CREATE INDEX [IX_MF_SubmissionValueDate_FieldId] ON [MF_SubmissionValueDate] ([SubmissionFieldId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueDate_SubmissionId] ON [MF_SubmissionValueDate] ([SubmissionId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueDate_Form_Field_Value] ON [MF_SubmissionValueDate] ([FormId], [FieldKey], [Value]);",

            @"CREATE TABLE [MF_SubmissionValueBoolean] (
                [Id] bigint NOT NULL IDENTITY,
                [SubmissionFieldId] bigint NOT NULL,
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [FieldKey] nvarchar(256) NULL,
                [Ordinal] int NOT NULL,
                [Value] bit NOT NULL,
                CONSTRAINT [PK_MF_SubmissionValueBoolean] PRIMARY KEY ([Id])
            );",
            @"CREATE INDEX [IX_MF_SubmissionValueBoolean_FieldId] ON [MF_SubmissionValueBoolean] ([SubmissionFieldId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueBoolean_SubmissionId] ON [MF_SubmissionValueBoolean] ([SubmissionId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueBoolean_Form_Field_Value] ON [MF_SubmissionValueBoolean] ([FormId], [FieldKey], [Value]);",

            @"CREATE TABLE [MF_SubmissionValueJson] (
                [Id] bigint NOT NULL IDENTITY,
                [SubmissionFieldId] bigint NOT NULL,
                [SubmissionId] int NOT NULL,
                [FormId] int NOT NULL,
                [FieldKey] nvarchar(256) NULL,
                [Ordinal] int NOT NULL,
                [Value] nvarchar(max) NULL,
                CONSTRAINT [PK_MF_SubmissionValueJson] PRIMARY KEY ([Id])
            );",
            @"CREATE INDEX [IX_MF_SubmissionValueJson_FieldId] ON [MF_SubmissionValueJson] ([SubmissionFieldId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueJson_SubmissionId] ON [MF_SubmissionValueJson] ([SubmissionId]);",
            @"CREATE INDEX [IX_MF_SubmissionValueJson_Form_Field] ON [MF_SubmissionValueJson] ([FormId], [FieldKey]);"
        };

        private static readonly string[] PostgreSqlDdl = new[]
        {
            @"CREATE TABLE ""MF_SubmissionFields"" (
                ""SubmissionFieldId"" bigserial NOT NULL,
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""FormFieldId"" bigint NULL,
                ""FieldKey"" varchar(256) NULL,
                ""FieldId"" varchar(256) NULL,
                ""FieldAlias"" varchar(256) NULL,
                ""FieldType"" varchar(128) NULL,
                ""DataType"" varchar(64) NULL,
                ""LabelSnapshot"" varchar(512) NULL,
                ""PageIndex"" integer NULL,
                ""FieldOrder"" integer NULL,
                ""DisplayValue"" text NULL,
                ""HasValue"" boolean NOT NULL DEFAULT FALSE,
                ""IsSensitive"" boolean NOT NULL DEFAULT FALSE,
                ""CreatedOnUtc"" timestamp with time zone NOT NULL,
                ""UpdatedOnUtc"" timestamp with time zone NULL,
                CONSTRAINT ""PK_MF_SubmissionFields"" PRIMARY KEY (""SubmissionFieldId"")
            );",
            @"CREATE INDEX ""IX_MF_SubmissionFields_Submission_FieldKey"" ON ""MF_SubmissionFields"" (""SubmissionId"", ""FieldKey"");",
            @"CREATE INDEX ""IX_MF_SubmissionFields_Form_FieldKey"" ON ""MF_SubmissionFields"" (""FormId"", ""FieldKey"");",
            @"CREATE INDEX ""IX_MF_SubmissionFields_SubmissionId"" ON ""MF_SubmissionFields"" (""SubmissionId"");",
            @"CREATE INDEX ""IX_MF_SubmissionFields_Form_DataType"" ON ""MF_SubmissionFields"" (""FormId"", ""DataType"");",

            @"CREATE TABLE ""MF_SubmissionValueString"" (
                ""Id"" bigserial NOT NULL,
                ""SubmissionFieldId"" bigint NOT NULL,
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""FieldKey"" varchar(256) NULL,
                ""Ordinal"" integer NOT NULL,
                ""Value"" varchar(1024) NULL,
                CONSTRAINT ""PK_MF_SubmissionValueString"" PRIMARY KEY (""Id"")
            );",
            @"CREATE INDEX ""IX_MF_SubmissionValueString_FieldId"" ON ""MF_SubmissionValueString"" (""SubmissionFieldId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueString_SubmissionId"" ON ""MF_SubmissionValueString"" (""SubmissionId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueString_Form_Field"" ON ""MF_SubmissionValueString"" (""FormId"", ""FieldKey"");",

            @"CREATE TABLE ""MF_SubmissionValueLongText"" (
                ""Id"" bigserial NOT NULL,
                ""SubmissionFieldId"" bigint NOT NULL,
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""FieldKey"" varchar(256) NULL,
                ""Ordinal"" integer NOT NULL,
                ""Value"" text NULL,
                CONSTRAINT ""PK_MF_SubmissionValueLongText"" PRIMARY KEY (""Id"")
            );",
            @"CREATE INDEX ""IX_MF_SubmissionValueLongText_FieldId"" ON ""MF_SubmissionValueLongText"" (""SubmissionFieldId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueLongText_SubmissionId"" ON ""MF_SubmissionValueLongText"" (""SubmissionId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueLongText_Form_Field"" ON ""MF_SubmissionValueLongText"" (""FormId"", ""FieldKey"");",

            @"CREATE TABLE ""MF_SubmissionValueNumber"" (
                ""Id"" bigserial NOT NULL,
                ""SubmissionFieldId"" bigint NOT NULL,
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""FieldKey"" varchar(256) NULL,
                ""Ordinal"" integer NOT NULL,
                ""Value"" numeric(18,6) NULL,
                CONSTRAINT ""PK_MF_SubmissionValueNumber"" PRIMARY KEY (""Id"")
            );",
            @"CREATE INDEX ""IX_MF_SubmissionValueNumber_FieldId"" ON ""MF_SubmissionValueNumber"" (""SubmissionFieldId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueNumber_SubmissionId"" ON ""MF_SubmissionValueNumber"" (""SubmissionId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueNumber_Form_Field_Value"" ON ""MF_SubmissionValueNumber"" (""FormId"", ""FieldKey"", ""Value"");",

            @"CREATE TABLE ""MF_SubmissionValueDate"" (
                ""Id"" bigserial NOT NULL,
                ""SubmissionFieldId"" bigint NOT NULL,
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""FieldKey"" varchar(256) NULL,
                ""Ordinal"" integer NOT NULL,
                ""Value"" timestamp with time zone NULL,
                CONSTRAINT ""PK_MF_SubmissionValueDate"" PRIMARY KEY (""Id"")
            );",
            @"CREATE INDEX ""IX_MF_SubmissionValueDate_FieldId"" ON ""MF_SubmissionValueDate"" (""SubmissionFieldId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueDate_SubmissionId"" ON ""MF_SubmissionValueDate"" (""SubmissionId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueDate_Form_Field_Value"" ON ""MF_SubmissionValueDate"" (""FormId"", ""FieldKey"", ""Value"");",

            @"CREATE TABLE ""MF_SubmissionValueBoolean"" (
                ""Id"" bigserial NOT NULL,
                ""SubmissionFieldId"" bigint NOT NULL,
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""FieldKey"" varchar(256) NULL,
                ""Ordinal"" integer NOT NULL,
                ""Value"" boolean NOT NULL,
                CONSTRAINT ""PK_MF_SubmissionValueBoolean"" PRIMARY KEY (""Id"")
            );",
            @"CREATE INDEX ""IX_MF_SubmissionValueBoolean_FieldId"" ON ""MF_SubmissionValueBoolean"" (""SubmissionFieldId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueBoolean_SubmissionId"" ON ""MF_SubmissionValueBoolean"" (""SubmissionId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueBoolean_Form_Field_Value"" ON ""MF_SubmissionValueBoolean"" (""FormId"", ""FieldKey"", ""Value"");",

            @"CREATE TABLE ""MF_SubmissionValueJson"" (
                ""Id"" bigserial NOT NULL,
                ""SubmissionFieldId"" bigint NOT NULL,
                ""SubmissionId"" integer NOT NULL,
                ""FormId"" integer NOT NULL,
                ""FieldKey"" varchar(256) NULL,
                ""Ordinal"" integer NOT NULL,
                ""Value"" text NULL,
                CONSTRAINT ""PK_MF_SubmissionValueJson"" PRIMARY KEY (""Id"")
            );",
            @"CREATE INDEX ""IX_MF_SubmissionValueJson_FieldId"" ON ""MF_SubmissionValueJson"" (""SubmissionFieldId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueJson_SubmissionId"" ON ""MF_SubmissionValueJson"" (""SubmissionId"");",
            @"CREATE INDEX ""IX_MF_SubmissionValueJson_Form_Field"" ON ""MF_SubmissionValueJson"" (""FormId"", ""FieldKey"");"
        };

        private static readonly string[] MySqlDdl = new[]
        {
            @"CREATE TABLE `MF_SubmissionFields` (
                `SubmissionFieldId` bigint NOT NULL AUTO_INCREMENT,
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `FormFieldId` bigint NULL,
                `FieldKey` varchar(256) NULL,
                `FieldId` varchar(256) NULL,
                `FieldAlias` varchar(256) NULL,
                `FieldType` varchar(128) NULL,
                `DataType` varchar(64) NULL,
                `LabelSnapshot` varchar(512) NULL,
                `PageIndex` int NULL,
                `FieldOrder` int NULL,
                `DisplayValue` longtext NULL,
                `HasValue` tinyint(1) NOT NULL DEFAULT 0,
                `IsSensitive` tinyint(1) NOT NULL DEFAULT 0,
                `CreatedOnUtc` datetime(6) NOT NULL,
                `UpdatedOnUtc` datetime(6) NULL,
                PRIMARY KEY (`SubmissionFieldId`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE INDEX `IX_MF_SubmissionFields_Submission_FieldKey` ON `MF_SubmissionFields` (`SubmissionId`, `FieldKey`);",
            @"CREATE INDEX `IX_MF_SubmissionFields_Form_FieldKey` ON `MF_SubmissionFields` (`FormId`, `FieldKey`);",
            @"CREATE INDEX `IX_MF_SubmissionFields_SubmissionId` ON `MF_SubmissionFields` (`SubmissionId`);",
            @"CREATE INDEX `IX_MF_SubmissionFields_Form_DataType` ON `MF_SubmissionFields` (`FormId`, `DataType`);",

            @"CREATE TABLE `MF_SubmissionValueString` (
                `Id` bigint NOT NULL AUTO_INCREMENT,
                `SubmissionFieldId` bigint NOT NULL,
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `FieldKey` varchar(256) NULL,
                `Ordinal` int NOT NULL,
                `Value` varchar(1024) NULL,
                PRIMARY KEY (`Id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE INDEX `IX_MF_SubmissionValueString_FieldId` ON `MF_SubmissionValueString` (`SubmissionFieldId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueString_SubmissionId` ON `MF_SubmissionValueString` (`SubmissionId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueString_Form_Field` ON `MF_SubmissionValueString` (`FormId`, `FieldKey`);",

            @"CREATE TABLE `MF_SubmissionValueLongText` (
                `Id` bigint NOT NULL AUTO_INCREMENT,
                `SubmissionFieldId` bigint NOT NULL,
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `FieldKey` varchar(256) NULL,
                `Ordinal` int NOT NULL,
                `Value` longtext NULL,
                PRIMARY KEY (`Id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE INDEX `IX_MF_SubmissionValueLongText_FieldId` ON `MF_SubmissionValueLongText` (`SubmissionFieldId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueLongText_SubmissionId` ON `MF_SubmissionValueLongText` (`SubmissionId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueLongText_Form_Field` ON `MF_SubmissionValueLongText` (`FormId`, `FieldKey`);",

            @"CREATE TABLE `MF_SubmissionValueNumber` (
                `Id` bigint NOT NULL AUTO_INCREMENT,
                `SubmissionFieldId` bigint NOT NULL,
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `FieldKey` varchar(256) NULL,
                `Ordinal` int NOT NULL,
                `Value` decimal(18,6) NULL,
                PRIMARY KEY (`Id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE INDEX `IX_MF_SubmissionValueNumber_FieldId` ON `MF_SubmissionValueNumber` (`SubmissionFieldId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueNumber_SubmissionId` ON `MF_SubmissionValueNumber` (`SubmissionId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueNumber_Form_Field_Value` ON `MF_SubmissionValueNumber` (`FormId`, `FieldKey`, `Value`);",

            @"CREATE TABLE `MF_SubmissionValueDate` (
                `Id` bigint NOT NULL AUTO_INCREMENT,
                `SubmissionFieldId` bigint NOT NULL,
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `FieldKey` varchar(256) NULL,
                `Ordinal` int NOT NULL,
                `Value` datetime(6) NULL,
                PRIMARY KEY (`Id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE INDEX `IX_MF_SubmissionValueDate_FieldId` ON `MF_SubmissionValueDate` (`SubmissionFieldId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueDate_SubmissionId` ON `MF_SubmissionValueDate` (`SubmissionId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueDate_Form_Field_Value` ON `MF_SubmissionValueDate` (`FormId`, `FieldKey`, `Value`);",

            @"CREATE TABLE `MF_SubmissionValueBoolean` (
                `Id` bigint NOT NULL AUTO_INCREMENT,
                `SubmissionFieldId` bigint NOT NULL,
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `FieldKey` varchar(256) NULL,
                `Ordinal` int NOT NULL,
                `Value` tinyint(1) NOT NULL,
                PRIMARY KEY (`Id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE INDEX `IX_MF_SubmissionValueBoolean_FieldId` ON `MF_SubmissionValueBoolean` (`SubmissionFieldId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueBoolean_SubmissionId` ON `MF_SubmissionValueBoolean` (`SubmissionId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueBoolean_Form_Field_Value` ON `MF_SubmissionValueBoolean` (`FormId`, `FieldKey`, `Value`);",

            @"CREATE TABLE `MF_SubmissionValueJson` (
                `Id` bigint NOT NULL AUTO_INCREMENT,
                `SubmissionFieldId` bigint NOT NULL,
                `SubmissionId` int NOT NULL,
                `FormId` int NOT NULL,
                `FieldKey` varchar(256) NULL,
                `Ordinal` int NOT NULL,
                `Value` longtext NULL,
                PRIMARY KEY (`Id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
            @"CREATE INDEX `IX_MF_SubmissionValueJson_FieldId` ON `MF_SubmissionValueJson` (`SubmissionFieldId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueJson_SubmissionId` ON `MF_SubmissionValueJson` (`SubmissionId`);",
            @"CREATE INDEX `IX_MF_SubmissionValueJson_Form_Field` ON `MF_SubmissionValueJson` (`FormId`, `FieldKey`);"
        };

        private static readonly string[] SqliteDdl = new[]
        {
            @"CREATE TABLE IF NOT EXISTS MF_SubmissionFields (
                SubmissionFieldId INTEGER PRIMARY KEY AUTOINCREMENT,
                SubmissionId INTEGER NOT NULL,
                FormId INTEGER NOT NULL,
                FormFieldId INTEGER NULL,
                FieldKey TEXT NULL,
                FieldId TEXT NULL,
                FieldAlias TEXT NULL,
                FieldType TEXT NULL,
                DataType TEXT NULL,
                LabelSnapshot TEXT NULL,
                PageIndex INTEGER NULL,
                FieldOrder INTEGER NULL,
                DisplayValue TEXT NULL,
                HasValue INTEGER NOT NULL DEFAULT 0,
                IsSensitive INTEGER NOT NULL DEFAULT 0,
                CreatedOnUtc TEXT NOT NULL,
                UpdatedOnUtc TEXT NULL
            );",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionFields_Submission_FieldKey ON MF_SubmissionFields (SubmissionId, FieldKey);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionFields_Form_FieldKey ON MF_SubmissionFields (FormId, FieldKey);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionFields_SubmissionId ON MF_SubmissionFields (SubmissionId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionFields_Form_DataType ON MF_SubmissionFields (FormId, DataType);",

            @"CREATE TABLE IF NOT EXISTS MF_SubmissionValueString (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SubmissionFieldId INTEGER NOT NULL,
                SubmissionId INTEGER NOT NULL,
                FormId INTEGER NOT NULL,
                FieldKey TEXT NULL,
                Ordinal INTEGER NOT NULL,
                Value TEXT NULL
            );",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueString_FieldId ON MF_SubmissionValueString (SubmissionFieldId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueString_SubmissionId ON MF_SubmissionValueString (SubmissionId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueString_Form_Field ON MF_SubmissionValueString (FormId, FieldKey);",

            @"CREATE TABLE IF NOT EXISTS MF_SubmissionValueLongText (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SubmissionFieldId INTEGER NOT NULL,
                SubmissionId INTEGER NOT NULL,
                FormId INTEGER NOT NULL,
                FieldKey TEXT NULL,
                Ordinal INTEGER NOT NULL,
                Value TEXT NULL
            );",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueLongText_FieldId ON MF_SubmissionValueLongText (SubmissionFieldId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueLongText_SubmissionId ON MF_SubmissionValueLongText (SubmissionId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueLongText_Form_Field ON MF_SubmissionValueLongText (FormId, FieldKey);",

            @"CREATE TABLE IF NOT EXISTS MF_SubmissionValueNumber (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SubmissionFieldId INTEGER NOT NULL,
                SubmissionId INTEGER NOT NULL,
                FormId INTEGER NOT NULL,
                FieldKey TEXT NULL,
                Ordinal INTEGER NOT NULL,
                Value REAL NULL
            );",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueNumber_FieldId ON MF_SubmissionValueNumber (SubmissionFieldId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueNumber_SubmissionId ON MF_SubmissionValueNumber (SubmissionId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueNumber_Form_Field_Value ON MF_SubmissionValueNumber (FormId, FieldKey, Value);",

            @"CREATE TABLE IF NOT EXISTS MF_SubmissionValueDate (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SubmissionFieldId INTEGER NOT NULL,
                SubmissionId INTEGER NOT NULL,
                FormId INTEGER NOT NULL,
                FieldKey TEXT NULL,
                Ordinal INTEGER NOT NULL,
                Value TEXT NULL
            );",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueDate_FieldId ON MF_SubmissionValueDate (SubmissionFieldId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueDate_SubmissionId ON MF_SubmissionValueDate (SubmissionId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueDate_Form_Field_Value ON MF_SubmissionValueDate (FormId, FieldKey, Value);",

            @"CREATE TABLE IF NOT EXISTS MF_SubmissionValueBoolean (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SubmissionFieldId INTEGER NOT NULL,
                SubmissionId INTEGER NOT NULL,
                FormId INTEGER NOT NULL,
                FieldKey TEXT NULL,
                Ordinal INTEGER NOT NULL,
                Value INTEGER NOT NULL
            );",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueBoolean_FieldId ON MF_SubmissionValueBoolean (SubmissionFieldId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueBoolean_SubmissionId ON MF_SubmissionValueBoolean (SubmissionId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueBoolean_Form_Field_Value ON MF_SubmissionValueBoolean (FormId, FieldKey, Value);",

            @"CREATE TABLE IF NOT EXISTS MF_SubmissionValueJson (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SubmissionFieldId INTEGER NOT NULL,
                SubmissionId INTEGER NOT NULL,
                FormId INTEGER NOT NULL,
                FieldKey TEXT NULL,
                Ordinal INTEGER NOT NULL,
                Value TEXT NULL
            );",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueJson_FieldId ON MF_SubmissionValueJson (SubmissionFieldId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueJson_SubmissionId ON MF_SubmissionValueJson (SubmissionId);",
            @"CREATE INDEX IF NOT EXISTS IX_MF_SubmissionValueJson_Form_Field ON MF_SubmissionValueJson (FormId, FieldKey);"
        };
    }
}
