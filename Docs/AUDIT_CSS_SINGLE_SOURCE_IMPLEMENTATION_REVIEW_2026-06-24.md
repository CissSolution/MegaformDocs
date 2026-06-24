# AUDIT — Implementation Review — CSS Single-Source Refactor (2026-06-24)

**Ngày:** 2026-06-24  
**Phạm vi:** Rà soát code đã chỉnh sửa theo plan `Docs/AUDIT_CSS_SINGLE_SOURCE_REFACTOR_2026-06-24.md` và `Docs/REFACTOR_PLAN_CSS_SINGLE_SOURCE_2026-06-24.md`. Chỉ audit, **không code**.  
**Codebase tại thởi điểm review:** AssetVersion `20260624-B261`, có handoff `CLAUDE_HANDOFF_20260624_CSS_SINGLE_SOURCE_REFACTOR.md`.

> **⚠️ ĐÍNH CHÍNH 2026-06-24 (rà soát lại trên code thật, AssetVersion `B262`):** Bản review này được viết khi codebase ở `B261`. Code hiện tại đã là **`B262`** và đã thêm + deploy **module-source storage backend** (`MegaForm:ModuleStyleJson` + `MegaForm:ModuleStyleFormId`, endpoint `ModuleConfig/ModuleStyle` + `ModuleConfig/SaveModuleStyle`, overlay `OverlayModuleStyle` lúc SSR). Do đó **mục 2.1 và 2.11 đã LẠC HẬU** — module-as-source *đã* tồn tại trên **Oqtane** (chưa port DNN, chưa browser-acceptance-test). Xem ghi chú đính chính tại từng mục. Thiết kế thực tế là **overlay settings-delta + compose lúc render** (không bake CSS string như review đề xuất) và model này đã được user chốt ("user confirmed the model" trong handoff). Các finding kỹ thuật còn lại (2.2, 2.4, 2.5, 2.9, 2.10, 2.13) vẫn đứng vững.

---

## 1. Tóm tắt những gì đã làm (theo handoff)

- `MegaForm.Core/Services/ModuleCssComposer.cs` (mới): compose toàn bộ CSS thành 1 chuỗi theo thứ tự `[preset, scoped theme vars, authored customCss + compat, module override]`.
- `MegaForm.Oqtane.Client/Index.razor`: xóa block `mf-inline-preset-*`, chỉ emit một block `mf-custom-css-*` từ composer; wrapper có `data-mf-ssr="1"`.
- `MegaForm.UI/src/renderer/index.ts`: `applyFormPresentationSettings` early-return khi `data-mf-ssr="1"` (không cần node tồn tại); `installDisplayStyleSheet` cũng skip khi SSR.
- `MegaForm.DNN/Views/FormView.ascx` + `.ascx.cs` + `ViewModels.cs`: tương tự Oqtane, emit 1 block, thêm `data-mf-ssr="1"`, bỏ `mf-live-override`.
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`: FastEmbed `/render` cũng dùng composer (nhưng vẫn còn code emit block cũ).
- **(B262 — bổ sung sau khi review viết)** `MegaFormController.cs` + `Index.razor`: module-source storage backend (Oqtane). Module lưu `MegaForm:ModuleStyleJson` keyed `MegaForm:ModuleStyleFormId`; `OverlayModuleStyle` overlay lên form settings lúc SSR ("module wins"); `GetModuleStyle` seed-from-form, `SaveModuleStyle` ghi store + invalidate cache; UI wiring trong `shared.ts` + `megaform-settings-popup.js`. **Chưa port DNN, chưa browser-acceptance-test.**

Điều này đã **khắc phục flash ở Oqtane** (form 753 verified live) và chuẩn bị nền tảng cho DNN.

---

## 2. Các điểm chưa hợp lý / còn lệch so với intent “1 nguồn duy nhất”

### 2.1 🟠 ~~Chưa có~~ module setting là single source (WRITE side) — ĐÃ CÓ TRÊN OQTANE (B262)

> **✅ ĐÍNH CHÍNH (B262):** Mục này LẠC HẬU. Code hiện tại đã có module store trên **Oqtane**: module lưu `MegaForm:ModuleStyleJson` (keyed `MegaForm:ModuleStyleFormId`), `OverlayModuleStyle` overlay lên form settings lúc SSR ("module wins"), `SaveModuleStyle` ghi store + invalidate cache, `GetModuleStyle` seed-from-form khi module bind form khác.
> - **Khác thiết kế:** lưu **settings-delta** rồi compose lúc render (KHÔNG bake CSS string thành `MegaForm_ModuleCss` như khuyến nghị bên dưới). Model overlay này đã được user chốt; khuyến nghị "store baked CSS" bên dưới **không áp dụng nữa**.
> - **Còn đúng:** chưa port **DNN** (FormView.ascx.cs đọc `CssOverride` nhưng chưa đọc `ModuleStyleJson`); chưa browser-acceptance-test; legacy CssOverride chưa được merge/deprecate dứt điểm.
>
> _Phần mô tả gốc dưới đây giữ lại cho mục lịch sử (đúng tại B261)._

**Mô tả:** `ModuleCssComposer` chỉ là **composer tại thởi điểm render**. Nó đọc form `settings` + module `CssOverride` (nếu có) rồi tạo CSS. Nó **không lưu** CSS vào một module setting duy nhất, cũng không khiến mọi write (SaveTheme, SaveStyle, preset, template) ghi vào đó.

**Hệ quả:**
- “Module setting thắng” chỉ đúng ở tầng render-time, chưa đúng ở tầng storage.
- Khi user chỉnh CSS trong Live Style Editor, vẫn ghi vào `MegaForm_CssOverride` (DNN) hoặc chỉ ghi preset key (Oqtane); lần render sau composer mới merge lại. Vẫn còn 2 nguồn: form JSON + module override.
- Nếu xóa form và tạo lại từ template, module override cũ vẫn còn, có thể đè lên form mới một cách bất ngờ.

**File liên quan:**
- `MegaForm.Core/Services/ModuleCssComposer.cs:31-87` — không có API lưu module setting.
- `MegaForm.DNN/WebApi/MegaFormApiController.cs:3565-3596` — vẫn ghi `MegaForm_CssOverride`, `MegaForm_ThemeClass`, `MegaForm_SelectedThemePresetKey` riêng lẻ.
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2637-2659` — `SaveStyle` vẫn chỉ ghi `SelectedThemePresetKey`.

**Khuyến nghị:** Thêm `MegaForm_ModuleCss` / `MegaForm:ModuleCss` setting. Tất cả write endpoints phải recompose và ghi vào đây; `CssOverride` deprecated.

---

### 2.2 🔴 ID của style block vẫn là form-scoped, không phải module-scoped

**Mô tả:** Cả Oqtane và DNN đều dùng `id="mf-custom-css-{formId}"`. Nếu cùng một form xuất hiện ở **nhiều module trên cùng page**, sẽ có nhiều thẻ `<style>` trùng id. CSS text của các module có thể khác nhau (do override/preset khác nhau) → một block sẽ đè/ghi đè block kia không xác định.

**File liên quan:**
- `MegaForm.Oqtane.Client/Index.razor:782`
- `MegaForm.DNN/Views/FormView.ascx:632`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs:160`

**Khuyến nghị:** Đổi thành `id="mf-module-css-{moduleId}"` (hoặc `mf-module-css-{moduleId}-{formId}`). Đây là yêu cầu cốt lõi của “single source per module”.

---

### 2.3 🟡 `RenderPage.cs` vẫn còn code emit block `mf-inline-preset-*` (dead code)

**Mô tả:** Dòng 87 đã set `inlineCss = string.Empty;` để “fold”, nhưng dòng 157-158 vẫn còn logic emit `mf-inline-preset-*`. Mặc dù hiện tại `inlineCss` luôn rỗng nên không emit, nhưng code dư này dễ gây hiểu nhầm và regression nếu ai đó refactor lại.

**File liên quan:**
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs:157-160`

**Khuyến nghị:** Xóa block `mf-inline-preset-*` ở dòng 157-158; chỉ giữ `mf-custom-css-*`.

---

### 2.4 🟡 Không sanitize `</style>` trong composed CSS

**Mô tả:** `ModuleCssComposer.Compose` nối các chuỗi CSS trực tiếp. Nếu `customCss` của author chứa `</style>`, thẻ `<style>` server-emitted sẽ bị đóng sớm, phần còn lại của CSS (kể cả module override) rò rỉ ra ngoài và có thể bị coi là markup/HTML. Các service cũ (`ThemePresetInlineCssService`, `ThemeFirstPaintCssService`) đã có `CssEscapeValue` để thay `</style` thành `<\/style`. Composer chưa làm điều này.

**File liên quan:**
- `MegaForm.Core/Services/ModuleCssComposer.cs:59-87`
- `MegaForm.Oqtane.Client/Index.razor:780-783` (render MarkupString)
- `MegaForm.DNN/Views/FormView.ascx:631-633` (`<%= ViewModel.ModuleCss %>`)

**Khuyến nghị:** Escape `</style` trong output của composer, hoặc ít nhất escape ở host trước khi render.

---

### 2.5 🟡 DNN vẫn emit cả `ThemeClass` lẫn `WrapperRuntimeClasses`

**Mô tả:** DNN wrapper class bao gồm `ThemeClass` (từ module setting) + `WrapperRuntimeClasses` (từ composer). Cả hai đều có thể chứa `mf-theme-*`, gây duplicate class hoặc xung đột nếu module setting và form settings chọn theme khác nhau. Oqtane chỉ dùng `WrapperRuntimeClasses`, không dùng `ThemeClass`.

**File liên quan:**
- `MegaForm.DNN/Views/FormView.ascx:635`
- `MegaForm.DNN/ViewModels/ViewModels.cs:104-109`

**Khuyến nghị:** Deprecate `MegaForm_ThemeClass`; nếu vẫn cần transitional, merge nó vào `WrapperRuntimeClasses` một cách rõ ràng (loại bỏ trùng lặp) thay vì nối chuỗi.

---

### 2.6 🟡 `CssOverride` (module override) khó thắng scoped vars có `!important`

**Mô tả:** Composer append `moduleCssOverride` cuối cùng trong cùng một `<style>` block. Tuy nhiên segment `[2] scoped theme vars` được `ThemeFirstPaintCssService.BuildScopedCss` đặt `!important` trên tất cả vars. Nếu `CssOverride` viết `.mf-form-wrapper { --mf-primary: red; }` (không `!important`), nó sẽ **thua** scoped vars. Điều này không mới so với code cũ (client cũng inline `!important` vars), nhưng cần ghi chú rõ cho user/admin: override muốn thắng phải dùng `!important` hoặc composer cần wrap override trong wrapper selector với `!important`.

**File liên quan:**
- `MegaForm.Core/Services/ModuleCssComposer.cs:83-84`
- `MegaForm.Core/Services/ThemeFirstPaintCssService.cs:276-294`

**Khuyến nghị:** Tài liệu hóa, hoặc tự động thêm `!important` cho CSS vars trong module override segment.

---

### 2.7 🟡 `HasCustomShell` predicate hơi “lỏng”

**Mô tả:** `HasCustomShell` trả về `true` nếu `customCss` chứa chuỗi con `"mfp"` (case-insensitive). Điều này có thể kích hoạt compat bridge khi CSS chỉ chứa từ khóa tình cờ (ví dụ trong URL, comment), hoặc ngược lại không kích hoạt nếu template dùng class khác `.mfp` (vd. `.fr-card` đơn thuần). Hiện tại chỉ mirror client predicate `/mfp/.test(customCss)`, nên không tệ hơn cũ.

**File liên quan:**
- `MegaForm.Core/Services/ModuleCssComposer.cs:100-105`
- `MegaForm.UI/src/renderer/index.ts:540` (client predicate)

**Khuyến nghị:** Cân nhắc dùng regex `\b\.mfp\b` thay vì `IndexOf("mfp")` để chính xác hơn; đồng bộ cả client.

---

### 2.8 🟡 `applyFormPresentationSettings` vẫn đụng class trên SSR public form

**Mô tả:** Dù đã early-return phần theme rebuild, hàm vẫn gọi `applyDisplayStyleClasses` và toggle `mf-hide-header` trước guard (`index.ts:264-267`). Điều này không gây flash vì class idempotent, nhưng về nguyên tắc “JS public không làm gì cả” thì chưa hoàn toàn đúng. Host đã emit `WrapperRuntimeClasses` rồi.

**File liên quan:**
- `MegaForm.UI/src/renderer/index.ts:261-280`

**Khuyến nghị:** Sau khi host DNN/Web/Oqtane đều emit đầy đủ runtime classes, chuyển toàn bộ `applyDisplayStyleClasses`/`mf-hide-header` vào host; client chỉ còn render fields.

---

### 2.9 🔴 MegaForm.Web chưa được chạm

**Mô tả:** `MegaForm.Web/Views/Form/View.cshtml` vẫn mount empty `#mf-form-mount`, không server-render CSS block, không có `data-mf-ssr="1"`, và renderer tự build toàn bộ theme. Nếu refactor chỉ dừng ở Oqtane+DNN, Web sẽ vẫn là ngoại lệ.

**File liên quan:**
- `MegaForm.Web/Views/Form/View.cshtml:182-207`

**Khuyến nghị:** Áp dụng cùng pattern: emit `<style id="mf-module-css-{moduleId}">` + `data-mf-ssr="1"` trước mount; cập nhật `megaform.css` lên bản có block B251.

---

### 2.10 🔴 Custom scripts vẫn động CSS runtime

**Mô tả:** Template Fiesta Coral (`fiesta-coral-party-rsvp.json`) và các premium template khác có thể dùng `customScripts.*` để gọi `host.style.setProperty(...)` (preset switcher). Nó chạy ngoài `applyFormPresentationSettings`, không bị `data-mf-ssr` chặn. Trên form 753 đang live, điều này có thể gây flash sau khi SSR paint.

**File liên quan:**
- `Premium Current/fiesta-coral-party-rsvp.json` (`customScripts.party_theme`)
- `MegaForm.UI/src/renderer/index.ts` (script injection path)

**Khuyến nghị:** Custom scripts preset switcher chỉ được render UI và dispatch save event; CSS phải do server recompose sau save. Hoặc tối thiểu là gán `data-mf-script-root` và chặn script chạm CSS khi `data-mf-ssr="1"`.

---

### 2.11 🟠 Save endpoints chưa ghi vào module CSS store — PHẦN LỚN ĐÃ CÓ (B262)

> **✅ ĐÍNH CHÍNH (B262):** `ModuleConfig/SaveModuleStyle` (Oqtane) **đã** ghi vào module store. Trong model overlay đã chốt, việc `SaveTheme`/`SaveStyle`/template import vẫn ghi vào form là **đúng chủ ý** — form JSON = seed/template, module overlay thắng lúc render. Gap thật còn lại: (a) DNN chưa có `SaveModuleStyle`; (b) builder/Theme-Designer "Publish" khi đang ở **module context** chưa route vào module store (mục 2.12). Bỏ qua phần "không endpoint nào ghi module store" bên dưới.
>
> _Phần mô tả gốc dưới đây giữ lại cho mục lịch sử (đúng tại B261)._

**Mô tả:** Tất cả save endpoints vẫn ghi vào các nguồn cũ:
- `Form/SaveTheme` → `SchemaJson.settings` / `SettingsJson` / `ThemeJson`.
- `ModuleConfig/SaveStyle` → `SelectedThemePresetKey` + `CssOverride`.
- Template import → form `customCss`.

Không endpoint nào gọi `ModuleCssComposer` để lưu kết quả vào `MegaForm_ModuleCss`.

**File liên quan:**
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:616-688`, `:2637-2659`
- `MegaForm.DNN/WebApi/MegaFormApiController.cs:618-680`, `:3575-3596`

**Khuyến nghị:** Bổ sung lớp “ModuleCssStore” và hook vào mọi write path; đây là phần còn lại của Phase 3-4.

---

### 2.12 🟡 Builder preview save chưa cập nhật module CSS

**Mô tả:** Builder vẫn lưu vào `SchemaJson.settings.customCss`. Nếu sau này có `ModuleCss` store, khi user bấm Publish trong builder, server cần recompose và ghi `ModuleCss` cho module đang edit. Hiện tại chưa có điểm nào trong builder/UI code làm điều đó.

**File liên quan:**
- `MegaForm.UI/src/builder/theme-tab-adapter.ts:877` (flushPreview)
- `MegaForm.UI/src/builder/*.ts` (save paths)

**Khuyến nghị:** Sau khi store sẵn sàng, thêm bước recompose `ModuleCss` trong `SaveForm`/`SaveTheme` khi có module context.

---

### 2.13 🟡 Không có migration/backfill legacy forms

**Mô tả:** Các form cũ có CSS chỉ trong `SettingsJson`/`ThemeJson` (không trong `SchemaJson.settings`) vẫn được composer đọc qua `settings` object? `ModuleCssComposer.Compose` chỉ đọc từ `settings` JObject. Nếu legacy CSS nằm ở root schema hoặc `ThemeJson`, composer bỏ qua. Handoff đã cảnh báo Caveat G; hiện tại chưa có migration.

**File liên quan:**
- `MegaForm.Core/Services/ModuleCssComposer.cs:75-79`
- `MegaForm.Core/Rendering/RenderModelResolver.cs` (nơi đồng bộ root → settings)

**Khuyến nghị:** Trước khi kích hoạt rộng, chạy migration/backfill hoặc fallback đọc `ThemeJson` trong composer.

---

## 3. Đánh giá tổng quan

| Tiêu chí | Trạng thái | Nhận xét |
|---|---|---|
| Render-time single source (1 block) | ✅ Hoàn thành trên Oqtane + DNN | Composer hoạt động, client skip khi SSR. |
| JS public không đụng CSS | 🟡 Gần xong | `applyFormPresentationSettings` + `installDisplayStyleSheet` đã skip; `applyDisplayStyleClasses` vẫn chạy; custom scripts vẫn có thể đụng CSS. |
| Module setting là single storage source | 🟠 Oqtane xong (B262), DNN chưa | Overlay settings-delta (`MegaForm:ModuleStyleJson`) + `SaveModuleStyle` đã có trên Oqtane; chưa browser-test; DNN chưa port. |
| Phủ DNN | 🟡 Code xong, chưa live test | Cần build + visual check trên DNN. |
| Phủ Web | 🔴 Chưa | Web vẫn client-render hoàn toàn. |
| Builder preview | ✅ Giữ nguyên | Không bị ảnh hưởng. |
| Preset switcher | 🟡 Giao diện còn, logic chưa chuyển | Cần chuyển từ runtime CSS sang save+reload. |
| Migration legacy | 🔴 Chưa | Cần backfill/audit dữ liệu cũ. |

---

## 4. Khuyến nghị ưu tiên tiếp theo

> **Cập nhật B262:** P0 cũ ("tạo module CSS store") **đã xong trên Oqtane** (overlay settings-delta, không bake CSS string). Danh sách dưới đã hiệu chỉnh theo hiện trạng.

1. **P0 — Browser-acceptance-test B262 (Oqtane):** mở Settings popup admin → đổi màu/preset → Save → reload form public xác nhận màu đổi + reseed khi bind form khác. (Handoff §B262 có checklist 5 bước.)
2. **P0 — DNN parity:** port `OverlayModuleStyle` + `GetModuleStyle`/`SaveModuleStyle` sang DNN (`FormView.ascx.cs` đọc `MegaForm_ModuleStyleJson` + `MegaFormApiController`). Hiện DNN chưa có module-wins.
3. **P1 — Đổi style id thành module-scoped:** `mf-module-css-{moduleId}` để tránh xung đột khi nhiều module cùng form trên một page (chỉ cần nếu chấp nhận kịch bản đó — xem §5.5).
4. **P1 — Sanitize `</style>` trong composer output.** (mục 2.4)
5. **P1 — Xóa dead code `mf-inline-preset-*` trong `RenderPage.cs`.** (mục 2.3 — cần xác minh, handoff tự mâu thuẫn về việc đã convert hay chưa.)
6. **P1 — Xử lý custom scripts động CSS (form 753 `party_theme`):** audit các premium template có `customScripts` động CSS, chuyển sang save+reload hoặc gate theo `data-mf-ssr`. (mục 2.10 — live-flash risk thật.)
7. **P2 — MegaForm.Web:** áp dụng cùng pattern (emit CSS block + `data-mf-ssr="1"`). (mục 2.9)
8. **P2 — Migration legacy:** backfill module style cho module cũ, kiểm tra form có CSS trong `ThemeJson`/`SettingsJson` không có trong `SchemaJson.settings`. (mục 2.13)

---

## 5. Quyết định cần người dùng

> **Cập nhật B262:** Quyết định 1 và 2 đã được giải quyết — module store đã triển khai (Oqtane), key là `MegaForm:ModuleStyleJson` + `MegaForm:ModuleStyleFormId`, model = overlay settings-delta (không bake CSS string). Các quyết định còn mở:

1. ~~Triển khai module CSS store ngay?~~ → **ĐÃ LÀM (B262, Oqtane).** Còn lại: có port DNN ngay không?
2. ~~Tên key?~~ → **ĐÃ CHỐT:** `MegaForm:ModuleStyleJson` + `MegaForm:ModuleStyleFormId`.
3. Có muốn **tự động merge** `MegaForm_CssOverride` (DNN) / preset key cũ vào module style khi deploy, hay để admin chủ động import?
4. Preset switcher (vd. `party_theme` form 753): chấp nhận **reload page** sau khi chọn preset, hay cần UX “apply instantly without reload” (sẽ vi phạm “JS không đụng CSS” và còn flash)?
5. Có cần hỗ trợ **nhiều module cùng form trên một page** không? Nếu có, bắt buộc dùng module-scoped style id (mục 2.2).
