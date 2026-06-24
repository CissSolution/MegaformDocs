# MegaForm PayPal Payment Widget — AI Task Spec

## ĐỌC KỸ TRƯỚC KHI BẮT ĐẦU

Bạn sẽ tạo 1 **PayPal Payment Widget** cho hệ thống form builder MegaForm.
Widget cho phép nhúng nút thanh toán PayPal vào form, liên kết với các trường form để tính tiền, 
và sau khi thanh toán thành công → form tự động submit + trigger workflow.

Output: **2 files**
- `megaform-widget-paypal.js` (~400-600 dòng)
- `megaform-widget-paypal.css` (~80-100 dòng)

---

## 1. PLUGIN API — MegaFormWidgets.register()

Widget đăng ký bằng cách gọi:

```javascript
MegaFormWidgets.register('PayPal', {
    render: function(field, formId, existingValue) { return 'html string'; },
    bind: function(formId) { /* gắn events, load PayPal SDK, render buttons */ },
    collect: function(fieldKey, container) { return 'value string'; },
    validate: function(fieldKey, container) { return null hoặc 'error msg'; },
    defaults: { /* widgetProps mặc định */ },
    renderProperties: function(field, onChange) { return 'html for builder settings panel'; },
    meta: { icon: 'fa-paypal', label: 'PayPal Payment', category: 'payment' }
});
```

Core engine gọi các hàm này TỰ ĐỘNG. Bạn KHÔNG sửa core.

---

## 2. WIDGET PROPS (field.widgetProps)

```javascript
{
    // === PayPal Config ===
    clientId: "sandbox_client_id_here",    // PayPal Client ID (sandbox hoặc live)
    mode: "sandbox",                        // "sandbox" | "live"
    currency: "USD",                        // ISO 4217: USD, EUR, GBP, VND, AUD...
    locale: "en_US",                        // PayPal locale

    // === Amount Config ===
    amountType: "fixed",                    // "fixed" | "field" | "calculated"
    fixedAmount: 99.00,                     // Khi amountType = "fixed"
    amountField: "total_price",             // Khi amountType = "field" → đọc value từ field key này
    amountFormula: "qty * price",           // Khi amountType = "calculated" → tính từ formula

    // === Item Description ===
    itemName: "Service Payment",            // Hiển thị trên PayPal checkout
    itemNameField: "",                      // Hoặc lấy từ field khác (vd: "package_name")
    itemDescription: "Thank you for your order",

    // === Button Style ===
    buttonLayout: "vertical",               // "vertical" | "horizontal"
    buttonColor: "gold",                    // "gold" | "blue" | "silver" | "white" | "black"
    buttonShape: "rect",                    // "rect" | "pill"
    buttonLabel: "paypal",                  // "paypal" | "checkout" | "buynow" | "pay"
    buttonHeight: 45,                       // 25-55 px

    // === Behavior ===
    requirePaymentBeforeSubmit: true,       // true = PHẢI pay trước mới submit được
    showAmountDisplay: true,                // Hiện box tổng tiền phía trên nút PayPal
    showPaymentStatus: true,                // Hiện trạng thái sau khi pay
    
    // === Advanced ===
    taxPercent: 0,                          // Thuế %
    shippingAmount: 0,                      // Phí ship cố định
    discountField: "",                      // Field chứa mã giảm giá (future)
    
    // === Callbacks (internal) ===
    // Sau khi pay thành công → widget tự set hidden input values
    // Form submit sẽ gửi payment data lên server
    // Server-side workflow trigger "on_submit" sẽ xử lý tiếp
}
```

---

## 3. render(field, formId, existingValue) → HTML string

Tạo HTML structure:

```html
<div class="mf-wg mf-wg-paypal" id="mf-{formId}-{field.key}" data-config='{...}'>
    
    <!-- Amount Display -->
    <div class="mf-pp-amount-box" id="mf-pp-amount-{formId}-{field.key}">
        <div class="mf-pp-amount-label">Amount Due</div>
        <div class="mf-pp-amount-value">
            <span class="mf-pp-currency">$</span>
            <span class="mf-pp-price" id="mf-pp-price-{formId}-{field.key}">99.00</span>
        </div>
        <!-- Tax/Shipping breakdown nếu có -->
        <div class="mf-pp-breakdown" id="mf-pp-breakdown-{formId}-{field.key}"></div>
    </div>

    <!-- PayPal Button Container -->
    <div class="mf-pp-buttons" id="mf-pp-btn-{formId}-{field.key}">
        <div class="mf-pp-loading">Loading PayPal...</div>
    </div>

    <!-- Payment Status -->
    <div class="mf-pp-status" id="mf-pp-status-{formId}-{field.key}" style="display:none;">
        <div class="mf-pp-status-icon">✅</div>
        <div class="mf-pp-status-text">Payment Successful</div>
        <div class="mf-pp-status-details">
            <span class="mf-pp-txn-id"></span>
        </div>
    </div>

    <!-- Hidden Inputs (submitted with form) -->
    <input type="hidden" name="{field.key}" value="">
    <input type="hidden" name="{field.key}_txn_id" value="">
    <input type="hidden" name="{field.key}_payer_email" value="">
    <input type="hidden" name="{field.key}_payer_name" value="">
    <input type="hidden" name="{field.key}_amount" value="">
    <input type="hidden" name="{field.key}_currency" value="">
    <input type="hidden" name="{field.key}_status" value="">
</div>
```

Nếu `existingValue` có (edit mode):
- Parse JSON → fill hidden inputs
- Hiện payment status thay vì button
- Không cho pay lại

---

## 4. bind(formId) → void

### 4.1 Load PayPal JS SDK

```javascript
// Kiểm tra nếu SDK đã load
if (window.paypal) {
    renderButtons();
    return;
}

// Load SDK dynamically
var script = document.createElement('script');
script.src = 'https://www.paypal.com/sdk/js?client-id=' + config.clientId 
    + '&currency=' + config.currency
    + '&locale=' + config.locale;
script.onload = renderButtons;
script.onerror = function() {
    container.querySelector('.mf-pp-loading').textContent = '❌ Failed to load PayPal';
};
document.head.appendChild(script);
```

### 4.2 Calculate Amount

```javascript
function getAmount() {
    var cfg = field.widgetProps;
    var subtotal = 0;
    
    if (cfg.amountType === 'fixed') {
        subtotal = parseFloat(cfg.fixedAmount) || 0;
    } 
    else if (cfg.amountType === 'field') {
        // Đọc value từ form field khác
        var sourceEl = document.querySelector('[name="' + cfg.amountField + '"]');
        if (!sourceEl) {
            // Thử tìm trong calculator widget hidden input
            sourceEl = document.querySelector('input[type="hidden"][name="' + cfg.amountField + '"]');
        }
        if (sourceEl) {
            var val = sourceEl.value;
            // Nếu value là JSON (calculator widget) → parse lấy result
            if (val && val.charAt(0) === '{') {
                try { val = JSON.parse(val).results.result; } catch(e) {}
            }
            subtotal = parseFloat(val) || 0;
        }
    }
    else if (cfg.amountType === 'calculated') {
        // Evaluate formula (GIỐNG calculator widget, KHÔNG dùng eval)
        subtotal = safeEvalFormula(cfg.amountFormula);
    }

    var tax = subtotal * (parseFloat(cfg.taxPercent) || 0) / 100;
    var shipping = parseFloat(cfg.shippingAmount) || 0;
    var total = subtotal + tax + shipping;

    return {
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        shipping: shipping.toFixed(2),
        total: total.toFixed(2)
    };
}
```

**QUAN TRỌNG:** Khi `amountType = "field"`, phải listen change event trên source field để auto-update amount display:

```javascript
if (cfg.amountType === 'field' && cfg.amountField) {
    var sourceInput = document.querySelector('[name="' + cfg.amountField + '"]');
    if (sourceInput) {
        sourceInput.addEventListener('input', updateAmountDisplay);
        sourceInput.addEventListener('change', updateAmountDisplay);
    }
    // Cũng listen trên hidden inputs (calculator widgets)
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.type === 'attributes' && m.attributeName === 'value') {
                updateAmountDisplay();
            }
        });
    });
    var hiddenSource = document.querySelector('input[type="hidden"][name="' + cfg.amountField + '"]');
    if (hiddenSource) {
        observer.observe(hiddenSource, { attributes: true });
    }
}
```

### 4.3 Render PayPal Buttons

```javascript
function renderButtons() {
    var btnContainer = document.getElementById('mf-pp-btn-' + formId + '-' + field.key);
    btnContainer.innerHTML = ''; // Clear loading

    paypal.Buttons({
        style: {
            layout: cfg.buttonLayout || 'vertical',
            color: cfg.buttonColor || 'gold',
            shape: cfg.buttonShape || 'rect',
            label: cfg.buttonLabel || 'paypal',
            height: cfg.buttonHeight || 45
        },

        // CREATE ORDER
        createOrder: function(data, actions) {
            var amounts = getAmount();
            
            if (parseFloat(amounts.total) <= 0) {
                alert('Amount must be greater than 0');
                return;
            }

            var itemName = cfg.itemName || 'Payment';
            if (cfg.itemNameField) {
                var nameEl = document.querySelector('[name="' + cfg.itemNameField + '"]');
                if (nameEl && nameEl.value) itemName = nameEl.value;
            }

            var purchaseUnit = {
                description: cfg.itemDescription || itemName,
                amount: {
                    currency_code: cfg.currency || 'USD',
                    value: amounts.total,
                    breakdown: {
                        item_total: { currency_code: cfg.currency, value: amounts.subtotal },
                        tax_total: { currency_code: cfg.currency, value: amounts.tax },
                        shipping: { currency_code: cfg.currency, value: amounts.shipping }
                    }
                },
                items: [{
                    name: itemName,
                    unit_amount: { currency_code: cfg.currency, value: amounts.subtotal },
                    quantity: "1"
                }]
            };

            return actions.order.create({
                purchase_units: [purchaseUnit],
                application_context: {
                    shipping_preference: 'NO_SHIPPING'
                }
            });
        },

        // ON APPROVE (payment successful)
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(orderData) {
                // Extract payment details
                var capture = orderData.purchase_units[0].payments.captures[0];
                var payer = orderData.payer;

                var paymentData = {
                    orderId: orderData.id,
                    transactionId: capture.id,
                    status: capture.status,  // "COMPLETED"
                    amount: capture.amount.value,
                    currency: capture.amount.currency_code,
                    payerEmail: payer.email_address,
                    payerName: (payer.name.given_name || '') + ' ' + (payer.name.surname || ''),
                    payerId: payer.payer_id,
                    createTime: orderData.create_time,
                    updateTime: orderData.update_time
                };

                // Set hidden input values
                setHiddenValue(field.key, JSON.stringify(paymentData));
                setHiddenValue(field.key + '_txn_id', paymentData.transactionId);
                setHiddenValue(field.key + '_payer_email', paymentData.payerEmail);
                setHiddenValue(field.key + '_payer_name', paymentData.payerName);
                setHiddenValue(field.key + '_amount', paymentData.amount);
                setHiddenValue(field.key + '_currency', paymentData.currency);
                setHiddenValue(field.key + '_status', paymentData.status);

                // Update UI
                showPaymentSuccess(paymentData);

                // If form should auto-submit after payment
                // (optional - can trigger via workflow instead)
                
                // Mark widget as paid
                container._mfPaid = true;
            });
        },

        // ON ERROR
        onError: function(err) {
            console.error('PayPal Error:', err);
            showPaymentError('Payment failed. Please try again.');
        },

        // ON CANCEL
        onCancel: function() {
            showPaymentMessage('Payment cancelled.', 'warning');
        }

    }).render('#mf-pp-btn-' + formId + '-' + field.key);
}
```

### 4.4 UI Update Functions

```javascript
function updateAmountDisplay() {
    var amounts = getAmount();
    var priceEl = document.getElementById('mf-pp-price-' + formId + '-' + field.key);
    if (priceEl) priceEl.textContent = amounts.total;

    var breakdownEl = document.getElementById('mf-pp-breakdown-' + formId + '-' + field.key);
    if (breakdownEl && (parseFloat(amounts.tax) > 0 || parseFloat(amounts.shipping) > 0)) {
        var html = '';
        html += '<div class="mf-pp-bk-row">Subtotal: ' + amounts.subtotal + '</div>';
        if (parseFloat(amounts.tax) > 0) html += '<div class="mf-pp-bk-row">Tax: ' + amounts.tax + '</div>';
        if (parseFloat(amounts.shipping) > 0) html += '<div class="mf-pp-bk-row">Shipping: ' + amounts.shipping + '</div>';
        breakdownEl.innerHTML = html;
    }
}

function showPaymentSuccess(data) {
    // Hide buttons, show success status
    document.getElementById('mf-pp-btn-' + formId + '-' + field.key).style.display = 'none';
    var statusEl = document.getElementById('mf-pp-status-' + formId + '-' + field.key);
    statusEl.style.display = '';
    statusEl.className = 'mf-pp-status mf-pp-status-success';
    statusEl.querySelector('.mf-pp-status-icon').textContent = '✅';
    statusEl.querySelector('.mf-pp-status-text').textContent = 'Payment Successful — ' + data.amount + ' ' + data.currency;
    statusEl.querySelector('.mf-pp-txn-id').textContent = 'Transaction: ' + data.transactionId;
}

function showPaymentError(msg) {
    var statusEl = document.getElementById('mf-pp-status-' + formId + '-' + field.key);
    statusEl.style.display = '';
    statusEl.className = 'mf-pp-status mf-pp-status-error';
    statusEl.querySelector('.mf-pp-status-icon').textContent = '❌';
    statusEl.querySelector('.mf-pp-status-text').textContent = msg;
}
```

### 4.5 Block Form Submit Until Paid

```javascript
// Nếu requirePaymentBeforeSubmit = true
// Widget set container._mfPaid = false ban đầu
// validate() sẽ check flag này
```

---

## 5. collect(fieldKey, container) → string

```javascript
collect: function(fieldKey, container) {
    var hidden = container.querySelector('input[type="hidden"][name="' + fieldKey + '"]');
    return hidden ? hidden.value : '';
}
```

Giá trị collected là JSON string:
```json
{
    "orderId": "8BN54632VY283061L",
    "transactionId": "5TY12345AB678901C",
    "status": "COMPLETED",
    "amount": "99.00",
    "currency": "USD",
    "payerEmail": "buyer@example.com",
    "payerName": "John Doe",
    "payerId": "ABCDEF12345",
    "createTime": "2026-02-23T10:15:00Z",
    "updateTime": "2026-02-23T10:15:05Z"
}
```

---

## 6. validate(fieldKey, container) → null | string

```javascript
validate: function(fieldKey, container) {
    var el = container.querySelector('#mf-' + /* formId */ + '-' + fieldKey);
    if (!el) return null;
    
    var cfg = JSON.parse(el.dataset.config || '{}');
    
    // Nếu bắt buộc thanh toán trước
    if (cfg.requirePaymentBeforeSubmit) {
        var statusInput = container.querySelector('input[name="' + fieldKey + '_status"]');
        if (!statusInput || statusInput.value !== 'COMPLETED') {
            return 'Payment is required before submitting this form.';
        }
    }
    
    return null; // valid
}
```

---

## 7. renderProperties(field, onChange) → HTML for Builder

Builder settings panel khi user chọn PayPal field:

```
┌─────────────────────────────────────┐
│ 💳 PayPal Payment Settings          │
│                                     │
│ PayPal Client ID                    │
│ [________________________________] │
│                                     │
│ Mode  ○ Sandbox  ○ Live            │
│                                     │
│ Currency  [USD ▼]                   │
│                                     │
│ ─── Amount ───                      │
│ Amount Source  [From Field ▼]       │
│   • Fixed Amount → input number     │
│   • From Field → dropdown of fields │
│   • Calculated → formula input      │
│                                     │
│ Fixed Amount  [99.00]              │
│ — OR —                              │
│ Source Field  [total_price ▼]       │
│ (dropdown: tất cả Number/Calculator │
│  fields trong form)                 │
│                                     │
│ ─── Item ───                        │
│ Item Name  [Service Payment_____]   │
│ Item Name Field  [none ▼]          │
│ Description [Thank you for...]      │
│                                     │
│ ─── Tax & Shipping ───              │
│ Tax %  [10]   Shipping $  [0]      │
│                                     │
│ ─── Button Style ───                │
│ Layout  ○ Vertical  ○ Horizontal   │
│ Color   [Gold ▼]                    │
│ Shape   ○ Rect  ○ Pill             │
│ Label   [PayPal ▼]                 │
│ Height  [45] px                     │
│                                     │
│ ─── Behavior ───                    │
│ ☑ Require payment before submit     │
│ ☑ Show amount display               │
│ ☑ Show payment status               │
└─────────────────────────────────────┘
```

**Source Field dropdown** phải dùng builder API:
```javascript
var fieldList = MegaFormBuilder.getFieldList();
// Returns: [{key:'total_price', label:'Total Price', type:'Number'}, ...]
// Filter: chỉ hiện Number, Calculator
```

Khi user thay đổi bất kỳ setting nào → gọi `onChange(field)` để builder cập nhật.

---

## 8. CSS STYLING (megaform-widget-paypal.css)

```css
/* Container */
.mf-wg-paypal { margin: 8px 0; }

/* Amount Box */
.mf-pp-amount-box {
    background: linear-gradient(135deg, #0070ba, #003087);
    color: #fff;
    padding: 20px 24px;
    border-radius: 12px;
    margin-bottom: 16px;
    text-align: center;
}
.mf-pp-amount-label {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.8;
    margin-bottom: 4px;
}
.mf-pp-amount-value {
    font-size: 36px;
    font-weight: 800;
}
.mf-pp-currency {
    font-size: 20px;
    vertical-align: super;
    margin-right: 4px;
    opacity: 0.8;
}
.mf-pp-breakdown {
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.7;
}
.mf-pp-bk-row {
    display: inline-block;
    margin: 0 8px;
}

/* Buttons Container */
.mf-pp-buttons {
    max-width: 400px;
    margin: 0 auto;
    min-height: 50px;
}
.mf-pp-loading {
    text-align: center;
    color: #64748b;
    padding: 16px;
    font-size: 14px;
}

/* Payment Status */
.mf-pp-status {
    text-align: center;
    padding: 20px;
    border-radius: 12px;
    margin-top: 12px;
}
.mf-pp-status-success {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #065f46;
}
.mf-pp-status-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
}
.mf-pp-status-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
}
.mf-pp-status-icon {
    font-size: 32px;
    margin-bottom: 8px;
}
.mf-pp-status-text {
    font-size: 16px;
    font-weight: 700;
}
.mf-pp-status-details {
    font-size: 12px;
    margin-top: 6px;
    opacity: 0.7;
}

/* Amount hidden when not showing */
.mf-pp-amount-box[data-hidden="true"] { display: none; }
```

---

## 9. PAYMENT FLOW — TOÀN BỘ QUY TRÌNH

```
User mở form
    ↓
User điền fields (name, email, chọn package...)
    ↓
PayPal widget tự cập nhật amount (từ field/formula)
    ↓
User click nút PayPal
    ↓
PayPal popup mở → user đăng nhập PayPal → xác nhận thanh toán
    ↓
PayPal gọi onApprove → capture order → nhận transaction details
    ↓
Widget lưu payment data vào hidden inputs
    ↓
Widget hiển thị ✅ Payment Successful
    ↓
User click Submit form (hoặc form tự submit)
    ↓
Form data + payment data gửi lên server
    ↓
Server lưu submission (DataJson chứa payment JSON)
    ↓
Workflow Engine trigger on_submit:
    → Step 1: Condition (payment_status == "COMPLETED")
    → Step 2: Send email xác nhận cho user
    → Step 3: Send email thông báo cho admin
    → Step 4: Webhook → gọi API bên thứ 3 (CRM, accounting...)
    → Step 5: Update field (order_status = "paid")
```

---

## 10. LIÊN KẾT VỚI CÁC TRƯỜNG FORM KHÁC

### Kịch bản 1: Fixed Price (Đơn giản)
```
Form: Registration Form
Fields: Name, Email, Package (Select: Basic $49 / Pro $99 / Enterprise $199)
PayPal: amountType = "fixed", fixedAmount = 99
```

### Kịch bản 2: Dynamic Price từ Select/Number (Phổ biến)
```
Form: Order Form  
Fields: Product (Select), Quantity (Number), Calculator (tính total)
PayPal: amountType = "field", amountField = "calculator_1" 
        (đọc result từ Calculator widget)
```

### Kịch bản 3: Dynamic Price từ Formula
```
Form: Booking Form
Fields: Room Type (Select: standard=100, deluxe=200), 
        Nights (Number), 
        Extra Bed (Checkbox: +30)
PayPal: amountType = "calculated", 
        amountFormula = "room_type * nights + extra_bed"
```

Cách đọc value từ field khác:
```javascript
function getFieldValue(fieldKey) {
    // 1. Tìm input/select/textarea thường
    var el = document.querySelector('[name="' + fieldKey + '"]');
    if (el) {
        if (el.tagName === 'SELECT') {
            return el.value; // option value
        }
        return el.value;
    }
    
    // 2. Tìm hidden input (calculator, widget)
    var hidden = document.querySelector('input[type="hidden"][name="' + fieldKey + '"]');
    if (hidden) {
        var val = hidden.value;
        // Calculator widget trả JSON: {"variables":{},"results":{"result":123.45}}
        if (val && val.charAt(0) === '{') {
            try {
                var parsed = JSON.parse(val);
                if (parsed.results && parsed.results.result != null) {
                    return parseFloat(parsed.results.result);
                }
            } catch(e) {}
        }
        return parseFloat(val) || 0;
    }
    
    // 3. Tìm radio checked
    var radio = document.querySelector('input[name="' + fieldKey + '"]:checked');
    if (radio) return radio.value;
    
    // 4. Checkbox → count hoặc sum
    var checks = document.querySelectorAll('input[name="' + fieldKey + '"]:checked');
    if (checks.length > 0) {
        var sum = 0;
        checks.forEach(function(c) { sum += parseFloat(c.value) || 0; });
        return sum;
    }
    
    return 0;
}
```

---

## 11. SECURITY & QUAN TRỌNG

### Client-side (Widget):
1. **KHÔNG lưu Client Secret trong JS** — chỉ dùng Client ID
2. **KHÔNG tin tưởng amount từ client** — server cần verify lại
3. PayPal SDK tự handle security (HTTPS, CORS, token)
4. Widget chỉ capture order — PayPal xử lý payment

### Server-side (Workflow / Post-submit):
Sau khi nhận submission, server NÊN verify payment:
```
POST https://api-m.paypal.com/v2/checkout/orders/{orderId}
Authorization: Bearer {access_token}

→ Kiểm tra: status == "COMPLETED", amount đúng, currency đúng
```
(Phần server verify này KHÔNG nằm trong scope widget. Widget chỉ lo client-side.)

### Input Sanitization:
- `clientId` chỉ chứa alphanumeric + hyphen
- `currency` chỉ 3 ký tự uppercase
- `fixedAmount` validate là positive number
- Formula sanitize: GIỐNG calculator widget (NO eval, chỉ safe chars)

---

## 12. EDGE CASES CẦN XỬ LÝ

| Case | Xử lý |
|---|---|
| Amount = 0 | Disable PayPal button, hiện "Amount must be greater than 0" |
| Amount < 0 | Treat as 0 |
| Source field chưa fill | Hiện $0.00, disable button until > 0 |
| Source field thay đổi sau khi pay | Không cho đổi nếu đã paid |
| PayPal SDK load fail (offline) | Hiện error message + retry button |
| User cancel PayPal popup | Hiện "Payment cancelled" + cho thử lại |
| PayPal decline payment | Hiện error + cho thử lại |
| Double pay prevention | Sau khi paid, ẩn button, chỉ hiện status |
| Multiple PayPal fields in 1 form | Mỗi field có unique ID, SDK load 1 lần |
| Form in iframe/embed | PayPal popup vẫn work (PayPal handles) |
| Mobile responsive | PayPal buttons tự responsive |
| Existing value (edit mode) | Parse JSON → hiện status, không cho pay lại |
| VND currency (no decimals) | PayPal requires integer for VND: amount = Math.round() |

---

## 13. CURRENCY SYMBOLS MAP

```javascript
var currencySymbols = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'AUD': 'A$',
    'CAD': 'C$', 'CHF': 'CHF', 'CNY': '¥', 'HKD': 'HK$', 'SGD': 'S$',
    'THB': '฿', 'VND': '₫', 'KRW': '₩', 'TWD': 'NT$', 'PHP': '₱',
    'MYR': 'RM', 'IDR': 'Rp', 'INR': '₹', 'BRL': 'R$', 'MXN': '$'
};
// VND, JPY, KRW: 0 decimal places
var zeroDec = ['VND','JPY','KRW','HUF','CLP','ISK','UGX','RWF'];
```

---

## 14. SAMPLE WORKFLOW (sau khi form submit với PayPal payment)

```json
{
    "id": "wf_payment_confirm",
    "name": "Payment Confirmation",
    "triggerType": "on_submit",
    "steps": [
        {
            "id": "check_payment",
            "type": "condition",
            "config": {
                "conditions": [
                    {"field": "payment_status", "operator": "equals", "value": "COMPLETED"}
                ]
            },
            "onTrue": "send_receipt",
            "onFalse": "flag_unpaid"
        },
        {
            "id": "send_receipt",
            "type": "send_email",
            "config": {
                "to": "{{email}}",
                "subject": "Payment Receipt — Order #{{_submissionId}}",
                "body": "Hi {{full_name}},\n\nThank you for your payment of ${{payment_amount}}.\nTransaction ID: {{payment_txn_id}}\n\nBest regards"
            },
            "next": "notify_admin"
        },
        {
            "id": "notify_admin",
            "type": "send_email",
            "config": {
                "to": "admin@company.com",
                "subject": "💰 New Payment: ${{payment_amount}} from {{full_name}}",
                "body": "New payment received:\nAmount: ${{payment_amount}}\nPayer: {{payment_payer_name}} ({{payment_payer_email}})\nTxn: {{payment_txn_id}}"
            },
            "next": "update_status"
        },
        {
            "id": "update_status",
            "type": "update_field",
            "config": {
                "updates": [
                    {"field": "order_status", "value": "paid"},
                    {"field": "paid_at", "value": "{{_now}}"}
                ]
            }
        },
        {
            "id": "flag_unpaid",
            "type": "update_field",
            "config": {
                "updates": [
                    {"field": "order_status", "value": "payment_failed"}
                ]
            }
        }
    ]
}
```

---

## 15. FILE OUTPUT REQUIREMENTS

### megaform-widget-paypal.js
- IIFE wrapper `(function() { ... })();`
- Gọi `MegaFormWidgets.register('PayPal', {...})`
- NO external dependencies (PayPal SDK loaded dynamically)
- ES5 compatible (no arrow functions, no const/let, no template literals)
- All IDs include formId + field.key for uniqueness
- Double-bind protection: `el._mfPPBound` flag

### megaform-widget-paypal.css  
- Scoped to `.mf-wg-paypal`
- Mobile responsive
- PayPal brand colors: #0070ba, #003087
- Consistent with MegaForm design (border-radius: 8-12px, subtle shadows)

### Đặt files vào:
- `Assets/js/plugins/megaform-widget-paypal.js`
- `Assets/css/plugins/megaform-widget-paypal.css`

Server tự auto-discover plugin files từ `/plugins/` folder.

---

## 16. TEST SCENARIOS

| # | Scenario | Expected |
|---|---|---|
| 1 | Fixed $99, sandbox, click Pay → approve | ✅ status, hidden inputs filled, form submittable |
| 2 | Amount from Number field, change value | Amount display updates, PayPal uses new amount |
| 3 | Amount from Calculator widget | Reads JSON result, updates in real-time |
| 4 | Cancel PayPal popup | "Cancelled" message, button still available |
| 5 | Required payment + try submit without pay | Validation error "Payment is required" |
| 6 | Already paid (edit mode) | Shows status, no PayPal button |
| 7 | Amount = 0 | Button disabled, message shown |
| 8 | Currency VND (no decimals) | Amount rounded, PayPal accepts |
| 9 | Multiple PayPal fields in form | Each works independently |
| 10 | Mobile view | Buttons responsive, amount box stacks |
