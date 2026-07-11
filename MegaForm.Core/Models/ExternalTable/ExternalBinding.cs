using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models.ExternalTable
{
    /// <summary>
    /// [ATBE P1] Binds one MegaForm form to one table in a customer database.
    ///
    /// Server-owned on purpose: it lives in its own table, NOT in FormInfo.SchemaJson, because the
    /// builder posts SchemaJson back verbatim — a binding stored there could be edited by anyone who
    /// can save a form, and pointing MegaForm at a different table or connection is not a design
    /// choice, it is a data-access decision.
    /// </summary>
    public class ExternalBinding
    {
        public int FormId { get; set; }
        /// <summary>Allow-listed server-side. Never accepted from a client request body.</summary>
        public string ConnectionKey { get; set; }
        public string DatabaseType { get; set; }
        public string Schema { get; set; }
        public string Table { get; set; }
        /// <summary>The full CapabilityProfile as JSON, frozen at bind time.</summary>
        public string ProfileJson { get; set; }
        /// <summary>Re-checked before every write. If the DBA changed the table under us, we stop.</summary>
        public string ProfileHash { get; set; }
        /// <summary>readwrite | insertonly | readonly | unsupported — never above what the probe allowed.</summary>
        public string Mode { get; set; }
        public bool TimeColumnConfirmed { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }

    /// <summary>Which row of the customer's table an anchor submission id stands for.</summary>
    public class ExternalRowRef
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        /// <summary>JSON array of the key values, in key ordinal order. Supports composite and GUID keys,
        /// which an int SubmissionId could never carry.</summary>
        public string RowKeyJson { get; set; }
    }

    public interface IExternalBindingStore
    {
        ExternalBinding GetByForm(int formId);
        void Save(ExternalBinding binding);
        void Delete(int formId);
        /// <summary>Forms bound to an external table. Used to keep them out of aggregate views.</summary>
        List<int> BoundFormIds();
    }

    /// <summary>
    /// Maps customer rows to MegaForm submission ids ("anchor rows").
    ///
    /// Why anchors at all: the dashboard's detail/status/delete routes carry ONLY a submissionId —
    /// the form id is derived from the row that id resolves to. If ids came from the customer's table
    /// they would collide with MF_Submissions ids and silently open the wrong record. An anchor id is
    /// issued by MF_Submissions itself, so collisions are impossible, and workflow, files and
    /// submission links keep working because their foreign keys still find a row.
    /// </summary>
    public interface IExternalRowMapStore
    {
        /// <summary>Anchor ids for these row keys, creating the missing ones. Idempotent: two concurrent
        /// list requests must not mint two ids for the same row.</summary>
        List<int> GetOrCreateAnchors(int formId, IList<string> rowKeyJson);
        ExternalRowRef Resolve(int submissionId);
    }
}
