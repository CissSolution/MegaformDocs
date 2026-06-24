# PROMPT: Tạo MegaForm Template JSON Multi-Step (Premium Fixed)

> **Mục tiêu:** Sinh ra một file JSON template hoàn chỉnh, hợp lệ, có thể import/deploy ngay trong MegaForm (DNN/Oqtane/AspNetCore) với trải nghiệm **Multi-Step Wizard**.
> **Đầu ra duy nhất:** Một file JSON duy nhất. Không giải thích, không markdown wrapper, chỉ xuất JSON thuần.

---

## 1. NGUYÊN TẮC CỐT LÕI (BẮT BUỘC)

1. **Multi-step KHÔNG dùng `multiPage: true`.** MegaForm Premium-Fixed thực hiện multi-step hoàn toàn bằng **custom HTML + custom CSS + custom JavaScript** trong một form duy nhất.
2. **Mọi field thực tế PHẢI khai báo trong mảng `fields`.** Không được hardcode input trực tiếp trong `customHtml`. Input được render qua token `{{field:key}}`.
3. **Phải có cả hai biến thể casing** cho CSS và HTML: `customCss`/`CustomCss` và `customHtml`/`CustomHtml` (giá trị giống nhau 100%).
4. **CSS phải scoped** dưới class root duy nhất của template (vd `.my-form-scope`). Không dùng selector toàn cục.
5. **JS phải tự khởi tạo, idempotent, có guard tránh double-bind.** Sử dụng `data-*` flag để đảm bảo script chỉ chạy một lần.
6. **JSON phải valid:** dùng dấu nháy kép, escape newline/tab trong chuỗi, không có trailing comma.
7. **Tất cả key phải unique:** không trùng `key` giữa các field/row/section/html.

---

## 2. CẤU TRÚC JSON BẮT BUỘC

```json
{
  "version": "2.0",
  "slug": "<kebab-case-unique-id>",
  "title": "<Tiêu đề form>",
  "description": "<Mô tả ngắn gọn>",
  "category": "<contact|event|registration|survey|invitation|general|...>",
  "categories": ["<primary>", "<tag1>", "<tag2>", "premium"],
  "icon": "<emoji hoặc lucide icon name>",
  "submitButtonText": "<Nút submit>",
  "successMessage": "<Thông báo sau submit>",
  "settings": {
    "theme": "<theme-key>",
    "multiPage": false,
    "showProgressBar": true,
    "enableAutosave": true,
    "redirectOnSuccess": false,
    "allowMultipleSubmissions": false,
    "layout": "full-width",
    "customContent": {
      "hero_title": "...",
      "hero_subtitle": "...",
      "step_01_title": "...",
      "step_02_title": "...",
      "step_03_title": "...",
      "step_01_heading": "...",
      "step_01_desc": "...",
      "prev_btn_text": "Previous",
      "next_btn_text": "Continue",
      "submit_btn_text": "Submit",
      "footer_message": "..."
    },
    "customScripts": {
      "theme_selector": "(function(root,ctx){...})()",
      "step_nav": "\n(function(root){...})()"
    },
    "themeSelector": {
      "enabled": true,
      "mode": "module-controlled",
      "scriptKey": "theme_selector",
      "presetSet": "<slug>-themes",
      "defaultThemeKey": "<default-theme>",
      "showUpdateThemeButton": true,
      "presets": {
        "theme-key-1": {
          "name": "Theme Name",
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
    },
    "customCss": "<scoped CSS string>",
    "CustomCss": "<same as customCss>",
    "customHtml": "<root wrapper với progress, tabs, step panels, nav buttons>",
    "CustomHtml": "<same as customHtml>"
  },
  "fields": [ ... ],
  "customHtml": "<same as settings.customHtml>",
  "customCss": "<same as settings.customCss>",
  "content": { ... },
  "scripts": { ... },
  "rules": [],
  "workflow": null
}
```

---

## 3. CẤU TRÚC `fields` CHO MULTI-STEP

### 3.1 Tổ chức theo Row
Mỗi bước nên là một `Row` cha chứa các field con, hoặc các field đơn lẻ được nhóm bằng cách đặt trong panel HTML tương ứng.

```json
{
  "type": "Row",
  "key": "row_step_01",
  "columns": 2,
  "fields": [
    { "type": "Text", "key": "first_name", "label": "First Name", "required": true, "placeholder": "..." },
    { "type": "Text", "key": "last_name", "label": "Last Name", "required": true, "placeholder": "..." }
  ]
}
```

### 3.2 Các kiểu field được hỗ trợ

| Type | Required props | Optional props |
|------|----------------|----------------|
| `Text` | `key`, `label` | `placeholder`, `required`, `validation: { minLength, maxLength }` |
| `Email` | `key`, `label` | `placeholder`, `required` |
| `Phone` | `key`, `label` | `placeholder`, `required`, `format` ("us") |
| `Textarea` | `key`, `label` | `placeholder`, `required`, `rows` hoặc `properties: { rows: 4 }` |
| `Date` | `key`, `label` | `required` |
| `Select` | `key`, `label`, `options: [{value,label}]` | `placeholder`, `required`, `default` |
| `Radio` | `key`, `label`, `options: [{value,label}]` | `required`, `layout` ("horizontal"/"vertical") |
| `Checkbox` | `key`, `label`, `options: [{value,label}]` | `required`, `layout` ("horizontal"/"vertical"/"grid") |
| `File` | `key`, `label` | `required`, `accept`, `maxSize`, `multiple`, `description` |
| `Html` | `key` | `content` hoặc `htmlContent` (dùng `{{content:key}}`) |
| `Section` | `key`, `label` | `helpText` |
| `Row` | `key` | `columns` (number hoặc array `{span,fields}[]`) |

---

## 4. CUSTOM HTML CHO MULTI-STEP (BẮT BUỘC)

### 4.1 Bố cục bắt buộc

```html
<div class="<scope-root>" data-mf-script-root="theme_selector">
  <div class="<scope-content>">
    <div class="<scope-container>">
      <!-- Hero header -->
      <div class="<scope-hero>">
        <h1>{{content:hero_title}}</h1>
        <p>{{content:hero_subtitle}}</p>
      </div>

      <!-- Form card -->
      <div class="<scope-card>">
        <!-- Progress bar -->
        <div class="<scope-progress-track>">
          <div class="<scope-progress-bar>" style="width: 33.3333%"></div>
        </div>

        <!-- Step tabs -->
        <div class="<scope-step-tabs>">
          <button type="button" class="<scope-step-tab> <scope-active>" data-step-tab="1">
            <span class="<scope-tab-badge>">1</span>
            <span class="<scope-tab-title>">{{content:step_01_title}}</span>
          </button>
          ...
        </div>

        <!-- Step panels -->
        <div class="<scope-step-body>">
          <div class="<scope-step>" data-step="1" style="display:block">
            <h2>{{content:step_01_heading}}</h2>
            <p>{{content:step_01_desc}}</p>
            {{field:row_step_01}}
          </div>
          <div class="<scope-step>" data-step="2" style="display:none">
            ...
          </div>
          ...
        </div>

        <!-- Navigation buttons -->
        <div class="<scope-actions>">
          <button type="button" class="<scope-btn-prev>" style="display:none">{{content:prev_btn_text}}</button>
          <button type="button" class="<scope-btn-next>">{{content:next_btn_text}}</button>
          <button type="submit" class="<scope-btn-submit>" style="display:none">{{content:submit_btn_text}}</button>
        </div>
      </div>

      <p class="<scope-footer>">{{content:footer_message}}</p>
    </div>
  </div>
</div>
```

### 4.2 Quy tắc token

- Nội dung động từ `settings.customContent` hoặc `content`: `{{content:key}}`
- Render field/row từ mảng `fields`: `{{field:key}}`
- Tiêu đề form: `{{form:title}}`
- Mô tả form: `{{form:description}}`
- Nút submit: `{{form:submit}}`

---

## 5. CUSTOM JAVASCRIPT CHO STEP NAVIGATION (BẮT BUỘC)

Script `step_nav` PHẢI:

1. Chờ DOM sẵn sàng (poll tối đa 40 lần, mỗi lần 100ms).
2. Tìm container gần nhất có class scope-root. Nếu không có, query `document.querySelector`.
3. Đặt `container.dataset.stepBound = '1'` để tránh bind 2 lần.
4. Biến `currentStep` và `totalSteps` (tối thiểu 3, tối đa 5).
5. Hàm `render()`:
   - Hiện/ẩn step panel theo `data-step`.
   - Cập nhật width progress bar: `(currentStep / totalSteps) * 100%`.
   - Cập nhật class tab: active/completed/upcoming.
   - Hiện/ẩn Previous/Next/Submit buttons.
6. Hàm `validateStep(stepNum)`:
   - Kiểm tra các input/select/textarea bên trong step hiện tại có `required`.
   - Đánh dấu `.invalid` nếu thiếu, focus vào input đầu tiên lỗi.
   - Trả về `true/false`.
7. Event listeners cho Previous, Next, Submit.
8. Cho phép click tab để quay lại step đã hoàn thành, nhưng không nhảy tới step chưa hoàn thành.
9. Xử lý `Enter` key để trigger Next/Submit.

Ví dụ cấu trúc tối thiểu:

```js
(function(root){
  var attempts = 0, maxAttempts = 40;
  function init() {
    var container = root.closest ? root.closest('.scope-root') : null;
    if (!container) container = document.querySelector('.scope-root');
    if (!container) { if (++attempts < maxAttempts) setTimeout(init, 100); return; }
    if (container.dataset.stepBound === '1') return;
    container.dataset.stepBound = '1';

    var currentStep = 1, totalSteps = 3;
    function $(sel, el){ return (el||container).querySelector(sel); }
    function $$(sel, el){ return Array.prototype.slice.call((el||container).querySelectorAll(sel)); }

    function render(){ /* ... */ }
    function validateStep(n){ /* ... */ }

    $('.scope-btn-next').addEventListener('click', function(){
      if (!validateStep(currentStep)) return;
      if (currentStep < totalSteps) { currentStep++; render(); }
    });
    $('.scope-btn-prev').addEventListener('click', function(){
      if (currentStep > 1) { currentStep--; render(); }
    });
    $$('.scope-step-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        var target = parseInt(tab.getAttribute('data-step-tab'), 10);
        if (target < currentStep) { currentStep = target; render(); }
      });
    });

    render();
  }
  init();
})();
```

---

## 6. THEME SELECTOR (BẮT BUỘC)

- Cung cấp **ít nhất 4 preset** được nhóm theo vùng miền/phong cách (vd: French, Italian, American, German).
- Mỗi preset sử dụng **oklch()** cho colors.
- Các biến CSS trong scope-root phải khớp với key của preset: `--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`.
- Script `theme_selector` lấy `ctx.themePreset` và gán các CSS variables vào inline style của root element.

---

## 7. CHECKLIST TRƯỚC KHI XUẤT

- [ ] JSON parse được bằng `JSON.parse()` mà không lỗi.
- [ ] `settings.multiPage === false`.
- [ ] Có cả `customCss` + `CustomCss`, `customHtml` + `CustomHtml`, giá trị giống nhau.
- [ ] Có cả `customHtml` ở top-level (ngoài `settings`) và `customCss` ở top-level.
- [ ] Tất cả `key` trong `fields` là duy nhất.
- [ ] Mọi `{{field:key}}` trong HTML đều tồn tại trong `fields`.
- [ ] Mọi `{{content:key}}` trong HTML đều tồn tại trong `settings.customContent` hoặc `content`.
- [ ] Step navigation script có guard `data-step-bound`.
- [ ] Có ít nhất 3 step thực tế.
- [ ] Có progress bar và step tabs.
- [ ] Nút Previous/Next/Submit hiển thị đúng theo step.
- [ ] Có validation step trước khi chuyển bước.
- [ ] Có successMessage và submitButtonText.
- [ ] CSS scoped dưới class root, không ảnh hưởng trang bên ngoài.
- [ ] Không sử dụng `alert()` trong JS.

---

## 8. YÊU CẦU NGƯỜI DÙNG (Prompt variable)

Khi sử dụng prompt này, thay thế phần sau bằng mô tả cụ thể:

> "Tạo một MegaForm template JSON multi-step cho **[loại form]**, với chủ đề **[chủ đề/phong cách]**, gồm **[N] bước**: Bước 1 [mô tả], Bước 2 [mô tả], Bước 3 [mô tả]. Các field chính bao gồm: [liệt kê field]. Nút submit: [text]. Thông báo thành công: [text]."

---

## 9. VÍ DỤ MẪU NGẮN

Template `V0-celebration-rsvp-stepped.json` trong thư mục Premium-Fixed là ví dụ chuẩn: 3 bước, progress bar, tabs, theme selector 20 presets, scoped CSS `.cel-rsvp-stepped`, step navigation script `step_nav`.

---

## 10. OUTPUT FORMAT

**Chỉ xuất duy nhất nội dung JSON, không bọc trong markdown code block, không thêm lời giải thích.** File phải có thể lưu trực tiếp thành `.json` và import vào MegaForm.
