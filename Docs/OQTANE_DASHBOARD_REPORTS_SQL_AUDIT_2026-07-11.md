# Audit: Oqtane Dashboard / Reports / Statistics — Khả năng chuyển sang đọc & tính toán trực tiếp từ SQL tables

> Ngày audit: 2026-07-11  
> Cập nhật lần 2: sau các chỉnh sửa của Claude (các commit `edfcb9a`, `a78cd76`, `d043655`, `08da943`, `63e87d7`).  
> Phạm vi: `MegaForm.Oqtane.Server`, `MegaForm.Oqtane.Client`, `MegaForm.Oqtane.Shared`, cùng các dịch vụ shared `MegaForm.Core` mà Oqtane sử dụng.  
> Yêu cầu: chỉ viết tài liệu, **không code**.

---

## 1. Tóm tắt kết luận

### 1.1 Những gì đã cải thiện sau chỉnh sửa của Claude

| Lĩnh vực | Thay đổi | Trạng thái |
|---|---|---|
| **Reports / FormsOverview** | Oqtane đã tính `allTime` và day-series bằng SQL `GROUP BY` từ trước; commit `edfcb9a` chủ yếu **port fix sang Web/DNN/Umbraco**, không thay đổi Oqtane. | ✅ Ổn định |
| **Submission dashboard — JSON⇄SQL picker** | Client thêm toggle chuyển nguồn dữ liệu giữa `MF_Submissions` (JSON) và bảng SQL khách hàng. Server endpoint `CustomTableRows` đọc trực tiếp SQL table, admin-only, server-paginated, có allow-list connection. | ✅ Đã thêm |
| **SQL-source columns** | Cột grid lấy theo **DB column names** thay vì form field keys; có bucket cột riêng cho SQL; nhớ source theo từng form qua `localStorage`. | ✅ Đã sửa |
| **Workflow / CanvasView** | Đã thêm `[Authorize(Policy = "EditModule")]` — trước đây anonymous có thể đọc task counts và pending submissions. | ✅ Đã bảo mật |

### 1.2 Những gap vẫn còn

Dù đã có các cải thiện trên, **dashboard submission vẫn đang hoạt động theo kiểu N+1** ở main dashboard (`DashboardView.razor`). Nếu muốn chuyển toàn bộ dashboard, reports, statistics sang đọc và tính toán trực tiếp từ SQL tables, vẫn cần giải quyết:

1. Aggregate endpoint cho **main dashboard**.
2. Aggregate endpoint cho **All-Forms view** trong submission shell (fan-out 50 form).
3. Quyền truy cập dữ liệu khi aggregate SQL.
4. External-bound form (bảng khách hàng) không có row trong `MF_Submissions` (ngoại trừ SQL source picker mới).
5. Completion % metric dựa trên JSON parse in-memory.
6. Workflow canvas stats vẫn load toàn bộ task về memory (đã bảo mật nhưng chưa aggregate SQL).
7. `GetFormStats` vẫn chạy 6 query `Count` riêng biệt.
8. Portability SQL giữa SQL Server / SQLite / PostgreSQL / MySQL (`CustomTableRows` dùng SQL Server dialect).

---

## 2. Kiến trúc truy cập dữ liệu hiện tại

| Lớp | Cách truy cập | Ghi chú |
|---|---|---|
| **Controller** | Dùng `MegaFormDbContext` (EF Core) hoặc raw ADO (`GetDbConnection()`) trong một số endpoint reports. | `MegaFormController.Reports.cs` dùng `_dbContextFactory.CreateDbContext()` trực tiếp. |
| **Repository Oqtane** | `EfFormRepository`, `EfSubmissionRepository` implement `IFormRepository`, `ISubmissionRepository` từ Core. | `MegaForm.Oqtane.Server/Data/EfRepositories.cs` |
| **Service shared** | `SubmissionQueryService` (Core) là facade chung cho Web/DNN/Oqtane. | `MegaForm.Core/Services/SubmissionQueryService.cs` |
| **External table decorator** | `ExternalSubmissionRepository` bọc `EfSubmissionRepository`, chuyển hướng read sang DB khách hàng khi form có binding. | `MegaForm.Core/Services/ExternalTable/ExternalSubmissionRepository.cs` |
| **Indexer** | `SubmissionIndexerService` ghi trực tiếp `MF_SubmissionValues` bằng ADO/raw SQL. | `MegaForm.Core/Services/SubmissionIndexerService.cs` |
| **Stored procedure** | **Không có** stored procedure. Toàn bộ là EF LINQ hoặc raw parameterized SQL. |  |

---

## 3. Dashboard Submission

### 3.1 Main dashboard (`DashboardView.razor`) — vẫn N+1

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Oqtane.Client/DashboardView.razor` | `BuildDashboardJsonAsync()` (~dòng 135–211) | Gọi `ListFormsAsync(0, SiteId)` lấy toàn bộ form của site, sau đó `foreach` tối đa 8 form đầu, mỗi form gọi `GetSubmissionsAsync(formId, 0, 6)`. Tính tổng `TotalCount` và gom 6 submission gần nhất vào JSON. |
| `MegaForm.Oqtane.Client/Services/MegaFormService.cs` | `ListFormsAsync()`, `GetSubmissionsAsync()` | Client gọi `GET /api/MegaForm/Form/List?moduleId=0&siteId=...` và `GET /api/MegaForm/Submissions?formId=...`. |

**Vấn đề:** Main dashboard hiện tại vẫn là **N+1 query**: 1 query lấy danh sách form + N query lấy submission/count từng form.

### 3.2 Submission landing / forms overview — đã aggregate

File `MegaForm.UI/src/submissions/forms-overview.ts` (hoặc tương đương) hiện gọi một endpoint duy nhất:

- `GET /api/MegaForm/Reports/FormsOverview?siteId=...&days=...`

Endpoint này đã trả về count all-time và day-series theo form bằng SQL `GROUP BY`, giải quyết fan-out ở mức overview.

### 3.3 JSON⇄SQL Data-Source Picker (mới)

**Files liên quan:**

- Client: `MegaForm.UI/src/submissions/state.ts`, `MegaForm.UI/src/submissions/SubmissionsShell.ts`
- Server: `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`

**State mới (`state.ts`):**

```typescript
export type SubsSource = 'submissions' | 'sql';
export interface SubsState {
  // ...
  source: SubsSource;
  sqlTableName: string;
}
```

**Client logic (`SubmissionsShell.ts`):**

- `buildSourceSelect()` (~dòng 1430): render `<select>` toggle khi đang xem **single form** (`formId > 0`). All-Forms không có toggle.
- `fetchSqlRows()` (~dòng 1899): gọi `GET /api/AiTools/CustomTableRows?formId=N&page=N&pageSize=N`.
  - Normalize từng SQL row thành `Submission` với `dataJson = JSON.stringify(obj)` keyed by **DB column names**.
  - `submissionId` là **số âm tổng hợp** (`-(pageIndex * pageSize + i + 1)`) để tránh va chạm với real submissionId và để UI nhận diện "đây là SQL row".
- `loadSubmissions()` (~dòng 1925): nhánh `source === 'sql'` gọi `fetchSqlRows`; nhánh default gọi `_adapter.api.getSubmissions()` như cũ.
- `getResponseFieldDefs()` (~dòng 246): khi `source === 'sql'`, bỏ qua schema form và lấy cột từ **actual row keys** (DB column names).
- `syncActiveColumns()` (~dòng 286): bucket cột tách biệt:
  - JSON: `f{formId}`
  - SQL: `f{formId}:sql`
- SQL mode:
  - Không force các cột `Submitted By / Date / Status` (vì raw table row không có).
  - Seed **10 cột** đầu tiên từ dữ liệu SQL thay vì 5.
- Lưu source theo form vào `localStorage` key `mf-subs-source-v1`; khi chuyển form sẽ restore source của form đó.

**Server endpoint (`AiToolsController.cs`):**

- `CustomTableRows(int formId, int page = 1, int pageSize = 50)` (~dòng 168–255)
- Luồng:
  1. `if (!IsAdmin) return Forbid();`
  2. Đọc `form.SettingsJson` → lấy `databaseInsert.insertSql` và `databaseInsert.connectionKey`.
  3. Nếu không có INSERT enabled hoặc không parse được table → 404.
  4. Regex parse tên bảng/schema từ `insertSql`.
  5. Validate identifier chỉ chứa `\w+`.
  6. Giới hạn `pageSize <= 200` (bounded-read).
  7. Mở connection qua `OpenAiConnection(connectionKey)`:
     - `DashboardDatabase` → current dashboard DB.
     - Các key khác phải nằm trong allow-list `MegaForm:ExternalTables:AllowedConnections`.
  8. Thực thi:
     - `SELECT COUNT(*) FROM [schema].[table]`
     - `SELECT * FROM [schema].[table] ORDER BY 1 DESC OFFSET ... FETCH NEXT ... ROWS ONLY`
  9. Trả về `{ tableName, schemaName, idColumn, columns, rows, total, page, pageSize, source }`.

### 3.4 Có giải quyết N+1 không?

- **Không.** JSON⇄SQL picker không liên quan đến N+1 của main dashboard. Nó chỉ thêm một nguồn dữ liệu thay thế cho single-form grid.
- Khi chọn "Submissions" (default), grid vẫn gọi `GET /api/MegaForm/Submissions?formId=N` — một API call cho một form.
- Khi chọn "SQL table", grid gọi `GET /api/AiTools/CustomTableRows?formId=N` — cũng một API call.

### 3.5 Có đọc SQL tables trực tiếp không?

- **Có**, nhưng chỉ ở chế độ SQL source và chỉ cho single form đã cấu hình `databaseInsert`.
- Đọc read-only, server-paginated, admin-only, qua connection allow-list.
- Câu lệnh `SELECT *` + `OFFSET/FETCH` là **SQL Server-specific**, không portable sang SQLite/MySQL/PostgreSQL.

### 3.6 Model/DTO liên quan

- `MegaForm.Core/Models/SubmissionQueryModels.cs`: `SubmissionListQuery`, `SubmissionListItem`, `SubmissionPagedResult<T>`, `SubmissionDetailResult`.
- `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs`: `SubmissionDto`, `PagedResult<SubmissionDto>`, `FormDto`.
- `MegaForm.Core/Models/EntityModels.cs`: `SubmissionInfo`, `FormInfo`, `FormStatsInfo`.

---

## 4. Reports & Statistics

### 4.1 Report definitions

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs` | `ReportsList()`, `ReportsGet()`, `ReportsSave()`, `ReportsDelete()` | CRUD định nghĩa report. Lưu JSON định nghĩa vào `MF_ReportDefinitions`. |
| `MegaForm.Core/Models/ReportDefinition.cs` | `ReportDefinitionInfo`, `ReportDefinitionBody`, `ReportDataSource`, `ReportFilter`, `ReportMetric`, `ReportVisual` | Model định nghĩa report. Body là JSON blob linh hoạt. |

### 4.2 FormsOverview (submissions landing list / statistics)

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs` | `ReportsFormsOverview()` (~dòng 81–189) | Endpoint `GET /api/MegaForm/Reports/FormsOverview`. |
| | ~dòng 106–123 | Tính `allTime` và `dayCounts` bằng **EF LINQ `GroupBy` → SQL `GROUP BY`** trên `MF_Submissions`. Không materialize toàn bộ row trong window. |
| | ~dòng 131–133, `ComputeFormCompletion()` (~dòng 462–507) | Tính completion % bằng cách **đọc 50 submission gần nhất**, deserialize `DataJson`, so sánh với input fields của schema. **Hoàn toàn in-memory.** |
| | ~dòng 139–154 | Form external: lấy `ApproxRows` từ `ProfileJson` của `MF_ExternalBinding`, không đếm trực tiếp. |

Logic count SQL:

```csharp
var allTime = db.Submissions.AsNoTracking()
    .Where(s => !s.IsSpam && formIds.Contains(s.FormId))
    .GroupBy(s => s.FormId)
    .Select(g => new { FormId = g.Key, Count = g.Count() })
    .ToList();

var dayCounts = db.Submissions.AsNoTracking()
    .Where(s => !s.IsSpam && s.SubmittedOnUtc >= since && formIds.Contains(s.FormId))
    .GroupBy(s => new { s.FormId, Day = s.SubmittedOnUtc.Date })
    .Select(g => new { g.Key.FormId, g.Key.Day, Count = g.Count() })
    .ToList();
```

- `days` bị giới hạn `[1, 90]`.
- External-bound form vẫn dùng `ApproxRows` từ `MF_ExternalBinding.ProfileJson`.

### 4.3 SubmissionData grid

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs` | `ReportsSubmissionData()` (~dòng 292–388) | Lấy top submissions từ `MF_Submissions` bằng EF, sau đó đọc field values từ `MF_SubmissionValues` bằng **raw SQL parameterized**. |

### 4.4 Backfill / flat index

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs` | `ReportsBackfill()` (~dòng 390–435) | Đọc `DataJson` tất cả submission của một form, gọi `SubmissionIndexerService.IndexSubmission()` để ghi lại `MF_SubmissionValues`. |
| `MegaForm.Core/Services/SubmissionIndexerService.cs` | `IndexSubmission()`, `InsertRow()` | Xóa + insert row cho từng field vào `MF_SubmissionValues` bằng raw SQL/ADO. Phân loại Number/Date/Text theo field type. |

### 4.5 Form statistics (GetFormStats)

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Oqtane.Server/Data/EfRepositories.cs` | `GetFormStats()` (~dòng 71–84) | 6 query `Count()` riêng biệt trên cùng tập `MF_Submissions` (Total, Valid, Spam, Read, First, Last). |
| `MegaForm.Core/Services/SubmissionProcessor.cs` | ~dòng 140 | Dùng `GetFormStats` để kiểm tra `MaxSubmissions` tại submit time. |

### 4.6 Workflow canvas statistics

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.PurchaseOrderAndCanvas.cs` | `GetWorkflowCanvasView()` (~dòng 70–162) | Load toàn bộ `MF_WorkflowTasks` của form vào memory (`db.WorkflowTasks.Where(t => t.FormId == formId).ToList()`), sau đó đếm `pending/claimed/completed` per node bằng C# dictionary. |

**Thay đổi bảo mật:**

Trước commit `63e87d7`, action này **không có `[Authorize]`** → anonymous có thể gọi, leak form title, workflow definition, task counts, pending submissions.

Sau commit:

```csharp
[Authorize(Policy = "EditModule")]
[HttpGet("Workflow/CanvasView")]
public IActionResult GetWorkflowCanvasView([FromQuery] int formId)
```

→ Giờ yêu cầu `EditModule` policy (admin/builder view). Anonymous → 403.

Tuy nhiên, **logic đọd/count task vẫn chưa thay đổi**: vẫn `.ToList()` toàn bộ tasks vào memory rồi đếm bằng dictionary.

### 4.7 Blog analytics rollup

| File | Method / vị trí | Tóm tắt |
|---|---|---|
| `MegaForm.Core/Services/Blog/BlogAnalyticsRollupService.cs` | `RollupBlogAnalyticsAsync()` (~dòng 24–137) | Load tất cả reader-events (max 10k) và tất cả posts (max 10k), parse `DataJson`, tổng hợp view/like/share… in-memory, rồi cập nhật lại post `DataJson`. |

---

## 5. Các bảng SQL liên quan

| Bảng | Mục đích chính | Ghi chú |
|---|---|---|
| `MF_Forms` | Định nghĩa form, schema, settings, workflow. | `MegaFormDbContext.cs`, migration `01050100_InitializeModule`, `FormEntityBuilder.cs` |
| `MF_Submissions` | Dữ liệu submission gốc (`DataJson`, status, spam, submitted date). | `SubmissionEntityBuilder.cs`, `MegaFormDbContext.cs` |
| `MF_SubmissionValues` | Flat index per-field (`FieldKey`, `ValueText`, `ValueNumber`, `ValueDate`) phục vụ report/filter. | Migration `01060030_AddReporting`, `MegaFormDbContext.cs` |
| `MF_ReportDefinitions` | Định nghĩa report (JSON body). | Migration `01060030_AddReporting` |
| `MF_WorkflowTasks` | Task phê duyệt workflow, dùng cho canvas stats. | `MegaFormDbContext.cs` |
| `MF_ExternalBinding` | Cấu hình form bind sang bảng bên ngoài. | `MegaFormDbContext.cs`, `ExternalTableStores.cs` |
| `MF_ExternalRowMap` | Anchor row nối submission id ↔ customer row key. | `MegaFormDbContext.cs` |
| `MF_Files` | Metadata file upload. | `FileEntityBuilder.cs` |
| `MF_SavedDrafts` | Draft save-resume. | `SavedDraftEntityBuilder.cs` |

Các index quan trọng:

- `IX_MF_Submissions_FormId_SubmittedOnUtc`
- `IX_MF_Submissions_FormId_Status_SubmittedOnUtc` (migration `01060034_AddSubmissionStatusIndex`)
- `IX_MF_Submissions_Spam_Form_Date` (thêm trong model để tối ưu `FormsOverview`)
- `IX_MF_SubmissionValues_FormId_FieldKey`, `IX_MF_SubmissionValues_FormId_ValueDate`

---

## 6. Delta: Những gì Claude đã chỉnh sửa

### 6.1 Đã khắc phục

| # | Gap audit trước | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | Reports/FormsOverview day-series materialize toàn bộ row | ✅ Đã khắc phục từ trước; Oqtane đã dùng `GroupBy` SQL. | `MegaFormController.Reports.cs` dòng 119–123 |
| 2 | Workflow/CanvasView leak dữ liệu cho anonymous | ✅ Đã khắc phục | `MegaFormController.PurchaseOrderAndCanvas.cs` dòng 69 |
| 3 | External-bound form không thể xem dữ liệu SQL trong dashboard | ✅ Một phần khắc phục: source picker cho phép admin xem live SQL rows. | `AiToolsController.CustomTableRows`, `SubmissionsShell.ts` |
| 4 | SQL-source columns mismatch form field keys | ✅ Đã khắc phục | `SubmissionsShell.ts` dòng 256–271, bucket `f{formId}:sql` |
| 5 | Cột SQL hiển thị "—" và không nhớ source | ✅ Đã khắc phục | `SubmissionsShell.ts` dòng 301–350, `localStorage` source |

### 6.2 Vẫn còn

| # | Gap | Mô tả chi tiết | Vị trí |
|---|---|---|---|
| 1 | **Main dashboard N+1** | `DashboardView.razor.BuildDashboardJsonAsync()` vẫn `foreach` tối đa 8 form, mỗi form gọi `GetSubmissionsAsync(form.FormId, 0, 6)`. | `MegaForm.Oqtane.Client/DashboardView.razor` dòng 135–211 |
| 2 | **All-Forms fan-out** | "All Forms" view trong submission shell vẫn gọi `getSubmissions` cho từng form (tối đa 50 form × 500 row = 25k row client-side). | `SubmissionsShell.ts` dòng 1943–1960 |
| 3 | **queryKey binding 5000 row in-memory** | `ListSubmissionsWithBinding` vẫn load tối đa 5000 submission rồi lọc/sắp xếp in-memory theo preset. | `MegaFormController.cs` dòng 2181–2217 |
| 4 | **ComputeFormCompletion in-memory** | Vẫn đọc 50 `DataJson`, parse Newtonsoft, tính filled ratio. | `MegaFormController.Reports.cs` dòng 462–507 |
| 5 | **GetFormStats 6 count queries** | `EfFormRepository.GetFormStats()` vẫn chạy 6 query Count riêng biệt trên cùng tập dữ liệu. | `MegaForm.Oqtane.Server/Data/EfRepositories.cs` dòng 71–84 |
| 6 | **Workflow canvas load all tasks** | `GetWorkflowCanvasView` vẫn `.ToList()` toàn bộ `MF_WorkflowTasks` của form. | `MegaFormController.PurchaseOrderAndCanvas.cs` dòng 87 |
| 7 | **Blog analytics rollup** | `BlogAnalyticsRollupService.RollupBlogAnalyticsAsync()` vẫn materialize events/posts rồi parse JSON. | `MegaForm.Core/Services/Blog/BlogAnalyticsRollupService.cs` |
| 8 | **Thiếu caching** | Không thấy `IMemoryCache`/`IDistributedCache` cho dashboard stats, FormsOverview, form stats. | Toàn bộ controllers |
| 9 | **External form count không chính xác** | `ReportsFormsOverview` vẫn dùng `ApproxRows` từ profile JSON cho external-bound forms. | `MegaFormController.Reports.cs` dòng 139–154 |
| 10 | **SQL portability (CustomTableRows)** | Câu lệnh `OFFSET ... FETCH NEXT` chỉ chạy trên SQL Server; cần provider-aware nếu Oqtane chạy SQLite/MySQL/PostgreSQL. | `AiToolsController.cs` dòng 222 |

---

## 7. Gap Analysis: chuyển dashboard/reports/statistics sang SQL trực tiếp

### 7.1 Main Dashboard

| Hiện trạng | Gap nếu chuyển sang SQL trực tiếp |
|---|---|
| Client tự tổng hợp count qua N+1 API call. | Cần 1 endpoint/server-side aggregate duy nhất: `SELECT FormId, COUNT(*), COUNT(CASE WHEN SubmittedOnUtc >= @since THEN 1 END) ... GROUP BY FormId`. |
| Dashboard dùng `TotalCount` từ `_submissionQueries.List` (đã có SQL `COUNT`). | Có thể gộp thành 1 query trên `MF_Submissions` join `MF_Forms` theo `PortalId`. |
| Lọc quyền per-form (`CanUseSubmissionManagement`) và per-row (`CanViewSubmissionRow`) đang xử lý server-side C#. | Nếu aggregate bằng SQL, cần nhúng logic quyền vào query hoặc post-filter kết quả aggregate (chấp nhận một số form bị loại). |
| External-bound form không có row trong `MF_Submissions`. | Count external cần vẫn query bảng khách hàng hoặc dùng `MF_ExternalBinding.ProfileJson`. |

### 7.2 All-Forms Submission View

| Hiện trạng | Gap |
|---|---|
| "All Forms" view gọi `getSubmissions` cho từng form, merge/sort/paginate client-side. | Cần 1 endpoint aggregate trả về submissions của nhiều form đã phân trang và sắp xếp server-side. |
| Per-row RLS (`CanViewSubmissionRow`) được áp dụng từng form. | Cần áp dụng RLS trước khi merge hoặc post-filter trên kết quả nhỏ. |

### 7.3 Reports / FormsOverview

| Hiện trạng | Gap |
|---|---|
| Count all-time và day-series đã là SQL GROUP BY. | Gần như sẵn sàng; chỉ cần refactor thành raw SQL/View nếu muốn tối ưu hơn nữa. |
| `ComputeFormCompletion` đọc 50 `DataJson` mới nhất, parse Newtonsoft, đếm field filled. | **Không thể tái tạo byte-identical trong SQL** vì định nghĩa "empty" phức tạp (`[]`, `{}`, `"null"`, whitespace) và denominator là input fields của schema hiện tại. Cần: (a) chấp nhận metric gần đúng, (b) denormalize completion at submit-time, hoặc (c) dùng SQL JSON functions theo provider (không portable). |
| External rows lấy `ApproxRows` từ profile JSON. | Nếu cần số chính xác, phải đếm trực tiếp bảng khách hàng. |

### 7.4 Submission list & grid

| Hiện trạng | Gap |
|---|---|
| `ListSubmissions` dùng abstraction, phân trang, search trong `DataJson`. | Search `DataJson.Contains()` là non-sargable. Để tìm nhanh trên field, cần dùng `MF_SubmissionValues`. |
| `queryKey` binding load 5000 rows rồi lọc in-memory. | Cần chuyển filter/sort preset thành SQL query có điều kiện trên `MF_SubmissionValues` hoặc JSON path. |
| `Reports/SubmissionData` đã dùng raw SQL cho values. | Có thể mở rộng pattern này cho list/grid. |

### 7.5 Statistics khác

| Hiện trạng | Gap |
|---|---|
| `GetFormStats` chạy 6 query `Count`. | Có thể gộp thành 1 SQL aggregate duy nhất. |
| `GetWorkflowCanvasView` load toàn bộ tasks rồi đếm. | Có thể thay bằng `GROUP BY NodeId, Status` SQL + paged pending list. |
| `BlogAnalyticsRollupService` materialize tất cả events/posts. | Cần aggregate SQL trên `MF_Submissions` (hoặc tách event fields ra cột riêng) thay vì parse JSON in-memory. |

### 7.6 Kiến trúc chung

| Vấn đề | Mô tả |
|---|---|
| Mixed data access | Cùng một `MF_Submissions` vừa qua `ISubmissionRepository`, vừa qua `DbContext` trực tiếp, vừa qua raw ADO. Dễ gây duplicate logic, khó bảo trì. |
| Thiếu caching | Không thấy `IMemoryCache`/`IDistributedCache` cho dashboard stats, report metadata, form stats. |
| External table | Bộ decorator hiện tại tốt; nếu bỏ abstraction để đọc SQL thuần sẽ phá vỡ khả năng bind bảng ngoài. |
| Cross-database portability | Oqtane hỗ trợ SQL Server, SQLite, MySQL, PostgreSQL. Raw SQL cần được viết portable hoặc tách provider-specific dialect. |

---

## 8. Nhận xét thiết kế, rủi ro & đề xuất

### 8.1 Nhận xét

- **Bước đầu tốt ở Reports**: `FormsOverview` đã chuyển count xuống SQL GROUP BY và thêm index phù hợp (`IX_MF_Submissions_Spam_Form_Date`), giải quyết vấn đề timeout trên site lớn.
- **Dashboard còn lỗi thởi**: `DashboardView.razor` vẫn dùng N+1; đây là điểm yếu rõ ràng nhất.
- **JSON⇄SQL source picker là cải tiến đáng giá**: cho phép admin xem live SQL rows với cột đúng, nhớ source per-form, có auth + bounded-read. Tuy nhiên nó chỉ giải quyết single-form grid, không giải quyết dashboard aggregate.
- **Completion metric thiết kế hợp lý cho mục đích overview**: lấy mẫu 50 submission gần nhất để tránh đọc toàn bộ bảng; đánh đổi độ chính xác lấy hiệu năng.
- **External binding được xử lý cẩn thận**: sử dụng decorator thay vì thay thế toàn cục repo, giữ nguyên behavior cho form thường.
- **Workflow CanvasView đã an toàn hơn** về auth, nhưng vẫn chưa tối ưu SQL aggregate.
- **Thiếu abstraction cho aggregate query**: Core chưa có service/read-model chuyên cho dashboard/report aggregate; controller tự viết LINQ/SQL.

### 8.2 Rủi ro

1. **Hiệu năng main dashboard**: site có nhiều form / nhiều submission sẽ bị N+1, đặc biệt khi mở dashboard lần đầu.
2. **Memory pressure**: "All Forms" view fan-out 50 form × 500 row; `queryKey` binding load 5000 rows; blog rollup load 10k events + 10k posts; workflow canvas load toàn bộ tasks.
3. **Không nhất quán trong tính toán**: external form dùng `ApproxRows` từ profile JSON, có thể lệch so với thực tế.
4. **Bảo mật nếu bypass abstraction**: nếu viết raw SQL aggregate mà không giữ `CanViewSubmissionRow`, có thể rò rỉ dữ liệu nhạy cảm.
5. **Portability**: `CustomTableRows` dùng `OFFSET ... FETCH NEXT` chỉ chạy trên SQL Server; Oqtane hỗ trợ SQLite/MySQL/PostgreSQL.

### 8.3 Đề xuất xử lý tiếp theo

| Ưu tiên | Hành động | Lý do |
|---|---|---|
| **Cao** | Tạo endpoint aggregate cho main dashboard (`DashboardView.razor`) thay thế N+1 bằng một query `GROUP BY FormId` kèm top-N recent submissions. | Đây là điểm yếu hiệu năng rõ ràng nhất còn sót lại. |
| **Cao** | Tạo endpoint aggregate cho "All Forms" view trong submission shell: một query trả về submissions của nhiều form đã merge/sort/paginate. | Tránh fan-out 50 API call và 25k row client-side. |
| **Trung bình** | Chuyển `queryKey` binding từ in-memory 5000 row sang SQL query có điều kiện trực tiếp trên `MF_SubmissionValues`. | Giảm memory pressure trên site lớn. |
| **Trung bình** | Gộp `GetFormStats` thành một SQL aggregate duy nhất; thêm cache ngắn hạn. | 6 query Count trên cùng tập dữ liệu là lãng phí. |
| **Trung bình** | Workflow canvas: dùng `GROUP BY NodeId, Status` SQL cho counts; pending submissions dùng paged SQL. | Giảm memory pressure khi form có nhiều task. |
| **Trung bình** | Làm `CustomTableRows` provider-aware (SQLite/MySQL/PostgreSQL) hoặc fallback sang EF LINQ. | Oqtane hỗ trợ đa provider. |
| **Thấp** | `ComputeFormCompletion`: giữ sample 50 hoặc denormalize at submit-time; không ép tính chính xác 100% bằng SQL JSON cross-provider. | Metric này là ước lượng, không cần chính xác tuyệt đối. |
| **Kiến trúc** | Bổ sung `IMemoryCache` cho `FormsOverview`, dashboard stats, form stats với TTL 30–60s. | Giảm tải DB cho các request lặp lại. |
| **Kiến trúc** | Giữ `ISubmissionRepository` abstraction cho write/single-record read; chỉ dùng optimized SQL/read-model cho aggregate dashboard/reports. | Tránh phá vỡ external table binding. |

---

## 9. Kết luận cuối cùng

Các chỉnh sửa gần đây của Claude đã **khắc phục đáng kể** một số điểm yếu:

1. **Bảo mật Workflow/CanvasView** — chặn leak dữ liệu cho anonymous.
2. **JSON⇄SQL source picker** — cho phép admin xem live SQL rows của form-bound table với cột đúng, nhớ source per-form.
3. **Reports/FormsOverview** — Oqtane đã aggregate hoàn toàn trong SQL.

Tuy nhiên, **các vấn đề hiệu năng lõi vẫn còn**:

- Main dashboard N+1.
- All-Forms fan-out.
- `queryKey` binding in-memory 5000 row.
- `ComputeFormCompletion` in-memory.
- `GetFormStats` 6 query Count.
- Workflow canvas load all tasks (dù đã auth).
- Thiếu caching.

Đề xuất **ưu tiên cao nhất** là xây dựng endpoint aggregate cho main dashboard và All-Forms view, sau đó mới đến refactor `queryKey` binding và workflow canvas SQL aggregate. Cần giữ nguyên abstraction `ISubmissionRepository` cho write path và single-record read để không phá vỡ external table binding.
