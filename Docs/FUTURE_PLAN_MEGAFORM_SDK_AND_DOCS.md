# FUTURE PLAN — MegaForm Developer SDK + Official Docs

**Tạo:** 2026-06-13
**Trạng thái:** 🟡 INCREMENT 1+2 ĐÃ LÀM (2026-06-13, SDK read-only facade) — phần còn lại là kế hoạch.
**Bổ sung 2026-06-16:** mục **E** (SDK write-API Phase 1–4: SubmitAsync/UpdateForm/typed FormSchema/IFormRenderer — nền `SubmissionProcessor`+`FormValidationService`+`FormSchema` đã có) + **F** (Blazor schema-driven form trên Oqtane — CÓ khả thi, hybrid trước) + **F-resilience** (chống vỡ validation/regex/mask qua các phiên AI — kitchen-sink QA suite là defense chính). Xem cuối file + 2 doc `RESEARCH_*_2026-06-16.md`.

> ✅ **ĐÃ TRIỂN KHAI (2026-06-13):** Project **`MegaForm.Sdk`** (net8/9/10) với `IMegaFormClient` + `IFormApi`/`ISubmissionApi` + DTO (FormDto/CreateFormRequest/FormQuery/SubmissionDto/SubmissionQuery/PagedResult/MegaFormScope), map sang Core repos (CreateForm/GetForm/ListForms/DeleteForm/FindData/Get). **PublicApiAnalyzers** gắn + `PublicAPI.*.txt` baseline + **RS0016/RS0017 = ERROR** (build fail khi đổi public API mà chưa khai). **Cross-module:** `AddMegaFormSdk()` đăng ký trong Oqtane `MegaFormServerStartup` + `MegaFormSdk.Initialize(app.ApplicationServices)` cho ambient accessor (DNN Razor/DDR dùng `MegaFormSdk.RunAsync(...)`). Build 0 error, Oqtane khởi động OK (DI không vỡ), QA form/dashboard/submissions không vỡ.
> ✅ **INCREMENT 2 (2026-06-13):** **Contract tests** `MegaForm.Sdk.Tests` (6 xUnit tests, in-memory repos, 6/6 PASS — locks behaviour). **PackageValidation** bật (`EnablePackageValidation`, validates API consistency across TFMs). **CI** `.github/workflows/sdk-ci.yml` (build→test→pack, ready for git). **DocFX scaffold** `Docs/site/` (docfx.json + index + getting-started + sdk articles). **net472 target ADDED** — SDK giờ `net472;net8;net9;net10` → **DNN-ready**, packs clean across all 4 TFMs.
> **CÒN LẠI (defer — blast-radius lớn, cần giám sát):**
> - **Internalize Core types + InternalsVisibleTo (Lớp 1):** Core types đang `public` và được tham chiếu trực tiếp bởi Oqtane.Server, Web, DNN, Umbraco, Sdk. Đổi sang `internal` sẽ **phá build nhiều project** → cần phân tích per-type + cập nhật mọi consumer. KHÔNG làm tự động (rủi ro vỡ hệ thống đang chạy).
> - **Async-hóa Core (B5):** repo Core đang đồng bộ; SDK facade đã async (wrap Task.FromResult) + `FindAsync` đã dùng paging+TotalCount THẬT của repo. Async-hóa Core thật chạm mọi repo+impl+caller (DNN/Oqtane/Web) → defer, cần giám sát. `ListFormsAsync` TotalCount tạm = items.Count (repo ListForms chưa trả total) — cần thêm overload đếm.
> - Mở rộng nghiệp vụ (B8): Workflow/Files/Documents/Export/Webhooks; DocFX→GitHub Pages deploy + custom domain (A); first publish rồi set `PackageValidationBaselineVersion`.
**Bối cảnh khởi nguồn:** sau khi chuyển `MegaForm.Web` thành gói NuGet (xem `HANDOFF_WEB_NUGET_ACCEPTANCE_2026-06-13.md`), phát sinh 3 nhu cầu: (A) trang Docs chính thức, (B) expose MegaForm như một **thư viện API lập trình** (SDK), (C) giữ SDK **không vỡ** khi code nội bộ thay đổi liên tục.

> ⚠️ Hiện trạng (2026-06-13): CHƯA có test project thật, CHƯA có CI (`.github/workflows` trống), CHƯA theo dõi public API, và types trong `MegaForm.Core` đang để `public` (nội tạng đã rò rỉ). Mọi hạng mục dưới đây là làm-từ-đầu.

---

## A. TRANG DOCS CHÍNH THỨC

**Quyết định:** docs-as-code — viết Markdown trong repo → build site tĩnh → host **GitHub Pages** (miễn phí) + custom domain (`docs.<tenmien>`). KHÔNG dựng server riêng.

**Công cụ khuyên dùng:** **DocFX** (vì có API NuGet công khai → tự sinh API reference C# từ XML comments + bài viết hướng dẫn). Phương án nhẹ hơn nếu chỉ cần user-guide: MkDocs Material (không auto API C#).

**Docs khi xuất bản NuGet — 3 tầng:**
1. `README.md` nhúng vào `.nupkg` (`<PackageReadmeFile>`) → hiện trên nuget.org (thứ dev thấy đầu tiên; đã có sẵn `MegaForm.AspNetCore.Component/README.md`).
2. XML doc (`<GenerateDocumentationFile>true`) → IntelliSense + nguồn cho DocFX.
3. Docs site đầy đủ (`docs.<tenmien>`) — nuget.org + GitHub đều trỏ về (`<PackageProjectUrl>`, `<RepositoryUrl>`).

**Cấu trúc gợi ý:** Getting Started · Cài qua NuGet (`AddMegaForm`) · Oqtane · DNN · Standalone · Form Builder · Workflow · AI · **API Reference (auto)**.

**Việc cần làm:** tạo `/docs` + `docfx.json` + GitHub Action build→Pages + gắn domain; mỗi `.csproj` NuGet bật `GenerateDocumentationFile` + `PackageReadmeFile` + `PackageProjectUrl`.

---

## B. SDK — EXPOSE MEGAFORM NHƯ THƯ VIỆN API

**Mục tiêu:** dev gọi `CreateForm / GetFormList / FindData / Submit ...` mà KHÔNG cần biết repo, DbContext, EF, portalId/moduleId.

### Đã có (nền tảng — chỉ cần "bọc" lại, KHÔNG viết lại logic)
- **Repository (Core):** `IFormRepository` (`GetForm/ListForms/SaveForm/DeleteForm/DuplicateForm/GetFormStats`), `ISubmissionRepository` (`Insert/Get/GetValues/UpdateStatus/Delete/BulkDelete`), `IDraftRepository`, `IFileRepository`, `IDocumentRepository`, `IPhase2Repository`.
- **Service (Core):** `SubmissionProcessor`, `FormValidationService`, `PermissionService`, `SubmissionQueryService`, `AppDefinitionService`...

### THIẾU gì (gap analysis)
1. **Facade thống nhất `IMegaFormClient`** — 1 cổng vào duy nhất (hiện phải inject 5-6 repo + tự truyền context).
2. **DTO công khai** tách khỏi model nội bộ (`FormInfo`/`SubmissionInfo` đang gắn EF, dễ đổi) → DTO = hợp đồng cam kết.
3. **Trừu tượng hóa context (tenancy/auth)** — `IMegaFormContext`/`MegaFormScope` tự resolve portal/user + enforce `PermissionService` bên trong.
4. **Async-first + `CancellationToken`** (nhiều API đang đồng bộ).
5. **Query/paging chuẩn cho FindData** — `SubmissionQuery { FormId, Filters[], DateFrom/To, Sort, Page, PageSize }` → `PagedResult<T>`; nối vào bảng index `MF_SubmissionValues` (audit nói hiện CHƯA dùng để query).
6. **Đóng gói** project `MegaForm.Sdk` thuần C# (không phụ thuộc ASP.NET/Blazor) → dùng được console/worker/test.
7. **Lỗi nhất quán** — `MegaFormNotFoundException`/`MegaFormValidationException` hoặc `Result<T>` (thay vì null/int id/EF throw).
8. **Mở rộng nghiệp vụ** (tùy chọn): Workflow (start/approve/reject), Files, Documents, Apps/Views, Export, Webhooks/events (`OnSubmissionCreated`).
9. **Docs + ví dụ + integration test** làm spec sống.

### Hình hài facade (phác thảo)
```csharp
public interface IMegaFormClient {
    IFormApi Forms { get; }
    ISubmissionApi Submissions { get; }
    IDataApi Data { get; }
}
public interface IFormApi {
    Task<FormDto>        CreateFormAsync(CreateFormRequest req, CancellationToken ct = default);
    Task<FormDto>        GetFormAsync(int formId, CancellationToken ct = default);
    Task<Paged<FormDto>> ListFormsAsync(FormQuery query, CancellationToken ct = default);
    Task<FormDto>        UpdateFormAsync(int formId, UpdateFormRequest req, CancellationToken ct = default);
    Task                 DeleteFormAsync(int formId, CancellationToken ct = default);
}
public interface ISubmissionApi {
    Task<SubmissionDto>        SubmitAsync(int formId, IDictionary<string,object> values, CancellationToken ct = default);
    Task<Paged<SubmissionDto>> FindAsync(SubmissionQuery query, CancellationToken ct = default);   // FindData
    Task<SubmissionDto>        GetAsync(int submissionId, CancellationToken ct = default);
}
```

### Kiến trúc
```
MegaForm.Sdk  (MỚI: IMegaFormClient + DTOs)   ← dev tham chiếu cái này (public contract)
      │  (lớp mỏng: map DTO ⇄ Core, enforce permission/tenant)
      ▼
MegaForm.Core (repos + services hiện có)        ← chuyển dần sang internal
```

---

## C. GIỮ SDK KHÔNG VỠ KHI SỬA CODE LIÊN TỤC — 5 LỚP PHÒNG THỦ TỰ ĐỘNG

> Triết lý: vấn đề KHÔNG phải "sửa code", mà "sửa code làm vỡ hợp đồng mà không ai phát hiện". → dựng cổng kiểm soát TỰ ĐỘNG (CI), không lệ thuộc trí nhớ. Đặc biệt cần vì nhiều "tay" (Kimi + Claude) sửa song song.

**Lớp 1 — Tách bạch cấu trúc (tiên quyết):** DTO riêng; facade là cửa công khai DUY NHẤT; chuyển Core types sang `internal` + `[assembly: InternalsVisibleTo("MegaForm.Sdk")]` (hiện đang public hết → nội bộ không thể vô tình lọt ra).

**Lớp 2 — Roslyn Public API Analyzer (chặn lúc BUILD) ⭐:** gói `Microsoft.CodeAnalysis.PublicApiAnalyzers` + `PublicAPI.Shipped.txt`/`PublicAPI.Unshipped.txt`. Mọi thay đổi public chưa-ghi-vào-file → **build FAIL (RS0016)**. Đây là khóa chống lệ thuộc trí nhớ — làm SỚM NHẤT vì rẻ & hiệu quả nhất.

**Lớp 3 — Contract / Approval test (chặn vỡ HÀNH VI):**
- Approval: `PublicApiGenerator` + `Verify` chụp snapshot public API → đổi ngoài ý muốn = test fail kèm diff.
- Contract: xUnit gọi `IMegaFormClient` qua in-memory SQLite theo kịch bản thật (CreateForm → ListForms → Submit → FindData).

**Lớp 4 — Package Validation (chặn vỡ NHỊ PHÂN giữa version):** `.csproj` đặt `<EnablePackageValidation>true</EnablePackageValidation>` + `<PackageValidationBaselineVersion>`. `dotnet pack` so với gói đã phát hành → breaking → fail.

**Lớp 5 — Chính sách + CI gate:** SemVer nghiêm (breaking → major); không xóa thẳng → `[Obsolete(... )]` ≥1 minor; `.github/workflows/ci.yml` chạy build+test+pack trên MỌI PR, đỏ thì không merge.

**Cơ chế tổng:**
```
Sửa Core nội bộ      → tự do (Lớp 1)
Lỡ đổi public API    → build FAIL tại máy (Lớp 2)
Lỡ đổi hành vi SDK   → CI test FAIL (Lớp 3)
Lỡ phá tương thích   → pack FAIL (Lớp 4)
Đổi thật sự          → ghi Shipped.txt + bump major + [Obsolete] (Lớp 5)
```

---

## D. CROSS-MODULE / EMBEDDED REUSE — module khác (DNN/Oqtane/Razor host) gọi MegaForm

**Tin tốt: nền tảng đã có ~80%.** MegaForm đã trừu tượng hóa host qua **`IPlatformContext`** (`ICoreInterfaces.cs:194` — `PortalId/ModuleId/UserId/UserName/IsAdmin/HasPermission/MapPath/GetSetting/GetConnectionString`), và mỗi host tự đăng ký impl + repos vào DI dùng chung:
- Web → `WebPlatformContext` (`MegaFormAspNetCoreExtensions.cs`)
- **Oqtane → `MegaFormServerStartup : IServerStartup`** (`MegaForm.Oqtane.Server/Services/Startup.cs`) đăng ký `EfFormRepository`, `OqtanePermissionPrincipalCatalogProvider`, ...
- DNN → registration tương ứng; **Umbraco → `MegaForm.Umbraco/Composers/MegaFormComposer.cs`** (đã đa-CMS).

→ `IMegaFormClient` (SDK, mục B) là lớp mỏng đặt LÊN TRÊN, chỉ phụ thuộc Core interfaces → module khác **resolve từ chính DI của host**.

**Cách dùng theo host:**
- **Oqtane** (1 DI container server dùng chung): module B reference `MegaForm.Sdk` + `MegaForm.Core` → constructor-inject `IMegaFormClient` trong controller/service. Client Blazor WASM → gọi qua HTTP API (controllers). Rủi ro: **version skew DLL** → reference dạng provided (`CopyLocal=false`).
- **DNN module hiện đại (9.4+)**: có DI (`IDnnStartup`) → inject như Oqtane.
- **DNN Razor Host / DDR / .cshtml / .ascx** (KHÔNG có constructor-DI) → cần **static ambient accessor**:
  ```cshtml
  @using MegaForm.Sdk
  @{ var forms = await MegaForm.Client.Forms.ListFormsAsync(new FormQuery{ ... }); }
  ```
  `MegaForm.Client` backed bởi host `IServiceProvider` + `PortalSettings`. (Khớp BYOM/DDR engine đã port.)

**Cần BỔ SUNG (ngoài SDK ở B):**
1. `MegaForm.Sdk` host-agnostic (= B).
2. **Đăng ký `IMegaFormClient` ở MỖI host** (1 dòng/nơi): Oqtane Startup, DNN `IDnnStartup`, Web `AddMegaForm`, Umbraco composer.
3. **Static ambient accessor** `MegaForm.Client` / `IMegaFormClientAccessor` cho môi trường không-DI (DNN Razor host, DDR, .ascx) — backed bởi host `IServiceProvider`.
4. **Context tường minh** `MegaFormScope { PortalId, UserId }` (overload) — vì module gọi có thể chạy NGOÀI HttpContext/module của MegaForm (background job, scheduler) → KHÔNG phụ thuộc 100% `IPlatformContext` ambient.
5. **Quản trị version/assembly**: ship Sdk+Core đúng bản host đã load; consumer reference provided để tránh load trùng DLL. Cân nhắc: chỉ `MegaForm.Sdk` (contract, ổn định) là thứ module khác reference; `MegaForm.Core` để provided.

---

## THỨ TỰ THỰC HIỆN ĐỀ XUẤT (khi bắt tay làm)

1. **`MegaForm.Sdk`** + DTO + facade, map 3 hàm mẫu `CreateForm/ListForms/FindData` (B + Lớp 1).
2. Gắn **`PublicApiAnalyzers`** + `PublicAPI.txt` vào `MegaForm.Sdk` (Lớp 2) — *làm ngay được, rẻ*.
3. **`MegaForm.Sdk.Tests`**: 3-5 contract test + 1 approval test (Lớp 3).
4. Chuyển dần Core types → `internal` + `InternalsVisibleTo` (Lớp 1, làm từng phần).
5. Async-hóa + query/paging cho FindData (gap B5).
6. **`EnablePackageValidation`** khi bắt đầu phát hành NuGet (Lớp 4).
7. **`ci.yml`** build+test+pack (Lớp 5).
8. **Cross-module (D):** đăng ký `IMegaFormClient` ở mỗi host + static `MegaForm.Client` accessor + `MegaFormScope` overload + chuẩn reference provided.
9. **Docs site** DocFX + GitHub Pages (A) — có thể song song bất cứ lúc nào.
10. Ghi vào `CONTRIBUTING.md`/`CLAUDE.md`: *"`MegaForm.Sdk` là public contract — đổi phải qua Shipped.txt + bump version"* để Kimi/Claude tuân thủ.

---

## Tham chiếu
- NuGet conversion: `Docs/HANDOFF_WEB_NUGET_ACCEPTANCE_2026-06-13.md`, `Docs/WEB_NUGET_CONVERSION_PROGRESS_2026-06-13.md`
- Feature parity: `Docs/WEB_OQTANE_FEATURE_PARITY_AUDIT_2026-06-13.md`
- API surface hiện có: `MegaForm.Core/Interfaces/ICoreInterfaces.cs`, `MegaForm.Core/Services/`
- Public API entry hiện tại (web): `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` (`AddMegaForm`)

---

# ═══ BỔ SUNG 2026-06-16 — RUNTIME SDK + SCHEMA-DRIVEN RENDERER + BLAZOR FORMS ═══

> Nguồn nghiên cứu: `Docs/RESEARCH_SDK_API_GAP_AND_FORM_BUILDER_BEST_PRACTICES_2026-06-16.md` + `Docs/RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md`.
> Bối cảnh: SDK hiện tại (B/C/D ở trên) là **READ-ONLY facade** (list/get form+submission, export). Đủ cho dashboard/CSV (2 Razor demo chạy được) nhưng CHƯA đủ để (a) nhận submission bền vững, (b) third-party tự render form từ schema, (c) viết form bằng Blazor trên Oqtane.

## E. SDK gap → "full form runtime facade" (Phase 1–4)

**Gap chính:** `ISubmissionApi` chỉ có `FindAsync/GetAsync` (read). `IFormApi` thiếu `UpdateFormAsync`. `SubmissionDto.DataJson`/`FormDto.SchemaJson` là raw JSON string → mỗi consumer tự parse. Không có renderer abstraction, không expose validation/showIf/options typed.

| Phase | Nội dung | Trạng thái nền tảng (đã có gì) |
|---|---|---|
| **1 — Core write API** | `ISubmissionApi.SubmitAsync` (trả **ValidationResult**, không chỉ DTO/exception) + `UpdateAsync` + `DeleteAsync`; `IFormApi.UpdateFormAsync`; server-validate từ schema; unit test submit+fail | ✅ **NỀN SẴN + 📄 PLAN CHI TIẾT SẴN-SÀNG-IMPLEMENT: `Docs/PLAN_20260616_SDK_PHASE1_WRITE_API.md`** (signatures + 40 dòng PublicAPI.Unshipped + 8 bước impl + 13 test + risks + 4 open-Q). Thiết kế: SubmitAsync HYBRID (processor full-pipeline nếu có / fallback validate+insert nếu null) — wrap `SubmissionProcessor.ProcessAsync`+`FormValidationService.Validate` (gồm composite per-part). |
| **2 — Schema model typed** | `FormSchema.Parse(json)` + `FormField{Type,Options,Validation,ShowIf,Default,PageIndex}` typed + `MegaFormData.Get<T>/Set` wrapper (bỏ parse JSON tay) | ✅ **NỀN SẴN:** `MegaForm.Core.Models.FormSchema/FormField/FieldValidation/ShowIfCondition` đã typed (Newtonsoft). Phase 2 = expose qua SDK public (giữ PublicAPI baseline) + helper Parse |
| **3 — Rendering contract** | `IFormRenderer`/`IFormFieldRenderer` + DNN Razor helper + Blazor/Oqtane component render form từ schema (opt-in, không phá template tay) | ❌ chưa có |
| **4 — Advanced** | File upload trong SubmitAsync, prefill (query/route/profile), webhook/post-submit, embed `<script data-form-id>` cho external site | ⚠️ một phần (webhook Core có; embed/prefill chưa) |

## F. Blazor schema-driven form trên Oqtane (trả lời câu hỏi: "viết form Blazor vẫn chạy với form TS?")

**→ CÓ, khả thi về kiến trúc.** Schema là **nội dung chung**; submission API + server-validation là **shared**. Blazor và TS renderer cùng đọc 1 `SchemaJson` + cùng POST 1 payload shape → server KHÔNG phân biệt ai render. (Đúng mô hình Form.io/SurveyJS/Typeform: schema=content, renderer thay được, submit API chung.)

**2 chiến lược:**
- **A. Pure Blazor renderer** — component Blazor map từng field type → Razor markup. ✅ không cần JS, SSR-friendly, dễ style theo Oqtane. ❌ **2 renderer phải maintain** → risk drift hành vi (showIf, validation edge case).
- **B. Hybrid** — Blazor shell (layout/submit) + nhúng TS renderer qua JS interop; lấy payload submit qua SDK. ✅ **1 renderer, feature-parity 100%**, custom widget chạy ngay. ❌ interop phức tạp, khó debug, SSR/style ràng buộc.
- **Khuyến nghị:** **B (hybrid)** làm default (mọi form cũ chạy ngay trên Oqtane) → **A (pure Blazor)** cho subset field đơn giản (Text/Email/Select/Radio/Checkbox/Date/File/Section), scenario nhẹ/no-JS.

**Tiên quyết (trùng E):** `FormSchema.Parse` (Phase 2) · `SubmitAsync` trả `ValidationResult` (Phase 1) · `IFileApi.UploadAsync` (Phase 4) · **shared rule evaluator** (showIf/validation 1 engine .NET dùng chung để TS+Blazor KHÔNG xử lý khác) — chính là mắt xích chống drift, nối thẳng mục F-resilience bên dưới.

**Giao với việc đã làm 2026-06-16:** Composite Registry (1 nguồn preset) + server composite-validation là bước đầu của "single-source schema + shared validation" — mở rộng pattern này là điều kiện cho cả E lẫn F-Blazor.

## F-resilience. GIỮ VALIDATION / REGEX / MASK KHÔNG VỠ QUA CÁC PHIÊN AI (Kimi + Claude)

> Câu hỏi user (2026-06-16). **Bài học sống:** bug `bindMasks()` — hàm CÓ, import CÓ, nhưng **CALL bị mất** ở April-revert → mask/regex "chết" mà KHÔNG test nào bắt; comment "must run before bindComposites" không cứu được. ⇒ phải có **cổng TỰ ĐỘNG**, không lệ thuộc trí nhớ/comment. (Triết lý y hệt mục C cho SDK, nhưng cho HÀNH VI RUNTIME render+validate+mask.)

| Lớp | Biện pháp | Trạng thái |
|---|---|---|
| **1 — Single source (diệt drift)** | Composite preset/parts: ✅ DONE (helpers COMPOSITE_PRESETS + META). TS↔C# validation rules: HIỆN hand-mirror (`CompositePresetRegistry.cs`) = risk → **codegen C# từ TS** (build đọc COMPOSITE_PRESETS → emit `composite-rules.json` embed C#) HOẶC 1 sync-test fail khi lệch. Mask: 1 engine `mask.ts` ✅ | một phần |
| **2 — Behavioral regression suite ⭐ (mạnh nhất)** | 1 "kitchen-sink" form chuẩn (JSON fixture) chứa MỌI field type + MỌI composite preset + MỌI rule (required/mask SSN/regex/matchKey/dateAge/min-max/showIf). 1 headless runner (chính thức hoá `tmp-qa/scn-*.cjs`) chạy RUNTIME + assert: mask format khi gõ, composite đa-hàng+separator, client reject input xấu, **server reject** (kiểu `test-server-validate.ps1`), valid submit PASS. → Bug bindMasks ĐÃ bị bắt nếu suite này có. Chạy SAU mỗi phiên + TRƯỚC deploy + (lý tưởng) CI: `npm run qa:forms` | ❌ cần dựng |
| **3 — Invariant/contract test** | Unit-test assert `bindInteractiveElements` CÓ gọi `bindMasks`. Sync-test: preset keys + rule set TS == C#. Approval snapshot composite registry | ❌ |
| **4 — Deploy verification (bắt stale deploy)** | Sau copy → fetch bundle ĐÃ SERVE + assert marker (mask wiring, `mf-composite-sep`, server `case "Composite"`). Đang làm THỦ CÔNG mỗi phiên — chính thức hoá thành script | một phần (manual) |
| **5 — Docs + checklist mọi phiên AI** | Ghi CLAUDE.md + `VALIDATION_INVARIANTS.md`: invariant tới hạn (bindMasks PHẢI gọi; registry single-source; CHẠY qa:forms trước khi claim DONE; verify served-asset KHÔNG chỉ source — đừng overclaim). Để Kimi+Claude tuân thủ | ❌ |

**Ưu tiên:** Lớp 2 (suite) > Lớp 1 codegen > Lớp 5 docs > Lớp 3 > Lớp 4. **Lớp 2 là defense mạnh nhất cho workflow nhiều-tay-AI** — nó bắt đúng loại lỗi (lost-wiring) mà unit-test + comment bỏ sót.

## Thứ tự đề xuất (tiếp theo)
1. **F-Lớp2 kitchen-sink QA suite** (`npm run qa:forms`) — rẻ, chặn ngay loại bug vừa gặp. Làm SỚM.
2. **Phase 1 SDK SubmitAsync** (bọc SubmissionProcessor+FormValidationService) + DTO — mở khoá data-entry + Blazor.
3. **Phase 2 FormSchema.Parse expose** (model đã có) + MegaFormData.
4. **F-Lớp1 codegen TS→C# rules** (diệt drift composite/validation).
5. **Phase 3 IFormRenderer** → POC Blazor form (chiến lược B hybrid trước).
6. **F-Lớp5 VALIDATION_INVARIANTS.md + CLAUDE.md checklist** (song song bất cứ lúc nào).
7. Phase 4 (file upload submit, prefill, embed) + A (pure Blazor subset).
