# AUDIT 2026-07-11 — Form có Payment field: save & payment process hiện tại

**Câu hỏi (owner):** nếu payment được add vào form thì quá trình **save form** + **payment process** hiện nay ra sao?

**Kết luận 1 dòng:** payment **chưa production-ready**; trên **Oqtane thì backend payment KHÔNG tồn tại**, và trên
nền chạy được (Web) thì **server không hề xác minh giao dịch khi nhận submission** — client tự khai `status:"paid"`
là qua. Đây là **lỗ hổng bypass thanh toán**, nặng hơn cả amount-tampering mà rule #7 nói tới.

> Phạm vi: đọc code + grep toàn solution (read-only), chưa chạy E2E với Stripe/PayPal thật.

---

## 1. SAVE — payment settings được lưu ở đâu

| Thứ | Nơi lưu | Ghi chú |
|---|---|---|
| Cấu hình payment của FIELD (provider, amountMode, amount, currency, publishable key, các URL endpoint) | `field.widgetProps` → nằm trong **`MF_Forms.SchemaJson`** | KHÔNG có bảng payment riêng |
| Secret key (Stripe secret / PayPal secret) | Module/Portal setting qua `ModuleConfig/PaymentSettings` | **Web** (`MegaForm.Web/Controllers/MegaFormController.cs:1227`) + **DNN** (`MegaForm.DNN/WebApi/MegaFormApiController.cs:4182`); **Oqtane KHÔNG có endpoint này** |
| "Webhook secret" nhập ở UI Payment Settings | Có thu (`MegaForm.UI/src/dashboard/index.ts:1379`, `PaymentModels.cs:11`) | **Không có endpoint webhook nào dùng nó** |

**Save form KHÔNG validate gì về payment**: không bắt buộc có giá, không kiểm provider đã cấu hình, không cảnh báo
nếu form có payment field nhưng nền tảng không có backend payment (Oqtane). Payment field đi qua `SaveForm` như một
field bình thường (Oqtane `MegaFormController.cs:351-477`).

---

## 2. PROCESS — chuyện gì xảy ra khi user submit (theo code thật)

```
[Widget payment] user bấm Pay
   ├─ Stripe: POST /api/megaform/payments/stripe/create-intent   → PaymentController.StripeCreateIntent (Web:159)
   │            server re-resolve giá từ schema (ResolveServerAmount, Web:76) → gọi api.stripe.com → clientSecret
   │          stripe.confirmPayment() ở client → KHÔNG lỗi thì WIDGET TỰ SET status='paid'  (widget ts:438)
   │          ⚠ endpoint /stripe/confirm (Web:234) — verify server-side — TỒN TẠI NHƯNG KHÔNG AI GỌI (dead)
   ├─ PayPal: create-order (Web:368) → capture-order (Web:469) → widget set status='paid' (ts:591)
   ▼
[hidden input fieldKey] = {"provider":"stripe","status":"paid","amount":...,"transactionId":"..."}
   ▼
[Submit] SubmissionProcessor.ProcessAsync
   → validate / anti-spam / lưu DataJson / notify / webhook / workflow
   ⚠ KHÔNG có một dòng nào về payment (grep "payment|stripe|paypal" trong SubmissionProcessor.cs = 0 hit)
   ⚠ KHÔNG gọi lại Stripe/PayPal để xác minh transactionId
   ⚠ KHÔNG có submission status kiểu "payment_pending"
```

**Trên Oqtane** (nền QA chính): widget mặc định trỏ `/api/megaform/payments/stripe/create-intent`
(`megaform-widget-payment-unified.ts:104`) — route này **không tồn tại trong Oqtane** (không có `PaymentController`,
`Startup.cs` không đăng ký gì về payment; chỉ có `AddPaymentAssets` nạp JS). ⇒ create-intent **404**, không thanh toán được.

---

## 3. Bảng trạng thái

| Hạng mục | Trạng thái | Chứng cứ |
|---|---|---|
| Widget payment (render/collect/validate client) | CHẠY | `MegaForm.UI/src/widgets/plugins/megaform-widget-payment-unified.ts:177-629` |
| Stripe create-intent / PayPal create+capture | CHẠY — **chỉ MegaForm.Web** | `MegaForm.Web/Controllers/PaymentController.cs:159, 368, 469` |
| Server resolve giá (chỉ mode `fixed`) | CHẠY một phần — chỉ Web | `PaymentController.cs:76-126` |
| **Payment backend trên Oqtane** | **KHÔNG CÓ** | không có file `PaymentController` trong `MegaForm.Oqtane.Server`; Startup không DI payment |
| **Payment gateway trên DNN** | **KHÔNG CÓ** (chỉ lưu key) | grep `api.stripe.com` chỉ hit Web |
| `/stripe/confirm` (verify PI server-side) | **DEAD** — widget không gọi | endpoint `PaymentController.cs:234`; widget set paid ở `ts:438` |
| `MegaForm.Core/Payments/*` (IPaymentProvider, recurring, coupon, tax/fee) | **DEAD CODE** — DI có, consumer không | DI `MegaFormAspNetCoreExtensions.cs:433`, `MegaFormComposer.cs:251` |
| Webhook Stripe/PayPal + verify chữ ký | **KHÔNG TỒN TẠI** | không có route webhook; `WebhookSecret` thu nhưng không dùng |
| Nhánh payment trong `SubmissionProcessor` | **KHÔNG TỒN TẠI** | grep payment/stripe/paypal = **0 hit** trong `SubmissionProcessor.cs` |
| Server-side enforce `requiredPaid` | **KHÔNG TỒN TẠI** (chỉ client `ts:625`) | `FormValidationService` không biết Payment |
| Payment ↔ workflow approval | **KHÔNG liên kết** | không có PaymentNodeExecutor; workflow chạy bất kể payment status |

---

## 4. Rủi ro bảo mật (đối chiếu rule #7 của CLAUDE.md)

1. **🔴 BYPASS THANH TOÁN (nặng nhất).** Server nhận `{"status":"paid","transactionId":"..."}` từ hidden input và
   **lưu thẳng**; `requiredPaid` chỉ enforce ở widget. Kẻ tấn công POST submission với `status:"paid"` là **submit
   thành công mà không trả một xu**. Đây là vi phạm trực diện quy tắc gốc "KHÔNG tin client cho quyết định tiền".
2. **🟠 Rule #7 mới thực hiện MỘT PHẦN, và sai tên field.** `ResolveServerAmount` chỉ enforce khi `amountMode=fixed`;
   mode `field`/`listenTotals` **fail-open, tin `amount` client** (`PaymentController.cs:108-111`). Các thuộc tính
   rule #7 nêu (`fixedPrice`/`allowUserAmount`/`minAmount`/`maxAmount`) **không tồn tại trong code** — code dùng
   `amount`/`amountMode`/`currency`, và **không có ràng buộc min/max nào được enforce**. ⇒ hoặc hiện thực cho đúng
   rule, hoặc sửa rule cho khớp code — hiện tại tài liệu đang mô tả một thiết kế chưa có thật.
3. **🟠 Số tiền lưu vào `DataJson` là số của client** (kể cả khi intent tạo đúng giá) → báo cáo/đối soát có thể lệch.
4. **🟠 Không có webhook + không verify chữ ký** ⇒ không có nguồn sự thật bất đồng bộ; toàn bộ dựa vào client báo "đã trả".
5. **🟡 Lệch pha nền tảng**: Oqtane/DNN không có gateway ⇒ form có payment trông "chạy" ở builder nhưng chết ở runtime.

---

## 5. Việc cần làm nếu muốn payment production-ready (đề xuất thứ tự)

1. **Verify server-side khi submit** (đóng lỗ #1): trong `SubmissionProcessor`, nếu form có Payment field
   `requiredPaid` → đọc `transactionId`, gọi `GET /v1/payment_intents/{id}` (Stripe) hoặc
   `GET /v2/checkout/orders/{id}` (PayPal), kiểm `status` + **số tiền/tiền tệ khớp giá server-resolve**, không khớp → từ chối.
   Ghi số tiền **do server xác minh** vào DataJson, không dùng số của client.
2. **Wire payment cho Oqtane (+ DNN)** — hoặc port `PaymentController`, hoặc (tốt hơn) dùng subsystem
   `MegaForm.Core/Payments` (`IPaymentProvider` đã có) rồi cho cả 3 nền dùng chung ⇒ hết dead code, hết lệch pha.
3. **Webhook + verify chữ ký** (`Stripe-Signature` với secret đã thu; PayPal verify) làm nguồn sự thật; thêm trạng thái
   submission thật (`payment_pending` → `paid`/`failed`) thay vì tin client.
4. **Đóng khoảng cách rule #7**: enforce min/max + trần cho cả `field`/`listenTotals`, bỏ fail-open; cập nhật CLAUDE.md
   cho khớp tên thuộc tính thật.
5. **Dọn dead code** (`/stripe/confirm`, `MegaForm.Core/Payments/*` nếu không dùng) + thêm validation `requiredPaid`
   phía server trong `FormValidationService`.

> Chưa đụng code payment trong phiên này — đây là báo cáo để owner quyết phạm vi.

---

## 6. TRẠNG THÁI VÁ — 2026-07-12 (owner duyệt scope: Oqtane + DNN trước)

| Finding §4 | Trạng thái |
|---|---|
| 🔴 #1 Bypass thanh toán (client tự khai `status:"paid"`) | ✅ **ĐÃ ĐÓNG** — `PaymentSubmissionVerifier` (bước 9d trong `SubmissionProcessor`): gọi lại Stripe/PayPal xác minh tiền thật, chống replay transactionId (in-process + tra trùng DataJson + stamp `formId` vào intent/order để chặn replay chéo form), ghi số tiền **server xác minh** vào DataJson. Fail-CLOSED mọi nhánh mơ hồ, kể cả khi host chưa đăng ký verifier. `requiredPaid` giờ enforce server-side tại đây. |
| 🟠 #2 Rule #7 sai tên field + fail-open mode `field`/`listenTotals` | ✅ **ĐÃ ĐÓNG** — `PaymentEndpointService.ResolveCreateAmount`: form/schema/field không resolve được = REJECT (hết fail-open); mode biến thiên bị chặn bởi `minAmount`/`maxAmount` (widgetProps mới, UI đã thêm) và check lại lần cuối lúc submit (mode `field` re-derive từ chính data submission). CLAUDE.md rule #7 đã sửa khớp tên field thật. |
| 🟠 #3 Số tiền lưu là số client | ✅ **ĐÃ ĐÓNG** — DataJson giờ chứa giá trị gateway xác nhận (`verified:true`, `verifiedAtUtc`). |
| 🟠 #4 Không webhook/verify chữ ký | ✅ **ĐÃ ĐÓNG (OQ+DNN)** — `PaymentWebhookService` + endpoint `stripe/webhook`, `paypal/webhook` trên Oqtane và DNN; Stripe HMAC (WebhookSecret đã thu giờ ĐƯỢC DÙNG), PayPal verify qua Webhook ID. |
| 🟡 #5 Lệch pha nền tảng | ✅ **Oqtane + DNN đã có backend đầy đủ** (create/confirm/capture/config/test/webhook, dùng chung `PaymentEndpointService` trong Core — `IPaymentProvider` cũ vẫn là dead code, subsystem mới nằm cạnh nó). Web giữ controller cũ (harden DEFER theo chỉ đạo owner 2026-07-12); Umbraco mới có verifier (endpoints DEFER). |

Bonus: sửa lỗi zero-decimal currency (VND/JPY bị nhân 100 khi tạo intent Stripe) + PayPal token cache + Idempotency-Key/PayPal-Request-Id + rate-limit per-IP + bulkhead 16-wide cho mọi call gateway. Chi tiết capacity: `Docs/PAYMENT_CAPACITY_AND_LIMITS_ANALYSIS.md` §7.
