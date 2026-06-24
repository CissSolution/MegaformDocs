# HANDOFF — April-revert recovery DONE + new UI regressions to fix (2026-06-15)

> START-HERE for the next session. Two parts:
>   PART A — what happened + the recovery that is now COMPLETE (context).
>   PART B — NEW requirements / regressions the user wants fixed (the actual work).
> Reply language: Vietnamese. Memory: [[project-april-revert-incident-recovery]].

---

## PART A — Recovery context (DONE this session, do not redo)

**What broke:** Mid-session, an **April-21 backup (the `_260_Oqtane_um` folder, files stamped `2026-04-21 21:37:46`) was copied OVER the working folder** `MegaFormSolution_280_Oqtane_um`, reverting ~120 of 283 `MegaForm.UI/src` TS files + ~220 of 562 C#/razor files to April, while newer May/June files survived → broken April+June hybrid. No git, no VSS/shadow copy, no VS Code local history.

**How it was recovered (all DONE, build 0 errors):**
- **Frontend (TS):** restored from the deployed LIVE bundle **sourcemaps** under `E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm` via `tmp-qa/recover-frontend.cjs` (44 files). The recovered renderer has the COMPLETE composite (phone flag-dropdown + ssn + dob + time + email/password confirm + name + address) and the builder has the **B167 Composite Designer wired** (`MFCompositeDesigner` + `mf-composite-open-designer`). Pre-revert hybrid backed up at `tmp-qa/_pre_recovery_src_backup`.
- **C# (180 reverted files):** 47 clean files restored from `_280_Oqtane_um4_6` (~June 1) via `tmp-qa/restore-cs-from-um46.cjs`; the June-1→15 residual recovered from the deployed DLLs via **ilspycmd** (`tmp-qa/_decomp_core/`). Hand-recovered: workflow-identity interfaces + `UserPrincipal`, `SubmissionWorkflowDetailInfo` + `SubmissionDetailResult.WorkflowDetail`, `IWorkflowRepository` case/task methods, `WorkflowExecutionStatus.Waiting`, `WorkflowExecutionContext.CaseId/PendingTaskId`, `WorkflowNodeType.AddRole/AddUser/AddUserToRole`, `WorkflowNodeResult.Waiting`, `IWorkflowEngine.ResumeAsync` (+ WorkflowEngineV2 body + NoOp stub), `EmailNotificationService` task templates, `OqtaneConnectionRegistry.CreateProviderConnection`. All marked `[Recovered June-15]`. Client build needed a `MegaForm.Sdk` ProjectReference added.

**Where it is deployed:** a SEPARATE test site **`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3`** (port **5070**, MSSQL DB `Oqtane_MSSQL3` on `.\SQLEXPRESS`, host/**abc@ABC1024**). **`Oqtane_new` (port 5000, host/Minh@2002) is the untouched GOLDEN — do not deploy there.** MSSQL3 backup of old DLLs at `MSSQL3\_megaform_backup_20260615`.

**Two deploy traps learned (IMPORTANT):**
1. MSSQL3 lacked 3 runtime-Razor DLLs (`Microsoft.AspNetCore.Razor.Language` 6.0.36, `Microsoft.CodeAnalysis`, `Microsoft.CodeAnalysis.CSharp`) → server crashed `ReflectionTypeLoadException` until copied from the build output. Any fresh Oqtane target needs these (MegaForm uses Razor runtime compilation).
2. **`npm run build:renderer` was pointing at `scripts/build-renderer.cjs` which builds a COMPOSITE-LESS 168KB renderer.** The correct composite renderer (187KB — has `mf-ccp-trigger`/`mf-composite-cell`/SSN mask) is built by **`node scripts/build-entry.cjs renderer`** (vite). Already fixed in `MegaForm.UI/package.json`. ALWAYS verify a renderer build contains `mf-composite-cell` before deploying.

**Current verified state on MSSQL3:** server up (no startup errors), renderer.js (187KB, composite ✓) + builder.js (MFCompositeDesigner ✓) curl-verified served, flags (`vn.svg`) served. Runtime browser test NOT yet done (Chrome instance was busy).

---

## PART B — NEW requirements / regressions to FIX (next session)

The user reports these are **regressions** — they worked before, now broken (observed after the recovery deploy). Likely the recovered June-15 bundles predate the user's last-good UI state, OR config/surface-gating differs on MSSQL3. **Investigate against the user's expected behavior, don't assume the recovered bundle is the target.**

### B1. Form **Dashboard / Builder** screens must be WINDOWED / FULL-SCREEN
- **Now (broken):** these surfaces render inside a **popup**, or **do not run** at all.
- **Expected (was OK before):** dashboard, builder (and the other admin surfaces) open **windowed / full-screen**, not in a popup.
- Where to look: Oqtane host components `MegaForm.Oqtane.Client/Index.razor`, `BuilderView.razor`; the dashboard/builder loader + self-load bundles; surface rendering + `?mfinline=1` / full-screen overlay logic. Related memory: [[project-module-role-and-page-wizard]] (surfaces render FULL-SCREEN overlay — inline was built then REVERTED per user), [[feedback-inline-css-isolation]] (`?mfinline=1`, scoped reset), [[feedback-oqtane-surface-selfload-bundle]] (self-loader per surface), [[feedback-oqtane-admin-surface-anon-gate]] (gate panels by `_isAdmin`).
- Acceptance: open Dashboard + Builder from the module → each shows full-screen/windowed and actually runs (not a popup, no blank/hang).

### B2. **Admin dock** = only 3 buttons, NO popup
- **Now (broken):** the admin dock shows **more than 3 buttons** and/or opens a **popup**.
- **Expected (was OK before):** the dock has **exactly 3 buttons** and does **not** pop up.
- Where to look: the admin dock markup. DNN side = `MegaForm.DNN/Views/FormView.ascx` (memory [[feedback-edit-form-btn]] = "Edit Form" button at FormView.ascx:167; [[feedback-view-subs-btn]] = "View Submissions" at :166 + :231). Oqtane side = the dock rendered by the Oqtane host/renderer admin shell. Confirm WHICH 3 buttons the user wants (likely Edit Form / View Submissions / + one more — ASK the user to confirm the exact 3).
- Acceptance: dock shows exactly the 3 intended buttons, click → navigates/anchors (no popup overlay).

### Open question for the user (ask at session start)
- Confirm the exact 3 admin-dock buttons wanted.
- Confirm "full-screen" target: a true browser-windowed full surface vs. an in-page full-width overlay.
- Which site to verify on — MSSQL3 (5070) test, or should we also re-deploy to Oqtane_new (5000) once fixed?

---

## Key files / commands
| Concern | Path |
|---|---|
| Recovery scripts | `tmp-qa/recover-frontend.cjs`, `tmp-qa/restore-cs-from-um46.cjs`, `tmp-qa/compare-cs.cjs` |
| Decompiled June-15 Core (reference) | `tmp-qa/_decomp_core/MegaForm.Core.decompiled.cs` |
| Renderer build (CORRECT) | `cd MegaForm.UI && node scripts/build-entry.cjs renderer`  (NOT build-renderer.cjs) |
| Builder build | `npm --prefix MegaForm.UI run build:builder` |
| C# build (Oqtane) | `dotnet build MegaForm.Oqtane.Server\MegaForm.Oqtane.Server.csproj` + `...Client\...csproj` |
| Deploy target (TEST) | `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3` (5070, host/abc@ABC1024) |
| Golden (DO NOT TOUCH) | `E:\DNN_SITES\OqtaneSites\Oqtane_new` (5000, host/Minh@2002) |
| Module assets source | `MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm` (npm builds sync here) |

## Deploy recipe to MSSQL3 (proven this session)
1. Build renderer (vite) + builder + `dotnet build` Server & Client.
2. Stop MSSQL3 server. Copy 5 MegaForm DLLs (Core, Server.Oqtane, Shared.Oqtane, Client.Oqtane, **Sdk**) → MSSQL3 root + the 3 Razor/CodeAnalysis DLLs if missing.
3. robocopy `MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm` → `MSSQL3\wwwroot\Modules\MegaForm`. **Verify renderer.js contains `mf-composite-cell`.**
4. Start `MSSQL3\Oqtane.Server.exe` (working dir = MSSQL3). Oqtane auto-migrates the DB. Curl `http://localhost:5070/Modules/MegaForm/js/megaform-renderer.js`.
