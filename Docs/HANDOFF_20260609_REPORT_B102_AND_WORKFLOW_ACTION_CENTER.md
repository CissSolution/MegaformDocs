# HANDOFF — 2026-06-09 · Jotform Report (B101/B102) + Workflow Action Center

Continuation of session `31c389ce…`. Prior handoff: `Docs/HANDOFF_20260608_AI_LOCAL_CLI_AND_SESSION.md` (B84–B88).
Live host: `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0` · URL `http://localhost:5005/?mfpanel=dashboard` · login `host` / `Minh@2002` · SiteId=1.

---

## 1. What shipped this session (ALL deployed + QA'd live)

### B101 — Jotform-style Submission Report (rewrite)
`MegaForm.UI/src/dashboard/submission-report.ts` — full rewrite. KPI strip + submissions-over-time chart + per-field inline-SVG cards (donut for choice, bars for multi-select, stat tiles+histogram for number/rating, response/top-values for text, count/earliest/latest for date) + Summary/Table toggle + CSV. **No chart library.**
- **Data source decision:** reads `GET /api/MegaForm/Submissions?formId=N&pageSize=2000` and parses each row's `dataJson` client-side — NOT `Reports/SubmissionData` (that reads the B55 flat index `MF_SubmissionValues`, which seeded rows never populate). Admins bypass RLS → see all rows.
- Exported `openSubmissionReport(formId, formName)` unchanged (called from `dashboard/index.ts:3276`).

### B102 — Report polish (this is the latest)
Same file, badge `SubmissionReport v20260609-B102-DragMaxComplete`:
- **Draggable** (header is drag handle, pointer events + `transform: translate`) + **Maximize** (⛶ → 98vw×96vh via `BOX_MAX_CSS`) + reset-position (⤢) + Esc-to-close. Control buttons `stopPropagation` on pointerdown so they don't start a drag.
- **Timeline bug FIX:** "Submissions over time" bars were invisible (height 0) because each flex-column wrapper had no explicit height, so the inner `height:%` resolved against an auto-height parent. Fix = `height:100%` on the wrapper (container `position:relative;height:120px`). *Rule: any child with `height:%` needs a height-bearing parent.*
- **Completeness mechanism (real, not placeholder):** `loadFieldSchema` now reads `required` (f.required/isRequired/validation.required/validators[]). Completeness = avg fill-rate across **required** fields (fallback all fields if none required). KPI relabels "Avg completeness (required)" + tooltip "X/Y submissions have every required field answered". Each field card shows red `*` for required.

### Sample-data seeder — 2 bug fixes
`MegaForm.Core/Services/SubmissionSampleDataService.cs` (badge `v20260608-02`):
- **Date spread:** seeder now backdates `SubmittedOnUtc` across ~22 days (AddDays/Hours/Minutes) so the timeline shows a trend.
- **"ten" trap fix:** option-backed fields (select/radio/checkbox/…) now `PickOption/PickOptions` from their own options BEFORE any key-name heuristic. Previously `attendance` matched `Contains("ten")` (Vietnamese tên=name) → a Yes/No select was filled with people's names.
`MegaForm.Oqtane.Server/Data/EfRepositories.cs` `Insert(SubmissionInfo)` (~line 112): **timestamp guard** — only stamp `DateTime.UtcNow` if value is default OR ≥ now-1min, so seeders/imports that backdate are preserved. (Real submits unaffected — they never set it.)

### Workflow Action Center (the "world-class feature" the user picked)
**Key finding: it was ~90% PRE-BUILT.** The gap doc `HANDOFF_CRITICAL_APP_BUILDER_20260523.md §6` is stale. Already existed:
- `MegaForm.UI/src/submissions/submission-detail-workflow-panel.ts` — role-aware decision panel (Claim/Approve/Reject/Forward), gated by `submission.availableActions` from server.
- `MegaForm.UI/src/submissions/submission-activity-timeline.ts` — full chronological history.
- `MegaForm.UI/src/submissions/submission-detail-flow-tab.ts` — BPMN canvas + sidebar + inspector + history (+ default-lifecycle mini-tracker when no workflow).
- Backend: V2 graph workflow engine, Approval (human-task) nodes, endpoints `Workflow/Tasks/{Claim|Approve|Reject|Forward}`, `SubmissionDetailResult.WorkflowDetail`. **Host/admin bypass role checks** (`MegaFormController.cs:2942` `if (actor.IsAdmin || actor.IsSuperUser) return true`).

**The real gap I fixed:** the dashboard submission surface opened detail **read-only** — `MegaForm.UI/src/submission-inbox/runtime.ts` `openSubmissionDetailModal` rendered the shell WITHOUT a `workflowActions` controller (only the per-form listview wired it). Added `buildInboxWorkflowController(...)`:
- POSTs `Workflow/Tasks/{endpoint}` (body `{taskId, comment, data}`, +`targetUser` for forward) via `getAuthHeaders()` + `withDnnPortalIdQuery()`.
- `onActionCompleted` re-fetches the detail and re-renders on the **Activity** tab so the new state + timeline show.
- Badge `SubmissionInboxRuntime v20260609-WfActions`.
- **Gotcha:** the taskId the controller needs is on `availableActions[].taskId`, NOT `submission.activeTaskId`.

---

## 2. Cache versions + deploy state

`MegaForm.Oqtane.Client/Index.razor` Resource entries (these drive the `?v=`):
- `js/megaform-dashboard.js?v=20260609-B102`  (line ~727)
- `js/megaform-submission-inbox.js?v=20260609-WfA`  (line ~730)

Built bundles synced to `MegaForm.Oqtane.Server/wwwroot/...` then **copied to the live host**:
- `wwwroot/Modules/MegaForm/js/megaform-dashboard.js`
- `wwwroot/Modules/MegaForm/js/megaform-submission-inbox.js`
- host ROOT: `MegaForm.Oqtane.Client.Oqtane.dll`, `MegaForm.Core.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`

**Deploy recipe (what worked):**
```
# UI
cd MegaForm.UI
npm run build:dashboard          # syncs to Server/wwwroot
npm run build:submission-inbox
# bump Index.razor ?v= for changed bundles, then:
dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Release --no-incremental
# (for the seeder/Insert C# fix) :
dotnet build MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj -c Release
# copy js to host wwwroot + DLLs to host root, then restart:
Stop-Process -Name Oqtane.Server -Force
$env:ASPNETCORE_URLS="http://localhost:5005"; $env:MEGAFORM_ALLOW_LOCAL_CLI="1"
Start-Process "E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\Oqtane.Server.exe" -WorkingDirectory "E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0" -WindowStyle Hidden
```
Net target = **net10.0**. Cookie usually survives restart, but if `/api/...` → 403, re-login at `/login`.

---

## 3. Live data state (host SQLite DB)

DB = SQLite at `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\Data\Oqtane-202605301132.db` (TEXT dates `yyyy-MM-dd HH:mm:ss.fffffff`). `python` (C:\Python314) has built-in `sqlite3` — used for date-spread + value repair. **App must be stopped before writing the DB** (and a mass `DELETE` was blocked by the auto-mode classifier — prefer in-place UPDATE or ask the user first).

- **Form 1 "Corporate Contact"** — 45 subs, clean current schema, Department=Select donut. Dates spread 5/17–6/8.
- **Form 3 "Vous Etes Invite"** — 54 subs = 24 OLD (keys name/email/message/company — different schema) + 30 NEW. `attendance` repaired in-place to accept/decline. 3 donuts (guest_count / attendance / meal_preference) + Dietary multi-bars.
- **Form 4 "Proposal Starter"** — launched this session via `POST /api/MegaForm/Starter/Launch` body `{starterKey:"proposal", moduleId:793}` + query `?siteId=1&entityid=793&entityname=Module` + header `X-Oqtane-SiteId:1`. Created 2-stage approval workflow + ~20 sample subs (waiting_manager / waiting_finance / approved / rejected) + seeded users `proposal.{requester,manager,finance}` / `MegaForm!2026`.

---

## 4. QA evidence (live)

- **Report:** forms 1 + 3 render all chart types; Summary/Table toggle (54×10 grid); CSV button; **timeline now shows bars (max 119px, 22 day-buckets)**; drag + maximize work; completeness tooltip = "46/54 … required".
- **Workflow Action Center:** at `?mfpanel=submissions&formId=4` (mounts the submission-inbox bundle), clicked submission **113** (`waiting_manager`) → decision panel → typed note → **Approve** → controller POSTed → re-rendered Activity timeline → status **waiting_manager → waiting_finance**. Also API-proved sub **114** (HTTP 200, outcome=approved, → waiting_finance).

---

## 5. Known issues / cleanup for next session

1. **Proposal starter bound module 793 → form 4.** Launching the starter rebound the dashboard module to the proposal board (`?mfpanel=inbox` then misbehaved; `?mfpanel=submissions&formId=N` is the reliable inbox entry). If the host's main page looks wrong, rebind module 793. Low risk (demo host).
2. **Form 3 mixed schema** — the 24 OLD subs lack the current fields, so new-field cards show "30 of 54 answered" and completeness is dragged down. To make form 3 a clean showcase, delete the 24 old subs (keys without `first_name`) — **needs user OK** (mass delete was classifier-blocked earlier; do a scoped DELETE only after asking).
3. **`?mfpanel=inbox` didn't mount** the gmail inbox this session (flaky). Use `?mfpanel=submissions&formId=N` — same `submission-inbox` bundle, mounts reliably.
4. **Inbox list row status** does not auto-refresh after a workflow action (only the open detail modal re-renders). Hitting Refresh or re-opening updates the row pill. A surgical row-pill update was deliberately skipped (row data is in a closure const).

---

## 6. World-class roadmap — next work (user-driven)

From `HANDOFF_CRITICAL_APP_BUILDER_20260523.md §6`. P0 Portal+RLS (done B85), Workflow Action Center (completed this session). **7 remaining — user picks next:**
1. Query Designer (no-code query builder: params/filters/sort/paging/preview)
2. Relation Engine UI (parent/child relationships + browse related)
3. Role Simulation / QA Switcher ("view as role" dropdown)
4. Media Library (file/image storage + preview + permissions + audit)
5. Print/Report Layer (printable/PDF templates for list/detail/report) — adjacent to the analytics report just built
6. App Lifecycle import/export (partially done: ExportApp/ImportApp from sprint block 8)
7. Automated QA / smoke tests

---

## 7. Pointers
- Memory index updated: `project_jotform_report_b101.md`, `project_report_b102_and_workflow_action_center.md`.
- Cache-version trap: `feedback_oqtane_asset_cache_versions.md`.
- Don't overclaim UX (visual-QA each surface): `feedback_dont_overclaim_ux.md`.
- Local host details: `reference_local_oqtane_host.md`.
