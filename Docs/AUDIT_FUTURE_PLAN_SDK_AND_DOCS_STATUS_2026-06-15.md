# BÁO CÁO RÀ SOÁT HIỆN TRẠNG SO VỚI FUTURE PLAN

## MegaForm Developer SDK + Official Docs — Chúng ta đang ở đâu?

**Ngày lập báo cáo:** 2026-06-15  
**Tài liệu gốc:** `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md` (tạo 2026-06-13)  
**Phạm vi rà soát:** Toàn bộ solution, tập trung `MegaForm.Sdk`, `MegaForm.Sdk.Tests`, CI/CD, DocFX, cross-module registration, `MegaForm.Core` internalization/async.  
**Ràng buộc:** Chỉ phân tích — KHÔNG code, KHÔNG sửa đổi.

---

## 1. Tóm tắt điều tra

So với `FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`, solution đã **hoàn thành phần lớn Increment 1 và 2** (tạo SDK, DTO, facade, analyzer, tests, CI, DocFX scaffold). Tuy nhiên, **phần còn lại trong plan (cross-module wiring, Core internalization, async thật, lỗi nhất quán, query index) vẫn chưa được triển khai hoặc đang ở trạng thái dở dang**.

Những điểm đáng chú ý nhất:

- ✅ `MegaForm.Sdk` tồn tại, build sạch, multi-target `net472;net8;net9;net10`.
- ✅ `IMegaFormClient`, `IFormApi`, `ISubmissionApi`, `IFileApi`, DTO, `MegaFormScope` đã có.
- ✅ `PublicApiAnalyzers` + `PublicAPI.Shipped.txt`/`Unshipped.txt` + RS0016/RS0017 = error.
- ✅ `EnablePackageValidation` đã bật (nhưng chưa có baseline version).
- ✅ `MegaForm.Sdk.Tests` 7/7 PASS.
- ✅ CI workflow `sdk-ci.yml` và docs workflow `docs.yml` đã có, không rỗng.
- ✅ DocFX scaffold ở `Docs/docfx/` (không phải `Docs/site/` như plan ghi), `_site` đã build sẵn.
- ❌ **Không có host nào thực sự đăng ký `IMegaFormClient`**: Oqtane.Server, Web, Web.Host, DNN, Umbraco đều chưa gọi `AddMegaFormSdk()`.
- ❌ **Core types vẫn toàn bộ `public`**, chưa có `InternalsVisibleTo("MegaForm.Sdk")`.
- ❌ **Core repositories vẫn đồng bộ**; SDK async chỉ là wrapper `Task.FromResult`.
- ❌ **DNN không reference `MegaForm.Sdk`** nhưng lại có file dùng `MegaForm.Sdk.IMegaFormClient` → compile fail tiềm ẩn.
- ❌ `ISubmissionApi.SubmitAsync`, `IFormApi.UpdateFormAsync`, `IDataApi` chưa có.
- ❌ `SubmissionQuery` thiếu filters/search/date range/sort; EF read path không dùng `MF_SubmissionValues` index.
- ❌ Không có `MegaFormNotFoundException`/`MegaFormValidationException` hay `Result<T>`.
- ⚠️ Root `README.md` lỗi thờikhông nhắc đến SDK/docs/NuGet mới.
- ⚠️ Thư mục làm việc chưa phải Git repository (workflows tồn tại nhưng chưa active).

---

## 2. So sánh chi tiết theo từng phần của Future Plan

### A. TRANG DOCS CHÍNH THỨC

| Yêu cầu plan | Hiện trạng | Đánh giá |
|--------------|------------|----------|
| docs-as-code, DocFX, host GitHub Pages + custom domain | `Docs/docfx/` tồn tại với `docfx.json`, `index.md`, `toc.yml`, `articles/`, `api/index.md`, `_site/` đã build | ✅ Hoàn thành cơ bản |
| `Docs/site/` theo plan | Không tồn tại; thực tế là `Docs/docfx/` | ⚠️ Sai đường dẫn so với plan; cần cập nhật plan |
| GitHub Action build→Pages | `.github/workflows/docs.yml` tồn tại, có job `build` + `deploy` dùng `actions/deploy-pages@v4` | ✅ Có |
| 3 tầng docs NuGet: README embed, XML doc, docs site | `MegaForm.Sdk` và `MegaForm.AspNetCore.Component` đã có `PackageReadmeFile`, `GenerateDocumentationFile`, `PackageProjectUrl`, `RepositoryUrl` | ⚠️ Chỉ 2/4 project NuGet-like có; `MegaForm.Oqtane.Package` và `MegaForm.Core` chưa |
| `PackageProjectUrl` trỏ đến docs | `https://megaform.github.io/MegaFormSolution` | ✅ Có |
| Root README cập nhật | Root `README.md` lỗi thờikhông nhắc SDK, DocFX, CI/CD | ❌ Cần cập nhật |

**Nhận xét:** DocFX đã sẵn sàng để deploy khi repo lên GitHub. Cần sửa plan ghi `Docs/site/` thành `Docs/docfx/` và cập nhật root README.

---

### B. SDK — EXPOSE MEGAFORM NHƯ THƯ VIỆN API

#### B.1. `MegaForm.Sdk` project

| Yêu cầu | Hiện trạng | Đánh giá |
|---------|------------|----------|
| Project thuần C#, không phụ thuộc ASP.NET/Blazor | ✅ `MegaForm.Sdk.csproj` chỉ reference `Microsoft.Extensions.DependencyInjection.Abstractions` và analyzer | ✅ |
| Multi-target: `net472;net8;net9;net10` | ✅ Đúng 4 TFM | ✅ |
| `IMegaFormClient` với `Forms`, `Submissions` | ✅ Có thêm `Files`; thiếu `IData` | ⚠️ Gần đúng, còn thiếu `IDataApi` |
| `IFormApi`: Create/Get/List/Update/Delete | ✅ Create/Get/List/Delete; ❌ Update | ⚠️ Thiếu `UpdateFormAsync` + `UpdateFormRequest` |
| `ISubmissionApi`: Submit/Find/Get | ✅ Find/Get; ❌ Submit | ⚠️ Thiếu `SubmitAsync` |
| DTO công khai tách khỏi model nội bộ | ✅ `FormDto`, `CreateFormRequest`, `FormQuery`, `SubmissionDto`, `SubmissionQuery`, `PagedResult<T>`, `MegaFormScope`, `FileDto`, `MegaFormFileContent` | ✅ |
| `MegaFormScope { PortalId, UserId }` | ✅ Tồn tại, dùng làm overload explicit | ✅ |
| Async-first + `CancellationToken` | ✅ SDK surface async + `CancellationToken`; token không được observe | ⚠️ API đúng hình dáng, implementation chưa thực sự async |

#### B.2. Query / paging chuẩn cho `FindData`

| Yêu cầu | Hiện trạng | Đánh giá |
|---------|------------|----------|
| `SubmissionQuery { FormId, Filters[], DateFrom/To, Sort, Page, PageSize }` | `SubmissionQuery` chỉ có `FormId`, `Status`, `Page`, `PageSize` | ❌ Thiếu `Filters[]`, `DateFrom`, `DateTo`, `Search`, `Sort` |
| `FindAsync` dùng `MF_SubmissionValues` index | `FindAsync` luôn truyền `search: null`; EF read path dùng `DataJson.Contains`; DNN stored proc dùng `MF_SubmissionValues` nhưng SDK không truyền search | ❌ Không dùng được index từ SDK |
| `PagedResult<T>` | ✅ Có, gồm `Items`, `TotalCount`, `Page`, `PageSize` | ✅ |
| `ListFormsAsync` TotalCount thật | `TotalCount = items.Count` (fake) | ❌ Chưa có overload đếm form |

**Nhận xét:** SDK vừa đủ để demo Create/Get/List/Delete form và List/Get submission, nhưng chưa đủ cho production query phức tạp. `MF_SubmissionValues` index đang bị bỏ phí ở EF path.

#### B.3. Lỗi nhất quán

| Yêu cầu | Hiện trạng | Đánh giá |
|---------|------------|----------|
| `MegaFormNotFoundException` / `MegaFormValidationException` hoặc `Result<T>` | Không có. `GetFormAsync`/`GetAsync` trả `null`; lỗi lập trình ném `InvalidOperationException`/`ArgumentNullException` | ❌ Chưa làm |

#### B.4. Mở rộng nghiệp vụ

| Yêu cầu | Hiện trạng | Đánh giá |
|---------|------------|----------|
| Workflow (start/approve/reject) | Không xuất hiện trong SDK | ❌ Chưa |
| Files/Documents/Apps/Views/Export/Webhooks/events | `IFileApi` đã có nhưng chỉ List/Open; còn lại chưa expose | ⚠️ Rất sơ sài |

---

### C. 5 LỚP PHÒNG THỦ GIỮ SDK KHÔNG VỠ

| Lớp | Yêu cầu | Hiện trạng | Đánh giá |
|-----|---------|------------|----------|
| **Lớp 1** | DTO riêng; facade là cửa công khai duy nhất; Core types → `internal` + `InternalsVisibleTo("MegaForm.Sdk")` | DTO và facade ✅; Core types vẫn `public` hết, không có `InternalsVisibleTo` | ⚠️ Một nửa xong |
| **Lớp 2** | `PublicApiAnalyzers` + `PublicAPI.Shipped.txt`/`Unshipped.txt`, RS0016/RS0017 = error | ✅ Có analyzer, `Shipped.txt` gần như trống, `Unshipped.txt` 142 dòng, RS0016/RS0017 là error | ✅ Hoạt động tốt (API đang ở trạng thái unshipped/preview) |
| **Lớp 3** | Approval test + contract test | ✅ 7 xUnit contract tests PASS; không thấy Approval/Verify test | ⚠️ Contract test có, approval test chưa |
| **Lớp 4** | `EnablePackageValidation` + `PackageValidationBaselineVersion` | ✅ `EnablePackageValidation=true`; ❌ baseline version chưa set | ⚠️ Đúng cho preview; cần set sau first publish |
| **Lớp 5** | SemVer, `[Obsolete]`, CI gate | ⚠️ Version `0.1.0-preview`; CI workflow có; chưa thấy chính sách `[Obsolete]` ghi rõ | ⚠️ Cần hoàn thiện khi release |

**Nhận xét:** Lớp 2 (analyzer) và Lớp 3 (contract tests) đã vững. Lớp 1 (internalize Core) là điểm nghẽn lớn nhất vì ảnh hưởng nhiều project.

---

### D. CROSS-MODULE / EMBEDDED REUSE

Đây là phần **kém hoàn thiện nhất** so với plan.

| Host | Reference `MegaForm.Sdk` | Gọi `AddMegaFormSdk()` | Gọi `MegaFormSdk.Initialize()` | Đăng ký `IPlatformContext` | Đăng ký `IFileRepository`/`IStorageService` | Trạng thái |
|------|--------------------------|------------------------|--------------------------------|----------------------------|-----------------------------------------------|------------|
| **Oqtane.Server** | ❌ Không | ❌ Không | ❌ Không | ❌ Không (chỉ có stubs `IMfFormContext`) | ❌ Không (chưa dùng) | ❌ **Chưa wired** |
| **Web / Web.Host** | ❌ Không | ❌ Không | N/A | ✅ Có (`WebPlatformContext`) | ⚠️ `WebStorageService` có thể có | ❌ **Chưa wired** |
| **DNN** | ❌ Không* | ❌ Không | ❌ Không | N/A (DnnServiceLocator) | N/A | ❌ **Chưa wired + compile fail tiềm ẩn** |
| **Umbraco** | ❌ Không | ❌ Không | N/A | ✅ Có (`UmbracoPlatformContext`) | ❌ Không | ❌ **Chưa wired** |
| **MegaForm.Sdk** | — | — | ✅ Cung cấp | — | — | ✅ |

\* `MegaForm.DNN/Services/SingleClientServiceProvider.cs` sử dụng `MegaForm.Sdk.IMegaFormClient` nhưng `MegaForm.DNN.csproj` không reference `MegaForm.Sdk` → project sẽ không compile trừ khi DLL được copy bằng cách khác (không tìm thấy).

#### D.1. Static ambient accessor

Plan đề xuất `MegaForm.Client` hoặc `IMegaFormClientAccessor`. Hiện tại có `MegaFormSdk` static class với `Initialize(IServiceProvider)` và `RunAsync<T>(...)`. Đây là cơ chế tương đương nhưng **tên khác** với plan. Không có `MegaForm.Client` property.

Một sample DNN Razor host (`MegaForm.DNN/RazorHostSamples/MegaFormSdkListView.cshtml`) dùng `MegaFormSdk.RunAsync`, nhưng vì `DnnServiceLocator` không initialize `MegaFormSdk`, sample sẽ fail runtime.

#### D.2. SDK Demo View

`MegaForm.Oqtane.Client/SdkDemoView.razor` inject `IMegaFormClient`, nhưng:
- Không được route từ `Index.razor`/`Builder.razor`/`ModuleInfo.cs`.
- Host DI không register `IMegaFormClient`.
- Download endpoint `/api/MegaForm/SdkDemo/Download` không có controller.

→ Demo chưa chạy được end-to-end.

---

## 3. Các vấn đề sai / lệch / thiếu cụ thể

### 3.1. Sai/lệch so với plan

| STT | Vấn đề | Mức độ | Ghi chú |
|-----|--------|--------|---------|
| 1 | DocFX scaffold nằm ở `Docs/docfx/` thay vì `Docs/site/` như plan | Thấp | Chỉ cần cập nhật văn bản plan |
| 2 | Plan đề xuất `MegaForm.Client` / `IMegaFormClientAccessor`; thực tế là `MegaFormSdk` static class | Thấp | Chức năng tương đương, tên khác |
| 3 | Plan ghi `MegaForm.Sdk.Tests` 6 tests; thực tế 7 tests | Thấp | Tốt hơn plan |

### 3.2. Thiếu nghiêm trọng

| STT | Vấn đề | Mức độ | Ghi chú |
|-----|--------|--------|---------|
| 1 | Không host nào register `IMegaFormClient` / `AddMegaFormSdk()` | **Cao** | SDK tồn tại nhưng không dùng được trong app |
| 2 | `MegaForm.Core` types vẫn toàn bộ `public`, chưa `internal` + `InternalsVisibleTo` | **Cao** | Lộ public API nội bộ, khó đảm bảo SDK không vỡ |
| 3 | Core repositories vẫn đồng bộ | **Cao** | SDK async chỉ là wrapper; block thread, không observe `CancellationToken` |
| 4 | DNN project dùng `MegaForm.Sdk.IMegaFormClient` nhưng không reference SDK | **Cao** | Compile fail hoặc runtime missing assembly |
| 5 | Thiếu `ISubmissionApi.SubmitAsync` | Cao | Không thể submit qua SDK |
| 6 | Thiếu `IFormApi.UpdateFormAsync` + `UpdateFormRequest` | Cao | Không thể update form qua SDK |
| 7 | `SubmissionQuery` thiếu filters/search/date range/sort | Trung bình | `FindData` không phát huy khả năng query |
| 8 | EF read path không dùng `MF_SubmissionValues` index | Trung bình | Tìm kiếm vẫn `DataJson.Contains` scan |
| 9 | Không có custom exceptions / `Result<T>` | Trung bình | API không nhất quán khi lỗi |
| 10 | `ListFormsAsync` TotalCount fake (`items.Count`) | Trung bình | Paging UI hiển thị sai tổng số |
| 11 | `IFileApi` chỉ có List/Open, chưa upload/delete | Thấp | Chưa đầy đủ file lifecycle |
| 12 | Workflow/Documents/Export/Webhooks/events chưa expose | Thấp | Ngoài phạm vi Increment 1/2 |
| 13 | Root README lỗi thời | Thấp | Ảnh hưởng onboarding dev mới |
| 14 | Thư mục chưa là Git repo | Thấp | Workflows chưa active |

---

## 4. Kết luận: Chúng ta đang ở đâu?

Nếu chia plan thành các giai đoạn:

| Giai đoạn | Trạng thái | % hoàn thành ước tính |
|-----------|------------|----------------------|
| Increment 1: Tạo `MegaForm.Sdk` project, DTO, facade, multi-target | ✅ Xong | 100% |
| Increment 2: Tests, PackageValidation, CI, DocFX scaffold | ✅ Xong | ~90% (thiếu approval test, baseline version) |
| Lớp 1: Internalize Core + `InternalsVisibleTo` | ❌ Chưa bắt đầu | 0% |
| B5: Async-hóa Core thật | ❌ Chưa bắt đầu | 0% |
| B5: Query/paging chuẩn cho FindData qua `MF_SubmissionValues` | ⚠️ Dở dang | 30% |
| B7: Lỗi nhất quán (exceptions / `Result<T>`) | ❌ Chưa | 0% |
| Cross-module wiring (D): Oqtane/Web/DNN/Umbraco register SDK | ❌ Chưa | 5% (chỉ có code helper, chưa gọi) |
| Mở rộng nghiệp vụ: Workflow/Files/Documents/Export/Webhooks | ⚠️ Rất sơ sài | 10% (`IFileApi` mới List/Open) |

**Tóm lại:** SDK đã có hình hài rất tốt và đang build/test sạch. Tuy nhiên, **nó chưa được "cắm" vào bất kỳ host nào**, nên **chưa dùng được trong thực tế**. Đồng thời, hai công việc nền tảng lớn nhất của plan — **internalize Core types** và **async-hóa Core** — vẫn chưa bắt đầu, đúng như plan đã cảnh báo là "defer — blast-radius lớn".

---

## 5. Khuyến nghị ưu tiên (KHÔNG CODE)

### P0 — Phải làm ngay để SDK có thể chạy được

1. **Thêm `AddMegaFormSdk()` vào mỗi host startup**:
   - `MegaForm.Oqtane.Server/Services/Startup.cs`
   - `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` (hoặc gọi từ `AddMegaForm`)
   - `MegaForm.Web/Program.cs` hoặc `Web.Host/Program.cs`
   - `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
   - DNN: tạo `IDnnStartup` hoặc wiring trong `DnnServiceLocator`, đồng thời thêm project reference `MegaForm.Sdk`.
2. **Đảm bảo mỗi host register đầy đủ dependency mà SDK cần**: `IPlatformContext`, `IFileRepository`, `IStorageService` (đặc biệt Oqtane.Server đang thiếu cả 3).
3. **Sửa hoặc xóa `SingleClientServiceProvider.cs` trong DNN** nếu không thể compile; đồng thời cập nhật DNN manifest để ship `MegaForm.Sdk.dll`.
4. **Route SDK demo view** (`SdkDemoView.razor`) và tạo controller cho download file, hoặc ẩn demo cho đến khi hoàn thiện.

### P1 — Hoàn thiện API surface

5. Thêm `ISubmissionApi.SubmitAsync(int formId, IDictionary<string,object> values, ...)`.
6. Thêm `IFormApi.UpdateFormAsync(int formId, UpdateFormRequest req, ...)` + `UpdateFormRequest`.
7. Thêm `IDataApi` hoặc quyết định xóa khỏi plan nếu không cần.
8. Mở rộng `SubmissionQuery` với `Search`, `DateFrom`, `DateTo`, `Sort`, `Filters[]`.
9. Sửa `IFormRepository`/`ListForms` để trả về `TotalCount` thật, hoặc thêm overload đếm riêng.

### P2 — Nền tảng lâu dài

10. **Lên kế hoạch internalize Core**: liệt kê per-type, đánh giá impact từng consumer, thực hiện từng phần nhỏ.
11. **Lên kế hoạch async-hóa Core**: chuyển `IFormRepository`/`ISubmissionRepository` sang async, sau đó cập nhật DNN/Oqtane/Web callers.
12. **Sửa EF read path để dùng `MF_SubmissionValues` index** thay vì `DataJson.Contains`.
13. Định nghĩa custom exceptions (`MegaFormNotFoundException`, `MegaFormValidationException`) hoặc `Result<T>` pattern.
14. Cập nhật root `README.md` để phản ánh SDK, DocFX, CI/CD.
15. Cập nhật `FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`: sửa `Docs/site/` thành `Docs/docfx/`, ghi rõ `MegaFormSdk` thay cho `MegaForm.Client`.

### P3 — Khi release

16. Set `PackageValidationBaselineVersion` sau first publish.
17. Bổ sung Approval test (Verify/PublicApiGenerator snapshot).
18. Xây dựng chính sách SemVer + `[Obsolete]` và ghi vào `CONTRIBUTING.md`/`CLAUDE.md`.

---

## 6. Phụ lục — Các file tham khảo chính

- `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`
- `MegaForm.Sdk/MegaForm.Sdk.csproj`
- `MegaForm.Sdk/IMegaFormClient.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/MegaFormSdk.cs`
- `MegaForm.Sdk/ServiceCollectionExtensions.cs`
- `MegaForm.Sdk/PublicAPI.Shipped.txt`
- `MegaForm.Sdk/PublicAPI.Unshipped.txt`
- `MegaForm.Sdk/README.md`
- `MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj`
- `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`
- `MegaForm.Sdk.Tests/InMemoryRepositories.cs`
- `.github/workflows/sdk-ci.yml`
- `.github/workflows/docs.yml`
- `Docs/docfx/docfx.json`
- `Docs/docfx/index.md`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`
- `MegaForm.Web/Program.cs`
- `MegaForm.Web.Host/Program.cs`
- `MegaForm.DNN/Services/DnnServiceLocator.cs`
- `MegaForm.DNN/Services/SingleClientServiceProvider.cs`
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.Core/Interfaces/ICoreInterfaces.cs`
- `MegaForm.Core/Models/EntityModels.cs`
- `MegaForm.Core/Services/SubmissionProcessor.cs`
- `MegaForm.Core/Services/SubmissionIndexerService.cs`
- `README.md`

---

*Kết thúc báo cáo.*
