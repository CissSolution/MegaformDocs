# Thiết kế: C# Script Node cho MegaForm Workflow

> Ngày: 2026-08-07 — Kimi Code CLI.
> Mục tiêu: cho phép ngưới dùng viết script C# ngay tại node trong workflow builder để xử lý dữ liệu (transform, tính toán, gọi logic tùy biến) mà không cần node chuyên biệt cho từng bài toán.
> Trạng thái: **tài liệu thiết kế, chưa implement**.

---

## 1. Hiện trạng kiến trúc workflow (điểm bám)

Trước khi thiết kế cần nắm đúng các contract sẵn có:

- **Node model** (`MegaForm.Core/Models/WorkflowModels.cs`):
  - `WorkflowNodeType` enum + whitelist `SupportedNodeTypes.All` — node type nào không có trong whitelist sẽ bị reject lúc save validation.
  - `WorkflowNode.Config` là `Dictionary<string, object>` linh hoạt; mỗi executor tự cast sang typed config bằng `JsonConvert.SerializeObject/DeserializeObject` (pattern trong `SetVariableNodeExecutor`).
  - `WorkflowNode.ErrorHandlerNodeId` + `IsDisabled` đã hỗ trợ error routing và skip — script node phải tôn trọng 2 field này.
- **Executor pattern** (`MegaForm.Core/Interfaces/IWorkflowInterfaces.cs`):
  - `INodeExecutor { WorkflowNodeType NodeType; Task<WorkflowNodeResult> ExecuteAsync(node, ctx, ct); WorkflowValidationResult Validate(node); }`
  - `Validate()` chạy lúc save/apply — đây là chỗ để compile-check script và trả lỗi biên dịch về builder.
  - `WorkflowNodeResult` có handles (`handle::default`, Success/Failed/Skipped) — script node map exception → `Failed`, route theo `ErrorHandlerNodeId`.
- **Execution context** (`WorkflowExecutionContext`):
  - `FormData` (read-only, key = fieldKey), `Variables` (mutable — SetVariable ghi vào đây), `NodeResults` (output từng node).
  - Script node đọc `FormData`, đọc/ghi `Variables`, ghi output vào `NodeResults[node.Id]` — đúng chuẩn các executor khác.
- **Engine**: hybrid execution — node sync (Condition/Calculate/SetVariable) chạy inline, node async (Webhook/Email) chạy async. Script node phải là **sync-fast**; giới hạn thởi gian bắt buộc.
- **UI server-driven**: `IWorkflowNodeUiSchemaProvider` + `WorkflowNodeUiSchema` (C# phát schema, TS chỉ render). Palette TS ở `MegaForm.UI/src/builder/workflow-canvas.ts` (`NODE_TYPE_META`, `ACTION_TYPES`, map enum → string tại dòng ~472).
- **Security precedent**: Webhook node đã có `SsrfGuard.IsUrlAllowed` (`WebhookNodeExecutor.cs:125`) — script node cần guard tương tự nhưng nặng hơn nhiều (xem §5).
- **DI**: executor đăng ký ở 4 host (Oqtane `Startup.cs`, Web `Program.cs`, Umbraco `MegaFormComposer.cs`, DNN manual-wire) + `MegaForm.AspNetCore.Component` — giống pattern cloud storage (AGENTS.md §2.8).

## 2. Các phương án chạy C# script

| # | Phương án | Cách hoạt động | Ưu | Nhược | Đánh giá |
|---|-----------|----------------|-----|-------|----------|
| A | **Roslyn Scripting** (`Microsoft.CodeAnalysis.CSharp.Scripting`) | `CSharpScript.Create(source, options, globalsType).RunAsync(globals)` | API đơn giản, diagnostics tốt, compile cache sẵn (`Script<T>`), chạy được cả net472 và net8+ | Chạy **cùng process** → không sandbox thật; cần tự giới hạn | **Chọn cho Phase 1** |
| B | Roslyn compile + `AssemblyLoadContext` collectible | Compile ra assembly, load vào ALC riêng, unload sau dùng | Cô lập assembly, unload được | Chỉ net8+; **không unload được AppDomain/process resource**; phức tạp; DNN (net472) không có | Phase 2 (host hiện đại) |
| C | **Worker process** (`MegaForm.ScriptHost.exe`) | Host chính gửi {script hash, input JSON} qua stdin/pipe/named pipe, worker chạy script và trả JSON | Sandbox thật: giới hạn RAM/CPU bằng OS, kill được, crash không ảnh hưởng host | Chậm hơn (IPC), deploy thêm exe, phức tạp vận hành | **Chọn cho Phase 3** (multi-tenant / untrusted) |
| D | CodeDom (`CSharpCodeProvider`) | Compile in-memory kiểu cũ | Đơn giản | Obsolete, không hỗ trợ C# hiện đại, leak assembly trên net472 | Loại |
| E | Ngôn ngữ khác (Jint JS / Lua NLua) | Nhúng interpreter | Sandbox tốt, nhẹ | Không phải C# — sai yêu cầu | Chỉ cân nhắc nếu security là ưu tiên #1 |

**Kết luận lộ trình:** A (trusted, same-process) → C (worker, untrusted). B chỉ là bước đệm tùy chọn cho host net8+.

Điểm quan trọng: **không có sandbox thật nào in-process trên .NET hiện đại.** Mọi cơ chế blacklist API (cấm `System.IO`, `Process.Start`, P/Invoke…) đều bypass được bởi ngưới viết script tinh vi. Vì vậy tài liệu này tách rõ 2 chế độ vận hành (§5), không hứa "sandbox an toàn" cho chế độ same-process.

## 3. Thiết kế node

### 3.1 Node type

```csharp
// WorkflowNodeType
Script = 40,   // C# script node (Action zone only)
```

- Thêm vào `SupportedNodeTypes.All`.
- Zone: chỉ `WorkflowZoneType.Action` (chạy post-submit server-side). Không cho Navigation zone vì navigation chạy client-side bằng TS evaluator — không thể chạy C# ở browser.

### 3.2 Config schema (`ScriptNodeConfig`)

Lưu trong `WorkflowNode.Config` (dictionary) như mọi node khác, typed config:

| Field | Type | Mặc định | Mô tả |
|-------|------|----------|-------|
| `Script` | string | `""` | Source code C#. Bắt buộc. Giới hạn 32 KB. |
| `TimeoutMs` | int | `3000` | Hard timeout 1 lần chạy. Max cấu hình được 30s. |
| `MaxOutputBytes` | int | `65536` | Giới hạn kích thước return value ghi vào `NodeResults`. |
| `AllowedImports` | string[] | whitelist mặc định | Namespace được `using` thêm (ngoài mặc định). |
| `OutputVariable` | string | `null` | Nếu set: ghi return value vào `ctx.Variables[OutputVariable]`. |
| `CaptureLog` | bool | `true` | Ghi `Log(...)` calls vào execution log. |

Whitelist imports mặc định: `System`, `System.Linq`, `System.Collections.Generic`, `System.Text`, `System.Globalization`, `Newtonsoft.Json.Linq`. Không cho `System.IO`, `System.Net`, `System.Diagnostics`, `System.Reflection`, `System.Runtime.InteropServices` ở chế độ restricted.

### 3.3 Globals contract (API cho ngưới viết script)

```csharp
public class ScriptGlobals
{
    public Dictionary<string, object> Data { get; }       // ctx.FormData (read-only)
    public Dictionary<string, object> Variables { get; }  // ctx.Variables (read/write)
    public Dictionary<string, object> Nodes { get; }      // ctx.NodeResults (read-only)
    public int FormId { get; }
    public int SubmissionId { get; }
    public string ExecutionId { get; }
    public void Log(string message);                      // → execution log
    // helper tiện dụng:
    public string Str(string fieldKey);                   // Data[key] as string ?? ""
    public double Num(string fieldKey);                   // parse double, 0 nếu fail
}
```

Quy ước return: **giá trị của expression cuối cùng** là output của node (đúng chuẩn Roslyn `Script.RunAsync`). Output được ghi vào `NodeResults[node.Id] = new { value, logs, durationMs }`, và vào `Variables[OutputVariable]` nếu config có.

Ví dụ script ngưới dùng viết:

```csharp
var total = Num("quantity") * Num("unitPrice");
Variables["totalFormatted"] = total.ToString("N2");
Log("Computed total = " + total);
total > 1000000 ? "vip" : "standard";   // return value → route tiếp
```

## 4. Kiến trúc triển khai

### 4.1 Abstraction trong Core (không phụ thuộc Roslyn)

Core multi-target net472/net8/net9/net10 và hiện **không** reference Roslyn. Giữ nguyên tắc đó (giống `MegaForm.Integrations.CloudStorage` không reference AWSSDK/Azure):

- `MegaForm.Core/Interfaces/IScriptEngine.cs` (trong Core, thuần contract):

```csharp
public interface IScriptEngine
{
    ScriptCompileResult Compile(string source, ScriptCompileOptions options); // diagnostics, cached key
    Task<ScriptRunResult> RunAsync(string source, ScriptGlobalsModel globals,
        ScriptRunLimits limits, CancellationToken ct);
}
public class ScriptRunResult {
    public bool Success; public object Value; public string Error;
    public int? ErrorLine; public List<string> Logs; public long DurationMs;
}
public class ScriptRunLimits { public int TimeoutMs; public int MaxOutputBytes; public string[] AllowedImports; }
```

`ScriptGlobalsModel` là DTO phẳng (không reference `WorkflowExecutionContext` để tránh cycle) — executor map sang.

### 4.2 Implementation trong assembly riêng `MegaForm.Scripting`

- Project mới `MegaForm.Scripting` (multi-target net472/net8.0/net9.0/net10.0, add vào `MegaForm.sln`, packable) — mẫu giống `MegaForm.Integrations.CloudStorage`.
- `RoslynScriptEngine : IScriptEngine`:
  - `CSharpScript.Create` với `ScriptOptions` chỉ add references/imports trong whitelist.
  - **Compile cache**: `ConcurrentDictionary<sha256(source+options), Script<object>>` có giới hạn số entry (LRU, default 256) — tránh recompile mỗi submission.
  - Chạy `script.RunAsync(globals, ct)` — truyền `CancellationToken` timeout từ executor. Lưu ý: Roslyn cancellation chỉ hủy giữa các statement yield được; vòng lặp `while(true)` không yield → **timeout không đảm bảo giết được**. Đây là lý do Phase 3 cần worker process (kill process là chắc chắn).
- net472 lưu ý: `Microsoft.CodeAnalysis.CSharp.Scripting` hỗ trợ netstandard2.0 → chạy được trên DNN, nhưng phải test binding redirect (kinh nghiệm từ cloud storage packaging: chỉ ship DLL feature, không ship `System.*`).

### 4.3 Executor

- `MegaForm.Core/Workflow/ScriptNodeExecutor.cs : INodeExecutor` (NodeType = Script).
- `ExecuteAsync`: respect `IsDisabled` (→ `Skipped`), parse config (pattern serialize/deserialize như `SetVariableNodeExecutor`), build globals model từ ctx, gọi `_scriptEngine.RunAsync`, map kết quả:
  - `Success` → `WorkflowNodeResult.Success("handle::default", output)`, ghi `ctx.NodeResults[node.Id]`, ghi `ctx.Variables[OutputVariable]` nếu có.
  - compile/runtime error → `WorkflowNodeResult.Failed(message có line number)`; engine sẽ route `ErrorHandlerNodeId` hoặc fail execution như các node khác.
- `Validate(node)`:
  - Required: `Script` không rỗng.
  - **Compile-check ngay lúc save** (gọi `IScriptEngine.Compile`) → map Roslyn diagnostics (line, col, severity) sang `WorkflowValidationError` → builder hiển thị lỗi trên node giống validation hiện tại.
  - Vì `Validate` là sync trong interface hiện tại: compile check sync (Roslyn compile thuần là sync được — `Script.Compile()` có overload sync). Timeout compile 5s.
- Executor nhận `IScriptEngine` qua ctor optional (pattern `SubmissionProcessor` cloud uploader): nếu host chưa đăng ký `IScriptEngine` → node `Failed("Script engine not available")`, không crash pipeline.

### 4.4 DI registration

4 host + Component, theo đúng pattern cloud storage:

| Host | File | Ghi chú |
|------|------|---------|
| Oqtane | `Startup.cs` | singleton (engine stateless + cache) |
| Web | `Program.cs` | singleton |
| Umbraco | `MegaFormComposer.cs` | singleton — kiểm tra lifetime `IModuleSettingsService` nếu engine cần settings |
| DNN | `DnnServiceLocator` manual-wire | static cache OK; test binding redirect Roslyn trên net472 |
| Component | `RegisterIntegrationProviders` hoặc method mới `AddMegaFormScripting()` | |

### 4.5 Builder UI (TS)

- `workflow-canvas.ts`:
  - `NODE_TYPE_META` thêm `Script: { icon: '📜', label: 'Script (C#)', zone: 'action', group: 'actions', ... }`.
  - `ACTION_TYPES` thêm `'Script'`.
  - Map enum→string (dòng ~472): thêm `40: 'Script'`.
- Settings panel: **server-driven qua `IWorkflowNodeUiSchemaProvider`** — thêm `ScriptWorkflowNodeUiService` trả schema với field type mới `code` (hoặc `textarea` nếu chưa làm editor). Khuyến nghị tích hợp Monaco editor (CDN hoặc bundle riêng, lazy-load chỉ khi mở panel Script — tránh nặng bundle builder).
- Panel có nút **"Test script"**: gọi endpoint `Form/Workflow/Script/Test` (admin-gated) với source + sample data JSON → trả value/logs/compile errors ngay trong builder.
- Snippet/preset: theo pattern `WorkflowNodeUiPreset` sẵn có (Webhook/Email đã dùng) — vài preset mẫu: "Tính tổng", "Validate lại dữ liệu", "Map sang object mới".

## 5. Bảo mật — phần quyết định

Script C# = **remote code execution có chủ đích**. Thiết kế phải coi mọi script là untrusted, kể cả khi ngưới viết là admin của 1 tenant.

### 5.1 Hai chế độ vận hành (config server-side)

| Chế độ | Ai được dùng | Cách chạy | Giới hạn |
|--------|--------------|-----------|----------|
| **Restricted** (default) | Admin form được cấp quyền script | Same-process Roslyn | Syntax blacklist + import whitelist + timeout + output cap. **Không gọi là sandbox** — chỉ là giảm rủi ro. |
| **Trusted** | Host admin bật toggle rõ ràng trong settings server | Same-process Roslyn, full framework | Chỉ cho on-prem / single-tenant nơi admin = chủ server. |
| **Isolated** (Phase 3) | Mặc định cho SaaS/multi-tenant | Worker process riêng | RAM/CPU bằng OS job object, kill chắc chắn, IPC JSON. |

Toggle ở module settings server-side (giống `MegaForm_CloudStorageConnections` — không bao giờ nhận từ frontend).

### 5.2 Các lớp phòng thủ (Restricted mode)

1. **Permission**: thêm quyền mới vào `PermissionCatalogService` (vd `workflow.script.manage`) — tách khỏi quyền edit workflow thường. UI ẩn node khỏi palette nếu user không có quyền (capabilities trong UI schema đã có pattern này).
2. **License gating**: chỉ production (đúng model `LicenseService.IsProductionLicensed()` — script node bị khóa ở trial giống AI).
3. **Import/reference whitelist** ở `ScriptOptions` (không add `System.IO`, `System.Net`, `System.Reflection`…).
4. **Static analysis trước khi compile**: walk `SyntaxTree` chặn các pattern nguy hiểm dù blacklist không toàn vẹn: `unsafe`, `fixed`, P/Invoke (`DllImport`), `dynamic`, pointer, `AppDomain`, `Assembly.Load`, `Type.GetType` với string động, `Process`, `File`, `Directory`, `Environment`. Vi phạm → validation error khi save.
5. **Timeout**: `CancellationTokenSource` + engine-level watchdog; log mọi lần timeout.
6. **Output cap**: serialize return value giới hạn `MaxOutputBytes`; từ chối object không serialize được (không cho trả về stream, delegate, type nội bộ).
7. **Audit**: mọi save/apply workflow chứa Script node ghi audit log (ai, hash script, thởi điểm) — tái dùng audit sẵn có của workflow apply.
8. **Không cho script gọi DB/HTTP trực tiếp**: nếu cần data, bắt buộc qua Database/Webhook node chuyên biệt (đã có `SsrfGuard`, `IConnectionRegistry`). Script chỉ nhận dữ liệu qua globals — đây là ràng buộc kiến trúc quan trọng nhất, giữ script thuần tính toán.
9. **SSRF analog**: không expose `IConnectionRegistry`/HTTP client vào globals dưới bất kỳ hình thức nào ở Restricted mode.

### 5.3 Worker process (Phase 3, phác thảo)

- `MegaForm.ScriptHost.exe` (console app net8+, single-file publish): nhận job qua stdin JSON `{scriptHash, source|cacheKey, globals, limits}`, trả stdout JSON kết quả.
- Host giới hạn: `Process` + Windows Job Object (memory cap, kill-on-close) / Linux cgroup; timeout → `process.Kill(true)`; mỗi job 1 process hoặc pool nhỏ có recycle.
- ScriptHost chạy với quyền thấp, không network (block bằng firewall rule trong docs vận hành), working dir tạm.
- Contract `IScriptEngine` không đổi → thêm `WorkerProcessScriptEngine`, swap bằng config.

## 6. Observability & error handling

- Execution log (đã có `ExecutionLog` per node): ghi thêm `scriptHash`, `durationMs`, `logs[]` (từ `Log()`), `returnType`, `outputPreview` (cắt 512 ký tự).
- Compile error: `Failed` với message dạng `Script 'Node Label': CS1002 at line 4 — ; expected`.
- Runtime exception: giữ `ErrorHandlerNodeId` routing; inner exception message có line number nếu Roslyn trả được.
- Dashboard: execution detail hiển thị script logs giống webhook response preview sẵn có.

## 7. Performance

- **Compile cache** là bắt buộc — compile Roslyn ~50–300ms/lần, không cache sẽ giết throughput submit. Cache key = sha256(source + options + engine version).
- Script chạy **inline** trong submit pipeline (Action zone) → tổng timeout mọi script node trong 1 execution nên có ceiling (vd 10s) để không block submit; vượt → fail-soft rõ ràng.
- Concurrency: `Script<T>` thread-safe để run song song nhiều submission.
- Không `async` trong script Phase 1 (globals đồng bộ); nếu sau này cần async, giới hạn `await` chỉ trên task hoàn thành sẵn.

## 8. Testing plan (theo pattern `MegaForm.Sdk.Tests`)

- `ScriptEngineTests`: compile cache hit/miss, đọc `Data`/ghi `Variables`, return value primitive + object JSON, `Log()` capture, timeout cancellation, banned API rejection (unsafe/DllImport/File), output cap.
- `ScriptNodeExecutorTests`: config parse lỗi, `IsDisabled` → Skipped, engine null → Failed rõ ràng, `Validate` map diagnostics đúng line/col.
- Không test worker process trong unit test (integration test riêng).

## 9. Tương thích & rollout

- Version cũ gặp node `Script=40`: không có trong `SupportedNodeTypes` của nó → save validation reject — chấp nhận được (workflow có script chỉ edit/save được trên version mới).
- `WorkflowJson` chỉ thêm config trong dictionary — không migration DB.
- Feature toggle: `MegaForm_ScriptingEnabled` (module settings server) + license production; mặc định **off** ở bản đầu, bật dần.
- i18n: keys `builder.workflow.script.*` (en-US + 11 REQUIRED locales + vi-VN) theo quy ước repo; chạy i18n:check.
- Bundle builder rebuild + sync 4 platform theo quy trình hiện tại.

## 10. Roadmap đề xuất

| Phase | Nội dung | Kết quả bàn giao |
|-------|----------|------------------|
| **P0** | Chốt contract `IScriptEngine`, config schema, security policy | Tài liệu này + review |
| **P1** | `MegaForm.Scripting` + `ScriptNodeExecutor` + DI 4 host + tests | Script node chạy same-process, Restricted mode |
| **P2** | Builder UI: palette, panel (Monaco lazy-load), Test endpoint, presets, i18n | UX hoàn chỉnh trong workflow builder |
| **P3** | `MegaForm.ScriptHost` worker process + `WorkerProcessScriptEngine` | Chế độ Isolated cho multi-tenant |
| **P4** | Script library dùng chung (tái dùng giữa các form, versioned, giống workflow library) | Snippet versioning, audit nâng cao |

## 11. Rủi ro & câu hỏi mở

1. **RCE risk là gốc rễ** — nếu sản phẩm hướng SaaS multi-tenant, cân nhắc chỉ ship P3 (worker) thay vì same-process. Quyết định này nên chốt trước P1.
2. **net472/DNN**: Roslyn scripting chạy được nhưng cần verify binding redirects thực tế trên site DNN 10 (bài học từ cloud storage: không ship `System.*`).
3. **Cancellation không tuyệt đối** in-process: vòng lặp vô hạn không yield sẽ treo thread submit → bắt buộc ceiling timeout + cảnh báo trong docs, và đây là lý do chính của worker process.
4. Có cần cho script **đọc submission khác / external table** không? — Khuyến nghị KHÔNG (vi phạm §5.2 #8); nếu cần, làm node riêng hoặc inject qua globals dạng read-only snapshot.
5. Có cho phép script trong **Navigation zone** (client-side) không? — Không thể (C# không chạy ở browser); nếu cần logic navigation phức tạp, dùng expression/condition hiện có hoặc cân nhắc JS expression evaluator (Jint) riêng — ngoài phạm vi tài liệu này.
