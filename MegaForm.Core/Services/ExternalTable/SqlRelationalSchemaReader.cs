using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using MegaForm.Core.Models.ExternalTable;
using MegaForm.Core.Services.Subform;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P0] Reads the relational metadata that <see cref="SqlSchemaReader"/> never could:
    /// primary key, identity, computed, rowversion, defaults, unique indexes, foreign keys,
    /// CHECK constraints, triggers and row counts.
    ///
    /// Deliberately a NEW type rather than an extension of SqlSchemaReader: that one is on the
    /// Subform + AiTools paths and its ListColumns does not even filter TABLE_SCHEMA, so two
    /// same-named tables in different schemas silently merge their columns.
    ///
    /// Three tiers, in order: L2 = sys.* · L1 = INFORMATION_SCHEMA + COLUMNPROPERTY ·
    /// L0 = GetSchemaTable(KeyInfo). A tier that throws is recorded as missing and the caller
    /// assumes the WORST case — never the best.
    /// </summary>
    public class SqlRelationalSchemaReader
    {
        private readonly DbConnection _conn;
        private readonly int _timeoutSec;
        public SqlSchemaReader.ProviderKind Provider { get; private set; }
        /// <summary>Probes that threw. Surfaced into ProbeCoverage.Missing.</summary>
        public List<string> Failures { get; private set; }

        public SqlRelationalSchemaReader(DbConnection openConnection, int timeoutSec = 5)
        {
            _conn = openConnection;
            _timeoutSec = timeoutSec;
            Provider = SqlSchemaReader.Detect(openConnection);
            Failures = new List<string>();
        }

        public bool IsSqlServer { get { return Provider == SqlSchemaReader.ProviderKind.SqlServer; } }

        // ------------------------------------------------------------------ helpers

        private DbCommand Cmd(string sql)
        {
            var c = _conn.CreateCommand();
            c.CommandText = sql;
            try { c.CommandTimeout = _timeoutSec; } catch { /* some providers reject */ }
            return c;
        }

        private static void Param(DbCommand c, string name, object value)
        {
            var p = c.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            c.Parameters.Add(p);
        }

        private static string S(DbDataReader r, int i) { return r.IsDBNull(i) ? null : Convert.ToString(r.GetValue(i)); }
        private static int I(DbDataReader r, int i) { return r.IsDBNull(i) ? 0 : Convert.ToInt32(r.GetValue(i)); }
        private static long L(DbDataReader r, int i) { return r.IsDBNull(i) ? 0L : Convert.ToInt64(r.GetValue(i)); }
        private static bool B(DbDataReader r, int i)
        {
            if (r.IsDBNull(i)) return false;
            var v = r.GetValue(i);
            if (v is bool) return (bool)v;
            return Convert.ToInt64(v) != 0;
        }

        /// <summary>Identifier guard. Anything that is not a plain identifier never reaches SQL text —
        /// schema/table cannot be parameterised inside OBJECT_ID('…') without this.</summary>
        public static bool IsSafeIdent(string s)
        {
            if (string.IsNullOrEmpty(s) || s.Length > 128) return false;
            if (!char.IsLetter(s[0]) && s[0] != '_') return false;
            for (int i = 1; i < s.Length; i++)
                if (!char.IsLetterOrDigit(s[i]) && s[i] != '_') return false;
            return true;
        }

        public static string Qualify(string schema, string table)
        {
            return "[" + schema + "].[" + table + "]";
        }

        private T Try<T>(string probeName, Func<T> body, T fallback)
        {
            try { return body(); }
            catch (Exception ex)
            {
                Failures.Add(probeName + ": " + ex.GetType().Name);
                return fallback;
            }
        }

        // ------------------------------------------------------------------ P0 object resolution

        /// <summary>Resolves schema + object type, and refuses to guess when the name is ambiguous.</summary>
        public ObjectFacts ResolveObject(string schema, string table)
        {
            var o = new ObjectFacts { Schema = schema, Name = table, Type = "UNKNOWN" };
            if (!IsSqlServer)
            {
                o.Schema = schema ?? string.Empty;
                o.Type = "BASE_TABLE";
                return o;
            }

            var rows = Try("P0.object", () =>
            {
                var list = new List<KeyValuePair<string, string>>();
                using (var c = Cmd("SELECT s.name, o.type_desc FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.name = @t AND o.type IN ('U','V','SN')"))
                {
                    Param(c, "@t", table);
                    using (var r = c.ExecuteReader())
                        while (r.Read()) list.Add(new KeyValuePair<string, string>(S(r, 0), S(r, 1)));
                }
                return list;
            }, new List<KeyValuePair<string, string>>());

            if (rows.Count == 0)
            {
                o.Type = "UNKNOWN";
                return o;
            }

            var matches = string.IsNullOrEmpty(schema)
                ? rows
                : rows.Where(x => string.Equals(x.Key, schema, StringComparison.OrdinalIgnoreCase)).ToList();

            if (string.IsNullOrEmpty(schema) && rows.Count > 1)
            {
                // Two tables, same name, different schemas. Guessing here would silently bind the
                // form to the wrong table — the admin has to say which.
                o.SchemaCollision = true;
                o.CollidingSchemas = rows.Select(x => x.Key).Distinct().ToList();
                return o;
            }

            if (matches.Count == 0) { o.Type = "UNKNOWN"; return o; }

            o.Schema = matches[0].Key;
            var td = (matches[0].Value ?? string.Empty).ToUpperInvariant();
            o.Type = td.Contains("VIEW") ? "VIEW" : td.Contains("SYNONYM") ? "SYNONYM" : "BASE_TABLE";
            return o;
        }

        // ------------------------------------------------------------------ P1 environment

        public ConnectionFacts ReadEnvironment()
        {
            var f = new ConnectionFacts { Provider = Provider.ToString() };
            if (!IsSqlServer)
            {
                try { f.ProductVersion = _conn.ServerVersion; } catch { }
                return f;
            }

            return Try("P1.environment", () =>
            {
                using (var c = Cmd(@"
SELECT CAST(SERVERPROPERTY('EngineEdition') AS int),
       CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)),
       CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS nvarchar(128)),
       CAST(DATABASEPROPERTYEX(DB_NAME(),'Updateability') AS nvarchar(32)),
       IS_ROLEMEMBER('db_owner'),
       CASE WHEN 'a' = 'A' THEN 1 ELSE 0 END"))
                using (var r = c.ExecuteReader())
                {
                    if (r.Read())
                    {
                        f.EngineEdition = I(r, 0);
                        f.ProductVersion = S(r, 1);
                        f.DbCollation = S(r, 2);
                        f.Updateability = (S(r, 3) ?? "READ_WRITE").ToUpperInvariant();
                        f.IsDbOwner = B(r, 4);
                        f.CaseInsensitive = B(r, 5);
                    }
                }
                return f;
            }, f);
        }

        // ------------------------------------------------------------------ P2 permissions

        /// <summary>Catalog-only. We never probe DDL rights by attempting DDL.</summary>
        public PermissionFacts ReadPermissions(string schema, string table)
        {
            var p = new PermissionFacts();
            if (!IsSqlServer)
            {
                // Non-SqlServer: we cannot prove anything, so we claim nothing beyond SELECT.
                p.Select = true;
                p.Source = "assumed";
                return p;
            }

            return Try("P2.permissions", () =>
            {
                using (var c = Cmd(@"
SELECT HAS_PERMS_BY_NAME(@q,'OBJECT','SELECT'),
       HAS_PERMS_BY_NAME(@q,'OBJECT','INSERT'),
       HAS_PERMS_BY_NAME(@q,'OBJECT','UPDATE'),
       HAS_PERMS_BY_NAME(@q,'OBJECT','DELETE')"))
                {
                    Param(c, "@q", Qualify(schema, table));
                    using (var r = c.ExecuteReader())
                    {
                        if (r.Read())
                        {
                            p.Select = B(r, 0); p.Insert = B(r, 1); p.Update = B(r, 2); p.Delete = B(r, 3);
                            p.Source = "catalog";
                        }
                    }
                }
                return p;
            }, p);
        }

        // ------------------------------------------------------------------ P3 columns (L2 → L1 → L0)

        /// <summary>Returns raw column facts and reports which tier answered.</summary>
        public List<ColumnFacts> ReadColumns(string schema, string table, out string level)
        {
            if (IsSqlServer)
            {
                var l2 = Try("P3.columns.L2", () => ReadColumnsL2(schema, table), null);
                if (l2 != null && l2.Count > 0) { level = "L2"; return l2; }

                var l1 = Try("P3.columns.L1", () => ReadColumnsL1(schema, table), null);
                if (l1 != null && l1.Count > 0) { level = "L1"; return l1; }
            }

            var l0 = Try("P3.columns.L0", () => ReadColumnsL0(schema, table), null);
            if (l0 != null && l0.Count > 0) { level = "L0"; return l0; }

            level = "L-1";
            return new List<ColumnFacts>();
        }

        private List<ColumnFacts> ReadColumnsL2(string schema, string table)
        {
            var cols = new List<ColumnFacts>();
            using (var c = Cmd(@"
SELECT c.name, c.column_id, ty.name AS sql_type, c.max_length, c.precision, c.scale,
       c.is_nullable, c.is_identity, c.is_computed, c.collation_name, c.encryption_type,
       dc.definition AS default_expr,
       CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_pk, ISNULL(pk.key_ordinal, 0)
FROM sys.columns c
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc
       ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
LEFT JOIN (SELECT ic.object_id, ic.column_id, ic.key_ordinal
           FROM sys.index_columns ic
           JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
           WHERE i.is_primary_key = 1) pk
       ON pk.object_id = c.object_id AND pk.column_id = c.column_id
WHERE c.object_id = OBJECT_ID(@q)
ORDER BY c.column_id"))
            {
                Param(c, "@q", Qualify(schema, table));
                using (var r = c.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var sqlType = (S(r, 2) ?? string.Empty).ToLowerInvariant();
                        int maxLenBytes = I(r, 3);
                        var col = new ColumnFacts
                        {
                            Name = S(r, 0),
                            Ordinal = I(r, 1),
                            SqlType = sqlType,
                            Precision = I(r, 4),
                            Scale = I(r, 5),
                            Nullable = B(r, 6),
                            IsIdentity = B(r, 7),
                            IsComputed = B(r, 8),
                            IsEncrypted = !r.IsDBNull(10),
                            DefaultExpr = S(r, 11),
                            IsPrimaryKey = B(r, 12),
                        };
                        col.IsRowVersion = sqlType == "timestamp" || sqlType == "rowversion";
                        col.HasDefault = !string.IsNullOrEmpty(col.DefaultExpr);
                        col.DefaultKind = ClassifyDefault(col.DefaultExpr);
                        ApplyLength(col, maxLenBytes, /*inChars*/ false);
                        cols.Add(col);
                    }
                }
            }
            return cols;
        }

        private List<ColumnFacts> ReadColumnsL1(string schema, string table)
        {
            var cols = new List<ColumnFacts>();
            using (var c = Cmd(@"
SELECT COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH,
       NUMERIC_PRECISION, NUMERIC_SCALE, COLUMN_DEFAULT,
       COLUMNPROPERTY(OBJECT_ID(@q), COLUMN_NAME, 'IsIdentity'),
       COLUMNPROPERTY(OBJECT_ID(@q), COLUMN_NAME, 'IsComputed')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @s AND TABLE_NAME = @t
ORDER BY ORDINAL_POSITION"))
            {
                Param(c, "@q", Qualify(schema, table));
                Param(c, "@s", schema);
                Param(c, "@t", table);
                using (var r = c.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var sqlType = (S(r, 2) ?? string.Empty).ToLowerInvariant();
                        var col = new ColumnFacts
                        {
                            Name = S(r, 0),
                            Ordinal = I(r, 1),
                            SqlType = sqlType,
                            Nullable = string.Equals(S(r, 3), "YES", StringComparison.OrdinalIgnoreCase),
                            Precision = I(r, 5),
                            Scale = I(r, 6),
                            DefaultExpr = S(r, 7),
                            IsIdentity = I(r, 8) == 1,
                            IsComputed = I(r, 9) == 1,
                        };
                        col.IsRowVersion = sqlType == "timestamp" || sqlType == "rowversion";
                        col.HasDefault = !string.IsNullOrEmpty(col.DefaultExpr);
                        col.DefaultKind = ClassifyDefault(col.DefaultExpr);
                        ApplyLength(col, r.IsDBNull(4) ? 0 : Convert.ToInt32(r.GetValue(4)), /*inChars*/ true);
                        cols.Add(col);
                    }
                }
            }
            return cols;
        }

        /// <summary>Last resort: ask the reader itself. Loses COLUMN_DEFAULT entirely, which is why the
        /// caller must then treat every NOT NULL column as required.</summary>
        private List<ColumnFacts> ReadColumnsL0(string schema, string table)
        {
            var cols = new List<ColumnFacts>();
            var qual = Provider == SqlSchemaReader.ProviderKind.Sqlite
                ? "\"" + table + "\""
                : Qualify(schema, table);

            using (var c = Cmd("SELECT TOP 0 * FROM " + qual))
            {
                if (Provider != SqlSchemaReader.ProviderKind.SqlServer)
                    c.CommandText = "SELECT * FROM " + qual + " WHERE 1=0";

                using (var r = c.ExecuteReader(CommandBehavior.SchemaOnly | CommandBehavior.KeyInfo))
                {
                    var t = r.GetSchemaTable();
                    if (t == null) return cols;
                    int ord = 0;
                    foreach (DataRow row in t.Rows)
                    {
                        ord++;
                        var col = new ColumnFacts
                        {
                            Name = Convert.ToString(row["ColumnName"]),
                            Ordinal = ord,
                            SqlType = Convert.ToString(row["DataTypeName"] is DBNull ? "" : row["DataTypeName"]).ToLowerInvariant(),
                            Nullable = row["AllowDBNull"] is DBNull || Convert.ToBoolean(row["AllowDBNull"]),
                            IsIdentity = !(row["IsAutoIncrement"] is DBNull) && Convert.ToBoolean(row["IsAutoIncrement"]),
                            IsPrimaryKey = !(row["IsKey"] is DBNull) && Convert.ToBoolean(row["IsKey"]),
                            Precision = row["NumericPrecision"] is DBNull ? 0 : Convert.ToInt32(row["NumericPrecision"]),
                            Scale = row["NumericScale"] is DBNull ? 0 : Convert.ToInt32(row["NumericScale"]),
                        };
                        // IsReadOnly conflates computed + rowversion; both must stay out of INSERT.
                        var ro = !(row["IsReadOnly"] is DBNull) && Convert.ToBoolean(row["IsReadOnly"]);
                        col.IsComputed = ro && !col.IsIdentity;
                        col.IsRowVersion = col.SqlType == "timestamp" || col.SqlType == "rowversion";
                        col.HasDefault = false;      // unknowable at L0
                        col.DefaultKind = "none";
                        int size = row["ColumnSize"] is DBNull ? 0 : Convert.ToInt32(row["ColumnSize"]);
                        ApplyLength(col, size, /*inChars*/ true);
                        cols.Add(col);
                    }
                }
            }
            return cols;
        }

        /// <summary>max_length from sys.columns is BYTES (nvarchar counts double) while
        /// INFORMATION_SCHEMA counts CHARACTERS. -1 means MAX ⇒ null, never 0 and never -1:
        /// 0 rejects every string in the server validator, -1 rejects every string in the client one.</summary>
        private static void ApplyLength(ColumnFacts col, int raw, bool inChars)
        {
            var t = col.SqlType ?? string.Empty;
            bool isText = t.Contains("char") || t.Contains("text");
            bool isBinary = t.Contains("binary") || t == "image";

            if (!isText && !isBinary) { col.MaxLengthChars = null; return; }

            if (raw == -1 || (isText && raw > 1000000))
            {
                col.IsLob = true;
                col.MaxLengthChars = null;
                return;
            }
            if (raw <= 0) { col.MaxLengthChars = null; return; }

            int chars = raw;
            if (!inChars && (t.StartsWith("n", StringComparison.Ordinal))) chars = raw / 2;   // nchar/nvarchar: bytes → chars
            col.MaxLengthChars = chars;
            col.IsLob = false;
        }

        private static string ClassifyDefault(string expr)
        {
            if (string.IsNullOrEmpty(expr)) return "none";
            var e = expr.ToLowerInvariant();
            if (e.Contains("getdate") || e.Contains("getutcdate") || e.Contains("sysdatetime")
                || e.Contains("sysutcdatetime") || e.Contains("newid") || e.Contains("newsequentialid")
                || e.Contains("next value for") || e.Contains("current_timestamp") || e.Contains("suser_")
                || e.Contains("current_user") || e.Contains("host_name") || e.Contains("app_name"))
                return "function";
            return "literal";
        }

        // ------------------------------------------------------------------ P4/P5 keys

        public List<KeyColumn> ReadPrimaryKey(string schema, string table, List<ColumnFacts> cols)
        {
            var fromCols = cols
                .Where(c => c.IsPrimaryKey)
                .Select(c => new KeyColumn { Name = c.Name, SqlType = c.SqlType })
                .ToList();
            if (fromCols.Count > 0)
            {
                for (int i = 0; i < fromCols.Count; i++) fromCols[i].KeyOrdinal = i + 1;
                return fromCols;
            }

            if (!IsSqlServer) return new List<KeyColumn>();

            return Try("P4.pk", () =>
            {
                var list = new List<KeyColumn>();
                using (var c = Cmd(@"
SELECT kcu.COLUMN_NAME, kcu.ORDINAL_POSITION
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
 AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = @s AND tc.TABLE_NAME = @t
ORDER BY kcu.ORDINAL_POSITION"))
                {
                    Param(c, "@s", schema); Param(c, "@t", table);
                    using (var r = c.ExecuteReader())
                        while (r.Read())
                        {
                            var name = S(r, 0);
                            var col = cols.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
                            list.Add(new KeyColumn { Name = name, KeyOrdinal = I(r, 1), SqlType = col != null ? col.SqlType : null });
                        }
                }
                foreach (var k in list)
                {
                    var col = cols.FirstOrDefault(x => string.Equals(x.Name, k.Name, StringComparison.OrdinalIgnoreCase));
                    if (col != null) col.IsPrimaryKey = true;
                }
                return list;
            }, new List<KeyColumn>());
        }

        /// <summary>Unique indexes usable as a logical key when there is no PK. Filtered and disabled
        /// indexes are excluded — they do not guarantee uniqueness over the rows we will address.</summary>
        public List<List<KeyColumn>> ReadUniqueKeys(string schema, string table, List<ColumnFacts> cols)
        {
            if (!IsSqlServer) return new List<List<KeyColumn>>();

            return Try("P5.unique", () =>
            {
                var byIndex = new Dictionary<string, List<KeyColumn>>(StringComparer.OrdinalIgnoreCase);
                using (var c = Cmd(@"
SELECT i.name, c.name AS col, ic.key_ordinal, c.is_nullable
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID(@q)
  AND i.is_unique = 1 AND i.is_primary_key = 0
  AND i.has_filter = 0 AND i.is_disabled = 0 AND ic.is_included_column = 0
ORDER BY i.index_id, ic.key_ordinal"))
                {
                    Param(c, "@q", Qualify(schema, table));
                    using (var r = c.ExecuteReader())
                        while (r.Read())
                        {
                            var idx = S(r, 0);
                            var colName = S(r, 1);
                            if (B(r, 3)) continue;   // a NULLable column cannot address a row reliably
                            if (!byIndex.ContainsKey(idx)) byIndex[idx] = new List<KeyColumn>();
                            var col = cols.FirstOrDefault(x => string.Equals(x.Name, colName, StringComparison.OrdinalIgnoreCase));
                            byIndex[idx].Add(new KeyColumn { Name = colName, KeyOrdinal = I(r, 2), SqlType = col != null ? col.SqlType : null });
                        }
                }
                // Deterministic choice order: fewest columns, then name. Never AI, never random.
                return byIndex.Values
                    .Where(v => v.Count > 0)
                    .OrderBy(v => v.Count)
                    .ThenBy(v => string.Join(",", v.Select(k => k.Name)))
                    .ToList();
            }, new List<List<KeyColumn>>());
        }

        /// <summary>Samples the table to prove the key is actually unique and non-null.
        /// A PK constraint guarantees this; a heuristic key does not, and a view guarantees nothing.</summary>
        public KeyVerification VerifyKey(string schema, string table, List<KeyColumn> key, int sample = 200000)
        {
            var v = new KeyVerification();
            if (!IsSqlServer || key == null || key.Count == 0) return v;
            foreach (var k in key) if (!IsSafeIdent(k.Name)) return v;

            return Try("P6.keyVerify", () =>
            {
                var cols = string.Join(", ", key.Select(k => "[" + k.Name + "]"));
                var concat = key.Count == 1
                    ? "CAST([" + key[0].Name + "] AS nvarchar(400))"
                    : "CONCAT(" + string.Join(", CHAR(31), ", key.Select(k => "CAST([" + k.Name + "] AS nvarchar(400))")) + ")";
                var nulls = string.Join(" + ", key.Select(k => "CASE WHEN [" + k.Name + "] IS NULL THEN 1 ELSE 0 END"));

                using (var c = Cmd(
                    "SELECT COUNT_BIG(*), COUNT_BIG(DISTINCT " + concat + "), SUM(CAST((" + nulls + ") AS bigint)) " +
                    "FROM (SELECT TOP (" + sample + ") " + cols + " FROM " + Qualify(schema, table) + ") z"))
                using (var r = c.ExecuteReader())
                {
                    if (r.Read())
                    {
                        v.Sampled = L(r, 0);
                        v.Duplicates = v.Sampled - L(r, 1);
                        v.Nulls = L(r, 2);
                        v.Ran = true;
                    }
                }
                return v;
            }, v);
        }

        // ------------------------------------------------------------------ P7 triggers

        public void ReadTriggers(string schema, string table, ObjectFacts obj)
        {
            if (!IsSqlServer) { obj.TriggerKnowledge = "unknown"; return; }

            var ok = Try("P7.triggers", () =>
            {
                using (var c = Cmd("SELECT name, is_instead_of_trigger, is_disabled FROM sys.triggers WHERE parent_id = OBJECT_ID(@q)"))
                {
                    Param(c, "@q", Qualify(schema, table));
                    using (var r = c.ExecuteReader())
                        while (r.Read())
                        {
                            if (B(r, 2)) continue;                 // disabled
                            if (B(r, 1)) obj.HasInsteadOfTrigger = true;
                            else obj.AfterTriggers.Add(S(r, 0));
                        }
                }
                return true;
            }, false);

            obj.TriggerKnowledge = ok ? "known" : "unknown";
        }

        // ------------------------------------------------------------------ P8 foreign keys

        public void ReadForeignKeys(string schema, string table, List<ColumnFacts> cols, RelationFacts rel)
        {
            if (!IsSqlServer) return;

            Try("P8.fk", () =>
            {
                using (var c = Cmd(@"
SELECT OBJECT_SCHEMA_NAME(fk.parent_object_id)     AS childSchema,
       OBJECT_NAME(fk.parent_object_id)            AS childTable,
       pc.name                                     AS childCol,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parentSchema,
       OBJECT_NAME(fk.referenced_object_id)        AS parentTable,
       rc.name                                     AS parentCol,
       fk.delete_referential_action_desc           AS onDelete,
       CASE WHEN fk.parent_object_id = OBJECT_ID(@q) THEN 1 ELSE 0 END AS outbound
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id     AND pc.column_id = fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
WHERE fk.parent_object_id = OBJECT_ID(@q) OR fk.referenced_object_id = OBJECT_ID(@q)"))
                {
                    Param(c, "@q", Qualify(schema, table));
                    using (var r = c.ExecuteReader())
                        while (r.Read())
                        {
                            bool outbound = I(r, 7) == 1;
                            if (outbound)
                            {
                                var childCol = S(r, 2);
                                var fk = new ColumnFk
                                {
                                    RefSchema = S(r, 3),
                                    RefTable = S(r, 4),
                                    RefColumn = S(r, 5),
                                    OnDelete = S(r, 6),
                                    Source = "catalog",
                                    Confidence = 1.0,
                                };
                                rel.Outbound.Add(fk);
                                var col = cols.FirstOrDefault(x => string.Equals(x.Name, childCol, StringComparison.OrdinalIgnoreCase));
                                if (col != null) col.Fk = fk;
                            }
                            else
                            {
                                rel.Inbound.Add(new InboundFk
                                {
                                    ChildSchema = S(r, 0),
                                    ChildTable = S(r, 1),
                                    ChildColumn = S(r, 2),
                                    OnDelete = S(r, 6),
                                });
                            }
                        }
                }
                return true;
            }, false);
        }

        /// <summary>How big is the table behind each FK, and what column would a human recognise?
        /// A lookup into a 500k-row table is not a dropdown — knowing the size is what stops the
        /// designer from proposing one.</summary>
        public void EnrichForeignKeys(RelationFacts rel)
        {
            if (!IsSqlServer) return;

            foreach (var fk in rel.Outbound)
            {
                if (!IsSafeIdent(fk.RefTable) || !IsSafeIdent(fk.RefSchema)) continue;
                var qual = Qualify(fk.RefSchema, fk.RefTable);

                fk.ParentApproxRows = Try<long>("P8.parentRows." + fk.RefTable, () =>
                {
                    using (var c = Cmd("SELECT ISNULL(SUM(ps.row_count),0) FROM sys.dm_db_partition_stats ps WHERE ps.object_id = OBJECT_ID(@q) AND ps.index_id IN (0,1)"))
                    {
                        Param(c, "@q", qual);
                        var v = c.ExecuteScalar();
                        return v == null || v is DBNull ? 0L : Convert.ToInt64(v);
                    }
                }, 0L);

                fk.ParentLabelColumn = Try<string>("P8.parentLabel." + fk.RefTable, () =>
                {
                    using (var c = Cmd(@"
SELECT TOP 1 c.name
FROM sys.columns c
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(@q) AND c.is_identity = 0 AND c.is_computed = 0
  AND ty.name IN ('nvarchar','varchar','nchar','char')
ORDER BY CASE WHEN c.name IN ('Name','Title','Label','Description','DisplayName') THEN 0 ELSE 1 END, c.column_id"))
                    {
                        Param(c, "@q", qual);
                        var v = c.ExecuteScalar();
                        return v == null || v is DBNull ? null : Convert.ToString(v);
                    }
                }, null);
            }
        }

        // ------------------------------------------------------------------ P9 indexes + full-text

        public List<IndexFacts> ReadIndexes(string schema, string table)
        {
            if (!IsSqlServer) return new List<IndexFacts>();

            return Try("P9.indexes", () =>
            {
                var map = new Dictionary<string, IndexFacts>(StringComparer.OrdinalIgnoreCase);
                using (var c = Cmd(@"
SELECT i.name, i.is_unique, i.is_primary_key, i.has_filter, i.is_disabled,
       c.name AS col, ic.key_ordinal, ic.is_included_column
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID(@q) AND i.type > 0
ORDER BY i.index_id, ic.is_included_column, ic.key_ordinal"))
                {
                    Param(c, "@q", Qualify(schema, table));
                    using (var r = c.ExecuteReader())
                        while (r.Read())
                        {
                            var name = S(r, 0) ?? "(heap)";
                            IndexFacts f;
                            if (!map.TryGetValue(name, out f))
                            {
                                f = new IndexFacts
                                {
                                    Name = name,
                                    Unique = B(r, 1),
                                    PrimaryKey = B(r, 2),
                                    Filtered = B(r, 3),
                                    Disabled = B(r, 4),
                                };
                                map[name] = f;
                            }
                            if (B(r, 7)) f.Included.Add(S(r, 5));
                            else
                            {
                                f.KeyColumns.Add(S(r, 5));
                                if (I(r, 6) == 1) f.Leading = S(r, 5);
                            }
                        }
                }
                return map.Values.ToList();
            }, new List<IndexFacts>());
        }

        public FullTextFacts ReadFullText(string schema, string table)
        {
            var ft = new FullTextFacts();
            if (!IsSqlServer) return ft;

            return Try("P9.fulltext", () =>
            {
                using (var c = Cmd(@"
SELECT c.name FROM sys.fulltext_index_columns f
JOIN sys.columns c ON c.object_id = f.object_id AND c.column_id = f.column_id
WHERE f.object_id = OBJECT_ID(@q)"))
                {
                    Param(c, "@q", Qualify(schema, table));
                    using (var r = c.ExecuteReader())
                        while (r.Read()) ft.Columns.Add(S(r, 0));
                }
                ft.Enabled = ft.Columns.Count > 0;
                return ft;
            }, ft);
        }

        // ------------------------------------------------------------------ P10/P11 size

        /// <summary>Row count without scanning: catalog stats first, then a bounded count that can
        /// never cost more than reading 2M rows. A timeout means XL — we assume big, not small.</summary>
        public SizeFacts ReadSize(string schema, string table, bool isView)
        {
            var s = new SizeFacts { Bucket = "XL", RowsSource = "unknown" };

            if (IsSqlServer && !isView)
            {
                var approx = Try<long?>("P10.partitionStats", () =>
                {
                    using (var c = Cmd(@"
SELECT SUM(ps.row_count) FROM sys.dm_db_partition_stats ps
WHERE ps.object_id = OBJECT_ID(@q) AND ps.index_id IN (0,1)"))
                    {
                        Param(c, "@q", Qualify(schema, table));
                        var v = c.ExecuteScalar();
                        if (v == null || v is DBNull) return null;
                        return Convert.ToInt64(v);
                    }
                }, null);

                if (approx.HasValue)
                {
                    s.ApproxRows = approx.Value;
                    s.RowsSource = "dm_db_partition_stats";
                    s.Bucket = BucketOf(s.ApproxRows);
                    return s;
                }
            }

            var bounded = Try<long?>("P10.bounded", () =>
            {
                using (var c = Cmd("SELECT COUNT(*) FROM (SELECT TOP (2000001) 1 AS x FROM " + Qualify(schema, table) + ") z"))
                {
                    var v = c.ExecuteScalar();
                    return v == null || v is DBNull ? (long?)null : Convert.ToInt64(v);
                }
            }, null);

            if (bounded.HasValue)
            {
                s.ApproxRows = bounded.Value;
                s.RowsSource = "bounded";
                s.Bucket = bounded.Value >= 2000001 ? "XL" : BucketOf(bounded.Value);
            }
            return s;
        }

        private static string BucketOf(long rows)
        {
            if (rows < 50000) return "S";
            if (rows <= 2000000) return "M";
            return "XL";
        }

        /// <summary>Times a real COUNT(*). If it cannot finish inside the budget we record that fact
        /// once and never pay for it again — the dashboard then shows a bounded count instead.</summary>
        public void MeasureExactCount(string schema, string table, SizeFacts size, int budgetSec = 3)
        {
            if (size.Bucket == "XL") { size.ExactCountAllowed = false; return; }

            var started = DateTime.UtcNow;
            var ok = Try("P11.exactCount", () =>
            {
                using (var c = _conn.CreateCommand())
                {
                    c.CommandText = "SELECT COUNT_BIG(*) FROM " + Qualify(schema, table);
                    try { c.CommandTimeout = budgetSec; } catch { }
                    c.ExecuteScalar();
                }
                return true;
            }, false);

            size.CountMs = (int)(DateTime.UtcNow - started).TotalMilliseconds;
            size.ExactCountAllowed = ok;
        }

        // ------------------------------------------------------------------ P12 CHECK → enum

        /// <summary>Only two constraint shapes are simulated: IN (...) and a chain of OR equalities.
        /// Anything else stays un-modelled — a wrong client-side rule would reject the customer's own
        /// valid data, so we let the server error speak instead.</summary>
        public void ReadCheckEnums(string schema, string table, List<ColumnFacts> cols)
        {
            if (!IsSqlServer) return;

            Try("P12.check", () =>
            {
                using (var c = Cmd(@"
SELECT col.name, cc.definition
FROM sys.check_constraints cc
JOIN sys.columns col ON col.object_id = cc.parent_object_id AND col.column_id = cc.parent_column_id
WHERE cc.parent_object_id = OBJECT_ID(@q) AND cc.is_disabled = 0"))
                {
                    Param(c, "@q", Qualify(schema, table));
                    using (var r = c.ExecuteReader())
                        while (r.Read())
                        {
                            var colName = S(r, 0);
                            var def = S(r, 1);
                            var values = ParseCheckEnum(def);
                            if (values.Count == 0) continue;
                            var col = cols.FirstOrDefault(x => string.Equals(x.Name, colName, StringComparison.OrdinalIgnoreCase));
                            if (col == null) continue;
                            col.Enum = new ColumnEnum { Source = "check", Values = values, MembershipEnforced = true };
                        }
                }
                return true;
            }, false);
        }

        internal static List<string> ParseCheckEnum(string definition)
        {
            var vals = new List<string>();
            if (string.IsNullOrEmpty(definition)) return vals;

            // Both shapes reduce to: collect every N'…' / '…' literal in the expression.
            // We only accept it when the expression contains no arithmetic/range operators, so
            // ([Age] > 5 AND [Age] < 9) never masquerades as an enum.
            var d = definition;
            if (d.IndexOf('<') >= 0 || d.IndexOf('>') >= 0 || d.IndexOf("LIKE", StringComparison.OrdinalIgnoreCase) >= 0)
                return vals;

            bool looksEnum = d.IndexOf(" IN ", StringComparison.OrdinalIgnoreCase) >= 0 || d.IndexOf('=') >= 0;
            if (!looksEnum) return vals;

            int i = 0;
            while (i < d.Length)
            {
                if (d[i] == '\'')
                {
                    int j = i + 1;
                    var sb = new System.Text.StringBuilder();
                    while (j < d.Length)
                    {
                        if (d[j] == '\'' && j + 1 < d.Length && d[j + 1] == '\'') { sb.Append('\''); j += 2; continue; }
                        if (d[j] == '\'') break;
                        sb.Append(d[j]); j++;
                    }
                    vals.Add(sb.ToString());
                    i = j + 1;
                    continue;
                }
                i++;
            }
            return vals.Distinct().ToList();
        }

        // ------------------------------------------------------------------ P15 file column sniff

        /// <summary>Looks at what a suspected file column actually CONTAINS. A column called
        /// AttachmentPath can hold a relative path, an absolute URL, a JSON array, or a
        /// semicolon-separated list — each needs a different write mode, and guessing from the name
        /// alone would corrupt the customer's data on the first submit.</summary>
        public string SniffFileValueMode(string schema, string table, string column)
        {
            if (!IsSqlServer || !IsSafeIdent(column)) return null;

            return Try<string>("P15.fileSniff." + column, () =>
            {
                using (var c = Cmd(@"
;WITH s AS (SELECT TOP (500) CAST([" + column + @"] AS nvarchar(4000)) AS v
            FROM " + Qualify(schema, table) + @"
            WHERE [" + column + @"] IS NOT NULL AND LEN(CAST([" + column + @"] AS nvarchar(4000))) > 0)
SELECT COUNT(*),
  SUM(CASE WHEN LEFT(LTRIM(v),1) IN ('[','{') THEN 1 ELSE 0 END),
  SUM(CASE WHEN v LIKE 'http://%' OR v LIKE 'https://%' THEN 1 ELSE 0 END),
  SUM(CASE WHEN v LIKE '%;%' OR v LIKE '%|%' THEN 1 ELSE 0 END)
FROM s"))
                using (var r = c.ExecuteReader())
                {
                    if (!r.Read()) return null;
                    long sampled = L(r, 0);
                    if (sampled == 0) return "filePath";      // empty column: the safest assumption
                    long json = L(r, 1), url = L(r, 2), multi = L(r, 3);

                    if (json * 2 > sampled) return "fileJson";
                    if (url * 2 > sampled) return "fileUrl";
                    if (multi * 2 > sampled) return "filePathList";
                    return "filePath";
                }
            }, null);
        }

        // ------------------------------------------------------------------ P12b distinct sampling

        /// <summary>Low-cardinality sampling for tables whose "status" column has no CHECK constraint.
        /// Membership is NEVER enforced from this — a value that is simply rare would be rejected.</summary>
        public List<string> SampleDistinct(string schema, string table, string column, int max = 26, int sampleRows = 5000)
        {
            if (!IsSqlServer || !IsSafeIdent(column)) return null;

            return Try<List<string>>("P12b.distinct." + column, () =>
            {
                var vals = new List<string>();
                using (var c = Cmd(
                    "SELECT TOP (" + max + ") v FROM (SELECT TOP (" + sampleRows + ") [" + column + "] AS v FROM " +
                    Qualify(schema, table) + " WHERE [" + column + "] IS NOT NULL) x GROUP BY v ORDER BY COUNT_BIG(*) DESC"))
                using (var r = c.ExecuteReader())
                    while (r.Read()) vals.Add(S(r, 0));
                return vals;
            }, null);
        }
    }
}
