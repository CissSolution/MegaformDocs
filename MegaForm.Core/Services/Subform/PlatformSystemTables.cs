using System;
using System.Collections.Generic;
using System.Linq;

namespace MegaForm.Core.Services.Subform
{
    /// <summary>
    /// [PlatformTableList v20260813] The host platform's own tables — Oqtane core and ASP.NET
    /// Identity — which an admin never wants to build a form on.
    ///
    /// Why this exists: the builder's Database tab has always shipped a "Show system tables"
    /// checkbox, and on Oqtane the checkbox did nothing. The DNN controller filters its platform
    /// tables when <c>showAll=0</c>; the Oqtane and Web twins never read the parameter at all, so
    /// a stock Oqtane site listed all 74 base tables (36 of them Oqtane's, 37 MegaForm's, and none
    /// the customer's) with no way to trim the list. Verified on :5131, 2026-08-13.
    ///
    /// Exact names, never prefixes. Oqtane's tables are plain English nouns — <c>User</c>,
    /// <c>Site</c>, <c>Theme</c>, <c>Page</c>, <c>File</c> — so a <c>LIKE 'User%'</c> style filter
    /// would silently eat a customer table called <c>Users_Import</c>. Same reasoning as
    /// <see cref="MegaFormInternalTables"/>: a name missing from this list only means the row
    /// still shows, which is the safe direction to be wrong in.
    /// </summary>
    public static class PlatformSystemTables
    {
        public static readonly string[] Names =
        {
            "__EFMigrationsHistory",
            // Oqtane 10.x core
            "Alias", "File", "Folder", "HtmlText", "Job", "JobLog", "Language", "Log", "Module",
            "ModuleDefinition", "Notification", "Page", "PageModule", "Permission", "Profile",
            "Role", "SearchContent", "SearchContentProperty", "SearchContentWord", "SearchWord",
            "Setting", "Site", "SiteGroup", "SiteGroupMember", "SiteTask", "Tenant", "Theme",
            "UrlMapping", "User", "UserRole", "Visitor",
        };

        /// <summary>ASP.NET Identity ships a family of tables sharing this prefix; matching the
        /// prefix is safe here because the framework owns the whole namespace.</summary>
        public static readonly string[] Prefixes = { "AspNet", "aspnet_" };

        private static readonly HashSet<string> Set =
            new HashSet<string>(Names, StringComparer.OrdinalIgnoreCase);

        public static bool IsPlatform(string tableName)
        {
            if (string.IsNullOrWhiteSpace(tableName)) return false;
            var n = tableName.Trim();
            if (Set.Contains(n)) return true;
            return Prefixes.Any(p => n.StartsWith(p, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// <c>'Alias','File',…</c> — ready to drop into a <c>TABLE_NAME NOT IN (…)</c> clause. The
        /// names are compile-time constants matching ^[A-Za-z0-9_]+$, so this cannot inject.
        /// </summary>
        public static string SqlNameList()
        {
            return string.Join(",", Names.Select(n => "'" + n + "'"));
        }
    }
}
