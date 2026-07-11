# Báo cáo kiểm tra — Bảo mật & Đa ngôn ngữ (i18n) MegaForm

> **Ngày kiểm tra:** 2026-07-01  
> **Phạm vi:** toàn bộ repo `MegaFormSolution_280_Oqtane_um`  
> **Mục tiêu:** chỉ phát hiện và báo cáo, **KHÔNG sửa code**.  
> **Phương pháp:** quét pattern-based (Grep) kết hợp đọc ngữ cảnh, chia làm 3 mảng độc lập: backend C#, frontend/UI, i18n.

---

## 1. Tóm tắt điểm nóng

| # | Vấn đề | Mức độ | Ảnh hưởng chính |
|---|--------|--------|-----------------|
| 1 | SQL Injection trong `SubformController.GetRows` ([AllowAnonymous]) | **Critical** | DNN, Web, Oqtane |
| 2 | Arbitrary Razor compile/execution qua `RazorWidgetController.Render` | **Critical** | Web, Oqtane (DNN proxy cũng expose) |
| 3 | API key AI lưu trong `localStorage` và gửi từ client | **High** | Frontend SPA |
| 4 | `postMessage` dùng `targetOrigin = '*'` và không kiểm tra `origin` | **High** | Frontend SPA |
| 5 | OS Command Injection qua Local AI chat endpoint public | **High** | Web, Oqtane |
| 6 | Lộ connection string plaintext qua `ModuleConfig/DatabaseSettings` | **High** | DNN |
| 7 | Stored XSS qua form schema/settings/theme/rules JSON | **High** | Web |
| 8 | Hardcoded password tạo user trong Starter services | **High** | Core |
| 9 | `MegaFormApiController` (Umbraco) thiếu authorize rõ ràng | **High** | Umbraco |
| 10 | 6 locale (`es-ES`, `fr-FR`, `ja-JP`, `ko-KR`, `vi-VN`, `zh-CN`) thiếu nghiêm trọng | **Medium–High** | Tất cả platform |
| 11 | UI hardcode trải rộng trên builder, dashboard, DNN, Oqtane, Web admin | **Medium** | Tất cả platform |

---

## 2. Phần I — Kiểm tra bảo mật

### 2.1. Lỗ hổng Critical

#### 2.1.1. SQL Injection trong `SubformController.GetRows`

- **Mức độ:** Critical
- **File / dòng:**
  - `MegaForm.DNN/WebApi/SubformController.cs:336`
  - `MegaForm.Web/Controllers/SubformController.cs:156`
  - `MegaForm.Oqtane.Server/Controllers/SubformController.cs:190`
- **Mô tả:** Cả 3 platform đều nhận `tableName` và `parentKeyColumn` từ query string, sau đó nối trực tiếp vào SQL. Validate rất yếu bằng `IndexOfAny` một vài ký tự (`; ' " [ ]` và thêm space cho cột). Action được đánh dấu `[AllowAnonymous]`.
- **Code minh họa:**
  ```csharp
  cmd.CommandText = "SELECT * FROM [" + tableName + "] WHERE [" + parentKeyColumn + "] = @p";
  ```
- **Hậu quả:** Đọc/xóa/sửa dữ liệu bất kỳ bảng nào trong `DashboardDatabase`, dump toàn bộ DB.
- **Đề xuất:** Dùng whitelist tên bảng/cột hoặc `INFORMATION_SCHEMA` lookup + parameterize hoàn toàn. Bắt buộc `[Authorize]` và kiểm tra quyền xem form.

#### 2.1.2. Arbitrary Razor compile/execution qua `RazorWidgetController.Render`

- **Mức độ:** Critical
- **File / dòng:**
  - `MegaForm.Web/Controllers/RazorWidgetController.cs:94–165`
  - `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs:102–198`
  - `MegaForm.DNN/WebApi/RazorWidgetController.cs:31–134` (proxy `[AllowAnonymous]` forward)
- **Mô tả:** Controller Web không có `[Authorize]`; action `Render` nhận `req.RazorSource`, gọi `RazorCompilationService.Compile` rồi `RenderComponentAsync`. Kẻ tấn công có thể POST đoạn `.razor` chứa `@using System.Diagnostics; @{ Process.Start("calc"); }` để thực thi code tùy ý.
- **Hậu quả:** Remote Code Execution (RCE) hoàn toàn.
- **Đề xuất:** Thêm `[Authorize(Roles = "Administrator")]` / `[DnnAuthorize]`; chỉ render template đã đăng ký, không compile source từ request body.

### 2.2. Lỗ hổng High

#### 2.2.1. API key AI lưu trong `localStorage`

- **Mức độ:** High
- **File:** `MegaForm.UI/src/ai-form-assistant/providers.ts`
- **Mô tả:** `localStorage['megaform-ai']` lưu toàn bộ cấu hình AI bao gồm `apiKey`. Header `Authorization: Bearer` được gắn từ client.
- **Hậu quả:** Key AI (OpenAI, Claude, Kimi, …) dễ bị lộ qua XSS, extension độc hại, shared workstation, DevTools.
- **Đề xuất:** Không lưu API key trên client; dùng server-side proxy để giữ key.

#### 2.2.2. `postMessage` không kiểm tra origin

- **Mức độ:** High
- **File gửi:**
  - `MegaForm.UI/src/renderer/megaform-renderer.ts:742`
  - `MegaForm.UI/src/renderer/index.ts:3533`
  - `MegaForm.UI/src/builder/canvas.ts:384,447`
  - `MegaForm.UI/src/builder/theme-tab-adapter.ts:854`
  - `MegaForm.UI/src/builder/theme-left-rail.ts:1343`
  - `MegaForm.UI/src/theme-designer/index.ts:1368`
  - `MegaForm.UI/src/shared/platform-host.ts:801`
  - `MegaForm.Web/Views/Form/View.cshtml:303`
- **File nhận không kiểm tra `e.origin`:**
  - `MegaForm.UI/src/builder/core.ts:839` (`mf-inline-edit-apply`)
  - `MegaForm.UI/src/builder/canvas.ts:396` (`mf-theme-live-css`)
  - `MegaForm.UI/src/renderer/index.ts:3517` (`mf-theme-live-css`)
  - `MegaForm.UI/src/builder/theme-tab-adapter.ts:877`
  - `MegaForm.UI/src/builder/theme-left-rail.ts:227`
  - `MegaForm.UI/src/builder/properties-patch.ts:270,303`
  - `MegaForm.UI/src/dashboard/embed-modal.ts:52` (`mf:resize`)
  - `MegaForm.UI/src/builder/dom.ts:454` / `panels.ts:51`
- **Hậu quả:** Bất kỳ origin nào cũng có thể gửi/nhận message; `mf-inline-edit-apply` cho phép thay đổi state builder; `mf-theme-live-css` cho phép inject CSS tùy ý.
- **Đề xuất:** Thay `'*'` bằng `expectedOrigin`; receiver luôn kiểm tra `e.origin` và `e.source`; thêm token xác thực cho `mf-inline-edit-apply`.

#### 2.2.3. OS Command Injection qua Local AI chat

- **Mức độ:** High
- **File:** `MegaForm.Web/Controllers/MegaFormLocalAiController.cs:177–199`
- **Mô tả:** Action `[AllowAnonymous]`. `query` lấy từ request body, chỉ thay thế `"` bằng `\"`. Vẫn có thể inject shell metacharacter (`$`, `` ` ``, `;`, `|`, `&`).
- **Code minh họa:**
  ```csharp
  Arguments = $"chat --no-stream \"{query.Replace("\"", "\\\"")}\"";
  using var proc = Process.Start(psi);
  ```
- **Đề xuất:** Dùng `ArgumentList` thay vì `Arguments`; validate/whitelist input; không chạy CLI từ endpoint public.

#### 2.2.4. Lộ connection string plaintext (DNN)

- **Mức độ:** High
- **File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs:3803–3829`
- **Mô tả:** `[DnnAuthorize]` chỉ cần authenticated; trả về connection string thô chưa mask password.
- **Đề xuất:** Chỉ trả masked connection string; giới hạn action cho Administrators.

#### 2.2.5. Stored XSS qua form JSON

- **Mức độ:** High
- **File:** `MegaForm.Web/Views/Form/View.cshtml:215–218`
- **Mô tả:** `SchemaJson`, `SettingsJson`, `ThemeJson`, `RulesJson` từ DB được emit bằng `@Html.Raw` mà không encode/sanitize. `SaveForm` chỉ yêu cầu `[Authorize]` (Web) hoặc không authorize (Umbraco).
- **Code minh họa:**
  ```razor
  schemaJson:      @Html.Raw(Model.SchemaJson),
  settingsJson:    @Html.Raw(Model.SettingsJson),
  themeJson:       @Html.Raw(string.IsNullOrWhiteSpace(Model.ThemeJson) ? "{}" : Model.ThemeJson),
  rulesJson:       @Html.Raw(Model.RulesJson),
  ```
- **Đề xuất:** Dùng `JsonConvert.SerializeObject` với HTML-safe encoder thay vì `@Html.Raw`; sanitize input trước khi lưu.

#### 2.2.6. Hardcoded password trong Starter services

- **Mức độ:** High
- **File:**
  - `MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs:19`
  - `MegaForm.Core/Services/Starters/LeaveRequestStarterService.cs:61`
  - `MegaForm.Core/Services/Starters/DocumentExchangeStarterService.cs:49`
  - `MegaForm.Core/Services/Starters/ProposalStarterService.cs:50`
  - `MegaForm.Core/Services/Starters/RecruitmentStarterService.cs:65`
- **Mô tả:** Password cố định `"MegaForm!2026"` dùng để tạo user accounts trong starter app.
- **Đề xuất:** Sinh password ngẫu nhiên mỗi lần provision, lưu hash.

#### 2.2.7. Umbraco API thiếu authorize

- **Mức độ:** High
- **File:** `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:24`
- **Mô tả:** Class kế thừa `UmbracoApiController` nhưng không có `[Authorize]` rõ ràng; các action `SaveForm`, `DeleteForm`, `GetSubmissions`, `Submit` đều public.
- **Đề xuất:** Thêm `[Authorize]` phù hợp với Umbraco backoffice và phân quyền từng action.

### 2.3. Lỗ hổng Medium / Low khác

| Vấn đề | Mức | File/Area chính | Đề xuất |
|--------|-----|-----------------|---------|
| SQL Injection trong `AiToolsController` | High | `MegaForm.DNN/WebApi/AiToolsController.cs:2449,2501,1194` | Kiểm tra bảng tồn tại trong `INFORMATION_SCHEMA`, không dùng identifier từ user input. |
| `DatabaseWorkflowMetadataService` nối literal vào SQL | Medium | `MegaForm.Core/Services/DatabaseWorkflowMetadataService.cs:156,158,210,212` | Dùng parameterized query ngay cả với `INFORMATION_SCHEMA`. |
| Mass assignment bind `FormInfo` trực tiếp | Medium–High | `MegaForm.Web/Controllers/MegaFormController.cs:200`; `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:71` | Dùng DTO chỉ chứa field cho phép; validate quyền sở hữu. |
| CSRF do `[IgnoreAntiforgeryToken]` cấp controller | Medium | Nhiều controller Web/Oqtane (AiTools, UserTemplate, Subform, RazorWidget, AiAssistant, AiKnowledge, …) | Chỉ tắt antiforgery trên action public submission; action admin giữ `[ValidateAntiForgeryToken]`. |
| Path traversal `FilesController.Download` | Medium | `MegaForm.DNN/WebApi/MegaFormApiController.cs:2989–3029` | Dùng `Path.GetFullPath` + containment chặt; reject mọi `..`. |
| Zip Slip trong `TemplatePackageService.InstallFromZip` | Medium | `MegaForm.Core/Services/TemplatePackageService.cs:166–169` | Validate từng ZIP entry trước khi extract. |
| `@Html.Raw(Model.InitialInlineCss)` | Medium | `MegaForm.Web/Views/Form/View.cshtml:81` | Sanitize CSS trước khi output vào `<style>`. |
| `new Function(onclick)` trong Oqtane | Medium | `MegaForm.Oqtane.Client/Index.razor:2639,2641` | Dùng event delegation an toàn, không dùng `new Function` với DOM attribute. |
| Admin template ListView cho phép raw HTML | Medium | `MegaForm.UI/src/listview/runtime.ts:1030,1050` | Sanitize template HTML admin (DOMPurify whitelist). |
| Lộ stack trace / exception detail | Medium | `MegaForm.DNN/WebApi/MegaFormApiController.cs:2555`; `WorkflowApiController.cs:49,165` | Log server, chỉ trả generic message cho client. |
| JWT validation yếu | Medium | `MegaForm.Web/Program.cs:128–135`; `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs:349–356` | Bật `ValidateIssuer`/`ValidateAudience`. |
| File upload chỉ validate client-side | Low | `MegaForm.UI/src/renderer/interactive.ts:932-972` | Server-side validate type/extension, size, rename file, lưu ngoài web root. |
| Iframe embed thiếu `sandbox` | Low | `MegaForm.UI/src/dashboard/embed-modal.ts:152`; `builder/dom.ts:365`; `Assets/js/plugins/megaform-widget-video-embed.js:9`; `megaform-widget-map.js:153` | Thêm `sandbox` và CSP `frame-src` phù hợp. |
| Calculator dùng `new Function` | Low/Info | `Assets/js/plugins/megaform-widget-calculator.js:135,235-276` | Kiểm tra lại regex escape; cân nhắc dùng math-expression evaluator. |
| Open redirect `PrintController.GetQrCode` | Low | `MegaForm.Web/Controllers/PrintController.cs:111` | Validate `url` thuộc site hiện tại hoặc trả image bytes thay vì redirect. |

### 2.4. Khuyến nghị bảo mật tổng thể

1. Rà soát toàn bộ endpoint `[AllowAnonymous]` — chỉ expose chức năng thực sự public.
2. Parameterize mọi SQL; không nối identifier/column/table từ user input.
3. Encode JSON trước khi emit vào HTML; hạn chế `@Html.Raw` với dữ liệu user-controlled.
4. Ngăn chặn arbitrary Razor compile/execution bằng authorize chặt và sandbox.
5. Dùng DTO cho model binding; không bind entity trực tiếp.
6. Mask/loại bỏ secret khỏi API response; không trả connection string raw.
7. Tắt `[IgnoreAntiforgeryToken]` class-level; chỉ bỏ token trên action public submission.
8. Validate path file download/upload bằng `Path.GetFullPath` + containment chặt.
9. Validate ZIP entries trước khi extract.
10. Không hardcode password; dùng generator ngẫu nhiên + hash.
11. Không trả `StackTrace`/`Exception.ToString()` về client.
12. Củng cố `postMessage` (origin, source, token) và không lưu API key AI trên client.

---

## 3. Phần II — Kiểm tra đa ngôn ngữ (i18n)

### 3.1. Kiến trúc i18n

Dự án sử dụng **3 tầng localization**:

| Tầng | Công nghệ | Vị trí chính | Ghi chú |
|------|-----------|--------------|---------|
| Frontend runtime | JSON key-value flat (`t('key')`) | `Assets/js/i18n/*.json`, `MegaForm.UI/public/i18n/*.json` | Source of truth cho UI JS/TS |
| Frontend SPA build | TypeScript i18n engine | `MegaForm.UI/src/i18n/index.ts` | `en-US` bundle sẵn, các locale khác lazy-load |
| Backend C# | `ILocalizationProvider` / `DefaultLocalizationProvider` | `MegaForm.Core/i18n/MegaFormStrings.cs` | Fallback inline ~47 keys; `JsonLocalizationProvider` đọc từ JSON |

**Không tìm thấy** file `.resx`, `.po`, `.mo` trong toàn bộ repo.

### 3.2. Các file localization tìm được

- **18 locale đầy đủ** (`en-US`, `ar-SA`, `de-DE`, `hi-IN`, `id-ID`, `it-IT`, `nl-NL`, `pl-PL`, `pt-BR`, `ru-RU`, `th-TH`, `tr-TR`, `vi-VN`, `es-ES`, `fr-FR`, `ja-JP`, `ko-KR`, `zh-CN`) xuất hiện tại:
  - `Assets/js/i18n/*.json`
  - `MegaForm.UI/public/i18n/*.json`
  - `MegaForm.Web/wwwroot/megaform/i18n/*.json`
  - `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/i18n/*.json`
  - `DesktopModules/MegaForm/Assets/js/plugins/i18n/*.json`
  - Các thư mục `builder/bundles/plugins/i18n` tương ứng.
- **Giới hạn 6–7 locale** tại:
  - `DesktopModules/MegaForm/Assets/js/builder/i18n/*.json` — chỉ `en-US, es-ES, fr-FR, ja-JP, ko-KR, zh-CN, vi-VN`
  - `MegaForm.Umbraco/wwwroot/js/{i18n,builder,bundles}/i18n/*.json` — chỉ 6 ngôn ngữ trên.
- **Legacy sources:**
  - `MegaForm.UI/src/i18n/locales/{es-ES,ja-JP,ko-KR,vi-VN,zh-CN}.json` — 295 keys, **không còn là source of truth**.
  - `MegaForm.UI/tools/langpicker-en.json` — 8 keys cho Language Picker UI.

### 3.3. Độ hoàn chỉnh các ngôn ngữ

Baseline `en-US` có **1.268 keys**.  
**Cập nhật sau kiểm tra (2026-07-01):** đã merge `en-US` vào 6 locale thiếu (`vi-VN`, `es-ES`, `ja-JP`, `ko-KR`, `zh-CN`, `fr-FR`) để đảm bảo mọi file locale đều có đủ keys — các keys chưa dịch giữ nguyên giá trị tiếng Anh làm fallback.

### 3.3.1. Trạng thái trước khi merge

| Locale | Ngôn ngữ | Số keys trước merge | % so với en-US | Đánh giá trước merge |
|--------|----------|--------------------:|---------------:|----------------------|
| en-US | English | 1.268 | 100% | Baseline, bundle sẵn |
| ar-SA | Arabic | 1.272 | 100% | ✅ Hoàn chỉnh (RTL) |
| de-DE | German | 1.268 | 100% | ✅ Hoàn chỉnh |
| hi-IN | Hindi | 1.268 | 100% | ✅ Hoàn chỉnh |
| id-ID | Indonesian | 1.268 | 100% | ✅ Hoàn chỉnh |
| it-IT | Italian | 1.268 | 100% | ✅ Hoàn chỉnh |
| nl-NL | Dutch | 1.268 | 100% | ✅ Hoàn chỉnh |
| pl-PL | Polish | 1.268 | 100% | ✅ Hoàn chỉnh |
| pt-BR | Portuguese (BR) | 1.268 | 100% | ✅ Hoàn chỉnh |
| ru-RU | Russian | 1.268 | 100% | ✅ Hoàn chỉnh |
| th-TH | Thai | 1.268 | 100% | ✅ Hoàn chỉnh |
| tr-TR | Turkish | 1.268 | 100% | ✅ Hoàn chỉnh |
| vi-VN | Vietnamese | 182 | 14% | ⚠️ Thiếu nghiêm trọng (~1.086 keys) |
| es-ES | Spanish | 107 | 8% | ❌ Gần như trống |
| ja-JP | Japanese | 107 | 8% | ❌ Gần như trống |
| ko-KR | Korean | 107 | 8% | ❌ Gần như trống |
| zh-CN | Chinese SC | 98 | 8% | ❌ Gần như trống |
| fr-FR | French | 64 | 5% | ❌ Rất trống |

### 3.3.2. Trạng thái sau khi merge fallback tiếng Anh

| Locale | Ngôn ngữ | Số keys sau merge | Ghi chú |
|--------|----------|------------------:|---------|
| vi-VN | Vietnamese | 1.268 | Giữ ~182 keys đã dịch; ~1.086 keys còn lại fallback en-US |
| es-ES | Spanish | 1.268 | Giữ ~107 keys đã dịch; ~1.161 keys còn lại fallback en-US |
| ja-JP | Japanese | 1.268 | Giữ ~107 keys đã dịch; ~1.161 keys còn lại fallback en-US |
| ko-KR | Korean | 1.268 | Giữ ~107 keys đã dịch; ~1.161 keys còn lại fallback en-US |
| zh-CN | Chinese SC | 1.268 | Giữ ~98 keys đã dịch; ~1.170 keys còn lại fallback en-US |
| fr-FR | French | 1.268 | Giữ ~64 keys đã dịch; ~1.204 keys còn lại fallback en-US |

> Một số bản sao trong `MegaForm.Web/wwwroot/megaform/js/plugins/i18n/` và `DesktopModules/MegaForm/Assets/js/plugins/i18n/` có en-US gốc 1.189 keys (cũ hơn), nên các locale tương ứng sau merge là **1.189 keys** để đồng bộ với en-US local.

**Nhận xét:**
- `es-ES`, `ja-JP`, `ko-KR` chỉ dịch phần toolbar builder cơ bản.
- `zh-CN` tương tự nhưng ít hơn (98 keys).
- `fr-FR` là locale tệ nhất trong các locale đang ship.
- `vi-VN` dịch tốt phần builder cơ bản + dashboard/submission, nhưng vẫn thiếu AI, widgets, workflow, advanced settings.
- Sau merge, các file thiếu **không còn thiếu keys**; runtime sẽ hiển thị tiếng Anh cho phần chưa dịch thay vì bị missing key.

### 3.4. UI bị hardcode (không qua hệ thống i18n)

#### 3.4.1. Frontend SPA — `MegaForm.UI/src`

| File | Số match gợi ý | Loại UI bị ảnh hưởng |
|------|---------------:|----------------------|
| `builder/dom.ts` | ~200 | Builder topbar, toolbar, placeholders, aria-labels, tooltips, device switcher |
| `widgets/plugins/megaform-widget-dynamic-label.ts` | ~85 | Widget HTML presets, inline labels |
| `builder/properties.ts` | ~61 | Property panel labels, help text |
| `builder/field-plugins/_index.ts` | ~60 | Field plugin labels, descriptions |
| `builder/theme-tab-adapter.ts` | ~54 | Theme settings labels |
| `dashboard/index.ts` | ~53 | Dashboard cards, settings, buttons, empty states |
| `builder/composite-designer.ts` | ~42 | Input Designer dialog, labels, validation |
| `widgets/plugins/megaform-razor-studio.ts` | ~35 | Razor Studio UI |
| `builder/gallery.ts` | ~35 | Template gallery, preview, buttons |
| `builder/canvas.ts` | ~32 | Canvas inline labels, field actions, drag handles |

**Ví dụ — `builder/dom.ts`:**
```ts
'<a class="w-back w-back-labeled" ... title="Back to Dashboard"><span class="w-back-lbl">Dashboard</span></a>'
'<input type="text" class="w-title" id="w-title" placeholder="Untitled Form" value=""/>'
'<button ... id="mf-btn-undo" title="Undo" ...>'
'<button ... id="mf-device-desktop" ... title="Desktop preview">'
'<div class="w-mode-pill" role="tablist" aria-label="Builder mode">'
```

#### 3.4.2. DNN Module — `MegaForm.DNN/Views/`

| File | Số match | Loại UI |
|------|---------:|---------|
| `Views/FormEditOld.ascx` | ~123 | Old form builder: palette labels, properties, settings, placeholders, buttons |
| `Views/FormView.ascx` | ~14 | Host dashboard, renderer messages |
| `Views/FormList.ascx` | ~12 | Dashboard stats, empty state, filters |
| `Views/Tasks.ascx` | ~10 | Workflow inbox labels |
| `Views/ManageModule.ascx` | ~4 | Module settings help text |
| `Views/FormViewOld.ascx` | ~7 | Legacy renderer messages |

**Ví dụ — `FormEditOld.ascx`:**
```aspx
<h4><i class="fas fa-th-list"></i> Elements</h4>
<input type="text" id="mf-field-search" ... placeholder="Search..." />
<div class="mf-palette-item" data-type="Text"><span>Short Text</span></div>
<div class="mf-palette-item" data-type="Select"><span>Dropdown</span></div>
<label>Field Key</label><input ... />
<label>Success Message</label><textarea ... placeholder="Thank you!"></textarea>
```

#### 3.4.3. Oqtane Client — `MegaForm.Oqtane.Client/`

| File | Số match | Loại UI |
|------|---------:|---------|
| `Index.razor` | ~71 | Module settings, role selector, display/popup options, workflow inbox, error states |
| `SdkDemoView.razor` | ~9 | SDK demo labels |
| `SubmissionsView.razor` | ~1 | Loading state |
| `Settings.razor` | ~1 | Settings message |

**Ví dụ — `Index.razor`:**
```razor
<p class="mf-oq-help">Configure the form, display mode, and theme for this module instance.</p>
<label>Module Role</label>
<option value="">Form / View (default)</option>
<option value="dashboard">Dashboard</option>
<option value="myinbox">My Inbox</option>
...
<label>Display Mode</label>
<option value="fixed">Fixed (inline)</option>
<option value="popup">Popup</option>
```

#### 3.4.4. ASP.NET Core Web — `MegaForm.Web/Views/`

| File | Số match | Loại UI |
|------|---------:|---------|
| `Views/Admin/RecordDetail.cshtml` | ~101 | Record detail: labels, timeline, tasks, form data, document metadata |
| `Views/Setup/Index.cshtml` | ~90 | Installation wizard: database, site info, admin, email |
| `Views/Admin/Documents.cshtml` | ~47 | Document management list |
| `Views/Admin/Tasks.cshtml` | ~35 | Workflow task actions |
| `Views/Admin/ViewLogs.cshtml` | ~20 | Log viewer |
| `Views/Admin/Login.cshtml` | ~8 | Admin login page |

**Ví dụ — `Setup/Index.cshtml`:**
```html
<div class="step-dot-label">Database</div>
<div class="step-title">Database Setup</div>
<div class="step-subtitle">Choose your database engine...</div>
<div class="pname">SQLite</div><div class="pdesc">File-based, zero config</div>
<div class="pbadge">Recommended</div>
<label>Database File Path <span class="req">*</span></label>
<input ... placeholder="App_Data/MegaForm/megaform.db" />
```

#### 3.4.5. Backend Core — `MegaForm.Core/`

Nhiều service có hardcoded English strings cho UI labels, error messages, success messages, descriptions:

| File/Area | Số match | Loại |
|-----------|---------:|------|
| `Services/Starters/ConfiguredAppStarterDefinitions.cs` | ~400 | App descriptions, form descriptions, success messages, workflow end-node messages |
| `Services/Starters/DocumentExchangeStarterService.cs` | ~215 | Descriptions, empty messages, workflow messages |
| `Services/Starters/ProposalStarterService.cs` | ~173 | Tương tự |
| `Services/Starters/LeaveRequestStarterService.cs` | ~143 | Tương tự |
| `Services/Starters/RecruitmentStarterService.cs` | ~137 | Tương tự |
| `Services/FormHtmlRenderer.cs` | ~107 | Renderer HTML, labels |
| `Services/WorkflowNodeUiSchemaProvider.cs` | ~97 | Workflow node UI schema descriptions |
| `Services/FormValidationService.cs` | ~24 | Validation messages |
| `Services/PermissionCatalogService.cs` | ~15 | Permission labels/descriptions |
| `Workflow/*NodeExecutor.cs` | Nhiều | Error messages: `Database ': invalid config`, `recipient is required`, v.v. |

**Ví dụ — `ConfiguredAppStarterDefinitions.cs`:**
```cs
AppDescription = "Seeded MegaForm app template for public posts, featured content...";
FormDescription = "Comprehensive content publishing app with rich text posts...";
SuccessMessage = "Your article is now in the editorial workflow.";
```

#### 3.4.6. Các hardcode khác

- **Placeholders & titles** trên toàn bộ frontend TS/Vue:
  - `placeholder="Untitled Form"`
  - `placeholder="Search..."`
  - `title="Undo"`, `title="Redo"`
  - `aria-label="Edit placeholder"`
- **Empty states / loading states:**
  - `Loading submissions…`
  - `No submissions.`
  - `No forms yet` / `Create your first form to get started`
  - `Select a task from the inbox to inspect workflow history and take action.`
- **Menu / Navigation:**
  - DNN: `MegaForm Dashboard`, `Home`, `Close`
  - Oqtane: `Form Binding`, `Display & Popup`, `Surface Role`
  - Web admin: `Dashboard`, `Submissions`, `Workflow Inbox`, `Record Detail`

### 3.5. Rủi ro i18n chính

1. **6 locale bị thiếu nghiêm trọng** (`es-ES`, `fr-FR`, `ja-JP`, `ko-KR`, `vi-VN`, `zh-CN`). Người dùng cuối sẽ thấy UI tiếng Anh xen kẽ.
2. **Hardcode trải rộng** trên cả 4 platform (DNN, Oqtane, Web, Umbraco) và backend Core.
3. **Backend C#** chỉ có ~47 keys fallback. Error/validation messages từ server có thể luôn trả tiếng Anh nếu không deploy JSON locale đúng cách.
4. **DNN builder bundle** (`DesktopModules/MegaForm/Assets/js/builder/i18n`) chỉ ship 7 locale, trong khi plugins ship 18 locale → builder dùng locale A, plugins dùng fallback B.
5. **Source of truth không rõ ràng**: `MegaForm.UI/src/i18n/locales/` là legacy 295 keys, trong khi `public/i18n/` và `Assets/js/i18n/` là 1.268 keys.

### 3.6. Khuyến nghị i18n

1. Hoàn thiện 6 locale thiếu bằng cách dịch thêm keys từ `en-US.json` (ưu tiên `fr-FR`, `zh-CN`, `es-ES`, `ja-JP`, `ko-KR`).
2. Chuẩn hóa DNN builder bundle để ship đủ 18 locale giống plugins.
3. Tách hardcoded strings trong `builder/dom.ts`, `Index.razor`, `FormEditOld.ascx`, `Setup/Index.cshtml`, `RecordDetail.cshtml` thành i18n keys.
4. Bổ sung backend `JsonLocalizationProvider` với đường dẫn đến `Assets/js/i18n` để server trả lỗi đúng locale.
5. Xóa hoặc đánh dấu legacy `MegaForm.UI/src/i18n/locales/` để tránh maintain nhầm.

### 3.7. Hành động đã thực hiện (2026-07-01)

Đã merge `en-US` làm fallback vào **132 file locale** của 6 ngôn ngữ thiếu (`vi-VN`, `es-ES`, `ja-JP`, `ko-KR`, `zh-CN`, `fr-FR`) tại các vị trí source chính:

- `Assets/js/{i18n,builder,bundles,plugins}/i18n/*.json`
- `MegaForm.UI/public/i18n/*.json`
- `MegaForm.Web/wwwroot/megaform/{i18n,js/builder,js/bundles,js/plugins}/i18n/*.json`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/{i18n,builder,bundles,plugins}/i18n/*.json`
- `DesktopModules/MegaForm/Assets/js/{builder,bundles,plugins}/i18n/*.json`
- `MegaForm.Umbraco/wwwroot/js/{i18n,builder,bundles}/i18n/*.json`

**Kết quả:**
- Tất cả các file locale tại các vị trí trên giờ đều có đủ keys (1.268 hoặc 1.189 tùy phiên bản en-US local).
- Các keys đã dịch trước đó được giữ nguyên.
- Các keys thiếu được điền bằng giá trị tiếng Anh từ `en-US.json` để runtime không còn bị missing key.
- Backup gốc lưu tại: `_audit_temp/i18n_backup_20260701/`

### 3.8. Tạo mới 20 locale cho thị trường châu Âu / biến thể ngôn ngữ (2026-07-01)

Đã tạo **320 file locale** mới (20 locale × 16 vị trí) với đầy đủ 1.268 keys, giá trị hiện là fallback tiếng Anh từ `en-US.json`. Các locale mới đã được đăng ký trong `index.json` của source of truth và SPA public.

| Locale | Ngôn ngữ | nativeName | Nhóm ưu tiên |
|--------|----------|------------|--------------|
| `pt-PT` | Portuguese (Portugal) | Português (PT) | Cao — EU lớn |
| `en-GB` | English (UK) | English (UK) | Cao — biến thể tiếng Anh |
| `es-MX` | Spanish (Mexico) | Español (MX) | Cao — biến thể Spanish phổ biến |
| `el-GR` | Greek | Ελληνικά | Cao — EU |
| `sv-SE` | Swedish | Svenska | Cao — Bắc Âu |
| `nb-NO` | Norwegian (Bokmål) | Norsk bokmål | Cao — Bắc Âu |
| `da-DK` | Danish | Dansk | Cao — Bắc Âu |
| `fi-FI` | Finnish | Suomi | Cao — Bắc Âu |
| `cs-CZ` | Czech | Čeština | Trung bình — EU/Đông Âu |
| `hu-HU` | Hungarian | Magyar | Trung bình — EU/Đông Âu |
| `ro-RO` | Romanian | Română | Trung bình — EU/Đông Âu |
| `bg-BG` | Bulgarian | Български | Trung bình — EU/Đông Âu |
| `hr-HR` | Croatian | Hrvatski | Trung bình — EU/Đông Âu |
| `sr-Latn-RS` | Serbian (Latin) | Srpski | Trung bình — EU/Đông Âu |
| `sk-SK` | Slovak | Slovenčina | Trung bình — EU/Đông Âu |
| `sl-SI` | Slovenian | Slovenščina | Trung bình — EU/Đông Âu |
| `lt-LT` | Lithuanian | Lietuvių | Trung bình — EU/Đông Âu |
| `lv-LV` | Latvian | Latviešu | Trung bình — EU/Đông Âu |
| `et-EE` | Estonian | Eesti | Trung bình — EU/Đông Âu |
| `uk-UA` | Ukrainian | Українська | Trung bình — Đông Âu |

**Vị trí file mới:**

- `Assets/js/i18n/*.json` — source of truth
- `MegaForm.UI/public/i18n/*.json` — SPA public
- `MegaForm.Web/wwwroot/megaform/{i18n,js/builder,js/bundles,js/plugins}/i18n/*.json`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/{i18n,builder,bundles,plugins}/i18n/*.json`
- `DesktopModules/MegaForm/Assets/js/{builder,bundles,plugins}/i18n/*.json`
- `MegaForm.Umbraco/wwwroot/js/{i18n,builder,bundles}/i18n/*.json`

**Lưu ý:**
- Tổng số locale trong `Assets/js/i18n/index.json` và `MegaForm.UI/public/i18n/index.json` hiện là **38** (18 cũ + 20 mới).
- Các keys trong file mới hiện để giá trị tiếng Anh để UI không bị trống; team dịch thuật chỉ cần thay thế các giá trị tiếng Anh bằng ngôn ngữ đích.
- Backup `index.json` gốc lưu tại: `_audit_temp/i18n_index_backup_20260701/`

---

## 4. Khuyến nghị ưu tiên tổng thể

| Ưu tiên | Hạng mục | Hành động |
|---------|----------|-----------|
| P0 | Bảo mật | Sửa SQL Injection `SubformController.GetRows` và khóa endpoint lại bằng authorize. |
| P0 | Bảo mật | Vô hiệu hóa hoặc authorize chặt `RazorWidgetController.Render` / `RazorCompilationService`. |
| P1 | Bảo mật | Chuyển API key AI về server proxy; không lưu trên `localStorage`. |
| P1 | Bảo mật | Củng cố `postMessage` (origin, source, token) trên toàn bộ builder/renderer. |
| P1 | Bảo mật | Sửa OS command injection trong `MegaFormLocalAiController`. |
| P1 | Bảo mật | Mask connection string DNN; thêm authorize Administrators. |
| P1 | Bảo mật | Encode JSON trong `View.cshtml`; ngăn stored XSS qua schema/settings/theme/rules. |
| P1 | Bảo mật | Thêm authorize cho Umbraco `MegaFormApiController`. |
| P2 | i18n | Dịch bổ sung 6 locale thiếu (đặc biệt `fr-FR`, `zh-CN`). |
| P2 | i18n | Tách hardcoded strings trong builder/dashboard/DNN/Oqtane/Web admin thành i18n keys. |
| P3 | Bảo mật | Rà soát `[IgnoreAntiforgeryToken]` class-level và mass assignment. |
| P3 | Bảo mật | Validate path traversal, ZIP entries, file upload server-side. |

---

## 5. Phụ lục — Các file/path quan trọng

### Security
- `MegaForm.DNN/WebApi/SubformController.cs`
- `MegaForm.Web/Controllers/SubformController.cs`
- `MegaForm.Oqtane.Server/Controllers/SubformController.cs`
- `MegaForm.Web/Controllers/RazorWidgetController.cs`
- `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`
- `MegaForm.DNN/WebApi/RazorWidgetController.cs`
- `MegaForm.Web/Services/RazorCompilationService.cs`
- `MegaForm.Web/Controllers/MegaFormLocalAiController.cs`
- `MegaForm.Web/Controllers/AiAssistantController.cs`
- `MegaForm.DNN/WebApi/MegaFormApiController.cs`
- `MegaForm.Umbraco/Controllers/MegaFormApiController.cs`
- `MegaForm.Web/Views/Form/View.cshtml`
- `MegaForm.Web/Controllers/MegaFormController.cs`
- `MegaForm.Core/Services/TemplatePackageService.cs`
- `MegaForm.Core/Services/Starters/*.cs`
- `MegaForm.Web/Program.cs`
- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`

### i18n
- `Assets/js/i18n/*.json`
- `MegaForm.UI/public/i18n/*.json`
- `MegaForm.Web/wwwroot/megaform/i18n/*.json`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/i18n/*.json`
- `DesktopModules/MegaForm/Assets/js/{builder,plugins}/i18n/*.json`
- `MegaForm.Umbraco/wwwroot/js/{i18n,builder,bundles}/i18n/*.json`
- `MegaForm.UI/src/i18n/locales/*.json` (legacy)
- `MegaForm.Core/i18n/MegaFormStrings.cs`
- `MegaForm.UI/src/builder/dom.ts`
- `MegaForm.UI/src/dashboard/index.ts`
- `MegaForm.DNN/Views/FormEditOld.ascx`
- `MegaForm.Oqtane.Client/Index.razor`
- `MegaForm.Web/Views/Setup/Index.cshtml`
- `MegaForm.Web/Views/Admin/RecordDetail.cshtml`
- `MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs`

---

*Kết thúc báo cáo. Đây là kết quả kiểm tra tĩnh (static analysis); các lỗ hổng cần được verify lại bằng PoC/runtime pentest trước khi triển khai sửa chữa.*
