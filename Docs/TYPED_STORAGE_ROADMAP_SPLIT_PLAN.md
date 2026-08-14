# Kế hoạch phân chia công việc — Typed Submission Storage Roadmap

> Phiên hiện tại đã tạm dừng sau khi hoàn thành P2 (write-path resync) và P3 (Web/Umbraco EF model + `EfSubmissionDataStore` + DI registration).  
> Các bước còn lại được chia thành **7 work package độc lập**, mỗi package có thể giao cho một AI agent riêng biệt để thực hiện song song.

---

## Trạng thái đã xong (không cần làm lại)

| Phase | Nội dung | Files chính |
|-------|----------|-------------|
| P0 | DNN schema/package: object qualifier fix, manifest `01.07.108` | `MegaForm.DNN/Install/01.06.40.SqlDataProvider`, `.dnn` manifest |
| P1 | Core typed-read facade | `MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs`, `SubmissionQueryService`, `EmailNotificationService`, `WebhookService`, `DataRepeaterService`, `FieldOptionsService`, `AdminRecordShellService`, `WorkflowEngine` (read), `Blog.ScheduledPublishService`, `Blog.BlogAnalyticsRollupService` (read), `ConfiguredAppStarterService` (read) |
| P2 | Shared resync service + write paths | `TypedSubmissionResyncService.cs`, `WorkflowEngine.UpdateFieldAsync`, `AssignRoundRobinAsync`, `BlogAnalyticsRollupService`, `ConfiguredAppStarterService.SetSubmissionStatusAndField`, `DnnServiceLocator`, `MegaForm.DNN/WebApi/MegaFormApiController.UpdateData` |
| P3 | Web + Umbraco typed model + store | `MegaForm.Web/Data/DataLayer.cs`, `MegaForm.Web/Data/EfSubmissionDataStore.cs`, `MegaForm.Web/Program.cs`, `MegaForm.Umbraco/Data/MegaFormDbContext.cs`, `MegaForm.Umbraco/Data/EfSubmissionDataStore.cs`, `MegaForm.Umbraco/Composers/MegaFormComposer.cs` |

---

## Work packages còn lại (có thể chạy song song)

### WP-1 — Schema bootstrapper/migration cho Web và Umbraco (gấp nhất)

**Mục tiêu:** Đảm bảo 7 bảng typed (`MF_SubmissionFields` + 6 value tables) được tạo trên **database đã tồn tại** (upgrade), không chỉ fresh install.

**Vấn đề hiện tại:**
- `DatabaseSchemaBootstrapper` (Web) và `UmbracoDatabaseSchemaBootstrapper` chỉ kiểm tra `MF_ModuleSettings`. Nếu database đã có bảng cũ → `CreateTables()` không chạy → 7 bảng mới không được tạo.

**Nhiệm vụ:**
1. Thêm kiểm tra sự tồn tại của `MF_SubmissionFields`.
2. Nếu thiếu, chạy DDL tạo 7 bảng + index phù hợp provider (SQL Server, SQLite, PostgreSQL, MySQL).
3. Ưu tiên tái sử dụng mapping đã có trong `DataLayer.cs` / `MegaFormDbContext.cs` để tên bảng/cột/index khớp 100%.
4. Viết unit/integration test nhỏ hoặc script xác minh bảng được tạo.

**Files cần sửa/thêm:**
- `MegaForm.Web/Data/DatabaseSchemaBootstrapper.cs`
- `MegaForm.Umbraco/Data/UmbracoDatabaseSchemaBootstrapper.cs`
- Có thể thêm `TypedSubmissionSchemaBootstrapper.cs` helper trong cả 2 project.

**Tiêu chí hoàn thành:**
- `dotnet build` Web, Umbraco, Umbraco.Host thành công.
- Chạy host với database cũ (có `MF_ModuleSettings` nhưng thiếu `MF_SubmissionFields`) → bootstrapper tạo đủ 7 bảng mới.

---

### WP-2 — P1 Verification: runtime reconstruction

**Mục tiêu:** Xác nhận typed-first reconstruction hoạt động đúng trên Oqtane và fallback đúng trên legacy hosts.

**Nhiệm vụ:**
1. Trên Oqtane: submit form có nhiều field type (text, number, date, checkbox, file, address) → kiểm tra `MF_Submissions.DataJson` collapsed thành `"{}"` và dữ liệu vẫn reconstruct đúng khi đọc.
2. Trên DNN/Web/Umbraco: submit tương tự → `DataJson` vẫn giữ nguyên, typed rows được ghi song song.
3. Kiểm tra edge cases: field key có dấu cách/chữ hoa, multi-select, rich text, empty submission.
4. Ghi log/note lỗi nếu reconstruction sai.

**Tiêu chí hoàn thành:**
- Có báo cáo verification (markdown hoặc comment trong code) xác nhận reconstruct đúng.
- Nếu phát hiện lỗi, tạo bug-fix WP riêng.

---

### WP-3 — P4 Backfill wiring (`LegacySubmissionBackfillService`)

**Mục tiêu:** Cho phép backfill typed rows cho submissions cũ (legacy DataJson-only) trên các host đã có typed storage.

**Nhiệm vụ:**
1. Kiểm tra `MegaForm.Core/Services/TypedSubmission/LegacySubmissionBackfillService.cs` hiện có.
2. Cung cấp endpoint/controller action an toàn để trigger backfill theo form (batch) — chỉ admin.
3. Đảm bảo backfill fail-soft: một submission malformed không dừng cả batch.
4. Thêm hosted service option để tự động backfill khi khởi động (tắt mặc định, bật qua config).

**Files cần sửa/thêm:**
- `MegaForm.Core/Services/TypedSubmission/LegacySubmissionBackfillService.cs` (review)
- `MegaForm.Web/Controllers/AdminController.cs` hoặc tạo `MegaForm.Web/Controllers/TypedStorageController.cs`
- `MegaForm.Umbraco/Controllers/MegaFormAdminController.cs` hoặc tương đương

---

### WP-4 — P5 Reports & Search trên typed storage

**Mục tiêu:** Các báo cáo và search có thể tận dụng typed rows để tránh parse DataJson.

**Nhiệm vụ:**
1. Liệt kê tất cả reports/search paths: `ReportsController`, `SubmissionQueryService` search, `DataRepeaterService`, v.v.
2. Từng nơi: nếu host có typed rows, ưu tiên query typed tables; ngược lại fallback DataJson.
3. Không thay đổi contract/response shape.
4. Thêm test nhỏ cho query chính.

**Files cần sửa:**
- `MegaForm.Core/Services/SubmissionQueryService.cs`
- `MegaForm.Core/Services/DataRepeaterService.cs`
- Các controllers reports trong Web/Umbraco/Oqtane.

---

### WP-5 — P6 SDK contract & public API

**Mục tiêu:** Đảm bảo SDK `IMegaFormClient` và public DTOs phản ánh typed storage nếu cần, không break backcompat.

**Nhiệm vụ:**
1. Kiểm tra `MegaForm.Sdk/MegaFormClient.cs`, `Dtos.cs`, `PublicAPI.Unshipped.txt`.
2. Nếu cần expose typed field values, thêm DTO mới hoặc optional parameter (tuân thủ RS0027 warning đã có).
3. Cập nhật `PublicAPI.Unshipped.txt` nếu thêm API public.
4. Chạy `MegaForm.Sdk.Tests`.

---

### WP-6 — P7 Schema versioning & package manifests

**Mục tiêu:** Version schema và package đúng với tính năng typed storage.

**Nhiệm vụ:**
1. Cập nhật DNN manifest version cho release mới (nếu cần).
2. Cập nhật Oqtane package version nếu schema thay đổi.
3. Tạo migration version cho Umbraco nếu dùng Umbraco migrations (hoặc ghi chú bootstrapper).
4. Đảm bảo `AGENTS.md` và `README` phản ánh version.

---

### WP-7 — P8 Legacy cleanup

**Mục tiêu:** Dọn dẹp code dead-path sau khi typed storage ổn định.

**Nhiệm vụ:**
1. Tìm các hàm parse DataJson còn sót không cần thiết.
2. Xóa/cắt giảm logic fallback cũ nếu đã cover bởi `SubmissionDataResolver`.
3. Không xóa `MF_Submissions.DataJson` column — chỉ cleanup code.
4. Chạy full build và test.

---

## Thứ tự ưu tiên đề xuất

1. **WP-1** (block runtime — bắt buộc trước khi chạy host trên DB cũ).
2. **WP-2** (verify P1 — nên làm ngay sau WP-1).
3. WP-3, WP-4, WP-5, WP-6 có thể chạy song song sau WP-2.
4. WP-7 làm cuối cùng.

---

## Ghi chú cho AI agent tiếp theo

- Mỗi WP nên được thực hiện trong một phiên/agent riêng để tránh context quá tải.
- Sau mỗi WP, chạy `dotnet build` cho các project liên quan và cập nhật file này với trạng thái `DONE`.
- Nếu một WP phát hiện lỗi ảnh hưởng đến WP khác, tạo issue note trong file này.
