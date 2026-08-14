# HANDOFF CHO CLAUDE — 2026-07-28: Payment widget compact + Calculator amount

> Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
>
> Branch: `feature/typed-submission-storage-core`
>
> HEAD lúc bàn giao: `272d738`
>
> Trạng thái: source đã sửa và QA xong, **chưa commit, chưa tạo package Release**.

## 0. Việc Claude cần làm

1. Chỉ review/stage đúng phạm vi Payment ở §4.
2. Chạy lại test/build Release ở §7.
3. Tạo package cho host cần phát hành theo §8.
4. Kiểm tra package thực sự chứa JS, CSS và `MegaForm.Core.dll` mới theo §9.
5. Không dọn hoặc commit ké các thay đổi khác trong worktree.

Worktree có nhiều thay đổi từ các task khác. Tuyệt đối không dùng:

```text
git add .
git add -A
git reset --hard
git checkout -- .
git clean
```

Không sửa lại kiến trúc provider trong lượt build/package này nếu không tái hiện được lỗi thuộc
chính phạm vi Payment.

## 1. Kết quả đã triển khai

Payment runtime đã được thu gọn thành một khối nhỏ gồm:

- số tiền;
- trạng thái thanh toán;
- lựa chọn Stripe và/hoặc PayPal;
- vùng checkout do provider render.

Đã loại bỏ title, description, method header, provider metadata và các card/lớp trang trí dư.
Khi payment đã có trạng thái `paid`, provider switch và checkout stage tự ẩn; chỉ còn amount và
trạng thái hoàn tất.

Backend Stripe/PayPal hiện hữu vẫn được giữ nguyên:

- Stripe tạo Payment Intent qua endpoint server rồi gọi `stripe.confirmPayment()`;
- PayPal tạo/capture order qua endpoint server;
- form chỉ được ghi nhận sau khi `SubmissionProcessor` gọi `PaymentSubmissionVerifier`;
- server gọi lại provider, kiểm tra transaction, form/field metadata, amount, currency và replay;
- host thiếu `PaymentSubmissionVerifier` sẽ từ chối submission theo fail-closed.

Không có provider thứ ba được thêm trong task này. Runtime/backend hiện hỗ trợ **Stripe và PayPal**.

## 2. Contract nguồn tiền mới

`Payment.widgetProps.amountMode` hỗ trợ:

| Mode | Thuộc tính | Ý nghĩa |
|---|---|---|
| `fixed` | `amount` | Giá cố định cấu hình trực tiếp trong Payment widget. |
| `field` | `amountFieldKey` | Lấy giá trị từ Number, Hidden, pricing field hoặc Calculator. |
| `field` + Calculator | `amountFieldResultKey` | Chọn đúng result trong payload Calculator, ví dụ `payment_total`. |
| `listenTotals` | `listenEventName` | Giữ cơ chế totals event nâng cao hiện hữu. |

Ví dụ cấu hình chuẩn:

```json
{
  "type": "Payment",
  "key": "payment",
  "widgetProps": {
    "provider": "both",
    "amountMode": "field",
    "amountFieldKey": "payment_calculator",
    "amountFieldResultKey": "payment_total",
    "currency": "USD",
    "requiredPaid": true
  }
}
```

Calculator lưu giá trị dạng:

```json
{
  "variables": {
    "quantity": 2
  },
  "results": {
    "subtotal": 100,
    "payment_total": 125.5
  }
}
```

Quy tắc phân giải giống nhau ở client và server:

1. Có `amountFieldResultKey`: chỉ nhận đúng key đó.
2. Không có result key: thử các key quy ước `grandTotal`, `total`, `amount`,
   `payment_total`, `value`.
3. Nếu không có key quy ước: chỉ nhận khi Calculator có đúng một kết quả numeric.
4. Nhiều kết quả numeric mơ hồ hoặc result key nhập sai: trả 0/false và không cho thanh toán.
5. Number/Hidden scalar vẫn được đọc bình thường.

Điểm an toàn quan trọng: client hiển thị amount để UX nhanh, nhưng amount kỳ vọng được server tính
lại từ form data khi submit. Không tin amount/status do browser tự gửi.

Nếu amount thay đổi sau một transaction `paid`, widget xoá transaction cũ và buộc thanh toán lại.

## 3. Cấu hình provider

Các property runtime đang dùng:

```text
provider = stripe | paypal | both
stripePublishableKey
stripeCreateIntentUrl = /api/megaform/payments/stripe/create-intent
paypalClientId
paypalCreateOrderUrl = /api/megaform/payments/paypal/create-order
paypalCaptureOrderUrl = /api/megaform/payments/paypal/capture-order
requiredPaid = true | false
```

Không đưa Stripe secret hoặc PayPal secret vào form schema/browser. Secret vẫn thuộc gateway store
phía server.

QA browser local cố ý không cung cấp key nên hiển thị thông báo thiếu PayPal Client ID/Stripe key.
Đó là fail-safe đúng, không phải lỗi UI.

## 4. Danh sách chính xác file source đã thay đổi

### 4.1 Runtime/UI — 3 file

```text
MegaForm.UI/src/widgets/plugins/megaform-widget-payment-unified.ts
Assets/css/plugins/megaform-widget-payment.css
Assets/css/plugins/megaform-widgets-builtin.css
```

Ghi chú:

- TypeScript là canonical source của Payment runtime.
- `megaform-widget-payment.css` là owner CSS duy nhất cho runtime `.mfw-payment-*`.
- Khối PaymentPro cũ/conflict và một dấu `}` thừa đã được bỏ khỏi
  `megaform-widgets-builtin.css`.
- Không sửa renderer submit flow vì cơ chế auto-submit sau required Payment `paid` đã tồn tại.

### 4.2 Core/security — 2 file

```text
MegaForm.Core/Payments/PaymentAmountResolver.cs
MegaForm.Core/Payments/PaymentSubmissionVerifier.cs
```

`PaymentAmountResolver` là server-side twin của amount bridge phía browser.
`PaymentSubmissionVerifier.ResolveExpectedPrice()` đã chuyển sang dùng resolver này.

### 4.3 Tests — 1 file

```text
MegaForm.Sdk.Tests/PaymentAmountResolverTests.cs
```

Có 6 test cho scalar, explicit Calculator result, conventional result, single numeric result,
ambiguous results và missing explicit result.

### 4.4 Template Web — 5 file

```text
MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/class-payment.json
MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/donation-payment-rules.json
MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/invoice-payment.json
MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/membership-payment.json
MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/reservation-deposit.json
```

### 4.5 Sample twins — 5 file

```text
Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/class-payment.json
Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/donation-payment-rules.json
Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/invoice-payment.json
Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/membership-payment.json
Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/reservation-deposit.json
```

Mười template trên được bổ sung:

```json
"amountFieldResultKey": "payment_total"
```

## 5. Generated/runtime assets

Build đã sinh:

```text
Assets/js/plugins/megaform-widget-payment-unified.js
```

Ba asset Payment sau đã được sync và kiểm tra SHA-256 giống nhau trên DNN, Web, Oqtane, Umbraco:

```text
js/plugins/megaform-widget-payment-unified.js
css/plugins/megaform-widget-payment.css
css/plugins/megaform-widgets-builtin.css
```

Runtime roots:

```text
DesktopModules/MegaForm/Assets
MegaForm.Web/wwwroot/megaform
MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm
MegaForm.Umbraco/wwwroot
```

`BuildTS.ps1` tự sync DNN/Web/Oqtane nhưng hiện **không tự sync Umbraco**. Trước khi pack Umbraco,
copy lại đúng ba file:

```powershell
Copy-Item Assets/js/plugins/megaform-widget-payment-unified.js `
  MegaForm.Umbraco/wwwroot/js/plugins/megaform-widget-payment-unified.js -Force
Copy-Item Assets/css/plugins/megaform-widget-payment.css `
  MegaForm.Umbraco/wwwroot/css/plugins/megaform-widget-payment.css -Force
Copy-Item Assets/css/plugins/megaform-widgets-builtin.css `
  MegaForm.Umbraco/wwwroot/css/plugins/megaform-widgets-builtin.css -Force
```

Không sửa trực tiếp generated JS trong runtime root.

## 6. QA Codex đã chạy

### 6.1 Build/typecheck

```text
BuildTS.ps1 -Module phone-pro -NoPause       PASS
plugin TypeScript --noEmit                  PASS
MegaForm.Core Debug multi-target build      PASS
```

`phone-pro` là entry hiện dùng cùng plugin tsconfig và sinh Payment plugin. Đây không phải nhầm tên.

### 6.2 Unit tests

```text
PaymentAmountResolverTests
Passed: 6
Failed: 0
```

### 6.3 Browser visual/behavior QA

Harness:

```text
tmp/payment-widget-compact-qa.html
tmp/payment-widget-compact-qa.mjs
```

Kết quả:

```json
{
  "ok": true,
  "desktopHeight": 172.5,
  "calculatedAmount": "$222.75",
  "fixedAmount": "$49.00",
  "paidCollapsed": true,
  "mobileWidth": 326
}
```

Screenshots:

```text
tmp/payment-widget-compact-desktop.png
tmp/payment-widget-compact-mobile.png
```

Đã kiểm tra:

- hai provider button, không còn title/description/card dư;
- chuyển Stripe ↔ PayPal;
- Calculator thay `payment_total` từ `125.50` sang `222.75` thì Payment cập nhật;
- fixed amount hiển thị `$49.00`;
- `paid` ẩn provider switch và checkout stage;
- viewport 390px không overflow.

Chưa chạy giao dịch Stripe/PayPal sandbox thật vì harness không có credential. Không được ghi nhận
“gateway E2E PASS” cho đến khi dùng sandbox key và kiểm tra provider dashboard/API.

## 7. Test và build Release trước khi package

Chạy từ repo root.

### 7.1 Focused test

```powershell
dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj `
  -c Release `
  --filter FullyQualifiedName~PaymentAmountResolverTests `
  --logger "console;verbosity=minimal"
```

Expected: 6/6 pass.

### 7.2 Plugin TypeScript

```powershell
Push-Location MegaForm.UI
node node_modules/typescript/bin/tsc `
  -p src/widgets/plugins/tsconfig.json `
  --noEmit
Pop-Location

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\BuildTS.ps1 -Module phone-pro -NoPause
```

### 7.3 Core và các host

```powershell
dotnet build MegaForm.Core/MegaForm.Core.csproj -c Release --no-restore
dotnet build MegaForm.DNN/MegaForm.DNN.csproj -c Release --no-restore
dotnet build MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj -c Release --no-restore
dotnet build MegaForm.Web/MegaForm.Web.csproj -c Release --no-restore
dotnet build MegaForm.Umbraco/MegaForm.Umbraco.csproj -c Release --no-restore
```

Nếu máy chưa restore đúng dependency, bỏ `--no-restore` thay vì sửa source.

## 8. Tạo package

### 8.1 DNN

Manifest hiện là `02.00.006`; script tự đọc version từ `MegaForm.DNN/MegaForm.dnn`.

Production:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\MegaForm.DNN\BuildPackage-DNN.ps1 `
  -BuildTS -BuildDotNet -Configuration Release -NoPause
```

Trial:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\MegaForm.DNN\BuildPackage-DNN.ps1 `
  -BuildTS -BuildDotNet -Configuration Release -Trial -NoPause
```

Expected:

```text
MegaForm.DNN/Install/MegaForm_02.00.006_Install.zip
MegaForm.DNN/Install/MegaForm_02.00.006_Trial_Install.zip
```

Production có `license.lic`; Trial phải không có file này.

### 8.2 Oqtane

Version single-source hiện là `2.0.5` trong `MegaForm.Oqtane.Client/ModuleInfo.cs`.

Chạy full build + pack từ root:

```powershell
cmd /c _run_pack.cmd
```

Nếu `pack.cmd` bị lỗi line-ending/GOTO trong `cmd.exe`, dùng bản CRLF đã có:

```powershell
cmd /c _packrun_crlf.cmd
```

Expected:

```text
MegaForm.Oqtane.Package/MegaForm.Oqtane.2.0.5.nupkg
```

Không chỉ chạy `MegaForm.Oqtane.Package/release.cmd` sau khi sửa Core: script đó là lean pack,
không build lại DLL. Full root pack phải chạy trước để tránh ship `MegaForm.Core.dll` cũ.

`tools/validate-pack.ps1` phải kết thúc bằng `[PACK-OK]`.

### 8.3 Umbraco

Sync ba asset ở §5, sau đó:

```powershell
dotnet pack MegaForm.Umbraco/MegaForm.Umbraco.csproj `
  -c Release `
  -o local-packages-umbraco
```

Version project hiện là `1.5.0`.

### 8.4 Standalone Web

Web không dùng install package riêng; tạo publish artifact:

```powershell
dotnet publish MegaForm.Web/MegaForm.Web.csproj `
  -c Release `
  -o MegaForm.Web/publish
```

## 9. Kiểm tra artifact sau package

Không chấp nhận package chỉ vì command exit 0.

### 9.1 DNN ZIP

Kiểm tra outer ZIP có:

```text
bin/MegaForm.DNN.dll
bin/MegaForm.Core.dll
Resources.zip
```

Giải nén `Resources.zip` và kiểm tra:

```text
Assets/js/plugins/megaform-widget-payment-unified.js
Assets/css/plugins/megaform-widget-payment.css
Assets/css/plugins/megaform-widgets-builtin.css
```

JS phải chứa:

```text
amountFieldResultKey
data-payment-status
```

`MegaForm.Core.dll` phải mới hơn:

```text
MegaForm.Core/Payments/PaymentAmountResolver.cs
MegaForm.Core/Payments/PaymentSubmissionVerifier.cs
```

### 9.2 Oqtane NUPKG

Chạy lại validator nếu cần:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\tools\validate-pack.ps1 `
  -Nupkg .\MegaForm.Oqtane.Package\MegaForm.Oqtane.2.0.5.nupkg `
  -RepoRoot .
```

Giải nén nupkg và xác nhận `wwwroot/Modules/MegaForm` chứa ba asset Payment mới, đồng thời
`lib/net9.0` và `lib/net10.0` đều chứa `MegaForm.Core.dll` mới.

### 9.3 Umbraco/Web

Xác nhận static assets/publish output có đủ:

```text
js/plugins/megaform-widget-payment-unified.js
css/plugins/megaform-widget-payment.css
css/plugins/megaform-widgets-builtin.css
```

## 10. Smoke QA sau khi cài package

Dùng Stripe/PayPal sandbox, không dùng production credential.

1. Tạo form với Calculator có hai result, gồm `payment_total`.
2. Payment:
   - `amountMode=field`;
   - `amountFieldKey=<calculator key>`;
   - `amountFieldResultKey=payment_total`;
   - `provider=both`;
   - `requiredPaid=true`.
3. Thay input Calculator và xác nhận amount đổi ngay.
4. Nhập result key sai: amount phải về 0/waiting, không tạo intent/order.
5. Thanh toán Stripe sandbox:
   - provider success;
   - form submit/record thành công;
   - record chứa provider, status, verified transaction và amount đúng.
6. Lặp lại với PayPal sandbox.
7. Thử sửa amount/status hidden payload bằng DevTools: server phải từ chối hoặc ghi lại giá trị đã
   xác minh, không tin payload giả.
8. Fixed-price form:
   - `amountMode=fixed`;
   - `amount=49`;
   - checkout và submission phải cùng `49.00`.
9. Sau `paid`, provider controls phải ẩn.
10. QA desktop và mobile; Payment không được tạo card/spacing lớn quanh form.

## 11. Acceptance checklist

- [ ] Chỉ đúng 16 source/test/template file ở §4 được stage cho task này.
- [ ] `git diff --check` sạch.
- [ ] Plugin TypeScript typecheck pass.
- [ ] Payment plugin build pass.
- [ ] 6/6 `PaymentAmountResolverTests` pass.
- [ ] Core + host Release builds không có error.
- [ ] Package chứa JS/CSS mới, không lấy runtime asset cũ.
- [ ] Package chứa `MegaForm.Core.dll` được build sau source mới.
- [ ] DNN Production/Trial giữ đúng semantics license.
- [ ] Oqtane validator báo `[PACK-OK]`.
- [ ] Nếu ghi “payment E2E PASS”, phải có bằng chứng Stripe và PayPal sandbox thật.

## 12. Gợi ý stage an toàn

```powershell
git add -- `
  Assets/css/plugins/megaform-widget-payment.css `
  Assets/css/plugins/megaform-widgets-builtin.css `
  MegaForm.UI/src/widgets/plugins/megaform-widget-payment-unified.ts `
  MegaForm.Core/Payments/PaymentAmountResolver.cs `
  MegaForm.Core/Payments/PaymentSubmissionVerifier.cs `
  MegaForm.Sdk.Tests/PaymentAmountResolverTests.cs `
  MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/class-payment.json `
  MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/donation-payment-rules.json `
  MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/invoice-payment.json `
  MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/membership-payment.json `
  MegaForm.Web/App_Data/MegaForm/Templates/payment-forms/reservation-deposit.json `
  Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/class-payment.json `
  Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/donation-payment-rules.json `
  Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/invoice-payment.json `
  Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/membership-payment.json `
  Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates/payment-forms/reservation-deposit.json
```

Handout này có thể commit riêng hoặc thêm có chủ ý sau khi review; không dùng `git add .`.
