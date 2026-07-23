# MegaForm — Ghi chép bàn giao (Umbraco)

> Cập nhật lần cuối: 2026-07-23 bởi Kimi Code CLI.
> Phiên này: hoàn thiện tính năng **cloud file storage** (Google Drive / Amazon S3 / Azure Blob) — nối vào submit pipeline (fail-soft sau insert), lưu connection server-side, UI cấu hình trong builder, DI đủ 4 host + AspNetCore.Component, assembly riêng `MegaForm.Integrations.CloudStorage`, packaging DNN/Oqtane. Xem mục 2.8.
> Trước đó (2026-07-17): nền tảng **typed submission storage** trong `MegaForm.Core`; backup trên branch `feature/typed-submission-storage-core`.
> Phiên tiếp theo: implement `ISubmissionDataStore` + migrations + repositories cho từng platform, bắt đầu với Umbraco hoặc Oqtane; viết typed rows song song với `DataJson` legacy; backfill legacy submissions. Ngoài ra: verify runtime cloud storage (browser test: tạo connection, test, submit form có file → file lên cloud).
> Tài liệu audit: `Docs/HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`.
> Audit security & performance (phương pháp Mythos, read-only): `Docs/AUDIT_SECURITY_PERFORMANCE_MYTHOS_2026-07-21.md` — 44 findings security (4 Critical) + 24 findings performance (2 Critical), kèm lộ trình khắc phục P0/P1/P2. **P0 đã fix xong 2026-07-21** (xem mục 8 Remediation log trong doc); còn lại P1/P2.

## 1. Nguyên tắc kiến trúc

- **Core + UI TypeScript là shared.** Không sửa `MegaForm.Core`, `MegaForm.UI` (TS/Vite source), `MegaForm.Oqtane.*`, hay `MegaForm.DNN` trừ khi được yêu cầu rõ ràng.
- **Tập trung vào Umbraco:** `MegaForm.Umbraco` và `MegaForm.Umbraco.Host`.
- **Target framework:** `net8.0`.
- **Target Umbraco:** Umbraco 14+ (backoffice APIs dựa trên Umbraco.NewBackoffice).
- Mục tiêu cuối cùng: đạt feature parity với DNN/Oqtane cho Umbraco host.

## 2. Những gì đã làm được

### 2.1 Nền tảng native (Native foundation)

- Schema migration cho Umbraco.
- Backoffice authentication integration.
- `IPlatformContext` / `IPlatformAdapter` implementation cho Umbraco.
- Centralized path configuration (`MegaFormUmbracoPaths`, `MegaFormFileSystemHelper`, v.v.).
- Localization / lang file registration.
- Rendering pipeline: property editor + public render tag helper / view component.

### 2.2 Backoffice integration

- **Content App:** `MegaFormContentApp` Bellissima native, consume `UmbWorkspaceContext`, render bằng `uui-box`/`uui-table`.
- **Content App API:** endpoints CRUD cơ bản cho form trong Content App.
- **Lang file:** `en-US.xml`, `vi-VN.xml` cho backoffice labels.
- **Property Editor:** `megaForm` property editor Bellissima native (`UmbLitElement`, `UmbPropertyValueChangeEvent`, `uui-select`) để chọn/embed form vào content node.
- **Section Sidebar / Tree:** thêm `sectionSidebarApp` + `menu` + `menuItem` vào `umbraco-package.json`, với `megaform-sidebar-menu.js` render Dashboard / Forms (dynamic list) / Submissions / Languages bằng `uui-menu-item`.

### 2.3 Hosted services & DI

- Đăng ký hosted services và các dịch vụ cần thiết trong `MegaFormUmbracoComposer`.
- Tích hợp `MegaForm.Core` services với Umbraco DI container.

### 2.5 Phase 5 — Native Bellissima & Marketplace readiness (hoàn thành)

### 2.6 Phase 6 — Iframe auth fix & shared TS UI activation (vừa hoàn thành)

- **Sửa lỗi dashboard/submissions/languages trống trong Umbraco backoffice:**
  - Nguyên nhân: `MegaFormAdminController` dùng policy `MegaFormBackOffice` (cookie + bearer); iframe bên trong Bellissima không forward cookie đáng tin cậy → các host page bị 401.
  - Giải pháp: chuyển `MegaFormAdminController` sang `[AllowAnonymous]`; các host page chỉ còn là shell HTML tải shared TS UI. Toàn bộ phân quyền thực sự vẫn nằm ở `MegaFormApiController` / `MegaFormPermissionController`.
- **Thêm `MegaForm.UI/src/umbraco-host/index.ts`:**
  - File TypeScript duy nhất dành riêng cho Umbraco trong `MegaForm.UI`.
  - Đọc `access_token` từ `localStorage['umb:userAuthTokenResponse']` (do Bellissima lưu khi login).
  - Xuất `window.__MF_TOKEN` và cài đặt fetch interceptor tự động thêm `Authorization: Bearer <token>` cho mọi request đến `/api/MegaForm/` hoặc `/umbraco/MegaForm/MegaFormApi/`.
  - Được build qua Vite thành `megaform-umbraco-host.js` và sync đến `MegaForm.Umbraco/wwwroot/js/`.
- **Cập nhật host views (`Dashboard.cshtml`, `Builder.cshtml`, `Submissions.cshtml`, `Languages.cshtml`):**
  - Tải `megaform-umbraco-host.js` **trước** các bundle dashboard/builder/submissions/languages.
  - `Dashboard.cshtml` không còn embed server-rendered JSON; dashboard bundle tự fetch dữ liệu client-side với token.
- **Kết quả:** shared Vite/TS backend UI (giống Oqtane/DNN) giờ chạy được trong Umbraco iframe; không còn 401 do cookie forwarding.

- **Marketplace packaging:** cập nhật `PackageProjectUrl`/`RepositoryUrl`, `PackageReleaseNotes`, `PackageTags`; thay `license.lic` placeholder bằng `LICENSE.txt`; cập nhật `umbraco-marketplace.json` và `README.md`; nâng `MegaForm.Sdk` lên `1.0.0` stable.
- **Native property editor:** viết lại `megaform-form-picker.js` bằng `UmbLitElement`, `UmbPropertyValueChangeEvent`, `uui-select`.
- **Native content app:** viết lại `megaform-submissions-app.js` consume `UmbWorkspaceContext`, render `uui-box`/`uui-table`.
- **Section sidebar/tree:** thêm `sectionSidebarApp` + menu + menu item với dynamic form list.
- **Auth:** `MegaFormAdminController` dùng policy `MegaFormBackOffice` thay vì cookie-only.

### 2.4 Phase 4 — Feature parity vừa hoàn thành

- **Upload / SDK:** upload template, image/list, PDF form, SDK demo download.
- **StarterController + adapter:** `MegaFormStarterController` + `UmbracoStarterPlatformAdapter`.
- **AI Assistant / Tools / LocalAI:** endpoints tương tác AI & LocalAI integration.
- **Public render / iframe / script embed + CORS:** public rendering APIs, iframe embed, script tag embed, CORS config.
- **Phase 2 form-view CRUD:** form view CRUD endpoints.
- **Workflow:** workflow inbox/claim/approve/reject/forward/comment.
- **Workflow builder + reusable library:** `Form/Workflow/*`, `Form/Workflow/Library/*`, `EfWorkflowLibraryRepository`, thêm bảng `MF_WorkflowTemplates/Versions/FormWorkflows` và migration step.
- **AI Knowledge Base CRUD:** `AiKnowledgeController`, `AiKnowledgeFeedbackController`, `AiKnowledgeRulesController`, `AiKnowledgeTemplatesController`.
- **Reports:** báo cáo submissions / analytics cơ bản.
- **Route prefix rewrite middleware:** `/api/MegaForm/*` và `/api/MegaFormPopup/Subform/*` tự động rewrite sang `/umbraco/MegaForm/MegaFormApi/*`, giúp shared TS UI hoạt động trên Umbraco mà không cần cấu hình apiBase thủ công trên mọi trang.
- **Marketplace packaging:** cập nhật `PackageProjectUrl`/`RepositoryUrl`, `PackageReleaseNotes`, `PackageTags`; thay `license.lic` placeholder bằng `LICENSE.txt`; cập nhật `umbraco-marketplace.json` và `README.md`; nâng `MegaForm.Sdk` lên `1.0.0` stable để tránh prerelease dependency khi publish.
- **Backoffice auth:** `MegaFormAdminController` chuyển sang dùng policy `MegaFormBackOffice` (hỗ trợ cả cookie và bearer token) thay vì cookie-only.
- **ModuleConfig global settings:** Database/Payment/Captcha/Email/Upload/GoogleSheets settings endpoints (`MegaFormApiController.ModuleConfig.cs`).
- **DataRepeater widget:** `DataRepeaterController` phục vụ Query/FilterOptions/Export cho public forms.
- **Form extras:** Lock/Unlock/LockedIds, SaveTheme, EvaluateRules, Field/TestInsert (`MegaFormApiController.FormExtras.cs`, `FieldExtras.cs`).
- **Submission extras:** BulkDelete, UpdateData, Export CSV/JSON (`MegaFormApiController.SubmissionExtras.cs`).
- **ExternalTableController:** phục vụ builder/AI tool kết nối external tables trên Umbraco.
- **PaymentController:** Stripe create-intent/confirm + PayPal public-config/test-credentials/create-order/capture-order cho Umbraco, giữ nguyên server-side price enforcement.
- **PrintController:** public print preview / QR code / print settings.
- **AppBuilder:** AppDefinition CRUD + assign form.
- **Route rewrite middleware:** mở rộng rewrite toàn bộ `/api/MegaFormPopup/*` → `/umbraco/MegaForm/MegaFormApi/*`.
- **RazorWidgetController:** stub tạm thời (List rỗng, action khác 501) để UI không 404 trong khi engine render chưa port.

### 2.7 Phase 7 — Typed Submission Storage foundation (Core-only, vừa hoàn thành)

> Mục tiêu: chuyển từ `MF_Submissions.DataJson` là canonical payload sang **record master + field rows + typed value tables**, lấy cảm hứng từ Umbraco Forms. Phiên này chỉ làm `MegaForm.Core`; các platform sẽ implement ở phiên sau.

- **Branch backup:** `feature/typed-submission-storage-core`.
- **Core entity models:** `SubmissionFieldRecord` + `SubmissionValueString/LongText/Number/Date/Boolean/JsonRecord` + `SubmissionDataType` enum trong `MegaForm.Core/Models/TypedSubmissionEntities.cs`.
- **Shared DTOs:** `SubmissionDataDocument`, `SubmissionFieldWrite`, `BackfillOptions/Result` trong `MegaForm.Core/Services/TypedSubmission/`.
- **Storage contract:** `ISubmissionDataStore` trong `MegaForm.Core/Interfaces/ISubmissionDataStore.cs`.
- **Value normalizer:** `SubmissionFieldNormalizer` map `FormField.Type` → `SubmissionDataType`, hỗ trợ multi-value, composite, boolean, date/number/string/longtext/json.
- **Data reconstructor:** `SubmissionDataReconstructor` rebuild `Dictionary<string, object>` từ typed field/value rows.
- **Legacy backfill:** `LegacySubmissionBackfillService` đọc `DataJson` cũ và ghi typed rows idempotently; hỗ trợ `ILegacySubmissionSource` cho cross-form backfill.
- **Query service preview:** `SubmissionQueryService.GetDetailTyped()` dùng typed store khi có, fallback về JSON legacy.
- **Unit tests:** `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs` — 39 tests pass.
- **Build:** `MegaForm.Core` build OK trên `net472/net8.0/net9.0/net10.0` (0 error). Toàn bộ `MegaForm.Sdk.Tests` pass (88/88).

### 2.8 Phase 8 — Cloud file storage (Google Drive / S3 / Azure Blob), hoàn thành 2026-07-23

Nối tính năng cloud file storage (scaffold từ 2026-06-14, xem `Docs/HANDOFF_20260614_INTEGRATION_PROVIDERS_IMPLEMENTED.md`) vào runtime thật:

- **Core:**
  - `FormSettings.CloudStorage` (`settings.cloudStorage` = `{ enabled, mappings: [StorageIntegrationMapping] }`) trong `MegaForm.Core/Models/FormSchema.cs`; block này bị strip khỏi public schema (`FormSchemaSensitivePropertyStripper`).
  - `CloudStorageConnectionCatalog` — named connections (credentials) lưu server-side per-platform dưới settings key `MegaForm_CloudStorageConnections` (mirror `NamedConnectionCatalog`); `MaskSecrets` → `***` khi echo ra browser.
  - `SubmissionCloudStorageUploader` (fail-soft, log qua `ILogService`, không bao giờ chặn submit) đã nối vào `SubmissionProcessor` ngay sau insert (optional ctor param cuối `cloudStorageUploader`); bỏ qua submission spam. File được đọc lại từ disk qua `ISubmissionFileBlobReader` (per host) vì upload đi request riêng trước submit.
  - Contracts: `ICloudStorageConnectionProvider` + `DelegateCloudStorageConnectionProvider`, `ISubmissionFileBlobReader` (`Integrations/Storage/ISubmissionStorageHostServices.cs`).
- **Assembly mới `MegaForm.Integrations.CloudStorage`** (net472/net8/net9/net10, đã add vào `MegaForm.sln`, packable 1.0.0): `AmazonS3StorageProvider` (ClientId/ClientSecret=keys, BaseFolder=bucket, Extra["Region"], BaseUrl=S3-compatible endpoint) + `AzureBlobStorageProvider` (ClientSecret=connection string, BaseFolder=container). Stateless, parameterless ctor. Core KHÔNG reference AWSSDK/Azure SDK.
- **DI 4 host + Component:** Oqtane `Startup.cs`, Web `Program.cs`, Umbraco `MegaFormComposer.cs` (scoped vì IModuleSettingsService scoped), DNN manual-wire trong `DnnServiceLocator` (static HttpClient); `MegaForm.AspNetCore.Component` `RegisterIntegrationProviders`. Mỗi host có blob reader riêng (`*SubmissionFileBlobReader.cs`) mirror đúng path layout + traversal guard của upload/download endpoint.
- **API (4 host, admin-gated như named connections):** `ModuleConfig/CloudStorageConnectionsList` (masked) / `CloudStorageConnectionSave` (secret "***" = giữ cũ) / `CloudStorageConnectionDelete` / `CloudStorageConnectionTest`.
- **Builder UI:** section "Cloud Storage" trong Settings tab (`dom.ts` + module mới `cloud-storage-settings.ts`, sync hook trong `panels.ts`): enable toggle, mappings (provider/connection/folder/upload-fields/organize-by-submission), modal quản lý connections (list/add/edit/delete/test, `extra` gửi dạng object). 44 i18n keys `builder.cloudStorage.*` trong en-US + 11 REQUIRED locales. Bundle đã rebuild + sync 4 platform.
- **Packaging:** Oqtane 2 nuspec (+6 DLL cloud cho net9/net10); DNN `MegaForm.dnn` + `BuildPackage-DNN.ps1` (chỉ ship 6 DLL feature, CỐ Ý không ship `Microsoft.Extensions.*`/`System.*` — site DNN 10 đã có; site cũ nếu thiếu DI.Abstractions 10.x cần binding redirect, cloud upload fail-soft không ảnh hưởng submit).
- **Tests:** `MegaForm.Sdk.Tests/CloudStorageTests.cs` — 23 tests (catalog + uploader fail-soft). Tổng 142/142 pass.
- **Chưa verify:** runtime browser (tạo connection → test → submit form có file → file lên cloud). Cần credentials thật (Google OAuth token / AWS keys / Azure connection string).

### 2.9 Phase 9 — Field-level input mask + token `U` auto-uppercase, hoàn thành 2026-07-23

Mở rộng mask engine (vốn chỉ cho Composite parts) lên **field Text/Phone/Url thường**:

- **Core:** `FieldValidation.Mask` (`FormSchema.cs`) — `field.validation.mask`. Server validate completeness (value length == mask length) trong `FormValidationService` (trước Pattern, message ưu tiên PatternMessage/CustomMessage).
- **Grammar mới:** token `U` = letter auto-uppercased (thêm vào `renderer/mask.ts` — `formatWithMask` uppercase ký tự đặt vào slot `U`). Grammar đầy đủ: `#` digit, `A` letter, `U` upper-letter, `*` alnum, ký tự khác = literal. Ví dụ: `UU-####-***`.
- **Renderer:** `inputs.ts` (Text/Phone/Url) + SSR `FormHtmlRenderer.cs` stamp `data-mf-mask` (đọc `validation.mask`, fallback `properties.mask`); `inputmode="numeric"` chỉ khi mask không chứa chữ. Client validate completeness ở cả 3 path: `validation.ts`, `megaform-renderer.ts`, `validation-extra.ts`.
- **Builder:** ô "Mask (# digit, A letter, U upper, * alnum)" trong Validation panel (`dom.ts` + `field-settings.ts` save + `properties.ts` load); hint composite designer cập nhật thêm `U` (en-US).
- **Tests:** `MegaForm.Sdk.Tests/FormValidationMaskTests.cs` — 7 tests; tổng 149/149 pass. Bundle renderer + builder đã rebuild/sync 4 platform.
- **Lưu ý:** giá trị lưu DB là chuỗi đã mask (vd `AB-1234-XYZ`); server không kiểm tra từng ký tự đúng loại (đó là việc của client mask engine + regex Pattern nếu cấu hình kèm). Chưa verify runtime browser.

## 3. Trạng thái hiện tại

- `MegaForm.Umbraco` build thành công (0 error).
- `MegaForm.Umbraco.Host` build thành công (0 error).
- Host đã chạy runtime thành công tại `http://localhost:5000`.
- Public endpoints hoạt động:
  - `/megaform/form/1` -> 200
  - `/megaform/form/1/script` -> 200 (trả về JS embed snippet, tự động load renderer từ `document.currentScript.src`)
  - `/megaform/form/1/embed` -> 200 (iframe embed page)
  - `/umbraco/MegaForm/MegaFormApi/schema?formId=1` -> 200
  - `/umbraco/MegaForm/MegaFormApi/Submit` -> 200 (CORS cross-origin OK)
- Warmup prewarm cả 3 path trên thành công.
- CORS global policy `MegaForm` đang hoạt động cho public script/embed.
- **Kiểm thử cross-origin script embed thành công:** trang `http://localhost:8080/umbraco-embed-test.html` load script từ `http://localhost:5000/megaform/form/1/script`, render form "Contact Us", submit thành công (Reference #14).

## 4. Vấn đề đã biết

1. **Dashboard/Builder/Submissions/Languages trong backoffice cần runtime test qua browser.** Host page giờ trả 200 và bundle tải thành công; cần mở Bellissima section để xác nhận shared TS UI render và API calls (với bearer token) trả dữ liệu đúng.

2. **Workflow builder + AI KB cần runtime test.** Các endpoint mới đã build OK và host chạy, nhưng chưa kiểm thử workflow builder UI / AI KB CRUD qua browser.

3. **Typed submission storage cần platform implementation.** Core abstractions đã xong; cần viết migrations/repositories cho Oqtane, Umbraco, DNN, Web để thực sự tạo bảng và ghi đọc typed rows. Kiến trúc mục tiêu xem `Docs/HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`.

2. **Embed preview page (`Assets/embed-preview.html`) vẫn dùng path DNN.** Bản `Assets/embed-preview.html` là shared/DNN; bản Umbraco `MegaForm.Umbraco/wwwroot/embed-preview.html` đã được cập nhật. Nếu build script sync lại từ `Assets`, cần giữ bản Umbraco hoặc tách thành `embed-preview-umbraco.html`.

2. **NuGet global cache bị hỏng.**
   - Lệnh `dotnet nuget locals all --clear` từng bị gián đoạn, để lại global cache trong trạng thái xấu.
   - **Workaround:** dùng repo-local cache folder `local-packages-umbraco/` và set biến môi trường:
     ```bash
     export NUGET_PACKAGES="/e/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/local-packages-umbraco"
     ```
   - Mọi lệnh restore/build/run cho `MegaForm.Umbraco.Host` nên chạy với biến này cho đến khi global cache được sửa.

3. **Swagger chưa được cấu hình cho Umbraco Host.**
   - Chưa có `AddSwaggerGen` / `UseSwagger` / `UseSwaggerUI` trong `MegaForm.Umbraco.Host`.
   - Có thể cần loại trừ Umbraco backoffice routes khỏi Swagger document filter.

4. **Warning obsolete chưa refactor.**
   - Một số API của Umbraco 14 (hoặc dependency packages) đang bị đánh dấu obsolete.
   - Hiện tại chỉ là warning, không ảnh hưởng build; nên refactor dần trong phiên sau khi runtime ổn định.

## 5. Build & Run (Workaround hiện tại)

```bash
cd "/e/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um"
export NUGET_PACKAGES="/e/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/local-packages-umbraco"

# Build/pack (chỉ cần khi có thay đổi code)
dotnet build MegaForm.Umbraco/MegaForm.Umbraco.csproj -c Release
rm -rf local-packages-umbraco/* local-nuget-umbraco/*
mkdir -p local-packages-umbraco local-nuget-umbraco
dotnet pack MegaForm.Core/MegaForm.Core.csproj -c Release -o local-nuget-umbraco
dotnet pack MegaForm.Sdk/MegaForm.Sdk.csproj -c Release -o local-nuget-umbraco
dotnet pack MegaForm.Umbraco/MegaForm.Umbraco.csproj -c Release -o local-nuget-umbraco

# Restore & build host
rm -rf MegaForm.Umbraco.Host/bin MegaForm.Umbraco.Host/obj
dotnet restore MegaForm.Umbraco.Host/MegaForm.Umbraco.Host.csproj --force-evaluate
dotnet build MegaForm.Umbraco.Host/MegaForm.Umbraco.Host.csproj -c Release --no-restore

# Run
dotnet run --project MegaForm.Umbraco.Host/MegaForm.Umbraco.Host.csproj -c Release --no-build --urls "http://localhost:5000"
```

> Ghi chú: Nếu chạy Umbraco Host lần đầu, cần cấu hình connection string / unattended install hoặc chạy qua setup UI tại `/install`.

## 6. Gợi ý phiên sau

### Ưu tiên cao

- ~~Kiểm thử public render & submit~~ ✅ Đã xong qua script embed cross-origin.
- ~~Kiểm thử embed hoàn chỉnh~~ ✅ Script embed + CORS + submit đã hoạt động; iframe embed hoạt động qua `/megaform/form/{id}/embed`.
- ~~Cập nhật embed preview page cho Umbraco~~ ✅ `wwwroot/embed-preview.html` đã dùng path Umbraco và live preview render thành công.
- **Kiểm thử backoffice API mới:** Content App endpoints, AI Assistant, Workflow, Reports, Upload/SDK.
- **Kiểm thử workflow builder UI:** tạo workflow library template và gán vào form.
- **Cập nhật embed preview page cho Umbraco:** sửa `wwwroot/embed-preview.html` (và/hoặc `Assets/embed-preview.html`) để dùng path Umbraco thay vì DNN.

### Ưu tiên trung bình

- **SurfaceController:** tạo Umbraco `SurfaceController` cho form submission nếu cần postback model thay vì API.
- **Members integration:** map Umbraco Members vào MegaForm user context / workflow.
- **Custom tree:** thêm custom tree section trong Umbraco backoffice (nếu Content App chưa đủ).
- **Razor widget:** tích hợp MegaForm Razor widget vào Umbraco view/component.

### Ưu tiên thấp

- Refactor obsolete warnings.
- Nâng cấp Umbraco lên phiên bản mới hơn (nếu cần).
- Sửa NuGet global cache hoặc chuyển hoàn toàn sang local-packages workflow.
