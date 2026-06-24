# DNN inline dock transient-drop tightening note (v20260409-07)

## What changed
- Canonical file: `MegaForm.DNN/Views/FormView.ascx.cs`
- Tightened `ShouldSuppressInlineAdminEmptyState(...)` so it only suppresses the inline dock / empty state for a **transient just-dropped module**.
- Normal unconfigured admin modules now continue to show the canonical inline dock from `FormView.ascx`.

## Root cause
The previous suppression gate treated broad DNN edit-mode signals as transient. That hid the inline dock on ordinary edit pages after the legacy dropdown actions were removed.

## New rule
- **Normal unconfigured module**: show inline dock.
- **Transient add/drop request only**: suppress inline shell + empty state so DNN placeholder flow stays inert.

## Detection tightened to
- `popup=true`
- `popup=1`
- `addmodule`
- `moduleaction=add`

Not used anymore as transient triggers:
- broad edit-mode checks such as `UserMode=Edit`
- `ctl=Edit`
- `dnnmode=edit`
