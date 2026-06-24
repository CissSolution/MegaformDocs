using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// Minimal canonical executor for Google Sheets nodes.
    /// This build wires the node into the backend runtime chain and returns
    /// a deterministic preview payload without performing outbound OAuth calls.
    /// </summary>
    public class GoogleSheetsNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType { get { return WorkflowNodeType.GoogleSheets; } }

        public GoogleSheetsNodeExecutor(IWorkflowEvaluator evaluator)
        {
            _evaluator = evaluator;
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var label = node != null ? (node.Label ?? node.Id ?? "Google Sheets") : "Google Sheets";

            GoogleSheetsNodeConfig config;
            try { config = ParseConfig(node); }
            catch (Exception ex)
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = "Config",
                    Message = "Google Sheets '" + label + "': invalid config — " + ex.Message,
                    Severity = "error"
                });
                return result;
            }

            if (string.IsNullOrWhiteSpace(config.SpreadsheetId))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = "SpreadsheetId",
                    Message = "Google Sheets '" + label + "': SpreadsheetId is required.",
                    Severity = "error"
                });
            }

            if (string.IsNullOrWhiteSpace(EffectiveRange(config)))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = "Range",
                    Message = "Google Sheets '" + label + "': Range is required.",
                    Severity = "error"
                });
            }

            return result;
        }

        public Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return Task.FromResult(WorkflowNodeResult.Skipped("handle::default"));

            GoogleSheetsNodeConfig config;
            try { config = ParseConfig(node); }
            catch (Exception ex)
            {
                return Task.FromResult(WorkflowNodeResult.Failed("Google Sheets: invalid config — " + ex.Message));
            }

            var range = EffectiveRange(config);
            var operation = string.IsNullOrWhiteSpace(config.Operation) ? "append" : config.Operation.Trim();
            var requestUrl = BuildRequestUrl(config, range, operation);
            var values = BuildValues(config, ctx);

            return Task.FromResult(WorkflowNodeResult.Success("handle::default", new
            {
                status = "canonical-chain-wired",
                executed = false,
                operation = operation,
                spreadsheetId = config.SpreadsheetId ?? string.Empty,
                range = range,
                requestUrl = requestUrl,
                valueInputOption = config.ValueInputOption ?? "USER_ENTERED",
                insertDataOption = config.InsertDataOption ?? "INSERT_ROWS",
                values = values,
                message = "Google Sheets node is now part of the backend canonical chain. Outbound API execution is intentionally not performed in this minimal patch."
            }));
        }

        private static GoogleSheetsNodeConfig ParseConfig(WorkflowNode node)
        {
            var json = JsonConvert.SerializeObject(node != null ? node.Config : null);
            var cfg = JsonConvert.DeserializeObject<GoogleSheetsNodeConfig>(json);
            if (cfg == null) throw new InvalidOperationException("Failed to deserialize GoogleSheetsNodeConfig.");
            if (cfg.ColumnMappings == null) cfg.ColumnMappings = new List<GoogleSheetsColumnMapping>();
            return cfg;
        }

        private static string EffectiveRange(GoogleSheetsNodeConfig config)
        {
            if (config == null) return string.Empty;
            var range = string.IsNullOrWhiteSpace(config.Range) ? config.SheetName : config.Range;
            return (range ?? string.Empty).Trim();
        }

        private string[] BuildValues(GoogleSheetsNodeConfig config, WorkflowExecutionContext ctx)
        {
            return (config != null && config.ColumnMappings != null ? config.ColumnMappings : new List<GoogleSheetsColumnMapping>())
                .Where(m => !string.IsNullOrWhiteSpace(m.Column) || !string.IsNullOrWhiteSpace(m.Source) || !string.IsNullOrWhiteSpace(m.Value))
                .Take(12)
                .Select(m => ResolveMappingValue(m, ctx))
                .ToArray();
        }

        private string ResolveMappingValue(GoogleSheetsColumnMapping mapping, WorkflowExecutionContext ctx)
        {
            if (mapping == null) return string.Empty;

            if (!string.IsNullOrWhiteSpace(mapping.Value))
                return _evaluator.ResolveTemplate(mapping.Value, ctx) ?? string.Empty;

            var source = (mapping.Source ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(source)) return string.Empty;

            object raw;
            if (ctx != null && ctx.FormData != null && ctx.FormData.TryGetValue(source, out raw))
                return raw != null ? Convert.ToString(raw) : string.Empty;

            if (ctx != null && ctx.Variables != null && ctx.Variables.TryGetValue(source, out raw))
                return raw != null ? Convert.ToString(raw) : string.Empty;

            return _evaluator.ResolveTemplate("{{field." + source + "}}", ctx) ?? string.Empty;
        }

        private static string BuildRequestUrl(GoogleSheetsNodeConfig config, string range, string operation)
        {
            var spreadsheetId = Uri.EscapeDataString((config != null ? config.SpreadsheetId : null) ?? string.Empty);
            var rangeEncoded = Uri.EscapeDataString(range ?? string.Empty);
            var valueInputOption = Uri.EscapeDataString((config != null ? config.ValueInputOption : null) ?? "USER_ENTERED");
            if (string.Equals(operation, "update", StringComparison.OrdinalIgnoreCase))
                return "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values/" + rangeEncoded + "?valueInputOption=" + valueInputOption;

            var insertDataOption = Uri.EscapeDataString((config != null ? config.InsertDataOption : null) ?? "INSERT_ROWS");
            return "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values/" + rangeEncoded + ":append?valueInputOption=" + valueInputOption + "&insertDataOption=" + insertDataOption;
        }
    }
}
