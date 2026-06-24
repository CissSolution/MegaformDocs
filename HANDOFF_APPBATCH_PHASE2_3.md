# App Batch + Dual-Storage — Phase 2 + 3.1 Handoff (2026-05-31)

## TL;DR

Shipped the **liên hoàn (continuous) flow** for AI-created multi-form apps with relational DB tables. ONE AI prompt → multiple tables created → multiple forms created + auto-wired to those tables → Dashboard auto-refreshes → submissions can be viewed against the actual table rows (not just JSON).

## What ships

### Phase 2 (Ops layer)

| # | Feature | Where | Verified |
|---|---|---|---|
| Op | `execute_sql` | `ops.ts:opExecuteSql` + `AiToolsController.ExecuteDdl` | curl unauth → 401 (gate works) |
| Op | `create_form` | `ops.ts:opCreateForm` + `/MegaFormApi/Save` | non-navigation save, returns formId |
| Op | `app_batch` | `ops.ts:opAppBatch` orchestrator | tables then forms, chat summary |
| #1 | FK auto-detect | `ops.ts:parseDdl + autoWireFkDropdowns` | child Select fields → SQL options |
| #2 | Existing-table reuse | `AiToolsController:ExecuteDdl` catches SQL 2714/1779/2705/2729/4925 | `alreadyExists:true` in response |
| #3 | Partial-failure surfacing | `opAppBatch` chat summary | amber box + expandable failure details, tables preserved |
| #4 | Dashboard auto-refresh | `ops.ts` dispatches `mfai:forms-changed` + `dashboard/index.ts` listens | debounced 500ms location.reload, cross-tab via storage event |

### Phase 3.1 (Dual storage)

| # | Feature | Where |
|---|---|---|
| Server | `GET /AiTools/CustomTableRows?formId=N&page=1&pageSize=50` | `AiToolsController.cs` |
| Client | `submission-livedb-modal.ts` (`MFLiveDbModal.open`) | popup with paginated table |
| UI | "Live DB rows" button in Submissions toolbar | `SubmissionsShell.ts:liveDbBtn` |

Solves the gap: "if a form is bound to a DB table, the submission dashboard still operates on JSON". Admin clicks "Live DB rows" → modal shows actual rows from `[schema].[table]` parsed out of `settings.databaseInsert.insertSql`.

## Acceptance / smoke test

### Test 1 — User prompt drives full app creation

```
User in AI chat:
  "tạo 1 ứng dụng gồm các form nhập liệu cho students, classes,
   teachers, subjects và các bảng số liệu tương ứng, có cơ sở dữ liệu quan hệ"

Expected AI emits ONE op:
{
  "op": "app_batch",
  "tables": [
    {"ddl": "CREATE TABLE [dbo].[Classes]([Id] INT IDENTITY(1,1) PRIMARY KEY, [Name] NVARCHAR(120) NOT NULL, ...);"},
    {"ddl": "CREATE TABLE [dbo].[Teachers]([Id] INT IDENTITY(1,1) PRIMARY KEY, [FullName] NVARCHAR(120) NOT NULL, ...);"},
    {"ddl": "CREATE TABLE [dbo].[Subjects](...);"},
    {"ddl": "CREATE TABLE [dbo].[Students]([Id] INT IDENTITY(1,1) PRIMARY KEY, [FullName] NVARCHAR(120) NOT NULL, [ClassId] INT NULL CONSTRAINT FK_Students_Classes FOREIGN KEY REFERENCES [dbo].[Classes]([Id]), ...);"}
  ],
  "forms": [
    {"title": "Class intake", "fields": [...], "tableName": "Classes"},
    {"title": "Teacher intake", "fields": [...], "tableName": "Teachers"},
    {"title": "Subject intake", "fields": [...], "tableName": "Subjects"},
    {"title": "Student intake", "fields": [
      {"type":"Text","key":"full_name","label":"Full name","required":true},
      {"type":"Select","key":"class_id","label":"Class"},   ← FK auto-detect upgrades this
      ...
    ], "tableName": "Students"}
  ]
}

Dispatcher runs:
  1. 4× ExecuteDdl → tables created (or reported alreadyExists:true if re-run)
  2. autoWireFkDropdowns walks Student fields → class_id matches FK to Classes
     → Select.properties.optionsSource="sql" + SQL="SELECT [Id] AS value, [Name] AS label FROM [dbo].[Classes] ORDER BY [Name]"
  3. 4× create_form → 4 forms persisted with settings.databaseInsert auto-wired
  4. Green chat bubble: "✓ App batch complete — 4/4 tables, 4/4 forms, 1 FK dropdown auto-wired"
  5. Each form link clickable (opens Builder)
  6. Dashboard tab (if open) auto-reloads → 4 new forms appear in list
```

### Test 2 — Re-run same prompt → existing-table reuse

```
Re-run the same prompt → tables already exist.
ExecuteDdl returns {success:true, alreadyExists:true}.
Forms are still re-created (new formIds).
Chat summary: "✓ App batch complete — 4/4 tables (4 already existed), 4/4 forms".
```

### Test 3 — Submission Dashboard live DB rows

```
Open Submissions module → pick "Student intake" form → click "💾 Live DB rows" button.
Modal opens:
  Header: "Live DB rows — Student intake"
  Meta:   "[dbo].[Students] · idColumn=Id · live SELECT (read-only)"
  Table:  rows actually present in [dbo].[Students]
  Footer: pagination

If form has no databaseInsert → meta: "form is not bound to a custom DB table"
                                hint:  "Enable Settings → Database section"
```

## Files reference

```
NEW:
  MegaForm.Core/Seed/ai-knowledge-phase3-storage.sql        5 KB entries
  MegaForm.UI/src/submissions/submission-livedb-modal.ts    LiveDB modal

MODIFIED:
  MegaForm.DNN/WebApi/AiToolsController.cs                  +ExecuteDdl +CustomTableRows endpoints
  MegaForm.UI/src/ai-form-assistant/ops.ts                  +opExecuteSql +opCreateForm +opAppBatch
                                                            +parseDdl +autoWireFkDropdowns
                                                            +rich chat summary +events
  MegaForm.UI/src/ai-form-assistant/chat.ts                 +TOP RULE app_batch
  MegaForm.UI/src/dashboard/index.ts                        +mfai:forms-changed listener
  MegaForm.UI/src/submissions/SubmissionsShell.ts           +Live DB rows button
  MegaForm.DNN/Views/FormView.ascx.cs                       cache V=20260531-P3
```

## What's NOT yet shipped (Phase 3.2 / 3.3 backlog)

| # | Item | Reason / next step |
|---|---|---|
| 3.2 | Edit row in custom table (inline modal form) | Needs UpdateCustomTableRow endpoint + edit-row modal UI |
| 3.2 | Delete row in custom table | Needs DeleteCustomTableRow endpoint + confirm + audit log |
| 3.3 | `settings.databaseInsert.skipJsonStorage:true` flag | Defaults to dual-write today; opt-in single-source-of-truth mode |
| 3.4 | Bi-directional sync — edit in JSON ↔ custom table | Avoid for now; pick ONE source-of-truth per form |
| 3.5 | "View live data" link on Form Builder right panel | Surface the live DB modal from anywhere the form is open |

## Security notes

- `/AiTools/ExecuteDdl` is gated by `[DnnAuthorize(Administrators)]` + `[ValidateAntiForgeryToken]` + verb allow-list (CREATE/ALTER/INSERT/UPDATE/MERGE/WITH/IF) + destructive-verb deny-list (DROP DATABASE, TRUNCATE, xp_cmdshell).
- `/AiTools/CustomTableRows` is gated by `[DnnAuthorize(Administrators)]` + AiFeatureGate (dev.lock). Splice-safe — table/schema identifiers must match `^\w+$`.
- Phase 3.2 edit/delete will reuse the same gate + add per-row audit logging.

## Quick curl tests (logged-in admin context)

```bash
# 1. ExecuteDdl with re-run of already-existing table
curl -X POST /DesktopModules/MegaForm/API/AiTools/ExecuteDdl \
  -d '{"sql":"CREATE TABLE [dbo].[AppDemo_Foo]([Id] INT IDENTITY PRIMARY KEY)"}'
# 1st run → {success:true, affected:-1, alreadyExists:false}
# 2nd run → {success:true, affected:0,  alreadyExists:true, sqlNumber:2714}

# 2. CustomTableRows for a form with databaseInsert
curl /DesktopModules/MegaForm/API/AiTools/CustomTableRows?formId=300
# → {tableName:"Students", schemaName:"dbo", columns:[…], rows:[[…]], total:42, …}

# 3. CustomTableRows for an unbound form
curl /DesktopModules/MegaForm/API/AiTools/CustomTableRows?formId=283
# → {error:"form has no database INSERT enabled — JSON submissions only",
#    hint:"Enable Settings → Database section"}
```

## Deploy state

- Cache `V=20260531-P3`
- `MegaForm.DNN.dll` rebuilt + redeployed (+ExecuteDdl, +CustomTableRows)
- AI assistant bundle rebuilt (Phase 2 #1-#4)
- Dashboard bundle rebuilt (#4 listener)
- Submissions bundle rebuilt (Live DB rows button + modal)
- KB total: **32 entries** related to razor + app-batch + design-for-data + phase2 + phase3
- Both DBs in sync (DNN10322_MegaF + Oqtane_MSSQL)
- App pool recycled

## Open questions for next session

1. **JSON-only vs Custom-only** — should we default new forms to skip JSON storage when `databaseInsert.enabled`? More efficient but breaks the audit trail.
2. **Edit row in Live DB modal** — how surgical? Inline cell edit, or open the actual form populated with the row data?
3. **Cascading delete** — when admin deletes a row in the Classes table, what happens to Students.ClassId rows that reference it? FK CASCADE / SET NULL / RESTRICT decision should be part of `app_batch` DDL.
4. **Dashboard form-list invalidation** — current implementation does `location.reload()`; nicer would be `setState(forms)` without full reload. Defer until we hit performance issues.
