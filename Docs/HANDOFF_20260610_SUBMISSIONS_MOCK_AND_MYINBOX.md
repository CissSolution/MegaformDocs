# HANDOFF — TASK 1 (submission mock features) DONE + TASK 3 (My Inbox subproject) DONE (2026-06-10)

Live host `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, `http://localhost:5005`, **host / Minh@2002**,
SiteId=1 SQLite. Restart: `$env:MEGAFORM_ALLOW_LOCAL_CLI="1"; ./Oqtane.Server.exe --urls "http://localhost:5005"`.
Headless QA: `MegaForm.UI/tools/mf-hb.cjs --eval tools/<scn>.cjs` (fresh no-cache ctx, logs in as host).

---

## TASK 1 — Submission-dashboard mock features (DONE + Visual-QA-proven, deployed B119)

Ported the mock's 3 new features into `MegaForm.UI/src/submissions/SubmissionsShell.ts` — **context-aware**
(reads REAL data, not the mock's hardcoded list):

1. **Date-range filter** — `.mf-subs-daterange-sel` native `<select>` + calendar icon, options
   `all/today/7d/30d/year` (exact mock labels). Client-side `applyDateRange()` filters by real
   `SubmittedOnUtc` (today `<1d`, 7d `<=7`, 30d `<=30`, year same-year). Proven: All=50 rows → Today=1.
2. **Manage Columns panel** — `buildManageToolbar()` (date select + "Manage Columns" btn + "N columns shown")
   + `buildManagePanel()` (Response Fields | Data Fields tabs + draggable/clickable chips). **Context-aware
   Response Fields**: `getResponseFieldDefs()` reads the form schema's own fields (single-form) OR the union
   of REAL submission `dataJson` keys — keys prefixed `f:`. Proven: 31 real fields (First Name, Email,
   Ticket Type, Dietary Needs, …) NOT the mock's 5 hardcoded ones.
3. **Removable `✕` headers** — `.mf-th-remove` on removable columns; **ID + Status protected**
   (`removable:false`). Chip drag→table drop (`text/field-key`) + click-to-add. Proven: add 7→8 cols,
   remove 8→7, ID/Status keep no ✕.

Column model refactor: `ColumnDef {key,label,group:'data'|'response',sortable,removable}`, `DATA_COLUMNS`,
`buildColumnLibrary`/`syncActiveColumns`/`availableColumns`/`addColumn`/`removeColumn`. Storage key bumped
`mf-subs-columns-v2`. CSS in `src/styles/megaform-submissions-ts.css` (`.mf-subs-manage-*`, `.mf-subs-chip*`,
`.mf-th-remove`, `.mf-subs-daterange*`). Fixed a bug: the date `<select>` had both `mf-input` +
`mf-subs-daterange-sel` → shared `.mf-input` padding overrode left-pad and hid "All " behind the calendar
icon; dropped `mf-input`. QA harness `tools/scn-subsmock.cjs`. Cache: `Index.razor` →
`megaform-submissions.js?v=20260610-B119` (Client rebuilt + DLL deployed so the user's browser busts).

---

## TASK 3 — "My Inbox" personal workflow board (NEW subproject, DONE + proven live, deployed B120)

A project-manager-style personal inbox built on the submission grid: a user sees the workflow tasks that
concern them (Incoming / In Progress / Completed) and can approve, reject, forward or claim — inline or from
a detail drawer. Reuses the existing workflow backend (no new task store).

### Server (C#)
- `MegaForm.Core/Models/WorkflowHumanTaskModels.cs` — NEW `WorkflowWorkboardResult` (Incoming/InProgress/
  Completed + OverdueCount + GeneratedAt; net472-safe ctor style).
- `MegaForm.Core/Services/WorkflowTaskService.cs` — NEW `GetWorkboard(actor, recentCompleted=25)`: splits
  open tasks via the SAME `IsAssignedToActor`/`CanActorClaim` helpers as `GetInbox` (InProgress=mine,
  Incoming=claimable), counts overdue (`DueAt < now`), and pulls recent Completed tasks
  (`ListTasks(OpenOnly=false)` filtered `Status==Completed` & mine; admins see all).
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` — NEW
  `GET Workflow/MyInbox?recentCompleted=N` `[Authorize]` → `{ user, kpis{incoming,inProgress,completed,
  overdue}, incoming[], inProgress[], completed[], forms{id→title}, generatedAt }`. Builds a formId→title
  lookup via `_formRepo.GetForm` so the grid labels rows with no client N+1.
- **`MegaForm.Core/Services/WorkflowEngineV2.cs` (cross-cutting fix)** — `ResumeAsync` used to THROW
  "No applied workflow found for form N" when a form had no applied workflow def, **after** the human task
  was already marked completed → a misleading error toast on every approval surface (My Inbox, workflow
  inbox, submission detail). Now mirrors `StartAsync`'s "no workflow → not an error" handling: completes the
  case cleanly and returns 200. Verified: approve went 400→200.

### Client (Vite/TS) — `MegaForm.UI/src/my-inbox/` (the subproject)
- `index.ts` — entry + **self-mount** `#mf-myinbox-root` (MutationObserver, like SubmissionsShell), data
  load, quick-actions (claim/approve), drawer orchestration, toast host. Registers
  `window.MegaForm.initMyInbox`.
- `view.ts` — `renderBoard()`: header + **KPI strip** (Incoming/In-Progress/Completed/Overdue, click→tab) +
  **tabs** + **submission-grid table** (Form / Step / Status chip / Received / Due "Nd overdue" / Assigned /
  inline actions). Empty states per tab.
- `drawer.ts` — right Sheet: **action panel** (comment + Approve/Reject/Forward+user input/Claim, wired to
  the workflow API) + **reused `window.MegaForm.renderSubmissionDetailShell`** for the real submission data
  (falls back to a simple field list) + **workflow history timeline** (from `getTask` actions).
- `ui.ts` — local helpers (div/span/btn/mk/ic Lucide icons, relativeTime, dueLabel, statusChip).
- Reuses the shared client: extended `src/workflow-inbox/api.ts` with `getMyInbox()` + `src/workflow-inbox/
  types.ts` with `MyInboxResult` (keeps all header/anti-forgery/context logic in one place).
- CSS `src/styles/megaform-my-inbox-ts.css` (`.mf-mi-*`).

### Wiring into the main dashboard
- Vite: `vite.config.ts` entry `my-inbox` + CSS_MAP `['megaform-submissions-ts.css','megaform-my-inbox-ts.css']`.
- `MegaForm.Oqtane.Client/Index.razor` — `MfPanelMode.MyInbox`, parse `?mfpanel=myinbox`, render
  `#mf-myinbox-root`, register the JS+CSS Resources (`?v=20260610-B120`).
- `MegaForm.Oqtane.Client/DashboardView.razor` — `data-myinbox-url="@BuildPanelUrl("myinbox")"`.
- `src/shared/platform-host.ts` — `HostRouteName` + `PlatformHostConfig.myInboxUrl` + directMap + Oqtane/
  default route cases.
- `src/dashboard/index.ts` — `URLS.myinbox()` + Main-nav item `{title:'My Inbox',url:URLS.myinbox(),icon:'inbox'}`.

### Live Visual-QA (host/Minh@2002, headless) — ALL PASS
- `tools/scn-myinbox.cjs`: `GET /Workflow/MyInbox` 200; KPIs incoming12/inProgress0/completed20/overdue12;
  3 tabs; 12 grid rows; drawer opens (title "Proposal Starter") with action panel (Approve+Reject+Forward+
  Comment) + Submission + Workflow-history sections. Screenshots `qa-myinbox-1-board.png` / `-2-drawer.png`.
- `tools/scn-myinbox-approve.cjs`: approve → **200**, incoming−1 / completed+1 (round-trip).
- `tools/scn-myinbox-forward.cjs`: forward to `host` → **200**, incoming−1 / inProgress+1.
- `tools/scn-myinbox-nav.cjs`: dashboard Main-nav shows "My Inbox" → `?mfpanel=myinbox`.

### Notes / next
- Only the **Oqtane** panel is wired (Index.razor). DNN parity (FormView shell) NOT done — add a DNN host
  + `megaform-my-inbox.js` resource there if needed.
- The grid currently shows Form/Step/Status/dates per row; per-row submission FIELD preview is lazy (drawer).
  A future enhancement: enrich the `MyInbox` endpoint with a 2-3 field summary per task for the row.
- For a real (non-admin) user the board scopes to their assignments/roles; host/admin sees all tasks.

---

## TASK 2 — Google Sheets push (DONE the plumbing; live push needs user's Service Account JSON) — B121/B122
- **CRITICAL FIX:** `GoogleSheetsNodeExecutor` was **never registered** as an `INodeExecutor`
  (Startup.cs only listed 8 executors; the comment said external nodes were "opt-in") → the node was a
  **no-op** at submit time. Now registered (`services.AddScoped<INodeExecutor, GoogleSheetsNodeExecutor>()`)
  — DI satisfies its 3-arg ctor (evaluator + auth service + log).
- **Runtime-configurable creds:** `OqtaneGoogleAuthSettings.GetServiceAccountJson()` now reads (priority)
  the site setting `MegaForm_Google_ServiceAccountJson` (via `ITenantManager.GetAlias().SiteId` +
  `ISettingRepository`) → appsettings `MegaForm:Google:ServiceAccountJson` → env
  `MEGAFORM_GOOGLE_SERVICE_ACCOUNT_JSON`. So the UI key works with no restart.
- **Config endpoints** (`MegaFormController.GoogleSheets.cs`, admin-only): `GET/POST/Test
  ModuleConfig/GoogleSheetsSettings`. POST stores the JSON IsPrivate=true (+ default spreadsheet/range);
  Test calls Core `GoogleSheetsAuthService.ValidateServiceAccountAsync` (real OAuth2 token exchange on
  net8+, structural on net472) → `{success, message, clientEmail}`. GET never returns the raw JSON.
- **Empty-rows bug fixed:** `buildGoogleSheetWorkflow` shipped `ColumnMappings: []` → empty rows. Now
  auto-maps the form's real schema fields (`Submitted At` + each field→column) in BOTH the submissions
  shell (`googleSheetFieldMappings`) and the new shared `src/shared/google-sheets-workflow.ts`
  (`connectGoogleSheet` orchestrates fetch-schema → build mappings → fetch/merge workflow → save).
- **Dashboard UI** (`src/dashboard/index.ts`): Configuration nav "Google Sheets" → `openGoogleSheetsSettings`
  (paste JSON + default spreadsheet/range + Test + Save) + per-form row action "Connect Google Sheet" →
  `openGoogleSheetConnectForForm` (uses the shared `connectGoogleSheet`). `googleSheet` icon added.
- **Live-QA:** `tools/scn-subscols.cjs` (GS settings endpoint 200) + `tools/scn-gsui.cjs` (nav present,
  settings modal opens with textarea+Test+Save). **NOT yet live-tested end-to-end** — needs a Google
  Service Account JSON from the user: create SA → enable Sheets API → share the sheet with its
  client_email → paste JSON in dashboard "Google Sheets" settings → Test → connect a form → submit → row.
- Connect is ALSO available from the submissions panel header ("Connect Google Sheet", per selected form).

## TASK 4 — Submission toolbar realigned to the mock (localhost:3000) — B122
Root cause: the shared `.mf-card-hd` (a space-between ROW) overrode `.mf-subs-card-hd`'s
`flex-direction:column`, squishing/centering the title + filters + manage-toolbar. Fixed with a
higher-specificity `.mf-subs-card .mf-subs-card-hd{flex-direction:column;align-items:stretch}` (+
removed the redundant margin-tops; toolbar/panel now `width:100%`). Also dropped the Filter/Clear buttons
and made status/search **live-filter** (like the mock). Proven via `tools/scn-subsdiag.cjs` (hdTop +
manageToolbar now full-width x=306; filters right via `margin-left:auto`).

## TASK 5 — Column resize + cell truncation (no overlap) — B122
Long values (emails) overlapped the next column. Fixed: `ColumnDef.width` + `defaultColWidth()`; table
`table-layout:fixed` + explicit per-column widths + deterministic total table width (wrap scrolls
horizontally); cells `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` + `td.title` = full value
on hover. Each header has a `.mf-th-resize` grip (pointer-drag → grows that column + the table by the same
delta so neighbours keep width; persisted via `setStoredColumns`). Proven `tools/scn-subscols.cjs`
(fixed layout, 5 handles, ellipsis cells, drag widened ID 92→172px).

## Cache versions (Index.razor)
`megaform-submissions.js?v=20260610-B122`, `megaform-dashboard.js?v=20260610-B122`,
`megaform-my-inbox.js?v=20260610-B120`. Client + Server + Core DLLs deployed to the site root, host
restarted on :5005.
