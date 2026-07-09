# HANDOFF — SQL Server lưu submission ở SCALE (500k–triệu record). Việc cho PHIÊN SAU thực thi.

> Câu hỏi user (2026-07-09): "dùng SQL Server để lưu data của 1 form thì vấn đề thế nào?".
> Handoff này = phân tích ĐÃ VERIFY với code + 2 DB live (DNN `DNNQA1799` fresh, Oqtane `Oqtane_MegaForm_Prod1797` :5120)
> + kế hoạch fix chi tiết. **Chưa code gì** — user muốn để phiên sau sửa.
> Đọc kèm memory `project_sqlserver_submission_storage_scale`.

---

## 0. TL;DR (đọc cái này trước)

- SQL Server **thừa sức** lưu triệu submission; vấn đề nằm ở **schema/index + cách viết query**, không phải bản thân DB.
- Mô hình: mỗi submit ghi 2 nơi — `MF_Submissions.DataJson` (**NVARCHAR(MAX)** JSON blob) + `MF_SubmissionValues` (**flat EAV**, 1 row/field, cho filter/report).
- **DNN = ổn** (10 cột + 8 index, SqlScript idempotent chạy được). **Oqtane = yếu nhất**: có cột nhưng **CHỈ có PK index** (2 reporting index bị thiếu vì EF migration `Up()` không tạo tin cậy) → mọi query = full scan.
- 3 nút thắt chung mọi platform: **search `LIKE '%..%'` trên NVARCHAR(MAX)** (full scan), **OFFSET pagination** (`Skip/Take`) + **`COUNT(*)` exact**, và **EAV** khó sort/filter theo field-value.
- **Fix ROI cao nhất, rủi ro thấp nhất = thêm index cho Oqtane** (§4.1). Sau đó full-text search + keyset pagination + partition.

---

## 1. Ground truth — mô hình lưu trữ (đã verify)

### 1.1. Hai nơi lưu song song
| Bảng | Kiểu | Vai trò | Ghi bởi |
|---|---|---|---|
| `MF_Submissions.DataJson` | **NVARCHAR(MAX)** (verified live: `max_length=-1`) | Canonical — toàn bộ submission dạng JSON | SubmissionProcessor (Newtonsoft) |
| `MF_SubmissionValues` | flat **EAV**, 1 row/field | Index phẳng cho filter/report/search | `MegaForm.Core/Services/SubmissionIndexerService.cs:170` |

`SubmissionIndexerService.cs:170`:
```sql
INSERT INTO MF_SubmissionValues (SubmissionId, FormId, FieldKey, ValueText, ValueNumber, ValueDate) ...
```
Số → `ValueNumber`, Date/DOB → `ValueDate`, còn lại (text/select/checkbox/richtext…) → `ValueText`.
⇒ form 20 field × 1M submission = **20M rows** trong EAV.

### 1.2. Query layer (đã verify)
- Entry: `MegaForm.Core/Services/SubmissionQueryService.cs` (shared) → `List(query)` truyền `query.Search` xuống repo platform (`_subRepo`), nhận `(items, TotalCount)`.
- Repo Oqtane = `MegaForm.Oqtane.Server/Data/EfRepositories.cs`:
  - `:142` `if (!string.IsNullOrEmpty(search)) q = q.Where(s => s.DataJson.Contains(search));` → EF dịch **`DataJson LIKE N'%search%'`** trên NVARCHAR(MAX) = **FULL SCAN**.
  - `:143` `int total = q.Count();` → **`COUNT(*)` exact**.
  - `:144` `q.OrderByDescending(s => s.SubmittedOnUtc).Skip(pageIndex*pageSize).Take(pageSize)` → **OFFSET pagination**.
- ⚠️ Đường **bound-query** (`MegaFormController.cs:2046-2082`): fetch **`PageSize = 5000`** rồi `.Where(...).Skip().Take()` **IN-MEMORY** → tải 5000 row về app rồi lọc; rất xấu khi form lớn.

---

## 2. Ground truth — schema TỪNG PLATFORM (verified live + code)

### 2.1. DNN — TỐT NHẤT ✅
- Live `DNNQA1799`.`MF_SubmissionValues` = **10 cột**: ValueId, SubmissionId, FieldKey, FieldValue, ValueNumber, ValueDate, ValueBit, ValueText, FieldType, FormId.
- **8 index**: PK + `IX_MF_SubValues_SubId` / `_FieldKey` / `_Number` / `_Date` / `_Text` + `IX_MF_SubmissionValues_FormId_FieldKey` + `_FormId_ValueDate`.
- Định nghĩa: `MegaForm.DNN/SqlScripts/01.06.30.SqlDataProvider` — pattern **idempotent** `IF OBJECT_ID... IS NULL CREATE`, `IF COL_LENGTH(...) IS NULL ALTER ADD`, `IF NOT EXISTS(sys.indexes) CREATE INDEX`. **Chạy được** trên install/upgrade (đã thấy đủ 8 index trên fresh install).
- Data access = stored procs (`02_StoredProcedures.sql`) → dễ tune query plan.

### 2.2. Oqtane — YẾU NHẤT ⚠️ (đây là chỗ cần fix trước)
- Live `Oqtane_MegaForm_Prod1797`.`MF_SubmissionValues` = **8 cột** (ValueId, SubmissionId, FormId, FieldKey, FieldValue, ValueText, ValueNumber, ValueDate) — có đủ cột.
- **CHỈ 1 index = `PK_MF_SubmissionValues`**. THIẾU `IX_..._FormId_FieldKey` + `IX_..._FormId_ValueDate` (và không có index kiểu DNN cho FieldKey/Number/Date/Text).
- ⭐ **Root cause**: `MegaForm.Oqtane.Server/Migrations/01060030_AddReporting.cs` ĐỊNH NGHĨA `AddColumn FormId` + `CreateIndex IX_FormId_FieldKey` + `CreateIndex IX_FormId_ValueDate`, NHƯNG live DB có cột mà **không có 2 index** → EF Core migration `Up()` **không chạy/không tạo index tin cậy trên Oqtane** (khớp memory `project_20260703_kb_eagerseed`: "migration Up() DEAD trên Oqtane"). Cột có thể tới từ model-snapshot khi tạo bảng; index thì rớt.
- ⭐ **Đính chính phân tích Kimi**: Kimi nói "Oqtane thiếu cột → code insert cột không tồn tại → CRASH". SAI — live có đủ cột, indexer KHÔNG crash. Vấn đề THẬT = **thiếu index → full scan**, không phải crash.
- RCSI = **ON** (`is_read_committed_snapshot_on=1`) → không lo reader-writer blocking.

### 2.3. Web/Umbraco — TRUNG BÌNH
- Chưa đo live phiên này (Kimi: schema đầy hơn Oqtane, có index cơ bản, EF Core). **TODO phiên sau: verify** giống §2.1/2.2.

### 2.4. RCSI (verified)
- `Oqtane_MegaForm_Prod1797` = **1 (ON)** ✅ · `DNNQA1799` (fresh DNN) = **0 (OFF)** ⚠️ → DNN mặc định chưa bật READ_COMMITTED_SNAPSHOT → có thể blocking khi vừa insert vừa list/report.

---

## 3. Vấn đề khi 500k–triệu record (có evidence)

| # | Vấn đề | Evidence | Ảnh hưởng |
|---|---|---|---|
| P1 | Oqtane thiếu index MF_SubmissionValues | §2.2 (chỉ PK) | Mọi filter/report/sort field-value = full scan 20M rows |
| P2 | Search = `LIKE '%x%'` trên DataJson NVARCHAR(MAX) | EfRepositories.cs:142 | Full scan mọi platform; vài giây→chục giây |
| P3 | OFFSET pagination + `COUNT(*)` exact | EfRepositories.cs:143-144 | Deep-page (page 10k) scan-discard triệu row; COUNT đắt |
| P4 | Bound-query fetch 5000 + filter in-memory | MegaFormController.cs:2054 | Tải 5000 row/lần về app; sai total; tốn RAM |
| P5 | EAV khó index-cho-mọi-field + sort field-value | SubmissionIndexerService | JOIN/PIVOT, tempdb pressure |
| P6 | DataJson off-row LOB | max_length=-1 | List query chạm LOB → I/O lớn nếu SELECT * |
| P7 | DNN RCSI OFF | §2.4 | reader-writer blocking khi tải cao |
| P8 | Insert path N+1 row/txn | indexer | page-split/fragmentation nhanh; cần maintenance |

---

## 4. KẾ HOẠCH FIX (thứ tự ROI — làm từ trên xuống)

### 4.1. ⭐ P1 — Thêm index cho Oqtane MF_SubmissionValues (RỦI RO THẤP, ROI CAO NHẤT)
- **KHÔNG dựa vào EF migration `Up()`** (đã chứng minh không tạo index tin cậy trên Oqtane). Thay vào đó thêm **runtime self-heal chạy raw SQL idempotent** lúc startup (giống pattern DNN `01.06.30`), ví dụ trong `MegaFormWarmupHostedService` hoặc 1 `IHostedService`/`OnStartup` mới:
  ```sql
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_MF_SubmissionValues_FormId_FieldKey' AND object_id=OBJECT_ID('MF_SubmissionValues'))
     CREATE INDEX IX_MF_SubmissionValues_FormId_FieldKey ON MF_SubmissionValues (FormId, FieldKey) INCLUDE (ValueText, ValueNumber, ValueDate);
  IF NOT EXISTS (... 'IX_MF_SubmissionValues_FormId_ValueDate' ...)
     CREATE INDEX IX_MF_SubmissionValues_FormId_ValueDate ON MF_SubmissionValues (FormId, ValueDate);
  -- + covering cho list submissions:
  IF NOT EXISTS (... 'IX_MF_Submissions_Form_Status_Date' ...)
     CREATE INDEX IX_MF_Submissions_Form_Status_Date ON MF_Submissions (FormId, Status, SubmittedOnUtc DESC);
  ```
- Portable đa-DB (Oqtane hỗ trợ SQL Server/MySQL/Postgres/Sqlite): dùng `IDatabase` provider hoặc guard theo provider. Nếu chỉ target SQL Server thì raw SQL trên là đủ.
- **Verify trước**: cài 1 Oqtane FRESH mới → kiểm tra migration `01060030` có tự tạo index không (biết đâu :5120 chỉ là DB cũ hot-swap). Nếu fresh cũng thiếu → confirm cần self-heal.
- **3-platform twin**: DNN đã có (01.06.30). **Web/Umbraco**: verify + thêm nếu thiếu (§2.3).

### 4.2. P3/P4 — Pagination + count
- Thay OFFSET bằng **keyset** khi có thể: `WHERE SubmittedOnUtc < @lastSeen ORDER BY SubmittedOnUtc DESC` (cần cursor thay pageIndex ở API + client). Ảnh hưởng contract → làm sau index.
- `COUNT(*)` exact → cân nhắc **cached/approximate** (đã có `MF_FormAnalytics` — dùng làm nguồn total) hoặc trả `hasNextPage` thay total ở page sâu.
- Sửa bound-query (MegaFormController.cs:2046-2082): **đẩy filter status/field xuống SQL** thay vì fetch 5000 + lọc in-memory (dùng `SubmissionListQuery.Status` + field filter qua join MF_SubmissionValues).

### 4.3. P2 — Search
- Thay `DataJson.Contains(search)` (LIKE full-scan) bằng một trong:
  - (a) **SQL Full-Text**: `CREATE FULLTEXT INDEX ON MF_Submissions(DataJson) KEY INDEX PK...`; query `WHERE CONTAINS(DataJson, @term)`. (Chỉ SQL Server; Oqtane multi-DB cần guard theo provider.)
  - (b) Search qua **MF_SubmissionValues.ValueText** đã index (không quét DataJson) — hẹp hơn nhưng dùng được index.
- Điểm sửa: `EfRepositories.cs:142` (Oqtane) + twin DNN (stored proc) + Web repo.

### 4.4. P6/P7/P8 — Storage + concurrency + maintenance
- List query: **KHÔNG `SELECT DataJson`** ở list view (chỉ lấy cột cần cho grid) → tránh chạm LOB. Dùng projection/DTO.
- Bật **RCSI** cho DNN DB: `ALTER DATABASE ... SET READ_COMMITTED_SNAPSHOT ON` (Oqtane đã ON).
- Maintenance job: rebuild/reorganize index + `UPDATE STATISTICS` (Ola Hallengren); tempdb multi-file.

### 4.5. P5 — EAV (dài hạn, chỉ khi thật lớn)
- Partition `MF_Submissions` + `MF_SubmissionValues` theo `SubmittedOnUtc` (tháng/quý) + **archive** submission > 12–24 tháng sang bảng riêng; dashboard mặc định query active.
- File attachment → object storage (S3/Azure Blob), DB giữ metadata (`MF_Files`).
- Form CỰC lớn (report nặng): cân nhắc **hybrid** — sinh bảng relational riêng cho form đó thay EAV; hoặc indexed view cho field hay report.

---

## 5. Verification plan (bắt buộc — không đoán)
1. Seed synthetic: script chèn **500k–1M** row `MF_Submissions` + `MF_SubmissionValues` (dùng `SubmissionIndexerService` hoặc bulk insert) trên 1 DB test.
2. Đo BEFORE: `SET STATISTICS IO, TIME ON` cho: list page 1, list page 10.000, search 1 từ, filter theo field, COUNT. Ghi logical reads + duration + xem actual execution plan (scan vs seek).
3. Áp fix §4.1 → đo AFTER, so sánh (kỳ vọng scan→seek, reads giảm bậc).
4. Test cả 3 platform (DNN/Oqtane/Web) — 3-platform twin.

## 6. Gotchas load-bearing (đừng vấp)
- ⭐ **EF migration `Up()` không tin cậy trên Oqtane** → index PHẢI đi qua runtime self-heal raw SQL idempotent, KHÔNG chỉ `migrationBuilder.CreateIndex`.
- ⭐ **3-platform twin**: mọi thay đổi query/schema phải làm ở CẢ 3 (`MegaForm.DNN/SqlScripts` + `MegaForm.Oqtane.Server/Data/EfRepositories.cs` + Web/Umbraco repo) + shared `MegaForm.Core/Services/SubmissionQueryService.cs`.
- ⭐ **Đổi contract pagination (keyset) phải đồng bộ client JS** (`MegaForm.UI/src` submission list) — nếu không vỡ grid.
- ⭐ RCSI là **per-DB** (Oqtane ON, DNN OFF) — kiểm tra từng site.
- Verify SubmissionIndexerService.cs:170 cột khớp schema đích trước khi đổi (DNN/Oqtane khác nhau lịch sử).

## 7. Checklist thực thi (phiên sau)
- [ ] Verify Web/Umbraco MF_SubmissionValues schema+index (live) — điền §2.3.
- [ ] Verify fresh Oqtane install có tạo 2 reporting index không.
- [ ] §4.1 self-heal index Oqtane (+ Web nếu thiếu) — làm TRƯỚC, đo BEFORE/AFTER.
- [ ] §4.2 sửa bound-query in-memory + cân nhắc keyset/cached-count.
- [ ] §4.3 search full-text hoặc qua ValueText index.
- [ ] §4.4 no-SELECT-DataJson ở list + RCSI DNN + maintenance.
- [ ] (dài hạn) §4.5 partition/archive/object-storage.

---
Verified refs (repo này): `SubmissionIndexerService.cs:170` · `SubmissionQueryService.cs:41` · `EfRepositories.cs:142-144` · `MegaFormController.cs:2046-2082` · `01.06.30.SqlDataProvider` · `01060030_AddReporting.cs` · `SubmissionValueEntityBuilder.cs`.
Memory: [[project_sqlserver_submission_storage_scale]] · [[project_20260704_enterprise_perf_security_audit]].
