# MegaForm Architecture Review - Subprojects, API, SDK Split

Date: 2026-07-22  
Source reviewed: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
Scope: architecture/documentation only. No runtime code changes.

## Executive verdict

MegaForm should be split by bounded contexts, not by host/controller convenience. The current source already has the beginning of this shape: shared `MegaForm.Core`, public `MegaForm.Sdk`, host packages for Oqtane/DNN/Web/Umbraco, typed submission storage abstractions, file metadata, workflow, Google Sheets settings, and storage provider abstractions.

The important correction is this:

> MegaForm is not JSON-only anymore. Oqtane is typed-primary/collapse-friendly. DNN, Web, and Umbraco have typed-parallel storage and should not collapse `DataJson` until their read paths, backfill, dashboards, reports, SDK surfaces, and QA are complete.

The recommended direction is an incremental split:

- `MegaForm.Submissions`
- `MegaForm.Files`
- `MegaForm.Security`
- `MegaForm.Workflow`
- `MegaForm.Integrations.Abstractions`
- `MegaForm.Integrations.GoogleSheets`
- `MegaForm.Integrations.Storage.*`
- `MegaForm.Integrations.Saas`
- `MegaForm.Sdk`
- `MegaForm.Admin.Sdk`
- host adapters for Oqtane, DNN, Umbraco, and ASP.NET Core/Web

This should be done as a migration, not a big-bang rewrite. Keep compatibility while moving ownership out of giant host controllers and out of an overloaded `MegaForm.Core`.

## Current source map

Current project layout, based on `.csproj` and source review:

| Project | Current role |
| --- | --- |
| `MegaForm.Core` | Shared domain models, services, rendering, typed submission services, workflow, integrations, file/security helpers. Targets `net472;net8.0;net9.0;net10.0`. |
| `MegaForm.Sdk` | Public in-process SDK facade over forms, submissions, dashboard, inbox, files, schema. Targets `net472;net8.0;net9.0;net10.0` and references `MegaForm.Core`. |
| `MegaForm.Oqtane.Server` | Oqtane server host, EF repositories, migrations, controllers, storage service, Google Sheets settings, SDK registration. References `MegaForm.Core` and `MegaForm.Sdk`. |
| `MegaForm.Oqtane.Client/Shared/Package` | Oqtane client/shared/package pieces. |
| `MegaForm.DNN` | DNN host/module with ADO.NET/DNN repositories, controllers, typed store, SDK reference. Targets `net472`. |
| `MegaForm.Web` | ASP.NET Core/Web host with EF repositories, multi-provider schema bootstrapper, SDK reference. Targets `net9.0`. |
| `MegaForm.Umbraco` | Umbraco 14+ host/package with EF repository, migrations/bootstrapper, backoffice/public adapters, SDK reference. Targets `net8.0`. |
| `MegaForm.UI` | Shared TypeScript/Vite UI surface. |
| `MegaForm.AspNetCore.Component` | Reusable ASP.NET Core component surface. |
| `MegaForm.Premium.AspNetCore` | Premium web/component extensions. |
| `MegaForm.Sdk.Tests` | SDK and typed submission tests. |

Current dependency direction is mostly:

```text
Host projects
  -> MegaForm.Sdk
  -> MegaForm.Core

MegaForm.Sdk
  -> MegaForm.Core
```

That is workable today, but it makes `MegaForm.Core` too broad. The split should keep host-specific references out of domain packages and make controllers thin adapters over shared services.

## Current submission storage status

### What exists now

The source already includes typed submission storage:

- `MegaForm.Core\Models\TypedSubmissionEntities.cs`
- `MegaForm.Core\Interfaces\ISubmissionDataStore.cs`
- `MegaForm.Core\Services\TypedSubmission\SubmissionFieldNormalizer.cs`
- `MegaForm.Core\Services\TypedSubmission\SubmissionDataReconstructor.cs`
- `MegaForm.Core\Services\TypedSubmission\SubmissionDataResolver.cs`
- `MegaForm.Core\Services\TypedSubmission\LegacySubmissionBackfillService.cs`
- `MegaForm.Core\Services\SubmissionQueryService.cs`
- `MegaForm.Oqtane.Server\Data\EfSubmissionDataStore.cs`
- `MegaForm.DNN\Data\DnnSubmissionDataStore.cs`
- `MegaForm.Web\Data\EfSubmissionDataStore.cs`
- `MegaForm.Umbraco\Data\EfSubmissionDataStore.cs`

Typed submission storage uses:

- `MF_SubmissionFields`
- `MF_SubmissionValueString`
- `MF_SubmissionValueLongText`
- `MF_SubmissionValueNumber`
- `MF_SubmissionValueDate`
- `MF_SubmissionValueBoolean`
- `MF_SubmissionValueJson`

`MF_SubmissionValueJson` is field-level JSON for complex values such as File, Address, Composite, and PdfForm. It is not the same as legacy submission-wide `MF_Submissions.DataJson`.

The core classification source is `SubmissionFieldTypeSemantics`:

- canonicalizes aliases such as `FileUpload -> File`
- recognizes display-only widgets such as `DataRepeater` and `QRCode`
- recognizes file-like fields: `File`, `FileUpload`, `PdfForm`

This is the right direction. Any future SDK, dashboard, file extractor, report, or typed query feature should reuse this same semantic layer.

### Oqtane: typed-primary/collapse-friendly

Oqtane is the most advanced host for typed storage:

- `MegaForm.Oqtane.Server\Data\EfSubmissionDataStore.cs` returns `SupportsDataJsonCollapse => true`.
- `SubmissionProcessor` writes typed rows and then collapses `MF_Submissions.DataJson` to `{}` only when the store supports collapse.
- `EfSubmissionRepository.HydrateDataJson()` reconstructs `DataJson` from typed rows for collapsed rows.
- `SubmissionDataResolver` prefers typed rows when `SupportsDataJsonCollapse=true`.
- `EfSubmissionRepository.UpdateData()` re-derives typed rows when a real, non-empty `DataJson` is written on a typed-primary host.
- `EfSubmissionRepository.Delete()` and `BulkDelete()` explicitly clean typed rows.

Correct wording:

> Oqtane can treat typed rows as the primary source for new submissions and can reconstruct legacy `DataJson` for callers that still expect it.

### DNN/Web/Umbraco: typed-parallel

DNN, Web, and Umbraco now have typed stores/tables, but their stores return `SupportsDataJsonCollapse => false`.

Current meaning:

- typed rows can be written in parallel
- legacy `DataJson` stays the runtime read source
- `DataJson` must not be collapsed on these hosts yet
- read paths and dashboard/report paths still need further migration before typed storage can become primary

Examples from source:

- DNN: `MegaForm.DNN\Data\DnnSubmissionDataStore.cs` explicitly returns false because DNN readers still consume `DataJson`.
- Web: `MegaForm.Web\Data\EfSubmissionDataStore.cs` returns false; schema bootstrapper creates typed tables across SQL Server/PostgreSQL/MySQL/SQLite.
- Umbraco: `MegaForm.Umbraco\Data\EfSubmissionDataStore.cs` returns false; migration/bootstrapper creates typed tables, while repository reads still use `DataJson`.

Correct wording:

> DNN/Web/Umbraco are typed-parallel, not typed-primary. They have the transition/index layer, but the compatibility payload remains required.

## Current search status

Search is not JSON-only, but it is still a hybrid compatibility path.

### Oqtane

`MegaForm.Oqtane.Server\Data\EfRepositories.cs` uses:

```text
DataJson.Contains(term)
OR EXISTS MF_SubmissionFields where DisplayValue.Contains(term)
```

It also hydrates collapsed `DataJson` after paging so current dashboard/list rows keep working with typed-primary data. This is a real improvement over pure `DataJson.Contains`.

However, it is not yet a scalable typed search design:

- `DataJson.Contains(term)` remains as legacy fallback.
- `DisplayValue.Contains(term)` is still free-text `LIKE` style behavior.
- There is no field-specific typed filter API yet.
- There is no dedicated submission search index/materialized queue table yet.

### DNN

DNN has two paths:

- form-specific list uses stored procedure `usp_MF_Submission_List`, which still includes legacy search behavior in SQL scripts
- all-forms list has a text path over `MF_SubmissionValues.FieldKey/FieldValue`, plus IP/status/exact id search

DNN does have typed submission rows, but the dashboard search path is not yet a typed field-filter path over `MF_SubmissionValueString/Number/Date/Boolean`.

### Web

`MegaForm.Web\Data\DataLayer.cs` uses `MF_SubmissionValues` for free-text search over `FieldKey/FieldValue`, IP/status/exact id. It also has typed tables and a typed store, but the live search path is not yet field-specific typed search.

### Umbraco

`MegaForm.Umbraco\Data\EfRepositories.cs` still uses `DataJson.Contains(search)` in submission list. The typed tables/store exist, but the repository list path is still legacy.

### Target search direction

Do not treat free-text search and field filters as the same feature.

Field filters should query typed value tables:

```text
priority equals "High"       -> MF_SubmissionValueString
sla_due before 2026-08-01    -> MF_SubmissionValueDate
amount greater_than 100      -> MF_SubmissionValueNumber
is_vip equals true           -> MF_SubmissionValueBoolean
```

Recommended query model:

```text
SubmissionSearchQuery
  PortalId
  FormId
  Status
  DateFrom
  DateTo
  SearchText
  PageIndex
  PageSize
  SortBy
  SortDirection
  FieldFilters[]
  SelectedFieldKeys[]
```

Recommended field filter:

```text
SubmissionFieldFilter
  FieldKey
  DataType
  Operator
  Value
  ValueTo
```

Free text should move in stages:

1. Short term: search `MF_SubmissionFields.DisplayValue` with bounded counts and clear limits.
2. Medium term: add `MF_SubmissionSearchIndex` with normalized per-submission text, `PortalId`, `FormId`, `UpdatedOnUtc`.
3. Enterprise: use SQL Server full-text/provider-specific search where available.

Avoid promising large-scale search on `LIKE '%term%'` across large text columns.

## Current file status

Current source already has several important pieces:

- `MegaForm.Core\Services\FileUploadSecurityService.cs`
- `MegaForm.Core\Services\SubmissionFileMetaExtractor.cs`
- `MegaForm.Core\Interfaces\ICoreInterfaces.cs` with `IFileRepository` and `IStorageService`
- `MegaForm.Oqtane.Server\Data\EfRepositories.cs` with `EfFileRepository`
- `MegaForm.Oqtane.Server\Services\OqtaneStorageService.cs`
- `MegaForm.Oqtane.Server\Controllers\MegaFormController.SdkFiles.cs`
- `MegaForm.Oqtane.Server\Controllers\MegaFormController.cs` with `Upload/File`, `Files/Download`, image upload, PDF template upload
- `MF_Files` mapping/migration in Oqtane
- `MegaForm.Sdk\IMegaFormClient.cs` with `IFileApi.ListForSubmissionAsync` and `IFileApi.OpenAsync`
- `IInboxApi.AttachFileAsync` in the SDK

The current file lifecycle is mixed:

- public form upload is primarily a host endpoint flow
- uploaded bytes go to private disk storage under `App_Data/MegaForm/PrivateUploads`
- `SubmissionFileMetaExtractor` turns submitted File/FileUpload/PdfForm field values into `MF_Files` rows after the submission exists
- SDK can list/open existing submission files
- SDK does not yet expose a general form file upload/staging/commit API

Target direction:

```text
MegaForm.Files
  IFileUploadService
  IFileMetadataService
  IFileRepository
  IPrivateFileStorage
  IFileAuthorizationService
  IUploadPolicyService
  IFileScanner
```

Recommended SDK surface:

```text
IFileApi
  UploadAsync(formId, fieldKey, stream, fileName, contentType, scope)
  CommitUploadAsync(submissionId, uploadToken, scope)
  ListForSubmissionAsync(submissionId, scope)
  OpenAsync(submissionId, fileId, scope)
  DeleteAsync(submissionId, fileId, scope)
```

Recommended flow:

1. `UploadAsync` validates extension, MIME/content signature, size, path segment, and policy.
2. File is stored in private staging storage.
3. SDK/public submit includes upload token metadata as the field value.
4. Submission save succeeds.
5. `CommitUploadAsync` or submit pipeline creates `MF_Files` exactly once and moves/marks staged file.
6. Downloads always check actor/portal/submission/file authorization.
7. Remote storage mirroring happens asynchronously after local commit.

Local private storage should remain the source of truth. Google Drive/OneDrive/Box/etc. should be mirrors/integrations, not the only copy required for a successful form submission.

## Current integrations status

### Google Sheets

Current source status:

- Oqtane has admin settings endpoints in `MegaFormController.GoogleSheets.cs`.
- Raw service account JSON is stored as a private setting and is not returned to the browser.
- `GoogleSheetsAuthService` can validate service account JSON and test spreadsheet access.
- `GoogleSheetsNodeExecutor` is wired into workflow but intentionally does not perform outbound append/update; it returns a deterministic preview payload.

Therefore the correct claim is:

> Google Sheets auth/settings/test are real. The workflow node execution path is not yet a real provider append/update runtime.

Target package:

```text
MegaForm.Integrations.GoogleSheets
  IGoogleSheetsClient
  IGoogleSheetsAuthProvider
  GoogleSheetsConnectionProfile
  GoogleSheetsMapping
  GoogleSheetsAppendRequest
  GoogleSheetsUpdateRequest
  GoogleSheetsNodeExecutor
```

Target server APIs:

```text
TestConnectionAsync(connectionId)
TestSpreadsheetAccessAsync(connectionId, spreadsheetId)
AppendRowAsync(connectionId, spreadsheetId, range, values, idempotencyKey)
UpdateRangeAsync(connectionId, spreadsheetId, range, values, idempotencyKey)
```

Required reliability:

- retry 429/5xx with backoff
- idempotency by `submissionId + workflowRunId + nodeId`
- integration audit entry per attempt
- configurable execution mode: append once, append on every edit, update existing row
- no raw secret or secret-bearing payload in public responses

### Storage providers

Current source status:

- `MegaForm.Core\Integrations\Storage\IStorageProvider.cs`
- `MegaForm.Core\Integrations\Storage\IStorageIntegrationService.cs`
- `MegaForm.Core\Integrations\Storage\StorageIntegrationService.cs`
- `MegaForm.Core\Integrations\Storage\Providers\GoogleDriveProvider.cs`
- `StorageConnectionSettings` currently carries `AccessToken`, `RefreshToken`, `ClientSecret`, etc.

This is a good provider start, but secret ownership is not clean enough for a package boundary. Move tokens and client secrets to a secret store, and pass only `connectionId` or secret refs through public/admin surfaces.

Target:

```text
MegaForm.Integrations.Storage
MegaForm.Integrations.Storage.GoogleDrive
MegaForm.Integrations.Storage.OneDrive
MegaForm.Integrations.Storage.Box
```

Provider capabilities should be explicit:

- upload
- download
- list
- delete
- create folder
- create share link
- health check

### SaaS automation

Current source has SaaS automation abstractions/services under `MegaForm.Core\Integrations\SaasAutomation`. Those should become a provider-based integration package, not remain inside core domain.

## Current SDK status

`MegaForm.Sdk` currently exposes:

```text
IMegaFormClient
  Forms
  Submissions
  Dashboard
  SubmissionDashboard
  Inbox
  Files
  Schema
```

Current strengths:

- one public entry point
- schema parser facade
- form CRUD/list
- submission submit/find/get/update/delete
- dashboard overview
- richer submission dashboard search/detail/status
- inbox actions
- file list/open
- in-process DI support

Current gaps for the target architecture:

- submission DTOs still expose `DataJson`
- no `GetDetailTypedAsync` on `ISubmissionApi`
- no field-specific typed search/filter contract
- no partial field patch API
- no general form file upload/staging/commit API
- admin/integration/workflow design APIs are not separated into an admin SDK

Recommended consumer SDK:

```text
IMegaFormClient
  Forms
  Schema
  Submissions
  SubmissionDashboard
  Files
  Inbox
  Dashboard
```

Recommended additions:

```text
ISubmissionApi
  SubmitAsync
  GetAsync
  GetDetailTypedAsync
  SearchAsync
  PatchFieldsAsync
  UpdateStatusAsync
  DeleteAsync

IFileApi
  UploadAsync
  CommitUploadAsync
  ListForSubmissionAsync
  OpenAsync
  DeleteAsync

IInboxApi
  ClaimAsync
  ApproveAsync
  RejectAsync
  ForwardAsync
  CommentAsync
  AttachFileAsync
```

Keep `DataJson` for compatibility, but de-emphasize it in docs. When binary compatibility allows, mark JSON payload properties obsolete and route new examples through typed DTOs.

Recommended admin SDK:

```text
IMegaFormAdminClient
  ModuleConfig
  Permissions
  UploadPolicy
  Integrations
  WorkflowDesign
  Templates
  Reports
  AppStarters
```

Do not put every builder/admin/integration setting into the consumer SDK. The consumer SDK should be stable for app developers who submit/read/process form data. Admin SDK can move faster and carry privileged operations.

## Proposed target packages

### MegaForm.Abstractions

Stable cross-package primitives:

- `MegaFormScope`
- `ActorContext`
- paging/query result models
- error/result models
- idempotency primitives
- cancellation/options primitives
- lightweight DTO contracts

Rules:

- no EF dependency
- no Oqtane/DNN/Umbraco dependency
- minimal ASP.NET dependency
- avoid tying all abstractions to Newtonsoft if practical

### MegaForm.Schema

Schema and field semantics:

- form schema models
- field metadata
- field type semantics
- schema flattening
- display value formatting
- required/validation metadata
- typed storage classification

Move `SubmissionFieldTypeSemantics` toward this package as a single source of truth for all hosts, SDK, reports, files, and typed query logic.

### MegaForm.Submissions

Submission domain:

- submit command service
- typed data reader
- typed store contract
- search/query service
- field patch service
- legacy `DataJson` adapter
- backfill/resync service
- search index builder

Candidate contracts:

```text
ISubmissionCommandService
ISubmissionQueryService
ISubmissionDataReader
ITypedSubmissionStore
ISubmissionSearchService
ISubmissionBackfillService
ISubmissionFieldPatchService
ISubmissionSearchIndex
```

Compatibility rule:

- `DataJson` remains as compatibility payload.
- typed rows become the preferred domain model.
- collapse is host-by-host and only after read path verification.

### MegaForm.Files

File lifecycle:

- upload validation
- upload policy
- private storage
- staging/commit
- metadata extraction
- `MF_Files` repository
- download authorization
- delete/audit hooks
- optional scanner hook

Do not leave file upload as host-only controller behavior. SDK users should be able to upload files without calling raw `/Upload/File`.

### MegaForm.Security

Security and policy:

- `ICurrentActorAccessor`
- `ISubmissionAuthorizationService`
- `IRecordVisibilityPolicy`
- `IFieldSecurityPolicy`
- `IFileAuthorizationService`
- `ISecretStore`
- `ISecretProtector`
- `IConnectionProfileStore`
- `IAuditLog`

Policy should be called consistently from:

- controllers
- SDK methods
- file downloads
- dashboard/search/detail
- workflow task actions
- integration execution

### MegaForm.Workflow

Workflow domain:

- workflow definitions
- workflow runtime
- task/case repository contracts
- task actions
- approval/human task
- comments/history
- workflow event audit
- node executor interfaces

Node executors should depend on integration providers and connection profiles, not host controllers or host settings.

### MegaForm.Integrations.Abstractions

Common integration layer:

- `IIntegrationProvider`
- `IConnectionProfile`
- `IConnectionProfileStore`
- `ISecretStore`
- `IOutboundJobQueue`
- `IIntegrationAuditStore`
- `IIdempotencyStore`
- `IntegrationResult`
- retry/backoff policy
- health check contract

Recommended production flow:

```text
Submission saved
  -> workflow schedules integration job
  -> outbox worker executes provider
  -> result/audit is attached to submission/workflow run
  -> retry uses idempotency key
```

Default should be async outbox. Synchronous external API calls should be an explicit form/workflow option.

### Host adapters

Keep host-specific projects focused on:

- DI registration
- migrations/schema bootstrap
- HTTP controllers/endpoints
- host identity/portal context adapters
- host storage adapters
- host settings adapters
- static assets/package integration

Target names can be debated, but the dependency direction should be:

```text
MegaForm.Host.Oqtane
MegaForm.Host.Dnn
MegaForm.Host.Umbraco
MegaForm.Host.AspNetCore
  -> MegaForm.Sdk
  -> MegaForm.Submissions
  -> MegaForm.Files
  -> MegaForm.Workflow
  -> MegaForm.Integrations.*
  -> MegaForm.Security
  -> MegaForm.Schema
  -> MegaForm.Abstractions
```

Domain packages must not reference host packages.

## Support ticket app implication

A support ticket app should be buildable using SDK/domain services, not private controller behavior.

Target flow:

```text
Submit ticket
  -> Files.UploadAsync for attachments
  -> Submissions.SubmitAsync
  -> Files.CommitUploadAsync after save
  -> Workflow creates support queue task
  -> Notifications
  -> optional Google Sheets/CRM outbox job

My tickets
  -> Submissions.SearchAsync with private-own visibility
  -> GetDetailTypedAsync
  -> file download via authorized file API

Support queue
  -> SubmissionDashboard.SearchAsync with typed filters
  -> Inbox task actions
  -> PatchFieldsAsync for status/priority/assignee/SLA
```

Ticket-specific features should sit on top of typed fields and workflow:

- status: new/open/waiting_customer/resolved/closed/reopened
- priority/category/assignee
- public reply vs internal note
- SLA due date and overdue filters
- secure attachments
- integration outbox for Google Sheets/CRM/helpdesk systems

These should not require parsing `DataJson` in app code.

## Migration roadmap

### Phase 0 - accept boundary and wording

Deliverables:

- accept this document as direction
- stop describing MegaForm as JSON-only
- document Oqtane as typed-primary/collapse-friendly
- document DNN/Web/Umbraco as typed-parallel
- decide public SDK vs admin SDK boundary
- decide package names

No runtime behavior change.

### Phase 1 - extract stable abstractions

Move stable contracts/models first:

- `MegaForm.Abstractions`
- `MegaForm.Schema`
- `MegaForm.Security` contracts
- `MegaForm.Integrations.Abstractions`

Rules:

- keep runtime behavior unchanged
- use compatibility wrappers/type forwarding where useful
- hosts compile with minimal edits
- no controller rewrite yet

### Phase 2 - typed submission API/search

Deliverables:

- typed detail DTOs in SDK
- `GetDetailTypedAsync`
- field-specific filters over typed value tables
- selected field projection for dashboards
- optional `MF_SubmissionSearchIndex`
- backfill/resync command per host

Host policy:

- Oqtane stays typed-primary/collapse-friendly.
- DNN/Web/Umbraco stay typed-parallel until typed read paths pass QA.
- Do not delete `DataJson`.

### Phase 3 - files package and upload SDK

Deliverables:

- `MegaForm.Files`
- general `Files.UploadAsync`
- staging/commit model
- local private storage abstraction
- download authorization service
- file delete and audit
- exactly-once `MF_Files` row creation

Acceptance:

- SDK consumer can submit a form with attachments without calling raw `/Upload/File`.
- user cannot download another user's private file.
- failed remote storage mirror does not fail the saved submission.

### Phase 4 - security/secrets hardening

Deliverables:

- `ISecretStore`
- `ISecretProtector`
- `IConnectionProfileStore`
- centralized submission/file authorization
- metadata-only connection profile responses
- audit service for security-sensitive actions

Rules:

- raw service account JSON/tokens/client secrets never return to browser or SDK
- SDK receives connection ids, not raw credentials
- providers unprotect secrets only during server-side execution

### Phase 5 - real integrations/outbox

Deliverables:

- `IOutboundJobQueue`
- integration retry/backoff
- idempotency store
- integration audit
- real Google Sheets append/update provider
- storage mirror provider
- SaaS provider split

Acceptance:

- Google Sheets push can be tested and executed.
- Google downtime does not break submit unless sync mode is explicitly required.
- every external call has audit/result status.
- retry is idempotent.

### Phase 6 - host controller thinning

Deliverables:

- Oqtane controller actions delegate to domain services.
- DNN/Web/Umbraco reuse the same domain services.
- host controllers become adapters, not business logic owners.
- package tests cover behavior without requiring UI/controller tests for every change.

Acceptance:

- adding a new submission feature does not require copying logic across all host controllers
- permission/file/search behavior is consistent across SDK and HTTP paths
- host-specific code is mostly context, routing, storage, migration, and packaging

## Non-goals

- Do not delete `DataJson` immediately.
- Do not collapse `DataJson` on DNN/Web/Umbraco until their read paths are proven.
- Do not call the current search implementation fully scalable.
- Do not leave file upload as host-only endpoint behavior forever.
- Do not put all admin/builder APIs into the consumer SDK.
- Do not execute remote integrations synchronously by default.
- Do not let provider packages read host settings directly.
- Do not let file download depend only on a raw relative path.

## Acceptance checklist

Use this before calling the split complete:

- Oqtane new submissions store/reconstruct data from typed rows.
- DNN/Web/Umbraco typed-parallel writes are verified and documented.
- SDK exposes typed submission detail without requiring `DataJson` parsing.
- field filters run on typed value tables or a search index.
- free-text search limits are documented.
- `Files.UploadAsync` exists and follows staged upload/commit.
- file download checks portal/user/owner/role visibility.
- `MF_Files` rows are created exactly once per submitted upload.
- Google Sheets provider performs real append/update through a provider contract.
- integration jobs have retry, idempotency, audit, and secret isolation.
- raw service account JSON/access tokens are never returned to browser or SDK.
- host controllers delegate to domain services.
- support ticket app can be built using SDK/domain services instead of private controller behavior.

## Files reviewed

Core/typed storage:

- `MegaForm.Core\Models\TypedSubmissionEntities.cs`
- `MegaForm.Core\Interfaces\ISubmissionDataStore.cs`
- `MegaForm.Core\Services\SubmissionProcessor.cs`
- `MegaForm.Core\Services\SubmissionQueryService.cs`
- `MegaForm.Core\Services\TypedSubmission\SubmissionDataResolver.cs`
- `MegaForm.Core\Services\TypedSubmission\SubmissionFieldNormalizer.cs`
- `MegaForm.Core\Services\TypedSubmission\SubmissionFieldTypeSemantics.cs`
- `MegaForm.Core\Services\TypedSubmission\LegacySubmissionBackfillService.cs`

Host storage/search:

- `MegaForm.Oqtane.Server\Data\EfSubmissionDataStore.cs`
- `MegaForm.Oqtane.Server\Data\EfRepositories.cs`
- `MegaForm.Oqtane.Server\Data\MegaFormDbContext.cs`
- `MegaForm.Oqtane.Server\Migrations\01060039_AddTypedSubmissionStorage.cs`
- `MegaForm.DNN\Data\DnnSubmissionDataStore.cs`
- `MegaForm.DNN\Data\FormRepository.cs`
- `MegaForm.Web\Data\EfSubmissionDataStore.cs`
- `MegaForm.Web\Data\DataLayer.cs`
- `MegaForm.Web\Data\TypedSubmissionSchemaBootstrapper.cs`
- `MegaForm.Umbraco\Data\EfSubmissionDataStore.cs`
- `MegaForm.Umbraco\Data\EfRepositories.cs`
- `MegaForm.Umbraco\Data\TypedSubmissionSchemaBootstrapper.cs`
- `MegaForm.Umbraco\Migrations\AddTypedSubmissionTablesMigration.cs`

SDK/files:

- `MegaForm.Sdk\IMegaFormClient.cs`
- `MegaForm.Sdk\MegaFormClient.cs`
- `MegaForm.Sdk\Dtos.cs`
- `MegaForm.Core\Interfaces\ICoreInterfaces.cs`
- `MegaForm.Core\Services\FileUploadSecurityService.cs`
- `MegaForm.Core\Services\SubmissionFileMetaExtractor.cs`
- `MegaForm.Oqtane.Server\Controllers\MegaFormController.SdkFiles.cs`
- `MegaForm.Oqtane.Server\Controllers\MegaFormController.cs`
- `MegaForm.Oqtane.Server\Services\OqtaneStorageService.cs`

Integrations/workflow/security:

- `MegaForm.Core\Workflow\GoogleSheetsNodeExecutor.cs`
- `MegaForm.Core\Services\GoogleSheetsAuthService.cs`
- `MegaForm.Oqtane.Server\Controllers\MegaFormController.GoogleSheets.cs`
- `MegaForm.Oqtane.Server\Services\OqtaneGoogleAuthSettings.cs`
- `MegaForm.Core\Integrations\Storage\IStorageProvider.cs`
- `MegaForm.Core\Integrations\Storage\IStorageIntegrationService.cs`
- `MegaForm.Core\Integrations\Storage\StorageIntegrationService.cs`
- `MegaForm.Core\Integrations\Storage\StorageModels.cs`
- `MegaForm.Core\Integrations\Storage\Providers\GoogleDriveProvider.cs`
- `MegaForm.Core\Integrations\SaasAutomation\ISaasAutomationService.cs`
- `MegaForm.Core\Integrations\SaasAutomation\SaasAutomationService.cs`

Related docs:

- `Docs\AUDIT_API_SDK_VS_CODE_2026-07-19.md`
- `Docs\AUDIT_CODEX_ROUND3_TYPED_STORAGE_REMAINING_2026-07-18.md`
- `Docs\AUDIT_TYPED_STORAGE_KIMI_P1P2P3_2026-07-18.md`
- `Docs\HANDOUT_TYPED_SUBMISSION_STORAGE_CORE_DELIVERY_2026-07-17.md`

## Final recommendation

Proceed with the subproject split, but use the existing typed-storage transition as the guardrail.

Recommended order:

1. Extract stable contracts/schema/security/integration abstractions.
2. Add typed SDK detail/search/field filters before removing any compatibility.
3. Move file lifecycle into `MegaForm.Files` and expose SDK upload.
4. Add secure secret store and connection profiles.
5. Implement Google Sheets/storage/SaaS providers through outbox/retry/audit.
6. Thin host controllers last.

This path keeps MegaForm compatible with current deployments while moving it toward a maintainable platform API: typed submissions for scale, secure files, real integrations, a clean SDK, and host adapters that are much easier to reason about.
