/*
 * MegaForm.Core/Services/AfterSubmitScriptGuard.cs
 *
 * [AfterSubmitScript v20260813-01] The authority rules for the C# after-submit hook,
 * in one place so all four platforms enforce the same thing.
 *
 * Two independent conditions, both required:
 *
 *   1. AUTHORING  — only a host/superuser may write a script, and only while the
 *      feature switch is on. Checked in the endpoint (CanAuthor).
 *   2. EXECUTION  — the stored block must carry an approval record that matches the
 *      stored source byte for byte. Checked at submit time (IsRunnable).
 *
 * (2) exists because (1) alone is one forgotten attribute away from being nothing at
 * all, and because a form's settings blob arrives from more directions than the endpoint:
 * template install, gallery download, form import, a builder Save posted by a content
 * editor, a restored backup. Every one of those can carry a `source`. None of them can
 * carry a valid approval, because the approval is a hash written server-side at the
 * moment a host pressed Save, from the source the server had in hand.
 *
 * PreserveApprovedCopy() closes the matching hole on the write side: the ordinary form
 * Save endpoint keeps whatever the server already had and ignores the client's version
 * of this block entirely. A content editor saving a form therefore cannot introduce,
 * alter, or re-enable a script even by posting a hand-built payload.
 */

using System;
using System.Security.Cryptography;
using System.Text;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    public static class AfterSubmitScriptGuard
    {
        public const string Badge = "AfterSubmitScriptGuard v20260813-01";

        /// <summary>
        /// Config key for the feature switch, spelled the same on every platform:
        ///   DNN     — web.config &lt;appSettings&gt; entry
        ///   Oqtane  — appsettings.json entry
        /// Absent, unreadable, or anything other than "true" (case-insensitive) means off,
        /// which is what every install ships as.
        ///
        /// It lives in a config FILE rather than in a settings table on purpose: turning this
        /// on permits compiling and running C# in the site's process, and the right bar for
        /// that is "can edit files on the server" — a smaller group than "knows the superuser
        /// password". Editing the file also restarts the application, so the change lands at a
        /// moment the host picked.
        /// </summary>
        public const string EnabledSettingKey = "MegaForm:AfterSubmitScriptEnabled";

        public const int MinTimeoutSeconds = 1;
        public const int MaxTimeoutSeconds = 60;
        public const int DefaultTimeoutSeconds = 10;

        /// <summary>
        /// A script longer than this is refused at save time. Not a security boundary —
        /// the allow-list is — but a 200 KB "script" is a sign something is wrong, and
        /// compile time is paid by whoever pressed Save.
        /// </summary>
        public const int MaxSourceChars = 64 * 1024;

        /// <summary>
        /// May this caller create or change a script? Both conditions are required and
        /// neither has a fallback: a site that has not switched the feature on cannot be
        /// talked into it by a request, and "edit module" is never enough.
        /// </summary>
        public static bool CanAuthor(bool isHostOrSuperUser, bool featureEnabled)
        {
            return isHostOrSuperUser && featureEnabled;
        }

        /// <summary>SHA-256 of the source, hex, lowercase. Empty string for null/blank.</summary>
        public static string ComputeHash(string source)
        {
            if (source == null) source = string.Empty;
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(source));
                var sb = new StringBuilder(bytes.Length * 2);
                for (int i = 0; i < bytes.Length; i++) sb.Append(bytes[i].ToString("x2"));
                return sb.ToString();
            }
        }

        /// <summary>
        /// Constant-time comparison of two hex hashes. The values are not secret, but a
        /// short-circuiting compare here is the kind of detail that gets copied into a
        /// place where it matters.
        /// </summary>
        public static bool HashEquals(string a, string b)
        {
            if (a == null || b == null) return false;
            if (a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        /// <summary>
        /// Is this stored block allowed to execute? Returns false with a reason for every
        /// way it can be inert. The reason is written to the run record so an admin who
        /// wonders "why did nothing happen" gets an answer instead of silence — the exact
        /// failure mode this codebase keeps producing.
        /// </summary>
        public static bool IsRunnable(FormAfterSubmitScriptSettings s, out string reason)
        {
            reason = null;
            if (s == null) { reason = "No after-submit script configured."; return false; }
            if (!s.Enabled) { reason = "After-submit script is disabled for this form."; return false; }
            if (string.IsNullOrWhiteSpace(s.Source)) { reason = "After-submit script is empty."; return false; }

            var lang = string.IsNullOrWhiteSpace(s.Language) ? "csharp" : s.Language.Trim();
            if (!lang.Equals("csharp", StringComparison.OrdinalIgnoreCase))
            {
                reason = "Unsupported script language '" + lang + "'.";
                return false;
            }

            if (s.ApprovedByUserId <= 0 || string.IsNullOrWhiteSpace(s.ApprovedHash))
            {
                // The common real-world path into here: the block travelled with an imported
                // form or an installed template. Say so, because "not approved" reads like a
                // bug otherwise.
                reason = "Script has no host approval on this site. A host/superuser must open it and press Save.";
                return false;
            }

            if (!HashEquals(s.ApprovedHash, ComputeHash(s.Source)))
            {
                reason = "Script source does not match the approved version — it was changed outside the host-only editor.";
                return false;
            }

            return true;
        }

        public static int ResolveTimeoutSeconds(FormAfterSubmitScriptSettings s)
        {
            var v = s == null ? DefaultTimeoutSeconds : s.TimeoutSeconds;
            if (v <= 0) v = DefaultTimeoutSeconds;
            if (v < MinTimeoutSeconds) v = MinTimeoutSeconds;
            if (v > MaxTimeoutSeconds) v = MaxTimeoutSeconds;
            return v;
        }

        public static bool ShouldReportFailure(FormAfterSubmitScriptSettings s)
        {
            return s != null && string.Equals(s.OnFailure, "report", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Called by every ordinary form-save path. Returns the block that should be
        /// persisted: always the server's existing copy, never the client's.
        ///
        /// The one thing a non-host save may do is nothing at all. That includes turning a
        /// script OFF — which sounds harmless and is not: a content editor who can toggle
        /// Enabled can also toggle it back on after a host disabled it.
        /// </summary>
        public static FormAfterSubmitScriptSettings PreserveApprovedCopy(
            FormAfterSubmitScriptSettings incoming,
            FormAfterSubmitScriptSettings stored)
        {
            return stored == null ? null : stored.Clone();
        }

        /// <summary>
        /// Stamp an approval onto a block a host just saved. The hash is computed from the
        /// source the SERVER holds after normalisation, not from anything the client sent
        /// alongside it.
        /// </summary>
        public static void Approve(FormAfterSubmitScriptSettings s, int userId, string userName, DateTime utcNow)
        {
            if (s == null) return;
            s.ApprovedHash = ComputeHash(s.Source);
            s.ApprovedByUserId = userId;
            s.ApprovedByUserName = string.IsNullOrWhiteSpace(userName) ? ("user-" + userId) : userName.Trim();
            s.ApprovedOnUtc = utcNow;
        }
    }
}
