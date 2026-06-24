# BÁO CÁO: Theme Selector Không Hiển Thị/Không Chạy Trên Oqtane

**Ngày rà soát:** 2026-06-19  
**Đường dẫn form JSON được rà soát:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\Premium-Fixed-ChipCards-Compact-20260619`  
**Source code:** `e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
**Phạm vi:** Chỉ rà soát và viết báo cáo — không sửa code.

---

## 1. Tóm tắt nhanh

Các theme selector trong form JSON **không hiển thị hoặc không có tác dụng trên Oqtane** do 4 nhóm nguyên nhân chính:

| Nhóm | Nguyên nhân | Mức độ ảnh hưởng |
|------|-------------|------------------|
| **A. UI điều kiện admin-only** | Selector UI chỉ hiển thị khi `_isAdmin && !_liveRenderMode`. Trên public/live mode, UI bị ẩn cố ý. | Cao — ngườ dùng cuối không bao giờ thấy selector. |
| **B. Thiếu nút Save Theme trên Oqtane admin dock** | `mf-oq-theme-preset-save` không tồn tại trong `RenderAdminDock` của `Index.razor`. Dù admin chọn theme, không thể lưu preset key vào module setting. | Cao — thay đổi theme bị mất sau reload. |
| **C. CSS variables mismatch** | Theme preset sinh ra các biến chuẩn (`--background`, `--primary`, ...). Nhiều form premium trong thư mục dùng biến riêng (`--auto-*`, `--fr-*`, `--ey-*`, `--mfp-*`, ...) hoặc hard-code màu → đổi preset không đổi giao diện. | Cao — selector chạy nhưng visually không thay đổi. |
| **D. themeSelector chưa được bật hoặc thiếu script token** | Nhiều file trong thư mục có `themeSelector.enabled=false` hoặc không có `{{script:theme_selector}}` trong `customHtml`. | Trung bình — một số form không bao giờ có selector. |

---

## 2. Luồng dữ liệu theme selector trên Oqtane

### 2.1. Server → client

1. **`MegaFormController.GetForm`** (dòng 258):
   - Đọc `SelectedThemePresetKey` từ module setting (`MegaForm:SelectedThemePresetKey`).
   - Gọi `ThemePresetInlineCssService.Build(resolved.SettingsJson, selectedPresetThemeKey, "#mf-form-wrapper-" + form.FormId)`.
   - Trả về `InitialInlineCss` trong `FormDto`.

2. **`MegaFormController.Schema`** (dòng 1337–1365):
   - Tương tự, trả về `InitialInlineCss` trong `SchemaResponse`.
   - `SettingsJson` là `resolvedRenderModel.SettingsJson` (đã qua `RenderModelResolver`).

3. **`Index.razor`** (dòng 1465):
   - `_initialInlineCss = form?.InitialInlineCss ?? string.Empty;`
   - Render ra `<style id="mf-inline-preset-@_formId">@_initialInlineCss</style>` (dòng 715–718).
   - CSS này **luôn render cho cả public và admin** (miễn form published).

### 2.2. Client renderer

- **Renderer mới** `MegaForm.UI/src/renderer/index.ts`:
  - `getThemePresetMeta()` đọc `settings.themeSelector` (dòng 942–965).
  - `createThemePresetRuntime()` tạo runtime `themePreset` chỉ khi `scriptKey` khớp và `enabled !== false` (dòng 971–1027).
  - `selectorEnabled = !!platform.allowThemePresetSelector && !config.isPreview` (dòng 978).
  - `renderCustomHtml()` thay `{{script:theme_selector}}` bằng hidden anchor (dòng 1122–1123).
  - `injectManagedCustomScripts()` chạy `settings.customScripts.theme_selector`, inject `ctx.themePreset` (dòng 1280–1288).

- **Script `theme_selector` trong form JSON**:
  - Nhận `ctx.themePreset`.
  - Chỉ append UI pill vào `document.body` khi `tp.selectorEnabled !== false`.
  - Khi chọn preset, gọi `tp.setActiveThemeKey(key, true)` → dispatch `mf:theme-preset-state`.
  - Đồng thời tự apply CSS variables lên scoped selector (thường là `.mfp.mfp-<tên>` hoặc wrapper).

### 2.3. Oqtane boot script lắng nghe sự kiện

- **`Index.razor` `BuildRendererBootScript()`** (dòng 2886–2929):
  - Đặt `platform.allowThemePresetSelector = _isAdmin && !_liveRenderMode`.
  - Đặt `platform.presetThemeKey = _selectedPresetThemeKey`.
  - Tìm `saveBtn = document.getElementById('mf-oq-theme-preset-save')`.
  - Lắng nghe `mf:theme-preset-state`, hiển thị và kích hoạt nút Save.
  - Nút Save POST đến `ModuleConfig/SaveStyle` để lưu preset key.

---

## 3. Rà soát 39 form JSON trong `Premium-Fixed-ChipCards-Compact-20260619`

### 3.1. Các form có theme selector được bật

20/39 form có `themeSelector.enabled = true` và `presets > 0`:

- `Rose_festival_row_based_OK.json` (6 presets)
- `V0-celebration-rsvp-simple.json` (17 presets)
- `V0-celebration-rsvp-stepped.json` (20 presets)
- `V0-invitation-ceremony-another-v20260419-06.json` (17 presets)
- `V0-invitation-ceremony-v6-v20260419-06.json` (17 presets)
- `V0job-application-form-v20260419-06.json` (16 presets)
- `american-auto-dealership-registration1.json` (6 presets)
- `american-realestate-french-style.json` (6 presets)
- `aurora-style-consultation.json` (6 presets)
- `botanical-volunteer-story.json` (5 presets)
- `cherry-blossom-festival-registration.json` (5 presets)
- `client-weekly-health-checkin.json` (5 presets)
- `coachella-festival-registration.json` (5 presets)
- `french-invitation-fixed-calendar.json` (6 presets)
- `french-product-consultation-form-fixed-final.json` (6 presets)
- `romantic-congratulations-event-form-fixed.json` (6 presets)
- `sweet-holiday-rose-garden.json` (6 presets)

### 3.2. Các form không có theme selector

19/39 form có `themeSelector.enabled = false` hoặc không có `themeSelector`:

`american-auto-dealership-registration.json`, `aurora-product-feedback.json`, `elegant-nature-job-application.json`, `euro-youth-application.json`, `festa-italiana-native.json`, `festa-italiana-registration.json`, `halloween-party-registration.json`, `invitation-ceremony-another.json`, `invitation-ceremony-v6.json`, `italian-law-firm-consultation.json`, `italian-romantic-experience-feedback.json`, `job-application-form.json`, `megaform-italian-romantic-fixed.json`, `megaform-multipurpose-usa.json`, `new-orleans-event-registration.json`, `product-consultation-form-fixed-english-slider-fictional-cities.json`, `pt-trainer-form-template.json`, `pt-trainer-modern-us-form.json`, `usa-training-course-registration-form-script-token-fixed-v2.json`, `wedding-scrapbook-story.json`, `worldcup-2026-event-registration-form-fixed-centered.json`.

### 3.3. Kiểm tra `{{script:theme_selector}}` trong customHtml

- Các form có `themeSelector.enabled=true` đều có token `{{script:theme_selector}}`.
- Một số form có `themeSelector.enabled=false` nhưng vẫn có token (ví dụ `invitation-ceremony-another.json`, `invitation-ceremony-v6.json`, `job-application-form.json`). Tuy nhiên vì `enabled=false`, `createThemePresetRuntime()` trả về `null`, script không chạy.

### 3.4. Kiểm tra CSS variables sử dụng trong customCss

Theme preset (và script `theme_selector`) sinh ra các biến chuẩn:
`--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`.

Phân loại form:

| Nhóm | Đặc điểm | Ví dụ |
|------|----------|-------|
| **Dùng đầy đủ biến chuẩn** | customCss dùng 12 biến chuẩn → preset đổi màu hiệu quả | `V0-celebration-rsvp-simple`, `V0-celebration-rsvp-stepped`, `V0-invitation-ceremony-*` |
| **Dùng một phần biến chuẩn** | customCss dùng 2–8 biến chuẩn, kết hợp biến riêng → preset đổi một phần | `Rose_festival_row_based_OK`, `V0job-application-form-v20260419-06`, `aurora-product-feedback`, `botanical-volunteer-story` |
| **Không dùng biến chuẩn** | customCss chỉ dùng biến riêng (`--auto-*`, `--fr-*`, `--ey-*`, ...) → preset không có tác dụng | `american-auto-dealership-registration1`, `american-realestate-french-style`, `coachella-festival-registration`, `french-invitation-fixed-calendar`, `french-product-consultation-form-fixed-final`, `client-weekly-health-checkin` |
| **Không dùng CSS var** | customCss hard-code màu hoặc dùng `background:` trực tiếp → preset không ảnh hưởng | `pt-trainer-modern-us-form.json` (không có var nào) |

**Kết luận phân tích CSS:** Ngay cả khi selector UI hiển thị và preset được apply, nhiều form premium sẽ **không đổi màu** vì `customCss` không tham chiếu các biến chuẩn của theme preset.

---

## 4. Chi tiết các nguyên nhân trên Oqtane

### 4.1. Nguyên nhân A: Selector UI chỉ hiện trong admin edit mode

**Dòng code:** `MegaForm.Oqtane.Client/Index.razor:2847` và `2895`:

```csharp
$"window.__MF_PLATFORM__.allowThemePresetSelector={(_isAdmin && !_liveRenderMode).ToString().ToLower()};"
...
allowThemePresetSelector = _isAdmin && !_liveRenderMode,
```

**Ý nghĩa:**
- `_isAdmin`: user đang đăng nhập và là admin.
- `!_liveRenderMode`: không phải chế độ live/public render (thường là edit mode).

**Hậu quả:**
- Người dùng cuối (public) không bao giờ thấy selector. Đây có thể là thiết kế mong muốn (admin chọn theme, public xem theme đã chọn).
- Nếu bạn test bằng tài khoản public hoặc xem trang live, selector sẽ không hiện.

### 4.2. Nguyên nhân B: Thiếu nút Save Theme

**Dòng code:** `MegaForm.Oqtane.Client/Index.razor:19–27`:

```razor
RenderFragment RenderAdminDock = @<div class="mf-oq-admin-dock">
    <button type="button" class="mf-oq-btn" @onclick="ToggleSettingsPanel"><i class="fas fa-cog"></i> Settings</button>
    <button type="button" class="mf-oq-linkbtn" @onclick="OpenBuilderPanel"><i class="fas fa-pen-ruler"></i> Form Builder</button>
    <button type="button" class="mf-oq-linkbtn" @onclick="OpenDashboardPanel">... Form Dashboard</button>
    @if (!IsFormMode && _formId > 0)
    {
        <button type="button" class="mf-oq-linkbtn" @onclick="OpenViewDesigner"><i class="fas fa-paintbrush"></i> Design Template</button>
    }
</div>;
```

**Vấn đề:** Không có `<button id="mf-oq-theme-preset-save">Update Theme</button>`.

**Hậu quả:**
- Boot script tìm `saveBtn = document.getElementById('mf-oq-theme-preset-save')` (dòng 2912).
- `saveBtn` là `null` → `syncThemePreset()` return sớm (dòng trong JS: `if(!saveBtn)return;`).
- Admin có thể thấy UI selector (nếu ở edit mode), chọn màu, DOM thay đổi tạm thời, nhưng **không thể lưu**.
- Sau reload, `_selectedPresetThemeKey` vẫn là giá trị cũ (hoặc default), CSS `InitialInlineCss` render lại theme cũ.

**Lưu ý:** File backup `Index.razor.bak.may24-revert-1781527067` từng có nút này, chứng tỏ đây là regression sau refactor admin dock tháng 6/2026.

### 4.3. Nguyên nhân C: CSS variables mismatch

**Cơ chế:**
- `ThemePresetInlineCssService.Build()` sinh CSS:
  ```css
  #mf-form-wrapper-{fid} { --background:...; --foreground:...; --primary:...; ... }
  ```
- Script `theme_selector` cũng sinh CSS tương tự lên scoped selector.

**Vấn đề:**
- Nhiều form premium dùng CSS variables riêng:
  - `american-auto-dealership-registration1.json`: `--auto-bg`, `--auto-card-bg`, `--auto-chrome`, ...
  - `american-realestate-french-style.json`: `--fr-border`, `--fr-champagne`, `--fr-charcoal`, ...
  - `coachella-festival-registration.json`: `--coachella-coral`, `--coachella-gold`, `--coachella-purple`, ...
  - `client-weekly-health-checkin.json`: `--health-primary`, `--health-card`, ...
- Các biến này **không được theme preset cập nhật**.
- Kết quả: selector chạy, biến chuẩn thay đổi, nhưng customCss vẫn đọc biến riêng → giao diện không đổi.

**Ví dụ cụ thể:**
- `american-auto-dealership-registration1.json` có 6 presets (`midnight-chrome`, `mustang-red`, ...) nhưng `customCss` dùng `--auto-*`. Theme preset không cập nhật `--auto-*` → đổi preset không đổi màu.

### 4.4. Nguyên nhân D: themeSelector chưa được bật

- 19/39 form có `themeSelector.enabled=false` hoặc không có cấu hình.
- Với những form này, `getThemePresetMeta()` return `null`, `createThemePresetRuntime()` return `null`.
- `injectManagedCustomScripts()` vẫn tìm anchor `{{script:theme_selector}}`, nhưng vì không có runtime, script tự chạy ở chế độ standalone (nếu có token). Tuy nhiên `selectorEnabled` sẽ là `false`, UI không hiện.

### 4.5. Nguyên nhân E: Có thể bị Blazor re-render xóa style tag

- Oqtane render `<style id="mf-inline-preset-@_formId">` trong Blazor component.
- Khi Blazor re-render (do state change), style tag có thể bị thay thế.
- Tuy nhiên, script `theme_selector` tạo style tag riêng (khác id) để apply preset runtime, nên vẫn giữ được sau re-render.
- Vấn đề này ít ảnh hưởng hơn các nguyên nhân A–D.

---

## 5. Kiểm tra nhanh trên trình duyệt (khuyến nghị)

Để xác nhận nguyên nhân thực tế, kiểm tra các điểm sau trên trang Oqtane:

1. **Xác nhận admin edit mode:**
   - Console: `window.__MF_PLATFORM__.allowThemePresetSelector` phải là `true`.
   - Nếu `false`, selector sẽ không hiện.

2. **Xác nhận nút Save tồn tại:**
   - DOM: `document.getElementById('mf-oq-theme-preset-save')` phải không null.
   - Nếu null, đây là nguyên nhân chính khiến theme không lưu được.

3. **Xác nhận script chạy:**
   - Console tìm log từ script `theme_selector`.
   - DOM tìm element có id kết thúc bằng `-ts-wrap` (ví dụ `rose-ts-wrap`).
   - Nếu không có, script không được inject (thiếu `{{script:theme_selector}}` hoặc `enabled=false`).

4. **Xác nhận CSS variables:**
   - Inspect element `.mfp.mfp-<tên>` hoặc `#mf-form-wrapper-{fid}`.
   - Kiểm tra computed values có dùng `--background`, `--primary`, ... hay chỉ dùng `--auto-*`, `--fr-*`, ...
   - Nếu customCss không dùng biến chuẩn, preset đổi không có tác dụng.

5. **Xác nhận API SaveStyle hoạt động:**
   - Nếu có nút Save, click và kiểm tra network request POST `/api/MegaForm/ModuleConfig/SaveStyle`.
   - Kiểm tra response trả về `selectedPresetThemeKey`.

---

## 6. Định hướng sửa chữa (không code)

### 6.1. Ngắn hạn — khôi phục chức năng Save Theme

1. **Thêm nút `mf-oq-theme-preset-save` vào `RenderAdminDock`** trong `MegaForm.Oqtane.Client/Index.razor`:
   ```razor
   <button type="button" class="mf-oq-btn" id="mf-oq-theme-preset-save" style="display:none;">
       <i class="fas fa-palette"></i> Update Theme
   </button>
   ```
   - Boot script đã có sẵn logic xử lý nút này (dòng 2912).
   - API `ModuleConfig/SaveStyle` đã tồn tại và hoạt động.

2. **Đảm bảo `allowThemePresetSelector=true` khi admin cần chỉnh theme**:
   - Hiện tại chỉ true khi `_isAdmin && !_liveRenderMode`.
   - Nếu muốn admin có thể chỉnh theme trong cả live preview, cần mở rộng điều kiện (ví dụ thêm query string `?mftheme=1`).

### 6.2. Trung hạn — chuẩn hóa CSS variables

3. **Tách design tokens và chuẩn hóa biến CSS**:
   - Các form premium nên dùng chung một tập biến chuẩn (`--background`, `--primary`, ...).
   - Hoặc theme preset phải sinh ra đúng các biến riêng (`--auto-primary`, `--fr-primary`, ...) mà customCss của từng template đang dùng.
   - Đề xuất: thêm `settings.designTokens` riêng và map các biến template-specific sang preset.

4. **Tách `themeSelector.presets` khỏi form JSON**:
   - Lưu presets trong template registry hoặc `MF_Theme_Presets`.
   - Form JSON chỉ giữ `themeSelector.enabled`, `defaultThemeKey`, `presetSet`.
   - Giảm kích thước JSON và tránh AI vô tình sửa presets.

### 6.3. Dài hạn — cải thiện UX

5. **Thêm UI chọn theme trong Settings panel**:
   - Hiện tại Settings panel đã xóa phần Appearance/Theme Preset (dòng 177 comment).
   - Có thể thêm lại dropdown chọn preset trong Settings, gọi `ModuleConfig/SaveStyle`.
   - Điều này thay thế hoặc bổ sung cho floating pill.

6. **Reload sau khi SaveStyle**:
   - Boot script hiện tại chỉ cập nhật DOM style tag sau save.
   - Nên reload trang hoặc cập nhật server-rendered `<style id="mf-inline-preset-...">` để đảm bảo consistency.

7. **Bật/mở theme selector rõ ràng cho từng form**:
   - Quyết định danh sách form premium nào thực sự cần theme selector.
   - Các form không cần nên set `themeSelector.enabled=false` và xóa `{{script:theme_selector}}` để tránh confusion.

---

## 7. Kết luận

Theme selector "không thấy trên Oqtane khi chạy" là kết quả của nhiều yếu tố chồng chéo:

1. **Về mặt chức năng:** UI selector bị giới hạn admin edit mode và **thiếu nút Save**, khiến admin không thể persist theme đã chọn.
2. **Về mặt thiết kế:** Nhiều form premium dùng CSS variables riêng, khiến theme preset (sinh biến chuẩn) không có tác dụng thị giác.
3. **Về mặt dữ liệu:** Gần một nửa số form trong thư mục chưa bật `themeSelector.enabled`.

Để khắc phục, cần:
- Khôi phục nút Save Theme trong Oqtane admin dock.
- Chuẩn hóa CSS variables hoặc map preset đúng với biến của từng template.
- Quyết định rõ ràng form nào có theme selector và đảm bảo `customHtml` + `customCss` tương thích.
