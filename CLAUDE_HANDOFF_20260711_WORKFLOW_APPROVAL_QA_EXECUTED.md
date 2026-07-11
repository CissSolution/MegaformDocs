# HANDOFF 2026-07-11 (phiên tối) — THỰC THI QA workflow duyệt 2 role + 4 bug fix

## TL;DR

Chạy **toàn bộ** `Docs/QA_PLAN_20260712_Workflow_Approval_Tabbed_Form.md` trên :5123 bằng browser thật
(Playwright, đăng nhập đúng từng user thường) → **FULL PASS 5.1→5.8**, 13 ảnh + SQL evidence trong
`qa5000/workflow-approval/`. Trên đường đi phát hiện **4 bug sản phẩm** làm kịch bản này bất khả thi
hoặc mù dữ liệu — đã vá, build sạch mọi target, hot-swap lên :5123 và re-verify từng cái.

## Trạng thái QA (bảng kiểm plan)

| Mốc | Kết quả |
|---|---|
| B1 role/user + inbox rỗng | ✅ (users tạo qua API Oqtane; ⚠️ phải `EmailConfirmed=1` tay vì không SMTP) |
| B2 import tabbed ×2 | ✅ Form A=#6, Form B=#7 (import qua `setInputFiles` — không dính bẫy CDP-nuốt-dialog) |
| B3 gắn workflow | ✅ sau fix #1; Apply ghi thẳng DB (builder Save không cần — và trước fix #2 còn XOÁ nó) |
| B4 submit 6 tab | ✅ SUB-101 (và SUB-102, 103, 104 cho các vòng sau) |
| 5.1 tuần tự nửa đầu | ✅ mgr thấy, fin CHƯA (wf-05/06) |
| 5.2 Claim → Assigned to Me | ✅ (qua API `Workflow/Tasks/Claim` bằng session mgr.nam — 3-pane pinned KHÔNG có nút Claim, chỉ drawer/standalone có → finding UX) |
| 5.3 thấy data người nộp | ✅ sau fix #3 (trước fix: 403 → pane trống) (wf-07) |
| 5.4 approve → `manager-approved` | ✅ UI composer "Confirm Approval" (wf-09) |
| 5.5 fin CHỈ thấy sau approve | ✅ ⭐ task Finance sinh đúng 14:36:52 = giây approve (wf-10) |
| 5.6 approve → `approved`, đóng case | ✅ 0 task mở, execution completed (wf-11) |
| 5.7 reject kèm comment → `rejected` | ✅ SUB-102, comment lưu; textarea reject là "Reason for rejection (required)" (wf-12) |
| 5.8 candidateUsers=[fin.lan] | ✅ SUB-103/104 gán sẵn AssignedUserId=3 NGAY khi tạo, 0 chữ "Claim" trên trang (wf-13) |

DB cuối phiên: 101=`approved`, 102=`rejected`, 103/104=`pending_approval` (task direct đang mở cho fin.lan).

## 4 BUG đã vá (kèm file — tất cả build 0 lỗi: Core all-TFM, OQ net9+net10, Web, Umbraco, DNN)

1. **Whitelist thiếu Approval → 422 "type 'Approval' is not supported by the backend runtime" khi Apply.**
   `MegaForm.Core/Models/WorkflowModels.cs` — thêm `WorkflowNodeType.Approval` vào `SupportedNodeTypes.All`.
   Executor có thật và đã đăng ký DI ở cả 4 platform-side, sample chính hãng dùng nó — chỉ whitelist bị bỏ quên.
   **Hệ quả trước fix: chưa ai từng Apply được workflow duyệt qua builder UI** (1.7.102 fix DI notify nhưng không ai bấm Apply thật).

2. **Builder Save/Publish XOÁ WorkflowJson đã Apply** — toolbar (`MegaForm.UI/src/builder/toolbar.ts` buildSavePayload)
   không bao giờ gửi `WorkflowJson` → save full-entity đè NULL. Vá kiểu "absent = giữ nguyên; '' tường minh = xoá":
   - Oqtane: `MegaFormController.cs` trước `ToEntity(dto)` (`[WfApplyClobber v20260711]`).
   - Web: `MegaForm.Web/Data/DataLayer.cs` `SaveForm` (trước coalesce `?? ""`).
   - Umbraco: `MegaForm.Umbraco/Data/EfRepositories.cs` `SaveForm` (SetValues copy cả null → restore sau SetValues).
   - DNN: **miễn nhiễm** — SP `usp_MF_Form_Upsert` không có cột WorkflowJson; `DnnWorkflowRepository` UPDATE riêng cột.
   Verified: form 6 Apply → builder Save → WorkflowJson còn nguyên (6777 chars).

3. **Approver thường 403 khi xem submission mình duyệt** — inbox enrich gọi `GET Submissions/{id}`, gate
   `CanViewSubmissionRow` không biết khái niệm "người đang cầm task". Vá:
   - `MegaForm.Core/Services/WorkflowTaskService.cs` — method public mới `HoldsTaskForSubmission(submissionId, actor)`
     (assignee mọi trạng thái, hoặc candidate khi task còn mở — tra MF_WorkflowTasks server-side, không tin client).
   - `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:CanViewSubmissionRow` gọi nó sau check IsAuthenticated.
   **Twin đã rà đủ 3 (agent):**
   - **DNN: DÍNH — ĐÃ VÁ** (`MegaForm.DNN/WebApi/MegaFormApiController.cs:CanViewSubmissionRow` ~1860 — gate copy
     nguyên văn bản pre-fix Oqtane; mirror qua `DnnServiceLocator.Instance.WorkflowTasks.HoldsTaskForSubmission`, build 0 lỗi).
   - **Web: KHÔNG dính** — `Submissions/Get` chỉ `[Authorize]`, KHÔNG có per-row gate nào → approver xem được.
     ⚠️ Ngược lại là **quá thoáng**: Web không có RLS per-submission — mọi user authenticated xem được mọi submission.
     Đây là hardening riêng cho phiên sau (khi thêm gate, nhớ kèm `HoldsTaskForSubmission`).
   - **Umbraco: KHÔNG dính** — `GetSubmission` gate bằng đúng policy `MegaFormBackOffice` mà inbox cũng cần;
     member front-end không vào được back-office nên kịch bản không tái hiện.

4. **`full=1` không bind vào `bool` trên ASP.NET Core** → `AiTools/Knowledge` trên Oqtane trả `body=null` cho chat.ts
   (client gửi đúng `full=1` như DNN) → **prompt_rule của AI on-rails Oqtane xưa nay chỉ có summary**. Vá
   `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:ListKnowledge` — bind string, nhận cả `1`/`true`.
   Verified: `full=1` giờ trả body 1624/1180 chars cho 328/329.

Kèm 2 đăng ký DI thiếu:
- Oqtane `Services/Startup.cs`: + `EmailNodeExecutor` (nhánh rejected của sample chết
  `No executor registered for node type 'SendEmail'` → execution `failed`; adapter OqtaneWorkflowEmailSender đã review
  từ 1.7.102 nên SendEmail tốt nghiệp khỏi danh sách opt-in; **Webhook/Database/GoogleSheets vẫn opt-in có chủ đích**).
- Web `Program.cs`: + `ApprovalNodeExecutor` + `IWorkflowPrincipalResolver` (Web trước đây không chạy được node Approval).

## KB AI on-rails (328/329)

- nupkg 1.7.102 pack TRƯỚC commit seed → :5123 (cài từ gói) KHÔNG có 2 rule → **đã insert tay** vào `MF_AI_Knowledge`
  (IDENTITY_INSERT; WidgetType/Surface NOT NULL → dùng `N''`). Script mẫu: sinh từ `ai-knowledge-seed.json`.
- Rails verified: `/api/AiTools/Knowledge?kind=prompt_rule&full=1` trả đủ body cả 2 rule (sau fix #4).
- **Call AI thật chưa chạy**: :5123 không có OpenAI key; policy phiên chặn đọc key từ DB prod (đúng — không kéo
  credential vào transcript). Owner chọn: chạy obedience test trên :5120 (key sẵn) hoặc tự cấp key cho :5123 rồi
  prompt: "ẩn cột Salary với mọi role trừ Finance, khoá Amount chỉ Finance sửa được" → kỳ vọng `showIf`/`readOnlyIf`
  (Access tab), KHÔNG sinh rule client, KHÔNG chế CSS.

## Finding CHƯA vá (phiên sau)

1. **Submitter hiện "Unknown"** trong task list/detail dù emp.hoa đăng nhập khi submit — actor không được stamp vào
   task/case payload (bẫy §6.4 của plan nói về anonymous, nhưng đây là user thật vẫn Unknown). Đào `BuildTask`/case
   trong `ApprovalNodeExecutor` + workboard payload.
2. **3-pane pinned inbox không có nút Claim** (drawer/standalone có) — user phải Approve thẳng (server cho phép
   candidate act từ pending) nhưng UX "Claim để giữ chỗ" không truy cập được từ surface chính.
3. **Fields render đôi** trong Details pane (mỗi field xuất hiện 2 lần trong text dump — soi `enrich.ts`/view render).
4. **Badge "Assigned to Me = 1" khi task chưa claim** (đếm bucket sai ở đâu đó trong workboard mapping).
5. ~~Twin của fix #3~~ → ĐÃ RÀ + VÁ DNN trong phiên (xem mục fix #3). Còn lại: **Web thiếu RLS per-submission**
   (mọi user authenticated xem được mọi submission qua `Submissions/Get` — quá thoáng, hardening phiên sau).
6. Execution `failed` của SUB-102 là TRƯỚC khi đăng ký EmailNodeExecutor; sau fix chưa re-run nhánh rejected
   end-to-end (cần SMTP mới thấy mail thật — không chặn: status submission vẫn đúng vì task service set trước).

## Hạ tầng :5123 sau phiên

- Site đang chạy DLL **mới hơn nupkg 1.7.102**: hot-swap `MegaForm.Core.dll` + `MegaForm.Oqtane.Server.Oqtane.dll`
  (Release net10.0) — nguồn = working tree phiên này. Gói 1.7.103 CHƯA pack (làm khi gom thêm fix).
- Users/roles/forms/pages như bảng trên; Home vẫn pinned My Inbox; `/form-a` `/form-b` live.
- Restart lệnh: `Stop-Process` PID cổng 5123 → copy DLL → `Start-Process Oqtane.Server.exe --urls http://localhost:5123`
  (WorkingDirectory `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1802`). Session Blazor sống qua restart.

## Bẫy phiên này trả giá (mới)

- **Builder giữ `beforeunload` dialog** → `browser_navigate` timeout 60s im lặng. Luôn `handle_dialog accept` trước khi rời builder.
- **BPMN overlay `mf-wfrf-overlay` nuốt click** vào nút builder bên dưới — bấm "Return to App Builder" trước.
- **sqlcmd `-W` và `-y` loại trừ nhau**; `STRING_AGG` output dài phải dùng `-y 8000`.
- Oqtane User API: tạo user OK nhưng `EmailConfirmed=0` → login fail im lặng nếu quên UPDATE.
- Wizard "Create Form" tạo form **Draft** — form 6 phải publish riêng ("Publish and Return Dashboard").
- `?formid=N` KHÔNG đè được module pinned `myinbox` — cần trang riêng cho form.
