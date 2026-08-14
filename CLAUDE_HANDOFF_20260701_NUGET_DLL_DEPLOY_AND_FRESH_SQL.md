# HANDOFF — NuGet DLL deploy blocker + Fresh Oqtane-on-SQL install (2026-07-01)

**Ngôn ngữ: trả lời tiếng Việt.** Phiên trước hết context; đây là điểm dừng để phiên sau làm tiếp.

---

## 0. TÓM TẮT 1 DÒNG

Tất cả fix C# (i18n Save, template-seeder, dashboard bloat-guard) **đã code xong + đã bump version 1.7.40**, đóng gói `MegaForm.Oqtane.1.7.40.nupkg` OK — **nhưng KHÔNG deploy được vào site :5080 đang chạy** vì exe self-contained **khóa file DLL**. Re-install trên site đang chạy chỉ update `wwwroot/**`, **không ghi đè được DLL**. **Giải pháp phiên sau: cài 1 site Oqtane MỚI trên SQL (như đã làm), rồi install MegaForm 1.7.40 FRESH** — fresh install deploy DLL đúng vì chưa có DLL cũ bị khóa.

---

## 1. ROOT CAUSE (đã chốt, có bằng chứng)

**Oqtane self-contained Kestrel exe (`Oqtane.Server.exe`) giữ khóa (file lock) các module DLL đã nạp. `InstallationManager.InstallPackages()` chạy lúc app đã nạp DLL → không ghi đè được DLL bị khóa → extraction DLL âm thầm fail, nhưng vẫn:**
- consume nupkg (xóa `.nupkg`, ghi `MegaForm.Oqtane.1.7.40.log` — manifest 107120 bytes, 14:48:41),
- update `wwwroot/Modules/MegaForm/**` (JS/CSS/templates/plugins deploy OK).

**Bằng chứng:**
- `cmp -s <site>/MegaForm.Oqtane.Client.Oqtane.dll <repo>/MegaForm.Oqtane.Client/bin/Release/net10.0/MegaForm.Oqtane.Client.Oqtane.dll` → **DIFFERENT (site vẫn DLL cũ)** sau khi install 1.7.40 trên cả :5000 và :5080.
- Site DLL timestamp `2026-07-01 07:41:04`, size `331264` = build CŨ (không đổi sau install).
- Đã thử: stop exe → drop nupkg → start (fresh start). Exe **không tự stop** (không có StopApplication/upgrade path lúc startup), chạy tiếp 40s, DLL vẫn cũ. → Ngay cả fresh-start-with-nupkg trên site ĐÃ CÓ MegaForm cũ cũng không swap được (DLL cũ vẫn ở root, bị nạp+khóa trước khi InstallPackages ghi đè).

**Version bump KHÔNG phải nút thắt** (đã bump `ModuleInfo.Version` 1.7.15→1.7.40 + append `ReleaseVersions`, xem `MegaForm.Oqtane.Client/ModuleInfo.cs`). Version bump vẫn CẦN (Oqtane nhận diện upgrade) nhưng **không đủ** — lock DLL mới là nút thắt thật.

**Ràng buộc user:** "chỉ được sử dụng nuget" → **KHÔNG được swap DLL thủ công** (workaround cũ trong memory `reference_live_host_5000`: stop-process + copy DLL + relaunch — user CẤM cách này).

**Kết luận:** re-install/upgrade qua NuGet trên self-contained exe đang chạy **không bao giờ** swap được DLL đã khóa. Chỉ **fresh install** (site chưa từng có MegaForm → DLL chưa tồn tại → không có lock) mới deploy DLL đúng. Đó là lý do :5000 và lần install :5080 ĐẦU TIÊN chạy được, còn mọi lần re-install sau đều "chết fix C#".

---

## 2. KẾ HOẠCH PHIÊN SAU (làm theo thứ tự)

### Bước A — Cài site Oqtane MỚI trên SQL (giống lúc trước)
Mục tiêu: site sạch, **chưa có MegaForm**, để fresh-install 1.7.40 deploy đủ DLL + user xem được DB.

1. **Nguồn cài:** `E:\DNN_SITES\OqtaneSites\Oqtane.Framework.10.1.0.Install (1).zip` (self-contained Kestrel).
2. **Giải nén** ra folder mới, ví dụ `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh2.MSSQL\` (dùng port chưa bận — :5081; các port đang bận: :5000, :5070, :5080).
   - PowerShell: `Expand-Archive -Path "<zip>" -DestinationPath "<folder>" -Force`.
3. **Cấu hình `<folder>\appsettings.json`** — pattern MSSQL (copy từ site :5080 cũ `Oqtane.MegaFormTest.MSSQL\appsettings.json`):
   - `ConnectionStrings:DefaultConnection` = `Data Source=.\SQLEXPRESS;Initial Catalog=Oqtane_MegaFormFresh2;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True`
   - `ConnectionStrings:DashboardDatabase` = trỏ CÙNG DB (nếu template có key này).
   - `Installation:DefaultAlias` / `Kestrel` endpoint → **port 5081** (sửa `applicationUrl`/`Urls` hoặc `launchSettings`; trong self-contained sửa `appsettings.json > Kestrel:Endpoints` hoặc chạy với `--urls http://localhost:5081`).
   - `Installation:HostPassword` = đặt sẵn (vd `abc@ABC1024`), `HostEmail`, `SiteName`, `DefaultTheme` — để auto-install không cần wizard. (Xem `Oqtane.MegaFormTest.MSSQL\appsettings.json` làm mẫu — đã có sẵn cấu hình hoạt động.)
4. **Chạy detached:** `Start-Process -FilePath "<folder>\Oqtane.Server.exe" -WorkingDirectory "<folder>" -WindowStyle Hidden` (BẮT BUỘC `-WorkingDirectory`).
5. **Chờ auto-install DB** (poll `curl http://localhost:5081/` tới 200; lần đầu tạo ~37 bảng framework + host user, mất ~30–60s).
6. **Verify:** login host / `<pwd>`; DB `Oqtane_MegaFormFresh2` xuất hiện trên `.\SQLEXPRESS`.

> ⚠️ Nếu sandbox chặn `Expand-Archive` file lớn → dùng `Copy-Item` clone nguyên folder `Oqtane.MegaFormTest.MSSQL` sang folder mới rồi **XÓA MegaForm** khỏi nó (xóa `MegaForm.*.dll` ở root + `wwwroot/Modules/MegaForm` + gỡ bản ghi module trong DB) — nhưng cách sạch nhất vẫn là giải nén zip gốc.

### Bước B — Fresh-install MegaForm 1.7.40 (CHỈ NuGet)
1. Copy `MegaForm.Oqtane.Package\MegaForm.Oqtane.1.7.40.nupkg` → `<folder>\Packages\`.
2. **Restart exe** (stop process của site MỚI → start lại). Vì site chưa có DLL MegaForm nào → không lock → InstallPackages extract đủ DLL + wwwroot + chạy `MegaFormManager` (seed migration history idempotent).
3. **Verify DLL deploy THẬT** (quan trọng — đừng tin timestamp):
   ```bash
   cmp -s "<folder>/MegaForm.Oqtane.Client.Oqtane.dll" \
     "MegaForm.Oqtane.Client/bin/Release/net10.0/MegaForm.Oqtane.Client.Oqtane.dll" \
     && echo "✅ DLL NEW" || echo "❌ still old"
   ```
   Phải ra ✅. Nếu ❌ → fresh install cũng fail → điều tra sâu Oqtane InstallPackages timing (xem §5).

### Bước C — Visual QA (BẮT BUỘC screenshot, không đoán qua code)
User feedback CỨNG: **"phải Visual QA các thay đổi, không đoán mò qua code"**.
1. **Dashboard** `http://localhost:5081/?mfpanel=dashboard` — phải KHÔNG crash (0 pageerrors), hiện form (không "No forms yet"). Test harness cũ: `qa5000/test-5080-dash.mjs` (sửa port 5080→5081). Kỳ vọng: `noFormsYet:false` hoặc có card, `pageerrors: []`, và **có** `Form/List` call.
2. **i18n Save** (`?mfpanel=builder` Language Manager) — dịch → Save → reload → chữ giữ nguyên (fix shadow-order đã có trong DLL).
3. **Template Gallery** wizard — có ≥5 template (seeder App_Data từ wwwroot).
4. **Builder / Content Slider** — slider có editor (fix regression 1.7.37+).

---

## 3. CÁC FIX C# ĐANG NẰM TRONG DLL 1.7.40 (cần fresh-install để tới site)

| Fix | File | Nội dung |
|---|---|---|
| **Dashboard bloat-guard (Q2)** | `MegaForm.Oqtane.Client/Index.razor` | `BuildPreloadSchemaJson()` + `_ssrFieldsHtml`: nếu JSON > 700KB → return `"{}"` / bỏ SSR → tránh Blazor `insertMarkup` crash "Unexpected end of input" khi form có QR logoUrl 1.5MB (form 2, schema 3MB). **Đây là fix làm dashboard hết crash.** |
| **Template seeder (Q1)** | `MegaForm.Oqtane.Server/Services/BuilderTemplateCatalogService.cs` | `SeedTemplatesIfEmpty(appDataDir, env)` — copy từ `wwwroot/Modules/MegaForm/Templates/` → `App_Data/MegaForm/Templates` nếu rỗng. Gallery đọc từ App_Data (file dir), NuGet chỉ deploy wwwroot → phải seed. |
| **i18n Save shadow** | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` `GetI18nLocale` | Đọc theo thứ tự `{ "js/builder/i18n", "js/bundles/i18n" }` (builder override trước). i18n/save ghi vào `js/builder/i18n/<loc>.json`. |
| **Version gate** | `MegaForm.Oqtane.Client/ModuleInfo.cs` | `Version="1.7.40"` + `ReleaseVersions` append `,1.7.40`. |

**Fix wwwroot-only đã tới site (không cần DLL):** icon-palette (`MegaForm.UI/src/builder/icon-palette.ts` + `properties.ts`), border `.ey-card` guard (nhưng CSS service C# cũng có phần — check parity), wizard gallery/import JSON (`MegaForm.UI/src/dashboard/wizard/*`), content-slider editor (plugin rebuild). Border fix `.ey-card` có ở CẢ C# `CustomShellCompatibilityCssService.cs` (NOINNER) → cần DLL cho SSR parity, nhưng client CSS đã có.

---

## 4. TÀI SẢN / LỆNH THAM CHIẾU

- **Repo build DLL (nguồn so sánh):** `MegaForm.Oqtane.Client/bin/Release/net10.0/MegaForm.Oqtane.Client.Oqtane.dll`. Rebuild: `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Release` (+ Server, Shared, Core).
- **Package build (pack.cmd BỊ CHẶN trong sandbox — chạy tay):**
  - nuget.exe: `C:\Users\Administrator\.nuget\nuget.exe`
  - `& "C:\Users\Administrator\.nuget\nuget.exe" pack "MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec" -OutputDirectory "MegaForm.Oqtane.Package" -NoDefaultExcludes`
  - nuspec: `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` (version 1.7.40; ship `wwwroot/Modules/MegaForm/**` + net9.0/net10.0 DLLs). ⚠️ ĐỪNG để ký tự `&` trần trong `<releaseNotes>` (lỗi XML "parsing EntityName").
- **nupkg đã build sẵn:** `MegaForm.Oqtane.Package\MegaForm.Oqtane.1.7.40.nupkg` (dùng ngay cho Bước B).
- **Site :5080 hiện tại (BẨN — DLL cũ):** `E:\DNN_SITES\OqtaneSites\Oqtane.MegaFormTest.MSSQL\`, DB `Oqtane_MegaFormTest` @ `.\SQLEXPRESS`, host / abc@ABC1024. Có 3 form (1 Event Reg, 2 Formulaire Contact = 3MB QR bloat, 3 Form Úc). **Có thể bỏ site này**, dùng site mới ở Bước A.
- **QA harness:** `qa5000/test-5080-dash.mjs` (Playwright). Verify DLL: `cmp -s` (nội dung, KHÔNG timestamp). DLL string literal: `strings -el` (UTF-16), không `grep -a`.
- exe self-contained: `Get-Process Oqtane.Server | ? { $_.Path -like '*<sitefolder>*' } | Stop-Process -Force` để stop đúng site.

---

## 5. NẾU FRESH-INSTALL CŨNG KHÔNG SWAP DLL (dự phòng)

Fresh install phải chạy (không có lock). Nếu vẫn ❌:
- Kiểm tra `Packages\MegaForm.Oqtane.1.7.40.log` có được ghi không (Oqtane có xử lý gói?).
- Kiểm tra DB bảng `Package`/`ModuleDefinition` xem version Oqtane ghi nhận.
- Khả năng: Oqtane `InstallPackages` chạy SAU khi scan/nạp assembly module ngay trên fresh start → cần cơ chế restart 2 lần (start → Oqtane extract → StopApplication → supervisor restart → nạp DLL mới). Self-contained exe qua `Start-Process` KHÔNG có supervisor restart sau StopApplication → có thể phải start thủ công lần 2 sau khi exe tự thoát. (Lần này exe KHÔNG tự thoát → cần đào Oqtane 10.1 `Program.cs` order thật.)
- Cân nhắc hỏi user cho phép cài qua **Admin UI → Module Management → Install** (vẫn là NuGet, đúng ràng buộc) — luồng admin install của Oqtane có cơ chế restart riêng, có thể swap DLL đúng hơn `Start-Process`.

---

## 6. YÊU CẦU USER CÒN MỞ (ngoài deploy)

- (Optional) Cap QR `widgetProps.logoUrl` size để chặn bloat 3MB tương lai (data fix + validate lúc save). Chưa làm.
- Sau khi :5081 chạy: user tự xem DB (họ muốn thấy kết quả database).

---
*Viết bởi phiên `ac66bb40`. Xem thêm memory: `reference_oqtane_module_version_deploy_gate`, `reference_fresh_site_5080_mssql`, `project_20260701_freshinstall_templates_and_dashboard_bloat`, `project_20260701_i18n_save_shadow_fix`.*
