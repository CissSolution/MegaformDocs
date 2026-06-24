using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services
{
    public class EmailWorkflowNodeUiService : IEmailWorkflowNodeUiService
    {
        public WorkflowNodeUiSchema GetSchema()
        {
            return new WorkflowNodeUiSchema
            {
                NodeType = "SendEmail",
                Title = "Send Email",
                Description = "Server-driven email composer with presets, token-aware recipients, and reply settings.",
                Capabilities = GetCapabilities(),
                Presets = new List<WorkflowNodeUiPreset>(GetPresets()),
                Sections = new List<WorkflowNodeUiSection>
                {
                    new WorkflowNodeUiSection
                    {
                        Key = "recipients",
                        Title = "Recipients",
                        Description = "Choose who gets the email and how replies are handled.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("to", "To", true, "{{field.work_email}}", true, "Main recipient. Supports field and variable tokens."),
                            Text("cc", "Cc", false, "ops@example.com", true, "Optional carbon copy recipients."),
                            Text("replyTo", "Reply-To", false, "support@example.com", true, "Override where replies should be sent.")
                        }
                    },
                    new WorkflowNodeUiSection
                    {
                        Key = "content",
                        Title = "Content",
                        Description = "Subject and body template for the outgoing email.",
                        Fields = new List<WorkflowNodeUiField>
                        {
                            Text("subject", "Subject", true, "Thanks for your submission", true, "Subject line shown to the recipient."),
                            TextArea("body", "Body", true, "<p>Hello {{field.full_name}},</p><p>We received your form.</p>", true, "HTML body template. Use field or variable tokens as needed.")
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
                    Description = "Notify an internal mailbox with a short submission summary.",
                    Patch = new Dictionary<string, object>
                    {
                        ["to"] = "ops@example.com",
                        ["subject"] = "New workflow submission",
                        ["body"] = "<p>A new submission was received.</p><p>Email: {{field.work_email}}</p>"
                    }
                },
                new WorkflowNodeUiPreset
                {
                    Key = "approval-request",
                    Label = "Approval Request",
                    Description = "Ask an internal reviewer to approve the submission.",
                    Patch = new Dictionary<string, object>
                    {
                        ["to"] = "manager@example.com",
                        ["cc"] = "ops@example.com",
                        ["subject"] = "Approval required for {{field.full_name}}",
                        ["body"] = "<p>Please review the submission for {{field.full_name}} ({{field.work_email}}).</p><p>Status: pending approval.</p>"
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
    }
}
