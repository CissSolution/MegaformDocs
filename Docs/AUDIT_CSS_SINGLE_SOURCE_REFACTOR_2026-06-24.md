# AUDIT — 2026-06-24 — CSS Single-Source Refactor (MegaForm DNN / Oqtane / Web)

**Ngày:** 2026-06-24  
**Phạm vi:** Toàn bộ luồng sinh, ghi và nạp CSS của MegaForm trên DNN, Oqtane, MegaForm.Web. Chỉ audit + thiết kế, **không code**.  
**Mục tiêu:** Một module MegaForm chỉ load CSS từ **một nguồn duy nhất**; server render một lần; JS public không đụng CSS; **module setting thắng** khi user chỉnh CSS, chọn preset, tạo form từ template.  
**Tài liệu liên quan:** `Docs/REFACTOR_PLAN_CSS_SINGLE_SOURCE_2026-06-24.md` (đã có, tập trung Oqtane). Audit này bổ sung bản đồ đầy đủ và thiết kế phủ DNN/Web theo đúng intent “module setting thắng”.

---

## 1. TL;DR

- Hiện tại **một module render có thể nạp CSS từ 5+ nguồn độc lập**: static `<link>`, server preset inline, server `customCss`, module `CssOverride`, client rebuild `#mf-custom-css-*`, client `installDisplayStyleSheet`, inline `!important` vars… → đây là nguyên nhân “apply 2 lần, không ổn định”.
- Oqtane đã gần đạt một nguồn nhờ SSR block `#mf-custom-css-*` + `data-mf-ssr="1"` + `SsrThemeGuard` [B252], nhưng vẫn còn block preset riêng `mf-inline-preset-*` và client vẫn rebuild nếu node không tồn tại.
- **DNN và MegaForm.Web chưa server-render CSS block**; JS renderer phải tự build theme → không thể bỏ JS đụng CSS nếu không sửa host.
- Đề xuất: thêm **module setting `MegaForm_ModuleCss` / `MegaForm:ModuleCss`** chứa CSS cuối cùng đã compose; host chỉ emit **một `<style id="mf-module-css-{moduleId}">`** và set `data-mf-ssr="1"`. JS public chỉ đọc, không sinh CSS.
- Form vẫn giữ `SchemaJson.settings.customCss` làm template/fallback, nhưng khi có module CSS thì **module setting thắng**.
- Các band-aid phiên này: **B251 block trong `megaform.css` giữ lại** (nó là single static source đúng), **runtime `installDisplayStyleSheet` bỏ**; **B252 `SsrThemeGuard` nâng thành thiết kế chính thức** (gate `data-mf-ssr="1"`, bỏ điều kiện node tồn tại).

---

## 2. Bản đồ nguồn CSS hiện tại (server + client)

### 2.1 Tầng lưu trữ

| Tầng | Key / Field | Lưu ở | Ghi bởi | Vai trò hiện tại |
|---|---|---|---|---|
| **Module setting** | `MegaForm_CssOverride` | DNN `ModuleSettings`, Oqtane `Setting` | Live Style Editor (`Form/SaveStyle`, `ModuleConfig/SaveStyle`) | CSS override per module, ưu tiên cao. |
| **Module setting** | `MegaForm_ThemeClass` | DNN / Oqtane ModuleSettings | `ModuleConfig/SaveStyle` | Class theme gắn vào wrapper. |
| **Module setting** | `MegaForm_SelectedThemePresetKey` / `SelectedThemePresetKey` | DNN / Oqtane ModuleSettings | `ModuleConfig/SaveStyle` | Chỉ lưu **key string** preset, không lưu CSS. |
| **Module setting** | `MegaForm_ExtraClass` | DNN / Oqtane ModuleSettings | `ModuleConfig/SaveStyle` | Được lưu nhưng **không render** ở DNN (orphan). |
| **Form schema** | `settings.customCss` / `CustomCss` | `FormInfo.SchemaJson` | `SaveTheme`, `SaveForm`, template import | CSS chính của form, theo form đi khắp nơi. |
| **Form settings** | `settings.customCss` / `CustomCss` | `FormInfo.SettingsJson` | `SaveTheme`, `SaveForm` | Bản duplicate của trên (RenderModelResolver đồng bộ). |
| **Form theme** | `ThemeJson` | `FormInfo.ThemeJson` | `SaveTheme` | Legacy, vẫn được renderer đọc qua `readThemePatch`. |
| **Static files** | `megaform.css`, `megaform-themes.css`, widgets, plugins | Disk / wwwroot | Build / deploy | Base layer; `megaform.css` chứa block MF-DISPLAY-STYLE [B251]. |

> **Lệch:** cùng một điều chỉnh màu có thể nằm ở `CssOverride` (module), `settings.customCss` (form), `ThemeJson`, hoặc `themeSelector.presets` (form). Hai module cùng trỏ một form sẽ khác màu nếu mỗi module có `CssOverride` khác nhau.

### 2.2 Server emission — first paint

#### Oqtane (`MegaForm.Oqtane.Client/Index.razor`)

| # | Output | File:line | Nguồn dữ liệu | Ghi chú |
|---|---|---|---|---|
| 1 | `<link> megaform.css` | `:1242` | File | Chứa base vars + block MF-DISPLAY-STYLE [B251]. |
| 2 | `<link> megaform-themes.css` | `:1244` | File | `.mf-theme-*` classes. |
| 3 | `<style id="mf-inline-preset-{id}">` | `:776-779` | `ThemePresetInlineCssService.Build(...selectedPresetKey...)` | Preset vars từ `settings.themeSelector`. |
| 4 | `<style id="mf-custom-css-{id}">` | `:780-787` | `_ssrCustomCss` = `customCss` + `ThemeFirstPaintCssService.BuildScopedThemeVarsCss` + `CustomShellCompatibilityCssService.AppendTo` | CSS chính SSR. |
| 5 | Wrapper classes `mf-theme-* mf-style-*` | `:1134` | `ThemeFirstPaintCssService.BuildWrapperRuntimeClasses` | Render vào class của `#mf-form-wrapper-{id}`. |
| 6 | `data-mf-ssr="1"` | `:1134` | `SsrMode` | Tín hiệu cho `SsrThemeGuard` [B252]. |

#### DNN (`MegaForm.DNN/Views/FormView.ascx` + `.cs`)

| # | Output | File:line | Nguồn dữ liệu | Ghi chú |
|---|---|---|---|---|
| 1 | `<link>` static CSS (megaform.css, themes, widgets…) | `FormView.ascx.cs:470-476` | `ClientResourceManager.RegisterStyleSheet` | Base. |
| 2 | `<style id="mf-inline-preset-{id}">` | `FormView.ascx:628-630` | `ThemePresetInlineCssService.Build(SettingsJson, SelectedThemePresetKey, ...)`, build ở `FormView.ascx.cs:843` | Preset vars. |
| 3 | Wrapper class `ThemeClass` + customHtml mode | `FormView.ascx:632` | `MegaForm_ThemeClass` | Class theme. |
| 4 | `<style id="mf-live-override">` | `FormView.ascx:716-718` | `MegaForm_CssOverride` | Module override. |
| 5 | **Không có `data-mf-ssr="1"`**, body fields empty | `FormView.ascx:658` | — | JS phải render fields + theme. |

#### MegaForm.Web (`MegaForm.Web/Views/Form/View.cshtml`)

| # | Output | File:line | Nguồn dữ liệu | Ghi chú |
|---|---|---|---|---|
| 1 | Static scripts/CSS | `:199-207` | Hard-coded | megaform.css không có block B251, version cũ hơn. |
| 2 | `<div id="mf-form-mount"></div>` | `:182` | Empty mount | **Không server-render body cũng không server-render CSS.** |
| 3 | Renderer boot inline | `:209-268` | `_MF_CONFIG` chứa schema + settingsJson + themeJson | Toàn bộ theme do client build. |
| 4 | **Không có `data-mf-ssr="1"`** | — | — | JS động tất cả. |

### 2.3 Client emission / re-application

| # | Function | File:line | Hành vi | Lý do flash / trùng |
|---|---|---|---|---|
| A | `applyFormPresentationSettings` | `MegaForm.UI/src/renderer/index.ts:261-324` | Xóa + rebuild `#mf-custom-css-{id}`, set inline `!important` vars, set theme class | **Đây là lần apply thứ hai**, ghi đè server block vì nó append vào `<head>` sau. |
| B | `applyThemeVarsToElement` (gọi từ A) | `:310`, định nghĩa `:355` | Đặt CSS vars `!important` trực tiếp lên wrapper | Thắng cả stylesheet, làm cho server block mất tác dụng. |
| C | `installDisplayStyleSheet` | `:758-905` | Inject `<style id="mf-display-style-rules">` | Trùng với block B251 trong `megaform.css`. |
| D | `renderCustomHtml` theme re-apply | `:1606-1633` | Gọi lại `applyFormPresentationSettings(settings)` sau khi set `data-mf-has-custom-html` | Lần apply thứ ba trên custom-HTML form. |
| E | `SsrThemeGuard` [B252] | `:269-283` | Early-return nếu `data-mf-ssr="1"` và node `#mf-custom-css-{id}` tồn tại | Chỉ Oqtane SSR hưởng lợi; điều kiện node tồn tại khiến default-theme form (không sinh node) vẫn bị rebuild. |
| F | `applyDisplayStyleClasses` | `:240-259` | Set `mf-style-radius-*`, `mf-style-shadow-*`, … lên wrapper | Nên do server render class; client chỉ cần gán nếu không SSR. |

### 2.4 Write paths — divergence ngay từ nguồn

| Endpoint | File:line | Ghi vào đâu | Vấn đề |
|---|---|---|---|
| `Form/SaveTheme` | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:616-688` | `form.ThemeJson`, `SchemaJson.settings`, `SettingsJson` | Fan-out 3 nơi; chỉnh sửa ở đâu đôi khi bị đè. |
| `Form/SaveTheme` (DNN) | `MegaForm.DNN/WebApi/MegaFormApiController.cs:618-680` | Tương tự Oqtane | Tương tự. |
| `Form/SaveForm` | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:334-429` | Lưu nguyên `SchemaJson`/`SettingsJson` | CSS nằm trong JSON. |
| `Form/SaveStyle` (Live Style Editor) | `MegaForm.DNN/WebApi/MegaFormApiController.cs:704-718` | `MegaForm_CssOverride` **module** | Override per module, không theo form. |
| `ModuleConfig/SaveStyle` | `MegaForm.DNN/WebApi/MegaFormApiController.cs:3575-3596` | `MegaForm_CssOverride`, `MegaForm_ThemeClass`, `MegaForm_SelectedThemePresetKey` module | Càng làm module vs form lệch nhau. |
| `ModuleConfig/SaveStyle` | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2637-2659` | `MegaForm:SelectedThemePresetKey` module | Chỉ lưu key, CSS vẫn phải build lại từ form JSON. |
| Template import / bulk create | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:~954`, `MegaForm.Core/Services/BuilderTemplateCatalogStore.cs:314-381` | Copy `customCss` vào `SchemaJson.settings` | Không ghi vào module setting. |
| Template import DNN | `MegaForm.DNN/WebApi/MegaFormApiController.cs:~2300` | Copy settings vào schema | Tương tự. |

---

## 3. Chỗ trùng / lệch chính → “apply 2 lần”

1. **Preset block + customCss block + theme class cùng set `--mf-primary`**: `mf-inline-preset-*` (Oqtane `Index.razor:776`) set `--mf-primary` không `!important`; ngay sau đó client `applyFormPresentationSettings` (`index.ts:314`) inject `#mf-custom-css-*` với `!important`, ghi đè → màu nhảy.
2. **DNN không SSR CSS body**: client luôn rebuild, không có `SsrThemeGuard` vì thiếu `data-mf-ssr="1"`.
3. **MegaForm.Web hoàn toàn client-render theme**: không có server block nào.
4. **Module `CssOverride` vs Form `customCss`**: hai nguồn cùng mục tiêu, không có quy tắc rõ ràng.
5. **`installDisplayStyleSheet` runtime vs B251 static**: cùng một bộ rule `.mf-style-radius-*`, inject 2 lần.
6. **Inline `!important` vars (`applyThemeVarsToElement`)**: đè lên cả server block, khiến server block trở thành “trang trí”.
7. **`renderCustomHtml` gọi lại `applyFormPresentationSettings`**: custom-HTML form bị apply theme 2 lần client-side.
8. **Custom-shell compat predicate lệch**: server Oqtane chỉ emit compat khi `hasCustomHtml`; client emit khi `customHtml || /mfp/.test(customCss)` (`index.ts:540`). Premium form có `.mfp` trong `customCss` nhưng không có `customHtml` sẽ mất bridge khi bỏ client.

---

## 4. Thiết kế 1 nguồn duy nhất

### 4.1 Chọn nơi lưu: module setting là single source

Theo đúng intent người dùng — “khi user điều chỉnh CSS, tạo mới form từ template, chọn CSS preset đều ghi vào nguồn này → tất cả theo module setting” — nguồn duy nhất phải là **module setting**, không phải form JSON.

Tuy nhiên form JSON (`SchemaJson.settings.customCss`) vẫn giữ vai trò **template / seed / fallback khi module chưa có CSS**. Nếu một form được dùng ở N module, mỗi module có thể có `ModuleCss` riêng; đó chính là “module setting thắng”.

| Nguồn | Vai trò mới |
|---|---|
| `MegaForm_ModuleCss` / `MegaForm:ModuleCss` | **Single source duy nhất** chứa CSS cuối cùng đã compose cho module. |
| `MegaForm_ModuleCssVersion` / `MegaForm:ModuleCssVersion` | Cache-bust token; bump khi CSS thay đổi. |
| `MegaForm_SelectedThemePresetKey` | Vẫn giữ làm “resolve-input”: chọn preset nào trong `settings.themeSelector.presets` để compose. |
| `SchemaJson.settings.customCss` | Template/fallback; seed khi module chưa có `ModuleCss`. |
| `MegaForm_CssOverride` | **Deprecated**; nội dung được merge vào `ModuleCss` trong quá trình migration. |
| `MegaForm_ThemeClass` | **Deprecated**; class tương đương được server ghi vào wrapper class list từ settings. |

> **Lưu ý:** “Module setting thắng” không có nghĩa là form mất CSS. Form vẫn mang theo CSS template; khi được gắn vào module, module compose ra CSS cuối và lưu lại. Copy form sang module khác thì module mới seed lại từ form.

### 4.2 Server composer: `ModuleCssComposer`

Một service duy nhất trên tất cả platform:

```text
ModuleCssComposer.Build(moduleId, formId, settings, selectedPresetKey)
  → [1] scopedThemeVars  (từ settings.themeCssOverrides/cssOverrides + premium aliases)
  → [2] presetVars       (từ settings.themeSelector.presets[selectedPresetKey], fold ThemePresetInlineCssService)
  → [3] authoredCustomCss (từ settings.customCss, hoặc legacy ThemeJson/SettingsJson nếu schema thiếu)
  → [4] customShellCompat (CustomShellCompatibilityCssService khi customHtml HOẶC `/mfp/.test(customCss + customHtml)`)
  → [5] moduleCssOverride (nếu vẫn cần transitional `MegaForm_CssOverride`, append cuối)
  → trả về 1 chuỗi CSS.
```

**Quy tắc ưu tiên trong block:** `[1] < [2] < [3] < [4] < [5]` (càng sau càng mạnh). Để đảm bảo `[2]` preset vẫn thắng base vars nhưng `[3]` customCss của author vẫn thắng preset khi cần, sử dụng source-order thay vì `!important` lung tung. Đối chiếu byte với Oqtane hiện tại trước khi triển khai.

### 4.3 Render contract: đúng 1 thẻ `<style>` + `data-mf-ssr="1"`

Tất cả host (Oqtane, DNN, Web) tuân thủ:

1. Đăng ký static links như cũ (`megaform.css` [B251], `megaform-themes.css`, widgets, plugins).
2. Trước wrapper, emit **duy nhất**:
   ```html
   <style id="mf-module-css-{moduleId}" data-mf-module-css-version="{version}">
   {ModuleCssComposer.Build(...)}
   </style>
   ```
3. Wrapper có `data-mf-ssr="1"`.
4. Không emit `mf-inline-preset-*`, `mf-custom-css-*`, `mf-live-override` nữa.

JS public khi thấy `data-mf-ssr="1"` sẽ **không** chạy bất kỳ đoạn nào sinh CSS (xem mục 5).

### 4.4 Module setting thắng — resolution order lúc compose

Khi compose CSS cho module:

1. Lấy `form.SettingsJson` / `SchemaJson.settings` làm base.
2. Áp dụng `MegaForm_SelectedThemePresetKey` module (nếu có) để chọn preset.
3. Nếu tồn tại `MegaForm_ModuleCss` (đã lưu) → **dùng trực tiếp** (module đã bị user chỉnh / đã seed), bỏ qua việc recompose từ form (trừ khi admin bấm “Reset to form default”).
4. Nếu chưa có `MegaForm_ModuleCss` → compose từ form + preset + override cũ, rồi lưu vào module setting (lazy migration).

Điều này đảm bảo: user chỉnh CSS → ghi vào `ModuleCss`; chọn preset → ghi vào `ModuleCss`; tạo form từ template → seed `ModuleCss` từ template; mọi render sau chỉ đọc `ModuleCss`.

---

## 5. JS cần gỡ / vô hiệu hóa + số phận các band-aid

### 5.1 JS public không được đụng CSS

| Hàm / đoạn code | File:line | Hành động |
|---|---|---|
| `applyFormPresentationSettings` phần theme rebuild | `index.ts:285-323` | **Vô hiệu khi `data-mf-ssr="1"`**. Chỉ giữ phần gán class `mf-hide-header` / display-style (`:264-267`) nếu host không render class sẵn; sau khi host render class đầy đủ thì giữ toàn bộ hàm dưới guard. |
| `applyThemeVarsToElement` | `index.ts:355-362` | **Xóa hoặc chỉ dùng trong builder preview**. Không inline vars lên wrapper nữa. |
| `installDisplayStyleSheet` | `index.ts:758-905` | **Xóa**. Static block B251 trong `megaform.css` đã đảm nhiệm. Các lệnh gọi `:1141`, `:3061`, `:3064` bỏ theo. |
| `renderCustomHtml` phần set theme class + re-apply | `index.ts:1620-1633` | **Xóa**. Server đã gán `data-mf-has-custom-html`, theme class và CSS block. Chỉ giữ phần inject HTML/shell. |
| `src/renderer/megaform-renderer.ts` (legacy) | Toàn file | **Xóa** + xóa build step, script tag trong DNN/Web. |
| Custom scripts đổi CSS runtime (vd. `party_theme` của template Fiesta Coral) | `fiesta-coral-party-rsvp.json` | **Không dùng** để apply CSS. Preset switcher chỉ gửi API save và reload/re-render. |

### 5.2 Band-aid phiên này

| Band-aid | Vai trò hiện tại | Quyết định |
|---|---|---|
| **B251** — block MF-DISPLAY-STYLE trong `megaform.css` (`:2909-2937`, generator `MegaForm.UI/scripts/gen-display-style-css.cjs`) | Đưa display-style rules ra static file để tránh FOUC, trong khi runtime vẫn inject duplicate. | **GIỮ** — đây chính là single static source mong muốn. Chỉ cần đảm bảo DNN/Web cũng dùng `megaform.css` mới nhất có block này. |
| **B252** — `SsrThemeGuard` (`index.ts:269-283`) | Skip client rebuild khi SSR. | **NÂNG THÀNH THIẾT KẾ CHÍNH THỨC**: guard chỉ cần `data-mf-ssr === '1'`, bỏ điều kiện node tồn tại. Nếu server đã hứa render CSS, client tin tưởng hoàn toàn. |
| `mf-inline-preset-*` separate block | Server preset CSS riêng. | **XÓA**, gộp vào `ModuleCssComposer` segment [2]. |
| `mf-custom-css-*` client style tag | Client rebuild theme. | **XÓA trên public**; chỉ builder preview dùng `mf-builder-theme-overrides`. |
| `mf-live-override` | Module CSS override. | **XÓA**, nội dung merge vào `ModuleCss` hoặc deprecated. |

---

## 6. Builder preview, preset switcher, DNN/Web, migration

### 6.1 Builder preview vẫn chạy

- Builder preview **không phải public form**; nó cần phản hồi tức thì khi user kéo slider đổi màu.
- Giữ nguyên `MegaForm.UI/src/builder/theme-tab-adapter.ts` (`flushPreview`, `mf-builder-theme-overrides`, `:877`, `:518-570`) — nhưng đảm bảo nó chỉ chạy khi `config.isPreview === true`.
- Khi user **Save / Publish** trong builder, server không chỉ lưu `SchemaJson.settings.customCss` mà còn phải **recompose và ghi `ModuleCss` vào module setting** của module đang edit (nếu context là module). Nếu builder mở từ Dashboard (không có module), chỉ lưu form schema.

### 6.2 Preset switcher

- Template Party RSVP (`fiesta-coral-party-rsvp.json`) hiện dùng `customScripts.party_theme` để đổi CSS vars runtime → vi phạm “JS không đụng CSS”.
- Thiết kế mới:
  1. Switcher UI vẫn hiển thị (render từ server hoặc từ một script **chỉ render DOM**, không set CSS).
  2. Khi user chọn preset, gửi POST `ModuleConfig/SaveStyle` với `selectedPresetThemeKey`.
  3. Server cập nhật `MegaForm_SelectedThemePresetKey`, recompose `ModuleCss`, lưu lại.
  4. **Reload page / re-render Blazor** để nạp CSS mới từ server.
- Trên Oqtane, đoạn inline script `BuildRendererBootScript` (`Index.razor:3308`) hiện lắng nghe `mf:theme-preset-state` và POST `ModuleConfig/SaveStyle`; phần này có thể giữ, nhưng sau save cần trigger re-render (hiện tại không có vì `mf-oq-theme-preset-save` button bị ẩn — xem `AUDIT_Oqtane_ThemeSelector_Not_Visible_2026-06-19.md`).

### 6.3 Phủ DNN

- Thêm `ModuleCssComposer.Build` vào `FormView.ascx.cs` (tương tự Oqtane `TryBuildSsrFormHtml`).
- Trong `FormView.ascx`, sau `mf-inline-preset-*` (hoặc thay thế bằng) emit:
  ```html
  <style id="mf-module-css-<%= ModuleId %>"><%= ViewModel.ModuleCss %></style>
  ```
- Wrapper thêm `data-mf-ssr="1"`:
  ```html
  <div id="mf-form-wrapper-<%= ViewModel.FormId %>" ... data-mf-ssr="1">
  ```
- DNN vẫn để JS render fields vào `mf-fields-container` — điều đó ổn vì JS không đụng CSS nữa.
- `MegaForm_CssOverride` + `MegaForm_ThemeClass` cũ: đọc để seed `ModuleCss` lần đầu, sau đó deprecated.

### 6.4 Phủ MegaForm.Web

- Trong `View.cshtml`, trước khi load scripts, emit:
  ```html
  <style id="mf-module-css-@Model.ModuleId">@Html.Raw(Model.ModuleCss)</style>
  <div id="mf-form-mount" data-mf-ssr="1"></div>
  ```
- Đảm bảo `megaform.css` được cập nhật lên phiên bản có block B251 và version query tương ứng.
- Renderer boot trong `View.cshtml:263` cần nhận `data-mf-ssr="1"` và không chạy CSS generators.

### 6.5 Migration form cũ

- **Lazy migration:** lần đầu module render sau deploy, nếu `MegaForm_ModuleCss` chưa có:
  1. Lấy `MegaForm_CssOverride` (nếu có).
  2. Lấy `MegaForm_ThemeClass` gán vào wrapper class.
  3. Lấy `MegaForm_SelectedThemePresetKey`.
  4. Compose từ form schema + preset + override.
  5. Lưu kết quả vào `MegaForm_ModuleCss` + bump version.
- **Eager migration (khuyến nghị):** chạy một lần job duyệt tất cả module MegaForm, compose và ghi `ModuleCss` cho module nào chưa có; báo cáo số lượng form có CSS chỉ nằm trong `SettingsJson`/`ThemeJson` mà không có trong `SchemaJson.settings` (Caveat G của refactor plan cũ).
- **Legacy `ThemeJson` / `SettingsJson.customCss`:** `ModuleCssComposer` fallback đọc các legacy key trước khi bỏ. Sau migration, chuẩn hóa về `SchemaJson.settings`.

---

## 7. Rủi ro / caveats

| # | Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|---|
| 1 | **Cascade-order thay đổi** khi gộp preset + vars + customCss vào 1 block. | Cao | Byte-test / screenshot-test trên 6 form mẫu (có và không có themeSelector) trước khi merge. |
| 2 | **DNN/Web chưa có `data-mf-ssr="1"`**; nếu vô hiệu JS CSS trước khi host emit block thì form trắng. | Cao | Triển khai theo thứ tự: host emit → thêm `data-mf-ssr="1"` → mới sửa client. |
| 3 | **Builder canvas / iframe preview khác runtime** nếu `ModuleCssComposer` C# và `theme-tab-adapter` TS không khớp. | Trung bình | Viết parity test hoặc dùng chung một CSS builder (C# port hoặc TS eval server). |
| 4 | **Form dùng ở nhiều module** sẽ có CSS khác nhau nếu mỗi module edit riêng — đúng intent “module setting thắng” nhưng có thể gây bất ngờ cho user quen “form mang theo CSS”. | Trung bình | UI rõ ràng: “Đang chỉnh CSS cho module này”; nút “Reset về CSS mặc định của form”. |
| 5 | **Custom scripts cũ đổi CSS runtime** (vd. `party_theme`) sẽ bị lỗi nếu không xóa. | Trung bình | Audit toàn bộ premium templates có `customScripts` động CSS; thay bằng save+reload. |
| 6 | **Cache của `MegaForm_CssOverride` / module settings** trong DNN `OutputCache` hoặc Oqtane site settings cache. | Thấp | Bump `ModuleCssVersion` khi ghi; query string `?v={version}` trên static links duy trì. |
| 7 | **Custom-shell compat predicate** nếu chỉ dùng `hasCustomHtml` sẽ làm premium form có `.mfp` trong CSS mà không có customHtml bị mất style. | Cao | Composer dùng predicate giống client: `customHtml || /mfp/.test(customCss + customHtml)`. |

---

## 8. Kế hoạch triển khai đề xuất (phases)

### Phase 0 — Chuẩn bị & kiểm thử parity
- Tạo `ModuleCssComposer` (C#) trong `MegaForm.Core`.
- Byte-test composer vs Oqtane hiện tại trên 6 form mẫu (Fiesta Coral, một form default, một form themeSelector, form 748 custom shell, v.v.).
- Audit toàn bộ premium templates có `customScripts` động CSS.

### Phase 1 — Oqtane
- Thêm module settings `MegaForm:ModuleCss`, `MegaForm:ModuleCssVersion`.
- `Index.razor`: emit `<style id="mf-module-css-{moduleId}">` từ composer; xóa `mf-inline-preset-*` và `mf-custom-css-*`; thêm `data-mf-ssr="1"`.
- Cập nhật `SaveTheme`/`SaveForm`/`SaveStyle` để recompose + ghi `ModuleCss`.
- Client: nâng B252 thành gate `data-mf-ssr="1"`, bỏ node-existence check; xóa runtime CSS inject.

### Phase 2 — DNN
- `FormView.ascx.cs`: thêm `ModuleCssComposer.Build`.
- `FormView.ascx`: emit single module CSS block, thêm `data-mf-ssr="1"`, bỏ `mf-live-override` / `mf-inline-preset-*`.
- Cập nhật `MegaForm.DNN/WebApi/MegaFormApiController.cs` save endpoints để ghi `MegaForm_ModuleCss`.
- Cập nhật `megaform.css?cdv` cache-bust hoặc dùng version query mới.

### Phase 3 — MegaForm.Web
- `View.cshtml`: emit module CSS block + `data-mf-ssr="1"`.
- Cập nhật controller để cung cấp `ModuleCss`.
- Đảm bảo `megaform.css` có block B251.

### Phase 4 — Write-paths & migration
- Template import, AI form creator, gallery apply → sau khi tạo form, nếu có module context thì seed `ModuleCss`.
- Preset switcher → save key + recompose `ModuleCss` + reload.
- Chạy eager migration module cũ; lazy migration cho module chưa chạm.
- Deprecated `MegaForm_CssOverride`, `MegaForm_ThemeClass`, `MegaForm_ExtraClass` (giữ đọc trong migration, không ghi mới).

### Phase 5 — Dọn dẹp
- Xóa `ThemePresetInlineCssService` (đã fold vào composer) hoặc giữ internal.
- Xóa `installDisplayStyleSheet`, `applyThemeVarsToElement`, dead `megaform-renderer.ts`.
- Xóa `mf-inline-preset-*`, `mf-custom-css-*`, `mf-live-override` khỏi tất cả views.
- Thêm parity test C# ↔ TS builder.

---

## 9. Quyết định cần người dùng

1. **Tên key module setting:** Dùng `MegaForm_ModuleCss` / `MegaForm:ModuleCss` hay một tên khác (vd. `MegaForm_CssSource`)?
2. **Scope đầu tiên:** Triển khai Oqtane trước (clean nhất) rồi DNN/Web, hay cần DNN song song?
3. **Preset switcher:** Giữ UX “chọn preset → reload page” hay chấp nhận một chút JS chỉ để gọi API rồi reload?
4. **Migration old override:** Có nên tự động merge `MegaForm_CssOverride` cũ vào `ModuleCss` khi deploy, hay để admin bấm “Import legacy override”?
5. **Fallback khi xóa module CSS:** Khi user xóa `ModuleCss`, form có fallback về CSS gốc của form không, hay trở về default?

---

## 10. Files cần chạm khi code (reference)

- `MegaForm.Core/Services/ModuleCssComposer.cs` *(new)*
- `MegaForm.Core/Services/ThemePresetInlineCssService.cs` *(fold hoặc internal)*
- `MegaForm.Core/Services/ThemeFirstPaintCssService.cs` *(tái sử dụng cho scoped vars)*
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs` *(dùng trong composer)*
- `MegaForm.Oqtane.Client/Index.razor` *(emit block + data-mf-ssr)*
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` *(save endpoints)*
- `MegaForm.DNN/Views/FormView.ascx` + `.cs` *(emit block + data-mf-ssr)*
- `MegaForm.DNN/WebApi/MegaFormApiController.cs` *(save endpoints)*
- `MegaForm.Web/Views/Form/View.cshtml` + controller *(emit block + data-mf-ssr)*
- `MegaForm.UI/src/renderer/index.ts` *(vô hiệu CSS inject trên public)*
- `MegaForm.UI/src/builder/theme-tab-adapter.ts` *(đảm bảo save ghi ModuleCss)*
- Premium templates có `customScripts` động CSS (vd. `fiesta-coral-party-rsvp.json`)

---

*Kết luận:* Muốn JS public “không làm gì cả” về CSS, bắt buộc phải chuyển toàn bộ composition lên server và host phải emit đúng một block CSS kèm `data-mf-ssr="1"`. Module setting `ModuleCss` là single source duy nhất; form JSON chỉ là seed. Việc này phủ DNN/Web cần sửa host views, nhưng không yêu cầu full SSR body — chỉ cần server-render CSS block.

---

## 11. QUYẾT ĐỊNH ĐÃ CHỐT (locked 2026-06-24)

Sau khi đối chiếu với `REFACTOR_PLAN_CSS_SINGLE_SOURCE_2026-06-24.md` (workflow) + 2 critique adversarial:

1. **1 nguồn = "Module CSS source" (per-module).** Vòng đời: module chưa có settings → **việc ĐẦU TIÊN là seed CSS gốc của form** (`settings.theme/themeCssOverrides/customCss`) vào nguồn module. Sau đó mọi đọc/ghi đi vào nguồn module; form JSON = template/seed. **Module thắng.**
2. **Lưu CSS NGUỒN (settings-level), KHÔNG lưu chuỗi đã framed.** Nguồn module giữ `{theme, themeCssOverrides, customCss}` (seed từ form). Phần **khung** (scoped vars `!important`, custom-shell compat với predicate rộng `customHtml || /mfp/.test(customCss+customHtml)`, alias premium) do **`ModuleCssComposer` compose LÚC RENDER**. → sửa composer (vd fix `.mfp` form 748) áp dụng ngay cho mọi module, **không stale, không re-migrate**.
3. **Render contract** (mọi host): đúng 1 `<style id="mf-module-css-{moduleId}">` + wrapper `data-mf-ssr="1"`. Xóa `mf-inline-preset-*` / `mf-custom-css-*` / `mf-live-override`.
4. **JS public:** gate `data-mf-ssr==='1'` → không sinh CSS (vẫn dựng body trên DNN/Web — KHÔNG cần SSR body). B251 giữ; B252 nâng chính thức (chỉ gate `data-mf-ssr`, bỏ điều kiện node tồn tại); gỡ `installDisplayStyleSheet` + `applyThemeVarsToElement` + dead `megaform-renderer.ts`.
5. **Scope: DNN + Oqtane SONG SONG** (Web sau).
6. **Reset module:** = **xóa nguồn module → lần render kế tiếp tự seed lại từ form**. Không cần cơ chế riêng; chỉ cần 1 nút/endpoint clear settings (làm cùng Phase ghi-settings).
7. **Form 748** (premium `.mfp` trong customCss, không customHtml): fix sẵn nhờ predicate rộng ở composer.

**Caveat critique đã hấp thụ:** A (DNN/Web chỉ cần CSS block, không cần body SSR — đúng), C (gate `data-mf-ssr` không phải `isPreview`), D (predicate `.mfp`), F (cascade-order → byte-test Phase 0), G (form cũ CSS nằm ngoài `SchemaJson.settings` → composer fallback đọc `SettingsJson`/`ThemeJson` khi seed; audit khi migrate), H (parity C#↔TS builder).

**Phase 0 (kế tiếp, chờ duyệt):** tạo `MegaForm.Core/Services/ModuleCssComposer.cs` (tái dùng `ThemeFirstPaintCssService` scoped-vars + `CustomShellCompatibilityCssService`, predicate rộng) → byte-test output vs Oqtane hiện tại trên 6 form mẫu (748 custom-shell, 1 default, 1 themeSelector, 2 premium, 1 standard) trước khi đụng host.

## 12. RE-AUDIT SAU KHI HOÀN THÀNH (bắt buộc — user yêu cầu 2026-06-24)

Sau khi code xong refactor, **chạy 1 audit lại** (workflow multi-agent) để xác nhận đã đạt mục tiêu:
- [ ] Mỗi form public chỉ còn **đúng 1** `<style id="mf-module-css-*">`; không còn `mf-inline-preset-*` / `mf-custom-css-*` / `mf-live-override` / `mf-display-style-rules` runtime trên public.
- [ ] JS public **không sinh/sửa CSS** (grep bundle: applyFormPresentationSettings theme block / applyThemeVarsToElement / installDisplayStyleSheet chỉ chạy khi `isPreview`/không `data-mf-ssr`).
- [ ] Form 748 + 5 form mẫu: theme đúng, **không flash** (so HTML thô + DOM sau hydrate).
- [ ] Cả Oqtane + DNN: cùng composer, output CSS giống nhau cho cùng form+settings.
- [ ] Module-wins: sửa CSS / chọn preset / template → ghi đúng nguồn module; form = seed.
- [ ] Không regression: diff theme-CSS served của ≥5 form trước/sau refactor.
- [ ] Builder preview vẫn theme đúng (gated `isPreview`).
- Ghi kết quả re-audit vào file mới `Docs/REAUDIT_CSS_SINGLE_SOURCE_<date>.md`.
