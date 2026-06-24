# RÀ SOÁT: Post-Submission Thank You & AI Bảo Toàn Thiết Kế Premium

**Ngày rà soát:** 2026-06-19  
**Đường dẫn form JSON được rà soát:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\Premium-Fixed-ChipCards-Compact-20260619`  
**Source code:** `e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
**Phạm vi:** Chỉ rà soát và viết tài liệu — không sửa code.

---

## 1. Tóm tắt nhanh

| Vấn đề | Kết luận chính |
|--------|----------------|
| **Thank you message không nằm trong form body** | Tất cả 39 form premium trong thư mục đều đang dùng `successMessage` dạng legacy, chưa chuyển sang `settings.postSubmitExperience`. Renderer cũ (`megaform-renderer.ts`) hiển thị thank you trong `.mf-success-message` bên ngoài `.mf-form`; renderer mới (`src/renderer/index.ts`) mới render thank you bên trong form body qua `mf-postsubmit-{fid}`. Nếu production vẫn phục vụ bundle cũ, thank you sẽ không nằm trong body card. |
| **AI sửa nội dung phá vỡ thiết kế Premium** | Các gate hiện tại (`PRESERVE-001/002/003`, `CONVERT-001`, `ASK-DESIGN`, `DesignPreservationGate.cs`) chỉ chặn **xóa trắng** (blanking) `customHtml`/`customCss`/`theme`, nhưng không chặn **ghi đè bằng nội dung khác**, không kiểm tra consistency giữa `fields[].key` và `{{field:KEY}}`, và không có style guide riêng cho từng template premium. |
| **Placeholder mismatch trong form JSON** | Nhiều file premium có field key không được reference trong `customHtml` (ví dụ `vehicle_carousel`, `property_gallery`, `section_intro`, các row wrapper...) hoặc placeholder orphan (ví dụ `megaform-italian-romantic-fixed.json`, `megaform-multipurpose-usa.json`). Điều này cho thấy custom HTML và field structure đang out-of-sync, nguy cơ cao khi AI chỉnh sửa. |

---

## 2. Rà soát các form JSON tại `Premium-Fixed-ChipCards-Compact-20260619`

### 2.1. Tổng quan bộ form

- **Tổng số file JSON form:** 39 (không tính `summary.json`, `manifest.jsonl`).
- **Tất cả đều có `customCss`:** độ dài từ ~6 KB đến ~130 KB.
- **Hầu hết có `customHtml`:** 37/39 có customHtml; 2 file (`festa-italiana-native.json`, `pt-trainer-modern-us-form.json`) không có customHtml.
- **Theme name:** hầu hết là các theme premium tùy chỉnh (`pure-grid-premium`, `euro-youth-premium`, `american-auto-premium`, `french-realestate-elegant`, `sakura-premium`, ...), không nằm trong allowlist 13 theme chuẩn của `ops.ts`.
- **Post-submit config:** 0/39 file có `settings.postSubmitExperience` hoặc `settings.PostSubmitExperience`.
- **Legacy successMessage:** 39/39 file có `successMessage` ở root object; một số có thêm `settings.successMessage`.

### 2.2. Danh sách theme và tình trạng customHtml

| File | Theme | customHtml | customCss | postSubmitExperience | successMessage root |
|------|-------|------------|-----------|----------------------|---------------------|
| Rose_festival_row_based_OK.json | modern-blue | Có (~3.5K) | Có (~32K) | Không | Có |
| V0-celebration-rsvp-simple.json | pure-grid-premium | Có (~2.1K) | Có (~28K) | Không | Có |
| V0-celebration-rsvp-stepped.json | pure-grid-premium | Có (~4.3K) | Có (~32K) | Không | Có |
| V0-invitation-ceremony-another-v20260419-06.json | pure-grid-premium | Có (~20K) | Có (~130K) | Không | Có |
| V0-invitation-ceremony-v6-v20260419-06.json | pure-grid-premium | Có (~19K) | Có (~130K) | Không | Có |
| V0job-application-form-v20260419-06.json | pure-grid-premium | Có (~4K) | Có (~13K) | Không | Có |
| american-auto-dealership-registration.json | american-auto-premium | Có (~6.5K) | Có (~13K) | Không | Có |
| american-auto-dealership-registration1.json | american-auto-premium | Có (~6.6K) | Có (~15K) | Không | Có |
| american-realestate-french-style.json | french-realestate-elegant | Có (~8K) | Có (~14K) | Không | Có |
| aurora-product-feedback.json | modern-blue | Có (~1.3K) | Có (~24K) | Không | Có |
| aurora-style-consultation.json | aurora-fashion | Có (~7.9K) | Có (~24K) | Không | Có |
| botanical-volunteer-story.json | nature-green | Có (~0.6K) | Có (~19K) | Không | Có |
| cherry-blossom-festival-registration.json | sakura-premium | Có (~3K) | Có (~35K) | Không | Có |
| client-weekly-health-checkin.json | health-wellness-clean | Có (~4.4K) | Có (~27K) | Không | Có |
| coachella-festival-registration.json | coachella-desert-premium | Có (~2.3K) | Có (~34K) | Không | Có |
| elegant-nature-job-application.json | modern-blue | Có (~4K) | Có (~29K) | Không | Có |
| euro-youth-application.json | euro-youth-premium | Có (~8.9K) | Có (~23K) | Không | Có |
| festa-italiana-native.json | festa-italiana-premium | Không | Có (~10K) | Không | Có |
| festa-italiana-registration.json | festa-italiana-premium | Có (~6.5K) | Có (~25K) | Không | Có |
| french-invitation-fixed-calendar.json | french-elegant | Có (~1.4K) | Có (~24K) | Không | Có |
| french-product-consultation-form-fixed-final.json | french-elegant | Có (~7.7K) | Có (~27K) | Không | Có |
| halloween-party-registration.json | halloween-floating-ghosts | Có (~4.5K) | Có (~41K) | Không | Có |
| invitation-ceremony-another.json | pure-grid-premium | Có (~20K) | Có (~129K) | Không | Có |
| invitation-ceremony-v6.json | pure-grid-premium | Có (~19K) | Có (~129K) | Không | Có |
| italian-law-firm-consultation.json | italian-law-elegant | Có (~7.2K) | Có (~24K) | Không | Có |
| italian-romantic-experience-feedback.json | modern-blue | Có (~2K) | Có (~26K) | Không | Có |
| job-application-form.json | pure-grid-premium | Có (~4K) | Có (~12K) | Không | Có |
| megaform-italian-romantic-fixed.json | italian-romantic | Có (~4.3K) | Có (~24K) | Không | Có |
| megaform-multipurpose-usa.json | american-modern | Có (~7.7K) | Có (~31K) | Không | Có |
| new-orleans-event-registration.json | new-orleans-glass-2026 | Có (~3.3K) | Có (~27K) | Không | Có |
| product-consultation-form-fixed-english-slider-fictional-cities.json | custom | Có (~4.4K) | Có (~27K) | Không | Có |
| pt-trainer-form-template.json | modern-european | Có (~1.5K) | Có (~24K) | Không | Có |
| pt-trainer-modern-us-form.json | modern-minimal-us | Không | Có (~6K) | Không | Có |
| romantic-congratulations-event-form-fixed.json | romantic-rose | Có (~10K) | Có (~33K) | Không | Có |
| sticky-spark-creative-brief.json | playful | Có (~1K) | Có (~19K) | Không | Có |
| sweet-holiday-rose-garden.json | holiday-rose-garden | Có (~4.9K) | Có (~32K) | Không | Có |
| usa-training-course-registration-form-script-token-fixed-v2.json | usa-training-premium | Có (~3K) | Có (~26K) | Không | Có |
| wedding-scrapbook-story.json | warm-sunset | Có (~0.6K) | Có (~19K) | Không | Có |
| worldcup-2026-event-registration-form-fixed-centered.json | worldcup-2026 | Có (~2.7K) | Có (~27K) | Không | Có |

### 2.3. Tình trạng mismatch giữa `fields[].key` và `{{field:KEY}}`

Kiểm tra nhanh cho thấy nhiều form có field key **không xuất hiện** trong `customHtml` (thường là các field row-wrapper, section, gallery, carousel, terms) hoặc placeholder **orphan** (có trong HTML nhưng không còn field key tương ứng).

| File | Số field key thiếu trong HTML | Số placeholder orphan | Ví dụ thiếu/ orphan |
|------|------------------------------|----------------------|---------------------|
| american-auto-dealership-registration.json | 1 | 0 | `vehicle_carousel` |
| american-auto-dealership-registration1.json | 1 | 0 | `vehicle_carousel` |
| american-realestate-french-style.json | 1 | 0 | `property_gallery` |
| botanical-volunteer-story.json | 2 | 0 | `sec_contact`, `sec_story` |
| euro-youth-application.json | 6 | 0 | `programme`, `interests`, `accommodation`, `scholarship`, `newsletter`, `terms` |
| festa-italiana-native.json | 9 | 0 | toàn bộ field (vì không có customHtml) |
| festa-italiana-registration.json | 4 | 0 | `pass`, `dietary`, `terms`, `newsletter` |
| french-product-consultation-form-fixed-final.json | 1 | 0 | `product_slider` |
| megaform-italian-romantic-fixed.json | 5 | 10 | Thiếu: `row_name`, `row_contact`, ...; Orphan: `first_name`, `last_name`, `email`, ... |
| megaform-multipurpose-usa.json | 13 | 15 | Thiếu: `row_hero_slider`, `row_header`, ...; Orphan: `first_name`, `last_name`, ... |
| pt-trainer-form-template.json | 1 | 0 | `section_intro` |
| sticky-spark-creative-brief.json | 3 | 0 | `sec_intro`, `sec_direction`, `sec_delivery` |
| wedding-scrapbook-story.json | 2 | 0 | `sec_couple`, `sec_day` |

**Nhận xét:** Các field thiếu thường là field dạng section/row wrapper hoặc non-input (carousel, gallery). Các file orphan (`megaform-italian-romantic-fixed.json`, `megaform-multipurpose-usa.json`) cho thấy có sự thay đổi field key (từ `first_name` → `row_name`...) mà `customHtml` chưa được cập nhật theo. Đây là dấu hiệu của việc AI hoặc migration tool đã sửa field structure nhưng không đồng bộ customHtml.

---

## 3. Phân tích Post-Submission Thank You

### 3.1. Cơ chế hiện tại trong source code

#### a) Model định nghĩa

- **File:** `MegaForm.Core/Models/FormSchema.cs`
- **Dòng 480–596:** `FormSettings.PostSubmitExperience` chứa cấu hình rich thank you: `enabled`, `mode` (`rich` / `redirect-immediate` / `redirect-timed`), `title`, `message`, `showSubmissionId`, `showAnswerSummary`, `allowFillAgain`, `buttons`, `redirectUrl`, v.v.

#### b) Server resolver

- **File:** `MegaForm.Core/Rendering/RenderModelResolver.cs`
- **Dòng 174–209:** `CanonicalizePostSubmitExperience()` merge các dạng legacy (`successMessage`, `redirectUrl`) thành `postSubmitExperience`.
- **Dòng 255:** `MirrorAlias()` đảm bảo cả `postSubmitExperience` (camelCase) và `PostSubmitExperience` (PascalCase) đều tồn tại.

#### c) Renderer mới — thank you trong form body

- **File:** `MegaForm.UI/src/renderer/index.ts`
- **Dòng 1992–2015:** `getPostSubmitConfig()` đọc `postSubmitExperience`.
- **Dòng 2210–2349:** `showSuccess()` chính:
  - Ẩn các phần tử input UI (`mf-fields-container`, `.mf-form-actions`, submit button, progress).
  - Tạo pane `mf-postsubmit-{fid}`.
  - **Dòng 2306–2319:** Append pane vào `form || wrapper || skeletonSuccess.parentElement || document.body`.
  - **Dòng 2319:** Nếu không tìm thấy `.mf-form`, gọi `inheritFormChrome()` để copy background/border/shadow/color từ card thật.
- **Dòng 2053–2104:** `inheritFormChrome()` giúp thank you pane visually match card.

#### d) Renderer cũ — thank you ngoài form body

- **File:** `MegaForm.UI/src/renderer/megaform-renderer.ts`
- **Dòng 2806–2863:** `showSuccess()` cũ:
  - `form.style.display = 'none'`
  - `success.style.display = ''`
  - Render green box vào `#mf-success-content-{fid}`.
- `.mf-success-message` trong DNN skeleton (`MegaForm.DNN/Views/FormView.ascx:685–687`) là **sibling** của `.mf-form`, cùng nằm trong `.mf-form-inner` nhưng **không nằm trong form body/card**.

### 3.2. Vì sao một số form bị thank you ngoài form body?

#### Lý do 1: Bundle renderer chưa được rebuild / đồng bộ

- Entry point build hiện tại là `src/renderer/index.ts` (theo `vite.config.ts`).
- `src/renderer/megaform-renderer.ts` không còn là entry point nhưng vẫn còn trong source.
- Nếu production đang phục vụ bundle cũ (do chưa build hoặc chưa copy đến `Assets/js/`, `MegaForm.Web/wwwroot/megaform/js/`, `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/`), browser sẽ chạy `showSuccess()` cũ → thank you hiển thị trong `.mf-success-message` bên ngoài `.mf-form`.

#### Lý do 2: Custom HTML / theme premium thay đổi visual card

- Khi `customHtml` tồn tại, renderer đặt `data-mf-has-custom-html="1"` và CSS strip card chrome của `.mf-form`.
- Thank you pane `mf-postsubmit-{fid}` vẫn được append vào `.mf-form`, nhưng `.mf-form` lúc này có thể chỉ là container trong suốt; "form body" thực sự là `.mfp-form-inner` của custom template.
- Kết quả: visually thank you message có thể không nằm trong card/thân form mà người dùng nhìn thấy.

#### Lý do 3: Fallback DOM host

- `showSuccess()` dòng 2308: `const host = form || wrapper || (skeletonSuccess ? skeletonSuccess.parentElement : null) || document.body;`
- Nếu `.mf-form` không tồn tại do hydration lỗi, custom HTML xóa `.mf-form`, hoặc SSR mismatch, `host` fallback ra `wrapper` hoặc `document.body`. Pane thank you sẽ nằm ngoài form body.

#### Lý do 4: Skeleton khác nhau giữa các platform

- **DNN:** Pre-built skeleton có `.mf-success-message` là sibling của `.mf-form`.
- **Oqtane:** SSR chỉ render `mf-form-wrapper` > `mf-form` > `mf-fields-container`, thiếu `.mf-form-inner` và success container. Renderer hydrate bằng cách build skeleton.
- **Web:** Dùng mount div, renderer tự build skeleton.

#### Lý do 5: Các form premium đang dùng legacy `successMessage`

- Tất cả 39 form trong thư mục đều dùng `successMessage` root, không dùng `settings.postSubmitExperience`.
- `RenderModelResolver` sẽ promote `successMessage` thành `postSubmitExperience.message`, nhưng không có title, buttons, answer summary, redirect config.
- Nếu renderer mới chạy, thank you vẫn render trong `.mf-form`, nhưng nội dung chỉ là plain message.
- Nếu renderer cũ chạy, thank you hiển thị trong green box ngoài form body.

### 3.3. Định hướng sửa chữa (không code)

1. **Rebuild & đồng bộ bundle renderer mới**
   - Chạy `npm run build:renderer` từ `MegaForm.UI`.
   - Copy output `megaform-renderer.js` đến cả 3 platform: `Assets/js/`, `MegaForm.Web/wwwroot/megaform/js/`, `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/`.
   - Kiểm tra version/cache busting.

2. **Xử lý visual card cho custom HTML forms**
   - Với custom HTML active, ưu tiên append `mf-postsubmit-{fid}` vào `.mfp-form-inner` hoặc `.mf-form-inner` thay vì cứng nhắc `.mf-form`.
   - Đảm bảo thank you pane kế thừa CSS card thực sự mà người dùng nhìn thấy.

3. **Chuẩn hóa DOM skeleton cross-platform**
   - Cân nhắc Oqtane SSR render đầy đủ `.mf-form-inner`, `.mf-form-actions`, `.mf-success-message`, `.mf-error-message` giống DNN.
   - Hoặc giảm DNN skeleton xuống mount div giống Web.

4. **Migrate form JSON sang `postSubmitExperience`**
   - Chuyển `successMessage` root → `settings.postSubmitExperience` với `mode: "rich"`.
   - Cấu hình `title`, `message`, `allowFillAgain`, `showSubmissionId` theo nhu cầu từng form.
   - Nếu muốn thank you nằm đẹp trong card premium, cần đảm bảo customCss có style cho `.mf-postsubmit-{fid}` hoặc scoped class tương đương.

5. **Xóa/đánh dấu deprecated renderer cũ**
   - Xác nhận `megaform-renderer.ts` không còn được reference.
   - Thêm comment đầu file hoặc xóa file để tránh nhầm lẫn.

6. **Cải thiện CSS cho legacy `.mf-success-message`**
   - Nếu vẫn giữ skeleton legacy trong DNN, cho `.mf-success-message` kế thừa theme variables (`--mf-form-bg`, `--mf-form-border`, v.v.) thay vì hard-code green box.

---

## 4. Phân tích AI Tạo/Sửa Form & Bảo Toàn Thiết Kế Premium

### 4.1. Kiến trúc AI hiện tại

- **Entry point:** `MegaForm.UI/src/ai-form-assistant/chat.ts`
- **Tool loop:** AI gọi tool (`list_widgets`, `get_widget`, `list_knowledge`, `inspect_form_customizations`, ...) → emit JSON ops.
- **Dispatcher:** `MegaForm.UI/src/ai-form-assistant/ops.ts` nhận ops (`add_field`, `set_field_property`, `replace_form_schema`, `set_form_meta`, ...).
- **System prompt:** `chat.ts:systemPrompt()` (dòng ~160–353) gồm role, tool list, output format, inline fallback rules, KB rules, current form snapshot.
- **Knowledge Base:** Bảng `MF_AI_Knowledge` + `MF_AI_KB_Rules` + `MF_AI_KB_Templates`.
- **Server-side gate:** `MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs` — kiểm tra `customHtml`, `customCss`, `customScripts`, `theme`, `themeCssOverrides` có bị xóa trắng không.

### 4.2. Các cơ chế bảo vệ thiết kế hiện tại

| Gate | Vị trí | Tác dụng | Hạn chế |
|------|--------|----------|---------|
| PRESERVE-001 | `ops.ts` 487–506 | Chặn `add_field` khi `customHtml` non-empty và key mới không có placeholder. | Chỉ chặn `add_field`, không chặn `replace_form_schema`. |
| PRESERVE-002 | `ops.ts` 1053–1118 | Chặn `replace_form_schema` nếu form có customisation và không có `preserveCustomizations:true` / `mergeWithCustomHtml:true`. | AI vẫn có thể emit `replace_form_schema` với `preserveCustomizations:true` nhưng kèm `customHtml` khác non-empty → gate không block. |
| PRESERVE-003 | `ops.ts` 508–530 | Chặn Html field chứa `<style>` global. | Không bảo vệ `customCss` bị ghi đè. |
| CONVERT-001 | `ops.ts` 806–824, 836–845, 864–871 | Chặn BLANK `customCss` / `customHtml` / `theme`. | Không chặn replacement với giá trị khác non-empty. |
| ASK-DESIGN | `chat.ts` 773–805 | AI phải hỏi user trước khi sửa form có customisation. | Có thể bị bypass bởi MINIMAL-CHANGE rule. |
| Auto-sync placeholders | `ops.ts` 1090–1111 | Tự động append `{{field:newkey}}` khi preserve customHtml. | Append ở cuối HTML → phá layout premium. |
| DesignPreservationGate.cs | Server | Chặn blanking 5 trường design. | Chỉ check `IsNonEmpty`, không so sánh nội dung. |

### 4.3. Rủi ro mất thiết kế Premium khi AI sửa nội dung

1. **Ghi đè `customHtml`/`customCss` non-empty không bị chặn.**
   - AI có thể emit `replace_form_schema` với `preserveCustomizations:true` nhưng thay thế toàn bộ `customHtml`/`customCss` bằng nội dung mới.
   - Gate chỉ chặn khi giá trị mới là rỗng.

2. **Theme allowlist cứng nhắc.**
   - `ops.ts:878` chỉ cho phép 13 theme chuẩn.
   - Các premium theme (`euro-youth-premium`, `pure-grid-premium`, `american-auto-premium`, ...) sẽ bị `[THEME-001]` reject nếu AI cố set lại theme.

3. **Auto-sync placeholders phá layout.**
   - Field mới được append vào cuối `customHtml`, không đúng vị trí thiết kế.

4. **`customScripts` / `themeSelector.presets` dễ bị ghi đè.**
   - `set_form_meta` merge `customScripts` mà không kiểm tra key cũ.
   - `themeSelector.presets` là object lớn, AI có thể vô tình xóa/sửa.

5. **Field key rename làm dead reference.**
   - Nếu AI đổi `first_name` → `customer_name`, các `{{field:first_name}}` trong `customHtml` thành orphan.

6. **Không có style guide riêng cho từng template premium.**
   - AI không biết đâu là layout cố định, đâu là token có thể đổi, đâu là vị trí đúng của từng field.

### 4.4. Định hướng cải tiến JSON/KB để bảo toàn thiết kế Premium

#### a) Tách Design Tokens ra khỏi `customCss`

Thay vì nhúng màu/font/spacing trực tiếp vào `customCss`, định nghĩa `designTokens` riêng:

```json
{
  "settings": {
    "theme": "euro-youth-premium",
    "designTokens": {
      "--ey-primary": "#10b981",
      "--ey-primary-dark": "#059669",
      "--ey-font-heading": "'Bricolage Grotesque', sans-serif",
      "--ey-font-body": "'Inter', sans-serif",
      "--ey-max-width": "1152px",
      "--ey-hero-image": "/Modules/MegaForm/img/euro-youth/euro-youth-hero.png"
    },
    "customCss": "/* chỉ chứa layout & component-specific rules, tham chiếu var() */"
  }
}
```

- AI chỉ được phép sửa `designTokens` khi user yêu cầu đổi màu/font.
- `customCss` giữ layout structurally stable.

#### b) Style Guide riêng cho từng Premium Template

Mỗi template premium có một `styleGuide` entry trong KB:

```json
{
  "slug": "styleguide-euro-youth",
  "kind": "style_guide",
  "body": {
    "templateKey": "euro-youth-application",
    "immutable": ["scopedRootSelector", "htmlStructure", "wizardScript"],
    "mutableTokens": ["--ey-primary", "--ey-primary-dark", "--ey-hero-image"],
    "safeEditableContent": [
      "settings.customContent.hero_tagline",
      "settings.customContent.footer_note"
    ],
    "allowedFieldKeyRemap": {
      "first_name": "first_name",
      "last_name": "last_name",
      "email": "email"
    },
    "placeholderLayoutMap": {
      "first_name": ".ey-page[data-step='0'] .ey-grid-name",
      "last_name": ".ey-page[data-step='0'] .ey-grid-name",
      "programme": ".ey-page[data-step='1'] .ey-programme-group"
    }
  }
}
```

- AI phải gọi `get_style_guide(templateKey)` trước khi sửa premium form.
- `placeholderLayoutMap` giúp AI biết chèn field mới đúng vị trí.

#### c) Immutable Design Tokens

- Đánh dấu một số token là `immutable` (font thương hiệu, màu chủ đạo cố định).
- Dispatcher từ chối ops sửa token immutable trừ khi có `allowImmutableDesignChange:true` và user confirm.

#### d) Prompt Injection & KB Recipes

Tạo KB recipe `recipe-edit-premium-form`:

```
You are editing a PREMIUM form "{{templateKey}}".
IMMUTABLE: {{immutable.join(', ')}}
MUTABLE TOKENS: {{mutableTokens.join(', ')}}
FIELD LAYOUT MAP: {{placeholderLayoutMap}}
RULES:
1. NEVER replace customHtml or customCss entirely.
2. For color/font/width tweaks, use designTokens or customCssAppend with scoped selector {{scopedRootSelector}}.
3. When renaming a field key, you MUST update the corresponding {{field:KEY}} in customHtml using placeholderLayoutMap.
4. New fields MUST be placed according to placeholderLayoutMap; if no slot exists, ask the user.
5. ALWAYS preserve settings.theme and settings.customScripts.
```

- System prompt tự động inject style guide khi `inspect_form_customizations` phát hiện template premium.

#### e) Placeholder Consistency Validator

Mở rộng `DesignPreservationGate.cs` hoặc thêm `CustomHtmlValidator`:

```csharp
public class CustomHtmlPlaceholderValidator
{
    public static ValidationResult Validate(string customHtml, List<Field> fields)
    {
        var referenced = ExtractFieldKeys(customHtml);
        var missing = fields.Select(f => f.Key).Except(referenced);
        var orphaned = referenced.Except(fields.Select(f => f.Key));
        return new ValidationResult { Missing = missing, Orphaned = orphaned };
    }
}
```

- Reject save nếu có missing/orphaned placeholders (trừ khi `allowPlaceholderMismatch=true`).

#### f) Template References thay vì Inline customHtml

Thay vì copy toàn bộ HTML vào `customHtml`, premium template có thể dùng:

```json
{
  "settings": {
    "templateRef": "euro-youth-application",
    "templateVersion": "1.0"
  }
}
```

- Renderer load HTML/CSS từ template registry.
- `customHtml` chỉ chứa override nhỏ.
- AI không thể vô tình xóa toàn bộ HTML.

#### g) Tách `themeSelector.presets` ra khỏi schema

- Lưu `themeSelector.presets` trong file template riêng hoặc bảng `MF_Theme_Presets`.
- Schema chỉ giữ `themeSelector.defaultThemeKey` + `enabled`.
- AI chỉ được phép đổi `defaultThemeKey`.

#### h) Mở rộng Theme Allowlist / Premium Theme Registry

- Cho phép theme name tùy chỉnh nếu có `customHtml` + `customCss` đi kèm (ví dụ: prefix `premium-` được chấp nhận nếu `customCss` non-empty).
- Hoặc đăng ký các premium theme vào theme registry riêng.

---

## 5. Kết nối giữa hai vấn đề: Thank You + AI Preservation

Khi AI sửa một form premium, nếu AI emit `replace_form_schema` để thay đổi nội dung thank you (hoặc migration tool tự động chuyển `successMessage` → `postSubmitExperience`), có nguy cơ:

1. `customHtml` bị ghi đè → layout premium mất.
2. `customCss` bị ghi đè → thank you message không có style đúng.
3. `postSubmitExperience` được thêm vào `settings` nhưng `customCss` chưa style cho `.mf-postsubmit-{fid}` → thank you hiển thị không đẹp hoặc không nằm trong card.
4. AI thêm field mới → auto-sync append placeholder cuối `customHtml` → phá layout → field mới và thank you sau này có thể bị đẩy ra ngoài vùng thiết kế.

Vì vậy, việc migrate sang `postSubmitExperience` phải đi kèm:
- Style guide xác định cách thank you được render trong `.mfp-form-inner`.
- CSS scoped cho `.mf-postsubmit-{fid}` (hoặc class con) để match theme.
- Placeholder consistency validator đảm bảo field keys đồng bộ.

---

## 6. Khuyến nghị hành động (không code)

### 6.1. Ngắn hạn

1. **Xác nhận bundle renderer đang chạy trên production là phiên bản mới.**
   - Kiểm tra `megaform-renderer.js` tại 3 platform có cùng timestamp/hash.
   - Kiểm tra trong browser console có `window.__MF_POST_SUBMIT_IN_CARD_BADGE__` (hoặc tương đương) không.

2. **Kiểm tra 39 form premium trên staging/production sau submit.**
   - Ghi lại screenshot thank you của từng form.
   - Xác định form nào thank you nằm ngoài body/card.

3. **Migrate `successMessage` → `settings.postSubmitExperience` cho 39 form.**
   - Giữ message cũ làm `message`.
   - Thêm `title`, `mode: "rich"`, `enabled: true`, `allowFillAgain: true` phù hợp.
   - Không thay đổi `customHtml`/`customCss` trong bước này.

4. **Sửa placeholder mismatch trong các file đã phát hiện.**
   - `megaform-italian-romantic-fixed.json`, `megaform-multipurpose-usa.json` cần đồng bộ field key với customHtml.
   - Các field row/section/gallery cần quyết định: giữ lại trong customHtml hay đánh dấu là hidden/structural field.

### 6.2. Trung hạn

5. **Triển khai `designTokens` và `styleGuide` cho từng premium template.**
   - Bắt đầu với 3–5 template phổ biến nhất (`pure-grid-premium`, `euro-youth-premium`, `american-auto-premium`).
   - Tách màu/font/spacing ra `designTokens`; `customCss` chỉ còn layout.

6. **Mở rộng KB với style guide và placeholder layout map.**
   - Tạo KB entries `styleguide-<templateKey>`.
   - Cập nhật system prompt/recipe để AI tự động load style guide.

7. **Triển khai Placeholder Consistency Validator.**
   - Client-side trước khi apply ops.
   - Server-side trước khi save.

### 6.3. Dài hạn

8. **Chuyển sang Template References.**
   - Premium templates load HTML/CSS từ registry.
   - Schema chỉ giữ override nhỏ.

9. **Chuẩn hóa DOM skeleton cross-platform.**
   - Oqtane/DNN/Web render skeleton giống nhau hoặc đều dùng mount div.

10. **Xóa renderer cũ `megaform-renderer.ts`.**
    - Sau khi xác nhận không còn reference.

---

## 7. Kết luận

- **Thank you ngoài form body** chủ yếu do bundle renderer cũ + custom HTML làm thay đổi visual card + fallback DOM host + các form đang dùng legacy `successMessage`. Giải pháp cốt lõi là đảm bảo renderer mới được triển khai, migrate sang `postSubmitExperience`, và xử lý visual card cho custom HTML.
- **AI bảo toàn thiết kế premium** cần vượt qua mức "chống xóa trắng". Cần tách `designTokens`, có `styleGuide` + `placeholderLayoutMap` riêng cho từng template, validator đồng bộ placeholders, và cơ chế template references để AI không thể vô tình xóa toàn bộ HTML/CSS.
- **Các form JSON trong `Premium-Fixed-ChipCards-Compact-20260619`** đều chưa dùng `postSubmitExperience` và một số có placeholder mismatch. Trước khi cho AI chỉnh sửa hàng loạt, cần khắc phục mismatch và thiết lập KB/style guide; nếu không, AI sẽ tiếp tục làm gián đoạn layout và thank you.
