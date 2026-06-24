// MegaForm Razor Widget — base class for all .razor templates
// ──────────────────────────────────────────────────────────────────────
// Lives in the platform-neutral `MegaForm.Razor` namespace so the same
// customer-authored .razor sources compile regardless of host (DNN,
// Oqtane, or standalone ASP.NET Core).
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Components;

namespace MegaForm.Razor
{
    public abstract class MfRazorWidgetBase : ComponentBase
    {
        // ─── Built-in injected services ──────────────────────────────────
        [Inject] public IMfFormContext   FormContext { get; set; }
        [Inject] public IMfUserContext   User        { get; set; }
        [Inject] public IMfSiteContext   Site        { get; set; }
        [Inject] public IMfSqlExecutor   Sql         { get; set; }
        [Inject] public IMfRazorEmitter  Emitter     { get; set; }

        // ─── Declarative SQL data (from widgetProps.masterQuery) ────────
        /// <summary>
        /// Rows from widgetProps.masterQuery resolved by the renderer
        /// BEFORE the component initializes. Empty when widgetProps.useSql
        /// is false.
        /// </summary>
        [Parameter] public IEnumerable<dynamic> SqlRows { get; set; } = new List<dynamic>();

        /// <summary>
        /// Multiple named queries (multi-query mashup) — when widgetProps
        /// supplies a `queries: {name: sql}` dictionary, each result lands
        /// here keyed by query name.
        /// </summary>
        [Parameter] public IReadOnlyDictionary<string, IEnumerable<dynamic>> SqlQueries { get; set; }
            = new Dictionary<string, IEnumerable<dynamic>>();

        /// <summary>
        /// Widget instance key (snake_case) — matches the form field key.
        /// Used by Emitter to write back to formData[Key].
        /// </summary>
        [Parameter] public string WidgetKey { get; set; }

        /// <summary>
        /// Loose dictionary of widgetProps.parameters passed from JSON.
        /// Use this when a parameter isn't declared as a typed [Parameter]
        /// (e.g. when reading from customer override source at runtime).
        /// </summary>
        [Parameter] public IReadOnlyDictionary<string, object> ExtraParameters { get; set; }
            = new Dictionary<string, object>();

        // [R5 v20260531-01] RenderPartial — fetch a reusable HTML fragment
        // from MF_AI_Knowledge.Body where Slug = :slug AND Kind = 'razor_partial'.
        // The fragment may contain {{tokenName}} placeholders; pass an object
        // (anonymous type / dictionary) whose properties replace the matching
        // tokens. Returns a MarkupString so Razor emits the HTML unescaped.
        //
        // v1 is text-substitution only (no Razor logic inside partials).
        // If you need conditionals / loops, write a full Razor template and
        // resolve it via @inherits.
        //
        // Usage:
        //   @(await RenderPartial("kpi-card", new { title = "Sales", value = "$5,420" }))
        //
        // Partial caching: 30s in-memory per-process. Restart the host or
        // POST /AiTools/Knowledge to invalidate sooner.
        private static readonly Dictionary<string, (string Body, System.DateTime FetchedAt)> _partialCache
            = new Dictionary<string, (string, System.DateTime)>();
        private static readonly Regex _tokenRx = new Regex(@"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}", RegexOptions.Compiled);

        public async Task<MarkupString> RenderPartial(string slug, object tokens = null)
        {
            if (string.IsNullOrWhiteSpace(slug))
                return new MarkupString("<!-- mf:partial empty slug -->");
            string body = null;
            lock (_partialCache)
            {
                if (_partialCache.TryGetValue(slug, out var cached) && (System.DateTime.UtcNow - cached.FetchedAt).TotalSeconds < 30)
                    body = cached.Body;
            }
            if (body == null)
            {
                try
                {
                    // Provider-agnostic query; filter to first row in memory.
                    var rows = await Sql.QueryAsync(
                        "SELECT Body FROM MF_AI_Knowledge WHERE Slug = @slug AND Kind = 'razor_partial'",
                        new { slug });
                    if (rows != null)
                    {
                        var first = rows.FirstOrDefault();
                        if (first != null)
                        {
                            if (first is IDictionary<string, object> dict)
                                body = dict.TryGetValue("Body", out var v) ? (v?.ToString() ?? "") : "";
                            else
                                body = ((dynamic)first).Body?.ToString() ?? "";
                        }
                    }
                }
                catch (System.Exception ex)
                {
                    return new MarkupString("<!-- mf:partial '" + System.Net.WebUtility.HtmlEncode(slug) + "' fetch error: " + System.Net.WebUtility.HtmlEncode(ex.Message) + " -->");
                }
                if (body == null) body = "";
                lock (_partialCache) { _partialCache[slug] = (body, System.DateTime.UtcNow); }
            }
            if (string.IsNullOrEmpty(body))
                return new MarkupString("<!-- mf:partial '" + System.Net.WebUtility.HtmlEncode(slug) + "' not found -->");

            // Build token map (case-sensitive, matching @TS object-literal feel).
            var map = new Dictionary<string, string>(System.StringComparer.OrdinalIgnoreCase);
            if (tokens != null)
            {
                if (tokens is IDictionary<string, object> objMap)
                {
                    foreach (var kv in objMap) map[kv.Key] = kv.Value == null ? "" : kv.Value.ToString();
                }
                else
                {
                    foreach (var prop in tokens.GetType().GetProperties())
                    {
                        var v = prop.GetValue(tokens);
                        map[prop.Name] = v == null ? "" : v.ToString();
                    }
                }
            }
            // Substitute {{token}} → escape value for safety.
            var output = _tokenRx.Replace(body, m => {
                var key = m.Groups[1].Value;
                if (!map.TryGetValue(key, out var val)) return "";
                return System.Net.WebUtility.HtmlEncode(val);
            });
            return new MarkupString(output);
        }
    }
}
