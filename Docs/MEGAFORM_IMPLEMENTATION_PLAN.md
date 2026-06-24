# MegaForm – Implementation Plan: Forward submission to inbox + email notification

## Scope đã xác nhận

- **Platforms:** DNN, Oqtane, Web (ASP.NET Core), Umbraco.
- **Routing:** Static role list (dùng `CandidateRoles` / `CandidateUsers` hiện có). Không thêm rule engine động field→role.
- **Nguyên tắc:** MINIMAL CHANGE – tận dụng core có sẵn, chỉ thêm/abstraction cần thiết, tránh refactor lớn.

---

## Mục tiêu cuối cùng

1. Bất kỳ submission nào (có workflow approval) có thể được forward bởi admin đến **user hoặc role bất kỳ** từ submission detail UI.
2. Khi approval task được tạo, gửi email thông báo đến:
   - Các `CandidateUsers` đã cấu hình.
   - Các user thuộc `CandidateRoles` (qua platform role resolver, nếu platform hỗ trợ).
3. Khi task được forward, gửi email đến user/role target mới.
4. Oqtane: bật `EmailNodeExecutor` + `IWorkflowEmailSender` để workflow email chạy.
5. Umbraco: wire workflow engine + email sender cơ bản để inbox/email hoạt động.
6. DNN & Web: duy trì và mở rộng forward UI.

---

## Thiết kế tổng quan (MINIMAL)

### Abstractions mới

```csharp
// MegaForm.Core/Interfaces/IWorkflowInterfaces.cs (hoặc ICoreInterfaces.cs)
public interface IWorkflowPrincipalResolver
{
    // Resolve 1 identifier (username/email/userId) thành user + email
    UserPrincipal ResolveUser(string identifier, int portalId);
    // Resolve role name thành danh sách user + email
    List<UserPrincipal> ResolveRoleMembers(string roleName, int portalId);
}

public class UserPrincipal
{
    public int? UserId { get; set; }
    public string UserName { get; set; }
    public string DisplayName { get; set; }
    public string Email { get; set; }
}
```

- `IWorkflowPrincipalResolver` optional-inject vào `WorkflowEvaluator` và `ApprovalNodeExecutor` / `WorkflowTaskService`.
- Platform implementations:
  - `DnnWorkflowPrincipalResolver` (DNN)
  - `OqtaneWorkflowPrincipalResolver` (Oqtane)
  - `WebWorkflowPrincipalResolver` (Web – stub/limited, vì Web không có identity store sẵn)
  - `UmbracoWorkflowPrincipalResolver` (Umbraco)

### Mở rộng model

```csharp
// MegaForm.Core/Models/WorkflowHumanTaskModels.cs
public class ApprovalNodeConfig
{
    // existing fields...
    public bool NotifyOnCreate { get; set; } = true;
    public bool NotifyOnForward { get; set; } = true;
    public string NotifyCreateSubject { get; set; }
    public string NotifyCreateBody { get; set; }
    public string NotifyForwardSubject { get; set; }
    public string NotifyForwardBody { get; set; }
}
```

### Mở rộng WorkflowEvaluator

- Thêm token `{{role.RoleName}}` → trả về comma-separated emails (dùng `IWorkflowPrincipalResolver`).
- Thêm token `{{user.identifier}}` → resolve user/email.
- Nếu resolver null hoặc không tìm thấy → trả về chuỗi rỗng (không fail workflow).

### Hook gửi email

1. **Task created** trong `ApprovalNodeExecutor.ExecuteAsync` (sau `_repo.AddTaskAction`):
   - Nếu `NotifyOnCreate == true`, resolve `CandidateUsers` + `CandidateRoles` thành danh sách email.
   - Dùng `IWorkflowEmailSender.SendAsync` với subject/body từ config hoặc default template.
2. **Task forwarded** trong `WorkflowTaskService.ForwardTaskAsync` (sau audit action):
   - Nếu `NotifyOnForward == true`, resolve target user/role thành email.
   - Gửi email thông báo forward.

### Admin free forward UI

- `MegaForm.UI/src/submissions/submission-detail-workflow-panel.ts`:
  - Khi actor là admin/superuser, luôn hiển thị forward button và picker (text input / searchable select).
  - Cho phép nhập user hoặc role bất kỳ.
  - Payload giữ nguyên `targetUser`; nếu là role, prefix `role:` (ví dụ `role:IT_Manager`).
- `WorkflowTaskService.ForwardTaskAsync`:
  - Nếu `targetUser` bắt đầu bằng `role:`, cập nhật `task.CandidateRoles` (thêm role đó) và đặt task về `Pending` / unassigned.
  - Nếu là user, cập nhật `AssignedUserId`/`AssignedUserName` như hiện tại.
  - Admin/superuser luôn được phép forward (đã đúng trong `CanActorWork`).

---

## Pha triển khai

### Pha 1: Chuẩn bị abstraction + platform resolver (minimal)

**Files sửa:**
- `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs` – thêm `IWorkflowPrincipalResolver`, `UserPrincipal`.
- `MegaForm.Core/Services/WorkflowEvaluator.cs` – inject resolver optional, thêm token `{{role.}}` / `{{user.}}`.
- `MegaForm.DNN/Services/DnnWorkflowPrincipalResolver.cs` – mới.
- `MegaForm.Oqtane.Server/Services/OqtaneWorkflowPrincipalResolver.cs` – mới.
- `MegaForm.Web/Services/WebWorkflowPrincipalResolver.cs` – mới (stub/limited).
- `MegaForm.Umbraco/Services/UmbracoWorkflowPrincipalResolver.cs` – mới.
- DI registrations:
  - DNN: `MegaForm.DNN/Services/DnnServiceLocator.cs`
  - Oqtane: `MegaForm.Oqtane.Server/Services/Startup.cs`
  - Web: `MegaForm.Web/Program.cs`
  - Umbraco: `MegaForm.Umbraco/Composers/MegaFormComposer.cs`

### Pha 2: Email notification khi task tạo / forward

**Files sửa:**
- `MegaForm.Core/Models/WorkflowHumanTaskModels.cs` – thêm `NotifyOnCreate`, `NotifyOnForward`, templates.
- `MegaForm.Core/Workflow/ApprovalNodeExecutor.cs` – inject `IWorkflowEmailSender` + `IWorkflowPrincipalResolver`, gửi email sau khi tạo task.
- `MegaForm.Core/Services/WorkflowTaskService.cs` – inject `IWorkflowEmailSender` + `IWorkflowPrincipalResolver`, gửi email sau forward.
- `MegaForm.Core/Services/EmailNotificationService.cs` – thêm helper build task notification email + tokens task-specific.
- `MegaForm.Core/Workflow/EmailNodeExecutor.cs` – (Oqtane only) chạy được sau khi register.

**Platform wiring cập nhật:**
- DNN: `DnnServiceLocator.cs` truyền `WorkflowEmail` vào `ApprovalNodeExecutor`.
- Oqtane: đăng ký `IWorkflowEmailSender` + `EmailNodeExecutor` trong `Startup.cs`.
- Web: đã có `IWorkflowEmailSender`, chỉ cần update `ApprovalNodeExecutor` DI.
- Umbraco: đăng ký `IWorkflowEmailSender` + `IWorkflowEngine` + workflow repositories/executors cơ bản.

### Pha 3: Admin forward tự do đến user/role bất kỳ

**Files sửa:**
- `MegaForm.UI/src/submissions/submission-detail-workflow-panel.ts` – bỏ giới hạn candidateUsers, thêm free-text picker cho admin.
- `MegaForm.UI/src/submissions/SubmissionModal.ts` (hoặc caller) – truyền flag admin vào controller.
- `MegaForm.Core/Services/WorkflowTaskService.cs` – xử lý `role:` prefix trong `ForwardTaskAsync`.
- `MegaForm.Core/Services/WorkflowTaskService.cs` – ghi audit action rõ ràng cho role-forward.

### Pha 4: UI builder config cho notification templates

**Files sửa:**
- `MegaForm.UI/src/builder/workflow/wf-approval.ts` – thêm checkbox `Notify on create`, `Notify on forward`, và textarea subject/body.
- `MegaForm.UI/src/builder/workflow/wf-approval-config.ts` – serialize/deserialize các trường mới.

### Pha 5: Umbraco workflow parity + Oqtane executor completeness

**Files sửa:**
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs` – đăng ký `IWorkflowEngine`, `IWorkflowRepository`, `IWorkflowEvaluator`, node executors cần thiết, `WorkflowTaskService`, `IWorkflowEmailSender`.
- `MegaForm.Umbraco/Services/UmbracoEmailSender.cs` – thay thế no-op bằng SMTP sender (tái sử dụng cấu hình Umbraco/MegaForm).
- `MegaForm.Oqtane.Server/Services/Startup.cs` – đăng ký thêm `WebhookNodeExecutor`, `DatabaseNodeExecutor`, `AddRole/User/UserToRole` executors nếu cần (hoặc ít nhất `EmailNodeExecutor` + `IWorkflowEmailSender`).

---

## Kiểm thử

### Unit tests nên thêm
- `WorkflowEvaluatorTests` cho token `{{role.X}}` / `{{user.X}}` với fake resolver.
- `ApprovalNodeExecutorTests` xác nhận email sender được gọi khi `NotifyOnCreate = true`.
- `WorkflowTaskServiceTests` xác nhận email sender được gọi khi forward.

### Kiểm thử thủ công
- DNN: form có approval node với `CandidateRoles = ["Administrator"]`, submit, kiểm tra email log.
- Web: tương tự, kiểm tra `App_Data/MegaForm/email/*.log`.
- Oqtane: sau khi register `EmailNodeExecutor`, chạy workflow SendEmail node.
- Umbraco: submit form có workflow, kiểm tra task tạo và email log.

---

## Rủi ro & hạn chế

1. **Web role resolution:** Web không có identity store sẵn. `WebWorkflowPrincipalResolver` sẽ là stub (return empty) hoặc chỉ resolve current actor. Cần ghi log warning.
2. **Umbraco effort:** Umbraco chưa có workflow wiring nào. Pha 5 là lớn nhất.
3. **Breaking change constructor:** `WorkflowEvaluator`, `ApprovalNodeExecutor`, `WorkflowTaskService` thêm dependency. Cần optional constructor parameters hoặc cập nhật tất cả platform DI.
4. **Email spam:** Gửi email đến cả role queue có thể spam nhiều user. Flags `NotifyOnCreate` mặc định `true` nhưng admin có thể tắt.

---

## Deliverables

- Code changes theo 5 pha trên.
- Cập nhật `Docs/MEGAFORM_INBOX_FORWARD_AND_EMAIL_NOTIFICATION_AUDIT.md` nếu cần.
- Không thay đổi schema DB (tận dụng `MF_WorkflowTasks`/`MF_WorkflowTaskActions`).


---

## Ghi chú phiên hiện tại

- **Phiên này chỉ hoàn thành tài liệu plan.**
- **Triển khai code (5 pha) sẽ được thực hiện ở phiên làm việc tiếp theo**, sau khi plan được phê duyệt.
- Tài liệu này là cơ sở để bắt đầu sửa code: nó xác định scope (4 platform, static role list), các abstraction cần thêm, và danh sách file cần thay đổi theo từng pha.
