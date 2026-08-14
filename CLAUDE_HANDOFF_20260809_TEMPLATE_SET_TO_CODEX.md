# Bàn giao bộ template mới (19 bản) — cho Codex

Ngày 2026-08-09. Người viết: Claude. Người nhận: Codex.
Tài liệu này **tự chứa**: bảng template ↔ mock ↔ form id, cách chạy lại mọi phép đo, số đo hiện tại,
và danh sách việc còn lại kèm bằng chứng.

Các handoff trước (đọc khi cần chi tiết lịch sử): `CLAUDE_HANDOFF_20260808_EXACT_CONVERSIONS.md`,
`…20260808B_REMAINING_DELTAS.md`, `…20260808C_FOUR_NEW_MOCKS_AND_CHROME_REMOVAL.md`,
`…20260808D_BORDERS_CODEXO_FESTA_OQTANE.md`.

---

## 1. Bộ template và nguồn mock

**Template JSON:** `Samples/FormTemplates/Premium/PENDING-REVIEW/` (19 file — chưa publish lên gallery;
48 file đã publish nằm ở `Samples/FormTemplates/Premium/GALLERY-PUBLISHED/`).

**Nguồn mock (source of truth):**
`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\app\forms\<mock>\page.tsx`
Chạy `npm run dev` trong thư mục đó → `http://localhost:3000/forms/<mock>`.
⚠️ Dùng bản **(10)**, không dùng (11): (11) thiếu `newsletter` và `application`.

| template JSON | prefix | mock (`/forms/…`) | form DNN | form Oqtane | trang Oqtane |
|---|---|---|---|---|---|
| xmas-sale-euroyouth-application | xms | xmas-sale | 59 | 25 | /mf-xmas-sale |
| xmas-newsletter-euroyouth-application | xnl | xmas-newsletter | 58 | 30 | /mf-xmas-newsletter |
| agency-flyer-euroyouth-application | agf | agency-flyer | 57 | 26 | /mf-agency-flyer |
| kids-first-book-registration | kfb | hotel-concierge | 61 | 24 | /mf-first-book |
| gold-suite-membership-application | gsu | hotel-suite | 60 | 28 | /mf-gold-suite |
| rose-wellness-registration | rws | rose-registration | 62 | 29 | /mf-rose-wellness |
| newsletter-signup-amber | nlt | newsletter | 66 | 27 | /mf-newsletter-amber |
| job-application-northwind | jba | job-application | 65 | 21 | /mf-job-application |
| lagoon-reserve-booking | lgn | hotel-booking | 64 | 22 | /mf-lagoon-booking |
| product-order-live-total | pdo | product-order | 63 | 23 | /mf-product-order |
| golden-pro-agent-registration | gpr | golden-pro-registration | 68 | 18 | /mf-golden-pro |
| invoice-request-navy-orange | inv | invoice-form | 70 | 19 | /mf-invoice-navy |
| invoice-spinera-blue | spn | invoice-spinera | 71 | 20 | /mf-invoice-spinera |
| invoice-codexo-cyan | icx | invoice-codexo | 69 | 31 | /mf-invoice-codexo |
| corporate-registration-blue | crg | corporate-registration | 115 | 17 | /mf-corporate-reg |
| ielts-report-classic | iel | ielts-report | 116 | 16 | /mf-ielts-report |
| massage-intake-sage | msi | massage-intake | 117 | 15 | /mf-massage-intake |
| massage-bodychart-terracotta | mbc | massage-bodychart | 118 | 14 | /mf-massage-body |
| festa-italiana | fes | festa-italiana | 72 | 32 | /mf-festa-italiana |

**Trang review trên DNN:** `http://megaclean008.ai/mf-templates/<tên trang>` (19 trang, mỗi trang một
form + một panel HTML ghi rõ link mock, link full-width và số đo lần cuối).
**Site Oqtane:** `http://localhost:5130` (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean20011`,
DB `Oqtane_MegaFormClean20011`, host/abc@ABC1024) — mỗi trang một form, không phải rebuild DLL.

## 2. Sinh template

```
node tools/templates/build-exact-conversions.mjs          # sinh cả 19 vào PENDING-REVIEW
node tools/templates/build-exact-conversions.mjs --only <slug>
```

* 17 spec nằm trong `tools/templates/build-exact-conversions.mjs`
* `spec-icx.mjs` (invoice-codexo) và `spec-festa.mjs` (festa-italiana) là file riêng
* helper dùng chung: `tools/templates/exact-helpers.mjs` (**không** import ngược lại builder — vòng
  import làm `svgUrl` chết vì TDZ)
* `tools/templates/build-euroyouth-skins.mjs` là "kit": nó tự phát cho mọi spec — de-card wrapper,
  bỏ chrome trang, viền + nền ngoài, chuỗi biến theme, fallback responsive ≤520px

Deploy:
```
cp Samples/FormTemplates/Premium/PENDING-REVIEW/*.json  <DNN>/DesktopModules/MegaForm/Templates/
cp Samples/FormTemplates/Premium/PENDING-REVIEW/*.json  <Oqtane>/App_Data/MegaForm/Templates/PENDING-REVIEW/
node tools/browser-qa/dnn-seed-templates.mjs     # DNN  (KHÔNG dùng dnn-api-post.mjs, xem §5)
node tools/browser-qa/oq-seed-forms.mjs          # Oqtane
```

## 3. Đo — ba công cụ, chạy được ngay

| lệnh | trả lời câu hỏi |
|---|---|
| `node tools/browser-qa/run-card-batch.mjs [--only slug]` | template có giống **mock** không |
| `node tools/browser-qa/run-platform-batch.mjs [--only slug]` | DNN và **Oqtane** có giống nhau không |
| `node tools/browser-qa/responsive-audit.mjs --widths 1216,768,480,375` | có sát mép / tràn ngang không |
| `node tools/browser-qa/border-audit.mjs [formId…]` | hộp ngoài đang vẽ viền/nền gì |
| `node tools/browser-qa/crop-zoom.mjs <thư mục> x,y,w,h --scale N` | soi kỹ một vùng của cặp ảnh |
| `node tools/browser-qa/shoot-review-pages.mjs` | chụp 19 trang review + dò back link/bề rộng |

Kết quả nằm ở `qa-out/iter/<slug>/` (compare.png, diff.png, report.json, mock.nodes.json,
ours.nodes.json) và `qa-out/platform/<slug>/`.

**Cách đọc số:** `differing` là số phần tử lệch quá ngưỡng; `pixels` là % điểm ảnh khác trên vùng
form đã chuẩn hoá cùng bề rộng; `copy missing` là chữ có trong mock mà template không có.
⚠️ `differing 0` **chưa đủ** — luôn xem thêm `root h` (chiều cao card) và `worst dy` trong
`*.nodes.json`; đó là bài học đã trả giá ở lô 07-07.

## 4. Số đo hiện tại

**So với mock** (`qa-out/iter/summary-all.json`):

| slug | matched | differ | pixels | | slug | matched | differ | pixels |
|---|---|---|---|---|---|---|---|---|
| massage-body | 25 | 0 | 0.01% | | golden-pro | 40 | 1 | 6.14% |
| ielts-report | 33 | 2 | 0.22% | | rose-wellness | 43 | 0 | 7.11% |
| corporate-reg | 24 | 0 | 0.24% | | invoice-spinera | 38 | 6 | 7.04% |
| festa-italiana | 28 | 1 | 0.29% | | invoice-navy | 17 | 3 | 8.07% |
| massage-intake | 33 | 0 | 0.36% | | xmas-newsletter | 50 | 5 | 8.76% |
| product-order | 26 | 1 | 1.63% | | newsletter-amber | 10 | 2 | 11.14% |
| invoice-codexo | 36 | 1 | 3.41% | | xmas-sale | 46 | 9 | 11.41% |
| job-application | 21 | 0 | 3.70% | | first-book | 41 | 0 | 11.64% |
| gold-suite | 63 | 0 | 4.58% | | lagoon-booking | 65 | 15 | 6.63% |
| agency-flyer | 52 | 1 | 5.79% | | | | | |

**DNN vs Oqtane** (`qa-out/platform/summary.json`): **19/19 form — 0 chữ thiếu, 0 chữ thừa,
0 phần tử lệch**, pixel 0.88–6.83%, chiều cao chênh ≤1px.

## 5. Bẫy đã trả giá — đừng phát hiện lại

1. **`dnn-api-post.mjs` chết khi máy đang mở Chrome** — nó bám vào instance Chrome sẵn có, mọi call
   trả `TypeError: Failed to fetch` trong khi curl vẫn 401/200. Dùng `dnn-seed-templates.mjs`.
2. **Backtick trong comment bên trong template literal đóng chuỗi** (đã dính 3 lần).
3. **Cấm `col-` và `title` trong tên class** — megaform và compat bridge khớp chuỗi con + `!important`.
4. **Container query phải theo bề rộng CARD của mock**, không phải breakpoint viewport của mock
   (festa 768→704 làm masthead 36→60px; lagoon 1024→896 hiện lại sidebar 12 dòng).
5. **Không khai `font-weight` thì host stack ra 200**, không phải 400.
6. **`.mf-field-group` là `flex:0 0 100%`** — override `width` thôi không đủ.
7. **Icon font làm flex item đầu tiên đẩy CẢ card 3px** (baseline); dùng SVG background.
8. **Control của mock là inline-block trên line-box 16/24**, megaform để block ⇒ lệch 3px mỗi hàng.
9. **`--mf-page-bg` KHÔNG phải kênh opt-in** — khác `--mf-page-primary/text/border` (chỉ bơm khi bật
   "Color source: From page"), nó được phát cho mọi form từ nền trang host. Nối token nền của
   template vào đó ⇒ Oqtane theme tối sơn đè: gold-suite 4.2% → 49.29%, lagoon 2.33% → 68.2%.
10. **`POST /api/page` của Oqtane trả 200 body rỗng** rồi để trang **không có quyền nào**; phần còn
    lại phải làm bằng SQL (`tools/browser-qa/oq-wire-pages.sql`). Khoá gắn form là `MegaForm:FormId`.
11. **`run-card-batch.mjs --only` từng ghi đè cả summary** (nay đã merge) — panel trang review đọc
    thẳng file đó.

---

## 6. VIỆC CÒN LẠI — bàn giao Codex

### 6.1 ⭐ Nội dung/logo đang hardcode (câu hỏi của owner, ưu tiên 1)

**Hiện trạng:** toàn bộ chữ tĩnh (IELTS, Test Report Form, ACADEMIC, đoạn NOTE, CENTRE NUMBER/UK047,
9.0/8.5/7.0, ADMINISTRATOR COMMENTS, VALIDATION STAMP…) nằm thẳng trong `settings.customHtml`, và
logo là `background-image` trỏ vào `Assets/img/<slug>/`. Người dùng cuối **không sửa được qua UI**,
chỉ sửa được customHtml thô hoặc file JSON.

**Cơ chế có sẵn trong sản phẩm** (đã xác minh trong code, chưa dùng cho lô này):
* `FormHtmlRenderer.cs:306-315` — `{{content:key}}` được thay bằng `settings.customContent[key]`,
  **HTML-encode mặc định** (chống stored XSS, xem CLAUDE.md §5).
* `BuilderTemplateCatalogStore.cs:352` — template mang sẵn map content, được merge khi import.
* `MegaForm.UI/src/builder/core.ts:270,355,816-838` — builder giữ `settings.customContent` khi
  round-trip (đọc, chuẩn hoá, merge khi apply template).

**Việc cần làm:**
1. Đổi chữ tĩnh trong shellHtml của từng spec sang `{{content:key}}` + khai `customContent` mặc định
   trong spec (giá trị mặc định = đúng chữ của mock, để pixel parity không đổi).
2. Với logo/ảnh: cần một khoá content kiểu `{{content:logo_url}}` dùng trong `style` hoặc `<img>`
   — lưu ý `Esc()` là attribute-safe nên nhét vào `url()` phải kiểm lại escaping.
3. **Chưa xác minh:** builder có UI cho người dùng sửa `customContent` hay không (chỉ thấy code
   round-trip, chưa thấy panel). Nếu chưa có thì phải dựng — đây là phần lớn nhất của việc này.
4. Sau khi đổi: chạy lại `run-card-batch.mjs` để chắc chắn số đo không đổi.

### 6.2 invoice-navy: bấm "Next step" không sang bước 2 (owner báo, tôi KHÔNG tái hiện được)

Tôi điền 2 field bắt buộc rồi click Next: wizard chuyển page 0 → page 1, không lỗi console, nút
không mang class `mf-nav-blocked`. Trong ảnh của owner **DUE DATE (08/05) sớm hơn INVOICE DATE
(08/13)** — thử kịch bản đó trước. Trang tái hiện: `/mf-templates/mf-invoice-navy` và
`/mfqa-wide?mfFormId=70`.

### 6.3 "Typography source: From page" chưa ăn (Oqtane)

Cơ chế là class `.mf-inherit-type` trên `.mf-form-wrapper` (`ThemeFirstPaintCssService.cs:87-88`,
`Assets/css/megaform.css:232-235`) với `font-family:inherit!important` — selector đó **đã mạnh hơn**
mọi rule font của template, nên nghi vấn là **module Oqtane không gắn class**. Kiểm tra
`MegaForm.Oqtane.Client/Index.razor` xem có dùng danh sách class của service đó không.
("Color source: From page" thì đã chạy — chuỗi biến là `var(--mf-page-X, var(--mf-preset-X, màu-mock))`.)

### 6.4 Bốn template còn tràn ở 375px

`node tools/browser-qa/responsive-audit.mjs --widths 375` → inset âm:
xmas-newsletter (-50), festa-italiana (-41), gold-suite (-23), lagoon-booking (-1).
Nguyên nhân là phần tử bề rộng cố định bên trong; gộp cột (fallback ≤520px) không đủ.
⚠️ Đừng nâng ngưỡng fallback lên quá 520: mock hẹp nhất là 576px (xmas-sale) và 448px (newsletter),
đặt 680 làm chính phép đo với mock hỏng (xmas-sale 9 → 26 lệch).

### 6.5 Punch list từng template

Các dòng `differing` còn lại nằm trong `qa-out/iter/<slug>/report.json` (kèm `compare.png`,
`diff.png`). Nặng nhất: lagoon 15 (chip phòng thiếu nền, lệch gap trong card phòng), xmas-sale 9,
spinera 6, xmas-newsletter 5. Hai form còn `copy missing = 1`: job-application, invoice-navy.

### 6.6 48 template đã publish chưa được áp bộ luật mới

Gallery hiện vẫn 48 (`node tools/gallery/build-gallery.mjs` → `templates : 48`). Chúng **chưa** có:
gỡ chrome, viền ngoài, chuỗi biến theme/preset, fallback responsive. Quyết định trước lần publish
sau (48 → 67 nếu đẩy hết PENDING-REVIEW).

### 6.7 ~34 mock chưa convert

`form-builder-controls (10)/app/forms/` có ~53 mock, mới convert 19.

---

## 7. Quy tắc của owner (bắt buộc giữ)

* **"Pixel perfect nghĩa là CSS, hình ảnh, màu sắc, kích thước phải giống hệt design mock, không
  được bịa ra"** — mọi giá trị phải chép từ mock; đo, đừng đoán.
* Xong một form, QA trên browser rồi mới sang form khác.
* Template chỉ mang **thân form + đường viền**: không link "All forms", không nền trang của demo,
  nội dung **full width trong pane**, và không được sát mép.
