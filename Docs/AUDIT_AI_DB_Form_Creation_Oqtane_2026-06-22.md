# AUDIT: Tạo form bằng AI kết nối DB trên Oqtane — Các lỗi DB và liên kết form

**Ngày kiểm tra:** 2026-06-22  
**Phạm vi:** Luồng "Create with AI" / AI Form Assistant trên Oqtane, đặc biệt khi tạo **ứng dụng ~3 form có liên kết quan hệ (FK)** và kết nối **DashboardDatabase**.  
**Mục tiêu:** Không code, chỉ liệt kê toàn bộ điểm hỏng / nghi ngờ / nợ kỹ thuật dẫn đến lỗi DB, ghi rõ gốc rễ, vị trí file và đề xuất xử lý.  

---

## 1. Tóm tắt điều tra

Khi dùng AI để tạo form kết nối DB trên Oqtane, lỗi thường không nằm ở một chỗ duy nhất mà là **chuỗi lỗi xuyên suốt client → auth → endpoint → connection resolution → DDL execution → form save → relationship metadata**. Cụ thể:

| Nhóm | Số lượng | Mức độ nghiêm trọng cao nhất |
|---|---|---|
| Sai endpoint / thiếu ModuleId+SiteId | 3 | Cao |
| Connection string / provider detection | 4 | Cao |
| DDL execution (dialect, ordering, guard) | 5 | Cao |
| Relationship / FK metadata gaps | 3 | Cao |
| Form save + DatabaseInsert runtime | 4 | Trung bình–Cao |
| Auth / deployment / bundle skew | 3 | Trung bình |

**Kết luận nhanh:** Với ứng dụng 3 form có quan hệ, dù AI tạo ra đúng ý tưởng schema, **khả năng cao sẽ gặp lỗi DB ở một trong các khâu: tạo bảng sai dialect, tạo bảng con trước bảng cha vi phạm FK, gọi nhầm endpoint DNN trên Oqtane, hoặc thiếu ModuleId/SiteId dẫn đến HTTP 400**. Sau khi form được lưu, các mối quan hệ form vẫn **chỉ tồn tại ở mức SQL (FK trong bảng tùy chỉnh)**, không được ghi vào `MF_FormRelations`, nên các tính năng native link submission / cascade delete của MegaForm không hoạt động.

---

## 2. Issue Register

| # | Triệu chứng | Vị trí | Mức độ | Trạng thái |
|---|-------------|--------|--------|------------|
| 1 | AI form creator gọi nhầm endpoint DNN `Form/Save` trên Oqtane → 400 | `MegaForm.UI/src/ai-form-assistant/ops.ts:1540`, `ai-form-creator.ts:326` | **Cao** | Đã sửa trong source, cần verify bundle deploy |
| 2 | `POST /api/MegaForm/Form` bị 400 do thiếu `moduleId`/`siteId` | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:421` | **Cao** | Open (DOM fallback mới thêm, vẫn có race) |
| 3 | `DashboardDatabase` connection string không được cấu hình / không đọc per-site override | `MegaForm.Oqtane.Server/Services/Startup.cs:328`, `MegaFormController.ModuleConfigDatabase.cs:194` | **Cao** | Open |
| 4 | `AiToolsController` mặc định provider SQL Server, không sniff SQLite | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:46` | **Cao** | Open |
| 5 | AI phát sinh DDL sai dialect (ví dụ `[dbo]` trên SQLite) → "unknown database [dbo]" | `MegaForm.UI/src/ai-form-assistant/chat.ts`, `shared/ddl-dialect.ts` | **Cao** | Open (phụ thuộc prompt + AI tuân thủ) |
| 6 | Tạo bảng con trước bảng cha → FK constraint violation | `MegaForm.UI/src/dashboard/ai-form-creator.ts:1586`, `ops.ts:1890` | **Cao** | Open |
| 7 | `SqlDdlGuard` chặn multi-statement DDL hợp lệ hoặc cho phép cú pháp lạ | `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs:85` | Trung bình | Open |
| 8 | `MF_FormRelations` / `MF_SubmissionLinks` không được AI app_batch tạo ra | `MegaForm.UI/src/dashboard/ai-form-creator.ts:1539`, `ops.ts:1890` | **Cao** | Open |
| 9 | `FormDatabaseInsertService` dùng cú pháp `[schema].[table]` và `:param` → `@param`, có thể sai trên Postgres/MySQL/SQLite | `MegaForm.Core/Services/FormDatabaseInsertService.cs:81` | **Cao** | Open |
| 10 | `databaseType` rỗng trong `databaseInsert` → fallback SQL Server, lỗi với SQLite | `MegaForm.UI/src/ai-form-assistant/ops.ts:1698`, `FormDatabaseInsertService.cs:74` | **Cao** | Open |
| 11 | "Already exists" detection chỉ dựa vào chuỗi "already exist", có thể miss SQLite | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:521` | Thấp–Trung bình | Open |
| 12 | AI endpoints không được Bearer interceptor bao phủ | `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-oqtane-auth.js` | Trung bình | Open |
| 13 | Per-site DashboardDatabase override được lưu nhưng runtime không dùng | `MegaFormController.ModuleConfigDatabase.cs:188` | **Cao** | Open |
| 14 | Nuspec chỉ pack `net9.0`, project target cả `net10.0` | `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` | Thấp | Open |
| 15 | `AiAssistant/DefaultConfig` 404 nếu route/bundle cũ | Playwright log 2026-06-15 | Cao (historical) | Đã sửa, cần verify deploy |

---

## 3. Phân tích chi tiết theo nhóm

### 3.1. Sai endpoint / thiếu ModuleId + SiteId

#### Issue #1: Gọi nhầm endpoint DNN trên Oqtane

**Triệu chứng:** Trong log Playwright ngày 2026-06-15 thấy:

```
400 Bad Request @ http://localhost:5000/api/MegaForm/Form/Save
400 Bad Request @ http://localhost:5000/api/AiTools/ExecuteDdl
```

Trên Oqtane, endpoint đúng là `POST /api/MegaForm/Form`, không phải `Form/Save` (DNN).  
**Nguồn:** `MegaForm.UI/src/ai-form-assistant/ops.ts:1540` đã có logic `saveFormEndpoint()` chọn `Form` cho Oqtane; `ai-form-creator.ts:326` cũng đã chuyển sang platform-aware. Tuy nhiên log cho thấy bundle đang deploy cũ (`megaform-ai-form-assistant.js?v=20260513-01`), chưa chứa fix.

**Gốc rễ:** Không đồng bộ bundle JavaScript sau khi sửa endpoint.

#### Issue #2: 400 do thiếu `moduleId`/`siteId`

**Mã server:** `MegaFormController.SaveForm` tại `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:421`:

```csharp
if (dto.ModuleId <= 0 || dto.SiteId <= 0)
    return BadRequest(new { error = "MegaForm Oqtane save requires a valid moduleId and siteId." });
```

**Mã client:** `ai-form-creator.ts:177` có `platformCfg()` đọc từ `window.__MF_PLATFORM__`, với DOM fallback từ `#mf-dashboard-root` (`data-module-id`, `data-site-id`) được thêm gần đây. Tuy nhiên:

- DOM fallback chỉ chạy khi `mf-dashboard-root` đã render.
- Nếu AI creator mở từ builder (không phải dashboard), fallback này không tồn tại.
- `ops.ts:1715` dùng `saveFormEndpoint()` nhưng payload `formInfo` không bao gồm `ModuleId`/`SiteId` (chỉ dựa vào header/query). Nếu server không resolve được auth entity, 400 vẫn xảy ra.

**Evidence:** Log 2026-06-15 cũng có `404 /api/AiAssistant/DefaultConfig?entityid=0&entityname=Site&siteId=0`, cho thấy siteId=0 được gửi đi.

### 3.2. Connection string / provider detection

#### Issue #3: DashboardDatabase chưa được cấu hình

**Mã server:** `OqtaneConnectionRegistry.GetConnection` tại `MegaForm.Oqtane.Server/Services/Startup.cs:335`:

```csharp
var connStr = _config?.GetConnectionString(connectionName) ?? string.Empty;
if (string.IsNullOrWhiteSpace(connStr))
    throw new InvalidOperationException("Connection string 'DashboardDatabase' not found...");
```

**Ý nghĩa:** Nếu Oqtane host `appsettings.json` không có `ConnectionStrings:DashboardDatabase`, mọi lệnh AI tạo bảng (`AiTools/ExecuteDdl`, `SqlTables`, `SqlColumns`) đều throw 500/400. Không có UI wizard nào tự động tạo connection này.

#### Issue #4: AiToolsController không sniff SQLite

**Mã server:**
- `SubformController.OpenDashboardConnection` (`SubformController.cs:55`) có sniff `.db`/`SQLite` để truyền `databaseType: "sqlite"`.
- `AiToolsController.OpenDashboardConnection` (`AiToolsController.cs:46`) chỉ gọi `_connectionRegistry.GetConnection("DashboardDatabase")` không truyền `databaseType`.

**Hậu quả:** Nếu DashboardDatabase là SQLite, `AiToolsController` sẽ cố dùng `Microsoft.Data.SqlClient` và lỗi parse connection string.

#### Issue #13: Per-site DashboardDatabase override bị bỏ qua

**Mã server:** `MegaFormController.ModuleConfigDatabase.cs:188` có comment rõ ràng:

> "Persist the DashboardDatabase override to SITE settings … The runtime registry still falls back to DefaultConnection (P0-2) when no override is read — wiring the registry to consume this saved override is a documented follow-up."

**Hậu quả:** Admin có thể vào Settings → Database, lưu connection string riêng cho site, nhưng `AiToolsController`/`SubformController`/`FormDatabaseInsertService` vẫn dùng connection string toàn cục.

### 3.3. DDL execution — dialect, ordering, guard

#### Issue #5: DDL sai dialect

**Mã server:** `AiToolsController.DbProvider` (`AiToolsController.cs:232`) trả về provider (`sqlite`/`mysql`/`postgresql`/`sqlserver`). Client có `ddl-dialect.ts` và prompt trong `ai-form-creator.ts:78`, `chat.ts:312` yêu cầu AI phát sinh đúng dialect.

Tuy nhiên:
- AI (đặc biệt model rẻ / context ngắn) có thể vẫn phát sinh MSSQL `[dbo].[Table] IDENTITY(1,1)`.
- `SubformController.ApplyDdl` (`SubformController.cs:212`) chạy DDL raw; nếu `[dbo]` xuất hiện trên SQLite, lỗi là `unknown database [dbo]`.
- `AiToolsController.ExecuteDdl` (`AiToolsController.cs:468`) cũng chạy raw sau khi qua `SqlDdlGuard`, không dịch dialect.

#### Issue #6: Tạo bảng con trước bảng cha vi phạm FK

**Mã client:** `ai-form-creator.ts:1586` và `ops.ts:1890` chạy DDL theo thứ tự `tables` array từ AI. Nếu AI trả về:

```json
[
  { "ddl": "CREATE TABLE Orders (..., FOREIGN KEY REFERENCES Customers(Id))" },
  { "ddl": "CREATE TABLE Customers (...)" }
]
```

thì `Orders` được tạo trước `Customers` → SQLite/SQL Server đều báo FK violation. Không có bước topological sort.

#### Issue #7: SqlDdlGuard chặn hoặc cho phép không đúng

**Mã server:** `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs:85`.

- Guard chỉ cho phép 1 statement. AI có thể phát sinh `CREATE TABLE ...; CREATE INDEX ...;` trong cùng một string → bị chặn.
- Guard dùng regex đơn giản, không parse AST; có thể chặn DDL hợp lệ hoặc miss obfuscation.

### 3.4. Relationship / FK metadata gaps

#### Issue #8: Không tạo `MF_FormRelations`

MegaForm có engine quan hệ native qua `MF_FormRelations` + `MF_SubmissionLinks` (migration `01050200_AddAppFoundation.cs:22`, entity builder `FormRelationEntityBuilder.cs:14`). Engine này được dùng bởi:

- `ConfiguredAppStarterService` (`MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs:261`)
- `SubmissionProcessor.TryAutoLinkSubmission` (`SubmissionProcessor.cs:404`)

Tuy nhiên, luồng AI app_batch (`ai-form-creator.ts:1539`, `ops.ts:1890`) chỉ:
1. Chạy DDL tạo bảng.
2. Tạo từng form riêng lẻ.
3. Auto-wire field thành SQL-backed Select cho FK.
4. Gắn `databaseInsert` để INSERT vào bảng tùy chỉnh.

**Không có bước nào gọi `SaveFormRelation` hoặc `LinkSubmissions`.** Kết quả:
- Quan hệ chỉ tồn tại ở SQL FK constraint (nếu AI tạo đúng).
- `SubmissionProcessor.TryAutoLinkSubmission` không tìm thấy relation metadata → không tự động link submission.
- Dashboard / inbox không hiển thị “Parent → Children” vì không có `MF_FormRelations`.
- Xóa parent submission không cascade đến child (trừ khi DB engine tự cascade theo FK).

### 3.5. Form save + DatabaseInsert runtime

#### Issue #9: `FormDatabaseInsertService` dùng cú pháp SQL Server-centric

**Mã server:** `MegaForm.Core/Services/FormDatabaseInsertService.cs:81`:

```csharp
cmd.CommandText = _paramRx.Replace(cfg.InsertSql, "@$1");
```

AI tạo insert SQL dạng:

```sql
INSERT INTO [dbo].[Customers] ([FullName], [Email]) VALUES (:fullName, :email)
```

- `[dbo].[Customers]` là SQL Server syntax. Trên Postgres/SQLite/MySQL cần `"schema"."table"`, `` ` `` hoặc không có schema.
- Chuyển `:param` → `@param` đúng với SqlClient, SQLite chấp nhận cả hai, nhưng Postgres ưa `:param` hoặc `@param` tùy driver; MySQL dùng `?param` hoặc `@param`.

#### Issue #10: `databaseType` rỗng

**Mã client:** `ops.ts:1698` và `ai-form-creator.ts:1712` để `databaseType: ''` trong `databaseInsert`.  
**Mã server:** `FormDatabaseInsertService.cs:74`:

```csharp
using (var conn = _registry.GetConnection(cfg.ConnectionKey, cfg.DatabaseType, null))
```

`OqtaneConnectionRegistry.ResolveProviderInvariantName` với `databaseType = ""` trả về `Microsoft.Data.SqlClient`. Nếu DashboardDatabase là SQLite → lỗi.

### 3.6. Auth / deployment

#### Issue #11: "Already exists" detection

`AiToolsController.ExecuteDdl` (`AiToolsController.cs:521`):

```csharp
bool alreadyExists = (exInner.Message ?? "").IndexOf("already exist", StringComparison.OrdinalIgnoreCase) >= 0;
```

SQLite báo `table ... already exists` nên vẫn match, nhưng một số locale/driver có thể dùng từ khác (`is duplicated`, `exists`).

#### Issue #12: Bearer interceptor không bao phủ AI endpoints

`megaform-oqtane-auth.js` chỉ patch fetch cho `/api/MegaForm/`. AI endpoints (`/api/AiTools/`, `/api/AiAssistant/`) dựa vào cookie auth. Nếu Oqtane host cấu hình strict Bearer, AI calls sẽ 401.

#### Issue #14: Nuspec chỉ pack net9.0

`MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` tham chiếu `bin\Release\net9.0\*.dll`, trong khi project target `net9.0;net10.0` và package csproj target `net10.0`. Có thể gây lỗi loader nếu host là .NET 10.

#### Issue #15: Bundle cũ chưa chứa fix

Log Playwright 2026-06-15 cho thấy bundle `megaform-ai-form-assistant.js?v=20260513-01` đang chạy, trong khi source đã có nhiều fix (endpoint, ModuleId/SiteId). Điều này giải thích tại sao source đã "đúng" nhưng production vẫn lỗi.

---

## 4. Các lỗi DB cụ thể có thể gặp khi tạo 3 form liên kết

| Thứ tự thao tác | Lỗi có thể gặp | Nguyên nhân chính |
|---|---|---|
| 1. Mở AI creator | 404 `/api/AiAssistant/DefaultConfig` | Bundle cũ / route thiếu / AI chưa enable |
| 2. AI tạo bảng | 400/500 `ExecuteDdl` | Sai dialect, thiếu DashboardDatabase, provider sai |
| 3. Tạo bảng thứ 2/3 | FK violation | Tạo bảng con trước bảng cha |
| 4. Lưu form | 400 `MegaForm Oqtane save requires a valid moduleId and siteId` | Race DOM / thiếu ids |
| 5. Submit form | 500 / insert không chạy | `databaseType` rỗng hoặc SQL `[schema]` sai provider |
| 6. Xem quan hệ | Không thấy children / không link submission | Không có `MF_FormRelations` |

---

## 5. Đề xuất khắc phục (ưu tiên)

### P0 — Không thể tạo form được

1. **Đảm bảo bundle mới được deploy** — build `megaform-dashboard.js`, `megaform-ai-form-assistant.js`, `megaform-builder.js` và copy vào `wwwroot/Modules/MegaForm/js/`, cập nhật version query.
2. **Tự động detect và tạo DashboardDatabase connection string** nếu thiếu, hoặc hiển thị lỗi rõ ràng trên UI thay vì 500.
3. **Sửa `AiToolsController.OpenDashboardConnection`** để sniff SQLite giống `SubformController`.
4. **Wire per-site DashboardDatabase override** vào `OqtaneConnectionRegistry` (đọc từ site settings `MegaForm_DashboardDb_*`).
5. **Thêm topological sort** cho `tables` array trước khi chạy DDL, dựa trên FK references.

### P1 — Form lưu được nhưng DB/submit lỗi

6. **Truyền đúng `databaseType`** trong `databaseInsert` (lấy từ `DbProvider` hoặc connection string sniff).
7. **Provider-aware INSERT SQL** — `FormDatabaseInsertService` cần dịch identifier quoting (`[]`, `""`, `` ` ``) theo provider thực tế.
8. **Tăng cường `SqlDdlGuard`** để hỗ trợ multi-statement DDL hợp lệ (CREATE TABLE + CREATE INDEX) hoặc tách DDL ở client trước.
9. **Đồng bất dialect injection** — đảm bảo system prompt và `ddl-dialect.ts` luôn gửi provider hiện tại cho AI.

### P2 — Relationship metadata

10. **Sau khi AI tạo app_batch, tự động tạo `MF_FormRelations`** dựa trên FK trong DDL. Cần thêm Oqtane controller/API hoặc gọi `IPhase2Repository.SaveFormRelation` từ server.
11. **Nếu không muốn dùng native relation**, thì document rõ: AI chỉ tạo SQL-level FK, không tạo MegaForm native link.

### P3 — Auth / deployment

12. **Mở rộng `megaform-oqtane-auth.js`** regex để bao phủ `/api/Ai*` và `/api/MegaFormAi*`.
13. **Align nuspec** với multi-target output (`net9.0` + `net10.0`).
14. **Thêm integration test** cho flow: AI tạo 3 form có FK → submit parent → submit child → verify link.

---

## 6. Các file cần xem xét khi sửa

| File | Vai trò |
|------|---------|
| `MegaForm.UI/src/dashboard/ai-form-creator.ts` | Save endpoint, app_batch orchestration, FK auto-wire, INSERT SQL build |
| `MegaForm.UI/src/ai-form-assistant/ops.ts` | Builder chat ops: `opExecuteSql`, `opCreateForm`, `opAppBatch`, `buildInsertSqlFor` |
| `MegaForm.UI/src/ai-form-assistant/chat.ts` | System prompt, dialect prompt, app_batch skeleton |
| `MegaForm.UI/src/shared/ddl-dialect.ts` | Provider-to-dialect mapping |
| `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` | `ExecuteDdl`, `SqlTables`, `SqlColumns`, `DbProvider`, `OpenDashboardConnection` |
| `MegaForm.Oqtane.Server/Controllers/SubformController.cs` | `ApplyDdl`, `Tables`, `Columns` (có SQLite sniff) |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | `SaveForm`, `ModuleConfigDatabase` settings |
| `MegaForm.Oqtane.Server/Services/Startup.cs` | `OqtaneConnectionRegistry` registration |
| `MegaForm.Core/Services/FormDatabaseInsertService.cs` | INSERT runtime |
| `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs` | DDL allow-list |
| `MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs` | Mẫu tạo `MF_FormRelations` đúng |
| `MegaForm.Oqtane.Server/Data/EfPhase2Repository.cs` | Repository tạo relation metadata |

---

## 7. Kết luận

Vấn đề "dùng AI tạo form kết nối DB trên Oqtane bị báo lỗi DB" không phải một lỗi đơn lẻ mà là **tổng hợp của nhiều điểm yếu xuyên suốt pipeline**. Với kịch bản tạo **~3 form có liên kết quan hệ**, các lỗi dễ gặp nhất là:

1. **400 Bad Request** do sai endpoint hoặc thiếu `moduleId`/`siteId`.
2. **DDL execution error** do sai dialect, provider detection, hoặc tạo bảng sai thứ tự.
3. **Không có native relationship** — form lưu được nhưng submission không được link, dashboard không hiển thị quan hệ.

Để khắc phục, cần ưu tiên: deploy bundle mới, sửa provider detection cho `AiToolsController`, wire per-site DashboardDatabase override, thêm topological sort DDL, và quyết định/triển khai việc tạo `MF_FormRelations` sau khi AI tạo app_batch.
