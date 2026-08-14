/*
 * MegaForm.Core/Models/AfterSubmitScriptSettings.cs
 *
 * [AfterSubmitScript v20260813-01] Per-form configuration for the after-submit C# hook.
 * Lives at FormSchema.Settings.AfterSubmitScript.
 *
 * ── Why this block is not like the others ────────────────────────────────────────
 * Saving C# that the server compiles and runs IS remote code execution, on purpose.
 * "Edit module" on DNN/Oqtane is a CONTENT-EDITOR permission: on a normal site several
 * people hold it who are not administrators, and none of them are expected to be able to
 * run code on the server. So this block carries its own approval record and the runtime
 * refuses anything that does not match it:
 *
 *   Source        — what the author typed.
 *   ApprovedHash  — SHA-256 of the source AT THE MOMENT a host/superuser saved it.
 *   ApprovedBy*   — who that was, and when.
 *
 * AfterSubmitScriptGuard.IsRunnable() requires ApprovedHash == SHA256(Source) *and* a
 * non-zero ApprovedByUserId. That makes every other write path inert by construction:
 * a form import, a template install, a gallery download, a builder Save by a content
 * editor, or a direct row edit can all put Source into the schema, and none of them can
 * make it run, because none of them can produce a matching approval record — only the
 * host-gated endpoint writes one. The gate is therefore not "the endpoint checks a role"
 * (which would be one missing attribute away from an IDOR); the *data* is unrunnable
 * until a host signs it.
 *
 * That is rule 1 and rule 3 of CLAUDE.md applied to a code-execution surface: never trust
 * the client for a security decision, and never let a plain [Authorize] stand in for a
 * real authority check.
 */

using System;
using Newtonsoft.Json;

namespace MegaForm.Core.Models
{
    /// <summary>
    /// One after-submit script hook. Absent/disabled on every existing form, so adding
    /// this block changes nothing for a site that never turns it on.
    /// </summary>
    public class FormAfterSubmitScriptSettings
    {
        [JsonProperty("enabled")]
        public bool Enabled { get; set; }

        /// <summary>"csharp" is the only shipped language. Anything else is refused at runtime.</summary>
        [JsonProperty("language")]
        public string Language { get; set; } = "csharp";

        /// <summary>
        /// The script body. By default this is the body of Run(ctx) — statements only,
        /// with `ctx` in scope. A source that declares its own type implementing
        /// ISubmissionScript is compiled verbatim instead.
        /// </summary>
        [JsonProperty("source")]
        public string Source { get; set; }

        /// <summary>
        /// SHA-256 (hex, lowercase) of <see cref="Source"/> as approved by a host/superuser.
        /// The runner compares this against a freshly computed hash on every run; a mismatch
        /// means the source was changed by something other than the host-gated endpoint, and
        /// the script does not run.
        /// </summary>
        [JsonProperty("approvedHash")]
        public string ApprovedHash { get; set; }

        [JsonProperty("approvedByUserId")]
        public int ApprovedByUserId { get; set; }

        [JsonProperty("approvedByUserName")]
        public string ApprovedByUserName { get; set; }

        [JsonProperty("approvedOnUtc")]
        public DateTime? ApprovedOnUtc { get; set; }

        /// <summary>
        /// "continue" (default) — a script failure is logged and the submitter still sees
        /// the normal thank-you. "report" — the failure message is also returned to the
        /// caller. Neither undoes the submission: the row is committed before a script runs.
        /// </summary>
        [JsonProperty("onFailure")]
        public string OnFailure { get; set; } = "continue";

        /// <summary>
        /// How long the submit request waits for the script. Clamped to 1..60 by
        /// <see cref="AfterSubmitScriptGuard.ResolveTimeoutSeconds"/>.
        /// </summary>
        [JsonProperty("timeoutSeconds")]
        public int TimeoutSeconds { get; set; } = 10;

        public FormAfterSubmitScriptSettings Clone()
        {
            return new FormAfterSubmitScriptSettings
            {
                Enabled            = Enabled,
                Language           = Language,
                Source             = Source,
                ApprovedHash       = ApprovedHash,
                ApprovedByUserId   = ApprovedByUserId,
                ApprovedByUserName = ApprovedByUserName,
                ApprovedOnUtc      = ApprovedOnUtc,
                OnFailure          = OnFailure,
                TimeoutSeconds     = TimeoutSeconds
            };
        }
    }

    /// <summary>
    /// [Automation v2 20260813-01] The four lifecycle stages, each holding its own script.
    /// Lives at FormSchema.Settings.Automation.
    ///
    /// The stages are not interchangeable and the difference is not stylistic — it is where each
    /// one sits relative to the database commit:
    ///
    ///   PreValidate — before validation finishes. Blacklist, fraud, external checks. Can abort.
    ///   PreInsert   — inside the submit transaction, before the row exists. Normalise, encrypt,
    ///                 derive. Can abort, and the abort actually rolls back.
    ///   PostCommit  — after the row is committed. Notify, sync, provision. CANNOT abort.
    ///   AsyncWorker — off a queue, later. Heavy documents, slow third parties, command presets.
    ///
    /// Every one of them carries its own approval record, because "a host approved this source" has
    /// to be true per stage: a script trusted to send an email after the fact is not automatically
    /// trusted to veto submissions.
    /// </summary>
    public class FormAutomationSettings
    {
        [JsonProperty("preValidate")]
        public FormAfterSubmitScriptSettings PreValidate { get; set; }

        [JsonProperty("preInsert")]
        public FormAfterSubmitScriptSettings PreInsert { get; set; }

        [JsonProperty("postCommit")]
        public FormAfterSubmitScriptSettings PostCommit { get; set; }

        [JsonProperty("asyncWorker")]
        public FormAfterSubmitScriptSettings AsyncWorker { get; set; }

        public FormAfterSubmitScriptSettings ForStage(MegaForm.Core.Automation.AutomationStage stage)
        {
            switch (stage)
            {
                case MegaForm.Core.Automation.AutomationStage.PreValidate: return PreValidate;
                case MegaForm.Core.Automation.AutomationStage.PreInsert:   return PreInsert;
                case MegaForm.Core.Automation.AutomationStage.AsyncWorker: return AsyncWorker;
                default:                                                   return PostCommit;
            }
        }

        public void SetStage(MegaForm.Core.Automation.AutomationStage stage, FormAfterSubmitScriptSettings value)
        {
            switch (stage)
            {
                case MegaForm.Core.Automation.AutomationStage.PreValidate: PreValidate = value; break;
                case MegaForm.Core.Automation.AutomationStage.PreInsert:   PreInsert = value;   break;
                case MegaForm.Core.Automation.AutomationStage.AsyncWorker: AsyncWorker = value; break;
                default:                                                   PostCommit = value;  break;
            }
        }

        public bool IsEmpty
        {
            get
            {
                return PreValidate == null && PreInsert == null && PostCommit == null && AsyncWorker == null;
            }
        }
    }

    /// <summary>
    /// Outcome of one script run, persisted to MF_FormScriptRuns and returned to the
    /// admin who pressed "Test run".
    /// </summary>
    public class AfterSubmitScriptRunResult
    {
        /// <summary>False when the script threw, called Fail(), timed out, or was refused.</summary>
        public bool Success { get; set; }

        /// <summary>
        /// True when the hook was not attempted at all — disabled, empty, unapproved, or
        /// no compiler installed. Distinguishing this from a failure matters: "did not run"
        /// and "ran and broke" need different answers from an admin.
        /// </summary>
        public bool Skipped { get; set; }

        public string SkipReason { get; set; }
        public string ErrorMessage { get; set; }
        public long DurationMs { get; set; }
        public string ScriptHash { get; set; }

        /// <summary>[Automation v2] Which stage produced this run.</summary>
        public string Stage { get; set; }

        /// <summary>
        /// [Automation v2] True only when the stage was allowed to stop the submission AND did.
        /// The caller must act on it: a PreInsert abort that the pipeline ignores is worse than no
        /// abort at all, because the script's author believes the veto worked.
        /// </summary>
        public bool Aborted { get; set; }

        /// <summary>[Automation v2] What the script asked the visitor to be shown.</summary>
        public string ResponseSuccessMessage { get; set; }
        public string ResponseRedirectUrl { get; set; }

        public System.Collections.Generic.List<string> Log { get; set; }
            = new System.Collections.Generic.List<string>();
        public System.Collections.Generic.Dictionary<string, object> Variables { get; set; }
            = new System.Collections.Generic.Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }
}
