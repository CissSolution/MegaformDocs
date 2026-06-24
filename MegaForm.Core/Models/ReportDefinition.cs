using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MegaForm.Core.Models
{
    // ============================================================
    // B55 Reporting System — Core Models
    // ============================================================
    // Every report is a thin row in MF_ReportDefinitions whose
    // DefinitionJson holds the full ReportDefinitionBody structure
    // (data source + filters + columns + metrics + visuals).
    //
    // The runtime materializes Body lazily; storing the whole shape
    // as a single JSON blob keeps the schema flexible while still
    // letting us index/filter on PortalId + AppScope at the DB.
    // ============================================================

    /// <summary>
    /// Row-level shape that mirrors the MF_ReportDefinitions table.
    /// </summary>
    public sealed class ReportDefinitionInfo
    {
        public int ReportId { get; set; }
        public int PortalId { get; set; }
        public string Name { get; set; }
        public string AppScope { get; set; }
        public string DefinitionJson { get; set; }
        public int? CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }
    }

    /// <summary>
    /// The deserialised body of <see cref="ReportDefinitionInfo.DefinitionJson"/>.
    /// Stored as JSON so we can extend the report shape without a schema
    /// migration. Author-time UI binds against these property names.
    /// </summary>
    public sealed class ReportDefinitionBody
    {
        [JsonProperty("dataSource")]
        public ReportDataSource DataSource { get; set; } = new ReportDataSource();

        [JsonProperty("filters")]
        public List<ReportFilter> Filters { get; set; } = new List<ReportFilter>();

        [JsonProperty("columns")]
        public List<ReportColumn> Columns { get; set; } = new List<ReportColumn>();

        [JsonProperty("metrics")]
        public List<ReportMetric> Metrics { get; set; } = new List<ReportMetric>();

        [JsonProperty("visuals")]
        public List<ReportVisual> Visuals { get; set; } = new List<ReportVisual>();
    }

    /// <summary>
    /// Identifies what the report is reading. The MVP implementation
    /// targets <c>"submissions"</c> only (data sourced from
    /// MF_SubmissionValues + MF_Submissions).
    /// </summary>
    public sealed class ReportDataSource
    {
        [JsonProperty("kind")]
        public string Kind { get; set; } = "submissions";

        [JsonProperty("formId")]
        public int FormId { get; set; }

        /// <summary>Optional secondary scope (currently unused).</summary>
        [JsonProperty("appScope")]
        public string AppScope { get; set; }
    }

    public sealed class ReportFilter
    {
        [JsonProperty("fieldKey")]
        public string FieldKey { get; set; }

        /// <summary>eq | ne | gt | lt | gte | lte | contains | in | between</summary>
        [JsonProperty("op")]
        public string Op { get; set; } = "eq";

        [JsonProperty("value")]
        public string Value { get; set; }

        [JsonProperty("value2")]
        public string Value2 { get; set; }
    }

    public sealed class ReportColumn
    {
        [JsonProperty("fieldKey")]
        public string FieldKey { get; set; }

        [JsonProperty("label")]
        public string Label { get; set; }

        /// <summary>text | number | date — drives formatting + sort kind.</summary>
        [JsonProperty("kind")]
        public string Kind { get; set; } = "text";

        [JsonProperty("width")]
        public int? Width { get; set; }
    }

    public sealed class ReportMetric
    {
        [JsonProperty("fieldKey")]
        public string FieldKey { get; set; }

        [JsonProperty("label")]
        public string Label { get; set; }

        /// <summary>count | sum | avg | min | max</summary>
        [JsonProperty("aggregation")]
        public string Aggregation { get; set; } = "count";
    }

    public sealed class ReportVisual
    {
        /// <summary>table | bar | line | pie | kpi</summary>
        [JsonProperty("kind")]
        public string Kind { get; set; } = "table";

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("groupBy")]
        public string GroupBy { get; set; }

        [JsonProperty("metricKey")]
        public string MetricKey { get; set; }
    }

    /// <summary>
    /// Single typed row in MF_SubmissionValues — the flat per-field index
    /// the B55 reporting runtime queries instead of re-parsing DataJson.
    /// </summary>
    public sealed class ReportFieldIndexInfo
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public string ValueText { get; set; }
        public decimal? ValueNumber { get; set; }
        public DateTime? ValueDate { get; set; }
    }
}
