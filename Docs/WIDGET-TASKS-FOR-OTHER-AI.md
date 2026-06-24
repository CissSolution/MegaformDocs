# MegaForm Widget Tasks — Copy & Paste cho AI khác

Mỗi task dưới đây là 1 prompt hoàn chỉnh. Copy nguyên block, paste cho AI khác.
AI khác sẽ trả về 1 file JS + 1 file CSS. Bạn đặt vào:
- `Assets/js/plugins/megaform-widget-{name}.js`
- `Assets/css/plugins/megaform-widget-{name}.css`

Rồi thêm 2 dòng script/link vào FormView.ascx (SAU megaform-widgets.js, TRƯỚC megaform-renderer.js).

---

## TASK 1: Calculator Widget

```
Tôi cần bạn tạo 1 widget plugin cho hệ thống form builder MegaForm.

## Plugin API

Widget đăng ký bằng cách gọi:

MegaFormWidgets.register('Calculator', {
    render: function(field, formId, existingValue) { return 'html string'; },
    bind: function(formId) { /* gắn events */ },
    collect: function(fieldKey, container) { return 'value string'; },
    validate: function(fieldKey, container) { return null hoặc 'error msg'; },
    defaults: { /* widgetProps mặc định */ },
    properties: [ /* mô tả UI cho builder */ ],
    meta: { icon: 'fa-class', label: 'Tên', category: 'widget' }
});

## Yêu cầu Widget: Cost Calculator

### Mục đích
Form field cho phép user nhập các biến số → tính toán kết quả tự động theo công thức.
Ví dụ: Calculator tính giá vận chuyển, tính phí dịch vụ, tính mortgage, tính BMI...

### field.widgetProps (đầu vào config):
{
    formula: "qty * unitPrice * (1 + taxRate / 100)",  // công thức tính
    variables: [
        { key: "qty", label: "Quantity", type: "number", min: 1, max: 1000, step: 1, default: 1 },
        { key: "unitPrice", label: "Unit Price ($)", type: "number", min: 0, step: 0.01, default: 99 },
        { key: "taxRate", label: "Tax Rate (%)", type: "range", min: 0, max: 50, step: 1, default: 10 }
    ],
    resultLabel: "Total Cost",
    resultPrefix: "$",
    resultSuffix: "",
    decimals: 2,
    showBreakdown: true
}

### render(field, formId, existingValue) → HTML string
- Tạo container div class="mf-wg mf-wg-calc" id="mf-{formId}-{field.key}"
- Cho mỗi variable: render input/range theo variable.type
  - type "number" → <input type="number" min max step>
  - type "range" → <input type="range"> + hiển thị giá trị hiện tại
  - type "select" → <select> nếu variable có options[]
- Khung kết quả: div class="mf-wg-calc-result" hiển thị resultPrefix + value + resultSuffix
- Optional breakdown div
- Hidden input: <input type="hidden" name="{field.key}" value="">
- existingValue nếu có: parse JSON, set lại values

### bind(formId) → void
- Tìm tất cả .mf-wg-calc, check el._mfB để tránh double bind
- Gắn 'input' event lên mọi input trong container
- Mỗi lần input thay đổi: recalculate()
  - Đọc giá trị tất cả variables
  - PARSE FORMULA AN TOÀN: KHÔNG dùng eval()
    Dùng cách này: thay tên biến = giá trị, rồi dùng Function('return ' + sanitized)
    Sanitize: chỉ cho phép: số, +, -, *, /, (, ), ., dấu cách, Math.*, biến names
    Reject mọi thứ khác (letters ngoài biến, brackets, semicolons...)
  - Cập nhật result display + hidden input value
  - Nếu showBreakdown: hiện từng bước tính

### collect(fieldKey, container) → string
- Return JSON.stringify({ variables: {key:value,...}, result: number })

### validate(fieldKey, container) → null | string
- Nếu result là NaN hoặc Infinity → "Calculation error"
- Nếu required và chưa nhập variables → "Please fill in all fields"

### defaults
{ formula: '', variables: [], resultLabel: 'Result', resultPrefix: '$', resultSuffix: '', decimals: 2, showBreakdown: false }

### properties (cho builder panel)
[
    { key: 'resultLabel', label: 'Result Label', type: 'text' },
    { key: 'resultPrefix', label: 'Prefix (e.g. $)', type: 'text' },
    { key: 'resultSuffix', label: 'Suffix (e.g. USD)', type: 'text' },
    { key: 'decimals', label: 'Decimal Places', type: 'number' },
    { key: 'formula', label: 'Formula', type: 'text' },
    { key: 'showBreakdown', label: 'Show Breakdown', type: 'checkbox' }
]
Lưu ý: variables array phức tạp hơn — builder sẽ handle riêng, bạn chỉ cần render theo nó.

### meta
{ icon: 'fa fa-calculator', label: 'Calculator', category: 'widget', description: 'Dynamic cost calculator' }

### CSS
- Tạo file CSS riêng, prefix .mf-wg-calc
- Variables grid: 2 cột desktop, 1 cột mobile
- Range input: custom styled (gradient track, circular thumb)
- Result box: large font (24px), accent background (#f0f0ff), rounded (12px), padding 16px
- Breakdown: smaller font, monospace, muted color
- Responsive < 600px

### Output
Trả về 2 file:
1. megaform-widget-calculator.js — self-contained IIFE, gọi MegaFormWidgets.register()
2. megaform-widget-calculator.css — styles
```

---

## TASK 2: Advanced File Upload Widget

```
Tôi cần bạn tạo 1 widget plugin cho hệ thống form builder MegaForm.

## Plugin API
(giống Task 1 — copy phần Plugin API ở trên)

## Yêu cầu Widget: Advanced File Upload

### Mục đích
Drag-and-drop file upload với preview ảnh, progress bar, multi-file, validation.

### field.widgetProps:
{
    maxFiles: 5,
    maxSizeMB: 10,
    allowedTypes: [".pdf",".jpg",".jpeg",".png",".docx"],
    enableDragDrop: true,
    showPreview: true,
    multiple: true
}

### render → HTML:
- Drag-drop zone: dashed border, icon cloud-upload, text "Click or drag files here"
- Accepted types display: ".pdf, .jpg, .png"
- File list container (empty initially)
- Hidden input(s) for file data
- Counter: "0 of 5 files"

### bind:
- Drag events: dragover (highlight zone), dragleave (remove highlight), drop (add files)
- Click zone → trigger hidden <input type="file" multiple>
- On file added:
  - Validate: check type (extension), check size (< maxSizeMB), check count (< maxFiles)
  - Show error nếu invalid
  - Add file card: icon (theo type), filename, size (human readable), remove button
  - Nếu image + showPreview: FileReader → thumbnail preview
  - Convert to base64 (FileReader.readAsDataURL)
  - Store in internal array
- Remove button: xóa file khỏi array, remove card
- Update counter

### collect → string:
- JSON.stringify(files array)
- Mỗi file: { name, size, type, data: "base64string..." }

### validate:
- Nếu required và 0 files → "Please upload at least one file"

### defaults
{ maxFiles: 5, maxSizeMB: 10, allowedTypes: [".pdf",".jpg",".png"], enableDragDrop: true, showPreview: true, multiple: true }

### properties
[
    { key: 'maxFiles', label: 'Max Files', type: 'number' },
    { key: 'maxSizeMB', label: 'Max Size (MB)', type: 'number' },
    { key: 'allowedTypes', label: 'Allowed Types (comma separated)', type: 'text' },
    { key: 'showPreview', label: 'Show Image Preview', type: 'checkbox' },
    { key: 'multiple', label: 'Allow Multiple', type: 'checkbox' }
]

### meta
{ icon: 'fa fa-cloud-upload-alt', label: 'File Upload', category: 'widget' }

### CSS
- Drop zone: dashed border 2px #cbd5e1, rounded 12px, padding 32px, text-align center
- Drag hover: border-color #6366f1, background #f5f3ff
- File card: flex row, icon + name + size + remove btn, border-bottom
- Image preview: 48x48 thumbnail, rounded, object-fit cover
- Remove btn: red × icon
- Counter: small muted text
- File type icons: PDF red, DOC blue, image green, other grey

### Output: 2 files
1. megaform-widget-fileupload.js
2. megaform-widget-fileupload.css
```

---

## TASK 3: Advanced Signature Pad

```
Tôi cần bạn tạo 1 widget plugin cho hệ thống form builder MegaForm.

## Plugin API
(giống Task 1)

## Yêu cầu Widget: Signature Pad

### field.widgetProps:
{
    penColor: "#1e293b",
    penWidth: 2,
    backgroundColor: "#ffffff",
    height: 200,
    showTypedOption: true,
    showDate: true
}

### render → HTML:
- Tab switcher nếu showTypedOption: [Draw] [Type]
- Draw tab: <canvas> responsive width, fixed height
- Type tab: text input với font chữ ký (cursive)
- Clear button, Undo button
- Date display nếu showDate
- Hidden input cho base64 data

### bind:
- Canvas drawing: mousedown/mousemove/mouseup + touchstart/touchmove/touchend
- Smooth line drawing (lineTo with lineWidth, lineCap round)
- Store strokes array cho Undo (pop last stroke, redraw remaining)
- Clear: reset canvas + strokes
- Tab switch: draw ↔ type
- Type mode: render text lên canvas dùng font cursive
- On any change: update hidden input = canvas.toDataURL('image/png')

### collect → string: base64 data URL

### validate:
- Nếu required và canvas trống → "Signature is required"
- Check canvas trống: getImageData → check if all pixels = background color

### CSS
- Canvas: border 1px solid #e2e8f0, rounded 8px, cursor crosshair
- Buttons: small, inline, muted style
- Typed input: font-family 'Dancing Script', cursive, large size
- Tab switcher: pill style toggle

### Output: 2 files
1. megaform-widget-signature.js
2. megaform-widget-signature.css
```

---

## TASK 4: Address Autocomplete (Google Places)

```
Tôi cần bạn tạo 1 widget plugin cho hệ thống form builder MegaForm.

## Plugin API
(giống Task 1)

## Yêu cầu Widget: Address Autocomplete

### field.widgetProps:
{
    googleApiKey: "",
    showMap: false,
    countries: [],
    showLine2: true,
    showCountry: true
}

### render → HTML:
- Search input với autocomplete: "Start typing your address..."
- Auto-populated fields: line1, line2, city, state, zip, country (các input riêng biệt)
- Optional: Google Map preview (nếu showMap + có API key)
- Hidden input cho full JSON address

### bind:
- Nếu có googleApiKey: load Google Places API, init autocomplete
- place_changed event → fill address fields tự động
- Nếu không có API key: fallback = manual address fields (giống Address widget hiện tại)
- Map: show marker tại address

### collect: JSON.stringify({line1,line2,city,state,zip,country,lat,lng})

### validate: Nếu required và line1 trống → "Address is required"

### Output: 2 files
1. megaform-widget-address-autocomplete.js
2. megaform-widget-address-autocomplete.css
```

---

## TASK 5: Phone Input (International)

```
## Yêu cầu Widget: International Phone Input

### field.widgetProps:
{
    defaultCountry: "US",
    preferredCountries: ["US","VN","JP","GB"],
    showFlags: true,
    validateFormat: true
}

### render:
- Country selector dropdown: flag emoji + country code + country name
- Phone number input
- Hidden input cho full number (+84 912345678)

### bind:
- Country dropdown change → update prefix
- Phone input: format as user types (e.g. +1 (555) 123-4567)
- Validation: check phone number format per country

### collect: full international number string (e.g. "+84912345678")

### Output: 2 files
```

---

## TASK 6: Star Rating (Advanced)

```
## Yêu cầu Widget: Star Rating Advanced

### field.widgetProps:
{
    maxStars: 5,
    allowHalf: true,
    icon: "star",     // "star" | "heart" | "circle" | "thumb"
    size: "md",       // "sm" | "md" | "lg"
    color: "#fbbf24",
    showLabel: true,
    labels: ["Terrible","Bad","OK","Good","Excellent"]
}

### render:
- Row of star/heart/circle icons (SVG hoặc Unicode)
- Hover preview: fill stars up to hovered position
- Half-star support: detect click on left/right half
- Label below: "Good" (từ labels array dựa vào rating)
- Hidden input

### bind:
- Mousemove on star row → highlight preview
- Click → set value
- Half-star: detect nếu click X < icon midpoint → value - 0.5

### collect: number as string (e.g. "4.5")

### Output: 2 files
```

---

## TASK 7: Multi-Select Tags

```
## Yêu cầu Widget: Tag Select

### field.widgetProps:
{
    maxTags: 10,
    allowCustom: true,
    searchable: true,
    tagColor: "#6366f1"
}
field.options = [{value:'react',label:'React'},{value:'vue',label:'Vue'},...]

### render:
- Container div with tag chips + input field
- Dropdown suggestions list (hidden initially)
- Hidden input cho selected values

### bind:
- Input focus → show dropdown
- Type → filter options (fuzzy match)
- Enter/click option → add tag chip
- Tag chip × button → remove
- Max tags enforcement
- allowCustom: Enter trên text không match → tạo tag mới
- Click outside → close dropdown

### collect: JSON.stringify(["react","vue","custom_tag"])

### Output: 2 files
```

---

## TASK 8: Repeater / Dynamic Rows

```
## Yêu cầu Widget: Repeater (Dynamic Rows)

### field.widgetProps:
{
    minRows: 1,
    maxRows: 20,
    columns: [
        { key: "item", label: "Item", type: "text", width: "40%" },
        { key: "qty", label: "Qty", type: "number", width: "20%" },
        { key: "price", label: "Price", type: "number", width: "20%" }
    ],
    showRowNumbers: true,
    addButtonText: "+ Add Row"
}

### render:
- Table header từ columns
- Initial rows (minRows)
- Add row button
- Each row: cells theo columns + delete button

### bind:
- Add row: clone template, append, update numbering
- Delete row: remove (nhưng giữ >= minRows)
- Input changes: update hidden value

### collect: JSON.stringify([{item:"Widget",qty:5,price:10},{...}])

### Output: 2 files
```

---

## QUY TẮC CHUNG CHO TẤT CẢ TASKS

Nhắc AI khác thêm vào prompt:

```
QUY TẮC BẮT BUỘC:
1. File JS là IIFE, gọi MegaFormWidgets.register() — KHÔNG tạo global variable khác
2. CSS prefix: .mf-wg-{type} — KHÔNG dùng class chung
3. HTML elements phải có name attribute = fieldKey hoặc fieldKey__subfield
4. ID pattern: mf-{formId}-{fieldKey}
5. Bind phải check el._mfB để tránh double bind
6. Collect trả về string (JSON.stringify nếu composite)
7. Validate trả về null (OK) hoặc string (error message)
8. KHÔNG dùng eval() — safe parse formulas
9. KHÔNG dùng jQuery — vanilla JS only
10. Responsive: hoạt động trên mobile 375px
11. Font Awesome 5 available: dùng class fa/fas/fab/far
```
