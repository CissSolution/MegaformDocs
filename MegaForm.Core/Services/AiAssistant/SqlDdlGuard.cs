using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>
    /// Result of <see cref="SqlDdlGuard.Inspect"/>.
    /// </summary>
    public sealed class SqlGuardResult
    {
        /// <summary>True only if the statement passed every safety check.</summary>
        public bool Allowed { get; set; }

        /// <summary>Human-readable reason when <see cref="Allowed"/> is false.</summary>
        public string Reason { get; set; }

        /// <summary>Normalised leading verb phrase, e.g. "CREATE TABLE".</summary>
        public string Verb { get; set; }

        /// <summary>"ddl-create" | "ddl-index" | "ddl-alter-add" | "dml-insert" | "blocked".</summary>
        public string Category { get; set; }

        /// <summary>True when more than one statement was supplied.</summary>
        public bool MultiStatement { get; set; }

        /// <summary>Count of non-empty statements found after stripping noise.</summary>
        public int StatementCount { get; set; }

        /// <summary>SQL with comments / string literals / quoted identifiers replaced by spaces (diagnostics).</summary>
        public string Stripped { get; set; }
    }

    /// <summary>
    /// [P1-3] Defense-in-depth guard for the AI-driven <c>ExecuteDdl</c> path.
    ///
    /// The AI (or a hallucinating / prompt-injected model) emits a SQL string
    /// via the <c>execute_sql</c> op, which the server runs against the
    /// customer's database. This guard ensures that path can ONLY perform
    /// additive schema / seed operations — never destructive ones — by
    /// enforcing, in order:
    ///
    ///   1. Exactly ONE statement (multi-statement injection blocked —
    ///      e.g. <c>CREATE TABLE t(id int); DELETE FROM Users;</c> is rejected).
    ///   2. No batch separators (<c>GO</c>).
    ///   3. A strict additive leading-verb allow-list:
    ///        CREATE TABLE | CREATE [UNIQUE|CLUSTERED|NONCLUSTERED] INDEX |
    ///        ALTER TABLE ... ADD (never DROP) | INSERT [INTO]
    ///   4. No embedded destructive / exfiltration keywords anywhere in the
    ///      single statement (DROP, TRUNCATE, EXEC, xp_/sp_ system procs,
    ///      OPENROWSET, GRANT, …) — this catches <c>INSERT … EXEC xp_cmdshell</c>.
    ///
    /// String literals, bracket <c>[..]</c> / quoted <c>"…"</c> / backtick
    /// identifiers and comments are stripped BEFORE analysis so a payload
    /// cannot hide a <c>;</c> or a keyword inside them, and so legitimate FK
    /// clauses such as <c>ON DELETE CASCADE</c> (DELETE inside DDL, not a
    /// DELETE statement) are NOT false-positives.
    ///
    /// Provider-agnostic: the same rules hold for MSSQL (DNN today) and for
    /// SQLite / PostgreSQL / MySQL (Oqtane, when ExecuteDdl is mirrored).
    /// Per the audit handout: <b>do NOT loosen this guard.</b>
    /// </summary>
    public static class SqlDdlGuard
    {
        // Whole-word keywords that must never appear inside a single allowed
        // statement. DELETE / UPDATE / MERGE are deliberately NOT here: they
        // cannot be smuggled into a single CREATE/ALTER/INSERT statement
        // (that needs a ';', already blocked) and DELETE/UPDATE legitimately
        // appear in FK clauses (ON DELETE/UPDATE CASCADE).
        private static readonly string[] EmbeddedDanger = new[]
        {
            "DROP", "TRUNCATE", "EXEC", "EXECUTE",
            "GRANT", "REVOKE", "DENY",
            "SHUTDOWN", "RECONFIGURE", "WAITFOR",
            "OPENROWSET", "OPENQUERY", "OPENDATASOURCE",
            "BACKUP", "RESTORE",
            "XP_CMDSHELL", "SP_EXECUTESQL", "SP_OACREATE", "SP_OAMETHOD", "SP_CONFIGURE"
        };

        /// <summary>
        /// Inspect a single SQL payload and decide whether the AI path may run it.
        /// </summary>
        public static SqlGuardResult Inspect(string rawSql)
        {
            var r = new SqlGuardResult { Allowed = false, Category = "blocked" };
            if (string.IsNullOrWhiteSpace(rawSql))
            {
                r.Reason = "empty SQL";
                return r;
            }

            string stripped = StripNoise(rawSql);
            r.Stripped = stripped;

            // (2) MSSQL batch separator 'GO' on its own line = multiple batches.
            if (Regex.IsMatch(stripped, @"(^|\n)\s*GO\s*(\r?\n|$)", RegexOptions.IgnoreCase))
            {
                r.Reason = "batch separator 'GO' is not allowed (single statement only)";
                return r;
            }

            // (1) exactly one statement
            var statements = stripped
                .Split(';')
                .Select(s => s.Trim())
                .Where(s => s.Length > 0)
                .ToList();
            r.StatementCount = statements.Count;
            r.MultiStatement = statements.Count > 1;

            if (statements.Count == 0)
            {
                r.Reason = "no executable statement found";
                return r;
            }
            if (statements.Count > 1)
            {
                r.Reason = "multi-statement payloads are not allowed (exactly one statement required)";
                return r;
            }

            string stmt = statements[0];
            string upper = stmt.ToUpperInvariant();
            var tokens = Tokenize(upper);
            if (tokens.Count == 0)
            {
                r.Reason = "no SQL tokens found";
                return r;
            }

            // (4) embedded-danger scan (whole word) + any extended/system proc token.
            foreach (var bad in EmbeddedDanger)
            {
                if (ContainsWord(upper, bad))
                {
                    r.Reason = "blocked keyword '" + bad + "' present in statement";
                    return r;
                }
            }
            foreach (var tok in tokens)
            {
                if (tok.StartsWith("XP_", StringComparison.Ordinal))
                {
                    r.Reason = "extended stored procedure reference '" + tok + "' is not allowed";
                    return r;
                }
            }

            // (3) leading-verb allow-list
            string t0 = tokens[0];
            string t1 = tokens.Count > 1 ? tokens[1] : "";

            if (t0 == "CREATE")
            {
                if (t1 == "TABLE")
                {
                    r.Allowed = true; r.Category = "ddl-create"; r.Verb = "CREATE TABLE";
                    return r;
                }
                // CREATE [UNIQUE] [CLUSTERED|NONCLUSTERED] INDEX ...
                if (tokens.Take(5).Any(t => t == "INDEX"))
                {
                    r.Allowed = true; r.Category = "ddl-index"; r.Verb = "CREATE INDEX";
                    return r;
                }
                r.Reason = "only CREATE TABLE / CREATE INDEX are allowed (got 'CREATE " + t1 + "')";
                return r;
            }

            if (t0 == "ALTER")
            {
                if (t1 != "TABLE")
                {
                    r.Reason = "only ALTER TABLE is allowed (got 'ALTER " + t1 + "')";
                    return r;
                }
                // DROP already screened by EmbeddedDanger; require an ADD.
                if (!ContainsWord(upper, "ADD"))
                {
                    r.Reason = "ALTER TABLE must be additive (ADD only)";
                    return r;
                }
                r.Allowed = true; r.Category = "ddl-alter-add"; r.Verb = "ALTER TABLE ADD";
                return r;
            }

            if (t0 == "INSERT")
            {
                r.Allowed = true; r.Category = "dml-insert"; r.Verb = "INSERT";
                return r;
            }

            r.Reason = "leading verb '" + t0 + "' is not in the additive allow-list " +
                       "(CREATE TABLE / CREATE INDEX / ALTER TABLE ADD / INSERT)";
            return r;
        }

        // ── internals ────────────────────────────────────────────────────

        /// <summary>
        /// Replace comments, single-quote strings, and quoted identifiers
        /// (<c>[..]</c>, <c>"…"</c>, <c>`…`</c>) with spaces so any ';' or
        /// keyword hidden inside them is neutralised. Newlines are preserved
        /// so the GO / line-comment regexes stay accurate.
        /// </summary>
        private static string StripNoise(string sql)
        {
            var sb = new StringBuilder(sql.Length);
            int i = 0, n = sql.Length;
            while (i < n)
            {
                char c = sql[i];
                char d = i + 1 < n ? sql[i + 1] : '\0';

                // line comment  -- ... \n
                if (c == '-' && d == '-')
                {
                    while (i < n && sql[i] != '\n') { sb.Append(' '); i++; }
                    continue;
                }
                // block comment  /* ... */
                if (c == '/' && d == '*')
                {
                    i += 2; sb.Append("  ");
                    while (i < n && !(sql[i] == '*' && i + 1 < n && sql[i + 1] == '/'))
                    { sb.Append(sql[i] == '\n' ? '\n' : ' '); i++; }
                    if (i < n) { i += 2; sb.Append("  "); }
                    continue;
                }
                // single-quote string  '...'  ('' = escaped quote)
                if (c == '\'')
                {
                    sb.Append(' '); i++;
                    while (i < n)
                    {
                        if (sql[i] == '\'' && i + 1 < n && sql[i + 1] == '\'') { sb.Append("  "); i += 2; continue; }
                        if (sql[i] == '\'') { sb.Append(' '); i++; break; }
                        sb.Append(sql[i] == '\n' ? '\n' : ' '); i++;
                    }
                    continue;
                }
                // bracket identifier  [..]
                if (c == '[')
                {
                    sb.Append(' '); i++;
                    while (i < n && sql[i] != ']') { sb.Append(' '); i++; }
                    if (i < n) { sb.Append(' '); i++; }
                    continue;
                }
                // double-quote identifier / string  "..."
                if (c == '"')
                {
                    sb.Append(' '); i++;
                    while (i < n && sql[i] != '"') { sb.Append(sql[i] == '\n' ? '\n' : ' '); i++; }
                    if (i < n) { sb.Append(' '); i++; }
                    continue;
                }
                // backtick identifier (MySQL)  `...`
                if (c == '`')
                {
                    sb.Append(' '); i++;
                    while (i < n && sql[i] != '`') { sb.Append(' '); i++; }
                    if (i < n) { sb.Append(' '); i++; }
                    continue;
                }

                sb.Append(c); i++;
            }
            return sb.ToString();
        }

        private static List<string> Tokenize(string upper)
        {
            var list = new List<string>();
            foreach (Match m in Regex.Matches(upper, @"[A-Z0-9_@#]+"))
                list.Add(m.Value);
            return list;
        }

        private static bool ContainsWord(string upperHaystack, string upperWord)
        {
            return Regex.IsMatch(
                upperHaystack,
                @"(?<![A-Z0-9_@#])" + Regex.Escape(upperWord) + @"(?![A-Z0-9_@#])");
        }
    }
}
