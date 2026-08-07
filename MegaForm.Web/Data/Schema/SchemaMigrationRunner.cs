using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Web.Data.Schema
{
    /// <summary>
    /// [CloudReady A4 v20260804] Versioned idempotent schema script runner for the
    /// standalone Web host (net9 — intentionally NOT in Core; net472 hosts keep
    /// their native mechanisms).
    ///
    /// Scripts live in Data/Schema/Scripts/{sqlserver|sqlite|postgresql|mysql}/
    /// as NNNN_name.sql, are applied in version order, and each application is
    /// recorded in MF_SchemaHistory (Version PK, Name, AppliedAtUtc, Checksum).
    /// Every script must be idempotent per provider dialect.
    ///
    /// Baseline pragmatics: the runner never replays the historical schema.
    /// Program.cs runs the existing bootstrappers FIRST (they are idempotent and
    /// own the fresh-install schema), then calls ApplyPending — so version 0001
    /// is simply recorded as applied the first time the runner sees a database,
    /// whether that database is brand new (bootstrappers just created it) or
    /// years old (MF_Forms already existed). Only scripts 0002+ are ever executed.
    ///
    /// Multi-instance safety: the whole pass runs under a DB-native lock —
    /// SQL Server sp_getapplock, PostgreSQL pg_advisory_lock, MySQL GET_LOCK.
    /// SQLite is single-writer by design → no-op. Two instances starting together
    /// serialize here; the loser sees every version already applied and exits.
    /// </summary>
    public static class SchemaMigrationRunner
    {
        private const string LockResourceName = "MegaForm.SchemaMigration";
        // Arbitrary stable 64-bit key for pg_advisory_lock ('MFSC' as ASCII).
        private const long PostgresLockKey = 1296126787L;
        private const int LockTimeoutSeconds = 60;

        /// <summary>
        /// Applies pending scripts 0002+ and records the 0001 baseline if missing.
        /// Fail-soft by contract of the caller (Program.cs wraps in try/catch and
        /// only warns) — exceptions here must NOT prevent app startup.
        /// </summary>
        public static void ApplyPending(MegaFormDbContext db, string contentRootPath)
        {
            if (db == null) throw new ArgumentNullException(nameof(db));

            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var providerFolder = GetProviderFolder(provider);
            if (providerFolder == null)
            {
                Console.WriteLine("[MegaForm] Schema runner: unknown provider '" + provider + "', skipped.");
                return;
            }

            var scriptsDir = ResolveScriptsDirectory(contentRootPath, providerFolder);
            if (scriptsDir == null)
            {
                // Not an error: the package may not ship the scripts folder yet.
                Console.WriteLine("[MegaForm] Schema runner: no scripts folder for " + providerFolder + ", skipped.");
                return;
            }

            var conn = db.Database.GetDbConnection();
            var shouldClose = conn.State != ConnectionState.Open;
            if (shouldClose) conn.Open();

            var lockAcquired = false;
            try
            {
                lockAcquired = TryAcquireLock(conn, provider);
                if (!lockAcquired)
                {
                    Console.WriteLine("[MegaForm] Schema runner: another instance holds the schema lock, skipped.");
                    return;
                }

                EnsureHistoryTable(conn, provider);

                var applied = LoadAppliedVersions(conn);

                // Baseline: bootstrappers already ran before us (fresh DB) or the
                // schema pre-exists — either way 0001 never executes a script.
                if (!applied.ContainsKey(1))
                {
                    InsertHistoryRow(conn, 1, "0001_baseline", "bootstrapper");
                    applied[1] = "bootstrapper";
                    Console.WriteLine("[MegaForm] Schema runner: baseline 0001 recorded.");
                }

                foreach (var script in ListScripts(scriptsDir))
                {
                    if (script.Version <= 1) continue;
                    if (applied.ContainsKey(script.Version))
                    {
                        if (!string.Equals(applied[script.Version], script.Checksum, StringComparison.OrdinalIgnoreCase))
                        {
                            Console.WriteLine("[MegaForm] Schema runner: WARNING script " + script.FileName +
                                " already applied with a different checksum — left as-is.");
                        }
                        continue;
                    }

                    Console.WriteLine("[MegaForm] Schema runner: applying " + script.FileName + " ...");
                    foreach (var statement in SplitStatements(script.Sql))
                    {
                        // Scripts may mark a statement with a leading
                        // "-- mf:continue-on-error" comment line: a failure is then
                        // logged and skipped instead of aborting the run. This is how
                        // SQLite scripts stay idempotent — SQLite has no
                        // "ADD COLUMN IF NOT EXISTS", so the second run of an
                        // ADD COLUMN statement raises "duplicate column name".
                        var tolerateError = HasContinueOnErrorDirective(statement);
                        try
                        {
                            using (var cmd = conn.CreateCommand())
                            {
                                cmd.CommandText = statement;
                                cmd.CommandTimeout = 120;
                                cmd.ExecuteNonQuery();
                            }
                        }
                        catch (Exception ex)
                        {
                            if (!tolerateError) throw;
                            Console.WriteLine("[MegaForm] Schema runner: tolerated statement error in " +
                                script.FileName + ": " + ex.Message);
                        }
                    }
                    InsertHistoryRow(conn, script.Version, script.Name, script.Checksum);
                    Console.WriteLine("[MegaForm] Schema runner: applied " + script.FileName + ".");
                }
            }
            finally
            {
                if (lockAcquired)
                {
                    try { ReleaseLock(conn, provider); } catch { /* best effort */ }
                }
                if (shouldClose) conn.Close();
            }
        }

        // ── Provider mapping ─────────────────────────────────────────────────

        private static string GetProviderFolder(string provider)
        {
            if (provider.Contains("sqlserver")) return "sqlserver";
            if (provider.Contains("sqlite"))    return "sqlite";
            if (provider.Contains("npgsql"))    return "postgresql";
            if (provider.Contains("mysql"))     return "mysql";
            return null;
        }

        private static string ResolveScriptsDirectory(string contentRootPath, string providerFolder)
        {
            // Published layout: scripts are content files next to the assembly.
            // Dev layout: content root is the project directory.
            var candidates = new List<string>
            {
                Path.Combine(AppContext.BaseDirectory, "Data", "Schema", "Scripts", providerFolder)
            };
            if (!string.IsNullOrWhiteSpace(contentRootPath))
            {
                candidates.Add(Path.Combine(contentRootPath, "Data", "Schema", "Scripts", providerFolder));
            }
            foreach (var dir in candidates)
            {
                if (Directory.Exists(dir)) return dir;
            }
            return null;
        }

        // ── DB-native single-instance lock ───────────────────────────────────

        private static bool TryAcquireLock(IDbConnection conn, string provider)
        {
            if (provider.Contains("sqlite")) return true; // single-writer engine

            if (provider.Contains("sqlserver"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText =
                        "DECLARE @r INT; " +
                        "EXEC @r = sp_getapplock @Resource = N'" + LockResourceName + "', " +
                        "@LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = " + (LockTimeoutSeconds * 1000) + "; " +
                        "SELECT @r;";
                    cmd.CommandTimeout = LockTimeoutSeconds + 30;
                    var result = Convert.ToInt32(cmd.ExecuteScalar() ?? -1);
                    return result >= 0;
                }
            }

            if (provider.Contains("npgsql"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    // Session-level; blocks until acquired (statement_timeout still applies).
                    cmd.CommandText = "SELECT pg_advisory_lock(" + PostgresLockKey + ");";
                    cmd.CommandTimeout = LockTimeoutSeconds + 30;
                    cmd.ExecuteNonQuery();
                    return true;
                }
            }

            if (provider.Contains("mysql"))
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT GET_LOCK('" + LockResourceName + "', " + LockTimeoutSeconds + ");";
                    cmd.CommandTimeout = LockTimeoutSeconds + 30;
                    var result = Convert.ToInt32(cmd.ExecuteScalar() ?? 0);
                    return result == 1;
                }
            }

            return true;
        }

        private static void ReleaseLock(IDbConnection conn, string provider)
        {
            string sql = null;
            if (provider.Contains("sqlserver"))
                sql = "EXEC sp_releaseapplock @Resource = N'" + LockResourceName + "', @LockOwner = N'Session';";
            else if (provider.Contains("npgsql"))
                sql = "SELECT pg_advisory_unlock(" + PostgresLockKey + ");";
            else if (provider.Contains("mysql"))
                sql = "SELECT RELEASE_LOCK('" + LockResourceName + "');";
            if (sql == null) return; // sqlite

            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = sql;
                cmd.ExecuteNonQuery();
            }
        }

        // ── MF_SchemaHistory ─────────────────────────────────────────────────

        private static void EnsureHistoryTable(IDbConnection conn, string provider)
        {
            string sql;
            if (provider.Contains("sqlserver"))
                sql = "IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'MF_SchemaHistory' AND schema_id = SCHEMA_ID(N'dbo')) " +
                      "CREATE TABLE [dbo].[MF_SchemaHistory] ([Version] INT NOT NULL CONSTRAINT [PK_MF_SchemaHistory] PRIMARY KEY, " +
                      "[Name] NVARCHAR(200) NOT NULL, [AppliedAtUtc] DATETIME2 NOT NULL, [Checksum] NVARCHAR(64) NOT NULL);";
            else if (provider.Contains("sqlite"))
                sql = "CREATE TABLE IF NOT EXISTS \"MF_SchemaHistory\" (\"Version\" INTEGER NOT NULL PRIMARY KEY, " +
                      "\"Name\" TEXT NOT NULL, \"AppliedAtUtc\" TEXT NOT NULL, \"Checksum\" TEXT NOT NULL);";
            else if (provider.Contains("npgsql"))
                sql = "CREATE TABLE IF NOT EXISTS \"MF_SchemaHistory\" (\"Version\" integer NOT NULL PRIMARY KEY, " +
                      "\"Name\" varchar(200) NOT NULL, \"AppliedAtUtc\" timestamp NOT NULL, \"Checksum\" varchar(64) NOT NULL);";
            else
                sql = "CREATE TABLE IF NOT EXISTS `MF_SchemaHistory` (`Version` INT NOT NULL PRIMARY KEY, " +
                      "`Name` VARCHAR(200) NOT NULL, `AppliedAtUtc` DATETIME NOT NULL, `Checksum` VARCHAR(64) NOT NULL);";

            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = sql;
                cmd.ExecuteNonQuery();
            }
        }

        private static Dictionary<int, string> LoadAppliedVersions(IDbConnection conn)
        {
            var result = new Dictionary<int, string>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT Version, Checksum FROM MF_SchemaHistory";
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        result[reader.GetInt32(0)] = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
                    }
                }
            }
            return result;
        }

        private static void InsertHistoryRow(IDbConnection conn, int version, string name, string checksum)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "INSERT INTO MF_SchemaHistory (Version, Name, AppliedAtUtc, Checksum) VALUES (@v, @n, @t, @c)";
                AddParam(cmd, "@v", version);
                AddParam(cmd, "@n", name ?? string.Empty);
                AddParam(cmd, "@t", DateTime.UtcNow);
                AddParam(cmd, "@c", checksum ?? string.Empty);
                cmd.ExecuteNonQuery();
            }
        }

        private static void AddParam(IDbCommand cmd, string name, object value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        // ── Script discovery / parsing ───────────────────────────────────────

        private sealed class ScriptInfo
        {
            public int Version;
            public string Name;
            public string FileName;
            public string Sql;
            public string Checksum;
        }

        private static List<ScriptInfo> ListScripts(string dir)
        {
            var scripts = new List<ScriptInfo>();
            foreach (var file in Directory.GetFiles(dir, "*.sql"))
            {
                var fileName = Path.GetFileName(file);
                int version;
                if (!TryParseVersion(fileName, out version)) continue;
                var sql = File.ReadAllText(file);
                scripts.Add(new ScriptInfo
                {
                    Version  = version,
                    Name     = Path.GetFileNameWithoutExtension(fileName),
                    FileName = fileName,
                    Sql      = sql,
                    Checksum = ComputeChecksum(sql)
                });
            }
            scripts.Sort((a, b) => a.Version.CompareTo(b.Version));
            return scripts;
        }

        private static bool TryParseVersion(string fileName, out int version)
        {
            version = 0;
            if (string.IsNullOrEmpty(fileName) || fileName.Length < 5) return false;
            var prefix = fileName.Substring(0, 4);
            return int.TryParse(prefix, out version);
        }

        private static string ComputeChecksum(string content)
        {
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(content ?? string.Empty));
                var sb = new StringBuilder(bytes.Length * 2);
                foreach (var b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        /// <summary>
        /// Splits a script into statements. Convention: a statement ends at a line
        /// whose last non-whitespace character is ';'. Scripts must not embed a
        /// line-terminating ';' inside string literals (none of ours do).
        /// Comment-only and empty statements are skipped.
        /// </summary>
        private static List<string> SplitStatements(string script)
        {
            var statements = new List<string>();
            var current = new StringBuilder();
            using (var reader = new StringReader(script ?? string.Empty))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    current.AppendLine(line);
                    if (line.TrimEnd().EndsWith(";", StringComparison.Ordinal))
                    {
                        var statement = current.ToString().Trim();
                        if (statement.EndsWith(";", StringComparison.Ordinal))
                            statement = statement.Substring(0, statement.Length - 1);
                        if (HasExecutableContent(statement)) statements.Add(statement);
                        current.Length = 0;
                    }
                }
            }
            var tail = current.ToString().Trim();
            if (HasExecutableContent(tail)) statements.Add(tail);
            return statements;
        }

        private static bool HasExecutableContent(string statement)
        {
            using (var reader = new StringReader(statement ?? string.Empty))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    var trimmed = line.Trim();
                    if (trimmed.Length == 0) continue;
                    if (trimmed.StartsWith("--", StringComparison.Ordinal)) continue;
                    return true;
                }
            }
            return false;
        }

        private static bool HasContinueOnErrorDirective(string statement)
        {
            // Any comment line containing the directive marks the whole statement —
            // file-header comments ride along with the first statement, so checking
            // only the first line would miss it there.
            using (var reader = new StringReader(statement ?? string.Empty))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    if (line.Trim().StartsWith("-- mf:continue-on-error", StringComparison.OrdinalIgnoreCase))
                        return true;
                }
            }
            return false;
        }
    }
}
