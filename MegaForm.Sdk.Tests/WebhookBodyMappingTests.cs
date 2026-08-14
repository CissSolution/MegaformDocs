using System.Collections.Generic;
using System.Reflection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services.Workflow;
using MegaForm.Core.Workflow;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [MappedFieldsFix v20260813] Regression lock for the webhook payload builder.
    ///
    /// The bug this pins down: BuildBody chose the static branch on `StaticValue != null`, while the
    /// builder serialises EVERY mapping row as `StaticValue: row.staticValue || ''`
    /// (serializeNodeConfigForApi, src/builder/workflow/index.ts). An empty string is not null, so
    /// every mapped field resolved to "" and the CRM received the right JSON shape carrying no data.
    /// Nothing failed — the node reported success, the endpoint returned 200 — which is why it
    /// survived: only reading the received body reveals it. Confirmed on a live submission against
    /// the mock CRM on 2026-08-13 before the fix, and again after.
    ///
    /// BuildBody is private; reflection is deliberate. Going through ExecuteAsync would need a real
    /// socket, and the defect is entirely in how the body is assembled.
    /// </summary>
    public sealed class WebhookBodyMappingTests
    {
        private sealed class PassthroughEvaluator : IWorkflowEvaluator
        {
            public bool EvaluateCondition(string conditionsJson, Dictionary<string, object> data) => true;
            public string ResolveExpression(string template, WorkflowExecutionContext ctx) => template;
            public string ResolveTemplate(string template, WorkflowExecutionContext ctx) => template;
            public double Calculate(string operand1, CalcOperator op, string operand2, WorkflowExecutionContext ctx) => 0;
            public WorkflowNavigationResult EvaluateNavigation(WorkflowDefinition definition, string currentNodeId,
                Dictionary<string, object> formData) => null;
            public WorkflowValidationResult ValidateDefinition(WorkflowDefinition definition,
                ValidationMode mode = ValidationMode.Apply) => new WorkflowValidationResult { IsValid = true };
        }

        private static JObject BuildBody(WebhookNodeConfig config, WorkflowExecutionContext ctx)
        {
            var executor = new WebhookNodeExecutor(new PassthroughEvaluator());
            var method = typeof(WebhookNodeExecutor)
                .GetMethod("BuildBody", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.NotNull(method);
            var json = (string)method.Invoke(executor, new object[] { config, ctx });
            return JObject.Parse(json);
        }

        private static WorkflowExecutionContext Ctx() => new WorkflowExecutionContext
        {
            FormId = 12,
            SubmissionId = 99,
            FormData = new Dictionary<string, object>
            {
                { "full_name", "Tran Thi B" },
                { "email", "lead@example.com" },
                { "phone", "0911222333" },
            },
        };

        [Fact]
        public void MappedFields_WithEmptyStaticValue_SendTheFormFieldNotBlank()
        {
            // Exactly what the builder writes: every row carries StaticValue = "".
            var config = new WebhookNodeConfig
            {
                Url = "https://crm.example.com/api/leads",
                BodyMappings = new List<WebhookFieldMapping>
                {
                    new WebhookFieldMapping { FormFieldKey = "full_name", BodyPath = "customer.name",  StaticValue = "" },
                    new WebhookFieldMapping { FormFieldKey = "email",     BodyPath = "customer.email", StaticValue = "" },
                    new WebhookFieldMapping { FormFieldKey = "phone",     BodyPath = "customer.phone", StaticValue = "" },
                },
            };

            var body = BuildBody(config, Ctx());

            Assert.Equal("Tran Thi B",       (string)body["customer"]["name"]);
            Assert.Equal("lead@example.com", (string)body["customer"]["email"]);
            Assert.Equal("0911222333",       (string)body["customer"]["phone"]);
        }

        [Fact]
        public void MappedFields_WithARealStaticValue_StillSendTheConstant()
        {
            var config = new WebhookNodeConfig
            {
                Url = "https://crm.example.com/api/leads",
                BodyMappings = new List<WebhookFieldMapping>
                {
                    new WebhookFieldMapping { FormFieldKey = "full_name", BodyPath = "customer.name", StaticValue = "" },
                    new WebhookFieldMapping { FormFieldKey = "",          BodyPath = "source",        StaticValue = "website" },
                },
            };

            var body = BuildBody(config, Ctx());

            Assert.Equal("Tran Thi B", (string)body["customer"]["name"]);
            Assert.Equal("website",    (string)body["source"]);
        }

        [Fact]
        public void NoMappingsAndNoTemplate_SendsEveryFormField()
        {
            var body = BuildBody(new WebhookNodeConfig { Url = "https://crm.example.com/api/leads" }, Ctx());

            Assert.Equal("Tran Thi B",       (string)body["full_name"]);
            Assert.Equal("lead@example.com", (string)body["email"]);
            Assert.Equal("0911222333",       (string)body["phone"]);
        }
    }
}
