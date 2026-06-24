# Báo cáo rà soát lại — MegaForm.Sdk & Dev Doc cho Blazor / Schema-driven Form

**Ngày rà soát lại:** 2026-06-17  
**Ngày rà soát trước:** 2026-06-16  
**Ngườirà soát:** Kimi Code CLI  
**Phạm vi:** `MegaForm.Sdk/`, `MegaForm.Sdk.Tests/`, `MegaForm.Core`, `MegaForm.Oqtane.Server/Client`, `MegaForm.Web`, `MegaForm.DNN`, `MegaForm.Umbraco`, `Docs/docfx/`.  
**Ràng buộc:** không sửa code, chỉ đánh giá tiến độ và cập nhật báo cáo.

---

## 1. Executive summary

Phiên rà soát này phát hiện **tiến bộ đáng kể** so với báo cáo 2026-06-16:

- **Oqtane.Server đã wire SDK** (`AddMegaFormSdk()` + `MegaFormSdk.Initialize`).
- **Phase 2 Schema typed đã implement** qua `ISchemaApi` + `FormSchemaInfo`/`FormFieldInfo`.
- **Test suite tăng từ 19 → 31 test, 31/31 PASS**.

Tuy nhiên vẫn còn các vấn đề:

- `IPlatformContext` vẫn **chưa đăng ký** trên Oqtane.Server (SDK phụ thuộc `MegaFormScope` tường minh).
- Web, DNN, Umbraco vẫn **chưa gọi `AddMegaFormSdk()`**.
- Dev doc cho **writing data** và **Blazor/schema-driven form** vẫn thiếu.
- `SdkDemoView.razor` và download endpoint vẫn chưa wired hoàn chỉnh.

**Nhận định:** SDK đã sẵn sàng để viết prototype Blazor form (read schema + submit). Blocker còn lại chủ yếu là **cross-host wiring** và **dev doc**, không phải API surface.

---

## 2. Thay đổi so với báo cáo 2026-06-16

| Mục | Trước (2026-06-16) | Sau (2026-06-17) |
|-----|-------------------|------------------|
| Oqtane.Server `AddMegaFormSdk()` | ❌ Chưa gọi | ✅ Đã gọi trong `MegaFormServerStartup.ConfigureServices` (line 172) |
| Oqtane.Server `MegaFormSdk.Initialize` | ❌ Chưa gọi | ✅ Đã gọi trong `Configure` (line 179) |
| Oqtane.Server `IPlatformContext` | ❌ Chưa đăng ký | ❌ Vẫn chưa đăng ký |
| MegaForm.Web `AddMegaFormSdk()` | ❌ Chưa gọi | ❌ Vẫn chưa gọi |
| MegaForm.AspNetCore.Component `AddMegaFormSdk()` | ❌ Chưa gọi | ❌ Vẫn chưa gọi |
| MegaForm.Umbraco `AddMegaFormSdk()` | ❌ Chưa gọi | ❌ Vẫn chưa gọi |
| DNN `DnnServiceLocator.Mega` / `MegaFormSdk.Initialize` | ❌ Chưa có | ❌ Vẫn chưa có |
| SDK Phase 2 typed schema | ⚠️ Core có, SDK chưa expose | ✅ `ISchemaApi.Parse`/`ParseForm` + `FormSchemaInfo`/`FormFieldInfo`/`FieldValidationInfo`/`FieldOptionInfo` |
| Tests | 19/19 PASS | **31/31 PASS** |
| Dev doc writing-data / Blazor | ❌ Thiếu | ❌ Vẫn thiếu |
| `SdkDemoView.razor` route/controller download | ⚠️ Chưa wired | ⚠️ Vẫn chưa wired |

---

## 3. Chi tiết SDK API (cập nhật)

### 3.1 Read API — ✅ ổn định

Không thay đổi: `IFormApi`, `ISubmissionApi.FindAsync/GetAsync`, `IFileApi`.

### 3.2 Write API Phase 1 — ✅ ổn định

Không thay đổi: `SubmitAsync`, `UpdateAsync`, `DeleteAsync`, `UpdateFormAsync`.

### 3.3 Phase 2 — Schema typed — ✅ MỚI

File: `MegaForm.Sdk/IMegaFormClient.cs`, `MegaForm.Sdk/Dtos.cs`, `MegaForm.Sdk/MegaFormClient.cs`

API mới:

```csharp
public interface IMegaFormClient
{
    IFormApi Forms { get; }
    ISubmissionApi Submissions { get; }
    IFileApi Files { get; }
    ISchemaApi Schema { get; }   // NEW
}

public interface ISchemaApi
{
    FormSchemaInfo Parse(string schemaJson);
    FormSchemaInfo ParseForm(FormDto form);
}
```

DTOs mới:

- `FormSchemaInfo` — chứa `IReadOnlyList<FormFieldInfo> Fields` (đã flatten Row/composite).
- `FormFieldInfo` — `Key`, `Type`, `Label`, `Placeholder`, `HelpText`, `Required`, `ReadOnly`, `Hidden`, `Width`, `Order`, `IsInputField`, `Options`, `Validation`.
- `FieldValidationInfo` — `MinLength`, `MaxLength`, `Min`, `Max`, `Pattern`, `PatternMessage`, `CustomMessage`.
- `FieldOptionInfo` — `Label`, `Value`, `Selected`.

Implementation:
- `Parse` dùng `RenderModelResolver.Resolve` (fail-soft, empty schema khi malformed JSON).
- Dùng `MegaFormUtils.FlattenFields` để flatten layout Row/Composite → field list khớp với server validation.
- `IsInputField` loại trừ `html`, `section`, `row`, `uniqueid`.

**Ý nghĩa:** Blazor renderer giờ có thể đọc schema typed từ SDK mà không cần tham chiếu `MegaForm.Core` hay tự parse JSON.

### 3.4 Gaps SDK còn lại

| Gap | Mức độ | Tác động |
|-----|--------|----------|
| `IFileApi.UploadAsync` | P1 | `InputFile` → submission chưa có API công khai. |
| `IFormRenderer` / Blazor component | P2 | Phase 3 roadmap chưa implement. |
| `CreateSubmissionRequest` DTO | P2 | Research POC giả định DTO này; SDK hiện dùng primitive params. |
| Query submissions nâng cao (filters, date range, sort) | P2 | `SubmissionQuery` thiếu; `MF_SubmissionValues` index chưa được dùng. |
| Exception types chuẩn | P2 | Hiện dùng `InvalidOperationException` hoặc null/no-op. |
| `ShowIf` / conditional rules typed | P2 | `FormFieldInfo` chưa expose visibility rules. |

---

## 4. Trạng thái đăng ký SDK trên các host (cập nhật)

### 4.1 Oqtane — 🟡 Một nửa

File: `MegaForm.Oqtane.Server/Services/Startup.cs`

```csharp
// line 172
services.AddMegaFormSdk();

// line 179 (Configure)
try { MegaFormSdk.Initialize(app.ApplicationServices); } catch { /* non-fatal */ }
```

**Tích cực:**
- `IMegaFormClient` giờ resolve được trong Oqtane DI.
- `MegaFormSdk.RunAsync` ambient accessor hoạt động.
- `SubmissionProcessor` đã đăng ký ở line 131 → `SubmitAsync` sẽ chạy full pipeline.

**Tiêu cực:**
- `IPlatformContext` **không được đăng ký**. Comment trong code nói: *"optional IPlatformContext (not registered here → SDK callers pass an explicit MegaFormScope)"*.
- Hệ quả: nếu consumer không truyền `MegaFormScope`, SDK sẽ không biết portal nào → tenant guard dựa trên `portalId==0` (cho phép mọi form khi `form.PortalId==0` hoặc `portalId==0`). Điều này có thể gây **cross-tenant leak** nếu `MegaFormScope` bị quên.
- `IFileRepository` / `IStorageService` **không được đăng ký** trong Oqtane (chỉ có `IFormRepository`, `ISubmissionRepository`, `IDraftRepository`). Vì vậy `IFileApi.ListForSubmissionAsync`/`OpenAsync` sẽ trả empty/null trong Oqtane.

### 4.2 MegaForm.Web — 🟡 Một nửa

File: `MegaForm.Web/Program.cs`, `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`

- `IPlatformContext` đã đăng ký (`WebPlatformContext`).
- `AddMegaFormSdk()` **chưa được gọi** trong `Program.cs` cũng như trong `AddMegaForm()` extension.
- Vì vậy `IMegaFormClient` chưa resolve được trong standalone Web host.

### 4.3 MegaForm.Umbraco — 🟡 Một nửa

File: `MegaForm.Umbraco/Composers/MegaFormComposer.cs`

- `IPlatformContext` đã đăng ký (`UmbracoPlatformContext`).
- `IFileRepository`, `IStorageService` đã đăng ký.
- `AddMegaFormSdk()` **chưa được gọi**.

### 4.4 DNN — ❌ Chưa

File: `MegaForm.DNN/Services/DnnServiceLocator.cs`, `MegaForm.DNN/Services/SingleClientServiceProvider.cs`

- `DnnServiceLocator` khởi tạo đầy đủ Core repos + `SubmissionProcessor`, nhưng **chưa tạo** `IMegaFormClient` instance.
- `SingleClientServiceProvider` đã tồn tại (helper cho non-DI), nhưng **chưa được sử dụng**.
- Chưa có property `public IMegaFormClient Mega` trong `DnnServiceLocator`.
- Chưa gọi `MegaFormSdk.Initialize(...)`.

### 4.5 Tóm tắt wiring

```
Host           IPlatformContext    IFileRepository/IStorage    AddMegaFormSdk()    IMegaFormClient usable
────────────────────────────────────────────────────────────────────────────────────────────────────────
Oqtane         ❌                  ❌                          ✅                  🟡 (scope phải tường minh, file API không chạy)
MegaForm.Web   ✅                  ✅                          ❌                  ❌
DNN            N/A (static)        ✅ (via DnnServiceLocator)  ❌                  ❌
Umbraco        ✅                  ✅                          ❌                  ❌
```

---

## 5. Dev Doc hiện trạng (không đổi)

### 5.1 Có sẵn

- `overview.md`, `installation.md`, `standalone-host.md`, `quickstart.md`, `reading-data.md`, `file-download.md`, `oqtane-consumer.md`, `dnn-razor-host.md`, `form-builder.md`, `workflow.md`, `ai-form-designer.md`, `api-stability.md`.

### 5.2 Thiếu / cần bổ sung

| Doc cần | Lý do | Độ ưu tiên |
|---------|-------|-----------|
| `writing-data.md` | Hướng dẫn `SubmitAsync`, `UpdateAsync`, `DeleteAsync`, `UpdateFormAsync`. | P1 |
| `schema-reference.md` | Tài liệu `FormSchemaInfo`/`FormFieldInfo` + ví dụ parse. | P1 (vì Phase 2 vừa xong) |
| `blazor-schema-form.md` | Hướng dẫn render form Blazor từ schema + submit. | P1 |
| `sdk-consumer-checklist.md` | Checklist 1 dòng/nơi: `AddMegaFormSdk()`, `IPlatformContext`, `IFileRepository`, `IStorageService`. | P2 |
| Cập nhật `oqtane-consumer.md` | Thêm note: SDK đã wire nhưng `IPlatformContext` + file storage chưa; consumer phải truyền `MegaFormScope`. | P2 |

### 5.3 Research docs liên quan

- `Docs/RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md` — cần update dòng "`SubmitAsync`, `FormSchema`, and `CreateSubmissionRequest` do not exist" vì `SubmitAsync` và `FormSchema` (qua `ISchemaApi`) đã tồn tại.
- `Docs/PLAN_20260616_SDK_PHASE1_WRITE_API.md` — Phase 1 ✅ done.
- `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md` — Phase 2 đã bắt đầu, cần update trạng thái.

---

## 6. Demo `SdkDemoView.razor` (không đổi)

- Component vẫn inject `IMegaFormClient`.
- **Bây giờ resolve được** trong Oqtane vì `AddMegaFormSdk()` đã gọi.
- Tuy nhiên:
  - Nếu component không truyền `MegaFormScope.PortalId`, tenant guard có thể không chính xác (do thiếu `IPlatformContext`).
  - Download URL `/api/MegaForm/SdkDemo/Download` **vẫn chưa có controller**.
  - `IFileApi` trong Oqtane trả empty vì thiếu `IFileRepository`/`IStorageService`.

---

## 7. Test & Build

```bash
dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj
```

**Kết quả:** `Passed! 31/31` (tăng từ 19), duration ~325 ms.

Build SDK (`net472;net8;net9;net10`) chưa được chạy lại trong phiên rà soát này; các warning nullability mới xuất hiện trong `MegaFormClient.cs` (CS8601/CS8604/CS8625) — không phá build nhưng nên dọn.

---

## 8. Blocker cho Blazor / Schema-driven form (cập nhật)

Thứ tự dependency:

```
1. Wire SDK đầy đủ trên Oqtane (P0)
   └── Đăng ký IPlatformContext + IFileRepository + IStorageService
2. Wire SDK trên Web/Umbraco/DNN (P0)
   └── Gọi AddMegaFormSdk() + đăng ký dependencies còn thiếu
3. Viết dev doc writing-data + schema-reference + blazor-schema-form (P1)
4. IFileApi.UploadAsync (P1)
5. IFormRenderer / Blazor component prototype (P2)
   └── Khuyến nghị hybrid (TS renderer trong Blazor shell) trước
6. Kitchen-sink QA suite + single-source validation rules (P2)
```

**Nếu muốn POC ngay trên Oqtane:** prototype Blazor form có thể dùng `Mega.Forms.GetFormAsync(id)` → `Mega.Schema.ParseForm(form)` → render động → gọi `Mega.Submissions.SubmitAsync(...)`. Cần nhớ truyền `MegaFormScope { PortalId = ... }` vì `IPlatformContext` chưa có.

---

## 9. Khuyến nghị hành động tiếp theo

### P0 — Hoàn thiện wiring

1. **Oqtane.Server**:
   - Đăng ký `IPlatformContext` (adapter lấy portal từ `IAliasAccessor` / `ITenantManager`).
   - Đăng ký `IFileRepository` → `EfFileRepository` (nếu tồn tại) và `IStorageService` → `OqtaneStorageService`.
2. **MegaForm.Web**: thêm `builder.Services.AddMegaFormSdk();` trong `Program.cs` (hoặc trong `MegaFormAspNetCoreExtensions.AddMegaForm` để mọi standalone host tự động có SDK).
3. **MegaForm.Umbraco**: thêm `builder.Services.AddMegaFormSdk();` trong `MegaFormComposer.Compose`.
4. **DNN**: trong `DnnServiceLocator` constructor, tạo `IMegaFormClient` instance và gọi `MegaFormSdk.Initialize(new SingleClientServiceProvider(_megaClient))`.

### P1 — Dev doc

5. Viết `Docs/docfx/articles/writing-data.md` — tập trung `SubmitAsync` + `ValidationErrors`.
6. Viết `Docs/docfx/articles/schema-reference.md` — `ISchemaApi.Parse`, `FormFieldInfo`, `FieldValidationInfo`, ví dụ iterate fields.
7. Viết `Docs/docfx/articles/blazor-schema-form.md` — minimal POC: load form → parse schema → render động → submit → hiển thị lỗi.
8. Cập nhật `oqtane-consumer.md` và `RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md` để phản ánh trạng thái hiện tại.

### P1 — File upload API

9. Thêm `IFileApi.UploadAsync(int formId, string fieldKey, Stream content, string fileName, string contentType, MegaFormScope? scope = null)` (hoặc tương đương) để hỗ trợ `InputFile` trong Blazor.

### P2 — Renderer + resilience

10. Phase 3: `IFormRenderer` interface + `MegaFormBlazorRenderer` (subset đơn giản) + `MegaFormJsRenderer` (hybrid).
11. Thêm controller `/api/MegaForm/SdkDemo/Download` hoặc loại bỏ link download tạm trong `SdkDemoView.razor`.
12. Kitchen-sink QA suite (`npm run qa:forms`) và `VALIDATION_INVARIANTS.md`.

---

## 10. Phụ lục — Các file/source đã kiểm tra

- `MegaForm.Sdk/IMegaFormClient.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/ServiceCollectionExtensions.cs`
- `MegaForm.Sdk/PublicAPI.Unshipped.txt`
- `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.Oqtane.Client/SdkDemoView.razor`
- `MegaForm.Web/Program.cs`
- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.DNN/Services/DnnServiceLocator.cs`
- `MegaForm.DNN/Services/SingleClientServiceProvider.cs`
- `Docs/docfx/articles/toc.yml`
- `Docs/RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md`
- `Docs/PLAN_20260616_SDK_PHASE1_WRITE_API.md`
- `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`

---

*Kết thúc báo cáo rà soát lại. Không có thay đổi code nào được thực hiện trong phiên này.*
