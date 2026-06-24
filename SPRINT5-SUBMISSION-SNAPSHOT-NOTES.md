# Sprint 5 — Submission snapshot mode foundation

Implemented in this source drop:

- Canonical submission data remains in `SubmissionInfo.DataJson`
- Snapshot data is persisted per field via `ISubmissionRepository.InsertValues(...)`
- New shared Core model: `SubmissionFieldSnapshot`
- `SubmissionProcessor` now captures snapshots at submit time
- `SubmissionQueryService.GetDetail(...)` returns:
  - `fieldSnapshots`
  - `hasSnapshot`
- Legacy submissions without persisted snapshots fall back to snapshots generated from current schema with `IsLegacyFallback = true`

Storage strategy in Sprint 5:

- Canonical data: `MF_Submissions.DataJson`
- Snapshot data: `MF_SubmissionValues` (one JSON snapshot row per field)

Why this approach:

- avoids immediate breaking schema changes to `MF_Submissions`
- works with existing EF/Oqtane storage now
- keeps DNN backward compatible (DNN still returns no stored snapshots until its repository is upgraded)

Next recommended sprint:

- Sprint 6: detail drawer/tab switch in shared Vite UI (`Current Schema` / `Submitted Snapshot`)
