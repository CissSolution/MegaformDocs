# PROMPT: Clone chính xác template `V0-celebration-rsvp-stepped.json`

> **Mục tiêu:** Dùng AI tạo một MegaForm template JSON mới, **giữ nguyên chính xác cấu trúc, class name, logic step navigation, theme selector, responsive behavior** của template `V0-celebration-rsvp-stepped.json`, nhưng thay đổi **mục đích form, nội dung text, icon, hình nền, bộ theme presets, và các fields** cho phù hợp.
> **Đầu ra duy nhất:** File JSON hợp lệ, có thể lưu trực tiếp thành `.json` và import vào MegaForm.

---

## 1. NGUYÊN TẮC KHÔNG ĐƯỢC THAY ĐỔI

Bạn PHẢI giữ nguyên các yếu tố sau từ template gốc:

### 1.1 HTML structure & class names

- Root wrapper: `<div class="cel-rsvp-stepped" data-mf-script-root="theme_selector">`
- Các class chính phải giữ nguyên:
  - `crs-content`, `crs-container`
  - `crs-hero`, `crs-hero-icon`, `crs-hero-title`, `crs-hero-subtitle`
  - `crs-card`
  - `crs-progress-track`, `crs-progress-bar`
  - `crs-step-tabs`, `crs-step-tab`, `crs-tab-active`, `crs-tab-completed`, `crs-tab-upcoming`
  - `crs-tab-badge`, `crs-tab-title`
  - `crs-step-body`, `crs-step`, `data-step="1|2|3"`
  - `crs-step-header`, `crs-step-number`, `crs-step-heading`, `crs-step-desc`
  - `crs-fields`, `crs-row`
  - `crs-nav`, `crs-btn`, `crs-btn-prev`, `crs-btn-next`, `crs-btn-submit`
  - `crs-footer`
- Giữ nguyên cấu trúc 3 step: tabs, progress bar, step panels, navigation buttons.
- Giữ nguyên cách dùng token: `{{content:...}}`, `{{field:...}}`, `{{script:theme_selector}}`, `{{script:step_nav}}`.

### 1.2 JavaScript step navigation

Giữ nguyên toàn bộ logic `customScripts.step_nav`:

- Guard `data-crs-bound="1"` chống double-bind.
- Poll tối đa 40 lần, mỗi lần 100ms nếu chưa tìm thấy container.
- Biến `currentStep = 1`, `totalSteps = 3`.
- Hàm `render()`:
  - Hiện/ẩn `.crs-step` theo `data-step`.
  - Progress bar width = `(currentStep / totalSteps) * 100%`.
  - Cập nhật class tab: `crs-tab-active`, `crs-tab-completed`, `crs-tab-upcoming`.
  - Hiện/ẩn Previous/Next/Submit buttons.
- Hàm `validateStep(stepNum)`:
  - Validate required input/select/textarea.
  - Validate required radio groups.
  - Focus vào lỗi đầu tiên, gọi `reportValidity()`.
- Event delegation trên `.crs-btn-next`, `.crs-btn-prev`, `.crs-step-tab`.
- Click tab:
  - Nhỏ hơn currentStep: cho phép quay lại.
  - Lớn hơn currentStep: validate tất cả các step từ current đến target.
- Smooth scroll sau khi next.

### 1.3 Theme selector script

- Giữ nguyên cấu trúc `(function(root,ctx){...})()`.
- Lấy `ctx.themePreset` từ context.
- Áp dụng các biến CSS: `--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--border` (và tùy chọn `--input`, `--ring`).
- Đảm bảo default CSS variables trong `.cel-rsvp-stepped` khớp với theme default.

### 1.4 CSS structure

Giữ nguyên các khối CSS sau, chỉ thay đổi giá trị màu/ảnh/hình nền cho phù hợp mục đích mới:

- `@import` fonts: có thể thay font nhưng phải giữ 2 font family (serif display + sans-serif body).
- `.cel-rsvp-stepped` root variables và `background-image` (gradient overlay + hero image).
- `.crs-content`, `.crs-container` (max-width 672px).
- `.crs-hero`, `.crs-hero-icon`, `.crs-hero-title`, `.crs-hero-subtitle`.
- `.crs-card` với shadow và border-radius.
- `.crs-progress-track`, `.crs-progress-bar`.
- `.crs-step-tabs`, `.crs-step-tab` với 3 trạng thái active/completed/upcoming.
- `.crs-step-body`, `.crs-step-header`, `.crs-step-number`, `.crs-step-heading`, `.crs-step-desc`.
- `.crs-fields`, `.crs-row`.
- Style cho input/select/textarea: `background: var(--muted)`, `border: none`, `border-radius: 12px`, `padding: 14px 16px`, focus ring `box-shadow: 0 0 0 2px var(--primary)`.
- Style cho button-card radio (nếu có): grid 2-col hoặc 3-col, border, selected state.
- `.crs-nav`, `.crs-btn-prev`, `.crs-btn-next`, `.crs-btn-submit`.
- `.crs-footer`.
- PremiumFix overrides ở cuối file (có thể giữ nguyên hoặc bỏ nếu không cần, nhưng khuyến nghị giữ lại phần responsive safeties).

### 1.5 Top-level JSON structure

Giữ nguyên thứ tự và đầy đủ các key:

```json
{
  "version": "1.0",
  "slug": "...",
  "title": "...",
  "description": "...",
  "category": "...",
  "submitButtonText": "...",
  "successMessage": "...",
  "settings": {
    "theme": "pure-grid-premium",
    "multiPage": false,
    "customContent": { ... },
    "customScripts": { "theme_selector": "...", "step_nav": "..." },
    "themeSelector": { ... },
    "customCss": "...",
    "CustomCss": "...",
    "customHtml": "...",
    "CustomHtml": "..."
  },
  "fields": [ ... ],
  "customHtml": "...",
  "customCss": "...",
  "rules": [],
  "workflow": null,
  "categories": ["...", "with_sliders", "tailwindcss", "premium"]
}
```

---

## 2. NHỮNG GÌ ĐƯỢC PHÉP THAY ĐỔI

### 2.1 Mục đích & metadata

- `slug`: viết kebab-case, unique, phản ánh mục đích mới.
- `title`, `description`, `category`, `submitButtonText`, `successMessage`.
- `icon`: emoji hoặc tên icon.
- `categories`: tag phù hợp nhưng phải giữ `"with_sliders"`, `"tailwindcss"`, `"premium"`.

### 2.2 Nội dung (customContent)

Thay đổi tất cả text token:

```json
{
  "hero_title": "...",
  "hero_subtitle": "...",
  "step_01_title": "...",
  "step_02_title": "...",
  "step_03_title": "...",
  "step_01_heading": "...",
  "step_01_desc": "...",
  "step_02_heading": "...",
  "step_02_desc": "...",
  "step_03_heading": "...",
  "step_03_desc": "...",
  "prev_btn_text": "Previous",
  "next_btn_text": "Continue",
  "submit_btn_text": "...",
  "footer_message": "..."
}
```

### 2.3 Fields

- Thay đổi các field trong mảng `fields` cho phù hợp mục đích mới.
- Giữ tổng số step là **3**.
- Mỗi step hiển thị 2-5 field.
- Đảm bảo field `key` là duy nhất.
- Sử dụng các kiểu field: `Text`, `Email`, `Phone`, `Select`, `Radio`, `Checkbox`, `Textarea`, `Date`, `File`, `Html`, `Section`.
- Các field bắt buộc phải có `required: true`.
- Các field Radio dạng card button nên đặt trong row có class `crs-row-attendance` (2-col) hoặc `crs-row-meal` (3-col) trong HTML.

### 2.4 Hình nền & theme

- Thay đổi URL hình nền trong CSS `background-image` của `.cel-rsvp-stepped`.
- Thay đổi gradient overlay colors cho phù hợp hình nền mới.
- Thay đổi icon SVG trong `.crs-hero-icon` cho phù hợp mục đích.
- Thay đổi bộ theme presets: vẫn 20 presets hoặc ít nhất 6 presets, được nhóm theo French/Italian/American/German hoặc nhóm khác phù hợp.
- Mỗi preset dùng `oklch()` cho colors.
- `defaultThemeKey` phải tồn tại trong `presets`.

### 2.5 Fonts

- Có thể thay font chữ cho phù hợp phong cách mới, nhưng phải import đầy đủ weights.

---

## 3. HƯỚNG DẪN TỔ CHỨC 3 STEP

Mỗi step trong `customHtml` phải theo pattern:

```html
<!-- Step 1 -->
<div class="crs-step" data-step="1">
  <div class="crs-step-header">
    <span class="crs-step-number">01</span>
    <h2 class="crs-step-heading">{{content:step_01_heading}}</h2>
    <p class="crs-step-desc">{{content:step_01_desc}}</p>
  </div>
  <div class="crs-fields">
    <div class="crs-row">{{field:key_1}}</div>
    <div class="crs-row">{{field:key_2}}</div>
    ...
  </div>
</div>

<!-- Step 2 -->
<div class="crs-step" data-step="2" style="display:none">
  ...
</div>

<!-- Step 3 -->
<div class="crs-step" data-step="3" style="display:none">
  ...
</div>
```

Step 1 luôn `style="display:block"`, step 2 và 3 `style="display:none"`. Các field card-button radio nên có class `crs-row-attendance` (2 option) hoặc `crs-row-meal` (3 option).

---

## 4. THEME PRESETS STRUCTURE

```json
"themeSelector": {
  "enabled": true,
  "mode": "module-controlled",
  "scriptKey": "theme_selector",
  "presetSet": "<slug>-themes",
  "defaultThemeKey": "<default>",
  "showUpdateThemeButton": true,
  "presets": {
    "preset-key": {
      "name": "Preset Name",
      "group": "Group Name",
      "background": "oklch(...)",
      "foreground": "oklch(...)",
      "card": "oklch(...)",
      "primary": "oklch(...)",
      "primaryForeground": "oklch(...)",
      "secondary": "oklch(...)",
      "muted": "oklch(...)",
      "mutedForeground": "oklch(...)",
      "accent": "oklch(...)",
      "border": "oklch(...)"
    }
  }
}
```

**Lưu ý:** Giá trị default trong `.cel-rsvp-stepped` CSS variables phải khớp với `defaultThemeKey`.

---

## 5. CHECKLIST TRƯỚC KHI XUẤT

- [ ] JSON parse được bằng `JSON.parse()`.
- [ ] `settings.multiPage === false`.
- [ ] Có cả `customCss` + `CustomCss`, `customHtml` + `CustomHtml`, giá trị giống nhau.
- [ ] Có cả `customHtml` và `customCss` ở top-level (ngoài `settings`).
- [ ] Tất cả `key` trong `fields` là duy nhất.
- [ ] Mọi `{{field:key}}` trong HTML đều tồn tại trong `fields`.
- [ ] Mọi `{{content:key}}` trong HTML đều tồn tại trong `settings.customContent`.
- [ ] Step navigation script có guard `data-crs-bound` và poll logic.
- [ ] Đúng 3 step với progress bar, tabs, nav buttons.
- [ ] Theme selector có ít nhất 6 preset với `defaultThemeKey` hợp lệ.
- [ ] CSS variables default khớp với `defaultThemeKey`.
- [ ] Không có trailing comma trong JSON.
- [ ] Không dùng `alert()` trong JS.

---

## 6. CÁCH SỬ DỤNG PROMPT NÀY

Thay thế phần trong ngoặc bằng yêu cầu cụ thể:

> "Tạo một MegaForm template JSON mới bằng cách clone chính xác cấu trúc của `V0-celebration-rsvp-stepped.json`. Mục đích mới là **[mô tả mục đích, vd: đăng ký khóa học online]**. Form có 3 bước: Bước 1 [mô tả], Bước 2 [mô tả], Bước 3 [mô tả]. Các field cần có: [liệt kê]. Hình nền dùng [URL/theme]. Bộ theme presets theo phong cách [French/Italian/American/German hoặc khác]. Tiêu đề form: [title]. Nút submit: [text]. Thông báo thành công: [text]. Xuất duy nhất file JSON, không giải thích."

---

## 7. OUTPUT FORMAT

**Chỉ xuất duy nhất nội dung JSON, không bọc trong markdown code block, không thêm lời giải thích.** File phải có thể lưu trực tiếp thành `.json` và import vào MegaForm.
