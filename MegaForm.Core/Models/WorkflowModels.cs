using System;
using System.Collections.Generic;
using System.Linq;

// ══════════════════════════════════════════════════════════════════════════════
//  MegaForm.Core.Models.WorkflowModels
//  Workflow Engine v2.0 — Visual Canvas + Node Graph + Parallel Execution
//
//  Design decisions (chốt):
//  - WorkflowDefinition là SUPERSET của RulesJson. Backward compatible.
//  - WorkflowJson là cột MỚI trong MF_Forms. RulesJson giữ nguyên.
//  - C# 7.3 compatible: không dùng records, default interface methods, switch expression.
//  - Namespace: MegaForm.Core.Workflow (tách biệt với Core.Models để tránh conflict)
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Core.Workflow
{
    // ─────────────────────────────────────────────────────────────────────────
    //  ENUMS
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Loại node trong workflow graph.
    /// V1: FormField, Condition, Webhook, SendEmail, End.
    /// V1.5: Fork, Join, Calculate.
    /// V2: SetVariable, Delay, Approval, SubWorkflow.
    /// </summary>
    public enum WorkflowNodeType
    {
        // V1 — bắt buộc
        FormField   = 1,
        Condition   = 2,
        Webhook     = 3,
        SendEmail   = 4,
        End         = 5,

        // V1.5 — nâng cao
        Fork        = 10,
        Join        = 11,
        Calculate   = 12,

        // V2 — production nodes
        SetVariable = 20,
        Database    = 24,   // Database write node (Insert/Update/Upsert/StoredProcedure)
        GoogleSheets = 25,  // Google Sheets action node (canonical chain wired; runtime auth may be environment-specific)
        Switch      = 26,  // Multi-case branching node (UI-fixed cases; backend routes by matched case handle)
        Loop        = 27,  // Repeater/grid loop node (minimal backend iterator)

        // [Recovered June-15] Identity provisioning nodes
        AddRole       = 28,
        AddUser       = 29,
        AddUserToRole = 30,

        // V2 — future (not yet exposed on palette)
        Delay       = 21,
        Approval    = 22,
        SubWorkflow = 23,
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SUPPORTED NODE TYPES — palette + runtime whitelist
    //  Any type NOT in this list will be rejected at save validation.
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Set of node types that have a real executor registered and are
    /// allowed to appear on the palette and be saved/executed.
    /// </summary>
    public static class SupportedNodeTypes
    {
        public static readonly HashSet<WorkflowNodeType> All = new HashSet<WorkflowNodeType>
        {
            WorkflowNodeType.FormField,
            WorkflowNodeType.Condition,
            WorkflowNodeType.End,
            WorkflowNodeType.Calculate,
            WorkflowNodeType.SetVariable,
            WorkflowNodeType.Webhook,
            WorkflowNodeType.SendEmail,
            WorkflowNodeType.Database,
            WorkflowNodeType.GoogleSheets,
            WorkflowNodeType.Switch,
            WorkflowNodeType.Loop,
        };
    }

    /// <summary>
    /// Zone của node trên canvas.
    /// Navigation: xanh dương — form navigation client-side.
    /// Action: vàng — post-submit server-side.
    /// </summary>
    public enum WorkflowZoneType
    {
        Navigation = 1,
        Action     = 2,
    }

    /// <summary>Loại edge kết nối giữa 2 nodes.</summary>
    public enum WorkflowEdgeType
    {
        Default     = 1,
        Conditional = 2,    // Yes/No từ Condition node
        Fork        = 3,    // Từ Fork node ra các branches
        Error       = 4,    // Error routing
    }

    /// <summary>HTTP method cho Webhook node.</summary>
    public enum WebhookMethod { GET, POST, PUT, PATCH, DELETE }

    /// <summary>Auth type cho Webhook node.</summary>
    public enum WebhookAuthType { None, BearerToken, BasicAuth, ApiKey }

    /// <summary>Chiến lược Join: chờ bao nhiêu branches.</summary>
    public enum JoinStrategy
    {
        WaitAll  = 1,    // Chờ tất cả branches (default)
        WaitAny  = 2,    // Chạy tiếp khi branch đầu tiên xong
        WaitFirst = 3,   // Alias WaitAny, explicit
    }

    /// <summary>Phép tính cho Calculate node.</summary>
    public enum CalcOperator
    {
        Add      = 1,
        Subtract = 2,
        Multiply = 3,
        Divide   = 4,
        Modulo   = 5,
        Power    = 6,
        Assign   = 7,   // Gán thẳng giá trị (không tính)
    }

    /// <summary>Loại kết thúc của End node.</summary>
    public enum EndType { Success = 1, Failure = 2, Cancelled = 3 }

    /// <summary>Trạng thái của 1 lần chạy workflow.</summary>
    public enum WorkflowExecutionStatus
    {
        Running   = 1,
        Waiting   = 2,   // [Recovered June-15] case/task pending
        Completed = 3,
        Failed    = 4,
        Cancelled = 5,
    }

    /// <summary>Kiểu dữ liệu của WorkflowVariable.</summary>
    public enum WorkflowVariableType
    {
        Number  = 1,
        String  = 2,
        Boolean = 3,
        Object  = 4,
    }

    /// <summary>Operator cho ResponseRoute condition (so sánh webhook response).</summary>
    public enum ResponseRouteOperator
    {
        Equals      = 1,
        NotEquals   = 2,
        Contains    = 3,
        GreaterThan = 4,
        LessThan    = 5,
        Exists      = 6,
        NotExists   = 7,
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ROOT — WorkflowDefinition
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Root object của toàn bộ workflow. Được serialize thành WorkflowJson TEXT trong MF_Forms.
    /// 1 form có đúng 1 WorkflowDefinition (nhiều nodes + edges bên trong).
    /// </summary>
    public class WorkflowDefinition
    {
        /// <summary>GUID, unique identifier của workflow này.</summary>
        public string Id { get; set; }

        /// <summary>FormId sở hữu workflow này.</summary>
        public int FormId { get; set; }

        /// <summary>Tên hiển thị trong builder. VD: "Job Application Flow".</summary>
        public string Name { get; set; }

        /// <summary>Semantic version. Tăng mỗi khi save. Format: "1.0.0".</summary>
        public string Version { get; set; }

        /// <summary>Toàn bộ nodes trong graph.</summary>
        public List<WorkflowNode> Nodes { get; set; }

        /// <summary>Toàn bộ edges (connections) giữa các nodes.</summary>
        public List<WorkflowEdge> Edges { get; set; }

        /// <summary>
        /// Biến toàn cục của workflow. VD: score, totalPrice, riskLevel.
        /// Được dùng trong Calculate nodes và Expression resolution.
        /// </summary>
        public List<WorkflowVariable> Variables { get; set; }

        /// <summary>
        /// NodeId đầu tiên được execute sau khi form submit.
        /// Với Navigation Layer: nodeId đầu tiên của form flow.
        /// </summary>
        public string StartNodeId { get; set; }

        /// <summary>Global settings: timeout, error handling.</summary>
        public WorkflowSettings Settings { get; set; }

        /// <summary>UTC timestamp tạo.</summary>
        public DateTime CreatedAt { get; set; }

        /// <summary>UTC timestamp cập nhật lần cuối.</summary>
        public DateTime UpdatedAt { get; set; }

        /// <summary>
        /// Nếu true: workflow này được migrate từ RulesJson cũ.
        /// Dùng để tracking, không ảnh hưởng execution.
        /// </summary>
        public bool MigratedFromRules { get; set; }

        public WorkflowDefinition()
        {
            Id        = Guid.NewGuid().ToString("N");
            Version   = "1.0.0";
            Nodes     = new List<WorkflowNode>();
            Edges     = new List<WorkflowEdge>();
            Variables = new List<WorkflowVariable>();
            Settings  = new WorkflowSettings();
            CreatedAt = DateTime.UtcNow;
            UpdatedAt = DateTime.UtcNow;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  NODE
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Một node trong workflow graph.
    /// Config là Dictionary để flexible — mỗi NodeType có schema config riêng.
    /// TypedConfig (strongly-typed) được resolve khi execute.
    /// </summary>
    public class WorkflowNode
    {
        /// <summary>GUID, unique trong workflow này.</summary>
        public string Id { get; set; }

        /// <summary>Loại node — xác định executor và canvas UI component.</summary>
        public WorkflowNodeType Type { get; set; }

        /// <summary>Tên hiển thị trên canvas node. Editable.</summary>
        public string Label { get; set; }

        /// <summary>Tọa độ trên React Flow canvas.</summary>
        public CanvasPosition Position { get; set; }

        /// <summary>
        /// Zone của node: Navigation (xanh) hoặc Action (vàng).
        /// Dùng để visual grouping trên canvas.
        /// </summary>
        public WorkflowZoneType ZoneType { get; set; }

        /// <summary>
        /// Cấu hình riêng của từng node type.
        /// Key-value flexible để serialize/deserialize dễ.
        /// Mỗi executor tự cast sang typed config tương ứng.
        /// </summary>
        public Dictionary<string, object> Config { get; set; }

        /// <summary>
        /// Rules cũ từ RulesJson nhúng vào — chỉ dùng cho FormField node.
        /// Cho phép backward compat: form field vẫn có show/hide rules.
        /// </summary>
        public List<LegacyFieldRule> LegacyRules { get; set; }

        /// <summary>
        /// NodeId sẽ route đến khi node này throw exception.
        /// Null = mark execution failed và dừng.
        /// </summary>
        public string ErrorHandlerNodeId { get; set; }

        /// <summary>
        /// Nếu true: node bị disabled, executor sẽ skip và đi thẳng đến node tiếp theo.
        /// Dùng khi debug hoặc tạm thời tắt 1 bước.
        /// </summary>
        public bool IsDisabled { get; set; }

        public WorkflowNode()
        {
            Id          = Guid.NewGuid().ToString("N");
            Position    = new CanvasPosition();
            Config      = new Dictionary<string, object>();
            LegacyRules = new List<LegacyFieldRule>();
            ZoneType    = WorkflowZoneType.Action;
        }
    }

    /// <summary>Tọa độ x/y trên React Flow canvas.</summary>
    public class CanvasPosition
    {
        public double X { get; set; }
        public double Y { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EDGE
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Edge kết nối 2 nodes. Tương ứng với React Flow Edge object.
    /// </summary>
    public class WorkflowEdge
    {
        /// <summary>GUID.</summary>
        public string Id { get; set; }

        /// <summary>NodeId nguồn.</summary>
        public string SourceNodeId { get; set; }

        /// <summary>NodeId đích.</summary>
        public string TargetNodeId { get; set; }

        /// <summary>
        /// Handle name trên source node.
        /// Convention: "default" | "true" | "false" | "success" | "error" | "branch-0" | "branch-1"
        /// </summary>
        public string SourceHandle { get; set; }

        /// <summary>Handle name trên target node. Thường là "input".</summary>
        public string TargetHandle { get; set; }

        /// <summary>Loại edge — ảnh hưởng visual style trên canvas.</summary>
        public WorkflowEdgeType EdgeType { get; set; }

        /// <summary>Label hiển thị giữa edge. VD: "Yes", "No", "Error", "≥ 80".</summary>
        public string Label { get; set; }

        public WorkflowEdge()
        {
            Id           = Guid.NewGuid().ToString("N");
            SourceHandle = "default";
            TargetHandle = "input";
            EdgeType     = WorkflowEdgeType.Default;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  VARIABLE
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Biến toàn cục của workflow.
    /// Declare trong WorkflowDefinition.Variables.
    /// Dùng trong: Calculate node, Expression resolution ({{variable.score}}),
    /// Condition node (compare with variable), ResponseRoute.
    /// </summary>
    public class WorkflowVariable
    {
        /// <summary>
        /// Tên biến. Dùng trong expressions: {{variable.score}}.
        /// Chỉ chứa a-z, A-Z, 0-9, underscore. Không có space.
        /// </summary>
        public string Key { get; set; }

        /// <summary>Kiểu dữ liệu.</summary>
        public WorkflowVariableType Type { get; set; }

        /// <summary>Giá trị khởi tạo khi workflow bắt đầu. Null = 0 / "" / false.</summary>
        public object DefaultValue { get; set; }

        /// <summary>Mô tả mục đích biến. Hiện trong builder UI.</summary>
        public string Description { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SETTINGS
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Global settings của WorkflowDefinition.</summary>
    public class WorkflowSettings
    {
        /// <summary>
        /// Timeout tổng của toàn bộ workflow execution (giây).
        /// Default: 300 (5 phút). Sau timeout → cancel.
        /// </summary>
        public int ExecutionTimeoutSeconds { get; set; }

        /// <summary>
        /// Nếu true: Webhook + Email chạy dry-run (log only, không thực sự gửi).
        /// Dùng trong Test Run mode.
        /// </summary>
        public bool DryRun { get; set; }

        /// <summary>
        /// Nếu true: lưu chi tiết execution log vào MF_WorkflowExecutions.
        /// False = chỉ lưu final status (giảm DB writes).
        /// </summary>
        public bool EnableExecutionLog { get; set; }

        /// <summary>
        /// NodeId sẽ route đến khi bất kỳ node nào fail mà không có ErrorHandlerNodeId riêng.
        /// Null = mark failed và stop.
        /// </summary>
        public string GlobalErrorHandlerNodeId { get; set; }

        public WorkflowSettings()
        {
            ExecutionTimeoutSeconds = 300;
            EnableExecutionLog      = true;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  NODE CONFIGS — strongly-typed config cho từng node type
    //  WorkflowNode.Config (Dictionary) được deserialize sang các class này
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Config cho FormField node (ZoneType = Navigation).
    /// Đại diện 1 field hoặc 1 page trong form.
    /// </summary>
    public class FormFieldNodeConfig
    {
        /// <summary>Key của field trong FormSchema. VD: "employment_type".</summary>
        public string FieldKey { get; set; }

        /// <summary>Index của page chứa field này (0-based).</summary>
        public int PageIndex { get; set; }

        /// <summary>
        /// Nếu true: node đại diện cả 1 page, không phải field đơn.
        /// FieldKey = null khi IsPageBreak = true.
        /// </summary>
        public bool IsPageBreak { get; set; }

        /// <summary>
        /// Rules cũ từ RulesJson nhúng vào. Evaluated client-side bởi WorkflowNavigator.ts.
        /// Format giống RuleDefinition nhưng simplified cho backward compat.
        /// </summary>
        public List<LegacyFieldRule> LegacyRules { get; set; }

        public FormFieldNodeConfig()
        {
            LegacyRules = new List<LegacyFieldRule>();
        }
    }

    /// <summary>
    /// Config cho Condition node (ZoneType = Navigation hoặc Action).
    /// Branching If/Else. Output: 2 handles — "true" và "false".
    /// </summary>
    public class ConditionNodeConfig
    {
        /// <summary>
        /// Groups điều kiện. Tái dùng ConditionGroup từ Core.Models.RuleModels.
        /// Type = MegaForm.Core.Models.ConditionGroup (existing class).
        /// Stored as JSON string để avoid circular dependency.
        /// </summary>
        public string ConditionsJson { get; set; }

        /// <summary>
        /// Nếu so sánh với biến thay vì field value trực tiếp.
        /// VD: "score" → compare {{variable.score}} với value.
        /// </summary>
        public string VariableRef { get; set; }

        /// <summary>
        /// Label hiển thị trên edge khi condition = true.
        /// Default: "Yes". Editable trong builder.
        /// </summary>
        public string TrueLabel { get; set; }

        /// <summary>Label cho edge khi condition = false. Default: "No".</summary>
        public string FalseLabel { get; set; }

        public ConditionNodeConfig()
        {
            TrueLabel  = "Yes";
            FalseLabel = "No";
        }
    }

    /// <summary>
    /// Config cho Webhook node (ZoneType = Action).
    /// Gọi HTTP endpoint. Header auth. Field mapping. Response routing.
    /// </summary>
    public class WebhookNodeConfig
    {
        /// <summary>
        /// Endpoint URL. Hỗ trợ {{field.key}} và {{variable.name}} interpolation.
        /// VD: "https://api.example.com/risk/{{field.user_id}}"
        /// </summary>
        public string Url { get; set; }

        /// <summary>HTTP method. Default: POST.</summary>
        public WebhookMethod Method { get; set; }

        /// <summary>
        /// Custom headers. Value có thể dùng {{secret.apiKey}} để reference secrets.
        /// Key: header name, Value: header value (có thể là template).
        /// </summary>
        public Dictionary<string, string> Headers { get; set; }

        /// <summary>Authentication config.</summary>
        public WebhookAuthConfig Auth { get; set; }

        /// <summary>
        /// Map form fields vào JSON body.
        /// VD: [{ "formField": "user_email", "bodyPath": "user.email" }]
        /// </summary>
        public List<WebhookFieldMapping> BodyMappings { get; set; }

        /// <summary>
        /// Raw JSON body template với {{field.key}} placeholders.
        /// Nếu BodyMappings có data thì BodyTemplate được merge vào.
        /// Nếu cả 2 null: gửi toàn bộ formData serialized.
        /// </summary>
        public string BodyTemplate { get; set; }

        /// <summary>Request timeout (giây). Default: 30. Max: 120.</summary>
        public int TimeoutSeconds { get; set; }

        /// <summary>Retry policy khi request fail.</summary>
        public WebhookRetryPolicy Retry { get; set; }

        /// <summary>
        /// Response routing rules.
        /// Evaluate theo thứ tự → route đến NodeId của rule đầu tiên match.
        /// </summary>
        public List<ResponseRoute> ResponseRoutes { get; set; }

        /// <summary>
        /// Lưu response body vào WorkflowVariable.
        /// VD: "webhookResult" → ctx.Variables["webhookResult"] = response body.
        /// </summary>
        public string ResponseVariableKey { get; set; }

        public WebhookNodeConfig()
        {
            Method       = WebhookMethod.POST;
            TimeoutSeconds = 30;
            Headers      = new Dictionary<string, string>();
            BodyMappings = new List<WebhookFieldMapping>();
            ResponseRoutes = new List<ResponseRoute>();
            Auth         = new WebhookAuthConfig();
            Retry        = new WebhookRetryPolicy();
        }
    }

    /// <summary>Auth config cho Webhook.</summary>
    public class WebhookAuthConfig
    {
        /// <summary>Loại auth.</summary>
        public WebhookAuthType Type { get; set; }

        /// <summary>
        /// Token/password/key value.
        /// Hỗ trợ reference tới form settings: "{{settings.stripeKey}}".
        /// </summary>
        public string Value { get; set; }

        /// <summary>Header name khi Type = ApiKey. Default: "X-Api-Key".</summary>
        public string HeaderName { get; set; }

        /// <summary>Username khi Type = BasicAuth.</summary>
        public string Username { get; set; }

        public WebhookAuthConfig()
        {
            Type       = WebhookAuthType.None;
            HeaderName = "X-Api-Key";
        }
    }

    /// <summary>Map 1 form field vào 1 path trong JSON body của webhook.</summary>
    public class WebhookFieldMapping
    {
        /// <summary>Key của form field. VD: "user_email".</summary>
        public string FormFieldKey { get; set; }

        /// <summary>
        /// Dot-notation path trong JSON body. VD: "user.email", "data.contact.phone".
        /// Nếu simple key (không có dot): { "email": value }.
        /// </summary>
        public string BodyPath { get; set; }

        /// <summary>Giá trị static (nếu không map từ field). Override FormFieldKey.</summary>
        public string StaticValue { get; set; }
    }

    /// <summary>Retry policy cho Webhook node.</summary>
    public class WebhookRetryPolicy
    {
        /// <summary>Số lần retry tối đa. Default: 3. Set 0 để không retry.</summary>
        public int MaxAttempts { get; set; }

        /// <summary>Delay giữa các lần retry (giây). Default: 5.</summary>
        public int DelaySeconds { get; set; }

        /// <summary>
        /// Mỗi lần retry, delay *= BackoffMultiplier.
        /// Default: 2.0 → retry 1: 5s, retry 2: 10s, retry 3: 20s.
        /// </summary>
        public double BackoffMultiplier { get; set; }

        public WebhookRetryPolicy()
        {
            MaxAttempts       = 3;
            DelaySeconds      = 5;
            BackoffMultiplier = 2.0;
        }
    }

    /// <summary>
    /// 1 route rule dựa trên webhook response.
    /// Nếu response JSONPath expression match condition → route đến NextNodeId.
    /// </summary>
    public class ResponseRoute
    {
        /// <summary>
        /// JSONPath expression để query response body.
        /// VD: "$.status", "$.data.riskLevel", "$.errors[0].code"
        /// </summary>
        public string JsonPath { get; set; }

        /// <summary>Operator so sánh.</summary>
        public ResponseRouteOperator Operator { get; set; }

        /// <summary>Giá trị so sánh. VD: "high", "200", "approved".</summary>
        public string Value { get; set; }

        /// <summary>NodeId sẽ navigate đến khi condition này match.</summary>
        public string NextNodeId { get; set; }

        /// <summary>Label mô tả route này. Hiện trong builder. VD: "High risk → Manual review".</summary>
        public string Label { get; set; }
    }

    /// <summary>
    /// Config cho SendEmail node (ZoneType = Action).
    /// </summary>
    public class SendEmailNodeConfig
    {
        /// <summary>
        /// Địa chỉ email nhận. Hỗ trợ {{field.email_field}} interpolation.
        /// Nhiều địa chỉ: comma-separated.
        /// </summary>
        public string To { get; set; }

        /// <summary>CC addresses. Comma-separated. Template supported.</summary>
        public string Cc { get; set; }

        /// <summary>Email subject. Template supported.</summary>
        public string Subject { get; set; }

        /// <summary>Email body HTML. Template supported với {{field.key}}.</summary>
        public string Body { get; set; }

        /// <summary>Reply-to address. Template supported.</summary>
        public string ReplyTo { get; set; }

        /// <summary>
        /// Nếu true: đính kèm submission data dưới dạng JSON.
        /// Tiện cho internal notifications.
        /// </summary>
        public bool AttachSubmissionData { get; set; }
    }

    /// <summary>
    /// Config cho Fork node (ZoneType = Action).
    /// Tách 1 luồng thành N nhánh chạy song song.
    /// PHẢI có Join node tương ứng.
    /// </summary>
    public class ForkNodeConfig
    {
        /// <summary>
        /// Danh sách NodeIds sẽ được chạy song song (các branch đầu tiên).
        /// Thứ tự không quan trọng — tất cả được start cùng lúc.
        /// </summary>
        public List<string> BranchStartNodeIds { get; set; }

        /// <summary>NodeId của Join node tương ứng. Required.</summary>
        public string JoinNodeId { get; set; }

        public ForkNodeConfig()
        {
            BranchStartNodeIds = new List<string>();
        }
    }

    /// <summary>
    /// Config cho Join node (ZoneType = Action).
    /// Chờ các branches từ Fork hoàn thành rồi tiếp tục.
    /// </summary>
    public class JoinNodeConfig
    {
        /// <summary>NodeId của Fork đã tạo ra các branches này.</summary>
        public string ForkNodeId { get; set; }

        /// <summary>
        /// Chiến lược chờ.
        /// WaitAll (default): chờ tất cả branches.
        /// WaitAny: tiếp tục khi branch đầu tiên xong.
        /// </summary>
        public JoinStrategy Strategy { get; set; }

        /// <summary>
        /// Timeout riêng cho Join (giây).
        /// Sau timeout → route đến TimeoutHandlerNodeId nếu có.
        /// Default: 0 = dùng workflow global timeout.
        /// </summary>
        public int TimeoutSeconds { get; set; }

        /// <summary>NodeId route đến khi timeout. Null = fail execution.</summary>
        public string TimeoutHandlerNodeId { get; set; }

        public JoinNodeConfig()
        {
            Strategy = JoinStrategy.WaitAll;
        }
    }

    /// <summary>
    /// Config cho Calculate node (ZoneType = Action).
    /// Thực hiện phép tính trên WorkflowVariables.
    /// </summary>
    public class CalculateNodeConfig
    {
        /// <summary>
        /// Tên biến nhận kết quả.
        /// Phải được khai báo trong WorkflowDefinition.Variables.
        /// </summary>
        public string TargetVariable { get; set; }

        /// <summary>
        /// Operand 1: tên biến hoặc field key.
        /// Prefix phân biệt: "variable.score" vs "field.quantity" vs literal "10".
        /// </summary>
        public string Operand1 { get; set; }

        /// <summary>Phép tính.</summary>
        public CalcOperator Operator { get; set; }

        /// <summary>
        /// Operand 2: tên biến, field key, hoặc literal number/string.
        /// Với Assign operator: Operand2 là giá trị gán thẳng.
        /// </summary>
        public string Operand2 { get; set; }

        /// <summary>
        /// Nếu true: làm tròn kết quả về số nguyên.
        /// Hữu ích cho score calculation.
        /// </summary>
        public bool RoundToInt { get; set; }
    }

    /// <summary>
    /// Config cho End node.
    /// Terminal node — kết thúc workflow.
    /// </summary>
    public class EndNodeConfig
    {
        /// <summary>Loại kết thúc.</summary>
        public EndType EndType { get; set; }

        /// <summary>
        /// Message hiển thị cho user sau submit.
        /// Template supported: "Cảm ơn {{field.name}}! Đơn #{{submission.id}} đã được ghi nhận."
        /// </summary>
        public string Message { get; set; }

        /// <summary>
        /// Nếu có: redirect về URL này thay vì hiện message.
        /// Template supported.
        /// </summary>
        public string RedirectUrl { get; set; }

        /// <summary>Nếu true: gửi email tóm tắt submission cho user.</summary>
        public bool SendSummaryEmail { get; set; }

        /// <summary>Field key chứa email của user để gửi summary.</summary>
        public string UserEmailFieldKey { get; set; }

        public EndNodeConfig()
        {
            EndType = EndType.Success;
            Message = "Cảm ơn bạn đã gửi thông tin!";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LEGACY BRIDGE — backward compat với RulesJson cũ
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Wrapper nhỏ để nhúng rule cũ vào FormField node.
    /// Tương đương 1 RuleDefinition từ RuleModels.cs nhưng simplified.
    /// Client-side WorkflowNavigator.ts evaluate.
    /// </summary>
    public class LegacyFieldRule
    {
        /// <summary>Rule ID (từ RuleDefinition.Id cũ).</summary>
        public string Id { get; set; }

        /// <summary>Tên rule.</summary>
        public string Name { get; set; }

        /// <summary>
        /// ConditionGroup JSON — serialize từ RuleModels.ConditionGroup.
        /// Giữ nguyên format cũ để không break client-side evaluator.
        /// </summary>
        public string ConditionsJson { get; set; }

        /// <summary>
        /// Actions JSON — serialize từ List&lt;RuleAction&gt;.
        /// Giữ nguyên format.
        /// </summary>
        public string ActionsJson { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXECUTION CONTEXT — runtime object
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Context được tạo khi workflow bắt đầu execute.
    /// Passed qua tất cả node executors.
    /// Được serialize vào MF_WorkflowExecutions.ContextJson.
    /// </summary>
    public class WorkflowExecutionContext
    {
        /// <summary>GUID cho lần chạy này. Dùng để log và status polling.</summary>
        public string ExecutionId { get; set; }

        /// <summary>FormId đang execute.</summary>
        public int FormId { get; set; }

        /// <summary>SubmissionId vừa được lưu.</summary>
        public int SubmissionId { get; set; }

        /// <summary>Toàn bộ field values đã submit. Key = fieldKey.</summary>
        public Dictionary<string, object> FormData { get; set; }

        /// <summary>
        /// Biến runtime — mutable trong suốt workflow.
        /// Khởi tạo từ WorkflowDefinition.Variables[].DefaultValue.
        /// </summary>
        public Dictionary<string, object> Variables { get; set; }

        /// <summary>
        /// Output của từng node đã chạy.
        /// Key = NodeId, Value = output data (arbitrary).
        /// </summary>
        public Dictionary<string, object> NodeResults { get; set; }

        /// <summary>NodeId đang execute.</summary>
        public string CurrentNodeId { get; set; }

        /// <summary>[Recovered June-15] Active workflow case id (case/task feature).</summary>
        public string CaseId { get; set; }

        /// <summary>[Recovered June-15] Pending task id when execution is Waiting.</summary>
        public string PendingTaskId { get; set; }

        /// <summary>Trạng thái tổng của execution.</summary>
        public WorkflowExecutionStatus Status { get; set; }

        /// <summary>Error message cuối cùng nếu Status = Failed.</summary>
        public string ErrorMessage { get; set; }

        /// <summary>Chi tiết từng bước đã execute.</summary>
        public List<WorkflowExecutionLogEntry> Log { get; set; }

        /// <summary>UTC timestamp bắt đầu.</summary>
        public DateTime StartedAt { get; set; }

        /// <summary>UTC timestamp kết thúc. Null nếu còn running.</summary>
        public DateTime? CompletedAt { get; set; }

        /// <summary>
        /// Nếu true: không thực sự execute actions (Webhook, Email).
        /// Chỉ log — dùng trong Test Run mode.
        /// </summary>
        public bool IsDryRun { get; set; }

        public WorkflowExecutionContext()
        {
            ExecutionId = Guid.NewGuid().ToString("N");
            FormData    = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            Variables   = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            NodeResults = new Dictionary<string, object>();
            Log         = new List<WorkflowExecutionLogEntry>();
            Status      = WorkflowExecutionStatus.Running;
            CaseId      = string.Empty;
            PendingTaskId = string.Empty;
            StartedAt   = DateTime.UtcNow;
        }
    }

    /// <summary>1 entry trong execution log.</summary>
    public class WorkflowExecutionLogEntry
    {
        /// <summary>Thứ tự execute.</summary>
        public int Sequence { get; set; }

        /// <summary>NodeId đã execute.</summary>
        public string NodeId { get; set; }

        /// <summary>Label của node.</summary>
        public string NodeLabel { get; set; }

        /// <summary>NodeType string. VD: "Webhook", "Condition".</summary>
        public string NodeType { get; set; }

        /// <summary>"success" | "failed" | "skipped" | "dry_run".</summary>
        public string Status { get; set; }

        /// <summary>Input data gửi vào node (serialized).</summary>
        public string InputJson { get; set; }

        /// <summary>Output data từ node (serialized).</summary>
        public string OutputJson { get; set; }

        /// <summary>Error message nếu status = failed.</summary>
        public string Error { get; set; }

        /// <summary>Thời gian execute (milliseconds).</summary>
        public long DurationMs { get; set; }

        /// <summary>UTC timestamp.</summary>
        public DateTime Timestamp { get; set; }

        public WorkflowExecutionLogEntry()
        {
            Timestamp = DateTime.UtcNow;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  NODE RESULT — output của 1 node executor
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Kết quả trả về từ INodeExecutor.ExecuteAsync().
    /// Engine dùng NextNodeId để walk graph.
    /// </summary>
    public class WorkflowNodeResult
    {
        /// <summary>NodeId tiếp theo cần execute. Null = kết thúc nhánh.</summary>
        public string NextNodeId { get; set; }

        /// <summary>"success" | "failed" | "skipped".</summary>
        public string Status { get; set; }

        /// <summary>Error message nếu failed.</summary>
        public string Error { get; set; }

        /// <summary>Output data tùy ý — lưu vào ctx.NodeResults[nodeId].</summary>
        public object OutputData { get; set; }

        /// <summary>
        /// Duration milliseconds — để log.
        /// Engine tự set, executor không cần set.
        /// </summary>
        public long DurationMs { get; set; }

        // [Recovered June-15] Waiting result — node parks the run on a human task.
        public static WorkflowNodeResult Waiting(object output = null)
        {
            return new WorkflowNodeResult
            {
                Status = "waiting",
                OutputData = output
            };
        }

        public static WorkflowNodeResult Success(string nextNodeId, object output = null)
        {
            return new WorkflowNodeResult
            {
                Status     = "success",
                NextNodeId = nextNodeId,
                OutputData = output,
            };
        }

        public static WorkflowNodeResult Failed(string error)
        {
            return new WorkflowNodeResult
            {
                Status = "failed",
                Error  = error,
            };
        }

        public static WorkflowNodeResult Skipped(string nextNodeId)
        {
            return new WorkflowNodeResult
            {
                Status     = "skipped",
                NextNodeId = nextNodeId,
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  NAVIGATION RESULT — client-side navigation layer
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Kết quả từ IWorkflowEvaluator.EvaluateNavigation().
    /// WorkflowNavigator.ts (client-side) nhận và apply.
    /// </summary>
    public class WorkflowNavigationResult
    {
        /// <summary>NodeId tiếp theo theo navigation flow.</summary>
        public string NextNodeId { get; set; }

        /// <summary>
        /// Nếu có: nhảy thẳng đến page index này (skip intermediate pages).
        /// Null = đi tuần tự.
        /// </summary>
        public int? SkipToPageIndex { get; set; }

        /// <summary>
        /// Field effects: show/hide/require/optional từ legacy rules.
        /// Client-side apply ngay, không cần server round-trip.
        /// </summary>
        public List<WorkflowFieldEffect> FieldEffects { get; set; }

        /// <summary>Variables đã thay đổi trong lần evaluate này.</summary>
        public Dictionary<string, object> UpdatedVariables { get; set; }

        public WorkflowNavigationResult()
        {
            FieldEffects      = new List<WorkflowFieldEffect>();
            UpdatedVariables  = new Dictionary<string, object>();
        }
    }

    /// <summary>1 field effect từ navigation evaluation.</summary>
    public class WorkflowFieldEffect
    {
        /// <summary>Key của field bị ảnh hưởng.</summary>
        public string FieldKey { get; set; }

        /// <summary>"show" | "hide" | "require" | "optional" | "setValue" | "clear".</summary>
        public string Action { get; set; }

        /// <summary>Value (chỉ dùng khi Action = "setValue").</summary>
        public object Value { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  VALIDATION
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Kết quả validate 1 node hoặc toàn bộ workflow.</summary>
    public class WorkflowValidationResult
    {
        public bool IsValid { get; set; }

        /// <summary>Danh sách lỗi. Key = NodeId (hoặc null nếu lỗi global).</summary>
        public List<WorkflowValidationError> Errors { get; set; }

        public WorkflowValidationResult()
        {
            IsValid = true;
            Errors  = new List<WorkflowValidationError>();
        }
    }

    public class WorkflowValidationError
    {
        /// <summary>NodeId gây ra lỗi. Null = lỗi cấp workflow.</summary>
        public string NodeId { get; set; }

        /// <summary>Field trong config bị lỗi. VD: "Url", "To", "TargetVariable".</summary>
        public string Field { get; set; }

        /// <summary>Mô tả lỗi để hiển thị trong builder UI.</summary>
        public string Message { get; set; }

        /// <summary>"error" | "warning". Warning không block save.</summary>
        public string Severity { get; set; }

        public WorkflowValidationError()
        {
            Severity = "error";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  WORKFLOW ISSUE — normalized client-facing issue item
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Normalized issue item returned in all save/apply/validate API responses.
    /// Frontend renders these in the persistent Issues Panel.
    /// </summary>
    public class WorkflowIssue
    {
        /// <summary>Unique id for React key.</summary>
        public string Id { get; set; }

        /// <summary>"error" | "warning" | "info"</summary>
        public string Severity { get; set; }

        /// <summary>"save-draft" | "validate" | "apply"</summary>
        public string Source { get; set; }

        public string NodeId  { get; set; }
        public string Field   { get; set; }
        public string Code    { get; set; }
        public string Message { get; set; }

        public static WorkflowIssue FromValidationError(
            WorkflowValidationError e, string source)
        {
            return new WorkflowIssue
            {
                Id       = Guid.NewGuid().ToString("N").Substring(0, 8),
                Severity = e.Severity ?? "error",
                Source   = source,
                NodeId   = e.NodeId,
                Field    = e.Field,
                Message  = e.Message,
            };
        }
    }

    /// <summary>Validation mode: draft allows partial configs, apply enforces runtime safety.</summary>
    public enum ValidationMode
    {
        /// <summary>Allow incomplete configs — only structural checks (edges, node types).</summary>
        Draft = 1,

        /// <summary>Full runtime safety checks — required fields, valid enums, etc.</summary>
        Apply = 2,
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  WORKFLOW ENVELOPE — persisted wrapper distinguishing draft vs applied
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Envelope stored in MF_Forms.WorkflowJson.
    /// Wraps both draft and applied workflow definitions.
    /// Backward-compatible: if existing JSON is a plain WorkflowDefinition,
    /// it is migrated transparently on first read.
    /// </summary>
    public class WorkflowEnvelope
    {
        /// <summary>Current draft (editor state). May differ from applied.</summary>
        public WorkflowDefinition DraftWorkflow { get; set; }

        /// <summary>Last applied (runtime) workflow. Null until first Apply.</summary>
        public WorkflowDefinition AppliedWorkflow { get; set; }

        /// <summary>When the draft was last saved.</summary>
        public DateTime? DraftUpdatedAt { get; set; }

        /// <summary>When Apply was last executed successfully.</summary>
        public DateTime? AppliedAt { get; set; }

        /// <summary>Who applied (user identity or "system").</summary>
        public string AppliedBy { get; set; }

        /// <summary>Draft version label, e.g. "1.0.3-draft".</summary>
        public string DraftVersion { get; set; }

        /// <summary>Applied version label, e.g. "1.0.2".</summary>
        public string AppliedVersion { get; set; }

        /// <summary>
        /// Attempt to read an envelope from JSON.
        /// Handles both the new envelope format and old plain WorkflowDefinition JSON.
        /// </summary>
        public static WorkflowEnvelope ParseOrMigrate(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new WorkflowEnvelope();

            try
            {
                // Try envelope format first
                var env = Newtonsoft.Json.JsonConvert.DeserializeObject<WorkflowEnvelope>(json);
                if (env != null && (env.DraftWorkflow != null || env.AppliedWorkflow != null))
                    return env;

                // Fallback: old plain WorkflowDefinition — migrate
                var def = Newtonsoft.Json.JsonConvert.DeserializeObject<WorkflowDefinition>(json);
                if (def != null && (def.Nodes != null || def.FormId > 0))
                {
                    return new WorkflowEnvelope
                    {
                        DraftWorkflow    = def,
                        AppliedWorkflow  = def,
                        DraftUpdatedAt   = def.UpdatedAt,
                        AppliedAt        = def.UpdatedAt,
                        AppliedBy        = "migrated",
                        DraftVersion     = (def.Version ?? "1.0") + "-draft",
                        AppliedVersion   = def.Version ?? "1.0",
                    };
                }
            }
            catch { }

            return new WorkflowEnvelope();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  WORKFLOW SAVE RESULT — unified API response for save/apply/validate
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Unified response for SaveDraft, Apply, Validate endpoints.</summary>
    public class WorkflowSaveResult
    {
        public bool   Success        { get; set; }

        /// <summary>"draft-saved" | "applied" | "validated" | "apply-blocked"</summary>
        public string Status         { get; set; }

        public string WorkflowVersion { get; set; }
        public string ActiveVersion  { get; set; }
        public DateTime? DraftUpdatedAt { get; set; }
        public DateTime? AppliedAt   { get; set; }
        public string AppliedBy      { get; set; }

        public List<WorkflowIssue> Issues { get; set; } = new List<WorkflowIssue>();

        public int ErrorCount   => Issues.Count(i => i.Severity == "error");
        public int WarningCount => Issues.Count(i => i.Severity == "warning");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DATABASE NODE CONFIG
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Operation types supported by the Database node.
    /// Raw SQL execution from frontend input is intentionally excluded.
    /// </summary>
    public enum DatabaseOperation
    {
        Insert           = 1,
        Update           = 2,
        Upsert           = 3,
        StoredProcedure  = 4,
    }

    /// <summary>Field-to-column mapping for Database node.</summary>
    public class DatabaseFieldMapping
    {
        /// <summary>Form field key or variable reference (e.g. "email" or "{{variable.score}}").</summary>
        public string SourceKey { get; set; }

        /// <summary>DB column or stored procedure parameter name.</summary>
        public string TargetColumn { get; set; }

        /// <summary>Optional static override value (ignores SourceKey when set).</summary>
        public string StaticValue { get; set; }
    }

    /// <summary>
    /// Configuration for a Database node.
    /// ConnectionName references a named connection in server appsettings — 
    /// connection strings NEVER come from frontend.
    /// FieldMappings / WhereMappings: key = DB column/param, value = form field key or {{token}}.
    /// </summary>
    public class DatabaseNodeConfig
    {
        /// <summary>Connection mode: Named or External.</summary>
        public string ConnectionMode { get; set; } = "Named";

        /// <summary>Named connection from server appsettings (e.g. "DefaultConnection").</summary>
        public string ConnectionName { get; set; }

        /// <summary>Database provider type for external connections: SqlServer, PostgreSql, Sqlite, MySql.</summary>
        public string DatabaseType { get; set; } = "Sqlite";

        /// <summary>Optional raw connection string for external databases.</summary>
        public string ConnectionString { get; set; }

        /// <summary>Database operation type.</summary>
        public DatabaseOperation Operation { get; set; } = DatabaseOperation.Insert;

        /// <summary>Table name for Insert/Update/Upsert operations.</summary>
        public string TableName { get; set; }

        /// <summary>Stored procedure name (for StoredProcedure operation).</summary>
        public string ProcedureName { get; set; }

        /// <summary>
        /// Field mappings: DB column/param → form field key or {{token}}.
        /// Key = column/parameter name, Value = source key or template.
        /// </summary>
        public Dictionary<string, string> FieldMappings { get; set; } = new Dictionary<string, string>();

        /// <summary>
        /// WHERE clause mappings: DB column → form field key or {{token}}.
        /// Used for Update and Upsert operations.
        /// </summary>
        public Dictionary<string, string> WhereMappings { get; set; } = new Dictionary<string, string>();

        /// <summary>Command timeout in seconds. Default 30.</summary>
        public int TimeoutSeconds { get; set; } = 30;

        /// <summary>If true, workflow continues even if this node fails.</summary>
        public bool ContinueOnError { get; set; } = false;
    }

    public class GoogleSheetsColumnMapping
    {
        public string Column { get; set; }
        public string Source { get; set; }
        public string Value { get; set; }
    }

    /// <summary>Configuration for a Google Sheets node.</summary>
    public class GoogleSheetsNodeConfig
    {
        public string SpreadsheetId { get; set; }
        public string SheetName { get; set; }
        public string Range { get; set; }
        public string Operation { get; set; } = "append";
        public string ValueInputOption { get; set; } = "USER_ENTERED";
        public string InsertDataOption { get; set; } = "INSERT_ROWS";
        public List<GoogleSheetsColumnMapping> ColumnMappings { get; set; } = new List<GoogleSheetsColumnMapping>();
    }

    public class SwitchCaseConfig
    {
        public string Id { get; set; }
        public string Value { get; set; }
        public string Label { get; set; }
    }

    /// <summary>Configuration for a Switch node.</summary>
    public class SwitchNodeConfig
    {
        public string FieldKey { get; set; }
        public string MatchMode { get; set; } = "equals";
        public List<SwitchCaseConfig> Cases { get; set; } = new List<SwitchCaseConfig>();
    }

    /// <summary>Configuration for a Loop node.</summary>
    public class LoopNodeConfig
    {
        public string SourceType { get; set; } = "field";
        public string FieldKey { get; set; }
        public string VariableKey { get; set; }
        public string ItemVariable { get; set; } = "loopItem";
        public string IndexVariable { get; set; } = "loopIndex";
        public int MaxIterations { get; set; } = 25;
        public string LoopLabel { get; set; } = "Loop";
        public string DoneLabel { get; set; } = "Done";
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SETVARIABLE NODE CONFIG
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Configuration for SetVariable node.</summary>
    public class SetVariableNodeConfig
    {
        /// <summary>Variable key to set.</summary>
        public string VariableKey { get; set; }

        /// <summary>Value or template expression (e.g. "{{field.email}}").</summary>
        public string Value { get; set; }
    }


    // ─────────────────────────────────────────────────────────────────────────
    //  NODE UI SCHEMA (Phase A foundation for server-driven panels)
    // ─────────────────────────────────────────────────────────────────────────

    public class WorkflowNodeUiSchema
    {
        public string NodeType { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public List<WorkflowNodeUiSection> Sections { get; set; } = new List<WorkflowNodeUiSection>();
        public List<WorkflowNodeUiPreset> Presets { get; set; } = new List<WorkflowNodeUiPreset>();
        public WorkflowNodeUiCapabilities Capabilities { get; set; } = new WorkflowNodeUiCapabilities();
    }

    public class WorkflowNodeUiSection
    {
        public string Key { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public bool Collapsible { get; set; }
        public bool DefaultExpanded { get; set; } = true;
        public List<WorkflowNodeUiField> Fields { get; set; } = new List<WorkflowNodeUiField>();
    }

    public class WorkflowNodeUiField
    {
        public string Key { get; set; }
        public string Label { get; set; }
        public string Type { get; set; }
        public string Description { get; set; }
        public bool Required { get; set; }
        public string Placeholder { get; set; }
        public object DefaultValue { get; set; }
        public List<WorkflowNodeUiOption> Options { get; set; } = new List<WorkflowNodeUiOption>();
        public bool SupportsTokens { get; set; }
        public bool SupportsVariables { get; set; }
        public WorkflowNodeUiVisibility VisibleWhen { get; set; }
        public string ItemKeyLabel { get; set; }
        public string ItemValueLabel { get; set; }
        public string ItemKeyPlaceholder { get; set; }
        public string ItemValuePlaceholder { get; set; }
        public string OptionsSource { get; set; }
        public string ItemKeyOptionsSource { get; set; }
        public string HelpText { get; set; }
    }

    public class WorkflowNodeUiOption
    {
        public string Value { get; set; }
        public string Label { get; set; }
        public string Description { get; set; }
    }

    public class WorkflowNodeUiPreset
    {
        public string Key { get; set; }
        public string Label { get; set; }
        public string Description { get; set; }
        public Dictionary<string, object> Patch { get; set; } = new Dictionary<string, object>();
    }

    public class WorkflowNodeUiCapabilities
    {
        public bool SupportsTokens { get; set; }
        public bool SupportsPresets { get; set; }
        public bool SupportsTest { get; set; }
        public bool SupportsAsyncOptions { get; set; }
    }


    public class DatabaseConnectionTestRequest
    {
        public string ConnectionMode { get; set; } = "Named";
        public string ConnectionName { get; set; }
        public string DatabaseType { get; set; } = "Sqlite";
        public string ConnectionString { get; set; }
    }

    public class DatabaseConnectionTestResult
    {
        public bool Success { get; set; }
        public string Provider { get; set; }
        public string DatabaseName { get; set; }
        public string ServerVersion { get; set; }
        public string Message { get; set; }
        public bool SupportsStoredProcedures { get; set; }
    }

    public class WorkflowNodeUiVisibility
    {
        public string FieldKey { get; set; }
        public string Equals { get; set; }
        public List<string> In { get; set; } = new List<string>();
        public bool Not { get; set; }
    }

}
