# AUDIT — MegaForm Oqtane Licensing vs. chuẩn Oqtane.Licensing

> Ngày audit: 2026-07-26 — **READ-ONLY audit, không thay đổi code.**
> Phạm vi: cơ chế activate license của MegaForm trên Oqtane host (Phase 10, `[OqtaneLicensing v20260723]`) so với chuẩn tích hợp chính thức của Oqtane.
> Nguồn tham chiếu chuẩn:
> - Repo mẫu chính thức: [oqtane/Oqtane.LicensedModule](https://github.com/oqtane/Oqtane.LicensedModule) (README + `Client/Index.razor` + `Client/ModuleInfo.cs`).
> - Package `Oqtane.Licensing` (10.0.0 cho net10 / 5.1.0 cho net9) — source **không public** (không có trong repo `oqtane/oqtane.framework`, search `LicenseServer` = 0 kết quả), nên phần đối chiếu API server-side dựa trên package nhị phân đã ship + README mẫu.
>
> File MegaForm đã kiểm tra:
> - `MegaForm.Oqtane.Server/Services/OqtaneLicenseBridge.cs`
> - `MegaForm.Core/Services/LicenseService.cs`
> - `MegaForm.Oqtane.Client/Settings.razor`, `ModuleInfo.cs`, `_Imports.razor`, `MegaForm.Oqtane.Client.csproj`
> - `MegaForm.Oqtane.Server/Services/Startup.cs` (đăng ký bridge, dòng 368), `MegaForm.Oqtane.Server.csproj`
> - `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` + `MegaForm.Oqtane.601.nuspec`

## 1. Chuẩn Oqtane yêu cầu gì (theo repo mẫu)

Một commercial module tích hợp Oqtane.Licensing "đúng chuẩn mẫu" gồm:

| # | Yêu cầu chuẩn | Nguồn |
|---|---|---|
| S1 | Client `.csproj` tham chiếu NuGet `Oqtane.Licensing` | README / LicensedModule.Client.csproj |
| S2 | `Index.razor` bọc nội dung module trong `<LicenseView PackageName="...">` (hỗ trợ fragment `Licensed` / `NotLicensed` / `Validating`) | LicensedModule Index.razor |
| S3 | `PackageName` khớp 3 nơi: `ModuleInfo.PackageName`, tham số `LicenseView`, và tên product đăng ký trên Oqtane Marketplace | README |
| S4 | `ModuleInfo.Dependencies` chứa `Oqtane.Licensing.Client.Oqtane,Oqtane.Licensing.Shared.Oqtane` (bắt buộc cho Blazor WebAssembly) | LicensedModule ModuleInfo.cs |
| S5 | Package project ship 3 DLL `Oqtane.Licensing.{Client,Server,Shared}.Oqtane.dll` trong gói cài | README (debug.cmd + nuspec mẫu) |
| S6 | License key lưu ở file `{PackageName}.lic` trong thư mục `/bin` của installation; xóa file thì production tự regenerate lần truy cập sau | README "License Keys" |
| S7 | Test bằng Sandbox Marketplace: trỏ `PackageRegistryUrl` (appsettings.json / System Info) sang `https://sandbox.oqtane.net`; key sandbox sống 7 ngày | README |
| S8 | Trên localhost/127.0.0.1, LicenseView luôn báo Licensed (dev convenience); dùng `?licensing=testmode` để mô phỏng flow chưa license (Fetch/Activate/Validate) | README "Development" |

Lưu ý quan trọng về phạm vi "chuẩn": README nêu rõ *"Developers can utilize their own licensing solution within their extensions, or they can take advantage of the integrated licensing solution"* — tức Oqtane **cho phép** cơ chế riêng; mẫu LicenseView-quanh-Index chỉ là cách tích hợp reference, không phải điều kiện bắt buộc của Marketplace. Mẫu chuẩn cũng **hoàn toàn client-side** (LicenseView che/hiện UI); nó không cung cấp server-side enforcement — điểm này MegaForm làm **vượt** chuẩn mẫu.

## 2. Kết quả đối chiếu

| # | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| S1 | Package ref `Oqtane.Licensing` | ✅ PASS | Client csproj: `10.0.0` (net10) / `5.1.0` (net9, lib net8.0 — comment đã ghi rõ). Server csproj mirror cùng version (dòng 62/68). Version khớp major với Oqtane.Client 10.1.0 / 6.0.1. |
| S2 | LicenseView bọc nội dung module | ⚠️ DEVIATION (chủ đích) | MegaForm đặt `LicenseView` trong `Settings.razor` (tab Module Settings), **không** bọc `Index.razor`. Lý do đã ghi trong code: model trial-with-caps (10 forms / 25 subs / AI locked), cố ý không block public form. Xem Finding F1. |
| S3 | PackageName khớp | ✅ PASS (code) / ⏳ Marketplace | `ModuleInfo.PackageName = "MegaForm.Oqtane"` = `OqtaneLicenseBridge.PackageName` = `LicenseView PackageName="@ModuleState.ModuleDefinition.PackageName"`. Khớp product trên Marketplace **chưa verify** (E2E sandbox chưa chạy — xem F4). |
| S4 | Dependencies cho WASM | ✅ PASS | `ModuleInfo.cs:18` có đủ `Oqtane.Licensing.Client.Oqtane,Oqtane.Licensing.Shared.Oqtane` (kèm deps riêng của module). |
| S5 | Ship 3 DLL licensing | ✅ PASS | Cả 2 nuspec ship đủ 3 DLL cho net9.0 (và net10.0 ở nuspec chính). `validate-pack.ps1` đã PASS ở 1.7.113 theo AGENTS.md. DLL có mặt trong `bin/Release/net9.0` + `net10.0`. |
| S6 | File key `{PackageName}.lic` trong /bin | ✅ PASS | Bridge đọc đúng convention `MegaForm.Oqtane.lic` qua `LicenseServer.GetLicense` — đây là cơ chế của Oqtane.Licensing.Server, không phải code tự chế. Tương thích với nút Activate/Fetch của LicenseView (cùng ghi 1 file key). |
| S7 | PackageRegistryUrl từ host config | ✅ PASS | Bridge lấy `IConfigManager.GetSetting<string>("PackageRegistryUrl", "https://www.oqtane.net")` + `GetInstallationId()` — đúng mô tả README (default production registry; sandbox chỉ cần đổi setting, không sửa code). |
| S8 | localhost/testmode | ⚠️ PARTIAL | Bridge **không** bypass localhost (khác client LicenseView vốn luôn báo Licensed) — đã document trong code. Nhưng UI không có link gợi ý `?licensing=testmode` như mẫu. Xem F2. |

**Ngoài chuẩn mẫu (làm tốt hơn mẫu):**
- Enforcement server-side thật: trial caps do `LicenseService` (Core) áp trên mọi request — mẫu Oqtane chỉ che UI client-side, vốn bypass được bằng cách gỡ component. Hướng fail-soft của bridge (exception → "not licensed") là chiều an toàn đúng.
- Model 2 kênh OR (`license.lic` file + Marketplace key) giữ kênh direct-sales cho 4 host — hợp lý, không xung đột chuẩn.

## 3. Findings

### F1 — DEVIATION (chủ đích, chấp nhận được): LicenseView không bọc module content
- **Hiện trạng:** `LicenseView` chỉ nằm trong tab Settings; `Index.razor` render bình thường kể cả khi unlicensed.
- **Đánh giá:** Oqtane cho phép licensing solution riêng (README), và enforcement thật nằm ở server caps → không vi phạm chuẩn. Đây là lựa chọn thiết kế đã ghi rõ trong comment code và AGENTS.md.
- **Rủi ro còn lại:** reviewer Marketplace quen với mẫu `LicenseView`-quanh-`Index` có thể hỏi; nên chuẩn bị giải thích "caps-based trial, server-enforced" trong mô tả product.

### F2 — MEDIUM: UX mâu thuẫn trên localhost (Licensed banner vs. trial caps)
- **Hiện trạng:** trên localhost, `LicenseView` hiển thị banner xanh **"Licensed — all trial limits are lifted"** (hành vi by-design của Oqtane), nhưng bridge probe không bypass localhost → server vẫn áp caps (không tạo quá 10 forms, AI vẫn khóa). Text trong banner `Licensed` của MegaForm hứa "all trial limits are lifted" — **sai** trên dev machine.
- **Tái hiện:** chạy host localhost không activate key → mở Module Settings → banner xanh, nhưng tạo form thứ 11 vẫn bị chặn.
- **Khuyến nghị:** (a) chỉnh text fragment `Licensed` nêu rõ "server-side trial limits are governed by the server license state", hoặc (b) hiển thị thêm trạng thái server thật (đọc từ `LicenseService` qua một endpoint admin) cạnh LicenseView; (c) thêm link `?licensing=testmode` cho Host user như mẫu Oqtane (`Index.razor` mẫu có sẵn đoạn này).

### F3 — LOW: cache kép làm caps "đứng" tới ~90s sau khi Activate
- **Hiện trạng:** `LicenseService` cache 30s (`LicenseCacheTtlSeconds`) bọc ngoài bridge cache 60s (`CacheTtlSeconds`). Sau khi Host user Activate key qua LicenseView (file `.lic` được ghi ngay), probe cũ vẫn trả `false` tới hết TTL → user vừa activate xong vẫn thấy trial caps trong tối đa ~90s, không có feedback.
- **Khuyến nghị:** expose `LicenseService` cache-bust (đã có sẵn cơ chế bust khi `RegisterExternalLicenseProbe`) qua một admin endpoint và gọi sau activate; hoặc giảm TTL bridge xuống ≤ TTL Core.

### F4 — LOW (đã biết): chưa verify runtime E2E
- Theo AGENTS.md mục 2.10: chưa chạy flow sandbox Marketplace (đăng ký product `MegaForm.Oqtane`, trỏ `PackageRegistryUrl=https://sandbox.oqtane.net`, purchase → Activate → probe flips production, caps lifted). Audit này chỉ xác nhận **code-level compliance**; S3 (khớp product name trên Marketplace) chỉ có thể đóng sau E2E.

### F5 — OBSERVATION: giới hạn của audit
- Source `Oqtane.Licensing` không public → không diff được từng dòng cách Oqtane framework tự dùng `LicenseServer`. Tuy nhiên: (1) code build 0 error trên cả net9/net10 nghĩa là chữ ký API (`License`, `InstallationId`, `PackageRegistryUrl`, `LicenseServer.GetLicense`) đúng package đã ship; (2) cách dùng khớp README mô tả (key 10 segment, expiry trong segment 8-9, checksum KeyByteSet theo registry URL). Độ tin cậy: cao ở mức API contract, không khẳng định được mức internal behavior.

## 4. Kết luận

**Cơ chế activate license của MegaForm trên Oqtane hiện tại ĐÚNG chuẩn tích hợp Oqtane.Licensing ở code level**: package refs, WASM dependencies, packaging, naming convention, InstallationId/PackageRegistryUrl, và dùng đúng component/server API chính thức. Hai điểm khác mẫu — (1) LicenseView đặt ở Settings thay vì bọc Index, (2) server probe không bypass localhost — đều **chủ đích, đã document**, và hợp lệ theo policy của Oqtane (cho phép licensing solution riêng; enforcement server-side còn mạnh hơn mẫu).

Việc duy nhất nên làm trước khi coi là "xong chuẩn": fix text banner F2 (nguy cơ gây hiểu nhầm thật trên dev/staging), cân nhắc F3, và chạy E2E sandbox F4 để đóng S3.
