# Luật giao diện & đóng gói — những lỗi ĐÃ trả giá, đừng lặp lại

Tài liệu này ghi các luật rút ra từ lỗi thật, mỗi luật kèm bằng chứng đo được. Đọc trước khi sửa
CSS dùng chung, viết endpoint mới trên Umbraco, hoặc đóng gói để cài lên site.

Điểm chung của **mọi** lỗi dưới đây: build xanh, HTTP 200, không một dòng lỗi nào. Chúng chỉ lộ ra
khi có người mở màn hình lên nhìn, hoặc đo bằng số.

---

## 1. CSS "mặc định" phải nhường được cho template

**Luật.** Một luật CSS mang danh *mặc định* thì **không được `!important`** và **không được nhắm tên
class của template** (`.mfp-submit`, `.mf-btn-submit`, `.xms-submit`…). Nếu nó phải áp trong một
shell do người thiết kế dựng, hãy loại hẳn ngữ cảnh đó: `:not(:where(.mfp *))`.

**Đã trả giá.** Luật "mặc định" của renderer nhắm thẳng `.mfp-submit` rồi ép `!important` về một
biến màu chung. Nút gradient cam-hồng của template Coachella ra xanh `#4a90d9` bo 6px. Template
Botanical thoát được **chỉ vì** nó tình cờ đặt `--mf-btn-bg: #8b6e3a` — tức luật cũ bắt template
phải dùng biến màu, mà **một gradient thì không nhét vào biến màu đơn được**. Template càng vẽ kỹ
càng dễ mất.

**Ba tầng phải gỡ, không phải một** — luật `!important` sinh riêng cho từng form; luật bo góc
"mặc định" cũng mang `!important`; và luật nền tuy không `!important` nhưng specificity cao hơn.

⭐ **`:where()` chưa chắc đủ.** Trên lý thuyết `:where(...) button[type="submit"]` = (0,1,1) phải
thua `.mfp-coachella .mfp-submit` = (0,2,0). Đo bằng CDP thì Chrome **vẫn** cho luật mặc định thắng.
Đừng tranh luận với trình duyệt bằng bảng specificity — hãy **đừng khớp nữa**.

### Cách đo cho đúng

* Đọc `getComputedStyle().backgroundColor` là **chưa đủ**: gradient nằm ở `background-image`, và
  một nút gradient có `backgroundColor` là `rgba(0,0,0,0)`. Đọc cả hai.
* Probe tự duyệt `document.styleSheets` **bỏ sót** luật có selector lạ (`:has()`, `:is()`) vì
  `el.matches()` ném lỗi rồi bị `catch` nuốt. Nguồn đáng tin là **CDP
  `CSS.getMatchedStylesForNode`**.
* Nghi biến CSS không resolve? Tạo một `<div>` con rồi gán đúng chuỗi ấy — nếu áp được thì biến
  không phải vấn đề.

Công cụ: `tools/browser-qa/umb-submit-css-winner.mjs`, `umb-submit-button-probe.mjs`.

---

## 2. Luật CSS hậu duệ luôn chồm vào nội dung của component

**Luật.** `.wrapper h2 { … }` trong trang chủ nhà **sẽ** tô cả những `h2` do component vẽ ra. Trước
khi viết luật hậu duệ, hỏi: component nào đang render bên trong?

**Đã trả giá.** `.news-form h2` trông như chỉ tô cho tiêu đề của khối, nhưng nó với tay vào **trong**
form và ép mọi tiêu đề của bản thiết kế ("Personal Details", "Programme", "Consent") về `22px` cùng
letter-spacing của trang tin. Sau khi gỡ: tiêu đề đầu tiên trong khối trở lại **13px**, đúng
typography template.

Cùng họ: `.news-form` có nền + viền + bo 12px + đệm 28px, bọc quanh một form mà **mọi template
MegaForm đều tự vẽ thẻ của nó** ⇒ thẻ-trong-thẻ, hai đường viền, đệm cộng dồn.

---

## 3. Asset không có `?v=` thì bản vá không tới người dùng

**Luật.** Mọi `<link>`/`<script>` trỏ file cục bộ phải mang dấu vân nội dung. ASP.NET Core có sẵn
`asp-append-version="true"` (cần `@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers`). Gói
Umbraco thì **bump `version` trong `umbraco-package.json`**.

**Đã trả giá.** Sửa CSS xong, file trên máy chủ đã sạch (kiểm bằng `curl`), nhưng trình duyệt đã mở
trang một lần vẫn dùng bản cũ — và bản vá **trông như chưa từng được áp**. Mất một vòng chẩn đoán
chỉ để phát hiện số đo trong ảnh khớp với bản CSS cũ.

---

## 4. Umbraco: KHÔNG trả `JObject`/`JArray` thô

**Luật.** Payload còn mang kiểu Newtonsoft phải serialize bằng Newtonsoft rồi trả `Content(...)`,
không dùng `Ok(...)`. Umbraco/Oqtane dùng System.Text.Json.

**Đã trả giá.** STJ không hiểu `JObject`; nó chỉ thấy `IEnumerable<JToken>` nên xuất ra **mảng**.
Một field của template đi qua đường đó biến thành `[[[]],[[]],[[]],[[]],[[]]]` — đúng số phần tử,
không còn một thuộc tính nào. Trình duyệt đọc `field.type` ra `undefined`, wizard lọc bỏ mọi field
không có type, và người dùng nhận **form trắng trơn từ một template có 19 field**. HTTP 200, mảng
đúng 19 phần tử, không lỗi ở đâu cả.

⭐ Oqtane đã vá đúng lỗi này từ **2026-04-30** bằng `JsonOk()`, có ghi chú tại chỗ. Umbraco viết sau,
dùng `Ok()`, và không ai nối hai chuyện lại. **Sửa một nền thì rà ba nền còn lại** (Oqtane, Web,
DNN, Umbraco).

---

## 5. Umbraco: property là DỮ LIỆU, template mới VẼ

**Luật.** Thêm property vào document type chỉ tạo ra một ô để nhập. Muốn nó hiện ra trang thì phải
sửa **template `.cshtml`** — template phải chủ động đọc từng property và xuất HTML.

**Đã trả giá.** Trang đã chọn MegaForm #213 nhưng vẫn báo "No form picked yet", vì
`umbFormsPage.cshtml` chỉ đọc `umbracoForm` và không nhắc `megaformPicker` một lần nào.

⚠️ **Alias lệch hoa-thường giữa hai document type cho cùng một thứ** (`megaFormPicker` vs
`megaformPicker`). Gõ nhầm thì `Value<int?>()` trả `null` **không báo gì** — trông y hệt "chưa chọn".
Tra alias thật:

```sql
SELECT ct.alias, pt.Alias FROM cmsPropertyType pt
  JOIN cmsContentType ct ON ct.nodeId = pt.contentTypeId WHERE ct.alias = '<doctype>';
```

⚠️ File render thật nằm ở `MegaForm.Umbraco.Host/Views/*.cshtml`. Chuỗi template trong
`NewsDemoContentHandler` chỉ để **gieo** — sửa mỗi nó thì màn hình không đổi gì.

⚠️ Gỡ property khỏi document type phải có **bước dọn chạy lúc khởi động, đặt TRƯỚC cổng once-only**:
document type nằm trong CSDL, site đã gieo xong sẽ không chạy lại đoạn tạo doc type nữa.

---

## 6. Đóng gói: guard phải nằm NGOÀI `if (Test-Path)`

**Luật.** Kiểm tra sự tồn tại của thư mục nguồn phải `throw` khi **thiếu**, không phải `throw` bên
trong nhánh "có". Và trước khi đóng gói, **so timestamp DLL với source**.

**Đã trả giá.**

```powershell
$tplSrc = Join-Path $SOLUTION_DIR 'Samples\FormTemplates\Premium\DONEE'   # tên cũ
if (Test-Path $tplSrc) {          # thư mục không còn ⇒ cả khối bị bỏ qua IM LẶNG
    ...
    throw "..."                   # throw nằm TRONG nhánh 'có' nên không bao giờ chạy
}
```

Thư mục thật là `Premium\GALLERY-PUBLISHED`. Gói build xanh, không một cảnh báo, và **thiếu 4
template premium**. Sau khi vá, gói báo `4 premium starter(s) kept`.

Cùng lần đóng gói ấy: DLL net472 build lúc **16:18** trong khi bản vá C# lúc **21:11** — gói suýt
mang DLL cũ. Luôn kiểm:

```bash
date -r MegaForm.Core/Services/<file>.cs      # nguồn
date -r MegaForm.DNN/bin/Release/net472/MegaForm.Core.dll   # DLL sắp đóng gói
```

Và kiểm ngay trong file zip trước khi cài lên site thật: mở `Resources.zip` lồng bên trong, tìm
chuỗi của chính bản vá.

⚠️ **DNN install KHÔNG ghi đè `bin/*.dll`** — log cài chỉ nhắc `PersonaBar.dll`. Bản vá C# có thể
không tới; CSS/JS trong `Resources.zip` thì có.

---

## 7. Nghiệm thu: đi tới tận nơi người dùng nhìn

**Luật.** Đừng dừng ở "API trả đúng" hay "đã tạo xong". Giữa endpoint và mắt người dùng còn cả một
đoạn đường, và đó thường là nơi hỏng.

**Đã trả giá.**

* Form tạo từ wizard ở trạng thái `Draft`, `schema?formId=` trả **404 cho form nháp**, nên mở
  `/f/<id>` chỉ thấy *"Error loading form"* — trong khi form vẫn được tạo, vẫn hiện trong danh sách,
  vẫn đủ field trong CSDL. QA phải **mở trang công khai và đếm ô nhập**.
* Icon: `icon()` dựng `<i class="fas fa-…">` mà màn quản trị Umbraco **không nạp FontAwesome** ⇒ mọi
  thẻ ấy là phần tử rỗng. Không lỗi, không cảnh báo — chỉ là chỗ nào cũng thiếu hình. QA phải **đếm
  `svg` thật**, không kiểm sự tồn tại của phần tử.
* `.click()` gọi từ trong `page.evaluate()` chạy được cả trên phần tử `display:none` và không mở gì.
  Dùng `.click()` của Playwright.
* Popover/menu trong backoffice nằm dưới nhiều lớp shadow root ⇒ phải **deep-query xuyên shadow
  DOM**, và **chờ giữa hai lần bấm**.
* Trước khi kết luận "màn hình hỏng", kiểm **id đang thử có thật hay không**: một màn báo HTTP 404
  hoá ra đúng, vì form đã bị xoá khỏi CSDL.

---

## 8. Trước khi sửa, đo — đừng đoán

Mỗi lỗi ở trên đều có một giả thuyết sai nghe rất hợp lý trước khi số liệu bác bỏ nó: "chắc do
biến CSS không resolve", "chắc do specificity", "chắc do Unicode", "chắc màn hình hỏng". Số liệu rẻ
hơn nhiều so với một bản vá đi sai hướng.

Bộ đo có sẵn trong `tools/browser-qa/`:

| việc cần biết | công cụ |
|---|---|
| luật CSS nào đang thắng | `umb-submit-css-winner.mjs` |
| nút gửi trông thế nào ở mỗi form | `umb-submit-button-probe.mjs` |
| có lớp nào bọc quanh form không (cả tổ tiên) | `umb-form-wrapper-probe.mjs` |
| asset nào thiếu `?v=` | `umb-form-wrapper-probe.mjs` |
| catalog template trả field ra sao | `umb-template-catalog-probe.mjs` |
| form tạo từ gallery có xem được ngay không | `umb-gallery-create-qa.mjs` |
| màn After submit dựng đúng chưa | `umb-after-submit-flow-qa.mjs` |
| nút trên site thật sau khi cài gói | `dnn-live-submit-button.mjs` |
