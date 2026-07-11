# NGHIÊN CỨU — Form trên bảng SQL có sẵn (500.000 rows)

**Ngày:** 2026-07-11 · **Trạng thái:** nghiên cứu code-level xong (3 agent map toàn bộ codebase), CHƯA implement.

## 0. Yêu cầu khách hàng

Khách có sẵn **1 bảng SQL quan hệ** (form support-ticket, ~500.000 rows, có cột file upload). Họ muốn:

1. Chọn bảng đó trong MegaForm → AI sinh form từ cấu trúc bảng.
2. Form dùng được ngay: submit **ghi thẳng vào bảng đó**.
3. Dashboard Submissions hiển thị **đủ 500k rows CŨ** (không phải nhập lại).

Ba việc này đi qua **ba đường code khác nhau**, và năng lực hiện tại của từng đường rất khác nhau.

---

## 1. TÓM TẮT ĐIỀU HÀNH

| Mảnh | Hiện trạng | Đánh giá |
|---|---|---|
| **A. Sinh form từ bảng** | Đã có phần lớn: introspect bảng, map SQL type → UI type, UI "Build fields with AI" từ nhiều bảng | ✅ ~80% — chỉ thiếu 1-click + suy FK/Email/Phone |
| **B. Submit ghi vào bảng ngoài** | `FormDatabaseInsertService` = **INSERT-only, mirror, fail-soft, chạy SAU MF_Submissions** | ⚠️ ~40% — không UPDATE, không lấy identity, không transaction chung, file path không ghi được |
| **C. Dashboard đọc 500k rows cũ** | **KHÔNG tồn tại** — dashboard khoá cứng vào `MF_Submissions` | ❌ 0% — nhưng có **1 điểm nối sạch** (`ISubmissionRepository`) để làm |

**Kết luận:** mảnh (C) là phần chưa có gì nhưng **lại là phần dễ làm sạch nhất**, vì mọi đường đọc đều hội tụ về đúng một interface. Mảnh (B) mới là chỗ nhiều bẫy kiến trúc (mirror + fail-soft + không bypass được `MF_Submissions`).

---

## 2. MẢNH ĐÃ CÓ

### 2.1 Introspect bảng + sinh field (A)

- `SqlSchemaReader.ListColumns` + `ClassifyUiType` — `MegaForm.Core/Services/Subform/SqlSchemaReader.cs:59-120`: đọc name/dataType/nullable/isPrimary, map `bit→boolean`, `int/decimal→number`, `date/time→date`, còn lại `text`.
- Endpoint: `AiTools/SqlTables|SqlColumns|PreviewSql|DryRunValidate|ProposeTableSchema` (`AiToolsController.cs:67,85,112,136,203`) + `Subform/Tables|Columns` (`SubformController.cs:68,109`). **Tất cả Admin/Host-gated.**
- UI đã có 2 chỗ: builder tab **DB** (`db-tables-panel.ts`, chip cột → field `columnToFieldTemplate:155`, **multi-table "Build fields with AI"** `:306`) và dashboard **Create with AI** tab DB (`ai-form-creator.ts:534,598`).
- Connection: **server-configured only** — client chỉ chọn connection *key*, không nhập connection string (`dom.ts:1114`).

### 2.2 Ghi ra bảng ngoài (B)

- `FormDatabaseInsertService` — `MegaForm.Core/Services/FormDatabaseInsertService.cs:50`, `Execute` `:57`, `TestExecute` (dry-run, luôn rollback) `:119`.
- Config: `FormDatabaseInsertSettings` — `MegaForm.Core/Models/FormSchema.cs:612-635` (`enabled`, `connectionKey`, `insertSql`, `parameterMapping`).
- Parameterized 100% (`:96-99`); guard `IsDangerousNonInsertQuery` (`:212-221`) bắt buộc bắt đầu bằng `INSERT`, chặn stacking/comment/DDL.
- Call site: Oqtane `MegaFormController.cs:1580`, DNN `MegaFormApiController.cs:1112`.

### 2.3 Điểm nối để đọc (C) — **quan trọng nhất**

- `ISubmissionRepository` — `MegaForm.Core/Interfaces/ICoreInterfaces.cs:29-43`. **Cả list lẫn detail của dashboard đều đi qua đúng interface này**, qua facade `SubmissionQueryService` (`MegaForm.Core/Services/SubmissionQueryService.cs:31-92`).
- DI binding 1 dòng: `MegaForm.Oqtane.Server/Services/Startup.cs:75`.
- DTO `SubmissionListItem` mang `DataJson` free-form (`MegaForm.Core/Models/SubmissionQueryModels.cs:21-35`) → **cột lạ của bảng ngoài đi lọt qua payload mà không cần đổi contract**.
- Hạ tầng kết nối DB ngoài đã có: `IConnectionRegistry.GetConnection` (`MegaForm.Core/Interfaces/IWorkflowInterfaces.cs:284-291`), đang được `DataRepeaterService` dùng thật (`DataRepeaterService.cs:127-135`).

---

## 3. KHOẢNG TRỐNG

### 3.1 Đường GHI (B)

| # | Khoảng trống | Bằng chứng |
|---|---|---|
| G1 | **Không bypass được `MF_Submissions`.** Form luôn lưu JSON vào `MF_Submissions.DataJson` trước; `databaseInsert` chỉ là **bản sao mirror** chạy sau | `MegaFormController.cs:1560→1563→1580` |
| G2 | **INSERT-only** — `UPDATE` bị chặn cứng | `FormDatabaseInsertService.cs:209,219` |
| G3 | **Không sửa được row có sẵn** — không có endpoint nạp row từ bảng ngoài để prefill; config không có `keyColumn`/PK/mode | `FormSchema.cs:612-635` |
| G4 | **Không lấy identity sau INSERT** (không có `SCOPE_IDENTITY`/`OUTPUT INSERTED`) → không liên kết ngược MF_Submissions ↔ row ngoài | `FormDatabaseInsertService.cs:36,101` |
| G5 | **Không transaction chung + fail-soft** → MF_Submissions có row, bảng ngoài không có, **không ai biết** (không retry, không dead-letter) | `FormDatabaseInsertService.cs:106-110`; `MegaFormController.cs:1590-1594` |
| G6 | **Web + Umbraco không gọi `Execute`** → `databaseInsert` là dead config trên 2 platform này | `MegaForm.Web/Controllers/MegaFormController.cs:718-753` |
| G7 | Lifecycle hooks (đường DUY NHẤT có UPDATE khi submit) **chỉ chạy trên DNN**, và chỉ 2/6 slot (`preInsert`/`postInsert`) | `MegaFormApiController.cs:1064,1145` |
| G8 | Workflow `DatabaseNodeExecutor` (có Insert/Update/**Upsert**, map field→column khai báo sạch) **KHÔNG đăng ký DI trên Oqtane** — platform chính của khách | `MegaForm.Oqtane.Server/Services/Startup.cs:136-143` |
| G9 | **File path không ghi được vào cột bảng ngoài** — field File bind ra nguyên chuỗi JSON array | `SubmissionFileMetaExtractor.cs:15-16`; `FormDatabaseInsertService.cs:92` |
| G10 | DNN chỉ hỗ trợ **1 connection** (bảng ngoài phải cùng DB với dashboard) | `MegaFormApiController.cs:4459-4461` |

### 3.2 Đường ĐỌC (C)

| # | Khoảng trống | Bằng chứng |
|---|---|---|
| R1 | **Chưa có adapter nào đọc nguồn ngoài** cho Submissions. Mọi repo đều `ToTable("MF_Submissions")` | `MegaFormDbContext.cs:80,92` |
| R2 | **Advanced filter + sort + date-range là 100% CLIENT-SIDE** — chỉ lọc/sắp 50 row của trang hiện tại. Với 500k, kết quả **sai về nghiệp vụ** | `submission-advanced-filter.ts:721`; `SubmissionsShell.ts:985-991,1252-1264` |
| R3 | `List(...)` **không có tham số sort** — server cố định `ORDER BY SubmittedOnUtc DESC` | `ICoreInterfaces.cs:29-43`; `EfRepositories.cs:144` |
| R4 | **Search = LIKE `%x%` trên `DataJson` NVARCHAR(MAX)** (Oqtane/Umbraco) → full scan mọi lần gõ | `EfRepositories.cs:142` |
| R5 | **DNN `new` thẳng repository trong controller**, không qua DI → swap DI **không đủ** cho DNN | `MegaFormApiController.cs:1912` |
| R6 | **Clamp PageSize ≤ 250 trong facade** → Oqtane **export 10000 thực tế chỉ ra 250 row** (bug thật, đang tồn tại) | `SubmissionQueryService.cs:35` vs `MegaFormController.cs:2454` |
| R7 | Umbraco FormsOverview gọi `List(pageSize: int.MaxValue)` **cho mỗi form** → chết ngay khi trỏ vào bảng 500k | `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:445` |
| R8 | Cột dashboard chỉ hiểu **key trong `DataJson`**; không có cơ chế map cột lạ → cần `FormSchema` tương ứng để có label/thứ tự | `SubmissionsShell.ts:244-269` |
| R9 | Adapter read-only phải no-op an toàn cho `Insert/UpdateStatus/Delete/InsertValues` — hiện **không có khái niệm read-only repo** | `ICoreInterfaces.cs:29-43` |

### 3.3 Rủi ro riêng của 500k rows

- `COUNT(*)` exact mỗi lần list (`EfRepositories.cs:143`) + OFFSET deep-page scan-discard.
- "All Forms" fan-out **50 form × 500 row**, merge + sort + paginate client-side (`SubmissionsShell.ts:1808-1827`).
- Nhiều chỗ `pageSize: 10000 / 5000 / int.MaxValue` (export, email summary, blog rollup, starters) — xem bảng §7 báo cáo agent #2.
- Index: `MF_Submissions` có `(FormId, SubmittedOnUtc)` + `(FormId, Status, SubmittedOnUtc)`; **không có index nào phục vụ search LIKE**. Bảng ngoài của khách **bắt buộc** phải có index `(Status, CreatedOn DESC)` hoặc tương đương.
- ⚠️ `MF_SubmissionValues` (EAV): 2 writer ghi 2 schema khác nhau — `SubmissionProcessor.cs:292-298` ghi `FieldValue`, `SubmissionIndexerService.cs:170-171` ghi `ValueText/ValueNumber/ValueDate` **không có `FieldValue`** (NOT NULL trên Oqtane) → INSERT fail, **bị nuốt âm thầm** (`SubmissionProcessor.cs:310-322`). Cần verify trên DB live trước khi dựa vào EAV.

---

## 4. PHƯƠNG ÁN

### Phương án 1 — **"Virtual form over external table"** (ĐỀ XUẤT)

Bảng ngoài trở thành nguồn thật; MegaForm chỉ là UI.

1. **Read**: `ExternalTableSubmissionRepository : ISubmissionRepository` — map row → `SubmissionInfo` (`SubmissionId` = PK bảng ngoài, `FormId` ảo, `SubmittedOnUtc` = cột ngày, `DataJson` = JSON các cột). Đổi DI (`Startup.cs:75`) theo form: cần **factory chọn repo theo formId**, không phải swap toàn cục.
2. **Schema ảo**: sinh `FormSchema` từ `SqlSchemaReader.ListColumns` → dashboard có label/thứ tự cột đúng, tái dùng 100% UI hiện tại (R8).
3. **Write**: mở rộng `FormDatabaseInsertSettings` thêm `keyColumn` + `mode: insert|update|upsert` + trả `SCOPE_IDENTITY()` (G2, G3, G4); nới guard cho `UPDATE ... WHERE keyColumn = :id` do **server sinh** (không nhận SQL client).
4. **Server-side filter/sort** (R2, R3): thêm `sort` + `fieldFilters` vào `SubmissionListQuery`, đẩy xuống SQL; client bỏ lọc-trên-trang.
5. Bỏ clamp 250 (R6), sửa Umbraco `int.MaxValue` (R7), sửa DNN `new` repo (R5).

**Ưu:** đúng ý khách (không nhân đôi dữ liệu), 500k rows chạy được nếu bảng có index. **Nhược:** động vào contract `ISubmissionRepository` + client → phải hồi quy cả 4 platform.

### Phương án 2 — **ETL/import 1 lần** (nhanh, tạm)

Bulk-copy 500k rows vào `MF_Submissions` (mỗi row → `DataJson`), form mới ghi bình thường.

**Ưu:** không đụng kiến trúc, dashboard chạy ngay (đã chứng minh 500k rows trên :5120 form 35). **Nhược:** dữ liệu nhân đôi, hệ cũ của khách và MegaForm **trôi lệch nhau** ngay hôm sau — chỉ hợp khi khách bỏ hẳn hệ cũ.

### Phương án 3 — **SQL VIEW hình dạng MF_Submissions** (rẻ nhất, read-only)

Tạo view ánh xạ bảng ngoài sang đúng cột của `MF_Submissions` (`DataJson` = `FOR JSON`), trỏ MegaForm vào view.

**Ưu:** gần như không sửa code, xem được 500k rows ngay. **Nhược:** read-only (không submit/sửa qua MegaForm), search LIKE trên JSON sinh động = rất chậm, vẫn dính R2 (filter client-side).

**Khuyến nghị:** làm **PA3 trước để demo cho khách trong ngày** (chỉ cần xem 500k rows cũ), rồi làm **PA1 theo lộ trình** cho bản chính thức. PA2 chỉ dùng nếu khách chấp nhận migrate hẳn.

---

## 5. VIỆC TIẾP THEO (nếu duyệt PA1)

1. Verify live trên :5122: schema thật của `MF_SubmissionValues` (8 cột hay 4?) — quyết định EAV còn dùng được không.
2. Prototype `ExternalTableSubmissionRepository` + factory theo formId (read-only, throw an toàn ở các method ghi — R9).
3. Sinh `FormSchema` ảo từ `SqlSchemaReader` cho bảng khách; đo thời gian list/search/deep-page trên 500k thật.
4. Mở rộng `SubmissionListQuery` (sort + fieldFilters) và đẩy advanced-filter xuống server.
5. Đường ghi: `keyColumn` + upsert + identity; quyết định có bỏ mirror `MF_Submissions` hay giữ song song.

---

## Nguồn

Báo cáo đầy đủ (kèm `file:line`) của 3 agent map codebase: agent #1 (đường ghi SQL ngoài), agent #2 (đường đọc dashboard), agent #3 (AI sinh form từ bảng — tóm tắt trong `STATUS_20260711_PAUSE.md`).
