# DNN stable-settings-only note v20260411-10

## Goal
Stop inferring transient DNN add/drop lifecycle state inside `FormView.ascx.cs`.

## Decision
- `FormView` no longer suppresses the inline admin shell or empty state based on request-shape heuristics such as query strings, popup/addmodule flags, or edit/layout mode.
- The DNN module view now behaves like stable DNN module samples: render from persisted module state only.
- "Configured vs unconfigured" is determined from stable module data only:
  - resolved `FormId`
  - `MF_ModuleViewConfig`
  - legacy `MegaForm_FormId`
  - legacy `MegaForm_DefaultView`

## Practical result
- DNN owns the add/drop lifecycle.
- MegaForm no longer tries to suppress/unsuppress itself during transient drop flows.
- Unconfigured admin modules still render the canonical inline dock and no-form state on the stable page render.
- Admin-shell assets are loaded on the normal render path so the inline dock remains functional.
