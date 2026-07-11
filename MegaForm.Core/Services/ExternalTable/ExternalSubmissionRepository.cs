using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P1] Decorates ISubmissionRepository so that a form bound to a customer table reads its
    /// records LIVE from that table, while every other form behaves exactly as before.
    ///
    /// A decorator rather than a swap: a dozen services (workflow, email summaries, data repeater,
    /// starters…) resolve ISubmissionRepository from DI, and replacing it globally would change how
    /// every form in the site stores data. Routing happens per form, and an unbound form never even
    /// notices this class exists.
    ///
    /// Reads are live. There is no copy of the customer's data in MF_Submissions — only an anchor row
    /// per record we have shown, which exists so that a submission id can address it.
    /// </summary>
    public class ExternalSubmissionRepository : ISubmissionRepository
    {
        private readonly ISubmissionRepository _inner;
        private readonly IExternalBindingStore _bindings;
        private readonly IExternalRowMapStore _rowMap;
        private readonly ExternalTableQueryService _query;

        public ExternalSubmissionRepository(
            ISubmissionRepository inner,
            IExternalBindingStore bindings,
            IExternalRowMapStore rowMap,
            ExternalTableQueryService query)
        {
            _inner = inner;
            _bindings = bindings;
            _rowMap = rowMap;
            _query = query;
        }

        // ------------------------------------------------------------------ read

        public (List<SubmissionInfo> Items, int TotalCount) List(int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
        {
            var binding = formId > 0 ? _bindings.GetByForm(formId) : null;
            if (binding == null)
                return _inner.List(formId, status, search, dateFrom, dateTo, pageIndex, pageSize);

            var profile = Profile(binding);
            if (profile == null) return (new List<SubmissionInfo>(), 0);

            var page = _query.List(binding, profile, new ExternalTableQueryService.Query
            {
                Status = status,
                Search = search,
                DateFrom = dateFrom,
                DateTo = dateTo,
                PageIndex = pageIndex,
                PageSize = pageSize,
            });

            if (page.Rows.Count == 0) return (new List<SubmissionInfo>(), Math.Max(0, page.TotalCount));

            // One round trip for the whole page: minting anchors row by row would be N+1 against our
            // own database on every page of a 500k-row table.
            var anchorIds = _rowMap.GetOrCreateAnchors(formId, page.Rows.Select(r => r.RowKeyJson).ToList());

            var items = new List<SubmissionInfo>(page.Rows.Count);
            for (int i = 0; i < page.Rows.Count && i < anchorIds.Count; i++)
            {
                var r = page.Rows[i];
                items.Add(new SubmissionInfo
                {
                    SubmissionId = anchorIds[i],
                    FormId = formId,
                    DataJson = r.DataJson,
                    Status = r.Status,
                    SubmittedOnUtc = r.SubmittedOnUtc,
                });
            }

            return (items, Math.Max(0, page.TotalCount));
        }

        public SubmissionInfo Get(int submissionId)
        {
            var reference = _rowMap.Resolve(submissionId);
            if (reference == null) return _inner.Get(submissionId);

            var binding = _bindings.GetByForm(reference.FormId);
            var profile = binding != null ? Profile(binding) : null;
            if (profile == null) return null;

            var row = _query.GetByKey(binding, profile, reference.RowKeyJson);
            if (row == null) return null;   // the customer deleted the record in their own system

            // Status lives on the anchor, not in the customer's table: "read" and "archived" are
            // MegaForm's own bookkeeping and must never write to their columns.
            var anchor = _inner.Get(submissionId);

            return new SubmissionInfo
            {
                SubmissionId = submissionId,
                FormId = reference.FormId,
                DataJson = row.DataJson,
                Status = anchor != null && !string.IsNullOrEmpty(anchor.Status) ? anchor.Status : row.Status,
                SubmittedOnUtc = row.SubmittedOnUtc,
                ReadOnUtc = anchor != null ? anchor.ReadOnUtc : null,
                ModifiedOnUtc = anchor != null ? anchor.ModifiedOnUtc : null,
            };
        }

        /// <summary>External records have no EAV rows, and they do not need any: the query facade falls
        /// back to building the field snapshot from the schema plus DataJson when this is empty.</summary>
        public List<SubmissionValueInfo> GetValues(int submissionId)
        {
            return _rowMap.Resolve(submissionId) != null
                ? new List<SubmissionValueInfo>()
                : _inner.GetValues(submissionId);
        }

        // ------------------------------------------------------------------ write

        public int Insert(SubmissionInfo sub)
        {
            // P1 is read-only for customer tables. The anchor rows themselves are inserted through the
            // row-map store, which calls the inner repository directly — this path stays untouched so
            // that ordinary forms keep working.
            return _inner.Insert(sub);
        }

        public void InsertValues(int submissionId, List<SubmissionValueInfo> values)
        {
            if (_rowMap.Resolve(submissionId) != null) return;   // nothing to index for a live row
            _inner.InsertValues(submissionId, values);
        }

        /// <summary>Allowed for external records: it writes to the ANCHOR row, never to the customer's
        /// table. Marking a ticket "read" in MegaForm must not touch their Status column.</summary>
        public void UpdateStatus(int submissionId, string status)
        {
            _inner.UpdateStatus(submissionId, status);
        }

        public void UpdateData(int submissionId, string dataJson)
        {
            if (_rowMap.Resolve(submissionId) != null)
                throw new NotSupportedException("EXTERNAL_READONLY: editing records in the customer table is not enabled for this form.");
            _inner.UpdateData(submissionId, dataJson);
        }

        public void Delete(int submissionId)
        {
            if (_rowMap.Resolve(submissionId) != null)
                throw new NotSupportedException("EXTERNAL_READONLY: deleting records from the customer table is not enabled for this form.");
            _inner.Delete(submissionId);
        }

        public void BulkDelete(int formId, int[] submissionIds)
        {
            if (formId > 0 && _bindings.GetByForm(formId) != null)
                throw new NotSupportedException("EXTERNAL_READONLY: deleting records from the customer table is not enabled for this form.");
            _inner.BulkDelete(formId, submissionIds);
        }

        // ------------------------------------------------------------------ profile cache

        private static readonly object CacheLock = new object();
        private static readonly Dictionary<string, CapabilityProfile> Cache = new Dictionary<string, CapabilityProfile>();

        /// <summary>The profile is frozen at bind time and keyed by its own hash, so a re-bind against a
        /// changed table produces a new key rather than silently reusing the old picture.</summary>
        private static CapabilityProfile Profile(ExternalBinding b)
        {
            if (string.IsNullOrEmpty(b.ProfileJson)) return null;
            var key = b.FormId + "|" + (b.ProfileHash ?? string.Empty);

            lock (CacheLock)
            {
                CapabilityProfile cached;
                if (Cache.TryGetValue(key, out cached)) return cached;

                CapabilityProfile parsed;
                try { parsed = JsonConvert.DeserializeObject<CapabilityProfile>(b.ProfileJson); }
                catch { return null; }

                if (parsed != null) Cache[key] = parsed;
                return parsed;
            }
        }
    }
}
