// ============================================================
// MegaForm.Core — ListView Settings DTO
//
// Persisted as the ViewConfigJson blob of a ModuleViewConfigInfo row whose
// ViewType = "listview". Kept in its own folder/namespace so this new view
// mode doesn't touch the existing list/card/detail DTOs (RULES: minimal
// change, don't break what works).
//
// Wire format: camelCase (matches the TS designer payload). Newtonsoft.Json
// honours [JsonProperty] when it's present, otherwise defaults to PascalCase
// — we annotate every field so the client can round-trip cleanly without
// silent-undefined bugs (PITFALL: PascalCase TS reading camelCase JSON).
//
// Badge: ListViewSettings v20260507-21
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MegaForm.Core.ViewModes
{
    /// <summary>One visible field (column) in the ListView table.</summary>
    public class ListViewFieldInfo
    {
        [JsonProperty("key")]   public string Key   { get; set; } = string.Empty;
        [JsonProperty("label")] public string Label { get; set; } = string.Empty;
        [JsonProperty("type")]  public string Type  { get; set; } = string.Empty;
    }

    /// <summary>Persisted settings for a single ListView module instance.</summary>
    public class ListViewSettings
    {
        public const string Badge   = "ListViewSettings v20260524-01";
        public const string ViewType = "listview";

        [JsonProperty("formId")]          public int    FormId          { get; set; }
        [JsonProperty("title")]           public string Title           { get; set; } = string.Empty;
        [JsonProperty("fields")]          public List<ListViewFieldInfo> Fields { get; set; } = new List<ListViewFieldInfo>();
        [JsonProperty("rowTemplate")]     public string RowTemplate     { get; set; } = string.Empty;
        [JsonProperty("wrapperTemplate")] public string WrapperTemplate { get; set; } = string.Empty;
        [JsonProperty("pageSize")]        public int    PageSize        { get; set; } = 25;
        [JsonProperty("enableSearch")]    public bool   EnableSearch    { get; set; } = true;
        [JsonProperty("enableSort")]      public bool   EnableSort      { get; set; } = true;
        [JsonProperty("emptyMessage")]    public string EmptyMessage    { get; set; } = "No submissions yet.";
        [JsonProperty("showAddButton")]   public bool   ShowAddButton   { get; set; } = true;
        [JsonProperty("showRowActions")]  public bool   ShowRowActions  { get; set; } = true;
        [JsonProperty("rendererHostUrl")] public string RendererHostUrl { get; set; } = string.Empty;
        [JsonProperty("detailTemplate")]  public string DetailTemplate  { get; set; } = string.Empty;

        public static ListViewSettings FromJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new ListViewSettings();
            try
            {
                var obj = JsonConvert.DeserializeObject<Newtonsoft.Json.Linq.JObject>(json);
                if (obj != null)
                {
                    var nested = obj["listViewSettingsJson"] ?? obj["ListViewSettingsJson"];
                    if (nested != null)
                    {
                        if (nested.Type == Newtonsoft.Json.Linq.JTokenType.Object)
                        {
                            var innerObj = nested.ToObject<ListViewSettings>();
                            return innerObj ?? new ListViewSettings();
                        }
                        var nestedText = nested.ToString();
                        if (!string.IsNullOrWhiteSpace(nestedText))
                        {
                            var innerText = JsonConvert.DeserializeObject<ListViewSettings>(nestedText);
                            return innerText ?? new ListViewSettings();
                        }
                    }
                }
                var s = JsonConvert.DeserializeObject<ListViewSettings>(json);
                return s ?? new ListViewSettings();
            }
            catch (JsonException) { return new ListViewSettings(); }
        }

        public string ToJson()
        {
            return JsonConvert.SerializeObject(this);
        }

        /// <summary>
        /// Minimal HTML scaffold the host renders to mount the runtime. Only
        /// includes data-attributes the runtime reads — actual rows/HTML are
        /// fetched + composed client-side. The runtime auto-binds when its JS
        /// bundle (megaform-listview.js) is present on the page.
        /// </summary>
        public string BuildMountHtml(string apiBase, string contextJson = null, string queryKey = null)
        {
            apiBase = (apiBase ?? "/api/MegaForm/").TrimEnd('/') + "/";
            string fieldsJson = JsonConvert.SerializeObject(Fields ?? new List<ListViewFieldInfo>());
            string contextAttr = string.IsNullOrWhiteSpace(contextJson)
                ? string.Empty
                : " data-mf-context-json=\"" + AttrEsc(contextJson) + "\"";
            string queryAttr = string.IsNullOrWhiteSpace(queryKey)
                ? string.Empty
                : " data-mf-query-key=\"" + AttrEsc(queryKey) + "\"";
            return string.Concat(
                "<div data-mf-listview=\"1\"",
                " data-mf-form-id=\"",         FormId,           "\"",
                " data-mf-api-base=\"",        AttrEsc(apiBase), "\"",
                " data-mf-fields-json=\"",     AttrEsc(fieldsJson), "\"",
                " data-mf-row-template=\"",    AttrEsc(RowTemplate),     "\"",
                " data-mf-detail-template=\"", AttrEsc(DetailTemplate),  "\"",
                " data-mf-wrapper-template=\"", AttrEsc(WrapperTemplate), "\"",
                " data-mf-page-size=\"",       PageSize,         "\"",
                " data-mf-search=\"",          (EnableSearch ? "true" : "false"), "\"",
                " data-mf-sort=\"",            (EnableSort   ? "true" : "false"), "\"",
                " data-mf-show-add=\"",        (ShowAddButton ? "true" : "false"), "\"",
                " data-mf-show-actions=\"",    (ShowRowActions ? "true" : "false"), "\"",
                " data-mf-renderer-host-url=\"", AttrEsc(RendererHostUrl), "\"",
                " data-mf-title=\"",           AttrEsc(Title),         "\"",
                " data-mf-empty-message=\"",   AttrEsc(EmptyMessage),  "\"",
                contextAttr,
                queryAttr,
                " data-mf-listview-badge=\"",  Badge,                  "\"",
                "></div>"
            );
        }

        private static string AttrEsc(string v)
        {
            if (string.IsNullOrEmpty(v)) return string.Empty;
            return v.Replace("&", "&amp;").Replace("\"", "&quot;").Replace("<", "&lt;").Replace(">", "&gt;");
        }
    }
}
