# Request for Claude Next - Typed Storage Widget Semantics Acceptance

Date: 2026-07-18
Author: Codex audit/check after Claude handoff
Scope: request document only, no runtime code changes by Codex

Related handoff:

- `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_WIDGET_SEMANTICS_FIX.md`
- `Docs/AUDIT_TYPED_STORAGE_WIDGET_COVERAGE_2026-07-18.md`
- `Docs/AUDIT_CODEX_ROUND3_TYPED_STORAGE_REMAINING_2026-07-18.md`

## Current verdict

Claude's widget-semantics patch is directionally correct and passes unit/build checks that Codex reran.

Verified by Codex:

- `dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj --no-restore`
  - PASS: 117/117
- `dotnet build MegaForm.Core\MegaForm.Core.csproj -c Release --no-restore`
  - PASS: net472, net8.0, net9.0, net10.0

This is not yet production PASS for no-DataJson. It is a good unit-level fix for three live widget gaps. The next required work is browser/SQL acceptance and widening the semantics registry so typed storage is not only a local normalizer/extractor patch.

## Files touched by the widget-semantics patch

Modified:

- `MegaForm.Core/Services/SubmissionFileMetaExtractor.cs`
- `MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs`
- `MegaForm.Sdk.Tests/SubmissionFileMetaExtractorTests.cs`
- `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs`

New/untracked at audit time:

- `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_WIDGET_SEMANTICS_FIX.md`
- `MegaForm.Core/Services/TypedSubmission/SubmissionFieldTypeSemantics.cs`
- `MegaForm.Sdk.Tests/SubmissionFieldTypeSemanticsTests.cs`

Important: include the two new source/test files in the final commit. They are not shown by `git diff --name-only` because they are untracked.

## What Codex confirmed in source

PASS at source/unit level:

- Shared semantics class exists at `MegaForm.Core/Services/TypedSubmission/SubmissionFieldTypeSemantics.cs:20`.
- Alias canonicalization exists at `SubmissionFieldTypeSemantics.cs:56`.
- Display-only classification exists at `SubmissionFieldTypeSemantics.cs:63`.
- File-like classification exists at `SubmissionFieldTypeSemantics.cs:67`.
- Normalizer now canonicalizes aliases before data-type switch at `SubmissionFieldNormalizer.cs:27`.
- Normalizer skips display-only widgets only when `raw == null` at `SubmissionFieldNormalizer.cs:128`.
- JSON empty value no longer forces literal `"null"` row at `SubmissionFieldNormalizer.cs:213`.
- Complex CLR enumerable items now serialize via `StringifyItem` instead of `item.ToString()` at `SubmissionFieldNormalizer.cs:294` and `:305`.
- File extractor now uses `SubmissionFieldTypeSemantics.IsFileLike(...)` at `SubmissionFileMetaExtractor.cs:72`.
- Tests cover FileUpload, DateTimePicker, DataRepeater/QRCode skip, empty JSON row, CLR list-of-object JSON, and FileUpload file metadata.

Known limitation still present:

- `SubmissionDataReconstructor.CollapseJson(...)` collapses multi-row JSON values by row count. With exactly one typed JSON value row, it returns one parsed token, not necessarily a `JArray`; see `SubmissionDataReconstructor.cs:73-76` and the comment in `TypedSubmissionStorageTests.cs:456`.
- This may be acceptable for browser happy-path when the browser submits a stringified array as one JSON row, but it is not robust for server-side CLR lists with one element.

## Claude next task 1 - Browser + SQL acceptance on Oqtane :5126

Use the currently running Oqtane site `http://localhost:5126/` with MSSQL.

Create real forms in the browser, submit real submissions, and inspect SQL after each case. Do not stop at unit tests.

Acceptance Form A - proposal/file upload:

- Create or seed a proposal-style form that includes a `FileUpload` field type, ideally through the same ProposalStarter/AI path that emitted `Type="FileUpload"`.
- Submit one file in browser.
- Verify:
  - `MF_Submissions` has the submission.
  - `MF_SubmissionFields` has the file field with `FieldType = FileUpload` or canonical equivalent and `DataType = json`.
  - `MF_SubmissionValueJson` has the uploaded-file metadata.
  - `MF_Files` has exactly one row for the uploaded file, not zero and not duplicate rows.
  - Submission dashboard/detail/inbox file link still renders.

Acceptance Form B - display-only widgets:

- Create a form with normal input fields plus `DataRepeater` and `QRCode`.
- Submit browser data where display-only widgets submit no value.
- Verify:
  - Normal data fields are present in `MF_SubmissionFields`.
  - `DataRepeater` and `QRCode` do not create empty typed field rows when `raw == null`.
  - No literal `"null"` row appears in `MF_SubmissionValueJson`.
  - Dashboard/detail still render the form without garbage display values.

Acceptance Form C - grid/repeater JSON shape:

- Create a form with a grid/repeater data field such as `DataGrid` or `GridRepeater`.
- Submit:
  - one row
  - two rows
- Verify:
  - Typed JSON values preserve objects, not `System.Collections.Generic.Dictionary...`.
  - Reconstructed detail/dashboard data preserves array shape for browser-submitted arrays.
  - If the one-row case collapses incorrectly, fix or document whether it is only a server-side CLR-list path.

Acceptance Form D - date/time variants:

- Create a form with Date, DateTime, Time, DateRange, Appointment, and any DateTimePicker alias if any starter/AI path emits it.
- Submit browser values.
- Verify values land in `MF_SubmissionValueDate` or a documented typed fallback without data loss.
- Verify dashboard/detail displays the same values after any DataJson collapse.

Acceptance Form E - compliance/terms widgets:

- Create a form with `Terms`, `TermsPrivacy` if available, and checkbox group.
- Submit browser values.
- Verify:
  - `Terms` lands in boolean typed values.
  - `TermsPrivacy` has an explicit decision: boolean/compliance typed value if it is a consent checkbox, or JSON only if it truly stores structured consent metadata.
  - Checkbox group still stores selected option strings, not boolean false values.

## Claude next task 2 - DNN parity smoke

Run a smaller DNN smoke test on `http://dnn10322_megaclean.ai/` if the environment is available.

Minimum acceptance:

- Submit a FileUpload/proposal form.
- Verify DNN parallel-write typed rows exist.
- Verify `MF_Files` row exists for `FileUpload`.
- Verify DataRepeater/QRCode do not create garbage `"null"` JSON value rows.

Do not enable DataJson collapse for DNN from this task. DNN is still a parallel-write twin, not typed-primary.

## Claude next task 3 - Widen the semantics registry carefully

The new `SubmissionFieldTypeSemantics` should become the single registry for typed-storage classification, not just two call sites.

Next additions:

- Add explicit semantics for `TermsPrivacy`.
- Re-check `PhoneIntl`: currently maps to JSON in `SubmissionFieldNormalizer`. Decide whether it should stay JSON because it has structured country/dial metadata, or whether it needs split typed values for phone search/display.
- Re-check `DataGrid` and `GridRepeater`: they are data-carrying JSON widgets, not display-only widgets.
- Consider adding helper categories:
  - `IsDataCarrying`
  - `IsStructuredJson`
  - `IsConsentLike`
  - `IsExternalDataDisplay`
  - `CanonicalDataTypeFor`
- Route future dashboard/filter/SDK reader logic to this registry.

Acceptance:

- No new local hard-coded field type lists are introduced for typed storage behavior.
- Any existing hard-coded lists that affect typed storage are either replaced or explicitly documented as not storage-related.

## Claude next task 4 - Fix or decide the single-row CLR list limitation

Current limitation:

- Multiple CLR list items become multiple JSON rows and reconstruct as `JArray`.
- A single CLR list item can reconstruct as one object because `CollapseJson` uses `jsonValues.Count == 1` as scalar.

Required decision:

Option A - fix now:

- Track collection-ness in typed storage, for example via field metadata or a value-shape marker.
- Reconstruct one-row CLR list as `JArray`.

Option B - defer:

- Add an explicit test proving browser-submitted one-row arrays round-trip as `JArray`.
- Add a documented limitation that only server-side CLR-list single-row input is affected.

PASS criteria:

- Browser path for one-row and two-row grid/repeater is verified.
- The limitation is not hidden inside a comment only.

## Claude next task 5 - Tie back to Round 3 no-DataJson plan

After widget acceptance passes, continue with the P0 Round 3 items from:

- `Docs/AUDIT_CODEX_ROUND3_TYPED_STORAGE_REMAINING_2026-07-18.md`

Priority:

1. R3-J package/DLL mismatch guard.
2. R3-C typed update API and workflow/inbox/file attach sync.
3. R3-D SDK `Data`/`Fields` facade for dashboard/card/grid/inbox customers.
4. R3-E typed backfill wiring.
5. R3-B remove direct Core writer bypasses.
6. R3-A Umbraco/Web typed store parity or explicit legacy-only marking.

Do not mark "done no-DataJson" after only the widget-semantics fix.

Correct status remains:

> Round 2: Oqtane primary pilot + DNN parallel-write twin, ready for Phase 3.

## Definition of done for this next Claude slice

Claude may mark the widget-semantics slice complete only when all are true:

- Unit tests still pass.
- Core Release build still passes all target frameworks.
- Oqtane browser submissions prove FileUpload, DataRepeater, QRCode, DataGrid/GridRepeater, date/time, and terms widgets round-trip through typed storage.
- SQL screenshots/query outputs are captured in a QA note.
- DNN smoke confirms FileUpload -> `MF_Files` with parallel-write typed rows.
- Any single-row repeater/grid limitation is either fixed or explicitly accepted with browser proof.
- Final handoff lists exact files changed and exact SQL/browser evidence.

