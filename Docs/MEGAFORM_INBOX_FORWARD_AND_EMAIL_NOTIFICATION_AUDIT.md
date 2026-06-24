# MegaForm – Rà soát: Forward submission vào inbox + kiểm tra email notification

> **Yêu cầu:** Đề xuất cách làm (không sửa code) để:
> 1. Một form submission bất kỳ có thể được admin hoặc workflow forward vào inbox của user theo role hoặc rule-based.
> 2. Kiểm tra xem email notification hiện đã hoạt động chưa.
>
> **Phạm vi:** Tài liệu này chỉ phân tích và đề xuất, không chỉnh sửa source code.
>
> **Ngày rà soát:** 2026-06-12

---

## 1. Tóm tắt nhanh trạng thái hiện tại

| Chức năng | Trạng thái hiện tại | Ghi chú |
|-----------|---------------------|---------|
| **Inbox / task list** | Đã có core (`WorkflowTaskService`, `MF_WorkflowTasks`, `MF_WorkflowCases`) | DNN & Web đầy đủ; Oqtane thiếu một số executor; Umbraco chưa wire. |
| **Forward task** | Đã có API (`WorkflowTaskService.ForwardTaskAsync`) | Chỉ forward được đến user đã được cấu hình sẵn trong `CandidateUsers`; chưa hỗ trợ forward tự do đến user/role bất kỳ. |
| **Role-based routing** | Có cơ bản (`ApprovalNodeConfig.CandidateRoles`) | Chỉ là danh sách role tĩnh; chưa có rule engine để chọn role/user động theo dữ liệu submission. |
| **Email notification** | Legacy + Workflow đều có | DNN & Web hoạt động; **Oqtane chưa đăng ký `EmailNodeExecutor`** nên workflow email không chạy; **Umbraco `IEmailSender` là no-op**. |
| **Email test endpoint** | Có trên DNN & Web | DNN: `ModuleConfig/EmailSettingsTest`; Web: `api/MegaForm/ModuleConfig/EmailSettings/Test`. Oqtane không có endpoint test riêng. |
| **Retry / queue email** | Không có | Email gửi đồng bộ trong `SubmissionProcessor`; lỗi chỉ log, không retry. |

**Kết luận ngắn:** Nền tảng inbox/task đã có, nhưng khả năng *forward bất kỳ submission đến user/role theo điều kiện* còn hạn chế. Email notification chạy được trên DNN/Web nhưng cần cấu hình và kiểm tra; Oqtane/Umbraco còn thiếu sót rõ ràng.

---

## 2. Kiến trúc submission, workflow và inbox hiện tại

### 2.1. Vòng đờiform submission

Tất cả platform đều đi qua `SubmissionProcessor.ProcessAsync`:

```
[Platform Submit API]
    ↓
SubmissionProcessor.ProcessAsync  (MegaForm.Core/Services/SubmissionProcessor.cs:84-400)
    ↓
Load form → Validate → Anti-spam → Save MF_Submissions + MF_SubmissionValues
    ↓
Nếu KHÔNG có workflow đang áp dụng:
    EmailNotificationService.SendAdminNotification()
    EmailNotificationService.SendAutoresponder()
    WebhookService.SendWebhookAsync()
Nếu CÓ workflow đang áp dụng:
    WorkflowEngineV2.ExecuteAsync()
        → ApprovalNodeExecutor tạo WorkflowTaskInstance
        → SendEmail node gọi EmailNodeExecutor
```

### 2.2. Cấu trúc inbox / task

| Thành phần | File / Bảng | Vai trò |
|------------|-------------|---------|
| `WorkflowTaskService` | `MegaForm.Core/Services/WorkflowTaskService.cs` | Core xử lý claim, approve, reject, forward, inbox query. |
| `MF_WorkflowTasks` | `MegaForm.DNN/SqlScripts/01_CreateTables.sql` | Lưu task: `TaskId`, `CaseId`, `SubmissionId`, `CandidateRoles`, `CandidateUsers`, `AssignedUserId`, ... |
| `MF_WorkflowCases` | Cùng script trên | Lưu case theo từng execution. |
| `MF_WorkflowTaskActions` | Cùng script trên | Audit log hành động (`Created`, `Claimed`, `Forwarded`, ...). |
| `ApprovalNodeConfig` | `MegaForm.Core/Models/WorkflowHumanTaskModels.cs:35` | `CandidateRoles`, `CandidateUsers`, `AllowClaim`, `AllowForward`, `AllowReassign`. |
| `WorkflowTaskInstance` | `MegaForm.Core/Models/WorkflowHumanTaskModels.cs:90` | Runtime task model. |

### 2.3. Admin UI hiện có

| Platform | List submissions | Detail / workflow actions |
|----------|------------------|---------------------------|
| DNN | `MegaForm.DNN/Views/Submissions.ascx` | `MegaForm.UI/src/submissions/SubmissionModal.ts` + `submission-detail-workflow-panel.ts` |
| Web | `MegaForm.Web/Views/Admin/Submissions.cshtml` | Cùng TS app trên |
| Oqtane | `MegaForm.Oqtane.Client/SubmissionsView.razor` | Cùng TS app trên |

Các action trong submission detail: `claim | approve | reject | forward`.

**Lưu ý quan trọng:** Forward trong UI hiện tại chỉ hiển thị dropdown nếu task có `candidateUsers` được cấu hình sẵn (`resolveForwardTargets` trong `submission-detail-workflow-panel.ts:341`). UI note rõ ràng: *“Forward is available only when this BPMN task has explicit delegate users configured. Generic free-text forwarding has been disabled here.”*

### 2.4. Rule / condition engine

| Thành phần | File | Ghi chú |
|------------|------|---------|
| `ConditionRule`, `ConditionGroup` | `MegaForm.Core/Models/RuleModels.cs` | Mô hình rule. |
| `WorkflowEvaluator.EvaluateCondition` | `MegaForm.Core/Services/WorkflowEvaluator.cs:25` | Hỗ trợ `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `isEmpty`, ... |
| `WorkflowEvaluator.ResolveExpression` | `MegaForm.Core/Services/WorkflowEvaluator.cs:146` | Hỗ trợ token `{{field.key}}`, `{{variable.name}}`, `{{submission.id}}`, `{{form.id}}`, `{{execution.id}}`. **Chưa hỗ trợ `{{role.*}}` hay `{{user.*}}`**. |

---

## 3. Email notification – hoạt động như thế nào và đã chạy chưa?

### 3.1. Hai đường gửi email

#### A. Legacy (khi form không gắn workflow)

`EmailNotificationService` (`MegaForm.Core/Services/EmailNotificationService.cs`):

| Hàm | Trigger | Config nguồn | Token hỗ trợ |
|-----|---------|--------------|--------------|
| `SendAdminNotification` | Sau submit | `MF_Forms.NotifyEmails`, `MF_Forms.NotifyTemplate` | `{{submission_id}}`, `{{form_title}}`, `{{submitted_date}}`, `{{ip_address}}`, `{{all_fields}}`, `{{fieldKey}}` |
| `SendAutoresponder` | Sau submit | `MF_Forms.AutoresponderEnabled`, `AutoresponderEmailField`, `AutoresponderSubject`, `AutoresponderBody` | Tương tự |

#### B. Workflow (khi form có applied workflow)

`EmailNodeExecutor` (`MegaForm.Core/Workflow/EmailNodeExecutor.cs`):

- Node type: `SendEmail`.
- Resolve `To`, `Cc`, `Subject`, `Body`, `ReplyTo` qua `WorkflowEvaluator.ResolveExpression`.
- Gửi qua `IWorkflowEmailSender` → platform adapter.

### 3.2. Platform-specific email sender

| Platform | Implementation | Cấu hình | Trạng thái |
|----------|----------------|----------|------------|
| **DNN** | `MegaForm.DNN/Services/DnnEmailSender.cs` | DNN Host SMTP hoặc Portal settings prefix `MegaForm_Email_*` | ✅ Hoạt động |
| **Web (ASP.NET Core)** | `MegaForm.Web/Services/WebServices.cs` → `SmtpEmailSender` | `appsettings.json` section `Email:*` hoặc `MF_ModuleSettings` key `Email_*` | ✅ Hoạt động |
| **Oqtane** | `MegaForm.Oqtane.Server/Services/Startup.cs` → `OqtaneEmailSender` | `MegaForm:Smtp:*` trong appsettings hoặc env vars `MEGAFORM_SMTP_*` | ⚠️ Legacy email chạy được, **workflow SendEmail KHÔNG chạy** vì `EmailNodeExecutor` chưa được register. |
| **Umbraco** | `MegaForm.Umbraco/Services/PlatformServices.cs` → `UmbracoEmailSender` | Không có | ❌ `Send()` rỗng, `GetHostEmail()` trả `noreply@example.com`. |

### 3.3. Điểm đăng ký executor quan trọng

- **Web:** `MegaForm.Web/Program.cs:80` đăng ký `EmailNodeExecutor`. ✅
- **DNN:** `MegaForm.DNN/Services/DnnServiceLocator.cs:108` tạo `EmailNodeExecutor`. ✅
- **Oqtane:** `MegaForm.Oqtane.Server/Services/Startup.cs:96-109` **không** đăng ký `EmailNodeExecutor`, `WebhookNodeExecutor`, `DatabaseNodeExecutor`, `AddRoleNodeExecutor`, ... ❌
- **Umbraco:** Không đăng ký `IWorkflowEngine` hay bất kỳ executor nào. ❌

### 3.4. Logging & retry

- Mỗi platform có `ILogService` ghi lỗi (DNN EventLog, Web file log `App_Data/MegaForm/email/{source}.log`, Oqtane `ILogger`).
- **Không có retry**, **không có queue**, **không có dead-letter** cho email lỗi.
- Lỗi SMTP sẽ chỉ xuất hiện trong log và execution log (workflow).

---

## 4. Gap analysis – cái gì còn thiếu để “forward submission vào inbox user theo role/rule”?

### 4.1. Thiếu resolver động: role/rule → user/email

Hiện tại:
- `CandidateRoles` và `CandidateUsers` trong `ApprovalNodeConfig` là **danh sách tĩnh**.
- `WorkflowEvaluator.ResolveExpression` chưa hỗ trợ `{{role.Managers}}`, `{{user.managerOf(field.department)}}`, `{{rule.approvers}}`.
- Không có service chuẩn để lấy danh sách user/email thuộc một role theo điều kiện submission.

Cần:
- Một abstraction `IWorkflowPrincipalResolver` hoặc mở rộng `IWorkflowEvaluator` để resolve role/user động.
- Platform providers: DNN (`RoleController.GetUsersByRole`), Oqtane (`IRoleRepository` + `IUserRoleRepository`), Web (`UserManager`/custom identity).

### 4.2. Admin forward còn bị giới hạn

- `ForwardTaskAsync` (`WorkflowTaskService.cs:179`) chỉ nhận `targetUser` dạng string (username/email/userId).
- UI submission detail chỉ cho forward đến user trong `CandidateUsers`; không cho admin chọn user/role bất kỳ.
- Không có action **“Assign / Reassign”** độc lập trong submission list.

### 4.3. Thiếu notification khi task được tạo / forward

- `ApprovalNodeExecutor` tạo task nhưng **không gửi email thông báo** cho người được assign / role queue.
- `ForwardTaskAsync` cập nhật assignee nhưng **không gửi email** cho người nhận.
- Cần hook gửi email hoặc tạo thêm `SendEmail` node tự động kèm theo.

### 4.4. Platform parity

| Platform | Inbox API | SendEmail executor | Email sender | Ghi chú |
|----------|-----------|--------------------|--------------|---------|
| DNN | ✅ | ✅ | ✅ | Đầy đủ nhất. |
| Web | ✅ | ✅ | ✅ | Đầy đủ. |
| Oqtane | ⚠️ partial | ❌ | ⚠️ legacy only | Cần đăng ký `EmailNodeExecutor`, `IWorkflowEmailSender`, `WebhookNodeExecutor`, ... |
| Umbraco | ❌ | ❌ | ❌ no-op | Cần wire toàn bộ workflow engine + sender thực. |

### 4.5. Chưa có khái niệm “Inbox notification” ngoài workflow task

Nếu muốn forward submission vào inbox của user mà **không cần workflow approval**, hiện tại không có bảng/mô hình riêng. Các lựa chọn:
- Dùng workflow approval node làm “inbox placeholder”.
- Tạo một bảng `MF_InboxNotifications` riêng.

---

## 5. Các phương án đề xuất

### Phương án A: Mở rộng workflow/inbox hiện có (Khuyến nghị)

**Ý tưởng:** Dùng `ApprovalNode` / `SendEmailNode` hiện có, bổ sung dynamic routing và admin forward.

#### 5.1. Các bước thực hiện

1. **Bổ sung dynamic principal resolver**
   - Tạo interface `IWorkflowPrincipalResolver` (hoặc mở rộng `IWorkflowEvaluator`):
     ```csharp
     List<UserPrincipal> Resolve(string expression, WorkflowExecutionContext ctx);
     // expression ví dụ: "role:Managers", "role:DepartmentHead({{field.department}})", "rule:..."
     ```
   - Implement platform-specific:
     - DNN: dùng `DotNetNuke.Security.Roles.RoleController.GetUsersByRoleName(portalId, roleName)`.
     - Oqtane: dùng `IRoleRepository`, `IUserRoleRepository`, `IUserRepository`.
     - Web: dùng `UserManager<ApplicationUser>` + custom role store.

2. **Mở rộng `ApprovalNodeConfig` / `WorkflowEvaluator`**
   - Hỗ trợ token dạng `{{role.RoleName}}`, `{{user.userId}}`, `{{resolve.role:...}}`.
   - Cho phép `CandidateRoles` / `CandidateUsers` là expression thay vì chỉ string list.

3. **Tự động gửi email khi task được tạo / forward**
   - Trong `ApprovalNodeExecutor.ExecuteAsync`, sau khi `_repo.SaveTask(task)`, gọi `IWorkflowEmailSender.SendAsync` đến danh sách email resolve từ candidate roles/users.
   - Trong `WorkflowTaskService.ForwardTaskAsync`, sau khi assign user mới, gửi email thông báo.
   - Hoặc cấu hình trong node: `NotifyOnCreate`, `NotifyOnForward` với template tùy chỉnh.

4. **Mở rộng admin UI submission detail**
   - Thêm action **“Assign / Forward to user or role”** cho admin/superuser.
   - Sử dụng `renderPrincipalPicker` (`wf-principal-picker.ts`) để chọn user/role.
   - Cho phép forward cả khi task chưa có `CandidateUsers` (admin override).

5. **Đảm bảo platform parity**
   - Oqtane: đăng ký `EmailNodeExecutor`, `IWorkflowEmailSender`, `WebhookNodeExecutor`, `DatabaseNodeExecutor` nếu cần.
   - Umbraco: wire `IWorkflowEngine`, repositories, sender thực (hoặc ghi rõ phạm vi không hỗ trợ).

#### 5.2. Ưu điểm
- Tận dụng hoàn toàn core đã có (task, case, audit log, inbox UI).
- Audit trail đầy đủ (`MF_WorkflowTaskActions`).
- Không cần tạo bảng mới.

#### 5.3. Nhược điểm
- Phải sửa nhiều file core + UI + từng platform adapter.
- Cần cẩn thận để không phá vỡ backward compatibility với `CandidateRoles`/`CandidateUsers` dạng string list.

---

### Phương án B: Thêm lớp “Inbox Notification” độc lập với workflow

**Ý tưởng:** Mỗi form có một bảng cấu hình routing rules. Khi submit, tạo `InboxNotification` rows và gửi email ngay, không cần workflow.

#### 5.4. Các bước thực hiện

1. **Thêm bảng `MF_InboxNotifications`**
   - Cột: `NotificationId`, `FormId`, `SubmissionId`, `UserId`, `RoleName`, `RuleExpression`, `IsRead`, `CreatedAt`, `ForwardedByUserId`, `ForwardedAt`, `Status`.

2. **Thêm form settings “Routing Rules”**
   - UI trong builder: thêm tab “Routing & Inbox”.
   - Rule editor tương tự `megaform-rule-builder.js`.
   - Target: `role:...` hoặc `user:...`.

3. **Thêm `InboxRoutingService`**
   - `RouteSubmission(int submissionId)`: đánh giá rules, resolve users, insert `MF_InboxNotifications`, gửi email.
   - Gọi trong `SubmissionProcessor.ProcessAsync` sau khi save submission (tương tự legacy notification).

4. **Thêm admin UI “Forward”**
   - Trong submission detail, thêm nút **Forward to user/role**:
     - Insert notification row mới.
     - Gửi email cho người nhận.
     - Ghi log.

5. **Thêm “My Inbox” surface**
   - Có thể tái sử dụng `MegaForm.UI/src/my-inbox/` hoặc tạo view mới.

#### 5.5. Ưu điểm
- Hoạt động ngay cả khi form không dùng workflow.
- Dễ hiểu với admin: “ai nhận submission này?”.

#### 5.6. Nhược điểm
- Trùng lặp chức năng với workflow approval/inbox đã có.
- Tăng số lượng bảng và code cần maintain.
- Không tận dụng được audit trail task hiện có.

---

### Phương án C: Distribution list bằng SendEmail nâng cao (đơn giản, không có inbox task)

**Ý tưởng:** Khi submit, dùng rule engine để resolve danh sách email từ role/rule và gửi email ngay, không tạo task.

#### 5.7. Các bước thực hiện

1. Tạo `IEmailRecipientResolver`.
2. Hỗ trợ `To` trong `SendEmailNodeConfig` dạng `role:Sales, role:Manager({{field.region}})`.
3. Trong `EmailNodeExecutor`, resolve danh sách email trước khi gửi.
4. Có thể dùng legacy admin notification nếu không dùng workflow.

#### 5.8. Ưu điểm
- Đơn giản, ít file sửa nhất.
- Phù hợp nếu chỉ cần gửi email, không cần claim/approve.

#### 5.9. Nhược điểm
- Không tạo task trong inbox → không có audit/escalation/claim.
- Không đáp ứng đầy đủ yêu cầu “forward vào inbox của user”.

---

## 6. Phương án được khuyến nghị

**Khuyến nghị: Phương án A – mở rộng workflow/inbox hiện có**, với lộ trình chia pha để giảm rủi ro.

### 6.1. Lý do chọn A

- Core inbox (`WorkflowTaskService`, `MF_WorkflowTasks`, `MF_WorkflowCases`) đã hoàn thiện và có audit log.
- UI inbox (`my-inbox`, `workflow-inbox`, submission detail workflow panel) đã có sẵn.
- Forward/assign chỉ cần mở rộng thêm quyền admin và resolver động.
- Tránh duplication với workflow engine.

### 6.2. Lộ trình đề xuất

#### Pha 1: Cố định email notification trên tất cả platform (2-3 ngày)
- Oqtane: đăng ký `IWorkflowEmailSender` + `EmailNodeExecutor` + `WebhookNodeExecutor`.
- Umbraco: quyết định scope (nếu cần hỗ trợ workflow/inbox thì wire engine; nếu không thì ghi rõ giới hạn).
- Thêm test email endpoint cho Oqtane (tương tự DNN/Web).
- Chạy checklist kiểm tra email (mục 7).

#### Pha 2: Dynamic role/user resolver (3-5 ngày)
- Thêm `IWorkflowPrincipalResolver` + platform implementations.
- Mở rộng `WorkflowEvaluator.ResolveExpression` hỗ trợ `{{role.X}}` / `{{resolve.role:X}}`.
- Cho phép `CandidateRoles` / `CandidateUsers` là expression hoặc list.

#### Pha 3: Email notification khi task tạo / forward (2-3 ngày)
- Bổ sung `NotifyOnCreate`, `NotifyOnForward` trong `ApprovalNodeConfig`.
- Trong `ApprovalNodeExecutor` gửi email đến resolved candidates.
- Trong `WorkflowTaskService.ForwardTaskAsync` gửi email cho target user.

#### Pha 4: Admin forward/assign tự do (3-5 ngày)
- Mở rộng UI submission detail cho phép admin chọn user/role bất kỳ.
- API mới hoặc mở rộng `ForwardTaskAsync` để chấp nhận cả role.
- Ghi audit action `Forwarded` / `Assigned`.

#### Pha 5: Rule-based routing nâng cao (5-7 ngày)
- Thêm node type hoặc cấu hình “Dynamic Approval” cho phép rule chọn candidate role/user theo field values.
- Hỗ trợ ví dụ: `field.department == 'IT' → role:IT_Manager`.

---

## 7. Checklist kiểm tra email notification hiện đã hoạt động chưa

### 7.1. Kiểm tra cấu hình SMTP

| Platform | Nơi kiểm tra | Key |
|----------|--------------|-----|
| DNN | Host Settings → SMTP + Portal Settings `MegaForm_Email_*` | `MegaForm_Email_Host`, `MegaForm_Email_Port`, `MegaForm_Email_From`, `MegaForm_Email_User`, `MegaForm_Email_Password`, `MegaForm_Email_EnableSsl` |
| Web | `MegaForm.Web/appsettings.json` hoặc DB `MF_ModuleSettings` | `Email:Host`, `Email:Port`, `Email:From`, `Email:Username`, `Email:Password`, `Email:EnableSsl` |
| Oqtane | `appsettings.json` hoặc environment variables | `MegaForm:Smtp:Host`, `MegaForm:Smtp:Port`, `MegaForm:Smtp:From`, `MEGAFORM_SMTP_HOST`, ... |
| Umbraco | Chưa implement | N/A |

### 7.2. Kiểm tra API test email

| Platform | Endpoint | Ghi chú |
|----------|----------|---------|
| DNN | `POST /DesktopModules/MegaForm/API/ModuleConfig/EmailSettingsTest` | Body rỗng hoặc `{ to: "test@example.com" }`. Xem `MegaFormApiController.cs`. |
| Web | `POST /api/MegaForm/ModuleConfig/EmailSettings/Test` | Xem `MegaForm.Web/Controllers/MegaFormController.cs:1152-1233`. |
| Oqtane | Không có endpoint test riêng | Cần thêm hoặc test bằng cách submit form có workflow SendEmail sau khi đăng ký executor. |

### 7.3. Kiểm tra log gửi mail

| Platform | Log location |
|----------|--------------|
| DNN | DNN Event Log (`Admin Logs`) + file log nếu có. |
| Web | `App_Data/MegaForm/email/{source}.log` (theo `NetLogService`). |
| Oqtane | `ILogger` output (console/file tùy Oqtane host). |

### 7.4. Kiểm tra đường gửi theo loại notification

| Kịch bản | Kỳ vọng | Cách test |
|----------|---------|-----------|
| Form không có workflow, có `NotifyEmails` | Admin email gửi đến danh sách | Submit form → kiểm tra log/email nhận. |
| Form có workflow, node SendEmail | Email gửi theo `To` đã cấu hình | Submit form → xem execution log node `SendEmail` output `sentTo`. |
| Form có workflow, node Approval | Task tạo trong `MF_WorkflowTasks` | Submit form → kiểm tra task và case trong DB. |
| Forward task | `MF_WorkflowTaskActions` có action `Forwarded` | Dùng submission detail forward → kiểm tra DB. |

### 7.5. Các vấn đề thường gặp và cách xác định

| Triệu chứng | Nguyên nhân có thể | Cách xác định |
|-------------|--------------------|---------------|
| Email không gửi, không có log | SMTP chưa cấu hình / `IEmailSender` no-op | Kiểm tra config; xem log startup có warning SMTP host rỗng không. |
| Workflow chạy, node SendEmail báo lỗi | Thiếu executor (Oqtane/Umbraco) | Xem execution log: *“No executor registered for node type SendEmail”*. |
| Legacy admin email không gửi | `NotifyEmails` rỗng / form đang có workflow | Kiểm tra `MF_Forms.NotifyEmails` và `MF_Forms.WorkflowJson`. |
| Autoresponder không gửi | `AutoresponderEnabled=false` / field email sai key | Kiểm tra form settings. |
| Task tạo nhưng không thấy trong inbox | User không thuộc `CandidateRoles`/`CandidateUsers` | Kiểm tra `MF_WorkflowTasks.CandidateRoles` và role của user đăng nhập. |

---

## 8. Câu hỏi cần làm rõ trước khi triển khai

1. **Scope platform:** Có cần hỗ trợ Umbraco workflow/inbox không, hay chỉ DNN/Web/Oqtane?
2. **Khái niệm “inbox”:** Có bắt buộc tạo task approval, hay chỉ cần một notification center đơn giản?
3. **Rule engine:** Có muốn dùng lại rule builder client (`megaform-rule-builder.js`) để cấu hình routing, hay định nghĩa rule ở server?
4. **Email notification:** Có cần queue/persistence/retry cho email, hay chỉ cần gửi đồng bộ như hiện tại?
5. **Phân quyền forward:** Admin/superuser được forward bất kỳ submission? Người khác chỉ forward nếu là assignee hoặc thuộc candidate role?
6. **Role-to-email mapping:** Dùng email từ user profile CMS hay cho phép override trong MegaForm?

---

## 9. Tài liệu tham khảo chính trong codebase

- `MegaForm.Core/Services/SubmissionProcessor.cs`
- `MegaForm.Core/Services/EmailNotificationService.cs`
- `MegaForm.Core/Workflow/EmailNodeExecutor.cs`
- `MegaForm.Core/Workflow/ApprovalNodeExecutor.cs`
- `MegaForm.Core/Services/WorkflowTaskService.cs`
- `MegaForm.Core/Services/WorkflowEvaluator.cs`
- `MegaForm.Core/Models/WorkflowHumanTaskModels.cs`
- `MegaForm.Core/Models/WorkflowModels.cs`
- `MegaForm.DNN/Services/DnnEmailSender.cs`
- `MegaForm.Web/Services/WebServices.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.Umbraco/Services/PlatformServices.cs`
- `MegaForm.UI/src/submissions/submission-detail-workflow-panel.ts`
- `MegaForm.UI/src/builder/workflow/wf-approval.ts`
- `MegaForm.DNN/SqlScripts/01_CreateTables.sql`

---

*End of document – proposal only, no code changes made.*
