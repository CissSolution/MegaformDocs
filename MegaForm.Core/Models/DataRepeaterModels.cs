using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    // ══════════════════════════════════════════════════════════════════════════
    //  DataRepeater Models — v20260428-01
    //  Shared across DNN / Oqtane / Web.  C# 7.3 compatible (net472).
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Request from the TS widget to execute a data query.
    /// The widget sends formId + widgetKey; the server reads the actual SQL
    /// from the saved form schema (widgetProps) — the client NEVER sends raw SQL.
    /// </summary>
    public class DataRepeaterQueryRequest
    {
        public int    FormId    { get; set; }
        public string WidgetKey { get; set; }
        public string ParentId  { get; set; }   // for drill-down
        public int    Level     { get; set; }    // 0 = master, 1+ = detail
        public int    Page      { get; set; }
        public int    PageSize  { get; set; }
        public string SortCol   { get; set; }
        public string SortDir   { get; set; }   // "asc" / "desc"
        public string FilterJson { get; set; }  // JSON dict of filter values
    }

    /// <summary>
    /// Response sent back to the TS widget.
    /// Columns + rows (2D array) + metadata.
    /// </summary>
    public class DataRepeaterQueryResult
    {
        public List<DataRepeaterColumn> Columns { get; set; }
        public List<object[]>           Rows    { get; set; }
        public int    TotalRows     { get; set; }
        public int    Page          { get; set; }
        public int    PageSize      { get; set; }
        public long   ExecutionMs   { get; set; }
        public string Error         { get; set; }
        public bool   HasMore       { get; set; }

        public DataRepeaterQueryResult()
        {
            Columns = new List<DataRepeaterColumn>();
            Rows = new List<object[]>();
        }
    }

    public class DataRepeaterColumn
    {
        public string Name     { get; set; }  // token key (field key for the submissions source)
        public string Label    { get; set; }  // friendly header (falls back to Name client-side when null)
        public string DataType { get; set; }  // "string", "number", "date", "bool"
    }

    /// <summary>
    /// The widget configuration stored inside field.widgetProps in the form schema.
    /// Parsed server-side from the SchemaJson when a query request arrives.
    /// </summary>
    public class DataRepeaterWidgetConfig
    {
        // ── Data Source ──
        public string DataSource      { get; set; }  // "sql", "storedproc", "api", "megaform_submissions"
        public string ConnectionKey   { get; set; }  // references named connection in Settings
        public string ConnectionName  { get; set; }  // UI alias for ConnectionKey
        public string DatabaseType    { get; set; }  // "Sqlite", "SqlServer", "PostgreSql", "MySql"

        // ── MegaForm Submissions source (DataSource == "megaform_submissions") ──
        // Reads submissions through the standard Core submission repository (the same call
        // IMegaFormClient.Submissions.FindAsync makes) — NEVER raw SQL/JSON on the store.
        public int          SubmissionsFormId { get; set; }   // which form's submissions to list (0 = the host form)
        public string       StatusFilter      { get; set; }   // optional submission-Status filter ("" / "all" = no filter)
        public List<string> FieldWhitelist    { get; set; }   // PRIVACY GATE: only these field keys ever leave the server (empty = nothing public)
        public string       FieldWhitelistCsv { get; set; }   // comma-separated fallback (simple builder text field) used when FieldWhitelist is empty

        // ── Master Level ──
        public string MasterQuery     { get; set; }
        public string MasterTemplate  { get; set; }

        // ── Detail Level(s) — structured (from JSON edit) ──
        public List<DataRepeaterLevelConfig> DetailLevels { get; set; }

        // ── Detail Level(s) — flat (from builder UI) ──
        public string Detail1Query     { get; set; }
        public string Detail1Template  { get; set; }
        public string Detail1TriggerCol { get; set; }
        public string Detail2Query     { get; set; }
        public string Detail2Template  { get; set; }
        public string Detail2TriggerCol { get; set; }
        public string Detail3Query     { get; set; }
        public string Detail3Template  { get; set; }
        public string Detail3TriggerCol { get; set; }

        // ── Filters — structured ──
        public List<DataRepeaterFilterConfig> Filters { get; set; }

        // ── Filters — flat (from builder UI) ──
        public string Filter1Label  { get; set; }
        public string Filter1Type   { get; set; }
        public string Filter1Query  { get; set; }
        public string Filter1Param  { get; set; }
        public string Filter2Label  { get; set; }
        public string Filter2Type   { get; set; }
        public string Filter2Query  { get; set; }
        public string Filter2Param  { get; set; }

        // ── Display ──
        public int    PageSize        { get; set; }   // 0 = all
        public int    RefreshInterval { get; set; }   // seconds, 0 = off
        public string EmptyMessage    { get; set; }
        public string CssClass        { get; set; }
        public int    MaxRows         { get; set; }   // server-side hard cap

        // ── Export ──
        public bool   AllowExportCsv  { get; set; }
        public bool   AllowExportPdf  { get; set; }

        // ── Chart ──
        public string ChartType       { get; set; }   // null, "bar", "line", "pie"
        public string ChartLabelCol   { get; set; }
        public string ChartValueCol   { get; set; }

        // ── Grouped / Layout ──
        public string GroupByCol      { get; set; }   // column name to group by (accordion)
        public bool   GolfMode        { get; set; }   // enable golf scorecard styling

        public DataRepeaterWidgetConfig()
        {
            DataSource = "sql";
            DetailLevels = new List<DataRepeaterLevelConfig>();
            Filters = new List<DataRepeaterFilterConfig>();
            FieldWhitelist = new List<string>();
            PageSize = 50;
            MaxRows = 1000;
            EmptyMessage = "No data found.";
        }

        /// <summary>
        /// Reconstruct DetailLevels[] and Filters[] from flat builder props.
        /// Same logic as TS getProps().
        /// </summary>
        public void Normalize()
        {
            if (string.IsNullOrWhiteSpace(ConnectionKey) && !string.IsNullOrWhiteSpace(ConnectionName))
            {
                ConnectionKey = ConnectionName.Trim();
            }

            // Reconstruct DetailLevels from flat props if structured list is empty
            if (DetailLevels == null || DetailLevels.Count == 0)
            {
                DetailLevels = new List<DataRepeaterLevelConfig>();
                AddLevelIfPresent(Detail1Query, Detail1Template, Detail1TriggerCol);
                AddLevelIfPresent(Detail2Query, Detail2Template, Detail2TriggerCol);
                AddLevelIfPresent(Detail3Query, Detail3Template, Detail3TriggerCol);
            }

            // Reconstruct Filters from flat props if structured list is empty
            if (Filters == null || Filters.Count == 0)
            {
                Filters = new List<DataRepeaterFilterConfig>();
                AddFilterIfPresent("filter1", Filter1Label, Filter1Type, Filter1Query, Filter1Param);
                AddFilterIfPresent("filter2", Filter2Label, Filter2Type, Filter2Query, Filter2Param);
            }
        }

        private void AddLevelIfPresent(string query, string template, string triggerCol)
        {
            if (!string.IsNullOrWhiteSpace(query) || !string.IsNullOrWhiteSpace(triggerCol))
            {
                DetailLevels.Add(new DataRepeaterLevelConfig
                {
                    Query = (query ?? "").Trim(),
                    Template = (template ?? "").Trim(),
                    TriggerCol = (triggerCol ?? "").Trim()
                });
            }
        }

        private void AddFilterIfPresent(string key, string label, string type, string query, string param)
        {
            if (!string.IsNullOrWhiteSpace(type) && !string.IsNullOrWhiteSpace(param))
            {
                Filters.Add(new DataRepeaterFilterConfig
                {
                    Key = key,
                    Label = string.IsNullOrWhiteSpace(label) ? key : label.Trim(),
                    FilterType = type.Trim(),
                    Query = (query ?? "").Trim(),
                    ParamName = param.Trim()
                });
            }
        }
    }

    public class DataRepeaterLevelConfig
    {
        public string Query      { get; set; }   // SQL with :parentId param
        public string Template   { get; set; }   // HTML with {token} placeholders
        public string TriggerCol { get; set; }   // which column triggers this drill-down
    }

    public class DataRepeaterFilterConfig
    {
        public string Key         { get; set; }
        public string Label       { get; set; }
        public string FilterType  { get; set; }  // "dropdown", "text", "daterange"
        public string Query       { get; set; }  // SQL to populate dropdown options
        public string ParamName   { get; set; }  // :paramName in master query
    }

    /// <summary>
    /// Export request — CSV or PDF.
    /// </summary>
    public class DataRepeaterExportRequest
    {
        public int    FormId    { get; set; }
        public string WidgetKey { get; set; }
        public string Format    { get; set; }   // "csv", "pdf"
        public string FilterJson { get; set; }
    }
}
