# HANDOFF 2026-07-17 — 2 VIỆC DỞ DANG cho phiên sau (owner giao 07-17)

> Bối cảnh chốt phiên 07-16/17: source-picker unified SHIPPED trên Oqtane (:5125 B403, commit `1a5ee55`);
> DNN docs series 20 bài live; icon DNN fixed (`e03feea`); **DockOnDrop ROLLED BACK** (`b312ef2` — xem §3).

---

## VIỆC 1 — Submission dashboard switch SQL-table ⇄ DataJson trên CẢ Oqtane VÀ DNN, chịu HÀNG TRIỆU bản ghi

### Đã có (Oqtane, verified live :5125 B403 — commit `1a5ee55`, chi tiết `CLAUDE_HANDOFF_20260716_SOURCE_PICKER_UNIFIED_AND_DOCFX_DNN.md`)
- **1 endpoint** `Submissions?formId&source=auto|json|sql` → `ExternalSourceContext` (AsyncLocal, Core)
  → `ExternalSubmissionRepository` route → `ExternalTableQueryService` (SQL-side WHERE/ORDER/OFFSET-FETCH/COUNT,
  `MaxOffset` chặn deep-page, bounded-count khi COUNT đắt). databaseInsert form → `DatabaseInsertBindingResolver`
  (parse INSERT INTO → `TableCapabilityProbe` on-demand, cache, allowlist). Id ÂM synthetic (KHÔNG anchor),
  sql=admin-only, client CHỈ tin echo `source/sqlCapable/sqlTable/totalIsBounded` (twin-gap guard).
- Client (bundle submissions+dashboard B403) đã sẵn cho MỌI platform — toggle tự ẩn khi server không echo.

### CẦN LÀM: DNN server twin (điểm chính) — map DI đã khảo sát sẵn (agent 07-16, không phải khảo sát lại)
| Mảnh | Oqtane (có) | DNN (thiếu) |
|---|---|---|
| `ISubmissionRepository` | DI decorator `Startup.cs:81-89` | **static `DnnServiceLocator`** (`MegaForm.DNN/Services/DnnServiceLocator.cs:34`) → phải interpose decorator TẠI locator (bọc `DnnSubmissionRepository` bằng `ExternalSubmissionRepository` khi construct — thêm binding store + rowmap + query service vào locator) |
| `IExternalBindingStore` | `OqtaneExternalBindingStore` | ĐÃ CÓ `DnnExternalBindingStore` (`MegaForm.DNN/Data/DnnExternalBindingStore.cs:23`, non-DI — `new` trực tiếp) |
| `IExternalRowMapStore` | `OqtaneExternalRowMapStore` | **CHƯA CÓ** — nhưng đường databaseInsert KHÔNG cần anchor (id âm); chỉ ATBE row-open cần → có thể stub null-safe (decorator nhận null → chỉ hỗ trợ databaseInsert read + ATBE list-only) hoặc viết `DnnExternalRowMapStore` (bảng MF_ExternalRowMap đã có schema bên Oqtane migration — DNN cần SqlDataProvider) |
| `ExternalTableQueryService` | DI | Core, chỉ cần `IConnectionRegistry` — DNN có `DnnConnectionRegistry` (`WebApi/MegaFormApiController.cs:4535`, non-DI) |
| Controller `source` param | `MegaFormController.ListSubmissions` (mẫu để port) | `MegaFormApiController.List` (~:2042): thêm `source`, gate `IsSubmissionAdmin`, set AsyncLocal quanh `service.List(...)`, echo 4 field. ⚠️DNN `List` hiện new `SubmissionQueryService(new DnnSubmissionRepository(),...)` TRỰC TIẾP (:2084) — đổi sang locator/decorator-wrapped repo |
- Umbraco/Web: same-shape, làm sau (Web/Umbraco thiếu cả 2 store — clone `Startup.cs:81-89` + 2 store impl).

### CẦN LÀM: triệu-bản-ghi cho CẢ 2 CHIỀU nguồn
- **SQL-table mode**: `ExternalTableQueryService` đã lo (probe quyết định searchable/sortable theo INDEX;
  bounded count `TOP 10001`; MaxOffset 10000). Việc còn: (a) verify với bảng test ≥1M dòng (seed script
  vào LegacyErp_Demo — bảng `BigTxn` 1-2M dòng, index theo (CreatedOn), 1 cột text KHÔNG index để thấy
  honest-fail search); (b) pager client hiện "N+" khi `totalIsBounded` (ĐÃ ship); (c) cân nhắc keyset khi
  owner cần trang sâu.
- **DataJson mode (MF_Submissions)**: `EfSubmissionRepository.List` đã SQL-side paging + COUNT nhưng
  (a) `Search` = `DataJson.Contains` **non-sargable** → triệu dòng sẽ chậm khi search → chuyển search có
  fieldKey sang `MF_SubmissionValues` (EAV index; ⭐memory: Oqtane EAV indexer từng fail âm thầm — verify
  indexer chạy); (b) COUNT mỗi request → cache ngắn hoặc bounded-count giống external; (c) ⭐backlog cũ
  liên quan: **queryKey>250 data-loss** (facade clamp) + **report modal clamp 250** — cùng họ, nên xử trong
  đợt này. (d) DNN `DnnSubmissionRepository.List` — VERIFY có SQL-side paging chưa (chưa đọc — việc đầu phiên).

### Thứ tự làm đề xuất
1. DNN twin đường databaseInsert (không cần rowmap): locator interpose + controller `source` + echo → QA form ERP DNN (Store 39 ⇄ dbo.Stores… bảng `LegacyErp` DNN).
2. Seed bảng 1-2M dòng + QA performance cả 2 nền (đo ms, search indexed vs non-indexed, trang sâu).
3. DataJson-side: sargable search + bounded count + queryKey>250 fix.
4. Umbraco/Web twin + `MF_ExternalRowMap` DNN (SqlDataProvider mới — ⚠️schema-drift SqlDataProvider chỉ tới 01.06.32, memory 07-14).

---

## VIỆC 2 — MegaForm tương thích BOOTSWATCH themes khi "borrow from theme" (From page)

### Yêu cầu owner (kèm 2 screenshot :5125 `/private?view=form&edit=true`, theme hồng-tím)
Khi Settings → Theme & Layout → **Page integration**: Typography source / Color source = **From page**,
form phải ăn theo theme (Bootswatch): **màu NỀN form/card, màu nền TEXT INPUT, chữ input**, border…
Hiện tại: form vẫn card TRẮNG + input trắng chữ đen trên page màu (owner khoanh đỏ vùng input).

### Cơ chế HIỆN TẠI (đã nghiên cứu xong — file:line chính xác)
- UI 2 radio: `MegaForm.UI/src/view-designer/settings-popup.ts:1134-1139` (`themeInheritType/Colors`);
  load/save: `view-designer/shared.ts:1073-1076` (đọc `inheritPageTypography/Colors` từ settings) +
  `:1117-1122` (payload `InheritPageTypography/InheritPageColors`); server persist:
  `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:707-762` (ghi vào SettingsJson cả camel+Pascal).
- **Áp dụng = server-side, Core** `MegaForm.Core/Services/ThemeFirstPaintCssService.cs`:
  - Typography: `:87-88` stamp class `mf-inherit-type` → `Assets/css/megaform.css` (~:211-219)
    `font-family:inherit!important` (trừ icon). CHỈ FONT.
  - Colors: `:98` `HostPrimaryVar = var(--bs-primary, var(--primary, var(--theme-primary, #2563eb)))`;
    `:113-124` borrowColors CHỈ inject `--mf-primary` + `--mf-btn-bg` (+ alias premium qua
    `BuildPremiumThemeAliasVars`) và `:138` `--mf-page-bg=transparent` (outer). **Body text, card bg,
    input bg/fg/border GIỮ NGUYÊN CÓ CHỦ ĐÍCH** (comment "readability; card keeps its own bg").
    → ĐÂY là lý do form trắng trên theme màu — không phải bug, là scope hẹp của lần ship trước.
- Guard sẵn có: `preservePremiumPalette` (template tự khai palette → không đè). Nhớ giữ.

### Thiết kế fix đề xuất (mở rộng borrowColors map — cùng chỗ `:113-124`)
Var hooks ĐÃ TỒN TẠI trong megaform.css (99 usages — không phải sửa CSS nhiều, chỉ inject giá trị):
`--mf-form-bg, --mf-card-bg, --mf-input-bg, --mf-input-fg, --mf-input-color, --mf-input-border(-color),
--mf-input-focus-*, --mf-input-muted-*, --mf-input-disabled-bg, --mf-border, --mf-text*`.
Map sang **Bootstrap 5.3 CSS vars** (Bootswatch nào cũng expose) với fallback chain kiểu HostPrimaryVar:
- card/form bg ← `var(--bs-body-bg, …)`; text/label/input-fg ← `var(--bs-body-color, …)`
- input bg ← `var(--bs-form-control-bg, var(--bs-body-bg, …))` (BS5.3 có form-control vars); disabled ←
  `var(--bs-secondary-bg, …)`; border ← `var(--bs-border-color, …)`; muted ← `var(--bs-secondary-color, …)`
- focus ring ← `--bs-focus-ring-color`; heading ← `--bs-heading-color` fallback body-color.
- DNN skin không Bootstrap-5.3: fallback chain thêm `var(--primary…)` rồi literal — và **fallback cuối
  phải = giá trị mặc định hiện tại** (không phá form trên skin không có var nào).
⚠️Chú ý: (1) dark theme (Darkly/Cyborg) là bài test chính — form phải đọc được (input đổi nền tối chữ sáng
đồng bộ); (2) `preservePremiumPalette` giữ nguyên hành vi; (3) `.mfp` premium alias qua
`BuildPremiumThemeAliasVars` — inject TRƯỚC alias expansion như `--mf-primary` đang làm để lan sang alias;
(4) RULE parity 2 renderer: stamp/vars là server-side (ThemeFirstPaintCssService) dùng chung — verify cả
SSR lẫn client-render path cùng nhận (client TS KHÔNG có nhánh borrow riêng — đã grep, chỉ server); (5) mọi
CSS emit qua `ModuleCssComposer.NeutralizeStyleBreakout` (SECURITY §6) — BuildScopedCss đã theo đường đó, giữ.

### QA plan
:5125 có sẵn page `/private` theme hồng (screenshot owner). Cài/đổi thêm 1 theme Bootswatch DARK (Oqtane
theme Bootstrap 5.3) → bật From page cả 2 radio → screenshot element form: card+input phải ăn nền/chữ theme,
đổi theme → form đổi theo, tắt From page → về theme MegaForm. Test thêm 1 form premium (.mfp) + 1 form
thường; DNN skin tương tự trên dnn10322_megaclean (skin Xcillion có --bs-* không? verify — DNN 10 default
theme dùng Bootstrap 5).

---

## §3 Trạng thái liên quan (chốt 07-17)
- **DockOnDrop ROLLED BACK** (`b312ef2`): drop module thật vỡ `MoveModule` 401 (shell boot trong ajax add
  pipeline của DNN) — simulated QA không bắt được, chỉ drop thật mới lộ. Root cause ghi đầy đủ trong comment
  `ShouldSuppressInlineAdminShell`. Site DLL đã revert + deploy từ source revert. **Icon fix GIỮ (`e03feea`)**.
  Module 502 (drop lỗi của owner trên PFS-AlpineRetreatEscape-Original) vẫn trong DB ContentPane — sau revert
  sẽ render bình thường khi load trang; owner giữ/xoá tuỳ ý.
- Nhánh `feat/theme-designer-picker-wizard-gallery-1.7.45` CHƯA push; docs DNN series live `d246839`;
  2 sửa docs DNN (drop-module GIF + Windowed/FullScreen) vẫn pending (handoff p3).
- Sites: :5125 Oqtane B403 đang chạy; DNN megaclean nguyên trạng (form 37, edit-mode off).
