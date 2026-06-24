Theme Designer fixes included in this package:
- Save / Update Theme now resets the Theme Designer dirty state tracked by the patch layer.
- Back navigation now checks the patch dirty state instead of the stale internal runtime flag, preventing false “Unsaved changes” prompts after a successful save.
- A beforeunload handler now uses the same dirty state.
- Inspect mode now switches the right panel immediately to the clicked item, and clicking a different item updates the panel again without getting stuck on the first item.
