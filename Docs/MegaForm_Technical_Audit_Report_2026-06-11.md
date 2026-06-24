# BÁO CÁO AUDIT KỸ THUẬT MEGAFORM
**Ngày audit:** 2026-06-11  
**Phạm vi:** Toàn bộ codebase MegaForm (MegaForm.Core, MegaForm.DNN, MegaForm.Oqtane.*, MegaForm.Web, MegaForm.Umbraco, MegaForm.UI, Assets)  
**Mục tiêu:** Đánh giá hiệu suất (xử lý nhiều record, load JS), code dead/thừa/lặp. **Không sửa code.**  
**Thang điểm nghiêm trọng:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low

---

## TÓM TẮT TỔNG QUAN

| Hạng mục | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Backend — DB & API Performance | 5 | 9 | 8 | 3 |
| Frontend — JS Loading & Runtime | 3 | 6 | 8 | 3 |
| Code Dead / Thừa / Lặp | 1 | 5 | 12 | 8 |
| Build & Dependencies | 2 | 6 | 9 | 6 |
| **TỔNG CỘNG** | **11** | **26** | **37** | **20** |

---

## PHẦN 1: BACKEND — HIỆU SUẤT DB & API (C#)

### 1.1 🔴 Critical: Blocking Async Patterns (`.GetAwaiter().GetResult()`) tràn lan
**Phạm vi:** ~30+ occurrences trong 15+ files  
**Các vị trí nguy hiểm nhất:**

| File | Dòng | Mô tả |
|------|------|-------|
| `MegaForm.Core/Services/Starters/LeaveRequestStarterService.cs` | 351, 372, 389, 399, 548, 566, 577, 588 | Nhiều `.GetAwaiter().GetResult()` trong sync methods |
| `MegaForm.Core/Services/Starters/DocumentExchangeStarterService.cs` | 340, 361, 378, 388, 648, 666, 677, 688 | Tương tự LeaveRequest |
| `MegaForm.Core/Services/Starters/ProposalStarterService.cs` | 339, 360, 377, 387, 600, 627, 638, 649 | Tương tự |
| `MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs` | 420, 441, 458, 468, 754, 812, 823 | Tương tự |
| `MegaForm.Core/Services/Starters/RecruitmentStarterService.cs` | 736, 756, 774, 784, 789 | Tương tự |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` | 137, 162, 187, 212, 236, 347, 357, 361 | Workflow Claim/Approve/Reject/Forward dùng `.GetAwaiter().GetResult()` trong controller actions |
| `MegaForm.DNN/WebApi/WorkflowApiController.cs` | 219, 363, 392, 421, 450, 480 | Workflow actions sync-over-async |
| `MegaForm.DNN/WebApi/AiToolsController.cs` | 2626, 2627 | `HttpClient.GetAsync(...).GetAwaiter().GetResult()` |
| `MegaForm.DNN/Views/ManageModule.ascx.cs` | 1180, 1204, 1223, 1234, 1271, 1283, 1295 | User control sync-over-async |
| `MegaForm.Oqtane.Server/Services/BlogScheduledHostedService.cs` | 58, 59 | Background service sync-over-async |
| `MegaForm.DNN/Services/BlogScheduledPublishTask.cs` | 49, 50 | Scheduled task sync-over-async |

**Mô tả:** Sync-over-async pattern gây deadlock risk, thread pool exhaustion, và giảm throughput đáng kể trên Oqtane/.NET 10 host. Các starter services chạy trong background hoặc HTTP request context đều bị ảnh hưởng.  
**Gợi ý:** Refactor toàn bộ caller chain sang `async/await` — thêm `*Async` methods vào repository interfaces và controller actions.

---

### 1.2 🔴 Critical: `ResetFormRuntimeData` OOM Risk — 7 lần `.ToList()` rồi `RemoveRange`
**File:** `MegaForm.Oqtane.Server/Services/OqtaneStarterPlatformAdapter.cs` (dòng 69–101)  
**Mô tả:** Method này load toàn bộ records từ 7 bảng khác nhau vào memory (qua `.ToList()`) rồi mới `RemoveRange`. Nếu form có hàng chục nghìn submissions, sẽ gây OutOfMemoryException. Không có transaction wrapper — lỗi giữa chừng để lại data rác.  
**Gợi ý:** Dùng `ExecuteDelete` (EF Core 7+) hoặc raw SQL `DELETE` trực tiếp. Bọc trong `BeginTransaction()`.

---

### 1.3 🔴 Critical: `ListSubmissionsWithBinding` load 5.000 records rồi filter in-memory
**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 1712–1714)  
```csharp
fetchQuery.PageSize = 5000;
```
**Mô tả:** Endpoint này load tối đa 5.000 submissions từ DB, sau đó thực hiện filter/sort/paging in-memory trên JSON data. Không những tốn memory mà còn serialize 5.000 items qua `JsonOk()`.  
**Gợi ý:** Đẩy JSON filter xuống SQL (dùng JSON path index hoặc computed columns), hoặc giảm page size xuống 100–200.

---

### 1.4 🔴 Critical: N+1 Query trong SubmissionQueryService khi liệt kê cross-form
**File:** `MegaForm.Core/Services/SubmissionQueryService.cs` (dòng 62–75)  
```csharp
foreach (var formId in tuple.Items.Select(s => s.FormId).Distinct())
{
    var form = _forms.GetForm(formId);  // ← N+1 query
}
```
**Mô tả:** Khi `query.FormId <= 0`, code lặp qua từng distinct FormId và gọi `_forms.GetForm()` riêng lẻ. Với 100 submissions thuộc 50 form khác nhau = **50 queries riêng lẻ**.  
**Gợi ý:** Thêm `GetFormsByIds(int[] formIds)` vào `IFormRepository`.

---

### 1.5 🔴 Critical: N+1 trong `WorkflowMyInbox`
**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` (dòng 66–75)  
```csharp
foreach (var formId in formIds)
{
    var form = _formRepo.GetForm(formId);  // N+1
}
```
**Gợi ý:** Dùng `Where(f => formIds.Contains(f.FormId))` hoặc batch load.

---

### 1.6 🟠 High: BulkDelete trong DNN thực hiện tuần tự từng dòng
**File:** `MegaForm.DNN/Data/DnnRepositories.cs` (dòng 106–113)  
```csharp
foreach (var id in submissionIds)
{
    FormRepository.DeleteSubmission(id);  // N round-trips
}
```
**Gợi ý:** Dùng `DELETE FROM MF_Submissions WHERE SubmissionId IN (...)`.

---

### 1.7 🟠 High: `GetFormStats` thực hiện 5 queries riêng biệt trên cùng tập dữ liệu
**File:** `MegaForm.Oqtane.Server/Data/EfRepositories.cs` (dòng 71–84)  
```csharp
TotalSubmissions = subs.Count(),
ValidSubmissions = subs.Count(s => !s.IsSpam),
SpamSubmissions = subs.Count(s => s.IsSpam),
ReadSubmissions = subs.Count(s => s.ReadOnUtc != null),
```
**Gợi ý:** Gộp thành 1 query với conditional aggregates.

---

### 1.8 🟠 High: 287 lần gọi `.ToList()` trong 78 file — nhiều khả năng không giới hạn
**Thống kê:** 287 occurrences `.ToList()`, 78 files.  
**Các vị trí nguy hiểm:**
- `MegaForm.DNN/WebApi/MegaFormApiController.cs` — 19 occurrences
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` — 25 occurrences
- `MegaForm.Oqtane.Server/Data/EfPhase2Repository.cs` — nhiều `.ToList()` không pagination (`ListAppDefinitions`, `GetFormViews`, `GetFormRelations`, `GetFormPermissions`, `GetWorkflows`)
- `MegaForm.Oqtane.Server/Services/OqtaneStarterPlatformAdapter.cs` — 9 occurrences
- `MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs` — 8 occurrences

**Mô tả:** Nhiều `.ToList()` được gọi mà không có `Skip/Take` phía trước, materialize toàn bộ result set vào memory.  
**Gợi ý:** Audit toàn bộ — chỉ materialize khi đã áp dụng pagination hoặc xác nhận dataset bounded.

---

### 1.9 🟠 High: Thiếu caching gần như toàn cục
**Thống kê:** Chỉ 94 occurrences liên quan "Cache" trong 25 files, hầu hết là comment hoặc tên biến cục bộ.  
**Không phát hiện:** `IMemoryCache`, `IDistributedCache`, hoặc bất kỳ caching layer nào trong Core/Web/Oqtane.  
**Ảnh hưởng:**
- Form schema được parse từ JSON mỗi lần render.
- `GetForm`, `GetFormStats`, `ListForms` đều query DB trực tiếp không cache.
- Permission catalog được rebuild từ DB mỗi request.

---

### 1.10 🟠 High: JSON Serialization nặng (Newtonsoft.Json) trên large objects
**Thống kê:** 222 occurrences `JsonConvert.SerializeObject` trong 63 files.  
**Vị trí đáng chú ý:**
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` — 26 occurrences, serialize lists có thể 5.000 items
- `MegaForm.Core/Services/Starters/ProposalStarterService.cs` — 13 occurrences
- `MegaForm.Core/Services/Starters/LeaveRequestStarterService.cs` — 12 occurrences
- `MegaForm.Core/Services/Starters/DocumentExchangeStarterService.cs` — 13 occurrences
- `MegaForm.Core/Services/Starters/RecruitmentStarterService.cs` — 12 occurrences
- `MegaForm.Core/Services/WorkflowEngineV2.cs` — serialize context mỗi lần node chạy

**Mô tả:** `SubmissionInfo.DataJson` được deserialize nhiều lần trong cùng một request. Không có reuse của `JObject`/`JsonDocument`.  
**Gợi ý:** Parse `DataJson` một lần thành `Dictionary<string, object>` và truyền xuống các tầng.

---

### 1.11 🟠 High: DNN `FormRepository` trả về `List<FormInfo>` không giới hạn cho `GetFormsByModule`
**File:** `MegaForm.DNN/Data/FormRepository.cs` (dòng 40–55)  
**Mô tả:** Không có `TOP` hoặc pagination. Nếu một module có hàng trăm form, toàn bộ được load vào memory.

---

### 1.12 🟠 High: Missing async/await trong nhiều data layer
**Thống kê:** Chỉ ~176 occurrences `async Task` / `Task<` trong 59 files, trong khi có hàng trăm I/O operations.  
**Các vị trí blocking:**
- `MegaForm.DNN/Data/FormRepository.cs` — toàn bộ synchronous ADO.NET.
- `MegaForm.Core/Services/SubmissionQueryService.cs` — toàn bộ synchronous.
- `MegaForm.Core/Services/DataRepeaterService.cs` — `conn.Open()`, `ExecuteReader()` đều sync.
- `MegaForm.Oqtane.Server/Data/EfRepositories.cs` — dùng `IDbContextFactory` nhưng tất cả methods sync (`SaveChanges`, `ToList`, `FirstOrDefault`).
- `MegaForm.Web/Data/EfWorkflowRepository.cs` — inject `MegaFormDbContext` scoped, tất cả sync.

---

### 1.13 🟡 Medium: Double enumeration trong Workflow Repository
**File:**
- `MegaForm.Oqtane.Server/Data/EfWorkflowRepository.cs:247-249`
- `MegaForm.Web/Data/EfWorkflowRepository.cs:232-238`
```csharp
.ToList().Select(MapTask).ToList()  // double .ToList()
```
**Gợi ý:** Dùng `.Select(r => MapTask(r)).ToList()`.

---

### 1.14 🟡 Medium: Transaction handling thiếu trong multi-table operations
**File:**
- `MegaForm.Oqtane.Server/Data/EfPhase2Repository.cs:432-445` — `SaveFormPermissions` load existing, RemoveRange, AddRange — không có transaction.
- `MegaForm.Oqtane.Server/Data/EfRepositories.cs:38-58` — `SaveForm` Add/Update đơn lẻ.
- `MegaForm.Oqtane.Server/Data/EfWorkflowRepository.cs:36-74` — `SaveDraft` + `ApplyDraft` gọi riêng lẻ.

---

### 1.15 🟡 Medium: `DataRepeaterService` dùng regex kiểm tra SQL injection trên mỗi request
**File:** `MegaForm.Core/Services/DataRepeaterService.cs` (dòng 34–36)  
**Mô tả:** Mỗi query đều qua regex scan toàn bộ SQL string. Overhead không cần thiết cho query dài hoặc tần suất cao.

---

### 1.16 🟡 Medium: `EfRepositories` tạo DbContext mới cho mỗi operation
**File:** `MegaForm.Oqtane.Server/Data/EfRepositories.cs`  
**Mô tả:** Mọi method đều `using var db = _dbContextFactory.CreateDbContext();` — mỗi repository call = 1 DbContext mới, vô hiệu hóa EF first-level cache.

---

### 1.17 🟡 Medium: In-memory permission check trên toàn bộ result set
**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1639-1647`  
**Mô tả:** `resultItems.ToList()` rồi `.Where()` in-memory cho mỗi row check permission. Nên đẩy permission predicate xuống SQL.

---

### 1.18 🟢 Low: `new byte[5]` cấp phát liên tục
**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1463`, `MegaForm.DNN/WebApi/MegaFormApiController.cs:2953`  
**Gợi ý:** Dùng `stackalloc` hoặc constant span.

---

## PHẦN 2: FRONTEND — HIỆU SUẤT JS & RUNTIME

### 2.1 🔴 Critical: Builder Loader chặn Main Thread với 29 script sequential
**File:** `MegaForm.UI/src/loader/index.ts` (dòng 357–431)  
```typescript
function loadScriptsSequential(urls: string[], onAllDone: () => void): void {
    // loads ONE at a time via script.onload = next
}
```
**Mô tả:** Loader inject 29 file JS nối tiếp nhau qua `onload` callback. Trên mạng chậm, tạo waterfall ~1–3 giây trước khi builder UI xuất hiện.

---

### 2.2 🔴 Critical: SubmissionsShell re-sort & re-parse JSON trên mọi render
**File:** `MegaForm.UI/src/submissions/SubmissionsShell.ts` (dòng 591–594, 840–852)  
```typescript
function compareSubmissions(a, b) {
    try { va = unwrapValue((JSON.parse(a.dataJson || '{}') as any)[dk]) ?? ''; } catch { va = ''; }
    try { vb = unwrapValue((JSON.parse(b.dataJson || '{}') as any)[dk]) ?? ''; } catch { vb = ''; }
}
```
**Mô tả:** Mỗi lần sort/filter: deep-clone toàn bộ list + `JSON.parse()` từng row. Với 1.000 submissions × 20 cột = **20.000 lần JSON.parse()** mỗi render.

---

### 2.3 🔴 Critical: `document.write()` được dùng trong widget Print/Preview
**File:**
- `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts:1592`
- `MegaForm.UI/src/widgets/plugins/megaform-widget-golf-scorecard.ts:944`
- `Assets/js/builder/megaform-builder-toolbar.js:110–172`

**Mô tả:** `document.write()` đã deprecated, có thể blank toàn bộ parent document nếu gọi sau `DOMContentLoaded`.

---

### 2.4 🟠 High: `inlineDynamicImports: true` tạo bundle IIFE khổng lồ
**File:** `MegaForm.UI/vite.config.ts` (dòng 256)  
```typescript
output: {
    format: 'iife',
    inlineDynamicImports: true,
}
```
**Mô tả:** Mọi entry point đều được flatten thành một file IIFE duy nhất. Shared utilities không được code-split. Builder bundle có thể > 2 MB uncompressed.

---

### 2.5 🟠 High: Tất cả CSS được inject eager — không có component-level lazy-loading
**File:** `MegaForm.UI/src/loader/index.ts` (dòng 59–93)  
**Mô tả:** 25 stylesheet được inject bất kể form có dùng widget đó hay không. ~80–150 KB CSS không dùng đến được parse trên critical render path.

---

### 2.6 🟠 High: ListView Runtime thiếu Virtual Scrolling
**File:** `MegaForm.UI/src/listview/runtime.ts` (dòng 175–180)  
**Mô tả:** Khi admin đặt `pageSize: 1000`, runtime render 1.000 DOM rows cùng lúc. Template dùng string concatenation (`map().join('')`) rồi inject qua `innerHTML`.

---

### 2.7 🟠 High: Memory Leak từ `setInterval` không được clear
**Các vị trí:**
| File | Dòng | Mô tả |
|------|------|-------|
| `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts` | 1605 | `refreshTimer = setInterval(...)` không clear khi widget unmount |
| `MegaForm.UI/src/builder/db-tables-panel.ts` | 269 | `setInterval(refreshIfFormChanged, 1200)` không lưu handle |
| `MegaForm.UI/src/renderer/index.ts` | 1301–1303 | Payment watcher interval không có stop condition |

---

### 2.8 🟠 High: 1.018 lần gán `.innerHTML` — XSS surface khổng lồ
**Thống kê:** 1.018 matches `.innerHTML =` trong `MegaForm.UI/src/**/*.ts`.  
**Vị trí rủi ro cao:**
- `MegaForm.UI/src/builder/dom.ts`
- `MegaForm.UI/src/renderer/index.ts`
- `MegaForm.UI/src/listview/runtime.ts`
- `MegaForm.UI/src/dashboard/index.ts`

---

### 2.9 🟠 High: Event listener trên `document`/`window` không cleanup
**File:** `MegaForm.UI/src/builder/canvas.ts` (dòng 1420–1422, 1581–1583)  
**Mô tả:** Global listeners thêm trong drag operations không remove trong `finally` hoặc on unmount. Exception giữa drag = listener leak vĩnh viễn.

---

### 2.10 🟡 Medium: Success Poller trong ListView Modal chạy 10 phút
**File:** `MegaForm.UI/src/listview/runtime.ts` (dòng 936–937)  
```typescript
const successPoller = window.setInterval(() => { if (detectSuccess()) fireOnce(); }, 600);
window.setTimeout(() => window.clearInterval(successPoller), 600000);
```

---

### 2.11 🟡 Medium: Duplicate React/ReactDOM Assets
**File:** `Assets/js/builder/react.production.min.js`, `react-dom.production.min.js`, `reactflow.min.js`  
**Mô tả:** React tồn tại cả như standalone script và được bundle bên trong `megaform-workflow-reactflow.js`. React có thể được parse/execute hai lần.

---

### 2.12 🟡 Medium: `sessionStorage`/`localStorage` access không feature-detect
**File:** `MegaForm.UI/src/builder/index.ts` — `sessionStorage.setItem()` gọi trực tiếp.  
**Mô tả:** Safari private mode hoặc storage disabled sẽ throw, có thể break builder boot.

---

### 2.13 🟡 Medium: Builder Canvas Re-renders toàn bộ field list trên mọi thay đổi
**File:** `MegaForm.UI/src/builder/canvas.ts`  
**Mô tả:** Mỗi field addition/deletion/reorder trigger full re-render canvas. Form 50+ fields gây jank khi drag.

---

## PHẦN 3: CODE DEAD / THỪA / LẶP

### 3.1 🔴 Critical: 9 cặp Duplicate Controllers giữa DNN và Oqtane
**Phạm vi:** Cùng filename, cùng REST contract, cùng business logic, chỉ khác base class (`DnnApiController` vs `ModuleControllerBase`). Mọi bug fix/feature phải sửa 2 nơi.

| DNN Path | Oqtane Path | Mô tả |
|----------|-------------|-------|
| `MegaForm.DNN/WebApi/AiAssistantController.cs` | `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs` | DefaultConfig GET/POST. Oqtane dài hơn 3x do ResolveSiteId(). |
| `MegaForm.DNN/WebApi/AiKnowledgeController.cs` | `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs` | CRUD AI KB. Gần như mirror. |
| `MegaForm.DNN/WebApi/AiKnowledgeFeedbackController.cs` | `MegaForm.Oqtane.Server/Controllers/AiKnowledgeFeedbackController.cs` | Feedback loop. Mirror. |
| `MegaForm.DNN/WebApi/AiKnowledgeRulesController.cs` | `MegaForm.Oqtane.Server/Controllers/AiKnowledgeRulesController.cs` | Rules CRUD. Mirror. |
| `MegaForm.DNN/WebApi/AiKnowledgeTemplatesController.cs` | `MegaForm.Oqtane.Server/Controllers/AiKnowledgeTemplatesController.cs` | Templates CRUD. Mirror. |
| `MegaForm.DNN/WebApi/AiToolsController.cs` | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` | AI Tools (ExecuteDdl, etc.). Mirror. |
| `MegaForm.DNN/WebApi/RazorWidgetController.cs` | `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` | Widget rendering. Mirror. |
| `MegaForm.DNN/WebApi/SubformController.cs` | `MegaForm.Oqtane.Server/Controllers/SubformController.cs` | Subform API. Mirror. |
| `MegaForm.DNN/WebApi/UserTemplateController.cs` | `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs` | User template API. Mirror. |

**Gợi ý:** Trích xuất business logic chung vào `MegaForm.Core.Services`, để DNN/Oqtane controller chỉ còn là thin adapter (bind request/response).

---

### 3.2 🟠 High: Thư mục legacy builder trong `Assets/js/builder/`
**Thư mục:** `Assets/js/builder/` (18 file JS)  
**Mô tả:** `megaform-builder-canvas.js`, `megaform-builder-core.js`, `megaform-builder-dom.js`, v.v. có vẻ là phiên bản builder cũ (pre-Vite). Hiện builder bundle qua Vite (`megaform-builder.js` trong `bundles/`). Các file cũ vẫn được deploy.  
**Dung lượng ước tính:** ~800 KB–1.2 MB dead code.

---

### 3.3 🟠 High: File `Old` đã bị exclude khỏi compile nhưng vẫn trong repo
**File:**
- `MegaForm.DNN/Views/FormEditOld.ascx.cs` (bị `<Compile Remove>`)
- `MegaForm.DNN/Views/FormViewOld.ascx.cs` (bị `<Compile Remove>`)
- `MegaForm.DNN/Views/FormEditOld.ascx` (bị `<Content Remove>`)
- `MegaForm.DNN/Views/FormViewOld.ascx` (bị `<Content Remove>`)

---

### 3.4 🟠 High: Widget/JS/File cũ không còn được reference
**File trong `Assets/js` không được server render/inject:**
- `Assets/js/megaform-ai-knowledge.js`
- `Assets/js/megaform-datarepeater-designer.js`
- `Assets/js/megaform-golf-designer.js` — Golf Designer đã retired
- `Assets/js/megaform-gridrepeater-designer.js`
- `Assets/js/megaform-layout-designer.js`
- `Assets/js/megaform-presets.js`
- `Assets/js/megaform-theme-designer-patch.js`
- `Assets/js/megaform-unified-monaco.js`
- `Assets/js/plugins/megaform-razor-studio.js`
- `Assets/js/plugins/megaform-widget-datagrid-studio.js`
- `Assets/js/plugins/megaform-widget-map.js`
- `Assets/js/plugins/megaform-widget-terms-privacy.js`

---

### 3.5 🟠 High: Umbraco Repositories hoàn toàn là Stub
**File:** `MegaForm.Umbraco/Data/EfRepositories.cs`  
**Các class:**
- `UmbracoDraftRepository` (dòng 147–154): return 0/null
- `UmbracoFileRepository` (dòng 156–161): stub hoàn toàn
- `UmbracoPhase2Repository` (dòng 186–202): phần lớn return `new()` hoặc no-op

**File:** `MegaForm.Umbraco/Services/PlatformServices.cs`  
- `UserEmail`: `return ""; // TODO`
- `HasPermission`: `// TODO: integrate with Umbraco's permission system`

---

### 3.6 🟠 High: Duplicate logic cross-platform
**Quan sát:**
- `MegaForm.Oqtane.Server/Data/EfWorkflowRepository.cs` và `MegaForm.Web/Data/EfWorkflowRepository.cs` — 95% giống nhau (`MapTask`, `MapCase`, `MapAction`, `BumpDraftVersion`).
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` và `MegaForm.DNN/WebApi/MegaFormApiController.cs` — `ListSubmissions`, `Apply*ListViewQuery`, `CanViewSubmissionRow` gần như copy-paste.
- Permission check logic trùng lặp giữa DNN và Oqtane controllers.
- ListView Query Logic: `ApplyConfiguredAppListViewQuery` vs `ApplyDnnListViewQuery` — cùng các case "public-posts", "featured-posts", v.v.
- `BuilderTemplateCatalogService.cs` tồn tại ở 3 platform (`Web/`, `DNN/`, `Oqtane.Server/`) với logic diverged (254, 62, 26 dòng).

---

### 3.7 🟡 Medium: DNN Anti-Spam Stub
**File:** `MegaForm.DNN/Data/DnnRepositoryAdapters.cs:217-218`  
```csharp
public int GetRecentSubmissionCount(string ipAddress, int windowMinutes) => 0;
public void InsertRateLimitEntry(string ipAddress, int formId) { }
```
**Mô tả:** Rate limiting trên DNN hoàn toàn không hoạt động (return 0 / no-op).

---

### 3.8 🟡 Medium: Dead C# Classes/Models (0 external references)

| File Path | Tên | Mô tả |
|-----------|-----|-------|
| `MegaForm.Core/Services/FormAssetManifestService.cs` | `FormAssetManifestService` | Không đăng ký DI, không gọi. Model `FormAssetManifest` chỉ dùng nội bộ trong file. |
| `MegaForm.Core/Models/DataRepeaterModels.cs` | `DataRepeaterExportRequest` | Model export, 0 ref. |
| `MegaForm.Core/Models/WorkflowModels.cs` | `DatabaseFieldMapping` | Sub-model workflow config, không deserialize. |
| `MegaForm.Core/Models/LifecycleConfig.cs` | `DataGridRowLifecycle` | Không reference. |
| `MegaForm.Core/Interfaces/ICoreInterfaces.cs` | `StyleSettings` | POCO style, không reference. |
| `MegaForm.Core/Models/Phase2Models.cs` | `WorkflowRunInfo` | Không thấy mapper/service gọi. |
| `MegaForm.Core/Services/Subform/SubformModels.cs` | `SubformProps` | Không serialize/deserialize. |
| `MegaForm.Core/Services/Subform/SubformModels.cs` | `SubformSaveRequest` | DTO subform save, 0 ref. |

---

### 3.9 🟡 Medium: Dead C# Methods
**File:** `MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs`  
- `BuildSendEmail_Obsolete()` (dòng 41) — private static, không được gọi
- `BuildWebhook_Obsolete()` (dòng 96) — private static, không được gọi

---

### 3.10 🟡 Medium: Dead TS/JS Files trong `MegaForm.UI/src` (không phải entry point, không được import)

| File Path | Mô tả |
|-----------|-------|
| `MegaForm.UI/src/builder/workflow/wf-loop.ts` | Loop node UI, không import trong `builder/workflow/index.ts` |
| `MegaForm.UI/src/builder/workflow/wf-switch.ts` | Switch node UI, không import |
| `MegaForm.UI/src/builder/workflow-canvas.ts` | Canvas file cũ, không phải entry point |
| `MegaForm.UI/src/builder/patches/megaform-template-gallery-search.ts` | Patch file không được apply |
| `MegaForm.UI/src/theme-designer/inspector-structure-tree.ts` | Inspector v4 tree, không import |
| `MegaForm.UI/src/theme-designer/inspector-v4.ts` | Inspector v4, không import |
| `MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid-studio.ts` | Studio plugin orphan |
| `MegaForm.UI/src/renderer/validation-extra.ts` | Validation helper orphan |
| `MegaForm.UI/src/theme-designer/preview-standard-shell.ts` | Preview shell orphan |
| `MegaForm.UI/src/workflow-inbox/task-detail-actions.ts` | Task actions helper orphan |

---

### 3.11 🟡 Medium: 127 Duplicate Assets giữa các Platform
**Mô tả:** JS/CSS/Images trong `Assets/` được copy đồng bộ sang `MegaForm.Web/wwwroot/`, `MegaForm.Oqtane.Server/wwwroot/`, `MegaForm.Umbraco/wwwroot/` qua `syncPlatforms`. Có **127 file trùng lặp hoàn toàn** giữa ít nhất 3 platform.  
**Gợi ý:** Bỏ `Assets/` làm source of truth duy nhất, xóa các thư mục `wwwroot` khỏi git (thêm `.gitignore`), chỉ giữ trong build artifact.

---

### 3.12 🟡 Medium: `NoOpWorkflowEngine` không được đăng ký DI
**File:** `MegaForm.Oqtane.Server/Services/NoOpWorkflowEngine.cs`  
**Mô tả:** Implement `IWorkflowEngine` nhưng không thấy `services.AddScoped<NoOpWorkflowEngine>()` hay bất kỳ `new` nào. Oqtane đã dùng `WorkflowEngineV2`.

---

### 3.13 🟡 Medium: Unused CSS Files
**File:**
- `Assets/css/acme-blog-mock.css` — Mock theme, không thấy server gắn link.
- `Assets/css/megaform-admin.css` — Có `megaform-admin-shell.css` và `megaform-admin-live.css` thay thế.
- `Assets/css/plugins/megaform-widget-subform.css` — Subform plugin CSS không được include.

---

### 3.14 🟢 Low: Unused Images
**File:**
- `MegaForm.DNN/Images/icon.gif` — 0 reference
- `MegaForm.DNN/Images/module-icon.png` — 0 reference

---

### 3.15 🟢 Low: Commented code blocks cũ
**File:** `MegaForm.DNN/UserTemplates/AscxHostWidget.cs` (dòng 30–70, 54–61)  
**Mô tả:** Block comment chứa toàn bộ sample code C# (OnInit, foreach, HostUserAscx call, class BlogCard với Page_Load).

---

### 3.16 🟢 Low: Duplicate Export Folders
**Thư mục:** `_export_cascading_sql/` và `_export_cascading_sql_v2/`  
**Mô tả:** Hai thư mục export demo gần như giống hệt nhau.

---

### 3.17 🟢 Low: `node_modules` ở repo root
**Thư mục:** `node_modules/` (root level, ~17 MB)  
**Mô tả:** Chỉ chứa `playwright` và `playwright-core`. Không nên commit vào Git.

---

### 3.18 🟢 Low: Badge / Diagnostic strings trong production bundles
**File:** Hầu hết file `.js` đã compile  
**Ví dụ:**
```typescript
const SUBMISSIONS_SHELL_BADGE = 'SubmissionsShell v20260609-B104';
(window as any).__MF_SUBMISSIONS_SHELL_BADGE__ = SUBMISSIONS_SHELL_BADGE;
```
**Mô tả:** Hàng chục version badge được ship trong minified code, thêm ~2–5 KB/bundle và expose internal build numbers.

---

### 3.19 🟢 Low: Unused `dbStrings` import
**File:** `MegaForm.UI/src/builder/dom.ts` (dòng 13)  
```typescript
import dbStrings from './db-tables-strings.json';
```

---

### 3.20 🟢 Low: Commented-out legacy tabs trong Builder DOM
**File:** `MegaForm.UI/src/builder/dom.ts` (dòng ~846)  
```typescript
// rightTab('ai',       'fa-robot',                  'AI Assistant',     'AI') +
```

---

### 3.21 🟢 Low: `void badge` no-ops trong production
**File:** `MegaForm.UI/src/builder/dom.ts` (dòng 143, 381, 382)  
```typescript
void dnnReturnUrlCleanBadge;
void rendererHostLinkBadge;
```

---

## PHẦN 4: BUILD & DEPENDENCIES

### 4.1 🔴 Critical: JWT Secret Key hardcoded trong production config
**File:** `MegaForm.Web/appsettings.Production.json`  
```json
"Key": "sKlz444feOmBHTj84YeyOGxkgDMGB7wdVtF6CsnmaEFpR1a/UP8UO84q7mQEEeVk"
```
**Mô tả:** JWT signing key hardcoded và committed vào source control. **Bất kỳ ai có access repo đều có thể forge JWT tokens.**  
**Gợi ý:** Chuyển sang environment variable / Azure Key Vault / .NET User Secrets ngay lập tức.

---

### 4.2 🔴 Critical: `megaform-unified-monaco.js` 3.9 MB
**File:** `Assets/js/megaform-unified-monaco.js`  
**Mô tả:** Monaco Editor (~5 MB raw) được bundle riêng nhưng vẫn quá lớn. Nếu không có gzip/Brotli, user tải 3.9 MB JavaScript chỉ để edit code.

---

### 4.3 🟠 High: Source maps (.map) được ship cùng production
**Thống kê:** Mỗi file `.js` đều có `.js.map` đi kèm trong `Assets/js/`.  
**Ví dụ:**
- `megaform-dashboard.js` 283 KB + `.map` 669 KB
- `megaform-ai-form-assistant.js` 151 KB + `.map` 428 KB

**Mô tả:** Source map gấp 2–3 lần kích thước bundle. Nên upload riêng lên error-tracking service (Sentry) thay vì ship cùng web server.

---

### 4.4 🟠 High: NuGet Component Package tightly coupled với Web Host
**File:** `MegaForm.AspNetCore.Component/MegaForm.AspNetCore.Component.csproj`  
```xml
<ProjectReference Include="..\MegaForm.Web\MegaForm.Web.csproj" />
```
**Mô tả:** Package NuGet (được thiết kế để publish lên NuGet Gallery) lại reference trực tiếp `MegaForm.Web` — một ASP.NET Core Web host project. Người dùng package sẽ bị kéo theo toàn bộ Web host stack (EF Core, JWT, Swagger, tất cả DB providers).

---

### 4.5 🟠 High: Blazor WebAssembly IL Linking bị tắt
**File:** `MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj`  
```xml
<BlazorWebAssemblyEnableLinking>false</BlazorWebAssemblyEnableLinking>
```
**Mô tả:** Tree-shaking/IL linking hoàn toàn bị disable. Blazor WASM bundle chứa toàn bộ framework assemblies và dependencies dù không dùng đến.

---

### 4.6 🟠 High: `CopyLocalLockFileAssemblies` gây bin bloat
**File:** `MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj`  
```xml
<CopyLocalLockFileAssemblies>true</CopyLocalLockFileAssemblies>
```
**Mô tả:** Copy toàn bộ NuGet dependencies vào `bin/`. Kết hợp với 4 DB providers, `bin/` chứa hàng trăm DLL (Azure SDK, BouncyCastle, Protobuf, MailKit, MySql, Npgsql, Pomelo...). Khi pack vào `.nuspec`, các DLL này có thể xung đột với assemblies của Oqtane host.

---

### 4.7 🟠 High: `Microsoft.AspNetCore.Razor.Language` 6.0.36 trong project .NET 10
**File:** `MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj`  
```xml
<PackageReference Include="Microsoft.AspNetCore.Razor.Language" Version="6.0.36" />
```
**Mô tả:** Project target `net10.0` nhưng dùng Razor.Language từ .NET 6 era. Có thể gây runtime incompatibility khi compile `.razor` files.

---

### 4.8 🟡 Medium: Multi-target frameworks quá nhiều trong Core library
**File:** `MegaForm.Core/MegaForm.Core.csproj`  
```xml
<TargetFrameworks>net472;net8.0;net9.0;net10.0</TargetFrameworks>
```
**Mô tả:** `net8.0` và `net9.0` là redundant khi đã có `net10.0` và `net472`. Mỗi target làm tăng thời gian build, restore, và pack.

---

### 4.9 🟡 Medium: Tất cả DB providers được reference cứng trong Web project
**File:** `MegaForm.Web/MegaForm.Web.csproj`  
**Mô tả:** 4 EF Core providers (SqlServer, SQLite, PostgreSQL, MySql) + 4 ADO.NET providers reference trực tiếp trong cùng một project. Tăng deployment size ~49MB+ trong `bin/Release/net10.0/`.

---

### 4.10 🟡 Medium: `emptyOutDir: false` — stale artifacts tích lũy
**File:** `MegaForm.UI/vite.config.ts`  
```typescript
emptyOutDir: false
```
**Mô tả:** File cũ trong `Assets/js/` không bị xóa khi build. Dễ dẫn đến deploy nhầm file deprecated hoặc source map của version cũ.

---

### 4.11 🟡 Medium: Floating version cho Umbraco package
**File:** `MegaForm.Umbraco/MegaForm.Umbraco.csproj`  
```xml
<PackageReference Include="Umbraco.Cms.Web.Common" Version="14.*" />
```
**Mô tả:** Build không deterministic — restore có thể lấy version khác nhau trên các máy.

---

### 4.12 🟡 Medium: Production config dùng SQLite
**File:** `MegaForm.Web/appsettings.Production.json`  
```json
"Provider": "Sqlite",
"MegaForm": "Data Source=App_Data/MegaForm/megaform.db"
```
**Mô tả:** Production environment được cấu hình dùng SQLite (file-based) thay vì SQL Server/PostgreSQL. SQLite không phù hợp cho concurrent writes và production scale.

---

### 4.13 🟡 Medium: Production config thiếu Logging override
**File:** `MegaForm.Web/appsettings.Production.json`  
**Mô tả:** Không có section `Logging`. Fallback về `appsettings.json` với `"Default": "Information"`. Trong production nên giảm xuống `"Warning"`.

---

### 4.14 🟡 Medium: `AllowedHosts` wildcard
**File:** `MegaForm.Web/appsettings.json`  
```json
"AllowedHosts": "*"
```

---

### 4.15 🟡 Medium: Production email SMTP trỏ về localhost
**File:** `MegaForm.Web/appsettings.Production.json`  
```json
"Host": "localhost", "Port": "25"
```

---

### 4.16 🟡 Medium: Nullable/ImplicitUsings inconsistent giữa các .NET projects
**File:** `MegaForm.Web.csproj`, `MegaForm.AspNetCore.Component.csproj`, `MegaForm.Umbraco.csproj`  
```xml
<Nullable>disable</Nullable>
```
**Mô tả:** Các project .NET modern target net8.0/net9.0/net10.0 lại disable nullable reference types.

---

### 4.17 🟡 Medium: Core library không generate documentation
**File:** `MegaForm.Core/MegaForm.Core.csproj`  
```xml
<GenerateDocumentationFile>false</GenerateDocumentationFile>
```

---

### 4.18 🟢 Low: Dapper version cũ (2.0.123 ~2022)
**File:** `MegaForm.DNN/MegaForm.DNN.csproj`  
**Mô tả:** Latest stable là 2.1.35 (2024).

---

### 4.19 🟢 Low: Vite 5.4.21 chưa lên 6.x
**File:** `MegaForm.UI/package.json`  

---

### 4.20 🟢 Low: TypeScript 5.4.0 chưa mới nhất
**File:** `MegaForm.UI/package.json`  

---

## PHẦN 5: KHUYẾN NGHỊ ƯU TIÊN

### Priority 0 — Critical (Làm ngay, ảnh hưởng security/availability)
1. **Xoá JWT key hardcoded** trong `appsettings.Production.json`; chuyển sang env var / Key Vault.
2. **Sửa blocking async**: Chuyển TẤT CẢ `.GetAwaiter().GetResult()` sang `await` (Controllers, Starters, HostedServices, DNN WebAPI).
3. **Fix `ResetFormRuntimeData` OOM**: Dùng `ExecuteDelete` hoặc raw SQL `DELETE` thay vì `.ToList()` + `RemoveRange`. Bọc trong transaction.
4. **Fix `ListSubmissionsWithBinding` in-memory paging**: Giảm page size 5000 → 100–200, đẩy JSON filter xuống SQL.
5. **Batch load form titles/schemas** trong `SubmissionQueryService` để fix N+1 cross-form.
6. **Thay `document.write()`** bằng `iframe.srcdoc` trong print/preview widgets.

### Priority 1 — High (Trong sprint tới, ảnh hưởng performance/latency)
7. **Async Repositories**: Thêm `*Async` methods vào tất cả interfaces (`IFormRepository`, `ISubmissionRepository`, `IWorkflowRepository`, `IPhase2Repository`).
8. **Tắt source maps trong production deploy** — upload riêng lên Sentry.
9. **Tách `MegaForm.AspNetCore.Component`** khỏi dependency `MegaForm.Web`; chỉ reference `MegaForm.Core`.
10. **Bật lại `BlazorWebAssemblyEnableLinking`** hoặc chuyển sang `PublishTrimmed`.
11. **Xóa file legacy** (`Form*Old.*`, `Assets/js/builder/*.js` cũ, golf-designer, theme-designer standalone).
12. **Memoize SubmissionsShell** — parse `dataJson` một lần khi fetch, lưu Map.
13. **Audit & clear tất cả `setInterval`/`setTimeout`** (data-repeater, db-tables-panel, payment watcher).
14. **Upgrade `Microsoft.AspNetCore.Razor.Language`** lên >= 10.0.x.

### Priority 2 — Medium (Backlog kỹ thuật, ảnh hưởng maintainability)
15. **Thêm `IMemoryCache`** cho form definitions, schemas, permission catalog, app scopes.
16. **Giảm `TargetFrameworks`** trong `MegaForm.Core` xuống `net472;net10.0`.
17. **Centralize package versions** qua `Directory.Packages.props`.
18. **Thêm virtual scrolling** cho ListView và Submissions table khi page size > 50.
19. **Deduplicate logic**: Merge `EfWorkflowRepository` Oqtane/Web, tạo shared `SubmissionListService`, `SubmissionPermissionService`.
20. **Tái cấu trúc 9 cặp Duplicate Controller**: Trích xuất business logic vào `MegaForm.Core.Services`, DNN/Oqtane chỉ còn thin adapter.
21. **Giảm DB provider coupling** trong `MegaForm.Web` — chuyển sang plugin model hoặc conditional reference.
22. **Đưa `Assets/qa/`, `.playwright-mcp/`, `_backup_*` vào `.gitignore`** và purge khỏi Git history.
23. **Feature-detect `localStorage`/`sessionStorage`** trước khi dùng.
24. **Dọn dead C# models/services**: Xóa `FormAssetManifestService`, `DataRepeaterExportRequest`, `DatabaseFieldMapping`, `DataGridRowLifecycle`, `StyleSettings`, `WorkflowRunInfo`, `SubformProps`, `SubformSaveRequest` sau khi xác nhận không có reflection/dynamic usage.
25. **Dọn dead TS/JS**: Xóa các file trong mục 3.10 (đặc biệt `wf-loop.ts`, `wf-switch.ts`, `workflow-canvas.ts`, `inspector-v4.ts`).
26. **Review 127 duplicate assets**: Bỏ `Assets/` làm source of truth duy nhất, xóa các thư mục `wwwroot` khỏi git.

### Priority 3 — Low (Maintenance sprint)
27. **Update Dapper, Vite, TypeScript** lên versions mới nhất.
28. **Bật `GenerateDocumentationFile=true`** trong `MegaForm.Core`.
29. **Enable nullable reference types** cho tất cả .NET modern projects.
30. **Xoá root `package.json`** hoặc chuyển thành workspace root.
31. **Review 1.018 `.innerHTML` assignments** — migrate dần sang `textContent` / DOM API / DOMPurify.
32. **Xóa unused CSS** (`acme-blog-mock.css`, `megaform-admin.css`, `megaform-widget-subform.css`) và unused images.
33. **Xóa `NoOpWorkflowEngine`** nếu Oqtane đã hoàn toàn dùng `WorkflowEngineV2`.

---

## PHỤ LỤC: THỐNG KÊ NHANH

| Chỉ số | Giá trị |
|--------|---------|
| Tổng file C# | ~400+ |
| Tổng file TypeScript | 255+ |
| Số bundle JS entry points | 28+ |
| Bundle JS lớn nhất | `megaform-unified-monaco.js` (3.9 MB) |
| Tổng dung lượng `Assets/js/` (không map) | ~4.5 MB |
| Tổng dung lượng `.map` files | ~10+ MB |
| `.ToList()` occurrences | 287 (78 files) |
| `JsonConvert.SerializeObject` occurrences | 222 (63 files) |
| `.innerHTML =` occurrences | 1.018 |
| `addEventListener`/`removeEventListener` occurrences | 607 |
| `.GetAwaiter().GetResult()` occurrences | ~30+ (15+ files) |
| Cache usage occurrences | 94 (25 files) — hầu hết comment/tên biến |
| File `Old` / legacy trong repo | 8+ files |
| Dung lượng QA/backup/logs trong repo | ~43+ MB |
| Duplicate Controllers (DNN ↔ Oqtane) | 9 cặp |
| Duplicate Assets giữa platform | 127 files |
| Dead C# Classes/Models | 8 |
| Dead TS/JS Files | 22 |
| Unused CSS | 3 |
| Unused Images | 2 |

---

*Kết thúc báo cáo audit. Không có thay đổi code nào được thực hiện.*
