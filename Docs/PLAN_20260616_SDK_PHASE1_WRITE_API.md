# PLAN / HANDOFF — MegaForm.Sdk Phase 1 (Write API) — ✅ IMPLEMENTED

> **✅ DONE 2026-06-16 (impl session).** All 8 steps executed; SDK builds 0-error on net472/net8/net9/net10 (RS0016/RS0017 as errors → PublicAPI.Unshipped.txt verified exact); `MegaForm.Sdk.Tests` = **19/19 pass** (7 prior + 12 new write-API tests). Files touched: `MegaForm.Sdk/{Dtos,IMegaFormClient,MegaFormClient,ServiceCollectionExtensions}.cs` + `PublicAPI.Unshipped.txt` + `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`.
>
> **⚠️ ONE DESIGN DEVIATION from §1.3 / §3 (intentional, important):** the plan's "keep 5-arg ctor + ADD a separate 6-arg ctor with `SubmissionProcessor?` at position 3" is a **latent ambiguity bug** — `new MegaFormClient(forms, subs, null)` (the existing test call) is CS0121-ambiguous because `null` binds to BOTH `IPlatformContext?` (5-arg) and `SubmissionProcessor?` (6-arg) and neither overload is "better". Also the rationale (avoid editing the "frozen" Shipped.txt) was moot: the ctor line lives in **Unshipped.txt** (Shipped.txt is empty bar `#nullable enable`; 0.1.0-preview never shipped), so it can be freely edited. **Implemented instead = ONE ctor with a trailing optional `SubmissionProcessor? submissionProcessor = null`** — no ambiguity, no broken call-sites, DI factory passes it as the 6th arg. Unshipped.txt line 61 was UPDATED in place (not a new line 63). Everything else followed the plan verbatim.
>
> **Open-Q resolutions used:** Q1 HYBRID (kept). Q2 ip="sdk"/ua="MegaForm.Sdk"/time=0 — verified non-blocking: anti-spam runs only on the processor path and merely *flags* (SpamScore +30 when >2 fields, threshold 50; ProcessAsync saves-then-flags, never rejects) — cosmetic, follow-up optional. Q3 DNN/Web processor DI not re-verified (Oqtane confirmed Startup.cs:130) → those hosts may run the fallback until they register `SubmissionProcessor`. Q4 UpdateAsync = full-replace (kept).

**Date:** 2026-06-16 · **Status:** ✅ IMPLEMENTED & TESTED (was: 🟢 DESIGN DONE).
**Origin:** roadmap `FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md` §E Phase 1. Design produced by an UNDERSTAND workflow (6 agents mapping SDK+Core+tests+PublicAPI). Reply: **Tiếng Việt**.

> **Mục tiêu:** thêm WRITE API vào `MegaForm.Sdk` → mở khoá data-entry forms + Blazor schema-driven forms (form Blazor & form TS cùng submit qua 1 API, server validate chung). Facade GIỮ THIN (map DTO ⇄ Core, không business logic).

## 0) Phạm vi — 4 method + 2 DTO + 1 ctor overload
- `ISubmissionApi.SubmitAsync(formId, data, scope?)` → `SubmitResult`
- `ISubmissionApi.UpdateAsync(submissionId, data, scope?)` → `Task`
- `ISubmissionApi.DeleteAsync(submissionId, scope?)` → `Task`
- `IFormApi.UpdateFormAsync(formId, UpdateFormRequest, scope?)` → `FormDto`
- DTO mới: `SubmitResult`, `UpdateFormRequest`
- `MegaFormClient` ctor overload 6-arg (thêm `SubmissionProcessor?`) — GIỮ ctor 5-arg cũ.

## 1) Quyết định thiết kế then chốt (từ verify codebase)
1. **HYBRID SubmitAsync** — inject `SubmissionProcessor?` (optional). **Có processor (host thật Oqtane/DNN/Web qua DI)** → `processor.ProcessAsync(...)` ⇒ hành vi GIỐNG HỆT form JS submit (validate+antispam+notify+workflow+index). **Null processor (in-memory test, host nhẹ)** → fallback `RenderModelResolver.Resolve → FormValidationService.Validate → ISubmissionRepository.Insert`. Cả 2 trả cùng `SubmitResult`. ⇒ test chạy fallback, production chạy full pipeline. **(Composite per-part validation tự chạy** vì `FormValidationService.Validate` flatten Row/column qua `MegaFormUtils.FlattenFields` — đúng call ProcessAsync dùng.)
2. **2 type `SubmissionResult`**: `Core.Interfaces.SubmissionResult` (5 props, KHÔNG có ValidationErrors) vs `Core.Services.SubmissionResult` (8 props, ProcessAsync trả cái này). SDK mirror cái **Services** thành DTO mới `SubmitResult` (KHÔNG expose Core type). Dùng alias `using CoreSubmitResult = MegaForm.Core.Services.SubmissionResult;` tránh va tên.
3. **Ctor**: GIỮ nguyên ctor 5-arg (Shipped.txt:61 đóng băng) + THÊM ctor 6-arg với `SubmissionProcessor?` ở vị trí 3. Ctor cũ chain `: this(forms, submissions, null, platform, files, storage)`. ⇒ KHÔNG sửa `PublicAPI.Shipped.txt`, chỉ append `Unshipped.txt` (tránh RS0017).
4. **Repos (SYNC)**: `IFormRepository.SaveForm()` = upsert (FormId>0 ⇒ update). `ISubmissionRepository` có `UpdateData(id, json)` + `Delete(id)`. UpdateFormAsync = **load FormInfo → apply field non-null → SaveForm** (load-then-mutate giữ FormId, tránh INSERT trùng).
5. **Tenant isolation**: mirror `GetFormAsync` guard (`form.PortalId==0 || portalId==0 || match`). Submission write resolve form chủ qua `_submissions.Get(id).FormId → _forms.GetForm(formId)` rồi check PortalId; cross-tenant ⇒ no-op (Update/Delete) hoặc throw (UpdateForm) — nhất quán DeleteFormAsync.
6. **UpdateAsync = full-replace DataJson** (khớp endpoint `POST /Submissions/UpdateData`), KHÔNG merge.

## 2) API additions (signatures + maps-to-Core)
```csharp
// ISubmissionApi
Task<SubmitResult> SubmitAsync(int formId, Dictionary<string,object> data, MegaFormScope? scope = null, CancellationToken ct = default);
Task              UpdateAsync(int submissionId, Dictionary<string,object> data, MegaFormScope? scope = null, CancellationToken ct = default);
Task              DeleteAsync(int submissionId, MegaFormScope? scope = null, CancellationToken ct = default);
// IFormApi
Task<FormDto>     UpdateFormAsync(int formId, UpdateFormRequest request, MegaFormScope? scope = null, CancellationToken ct = default);
```
- **SubmitAsync** → processor path: `_processor.ProcessAsync(formId, data, ip:"sdk", ua:"MegaForm.Sdk", userId: scope.UserId>0?:null, 0)` → map `CoreSubmitResult`→`SubmitResult`. Fallback: Resolve schema → Validate → invalid⇒`{Success=false,ValidationErrors}`; valid⇒`_submissions.Insert(new SubmissionInfo{FormId,DataJson=JsonConvert.SerializeObject(data),Status="new",UserId,SubmittedOnUtc=UtcNow})`→`{Success=true,SubmissionId}`.
- **UpdateAsync** → tenant-guard → `_submissions.UpdateData(id, JsonConvert.SerializeObject(data))`.
- **DeleteAsync** → tenant-guard → `_submissions.Delete(id)`.
- **UpdateFormAsync** → `request==null⇒ArgNull`; load form; null/cross-tenant⇒`InvalidOperationException("Form not found in this portal.")`; apply non-null Title/Description/SchemaJson/Status/RequireAuth onto FormInfo; `_forms.SaveForm(form)`; reload+GetFormStats→ToDto.

### DTO mới (Dtos.cs)
```csharp
public sealed class SubmitResult {
  public bool Success; public int SubmissionId;
  public string? ErrorMessage; public string? SuccessMessage; public string? RedirectUrl;
  public bool IsSpam; public double SpamScore;
  public Dictionary<string,string>? ValidationErrors;   // null on success, populated on validation fail
}  // (dùng auto-property {get;set;} + XML-doc — GenerateDocumentationFile=true)
public sealed class UpdateFormRequest {
  public string? Title; public string? Description; public string? SchemaJson; public string? Status;
  public bool? RequireAuth;   // bool? để phân biệt "không đổi" vs "set false" (partial update)
}
```

## 3) `PublicAPI.Unshipped.txt` — append 40 dòng dưới `#nullable enable` (analyzer RS0016/RS0017 = ERROR)
> ⚠️ Format CỰC kỳ chặt. Nếu build báo RS0016 với dòng gợi ý khác (vd `object` vs `object!`), **copy verbatim dòng analyzer gợi ý**. Coi danh sách dưới là best-effort, reconcile theo build đầu.
```
MegaForm.Sdk.IFormApi.UpdateFormAsync(int formId, MegaForm.Sdk.UpdateFormRequest! request, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task<MegaForm.Sdk.FormDto!>!
MegaForm.Sdk.ISubmissionApi.SubmitAsync(int formId, System.Collections.Generic.Dictionary<string!, object!>! data, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task<MegaForm.Sdk.SubmitResult!>!
MegaForm.Sdk.ISubmissionApi.UpdateAsync(int submissionId, System.Collections.Generic.Dictionary<string!, object!>! data, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task!
MegaForm.Sdk.ISubmissionApi.DeleteAsync(int submissionId, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task!
MegaForm.Sdk.MegaFormClient.UpdateFormAsync(int formId, MegaForm.Sdk.UpdateFormRequest! request, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task<MegaForm.Sdk.FormDto!>!
MegaForm.Sdk.MegaFormClient.SubmitAsync(int formId, System.Collections.Generic.Dictionary<string!, object!>! data, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task<MegaForm.Sdk.SubmitResult!>!
MegaForm.Sdk.MegaFormClient.UpdateAsync(int submissionId, System.Collections.Generic.Dictionary<string!, object!>! data, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task!
MegaForm.Sdk.MegaFormClient.DeleteAsync(int submissionId, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task!
MegaForm.Sdk.MegaFormClient.MegaFormClient(MegaForm.Core.Interfaces.IFormRepository! forms, MegaForm.Core.Interfaces.ISubmissionRepository! submissions, MegaForm.Core.Services.SubmissionProcessor? submissionProcessor, MegaForm.Core.Interfaces.IPlatformContext? platform = null, MegaForm.Core.Interfaces.IFileRepository? files = null, MegaForm.Core.Interfaces.IStorageService? storage = null) -> void
MegaForm.Sdk.SubmitResult
MegaForm.Sdk.SubmitResult.SubmitResult() -> void
MegaForm.Sdk.SubmitResult.Success.get -> bool
MegaForm.Sdk.SubmitResult.Success.set -> void
MegaForm.Sdk.SubmitResult.SubmissionId.get -> int
MegaForm.Sdk.SubmitResult.SubmissionId.set -> void
MegaForm.Sdk.SubmitResult.ErrorMessage.get -> string?
MegaForm.Sdk.SubmitResult.ErrorMessage.set -> void
MegaForm.Sdk.SubmitResult.SuccessMessage.get -> string?
MegaForm.Sdk.SubmitResult.SuccessMessage.set -> void
MegaForm.Sdk.SubmitResult.RedirectUrl.get -> string?
MegaForm.Sdk.SubmitResult.RedirectUrl.set -> void
MegaForm.Sdk.SubmitResult.IsSpam.get -> bool
MegaForm.Sdk.SubmitResult.IsSpam.set -> void
MegaForm.Sdk.SubmitResult.SpamScore.get -> double
MegaForm.Sdk.SubmitResult.SpamScore.set -> void
MegaForm.Sdk.SubmitResult.ValidationErrors.get -> System.Collections.Generic.Dictionary<string!, string!>?
MegaForm.Sdk.SubmitResult.ValidationErrors.set -> void
MegaForm.Sdk.UpdateFormRequest
MegaForm.Sdk.UpdateFormRequest.UpdateFormRequest() -> void
MegaForm.Sdk.UpdateFormRequest.Title.get -> string?
MegaForm.Sdk.UpdateFormRequest.Title.set -> void
MegaForm.Sdk.UpdateFormRequest.Description.get -> string?
MegaForm.Sdk.UpdateFormRequest.Description.set -> void
MegaForm.Sdk.UpdateFormRequest.SchemaJson.get -> string?
MegaForm.Sdk.UpdateFormRequest.SchemaJson.set -> void
MegaForm.Sdk.UpdateFormRequest.Status.get -> string?
MegaForm.Sdk.UpdateFormRequest.Status.set -> void
MegaForm.Sdk.UpdateFormRequest.RequireAuth.get -> bool?
MegaForm.Sdk.UpdateFormRequest.RequireAuth.set -> void
```

## 4) Các bước implement (theo thứ tự)
1. **`MegaForm.Sdk/Dtos.cs`** — append `SubmitResult` + `UpdateFormRequest` (XML-doc mỗi member; `System.Collections.Generic` đã using).
2. **`MegaForm.Sdk/IMegaFormClient.cs`** — thêm 4 method vào IFormApi/ISubmissionApi; thêm `using System.Collections.Generic;` (hiện chỉ có System.Threading[.Tasks]).
3. **`MegaForm.Sdk/MegaFormClient.cs`** — `using MegaForm.Core.Services;` + `using MegaForm.Core.Rendering;` (RenderModelResolver) + `using Newtonsoft.Json;` + alias `CoreSubmitResult`. Thêm field `private readonly SubmissionProcessor? _processor;`. Thêm ctor 6-arg (chứa logic gán field), ctor 5-arg chain `: this(...,null,...)`. Implement 4 method + helper `private static SubmitResult ToSubmitResult(CoreSubmitResult r)`.
4. **`MegaForm.Sdk/ServiceCollectionExtensions.cs`** — factory thêm `sp.GetService<SubmissionProcessor>()` (vị trí 3) + `using MegaForm.Core.Services;`. (Oqtane Startup.cs:130 đã `AddScoped<SubmissionProcessor>()` ⇒ production resolve được; host chưa register ⇒ null ⇒ fallback.)
5. **`MegaForm.Sdk/PublicAPI.Unshipped.txt`** — append 40 dòng §3 (giữ `#nullable enable` dòng đầu). KHÔNG đụng Shipped.txt.
6. **Build** `dotnet build MegaForm.Sdk/MegaForm.Sdk.csproj -c Release` (net472;net8;net9;net10). Newtonsoft.Json transitive qua Core; nếu compile không thấy → thêm explicit PackageReference khớp version Core (HOẶC dùng System.Text.Json để tránh dep — net472 cần package). Reconcile RS0016/RS0017 theo diff analyzer.
7. **`MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`** — thêm [Fact] (xem §5). Fallback path KHÔNG cần đổi harness. Scope test sẵn: `PortalId=7, UserId=42`.
8. **Test** `dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj` (net10.0). 7 test cũ vẫn xanh + test mới xanh.

## 5) Test plan (13)
- `SubmitAsync_valid_data_inserts_via_fallback` (form published 1 field required → submit hợp lệ → Success+SubmissionId>0, repo có row).
- `SubmitAsync_missing_required_field_returns_validation_errors` (submit rỗng → Success=false, ValidationErrors["name"], KHÔNG insert).
- `SubmitAsync_composite_part_validation` (Row 2 nested required, submit 1 → fail + chứa key field thiếu → chứng minh FlattenFields/composite chạy như ProcessAsync).
- `SubmitAsync_via_processor_smoke` (OPTIONAL — dựng SubmissionProcessor 9-arg null deps + form Published; nếu Email/Webhook null gây NRE post-submit thì gate hoặc form no-notify).
- `UpdateAsync_replaces_datajson` / `UpdateAsync_cross_tenant_noop`.
- `DeleteAsync_removes_submission` / `DeleteAsync_cross_tenant_noop`.
- `UpdateFormAsync_updates_title_only` / `_partial_requireauth` / `_unknown_or_cross_tenant_throws` (InvalidOperationException) / `_null_request_throws` (ArgumentNullException).
- Regression: 7 test cũ pass + build 4 TFM với RS0016/RS0017=error (chứng minh Unshipped.txt đúng tuyệt đối).

## 6) Risks / gotchas (đọc trước khi code)
- **Divergence 2 path SubmitAsync**: processor = full pipeline (gate Status="Published", anti-spam, notify, workflow); fallback = chỉ validate+insert Status="new", BỎ gate Published. Phải XML-doc + README cảnh báo. Production (Oqtane) luôn có processor ⇒ full.
- **2 SubmissionResult** → fully-qualify/alias (Services vs Interfaces).
- **PublicApiAnalyzer brittle** → copy verbatim dòng analyzer nếu lệch (đặc biệt `Dictionary<string!, object!>!`).
- **Newtonsoft.Json** trong SDK: nếu transitive không lộ ra compile → thêm explicit ref khớp Core (hoặc System.Text.Json).
- **Processor-path test NRE**: Email/Webhook null bị deref trong post-submit (~ProcessAsync line 295-393) → smoke test optional/gated.
- **UpdateData KHÔNG set ModifiedOnUtc** (Core + facade) → mất audit time; nếu cần phải sửa Core (ngoài Phase 1).
- **SaveForm upsert**: PHẢI load-then-mutate (giữ FormId); fresh FormInfo FormId=0 ⇒ INSERT trùng.
- **PackageValidation** = public surface phải GIỐNG NHAU 4 TFM → chỉ dùng type có trên cả 4 (Dictionary/Task/CancellationToken) — KHÔNG đưa System.Text.Json type vào signature (vỡ net472).

## 7) ⚠️ OPEN QUESTIONS cần chốt khi bắt đầu (phiên sau / user)
1. **SubmitAsync REQUIRE processor (throw nếu null) hay FALLBACK (hiện chọn)?** Task gốc nói "REUSE ProcessAsync để behavior == JS submit" ⇒ nghiêng required; nhưng constraint testability cho phép fallback. Spec hiện = hybrid+document divergence. **Khuyến nghị: giữ HYBRID** (production luôn có processor nên parity; fallback chỉ phục vụ test/host nhẹ) — nhưng XÁC NHẬN.
2. **ip/userAgent/submissionTime cho processor path**: spec dùng ip="sdk", ua="MegaForm.Sdk", time=0 → anti-spam "too fast" có thể trip. Cân nhắc thêm param optional ipAddress/userAgent/submissionTime vào SubmitAsync (mở rộng public surface + Unshipped).
3. **DNN/Web có register `SubmissionProcessor` trong DI container SDK dùng không?** Đã verify Oqtane (Startup.cs:130). DNN/Web chưa rõ → có thể chạy fallback. Xác nhận trước khi claim full-pipeline parity trên 2 nền đó.
4. **UpdateAsync = full-replace** (đã chọn, khớp endpoint) vs merge — xác nhận consumer mong đợi replace.

## 8) Tham chiếu
- Workflow transcript: `0125f617-4780-471d-b4bb-e7edafdafea8/subagents/workflows/wf_0d6a92a4-80f` (Run ID `wf_0d6a92a4-80f`).
- Files SDK: `MegaForm.Sdk/{IMegaFormClient,MegaFormClient,Dtos,ServiceCollectionExtensions,MegaFormSdk}.cs` + `PublicAPI.{Shipped,Unshipped}.txt` + `.csproj`. Tests: `MegaForm.Sdk.Tests/{MegaFormClientContractTests,InMemoryRepositories}.cs`.
- Core: `SubmissionProcessor.ProcessAsync` (cs:84-91, return `Services.SubmissionResult` cs:542); `FormValidationService.Validate`; `IFormRepository.SaveForm`/`ISubmissionRepository.{UpdateData,Delete}` (ICoreInterfaces.cs); `RenderModelResolver.Resolve`.
- Roadmap: `FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md` §E (sau Phase 1: P2 expose FormSchema typed, P3 IFormRenderer + Blazor, P4 file upload/embed) + §F-resilience (kitchen-sink QA suite).
