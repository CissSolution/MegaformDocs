using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// Executor for Webhook nodes.
    /// Features: Header Auth (Bearer/Basic/ApiKey), Field Mapping, Body Template,
    /// Retry with exponential backoff, Response Routing via JSONPath-like rules.
    /// Implements IWebhookExecutor for testability.
    /// </summary>
    public class WebhookNodeExecutor : INodeExecutor, IWebhookExecutor
    {
        private readonly IWorkflowEvaluator _evaluator;

        // Shared HttpClient — static to avoid socket exhaustion
        private static readonly HttpClient _http = new HttpClient();

        public WorkflowNodeType NodeType => WorkflowNodeType.Webhook;

        public WebhookNodeExecutor(IWorkflowEvaluator evaluator)
        {
            _evaluator = evaluator;
        }

        // ─── INodeExecutor ────────────────────────────────────────────────────

        public async Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node.IsDisabled)
                return WorkflowNodeResult.Skipped(NextNode(node, ctx));

            WebhookNodeConfig config;
            try
            {
                config = ParseConfig(node);
            }
            catch (Exception ex)
            {
                return WorkflowNodeResult.Failed("Invalid webhook config: " + ex.Message);
            }

            string url = ResolveTemplate(config.Url, ctx);
            if (string.IsNullOrWhiteSpace(url))
                return WorkflowNodeResult.Failed("Webhook URL is empty after template resolution.");

            // Dry run — log only, don't send
            if (ctx.IsDryRun)
            {
                return WorkflowNodeResult.Success(NextNode(node, ctx), new
                {
                    dryRun = true,
                    url,
                    method = config.Method.ToString(),
                });
            }

            var result = await ExecuteAsync(config, ctx, ct);

            // Store response in variable if configured
            if (!string.IsNullOrWhiteSpace(config.ResponseVariableKey) && result.ResponseBody != null)
            {
                if (ctx.Variables == null)
                    ctx.Variables = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                ctx.Variables[config.ResponseVariableKey] = result.ResponseBody;
            }

            if (!result.IsSuccess)
                return WorkflowNodeResult.Failed(
                    string.Format("Webhook HTTP {0}: {1}", result.StatusCode, result.Error ?? ""));

            // Response routing
            string nextNodeId = ResolveNextNode(result, config.ResponseRoutes, NextNode(node, ctx));

            return WorkflowNodeResult.Success(nextNodeId, new
            {
                statusCode   = result.StatusCode,
                durationMs   = result.DurationMs,
                attemptCount = result.AttemptCount,
                routedTo     = nextNodeId,
            });
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var config = TryParseConfig(node);
            if (config == null || string.IsNullOrWhiteSpace(config.Url))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId   = node.Id,
                    Field    = "Url",
                    Message  = "Webhook '" + (node.Label ?? node.Id) + "': URL is required.",
                    Severity = "error",
                });
            }
            return result;
        }

        // ─── IWebhookExecutor ─────────────────────────────────────────────────

        public async Task<WebhookExecutionResult> ExecuteAsync(
            WebhookNodeConfig config,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            string url    = ResolveTemplate(config.Url, ctx);
            string method = config.Method.ToString();
            string body   = BuildBody(config, ctx);

            int maxAttempts = Math.Max(1, config.Retry?.MaxAttempts ?? 1);
            int delayMs     = (config.Retry?.DelaySeconds ?? 5) * 1000;
            double backoff  = config.Retry?.BackoffMultiplier ?? 2.0;

            var execResult = new WebhookExecutionResult();
            long startMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            for (int attempt = 1; attempt <= maxAttempts; attempt++)
            {
                execResult.AttemptCount = attempt;
                try
                {
                    using (var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct))
                    {
                        timeoutCts.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, Math.Min(120, config.TimeoutSeconds))));
                        var request = BuildRequest(url, method, body, config, ctx);
                        var response = await _http.SendAsync(request, timeoutCts.Token);
                        execResult.StatusCode   = (int)response.StatusCode;
                        execResult.ResponseBody = await response.Content.ReadAsStringAsync();
                        execResult.IsSuccess    = execResult.StatusCode >= 200 && execResult.StatusCode < 300;
                        execResult.DurationMs   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startMs;

                        if (execResult.IsSuccess)
                            return execResult;

                        // Retry on 5xx
                        if (execResult.StatusCode < 500 || attempt >= maxAttempts)
                            return execResult;
                    }
                }
                catch (OperationCanceledException)
                {
                    execResult.Error      = ct.IsCancellationRequested ? "Request cancelled." : "Request timed out.";
                    if (attempt >= maxAttempts || ct.IsCancellationRequested)
                    {
                        execResult.DurationMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startMs;
                        return execResult;
                    }
                }
                catch (Exception ex)
                {
                    execResult.Error = ex.Message;
                    if (attempt >= maxAttempts)
                    {
                        execResult.DurationMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startMs;
                        return execResult;
                    }
                }

                // Exponential backoff before retry
                int waitMs = (int)(delayMs * Math.Pow(backoff, attempt - 1));
                await Task.Delay(Math.Min(waitMs, 60000), ct);
            }

            execResult.DurationMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startMs;
            return execResult;
        }

        public string ResolveTemplate(string template, WorkflowExecutionContext ctx)
        {
            return _evaluator.ResolveExpression(template, ctx);
        }

        public string ResolveNextNode(
            WebhookExecutionResult result,
            List<ResponseRoute> routes,
            string fallbackNodeId)
        {
            if (routes == null || routes.Count == 0)
                return fallbackNodeId;

            string body = result.ResponseBody ?? "";

            foreach (var route in routes)
            {
                if (string.IsNullOrEmpty(route.JsonPath) || string.IsNullOrEmpty(route.NextNodeId))
                    continue;

                try
                {
                    string fieldValue = ExtractJsonValue(body, route.JsonPath);
                    if (MatchesRoute(fieldValue, route.Operator, route.Value ?? ""))
                        return route.NextNodeId;
                }
                catch { /* skip broken route */ }
            }

            return fallbackNodeId;
        }

        // ─── Private — HTTP ───────────────────────────────────────────────────

        private HttpRequestMessage BuildRequest(
            string url, string method, string body,
            WebhookNodeConfig config, WorkflowExecutionContext ctx)
        {
            var req = new HttpRequestMessage(new HttpMethod(method), url);

            // Body
            if (!string.IsNullOrEmpty(body) && method != "GET" && method != "DELETE")
                req.Content = new StringContent(body, Encoding.UTF8, "application/json");

            // Custom headers (with template resolution)
            if (config.Headers != null)
            {
                foreach (var kv in config.Headers)
                {
                    string val = ResolveTemplate(kv.Value ?? "", ctx);
                    req.Headers.TryAddWithoutValidation(kv.Key, val);
                }
            }

            // Auth
            if (config.Auth != null)
                ApplyAuth(req, config.Auth, ctx);

            // Timeout via CancellationToken is handled by caller
            return req;
        }

        private void ApplyAuth(HttpRequestMessage req, WebhookAuthConfig auth,
            WorkflowExecutionContext ctx)
        {
            switch (auth.Type)
            {
                case WebhookAuthType.BearerToken:
                {
                    string token = ResolveTemplate(auth.Value ?? "", ctx);
                    req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + token);
                    break;
                }
                case WebhookAuthType.BasicAuth:
                {
                    string user = ResolveTemplate(auth.Username ?? "", ctx);
                    string pass = ResolveTemplate(auth.Value ?? "", ctx);
                    string encoded = Convert.ToBase64String(
                        Encoding.UTF8.GetBytes(user + ":" + pass));
                    req.Headers.TryAddWithoutValidation("Authorization", "Basic " + encoded);
                    break;
                }
                case WebhookAuthType.ApiKey:
                {
                    string key  = auth.HeaderName ?? "X-Api-Key";
                    string val  = ResolveTemplate(auth.Value ?? "", ctx);
                    req.Headers.TryAddWithoutValidation(key, val);
                    break;
                }
            }
        }

        private string BuildBody(WebhookNodeConfig config, WorkflowExecutionContext ctx)
        {
            // Start from template if provided
            var body = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            // Parse body template
            if (!string.IsNullOrWhiteSpace(config.BodyTemplate))
            {
                string resolved = ResolveTemplate(config.BodyTemplate, ctx);
                try
                {
                    var fromTemplate = JsonConvert.DeserializeObject<Dictionary<string, object>>(resolved);
                    if (fromTemplate != null)
                        foreach (var kvp in fromTemplate)
                            body[kvp.Key] = kvp.Value;
                }
                catch
                {
                    // BodyTemplate is not JSON — use raw string as body
                    return resolved;
                }
            }

            // Apply field mappings (override template values)
            if (config.BodyMappings != null && config.BodyMappings.Count > 0)
            {
                foreach (var mapping in config.BodyMappings)
                {
                    string value = mapping.StaticValue != null
                        ? ResolveTemplate(mapping.StaticValue, ctx)
                        : GetFormDataValue(ctx, mapping.FormFieldKey ?? "");

                    SetNestedValue(body, mapping.BodyPath ?? mapping.FormFieldKey ?? "", value);
                }
            }
            else if (string.IsNullOrWhiteSpace(config.BodyTemplate))
            {
                // No template, no mappings — send all form data
                if (ctx.FormData != null)
                    foreach (var kvp in ctx.FormData)
                        body[kvp.Key] = kvp.Value;
            }

            return JsonConvert.SerializeObject(body);
        }

        private string GetFormDataValue(WorkflowExecutionContext ctx, string key)
        {
            if (ctx.FormData == null || string.IsNullOrEmpty(key)) return "";
            object val = null;
            if (!ctx.FormData.TryGetValue(key, out val))
                foreach (var k in ctx.FormData.Keys)
                    if (string.Equals(k, key, StringComparison.OrdinalIgnoreCase))
                    {
                        val = ctx.FormData[k]; break;
                    }
            return val?.ToString() ?? "";
        }

        private void SetNestedValue(Dictionary<string, object> dict, string path, object value)
        {
            // Support dot-notation: "user.email" → { user: { email: value } }
            var parts = path.Split('.');
            if (parts.Length == 1)
            {
                dict[path] = value;
                return;
            }

            var current = dict;
            for (int i = 0; i < parts.Length - 1; i++)
            {
                object next = null;
                if (!current.TryGetValue(parts[i], out next) || !(next is Dictionary<string, object>))
                {
                    next = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    current[parts[i]] = next;
                }
                current = (Dictionary<string, object>)next;
            }
            current[parts[parts.Length - 1]] = value;
        }

        // ─── Private — Response routing ───────────────────────────────────────

        private string ExtractJsonValue(string json, string jsonPath)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(jsonPath))
                return "";

            try
            {
                var token = JObject.Parse(json);
                // Simple dot-notation: "$.status" or "status" or "data.code"
                string path = jsonPath.TrimStart('$', '.').Replace(".", ".");
                var parts = path.Split('.');
                JToken current = token;
                foreach (var part in parts)
                {
                    if (current == null) return "";
                    current = current[part];
                }
                return current?.ToString() ?? "";
            }
            catch { return ""; }
        }

        private bool MatchesRoute(string fieldValue, ResponseRouteOperator op, string routeValue)
        {
            switch (op)
            {
                case ResponseRouteOperator.Equals:
                    return string.Equals(fieldValue, routeValue, StringComparison.OrdinalIgnoreCase);
                case ResponseRouteOperator.NotEquals:
                    return !string.Equals(fieldValue, routeValue, StringComparison.OrdinalIgnoreCase);
                case ResponseRouteOperator.Contains:
                    return fieldValue.IndexOf(routeValue, StringComparison.OrdinalIgnoreCase) >= 0;
                case ResponseRouteOperator.GreaterThan:
                {
                    double a, b;
                    return double.TryParse(fieldValue, out a) && double.TryParse(routeValue, out b) && a > b;
                }
                case ResponseRouteOperator.LessThan:
                {
                    double a, b;
                    return double.TryParse(fieldValue, out a) && double.TryParse(routeValue, out b) && a < b;
                }
                case ResponseRouteOperator.Exists:
                    return !string.IsNullOrEmpty(fieldValue);
                case ResponseRouteOperator.NotExists:
                    return string.IsNullOrEmpty(fieldValue);
                default:
                    return false;
            }
        }

        // ─── Config parsing ───────────────────────────────────────────────────

        private WebhookNodeConfig ParseConfig(WorkflowNode node)
        {
            if (node.Config == null || node.Config.Count == 0)
                return new WebhookNodeConfig();

            string json = JsonConvert.SerializeObject(node.Config);
            return JsonConvert.DeserializeObject<WebhookNodeConfig>(json) ?? new WebhookNodeConfig();
        }

        private WebhookNodeConfig TryParseConfig(WorkflowNode node)
        {
            try { return ParseConfig(node); } catch { return null; }
        }

        private string NextNode(WorkflowNode node, WorkflowExecutionContext ctx)
        {
            // Default: engine follows default edge from this node
            return "handle::default";
        }
    }
}
