# Audit - Submission dashboard JSON vs SQL table source

Ngay: 2026-07-14

Thu muc code:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`

Pham vi: **audit only, khong code**.

## Cau hoi can tra loi

1. Tai sao submission dashboard khong hien thi so lieu/dong co trong SQL tables ma chi hien thi du lieu JSON mac dinh?
2. Lam cach nao de form ket noi SQL co lua chon hien thi `SQL table` hoac `JSON default`?
3. Vi sao `Insert into SQL table` chua chay tren Oqtane?
4. DNN co chay hay khong?

## Ket luan ngan

Submission dashboard hien tai la **JSON-first dashboard**. No doc tu `MF_Submissions` va `MF_Submissions.DataJson`, khong doc truc tiep tu custom SQL table duoc khai bao trong `settings.databaseInsert`.

`databaseInsert` hien chi la **mirror/write-side hook**: sau khi submission da luu thanh cong vao `MF_Submissions`, he thong moi thu insert them mot row vao SQL table rieng. No khong lam SQL table tro thanh read source cua dashboard.

Oqtane co hook `databaseInsert` trong submit pipeline, nhung co 2 gap lon:

- Runtime `OqtaneConnectionRegistry` chi doc `appsettings.json`/`DefaultConnection`, **chua doc site-level Database Settings da save**. Chinh comment trong `MegaFormController.ModuleConfigDatabase.cs` noi day la follow-up.
- Neu `databaseType` rong, registry mac dinh dung SQL Server provider. Neu Oqtane host dang chay SQLite/MySQL/PostgreSQL, insert SQL co the fail. Fail nay bi swallow/log warning nen user van thay submit thanh cong.

DNN co nhieu phan SQL live view hon Oqtane:

- `AiTools/CustomTableRows`
- `AiTools/SubmissionDbView`
- DNN connection registry co alias-resolve `DashboardDatabase` sang portal setting.

Vi vay DNN **co kha nang chay tot hon**, nhung van can runtime QA. Khong the ket luan DNN pass neu chua submit mot form co `databaseInsert` va query custom table.

## Bang chung trong source

### 1. Submission dashboard/list chi doc `MF_Submissions`

Core service:

- `MegaForm.Core\Services\SubmissionQueryService.cs`

`List(...)` goi:

```csharp
_submissions.List(query.FormId, query.Status, query.Search, query.DateFrom, query.DateTo, ...)
```

`GetDetail(...)` goi:

```csharp
var submission = _submissions.Get(submissionId);
...
MegaFormUtils.FlattenSubmission(schema, submission.DataJson ?? "{}")
```

Nghia la source cua list/detail la repository submission mac dinh, roi flatten tu `DataJson`.

Oqtane repository:

- `MegaForm.Oqtane.Server\Data\EfRepositories.cs`

`EfSubmissionRepository.List(...)` query:

```csharp
db.Submissions.Where(s => s.FormId == formId)
```

`MegaFormDbContext` map `Submissions` vao table:

```csharp
e.ToTable("MF_Submissions");
```

DNN repository:

- `MegaForm.DNN\Data\FormRepository.cs`

`ListSubmissions(...)` query `dbo.MF_Submissions`.

### 2. `databaseInsert` la write-side mirror, khong phai read-side dashboard source

Core service:

- `MegaForm.Core\Services\FormDatabaseInsertService.cs`

Header cua service noi ro:

> After a form submission saves to MegaForm DB, optionally also INSERT a row into a CUSTOM database.

`Execute(...)` chi chay khi:

- `settings.DatabaseInsert.Enabled == true`
- `ConnectionKey` co gia tri
- `InsertSql` co gia tri

No chi execute `INSERT`. No khong co API/list adapter nao de dashboard doc lai table do.

### 3. Oqtane submit co goi databaseInsert, nhung fail-soft

File:

- `MegaForm.Oqtane.Server\Controllers\MegaFormController.cs`

Sau khi `_processor.ProcessAsync(...)` success, Oqtane moi goi:

```csharp
var insertSvc = new FormDatabaseInsertService(_connectionRegistry);
var insertResult = insertSvc.Execute(settings, request.Data);
```

Neu insert fail:

```csharp
_logger.Log(... "MegaForm DatabaseInsert failed ...")
```

Neu exception:

```csharp
catch (Exception dbEx) { _logger.Log(...); }
```

Do do submit van success, nhung SQL table khong co row. Day la ly do "Insert into SQL table chua chay" co the bi an di trong UI.

### 4. DNN submit cung co databaseInsert hook

File:

- `MegaForm.DNN\WebApi\MegaFormApiController.cs`

Sau khi `SubmissionController.ProcessSubmissionAsync(...)` success, DNN goi:

```csharp
var insertSvc = new FormDatabaseInsertService(lifecycleRegistry);
insertSvc.Execute(settings, formData);
```

No cung fail-soft va chi log warning.

### 5. Oqtane registry co rui ro provider/setting

File:

- `MegaForm.Oqtane.Server\Services\Startup.cs`

`OqtaneConnectionRegistry.GetConnection(...)`:

- doc `ConnectionStrings:{connectionName}` tu `IConfiguration`
- neu `DashboardDatabase` thieu thi fallback sang `DefaultConnection`
- neu `databaseType` rong thi `ResolveProviderInvariantName(...)` default ve `Microsoft.Data.SqlClient`

Rui ro:

1. Oqtane site-level Database Settings co endpoint save rieng, nhung registry khong doc no.
2. Neu host dung SQLite ma `databaseType` rong, registry van chon SQL Server provider.
3. SQL do AI sinh co the la SQL Server dialect (`[dbo].[Table]`, `IDENTITY`, `DATETIME2`) trong khi Oqtane tenant la SQLite/Postgres/MySQL.

File lien quan:

- `MegaForm.Oqtane.Server\Controllers\MegaFormController.ModuleConfigDatabase.cs`

Comment cua `SaveDatabaseSettings` noi ro:

> Persist the DashboardDatabase override to SITE settings ... wiring the registry to consume this saved override is a documented follow-up.

Day la bang chung cau hinh DB popup Oqtane chua chac anh huong runtime `FormDatabaseInsertService`.

### 6. UI da co dau vet SQL live view, nhung cross-platform chua hoan chinh

UI:

- `MegaForm.UI\src\submissions\submission-livedb-modal.ts`
- `MegaForm.UI\src\submissions\submission-detail-db-tab.ts`

Hai file nay goi:

- `/AiTools/CustomTableRows?formId=N`
- `/AiTools/SubmissionDbView?submissionId=N`

DNN co endpoints:

- `MegaForm.DNN\WebApi\AiToolsController.cs`
  - `CustomTableRows`
  - `SubmissionDbView`

Oqtane search hien tai khong thay hai endpoints nay trong `MegaForm.Oqtane.Server\Controllers\AiToolsController.cs`. Do do DB View/Live DB rows co the 404 tren Oqtane, mac du UI co tab/nut.

Them nua, `SubmissionsShell.ts` import `openLiveDbRowsModal`, nhung search khong thay call thuc te. `forms-overview.ts` chi render storage chip `db`, khong phai nut mo live SQL rows.

## Vi sao dashboard hien JSON mac dinh

Kien truc hien tai:

```text
Submit form
  -> SubmissionProcessor
  -> MF_Submissions.DataJson     <-- dashboard/list/detail doc o day
  -> optional databaseInsert
  -> custom SQL table            <-- mirror/integration/report, dashboard khong doc mac dinh
```

Vi vay neu form/AI/seed chi ghi SQL table:

- custom SQL table co rows
- `MF_Submissions` khong co row tuong ung
- dashboard hien 0 hoac chi hien du lieu JSON cu

Neu form submit ghi ca hai:

- dashboard hien row tu `MF_Submissions`
- SQL table co mirror row neu insert hook thanh cong
- nhung dashboard van hien `DataJson`, khong hien row SQL live tru khi co DB View/Live Rows surface rieng

## Nguyen nhan kha di `Insert into SQL table` chua chay tren Oqtane

### P0 - Database Settings da save nhung runtime registry khong doc

Oqtane DB Settings popup luu vao site settings:

- `MegaForm_DashboardDb_Provider`
- `MegaForm_DashboardDb_ConnectionString`
- `MegaForm_DashboardDb_Alias`

Nhung `OqtaneConnectionRegistry` chi doc `IConfiguration.GetConnectionString(...)`. Neu user save connection trong UI thay vi appsettings, `databaseInsert` van khong dung connection do.

### P0 - `databaseType` rong hoac sai provider

AI/client co noi tao:

```json
"databaseInsert": {
  "enabled": true,
  "connectionKey": "DashboardDatabase",
  "databaseType": "",
  ...
}
```

Trong Oqtane registry, `databaseType = ""` => SQL Server. Neu site chay SQLite thi insert se fail.

### P1 - SQL dialect khong khop database

`FormDatabaseInsertService` chi normalize token `:name` thanh `@name`. No khong rewrite:

- `[dbo].[Table]`
- `TOP`
- `OFFSET ... FETCH`
- `IDENTITY`
- `DATETIME2`

Neu table/DDL duoc tao bang dialect khac voi provider that, insert fail.

### P1 - `databaseInsert` co the nam sai cho hoac bi strip khi save/load

Runtime submit doc:

```csharp
RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson)
resolved.Schema.Settings.DatabaseInsert
```

Can verify form Oqtane that su co `settings.databaseInsert` trong `SettingsJson` hoac trong schema settings sau khi save. Neu UI chi giu config trong client state ma save sai shape, submit hook se no-op.

### P1 - Fail-soft lam loi bi an

Ca Oqtane va DNN deu khong fail submission khi SQL insert loi. User chi thay row JSON thanh cong, khong thay SQL row. Can doc logs hoac expose warning/test status moi biet.

### P2 - Thieu audit/link SubmissionId trong SQL table

Neu SQL table khong co `SubmissionId`/`submission_id` va insertSql khong map `_submissionId`, DB View khong join duoc chinh xac row SQL voi row JSON. DNN endpoint co fallback "latest row", nhung day khong an toan cho production.

## DNN co chay khong?

Chua QA runtime, nhung source DNN day du hon Oqtane o 3 diem:

1. DNN submit co hook `FormDatabaseInsertService`.
2. DNN `DnnConnectionRegistry` resolve `DashboardDatabase` qua portal setting, co provider fallback.
3. DNN co endpoints live SQL:
   - `AiTools/CustomTableRows`
   - `AiTools/SubmissionDbView`

Ket luan: **DNN co kha nang chay, nhung can test thuc te**:

- Tao form co `databaseInsert.enabled = true`.
- Bam Test Insert trong builder.
- Submit mot row.
- Query custom SQL table.
- Mo Submissions detail tab `DB View`.
- Mo live rows endpoint.

Neu form DNN dung `DashboardDatabase` portal setting dung va SQL Server dialect, kha nang pass cao hon Oqtane.

## De xuat thiet ke: cho chon JSON default hoac SQL table

### Muc tieu UX

Trong Submission dashboard, voi form co `settings.databaseInsert.enabled = true`, hien mot toggle/source selector:

- `JSON submissions (default)` - doc `MF_Submissions`, giu full workflow/status/files/print/edit.
- `SQL table rows` - doc custom table live, read-only truoc, co paging/sort/filter SQL-side.
- `Hybrid detail` - list van JSON, detail co tab `DB View` hien row SQL linked.

Khong nen doi mac dinh sang SQL ngay, vi SQL table co the khong co workflow/status/file/permission metadata.

### API contract nen them

Same-host/server API:

1. `GET /api/MegaForm/SubmissionSources?formId=N`

Tra:

```json
{
  "defaultSource": "json",
  "sources": [
    { "key": "json", "label": "JSON submissions", "available": true },
    {
      "key": "sql",
      "label": "SQL table rows",
      "available": true,
      "connectionKey": "DashboardDatabase",
      "schema": "dbo",
      "table": "Form_X_Submissions",
      "joinColumn": "SubmissionId"
    }
  ]
}
```

2. `GET /api/MegaForm/Submissions?formId=N&source=json`

Giu behavior cu.

3. `GET /api/MegaForm/Submissions?formId=N&source=sql`

Hoac endpoint rieng:

`GET /api/MegaForm/SubmissionSqlRows?formId=N&page=1&pageSize=50&sort=...`

Tra columns + rows:

```json
{
  "source": "sql",
  "formId": 123,
  "schema": "dbo",
  "table": "Form_123_Submissions",
  "columns": [{ "name": "FullName", "type": "nvarchar" }],
  "rows": [{ "FullName": "Alice" }],
  "total": 1000,
  "page": 1,
  "pageSize": 50
}
```

4. `GET /api/MegaForm/Submissions/{id}/DbView`

Port DNN `SubmissionDbView` sang Oqtane va dung chung core service.

### Core service nen tach

De tranh duplicate DNN/Oqtane:

- `SubmissionStorageSourceService`
  - detect form source tu `SettingsJson`/schema settings
  - parse `databaseInsert.insertSql` de lay schema/table
  - validate identifier
  - return available sources

- `SqlSubmissionRowsService`
  - query custom table voi paging/sort/filter
  - provider-aware SQL dialect
  - read-only first
  - never expose raw connection string

- `SubmissionDbViewService`
  - join `MF_Submissions.SubmissionId` voi SQL table `SubmissionId`/`submission_id`
  - fallback optional, nhung production nen yeu cau join column ro rang

### Builder/AI can enforce

Khi AI/app builder tao `databaseInsert`, bat buoc:

- set `databaseType` dung provider
- map audit column `SubmissionId` hoac `MegaFormSubmissionId`
- insertSql co parameter `:_submissionId` hoac tuong duong
- table co column join tuong ung

Vi du:

```sql
INSERT INTO [dbo].[Form_X_Submissions]
  ([MegaFormSubmissionId], [FullName], [Email], [CreatedOnUtc])
VALUES
  (:_submissionId, :fullName, :email, :_submittedOnUtc)
```

Hien tai `FormDatabaseInsertService.Execute(settings, request.Data)` chi truyen form data, khong truyen `submissionId`. Muon map `_submissionId`, Oqtane/DNN submit hook can merge server fields vao formData truoc khi Execute.

## Thu tu fix de nghi

### Phase 1 - Lam insert SQL tren Oqtane that su dang tin

1. Sua/bo sung Oqtane runtime registry de doc site-level DB settings da save.
2. Neu `databaseType` rong, sniff provider tu connection string hoac tenant DBType thay vi default SQL Server.
3. Khi `databaseInsert` fail, tra warning admin-visible hoac ghi structured log de QA thay duoc.
4. Them test manual + automated:
   - Oqtane SQLite
   - Oqtane SQL Server
   - DNN SQL Server

### Phase 2 - Port live SQL rows endpoints sang Oqtane

1. Port `CustomTableRows` tu DNN sang Oqtane.
2. Port `SubmissionDbView` tu DNN sang Oqtane.
3. Dung chung core service neu co the, de tranh drift.
4. Wire UI that su goi modal Live DB rows tu overview/list.

### Phase 3 - Source selector trong dashboard

1. Them source selector chi hien khi form co SQL binding.
2. Mac dinh van `JSON`.
3. `SQL table` la read-only list/grid truoc.
4. Detail modal co tab:
   - `Data View` = JSON
   - `DB View` = SQL live row

### Phase 4 - SQL as primary/read source, neu can

Chi nen lam sau khi co:

- permission model cho SQL rows
- sort/filter SQL-safe
- mapping field labels/types
- row identity/update/delete policy
- audit trail
- workflow/status bridge

## Test checklist

### Oqtane

1. Kiem tra form SettingsJson:
   - co `databaseInsert.enabled = true`
   - co `connectionKey`
   - co `databaseType`
   - co `insertSql`
   - co `parameterMapping`

2. Bam builder `Test Insert`.

3. Submit form.

4. Query:

```sql
SELECT TOP 10 * FROM MF_Submissions WHERE FormId = @FormId ORDER BY SubmissionId DESC;
SELECT TOP 10 * FROM [dbo].[CustomTable] ORDER BY Id DESC;
```

5. Neu `MF_Submissions` co row ma custom table khong co row:
   - doc Oqtane logs message `MegaForm DatabaseInsert failed`
   - check provider/databaseType
   - check DashboardDatabase/DefaultConnection
   - check table/column SQL dialect

### DNN

1. Lap lai submit.
2. Query `dbo.MF_Submissions` va custom table.
3. Goi:

```text
/DesktopModules/MegaForm/API/AiTools/CustomTableRows?formId=N&page=1&pageSize=50
/DesktopModules/MegaForm/API/AiTools/SubmissionDbView?submissionId=N
```

4. Neu endpoint pass, DNN SQL view path OK.

## Ket luan cuoi

Submission dashboard khong hien SQL table vi day la hanh vi dung theo kien truc hien tai: dashboard doc `MF_Submissions.DataJson`; SQL table chi la mirror optional.

Muon khach co lua chon hien thi `SQL table` hoac `JSON default`, can them read-side source abstraction va UI selector. Minimal change hop ly nhat la:

1. Giu JSON default.
2. Fix Oqtane `databaseInsert` reliability.
3. Port DNN live SQL endpoints sang Oqtane.
4. Them source selector/read-only SQL table view trong dashboard.

