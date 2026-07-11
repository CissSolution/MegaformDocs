# THIẾT KẾ — Form trên DB QUAN HỆ có sẵn (enterprise, table-as-storage, AI on rails)

**Ngày:** 2026-07-11 · **Bối cảnh:** khách chuyển từ hệ thống khác sang MegaForm.

**Ba quyết định khung (chốt với khách):**
1. **MegaForm DÙNG TIẾP bảng SQL đã sẵn có** làm nơi lưu trữ thật — không import 500k rows vào `MF_Submissions`.
2. Nguồn là **DB QUAN HỆ NHIỀU BẢNG** (parent + child + lookup), **MegaForm phải TỰ TÌM KHOÁ** (PK/FK/identity) và đọc lên dashboard.
3. **Giao việc thiết kế form cho AI** — nhưng AI phải **chạy trên rails**, sao cho **model rẻ (gpt-4o-mini / haiku) vẫn ra schema đúng**.

Nền tảng: `Docs/RESEARCH_20260711_Form_On_Existing_SQL_Table_500k.md` (đường ghi/đọc) + báo cáo map subform/FK/AI-rails (2026-07-11).

---

## 0. SỰ THẬT PHŨ PHÀNG — 5 giả định SAI cần biết trước khi thiết kế

Nếu không đọc mục này, kế hoạch sẽ dựa trên năng lực **không tồn tại**:

| # | Điều ai cũng tưởng đã có | Sự thật |
|---|---|---|
| S1 | "MegaForm đọc được cấu trúc bảng" | `SqlSchemaReader.ListColumns` **chỉ đọc name/type/nullable/maxLength** (`SqlSchemaReader.cs:86`). **`IsPrimary` chỉ có trên SQLite** (`:77`) — trên SQL Server luôn `false`. **`IsIdentity` không có dòng code nào gán** (`SubformModels.cs:74`). |
| S2 | "AI phân tích FK/cascade" | **Không có một dòng nào đọc `sys.foreign_keys` trong toàn repo.** Cái gọi là "SMART MULTI-TABLE ANALYSIS" chỉ là **đoạn văn trong system prompt** bảo LLM *đoán FK theo quy ước tên cột* (`ai-form-creator.ts:1403-1411`). `find_cascade_pattern` trả **KB template tĩnh**, không truy vấn DB (`AiToolsController.cs:594-605`). |
| S3 | "Chọn bảng thì AI thấy các cột" | **AI chỉ nhận TÊN BẢNG** (`ai-form-creator.ts:1398-1401`). Hàm `loadColumns()` có sẵn nhưng **chỉ để vẽ accordion trong UI** (`:707`, `:658`) — không bao giờ vào prompt. |
| S4 | "Subform ghi vào bảng con" | **KHÔNG.** Rows của DataGrid được `JSON.stringify` nhét vào **1 hidden input** (`megaform-widget-datagrid.ts:945`) rồi đi vào submission cha. `SubformSaveRequest` (`SubformModels.cs:100`) **không controller nào dùng**; DNN doc hứa `POST /Subform/Save` (`SubformController.cs:26`) — **action đó không tồn tại**. |
| S5 | "Có catalog widget để AI bám vào" | `widget-catalog.gen.ts` (52 widget, `:11`) — **KHÔNG file nào import**. Rail đã dựng nhưng **chưa cắm dây**. |

**Hệ quả:** rails hiện tại **rất mạnh về layout/CSS/widget** (8 prompt recipe, KB 350+ entry, ASK-DESIGN gate) nhưng **gần như bằng 0 về DATA/SCHEMA quan hệ**. Muốn "AI rẻ thiết kế đúng", phải xây rail DATA trước.

---

## 1. NGUYÊN TẮC

> **DB của khách là nguồn sự thật. MegaForm là UI + engine.**
> **Cấu trúc quan hệ do SQL nói ra (deterministic), KHÔNG do AI đoán. AI chỉ thiết kế phần con người nhìn thấy.**

1. Không nhân đôi dữ liệu: submit → `INSERT` thẳng bảng khách; sửa → `UPDATE` đúng row.
2. `SubmissionId` := **PK bảng gốc** (yêu cầu: int/bigint identity; GUID/composite → cần bảng map).
3. **SQL do server sinh**, không bao giờ nhận SQL từ client — tái dùng khuôn `DatabaseNodeExecutor.BuildInsertCommand/BuildUpdateCommand` (`DatabaseNodeExecutor.cs:221-267`, identifier qua regex `_safeIdent` `:294-300`, value parameterized).
4. Bảng/cột được động tới = **whitelist trong binding config**; client chỉ gửi `formId` + values.
5. **Không fail-soft**: đường ghi hiện nuốt lỗi âm thầm (`FormDatabaseInsertService.cs:106-110`) — với table-as-storage, INSERT lỗi = **mất submission**, phải trả lỗi.

---

## 2. KIẾN TRÚC 3 TẦNG (rail cho AI nằm ở tầng 1–2)

```
  ┌─ Tầng 1 — SỰ THẬT (deterministic, C#, không AI) ───────────────────────┐
  │  SqlRelationalSchemaReader   → PK, FK, identity, computed, unique,     │
  │                                CHECK, maxLength, row-count, index      │
  │  RelationGraphBuilder        → TableGraph: root / child(1-N) /         │
  │                                lookup(N-1) / junction(M-N)             │
  │  FormBlueprintProposer       → Blueprint: tableBinding + field         │
  │                                candidates + mapping report             │
  └────────────────────────────────────────────────────────────────────────┘
                                   ↓ facts (không phải gợi ý)
  ┌─ Tầng 2 — AI ON RAILS (thiết kế phần người dùng nhìn thấy) ────────────┐
  │  Được phép: nhãn, placeholder, help text, i18n, gom section/step,      │
  │             thứ tự, chọn widget (Select vs Chips vs Cards), ẩn cột phụ │
  │  CẤM: bịa field.key, bịa cột, bịa bảng, bịa quan hệ, đổi kiểu dữ liệu  │
  └────────────────────────────────────────────────────────────────────────┘
                                   ↓ schema đề xuất
  ┌─ Tầng 3 — KIỂM CHỨNG (máy chấm, AI không được bỏ qua) ─────────────────┐
  │  SchemaVsTableValidator  → field ↔ column, type, required, identity    │
  │  DryRunWrite (tx + ROLLBACK) → INSERT/UPDATE thử cả parent + child     │
  │  Retry loop: lỗi → nhét lại vào history → model sửa (tối đa 3 vòng)    │
  └────────────────────────────────────────────────────────────────────────┘
```

**Tại sao model rẻ vẫn đúng:** model không phải *khám phá* cấu trúc (việc dễ sai nhất) — cấu trúc được máy đưa sẵn. Model chỉ làm việc ngôn ngữ (đặt nhãn, nhóm bước), và mọi output đều bị **máy chấm lại** với thông báo lỗi cụ thể để tự sửa.

---

## 3. TẦNG 1 — SỰ THẬT

### 3.1 `SqlRelationalSchemaReader` (mở rộng `SqlSchemaReader.cs`)

Đọc thêm (SQL Server; giữ nhánh provider cho SQLite/PG/MySQL như reader hiện tại):

| Metadata | Nguồn |
|---|---|
| PK + thứ tự cột khoá | `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` + `TABLE_CONSTRAINTS` |
| **FK (bảng/cột nguồn → bảng/cột đích)** | `sys.foreign_keys` + `sys.foreign_key_columns` |
| Identity / computed / rowversion | `sys.columns` (`is_identity`, `is_computed`), `sys.types` |
| Unique index | `sys.indexes` (`is_unique`) |
| CHECK constraint | `sys.check_constraints` (bóc `IN ('a','b')` → options) |
| Row-count ước lượng | `sys.dm_db_partition_stats` (phân loại lookup vs fact) |

> Đã có tiền lệ đọc `sys.columns` + `is_identity` trong repo (`AiToolsController.cs:1623-1629`) — dùng lại đúng cách truy vấn đó.

### 3.2 `RelationGraphBuilder` — phân loại bảng (deterministic)

| Vai trò | Quy tắc |
|---|---|
| **root** (bảng gốc của form) | Admin chọn — hoặc bảng có nhiều FK trỏ **đến** nó nhất và row-count lớn |
| **child (1-N)** | Bảng có FK **trỏ tới root**, FK NOT NULL → hiển thị dạng **DataGrid/subform** (comments, attachments) |
| **lookup (N-1)** | root có FK **trỏ tới** bảng đó, bảng đích ít cột + row-count nhỏ → **Select** với option-source SQL (`Priorities`, `Categories`) |
| **junction (M-N)** | Bảng chỉ gồm 2 FK + PK ghép → **multi-select** |
| **self-ref** | FK trỏ về chính nó → cảnh báo, không tự sinh (tránh đệ quy) |

### 3.3 `FormBlueprintProposer` — blueprint (chưa cần AI)

Từ TableGraph sinh ra:
- `tableBinding` (xem §4) cho root + từng child.
- Field candidates: bỏ identity/computed/rowversion/audit (`CreatedOn/ModifiedBy`…); `NOT NULL` không default → `required:true`; `nvarchar(n)` → `maxLength`; FK→lookup → `Select` + optionsSql; CHECK IN → options tĩnh; cột path/url + tên chứa `file|attach|document` → `File` (`valueMode: filePath`).
- **Mapping report** cho admin duyệt trước khi lưu (cột nào vào form, cột nào bỏ, vì sao).

---

## 4. `settings.tableBinding` — mô hình cấu hình mới

Thay `settings.databaseInsert` (INSERT-only, không PK — `FormSchema.cs:612-635`):

```jsonc
"tableBinding": {
  "enabled": true,
  "connectionKey": "LegacyTickets",     // server-side; client KHÔNG bao giờ gửi connection string
  "schema": "dbo", "table": "SupportTickets",
  "keyColumn": "TicketId", "keyIsIdentity": true,   // → SubmissionId; INSERT trả SCOPE_IDENTITY()
  "createdOnColumn": "CreatedOn",       // → SubmittedOnUtc (sort mặc định)
  "statusColumn": "Status",
  "softDeleteColumn": "IsDeleted",      // xoá = UPDATE
  "concurrencyColumn": "RowVersion",    // optimistic concurrency
  "ownerColumn": "CreatedByUserId",     // row-level: "chỉ xem ticket của mình"
  "mode": "readwrite",                  // readonly | insertonly | readwrite
  "columnMap": { "subject": {"column":"Subject"}, "cvFile": {"column":"AttachmentPath","valueMode":"filePath"} },
  "children": [                          // 1-N — do RelationGraphBuilder tìm ra, KHÔNG do AI đoán
    { "fieldKey":"comments", "table":"TicketComments",
      "parentKeyColumn":"TicketId", "keyColumn":"CommentId",
      "columnMap": { "body":{"column":"Body"}, "author":{"column":"Author"} } }
  ]
}
```

`valueMode: filePath` đóng khoảng trống: field File hiện bind ra **nguyên chuỗi JSON array** (`SubmissionFileMetaExtractor.cs:15-16`), cần extractor lấy path trước khi bind vào cột.

---

## 5. TẦNG 2 — AI ON RAILS

### 5.1 Hợp đồng đầu vào cho AI (thay cho "danh sách tên bảng")

AI nhận **blueprint đã có sự thật**, không nhận DB trần:

```jsonc
{ "root": {"table":"SupportTickets","key":"TicketId","rowCount":500000},
  "columns": [ {"name":"Subject","type":"nvarchar(200)","nullable":false,"uiType":"text"}, … ],
  "lookups": [ {"column":"PriorityId","refTable":"Priorities","refKey":"Id","refLabel":"Name"} ],
  "children": [ {"table":"TicketComments","fk":"TicketId","columns":[…]} ],
  "allowedWidgetTypes": [ … 52 type từ WIDGET_CATALOG … ] }
```

**Việc của AI (đúng phần "thiết kế"):** nhãn tiếng Việt/Anh, placeholder, help text, gom section/step (vd 3 bước: Thông tin ticket → Chi tiết → Đính kèm), thứ tự field, chọn biến thể widget (Select vs Chips vs Cards), ẩn cột kỹ thuật, mô tả form.
**AI bị CẤM:** bịa `field.key` không có cột tương ứng, bịa bảng/cột/quan hệ, đổi kiểu dữ liệu, sinh SQL tự do.

### 5.2 Rails phải **cắm dây lại** (đang có nhưng chết)

- **`widget-catalog.gen.ts` là dead code** (`:11`, không ai import) → inject `summarizeCatalogForSystemPrompt()` (`:759`) vào system prompt **và** validate `field.type ∈ catalog`.
- **`loadColumns()` không vào prompt** (`ai-form-creator.ts:707`) → đưa cột thật (kèm PK/FK/identity từ tầng 1) vào prompt.
- Thêm **prompt_recipe** `build-form-from-relational-table.md` (cùng chỗ 8 recipe hiện có — `MegaForm.DNN/Resources/PromptRecipes/`) + **prompt_rule** KB: *"cấu trúc do blueprint quyết định, không được đoán"* (chỗ này đã có tiền lệ: 2 prompt_rule tag `ai-on-rails` — `ai-knowledge-seed.json:4129,4142`).

### 5.3 TẦNG 3 — máy chấm + vòng lặp sửa (thứ làm model rẻ hội tụ)

| Cơ chế | Hiện trạng | Phải làm |
|---|---|---|
| `DryRunValidate` | **chỉ kiểm TÊN BẢNG** (`AiToolsController.cs:1027-1087`) | Thêm `SchemaVsTableValidator`: mọi `field.key` phải map tới **cột có thật**; kiểu tương thích; `NOT NULL` → `required`; identity/computed **không được** xuất hiện; `field.type` ∈ catalog |
| Dry-run **ghi** | chỉ có cho DDL (`ops-app-batch.ts:262`) | INSERT/UPDATE thử trong transaction rồi **ROLLBACK** — khuôn đã có sẵn: `FormDatabaseInsertService.TestExecute` (`:119`, rollback `:175`) → mở rộng cho child rows |
| **Retry khi AI sai** | ❌ **không có** (chỉ retry HTTP 429 — `providers.ts:570-578`); op fail chỉ log vào `MF_AI_KB_Feedback` (`ops.ts:361-374`) | **Vòng lặp**: validator trả lỗi có cấu trúc → nhét lại vào history → model regenerate (tối đa 3 vòng). **Đây là mấu chốt để model rẻ dùng được.** |
| Rollback `app_batch` | ❌ không có; DDL fail vẫn tạo form (`ops-app-batch.ts:637-639`) | Với binding vào bảng khách: **không được** tạo form nếu validate fail |

---

## 6. ĐƯỜNG ĐỌC & GHI (tóm tắt, chi tiết ở RESEARCH doc)

**Đọc — `ExternalTableSubmissionRepository : ISubmissionRepository`** (`ICoreInterfaces.cs:29-43` là abstraction **duy nhất** dashboard đi qua, facade `SubmissionQueryService.cs:31-92`):
- SELECT trên **cột thật** (WHERE/ORDER BY/OFFSET FETCH) → dùng index của khách, không LIKE trên JSON.
- Row → `SubmissionInfo` (`SubmissionId`=PK, `SubmittedOnUtc`=createdOnColumn, `DataJson`=JSON các cột).
- **Factory theo formId** (form có `tableBinding` → external repo; form thường → EF repo) — `Startup.cs:75` hiện bind cứng.
- `GetValues()` rỗng → facade **đã có fallback** dựng snapshot từ schema + DataJson (`SubmissionQueryService.cs:110-114`) ⇒ **không cần `MF_SubmissionValues`** (né luôn bug EAV 2-writer).
- Child rows: đọc **on-demand** ở tab Detail (`WHERE fk = @parentKey`), không join vào list.
- ⚠️ DNN `new` thẳng repo trong controller (`MegaFormApiController.cs:1912`) → phải sửa, swap DI không đủ.

**Ghi:**
- Submit → `INSERT` root (server sinh) + `SCOPE_IDENTITY()` → dùng key đó `INSERT` child rows **trong CÙNG transaction** → đóng luôn lỗ S4 (`Subform/Save` chưa từng tồn tại).
- Sửa row cũ → prefill từ PK + `UPDATE ... WHERE key=@id AND RowVersion=@rv`.
- Rẽ nhánh sớm: form có `tableBinding` **không ghi `MF_Submissions`**, nhưng vẫn chạy email/workflow/webhook với `SubmissionId` = PK thật.

**Truy vấn server-side (bắt buộc ở 500k):** advanced filter + sort + date-range hiện **100% client-side**, chỉ lọc 50 row của trang đang xem (`submission-advanced-filter.ts:721`; `SubmissionsShell.ts:985-991`) → ở 500k là **sai nghiệp vụ**. Phải mở rộng `SubmissionListQuery` (`SubmissionQueryModels.cs:10-19`): `sortBy`, `sortDir`, `fieldFilters[]` → đẩy xuống SQL.

---

## 7. LỘ TRÌNH

| Pha | Nội dung | Kết quả nhìn thấy | Ước lượng |
|---|---|---|---|
| **P0 — Sự thật** | `SqlRelationalSchemaReader` (PK/FK/identity/unique/CHECK) + `RelationGraphBuilder` + `FormBlueprintProposer` + mapping report UI | Chọn bảng → thấy **sơ đồ quan hệ + blueprint** MegaForm tự tìm ra | 3–4 ngày |
| **P1 — Read-only grid** | `tableBinding` + `ExternalTableSubmissionRepository` + factory theo formId + schema ảo | Dashboard hiện **đủ 500k rows cũ**, sort/lọc theo cột thật | 2–3 ngày |
| **P2 — AI on rails** | Blueprint → prompt; cắm lại `widget-catalog`; `SchemaVsTableValidator`; **retry loop**; recipe + prompt_rule mới | **Giao thiết kế form cho AI**, model rẻ vẫn ra schema hợp lệ (máy chấm) | 3–4 ngày |
| **P3 — Ghi** | INSERT root + child cùng transaction + `SCOPE_IDENTITY`; dry-run write (tx+rollback); bỏ fail-soft; `valueMode:filePath` | Form dùng được: submit ghi thẳng DB khách, kể cả bảng con | 3–4 ngày |
| **P4 — Sửa row cũ + enterprise** | Prefill + UPDATE + optimistic concurrency + soft-delete + audit; filter/sort **server-side**; keyset paging; row-level access qua `ownerColumn`; bỏ clamp 250 (`SubmissionQueryService.cs:35`) | Sửa/duyệt 500k ticket cũ; lọc đúng trên toàn bộ dữ liệu | 4–5 ngày |

**Tận dụng được ngay:** `IConnectionRegistry` (kết nối DB ngoài đã chạy thật — `DataRepeaterService.cs:127-135`); **role/permission field-visibility vừa ship** (commit `6680c90`) hoạt động ở tầng schema nên áp dụng nguyên vẹn cho form-trên-bảng-ngoài.

---

## 8. BẢO MẬT (theo `Docs/SECURITY_CODING_RULES.md`)

| Rủi ro | Biện pháp |
|---|---|
| Client chỉ định bảng/cột → đọc bảng khác | Bảng + cột **chỉ** từ `tableBinding` server-side; client chỉ gửi `formId` + values |
| SQL injection qua identifier | `_safeIdent` (`DatabaseNodeExecutor.cs:294-300`); value luôn parameterized |
| Connection string rò ra client | Chỉ nhận `connectionKey`; **không** dùng nhánh `connectionString` của `IConnectionRegistry.GetConnection` |
| Xem/sửa row người khác | `ownerColumn` → `AND ownerColumn=@actorId` cho non-admin (không dựa vào ẩn cột client) |
| Ghi đè cột nhạy cảm | Cột ngoài `columnMap` không bao giờ vào câu UPDATE; `readOnlyIf` theo role (đã ship) chặn ở cả render lẫn submit |
| Endpoint mới bị anon | ⚠️ Tiền lệ: `Subform/Compute` **đang `[AllowAnonymous]`** trên Oqtane (`SubformController.cs:158`) và không gate trên Web (`:132`) — **đừng lặp lại**; DataRepeater SQL endpoint từng rò PII vì ẩn danh |

---

## 9. RỦI RO / ĐIỂM CHẶN

1. **PK không phải int identity** (GUID/composite) → `SubmissionId` (int) không mang nổi khoá → cần bảng map `MF_ExternalKeys`. **Kiểm DDL thật của khách trước khi chốt P1.**
2. **Workflow / Approvals / Reports / submission-links** đều JOIN `MF_Submissions` (`Phase2Repository.cs:764,782`; `MegaFormController.Reports.cs:106-116`) → form table-backed **không có row ở đó**. Cách rẻ: **shadow row mỏng** (`SubmissionId`=PK ngoài, `FormId`, `Status`, không `DataJson`) chỉ tạo khi submission bước vào workflow/approval.
3. **Search 500k**: LIKE `%x%` trên cột không index = full scan → chỉ search cột có index (`LIKE 'x%'`) hoặc bật **Full-Text Index**.
4. **`COUNT(*)` exact mỗi lần list** (`EfRepositories.cs:143`) → cache/approximate khi không filter.
5. **`MF_SubmissionValues` (EAV) có 2 writer ghi 2 schema khác nhau**, lỗi bị nuốt (`SubmissionProcessor.cs:292-322` vs `SubmissionIndexerService.cs:170-171`) → **không dựa vào EAV** cho đường mới.
6. **Web + Umbraco chưa từng gọi `FormDatabaseInsertService`** → nếu khách chạy Oqtane thì OK; đừng hứa cross-platform trước khi wire.
7. **AI provider mặc định `gpt-4o`** (`providers.ts:220-224`); `claude-cli` **không hỗ trợ function-calling** → tool-loop degrade thành chat thường (`:200-202`). Model rẻ chỉ an toàn **sau khi** có tầng 3 (máy chấm + retry).

---

## 10. VIỆC KẾ TIẾP (trước khi code)

1. **Lấy DDL thật của khách** (`CREATE TABLE` + index + FK cho parent + các child) → xác nhận PK int identity, cột ngày, cột status, cột file lưu dạng gì.
2. Xác nhận **quyền DB** MegaForm được cấp (SELECT / INSERT / UPDATE).
3. Xác nhận **app khác có ghi vào bảng đó không** → nếu có, concurrency + soft-delete là **bắt buộc**.
4. Chốt P0 + P1 để demo sớm: "chọn bảng → thấy sơ đồ quan hệ → dashboard hiện 500k rows cũ".
