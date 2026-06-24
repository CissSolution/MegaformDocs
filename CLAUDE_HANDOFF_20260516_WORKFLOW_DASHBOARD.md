# Claude Handoff - MegaForm Workflow Dashboard / BPMN Inline Review

Date: 2026-05-16
Primary user language: Vietnamese
Primary host under test: Oqtane local site

## 1. Canonical paths

- Canonical repo:
  - `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
- Codex workspace used during this run:
  - `C:\Users\Administrator\Documents\Codex\2026-05-08-code-base-cua-megaform-o-day`
- Local Oqtane site root:
  - `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL`
- Main live URL used for QA:
  - `http://localhost:5050/business`

## 2. Product direction from user

The user does NOT want BPMN actions split into a separate "special" workflow surface for day-to-day work.

Target UX:

1. Users work mainly on one business dashboard / board surface.
2. When a user opens a submission, role-based BPMN actions appear inside the same submission review UI.
3. Approvers should not see generic Edit/Delete if the submission is in an active workflow step assigned to approval roles.
4. "Forward" should follow configured workflow delegates / candidate users, not free-form username or email input.
5. Workflow map/process map should remain available for admin QA / transparency, but not as the main business work surface.

## 3. What was implemented in the latest round

### 3.1 Inline BPMN decision surface inside submission detail

Main new/updated shared UI files:

- `MegaForm.UI\src\submissions\submission-detail-workflow-panel.ts`
- `MegaForm.UI\src\submissions\submission-detail-shell.ts`
- `MegaForm.UI\src\submissions\SubmissionModal.ts`
- `MegaForm.UI\src\submissions\index.ts`
- `MegaForm.UI\src\workflow-inbox\task-detail.ts`
- `MegaForm.UI\src\workflow-inbox\task-detail-review.ts`
- `MegaForm.UI\src\workflow-inbox\api.ts`
- `MegaForm.UI\src\styles\megaform-submissions-ts.css`

Behavior:

- Submission detail now shows an inline BPMN decision panel with:
  - current step
  - assigned role/user context
  - decision note
  - internal reference
  - related link
  - supporting evidence / attachment notes
  - Claim / Approve / Reject / Forward buttons (when allowed)
- Forward is constrained to configured candidate users only.
- No free-form forward-to-email/username in the inline review surface.
- Approve/reject comments and evidence metadata are submitted together.

### 3.2 List view row actions changed for workflow rows

File:

- `MegaForm.UI\src\listview\runtime.ts`

Important change:

- If a row has workflow decision actions (`claim`, `approve`, `reject`, `forward`), the board no longer exposes all of them directly in the row.
- Instead, the row action collapses to a single `Review` button.
- The user opens the submission and performs BPMN actions inside the modal.

Key code points:

- `WORKFLOW_ROW_ACTION_KEYS` set
- `readSubmissionActions(...)`
- row label now becomes `Review`

This is one of the most important UX changes in this handoff.

### 3.3 Submission detail labels cleaned up

File:

- `MegaForm.UI\src\submissions\submission-detail-shell.ts`

Change:

- In modal mode, `showTypePills` now defaults to `false`.
- This removes ugly labels like:
  - `Employee NameText`
  - `DepartmentSelect`
  - etc.

### 3.4 Workflow Map repositioned as admin QA surface

File:

- `MegaForm.Oqtane.Client\Index.razor`

Changes:

- "Surface Shortcuts" renamed to `QA / Admin Surfaces`
- Workflow map wording changed from end-user/business wording to admin QA wording
- Button text changed:
  - `Workflow Inbox` -> `Open Workflow Inbox`
  - `Starter Board` -> `Back to App Board`
- Map title changed:
  - `BPMN 2.0 Workflow Map` -> `BPMN 2.0 Process Map`
- Surface link labels changed:
  - `Workflow Map` -> `Process Map (admin QA)`

Intent:

- Keep workflow/process transparency
- But stop presenting it as the main work UI

### 3.5 Oqtane + DNN resource alignment for submission detail styling

Files:

- `MegaForm.Oqtane.Client\Index.razor`
- `MegaForm.DNN\Views\FormView.ascx.cs`

Problem fixed:

- Submission review modal was logically correct but visually unstyled because `megaform-submissions-ts.css` was not guaranteed to load on the live Oqtane surface.

Fix:

- Oqtane resource list now always includes:
  - `css/megaform-submissions-ts.css?v=20260513-04`
- DNN public shell cache/version sync also updated:
  - `megaform-submissions.js` now uses shared `V`
  - `megaform-submissions-ts.css` now uses shared `V`

## 4. Current live cache/version markers

- Oqtane core asset version:
  - `20260513-04`
- DNN cache version:
  - `?v=20260513-04`

Relevant code:

- `MegaForm.Oqtane.Client\Index.razor`
- `MegaForm.DNN\Views\FormView.ascx.cs`

## 5. Current verified live QA

### Verified strongly

Main route verified:

- `http://localhost:5050/business?vk=leave-request-board`

Verified with live headless browser QA:

1. Board approver rows now show `Review` only.
2. Opening review shows inline BPMN decision surface.
3. Inline surface shows:
   - Claim
   - Approve
   - Reject
   - supporting note/reference/link fields
4. Submission labels no longer show `Text`, `Select`, etc.
5. Workflow map page has new admin QA wording.
6. Oqtane submission modal styling is now loaded and visually acceptable.

Artifacts in workspace:

- `C:\Users\Administrator\Documents\Codex\2026-05-08-code-base-cua-megaform-o-day\bpmn-inline-qa\leave-board-v2.png`
- `C:\Users\Administrator\Documents\Codex\2026-05-08-code-base-cua-megaform-o-day\bpmn-inline-qa\leave-review-modal-v2.png`
- `C:\Users\Administrator\Documents\Codex\2026-05-08-code-base-cua-megaform-o-day\bpmn-inline-qa\workflow-map.png`
- `C:\Users\Administrator\Documents\Codex\2026-05-08-code-base-cua-megaform-o-day\bpmn-inline-qa\qa-result-v2.json`

### Verified but weaker / not enough yet

- `Proposal` and `Document Exchange` share the same runtime bundles, so they should inherit the same UX behavior.
- However, DO NOT over-claim that those two apps were visually re-validated as thoroughly as `Leave Request` in this final round.
- There were earlier cross-app QA attempts which were not trustworthy due route/session confusion.

Important:

- Treat `Leave Request` as the reliable visual baseline for this handoff.
- Re-run final visual QA explicitly for:
  - `proposal-review-board`
  - `document-routing-board`

before claiming those apps are fully clean.

## 6. Known open issues / unfinished work

### 6.1 The inline decision surface is correct in direction, but still needs polish

The current modal is much better than before, but still needs:

- tighter spacing and typography polish
- stronger layout hierarchy between:
  - workflow decision section
  - data tabs
  - file attachments
- better alignment for fields like:
  - internal reference
  - related link
  - attachment notes

It is now acceptable for QA, but still not "final product" quality.

### 6.2 Role-specific actions still need stricter business semantics

User expectation:

- approver role:
  - should review
  - claim if applicable
  - approve/reject/route according to BPMN
  - should NOT edit/delete submission content in normal workflow review
- requester role:
  - can create/edit their own submission before or within allowed states
- records/finance/HR roles:
  - should see only actions relevant to their BPMN step

Current direction supports this, but more auditing is needed per starter app.

### 6.3 Process Map should probably move even further into admin-only UX

Current state:

- renamed and repositioned as admin QA
- still visible in the "QA / Admin Surfaces" helper box

Possible next refinement:

- hide it from normal role-switch business flow
- expose only for host/admin
- or move behind a smaller "Admin Tools" toggle

### 6.4 Workflow Inbox and board behavior still need final parity checks

Need explicit retest:

- same submission opened from:
  - board `Review`
  - inbox review
- confirm inline decision surface behaves consistently
- confirm no duplicate/parallel action bars remain

### 6.5 Do not trust the older cross-app QA artifacts blindly

There were earlier workspace artifacts that looked like cross-app verification, but some of them were produced during route/session confusion and may not represent the real target app.

If you see suspicious files in workspace showing identical modal content across different starters, re-run them from scratch.

## 7. Local credentials used during QA

Local Oqtane host login:

- username: `host`
- password: `abc@ABC1024`

Starter sample users were previously created for role QA.
Shared sample password used in earlier rounds:

- `MegaForm!2026`

Examples used earlier:

- Leave:
  - `leave.employee`
  - `leave.manager`
  - `leave.hr`
- Proposal:
  - `proposal.requester`
  - `proposal.manager`
  - `proposal.finance`
- Document Exchange:
  - `document.submitter`
  - `document.department`
  - `document.records`

These are local demo/test credentials only.

## 8. Build / deploy commands that were last used successfully

### UI bundles

From:

- `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI`

Commands:

```powershell
npm run build:listview
npm run build:workflow-inbox
npm run build:submissions
```

### .NET projects

```powershell
dotnet build "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\MegaForm.Oqtane.Server.csproj"
dotnet build "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj"
dotnet build "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.DNN\MegaForm.DNN.csproj"
```

### Oqtane live deploy pattern used

1. Stop `Oqtane.Server`
2. Copy:
   - `MegaForm.Oqtane.Server.Oqtane.dll`
   - `MegaForm.Oqtane.Client.Oqtane.dll`
   - `MegaForm.Oqtane.Shared.Oqtane.dll`
3. Copy updated assets to:
   - `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\wwwroot\Modules\MegaForm\js`
   - `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\wwwroot\Modules\MegaForm\css`
4. Restart `Oqtane.Server.exe`
5. Smoke:
   - `http://localhost:5050/business`

## 9. Recommended next tasks for Claude

Priority order:

1. Re-run final visual QA for:
   - `Leave Request`
   - `Proposal`
   - `Document Exchange`
   on live Oqtane, one by one.
2. Verify that approver/business roles only see BPMN-relevant actions inside submission detail.
3. Remove any remaining row-level workflow shortcuts from list/grid surfaces if they still appear in other views.
4. Check inbox review surface for exact parity with board review surface.
5. Improve visual polish of the inline decision panel so it looks production-ready.
6. Consider moving `Process Map (admin QA)` further away from the main role-switch helper if the user still feels it distracts from the core dashboard.

## 10. Short status summary

The codebase is now much closer to the requested direction:

- business users act mainly from board + submission detail
- BPMN actions are inline
- forward is no longer arbitrary in the inline review surface
- workflow map is reframed as QA/admin

But this is not fully finished.

The most important remaining work is careful, app-by-app visual QA and polishing, especially beyond the verified `Leave Request` baseline.
