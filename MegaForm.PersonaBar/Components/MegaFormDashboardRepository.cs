// [PersonaBar v20260731-01] Bounded-read data access for the Persona Bar panel.
//
// Why this file exists instead of reusing FormView's BuildDashboardJson: that method
// calls GetFormsByPortal() (every form in the portal) and then GetFormStats() once per
// form. On a portal with a few hundred forms that is a few hundred round trips per panel
// open. RULE #11 (Docs/SECURITY_CODING_RULES.md) requires the cap to be pushed INTO the
// SQL, so the list here comes off usp_MF_Form_List (OFFSET..FETCH) and the per-form
// submission counts come back in ONE grouped query keyed by the ids on the current page.

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;

namespace MegaForm.PersonaBar.Components
{
    /// <summary>Portal-wide counters shown in the panel's stat tiles.</summary>
    public class MegaFormPortalSummary
    {
        public int Forms { get; set; }
        public int PublishedForms { get; set; }
        public int Submissions { get; set; }
        public DateTime? LastSubmissionUtc { get; set; }
    }

    internal static class MegaFormDashboardRepository
    {
        private static string ConnectionString
        {
            get { return DotNetNuke.Data.DataProvider.Instance().ConnectionString; }
        }

        /// <summary>
        /// One round trip for the three portal counters. COUNT(*) in SQL — never
        /// materialise-then-count.
        /// </summary>
        public static MegaFormPortalSummary GetPortalSummary(int portalId)
        {
            var summary = new MegaFormPortalSummary();

            const string sql = @"
SELECT
    (SELECT COUNT(*) FROM dbo.MF_Forms WHERE PortalId = @PortalId) AS Forms,
    (SELECT COUNT(*) FROM dbo.MF_Forms WHERE PortalId = @PortalId AND [Status] = 'Published') AS PublishedForms,
    (SELECT COUNT(*) FROM dbo.MF_Submissions s
        INNER JOIN dbo.MF_Forms f ON f.FormId = s.FormId
        WHERE f.PortalId = @PortalId AND s.IsSpam = 0) AS Submissions,
    (SELECT MAX(s.SubmittedOnUtc) FROM dbo.MF_Submissions s
        INNER JOIN dbo.MF_Forms f ON f.FormId = s.FormId
        WHERE f.PortalId = @PortalId AND s.IsSpam = 0) AS LastSubmissionUtc;";

            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.Add("@PortalId", SqlDbType.Int).Value = portalId;
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        summary.Forms = reader.IsDBNull(0) ? 0 : reader.GetInt32(0);
                        summary.PublishedForms = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
                        summary.Submissions = reader.IsDBNull(2) ? 0 : reader.GetInt32(2);
                        summary.LastSubmissionUtc = reader.IsDBNull(3) ? (DateTime?)null : reader.GetDateTime(3);
                    }
                }
            }

            return summary;
        }

        /// <summary>
        /// Submission counts for exactly the form ids on the page the panel asked for.
        /// Ids are bound as individual parameters — never concatenated into the text.
        /// </summary>
        public static Dictionary<int, int> GetSubmissionCounts(IList<int> formIds)
        {
            var counts = new Dictionary<int, int>();
            if (formIds == null || formIds.Count == 0) return counts;

            var names = new string[formIds.Count];
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand())
            {
                cmd.Connection = conn;
                for (var i = 0; i < formIds.Count; i++)
                {
                    names[i] = "@f" + i;
                    cmd.Parameters.Add(names[i], SqlDbType.Int).Value = formIds[i];
                }

                cmd.CommandText =
                    "SELECT s.FormId, COUNT(*) AS Total FROM dbo.MF_Submissions s " +
                    "WHERE s.IsSpam = 0 AND s.FormId IN (" + string.Join(",", names) + ") " +
                    "GROUP BY s.FormId;";

                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        counts[reader.GetInt32(0)] = reader.GetInt32(1);
                    }
                }
            }

            return counts;
        }
    }
}
