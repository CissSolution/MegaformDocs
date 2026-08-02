using System.Collections.Generic;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [StepAccess v20260802] A rule on the Section that opens a step governs the whole step.
    ///
    /// These assert the cascade on BOTH representations, because the two enforcement paths read
    /// different ones: the render projection walks JSON, submit-time enforcement walks the typed
    /// schema. A cascade that only reached the JSON side would hide a step in the browser while
    /// still accepting a POST that writes straight through it.
    /// </summary>
    public class StepAccessCascadeTests
    {
        private static ShowIfCondition RoleRule(string role)
            => new ShowIfCondition
            {
                Operator = LogicOperator.And,
                Rules = new List<ShowIfRule>
                {
                    new ShowIfRule
                    {
                        SourceType = RuleSourceType.Role,
                        Condition = ConditionType.Equals,
                        Value = role,
                    },
                },
            };

        private static RuleEvaluationContext Actor(params string[] roles)
            => new RuleEvaluationContext { User = new UserContext { Roles = new List<string>(roles) } };

        private static FormField Field(string key, string type = "Text")
            => new FormField { Key = key, Type = type };

        private static FormField StepStart(string key, ShowIfCondition showIf = null, ShowIfCondition readOnlyIf = null)
            => new FormField
            {
                Key = key,
                Type = "Section",
                Properties = new Dictionary<string, object> { { "pageBreak", true } },
                ShowIf = showIf,
                ReadOnlyIf = readOnlyIf,
            };

        /// <summary>Fields of a step whose opening Section is denied become denied themselves.</summary>
        [Fact]
        public void HiddenStep_DeniesEveryFieldItContains()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    Field("public_note"),                            // before any step start
                    StepStart("finance_tab", showIf: RoleRule("Finance")),
                    Field("invoice_no"),
                    Field("amount"),
                },
            };

            var policy = new FieldAccessPolicy();
            FormStepAccessCascade.Collect(schema, Actor("Sales"), policy);

            Assert.Contains("invoice_no", policy.DeniedFields);
            Assert.Contains("amount", policy.DeniedFields);
            Assert.DoesNotContain("public_note", policy.DeniedFields);
        }

        /// <summary>The same step, opened by someone who holds the role, stays untouched.</summary>
        [Fact]
        public void HiddenStep_LeavesTheHolderAlone()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    StepStart("finance_tab", showIf: RoleRule("Finance")),
                    Field("invoice_no"),
                },
            };

            var policy = new FieldAccessPolicy();
            FormStepAccessCascade.Collect(schema, Actor("Finance"), policy);

            Assert.True(policy.IsEmpty);
        }

        /// <summary>readOnlyIf locks the step's fields instead of removing them.</summary>
        [Fact]
        public void ReadOnlyStep_LocksFieldsWithoutHidingThem()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    StepStart("review_tab", readOnlyIf: RoleRule("Reviewer")),
                    Field("applicant_name"),
                },
            };

            var policy = new FieldAccessPolicy();
            FormStepAccessCascade.Collect(schema, Actor("Reviewer"), policy);

            Assert.Contains("applicant_name", policy.ReadOnlyFields);
            Assert.DoesNotContain("applicant_name", policy.DeniedFields);
        }

        /// <summary>
        /// A verdict stops at the next page break. Without this a single restricted tab would take
        /// the rest of the form down with it.
        /// </summary>
        [Fact]
        public void Verdict_StopsAtTheNextStep()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    StepStart("finance_tab", showIf: RoleRule("Finance")),
                    Field("amount"),
                    StepStart("contact_tab"),
                    Field("email"),
                },
            };

            var policy = new FieldAccessPolicy();
            FormStepAccessCascade.Collect(schema, Actor("Sales"), policy);

            Assert.Contains("amount", policy.DeniedFields);
            Assert.DoesNotContain("email", policy.DeniedFields);
        }

        /// <summary>A Section that is not a page break is a heading, not a step.</summary>
        [Fact]
        public void PlainSection_DoesNotOpenAStep()
        {
            var heading = new FormField
            {
                Key = "heading",
                Type = "Section",
                Properties = new Dictionary<string, object>(),
                ShowIf = RoleRule("Finance"),
            };

            var schema = new FormSchema { Fields = new List<FormField> { heading, Field("amount") } };

            var policy = new FieldAccessPolicy();
            FormStepAccessCascade.Collect(schema, Actor("Sales"), policy);

            Assert.DoesNotContain("amount", policy.DeniedFields);
        }

        /// <summary>
        /// The JSON walk must reach the same verdict as the typed one — that equivalence is what
        /// keeps the render view and the submit gate from disagreeing.
        /// </summary>
        [Fact]
        public void JsonWalk_MatchesTypedWalk()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    StepStart("finance_tab", showIf: RoleRule("Finance")),
                    Field("amount"),
                    StepStart("contact_tab"),
                    Field("email"),
                },
            };

            var typed = new FieldAccessPolicy();
            FormStepAccessCascade.Collect(schema, Actor("Sales"), typed);

            var json = (JArray)JObject.Parse(JsonConvert.SerializeObject(schema))["fields"];
            var fromJson = new FieldAccessPolicy();
            FormStepAccessCascade.Collect(json, Actor("Sales"), fromJson);

            Assert.Equal(typed.DeniedFields, fromJson.DeniedFields);
            Assert.Equal(typed.ReadOnlyFields, fromJson.ReadOnlyFields);
        }
    }
}
