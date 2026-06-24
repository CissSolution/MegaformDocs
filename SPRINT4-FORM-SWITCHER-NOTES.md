# Sprint 4 — Host-level Form Switcher for Submissions

This patch continues the **Web-latest → Core shared → DNN/Oqtane adapters** direction.

## What changed

### Shared Vite submissions shell
Updated source under:
- `MegaForm.UI/src/submissions/index.ts`
- `MegaForm.UI/src/submissions/state.ts`
- `MegaForm.UI/src/submissions/SubmissionsShell.ts`

New behavior:
- loads available forms from host-provided `data-forms`, or falls back to adapter `listForms(...)`
- renders a **form switcher** inside submissions filters
- switching form updates:
  - current `formId`
  - current schema used by the grid/modal
  - subtitle/title/badge text in host page
  - `Edit Form` link
- updates browser URL using `history.replaceState(...)` instead of hard reload

### Host pages updated
Updated host containers to expose enough context for the shared shell:
- `MegaForm.Web/Views/Admin/Submissions.cshtml`
- `MegaForm.DNN/Views/Submissions.ascx`
- `MegaForm.DNN/Views/Submissions.ascx.cs`
- `MegaForm.DNN/ViewModels/ViewModels.cs`
- `MegaForm.Oqtane.Client/Submissions.razor`

Added/used data attributes:
- `data-form-title`
- `data-forms`
- `data-hide-host-chrome`

Added host chrome markers used by the shell:
- `data-mf-role="form-title"`
- `data-mf-role="form-total"`
- `data-mf-role="form-subtitle"`
- `data-mf-role="edit-form-link"`

### CSS hook for immersive shell
Updated:
- `Assets/css/megaform-submissions-ts.css`

Added an **opt-in hook**:
- `data-hide-host-chrome="true"`
- JS adds `body.mf-host-shell-hidden`
- root gets `.mf-host-immersive`

This is intentionally light-touch so it does **not** break normal host pages.
You can later add stronger host-specific CSS rules per platform if you want to hide portal chrome completely.

## Important
Current repo still expects your normal pipeline:
1. `BuildTS.bat`
2. `build.cmd`
3. `pack.cmd`

This sprint updates the **Vite/TS source** and host pages accordingly.
Rebuild the frontend bundle before packaging/testing.

## Expected result after rebuild
- Web / DNN / Oqtane submissions pages all use the same shared submissions shell
- user can switch forms from the page itself
- host title / badge / edit link update without full reload
- URL stays in sync via `formId=...` without manual page refresh
