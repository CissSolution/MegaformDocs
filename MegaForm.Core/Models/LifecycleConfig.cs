/*
 * MegaForm.Core/Models/LifecycleConfig.cs
 *
 * Sprint Option A · R2 — typed contract for the CRUD lifecycle hook
 * runner (LifecycleRunner). Hooks live under
 *
 *   FormSchema.Settings.Lifecycle.{PreInsert | PostInsert | PreUpdate |
 *                                  PostUpdate | PreDelete | PostDelete}
 *
 * and (per DataGrid widget)
 *
 *   FormField.WidgetProps.rowLifecycle.{PreInsert | PostInsert | PreDelete}
 *
 * Decisions locked in the 2026-05-31 sprint kickoff:
 *   D1  Sync  — every hook runs in the same DB transaction as the
 *               submission. Pre-hook failure (or any hook with
 *               OnFailure=abort) rolls the whole submit back.
 *   D2  Both granularities — each hook has a Granularity = batch | row.
 *               Batch is the default; row fans out per child row.
 *   D4  SQL v1 — Runtime = sql is the only shipped value. The enum is
 *               here so a future "razor" runtime drops in cleanly.
 *
 * Audit auto-fill (WinForm minimal-pack): the runner ALWAYS injects
 *
 *   :_createdBy   :_createdOn   :_modifiedBy   :_modifiedOn
 *   :_portalId    :_ipAddress   :_formId       :_submissionId
 *
 * into ParameterMapping before binding. The hook author writes SQL
 * referencing those tokens without wiring them up explicitly.
 *
 * Badge: LifecycleConfig v20260531-R2-01
 */

using System.Collections.Generic;
using Newtonsoft.Json;

namespace MegaForm.Core.Models
{
    /// <summary>
    /// One hook slot. Multiple hooks can be configured per slot via
    /// MF_FormLifecycleConfig.ExecutionOrder (server pulls them ordered).
    /// </summary>
    public class LifecycleHook
    {
        [JsonProperty("enabled")]
        public bool Enabled { get; set; }

        /// <summary>
        /// "sql" (v1). "razor" reserved for a follow-up sprint.
        /// </summary>
        [JsonProperty("runtime")]
        public string Runtime { get; set; } = "sql";

        /// <summary>
        /// "batch" (default) — hook fires once per submission. Receives
        /// :rows as a JSON array parameter for DataGrid scopes.
        ///
        /// "row"   — hook fires once per child row. Receives flat
        /// :field_key parameters scoped to that row.
        /// </summary>
        [JsonProperty("granularity")]
        public string Granularity { get; set; } = "batch";

        [JsonProperty("connectionKey")]
        public string ConnectionKey { get; set; }

        /// <summary>
        /// SQL text with :tokens. Audit tokens (:_createdBy etc.) are
        /// always available without explicit ParameterMapping entry.
        /// </summary>
        [JsonProperty("sql")]
        public string Sql { get; set; }

        /// <summary>
        /// Optional explicit :token → field-key map. Audit tokens are
        /// implicit; only application-data bindings need a row here.
        /// </summary>
        [JsonProperty("parameterMapping")]
        public Dictionary<string, string> ParameterMapping { get; set; } = new Dictionary<string, string>();

        /// <summary>
        /// "abort" — failure rolls back the submit transaction.
        /// "continue" (default) — failure logged to MF_SubmissionHookErrors,
        ///                        submit proceeds.
        /// </summary>
        [JsonProperty("onFailure")]
        public string OnFailure { get; set; } = "continue";

        /// <summary>
        /// Optional execution order when multiple hooks share a slot.
        /// Lower number = earlier. Default 100.
        /// </summary>
        [JsonProperty("order")]
        public int Order { get; set; } = 100;
    }

    /// <summary>
    /// Form-level lifecycle hook container.
    /// Lives at FormSchema.Settings.Lifecycle.
    /// </summary>
    public class FormLifecycleSettings
    {
        [JsonProperty("preInsert")]
        public LifecycleHook PreInsert { get; set; }

        [JsonProperty("postInsert")]
        public LifecycleHook PostInsert { get; set; }

        [JsonProperty("preUpdate")]
        public LifecycleHook PreUpdate { get; set; }

        [JsonProperty("postUpdate")]
        public LifecycleHook PostUpdate { get; set; }

        [JsonProperty("preDelete")]
        public LifecycleHook PreDelete { get; set; }

        [JsonProperty("postDelete")]
        public LifecycleHook PostDelete { get; set; }
    }

    /// <summary>
    /// DataGrid-scoped lifecycle hooks. Lives at
    /// FormField.WidgetProps["rowLifecycle"] (object-shape).
    ///
    /// DataGrid scope only has Insert and Delete slots — there is no
    /// natural per-row Update during a single submission (the user is
    /// re-editing the whole rows[] array, which is treated as Delete-all
    /// + Insert-all internally; a future Update granularity could be
    /// added when diff-based persistence ships).
    /// </summary>
    public class DataGridRowLifecycle
    {
        [JsonProperty("preInsert")]
        public LifecycleHook PreInsert { get; set; }

        [JsonProperty("postInsert")]
        public LifecycleHook PostInsert { get; set; }

        [JsonProperty("preDelete")]
        public LifecycleHook PreDelete { get; set; }
    }

    /// <summary>
    /// Recognised hook slot names. Used by the persistence cache
    /// (MF_FormLifecycleConfig.HookSlot) and by the runner switch.
    /// </summary>
    public static class LifecycleHookSlots
    {
        public const string PreInsert  = "preInsert";
        public const string PostInsert = "postInsert";
        public const string PreUpdate  = "preUpdate";
        public const string PostUpdate = "postUpdate";
        public const string PreDelete  = "preDelete";
        public const string PostDelete = "postDelete";
    }

    /// <summary>
    /// Result of one hook execution — surfaced to LifecycleRunner.
    /// </summary>
    public class LifecycleHookResult
    {
        public bool Success { get; set; }
        public string HookSlot { get; set; }
        public string Scope { get; set; }
        public int RowsAffected { get; set; }
        public string ErrorMessage { get; set; }
        public int? SqlNumber { get; set; }
        public bool ShouldAbort { get; set; }
    }
}
