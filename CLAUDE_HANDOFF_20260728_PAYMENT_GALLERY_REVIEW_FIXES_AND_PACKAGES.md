# BÀN GIAO — 2026-07-28: review + vá 2 nhánh (Gallery private repo & Payment của Codex) + đóng gói 4 host

> Nối tiếp `CLAUDE_HANDOFF_20260728_GALLERY_PRIVATE_REPO.md` (commit `272d738`) và
> `CLAUDE_HANDOFF_20260728_PAYMENT_WIDGET_COMPACT_CALCULATED_AMOUNT_BUILD_PACKAGE.md` (Codex, chưa commit).
>
> Trạng thái: **đã vá + build + test + đóng gói xong**, **CHƯA commit** (chờ owner duyệt phạm vi stage).

## 1. Kết quả một dòng

| Hạng mục | Kết quả |
|---|---|
| Unit test | **246/246 PASS** (241 cũ + 5 test mới) |
| Build Release | Core (net472/8/9/10) + DNN + Oqtane.Server + Web + Umbraco — **0 error** |
| Gói DNN | `MegaForm_02.00.007_Install.zip` + `..._Trial_Install.zip` (14.9 MB) |
| Gói Oqtane | `MegaForm.Oqtane.2.0.6.nupkg` — **[PACK-OK]** |
| Gói Umbraco | `local-packages-umbraco/MegaForm.Umbraco.1.5.0.nupkg` |
| Web | `MegaForm.Web/publish/` |

## 2. 🔴 Lỗ hổng TIỀN đã vá (quan trọng nhất phiên này)

**Chỗ hổng:** `PaymentSubmissionVerifier.ResolveExpectedPrice()` — khi `amountMode=field` mà server
KHÔNG re-derive được giá từ dữ liệu submit (payload Calculator bị sửa, sai result key, field không
gửi lên…), code cũ **tụt xuống chế độ `bounds`** thay vì từ chối. Đa số widget **không cấu hình
`minAmount`/`maxAmount`** ⇒ nhánh đó **không kiểm tra giá gì cả**: kẻ tấn công tạo intent 0.50 USD
rồi bóp méo payload Calculator là thanh toán xong đơn 500 USD, submission vẫn được ghi "paid".

Đây là fail-open có SẴN từ trước, nhưng contract mới của Codex (`amountFieldResultKey`, 10 template
dùng `amountMode=field`) biến nó thành đường đi chính ⇒ phải đóng.

**Vá** (`MegaForm.Core/Payments/PaymentSubmissionVerifier.cs`):
- `ExpectedPrice.Mode` thêm trạng thái `unresolved`; `amountMode=field` không resolve được ⇒ `unresolved`.
- `CheckExpectedPrice()` gặp `unresolved` ⇒ **reject + log** (fail CLOSED), không rơi về bounds.
- An toàn cho khách thật: **widget từ chối tạo intent/order khi chính nó không resolve được amount**
  (rule 4 trong §2 handout Codex ⇒ trả 0/false), nên người trả tiền hợp lệ không rơi vào nhánh này.

**Vá kèm** (`MegaForm.Core/Payments/PaymentAmountResolver.cs`) — giữ parity client/server:
- Nhận **mảng / list nhiều giá trị** và **cộng** như `coerceAmount()` phía widget. Trước đó field
  multi-value bị `Convert.ToString(List<object>)` ⇒ chuỗi `"System.Collections.Generic.List`1[...]"`
  ⇒ regex nhặt được chữ số **`1`** và coi đó là số tiền hợp lệ.
- Mảng không có phần tử numeric ⇒ trả false (không bao giờ coi 0 là giá).

## 3. Vá phần Gallery private repo (`272d738`)

`MegaForm.Core/Services/GalleryRepo/GalleryRepositoryService.cs` — cả 2 lỗi đều gây **mất sạch
template im lặng** (`[FilesAreTruth]` reconcile xoá mọi entry manifest không thấy trong listing):

1. **Base URL trỏ vào thư mục con** (`…/megaform-gallery/main/gallery/`): cả jsDelivr data-API lẫn
   Git Trees API đều liệt kê đường dẫn **từ gốc repo**, còn `manifest.File` là **tương đối base URL**
   ⇒ không khớp một dòng nào ⇒ gallery rỗng. Nay `BuildListingUrl()` yêu cầu **đúng 3 segment**
   (owner/repo/ref hoặc gh/owner/repo@ref), sai shape ⇒ trả null ⇒ fail-open "tin manifest".
2. **Trees API `truncated: true`** (repo lớn): listing thiếu file ⇒ xoá nhầm template. Nay thấy
   `truncated` ⇒ trả null (fail-open).

Test mới trong `GalleryRepoTokenScopeTests` ghim cả 3 ca subdir/short-path.

⚠️ Còn 1 điểm KHÔNG vá (ghi lại để biết): trên **DNN/net472**, `HttpClient` tự động follow redirect
và .NET Framework **giữ header `Authorization` khi redirect sang host khác**. Đích duy nhất được đính
token là `raw.githubusercontent.com` / `api.github.com`; nếu GitHub redirect sang
`objects.githubusercontent.com` thì PAT đi theo — vẫn là hạ tầng GitHub nên rủi ro thấp, và không có
API per-request tắt redirect trên net472. Ghi nhận, không đổi kiến trúc trong phiên đóng gói.

## 4. Vá CSS (chống regression Payment compact)

Codex xoá khối `.mfw-payment-*` trùng lặp khỏi `megaform-widgets-builtin.css` — đúng. Nhưng **còn sót**
`.mfw-payment-status { padding: 0 16px; }` của thế hệ `.mfw-payment` đời đầu (dòng 133). Class này
**trùng tên** với pill trạng thái của runtime mới (`padding: 3px 9px`), cùng specificity ⇒ file nào nạp
sau thì thắng. Loader hiện nạp builtin **trước** payment.css nên chưa vỡ, nhưng khi SSR chèn link
manifest trước rồi loader thêm builtin sau thì pill bị giãn.

⇒ Đã **scope lại**: `.mfw-payment .mfw-payment-status { padding: 0 16px; }` — markup đời đầu giữ
nguyên, runtime compact (`.mfw-payment-wrap`) không bị đụng.

Đã đối chiếu **22 class `mfw-payment-*` trong TS** với `megaform-widget-payment.css`: đủ hết
(2 class `-method-stripe` / `-method-paypal` chỉ là hook, không cần rule). Brace cân bằng 46/46 và 334/334.

## 5. Vá script đóng gói Oqtane (đang chặn mọi bản phát hành)

`MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` vẫn liệt kê 3 DLL Azure (net9 + net10):

```
Error NU5019: File not found: '..\MegaForm.Oqtane.Server\bin\Release\net9.0\Azure.Core.dll'
```

Azure Blob đã bị **gỡ khỏi `MegaForm.Integrations.CloudStorage` từ 2026-07-26** (Azure.Core 1.55 kéo
`System.ClientModel` ⇒ sập site DNN net472) nhưng nuspec chưa dọn ⇒ `nuget pack` **luôn fail**. Đã xoá
6 dòng `Azure.*` + ghi chú lý do. Sau đó pack chạy sạch: **[PACK-OK]**, và nupkg **không còn Azure.\***.

## 6. Bump version (owner đã chốt "bump cả 2")

Lý do: Oqtane **chỉ swap DLL khi `ModuleInfo.Version` tăng**; pack lại đúng 2.0.5 thì site đang chạy
2.0.5 giữ DLL cũ ⇒ fix bảo mật không tới nơi. Đồng thời đây cũng là **bản mới để khách nhập gallery
token TRƯỚC khi repo chuyển private**.

| File | Từ | Thành |
|---|---|---|
| `MegaForm.Oqtane.Client/ModuleInfo.cs` (`Version` + `ReleaseVersions`) | 2.0.5 | **2.0.6** |
| `MegaForm.Oqtane.Shared/AssetVersion.cs` | 20260725-B412 | **20260728-B416** |
| `MegaForm.DNN/MegaForm.dnn` | 02.00.006 | **02.00.007** |
| `MegaForm.DNN/Views/FormView.ascx.cs` (`const V`) | 20260728-B415 | **20260728-B416** |

⚠️ **Bẫy đã gặp lại**: bump `AssetVersion.cs` xong pack báo `[PACK-INVALID] STALE` vì `dotnet build`
incremental **không** rebuild `MegaForm.Oqtane.Server` (validator so mtime DLL net10 với .cs mới nhất).
Phải chạy `dotnet build … --no-incremental` cho **Shared + Server** rồi mới pack lại.

⚠️ **Rác cần dọn**: `MegaForm.DNN/Install/MegaForm_02.00.006*.zip` hiện là bản build lúc 15:34 phiên
này (ĐÃ ghi đè gói .006 QA hôm qua) — nội dung khác bản đã verify trên megademo.ai. **Đừng gửi khách
file .006 nữa**, chỉ dùng .007.

## 7. Bằng chứng verify gói (không chấp nhận "exit 0")

**DNN 02.00.007** (cả Production và Trial):
- `bin/MegaForm.DNN.dll`, `bin/MegaForm.Core.dll` (mtime 15:25 > mọi .cs Payment sửa lúc 15:22–15:23), `Resources.zip` ✔
- manifest `version="02.00.007"` ✔ · `license.lic`: **PROD có / TRIAL không** ✔
- Trong Resources.zip: `Assets\js\plugins\megaform-widget-payment-unified.js` chứa `amountFieldResultKey`
  **và** `data-payment-status`; `megaform-widget-payment.css`; `megaform-widgets-builtin.css` chứa rule đã scope ✔

**Oqtane 2.0.6** (799 entry): `lib/net9.0` + `lib/net10.0` đều có `MegaForm.Core.dll` build sau source ✔ ·
3 asset payment trong `wwwroot/Modules/MegaForm` ✔ · JS có `amountFieldResultKey` ✔ · **0 file Azure.\*** ✔

**Umbraco 1.5.0**: 3 asset trong `staticwebassets/` ✔ · **Web publish**: 3 asset + `MegaForm.Core.dll` mới ✔

**Asset parity**: 3 file payment **hash SHA-256 giống nhau trên cả 4 runtime root** (DNN / Web / Oqtane /
Umbraco) — Umbraco phải copy tay vì `BuildTS.ps1` không sync nó.

## 7b. Đã commit + đã cài lên megademo.ai (bổ sung cuối phiên)

| Commit | Nội dung |
|---|---|
| `a836ea6` | payment: fail-CLOSED khi không re-derive được giá field-mode (+ resolver cộng multi-value) |
| `3d3bd9e` | gallery: subdir base URL / Trees API `truncated` không còn xoá sạch template |
| `aeacf38` | release: DNN 02.00.007 + Oqtane 2.0.6, gỡ `Azure.*` khỏi nuspec (đang chặn pack) |
| `aa21e5a` | calculator: đưa widget về TS trong git + chạy ngầm mặc định + 3 kiểu hiển thị |

⚠️ `MegaForm.dnn` và `FormView.ascx.cs` **chỉ commit đúng dòng version** (2 file này còn mang thay
đổi của task khác trong worktree: gỡ Azure ở manifest, đổi `AiFeatureGate.IsEnabled→IsAvailable`).

**Đã cài `MegaForm_02.00.007_Install.zip` lên `http://megademo.ai`** qua API PersonaBar
(`POST /API/PersonaBar/Extensions/InstallPackage`, script `install-megaform-dnn.mjs` ở scratchpad).
DB: `Packages.Version=2.0.7`, `DesktopModules.Version=02.00.07.00`. Backup trước khi cài ở
`E:\DNN_SITES\_backup_MegaDemo_20260728_163945` (bin + DesktopModules + `.bak` 44 MB).
⭐ Trái với ghi chú cũ, đường cài này **CÓ** ghi đè `bin/*.dll` (log "Assembly updated").

### QA đã chạy trên site thật (form 41 `QA 007 — Payment price gate`)

| Ca | Kết quả |
|---|---|
| Calculator `payment_total=99` + payment giả `status:paid` | 400 *"Payment provider is not configured"* → giá resolve OK, chặn ở gateway |
| Calculator thiếu `payment_total` | 400 *"does not match this form's price"* → **cổng mới chặn trước khi gọi Stripe** |
| `payment_total: null` | 400 — chặn |
| Không thanh toán | 400 *"Payment is required…"* |
| Fixed price 99 (form 42) / Number source (form 43) | 400 *"provider is not configured"* → control, resolve OK |
| Calculator `hidden` (mặc định) | 0px, không nhãn, vẫn nạp `$99.00` → `$148.50` vào Payment |
| `input` / `inline` / `callout` | 65px / 23px / 90px, cùng giá trị live |

⚠️ Vẫn CHƯA chạy giao dịch sandbox thật (megademo không có Stripe/PayPal credential).
🧹 Form QA để lại trên megademo: **41, 42, 43, 44, 45** — xoá khi không cần.

## 7c. Backlog owner giao cho phiên sau

1. **DocFX**: viết tài liệu cho **Payment widget** và **Calculator widget** (bao gồm `amountMode`,
   `amountFieldKey`, `amountFieldResultKey`, 4 `displayMode`, và luật fail-closed phía server).
2. Làm giàu `https://cisssolution.github.io/DNN_MegaformDocs/articles/dnn-widgets.html` —
   **tách thành các sub-page** nằm dưới trang đó (mỗi widget một trang).
3. **Quay GIF minh hoạ** cho từng widget (harness GIF pure-JS đã có, xem memory `reference_demo_gif_recording`).

## 8. Việc CÒN LẠI

1. 🔴 **E2E sandbox Stripe + PayPal chưa chạy** (không có credential trong máy). Chưa được ghi
   "payment E2E PASS" cho tới khi có bằng chứng dashboard/API của provider. Kịch bản: §10 handout Codex,
   **thêm ca mới**: sửa payload Calculator bằng DevTools cho lệch result key ⇒ **server phải từ chối**
   (trước bản này là được chấp nhận).
2. 🔴 **Chưa commit.** Phạm vi nên stage = 16 file của Codex (§12 handout đó) **+** các file phiên này:
   ```
   MegaForm.Core/Payments/PaymentAmountResolver.cs
   MegaForm.Core/Payments/PaymentSubmissionVerifier.cs
   MegaForm.Core/Services/GalleryRepo/GalleryRepositoryService.cs
   MegaForm.Sdk.Tests/PaymentAmountResolverTests.cs
   MegaForm.Sdk.Tests/GalleryRepoTokenScopeTests.cs
   Assets/css/plugins/megaform-widgets-builtin.css
   MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec
   MegaForm.Oqtane.Client/ModuleInfo.cs
   MegaForm.Oqtane.Shared/AssetVersion.cs
   MegaForm.DNN/MegaForm.dnn
   MegaForm.DNN/Views/FormView.ascx.cs
   ```
   ⚠️ Worktree còn rất nhiều thay đổi task khác ⇒ **tuyệt đối không `git add .` / `-A`**.
3. 🟡 **48 file `.cs` chưa từng `git add`** (từ 07-28 permission matrix) vẫn treo ⇒ clean checkout vẫn
   chưa build được ở tầng host. Chưa xử lý phiên này.
4. 🟡 Gallery: phần việc GitHub (bot account + fine-grained PAT + chuyển private) vẫn cần owner —
   **thứ tự an toàn** ở §3 handout gallery: phát hành .007 / 2.0.6 → khách nhập token → mới private.
5. ✅ **`token.txt` ĐÃ được gitignore** (`.gitignore:141`, đã commit) — mục "chưa gitignore" trong các
   bàn giao trước là thông tin cũ. `token.txt`/`cookies.txt`/`login_headers.txt` đều untracked.

## 9. Lệnh chạy lại nhanh

```powershell
dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj -c Release --logger "console;verbosity=minimal"
powershell -NoProfile -ExecutionPolicy Bypass -File .\MegaForm.DNN\BuildPackage-DNN.ps1 -BuildTS -BuildDotNet -Configuration Release -NoPause
powershell -NoProfile -ExecutionPolicy Bypass -File .\MegaForm.DNN\BuildPackage-DNN.ps1 -BuildTS -BuildDotNet -Configuration Release -Trial -NoPause
# Oqtane: pack.cmd là LF -> cmd.exe không chạy được; dùng bản CRLF (nội dung y hệt)
dotnet build MegaForm.Oqtane.Shared/MegaForm.Oqtane.Shared.csproj -c Release --no-incremental
dotnet build MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj -c Release --no-incremental
cmd /c ".\_packrun_crlf.cmd"
```
