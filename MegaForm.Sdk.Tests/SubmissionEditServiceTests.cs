using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [SubmissionEdit v20260802] Editing an existing submission must pass the same field- and
    /// step-level gate a first submit passes.
    ///
    /// Before this service both hosts checked only "may this actor touch this submission at all"
    /// and then wrote the client's dictionary verbatim, so a reviewer who could open a record could
    /// also rewrite fields their role may only read. These tests are the regression guard for that.
    /// </summary>
    public class SubmissionEditServiceTests
    {
        private static ShowIfCondition RoleRule(string role)
            => new ShowIfCondition
            {
                Operator = LogicOperator.And,
                Rules = new List<ShowIfRule>
                {
                    new ShowIfRule { SourceType = RuleSourceType.Role, Condition = ConditionType.Equals, Value = role },
                },
            };

        private static UserContext Actor(params string[] roles)
            => new UserContext { UserId = 7, Roles = new List<string>(roles) };

        private static FormField Field(string key) => new FormField { Key = key, Type = "Text" };

        private static SubmissionEditResult Edit(
            FormSchema schema,
            Dictionary<string, object> stored,
            Dictionary<string, object> incoming,
            UserContext actor)
            => SubmissionEditService.PrepareEdit(
                new FormInfo { FormId = 1 },
                schema,
                incoming,
                stored,
                actor,
                new List<FormPermissionInfo>());

        /// <summary>A field locked for this role keeps the value already in the database.</summary>
        [Fact]
        public void ReadOnlyField_KeepsTheStoredValue()
        {
            var locked = Field("approved_amount");
            locked.ReadOnlyIf = RoleRule("Reviewer");

            var schema = new FormSchema { Fields = new List<FormField> { Field("note"), locked } };
            var stored = new Dictionary<string, object> { ["note"] = "hello", ["approved_amount"] = "100" };
            var incoming = new Dictionary<string, object> { ["note"] = "hello", ["approved_amount"] = "999999" };

            var r = Edit(schema, stored, incoming, Actor("Reviewer"));

            Assert.True(r.Allowed);
            Assert.Equal("100", r.Data["approved_amount"]);
            Assert.Contains("approved_amount", r.Rejected);
            Assert.DoesNotContain(r.Changes, c => c.Key == "approved_amount");
        }

        /// <summary>
        /// The step cascade has to reach the EDIT path too. A field is editable in itself and only
        /// locked because the step that contains it is — if this fails, hiding a tab protects
        /// nothing once an edit endpoint is involved.
        /// </summary>
        [Fact]
        public void StepLockedField_KeepsTheStoredValue()
        {
            var stepStart = new FormField
            {
                Key = "finance_tab",
                Type = "Section",
                Properties = new Dictionary<string, object> { { "pageBreak", true } },
                ReadOnlyIf = RoleRule("Reviewer"),
            };

            var schema = new FormSchema { Fields = new List<FormField> { Field("note"), stepStart, Field("invoice_total") } };
            var stored = new Dictionary<string, object> { ["note"] = "hi", ["invoice_total"] = "250" };
            var incoming = new Dictionary<string, object> { ["invoice_total"] = "0" };

            var r = Edit(schema, stored, incoming, Actor("Reviewer"));

            Assert.True(r.Allowed);
            Assert.Equal("250", r.Data["invoice_total"]);
            Assert.Contains("invoice_total", r.Rejected);
        }

        /// <summary>An edit the actor is entitled to make goes through and is recorded.</summary>
        [Fact]
        public void AllowedChange_IsAppliedAndRecorded()
        {
            var schema = new FormSchema { Fields = new List<FormField> { Field("note") } };
            var stored = new Dictionary<string, object> { ["note"] = "old" };
            var incoming = new Dictionary<string, object> { ["note"] = "new" };

            var r = Edit(schema, stored, incoming, Actor("Editor"));

            Assert.True(r.Allowed);
            Assert.Equal("new", r.Data["note"]);
            Assert.True(r.HasChanges);
            var change = Assert.Single(r.Changes);
            Assert.Equal("note", change.Key);
            Assert.Equal("old", change.Before);
            Assert.Equal("new", change.After);
        }

        /// <summary>
        /// A payload that omits a field must not erase it. The endpoint takes a whole dictionary,
        /// and a caller sending only what it touched is the normal case, not an attack.
        /// </summary>
        [Fact]
        public void OmittedField_IsNotErased()
        {
            var schema = new FormSchema { Fields = new List<FormField> { Field("a"), Field("b") } };
            var stored = new Dictionary<string, object> { ["a"] = "keep", ["b"] = "also" };
            var incoming = new Dictionary<string, object> { ["a"] = "changed" };

            var r = Edit(schema, stored, incoming, Actor("Editor"));

            Assert.Equal("changed", r.Data["a"]);
            Assert.Equal("also", r.Data["b"]);
            Assert.Single(r.Changes);
        }

        /// <summary>Re-sending the value that is already stored is not a change worth auditing.</summary>
        [Fact]
        public void UnchangedValue_ProducesNoAuditNoise()
        {
            var schema = new FormSchema { Fields = new List<FormField> { Field("note") } };
            var stored = new Dictionary<string, object> { ["note"] = "same" };
            var incoming = new Dictionary<string, object> { ["note"] = "same" };

            var r = Edit(schema, stored, incoming, Actor("Editor"));

            Assert.False(r.HasChanges);
            Assert.Empty(r.Rejected);
        }

        /// <summary>The audit line names the field and both values — that is the point of it.</summary>
        [Fact]
        public void DescribeChanges_NamesFieldAndBothValues()
        {
            var text = SubmissionEditService.DescribeChanges(new[]
            {
                new SubmissionFieldChange { Key = "note", Before = "old", After = "new" },
                new SubmissionFieldChange { Key = "empty", Before = null, After = "x" },
            });

            Assert.Contains("note: \"old\" -> \"new\"", text);
            Assert.Contains("empty: (empty) -> \"x\"", text);
        }
    }
}
