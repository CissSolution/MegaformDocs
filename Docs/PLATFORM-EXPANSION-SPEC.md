/*============================================================
  MegaForm – Schema V3: Platform Expansion
  Relations, Views, Workflows, Templates
  
  NOTE: This is a SPEC/PLAN — not yet ready to execute.
  Implement incrementally as features are built.
  ============================================================*/

-- ============================================================
-- 1. MF_FormRelations — Links between forms (foreign keys)
-- ============================================================
/*
  Example: "Orders" form has a lookup field pointing to "Customers" form
  
  SourceFormId = Orders form
  SourceFieldKey = "customer_id" field in Orders
  TargetFormId = Customers form  
  TargetFieldKey = "customer_name" (display field)
  RelationType = "lookup" | "one-to-many" | "many-to-many"
*/
CREATE TABLE [dbo].[MF_FormRelations] (
    RelationId      INT IDENTITY(1,1) NOT NULL,
    SourceFormId    INT NOT NULL,
    SourceFieldKey  NVARCHAR(200) NOT NULL,
    TargetFormId    INT NOT NULL,
    TargetDisplayField NVARCHAR(200) NULL,  -- field to show in dropdown
    RelationType    NVARCHAR(50) NOT NULL DEFAULT 'lookup',
    CascadeDelete   BIT NOT NULL DEFAULT 0,
    CreatedOnUtc    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MF_FormRelations PRIMARY KEY (RelationId),
    CONSTRAINT FK_MF_Relations_Source FOREIGN KEY (SourceFormId) REFERENCES MF_Forms(FormId),
    CONSTRAINT FK_MF_Relations_Target FOREIGN KEY (TargetFormId) REFERENCES MF_Forms(FormId)
);


-- ============================================================
-- 2. MF_Views — Saved views (Kanban, Calendar, Gallery, Chart)
-- ============================================================
/*
  Each form can have multiple views.
  ViewType: "table" | "kanban" | "calendar" | "gallery" | "chart"
  ConfigJson stores view-specific settings:
    - table: column order, widths, sort, filters
    - kanban: group-by field, card fields, stage colors
    - calendar: date field, title field, color field
    - gallery: image field, title field, layout
    - chart: chart type, x-axis, y-axis, series
*/
CREATE TABLE [dbo].[MF_Views] (
    ViewId          INT IDENTITY(1,1) NOT NULL,
    FormId          INT NOT NULL,
    ViewName        NVARCHAR(200) NOT NULL,
    ViewType        NVARCHAR(50) NOT NULL DEFAULT 'table',
    ConfigJson      NVARCHAR(MAX) NOT NULL,
    IsDefault       BIT NOT NULL DEFAULT 0,
    SortOrder       INT NOT NULL DEFAULT 0,
    CreatedByUserId INT NOT NULL,
    CreatedOnUtc    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MF_Views PRIMARY KEY (ViewId),
    CONSTRAINT FK_MF_Views_Form FOREIGN KEY (FormId) REFERENCES MF_Forms(FormId) ON DELETE CASCADE
);


-- ============================================================
-- 3. MF_Workflows — Automation rules
-- ============================================================
/*
  TriggerType: "on_submit" | "on_update" | "on_status_change" | "scheduled" | "manual"
  ActionType: "send_email" | "create_record" | "update_field" | "webhook" | "notify" | "approve"
  ConditionJson: when to fire (field conditions, like conditional logic)
  ActionJson: what to do (template, target form, field mappings)
*/
CREATE TABLE [dbo].[MF_Workflows] (
    WorkflowId      INT IDENTITY(1,1) NOT NULL,
    FormId          INT NOT NULL,
    WorkflowName    NVARCHAR(200) NOT NULL,
    TriggerType     NVARCHAR(50) NOT NULL,
    TriggerConfig   NVARCHAR(MAX) NULL,     -- e.g. schedule cron, status value
    ConditionJson   NVARCHAR(MAX) NULL,     -- when conditions
    IsActive        BIT NOT NULL DEFAULT 1,
    SortOrder       INT NOT NULL DEFAULT 0,
    CreatedOnUtc    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MF_Workflows PRIMARY KEY (WorkflowId),
    CONSTRAINT FK_MF_Workflows_Form FOREIGN KEY (FormId) REFERENCES MF_Forms(FormId) ON DELETE CASCADE
);

CREATE TABLE [dbo].[MF_WorkflowActions] (
    ActionId        INT IDENTITY(1,1) NOT NULL,
    WorkflowId      INT NOT NULL,
    ActionType      NVARCHAR(50) NOT NULL,
    ActionJson      NVARCHAR(MAX) NOT NULL, -- action config (email template, field map, etc.)
    SortOrder       INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_MF_WorkflowActions PRIMARY KEY (ActionId),
    CONSTRAINT FK_MF_WFActions_WF FOREIGN KEY (WorkflowId) REFERENCES MF_Workflows(WorkflowId) ON DELETE CASCADE
);

CREATE TABLE [dbo].[MF_WorkflowLog] (
    LogId           BIGINT IDENTITY(1,1) NOT NULL,
    WorkflowId      INT NOT NULL,
    SubmissionId    INT NULL,
    ActionType      NVARCHAR(50) NOT NULL,
    Success         BIT NOT NULL DEFAULT 1,
    ResultJson      NVARCHAR(MAX) NULL,
    ExecutedOnUtc   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MF_WorkflowLog PRIMARY KEY (LogId)
);


-- ============================================================
-- 4. MF_Templates — Pre-built form+view+workflow packages
-- ============================================================
/*
  CRM Template: 3 forms (Contacts, Deals, Activities) + relations + kanban view
  HR Template: 5 forms (Employees, Departments, Leave, etc.) + calendar + approval
  News Template: 1 form (Articles) + gallery view + publishing workflow
*/
CREATE TABLE [dbo].[MF_Templates] (
    TemplateId      INT IDENTITY(1,1) NOT NULL,
    TemplateName    NVARCHAR(200) NOT NULL,
    Category        NVARCHAR(100) NOT NULL,     -- CRM, HR, News, General
    Description     NVARCHAR(MAX) NULL,
    ThumbnailUrl    NVARCHAR(500) NULL,
    PackageJson     NVARCHAR(MAX) NOT NULL,     -- full schema + views + workflows + relations
    IsBuiltIn       BIT NOT NULL DEFAULT 0,
    SortOrder       INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_MF_Templates PRIMARY KEY (TemplateId)
);


-- ============================================================
-- 5. MF_Comments — Activity log / comments on submissions
-- ============================================================
/*
  CRM: sales notes, call logs
  HR: manager feedback, interview notes
  News: editorial comments
*/
CREATE TABLE [dbo].[MF_Comments] (
    CommentId       INT IDENTITY(1,1) NOT NULL,
    SubmissionId    INT NOT NULL,
    UserId          INT NOT NULL,
    CommentText     NVARCHAR(MAX) NOT NULL,
    CommentType     NVARCHAR(50) NOT NULL DEFAULT 'note', -- note, call, email, system
    IsInternal      BIT NOT NULL DEFAULT 1,  -- internal vs visible to submitter
    CreatedOnUtc    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MF_Comments PRIMARY KEY (CommentId),
    CONSTRAINT FK_MF_Comments_Sub FOREIGN KEY (SubmissionId) REFERENCES MF_Submissions(SubmissionId) ON DELETE CASCADE
);


-- ============================================================
-- 6. MF_Permissions — Row-level & field-level access control
-- ============================================================
/*
  CRM: Sales rep only sees own deals
  HR: Employee sees own profile, Manager sees team
  News: Author edits own articles, Editor edits all
*/
CREATE TABLE [dbo].[MF_Permissions] (
    PermissionId    INT IDENTITY(1,1) NOT NULL,
    FormId          INT NOT NULL,
    RoleId          INT NULL,           -- DNN role, NULL = specific user
    UserId          INT NULL,           -- specific user, NULL = role-based
    PermissionType  NVARCHAR(50) NOT NULL, -- view, edit, delete, approve, export
    Scope           NVARCHAR(50) NOT NULL DEFAULT 'all', -- all, own, team
    FieldRestrictions NVARCHAR(MAX) NULL,  -- JSON: fields this role can/cannot see
    CONSTRAINT PK_MF_Permissions PRIMARY KEY (PermissionId),
    CONSTRAINT FK_MF_Permissions_Form FOREIGN KEY (FormId) REFERENCES MF_Forms(FormId) ON DELETE CASCADE
);


-- ============================================================
-- 7. MF_FaceData — Face recognition for attendance
-- ============================================================
/*
  Stores face embeddings for each employee.
  Used by Face Recognition widget to match check-in photos.
  Embedding: 128/512-dim float vector (stored as binary or JSON)
*/
CREATE TABLE [dbo].[MF_FaceData] (
    FaceId          INT IDENTITY(1,1) NOT NULL,
    PortalId        INT NOT NULL,
    UserId          INT NULL,               -- linked DNN user
    SubmissionId    INT NULL,               -- linked employee record
    PersonName      NVARCHAR(200) NOT NULL,
    FaceEmbedding   VARBINARY(MAX) NOT NULL, -- 512-float vector
    PhotoPath       NVARCHAR(500) NULL,      -- reference photo
    IsActive        BIT NOT NULL DEFAULT 1,
    CreatedOnUtc    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MF_FaceData PRIMARY KEY (FaceId)
);

CREATE INDEX IX_MF_FaceData_Portal ON MF_FaceData(PortalId, IsActive);


-- ============================================================
-- SUMMARY: Feature → Table mapping
-- ============================================================
/*
  ┌─────────────────┬──────────────────────────────────────┐
  │ Feature         │ Tables needed                        │
  ├─────────────────┼──────────────────────────────────────┤
  │ CRM             │ MF_FormRelations, MF_Views,          │
  │                 │ MF_Workflows, MF_Comments,           │
  │                 │ MF_Permissions                        │
  ├─────────────────┼──────────────────────────────────────┤
  │ HR              │ MF_FormRelations, MF_Views,          │
  │                 │ MF_Workflows (approval),             │
  │                 │ MF_Permissions (team scope)           │
  ├─────────────────┼──────────────────────────────────────┤
  │ Attendance      │ MF_FaceData, MF_WidgetData,          │
  │                 │ MF_FormAnalytics (daily reports)      │
  ├─────────────────┼──────────────────────────────────────┤
  │ News/CMS        │ MF_Views (gallery), MF_Workflows     │
  │                 │ (publish flow), MF_Comments           │
  ├─────────────────┼──────────────────────────────────────┤
  │ ALL modules     │ MF_Templates (pre-built packages)     │
  └─────────────────┴──────────────────────────────────────┘
*/
