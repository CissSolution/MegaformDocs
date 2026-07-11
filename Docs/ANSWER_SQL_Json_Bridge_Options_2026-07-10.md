# Các phương án tích hợp bảng SQL với MegaForm

**Ngày:** 2026-07-10  
**Ngữcảnh:** Đã seed 500.000 dòng vào `Form_CV_Submissions` / `Form_DownUnder_Submissions`, và cũng đã đồng bộ vào `MF_Submissions` để dashboard hiển thị. Bài này so sánh các cách tiếp cận khác nhau để "chạy" dữ liệu từ SQL table, JSON, hoặc song song.

---

## Tóm tắt 4 phương án

| Phương án | Mô tả | Ưu điểm | Nhược điểm | Khi nào dùng |
|---|---|---|---|---|
| **A. JSON-first + databaseInsert mirror** | Form lưu JSON vào `MF_Submissions`, đồng thờimirror sang SQL table. | Chuẩn MegaForm; dashboard hoạt động; dữ liệu SQL sẵn cho báo cáo/business. | Dữ liệu trùng lặp ở 2 nơi; cần đồng bộ khi seed/import. | Mặc định; dùng khi cần cả dashboard và SQL table. |
| **B. Custom bridge / import job** | Viết một service/job đọc từ SQL table và INSERT/UPDATE `MF_Submissions` từ dòng SQL. | Cho phép "import" dữ liệu SQL cũ vào dashboard. | Phức tạp; cần xử lý mapping, schema, duplicate, ID; có thể làm chậm DB. | Khi đã có SQL table đầy dữ liệu và muốn dashboard hiển thị lại. |
| **C. SQL-only report (DataRepeater / DataGrid / custom page)** | Dùng widget DataRepeater hoặc trang tùy chỉnh để SELECT trực tiếp từ `Form_CV_Submissions`. | Không cần lưu JSON; hiển thị được dữ liệu SQL lớn (triệu dòng). | Không phải dashboard submissions chuẩn; cần viết SQL và xử lý phân trang. | Khi cần báo cáo/khai thác dữ liệu SQL, không cần dashboard submission. |
| **D. Hybrid (dashboard JSON + SQL report)** | Dashboard submissions dùng `MF_Submissions`; một tab/page riêng dùng DataRepeater để xem dữ liệu SQL chi tiết. | Tận dụng cả 2 thế mạnh; dashboard chuẩn + báo cáo SQL mạnh. | Cần xây dựng 2 giao diện; dữ liệu có thể không real-time sync. | Mô hình lý tưởng cho production. |

---

## Phương án A: JSON-first + databaseInsert mirror (chuẩn MegaForm)

Đây là cách đang dùng cho Form 3 và Form 4.

### Cách hoạt động

```
User submit form
        │
        ▼
[MF_Submissions] ←── DataJson (JSON) ←── Dashboard đọc ở đây
        │
        ▼
[Form_CV_Submissions] ←── databaseInsert (SQL table)
```

### Cấu hình

Trong `MF_Forms.SettingsJson`, thêm:

```json
{
  "databaseInsert": {
    "enabled": true,
    "connectionKey": "DashboardDatabase",
    "databaseType": "SqlServer",
    "insertSql": "INSERT INTO [dbo].[Form_CV_Submissions] ([FullName],[ShortText],...) VALUES (:full_name, :short_text, ...)",
    "parameterMapping": { ":full_name": "full_name", ":short_text": "short_text", ... }
  }
}
```

### Khi nào dùng

- Mặc định cho mọi form cần cả dashboard và SQL table.
- Dữ liệu seed phải ghi cả 2 bảng (`--with-submissions`).

### Lưu ý

- `databaseInsert` là **fail-soft**: nếu INSERT SQL lỗi, submission vẫn lưu JSON.
- Nếu seed chỉ vào SQL table, dashboard sẽ 0.

---

## Phương án B: Custom bridge / import job từ SQL table vào MF_Submissions

Kịch bản: bạn đã có sẵn `Form_CV_Submissions` đầy dữ liệu (ví dụ từ import Excel, ETL, hoặc legacy system), và muốn dashboard hiển thị những dòng đó.

### Cách làm

Viết một job/script đọc từng dòng trong `Form_CV_Submissions`, chuyển thành JSON theo schema form, rồi INSERT vào `MF_Submissions`.

```sql
-- Ví dụ: tạo JSON từ dòng SQL table
SELECT 
    4 AS FormId,
    (SELECT FullName, ShortText, Dropdown, Number, FileUpload, DateValue 
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS DataJson,
    '192.168.1.1' AS IpAddress,
    'import-bridge/1.0' AS UserAgent,
    NULL AS UserId,
    'completed' AS Status,
    0 AS IsSpam,
    0.0 AS SpamScore,
    SubmittedOnUtc
FROM Form_CV_Submissions
WHERE SubmissionId IS NULL;  -- chỉ import dòng chưa có trong MF_Submissions
```

Sau đó INSERT kết quả vào `MF_Submissions`.

### Ưu điểm

- Không cần submit lại từ form.
- Dữ liệu SQL cũ có thể "lên" dashboard.

### Nhược điểm

- Phải mapping cột SQL → field key trong JSON.
- Phải xử lý trùng lặp (dùng `SubmissionId` nullable trong SQL table hoặc flag `IsImported`).
- `MF_Submissions` sẽ phình to (cả JSON + SQL table).
- Không có "original submit time" thật; phải dùng `SubmittedOnUtc` từ SQL table.

### Khi nào dùng

- Migration dữ liệu cũ.
- Đồng bộ từ external system đã có SQL table.

---

## Phương án C: SQL-only report (DataRepeater / DataGrid / custom page)

Nếu mục tiêu chỉ là **hiển thị / báo cáo** dữ liệu từ `Form_CV_Submissions`, không cần dashboard submissions chuẩn.

### Cách 1: DataRepeater widget

MegaForm có widget `DataRepeater` có thể chạy `SELECT` từ SQL table và hiển thị dạng grid.

```json
// Trong form schema, thêm widget DataRepeater với dataSource = sql
{
  "key": "cv_report",
  "type": "DataRepeater",
  "label": "CV Report",
  "properties": {
    "dataSource": "sql",
    "connectionKey": "DashboardDatabase",
    "databaseType": "SqlServer",
    "sql": "SELECT * FROM Form_CV_Submissions ORDER BY Id DESC"
  }
}
```

### Cách 2: Trang tùy chỉnh (Oqtane Razor page / MVC)

Tạo một trang riêng trong Oqtane host, dùng ADO.NET hoặc EF để SELECT từ `Form_CV_Submissions` và render HTML.

### Ưu điểm

- Không cần `MF_Submissions`.
- Hiệu suất tốt với triệu dòng (phân trang ở SQL).
- Tự do customize UI.

### Nhược điểm

- Không phải dashboard MegaForm chuẩn.
- Mất các tính năng sẵn có của dashboard: search, filter, export, xem chi tiết submission, workflow.

### Khi nào dùng

- Báo cáo thuần túy.
- Khai thác dữ liệu SQL với performance cao.

---

## Phương án D: Hybrid (dashboard JSON + SQL report) — khuyến nghị cho production

Đây là mô hình cân bằng nhất.

### Kiến trúc

```
[Form] ──submit──► [MF_Submissions] ──dashboard──► Dashboard MegaForm
                      │
                      └─databaseInsert──► [Form_CV_Submissions]
                                              │
                                              ▼
                                       [DataRepeater / Custom Report]
```

### Cách triển khai

1. Form submit lưu JSON vào `MF_Submissions` (dashboard hiển thị).
2. `databaseInsert` mirror sang `Form_CV_Submissions` (dữ liệu SQL cho integration/báo cáo).
3. Thêm một tab hoặc page riêng dùng DataRepeater để query `Form_CV_Submissions` cho báo cáo chi tiết.

### Ưu điểm

- Dashboard vẫn chuẩn.
- SQL table vẫn có dữ liệu sạch cho external systems.
- Báo cáo nặng có thể chạy trên SQL table thay vì parse JSON.

### Khi nào dùng

- Production system cần cả khả năng quản lý submission và báo cáo/business intelligence.

---

## So sánh nhanh

| Nhu cầu của bạn | Phương án phù hợp |
|---|---|
| Chỉ cần dashboard hiển thị submission | A hoặc D |
| Cần SQL table để integration/báo cáo | A hoặc D |
| Đã có SQL table đầy dữ liệu, muốn dashboard hiển thị | B (import bridge) |
| Chỉ cần báo cáo, không cần dashboard | C |
| Cần cả dashboard chuẩn và báo cáo SQL mạnh | **D (khuyến nghị)** |

---

## Khuyến nghị cuối cùng

Với kiến trúc MegaForm hiện tại, **không nên cố gắng bỏ JSON hoàn toàn**. Thay vào đó:

1. **Dùng JSON làm primary store** (`MF_Submissions`) cho dashboard và tính năng MegaForm.
2. **Dùng SQL table làm mirror** (`Form_CV_Submissions`) cho integration, báo cáo, và external systems.
3. **Nếu cần báo cáo phức tạp**, thêm DataRepeater / custom page query trực tiếp SQL table.

Nếu bạn muốn tôi triển khai cụ thể một trong các phương án trên (ví dụ: viết import bridge hoặc tạo DataRepeater report), hãy cho tôi biết phương án nào.
