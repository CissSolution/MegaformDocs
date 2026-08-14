# PHẢN BIỆN — `AUDIT_PLAN_20260814_DYNAMIC_CONTENT_TEMPLATE_FORM.md`

**Ngày:** 2026-08-14 · **Phạm vi:** đọc lại tài liệu kế hoạch + đo lại source. **Không sửa code.**
**Đối tượng kiểm:** chính bản kế hoạch, không phải bảng so sánh của owner.

---

## 0. Kết luận một câu

Luận điểm trung tâm của kế hoạch **đúng** (tầng form đã JSON-driven, đừng làm lại nó), nhưng
**4 trong 6 khẳng định dạng "chưa có / không có gì" là sai** — thứ được nói là thiếu thì đã tồn tại và
đã nối ở 4 host — trong khi **lỗi im lặng có thật ở đúng vùng tài liệu đang bàn thì không được tìm ra**,
và Giai đoạn 1 như đang viết **sẽ không bắt được lỗi đó**.

---

## 1. Cách kiểm (để người sau tái lập)

Mọi con số dưới đây đo bằng: `wc -l` trên đường dẫn ghi rõ · `git grep -n` (có `git ls-files` để phân
biệt file **được track** với file build) · đọc trực tiếp file để xác định *ai gọi* chứ không dừng ở
"grep có/không có". Với mỗi khẳng định "không tồn tại", đã kiểm thêm bằng đường ngược: tìm consumer,
tìm entry build, tìm `.csproj`/manifest.

> Đây cũng là **thiếu sót phương pháp thứ nhất** của bản kế hoạch: nó ghi số mà không ghi cách đo, nên
> hai mục không tái lập được (xem B3, B4).

---

## 2. Bảng tổng — 21 điểm

| # | Điểm trong kế hoạch | Phán quyết |
|---|---|---|
| A1 | "View dispatch nằm trong markup DNN, host khác không có đường này" | 🔴 **SAI** — `FormViewSelector` dùng chung, gọi ở cả 4 host |
| A2 | "View system 🔴 chưa thành hệ" | 🔴 **SAI** — bỏ sót ~18.000 dòng view subsystem |
| A3 | "Placeholder integrity: **không có gì cả**, không ai chặn" | 🔴 **SAI ở builder** (có sync 2 chiều), đúng ở server |
| A4 | "BFF / render-model theo role: đang thiếu" | 🔴 **SAI** — `RenderModelResolver` + `FormAccessProjection` đã chạy 4 host |
| A5 | Giai đoạn 5 đề xuất "SSR lo shell, client lo động" | 🔴 **ĐÃ LÀ THIẾT KẾ HIỆN TẠI**, ghi trong header renderer |
| B1 | "2.076 C# vs 4.621 TS ⇒ mọi thứ làm 2 lần" | 🟠 **so sai cặp**, và kết luận ×2 là sai |
| B2 | "9.800 dòng định nghĩa 7 app" | 🟠 **6 app**, ~1.629 dòng là engine không phải định nghĩa |
| B3 | "Typed storage: Core 29·Oqt 10·DNN 9·Web 6·Umb 3" | 🟠 **không tái lập được**; Umbraco = 1 file ⇒ "✅ 4 host" là over-claim |
| B4 | "SDK 5 file, 2.288 dòng" | 🟡 5 file, **2.348 dòng** |
| B5 | "comment hứa 6 loại, code chạy 3" | 🟠 thực tế **4 bộ từ vựng** khác nhau; bỏ sót `continuous` **đã có code** |
| C1 | Dẫn `FormViewOld.ascx` làm bằng chứng nhân đôi + đề xuất "gỡ nếu không dùng" | 🔴 **đã chết từ lâu**: `<Compile Remove>` + không manifest + package script loại |
| D1 | "`ManifestJson.Forms` rỗng ⇒ manifest không phải nguồn sự thật" | 🟠 **đọc sai cơ chế**: manifest **dựng lúc đọc** từ `AppScope`; rỗng là thiết kế |
| D2 | Pilot Giai đoạn 2 = Purchase Order "vì nhỏ nhất" | 🟠 **chọn sai** — đó là service bespoke; đường data-driven đã có sẵn ở chỗ khác |
| D3 | "chuyển sang JSON, giữ nguyên hành vi" | 🔴 **bỏ qua rào cản chặn**: `AppStarterDefinition` chứa 3 `Func<>` không serialize được |
| D4 | Rủi ro app-JSON = "SQL/URL resolve server-side" | 🟠 **nhẹ hơn thực tế** — manifest khai được **role + user + password + permission** |
| E1 | — | ⭐🔴 **LỖI THẬT chưa tìm ra**: grammar token `{{field:}}` lệch giữa soạn thảo và render |
| E2 | — | 🔴 **LỖI THẬT**: SSR in dòng lỗi kỹ thuật đỏ ra trang công khai |
| E3 | — | 🔴 **LỖI THẬT**: `megaform-views.js` là stub 85 byte ⇒ view `detail`/`continuous` **chết trên DNN** |
| E4 | — | 🟠 **LỖI THẬT**: 3 asset view là **build mồ côi** (không entry, không script, `emptyOutDir:false`) |
| E5 | — | 🟠 **LỖI THẬT**: builder **xoá field + xoá rule** tự động sau 220 ms — mọi "lưới an toàn" phải đứng trước nó |
| F | Phương pháp | 🟠 không tham chiếu 30 audit doc sẵn có; 4/6 kết luận "không có" sai; tài liệu **chưa `git add`** |

---

## 3. Nhóm A — nói là thiếu, thực ra đã có

### A1. Bộ resolve view dùng chung đã tồn tại và đã nối 4 host

Kế hoạch: *"View dispatch 🔴 nằm trong markup DNN … Oqtane / Web / Umbraco **không có** list/card view
theo cùng đường. Vi phạm luật 3-platform-twin"* và Giai đoạn 3 đề xuất *"Đưa dispatch `viewType` ra khỏi
`FormView.ascx`, thành một bộ resolve theo `ViewConfig` mà cả 4 host gọi được."*

Bộ đó đã có: [`MegaForm.Core/ViewModes/FormViewSelector.cs`](MegaForm.Core/ViewModes/FormViewSelector.cs)
(320 dòng) — `Resolve()`, `NormalizeViewType()`, `ValidateAndNormalizeForSave()`,
`SanitizeSelectedViewKey()`, `ReadViewCatalog()`, `AttachSelectionMetadata()`. Người gọi:

| Host | Điểm gọi |
|---|---|
| DNN | [`FormView.ascx.cs:988`](MegaForm.DNN/Views/FormView.ascx.cs#L988) · [`Phase2ApiController.cs:366`](MegaForm.DNN/WebApi/Phase2ApiController.cs#L366) · [`MegaFormApiController.cs:4088,4203,4205,5774`](MegaForm.DNN/WebApi/MegaFormApiController.cs#L4088) |
| Oqtane | [`MegaFormController.cs:3651,3881,3885,3966`](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L3651) · [`MegaFormPopupPhase2Controller.cs:87`](MegaForm.Oqtane.Server/Controllers/MegaFormPopupPhase2Controller.cs#L87) |
| Web | [`StarterController.cs:378,382`](MegaForm.Web/Controllers/StarterController.cs#L378) |
| Umbraco | [`StarterController.cs:372,376`](MegaForm.Umbraco/Controllers/StarterController.cs#L372) |

Thứ nằm trong `.ascx` **không phải dispatch** mà là *dựng DOM* cho nhánh legacy. Nói cách khác: seam
đã có, việc còn lại là kéo phần dựng DOM về, không phải "sinh ra đường mới".

### A2. Bỏ sót toàn bộ view subsystem phía TS

| Thư mục | Dòng | Nội dung |
|---|---|---|
| `MegaForm.UI/src/view-designer/` | **14.609** (40 file) | `list-designer` 385 · `card-designer` · `layout-designer` 332 · `gridrepeater/` 1.188 · `datarepeater/` 692 · `presets.ts` 979 · `settings-popup.ts` 2.505 · `shared.ts` 1.391 · `shared/unified-shell.ts` 1.356 |
| `MegaForm.UI/src/listview/` | **2.279** | `runtime.ts` 1.804 · `designer.ts` 303 |
| `MegaForm.UI/src/submission-views/` | **1.131** | `list.ts` · `card.ts` · `display.ts` · `shared.ts` 621 |

≈ **18.000 dòng**. Có thể tranh luận nó *chưa hoàn chỉnh*; không thể nói *"chưa thành hệ"* mà không
nhắc tới nó. (Nhưng xem E3/E4 — phần lớn khối này **hiện không được build tới**, và đó mới là vấn đề
thật, khác hẳn với "chưa xây".)

### A3. `{{field:key}}` có cơ chế giữ đồng bộ ở builder

Kế hoạch: *"Không tìm thấy validator/integrity check nào cho `{{field:key}}`. Đổi field key → template
hỏng, **không ai chặn**."*

[`MegaForm.UI/src/builder/html-sync.ts`](MegaForm.UI/src/builder/html-sync.ts) (412 dòng) làm sync **hai chiều**:

- [`:66-70`](MegaForm.UI/src/builder/html-sync.ts#L66) `replaceFieldTokensInHtml(html, oldKey, newKey)` — **đổi key thì đổi luôn token**
- [`:61-64`](MegaForm.UI/src/builder/html-sync.ts#L61) xoá field → xoá token
- [`:241-246`](MegaForm.UI/src/builder/html-sync.ts#L241) token mồ côi → **tạo stub field**
- [`:296+`](MegaForm.UI/src/builder/html-sync.ts#L296) `syncSchemaToHtmlImmediate` — field thiếu token → chèn token
- [`:379-386`](MegaForm.UI/src/builder/html-sync.ts#L379) chạy tự động, debounce 220 ms khi gõ trong HTML editor

Phần **đúng** của kế hoạch: không có validator ở **server** (`FormValidationService.cs` 524 dòng không
hề nhắc `customHtml`), và `{{content:*}}` **không** nằm trong sync (đã grep: 0 kết quả). Hai điều đó là
lỗ hổng thật — nhưng phải phát biểu đúng như vậy, không phải "không có gì cả".

### A4. Render-model hợp nhất + lọc field theo role đã chạy ở 4 host

Kế hoạch §4: *"BFF trả schema + template + permissions + visible fields — **đây là phần đáng giá nhất và
đúng là đang thiếu**"*; Giai đoạn 4: *"Ưu tiên lọc field phía server … Xong = payload của role thấp
**không chứa** field bị ẩn."*

Đã có, và đã có kèm chú thích thiết kế:

- [`MegaForm.Core/Rendering/RenderModelResolver.cs`](MegaForm.Core/Rendering/RenderModelResolver.cs) (443) + [`ResolvedRenderModel.cs`](MegaForm.Core/Rendering/ResolvedRenderModel.cs) — *"Canonical server-side render payload. Hosts should fetch raw form data, call RenderModelResolver, and pass this resolved model to the shared renderer without extra per-host merges."* Người gọi: DNN, Oqtane, Web, **và SDK** (`MegaForm.Sdk/MegaFormClient.cs`), có test `MegaForm.Sdk.Tests/RenderModelResolverCacheTests.cs`.
- [`FormAccessProjection.ProjectForActor`](MegaForm.Core/Services/FormAccessProjection.cs#L21) → `ServerSidePermissionEnforcementService.BuildFieldAccessPolicy` (726 dòng) → [`FormSchemaVisibilityFilter.Project`](MegaForm.Core/Services/FormSchemaVisibilityFilter.cs) (370) → [`FormSchemaSensitivePropertyStripper.Strip`](MegaForm.Core/Services/FormSchemaSensitivePropertyStripper.cs) (186).
  Nối ở **cả 4 host**: DNN [`MegaFormApiController.cs:1636,1656`](MegaForm.DNN/WebApi/MegaFormApiController.cs#L1636) + [`FormView.ascx.cs:1468,1474`](MegaForm.DNN/Views/FormView.ascx.cs#L1468) · Oqtane [`MegaFormController.cs:305,1811,1843`](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L1811) · Web [`MegaFormController.cs:688,710`](MegaForm.Web/Controllers/MegaFormController.cs#L688) · Umbraco [`MegaFormApiController.cs:637`](MegaForm.Umbraco/Controllers/MegaFormApiController.cs#L637).

⇒ **Tiêu chí "Xong = gì" của Giai đoạn 4 rất có thể đã đạt từ trước phiên này.** Việc đúng là **đo nó
trên site thật** (2 role, 2 payload) trước khi lên kế hoạch xây lại. Phần *thật sự* còn thiếu hẹp hơn
nhiều: `ResolvedRenderModel` chỉ mang `Schema/Settings/SubmitButtonText/PostSubmit/InitialInlineCss` —
**chưa** mang `permissions`, `view`, `data`. Đó mới là mô tả đúng của khoảng trống BFF.

### A5. "SSR lo shell, client lo phần động" không phải đề xuất — là hiện trạng

Header [`FormHtmlRenderer.cs:17-35`](MegaForm.Core/Services/FormHtmlRenderer.cs#L17) ghi rõ: SSR = markup
tĩnh cho SEO/first-paint, JS **hydrate** thay vì dựng lại, thân widget tương tác emit dưới dạng
placeholder. Giai đoạn 5 đề xuất đi "khảo sát" đúng thứ đã được viết thành hợp đồng trong file.

---

## 4. Nhóm B — số liệu và so sánh

### B1. So sai cặp renderer ⇒ kết luận "làm 2 lần" sai

`FormHtmlRenderer.cs` tự khai đối ứng của nó là **`megaform-renderer.ts`** (3.269 dòng), không phải
`renderer/index.ts` (4.621). Toàn bộ `MegaForm.UI/src/renderer/` = **12.715 dòng / 17 file**:

```
index.ts 4621 · megaform-renderer.ts 3269 · interactive.ts 1245 · inputs.ts 996
helpers.ts 674 · country-picker.ts 505 · validation.ts 356 · premium-step-reconcile.ts 236
rule-engine.ts 214 · composite-address.ts 133 · … 
```

Phần lớn (interactive, validation, country-picker, mask, file-upload…) **không có và không cần bản C#**.
Parity tax chỉ áp cho thứ **phải xuất hiện trong HTML lần đầu** (SEO/first-paint). Kế hoạch nói *"mỗi
khả năng động mới phải làm hai lần"* và đưa nó vào bảng rủi ro — nếu lập ngân sách theo đó sẽ **ước
lượng sai**, có thể gấp đôi công không cần thiết.

### B2. "9.800 dòng cho 7 app"

- Thực tế **6 app**: 5 service bespoke (`DocumentExchange` 1.535 · `Proposal` 1.450 · `LeaveRequest`
  1.283 · `Recruitment` 884 · `PurchaseOrder` 398) + **1** app configured.
- `ConfiguredAppStarterDefinitions.cs` **2.609 dòng chỉ chứa Blog** — [`Get()`](MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs#L22) chỉ nhận `blog`/`blogs`/`blog-publishing`, `default → null`.
- ~**1.629 dòng là engine/hạ tầng**, không phải định nghĩa app: `ConfiguredAppStarterService` 1.134 ·
  `StarterSeedAttachment` 270 · `StarterStatusService` 169 · `IStarterPlatformAdapter` 56.

Kết luận "app = hard-code, thêm app mới phải build lại DLL" **vẫn đúng**; nhưng con số dùng để gây ấn
tượng thì không đúng, và cách gộp làm mờ đi sự thật quan trọng ở D2.

### B3–B4. Số không kèm cách đo

Đếm file `.cs` có nhắc `TypedSubmission`: Core **26** · Oqtane **6** · DNN **3** · Web **4** · Umbraco
**1** — không khớp 29/10/9/6/3 của kế hoạch. Không biết kế hoạch đếm gì nên **không kết luận ai đúng**;
vấn đề là *không tái lập được*. Riêng Umbraco = 1 file thì đánh dấu "✅ có mặt ở 4 host" là **over-claim**
— cùng loại lỗi mà `MEMORY.md` đã ghi ở mục 08-14 LỖI B (Oqtane chỉ có catalog mà docs nói đã đủ).
SDK: 5 file, **2.348** dòng (không phải 2.288).

### B5. Không phải "6 vs 3" mà là **4 bộ từ vựng**

| Nguồn | Danh sách |
|---|---|
| [`Phase2Models.cs:56`](MegaForm.Core/Models/Phase2Models.cs#L56) | `edit, list, detail, card, kanban, calendar` |
| [`EntityModels.cs:88`](MegaForm.Core/Models/EntityModels.cs#L88) | `submit, list, card, detail, continuous` |
| [`core/types.ts:170`](MegaForm.UI/src/core/types.ts#L170) | `'submit'\|'list'\|'card'\|'detail'\|'continuous'` |
| [`FormViewSelector.cs:41-48`](MegaForm.Core/ViewModes/FormViewSelector.cs#L41) | alias/reserved: `form, list, card, listview`; `form/submit/edit → submit` |

`continuous` (Master-Detail) **có code chạy**: [`ViewSettings.ts:22,132,223`](MegaForm.UI/src/config/ViewSettings.ts#L22). Kế hoạch bỏ sót hoàn toàn.

---

## 5. Nhóm C — bằng chứng chết dùng như bằng chứng sống

`FormViewOld.ascx` được dẫn ở §1 (*"lặp lại ở `FormViewOld.ascx:115,142`"*) và Giai đoạn 3 đề xuất
*"gỡ khỏi đường sống **nếu xác nhận không còn dùng**"*. Đã xác nhận xong từ lâu:

- [`MegaForm.DNN.csproj:102,105,106`](MegaForm.DNN/MegaForm.DNN.csproj#L102) — `<Compile Remove>`, `<None Remove>`, `<Content Remove>`
- Không manifest `.dnn` nào đăng ký (grep = 0)
- [`BuildPackage-DNN.ps1:416`](MegaForm.DNN/BuildPackage-DNN.ps1#L416) — *"Views\\*Old.ascx … are registered by NO manifest"*, cố ý loại khỏi gói
- Đã ghi trong [`Docs/MegaForm_Technical_Audit_Report_2026-06-11.md:354-356`](Docs/MegaForm_Technical_Audit_Report_2026-06-11.md#L354)

**Bài học phương pháp:** grep ra text ≠ code chạy. Với file `.ascx`/`.cs` phải kiểm thêm `.csproj`,
manifest và package script trước khi tính vào "nợ kỹ thuật".

---

## 6. Nhóm D — đọc sai cơ chế app/manifest

### D1. `ManifestJson.Forms` rỗng là **thiết kế**, không phải hỏng

[`AppDefinitionService.BuildBundle(hydrateManifest)`](MegaForm.Core/Services/AppDefinitionService.cs#L102)
**dựng manifest lúc đọc** từ `GetFormsForScope(portalId, app.AppScope)`; `BuildManifest` merge phần đã
lưu (alias/role/isPrimary) lên trên danh sách form suy ra từ scope. `hydrateManifest` mặc định **true**.
Điều này đã được ghi thẳng trong code: [`BlogManifestHelper.cs:16`](MegaForm.Core/Services/Blog/BlogManifestHelper.cs#L16)
— *"`ManifestJson.Forms = []`: the forms are attached to the app through …"* — và có test
`MegaForm.Sdk.Tests/BlogAnalyticsRollupTests.cs`.

Lỗi 08-09 là **lỗi consumer**: đọc thẳng `ManifestJson` từ DB mà không hydrate → nhận rỗng → `return 0`
im lặng. Đó là chuyện đã được xử lý, không phải bằng chứng "model không được dùng".

⇒ Hệ quả cho Giai đoạn 2: *"Chốt `AppManifestDefinition` làm nguồn sự thật (thay vì `AppScope`)"* là
**đảo chiều dòng dữ liệu hiện tại** (manifest đang là *projection của* AppScope), kéo theo đổi
`GetFormsForScope` + migrate dữ liệu + rà 4 host. Đây là việc **lớn hơn nhiều** so với câu chữ trong kế
hoạch, phải nói ra trước khi ai đó nhận việc.

### D2. Chọn sai app pilot

Kế hoạch chọn **Purchase Order** vì "398 dòng, nhỏ nhất". Nhưng `PurchaseOrderStarterService` là service
**bespoke** — không dùng `AppStarterDefinition`. Trong khi đó đường data-driven **đã tồn tại**:
`AppStarterDefinition` (37 property) + `ConfiguredAppStarterService` (1.134 dòng) đã chạy nó cho Blog.

Chuyển Purchase Order = phải làm **hai** việc (dựng đường JSON *và* viết lại một app bespoke) và chứng
minh được **ít hơn**. Pilot rẻ nhất, rủi ro thấp nhất, chứng minh nhiều nhất: **JSON-hoá định nghĩa Blog
đang chạy sẵn trên engine đó** — engine không đổi, chỉ đổi nguồn nạp definition.

### D3. Rào cản chặn không được nêu: definition chứa delegate

[`AppStarterDefinition`](MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs#L1006) phần lớn là
dữ liệu, **trừ 3 chỗ**:

```csharp
public Func<FormSchema> SchemaFactory { get; set; }                       // :1032
public Func<int, WorkflowDefinition> WorkflowFactory { get; set; }        // :1033
// AppStarterChildSampleRecord
public Func<Dictionary<string,object>, StarterSeedUserProjection, IEnumerable<Dictionary<string,object>>> BuildRows;  // :1079
```

`Func<>` **không serialize được**. Muốn "app bằng JSON" phải thay 3 seam này bằng dữ liệu (schema JSON,
workflow JSON, sample rows JSON) **trước tiên**. Kế hoạch viết *"giữ nguyên hành vi"* mà không nhắc —
người nhận việc sẽ đâm vào tường ở đúng bước đầu.

### D4. Rủi ro an ninh của app-JSON bị nêu quá nhẹ

`AppStarterDefinition` khai được: `Roles: List<AppStarterRoleDefinition>` với **`RoleName` + `UserName` +
`Email` + `Password`** ([`:1090-1097`](MegaForm.Core/Services/Starters/ConfiguredAppStarterService.cs#L1090)),
và `Permissions: List<FormPermissionInfo>`. Một manifest do người dùng nạp mà tạo được **role, user, mật
khẩu và permission** là bề mặt **leo thang đặc quyền**, không chỉ là chuyện "SQL/URL phải resolve
server-side" như bảng rủi ro đang ghi. Phải là mục P0 riêng, với quyết định rõ: ai được nạp manifest,
và manifest **có được phép** khai role/permission/password hay không (khuyến nghị: không — dùng
capability rail như Automation v2: manifest cầm **tên** role, site cầm định nghĩa).

---

## 7. ⭐ Nhóm E — lỗi thật mà bản kế hoạch không tìm ra

### E1. ⭐ Grammar `{{field:key}}` lệch giữa tầng soạn thảo và tầng render

| Tầng | Regex | Cho phép `-` | Cho phép khoảng trắng |
|---|---|---|---|
| Builder sync | [`html-sync.ts:46`](MegaForm.UI/src/builder/html-sync.ts#L46) `/\{\{\s*field:([a-zA-Z0-9_-]+)\s*\}\}/` | ✅ | ✅ |
| Chèn/sắp token | [`custom-html-insert.ts:358,443,481,554`](MegaForm.UI/src/shared/custom-html-insert.ts#L358) `[a-zA-Z0-9_\-]+` | ✅ | ❌ |
| Inline edit | [`inline-edit.ts:2039`](MegaForm.UI/src/shared/inline-edit.ts#L2039) `[a-zA-Z0-9_\-]+` | ✅ | ❌ |
| **SSR C#** | [`FormHtmlRenderer.cs:328`](MegaForm.Core/Services/FormHtmlRenderer.cs#L328) `@"\{\{field:([a-zA-Z0-9_]+)\}\}"` | ❌ | ❌ |
| **Client TS** | [`renderer/index.ts:2181,2223`](MegaForm.UI/src/renderer/index.ts#L2223) `[a-zA-Z0-9_]+` | ❌ | ❌ |
| **Client TS (SSR twin)** | [`megaform-renderer.ts:1641,1688`](MegaForm.UI/src/renderer/megaform-renderer.ts#L1688) `[a-zA-Z0-9_]+` | ❌ | ❌ |

Và sanitizer key trong builder **giữ nguyên gạch nối**:
[`properties.ts:2035`](MegaForm.UI/src/builder/properties.ts#L2035) `.replace(/[^a-zA-Z0-9_-]/g,'_')`.

**Chuỗi lỗi:** người dùng đặt key `first-name` → hợp lệ → builder chèn/đổi tên/sync `{{field:first-name}}`
bình thường → **cả ba renderer đều không match** → token in **nguyên văn ra trang công khai**. Không có
cả dòng đỏ "Field not found", vì regex không match thì không vào nhánh báo lỗi.

**Và đây là điểm chí mạng cho Giai đoạn 1 như đang viết:** validator kiểu *"đối chiếu placeholder với
`Fields[].key`"* sẽ thấy `first-name` **có đủ ở cả hai bên** và báo **XANH** — trong khi trang vẫn hỏng.

**Trạng thái:** 🟡 **latent**. Đã quét `Samples/FormTemplates`: **0** template dùng key có gạch nối, **0**
token có khoảng trắng. Nhưng đường tới nó mở sẵn trong UI builder.

**Việc đúng cho Giai đoạn 1:** *trước* khi viết validator, **chốt một grammar token duy nhất** — một hằng
số regex, một hàm trích, dùng chung cho C# và TS — rồi validator mới có nghĩa.

### E2. SSR in dòng lỗi kỹ thuật màu đỏ ra trang công khai

[`FormHtmlRenderer.cs:331-332`](MegaForm.Core/Services/FormHtmlRenderer.cs#L331):

```csharp
if (!fieldMap.TryGetValue(key, out var field))
    return "<div style=\"color:#ef4444;font-size:12px;\">Field \"" + Esc(key) + "\" not found</div>";
```

Không có gate theo actor. Khách vãng lai thấy chi tiết cấu hình nội bộ + giao diện vỡ. Cần chính sách:
ẩn với anonymous (comment HTML hoặc bỏ trống), chỉ hiện với người có quyền `manage` — hạ tầng để làm
việc đó **đã có sẵn** (`FormAccessProjection` đã dùng đúng cổng `manage`).

*Ghi chú tích cực:* điều này cũng bác luôn tiền đề "đổi key → hỏng **im lặng**" của kế hoạch: ở đường
SSR nó hỏng **rất ồn**. Cái im lặng thật nằm ở E1.

### E3. 🔴 `megaform-views.js` là stub 85 byte ⇒ view `detail` / `continuous` chết trên DNN

[`FormView.ascx`](MegaForm.DNN/Views/FormView.ascx) có 3 nhánh:

1. `list` → `<div data-mf-view="list" …>` (mount khai báo, không JS trong ascx)
2. `card` → `<div data-mf-view="card" …>`
3. `else if (ActiveViewType != null && != "edit")` → khối JS legacy, comment ghi rõ:
   *"MULTI-VIEW MODE: legacy detail / continuous branches still rendered by **MegaFormViews**"*

Khối 3 mở đầu bằng [`:728-731`](MegaForm.DNN/Views/FormView.ascx#L728):

```js
if (typeof MegaFormViews === 'undefined') {
    container.innerHTML = '<p style="color:#ef4444;">MegaFormViews not loaded.</p>';
    return;
}
```

Nhưng:

- `MegaFormViews` **không được định nghĩa ở bất kỳ đâu trong source** — `git grep` chỉ ra 3 nơi:
  `FormView.ascx`, `FormViewOld.ascx` (đã chết), và **`Docs/MULTI-VIEW-APP-SPEC.md:559`** (bản đặc tả).
- `renderListView` / `renderCardView` / `fetchSubmissions`: **0** định nghĩa trong `MegaForm.UI/src`.
- Script được đăng ký là [`FormView.ascx.cs:462`](MegaForm.DNN/Views/FormView.ascx.cs#L462)
  `js/megaform-views.js`, sinh từ vite entry `views: src/views/index.ts`.
- [`src/views/index.ts`](MegaForm.UI/src/views/index.ts) là **13 dòng placeholder**: *"Currently a
  placeholder — submissions moved to submissions/ bundle"*.
- File đã build trên đĩa `Assets/js/megaform-views.js` **toàn bộ nội dung**:
  `(function(){"use strict";typeof window<"u"&&(window.MegaForm=window.MegaForm||{})})();`
  → **0** lần xuất hiện chuỗi `MegaFormViews`.
- `npm run build` **có** `build:views` trong chuỗi ⇒ **mỗi lần build đầy đủ lại ghi đè bằng stub này**.

⇒ Trên DNN, module cấu hình view `detail`, `continuous`, hoặc bất kỳ `viewType` lạ nào (`kanban`…) sẽ
hiện **"MegaFormViews not loaded."** màu đỏ. Đây là một cuộc **migration bỏ dở**: runtime bị xoá khỏi
source, call site vẫn ship, build vẫn phát ra file rỗng nên không ai thấy lỗi thiếu file.

> ⚠️ **Chưa kiểm chạy thật.** Đây là suy luận từ source + file build trên đĩa. Trước khi hành động phải
> mở một module DNN đặt view `detail` và **chụp ảnh** (đúng luật visual-QA trong `MEMORY.md`).

### E4. Ba asset view là build mồ côi

`Assets/js/megaform-listview.js` (166 KB), `megaform-submission-list.js` (34 KB),
`megaform-submission-card.js` (34 KB) — được [`FormView.ascx.cs:466,471,480`](MegaForm.DNN/Views/FormView.ascx.cs#L466)
đăng ký và tồn tại trên đĩa ở cả 4 nơi deploy (`Assets/js/`, `DesktopModules/MegaForm/Assets/js/`,
`MegaForm.Umbraco/wwwroot/js/`, `MegaForm.Web/wwwroot/megaform/js/`). Nhưng:

- **Không có entry** tên `listview`/`submission-list`/`submission-card` trong `vite.config.ts`
- **Không có script** `build:*` tương ứng trong `package.json`
- **Không file nào trong `src/` import** `listview/` hay `submission-views/` (grep = 0)
- `emptyOutDir: false` ([`vite.config.ts:195`](MegaForm.UI/vite.config.ts#L195)) và `clean` chỉ xoá
  `dist` + `Assets/js/bundles` ⇒ artifact cũ **sống mãi**
- `.gitignore:87` ignore `Assets/js/**` ⇒ **không có trong git**

⇒ 3.410 dòng TS (`listview/` + `submission-views/`) **không được build tới**; sửa chúng không thay đổi
gì trên site. Và file đang chạy thì **không tái tạo được từ source** — nếu ai đó dọn `Assets/js/`, list
và card view chết theo, mất vĩnh viễn (không có trong git).

Đây **đúng họ lỗi đã được ghi ngay trong `vite.config.ts`**: B172 (`ai-form-assistant`), `my-inbox`,
`ai-knowledge` — *"file shipped but had no build entry, so its … import never rebuilt"*. Lần này nó tái
phát và chưa ai bắt. Cùng lúc, `npm run build` còn **thiếu** `build:config`, `build:my-inbox`,
`build:workflow`, `build:widget-pdf-form` (có script nhưng không nằm trong chuỗi `build`), và không có
script nào cho entry `ai-form-assistant` / `umbraco-host` / các designer.

### E5. Builder tự động **xoá field và xoá rule** — lưới an toàn phải đứng trước nó

[`syncHtmlToSchemaImmediate`](MegaForm.UI/src/builder/html-sync.ts#L231): field nào **không** có token
trong `customHtml` thì bị **xoá khỏi schema** ([`:270-275`](MegaForm.UI/src/builder/html-sync.ts#L270)),
kèm `removeTouchedRules(removedKeys)` **xoá luôn rule chạm tới nó** ([`:288`](MegaForm.UI/src/builder/html-sync.ts#L288)).
Chạy tự động 220 ms sau khi ngừng gõ.

Kế hoạch không biết cơ chế này tồn tại. Nếu Giai đoạn 1 dựng validator "chặn khi lưu", nó sẽ chạy **sau**
khi field đã bị xoá khỏi state ⇒ validate một trạng thái đã bị phá. Thứ tự đúng: (1) chốt grammar (E1),
(2) đặt guard/undo cho đường xoá tự động này, (3) mới tới validator.

### E6. `NormalizeViewType` không whitelist ⇒ view type lạ hỏng im lặng

[`FormViewSelector.NormalizeViewType`](MegaForm.Core/ViewModes/FormViewSelector.cs#L50) chỉ map
`form/submit/edit → submit`, còn lại **trả nguyên chuỗi**. `ValidateAndNormalizeForSave` chỉ chặn rỗng /
trùng key / key reserved — **không** chặn `viewType` lạ. Runtime: `.ascx` có `detail`, `card`, và
[`else { // Default: list view }`](MegaForm.DNN/Views/FormView.ascx#L787).

⇒ Lưu một view `kanban` **thành công**, chạy ra list, **không cảnh báo gì**. Đây mới là "khoảng cách 6
vs 3" ở dạng lỗi chạy được — kế hoạch chỉ nêu nó như vấn đề *comment lỗi thời*.

---

## 8. Nhóm F — thiếu sót phương pháp

| # | Vấn đề |
|---|---|
| F1 | Không tham chiếu ~30 audit doc sẵn có trong `Docs/`. Ít nhất 2 khẳng định đã nằm sẵn ở đó (`MegaForm_Technical_Audit_Report_2026-06-11.md` nói `FormViewOld` đã bị Remove; `AUDIT_PERMISSION_MATRIX_ENFORCEMENT_2026-07-26.md` thuộc đúng vùng Giai đoạn 4) |
| F2 | Mọi con số không kèm cách đo ⇒ B3/B4 không tái lập được |
| F3 | Kết luận "không có X" rút từ *grep không thấy*, không kiểm đường ngược (ai gọi / entry build / csproj). **4/6** khẳng định dạng này sai (A1, A3, A4, A5) |
| F4 | Repo chỉ có **1 test project** (`MegaForm.Sdk.Tests`, 26 file). Cả 5 giai đoạn đều ghi "xong = bằng chứng chạy thật" nhưng không nói bằng chứng đó sống ở đâu trong bộ test |
| F5 | Bản kế hoạch **chưa `git add`** (`?? Docs/AUDIT_PLAN_20260814_…md`). Với `.gitignore` của repo này (đã nuốt `*.sql`, nuốt `Assets/js/**`), file chưa track là rủi ro mất thật |

---

## 9. Kế hoạch 5 giai đoạn — sửa lại

| Giai đoạn | Kế hoạch cũ | Sửa |
|---|---|---|
| **G1** Lưới an toàn template | "viết validator đối chiếu placeholder với `Fields[].key`" | ❌ **không bắt được E1**. Đổi thành: **(a)** chốt **một grammar token** dùng chung C#/TS · **(b)** vá E2 (không in lỗi đỏ cho anonymous) · **(c)** guard cho đường xoá tự động E5 · **(d)** *rồi mới* validator, mở rộng sang `{{content:*}}` (chỗ thật sự chưa có sync) và **thêm kiểm ở server** (`FormValidationService` hiện không đụng `customHtml`) |
| **G0** *(mới, phải đứng trước G1)* | — | **Xác minh E3/E4 trên site thật**: mở module DNN view `detail`, chụp ảnh; kiểm `megaform-views.js` trên site. Nếu đúng như suy luận thì đây là **lỗi khách nhìn thấy**, ưu tiên cao hơn mọi việc kiến trúc. Kèm: đưa `listview`/`submission-views` vào `vite.config.ts` + `npm run build`, hoặc **xoá source chết** — không để trạng thái lửng lơ |
| **G2** App bằng JSON | pilot Purchase Order (bespoke) | Đổi pilot sang **JSON-hoá định nghĩa Blog** (đã chạy trên `ConfiguredAppStarterService`). Trước đó phải xử lý **3 `Func<>`** (D3). Bỏ mệnh đề "chốt manifest làm nguồn sự thật" hoặc viết lại cho đúng: đó là **đảo chiều** manifest ↔ AppScope, phải kèm migrate + rà 4 host (D1). Thêm gate P0 cho role/user/password/permission trong manifest (D4) |
| **G3** View engine dùng chung | "đưa dispatch ra khỏi `.ascx`" | Dispatch **đã ở Core** (`FormViewSelector`). Việc thật: **(a)** whitelist `viewType` (E6) · **(b)** hợp nhất 4 bộ từ vựng (B5) · **(c)** quyết định số phận `detail`/`continuous` sau khi có kết quả G0 · **(d)** bỏ mục "gỡ `FormViewOld`" — đã gỡ rồi, chỉ còn xoá file |
| **G4** BFF | "chưa có, cần xây" | **Đo trước**: chạy 2 role trên 1 form và so payload — `FormAccessProjection` có thể đã đạt tiêu chí. Nếu đạt, phạm vi còn lại thu hẹp thành: **mở rộng `ResolvedRenderModel`** để mang thêm `permissions` + `view` + `data` (hiện chỉ có schema/settings/submit/postSubmit/css) |
| **G5** Parity | "khảo sát hợp nhất 2 renderer" | Kết luận đã có sẵn trong [`FormHtmlRenderer.cs:17-35`](MegaForm.Core/Services/FormHtmlRenderer.cs#L17): SSR = shell tĩnh cho SEO, client = phần động. Không cần khảo sát lại. Việc còn có ích: **danh sách những gì bắt buộc phải có trong first paint** — chỉ nhóm đó mới chịu parity tax |

---

## 10. Những gì bản kế hoạch nói ĐÚNG (giữ nguyên, không làm lại)

- **§0 luận điểm trung tâm**: tầng form đã JSON-driven (`FormSchema.cs` **957 dòng** ✅, customHtml/customCss, `{{field:}}`/`{{content:}}`/`{{script:}}`/`{{summary}}` ✅, ShowIfRule + `SharedRuleEngine`/`RuleEvaluator` ✅). Làm lại tầng này là phá thứ đang chạy — **đúng và quan trọng**.
- **§4 phản biện bảng so sánh** — về cơ bản chuẩn, trừ ô "BFF đang thiếu" (A4).
- **App layer đúng là còn hard-code**: `Get()` chỉ nhận 3 alias của Blog, 5 service bespoke, thêm app mới = build lại DLL. Kết luận đúng, chỉ số liệu sai (B2).
- **`{{content:*}}` chưa có sync** ✅ và **server chưa validate token** ✅ — hai lỗ hổng thật.
- **§7 "việc KHÔNG nên làm"** — cả 4 gạch đầu dòng đều hợp lý.
- Các số đã kiểm đúng: `FormHtmlRenderer.cs` 2.076 · `renderer/index.ts` 4.621 · `Starters/` 9.788 · `PurchaseOrder` 398 · `FormView.ascx:751,778` · `FormViewOld.ascx:115,142` · `Phase2Models.cs` comment 6 loại.

---

## 11. Chưa kiểm được — cần bằng chứng chạy thật

1. **E3 trên site thật** — module DNN đặt view `detail`: có ra "MegaFormViews not loaded." không? (chụp ảnh)
2. **A4/G4** — 2 role, 1 form, so 2 payload `Schema/{formId}`: field bị ẩn có thật sự vắng mặt không?
3. **E4** — site đang chạy có `megaform-listview.js` bản nào; so timestamp `Assets/js/` repo với site (bài học 08-14 LỖI C: DLL site lệch repo 45 phút)
4. **E1** — tạo 1 field key `first-name` trong builder, xem trang public in ra gì
5. **B3** — cách đếm typed-storage của bản kế hoạch là gì; Umbraco thật sự chạy typed storage tới đâu

---

## 12. Tóm tắt một câu

Bản kế hoạch đúng ở tầng luận điểm nhưng **sai ở tầng bằng chứng**: nó đề xuất xây bốn thứ đã có
(`FormViewSelector`, view-designer, sync token builder, render-model + lọc field theo role), lấy một file
đã chết làm chứng cứ, và **bỏ sót một trang lỗi đỏ mà khách có thể đang nhìn thấy** — trong khi Giai
đoạn 1 của nó, đúng như đang viết, sẽ **báo xanh** cho chính lỗi im lặng mà nó sinh ra để bắt.
