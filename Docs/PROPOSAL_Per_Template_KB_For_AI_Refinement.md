# Đề xuất: Mỗi Premium Template ship kèm một bộ quy tắc KB để AI refine an toàn

> Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
> Ngày lập: 2026-06-22  
> Phạm vi: AI Assistant trong Form Builder, Premium Templates, Knowledge Base (`MF_AI_Knowledge`)  
> Ràng buộc: chỉ đề xuất + tài liệu, **không viết code**

---

## 1. Bối cảnh hiện tại

### 1.1 Kiến trúc AI trong MegaForm

Theo `Docs/AI_FORM_DESIGN_ARCHITECTURE.md`:

- AI Assistant là **tool-loop** trong `MegaForm.UI/src/ai-form-assistant/chat.ts`.
- AI không sửa code/HTML trực tiếp mà emit các **op** JSON (`add_field`, `set_field_property`, `replace_form_schema`, `save_form`, …) qua `MegaForm.UI/src/ai-form-assistant/ops.ts`.
- Có một **Knowledge Base SQL** `MF_AI_Knowledge` chứa:
  - `prompt_rule` — các quy tắc chung (PRESERVE, CONVERT, THEME-001, …) seed từ `MegaForm.Core/Seed/ai-knowledge-prompt-rules.sql`.
  - `prompt_recipe` — công thức prompt chi tiết, dùng mô hình "KB-row-as-index + recipe-file-on-disk" (`Docs/PROMPT_RECIPE_ARCHITECTURE.md`).
  - `widget`, `form_pattern`, `form_template`, …

### 1.2 Premium template là gì

Premium template là một JSON blob có:

- `fields[]` — định nghĩa field.
- `customHtml` — shell HTML với placeholder `{{field:KEY}}`, `{{content:KEY}}`, `{{form:title}}`.
- `customCss` — CSS thiết kế, thường scoped `.mfp.mfp-<slug>`.
- `settings.customContent` — token text hiển thị trong HTML.
- `settings.theme`, `settings.customScripts`, `settings.themeSelector` (đôi khi).

Theo `Docs/AI_PREMIUM_CONVERT_PROMPT.md`, 32/34 Premium template có `customHtml` + `customCss`, và 29/34 dùng `{{content:*}}` tokens.

---

## 2. Vấn đề: AI "phá" Premium form khi refine

Các tình huống đã biết:

### 2.1 `customHtml` ↔ `schema.fields` bị desync

`Docs/AI_CUSTOM_HTML_FORM_EDIT_BUG_ANALYSIS_2026-06-11.md` chỉ ra root cause chính xác:

> "`customHtml` không bị BLANK/DELETE. Vấn đề là `customHtml` và `schema.fields` bị DESYNC."

Khi AI emit `replace_form_schema` với fields mới (key khác hoặc thiếu field), `customHtml` cũ vẫn giữ `{{field:old_key}}`. Các field mới không có placeholder → **invisible** trong custom layout, hoặc bị đẩy xuống auto-layout fallback.

### 2.2 Auto-sync append placeholder xuống cuối `customHtml`

`ops.ts` khi `mergeWithCustomHtml:true` sẽ append các field thiếu vào cuối HTML dưới dạng comment + div đơn giản. Với Premium template, điều này phá vỡ layout đã thiết kế.

### 2.3 `replace_form_schema` thay thế design content non-empty

`PRESERVE-002` chỉ yêu cầu `preserveCustomizations:true` khi form đã có custom design. Nếu AI emit `customHtml` non-empty khác với cũ, gate vẫn chấp nhận. `DesignPreservationGate.cs` chỉ check "có giá trị không", không check consistency.

### 2.4 Theme allowlist từ chối theme Premium

`ops.ts` `VALID_THEMES` không chứa `pure-grid-premium`, trong khi nhiều Premium template dùng theme này. Khi AI cố set theme đúng, bị `[THEME-001]` từ chối.

### 2.5 Thiếu hướng dẫn cụ thể cho từng template

AI chỉ có các rule chung (PRESERVE, CONVERT) và một recipe `convert-premium-form.md` chung chung. Nó không biết:

- Template này có bao nhiêu panel/section.
- Field nào được phép thêm, field nào không.
- `{{content:*}}` token nào được phép sửa, token nào là locked brand copy.
- Composite/Widget nào template hỗ trợ.
- Post-submit experience nên như thế nào.

Kết quả: user bảo "làm cho đẹp hơn" hoặc "đổi thành form booking", AI dễ sinh ops phá vỡ shell.

### 2.6 Vấn đề lặp lại với template tương lai

Nếu chỉ sửa từng template JSON hoặc thêm rule chung, **bất kỳ Premium template mới nào** (do AI/user thiết kế) vẫn có thể:

- Dùng key field mới không có trong layout map.
- Hard-code màu shell (vấn đề đã phân tích ở `ANALYSIS_Premium_Preset_CSS_Limitation.md`).
- Thiếu placeholder hoặc thừa placeholder.
- Bị AI đổi `customHtml`/`customCss` khi refine.

---

## 3. Mục tiêu

1. Khi user yêu cầu AI refine một Premium form, AI phải **biết rõ ranh giới** giữa phần được sửa (labels, options, content tokens, title) và phần **bất khả xâm phạm** (layout DOM, field keys, theme class, customCss structure).
2. Mỗi Premium template phải ship kèm một **bộ quy tắc KB** mô tả chính xác thiết kế của nó.
3. Hệ thống validation phải dùng KB đó để **từ chối hoặc sửa các op nguy hiểm** trước khi mutate form.
4. Template tương lai muốn được đưa vào catalog thì **phải có KB**, tránh lặp lại lỗi.

---

## 4. Đề xuất giải pháp: Per-Template Knowledge Base

### 4.1 Khái niệm

Mỗi Premium template sẽ có một entry `MF_AI_Knowledge` với `Kind = 'template_guide'` (hoặc `'premium_guide'`).

Entry này là **hợp đồng thiết kế** của template, bao gồm:

- **Design contract** — cấu trúc DOM của `customHtml`, các panel/section, vị trí của từng placeholder.
- **Immutable rules** — những gì AI **không được** đụng.
- **Mutable rules** — những gì AI **được phép** sửa và cách sửa.
- **Content token dictionary** — danh sách `{{content:*}}` token, ý nghĩa, giới hạn độ dài, ví dụ.
- **Field layout map** — field nào nằm ở section/panel nào; field nào có thể thêm mới; field nào bắt buộc.
- **Theme & styling constraints** — theme name, CSS namespace, locked CSS, preset constraints.
- **Composite / widget policy** — loại composite/widget được phép, cấu hình mặc định.
- **Post-submit / success experience** — nếu template có UX sau submit.
- **Few-shot conversion examples** — ví dụ "chuyển template này từ RSVP sang consultation" đúng chuẩn.

### 4.2 Cách lưu trữ — tái sử dụng Prompt-Recipe Architecture

Theo `Docs/PROMPT_RECIPE_ARCHITECTURE.md`, KB row + file-on-disk là mô hình phù hợp:

```
DB row (MF_AI_Knowledge):
  Slug:    "tpl-v0-contact-map-left-corporate"
  Kind:    "template_guide"
  Title:   "Contact Us - Map Left, Corporate"
  Summary: "Two-column split layout: map left, form right. Corporate presets."
  Tags:    "premium,contact,template-guide"
  Body:    {"guide_file": "v0-contact-map-left-corporate.md"}

File on disk:
  DesktopModules/MegaForm/Resources/TemplateGuides/
    v0-contact-map-left-corporate.md
  wwwroot/Modules/MegaForm/Resources/TemplateGuides/
    v0-contact-map-left-corporate.md
```

Ưu điểm:
- KB SQL vẫn nhỏ, searchable.
- File markdown version-control tự nhiên, dễ cập nhật khi release.
- AI đọc được cả phần prose lẫn structured data.

### 4.3 Cấu trúc file guide (markdown + JSON frontmatter)

Mỗi file `.md` có thể dùng YAML/JSON frontmatter cho phần structured, và markdown body cho phần hướng dẫn AI.

Ví dụ cấu trúc:

```markdown
---
{
  "templateRef": "v0-contact-map-left-corporate",
  "appliesTo": ["v0-contact-map-left-corporate", "v0-contact-map-left-minimal"],
  "designContract": {
    "layout": "two-column-split",
    "rootSelector": ".mfp.mfp-contact-map-left",
    "panels": [
      {
        "name": "map-panel",
        "selector": ".mf-map-panel",
        "purpose": "embed map + contact info",
        "contentTokens": ["map_embed_url", "contact_address", "contact_phone", "contact_email"],
        "fields": []
      },
      {
        "name": "form-panel",
        "selector": ".mf-form-panel",
        "purpose": "form fields",
        "contentTokens": ["brand_title", "brand_subtitle", "section_label", "footer_message", "submit_btn_text"],
        "fields": ["first_name", "last_name", "email", "phone", "subject", "message"],
        "fieldAppendStrategy": "append-to-panel-bottom"
      }
    ]
  },
  "immutableRules": [
    "DO NOT rename field keys listed in designContract.panels[].fields",
    "DO NOT change the two-panel DOM structure in customHtml",
    "DO NOT replace customCss",
    "DO NOT change settings.themeSelector.presetSet",
    "DO NOT add Payment, Signature, or File fields"
  ],
  "mutableRules": [
    "MAY edit field.label, field.options, field.required, field.placeholder",
    "MAY edit settings.customContent tokens listed in contentTokens",
    "MAY edit title, description, submitButtonText, successMessage",
    "MAY add new fields ONLY if appended to the form-panel and a {{field:NEW_KEY}} placeholder is inserted in the same panel"
  ],
  "theme": {
    "name": "pure-grid-premium",
    "cssNamespace": ".mfp.mfp-contact-map-left",
    "lockedCss": true,
    "presetPolicy": "corporate-presets-only"
  },
  "fieldPolicies": {
    "allowedTypes": ["Text", "Email", "Phone", "Textarea", "Select", "Radio", "Checkbox", "Row"],
    "forbiddenTypes": ["Payment", "Signature", "File", "Razor", "DataRepeater"],
    "requiredKeys": ["email", "message"]
  },
  "contentTokenDictionary": {
    "brand_title": { "maxLength": 60, "example": "Get in Touch" },
    "brand_subtitle": { "maxLength": 120, "example": "We usually reply within one business day." },
    "section_label": { "maxLength": 40, "example": "Send us a message" },
    "footer_message": { "maxLength": 200, "example": "Prefer phone? Call us at {{content:contact_phone}}." }
  },
  "conversionExamples": [
    {
      "from": "corporate contact",
      "to": "real-estate inquiry",
      "allowedChanges": ["title", "customContent.brand_title", "customContent.brand_subtitle", "field labels"]
    }
  ]
}
---

# Guide for AI — Contact Us Map Left Corporate

This template is a two-column split layout. The left column shows a map and contact info; the right column shows the form.

When the user asks to "convert" or "refine" this form:

1. Call `inspect_form_customizations` first. If `templateGuideSlug` is present, load this guide.
2. NEVER emit `replace_form_schema` that changes `customHtml`, `customCss`, `theme`, or `customScripts`.
3. Use only `set_form_meta`, `set_field_property`, and (carefully) `add_field` with explicit panel placement.
4. If a new field is needed, insert `{{field:NEW_KEY}}` inside `.mf-form-panel`, NOT at the bottom of the document.
5. Keep all field keys in `designContract.panels[].fields` unchanged.
```

### 4.4 AI sẽ tiêu thụ KB như thế nào

Thay đổi system prompt / tool flow trong `chat.ts`:

1. Khi form hiện tại có `settings.theme` là Premium hoặc `customHtml` non-empty, AI **phải** gọi `get_knowledge(kind='template_guide', search=<template slug>)` hoặc tool mới `get_template_guide(slug)`.
2. Nội dung guide được nạp vào context ngay sau CORE RULES, trước khi AI plan ops.
3. AI được yêu cầu tuân theo `immutableRules` và `mutableRules`; nếu user yêu cầu vi phạm, AI phải dùng `chat_message` để hỏi lại thay vì emit ops.

Ví dụ system prompt addition:

```
PREMIUM FORM REFINE PROTOCOL:
- If the current form has a templateGuideSlug, call get_template_guide(slug) BEFORE planning any multi-field change.
- Treat designContract panels and immutableRules as hard constraints.
- Allowed ops for a guided premium form: set_form_meta, set_field_property, add_field (with panel placement).
- Forbidden ops: replace_form_schema, remove_field on locked keys, any op that mutates customHtml/customCss/theme/customScripts.
```

### 4.5 Validation layers dùng KB

#### Client-side `ops.ts`

Thêm `TemplateGuideValidator`:

- Trước khi apply bất kỳ op nào, nếu form có `templateGuideSlug`, load guide (cached).
- `replace_form_schema` bị từ chối nếu guide `lockedDesign` = true, trừ khi `forceDesignOverride:true` và user đã confirm.
- `add_field` phải kèm `panel` hoặc `afterField` chỉ định vị trí trong `designContract`. Nếu không, từ chối với `[GUIDE-001]`.
- `remove_field` bị từ chối nếu key nằm trong `requiredKeys` hoặc `lockedFields`.
- `set_field_property` trên `key` bị từ chối (giữ key bất biến).
- `set_form_meta` / `set_field_property` trên `label`/`options`/`required` được cho phép.
- Placeholder consistency check (`PRESERVE-004`) dùng `designContract.panels[].fields` làm nguồn thật.

#### Server-side `DesignPreservationGate.cs`

Mở rộng gate:

- Nếu incoming schema có `templateGuideSlug`, resolve guide.
- Kiểm tra `customHtml` chứa đủ placeholder cho tất cả fields trong schema.
- Kiểm tra `customCss` không bị thay đổi nếu `lockedCss` = true.
- Kiểm tra theme không bị đổi nếu `lockedTheme` = true.

### 4.6 Template JSON thêm pointer

```json
{
  "version": "1.0",
  "slug": "v0-contact-map-left-corporate",
  "templateGuideSlug": "tpl-v0-contact-map-left-corporate",
  "title": "Contact Us - Map Left, Corporate",
  ...
}
```

Pointer này giúp `inspect_form_customizations` biết phải load guide nào.

---

## 5. Tích hợp với kiến trúc hiện có

### 5.1 Dùng lại `MF_AI_Knowledge`

Không cần bảng mới. Chỉ thêm `Kind = 'template_guide'`. Các cột hiện có đủ dùng:

- `Slug` — `tpl-<template-slug>`
- `Kind` — `template_guide`
- `Title`, `Summary`, `Tags`
- `Body` — `{"guide_file": "..."}`
- `Examples` — JSON array chứa conversion examples
- `Source` — `megaform-builtin` để upgrade MERGE không đè lại customer overrides.

### 5.2 Dùng lại Prompt-Recipe file resolver

`AiToolsController.ResolveKnowledgeBody` đã hỗ trợ `recipe_file`. Có thể mở rộng thêm `guide_file` hoặc dùng chung key `recipe_file` với đường dẫn `TemplateGuides/`.

### 5.3 Seed / Migration

Tạo:
- `MegaForm.Core/Seed/ai-knowledge-template-guides.sql` — INSERT các KB row cho 34 Premium template hiện có.
- File markdown tương ứng trong `Resources/TemplateGuides/`.
- `MegaForm.Oqtane.Server/Migrations/01060034_SeedTemplateGuides.cs` — Oqtane parity.

---

## 6. Quy trình cho template tương lai

Để một Premium template mới được đưa vào catalog, phải pass **AI-safety checklist**:

1. Có `templateGuideSlug` trong JSON.
2. Có file `Resources/TemplateGuides/<slug>.md` hợp lệ.
3. `designContract` mô tả đúng cấu trúc `customHtml`.
4. `immutableRules` xác định rõ field keys locked, customCss locked, theme locked.
5. Placeholder consistency: mọi field trong `fields[]` đều có `{{field:key}}` trong `customHtml`.
6. Nếu template dùng theme `pure-grid-premium` hoặc theme selector, guide phải phản ánh.
7. QA: chạy 3–5 prompt refine mẫu qua AI assistant và verify không phá layout.

Nếu không có guide, template chỉ được coi là "draft" hoặc bị từ chối merge.

---

## 7. Các fix tiền đề (tactical) cần làm trước

Per-template KB là lớp bảo vệ cao, nhưng cần một số fix nền để KB phát huy:

1. **Sửa Oqtane save endpoint** — `ops.ts` dùng `/api/MegaForm/Form` thay vì `Form/Save` (`Docs/QA_AI_ASSISTANT_CRASH_REPORT_2026-06-15.md`).
2. **Thêm `pure-grid-premium` vào theme allowlist** hoặc miễn kiểm tra theme cho Premium templates.
3. **Dừng auto-sync append placeholder xuống cuối** — thay bằng lỗi `[PRESERVE-004]` hoặc dùng `designContract` để chèn đúng vị trí.
4. **Placeholder consistency validator** — bắt buộc `customHtml` có placeholder cho mọi field.
5. **Composite/widget prompt rules** — bổ sung few-shot và normalize alias (`CompositePhone` → `type: "Composite"`) theo `AUDIT_COMPOSITE_CONTROLS_AND_AI_WIDGET_PROMPTS_2026-06-15.md`.
6. **Preset CSS bridge** — giải quyết vấn đề header/border không đổi màu khi đổi preset (`ANALYSIS_Premium_Preset_CSS_Limitation.md`).

---

## 8. Lợi ích

| Lợi ích | Giải thích |
|---------|------------|
| **Giảm form bị phá khi AI refine** | AI biết rõ ranh giới được sửa / không được sửa của từng template. |
| **Tăng tốc review** | Staged ops ít bị từ chối hơn vì AI đã tuân guide. |
| **Template tương lai an toàn hơn** | Bắt buộc guide trước khi ship → không còn template "mồ côi" thiếu quy tắc. |
| **Tái sử dụng kiến trúc KB hiện có** | Không cần schema DB mới, chỉ thêm `Kind` và file resolver. |
| **Hỗ trợ conversion có kiểm soát** | Guide chứa few-shot examples cho từng template, AI convert đúng cách. |
| **Bảo vệ thiết kế Premium** | `customHtml`/`customCss` không bị đè khi user chỉ muốn đổi label/content. |

---

## 9. Rủi ro và cách giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|------------|
| AI bỏ qua guide | Duy trì hard gates trong `ops.ts` + server gate; guide là "soft instruction", gate là "hard enforcement". |
| Context prompt dài | Giữ guide ngắn gọn (frontmatter + 1–2 đoạn markdown); lazy-load bằng tool thay vì nhồi sẵn. |
| Maintenance 34 guide files | Viết generator từ template JSON + prompt AI để tạo guide nháp; sau đó QA sửa. |
| Template chia sẻ guide | Dùng `appliesTo` array để một guide phục vụ nhiều biến thể (ví dụ 3 contact-map layouts). |
| Version drift guide/template | Đặt version trong guide, kiểm tra khi load; build step fail nếu `templateGuideSlug` không resolve được. |

---

## 10. Khuyến nghị triển khai

### Phase 1 — Chuẩn bị nền (1 tuần)
- Sửa Oqtane save endpoint, theme allowlist, placeholder validator, auto-sync.
- Hoàn thiện composite prompt rules.

### Phase 2 — Pilot 3 template (1 tuần)
- Chọn 3 Premium template đại diện:
  - `v0-contact-map-left-corporate` (split layout)
  - `bulgaria-discovery-programme` (theme selector, nhiều section)
  - `halloween-party-registration` (custom tokens + scripts)
- Viết guide file + KB row cho từng template.
- Chạy AI refine QA trên 3 template.

### Phase 3 — Scale toàn bộ 34 template (2 tuần)
- Dùng script + AI để sinh guide nháp cho 34 template.
- QA sửa guide.
- Seed SQL + Oqtane migration.

### Phase 4 — Quy trình template mới
- Cập nhật `Docs/PREMIUM_FORM_TEMPLATE_SPEC.md` bắt buộc `templateGuideSlug`.
- Thêm validation gate khi import template vào catalog.

---

## 11. Tài liệu tham khảo

- `Docs/AI_FORM_DESIGN_ARCHITECTURE.md`
- `Docs/AI_PREMIUM_CONVERT_PROMPT.md`
- `Docs/PROMPT_RECIPE_ARCHITECTURE.md`
- `Docs/AI_CUSTOM_HTML_FORM_EDIT_BUG_ANALYSIS_2026-06-11.md`
- `Docs/AUDIT_COMPOSITE_CONTROLS_AND_AI_WIDGET_PROMPTS_2026-06-15.md`
- `Docs/QA_AI_ASSISTANT_CRASH_REPORT_2026-06-15.md`
- `Docs/ANALYSIS_Premium_Preset_CSS_Limitation.md`
- `MegaForm.UI/src/ai-form-assistant/chat.ts`
- `MegaForm.UI/src/ai-form-assistant/ops.ts`
- `MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs`
- `MegaForm.Core/Seed/ai-knowledge-prompt-rules.sql`
