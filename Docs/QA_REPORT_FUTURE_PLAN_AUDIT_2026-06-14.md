# BÁO CÁO QA AUDIT — Thực trạng source code theo Future Plan MegaForm SDK + Docs

**Ngày audit:** 2026-06-14  
**Tài liệu đối chiếu:** `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`  
**Phạm vi audit:** `MegaForm.Sdk`, `MegaForm.Sdk.Tests`, `Docs/site`, `Docs/docfx`, `.github/workflows`, `MegaForm.Core`, `MegaForm.Oqtane.Server`, `MegaForm.AspNetCore.Component`, `MegaForm.DNN`, `MegaForm.Umbraco`  
**Ràng buộc:** Chỉ đọc + kiểm tra/test, **KHÔNG sửa source code**.  

---

## 1. Tóm tắt điều hành

Future Plan đặt ra 4 trục: **A) Docs chính thức**, **B) SDK lập trình**, **C) 5 lớp phòng thủ chống vỡ public contract**, **D) Cross-module / embedded reuse**. Theo ghi chép trong tài liệu, **INCREMENT 1 & 2 (2026-06-13)** đã triển khai `MegaForm.Sdk`, contract tests, PublicApiAnalyzers, PackageValidation, CI cơ bản và scaffold DocFX.

**Kết quả chung:**

| Tiêu chí | Kết quả |
|---|---|
| SDK build sạch trên `net472;net8;net9;net10` | ✅ Đạt |
| 7/7 contract tests PASS | ✅ Đạt |
| Public API được khóa bởi `PublicAPI.Unshipped.txt` + RS0016/RS0017 = error | ✅ Đạt |
| Oqtane & DNN đã wire `IMegaFormClient` / `MegaFormSdk` | ✅ Đạt (một phần) |
| Web & Umbraco chưa đăng ký SDK | 🔴 Chưa đạt |
| `UpdateFormAsync`, `SubmitAsync`, `IDataApi` chưa có | 🟡 Gap |
| Docs site đang song song 2 bản (`Docs/site/` vs `Docs/docfx/`) | 🟡 Cần thống nhất |
| Chưa có CI deploy docs → GitHub Pages | 🟡 Gap |
| Core vẫn 100% `public`, internalize chưa thể làm hàng loạt | 🟡 Gap có lý do |
| `ListFormsAsync.TotalCount` đang dùng `items.Count` (sai logic phân trang) | 🔴 Bug tiềm ẩn |

**Khuyến nghị cao nhất:** (1) Hoàn thiện surface SDK (`UpdateForm`, `Submit`), (2) wire SDK cho Web/Umbraco, (3) sửa `TotalCount` của `ListFormsAsync`, (4) thống nhất 1 DocFX project và bổ sung GitHub Pages workflow, (5) mở rộng CI ra toàn solution.

---

## 2. Phạm vi & phương pháp

**Các file/thư mục được đọc:**

- `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md`
- `MegaForm.Sdk/*.cs`, `MegaForm.Sdk/MegaForm.Sdk.csproj`
- `MegaForm.Sdk.Tests/*.cs`, `MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj`
- `MegaForm.Sdk/PublicAPI.Shipped.txt`, `PublicAPI.Unshipped.txt`
- `.github/workflows/sdk-ci.yml`
- `Docs/site/*`, `Docs/docfx/*`
- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.DNN/Services/DnnServiceLocator.cs`
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.Core/Interfaces/ICoreInterfaces.cs`, các namespace Models/Services/Workflow (grep)
- `README.md` gốc, `MegaForm.AspNetCore.Component/README.md`

**Công cụ:** `dotnet test`, `dotnet build`, `grep`, `ReadFile`.

---

## 3. Kết quả chi tiết theo Future Plan

### 3.A. TRANG DOCS CHÍNH THỨC

#### 3.A.1 Cấu trúc DocFX

| Vị trí | Trạng thái | Ghi chú |
|---|---|---|
| `Docs/site/` | 🟡 Có scaffold tối thiểu | `docfx.json`, `index.md`, `toc.yml`, `articles/getting-started.md`, `articles/sdk.md` |
| `Docs/docfx/` | ✅ Đầy đủ hơn | 8 bài guides, `api/` generated, `_site/` đã build, `README.md` hướng dẫn |
| **Vấn đề** | 🟡 Song song 2 project | Chưa rõ cái nào là canonical. Dễ gây nhầm lẫn và lỗi thời. |

#### 3.A.2 So sánh với cấu trúc đề xuất

Future Plan §A gợi ý: **Getting Started · Cài NuGet · Oqtane · DNN · Standalone · Form Builder · Workflow · AI · API Reference**.

| Mục | `Docs/site/` | `Docs/docfx/` | Ghi chú |
|---|---|---|---|
| Getting Started | ✅ | ✅ | |
| Cài NuGet | ❌ | ⚠️ Có install nhưng chưa rõ ràng | |
| Oqtane | ❌ | ✅ `oqtane-consumer.md` | |
| DNN | ❌ | ✅ `dnn-razor-host.md` | |
| Standalone | ❌ | ⚠️ `quickstart.md` đề cập | |
| Form Builder | ❌ | ❌ | |
| Workflow | ❌ | ❌ | |
| AI | ❌ | ❌ | |
| API Reference auto | ✅ | ✅ | Từ XML docs |

#### 3.A.3 NuGet package metadata (3 tầng docs)

Future Plan yêu cầu mỗi `.csproj` NuGet bật `GenerateDocumentationFile`, `PackageReadmeFile`, `PackageProjectUrl`, `RepositoryUrl`.

| Project | `GenerateDocumentationFile` | `PackageReadmeFile` | README tồn tại | `PackageProjectUrl` | `RepositoryUrl` | `PackageIcon` | `PackageTags` |
|---|---|---|---|---|---|---|---|
| `MegaForm.Sdk` | ✅ true | ❌ không có | ❌ không có | ❌ | ❌ | ❌ | ❌ |
| `MegaForm.AspNetCore.Component` | ❌ không có | ✅ `README.md` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `MegaForm.Oqtane.Package` | ❌ dùng `.nuspec` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `MegaForm.Core` | ❌ `false` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Nhận xét:** `MegaForm.Sdk` — package công khai quan trọng nhất — đang **thiếu README nhúng vào NuGet**, thiếu URL dự án/repo. NuGet.org sẽ hiển thị trang package trống trơn.

#### 3.A.4 Root README

`README.md` gốc (47 dòng) chỉ mô tả kiến trúc nội bộ, build commands, assets deployment. **Không đề cập** `MegaForm.Sdk`, `IMegaFormClient`, `AddMegaFormSdk`, docs site, cách cài NuGet.

#### 3.A.5 Deploy & domain

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| GitHub Action build docs → GitHub Pages | ❌ Chưa có | `.github/workflows/` chỉ có `sdk-ci.yml` |
| Custom domain / `CNAME` | ❌ Chưa có | Không tìm thấy file `CNAME` |
| `CONTRIBUTING.md`/`CLAUDE.md` về public API contract | ❌ Chưa có | |

**Kết luận mục A:** Có DocFX scaffold và nội dung cơ bản, nhưng **chưa đạt tiêu chuẩn docs chính thức**: thiếu deploy automation, metadata NuGet, README SDK, và đang song song 2 project docs.

---

### 3.B. SDK — EXPOSE MEGAFORM NHƯ THƯ VIỆN API

#### 3.B.1 Project & packaging

| Thuộc tính | Giá trị | Đánh giá |
|---|---|---|
| `TargetFrameworks` | `net472;net8.0;net9.0;net10.0` | ✅ DNN-ready |
| `Version` | `0.1.0-preview` | ✅ Phù hợp pre-release |
| `GeneratePackageOnBuild` | `false` | ✅ Không pack tự động |
| `GenerateDocumentationFile` | `true` | ✅ |
| `EnablePackageValidation` | `true` | ✅ Cross-TFM validation |
| `PackageValidationBaselineVersion` | ❌ chưa set | 🟢 Hợp lý vì chưa release |
| Dependency | `Microsoft.Extensions.DependencyInjection.Abstractions 8.0.0` | ✅ Host-agnostic |

#### 3.B.2 Public API surface

File `MegaForm.Sdk/PublicAPI.Unshipped.txt` có **142 dòng**, liệt kê đầy đủ public API. `PublicAPI.Shipped.txt` chỉ có `#nullable enable` (hợp lý vì chưa ship).

**Các public types hiện có:**

| Type | Vai trò | XML docs class | XML docs properties |
|---|---|---|---|
| `IMegaFormClient` | Facade gateway | ✅ | N/A |
| `IFormApi` | Form operations | ✅ | N/A |
| `ISubmissionApi` | Submission query | ✅ | N/A |
| `IFileApi` | File list/download | ✅ | N/A |
| `MegaFormClient` | Implementation | ✅ | N/A |
| `MegaFormSdk` | Static accessor | ✅ | N/A |
| `MegaFormSdkServiceCollectionExtensions` | `AddMegaFormSdk` | ✅ | N/A |
| `MegaFormScope` | Explicit tenant/user | ✅ | ✅ |
| `FormDto`, `CreateFormRequest`, `FormQuery` | Form DTOs | ✅ | ⚠️ Thiếu nhiều property docs |
| `SubmissionDto`, `SubmissionQuery` | Submission DTOs | ✅ | ⚠️ Thiếu nhiều property docs |
| `FileDto`, `MegaFormFileContent` | File DTOs | ✅ | ⚠️ Thiếu nhiều property docs |
| `PagedResult<T>` | Paging DTO | ✅ | ⚠️ Thiếu property docs |

> Build SDK phát sinh **cảnh báo CS1591** cho hàng loạt properties chưa có XML doc (ví dụ `SubmissionDto.UserId`, `FileDto.FileId`, `PagedResult<T>.Items`, …). Cảnh báo không fail build nhưng làm giảm chất lượng API Reference auto và IntelliSense.

#### 3.B.3 So sánh API thực tế với phác thảo Future Plan

Future Plan phác thảo:

```csharp
interface IMegaFormClient { IFormApi Forms; ISubmissionApi Submissions; IDataApi Data; }
interface IFormApi { Create/Get/List/Update/Delete }
interface ISubmissionApi { Submit/Find/Get }
```

**Thực tế:**

| API Future Plan | Thực tế | Gap |
|---|---|---|
| `IMegaFormClient.Data` | `IMegaFormClient.Files` (`IFileApi`) | 🟡 Tên khác; không có `IDataApi` tổng quát |
| `IFormApi.UpdateFormAsync` | **Chưa có** | 🔴 Thiếu |
| `ISubmissionApi.SubmitAsync` | **Chưa có** | 🔴 Thiếu |
| `ISubmissionApi.FindAsync` | ✅ Có | |
| `ISubmissionApi.GetAsync` | ✅ Có | |
| `IFormApi.DeleteFormAsync` | ✅ Có | |

**Nhận xét:** SDK hiện chủ yếu phục vụ **quản trị form + tra cứu submission/file**, chưa hỗ trợ **submit dữ liệu** — một trong các use-case chính của lập trình viên.

#### 3.B.4 DI registration & static accessor

```csharp
// MegaForm.Sdk/ServiceCollectionExtensions.cs:17
public static IServiceCollection AddMegaFormSdk(this IServiceCollection services)
{
    services.TryAddScoped<IMegaFormClient>(sp => new MegaFormClient(
        sp.GetRequiredService<IFormRepository>(),
        sp.GetRequiredService<ISubmissionRepository>(),
        sp.GetService<IPlatformContext>(),
        sp.GetService<IFileRepository>(),
        sp.GetService<IStorageService>()));
    return services;
}
```

| Yêu cầu | Trạng thái |
|---|---|
| `AddMegaFormSdk` | ✅ |
| `IFormRepository` / `ISubmissionRepository` bắt buộc | ✅ |
| `IPlatformContext` optional | ✅ |
| `IFileRepository` / `IStorageService` optional | ✅ |
| Static accessor `MegaFormSdk.Initialize` + `RunAsync<T>` | ✅ |

#### 3.B.5 Mapping DTO ↔ Core, async/sync, paging

File `MegaForm.Sdk/MegaFormClient.cs` map trực tiếp sang `MegaForm.Core.Models.FormInfo`, `SubmissionInfo`, `FileInfo`.

| Hành vi | Thực tế | Đánh giá |
|---|---|---|
| Async-first public API | ✅ Tất cả method trả `Task<T>` | |
| Core async | ❌ Core repos đồng bộ | SDK là async-over-sync wrapper (`Task.FromResult`) |
| `CancellationToken` | ✅ Có ở public signature | ❌ Không truyền xuống Core (Core không nhận) |
| `FindAsync.TotalCount` | ✅ Dùng total thật từ `ISubmissionRepository.List` | |
| `ListFormsAsync.TotalCount` | ⚠️ `TotalCount = items.Count` | 🔴 **Sai logic phân trang** — khi có nhiều trang, `TotalCount` chỉ bằng số item trang hiện tại |

**Bằng chứng bug `TotalCount`:**

```csharp
// MegaForm.Sdk/MegaFormClient.cs:91-100
var forms = _forms.ListForms(portalId, query.Status, query.Search, pageIndex, pageSize) ?? new List<FormInfo>();
var items = forms.Select(f => ToDto(f, 0)).ToList();
var result = new PagedResult<FormDto>
{
    Items = items,
    TotalCount = items.Count,   // <-- chỉ đếm trang hiện tại
    ...
};
```

`IFormRepository.ListForms` chỉ trả `List<FormInfo>` (không trả total), nên SDK không có cách nào biết tổng số form. Cần thêm overload đếm hoặc thay đổi repo.

#### 3.B.6 Tenant/user context & permission

- `MegaFormScope.PortalId` được dùng để lọc tenant.
- `MegaFormScope.UserId` **được khai báo nhưng chưa dùng** trong `MegaFormClient`.
- `PermissionService` **không được gọi** trong facade — SDK hiện không enforce quyền.
- Không có public exception types (`MegaFormNotFoundException`, `MegaFormValidationException`). Thay vào đó trả `null` hoặc silent ignore (ví dụ `DeleteFormAsync` không throw nếu form không tồn tại).

**Kết luận mục B:** SDK đã có nền tảng tốt, build sạch, public API được kiểm soát. Các gap chính: thiếu `UpdateFormAsync`, `SubmitAsync`, `IDataApi`; `ListFormsAsync.TotalCount` sai; chưa enforce permission/user; XML docs properties chưa đầy đủ.

---

### 3.C. 5 LỚP PHÒNG THỦ CHỐNG VỠ PUBLIC CONTRACT

#### Lớp 1 — Tách bạch cấu trúc / Internalize Core

| Yêu cầu | Thực tế |
|---|---|
| DTO riêng | ✅ `MegaForm.Sdk` có DTO riêng |
| Facade là cửa công khai duy nhất | ⚠️ SDK là facade, nhưng `MegaForm.Core` vẫn 100% public nên consumer vẫn có thể dùng Core trực tiếp |
| Core types → `internal` + `InternalsVisibleTo` | ❌ **Chưa làm** |

**Audit `MegaForm.Core`:**

- Grep không tìm thấy `internal class/interface/enum/struct/record` nào trong source (ngoại trừ 1 helper `internal static` trong `OqtaneConnectionRegistry`).
- Ước tính **~340 public type declarations** trên 15 namespace (`Interfaces`, `Models`, `Services`, `Services.Workflow`, `Workflow`, `Templating`, `Starters`, `Subform`, `AiAssistant`, `AiKnowledge`, `Blog`, `i18n`, `Rendering`, `ViewModes`, `Utilities`).
- Tất cả consumer (`Oqtane.Server`, `Web`, `DNN`, `Umbraco`, `Sdk`, `AspNetCore.Component`) đều tham chiếu trực tiếp đến Core interfaces/models/services.

**Kết luận Lớp 1:** Internalize toàn bộ Core **không khả thi** mà không phá build hàng chục project. Nếu cần giảm surface, phải làm **per-type**, giữ nguyên `Interfaces` + `Models` public, chỉ internalize các implementation helper thực sự nội bộ.

#### Lớp 2 — Roslyn Public API Analyzer

| Yêu cầu | Thực tệ |
|---|---|
| Gói `Microsoft.CodeAnalysis.PublicApiAnalyzers` | ✅ `3.3.4` trong `MegaForm.Sdk.csproj` |
| `PublicAPI.Shipped.txt` / `PublicAPI.Unshipped.txt` | ✅ Có cả 2 |
| RS0016/RS0017 = error | ✅ `<WarningsAsErrors>$(WarningsAsErrors);RS0016;RS0017</WarningsAsErrors>` |
| Build fail khi public API thay đổi chưa ghi | ✅ Đã kiểm chứng qua build |

**Nhận xét:** Lớp 2 đã triển khai tốt cho SDK. Cần mở rộng sang `MegaForm.AspNetCore.Component` khi component này cũng là package công khai.

#### Lớp 3 — Contract / Approval test

| Yêu cầu | Thực tế |
|---|---|
| Contract tests xUnit | ✅ 7 tests, tất cả PASS |
| In-memory repositories | ✅ Có `InMemoryFormRepository`, `InMemorySubmissionRepository`, `InMemoryFileRepository`, `InMemoryStorage` |
| Approval test (`PublicApiGenerator` + `Verify`) | ❌ **Chưa có** |

**Danh sách 7 tests (từ `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`):**

1. `CreateForm_then_GetForm_roundtrips`
2. `ListForms_returns_created_forms_in_portal`
3. `GetForm_in_other_portal_returns_null`
4. `FindSubmissions_paginates_with_total_count`
5. `DeleteForm_removes_it`
6. `NoContext_throws_when_no_scope_and_no_platform`
7. `Files_list_and_download_roundtrip`

**Kết quả chạy thực tế (`dotnet test`):**

```text
Passed!  - Failed: 0, Passed: 7, Skipped: 0, Total: 7, Duration: 513 ms
```

> Build phát sinh nhiều **CS1591** (XML doc missing) và nullable warnings trong `InMemoryRepositories.cs`. Không fail build/test nhưng cần dọn để chất lượng CI cao.

#### Lớp 4 — Package Validation

| Yêu cầu | Thực tế |
|---|---|
| `EnablePackageValidation` | ✅ true |
| `PackageValidationBaselineVersion` | ❌ chưa set |
| Tác dụng hiện tại | Chỉ validate consistency giữa các TFM (`net472` vs `net8/9/10`) |

**Nhận xét:** Hợp lý ở giai đoạn pre-release. Cần set baseline khi publish `0.1.0` chính thức.

#### Lớp 5 — Chính sách + CI gate

| Yêu cầu | Thực tế |
|---|---|
| CI chạy build+test+pack | ✅ `.github/workflows/sdk-ci.yml` |
| Chạy trên **mọi PR** | ❌ PR trigger có `paths` filter — chỉ chạy khi sửa `MegaForm.Sdk/**`, `MegaForm.Sdk.Tests/**`, `MegaForm.Core/**`, `.github/workflows/sdk-ci.yml` |
| Build/test toàn solution | ❌ Chỉ build SDK |
| Docs CI / GitHub Pages | ❌ Chưa có |
| Branch protection “đỏ không merge” | ❌ Repo chưa trên GitHub (workflow ghi chú "ready for when it is") |
| SemVer enforcement / `[Obsolete]` policy | ❌ Chưa có |

**Chi tiết `sdk-ci.yml`:**

```yaml
on:
  push:
    branches: [ main, master ]
    paths: [ 'MegaForm.Sdk/**', 'MegaForm.Sdk.Tests/**', 'MegaForm.Core/**', '.github/workflows/sdk-ci.yml' ]
  pull_request:
    paths: [ 'MegaForm.Sdk/**', 'MegaForm.Sdk.Tests/**', 'MegaForm.Core/**' ]
```

**Kết luận mục C:** Lớp 2 rất tốt; Lớp 3 đủ contract test nhưng thiếu approval test; Lớp 4 bật nhưng chưa baseline; Lớp 5 chưa bao phủ toàn bộ PR/solution/docs; Lớp 1 chưa thể làm hàng loạt.

---

### 3.D. CROSS-MODULE / EMBEDDED REUSE

#### 3.D.1 Tổng quan theo host

| Host | Đăng ký Core repos | `IPlatformContext` | `AddMegaFormSdk` | `MegaFormSdk.Initialize` | Static accessor | `MegaFormScope` | Gap chính |
|---|---|---|---|---|---|---|---|
| **Oqtane** | ✅ Đầy đủ | ❌ Chỉ có `Stub*` cho Razor | ✅ `Startup.cs:60` | ✅ `Startup.cs:201` | ✅ `RunAsync` | ✅ | Thiếu `IPlatformContext` thật, `MegaForm.Client` |
| **Web standalone** | ✅ Đầy đủ | ✅ `WebPlatformContext` | ❌ Không reference SDK | ❌ Không gọi | ❌ | ✅ class tồn tại | SDK chưa wire vào Web host |
| **DNN** | ✅ Qua adapters | ❌ Không có | ⚠️ New thủ công trong locator | ✅ Trong `DnnServiceLocator` | ✅ `RunAsync` | ✅ | Không dùng `IDnnStartup`/DI chuẩn, thiếu `IPlatformContext` |
| **Umbraco** | ✅ Đầy đủ | ✅ `UmbracoPlatformContext` | ❌ Không reference SDK | ❌ Không gọi | ❌ | ✅ class tồn tại | SDK chưa wire vào Umbraco |

#### 3.D.2 Oqtane

```csharp
// MegaForm.Oqtane.Server/Services/Startup.cs:60
MegaForm.Sdk.MegaFormSdkServiceCollectionExtensions.AddMegaFormSdk(services);
// ...:201
try { MegaForm.Sdk.MegaFormSdk.Initialize(app.ApplicationServices); } catch { }
```

- Core repos đăng ký đầy đủ.
- `IFileRepository` + `IStorageService` được đăng ký để Files API hoạt động.
- **Vấn đề:** `IPlatformContext` không được register. Thay vào đó chỉ có `IMfFormContext`, `IMfUserContext`, `IMfSiteContext` stubs cho Razor widgets. Do đó `IMegaFormClient` resolve ra với `platform = null`, bắt buộc caller truyền `MegaFormScope`.

#### 3.D.3 Web standalone

```csharp
// MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs:172
services.AddScoped<IPlatformContext, WebPlatformContext>();
```

- `AddMegaForm` đăng ký Core + `WebPlatformContext` đầy đủ.
- **Tuy nhiên không reference `MegaForm.Sdk`, không gọi `AddMegaFormSdk`, không `MegaFormSdk.Initialize`.**
- Kết quả: external module/background job trên Web host **không thể inject `IMegaFormClient`**.

#### 3.D.4 DNN

```csharp
// MegaForm.DNN/Services/DnnServiceLocator.cs:103-105
Mega = new MegaForm.Sdk.MegaFormClient(FormRepo, SubmissionRepo, null, FileRepo, Storage);
try { MegaForm.Sdk.MegaFormSdk.Initialize(new SingleClientServiceProvider(Mega)); }
catch { /* ambient accessor is optional */ }
```

- Dùng static service locator thay vì `IDnnStartup` DI chuẩn.
- `IPlatformContext` = null → cần `MegaFormScope`.
- `DnnPermissionPrincipalCatalogProvider` tồn tại nhưng **không được đăng ký vào locator**.

#### 3.D.5 Umbraco

```csharp
// MegaForm.Umbraco/Composers/MegaFormComposer.cs
builder.Services.AddScoped<IPlatformContext, UmbracoPlatformContext>();
// Không có AddMegaFormSdk / MegaFormSdk.Initialize
```

- Core repos + `UmbracoPlatformContext` đã đăng ký.
- Chưa reference `MegaForm.Sdk`, chưa expose `IMegaFormClient`.

#### 3.D.6 Static accessor theo đề xuất Future Plan

Future Plan §D.3 đề xuất `MegaForm.Client` / `IMegaFormClientAccessor`. Thực tế chỉ có `MegaFormSdk.RunAsync(...)`. Tên khác với phác thảo nhưng chức năng tương đương.

#### 3.D.7 Version / assembly reference policy

Future Plan §D.5 khuyến nghị consumer chỉ reference `MegaForm.Sdk` (stable) và để `MegaForm.Core` as provided (`CopyLocal=false`).

| Host | `MegaForm.Sdk` copy-local | `MegaForm.Core` copy-local |
|---|---|---|
| Oqtane | ✅ (project reference mặc định) | ✅ (project reference mặc định) |
| Web | ❌ chưa reference | ✅ |
| DNN | ✅ | ✅ |
| Umbraco | ❌ chưa reference | ✅ |

**Kết luận mục D:** Oqtane và DNN đã có thể dùng SDK (với hạn chế về `IPlatformContext`), nhưng **Web và Umbraco hoàn toàn chưa wire SDK**. Đây là 2 gap quan trọng cần xử lý sớm.

---

### 3.E. ASYNC-HÓA CORE VÀ PAGING FIND DATA

| Yêu cầu Future Plan | Thực tế |
|---|---|
| Async-first + `CancellationToken` | SDK đã async; Core repos vẫn sync |
| `CancellationToken` xuống repo | ❌ Chưa |
| Query/paging chuẩn cho FindData | ✅ `SubmissionQuery` + `PagedResult<T>`; `FindAsync` dùng total thật |
| `IFormRepository` trả total để `ListFormsAsync` đúng | ❌ `ListForms` chỉ trả `List<FormInfo>` → `TotalCount` bị sai |

`IStorageService` cũng đang lẫn sync/async: `SaveFileAsync` là async nhưng `GetFile`, `DeleteFile`, `GetFileUrl` là sync.

**Kết luận mục E:** Async-hóa Core là việc lớn, đụng chạm nhiều caller, nên phù hợp để defer như Future Plan đã ghi. Tuy nhiên **bug `ListFormsAsync.TotalCount` nên sửa trước** vì ảnh hưởng behavior public API.

---

## 4. Ma trận rủi ro

| # | Vấn đề | Mức độ | Lý do |
|---|---|---|---|
| 1 | `ListFormsAsync.TotalCount = items.Count` | 🔴 **Cao** | Phá vỡ hợp đồng phân trang; UI/consumer hiển thị sai tổng số |
| 2 | Web & Umbraco chưa đăng ký SDK | 🔴 **Cao** | SDK không khả dụng trên 2 platform, vi phạm mục D Future Plan |
| 3 | Thiếu `SubmitAsync`, `UpdateFormAsync` | 🔴 **Cao** | SDK chưa đủ use-case cốt lõi |
| 4 | `UserId` trong `MegaFormScope` không được dùng; chưa enforce permission | 🟡 **Trung bình–Cao** | Rủi ro bảo mật, lộ dữ liệu cross-user |
| 5 | Core 100% public, chưa internalize | 🟡 **Trung bình** | Lộ implementation; nhưng không thể làm nhanh |
| 6 | `CancellationToken` chỉ là hợp đồng | 🟡 **Trung bình** | Không hủy I/O thực sự |
| 7 | Song song 2 project DocFX | 🟡 **Trung bình** | Confuse maintainer, dễ outdated |
| 8 | Thiếu GitHub Pages / docs CI | 🟡 **Trung bình** | Docs không tự động publish |
| 9 | `MegaForm.Sdk` thiếu README/PackageProjectUrl/RepositoryUrl | 🟡 **Trung bình** | Trải nghiệm NuGet.org nghèo nàn |
| 10 | CI path-filter hẹp, không build toàn solution | 🟡 **Trung bình** | Regression ở Oqtane/Web/DNN/Umbraco có thể lọt |
| 11 | Thiếu approval test (PublicApiGenerator + Verify) | 🟢 **Thấp–Trung bình** | Public API shape đã được analyzer khóa, nhưng approval test tăng độ tin cậy |
| 12 | XML doc properties DTO chưa đầy đủ | 🟢 **Thấp** | CS1591 warnings |

---

## 5. Khuyến nghị ưu tiên

### P0 — Sửa ngay (trước khi release SDK)

1. **Sửa `ListFormsAsync.TotalCount`**
   - Cách nhanh: thêm overload `int CountForms(...)` vào `IFormRepository` và gọi trong SDK.
   - Hoặc đổi `ListForms` trả tuple `(List<FormInfo>, int total)` (breaking Core consumer nội bộ).
2. **Thêm `IFormApi.UpdateFormAsync`**
3. **Thêm `ISubmissionApi.SubmitAsync`**
4. **Wire SDK cho Web standalone**
   - Trong `MegaForm.AspNetCoreExtensions.RegisterMegaFormServices`, gọi `services.AddMegaFormSdk()`.
   - Trong `UseMegaForm` hoặc `Program.cs`, gọi `MegaFormSdk.Initialize(app.ApplicationServices)`.
5. **Wire SDK cho Umbraco**
   - Trong `MegaFormComposer.Compose`, gọi `builder.Services.AddMegaFormSdk()`.
   - Gọi `MegaFormSdk.Initialize(...)` nếu cần static accessor.

### P1 — Hoàn thiện quality & docs

6. **Thêm XML docs cho mọi public property** trong `MegaForm.Sdk/Dtos.cs` để loại bỏ CS1591.
7. **Tạo `README.md` cho `MegaForm.Sdk`** và thêm `<PackageReadmeFile>`, `<PackageProjectUrl>`, `<RepositoryUrl>`, `<PackageIcon>`, `<PackageTags>` vào `.csproj`.
8. **Bật `GenerateDocumentationFile` cho `MegaForm.AspNetCore.Component`** và thêm ProjectUrl/RepositoryUrl.
9. **Thống nhất 1 DocFX project**: giữ `Docs/docfx/` làm canonical (vì nội dung đầy đủ), xóa hoặc merge `Docs/site/`.
10. **Thêm GitHub Action deploy docs → GitHub Pages** (`docs.yml`).
11. **Cập nhật root `README.md`** với link docs site, hướng dẫn cài NuGet, snippet `AddMegaFormSdk`.

### P2 — Kiểm soát contract & CI

12. **Mở rộng CI**
    - Bỏ `paths` filter hoặc thêm workflow `solution-ci.yml` build/test toàn solution.
    - Thêm job build docs trong CI.
    - Khi repo lên GitHub, bật branch protection rule require CI pass.
13. **Thêm approval test** `PublicApiGenerator` + `Verify` để snapshot public API.
14. **Set `PackageValidationBaselineVersion`** sau khi release `0.1.0` chính thức.
15. **Viết `CONTRIBUTING.md`/`CLAUDE.md`** quy tắc: thay đổi `MegaForm.Sdk` public API phải cập nhật `PublicAPI.*.txt` + bump version.

### P3 — Kiến trúc dài hạn

16. **Lập kế hoạch internalize Core per-type** thay vì hàng loạt. Ưu tiên helper/utilities, không đụng interfaces/models/services.
17. **Async-hóa Core repos** khi có đủ thời gian và test coverage (rủi ro vỡ caller cao).
18. **Tích hợp `PermissionService` và `UserId`** vào SDK facade khi Core đã sẵn sàng.

---

## 6. Phụ lục

### 6.A. Danh sách file đã kiểm tra

```
Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md
MegaForm.Sdk/MegaForm.Sdk.csproj
MegaForm.Sdk/Dtos.cs
MegaForm.Sdk/MegaFormClient.cs
MegaForm.Sdk/ServiceCollectionExtensions.cs
MegaForm.Sdk/MegaFormSdk.cs
MegaForm.Sdk/PublicAPI.Shipped.txt
MegaForm.Sdk/PublicAPI.Unshipped.txt
MegaForm.Sdk.Tests/MegaFormClientContractTests.cs
MegaForm.Sdk.Tests/InMemoryRepositories.cs
MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj
.github/workflows/sdk-ci.yml
Docs/site/docfx.json
Docs/site/index.md
Docs/site/toc.yml
Docs/site/articles/getting-started.md
Docs/site/articles/sdk.md
Docs/docfx/docfx.json
Docs/docfx/index.md
Docs/docfx/toc.yml
Docs/docfx/README.md
Docs/docfx/articles/*
MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs
MegaForm.AspNetCore.Component/MegaForm.AspNetCore.Component.csproj
MegaForm.AspNetCore.Component/README.md
MegaForm.Oqtane.Server/Services/Startup.cs
MegaForm.DNN/Services/DnnServiceLocator.cs
MegaForm.Umbraco/Composers/MegaFormComposer.cs
MegaForm.Core/Interfaces/ICoreInterfaces.cs
MegaForm.Core/Interfaces/IWorkflowInterfaces.cs
README.md
```

### 6.B. Kết quả chạy test

Lệnh thực hiện:

```bash
dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj -c Release --no-restore
```

Kết quả:

```text
Passed!  - Failed: 0, Passed: 7, Skipped: 0, Total: 7, Duration: 513 ms - MegaForm.Sdk.Tests.dll (net10.0)
```

Cảnh báo trong quá trình build:

- **CS1591** trên nhiều public properties trong `MegaForm.Sdk/Dtos.cs`.
- Nullable warnings trong `MegaForm.Sdk.Tests/InMemoryRepositories.cs`.

### 6.C. Số lượng public types trong `MegaForm.Core` (ước tính)

| Namespace | Số public declaration |
|---|---|
| `MegaForm.Core.Interfaces` | ~45 |
| `MegaForm.Core.Models` | ~111 |
| `MegaForm.Core.Services` | ~44 |
| `MegaForm.Core.Services.Workflow` | ~15 |
| `MegaForm.Core.Workflow` | ~80 |
| `MegaForm.Core.Services.Starters` | ~12 |
| `MegaForm.Core.Templating` | ~13 |
| `MegaForm.Core.Services.Subform` | ~10 |
| `MegaForm.Core.Services.AiAssistant` | ~8 |
| `MegaForm.Core.Services.AiKnowledge` | ~2 |
| `MegaForm.Core.Services.Blog` | ~4 |
| `MegaForm.Core.i18n` | ~3 |
| `MegaForm.Core.Rendering` | ~2 |
| `MegaForm.Core.ViewModes` | ~2 |
| `MegaForm.Core.Utilities` | ~1 |
| **Tổng** | **~340** |

---

## 7. Kết luận cuối cùng

Dự án đã có **nền tảng SDK rất tốt**: build sạch 4 TFMs, public API được khóa chặt, contract tests pass, Oqtane/DNN đã tiêu thụ được. Tuy nhiên để đạt mục tiêu Future Plan, cần:

- **Sửa 3 gap chức năng chính:** `UpdateFormAsync`, `SubmitAsync`, `ListFormsAsync.TotalCount`.
- **Wire SDK cho Web và Umbraco** để đảm bảo cross-module parity.
- **Hoàn thiện docs & NuGet metadata** và thống nhất 1 DocFX project + deploy GitHub Pages.
- **Mở rộng CI** ra toàn solution và thêm approval test.
- **Lập roadmap internalize/async-hóa Core** theo từng bước nhỏ, tránh phá vỡ toàn hệ thống.

Báo cáo này **không thay đổi bất kỳ source code nào**.
