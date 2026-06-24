# Báo cáo rà soát — MegaForm.Sdk & Dev Doc cho Blazor / Schema-driven Form

**Ngày:** 2026-06-16  
**Ngườirà soát:** Kimi Code CLI  
**Phạm vi:** `MegaForm.Sdk/`, `MegaForm.Sdk.Tests/`, `MegaForm.Core`, `MegaForm.Oqtane.Client/Server`, `MegaForm.Web`, `MegaForm.DNN`, `MegaForm.Umbraco`, `Docs/docfx/`.  
**Ràng buộc:** không sửa code, chỉ đánh giá tiến độ và cập nhật báo cáo.

---

## 1. Tóm tắt điểm

| Mục | Trạng thái | Ghi chú |
|-----|-----------|---------|
| **SDK Read API** | ✅ Hoàn thành | `CreateForm/GetForm/ListForms/DeleteForm`, `FindData/Get` cho submissions, `ListForSubmissionAsync/OpenAsync` cho files. |
| **SDK Write API (Phase 1)** | ✅ Hoàn thành | `SubmitAsync`, `UpdateAsync`, `DeleteAsync`, `UpdateFormAsync` đã implement; 19/19 tests PASS. |
| **Wire SDK vào các host** | ❌ Chưa hoàn thành | `AddMegaFormSdk()` chưa được gọi trong Oqtane.Server, Web, DNN, Umbraco. `IPlatformContext` cũng chưa đăng ký ở Oqtane.Server. |
| **Dev doc — Reading Data** | ✅ Có | `Docs/docfx/articles/reading-data.md`, `quickstart.md`, `oqtane-consumer.md`, `dnn-razor-host.md`. |
| **Dev doc — Writing Data** | ⚠️ Thiếu | Chưa có bài hướng dẫn `SubmitAsync`, `UpdateAsync`, `DeleteAsync`, `UpdateFormAsync`. |
| **Dev doc — Blazor / Schema-driven form** | ❌ Chưa có | Chỉ có research doc `RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md`; chưa có hướng dẫn thực hành. |
| **Typed schema model (`FormSchema.Parse`)** | ⚠️ Nền sẵn trong Core, chưa expose qua SDK | `MegaForm.Core.Models.FormSchema` public, nhưng SDK chưa cung cấp wrapper/typed API. |
| **Blazor renderer / `IFormRenderer`** | ❌ Chưa có | Phase 3 roadmap chưa implement. |
| **Demo `SdkDemoView.razor`** | ⚠️ Tồn tại nhưng chưa wired | Component inject `IMegaFormClient`, nhưng host chưa đăng ký SDK; download endpoint `/api/MegaForm/SdkDemo/Download` chưa có controller. |

**Nhận định tổng thể:** SDK đã có đủ API nền (read + write Phase 1) để bắt đầu viết dev doc và prototype Blazor form, nhưng **cross-module wiring là điểm nghẽn lớn nhất**. Chưa host nào đăng ký `IMegaFormClient`, nên component demo hiện không chạy được. Phase 2 (schema typed) và Phase 3 (renderer) vẫn chưa bắt đầu.

---

## 2. Chi tiết SDK API

### 2.1 Read API — ✅ ổn định

File: `MegaForm.Sdk/IMegaFormClient.cs`, `MegaForm.Sdk/MegaFormClient.cs`, `MegaForm.Sdk/Dtos.cs`

- `IFormApi`: `CreateFormAsync`, `GetFormAsync`, `ListFormsAsync`, `DeleteFormAsync`.
- `ISubmissionApi`: `FindAsync`, `GetAsync`.
- `IFileApi`: `ListForSubmissionAsync`, `OpenAsync`.
- DTOs: `FormDto`, `CreateFormRequest`, `FormQuery`, `SubmissionDto`, `SubmissionQuery`, `FileDto`, `MegaFormFileContent`, `PagedResult<T>`, `MegaFormScope`.
- `MegaFormSdk` static accessor cho non-DI hosts.

**Tests:** `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs` — 7 test read cũ + 12 test write Phase 1 = **19/19 PASS** (`dotnet test MegaForm.Sdk.Tests`).

### 2.2 Write API Phase 1 — ✅ vừa hoàn thành

File: `MegaForm.Sdk/MegaFormClient.cs`, `Dtos.cs`, `IMegaFormClient.cs`, `ServiceCollectionExtensions.cs`, `PublicAPI.Unshipped.txt`

Thêm vào:

```csharp
// ISubmissionApi
Task<SubmitResult> SubmitAsync(int formId, Dictionary<string, object> data, MegaFormScope? scope = null, CancellationToken ct = default);
Task UpdateAsync(int submissionId, Dictionary<string, object> data, MegaFormScope? scope = null, CancellationToken ct = default);
Task DeleteAsync(int submissionId, MegaFormScope? scope = null, CancellationToken ct = default);

// IFormApi
Task<FormDto> UpdateFormAsync(int formId, UpdateFormRequest request, MegaFormScope? scope = null, CancellationToken ct = default);

// DTOs
public sealed class SubmitResult { Success, SubmissionId, ErrorMessage, SuccessMessage, RedirectUrl, IsSpam, SpamScore, ValidationErrors }
public sealed class UpdateFormRequest { Title?, Description?, SchemaJson?, Status?, RequireAuth? }
```

**Thiết kế SubmitAsync:** hybrid path.
- Nếu DI cung cấp `SubmissionProcessor` → gọi `ProcessAsync` (full pipeline: validate + anti-spam + notify + workflow + index).
- Nếu không → fallback `RenderModelResolver.Resolve` → `FormValidationService.Validate` → `ISubmissionRepository.Insert`.
- Cả hai path đều trả `SubmitResult` với `ValidationErrors` khi invalid.

**Lưu ý:** `SubmitResult` hiện có `ValidationErrors` (Dictionary<string,string>), đủ để Blazor hiển thị lỗi field-level. Tuy nhiên `CreateSubmissionRequest` DTO (dùng trong research POC) **chưa tồn tại**; SDK dùng signature `SubmitAsync(int formId, Dictionary<string,object> data, ...)`.

### 2.3 Gaps SDK còn lại (khối Blazor / schema-driven)

| Gap | Mức độ | Tác động |
|-----|--------|----------|
| `FormSchema.Parse` / typed `FormField` trong SDK | P1 | Blazor renderer không thể iterate schema mà không parse JSON thủ công hoặc tham chiếu `MegaForm.Core`. |
| `IFileApi.UploadAsync` | P1 | `InputFile` → submission chưa có API công khai. |
| `IFormRenderer` / Blazor component | P2 | Phase 3 roadmap chưa implement. |
| `CreateSubmissionRequest` DTO | P2 | Research POC giả định DTO này; SDK hiện dùng primitive params. |
| Query submissions nâng cao (filters, date range, sort) | P2 | `SubmissionQuery` thiếu; `MF_SubmissionValues` index chưa được dùng. |
| Exception types chuẩn (`MegaFormValidationException`, `MegaFormNotFoundException`) | P2 | Hiện dùng `InvalidOperationException` hoặc null/no-op. |

---

## 3. Trạng thái đăng ký SDK trên các host

### 3.1 Oqtane

File kiểm tra: `MegaForm.Oqtane.Server/**/*.cs` (loại trừ `bin/`/`obj/`)

- `AddMegaFormSdk()` — **không tìm thấy**.
- `IPlatformContext` registration — **không tìm thấy**.
- `SubmissionProcessor` — đã đăng ký trong `MegaFormServerStartup` (theo plan Phase 1), nhưng vì `AddMegaFormSdk()` chưa gọi nên `IMegaFormClient` không resolve được.
- `SdkDemoView.razor` inject `IMegaFormClient` — sẽ lỗi DI nếu route/component được render.

**Kết luận:** SDK chưa được "cắm" vào Oqtane. Đây là blocker P0 cho mọi consumer trên Oqtane.

### 3.2 MegaForm.Web (standalone host)

File kiểm tra: `MegaForm.Web/Program.cs`, controllers/services.

- `IPlatformContext` đã đăng ký (`builder.Services.AddScoped<IPlatformContext, WebPlatformContext>()`).
- `AddMegaFormSdk()` — **không tìm thấy**.

### 3.3 DNN

File kiểm tra: `MegaForm.DNN/**/*.cs`

- Không tìm thấy `AddMegaFormSdk` hay `IPlatformContext` registration.
- `DnnServiceLocator` / `MegaFormSdk.RunAsync` chưa được wire (theo `dnn-razor-host.md` plan).

### 3.4 Umbraco

File kiểm tra: `MegaForm.Umbraco/Composers/MegaFormComposer.cs`

- `IPlatformContext` đã đăng ký (`UmbracoPlatformContext`).
- `AddMegaFormSdk()` — **không tìm thấy**.

### 3.5 Tóm tắt wiring

```
Host           IPlatformContext    AddMegaFormSdk()    IMegaFormClient usable
─────────────────────────────────────────────────────────────────────────────
Oqtane         ❌                  ❌                  ❌
MegaForm.Web   ✅                  ❌                  ❌
DNN            ❌                  ❌                  ❌
Umbraco        ✅                  ❌                  ❌
```

**Khuyến nghị:** P0 = gọi `services.AddMegaFormSdk()` trong Oqtane `MegaFormServerStartup`, `MegaForm.Web` `Program.cs`, DNN `IDnnStartup`, Umbraco `MegaFormComposer`. Với Oqtane cần bổ sung `IPlatformContext` registration (có thể dùng `OqtaneSiteContext` hiện có hoặc tạo adapter mới).

---

## 4. Dev Doc hiện trạng

### 4.1 Có sẵn (DocFX articles)

File: `Docs/docfx/articles/toc.yml`

- `overview.md`
- `installation.md`
- `standalone-host.md` — có mục "Using the SDK in a standalone host" (đề cập `AddMegaFormSdk()` + `MegaFormSdk.Initialize`).
- `quickstart.md` — read submissions + files.
- `reading-data.md` — scope, list forms, query submissions, paging, parse `DataJson`.
- `file-download.md` — download file qua SDK.
- `oqtane-consumer.md` — demo `SdkDemoView.razor`, inject `IMegaFormClient`, download endpoint mẫu. **Lưu ý:** doc này giả định SDK đã được register; thực tế chưa.
- `dnn-razor-host.md` — demo Razor Host `.cshtml`, `DnnServiceLocator`, `MegaFormSdk.RunAsync`. **Lưu ý:** chưa implement wiring.
- `form-builder.md`, `workflow.md`, `ai-form-designer.md`, `api-stability.md`.

### 4.2 Thiếu / cần bổ sung

| Doc cần | Lý do | Độ ưu tiên |
|---------|-------|-----------|
| `writing-data.md` | Hướng dẫn `SubmitAsync`, `UpdateAsync`, `DeleteAsync`, `UpdateFormAsync`. Hiện dev chỉ có XML doc + research. | P1 |
| `blazor-schema-form.md` | Hướng dẫn render form Blazor từ `SchemaJson`, dùng `SubmitAsync`, xử lý `ValidationErrors`. | P1 |
| `sdk-consumer-checklist.md` | Checklist 1 dòng/nơi: `AddMegaFormSdk()`, `IPlatformContext`, `MegaFormSdk.Initialize` cho non-DI. | P2 |
| Cập nhật `oqtane-consumer.md` | Thêm note "yêu cầu `AddMegaFormSdk()` đã được gọi trong host" và link đến wiring checklist. | P2 |
| Cập nhật `dnn-razor-host.md` | Đánh dấu "planning/doc only — wiring chưa implement" hoặc hoàn thiện `DnnServiceLocator`. | P2 |

### 4.3 Research docs liên quan

- `Docs/RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md` — phân tích khả thi, 2 strategy (pure Blazor vs hybrid), compatibility concerns. Kết luận: **hybrid (TS renderer trong Blazor shell) khuyến nghị làm default**.
- `Docs/RESEARCH_SDK_API_GAP_AND_FORM_BUILDER_BEST_PRACTICES_2026-06-16.md` — gap analysis SDK + best practices form builder.
- `Docs/PLAN_20260616_SDK_PHASE1_WRITE_API.md` — Phase 1 đã implement.
- `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md` — roadmap Phase 2–4 + Blazor + resilience.

**Lưu ý quan trọng:** `RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md` §7 nói "This is impossible today because `SubmitAsync`, `FormSchema`, and `CreateSubmissionRequest` do not exist in the public SDK." Tính đến ngày 2026-06-16, **`SubmitAsync` đã tồn tại** (Phase 1 vừa implement), nhưng `FormSchema` public typed và `CreateSubmissionRequest` vẫn chưa có. Cần update research doc nếu giữ lại.

---

## 5. Blocker cho Blazor / Schema-driven form

Thứ tự dependency:

```
1. Wire SDK vào host (P0)
   └── AddMegaFormSdk() + IPlatformContext (Oqtane)
2. Expose FormSchema typed qua SDK (P1)
   └── wrapper / helper parse, không bắt consumer tham chiếu MegaForm.Core
3. Viết dev doc writing-data + blazor-schema-form (P1)
4. IFileApi.UploadAsync (P1)
5. IFormRenderer / Blazor component prototype (P2)
   └── Khuyến nghị hybrid trước (TS renderer trong Blazor shell)
6. Kitchen-sink QA suite + single-source validation rules (P2 — F-resilience)
```

**Nếu bắt đầu ngay:** prototype Blazor form có thể dùng `Mega.Forms.GetFormAsync(id)` lấy `SchemaJson`, parse bằng `System.Text.Json` hoặc `MegaForm.Core.Models.FormSchema` (nhưng vi phạm mục tiêu SDK-only), rồi gọi `Mega.Submissions.SubmitAsync(...)`. Tuy nhiên không thể chạy trên Oqtane cho đến khi wiring xong.

---

## 6. Khuyến nghị hành động tiếp theo

### P0 — Wiring (làm trước, không tốn nhiều code)

1. **Oqtane.Server**: trong `MegaFormServerStartup`, thêm:
   - `services.AddScoped<IPlatformContext, OqtanePlatformContextAdapter>()` (hoặc reuse context hiện có).
   - `services.AddMegaFormSdk();`
2. **MegaForm.Web**: `Program.cs` thêm `builder.Services.AddMegaFormSdk();` (sau `AddMegaForm` nếu cần).
3. **MegaForm.Umbraco**: `MegaFormComposer.cs` thêm `builder.Services.AddMegaFormSdk();`.
4. **MegaForm.DNN**: tạo `IDnnStartup` hoặc cập nhật composer hiện có để gọi `AddMegaFormSdk()` + đăng ký `IPlatformContext`.

### P1 — SDK Schema helpers + doc

5. **Phase 2 SDK**: expose `FormSchema`, `FormField`, `FieldValidation`, `ShowIfCondition` qua `MegaForm.Sdk` (DTO mirror hoặc facade helper `FormSchema.Parse`). Cập nhật `PublicAPI.Unshipped.txt`.
6. **Thêm `IFileApi.UploadAsync`** (file stream → `IStorageService` + liên kết submission).
7. **Viết `Docs/docfx/articles/writing-data.md`** — tập trung `SubmitAsync` + `ValidationErrors`.
8. **Viết `Docs/docfx/articles/blazor-schema-form.md`** — minimal POC: load form → render động → submit → hiển thị lỗi. Đề xuất hybrid strategy.

### P2 — Renderer + resilience

9. **Phase 3 SDK**: `IFormRenderer` interface + `MegaFormBlazorRenderer` (subset field đơn giản) + `MegaFormJsRenderer` (hybrid).
10. **Cập nhật `SdkDemoView.razor`** hoặc tạo `SdkBlazorFormDemo.razor` để demo end-to-end.
11. **Thêm controller `/api/MegaForm/SdkDemo/Download`** (hoặc loại bỏ download link tạm) để demo file download hoạt động.
12. **F-resilience**: bắt đầu kitchen-sink QA suite (`npm run qa:forms`) và `VALIDATION_INVARIANTS.md`.

---

## 7. Phụ lục — Các file/source đã kiểm tra

- `MegaForm.Sdk/IMegaFormClient.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/ServiceCollectionExtensions.cs`
- `MegaForm.Sdk/MegaFormSdk.cs`
- `MegaForm.Sdk/PublicAPI.Unshipped.txt`
- `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`
- `MegaForm.Oqtane.Client/Services/IMegaFormService.cs`, `MegaFormService.cs`
- `MegaForm.Oqtane.Client/SdkDemoView.razor`
- `MegaForm.Core/Models/FormSchema.cs`
- `Docs/docfx/articles/toc.yml`
- `Docs/docfx/articles/{quickstart,reading-data,oqtane-consumer,dnn-razor-host,standalone-host}.md`
- `Docs/RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md`
- `Docs/PLAN_20260616_SDK_PHASE1_WRITE_API.md`
- `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`

---

*Kết thúc báo cáo. Không có thay đổi code nào được thực hiện trong phiên rà soát này.*
