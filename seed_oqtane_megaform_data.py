#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Seed sample data for MegaForm on the Oqtane site localhost:5070.
Run this script to generate seed_oqtane_megaform_data.sql, then execute the SQL
against the Oqtane_MSSQL3 database.

Generates:
  - Sample submissions for existing forms 1-4
  - File attachments for a few submissions
  - A simple 2-step workflow definition on Form 4
  - Workflow cases + tasks so the Inbox/My Inbox surfaces have data
  - A public demo page /mf-demo with the MegaForm module pinned to Submissions
"""
import json
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

DB = "Oqtane_MSSQL3"
SITE_ID = 1
HOST_USER_ID = 1
HOST_USER_NAME = "host"
HOST_DISPLAY_NAME = "Host"

FORMS = {
    2: {"title": "Patient Intake Form", "prefix": "patient"},
    3: {"title": "Join Our Team", "prefix": "candidate"},
    4: {"title": "Form Đăng Ký Du Học", "prefix": "student"},
    1: {"title": "Untitled Form", "prefix": "contact"},
}

STATUSES = ["submitted", "submitted", "submitted", "in_review", "approved", "rejected", "pending_payment"]

# ---------- Sample value pools ----------
VIETNAMESE_NAMES = [
    "Nguyễn Văn An", "Trần Thị Bích", "Lê Văn Cường", "Phạm Thị Dung", "Hoàng Văn Em",
    "Vũ Thị Lan", "Đặng Văn Giang", "Bùi Thị Hoa", "Đỗ Văn In", "Ngô Thị Kim",
]
ENGLISH_NAMES = [
    "John Smith", "Alice Johnson", "Bob Williams", "Carol Davis", "David Brown",
    "Emma Wilson", "Frank Miller", "Grace Taylor", "Henry Moore", "Ivy Anderson",
]
CITIES = ["Ho Chi Minh City", "Hanoi", "Da Nang", "Can Tho", "Hai Phong", "Nha Trang"]
ADDRESS_LINES = [
    "123 Le Loi Street, District 1",
    "45 Nguyen Hue Boulevard, District 1",
    "78 Tran Hung Dao, District 5",
    "12 Pham Ngu Lao, District 1",
    "99 Hai Ba Trung, District 3",
]
COMPANIES = ["Acme Corp", "Global Solutions", "TechStart VN", "Pacific Trade", "Innovation Labs"]
NOTES = [
    "Interested in learning more about your services.",
    "Please contact me during business hours.",
    "This is an urgent request.",
    "Looking forward to your response.",
    "Can you provide a quote?",
]

def pick(seq):
    return random.choice(seq)

def make_email(name):
    base = name.lower().replace(" ", ".").replace("ễ", "e").replace("ị", "i").replace("ư", "u")
    base = "".join(c for c in base if c.isalnum() or c in ".-_")
    return f"{base}{random.randint(1,99)}@example.com"

def make_phone():
    return f"+84 {random.randint(90,99)} {random.randint(100,999)} {random.randint(100,999)}"

def make_date(past_days=365*30):
    d = datetime.utcnow() - timedelta(days=random.randint(0, past_days))
    return d.strftime("%Y-%m-%d")

def build_form2_data(idx):
    name = pick(ENGLISH_NAMES)
    return {
        "first_name": name.split()[0],
        "last_name": name.split()[-1],
        "dob": make_date(365*60),
        "phone": make_phone(),
        "email": make_email(name),
        "insurance": pick(COMPANIES),
        "visit_reason": pick(NOTES),
        "current_medications": "None known" if idx % 3 else "Vitamin D, Omega-3",
        "allergies": "None" if idx % 4 else "Penicillin",
        "urgency": pick(["routine", "urgent", "emergency"]),
    }

def build_form3_data(idx):
    name = pick(ENGLISH_NAMES)
    return {
        "full_name": name,
        "email": make_email(name),
        "phone": make_phone(),
        "location": pick(CITIES),
        "linkedin": f"https://linkedin.com/in/{name.lower().replace(' ', '')}",
        "portfolio": f"https://github.com/{name.lower().replace(' ', '')}",
        "role_applying": pick(["frontend", "backend", "fullstack", "design", "devops", "pm"]),
        "years_exp": pick(["junior", "mid", "senior", "staff"]),
        "tech_stack": pick(["React/Node", "C#/.NET", "Python/Django", "Vue/Go", "Angular/Java"]),
        "availability": pick(["immediate", "2weeks", "1month", "3months"]),
        "motivation": pick(NOTES),
    }

def build_form4_data(idx):
    name = pick(VIETNAMESE_NAMES)
    return {
        "composite_10_xvjj": f"{pick(ADDRESS_LINES)}",
        "first_name": name.split()[0],
        "last_name": " ".join(name.split()[1:]),
        "email": make_email(name),
        "composite_10_w16p": make_phone(),
        "composite_11_waiu": f"{random.randint(500, 20000)} USD",
        "phone": make_phone(),
        "composite_10_2tie": f"{random.randint(1,28):02d}/{random.randint(1,12):02d}/{random.randint(1990,2005)}",
        "country_of_interest": pick(["us", "uk", "aus", "can"]),
        "intended_major": pick(["Computer Science", "Business Administration", "Engineering", "Design", "Medicine"]),
        "additional_notes": pick(NOTES),
    }

def build_form1_data(idx):
    name = pick(ENGLISH_NAMES)
    return {
        "composite_3_6gdp": {
            "email": make_email(name),
            "email_confirm": make_email(name),
        }
    }

BUILDERS = {1: build_form1_data, 2: build_form2_data, 3: build_form3_data, 4: build_form4_data}

def generate_submissions(form_id, count=10):
    rows = []
    for i in range(count):
        data = BUILDERS[form_id](i)
        status = pick(STATUSES)
        submitted = datetime.utcnow() - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
        rows.append({
            "form_id": form_id,
            "data": data,
            "status": status,
            "submitted_on": submitted,
            "ip": f"192.168.1.{10 + i % 240}",
        })
    return rows

def sql_escape_string(s):
    return s.replace("'", "''")

def sql_json(d):
    return sql_escape_string(json.dumps(d, ensure_ascii=False, separators=(",", ":")))

def main():
    lines = []
    lines.append("USE [Oqtane_MSSQL3];")
    lines.append("SET QUOTED_IDENTIFIER ON;")
    lines.append("SET NOCOUNT ON;")
    lines.append("BEGIN TRANSACTION;")
    lines.append("")
    lines.append("-- Clean up partial starter form from earlier failed API call")
    lines.append("DELETE FROM MF_Submissions WHERE FormId = 6;")
    lines.append("DELETE FROM MF_AppQueries WHERE FormId = 6;")
    lines.append("DELETE FROM MF_Views WHERE FormId = 6;")
    lines.append("DELETE FROM MF_Permissions WHERE FormId = 6;")
    lines.append("DELETE FROM MF_Forms WHERE FormId = 6;")
    lines.append("")

    # Insert submissions
    all_submissions = []
    counts = {1: 5, 2: 12, 3: 12, 4: 12}
    for fid, cnt in counts.items():
        subs = generate_submissions(fid, cnt)
        all_submissions.extend(subs)
        for s in subs:
            lines.append(
                f"INSERT INTO MF_Submissions (FormId, DataJson, IpAddress, UserAgent, UserId, Status, IsSpam, SpamScore, SubmittedOnUtc, ReadOnUtc, ModifiedOnUtc, ModifiedByUserId)"
                f" VALUES ({fid}, N'{sql_json(s['data'])}', N'{s['ip']}', N'MegaFormSeed/1.0', NULL, N'{s['status']}', 0, NULL, '{s['submitted_on'].isoformat()}', NULL, NULL, NULL);"
            )

    lines.append("")
    lines.append("-- Capture inserted SubmissionIds into temp table")
    lines.append("DECLARE @InsertedSubmissions TABLE (SubmissionId int, FormId int, RowNum int);")
    lines.append("INSERT INTO @InsertedSubmissions (SubmissionId, FormId, RowNum)")
    lines.append("SELECT SubmissionId, FormId, ROW_NUMBER() OVER (PARTITION BY FormId ORDER BY SubmissionId) AS RowNum")
    lines.append("FROM MF_Submissions WHERE IpAddress LIKE '192.168.1.%' AND UserAgent = N'MegaFormSeed/1.0';")
    lines.append("")

    # Insert file attachments for a few Form 4 submissions
    lines.append("-- Attachments for Form 4 (study-abroad form)")
    lines.append("INSERT INTO MF_Files (SubmissionId, FieldKey, OriginalName, StoredPath, ContentType, FileSizeBytes, UploadedOnUtc)")
    lines.append("SELECT s.SubmissionId, N'supporting_documents', N'ho-so-du-hoc-sample.pdf',")
    lines.append("       N'form-4/field-supporting_documents/' + LOWER(NEWID()) + N'.pdf',")
    lines.append("       N'application/pdf', 124000, GETUTCDATE()")
    lines.append("FROM @InsertedSubmissions s WHERE s.FormId = 4 AND s.RowNum <= 5;")
    lines.append("")

    # Insert workflow roles for demo
    lines.append("-- Ensure demo workflow roles exist on site 1")
    lines.append("DECLARE @ManagerRoleId int, @HrRoleId int;")
    lines.append("SELECT @ManagerRoleId = RoleId FROM [Role] WHERE SiteId = 1 AND Name = N'MF Demo Managers';")
    lines.append("SELECT @HrRoleId = RoleId FROM [Role] WHERE SiteId = 1 AND Name = N'MF Demo HR Reviewers';")
    lines.append("IF @ManagerRoleId IS NULL")
    lines.append("BEGIN")
    lines.append("  INSERT INTO [Role] (SiteId, Name, Description, IsAutoAssigned, IsSystem, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("  VALUES (1, N'MF Demo Managers', N'Seeded managers for MegaForm workflow inbox demo', 0, 0, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("  SET @ManagerRoleId = SCOPE_IDENTITY();")
    lines.append("END")
    lines.append("IF @HrRoleId IS NULL")
    lines.append("BEGIN")
    lines.append("  INSERT INTO [Role] (SiteId, Name, Description, IsAutoAssigned, IsSystem, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("  VALUES (1, N'MF Demo HR Reviewers', N'Seeded HR reviewers for MegaForm workflow inbox demo', 0, 0, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("  SET @HrRoleId = SCOPE_IDENTITY();")
    lines.append("END")
    lines.append("-- Assign host user to both demo roles (idempotent)")
    lines.append("IF NOT EXISTS (SELECT 1 FROM UserRole WHERE UserId = 1 AND RoleId = @ManagerRoleId)")
    lines.append("  INSERT INTO UserRole (UserId, RoleId, EffectiveDate, ExpiryDate, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("  VALUES (1, @ManagerRoleId, GETUTCDATE(), NULL, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("IF NOT EXISTS (SELECT 1 FROM UserRole WHERE UserId = 1 AND RoleId = @HrRoleId)")
    lines.append("  INSERT INTO UserRole (UserId, RoleId, EffectiveDate, ExpiryDate, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("  VALUES (1, @HrRoleId, GETUTCDATE(), NULL, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("")

    # Insert workflow definition for Form 4
    workflow_json = {
        "id": uuid.uuid4().hex,
        "formId": 4,
        "name": "Study Abroad Approval",
        "version": "1.0.0",
        "startNodeId": "manager-approval",
        "settings": {"executionTimeoutSeconds": 300, "dryRun": True, "enableExecutionLog": True},
        "variables": [],
        "nodes": [
            {
                "id": "manager-approval",
                "type": 22,
                "label": "Manager Review",
                "zoneType": 2,
                "position": {"x": 100, "y": 120},
                "config": {
                    "candidateRoles": ["MF Demo Managers"],
                    "candidateUsers": [],
                    "allowClaim": True,
                    "allowForward": True,
                    "allowReassign": True,
                    "commentRequiredOnReject": True,
                    "dueInHours": 24,
                    "pendingSubmissionStatus": "waiting_manager",
                    "approvedSubmissionStatus": "waiting_hr",
                    "rejectedSubmissionStatus": "rejected_manager",
                },
            },
            {
                "id": "hr-approval",
                "type": 22,
                "label": "HR Confirmation",
                "zoneType": 2,
                "position": {"x": 350, "y": 120},
                "config": {
                    "candidateRoles": ["MF Demo HR Reviewers"],
                    "candidateUsers": [],
                    "allowClaim": True,
                    "allowForward": True,
                    "allowReassign": True,
                    "commentRequiredOnReject": True,
                    "dueInHours": 48,
                    "pendingSubmissionStatus": "waiting_hr",
                    "approvedSubmissionStatus": "approved",
                    "rejectedSubmissionStatus": "rejected_hr",
                },
            },
            {
                "id": "end",
                "type": 5,
                "label": "End",
                "zoneType": 2,
                "position": {"x": 600, "y": 120},
                "config": {"endType": 1},
            },
        ],
        "edges": [
            {"id": uuid.uuid4().hex, "sourceNodeId": "manager-approval", "targetNodeId": "hr-approval", "sourceHandle": "default", "targetHandle": "input", "edgeType": 1, "label": "Approve"},
            {"id": uuid.uuid4().hex, "sourceNodeId": "hr-approval", "targetNodeId": "end", "sourceHandle": "default", "targetHandle": "input", "edgeType": 1, "label": "Confirm"},
        ],
    }
    lines.append("-- Workflow definition for Form 4")
    lines.append("DELETE FROM MF_WorkflowCases WHERE FormId = 4;")
    lines.append("DELETE FROM MF_WorkflowTasks WHERE FormId = 4;")
    lines.append("DELETE FROM MF_WorkflowTaskActions WHERE FormId = 4;")
    lines.append("DELETE FROM MF_Workflows WHERE FormId = 4;")
    lines.append(
        f"INSERT INTO MF_Workflows (FormId, WorkflowName, Description, TriggerType, TriggerConfig, StepsJson, IsEnabled, Version, CreatedByUserId, CreatedOnUtc, ModifiedOnUtc)"
        f" VALUES (4, N'Study Abroad Approval', N'Seeded 2-step approval workflow for demo', N'onsubmit', N'{{}}', N'{sql_escape_string(json.dumps(workflow_json, ensure_ascii=False))}', 1, 1, 1, GETUTCDATE(), GETUTCDATE());"
    )
    lines.append("DECLARE @WorkflowId int = SCOPE_IDENTITY();")
    lines.append("")

    # Create workflow tasks for 5 Form 4 submissions
    lines.append("-- Workflow cases + tasks for selected Form 4 submissions")
    lines.append("DECLARE @CaseId1 nvarchar(50) = LOWER(NEWID()), @ExecId1 nvarchar(50) = LOWER(NEWID());")
    lines.append("DECLARE @CaseId2 nvarchar(50) = LOWER(NEWID()), @ExecId2 nvarchar(50) = LOWER(NEWID());")
    lines.append("DECLARE @CaseId3 nvarchar(50) = LOWER(NEWID()), @ExecId3 nvarchar(50) = LOWER(NEWID());")
    lines.append("DECLARE @CaseId4 nvarchar(50) = LOWER(NEWID()), @ExecId4 nvarchar(50) = LOWER(NEWID());")
    lines.append("DECLARE @CaseId5 nvarchar(50) = LOWER(NEWID()), @ExecId5 nvarchar(50) = LOWER(NEWID());")
    lines.append("")
    lines.append("DECLARE @Sub1 int, @Sub2 int, @Sub3 int, @Sub4 int, @Sub5 int;")
    lines.append("SELECT @Sub1 = SubmissionId FROM @InsertedSubmissions WHERE FormId = 4 AND RowNum = 1;")
    lines.append("SELECT @Sub2 = SubmissionId FROM @InsertedSubmissions WHERE FormId = 4 AND RowNum = 2;")
    lines.append("SELECT @Sub3 = SubmissionId FROM @InsertedSubmissions WHERE FormId = 4 AND RowNum = 3;")
    lines.append("SELECT @Sub4 = SubmissionId FROM @InsertedSubmissions WHERE FormId = 4 AND RowNum = 4;")
    lines.append("SELECT @Sub5 = SubmissionId FROM @InsertedSubmissions WHERE FormId = 4 AND RowNum = 5;")
    lines.append("")

    # 5 sample tasks: pending manager, claimed manager, pending hr, approved, rejected
    now = datetime.utcnow()
    tasks = [
        ("@CaseId1", "@ExecId1", "@Sub1", "manager-approval", "Manager Review", "Pending", None, None, "waiting_manager", None, None, None),
        ("@CaseId2", "@ExecId2", "@Sub2", "manager-approval", "Manager Review", "Claimed", HOST_USER_ID, HOST_USER_NAME, "waiting_manager", (now - timedelta(hours=2)).isoformat(), (now + timedelta(hours=22)).isoformat(), None),
        ("@CaseId3", "@ExecId3", "@Sub3", "hr-approval", "HR Confirmation", "Pending", None, None, "waiting_hr", None, (now + timedelta(hours=20)).isoformat(), None),
        ("@CaseId4", "@ExecId4", "@Sub4", "hr-approval", "HR Confirmation", "Completed", HOST_USER_ID, HOST_USER_NAME, "approved", None, None, (now - timedelta(hours=1)).isoformat()),
        ("@CaseId5", "@ExecId5", "@Sub5", "manager-approval", "Manager Review", "Completed", HOST_USER_ID, HOST_USER_NAME, "rejected_manager", None, None, (now - timedelta(hours=3)).isoformat()),
    ]

    for case_var, exec_var, sub_var, node_id, node_label, status, assigned_user_id, assigned_user_name, sub_status, claimed_at, due_at, completed_at in tasks:
        cand_roles = "MF Demo Managers" if "Manager" in node_label else "MF Demo HR Reviewers"
        cand_users = "[]"
        outcome = "approved" if status == "Completed" and sub_status == "approved" else ("rejected" if status == "Completed" else "")
        comment = ""
        if status == "Completed" and sub_status == "approved":
            comment = "Approved by host"
        elif status == "Completed":
            comment = "Rejected by host"

        lines.append(f"INSERT INTO MF_WorkflowCases (CaseId, ExecutionId, FormId, SubmissionId, WorkflowId, CurrentNodeId, Status, StartedByUserId, StartedByUserName, ActiveTaskId, Outcome, LastComment, CreatedAt, CompletedAt)")
        lines.append(f"VALUES ({case_var}, {exec_var}, 4, {sub_var}, @WorkflowId, N'{node_id}', N'{'Running' if status != 'Completed' else 'Completed'}', 1, N'host', N'', N'{outcome}', N'{sql_escape_string(comment)}', GETUTCDATE(), {'GETUTCDATE()' if status == 'Completed' else 'NULL'});")

        task_id = uuid.uuid4().hex
        lines.append(f"INSERT INTO MF_WorkflowTasks (TaskId, CaseId, ExecutionId, FormId, SubmissionId, NodeId, NodeLabel, Status, CandidateRolesJson, CandidateUsersJson, AssignedUserId, AssignedUserName, AssignedDisplayName, AllowClaim, AllowForward, AllowReassign, CommentRequiredOnReject, PendingSubmissionStatus, ApprovedSubmissionStatus, RejectedSubmissionStatus, Outcome, Comment, CreatedAt, ClaimedAt, DueAt, CompletedAt)")
        lines.append(f"VALUES (N'{task_id}', {case_var}, {exec_var}, 4, {sub_var}, N'{node_id}', N'{node_label}', N'{status}', N'[\"{cand_roles}\"]', N'{cand_users}', {assigned_user_id if assigned_user_id else 'NULL'}, N'{assigned_user_name if assigned_user_name else ''}', N'{HOST_DISPLAY_NAME if assigned_user_name else ''}', 1, 1, 1, 1, N'{sub_status}', N'{'approved' if 'Manager' in node_label else 'approved'}', N'{'rejected_manager' if 'Manager' in node_label else 'rejected_hr'}', N'{outcome}', N'{sql_escape_string(comment)}', GETUTCDATE(), {f"'{claimed_at}'" if claimed_at else 'NULL'}, {f"'{due_at}'" if due_at else 'NULL'}, {f"'{completed_at}'" if completed_at else 'NULL'});")
        lines.append("")

    # Workflow task actions for completed tasks
    lines.append("-- Audit actions for completed tasks")
    lines.append("INSERT INTO MF_WorkflowTaskActions (ActionId, TaskId, CaseId, ExecutionId, FormId, SubmissionId, ActionType, ActorUserId, ActorUserName, ActorDisplayName, TargetUser, Outcome, Comment, CreatedAt)")
    lines.append("SELECT LOWER(NEWID()), t.TaskId, t.CaseId, t.ExecutionId, t.FormId, t.SubmissionId,")
    lines.append("       CASE WHEN t.Outcome = N'approved' THEN 2 WHEN t.Outcome = N'rejected' THEN 3 ELSE 1 END,")
    lines.append("       1, N'host', N'Host', N'', t.Outcome, t.Comment, GETUTCDATE()")
    lines.append("FROM MF_WorkflowTasks t WHERE t.FormId = 4 AND t.Status = N'Completed';")
    lines.append("")

    # Create demo page /mf-demo with MegaForm module pinned to submissions
    lines.append("-- Public demo page /mf-demo with MegaForm Submissions surface")
    lines.append("DECLARE @DemoPageId int, @DemoModuleId int, @DemoPageModuleId int;")
    lines.append("SELECT @DemoPageId = PageId FROM [Page] WHERE SiteId = 1 AND Path = N'mf-demo';")
    lines.append("IF @DemoPageId IS NOT NULL")
    lines.append("BEGIN")
    lines.append("  DELETE FROM PageModule WHERE PageId = @DemoPageId;")
    lines.append("  DELETE FROM Permission WHERE EntityName = N'Page' AND EntityId = @DemoPageId;")
    lines.append("  DELETE FROM UrlMapping WHERE SiteId = 1 AND MappedUrl LIKE N'%/mf-demo%';")
    lines.append("  DELETE FROM [Page] WHERE PageId = @DemoPageId;")
    lines.append("END")
    lines.append("INSERT INTO [Page] (SiteId, Path, Name, Title, ThemeType, Icon, ParentId, [Order], IsNavigation, Url, UserId, IsPersonalizable, DefaultContainerType, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, IsDeleted, IsClickable, HeadContent, BodyContent, EffectiveDate, ExpiryDate)")
    lines.append("VALUES (1, N'mf-demo', N'MF Seed Demo', N'MegaForm Seed Demo', NULL, N'', NULL, 100, 0, NULL, NULL, 0, N'Oqtane.Themes.OqtaneTheme.Container, Oqtane.Client', N'seed', GETUTCDATE(), N'seed', GETUTCDATE(), 0, 1, N'', N'', NULL, NULL);")
    lines.append("SET @DemoPageId = SCOPE_IDENTITY();")
    lines.append("INSERT INTO [Module] (SiteId, ModuleDefinitionName, AllPages, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("VALUES (1, N'MegaForm.Client, MegaForm.Oqtane.Client.Oqtane', 0, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("SET @DemoModuleId = SCOPE_IDENTITY();")
    lines.append("INSERT INTO PageModule (PageId, ModuleId, Title, Pane, [Order], ContainerType, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, IsDeleted, EffectiveDate, ExpiryDate, Header, Footer)")
    lines.append("VALUES (@DemoPageId, @DemoModuleId, N'MegaForm Submissions', N'Top', 0, N'Oqtane.Themes.OqtaneTheme.Container, Oqtane.Client', N'seed', GETUTCDATE(), N'seed', GETUTCDATE(), 0, NULL, NULL, N'', N'');")
    lines.append("SET @DemoPageModuleId = SCOPE_IDENTITY();")
    lines.append("-- Permissions: public view + admin edit")
    lines.append("INSERT INTO Permission (SiteId, EntityName, EntityId, PermissionName, RoleId, UserId, IsAuthorized, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("VALUES (1, N'Page', @DemoPageId, N'View', 2, NULL, 1, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("INSERT INTO Permission (SiteId, EntityName, EntityId, PermissionName, RoleId, UserId, IsAuthorized, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("VALUES (1, N'Page', @DemoPageId, N'Edit', 5, NULL, 1, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("INSERT INTO Permission (SiteId, EntityName, EntityId, PermissionName, RoleId, UserId, IsAuthorized, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)")
    lines.append("VALUES (1, N'Page', @DemoPageId, N'View', 3, NULL, 1, N'seed', GETUTCDATE(), N'seed', GETUTCDATE());")
    lines.append("-- Pin module to Submissions surface")
    lines.append("INSERT INTO Setting (EntityName, EntityId, SettingName, SettingValue, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, IsPrivate)")
    lines.append("VALUES (N'Module', @DemoModuleId, N'MegaForm:ModuleRole', N'submissions', N'seed', GETUTCDATE(), N'seed', GETUTCDATE(), 0);")
    lines.append("INSERT INTO Setting (EntityName, EntityId, SettingName, SettingValue, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, IsPrivate)")
    lines.append("VALUES (N'Module', @DemoModuleId, N'MegaForm:ModuleConfigured', N'true', N'seed', GETUTCDATE(), N'seed', GETUTCDATE(), 0);")
    lines.append("")
    lines.append("COMMIT TRANSACTION;")
    lines.append("PRINT 'MegaForm Oqtane seed data created successfully.';")

    out = Path("seed_oqtane_megaform_data.sql")
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated {out} ({len(lines)} lines)")

if __name__ == "__main__":
    main()
