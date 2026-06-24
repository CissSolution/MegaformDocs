# Blank Template Builder Fix

This patch fixes the builder flow when the user chooses **Blank Template** from the template gallery.

## Root cause

1. The gallery flow did not clear pending template globals when entering Blank.
2. The core boot logic treated any new empty schema as a signal to hide the builder and show the gallery again.
3. Blank builder therefore started in an inconsistent state: topbar/body switched to builder, but the actual builder app could still be hidden or initialized with stale pending template state.

## What was changed

- `MegaForm.UI/src/builder/gallery.ts`
  - clears pending template globals for Blank
  - forces builder mode for Blank
  - resets schema/title/description/submit text to a truly blank state when already in builder
- `MegaForm.UI/src/builder/core.ts`
  - skips auto-gallery fallback when the user explicitly entered blank builder mode
- `MegaForm.UI/src/builder/panels.ts`
  - ensures the builder stays visible after init for the Blank path
  - re-renders canvas/properties safely after boot

## Expected result

Choosing **Blank Template** now opens a working builder canvas with the empty-state dropzone and sortable canvas active, instead of a broken or stale non-working state.
