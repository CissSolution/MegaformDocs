using System;
using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Phase A: server-driven UI schema for workflow node setting panels.
    /// C# decides schema/presets/capabilities, TS only renders.
    /// </summary>
    public class WorkflowNodeUiSchemaProvider : IWorkflowNodeUiSchemaProvider
    {
        private readonly IWebhookWorkflowNodeUiService _webhookUi;
        private readonly IEmailWorkflowNodeUiService _emailUi;

        public WorkflowNodeUiSchemaProvider() : this(null, null) { }

        public WorkflowNodeUiSchemaProvider(IWebhookWorkflowNodeUiService webhookUi, IEmailWorkflowNodeUiService emailUi)
        {
            _webhookUi = webhookUi ?? new WebhookWorkflowNodeUiService();
            _emailUi = emailUi ?? new EmailWorkflowNodeUiService();
        }

        public WorkflowNodeUiSchema GetSchema(string nodeType)
        {
            var type = (nodeType ?? string.Empty).Trim();
            if (string.Equals(type, "SendEmail", StringComparison.OrdinalIgnoreCase)) return _emailUi.GetSchema();
            if (string.Equals(type, "Webhook", StringComparison.OrdinalIgnoreCase)) return _webhookUi.GetSchema();
            if (string.Equals(type, "Database", StringComparison.OrdinalIgnoreCase)) return BuildDatabase();
            if (string.Equals(type, "GoogleSheets", StringComparison.OrdinalIgnoreCase)) return BuildGoogleSheets();
            if (string.Equals(type, "Switch", StringComparison.OrdinalIgnoreCase)) return BuildSwitch();
            if (string.Equals(type, "Loop", StringComparison.OrdinalIgnoreCase)) return BuildLoop();
            return null;
        }

        private static WorkflowNodeUiSchema BuildSendEmail_Obsolete()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "SendEmail",
                Title = "Send Email",
                Description = "Compose an email using form-field tokens and workflow variables.",
                Capabilities = new WorkflowNodeUiCapabilities { SupportsPresets = true, SupportsTokens = true, SupportsTest = false },
                Presets = new List<WorkflowNodeUiPreset>
                {
                    new WorkflowNodeUiPreset
                    {
                        Key = "confirmation",
                        Label = "Confirmation",
                        Description = "A polite confirmation email sent back to the submitter.",
                        Patch = new Dictionary<string, object>
                        {
                            ["to"] = "{{field.work_email}}",
                            ["subject"] = "Thanks for your submission",
                            ["body"] = "<p>Hello {{field.full_name}},</p><p>We received your form successfully.</p>"
                        }
                    },
                    new WorkflowNodeUiPreset
                    {
                        Key = "internal-alert",
                        Label = "Internal Alert",
                        Description = "Notify an internal mailbox with a short summary.",
                        Patch = new Dictionary<string, object>
                        {
                            ["to"] = "ops@example.com",
                            ["subject"] = "New workflow submission",
                            ["body"] = "<p>A new submission was received.</p><p>Email: {{field.work_email}}</p>"
                        }
                    }
                },
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "template",
                        Title = "Email template",
                        Description = "Recipients, subject, and message body.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("to", "To", true, "{{field.work_email}}", true),
                            Text("cc", "Cc", false, "{{field.manager_email}}", true),
                            Text("replyTo", "Reply-To", false, "support@example.com", true),
                            Text("subject", "Subject", true, "Thanks for your submission", true),
                            TextArea("body", "Body", true, "Hi {{field.full_name}}, ...", true)
                        }
                    }
                }
            };
        }

        private static WorkflowNodeUiSchema BuildWebhook_Obsolete()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "Webhook",
                Title = "Webhook",
                Description = "Send an outbound HTTP request after workflow conditions pass.",
                Capabilities = new WorkflowNodeUiCapabilities { SupportsPresets = true, SupportsTokens = true, SupportsTest = false },
                Presets = new List<WorkflowNodeUiPreset>
                {
                    new WorkflowNodeUiPreset
                    {
                        Key = "generic-json",
                        Label = "Generic JSON POST",
                        Description = "Simple JSON body with common form tokens.",
                        Patch = new Dictionary<string, object>
                        {
                            ["method"] = "POST",
                            ["bodyTemplate"] = "{\n  \"email\": \"{{field.work_email}}\",\n  \"name\": \"{{field.full_name}}\"\n}",
                            ["headers"] = new List<Dictionary<string, string>> { new Dictionary<string, string> { ["key"] = "Content-Type", ["value"] = "application/json" } }
                        }
                    },
                    new WorkflowNodeUiPreset
                    {
                        Key = "crm-post",
                        Label = "CRM POST",
                        Description = "Lead payload for a typical CRM endpoint.",
                        Patch = new Dictionary<string, object>
                        {
                            ["method"] = "POST",
                            ["bodyTemplate"] = "{\n  \"leadEmail\": \"{{field.work_email}}\",\n  \"leadName\": \"{{field.full_name}}\",\n  \"source\": \"MegaForm\"\n}",
                            ["headers"] = new List<Dictionary<string, string>> { new Dictionary<string, string> { ["key"] = "Content-Type", ["value"] = "application/json" } }
                        }
                    },
                    new WorkflowNodeUiPreset
                    {
                        Key = "simple-json",
                        Label = "Simple JSON",
                        Description = "Lean JSON body without extra headers.",
                        Patch = new Dictionary<string, object>
                        {
                            ["method"] = "POST",
                            ["bodyTemplate"] = "{\n  \"email\": \"{{field.work_email}}\"\n}"
                        }
                    }
                },
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "request",
                        Title = "Request",
                        Description = "Endpoint, method, and outbound payload.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("url", "URL", true, "https://api.example.com/forms", true),
                            Select("method", "Method", true, new [] { "GET", "POST", "PUT", "PATCH", "DELETE" }),
                            KeyValueList("headers", "Headers", "Header", "Value", true),
                            TextArea("bodyTemplate", "Body Template", false, "{\n  \"email\": \"{{field.work_email}}\"\n}", true),
                            Number("timeoutSeconds", "Timeout (seconds)", false, 30),
                            Number("retry.maxAttempts", "Retry Attempts", false, 3)
                        }
                    },
                    new WorkflowNodeUiSection
                    {
                        Key = "auth",
                        Title = "Authentication",
                        Description = "Optional auth header metadata.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Select("auth.type", "Auth Type", false, new [] { "None", "BearerToken", "BasicAuth", "ApiKey" }),
                            Text("auth.value", "Auth Value", false, "token or password", false),
                            Text("auth.headerName", "Header Name", false, "X-Api-Key", false),
                            Text("auth.username", "Username", false, "api-user", false)
                        }
                    }
                }
            };
        }

        private static WorkflowNodeUiSchema BuildGoogleSheets()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "GoogleSheets",
                Title = "Google Sheets",
                Description = "Append or update a row in Google Sheets using the canonical Sheets API request shape.",
                Capabilities = new WorkflowNodeUiCapabilities { SupportsPresets = false, SupportsTokens = true, SupportsTest = false },
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "destination",
                        Title = "Destination",
                        Description = "Choose a spreadsheet and target range.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("spreadsheetId", "Spreadsheet ID", true, "1AbCdEf...", false),
                            Text("range", "Sheet / Range", true, "Sheet1!A:D", false),
                            Select("operation", "Operation", true, new [] { "append", "update" }),
                            Select("valueInputOption", "Value input option", true, new [] { "USER_ENTERED", "RAW" }),
                            Select("insertDataOption", "Insert data option", false, new [] { "INSERT_ROWS", "OVERWRITE" })
                        }
                    }
                }
            };
        }

        private static WorkflowNodeUiSchema BuildSwitch()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "Switch",
                Title = "Switch",
                Description = "Route by matching a field against fixed case outputs.",
                Capabilities = new WorkflowNodeUiCapabilities { SupportsPresets = false, SupportsTokens = false, SupportsTest = false },
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "routing",
                        Title = "Routing",
                        Description = "Choose the field used for case matching.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("fieldKey", "Field key", false, "department", false),
                            Select("matchMode", "Match mode", false, new [] { "equals", "contains" })
                        }
                    }
                }
            };
        }

        private static WorkflowNodeUiSchema BuildLoop()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "Loop",
                Title = "Loop",
                Description = "Iterate a repeater/grid style collection with loop and done outputs.",
                Capabilities = new WorkflowNodeUiCapabilities { SupportsPresets = false, SupportsTokens = true, SupportsTest = false },
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "source",
                        Title = "Source",
                        Description = "Choose whether items come from a field or workflow variable.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Select("sourceType", "Source type", false, new [] { "field", "variable" }),
                            Text("fieldKey", "Field key", false, "repeater_items", false),
                            Text("variableKey", "Variable key", false, "items", false),
                            Number("maxIterations", "Max iterations", false, 25)
                        }
                    }
                }
            };
        }

        private static WorkflowNodeUiSchema BuildDatabase()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "Database",
                Title = "Database",
                Description = "Choose a database type, test the connection, then let the server load real metadata.",
                Capabilities = new WorkflowNodeUiCapabilities { SupportsPresets = true, SupportsTokens = true, SupportsTest = false, SupportsAsyncOptions = true },
                Presets = new List<WorkflowNodeUiPreset>
                {
                    new WorkflowNodeUiPreset
                    {
                        Key = "lead-insert",
                        Label = "Lead Insert",
                        Description = "Insert a new lead row into a table.",
                        Patch = new Dictionary<string, object>
                        {
                            ["operation"] = "Insert",
                            ["tableName"] = "Leads",
                            ["fieldMappings"] = new List<Dictionary<string, string>>
                            {
                                new Dictionary<string, string> { ["targetColumn"] = "Email", ["sourceKey"] = "{{field.work_email}}" },
                                new Dictionary<string, string> { ["targetColumn"] = "FullName", ["sourceKey"] = "{{field.full_name}}" }
                            }
                        }
                    },
                    new WorkflowNodeUiPreset
                    {
                        Key = "upsert-by-email",
                        Label = "Upsert by Email",
                        Description = "Update or insert using email as lookup key.",
                        Patch = new Dictionary<string, object>
                        {
                            ["operation"] = "Upsert",
                            ["tableName"] = "Contacts",
                            ["fieldMappings"] = new List<Dictionary<string, string>>
                            {
                                new Dictionary<string, string> { ["targetColumn"] = "Email", ["sourceKey"] = "{{field.work_email}}" },
                                new Dictionary<string, string> { ["targetColumn"] = "FullName", ["sourceKey"] = "{{field.full_name}}" }
                            },
                            ["whereMappings"] = new List<Dictionary<string, string>>
                            {
                                new Dictionary<string, string> { ["targetColumn"] = "Email", ["sourceKey"] = "{{field.work_email}}" }
                            }
                        }
                    },
                    new WorkflowNodeUiPreset
                    {
                        Key = "stored-proc",
                        Label = "Stored Proc",
                        Description = "Execute a stored procedure with mapped parameters.",
                        Patch = new Dictionary<string, object>
                        {
                            ["operation"] = "StoredProcedure",
                            ["procedureName"] = "usp_SaveLead",
                            ["fieldMappings"] = new List<Dictionary<string, string>>
                            {
                                new Dictionary<string, string> { ["targetColumn"] = "@Email", ["sourceKey"] = "{{field.work_email}}" },
                                new Dictionary<string, string> { ["targetColumn"] = "@Name", ["sourceKey"] = "{{field.full_name}}" }
                            }
                        }
                    }
                },
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "connection",
                        Title = "Connection",
                        Description = "Choose a reusable database connection configured in Dashboard → Database Settings.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            SelectSource("connectionName", "Connection Name", true, "database.connections"),
                            Select("operation", "Operation", true, new [] { "Insert", "Update", "Upsert", "StoredProcedure" }),
                            SelectSource("tableName", "Table Name", false, "database.tables",
                                new WorkflowNodeUiVisibility { FieldKey = "operation", In = new List<string> { "Insert", "Update", "Upsert" } }),
                            SelectSource("procedureName", "Procedure Name", false, "database.procedures",
                                new WorkflowNodeUiVisibility { FieldKey = "operation", Equals = "StoredProcedure" })
                        }
                    },
                    new WorkflowNodeUiSection
                    {
                        Key = "mappings",
                        Title = "Mappings",
                        Description = "Map workflow values to database columns or parameters.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            MappingList("fieldMappings", "Field Mappings", "Column / Param", "Token / Value", true, null, "database.targetFields"),
                            MappingList("whereMappings", "Where Mappings", "Lookup Column", "Token / Value", true,
                                new WorkflowNodeUiVisibility { FieldKey = "operation", In = new List<string> { "Update", "Upsert" } }, "database.targetFields"),
                            Number("timeoutSeconds", "Timeout (seconds)", false, 30),
                            Toggle("continueOnError", "Continue on Error", false)
                        }
                    }
                }
            };
        }

        private static WorkflowNodeUiField Text(string key, string label, bool required, string placeholder, bool supportsTokens, WorkflowNodeUiVisibility visibleWhen = null)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "text", Required = required, Placeholder = placeholder, SupportsTokens = supportsTokens, VisibleWhen = visibleWhen };
        }

        private static WorkflowNodeUiField SelectSource(string key, string label, bool required, string optionsSource, WorkflowNodeUiVisibility visibleWhen = null)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "select", Required = required, OptionsSource = optionsSource, VisibleWhen = visibleWhen };
        }

        private static WorkflowNodeUiField TextArea(string key, string label, bool required, string placeholder, bool supportsTokens)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "textarea", Required = required, Placeholder = placeholder, SupportsTokens = supportsTokens };
        }

        private static WorkflowNodeUiField Select(string key, string label, bool required, IEnumerable<string> options, WorkflowNodeUiVisibility visibleWhen = null)
        {
            var field = new WorkflowNodeUiField { Key = key, Label = label, Type = "select", Required = required, VisibleWhen = visibleWhen };
            foreach (var option in options)
            {
                field.Options.Add(new WorkflowNodeUiOption { Value = option, Label = option });
            }
            return field;
        }

        private static WorkflowNodeUiField Toggle(string key, string label, bool required)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "toggle", Required = required };
        }

        private static WorkflowNodeUiField Number(string key, string label, bool required, int defaultValue)
        {
            return new WorkflowNodeUiField { Key = key, Label = label, Type = "number", Required = required, DefaultValue = defaultValue };
        }

        private static WorkflowNodeUiField KeyValueList(string key, string label, string itemKeyLabel, string itemValueLabel, bool supportsTokens)
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
                SupportsTokens = supportsTokens
            };
        }

        private static WorkflowNodeUiField MappingList(string key, string label, string itemKeyLabel, string itemValueLabel, bool supportsTokens, WorkflowNodeUiVisibility visibleWhen = null, string itemKeyOptionsSource = null)
        {
            return new WorkflowNodeUiField
            {
                Key = key,
                Label = label,
                Type = "mappingList",
                ItemKeyLabel = itemKeyLabel,
                ItemValueLabel = itemValueLabel,
                ItemKeyPlaceholder = itemKeyLabel,
                ItemValuePlaceholder = itemValueLabel,
                SupportsTokens = supportsTokens,
                VisibleWhen = visibleWhen,
                ItemKeyOptionsSource = itemKeyOptionsSource
            };
        }
    }
}
