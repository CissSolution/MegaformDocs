# Claude Handoff - B306 Wizard Premium + Premium Shell Strings

Date: 2026-06-28
Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
Local QA site: `http://localhost:5000/`
Oqtane host login provided by user earlier: `host / Minh@2002`

## Important Context

The working tree was already dirty before this Codex session. Do not assume every diff in the touched files belongs to this session.

This session specifically addressed two user complaints:

1. Wizard Fields step for premium templates did not behave like standard templates.
2. Builder HTML Token Designer could not edit premium shell/header/step strings.

Asset version was bumped and deployed as:

`20260628-B306`

## Files Touched In This Session

### 1. `MegaForm.UI/src/dashboard/wizard/step-fields.ts`

Purpose: Make premium Wizard Fields UI consistent with standard Wizard Fields UI.

Main changes made this session:

- Added `activePremiumStepOrdinal` state and reset it in `resetFields()`.
- Removed the premium-only per-step dropdown UX:
  - Old pattern: each premium step rendered as its own card.
  - Old add control: `+ Add field to this step...` select.
- Reworked `premiumFieldsEditor(...)` wizard mode to match the standard flow:
  - Header says `Build your form`.
  - Uses the same field palette grid via `palette(...)`.
  - Shows `Add field` and `More fields`.
  - Shows a left `Steps (N)` sidebar.
  - Shows one active step editor at a time.
  - Keeps premium step count fixed with a `Template steps fixed` note.
  - Shows disabled/on cards for `Multi-step form` and `Progress bar`, because premium shell flow is template-controlled.
- New fields still use the existing premium logic:
  - `addField(activeOrdinal, activeDataStep, catalogKey)`
  - `__step` and `step` stay assigned so migration/sync can place fields into the correct custom shell panel.
- Existing label/required/delete field logic was kept.
- Existing premium step copy editing was preserved:
  - Step label
  - Step subtitle
  - Content heading
  - Intro text

Known intended limitation:

- Premium template step add/delete is still locked. This is intentional for now because the generated premium shell has fixed stepper/page structure. Standard forms can still add/delete steps.

### 2. `MegaForm.UI/src/builder/token-designer.ts`

Purpose: Add a real way to edit premium shell strings from Builder HTML Token Designer.

Main changes made this session:

- Added a premium shell string detection/mutation layer used by the `Form strings` tab.
- Added helper functions around custom HTML DOM parsing:
  - `tdEsc(...)`
  - `tdEscAttr(...)`
  - `shellText(...)`
  - `setShellText(...)`
  - `customHtmlNow(...)`
  - `customHtmlDom(...)`
  - `commitCustomHtml(...)`
  - `hasTemplateToken(...)`
  - `classBlob(...)`
  - `navDataStepNodes(...)`
  - `bgStepNodes(...)`
  - `contentStepNodes(...)`
  - `navLabelNode(...)`
  - `navSubtitleNode(...)`
  - `contentTitleNode(...)`
  - `contentIntroNode(...)`
  - `collectHeaderTargets(...)`
  - `headerTargetLabel(...)`
  - `mutateShell(...)`
  - `collectShellStringDescriptors(...)`
- Extended `renderFormPane(...)`:
  - Keeps existing standard strings:
    - Form title
    - Form description
    - Submit button text
  - Adds a new `Premium shell strings` section when custom HTML has editable shell strings.
  - Groups detected strings into:
    - `Header`
    - `Step navigation`
    - `Step content`
  - Each detected string is editable with an input/textarea.
  - Input changes patch the `customHtml` DOM, call builder sync, and render the canvas.

Important note for Claude:

- This file already had uncommitted edits before this session, including inline image/token designer work and badge/version changes. `git diff` may show more than this session actually added.
- The B306-specific work is the premium shell string detection/mutation and the `Premium shell strings` UI in `renderFormPane`.

### 3. `MegaForm.Oqtane.Shared/AssetVersion.cs`

Purpose: Force browser cache bust after JS bundle changes.

Changed:

```csharp
public static readonly string Current = "20260628-B306";
```

## Generated / Deployed Assets

Build commands run successfully:

```powershell
cd MegaForm.UI
npm run build:dashboard
npm run build:builder
```

Shared DLL build:

```powershell
dotnet build MegaForm.Oqtane.Shared\MegaForm.Oqtane.Shared.csproj -c Release
```

Copied to live Oqtane site:

- `Assets/js/megaform-dashboard.js`
  -> `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\wwwroot\Modules\MegaForm\js\megaform-dashboard.js`
- `Assets/js/bundles/megaform-builder.js`
  -> `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\wwwroot\Modules\MegaForm\js\bundles\megaform-builder.js`
- `Assets/css/megaform-builder-shell.css`
  -> `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\wwwroot\Modules\MegaForm\css\megaform-builder-shell.css`
- `Assets/css/megaform-builder-ts.css`
  -> `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\wwwroot\Modules\MegaForm\css\megaform-builder-ts.css`
- `MegaForm.Oqtane.Shared/bin/Release/net10.0/MegaForm.Oqtane.Shared.Oqtane.dll`
  -> `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\MegaForm.Oqtane.Shared.Oqtane.dll`

Restarted `Oqtane.Server.exe`.

Confirmed server listening:

`localhost:5000`

## Visual QA Performed

### Asset version

Opened:

`http://localhost:5000/?mfpanel=dashboard`

Confirmed scripts loaded:

- `megaform-dashboard.js?v=20260628-B306`
- `megaform-builder-loader.js?v=20260628-B306`
- Builder page later loaded `js/bundles/megaform-builder.js?v=20260628-B306`

### Standard Wizard baseline

Flow:

1. Dashboard -> `New Form`
2. Selected standard `Contact Form`
3. Entered temporary form name `QA Standard Baseline B306`
4. Continued to Fields step

Observed:

- `Build your form`
- `Add fields. 4 fields total.`
- `Multi-step form` toggle
- Palette shown:
  - `Add field`
  - `More fields`
  - 16 field tiles
- Existing field rows shown:
  - Full Name
  - Email
  - Phone
  - Long Text
- Live preview showed the standard fields.

No form was created/published from this test.

### Premium Wizard QA

Flow:

1. Dashboard -> `New Form`
2. Entered temporary form name `QA Premium Bulgaria B306`
3. Selected premium template `Bulgaria Discovery Programme`
4. Continued to Fields step

Setup preview observed:

- Premium live preview now showed real stepper and fields, not fake placeholder:
  - Profile
  - Purpose
  - Details
  - Confirm

Fields step observed:

- `Build your form`
- `Add fields to each step. 21 fields total.`
- Disabled/on `Multi-step form` card
- Disabled/on `Progress bar` card
- Left sidebar:
  - `Steps (4)`
  - `Profile`
  - `Purpose`
  - `Details`
  - `Confirm`
- Active step editor:
  - Step subtitle
  - Content heading
  - Intro text
- Same global field palette as standard:
  - `Add field`
  - `More fields`
  - 16 field tiles
- Old per-step select was gone:
  - No `+ Add field to this step...`

Editability test:

- Clicked `Short Text` tile while active step was Profile.
- Confirmed:
  - Profile count changed `6 -> 7`
  - Total fields changed `21 -> 22`
  - Live preview metric changed to `22Fields`
  - New `Short Text` row appeared in active step editor

No form was created/published from this test.

### Builder HTML Token Designer QA

Opened:

`http://localhost:5000/?mfpanel=builder&formId=45`

Confirmed loaded:

- `megaform-builder.js?v=20260628-B306`

Opened `Edit HTML` from Custom HTML banner.

Observed in modal:

- Tabs:
  - `Text tokens`
  - `Image tokens`
  - `Form strings`
- In `Form strings`, new section appeared:
  - `Premium shell strings`
- For form 45 / EuroYouth, detected 27 shell strings.

Example detected inputs:

- Header:
  - Brand subtitle: `EUROYOUTH 2026`
  - Hero headline: `Your European adventure starts here.`
  - Footer text
- Step navigation:
  - Step 1 label
  - Step 1 subtitle
  - Step 2 label
  - Step 2 subtitle
  - etc.
- Step content:
  - Step 1 heading
  - Step 1 intro
  - Step 2 heading
  - Step 2 intro
  - etc.

Live edit test:

1. Changed `Step 1 heading` temporarily from `Applicant profile` to `Applicant profile QA B306`.
2. Canvas updated live and showed the new heading.
3. Restored it back to `Applicant profile`.
4. Confirmed canvas no longer contained `Applicant profile QA B306`.

Important:

- Did not click Builder Save. The DB should not have been modified by this QA edit.

Browser console check:

- No error/warn logs after QA.

## Verification Commands

Passed:

```powershell
cd MegaForm.UI
npm run build:dashboard
npm run build:builder
```

Passed:

```powershell
dotnet build MegaForm.Oqtane.Shared\MegaForm.Oqtane.Shared.csproj -c Release
```

Failed, pre-existing unrelated issue:

```powershell
cd MegaForm.UI
npm run typecheck
```

Error:

```text
src/builder/workflow/wf-app.ts(785,3): error TS1128: Declaration or statement expected.
```

This same typecheck issue existed before this B306 work. It is not in the files changed for this task.

## Current Known Gaps / Recommended Next Work For Claude

1. Verify persistence of premium shell string edits.
   - This session verified live canvas update only.
   - Next Claude should edit one non-critical string, click Builder Save, reload builder/live view, confirm persisted, then restore.

2. Improve header string labels in `token-designer.ts`.
   - Current generic detector works, but some labels appear as `Header string 3`, `Header string 4`, etc.
   - Better template-specific class mapping can improve UX:
     - Australia: `.au-brand-tx p`, `.au-brand-tx span`, `.au-preset-n`
     - Bulgaria: `.bg-hero-copy p`, `.bg-hero-copy h1`, `.bg-hero-copy span`, `.bg-thumb figcaption`, `.bg-footer`
     - EuroYouth: `.ey-brand span`, `.ey-rating`, `.ey-hero-copy h1`, `.ey-hero-copy p`, `.ey-stats`
     - Festa Italiana: inspect its classes and map similarly.

3. Test all four migrated premium templates end-to-end in Wizard:
   - Bulgaria Discovery Programme
   - Down Under Australia Experience
   - EuroYouth 2026 Application
   - Festa Italiana

4. Test Builder HTML editor on Australia specifically.
   - User explicitly pointed at `Down Under Experience`, `Tell us about your Australian journey`, and `Great Barrier`.
   - Detector should find these, but visual QA should confirm labels and canvas mutation.

5. Decide if premium should support add/delete steps.
   - B306 keeps premium steps fixed.
   - If user wants full step add/delete for premium, Claude should first extend generated shell regeneration logic, not just UI.

6. Fix the unrelated typecheck blocker:
   - `MegaForm.UI/src/builder/workflow/wf-app.ts(785,3)`
   - This is needed before `npm run typecheck` can be used as a clean gate again.

## Quick Reproduction For Claude

### Wizard premium layout check

1. Open `http://localhost:5000/?mfpanel=dashboard`
2. Click `New Form`
3. Enter a form name.
4. Select `Bulgaria Discovery Programme`.
5. Continue to Fields.
6. Expected:
   - Same layout family as standard Fields step.
   - Global palette grid.
   - Left Steps sidebar.
   - One active step editor.
   - No old per-step add-field dropdown.

### Builder shell strings check

1. Open `http://localhost:5000/?mfpanel=builder&formId=45`
2. Click `Edit HTML`.
3. Click `Form strings`.
4. Expected:
   - `Premium shell strings` section.
   - Header, Step navigation, Step content groups.
   - Editing `Step 1 heading` updates canvas live.

## Final State

B306 is deployed locally and Visual QA passed for:

- Standard Wizard Fields baseline.
- Premium Bulgaria Wizard Fields layout/add-field behavior.
- Builder HTML Token Designer premium shell string live edit.

Do not revert unrelated dirty repo changes. Focus next work on persistence QA, template-specific label polish, and all-template pixel QA.
