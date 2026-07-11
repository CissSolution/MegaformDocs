# HANDOUT — MegaForm 1.7.102 (Oqtane) · Form trên bảng SQL có sẵn + AI on-rails + Workflow tới đúng người

**Gói:** `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.102.nupkg` (78.8 MB) · ModuleInfo **1.7.102** · AssetVersion **20260711-B394**
**Site QA sạch (cài CHỈ bằng nupkg):** http://localhost:5123 — host / `abc@ABC1024` — DB `Oqtane_MegaForm_Fresh1802`
**DB "khách" giả lập:** `LegacyErp_Demo` (.\SQLEXPRESS) — 500.000 ticket + bảng con + lookup + đủ ca biên

---

## 1. Có gì mới

### 1.1 Form đọc thẳng bảng SQL có sẵn của khách (đường ĐỌC — xong)

Trỏ MegaForm vào **bất kỳ bảng nào** trong DB khách. Máy **dò năng lực** rồi tự kết luận làm được gì:

| Máy phát hiện | Kết luận |
|---|---|
| Bảng 500k, PK identity, đủ quyền | `readwrite` (đường ghi ở pha sau) |
| Không có khoá đáng tin (không PK, hoặc khoá trùng/null) | `insertonly` — tắt Xem chi tiết/Sửa/Xoá |
| Tài khoản DB chỉ có SELECT | `readonly` |
| Cột bắt buộc kiểu không biểu diễn được (`sql_variant`…) | `readonly` |
| Hai bảng trùng tên khác schema | `unsupported` — bắt admin chọn schema, **không đoán** |
| Bảng có trigger | Tự chuyển sang `OUTPUT..INTO` (vì trigger làm `SCOPE_IDENTITY()` trả sai) |
| FK trỏ tới bảng 500k | **Không** đề xuất dropdown (500k option = treo trình duyệt) |

**Dashboard Submissions đọc LIVE bảng của khách** — không import, không sao chép. Lọc/sắp xếp/phân trang chạy **bằng SQL trên toàn bộ bảng**, không phải trên 50 dòng đang hiện (đây là khác biệt giữa "chậm" và "sai").

Mỗi bản ghi được định danh bằng **anchor row** (`MF_ExternalRowMap`): id do MegaForm cấp, nên khoá GUID / khoá ghép của khách vẫn dùng được, và id không bao giờ đụng id của submission thật.

### 1.2 AI thiết kế form — chạy trên rails

- Máy đóng **envelope**: chỉ những cột người dùng được phép nhập, mỗi cột kèm sẵn kết luận (`required` lấy từ DB, danh sách widget hợp lệ, enum). Khoá / cột computed / audit → liệt kê là "máy tự lo", AI không được hỏi người dùng.
- AI trả **blueprint** (nhãn, help text, gom nhóm, chọn widget).
- **Server chấm lại**. Blueprint bịa cột, chọn widget không được phép, đặt khoá tự sinh vào form, lặp cột, hoặc **bỏ sót cột NOT NULL** → **bị từ chối kèm lý do cụ thể**, lý do được nhét ngược cho AI tự sửa (tối đa 3 lần). Quá 3 lần → dùng bản máy sinh và **nói rõ là đã dùng bản máy sinh**.
- Vì thế **model rẻ vẫn an toàn**: nó không được quyết bất cứ điều gì có đúng/sai.

### 1.3 Workflow: việc tới đúng người

- Bước duyệt chỉ định **đúng 1 user** → task **được giao thẳng** cho họ (vào inbox ở trạng thái đã gán, không phải bấm Claim). Chỉ định **role** hoặc nhiều người → vẫn là hàng đợi ai rảnh thì nhận (đúng như trước).
- **Email báo cho người được giao giờ mới thực sự gửi** trên Oqtane và DNN. Trước đây class gửi mail có sẵn nhưng **chưa cắm dây DI**, nên task tạo xong **im lặng** — không ai được báo.
- Mẫu builder mới: **"Assign to one person"**.

### 1.4 Module có thể LÀ Inbox hoặc Dashboard

Trong **MegaForm Settings → Current Form settings → Display mode** có thêm 2 lựa chọn:
- **My Inbox** — module trở thành hộp việc của người đang đăng nhập.
- **Form Dashboard** — module trở thành màn quản trị form/submissions.

(Trước đây lựa chọn "Module Role" tồn tại trong UI nhưng **server bỏ qua khi lưu** → chọn xong không có gì xảy ra.)

### 1.5 Wizard: nút "Import JSON" nay có đường dự phòng

Bấm **Import JSON** vẫn bung hộp chọn file ngay như cũ (một click). Thêm link nhỏ *"File picker not opening? Paste or drop the JSON instead"* — dành cho trường hợp trình duyệt bị công cụ khác điều khiển qua DevTools protocol (extension AI/automation gắn vào tab), khi đó hộp thoại chọn tệp **bị nuốt** và nút trông như chết mà console không báo gì. Link đó cho phép **chọn tệp / kéo-thả / dán JSON**, không cần hộp thoại native.

### 1.6 Sửa lỗi nặng: trang Submissions treo trên site lớn

Đếm submission của mọi form (`WHERE IsSpam=0 GROUP BY FormId`) **không có index nào phủ `IsSpam`** → quét toàn bảng: **19,5 giây** với 1 triệu dòng, vượt timeout 30s → trang báo *"Unable to load the forms overview"*. Thêm index `(IsSpam, FormId, SubmittedOnUtc)` → **0,45 giây**; biểu đồ sparkline cũng thôi nạp 1 triệu dòng vào memory để vẽ 30 điểm.

---

## 2. QA nhanh trên :5123 (10 phút)

1. Đăng nhập host → thêm module **MegaForm** vào một trang.
2. Vào **Form Builder → tab DB** → mỗi bảng có nút **⚡ Năng lực**.
3. Bấm **⚡ Năng lực** trên `dbo.SupportTickets` → thẻ năng lực hiện: mode, khoá, index, cột bắt buộc, và **lý do** cho từng hạn chế.
4. Bấm **Tạo form (máy sinh)** hoặc **✨ Thiết kế bằng AI** (cần cấu hình AI key) → form được tạo.
5. Mở **Submissions** → form đó hiện **500.000 dòng thật của bảng khách**; lọc `Status = Closed` → **100.000** (lọc bằng SQL trên toàn bảng).
6. Thử các bảng bẫy để thấy máy tự hạ cấp:
   - `dbo.LegacyKeyless` → `insertonly` + `NO_TRUSTED_KEY`
   - `dbo.WeirdTypes` → `readonly` + `UNSUPPORTED_REQUIRED_COLUMN`
   - `Orders` (không chọn schema) → `unsupported` + `SCHEMA_COLLISION`
   - `dbo.vTicketSummary` (VIEW) → `readonly`

**Cấu hình bắt buộc để bind bảng ngoài** (đã có sẵn trên :5123, đây là mẫu cho site khác) — `appsettings.json`:

```jsonc
"ConnectionStrings": {
  "DefaultConnection": "…",
  "CustomerErp": "Server=.\\SQLEXPRESS;Database=LegacyErp_Demo;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=False;"
},
"MegaForm": { "ExternalTables": { "AllowedConnections": [ "CustomerErp" ] } }
```

Client **chỉ được chọn tên connection trong allowlist này** — không bao giờ gửi connection string, và connection string không bao giờ đi ra trình duyệt.

---

## 3. Giới hạn — nói thẳng

- **Chưa ghi được vào bảng khách.** Bind luôn ở chế độ `readonly` kể cả khi máy dò ra `readwrite`. Submit/sửa/xoá bản ghi ngoài trả **409 EXTERNAL_READONLY**. Đường ghi (INSERT + lấy khoá + dry-run + transaction) là pha kế tiếp (P3).
- **Chưa xử lý bảng con (1-N).** Widget DataGrid hiện **không** ghi vào bảng con — rows bị nhét thành JSON trong submission cha (lỗ có sẵn từ trước, chưa sửa). Đó là P5.
- **Site nâng cấp cần chạy tay 1 câu SQL** (Oqtane không chạy thân migration):
  ```sql
  CREATE INDEX IX_MF_Submissions_Spam_Form_Date ON MF_Submissions (IsSpam, FormId, SubmittedOnUtc);
  ```
  Site cài mới thì EF tự tạo (đã kiểm chứng trên :5123).
- Email workflow cần **SMTP đã cấu hình trong Oqtane** thì mới thực sự gửi.
