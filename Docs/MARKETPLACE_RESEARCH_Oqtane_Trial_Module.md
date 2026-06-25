# Nghiên cứu: Đăng sản phẩm Trial Module Oqtane lên Oqtane Marketplace

> **Ngày:** 2026-06-25  
> **Mục tiêu:** Tổng hợp quy trình đăng module thương mại / trial của MegaForm lên Oqtane Marketplace, dựa trên tài liệu Oqtane, GitHub Discussions và kinh nghiệm packaging hiện tại của dự án.

---

## 1. Tổng quan Oqtane Marketplace

Oqtane Marketplace là trung tâm phân phối module, theme và translation cho nền tảng Oqtane. NgườI dùng có thể cài đặt trực tiếp từ giao diện quản trị (Admin Dashboard → Module Management → Install) mà không cần upload thủ công.

- **Trang chính:** https://www.oqtane.net/
- **Trang đăng ký sản phẩm (Product Registry):** https://www.oqtane.net/registry
- **Tài liệu:** https://docs.oqtane.org/guides/marketplace/index.html
- **GitHub Discussions:** https://github.com/oqtane/oqtane.framework/discussions

Theo tài liệu, các extension được phát triển như sản phẩm đóng hộp (off-the-shelf) bởi ISV **bắt buộc phải đăng ký trên Oqtane Marketplace** ([Oqtane.LicensedModule README](https://github.com/oqtane/Oqtane.LicensedModule)).

---

## 2. Điều kiện tiên quyết để đăng module

### 2.1. Tài khoản & thông tin chủ sở hữu

Trang Product Registry yêu cầu điền form **Owner Information** trước khi tạo sản phẩm. Các trường bắt buộc (đã xác minh qua DOM của `www.oqtane.net/registry`):

| Trường | Mô tả |
|--------|-------|
| **Name** | Tên công ty, tổ chức hoặc cá nhân sở hữu sản phẩm |
| **Address** | Địa chỉ vật lý hoặc địa chỉ liên hệ |
| **Url** | URL đến trang giới thiệu sản phẩm / công ty |
| **Email** | Email dùng để tạo tài khoản và liên hệ |
| **Installation Id** | Installation ID của môi trường Oqtane dev (lấy từ `appsettings.json` hoặc Admin Dashboard → System Info) |

### 2.2. Thanh toán (nếu là commercial)

- Marketplace sử dụng **Stripe** để xử lý thanh toán.
- Chủ sản phẩm thương mại cần có **Stripe Connect account đã được xác minh** sau khi tạo organization account.

---

## 3. Hai môi trường Marketplace

Oqtane cung cấp 2 marketplace riêng biệt để hỗ trợ test và production ([Oqtane.LicensedModule](https://github.com/oqtane/Oqtane.LicensedModule)):

| Môi trường | URL | Mục đích |
|------------|-----|----------|
| **Sandbox** | `https://sandbox.oqtane.net` | Test đăng ký sản phẩm, mô phỏng giao dịch và licensing. License key trong sandbox chỉ có hiệu lực **7 ngày**. |
| **Production** | `https://www.oqtane.net` | Marketplace thực tế, giao dịch và license key thật. |

Để chuyển Oqtane instance sang dùng Sandbox, sửa `PackageRegistryUrl` trong `appsettings.json`:

```json
{
  "PackageRegistryUrl": "https://sandbox.oqtane.net"
}
```

Hoặc qua UI: **Admin Dashboard → System Info → Options tab**.

> **Lưu ý:** Nhớ reset về `https://www.oqtane.net` sau khi test xong.

---

## 4. Cấu trúc package `.nupkg` cho Oqtane module

### 4.1. Package format hiện tại (runtime deployment)

Oqtane module được đóng gói dưới dạng NuGet package `.nupkg`. Cấu trúc tối thiểu:

```
MyModule.nupkg
├── lib/
│   └── net9.0/
│       ├── MyModule.Client.Oqtane.dll
│       ├── MyModule.Server.Oqtane.dll
│       ├── MyModule.Shared.Oqtane.dll
│       └── [các dependency bổ sung nếu cần]
├── wwwroot/
│   └── Modules/
│       └── MyModule/
│           ├── js/
│           ├── css/
│           └── ...
├── icon.png
└── [ContentType/.nuspec metadata]
```

Kinh nghiệm từ MegaForm hiện tại:

- Tên assembly **phải chứa "Oqtane"** để được framework auto-load (`IsOqtaneAssembly()`).
- Các DLL không chứa "Oqtane" (ví dụ `MegaForm.Core.dll`, `MegaForm.Sdk.dll`, `Newtonsoft.Json.dll`) vẫn phải pack vào `lib/`, nhưng runtime sẽ resolve thông qua dependency resolution.
- Assets trong `wwwroot/Modules/MegaForm/` được deploy vào `{webroot}/Modules/MegaForm/`.

### 4.2. Package Types (thay thế dependencies metadata)

Theo GitHub Discussion [#5511 — New .NET Application Template](https://github.com/oqtane/oqtane.framework/discussions/5511), cách chỉ định phiên bản Oqtane tối thiểu nên dùng **Package Types** thay vì `dependencies`:

```xml
<packageTypes>
  <packageType name="Dependency" />
  <packageType name="Oqtane.Framework" version="6.0.0" />
</packageTypes>
```

MegaForm hiện đã áp dụng đúng cách này trong cả 2 nuspec (`MegaForm.Oqtane.nuspec` và `MegaForm.Oqtane.601.nuspec`).

### 4.3. Xu hướng mới: staticwebassets + FixProps

Discussion #5511 chỉ ra rằng Oqtane đang chuyển sang đóng gói theo chuẩn .NET để hỗ trợ cả **build-time consumption** (qua `PackageReference` trong AppHost) lẫn **runtime deployment**. Các thay đổi cần thiết:

- Static assets phải nằm trong thư mục `staticwebassets` của package.
- Nuspec phải include các file `.props` từ `obj/Release/net*/staticwebassets` vào thư mục `build/`.
- Resource paths trong Razor/ModuleInfo cần dùng `_content/NugetPackageName/`.
- `debug.cmd` cần copy assets vào `_content/NugetPackageName/`.
- `release.cmd` nên chạy **FixProps** utility trước khi pack: https://github.com/oqtane/Oqtane.FixProps

> **Đánh giá cho MegaForm:** Hiện tại MegaForm vẫn dùng cách cũ (`wwwroot/Modules/MegaForm/`). Cách này vẫn hoạt động trên Oqtane 6.x/10.x cho runtime deployment, nhưng nếu muốn module có thể được reference như một NuGet package bình thường trong Oqtane Application Template, cần refactor theo hướng dẫn mới.

### 4.4. Vấn đề multi-target `net9.0;net10.0`

MegaForm.Oqtane.Server/Client/Shared đang multi-target cả `net9.0` (Oqtane 6.x) và `net10.0` (Oqtane 10.x). Tuy nhiên:

- Nuspec hiện tại chỉ pack `net9.0`.
- Để hỗ trợ cả hai, cần include cả 2 target folders:

```xml
<files>
  <file src="..\MegaForm.Oqtane.Client\bin\Release\net9.0\MegaForm.Oqtane.Client.Oqtane.dll" target="lib\net9.0" />
  <file src="..\MegaForm.Oqtane.Client\bin\Release\net10.0\MegaForm.Oqtane.Client.Oqtane.dll" target="lib\net10.0" />
  <!-- tương tự cho Server, Shared, Core, Sdk, Newtonsoft -->
</files>
```

Hoặc xuất bản 2 package riêng biệt (`MegaForm.Oqtane` cho net9/Oqtane 6.x và `MegaForm.Oqtane` version mới hơn cho net10/Oqtane 10.x).

---

## 5. Commercial / Trial Module & Licensing

### 5.1. Lựa chọn licensing

Có 2 hướng cho module thương mại / trial:

1. **Tự xây dựng giải pháp license riêng:** Module tự kiểm tra trial period, giới hạn tính năng, v.v.
2. **Dùng Oqtane Licensing tích hợp:** Framework cung cấp component `LicenseView` và dịch vụ license key từ Marketplace.

### 5.2. Oqtane Licensing tích hợp

Ví dụ mẫu: [Oqtane.LicensedModule](https://github.com/oqtane/Oqtane.LicensedModule).

**Các bước tích hợp:**

1. Thêm NuGet package `Oqtane.Licensing`:

```xml
<PackageReference Include="Oqtane.Licensing" Version="5.1.0" />
```

2. Wrap module UI bằng `LicenseView`:

```razor
@using Oqtane.Licensing
<LicenseView PackageName="@ModuleState.ModuleDefinition.PackageName">
    <Licensed>
        <!-- Nội dung module -->
    </Licensed>
    <NotLicensed>
        <p>Module requires a license.</p>
    </NotLicensed>
</LicenseView>
```

3. Trong `ModuleInfo.cs`, thêm dependency để WebAssembly load đúng assembly:

```csharp
Dependencies = "Oqtane.Licensing.Client.Oqtane,Oqtane.Licensing.Shared.Oqtane"
```

4. Pack các assembly licensing vào nuspec:

```xml
<file src="..\Client\bin\Release\net9.0\Oqtane.Licensing.Client.Oqtane.dll" target="lib\net9.0" />
<file src="..\Client\bin\Release\net9.0\Oqtane.Licensing.Shared.Oqtane.dll" target="lib\net9.0" />
<file src="..\Client\bin\Release\net9.0\Oqtane.Licensing.Server.Oqtane.dll" target="lib\net9.0" />
```

### 5.3. Trial Period

Theo tài liệu schema `Package` của Oqtane, có trường **`TrialPeriod`** (số ngày dùng thử) dành cho commercial products:

```csharp
var package = new Package
{
    PackageId = "MegaForm.Oqtane",
    Name = "MegaForm - Dynamic Form Builder",
    Price = 199.00m,
    TrialPeriod = 30,
    // ...
};
```

Tuy nhiên, việc **thực thi trial period** (giới hạn thời gian, giới hạn tính năng) phụ thuộc vào logic của module hoặc `LicenseView`. Oqtane Marketplace chỉ lưu metadata trial; module phải tự kiểm tra.

### 5.4. License Key & Installation ID

- Mỗi Oqtane instance có một **Installation Id** duy nhất (trong `appsettings.json` hoặc System Info).
- Khi khách hàng mua module trên Marketplace, license/purchase được gắn với Installation ID.
- License key có dạng: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` (10 nhóm, 4 ký tự).
- File license được lưu tại `/bin/PackageName.lic`.
- Trên localhost, licensing component luôn trả về licensed để không ảnh hưởng dev.
- Để test licensing, thêm query string: `?licensing=testmode`.

> **Lưu ý quan trọng (Discussion #5790):** Hiện tại việc mua hàng trên Marketplace được gắn với **Installation ID**, không phải license key độc lập. Nếu installation bị rebuild (ID thay đổi), license có thể bị mất. Đây là điểm cần cân nhắc khi thiết kế trial/commercial flow.

---

## 6. Quy trình đăng sản phẩm MegaForm dạng Trial

Dựa trên các nguồn trên, đề xuất quy trình như sau:

### Bước 1: Chuẩn bị package

1. Build Release cho cả `net9.0` và `net10.0`.
2. Cập nhật `MegaForm.Oqtane.nuspec`:
   - Version mới.
   - Bao gồm cả `net9.0` và `net10.0` assemblies.
   - `packageTypes` đã đúng.
   - Thêm `Oqtane.Licensing` DLLs nếu dùng licensing tích hợp.
   - Đảm bảo `wwwroot/Modules/MegaForm/` chứa bundle mới nhất.
3. Chạy `release.cmd` để tạo `.nupkg`.

### Bước 2: Đăng ký trên Sandbox Marketplace

1. Truy cập https://sandbox.oqtane.net và đăng nhập bằng GitHub account.
2. Điền **Owner Information** form.
3. Liên kết **Stripe Connect** (nếu commercial).
4. Tạo sản phẩm mới:
   - **Package Name** phải khớp với `PackageName` trong `ModuleInfo.cs` (`MegaForm.Oqtane`).
   - Chọn loại: **Module**.
   - Đặt giá (hoặc 0 nếu free trial không giới hạn).
   - Đặt **Trial Period** (ví dụ 14 hoặc 30 ngày).
   - Upload `.nupkg`.
5. Test cài đặt từ Oqtane instance local (đã cấu hình `PackageRegistryUrl` = sandbox).
6. Test license flow (nếu commercial) với `?licensing=testmode`.

### Bước 3: Chuyển sang Production

1. Reset `PackageRegistryUrl` về `https://www.oqtane.net`.
2. Đăng nhập https://www.oqtane.net/registry.
3. Tạo lại sản phẩm với cùng **Package Name**.
4. Upload `.nupkg` production.
5. Hoàn tất Stripe Connect để nhận thanh toán.

---

## 7. Khuyến nghị cho MegaForm

1. **Ưu tiên sửa các active issues trước khi publish:**
   - Bundle cũ (`v20260513-01`) cần được thay bằng bundle mới nhất.
   - AI auth interceptor cần bao gồm `/api/Ai*`.
   - Per-site `DashboardDatabase` override cần được runtime tôn trọng.
   - `Phase2/PinnedPages`, `Phase2/PinToNewPage` nếu là tính năng public cần implement hoặc ẩn khỏi UI trial.

2. **Quyết định licensing:**
   - Nếu MegaForm là **free trial không giới hạn**: có thể đăng ký như open-source/free product, không cần `Oqtane.Licensing`.
   - Nếu MegaForm có **premium features** hoặc **giới hạn thời gian**: nên dùng `Oqtane.Licensing` và thiết kế `LicenseView` wrapper cho các tính năng cao cấp.

3. **Nuspec cần cập nhật:**
   - Thêm target `net10.0` vì project đã multi-target.
   - Đảm bảo `MegaForm.Sdk.dll`, `MegaForm.Core.dll`, `Newtonsoft.Json.dll` được include.
   - Nếu dùng Oqtane Licensing, include thêm `Oqtane.Licensing.*.dll`.

4. **Cân nhắc packaging chuẩn .NET:**
   - Theo Discussion #5511, Oqtane đang hướng tới chuẩn hóa NuGet package để hỗ trợ build-time reference.
   - Đây là cơ hội để MegaForm sớm áp dụng `staticwebassets` + `FixProps`, giúp module dễ dàng được dùng trong Oqtane Application Template.

5. **Tài liệu hướng dẫn cài đặt:**
   - Cần có README/video hướng dẫn cài từ Marketplace, cấu hình `DashboardDatabase`, và kích hoạt AI Form Assistant.

---

## 8. Tài liệu & nguồn tham khảo

- Oqtane Marketplace Product Registry: https://www.oqtane.net/registry
- Oqtane Marketplace Docs: https://docs.oqtane.org/guides/marketplace/index.html
- Submitting Contributions: https://docs.oqtane.org/guides/marketplace/submitting-contributions.html
- Monetization Options: https://docs.oqtane.org/guides/marketplace/monetization.html
- Module Deployment: https://docs.oqtane.org/dev/modules/module-deployment.html
- Release Build Guide: https://docs.oqtane.org/dev/extensions/build/release.html
- Oqtane.LicensedModule (sample): https://github.com/oqtane/Oqtane.LicensedModule
- Oqtane.MarketplaceWebhook (sample): https://github.com/oqtane/Oqtane.MarketplaceWebhook
- Oqtane.FixProps: https://github.com/oqtane/Oqtane.FixProps
- GitHub Discussion #5511 — New .NET Application Template: https://github.com/oqtane/oqtane.framework/discussions/5511
- GitHub Discussion #5790 — Decouple License Keys from Installation Ids: https://github.com/oqtane/oqtane.framework/discussions/5790
- GitHub Discussion #5646 — Studio-Elf Discussion Module release: https://github.com/oqtane/oqtane.framework/discussions/5646

---

## 9. Kết luận

Oqtane Marketplace hỗ trợ đăng ký module dưới dạng free, freemium, hoặc commercial với trial period. Quy trình chính bao gồm:

1. Chuẩn bị `.nupkg` đúng chuẩn Oqtane.
2. Đăng ký owner và sản phẩm trên `www.oqtane.net/registry`.
3. (Nếu commercial) Tích hợp `Oqtane.Licensing` và liên kết Stripe Connect.
4. Test trên Sandbox trước khi publish production.

Với MegaForm, cần hoàn thiện nuspec (multi-target net9/net10), đảm bảo bundle mới, và quyết định rõ mô hình license (free trial vĩnh viễn hay commercial có giới hạn) trước khi đăng ký sản phẩm lên Marketplace.
