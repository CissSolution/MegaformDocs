# HANDOFF — 2026-07-26: Convert 3 mock "invoice" form → MegaForm premium template

Site QA: **`http://dnn10_3_3_test20.ai`** (host/**dnnhost**), pool `DNN10_3_3_Test20.AI_nvQuickSite`,
DB `WINDOWS-11\SQLEXPRESS / DNN10_3_3_Test20`.
Mock nguồn: **`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)`** (Next.js, đang chạy)
→ `http://localhost:3000/forms/invoice-orange | invoice-dark | invoice-minimal`.
Nguồn màu/markup chuẩn: `app/forms/<slug>/page.tsx` (đọc hằng `O` / `D` / `M` ở đầu file).

## 0. TRẠNG THÁI

| Template | Slug | Form trên site | Tình trạng |
|---|---|---|---|
| Invoice **Orange** | `invoice-orange-application` | **17** | ĐẠT; còn seed 2 dòng line-item |
| Invoice **Dark** | `invoice-dark-application` | **18** | ĐẠT — có "SAMPLE" + ô QR (owner duyệt 07-26) |
| Invoice **Minimal** | `invoice-minimal-application` | **19** | ĐẠT — `docInk` đã về #1A1A1A / 30px / 700 |

Mở render thật (không cần gắn module vào trang): **`/Home?mfFormId=<id>`**.
File template canonical: `Samples/FormTemplates/Premium/DONEE/invoice-*-application.json`.
Generator đã **chuyển vào repo**: `tools/templates/build-invoice-templates.mjs` (trước nằm trong scratchpad tạm).

**ĐÃ ĐẨY GALLERY** — `54473d7` rồi `64b6fb1` (sửa responsive) trên `CissSolution/megaform-gallery@main`,
40 → **43 template**. Xác minh 3 lớp: DONEE == manifest == CDN (sha256 + size).
🔴 **NHƯNG consumer CHƯA THẤY** — xem §5.1.

## 1. ⭐ QUY TRÌNH (đã dựng sẵn, chạy lại được)

Scratchpad `C:\Users\ADMINI~1\AppData\Local\Temp\claude\…\14a5e882-…\scratchpad`:

| Script | Việc |
|---|---|
| `build-invoice-templates.mjs` | **Nguồn sự thật** — sinh cả 3 file JSON từ `PALETTES`; tự kiểm brace CSS + field nào thiếu `{{field:}}` |
| `deploy-template.ps1` | Bơm template JSON thẳng thành 1 form (`MF_Forms`) để render thật |
| `shot-ref.mjs` | Chụp 3 trang mock ở `localhost:3000` làm ảnh chuẩn |
| `shot-crop.mjs` / `shot-form.mjs` | Chụp bản MegaForm (crop `.io-card` hoặc full trang) |
| `diff-style.mjs` | **So computed style mock ⇄ MegaForm**, in ra bảng lệch |
| `probe-frame.mjs` | Liệt kê chuỗi tổ tiên + phần tử nào đang vẽ khung, + màu chữ |
| `probe-mfp.mjs` | Liệt kê **rule CSS nào thắng** trên `.mfp` (kỹ thuật gỡ mọi vụ "CSS không ăn") |
| `verify-total.mjs` | Bấm "+ Add row", gõ số, đọc `grand_total` + 3 span tổng |

Vòng lặp: sửa `build-invoice-templates.mjs` → `node build-invoice-templates.mjs` →
`deploy-template.ps1` cho từng slug → `Restart-WebAppPool` → chụp/đo.

## 2. ⭐⭐⭐ 6 CẠM BẪY MỚI (mỗi cái là 1 bug thật đã mất thời gian)

Bổ sung cho bộ 7 bẫy skin của 07-23 ([[project_20260723_premium_skins_convert_and_dnn_docs]]).

### #8 — `.mf-field-group` có sẵn `flex-basis:100%`
Shell dùng `display:flex;flex-direction:column` ⇒ flex-basis là **MAIN SIZE = CHIỀU CAO** ⇒ field 53px
nội dung phình thành **283px**, các section chồng lên nhau.
`getComputedStyle` báo `height:283px` nhưng **liệt kê rule ra RỖNG** (là kết quả layout, không phải khai báo).
**Vá:** `.mfp.mfp-<slug> .mf-field-group{flex:0 0 auto!important}`.
Template euro/brochure không dính vì chúng dùng CSS **grid**.

### #9 — Theme bridge tiêm inline, thắng bằng độ đặc hiệu
MegaForm tiêm `<style>` inline **SAU** customCss, dạng
`:where(#mf-form-wrapper-N) .mfp[class*="mfp-"] button[type="submit"]{…!important}` = **(0,3,1)**.
Rule `.mfp.mfp-<slug> .io-submit` chỉ (0,3,0) ⇒ **thua** ⇒ nút Submit bị sơn xanh Bootswatch, input về
`#fafafa`/radius 8px.
**Vá:** nhân đôi class slug trong biến gốc: `const R = '.mfp.mfp-<slug>.mfp-<slug>'` ⇒ mọi rule lên (0,4,x).

### #10 — ⭐ "CARD THỪA": có CONTRACT sẵn, đừng đua `!important`
`CustomShellCompatibilityCssService.cs:38` — **`[CardThuaFix 2026-06-23]`**:
```
:not(:has(.mfp-card)):not(:has(.fr-card)):not(:has(.ey-card))
```
MegaForm **cố ý không vẽ card** nếu shell đã tự có card, nhưng **chỉ nhận 3 tên class đó**.
Card tên riêng (`.io-card`) ⇒ không được nhận ⇒ bị vẽ card thứ hai bao ngoài.
**Vá đúng:** `class='io-card mfp-card'`. (Nâng độ đặc hiệu KHÔNG ăn — rule kia có `:not(:has())` nên rất nặng.)

### #11 — Chữ trong shell phải `!important`
Theme bridge có `!important` cho màu chữ ⇒ mọi rule màu trong shell **thiếu `!important` là mất**
(doc title bị kéo về navy `rgb(26,26,46)` của theme). Áp cho: eyebrow, doctitle, kicker, addr, brand,
meta, totals, back, foot.

### #12 — `.mf-loading` ("Đang gửi…") nằm NGOÀI shell
Renderer sinh `#mf-loading-<id>` là **anh em** của shell trong `.mf-form-inner` ⇒ vẽ **dưới** card.
**Vá:** `.mf-form-wrapper:has(.mfp-<slug>) .mf-form-inner{position:relative}` +
`.mf-loading{position:absolute;inset:0;…}` (đừng dùng `fixed` — nó phủ cả header DNN).
Cùng kỹ thuật `:has()` để dọn `.mf-form-inner` (bg/border/shadow/padding/max-width) vì shell nằm BÊN TRONG
wrapper, không selector thường nào với ngược lên tổ tiên được.

### #13 — Skin tối: option hardcode `#fff` ⇒ chữ trắng trên nền trắng
Chips/cards phải lấy màu từ palette (`optionBg`/`optionInk`), không hardcode.
**Tái phát ở chỗ khác:** `.io-logo` tô nền `var(--io-accent)`, mà accent của skin dark **CHÍNH LÀ
`#FFFFFF`** ⇒ chữ "EY" trắng trên ô trắng, vô hình. Quy tắc rút ra: **mọi cặp nền/chữ mà một vế lấy từ
`--io-accent` đều phải có biến palette cho vế kia** (`logoInk`), đừng để `#fff` chết cứng.

### #14 — ⭐⭐ DataGrid: ô header là `position:sticky;top:38px` — TRÔI ĐÈ LÊN DÒNG ĐẦU
`megaform-widget-datagrid.ts:261` đặt `.mfw-dgrid-head .mfw-dgrid-cell{position:sticky;top:38px}`,
và **`widgetProps.stickyHeader:false` KHÔNG gỡ được** (prop đó không điều khiển CSS này).
Sticky bị giới hạn bởi `.mfw-dgrid-grid`; trong hoá đơn bảng chỉ ~2 dòng nên header **trượt trọn 38px
xuống** và vẽ chồng lên dòng đầu.
**Cách nhận ra bằng số** (đừng nhìn ảnh mà đoán "sai grid-column"): đo `y` tự nhiên vs `y` render —
header lẽ ra ở `y=1003`, render ở `y=1041`, lệch **đúng bằng `top:38px`**. Ô rỗng vẫn nằm đúng row 2
(`grid-column:1/-1` do widget tự đặt inline ở `:468/:497` — không phải lỗi của skin).
**Vá:** `${R} .mfw-dgrid-head .mfw-dgrid-cell{position:static!important;top:auto!important;z-index:auto!important}`.
⭐ Selector phải là **`.mfw-dgrid-head .mfw-dgrid-cell`**, KHÔNG phải `.mfw-dgrid-head-cell`: widget còn
sinh **ô thứ 6 không có class** (`<div class="mfw-dgrid-cell"></div>`, `:493`) làm chỗ trống cho cột
nút xoá — nó giữ nguyên `#f8fafc` mặc định và hiện ra thành **hộp trắng ở cuối hàng header**.
⭐ Trong cùng một khối, `border:0` phải viết **TRƯỚC** `border-bottom`, nếu không shorthand xoá luôn
hairline (bảng kiểu `rule` mất gạch chân).

### #15 — ⭐⭐ ĐỪNG thêm `@media` vào skin: **mock KHÔNG có breakpoint nào**
Owner báo 07-26: ở khung hẹp 3 template lệch hẳn mock. Thủ phạm là khối
`@media (max-width:760px)` tôi tự thêm (xếp header thành cột, canh trái doc-title, ép lưới về 1 cột).
Mock dùng Tailwind `flex items-start justify-between` / `grid-cols-2` / `grid-cols-3` **không có tiền tố
`md:`** ⇒ nó chỉ CO LẠI. Đo ở 480px và 390px: mock `stacked:false`, header luôn 1 hàng, doc canh phải.
**Đã gỡ hẳn khối media.** Lý do thứ hai để không dùng: media query đo **viewport**, nhưng module MegaForm
có thể nằm trong pane hẹp của trang rộng ⇒ đằng nào cũng bắn sai. Cần hành vi màn hình nhỏ thì dùng
`@container`, và hỏi owner trước.
⭐ **Đo phải ở chế độ ẨN DANH**: đăng nhập host thì persona bar DNN ăn **96px** bên trái, card co từ
448px xuống 368px ⇒ tưởng template tràn trong khi thực ra không.

### #16 — ⭐⭐ DataGrid `column.width` px cứng ⇒ tràn khỏi card ở khung hẹp
`gridTemplate()` (`megaform-widget-datagrid.ts:409`) nhét `c.width` **nguyên văn** vào
`grid-template-columns` rồi cộng thêm `44px` cột nút xoá — và **`width` không dùng ở chỗ nào khác**,
nên truyền `minmax()` là hợp lệ.
Với px cứng: `64+104+104+44 = 316px` track đóng băng vs **294px** nội dung ở viewport 390px ⇒ **cắt mất
15px** (card `overflow:hidden`). Mock là `<table>` auto-layout nên co được — đo `[88,42,67,73,23]`, không cắt.
**Vá:** `description: 'minmax(80px,1fr)'`, số: `minmax(0,64px)` / `minmax(0,104px)`.
⭐ Sàn 80px cho description là **bắt buộc**: grid chia chỗ trống cho track co giãn **SAU CÙNG**, nên
`minmax(0,1fr)` trơn sẽ bị bỏ đói về 0 khi hẹp. Kèm `min-width:0` cho `.mfw-dgrid-cell` + input, vì
kích thước tối thiểu tự động của track là min-content, mà `<input>` khai báo min-content khá lớn.
Verified desktop KHÔNG đổi: vẫn `386px 64px 104px 104px 44px`.

## 3. ⭐⭐ DataGrid — hợp đồng thật (line items + tổng tiền)

- **`totalField` MỘT MÌNH LÀ VÔ TÁC DỤNG.** `megaform-widget-datagrid.ts:929`: khối tính tổng nằm trong
  `if (props.totalFormula)`, và `totalField` chỉ được đọc **bên trong** đó.
  ⇒ Bắt buộc `totalFormula: 'Sum("qty * price")'`.
- `Sum()` nhận **chuỗi trong ngoặc kép** (`evalLocal:182`), sai cú pháp ⇒ ném `Sum needs quoted expression`.
  Hàm có sẵn: `Sum/Avg/Min/Max/If/Round/Abs/Floor/Ceiling/Math.*`.
- Cột tính: `type:'computed'` + `computeFormula`.
- Widget ghi kết quả vào `document.querySelector('[name="<totalField>"]')` rồi bắn event `input`.
- **Markup là DIV, không phải `<table>`**: `.mfw-dgrid` / `-toolbar` / `-title` / `-add` / `-grid` /
  `-head` / `-head-cell` / `-cell` / `-empty` / `-foot`. CSS nhắm `table thead th` là trượt hết.
- Ô rỗng phải `grid-column:1/-1` nếu không nó **đè lên header**.
- Seed dòng: widget đọc `JSON.parse(hidden.value)` (`:401`). **`defaultValue` JSON của field KHÔNG tới được
  hidden input** ⇒ 2 dòng mẫu chưa hiện. 🔴 Việc còn lại — xem §5.

## 4. ⭐ Tổng tiền hiển thị + tiền tệ không hardcode

Ô `<input>` trong pill không chịu ăn CSS ⇒ **bỏ input, dùng text**:
- `{{script:invoice_totals}}` trong customHtml + `settings.customScripts.invoice_totals`
  (cơ chế: renderer thay token bằng anchor rồi `injectManagedCustomScripts` chạy body — `renderer/index.ts:2140`).
- Script chỉ **định dạng** con số widget đã tính: đọc `[name="grand_total"]`, ghi vào
  `[data-io-sub] / [data-io-tax] / [data-io-total]`. Nhờ đó **Subtotal + Tax cũng sống** (trước là chữ tĩnh).
- `grand_total` vẫn ở DOM (widget ghi vào + submit được), chỉ bị đẩy khuất bằng `.io-hidden-field`.
- **Tiền tệ/thuế KHÔNG hardcode**: token `{{content:currency}}` + `{{content:tax_rate}}` → gắn lên
  `data-io-currency` / `data-io-taxrate`, script đọc từ DOM. Đổi `$`/`£`/`₫` hay VAT 10% = sửa content token
  trong builder, không đụng template. Verified: `script hardcodes euro? false`.
- **Verified E2E:** gõ `qty=3, price=350` ⇒ `grand_total=1050.00`, hiển thị `Subtotal €1050.00 · Tax €0.00 ·
  TOTAL €1050.00` — khớp mock.

## 5. 🔴 CÒN LẠI

### 5.1 ⭐⭐⭐ BLOCKER MỚI — `[FilesAreTruth]` ẩn template VỪA PUBLISH (stale listing)

Đã push + purge đúng quy trình, CDN phục vụ đủ 3 file (200, sha256 khớp), **nhưng install thật vẫn thấy
40 template và 0 invoice**:

```
GET /DesktopModules/MegaForm/API/BuilderTemplates/RemoteGalleryList?portalId=0&refresh=true
→ 200, count=40, invoice=[]
```

**Nguyên nhân đo được:** `GalleryRepositoryService.GetTemplatesManifestAsync` (`:128`) loại **mọi entry
manifest không có file trong listing** lấy từ jsDelivr **data API**. Hai lớp cache của jsDelivr **độc lập**:

| Lớp | URL | Purge được? | Sau khi push |
|---|---|---|---|
| File CDN | `cdn.jsdelivr.net/gh/…@main/<file>` | ✅ `purge.jsdelivr.net` | **43** — đúng ngay |
| Data API listing | `data.jsdelivr.com/v1/packages/gh/…@main` | ❌ không có purge | **40** — còn cũ |

Listing theo **commit** đã đúng (`@54473d7…` → 43 file, 3 invoice); chỉ alias `@main` là cũ, và đó là **origin
chứ không phải edge** — thử cache-bust cho `X-Cache: MISS`, `Age: 0` vẫn trả 40. ⇒ jsDelivr còn map
`main` → commit cũ, tự hết sau TTL của họ (nhánh GitHub ~12h).

⭐⭐ **BẪY KÈM: purge trả `"status":"finished"` KHÔNG có nghĩa là đã lan hết POP.**
Sau lần đẩy thứ hai, purge báo finished cho cả 5 file nhưng CDN vẫn trả **manifest cũ + 1 template cũ**.
Trạng thái nửa vời này **NGUY HIỂM HƠN cũ hoàn toàn**: manifest mới + file cũ (hoặc ngược lại) ⇒ sha256
lệch ⇒ `DownloadFileAsync` **từ chối cài**, khách thấy lỗi thay vì thấy bản cũ.
⇒ **Sau purge phải FETCH LẠI và đối chiếu size/sha từng file, purge lại file nào còn cũ** rồi mới coi là
xong. Lần này `invoice-dark` phải purge 2 lần. Script kiểm 3 lớp (DONEE ⇄ manifest ⇄ CDN) ở scratchpad.

**Đây là bẫy do chính `[FilesAreTruth]` (thêm sáng 07-26) sinh ra** — nó được viết để xử lý *xoá tay file*,
nhưng cũng nuốt luôn *file mới thêm* trong cửa sổ listing chưa kịp cập nhật. Publish này là lần đầu dính.

**Việc cần làm:**
1. Chờ TTL rồi **chạy lại `gallery-consumer.mjs`** (scratchpad) — kỳ vọng `count=43, invoice=[3]`.
2. ⭐ **Vá lâu dài** (chưa làm, cần owner duyệt vì đụng DLL Core + build 4 nền):
   chỉ được DROP entry sau khi **thật sự xác minh file 404**, đừng tin listing một mình.
   Bình thường số entry "nghi ngờ" = 0 nên không tốn thêm request nào.
   Fail-open hiện tại (`present == null || Count == 0`) **không cứu được ca này** vì listing vẫn hợp lệ,
   chỉ là cũ.

### 5.2 Việc còn lại của template

1. **Seed 2 dòng line-item** lúc mới mở form. Widget đọc từ `hidden.value` (`megaform-widget-datagrid.ts:401`);
   `field.defaultValue` không chảy vào đó. Hướng: xem `FormHtmlRenderer.cs:760` (SSR ghi `value="{val}"`) và
   đường client tương ứng — tìm xem `val` lấy từ đâu, có đọc `defaultValue`/`properties.defaultValue` không.
   (Vá xong thì ô "No items yet" biến mất luôn — nhưng bẫy #14 vẫn phải giữ, vì header sticky sẽ đè
   lên **dòng dữ liệu đầu tiên** y hệt.)
2. Minimal: mock dùng ô **"LOGO" viền rỗng** (`border-2`, chữ `M.muted`) chứ không phải ô đặc như hiện tại —
   khác biệt cấu trúc, chưa đổi vì owner đã duyệt bản hiện tại.
3. Chạy lại quy trình publish khi có sửa: `node tools/templates/build-invoice-templates.mjs` →
   `deploy-template.ps1` → `Restart-WebAppPool` → `shot-card.mjs` → `build-gallery.mjs` → push → purge.

## 6. FILE ĐÃ SỬA (canonical, CHƯA COMMIT ở repo chính)

- `tools/templates/build-invoice-templates.mjs` (**mới** — generator, nguồn sự thật của cả 3 template;
  chạy lại cho ra **đúng byte** đang phục vụ trên CDN, đã đối chiếu sha256).
- `Samples/FormTemplates/Premium/DONEE/invoice-{orange,dark,minimal}-application.json` (mới).
- `MegaForm.UI/src/my-inbox/enrich.ts` + `view.ts` — `[GridRowsInDetail v20260726]`: submission detail
  hiển thị **bảng dòng hàng thật** thay vì `"3 rows"`.
  Lý do: `MegaFormUtils.DescribeGridValue` (`:597`) cố ý trả `"N rows"` cho danh sách/CSV/email — panel chi tiết
  phải lấy **RAW** (mảng JSON) mới có dữ liệu. Cùng họ với fix `[DetailShowsEveryAnswer]` cho chữ ký.
- (Các thay đổi khác trong phiên: xem `CLAUDE_HANDOFF_20260726_AI_SQL_TABLE_FORMS_AND_INSERT_RAILS.md`.)

## 7. Bối cảnh khác của phiên (đã xong, đã verify)

Xem handoff kia — tóm tắt: 3 bug AI↔bảng SQL, rail premium-retarget, luật AI gate
(**production ⇒ chạy, trial ⇒ chặn**, bỏ `dev.lock`), table picker không nuốt bảng `MF_*` của admin,
Edit connection prefill + mask round-trip, submission detail hiện đủ trường + chữ ký,
gallery `[FilesAreTruth]` (xoá file trên GitHub là thẻ biến mất), site sạch `dnn1030_megafresh.ai`
cài bằng package.
