# Hướng dẫn khắc phục: MegaForm Display Mode / View Mode không tự động áp dụng

> Tài liệu này giải thích tại sao các setting Display Mode, View Mode, Display & Popup của MegaForm Oqtane module không tự động inject button/sticky tab hay chuyển view mode khi chọn, và cách sửa.

---

## 1. Triệu chứng

- Chọn **Display Mode = Popup** nhưng không có popup xuất hiện.
- Chọn **Trigger Type = Click** hoặc **Time Delay** nhưng không tự động mở form.
- Copy-paste sample HTML "Sticky tab — left edge" vào page/module nhưng không mở được popup.
- Chọn **View Mode = List View / Submission Cards / Submission List** nhưng module vẫn hiển thị form, hoặc hiển thị trắng.
- Sau khi Save Settings, phải refresh tay mới thấy thay đổi.

---

## 2. Kiến trúc tổng quan

### 2.1. Setting lưu ở đâu

Module settings của Oqtane (`ISettingRepository`, entity `Module`). MegaForm lưu dưới các key:

| Key | Mô tả |
|-----|-------|
| `MegaForm:FormId` / `FormId` | Form ID được bind |
| `MegaForm:ViewConfig` / `ViewConfig` | **JSON blob** chứa `displayMode`, `viewMode`, cấu hình popup, template list/card/listview |
| `MegaForm:ModuleRole` / `ModuleRole` | Role cố định của module (`dashboard`, `builder`, `submissions`, ...) |
| `MegaForm:CssClass` / `CssClass` | CSS class thêm vào |
| `MegaForm:ModuleConfigured` | Flag đã config |

**Quan trọng:** `DisplayMode` và `ViewMode` **KHÔNG** là key riêng — chúng nằm bên trong JSON của `MegaForm:ViewConfig`.

### 2.2. Luồng đọc setting

- **Anonymous / public:** Chỉ đọc từ `ModuleState.Settings` (Oqtane cache).
- **Admin / authenticated:** Gọi API `GET /api/MegaForm/ModuleConfig/{moduleId}` để lấy config tươi.

### 2.3. Các file liên quan chính

- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
  - `SaveModuleConfig()` — lưu module config.
  - `BuildViewConfigForSave()` — serialize `ViewConfig` JSON.
  - `InvalidateSiteSettingsCache()` — invalidate cache.
- `MegaForm.Oqtane.Client/Index.razor`
  - `ApplyViewConfigFromJson()` — parse `ViewConfig` cho public.
  - `LoadAdminConfigAsync()` — parse config từ API cho admin.
  - `SaveInlineSettingsAsync()` — lưu inline settings từ UI.
  - `SampleButtonHtml`, `SampleStickyLeftHtml`, `SampleStickyRightHtml` — sinh sample HTML.
- `MegaForm.UI/src/renderer/megaform-renderer.ts`
  - Parse `displayMode`, `triggerType`, `clickSelector` từ JSON.
  - Xử lý popup behavior ở client.

---

## 3. Nguyên nhân gốc rễ

### 3.1. Các Display Mode "embed" và "slidein" chưa được implement

UI cho chọn 4 modes: `fixed`, `popup`, `embed`, `slidein`. Tuy nhiên:

- Server chỉ normalize thành `popup` hoặc `fixed`:
  ```csharp
  DisplayMode = string.Equals(config.DisplayMode, "popup", ...) ? "popup" : "fixed";
  ```
- Renderer JS cũng chỉ nhận diện `popup` vs còn lại là `fixed`.

**Hệ quả:** Nếu user chọn `embed` hoặc `slidein`, setting bị lưu thành `fixed`, UI vẫn hiển thị giá trị đã chọn cho đến lần load lại → tạo cảm giác setting bị ignore.

### 3.2. Không có auto-inject sticky tab / popup button

Hiện tại module **chỉ sinh sample HTML** trong settings panel để admin copy-paste. Không có code nào tự động chèn button/tab vào DOM public page khi `DisplayMode = popup`.

Sample snippets dùng attribute `data-mf-open-form="{formId}"`, nhưng default click selector của renderer là `.open-megaform-popup`.

**Hệ quả:** Ngay cả khi admin paste sample HTML, popup vẫn không mở nếu không đổi click selector.

### 3.3. Mismatch giữa sample trigger và default click selector

| Sample HTML | Default selector |
|-------------|------------------|
| `<button data-mf-open-form="56" ...>` | `.open-megaform-popup` |

Renderer chỉ bắt click theo selector được cấu hình. Nếu selector mặc định không khớp với sample HTML, trigger chết.

### 3.4. Inline save có thể xóa trắng view templates

`SaveInlineSettingsAsync()` trong `Index.razor` chỉ gửi một subset của `ModuleConfigDto`:

```csharp
new ModuleConfigDto {
    ModuleId = ...,
    FormId = _formId,
    ViewMode = _viewMode,
    ModuleRole = _moduleRole,
    DisplayMode = _displayMode,
    PopupSize = _popupSize,
    TriggerType = _triggerType,
    ...
}
```

Các field `ListFields`, `ListTemplate`, `CardFields`, `CardTemplate`, `ListViewSettingsJson`, `SelectedViewKey`, `ShowOncePerSession`, `CloseOnOverlay`, `StartAt`, `EndAt` bị omit.

**Hệ quả:** Khi đổi ViewMode qua inline panel, server ghi đè `ViewConfig` mới với các template fields rỗng → list/card/listview render trắng hoặc fallback về form.

### 3.5. Cache Oqtane chưa được invalidate đúng cách

Oqtane cache `ModuleState.Settings` trong `IMemoryCache`. Sau khi save setting:

- `MegaFormController.SaveModuleConfig()` gọi `_syncManager.AddSyncEvent(..., SyncEventActions.Refresh)`.
- Tuy nhiên code comment thừa nhận đây là "flash-fix" và có thể không xóa entry `IMemoryCache` trực tiếp.

**Hệ quả:** Anonymous user vẫn thấy config cũ cho đến khi app restart hoặc cache hết hạn. Đây là lý do chính khiến "Save xong vẫn là Form view".

### 3.6. Settings dialog không tự động reload page

`Settings.razor` lưu xong hiển thị: "Settings saved successfully. Refresh the page to see changes."

**Hệ quả:** User phải tự F5, và sau F5 vẫn có thể gặp lỗi cache ở mục 3.5.

---

## 4. Hướng dẫn khắc phục (cho developer/AI implement)

### 4.1. Làm rõ và hoàn thiện Display Mode

**Lựa chọn A — Implement đủ 4 modes (khuyến nghị nếu UI đã quảng cáo):**

1. Mở rộng `PopupDisplayConfig`/`DisplayMode` enum trong shared models để hỗ trợ: `fixed`, `popup`, `embed`, `slidein`.
2. Sửa `MegaFormController.SaveModuleConfig()` để không normalize `embed`/`slidein` thành `fixed`.
3. Sửa `megaform-renderer.ts` để xử lý 4 modes:
   - `fixed`: render form inline như hiện tại.
   - `popup`: render form ẩn, popup khi trigger.
   - `embed`: render form inline nhưng trong container có thể embed ở bất kỳ đâu (ví dụ iframe hoặc div target).
   - `slidein`: render form panel trượt từ cạnh màn hình.

**Lựa chọn B — Giấu các modes chưa implement:**

1. Trong `Settings.razor` và inline settings panel, chỉ hiển thị `fixed` và `popup`.
2. Nếu `ViewConfig` đã lưu `embed`/`slidein`, fallback về `fixed` khi load.

### 4.2. Auto-inject trigger element khi DisplayMode = popup

**Bước 1:** Thêm logic trong `Index.razor` hoặc renderer để render một phần tử trigger ẩn/sẵn trong markup.

Ví dụ khi `DisplayMode == "popup"`:
- Nếu `TriggerType == "click_trigger"` hoặc mặc định: render `<button class="mf-auto-popup-trigger" data-mf-open-form="{_formId}">Open</button>`.
- Nếu muốn sticky tab: render `<button class="mf-sticky-tab mf-sticky-tab-left" data-mf-open-form="{_formId}">Feedback</button>`.

**Bước 2:** Đảm bảo renderer đăng ký click handler cho selector khớp với auto-injected element, ví dụ:
```js
clickSelector = cfg.popup?.clickSelector || '[data-mf-open-form]';
```

**Bước 3:** Thêm CSS scoped cho `.mf-auto-popup-trigger` / `.mf-sticky-tab` để hiển thị đúng vị trí (fixed, bottom-right, left edge, v.v.).

### 4.3. Sửa default click selector khớp với sample HTML

**Lựa chọn A — Đổi default selector trong renderer:**

Trong `megaform-renderer.ts`, thay:
```ts
if (triggerType === 'click_trigger' && !clickSelector) clickSelector = '.open-megaform-popup';
```
Thành:
```ts
if (triggerType === 'click_trigger' && !clickSelector) clickSelector = '[data-mf-open-form]';
```

**Lựa chọn B — Đổi sample HTML trong settings panel:**

Trong `Index.razor`, sửa `SampleButtonHtml` và `SampleStickyLeftHtml`/`SampleStickyRightHtml` để dùng class `.open-megaform-popup` thay vì `data-mf-open-form`.

**Khuyến nghị:** Chọn A vì `data-mf-open-form` linh hoạt hơn khi một page có nhiều form.

### 4.4. Bảo toàn dữ liệu khi inline save

**Bước 1:** Trong `Index.razor`, trước khi gọi `SaveInlineSettingsAsync`, load config hiện tại từ API hoặc `_moduleViewConfigJson`.

**Bước 2:** Merge các field mới (DisplayMode, TriggerType, ViewMode, ...) vào config cũ, không overwrite toàn bộ.

**Bước 3:** Đảm bảo `ModuleConfigDto` gửi đi chứa đầy đủ:
- `ListFields`, `ListTemplate`
- `CardFields`, `CardTemplate`
- `ListViewSettingsJson`
- `SelectedViewKey`
- `ShowOncePerSession`, `CloseOnOverlay`
- `StartAt`, `EndAt`

**Bước 4:** Ở server, `SaveModuleConfig()` nên thực hiện **patch/merge** thay vì replace toàn bộ `ViewConfig` nếu một số field bị null.

### 4.5. Fix cache invalidate sau khi save

**Bước 1:** Mở `MegaFormController.InvalidateSiteSettingsCache()`.

**Bước 2:** Thêm xóa trực tiếp entry cache của Oqtane site state. Ví dụ:
```csharp
// Oqtane caches site state under keys like "site:{alias.Name}" or via SiteCache
// Find the actual cache key used by Oqtane's SiteRouter/AliasResolver and remove it.
```

**Bước 3:** Thêm log/debug để xác nhận cache đã bị xóa.

**Bước 4:** Đảm bảo `Settings.razor` reload page sau khi save, hoặc inline settings save callback reload module.

### 4.6. Tự động reload sau save

**Settings.razor:**
- Sau `SaveAsync()` thành công, gọi `NavigationManager.NavigateTo(NavigationManager.Uri, forceLoad: true)` để reload trang.

**Inline settings panel (`Index.razor`):**
- Sau khi `SaveInlineSettingsAsync()` thành công, gọi `LoadAdminConfigAsync()` lại để refresh state, hoặc reload toàn bộ page.

---

## 5. Quy trình test sau khi sửa

### 5.1. Test Display Mode

1. Mở một page có MegaForm module.
2. Mở module settings → chọn **Display Mode = Popup**.
3. Chọn **Trigger Type = Time Delay**, **Delay = 2 seconds**.
4. Save, reload page.
5. **Expected:** Sau 2 giây, popup tự động mở form.

### 5.2. Test auto-inject sticky tab

1. Chọn **Display Mode = Popup**, **Trigger Type = Click**.
2. Không paste sample HTML.
3. Save, reload page ở chế độ public (logout hoặc incognito).
4. **Expected:** Một sticky tab/button tự động xuất hiện ở cạnh màn hình, click vào mở popup.

### 5.3. Test View Mode

1. Có một form đã có submissions.
2. Chọn **View Mode = Submission List**.
3. Cấu hình `ListTemplate` và `ListFields`.
4. Save, reload page.
5. **Expected:** Module hiển thị danh sách submissions, không còn là form.

### 5.4. Test preserve template khi đổi setting khác

1. Cấu hình `ListTemplate` và `CardTemplate` cho Submission List / Submission Cards.
2. Save.
3. Đổi **Popup Size** hoặc **Trigger Type**.
4. Save lại.
5. **Expected:** `ListTemplate`/`CardTemplate` vẫn còn, không bị xóa trắng.

### 5.5. Test anonymous user thấy config mới

1. Save setting mới ở admin.
2. Mở page trong tab incognito/anonymous.
3. **Expected:** Anonymous user thấy đúng Display Mode / View Mode mới, không còn config cũ.

---

## 6. Lưu ý khi viết template/prompt

Nếu AI được yêu cầu tạo template contact form có map, hãy đảm bảo AI không bị lẫn lộn giữa:
- **Template form** (custom HTML + fields) — render form body.
- **Module display mode** (popup, inline, sticky tab) — do module settings điều khiển, không phải template.

Template chỉ cần cung cấp form body đẹp. Việc hiển thị dạng popup hay sticky tab là trách nhiệm của module settings + renderer.

---

## 7. Tài liệu tham khảo liên quan

- `Docs/PREMIUM_FORM_TEMPLATE_SPEC.md` — kiến trúc template MegaForm Premium.
- `Docs/PURE_GRID_FORM_TEMPLATE_SPEC.md` — kiến trúc template Pure Grid.
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` — save/load module config.
- `MegaForm.Oqtane.Client/Index.razor` — inline settings, view mode rendering.
- `MegaForm.UI/src/renderer/megaform-renderer.ts` — client-side popup/renderer logic.
