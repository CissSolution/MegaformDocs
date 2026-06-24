// ============================================================
// MegaForm.Core — Subform (Master-Detail) Models
//
// Subform is an "Advanced Fields" widget that lets a master form embed a
// data grid bound to a SQL table on the configured DashboardDatabase.
// Admin drags column chips from the table introspection panel into the
// subform; runtime renders an inline-editable / modal-editable grid with
// real-time formula compute (client-side JS preview + server-side validate).
//
// Server-side compute uses a restricted arithmetic+Sum() evaluator (no
// reflection, no IO) — see SubformExpressionEvaluator. Razor-style full
// scripting is opt-in upgrade for Phase 2.
//
// Badge: SubformModels v20260528-15
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Subform
{
    /// <summary>Persisted widgetProps shape for a Subform field.</summary>
    public class SubformProps
    {
        [JsonProperty("tableName")]        public string TableName        { get; set; } = string.Empty;
        [JsonProperty("connectionKey")]    public string ConnectionKey    { get; set; } = "DashboardDatabase";
        [JsonProperty("parentKeyColumn")]  public string ParentKeyColumn  { get; set; } = string.Empty;
        [JsonProperty("parentKeyField")]   public string ParentKeyField   { get; set; } = "submissionId";
        [JsonProperty("columns")]          public List<SubformColumn> Columns { get; set; } = new List<SubformColumn>();
        [JsonProperty("editMode")]         public string EditMode         { get; set; } = "inline";   // inline|modal|auto
        [JsonProperty("allowAdd")]         public bool   AllowAdd         { get; set; } = true;
        [JsonProperty("allowDelete")]      public bool   AllowDelete      { get; set; } = true;
        [JsonProperty("allowReorder")]     public bool   AllowReorder     { get; set; } = false;
        [JsonProperty("stickyHeader")]     public bool   StickyHeader     { get; set; } = true;
        [JsonProperty("rowHeight")]        public string RowHeight        { get; set; } = "normal";  // compact|normal|comfortable
        [JsonProperty("emptyMessage")]     public string EmptyMessage     { get; set; } = "No rows yet. Click + Add row.";
        [JsonProperty("totalField")]       public string TotalField       { get; set; } = string.Empty;  // master field key to receive Sum
        [JsonProperty("totalFormula")]     public string TotalFormula     { get; set; } = string.Empty;  // server-eval expression
        [JsonProperty("minRows")]          public int    MinRows          { get; set; } = 0;
        [JsonProperty("maxRows")]          public int    MaxRows          { get; set; } = 0;            // 0 = unlimited
    }

    public class SubformColumn
    {
        [JsonProperty("key")]            public string Key            { get; set; } = string.Empty;
        [JsonProperty("label")]          public string Label          { get; set; } = string.Empty;
        [JsonProperty("type")]           public string Type           { get; set; } = "text";   // text|number|date|select|computed|currency
        [JsonProperty("required")]       public bool   Required       { get; set; } = false;
        [JsonProperty("width")]          public string Width          { get; set; } = "1fr";
        [JsonProperty("editor")]         public string Editor         { get; set; } = "inline"; // inline|modal
        [JsonProperty("decimals")]       public int    Decimals       { get; set; } = 2;
        [JsonProperty("computeFormula")] public string ComputeFormula { get; set; } = string.Empty; // e.g. "qty * price"
        [JsonProperty("options")]        public List<string> Options  { get; set; } = new List<string>();
        [JsonProperty("optionsQuery")]   public string OptionsQuery   { get; set; } = string.Empty;
        [JsonProperty("readonly")]       public bool   ReadOnly       { get; set; } = false;
        [JsonProperty("placeholder")]    public string Placeholder    { get; set; } = string.Empty;
    }

    /// <summary>Table introspection result returned to Builder.</summary>
    public class SubformTableInfo
    {
        [JsonProperty("name")]        public string Name        { get; set; } = string.Empty;
        [JsonProperty("schema")]      public string Schema      { get; set; } = "dbo";
        [JsonProperty("rowCount")]    public long   RowCount    { get; set; }
        [JsonProperty("columns")]     public List<SubformDbColumn> Columns { get; set; } = new List<SubformDbColumn>();
    }

    public class SubformDbColumn
    {
        [JsonProperty("name")]        public string Name        { get; set; } = string.Empty;
        [JsonProperty("dataType")]    public string DataType    { get; set; } = string.Empty;
        [JsonProperty("nullable")]    public bool   Nullable    { get; set; }
        [JsonProperty("isPrimary")]   public bool   IsPrimary   { get; set; }
        [JsonProperty("isIdentity")]  public bool   IsIdentity  { get; set; }
        [JsonProperty("maxLength")]   public int    MaxLength   { get; set; }
        [JsonProperty("uiType")]      public string UiType      { get; set; } = "text"; // text|number|date|select etc.
    }

    /// <summary>Server-side compute request (client preview is mirrored in JS).</summary>
    public class SubformComputeRequest
    {
        [JsonProperty("formula")]     public string Formula     { get; set; } = string.Empty;
        [JsonProperty("row")]         public Dictionary<string, object> Row { get; set; } = new Dictionary<string, object>();
        [JsonProperty("rows")]        public List<Dictionary<string, object>> Rows { get; set; } = new List<Dictionary<string, object>>();
    }

    public class SubformComputeResult
    {
        [JsonProperty("value")]       public decimal Value       { get; set; }
        [JsonProperty("error")]       public string  Error       { get; set; } = string.Empty;
        [JsonProperty("formatted")]   public string  Formatted   { get; set; } = string.Empty;
    }

    public class SubformPersistRow
    {
        [JsonProperty("id")]    public long Id    { get; set; }   // 0 = new
        [JsonProperty("data")]  public Dictionary<string, object> Data { get; set; } = new Dictionary<string, object>();
    }

    public class SubformSaveRequest
    {
        [JsonProperty("formId")]          public int    FormId        { get; set; }
        [JsonProperty("submissionId")]    public long   SubmissionId  { get; set; }   // master submission
        [JsonProperty("fieldKey")]        public string FieldKey      { get; set; } = string.Empty;
        [JsonProperty("rows")]            public List<SubformPersistRow> Rows { get; set; } = new List<SubformPersistRow>();
        [JsonProperty("deletedIds")]      public List<long> DeletedIds { get; set; } = new List<long>();
    }
}
