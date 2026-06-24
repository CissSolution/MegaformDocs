# MegaForm DNN Handoff - 2026-04-26

## Source zip
- `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_260_Oqtane_um - CodeStester_SOURCE_no_dll_20260426_v2.zip`

## Current repo
- `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_260_Oqtane_um - CodeStester`

## Latest local DNN package built
- `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_260_Oqtane_um - CodeStester\MegaForm.DNN\Install\MegaForm_01.06.11_Install.zip`

## Priority
- Fix DNN first.
- Do not insert users/roles directly into DB; use DNN APIs only.
- Keep canonical logic in shared TS/Core where possible.

## Current blocker 1
- Regression: `{{script:theme_selector}}` is rendering literally in the form output instead of being resolved/executed.
- This likely means the custom HTML `{{script:*}}` token pipeline is broken somewhere between:
  - builder schema persistence
  - runtime render model
  - DNN/Web runtime form rendering

## Files to inspect first for `{{script:*}}`
- `MegaForm.Core\Models\FormSchema.cs`
- `MegaForm.Core\Rendering\RenderModelResolver.cs`
- `MegaForm.UI\src\builder\properties.ts`
- `MegaForm.UI\src\builder\core.ts`
- `MegaForm.UI\src\builder\gallery.ts`
- `MegaForm.Web\Views\Form\View.cshtml`
- `MegaForm.DNN\Views\FormView.ascx`

## Notes about blocker 1
- Source definitely supports managing `customScripts` and `{{script:*}}` tokens in the builder UI.
- Search hits show token-management/editor code exists, but the runtime output is currently leaking literal `{{script:theme_selector}}`.
- Suspect missing token expansion or missing script injection/execution in runtime custom HTML path.
- Also inspect any code that is supposed to emit/use:
  - `CustomScripts`
  - `customScripts`
  - `window.__mfCurrentScriptRoot`
  - `window.__mfScriptContext`

## Current blocker 2
- DNN workflow inbox had runtime error when clicking/opening submission detail:
  - `Cannot read properties of undefined (reading 'submissions')`
  - in `megaform-workflow-inbox.js`
- Local source now contains an attempted fix:
  - `MegaForm.UI\src\submissions\state.ts`
  - `MegaForm.UI\src\submissions\SubmissionModal.ts`
- The fix makes `SubmissionModal` tolerate absence of `subsState` when opened from workflow inbox.

## Latest local bundle badges
- Submissions modal badge:
  - `SubmissionDetailFlow v20260426-02`
- Workflow inbox badge:
  - `WorkflowInboxTs v20260426-03`

## Bundle architecture state
- Workflow inbox has been split into canonical Vite/TS submodules:
  - `MegaForm.UI\src\workflow-inbox\index.ts`
  - `MegaForm.UI\src\workflow-inbox\api.ts`
  - `MegaForm.UI\src\workflow-inbox\task-list.ts`
  - `MegaForm.UI\src\workflow-inbox\task-detail.ts`
  - `MegaForm.UI\src\workflow-inbox\task-detail-actions.ts`
  - `MegaForm.UI\src\workflow-inbox\task-detail-review.ts`
  - `MegaForm.UI\src\workflow-inbox\task-detail-timeline.ts`
  - `MegaForm.UI\src\workflow-inbox\task-detail-shared.ts`
- Shared stylesheet for inbox:
  - `MegaForm.UI\src\styles\megaform-workflow-inbox-ts.css`
- DNN host shell is intentionally thin:
  - `MegaForm.DNN\Views\Tasks.ascx`

## DNN shell state
- `Tasks.ascx` now loads:
  - `/DesktopModules/MegaForm/Assets/js/megaform-workflow-inbox.js?v=20260426-03`
  - `/DesktopModules/MegaForm/Assets/css/megaform-submissions-ts.css?v=20260426-03`
  - `/DesktopModules/MegaForm/Assets/css/megaform-workflow-inbox-ts.css?v=20260426-03`

## What to verify on live DNN site
1. Confirm the site is actually running the latest package/assets, not stale cache.
2. Hard-refresh and inspect Network to confirm:
   - `megaform-workflow-inbox.js?v=20260426-03`
   - `megaform-submissions.js?v=20260426-03`
3. Re-check whether click/open submission in workflow inbox still throws.
4. Re-check whether `{{script:theme_selector}}` is still showing literally.

## Important context
- The user believes the latest fix direction was wrong because of the `theme_selector` regression.
- They want Claude to take over from current source, not from an older snapshot.
