# Phân tích: Tại sao Preset CSS trong Form Builder chỉ tác động được input, không tác động header/border của Premium form

> Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
> Ngày phân tích: 2026-06-22  
> Mục đích: giải thích root cause và đề xuất hướng sửa **không viết code** trong phiên này.

---

## 1. Tóm tắt

Preset/theme trong MegaForm Builder hoạt động bằng cách sinh ra các CSS custom property chuẩn (`--mf-*`) và ghi đè lên các selector quen thuộc như `.mf-input`, `.mf-form-wrapper`, `.mfp`, `.mfp-card`.

Với **Premium form**, phần vỏ (shell) được tạo bởi `customHtml` + `customCss` của template, sử dụng **namespace biến riêng** (ví dụ `--bg-*`, `--ey-*`, `--fr-*`) và nhiều giá trị màu được hard-code. Các selector shell riêng này **không tham chiếu** đến `--mf-primary`, `--mf-form-bg`, `--mf-border`, v.v. nên khi user đổi preset trong builder, chỉ có input, button, label đổi màu — còn header, border, background hero, card border giữ nguyên.

---

## 2. Cách preset/theme hiện tại sinh CSS

### 2.1 Builder live theme (iframe preview)

File: `MegaForm.UI/src/builder/theme-tab-adapter.ts`

- `buildIframeOverridesCss()` (dòng ~343–361) inject biến lên:
  ```css
  :root, body, #mf-mount,
  .mf-form-wrapper, .mf-form, .mf-form-inner,
  .mfp, .mfp-card, .fr-card { ... }
  ```
- `buildElementLevelOverrides()` (dòng ~396–507) ghi đè cụ thể:
  - Button submit: `.mf-submit`, `.mfp-submit`, `.mf-form-actions button`
  - Input: `.mf-input`, `.mf-textarea`, `.mf-select`, raw `input/textarea/select`
  - Form card: `.mf-form-wrapper > .mf-form`, `.mf-form-wrapper .mfp`, `.mfp-card`, `.fr-card`
  - Heading: `h1, h2, h3`, `.mf-form-title`, `.mfp-form-title`, `.au-brand-tx strong`, `.au-section-title`

Nhận xét: chỉ có template `.mfp-australia` được nhắc đích danh trong heading selector. Các premium shell khác như `.mfp-bulgaria`, `.mfp-euro-youth`, `.fr-consult`, `.aur-form` không có selector riêng.

### 2.2 Runtime renderer (client)

File: `MegaForm.UI/src/renderer/index.ts`

- `buildScopedThemeVarsCss()` (dòng ~351–368) inject `--mf-*` với `!important` lên:
  ```css
  #mf-form-wrapper-{id},
  #mf-form-wrapper-{id} .mf-form,
  #mf-form-wrapper-{id} .mf-form-inner,
  #mf-form-wrapper-{id} .mf-fields-container,
  #mf-form-wrapper-{id} .mfp,
  #mf-form-wrapper-{id} .mfp-card,
  #mf-form-wrapper-{id} .fr-card { ... }
  ```
- `buildCustomShellCompatibilityCss()` (dòng ~370–469) hiện tại **chỉ bridge** cho `.mfp.mfp-australia` (dòng 386–468). Các template premium khác không được map `--mf-*` về namespace của chúng.

### 2.3 Server first-paint

File: `MegaForm.Core/Services/ThemePresetInlineCssService.cs`

- Dòng ~89–130 sinh các biến chuẩn: `--mf-primary`, `--mf-form-bg`, `--mf-border`, `--mf-btn-bg`, `--mfp-*`, v.v.
- Không sinh các alias template-specific như `--bg-rose`, `--ey-primary`, `--fr-border`.

File: `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs`

- Dòng ~30–44 cũng chỉ bridge cho `.mfp-australia`, giống JS renderer.

---

## 3. Vì sao Premium form không đổi màu theo preset

### 3.1 Premium template dùng namespace riêng và hard-code màu

Ví dụ `Samples/FormTemplates/Premium/bulgaria-discovery-programme.json`:

```css
.mfp.mfp-bulgaria {
  --bg-parch: #f5f0e8;
  --bg-surface: #fff;
  --bg-dark: #1a1410;
  --bg-rose: #c94f6d;
  --bg-green: #2d5a3d;
  --bg-gold: #c8853a;
  --bg-border: #e6ddd2;
  ...
}

.mfp-bulgaria .bg-card {
  background: var(--bg-surface);       /* hard-code #fff */
  border: 1px solid var(--bg-border);  /* hard-code #e6ddd2 */
}

.mfp-bulgaria .bg-hero {
  background: linear-gradient(135deg, #2d5a3d, #c94f6d); /* literal hex */
}

.mfp-bulgaria .bg-border {
  background: repeating-linear-gradient(
    90deg,
    rgba(201,79,109,.72) ...,
    rgba(200,133,58,.65) ...
  );
}
```

Khi builder đổi preset, nó chỉ thay đổi `--mf-primary`, `--mf-form-bg`, `--mf-border`. Vì `.bg-card`, `.bg-hero`, `.bg-border` không tham chiếu các biến đó, chúng giữ nguyên.

### 3.2 Các bridge hiện có quá hẹp

Cả client renderer (`buildCustomShellCompatibilityCss`) và server service (`CustomShellCompatibilityCssService`) đều chỉ map `--mf-*` sang namespace của `.mfp-australia`. Các template premium khác không được bridge.

### 3.3 Input vẫn đổi vì dùng class chuẩn

Các field MegaForm chuẩn (`.mf-input`, `.mf-select`, `.mf-btn-submit`) được style bằng các biến `--mf-input-border`, `--mf-btn-bg`, v.v. nên preset vẫn tác động được.

---

## 4. Những gì cần làm

Dưới đây là các hướng sửa, xếp theo độ ưu tiên và độ phức tạp.

### 4.1 Hướng dài hạn (đúng nhất): refactor tất cả Premium template để tiêu thụ `--mf-*`

Mỗi template cần:

1. Khai báo root `.mfp.mfp-<slug>` ánh xạ `--mf-*` sang namespace cục bộ:
   ```css
   .mfp.mfp-bulgaria {
     --bg-rose:   var(--mf-primary, #c94f6d);
     --bg-green:  var(--mf-secondary, #2d5a3d);
     --bg-gold:   var(--mf-accent, #c8853a);
     --bg-parch:  var(--mf-form-bg, #f5f0e8);
     --bg-surface: var(--mf-form-bg, #ffffff);
     --bg-border: var(--mf-border, #e6ddd2);
     --bg-dark:   var(--mf-text, #1a1410);
     ...
   }
   ```
2. Thay các giá trị màu hard-code trong `background`, `border`, `linear-gradient` bằng các biến cục bộ đã ánh xạ.
3. Đối với gradient phức tạp, dùng `color-mix(in srgb, var(--bg-rose) 72%, transparent)` thay vì `rgba(201,79,109,.72)`.

Ưu điểm: builder preset sẽ tác động toàn bộ form.  
Nhược điểm: phải sửa từng template JSON (production + sample).

### 4.2 Hướng ngắn hạn (fallback): generic bridge trong renderer và server

Mở rộng `buildCustomShellCompatibilityCss()` và `CustomShellCompatibilityCssService` để không chỉ `.mfp-australia` mà **mọi premium shell** `.mfp[class*="mfp-"]` đều được map:

```css
#mf-form-wrapper-{id} .mfp[class*="mfp-"] {
  background: var(--mf-form-bg) !important;
  border-color: var(--mf-border) !important;
  border-radius: var(--mf-form-radius) !important;
  color: var(--mf-text) !important;
  font-family: var(--mf-font-family) !important;
}
```

Ưu điểm: không cần sửa template.  
Nhược điểm: gradient, hero image overlay, decorative border vẫn không đổi; chỉ background/border/text đơn giản đổi.

### 4.3 Cập nhật Builder element-level overrides

Trong `MegaForm.UI/src/builder/theme-tab-adapter.ts`, `buildElementLevelOverrides()` nên thêm generic premium-shell selector:

```css
.mf-form-wrapper .mfp[class*="mfp-"],
.mf-form-wrapper .mfp-card,
.mf-form-wrapper .fr-card {
  background: var(--mf-form-bg) !important;
  border-color: var(--mf-border) !important;
  border-radius: var(--mf-form-radius) !important;
}
```

### 4.4 Cập nhật spec/template authoring guide

File: `Docs/PREMIUM_FORM_TEMPLATE_SPEC.md`

Thêm yêu cầu bắt buộc:

- Shell CSS **phải** tiêu thụ `--mf-primary`, `--mf-form-bg`, `--mf-border`, `--mf-text`, `--mf-font-family`.
- Không được hard-code màu sắc trên shell element (header, card, border, hero).
- Root scope phải là `.mfp.mfp-<slug>` để generic bridge có thể target.

---

## 5. Danh sách file cần đụng đến khi triển khai

| File | Thay đổi |
|------|----------|
| `MegaForm.UI/src/builder/theme-tab-adapter.ts` | Thêm generic premium-shell selector trong `buildElementLevelOverrides()` |
| `MegaForm.UI/src/renderer/index.ts` | Mở rộng `buildCustomShellCompatibilityCss()` ra `.mfp[class*="mfp-"]` |
| `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs` | Tương tự, generic bridge cho server first-paint |
| `Samples/FormTemplates/Premium/*.json` | Refactor `customCss` để map `--mf-*` vào namespace template |
| Các template premium trong production DB | Refactor tương tự (qua import/update script) |
| `Docs/PREMIUM_FORM_TEMPLATE_SPEC.md` | Bắt buộc tiêu thụ `--mf-*` khi viết template mới |

---

## 6. Ghi chú QA

Khi test sau khi sửa:

1. Mở form premium (ví dụ form dùng template Bulgaria) trong builder.
2. Đổi preset/theme.
3. Kiểm tra:
   - Background form/card có đổi theo `--mf-form-bg` không.
   - Border/card border có đổi theo `--mf-border` không.
   - Header text có đổi theo `--mf-text` / `--mf-title-color` không.
   - Input/button vẫn đổi như cũ.
4. Kiểm tra cả runtime render ngoài site (không chỉ builder iframe).

---

## 7. Kết luận

Root cause: **Premium templates tự quản lý màu sắc shell bằng namespace riêng và hard-code**, trong khi preset/theme chỉ phát hành các biến chuẩn `--mf-*` và chỉ bridge cho `.mfp-australia`.

Hướng giải quyết bền vững nhất là **refactor các Premium template để shell tiêu thụ `--mf-*`**, kết hợp với **generic bridge** trong renderer/server để bảo vệ các template cũ chưa refactor.

---

## 8. Khảo sát thực tế các Premium template (2026-06-22)

Đã quét toàn bộ template JSON có `customCss` trong repo (source + packed samples, loại trừ trùng lặp). Kết quả **34 template duy nhất**:

### 8.1 Phân loại theo cách dùng biến CSS

| Nhóm | Số lượng | Đặc điểm | Ví dụ |
|------|---------:|----------|-------|
| **Hard-code, không khai báo CSS variable** | 16 | Toàn bộ màu sắc header/border/background là hex/rgb trực tiếp. Preset không tác động được gì ngoài input. | `alpine-retreat-escape`, `blueprint-property-brief`, `botanical-volunteer-story`, `clinic-concierge-serene`, `editorial-monochrome-portfolio`, `euro-youth-application`, `festival-speaker-spotlight`, `golf-tournament-*`, `neon-launch-control-room`, `passport-concierge-itinerary`, `wedding-scrapbook-story` |
| **Shadcn/Tailwind unprefixed** (`--background`, `--foreground`, `--primary`, `--border`, `--card`, `--muted`, …) | 4–6 | Dùng biến chuẩn giống shadcn, nhưng builder preset chỉ phát `--mf-*`, không phát `--background`/`--primary`. Cần bridge `--mf-*` → shadcn vars. | `template-639124137734507091`, `v0-contact-map-*` |
| **Tailwind namespace** (`--tw-*`, `--spacing-*`, `--radius-*`, …) + shadcn unprefixed | 2–3 | Rất nhiều biến riêng, chủ yếu phục vụ layout/spacing. Màu sắc vẫn nằm trong `--background`, `--primary`, … | `invitation-ceremony-another`, `template-639124137034063476` |
| **Prefix ngắn đặc trưng template** (`--bg-*`, `--fr-*`, `--it-*`, `--aur-*`, `--nola-*`, `--hw-*`, `--ink`, `--paper`) | 7 | Mỗi template một namespace riêng. Cần map từng prefix nếu refactor. | `bulgaria-discovery-programme` (`bg`), `french-*` (`fr`), `italian-law-firm-consultation` (`it`), `new-orleans-event-registration` (`nola`), `halloween-party-registration` (`hw`), `template-639124210228418310` (`aur`), `sticky-spark-creative-brief` (`ink`, `paper`) |
| **`--mfp-*` namespace** | 3 | Gần với chuẩn MegaForm, nhưng vẫn khác `--mf-*`. Hiện chỉ `.mfp-australia` được bridge. | `job-application-form`, `megaform-italian-romantic-fixed`, `template-639124136870269154` |
| **Mixed custom** (`--accent`, `--surface`, `--shadow`, `--transition`, …) | 1 | `megaform-multipurpose-usa` dùng tập biến semantic riêng. | `megaform-multipurpose-usa` |

### 8.2 Thống kê prefix khai báo biến

| Prefix | Số template khai báo | Ghi chú |
|--------|---------------------:|---------|
| `tw` | 3 | Tailwind/spacing tokens (không liên quan màu trực tiếp) |
| `background` | 8 | shadcn-style `--background` |
| `foreground` | 7 | shadcn-style `--foreground` |
| `primary` | 8 | shadcn-style `--primary` |
| `border` | 8 | shadcn-style `--border` |
| `card` | 7 | shadcn-style `--card` |
| `muted` | 7 | shadcn-style `--muted` |
| `accent` | 8 | `--accent` / `--accent-foreground` |
| `mfp` | 3 | Gần với MegaForm |
| `fr` | 2 | French templates |
| `bg`, `hw`, `it`, `nola`, `aur`, `ink`, `paper` | 1 mỗi prefix | Template-specific |

### 8.3 Kết luận từ khảo sát

- **Hơn một nửa (16/34) premium template không dùng CSS variable** — hoàn toàn hard-code.
- Trong số còn lại, **không có namespace thống nhất**: có shadcn, Tailwind, mfp, fr, bg, it, hw, nola, aur, ink, paper, v.v.
- Refactor từng template để dùng `--mf-*` là **không scalable**: mỗi template mới (do AI/user thiết kế) sẽ lại tạo namespace mới hoặc hard-code màu, và lỗi sẽ tái diễn.

---

## 9. Đề xuất kiến trúc chống lặp lại lỗi trong tương lai

Thay vì sửa từng template, cần một lớp **Design-Token Bridge** tự động ánh xạ `--mf-*` sang namespace mà template đang dùng, kết hợp với **ép buộc khi import/template save**.

### 9.1 Layer 1 — Auto-detect template namespace và sinh alias

Khi form được load (runtime) hoặc mở trong builder, parse `customCss` để tìm các biến đã khai báo. Sau đó sinh một block CSS bridge tự động:

```css
#mf-form-wrapper-{id} .mfp.mfp-<slug> {
  /* Map --mf-* sang các biến shadcn/template đã tồn tại */
  --primary:   var(--mf-primary, var(--primary));
  --background: var(--mf-form-bg, var(--background));
  --foreground: var(--mf-text, var(--foreground));
  --border:     var(--mf-border, var(--border));
  --card:       var(--mf-form-bg, var(--card));
  --muted:      var(--mf-border, var(--muted));
  --accent:     var(--mf-primary, var(--accent));

  /* Map sang các prefix đặc trưng nếu phát hiện được */
  --bg-rose:    var(--mf-primary, var(--bg-rose));
  --fr-primary: var(--mf-primary, var(--fr-primary));
  --it-primary: var(--mf-primary, var(--it-primary));
  /* ... */
}
```

Ưu điểm:
- Không cần sửa từng template JSON.
- Template dùng `--background`/`--primary` sẽ đổi màu ngay.
- Template dùng prefix riêng (`--bg-*`, `--fr-*`, …) cũng đổi nếu bridge nhận diện được prefix.

Hạn chế:
- Vẫn không giải quyết template hard-code hoàn toàn (không có biến nào để map).
- Gradient/hình ảnh trang trí vẫn cần xử lý riêng.

### 9.2 Layer 2 — Build-time color normalization cho template hard-code

Với 16 template hard-code, và các template tương lai do AI/user tạo, cần một bước **post-process khi import/save template**:

1. Trích xuất các màu chính trong `customCss` (hex/rgb/oklch).
2. Phân loại heuristic:
   - Màu xuất hiện nhiều nhất trên background/card → `--mf-form-bg`.
   - Màu accent/brand (thường dùng cho button, border nổi) → `--mf-primary`.
   - Màu text body → `--mf-text`.
   - Màu border nhạt → `--mf-border`.
3. Rewrite `customCss`:
   - Thay thế các giá trị màu đã xác định bằng `var(--mf-*, <giá trị gốc>)`.
   - Giữ nguyên giá trị gốc làm fallback để khi không có preset thì template vẫn hiển thị đúng.

Cách này giải quyết cả template hard-code và template tương lai mà không cần chỉnh sửa thủ công.

### 9.3 Layer 3 — Lint/validation khi save/import template

Trước khi một template premium được lưu vào hệ thống, kiểm tra:

- Nếu `customCss` chứa màu hard-code trên shell selector (`.mfp`, `.mfp-card`, `.mfp-header`, `.bg-*`, `.ey-*`, …) mà không được wrap trong `var(--mf-*, …)` → **cảnh báo hoặc từ chối**.
- Nếu template khai báo biến riêng mà không có alias sang `--mf-*` → cảnh báo.

Điều này ngăn template mới quay lại trạng thái "không tương thích preset".

### 9.4 Layer 4 — Generic CSS override an toàn (fallback cuối)

Bổ sung rule generic trong builder + runtime để ép các shell element cơ bản phải dùng `--mf-*`:

```css
#mf-form-wrapper-{id} .mfp[class*="mfp-"],
#mf-form-wrapper-{id} .mfp-card,
#mf-form-wrapper-{id} .fr-card {
  background-color: var(--mf-form-bg) !important;
  border-color: var(--mf-border) !important;
  color: var(--mf-text) !important;
  font-family: var(--mf-font-family) !important;
}
```

Rule này không thay đổi gradient/decorative image, nhưng ít nhất background/border/text của card sẽ đổi theo preset.

### 9.5 So sánh các phương án

| Phương án | Scalable? | Xử lý hard-code? | Xử lý gradient? | Độ phức tạp |
|-----------|:---------:|:----------------:|:---------------:|:-----------:|
| Refactor từng template JSON | ❌ | ❌ (cần sửa tay từng file) | ✅ | Cao (duy trì lâu dài) |
| Auto-alias `--mf-*` sang biến đã khai báo | ✅ | ❌ (cần biến để map) | ⚠️ (chỉ nếu gradient dùng var) | Trung bình |
| Build-time color normalization | ✅ | ✅ | ⚠️ (có thể thay màu trong gradient) | Cao |
| Generic `!important` fallback | ✅ | ✅ (background/border/text đơn giản) | ❌ | Thấp |
| Lint khi save/import | ✅ | ✅ (ngăn tái phạm) | ❌ | Trung bình |

### 9.6 Khuyến nghị triển khai

1. **Ngắn hạn (giảm thiểu lỗi ngay):**
   - Bổ sung generic bridge `.mfp[class*="mfp-"]` trong `theme-tab-adapter.ts`, `renderer/index.ts`, và `CustomShellCompatibilityCssService.cs`.
   - Auto-alias `--mf-*` → các biến shadcn phổ biến (`--background`, `--foreground`, `--primary`, `--border`, `--card`, `--muted`, `--accent`).

2. **Trung hạn (xử lý template hard-code):**
   - Viết tool post-process template: detect màu chính → rewrite `customCss` với `var(--mf-*, <fallback>)`.
   - Chạy batch trên toàn bộ 34 template hiện có.

3. **Dài hạn (ngăn tái phạm):**
   - Bắt buộc validation khi import/save premium template.
   - Cập nhật `Docs/PREMIUM_FORM_TEMPLATE_SPEC.md` và prompt AI để template mới luôn tiêu thụ `--mf-*` hoặc ít nhất khai báo biến có thể bridge.

Nếu chỉ refactor từng template mà không có các layer trên, **bất kỳ form premium nào được thiết kế sau đó vẫn sẽ bị lỗi này**.
