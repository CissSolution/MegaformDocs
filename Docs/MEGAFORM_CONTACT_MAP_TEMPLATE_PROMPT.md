# Prompt chuẩn: Tạo MegaForm Contact Template có Google Map bên cạnh Form

> Dùng prompt này để yêu cầu AI tạo template JSON MegaForm cho trang Contact Us, với Google Map nằm bên trái hoặc bên phải form body (không xếp chồng dọc).

---

## 1. Yêu cầu tổng quan

Tạo một file JSON template MegaForm Premium cho **Contact Page**:
- Google Map nằm **bên cạnh** form body (trái hoặc phải) trên desktop.
- Không được xếp map **trên/dưới** form body trên desktop.
- Sử dụng CSS variables và color presets theo chuẩn MegaForm Premium (oklch).
- Template phải render đúng trong cả builder lẫn trang public.

---

## 2. Vị trí lưu file

Sau khi tạo xong, AI phải lưu file vào **cả 2 vị trí**:

```
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Web\App_Data\MegaForm\Templates\
```

và

```
E:\DNN_SITES\OqtaneSites\Oqtane_new\App_Data\MegaForm\Templates\contact-forms\
```

Tên file đề xuất: `v0-contact-map-{left|right}-{style-family}.json`

---

## 3. Cấu trúc JSON bắt buộc

### 3.1. Top-level envelope

```json
{
  "version": "1.0",
  "slug": "v0-contact-map-left-corporate",
  "title": "Contact Us - Map Left, Corporate",
  "description": "Premium contact page with Google Map on the left, form body on the right. Corporate color presets.",
  "category": "contact",
  "categories": ["contact", "with_map", "tailwindcss", "premium"],
  "icon": "🗺️",
  "submitButtonText": "Send Message",
  "successMessage": "Thank you for reaching out. We'll get back to you as soon as possible.",
  "settings": { ... },
  "fields": [ ... ],
  "customHtml": "<div class='mfp mfp-contact-split mfp-map-left' data-mf-script-root='theme_selector'>...</div>",
  "customCss": "@import url(...); .mfp.mfp-contact-split { ... }",
  "rules": [],
  "workflow": null
}
```

**Lưu ý quan trọng:** `settings.customHtml`, `settings.customCss`, `settings.CustomHtml`, `settings.CustomCss` phải là bản sao của top-level `customHtml`/`customCss`.

### 3.2. settings object

```json
"settings": {
  "theme": "pure-grid-premium",
  "multiPage": false,
  "customContent": {
    "brand_title": "Get in Touch",
    "brand_subtitle": "We'd love to hear from you. Send us a message and we'll respond as soon as possible.",
    "section_label": "Send a Message",
    "map_embed_url": "https://www.google.com/maps/embed?pb=...",
    "contact_address": "123 Business Ave, Suite 100\nNew York, NY 10001",
    "contact_phone": "+1 (555) 123-4567",
    "contact_email": "hello@example.com",
    "submit_btn_text": "Send Message",
    "footer_message": "We typically reply within 1–2 business days."
  },
  "customScripts": {
    "theme_selector": "(function(root,ctx){ ... })()"
  },
  "themeSelector": {
    "enabled": true,
    "mode": "module-controlled",
    "scriptKey": "theme_selector",
    "presetSet": "contact-split-themes",
    "defaultThemeKey": "executive-navy",
    "showUpdateThemeButton": true,
    "presets": { ... }
  },
  "customHtml": "<same as top-level customHtml>",
  "CustomHtml": "<same as top-level customHtml>",
  "customCss": "<same as top-level customCss>",
  "CustomCss": "<same as top-level customCss>"
}
```

### 3.3. fields[] — kiến trúc chuẩn

Phải dùng **Row** container cho layout cột. Không để field phẳng nếu muốn 2 cột.

```json
[
  {
    "key": "row_full_name",
    "type": "Row",
    "columns": [
      { "span": 12, "fields": [
        { "key": "full_name", "type": "Text", "label": "Full Name", "required": true, "placeholder": "Your full name" }
      ]}
    ]
  },
  {
    "key": "row_contact",
    "type": "Row",
    "columns": [
      { "span": 6, "fields": [
        { "key": "email", "type": "Email", "label": "Email Address", "required": true, "placeholder": "you@example.com" }
      ]},
      { "span": 6, "fields": [
        { "key": "phone", "type": "Phone", "label": "Phone Number", "required": false, "placeholder": "+1 (555) 000-0000" }
      ]}
    ]
  },
  {
    "key": "row_company",
    "type": "Row",
    "columns": [
      { "span": 12, "fields": [
        { "key": "company", "type": "Text", "label": "Company / Organization", "required": false, "placeholder": "Acme Inc." }
      ]}
    ]
  },
  {
    "key": "row_subject",
    "type": "Row",
    "columns": [
      { "span": 12, "fields": [
        {
          "key": "subject",
          "type": "Select",
          "label": "How can we help?",
          "required": true,
          "options": [
            { "value": "", "label": "Select a topic", "disabled": true },
            { "value": "general", "label": "General Inquiry" },
            { "value": "sales", "label": "Sales" },
            { "value": "support", "label": "Technical Support" },
            { "value": "feedback", "label": "Feedback" },
            { "value": "other", "label": "Other" }
          ]
        }
      ]}
    ]
  },
  {
    "key": "row_message",
    "type": "Row",
    "columns": [
      { "span": 12, "fields": [
        { "key": "message", "type": "Textarea", "label": "Message", "required": true, "placeholder": "Tell us how we can help you...", "properties": { "rows": 5 } }
      ]}
    ]
  },
  {
    "key": "row_preferred_contact",
    "type": "Row",
    "columns": [
      { "span": 12, "fields": [
        {
          "key": "preferred_contact",
          "type": "Radio",
          "label": "Preferred contact method",
          "required": false,
          "options": [
            { "value": "email", "label": "Email" },
            { "value": "phone", "label": "Phone" }
          ],
          "defaultValue": "email"
        }
      ]}
    ]
  },
  {
    "key": "row_newsletter",
    "type": "Row",
    "columns": [
      { "span": 12, "fields": [
        {
          "key": "newsletter",
          "type": "Checkbox",
          "label": "Keep me updated with news and offers",
          "required": false,
          "options": [
            { "value": "yes", "label": "Subscribe to newsletter", "selected": false }
          ]
        }
      ]}
    ]
  }
]
```

### 3.4. customHtml skeleton chuẩn

```html
<div class="mfp mfp-contact-split mfp-map-left" data-mf-script-root="theme_selector">
  <div class="mfp-bg"></div>
  <div class="mfp-overlay"></div>
  <div class="mfp-content">
    <div class="mfp-split-grid">
      <aside class="mfp-map-col">
        <div class="mfp-map-wrap">
          <iframe class="mfp-map-iframe" src="{{content:map_embed_url}}" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
        <div class="mfp-contact-info">
          <h3 class="mfp-contact-title">Visit Us</h3>
          <p class="mfp-contact-line mfp-contact-address">{{content:contact_address}}</p>
          <p class="mfp-contact-line"><strong>Phone:</strong> {{content:contact_phone}}</p>
          <p class="mfp-contact-line"><strong>Email:</strong> {{content:contact_email}}</p>
        </div>
      </aside>
      <section class="mfp-form-col">
        <div class="mfp-card">
          <header class="mfp-header">
            <h1 class="mfp-title">{{content:brand_title}}</h1>
            <p class="mfp-lead">{{content:brand_subtitle}}</p>
          </header>
          <div class="mfp-section">
            <h2 class="mfp-section-label">{{content:section_label}}</h2>
            <div class="mfp-fields">
              <div class="mfp-row">{{field:row_full_name}}</div>
              <div class="mfp-row">{{field:row_contact}}</div>
              <div class="mfp-row">{{field:row_company}}</div>
              <div class="mfp-row">{{field:row_subject}}</div>
              <div class="mfp-row">{{field:row_message}}</div>
              <div class="mfp-row">{{field:row_preferred_contact}}</div>
              <div class="mfp-row">{{field:row_newsletter}}</div>
            </div>
          </div>
          <div class="mfp-submit-wrap">
            <button type="submit" class="mfp-btn-submit">{{content:submit_btn_text}}</button>
          </div>
          <footer class="mfp-footer">
            <p>{{content:footer_message}}</p>
          </footer>
        </div>
      </section>
    </div>
  </div>
  {{script:theme_selector}}
</div>
```

**Quy tắc token:**
- `{{field:row_KEY}}` — tham chiếu đến Row container (renderer tự expand ra `.mf-row > .mf-col-*`).
- `{{content:KEY}}` — tham chiếu đến `settings.customContent[KEY]`.
- `{{script:theme_selector}}` — inject script theme picker.
- Nút submit **bắt buộc** là `<button type="submit" class="mfp-btn-submit">` — **KHÔNG** dùng `{{submit}}`.

**Để map nằm bên phải**, đổi class `mfp-map-left` thành `mfp-map-right` và dùng CSS order tương ứng.

### 3.5. customCss skeleton

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

.mfp.mfp-contact-split {
  --background: oklch(0.98 0.002 240);
  --foreground: oklch(0.20 0.04 240);
  --card: oklch(1 0 0);
  --primary: oklch(0.35 0.12 240);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.94 0.01 240);
  --muted: oklch(0.96 0.005 240);
  --muted-foreground: oklch(0.45 0.02 240);
  --accent: oklch(0.55 0.08 240);
  --border: oklch(0.90 0.01 240);

  display: block !important;
  width: 100% !important;
  position: relative;
  background: var(--background);
  color: var(--foreground);
  font-family: 'Inter', system-ui, sans-serif !important;
  box-sizing: border-box;
  overflow: hidden !important;
}
.mfp.mfp-contact-split *,
.mfp.mfp-contact-split *::before,
.mfp.mfp-contact-split *::after {
  box-sizing: border-box;
}

/* Background + overlay */
.mfp.mfp-contact-split .mfp-bg { position: absolute; inset: 0; background: var(--background); z-index: 0; pointer-events: none; }
.mfp.mfp-contact-split .mfp-overlay { position: absolute; inset: 0; background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, transparent), transparent 60%); z-index: 0; pointer-events: none; }

/* Content */
.mfp.mfp-contact-split .mfp-content { position: relative; z-index: 1; width: 100%; padding: 24px 16px; }
@media (min-width: 768px) { .mfp.mfp-contact-split .mfp-content { padding: 40px 24px; } }
@media (min-width: 1024px) { .mfp.mfp-contact-split .mfp-content { padding: 56px 32px; } }

/* Split grid: desktop 2 cột, mobile 1 cột */
.mfp.mfp-contact-split .mfp-split-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
  align-items: stretch;
}
@media (min-width: 992px) {
  .mfp.mfp-contact-split .mfp-split-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
}
@media (min-width: 1200px) {
  .mfp.mfp-contact-split .mfp-split-grid { grid-template-columns: 5fr 7fr; gap: 40px; }
}

/* Map order */
.mfp.mfp-contact-split.mfp-map-left .mfp-map-col { order: 0; }
.mfp.mfp-contact-split.mfp-map-left .mfp-form-col { order: 1; }
.mfp.mfp-contact-split.mfp-map-right .mfp-map-col { order: 1; }
.mfp.mfp-contact-split.mfp-map-right .mfp-form-col { order: 0; }
@media (max-width: 991px) {
  .mfp.mfp-contact-split .mfp-form-col { order: 0 !important; }
  .mfp.mfp-contact-split .mfp-map-col { order: 1 !important; }
}

/* Map column */
.mfp.mfp-contact-split .mfp-map-col { display: flex; flex-direction: column; gap: 20px; }
.mfp.mfp-contact-split .mfp-map-wrap { flex: 1 1 auto; min-height: 360px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 10px 25px -5px rgba(0,0,0,.08); }
.mfp.mfp-contact-split .mfp-map-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; display: block; }
@media (min-width: 992px) { .mfp.mfp-contact-split .mfp-map-wrap, .mfp.mfp-contact-split .mfp-map-iframe { min-height: 480px; } }

/* Contact info */
.mfp.mfp-contact-split .mfp-contact-info { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,.04); }
.mfp.mfp-contact-split .mfp-contact-title { margin: 0 0 12px; font-size: 1.125rem; font-weight: 600; color: var(--foreground); }
.mfp.mfp-contact-split .mfp-contact-line { margin: 0 0 8px; font-size: 0.9375rem; line-height: 1.6; color: var(--muted-foreground); }
.mfp.mfp-contact-split .mfp-contact-address { white-space: pre-line; }

/* Form card */
.mfp.mfp-contact-split .mfp-card { background: var(--card) !important; border: 1px solid var(--border) !important; border-radius: 16px !important; box-shadow: 0 20px 40px -10px rgba(0,0,0,.1) !important; overflow: hidden; height: 100%; display: flex; flex-direction: column; }
.mfp.mfp-contact-split .mfp-header { padding: 28px 28px 20px; border-bottom: 1px solid var(--border); }
.mfp.mfp-contact-split .mfp-title { margin: 0 0 8px; font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 600; line-height: 1.15; color: var(--foreground); }
.mfp.mfp-contact-split .mfp-lead { margin: 0; font-size: 1rem; line-height: 1.6; color: var(--muted-foreground); }
.mfp.mfp-contact-split .mfp-section { padding: 24px 28px; flex: 1 1 auto; }
.mfp.mfp-contact-split .mfp-section-label { margin: 0 0 18px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted-foreground); }

/* Field spacing */
.mfp.mfp-contact-split .mfp-fields { display: flex; flex-direction: column; gap: 16px; }
.mfp.mfp-contact-split .mfp-row { width: 100%; }

/* Submit */
.mfp.mfp-contact-split .mfp-submit-wrap { padding: 0 28px 24px; }
.mfp.mfp-contact-split .mfp-btn-submit {
  width: 100%;
  padding: 14px 24px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--primary-foreground) !important;
  background: var(--primary) !important;
  border: 1px solid var(--primary) !important;
  border-radius: 10px !important;
  cursor: pointer;
  transition: filter .15s, transform .15s;
}
.mfp.mfp-contact-split .mfp-btn-submit:hover { filter: brightness(1.08); transform: translateY(-1px); }

/* Footer */
.mfp.mfp-contact-split .mfp-footer { padding: 16px 28px 24px; border-top: 1px solid var(--border); text-align: center; }
.mfp.mfp-contact-split .mfp-footer p { margin: 0; font-size: 0.875rem; color: var(--muted-foreground); }
```

---

## 4. Color presets (themeSelector)

Sử dụng các preset có sẵn từ Premium-Fixed. Ví dụ nhóm **Corporate**:

```json
{
  "executive-navy": {
    "name": "Executive Navy",
    "group": "Corporate",
    "background": "oklch(0.98 0.002 240)",
    "foreground": "oklch(0.20 0.04 240)",
    "card": "oklch(1 0 0)",
    "primary": "oklch(0.35 0.12 240)",
    "primaryForeground": "oklch(0.98 0 0)",
    "secondary": "oklch(0.94 0.01 240)",
    "muted": "oklch(0.96 0.005 240)",
    "mutedForeground": "oklch(0.45 0.02 240)",
    "accent": "oklch(0.55 0.08 240)",
    "border": "oklch(0.90 0.01 240)"
  }
}
```

Các nhóm preset khác: `modern`, `minimal`. Copy đầy đủ presets từ file `V0-celebration-rsvp-simple.json` trong thư mục `Premium-Fixed`.

---

## 5. Lỗi thường gặp và cách tránh

### Lỗi 1: Token field bị sai dấu ngoặc

**SAI:** `{field:full_name}` — renderer không nhận diện được, field rơi xuống auto-layout.

**ĐÚNG:** `{{field:row_full_name}}`

> Nếu AI viết code Python dùng f-string để generate HTML, phải escape 4 dấu ngoặc nhọn để ra 2 dấu trong output:
> ```python
> html = f'<div>{{{{field:row_full_name}}}}</div>'
> # output: <div>{{field:row_full_name}}</div>
> ```

### Lỗi 2: Dùng token submit sai

**SAI:** `{{submit}}`

**ĐÚNG:** `<button type="submit" class="mfp-btn-submit">{{content:submit_btn_text}}</button>`

### Lỗi 3: Thiếu duplicate trong settings

`settings.customHtml`, `settings.CustomHtml`, `settings.customCss`, `settings.CustomCss` phải đều có giá trị.

### Lỗi 4: Map bị xếp dọc

Phải dùng CSS Grid 2 cột trên desktop và `order` để điều khiển vị trí map/form. Mobile mới được xếp 1 cột.

### Lỗi 5: Field key không khớp placeholder

Mọi `{{field:KEY}}` trong customHtml phải có field/row tương ứng trong `fields[]`.

---

## 6. Quy trình QA

1. Lưu file JSON vào cả 2 folder đã nêu ở mục 2.
2. Trên site Oqtane, mở MegaForm builder → New Form → filter `With_map` → chọn template.
3. Publish form, ghi lại form ID.
4. Mở trang test: `http://localhost:5000/test-template-page/v0-celebration-rsvp-simple?formid=ID`
5. Kiểm tra:
   - Map hiển thị bên trái/phải form (desktop).
   - Các input nằm trong form card, không bị đẩy xuống dưới.
   - Nút submit hoạt động.
   - Theme picker chuyển màu được.
   - Responsive trên mobile: form trước, map sau.

---

## 7. Thông tin môi trường

- Site Oqtane đang chạy: `http://localhost:5000`
- Instance thực tế: `E:\DNN_SITES\OqtaneSites\Oqtane_new\`
- Templates gallery đọc từ: `{ContentRootPath}\App_Data\MegaForm\Templates`
- Tài liệu kiến trúc tham khảo: `Docs/PREMIUM_FORM_TEMPLATE_SPEC.md`, `Docs/PURE_GRID_FORM_TEMPLATE_SPEC.md`
