# HANDOFF — 2026-06-12 (autonomous run) — 4 tasks: edit-mode menu, inbox redesign, email, form-routing

> Continues `HANDOFF_20260612_SESSION_MASTER.md`. All 4 DONE + Visual-QA-proven on `http://localhost:5000` (Oqtane_new, host/Minh@2002, cache **B139**). Mock(2) reference live at `http://localhost:3000/inbox` (folder `mega-form-admin-redesign (2)`).

## ✅ Task 1 — Oqtane edit-mode: module action menu was hidden (couldn't move MegaForm to a full-width pane)
`MegaForm.Oqtane.Client/Index.razor` hid `.app-moduletitle/.app-module-title/.module-title` unconditionally for a clean look — but in Oqtane **edit mode** that chrome holds the module's action menu (move pane / settings). Fix: consolidated the hide into ONE rule in the top `@if (_panelMode != None)` block, gated `@if (!(PageState?.EditMode ?? false))`; removed the 5 per-mode copies. **Proven:** at `?edit=true` the "Edit Content" button + module chrome are visible (was `display:none`, now `inline`), dashboard still renders.

## ✅ Task 2 — Inbox redesign (Gmail-style, pixel-matched to mock(2))
Most mock features ALREADY existed in our `src/my-inbox` (status badge, return-count ↩N, attachment, priority dot, by-form section UI, filter, sort). Genuine NEW work (all ADDITIVE — comfortable view preserved verbatim):
- **Density toggle** (Comfortable ⇄ Compact): new toolbar button (`layers` icon) → adds `.mf-mi3-list.is-compact` → CSS tightens rows + hides the snippet. Persisted in `localStorage('mf-inbox-density')`.
- **Status filter** dropdown (`circleDot` icon): All statuses + each `STATUS_CONFIG` status.
- **By-Form rows now FILTER** (were read-only): `.mf-mi3-nav-form` is a `<button>` → `onFormFilter` (toggle, keyed on form TITLE) + `.is-active` style.
- **Sort** expanded: + Status (via new `STATUS_RANK`), Form, Submitter.
- **List-row enrichment**: `getAllTasks` overlays returnCount/hasAttachment/tags from the lazy `detailCache` (`enrichLookup`) so those badges show on opened rows.
- Files: `types.ts` (InboxSort widen + `InboxDensity` + `STATUS_RANK`), `index.ts` (density/formFilter/statusFilter state + 3 callbacks + openMenu union), `view.ts` (toolbar buttons, by-form button, filterTasks form+status, sortTasks cases, list `is-compact`), `megaform-my-inbox-ts.css` (additive `.is-compact` + by-form button + active state).
- **Proven with REAL tasks** (created by Task 3b): comfortable rows (priority dot · form · time · subject · submitter · snippet · Pending badge), BY FORM "Bug Report Form (3)", and Compact (snippet hidden, tighter). Design extracted via a 3-agent workflow that read the 1466-line mock + our code.

## ✅ Task 3a — Email notification: was it working? → FIXED + VERIFIED end-to-end
- Pipeline was correct (`SubmissionProcessor → EmailNotificationService → OqtaneEmailSender → SmtpClient`) but `OqtaneEmailSender` ONLY read `MegaForm:Smtp:*` config/env — it ignored **Oqtane's own host SMTP settings**, so a standard install with SMTP configured still no-op'd. **Fix** (`MegaForm.Oqtane.Server/Services/Startup.cs`): inject `ISettingRepository`, fall back to Oqtane host settings `SMTPHost/SMTPPort/SMTPSSL/SMTPUsername/SMTPPassword/SMTPRelay` (`EntityNames.Host, -1`) after the MegaForm keys.
- **VERIFIED** via a local SMTP catcher (`127.0.0.1:2525` + `MEGAFORM_SMTP_HOST` env): submit form 4 (browser UA + `SubmissionTime` to pass the spam filter) → log `[MegaForm Email] Sent via SMTP. To=… Subject=[MegaForm] New submission: Bug Report Form (#11)` + the catcher captured the full MIME message.
- Gotchas learned: (1) email only fires for **non-workflow** forms with `NotifyEmails` set; workflow forms notify via workflow nodes. (2) Scripted `curl` submissions are flagged **spam** (UA `curl`=+25, no SubmissionTime=+30, ≥50=spam → notifications skipped) — use a browser UA + `SubmissionTime>3`. (3) **DLL version trap:** the site had an OLD `MegaForm.Core.dll` (1.5.0.0); deploying only the new Server DLL crashed boot with `Could not load type IWorkflowPrincipalResolver` — you MUST deploy the matching `MegaForm.{Core,Oqtane.Server,Oqtane.Shared}.dll` set together.

## ✅ Task 3b — #6: form-level routing submission → a user's inbox (no BPMN workflow)
The user's core goal. New per-form setting routes every submission straight into a user's/role's My Inbox as a task, WITHOUT authoring a workflow.
- `MegaForm.Core/Models/FormSchema.cs` `FormSettings`: + `DefaultAssigneeUser` (`defaultAssigneeUser`) + `DefaultAssigneeRole` (`defaultAssigneeRole`).
- `MegaForm.Core/Services/SubmissionProcessor.cs`: optional `IWorkflowRepository` ctor param (registered in Oqtane DI) + `TryCreateDirectAssignmentTask(form, submission, schema)` called in the non-workflow branch. It creates a `WorkflowCaseInstance` (Waiting) + `WorkflowTaskInstance` (`NodeLabel="Review: <form>"`, `CandidateUsers=[user]` and/or `CandidateRoles=[role]`; a single user → pre-assign `AssignedUserName` + `Status=Claimed` → In-Progress lane), saves via `SaveCase`/`SaveTask`/`AddTaskAction`, sets submission status `pending_review`. **Guarded** — no-op unless an assignee is set (zero regression).
- **PROVEN:** set form 4 (Bug Report) `defaultAssigneeUser='host'` (in `MF_Forms.SettingsJson`) → 3 submissions → 3 `MF_WorkflowTasks` (assigned=host) → all 3 appear in host's My Inbox (Inbox 3, Assigned to Me 3, BY FORM "Bug Report Form 3"). Approve/Reject/Claim/Forward work via the existing pipeline.

### #6 remaining (next session)
- **Builder UI** to set Default assignee (currently set via `SettingsJson.defaultAssigneeUser`/`defaultAssigneeRole` JSON; no form-builder field yet). Add to the form settings panel + a user/role picker.
- Hard pre-assign currently sets `AssignedUserName` (+ Status=Claimed) but not `AssignedUserId` (no username→id resolution in Core) — works because host is admin (`canSeeAll`); for non-admin assignees, resolve the userId so `IsAssignedToActor` matches by id.
- Conditional routing ("if field=Y → user Z") — not built.

## Current live state / cleanup
- Cache **B139**. `:5000` healthy. Client+Core+Server+Shared DLLs all deployed (matching set).
- **Form 4 (Bug Report) now routes to `host`** (`defaultAssigneeUser='host'`) — a live demo of #6; 3 demo tasks sit in the inbox. Clear by removing the setting if unwanted.
- The SMTP test catcher was stopped; `:5000` runs WITHOUT the test SMTP env (so emails log "no SMTP host" until you configure SMTP in Oqtane host settings — which now works via the fix). Forms 1+4 `NotifyEmails` reverted to empty.

## Files touched
`MegaForm.Oqtane.Client/Index.razor` (edit-mode gate + inbox cache B139); `MegaForm.Oqtane.Server/Services/Startup.cs` (OqtaneEmailSender host-SMTP fallback); `MegaForm.Core/Models/FormSchema.cs` (assignee settings); `MegaForm.Core/Services/SubmissionProcessor.cs` (direct-task routing); `MegaForm.UI/src/my-inbox/{types,index,view}.ts` + `src/styles/megaform-my-inbox-ts.css` (inbox redesign).
QA harnesses: `tools/scn-{editmode,mock2-inbox,mock2-views,inbox-controls,inbox-data,builder-inline,…}.cjs` + the SMTP catcher `Temp/mf_smtp_catcher.py`.
