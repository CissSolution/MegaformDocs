# Audit: DNN AI Create Form Fail vi DashboardDatabase

Ngay audit: 2026-07-14  
Pham vi: audit source va anh chup DNN, khong sua code.

## Ket luan ngan

Prompt trong anh:

> tao 1 form ket noi database cho Vendor (vendorid, vendorname, country)

khong fail o buoc AI hieu yeu cau. AI da sinh dung luong `app_batch`: tao table `Vendor` truoc, sau do tao form bind vao table do.

No fail tai buoc DNN backend chay DDL:

```text
Table 1/1: failed - MegaForm: Dashboard database connection is not configured.
Please set it via Dashboard -> Database Settings.
Form 1/1: skipped - Vendor Form (its table Vendor failed to create; fix the SQL error above and retry)
```

Vi table `Vendor` khong tao duoc, UI skip form la dung de tranh tao form tro vao table khong ton tai.

## Luong code lien quan

1. UI Dashboard "Create form with AI" nhan prompt va chay `app_batch`.
   - File: `MegaForm.UI/src/dashboard/ai-form-creator.ts`
   - Ham: `runAppBatchFromDashboard`
   - Buoc DDL goi:

```ts
postJson(aiBaseUrl + 'AiTools/ExecuteDdl', {
  sql: t.ddl,
  connectionKey: t.connectionKey || 'DashboardDatabase'
})
```

2. Backend DNN nhan DDL tai `AiTools/ExecuteDdl`.
   - File: `MegaForm.DNN/WebApi/AiToolsController.cs`
   - Neu `connectionKey` rong thi default la `DashboardDatabase`.
   - Controller mo connection bang:

```csharp
var registry = new DnnConnectionRegistry(GetHostSetting);
using (var conn = registry.GetConnection(connectionKey, null, null))
```

3. `DnnConnectionRegistry` resolve `DashboardDatabase`.
   - File: `MegaForm.DNN/WebApi/MegaFormApiController.cs`
   - Cac key cau hinh:
     - `MegaForm_Database_ConnectionAlias`
     - `MegaForm_Database_Provider`
     - `MegaForm_Database_ConnectionString`

Neu khong resolve duoc connection string, code nem loi:

```text
MegaForm: Dashboard database connection is not configured. Please set it via Dashboard -> Database Settings.
```

Day chinh la message hien trong anh.

## Nguyen nhan kha nang cao

### P0 - DNN site dang chay build chua co fallback ve SiteSqlServer

Trong source hien tai co thay doi chua chac da deploy:

```text
[DashboardDbFallback-DNN v20260714-01]
```

Thay doi nay them fallback: neu `DashboardDatabase` chua co connection string rieng, DNN se thu dung connection string mac dinh cua site:

- `DotNetNuke.Data.DataProvider.Instance().ConnectionString`
- fallback tiep: `DotNetNuke.Common.Utilities.Config.GetConnectionString()`

Neu build tren site `dnn10322_megaclean.ai` chua co thay doi nay, mot DNN install stock co the van fail dung nhu anh.

### P0 - Database Settings va AiTools phai doc cung mot setting store

Source hien tai:

- UI Settings goi `ModuleConfig/DatabaseSettings`.
- `SaveDatabaseSettings` luu bang `SetPortalSetting`, nhung helper nay hien tai update HostController key `MegaForm_*`.
- `AiTools/ExecuteDdl` doc bang `GetHostSetting`, cung doc HostController key `MegaForm_*`.

Neu deployed build cu van con trang thai Settings luu portal setting nhung AiTools chi doc host setting, thi user co the da "Save Database Settings" nhung AI van bao not configured.

Can xac nhan tren DNN live build: `ModuleConfig/DatabaseSettings` va `AiTools/ExecuteDdl` co cung doc/ghi `MegaForm_Database_*` o cung scope khong.

### P1 - AI modal chua preflight ro rang truoc khi chay app_batch

Hien tai UI chi phat hien loi sau khi da goi `ExecuteDdl`. Ket qua user thay batch "partial" va table failed.

Nen co preflight truoc Apply:

- Goi `AiTools/DbProvider`, `AiTools/SqlTables`, hoac endpoint nhe rieng de verify `DashboardDatabase`.
- Neu fail, dung batch truoc khi tao table va hien CTA mo `Dashboard -> Database Settings`.
- Message nen noi ro dang doc `MegaForm_Database_*` host setting hay portal setting nao.

## Vi sao form bi skip

Trong `MegaForm.UI/src/dashboard/ai-form-creator.ts` source hien tai co guard:

```text
[FailedTableGuard 2026-07-14]
```

Guard nay track table failed va skip form bind vao table do. Day la hanh vi dung. Neu van tao form, submit sau do se fail vi table `Vendor` khong ton tai.

## Can kiem tra tren DNN live

1. Mo Dashboard -> Database Settings.
2. Bam "Use Site Default" neu muon dung database DNN hien tai.
3. Bam "Test Connection".
4. Save voi alias `DashboardDatabase`.
5. Goi endpoint doc table, voi user admin:

```text
/DesktopModules/MegaForm/API/AiTools/SqlTables
```

Neu endpoint nay cung tra loi "Dashboard database connection is not configured", loi nam o backend resolve connection, khong nam o prompt AI.

6. Xac nhan host settings DNN co cac key:

```text
MegaForm_Database_ConnectionAlias = DashboardDatabase
MegaForm_Database_Provider = SqlServer
MegaForm_Database_ConnectionString = <connection string>
```

7. Xac nhan package DNN tren site da chua code fallback `[DashboardDbFallback-DNN v20260714-01]`.

## De xuat fix sau audit

### Fix P0

Dong bo mot cach duy nhat cho DNN database settings:

- `ModuleConfig/DatabaseSettings`
- `AiTools/ExecuteDdl`
- `AiTools/SqlTables`
- SQL preview, field options, workflow DB actions

tat ca phai dung cung helper doc settings va cung fallback DNN `SiteSqlServer`.

### Fix P0

Build va deploy lai DNN package co `DashboardDbFallback-DNN v20260714-01`. Sau deploy, prompt tao Vendor table tren DNN stock khong nen fail chi vi chua nhap connection string rieng.

### Fix P1

Them preflight trong AI create-form modal:

- Neu prompt co "ket noi database", "tao table", "insert into SQL", `app_batch.tables`, thi check connection truoc khi Apply.
- Neu fail, khong goi `ExecuteDdl`; hien message setup database.

### Fix P1

Sau khi Save Database Settings, refresh lai provider/connection state cua AI modal. Tranh truong hop modal mo tu truoc, settings vua duoc save nhung batch van dung state cu.

## Ket luan audit

Loi trong anh khong phai do AI prompt "Vendor" sai, khong phai do schema `vendorid, vendorname, country` sai. Root cause nam o DNN runtime khong resolve duoc `DashboardDatabase` khi goi `AiTools/ExecuteDdl`.

Source hien tai da co dau vet mot fix quan trong (`DashboardDbFallback-DNN v20260714-01`) nhung can xac nhan da build/deploy len site DNN. Neu chua deploy, day la ly do hop ly nhat khien DNN live van fail nhu anh.
