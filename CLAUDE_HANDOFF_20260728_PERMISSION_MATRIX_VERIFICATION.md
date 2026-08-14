# TIẾP NHẬN + KIỂM CHỨNG — commit `2dd59b3` "enforce permission matrix across hosts"

> ## ✅ ĐÃ XỬ LÝ 2026-07-28 chiều — commit `7ae03ed`
> Mục **B** (commit không compile) và mục **C** (P0 export ẩn danh) đã đóng. Xem
> §G ở cuối file. Phần còn lại của báo cáo giữ nguyên làm hồ sơ trạng thái lúc kiểm chứng.

> Đọc kèm: `CLAUDE_HANDOFF_20260728_PERMISSION_MATRIX_ENFORCEMENT_BUILD.md` (bàn giao của Codex)
> và `Docs/AUDIT_PERMISSION_MATRIX_ENFORCEMENT_2026-07-26.md` (audit đầu vào).
>
> Kiểm chứng ngày 2026-07-28, **chỉ dùng lệnh read-only** (không `git add`/`reset`/`checkout`/`clean`,
> không `dotnet build`/`test` vì sẽ ghi `obj/bin`). Không sửa một dòng source nào.

## Kết luận ngắn

**Phần thiết kế của Codex là đúng và có giá trị** — 7 permission key được enforce thật, explicit deny
thắng grant, `approve` hết là quyền chết, scope `own`/`team` được evaluate ở cấp submission, 4 host cùng
đọc `MF_Permissions`. Audit P0/P1/P2 được xử lý đúng hướng.

**Nhưng commit `2dd59b3` KHÔNG tự đứng được**, và ở trạng thái đã commit nó chứa một lỗ hổng dữ liệu.
Nguyên nhân gọn: **3 file Core mà commit phụ thuộc vẫn đang nằm ngoài commit** (uncommitted trong
worktree). Vì thế con số "194/194 tests PASS, 5/5 build PASS" của bàn giao được sinh ra từ **worktree bẩn**,
không phải từ `2dd59b3`.

---

## A. Đã xác nhận khớp bàn giao

| Claim | Kết quả |
|---|---|
| Commit `2dd59b3` tồn tại, là HEAD của `feature/typed-submission-storage-core` | ✔ |
| Commit message `fix: enforce permission matrix across hosts` | ✔ |
| Đúng **32 file** trong commit | ✔ |
| 32 file đó đều tồn tại trên đĩa | ✔ |
| Audit + handout để **untracked** là có chủ ý | ✔ (khớp mục 0) |
| `npm run typecheck` vướng lỗi **có sẵn** `wf-app.ts(785,3) TS1128` | ✔ — không liên quan permission; tôi cũng gặp lỗi này trong phiên trước khi build UI |

## B. 3 BLOCKER — commit không compile được từ clean checkout

Cả ba đều do **cùng một nguyên nhân**: 3 file Core cần thiết chưa được đưa vào commit.

### B1. `ISubmissionOwnerFilterableRepository` được dùng ở 7 file nhưng **không được khai báo ở đâu** trong cây commit
```
git grep -l "interface ISubmissionOwnerFilterableRepository" 2dd59b3   → (rỗng)
git grep -l "ISubmissionOwnerFilterableRepository"           2dd59b3   → 7 file
  MegaForm.Core/Services/ExternalTable/ExternalSubmissionRepository.cs
  MegaForm.DNN/Data/DnnRepositories.cs
  MegaForm.Oqtane.Server/Controllers/MegaFormController.cs
  MegaForm.Umbraco/Controllers/MegaFormApiController.cs
  MegaForm.Umbraco/Controllers/MegaFormApiController.SubmissionExtras.cs
  MegaForm.Umbraco/Data/EfRepositories.cs
  MegaForm.Web/Data/DataLayer.cs
```
⇒ **CS0246** ở Core, DNN, Web, Umbraco. Khai báo thật nằm ở `MegaForm.Core/Interfaces/ICoreInterfaces.cs`
— file này đang ` M` (uncommitted).

### B2. `SubmissionListQuery.UserId` không tồn tại tại `2dd59b3`
Web `ListSubmissions`/`ExportSubmissions`, DNN `List`, Oqtane `GetSubmissions`/`ExportSubmissions` đều gán
`UserId = ...` trong initializer của `SubmissionListQuery` ⇒ **CS0117**. Property chỉ có trong
`MegaForm.Core/Models/SubmissionQueryModels.cs` — cũng đang ` M`.

### B3. ⚠️ **RÒ DỮ LIỆU** — scope `own` là no-op trong commit, mà host lại BỎ lọc từng dòng
```
git show 2dd59b3:MegaForm.Core/Services/SubmissionQueryService.cs | grep "query.UserId"  → (rỗng)
```
Trong khi host đã chủ động tắt lọc per-row vì tin rằng SQL đã lọc:
- `MegaForm.Web/Controllers/MegaFormController.cs:799-801` → `rowScoped = … && !ownOnlyScope`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2522` → `applyPerRowFilter = … && !ownerOnlySqlFilter`
  (kèm comment "per-row pass is redundant")

⇒ Ở đúng trạng thái đã commit, **user scope `own` nhận về TOÀN BỘ dòng của form**. Bản push-down thật nằm
trong `MegaForm.Core/Services/SubmissionQueryService.cs` — đang ` M`.

> **Xác nhận worktree hiện tại ĐÃ đúng**: `SubmissionQueryService.cs:57` có
> `query.UserId.HasValue && query.UserId.Value > 0`; `SubmissionQueryModels.cs:28` có `public int? UserId`;
> `ICoreInterfaces.cs:54` có `public interface ISubmissionOwnerFilterableRepository`.
> Cả 3 đều ` M`. Đây chính là lý do test/build của Codex PASS còn commit thì hỏng.

**Change set thật là ~35 file, không phải 32.**

## C. 🔴 P0 — export ẩn danh toàn bộ submission (chưa được nêu trong bàn giao)

Hai điều kiện cộng lại:

1. `MegaForm.Core/Services/PermissionService.cs:196` (tồn tại **cả ở commit lẫn worktree**):
   ```csharp
   if (perms == null || perms.Count == 0) return true; // no restrictions = open
   ```
   → form **chưa có dòng nào** trong `MF_Permissions` thì mọi check đều **fail-OPEN**.

2. Commit nới lỏng auth vòng ngoài của export:
   | Host | Trước (`d247a00`) | Sau (`2dd59b3`) |
   |---|---|---|
   | Web `Submissions/Export` | `[Authorize]` | **`[AllowAnonymous]`** |
   | Oqtane `ExportSubmissions` | `[Authorize(Policy="ViewModule")]` | **`[AllowAnonymous]`** |

⇒ Với bất kỳ form nào chưa cấu hình permission, **người dùng chưa đăng nhập tải được toàn bộ submission
dạng CSV/JSON**. `RequiresSubmissionScopeEvaluation` cũng trả `false` khi không có grant nên không có lọc
dòng nào bù lại.

Vi phạm `CLAUDE.md`:
- **Rule 3** — `[AllowAnonymous]` chỉ cho public thật và **phải ghi lý do**; ở đây không có dòng lý do nào.
- **Rule 11** — đường anonymous phải cap NGHIÊM NHẤT, nhưng Web export đặt `TrustedFetch=true` +
  `PageSize=TrustedMaxPageSize`, Oqtane export đặt `PageSize=10000`.

Mục 8 của bàn giao cấm sửa fallback "không có rule = mở" nếu chưa có quyết định sản phẩm — nhưng chính
export vừa trở thành anonymous lại đang **dựa vào** fallback đó. Hai ràng buộc này xung đột và cần bạn quyết.

> **Chưa lộ ra ngoài**: `dnndefender.com` đang chạy MegaForm **1.7.114** (cài 07-24), còn `2dd59b3` là
> 07-28 và chưa đóng gói/triển khai. Rủi ro hiện ở mức repo, không phải production.

## D. Điểm cần lưu ý thêm (không chặn, nhưng nên biết)

1. **Nới auth diện rộng, không ghi trong bàn giao**: Web `Submissions/List`, `Submissions/Get`,
   `Submissions`, `Submissions/{id}`, `Submissions/{id}/Print` cũng `[Authorize]` → `[AllowAnonymous]`;
   DNN `SubmissionsController` + `PermissionsController` bỏ `StaticRoles="Administrators"`; Oqtane
   `Status`/`UpdateData`/`DELETE` chuyển EditModule → `[Authorize]`. Web/DNN/Oqtane cũng bỏ early-return
   `!actor.IsAuthenticated → deny`.
2. **Umbraco**: 11/14 file là một **subsystem granular-permission riêng** (permission letters, handler,
   attribute, member context) vốn đã untracked từ trước, bị gom vào `2dd59b3` — hơi nghịch với chính mục 8
   ("không commit ké"). Mặt tốt: nó vá luôn dự án Umbraco vốn không build được.
   ⚠️ ~20 endpoint chuyển `[Authorize(BackOfficeAccess)]` → `[MegaFormAuthorize(<letter>)]`: admin bypass
   được, nhưng **mọi backoffice user non-admin sẽ 403** cho tới khi được cấp letter trên user group.
3. **6/32 file đã commit còn mang thêm sửa đổi uncommitted** chồng lên (gỡ Azure Blob, mask connection
   string, typed-storage DbSets, Umbraco report SQL, ListForms paging) — nên mọi lần build/test từ worktree
   này là đang kiểm tra "commit + rác", không phải commit.
4. **Lệch UI/Core**: Core hỗ trợ `team:<fieldKey>` nhưng selector mới chỉ ghi được `all`/`own`/`team`; rule
   `team:<fieldKey>` tạo qua API sẽ bị hiển thị thành `team` và bị ghi đè nếu người dùng chạm vào ô đó.
5. **`team` scope match ngầm**: `ScopeMatchesTeam` đọc `DataJson` và so khớp giá trị của key
   `team`/`department`/`teamId`/`teamName` với tên role của actor — không cần khai báo trong schema. Form nào
   vô tình có field tên như vậy trùng tên role sẽ tự động mở quyền.

## E. Đề xuất việc tiếp theo (chưa làm — chờ bạn quyết)

1. **Đưa 3 file Core còn thiếu vào change set** (`ICoreInterfaces.cs`, `SubmissionQueryModels.cs`,
   `SubmissionQueryService.cs`). `ICoreInterfaces.cs` sạch để stage; 2 file kia mang thêm phần
   `[OwnerRlsSql v20260722]` nên cần review trước. Không có bước này thì commit vừa không build vừa rò dữ liệu.
2. **Quyết định về P0 export ẩn danh** — hoặc trả `[Authorize]` cho export, hoặc đổi fallback "không có
   rule = mở" thành fail-closed cho export. Đây là quyết định sản phẩm, tôi không tự sửa.
3. Ghi lý do cho từng `[AllowAnonymous]` còn lại (rule 3), và siết cap cho đường anonymous (rule 11).
4. Chạy lại test/build **từ một worktree sạch** (`git worktree add` một bản `2dd59b3` + 3 file kia) thì con
   số 194/194 mới có ý nghĩa.
5. Cấp permission letter cho user group Umbraco non-admin trước khi phát hành.
6. Smoke QA 8 kịch bản ở mục 7 bàn giao — chưa chạy.

## F. Những gì tôi KHÔNG làm (đúng mục 8 của bàn giao)

Không `git add`/`add -A`/`reset`/`checkout`/`clean`/`stash`; không commit; không sửa source; không đụng
fallback "không có rule = mở"; không gộp `MF_FormPermissions` vào `MF_Permissions`; không reformat.
Chỉ đọc + chạy lệnh git read-only, và tạo đúng file báo cáo này.

---

## G. ĐÃ XỬ LÝ — commit `7ae03ed` (2026-07-28, sau khi bạn duyệt)

### G1. P0 export ẩn danh — ĐÓNG

Quyết định lấy hướng **fail-closed riêng cho export**, KHÔNG đụng fallback chung "không có rule = mở"
(mục 8 của bàn giao Codex vẫn được tôn trọng, vì `CanExport`/`CanView`/`CheckPermission` giữ nguyên):

- **Core** — thêm `PermissionService.CanBulkExport(formId, user)`: cùng luật match/deny với `CanExport`
  nhưng bảng permission rỗng ⇒ **không cấp gì**, và caller ẩn danh ⇒ **luôn từ chối**. Lý do phải chặn
  ẩn danh riêng: principal đặc biệt `all_users` khớp cả khách vãng lai (`MatchesPrincipal:269-270`),
  nên chỉ fail-closed thôi vẫn chưa đủ.
- **4 host** — Web + Oqtane export trả về `[Authorize]`; DNN bỏ `[AllowAnonymous]` để kế thừa
  `[DnnAuthorize]` của `SubmissionsController`; Umbraco dùng `[MegaFormAuthorize(ViewSubmissionsLetter)]`
  cho khớp phần còn lại của surface submission. Cả 4 gọi `CanBulkExport`.
- **Rule 11** — Oqtane + Umbraco export xin `SubmissionQueryService.TrustedMaxPageSize` thay cho 10000
  tự chế. Oqtane vốn đã bị facade clamp; **Umbraco thì không** — nó đẩy thẳng 10000 xuống repository.
- **Rule 3** — ghi lý do cho từng `[AllowAnonymous]` đọc còn lại (Web/Oqtane/DNN): public list view của
  widget blog + gate per-form fail-closed (`HasExplicitSubmissionViewRule`).
- **Test** — `MegaForm.Sdk.Tests/BulkExportPermissionTests.cs`, 8 case ghim đúng chỗ `CanExport` và
  `CanBulkExport` khác nhau (form không rule, caller ẩn danh, grant `all_users`, deny thắng grant,
  host chỉ set `UserId` mà quên `IsAuthenticated`).

### G2. 3 file Core còn thiếu — ĐÓNG, nhưng phải tách hunk

`ICoreInterfaces.cs` và `SubmissionQueryModels.cs` sạch nên vào nguyên. `SubmissionQueryService.cs`
**không** vào nguyên được: ngoài phần `[OwnerRlsSql]` nó còn mang một read-path typed-storage dùng
`SubmissionDataResolver` — mà file đó **vẫn untracked**. Commit cả file = lặp lại đúng lỗi CS0246 cũ.
Nên chỉ hunk `[OwnerRlsSql v20260722-01]` được stage (qua `git hash-object` + `update-index`), phần
typed-storage nằm lại worktree như cũ. Cùng lý do, `MegaForm.Web/Controllers/MegaFormController.cs` và
`MegaForm.DNN/WebApi/MegaFormApiController.cs` cũng phải tách: chúng mang thêm hunk `[MaskRoundTrip]`
phụ thuộc `NamedConnectionCatalog` — cũng untracked.

### G3. Verify từ worktree SẠCH — kết quả thật

`git worktree add --detach <tmp> 7ae03ed`:

| Mục | Kết quả |
|---|---|
| `MegaForm.Core` | ✅ build 0 error **từ clean checkout** |
| `MegaForm.Sdk.Tests` | ✅ **202/202 PASS** (194 cũ + 8 mới) — sau khi copy đúng 1 file untracked có sẵn `AiKnowledgeSeedMerger.cs`, không liên quan permission |
| `MegaForm.Oqtane.Server` / `MegaForm.Web` / `MegaForm.Umbraco` | ❌ **KHÔNG build** từ clean checkout — nhưng vì nợ có sẵn, không phải vì `2dd59b3`/`7ae03ed` |
| Worktree hiện tại (đầy đủ file) | ✅ Core + Web + Oqtane + Umbraco + DNN(net472, Release) build 0 error; 202/202 test PASS |

### G4. 🔴 PHÁT HIỆN MỚI — repo không build được từ clean checkout (nợ có sẵn, rộng hơn nhiều)

Handoff này (mục B) mới thấy 3 file. Thực tế là **48 file `.cs` chưa bao giờ được `git add`** mà code
**đã-commit** tham chiếu tới:

- `MegaForm.Core/Services/NamedConnectionCatalog.cs` — **15 file trong HEAD** tham chiếu
- `MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs` (4), `TypedSubmissionResyncService.cs` (3),
  `AiKnowledge/AiKnowledgeSeedMerger.cs` (1)
- Gần như toàn bộ `MegaForm.Umbraco/{Controllers,Services,HostedServices,StartupFilters,Migrations,Data}`
  (~40 file), `MegaForm.Web/{Controllers/*.UploadAndSdk,GoogleSheets,Data/EfSubmissionDataStore,HostedServices}`

Đây là lý do **mọi con số "tests PASS" trong repo này từ trước tới nay đều là của worktree bẩn** — không
riêng gì bàn giao của Codex. `git ls-files --others --exclude-standard -- '*.cs'` cho danh sách đầy đủ.

**Chưa xử lý — cần bạn quyết**: commit ~48 file này (làm clean checkout build được, nhưng kéo vào một
lượng code chưa review: mask-secret round-trip, typed-storage read path, toàn bộ host Umbraco) hay để
nguyên. Tôi không tự quyết vì nó vượt phạm vi "sửa P0".

### G5. Còn lại của mục E chưa làm

- E5 — cấp permission letter cho user group Umbraco non-admin trước khi phát hành (cần site thật).
- E6 — smoke QA 8 kịch bản ở mục 7 bàn giao Codex (cần site thật).
- Mục D4 (UI chỉ ghi được `all`/`own`/`team`, mất `team:<fieldKey>`) và D5 (`ScopeMatchesTeam` match ngầm
  theo tên field) vẫn mở.
