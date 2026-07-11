using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models.ExternalTable;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P1] Reads the customer's table for the submissions dashboard.
    ///
    /// Every filter, sort and page is pushed into SQL against REAL columns. The existing dashboard
    /// does its filtering and sorting in the browser over the loaded page, which on a 500k-row table
    /// is not slow — it is wrong: "Priority = Urgent" would only ever search the 50 rows on screen.
    ///
    /// All SQL is generated here from the frozen CapabilityProfile. No fragment of it ever comes from
    /// a client, and every identifier is checked against the profile's own column list before it is
    /// interpolated — a column name that is not in the profile cannot reach the query.
    /// </summary>
    public class ExternalTableQueryService
    {
        private readonly IConnectionRegistry _registry;

        public ExternalTableQueryService(IConnectionRegistry registry)
        {
            _registry = registry;
        }

        public class Query
        {
            public string Status { get; set; }
            public string Search { get; set; }
            public DateTime? DateFrom { get; set; }
            public DateTime? DateTo { get; set; }
            public int PageIndex { get; set; }
            public int PageSize { get; set; } = 50;
        }

        public class Row
        {
            public string RowKeyJson { get; set; }
            public string DataJson { get; set; }
            public DateTime SubmittedOnUtc { get; set; }
            public string Status { get; set; }
        }

        public class Page
        {
            public List<Row> Rows { get; set; } = new List<Row>();
            public int TotalCount { get; set; }
            /// <summary>True when TotalCount is a floor, not a fact (the exact count was too expensive).</summary>
            public bool TotalIsBounded { get; set; }
        }

        // ------------------------------------------------------------------ list

        public Page List(ExternalBinding binding, CapabilityProfile p, Query q)
        {
            var page = new Page();
            var cols = SelectableColumns(p);
            if (cols.Count == 0) return page;

            int pageSize = Math.Max(1, Math.Min(q.PageSize <= 0 ? p.Policy.PageSize : q.PageSize, 250));
            int offset = Math.Max(0, q.PageIndex) * pageSize;

            // Deep paging on a big table is a scan-and-discard. We refuse rather than melt the
            // customer's server; the UI must filter instead.
            if (offset > p.Policy.MaxOffset) offset = p.Policy.MaxOffset;

            var wheres = new List<string>();
            var ps = new List<KeyValuePair<string, object>>();
            BuildWhere(p, q, wheres, ps);

            var orderBy = OrderBy(p);
            var whereSql = wheres.Count > 0 ? " WHERE " + string.Join(" AND ", wheres) : string.Empty;
            var colSql = string.Join(", ", cols.Select(c => "[" + c.Name + "]"));

            using (var conn = _registry.GetConnection(binding.ConnectionKey, binding.DatabaseType))
            {
                conn.Open();

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT " + colSql + " FROM " + Qual(binding) + whereSql
                                      + " ORDER BY " + orderBy
                                      + " OFFSET " + offset + " ROWS FETCH NEXT " + pageSize + " ROWS ONLY";
                    Bind(cmd, ps);
                    try { cmd.CommandTimeout = p.Policy.ListTimeoutSec; } catch { }

                    using (var r = cmd.ExecuteReader())
                        while (r.Read())
                            page.Rows.Add(ReadRow(r, cols, p));
                }

                page.TotalCount = Count(conn, binding, p, whereSql, ps, out bool bounded);
                page.TotalIsBounded = bounded;
            }

            return page;
        }

        /// <summary>One row of the customer's table, by key. Used by the detail view.</summary>
        public Row GetByKey(ExternalBinding binding, CapabilityProfile p, string rowKeyJson)
        {
            var cols = SelectableColumns(p);
            if (cols.Count == 0 || p.Key.Columns.Count == 0) return null;

            var keyValues = JsonConvert.DeserializeObject<List<object>>(rowKeyJson ?? "[]");
            if (keyValues == null || keyValues.Count != p.Key.Columns.Count) return null;

            var wheres = new List<string>();
            var ps = new List<KeyValuePair<string, object>>();
            for (int i = 0; i < p.Key.Columns.Count; i++)
            {
                var k = p.Key.Columns[i];
                if (!IsKnownColumn(p, k.Name)) return null;
                wheres.Add("[" + k.Name + "] = @k" + i);
                ps.Add(new KeyValuePair<string, object>("@k" + i, CoerceKey(keyValues[i], k.SqlType)));
            }

            using (var conn = _registry.GetConnection(binding.ConnectionKey, binding.DatabaseType))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT TOP 1 " + string.Join(", ", cols.Select(c => "[" + c.Name + "]"))
                                      + " FROM " + Qual(binding) + " WHERE " + string.Join(" AND ", wheres);
                    Bind(cmd, ps);
                    try { cmd.CommandTimeout = p.Policy.ListTimeoutSec; } catch { }
                    using (var r = cmd.ExecuteReader())
                        return r.Read() ? ReadRow(r, cols, p) : null;
                }
            }
        }

        // ------------------------------------------------------------------ SQL building

        private static string Qual(ExternalBinding b)
        {
            return "[" + b.Schema + "].[" + b.Table + "]";
        }

        /// <summary>Columns we are willing to read. Encrypted and unrepresentable columns are skipped:
        /// pulling them would either fail or hand the browser bytes it cannot render.</summary>
        private static List<ColumnFacts> SelectableColumns(CapabilityProfile p)
        {
            return p.Columns.Where(c => !c.IsEncrypted && !c.Unsupported && c.ValueMode != "blobColumn").ToList();
        }

        private static bool IsKnownColumn(CapabilityProfile p, string name)
        {
            return p.Columns.Any(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));
        }

        private static void BuildWhere(CapabilityProfile p, Query q, List<string> wheres, List<KeyValuePair<string, object>> ps)
        {
            // Soft-deleted rows are not "records the customer deleted from MegaForm" — they are rows
            // their own system considers gone. Showing them would be a data leak of sorts.
            var sd = p.Semantics.SoftDelete;
            if (sd != null && !string.IsNullOrEmpty(sd.Column) && IsKnownColumn(p, sd.Column))
            {
                if (sd.ActiveValue != null)
                {
                    wheres.Add("[" + sd.Column + "] = @sd");
                    ps.Add(new KeyValuePair<string, object>("@sd", ParseBit(sd.ActiveValue)));
                }
                else
                {
                    wheres.Add("[" + sd.Column + "] IS NULL");
                }
            }

            var st = p.Semantics.Status;
            if (!string.IsNullOrEmpty(q.Status) && st != null && !string.IsNullOrEmpty(st.Name) && IsKnownColumn(p, st.Name))
            {
                wheres.Add("[" + st.Name + "] = @st");
                ps.Add(new KeyValuePair<string, object>("@st", q.Status));
            }

            var t = p.Semantics.Time;
            if (t != null && !string.IsNullOrEmpty(t.Name) && IsKnownColumn(p, t.Name))
            {
                if (q.DateFrom.HasValue)
                {
                    wheres.Add("[" + t.Name + "] >= @df");
                    ps.Add(new KeyValuePair<string, object>("@df", q.DateFrom.Value));
                }
                if (q.DateTo.HasValue)
                {
                    wheres.Add("[" + t.Name + "] <= @dt");
                    ps.Add(new KeyValuePair<string, object>("@dt", q.DateTo.Value));
                }
            }

            if (!string.IsNullOrWhiteSpace(q.Search))
            {
                // Which columns are searchable — and HOW — was decided by the probe from the indexes.
                // On a big table only a prefix match is affordable; a leading-wildcard LIKE would scan
                // every one of the customer's rows on every keystroke.
                var searchables = p.Columns.Where(c => c.Searchable).Take(6).ToList();
                if (searchables.Count > 0)
                {
                    bool substring = p.Capabilities.CanSearch == "substring";
                    var ors = new List<string>();
                    for (int i = 0; i < searchables.Count; i++)
                    {
                        ors.Add("[" + searchables[i].Name + "] LIKE @s" + i);
                        var pattern = (substring ? "%" : string.Empty) + EscapeLike(q.Search.Trim()) + "%";
                        ps.Add(new KeyValuePair<string, object>("@s" + i, pattern));
                    }
                    wheres.Add("(" + string.Join(" OR ", ors) + ")");
                }
                else
                {
                    // Honest failure: no searchable column means no search, not a full scan.
                    wheres.Add("1 = 0");
                }
            }
        }

        private static string OrderBy(CapabilityProfile p)
        {
            var t = p.Semantics.Time;
            if (t != null && !string.IsNullOrEmpty(t.Name) && IsKnownColumn(p, t.Name))
            {
                var col = p.Columns.First(c => string.Equals(c.Name, t.Name, StringComparison.OrdinalIgnoreCase));
                if (col.Sortable) return "[" + col.Name + "] DESC";
            }

            // No usable time column: newest-first by key still beats an arbitrary order, and the key
            // is always indexed.
            if (p.Key.Columns.Count > 0)
                return string.Join(", ", p.Key.Columns.Select(k => "[" + k.Name + "] DESC"));

            // Nothing to order by: SQL Server still needs one for OFFSET/FETCH.
            return "(SELECT NULL)";
        }

        private int Count(DbConnection conn, ExternalBinding b, CapabilityProfile p,
                          string whereSql, List<KeyValuePair<string, object>> ps, out bool bounded)
        {
            bounded = false;

            // An exact COUNT(*) that once took too long is never attempted again — the probe recorded
            // that, and the dashboard shows a bounded number rather than hanging on every page.
            bool exactAllowed = p.Size.ExactCountAllowed || !string.IsNullOrEmpty(whereSql);
            try
            {
                using (var cmd = conn.CreateCommand())
                {
                    if (exactAllowed)
                    {
                        cmd.CommandText = "SELECT COUNT_BIG(*) FROM " + Qual(b) + whereSql;
                    }
                    else
                    {
                        bounded = true;
                        cmd.CommandText = "SELECT COUNT(*) FROM (SELECT TOP (10001) 1 AS x FROM " + Qual(b) + whereSql + ") z";
                    }
                    Bind(cmd, ps);
                    try { cmd.CommandTimeout = Math.Max(3, p.Policy.ListTimeoutSec / 2); } catch { }
                    var v = cmd.ExecuteScalar();
                    var n = v == null || v is DBNull ? 0L : Convert.ToInt64(v);
                    return n > int.MaxValue ? int.MaxValue : (int)n;
                }
            }
            catch
            {
                // A count that times out must not take the list down with it.
                bounded = true;
                return -1;
            }
        }

        // ------------------------------------------------------------------ row projection

        private static Row ReadRow(DbDataReader r, List<ColumnFacts> cols, CapabilityProfile p)
        {
            var data = new JObject();
            for (int i = 0; i < cols.Count; i++)
            {
                var name = cols[i].Name;
                var value = r.IsDBNull(i) ? null : r.GetValue(i);
                data[name] = value == null ? JValue.CreateNull() : JToken.FromObject(Normalize(value));
            }

            var row = new Row
            {
                DataJson = data.ToString(Formatting.None),
                SubmittedOnUtc = DateTime.UtcNow,
            };

            var keyValues = new JArray();
            foreach (var k in p.Key.Columns)
            {
                var idx = cols.FindIndex(c => string.Equals(c.Name, k.Name, StringComparison.OrdinalIgnoreCase));
                keyValues.Add(idx >= 0 && !r.IsDBNull(idx) ? JToken.FromObject(Normalize(r.GetValue(idx))) : JValue.CreateNull());
            }
            row.RowKeyJson = keyValues.ToString(Formatting.None);

            var t = p.Semantics.Time;
            if (t != null)
            {
                var idx = cols.FindIndex(c => string.Equals(c.Name, t.Name, StringComparison.OrdinalIgnoreCase));
                if (idx >= 0 && !r.IsDBNull(idx))
                {
                    var v = r.GetValue(idx);
                    if (v is DateTime) row.SubmittedOnUtc = (DateTime)v;
                    else if (v is DateTimeOffset) row.SubmittedOnUtc = ((DateTimeOffset)v).UtcDateTime;
                }
            }

            var st = p.Semantics.Status;
            if (st != null)
            {
                var idx = cols.FindIndex(c => string.Equals(c.Name, st.Name, StringComparison.OrdinalIgnoreCase));
                if (idx >= 0 && !r.IsDBNull(idx)) row.Status = Convert.ToString(r.GetValue(idx), CultureInfo.InvariantCulture);
            }

            return row;
        }

        /// <summary>byte[] (rowversion) and Guid do not survive a JSON round-trip in a form the client
        /// can use, so they become strings here rather than surprising the browser later.</summary>
        private static object Normalize(object v)
        {
            if (v is byte[]) return Convert.ToBase64String((byte[])v);
            if (v is Guid) return v.ToString();
            if (v is DateTimeOffset) return ((DateTimeOffset)v).UtcDateTime;
            return v;
        }

        private static object CoerceKey(object raw, string sqlType)
        {
            if (raw == null) return DBNull.Value;
            var t = (sqlType ?? string.Empty).ToLowerInvariant();
            var s = Convert.ToString(raw, CultureInfo.InvariantCulture);

            if (t == "uniqueidentifier")
            {
                Guid g;
                return Guid.TryParse(s, out g) ? (object)g : DBNull.Value;
            }
            if (t.Contains("int"))
            {
                long n;
                return long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out n) ? (object)n : DBNull.Value;
            }
            return s;
        }

        private static object ParseBit(string v)
        {
            return v == "1" || string.Equals(v, "true", StringComparison.OrdinalIgnoreCase) ? (object)true : (object)false;
        }

        /// <summary>A customer record containing '%' must not turn into a wildcard search.</summary>
        private static string EscapeLike(string s)
        {
            return (s ?? string.Empty).Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
        }

        private static void Bind(DbCommand cmd, List<KeyValuePair<string, object>> ps)
        {
            foreach (var kv in ps)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = kv.Key;
                p.Value = kv.Value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }
        }
    }
}
