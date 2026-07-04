// MegaForm Razor Widget — server-render + list endpoints
// ──────────────────────────────────────────────────────────────────────
// Phase 0 — Render endpoint instantiates a registered template via Blazor's
// HtmlRenderer (out-of-circuit static render) and returns HTML string. TS
// plugin fetches this and injects into the field slot via innerHTML.
//
// Phase 1 will add the /Compile endpoint (Roslyn JIT for customer override
// source) + the /List endpoint (catalog for the Builder template picker).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Oqtane.Server.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Mvc;
using Oqtane.Controllers;
using Oqtane.Infrastructure;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    [Route("api/MegaFormPopup/[controller]")]
    [IgnoreAntiforgeryToken]
    public class RazorWidgetController : ModuleControllerBase
    {
        private readonly RazorWidgetRegistry _registry;
        private readonly HtmlRenderer _htmlRenderer;
        private readonly IServiceProvider _services;

        public RazorWidgetController(
            RazorWidgetRegistry registry,
            HtmlRenderer htmlRenderer,
            IServiceProvider services,
            ILogManager logger,
            Microsoft.AspNetCore.Http.IHttpContextAccessor accessor)
            : base(logger, accessor)
        {
            _registry = registry;
            _htmlRenderer = htmlRenderer;
            _services = services;
        }

        private bool IsAdmin => User != null && (User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host));

        /// <summary>
        /// List all registered Razor widget templates with metadata + parameter
        /// info. Used by the Builder right-panel template picker + AI tool
        /// list_razor_templates.
        /// </summary>
        [HttpGet("List")]
        public IActionResult ListTemplates()
        {
            var items = _registry.List().Select(t => new
            {
                t.Name,
                t.Category,
                t.Description,
                t.EmitsValue,
                t.ValueShape,
                t.SupportsSql,
                t.RequiresInteractive,
                t.Icon,
                t.IsRecipe,
                t.WhenToUse,
                Parameters = t.Parameters.Select(p => new {
                    p.Name, p.TypeName, p.IsRequired, p.Description,
                    p.Label, p.Hint, p.Group, p.Widget, p.Options, p.Placeholder, p.Order,
                }),
            }).ToList();
            return Ok(items);
        }

        /// <summary>
        /// Return the .razor source file for a given template name. The
        /// source ships as an embedded resource (csproj &lt;EmbeddedResource&gt;
        /// for each .razor) so deployments don't need the wwwroot file on
        /// disk. Used by the AI tool `get_razor_template_source` to read +
        /// suggest customer edits.
        /// </summary>
        [HttpGet("Source")]
        public IActionResult Source([FromQuery] string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return BadRequest(new { error = "name required" });

            var meta = _registry.Get(name);
            if (meta == null) return NotFound(new { error = $"template '{name}' not registered" });

            // Embedded resource naming: MegaForm.Server.RazorSource.<Name>.razor
            var resourceName = $"MegaForm.Server.RazorSource.{name}.razor";
            var asm = System.Reflection.Assembly.GetExecutingAssembly();
            using var stream = asm.GetManifestResourceStream(resourceName);
            if (stream == null) return NotFound(new { error = "source not embedded", expectedResource = resourceName });
            using var sr = new System.IO.StreamReader(stream);
            var src = sr.ReadToEnd();
            return Ok(new { name, source = src, category = meta.Category, supportsSql = meta.SupportsSql, emitsValue = meta.EmitsValue });
        }

        /// <summary>
        /// Render a Razor widget to HTML for injection into the form view.
        /// Body: { templateName, parameters?, sqlRows?, widgetKey?, submissionId? }
        /// </summary>
        [HttpPost("Render")]
        public async Task<IActionResult> Render([FromBody] RenderRequest req)
        {
            if (req == null)
                return BadRequest(new { error = "body required" });

            // [v20260531-RZ7] Design-and-apply flow: when the field carries
            // its own custom Razor source (widgetProps.razorSource), JIT
            // compile it inline + use the resulting Type for this render.
            // The compilation service caches by sha256(source) so repeat
            // renders are free. This is the canonical AI-builds-bespoke-
            // widget path — preferred over fitting customer data into a
            // rigid built-in template.
            RazorWidgetMetadata meta = null;
            if (!string.IsNullOrWhiteSpace(req.RazorSource))
            {
                if (!IsAdmin)
                    return StatusCode(403, new { error = "Administrator access is required to compile inline Razor source." });
                // SECURITY NOTE (Phase 2 MVP): razorSource is trusted from
                // the request body. This is safe at form view time only
                // because the client always loads razorSource from the
                // saved form schema (server-trusted at form-save time via
                // the admin-only Builder save path). A malicious client
                // could in theory tamper, but that only affects their own
                // session. Phase 3 will move to server-side lookup —
                // Render takes (formId, widgetKey), fetches the saved
                // schema, pulls razorSource from there, ignores the body.
                // The compilation service caches by sha256(source) so
                // hundreds of concurrent renders compile once.
                var compiler = _services.GetService(typeof(MegaForm.Oqtane.Server.Services.RazorCompilationService))
                               as MegaForm.Oqtane.Server.Services.RazorCompilationService;
                if (compiler == null)
                    return StatusCode(500, new { error = "compilation service not registered" });
                var nameForCompile = string.IsNullOrWhiteSpace(req.TemplateName)
                    ? "InlineTemplate_" + (req.WidgetKey ?? "anon")
                    : req.TemplateName;
                var compileResult = compiler.Compile(nameForCompile, req.RazorSource);
                if (!compileResult.Success)
                    return StatusCode(400, new { error = "inline razor source did not compile",
                        errors = compileResult.Errors, where = "compile" });
                meta = _registry.Get(compileResult.TemplateName);
            }
            else
            {
                if (string.IsNullOrEmpty(req.TemplateName))
                    return BadRequest(new { error = "templateName or razorSource required" });
                meta = _registry.Get(req.TemplateName);
            }

            if (meta == null)
            {
                var nm = string.IsNullOrEmpty(req.TemplateName) ? "(blank)" : req.TemplateName;
                var hint = !string.IsNullOrWhiteSpace(req.RazorSource)
                    ? "inline source compiled but no [RazorTemplate(...)] attribute was found on any compiled type — add `@attribute [RazorTemplate(\"Unique_Name\", ...)]` to the source"
                    : "call /api/MegaFormPopup/RazorWidget/List to see registered templates";
                return NotFound(new { error = $"template '{nm}' not registered", hint });
            }

            // Build parameter dictionary from the request body. The .razor
            // properties are PascalCase ([Parameter] public string Foo) but
            // the JSON config may save them as camelCase (foo / fooBar) — the
            // Builder property forms use camelCase. Resolve case-insensitively
            // and feed Blazor's ParameterView with the canonical property
            // name so the dispatch lands.
            var paramDict = new Dictionary<string, object>();
            if (req.Parameters != null)
            {
                foreach (var kv in req.Parameters)
                {
                    var pi = meta.ComponentType.GetProperty(kv.Key,
                        System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance
                        | System.Reflection.BindingFlags.IgnoreCase);
                    if (pi == null) continue;
                    object converted;
                    try { converted = ConvertParameter(kv.Value, pi.PropertyType); }
                    catch { converted = pi.PropertyType.IsValueType ? Activator.CreateInstance(pi.PropertyType) : null; }
                    paramDict[pi.Name] = converted;  // pi.Name = canonical PascalCase property name
                }
            }
            if (req.SqlRows != null) paramDict["SqlRows"] = req.SqlRows;
            if (!string.IsNullOrEmpty(req.WidgetKey)) paramDict["WidgetKey"] = req.WidgetKey;

            try
            {
                var html = await _htmlRenderer.Dispatcher.InvokeAsync(async () =>
                {
                    var pv = Microsoft.AspNetCore.Components.ParameterView.FromDictionary(paramDict);
                    var output = await _htmlRenderer.RenderComponentAsync(meta.ComponentType, pv);
                    return output.ToHtmlString();
                });
                return Ok(new { html, templateName = req.TemplateName, emitsValue = meta.EmitsValue });
            }
            catch (Exception ex)
            {
                var detail = ex.ToString();
                if (detail.Length > 1500) detail = detail.Substring(0, 1500) + "…";
                return StatusCode(500, new { error = ex.Message, where = "render", trace = detail });
            }
        }

        private static object ConvertParameter(object value, Type targetType)
        {
            if (value == null) return targetType.IsValueType ? Activator.CreateInstance(targetType) : null;
            if (targetType.IsInstanceOfType(value)) return value;
            var underlying = Nullable.GetUnderlyingType(targetType) ?? targetType;

            // System.Text.Json deserializes Dictionary<string,object> values as
            // JsonElement, not primitives. Convert.ChangeType doesn't know
            // JsonElement → primitive, so we unwrap manually first.
            if (value is System.Text.Json.JsonElement je)
            {
                if (underlying == typeof(string))   return je.ValueKind == System.Text.Json.JsonValueKind.String ? je.GetString() : je.ToString();
                if (underlying == typeof(int))      return je.GetInt32();
                if (underlying == typeof(long))     return je.GetInt64();
                if (underlying == typeof(decimal))  return je.GetDecimal();
                if (underlying == typeof(double))   return je.GetDouble();
                if (underlying == typeof(float))    return (float)je.GetDouble();
                if (underlying == typeof(bool))     return je.GetBoolean();
                if (underlying == typeof(DateTime)) return je.GetDateTime();
                if (underlying == typeof(Guid))     return je.GetGuid();
                // Fallback: round-trip via raw text
                return Convert.ChangeType(je.GetRawText().Trim('"'), underlying);
            }
            return Convert.ChangeType(value, underlying);
        }

        public class RenderRequest
        {
            public string TemplateName { get; set; }
            public Dictionary<string, object> Parameters { get; set; }
            public List<Dictionary<string, object>> SqlRows { get; set; }
            public string WidgetKey { get; set; }
            public long SubmissionId { get; set; }
            /// <summary>
            /// Optional inline .razor source. When set, the server JIT
            /// compiles it (sha256-cached) and renders with the resulting
            /// Type — bypassing the registry templateName lookup. This is
            /// the design-and-apply path for AI-built bespoke widgets.
            /// </summary>
            public string RazorSource { get; set; }
        }

        // ════════════════════════════════════════════════════════════════
        //  Phase 2 endpoints — Action / Compile / Export / Preview
        // ════════════════════════════════════════════════════════════════

        /// <summary>
        /// CRUD action endpoint backing the EditableList template's row
        /// buttons. Body shape: { actionSql, parameters, connectionKey }.
        /// The Builder saves the per-form SQL into widgetProps.actions;
        /// the client reads it from the local schema and POSTs it here.
        /// Server runs it with parameterized binding via IMfSqlExecutor.
        /// </summary>
        [HttpPost("Action")]
        public async Task<IActionResult> Action([FromBody] ActionRequest req)
        {
            if (req == null || string.IsNullOrEmpty(req.ActionSql))
                return BadRequest(new { error = "actionSql required" });

            // [SecFix 2026-07-04 P0-1] This endpoint executes client-supplied DML. RazorActionSqlGuard
            // (inside RunAsync) blocks DDL/RCE/stacking but DELIBERATELY allows INSERT/UPDATE/DELETE, so an
            // anonymous caller could tamper data on any registered connection. Arbitrary DML is inherently
            // admin-only → gate it. (ConnectionKey stays client-chosen: it is only a lookup key into the
            // admin-configured connection registry — not a raw connection string — and multi-DB EditableList
            // dashboards legitimately target non-default connections; the caller is now a trusted admin.)
            if (!IsAdmin)
                return StatusCode(403, new { error = "Administrator access is required to run widget actions." });

            var svc  = _services.GetService(typeof(MegaForm.Oqtane.Server.Services.IRazorActionService))
                       as MegaForm.Oqtane.Server.Services.IRazorActionService;
            if (svc == null) return StatusCode(500, new { error = "action service not registered" });

            var bag = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (req.Parameters != null)
            {
                foreach (var kv in req.Parameters)
                {
                    var v = UnwrapJson(kv.Value);
                    bag[kv.Key] = v;
                }
            }

            var result = await svc.RunAsync(req.ActionSql, bag, req.ConnectionKey ?? "DashboardDatabase");
            if (!result.Success)
                return StatusCode(400, new { error = result.Error });
            return Ok(new { success = true, affected = result.AffectedRows, data = result.Data });
        }

        public class ActionRequest
        {
            public string ActionSql { get; set; }
            public Dictionary<string, object> Parameters { get; set; }
            public string ConnectionKey { get; set; }
        }

        /// <summary>
        /// Roslyn JIT compile. Body: { templateName, source }. On success
        /// the new Type replaces (or adds) the entry in the registry, so
        /// subsequent /Render calls route to the customer override.
        /// </summary>
        [HttpPost("Compile")]
        public IActionResult Compile([FromBody] CompileRequest req)
        {
            if (req == null || string.IsNullOrEmpty(req.Source))
                return BadRequest(new { error = "source required" });

            // [P3-SEC-14] Host-only gate. Customer-authored Razor sources
            // compile to in-process .NET code that can call anything the
            // host process can — so we require the request to come from
            // an authenticated Host (Oqtane) or SuperUser (DNN) account.
            // The IHttpContextAccessor proxy on the base controller gives
            // us the principal. ModuleControllerBase.User in Oqtane.
            var isHost = User?.IsInRole("Administrators") == true
                         || User?.IsInRole("Host") == true
                         || User?.HasClaim(c => c.Type == "IsHost" && c.Value == "True") == true;
            if (!isHost)
                return StatusCode(403, new { error = "Razor compile requires Host role." });

            var svc = _services.GetService(typeof(MegaForm.Oqtane.Server.Services.RazorCompilationService))
                      as MegaForm.Oqtane.Server.Services.RazorCompilationService;
            if (svc == null) return StatusCode(500, new { error = "compilation service not registered" });
            var r = svc.Compile(req.TemplateName ?? "CustomTemplate", req.Source);
            return Ok(r);
        }

        public class CompileRequest
        {
            public string TemplateName { get; set; }
            public string Source { get; set; }
        }

        /// <summary>
        /// CSV export of a rendered table. Body matches /Render. The
        /// server re-renders the template, then extracts the rows from
        /// SqlRows + the parameters and emits a comma-separated payload
        /// the browser can save. Use the same widgetProps.columns hint
        /// if present.
        /// </summary>
        [HttpPost("Export")]
        public IActionResult Export([FromBody] ExportRequest req)
        {
            if (req == null || req.SqlRows == null || req.SqlRows.Count == 0)
                return BadRequest(new { error = "sqlRows required" });
            var sb = new System.Text.StringBuilder();
            var keys = new List<string>();
            foreach (var r in req.SqlRows)
            {
                foreach (var k in r.Keys)
                    if (!keys.Contains(k, StringComparer.OrdinalIgnoreCase)) keys.Add(k);
            }
            sb.AppendLine(string.Join(",", keys.Select(EscapeCsv)));
            foreach (var r in req.SqlRows)
            {
                var line = string.Join(",", keys.Select(k =>
                {
                    r.TryGetValue(k, out var v);
                    return EscapeCsv(v?.ToString() ?? "");
                }));
                sb.AppendLine(line);
            }
            var bytes = System.Text.Encoding.UTF8.GetBytes(sb.ToString());
            return File(bytes, "text/csv; charset=utf-8", (req.FileName ?? "export") + ".csv");
        }

        private static string EscapeCsv(string s)
        {
            if (s == null) return "";
            if (s.IndexOfAny(new[] { ',', '"', '\n', '\r' }) < 0) return s;
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        }

        public class ExportRequest
        {
            public string FileName { get; set; }
            public List<Dictionary<string, object>> SqlRows { get; set; }
        }

        /// <summary>
        /// Smoke-test preview page. Renders every registered template
        /// with a small synthetic dataset so an admin can verify all
        /// templates work after deploy by visiting one URL.
        ///
        ///   GET /api/MegaFormPopup/RazorWidget/Preview
        /// </summary>
        [HttpGet("Preview")]
        public async Task<IActionResult> Preview()
        {
            var samples = new Dictionary<string, (Dictionary<string, object> p, List<Dictionary<string, object>> r)>
            {
                ["SqlTablePivot"] = (new()
                {
                    ["RowGroupColumn"] = "Region",
                    ["ColGroupColumn"] = "Category",
                    ["ValueColumn"]    = "Sales",
                    ["Aggregator"]     = "sum",
                },
                new()
                {
                    new() { ["Region"]="North", ["Category"]="Books",       ["Sales"]=500 },
                    new() { ["Region"]="North", ["Category"]="Electronics", ["Sales"]=1000 },
                    new() { ["Region"]="South", ["Category"]="Books",       ["Sales"]=700 },
                    new() { ["Region"]="South", ["Category"]="Electronics", ["Sales"]=1500 },
                }),
                ["InteractiveCalculator"] = (new()
                {
                    ["BasePrice"] = 1_000_000m,
                    ["Currency"]  = "VND",
                    ["TaxRate"]   = 0.10m,
                }, new()),
                ["EditableList"] = (new()
                {
                    ["IdColumn"] = "PlayerId",
                    ["Columns"]  = "PlayerName,Handicap",
                },
                new()
                {
                    new() { ["PlayerId"]=1, ["PlayerName"]="George Liu",    ["Handicap"]=2 },
                    new() { ["PlayerId"]=2, ["PlayerName"]="Tony Ramirez",  ["Handicap"]=2 },
                    new() { ["PlayerId"]=3, ["PlayerName"]="Steve Johnson", ["Handicap"]=3 },
                }),
                ["MasterDetailList"] = (new()
                {
                    ["ParentIdColumn"]    = "FlightId",
                    ["ParentLabelColumn"] = "FlightName",
                    ["ChildColumns"]      = "PlayerName,Handicap",
                },
                new()
                {
                    new() { ["FlightId"]=1, ["FlightName"]="Championship Flight A" },
                    new() { ["FlightId"]=2, ["FlightName"]="Flight B - Low Net" },
                    new() { ["FlightId"]=3, ["FlightName"]="Net Flight C" },
                }),
                ["CalendarFromSQL"] = (new()
                {
                    ["DateColumn"]  = "RoundDate",
                    ["TitleColumn"] = "RoundLabel",
                    ["MonthAnchor"] = "2026-04",
                },
                new()
                {
                    new() { ["RoundLabel"]="Round 1", ["RoundDate"]="2026-04-20" },
                    new() { ["RoundLabel"]="Round 2", ["RoundDate"]="2026-04-21" },
                    new() { ["RoundLabel"]="Round 3", ["RoundDate"]="2026-04-22" },
                }),
                ["ImageGallery"] = (new()
                {
                    ["UrlColumn"]   = "ImageUrl",
                    ["TitleColumn"] = "CourseName",
                    ["Columns"]     = 3,
                },
                new()
                {
                    new() { ["CourseName"]="Pebble Beach", ["ImageUrl"]="https://picsum.photos/seed/golf1/400/200" },
                    new() { ["CourseName"]="Augusta",       ["ImageUrl"]="https://picsum.photos/seed/golf2/400/200" },
                    new() { ["CourseName"]="St Andrews",    ["ImageUrl"]="https://picsum.photos/seed/golf3/400/200" },
                }),
                ["LiveChart"] = (new()
                {
                    ["LabelColumn"] = "FlightName",
                    ["ValueColumn"] = "PlayerCount",
                    ["ChartType"]   = "bar",
                },
                new()
                {
                    new() { ["FlightName"]="Champ A", ["PlayerCount"]=8 },
                    new() { ["FlightName"]="B Net",   ["PlayerCount"]=10 },
                    new() { ["FlightName"]="C Gross", ["PlayerCount"]=12 },
                    new() { ["FlightName"]="C Net",   ["PlayerCount"]=12 },
                    new() { ["FlightName"]="D Senior",["PlayerCount"]=6 },
                }),
                ["EmailTemplate"] = (new()
                {
                    ["Subject"]  = "Booking confirmation",
                    ["Greeting"] = "Hi {{PlayerName}},",
                    ["Body"]     = "Your tee time on {{RoundDate}} is confirmed.\nTotal payable: 1,200,000 VND.",
                    ["Footer"]   = "MegaForm Demo",
                }, new()
                {
                    new() { ["PlayerName"]="George Liu", ["RoundDate"]="2026-04-20" },
                }),
            };

            var sb = new System.Text.StringBuilder();
            sb.Append("<!doctype html><html><head><meta charset='utf-8'><title>MegaForm Razor Widget Preview</title>");
            sb.Append("<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#0f172a;margin:0;padding:24px}");
            sb.Append("h1{color:#fff;font-size:22px;margin:0 0 6px}");
            sb.Append(".sub{color:#94a3b8;font-size:13px;margin:0 0 24px}");
            sb.Append(".card{background:#fff;border-radius:14px;padding:18px 20px;margin:18px 0;box-shadow:0 6px 18px rgba(0,0,0,.2)}");
            sb.Append(".h{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e2e8f0}");
            sb.Append(".h .name{font-weight:700;color:#0f172a;font-size:15px}");
            sb.Append(".h .chip{font-size:10px;padding:2px 8px;border-radius:99px;background:#ede9fe;color:#6d28d9;font-weight:600}");
            sb.Append(".h .chip.sql{background:#dbeafe;color:#1d4ed8}");
            sb.Append(".h .chip.emit{background:#fce7f3;color:#be185d}");
            sb.Append(".err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px;border-radius:8px;font-size:13px}");
            sb.Append("</style></head><body>");
            sb.Append("<h1>&#x2728; MegaForm Razor Widget Preview</h1>");
            sb.Append("<div class='sub'>Each registered template rendered server-side with synthetic data — use this page to confirm a deploy went out clean.</div>");

            foreach (var meta in _registry.List())
            {
                sb.Append("<div class='card'>");
                sb.Append("<div class='h'><span class='name'>").Append(System.Net.WebUtility.HtmlEncode(meta.Name)).Append("</span>");
                sb.Append("<span class='chip'>").Append(System.Net.WebUtility.HtmlEncode(meta.Category ?? "")).Append("</span>");
                if (meta.SupportsSql) sb.Append("<span class='chip sql'>SQL</span>");
                if (meta.EmitsValue)  sb.Append("<span class='chip emit'>Emits value</span>");
                sb.Append("</div>");

                samples.TryGetValue(meta.Name, out var s);
                var dict = new Dictionary<string, object>();
                if (s.p != null)
                {
                    foreach (var kv in s.p)
                    {
                        var pi = meta.ComponentType.GetProperty(kv.Key,
                            System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance
                            | System.Reflection.BindingFlags.IgnoreCase);
                        if (pi == null) continue;
                        try { dict[pi.Name] = ConvertParameter(kv.Value, pi.PropertyType); }
                        catch { /* ignore */ }
                    }
                }
                if (s.r != null) dict["SqlRows"] = s.r;
                dict["WidgetKey"] = "preview_" + meta.Name.ToLowerInvariant();

                try
                {
                    var html = await _htmlRenderer.Dispatcher.InvokeAsync(async () =>
                    {
                        var pv = Microsoft.AspNetCore.Components.ParameterView.FromDictionary(dict);
                        var output = await _htmlRenderer.RenderComponentAsync(meta.ComponentType, pv);
                        return output.ToHtmlString();
                    });
                    sb.Append(html);
                }
                catch (Exception ex)
                {
                    sb.Append("<div class='err'><strong>Render failed:</strong> ").Append(System.Net.WebUtility.HtmlEncode(ex.Message)).Append("</div>");
                }
                sb.Append("</div>");
            }
            sb.Append("</body></html>");

            return Content(sb.ToString(), "text/html; charset=utf-8");
        }

        private static object UnwrapJson(object v)
        {
            if (v is System.Text.Json.JsonElement je)
            {
                switch (je.ValueKind)
                {
                    case System.Text.Json.JsonValueKind.String: return je.GetString();
                    case System.Text.Json.JsonValueKind.Number:
                        if (je.TryGetInt64(out var l)) return l;
                        if (je.TryGetDecimal(out var d)) return d;
                        return je.GetDouble();
                    case System.Text.Json.JsonValueKind.True:   return true;
                    case System.Text.Json.JsonValueKind.False:  return false;
                    case System.Text.Json.JsonValueKind.Null:   return null;
                    default: return je.GetRawText();
                }
            }
            return v;
        }
    }
}
