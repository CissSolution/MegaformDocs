# MegaForm Widget Development Spec
## Hướng dẫn tạo Widget Plugin cho AI/Developer khác

---

## 1. KIẾN TRÚC TỔNG QUAN

```
┌─────────────────────────────────────────────────────┐
│  MegaForm Core (KHÔNG SỬA)                          │
│  ├── megaform-renderer.js   → gọi renderWidget()    │
│  ├── megaform-builder-*.js  → palette + properties   │
│  └── FormSchema.cs          → lưu widgetProps        │
├─────────────────────────────────────────────────────┤
│  MegaFormWidgets (HỆ THỐNG PLUGIN)                   │
│  ├── megaform-widgets.js    → registry + core widgets│
│  └── MegaFormWidgets.register('MyWidget', {...})     │
├─────────────────────────────────────────────────────┤
│  Widget Plugin Files (AI KHÁC TẠO)                   │
│  ├── megaform-widget-paypal.js                       │
│  ├── megaform-widget-calculator.js                   │
│  └── megaform-widget-xxx.js                          │
└─────────────────────────────────────────────────────┘
```

Mỗi widget là 1 file JS riêng, đăng ký qua `MegaFormWidgets.register()`.
Core chỉ biết widget qua 4 hàm: `render`, `bind`, `collect`, `validate`.

---

## 2. WIDGET INTERFACE CONTRACT

Mỗi widget PHẢI implement object sau:

```javascript
MegaFormWidgets.register('WidgetTypeName', {

    // 1. RENDER — Trả về HTML string
    // Gọi khi form load / page render
    // Input:  field object, formId string, existingValue string
    // Output: HTML string (sẽ được inject vào DOM)
    render: function(field, formId, existingValue) {
        // field.key        — unique field key (e.g. "payment_1")
        // field.label      — display label
        // field.required   — boolean
        // field.widgetProps — object chứa config (amount, currency, etc.)
        // field.options     — array [{value,label}] (nếu cần)
        // formId           — form ID để tạo unique element IDs
        // existingValue    — giá trị đã lưu (khi edit submission)
        return '<div>...</div>';
    },

    // 2. BIND — Gắn event handlers sau khi HTML đã vào DOM
    // Gọi 1 lần sau render
    // Input:  formId string
    // Output: void
    bind: function(formId) {
        // querySelector để tìm elements
        // addEventListener để gắn events
        // Tải external SDK nếu cần (PayPal, Stripe, etc.)
    },

    // 3. COLLECT — Thu thập giá trị khi submit
    // Gọi khi user click Submit
    // Input:  fieldKey string, container DOM element
    // Output: string (giá trị để lưu — có thể là JSON string)
    collect: function(fieldKey, container) {
        // Tìm inputs trong container
        // Return giá trị dạng string
        return JSON.stringify({ key: 'value' });
    },

    // 4. VALIDATE — Kiểm tra trước submit
    // Gọi trước collect
    // Input:  fieldKey string, container DOM element
    // Output: null nếu OK, string error message nếu lỗi
    validate: function(fieldKey, container) {
        return null; // hoặc 'Error message'
    },

    // 5. DEFAULTS — Widget props mặc định (cho builder)
    // Dùng khi user drag widget vào canvas lần đầu
    defaults: {
        amount: '',
        currency: 'USD',
        // ...
    },

    // 6. PROPERTIES — Mô tả UI cho builder properties panel
    // Builder sẽ tự render form từ array này
    properties: [
        { key: 'amount', label: 'Amount', type: 'number' },
        { key: 'currency', label: 'Currency', type: 'select', options: ['USD','EUR','VND'] },
        { key: 'clientId', label: 'Client ID', type: 'text' },
        { key: 'sandbox', label: 'Sandbox Mode', type: 'checkbox', default: true }
    ],

    // 7. META — Thông tin hiển thị trong palette
    meta: {
        icon: 'fab fa-cc-paypal',   // Font Awesome class
        label: 'PayPal',             // Tên hiển thị
        category: 'payment',         // payment | widget | survey
        description: 'Accept PayPal payments'
    }
});
```

---

## 3. QUY TẮC BẮT BUỘC

### HTML Output Rules:
- Tất cả input elements PHẢI có `name` attribute = `fieldKey` hoặc `fieldKey__subfield`
- Composite widgets (Address, FullName) dùng pattern: `name="address__city"`, `name="address__zip"`
- Hidden inputs cho payment: `name="payment" value="transaction_id"`
- CSS class prefix: `mf-wg-` (e.g. `mf-wg-paypal`, `mf-wg-calc`)
- Unique IDs: dùng pattern `mf-{formId}-{fieldKey}` (e.g. `mf-42-payment_1`)

### Binding Rules:
- Check `el._mfB` trước khi bind để tránh double-bind:
  ```javascript
  if (el._mfB) return; el._mfB = true;
  ```
- External SDK loading: check `typeof SDK !== 'undefined'` trước
- Nếu cần load script: inject `<script>` vào `document.head`, dùng `onload` callback

### Value Collection Rules:
- Return luôn là **string** (JSON.stringify nếu cần)
- Composite values: `JSON.stringify({city:'HCM', zip:'70000'})`
- Payment: return transaction ID string
- Empty = `''` (không return null/undefined)

### Validation Rules:
- Return `null` = valid
- Return `string` = error message (sẽ hiển thị dưới field)
- CAPTCHA type: validate answer trước submit
- Payment type: check nếu amount > 0 nhưng chưa có transaction ID

---

## 4. WIDGET SPECS CHO AI KHÁC

---

### WIDGET: PayPal Payment
```
File: megaform-widget-paypal.js
Type Name: "PayPal"

INPUT (field.widgetProps):
  - clientId: string — PayPal App Client ID (required)
  - amount: string/number — Payment amount (required)
  - currency: string — "USD", "EUR", "VND", "GBP" (default: "USD")
  - sandbox: boolean — Use sandbox environment (default: true)
  - description: string — Payment description (optional)

OUTPUT (collect return):
  - Transaction ID string (e.g. "5O190127TN364715T")
  - Empty string "" if not paid yet

RENDER:
  - Show amount prominently: "USD $49.99"
  - PayPal SDK button container
  - Hidden input for transaction ID
  - Status messages: loading, success (green), error (red), cancelled

BIND:
  - Auto-load PayPal SDK: https://www.paypal.com/sdk/js?client-id=XXX&currency=YYY
  - Render paypal.Buttons() after SDK loads
  - createOrder → actions.order.create({purchase_units:[{amount:{value,currency_code}}]})
  - onApprove → actions.order.capture() → save transaction ID
  - onCancel → re-render buttons
  - onError → show error + retry button

VALIDATE:
  - If amount > 0 and no transaction ID → "Please complete PayPal payment"
  - If no clientId → should not validate (render shows setup message)

ERROR STATES:
  - No clientId → "Set PayPal Client ID in field settings" + link to developer.paypal.com
  - No amount → "Set Amount in field settings"
  - SDK load fail → "Failed to load PayPal SDK. Check Client ID"
  - Payment fail → "Payment failed" + Try Again button
  - Payment cancelled → re-show buttons

PROPERTIES (builder):
  - clientId: text input, label "PayPal Client ID"
  - amount: number input, label "Amount"
  - currency: select (USD/EUR/GBP/VND/JPY/AUD)
  - sandbox: checkbox, label "Sandbox Mode"

TEST:
  - Sandbox Client ID: lấy từ developer.paypal.com → Sandbox → REST API apps
  - Sandbox Buyer: sb-xxxxx@personal.example.com / password từ Sandbox Accounts
  - Test amount: 1.00 USD
```

---

### WIDGET: Cost Calculator
```
File: megaform-widget-calculator.js
Type Name: "Calculator"

INPUT (field.widgetProps):
  - formula: string — Calculation formula (e.g. "qty * price + (qty * price * tax / 100)")
  - variables: array — [{key:"qty", label:"Quantity", type:"number", min:1, max:100, default:1},
                         {key:"price", label:"Unit Price", type:"number", default:0},
                         {key:"tax", label:"Tax %", type:"number", default:10}]
  - resultLabel: string — Label for result (default: "Total")
  - resultPrefix: string — e.g. "$" 
  - resultSuffix: string — e.g. " USD"
  - showBreakdown: boolean — Show step-by-step calculation

OUTPUT (collect return):
  - JSON string: {"variables":{"qty":5,"price":100,"tax":10},"result":550}

RENDER:
  - For each variable: label + input (number/range/select)
  - Result display: large number, formatted with prefix/suffix
  - Optional breakdown: "5 × $100 = $500 + $50 tax = $550"
  - Result updates LIVE on any input change

BIND:
  - addEventListener('input') on all variable inputs
  - Recalculate on every change
  - Parse formula string, replace variable names with values, eval safely
  - SAFE EVAL: only allow numbers, +, -, *, /, (, ), Math.*
    DO NOT use eval() — parse and compute manually or use Function() with whitelist
  - Format result: toFixed(2), add prefix/suffix

VALIDATE:
  - Check all required variables have values
  - Check result is a valid number (not NaN/Infinity)

PROPERTIES (builder):
  - formula: text input, label "Formula" with helper text
  - variables: repeater (add/remove rows), each row has key, label, type, min, max, default
  - resultLabel: text input
  - resultPrefix: text input
  - resultSuffix: text input
  - showBreakdown: checkbox

CSS:
  - Variables in grid layout (2 columns on desktop)
  - Result box: large font, accent color background, rounded
  - Breakdown: smaller font, monospace-ish

EXAMPLE:
  widgetProps: {
    formula: "qty * unitPrice * (1 + taxRate / 100)",
    variables: [
      {key:"qty", label:"Quantity", type:"number", min:1, max:1000, default:1},
      {key:"unitPrice", label:"Unit Price ($)", type:"number", min:0, default:99},
      {key:"taxRate", label:"Tax Rate (%)", type:"number", min:0, max:50, default:10}
    ],
    resultLabel: "Total Cost",
    resultPrefix: "$",
    showBreakdown: true
  }
```

---

### WIDGET: Stripe Payment  
```
File: megaform-widget-stripe.js
Type Name: "Stripe"

INPUT (field.widgetProps):
  - publishableKey: string — Stripe publishable key (pk_test_... or pk_live_...)
  - amount: string/number — Amount in currency's smallest unit or display value
  - currency: string — "USD", "EUR", etc.

OUTPUT: Stripe token/PaymentMethod ID string

RENDER:
  - Amount display
  - Stripe Card Element mount point (<div>)
  - Error message area
  - Hidden input for token

BIND:
  - Auto-load https://js.stripe.com/v3/
  - Stripe(pk) → elements.create('card') → card.mount()
  - card.on('change') → show/clear errors
  - On form submit: stripe.createToken(card) → save token to hidden input
  
NOTE: Stripe requires server-side charge — token is just authorization.
      Form submission sends token → backend processes payment.

PROPERTIES:
  - publishableKey: text input
  - amount: number input  
  - currency: select
```

---

### WIDGET: File Upload (Advanced)
```
File: megaform-widget-fileupload.js
Type Name: "FileAdvanced"

INPUT (field.widgetProps):
  - maxFiles: number (default: 5)
  - maxSizeMB: number (default: 10)
  - allowedTypes: string[] — [".pdf",".jpg",".png",".docx"]
  - enableDragDrop: boolean (default: true)
  - showPreview: boolean (default: true)
  - uploadEndpoint: string — API URL for chunked upload (optional)

OUTPUT: JSON string of file info array
  [{"name":"doc.pdf","size":1024000,"type":"application/pdf","data":"base64..."}]

RENDER:
  - Drag-drop zone with icon
  - File list with name, size, preview (images), remove button
  - Progress bar per file
  - Total count: "3 of 5 files"

BIND:
  - dragover/drop events on drop zone
  - click to open file picker
  - FileReader for preview + base64
  - Validate size + type on add
  - Remove button per file
```

---

### WIDGET: Signature Pad (Advanced)
```
File: megaform-widget-signature.js  
Type Name: "SignatureAdvanced"

INPUT (field.widgetProps):
  - penColor: string — "#1e293b"
  - penWidth: number — 2
  - backgroundColor: string — "#ffffff"
  - showDate: boolean — show date stamp
  - showTypedName: boolean — allow typing name as alternative

OUTPUT: Base64 PNG data URL string

RENDER:
  - Canvas element (responsive width)
  - Clear button, Undo button
  - Optional: typed name input
  - Optional: date display

BIND:
  - Canvas mouse/touch events (mousedown, mousemove, mouseup, touchstart, touchmove, touchend)
  - Drawing logic with smoothing
  - Clear: reset canvas
  - Undo: pop last stroke
  - On submit: canvas.toDataURL('image/png')
```

---

### WIDGET: Date/Time Picker (Advanced)
```
File: megaform-widget-datetimepicker.js
Type Name: "DateTimePicker"

INPUT (field.widgetProps):
  - mode: "date" | "time" | "datetime" | "daterange"
  - format: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD"
  - timeFormat: "12h" | "24h"
  - minDate: string — ISO date
  - maxDate: string — ISO date
  - disabledDays: number[] — [0,6] for weekends
  - disabledDates: string[] — specific dates
  - showCalendar: boolean — inline calendar vs input

OUTPUT: ISO date string or JSON for ranges

RENDER:
  - Calendar grid (month view)
  - Navigation: prev/next month, year selector
  - Time selector if mode includes time
  - Selected date highlighting
  - Disabled dates greyed out

BIND:
  - Calendar date click → select
  - Month navigation
  - Time dropdowns
  - Input sync
```

---

### WIDGET: Star Rating (Advanced)  
```
File: megaform-widget-starrating.js
Type Name: "StarRating"

INPUT (field.widgetProps):
  - maxStars: number — 5 or 10
  - allowHalf: boolean
  - icon: "star" | "heart" | "circle" | "thumb"
  - size: "sm" | "md" | "lg"
  - showLabel: boolean — "4 out of 5"
  - labels: string[] — ["Terrible","Bad","OK","Good","Excellent"]

OUTPUT: number as string (e.g. "4" or "3.5")

RENDER:
  - Row of star icons
  - Hidden input for value
  - Optional label below

BIND:
  - Hover → preview fill
  - Click → set value
  - Half-star: detect left/right half of icon
```

---

### WIDGET: Multi-Select Tags
```
File: megaform-widget-tags.js
Type Name: "TagSelect"

INPUT (field.widgetProps):
  - options: [{value,label,color}]
  - maxTags: number
  - allowCustom: boolean — allow typing new tags
  - searchable: boolean

OUTPUT: JSON array string: ["tag1","tag2"]

RENDER:
  - Input field with tag chips
  - Dropdown suggestions
  - Remove (×) on each tag

BIND:
  - Type → filter suggestions
  - Enter/click → add tag
  - × click → remove tag
  - Max limit enforcement
```

---

## 5. PLUGIN REGISTRATION API

Widget file cần gọi đúng 1 lệnh:

```javascript
// megaform-widget-calculator.js
(function() {
    MegaFormWidgets.register('Calculator', {
        render: function(field, formId, existingValue) { ... },
        bind: function(formId) { ... },
        collect: function(fieldKey, container) { ... },
        validate: function(fieldKey, container) { ... },
        defaults: { formula: '', variables: [], resultLabel: 'Result' },
        properties: [
            { key: 'formula', label: 'Formula', type: 'text' },
            ...
        ],
        meta: {
            icon: 'fa fa-calculator',
            label: 'Calculator',
            category: 'widget'
        }
    });
})();
```

## 6. FILE LOADING ORDER

```html
<!-- 1. Core (KHÔNG SỬA) -->
<link rel="stylesheet" href="megaform.css">
<link rel="stylesheet" href="megaform-widgets.css">
<script src="megaform-widgets.js"></script>

<!-- 2. Plugin widgets (AI KHÁC TẠO - load sau widgets.js) -->
<script src="megaform-widget-paypal.js"></script>
<script src="megaform-widget-calculator.js"></script>
<script src="megaform-widget-xxx.js"></script>

<!-- 3. Renderer (load cuối) -->
<script src="megaform-renderer.js"></script>
```

## 7. CSS CONVENTIONS

```css
/* Mỗi widget dùng prefix .mf-wg-{type} */
.mf-wg-calculator { ... }
.mf-wg-calc-input { ... }
.mf-wg-calc-result { ... }

/* Responsive: mobile-first */
@media (max-width: 600px) { ... }

/* Colors: dùng CSS variables hoặc hardcode từ palette */
/* Primary: #6366f1, Error: #ef4444, Success: #22c55e */
/* Border: #e2e8f0, Text: #1e293b, Muted: #94a3b8 */
```

## 8. TESTING CHECKLIST

Mỗi widget phải pass:
- [ ] Render: HTML hiển thị đúng trên form published
- [ ] Bind: Interactivity hoạt động (click, input, drag, etc.)
- [ ] Collect: Submit form → giá trị lưu đúng format
- [ ] Validate: Required check hoạt động
- [ ] Builder Preview: Canvas hiện preview đúng
- [ ] Builder Properties: Widget Settings panel hiện đúng controls
- [ ] Mobile: Responsive trên 375px width
- [ ] Edit: Load lại form đã submit → hiển thị giá trị cũ đúng
- [ ] Conditional: Widget ẩn/hiện đúng khi có showIf condition
