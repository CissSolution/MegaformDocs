# API Reference

This section is generated directly from the XML documentation comments in the
**MegaForm.Sdk** assembly. Every public type, method, and property below is part of the
stable contract (see [API Stability](../articles/api-stability.md)).

## Entry points

- [`IMegaFormClient`](MegaForm.Sdk.IMegaFormClient.yml) — the root facade. Exposes
  `Forms`, `Submissions`, `Dashboard`, `SubmissionDashboard`, `Inbox`, `Files`, and `Schema`.
- [`MegaFormSdk`](MegaForm.Sdk.MegaFormSdk.yml) — ambient accessor for hosts without DI
  (DNN Razor Host, DDR, legacy `.ascx`).
- [`MegaFormScope`](MegaForm.Sdk.MegaFormScope.yml) — the portal/user context passed to
  every call.

## Sub-APIs

- [`IFormApi`](MegaForm.Sdk.IFormApi.yml) — create, read, list, update & delete forms.
- [`ISubmissionApi`](MegaForm.Sdk.ISubmissionApi.yml) — query, submit, update & delete submissions.
- [`IDashboardApi`](MegaForm.Sdk.IDashboardApi.yml) — per-form counts and recent-submission totals.
- [`ISubmissionDashboardApi`](MegaForm.Sdk.ISubmissionDashboardApi.yml) — rich search, detail, and status operations for dashboards.
- [`IInboxApi`](MegaForm.Sdk.IInboxApi.yml) — human-task inbox (claim, approve, reject, forward, comment, attach, ad-hoc tasks).
- [`IFileApi`](MegaForm.Sdk.IFileApi.yml) — list & open uploaded files.
- [`ISchemaApi`](MegaForm.Sdk.ISchemaApi.yml) — parse form schema JSON into typed field metadata.

Use the namespace list on the left (or search) to browse the full reference.
