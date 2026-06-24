# DNN unconfigured module state + trial note memo (v20260409-05)

## Scope
Minimal-change patch for two regressions:

1. A newly dropped MegaForm module on a DNN page must behave as an **unconfigured module state** and stay visually inert while DNN page editing / drag-drop is active.
2. Trial mode warning must come from the canonical render pipeline and stay visible under Submit.

## Rules kept
- canonical TS/Vite + C# only
- renderer trust stays in Core-resolved settings
- no JS hand patching
- do not break WEB / DNN working paths

## DNN drop-state fix
Files:
- `MegaForm.DNN/Views/FormView.ascx.cs`

Behavior:
- if admin + not config panel + not live render + no selected form, treat module as an unconfigured admin module state
- suppress inline MegaForm admin shell
- suppress inline no-form message
- skip heavy render/admin asset boot for that state

Reason:
- DNN's own placeholder / edit surface must remain in control until the admin explicitly configures the module
- this avoids loading renderer/dashboard/builder host chrome into the transient page-editor placeholder area

## Trial mode fix
Files:
- `MegaForm.Core/Rendering/RenderModelResolver.cs`
- `MegaForm.UI/src/renderer/index.ts`
- `MegaForm.UI/src/renderer/megaform-renderer.ts`
- `MegaForm.UI/src/dnn-host/index.ts`

Behavior:
- Core-resolved settings continue to own `productionMode` and `trialFooterText`
- renderer syncs those resolved values into `window.__MF_PLATFORM__` for host UI consumption
- trial note under Submit uses the resolved settings
- DNN admin dock pill can switch from `Render` to `Trial Mode` when the current resolved form is trial

## Badges
- `TrialSubmitNote v20260409-05`
- `DNN RendererHost UI v20260409-05`
