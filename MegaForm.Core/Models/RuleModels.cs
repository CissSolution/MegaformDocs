using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    // ── Enums ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Logic operator for rule condition groups (all = AND, any = OR).
    /// Named RuleLogicOperator to avoid conflict with FormSchema.LogicOperator (And/Or).
    /// JSON values: "all" | "any"
    /// </summary>
    public enum RuleLogicOperator { all, any }

    public enum ComparisonOperator
    {
        eq, neq, gt, gte, lt, lte,
        contains, startsWith, endsWith,
        @in, notIn, isEmpty, isNotEmpty, isTrue, isFalse
    }

    public enum RuleActionType
    {
        show, hide, require, optional, enable, disable, setValue, clear
    }

    public enum RuleTargetType { field, section, step }

    // ── Condition nodes ──────────────────────────────────────────────────────

    public abstract class ConditionNode
    {
        public string Id   { get; set; }
        public string Type { get; set; }
    }

    public sealed class ConditionRule : ConditionNode
    {
        public string             Field    { get; set; }
        public ComparisonOperator Operator { get; set; }
        public object             Value    { get; set; }
    }

    public sealed class ConditionGroup : ConditionNode
    {
        public RuleLogicOperator   Logic    { get; set; }
        public List<ConditionNode> Children { get; set; }

        public ConditionGroup()
        {
            Logic    = RuleLogicOperator.all;
            Children = new List<ConditionNode>();
        }
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    public class RuleAction
    {
        public string         Id         { get; set; }
        public RuleActionType Action     { get; set; }
        public RuleTargetType TargetType { get; set; }
        public string         Target     { get; set; }
        public object         Value      { get; set; }
    }

    // ── Rule definition ──────────────────────────────────────────────────────

    public class RuleDefinition
    {
        public string           Id       { get; set; }
        public string           Name     { get; set; }
        public bool             Enabled  { get; set; }
        public int              Priority { get; set; }
        public ConditionGroup   When     { get; set; }
        public List<RuleAction> Then     { get; set; }
        public List<RuleAction> Else     { get; set; }

        public RuleDefinition()
        {
            Enabled  = true;
            Priority = 1;
            When     = new ConditionGroup();
            Then     = new List<RuleAction>();
            Else     = new List<RuleAction>();
        }
    }

    // ── Evaluation output ────────────────────────────────────────────────────

    public class EvaluationEffect
    {
        public RuleActionType Action         { get; set; }
        public RuleTargetType TargetType     { get; set; }
        public string         Target         { get; set; }
        public object         Value          { get; set; }
        public string         SourceRuleId   { get; set; }
        public string         SourceRuleName { get; set; }
    }

    public class EvaluationResult
    {
        public bool                   Matched { get; set; }
        public List<EvaluationEffect> Effects { get; set; }

        public EvaluationResult()
        {
            Effects = new List<EvaluationEffect>();
        }
    }
}
