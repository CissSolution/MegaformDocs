# MegaForm Permission & Workflow Engine — Spec v1.0

---

## PART A: PERMISSION SYSTEM

---

### 1. Permission Layers

```
Layer 1: MODULE-LEVEL     — Ai được truy cập MegaForm module?
Layer 2: FORM-LEVEL       — Ai được xem/tạo/sửa/xóa form nào?
Layer 3: VIEW-LEVEL       — Ai được truy cập view nào trong form?
Layer 4: RECORD-LEVEL     — Ai được xem/sửa/xóa record nào?
Layer 5: FIELD-LEVEL      — Ai được xem/sửa field nào trong record?
```

### 2. Layer 1: Module-Level Security

Tích hợp DNN Security Framework (tương thích Oqtane).

```
DNN Module Settings → Permissions Tab:
  ┌─────────────────────────────────────────────┐
  │ Permission        │ Roles      │ Users      │
  │───────────────────┼────────────┼────────────│
  │ View Module       │ All Users  │            │
  │ Edit Module       │ Admins     │            │
  │ Manage Forms      │ Editors    │ user:john  │
  │ View Submissions  │ Managers   │            │
  │ Export Data       │ Admins     │            │
  │ Manage Templates  │ Admins     │            │
  └─────────────────────────────────────────────┘
```

**Custom Module Permissions:**

| Permission Key | Description | Default |
|---|---|---|
| `MEGAFORM_VIEW` | View published forms | All Users |
| `MEGAFORM_SUBMIT` | Submit forms | Registered Users |
| `MEGAFORM_MANAGE` | Create/edit forms | Editors, Admins |
| `MEGAFORM_SUBMISSIONS` | View all submissions | Managers, Admins |
| `MEGAFORM_EXPORT` | Export data (CSV, JSON) | Admins |
| `MEGAFORM_TEMPLATES` | Install/manage templates | Admins |
| `MEGAFORM_WORKFLOW` | Design workflows | Admins |
| `MEGAFORM_SETTINGS` | Module settings | Admins |

**Implementation:**
```csharp
// DNN integration
public class MegaFormModulePermissions : IModulePermission
{
    public static readonly string VIEW = "MEGAFORM_VIEW";
    public static readonly string SUBMIT = "MEGAFORM_SUBMIT";
    public static readonly string MANAGE = "MEGAFORM_MANAGE";
    // ...
}

// Check in controller
[DnnAuthorize]
public HttpResponseMessage ListForms()
{
    if (!HasPermission(MEGAFORM_MANAGE))
        return Unauthorized();
}

// Oqtane equivalent
[Authorize(Policy = "MEGAFORM_MANAGE")]
public async Task<IActionResult> ListForms() { }
```

### 3. Layer 2: Form-Level Permissions

Mỗi form có permission matrix riêng.

```json
// FormSchema.permissions
{
  "permissions": {
    "submit": {
      "type": "roles",
      "roles": ["Registered Users"],
      "users": [],
      "anonymous": false
    },
    "viewSubmissions": {
      "type": "roles",
      "roles": ["Editors", "Managers"],
      "users": ["john@company.com"]
    },
    "editSubmissions": {
      "type": "roles", 
      "roles": ["Editors"],
      "users": []
    },
    "deleteSubmissions": {
      "type": "roles",
      "roles": ["Admins"],
      "users": []
    },
    "exportData": {
      "type": "roles",
      "roles": ["Managers", "Admins"]
    }
  }
}
```

**Builder UI:**
```
Form Settings → Permissions tab:
┌──────────────────────────────────────────────────┐
│ Who can submit this form?                        │
│ ○ Everyone (anonymous)                           │
│ ● Logged-in users only                          │
│ ○ Specific roles: [Dropdown multi-select]        │
│ ○ Specific users: [User picker]                  │
│──────────────────────────────────────────────────│
│ Who can view submissions?                        │
│ ☑ Editors  ☑ Managers  ☑ Admins                 │
│ + Add users: [john@company.com] [x]              │
│──────────────────────────────────────────────────│
│ Who can edit submissions?                        │
│ ☑ Editors  ☑ Admins                             │
│──────────────────────────────────────────────────│
│ Who can delete submissions?                      │
│ ☑ Admins only                                    │
│──────────────────────────────────────────────────│
│ Who can export data?                             │
│ ☑ Managers  ☑ Admins                            │
└──────────────────────────────────────────────────┘
```

### 4. Layer 3: View-Level Permissions

Mỗi view trong form có permission riêng.

```json
{
  "views": [
    {
      "key": "blog-public",
      "type": "card",
      "permissions": {
        "access": { "anonymous": true }
      }
    },
    {
      "key": "admin-list",
      "type": "list",
      "permissions": {
        "access": { "roles": ["Editors", "Admins"] }
      }
    },
    {
      "key": "editor",
      "type": "edit",
      "permissions": {
        "access": { "roles": ["Editors", "Admins"] },
        "create": { "roles": ["Editors", "Admins"] },
        "edit": { "roles": ["Editors", "Admins"] }
      }
    }
  ]
}
```

### 5. Layer 4: Record-Level Permissions (Row Security)

**Core concept:** Mỗi record có `OwnerId` + `AssignedTo` + `TeamId`. Permission rules quyết định ai thấy record nào.

**Use cases:**
- **CRM:** Sales rep chỉ thấy leads của mình. Manager thấy toàn team.
- **Helpdesk:** Agent thấy tickets assigned cho mình. User thấy tickets mình tạo.
- **HR:** Employee thấy hồ sơ cá nhân. HR Manager thấy tất cả.

```json
{
  "recordPermissions": {
    "model": "owner-team",
    
    "rules": [
      {
        "name": "Owner sees own records",
        "condition": { "field": "_ownerId", "operator": "equals", "value": "{{currentUserId}}" },
        "grant": ["view", "edit"]
      },
      {
        "name": "Assigned agent sees assigned records",
        "condition": { "field": "assigned_to", "operator": "equals", "value": "{{currentUserEmail}}" },
        "grant": ["view", "edit", "reassign"]
      },
      {
        "name": "Team manager sees team records",
        "condition": { "field": "_teamId", "operator": "in", "value": "{{currentUserTeams}}" },
        "grant": ["view", "edit", "delete", "reassign"]
      },
      {
        "name": "Admin sees all",
        "condition": { "role": "Admins" },
        "grant": ["view", "edit", "delete", "reassign", "export"]
      }
    ],
    
    "systemFields": {
      "ownerField": "_ownerId",
      "assignedField": "assigned_to",
      "teamField": "department"
    }
  }
}
```

**SQL implementation:**
```sql
-- Filter submissions by record permissions
CREATE PROCEDURE MF_GetSubmissions_Filtered
    @FormId INT,
    @UserId INT,
    @UserEmail NVARCHAR(200),
    @UserRoles NVARCHAR(MAX),  -- comma-separated
    @UserTeams NVARCHAR(MAX),  -- comma-separated
    @Page INT = 1,
    @PageSize INT = 20
AS
BEGIN
    SELECT s.*
    FROM MF_Submissions s
    WHERE s.FormId = @FormId
      AND s.IsDeleted = 0
      AND (
          -- Rule 1: Owner
          s.CreatedByUserId = @UserId
          -- Rule 2: Assigned
          OR EXISTS (
              SELECT 1 FROM MF_SubmissionValues v 
              WHERE v.SubmissionId = s.SubmissionId 
              AND v.FieldKey = 'assigned_to' 
              AND v.FieldValue = @UserEmail
          )
          -- Rule 3: Team
          OR EXISTS (
              SELECT 1 FROM MF_SubmissionValues v 
              WHERE v.SubmissionId = s.SubmissionId 
              AND v.FieldKey = 'department' 
              AND v.FieldValue IN (SELECT value FROM STRING_SPLIT(@UserTeams, ','))
          )
          -- Rule 4: Admin override
          OR 'Admins' IN (SELECT value FROM STRING_SPLIT(@UserRoles, ','))
      )
    ORDER BY s.CreatedOnUtc DESC
    OFFSET (@Page - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END
```

### 6. Layer 5: Field-Level Permissions

Một số fields chỉ hiển thị hoặc editable cho certain roles.

```json
{
  "fields": [
    {
      "key": "salary",
      "type": "Number",
      "label": "Salary",
      "permissions": {
        "view": { "roles": ["HR Manager", "Admins"] },
        "edit": { "roles": ["HR Manager"] }
      }
    },
    {
      "key": "internal_notes",
      "type": "Textarea",
      "label": "Internal Notes",
      "permissions": {
        "view": { "roles": ["Editors", "Admins"] },
        "edit": { "roles": ["Editors", "Admins"] }
      }
    },
    {
      "key": "customer_email",
      "type": "Email",
      "permissions": {
        "view": { "roles": ["*"] },
        "edit": { "roles": [] }
      }
    }
  ]
}
```

**Rendering logic:**
```javascript
function shouldShowField(field, userRoles) {
    if (!field.permissions || !field.permissions.view) return true;
    var viewRoles = field.permissions.view.roles || [];
    if (viewRoles.includes('*')) return true;
    return viewRoles.some(function(r) { return userRoles.includes(r); });
}

function isFieldEditable(field, userRoles) {
    if (!field.permissions || !field.permissions.edit) return true;
    var editRoles = field.permissions.edit.roles || [];
    return editRoles.some(function(r) { return userRoles.includes(r); });
}
```

### 7. Anti-Unauthorized Access

**Server-side enforcement (không tin client):**

```csharp
public class PermissionService : IPermissionService
{
    // Check EVERY API call
    public bool CanAccess(int userId, int formId, string action)
    {
        // 1. Module permission
        if (!HasModulePermission(userId, action)) return false;
        
        // 2. Form permission
        var formPerms = GetFormPermissions(formId);
        if (!CheckFormPermission(userId, formPerms, action)) return false;
        
        return true;
    }
    
    // Check record-level on every data access
    public bool CanAccessRecord(int userId, int submissionId, string action)
    {
        // 1. Module + Form checks
        // 2. Record ownership / assignment / team check
        // 3. Return true/false
    }
    
    // Filter fields based on role
    public List<FormField> FilterFields(List<FormField> fields, int userId, string action)
    {
        var userRoles = GetUserRoles(userId);
        return fields.Where(f => CheckFieldPermission(f, userRoles, action)).ToList();
    }
}

// Applied in EVERY API endpoint
[HttpGet]
public HttpResponseMessage GetSubmission(int submissionId)
{
    // Anti-unauthorized: check before returning data
    if (!permissionService.CanAccessRecord(UserId, submissionId, "view"))
        return Request.CreateResponse(HttpStatusCode.Forbidden, 
            new { error = "You don't have permission to view this record" });
    
    var submission = repo.Get(submissionId);
    
    // Filter sensitive fields
    submission.Values = permissionService.FilterFieldValues(
        submission.Values, UserId, "view");
    
    return Request.CreateResponse(HttpStatusCode.OK, submission);
}
```

**Rate limiting & abuse prevention:**
```csharp
public class AntiAbuseMiddleware
{
    // Per-user rate limits
    private static ConcurrentDictionary<string, RateLimit> _limits = new();
    
    public bool CheckRateLimit(int userId, string action)
    {
        var key = $"{userId}:{action}";
        var limit = _limits.GetOrAdd(key, _ => new RateLimit());
        
        return action switch
        {
            "submit" => limit.Check(maxPerMinute: 10, maxPerHour: 100),
            "export" => limit.Check(maxPerMinute: 2, maxPerHour: 20),
            "delete" => limit.Check(maxPerMinute: 5, maxPerHour: 50),
            _ => limit.Check(maxPerMinute: 60, maxPerHour: 600)
        };
    }
}
```

**Audit log:**
```sql
CREATE TABLE [dbo].[MF_AuditLog] (
    LogId           BIGINT IDENTITY(1,1) NOT NULL,
    Timestamp       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UserId          INT NOT NULL,
    UserName        NVARCHAR(100) NOT NULL,
    IpAddress       NVARCHAR(45) NULL,
    Action          NVARCHAR(50) NOT NULL,   -- view, create, edit, delete, export, login_attempt
    EntityType      NVARCHAR(50) NOT NULL,   -- form, submission, template, workflow, settings
    EntityId        INT NULL,
    FormId          INT NULL,
    Details         NVARCHAR(MAX) NULL,      -- JSON: what changed, old/new values
    Result          NVARCHAR(20) NOT NULL,   -- success, denied, error
    CONSTRAINT PK_MF_AuditLog PRIMARY KEY CLUSTERED (LogId)
);

CREATE INDEX IX_MF_AuditLog_User ON MF_AuditLog(UserId, Timestamp DESC);
CREATE INDEX IX_MF_AuditLog_Form ON MF_AuditLog(FormId, Timestamp DESC);
CREATE INDEX IX_MF_AuditLog_Action ON MF_AuditLog(Action, Result, Timestamp DESC);
```

---

## PART B: WORKFLOW ENGINE

---

### 1. Concept

Workflow = **Visual process** mà submissions đi qua.

```
Trigger → Condition → Action(s)

Ví dụ:
  Khi submit form → nếu deal_value > $10K → gửi email cho manager + tạo task
  Khi status = "approved" → gửi email cho user + update field
  Mỗi ngày 8AM → nhắc nhở tickets quá hạn
  Khi assigned_to thay đổi → notify new assignee
```

### 2. Workflow Definition

```json
{
  "workflows": [
    {
      "id": "wf_new_ticket",
      "name": "New Ticket Processing",
      "description": "Auto-assign and notify when new ticket created",
      "enabled": true,
      "version": 1,
      
      "trigger": {
        "type": "on_submit",
        "formId": 5
      },
      
      "steps": [
        {
          "id": "step_1",
          "name": "Check Priority",
          "type": "condition",
          "config": {
            "conditions": [
              { "field": "priority", "operator": "equals", "value": "critical" }
            ],
            "logic": "and"
          },
          "onTrue": "step_2a",
          "onFalse": "step_2b"
        },
        {
          "id": "step_2a",
          "name": "Assign to Senior Agent",
          "type": "update_field",
          "config": {
            "updates": [
              { "field": "assigned_to", "value": "senior-team@company.com" },
              { "field": "status", "value": "escalated" }
            ]
          },
          "next": "step_3a"
        },
        {
          "id": "step_2b",
          "name": "Auto-Assign Round Robin",
          "type": "assign_round_robin",
          "config": {
            "field": "assigned_to",
            "pool": ["agent1@company.com", "agent2@company.com", "agent3@company.com"]
          },
          "next": "step_3b"
        },
        {
          "id": "step_3a",
          "name": "Notify Manager",
          "type": "send_email",
          "config": {
            "to": "manager@company.com",
            "subject": "🚨 Critical Ticket: {{title}}",
            "template": "critical-ticket-alert",
            "body": "A critical ticket has been submitted by {{email}}.\n\nTitle: {{title}}\nPriority: {{priority}}\nDescription: {{description}}\n\nPlease review immediately."
          },
          "next": "step_4"
        },
        {
          "id": "step_3b",
          "name": "Notify Assigned Agent",
          "type": "send_email",
          "config": {
            "to": "{{assigned_to}}",
            "subject": "New Ticket Assigned: {{title}}",
            "body": "You have been assigned a new ticket.\n\nTitle: {{title}}\nPriority: {{priority}}\n\nPlease review within 24 hours."
          },
          "next": "step_4"
        },
        {
          "id": "step_4",
          "name": "Send Confirmation to Submitter",
          "type": "send_email",
          "config": {
            "to": "{{email}}",
            "subject": "Ticket Received: {{title}}",
            "body": "Thank you for contacting us. Your ticket #{{_submissionId}} has been received.\n\nWe will respond within 24 hours."
          },
          "next": null
        }
      ]
    }
  ]
}
```

### 3. Trigger Types

| Trigger | Description | Config |
|---|---|---|
| `on_submit` | Khi form được submit | `{ formId }` |
| `on_update` | Khi record được edit | `{ formId, watchFields: ["status","assigned_to"] }` |
| `on_field_change` | Khi field cụ thể thay đổi | `{ formId, field: "status", from: "open", to: "resolved" }` |
| `on_status_change` | Khi status field thay đổi | `{ formId, statusField: "status" }` |
| `on_delete` | Khi record bị xóa | `{ formId }` |
| `scheduled` | Chạy theo lịch | `{ cron: "0 8 * * *", formId }` |
| `manual` | Kích hoạt thủ công | `{ formId, buttonLabel: "Approve" }` |
| `webhook_received` | Khi nhận webhook | `{ endpoint: "/hook/crm-sync" }` |
| `on_date` | Khi đến ngày trong field | `{ formId, dateField: "due_date", offset: "-1d" }` |

### 4. Step Types (Actions)

#### 4.1 Condition (Branching)
```json
{
  "type": "condition",
  "config": {
    "conditions": [
      { "field": "deal_value", "operator": "greaterThan", "value": 10000 },
      { "field": "category", "operator": "equals", "value": "enterprise" }
    ],
    "logic": "and"
  },
  "onTrue": "step_approve",
  "onFalse": "step_review"
}
```

Operators: `equals`, `notEquals`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`, `in`, `notIn`, `isEmpty`, `isNotEmpty`, `matchesRegex`

#### 4.2 Update Field
```json
{
  "type": "update_field",
  "config": {
    "updates": [
      { "field": "status", "value": "approved" },
      { "field": "approved_date", "value": "{{now}}" },
      { "field": "approved_by", "value": "{{currentUser}}" }
    ]
  }
}
```

#### 4.3 Send Email
```json
{
  "type": "send_email",
  "config": {
    "to": "{{email}}",
    "cc": "manager@company.com",
    "subject": "Your request has been {{status}}",
    "body": "Dear {{full_name}},\n\nYour request #{{_submissionId}} has been {{status}}.\n\nRegards,\nThe Team",
    "attachFields": ["resume"],
    "replyTo": "support@company.com"
  }
}
```

#### 4.4 Send Notification (In-app)
```json
{
  "type": "notify",
  "config": {
    "toUser": "{{assigned_to}}",
    "toRole": "Managers",
    "title": "New ticket assigned",
    "message": "Ticket '{{title}}' has been assigned to you",
    "link": "?view=detail&id={{_submissionId}}",
    "priority": "high"
  }
}
```

#### 4.5 Create Record (in another form)
```json
{
  "type": "create_record",
  "config": {
    "targetFormId": 10,
    "fieldMapping": {
      "customer_name": "{{full_name}}",
      "customer_email": "{{email}}",
      "source": "contact-form",
      "status": "new-lead",
      "created_from": "{{_submissionId}}"
    }
  }
}
```

#### 4.6 Webhook (External API call)
```json
{
  "type": "webhook",
  "config": {
    "url": "https://api.slack.com/hooks/xxx",
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "body": {
      "text": "New ticket from {{full_name}}: {{title}}"
    },
    "retryCount": 3,
    "timeout": 30
  }
}
```

#### 4.7 Wait / Delay
```json
{
  "type": "wait",
  "config": {
    "duration": "2h",
    "then": "step_followup"
  }
}
```

#### 4.8 Approval
```json
{
  "type": "approval",
  "config": {
    "approvers": {
      "type": "field",
      "field": "manager_email"
    },
    "approvalField": "_approval_status",
    "onApprove": "step_approved",
    "onReject": "step_rejected",
    "reminderAfter": "24h",
    "escalateAfter": "72h",
    "escalateTo": "director@company.com"
  }
}
```

#### 4.9 Assign (Round Robin / Load Balance)
```json
{
  "type": "assign_round_robin",
  "config": {
    "field": "assigned_to",
    "pool": ["agent1@co.com", "agent2@co.com", "agent3@co.com"],
    "strategy": "round_robin"
  }
}
```
Strategies: `round_robin`, `least_loaded`, `random`, `specific_user`

#### 4.10 Calculate / Transform
```json
{
  "type": "calculate",
  "config": {
    "updates": [
      { "field": "total", "formula": "{{quantity}} * {{unit_price}}" },
      { "field": "tax", "formula": "{{total}} * 0.1" },
      { "field": "grand_total", "formula": "{{total}} + {{tax}}" }
    ]
  }
}
```

#### 4.11 Generate PDF
```json
{
  "type": "generate_pdf",
  "config": {
    "template": "invoice-template",
    "filename": "Invoice-{{_submissionId}}.pdf",
    "saveToField": "invoice_file",
    "emailTo": "{{email}}"
  }
}
```

### 5. Visual Workflow Designer

**Concept:** Drag-drop flowchart trong builder.

```
┌─────────────────────────────────────────────────────────┐
│  Workflow: New Ticket Processing            [Save] [▶]  │
│─────────────────────────────────────────────────────────│
│                                                         │
│   ╔═══════════════╗                                    │
│   ║  📥 On Submit ║                                    │
│   ╚═══════╤═══════╝                                    │
│           │                                             │
│   ╔═══════╧═══════╗                                    │
│   ║  ❓ Priority   ║                                    │
│   ║  = critical?  ║                                    │
│   ╚═══╤═══════╤═══╝                                    │
│    YES│       │NO                                       │
│   ╔═══╧═══╗ ╔═╧═════════╗                             │
│   ║Assign ║ ║  Round    ║                             │
│   ║Senior ║ ║  Robin    ║                             │
│   ╚═══╤═══╝ ╚═══╤═══════╝                             │
│       │          │                                      │
│   ╔═══╧═══╗ ╔═══╧═══════╗                             │
│   ║ Email ║ ║  Email    ║                             │
│   ║Manager║ ║  Agent    ║                             │
│   ╚═══╤═══╝ ╚═══╤═══════╝                             │
│       └────┬─────┘                                      │
│   ╔════════╧══════╗                                    │
│   ║  📧 Confirm   ║                                    │
│   ║  to Submitter ║                                    │
│   ╚═══════════════╝                                    │
│                                                         │
│─────────────────────────────────────────────────────────│
│ [+ Trigger] [+ Condition] [+ Email] [+ Update] [+ ...]│
└─────────────────────────────────────────────────────────┘
```

### 6. Workflow Examples

#### 6.1 Helpdesk Ticket Escalation
```
Trigger: On Submit (Support Ticket form)
  → Auto-assign round-robin to agents
  → Send confirmation to submitter
  
Trigger: Scheduled (every hour)
  → Find tickets where status=open AND created > 24h ago
  → Update status = "overdue"
  → Notify assigned agent: "Ticket overdue"
  
Trigger: Scheduled (every 4 hours)  
  → Find tickets where status=overdue AND created > 48h ago
  → Escalate: assigned_to = manager
  → Notify manager: "Escalated ticket"

Trigger: On Field Change (status → resolved)
  → Send email to submitter: "Your ticket has been resolved"
  → Wait 72h
  → Send satisfaction survey email
```

#### 6.2 CRM Lead Pipeline
```
Trigger: On Submit (Lead Capture form)
  → Create record in CRM Contacts form
  → If source = "enterprise" → assign to senior sales
  → Else → round-robin assign
  → Send welcome email to lead
  → Create follow-up task (due in 2 days)

Trigger: On Field Change (deal_value changed)
  → If deal_value > $50K → notify VP Sales
  → Update forecast report

Trigger: On Field Change (status → won)
  → Send congratulations email to sales rep
  → Create record in Invoices form
  → Webhook to accounting system

Trigger: Scheduled (weekly Monday 9AM)
  → Find leads where status=open AND last_contact > 7 days
  → Notify assigned rep: "Follow up needed"
```

#### 6.3 Content Publishing (Blog CMS)
```
Trigger: On Submit (Article form)
  → Set status = "draft"
  → Notify editors: "New article submitted"

Trigger: On Field Change (status → review)
  → Assign to editor (round-robin from editor pool)
  → Notify assigned editor

Trigger: On Field Change (status → approved)
  → If publish_date is set → wait until publish_date
  → Update status = "published"
  → Webhook to CDN/cache purge
  → Send notification to subscribers
  → Post to social media (webhook to Buffer/Hootsuite)

Trigger: Manual Button "Request Review"
  → Update status = "review"
  → Start review workflow
```

#### 6.4 HR Leave Request
```
Trigger: On Submit (Leave Request form)
  → Find manager from employee's department
  → Create approval request for manager
  → Notify manager: "Leave request from {{full_name}}"

Trigger: Approval → Approved
  → Update status = "approved"
  → Notify employee: "Your leave has been approved"
  → Update leave balance (calculate remaining days)
  → Create calendar event

Trigger: Approval → Rejected
  → Update status = "rejected"
  → Notify employee with rejection reason
```

### 7. Database Schema

```sql
-- Workflow definitions
CREATE TABLE [dbo].[MF_Workflows] (
    WorkflowId      INT IDENTITY(1,1) NOT NULL,
    FormId          INT NOT NULL,
    WorkflowName    NVARCHAR(200) NOT NULL,
    Description     NVARCHAR(500) NULL,
    TriggerType     NVARCHAR(50) NOT NULL,
    TriggerConfig   NVARCHAR(MAX) NULL,     -- JSON
    StepsJson       NVARCHAR(MAX) NOT NULL, -- JSON array of steps
    IsEnabled       BIT NOT NULL DEFAULT 1,
    Version         INT NOT NULL DEFAULT 1,
    CreatedByUserId INT NOT NULL,
    CreatedOnUtc    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ModifiedOnUtc   DATETIME2 NULL,
    CONSTRAINT PK_MF_Workflows PRIMARY KEY (WorkflowId),
    CONSTRAINT FK_MF_Workflows_Form FOREIGN KEY (FormId) 
        REFERENCES MF_Forms(FormId) ON DELETE CASCADE
);

-- Workflow execution instances
CREATE TABLE [dbo].[MF_WorkflowRuns] (
    RunId           BIGINT IDENTITY(1,1) NOT NULL,
    WorkflowId      INT NOT NULL,
    SubmissionId    INT NULL,
    Status          NVARCHAR(20) NOT NULL,  -- running, completed, failed, paused, cancelled
    CurrentStepId   NVARCHAR(100) NULL,
    StartedOnUtc    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CompletedOnUtc  DATETIME2 NULL,
    ContextJson     NVARCHAR(MAX) NULL,     -- runtime variables, field values snapshot
    ErrorMessage    NVARCHAR(MAX) NULL,
    CONSTRAINT PK_MF_WorkflowRuns PRIMARY KEY (RunId),
    CONSTRAINT FK_MF_WFRuns_WF FOREIGN KEY (WorkflowId) 
        REFERENCES MF_Workflows(WorkflowId)
);

-- Step execution log
CREATE TABLE [dbo].[MF_WorkflowStepLog] (
    StepLogId       BIGINT IDENTITY(1,1) NOT NULL,
    RunId           BIGINT NOT NULL,
    StepId          NVARCHAR(100) NOT NULL,
    StepType        NVARCHAR(50) NOT NULL,
    Status          NVARCHAR(20) NOT NULL,  -- success, failed, skipped, waiting
    InputJson       NVARCHAR(MAX) NULL,
    OutputJson      NVARCHAR(MAX) NULL,
    ErrorMessage    NVARCHAR(MAX) NULL,
    ExecutedOnUtc   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    DurationMs      INT NULL,
    CONSTRAINT PK_MF_WFStepLog PRIMARY KEY (StepLogId),
    CONSTRAINT FK_MF_WFStepLog_Run FOREIGN KEY (RunId) 
        REFERENCES MF_WorkflowRuns(RunId)
);

-- Pending approvals
CREATE TABLE [dbo].[MF_Approvals] (
    ApprovalId      INT IDENTITY(1,1) NOT NULL,
    RunId           BIGINT NOT NULL,
    StepId          NVARCHAR(100) NOT NULL,
    SubmissionId    INT NOT NULL,
    ApproverUserId  INT NULL,
    ApproverEmail   NVARCHAR(200) NULL,
    Status          NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, escalated
    RequestedOnUtc  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RespondedOnUtc  DATETIME2 NULL,
    Comment         NVARCHAR(MAX) NULL,
    EscalateAfterUtc DATETIME2 NULL,
    CONSTRAINT PK_MF_Approvals PRIMARY KEY (ApprovalId),
    CONSTRAINT FK_MF_Approvals_Run FOREIGN KEY (RunId) 
        REFERENCES MF_WorkflowRuns(RunId)
);

-- Scheduled workflow tasks
CREATE TABLE [dbo].[MF_ScheduledTasks] (
    TaskId          INT IDENTITY(1,1) NOT NULL,
    WorkflowId      INT NOT NULL,
    RunId           BIGINT NULL,
    TaskType        NVARCHAR(50) NOT NULL,  -- scheduled_trigger, wait_resume, reminder, escalation
    ExecuteAfterUtc DATETIME2 NOT NULL,
    Status          NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, executed, cancelled
    ContextJson     NVARCHAR(MAX) NULL,
    CONSTRAINT PK_MF_ScheduledTasks PRIMARY KEY (TaskId)
);

CREATE INDEX IX_MF_ScheduledTasks_Execute 
    ON MF_ScheduledTasks(ExecuteAfterUtc, Status) 
    WHERE Status = 'pending';

-- Form-level permissions (persisted, not just schema JSON)
CREATE TABLE [dbo].[MF_FormPermissions] (
    PermissionId    INT IDENTITY(1,1) NOT NULL,
    FormId          INT NOT NULL,
    PermissionType  NVARCHAR(50) NOT NULL,  -- submit, view_submissions, edit, delete, export, manage
    PrincipalType   NVARCHAR(20) NOT NULL,  -- role, user
    PrincipalId     NVARCHAR(200) NOT NULL, -- role name or userId
    IsGranted       BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_MF_FormPermissions PRIMARY KEY (PermissionId),
    CONSTRAINT FK_MF_FormPerms_Form FOREIGN KEY (FormId) 
        REFERENCES MF_Forms(FormId) ON DELETE CASCADE
);

CREATE INDEX IX_MF_FormPerms_Form ON MF_FormPermissions(FormId, PermissionType);
```

### 8. Workflow Engine (C#)

```csharp
public interface IWorkflowEngine
{
    // Execute workflow for a submission
    Task<WorkflowRunResult> ExecuteAsync(int workflowId, int submissionId, Dictionary<string, object> context);
    
    // Resume paused workflow (after wait/approval)
    Task<WorkflowRunResult> ResumeAsync(long runId, string stepId, Dictionary<string, object> input);
    
    // Process scheduled tasks (called by DNN Scheduler or background job)
    Task ProcessScheduledTasksAsync();
    
    // Process approval response
    Task<ApprovalResult> ProcessApprovalAsync(int approvalId, string action, string comment, int userId);
}

public class WorkflowEngine : IWorkflowEngine
{
    private readonly ISubmissionRepository _submissions;
    private readonly IEmailService _email;
    private readonly IWebhookService _webhook;
    private readonly IWorkflowRepository _repo;
    
    public async Task<WorkflowRunResult> ExecuteAsync(int workflowId, int submissionId, Dictionary<string, object> context)
    {
        var workflow = await _repo.GetWorkflow(workflowId);
        var steps = JsonConvert.DeserializeObject<List<WorkflowStep>>(workflow.StepsJson);
        
        // Create run record
        var run = await _repo.CreateRun(workflowId, submissionId);
        
        // Load submission data into context
        var submission = await _submissions.Get(submissionId);
        foreach (var val in submission.Values)
            context[val.FieldKey] = val.FieldValue;
        context["_submissionId"] = submissionId;
        
        // Execute steps
        var currentStep = steps.FirstOrDefault();
        while (currentStep != null)
        {
            var result = await ExecuteStep(run.RunId, currentStep, context);
            await _repo.LogStep(run.RunId, currentStep, result);
            
            if (result.Status == StepStatus.Failed) break;
            if (result.Status == StepStatus.Waiting) break; // paused for approval/wait
            
            // Determine next step
            string nextId = result.NextStepId ?? currentStep.Next;
            currentStep = nextId != null ? steps.FirstOrDefault(s => s.Id == nextId) : null;
        }
        
        return new WorkflowRunResult { RunId = run.RunId, Status = "completed" };
    }
    
    private async Task<StepResult> ExecuteStep(long runId, WorkflowStep step, Dictionary<string, object> context)
    {
        return step.Type switch
        {
            "condition" => EvaluateCondition(step, context),
            "update_field" => await UpdateFields(step, context),
            "send_email" => await SendEmail(step, context),
            "notify" => await SendNotification(step, context),
            "create_record" => await CreateRecord(step, context),
            "webhook" => await CallWebhook(step, context),
            "wait" => await ScheduleWait(runId, step, context),
            "approval" => await RequestApproval(runId, step, context),
            "assign_round_robin" => await AssignRoundRobin(step, context),
            "calculate" => EvaluateCalculation(step, context),
            "generate_pdf" => await GeneratePdf(step, context),
            _ => new StepResult { Status = StepStatus.Failed, Error = $"Unknown step type: {step.Type}" }
        };
    }
}
```

### 9. Implementation Roadmap

#### Phase 1: Permission Foundation (1-2 weeks)
- [ ] MF_FormPermissions table
- [ ] MF_AuditLog table
- [ ] IPermissionService interface + DNN implementation
- [ ] Module-level permission registration
- [ ] Form-level permission UI in builder Settings tab
- [ ] Server-side permission checks in ALL API endpoints
- [ ] Audit logging for sensitive actions

#### Phase 2: Record & Field Permissions (1-2 weeks)
- [ ] Record-level permission rules in schema
- [ ] SQL filtering by ownership/assignment/team
- [ ] Field-level view/edit permissions in schema
- [ ] Renderer respects field permissions
- [ ] API filters sensitive fields from response

#### Phase 3: Basic Workflow (2-3 weeks)
- [ ] MF_Workflows + MF_WorkflowRuns + MF_WorkflowStepLog tables
- [ ] WorkflowEngine core: condition, update_field, send_email
- [ ] Trigger: on_submit, on_update
- [ ] Simple workflow builder UI (list of steps)
- [ ] Workflow execution on form submit
- [ ] Step log viewer

#### Phase 4: Advanced Workflow (2-3 weeks)
- [ ] Approval system (MF_Approvals table)
- [ ] Scheduled triggers (DNN Scheduler integration)
- [ ] Wait/delay steps
- [ ] Round-robin assignment
- [ ] Create record in other form
- [ ] Webhook action
- [ ] Visual workflow designer (drag-drop flowchart)

#### Phase 5: Production Hardening (1-2 weeks)
- [ ] Rate limiting
- [ ] Error recovery (retry failed steps)
- [ ] Workflow versioning
- [ ] Workflow templates (pre-built: helpdesk, CRM, approval)
- [ ] Dashboard: active workflows, pending approvals, failed runs
