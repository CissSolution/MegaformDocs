# AUDIT: Trạng thái thực tế No-DataJson refactor & các SQL table nên dọn dẹp

Date: 2026-07-17  
Scope: MegaForm.Core, MegaForm.DNN, MegaForm.Oqtane.Server, MegaForm.Umbraco, MegaForm.Web  
Purpose: Đánh giá mức độ áp dụng triết lý typed submission storage (No-DataJson) và xác định các table/column legacy cần dọn dẹp.  
Author: Kimi Code CLI (audit only, no code changes).  

---

## 1. Tóm tắt điều chỉnh nhận định

Phiên trước nhận định refactor mới ở giai đoạn **Core abstractions**. Audit sâu hơn cho thấy thực tế phức tạp hơn:

| Platform | Typed tables (`MF_SubmissionFields` + `MF_SubmissionValue*`) | Trạng thái DataJson |
|----------|-------------------------------------------------------------|---------------------|
| **Oqtane** | ✅ Đã có migration `01060039`, EF mapping, `EfSubmissionDataStore` | Collapsed thành `"{}"` khi submit; đọc lại bằng hydration từ typed rows |
| **DNN** | ✅ Có `DnnSubmissionDataStore` viết typed rows | Vẫn là primary source (`SupportsDataJsonCollapse = false`) |
| **Umbraco** | ❌ Chưa có | Primary source of truth |
| **Web** | ❌ Chưa có | Primary source of truth |
| **Core** | ✅ Abstractions mới (`MegaForm.Core/Services/TypedSubmission/`) + vẫn còn nhiều runtime reads cũ | Vẫn serialize full `DataJson` trước khi viết typed rows |

**Kết luận tổng thể:** Refactor không phải ở giai đoạn "mới bắt đầu". Oqtane đã ở giai đoạn **pilot typed-primary** với hydration bridge. DNN đã viết typed rows song song nhưng vẫn giữ `DataJson` đầy đủ. Umbraco/Web chưa tham gia. Core vẫn bị "kẹt" giữa hai thế giới.

---

## 2. Toàn bộ MF_* tables hiện có theo platform

### 2.1 DNN — `MegaForm.DNN/Install/SqlScripts/01_CreateTables.sql`

| # | Table | Vai trò hiện tại | Legacy? |
|---|-------|------------------|---------|
| 1 | `MF_Forms` | Form definition master | ❌ Không |
| 2 | `MF_Submissions` | Submission master; `DataJson` chứa toàn bộ payload | ⚠️ `DataJson` legacy |
| 3 | `MF_SubmissionValues` | Flat per-field index (JSON snapshot + typed columns) | ⚠️ Legacy sau typed storage |
| 4 | `MF_Files` | File attachments | ❌ Không |
| 5 | `MF_WebhookLog` | Webhook delivery log | ❌ Không |
| 6 | `MF_RateLimitLog` | Anti-spam rate limit | ❌ Không |
| 7 | `MF_SavedDrafts` | Save & resume drafts; `DataJson` là payload draft | ❌ Không (ngoài scope) |
| 8 | `MF_WidgetData` | Widget/repeater rows | ✅ **Dead table** |
| 9 | `MF_SearchIndex` | Full-text search index | ✅ **Dead table** |
| 10 | `MF_FormAnalytics` | Daily aggregated stats | ❌ Không (separate concern) |
| 11 | `MF_Templates` | ZIP template gallery | ❌ Không |
| 12 | `MF_FormViews` | Multi-view per form | ❌ Không |
| 13 | `MF_FormPermissions` | Form-level access control | ❌ Không |
| 14 | `MF_AuditLog` | Audit trail | ❌ Không |
| 15 | `MF_Workflows` | Legacy per-form workflows | ❌ Không (workflow refactor riêng) |
| 16 | `MF_WorkflowRuns` | Workflow run instances | ❌ Không |
| 17 | `MF_WorkflowStepLog` | Workflow step execution log | ❌ Không |
| 18 | `MF_UniqueIdCounters` | Atomic sequential IDs | ❌ Không |
| 19 | `MF_FormRelations` | Cross-form relation definitions | ❌ Không |
| 20 | `MF_SubmissionLinks` | Parent→child submission links | ❌ Không |
| 21 | `MF_ModuleViewConfig` | Per-module view configuration | ❌ Không |

**Lưu ý nghiêm trọng:** `MF_SubmissionFields` và 6 bảng `MF_SubmissionValue*` được `DnnSubmissionDataStore` sử dụng tại runtime, nhưng **không có CREATE script** trong `MegaForm.DNN/SqlScripts/`. Uninstall script lại biết drop chúng. Đây là gap phải sửa ngay nếu DNN typed storage được coi là production-ready.

### 2.2 Oqtane — `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs`

| Table / DbSet | Vai trò |
|---------------|---------|
| `MF_Forms` | Form master |
| `MF_Submissions` | Submission master (DataJson collapsed) |
| `MF_SubmissionValues` | Flat index đang dần thay thế |
| `MF_SubmissionFields` | Typed field metadata snapshot |
| `MF_SubmissionValueString/LongText/Number/Date/Boolean/Json` | Typed value rows |
| `MF_Files` | File attachments |
| `MF_SavedDrafts` | Drafts |
| `MF_WebhookLog` | Webhook log |
| `MF_Apps`, `MF_AppQueries` | App definitions |
| `MF_Views` | Form views |
| `MF_Permissions` | Permissions |
| `MF_Workflows`, `MF_WorkflowExecutions`, `MF_WorkflowCases`, `MF_WorkflowTasks`, `MF_WorkflowTaskActions` | Workflow v2 |
| `MF_WorkflowTemplates`, `MF_WorkflowTemplateVersions`, `MF_FormWorkflows` | Workflow library |
| `MF_AI_Knowledge*`, `MF_ReportDefinitions`, `MF_ExternalBinding`, `MF_ExternalRowMap` | AI KB, reports, external tables |

### 2.3 Umbraco — `MegaForm.Umbraco/Data/MegaFormDbContext.cs`

Chưa có `MF_SubmissionFields` hay `MF_SubmissionValue*`. Chỉ có:

- `MF_Forms`, `MF_Submissions`, `MF_SubmissionValues`, `MF_Files`, `MF_SavedDrafts`, `MF_WebhookLog`
- `MF_ModuleSettings`, `MF_ModuleViewConfigs`, `MF_FormViews`, `MF_Templates`, `MF_FormPermissions`
- `MF_Workflows`, `MF_WorkflowExecutions`, `MF_AuditLog`, `MF_UniqueIdCounters`, `MF_RateLimits`
- `MF_WebUsers`, `MF_WebRoles`, `MF_WebUserRoles`
- `MF_WorkflowCases`, `MF_WorkflowTasks`, `MF_WorkflowTaskActions`
- `MF_AppDefinitions`, `MF_AppQueries`, `MF_FormRelations`, `MF_SubmissionLinks`
- `MF_Documents*` family
- `MF_AI_Knowledge*` family
- `MF_WorkflowTemplates`, `MF_WorkflowTemplateVersions`, `MF_FormWorkflows`
- `MF_ReportDefinitions`

### 2.4 Web — `MegaForm.Web/Data/DataLayer.cs`

Tương tự Umbraco: không có typed storage tables.

---

## 3. Phân tích `MF_SubmissionValues` — hybrid/legacy

Schema thực tế:

```sql
ValueId         BIGINT IDENTITY(1,1) PK
SubmissionId    INT NOT NULL FK -> MF_Submissions
FieldKey        NVARCHAR(100) NOT NULL
FieldValue      NVARCHAR(MAX) NULL       -- JSON snapshot
ValueNumber     DECIMAL(18,6) NULL       -- typed numeric projection
ValueDate       DATETIME2 NULL           -- typed date projection
ValueBit        BIT NULL                 -- defined, không active
ValueText       NVARCHAR(400) NULL       -- short text projection
FieldType       NVARCHAR(50) NULL
```

**Cách sử dụng hiện tại:**

- **DNN stored proc** `usp_MF_Submission_Insert` chỉ ghi `FieldKey` + `FieldValue` từ `OPENJSON(@DataJson)`.
- **Core `SubmissionIndexerService`** (B55) ghi đè toàn bộ rows và điền `ValueText`/`ValueNumber`/`ValueDate` cho reporting.
- **DNN search** dùng `MF_SubmissionValues.FieldValue LIKE`.
- **Oqtane/Umbraco/Web search** join `MF_SubmissionValues` cho free-text search.
- **Reports** dùng `ValueText`/`ValueNumber`/`ValueDate`.
- **Core `SubmissionQueryService.GetDetail`** đọc `SubmissionValueInfo` để build field snapshots.

**Nhận định:** `MF_SubmissionValues` là một thiết kế **hybrid** không rõ ràng. Nó vừa là JSON snapshot (`FieldValue`), vừa là flat typed index (`ValueText`/`ValueNumber`/`ValueDate`), vừa thiếu metadata snapshot đầy đủ (không có label/page/order). Sau khi `MF_SubmissionFields` + `MF_SubmissionValue*` hoàn thiện, `MF_SubmissionValues` nên được **coi là legacy** và loại bỏ.

---

## 4. Đếm `DataJson` runtime reads/writes thực tế

| Project | Tổng references | Runtime reads ước tính | Runtime writes | Migration/legacy | Draft DataJson |
|---------|-----------------|------------------------|----------------|------------------|----------------|
| `MegaForm.Core` | ~81 | ~45 | ~10 | ~15 | 0 |
| `MegaForm.DNN` | ~40 | ~22 | ~8 | ~5 | ~5 |
| `MegaForm.Oqtane.Server` | ~67 | ~25 | ~15 | ~15 | 0 |
| `MegaForm.Umbraco` | ~15 | ~8 | ~4 | ~2 | ~1 |
| `MegaForm.Web` | ~12 | ~6 | ~4 | ~1 | ~2 |

**Các runtime reads quan trọng trong Core (chưa chuyển sang typed):**

- `SubmissionQueryService.GetDetail` / `ToListItem` — detail/list/summary từ `submission.DataJson`
- `EmailNotificationService` — admin notification + autoresponder
- `WorkflowEngine` — workflow context + field update
- `WebhookService` — webhook payload
- `DataRepeaterService` — repeater render
- `FieldOptionsService` — dynamic options
- `AdminRecordShellService` — record shell
- `ExternalTable/*` — external table insert/query
- Nhiều `Starters/*`, `Blog/*`, `Payments/*`

**Kết luận:** Mục tiêu "runtime không parse DataJson" chưa đạt được. Core vẫn là tâm điểm chưa chuyển đổi.

---

## 5. Danh sách SQL table/column legacy & khuyến nghị dọn dẹp

### 5.1 `MF_Submissions.DataJson`

**Trạng thái legacy:**
- Oqtane: đã collapsed thành `"{}"` khi submit, nhưng vẫn được rehydrate trên read và là contract nội bộ của nhiều Core service.
- DNN: vẫn là primary source.
- Umbraco/Web: primary source.

**Khuyến nghị:**
- **Short-term:** giữ nullable, đánh dấu deprecated comment. Không drop.
- **Medium-term:** sau khi toàn bộ Core readers chuyển sang `ISubmissionDataStore.GetData()` và reconstructor, có thể drop column.
- **Oqtane:** có thể chuyển `DataJson` thành `NULL` hoặc computed persisted JSON từ typed rows.

### 5.2 `MF_SubmissionValues` (toàn bộ table)

**Trạng thái legacy:** Đã bị thay thế bởi `MF_SubmissionFields` + `MF_SubmissionValue*`. Vẫn đang dùng cho reporting/search fallback.

**Khuyến nghị:**
- **Oqtane:** deprecate sau khi reports/dashboard chuyển sang typed tables. Drop trong release lớn.
- **DNN:** deprecate sau khi DNN typed tables có đủ CREATE script và reports chuyển đổi.
- **Umbraco/Web:** giữ cho đến khi implement typed storage xong. Sau đó drop.
- **Alternative:** convert `MF_SubmissionValues` thành compatibility view trên `MF_SubmissionFields` + `MF_SubmissionValueString` để không break old reports/custom SQL.

### 5.3 `MF_WidgetData`

**Trạng thái legacy:** Dead table. Không có C# reference nào. Dữ liệu widget phức tạp hiện nằm trong `DataJson` / `MF_SubmissionValueJson`.

**Khuyến nghị:** Drop khỏi `01_CreateTables.sql` và thêm migration drop cho existing installs.

### 5.4 `MF_SearchIndex`

**Trạng thái legacy:** Dead table. Không có C# reference. Search thực tế dùng `MF_SubmissionValues.FieldValue` / `DataJson.Contains` / typed `DisplayValue`.

**Khuyến nghị:** Drop khỏi create scripts và thêm migration drop.

### 5.5 `MF_SavedDrafts.DataJson`

**Trạng thái legacy:** Không legacy. Draft là transient JSON payload, nằm ngoài scope typed submission storage.

**Khuyến nghị:** Giữ nguyên. Nếu muốn "no DataJson anywhere" thì cần quyết định riêng: hoặc giữ draft JSON, hoặc thêm `MF_DraftFields` + typed draft values.

### 5.6 `MF_FormAnalytics.AggregatesJson`

**Trạng thái legacy:** Không. Là pre-aggregated analytics, separate concern.

**Khuyến nghị:** Giữ.

### 5.7 Workflow JSON columns (`MF_WorkflowRuns.ContextJson`, `MF_WorkflowStepLog.InputJson/OutputJson`)

**Trạng thái legacy:** Không. Đây là workflow runtime state, không phải submission field data.

**Khuyến nghị:** Giữ.

---

## 6. Decision matrix cleanup

| Table / Column | Drop ngay? | Giữ deprecated? | Chuyển view? | Hành động đề xuất |
|----------------|------------|-----------------|--------------|-------------------|
| `MF_Submissions.DataJson` (Oqtane) | ❌ | ✅ | Có thể sau | Đợi Core readers chuyển hết |
| `MF_Submissions.DataJson` (DNN/Umbraco/Web) | ❌ | ✅ | ❌ | Primary cho đến khi typed storage xong |
| `MF_SubmissionValues` (Oqtane/DNN) | ❌ | ✅ | ✅ khuyến khích | Deprecate, tạo view khi reports ổn định |
| `MF_SubmissionValues` (Umbraco/Web) | ❌ | ✅ | ❌ | Giữ cho đến khi có typed storage |
| `MF_WidgetData` | ✅ | ❌ | ❌ | Drop ngay |
| `MF_SearchIndex` | ✅ | ❌ | ❌ | Drop ngay |
| `MF_SavedDrafts.DataJson` | ❌ | ✅ | ❌ | Giữ, xử lý riêng |

---

## 7. Các gaps nghiêm trọng cần sửa trước khi dọn dẹp

### 7.1 DNN thiếu CREATE script cho typed tables (CRITICAL)

`DnnSubmissionDataStore.cs` INSERT vào `MF_SubmissionFields`/`MF_SubmissionValue*` nhưng fresh DNN install không tạo các bảng này. Cần thêm `MegaForm.DNN/SqlScripts/01.06.39.SqlDataProvider`.

### 7.2 Core readers chưa chuyển sang typed

Hàng chục service trong `MegaForm.Core` vẫn deserialize `submission.DataJson`. Không thể drop `DataJson` cho đến khi các service này dùng `ISubmissionDataStore.GetData()`.

### 7.3 Umbraco & Web chưa có typed storage

Hai platform này vẫn hoàn toàn dựa vào `DataJson`. Cần implement `ISubmissionDataStore`, thêm DbSets/migrations, register DI.

### 7.4 Typed update API thiếu

`ISubmissionDataStore` chỉ có `ReplaceFields`. Workflow field mutation vẫn deserialize/serialize `DataJson` qua `_subRepo.UpdateData`. Cần thêm `SetField` hoặc `UpdateFields`.

### 7.5 Backfill chưa wired vào host

`LegacySubmissionBackfillService` tồn tại nhưng chưa có endpoint/job nào gọi. Cần host-specific trigger.

### 7.6 Schema versioning chưa có

Handout đề xuất `MF_FormSchemaVersions` và `MF_FormFields` để old submissions render đúng. Hiện chưa implement.

### 7.7 SDK contract chưa cập nhật

`MegaForm.Sdk/Dtos.cs` vẫn expose `SubmissionDto.DataJson` là chính. Chưa có `Data`/`Fields` typed contract.

---

## 8. Khuyến nghị lộ trình dọn dẹp

### Phase A — Khẩn cấp (trước khi deploy DNN typed storage)

1. Thêm `MegaForm.DNN/SqlScripts/01.06.39.SqlDataProvider` tạo `MF_SubmissionFields` + 6 `MF_SubmissionValue*`.
2. Kiểm tra `DnnSubmissionDataStore` có hoạt động đúng trên existing data không.

### Phase B — Chuyển Core sang typed (lớn nhất)

1. Mở rộng `ISubmissionDataStore` thêm `SetField`/`UpdateFields`.
2. Sửa `SubmissionQueryService.GetDetail`, `ToListItem` để đọc typed rows khi có.
3. Sửa `EmailNotificationService`, `WebhookService`, `WorkflowEngine`, `DataRepeaterService`, `FieldOptionsService`, `AdminRecordShellService` để dùng `_typedStore.GetData().Data`.
4. Cập nhật `ExternalTable/*` để dùng typed data.
5. Audit và sửa tất cả `Starters/*`, `Payments/*`, `Blog/*`.

### Phase C — Hoàn thiện platform

1. Implement typed storage cho Umbraco và Web.
2. Backfill legacy submissions trên tất cả platform.
3. Thêm `MigratedToTypedOnUtc` marker.

### Phase D — Dọn dẹp legacy tables

1. Drop `MF_WidgetData` và `MF_SearchIndex`.
2. Trên Oqtane/DNN: deprecate `MF_SubmissionValues`, tùy chọn tạo compatibility view.
3. Sau khi toàn bộ readers đã switch: drop `MF_Submissions.DataJson` hoặc chuyển thành nullable computed.

---

## 9. Files tham khảo chính

| Mục đích | Path |
|----------|------|
| DNN DDL | `MegaForm.DNN/Install/SqlScripts/01_CreateTables.sql` |
| DNN procs | `MegaForm.DNN/Install/SqlScripts/02_StoredProcedures.sql` |
| DNN uninstall | `MegaForm.DNN/Install/SqlScripts/Uninstall.SqlDataProvider` |
| DNN typed store | `MegaForm.DNN/Data/DnnSubmissionDataStore.cs` |
| Oqtane EF model | `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs` |
| Oqtane typed migration | `MegaForm.Oqtane.Server/Migrations/01060039_AddTypedSubmissionStorage.cs` |
| Oqtane hydration | `MegaForm.Oqtane.Server/Data/EfRepositories.cs` (HydrateDataJson) |
| Umbraco model | `MegaForm.Umbraco/Data/MegaFormDbContext.cs` |
| Web model | `MegaForm.Web/Data/DataLayer.cs` |
| Core processor | `MegaForm.Core/Services/SubmissionProcessor.cs` |
| Core query | `MegaForm.Core/Services/SubmissionQueryService.cs` |
| Core indexer | `MegaForm.Core/Services/SubmissionIndexerService.cs` |
| Core abstractions mới | `MegaForm.Core/Services/TypedSubmission/*`, `MegaForm.Core/Interfaces/ISubmissionDataStore.cs` |

---

## 10. Kết luận cuối cùng

- **Không nên coi No-DataJson là "sắp xong".** Oqtane đi được nửa đường; DNN có code nhưng thiếu schema; Umbraco/Web chưa bắt đầu; Core readers vẫn JSON-centric.
- **Các table/column nên coi là legacy sau refactor:** `MF_Submissions.DataJson`, `MF_SubmissionValues` (toàn bộ), `MF_WidgetData`, `MF_SearchIndex`.
- **Các table/column KHÔNG legacy:** `MF_SavedDrafts.DataJson`, `MF_FormAnalytics.AggregatesJson`, workflow JSON columns.
- **Lỗ hổng nghiêm trọng nhất:** DNN thiếu CREATE script cho typed tables.
- **Việc lớn nhất tiếp theo:** chuyển toàn bộ Core readers sang `ISubmissionDataStore`, sau đó implement typed storage cho Umbraco/Web.
