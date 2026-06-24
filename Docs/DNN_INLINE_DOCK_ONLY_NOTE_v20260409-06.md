# DNN inline dock only note v20260409-06

## Goal
Use the inline MegaForm admin dock as the single admin navigation surface on DNN pages.

## Problem
`FormView.ascx.cs` still implemented `IActionable`, so DNN rendered a module action dropdown with:
- My Forms
- Manage Form
- View Submissions

That duplicated the inline dock buttons and created inconsistent UI between pages.

## Decision
- Keep the inline dock in `FormView.ascx` / `megaform-dnn-host.js` as the canonical admin entry.
- Stop exposing legacy `IActionable` menu items from `FormView.ascx.cs`.
- Do not rely on `FormEdit` for the primary admin flow.

## Minimal patch
- Remove `IActionable` implementation from `MegaForm.DNN/Views/FormView.ascx.cs`.
- Leave the inline dock unchanged except for the existing TS badge/version.

## Expected result
- No duplicated DNN dropdown actions for MegaForm view modules.
- Admin uses the same inline dock buttons across pages.
