# MegaForm — Roadmap: Cloud-Ready Workflow Engine (Track A) + BPMN 2.0 Importer (Track B)

> Ngày: 2026-08-04. Quyết định đã chốt: Track A (cloud-ready) + Phương án 2 (giữ engine tự chế, thêm BPMN 2.0 XML importer map về node types hiện có — KHÔNG thay engine).

## 0. Xác nhận trạng thái code — các điểm cần lưu ý

Đã đọc trực tiếp: `SubmissionProcessor.cs`, `WorkflowEngineV2.cs`, `WorkflowModels.cs`, `WorkflowHumanTaskModels.cs`, `ApprovalNodeExecutor.cs`, `IWorkflowInterfaces.cs`, `MegaForm.Web/Program.cs`, `DatabaseConfig.cs`, `WebStorageService.cs`, `AdminAuthController.cs`, `SetupMiddleware.cs`, `EfWorkflowRepository.cs`, `DnnWorkflowRepository.cs`, `DatabaseSchemaBootstrapper.cs`, `IStorageProvider.cs`, `WorkflowLibraryModels.cs`, `MegaForm.Web.Host/Program.cs`.

**Các phát hiện quan trọng (ảnh hưởng estimate):**

1. **Per-row submission authorization trên Web host ĐÃ CÓ** — `MegaForm.Web/Controllers/MegaFormController.SubmissionSecurity.cs` (`[WebRLS v20260712]`, port `CanViewSubmissionRow` / `CanUseSubmissionManagement` từ Oqtane). Task A5 chỉ còn audit coverage + scope theo tenant, không xây từ đầu.
2. **Azure Blob provider đã bị xóa có chủ đích** (`Program.cs:123`: `[AzureBlobRemoved v20260726] Azure.Core net472 crash risk`). Provider Azure Blob mới **không được đặt trong `MegaForm.Core` hay `MegaForm.Integrations.CloudStorage`** (cả hai net472); chỉ thêm ở host net9 (`MegaForm.Web`).
3. **`MegaForm.Web` KHÔNG có workflow library**: không có `EfWorkflowLibraryRepository`, `Program.cs` không đăng ký `IWorkflowLibraryRepository` (chỉ Oqtane `Services/Startup.cs:154` và Umbraco có). `WorkflowEngineV2` chạy trên Web với `_libraryRepo = null`, fallback legacy `MF_Forms.WorkflowJson`. Hệ quả: BPMN import trên Web v1 chỉ import thành **form draft**; import-to-library trên Web cần port repo + bảng (gộp vào A4).
4. **`WorkflowTaskInstance.DueAt` đã tồn tại** (`WorkflowHumanTaskModels.cs:125`), set từ `ApprovalNodeConfig.DueInHours` (`ApprovalNodeExecutor.cs:245-246`); `WorkflowTaskService.cs:137` đã đếm overdue — nhưng **không có scanner/escalation**. `MF_WorkflowExecutions` chưa có cột wait-until (`WorkflowExecutionRow` tại `EfWorkflowRepository.cs:395`).
5. **Không có node type "Start"** trong `WorkflowNodeType` — `WorkflowDefinition.StartNodeId` chỉ là con trỏ string. BPMN `startEvent` map thành "set StartNodeId".
6. **`Delay = 21` đã có trong enum nhưng không nằm trong `SupportedNodeTypes.All`** (`WorkflowModels.cs:69-86`), không có executor.
7. **Submit response không phụ thuộc workflow** — `SubmissionResult` build xong tại `SubmissionProcessor.cs:449-454`; `ctx` từ `ExecuteAsync` (line 566) chỉ dùng để log. Decoupling an toàn về response contract.
8. Tiền lệ scheduler có sẵn: DNN `MegaForm.DNN/Services/BlogScheduledPublishTask.cs` (`SchedulerClient`), Oqtane `BlogScheduledHostedService`, Web có 3 hosted service. Không cần invent pattern mới.
9. **4 host runtime**: `MegaForm.Web`, `MegaForm.Web.Host` (thin, qua `MegaForm.AspNetCore.Component.AddMegaForm()`), `MegaForm.Oqtane.Server`, `MegaForm.Umbraco(.Host)`, `MegaForm.DNN`. Mọi thay đổi DI/schema của Web phải nhân bản cho `MegaForm.AspNetCore.Component`. Chưa có Dockerfile. Test project duy nhất: `MegaForm.Sdk.Tests`.
10. `MegaForm.Core.csproj`: net472 bị khóa `LangVersion 7.3`; vì cùng file compile cho mọi TFM, **mọi code mới trong Core phải C# 7.3-safe** (không records, switch expressions, target-typed new, DIM).

---

## TRACK A — CLOUD-READY WORKFLOW ENGINE

### Task A1 — Async execution decoupling (queue + worker)

**Goal:** Submit HTTP trả về ngay sau khi persist submission + enqueue; workflow chạy trong background worker, an toàn multi-instance.

**Files tạo/sửa:**

- `MegaForm.Core/Interfaces/IWorkflowExecutionQueue.cs` *(mới, C# 7.3)*:
  ```csharp
  public interface IWorkflowExecutionQueue
  {
      string Enqueue(WorkflowExecutionRequest request); // sync, khớp phong cách IWorkflowRepository hiện hữu
  }
  public class WorkflowExecutionRequest
  {
      public int FormId; public int SubmissionId;
      public Dictionary<string,object> FormData;
      public DateTime EnqueuedAtUtc;
  }
  ```
- `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs` *(hoặc file mới)*: `IWorkflowExecutionModeProvider { WorkflowExecutionMode GetMode(int portalId); }`, `enum WorkflowExecutionMode { Sync = 1, Queued = 2 }`. **Default = Sync** để DNN/Umbraco không đổi hành vi.
- `MegaForm.Core/Services/SubmissionProcessor.cs` (~line 538-579): tách block `ExecuteAsync` thành: nếu `_workflowQueue != null && mode == Queued` → `_workflowQueue.Enqueue(...)`; else giữ sync path hiện tại (CTS 300s line 563-565 giữ nguyên). Thêm 2 ctor param optional theo đúng pattern đang dùng trong file (`_draftRepo`, `_documentRevisionService`...). Worker gọi lại `IWorkflowEngine.ExecuteAsync` như cũ — engine tự `SaveExecution`/`UpdateExecution`.
- Web:
  - `MegaForm.Web/Data/EfWorkflowExecutionQueue.cs` *(mới)*: bảng `MF_WorkflowQueue` (`QueueId` PK, `FormId`, `SubmissionId`, `PayloadJson`, `Status` queued/leased/done/failed, `AttemptCount`, `LeasedBy`, `LeaseUntilUtc`, `CreatedAtUtc`, `ProcessedAtUtc`).
  - `MegaForm.Web/HostedServices/WorkflowQueueWorkerService.cs` *(mới)*: `BackgroundService`, poll 5s, claim bằng lease pattern (conditional UPDATE `Status='leased'` với `LeaseUntilUtc` hết hạn thì nhặt lại). Mỗi item: scope mới qua `IServiceScopeFactory` (engine + executors đều Scoped — `Program.cs:67-87`), deserialize payload, gọi `ExecuteAsync`. Retry: `AttemptCount++`, backoff qua `LeaseUntilUtc`; sau 5 lần → `failed`.
  - `MegaForm.Web/Program.cs`: đăng ký queue + `AddHostedService<WorkflowQueueWorkerService>()`, config `Workflow:ExecutionMode` (`sync` default / `queue`). **Nhân bản vào `MegaForm.AspNetCore.Component`** (vì `MegaForm.Web.Host/Program.cs:7` dùng `AddMegaForm()`).
- Oqtane: `MegaForm.Oqtane.Server/Services/WorkflowQueueWorkerHostedService.cs` theo pattern `BlogScheduledHostedService.cs` (`IHostedService` + `IDbContextFactory`), cùng bảng queue (migration `01060040_AddWorkflowQueue.cs`).
- DNN: **mặc định Sync, không queue** (giữ hành vi). Optional phase sau: `SchedulerClient` theo pattern `BlogScheduledPublishTask.cs`. In-process queue trong Core cho net472 **không làm** (IIS AppDomain recycle mất queue; DNN đã có scheduler thật).

**Quyết định thiết kế:**
- Queue là **DB-backed table**, không in-memory channel, không thêm dependency (Redis/Service Bus) vào v1. Abstraction trong Core để mỗi host tự implement store.
- Không đổi `IWorkflowEngine` — worker chỉ là caller mới của `ExecuteAsync`. Diff tối thiểu.
- Response contract không đổi (§0.7) nên không cần polling endpoint; `GetExecutionStatusAsync` đã có sẵn nếu UI cần.

**Rủi ro:**
- Side effect (email/webhook) trễ vài giây so với sync — ghi release notes.
- Engine không idempotent ở node level (webhook có thể bắn 2 lần nếu worker crash sau HTTP call) — v1 chấp nhận, cân nhắc idempotency-key sau.
- Host nào quên đăng ký `IWorkflowExecutionModeProvider` → null = sync, an toàn by-design.

### Task A2 — Durable timer service + Delay node

**Goal:** Execution "park" đến một thời điểm tương lai và được scanner đánh thức; implement Delay node; overdue reminder cho approval.

**Files tạo/sửa:**

- `MegaForm.Core/Models/WorkflowModels.cs`:
  - `WorkflowExecutionContext` += `public DateTime? WaitUntilUtc { get; set; }` (serialize vào ContextJson sẵn có, Newtonsoft backward compatible).
  - `DelayNodeConfig { public int DelaySeconds; public string UntilExpression; }` (UntilExpression resolve qua `IWorkflowEvaluator.ResolveTemplate`, ví dụ `{{field.due_date}}`).
  - Thêm `WorkflowNodeType.Delay` vào `SupportedNodeTypes.All` (line 71-85).
  - Static factory `WorkflowNodeResult.WaitUntil(DateTime utc)` (Status="waiting", OutputData = utc).
- `MegaForm.Core/Workflow/DelayNodeExecutor.cs` *(mới, pattern giống `ApprovalNodeExecutor.cs`)*.
- `MegaForm.Core/Services/WorkflowEngineV2.cs`:
  - `WalkGraphAsync` (line 308-313): khi node result "waiting", đọc `WaitUntilUtc` từ `nodeResult.OutputData` (nếu có) ghi vào `ctx.WaitUntilUtc` trước khi persist.
  - **Resume cho timer dùng lại `ResumeAsync` hiện hữu**: scanner gọi `ResumeAsync(executionId, "default", null, ct)` — `CurrentNodeId` đang là Delay node, `ResolveNextFromEdge` (line 193) walk đúng cạnh default. Không cần API mới.
  - **Sửa bug tiềm ẩn:** `ResumeAsync` không kiểm tra `ctx.Status == Waiting` trước khi resume — scanner đa instance có thể double-resume. Thêm guard + claim bằng conditional update.
- Schema (qua A4 runner): `MF_WorkflowExecutions` += `WaitUntilUtc DATETIME NULL`, `LeaseOwner NVARCHAR(64) NULL`, `LeaseUntilUtc DATETIME NULL`, index `(Status, WaitUntilUtc)`. `MF_WorkflowTasks` += `EscalatedAtUtc DATETIME NULL`. Rows cần sửa: `MegaForm.Web/Data/EfWorkflowRepository.cs:395`, `MegaForm.Web/Data/Phase2DataLayer.cs:28-90`, `MegaForm.Oqtane.Server/Data/WorkflowRuntimeRows.cs:5-80`, `MegaForm.Umbraco/Data/MegaFormDbContext.cs:599-690`, `MegaForm.DNN/Data/DnnWorkflowRepository.cs` (self-heal DDL).
- Scanner:
  - Web: `MegaForm.Web/HostedServices/WorkflowTimerScannerService.cs` — `BackgroundService`, chu kỳ 30s (config `Workflow:TimerScanIntervalSeconds`), claim bằng conditional update, scope mới + `ResumeAsync`. Cùng service quét overdue tasks (`DueAt < now AND Status IN (pending, claimed) AND EscalatedAtUtc IS NULL`) → reminder qua `IWorkflowEmailSender` (đẩy `ResolveTaskRecipients` thành shared helper trong `WorkflowTaskService`) → set `EscalatedAtUtc`.
  - Oqtane: `WorkflowTimerScannerHostedService.cs` theo pattern `BlogScheduledHostedService`.
  - DNN: `MegaForm.DNN/Services/WorkflowTimerScheduleItem.cs : SchedulerClient` theo pattern `BlogScheduledPublishTask.cs` (DNN scheduler đảm bảo 1 instance → không cần lease, giữ guard status).
  - Umbraco: hosted service trong `MegaForm.Umbraco.Host/HostedServices/` (pattern `DemoDataSeedHostedService.cs`).

**Quyết định thiết kế:**
- Tái dùng cơ chế Waiting + `ResumeAsync`, không thêm state machine mới. Delay = human task không cần ngườờ.
- Overdue escalation v1 = **email reminder một lần**. Auto-approve/auto-route khi quá hạn **out of scope v1** (cần handle convention mới trong engine).
- Mọi thờờ gian UTC (code hiện đã dùng `DateTime.UtcNow` nhất quán).

**Rủi ro:**
- Scan 30s → Delay precision ±30s; DNN scheduler theo phút, precision thấp hơn — ghi docs.
- Race giữa user approve đúng lúc timer fire: guard status + conditional update claim; cần integration test.

### Task A3 — File state externalization

**Goal:** Uploads không còn trên local disk từng instance; setup state không phụ thuộc file lock.

**Files tạo/sửa:**

- Storage:
  - `MegaForm.Web/Services/S3StorageService.cs` *(mới)*: implement `IStorageService` (seam trong `MegaForm.Core.Interfaces`) bằng cách wrap `MegaForm.Integrations.CloudStorage.AmazonS3StorageProvider` + `StorageConnectionSettings` từ config/env. Lưu ý impedance mismatch: `IStorageProvider` async, `IStorageService.GetFile` sync → sync-over-async trong impl Web (chấp nhận; download endpoint ít tải). Giữ key convention `folder/yyyyMMddHHmmss_guid.ext` giống `WebStorageService.SaveFileAsync` (line 34) để không migrate path trong `MF_Files`.
  - `MegaForm.Web/Services/AzureBlobStorageService.cs` *(mới, **chỉ net9 host**)*: `Azure.Storage.Blobs` reference vào `MegaForm.Web.csproj` (KHÔNG vào Core/CloudStorage — §0.2).
  - `MegaForm.Web/Program.cs:44-48`: factory chọn theo `Storage:Backend` = `local` (default) | `s3` | `azureblob`. Nhân bản trong `MegaForm.AspNetCore.Component`.
  - Sửa mọi consumer đọc path local: `WebSubmissionFileBlobReader.cs`, endpoint `Files/Download` trong `MegaFormController.UploadAndSdk.cs` — route qua `IStorageService` thay vì `File.OpenRead`.
  - Chained-read (blob trước, fallback local disk) trong v1 để file cũ không chết trong thờờ gian chuyển tiếp.
- Setup state:
  - `MegaForm.Web/Services/ISetupStateProvider.cs` *(mới)* + `EnvFirstSetupStateProvider`: nếu env `MEGAFORM_DB_PROVIDER` + `MEGAFORM_CONNECTIONSTRING` tồn tại → setup complete, bỏ qua wizard; ngược lại giữ file-lock flow (dev). `DatabaseConfig.cs:22-31` đọc env trước file appsettings.
  - `SetupController.cs:39-44` (`IsSetupComplete` = `File.Exists(setup.lock)`) và `SetupMiddleware.cs` chuyển sang `ISetupStateProvider` (singleton, cache 5s).
  - `dev.lock` → config `Dev:EnableLiveEditing` (env `MEGAFORM_DEV_LIVEEDITING=true`) tại `AdminController.cs:195`, `UserTemplateController.cs:64,155`, `MegaFormController.cs:474,544`; giữ đọc file làm fallback.

**Quyết định thiết kế:**
- Env-first config (12-factor) thay vì DB-based setup state: connection string phải có trước khi có DB → DB-based state là vòng gà-trứng.
- Không viết lại `IStorageService` seam (ảnh hưởng DNN/Oqtane/Umbraco impls).
- `GetFileUrl` giữ trỏ về API `Files/Download` (qua auth), không presign URL — không đổi security model.

### Task A4 — Migrations unification (Web host)

**Inventory runtime-DDL/self-heal (grep `EnsureSchema|CREATE TABLE|ALTER TABLE` trong `.cs`, 195 hits / 24 files):**

- **Web:** `Data/DatabaseSchemaBootstrapper.cs`, `Data/TypedSubmissionSchemaBootstrapper.cs` (28), `Data/ReportsSchemaBootstrapper.cs` (4), `Data/AiKnowledgeSchemaBootstrapper.cs` (20), `Program.cs:278-291` (điểm kích startup).
- **DNN:** `Data/DnnWorkflowRepository.cs` (31), `Data/DnnExternalRowMapStore.cs` (4), `Data/DnnExternalBindingStore.cs` (6), `WebApi/AiToolsController.cs` (12), `WebApi/SubformController.cs` (4), `WebApi/Phase2ApiController.cs` (1), `WebApi/WorkflowApiController.cs` (1).
- **Oqtane:** numbered migrations (`01050100` … `01060039`) + vẫn còn self-heal: `Data/EfWorkflowLibraryRepository.cs` (4), `MegaFormManager.cs` (3), `Controllers/AiToolsController.cs` (5), `Controllers/SubformController.cs` (3).
- **Umbraco:** `Data/TypedSubmissionSchemaBootstrapper.cs` (28), `Data/EfWorkflowLibraryRepository.cs` (3), `Migrations/AddWorkflowLibraryTablesMigration.cs`, `MegaForm.Umbraco.Host/HostedServices/DemoDataSeedHostedService.cs` (5).
- **Core:** `SqlDdlGuard.cs`/`SqlDdlAudit.cs` (guard, không phải DDL site); `Services/Subform/FormTableDdlBuilder.cs` (runtime DDL by-design cho subform tables — **giữ nguyên**).

**Target (quyết định):** KHÔNG dùng EF migrations-per-provider (4 provider × migration assemblies quá nặng). Thay bằng **versioned idempotent script runner** cho Web:

- `MegaForm.Web/Data/Schema/SchemaMigrationRunner.cs` *(mới)*: đọc embedded scripts `Data/Schema/Scripts/{sqlserver|sqlite|postgresql|mysql}/NNNN_description.sql` theo thứ tự, ghi `MF_SchemaHistory (Version INT PK, Name, AppliedAtUtc, Checksum)`. Mỗi script idempotent.
- Single-instance guard bằng **DB-native lock**: SQL Server `sp_getapplock`, PostgreSQL `pg_advisory_lock`, MySQL `GET_LOCK`, SQLite no-op. Runner chạy trong `Program.cs` thay block bootstrapper (line 278-291).
- Chuyển tiếp: giữ bootstrapper hiện hữu, chạy **sau** runner và chỉ khi `MF_SchemaHistory` chưa có baseline. Baseline `0001_baseline.sql` capture toàn bộ schema hiện tại (bao gồm **đưa workflow library tables lên Web** — §0.3). Cột mới của A1/A2/A5 là script `0002+`.
- Oqtane/DNN giữ cơ chế native; cam kết: mọi thay đổi schema workflow runtime apply đồng bộ 4 host (checklist PR template). "Single source of truth" là tài liệu schema + version dùng chung, không phải code dùng chung.

**Rủi ro:** drift cột giữa host đã tồn tại (Web thiếu library tables); MySQL DDL implicit-commit → script hỏng nửa chừng (idempotency + statement nhỏ giảm thiểu); `EnsureCreated()` của EF phải khớp script (thêm smoke test mọi repo trên DB mới).

### Task A5 — Multi-tenancy cho Web host

**Hiện trạng (verified):** `PortalId` đã chảy qua `form.PortalId` → `workflowData["__portalId"]` (`SubmissionProcessor.cs:543`) → `ApprovalNodeExecutor.GetPortalId`; `WorkflowTemplateInfo.PortalId`. Nhưng Web host hardcode: claim `portalId=0` (`AdminAuthController.cs:64`), `WebPlatformContext` trả portal 0, EF query không filter PortalId.

**Files tạo/sửa:**

- Schema (qua A4): `MF_Tenants (TenantId PK, TenantKey NVARCHAR(64) UNIQUE, DisplayName, ConnectionStringName NVARCHAR(128) NULL, IsActive, CreatedAtUtc)`; thêm `PortalId`/`TenantId` vào `WebUsers` (`MegaForm.Web/Data/WebIdentityEntities.cs`) nếu chưa có.
- `MegaForm.Web/Services/ITenantResolver.cs` *(mới)* + `ClaimsTenantResolver`: resolve từ claim `portalId` (login ghi đúng tenant, bỏ hardcode), fallback subdomain `{tenant}.app.com` tra `MF_Tenants`. `WebPlatformContext` đọc từ resolver.
- **Quyết định: shared DB + PortalId discriminator ở v1.** `ConnectionStringName` là dự phòng cho per-tenant DB v2. Lý do: toàn bộ model đã có PortalId; per-tenant-DB v1 nhân đôi độ phức tạp migration × N tenant.
- `TenantsController` (Host role): tạo tenant + admin user đầu tiên = "minimal real onboarding".
- **Authorization audit:** kiểm tra mọi submission endpoint trong `MegaFormController*.cs` đi qua `CanViewSubmissionRow`/`CanUseSubmissionManagement` (`MegaFormController.SubmissionSecurity.cs:81-147`); thêm **EF Global Query Filter** trên `MegaFormDbContext` (`DataLayer.cs:10`) với tenant từ scoped `ITenantResolver` (`.Where(x => x.PortalId == tenant)` tự động). Kiểm tra các raw SQL/`FromSql`. Backfill `PortalId=0` cho dữ liệu cũ.
- Settings: `ModuleSettings moduleId=0` giữ host-global v1, chỉ Host role sửa được; tenant-level settings để v2.

**Rủi ro:** JWT cũ không có claim portalId đúng → buộc re-login (release notes); anonymous public submit không có claim → resolver map form→tenant từ DB, chặn anonymous nội suy tenant từ tham số.

---

## TRACK B — BPMN 2.0 XML IMPORTER

### Task B1 — Core importer

**Vị trí (mới, tất cả C# 7.3-safe, chỉ `System.Xml.Linq` + Newtonsoft sẵn có):**

- `MegaForm.Core/Workflow/Bpmn/BpmnImporter.cs` — entry: `public BpmnImportResult Import(string bpmnXml, BpmnImportOptions options)`.
- `MegaForm.Core/Workflow/Bpmn/BpmnModel.cs` — internal parsed graph, `XDocument`, namespace-agnostic local-name matching (`XName.LocalName`) để chịu mọi prefix (`bpmn:`, `bpmn2:`, `semantic:`…).
- `MegaForm.Core/Workflow/Bpmn/BpmnElementMapper.cs` — mapping element → `WorkflowNode`/`WorkflowEdge`.
- `MegaForm.Core/Workflow/Bpmn/BpmnImportModels.cs` — `BpmnImportResult { WorkflowDefinition Definition; List<BpmnImportWarning> Warnings; List<string> UnsupportedElements; }`, `BpmnImportOptions { bool Strict; string FallbackApproverRole; }`, `BpmnImportWarning { string ElementId; string ElementType; string Message; }`.

**Bảng mapping v1:**

| BPMN element | MegaForm node | Chi tiết |
|---|---|---|
| `startEvent` (none) | — | Không tạo node; set `Definition.StartNodeId` = target của outgoing flow duy nhất. >1 start → warning, dùng cái đầu (§0.5) |
| `endEvent` | `End` | `EndNodeConfig { EndType = Success, Message = name }` |
| `userTask` | `Approval` | `CandidateUsers` từ extension attr `megaform:candidateUsers`; fallback `FallbackApproverRole` (default "Administrator"). `name` → `Label` |
| `serviceTask` | `Webhook` / `SendEmail` / `Database` / `GoogleSheets` | Ưu tiên extension attribute `megaform:type="webhook\|email\|database\|googlesheets"` (namespace `xmlns:megaform="http://megaform.io/bpmn/1.0"`); không có → heuristic theo name ("mail"→SendEmail; "sql"/"db"→Database; "sheet"→GoogleSheets; mặc định Webhook) + **luôn warning** khi dùng heuristic. Thiếu config → node tạo ra nhưng `ValidateDefinition` báo lỗi lúc Apply |
| `sendTask` | `SendEmail` | tương tự |
| `scriptTask` | `SetVariable` / `Calculate` | script không dịch → warning + disabled node |
| `exclusiveGateway` (2 outgoing) | `Condition` | `conditionExpression` dịch được bằng mini-grammar (`${field op literal}` → `ConditionsJson`) thì dịch; không → Condition rỗng + warning "review manually". Flow có condition → handle `"true"`, default flow → `"false"` |
| `exclusiveGateway` (>2 outgoing) | `Switch` | mỗi outgoing → case `"branch-N"`, default → `"default"` |
| `parallelGateway` (>1 outgoing) | `Fork` | `ForkNodeConfig.BranchStartNodeIds` |
| `parallelGateway` (>1 incoming) | `Join` | pair với Fork gần nhất; unmatched → warning |
| `intermediateCatchEvent` + `timerEventDefinition` | `Delay` | `timeDuration` ISO-8601 (`PT5M`) → `DelaySeconds`; `timeDate` → `UntilExpression`. **Phụ thuộc Task A2** — Delay chưa ship thì importer báo lỗi rõ cho element này |
| `sequenceFlow` | `WorkflowEdge` | `SourceHandle`: default/"true"/"false"/"branch-N" theo nguồn; `Label` = flow name; `EdgeType.Conditional` khi có conditionExpression |

**Out of scope v1 (liệt kê trong warnings, không silent-drop):** pools/lanes (chỉ dùng DI coordinates cho layout), message/signal/escalation/compensation events, boundary events, sub-process (embedded + callActivity), multi-instance/loop characteristics, transactions, data objects/associations. Strict mode → import fail kèm danh sách; lenient → node `SetVariable` `IsDisabled=true`, label `UNSUPPORTED: {type} {name}`.

**Layout:** đọc `bpmndi:BPMNShape` bounds → `CanvasPosition`; thiếu DI → auto-layout BFS theo rank (x = rank×240, y = index×130).

**Rủi ro:** conditionExpression grammar đa dạng (JUEL/Feel/groovy) → mini-grammar chỉ cover subset, phần còn lại bắt buộc manual review qua warnings; fork lồng fork — join-pairing heuristic có thể sai → bắt buộc chạy `ValidateDefinition` sau import và trả kèm response.

### Task B2 — Designer strategy + API + library integration

**Quyết định: giữ ReactFlow editor, thêm import; bpmn-js chỉ preview (NavigatedViewer read-only).** Swap sang bpmn-js = viết lại 23 files `MegaForm.UI/src/builder/workflow/wf-*.ts` + mất 12 node types (L, nhiều tuần, feature loss). Viewer preview effort S, giá trị UX cao khi review import.

**UI:** nút "Import BPMN" trong `wf-library.ts` / toolbar `wf-app.ts`; panel preview mới `wf-bpmn-import.ts` (hiển thị diagram gốc + warnings + kết quả map).

**API endpoints:**
- Web: `MegaForm.Web/Controllers/WorkflowController.cs`: `POST /api/MegaForm/Workflow/ImportBpmn` (body `{ xml, formId, mode }`) → trả `{ warnings, unsupported, validation }`, lưu **draft** qua `IWorkflowRepository.SaveDraft` (không auto-apply). `PreviewBpmnImport` (không lưu) cho preview.
- Oqtane: action tương đương trong `MegaFormController.WorkflowLibrary.cs`, thêm tuỳ chọn `saveToLibrary: true` → tạo `WorkflowTemplateInfo` + version qua `IWorkflowLibraryRepository` (PortalId từ alias context), notes chứa warnings.
- DNN: endpoint trong `MegaForm.DNN/WebApi/WorkflowApiController.cs`, dùng chung Core importer.
- **Lưu ý §0.3:** Web v1 chỉ import-to-form-draft; import-to-library trên Web cần port `EfWorkflowLibraryRepository` + bảng (gộp A4, +S).

### Task B3 — BPMN export (v1.1, không v1)

Export `WorkflowDefinition → BPMN XML` khả thi nhưng config proprietary (Webhook headers, Database bindings) phải ghi `megaform:*` extension elements để round-trip không mất dữ liệu; nếu không export chỉ mang tính minh họa. Ưu tiên import trước. Size M.

---

## Sequencing & sizing

| Phase | Nội dung | Size | Phụ thuộc |
|---|---|---|---|
| 0 | A4: `SchemaMigrationRunner` + baseline scripts + DB-native lock (Web); cột/bảng mới của A1/A2/A5 = scripts 0002+ | **M** | — |
| 1 | A1: `IWorkflowExecutionQueue` + `EfWorkflowExecutionQueue` + worker (Web, AspNetCore.Component, Oqtane); `SubmissionProcessor` nhánh queued; DNN giữ Sync | **M** | Phase 0 |
| 2 | A2: Delay executor + `WaitUntilUtc` + timer scanner (Web/Oqtane/DNN scheduler/Umbraco) + overdue reminder | **M** | Phase 0 (nên sau Phase 1 để tái dùng worker pattern) |
| 3 | A3: `S3StorageService`/`AzureBlobStorageService` + storage factory + env-first setup state + thay dev.lock | **M** | — (song song Phase 1-2 được) |
| 4 | A5: `MF_Tenants` + `ITenantResolver` + EF global query filter + submission endpoint audit + portalId claim thật | **M-L** | Phase 0; nên sau Phase 3 |
| 5 | B1: `MegaForm.Core/Workflow/Bpmn/*` + unit tests (mở rộng `MegaForm.Sdk.Tests` hoặc project mới) | **M** | Delay mapping cần Phase 2 |
| 6 | B2: import endpoints (Web/Oqtane/DNN) + nút import UI + bpmn-js viewer preview | **S-M** | Phase 5 |
| 7 | B3: export BPMN (v1.1) | **M** | Phase 5 |
| 8 | Azure packaging: Dockerfile mới (repo chưa có), env config, `/health` endpoint, health probe cho worker, test 2 instances cùng DB | **S-M** | Phase 0-4 |

## Definition of Done — Cloud deployment (Azure)

- [ ] Single container: `docker build` chạy MegaForm.Web với Azure SQL qua `MEGAFORM_DB_PROVIDER`/`MEGAFORM_CONNECTIONSTRING`, không cần setup wizard, không ghi state vào container filesystem (verify: read-only root FS trừ /tmp).
- [ ] Uploads ghi vào Azure Blob/S3: submit form có file → container restart → download vẫn OK.
- [ ] Migrations: 2 instances start đồng thờờ → đúng 1 instance chạy `SchemaMigrationRunner` (DB lock), `MF_SchemaHistory` không duplicate, không DDL error.
- [ ] Queue: `Workflow:ExecutionMode=queue` → HTTP < 1s, execution hoàn thành bởi worker; kill 1 trong 2 instances giữa chừng → item được instance còn lại nhặt qua lease expiry.
- [ ] Timer: workflow có Delay 2 phút → execution `waiting` trong DB, tự resume đúng giờ trên bất kỳ instance nào; approval quá `DueInHours` nhận reminder email đúng 1 lần.
- [ ] Multi-tenant: 2 tenant cùng DB; user tenant A không list/get/export được submission tenant B (kể cả đoán ID); anonymous submit ghi đúng PortalId của form.
- [ ] Sticky session không bắt buộc (DataProtection key ring externalized — `PersistKeysToAzureBlobStorage` hoặc shared volume/Redis).
- [ ] DNN + Oqtane + Umbraco regression: build net472 pass, submit + approval inbox + resume hoạt động y hệt trước (mode Sync mặc định).

## Definition of Done — BPMN import coverage

- [ ] Import được tối thiểu: startEvent, endEvent, userTask, serviceTask (webhook/email qua extension attr), exclusiveGateway (2 & N nhánh), parallelGateway fork/join, timer intermediateCatchEvent (Delay), sequenceFlow + conditionExpression đơn giản.
- [ ] File BPMN từ bpmn.io demo + 1 file Camunda Modeler thật import lenient thành công với warnings có ý nghĩa (không crash, không silent-drop).
- [ ] Imported definition qua được `ValidateDefinition(Apply)` sau khi user điền config thiếu; execute end-to-end trên Web host (submit → approval → resume).
- [ ] Unsupported elements liệt kê đầy đủ trong `UnsupportedElements` (strict fail, lenient placeholder disabled node).
- [ ] Unit tests Core cho mapper (round-trip position, handle mapping true/false/branch-N, ISO-8601 duration parse), chạy được trên cả net472 target.

---

## Phase 2 implementation notes (Task A2 — shipped 2026-08-06)

**Đã build:**

- Core (C# 7.3): `WorkflowExecutionContext.WaitUntilUtc`, `DelayNodeConfig { DelaySeconds, UntilExpression }`, `WorkflowNodeType.Delay` vào `SupportedNodeTypes.All`, `WorkflowNodeResult.WaitUntil(DateTime)`; `DelayNodeExecutor` + `DelayTimeParser` (ISO-8601 datetime + duration "PT5M", fallback DelaySeconds); `WorkflowTaskInstance.EscalatedAtUtc`; shared `WorkflowTaskRecipientResolver` (ApprovalNodeExecutor delegate về đây); `EmailNotificationService.GetTaskOverdueReminderDefault*`.
- Engine (`WorkflowEngineV2`): waiting branch đọc `DateTime` từ `nodeResult.OutputData` → `ctx.WaitUntilUtc` trước khi persist; `ResumeAsync` có guard `Status == Waiting` (throw `InvalidOperationException` theo style "not found") và clear `WaitUntilUtc` khi resume.
- Schema: script `0003_delay_timer.sql` (4 provider) qua SchemaMigrationRunner — `MF_WorkflowExecutions += WaitUntilUtc, LeaseOwner, LeaseUntilUtc` + index `(Status, WaitUntilUtc)`; `MF_WorkflowTasks += EscalatedAtUtc`. Runner có directive mới `-- mf:continue-on-error` (SQLite không có `ADD COLUMN IF NOT EXISTS`). EF rows/mappings cập nhật đủ 4 host: Web (`EfWorkflowRepository`, `Phase2DataLayer`, `DataLayer`), Oqtane (`WorkflowRuntimeRows` + migration `01060041`), Umbraco (`MegaFormDbContext` + `AddWorkflowTimerColumnsMigration` plan step "megaform-schema-workflow-timer"), DNN (self-heal DDL trong `DnnWorkflowRepository` + CREATE TABLE fresh).
- Scanners: Web `WorkflowTimerScannerService` (+ mirror trong AspNetCore.Component), Oqtane `WorkflowTimerScannerHostedService` (per-tenant), Umbraco `MegaFormWorkflowTimerScannerHostedService`, DNN `WorkflowTimerScheduleItem : SchedulerClient` (đăng ký qua `SqlScripts/01.06.43.SqlDataProvider` + manifest).

**Resume/claim protocol:**

- Delay node outgoing edge dùng handle `"default"` (convention sẵn có của mọi single-out node) → scanner gọi `ResumeAsync(executionId, "default", null, ct)`, `ResolveNextFromEdge` walk đúng cạnh default. Wake time trong quá khứ → executor trả success ngay, không park.
- Multi-instance (Web/Component/Oqtane/Umbraco): claim atomic bằng conditional UPDATE `SET LeaseOwner, LeaseUntilUtc WHERE ExecutionId=@id AND Status='waiting' AND (LeaseUntilUtc IS NULL OR LeaseUntilUtc < now)` — rows affected == 1 mới được resume. Lease 300s (= engine execution budget). Sau resume, scanner clear CHỈ lease của chính nó; `WaitUntilUtc` do engine persist ghi đè (null khi chạy tiếp, giá trị mới nếu park ở Delay khác). `UpdateExecution` của mọi repo KHÔNG đụng cột Lease* (engine sở hữu WaitUntilUtc, scanner sở hữu Lease*).
- Guard engine `Status == Waiting` là lớp phòng thủ thứ hai cho race user-approve vs timer-fire (approval waits có `WaitUntilUtc = null` nên scanner không bao giờ nhặt chúng).
- DNN: scheduler đảm bảo 1 instance → không lease, chỉ guard status. Overdue reminder trên DNN resolve portal từ `__portalId` trong FormData của execution (1 read phụ / task).

**Precision:** wake time chính xác ± 1 scan interval — Web/Component/Oqtane/Umbraco default 30s (`Workflow:TimerScanIntervalSeconds`, Oqtane: `MegaForm:Workflow:TimerScanIntervalSeconds`); DNN theo phút (scheduler). Overdue reminder: đúng 1 email/task (assignee nếu đã assign, ngược lại candidate set), marker `EscalatedAtUtc` stamp sau cả khi SMTP lỗi (fail-soft, không retry spam). Không auto-approve/auto-route (out of scope v1).

**Known limitations:**

- Node side effects không idempotent ở node level: nếu worker crash SAU khi persist waiting nhưng trước khi scanner thấy, Delay chỉ đơn giản fire trễ; nhưng nếu resume chạy được nửa chừng (webhook đã bắn) rồi crash, lease hết hạn → instance khác resume lại → webhook có thể bắn 2 lần (v1 chấp nhận, cân nhắc idempotency-key sau).
- `UntilExpression` parse: ISO-8601 datetime (timezone-less = giả định UTC) + duration subset `P[nD]T[nH][nM][nS]`; tuần/tháng (calendar-relative) cố tình không hỗ trợ.
- UI: Delay có sẵn trên palette ("Timer Catch Event") với config panel tối thiểu (DelaySeconds + UntilExpression) trong `megaform-workflow-reactflow.js` (build:workflow); không có server-driven UI schema (giống SetVariable — panel hardcoded TS).
