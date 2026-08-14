# Audit API SDK cho Dashboard, Inbox, Workflow va ERP/CRM Integration

**Ngay:** 2026-07-13  
**Pham vi doc source:** `MegaForm.Sdk`, `MegaForm.Core`, API controllers cua DNN/Oqtane/Web, cac tai lieu SDK hien co trong `Docs/`.  
**Rang buoc:** audit tai lieu, khong sua code runtime.

---

## 1. Ket luan ngan

SDK hien tai la mot facade tot cho **CRUD form co ban, submit/update/delete submission co ban, list/download files va parse schema field metadata**. Tuy nhien, neu muc tieu la de khach hang tu phat trien:

- dashboard tong quan,
- submission dashboard day du,
- inbox xu ly approval,
- goi/quan sat workflow,
- tich hop dashboard ERP/CRM ben ngoai,

thi **SDK chua du**. Ly do chinh: cac nang luc quan trong da ton tai rai rac trong Core service va host controller, nhung **chua duoc dong goi thanh public SDK contract on dinh**, va **chua co remote API client/auth/OpenAPI chuan cho ung dung ben ngoai process**.

Muc do san sang hien tai:

| Nhom nang luc | Backend/Core co nen tang? | SDK public co du? | Danh gia |
|---|---:|---:|---|
| Form CRUD co ban | Co | Gan du | Dat muc starter |
| Submit/update/delete submission co ban | Co | Co ban | Chua du cho dashboard |
| Submission dashboard/filter/detail/export | Co mot phan trong Core + host APIs | Chua | Gap lon |
| Dashboard metrics/forms overview | Co trong Reports controllers | Chua | Gap lon |
| Inbox/human task workflow | Co trong Core + Oqtane/Web endpoints | Chua | Gap rat lon |
| Workflow authoring/runtime/library | Co nhieu nen tang | Chua | Gap rat lon |
| ERP/CRM external integration | Co webhook node/outbound integrations mot phan | Chua co inbound/public contract | Gap rat lon |
| Remote API auth/OpenAPI/versioning | Co mot phan o Web/AspNetCore | Chua thong nhat cross-host | Gap P0 cho khach hang ngoai |

---

## 2. SDK hien tai dang expose gi

Nguon chinh:

- `MegaForm.Sdk/IMegaFormClient.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/ServiceCollectionExtensions.cs`

`IMegaFormClient` hien chi co 4 nhom:

| Surface | Methods chinh | Nhan xet |
|---|---|---|
| `Forms` | Create/Get/List/Delete/Update form | Tot cho form CRUD co ban, nhung `FormDto` con mong. |
| `Submissions` | Find/Get/Submit/Update/Delete | Co du submit co ban, nhung query/detail con qua it cho dashboard. |
| `Files` | ListForSubmission/Open | Chi doc/list/download; chua co upload/signed URL/permission envelope cho external client. |
| `Schema` | Parse/ParseForm | Tot hon tai lieu cu; da expose typed field metadata co ban. |

`MegaFormScope` chi gom `PortalId` va `UserId`. No chua mang du actor context nhu roles, permissions, claims, tenant/site alias, API client id, integration id.

---

## 3. Nhung nang luc backend da co nhung SDK chua boc ra

### 3.1 Submission query/detail giau hon SDK

Core da co `SubmissionQueryService` voi:

- list theo `FormId`, `Status`, `Search`, `DateFrom`, `DateTo`, page/pageSize;
- list item co `FormTitle`, `SummaryText`, `ReadOnUtc`, `IpAddress`, `SpamScore`, `DataJson`;
- detail co `Submission`, `Form`, `Schema`, `Files`, `FlattenedValues`, `FieldSnapshots`, `WorkflowDetail`.

Trong khi do `MegaFormClient.FindAsync` hien chi truyen `FormId`, `Status`, page/pageSize vao repository va bo trong `Search`, `DateFrom`, `DateTo`, summary, files, workflow detail. Day la gap truc tiep cho submission dashboard va ERP/CRM dashboard.

### 3.2 Inbox va human task workflow da co Core service

`WorkflowTaskService` da co cac thao tac:

- `GetInbox`
- `GetWorkboard`
- `GetTask`
- `CreateAdHocReviewTask`
- `ClaimTaskAsync`
- `ApproveTaskAsync`
- `RejectTaskAsync`
- `ForwardTaskAsync`
- `CommentTaskAsync`

Oqtane/Web da co endpoint tuong ung (`Workflow/MyInbox`, `Workflow/Tasks/Claim`, `Approve`, `Reject`, `Forward`, `Comment`, `SendSubmission`). Nhung SDK khong co `Inbox`/`WorkflowTasks` API nao. Khach hang dung SDK khong the build inbox chuan ma khong goi thang host HTTP endpoint hoac dung Core noi bo.

Luu y DNN: route mapper co khai bao `Workflow/Inbox` va `Workflow/Tasks/*`, nhung source hien doc duoc trong `WorkflowApiController.cs` chu yeu la workflow authoring (`Get`, `SaveDraft`, `Validate`, `Apply`, `TestRun`) va khong thay action runtime task trong file nay. Can verify/fix parity truoc khi cong bo DNN la du workflow inbox API.

### 3.3 Workflow engine/library da co nen, SDK chua co

Core co:

- `IWorkflowEngine`: execute, evaluate navigation, get execution status, resume, cancel, check executable workflow.
- `IWorkflowRepository`: envelope draft/applied, execution, case, task, task actions.
- `IWorkflowEvaluator`: validate/evaluate definition.
- `IWorkflowLibraryRepository`: template, version, mapping, apply to form, clear mapping, count forms using template.

Oqtane co `MegaFormController.WorkflowLibrary.cs` expose workflow library endpoints. DNN/Web parity cho workflow library chua ro/khong thay day du trong lan doc nay. SDK khong expose workflow library/runtime/status/action API.

### 3.4 Reporting/dashboard endpoints da co nhung khong nam trong SDK

DNN/Web Reports controllers co:

- Reports list/get/save/delete.
- `FormsOverview`: per-form all-time count, recent window count, series.
- `SubmissionData`: project data tu `MF_SubmissionValues`.
- `Backfill`: index submission values.

Nhung SDK chi tra `SubmissionCount` trong `FormDto` va khong co dashboard summary/trend/report query API.

---

## 4. Gap quan trong neu khach hang muon tu build dashboard/ERP/CRM

### P0 - Thieu remote API contract cho ung dung ngoai process

SDK hien tai la **in-process facade** can DI/repositories cua MegaForm host. No phu hop module/plugin/chay trong cung ung dung, nhung chua phu hop cho ERP/CRM dashboard doc lap.

Can bo sung:

| Thieu | Cach bo sung |
|---|---|
| HTTP client package | Tao package rieng kieu `MegaForm.Api.Client` hoac `MegaForm.RemoteClient` goi REST endpoints. |
| Auth cho external client | API key, OAuth2 client credentials hoac JWT bearer, kem scope theo portal/form/action. |
| OpenAPI | Xuat OpenAPI cho Forms/Submissions/Inbox/Workflow/Reports/Integrations, khong chi Swagger dev cua Web host. |
| Versioning | Route/version contract, vi du `/api/v1/...`; changelog breaking changes. |
| Error envelope | Loi co `code`, `message`, `details`, `traceId`, `fieldErrors`, khong tra string/ex.Message tuy y. |
| Rate limit/audit | Per API client, per portal, audit all data export/mutation. |

### P0 - Thieu SDK cho inbox/workflow tasks

Khach hang muon build inbox can cac API:

| Can cho inbox | Hien trang |
|---|---|
| My Inbox board: incoming/in-progress/completed/KPI | Co host endpoints Oqtane/Web, SDK chua co |
| Task detail | Co service, SDK chua co |
| Claim/Approve/Reject/Forward/Comment | Co service + endpoints Oqtane/Web, SDK chua co |
| Send submission to inbox | Co `CreateAdHocReviewTask`, SDK chua co |
| Directory/assignee lookup | Co Oqtane/Web endpoint, SDK chua co |
| Submitter + file + workflow timeline | Co mot phan qua submission detail, can contract hoa |

De bo sung, nen them surface `Inbox` hoac `WorkflowTasks` vao SDK:

| Surface de xuat | Operations |
|---|---|
| `Inbox` | GetMyInbox, GetInbox, GetTask, Claim, Approve, Reject, Forward, Comment, SendSubmission, GetDirectory |
| DTO | `InboxBoardDto`, `InboxTaskDto`, `TaskActionRequest`, `TaskActionResult`, `TaskTimelineDto` |

### P1 - Submission dashboard query con yeu

`SubmissionQuery` cua SDK chi co `FormId`, `Status`, `Page`, `PageSize`. Mot dashboard that su can:

- search full text;
- date range;
- read/unread;
- spam/non-spam;
- sort by submitted/status/field value;
- field filters: contains, exact, empty, before/after/between;
- query multi-form/app-scope;
- include/exclude raw `DataJson`;
- include files count, workflow state, assigned task;
- cursor pagination cho sync lon;
- bulk operations;
- export CSV/JSON/XLSX.

De bo sung, nen thay the/bo sung `SubmissionSearchQuery` va `SubmissionDashboard` surface dung lai `SubmissionQueryService` va `MF_SubmissionValues`.

### P1 - Submission detail chua du cho khach hang ben ngoai

SDK `GetAsync` tra `SubmissionDto` mong: raw `DataJson`, status, spam, user, timestamp. Dashboard/ERP can:

- field snapshots voi label/type/display value;
- flattened values theo schema;
- uploaded files metadata + signed download URL;
- workflow detail/timeline/tasks/actions;
- audit history: status changes, edits, comments;
- permissions/action availability;
- related records/app context.

De bo sung: `GetDetailAsync(submissionId, includeFiles, includeWorkflow, includeAudit)` tra `SubmissionDetailDto`.

### P1 - Dashboard metrics/reporting chua co SDK

Customer dashboard can:

- form overview counts and trends;
- submission trend by day/week/month;
- status breakdown;
- spam rate;
- completion/field fill rate;
- workflow SLA: pending/overdue/completed;
- conversion/abandonment neu co journey data;
- saved report definitions va report runtime query.

Hien `ReportsController.FormsOverview` va `SubmissionData` da la nen tang tot, nen boc vao `Dashboard`/`Reports` SDK surface thay vi de customer goi endpoint rieng tung host.

### P1 - Form DTO con mong cho custom builder/dashboard

`FormDto` hien co: `FormId`, `PortalId`, `Title`, `Description`, `Status`, `SchemaJson`, `RequireAuth`, `SubmissionCount`.

Can them/hoac co `FormDetailDto`:

- `SettingsJson`, `ThemeJson`, `WorkflowJson`/workflow binding;
- submit button text, success message, redirect URL;
- created/updated/published timestamps;
- app scope/view config/module config;
- permissions summary;
- field count, file fields, payment/workflow flags;
- selected theme/preset;
- external binding metadata.

Khong nen lam `FormDto` qua nang neu so break contract; co the them `GetFormDetailAsync`.

### P1 - File API chua du cho external dashboard

SDK co list/open bytes. External dashboard/ERP can:

- upload staged file truoc submit;
- attach file vao submission/task/comment;
- signed download URL het han;
- thumbnail/preview metadata;
- virus scan/quarantine state;
- permission-aware download;
- file retention/delete.

QA DNN ngay 2026-07-13 con thay bug runtime: file upload submit luu ten file trong `DataJson` nhung khong tao row `MF_Files` tren DNN. Day khong phai chi la SDK gap; no can fix runtime de `IFileApi.ListForSubmissionAsync` tin cay cross-host.

### P1 - ERP/CRM integration thieu contract dong bo

Outbound workflow webhook co nen tang, nhung ERP/CRM dashboard can them:

| Can cho ERP/CRM | De xuat |
|---|---|
| Delta sync | `GetChanges(sinceCursor)` / cursor pagination theo portal/form/app. |
| Webhook subscriptions | CRUD webhook subscription, event types, retry policy, signing secret. |
| Event envelope | `submission.created`, `submission.updated`, `status.changed`, `workflow.task.created`, `workflow.task.completed`, `file.added`. |
| Idempotency | `Idempotency-Key` cho submit/update/task action. |
| External IDs | Map `externalSystem`, `externalRecordId`, sync status, last sync error. |
| Field mapping | Saved mappings MegaForm field -> ERP/CRM field. |
| Conflict handling | Last-write policy, ETag/row version, sync audit. |
| Bulk export | Streamed export + async job for large tenants. |

Nen them surface `Integrations` va co outbox table/event dispatcher thay vi chi goi webhook trong workflow node.

### P2 - Permission/actor model chua du

`MegaFormScope { PortalId, UserId }` khong du de quyet dinh:

- role queue/claimable task;
- permission view/manage/delete/export;
- API client scopes;
- impersonation/system actor;
- row-level security (`own`, assignee, workflow participant);
- audit actor display/email.

Can bo sung `MegaFormActorContext`/`MegaFormRequestContext` noi bo va DTO action availability trong responses.

### P2 - Docs SDK bi lech voi source

`MegaForm.Sdk/README.md` van noi `Submissions` chi co `FindAsync`, `GetAsync`, trong khi interface hien da co `SubmitAsync`, `UpdateAsync`, `DeleteAsync`. Mot so docs cu con ghi host chua wire SDK; source hien tai cho thay Oqtane/Web da `AddMegaFormSdk()`, DNN co ambient service locator. Can cap nhat docs de khach hang khong hieu sai.

---

## 5. API SDK surface de xuat

Nen giu `IMegaFormClient` nho gon, nhung mo rong theo module nghiep vu:

| Surface | Muc dich |
|---|---|
| `Forms` | Form CRUD + form detail/settings/theme/workflow binding. |
| `Schema` | Parse schema, data shape, validation metadata, field helpers. |
| `Submissions` | Submit/get/update/delete co ban. |
| `SubmissionDashboard` | Search/filter/sort/detail/export/bulk/status/read/spam. |
| `Files` | Upload/list/open/signed URL/attach/delete. |
| `Dashboard` | Forms overview, metrics, trends, status breakdown, workflow SLA. |
| `Inbox` | My inbox/workboard/task actions/send to inbox/directory. |
| `Workflows` | Get/save draft/validate/apply/run/status/resume/cancel/executions. |
| `WorkflowLibrary` | Templates/versions/apply-to-form/mappings. |
| `Reports` | Report definitions + runtime report queries. |
| `Integrations` | Webhook subscriptions/events/delta sync/external IDs/idempotency. |
| `Permissions` | Capabilities/action availability for current actor. |
| `Audit` | Submission/task/workflow status history. |

Dong thoi nen tach 2 package:

| Package | Dung cho |
|---|---|
| `MegaForm.Sdk` | In-process code trong host/module/plugin, dung DI/Core service. |
| `MegaForm.Api.Client` | External ERP/CRM/dashboard app goi HTTP API bang API key/OAuth/JWT. |

---

## 6. Roadmap bo sung khuyen nghi

### Phase 1 - Biet hoa submission dashboard tu Core san co

Khong can DB change lon:

- Boc `SubmissionQueryService.List/GetDetail` vao SDK.
- Mo rong `SubmissionQuery` thanh `SubmissionSearchQuery`.
- Them `SubmissionListItemDto`, `SubmissionDetailDto`.
- Expose files, field snapshots, flattened values, workflow detail.
- Them contract tests cho list/search/date/detail/files.

### Phase 2 - Inbox/workflow task SDK

- Boc `WorkflowTaskService` vao `Inbox` surface.
- Chuan hoa DTO thay vi tra thang Core model.
- Them action availability de UI biet task nao claim/approve/reject/forward duoc.
- Fix/verify DNN parity cho `Workflow/MyInbox` va `Workflow/Tasks/*`.
- Them tests cho role queue, assigned user, approve/reject/forward/comment.

### Phase 3 - Dashboard/reports SDK

- Boc `ReportsController.FormsOverview` thanh Core service chung, khong de logic rieng trong controller.
- Them metrics query: days, appScope, formIds, status, includeSpam.
- Them saved reports API va export job.
- Dung `MF_SubmissionValues` cho field filter/report projection.

### Phase 4 - Remote public API layer

- Chuan hoa REST endpoints cross-host DNN/Oqtane/Web/Umbraco.
- Xuat OpenAPI official.
- Them auth: API key/OAuth2/JWT, scopes, API client management.
- Them error envelope, idempotency key, trace id, rate limit, audit log.
- Sinh `MegaForm.Api.Client` tu OpenAPI hoac viet typed client thu cong.

### Phase 5 - ERP/CRM integration layer

- Them event/outbox table va retry worker.
- Webhook subscription CRUD + HMAC signing.
- Delta sync cursor.
- External ID mapping.
- Field mapping templates cho Salesforce/Dynamics/HubSpot/ERP custom.
- Bulk export async job cho tenant lon.

### Phase 6 - Workflow library parity va governance

- Dua `IWorkflowLibraryRepository` vao SDK.
- Kiem tra Oqtane/Web/DNN/Umbraco parity.
- Version pin/auto-update contract cho workflow template.
- Audit trail khi apply template vao form.

---

## 7. Acceptance criteria: khi nao co the noi SDK du cho customer dashboard?

Chi nen cong bo "SDK/API du cho customer dashboard va ERP/CRM integration" khi dat cac tieu chi sau:

1. External app co the dang nhap bang API key/OAuth/JWT, khong can chay trong MegaForm process.
2. Co OpenAPI official va typed remote client.
3. Dashboard lay du forms overview, trends, counts, status breakdown.
4. Submission dashboard list/filter/search/sort/paginate/detail/export duoc bang SDK/API.
5. Submission detail co schema display values, files, workflow timeline, audit history.
6. Inbox lay incoming/in-progress/completed, task detail va claim/approve/reject/forward/comment duoc bang SDK/API.
7. Workflow co get/save draft/validate/apply/run/status/resume/cancel/executions.
8. ERP/CRM co delta sync, webhook subscription, event signing, idempotency, external IDs.
9. Permission/row-level security va audit log chay dong nhat DNN/Oqtane/Web/Umbraco.
10. DNN/Oqtane/Web/Umbraco endpoint parity duoc test bang contract tests.

---

## 8. Danh sach gap uu tien

| Priority | Gap | Tac dong |
|---|---|---|
| P0 | Khong co remote API client/auth/OpenAPI cross-host | ERP/CRM dashboard ben ngoai khong co contract chuan de tich hop |
| P0 | SDK khong expose inbox/workflow task actions | Khach hang khong tu build approval inbox bang SDK |
| P1 | Submission dashboard query/detail qua mong | Dashboard phai tu parse `DataJson`, thieu file/workflow/field snapshots |
| P1 | Dashboard metrics/reporting khong nam trong SDK | Khach hang phai goi endpoint rieng tung host |
| P1 | Workflow runtime/library khong nam trong SDK | Khong goi/monitor workflow day du |
| P1 | File API thieu upload/signed URL/attach metadata; DNN file metadata can fix | Dashboard/file integration khong tin cay |
| P1 | DTO form/submission thieu settings/theme/workflow/permissions/audit | Custom UI/ERP mapping bi thieu context |
| P2 | Permission actor context con mong | RLS/action availability de sai neu chi co PortalId/UserId |
| P2 | Docs SDK lech voi source | Khach hang hieu sai kha nang SDK |

---

## 9. Khuyen nghi thiet ke ngay lap tuc

1. Dung `SubmissionQueryService` lam nguon chuan cho SDK dashboard thay vi `MegaFormClient.FindAsync` goi repository truc tiep.
2. Khong expose raw Core entities lam public contract; tao DTO rieng cho SDK/API.
3. Tach in-process SDK va remote HTTP API client.
4. Viet contract tests cross-host cho Oqtane/Web/DNN truoc khi cong bo external API.
5. Chuan hoa error envelope, auth, permission va audit truoc khi mo API cho ERP/CRM.
6. Sua/cap nhat docs SDK ngay: current source da vuot qua tai lieu cu.

---

## 10. File/source evidence da kiem tra

- `MegaForm.Sdk/IMegaFormClient.cs` - public entry point hien co.
- `MegaForm.Sdk/MegaFormClient.cs` - facade dang map thang sang repositories; `FindAsync` chua dung `SubmissionQueryService`.
- `MegaForm.Sdk/Dtos.cs` - `FormDto`, `SubmissionDto`, `SubmissionQuery`, `MegaFormScope`.
- `MegaForm.Core/Models/SubmissionQueryModels.cs` - list/detail contracts giau hon SDK.
- `MegaForm.Core/Services/SubmissionQueryService.cs` - search/date/detail/files/snapshots.
- `MegaForm.Core/Services/WorkflowTaskService.cs` - inbox/task action operations.
- `MegaForm.Core/Services/SubmissionWorkflowDetailService.cs` - workflow detail/timeline payload.
- `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs` - workflow engine/repository/evaluator contracts.
- `MegaForm.Core/Interfaces/IWorkflowLibraryRepository.cs` - reusable workflow library contract.
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` - Oqtane inbox/task endpoints.
- `MegaForm.Web/Controllers/WorkflowController.cs` - Web inbox/task endpoints.
- `MegaForm.DNN/WebApi/WorkflowApiController.cs` - DNN workflow authoring endpoints; runtime inbox/task action parity can xac minh them.
- `MegaForm.DNN/WebApi/MegaFormApiController.cs` - DNN submissions endpoints va route mapper.
- `MegaForm.Web/Controllers/ReportsController.cs` va `MegaForm.DNN/WebApi/ReportApiController.cs` - dashboard/reporting endpoints.
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowLibrary.cs` - Oqtane workflow library endpoints.
