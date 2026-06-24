# DNN unconfigured module drop state + trial submit note (v20260409-04)

## Scope
- Minimal-change patch only
- Canonical TS/Vite + C# source
- Renderer remains CORE single-trust for trial/production state

## Problem 1: DNN module dropped into page rendered the inline admin host shell too early
When a new MegaForm module is dropped into a DNN page pane, the module has no selected form yet.
The current render path treated it like a fully configured module and rendered the inline admin host shell inside the narrow pane.
That produced the broken stacked button UI during the drop/edit flow.

## Fix
- `MegaForm.DNN/Views/FormView.ascx.cs`
  - Added transient-state detection for an unconfigured module while DNN is in edit/drop mode.
  - Added `SuppressInlineAdminShell` so the host dock does not render in that transient state.
- `MegaForm.DNN/Views/FormView.ascx`
  - The admin shell markup now respects `SuppressInlineAdminShell`.

Result: a dropped-but-unconfigured module is treated as an unconfigured module state during the drop/edit flow, instead of rendering the normal inline host shell.

## Problem 2: Trial note under Submit was not rendering
The renderer had no canonical server-resolved `productionMode` / `trialFooterText` flow, so the client had nothing authoritative to read.

## Fix
- `MegaForm.Core/Models/FormSchema.cs`
  - Added `productionMode` and `trialFooterText` to canonical settings.
- `MegaForm.Core/Rendering/RenderModelResolver.cs`
  - Canonicalizes `productionMode` and `trialFooterText` into resolved schema/settings.
  - Default behavior:
    - `MEGAFORM_PRODUCTION` defined => production mode
    - otherwise trial mode
  - Explicit server-side settings values can still override the default.
- `MegaForm.UI/src/renderer/megaform-renderer.ts`
- `MegaForm.UI/src/renderer/index.ts`
  - Render a compact trial note under the active submit target.
  - Supports both standard submit button and custom-html submit button.

## Trial text
`https://dnndefender.com  Megaform Trial Mode`

## Badge
- JS badge: `TrialSubmitNote v20260409-04`
- Core badge: `RenderModelResolver v20260409-04`
