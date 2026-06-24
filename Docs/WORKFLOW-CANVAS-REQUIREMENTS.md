# MegaForm Workflow Canvas Requirements

## Agreed priorities
- Workflow title must be human-friendly and editable.
- Sample workflows must show a clear description when selected.
- Sample workflows should save cleanly or guide the user with specific validation.
- Send Email nodes must support professional HTML email bodies.
- The right properties panel must be resizable like the form builder.
- Web, DNN, and Oqtane should stay thin shells; shared behavior belongs in core/UI.

## UX requirements
- Avoid technical IDs like `WF-...` as the main workflow name.
- Display workflow intent, trigger, branching, recipients, and end result for each sample.
- Highlight validation problems with readable messages.
- Preserve a wider right panel width when the user resizes it.

## Email requirements
- Subject + HTML body + token insertion.
- Preview area in the workflow properties panel.
- More professional sample email content by default.

## Implementation notes
- Normalize workflow config keys coming back from server (`To`, `Url`, `TargetVariable`, etc.).
- Use a shared metadata model for workflow samples.
- Keep workflow save/test paths shell-agnostic where possible.
