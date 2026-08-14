# PENDING-REVIEW — converted, measured, NOT yet published

Fifteen templates: the fourteen rebuilt against their mocks in the 2026-08-08 pass, plus
`festa-italiana`, which was restored to disk earlier but never published.

These are **not** on the online gallery and must not be swept into a publish by accident — which is
exactly why they no longer share a folder with the live set.

- Written by `tools/templates/build-exact-conversions.mjs` (13), `build-wizard-conversions.mjs`
  (invoice-codexo), through the shared kit's `OUT_DIR`.
- `festa-italiana.json` has no generator; it is a plain file.
- Measured by `tools/browser-qa/iterate-template.ps1 -Slug <slug>`, which copies from HERE to the QA
  site. Results: `qa-out/iter/<slug>/report.json`, rolled up in `qa-out/iter/deltas.json`.
- Outstanding work and every remaining delta: `CLAUDE_HANDOFF_20260808B_REMAINING_DELTAS.md`.

## Promoting one

1. `iterate-template.ps1 -Slug <slug>` reports `differing 0` and `copy missing 0`
2. look at `qa-out/iter/<slug>/compare.png` — the harness cannot see everything
3. `git mv` the file into `../GALLERY-PUBLISHED/`
4. republish and **count** the manifest
