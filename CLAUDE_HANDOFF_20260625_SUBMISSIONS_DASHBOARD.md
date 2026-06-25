# HANDOFF — Submissions dashboard: counts/graph + storage icon + gear + Send-to-Inbox

**Date:** 2026-06-25 · Live :5070 (Oqtane.MSSQL3, net10/Kestrel `Oqtane.Server.exe`) · host login `host` / pwd in live `appsettings.json → Installation.HostPassword`.
**STATUS: all 3 follow-up requests DONE + DEPLOYED to live + VERIFIED via browser.** AssetVersion bumped **B268 → B269** and the host was restarted, so users do NOT need Ctrl+F5. All source uncommitted on `master`.

---

## ✅ #1 — "Submissions không đếm số liệu / không hiện graph" → FIXED + per-form storage icon
**Root cause of the 0s:** the 36 QA submissions (forms 862/863) were auto-flagged **Spam** by `AntiSpamService` (the Playwright harness submitted them in <Xs → time-trap). `Reports/FormsOverview` counts the volume + graph with `WHERE !IsSpam`, so everything read 0. This is **correct product behaviour** (spam is excluded) — it was test-data noise, not a stats bug.
- **Fix (data):** `UPDATE MF_Submissions SET IsSpam=0, Status='Completed' WHERE FormId IN (862,863)`. Dashboard now shows **36 Total / Last7 36 / Last30 36** + a graph spike on Jun 24; the Forms table shows #862=30 (95% completion) and #863=6 (100%).
- **Per-form storage-type icon** (`MegaForm.UI/src/submissions/forms-overview.ts`, JS-only): `loadStorageMap()` fetches `Form/List` (returns settingsJson + workflowJson) and `deriveStorage()` classifies each form → **db** (settings.databaseInsert.enabled) / **sheet** (a GoogleSheets node in the workflow) / **csv** (default). A coloured chip renders left of the form name (🟦 blue DB cylinder / 🟩 green sheet / ⬜ gray CSV) with a tooltip ("Connected to a database table" etc.). Verified: #863 shows the blue DB icon; the rest show CSV.

## ✅ #2 — Settings nav had no icon → gear added
The nav item already referenced `icon:'gear'` but the `gear` SVG was missing from the icon map in `SubmissionsShell.ts`. Added `gear` (+ `send`, `userPlus`, `csv`). Verified: **Settings now shows a ⚙ gear** in the left sidebar.

## ✅ #3 — "Send to Inbox" button with user selection → IMPLEMENTED + DEPLOYED + VERIFIED
Route the selected submission(s) to a chosen user's **My Inbox**.
- **Server (rebuilt + deployed):**
  - `MegaForm.Core/Services/WorkflowTaskService.cs` → new `CreateAdHocReviewTask(formId, submissionId, targetUser, title, comment, actor)` — builds a one-step review `WorkflowTaskInstance` assigned directly to the target user (mirrors `ForwardTaskAsync`) + a `WorkflowCaseInstance`, persists via `_repo`. Additive; doesn't touch the engine-driven path. Inbox match works by userId OR username (`IsAssignedToActor`).
  - `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` → new endpoint `POST Workflow/Tasks/SendSubmission` `{formId, submissionId, targetUser, title?, comment?}`.
  - User list reuses the existing `GET Workflow/Directory` (same source as the inbox Forward picker).
- **Client (`SubmissionsShell.ts`):** a "Send to Inbox" button in the bulk-action bar (appears when ≥1 row selected) → `openSendToInboxModal()` modal: a directory `<select>` (grouped by role) + a **free-text username** fallback + an optional note → POSTs `SendSubmission` per selected row.
  - ⭐ **Bug found + fixed during QA:** the first build wired the button to `Array.from(state.selected)`, but `buildBulkBar` has **no `state` in scope** (every other function uses `const state = getSubsState()`), so the handler silently threw and the modal never opened. Fixed to `Array.from(getSubsState().selected)`, rebuilt, redeployed.
- **VERIFIED end-to-end:** select a submission → **Send to Inbox** → modal lists Host (from directory) + free-text → typed `host` → **Send** → toast **"Sent 1 to host's inbox."** → `Workflow/MyInbox` shows the **"Review submission" task assigned to host** (status Claimed). Direct endpoint test also returned `{ok:true, taskId, assignedTo:"host"}`. Screenshot `mfqa/out/task3-modal-OK.png`.

---

## What was deployed to live this session
- **DLLs** (built `MegaForm.Oqtane.Server\bin\Release\net10.0`, copied to site root; backups `*.bak-pre-b269`): `MegaForm.Core.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`, `MegaForm.Oqtane.Shared.Oqtane.dll`. Host stopped + restarted (`Oqtane.Server.exe`). These carry: the SendSubmission endpoint + CreateAdHocReviewTask, the **DashboardDatabase code fallback** in `Startup.cs` (so the appsettings entry is now belt-and-braces, not required), and **AssetVersion B269**.
- **JS:** `wwwroot/Modules/MegaForm/js/megaform-submissions.js` (storage icon + gear + Send-to-Inbox; backup `.bak-pre-storageicons`). (Earlier this session: `megaform-builder.js`, `css/megaform.css` for the Theme-Designer work — now also cache-busted by B269.)
- **DB (data):** cleared the spam flag on forms 862/863 submissions.

## Regression checks (all PASS)
- DB-connected form (#863): submitted 1 more row → `dbo.App_QA_Registrations` 6 → 7 (insert path intact after the rebuild).
- Dashboard: 36 total + graph spike + storage icons render.
- Premium/standard form rendering (prior session's Theme work) unaffected.

## Source changed (uncommitted on `master`)
- `MegaForm.UI/src/submissions/forms-overview.ts` (storage icon)
- `MegaForm.UI/src/submissions/SubmissionsShell.ts` (gear/send/csv icons, Send-to-Inbox modal, getSubsState fix)
- `MegaForm.Core/Services/WorkflowTaskService.cs` (CreateAdHocReviewTask)
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` (SendSubmission endpoint)
- `MegaForm.Oqtane.Server/Services/Startup.cs` (DashboardDatabase fallback — now LIVE)
- `MegaForm.Oqtane.Shared/AssetVersion.cs` (B268→B269 — now LIVE)

## Notes / minor follow-ups
- The QA left **2 demo "Review submission" tasks** in the host inbox (proof the feature works) + QA forms 860/861/862/863 + `dbo.App_QA_Registrations` on seed module 1828 (no page → harmless). Delete when you wish.
- `Workflow/Directory` only lists users in **non-system roles**; on a site with no custom-role users the dropdown can be empty — that's why the free-text username field exists (works for `host`).
- Everything across both sessions is uncommitted on `master` — commit when you're happy. Rollback for this deploy: stop host, copy `*.bak-pre-b269` back over the site root + restore `megaform-submissions.js.bak-pre-storageicons`, restart.
