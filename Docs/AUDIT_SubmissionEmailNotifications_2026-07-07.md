# AUDIT — Email/notification sau khi submit form

> **Yêu cầu:** Kiểm tra source code để xác định sau khi submit form, ngườii submit và admin có nhận được email hay không.  
> **Quy tắc:** Chỉ viết tài liệu audit — **KHÔNG sửa code**.  
> **Thờigian audit:** 2026-07-07

---

## 1. Tổng quan kết luận

**Câu trả lờii ngắn gọn:**

* **Admin** có thể nhận được email **nếu** ngườii tạo form đã điền **Admin Email** (`NotifyEmails`) trong cấu hình form. Mặc định trống → admin **không** nhận được.
* **Ngườii submit** có thể nhận được email **nếu** bật **Autoresponder** và chọn field email. Tuy nhiên, **hiện tại UI Builder không hiển thị/cho phép cấu hình Autoresponder**, và các endpoint `SaveForm` của Web/Oqtane/Umbraco **không lưu các trường Autoresponder**. Do đó trên thực tế ngườii submit **không** nhận được email xác nhận qua legacy autoresponder.
* Nếu form có **Workflow được áp dụng (applied workflow)**, hai kênh legacy trên **bị bỏ qua hoàn toàn**. Email chỉ được gửi qua node `SendEmail` / `Approval` trong workflow. Nếu workflow không có node gửi email, **không ai nhận được email**.
* Tất cả việc gửi email đều phụ thuộc vào **cấu hình SMTP** của từng platform. Nếu SMTP chưa cấu hình, email bị log lỗi hoặc im lặng bị bỏ qua.

---

## 2. Chuỗi xử lý sau submit

### 2.1 Entry point

File: `MegaForm.Core/Services/SubmissionProcessor.cs`

```csharp
public async Task<SubmissionResult> ProcessAsync(
    int formId,
    Dictionary<string, object> formData,
    string ipAddress,
    string userAgent,
    int? userId,
    double submissionTimeSeconds = 0)
```

Được gọi từ các controller:

* `MegaForm.Web/Controllers/MegaFormController.cs` — action `Submit` (dòng ~675)
* Các platform khác (DNN, Oqtane, Umbraco) cũng gọi `SubmissionProcessor.ProcessAsync`.

Pipeline:

1. Load form
2. Validate
3. Anti-spam
4. Save submission
5. Nếu **không phải spam** → tiếp tục notification/workflow
6. Nếu **không có applied workflow** → gửi legacy `AdminNotification` + `Autoresponder`
7. Nếu **có applied workflow** → chạy `WorkflowEngine.ExecuteAsync`

---

## 3. Legacy email (khi KHÔNG có workflow)

### 3.1 Admin notification

File: `MegaForm.Core/Services/EmailNotificationService.cs`, dòng 67–84

```csharp
public void SendAdminNotification(FormInfo form, SubmissionInfo submission, FormSchema schema)
{
    if (string.IsNullOrWhiteSpace(form.NotifyEmails)) return;
    // ...
    foreach (var addr in form.NotifyEmails.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
    {
        try { _email.Send(addr.Trim(), subject, body); }
        catch (Exception ex) { _log?.LogError("MegaForm.Notify", $"Send failed: {ex.Message}", ex); }
    }
}
```

**Điều kiện gửi:**

* `form.NotifyEmails` không được trống.
* Email được parse bằng dấu `,` hoặc `;`.

**Nội dung:**

* Nếu `form.NotifyTemplate` có giá trị → dùng template đó (hỗ trợ token `{{submission_id}}`, `{{form_title}}`, `{{submitted_date}}`, `{{ip_address}}`, `{{all_fields}}`, `{{field_key}}`).
* Nếu không → dùng `BuildAdminEmail` mặc định, gồm bảng các field và metadata.

**Vấn đề:**

* `NotifyTemplate` **không có UI** để cấu hình trong Builder. Chỉ có thể set bằng DB trực tiếp.
* `NotifyEmails` **có UI** (`mf-setting-notify-email`), nhưng mặc định trống.

### 3.2 Submitter autoresponder

File: `MegaForm.Core/Services/EmailNotificationService.cs`, dòng 86–106

```csharp
public void SendAutoresponder(FormInfo form, SubmissionInfo submission, FormSchema schema)
{
    if (!form.AutoresponderEnabled || string.IsNullOrWhiteSpace(form.AutoresponderEmailField)) return;
    // ...
    string to = data.ContainsKey(form.AutoresponderEmailField) ? data[form.AutoresponderEmailField]?.ToString() : null;
    if (string.IsNullOrWhiteSpace(to)) return;
    // ...
    _email.Send(to, subject, body);
}
```

**Điều kiện gửi:**

* `form.AutoresponderEnabled == true`
* `form.AutoresponderEmailField` chỉ định key của field chứa email (ví dụ: `email`)
* Ngườii submit thực sự nhập giá trị vào field đó.

**Vấn đề lớn:**

* **Không có UI** trong Builder để bật/tắt Autoresponder hoặc chọn field email.
* Các endpoint `SaveForm` của Web/Oqtane/Umbraco **không map các trường Autoresponder** từ request body vào `FormDto`. Do đó khi lưu form qua UI, các giá trị này bị reset về `false` / `null` / `""`.
* Kể cả khi set trực tiếp trong DB, một lần Save form qua UI sẽ xóa cấu hình.

> **Kết luận:** Legacy autoresponder cho ngườii submit **gần như không hoạt động** trong thực tế qua UI.

---

## 4. Workflow email (khi CÓ applied workflow)

### 4.1 Workflow thay thế legacy notification

File: `MegaForm.Core/Services/SubmissionProcessor.cs`, dòng 321–389

```csharp
bool canRunWorkflow = workflowState.HasAppliedWorkflow && _workflowEngine != null;

if (!canRunWorkflow)
{
    // Legacy admin + autoresponder
    _emailService?.SendAdminNotification(form, submission, schema);
    _emailService?.SendAutoresponder(form, submission, schema);
}
else
{
    // Chạy workflow
    var ctx = await _workflowEngine.ExecuteAsync(formId, submissionId, workflowData, cts.Token);
}
```

**Ý nghĩa:** Ngay khi form có workflow đã được “apply”, hệ thống **không còn tự động gửi admin notification hay autoresponder**. Tất cả email phải do workflow định nghĩa.

### 4.2 SendEmail node

File: `MegaForm.Core/Workflow/EmailNodeExecutor.cs`

```csharp
public async Task<WorkflowNodeResult> ExecuteAsync(...)
{
    string to = _evaluator.ResolveExpression(config.To ?? "", ctx);
    // ...
    if (string.IsNullOrWhiteSpace(to))
        return WorkflowNodeResult.Failed("Email recipient is empty after template resolution.");

    await _emailSender.SendAsync(to, cc, subject, body, replyTo, ct);
}
```

**Cách gửi cho ngườii submit:** Thường dùng token `{{email}}` hoặc `{{field_key}}` trong trường `To`.

**Cách gửi cho admin:** Phải thêm node `SendEmail` với `To` là địa chỉ admin cố định hoặc biến.

### 4.3 Mặc định workflow presets

Tìm thấy trong UI Builder các preset workflow có node `SendEmail`:

* `src/builder/workflow-canvas.ts:2250`
* `src/builder/workflow/index.ts:2117`
* `src/builder/workflow/wf-app.ts:168`

Ví dụ:

```javascript
{ id: 'node-e', type: 'SendEmail', label: 'Confirmation Email',
  config: {
    to: '{{' + emailField.key + '}}',
    subject: 'Thanks for your submission',
    body: '...'
  }
}
```

**Nhận xét:**

* Các preset này chỉ gửi **xác nhận cho ngườii submit**.
* **Không có preset gửi email cho admin**. Nếu admin cần nhận thông báo, phải tự thêm node `SendEmail` hoặc node `Approval` trong workflow.

### 4.4 Approval node

File: `MegaForm.Core/Workflow/ApprovalNodeExecutor.cs`

Approval node cũng gửi email khi task được tạo/forward (qua `IWorkflowEmailSender`). Tuy nhiên, đây là email cho ngườii phê duyệt, không phải admin nhận submission chung.

---

## 5. Cấu hình SMTP / IEmailSender

Tất cả email cuối cùng đều đi qua `IEmailSender.Send(...)`. Các implementation theo platform:

| Platform | File | Cách lấy cấu hình | Hành vi khi thiếu cấu hình |
|----------|------|-------------------|---------------------------|
| **Web** | `MegaForm.Web/Services/WebServices.cs` `SmtpEmailSender` | `_moduleSettings.GetSetting(0, "Email_Host", ...)` hoặc `IConfiguration["Email:Host"]` | Host mặc định `localhost`, port `25`. Nếu SMTP không chạy, gửi sẽ throw. |
| **Umbraco** | `MegaForm.Umbraco/Services/PlatformServices.cs` `SmtpEmailSender` | Tương tự Web | Tương tự Web |
| **DNN** | `MegaForm.DNN/Services/DnnEmailSender.cs` | DNN Host SMTP settings + `MegaForm_Email_*` host settings | Dùng DNN Mail API; nếu thiếu sẽ dùng localhost. |
| **Oqtane** | `MegaForm.Oqtane.Server/Services/Startup.cs` `OqtaneEmailSender` | `MegaForm:Smtp:*` config hoặc biến môi trường `MEGAFORM_SMTP_*` | Nếu host trống → **log warning và return**, không gửi. |

**Vấn đề:**

* Không có UI hoặc tài liệu rõ ràng để ngườii dùng cấu hình SMTP trong các platform (trừ DNN dùng Host Settings có sẵn).
* Nếu SMTP sai/missing, submission vẫn thành công nhưng email bị lỗi im lặng (chỉ có log).

---

## 6. Các vấn đề/giới hạn phát hiện

### 6.1 Ngườii submit không nhận được email

| Nguyên nhân | Mức độ | Ghi chú |
|-------------|--------|---------|
| UI Builder không có màn hình Autoresponder | **Cao** | Không thể bật autoresponder qua UI. |
| SaveForm endpoint không map Autoresponder fields | **Cao** | Kể cả set trong DB, lưu form qua UI sẽ xóa. |
| Workflow preset chỉ gửi xác nhận nếu ngườii dùng thiết kế workflow có node SendEmail | **Trung bình** | Các template mặc định thường có node này, nhưng form đơn giản không có workflow thì không gửi. |
| SMTP chưa cấu hình | **Cao** | Email không ra khỏi server. |

### 6.2 Admin không nhận được email

| Nguyên nhân | Mức độ | Ghi chú |
|-------------|--------|---------|
| `NotifyEmails` trống | **Cao** | Mặc định không có admin email. |
| Form có applied workflow → legacy admin notification bị bỏ qua | **Trung bình** | Admin phải được thêm vào workflow dưới dạng SendEmail node. |
| SMTP chưa cấu hình | **Cao** | Email không gửi được. |

### 6.3 Workflow context thiếu email của actor

File: `MegaForm.Core/Services/SubmissionProcessor.cs`, dòng 364–369

```csharp
workflowData["__actorUserId"] = userId.HasValue ? userId.Value : 0;
workflowData["__actorUserName"] = userId.HasValue ? ("user-" + userId.Value) : "anonymous";
workflowData["__actorDisplayName"] = userId.HasValue ? ("user-" + userId.Value) : "anonymous";
workflowData["__actorEmail"] = string.Empty;
```

**Vấn đề:** `__actorEmail` luôn là `string.Empty`, kể cả user đã đăng nhập. Nếu workflow muốn gửi email cho ngườii submit dựa trên profile đăng nhập, cần phải tự lookup thêm.

---

## 7. Khuyến nghị (không sửa code trong audit này)

1. **Thêm UI Autoresponder trong Builder**
   * Toggle bật/tắt.
   * Dropdown chọn field email.
   * Input Subject/Body hoặc dùng template mặc định.

2. **Cập nhật SaveForm endpoint trên Web/Oqtane/Umbraco**
   * Map `AutoresponderEnabled`, `AutoresponderEmailField`, `AutoresponderSubject`, `AutoresponderBody` từ request body vào `FormDto`/`FormInfo`.

3. **Thêm UI NotifyTemplate hoặc ít nhất tài liệu hướng dẫn token**
   * Hiện tại admin chỉ nhận email mặc định; nếu muốn custom phải sửa DB.

4. **Thêm preset workflow “Notify admin + confirm submitter”**
   * Giúp ngườii dùng không phải tự thêm node SendEmail cho admin.

5. **Cải thiện __actorEmail trong workflow context**
   * Nếu user đã đăng nhập, tra cứu email từ membership provider và đưa vào `workflowData["__actorEmail"]`.

6. **Cấu hình SMTP / onboarding**
   * Hiển thị cảnh báo trong Dashboard nếu SMTP chưa được cấu hình.
   * Log rõ ràng khi email bị skip do thiếu SMTP.

---

## 8. File/tài nguyên liên quan chính

* `MegaForm.Core/Services/SubmissionProcessor.cs` — pipeline submit + phân nhánh legacy/workflow.
* `MegaForm.Core/Services/EmailNotificationService.cs` — `SendAdminNotification`, `SendAutoresponder`, token replacement.
* `MegaForm.Core/Workflow/EmailNodeExecutor.cs` — gửi email trong workflow.
* `MegaForm.Core/Workflow/ApprovalNodeExecutor.cs` — email phê duyệt.
* `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs` — `IWorkflowEmailSender`.
* `MegaForm.Core/Models/EntityModels.cs` — `FormInfo` chứa `NotifyEmails`, `Autoresponder*`.
* `MegaForm.UI/src/builder/toolbar.ts` — lưu `NotifyEmails` nhưng không lưu `Autoresponder*`.
* `MegaForm.UI/src/shared/inline-edit.ts` — cũng chỉ lưu `NotifyEmails`, không lưu `Autoresponder*`.
* `MegaForm.Web/Controllers/MegaFormController.cs` — action `Submit`.
* `MegaForm.Web/Data/DataLayer.cs` — `SaveForm` dùng EF Update toàn bộ `FormInfo`.
* `MegaForm.Web/Services/WebServices.cs`, `MegaForm.Umbraco/Services/PlatformServices.cs`, `MegaForm.DNN/Services/DnnEmailSender.cs`, `MegaForm.Oqtane.Server/Services/Startup.cs` — các implementation `IEmailSender`.

---

## 9. Kết luận cuối

* **Admin nhận được email** chỉ khi `NotifyEmails` được điền và form **không có applied workflow** (hoặc workflow tự định nghĩa node gửi admin).
* **Ngườii submit nhận được email** chỉ khi workflow có `SendEmail` node trỏ đến field email của họ, hoặc khi legacy autoresponder được bật — nhưng autoresponder **hiện không thể bật qua UI** và bị xóa mỗi khi lưu form.
* **SMTP phải được cấu hình đúng** trên từng platform, nếu không email không bao giờ rời server.

**Không có thay đổi mã nguồn nào được thực hiện trong audit này.**
