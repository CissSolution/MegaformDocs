# Trả lờicâu hỏi: Tạo form mới dựa trên bảng `Form_CV_Submissions` (không dùng JSON) có được không?

**Ngày:** 2026-07-10  
**Ngườihỏi:** Chủ dự án MegaForm  
**Phạm vi:** Kiến trúc MegaForm hiện tại trên Oqtane (form schema + submission storage + dashboard)

---

## 1. Câu trả lờingắn gọn

**Không hoàn toàn được.** MegaForm hiện tại là một hệ thống **JSON-centric**:

- Định nghĩa form luôn là JSON (`MF_Forms.SchemaJson`, `MF_Forms.SettingsJson`).
- Mọi submission luôn được lưu dưới dạng JSON vào `MF_Submissions.DataJson`.
- Bảng SQL tùy chỉnh (ví dụ `Form_CV_Submissions`) chỉ có thể nhận một **bản sao mirror** qua tính năng `databaseInsert`.
- Dashboard/Submissions grid chỉ đọc từ `MF_Submissions`, không đọc từ bảng SQL tùy chỉnh.

Vì vậy, nếu bạn tạo một form mới "dựa trên" `Form_CV_Submissions` mà không có JSON submission, thì:
- Submission **sẽ không lưu được** (vì pipeline bắt buộc phải có `MF_Submissions.DataJson`).
- Nếu chỉ có dữ liệu trong `Form_CV_Submissions` mà không có `MF_Submissions`, dashboard **sẽ hiển thị 0**.

---

## 2. Giải thích chi tiết

### 2.1. Form schema bắt buộc là JSON

MegaForm không hỗ trợ "table-backed form" — tức là form không thể lấy trực tiếp một bảng SQL làm nguồn schema.

Những gì hiện có chỉ hỗ trợ **tạo form nhanh từ bảng SQL**, nhưng kết quả vẫn là form JSON:

| Tính năng | Mô tả | Giới hạn |
|---|---|---|
| **Builder → DB Tables tab** | Liệt kê bảng/cột trong `DashboardDatabase`, kéo cột vào canvas để tạo field tương ứng. | Chỉ giúp author form nhanh hơn; form vẫn lưu JSON vào `MF_Submissions`. |
| **AI `create_form` với `bindToTable`** | Tự động tạo form và cấu hình `settings.databaseInsert` để INSERT vào bảng chỉ định. | Vẫn tạo schema JSON; vẫn lưu primary submission vào `MF_Submissions`. |
| **AI `app_batch` multi-form** | Tạo bảng + form + bind quan hệ. | Tương tự: `MF_Submissions` vẫn là primary store. |

Tham khảo:
- `MegaForm.UI/src/builder/db-tables-panel.ts` — DB tab kéo thả cột thành field.
- `MegaForm.UI/src/ai-form-assistant/ops-app-batch.ts:308-314` — `bindToTable` chỉ thêm `databaseInsert`.
- `MegaForm.Core/Models/FormSchema.cs:593-594` — `DatabaseInsert` được mô tả là "optional: also INSERT one row into a custom database after default submission saves".

### 2.2. `MF_Submissions.DataJson` là bắt buộc

Pipeline xử lý submission luôn serialize form data thành JSON và INSERT vào `MF_Submissions` trước.

```csharp
// MegaForm.Core/Services/SubmissionProcessor.cs:269-281
string dataJson = JsonConvert.SerializeObject(formData);
var submission = new SubmissionInfo { FormId = formId, DataJson = dataJson, ... };
int submissionId = _subRepo.Insert(submission);
```

Sau đó, nếu `databaseInsert` được bật, `FormDatabaseInsertService` mới INSERT một dòng vào bảng tùy chỉnh:

```csharp
// MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1511-1537
var insertResult = insertSvc.Execute(settings, request.Data);
```

- `MegaForm.Core/Services/FormDatabaseInsertService.cs:57-112` — chỉ chạy khi `Enabled == true`, nếu không thì là no-op.
- `MegaForm.Core/Models/EntityModels.cs:63-78` — `SubmissionInfo.DataJson` là non-nullable.

### 2.3. Dashboard chỉ đọc từ `MF_Submissions`

Submissions grid/dashboard không thể repoint sang bảng SQL tùy chỉnh.

```csharp
// MegaForm.Oqtane.Server/Data/EfRepositories.cs:134-146
EfSubmissionRepository.List(...) => db.Submissions.Where(s => s.FormId == formId)
```

```csharp
// MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1931-2017
[HttpGet("Submissions")] => _submissionQueries.List(query)
```

```typescript
// MegaForm.UI/src/submissions/SubmissionsShell.ts:217-232
grid parse dataJson của từng row để hiển thị cột response.
```

Vì vậy:
- Nếu seed chỉ vào `Form_CV_Submissions` → dashboard hiển thị **0**.
- Nếu seed cả `MF_Submissions` → dashboard mới hiển thị đúng số lượng.

Điều này đã được chứng minh trong bài seed vừa rồi: khi chạy `03_seed_random.py --full` (không có `--with-submissions`), dashboard hiển thị 0; khi chạy lại với `--with-submissions`, dashboard hiển thị 500.000 submission mỗi form.

### 2.4. Có cách nào hiển thị dữ liệu từ bảng SQL tùy chỉnh không?

Có một số tính năng bổ sung, nhưng **không thay thế dashboard submissions chính**:

| Tính năng | Mô tả | Ghi chú |
|---|---|---|
| **"Live DB rows" modal** | Gọi `GET /AiTools/CustomTableRows?formId=N` để xem dòng trong bảng tùy chỉnh. | Chỉ có trên DNN (`MegaForm.DNN/WebApi/AiToolsController.cs:1125-1224`). **Oqtane/Web chưa có.** |
| **"DB View" tab** | Gọi `GET /AiTools/SubmissionDbView?submissionId=N`. | Cũng DNN-only. |
| **DataRepeater widget** | Chạy `SELECT` từ SQL table để hiển thị trên form. | Là widget trên form, không phải admin dashboard. |
| **DataGrid widget** | Inline-editable subform bind vào SQL table. | Cũng là widget trên form. |

---

## 3. Kịch bản cụ thể của bạn

> "Tạo form mới dựa trên bảng `Form_CV_Submissions`, không dùng JSON cho form này, submission có hiển thị đúng không?"

### 3.1. Nếu ý bạn là: form chỉ lưu vào `Form_CV_Submissions`, không lưu JSON

**Không khả thi.** Pipeline submission bắt buộc phải có `MF_Submissions.DataJson`. Bạn không thể tắt bước này.

### 3.2. Nếu ý bạn là: tạo form mới có field khớp với cột `Form_CV_Submissions`, submission vẫn lưu JSON + mirror vào bảng

**Khả thi.** Cách làm:
1. Tạo form mới trong Builder với các field: `FullName`, `ShortText`, `Dropdown`, `Number`, `FileUpload`, `DateValue`.
2. Cấu hình `settings.databaseInsert` trỏ vào `Form_CV_Submissions`.
3. Submit sẽ lưu JSON vào `MF_Submissions` và dòng SQL vào `Form_CV_Submissions`.
4. Dashboard sẽ hiển thị submission đúng (vì nó đọc `MF_Submissions`).

### 3.3. Nếu ý bạn là: dùng lại dữ liệu 500.000 dòng đã seed trong `Form_CV_Submissions` để hiển thị trên dashboard

**Không tự động.** Bạn phải INSERT tương ứng 500.000 dòng vào `MF_Submissions` với `DataJson` hợp lệ. Đã làm xong trong bước seed vừa rồi (`--with-submissions`).

---

## 4. Khuyến nghị

Nếu mục tiêu là có một form lưu vào SQL table và hiển thị trên dashboard:

1. **Giữ nguyên kiến trúc JSON-centric của MegaForm.**
2. **Dùng `databaseInsert`** để mirror sang `Form_CV_Submissions`.
3. **Đảm bảo `MF_Submissions` luôn có dòng tương ứng** nếu bạn seed/import dữ liệu từ bên ngoài.
4. Nếu cần báo cáo/phân tích phức tạp trên SQL table, dùng **DataRepeater/DataGrid widget** hoặc viết view/report riêng, thay vì cố gắng dùng dashboard submissions.

---

## 5. Kết luận

| Câu hỏi | Trả lờicuối cùng |
|---|---|
| Có tạo được form mới hoàn toàn dựa trên SQL table, không dùng JSON? | **Không.** MegaForm bắt buộc form schema JSON và submission JSON. |
| Submission có hiển thị đúng trên dashboard nếu chỉ có trong SQL table? | **Không.** Dashboard chỉ đọc `MF_Submissions`. |
| Có workaround? | **Có.** Dùng `databaseInsert` để mirror, và đảm bảo `MF_Submissions` cũng có dữ liệu. |
