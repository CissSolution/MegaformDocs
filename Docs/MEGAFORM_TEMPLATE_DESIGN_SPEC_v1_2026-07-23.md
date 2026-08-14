# MEGAFORM TEMPLATE DESIGN SPEC (BẮT BUỘC) — v1.0

> Ngày ban hành: 2026-07-23 · Trạng thái: **NORMATIVE** — mọi MegaForm form template mới PHẢI tuân theo.
> Căn cứ: phân tích giải phẫu bộ template mới nhất (`euro-youth-application`, `event-registration-rsvp`, `wellness-patient-intake`, `project-intake-onboarding`, `tabbed-account-setup`) + runtime enforcement thật trong `MegaForm.Core` / `MegaForm.UI` / `tools/template-lint`.
> Mục tiêu: (1) một hình thức duy nhất cho template mới — chấm dứt drift 3 thế hệ format; (2) giảm tối đa công sức convert mock design → MegaForm theme nhờ grammar cố định; (3) template "safe by construction" — qua được lint/facts/AI-guard mà không cần vá sau.
> Quy ước ngôn ngữ: **PHẢI** (MUST) = vi phạm → template bị reject ở review/QA; **KHÔNG ĐƯỢC** (MUST NOT); **NÊN** (SHOULD) = chấp nhận lệch nếu có lý do ghi trong PR; **CÓ THỂ** (MAY).
> Thuật ngữ giữ tiếng Anh khi là tên kỹ thuật (shell, token, channel, policy…).

---

## 0. Định nghĩa & phạm vi

- **Template** = 1 file JSON (form schema mở rộng) mà gallery/AI load để tạo form. Không phải theme preset, không phải widget row template.
- **Shell** = cặp `customHtml` + `customCss` dựng sẵn vỏ ngoài premium (layout, stepper, brand, actions).
- **Manifest v2** = `manifestVersion: 2` + `settings.themeCompatibility`.
- Spec này áp cho: template mới author từ đầu, template convert từ mock design (Figma/HTML), template retrofit từ Gen-1/Gen-2. Template Gen-1/2 đang ship **không** bắt buộc viết lại, nhưng mọi chỉnh sửa chạm vào chúng PHẢI kéo về chuẩn gần nhất có thể (xem §12 retrofit).
- Spec KHÔNG áp cho: Pure Grid corpus (đã có canonical CSS byte-frozen riêng — `pure-grid-canonical-css.md`), KB rows, widget HTML row templates trong `Samples/Templates`.

### 0.1 Ba thế hệ hiện hữu (để nhận diện khi convert)

| Gen | Đại diện | Dấu hiệu | Xử lý |
|---|---|---|---|
| Gen-1 | sticky-spark, aurora, american-auto | `:root{--x:#hex}` global, không manifest, `customContent` nặng, duplicate PascalCase | CẤM author mới theo mẫu này |
| Gen-2 | euro-youth + variants, tabbed, festa (retrofit locked) | manifest v2, token 3-channel theo prefix riêng, `@import` font | Cho phép duy trì; mẫu tham chiếu phụ |
| **Gen-3 (CHUẨN MỚI)** | event-registration-rsvp, wellness, project-intake | slim envelope, generic `--mf-*` tokens 3-channel, premium-native steps, system font stack | **MẪU BẮT BUỘC cho template mới** |

Mọi ví dụ "canonical" trong spec này lấy từ `event-registration-rsvp` (đơn giản nhất) và `euro-youth-application` (đầy đủ nhất).

---

## 1. JSON envelope — PHẢI đúng shape Gen-3

### 1.1 Top-level keys

| Key | Bắt buộc | Quy tắc |
|---|---|---|
| `title` | PHẢI | Chuỗi hiển thị trong gallery. |
| `slug` | PHẢI | kebab-case, unique toàn corpus; **file name PHẢI là `<slug>.json`** (phản ví dụ cần tránh: `youth-application.json` chứa slug `euro-youth-application`). |
| `description` | PHẢI | 1 câu; hiển thị gallery + AI recall. |
| `category` | PHẢI | 1 trong taxonomy hiện hữu (xem §11.2). |
| `categories` | NÊN | Mảng gồm primary + nhãn phụ (`["event-registration","premium"]`). |
| `icon` | NÊN | 1 emoji hoặc Lucide keyword; default xấu (`✦`). |
| `theme` | PHẢI (1 trong 2 nơi) | Gen-3: top-level `"theme":"system"`; Gen-2: `settings.theme:"<name>-premium"`. Template mới dùng `"system"` trừ khi có lý do brand (xem §7.5). |
| `fields` | PHẢI | Xem §4. |
| `settings` | PHẢI | Xem §2 — **single source** cho mọi key vận hành. |
| `templateGuideSlug` | PHẢI với premium shell | Dạng `tpl-<slug>`; trỏ tới cặp `.guide.md`/`.facts.json` (§8). |
| `manifestVersion` | PHẢI | `2`. (Runtime không đọc — đây là marker cho tooling/normalize/lint; vắng = template chưa chuẩn.) |
| `submitButtonText` / `successMessage` | CÓ THỂ | Chỉ khai báo nếu shell KHÔNG tự render actions. Shell premium tự render → text submit nằm trong shell (§5.6). |
| `rules` | CÓ THỂ | `[]` hoặc theo canonical rule shape (§4.6). |
| `workflow` | CÓ THỂ | `{"notifications":[]}` hoặc `null`. |

### 1.2 KHÔNG ĐƯỢC (legacy bị cấm trong template mới)

- KHÔNG ĐƯỢC duplicate `customHtml` / `customCss` / `customScripts` / `customContent` / `theme` / `themeSelector` giữa top-level và `settings.*`. Server serving rule (`BuilderTemplateCatalogStore.Normalize`) là case-sensitive và sẽ **drop** bản top-level của `theme/themeSelector/customScripts/customContent` → mất dữ liệu âm thầm.
- KHÔNG ĐƯỢC dual-case keys (`customCss` + `CustomCss`, `properties` + `Properties`) — lint báo structural issue; converter cũ từng sinh lỗi này.
- KHÔNG ĐƯỢC dùng `customContent` + token `{{content:KEY}}` (Gen-1 idiom). Text trong shell là hardcode + sửa qua op `set_html_text`; nguồn sự thật là `shellTexts` trong facts (§8).
- KHÔNG ĐƯỢC `customScripts` cho cơ chế step/wizard — step là native (§5.4). Ngoại lệ duy nhất: tabs (§5.5).

---

## 2. `settings` anatomy — bắt buộc tối thiểu

```jsonc
"settings": {
  "multiPage": true,                      // bắt buộc nếu >1 step
  "premiumNativePageBreak": true,         // bắt buộc với premium-native steps
  "premiumGeneratedShell": true,
  "showProgressBar": true,                // false khi pageNavigationMode = "tabs"
  "themeSelector": { "enabled": false },
  "customHtml": "<…shell…>",              // §5
  "customCss": "/* … */",                 // §6
  "customScripts": {},                    // rỗng; chỉ tabs mới có key script
  "themeCompatibility": { … }             // §3 — BẮT BUỘC
}
```

- `settings.theme`: theo §1.1. Nếu theme ở top-level (`"system"`) thì KHÔNG lặp lại trong settings.
- Gen-2 giữ `settings.theme:"<name>-premium"`; khi đó `settings.themeCompatibility.policy` quyết định inherit (§3).
- NÊN khai báo `premiumNativeMigrationBadge` khi template được convert từ legacy (truy vết nguồn gốc).

---

## 3. `themeCompatibility` (manifest v2) — BẮT BUỘC, khai đúng sự thật

```jsonc
"themeCompatibility": {
  "policy": "tokenized",            // "tokenized" | "hybrid" | "locked"
  "supportsPageColors": true,
  "supportsPageTypography": true,
  "supportsDarkHost": true,
  "prefixes": ["ey"],               // mọi CSS-var prefix riêng của template
  "immutable": ["--mf-error semantic red #ef4444", "hero image", "brand gradient"]
}
```

### 3.1 Ngữ nghĩa `policy` (runtime THỰC SỰ đọc key này — `ThemeFirstPaintCssService.ReadTemplatePolicyAllowsBorrow`)

| policy | Ý nghĩa runtime | Khi nào dùng |
|---|---|---|
| `tokenized` | Cho phép "From page" recolor dù CSS khai báo premium vars | **Default cho template mới** — mọi màu đã chain 3-channel (§6.2) |
| `hybrid` | Như tokenized nhưng một phần shell vẫn hardcode | Shell có vùng brand cố định (hero, aside) nhưng form body inherit được (mẫu: euro-youth) |
| `locked` | KHÔNG bao giờ borrow — giữ authored palette kể cả khi user bật "From page" | Brand identity bất biến (festa-italiana, americana-journey, bulgaria) |

### 3.2 Quy tắc khai báo

- `policy` PHẢI khớp sự thật của CSS: khai `tokenized` mà CSS còn hardcode màu ngoài token defs là **vi phạm spec** (lint đếm `hard main` — xem §10.1).
- `supportsPageColors/Typography/DarkHost`, `prefixes`, `immutable`: runtime hiện KHÔNG đọc (chỉ tooling + policy-map + reviewer đọc) — nhưng PHẢI khai đúng để `policy-map.json` và docs không drift. Khi runtime bổ sung consumer cho các key này, khai sai = bug.
- `prefixes`: liệt kê MỌI prefix `--<p>-*` template định nghĩa (kể cả prefix stray do copy từ template khác — tốt hơn là xóa stray, xem §6.7).
- `immutable`: mọi giá trị KHÔNG retheme — semantic colors (error/success), brand assets (hero image, logo), brand gradient, font display đặc thù.
- Slug mới PHẢI được thêm vào `tools/template-lint/policy-map.json` trong cùng PR.
- KHÔNG có key `colorSource` trong schema — inherit được điều khiển bởi 2 boolean `settings.inheritPageColors` / `settings.inheritPageTypography` (builder theme tab). Template chỉ cần "sẵn sàng bị borrow" (§6.2), không tự bật 2 cờ này.

---

## 4. Field model

### 4.1 Field shape — PHẢI slim

```jsonc
{ "key": "first_name", "type": "Text", "label": "First Name", "placeholder": "Alex", "required": true }
```

- Chỉ khai key cần thiết; KHÔNG ĐƯỢC khai đủ 17 key rỗng kiểu Gen-2 (`helpText:""`, `defaultValue:""`, `cssClass:""`…) — nhiễu diff và AI context.
- `key`: snake_case, ổn định vĩnh viễn — shell tham chiếu `{{field:key}}`; đổi key = vỡ shell (dispatcher `PRESERVE-001`/guide chặn, nhưng spec cấm từ đầu).
- `placeholder`: dùng placeholder THẬT có nghĩa ("anna@email.eu"). Idiom floating-label `placeholder:" "` CHỈ thuộc Pure Grid / floating-label family — KHÔNG ĐƯỢC đưa vào premium shell mới.
- `validation`: để `{}` trừ khi có yêu cầu thật; `required` là cơ chế mặc định của corpus.

### 4.2 Field types được phép

Text, Input, Email, Phone, Url, Number, Date, Time, Select, Radio, Checkbox, Textarea, Rating, Hidden, Section, Row, Html. Các type khác (Payment, Signature, File, Razor, DataRepeater, DataGrid, DynamicLabel…) PHẢI nằm trong `compositeWidgetPolicy.forbiddenFieldTypes` của guide và chỉ dùng khi template thật sự cần (kèm guide cập nhật).

### 4.3 Section step markers (premium-native) — bắt buộc khi multiPage

```jsonc
{ "key": "step_attendee", "type": "Section", "label": "Attendee", "required": false,
  "pageBreak": true, "stepLabel": "Attendee", "stepSubtitle": "Step 1 of 4",
  "heading": "Who's attending?", "intro": "Tell us who's coming.",
  "properties": { "pageBreak": true, "premiumNativeStep": true, "generatedPremiumStep": true, "premiumStepIndex": 1, "legacyDataStep": 0 } }
```

- Số Section marker = số panel `data-step` trong shell (§5.4). Step 1 CÓ THỂ `pageBreak:false` (panel đầu hiển thị sẵn).
- KHÔNG ĐƯỢC PascalCase `Properties` duplicate (converter cũ từng sinh — strip khi normalize).

### 4.4 Rich-choice (cards/chips) — triplication bắt buộc

Khi dùng `optionDisplay` ≠ default, PHẢI khai đồng bộ cả 3 lớp (renderer đọc nhiều nơi):

```jsonc
{ "key": "ticket_type", "type": "Radio", "label": "Ticket type", "required": true,
  "optionDisplay": "cards", "choiceDisplay": "cards", "optionVariant": "cards", "optionColumns": 1,
  "properties": { "optionDisplay": "cards", "optionColumns": 1 },
  "widgetProps": { "optionDisplay": "cards", "optionColumns": 1 },
  "options": [ { "label": "General", "value": "general", "icon": "🎟", "badge": "Popular", "description": "…" } ] }
```

- Option keys chuẩn: `label, value, description, meta, badge, icon` (+ `richHtml` khi `allowOptionHtml:true`; `badge` là TEXT thuần — HTML bị escape).
- Icon: KHÔNG ĐƯỢC invent icon cho option không có; không có thì omit (guide formula C7).

### 4.5 Row

- `Row.columns[] = [{ "span": <1-12>, "fields": […] }]` — tổng span = 12, tối đa 4 cột, KHÔNG lồng Row. Legacy flat `fields[]` sẽ bị `TemplateSchemaCanonicalizer` auto-chunk — template mới PHẢI ghi đúng shape ngay.
- Trong premium shell, NÊN bố cục bằng shell grid (`mfp-field-row/col`, §5.3) thay vì Row field; Row chỉ khi cần builder quản lý.

### 4.6 rules[] — canonical shape

```jsonc
{ "id": "other_toggle", "name": "Toggle other", "enabled": true, "priority": 1,
  "when": { "type": "rule", "field": "project_type", "operator": "eq", "value": "other" },
  "then": [ { "id": "…", "action": "show", "targetType": "field", "target": "other_project_type" } ],
  "else": [ { "id": "…", "action": "hide", "targetType": "field", "target": "other_project_type" } ] }
```

- Operators: `eq, ne, contains, not_contains, gt, lt, gte, lte, empty, not_empty, in, not_in`. Actions: `show, hide, enable, disable, require, optional, clear`. Mọi rule PHẢI có cả `then` lẫn `else`.

### 4.7 Hidden tracking fields

NÊN có `utm_source` / `utm_campaign` dạng `Hidden` ở step cuối cho marketing template (corpus mới đều có).

---

## 5. `customHtml` shell — grammar bắt buộc

### 5.1 Root

```html
<div class="mfp mfp-<slug> mfp-native-generated" data-mf-flexgrid="locked">
```

- Double-class `.mfp.mfp-<slug>` PHẢI khớp đúng `slug` (specificity hack + runtime detect).
- `mfp-native-generated` = cờ premium-native (renderer kiểm tra). `data-mf-flexgrid="locked"` khóa flex-grid editor.
- `<slug>` trong class PHẢI trùng `slug` JSON (KHÔNG được rút gọn: `mfp-event-registration-rsvp` ✔, `mfp-rsvp` ✘). Tiền tố class nội bộ ngắn (`ey-*`, `rsvp-*`) CÓ THỂ dùng bên trong, nhưng root luôn là full slug.

### 5.2 Skeleton chuẩn (sidebar stepper — mẫu Gen-3)

```html
<div class="mfp mfp-<slug> mfp-native-generated" data-mf-flexgrid="locked">
  <div class="mfp-layout">
    <aside class="mfp-sidebar"><div class="mfp-sidebar-inner">
      <div class="mfp-brand">…</div>
      <div class="mfp-sidebar-heading"><h1 class="mfp-form-title">…</h1><p class="mfp-form-subtitle">…</p></div>
      <nav class="mfp-stepper"><ol class="mfp-stepper-list">
        <li class="mfp-stepper-item" data-step="0" data-mf-native-step="0">…01…label…subtitle…</li> ×N
      </ol></nav>
      <div class="mfp-sidebar-footer">…</div>
    </div></aside>
    <main class="mfp-main">
      <nav class="mfp-stepper-mobile">… N × li[data-step] …</nav>
      <div class="mfp-progress-bar" role="progressbar" aria-valuemin="1" aria-valuemax="N" aria-valuenow="1"><span class="mfp-progress-fill"/></div>
      <div class="mfp-page mfp-step" data-step="0" data-mf-native-page="0"> …fields… <div class="mfp-actions">…next…</div></div>
      …
      <div class="mfp-page mfp-step" data-step="N-1" data-mf-native-page="N-1"> … <div class="mfp-actions">…back…submit…</div></div>
    </main>
  </div>
</div>
```

### 5.3 Field placement & token grammar

- Token DUY NHẤT được phép: `{{field:KEY}}` — mỗi field đúng 1 token, mỗi token trỏ đúng 1 field tồn tại. Zero orphan, zero missing (facts `--check` sẽ bắt).
- Field token đứng TRẦN (KHÔNG bọc `<label>` quanh token — label thật của field hiển thị). Ngoại lệ Gen-2 (euro-youth) bọc `<label class='ey-field'>` + ẩn `.mf-field-label` bằng CSS — pattern này làm text caption nằm trong shell; template mới KHÔNG NÊN theo, trừ khi design bắt buộc (khi đó caption PHẢI có trong `shellTexts`).
- Cụm 2 cột: `<div class="mfp-field-row"><div class="mfp-field-col">{{field:a}}</div><div class="mfp-field-col">{{field:b}}</div></div>`.
- KHÔNG ĐƯỢC dùng `{{content:*}}`, `{{script:*}}` (Gen-1). `{{form:title|description|submit}}` chỉ thuộc Pure Grid.

### 5.4 Step hooks (premium-native) — PHẢI đủ để engine điều khiển

- Mỗi panel: `data-step="i"` VÀ `data-mf-native-page="i"`.
- Stepper item: `data-step="i"` VÀ `data-mf-native-step="i"`.
- Buttons: next `<button type="button" class="mfp-btn mfp-btn-next" data-mfp-next data-mf-native-next>`, back `data-mfp-back data-mf-native-back`, submit `<button type="submit" class="mfp-btn mfp-btn-submit" data-mf-native-submit>`.
- `settings.premiumNativePageBreak:true` + Section markers §4.3 + N panels. Engine thêm `mf-premium-native-mode` vào wrapper.
- KHÔNG ĐƯỢC viết wizard JS riêng (`customScripts`) cho step. Attribute lạc kiểu `data-ey-wizard='1'` là relic — cấm trong template mới.

### 5.5 Tabs (thay stepper)

- `settings.pageNavigationMode:"tabs"` + `tabbedForm:true` + `showProgressBar:false`.
- Shell: `<nav class="mfp-tabbar"><button class="mfp-tab" data-step="i" data-mf-native-step="i">` + panels như §5.4 + `<footer class="mfp-actions" data-mf-native-actions>`.
- Cho phép ĐÚNG 1 `customScripts.<slug>_tabs` (IIFE, guard `scope.__mfTabbed…Ready`) để chuyển tab; root có `data-mf-script-root="<slug>_tabs"`.

### 5.6 Actions & submit

- Shell tự render actions (§5.2). Text submit sống trong shell (`Reserve My Spot`) — khi đó top-level `submitButtonText` trở thành dormant; vẫn NÊN khai trùng nội dung để metadata nhất quán.
- Link cancel/back ngoài luồng form KHÔNG ĐƯỢC trỏ URL tuyệt đối ngoài kiểm soát (phản ví dụ Gen-2: `href='/premium-forms'`).

### 5.7 shellTexts — mọi text hardcode PHẢI liệt kê được

Mọi chuỗi text trong shell (brand label, H1/H2, subtitle, step label/subtitle, eyebrow, footer note, button text) PHẢI xuất hiện trong `shellTexts[]` của facts/guide — đây là bề mặt duy nhất AI/user được phép đổi qua op `set_html_text` (exact-match). Text nào không đáng đổi (legal, co-funded note) vẫn liệt kê nhưng đánh dấu trong guide là read-only.

### 5.8 Accessibility

PHẢI có: `role="progressbar"` + `aria-valuemin/max/now` trên progress bar; `aria-label` trên stepper nav; heading hierarchy h1→h2 hợp lệ; button `type` đúng (`button` vs `submit`).

---

## 6. `customCss` — kiến trúc bắt buộc

### 6.1 Thứ tự block (template mới PHẢI theo)

1. **(CÓ THỂ) Font `@import`** — xem §6.6.
2. **Root token block** trên `.mfp.mfp-<slug>{ … }` — toàn bộ token định nghĩa tập trung ở ĐÂY (§6.2).
3. **Scoped component rules** — mọi selector prefix `.mfp-<slug> …` (double-class khi cần đè). Thứ tự NÊN: reset/box-sizing → layout → sidebar/brand → stepper → progress → page/step-head → field-row/col → input overrides (`.mf-input/.mf-select/.mf-textarea`) → choice chips/cards → review/summary → actions/buttons → footer.
4. **Hide-native chrome block**: `.mfp-<slug> .mf-form-title, .mf-form-description, .mf-success-message, .mf-form-actions { display:none!important }` + `.mf-premium-native-mode .mf-form-actions{display:none!important}`.
5. **Wrapper re-scope**: `.mf-form-wrapper>.mf-form-inner .mfp.mfp-<slug>{width:100%!important;max-width:<W>!important;…}` (W = khung thiết kế, vd 1152px).
6. **Media queries** — breakpoint chuẩn: mobile-first `@media (min-width:640px)` và `@media (min-width:1024px)`; fixup nhỏ cho phép `@media (max-width:720px/560px)`.
7. **Closing pixel-fixes** (nếu có) — gom ở cuối, comment lý do.

### 6.2 Token grammar 3-channel — CỐT LÕI của theme inheritance

Mọi màu/surface/text/border PHẢI định nghĩa dạng:

```css
.mfp.mfp-<slug>{
  --mf-primary:      var(--mf-page-primary, var(--mf-preset-primary, #f59e0b));
  --mf-primary-hover:var(--mf-page-primary, var(--mf-preset-primary, #d97706));
  --mf-primary-light:#fef3e0;                       /* tint tĩnh — khai immutable nếu brand */
  --mf-accent:       var(--mf-page-primary, var(--mf-preset-primary, #f59e0b));
  --mf-bg:           var(--mf-page-surface, var(--mf-preset-bg,      #0f0f13));
  --mf-text:         var(--mf-page-text,    var(--mf-preset-text,    #f1f0ed));
  --mf-muted:        var(--mf-page-muted,   var(--mf-preset-text,    #a7a29a));
  --mf-border:       var(--mf-page-border,  var(--mf-preset-border,  #2a2a30));
}
```

- Chuỗi: **page channel → preset channel → authored hex**. Đây là cách "Color source: From page" (`inheritPageColors`) chạm tới được shell: runtime chỉ inject `--mf-page-*` khi borrow, `--mf-preset-*` khi preset active; shell tự hardcode hoặc tự redefine var ở root riêng sẽ **shadow** kênh page → mất inheritance (lỗi Gen-1).
- Tên kênh page chuẩn (runtime cấp): `--mf-page-primary/-surface/-wash/-text/-heading/-muted/-border/-input-bg/-focus-soft`. Preset chuẩn: `--mf-preset-primary/-accent/-text/-border/-surface/-bg/-on-primary`.
- Template có prefix riêng (Gen-2 style) vẫn được: `--ey-primary: var(--mf-page-primary, var(--mf-preset-primary, #1c1917));` — khi đó prefix PHẢI khai trong `themeCompatibility.prefixes` và được runtime alias fan-out tự động (prefix mới tự detect, không cần sửa engine).
- Reads ngoài token block PHẢI đọc qua `var(--x, <inline fallback>)` — không đọc trần.

### 6.3 Giá trị immutable

- Semantic colors (error `#ef4444`/`#dc2626`, success `#059669`), brand assets (hero image URL, logo, brand gradient), hero overlay text trắng: hardcode trực tiếp + liệt kê trong `themeCompatibility.immutable` + guide `immutable[]`.
- Hero image PHẢI là asset local bundle theo template (§9), KHÔNG ĐƯỢC stock URL ngoài (dead-link risk — corpus từng vỡ vì Unsplash).

### 6.4 Scoping & `!important`

- KHÔNG ĐƯỢC viết rule global trần (`:root{--x…}`, `body{…}`, `.mf-input{…}` không prefix) — mọi rule nằm dưới `.mfp-<slug>` hoặc wrapper scope ở §6.1(5).
- `!important` CHỈ dùng: (a) đè engine input defaults, (b) wrapper re-scope, (c) hide-native chrome, (d) closing pixel-fix. Lạm dụng = khó inherit.

### 6.5 Choice chips/cards block

Khi template dùng rich-choice (§4.4), PHẢI có block chuyên trách (mẫu `[PremiumChoiceChipsCards]`): token `--mf-choice-accent/-text/-soft/-on-accent` chain 3-channel; chip = pill `border-radius:999px`; card = `.mf-option-group--cards .mf-option-ui`; checked qua `.mf-option-control:checked + .mf-option-ui`; ẩn native control bằng `position:absolute;opacity:0;clip-path:inset(50%)` (KHÔNG `display:none` — mất focus/keyboard); `:focus-visible` outline rõ.

### 6.6 Fonts

- **Chuẩn mới: system font stack** (`font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif` hoặc thuần system) — Gen-3 bỏ `@import` để khỏi render-block + phụ thuộc ngoài.
- CÓ THỂ `@import` Google Fonts (đặt đầu file, tối đa 2 family, khai `display=swap`) khi display font là brand asset (mẫu: euro-youth 'Bricolage Grotesque') — khi đó font PHẢI nằm trong `immutable`.
- KHÔNG ĐƯỢC hardcode `font-family` rải rác ngoài token/root block (lint đếm `fonts`).

### 6.7 Sạch cross-template

- KHÔNG ĐƯỢC chứa rule/token của template khác (phản ví dụ: euro-youth chứa `--nola-*`, `--aur-*`, `.mfp-coachella…` — leftovers khiến `prefixes` phải khai dối). Convert từ template có sẵn PHẢI xóa sạch phần không thuộc shell mới.
- Prefix var PHẢI unique, 2–4 ký tự, tránh prefix global/reserved: `mf`, `mfp`, `bg`, `bs`, và prefix template khác đã đăng ký trong `policy-map.json`.

### 6.8 Marker conventions (giúp review/QA)

NÊN đánh dấu block bằng comment chuẩn: `/* MF-QA-FIX-vN */` cho các đợt visual-QA append, `/* MF-TOKENIZE */` cho local token defs, `/* MF-TRANSPARENT-OUTER */` khi outer transparent, `/* MF-QA-IMGPATH */` khi override asset path theo host (§9). Marker là "ngăn" để QA sau biết block nào sinh ra ở đợt nào — template mới nên gom sạch ngay từ đầu thay vì chồng 17–30 lớp fix như corpus hiện tại.

---

## 7. Theme inheritance contract (hiểu đúng để không phá)

### 7.1 Pipeline compose lúc render (SSR, `ModuleCssComposer.Compose`)

`preset vars (#mf-form-wrapper-{id}{--mf-preset-*})` → `scoped overrides (cssOverrides + themeCssOverrides, !important, fan-out alias)` → `authored customCss verbatim` → `custom-shell compat` → `module CSS override`.

### 7.2 Kênh page ("From page")

Khi `inheritPageColors=true` và `policy` cho phép: runtime map palette host (Bootstrap 5.3 vars `--bs-primary`… với fallback) vào `--mf-page-*`. Template KHÔNG cần (và KHÔNG ĐƯỢC) tự đọc `--bs-*` — chỉ chain qua `--mf-page-*` như §6.2.

### 7.3 `themeCssOverrides`

- Chỉ chấp nhận key dạng `--*` (regex `^--[a-zA-Z0-9_-]+$`) — mọi override màu từ builder/AI đi qua đây, scoped theo prefix của template. Guide formula C8 PHẢI liệt kê các var override được + giá trị hiện tại + cảnh báo var nào INERT (generic `--primary`/`--accent` không ăn trong shell prefix riêng).

### 7.4 Những gì KHÔNG retheme

`immutable[]` (semantic, brand assets) + mọi hardcode ngoài token defs. Khi convert mock có vùng "không bao giờ đổi màu", đưa vào immutable ngay từ đầu — đừng để QA phát hiện sau.

### 7.5 `settings.theme`

- `"system"` (top-level): shell hoàn toàn tự chịu trách nhiệm visual; preset engine tắt. Chuẩn Gen-3.
- `"<name>-premium"`: có preset đi kèm — PHẢI đăng ký preset trong `settings.themeSelector.presets` hoặc chứng minh preset tồn tại trong engine; nếu không, dùng `"system"`.

---

## 8. Companion files: guide + facts — BẮT BUỘC với premium shell

### 8.1 Ba file một bộ

| File | Vai trò | Quy tắc |
|---|---|---|
| `<slug>.json` | template (spec này) | Trong folder template corpus. |
| `Resources/TemplateGuides/<slug>.guide.md` | **AI Edit Guide** — authoritative | Format frontmatter JSON + body protocol (§8.2). |
| `Resources/TemplateGuides/<slug>.facts.json` | deterministic facts | **SINH TỰ ĐỘNG** bởi `MegaForm.UI/tools/gen-template-facts.cjs` — KHÔNG viết tay. |
| KB row `Kind='template_guide'` | pointer | `Body = {"guide_file":"<slug>.guide.md"}`; slug khớp `templateGuideSlug`. |

- File `.md` format cũ (heuristic DRAFT, vd `euro-youth-application.md`) KHÔNG còn giá trị — KHÔNG ĐƯỢC tạo mới; khi chạm template cũ, xóa hoặc đánh `SUPERSEDED`.
- Guide/facts PHẢI sync đủ 3 platform dirs (Oqtane wwwroot, DNN Resources, Web wwwroot) — generator đã lo; chạy lại generator, không copy tay.

### 8.2 `.guide.md` — cấu trúc bắt buộc

Frontmatter (JSON giữa cặp `---`): `templateGuideSlug, slug, theme, rootSelector, tokenStyle:"double", stepMechanism:"premium-native", stepAnchor:"data-step", stepCount, stepFieldKeys[], chipFields, cardFields, contentTokens:[], colorVars{}, lockedKeys[], missingFieldPlaceholders:[], shellTexts[], allowedOps, forbiddenOps, immutable[], customCssSha256, shellSha256`.

- `allowedOps` chuẩn: `set_form_meta, set_field_property, set_html_text, add_field, remove_field`.
- `forbiddenOps` chuẩn: `replace_form_schema`, `set customHtml/customCss/theme`.
- Body: DETERMINISTIC EDIT PROTOCOL → field map → editable shell text (exact strings) → formulas C1–C8 (meta/field/html-text, chip options, card options, add/remove field, add/remove step, themeCssOverrides scoped) → hard invariants (sha256 của customCss + shell, theme cố định, zero orphan placeholder).
- `compositeWidgetPolicy.forbiddenFieldTypes`: ít nhất `Payment, Signature, File, Razor, DataRepeater, DataGrid, DynamicLabel, GridRepeater, StripePayment, PayPal, Square, UserTemplate, PdfForm` trừ khi template thật sự dùng.

### 8.3 Drift gate

`gen-template-facts.cjs --check` chạy trong `pack.cmd`: facts lệch template → pack fail. Template mới chưa có facts + guide = chưa hoàn thành.

---

## 9. Assets & đường dẫn

- Ảnh/texture PHẢI bundle cùng template (zip import giữ relative path — `BuilderTemplateCatalogStore.ImportZip`), đặt dưới thư mục asset của module (`Assets/img/<slug>/…`).
- CSS tham chiếu asset PHẢI dùng path tương đối module và kèm block override theo host khi cần (`/* MF-QA-IMGPATH */` — DNN `/DesktopModules/MegaForm/Assets/…` vs Oqtane `/Modules/MegaForm/Assets/…`).
- KHÔNG ĐƯỢC: stock URL ngoài (Unsplash source URL…), ảnh hotlink không kiểm soát, base64 > 20 KB nhúng trong CSS (làm phình template JSON).
- KHÔNG nhúng secret/endpoint nội bộ vào customHtml/customCss — chúng được gửi nguyên vẹn tới public client (`FormSchemaSensitivePropertyStripper` KHÔNG strip customHtml/customCss/customScripts).

---

## 10. Toolchain & QA gates (pipeline bắt buộc trước khi merge)

### 10.1 Lint — `node tools/template-lint/lint.mjs <folder> --md`

Report-only (không tự fail) → reviewer PHẢI kiểm:
- **0 structural issues** (dual-case, top+settings duplicate, top-level keys bị drop) — mục này là HARD.
- `hard main` (màu hardcode ngoài token defs) = 0 với policy `tokenized`; ≤ số đã khai `immutable` với `hybrid`; không giới hạn với `locked`.
- `fonts` chỉ ở root block; `prefixes` khớp `themeCompatibility.prefixes`; `manifest` = `v2/<policy>`.

### 10.2 Normalize — `node tools/template-lint/normalize.mjs <folder> --apply`

Gom về single-source `settings.*` + gắn manifest từ `policy-map.json`. Chạy trước khi seed/ship; KHÔNG sửa tay sau normalize.

### 10.3 Facts — `node MegaForm.UI/tools/gen-template-facts.cjs … && … --check`

Sinh `.facts.json` 3 platform + `--check` trong pack (fail khi drift).

### 10.4 Pixel parity

`qa-server.mjs` + `qa-shot.mjs` (steps 0..N) chụp baseline; `qa-diff.py` so với baseline trước — mọi thay đổi CSS/HTML của template đã ship PHẢI có diff = 0% trừ khi cố ý. Template mới: chụp baseline ngay lần đầu và lưu kèm QA folder.

### 10.5 Live verify

`verify-live-gallery.mjs` — template xuất hiện trong gallery, preview render, apply tạo form không lỗi; submit E2E 1 vòng trên 1 host (Oqtane hoặc DNN).

### 10.6 AI-edit smoke (bắt buộc với premium shell)

Mở form tạo từ template → AI chat "đổi tên sự kiện thành X" → xác nhận: customCss/customHtml **sha256 đứng yên** (chỉ `set_html_text`/`set_form_meta`), không op nào bị GUIDE-001…005 reject ngoài ý muốn.

---

## 11. Naming, taxonomy, gallery metadata

### 11.1 Slug & file

- `slug` kebab-case, độ dài ≤ 40, không hậu tố `-1/-2/final/OK/fixed` (hậu tố sửa-chữa là dấu hiệu quy trình hỏng — sửa gốc, không fork bản).
- File = `<slug>.json`, đặt trong folder category của corpus.
- `templateGuideSlug = "tpl-" + slug`.

### 11.2 Category taxonomy (chọn 1 primary)

`application, booking, contact, education, event-registration, feedback, healthcare, hr, nonprofit, order, payment, real-estate, registration, service-request, survey, premium, rtl, floating-label`. Category mới PHẢI được duyệt (ảnh hưởng gallery filter + KB tags).

### 11.3 Gallery card

`title` ≤ 40 ký tự, `description` ≤ 120, `icon` 1 emoji/keyword, `categories` gồm primary + ≤ 2 phụ. Gallery default xấu (`general`/`✦`) — thiếu metadata coi như chưa xong.

---

## 12. Quy trình convert mock design → MegaForm template (checklist 10 bước)

1. **Trích palette & typography** từ mock → bảng: brand colors (→ immutable), surface/text/border/muted (→ tokens 3-channel), semantic (error/success → immutable), fonts (→ §6.6).
2. **Chọn policy**: full inherit → `tokenized`; có vùng brand cố định → `hybrid`; brand bất biến → `locked`. Ghi vào `policy-map.json`.
3. **Dựng shell skeleton** theo §5.2 (sidebar stepper) — KHÔNG vẽ lại từ 0 nếu mock khớp pattern có sẵn (pattern map: sidebar-stepper / hero-2col / single-card / tabs). Đặt fields vào panels, ghi `{{field:KEY}}`.
4. **Viết fields[]** theo §4 (slim, Section markers, rich-choice triplication, Hidden utm).
5. **Viết customCss** theo thứ tự §6.1: token block 3-channel trước, component rules sau; verify mọi màu đều qua `var(--mf-page-*, var(--mf-preset-*, #authored))` hoặc nằm trong immutable.
6. **Điền envelope + settings + themeCompatibility** (§1–§3), file `<slug>.json`.
7. **normalize --apply → lint --md**: 0 structural issues, hard-main = 0 (tokenized).
8. **gen-template-facts + viết `.guide.md`** (frontmatter + C1–C8 + sha256 invariants) + KB pointer row.
9. **Pixel baseline + live verify + AI-edit smoke** (§10.4–10.6).
10. **Package**: seed vào KB `form_template` (Body full template + `Examples[0].op=replace_form_schema` + tags `fields:<n>,type-*`), sync bundle 4 platform, chạy `validate-pack.ps1`.

> Kinh nghiệm từ corpus: 80% công sức convert nằm ở bước 5 (CSS). Tuân thủ ngay token grammar §6.2 + scoping §6.4 loại bỏ gần hết các vòng `MF-QA-*-vN` chồng lớp về sau (rsvp: 17 lớp; project-intake: 30 lớp — đó là chi phí của việc không chuẩn ngay từ đầu).

### 12.1 Retrofit template cũ (Gen-1/2 → chuẩn)

Tối thiểu: (a) gom customHtml/customCss về `settings.*` single-source, xóa dual-case; (b) gắn `manifestVersion:2` + `themeCompatibility` (policy thật — Gen-1 hex cứng = `locked` hoặc tokenize lại); (c) gen facts + guide; (d) xóa `.md` DRAFT cũ. Tokenize lại CSS (Gen-1 → tokenized) là việc riêng, làm khi có nhu cầu inherit.

---

## 13. Bảng tóm tắt: HARD (runtime enforce) vs CONVENTION (spec bắt buộc bổ sung)

| Quy tắc | Loại | Hậu quả vi phạm |
|---|---|---|
| Row `columns[]=[{span,fields[]}]`, ≤4 cột, span sum 12 | HARD | Canonicalizer rewrite, layout vỡ |
| Keys vận hành trong `settings` (single source) | HARD (serving) | Mất dữ liệu âm thầm lúc serve |
| Không dual-case / không top+settings duplicate | HARD (serving+lint) | Divergent, drop |
| Chain `var(--mf-page-*, var(--mf-preset-*, authored))` | HARD (runtime) | "From page" không ăn — mất theme inheritance |
| `themeCompatibility.policy` đúng sự thật | HARD (runtime) | locked→không borrow; tokenized giả→borrow phá palette |
| `themeCssOverrides` key dạng `--*` | HARD (runtime) | Override bị lọc bỏ |
| Step hooks `data-mf-native-*` + `mfp-native-generated` | HARD (renderer) | Wizard chết — không next/back được |
| Token `{{field:KEY}}` khớp 1-1 với fields | HARD (facts `--check`) | Pack fail |
| Guide `.guide.md` + facts + KB pointer | HARD (AI path) | AI edit không có guard (GUIDE-001…005 không chạy) |
| Slim envelope, không customContent/customScripts | Convention (spec) | Reject ở review |
| `manifestVersion:2`, `supportsPage*`/`prefixes`/`immutable` khai đúng | Convention (tooling) | Lint/policy-map drift; khi runtime thêm consumer → bug |
| File name = slug; taxonomy; metadata gallery | Convention (spec) | Reject ở review |
| 0 structural lint issues; hard-main = 0 (tokenized) | Convention qua review gate | Reject ở QA |
| Assets local bundle, không stock URL | Convention (spec) | Reject ở QA (dead-link risk đã từng xảy ra) |

---

## 14. Phụ lục

### 14.1 Canonical class list (engine emit — được phép style)

- Vỏ: `#mf-form-wrapper-{id}.mf-form-wrapper` (+ `mf-custom-shell-mode`, `mf-premium-native-mode`, `mf-tabbed-form-mode`, `mf-booting`, `mf-inherit-type`), `.mf-form-inner`, `#mf-form-{id}`, `#mf-fields-container-{id}`; `--mf-form-max-width` (default 960px).
- Field: `.mf-field-group[data-key][data-type]`, `label.mf-field-label`, `.mf-required`, `.mf-field-help`, `.mf-field-error`/`#mf-err-<key>`, `.mf-error`.
- Layout: `.mf-row > .mf-row-column` (KHÔNG có `.mf-col-*`); `.mf-flexgrid[data-mf-flexgrid] > .mf-flexgrid-item`.
- Inputs: `.mf-input`, `.mf-textarea`, `.mf-select`; options `.mf-option-group`(`--cols`/`--chips`/`--cards`) `> .mf-option-item > .mf-option-control + .mf-option-ui` (+ `.mf-option-label/.mf-option-meta/.mf-option-desc/.mf-option-badge/.mf-option-icon`, `.is-checked`).
- Multistep native: `.mf-steps/.mf-step(.active/.done)/.mf-step-circle/.mf-step-label`, `.mf-page`, `#mf-btn-prev|next|submit-{id}`.
- Section/HTML: `.mf-section-break > .mf-section-title`, `.mf-html-block`.
- Widgets: `.mf-composite*`, `.mf-ccp*`, `.mf-cal`, `.mf-rating*`, `.mf-file-dropzone*`, `.mf-signature-*`, `.mf-summary*`.

### 14.2 Tham chiếu chuẩn (đọc kèm)

- Template mẫu Gen-3: `Samples/FormTemplates/Premium/DONEE/event-registration-rsvp.json` (+ `wellness-patient-intake.json`, `project-intake-onboarding.json`).
- Template mẫu Gen-2 đầy đủ: `…/DONEE/youth-application.json` (slug `euro-youth-application`).
- Guide/facts mẫu: `MegaForm.DNN/Resources/TemplateGuides/event-registration-rsvp.guide.md` + `.facts.json`; `euro-youth-application.guide.md` + `.facts.json`.
- Tooling: `tools/template-lint/{lint,lib,normalize,css-io,qa-server,qa-shot,verify-live}.mjs`, `tools/template-lint/policy-map.json`; `MegaForm.UI/tools/gen-template-facts.cjs`.
- Runtime ground truth: `MegaForm.Core/Services/{ModuleCssComposer,ThemeFirstPaintCssService,ThemePresetInlineCssService,BuilderTemplateCatalogStore,TemplateSchemaCanonicalizer,FormSchemaSensitivePropertyStripper}.cs`; `MegaForm.UI/src/renderer/index.ts`; `MegaForm.UI/src/ai-form-assistant/{ops-shared,ops-field,ops-meta,chat,tools}.ts`.
- Recipes liên quan (Pure Grid — ngoài phạm vi spec này): `dist/MegaForm_AI_KB_Package/PromptRecipes/{author-pure-grid-template,pure-grid-canonical-css}.md`.

### 14.3 Thay đổi spec

Spec này versioned theo ngày trong tên section header. Mọi thay đổi PHẢI kèm: lý do, ảnh hưởng tới corpus hiện tại, cập nhật `policy-map.json`/lint nếu cần, và note vào AGENTS.md handoff.
