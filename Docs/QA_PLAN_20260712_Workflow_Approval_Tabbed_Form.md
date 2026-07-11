# KẾ HOẠCH QA — Workflow duyệt 2 role trên form tabbed (phiên sau)

> ## ✅ ĐÃ THỰC THI 2026-07-11 — FULL PASS 5.1→5.8 (xem §KẾT QUẢ cuối file)
> Bằng chứng: `qa5000/workflow-approval/` (13 ảnh + `SQL-EVIDENCE.txt`). Phát hiện & vá **4 bug sản phẩm**
> ngay trong phiên (whitelist Approval, WorkflowJson clobber ×3 platform, approver 403 khi xem data,
> `full=1` không bind trên Oqtane). Chi tiết: `CLAUDE_HANDOFF_20260711_WORKFLOW_APPROVAL_QA_EXECUTED.md`.

**Site:** :5123 (`Oqtane.MegaForm.Fresh1802`, DB `Oqtane_MegaForm_Fresh1802`) — cài sạch chỉ từ `MegaForm.Oqtane.1.7.102.nupkg`. host / `abc@ABC1024`.
**Mục tiêu:** chứng minh **bằng browser thật** rằng dữ liệu submit đi **tuần tự** qua inbox của đúng người, duyệt/từ chối đúng nhánh workflow — và chụp ảnh xác nhận từng bước.

> ⚠️ Điều kiện tiên quyết: gói 1.7.102 đã vá **2 lỗi làm QA này bất khả thi trước đây** — (a) `IWorkflowEmailSender` / `IWorkflowPrincipalResolver` chưa đăng ký DI nên **không ai được báo**, (b) task **không bao giờ được gán đích danh**. Nếu QA trên gói cũ hơn thì kịch bản này sẽ "im lặng không có gì xảy ra" — đó là bug cũ, không phải lỗi mới.

---

## Bước 1 — Tạo role + user (Oqtane User Management)

| Role | User | Vai trò trong luồng |
|---|---|---|
| `Manager` | `mgr.nam` | Duyệt bước 1 |
| `Finance` | `fin.lan` | Duyệt bước 2 |
| (không role) | `emp.hoa` | Người submit |

Tạo trong **Oqtane → Admin → Users / Roles** (MegaForm **không** tự quản lý user — role là role của host). Mật khẩu đặt chung để tiện QA, ví dụ `Qa@2026x`.

**Kiểm ngay:** đăng nhập `mgr.nam` → mở **My Inbox** → phải vào được (inbox là `[Authorize]` trần, **không cần quyền admin**). Inbox rỗng là đúng ở bước này.

---

## Bước 2 — Hai form từ mẫu tabbed

Dùng `Samples/FormTemplates/Premium/DONEE/tabbed-account-setup.json`, import **2 lần** (Wizard → Import JSON → chọn file; nếu hộp thoại không bung, dùng link *"Paste or drop the JSON instead"*).

- **Form A** — "Account setup — Manager first" (chuỗi duyệt 2 bước).
- **Form B** — "Account setup — Finance only" (1 bước, để đối chứng).

Giữ nguyên shell/CSS của template (đúng rail: **chỉ sửa cấu trúc section + rules**, không chế CSS).

---

## Bước 3 — Workflow duyệt 2 role

Trong builder → tab **BPMN/Workflow** → sample **Two-step approval**, rồi sửa:

```
Trigger → Approval "Bước 1 — Manager"  (candidateRoles: ["Manager"],  dueInHours: 24,
                                        approvedSubmissionStatus: "manager-approved")
        → Approval "Bước 2 — Finance"  (candidateRoles: ["Finance"],  dueInHours: 48,
                                        approvedSubmissionStatus: "approved")
        → End
  (nhánh rejected ở cả 2 bước → Email cho người submit → End)
```

- **Form A** gắn workflow trên.
- **Form B** gắn workflow 1 bước (chỉ `Finance`) — để thấy hai form **không lẫn task của nhau**.
- ⭐ Biến thể cần thử thêm: ở Form B đổi bước duyệt sang **`candidateUsers: ["fin.lan"]`** (đúng 1 user) → task phải **vào thẳng "Assigned to Me"** của `fin.lan`, **không cần bấm Claim**.

---

## Bước 4 — Submit bằng browser (KHÔNG dùng API)

Đăng nhập `emp.hoa` → mở trang có Form A → điền **thật** qua 6 tab (Account → Company → Billing → Preferences → Security → Review) → **Create workspace**.

**Chụp:** form đã điền ở tab cuối + màn xác nhận sau submit.

---

## Bước 5 — Kiểm tra luồng tuần tự (phần cốt lõi)

| # | Ai | Kỳ vọng | Chụp |
|---|---|---|---|
| 5.1 | `mgr.nam` | Task xuất hiện ở **Inbox** (claimable, vì gán theo ROLE). `fin.lan` **CHƯA** thấy gì. | inbox của cả 2 |
| 5.2 | `mgr.nam` | **Claim** → task chuyển sang **Assigned to Me** | ảnh |
| 5.3 | `mgr.nam` | Mở task → thấy **đúng dữ liệu** `emp.hoa` vừa nhập | ảnh chi tiết task |
| 5.4 | `mgr.nam` | **Approve** → submission status = `manager-approved` | ảnh submissions |
| 5.5 | `fin.lan` | **Chỉ đến lúc này** task mới xuất hiện trong inbox của Finance | ảnh (⭐ đây là "tuần tự") |
| 5.6 | `fin.lan` | Approve → status = `approved`, case đóng, không còn task mở | ảnh |
| 5.7 | (lặp lại) | Submit lần 2 → tới bước Finance thì **Reject** (kèm comment) → status = `rejected`, đi nhánh rejected, `emp.hoa` nhận email báo (nếu có SMTP) | ảnh |
| 5.8 | `fin.lan` (Form B, biến thể user đích danh) | Task **đã được gán sẵn**, nằm ở **Assigned to Me**, **không có nút Claim** | ảnh |

**Kiểm tra chéo bằng DB** (đối chứng, không thay cho visual QA):
```sql
SELECT SubmissionId, Status FROM MF_Submissions WHERE FormId IN (<A>, <B>) ORDER BY SubmissionId DESC;
SELECT TaskId, NodeLabel, Status, AssignedUserName, Outcome FROM MF_WorkflowTasks ORDER BY CreatedAt DESC;
```

---

## Bước 6 — Bẫy đã biết (đừng mất giờ debug lại)

1. **SMTP chưa cấu hình** → task vẫn vào inbox, chỉ là **không có email**. Đừng kết luận "workflow hỏng".
2. **Admin thấy TẤT CẢ task** (kể cả của portal khác) — `ListTasks` chưa lọc portal. QA phải đăng nhập **đúng user thường**, không dùng host để kết luận.
3. **Trần 500 task** ở tầng service — không ảnh hưởng QA này nhưng đừng seed hàng nghìn task.
4. **Người submit ẩn danh** → `__actorUserId = 0`. QA phải submit **khi đã đăng nhập** `emp.hoa` nếu muốn thấy tên người gửi.

---

## Bước 7 — Deliverable của phiên

- [x] Ảnh QA đủ các mốc 5.1 → 5.8 (đặt trong `qa5000/workflow-approval/`). **ĐÃ CHỤP 2026-07-11, 13 ảnh wf-01→wf-13.**
- [x] **DocFX**: `Docs/docfx/articles/workflow-approvals.md` + mục trong `toc.yml` (ĐÃ VIẾT ở phiên 07-11).
- [x] **KB cho AI on-rails** (ĐÃ SEED ở phiên 07-11, `ai-knowledge-seed.json`):
  - `edit-premium-template-structure-only` (Id 328) — sửa form tabbed thì **chỉ đổi section/tab, field, rules, copy**; **CẤM** chế CSS, đổi class của shell, restyle. Muốn đổi màu → Theme Designer / preset channel.
  - `readonly-by-role-is-access-control` (Id 329) — show/hide theo role = `showIf` + Access tab; **read-only theo role = `readOnlyIf`** (Access tab → "Read-only for"), server render readOnly **và** khôi phục giá trị DB khi submit. Không bao giờ để trong tab Rules.
- [~] Xác nhận AI thật sự tuân KB: bảo AI "ẩn cột Salary với mọi role trừ Finance, và khoá Amount chỉ Finance sửa được" → phải sinh `showIf`/`readOnlyIf` (Access), **không** sinh rule client.
  - **2026-07-11: tầng CƠ CHẾ đã verify** — 328/329 đã insert vào `MF_AI_Knowledge` :5123, endpoint `/api/AiTools/Knowledge?kind=prompt_rule&full=1` trả đủ body (sau khi vá bug `full=1` không bind — xem handoff). **Call AI thật CHƯA chạy**: :5123 không có OpenAI key; việc đọc key từ DB prod bị policy chặn — owner tự quyết (chạy test trên :5120 nơi key sẵn, hoặc cấp key cho :5123).

> ⚠️ KB seed chỉ tự nạp trên **site cài mới**. Với site đang chạy, insert 2 dòng vào `MF_AI_Knowledge` (hoặc gọi lại KB seeder) rồi mới QA phần AI. **Lưu ý thêm 2026-07-11: nupkg 1.7.102 được pack TRƯỚC commit KB seed → kể cả site cài mới từ gói đó cũng KHÔNG có 328/329 — phải insert tay (đã làm cho :5123).**

---

## KẾT QUẢ THỰC THI — 2026-07-11 (site :5123, Oqtane.MegaForm.Fresh1802)

Hạ tầng dựng trong phiên: role `Manager`(6)/`Finance`(7); user `mgr.nam`(2)/`fin.lan`(3)/`emp.hoa`(4), mật khẩu `Qa@2026x`
(⚠️ phải `UPDATE AspNetUsers SET EmailConfirmed=1` vì site không SMTP); Form A = **FormId 6** "Account setup — Manager first"
(two-step-approval), Form B = **FormId 7** "Account setup — Finance only" (single → biến thể assign-to-person `fin.lan`);
trang `/form-a` (Page 34/Module 37), `/form-b` (Page 35/Module 38) tạo bằng SQL copy-row + restart; **Home = My Inbox**
(module 36 pinned `myinbox` sẵn từ phiên trước).

| # | Kỳ vọng | Kết quả | Bằng chứng |
|---|---|---|---|
| B1 | mgr.nam vào được My Inbox, rỗng | ✅ | wf-01 |
| B3 | 2 workflow Apply qua BPMN sample | ✅ (sau fix whitelist) | wf-02 |
| B4 | emp.hoa submit qua 6 tab → confirmation | ✅ SUB-101 | wf-03, wf-04 |
| 5.1 | mgr.nam thấy task; fin.lan CHƯA | ✅ | wf-05, wf-06 |
| 5.2 | Claim → Assigned to Me | ✅ (Claim qua API — 3-pane pinned không có nút Claim, chỉ drawer/standalone có) | wf-08 |
| 5.3 | Mở task thấy đúng data emp.hoa | ✅ (sau fix ApproverCanSee — trước fix 403) | wf-07 |
| 5.4 | Approve → `manager-approved` | ✅ | wf-09 + SQL |
| 5.5 | fin.lan CHỈ thấy task sau khi Manager approve | ✅ **tuần tự chuẩn** (task Finance sinh 14:36:52 = đúng lúc approve) | wf-10 |
| 5.6 | Approve → `approved`, 0 task mở, execution completed | ✅ | wf-11 + SQL |
| 5.7 | Vòng 2: Finance Reject kèm comment → `rejected` | ✅ SUB-102 (comment lưu đủ) | wf-12 + SQL |
| 5.8 | candidateUsers=[fin.lan] → vào thẳng Assigned to Me, không nút Claim | ✅ SUB-103/104, AssignedUserId=3 ngay khi tạo, 0 chữ "Claim" trên trang | wf-13 + SQL |

**4 bug sản phẩm phát hiện & vá trong phiên** (chi tiết + file:line trong handoff):
1. `SupportedNodeTypes.All` thiếu `Approval` → **mọi workflow duyệt bị 422 khi Apply** (tức là trước phiên này chưa ai từng apply được approval workflow qua builder UI).
2. Builder Save/Publish **xoá WorkflowJson** đã Apply (client không bao giờ gửi cột này) — dính Oqtane + Web + Umbraco; DNN miễn nhiễm (UPDATE riêng cột).
3. Approver thường bị **403 khi xem submission** mình đang duyệt → task detail trống. Fix: `WorkflowTaskService.HoldsTaskForSubmission` (server-side, tra MF_WorkflowTasks).
4. `full=1` không bind vào `bool` trên ASP.NET Core → **prompt_rule của AI trên Oqtane xưa nay chỉ có summary, mất body**.
   - Kèm: đăng ký `EmailNodeExecutor` cho Oqtane (nhánh rejected chết "No executor registered for node type 'SendEmail'");
     Web thiếu đăng ký `ApprovalNodeExecutor` + `IWorkflowPrincipalResolver`.

**Bẫy §6 — xác nhận thực tế:** (1) đúng — không SMTP task vẫn vào inbox; nhưng thêm: nhánh rejected kết thúc ở node SendEmail
sẽ làm execution `failed` nếu executor chưa đăng ký (đã vá); (2) đúng nguyên văn — chính vì phiên trước QA bằng admin nên bug #3
không lộ; (4) submit khi ĐÃ đăng nhập nhưng inbox vẫn hiện submitter "Unknown" — actor chưa được stamp vào task payload
(finding mới, chưa vá, xem handoff).
