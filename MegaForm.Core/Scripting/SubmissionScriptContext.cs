/*
 * MegaForm.Core/Scripting/SubmissionScriptContext.cs
 *
 * [AfterSubmitScript v20260813-01] The surface a customer-authored C# script sees.
 *
 * This file is the PUBLIC CONTRACT of the after-submit script feature. Everything a
 * script can touch is reachable from the context object handed to Run(); there is no
 * ambient service locator, no HttpContext, no connection. That is deliberate: the
 * compiler's reference allow-list (MegaForm.Scripting.ScriptReferenceSet) decides what
 * the script may *reference*, and this type decides what it may *reach*. Widening either
 * one is a security decision, not a convenience decision.
 *
 * Automation v2 runs the same context at four explicit stages. PreValidate/PreInsert may
 * change values and veto a submission; PostCommit/AsyncWorker cannot undo the stored row.
 * Stage and CanAbort make that distinction inspectable by the script.
 */

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Scripting
{
    /// <summary>
    /// Implemented by a compiled after-submit script. Customers normally do not write this
    /// interface out — the compiler wraps a bare statement body in a generated class that
    /// implements it (see MegaForm.Scripting.ScriptSourceBuilder). Writing the full class
    /// by hand is supported for scripts that need private helper methods.
    /// </summary>
    public interface ISubmissionScript
    {
        void Run(SubmissionScriptContext ctx);
    }

    /// <summary>
    /// Native async script contract used by Automation v2. The cancellation token is cancelled
    /// when the configured run timeout expires and is intended to be passed to capability calls.
    /// The legacy synchronous contract above remains supported for existing full-class scripts.
    /// </summary>
    public interface ISubmissionAsyncScript
    {
        Task RunAsync(SubmissionScriptContext ctx, CancellationToken ct);
    }

    /// <summary>
    /// One line written by a script through <see cref="SubmissionScriptContext.Log"/>.
    /// </summary>
    public sealed class ScriptLogEntry
    {
        public DateTime TimestampUtc { get; set; }
        public string Message { get; set; }
    }

    /// <summary>
    /// Everything an after-submit script can read and write.
    ///
    /// Read surface: the submitted values plus the identity of the submitter. Write
    /// surface: <see cref="Log"/>, <see cref="SetVariable"/> and <see cref="Fail"/> —
    /// all of which land in the run record, none of which reach outside the process.
    /// </summary>
    public sealed class SubmissionScriptContext
    {
        private readonly Dictionary<string, object> _data;
        private readonly Dictionary<string, object> _variables =
            new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        private readonly List<ScriptLogEntry> _logs = new List<ScriptLogEntry>();

        // A runaway script must not be able to exhaust memory through the log, and the
        // run record has to fit a database column. Both caps are enforced here rather
        // than trusting the script to be reasonable.
        private const int MaxLogEntries = 200;
        private const int MaxLogMessageChars = 2000;

        public SubmissionScriptContext(IDictionary<string, object> data)
        {
            _data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (data != null)
            {
                foreach (var kv in data)
                {
                    // Pipeline-internal keys (__portalId, __actorUserId, …) are surfaced as
                    // first-class properties below instead of leaking into Data, so a script
                    // written against a field key never collides with one.
                    if (!string.IsNullOrEmpty(kv.Key) && kv.Key.StartsWith("__", StringComparison.Ordinal))
                        continue;
                    _data[kv.Key] = kv.Value;
                }
            }
        }

        // ── Identity of the thing that was submitted ──────────────────────────────

        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public int PortalId { get; set; }
        public string FormTitle { get; set; }

        // ── Identity of who submitted it ──────────────────────────────────────────

        /// <summary>0 for an anonymous submission.</summary>
        public int UserId { get; set; }
        public string UserName { get; set; }
        public string UserEmail { get; set; }
        public string IpAddress { get; set; }

        public DateTime UtcNow { get; set; }

        // ── The submitted values ──────────────────────────────────────────────────

        /// <summary>
        /// Submitted values keyed by field key, case-insensitive. Read-only: mutating a
        /// submission from a script would put the script and the stored row out of sync
        /// with no audit trail.
        /// </summary>
        public IDictionary<string, object> Data { get { return _data; } }

        public bool Has(string fieldKey)
        {
            return !string.IsNullOrEmpty(fieldKey) && _data.ContainsKey(fieldKey);
        }

        /// <summary>Value as text, or <paramref name="fallback"/> when absent/null.</summary>
        public string GetString(string fieldKey, string fallback = "")
        {
            object v;
            if (string.IsNullOrEmpty(fieldKey) || !_data.TryGetValue(fieldKey, out v) || v == null)
                return fallback;
            return Convert.ToString(v, CultureInfo.InvariantCulture) ?? fallback;
        }

        /// <summary>Value as a number, or <paramref name="fallback"/> when absent/unparseable.</summary>
        public decimal GetDecimal(string fieldKey, decimal fallback = 0m)
        {
            var raw = GetString(fieldKey, null);
            if (string.IsNullOrWhiteSpace(raw)) return fallback;
            decimal parsed;
            return decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out parsed)
                ? parsed
                : fallback;
        }

        public int GetInt(string fieldKey, int fallback = 0)
        {
            var raw = GetString(fieldKey, null);
            if (string.IsNullOrWhiteSpace(raw)) return fallback;
            int parsed;
            return int.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out parsed)
                ? parsed
                : fallback;
        }

        public bool GetBool(string fieldKey, bool fallback = false)
        {
            var raw = GetString(fieldKey, null);
            if (string.IsNullOrWhiteSpace(raw)) return fallback;
            raw = raw.Trim();
            if (raw.Equals("true", StringComparison.OrdinalIgnoreCase) || raw == "1" ||
                raw.Equals("yes", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("on", StringComparison.OrdinalIgnoreCase)) return true;
            if (raw.Equals("false", StringComparison.OrdinalIgnoreCase) || raw == "0" ||
                raw.Equals("no", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("off", StringComparison.OrdinalIgnoreCase)) return false;
            return fallback;
        }

        public DateTime? GetDate(string fieldKey)
        {
            var raw = GetString(fieldKey, null);
            if (string.IsNullOrWhiteSpace(raw)) return null;
            DateTime parsed;
            return DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out parsed)
                ? parsed
                : (DateTime?)null;
        }

        // ── What a script can write ───────────────────────────────────────────────

        /// <summary>
        /// Values the script computed. They are stored on the run record so an admin can
        /// see what the script decided, and a workflow started later can read them.
        /// </summary>
        public IDictionary<string, object> Variables { get { return _variables; } }

        public void SetVariable(string key, object value)
        {
            if (string.IsNullOrWhiteSpace(key)) return;
            _variables[key.Trim()] = value;
        }

        private readonly Dictionary<string, object> _changes =
            new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// [Automation v2] Change a submitted value — normalise a phone number, upper-case a
        /// country code, encrypt a national ID before it is stored.
        ///
        /// Only <see cref="Automation.AutomationStage.PreInsert"/> and
        /// <see cref="Automation.AutomationStage.PreValidate"/> can do this, because only they run
        /// before the row is written. At a post-commit stage the call is REFUSED rather than
        /// quietly ignored: a script that believes it rewrote a stored value and did not is a data
        /// bug that surfaces months later, in a report.
        /// </summary>
        public void SetValue(string fieldKey, object value)
        {
            if (string.IsNullOrWhiteSpace(fieldKey)) return;
            if (!CanAbort)
                throw new InvalidOperationException(
                    "ctx.SetValue is only available before the submission is written (PreValidate / " +
                    "PreInsert). At the " + Stage + " stage the row already exists — use ctx.Actions " +
                    "to update it, or move this script to the PreInsert stage.");

            var key = fieldKey.Trim();
            _data[key] = value;
            _changes[key] = value;
        }

        /// <summary>Values <see cref="SetValue"/> changed, for the pipeline to apply. Never null.</summary>
        public IDictionary<string, object> PendingChanges { get { return _changes; } }

        public IList<ScriptLogEntry> Logs { get { return _logs; } }

        // ── What a script can reach outside itself ────────────────────────────────

        /// <summary>
        /// [v20260813-02] Outbound HTTP with the site's outbound-URL guard attached, a bounded
        /// timeout, a response cap, and a line in the run record per call. Null only on a host that
        /// registered no HTTP capability.
        ///
        /// At full trust a script may also use HttpClient directly; this is the shorter and safer
        /// way to say the same thing, and it is the one to use when any part of the URL came from
        /// the submission.
        /// </summary>
        public IScriptHttp Http { get; set; }

        /// <summary>
        /// [v20260813-02] Parameterised SQL against the connections an administrator registered by
        /// name — the same catalog Form Settings → Database resolves from. A script names a
        /// connection and never carries a connection string.
        /// </summary>
        public IScriptDatabase Db { get; set; }

        // ── Automation v2 capability rail ─────────────────────────────────────────
        //
        // Named actions and named endpoints: the script supplies parameters, the site's automation
        // catalog supplies the SQL, the URL and the secret. See MegaForm.Core.Automation.
        //
        // Both of the v1 members above stay for scripts already written against them. New scripts
        // should use these: an action name survives an export to another site as a name that either
        // exists there or fails loudly, where an inline SQL statement silently runs against whatever
        // schema it lands on.

        /// <summary>Named SQL actions — <c>await ctx.Actions.ExecuteNamedActionAsync("crm-insert-lead", new {…})</c>.</summary>
        public Automation.IAutomationDbCapability Actions { get; set; }

        /// <summary>Named HTTP endpoints — <c>await ctx.Api.PostJsonAsync("hubspot-lead", payload)</c>.</summary>
        public Automation.IAutomationHttpCapability Api { get; set; }

        public Automation.IAutomationNotifyCapability Notify { get; set; }
        public Automation.IAutomationIdentityCapability Identity { get; set; }
        public Automation.IAutomationDocumentCapability Documents { get; set; }
        public Automation.IAutomationFileCapability Files { get; set; }
        public Automation.IAutomationQueueCapability Queue { get; set; }
        public Automation.IAutomationJobCapability Jobs { get; set; }

        /// <summary>
        /// What the visitor sees. Setting <c>SuccessMessage</c> or <c>RedirectUrl</c> overrides the
        /// form's configured post-submit experience for this submission only.
        /// </summary>
        public Automation.AutomationResponse Response { get; } = new Automation.AutomationResponse();

        /// <summary>
        /// Which pipeline stage this run belongs to. A script can branch on it when the same source
        /// is attached to more than one stage — and, more usefully, can assert on it: only
        /// <see cref="Automation.AutomationStage.PreInsert"/> and
        /// <see cref="Automation.AutomationStage.PreValidate"/> can actually stop a submission.
        /// </summary>
        public Automation.AutomationStage Stage { get; set; } = Automation.AutomationStage.PostCommit;

        /// <summary>
        /// True when <see cref="Fail"/> at this stage aborts the submission rather than merely
        /// recording a failure. Post-commit stages cannot undo a committed row, and a script that
        /// believes otherwise is the most expensive misunderstanding this feature can produce.
        /// </summary>
        public bool CanAbort
        {
            get
            {
                return Stage == Automation.AutomationStage.PreValidate
                    || Stage == Automation.AutomationStage.PreInsert;
            }
        }

        /// <summary>Append a line to the run record. Silently ignored past 200 lines.</summary>
        public void Log(string message)
        {
            if (_logs.Count >= MaxLogEntries) return;
            var text = message ?? string.Empty;
            if (text.Length > MaxLogMessageChars) text = text.Substring(0, MaxLogMessageChars);
            _logs.Add(new ScriptLogEntry { TimestampUtc = DateTime.UtcNow, Message = text });
        }

        /// <summary>
        /// Mark this run as failed.
        ///
        /// At <see cref="Automation.AutomationStage.PreValidate"/> and
        /// <see cref="Automation.AutomationStage.PreInsert"/> this ABORTS the submission: nothing is
        /// written, and this message is what the visitor is told. At PostCommit and AsyncWorker the
        /// row already exists and cannot be withdrawn, so the failure is recorded instead.
        /// <see cref="CanAbort"/> says which one applies to the current run.
        /// </summary>
        public void Fail(string message)
        {
            Failed = true;
            FailureMessage = string.IsNullOrWhiteSpace(message) ? "Script reported a failure." : message.Trim();
        }

        public bool Failed { get; private set; }
        public string FailureMessage { get; private set; }
    }
}
