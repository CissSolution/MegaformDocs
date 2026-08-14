# HANDOFF CHO CLAUDE — 2026-07-28: Permission Matrix enforcement trên 4 host

> Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
>
> Audit đầu vào: `Docs/AUDIT_PERMISSION_MATRIX_ENFORCEMENT_2026-07-26.md`
>
> Branch tại thời điểm bàn giao: `feature/typed-submission-storage-core`
>
> Source commit đã hoàn tất: `2dd59b361086598815842229dde8c122126b2ba2`
>
> Commit message: `fix: enforce permission matrix across hosts`

## 0. Trạng thái bàn giao

Codex đã sửa source, chạy test/build và tạo commit riêng. Claude **không cần stage hoặc
commit lại 32 file source**. Việc cần làm là:

1. Ghi nhận commit `2dd59b3`.
2. Rà lại diff của đúng commit này.
3. Chạy lại test/build theo mục 5.
4. Chỉ sửa tiếp nếu build tái hiện lỗi thuộc chính commit này.

Worktree của repo đang cực kỳ bẩn (hơn 600 modified/untracked/deleted entries thuộc nhiều
task khác). Tuyệt đối không dùng:

```text
git add .
git add -A
git reset --hard
git checkout -- .
git clean
```

Không được dọn, reset hoặc commit ké các thay đổi ngoài `2dd59b3`.

Audit và handout này là tài liệu bàn giao ngoài source commit. Việc chúng chưa nằm trong
`2dd59b3` là có chủ ý.

## 1. Kết quả kiến trúc

Permission Matrix hiện có enforcement thực cho cả bảy key:

```text
submit / view / edit / delete / export / approve / manage
```

Các sửa đổi chính:

- Dùng chung một principal matcher cho user, role và special principals:
  `all_users`, `authenticated`, `anonymous`.
- Explicit deny thắng grant; row có `IsGranted=false` không còn bị hiểu thành grant.
- `manage` được enforce khi đọc/ghi permission và có thể cấp quyền quản trị ma trận.
- `approve` được đưa vào workflow authorization theo đúng khuyến nghị audit:
  grant `approve` được OR với assignee/candidate user/candidate role hiện hữu.
- Scope `all`, `own`, `team` và `team:<fieldKey>` được evaluate ở cấp submission.
- Scope được áp vào list, detail, edit, delete và export; `own` được push xuống repository
  khi host/repository hỗ trợ.
- UI Permission Matrix có selector All/Own/Team thay vì luôn ghi cứng `scope="all"`.
- DNN, Oqtane, Web và Umbraco cùng đọc `MF_Permissions` cho các action của submission.
- Umbraco vẫn giữ native permission letters cho quyền backoffice, nhưng không còn bỏ qua
  MF_Permissions ở submission enforcement.

## 2. Các lỗi audit đã được xử lý

### P0

- Web `Permissions/Save` không còn mở cho mọi authenticated user; đã gate bằng `manage`.
- Web `DELETE Submissions/{id}` đã qua delete permission và row scope.

### P1

- Special principals match đúng ở Core và các host.
- `approve` không còn là quyền chết.
- DNN/Oqtane đã gọi `CanEdit` và `CanDelete`; không còn chỉ dùng admin/EditModule.
- DNN/Web/Umbraco export đã gọi `CanExport`; Oqtane export áp row scope.
- `IsGranted=false` không còn grant ngầm.
- Umbraco submit truyền actor đầy đủ gồm roles/admin/member identity.
- Umbraco schema đi qua `FormAccessProjection`, không trả raw schema nhạy cảm.
- Umbraco có row-level view và approver-read.

### P2/P3

- Scope `own` được áp cho list/export/mutations.
- Scope `team` được implement và được đưa vào catalog/UI.
- Ad-hoc workflow routing được gate bằng `manage` hoặc edit permission.
- Oqtane permission save có matrix-manage/form-module gate.
- Web dùng một actor builder thống nhất.
- Oqtane có BulkDelete; Umbraco có single delete.

## 3. Danh sách chính xác 32 file trong commit

### 3.1 Core — 5 file

```text
MegaForm.Core/Services/ExternalTable/ExternalSubmissionRepository.cs
MegaForm.Core/Services/PermissionCatalogService.cs
MegaForm.Core/Services/PermissionService.cs
MegaForm.Core/Services/ServerSidePermissionEnforcementService.cs
MegaForm.Core/Services/WorkflowTaskService.cs
```

### 3.2 DNN — 5 file

```text
MegaForm.DNN/Data/DnnRepositories.cs
MegaForm.DNN/Data/FormRepository.cs
MegaForm.DNN/Services/DnnServiceLocator.cs
MegaForm.DNN/WebApi/MegaFormApiController.cs
MegaForm.DNN/WebApi/PermissionsController.cs
```

### 3.3 Oqtane — 1 file

```text
MegaForm.Oqtane.Server/Controllers/MegaFormController.cs
```

### 3.4 Web — 3 file

```text
MegaForm.Web/Controllers/MegaFormController.SubmissionSecurity.cs
MegaForm.Web/Controllers/MegaFormController.cs
MegaForm.Web/Data/DataLayer.cs
```

### 3.5 Umbraco — 14 file

```text
MegaForm.Umbraco/Controllers/MegaFormApiController.SubmissionExtras.cs
MegaForm.Umbraco/Controllers/MegaFormApiController.cs
MegaForm.Umbraco/Data/EfRepositories.cs
MegaForm.Umbraco/Permissions/FormPermissionAssignmentDto.cs
MegaForm.Umbraco/Permissions/GuidUtility.cs
MegaForm.Umbraco/Permissions/IMegaFormPermissionService.cs
MegaForm.Umbraco/Permissions/MegaFormActions.cs
MegaForm.Umbraco/Permissions/MegaFormAuthorizeAttribute.cs
MegaForm.Umbraco/Permissions/MegaFormGranularPermission.cs
MegaForm.Umbraco/Permissions/MegaFormPermissionAuthorizationHandler.cs
MegaForm.Umbraco/Permissions/MegaFormPermissionConstants.cs
MegaForm.Umbraco/Permissions/MegaFormPermissionRequirement.cs
MegaForm.Umbraco/Permissions/MegaFormPermissionService.cs
MegaForm.Umbraco/Services/UmbracoMemberContext.cs
```

### 3.6 Builder UI — 2 file

```text
MegaForm.UI/src/builder/permissions/init.ts
MegaForm.UI/src/builder/permissions/render.ts
```

### 3.7 Tests — 2 file

```text
MegaForm.Sdk.Tests/PermissionMatrixEnforcementTests.cs
MegaForm.Sdk.Tests/PermissionServiceTests.cs
```

Thống kê commit:

```text
32 files changed
2348 insertions
179 deletions
```

## 4. Cách review commit an toàn

Từ repo root:

```powershell
git status --short
git show --check --oneline 2dd59b3
git diff --name-status 2dd59b3^ 2dd59b3
git diff --stat 2dd59b3^ 2dd59b3
git diff 2dd59b3^ 2dd59b3 -- `
  MegaForm.Core/Services/PermissionService.cs `
  MegaForm.Core/Services/ServerSidePermissionEnforcementService.cs `
  MegaForm.Core/Services/WorkflowTaskService.cs
```

Expected:

```text
2dd59b3 fix: enforce permission matrix across hosts
```

`git show --check` phải không báo whitespace error.

Không dùng trạng thái toàn worktree để suy luận nội dung commit. Với các file `MM` hoặc file
có thay đổi mới sau commit, luôn review qua phạm vi:

```powershell
git diff 2dd59b3^ 2dd59b3 -- <file>
```

## 5. Test và build cần chạy lại

### 5.1 Unit/integration tests

```powershell
dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj -c Release
```

Kết quả Codex đã chạy:

```text
Passed: 194
Failed: 0
```

Các test mới bao phủ:

- All Users / Authenticated / Anonymous.
- Explicit deny.
- `manage` grant.
- Explicit `approve`/`manage`.
- `own` và `team` row scope.

### 5.2 Core và bốn server host

```powershell
dotnet build MegaForm.Core/MegaForm.Core.csproj -c Release -f net9.0
dotnet build MegaForm.Web/MegaForm.Web.csproj -c Release
dotnet build MegaForm.DNN/MegaForm.DNN.csproj -c Release
dotnet build MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj -c Release -f net9.0
dotnet build MegaForm.Umbraco/MegaForm.Umbraco.csproj -c Release
```

Kết quả Codex: cả năm lệnh đều PASS.

Nếu build song song gây lock DLL, dừng tiến trình build cũ và chạy tuần tự từng project.
Không sửa source chỉ để né một file lock.

### 5.3 Permission Matrix builder

```powershell
Push-Location MegaForm.UI
npm run build:builder
Pop-Location
```

Kết quả Codex: PASS.

Full TypeScript typecheck hiện có lỗi không thuộc permission task:

```text
MegaForm.UI/src/builder/workflow/wf-app.ts(785,3): TS1128
```

Nếu `npm run typecheck` vẫn chỉ dừng tại lỗi trên thì ghi nhận là pre-existing/unrelated.
Gate của phần UI trong commit này là `npm run build:builder`.

## 6. Acceptance checklist cho Claude

1. Commit hiện tại/branch history chứa `2dd59b3`.
2. `git show --check 2dd59b3` sạch.
3. Danh sách file của commit đúng 32 file ở mục 3.
4. Test `MegaForm.Sdk.Tests` đạt 194/194 hoặc cao hơn nếu có test mới.
5. Core, DNN, Oqtane, Web và Umbraco build Release không có error.
6. Builder production entry build thành công.
7. Không có file ngoài permission scope bị stage hoặc commit thêm.

## 7. Smoke QA khuyến nghị nếu có thời gian

Tạo một form test với các role/user riêng, kiểm tra tối thiểu:

1. `Authenticated Users → View` cho phép user đăng nhập xem submission.
2. `Anonymous → View` chỉ hoạt động khi rule được grant rõ ràng.
3. `Edit/Delete → Own` cho phép sửa/xóa submission của chính user và từ chối row khác.
4. `Export → Own` không xuất submission của user khác.
5. `Team` chỉ trả các row có team field khớp actor.
6. User không có `manage` không đọc/ghi được Permission Matrix.
7. User có `approve` hoặc là workflow candidate có thể xử lý task; user không thuộc cả hai
   nhóm bị từ chối.
8. Umbraco schema endpoint không lộ field/config bị hạn chế.

Không deploy production và không thay đổi permission trên form đang dùng thật chỉ để smoke test.

## 8. Điều không được sửa thêm trong lượt ghi nhận/build

- Không đổi fallback “form không có rule” nếu chưa có quyết định sản phẩm riêng.
- Không bỏ workflow candidate/assignee để biến `approve` thành điều kiện bắt buộc; audit đã đề
  xuất semantics OR.
- Không hợp nhất tên bảng DNN `MF_FormPermissions` với `MF_Permissions` trong lượt này; đây là
  migration riêng.
- Không format toàn repo.
- Không commit audit, handout hoặc các thay đổi dirty khác cùng source commit `2dd59b3`.

