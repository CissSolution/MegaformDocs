# HANDOFF — 2026-07-27 (phiên 2): 2nd SQL connection LIVE · AI-from-table · Christmas template

Nối tiếp `CLAUDE_HANDOFF_20260727_DNN_DOCFX_ERP_AI_DEMOS.md`. Site QA: **http://megademo.ai**
(host/dnnhost). DB ngoài: `LegacyErp_Demo` trên `WINDOWS-11\SQLEXPRESS`.

## ✅ B — 2nd SQL connection: NÚT THẮT ĐÃ MỞ
**Nguyên nhân**: set PortalSetting bằng SQL thô KHÔNG bao giờ đọc ra — DNN cache portal settings.
**Cách đúng**: gọi chính endpoint `POST /DesktopModules/MegaForm/API/ModuleConfig/ConnectionsSave`
(nó dùng `PortalController.UpdatePortalSetting` → flush cache). Kèm header `RequestVerificationToken`
lấy từ `input[name=__RequestVerificationToken]` của trang có module MegaForm.
- `CustomerErp` → `LegacyErp_Demo` đã lưu, verified: `ConnectionsList` ✔ · `AiTools/SqlConnections` ✔
  · `AiTools/SqlTables?connectionKey=CustomerErp` = 16 bảng ✔ · `DatabaseSettings/Test` (field đúng là
  **`provider`**, không phải `databaseType`) → `Connected to LegacyErp_Demo` ✔.
- 🔴 **Bug site clone**: HostSetting `MegaForm_Database_ConnectionString` còn trỏ `DNN10_3_3_Test20`
  (theo từ Test20 khi clone) ⇒ "Current database (this site)" báo *could not list tables*. Đã sửa bằng
  `POST ModuleConfig/DatabaseSettings` → `DNN_MegaDemo`. ⚠️ `SetPortalSetting()` trong
  `ModuleConfigController` thực ra ghi **HostSetting** (`MegaForm_` + key) — tên hàm gây hiểu nhầm.
- ⚠️ **SECURITY (rule 10)**: `Subform/Tables` trả nguyên `ex.Message` ra client
  (`Cannot open database "X" … Login failed for user 'IIS AppPool\Y'`) — rò tên DB + tài khoản. CHƯA vá.
- `IIS AppPool\DNN_MegaDemo` trên `LegacyErp_Demo`: đã cấp **db_datareader + db_datawriter**
  (thiếu datawriter ⇒ submit "thành công" nhưng KHÔNG có row — insert fail-soft im lặng).

## ✅ C — Demo CustomERP cascade (ERP thật)
- Seed thêm dữ liệu ERP (idempotent SQL): Country 16 (3 Region), Stores 28, Vendors 23, +4 Currency;
  xoá row rác `mg/MegaForm/ass`. Script: scratchpad `seed-erp-cascade.sql`.
- **Form 23 "ERP Purchase Request"**: Region → Country → Store/Vendor, tất cả `optionsConnectionKey=CustomerErp`,
  token `:region` / `:country`. Verified qua `Submit/FieldOptions` (Europe→6 nước, DE→2 store/2 vendor).
- **Trang demo tab 46** (`/Default.aspx?tabid=46`, skin form-2col, HTML trái + form phải).
- GIF `dnn-erp-cascade.gif` (760px, 3.6 MB) + 3 PNG.

## ✅ E — AI dựng form từ bảng SQL + submission thấy data cũ
Luồng: Builder → **AI Designer** → tab **Database** → chọn connection `CustomerErp` → tick
`dbo.SupportTickets` → tab Chat → prompt → AI sinh 8 field, FK → Select đọc `Priorities`/`Categories`,
`settings.databaseInsert` = INSERT vào SupportTickets, **đúng connectionKey `CustomerErp`**.
- **Form 24**, tab QA: `Submissions?formId=24&source=sql` → `total=500000`, `sqlTable=dbo.SupportTickets` ✔.
- E2E ghi thật: submit form → row `TicketId 500002` trong `SupportTickets` ✔ (sau khi cấp db_datawriter).
- ⚠️ AI báo *"SQL references table(s) not found"* — validator soi DB site, KHÔNG phải connection đã chọn ⇒
  cảnh báo giả. Đáng vá sau.
- GIF `dnn-ai-form-from-sql-table.gif` (7.8 MB) + `dnn-submissions-sql-source.gif` (2.4 MB).

## ✅ DocFX — ĐÃ PUSH `0bf79a8` (CissSolution/DNN_MegaformDocs@main)
2 trang mới + TOC + 3 GIF + 2 PNG:
`articles/dnn-database-connections.md` · `articles/dnn-ai-sql-table-form.md`.

## ✅ TASK MỚI — Christmas template từ mock `4NewTemplateForms`
**Nguồn**: `E:\...\4NewTemplateForms\megaform-template-christmas-americana.json` (+ ảnh
`public/christmas-americana-header.png`, mock Next.js chạy `next dev -p 3007`).
**Gốc tham chiếu**: cặp mock↔shipped của Car Show (`megaform-template-classic-americana.json` ↔
`Samples/FormTemplates/Premium/DONEE/classic-registration.json`) — diff 2 file này ra ĐÚNG công thức convert.
**Kết quả**: `Samples/FormTemplates/Premium/DONEE/christmas-signup.json` (23 field, html 6.3 KB, css 57.5 KB).
Converter tái dùng được: **`tools/templates/convert-mock-christmas.mjs`**.

### Công thức convert (mock → template ship được)
1. **Fields**: `Input`→`Text` · Section thêm `properties`+`Properties`
   `{pageBreak:false,premiumNativeStep:true,generatedPremiumStep:true,premiumStepIndex:N}` ·
   Checkbox: câu cam kết ở `label` → `options:[{label,value:'yes'}]` · `hint` → **`helpText`**
   (renderer chỉ vẽ helpText — bản classic đã ship vẫn còn sót lỗi này).
2. **customHtml**: root thêm `data-mf-flexgrid="locked"` · stepper `data-mf-native-step="N"` ·
   page `data-mf-native-page="N"` · thay token `{{field:step_x.heading|intro|stepSubtitle}}` bằng chữ thật ·
   **nút Back/Next phải có `data-mf-native-back` / `data-mf-native-next`** và mock KHÔNG có nút submit →
   phải chèn `data-mf-native-submit`. ⭐⭐⭐ **Thiếu 3 attr này = bấm Next không sang bước nào** (mất nhiều thời gian).
3. **customCss**: token 2 kênh `var(--mf-page-X, var(--mf-preset-X, authored))` (parser cân ngoặc vì fallback
   có `rgba(...)`) · ảnh hero phải qua `var(--mf-hero-image, url('/Modules/MegaForm/img/…'))` — mock hardcode URL
   nên override `.DnnModule` vô hiệu ⇒ hero trắng trơn · kèm khối QA của classic (PAGING/HERO/HOSTSHELL/CARD/
   POLISH/WIDGETS/MS) đổi màu sang bảng Christmas + block `MF-QA-XMAS-HERO-v1` viết lại hero/plaid/step ✓.
4. **settings**: đưa customHtml/customCss vào `settings`, `multiPage:true`, `themeCompatibility`,
   `templateGuideSlug`, `manifestVersion:2`.
5. **Ảnh**: `christmas-americana-header.png` copy vào `Assets/img/`, `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/img/`
   và site DNN `DesktopModules/MegaForm/Assets/img/`.

### Visual QA trên DNN (form 25, trang **tab 47** `/Default.aspx?tabid=47`)
Đo bằng computed style, mock (`localhost:3007`) vs DNN — **khớp**: card 720px/radius 14 · hero 260px
`50% 38%` · h1 Georgia 50/52 w800 #fefce8 · h2 Georgia 26/39 w800 #166534 · label 13/19.5 w700 xanh ·
input 48px radius 10 bg #fffdf9 border #e8d5c4 · nút Next #b91c1c · grid 2 cột 16px · 4 bước chạy đủ,
badge done ✓ xanh.
⚠️ **Khác còn lại (chấp nhận, giống bản classic đã ship)**: MultiSelect ra dropdown MegaForm (mock vẽ chips) ·
Rating sao rỗng (mock sao đặc) · Date dùng lịch MegaForm (mock input native).
⭐ **Bẫy QA**: mount renderer trần (`#mount`) thì module CSS `#mf-form-wrapper-N …` (ID) **thắng** mọi rule class
`!important` của template ⇒ card 960px/Inter — **phải QA trên trang DNN thật** mới đúng.
⭐ Ẩn chrome đừng match `[class*="personabar"]`: DNN gắn class `personabar-visible` **lên `<body>`** ⇒ ẩn cả trang.

## ✅ GALLERY — Christmas đã publish (43 → 44)
`node tools/gallery/build-gallery.mjs --out <clone megaform-gallery> --base https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/`
→ commit **`01f8388`** trên `CissSolution/megaform-gallery@main` (44/44 verified sha256; kèm
`christmas-americana-signup-assets.zip` 1.6 MB chứa hero).
⭐⭐ **Bẫy [FilesAreTruth] lặp lại**: purge file CDN xong nhưng **data API `@main` vẫn liệt kê file cũ**
(52 file) ⇒ reconcile loại template mới. Ref **theo commit** thì data API sinh ngay (`@01f8388` → 57 file, có
Christmas). Đã trỏ HostSetting `MegaForm_GalleryRepoUrl` của megademo sang `@01f8388` + recycle pool ⇒
`BuilderTemplates/RemoteGalleryList` = 44, builder thấy thẻ Christmas + thumbnail đúng.

## ✅ D — Online template + AI remix (DocFX `a46548a`)
Luồng quay được: Dashboard → **New Form** → Template Gallery → **Online gallery** → search → click thẻ
(⭐ **1 click = install luôn**, `RemoteGalleryInstall`) → Continue ×4 → **Create Form**.
Rồi Builder → AI Designer → prompt "biến thành IT equipment request, GIỮ design & steps" ⇒ AI đổi field
**và đổi luôn tên step** ("Equipment Details", "Equipment Justification") mà shell tab-strip/màu giữ nguyên.
2 GIF: `dnn-online-gallery-install.gif` (7.8 MB) · `dnn-ai-remix-template.gif` (7.3 MB) + ảnh live.
⭐ **Bẫy quay**: `Submit/Schema` **chỉ phục vụ form Published** → publish trước khi mount renderer;
detector "AI xong" đừng đếm field (AI sửa tại chỗ) → dò text canvas, cửa sổ chờ ≥90s (AI 18–48s).
Trang mới: `articles/dnn-online-template-ai-remix.md` + entry TOC.

## ✅ Landing page docs (`3ad7642`)
- Chụp lại ảnh Outback từ trang DNN thật (bản cũ có **vệt trắng** chỗ mask sóng — bản live KHÔNG lỗi).
- Bỏ ảnh contact-map (không hợp khổ trang).
- Thêm hẳn mục "Dozens more designs — free from the online gallery" + ảnh gallery online.
- GIF cascade quay lại **Americas → Canada** (bỏ tên Việt Nam theo yêu cầu owner).

## ✅ Landing page chụp lại trong ngữ cảnh DNN thật (`67a866b`)
Owner: "ảnh form chụp rời, không rõ là module DNN thật hay fake". Đã dựng **8 trang SHOWCASE 2 cột**
(`make-showcase-pages.sql`, tab **49-56**, skin `form-2col`, HTML trái + MegaForm phải, `IsVisible=0`
nên không lên menu) và chụp full trang 1700px **giữ nguyên header/menu/footer DNN**.
Form cài sẵn cho showcase: 26 Outback · 30 EuroYouth Floral · 31 Wellness · 32 Tabbed · 33 Project
Intake · 34 Discovery · 35 Event RSVP · 25 Christmas.
⭐ Script chụp `x-shot-showcase.mjs` ẩn **chỉ** persona bar + link Logout/SuperUser + các mục menu
`DEMO2COL/DEMOERP/QA …` (ẩn trong ảnh, KHÔNG đụng site).

## 🔴 BACKLOG PHIÊN SAU (owner giao, chưa làm)
1. **Bug preview Online Gallery KHÔNG hiện field** (thẻ Christmas / Classic Car Show chỉ thấy hero +
   stepper + nút). ⭐**Nguyên nhân đã xác định**: preview tĩnh dựng HTML từ `customHtml`, nhưng CSS
   `MF-QA-PAGING` ẩn mọi `.mfp-page` trừ `.is-active` — preview không chạy step engine ⇒ **không page nào
   có `.is-active`** ⇒ mất sạch field. **Sửa 1 chỗ ăn cả gallery**: trong
   `MegaForm.UI/src/dashboard/wizard/gallery-preview.ts` → `buildResolvedCustomTemplateHtml()` (sau
   `sanitizeCustomPreviewHtml`) thêm class `is-active` cho `.mfp-page` đầu tiên + `.mfp-stepper-item` đầu
   (và tab panel đầu cho template dạng tabstrip). ⚠️Twin: `MegaForm.UI/src/builder/gallery.ts:1072` có hàm
   cùng tên — sửa cả hai. Build `npm run build:dashboard` (+entry builder) rồi copy JS vào site.
2. **Preview ≠ thật với template Cherry Blossom** (3 thẻ ảnh Garden Walk/Tea Ceremony/Lantern to hơn ở
   preview). Nghi: preview render ở `PREVIEW_LOGICAL_WIDTH.desktop = 1240` rồi scale (gallery-preview.ts
   ~line 300) trong khi module thật rộng ~700-900 ⇒ khác breakpoint/tỉ lệ. Hướng: hoặc render preview đúng
   bề rộng module, hoặc sửa CSS template dùng `aspect-ratio`/`minmax()` để không phụ thuộc breakpoint.
3. **DocFX: Permissions & Access + Field visibility by role** — thử quyền thật (Submit/View/Edit/Delete/
   Export/Approve/Manage cho All Users/Anonymous/Authenticated/roles), thử ẩn field theo role,
   **visual QA sửa nếu sai**, viết trang DocFX + push. Owner yêu cầu: chụp hướng dẫn dùng nút **Expand**
   (ma trận rộng), quay animation minh hoạ **kèm kết quả đầu ra** (anon thấy gì / role thấy gì).
4b. **Sửa site PROD `https://dnndefender.com/MegaForm`** (host/**Minh@2002**) — owner giao phiên sau:
   - **Ẩn khỏi menu** toàn bộ trang demo MegaForm (nhóm `MEGAFORM ▾`, `MEGAFORM CONTINUE ▾`, EUROYOUTH
     BROCHURE/FLORAL/TEAL …) → set `Tabs.IsVisible=0` (giữ URL vẫn vào được).
   - **Chụp từng form demo** rồi đưa ảnh + link lên chính trang `/MegaForm` bằng **HTML module**
     (lưới thumbnail: ảnh → link tới trang form). Dùng lại `x-shot-showcase.mjs` (đổi HOST) — nhớ ẩn
     persona bar + link Login/Register khi chụp.
   - Nội dung nhấn mạnh: **Online Gallery** (tải thêm design miễn phí cho bản đã mua), **tạo form bằng AI**
     theo nhu cầu, và **wizard**; kèm link sang site tài liệu GitHub
     `https://cisssolution.github.io/DNN_MegaformDocs/`.

4. **DocFX: Submissions → Google Sheet + Reports** — seed **~300 dòng** submission (⚠️insert **chậm** để
   không bị đánh dấu spam), chụp Submissions dashboard (Total/Last 7/30, Submission Volume, bảng Forms),
   minh hoạ dùng **filter** để lọc số liệu; nút "Connect Google Sheet" + "Reports" trên toolbar.

## ⏳ CÒN LẠI
- Christmas chưa thêm vào **bundled templates** trong package (mới chỉ ở gallery online).
- Chưa commit gì trong repo chính (worktree bẩn, Codex chạy song song) — file mới:
  `Samples/FormTemplates/Premium/DONEE/christmas-signup.json`, `tools/templates/convert-mock-christmas.mjs`,
  3 bản copy ảnh hero, `tools/gallery/gallery-exclude.json` + nuspec bị build-gallery cập nhật.
- Site demo đang ghim gallery theo commit `@01f8388`; khi data API `@main` bắt kịp có thể trả về `@main`.

## Tài nguyên tái dùng
`<SCRATCH_393fd39d>/gifrec/`: `mega-lib.mjs` (login + gọi API DNN kèm antiforgery), `x-install-template.mjs`,
`x-qa-xmas-page.mjs` / `x-qa-xmas-step34.mjs` (QA đo pixel), `x-rec-*.mjs` (quay GIF), `x-conn-save.mjs`,
`x-testinsert.mjs`. Scratchpad phiên này: `seed-erp-cascade.sql`, `make-erp-page.sql`, `make-form-page.sql`,
`convert-xmas.mjs`.
