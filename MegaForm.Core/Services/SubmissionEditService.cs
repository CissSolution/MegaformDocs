using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    /// <summary>One field an edit actually changed, as it will read in the audit trail.</summary>
    public sealed class SubmissionFieldChange
    {
        public string Key { get; set; }
        public string Before { get; set; }
        public string After { get; set; }
    }

    public sealed class SubmissionEditResult
    {
        public bool Allowed { get; set; } = true;
        public string ErrorMessage { get; set; }

        /// <summary>What may actually be written. Fields the actor could not edit keep their stored value.</summary>
        public Dictionary<string, object> Data { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        /// <summary>Fields whose stored value the incoming payload tried to change but was not allowed to.</summary>
        public List<string> Rejected { get; } = new List<string>();

        /// <summary>Fields that really changed, for the audit row. Empty means nothing to write.</summary>
        public List<SubmissionFieldChange> Changes { get; } = new List<SubmissionFieldChange>();

        public bool HasChanges { get { return Changes.Count > 0; } }
    }

    /// <summary>
    /// [SubmissionEdit v20260802] The one place an existing submission's data may be prepared for
    /// writing.
    ///
    /// Editing an existing submission used to skip the permission model entirely. Both hosts checked
    /// only whether the actor could touch the submission AT ALL — DNN
    /// (MegaFormApiController.UpdateData) and Oqtane (MegaFormController.UpdateSubmissionData) each
    /// called CanMutateSubmission and then serialised the client's dictionary straight into
    /// MF_Submissions.DataJson. Anyone who passed that one gate could therefore write EVERY field,
    /// including ones their role may only read (readOnlyIf), ones hidden from them, and ones in a
    /// step their role may not edit. The submit path has enforced all of that since it was written;
    /// the edit path never did.
    ///
    /// So an edit now runs through exactly the same gate a submit does —
    /// ServerSidePermissionEnforcementService.EnforceSubmit, with the STORED values passed as
    /// existingData so a rejected write is replaced by what is already in the database rather than
    /// dropped (dropping it would blank the field instead of protecting it).
    ///
    /// It also reports what changed, because an audit row that says "someone edited this" without
    /// saying WHAT is not an audit trail. Values are compared and recorded as their invariant string
    /// form: the audit line has to survive being read a year later by a human, not round-trip a type.
    /// </summary>
    public static class SubmissionEditService
    {
        public static SubmissionEditResult PrepareEdit(
            FormInfo form,
            FormSchema schema,
            IDictionary<string, object> incoming,
            IDictionary<string, object> stored,
            UserContext actor,
            IEnumerable<FormPermissionInfo> permissions,
            IDictionary<string, string> query = null)
        {
            var result = new SubmissionEditResult();
            var storedData = Normalize(stored);
            var incomingData = Normalize(incoming);

            ServerSidePermissionEnforcementResult enforcement;
            try
            {
                enforcement = ServerSidePermissionEnforcementService.EnforceSubmit(
                    form,
                    schema,
                    incomingData,
                    actor,
                    permissions ?? Enumerable.Empty<FormPermissionInfo>(),
                    query,
                    storedData);
            }
            catch (Exception)
            {
                // Fail CLOSED. An enforcement pass that threw has decided nothing, and writing the
                // client's payload because the guard broke is how a guard becomes decoration.
                result.Allowed = false;
                result.ErrorMessage = "Permission check failed.";
                return result;
            }

            if (!enforcement.Allowed)
            {
                result.Allowed = false;
                result.ErrorMessage = enforcement.ErrorMessage ?? "You do not have permission to edit this submission.";
                return result;
            }

            var allowed = enforcement.Data ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            // Start from what is stored so a field the payload never mentioned is not silently
            // dropped: this endpoint takes a whole dictionary, and a partial one must not erase the
            // rest of the record.
            result.Data = new Dictionary<string, object>(storedData, StringComparer.OrdinalIgnoreCase);
            foreach (var pair in allowed)
                result.Data[pair.Key] = pair.Value;

            foreach (var key in incomingData.Keys)
            {
                var wanted = Text(incomingData[key]);
                object storedValue;
                var had = storedData.TryGetValue(key, out storedValue);
                var before = had ? Text(storedValue) : null;

                object finalValue;
                var kept = result.Data.TryGetValue(key, out finalValue);
                var after = kept ? Text(finalValue) : null;

                if (string.Equals(wanted, after, StringComparison.Ordinal))
                {
                    if (!string.Equals(before, after, StringComparison.Ordinal))
                        result.Changes.Add(new SubmissionFieldChange { Key = key, Before = before, After = after });
                }
                else
                {
                    // The payload asked for something the enforcement pass did not grant.
                    result.Rejected.Add(key);
                }
            }

            return result;
        }

        /// <summary>
        /// A one-line summary for MF_AuditLog.Details. Deliberately field-by-field and value-bearing:
        /// "who edited this submission" is answered by the row's own columns, and the question that
        /// actually gets asked later is "what did they change it from".
        /// </summary>
        public static string DescribeChanges(IEnumerable<SubmissionFieldChange> changes, int max = 40)
        {
            if (changes == null)
                return string.Empty;

            var list = changes.ToList();
            var shown = list.Take(max)
                .Select(c => c.Key + ": " + Quote(c.Before) + " -> " + Quote(c.After));

            var text = string.Join("; ", shown);
            if (list.Count > max)
                text += "; (+" + (list.Count - max) + " more)";
            return text;
        }

        private static string Quote(string value)
        {
            if (value == null) return "(empty)";
            if (value.Length > 120) value = value.Substring(0, 117) + "...";
            return "\"" + value + "\"";
        }

        private static Dictionary<string, object> Normalize(IDictionary<string, object> source)
        {
            var copy = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (source == null)
                return copy;
            foreach (var pair in source)
                if (!string.IsNullOrWhiteSpace(pair.Key))
                    copy[pair.Key] = pair.Value;
            return copy;
        }

        /// <summary>
        /// Invariant text for comparison and for the audit line. Culture matters here: a decimal
        /// rendered under one culture and re-read under another would show as a change that never
        /// happened, and this repo has already been bitten by culture-dependent formatting writing
        /// values into the wrong place.
        /// </summary>
        private static string Text(object value)
        {
            if (value == null) return null;
            if (value is string s) return s;
            if (value is bool b) return b ? "true" : "false";
            if (value is IFormattable f) return f.ToString(null, CultureInfo.InvariantCulture);
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }
    }
}
