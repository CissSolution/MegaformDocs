# ĐẶC TẢ KỸ THUẬT — **ADAPTIVE TABLE BINDING ENGINE (ATBE) v1.0**
### MegaForm bind form/dashboard vào bảng SQL **có sẵn** của khách (500k+ rows) — không import, bảng khách là nơi lưu trữ thật

> Tài liệu này tổng hợp 9 case-matrix + 9 vòng phản biện, **đã tự kiểm chứng lại bằng code thật**. Mọi khẳng định về codebase đều kèm `file:line`. Chỗ nào không tồn tại → ghi rõ **KHÔNG TÌM THẤY**.

---

## 0.0 PHẠM VI CHỐT (owner, 2026-07-11) — đọc trước §0

**Vai trò của AI trong tính năng này được thu hẹp dứt khoát:**

> **AI chỉ HỌC SCHEMA (đọc) rồi THIẾT KẾ FORM. AI KHÔNG GHI GÌ VÀO DATABASE — không DDL, không INSERT/UPDATE, không chạy SQL.**

Hệ quả với các blocker bảo mật mà workflow tìm ra:

| Blocker | Xử lý theo phạm vi chốt |
|---|---|
| **B8 — AI chạy được DDL trên connection khách** (`AiToolsController.cs:790,817`, DNN-only) | **RA KHỎI ĐƯỜNG GĂNG.** Tính năng mới **không cấp cho AI bất kỳ đường ghi nào**: AI chỉ nhận `Envelope` JSON (đã là dữ liệu, không phải connection) và trả `Blueprint` JSON. Lỗ cũ ở endpoint DNN `ExecuteDdl` là chuyện của luồng cũ — **owner chấp nhận rủi ro** (admin/host-gated). Không sửa trong lộ trình này. |
| **`DatabaseNodeExecutor` `UPDATE` không `WHERE`** (`DatabaseNodeExecutor.cs:264-266`) | Vẫn **KHÔNG tái dùng** executor này (viết `ExternalTableWriter` mới) ⇒ bug cũ nằm ngoài phạm vi, không chặn tính năng. |
| **B7 — client POST `_createdBy`/`_portalId` đè giá trị server** (`LifecycleRunner.cs:246-251`) | ⚠️ **KHÔNG phải lỗi thiết-kế-form và không phải rủi ro của admin** — đây là **đường submit runtime** của người dùng cuối. Khi P3 ghi vào bảng khách có cột server-fill (TenantId/CreatedBy), lỗ này cho **người submit ẩn danh giả mạo cột đó trong bảng production của khách**. ⇒ Không tách thành pha riêng, nhưng **fix bắt buộc BÊN TRONG P3** khi làm System Value Binding (đảo precedence + strip key `_*` từ client, ~1–2 giờ). |

**Ai ghi vào DB (làm rõ):** engine C# tất định (`ExternalTableWriter`) ghi khi **người dùng cuối submit form**, với SQL do server sinh từ `columnMap` đã được validator duyệt. AI không nằm trên đường ghi ở bất kỳ điểm nào.

**Lộ trình sau khi bỏ P-SEC:** **P0 (probe) → P1 (dashboard readonly 500k) → P2 (AI on-rails) → P3 (ghi, kèm fix B7) → P4 (sửa/xoá) → P5 (quan hệ) → P6 (scale/file)**.

---

## 0. TÓM TẮT ĐIỀU HÀNH

**Cỗ máy 6 khâu (không khâu nào giao cho AI quyết định đúng-sai):**

```
[1] PROBE (C# tất định, đa provider, 3 bậc quyền)
        ↓  sinh
[2] CAPABILITY PROFILE (JSON đóng băng + profileHash)
        ↓  máy áp
[3] DECISION MATRIX → mode = min(readwrite, insertonly, readonly, unsupported)
        ↓  máy đóng gói envelope (đã lọc sẵn writable/required/allowedWidgets)
[4] AI ON-RAILS (chỉ đặt nhãn / chọn widget trong tập cho phép / gom nhóm)
        ↓  máy chấm
[5] VALIDATOR (server = uy quyền) + RETRY LOOP (N=3) → fallback bản máy
        ↓  máy gác cổng
[6] DRY-RUN GHI (transaction + ROLLBACK) → mới cho Publish
```

**3 quyết định dứt khoát của tài liệu này:**

| # | Quyết định | Lý do 1 câu |
|---|---|---|
| **Q1** | **KHÔNG đổi `SubmissionId` INT.** Dùng **ANCHOR ROW trong `MF_Submissions` + bảng `MF_ExternalRowMap`**. | Route detail/status/delete **không mang `formId`** (`MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2388-2392`) → mọi id phải nằm trong **một không gian id duy nhất do MegaForm cấp**, nếu không sẽ mở nhầm/ghi đè nhầm bản ghi của form khác. Anchor row cấp id từ chính `MF_Submissions` IDENTITY ⇒ **va chạm id = 0**, và mọi FK sẵn có (files/workflow/links) tiếp tục chạy. |
| **Q2** | **KHÔNG tái dùng `FormDatabaseInsertService` / `DatabaseNodeExecutor` làm writer bảng ngoài.** Viết `ExternalTableWriter` MỚI. | `FormDatabaseInsertService` chạy SQL do admin soạn, **fail-soft nuốt lỗi** (`MegaForm.Core/Services/FormDatabaseInsertService.cs:106-110`), guard cấm mọi verb ngoài INSERT (`:208-221`), và `DatabaseNodeExecutor.BuildUpdateCommand` **phát `UPDATE` KHÔNG `WHERE`** khi `WhereMappings` rỗng (`MegaForm.Core/Workflow/DatabaseNodeExecutor.cs:264-266`) — tái dùng = phá 500k dòng của khách. |
| **Q3** | **AI không bao giờ chạm: SQL, khoá, degradation, required, cột computed/identity.** | Đây là quyết định đúng-sai/bảo mật trên **DB production của khách**. AI chỉ làm việc ngữ nghĩa (nhãn, nhóm, thứ tự, widget trong whitelist) — sai thì xấu, sửa được; máy sai thì tái lập được, LLM sai thì ngẫu nhiên. |

---

## 1. SỰ THẬT NỀN (ground truth — đã tự verify lại trong phiên này)

| # | Sự thật | Bằng chứng |
|---|---|---|
| F1 | `ISubmissionRepository` khoá bằng **INT**, `List()` **KHÔNG có tham số sort**, `Get/UpdateStatus/UpdateData/Delete` **KHÔNG có formId** | `MegaForm.Core/Interfaces/ICoreInterfaces.cs:29-43` (Insert→int `:31`, Get(int) `:32`, List(...) `:34-37`, UpdateStatus `:38`, UpdateData `:39`, Delete `:40`, BulkDelete(int, int[]) `:41`) |
| F2 | `SubmissionInfo.SubmissionId` = `int`; `SubmittedOnUtc` = `DateTime` **non-nullable** | `MegaForm.Core/Models/EntityModels.cs:65`, `:74` |
| F3 | Route detail **KHÔNG mang formId** và là `[AllowAnonymous]`; formId **suy ra TỪ chính dòng vừa đọc** (chicken-and-egg) | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2388-2392` |
| F4 | Facade dashboard là **class cụ thể**, clamp `PageSize > 250 → 250` | `MegaForm.Core/Services/SubmissionQueryService.cs:15`, `:35` |
| F5 | `GetDetail` **luôn** nạp file theo `submissionId` | `MegaForm.Core/Services/SubmissionQueryService.cs:120` (`_files.GetBySubmission(submissionId)`) |
| F6 | DNN **`new` thẳng repo trong controller — 2 chỗ** ⇒ swap DI không tới | `MegaForm.DNN/WebApi/MegaFormApiController.cs:1912` và `:2194` |
| F7 | DI đăng ký **một** `ISubmissionRepository` toàn app (⇒ decorator là seam đúng) | `MegaForm.Oqtane.Server/Services/Startup.cs:75`; `MegaForm.Web/Program.cs:34`; `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs:185` |
| F8 | Ghi bảng ngoài hiện: `ExecuteNonQuery` (không lấy được khoá) + **fail-soft nuốt lỗi** + trả `ex.Message` | `MegaForm.Core/Services/FormDatabaseInsertService.cs:101`, `:106-110` (`:109` `result.Error = ex.Message` — vi phạm CLAUDE.md §10) |
| F9 | Call-site fail-soft: Oqtane chỉ **log Warning** và truyền `request.Data` **RAW**; DNN **vứt luôn kết quả** | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1580-1586`; `MegaForm.DNN/WebApi/MegaFormApiController.cs:1113` |
| F10 | Guard chặn mọi verb ngoài INSERT + cấm `;` (nên **không** thể `INSERT…; SELECT SCOPE_IDENTITY()`) | `MegaForm.Core/Services/FormDatabaseInsertService.cs:208-221` (`:216` cấm `;`, `:219` bắt buộc `^INSERT`) |
| F11 | Dry-run rollback **đã có** (chỉ cho INSERT) — pattern tái dùng được | `MegaForm.Core/Services/FormDatabaseInsertService.cs:119-186` (BeginTransaction `:149`, `finally { tx.Rollback(); }` `:175`) |
| F12 | **`UPDATE` KHÔNG `WHERE`** khi `WhereMappings` rỗng | `MegaForm.Core/Workflow/DatabaseNodeExecutor.cs:264-266` |
| F13 | `_safeIdent = ^[A-Za-z_][A-Za-z0-9_]{0,127}$` ⇒ **cấm dấu chấm** (không schema-qualify được); bracket `[...]` là **MSSQL-only** | `MegaForm.Core/Workflow/DatabaseNodeExecutor.cs:30-31`, `:236`, `:265` |
| F14 | Schema reader **mù**: chỉ đọc name/dataType/nullable/maxLength; `IsPrimary` chỉ set ở nhánh **SQLite**; **KHÔNG lọc `TABLE_SCHEMA`** | `MegaForm.Core/Services/Subform/SqlSchemaReader.cs:86` (SELECT 4 cột, `WHERE TABLE_NAME = @t`), `:77` (IsPrimary SQLite), `:93` (`catch {}`) |
| F15 | `SubformDbColumn.IsIdentity` **khai báo nhưng KHÔNG có dòng nào gán** | `MegaForm.Core/Services/Subform/SubformModels.cs:74` |
| F16 | `ClassifyUiType` gộp sai: `timestamp/rowversion` → **`date`**; `uniqueidentifier/xml/varbinary/geography` → **`text`** | `MegaForm.Core/Services/Subform/SqlSchemaReader.cs:112-120` (`:116` `t.Contains("time")`, `:119` default `"text"`) |
| F17 | `nvarchar(MAX)` ⇒ `CHARACTER_MAXIMUM_LENGTH = -1` **được giữ nguyên** thành `MaxLength = -1` | `MegaForm.Core/Services/Subform/SqlSchemaReader.cs:86` (`COALESCE(...,0)` chỉ đổi NULL) + `:99` |
| F18 | `ListTables` lọc `TABLE_TYPE='BASE TABLE'` ⇒ **VIEW không hiện ra** | `MegaForm.Core/Services/Subform/SqlSchemaReader.cs:49` (và SQLite `:37`) |
| F19 | **KHÔNG TÌM THẤY** dòng nào đọc `sys.foreign_keys` / `foreign_key_columns` / `REFERENTIAL_CONSTRAINTS` trong toàn repo (grep `**/*.cs` = 0 hit) | ⇒ **"AI phân tích FK" hiện là ảo giác** |
| F20 | **KHÔNG TÌM THẤY**: `GetSchemaTable`, `dm_db_partition_stats`, `HAS_PERMS_BY_NAME`, `fn_my_permissions`, `sys.triggers`, `security_policies`, `encryption_type`, `is_computed` (grep `**/*.cs` = 0 hit) | ⇒ toàn bộ probe là code **mới 100%** |
| F21 | **PRIOR ART** (DNN-only): đã đọc `sys.columns.is_identity` + `sys.indexes.is_primary_key` | `MegaForm.DNN/WebApi/AiToolsController.cs:1624-1625`, `:1645`, `:2609` — ⚠️ hardcode `"dbo." + t` (`:1630`) |
| F22 | AI **tự đoán FK theo tên cột** trong prompt | `MegaForm.UI/src/dashboard/ai-form-creator.ts:1403-1411` |
| F23 | DataGrid **KHÔNG ghi bảng con** — chỉ `JSON.stringify` vào 1 hidden input; **KHÔNG có** `POST Subform/Save` | `MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid.ts:943-945` |
| F24 | Pager là **numbered-only**, suy 100% từ `totalCount`; `totalCount \|\| 0` ⇒ `totalPages=1` ⇒ **Next disabled vĩnh viễn** | `MegaForm.UI/src/submissions/SubmissionsShell.ts:1338`, `:1362`, `:1803` |
| F25 | Sort **client-side trên trang đã tải** (≤250 dòng) — trên 500k là **SAI dữ liệu**, không phải chậm | `MegaForm.UI/src/submissions/SubmissionsShell.ts:991` |
| F26 | All-Forms **fan-out** 50 form × `pageSize:500`, `totalCount = merged.length` | `MegaForm.UI/src/submissions/SubmissionsShell.ts:1817`, `:1827` |
| F27 | UI khoá key bằng số: `Number(tr.dataset.submissionId)` | `MegaForm.UI/src/submissions/SubmissionsShell.ts:1157`, `:1307` |
| F28 | `SchemaJson` được nhận **nguyên văn từ client** khi Save ⇒ **cấu hình binding KHÔNG được nằm trong schema** | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:407` |
| F29 | `Field/Options` **ẩn danh** (class chỉ có `[Route]` + `[IgnoreAntiforgeryToken]`, action không có `[Authorize]`) | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:46-48`, `:1288-1289` |
| F30 | `LifecycleRunner.BuildParameterBag` nạp `formData` **TRƯỚC**, token hệ thống chỉ set **khi chưa có key** ⇒ **client POST `_createdBy` là đè được server** | `MegaForm.Core/Services/LifecycleRunner.cs:246-251` |
| F31 | DNN `ExecuteDdl` lấy **`connectionKey` TỪ BODY** rồi mở chính connection đó và chạy DDL; `SqlDdlGuard` **cho phép `CREATE INDEX` / `ALTER TABLE ADD` / `INSERT`** | `MegaForm.DNN/WebApi/AiToolsController.cs:790`, `:817`; `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs:159`, `:165`, `:185`, `:191` |
| F32 | `normalizeExplicitUrl` **không lọc scheme** (`javascript:` lọt vào `href`); và **`filePath` thắng `fileUrl`** | `MegaForm.UI/src/submissions/file-links.ts:81-95`, `:184` |
| F33 | Tool-result cho AI bị **cắt mảng còn 50 phần tử** + chuỗi 600 + tổng 3000 ký tự — **im lặng** | `MegaForm.UI/src/ai-form-assistant/tools.ts:462`, `:475-479` (`:477` `v.slice(0, 50)`) |
| F34 | RLS `own` so `submission.UserId == user.UserId` ⇒ dòng ngoài có `UserId = null` → **ẩn sạch, không báo lỗi** | `MegaForm.Core/Services/PermissionService.cs:54-55` |
| F35 | Submission-links JOIN cứng vào `MF_Submissions` ⇒ form không có anchor row = **trả rỗng âm thầm** | `MegaForm.DNN/Data/Phase2Repository.cs:764`, `:782` |
| F36 | EF: `MF_Submissions` `HasKey(SubmissionId)`; các bảng con khoá theo `SubmissionId` | `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs:80-81`, `:87`, `:92-93`, `:98-99`, `:151-152` |
| F37 | Đường ghi thật của submit | `MegaForm.Core/Services/SubmissionProcessor.cs:281` (`_subRepo.Insert`), `:285`, `:298`, `:315` |

---

## 2. KIẾN TRÚC

### 2.1 Thành phần MỚI (không vá code cũ)

| Thành phần | Vị trí đề xuất | Vai trò |
|---|---|---|
| `SqlRelationalSchemaReader` | `MegaForm.Core/Services/ExternalTable/` | Probe metadata schema-qualified, đa provider, 3 bậc. **KHÔNG sửa `SqlSchemaReader`** (đang được Subform + AiTools dùng — đổi signature vỡ 2 nơi). |
| `TableCapabilityProbe` | `…/ExternalTable/` | Chạy P0–P16, sinh **Capability Profile**. |
| `ExternalTableBindingStore` | `…/ExternalTable/` + bảng `MF_ExternalBinding` | **Server-owned**. Lưu {formId → schema, table, connectionKey, columnMap, profile, profileHash, mode}. **KHÔNG lưu trong `SchemaJson`** (F28). |
| `ExternalRowKeyMapper` + `MF_ExternalRowMap` | `…/ExternalTable/` | Ánh xạ `SubmissionId (anchor)` ↔ `RowKey` của khách. |
| `ExternalTableQueryService` + `IExternalRecordSource` | `…/ExternalTable/` | Đọc list/detail **server-side sort/filter/paging** (KHÔNG ép qua `ISubmissionRepository.List` — F1). |
| `ExternalTableWriter` | `…/ExternalTable/` | INSERT/UPDATE/DELETE **do server sinh** từ columnMap (allowlist cột), có transaction, **fail-LOUD**, `WHERE` bắt buộc. |
| `ExternalTableDryRunner` | `…/ExternalTable/` | Copy **pattern** transaction-rollback (F11) — **không** gọi `TestExecute` (F10 chặn non-INSERT). |
| `SubmissionRepositoryRouter` (decorator) | `…/ExternalTable/` | Bọc `ISubmissionRepository`; `Get/UpdateStatus/UpdateData/Delete` → nếu form là external thì hydrate/ghi qua ExternalTable. |
| `ExternalTableMappingValidator` | `…/ExternalTable/` (server) + mirror `.ts` (client) | Chấm output AI. **Server là uy quyền.** |
| `IndexAdvisor` | `…/ExternalTable/` | **CHỈ sinh chuỗi DDL gợi ý** cho DBA. Không có `ExecuteNonQuery`. |

### 2.2 Anchor Row — cơ chế lõi

```
Bảng khách (nguồn sự thật)            MegaForm DB
┌──────────────────────┐            ┌────────────────────────────────┐
│ sales.Orders         │            │ MF_Submissions (ANCHOR)        │
│  OrderId GUID PK  ───┼──hash──┐   │  SubmissionId INT IDENTITY  ◄──┼── id DUY NHẤT toàn hệ
│  CustomerId          │        │   │  FormId = <form external>      │
│  TotalAmount         │        │   │  Status / ReadOnUtc / …        │  ← metadata của MegaForm
│  … 500.000 dòng …    │        │   │  DataJson = '{}' (KHÔNG cache) │
└──────────────────────┘        │   └────────────────────────────────┘
                                │   ┌────────────────────────────────┐
                                └──►│ MF_ExternalRowMap              │
                                    │  SubmissionId INT PK (=anchor) │
                                    │  FormId INT                    │
                                    │  RowKeyHash BINARY(32)         │
                                    │  RowKeyJson NVARCHAR(900)      │
                                    │  UNIQUE(FormId, RowKeyHash)    │
                                    └────────────────────────────────┘
```

**Luật bất di bất dịch:**
1. Anchor row là **ĐỊA CHỈ + METADATA**, **KHÔNG BAO GIỜ** là nguồn sự thật cho cột nghiệp vụ. `DataJson` của anchor = `{}`; list/detail luôn đọc **live** từ bảng khách.
2. Anchor được tạo **lazy, get-or-create, theo lô ≤ pageSize** khi một dòng lần đầu được **địa chỉ hoá** (render list / mở detail / set status). Idempotent nhờ `UNIQUE(FormId, RowKeyHash)`. Backfill 500k là **tuỳ chọn** (chỉ khi khách cần id ổn định cho tích hợp ngoài).
3. `RowKeyJson` = JSON array canonical theo `key_ordinal` (composite an toàn); `RowKeyHash = SHA256(FormId ⟂ RowKeyJson)`; chuẩn hoá GUID (upper, bỏ ngoặc) và chuỗi theo **collation** (nếu `_CI` → UPPER-invariant **chỉ để hash**, giá trị gốc vẫn dùng trong `WHERE`).
4. Ghi trên đường GET (lazy anchor) phải bọc `try/catch`: lỗi ⇒ dòng render **read-only**, không vỡ trang list.

---

## 3. CAPABILITY PROBE

### 3.1 Nguyên tắc

| # | Luật |
|---|---|
| PR-1 | **FAIL-SAFE**: không dò được ⇒ giả định **xấu nhất** (không có index / không có khoá / bảng lớn / không có quyền), **không bao giờ** giả định tốt. |
| PR-2 | **Ưu tiên metadata** (`sys.*` → `INFORMATION_SCHEMA` → `GetSchemaTable(KeyInfo)`). Probe **hành vi** (INSERT rollback) là **cuối cùng**. |
| PR-3 | ⚠️ **Probe hành vi KHÔNG vô hại**: trigger vẫn **fire** (mail/linked-server/Service Broker **không rollback**), `IDENTITY` seed **bị đốt**, `NEXT VALUE FOR` **tiêu một số**, và tx giữ **lock** trên bảng 500k đang phục vụ ERP của khách. ⇒ **Chỉ chạy khi admin bấm xác nhận**, kèm `SET LOCK_TIMEOUT 5000`, giới hạn số vòng. |
| PR-4 | **Schema-qualified tuyệt đối**: mọi probe khoá theo cặp `(schema, table)`. `SqlSchemaReader.cs:86` không lọc `TABLE_SCHEMA` ⇒ **hai bảng trùng tên khác schema sẽ TRỘN CỘT, im lặng** (F14). |
| PR-5 | **KHÔNG trả `ex.Message` cho client** (CLAUDE.md §10). Map SQL error → mã ổn định (§9.1). Vết vi phạm hiện hữu: `FormDatabaseInsertService.cs:109`, `:183`. |
| PR-6 | `connectionKey` là **bí mật server**; không bao giờ vào envelope AI, không bao giờ nhận từ client (đối lập với `AiToolsController.cs:790`). |

### 3.2 Ba bậc năng lực metadata

| Bậc | Nguồn | Có | Mất | Hệ quả mode |
|---|---|---|---|---|
| **L2** | `sys.columns/indexes/foreign_keys/check_constraints/triggers/default_constraints` | identity, computed, rowversion, PK+ordinal, unique index, FK+ON DELETE, CHECK, trigger, collation, encryption | — | `readwrite` khả thi |
| **L1** | `INFORMATION_SCHEMA` + `COLUMNPROPERTY`/`OBJECTPROPERTY` | PK, FK, CHECK, DEFAULT, identity/computed (qua COLUMNPROPERTY) | unique **index** thuần, ON DELETE, encryption | `readwrite` + cảnh báo |
| **L0** | `SELECT TOP 0 *` + `DbDataReader.GetSchemaTable(CommandBehavior.KeyInfo \| SchemaOnly)` | `IsKey`, `IsAutoIncrement`, `IsReadOnly`(≈computed/rowversion), `IsUnique`, `AllowDBNull`, `NumericPrecision/Scale`, `ColumnSize` | **`COLUMN_DEFAULT`**, CHECK, FK, trigger | ⇒ `required = true` cho **mọi** NOT NULL; **cấm UPDATE** ⇒ **`insertonly`** |
| **L-1** | không gì | — | — | `readonly` (hoặc `unsupported`) |

> ⚠️ **L0 là SQL-Server-first**: `Microsoft.Data.Sqlite` / `Npgsql` / `MySqlConnector` điền `IsKey/IsAutoIncrement` **không đồng nhất**. Provider ≠ SqlServer mà L2/L1 không đủ ⇒ **readonly**, không đoán (`SqlSchemaReader.Detect` — `SqlSchemaReader.cs:19-27` — cho biết 4 provider đều trong scope, và nhánh `default:` `:48` đang coi `Unknown` = SQL Server ⇒ **phải sửa thành lỗi tường minh**).

> ⚠️ **Bẫy tinh vi**: `INFORMATION_SCHEMA.COLUMNS` **chỉ trả cột mà principal có quyền**. Bảng 20 cột có thể chỉ "thấy" 12 ⇒ 8 cột NOT NULL **vô hình** ⇒ INSERT luôn `Msg 515` mà không ai hiểu. **Bắt buộc đối chiếu số cột giữa `INFORMATION_SCHEMA` và `GetSchemaTable`; lệch ⇒ DỪNG, báo động.**

### 3.3 Danh mục probe

> `@qual` = `[schema].[table]`; `@s`/`@t` = schema/table rời.

#### **P0 — Đối tượng: BASE TABLE / VIEW / SYNONYM + trùng tên schema**
```sql
SELECT TABLE_SCHEMA, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @t;
-- >1 dòng ⇒ schemaCollision = true ⇒ BẮT BUỘC admin chọn schema, KHÔNG đoán, KHÔNG probe tiếp
```
**Fallback**: `SELECT s.name, o.name, o.type FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id WHERE o.name=@t AND o.type IN ('U','V','SN')`. Nếu cả hai bị chặn ⇒ chỉ chấp nhận admin gõ đủ `[schema].[table]` + nút **Verify** (`SELECT TOP 0 *`).
> ⚠️ `ListTables` hiện **lọc bỏ VIEW** (`SqlSchemaReader.cs:49`) ⇒ phải thêm tham số `includeViews = false` **mặc định false** để không đổi hành vi Subform/AiTools.

#### **P1 — Môi trường: engine / version / collation / updateability / db_owner**
```sql
SELECT CAST(SERVERPROPERTY('EngineEdition') AS int)                     AS engine,      -- 5=Azure SQL DB, 8=MI
       CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64))           AS ver,
       CAST(SERVERPROPERTY('Collation') AS nvarchar(128))               AS srvCollation,
       CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS nvarchar(128)) AS dbCollation,
       CAST(DATABASEPROPERTYEX(DB_NAME(),'Updateability') AS nvarchar(32)) AS updateability,
       IS_ROLEMEMBER('db_owner')                                        AS isDbOwner,
       SCHEMA_NAME()                                                    AS defaultSchema,
       CASE WHEN 'a' = 'A' THEN 1 ELSE 0 END                            AS caseInsensitive;
```
**Fallback**: `DbConnection.ServerVersion` (tiền lệ: `MegaForm.Core/Services/DatabaseWorkflowMetadataService.cs:66-68`); tiền lệ `SERVERPROPERTY`: `MegaForm.Oqtane.Server/Migrations/01060037_SeedNewPremiumTemplateGuides.cs:29`. Không dò được ⇒ `engine = unknown` ⇒ **tắt cross-DB**, dùng chiến lược đếm an toàn nhất.
> `Updateability = READ_ONLY` (replica/AG secondary/`ApplicationIntent=ReadOnly`) ⇒ **quyền có nhưng ghi vẫn `Msg 3906`** ⇒ ép `readonly`, **không chạy dry-run ghi**.

#### **P2 — Quyền thật trên object**
```sql
SELECT HAS_PERMS_BY_NAME(@qual,'OBJECT','SELECT') AS can_select,
       HAS_PERMS_BY_NAME(@qual,'OBJECT','INSERT') AS can_insert,
       HAS_PERMS_BY_NAME(@qual,'OBJECT','UPDATE') AS can_update,
       HAS_PERMS_BY_NAME(@qual,'OBJECT','DELETE') AS can_delete;
```
**Fallback a**: `SELECT permission_name FROM sys.fn_my_permissions(@qual,'OBJECT')`.
**Fallback b (hành vi — CẦN ADMIN XÁC NHẬN)**: `BEGIN TRAN` → `SELECT TOP 1 1` / `INSERT` dummy / `UPDATE … WHERE 1=0` / `DELETE … WHERE 1=0` → **`ROLLBACK` trong `finally`** (pattern `FormDatabaseInsertService.cs:149`, `:175`).
> ⭐ **Phân loại mã lỗi là bắt buộc**: `229` = permission denied ⇒ tắt bit. **`515/547/2627/8152` = CÓ quyền** (chỉ vi phạm ràng buộc) ⇒ **KHÔNG hạ cấp nhầm**.
> ⚠️ **KHÔNG BAO GIỜ** thử `ALTER TABLE` để dò quyền DDL. `can_alter` mặc định = **false**.

#### **P3 — Cột đầy đủ (identity / computed / rowversion / default / precision / collation / encryption)**
```sql
SELECT c.name, ty.name AS sql_type, c.max_length, c.precision, c.scale,
       c.is_nullable, c.is_identity, c.is_computed, c.collation_name, c.encryption_type,
       dc.definition AS default_expr,
       CAST(CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS bit) AS is_pk, pk.key_ordinal
FROM sys.columns c
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc
       ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
LEFT JOIN (SELECT ic.object_id, ic.column_id, ic.key_ordinal
           FROM sys.index_columns ic JOIN sys.indexes i
             ON i.object_id = ic.object_id AND i.index_id = ic.index_id
           WHERE i.is_primary_key = 1) pk
       ON pk.object_id = c.object_id AND pk.column_id = c.column_id
WHERE c.object_id = OBJECT_ID(@qual)
ORDER BY c.column_id;
```
**Fallback L1**:
```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
       NUMERIC_SCALE, DATETIME_PRECISION, COLUMN_DEFAULT, COLLATION_NAME,
       COLUMNPROPERTY(OBJECT_ID(@qual), COLUMN_NAME, 'IsIdentity') AS is_identity,
       COLUMNPROPERTY(OBJECT_ID(@qual), COLUMN_NAME, 'IsComputed') AS is_computed
FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@s AND TABLE_NAME=@t ORDER BY ORDINAL_POSITION;
```
**Fallback L0**: `GetSchemaTable(KeyInfo)` → `IsAutoIncrement`, `IsReadOnly`, `AllowDBNull`, `NumericPrecision/Scale`, `ColumnSize`, `DataType`. **Mất `COLUMN_DEFAULT`** ⇒ `required = true` cho mọi NOT NULL.
**Fallback SQLite**: `PRAGMA table_info` — lưu ý cột `dflt_value` (index 4) **hiện chưa được đọc** (`SqlSchemaReader.cs:69-80`).
> ⚠️ **Đơn vị `max_length`**: `sys.columns.max_length` là **BYTE** (nvarchar phải `/2` — tiền lệ đúng: `MegaForm.DNN/WebApi/AiToolsController.cs:1648`); `INFORMATION_SCHEMA.CHARACTER_MAXIMUM_LENGTH` là **KÝ TỰ**. **Đừng trộn 2 nguồn.**
> ⚠️ `max_length = -1` ⇒ **MAX/LOB** ⇒ `maxLength = null` (**KHÔNG 0, KHÔNG -1** — `MaxLength = 0` sẽ chặn mọi chuỗi vì `FormValidationService` dùng `HasValue`; `-1` sẽ chặn mọi chuỗi vì client dùng truthiness — `MegaForm.UI/src/renderer/validation.ts:95`).

#### **P4 — Khoá chính + thứ tự trong khoá (composite)**
```sql
SELECT kcu.COLUMN_NAME, kcu.ORDINAL_POSITION
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
 AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA=@s AND tc.TABLE_NAME=@t
ORDER BY kcu.ORDINAL_POSITION;
```
**Fallback**: `sys.indexes.is_primary_key = 1` (prior art: `AiToolsController.cs:1625`) → `GetSchemaTable().IsKey` → **P5** (unique index) → **không có** ⇒ `key.trusted = false`.

#### **P5 — UNIQUE index / constraint (khoá logic khi không PK)**
```sql
SELECT i.name, i.is_unique_constraint, i.has_filter, i.is_disabled,
       c.name AS col, ic.key_ordinal, c.is_nullable
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE i.object_id = OBJECT_ID(@qual)
  AND i.is_unique = 1 AND i.is_primary_key = 0
  AND i.has_filter = 0 AND i.is_disabled = 0 AND ic.is_included_column = 0
ORDER BY i.index_id, ic.key_ordinal;
```
**Fallback**: `INFORMATION_SCHEMA.TABLE_CONSTRAINTS` `CONSTRAINT_TYPE='UNIQUE'` (⚠️ **chỉ bắt unique CONSTRAINT, BỎ SÓT unique INDEX thuần** — rất phổ biến ở DB cũ) → `GetSchemaTable().IsUnique`.
**Chọn khoá logic tất định** (TUYỆT ĐỐI không để AI chọn): (1) ít cột nhất → (2) tổng byte nhỏ nhất → (3) tên index theo alphabet.

#### **P6 — Kiểm chứng khoá thực tế (dup / null)**
```sql
SELECT COUNT_BIG(*) AS total,
       COUNT_BIG(DISTINCT CONCAT([k1], CHAR(31), [k2])) AS distinctKeys,
       SUM(CASE WHEN [k1] IS NULL THEN 1 ELSE 0 END)    AS nullKeys
FROM (SELECT TOP (200000) [k1],[k2] FROM [s].[t] ORDER BY [k1] DESC) z;
```
`distinctKeys < total` **hoặc** `nullKeys > 0` ⇒ **HẠ CẤP NGAY xuống `readonly`** (khoá không đáng tin ⇒ UPDATE/DELETE có thể đụng nhiều dòng).

#### **P7 — Trigger**
```sql
SELECT name, is_instead_of_trigger, is_disabled FROM sys.triggers WHERE parent_id = OBJECT_ID(@qual);
```
**Fallback**: `OBJECTPROPERTY(OBJECT_ID(@qual),'HasAfterTrigger'/'HasInsteadOfTrigger')`. Không dò được ⇒ `triggerKnowledge = 'unknown'` ⇒ **BẮT BUỘC** admin tick *"Tôi hiểu dry-run có thể kích hoạt trigger (mail/audit) và đốt identity seed"*, **không được im lặng coi như không có trigger**.

#### **P8 — Foreign keys (hai chiều) + ON DELETE** — *(năng lực này hiện **KHÔNG TỒN TẠI** — F19)*
```sql
SELECT fk.name, OBJECT_SCHEMA_NAME(fk.parent_object_id) AS childSchema,
       OBJECT_NAME(fk.parent_object_id) AS childTable, pc.name AS childCol,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parentSchema,
       OBJECT_NAME(fk.referenced_object_id) AS parentTable, rc.name AS parentCol,
       fk.delete_referential_action_desc AS onDelete, fkc.constraint_column_id AS ordinal
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id     AND pc.column_id=fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id
WHERE fk.parent_object_id = OBJECT_ID(@qual) OR fk.referenced_object_id = OBJECT_ID(@qual);
```
**Fallback**: `INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS` + `KEY_COLUMN_USAGE` (**mất `ON DELETE`** ⇒ mặc định `NO_ACTION` ⇒ **cấm xoá cứng**).
**Fallback cuối**: heuristic tên → `source = 'name-heuristic'`, `confidence < 1` ⇒ **CẤM dựng Select/lookup** cho tới khi **admin xác nhận** (E-FK-UNCONFIRMED).
> ⭐ **Phải kèm P8b — kiểm chứng tham chiếu thật**:
> ```sql
> SELECT COUNT(*) AS sampled, SUM(CASE WHEN p.[pk] IS NULL THEN 1 ELSE 0 END) AS orphans
> FROM (SELECT DISTINCT TOP (1000) c.[fkCol] AS v FROM [cs].[child] c WHERE c.[fkCol] IS NOT NULL) x
> LEFT JOIN [ps].[parent] p ON p.[pk] = x.v;
> ```
> orphanRate 0% ⇒ confidence 0.92 (vẫn phải confirm); >5% ⇒ 0.3 ⇒ **mặc định "không phải FK"**.
> ⚠️ **Chặn polymorphic**: cột `EntityId` + cột kề `EntityType/*Kind` (chuỗi, DISTINCT ≤ 30) ⇒ **UNSUPPORTED lookup**, hạ mọi ứng viên overlap của cột đó **về 0** (mọi bảng có Id 1..N đều "khớp 100%" → confidence cao **giả**).

#### **P9 — Index + full-text (quyết định sortable/filterable/searchable)**
```sql
SELECT i.name, i.type_desc, i.is_unique, i.is_primary_key,
       c.name AS col, ic.key_ordinal, ic.is_included_column, ic.is_descending_key
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE i.object_id = OBJECT_ID(@qual) AND i.type > 0
ORDER BY i.index_id, ic.is_included_column, ic.key_ordinal;

SELECT OBJECTPROPERTY(OBJECT_ID(@qual),'TableHasActiveFulltextIndex') AS hasFt;
SELECT c.name FROM sys.fulltext_index_columns f
JOIN sys.columns c ON c.object_id=f.object_id AND c.column_id=f.column_id
WHERE f.object_id = OBJECT_ID(@qual);
```
**Fallback**: `sp_helpindex @qual` (parse `index_keys`) → **probe thực nghiệm** `SELECT TOP 1 [col] FROM [s].[t] ORDER BY [col] DESC` với `CommandTimeout = 5`: `<100ms` ⇒ *likely indexed*; `≥100ms`/timeout ⇒ **coi như KHÔNG index** (fail-safe).
> ⚠️ Probe thực nghiệm này **chính là một full-scan + sort** trên DB production ⇒ **chỉ chạy khi bucket ∈ {S, M}**, TUYỆT ĐỐI không chạy trên XL.
> **Full-text fallback per-column**: `SELECT TOP 1 1 FROM [s].[t] WHERE CONTAINS([col], N'"zzq"')` — lỗi `7601` ⇒ không có FT index.

#### **P10 — Số dòng (bucket)**
```sql
SELECT SUM(ps.row_count) FROM sys.dm_db_partition_stats ps
WHERE ps.object_id = OBJECT_ID(@qual) AND ps.index_id IN (0,1);
```
**Fallback 1**: `SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id=OBJECT_ID(@qual) AND p.index_id IN (0,1)` (chỉ cần quyền trên object).
**Fallback 2 (luôn chạy được)** — **bounded count**:
```sql
SELECT COUNT(*) FROM (SELECT TOP (2000001) 1 AS x FROM [s].[t]) z;  -- =2000001 ⇒ bucket XL
```
**Fallback 3**: timeout ⇒ **coi là XL** (fail-safe). Trên **VIEW**, `dm_db_partition_stats` **vô nghĩa** ⇒ bắt buộc bounded count.

| bucket | approxRows | Hệ quả |
|---|---|---|
| **S** | < 50.000 | sort/filter tự do; substring LIKE OK |
| **M** | 50k – 2M | sort **chỉ** trên cột có index; bounded count; prefix search |
| **L/XL** | > 2M | **BẮT BUỘC filter trước khi list**; không total; không jump-page; export background |

#### **P11 — Chi phí COUNT thật**
```sql
DECLARE @t0 datetime2 = SYSUTCDATETIME(); DECLARE @c bigint;
SELECT @c = COUNT_BIG(*) FROM [s].[t];
SELECT @c AS exactRows, DATEDIFF(millisecond, @t0, SYSUTCDATETIME()) AS ms;   -- CommandTimeout = 3
```
Timeout ⇒ `exactCountAllowed = false` **vĩnh viễn** cho bảng này (ghi vào profile). **KHÔNG retry, KHÔNG chạy lại mỗi trang.**

#### **P12 — CHECK constraint (→ Select options)** — *(hiện **KHÔNG TÌM THẤY** — grep `sys.check_constraints`/`CHECK_CONSTRAINTS` = 0 hit)*
```sql
SELECT cc.name, cc.definition, col.name AS column_name
FROM sys.check_constraints cc
LEFT JOIN sys.columns col ON col.object_id=cc.parent_object_id AND col.column_id=cc.parent_column_id
WHERE cc.parent_object_id = OBJECT_ID(@qual) AND cc.is_disabled = 0;
```
Parser **hạn chế**, chỉ chấp nhận 2 hình dạng: `([col] IN ('a','b'))` và `([col]='a' OR [col]='b')`. Mọi hình dạng khác ⇒ **KHÔNG mô phỏng**, chỉ helpText + **SQL-error mapper `547`**.
**Fallback data-probe** (không cần metadata):
```sql
SELECT TOP 26 v, COUNT_BIG(*) n FROM (SELECT TOP (5000) [col] AS v FROM [s].[t] WHERE [col] IS NOT NULL) x
GROUP BY v ORDER BY n DESC;   -- ≤20 distinct ⇒ enumCandidate (source='distinct')
```
⚠️ Nhánh data-probe ⇒ **KHÔNG bật option-membership validator** (có thể thiếu giá trị hiếm → chặn nhầm dữ liệu hợp lệ của khách).

#### **P13 — Ngữ nghĩa: cột thời gian / status / soft-delete / owner**
- **timeColumn**: chấm điểm tất định — tên khớp `^(created|insert|submit|entry|reg|order)[_]?(on|at|date)?` **+50**; `^(modified|updated)` **+10**; NOT NULL **+20**; có DEFAULT `getdate/sysutcdatetime` **+20**; đơn điệu theo PK (mẫu 1000) **+30**; có index dẫn đầu **+20**. → **top-3 kèm bằng chứng** → **ADMIN xác nhận** (kể cả `timeIsUtc` — máy **không** suy ra được; sai = lệch 7h).
- **statusColumn**: low-cardinality (≤30 distinct) + kiểu bit/tinyint/int/varchar. FK → lookup table (P8).
- **softDelete**: tên khớp `^(is)?deleted|deleted(on|at)|isactive|isarchived|voided|cancelled` + kiểu bit/datetime; xác nhận bằng phân phối giá trị.
- **ownerColumn**: kiểu + 20 mẫu + **match-rate** với user hệ thống trên `DISTINCT TOP 5000` (bảng user hầu như luôn ở **DB khác** ⇒ so khớp trong C#, không JOIN).

#### **P14 — Cột VARCHAR chứa ngày**
```sql
SELECT COUNT_BIG(*) AS sampled,
  SUM(CASE WHEN TRY_CONVERT(datetime2,[col],126) IS NOT NULL THEN 1 ELSE 0 END) AS iso,
  SUM(CASE WHEN TRY_CONVERT(datetime2,[col],103) IS NOT NULL THEN 1 ELSE 0 END) AS dmy
FROM (SELECT TOP (20000) [col] FROM [s].[t] WHERE [col] IS NOT NULL ORDER BY [pk] DESC) x;
```
Chỉ chấp nhận làm `timeColumn` khi **iso = sampled (100%)** (sort theo chuỗi ISO vẫn đúng và **sargable**). Định dạng khác ⇒ `timeColumn = null` + gợi ý persisted computed column (opt-in, DDL của DBA).
> ⚠️ **CẤM** `TRY_CONVERT` trong `WHERE`/`ORDER BY` chạy thẳng trên 500k (non-sargable → full scan mỗi trang).

#### **P15 — Cột file (content-sniff)**
```sql
;WITH s AS (SELECT TOP (500) CAST([col] AS nvarchar(4000)) AS v
            FROM [s].[t] WHERE [col] IS NOT NULL AND LEN([col])>0)
SELECT COUNT(*) sampled,
  SUM(CASE WHEN LEFT(LTRIM(v),1) IN ('[','{') THEN 1 ELSE 0 END)        json_like,
  SUM(CASE WHEN v LIKE 'http://%' OR v LIKE 'https://%' THEN 1 ELSE 0 END) url_like,
  SUM(CASE WHEN v LIKE '\\%' THEN 1 ELSE 0 END)                          unc_like,
  SUM(CASE WHEN v LIKE '%;%' OR v LIKE '%|%' THEN 1 ELSE 0 END)          multi_like,
  SUM(CASE WHEN v LIKE '%[/\]%' THEN 1 ELSE 0 END)                       has_sep,
  MAX(LEN(v)) max_len
FROM s;
```
⚠️ Lấy **2 mẫu** (200 mới nhất + 200 cũ nhất). Hai mẫu ra hai `valueMode` khác nhau ⇒ **CẢNH BÁO**, không tự chốt.

#### **P16 — Always Encrypted / RLS**
```sql
SELECT c.name, c.encryption_type FROM sys.columns c
WHERE c.object_id = OBJECT_ID(@qual) AND c.encryption_type IS NOT NULL;   -- 1=deterministic, 2=randomized

SELECT sp.name, sp.is_enabled FROM sys.security_policies sp
JOIN sys.security_predicates pr ON pr.object_id = sp.object_id
WHERE pr.target_object_id = OBJECT_ID(@qual);
```
**Fallback AE (không cần sys)**: `SELECT TOP 1 *` rồi so `reader.GetFieldType(i)` với `DATA_TYPE` khai báo — khai `nvarchar/date` mà runtime trả `byte[]` ⇒ **Always Encrypted** + connection chưa bật `Column Encryption Setting=Enabled`.
**Fallback RLS**: INSERT trong tx rồi SELECT lại chính dòng đó — không đọc lại được ⇒ có **block predicate**.
> ⭐ `isDbOwner = 1` ⇒ **RLS BỊ BYPASS** ⇒ MegaForm vô tình phơi **toàn bộ** dữ liệu vốn được RLS che ⇒ **CẢNH BÁO ĐỎ + yêu cầu hạ quyền app-account**.

---

### 3.4 CAPABILITY PROFILE — đặc tả JSON đầy đủ

> Lưu trong **`MF_ExternalBinding` (server-owned, keyed by formId)** — **KHÔNG** lưu trong `SchemaJson` (client ghi được — F28, `MegaFormController.cs:407`).
> `profileHash` được **re-verify ở MỖI submit**, không chỉ lúc Save.

```jsonc
{
  "profileVersion": "1.0",
  "profileHash": "sha256:9f2c…",            // hash của toàn bộ khối bên dưới
  "probedAtUtc": "2026-07-11T09:00:00Z",
  "probeCoverage": { "metadataLevel": "L2", "behaviouralProbeConsented": true, "missing": [] },

  "connection": {                            // ⛔ SERVER-ONLY — không bao giờ vào envelope AI / response client
    "connectionKey": "CustomerErp",
    "provider": "SqlServer|PostgreSql|MySql|Sqlite|Unknown",
    "engineEdition": 5, "productVersion": "16.0.1000",
    "serverCollation": "SQL_Latin1_General_CP1_CI_AS", "dbCollation": "…",
    "updateability": "READ_WRITE|READ_ONLY",
    "isDbOwner": false, "caseInsensitive": true
  },

  "object": {
    "schema": "sales", "name": "Orders",
    "type": "BASE_TABLE|VIEW|SYNONYM|UNKNOWN",
    "schemaCollision": false,
    "hasInsteadOfTrigger": false,
    "afterTriggers": ["trg_Orders_Audit"],
    "triggerKnowledge": "known|unknown"
  },

  "permissions": { "select": true, "insert": true, "update": false, "delete": false,
                   "alter": false, "source": "catalog|empirical|assumed" },

  "size": { "approxRows": 512340, "rowsSource": "dm_db_partition_stats|sys.partitions|bounded|unknown",
            "bucket": "S|M|L|XL", "exactCountAllowed": false, "countMs": 4200 },

  "key": {
    "strategy": "identity|dbDefault|sequence|appGuid|userSupplied|uniqueIndex|none",
    "source":   "pk|uniqueIndex|adminDeclared|none",
    "trusted":  true,
    "columns":  [ { "name": "OrderId", "keyOrdinal": 1, "sqlType": "uniqueidentifier" } ],
    "isIdentity": false,
    "defaultKind": "newid|newsequentialid|sequence|none",
    "sequenceName": null,
    "keyRetrieval": "outputInto|scopeIdentity|preAssigned|businessKeyLookup|none",
    "immutable": true,
    "verified": { "sampled": 200000, "duplicates": 0, "nulls": 0 }
  },

  "concurrency": { "rowVersionColumn": "RowVer", "mode": "rowversion|compareColumns|lastWriteWins" },

  "columns": [{
    "name": "TotalAmount", "ordinal": 12,
    "sqlType": "decimal", "precision": 18, "scale": 2,
    "maxLengthChars": null,                  // null = MAX/LOB (NEVER 0, NEVER -1)
    "isLob": false, "collation": null,
    "nullable": false,
    "isPrimaryKey": false, "isIdentity": false, "isComputed": false, "isRowVersion": false,
    "isEncrypted": false, "encryptionType": null,
    "hasDefault": true, "defaultKind": "literal", "defaultExpr": "((0))",

    // ⭐ ĐÃ TÍNH SẴN — model rẻ không cần hiểu luật, chỉ cần đọc cờ
    "insertable": true, "updatable": true, "immutable": false,
    "omitFromInsert": false,                 // true cho identity/computed/rowversion/hasDefault-function
    "mustSupplyOnInsert": false,
    "required": false,                       // = !nullable && !hasDefault && insertable && !serverFill
    "serverFill": null,                      // actor.userId|actor.userName|utcNow|portalId|ipAddress|const:<v>|newid|sequence
    "sortable": false, "filterable": false, "searchable": false,   // theo index (P9) + isLob + isEncrypted

    "fk": null,
    "valueMode": null,                       // blobColumn|filePath|fileUrl|fileJson|filePathList|fileRefId|childTable
    "enum": { "source": "check|distinct", "values": ["A","B"], "membershipEnforced": true },

    "uiType": "number",
    "allowedWidgets": ["Number","Text"],     // whitelist đóng — AI chỉ chọn TRONG đây
    "defaultWidget": "Number",
    "machineNote": "decimal(18,2) → step 0.01, max 9999999999999999.99"
  }],

  "indexes": [{ "name":"IX_Orders_CreatedOn","unique":false,"leading":"CreatedOn",
                "keyColumns":["CreatedOn","OrderId"],"included":["Status"],
                "filtered":false,"disabled":false }],
  "fullText": { "enabled": true, "columns": ["Notes"] },

  "relations": {
    "outbound": [{ "column":"CustomerId","refSchema":"dbo","refTable":"Customers","refColumn":"Id",
                   "source":"catalog|name-heuristic|admin-confirmed","confidence":1.0,
                   "onDelete":"NO_ACTION","parentApproxRows":480000,"parentLabelColumn":"FullName" }],
    "inbound":  [{ "childSchema":"sales","childTable":"OrderLines","childColumn":"OrderId",
                   "onDelete":"CASCADE","fkIndexed":true }],
    "junctions": [], "selfRef": null,
    "polymorphicSuspects": ["EntityId"],
    "cycleNotNull": false
  },

  "semantics": {
    "timeColumn":   { "name":"CreatedOn","kind":"datetime2","isUtc":null,"indexed":true,
                      "nullPct":0.0,"confirmedByAdmin":false },
    "statusColumn": { "name":"StatusId","kind":"fkLookup",
                      "lookup":{"table":"dbo.OrderStatus","keyCol":"Id","labelCol":"Name"},
                      "values":[], "filterable": true },
    "softDelete":   { "column":"IsDeleted","activeValue":0,"deletedValue":1 },
    "ownerColumn":  { "name":"CreatedBy","kind":"userId|username|email|guid","matchRate":0.96 }
  },

  "capabilities": {                          // ⭐ KẾT LUẬN CỦA MÁY — AI chỉ đọc
    "mode": "readwrite|insertonly|readonly|unsupported",
    "canInsert": true, "canUpdate": false, "canDelete": false, "canOpenDetail": true,
    "canSort": true, "canFilterServer": true, "canSearch": "fulltext|prefix|substring|off",
    "canExport": true, "aggregatable": false,       // false ⇒ LOẠI khỏi All-Forms (F26)
    "requiresFilterBeforeList": false,
    "statusFilterable": false, "hasTimestamp": true, "hasStatus": true,
    "allowedActions": ["create","read"],
    "reasons": [{ "code": "PERM_NO_UPDATE", "message": "Tài khoản DB không có quyền UPDATE trên sales.Orders" }]
  },

  "dryRun": { "insert":"pass|fail|skipped","update":"…","delete":"…","errors":[],"ranAtUtc":"…" },

  "policy": { "probeTimeoutSec": 5, "listTimeoutSec": 15, "exportTimeoutSec": 120,
              "lockTimeoutMs": 5000, "pageSize": 50, "maxOffset": 10000,
              "noLock": false }                     // ⛔ NOLOCK: opt-in, chỉ readonly, KHÔNG cho màn edit
}
```

---

## 4. DECISION MATRIX

**Luật hợp nhất:** `mode_cuối = MIN(mode của mọi trục)` với thứ tự `unsupported < readonly < insertonly < readwrite`. Một trục hạ cấp ⇒ cả form hạ cấp.

### 4.1 Trục A — ĐỐI TƯỢNG & MÔI TRƯỜNG (`E`)

| ID | Phát hiện | Xử trí | Mode |
|---|---|---|---|
| **E1** | `BASE TABLE`, SELECT+INSERT+UPDATE+DELETE, provider = SqlServer, L2 | Đường đầy đủ | `readwrite` |
| **E2** | Chỉ `SELECT` (P2 / `229` khi dry-run) | Dashboard đọc đầy đủ. **CHẶN Ở SERVER trước `SubmissionProcessor.cs:281`**, không chỉ ẩn nút (CLAUDE.md §1/§3). Tái dùng `ServerSidePermissionEnforcementService`. | `readonly` |
| **E3** | SELECT+INSERT, **không** UPDATE/DELETE | Submit OK. Edit/Delete → `NotSupportedException` mã hoá thành **HTTP 409** (không phải 500). **Status/Read/Archive lưu trên ANCHOR** → không đụng bảng khách. | `insertonly` |
| **E4** | SELECT+INSERT+UPDATE, **không** DELETE | `readwrite` + `canDelete=false` (ẩn **và** chặn server) | `readwrite` |
| **E5** | `DATABASEPROPERTYEX(…,'Updateability') = 'READ_ONLY'` **hoặc** `ApplicationIntent=ReadOnly` | Quyền có nhưng ghi vẫn `Msg 3906`. **Ép readonly ngay ở probe**, **KHÔNG chạy dry-run INSERT**. Banner riêng: *"Bạn đang trỏ vào replica chỉ-đọc"*. | `readonly` |
| **E6** | `VIEW`, **không** INSTEAD OF | Readonly tuyệt đối. Detail chỉ khi `GetSchemaTable(KeyInfo)` trả `IsKey`. Đếm dòng **bắt buộc** bounded count. | `readonly` |
| **E7** | `VIEW` + INSTEAD OF trigger | **Mặc định `insertonly`**. `readwrite` chỉ khi admin bật tay **và** dry-run 3 thao tác PASS. **KHÔNG dùng `OUTPUT`** (INSTEAD OF làm OUTPUT trả sai/rỗng) → preAssign key hoặc businessKeyLookup. ⚠️ Cảnh báo trước khi probe: trigger **vẫn fire** dù rollback. | `insertonly` |
| **E8** | Linked server / 4-part / `OPENQUERY` | **UNSUPPORTED**. Mọi guard trong repo đã chặn `OPENQUERY/OPENROWSET/OPENDATASOURCE` (`FormDatabaseInsertService.cs:209`; `RazorActionSqlGuard.cs:30`; `FieldOptionsService.cs:464`; `LifecycleRunner.cs:296`) — **giữ nguyên**. Hướng dẫn: tạo VIEW/SYNONYM cục bộ có index. | `unsupported` |
| **E9** | Cross-DB (3-part) | Oqtane/Web/Umbraco: **khuyến nghị connection riêng** (registry đã resolve tên bất kỳ). DNN: `DnnConnectionRegistry` **throw** với mọi key ngoài alias dashboard ⇒ chỉ còn SYNONYM/VIEW. **Azure SQL DB (engine=5): cross-DB KHÔNG hỗ trợ.** Ghi cross-DB: **KHÔNG hỗ trợ v1** (không có distributed transaction). | `readonly` / `unsupported` |
| **E10** | Provider ≠ SqlServer | Probe rơi về `GetSchemaTable(KeyInfo)` (không đồng nhất giữa driver). Không đủ ⇒ `key.trusted=false`. **Nhánh `default:` của `SqlSchemaReader.cs:48` coi `Unknown` = SQL Server ⇒ phải đổi thành lỗi tường minh.** | `readonly` (v1) |
| **E11** | `metadataLevel = L0` | Không biết DEFAULT/CHECK ⇒ `required = true` cho **mọi** NOT NULL; không chắc computed/rowversion/unique ⇒ **cấm UPDATE**. | `insertonly` |
| **E12** | `schemaCollision = true` | **BẮT BUỘC admin chọn schema**. Cấm probe tiếp: `SqlSchemaReader.cs:86` (`WHERE TABLE_NAME=@t`, không schema) **trộn cột 2 bảng, im lặng**. | `unsupported` (tới khi chọn) |
| **E13** | RLS bật **và** `isDbOwner = 1` | **dbo BYPASS RLS** ⇒ MegaForm phơi toàn bộ dữ liệu vốn bị che. **CẢNH BÁO ĐỎ**, yêu cầu hạ quyền app-account trước khi bind. | `readonly` + block bind |
| **E14** | RLS bật, account thường | Dữ liệu lọc theo **app-account**, KHÔNG theo end-user MegaForm. Banner bắt buộc. `SESSION_CONTEXT` chỉ khi admin khai mapping; `EXECUTE AS` chỉ khi có IMPERSONATE (mặc định TẮT). ⚠️ `sp_set_session_context` **mất khi pool reset** ⇒ phải set **mỗi lần `Open()`** (hiện **KHÔNG TÌM THẤY** hook sau `conn.Open()` ở đâu). | `readonly` |
| **E15** | Always Encrypted — **randomized** | Cột **loại khỏi** WHERE/ORDER BY/LIKE **ở SERVER**. Nếu cột NOT NULL, không default, không key access ⇒ INSERT bất khả ⇒ **cả bảng readonly**. | `readonly` |
| **E16** | Always Encrypted — **deterministic** + có key access | Chỉ cho toán tử `=` và `GROUP BY`. Cấm range/LIKE/sort. | `readwrite` (hạn chế) |
| **E17** | Collation **case-sensitive** (`'a' = 'A'` → 0) | Tên cột **copy nguyên văn từ probe**, cấm mọi so khớp ignore-case khi sinh SQL. ⚠️ `ExtractParamNames` dùng `HashSet(OrdinalIgnoreCase)` (`FormDatabaseInsertService.cs:193`) ⇒ `:email` và `:Email` **gộp làm một** → mất param. Cấm `COLLATE` bừa (mất index → quét 500k). | `readwrite` |

### 4.2 Trục B — HÌNH DẠNG KHOÁ (`K`)

| ID | Phát hiện (probe) | Xử trí | Mode |
|---|---|---|---|
| **K1** | P4 = 1 cột, P3 `is_identity=1`, int/bigint | `strategy=identity`, `omitFromInsert=true`. Lấy khoá: **`OUTPUT INSERTED.[pk] INTO @k`** (KHÔNG `OUTPUT` trần → `Msg 334` nếu bảng có trigger; KHÔNG `@@IDENTITY`). ⚠️ **`SubmissionId` KHÔNG được = PK khách** (xem §7-B1) — anchor cấp id. | `readwrite` |
| **K2** | 1 cột PK + DEFAULT `newid()` / `newsequentialid()` / `NEXT VALUE FOR` | `strategy=dbDefault`. Bỏ cột khỏi câu INSERT (**không bind `DBNull` tường minh** — xem C2). Lấy khoá bằng `OUTPUT … INTO @k`. **`SCOPE_IDENTITY()` KHÔNG áp dụng cho GUID/sequence** (lỗi kinh điển → trả `NULL` → mất khoá im lặng). | `readwrite` |
| **K3** | PK `uniqueidentifier`, **không** DEFAULT | `strategy=appGuid`. **Server sinh COMB/sequential GUID** trước INSERT (Guid.NewGuid() thuần → page split trên clustered PK của bảng 500k). **TUYỆT ĐỐI không nhận GUID từ client** (CLAUDE.md §1). | `readwrite` |
| **K4** | PK int, **không** identity, **không** default, **không** sequence | **CẤM `MAX(id)+1`** (race → `2627` dưới tải + quét index trên 500k). Hai nhánh: (a) admin chỉ định sequence → `SELECT NEXT VALUE FOR` trong cùng tx; (b) user tự nhập mã → `keyUserSupplied=true` + pre-check trùng + bắt `2627`. Không có gì ⇒ **readonly**. | `insertonly` / `readonly` |
| **K5** | PK chuỗi (natural key) | `userSupplied`. Đọc `COLLATION_NAME`; `_CI` ⇒ chuẩn hoá UPPER-invariant **chỉ để hash** (giá trị gốc dùng trong WHERE) — nếu không, `'tk-1'` và `'TK-1'` = **cùng 1 dòng ở DB nhưng 2 hash** → map nhân đôi, detail mở nhầm. Cột khoá vào `immutableColumns` **kể cả** khi user nhập lúc tạo. | `readwrite` |
| **K6** | PK composite (P4 trả ≥2 dòng) | `RowKeyJson` = JSON array theo `key_ordinal` (canonical: DateTime→ISO-8601 UTC, số→invariant). WHERE = **AND đủ mọi cột**, mỗi cột 1 `DbParameter` **với `DbType` đúng** (round-trip qua string làm lệch datetime/decimal → `UPDATE` 0 dòng, âm thầm). **Cấm sửa bất kỳ cột khoá nào.** | `readwrite` |
| **K7** | Không PK, có unique index NOT NULL, `has_filter=0`, `is_disabled=0` | Nâng thành **khoá logic** (chọn tất định: ít cột → hẹp nhất → alphabet). **BẮT BUỘC P6** (dup/null). `LogicalKeySource='uniqueIndex'` phải hiện cho admin. Re-probe định kỳ: DBA drop index ⇒ **tự hạ readonly + báo**, không im lặng ghi tiếp. | `readwrite` (có điều kiện) |
| **K8** | Không PK, không unique (heap) | **Không địa chỉ hoá được.** CẤM `%%physloc%%` / `ROW_NUMBER()` làm khoá (LLM rất hay đề xuất → **chặn bằng validator, không bằng lời dặn trong prompt**). Dashboard read-only, **ẩn hẳn** nút Edit/Delete/detail. Vẫn cho INSERT (không cần khoá để thêm dòng). | `insertonly` (nếu có INSERT) / `readonly` |
| **K9** | Identity **∉** PK (hiếm) | Cross-check `identity ∈ PK` **trước** khi coi là rowKey; nếu không, `SCOPE_IDENTITY` trả đúng nhưng **không phải PK** → detail mở nhầm dòng. | theo K khác |
| **K10** | PK `bigint` vượt int32 | Không ảnh hưởng (anchor cấp `SubmissionId` riêng). Ghi giá trị thật vào `RowKeyJson`. | `readwrite` |
| **K11** | P6 phát hiện `distinctKeys < total` hoặc `nullKeys > 0` | **HẠ CẤP NGAY** — khoá không đáng tin, UPDATE/DELETE có thể đụng nhiều dòng. | `readonly` |

### 4.3 Trục C — GHI & LẤY KHOÁ (`W`)

| ID | Phát hiện | Xử trí | Mode |
|---|---|---|---|
| **W1** | Bảng có **AFTER trigger** (P7) | `OUTPUT INSERTED.[pk] **INTO @k**` (dạng trần → `Msg 334`). ⚠️ Trigger có thể **sửa lại giá trị vừa ghi** ⇒ **read-back dòng theo khoá** trước khi hiển thị. | `readwrite` |
| **W2** | **INSTEAD OF trigger** | `SCOPE_IDENTITY()` trả `NULL`; `OUTPUT` phản ánh giá trị **trước** khi trigger chạy ⇒ **khoá giả**. Chỉ 2 lối: (a) business key unique do form thu thập → SELECT lại; (b) không có ⇒ `insertonly` (ghi được, không mở detail dòng vừa tạo). | `insertonly` |
| **W3** | Cột **NOT NULL, không default, không nằm trên form** (TenantId/OwnerId/CreatedBy/Status) | **System Value Binding** — allowlist nguồn **server-only**: `actor.userId \| actor.userName \| actor.roles[0] \| portalId \| moduleId \| utcNow \| ipAddress \| formId \| const:<v>`. **⛔ NGUỒN BỊ CẤM: bất cứ gì từ request body/query.** Cột không map được nguồn nào ⇒ **FAIL VALIDATION lúc bind**, không để tới lúc submit mới vỡ. | `readwrite` |
| **W4** | Bảng con 1-N (DataGrid) | `BeginTransaction` → INSERT parent → lấy key → INSERT từng child (FK = parentKey) → `COMMIT`; bất kỳ child lỗi ⇒ **ROLLBACK TOÀN BỘ** → 400. ⚠️ **Hôm nay child rows KHÔNG BAO GIỜ tới bảng con** (`megaform-widget-datagrid.ts:943-945`; **KHÔNG có** `POST Subform/Save`) ⇒ **cho tới khi có `ChildRowsWriter`, DataGrid bound = READ-ONLY + banner**, tuyệt đối không nhận input rồi vứt. | `insertonly` |
| **W5** | Junction M-N | Sync có **DELETE** **CHỈ KHI** FK là `declared` (confidence 1.0) **và** bảng chỉ có cột FK + audit. Mọi trường hợp khác ⇒ **chỉ-thêm-không-xoá**. (Suy sai junction ⇒ "sync" **xoá** dòng có dữ liệu nghiệp vụ.) | `insertonly` |
| **W6** | **Idempotency** (áp dụng mọi mode ghi) | Client gửi `requestId`; server lưu `(formId, requestId) → rowKey`. Đã tồn tại ⇒ **trả lại rowKey cũ, KHÔNG insert lại**. Không có cái này thì: timeout mạng / user bấm lại / proxy retry ⇒ **row THẬT thứ hai trong dữ liệu nghiệp vụ của khách** (không tự dọn được). Repo hiện **chỉ có guard client-side `submitInFlight`**. | bắt buộc |
| **W7** | UPDATE bất kỳ | `WHERE` **bắt buộc** theo rowKey + (nếu có) `AND [rowversion] = @rv`. **Assert `RowsAffected == 1`**; `0` ⇒ 409 xung đột (ai đó đã sửa/xoá); `>1` ⇒ **ROLLBACK NGAY** (khoá không unique). | `readwrite` |
| **W8** | Thứ tự ghi | Bảng khách là **nguồn sự thật** ⇒ ghi bảng khách **TRƯỚC**, commit, rồi mới tạo anchor + map. ⚠️ Nhưng validate/spam/`EnforceSubmit` nằm **BÊN TRONG** `SubmissionProcessor.ProcessAsync` ngay trước `_subRepo.Insert` (`SubmissionProcessor.cs:281`) ⇒ **BẮT BUỘC tách `ProcessAsync` thành `Validate/Enforce` (không persist) → ghi bảng khách → persist anchor**. Ghi trước khi enforce = ghi dữ liệu **chưa validate, chưa lọc spam, chưa check quyền** vào production 500k. | refactor bắt buộc |

### 4.4 Trục D — KIỂU CỘT & RÀNG BUỘC (`C`)

| ID | Phát hiện | Xử trí | Hệ quả |
|---|---|---|---|
| **C1** | `is_identity` / `is_computed` / `rowversion` | `insertable=false`, `updatable=false`, **loại khỏi tập AI nhìn thấy**. Rowversion → **ETag optimistic concurrency** (hệ cũ của khách **vẫn chạy song song**!). Để lọt ⇒ `Msg 544/271/273` → **fail-soft nuốt** → "gửi thành công", DB rỗng. | — |
| **C2** | NOT NULL **+ có DEFAULT** | `required = false` **và** ⭐ **BỎ CỘT KHỎI CÂU INSERT** — **KHÔNG bind `DBNull` tường minh**. `FormDatabaseInsertService.cs:91-98` gán `object val = DBNull.Value` rồi chỉ ghi đè khi formData có key ⇒ **DEFAULT của DB KHÔNG BAO GIỜ chạy** ⇒ `Msg 515`. Đây là bằng chứng quyết định rằng writer phải **sinh SQL động**, không dùng chuỗi INSERT tĩnh. | — |
| **C3** | `nvarchar(max)/varchar(max)/text/xml` | `maxLengthChars = null`, `isLob = true`. **Loại khỏi sortable/filterable** (SQL Server không cho index key trên cột MAX — `Msg 1919`, repo **đã dính** đúng lỗi này trên `MF_SubmissionValues`). Render Textarea; **HTML-encode khi hiển thị** (500k dòng dữ liệu cũ = nguồn **không tin cậy** → stored XSS). | — |
| **C4** | `decimal(p,s)` / `money` | `step = 10^-s`; `max = 10^(p-s) - 10^-s`. **`DbType` + `Precision` + `Scale` trên parameter** (hiện gán raw `p.Value = val` — `FormDatabaseInsertService.cs:96-99`, `DatabaseNodeExecutor.cs:231-233`, `:250-252`) ⇒ `'' → 0` âm thầm vào cột tiền. Validator dùng **`decimal.TryParse`**, không `double` (`1e30` lọt → `Msg 8115`). ⚠️ `FieldValidation.Min/Max` là `double?` ⇒ **không biểu diễn nổi biên `decimal(38,x)`/money** — phải mở rộng model. ⚠️ `FormHtmlRenderer` nối `double` vào HTML theo **CurrentCulture** ⇒ site vi-VN sinh `min="1234,5"` = attribute hỏng → ép `InvariantCulture`. | — |
| **C5** | `bit` | NULLABLE → Checkbox; NOT NULL + default → Checkbox; **NOT NULL không default → Radio Yes/No** (Checkbox + required ⇒ validator coi false = "empty" ⇒ **KHÔNG THỂ LƯU giá trị false** — mất 50% miền giá trị). `bit` NULLABLE = **3 trạng thái**. Coercer: `on/true/1/yes → 1`. | — |
| **C6** | date/datetime/datetime2/smalldatetime/time/datetimeoffset | Tách `uiType` (hiện gộp hết thành `date` — `SqlSchemaReader.cs:116`, **kể cả `timestamp`**). Parse **InvariantCulture/ISO-8601** (hiện `DateTime.TryParse` không culture ⇒ `03/04/2026` **nhảy nghĩa** giữa vi-VN và en-US → **ghi sai ngày/tháng vào 500k dòng thật, không có exception**). Gửi `DateTime` với `DbType`, **không gửi chuỗi** (nếu không, SQL Server parse lại theo `DATEFORMAT` của session = **tầng lỗi thứ hai**). Range: `datetime` ≥1753; `smalldatetime` 1900–2079. | — |
| **C7** | `uniqueidentifier / xml / geography / geometry / varbinary / hierarchyid / sql_variant` | `ClassifyUiType` hiện trả **`text`** cho tất cả (`SqlSchemaReader.cs:119`) ⇒ AI sẽ dựng **ô Text cho PK GUID**. Phải trả `guid` / `unsupported` / `file`. Spatial: đọc qua `.STAsText()` (SELECT * trả `SqlGeography` → serialize lỗi → dashboard 500 toàn bảng). ⭐ **Cột `unsupported` + NOT NULL + không DEFAULT ⇒ INSERT bất khả ⇒ HẠ CẢ BẢNG xuống `readonly`** và báo **ngay ở bước chọn bảng**. | `readonly` |
| **C8** | CHECK `IN(...)` | Trích literal → `enum.values` **bất biến**; bật membership validator. ⚠️ So khớp hiện là **Ordinal case-sensitive** trong khi DB thường CI/AS ⇒ CHECK `'A'` sẽ **chặn nhầm** dữ liệu cũ `'a'` → dùng comparer theo **collation**. | — |
| **C9** | CHECK phức tạp (LIKE/cross-column/UDF) | **KHÔNG mô phỏng bằng regex** (false-negative → chặn nhầm dữ liệu hợp lệ). Chỉ helpText + **SQL-error mapper `547`** → field error. **Mapper là điều kiện ship**, không phải nice-to-have. | — |
| **C10** | UNIQUE constraint/index | **Hai lớp bắt buộc**: (1) pre-check `SELECT TOP 1 1 … WHERE [col]=@v [AND pk<>@pk]`; (2) bắt `2627/2601` → field error. Chỉ (1) = race; chỉ (2) = UX tệ. Pre-check phải tôn trọng collation + trailing-space (SQL Server bỏ khoảng trắng cuối khi so sánh). | — |
| **C11** | Tên cột có dấu cách / tiếng Việt / `#` | `field.key` (**slug an toàn**) ≠ `columnName` (**tên thật**, quote `[ ]`). Ánh xạ trong `columnMap`. Chuẩn hoá **va chạm slug** (`Mã KH` / `Ma KH` → cùng slug ⇒ 2 cột ghi đè nhau âm thầm). ⚠️ `_paramRx = :([a-zA-Z_][a-zA-Z0-9_]*)` (`FormDatabaseInsertService.cs:189`) và `_safeIdent` (`DatabaseNodeExecutor.cs:30`) **đều không chịu được** tên như vậy. | — |
| **C12** | Cột enum-ish (≤20 distinct trên mẫu 5000) | Đề xuất Select, nhưng `source='distinct'` ⇒ **KHÔNG bật membership validator** (có thể thiếu giá trị hiếm). | — |

### 4.5 Trục E — THỜI GIAN / TRẠNG THÁI / SOFT-DELETE / OWNER (`T`)

| ID | Phát hiện | Xử trí | Mode |
|---|---|---|---|
| **T1** | Không có cột ngày nào | `hasTimestamp=false` → **ẩn** cột Date, date-range chip, time-bars report. Sort theo PK DESC. `SubmittedOnUtc` của anchor **không được hiển thị** (nếu để `default` → UI in `1/1/0001`). Đề xuất `ALTER TABLE ADD [MF_CreatedOnUtc]` **chỉ khi admin đồng ý** (mặc định **không đụng DDL bảng khách**). | `readwrite` |
| **T2** | Nhiều cột ngày | Máy chấm điểm (P13) → **top-3 kèm bằng chứng** → **ADMIN xác nhận** + tick **UTC hay local** (máy không suy ra được; sai = lệch 7h). AI **không** chọn. | `readwrite` |
| **T3** | Cột ngày NULLABLE / nhiều NULL | `SubmittedOnUtc = null` → UI `—`. NULL > 20% ⇒ cảnh báo đỏ + khuyến nghị sort theo PK. ⚠️ `applyDateRange` hiện `if (isNaN(d.getTime())) return true` ⇒ dòng không-ngày **luôn xuất hiện ở mọi bộ lọc ngày** (không phải "biến mất"); chỗ nuốt dòng thật là **report time-bars** + **stat pills**. | `readwrite` |
| **T4** | Không có cột status | `hasStatus=false` cho **bảng khách**. ⭐ **Status/Read/Archive lưu trên ANCHOR ROW** (`MF_Submissions.Status/ReadOnUtc/ModifiedByUserId` — `EntityModels.cs:71-77`) ⇒ **không cần sidecar mới, không đụng DDL khách**. **NHƯNG**: `statusFilterable = false` (không JOIN được cross-DB) — phải nói thẳng với admin, không giả vờ lọc được. | `readwrite` |
| **T5** | Status = varchar tự do | `DISTINCT` **1 lần lúc setup** → cache `statusValues[]` vào binding (**KHÔNG** `GROUP BY` mỗi lần mở dashboard). Bỏ toàn bộ hardcode UI. ⭐ Giá trị lạ ⇒ **badge xám + nhãn thô** — **KHÔNG** rơi vào default `'New'`. ⭐⭐ **`uiStatusToServer` hiện trả `''` cho giá trị lạ ⇒ lọc `PENDING` gửi `status=''` = KHÔNG lọc gì ⇒ trả TOÀN BỘ 500k thay vì báo lỗi (fail-OPEN)** — nguy hiểm hơn badge sai. | `readwrite` |
| **T6** | Status = int FK → lookup | `value = id`, `label` từ cache lookup (<1000 dòng, TTL). **KHÔNG JOIN 500k, KHÔNG N+1**. UI hiện label, gửi id (giữ index). Tách `StatusValue` / `StatusLabel` (hiện chỉ có 1 trường `Status`). | `readwrite` |
| **T7** | Status = bit | 2 (hoặc 3 nếu nullable) trạng thái. AI **gợi ý** nhãn (`IsApproved` → "Đã duyệt"/"Chờ duyệt"), **admin duyệt**. `bit` NULLABLE mà UI chỉ 2 trạng thái ⇒ mọi NULL bị hiển nhầm thành "chưa duyệt". | `readwrite` |
| **T8** | Soft-delete **có sẵn** | `WHERE [col] = activeValue` phải kèm **MỌI** query — **kể cả `COUNT` của pager và export CSV**. Quên ở COUNT ⇒ trang cuối rỗng; quên ở export ⇒ **lộ dữ liệu đã xoá logic**. `Delete` → `UPDATE SET [col]=deletedValue`. UI phải đổi copy (hiện in *"This cannot be undone"*). | `readwrite` |
| **T9** | **Không** soft-delete | ⭐ **`canDelete = false` MẶC ĐỊNH.** Bật phải: tick tường minh + gõ đúng tên bảng + audit log + **pre-flight P8 (bảng con + ON DELETE)**: có bảng con `NO_ACTION` ⇒ chặn; `CASCADE` ⇒ cảnh báo *"sẽ xoá N dòng con"*; **không có FK khai báo ⇒ CẤM xoá** (sẽ để lại orphan im lặng). **Rủi ro lớn nhất toàn bộ đặc tả: xoá cứng sai trên 500k = mất dữ liệu không hồi phục, không có bản sao trong MF_Submissions (thiết kế CỐ Ý không import).** | `insertonly` |
| **T10** | Không có cột owner | Scope `own` = **UNSUPPORTED**. **Chặn ở khâu LƯU permission** (validate lúc save, trả lỗi rõ) — không để rơi tới runtime: `PermissionService.cs:54-55` so `submission.UserId == user.UserId`, dòng ngoài có `UserId = null` ⇒ **ẩn sạch mọi dòng, không lỗi** ⇒ admin tưởng mất 500k dữ liệu. | `readwrite` |
| **T11** | Owner ≠ int UserId (username/email/GUID) | `ownerFilter` **phải thành predicate SQL** (`WHERE [ownerCol] = @actorKey`), `@actorKey` resolve **server-side từ UserContext** (CLAUDE.md §1). Hiện RLS `own` **lọc SAU khi SQL đã phân trang, trong RAM** ⇒ trên 500k user thấy **0-3 dòng/trang** và pager sai. Hiển `matchRate` cho admin xác nhận trước khi bật. | `readwrite` |

### 4.6 Trục F — CỘT FILE (`F`)

> ⛔ **F0 — CHẶN TOÀN TRỤC**: renderer công khai **KHÔNG upload byte nào** — `bindFileUploads` chỉ preview/validate; `collectFormData` gửi `names.join(', ')` (**chỉ TÊN FILE**). ⇒ **Mọi mode ghi file là ẢO** cho tới khi có đường upload thật. Trục F v1 = **readonly**.

| ID | Phát hiện (P15) | Xử trí | Mode v1 |
|---|---|---|---|
| **F1** | `varbinary(max)/image/binary` | `valueMode=blobColumn`. **List KHÔNG BAO GIỜ SELECT cột blob** — chỉ `DATALENGTH(col) > 0 AS __hasFile` (chặn ở **query builder**, không dựa vào review). Serve: endpoint riêng `[Authorize]` + kiểm quyền form + ownerColumn; `CommandBehavior.SequentialAccess` + `GetStream()`; `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`. | `readonly` |
| **F2** | nvarchar chứa path tương đối | `valueMode=filePath` + `legacyRoot` **server-side** (client không bao giờ thấy/gửi root). ⭐ **Projector CHỈ được emit `{fileName, fileUrl}`** — **TUYỆT ĐỐI KHÔNG** emit `path/filePath/storedPath`: `file-links.ts:184` cho **`filePath` thắng `fileUrl`** → đá sang `Files/Download?path=` → **404 cho cả 500k dòng**. Containment: `Path.GetFullPath` + `StartsWith(root + DirectorySeparatorChar)` (bản Web thiếu trailing separator = **sibling-prefix bypass**). ⚠️ **Path traversal đến từ DỮ LIỆU**, không phải từ request → validate giá trị cột y như input client. | `readonly` |
| **F3** | URL tuyệt đối / UNC | ⛔ **XSS THẬT**: `normalizeExplicitUrl` (`file-links.ts:81-95`) không lọc scheme ⇒ `javascript:alert(1)` trong cột legacy lọt thẳng vào `href`. **Whitelist `protocol ∈ {http:, https:}` TRƯỚC khi bật F3.** UNC → phải proxy (browser không mở `\\server\share`), không render `file://`. Server-side fetch bất kỳ ⇒ **`SsrfGuard`** (CLAUDE.md §9). | `readonly` |
| **F4** | JSON metadata | `valueMode=fileJson` + `jsonKeys` map (**AI KHÔNG được đoán key** — đây đúng lỗi "AI đoán FK theo tên"). Ghi = **MERGE, KHÔNG REPLACE** (giữ nguyên mọi key lạ hệ cũ đang đọc). Key **vắng mặt = GIỮ NGUYÊN**, không phải xoá. | `readonly` |
| **F5** | Nhiều file 1 cột (`;` `\|` `,`) | Split/join đúng delimiter. Sanitize tên file **loại delimiter** (⚠️ `Path.GetInvalidFileNameChars()` **phụ thuộc OS**: Windows có `\|`, Linux chỉ có `\0` và `/` ⇒ trên Oqtane/Linux cả `\|;,` đều lọt). Kiểm tràn `MaxLength` **trước khi ghi** — nhưng nhớ **`-1` = unlimited**, không phải "0 ký tự". | `readonly` |
| **F6** | Bảng con attachments (FK) | `valueMode=childTable`. List: **không JOIN** bảng con (chỉ subquery COUNT nếu FK có index). Detail: on-demand. Cần `ChildRowsWriter` (W4). | `readonly` |
| **F7** | FK → catalog file (`dbo.Files`…) | `valueMode=fileRefId`, **readonly cứng** — ghi vào catalog dùng chung = **phá hệ cũ / phá quản lý file của DNN**. | `readonly` |
| **F8** | (Hệ quả tích cực của anchor) | `GetDetail` luôn gọi `_files.GetBySubmission(submissionId)` (`SubmissionQueryService.cs:120`). Vì anchor cấp `SubmissionId` **thuộc không gian id của MegaForm**, lookup này **đúng và không thể va chạm**. (Nếu dùng PK khách làm `SubmissionId` — phương án đã bị bác — thì `PK=12345` của khách sẽ **kéo về file của submission MegaForm 12345** ⇒ **rò file chéo form**.) | ✅ |

### 4.7 Trục G — QUAN HỆ (`R`)

| ID | Phát hiện | Xử trí | Mode |
|---|---|---|---|
| **R1** | FK **declared** (P8), parent ≤ 2.000 dòng | Select preload. **Server resolve `{parentTable, parentPk, labelCol}`** — ⛔ **KHÔNG persist chuỗi `optionsSql`** vào schema (schema là **client-writable** — F28) ⇒ nếu không, "máy sở hữu SQL" chỉ là hình thức. | `readwrite` |
| **R2** | FK **declared**, parent > 2.000 | **LookupPicker typeahead server-side**: min 2 ký tự, `LIKE @q + '%'` (**prefix**, giữ index — `'%x%'` trên 500k = full scan **mỗi phím**), `TOP 20`, phân trang. ⛔ **`Field/Options` hiện ẨN DANH** (`MegaFormController.cs:46-48`, `:1288-1289`) ⇒ endpoint lookup mới kế thừa mặt phẳng này = **máy dò dữ liệu khách hàng** (gõ a,b,c → hút 500k tên). **Bắt buộc `[Authorize]` + rate-limit + scope.** | `readwrite` |
| **R3** | FK suy theo **TÊN** (`name-heuristic`) | **RelationCandidate**, không phải RelationEdge. **BẮT BUỘC admin confirm** (kèm % khớp tham chiếu + số orphan từ P8b). Chưa confirm ⇒ render **Number/Text thường** (an toàn). Orphan > 5% ⇒ mặc định **"không phải FK"**. Gỡ bỏ đoạn prompt bảo LLM tự suy FK (`ai-form-creator.ts:1403-1411`). | `readwrite` |
| **R4** | ⭐ **Lookup KHÔNG có row-scope** (tenant/branch/owner) | Bảng cha của khách gần như chắc chắn có `CompanyId/TenantId`. `SELECT pk, label FROM parent` **không WHERE scope** ⇒ user tenant A **xổ được danh bạ tenant B**. ⇒ `RelationPlan` **phải mang `scopeColumn`**, giá trị lấy **server-side từ actor** (không từ query string). Probe thấy cột nghi tenant mà admin chưa khai scope ⇒ **CẤM bật lookup** (không phải "cảnh báo"). | `unsupported` (tới khi khai) |
| **R5** | Child 1-N | DataGrid **READ-ONLY** cho tới khi có `ChildRowsWriter` (W4). | `readonly` (v1) |
| **R6** | Junction M-N | Chips/multiselect; sync có DELETE chỉ khi `declared` (W5). | `insertonly` |
| **R7** | Self-reference (cây) | Cascading theo cấp (tái dùng `optionsDependsOn`). **CycleGuard bắt buộc** khi ghi (recursive CTE `MAXRECURSION`). ⚠️ Sửa `ParentId` = **UPDATE** ⇒ v1 chỉ insert-new (chưa có đường UPDATE). | `insertonly` |
| **R8** | FK composite | v1: dùng surrogate key của bảng cha nếu có; không có ⇒ **unsupported**. | `unsupported` |
| **R9** | ⭐ **FK đa hình** (`EntityType` + `EntityId`) | **KHÔNG BAO GIỜ có FK khai báo.** Heuristic tên+kiểu+overlap sẽ cho **confidence CAO GIẢ với hàng chục bảng** (mọi bảng có Id 1..N đều "khớp 100%") ⇒ admin rất dễ bấm [Đúng] cho một FK **sai**. **Phát hiện discriminator kề bên ⇒ đánh dấu polymorphic ⇒ CẤM tự bật lookup, hạ mọi ứng viên về 0.** | `unsupported` |
| **R10** | Chu trình FK NOT NULL 2 chiều (A→B, B→A) | Thứ tự INSERT **không tồn tại** (phải INSERT A rồi UPDATE A.BId) — mà đường UPDATE chưa có ⇒ **UNSUPPORTED cả cụm bảng**. Bỏ qua ⇒ "submit thành công, DB trống". | `unsupported` |
| **R11** | Cascade delete | P8 `delete_referential_action_desc`: `CASCADE` ⇒ cảnh báo + đếm dòng con; `NO_ACTION` ⇒ **chặn trước** bằng pre-flight COUNT (**không tự xoá con hộ** — đó là quyết định nghiệp vụ của khách); **không có FK** ⇒ **cấm xoá**. | theo T9 |

### 4.8 Trục H — SCALE & INDEX (`S`)

| ID | Phát hiện | Xử trí | Mode |
|---|---|---|---|
| **S1** | bucket **S** (<50k) | Full features. Sort/filter cột không index vẫn cho (full scan 50k chấp nhận được). Substring `LIKE '%x%'` OK. | `readwrite` |
| **S2** | bucket **M** (50k–2M) | Sort/filter **chỉ trên cột có index** (`indexRole = leading`). Bounded count. `pageSize` 50 (policy riêng, **không** kế thừa clamp 250 của facade). | `readwrite` |
| **S3** | bucket **L/XL** (>2M) | ⭐ **BẮT BUỘC FILTER TRƯỚC KHI LIST** — dashboard **không** mở ra danh sách toàn bảng. Ít nhất 1 filter chạm index, nếu không → nút Tìm **disabled ở SERVER** (capability gate, không chỉ ẩn UI). Không jump-page, không tổng số. Export ⇒ background job. `CommandTimeout = 15s`. | `readonly` |
| **S4** | Cột sort/filter **không có index** | Sort **disabled** (icon + tooltip). ⛔ **TUYỆT ĐỐI KHÔNG fallback client-sort** — đó chính là bug hiện hữu (`SubmissionsShell.ts:991` sắp 250/500.000 dòng rồi hiển thị **như thể đã sort toàn bảng** = **SAI dữ liệu, không báo lỗi**). Mở **Index Advisor** (S9). | `readwrite` |
| **S5** | Search | Thang 3 tầng: (1) **Full-Text** → `CONTAINS` (sanitize term: bọc `"…"`, strip `"` — `AND/OR/NEAR/FORMSOF` là **cú pháp FT hợp lệ**, user gõ vào sẽ đổi ngữ nghĩa/DoS); (2) **prefix sargable** `LIKE @q + '%'` trên cột có index; (3) **substring** chỉ khi bucket S **hoặc** đã có filter thu hẹp trước. Escape `% _ [` + `ESCAPE` clause. `minLength = 3` (debounce 350ms **đã có**). | `readwrite` |
| **S6** | COUNT | Không filter ⇒ **approximate** (`~500.000`, có dấu `~`). Có filter ⇒ **bounded count** `TOP (10001)` → hiện `10.000+`. Điều hướng ⇒ fetch `pageSize + 1` → `hasMore`. ⚠️ **KHÔNG dùng approximate cho báo cáo/đối soát tiền.** | `readwrite` |
| **S7** | Deep paging | Ưu tiên **keyset**: `ORDER BY [sortCol] DESC, [pk] DESC` + tuple-comparison tường minh; cursor = token **HMAC server-side** chứa `{lastSort, lastPk, sortCol, sortDir, filterHash}` (đổi sort ⇒ **invalidate**, nếu không user bấm Next sẽ nhảy vào vùng dữ liệu ngẫu nhiên, im lặng). ⛔ **Keyset đòi pager MỚI** (F24). Nếu chưa ⇒ **OFFSET + clamp `maxOffset = 10.000`** + thông báo "hãy thu hẹp bộ lọc". | `readwrite` |
| **S8** | All-Forms (`formId <= 0`) | `aggregatable = false` ⇒ **LOẠI form external khỏi All-Forms** (fan-out 50 form × 500 dòng song song vào DB khách = **tự DDoS ERP của khách**; `totalCount = merged.length` = sai hoàn toàn). | — |
| **S9** | ⭐ **INDEX ADVISOR** (thiếu index nhưng chỉ có SELECT) | **CẢNH BÁO + SINH SCRIPT, TUYỆT ĐỐI KHÔNG TỰ CHẠY.** Panel liệt kê cột bị chặn + lý do + chi phí đo được; sinh DDL **copy-được** cho DBA (`CREATE NONCLUSTERED INDEX … WITH (ONLINE=ON, DATA_COMPRESSION=PAGE)` + ước lượng dung lượng + cảnh báo giờ chạy). Nút duy nhất = **"Sao chép script"**, **không có nút "Áp dụng"**. Sau khi DBA chạy → nút **"Dò lại"** → re-probe → tự mở khoá sort/filter. | `readonly` |
| **S10** | Timeout / blocking | Timeout phân tầng: probe 5s / list 15s / export 120s. `SET LOCK_TIMEOUT 5000` (thà fail nhanh còn hơn xếp hàng sau transaction nghiệp vụ của khách). ⛔ **KHÔNG `WITH (NOLOCK)` mặc định** — dirty read (đọc chưa commit / trùng / bỏ sót dòng khi page split). NOLOCK = **opt-in tường minh, chỉ readonly, TUYỆT ĐỐI không cho màn edit** (đọc dirty rồi ghi đè = hỏng dữ liệu khách). Ưu tiên **gợi ý** `READ_COMMITTED_SNAPSHOT` cho DBA. | `readonly` |
| **S11** | Row-level permission | ⛔ Vị từ quyền **phải nằm TRONG `WHERE`**. Hiện DNN lọc `result.Items` **sau khi phân trang** rồi gán `TotalCount = visible.Count` ⇒ trên bảng khách 500k, user thấy **trang trống** dù còn hàng chục ngàn dòng hợp lệ. | — |

---

## 5. DEGRADATION LADDER

### 5.1 Bậc thang

```
readwrite   ── mất UPDATE/DELETE ─────────────────→ insertonly
    │                                                    │
    │  mất INSERT / khoá không tin / DB READ_ONLY        │  mất khoá / không địa chỉ hoá
    └────────────────────────────────────────────────────┴──────→ readonly
                                                                     │
                       cột NOT NULL unsupported / schemaCollision     │
                       / linked server / chu trình FK NOT NULL        │
                                                                      └──→ unsupported
```

### 5.2 Luật hạ cấp (tất định, không thương lượng)

| # | Điều kiện | Hạ xuống | Bắt buộc kèm |
|---|---|---|---|
| DL-1 | Bất kỳ trục nào trả mode thấp hơn | `MIN(...)` | `reasons[]` phải nêu **mã + trục + cột/đối tượng cụ thể** |
| DL-2 | Probe **không xác định được** (timeout/quyền) | Bậc thấp hơn (fail-safe) | Ghi `probeCoverage.missing[]` |
| DL-3 | Dry-run ghi **FAIL** | `readonly` | Không cho **Publish** |
| DL-4 | Runtime INSERT/UPDATE trả `229` (permission denied) | **Tự hạ `readonly` NGAY** + báo admin | **fail-CLOSED** (khác `SharedRuleEngine` fail-OPEN cố ý) |
| DL-5 | Re-probe định kỳ phát hiện lệch (`profileHash` đổi: index bị drop, cột bị đổi kiểu, unique index bị disable) | Tự hạ `readonly` | **KHÔNG im lặng ghi tiếp** |
| DL-6 | `RowsAffected != 1` khi UPDATE/DELETE | **ROLLBACK + 409** | Không retry mù |
| DL-7 | Cột `unsupported` **và** NOT NULL **và** không DEFAULT | **CẢ BẢNG → `readonly`** | Báo **ngay ở bước chọn bảng**, không để phát hiện sau khi user submit thất bại |
| DL-8 | `profileHash` lệch **lúc submit** | Từ chối submit (`E-PROFILE-STALE`) → re-probe | Không ghi bằng profile cũ |

### 5.3 Thông báo cho admin (bắt buộc, ngôn ngữ người)

Mỗi hạ cấp phải hiện **ba dòng**: **(1) mất gì — (2) vì sao — (3) làm gì để mở khoá**.

| Mã | Thông báo mẫu |
|---|---|
| `PERM_NO_INSERT` | *"Form chạy chế độ **Chỉ đọc**. Tài khoản DB chỉ có quyền SELECT trên `sales.Orders`. → Cấp `INSERT` trên bảng này để bật gửi biểu mẫu."* |
| `PERM_NO_UPDATE` | *"Không sửa/xoá được bản ghi. Tài khoản DB không có `UPDATE`/`DELETE`. Trạng thái (Đã đọc/Lưu trữ) vẫn dùng được — MegaForm lưu riêng, không ghi vào bảng của bạn."* |
| `NO_TRUSTED_KEY` | *"Bảng không có khoá chính hoặc khoá duy nhất đáng tin (phát hiện N dòng trùng khoá). MegaForm **không thể** định danh an toàn 1 dòng → tắt Sửa/Xoá. → Thêm cột IDENTITY hoặc UNIQUE INDEX rồi bấm **Dò lại**."* |
| `NO_INDEX_FOR_SORT` | *"Cột `CreatedOn` chưa có index — sắp xếp sẽ quét toàn bộ ~512.000 dòng. → Xem script index gợi ý cho DBA."* (kèm nút **Sao chép script**, **không** có nút Áp dụng) |
| `LOB_NOT_SORTABLE` | *"Cột `Notes` là `nvarchar(MAX)` — SQL Server không cho phép index (Msg 1919) → không sắp xếp/lọc được. → Cân nhắc Full-Text Index."* |
| `TRIGGER_SIDE_EFFECT` | *"⚠️ Bảng có trigger. Phép thử ghi (dù được hoàn tác) **vẫn kích hoạt trigger** — có thể gửi email/ghi audit thật, và **đốt một số IDENTITY**. Bạn có muốn tiếp tục?"* |
| `SCHEMA_COLLISION` | *"Có 2 bảng tên `Orders` (`dbo` và `sales`). MegaForm **không đoán**. → Chọn schema."* |
| `RLS_DBO_BYPASS` | *"🔴 Bảng có Row-Level Security nhưng tài khoản kết nối là `db_owner` → **RLS bị bỏ qua**, MegaForm sẽ thấy TOÀN BỘ dữ liệu. → Hạ quyền tài khoản trước khi bind."* |
| `BIG_TABLE_FILTER_REQUIRED` | *"Bảng > 2 triệu dòng. Hãy chọn bộ lọc trước khi xem danh sách."* |
| `EXTERNAL_NOT_AGGREGATABLE` | *"Form này đọc bảng ngoài — không hiện trong 'Tất cả biểu mẫu'. Xem riêng."* |
| `NO_FILE_UPLOAD_YET` | *"Cột file hiển thị được nhưng **chưa tải lên được** — biểu mẫu công khai chưa gửi nội dung tệp."* |

---

## 6. RANH GIỚI MÁY / AI / ADMIN

### 6.1 Bảng phân vai (3 tầng cứng)

| Quyết định | MÁY (C#, tất định) | AI (LLM) | ADMIN (người) |
|---|---|---|---|
| Bảng/schema nào | — | — | ✅ chọn (bắt buộc khi collision) |
| Provider / engine / quyền | ✅ probe | ❌ | — |
| Khoá (PK/unique/composite/allocator) | ✅ **độc quyền** | ❌ **CẤM TUYỆT ĐỐI** | ✅ chỉ khi K4/K7 cần khai báo |
| Cột nào insertable/updatable/immutable | ✅ | ❌ | — |
| `required` | ✅ `= !nullable && !hasDefault && insertable && !serverFill` | ❌ **cấm đổi** | — |
| `maxLength/step/scale/min/max` | ✅ | ❌ | — |
| **Sinh SQL (INSERT/UPDATE/SELECT/WHERE)** | ✅ **độc quyền** | ❌ **CẤM** | ❌ |
| Chiến lược lấy khoá sau INSERT | ✅ | ❌ | — |
| Degradation / mode | ✅ | ❌ | — |
| FK có thật hay không | ✅ (catalog) | ❌ **cấm tuyên bố** | ✅ confirm khi heuristic |
| Cột thời gian chính + UTC/local | ✅ chấm điểm + đề xuất | ❌ | ✅ **xác nhận bắt buộc** |
| Soft-delete semantics / bật xoá cứng | ✅ phát hiện | ❌ | ✅ **xác nhận 2 bước** |
| Row-scope (tenant) của lookup | ✅ phát hiện | ❌ | ✅ **khai báo bắt buộc** |
| Chạy DDL (CREATE INDEX/ALTER) | ❌ **CẤM** (chỉ sinh script) | ❌ **CẤM** | ✅ (DBA, ngoài MegaForm) |
| **Nhãn / mô tả / placeholder / helpText / i18n** | fallback `prettify(columnName)` | ✅ **giá trị chính** | ✅ sửa |
| **Widget** cho mỗi cột | ✅ `allowedWidgets[]` (whitelist đóng) | ✅ **chọn TRONG whitelist** | ✅ sửa |
| Thứ tự / Section / Step / Row | ✅ fallback theo ordinal | ✅ **giá trị chính** | ✅ sửa |
| Cột nào ẩn khỏi form / lên list view | ✅ fallback | ✅ đề xuất (chỉ trong `sortable[]` cho defaultSort) | ✅ sửa |
| Nhãn cho từng enum value | ✅ fallback = value thô | ✅ ("P" → "Chờ duyệt") — **value BẤT BIẾN** | ✅ sửa |
| Câu hỏi cho admin | — | ✅ `questionsForAdmin[]` | ✅ trả lời |

> ⭐ **Cơ chế khiến model rẻ vẫn đúng**: máy **tính sẵn** `insertable / omitFromInsert / required / allowedWidgets / immutable` và **loại hẳn** cột identity/computed/rowversion/encrypted **khỏi envelope** trước khi AI nhìn thấy. AI **không có cơ hội sai** vì không gian chọn đã bị thu hẹp. Prompt chỉ là **rào phụ**; **validator server là uy quyền**.

### 6.2 Hợp đồng VÀO — `Envelope` (máy sinh, AI chỉ đọc)

```jsonc
{
  "envelopeVersion": "1.0",
  "profileHash": "sha256:9f2c…",
  "locale": "vi-VN",
  "table": { "schema": "sales", "name": "Orders", "displayHint": "Đơn hàng" },
  // ⛔ KHÔNG BAO GIỜ có: connectionKey, connectionString, legacyRoot, tên DB

  "mode": "insertonly",
  "allowedActions": ["create", "read"],          // validator loại mọi action ngoài danh sách
  "forbidden": ["sql", "ddl", "connectionString", "customHtml", "rawHtml"],

  "budget": { "maxFields": 40, "maxRetries": 3, "batchIndex": 0, "batchCount": 2 },

  "columns": [                                    // ⭐ CHỈ cột AI được phép chạm
    { "key": "customer_id",                       // slug an toàn (fieldKey)
      "column": "CustomerId",                     // tên thật (AI KHÔNG được sửa)
      "sqlTypeLabel": "int",
      "insertable": true, "updatable": true, "immutable": false,
      "required": true,
      "maxLength": null, "step": null,
      "allowedWidgets": ["Select", "Number"],
      "defaultWidget": "Select",
      "lookup": { "hasLookup": true, "parentDisplayHint": "Khách hàng",
                  "labelColumnCandidates": ["FullName", "CompanyName"],
                  "size": "large" },              // large ⇒ typeahead, small ⇒ preload
      "enum": null,
      "machineNote": "FK declared → Customers.Id (480.000 dòng)" },

    { "key": "status_id", "column": "StatusId",
      "insertable": true, "updatable": true, "required": false,
      "allowedWidgets": ["Select", "Radio", "Cards"],
      "defaultWidget": "Select",
      "enum": { "values": ["1","2","3"], "immutable": true } }   // AI đặt LABEL, KHÔNG đổi VALUE
  ],

  "hiddenColumns": ["OrderId", "RowVer", "CreatedOn", "TenantId"],  // AI KHÔNG THẤY chi tiết
  "listViewCandidates": { "sortable": ["CreatedOn", "OrderId"], "filterable": ["StatusId", "CreatedOn"] },
  "widgetCatalog": ["Text","Textarea","Number","Select","Radio","Checkbox","Date","DateTime","Chips","Cards","File"]
}
```

> ⛔ **Envelope KHÔNG được truyền qua tool-result**: `serializeToolResult` cắt **3000 ký tự**, `slimDeep` cắt **chuỗi 600** và ⭐ **mảng còn 50 phần tử** (`tools.ts:462`, `:477`, `:479`) — **im lặng**. Bảng >50 cột hôm nay **đã** khiến AI nhận thiếu cột mà không có dấu hiệu nào. ⇒ envelope đi trong **system/user message** + **chia lô** (`batchIndex/batchCount`).

### 6.3 Hợp đồng RA — `Blueprint` (AI trả, JSON thuần)

```jsonc
{
  "blueprintVersion": "1.0",
  "profileHash": "sha256:9f2c…",                 // phải khớp envelope — lệch ⇒ E-PROFILE-STALE
  "form": {
    "title": "Đơn hàng",
    "sections": [{ "id": "s1", "title": "Thông tin khách", "fields": ["customer_id", "note"] }],
    "fields": [
      { "key": "customer_id", "type": "Select", "label": "Khách hàng",
        "placeholder": "Gõ tên khách hàng…", "helpText": "", "order": 1 }
    ]
  },
  "columnMap": [
    { "fieldKey": "customer_id", "column": "CustomerId", "direction": "write" }
  ],
  "enumLabels": [
    { "column": "StatusId", "labels": { "1": "Chờ xử lý", "2": "Đang giao", "3": "Hoàn tất" } }
  ],
  "listView": { "columns": ["CreatedOn", "CustomerId", "TotalAmount"], "defaultSort": { "column": "CreatedOn", "dir": "desc" } },
  "hiddenFields": [],
  "questionsForAdmin": [
    { "about": "CreatedOn", "question": "Giá trị lưu là giờ UTC hay giờ địa phương?" }
  ],
  "reasons": [{ "about": "customer_id", "why": "FK tới Customers, bảng lớn → typeahead" }]
}
```

> **Không có key nào chứa `sql / ddl / insertSql / optionsSql / connectionKey / table`** — validator **reject** nếu có.

### 6.4 VALIDATOR (server = uy quyền; client chỉ để retry)

> ⛔ **Phải chạy ở SERVER, và chạy lại Ở MỖI SUBMIT** — vì `SchemaJson` được nhận **nguyên văn từ client** (`MegaFormController.cs:407`). Validator chỉ ở builder = **hình thức**.

| Mã | Điều kiện reject |
|---|---|
| `E-JSON-PARSE` | Output không parse được JSON |
| `E-PROFILE-STALE` | `profileHash` lệch profile hiện hành |
| `E-SQL-EMITTED` | Bất kỳ key/giá trị nào chứa `sql`, `ddl`, `insertSql`, `optionsSql`, `SELECT `, `INSERT `, `CREATE ` |
| `E-COLUMN-UNKNOWN` | `columnMap[].column` ∉ envelope.columns |
| `E-COLUMN-HIDDEN` | Tham chiếu cột trong `hiddenColumns` |
| `E-MAP-DUP` | 2 field ghi vào cùng 1 cột |
| `E-MAP-IDENTITY-WRITE` | Ghi vào cột identity |
| `E-MAP-COMPUTED-WRITE` | Ghi vào cột computed |
| `E-MAP-ROWVERSION-WRITE` | Ghi vào rowversion |
| `E-MAP-PK-WRITE` | Ghi vào cột khoá khi `key.strategy ≠ userSupplied` |
| `E-MAP-IMMUTABLE` | `direction = write/readwrite` trên cột `immutable` |
| `E-REQ-MISSING` | Cột `mustSupplyOnInsert = true` không có field nào map write |
| `E-REQ-WRONG` | `field.required` ≠ `column.required` |
| `E-TYPE-INCOMPAT` | `field.type` ∉ `allowedWidgets` |
| `E-WIDGET-UNKNOWN` | `field.type` ∉ `widgetCatalog` (⚠️ `WIDGET_CATALOG` hiện là **dead code**, `normalizeFieldType` chỉ alias rồi trả nguyên chuỗi ⇒ type bịa **đang lọt** tới renderer thành ô text trống) |
| `E-LEN-OVERFLOW` | `validation.maxLength > column.maxLength` |
| `E-OPTION-UNKNOWN` | `enumLabels` thêm/bớt/đổi **value** |
| `E-FK-UNCONFIRMED` | Bind Select/lookup vào FK `name-heuristic` chưa admin-confirm |
| `E-SORT-NOT-INDEXED` | `listView.defaultSort.column` ∉ `sortable[]` |
| `E-ACTION-NOT-ALLOWED` | Action ∉ `allowedActions` (vd Edit khi `insertonly`) |
| `E-ROWNUM-KEY` | Đề xuất `ROW_NUMBER()` / `%%physloc%%` làm khoá |
| `E-WRITE-ON-READONLY` | Bất kỳ `direction: write` khi `mode = readonly` |

### 6.5 Vòng lặp retry

```csharp
Blueprint RunAiOnRails(Envelope env, int maxRetries = 3) {
    var history = new List<Msg> { System(recipe), User(env) };
    for (int i = 0; i <= maxRetries; i++) {
        var raw  = Llm.Call(history);
        var errs = Validator.Validate(raw, env);          // SERVER-side
        if (errs.Count == 0) return raw;

        Kb.LogFeedback(errs);                             // tái dùng MF_AI_KB_Feedback
        history.Add(Assistant(raw));
        history.Add(User(Json(new {                       // ⭐ đẩy NGƯỢC lỗi vào history
            validatorErrors = errs.Select(e => new { e.Code, e.Path, e.Expected, e.Got }),
            instruction = "Trả lại TOÀN BỘ JSON đã sửa. Không xin lỗi, không giải thích."
        })));
    }
    return DeterministicFallback(env);   // ⭐ label = prettify(columnName), widget = defaultWidget
}                                        //     ⇒ tính năng KHÔNG BAO GIỜ phụ thuộc model
```

> **Hiện trạng**: **KHÔNG CÓ** vòng nào như vậy — provider chỉ retry HTTP 429; chat chỉ re-ask **1 lần** khi AI trả văn xuôi; lỗi op chỉ in ra DOM + log fire-and-forget, **KHÔNG BAO GIỜ quay lại model**.

### 6.6 CỔNG DRY-RUN (bắt buộc trước Publish)

- Máy **tự sinh** `sampleData` từ column facts (**không** để AI sinh): text→`MF_DRYRUN`, int→0, decimal→0, date→`utcnow`, guid→`NewGuid()`, bit→0.
- Chạy đủ chuỗi: `BEGIN TRAN` → INSERT parent (+1 child giả nếu W4) → lấy khoá → UPDATE `WHERE 1=0` → DELETE `WHERE 1=0` → **`ROLLBACK` trong `finally`**.
- **Nút Publish bị KHOÁ** đến khi `dryRun.ok`.
- Kết quả ghi ngược vào profile (INSERT denied ⇒ hạ `readonly`) và **hiển thị cho admin**: *"INSERT ok (1 dòng, đã hoàn tác) · UPDATE ok · identity seed +1 · 2 trigger đã fire"*.
- ⚠️ **Rollback KHÔNG hoàn nguyên identity seed và KHÔNG chặn side-effect của trigger.** Admin phải được **cảnh báo trước** và được phép **skip dry-run** (khi đó form khoá ở `readonly`).
- ⛔ **KHÔNG** đặt endpoint dry-run trên `AiToolsController` (Oqtane) — controller đó có `[IgnoreAntiforgeryToken]` **ở class level** (vi phạm CLAUDE.md §4) ⇒ một endpoint **ghi** (dù rollback) vào bảng production của khách sẽ **không có antiforgery** → CSRF kích hoạt trigger/mail + đốt identity seed. Dùng mẫu đúng: `[Authorize(Policy = "EditModule")]` trên `MegaFormController`.

---

## 7. BLOCKER CỨNG + QUYẾT ĐỊNH KIẾN TRÚC

### 7.1 Tám blocker (phải xử lý trước/trong lộ trình)

| # | Blocker | Bằng chứng | Xử trí |
|---|---|---|---|
| **B1** | **ĐỊNH TUYẾN ID** — route detail/status/delete **chỉ mang `submissionId`**, và `formId` được **suy ra TỪ dòng vừa đọc** (chicken-and-egg) ⇒ **không thể** chọn repository theo form; và nếu id đến từ bảng khách thì **va chạm với `MF_Submissions`** → mở/ghi **nhầm bản ghi**, im lặng. | `MegaFormController.cs:2388-2392`; `ICoreInterfaces.cs:32,38,39,40`; `platform.ts:46-50` | **§7.2 — anchor row** (id do MegaForm cấp ⇒ va chạm = 0, **không đổi route, không đổi TS**) |
| **B2** | **DI SWAP KHÔNG ĐỦ** — DNN `new` thẳng repo **2 chỗ**; và ≥12 consumer khác nhận `ISubmissionRepository` qua DI (WorkflowEngine, EmailSummary, Blog, DataRepeater, FieldOptions, AdminRecordShell, Starters…) ⇒ swap toàn cục sẽ **đổi hành vi mọi form**. | `MegaFormApiController.cs:1912`, `:2194`; `Startup.cs:75`; `Program.cs:34`; `MegaFormAspNetCoreExtensions.cs:185` | **Decorator/router theo `formId`** (không swap), + **sửa 2 call-site DNN**. |
| **B3** | **KHÔNG ĐƯỢC tái dùng `FormDatabaseInsertService`** làm writer: fail-soft nuốt lỗi, guard cấm mọi verb ngoài INSERT (**không** thể `INSERT…; SELECT SCOPE_IDENTITY()`), trả `ex.Message`. **Guard này là hàng rào chống statement-stacking cho endpoint nhận SQL THÔ TỪ CLIENT** (`Field/TestInsert`) ⇒ **nới guard = mở lại [SecFix P1-5]**. | `FormDatabaseInsertService.cs:106-110`, `:203-221`; `MegaFormController.cs:1418-1419` | Viết `ExternalTableWriter` **MỚI** (SQL 100% server-sinh, không đi qua guard). **CẤM đụng guard.** |
| **B4** | **`UPDATE` KHÔNG `WHERE`** + `_safeIdent` cấm dấu chấm + bracket MSSQL-only | `DatabaseNodeExecutor.cs:264-266`, `:30-31`, `:236` | Ident-builder MỚI (2 phần `[schema].[table]`, provider-aware) + **`throw` khi `wheres.Count == 0`**. |
| **B5** | **500k KHÔNG ĐỌC ĐƯỢC qua contract hiện tại**: `List()` không có sort/column-filter; clamp `PageSize ≤ 250` (Export xin 10.000 → **nhận 250, im lặng**); filter/sort 100% client. | `ICoreInterfaces.cs:34-37`; `SubmissionQueryService.cs:35`; `SubmissionsShell.ts:991` | **Interface đọc RIÊNG** `IExternalRecordSource` (sort + column filter + keyset) — **không ép qua `ISubmissionRepository.List`**. Export = streaming riêng. |
| **B6** | **PAGER numbered-only**: `totalPages = ceil(totalCount/pageSize)`, `totalCount \|\| 0` ⇒ `totalPages = 1` ⇒ **Next disabled vĩnh viễn** | `SubmissionsShell.ts:1338`, `:1362`, `:1803` | Approximate-count + keyset **đòi pager mới**. Ship OFFSET-clamped trước, keyset sau. |
| **B7** | **CLIENT ĐÈ ĐƯỢC SYSTEM VALUE** (lỗ **hiện tại**, không phải rủi ro tương lai): người submit POST thêm field tên `_createdBy`/`_portalId`/`_ipAddress` là **đè** giá trị server | `LifecycleRunner.cs:246-251` (nạp `formData` trước, `Set()` chỉ khi **chưa có** key) | **Đảo precedence** (server LUÔN thắng) + **strip mọi key `_*` từ client** — **điều kiện tiên quyết** trước khi mở rộng System Value Binding (W3), nếu không = **cross-tenant write**. |
| **B8** | **AI CÓ THỂ CHẠY DDL TRÊN DB KHÁCH**: `connectionKey` lấy **từ body request** rồi mở chính connection đó; guard cho phép `CREATE INDEX` / `ALTER TABLE ADD` / `INSERT` | `AiToolsController.cs:790`, `:817`; `SqlDdlGuard.cs:165`, `:185`, `:191` | **Allowlist `connectionKey` = DB của site**; **reject** mọi key thuộc external/customer. (Twin Oqtane hardcode `OpenDashboardConnection()` ⇒ lỗ này **DNN-only**.) **Fix ở call-site + registry, KHÔNG thêm cờ vào `SqlDdlGuard.Inspect`** (nó là static string parser, không biết gì về connection). |

**Blocker phụ (phải fix cùng lô bảo mật):** `Field/Options` ẩn danh (`MegaFormController.cs:46-48`, `:1288-1289`) · `normalizeExplicitUrl` không lọc scheme (`file-links.ts:81-95`) · `filePath` thắng `fileUrl` (`file-links.ts:184`) · `ex.Message` ra client (`FormDatabaseInsertService.cs:109`, `:183`).

### 7.2 ⭐ QUYẾT ĐỊNH: **KHÔNG đổi contract. Dùng ANCHOR ROW + `MF_ExternalRowMap`.**

#### Phương án bị **BÁC BỎ** — đổi kiểu `SubmissionId` (int → string/long)

| Blast radius | Chi tiết |
|---|---|
| EF model | `MegaFormDbContext.cs:81` `HasKey(SubmissionId)`; index `:87`; `MF_SubmissionValues` `:92-93`; `MF_Files` `:98-99`; `MF_SubmissionLinks` `:151-152`; + `MF_WorkflowCases`, `MF_WorkflowTasks`, `MF_WebhookLog`, Quiz |
| Raw SQL | `Phase2Repository.cs:764`, `:782` (`INNER JOIN MF_Submissions … = sl.ChildSubmissionId`) |
| Interface | `ICoreInterfaces.cs:31-42` — 8 method |
| Client | `platform.ts:46-50` + 3 adapter + `submission-detail.ts:224` + `SubmissionsShell.ts:1157`, `:1307`, `:1023` |
| **Migration** | Đổi kiểu **PK INT IDENTITY** ⇒ **rebuild offline MỌI bảng con** trên **DB PRODUCTION của MỌI khách đang chạy** |
| Đo được | `SubmissionId` ~**680 lần / 118 file `.cs`**; `submissionId` ~**226 lần / 35 file `.ts`** |

➡️ **Chi phí KHÔNG tương xứng, và nó phá vỡ mọi cài đặt MegaForm đang chạy chỉ để phục vụ một tính năng mới.** ❌

#### Phương án **ĐƯỢC CHỌN** — ANCHOR ROW

```sql
-- Entity EF (bảng mới ⇒ xuất hiện trên fresh install qua GenerateCreateScript;
--            ⚠️ site NÂNG CẤP phải chạy DDL tay — Oqtane KHÔNG chạy thân Up())
CREATE TABLE MF_ExternalRowMap (
    SubmissionId  INT            NOT NULL PRIMARY KEY,   -- = MF_Submissions.SubmissionId (ANCHOR)
    FormId        INT            NOT NULL,
    RowKeyHash    BINARY(32)     NOT NULL,               -- SHA256(FormId ⟂ RowKeyJson)
    RowKeyJson    NVARCHAR(900)  NOT NULL,               -- JSON array theo key_ordinal
    FirstSeenUtc  DATETIME2      NOT NULL,
    CONSTRAINT UQ_MF_ExtRowMap UNIQUE (FormId, RowKeyHash)   -- ⚠️ khai qua EF HasIndex, KHÔNG qua migration Up()
);
CREATE INDEX IX_MF_ExtRowMap_Form ON MF_ExternalRowMap(FormId) INCLUDE (RowKeyJson);
```

**Vì sao phương án này thắng (5 lý do, mỗi lý do có bằng chứng):**

| # | Lý do | Bằng chứng |
|---|---|---|
| 1 | **Va chạm id = 0** — `SubmissionId` do `MF_Submissions` IDENTITY cấp ⇒ **một không gian id duy nhất** ⇒ route `GET Submissions/{id}` (không có formId) vẫn resolve đúng form. | `MegaFormController.cs:2388-2392` |
| 2 | **Submission-links / workflow / tasks vẫn chạy** — `INNER JOIN MF_Submissions` tìm thấy anchor row. (Nếu không có anchor: **trả rỗng ÂM THẦM**, không lỗi.) | `Phase2Repository.cs:764`, `:782` |
| 3 | **Files không rò chéo form** — `GetDetail` luôn `_files.GetBySubmission(submissionId)`; id thuộc MegaForm ⇒ đúng. | `SubmissionQueryService.cs:120` |
| 4 | **Status / Read / Archive / ModifiedBy có sẵn chỗ** trên anchor ⇒ **không cần sidecar mới, không đụng DDL bảng khách** (đáp ứng T4/E3). | `EntityModels.cs:71-77` |
| 5 | **0 thay đổi** `ICoreInterfaces`, **0 thay đổi route**, **0 thay đổi TS contract** (`submissionId: number` giữ nguyên). | `ICoreInterfaces.cs:29-43`; `SubmissionsShell.ts:1307` |

**Blast radius của phương án được chọn:**

| Hạng mục | Chi tiết |
|---|---|
| Bảng mới | `MF_ExternalRowMap`, `MF_ExternalBinding`, `MF_ExternalWriteLog` (idempotency) — entity EF ⇒ fresh install OK; **site nâng cấp cần DDL tay** |
| Code mới | `TableCapabilityProbe`, `SqlRelationalSchemaReader`, `ExternalTableQueryService`, `ExternalTableWriter`, `ExternalRowKeyMapper`, `ExternalTableDryRunner`, `ExternalTableMappingValidator`, `IndexAdvisor` |
| Code sửa | Decorator `ISubmissionRepository` (3 DI point) + **2 call-site DNN** (`:1912`, `:2194`) + tách `SubmissionProcessor.ProcessAsync` thành `Validate/Enforce` ↔ `Persist` |
| UI | Capability flags xuống payload; wire `availableActions` (kênh per-row **đã có**, `SubmissionsShell` **chưa đọc**); pager mode `cursor` |
| **KHÔNG đụng** | `ICoreInterfaces`, `EntityModels.SubmissionInfo`, route, `platform.ts`, adapter |

**Ràng buộc bắt buộc đi kèm:**
1. Anchor `DataJson` = `{}` — **KHÔNG BAO GIỜ** dùng làm nguồn dữ liệu nghiệp vụ (list/detail đọc **live** từ bảng khách).
2. Anchor row phải bị **loại khỏi mọi truy vấn "All Forms"** (`aggregatable = false`).
3. `SubmittedOnUtc` của anchor lấy từ `timeColumn` nếu có, **không hiển thị** (projection ghi đè).
4. Lazy get-or-create theo lô ≤ `pageSize`, bọc `try/catch`, idempotent qua `UNIQUE(FormId, RowKeyHash)`.
5. ⛔ **`ExternalKey` KHÔNG được lưu trong `DataJson`** — `DataJson` bị client ghi đè toàn bộ qua `Submissions/UpdateData` ⇒ sửa được `__mf_external_key` = **trỏ MegaForm sang dòng khác của khách**; và nó sẽ **lọt ra cột all-forms + CSV export**.

---

## 8. LỘ TRÌNH (mỗi pha **ship được**)

> Ước lượng: **1 dev full-time**, đã tính QA pixel + 3-4 platform twins.

### ~~**P-SEC**~~ — ❌ **BỎ khỏi đường găng** (quyết định owner 2026-07-11, xem §0.0)
Owner chấp nhận rủi ro với các lỗ của **luồng cũ** (AI/`ExecuteDdl` DNN, `Field/Options` ẩn danh, `file-links` scheme, `ex.Message`) vì tính năng mới **không cấp cho AI đường ghi nào**.
**Ngoại lệ bắt buộc:** B7 (`LifecycleRunner.cs:246-251` — client đè `_createdBy`/`_portalId`) **phải fix bên trong P3**, vì nó nằm trên **đường submit runtime** sẽ ghi vào bảng production của khách, không phải trên đường thiết kế form.

### **P0 — Nền móng probe** — **5–7 ngày**
- `SqlRelationalSchemaReader` (schema-qualified, đa provider, L2/L1/L0) — **file mới**, không đụng `SqlSchemaReader` (đang được Subform + AiTools dùng).
- `TableCapabilityProbe` P0–P16 + `MF_ExternalBinding` + Capability Profile JSON + `profileHash`.
- Nâng prior-art DNN (`AiToolsController.cs:1624-1625`) lên Core, bỏ hardcode `"dbo."`.
- UI: wizard "Chọn bảng" + **Capability Card** (mode, lý do, cảnh báo).
**Ship:** admin chọn bảng → thấy **profile + mode + lý do**, chưa có form/dashboard. Có giá trị chẩn đoán ngay.

### **P1 — DASHBOARD READONLY trên bảng khách 500k** — **8–12 ngày**
- `MF_ExternalRowMap` + `ExternalRowKeyMapper` (lazy anchor, batch, idempotent).
- `IExternalRecordSource` + `ExternalTableQueryService`: **server-side** sort/filter/paging (OFFSET + `maxOffset` clamp), approximate/bounded count, timeout phân tầng.
- Decorator `ISubmissionRepository` + **sửa DNN `:1912`, `:2194`**.
- Capability flags xuống payload; wire `availableActions` vào `SubmissionsShell`; ẩn Edit/Delete/All-Forms; `hasTimestamp/hasStatus` → ẩn cột.
- Status/Read/Archive trên **anchor**.
**Ship:** **dashboard đọc 500k dòng thật của khách**, lọc/sắp xếp/xuất — chưa ghi. **Đây là giá trị lớn nhất, sớm nhất.**

### **P2 — AI ON-RAILS sinh form + columnMap** — **5–7 ngày**
- `Envelope` (chia lô, **không** qua tool-result), `Blueprint`, `ExternalTableMappingValidator` (server), retry loop N=3, deterministic fallback.
- Seed `prompt_recipe: form-on-existing-table` + 3 `prompt_rule` — ⚠️ **qua `ai-knowledge-seed.json`**, KHÔNG qua migration (Oqtane không chạy `Up()`).
- Sửa `ClassifyExternalUiType` (guid/lob/unsupported/file) + `WIDGET_CATALOG` thành whitelist **thật**.
**Ship:** AI sinh form + mapping **đúng 100% hoặc bị máy chặn** — không bao giờ sai âm thầm.

### **P3 — INSERTONLY (ghi vào bảng khách)** — **8–12 ngày**
- `ExternalTableWriter` (SQL server-sinh, allowlist cột, `omitFromInsert`, `serverFill`, `ValueCoercer`, `DbType/Precision/Scale`).
- Key retrieval: `OUTPUT … INTO @k` / `SCOPE_IDENTITY` / preAssigned / businessKeyLookup (theo K/W).
- **Tách `SubmissionProcessor.ProcessAsync`** → `Validate/Enforce` (không persist) → ghi bảng khách → persist anchor. **BỎ FAIL-SOFT** (ghi bảng khách lỗi ⇒ **400/500 cho user**, KHÔNG tạo submission giả).
- `ExternalTableDryRunner` + cổng Publish + SQL-error mapper (§9.1).
- Idempotency (`MF_ExternalWriteLog`).
- **Web + Umbraco: XÂY MỚI** (hiện `FormDatabaseInsertService` chỉ chạy ở Oqtane + DNN).
**Ship:** form public submit **ghi thẳng vào bảng khách**, an toàn, không mất dữ liệu âm thầm.

### **P4 — READWRITE (sửa/xoá)** — **6–9 ngày**
- Prefill form từ 1 dòng ngoài; `ExternalTableWriter.Update` (WHERE bắt buộc, `RowsAffected == 1`, rowversion ETag → 409).
- Soft-delete; `canDelete` gate 2 bước + pre-flight bảng con.
- Ngữ nghĩa file **giữ/thay/xoá** (key vắng mặt = **GIỮ NGUYÊN**, không xoá).
**Ship:** vòng đời đầy đủ trên dữ liệu thật của khách.

### **P5 — QUAN HỆ** — **8–12 ngày**
- FK reader (P8) + `RelationGraph` + admin-confirm gate; chặn polymorphic.
- Lookup nhỏ (preload có cap) / lớn (typeahead server, **auth + row-scope tenant bắt buộc**).
- `ChildRowsWriter` (parent + children **1 transaction**) → mở khoá DataGrid ghi; junction sync.
**Ship:** form nhiều bảng (cha-con, lookup) chạy thật.

### **P6 — SCALE + FILE hardening** — **8–12 ngày**
- Index Advisor (**chỉ sinh script**); Full-Text; keyset pager (state + adapter + pager UI mới); export streaming.
- File: `ExternalFileService` + endpoint serve (SequentialAccess, attachment, nosniff, IDOR guard) — **và** đường upload thật cho renderer (F0).
**Ship:** bảng 50M + cột file legacy.

| Pha | Ngày | Cộng dồn |
|---|---|---|
| P-SEC | 3–4 | 4 |
| P0 | 5–7 | 11 |
| P1 | 8–12 | 23 |
| P2 | 5–7 | 30 |
| P3 | 8–12 | 42 |
| P4 | 6–9 | 51 |
| P5 | 8–12 | 63 |
| P6 | 8–12 | **75** |

➡️ **MVP có giá trị bán được = P-SEC + P0 + P1 + P2 ≈ 21–30 ngày** (dashboard đọc 500k + AI sinh form on-rails, mode `readonly`).
➡️ **Đủ dùng cho migration thật = + P3 ≈ 30–42 ngày** (ghi vào bảng khách).

---

## 9. PHỤ LỤC

### 9.1 Bảng ánh xạ SQL error → capability / xử trí (bắt buộc có `SqlErrorToFieldErrorMapper`)

> Đọc `SqlException.Number` bằng **reflection** trên property `Number` (tiền lệ: `LifecycleRunner.cs:218-227`) để Core không phụ thuộc `System.Data.SqlClient` vs `Microsoft.Data.SqlClient`.
> ⛔ **KHÔNG trả `ex.Message` cho client** (CLAUDE.md §10) — map sang mã thân thiện, chi tiết chỉ vào log admin.

| Msg | Ý nghĩa | Suy ra | Xử trí |
|---|---|---|---|
| `229` | Permission denied | **Không có quyền** | Tắt bit tương ứng → hạ mode (fail-CLOSED) |
| `262` / `3906` | DB read-only / replica | E5 | Ép `readonly` |
| `271` | Ghi vào computed column | C1 | Loại cột khỏi INSERT/UPDATE |
| `273` | Ghi vào `timestamp/rowversion` | C1 | Loại cột |
| `334` | `OUTPUT` không `INTO` trên bảng có trigger | W1 | Chuyển `OUTPUT … INTO @k` |
| `515` | NULL vào cột NOT NULL | C2 / W3 | Thiếu `serverFill` hoặc **đang bind `DBNull` cho cột có DEFAULT** |
| `544` | `IDENTITY_INSERT` OFF | C1 | Loại cột identity |
| `547` | Vi phạm CHECK/FK | C9 / R11 | Field error thân thiện |
| `2627` / `2601` | Trùng khoá | C10 / K4 | "Mã đã tồn tại" (KHÔNG `ex.Message`) |
| `4405` / `4406` | View không updatable | E6/E7 | `readonly` |
| `8114` / `8115` | Convert / arithmetic overflow | C4 | Coercer sai / `double` thay vì `decimal` |
| `8152` | String or binary data would be truncated | C3 / F5 | Vượt `MaxLength` |
| `242` | Date out of range | C6 | `datetime` < 1753 |
| `1919` | Cột MAX không index được | C3 | Loại khỏi `sortable/filterable` |
| `7601` / `7616` | Full-text không khả dụng | S5 | Fallback prefix LIKE |
| `33299` / `206` | Always Encrypted operand | E15/E16 | Loại cột khỏi WHERE/ORDER BY |
| `530` | Vượt `MAXRECURSION` | R7 | Có chu trình → CycleGuard |
| `-2` | Timeout | S10 | "Truy vấn quá lâu — hãy thu hẹp bộ lọc" |

### 9.2 Checklist trước khi commit (bổ sung §9 `Docs/SECURITY_CODING_RULES.md`)

- [ ] SQL ghi/đọc bảng khách **100% do server sinh** từ `columnMap` (allowlist cột) — client **không** gửi tên bảng/cột/SQL.
- [ ] Không đụng `IsDangerousNonInsertQuery` (`FormDatabaseInsertService.cs:212-221`) và `_bannedRx` (`:208-210`).
- [ ] Mọi `UPDATE`/`DELETE` có `WHERE` theo rowKey + assert `RowsAffected == 1`.
- [ ] Không `ex.Message` / `ex.StackTrace` ra client.
- [ ] `connectionKey` không đến từ request body/query.
- [ ] Cột `serverFill` không lấy giá trị từ client (kể cả key bắt đầu bằng `_`).
- [ ] Enforce mode (`readonly/insertonly`) ở **SERVER**, trước `SubmissionProcessor.cs:281` — không chỉ ẩn nút.
- [ ] `profileHash` re-verify **lúc submit**, không chỉ lúc Save.
- [ ] Fix 1 nơi → rà **4 platform twins** (Oqtane / DNN / Web / Umbraco) + **2 call-site DNN** `new` thẳng repo.
- [ ] Build clean mọi target; QA cả `is-inline` **và** `is-fs` (Playwright context sạch luôn ra `is-inline`).

---

**Kết luận một câu:** Cỗ máy khả thi, nhưng **thứ tự bắt buộc** là *bảo mật → probe → đọc → AI on-rails → ghi*; và **quyết định kiến trúc duy nhất phải chốt ngay hôm nay** là **anchor row + `MF_ExternalRowMap`** (giữ `SubmissionId` INT) — mọi thiết kế "dùng thẳng PK của khách làm SubmissionId" đều dẫn tới **mở nhầm / ghi đè nhầm bản ghi, im lặng**, vì route detail/status/delete **không mang `formId`** (`MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2388-2392`).