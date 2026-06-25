# MegaForm — Xử lý khác biệt MÀU SẮC & FONT khi đặt form vào một theme bất kỳ (WordPress / host khác)

> Tài liệu khảo sát source (2026-06-25). Trả lời câu hỏi: *"Khi đặt form vào một trang WordPress dùng theme bất kỳ, MegaForm xử lý xung đột màu sắc / font như thế nào?"* — kèm ví dụ code thực tế từ codebase, đối chiếu với chiến lược của các form builder PHP (Fluent Forms, WPForms).

---

## 0. Tóm tắt 1 câu

MegaForm là ứng dụng **.NET** (Oqtane/DNN/Umbraco/Web), **không phải plugin PHP** chạy chung DOM với theme. Vì vậy với site ngoài (gồm WordPress), MegaForm **không cố "chống bleed" trong cùng một DOM** — nó **nhúng form bằng `<iframe>`**, tức **cô lập tài liệu hoàn toàn**: CSS của theme WordPress *không thể* chạm vào form, và CSS của form *không thể* rò ra theme. Đây là mức cô lập **mạnh hơn** kỹ thuật "selector dài + `!important`" của các plugin PHP. Bên trong iframe, form vẫn dùng **biến CSS `--mf-*`** + **scoping theo `#mf-form-wrapper-{id}`** + **font tự đặt (self-host)** để giữ giao diện đúng như thiết kế, độc lập với mọi theme.

→ Theo cách phân loại trong câu hỏi: MegaForm chọn **"Full Styles / Nhất quán tuyệt đối"**, nhưng đạt được bằng **biên giới iframe** thay vì chuỗi selector + `!important`.

---

## 1. Cơ chế nhúng ngoài site = IFRAME (cốt lõi của việc chống xung đột)

Khi bấm **Embed** trên một form, hộp thoại sinh code ([MegaForm.UI/src/dashboard/embed-modal.ts](../MegaForm.UI/src/dashboard/embed-modal.ts)) có **3 tab**: **Script Tag** (mặc định), **iFrame**, **Share**. Cả "Script Tag" lẫn "iFrame" đều tạo ra một `<iframe>`.

### 1a. Tab "iFrame" — nhúng trực tiếp
Sinh ra ([embed-modal.ts:146-153](../MegaForm.UI/src/dashboard/embed-modal.ts#L146)):
```html
<div id="megaform-iframe-wrap-848" style="width:100%;max-width:100%;margin:0 auto;overflow:hidden;border-radius:12px;">
  <iframe id="megaform-iframe-848"
    src="https://your-server/.../?mfFormId=848&embed=1"
    frameborder="0" width="100%" height="640" scrolling="no"
    style="display:block;width:100%;min-height:640px;border:none;background:transparent;"
    allowtransparency="true" loading="lazy" title="...">
  </iframe>
</div>
<script>/* lắng nghe postMessage 'mf:resize' để tự co giãn chiều cao */</script>
```

### 1b. Tab "Script Tag" — gọn hơn, vẫn ra iframe
Sinh ra ([embed-modal.ts:155-161](../MegaForm.UI/src/dashboard/embed-modal.ts#L155)):
```html
<div id="megaform-848"></div>
<script src="https://your-server/.../js/megaform-embed.js" data-form-id="848"></script>
```
`megaform-embed.js` ([MegaForm.UI/src/embed/embed-iframe.ts](../MegaForm.UI/src/embed/embed-iframe.ts)) → `MegaFormEmbed.render()` → **`mountIframe()`** ([embed-iframe.ts:252](../MegaForm.UI/src/embed/embed-iframe.ts#L252)) cũng tạo `<iframe src=hosted-form-url>`.

### 1c. Vì sao iframe giải quyết triệt để xung đột màu/font
- Iframe là **một document riêng** → CSS toàn cục của theme WordPress (`body{font-family}`, `.button{background:blue}`, `input{...}`) **không cascade qua biên giới iframe**. Form bên trong miễn nhiễm 100%.
- Ngược lại, CSS của form (đã scope sẵn) cũng không rò ra theme.
- Trang hosted bên trong iframe để **nền trong suốt** ([platform-host.ts:772-774](../MegaForm.UI/src/shared/platform-host.ts#L772)): `html,body{background:transparent}` + `#mf-embed-root{background:transparent}` → iframe **hoà vào nền** trang WordPress (không bị "hộp trắng").
- **Tự co giãn chiều cao**: form bên trong gửi `postMessage({type:'mf:resize', height})`, script nhúng đặt lại `iframe.height` ([embed-iframe.ts:198-228](../MegaForm.UI/src/embed/embed-iframe.ts#L198)) → không bị thanh cuộn / khoảng trắng, trông như nhúng inline.

> **Ví dụ cụ thể — đặt vào WordPress:** dán đúng 1 trong 2 snippet trên vào một block "Custom HTML" của trang/bài viết WordPress. Form hiển thị **giống hệt** lúc thiết kế trong Dashboard, **bất kể theme WordPress** đang dùng Astra, Divi, GeneratePress hay Twenty Twenty-Four — vì theme không thể với tới bên trong iframe. Đổi theme WordPress ngày mai → form **không đổi** (đúng tinh thần "Nhất quán tuyệt đối").

---

## 2. Bên trong form: cô lập MÀU bằng Biến CSS (giống kỹ thuật #2 của bạn)

MegaForm **không viết chết mã màu** vào từng selector. Toàn bộ token màu là **biến CSS khai báo ngay trên thẻ bọc `.mf-form-wrapper`** ([Assets/css/megaform.css:25-90](../Assets/css/megaform.css#L25)):
```css
.mf-form-wrapper {
  --mf-page-bg: #f5f5f5;
  --mf-form-bg: #ffffff;
  --mf-primary: …;            /* màu chủ đạo (nút, focus, accent) */
  --mf-color-text: #333333;
  --mf-input-border-color: …;
  --mf-btn-bg: …;  --mf-btn-color: …;
  --mf-font-family: 'Inter', …;
  /* …~60 biến --mf-* */
}
```
Mọi thành phần đọc từ biến, ví dụ nút submit/card:
```css
.mf-form { background: var(--mf-form-bg); border: var(--mf-form-border); }
.mf-form-inner { … box-shadow: var(--mf-form-shadow); }
/* nút submit lấy --mf-btn-bg / --mf-primary */
```

### 2a. Bảng màu áp theo TỪNG form, ưu tiên tuyệt đối
Khi tác giả chọn preset/màu trong **Theme Designer**, hệ thống lưu vào `settings.themeCssOverrides` rồi **server sinh một khối CSS scoped riêng cho form đó** — [MegaForm.Core/Services/ThemeFirstPaintCssService.cs](../MegaForm.Core/Services/ThemeFirstPaintCssService.cs) (`BuildScopedThemeVarsCss`), gộp bởi [ModuleCssComposer.cs](../MegaForm.Core/Services/ModuleCssComposer.cs):
```css
#mf-form-wrapper-848,
#mf-form-wrapper-848 .mf-form,
#mf-form-wrapper-848 .mf-form-inner,
#mf-form-wrapper-848 .mfp, #mf-form-wrapper-848 .mfp-card {
  --mf-primary: #0ea5e9 !important;
  --mf-form-bg: #ffffff !important;
  --mf-btn-bg:  #0ea5e9 !important;
  /* … + alias premium: --mfp-*, --au-*, --bg-* … */
}
```
→ **Giống hệt nguyên lý của WPForms** (`--wpforms-primary-color` trên thẻ cha) nhưng:
- Biến đặt theo **id duy nhất `#mf-form-wrapper-{id}`** + `!important` → nếu nhúng inline, một rule theme `.button{background:blue}` **không thắng** được vì nút đọc `var(--mf-btn-bg)` đã chốt trong khối scoped của form.
- Đổi màu = vào **Theme Designer → Colors/Preset** → chỉ đổi GIÁ TRỊ biến trong khối scoped; toàn bộ viền/nút/hover/accent tự đồng bộ (giống mô tả của bạn).

### 2b. Aliasing thông minh sang token của template premium
`BuildPremiumThemeAliasVars` ([ThemeFirstPaintCssService.cs:136](../MegaForm.Core/Services/ThemeFirstPaintCssService.cs#L136)) tự suy ra và bơm màu sang **các tiền tố biến của template** (`--mfp-*`, `--au-*`, `--fr-*`, `--it-*`, `--nola-*`, `--hw-*`…) + dò các tiền tố lạ trong customCss. Nhờ vậy một template premium "viết bằng `var(--au-primary)`" vẫn nhận đúng màu khi user đổi preset — màu được "rót" vào mọi hệ biến mà template có thể dùng.

---

## 3. Xử lý FONT: MegaForm TỰ ĐẶT font (khác kỹ thuật `inherit`)

Trái với Fluent Forms (dùng `font-family: inherit` để **mượn** font của theme), MegaForm **tự quyết định font**:
```css
.mf-form-wrapper { font-family: var(--mf-font-family); line-height: var(--mf-line-height); }
/* --mf-font-family mặc định = 'Inter', -apple-system, …  (megaform.css:44, 138) */
```
**Vì sao không `inherit`?**
- Form nhúng ngoài **nằm trong iframe** → *không có* font theme nào để kế thừa; phải tự nạp font để hiển thị đúng. MegaForm chọn hướng **nhất quán** (tác giả thấy gì lúc thiết kế thì người dùng cuối thấy y vậy).
- Tác giả đổi font trong **Theme Designer → Global → Body Font / Heading Font** (ghi `--mf-font-family` / `--mf-heading-font`).
- Để chữ hiển thị đúng *bên trong iframe cô lập* (không phụ thuộc font cài trên máy khách / theme), MegaForm **self-host Google Fonts** (`Assets/fonts/gf/`, ~30 bộ combo, `@import` đổi sang local) — xem memory `project_selfhost_fonts_and_fouc`. Đây là điểm khác biệt then chốt: *MegaForm không "mượn" font của theme mà mang theo font của chính nó.*

> Nếu bạn MUỐN form "mượn" font theme (kiểu Fluent), có thể chỉnh `--mf-font-family: inherit` qua `themeCssOverrides` — nhưng chỉ có tác dụng khi nhúng **inline** (cùng DOM theme); khi nhúng iframe thì không có gì để kế thừa.

---

## 4. Chống RÒ RỈ ngược + reset (cho trường hợp inline, không iframe)

Khi form render **inline trong cùng DOM** (module Oqtane/DNN trên trang dùng theme của host, hoặc nếu sau này nhúng inline vào WP), MegaForm dựa vào:
- **Scoping**: mọi rule đều dưới `.mf-form-wrapper` / `#mf-form-wrapper-{id}` → CSS form **không rò ra** theme.
- **Reset cục bộ**: `.mf-form-wrapper * { box-sizing: border-box; }` ([megaform.css:152](../Assets/css/megaform.css#L152)) → tránh lệch hộp do `box-sizing` của theme.
- **Biến + `!important` scoped** (mục 2a) → màu/viền/nút của form thắng các rule chung của theme.
- Font wrapper tự đặt → đa số text trong form hiển thị bằng font MegaForm dù theme đặt `body{font-family}` khác.
- Lịch sử đã xử lý các ca theme-host bleed cụ thể: rò token màu của host (B202), khoảng đen edit-mode do OqtaneTheme `body{padding-top}` (memory `project_editmode_top_gap_fix`).

> Lưu ý: inline **không bảo vệ tuyệt đối** như iframe (một rule theme `input{...}` rất "đặc hiệu" vẫn có thể chen vào). Vì vậy với site ngoài, MegaForm **mặc định dùng iframe** — an toàn nhất.

---

## 5. Công tắc "Base vs Full styles" — MegaForm có gì tương đương?

| Tùy chọn bạn mô tả | MegaForm tương đương |
|---|---|
| **Full Styles / Nhất quán tuyệt đối** | **Mặc định** — nhúng iframe (cô lập tài liệu) HOẶC inline + biến scoped `!important`. Form giữ đúng thiết kế bất kể theme. |
| **Base Styles / Hoà nhập theme** (tắt CSS màu/font, để class theme tác động) | **Không có chế độ "ăn theo input của theme"** cho site ngoài (vì iframe khiến điều đó vô nghĩa). Trong-nền-tảng có các mức điều chỉnh "độ dày khung": `data-mf-chrome="card | flat | none"` ([megaform.css:783-804](../Assets/css/megaform.css#L783)) + rule "themed = phẳng" tự bỏ chrome card khi dùng theme premium. Đây là điều chỉnh **bên trong hệ theme của MegaForm**, không phải "mượn style theme host". |

Ngoài ra `data-mf-ssr="1"` ([renderer/index.ts]) cho phép **server tự sáng tác toàn bộ CSS một lần** (client không đụng), tránh nhấp nháy — liên quan đến tính nhất quán, không phải hoà theme.

---

## 6. Đối chiếu trực tiếp với 3 kỹ thuật trong câu hỏi

| Kỹ thuật (Fluent/WPForms, plugin PHP inline) | MegaForm (.NET, nhúng iframe) |
|---|---|
| **#1 Font `inherit`** — mượn font theme | **Ngược lại: tự đặt `--mf-font-family` + self-host Google Fonts.** Vì nhúng iframe nên không mượn được/không cần mượn; ưu tiên nhất quán. Có thể đặt `inherit` thủ công nếu nhúng inline. |
| **#2 Biến CSS cô lập màu** (`--wpforms-primary-color` trên thẻ cha) | **Giống hệt**: `--mf-*` khai báo trên `.mf-form-wrapper`, + khối **scoped theo id** `#mf-form-wrapper-{id}{ --mf-*: … !important }` do `ThemeFirstPaintCssService`/`ModuleCssComposer` sinh; Theme Designer chỉ đổi giá trị biến → đồng bộ toàn form. Có thêm **alias sang token template** (`--mfp-*`, `--au-*`…). |
| **#3 Công tắc Base/Full + selector dài + `!important`** | **Full = iframe (cô lập tài liệu)** — mạnh hơn selector dài. Inline thì dùng scoping-id + `!important` trên biến. **Không có chế độ "ăn theo style theme host"** cho site ngoài. |

---

## 7. Kết luận / khuyến nghị thực dụng

1. **Đưa form MegaForm vào WordPress (hay bất kỳ site nào):** dùng snippet **Script Tag** hoặc **iFrame** trong hộp Embed → an toàn 100% về màu/font, không cần sửa code, đổi theme cũng không sao.
2. **Muốn form đổi màu cho hợp theme:** vào **Theme Designer → Colors/Preset** (đổi biến `--mf-*`), không sửa CSS theme.
3. **Muốn form "ăn theo" font/chrome của theme host (kiểu Base Styles):** chỉ khả thi khi render **inline** trong nền tảng (Oqtane/DNN) + đặt `--mf-font-family: inherit` và/hoặc `data-mf-chrome` — đây là hướng hiện **chưa có nút bật/tắt UI**; nếu cần, đó là một đề xuất tính năng (thêm "Inherit theme typography" toggle ghi `--mf-font-family:inherit` vào `themeCssOverrides`).

---

## 8. Inline trong Oqtane/DNN (như hiện tại): kế thừa font/màu của parent — HIỆN TRẠNG & TRIỂN KHAI TƯƠNG LAI

### 8.1 Hiện trạng: form KHÔNG kế thừa parent (mặc định "nhất quán")
Khi module MegaForm render **inline** ngay trong trang Oqtane/DNN (cùng DOM với skin/theme host), thẻ bọc luôn **tự áp** typography + màu của chính nó ([Assets/css/megaform.css:138-150](../Assets/css/megaform.css#L138)):
```css
.mf-form-wrapper {
  font-family: var(--mf-font-family);   /* Inter (mặc định) hoặc font chọn trong Theme Designer */
  font-size:  var(--mf-font-size-base);
  line-height: var(--mf-line-height);
  color:      var(--mf-color-text);     /* #333 mặc định */
  background: var(--mf-page-bg);        /* #f5f5f5 — form còn tự vẽ panel xám riêng */
}
.mf-form-wrapper * { box-sizing: border-box; }
```
Hệ quả thực tế:
- `body { font-family }` / `body { color }` của skin Oqtane/DNN **không chảy vào form** — vì wrapper đặt `font-family`/`color` riêng, và mọi phần tử con **thừa kế từ wrapper**, không phải từ `body`.
- Form thậm chí **tự vẽ nền `#f5f5f5`** → nằm trên panel xám của riêng nó chứ không hoà vào nền trang.
- Màu nút/viền/focus = biến `--mf-*` (preset/Theme Designer), **không liên quan** màu chủ đạo của skin.
- **Chưa có công tắc "kế thừa theme"** nào — chỉ có `data-mf-chrome="card|flat|none"` (điều chỉnh viền/đổ bóng/padding, KHÔNG phải font/màu).

→ Tóm lại: **mặc định inline = vẫn "nhất quán" (độc lập theme)**, giống như khi nhúng iframe — chỉ khác là về mặt kỹ thuật nó *có thể* bị skin chen vào nếu skin có rule đặc hiệu cao nhắm thẻ thô (hiếm, vì form đã scope `.mf-form-wrapper …`).

### 8.2 Chế độ "Hoà nhập theme trang" (Inherit / Base Styles) — ✅ ĐÃ TRIỂN KHAI (B270, 2026-06-25)

> **Đã code + deploy live :5070.** Khác với phác thảo bên dưới (bản "robust" theo lựa chọn của user), thực tế:
> - **Lưu** 2 cờ bool có kiểu trên `FormSettings` (`inheritPageTypography` / `inheritPageColors`) — KHÔNG dùng `themeCssOverrides`. ⭐Bắt buộc là typed property vì `FormSettings` không có `[JsonExtensionData]` → key lạ bị strip khi save.
> - **Font** = class tường minh `mf-inherit-type` (server `BuildWrapperRuntimeClasses` stamp; CSS `*:not(i):not([class*="fa-"])…{font-family:inherit!important}` — **chừa icon FontAwesome**). Robust, không phụ thuộc mẹo var()-không-fallback.
> - **Màu** = bơm biến scoped (`--mf-page-bg:transparent`, `--mf-primary/--mf-btn-bg: var(--bs-primary,…)`) vào khối `#mf-form-wrapper-{id}` lúc compose → thắng preset, preset gốc giữ nguyên → tắt cờ là khôi phục. ⭐**KHÔNG** kế thừa màu chữ body (giữ chữ đậm MegaForm cho dễ đọc trên card trắng / skin tối — tránh lỗi tương phản).
> - **Gate premium**: `IsCustomShell` (customHtml hoặc `.mfp` trong customCss) → tắt cả 2; UI cũng ẩn mục này cho form custom-shell.
> - QA: pipeline server đã kiểm (control / bật / gate / revert trên form 861). Visual font/màu theo skin thật = bước user xác nhận.

**(Phác thảo gốc — giữ lại để tham khảo):**
Vì inline **chung DOM** với host nên *có thể* cho form **mượn** font/màu của trang — điều iframe không làm được. Đề xuất thêm trong **Theme Designer → Global** hai công tắc độc lập:
- **Typography source:** `MegaForm theme` (mặc định) ↔ `Inherit from page`
- **Color source:** `MegaForm theme` (mặc định) ↔ `Borrow from page`

**Cách hiện thực — tận dụng kiến trúc biến sẵn có (gần như KHÔNG cần code mới):** vì wrapper đã đọc `var(--mf-*)`, chỉ cần ghi các override sau vào `settings.themeCssOverrides` (đã chảy qua `ThemeFirstPaintCssService` → khối scoped `#mf-form-wrapper-{id}`):

```jsonc
// Khi bật "Inherit fonts":
"--mf-font-family": "inherit",
"--mf-heading-font": "inherit",
// Khi bật "Borrow colors":
"--mf-color-text": "inherit",
"--mf-page-bg":    "transparent",        // bỏ panel xám, hoà nền trang
// "Mượn thông minh" màu chủ đạo: thử biến phổ biến của host rồi fallback
"--mf-primary": "var(--bs-primary, var(--primary, var(--theme-primary, #2563eb)))",
"--mf-btn-bg":  "var(--bs-primary, var(--primary, #2563eb))"
```
- `--mf-font-family: inherit` → `.mf-form-wrapper { font-family: var(--mf-font-family) }` ⇒ `font-family: inherit` ⇒ **thừa kế font từ phần tử cha (trang host)**. Mọi input/label/nút thừa kế tiếp xuống.
- **Oqtane dùng Bootstrap 5** → `--bs-primary` CÓ SẴN, nên `var(--bs-primary, …)` lấy đúng màu chủ đạo của site Oqtane; DNN thì tuỳ skin (có fallback an toàn). Đây chính là kiểu "mượn cấu hình theme một cách thông minh".
- Giá trị `var()` lồng trong biến là hợp lệ (CSS đánh giá trễ) → không cần thêm rule CSS.

**Lưu ý khi hiện thực:**
1. **Chỉ áp cho inline** (Oqtane/DNN, hoặc inline-WP). Với **nhúng iframe → ẩn/bỏ qua công tắc** (không có parent để kế thừa). UI nên phát hiện ngữ cảnh (`embedSource=script`/iframe) để ẩn.
2. **Tách 2 công tắc** (font riêng, màu riêng) vì user thường muốn *font theo theme* nhưng *màu thương hiệu của form* (hoặc ngược lại).
3. Cân nhắc thêm class wrapper `mf-inherit-page` (qua `BuildWrapperRuntimeClasses`) nếu muốn rule tường minh thay vì chỉ override biến — nhưng cách override biến ở trên là **tối giản nhất** (0 code C#/CSS mới, chỉ ghi `themeCssOverrides`).
4. Kiểm tra `BuildPremiumThemeAliasVars` không "đập" giá trị `inherit` thành màu cụ thể cho form premium — với template premium nên **vô hiệu hoá chế độ inherit** (template đã có hệ màu riêng).
5. QA: bật inherit trên 1 form standard đặt trong trang Oqtane (skin có `--bs-primary` khác) → nút + chữ phải đổi theo skin; tắt → quay lại Inter + màu MegaForm.

**Ước lượng công sức:** ~½ ngày — thêm 2 select trong `theme-tab-adapter.ts` (panel Global) ghi các biến trên vào `themeCssOverrides`; không cần đụng server (đường `themeCssOverrides → scoped block` đã có). Nếu muốn "ẩn khi nhúng iframe" + class tường minh thì thêm ~½ ngày.

---

### Tham chiếu source chính
- Nhúng iframe: [MegaForm.UI/src/embed/embed-iframe.ts](../MegaForm.UI/src/embed/embed-iframe.ts), [dashboard/embed-modal.ts](../MegaForm.UI/src/dashboard/embed-modal.ts), `buildHostedFormUrl` [shared/platform-host.ts](../MegaForm.UI/src/shared/platform-host.ts)
- Biến CSS + reset: [Assets/css/megaform.css](../Assets/css/megaform.css) (`.mf-form-wrapper` ~25-152)
- Bảng màu scoped theo form + alias: [MegaForm.Core/Services/ThemeFirstPaintCssService.cs](../MegaForm.Core/Services/ThemeFirstPaintCssService.cs), [ModuleCssComposer.cs](../MegaForm.Core/Services/ModuleCssComposer.cs)
- Theme Designer (đổi biến màu/font): [MegaForm.UI/src/builder/theme-tab-adapter.ts](../MegaForm.UI/src/builder/theme-tab-adapter.ts)
- Self-host font (đảm bảo font hiển thị trong iframe): memory `project_selfhost_fonts_and_fouc`
