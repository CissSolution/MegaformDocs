# AUDIT — Typed Submission Storage (Kimi P1/P2/P3) — 2026-07-18

> **Người audit:** Claude (Opus 4.8) · **Nhánh:** `feature/typed-submission-storage-core`
> **Phạm vi:** rà soát code Kimi làm trong phiên (P1 read-facade, P2 write-path resync, P3 Web/Umbraco EF model + store + DI), **KHÔNG sửa code**.
> **Trạng thái build/deploy:** ĐÃ build clean + hot-swap lên Oqtane **:5126** (Fresh1805) để test — chi tiết §2.
> **Tài liệu liên quan:** [`TYPED_STORAGE_ROADMAP_SPLIT_PLAN.md`](TYPED_STORAGE_ROADMAP_SPLIT_PLAN.md) · [`HANDOUT_CLAUDE_NEXT_TYPED_STORAGE_NO_DATAJSON_ROADMAP_2026-07-18.md`](HANDOUT_CLAUDE_NEXT_TYPED_STORAGE_NO_DATAJSON_ROADMAP_2026-07-18.md)

---

## 0. TL;DR (đọc trước)

| Hạng mục | Kết luận |
|---|---|
| **Build** | ✅ `MegaForm.Core` (net9/net10) + `MegaForm.Oqtane.Server` build **0 error** (chỉ warning NuGet CVE có sẵn, không liên quan). |
| **Deploy :5126** | ✅ Hot-swap `MegaForm.Core.dll` + `MegaForm.Oqtane.Server.Oqtane.dll` (net10) → HTTP 200, không lỗi startup. Backup ở `_bak_20260718_1432`. |
| **Oqtane runtime** | ✅ 7 bảng typed có mặt; 57 submission / 382 field rows; 5 sub mới nhất `DataJson="{}"` (collapse ĐANG chạy); sub 57 có 7 typed field đầy đủ (nguồn reconstruct OK). |
| **Chất lượng code P1/P2 (Oqtane + DNN)** | ✅ Đúng kiến trúc, fail-soft, đối xứng hợp lý. Oqtane self-resync trong repo; DNN wire tay qua `DnnServiceLocator`. |
| **P3 (Web/Umbraco)** | ⚠️ **2 finding HIGH** chặn ship Web/Umbraco (KHÔNG ảnh hưởng :5126/Oqtane): (F1) upgrade-DB thiếu 7 bảng typed; (F2) resync KHÔNG được wire → typed rows lệch → resolver đọc dữ liệu cũ. |

> **Kết luận nhanh:** phần **Oqtane đã live tốt trên :5126**. Phần **Web/Umbraco chưa an toàn để ship** — WP-1 (schema bootstrapper) và wiring resync còn thiếu như chính roadmap đã cảnh báo.

---

## 1. Phạm vi thay đổi (uncommitted trên nhánh)

### File mới (Core)
- `MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs` — facade đọc typed-first, fallback DataJson.
- `MegaForm.Core/Services/TypedSubmission/TypedSubmissionResyncService.cs` — resync typed rows sau khi ghi DataJson tại chỗ.

### P1 — read-facade (Core, đã đổi để đọc qua resolver)
`SubmissionQueryService.cs`, `EmailNotificationService.cs`, `WebhookService.cs`, `DataRepeaterService.cs`, `FieldOptionsService.cs`, `AdminRecordShellService.cs`, `WorkflowEngine.cs`, `Blog/ScheduledPublishService.cs`, `Blog/BlogAnalyticsRollupService.cs`, `Starters/ConfiguredAppStarterService.cs`.

### P2 — write-path resync
- `WorkflowEngine.UpdateFieldAsync` + `AssignRoundRobinAsync` → `_typedResync?.Resync(...)`.
- `BlogAnalyticsRollupService` (post analytics rollup) → `_typedResync?.Resync(...)`.
- `ConfiguredAppStarterService.SetSubmissionStatusAndField` → `_typedResync?.Resync(...)`.
- `MegaForm.DNN/WebApi/MegaFormApiController.UpdateData` → `DnnServiceLocator.Instance.TypedResync.Resync(...)`.
- `MegaForm.DNN/Services/DnnServiceLocator.cs` → tạo `DataResolver` + `TypedResync`, inject vào các Core service.

### P3 — Web + Umbraco
- **Web:** `Data/DataLayer.cs` (7 DbSet + mapping/index), `Data/EfSubmissionDataStore.cs` (mới), `Program.cs` (DI).
- **Umbraco:** `Data/MegaFormDbContext.cs` (7 DbSet + mapping), `Data/EfSubmissionDataStore.cs` (mới), `Composers/MegaFormComposer.cs` (DI), `Data/UmbracoDatabaseSchemaBootstrapper.cs` (mới), `Migrations/InitialMegaFormSchemaMigration.cs` + `MegaFormSchemaMigrationPlan.cs` + `MegaFormSchemaMigrationRunner.cs` (mới).

> ⚠️ **Lưu ý scope:** working tree còn trộn nhiều workstream khác chưa commit (NamedConnections 07-17, Umbraco backoffice authz policy, my-inbox TS, docs…). Diff của `DnnServiceLocator.cs` và `MegaFormComposer.cs` **đan xen** typed-storage với NamedConnections/permissions — xem **F8**.

---

## 2. Bằng chứng build & deploy :5126

**Site:** `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\Oqtane.Server.exe --urls http://localhost:5126` (self-contained, **net10.0**, DB = MSSQL `localhost\SQLEXPRESS` / `Oqtane_MegaForm_Fresh1805`).

**Mô hình deploy:** hot-swap DLL trực tiếp vào site root (đúng pattern Kimi đã dùng — có sẵn `_bak_preTyped_1.7.108`). Gói package cuối cùng cài sạch là **1.7.107**; các bản typed sau đó đều hot-swap.

Các bước đã làm phiên này:
1. `dotnet build MegaForm.Core -c Release -f net9.0` → **0 error**.
2. `dotnet build MegaForm.Oqtane.Server -c Release` → **0 error** (12 warning NuGet CVE có sẵn).
3. Stop PID :5126 → backup 2 DLL vào `_bak_20260718_1432` → copy net10 DLL mới → relaunch.
4. Verify:

```
HTTP GET http://localhost:5126/  → 200 (48 KB), process healthy, err-log rỗng.

sys.tables LIKE 'MF_Submission%':
  MF_SubmissionFields, MF_SubmissionValueString/LongText/Number/Date/Boolean/Json  → đủ 7 bảng typed
MF_Submissions = 57 rows · MF_SubmissionFields = 382 rows
TOP 5 submissions: DataJson = '{}' (LEN=2) cho cả 5  → collapse ĐANG hoạt động
Sub 57 (form 3): 7 typed field (full_name/email/ticket_type/guests/event_date/sessions/dietary) đầy đủ FieldType+DataType
```

➡️ **Kết luận deploy:** bản DLL mới nạp sạch, đường ghi typed + collapse hoạt động, nguồn reconstruct còn nguyên. **Không có regression startup.**

> ⚠️ Chưa chạy end-to-end submit qua browser trong phiên này (user chuyển hướng sang viết audit). Bằng chứng DB đã chứng minh write+collapse; đường reconstruct-on-read là code Kimi đã QA trước đó (sub 54/56).

---

## 3. Findings

### 🔴 F1 (HIGH) — WP-1 chưa xong: DB **upgrade** của Web & Umbraco KHÔNG tạo 7 bảng typed
**Chỗ:** `MegaForm.Web/Data/DatabaseSchemaBootstrapper.cs:63-100` · `MegaForm.Umbraco/Data/UmbracoDatabaseSchemaBootstrapper.cs:89-138`

- Cả hai `MegaFormTablesExist()` chỉ kiểm tra sự tồn tại của **`mf_modulesettings`**. Với DB đã tồn tại (đã có bảng MegaForm cũ) → hàm trả `true` → `creator.CreateTables()` **bị bỏ qua** → 7 bảng typed **không được tạo**.
- `creator.CreateTables()` (EF Core) sinh script tạo **toàn bộ model** và sẽ **ném lỗi nếu bất kỳ bảng nào đã tồn tại** — nên không thể dùng nó để "thêm 7 bảng" trên DB cũ. Cần DDL **có mục tiêu** (CREATE TABLE IF NOT EXISTS cho đúng 7 bảng theo từng provider).
- `MegaForm.Umbraco/Migrations/InitialMegaFormSchemaMigration.cs:32-46` gọi lại chính bootstrapper bị chặn ở trên → **vô hiệu với upgrade**. Comment "only creates tables that do not already exist" **KHÔNG chính xác**.

**Hệ quả:**
- **Submit vẫn OK** (đường ghi typed fail-soft — xem §4, `SubmissionProcessor.cs:391-414` bọc try/catch, DataJson giữ nguyên).
- **Đường ĐỌC vỡ:** `SubmissionQueryService.GetDetail` (inbox/admin xem submission) gọi `_dataResolver.HasTypedData()` → `_typedStore.HasFields()` → SQL `Invalid object name 'MF_SubmissionFields'` → **không bắt exception** (xem F4) → 500 cho **mọi** submission read cho tới khi tạo bảng.
- **Fresh install OK** (CreateTables toàn model có sẵn 7 bảng). **Oqtane OK** (bảng đã có — verified §2).

**Hướng fix (WP-1):** thêm `TypedSubmissionSchemaBootstrapper` chạy DDL idempotent riêng cho 7 bảng + index (khớp mapping trong `DataLayer.cs`/`MegaFormDbContext.cs`) khi thiếu `MF_SubmissionFields`, cho cả 4 provider (SqlServer/SQLite/PostgreSQL/MySQL). Ưu tiên **cao nhất** — đúng như roadmap.

---

### 🔴 F2 (HIGH) — P2 resync KHÔNG wire trên Web/Umbraco → typed rows lệch → resolver trả dữ liệu cũ
**Chỗ:** `TypedSubmissionResyncService` **không** được đăng ký DI ở `MegaForm.Web/Program.cs` lẫn `MegaForm.Umbraco/Composers/MegaFormComposer.cs`.

- Các Core service (`WorkflowEngine`, `ConfiguredAppStarterService`, `BlogAnalyticsRollupService`) nhận `TypedSubmissionResyncService typedResync = null` (tham số optional). Không đăng ký → **`_typedResync` = null** → `Resync()` **không chạy**.
- Web/Umbraco `EfSubmissionRepository.UpdateData` **không** tự re-derive typed rows (khác Oqtane — xem §4). Nên sau một in-place update (workflow step / admin edit / analytics rollup): **DataJson mới, typed rows cũ**.
- `SubmissionDataResolver.GetData()` đọc **typed-first** (`HasFields` → true, không gate theo `SupportsDataJsonCollapse`) → trả **typed rows cũ** → **mất update** khi đọc lại.

**So sánh 3 nền (đúng/sai):**
| Nền | UpdateData tự resync? | TypedResync wire? | Kết quả |
|---|---|---|---|
| **Oqtane** | ✅ có (`EfRepositories.cs:245-265`) | ❌ (không cần) | ✅ đúng |
| **DNN** | ❌ không | ✅ wire tay (`DnnServiceLocator.cs:145`, `MegaFormApiController.UpdateData`) | ✅ đúng |
| **Web/Umbraco** | ❌ không | ❌ **thiếu** | 🔴 **typed rows lệch → đọc sai** |

**Hướng fix:** đăng ký `TypedSubmissionResyncService` trong DI Web + Umbraco **và/hoặc** gate resolver theo `SupportsDataJsonCollapse` (F3). Chỉ manifest khi (a) 7 bảng đã tồn tại và (b) có in-place update — nhưng là **mất dữ liệu im lặng**, cần fix trước khi ship Web/Umbraco.

---

### 🟠 F3 (MEDIUM) — Resolver đọc typed-first **kể cả** nơi DataJson là source-of-truth (mâu thuẫn kiến trúc)
**Chỗ:** `MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs:27-49`

- Store Web/Umbraco/DNN đặt `SupportsDataJsonCollapse = false` ⇒ ý định "DataJson là nguồn thật, typed chỉ là index song song" (comment `EfSubmissionDataStore.cs:15-16,28-31`). Nhưng resolver **bỏ qua** cờ này, luôn ưu tiên typed rows khi `HasFields`.
- Đây là **gốc rễ của F2**. Nếu resolver chỉ đọc typed-first khi `_typedStore.SupportsDataJsonCollapse == true` (tức Oqtane), thì Web/Umbraco luôn đọc DataJson (đúng ý định) và F2 biến mất mà không cần wire resync.

**Hướng fix:** thêm gate `_typedStore.SupportsDataJsonCollapse` vào `HasTypedData`/`GetData`. Đây là fix **nhỏ, một điểm, an toàn nhất**.

---

### 🟠 F4 (MEDIUM) — Đường đọc resolver **không fail-soft** khi typed store lỗi/thiếu bảng
**Chỗ:** `SubmissionDataResolver.cs:29,48` (`_typedStore.HasFields(...)` không try/catch)

- Mọi lỗi typed store (thiếu bảng — F1, mất kết nối, schema drift) trở thành **exception đọc chưa xử lý**. Trái với triết lý fail-soft xuyên suốt codebase (đường ghi ở `SubmissionProcessor.cs:410` và resync đều bọc try/catch).
- Đường ghi đã fail-soft; **chỉ đường đọc là điểm yếu.**

**Hướng fix:** bọc `HasFields`/`GetData` trong try/catch → fallback `ParseDataJson(dataJsonFallback)`. Kết hợp F3 + F4 sẽ khiến Web/Umbraco **an toàn ngay cả khi WP-1 chưa chạy** (degrade về DataJson thay vì 500) — hàng rào phòng thủ tốt cho rollout.

---

### 🟡 F5 (LOW) — Nguy cơ double-resync trên Oqtane nếu ai đó đăng ký `TypedSubmissionResyncService`
- Oqtane đã self-resync trong `EfRepositories.UpdateData`. Nếu về sau có người đăng ký thêm `TypedSubmissionResyncService` vào DI Oqtane, cả hai cùng chạy. `ReplaceFields` idempotent nên **không hại dữ liệu**, chỉ tốn công. Nên **ghi rõ "ai sở hữu resync" theo từng nền** để tránh nhầm.

---

### 🟡 F6 (LOW) — `ConfiguredAppStarterService.SetSubmissionStatusAndField` vẫn `JObject.Parse(submission.DataJson)` thô
**Chỗ:** `Starters/ConfiguredAppStarterService.cs` (nhánh `SetSubmissionStatusAndField`)

- Không dùng resolver như các chỗ khác trong cùng file. **Hôm nay an toàn trên Oqtane** vì repo hydrate DataJson khi đọc (`Get` → `HydrateDataJson`), nên `submission.DataJson` đã đầy. Nhưng brittle: trên nền collapse-mà-không-hydrate sẽ ghi đè mất field.
- **Hướng fix:** đổi sang `_dataResolver.GetData(...)` cho nhất quán.

---

### 🔵 F7 (INFO) — Round-trip kiểu Number/Date khi reconstruct
- `SubmissionDataReconstructor` gom typed values → resolver/QueryService re-serialize sang JSON để flatten/summary. Number/Date có thể round-trip khác format so với DataJson gốc (vd `5` ↔ `5.0`). Đã QA OK trên :5126 (sub 54 giữ DataGrid array). Cần để mắt khi làm **WP-4 (reports/CSV parity)**.

---

### 🔵 F8 (INFO) — Working tree trộn nhiều workstream chưa commit
- Diff `DnnServiceLocator.cs`, `MegaFormComposer.cs`, `Startup.cs` đan xen **NamedConnections (07-17)** + **Umbraco backoffice authz** + typed-storage. Khi commit typed-storage nên **cherry-pick đúng file typed-storage** để lịch sử sạch, dễ review/rollback. Nhắc: `MegaForm.Umbraco/license.lic` đang bị xóa (D) trong working tree — kiểm tra có chủ đích không.

---

## 4. Xác nhận ĐÚNG (không phải finding — để yên tâm)

- **Oqtane end-to-end đúng & đã live** (§2). `EfRepositories.UpdateData:245-265` tự re-derive typed rows khi ghi DataJson thật; `HydrateDataJson:130-140` chỉ reconstruct khi collapsed (`{}`/rỗng) → workflow update không mất.
- **Submit fail-soft chuẩn:** `SubmissionProcessor.cs:391-414` — typed write bọc try/catch; collapse `UpdateData(id,"{}")` **chỉ chạy sau khi `ReplaceFields` thành công** và **chỉ trên host `SupportsDataJsonCollapse`** → không có cửa sổ mất dữ liệu.
- **DNN twin (P2) wire đầy đủ:** `DnnServiceLocator` tạo `DataResolver`+`TypedResync`, inject vào WorkflowEngine/Starter/BlogAnalytics/Email/Webhook/ScheduledPublish; `UpdateData` gọi `TypedResync.Resync` fail-soft.
- **Reconstructor đủ 6 value kind** + multi-value collapse (1 → scalar, n → list) + JSON parse an toàn (`SubmissionDataReconstructor.cs`).
- **EF mapping khớp SQL schema đã deploy** (tên index, maxlength) — đối chiếu `DataLayer.cs` mapping ↔ bảng thật trên :5126.
- **Resolver/Resync fallback an toàn khi store=null** (`new SubmissionDataResolver(null)` → chỉ parse DataJson).

---

## 5. Trạng thái Work Package (đối chiếu thực tế vs plan)

| WP | Plan | Thực tế (audit) |
|---|---|---|
| **WP-1** Schema bootstrapper Web/Umbraco | gấp nhất | 🔴 **CHƯA XONG**. Web: chưa động. Umbraco: có scaffolding migration nhưng **vô hiệu với upgrade** (F1). → làm trước. |
| **WP-2** Verify P1 reconstruction | sau WP-1 | 🟡 **Một phần**: Oqtane verified live phiên này (§2). DNN/Web/Umbraco **chưa** verify. |
| **WP-3** Backfill wiring | song song | ⚪ Chưa bắt đầu (`LegacySubmissionBackfillService.cs` đã tồn tại, chưa có endpoint admin). |
| **WP-4** Reports & Search typed | song song | ⚪ Chưa. Lưu F7. |
| **WP-5** SDK contract | song song | ⚪ Chưa. |
| **WP-6** Schema versioning/manifest | song song | ⚪ Chưa (ModuleInfo.Version hiện `1.7.108`). |
| **WP-7** Legacy cleanup | cuối | ⚪ Chưa. |

---

## 6. Khuyến nghị thứ tự (nếu tiếp tục)

1. **F3 + F4 (fix nhỏ, 1 điểm ở resolver)** — gate theo `SupportsDataJsonCollapse` + bọc try/catch. Làm việc này **trước** sẽ khiến Web/Umbraco **an toàn** (degrade về DataJson) ngay cả khi WP-1/F2 chưa xong. Đây là "phòng thủ rẻ nhất".
2. **WP-1 / F1** — schema bootstrapper 7-bảng idempotent cho Web + Umbraco (4 provider).
3. **F2** — wire `TypedSubmissionResyncService` DI Web/Umbraco (nếu chọn giữ resolver typed-first cho các nền non-collapse; nếu áp F3 thì F2 tự hết cho đường đọc, nhưng vẫn nên wire để typed rows/report chính xác).
4. **WP-2** verify DNN/Web/Umbraco end-to-end.
5. WP-3…WP-7 theo plan.

> **Không đề xuất chặn Oqtane.** Bản trên :5126 an toàn để tiếp tục test. Các finding HIGH chỉ chặn **Web/Umbraco**.

---

## 7. Lệnh tái lập bằng chứng (:5126, MSSQL)

```powershell
$conn = "Server=localhost\SQLEXPRESS;Database=Oqtane_MegaForm_Fresh1805;Integrated Security=SSPI;Encrypt=false;TrustServerCertificate=true"
Invoke-Sqlcmd -ConnectionString $conn -Query "SELECT name FROM sys.tables WHERE name LIKE 'MF_Submission%' ORDER BY name"
Invoke-Sqlcmd -ConnectionString $conn -Query "SELECT TOP 5 SubmissionId, LEN(DataJson) DjLen, LEFT(DataJson,40) DjHead FROM MF_Submissions ORDER BY SubmissionId DESC"
Invoke-Sqlcmd -ConnectionString $conn -Query "SELECT FieldKey, FieldType, DataType FROM MF_SubmissionFields WHERE SubmissionId=57"
```

Backup DLL trước hot-swap: `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\_bak_20260718_1432\` (Core.dll + Server.Oqtane.dll bản trước phiên này).
