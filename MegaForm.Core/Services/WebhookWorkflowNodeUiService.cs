using System;
using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services
{
    public class WebhookWorkflowNodeUiService : IWebhookWorkflowNodeUiService
    {
        public WorkflowNodeUiSchema GetSchema()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "Webhook",
                Title = "Webhook",
                Description = "Server-defined request schema, auth options, timeout, retries, and ready-made webhook presets.",
                Capabilities = GetCapabilities(),
                Presets = new List<WorkflowNodeUiPreset>(GetPresets()),
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "request",
                        Title = "Request",
                        Description = "Endpoint, method, timeout, and payload template.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("url", "URL", true, "https://api.example.com/forms", true, "The outbound endpoint to call."),
                            Select("method", "Method", true, new [] { "GET", "POST", "PUT", "PATCH", "DELETE" }, null, "HTTP verb used for the outbound request."),
                            KeyValueList("headers", "Headers", "Header", "Value", true, "Common examples: Content-Type, Authorization, X-Api-Key."),
                            TextArea("bodyTemplate", "Body Template", false, "{\n  \"email\": \"{{field.work_email}}\"\n}", true, "JSON or text payload. Field and variable tokens are supported."),
                            Number("timeoutSeconds", "Timeout (seconds)", false, 30, "Maximum request duration before timeout."),
                            Number("retry.maxAttempts", "Retry Attempts", false, 3, "How many times the webhook should retry on transient failure.")
                        }
                    },
                    new WorkflowNodeUiSection
                    {
                        Key = "auth",
                        Title = "Authentication",
                        Description = "Server-defined auth capabilities for this webhook node.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Select("auth.type", "Auth Type", false, new [] { "None", "BearerToken", "BasicAuth", "ApiKey" }, null, "Choose how the request should be authenticated."),
                            Text("auth.value", "Secret / Token", false, "token or password", false, "Bearer token, API key value, or password."),
                            Text("auth.headerName", "Header Name", false, "X-Api-Key", false, "Used for ApiKey auth mode."),
                            Text("auth.username", "Username", false, "api-user", false, "Used for BasicAuth mode.")
                        }
                    },
                    new WorkflowNodeUiSection
                    {
                        Key = "routing",
                        Title = "Response routing",
                        Description = "Capture a response marker into a workflow variable for downstream decisions.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("responseVariableKey", "Response Variable", false, "webhook_status", false, "Optional workflow variable key used to store webhook response info."),
                            Toggle("continueOnError", "Continue on Error", false, "If enabled, the workflow continues even if the webhook fails.")
                        }
                    }
                }
            };
        }

        public IEnumerable<WorkflowNodeUiPreset> GetPresets()
        {
            return new List<WorkflowNodeUiPreset>
            {
                new WorkflowNodeUiPreset
                {
                    Key = "generic-json",
                    Label = "Generic JSON POST",
                    Description = "Simple JSON payload with common form tokens.",
                    Patch = new Dictionary<string, object>
                    {
                        ["method"] = "POST",
                        ["headers"] = new List<Dictionary<string, string>> { new Dictionary<string, string> { ["key"] = "Content-Type", ["value"] = "application/json" } },
                        ["bodyTemplate"] = "{\n  \"email\": \"{{field.work_email}}\",\n  \"name\": \"{{field.full_name}}\"\n}"
                    }
                },
                new WorkflowNodeUiPreset
                {
                    Key = "crm-post",
                    Label = "CRM Lead POST",
                    Description = "Lead payload for a typical CRM or sales endpoint.",
                    Patch = new Dictionary<string, object>
                    {
                        ["method"] = "POST",
                        ["headers"] = new List<Dictionary<string, string>> { new Dictionary<string, string> { ["key"] = "Content-Type", ["value"] = "application/json" } },
                        ["bodyTemplate"] = "{\n  \"leadEmail\": \"{{field.work_email}}\",\n  \"leadName\": \"{{field.full_name}}\",\n  \"source\": \"MegaForm\"\n}",
                        ["responseVariableKey"] = "crm_status"
                    }
                },
                new WorkflowNodeUiPreset
                {
                    Key = "slack-style",
                    Label = "Slack-style Webhook",
                    Description = "Compact text payload suitable for team notifications or chat integrations.",
                    Patch = new Dictionary<string, object>
                    {
                        ["method"] = "POST",
                        ["headers"] = new List<Dictionary<string, string>> { new Dictionary<string, string> { ["key"] = "Content-Type", ["value"] = "application/json" } },
                        ["bodyTemplate"] = "{\n  \"text\": \"New submission from {{field.full_name}} ({{field.work_email}})\"\n}"
                    }
                },
                new WorkflowNodeUiPreset
                {
                    Key = "api-key-post",
                    Label = "API Key POST",
                    Description = "JSON request with API key header preconfigured.",
                    Patch = new Dictionary<string, object>
                    {
                        ["method"] = "POST",
                        ["auth"] = new Dictionary<string, object> { ["type"] = "ApiKey", ["headerName"] = "X-Api-Key", ["value"] = "" },
                        ["headers"] = new List<Dictionary<string, string>> { new Dictionary<string, string> { ["key"] = "Content-Type", ["value"] = "application/json" } },
                        ["bodyTemplate"] = "{\n  \"email\": \"{{field.work_email}}\"\n}"
                    }
                }
            };
        }

        public WorkflowNodeUiCapabilities GetCapabilities()
        {
            return new WorkflowNodeUiCapabilities
            {
                SupportsPresets = true,
                SupportsTokens = true,
                SupportsAsyncOptions = false,
                SupportsTest = false
            };
        }

        private static WorkflowNodeUiField Text(string key, string label, bool required, string placeholder, bool supportsTokens, string helpText)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "text", Required = required, Placeholder = placeholder, SupportsTokens = supportsTokens, HelpText = helpText };
        }
        private static WorkflowNodeUiField TextArea(string key, string label, bool required, string placeholder, bool supportsTokens, string helpText)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "textarea", Required = required, Placeholder = placeholder, SupportsTokens = supportsTokens, HelpText = helpText };
        }
        private static WorkflowNodeUiField Number(string key, string label, bool required, int defaultValue, string helpText)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "number", Required = required, DefaultValue = defaultValue, HelpText = helpText };
        }
        private static WorkflowNodeUiField Toggle(string key, string label, bool required, string helpText)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "toggle", Required = required, HelpText = helpText };
        }
        private static WorkflowNodeUiField Select(string key, string label, bool required, IEnumerable<string> options, WorkflowNodeUiVisibility visibleWhen, string helpText)
        {
            var field = new WorkflowNodeUiField { Key = key, Label = label, Type = "select", Required = required, VisibleWhen = visibleWhen, HelpText = helpText };
            foreach (var option in options)
                field.Options.Add(new WorkflowNodeUiOption { Value = option, Label = option });
            return field;
        }
        private static WorkflowNodeUiField KeyValueList(string key, string label, string itemKeyLabel, string itemValueLabel, bool supportsTokens, string helpText)
        {
            return new WorkflowNodeUiField
            {
                Key = key,
                Label = label,
                Type = "keyValueList",
                ItemKeyLabel = itemKeyLabel,
                ItemValueLabel = itemValueLabel,
                ItemKeyPlaceholder = itemKeyLabel,
                ItemValuePlaceholder = itemValueLabel,
                SupportsTokens = supportsTokens,
                HelpText = helpText
            };
        }
    }
}
