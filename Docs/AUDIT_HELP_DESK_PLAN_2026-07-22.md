# Audit kế hoạch "MegaForm → Help Desk Module (GIBS-style)" cho Oqtane

> Ngày: 2026-07-22 — Kimi Code CLI. **Chỉ audit, chưa code.**
> Đối tượng audit: cuộc hội thoại/kế hoạch do AI khác đề xuất (dựng support ticket app trên MegaForm).
> Phương pháp: kiểm chứng từng claim của kế hoạch với source thật (`MegaForm.Core`, `MegaForm.Oqtane.*`).

---

## 1. Kết luận tổng

Kế hoạch gốc **đúng hướng và khả thi** — MegaForm đúng là có ~70-80% nền tảng (paging API, workflow inbox/role-queue/claim/forward, field permission enforce server-side, starter infrastructure đã proven qua 5 starters). Tuy nhiên kế hoạch có **3 lỗi đánh giá quan trọng** cần chỉnh trước khi triển khai:

1. **Đánh giá quá cao "secure ticket visibility có sẵn"** — thực tế owner-visibility chỉ là opt-in per-row in-memory, không có SQL-level filter, pager sai khi bật RLS, và không tồn tại endpoint/page "My Tickets".
2. **Xếp sai thứ tự ưu tiên bảo mật** — kế hoạch để "security hardening" ở bước cuối, trong khi có **3 lỗ hổng thật đang mở** (Export, Files/Download, DataRepeater anonymous) phải vá TRƯỚC khi dựng ticket app lên trên, vì ticket data là PII nhạy cảm.
3. **Bỏ sót 2 gap kỹ thuật** — workflow inbox paging in-memory (load 500 rồi phân trang RAM) và engine không có khái niệm Reopen (code tự thừa nhận tại `WorkflowTaskService.cs:364-368`).

---

## 2. Kiểm chứng từng claim của kế hoạch gốc

### 2.1 Các claim ĐÚNG

| Claim kế hoạch | Evidence |
|---|---|
| Submission API có `pageIndex/pageSize/status/search/dateFrom/dateTo/TotalCount` | `MegaFormController.cs:2074-2078, 2203`; filter SQL tại `EfRepositories.cs:176-193` |
| Non-admin bị giới hạn page size | clamp 100 (`MegaFormController.cs:2090-2091`), facade 250/5000 (`SubmissionQueryService.cs:47-54`) |
| Workflow inbox/claim/approve/reject/forward/comment có thật | đủ 6 endpoint + MyInbox tại `MegaFormController.WorkflowStarter.cs:21-282` |
| Giao ticket cho role/user, có "role queue" | `WorkflowTaskInstance.CandidateRoles/Users` (`WorkflowHumanTaskModels.cs:109-113`); RoleQueue + claim (`WorkflowTaskService.cs:648-666`); forward `"role:<tên>"` (:293-323) |
| Role-aware render enforce server-side (không chỉ client) | schema projection xóa field bị deny khỏi JSON (`FormAccessProjection.cs:21-48`, `FormSchemaVisibilityFilter.cs:128-152`); submit re-check strip field (`ServerSidePermissionEnforcementService.cs:60-93`) |
| Comment workflow chưa đủ (đúng là gap) | `WorkflowTaskAction` chỉ 1 trường `Comment`, KHÔNG có public/internal, KHÔNG attachment, KHÔNG notify-on-comment (`WorkflowHumanTaskModels.cs:149-176`; `WorkflowTaskService.cs:369-388`) |
| Starter/template infra mạnh | 5 starters tạo form + views + MF permissions + workflow + roles/users Oqtane thật + sample data (`LeaveRequestStarterService.cs:106-351`); workflow library có version pinning + engine resolve (`WorkflowEngineV2.cs:497-505`); template catalog seed từ package (33 JSON) |
| Status có thể custom | `SubmissionInfo.Status` là string tự do (`EntityModels.cs:71`); `POST Submissions/{id}/Status` nhận giá trị bất kỳ (`MegaFormController.cs:2626-2634`); approval node cấu hình được 3 status label (`WorkflowHumanTaskModels.cs:44-46`) |

### 2.2 Các claim SAI hoặc phóng đại

| Claim kế hoạch | Thực tế |
|---|---|
| "Có logic user chỉ xem submission của mình" | **Chỉ một phần**: scope `"own"` (`PermissionService.cs:54-56`) filter **per-row in-memory sau pagination** (`MegaFormController.cs:2168-2176`) → `TotalCount` sai, pager vỡ với dataset lớn. Không có filter `UserId` ở SQL (`SubmissionListQuery` không có trường owner). Không có endpoint "My Submissions" — thứ gần nhất là `Workflow/MyInbox` (inbox của approver, không phải portal ngưởi nộp) |
| "Secure ticket visibility có sẵn" | Owner xem được ticket của mình là **opt-in** (admin phải cấu hình explicit view rule scope "own"), không phải mặc định (`MegaFormController.cs:2035-2044, 2538-2548`) |
| "Scalable paging" (ngụ ý chung) | Chỉ đúng cho submissions. **Workflow inbox load tối đa 500 task rồi paging in-memory** (`WorkflowTaskService.cs:66-89, 590-596`) — nghẽn thật khi queue lớn |
| "Ticket status model cần New/Open/Triaged/.../Reopened" | Submission status string tự do dùng được ngay; nhưng task/case enum **cố định** (`Pending/Claimed/Completed/Cancelled`) và **không có khái niệm Reopen** — code tự ghi *"true return-to-submitter routing is not modelled in the engine yet"* (`WorkflowTaskService.cs:364-368`) |
| SLA/escalation | Có `DueInHours` → `DueAt` (`ApprovalNodeExecutor.cs:245-246`) + KPI `OverdueCount`, nhưng **không có escalation engine, không job quét quá hạn** — kế hoạch liệt "SLA" vào queue UI nhưng không nói engine chưa có |
| Starter "sinh sẵn pages, roles, permissions" | Roles/users Oqtane: **CÓ** (`OqtaneWorkflowIdentityProvisioningService.cs:61-68`). Pages + Oqtane permissions: **KHÔNG** — Page Wizard (`ProvisionPages`) từng tồn tại nhưng đã bị gỡ, chỉ còn trong `Docs/HANDOFF_20260611_MODULE_ROLE_AND_PAGE_WIZARD.md` |

### 2.3 Lỗ hổng bảo mật kế hoạch gốc BỎ SÓT (phát hiện mới trong audit)

| Lỗ hổng | Evidence | Mức độ với ticket data |
|---|---|---|
| `GET Submissions/Export` chỉ `[Authorize(Policy="ViewModule")]` — export tới 5000 rows nguyên form, không per-form permission, không owner check. `PermissionService.CanExport` tồn tại nhưng **không được gọi** | `MegaFormController.cs:2654-2656` vs `PermissionService.cs:37-40` | CAO — user thường có ViewModule là export được toàn bộ ticket |
| `GET Files/Download` chỉ `[Authorize]` — mọi user đăng nhập tải được mọi private upload nếu có path (path lộ trong submission detail) | `MegaFormController.cs:1975-1998` | CAO — attachment ticket (PII) bị IDOR |
| DataRepeater `Query/FilterOptions/ColumnOptions/Export` **không có `[Authorize]`**, tham số SQL do caller kiểm soát qua `__p__*`, không server-side user token; leak SQL error message cho anonymous | `MegaFormController.cs:1339-1418`; `DataRepeaterService.cs:804-817, 151` | CAO — anonymous đọc/export submission data nếu admin dựng widget |

---

## 3. Đánh giá kế hoạch chỉnh sửa code (roadmap gốc)

Roadmap gốc: *MVP → Productize → UX chuyên dụng → Hardening* — **khung đúng, thứ tự sai**. Đề xuất điều chỉnh thành 5 phase, đảo security lên đầu:

### Phase 0 — Vá lỗ hổng (bắt buộc trước, ~nhỏ, rủi ro thấp)
- Wire `PermissionService.CanExport` vào `Submissions/Export` + truyền filter xuống query.
- `Files/Download`: resolve submission từ path → check owner/staff (tái dùng `CanViewSubmissionRow`).
- DataRepeater: thêm `[Authorize]` hoặc cấu hình per-widget `RequireAuth`; thêm token current-user server-side (`:currentuserid`); bỏ `ex.Message` khỏi response.

### Phase 1 — Portal "My Tickets" (gap lớn nhất của claim)
- Thêm `UserId` vào `SubmissionListQuery` + filter ở SQL trong `EfRepositories.List` (sửa cả `TotalCount` khi RLS active — hiện pager sai vì filter in-memory sau phân trang).
- Endpoint mới `GET Submissions/Mine` (authenticated, force `UserId == caller`).
- Owner-grant mặc định trong `CanViewSubmissionRow` (owner luôn xem/print được submission của mình, không cần admin cấu hình rule).
- UI: trang My Tickets + Ticket Detail (reply, upload tiếp) — tái dùng render pipeline.

### Phase 2 — Ticket model chuyên dụng
- Conversation: bảng mới (hoặc mở rộng `WorkflowTaskAction`) với `IsInternal`, attachments per reply, notify-on-comment (hiện chỉ notify khi create/forward).
- Status preset help desk (New/Open/Triaged/WaitingCustomer/Resolved/Closed) — dùng submission status string tự do, không cần đổi enum; **Reopen flow** phải model mới trong engine (gap đã xác nhận).
- SLA: escalation job quét `DueAt` quá hạn → notify/reassign (có thể dùng Oqtane job framework — xem báo cáo scale-out §3.5); lưu ý `BlogScheduledHostedService` đang lỗi "No database provider" trên Oqtane — pattern hosted service cần fix trước khi thêm job mới.

### Phase 3 — Help Desk Starter (productize)
- Clone pattern `LeaveRequestStarterService`: tạo form Submit Ticket + views + roles (Support Agent/Manager) + MF permissions + workflow preset (triage → resolve) + sample data + bind module.
- Nếu cần sinh Oqtane pages: viết lại Page Wizard theo handoff doc (đã bị gỡ khỏi code).

### Phase 4 — Scale
- Workflow inbox paging xuống DB (bỏ load-500-in-memory).
- Indexed ticket fields (ticket number, status, priority, assignee, updated) qua **typed submission storage** — foundation đã có sẵn trong `MegaForm.Core` (branch `feature/typed-submission-storage-core`, xem `Docs/HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`); kế hoạch gốc nói đúng hướng này nhưng không biết foundation đã tồn tại.

---

## 4. Verdict

- Kế hoạch gốc: **APPROVE có điều chỉnh** — kiến trúc đánh giá đúng, nhưng phải (a) đảo Phase 0 security lên trước, (b) hạ kỳ vọng "secure visibility có sẵn" xuống "cần build owner-filter SQL-level", (c) thêm 2 work item bị sót: inbox DB-paging và Reopen flow.
- Tỷ lệ "có sẵn" thực tế sau kiểm chứng: **~65-70%** (thấp hơn con số 70-80% của kế hoạch gốc một chút, chủ yếu vì portal My Tickets hoàn toàn chưa có và 3 lỗ hổng đang mở).
- Ước lượng phần phải build mới hoàn toàn: portal endpoints/UI, conversation model, Reopen, escalation job, Help Desk starter. Phần sửa: Export/Download/DataRepeater guards, owner SQL filter, inbox paging.
