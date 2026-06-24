using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.Subform
{
    public sealed class FormTableColumn
    {
        public string Name { get; set; }
        public string SqlType { get; set; }
        public bool Nullable { get; set; }
        public string SourceKey { get; set; }
        public string SourceType { get; set; }
        public string Label { get; set; }
    }

    public sealed class FormTableDdlResult
    {
        public string Ddl { get; set; }
        public string TableName { get; set; }
        public string SchemaName { get; set; }
        public List<FormTableColumn> Columns { get; set; }
        public FormTableDdlResult() { Columns = new List<FormTableColumn>(); }
    }

    /// <summary>
    /// [TASK A] Provider-aware CREATE TABLE generator from a MegaForm schema.
    /// The DNN ProposeTableSchema emitted MSSQL-only DDL (NVARCHAR / IDENTITY /
    /// DATETIME2 / SYSUTCDATETIME) and iterated only TOP-LEVEL fields (so fields
    /// nested inside Row columns were silently dropped). This builder fixes both:
    /// it RECURSES into Row/FlexGrid columns and emits dialect-correct types +
    /// identity + now-default + identifier quoting for SQLite / PostgreSQL /
    /// MySQL / SQL Server, so the resulting DDL runs through ExecuteDdl on the
    /// per-site provider (the live Oqtane host is SQLite).
    /// </summary>
    public static class FormTableDdlBuilder
    {
        public static FormTableDdlResult Build(string schemaJson, string tableName, string schemaName,
            SqlSchemaReader.ProviderKind provider)
        {
            var r = new FormTableDdlResult();
            tableName = SanitizeIdentifier(string.IsNullOrWhiteSpace(tableName) ? "Form_Table" : tableName);
            schemaName = SanitizeIdentifier(string.IsNullOrWhiteSpace(schemaName) ? "dbo" : schemaName);
            r.TableName = tableName;
            r.SchemaName = schemaName;

            var lines = new List<string> { IdPkLine(provider) };

            try
            {
                if (!string.IsNullOrWhiteSpace(schemaJson))
                {
                    var jo = JObject.Parse(schemaJson);
                    var fields = jo["fields"] as JArray;
                    if (fields != null)
                    {
                        var flat = new List<JToken>();
                        FlattenFields(fields, flat);
                        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach (var f in flat)
                        {
                            var key = (string)f["key"];
                            var type = (string)f["type"];
                            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(type)) continue;
                            if (IsLayoutOrSkippable(type)) continue;
                            var safeKey = SanitizeIdentifier(key);
                            if (!seen.Add(safeKey)) continue; // de-dupe collisions
                            var sqlType = MapType(type, provider);
                            var nullable = !(((bool?)f["required"]) ?? false);
                            lines.Add(QuoteIdent(provider, safeKey) + " " + sqlType + (nullable ? " NULL" : " NOT NULL"));
                            r.Columns.Add(new FormTableColumn
                            {
                                Name = safeKey, SqlType = sqlType, Nullable = nullable,
                                SourceKey = key, SourceType = type, Label = (string)f["label"],
                            });
                        }
                    }
                }
            }
            catch { /* fall back to base DDL on parse failure */ }

            lines.Add(QuoteIdent(provider, "CreatedOnUtc") + " " + DateTimeType(provider) + " NOT NULL DEFAULT " + NowDefault(provider));
            lines.Add(QuoteIdent(provider, "CreatedByUserId") + " " + IntType(provider) + " NULL");

            r.Ddl = "CREATE TABLE " + QualifiedTable(provider, schemaName, tableName) +
                    " (\n  " + string.Join(",\n  ", lines) + "\n);";
            return r;
        }

        // Recurse into Row.columns[].fields and FlexGrid.items so nested inputs are captured.
        private static void FlattenFields(JArray fields, List<JToken> outList)
        {
            foreach (var f in fields)
            {
                var type = (string)f["type"];
                if (string.Equals(type, "Row", StringComparison.OrdinalIgnoreCase))
                {
                    var cols = f["columns"] as JArray;
                    if (cols != null)
                        foreach (var c in cols)
                        {
                            var cf = c["fields"] as JArray;
                            if (cf != null) FlattenFields(cf, outList);
                        }
                }
                else if (string.Equals(type, "FlexGrid", StringComparison.OrdinalIgnoreCase))
                {
                    var items = f["items"] as JArray;
                    if (items != null) FlattenFields(items, outList);
                }
                else
                {
                    outList.Add(f);
                }
            }
        }

        private static bool IsLayoutOrSkippable(string type)
        {
            var t = (type ?? string.Empty).Trim().ToLowerInvariant();
            switch (t)
            {
                case "row": case "column": case "flexgrid":
                case "heading": case "section": case "divider":
                case "htmlblock": case "image": case "dynamiclabel":
                case "datarepeater": case "gridrepeater":
                case "datagrid":       // separate child table
                case "fileupload": case "file":  // separate files table
                    return true;
                default:
                    return false;
            }
        }

        // ── provider-aware type mapping ──────────────────────────────────
        private static string MapType(string formType, SqlSchemaReader.ProviderKind p)
        {
            var t = (formType ?? string.Empty).Trim().ToLowerInvariant();
            bool ms = p == SqlSchemaReader.ProviderKind.SqlServer || p == SqlSchemaReader.ProviderKind.Unknown;
            bool sl = p == SqlSchemaReader.ProviderKind.Sqlite;
            bool pg = p == SqlSchemaReader.ProviderKind.PostgreSql;
            switch (t)
            {
                case "text": case "phone": case "phonenumberpro": case "phonepro":
                case "url": case "color":
                    return sl ? "TEXT" : pg ? "VARCHAR(250)" : ms ? "NVARCHAR(250)" : "VARCHAR(250)";
                case "email":
                    return sl ? "TEXT" : pg ? "VARCHAR(254)" : ms ? "NVARCHAR(254)" : "VARCHAR(254)";
                case "password":
                    return sl ? "TEXT" : pg ? "VARCHAR(250)" : ms ? "NVARCHAR(250)" : "VARCHAR(250)";
                case "longtext": case "textarea": case "richtext": case "signature":
                    return sl ? "TEXT" : pg ? "TEXT" : ms ? "NVARCHAR(MAX)" : "TEXT";
                case "number": case "slider": case "rating":
                    return sl ? "REAL" : "DECIMAL(18, 6)";
                case "date":
                    return sl ? "TEXT" : "DATE";
                case "time":
                    return sl ? "TEXT" : "TIME";
                case "datetime":
                    return DateTimeType(p);
                case "checkbox": case "switch":
                    return sl ? "INTEGER" : pg ? "BOOLEAN" : ms ? "BIT" : "TINYINT(1)";
                case "radio": case "select":
                    return sl ? "TEXT" : pg ? "VARCHAR(120)" : ms ? "NVARCHAR(120)" : "VARCHAR(120)";
                case "multiselect":
                    return sl ? "TEXT" : pg ? "TEXT" : ms ? "NVARCHAR(MAX)" : "TEXT";
                case "hidden":
                    return sl ? "TEXT" : pg ? "VARCHAR(120)" : ms ? "NVARCHAR(120)" : "VARCHAR(120)";
                default:
                    return sl ? "TEXT" : pg ? "VARCHAR(500)" : ms ? "NVARCHAR(500)" : "VARCHAR(500)";
            }
        }

        private static string DateTimeType(SqlSchemaReader.ProviderKind p)
        {
            switch (p)
            {
                case SqlSchemaReader.ProviderKind.Sqlite: return "TEXT";
                case SqlSchemaReader.ProviderKind.PostgreSql: return "TIMESTAMP";
                case SqlSchemaReader.ProviderKind.MySql: return "DATETIME";
                default: return "DATETIME2";
            }
        }

        private static string IntType(SqlSchemaReader.ProviderKind p)
        {
            return p == SqlSchemaReader.ProviderKind.Sqlite ? "INTEGER" : "INT";
        }

        private static string NowDefault(SqlSchemaReader.ProviderKind p)
        {
            switch (p)
            {
                case SqlSchemaReader.ProviderKind.Sqlite: return "(datetime('now'))";
                case SqlSchemaReader.ProviderKind.SqlServer:
                case SqlSchemaReader.ProviderKind.Unknown: return "SYSUTCDATETIME()";
                default: return "CURRENT_TIMESTAMP"; // PG + MySQL
            }
        }

        private static string IdPkLine(SqlSchemaReader.ProviderKind p)
        {
            switch (p)
            {
                case SqlSchemaReader.ProviderKind.Sqlite: return "\"Id\" INTEGER PRIMARY KEY AUTOINCREMENT";
                case SqlSchemaReader.ProviderKind.PostgreSql: return "\"Id\" SERIAL PRIMARY KEY";
                case SqlSchemaReader.ProviderKind.MySql: return "`Id` INT AUTO_INCREMENT PRIMARY KEY";
                default: return "[Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY";
            }
        }

        private static string QuoteIdent(SqlSchemaReader.ProviderKind p, string ident)
        {
            switch (p)
            {
                case SqlSchemaReader.ProviderKind.Sqlite:
                case SqlSchemaReader.ProviderKind.PostgreSql: return "\"" + ident + "\"";
                case SqlSchemaReader.ProviderKind.MySql: return "`" + ident + "`";
                default: return "[" + ident + "]";
            }
        }

        private static string QualifiedTable(SqlSchemaReader.ProviderKind p, string schemaName, string tableName)
        {
            switch (p)
            {
                case SqlSchemaReader.ProviderKind.Sqlite:
                case SqlSchemaReader.ProviderKind.MySql:
                    return QuoteIdent(p, tableName); // no schema prefix
                case SqlSchemaReader.ProviderKind.PostgreSql:
                    return "\"" + tableName + "\"";
                default:
                    return "[" + schemaName + "].[" + tableName + "]";
            }
        }

        private static string SanitizeIdentifier(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "_";
            var sb = new System.Text.StringBuilder();
            foreach (var c in s)
                if (char.IsLetterOrDigit(c) || c == '_') sb.Append(c);
            var clean = sb.ToString();
            if (clean.Length == 0) clean = "_";
            if (char.IsDigit(clean[0])) clean = "_" + clean;
            return clean.Length > 120 ? clean.Substring(0, 120) : clean;
        }
    }
}
