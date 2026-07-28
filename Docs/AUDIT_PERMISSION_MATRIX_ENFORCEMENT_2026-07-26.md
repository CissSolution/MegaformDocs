# AUDIT — MegaForm "Permissions & Access" Matrix: ma trận phân quyền có được áp dụng đúng không?

> Ngày audit: 2026-07-26 — **READ-ONLY audit, không thay đổi code.**
> Bối cảnh: popup "Permissions & Access" trong form builder (screenshot trên host DNN megademo.ai): `PermissionCatalog v20260424-01`, 7 quyền (Submit / View Submissions / Edit Submissions / Delete Submissions / Export / Approve / Manage) × principals (Special: All Users / Anonymous / Authenticated + Roles + Users), ghi chú "Shared across Web, DNN, Oqtane".
> Câu hỏi audit: các ô tick trong ma trận có thực sự được enforce server-side không, và có đồng nhất giữa 4 host (DNN / Oqtane / Web / Umbraco) không?

## 1. Kiến trúc hiện tại (đã xác minh)

- **Catalog dùng chung:** `MegaForm.Core/Services/PermissionCatalogService.cs` — 7 permission keys (`submit/view/edit/delete/export/approve/manage`), normalize alias (`view_submissions`→`view`, `workflow_approve`→`approve`…), scopes `all/own/team` (team chỉ tồn tại trong `NormalizeScope`, không có trong scope definitions — `:297-304` chỉ liệt kê `all`/`own`).
- **Lưu trữ:** bảng MF_Permissions qua `IPhase2Repository.GetFormPermissions/SaveFormPermissions` (`MegaForm.Core/Interfaces/ICoreInterfaces.cs:143-145`). Tên bảng lệch nhau: DNN dùng `MF_FormPermissions` (raw SQL, `MegaForm.DNN/Data/Phase2Repository.cs:303-383`), Oqtane/Umbraco/Web dùng `MF_Permissions`. Mỗi host tự nhất quán, nhưng đây là drift danh pháp.
- **Enforcement Core:** `ServerSidePermissionEnforcementService.EnforceSubmit` chỉ xử lý **submit** (+ manage như quyền gốc) + field restrictions/readOnlyIf/schema whitelist. 6 quyền còn lại do **từng host tự enforce** qua `MegaForm.Core/Services/PermissionService.cs` (`CanView/CanEdit/CanDelete/CanExport/CanViewSubmission`) — và đây chính là nơi mọi vấn đề phát sinh.
- **UI matrix** (`MegaForm.UI/src/builder/permissions/`): GET `Permissions/Catalog`, POST `Permissions/Save` gửi toàn bộ rule list; **mọi ô tick đều lưu scope `"all"`** (`init.ts:158`) — UI không cho chọn scope `own`/`team` (rule nâng cao chỉ "preserved", hiển thị dạng đếm — `render.ts:151-156`).

## 2. Ma trận enforcement tổng hợp (server-side, per host)

| Quyền | DNN | Oqtane | Web | Umbraco |
|---|---|---|---|---|
| **submit** | ✅ EnforceSubmit (có actor) | ✅ EnforceSubmit (có actor) | ✅ EnforceSubmit (actor + query) | ⚠️ EnforceSubmit **không có roles/admin** (chỉ userId) |
| **view** | ⚠️ Có, nhưng special principals + team scope không match; TotalCount sai | ✅ Có (+ owner, + task holder, + SQL push-down own) | ✅ Có (+ owner/task holder) | ⚠️ Chỉ letter Umbraco, **không row-level**, không approver-read |
| **edit** | ❌ Administrators-only, `CanEdit` không bao giờ được gọi | ❌ Chỉ policy `EditModule`, `CanEdit` không gọi | ✅ `CanMutateSubmissions(edit)` | ⚠️ Letter `Manage` (gộp edit+delete), không đọc MF_Permissions |
| **delete** | ❌ Administrators-only | ❌ Chỉ `EditModule` | ⚠️ POST Delete/BulkDelete có check; **`DELETE Submissions/{id}` KHÔNG check** | ⚠️ Letter `Manage` (chỉ có BulkDelete) |
| **export** | ❌ Administrators-only | ✅ `CanExport` khi form có rules (không rules = mở) | ❌ Chạy theo view (`CanExport` không gọi) | ⚠️ Chạy theo letter View |
| **approve** | ❌ Không đọc bao giờ (workflow = task membership) | ❌ Không đọc bao giờ | ❌ Không đọc bao giờ | ❌ Không đọc bao giờ |
| **manage** | ❌ Chỉ là alias "có explicit view rule" | ❌ Tương tự; Permissions/Save = EditModule bất kỳ | ❌ Tương tự; **Permissions/Save = bất kỳ ai đăng nhập** | ⚠️ Letter `ManagePermissions` (hệ riêng) |
| **scope own** | ⚠️ Chỉ detail, in-memory sau paging | ⚠️ List (SQL) + detail; **export bỏ qua scope** | ⚠️ Chỉ detail; **list/export/mutations bỏ qua** | ❌ Không có |
| **scope team** | ❌ Không implement | ❌ Không implement | ❌ Không implement | ❌ Không implement |
| **special principals** (All/Auth/Anon) | ❌ Không match ngoài submit | ❌ Không match ngoài submit | ❌ Không match ngoài submit | n/a |

**Trả lờI ngắn:** ma trận **chưa được áp dụng đúng và chưa đồng nhất**. Chỉ `submit` (3/4 host) và `view` (3/4 host, có lỗi) là enforce thật. `edit/delete` chỉ thật trên Web. `export` chỉ thật trên Oqtane. `approve` và `manage` là **quyền trang trí** trên cả 4 host. Umbraco dùng hệ quyền song song (letters), gần như bỏ qua MF_Permissions ngoài submit.

## 3. Findings

### P0 — Critical

**F1. Web: `POST Permissions/Save` mở cho mọi authenticated user → leo thang đặc quyền.**
`MegaForm.Web/Controllers/MegaFormController.cs:1945-1956` chỉ có `[Authorize]` — bất kỳ user đăng nhập nào cũng ghi đè MF_Permissions của form bất kỳ, tự grant cho mình view/edit/delete. Trong khi DNN gate bằng Administrators (`PermissionsController.cs:21`) và Umbraco gate bằng `ManagePermissionsLetter`. **Đây là lỗ hổng bảo mật thật, không phải drift.**

**F2. Web: `DELETE Submissions/{id}` không có permission check → bypass toàn bộ delete RLS.**
`MegaFormController.cs:988-994` gọi `_subRepo.Delete` trực tiếp với `[Authorize]` trần, trong khi `POST Submissions/Delete` và `BulkDelete` đều qua `CanMutateSubmissions(delete:true)` (`SubmissionSecurity.cs:121-127`). REST alias này vô hiệu hóa quyền delete.

### P1 — High

**F3. Special principals (All Users / Authenticated / Anonymous) không bao giờ match trong `PermissionService`.**
`PermissionService.GetMatchingPermissions` (`MegaForm.Core/Services/PermissionService.cs:105-114`) chỉ so `UserId` và `RoleName`; trong khi `NormalizeRule` lưu special principal với `RoleName=""`, `UserId=null` (`PermissionCatalogService.cs:110-116`). Hệ quả: tick "Authenticated Users → View Submissions" **không có tác dụng** trên DNN/Oqtane/Web (ngoài submit path vốn dùng `MatchesPrincipal` riêng, đúng). Nghịch lý: form chỉ có rule special bị khóa chặt hơn form không có rule nào (`CheckPermission` coi "no rows = open", `:100`).

**F4. `approve` là quyền chết trên cả 4 host.**
`WorkflowTaskService` (Core) authorize claim/approve/reject hoàn toàn bằng assignee + `CandidateUsers/CandidateRoles` của task (`WorkflowTaskService.cs:639-666`); không một nơi nào đọc permission `approve` từ MF_Permissions (grep 0 kết quả). NgườI dùng tick "Approve" trong ma trận sẽ kỳ vọng sai. Approve thật sự đến từ cấu hình node workflow.

**F5. `edit`/`delete` chỉ được enforce trên Web.**
DNN: UpdateData/UpdateStatus/Delete/BulkDelete = Administrators-only, `CanEdit/CanDelete` tồn tại trong Core nhưng 0 call site trong MegaForm.DNN (fail-closed: grant lưu được nhưng vô dụng). Oqtane: chỉ policy `EditModule` (`MegaFormController.cs:2999-3015, 3071-3088`); check `CanEdit` chỉ xuất hiện ở client hinting (`:4340-4342`).

**F6. `export` không phân biệt scope; trên Web/DNN/Umbraco không check key `export` gì cả.**
Oqtane có check `CanExport` nhưng export full tối đa 5000 dòng không lọc scope `own` (`MegaFormController.cs:3039-3049`) — grant "export own" vẫn tải dữ liệu của mọi ngườI. Web export chạy theo view gate; DNN Administrators-only.

**F7. Umbraco: submit pipeline mất actor roles.**
`DoSubmitAsync` gọi `ProcessAsync(formId, formData, ip, ua, userId)` 5 tham số (`MegaForm.Umbraco/Controllers/MegaFormApiController.cs:542-552`) → `EnforceSubmit` nhận `UserContext` rỗng roles, `IsAdmin=false`. Mọi submit rule theo role và admin bypass đều chết trên Umbraco; chỉ rule special/user-id còn tác dụng. Lệch hẳn Web/Oqtane/DNN (truyền full actor).

**F8. Umbraco: schema endpoint không qua `FormAccessProjection`.**
`GET Schema` trả raw `form.SchemaJson` (`MegaForm.Umbraco/Controllers/MegaFormApiController.cs:578-594`) — field-level view restrictions không được chiếu, và các cấu hình nhạy cảm (SQL/external connection trong schema) không bị strip như 3 host kia. Vừa là lỗi phân quyền vừa là rò rỉ thông tin.

**F9. Umbraco: không có row-level security cho submissions.**
`GetSubmission` dùng letter toàn cục, không `FormIdParameter`, không `CanViewSubmissionRow`, không `HoldsTaskForSubmission` (`:559-566`) → group có letter đọc được mọi submission; approver không có letter thì không mở được chính submission mình cần duyệt (gãy UX approval).

### P2 — Medium

**F10. Scope `own` không áp cho list/export/mutations (Web, DNN); DNN còn filter in-memory sau paging** → `TotalCount` sai cho scoped viewer (`MegaFormApiController.cs:2198-2214`). Core có sẵn `IsOwnOnlyViewScope` cho SQL push-down nhưng DNN/Web không gọi (Oqtane có gọi — `:2425-2440`).

**F11. Scope `team` không implement ở đâu cả** — `CanViewSubmission` switch chỉ có `all`/`own`, team rơi vào `false` (deny mọi non-admin). `NormalizeScope` giữ `team`/`team:<field>` nhưng không có consumer. Đồng thờI UI matrix không cho chọn scope (mọi tick = `all`), nên `own`/`team` chỉ tạo được qua API thủ công — catalog definitions cũng chỉ liệt kê `all`/`own`.

**F12. `SendSubmission` (tạo ad-hoc review task) không gate trên Oqtane/Web/Umbraco** — mọi authenticated user route được submissionId bất kỳ cho user bất kỳ. DNN có gate admin.

**F13. Oqtane `Permissions/Save` = bất kỳ module editor nào** (`EditModule` policy, `:661-684`): editor của một MegaForm module có thể ghi grants cho formId của module khác (không check form ownership). Đúng "module-editor model" của Oqtane nhưng rộng hơn kỳ vọng của ma trận (quyền `manage` không đóng vai trò gì).

**F14. Hai cách build `UserContext` trên Web không thống nhất** — `GetCurrentUserContext()` (claims-only, `IsSuperUser=false` cứng, chỉ nhận role "Administrator") vs `GetSubmissionActorWithRoles()` (DB-enriched, nhận thêm `Admin/Administrators/Host`). Cùng một user có thể được coi là admin ở endpoint này nhưng không ở endpoint khác.

### P3 — Observations

- **F15.** DNN lưu bảng `MF_FormPermissions`, 3 host kia `MF_Permissions` — drift danh pháp (không lỗi runtime, nhưng rủi ro khi viết migration/tooling chung).
- **F16.** Oqtane thiếu endpoint BulkDelete (repo method `EfRepositories.cs:302` không có route); Umbraco chỉ có BulkDelete, không có single delete. UI buộc gọi N× DELETE trên Oqtane — mỗi call đều EditModule-gated nên không mất an toàn, nhưng là drift API.
- **F17.** DNN fail-closed hoàn toàn (Administrators-only) cho edit/delete/export/manage: an toàn nhưng ma trận trên DNN thực chất chỉ có ý nghĩa ở `submit` + `view`. NgườI dùng DNN (như screenshot) tick Edit/Delete/Export/Approve/Manage cho role thường sẽ **không thấy gì thay đổi** — đây có thể chính là triệu chứng khiến bạn đặt câu hỏi audit này.
- **F18.** Điểm sáng: `EnforceSubmit` + field policy (deny-wins, readOnlyIf, strip unknown keys, strip hidden-by-showIf) được thiết kế tốt và dùng chung render/submit (`BuildRenderContext`/`BuildFieldAccessPolicy` qua `FormAccessProjection`) trên DNN/Oqtane/Web; admin/superuser bypass nhất quán; DNN `PermissionsController.Save` có normalize + audit log.

## 4. Khuyến nghị (theo thứ tự ưu tiên)

1. **P0:** Web — gate `Permissions/Save` tối thiểu bằng admin/`manage` (align DNN); thêm `CanMutateSubmissions(delete)` cho `DELETE Submissions/{id}` hoặc bỏ route.
2. **P1:** Sửa `PermissionService.GetMatchingPermissions` để match special principals (dùng lại logic `MatchesPrincipal` trong `ServerSidePermissionEnforcementService` — consolidate 1 chỗ).
3. **P1:** Quyết định số phận key `approve`: hoặc wire vào `WorkflowTaskService.CanActorWork` (OR với candidate match), hoặc bỏ khỏi ma trận UI để không lừa ngườI dùng. Tương tự `manage`: hoặc enforce (Permissions/Save, form settings, lock/unlock), hoặc đổi label thành ghi chú "reserved".
4. **P1:** Umbraco — truyền full actor (roles + isAdmin) vào submit pipeline; đưa `FormAccessProjection` vào schema endpoint; thêm row gate cho `GetSubmission` (+ approver-read qua `HoldsTaskForSubmission`).
5. **P1/P2:** Wire `CanEdit/CanDelete/CanExport` vào DNN (thay Administrators-only) và Oqtane (thay EditModule) để 6 quyền có nghĩa đồng nhất; áp scope `own` vào list/export (dùng `IsOwnOnlyViewScope` push-down như Oqtane đã làm) và mutations.
6. **P2:** Implement `team` scope hoặc xóa khỏi `NormalizeScope`; nếu giữ scope `own`, thêm scope picker vào matrix UI (hiện mọi tick đều là `all`).
7. **P2:** Thống nhất `UserContext` builder trên Web; gate `SendSubmission`; thêm form-ownership check vào Oqtane `Permissions/Save`.
8. **P3:** Thống nhất tên bảng permissions (hoặc document rõ divergence); bổ sung BulkDelete cho Oqtane / single delete cho Umbraco nếu UI cần.

## 5. Kết luận

Ma trận "Permissions & Access" hiện **mới đúng ở mức khung** (catalog, lưu trữ, UI, normalize) nhưng **chưa đúng ở mức enforcement**: chỉ `submit` là enforce đầy đủ gần-nhất-quán; `view` enforce thật nhưng lỗi special-principal + scope; `edit/delete/export` tùy host mà có hoặc không; `approve/manage` là config chết; Umbraco chạy hệ quyền song song và bỏ qua phần lớn ma trận. Có 2 lỗ hổng bảo mật thật ở host Web (F1, F2) cần xử lý trước mọi cải tiến tính năng.

---

## 6. Cập nhật 2026-07-28 — trạng thái finding

Commit `2dd59b3` (Codex) enforce 7 permission key trên 4 host, commit `7ae03ed` vá lỗ hổng
mà chính đợt siết đó mở ra. Trạng thái từng finding:

| Finding | Trạng thái | Ghi chú |
|---|---|---|
| **F1** Web `Permissions/Save` mở cho mọi authenticated user | ✅ ĐÓNG (`2dd59b3`) | Gate bằng `CanManage` — empty permission table **không** grant manage |
| **F2** Web `DELETE Submissions/{id}` không check | ✅ ĐÓNG (`2dd59b3`) | Qua `CanMutateSubmission(delete)` như POST twin |
| **F3** special principals không match | ✅ ĐÓNG (`2dd59b3`) | `PermissionService` dùng chung `ServerSidePermissionEnforcementService.MatchesPrincipal` |
| `approve` là quyền chết | ✅ ĐÓNG (`2dd59b3`) | `CanApprove` fail-closed, wire vào workflow |
| `edit/delete/export` không đồng nhất | ✅ ĐÓNG (`2dd59b3`) | 4 host cùng đọc `MF_Permissions` |
| scope `own`/`team` | ✅ ĐÓNG (`2dd59b3` + `7ae03ed`) | Push-down SQL qua `ISubmissionOwnerFilterableRepository`; 3 file Core mà `2dd59b3` phụ thuộc nhưng chưa commit đã vào `7ae03ed` |
| **F-NEW P0** export ẩn danh toàn bộ submission | ✅ ĐÓNG (`7ae03ed`) | Xem dưới |

### F-NEW (P0, phát sinh trong `2dd59b3`) — export ẩn danh dump toàn bộ submission

`2dd59b3` chuyển `Submissions/Export` sang `[AllowAnonymous]` (Web, Oqtane; Umbraco cũng
`[AllowAnonymous]`, DNN opt-out khỏi `[DnnAuthorize]` của controller) trong khi gate per-form
duy nhất là `CanExport` — mà `CheckPermission` trả `true` khi form **không có rule nào**
("no restrictions = open", `PermissionService.cs:196`). Hệ quả: khách chưa đăng nhập tải được
CSV/JSON toàn bộ submission của **mọi form chưa cấu hình permission**. Không lộ production
(`dnndefender.com` chạy 1.7.114, `2dd59b3` chưa đóng gói).

Cách vá (`7ae03ed`):
- Core: thêm `PermissionService.CanBulkExport` — cùng luật match/deny với `CanExport` nhưng
  **fail-CLOSED** khi bảng permission rỗng, và **không bao giờ thỏa mãn cho caller ẩn danh**
  (principal đặc biệt `all_users` khớp cả khách vãng lai — chấp nhận được cho 1 bản ghi sau
  row-level gate, không chấp nhận được cho một bản dump). `CanExport` giữ nguyên ⇒ không mặt
  nào khác đổi hành vi.
- Host: Web + Oqtane export trả về `[Authorize]`; DNN bỏ `[AllowAnonymous]` (kế thừa
  `[DnnAuthorize]`); Umbraco dùng `ViewSubmissionsLetter`. Cả 4 gọi `CanBulkExport`.
- Rule 11: Oqtane/Umbraco export xin `SubmissionQueryService.TrustedMaxPageSize` thay cho
  10000 tự chế (Umbraco đẩy thẳng số đó xuống repository, không có clamp nào phía sau).
- Rule 3: ghi lý do cho các `[AllowAnonymous]` đọc còn lại (public list view + gate fail-closed).
- Test: 8 case ghim chỗ `CanExport`/`CanBulkExport` khác nhau (`BulkExportPermissionTests.cs`).

### Nợ kỹ thuật phát hiện khi verify (KHÔNG do commit nào ở trên gây ra)

Clean checkout của repo **không build được ở tầng host**: 48 file `.cs` chưa bao giờ được
`git add` nhưng code đã-commit tham chiếu tới (`NamedConnectionCatalog` — 15 file HEAD,
`SubmissionDataResolver`, `TypedSubmissionResyncService`, `AiKnowledgeSeedMerger`, và gần như
toàn bộ `MegaForm.Umbraco/Controllers|Services|HostedServices`). Đây là lý do mọi con số
"tests PASS" trước nay đều là của worktree bẩn. `MegaForm.Core` thì build sạch từ clean
checkout — nên phần Core của `7ae03ed` tự đứng được.
