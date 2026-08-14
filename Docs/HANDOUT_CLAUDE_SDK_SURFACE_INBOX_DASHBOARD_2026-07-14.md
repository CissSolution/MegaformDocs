# HANDOUT cho Claude Code - SDK dashboard / submission dashboard / inbox facade

Ngay dung: 2026-07-14

Thu muc code:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`

## Muc tieu cua user

User muon bo sung SDK/API facade o muc same-host, chua can remote API, de khach hang co the tu code:

- dashboard tong quan form/submission
- submission dashboard: search, detail, update status
- inbox/workflow dashboard: xem workboard, claim, approve, reject, forward, comment
- attach files trong inbox/workflow nhu inbox chuan

Yeu cau quan trong: **minimal change**, khong viet remote controller moi luc nay, khong refactor lon.

## Audit Codex 2026-07-14 - muc tieu API dashboard/card/grid/inbox

Pham vi audit nay: **khong sua code**, chi doc handout + doi chieu source SDK hien tai de tra loi cau hoi "Claude da sua OK chua?" theo muc tieu: developer co the dung API de tu viet card view, grid view, submission dashboard, dashboard va inbox rieng cho data submission cua bat ky form nao.

### Ket luan ngan

**Chua the ket luan la OK hoan toan.** Claude/SDK da lam dung phan buildability va public facade surface:

- `dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj -f net8.0 -v:minimal -clp:ErrorsOnly` pass ngay 2026-07-14, 0 error.
- `dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj -v:minimal -clp:ErrorsOnly` pass ngay 2026-07-14, 0 error.
- `dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj -v:minimal -clp:ErrorsOnly` pass ngay 2026-07-14: 49 passed, 0 failed.
- Public API baseline hien tai du de build pass.
- API surface da co: `Dashboard`, `SubmissionDashboard`, `Inbox`.

Nhung theo muc tieu **"submission cua bat ky form nao" + "custom inbox rieng qua API"**, con it nhat 3 gap phai xu ly truoc khi giao cho khach/developer dung that:

1. **Critical - `SubmissionDashboard.SearchAsync` voi `FormId = 0` van sai paging/total tren multi-portal.**
   Source hien tai van goi `SubmissionQueryService.List(...)` truoc, sau do moi `.Where(item => query.FormId > 0 || IsFormInPortal(item.FormId, portalId))`. Nghia la filter portal sau khi da paging. `TotalCount` trong all-forms mode lai la `items.Count`, khong phai tong dung. Ket qua: custom grid/card "tat ca form" co the mat data hoac bao het trang qua som.

2. **High - Inbox facade chua loc portal theo `MegaFormScope.PortalId` o board/action surface.**
   `GetMyInboxAsync`, `GetTaskAsync`, `ClaimAsync`, `ApproveAsync`, `RejectAsync`, `ForwardAsync`, `CommentAsync` dang dua vao workflow actor visibility, nhung chua filter task theo form/submission portal. Neu same host co nhieu portal/site va cung username/role, custom inbox co rui ro hien/action task ngoai portal. `AttachFileAsync` co check submission portal, nhung cac action khac chua co guard tuong duong.

3. **High - `SendSubmissionAsync` chua guard form/submission/portal pair trong SDK layer.**
   Method hien goi thang `WorkflowTaskService.CreateAdHocReviewTask(request.FormId, request.SubmissionId, ...)`. Can check `IsFormInPortal` + `IsSubmissionInPortal` + submission dung form truoc khi tao task, neu khong custom code co the tao inbox task sai portal/sai form.

### Nhung gi da du dung cho card/grid theo tung form

Phan nay co the coi la dat muc tieu **toi thieu** cho developer viet UI same-host:

- Card/list theo tung form: `SubmissionDashboard.SearchAsync(new SubmissionSearchQuery { FormId = <id> })` tra `SubmissionListItemDto` co `SubmissionId`, `FormId`, `FormTitle`, `Status`, `SubmittedOnUtc`, `SummaryText`, `DataJson`.
- Detail view: `SubmissionDashboard.GetDetailAsync(submissionId)` tra `SubmissionDetailDto` co `Submission`, `Form`, `Schema`, `Values`, `FieldSnapshots`, `Files`, `Workflow`.
- Dashboard overview: `Dashboard.GetOverviewAsync(...)` tra count theo form va recent count, du de lam KPI cards co ban.
- Inbox custom UI: API co du nut hanh dong chinh: get board/task, claim, approve, reject, forward, comment, attach file, send submission.

### Viec can lam tiep, van theo minimal change

1. Sua `SubmissionDashboard.SearchAsync(FormId = 0)` de query theo tap form thuoc portal truoc khi paging. Cach it rui ro: lay danh sach formId trong portal, query submissions cho tung form, merge/filter/search/date/status o memory hoac them core helper noi bo; paging/TotalCount phai tinh sau khi da loc portal va truoc khi cat page.
2. Them tests bat buoc:
   - all-forms search voi 2 portal, page size nho, verify `TotalCount` dung va khong mat item page sau.
   - all-forms card/grid data voi submissions thuoc nhieu form trong cung portal.
   - inbox board/action khong tra/action task cua portal khac cung actor.
   - `SendSubmissionAsync` reject submission/form ngoai portal va form/submission mismatch.
3. Loc portal cho inbox surface bang cach map `task.FormId`/`task.SubmissionId` ve form/submission va goi guard portal truoc khi return/action.
4. Giu remote API out-of-scope. Day van la same-host SDK facade.

### Danh gia sau audit

- **Build/test/PublicAPI:** OK.
- **Facade API shape:** OK cho ban preview/minimal.
- **Card/grid theo mot form:** OK.
- **Card/grid tat ca form trong portal:** **Chua OK** den khi fix all-forms paging.
- **Custom inbox rieng tren multi-portal host:** **Chua OK** den khi loc portal cho inbox tasks/actions.
- **Attach file trong inbox:** gan OK; da co portal check cho submission, nhung upload policy moi dung default security, chua doc portal upload settings.

## Trang thai hien tai khi dung

Da dung theo yeu cau user. Chua commit.

Chi nen tiep tuc tren cac file SDK/test da sua:

- `MegaForm.Sdk\IMegaFormClient.cs`
- `MegaForm.Sdk\Dtos.cs`
- `MegaForm.Sdk\MegaFormClient.cs`
- `MegaForm.Sdk\ServiceCollectionExtensions.cs`
- `MegaForm.Sdk\PublicAPI.Unshipped.txt`
- `MegaForm.Sdk.Tests\InMemoryRepositories.cs`
- `MegaForm.Sdk.Tests\MegaFormClientContractTests.cs`

Repo dang co rat nhieu dirty/untracked files khac tu cac phien truoc. **Dung revert hoac format cac file khac.**

## Cac file da thay doi trong task SDK nay

Day la nhung file Codex da sua/tao rieng cho yeu cau "SDK surface/facade API cho dashboard, submission dashboard, inbox, workflow actions, attach files". Claude nen tap trung vao cac file nay truoc:

### `MegaForm.Sdk\IMegaFormClient.cs`

- Them properties tren `IMegaFormClient`: `Dashboard`, `SubmissionDashboard`, `Inbox`.
- Them public interfaces:
  - `IDashboardApi`
  - `ISubmissionDashboardApi`
  - `IInboxApi`
- `IInboxApi` da co action methods: get inbox/task, claim, approve, reject, forward, comment, attach file, send submission.
- Can review final API naming/signatures truoc khi chot PublicAPI baseline.

### `MegaForm.Sdk\Dtos.cs`

- Mo rong `MegaFormScope` voi actor fields: `UserName`, `DisplayName`, `UserEmail`, `IsAuthenticated`, `IsAdmin`, `IsSuperUser`, `Roles`, `IpAddress`.
- Them DTO cho dashboard:
  - `DashboardQuery`
  - `DashboardOverviewDto`
  - `DashboardFormSummaryDto`
- Them DTO cho submission dashboard:
  - `SubmissionSearchQuery`
  - `SubmissionListItemDto`
  - `SubmissionDetailDto`
  - `SubmissionValueDto`
  - `SubmissionFieldSnapshotDto`
  - `SubmissionWorkflowSummaryDto`
- Them DTO cho inbox/workflow:
  - `InboxQuery`
  - `InboxBoardDto`
  - `InboxUserDto`
  - `InboxKpiDto`
  - `InboxTaskDto`
  - `InboxTaskActionRequest`
  - `InboxTaskResultDto`
  - `InboxTaskActionDto`
  - `SendSubmissionToInboxRequest`
  - `InboxSendSubmissionResultDto`
  - `InboxFileAttachmentRequest`
  - `InboxFileAttachmentResultDto`
- Can review nullability/default values as public SDK contract.

### `MegaForm.Sdk\MegaFormClient.cs`

- Class now implements `IDashboardApi`, `ISubmissionDashboardApi`, `IInboxApi`.
- Added optional fields and constructor overload for:
  - `WorkflowTaskService`
  - `IWorkflowRepository`
- Added properties:
  - `Dashboard => this`
  - `SubmissionDashboard => this`
  - `Inbox => this`
- Implemented:
  - `GetOverviewAsync`
  - `SearchAsync`
  - `GetDetailAsync`
  - `UpdateStatusAsync`
  - `GetMyInboxAsync`
  - `GetTaskAsync`
  - `ClaimAsync`
  - `ApproveAsync`
  - `RejectAsync`
  - `ForwardAsync`
  - `CommentAsync`
  - `AttachFileAsync`
  - `SendSubmissionAsync`
- Added helper/mapping methods for actor context, workflow task/action DTOs, detail DTOs, file DTO list, form/submission tenant guards.
- Code compiled during test run; PublicAPI baseline still needs verification.

### `MegaForm.Sdk\ServiceCollectionExtensions.cs`

- `AddMegaFormSdk()` now passes optional workflow services into `MegaFormClient`:
  - `sp.GetService<WorkflowTaskService>()`
  - `sp.GetService<IWorkflowRepository>()`
- This should keep same-host inbox enabled only when host already registered workflow services.

### `MegaForm.Sdk\PublicAPI.Unshipped.txt`

- Partially updated after analyzer complained about new public APIs.
- Important: this file is **not fully verified yet**.
- First Claude action should be:

```powershell
dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj -f net8.0 -v:minimal -clp:ErrorsOnly
```

- If RS0016/RS0017 remains, fix this file only with exact analyzer signatures. Do not suppress analyzer.

### `MegaForm.Sdk.Tests\InMemoryRepositories.cs`

- `InMemorySubmissionRepository.List` now supports `search`, `dateFrom`, `dateTo` filters for dashboard tests.
- Added `InMemoryWorkflowRepository` implementing `IWorkflowRepository`.
- Added `FakeWorkflowEngine` implementing `IWorkflowEngine` so inbox approve path can exercise `WorkflowTaskService` without full engine setup.

### `MegaForm.Sdk.Tests\MegaFormClientContractTests.cs`

- Added tests for:
  - dashboard overview counts
  - submission dashboard search/detail/status update
  - inbox workboard + claim + attach file
  - inbox forward + approve using core workflow service
- Latest successful command before stopping:

```powershell
dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj -v:minimal -clp:ErrorsOnly
```

- Result was `Passed: 49`.

### `Docs\HANDOUT_CLAUDE_SDK_SURFACE_INBOX_DASHBOARD_2026-07-14.md`

- This handout was newly created for next session handoff.
- It is safe for Claude to continue editing this handout if more notes are discovered.

Quick diff command for Claude:

```powershell
git diff -- MegaForm.Sdk MegaForm.Sdk.Tests Docs\HANDOUT_CLAUDE_SDK_SURFACE_INBOX_DASHBOARD_2026-07-14.md
```

## Nhung gi da implement

### 1. SDK public surfaces

`IMegaFormClient` da them:

- `Dashboard`
- `SubmissionDashboard`
- `Inbox`

Them interfaces:

- `IDashboardApi`
- `ISubmissionDashboardApi`
- `IInboxApi`

`IInboxApi` hien co cac method:

- `GetMyInboxAsync`
- `GetTaskAsync`
- `ClaimAsync`
- `ApproveAsync`
- `RejectAsync`
- `ForwardAsync`
- `CommentAsync`
- `AttachFileAsync`
- `SendSubmissionAsync`

### 2. DTOs moi

`Dtos.cs` da them DTO cho:

- Dashboard: `DashboardQuery`, `DashboardOverviewDto`, `DashboardFormSummaryDto`
- Submission dashboard: `SubmissionSearchQuery`, `SubmissionListItemDto`, `SubmissionDetailDto`, `SubmissionValueDto`, `SubmissionFieldSnapshotDto`, `SubmissionWorkflowSummaryDto`
- Inbox: `InboxQuery`, `InboxBoardDto`, `InboxUserDto`, `InboxKpiDto`, `InboxTaskDto`, `InboxTaskActionRequest`, `InboxTaskResultDto`, `InboxTaskActionDto`
- Inbox send/attach: `SendSubmissionToInboxRequest`, `InboxSendSubmissionResultDto`, `InboxFileAttachmentRequest`, `InboxFileAttachmentResultDto`

`MegaFormScope` da mo rong them:

- `UserName`
- `DisplayName`
- `UserEmail`
- `IsAuthenticated`
- `IsAdmin`
- `IsSuperUser`
- `Roles`
- `IpAddress`

Luu y: role matching cua workflow inbox can `Roles`; neu same-host caller khong truyen roles thi role-queue task co the khong hien.

### 3. MegaFormClient implementation

`MegaFormClient` da implement:

- dashboard overview dung `IFormRepository.ListForms` + `ISubmissionRepository.List`
- submission dashboard dung `SubmissionQueryService` va `SubmissionWorkflowDetailService` neu co workflow repo
- inbox dung truc tiep `WorkflowTaskService`, khong tu viet business logic approve/forward
- `AttachFileAsync` dung `IStorageService.SaveFileAsync` + `IFileRepository.InsertFile`, va tra lai task result co `Files`
- `SendSubmissionAsync` dung `WorkflowTaskService.CreateAdHocReviewTask`

DI `AddMegaFormSdk()` da inject optional:

- `WorkflowTaskService`
- `IWorkflowRepository`

Neu host khong dang ky workflow services, form/submission/file SDK van dung duoc; `Inbox` se throw ro rang khi goi.

### 4. Tests da them

`MegaForm.Sdk.Tests` da them:

- filter support cho in-memory submission repo: search/dateFrom/dateTo
- `InMemoryWorkflowRepository`
- `FakeWorkflowEngine`
- tests dashboard overview
- tests submission dashboard search/detail/status
- tests inbox workboard/claim/attach file
- tests inbox forward/approve qua `WorkflowTaskService`

Ket qua da chay truoc khi dung:

```powershell
dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj -v:minimal -clp:ErrorsOnly
```

Ket qua:

`Passed! - Failed: 0, Passed: 49, Skipped: 0, Total: 49`

## Viec con dang do dang

### ✅ [CLAUDE 2026-07-14] PublicAPI.Unshipped.txt — ĐÃ VERIFY, PASS. Khong con viec gi o day.

Claude da chay dung 3 lenh Codex de nghi, ket qua THAT:

| Lenh | Ket qua |
|---|---|
| `dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj -f net8.0 -v:minimal -clp:ErrorsOnly` | **Build succeeded, 0 Errors** — KHONG con RS0016/RS0017 |
| `dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj` (full targets) | **0 Errors** |
| `dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj` | **Passed: 49, Failed: 0** |

→ Baseline `PublicAPI.Unshipped.txt` Codex append la DU va DUNG. Khong can sua them.
→ Phan text goc ben duoi giu lai lam lich su (build TUNG fail truoc khi Codex append).

<details>
<summary>(lich su) Ghi chu goc cua Codex khi dung</summary>

Build SDK mac dinh da fail vi PublicApiAnalyzers bao surface moi chua duoc khai bao.
Sau do da append mot loat line generated vao `MegaForm.Sdk\PublicAPI.Unshipped.txt`, nhung
**chua chay lai build sau append** vi user yeu cau tam dung. Neu con RS0016/RS0017: sua
`PublicAPI.Unshipped.txt` cho dung exact signature analyzer yeu cau, khong suppress analyzer,
khong remove existing baseline cu.

</details>

### 🔴 [CLAUDE 2026-07-14] LOI THAT: `SearchAsync` voi `FormId = 0` phan trang SAI

Codex ghi day la "can kiem tra" (muc review #1). Claude da kiem — **dung la loi**:

- `SubmissionQueryService.List` **CO** ho tro `FormId <= 0` = tat ca form (batch-resolve title/schema theo tung FormId) → phan nay Codex lam dung.
- **NHUNG** `ISubmissionRepository.List(...)` **khong co tham so portalId** → all-forms mode: repo tra submission cua MOI portal, roi `MegaFormClient.SearchAsync` moi loc portal **SAU KHI DA PHAN TRANG** (`MegaFormClient.cs:382`) va tra `TotalCount = items.Count` (`:389`).
- **Hau qua**: khach goi page 1 size 50 tren host nhieu site → nhan ve vi du 12 dong, `TotalCount = 12` → **tuong het du lieu trong khi con hang tram dong o page sau**. Im lang, khong loi. (Du lieu KHONG ro sang portal khac — bo loc van chay — nhung so lieu + phan trang sai.)
- **Fix toi thieu**: o nhanh `FormId == 0`, list form cua portal truoc (`IFormRepository.ListForms(portalId)`) roi query theo tap formId do voi paging dung; hoac them overload repo nhan `portalId`. **Khong duoc** loc-sau-phan-trang.

Chi tiet + thu tu viec phien sau: `CLAUDE_HANDOFF_20260714_AI_ERP_AND_AI_CREATOR_FIXES.md` §6.

## Cac diem can Claude review ky

1. `SubmissionDashboard.SearchAsync` voi `FormId = 0`

Hien code goi `SubmissionQueryService.List` voi `FormId = 0`. Can kiem tra repo DNN/Oqtane co xem `0` la "all forms" khong. Neu khong, can implement minimal all-forms search bang cach list forms trong portal roi query tung form co paging hop ly. Hien total count khi all-forms dang la page-local `items.Count`, can verify.

2. Attachment storage folder

`AttachFileAsync` luu vao:

`MegaForm/Inbox/form-{formId}/submission-{submissionId}`

Can verify `IStorageService` cua DNN/Oqtane/Web chap nhan folder string nay va no di vao private storage dung mong doi. Neu host storage co convention rieng, chinh toi thieu.

3. Upload policy

`AttachFileAsync` hien dung default blocked extensions va magic validation tu `FileUploadSecurityService`. No chua doc portal upload settings max size/allowed extensions. Vi user yeu cau minimal same-host, tam chap nhan, nhung nen note trong docs.

4. Permission model

`AttachFileAsync` dung `WorkflowTaskService.GetTask(taskId, actor)` de ensure actor visible/workflow access, sau do check submission portal. Tot. Tuy nhien `Files.ListForSubmissionAsync/OpenAsync` cu van khong tenant-check; day la API cu, khong sua trong scope nay. Neu muon harden thi lam rieng, can can nhac breaking behavior.

5. Public API shape

Day la SDK public package. Ten DTO/method nen duoc review lan cuoi truoc khi baseline pass:

- `SubmissionDashboard` vs `SubmissionsDashboard`
- `AttachFileAsync` co nen nam trong `Inbox` hay `Files`
- `SendSubmissionAsync` co du ro nghia "ad-hoc inbox task" khong

## Lenh tiep tuc de Claude chay

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"

dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj -f net8.0 -v:minimal -clp:ErrorsOnly

dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj -v:minimal -clp:ErrorsOnly
```

Neu pass, co the build full SDK targets:

```powershell
dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj -v:minimal -clp:ErrorsOnly
```

## De xuat final message cho user sau khi Claude xong

Bao ro:

- da them SDK facade surfaces: Dashboard, SubmissionDashboard, Inbox
- Inbox da support claim/approve/reject/forward/comment/send submission/attach file
- same-host only, chua them remote API
- tests pass
- PublicAPI baseline da update/pass

## Ghi chu ve DNN link

Trong phien nay chua start DNN/Oqtane host va chua cung cap link theo doi. Neu user tiep tuc QA DNN, Claude can doc handout cu:

`Docs\HANDOUT_DNN_QA_NEXT_ROUND_2026-07-13.md`

roi start dung host/port theo handout do, sau do tra link local cho user.
