# BÀN GIAO — phiên sau đọc file này trước (viết 2026-07-11, phiên tối)

> Phiên trước làm gì: chạy **trọn** QA workflow duyệt 2 role (`Docs/QA_PLAN_20260712_Workflow_Approval_Tabbed_Form.md`)
> trên :5123 → **FULL PASS 5.1→5.8**, và trên đường đi phát hiện + vá **7 bug sản phẩm**. Cuối phiên audit thêm
> **payment** (owner đặt riêng) → tìm ra **lỗ bypass thanh toán**. Chi tiết đầy đủ:
> `CLAUDE_HANDOFF_20260711_WORKFLOW_APPROVAL_QA_EXECUTED.md` + `Docs/AUDIT_20260711_Payment_Save_And_Process.md`.

---

## 0. TRẠNG THÁI CODE — 9 commit, branch `feat/theme-designer-picker-wizard-gallery-1.7.45`, CHƯA push

| Commit | Nội dung |
|---|---|
| `1830200` | (phiên trước) QA plan + DocFX workflow-approvals + KB rule 328/329 |
| `2941888` | **4 fix workflow**: whitelist `Approval`; WorkflowJson clobber (OQ/Web/Umbraco); approver-403 (OQ); `full=1` không bind; +DI `EmailNodeExecutor`(OQ), `ApprovalNodeExecutor`+`IWorkflowPrincipalResolver`(Web) |
| `a752186` | QA plan cập nhật kết quả + handoff + `qa5000/workflow-approval/SQL-EVIDENCE.txt` |
| `9e99e8a` | **fix DNN**: mirror approver-403 (`CanViewSubmissionRow`) |
| `535fd4f` | **fix inbox**: Forward 400 (UI chìa action trên task đã đóng) + guard notify + resolve target user + ẩn nút Attach chết. **AssetVersion → B395** |
| `666abad` | handoff addendum Forward |
| `1dfdd70` | **fix Oqtane**: `Form/Workflow/Get` trả `Ok()` trần → STJ băm JToken trong `Dictionary<string,object>` → **mở lại editor mất hết roles/users**. Đổi sang `JsonOk` |
| `62bb3ef` | handoff addendum STJ |
| `4e639c8` | **audit payment** (doc, chưa sửa code) |

⚠️ **2 file Umbraco đang modified trong working tree KHÔNG phải của phiên này**
(`Composers/MegaFormComposer.cs` + `Controllers/MegaFormApiController.cs` — thêm policy `MegaFormBackOffice`,
nghi Codex chạy song song). **Đừng commit nhầm vào việc của mình**; hỏi owner trước.

## 1. VIỆC ĐẦU TIÊN NÊN LÀM — chọn 1 trong 2

### A. 🔴 PAYMENT (nếu owner duyệt) — `Docs/AUDIT_20260711_Payment_Save_And_Process.md`
Lỗ **bypass thanh toán**: `SubmissionProcessor` **không có một dòng nào về payment**; widget tự set `status:"paid"`
phía client → server lưu thẳng. POST submission với `{"status":"paid"}` = **submit không trả xu nào**.
Thứ tự vá đề xuất (đã ghi trong doc):
1. Verify server-side khi submit: đọc `transactionId` → gọi Stripe `GET /v1/payment_intents/{id}` / PayPal
   `GET /v2/checkout/orders/{id}` → kiểm status + **số tiền/tiền tệ khớp giá server tự resolve** → không khớp = từ chối;
   ghi số tiền **server xác minh** vào DataJson (không dùng số client).
2. Wire payment cho **Oqtane** (hiện KHÔNG có `PaymentController` → widget 404) và DNN — nên dùng chung
   `MegaForm.Core/Payments` (`IPaymentProvider` có sẵn, đang là dead code).
3. Webhook + verify chữ ký (UI đã thu `WebhookSecret` nhưng **không endpoint nào dùng**) + status `payment_pending`.
4. Rule #7 trong `CLAUDE.md` mô tả field **không tồn tại** (`fixedPrice`/`allowUserAmount`/`minAmount`/`maxAmount`);
   code dùng `amount`/`amountMode`/`currency`, **fail-open** ở mode `field`/`listenTotals`
   (`MegaForm.Web/Controllers/PaymentController.cs:108-111`). Hiện thực cho đúng rule, hoặc sửa rule cho khớp code.
5. Dọn dead code (`/stripe/confirm` không ai gọi) + validate `requiredPaid` phía server.

### B. Đóng nốt các finding của workflow/inbox (nhỏ, rẻ)
1. **Submitter hiện "Unknown"** trong inbox dù người nộp đã đăng nhập → actor không được stamp vào task/case payload.
   Đào `ApprovalNodeExecutor.BuildTask` + workboard payload.
2. **Principal picker lưu candidate user bằng DisplayName** ("Hoa (Employee)") thay vì username (`emp.hoa`) — hiện
   vẫn match được lúc claim nhưng nên chuẩn hoá về username.
3. **3-pane pinned inbox không có nút Claim** (drawer/standalone có) — người dùng chỉ có thể Approve thẳng.
4. **Fields render đôi** trong Details pane; **badge "Assigned to Me" đếm sai** khi task chưa claim.
5. **Web thiếu RLS per-submission**: `Submissions/Get` chỉ `[Authorize]` → **mọi user đăng nhập xem được mọi
   submission**. (Không phải lỗi 403 như DNN — mà là quá thoáng.) Khi thêm gate nhớ kèm `HoldsTaskForSubmission`.
6. Chạy lại nhánh rejected E2E sau khi đã đăng ký `EmailNodeExecutor` (cần SMTP mới thấy mail thật).

## 2. AI on-rails (KB 328/329) — còn 1 việc chờ owner

- KB đã insert tay vào `MF_AI_Knowledge` của :5123; endpoint rails verified (`/api/AiTools/Knowledge?kind=prompt_rule&full=1`
  trả body 1624/1180 chars) sau khi vá bug `full=1` không bind.
- ⚠️ **nupkg 1.7.102 được pack TRƯỚC commit KB seed** → site cài mới từ gói đó **vẫn thiếu 328/329**. Pack lại (1.7.103)
  mới hết phải insert tay.
- **Chưa chạy test AI thật** (obedience): :5123 không có OpenAI key; đọc key từ DB prod bị policy chặn.
  Owner chọn: test trên **:5120** (key sẵn) hoặc cấp key cho :5123. Prompt test: *"ẩn cột Salary với mọi role trừ
  Finance, và khoá Amount chỉ Finance sửa được"* → kỳ vọng AI sinh `showIf`/`readOnlyIf` (Access tab), **không** sinh
  rule client, **không** chế CSS.

## 3. PACKAGE — 1.7.103 chưa pack

:5123 đang chạy DLL **mới hơn** nupkg 1.7.102 (hot-swap `MegaForm.Core.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`,
`MegaForm.Oqtane.Shared.Oqtane.dll` + bundle `megaform-my-inbox.js`). Khi pack 1.7.103 nhớ:
- bump `ModuleInfo.Version` (**bắt buộc**, nuspec bị bỏ qua — không bump thì DLL không swap khi cài),
- AssetVersion đã ở **B395**,
- build Shared+Client+Server Release **net9 + net10** rồi `MegaForm.Oqtane.Package/nuget.exe pack …nuspec -NoPackageAnalysis`
  (KHÔNG có pack.cmd), DNN thì `BuildPackage-DNN.ps1`.

## 4. HẠ TẦNG QA :5123 (`Oqtane.MegaForm.Fresh1802`, DB `Oqtane_MegaForm_Fresh1802`) — dùng lại được ngay

- host/`abc@ABC1024`; **mgr.nam / fin.lan / emp.hoa** đều mật khẩu `Qa@2026x`
  (⚠️ user tạo qua API phải `UPDATE AspNetUsers SET EmailConfirmed=1` không thì login fail im lặng).
- Role: `Manager`(6), `Finance`(7). Form A=**#6** (two-step Manager→Finance), Form B=**#7** (assign đích danh fin.lan).
- Trang: `/form-a` (Page 34/Module 37), `/form-b` (Page 35/Module 38). **Home = My Inbox** (module 36 pinned `myinbox`).
- Submissions: 101 `approved`, 102 `rejected`, 103 (đã forward sang mgr.nam), 104 `approved`.
- Restart: `Stop-Process` PID cổng 5123 → copy DLL → `Start-Process Oqtane.Server.exe --urls http://localhost:5123`
  (WorkingDirectory `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1802`). Session Blazor **sống qua restart**.
- Bằng chứng QA: `qa5000/workflow-approval/` (13 ảnh `wf-01`→`wf-13` — **ảnh không vào git** vì `.gitignore` chặn `*.png`
  toàn repo — + `SQL-EVIDENCE.txt` đã commit).

## 5. BẪY ĐÃ TRẢ GIÁ (đừng vấp lại)

1. ⭐⭐ **STJ × Newtonsoft, biến thể mới**: JToken **trốn trong `Dictionary<string,object>`** (như `WorkflowNode.Config`)
   — không lộ ở signature. Mọi endpoint Oqtane trả model có `Dictionary<string,object>` **phải đi qua `JsonOk`**
   (Newtonsoft), `Ok()` trần sẽ băm nát dữ liệu → UI hiện "trống" trong khi DB nguyên vẹn, và Save từ view đó **ghi
   cái trống đè lên data thật**.
2. ⭐ **Probe HTTP không cần browser**: login qua **FORM** `POST /pages/login/` (form-encoded, kèm
   `__RequestVerificationToken`) — `/api/user/login` **KHÔNG set Identity cookie**; sau login lấy token **MỚI**; gửi
   `X-XSRF-TOKEN-HEADER` + `?moduleid=&authmoduleid=&authsiteid=`. Đọc lỗi: 400 rỗng = antiforgery; 403 rỗng + log
   "User null" = chưa có cookie identity. Dùng `HttpWebRequest` mới đọc được body lỗi (Invoke-WebRequest nuốt).
3. Builder giữ `beforeunload` → `browser_navigate` **timeout 60s im lặng**: accept dialog trước khi rời builder.
4. BPMN overlay `mf-wfrf-overlay` **nuốt click** vào nút builder bên dưới → bấm "Return to App Builder" trước.
5. Wizard "Create Form" tạo form **Draft** → phải "Publish and Return Dashboard".
6. `?formid=N` **KHÔNG đè** được module đã pin `myinbox` → muốn xem form phải có trang riêng.
7. `sqlcmd`: `-W` và `-y` **loại trừ nhau**; cần `-I`.

## 6. ĐỌC THÊM

- `CLAUDE_HANDOFF_20260711_WORKFLOW_APPROVAL_QA_EXECUTED.md` — chi tiết 7 bug + bảng QA + 2 addendum.
- `Docs/QA_PLAN_20260712_Workflow_Approval_Tabbed_Form.md` — kịch bản + §KẾT QUẢ THỰC THI.
- `Docs/AUDIT_20260711_Payment_Save_And_Process.md` — audit payment.
- `CLAUDE_HANDOFF_20260711_ATBE_P0_P2.md` — table binding P0-P2 + P3 (đường GHI) còn dang dở.
