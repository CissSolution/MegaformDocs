# KẾ HOẠCH QA — Workflow duyệt 2 role trên form tabbed (phiên sau)

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

- [ ] Ảnh QA đủ các mốc 5.1 → 5.8 (đặt trong `qa5000/workflow-approval/`).
- [x] **DocFX**: `Docs/docfx/articles/workflow-approvals.md` + mục trong `toc.yml` (ĐÃ VIẾT ở phiên 07-11).
- [x] **KB cho AI on-rails** (ĐÃ SEED ở phiên 07-11, `ai-knowledge-seed.json`):
  - `edit-premium-template-structure-only` (Id 328) — sửa form tabbed thì **chỉ đổi section/tab, field, rules, copy**; **CẤM** chế CSS, đổi class của shell, restyle. Muốn đổi màu → Theme Designer / preset channel.
  - `readonly-by-role-is-access-control` (Id 329) — show/hide theo role = `showIf` + Access tab; **read-only theo role = `readOnlyIf`** (Access tab → "Read-only for"), server render readOnly **và** khôi phục giá trị DB khi submit. Không bao giờ để trong tab Rules.
- [ ] Xác nhận AI thật sự tuân KB: bảo AI "ẩn cột Salary với mọi role trừ Finance, và khoá Amount chỉ Finance sửa được" → phải sinh `showIf`/`readOnlyIf` (Access), **không** sinh rule client.

> ⚠️ KB seed chỉ tự nạp trên **site cài mới**. Với site đang chạy, insert 2 dòng vào `MF_AI_Knowledge` (hoặc gọi lại KB seeder) rồi mới QA phần AI.
