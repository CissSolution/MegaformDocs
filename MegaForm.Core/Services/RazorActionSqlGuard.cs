using System;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// [SecFix 2026-07-03 P0-1] Defensive allow-list guard for the Razor-widget "Action"
    /// SQL path (EditableList / MasterDetailList Add / Edit / Delete buttons).
    ///
    /// The action SQL currently arrives from the client, so until the server-side
    /// schema lookup lands this guard is the safety net. The legitimate widget actions
    /// are single-statement DML/queries (SELECT / INSERT / UPDATE / DELETE), so this guard
    /// keeps those working while rejecting the catastrophic surface an attacker would use:
    ///   • schema destruction / mutation (DROP, ALTER, CREATE, TRUNCATE, RENAME),
    ///   • process / OS reach (EXEC, xp_*, sp_*, OPENROWSET, OPENQUERY, BULK, RECONFIGURE),
    ///   • privilege escalation (GRANT, REVOKE, DENY), availability (SHUTDOWN, WAITFOR),
    ///   • statement stacking (a second statement after ';') and comment obfuscation (-- , /*).
    ///
    /// It is deliberately conservative (blocks more than it must); widget actions never
    /// legitimately need any of the above. NOT a substitute for the real fix (resolve the
    /// SQL from the saved form schema by formId + widgetKey + actionName + auth) — it is the
    /// interim brake that closes the "unauthenticated DROP TABLE / xp_cmdshell" hole.
    /// </summary>
    public static class RazorActionSqlGuard
    {
        // Dangerous tokens rejected anywhere in the statement (word-boundary, case-insensitive).
        private static readonly Regex DangerousTokens = new Regex(
            @"(?ix)
              \b(DROP|ALTER|CREATE|TRUNCATE|RENAME|GRANT|REVOKE|DENY|SHUTDOWN|
                 RECONFIGURE|BACKUP|RESTORE|EXEC|EXECUTE|OPENROWSET|OPENQUERY|
                 OPENDATASOURCE|WAITFOR|MERGE)\b
              | \bxp_ | \bsp_ | \bsys\. | \bINFORMATION_SCHEMA\b",
            RegexOptions.Compiled | RegexOptions.IgnorePatternWhitespace | RegexOptions.IgnoreCase);

        // The first keyword must be one of these (single-statement DML / query).
        private static readonly Regex AllowedLead = new Regex(
            @"^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        /// <summary>Returns true when the SQL is safe to run; otherwise reason is set.</summary>
        public static bool IsAllowed(string sql, out string reason)
        {
            reason = null;
            if (string.IsNullOrWhiteSpace(sql)) { reason = "empty SQL"; return false; }

            var s = sql.Trim();

            // Reject SQL comments outright — legitimate widget actions do not carry them and
            // they are the classic vehicle for hiding a dangerous tail past a naive scan.
            if (s.IndexOf("--", StringComparison.Ordinal) >= 0 || s.IndexOf("/*", StringComparison.Ordinal) >= 0)
            { reason = "SQL comments are not allowed in widget actions"; return false; }

            // Reject statement stacking: strip a single trailing ';', then any remaining ';'
            // means a second statement (e.g. "...; DROP TABLE x").
            var body = s.TrimEnd().TrimEnd(';');
            if (body.IndexOf(';') >= 0)   // char overload — ordinal by definition; net472-safe
            { reason = "multiple SQL statements are not allowed"; return false; }

            if (!AllowedLead.IsMatch(body))
            { reason = "only SELECT / INSERT / UPDATE / DELETE actions are allowed"; return false; }

            if (DangerousTokens.IsMatch(body))
            { reason = "the statement contains a disallowed SQL keyword"; return false; }

            return true;
        }
    }
}
