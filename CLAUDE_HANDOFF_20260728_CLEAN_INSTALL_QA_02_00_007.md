# Clean-install QA — MegaForm DNN 02.00.007 (gói Production 5.80 MB)

Ngày 2026-07-28 (phiên sau `8912f70`). Mục tiêu: làm lại **mục 0 + 0b** của backlog — QA trên một DNN
**SẠCH**, cài **duy nhất** gói Production 5.80 MB, **không** copy tay DLL/asset, **không** cài 2 add-on
(Monaco / S3). Skin QA = **Aperture** (theo yêu cầu owner).

---

## 1. Site QA sạch — cách dựng (tái dùng được)

| | |
|---|---|
| URL | `http://megaclean007.ai` |
| Login | **admin / dnnhost** (superuser kế thừa từ site nguồn) |
| Files | `E:\DNN_SITES\DNN_MegaClean007\Website` |
| DB | `DNN_MegaClean007` @ `WINDOWS-11\SQLEXPRESS` |
| Pool | `DNN_MegaClean007` (ApplicationPoolIdentity, `IIS AppPool\DNN_MegaClean007` = db_owner) |
| DNN | 10.3.0 |

**Base site chọn `DNN_ACME_GUIDE`** — đây là DNN 10.3.x **DUY NHẤT trên máy chưa từng cài MegaForm**
(`0` bảng `MF_*`, `0` record trong `dbo.Packages`). Test20/megademo/MegaXIn… đều đã có MegaForm nên
clone từ đó thì **không còn là clean install** (DNN không xoá file đã gỡ khỏi manifest).

Các bước: `BACKUP … WITH COPY_ONLY` → `RESTORE … WITH MOVE, REPLACE` sang DB mới → `robocopy /MIR /XD Database`
→ sửa `Initial Catalog` trong `web.config` → `UPDATE PortalAlias SET HTTPAlias=REPLACE(…)` → New-WebAppPool +
New-Website + hosts + `icacls` + `CREATE LOGIN/USER` + db_owner → restart pool.

⭐ **Hostname KHÔNG có dấu gạch dưới** (`megaclean007.ai`) — Chromium bỏ cookie với host có `_`
(bẫy đã ghi ở [[reference_site_dnn_megademo]]).

Chỉ 2 thứ thêm tay ngoài gói (đều **không** phải asset của MegaForm):
- skin **Aperture** copy từ Test20 (`Portals\_default\Skins\Aperture`, có `form-2col.ascx`; trong skin chỉ
  có 4 dòng *comment* nhắc MegaForm, không mang asset nào của module);
- `dev.lock` ở site root để dùng `DevBulkCreateForms` tạo form hàng loạt từ template gói ship.

Trang QA: tab **1009** `mfqa-form` (skin `form-2col`, module 10597 → form 28 Contact Us) · tab **1010**
`mfqa-pay` (form-2col, module 10598 → form 20 Membership Payment; dùng `&formid=` để đổi form khi QA) ·
tab **1011** `mfqa-admin` (Aperture default, module 10599 = dashboard/builder).

Cài gói: `POST /API/PersonaBar/Extensions/InstallPackage` (script `install-megaform-dnn.mjs` của phiên trước,
đổi `MF_HOST/MF_USER/MF_PASS`) → `{"newPackageId":150,"success":true}`.

---

## 2. Kết quả cài — kiểm kê trên đĩa (bằng chứng gói đã slim)

| Hạng mục | Trước cài | Sau cài |
|---|---|---|
| `DesktopModules\MegaForm` | không có | **590 file / 15.32 MB** |
| DLL | 0 | `MegaForm.Core.dll`, `MegaForm.DNN.dll`, `MegaForm.Sdk.dll` |
| AWSSDK / Azure DLL | 0 | **0** ✅ |
| Monaco | – | **0 file** ✅ |
| thư mục `i18n` | – | **đúng 1 bản**: `Assets\js\builder\i18n` (39 file, 3.82 MB giải nén) ✅ |
| ảnh lớn nhất | – | `megaform-ai-bear.png` **21 KB** ✅, không còn festa 1024² ✅ |
| cờ | – | 271 file SVG, **1.91 MB** (ứng viên cho asset-pack) |
| bảng DB | 0 | **37 bảng `MF_*`**, `Packages.Version = 2.0.7` |
| template ship | – | **35** (catalog `BuilderTemplates/List` = 35) |

---

## 3. PASS trên clean install

- **Skin 2 cột Aperture**: LeftPane **564px** / RightPane **564px** @1500px — **khớp megademo**.
- **Payment compact**: `statusPadding = 3px 9px` ⇒ bản vá scope CSS (`.mfw-payment .mfw-payment-status`)
  ăn thật trên clean install; 2 nút provider; không title/description; block cao 201px.
- **Calculator 4 displayMode** (form 37–40 tạo bằng import template qua chính API sản phẩm):
  `hidden` → `display:none` nhưng vẫn nạp tiền vào Payment · `input` → ô readonly `$99.00` ·
  `inline` → “Amount due: $99.00” · `callout` → hộp xám. Đổi Participants 2→3: **$99.00 → $148.50**
  và Payment bám theo ở **cả 4 mode**. Ảnh `clean-calc-callout.png` **trùng khít** `qa007-calc-callout.png`
  của phiên trước ⇒ kết luận phiên trước nay đã có bằng chứng clean-install.
- **Composite phone + alias `CompositePhone`** (mục còn treo `2619211`): **render đúng, KHÔNG ra
  “plugin not installed”**, cờ SVG `/DesktopModules/MegaForm/Assets/img/flags/4x3/us.svg` tải OK
  (`naturalWidth=200`) ⇒ **gói 02.00.007 CÓ chứa bản vá đường đọc** (khác ghi chú cũ “gói chưa chứa commit này”).
- **Builder khi CHƯA cài add-on Monaco**: builder boot bình thường, `.monaco-editor = 0`,
  Custom HTML rơi về `textarea.mf-code-editor` (cao 208px), **0 request 404** cho asset megaform, **0 lỗi JS**.
- **Đổi ngôn ngữ**: `?mflocale=vi` → nút “Gửi”, nạp `Assets/js/builder/i18n/vi-VN.json` + `API/i18n/Get?id=vi-VN`;
  `?mflocale=en` trên trình duyệt vi-VN → “Submit”. PASS.
- **Gallery**: catalog local 200/35 (+7 template QA tự thêm); **RemoteGalleryList 200 với 40 mục**
  (jsDelivr public mặc định) ⇒ gallery vẫn sống trên máy khách mới.
- **Dashboard / Form wizard**: 42 form, Form Management, Business Starters, Create with AI, wizard 5 bước
  (Template Gallery / Import JSON / Quick start) render đầy đủ.
- **AI**: `AiAssistant/DefaultConfig` → `enabled=true, trial=false, apiKey=""` (khách tự nhập key).

---

## 4. FINDING — cần xử lý

### 4.1 🔴 KB trên DNN chỉ bằng ~1/5 seed (đúng lo ngại mục 0b)
Clean install: `MF_AI_Knowledge` **64** · `MF_AI_KB_Rules` **40** · `MF_AI_KB_Templates` **17** ·
`MF_AI_KB_Feedback` 0. Trong khi `MegaForm.Core/Seed/ai-knowledge-seed.json` (1.42 MB) có
**329 entries / 61 rules / 34 templates**.

Nguyên nhân: **DNN không có seeder JSON**. Seeder JSON chỉ tồn tại cho Oqtane/Web/Umbraco
(`OqtaneKbSeederHostedService`, `WebKbSeederHostedService`, `UmbracoAiKnowledgeService`);
`MegaForm.DNN/Services/DnnAiKnowledgeService.cs` **không có đường seed nào**. DNN seed cứng bằng
`SqlScripts/01.06.27|28|31|32|41.SqlDataProvider`. Không có top-up lúc chạy: đếm lại sau khi đã mở
dashboard/builder/AI vẫn **64/40/17**.

Phụ: repo còn `01.06.28l…q.SqlDataProvider` **không nằm trong manifest `MegaForm.dnn`** nên không bao giờ chạy.

⇒ Backlog “KB dùng chung cơ chế qua kênh gallery `kb/`” là **bắt buộc**, không phải nice-to-have.

### 4.2 🔴 2 template Payment ship KHÔNG cấu hình số tiền
`membership-payment-fl.json` và `reservation-deposit-fl.json` có `widgetProps` **thiếu**
`amountMode`/`amount`/`amountFieldKey` ⇒ khách cài xong, tạo form từ template, thấy
**“Amount due $0.00”** + hint “Set a payment amount or choose a source field” — **không thu tiền được**
cho tới khi tự sửa. (Đây cũng là 2 template Payment DUY NHẤT trong gói.)

### 4.3 🟠 Payment compact bỏ qua `title`/`description` của template
Cả 2 template đều đặt `title: "Complete payment"`, `description: "Pay securely…"` nhưng runtime compact
render `hasTitle=false, hasDescription=false`. Hoặc là chủ ý của bản redesign (thì nên xoá khỏi template),
hoặc là mất dữ liệu cấu hình.

### 4.4 🟠 Widget `PhoneNumberPro` KHÔNG có cờ (khác composite phone)
`Assets/js/plugins/megaform-widget-phone-pro.js`: `flagEl.textContent = country.flag` (emoji) ⇒ trên
Windows ra rỗng/chữ, `img[src*=flags] = 0`. Bản vá cờ SVG 07-27 chỉ nằm ở `megaform-renderer.js` +
`bundles/megaform-builder.js` (`img.mf-ccp-flag-img` → `flags/4x3/`). Hai widget phone lệch nhau.
Ngoài ra `defaultCountry` bị chốt **VN** ngay trong `data-widget-props` do server sinh, kể cả khi trình
duyệt là `en-US`.

Ghi chú: **không template nào trong gói dùng composite phone hay PhoneNumberPro** — tính năng cờ
không được template mặc định nào “chạm” tới.

### 4.5 🟠 Nhãn version trong UI = `v2.4.1` (hardcode) trong khi gói là 2.0.7
3 chỗ: `MegaForm.UI/src/dashboard/index.ts:2704`, `MegaForm.UI/src/submissions/SubmissionsShell.ts:540`,
`MegaForm.UI/src/languages/index.ts:462`.

### 4.6 🟡 URL asset có **2 dấu `?`**
`…/megaform-i18n.js?v=20260728-B416?cdv=55` — dấu `?` thứ hai phải là `&`. Chạy được nhưng sai chuẩn và
làm hỏng cache-busting theo tham số. Trang mặc định (en) còn gọi thừa `API/i18n/Get?id=ar-SA`.

### 4.7 🟡 Gói **Trial vẫn 6.82 MB** (build 20:54) — chưa build lại sau khi tách Monaco
Chỉ `MegaForm_02.00.007_Install.zip` (Production, 22:06) là bản 5.80 MB. Nếu gửi khách bản Trial thì
vẫn là gói phình.

### 4.8 🟡 Ứng viên slim tiếp
`Assets/css/acme-blog-mock.css` **379 KB** (file mock) và 271 cờ SVG **1.91 MB** vẫn nằm trong gói.

---

## 5. Ảnh QA (scratchpad phiên này)

`clean-a-form-desktop/mobile.png` · `clean-b-payment-desktop/mobile/page.png` ·
`clean-calc-{hidden,input,inline,callout}.png` · `clean-phone-pro.png` ·
`clean-qa-phone-composite.png` / `clean-qa-phone-alias.png` · `clean-builder.png` ·
`clean-builder-customhtml.png` · `clean-dashboard-list.png` · `clean-gallery2.png` ·
`clean-lang2-*.png`.

Script tái dùng: `lib-dnn.mjs` (login + DNN Prompt + module API), `qa-setup-pages.mjs`,
`qa-create-forms.mjs`, `qa-make-qa-forms.mjs`, `qa-composite-phone.mjs`, `qa-render.mjs`,
`qa-calc-phone.mjs`, `qa-builder-gallery.mjs`, `qa-kb-ai.mjs`, `qa-lang2.mjs`.

---

## 6b. VÒNG 2 — đã vá + QA lại từ đầu trên site sạch THỨ HAI (gói `02.00.008`)

Owner chốt: gỡ form QA rò rỉ, vá 2 lỗi đỏ, thêm mục **top spacing**, rồi dựng site sạch mới QA lại.

### Đã sửa
| # | Việc | Nơi sửa (canonical) |
|---|---|---|
| 1 | **KB DNN chỉ 64/329** | `MegaForm.DNN/Services/DnnKbSeeder.cs` (mới) + ctor `DnnAiKnowledgeService` + `BuildPackage-DNN.ps1` ship `Seed\ai-knowledge-seed.json`. Merge qua `AiKnowledgeSeedMerger` (cùng đường gallery dùng ⇒ idempotent, upsert theo slug). |
| 2 | **2 template Payment không có giá** | Nguồn **ngoài repo** `MEGAFORM TEMPLATES\DefaultTemplates - Deployed\floating-label-forms\*` rồi `node tools/gallery/build-quickstart.mjs` → `Samples/FormTemplates/QuickStart`, + `sync-bundled-templates.mjs` cho payload Oqtane. `reservation-deposit` → `amountMode=field` (`deposit_amount`, bounds 10..5000); `membership-payment` → option value thành số (99/199/399 × 1/10 tháng) + Calculator ẩn `payment_calc` → `amountMode=field` + bounds 99..4788. |
| 3 | **Top spacing thừa** | `Assets/css/megaform.css` — rule `[ShellTopTrim 2026-07-29]` **đặt CUỐI FILE**, `padding-top: 0 !important` cho custom-shell có `.mfp-container`. |
| 4 | Version | `MegaForm.dnn` → `02.00.008`, `FormView.ascx.cs const V` → `?v=20260729-B417`. |

⭐⭐⭐ **BẪY CSS mất 3 vòng build**: rule mới đặt ở đầu file **thua** `[SpacingFix v20260721]`
(`.mf-form-wrapper[class*="mf-theme-"]:not(.mf-theme-default)` = **cùng (0,3,0) + `!important`**, nằm
SAU trong file ⇒ thắng theo source order). Phải **nhân đôi class** (`.mf-form-wrapper.mf-form-wrapper…`
= (0,4,0)) **và** đặt cuối file. Bài học chẩn đoán: `r.cssText` trong CSSOM **không chứa comment**, nên
đừng dò bản vá bằng chuỗi comment — dò bằng **selector** (`:has(.mfp-container)`).

### QA lại từ đầu — site sạch thứ hai
`http://megaclean008.ai` (clone `DNN_ACME_GUIDE`, DB `DNN_MegaClean008`, pool cùng tên, admin/dnnhost),
cài **chỉ** `MegaForm_02.00.008_Install.zip` (**5.96 MB**, +0.17 MB vì seed KB), không add-on.

| Hạng mục | Kết quả |
|---|---|
| KB sau cài (trước lần đọc đầu) | 64 / 40 / 17 — seeder chưa chạy, đúng thiết kế |
| **KB sau lần đọc KB đầu tiên** | **333 entries / 63 rules / 34 templates** (seed 329/61/34 + vài dòng DNN-only) ✅ |
| Membership Payment | mặc định **$99.00**; chọn Professional + Annual → **$1,990.00**, pill đổi "Not paid", hết hint "$0.00" ✅ |
| Reservation Deposit | nhập 250 → **$250.00** ✅ |
| **Top spacing** | wrapper `padding-top` 24px → **0**, khoảng cách pane→card **40px → 16px**, tiêu đề 202px → **178px** ✅ |
| Gallery | **35 template, 0 form QA** (template QA chỉ nằm trên site QA và đã xoá sau khi tạo form) ✅ |
| Calculator 4 mode | hidden/input/inline/callout đều đúng, $99 → $148.50 ✅ |
| Composite phone + alias | cờ SVG `flags/4x3/us.svg` tải OK, không "plugin not installed" ✅ |
| Builder không Monaco | boot OK, 0 `.monaco-editor`, textarea fallback, 0 lỗi JS, 0 request 404 ✅ |
| Đổi ngôn ngữ | `?mflocale=vi` → "Gửi" + nạp `vi-VN.json`; `?mflocale=en` → "Submit" ✅ |
| Gallery online | RemoteGalleryList 200, 40 mục ✅ |

Ảnh vòng 2: `r2-pay-membership.png`, `r2-pay-deposit.png`, `r2-topspacing.png`, `clean-calc-*.png`,
`clean-qa-phone-*.png`, `clean-a-form-*.png`, `clean-b-payment-*.png`.

### Còn treo (chưa sửa trong vòng 2)
- `PhoneNumberPro` vẫn không có cờ (widget dùng emoji) — §4.4.
- Nhãn UI `v2.4.1` hardcode — §4.5. · URL asset 2 dấu `?` — §4.6.
- **Gói Trial chưa build lại** (vẫn 6.82 MB, chưa có seed KB + 3 bản vá này) — §4.7.
- `acme-blog-mock.css` 379 KB + 271 cờ 1.91 MB vẫn trong gói — §4.8.
- Chưa commit: toàn bộ vòng 2 còn ở working tree.

## 6. Việc tiếp theo (đề xuất thứ tự)

1. **Vá 4.2** (template Payment thiếu amount) — ảnh hưởng trực tiếp doanh thu của khách; sửa 2 JSON trong
   `Samples/FormTemplates/**` rồi repack.
2. **KB cho DNN** (4.1) — nối `KbManifestPath`/`KbSeedPath` qua kênh gallery `kb/`, bỏ seed bằng SqlScripts.
3. **Cờ cho PhoneNumberPro** (4.4) — dùng lại helper `flags/4x3` của renderer.
4. Version label (4.5), URL `?…?` (4.6) — sửa nhanh.
5. Build lại gói **Trial** (4.7) + cân nhắc bỏ `acme-blog-mock.css` (4.8).
6. Rồi mới tới DocFX Payment/Calculator + asset-pack + skin docs 2 cột như backlog cũ.
