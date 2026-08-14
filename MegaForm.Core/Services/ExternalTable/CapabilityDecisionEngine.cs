using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models.ExternalTable;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P0] The decision matrix. Every axis votes a maximum mode and the table gets the MINIMUM
    /// of those votes — one blocked axis downgrades the whole form. Nothing here is negotiable and
    /// nothing here is an LLM call: the same profile always yields the same mode.
    ///
    /// Ladder: unsupported &lt; readonly &lt; insertonly &lt; readwrite.
    /// </summary>
    public static class CapabilityDecisionEngine
    {
        private const string Unsupported = "unsupported";
        private const string ReadOnly = "readonly";
        private const string InsertOnly = "insertonly";
        private const string ReadWrite = "readwrite";

        private static int Rank(string mode)
        {
            switch (mode)
            {
                case ReadWrite: return 3;
                case InsertOnly: return 2;
                case ReadOnly: return 1;
                default: return 0;
            }
        }

        public static void Decide(CapabilityProfile p)
        {
            var caps = new CapabilityFacts();
            p.Capabilities = caps;

            string mode = ReadWrite;
            Action<string, string, string, string, string> vote = (cap, code, message, howToFix, severity) =>
            {
                if (Rank(cap) < Rank(mode)) mode = cap;
                if (code != null)
                    caps.Reasons.Add(new CapabilityReason { Code = code, Message = message, HowToFix = howToFix, Severity = severity });
            };

            // ---- Axis E: object + environment -------------------------------------------------
            // [i18n 2026-07-13] Reason texts are ENGLISH (RULE: no hard-coded Vietnamese
            // defaults). Codes stay stable — a future localized client can map Code → text.
            if (p.Object.SchemaCollision)
            {
                vote(Unsupported, "SCHEMA_COLLISION",
                    "Multiple tables named '" + p.Object.Name + "' exist in different schemas (" + string.Join(", ", p.Object.CollidingSchemas) + "). MegaForm will not guess.",
                    "Pick an explicit schema and probe again.", "error");
                Finalize(p, caps, mode);
                return;
            }
            if (p.Object.Type == "UNKNOWN")
            {
                vote(Unsupported, "OBJECT_NOT_FOUND",
                    "This table/view was not found, or the DB account cannot see it.",
                    "Check the table name and the connection account's permissions.", "error");
                Finalize(p, caps, mode);
                return;
            }
            if (p.Columns.Count == 0)
            {
                vote(Unsupported, "NO_COLUMNS_VISIBLE",
                    "No columns could be read. The DB account may be blocked from reading metadata.",
                    "Grant VIEW DEFINITION (or SELECT) on the table to the connection account.", "error");
                Finalize(p, caps, mode);
                return;
            }
            if (!p.Permissions.Select)
            {
                vote(Unsupported, "PERM_NO_SELECT",
                    "The DB account has no SELECT permission on " + p.Object.Schema + "." + p.Object.Name + ".",
                    "Grant SELECT and probe again.", "error");
                Finalize(p, caps, mode);
                return;
            }

            if (p.Object.Type == "VIEW")
                vote(ReadOnly, "OBJECT_IS_VIEW",
                    "This object is a VIEW — MegaForm reads it, never writes.",
                    "Bind to the underlying table if submissions are needed.", "info");

            if (string.Equals(p.Connection.Updateability, "READ_ONLY", StringComparison.OrdinalIgnoreCase))
                vote(ReadOnly, "DB_READ_ONLY",
                    "The database is READ_ONLY (replica or ApplicationIntent=ReadOnly) — write permissions are meaningless here.",
                    "Point the connection at the primary if writes are needed.", "warning");

            if (p.Connection.Provider != "SqlServer" && p.Coverage.MetadataLevel != "L2")
                vote(ReadOnly, "PROVIDER_METADATA_LIMITED",
                    "Provider " + p.Connection.Provider + " does not expose enough metadata (keys/identity/defaults) for safe writes.",
                    "Use SQL Server, or declare the key manually.", "warning");

            if (p.Connection.IsDbOwner)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "RLS_DBO_BYPASS",
                    Message = "The connection account is db_owner — if the table has Row-Level Security, RLS IS BYPASSED and MegaForm sees ALL data.",
                    HowToFix = "Downgrade the app account to least privilege (SELECT/INSERT/UPDATE on just the tables it needs).",
                    Severity = "warning",
                });

            // ---- Axis W: permissions ----------------------------------------------------------
            if (!p.Permissions.Insert)
                vote(ReadOnly, "PERM_NO_INSERT",
                    "The DB account is read-only — new submissions cannot be written.",
                    "Grant INSERT on this table to enable submissions.", "info");

            if (!p.Permissions.Update)
                vote(InsertOnly, "PERM_NO_UPDATE",
                    "Records cannot be edited: the DB account has no UPDATE permission.",
                    "Grant UPDATE to edit existing data. (Read/Archive status still works — MegaForm stores it separately, never in your table.)", "info");

            // ---- Axis K: key ------------------------------------------------------------------
            if (!p.Key.Trusted)
            {
                var detail = p.Key.Source == "none"
                    ? "The table has no trusted primary key or unique index."
                    : "The detected key is not trusted (sample of " + p.Key.Verified.Sampled + " rows: "
                      + p.Key.Verified.Duplicates + " duplicates, " + p.Key.Verified.Nulls + " nulls).";
                vote(InsertOnly, "NO_TRUSTED_KEY",
                    detail + " MegaForm cannot safely address a single row → View detail/Edit/Delete are disabled.",
                    "Add a PRIMARY KEY or UNIQUE INDEX (on a NOT NULL column) and probe again.", "warning");
            }

            // ---- Axis C: columns --------------------------------------------------------------
            var blocking = p.Columns
                .Where(c => c.Unsupported && !c.Nullable && !c.HasDefault && !c.IsIdentity && !c.IsComputed)
                .ToList();
            if (blocking.Count > 0)
                vote(ReadOnly, "UNSUPPORTED_REQUIRED_COLUMN",
                    "Required column(s) " + string.Join(", ", blocking.Select(c => c.Name + " (" + c.SqlType + ")"))
                    + " use types MegaForm cannot represent → no valid INSERT is possible.",
                    "Give the column a DB DEFAULT, or make it NULLable, then probe again.", "error");

            var encrypted = p.Columns.Where(c => c.IsEncrypted).ToList();
            if (encrypted.Count > 0)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "ALWAYS_ENCRYPTED_COLUMNS",
                    Message = "Encrypted columns (Always Encrypted): " + string.Join(", ", encrypted.Select(c => c.Name)) + " — they cannot be filtered or sorted.",
                    HowToFix = "Enable 'Column Encryption Setting=Enabled' on the connection if these columns must be read/written.",
                    Severity = "warning",
                });

            if (p.Object.HasInsteadOfTrigger)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "INSTEAD_OF_TRIGGER",
                    Message = "The table has an INSTEAD OF trigger — SCOPE_IDENTITY() would return the wrong key; MegaForm switches to OUTPUT..INTO.",
                    HowToFix = "Nothing to do; just be aware the trigger may transform written data.",
                    Severity = "warning",
                });
            else if (p.Object.TriggerKnowledge == "unknown")
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "TRIGGER_UNKNOWN",
                    Message = "Could not read the table's trigger list — MegaForm assumes a trigger EXISTS (fail-safe) and uses OUTPUT..INTO.",
                    HowToFix = "Grant read on sys.triggers for a precise diagnosis.",
                    Severity = "info",
                });

            // ---- Axis T: semantics ------------------------------------------------------------
            caps.HasTimestamp = p.Semantics.Time != null;
            caps.HasStatus = p.Semantics.Status != null;
            caps.StatusFilterable = p.Semantics.Status != null && p.Semantics.Status.Filterable;

            if (p.Semantics.Time == null)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "NO_TIME_COLUMN",
                    Message = "No time column was found → lists sort by key descending instead of by date.",
                    HowToFix = "Point at a date column manually if the table has one (unconventional name).",
                    Severity = "info",
                });
            else if (!p.Semantics.Time.ConfirmedByAdmin)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "TIME_COLUMN_NEEDS_CONFIRM",
                    Message = "Proposed time column: " + p.Semantics.Time.Name + " (" + p.Semantics.Time.Evidence + "). The machine CANNOT infer the timezone (UTC vs local).",
                    HowToFix = "Confirm the column and timezone — a wrong choice shifts every time shown on the dashboard.",
                    Severity = "warning",
                });

            // ---- Axis S: scale + index --------------------------------------------------------
            caps.RequiresFilterBeforeList = p.Size.Bucket == "XL";
            if (p.Size.Bucket == "XL")
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "BIG_TABLE_FILTER_REQUIRED",
                    Message = "Very large table (≈" + p.Size.ApproxRows.ToString("N0") + " rows) — a filter is required before listing; exact totals are not shown.",
                    HowToFix = "Nothing to do — this is the only way to avoid scanning the whole table.",
                    Severity = "info",
                });

            var sortTarget = p.Semantics.Time != null
                ? p.Columns.FirstOrDefault(c => string.Equals(c.Name, p.Semantics.Time.Name, StringComparison.OrdinalIgnoreCase))
                : null;
            if (sortTarget != null && !sortTarget.Sortable && p.Size.Bucket != "S")
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "NO_INDEX_FOR_SORT",
                    Message = "Column " + sortTarget.Name + " has no index — sorting by it scans all ≈" + p.Size.ApproxRows.ToString("N0") + " rows.",
                    HowToFix = "CREATE INDEX IX_" + p.Object.Name + "_" + sortTarget.Name + " ON " + p.Object.Schema + "." + p.Object.Name + " (" + sortTarget.Name + " DESC);  — a suggested script for your DBA; MegaForm NEVER runs DDL itself.",
                    Severity = "warning",
                });

            // ---- Conclusions -------------------------------------------------------------------
            Finalize(p, caps, mode);
        }

        private static void Finalize(CapabilityProfile p, CapabilityFacts caps, string mode)
        {
            caps.Mode = mode;

            bool addressable = p.Key.Trusted;
            caps.CanInsert = Rank(mode) >= Rank(InsertOnly) && p.Permissions.Insert;
            caps.CanUpdate = mode == ReadWrite && p.Permissions.Update && addressable;
            caps.CanDelete = mode == ReadWrite && p.Permissions.Delete && addressable;
            caps.CanOpenDetail = Rank(mode) >= Rank(ReadOnly) && addressable;
            caps.CanSort = Rank(mode) >= Rank(ReadOnly) && p.Columns.Any(c => c.Sortable);
            caps.CanFilterServer = Rank(mode) >= Rank(ReadOnly) && p.Columns.Any(c => c.Filterable);
            caps.CanExport = Rank(mode) >= Rank(ReadOnly);

            // Never aggregatable: the All-Forms view fans out across forms and merges client-side,
            // which would drag the customer's whole table through the browser.
            caps.Aggregatable = false;

            if (Rank(mode) >= Rank(ReadOnly))
            {
                if (p.FullText.Enabled && p.Columns.Any(c => c.Searchable && c.IsLob))
                    caps.CanSearch = "fulltext";
                else if (p.Size.Bucket == "S" && p.Columns.Any(c => c.Searchable))
                    caps.CanSearch = "substring";
                else if (p.Columns.Any(c => c.Searchable))
                    caps.CanSearch = "prefix";
                else
                    caps.CanSearch = "off";
            }

            var actions = new List<string>();
            if (Rank(mode) >= Rank(ReadOnly)) actions.Add("read");
            if (caps.CanInsert) actions.Add("create");
            if (caps.CanUpdate) actions.Add("update");
            if (caps.CanDelete) actions.Add("delete");
            caps.AllowedActions = actions;
        }
    }
}
