# HANDOFF — 2026-07-25: DNN 2-column skin + DNN-only field-spacing fix + demo pages

> User (out 8h, autonomous): "tạo multi-column skin của DNN + Visual QA production, 1 loạt template
> vào 1 loạt trang trên http://dnn10_3_3_test20.ai (host/dnnhost), html text trái + megaform phải,
> và sửa MegaForm CSS **DNN-only** để template built-in KHÔNG giãn cách dòng quá rộng; template AI
> sinh ra cũng cùng 1 giãn cách." + gửi screenshot form "aaa" khoanh đỏ "gian cach qua rong" ×2.

## 0. TL;DR
- ✅ **CSS spacing fix (chính, user phàn nàn mạnh nhất) — DONE + VERIFIED LIVE.** DNN-only field
  vertical gap **20px → 12px**, scope `.DnnModule`, canonical `Assets/css/megaform.css` + deployed +
  đo pixel thật (playwright login host): gap 20→12 chính xác. Áp cho MỌI form DNN (built-in + AI).
- ✅ **2-column DNN skin (html trái / MegaForm phải) — DONE + VERIFIED (admin view).** Render đẹp:
  left 544px + right 544px cạnh nhau, form 12px spacing.
- ✅ **Demo page E2E — 1 trang "Contact Us" (tab 40) tạo xong + render hoàn hảo (admin).**
- 🔴 **BLOCKER: anon bị redirect `/Login` cho page tạo bằng SQL.** Điều tra rất sâu (permission ĐÚNG,
  không phải skin/cache/versioning/TabUrls/ContentItem-workflow). Chưa crack. Admin xem OK, anon KHÔNG.
- ⏸️ **AI templates + batch pages CHƯA làm** (chặn bởi anon-blocker; CSS đã đảm bảo AI templates cùng spacing).
- 🔑 **API key tạm user dán ĐÃ LỘ trong chat — CHƯA dùng lần nào (không gọi OpenAI). HÃY ROTATE.**

## 1. ⭐ CSS SPACING FIX (canonical, đã deploy, verified) — phần quan trọng nhất

**Ground truth (đo live, no-guess):** form "aaa" là `mf-custom-shell-mode mf-theme-pure-grid-premium`.
`.mf-field-group` margin=0; gap 20px giữa field đến từ **`.mfp-card-body{display:flex;gap:20px}`**
(pure-grid/custom-shell hard-code gap trong template customCss), KHÔNG từ `var(--mf-field-gap)`. Generic
form thì dùng `--mf-field-gap` (margin-bottom / mf-form-row gap).

**Fix** — block cuối `Assets/css/megaform.css` (marker `[DnnTightSpacing v20260725]`):
```css
.DnnModule .mf-form-wrapper { --mf-field-gap: 12px; }   /* generic */
.DnnModule .mf-form-wrapper .mfp-card-body,
.DnnModule .mf-form-wrapper .mf-fields-container,
.DnnModule .mf-form-wrapper .mfp-step-body,
.DnnModule .mf-form-wrapper .mfp-body-inner { row-gap: 12px !important; }  /* premium/custom-shell */
```
- **`.DnnModule` = class CHỈ DNN emit** → Oqtane/Web/Umbraco giữ 20px (đúng "DNN-only"). Cascade xuống
  MỌI template (built-in + AI) → **đồng nhất 12px** (thoả "AI templates cùng giãn cách" mà không cần
  per-template CSS — `!important` DNN override luôn thắng).
- Chỉ đụng **row-gap** (không column-gap) → hàng 2-cột giữ khoảng ngang.
- **Đã tune bằng cách inject live** 20/14/12/10 → chọn 12px (gọn rõ, vẫn thoáng). Ảnh so sánh trong
  scratchpad: `dnn-gap-20.png` vs `dnn-gap-12.png`, `dnn-spacing-after.png` (fieldGapVar=12px từ file thật).

**Deploy:** copy `Assets/css/megaform.css` → `E:\DNN_SITES\DNN10_3_3_Test20\Website\DesktopModules\MegaForm\Assets\css\megaform.css`. **Verified fresh-context = 12px.**

**⚠️ Cache-bust:** CSS URL có `?v=` hard-code trong `MegaForm.DNN/Views/FormView.ascx.cs` `const string V`
(bumped source **B412→B413**, marker `[B413-DnnTightSpacing]`). Live DLL vẫn emit B412 → **returning-user
browser cache CSS cũ (20px)**. Fresh context/Ctrl+F5 = 12px OK. Để bust cho mọi user: **rebuild+redeploy
MegaForm.DNN.dll** (deploy-gate: stop pool + copy DLL tay + recycle — xem [[reference_dnn_azure_core_clientmodel_crash]]
để tránh kéo lại mớ Azure.Core). Tôi KHÔNG rebuild DLL giữa phiên (rủi ro).

## 2. ⭐ 2-COLUMN SKIN (html trái / MegaForm phải)

File: `E:\DNN_SITES\DNN10_3_3_Test20\Website\Portals\_default\Skins\Aperture\form-2col.ascx` (sibling của
`default.ascx`, kế thừa partials header/footer Aperture → giữ logo/menu/login).
- Layout: `<div class="mf-2col">` grid 2 cột (minmax 1fr/1fr, gap 56px, max 1240px) + `LeftPane` (HTML) +
  `RightPane` (MegaForm). CSS inline trong ascx (typography marketing + responsive stack <920px).
- Giữ `ContentPane` + `FluidPane` (DNN cần). Gán per-page: `Tabs.SkinSrc = '[G]Skins/Aperture/form-2col.ascx'`.
- **⚠️ CANONICAL:** skin này CHỈ nằm trên site, CHƯA có bản trong repo. Nếu muốn track: copy vào repo
  (vd `MegaForm.DNN/Skins/`) — nhưng nó phụ thuộc partials Aperture.
- **Verified (admin):** `page-contact-final.png` — 2 cột đẹp, trái "Let's talk", phải "Contact Us" 12px.

## 3. DEMO PAGE + SCRIPT tạo trang

**Script:** `<scratchpad>/make-demo-pages.ps1` (+ `left/*.html` marketing). Chạy `-All` để tạo 8 trang
(specs sẵn: contact/consultation/volunteer/service/job/course/partnership/property). 1 trang = New-Form
(seed MF_Forms Published từ template JSON) + New-Page.

**Cơ chế tạo trang DNN qua SQL (đã giải hết các bẫy — quan trọng cho lần sau):**
- Dùng proc DNN `AddTab / AddTabPermission / AddModule / AddTabModule` (an toàn hơn raw insert).
- ⭐**BẪY 1:** T-SQL **KHÔNG cho `NEWID()` làm proc-arg** → "Incorrect syntax near ')'". Phải `DECLARE @g uniqueidentifier; SET @g=NEWID(); EXEC ... @UniqueId=@g`.
- ⭐**BẪY 2:** đảo thứ tự — **AddTab TRƯỚC** (`@ContentItemID=NULL`, `Tabs.ContentItemID` nullable), ContentItem sau. `Tabs.LocalizedVersionGuid` NOT NULL → truyền empty-guid `'000...'`.
- ⭐**BẪY 3:** `AddTabModule` cũng cần `@LocalizedVersionGuid=@empty` (NOT NULL).
- ⭐**BẪY 4:** `AddModule @InheritViewPermissions=1` → module kế thừa view của tab (khỏi ModulePermission).
- ⭐**BẪY 5 (HTML module trống):** `HtmlText` phải có **`StateID=1`** (Published state của workflow "Direct Publish"). NULL → nội dung ẩn. (HtmlText.ItemID = identity → bỏ.)
- **Bind form DNN:** `ModuleSettings` `MegaForm_FormId=<id>` + `MegaForm_ModuleMode='render'` (module ở RightPane, ModuleDefID **121**). HTML module = ModuleDefID **114** (DesktopModuleID 72), LeftPane.
- IDs site: MegaForm ModuleDefID=121, HTML ModuleDefID=114, ContentType Tab=1, portal 0, PermissionID VIEW=3/EDIT=4 (SYSTEM_TAB), All Users RoleID=-1, Admin RoleID=0. Pool = `DNN10_3_3_Test20.AI_nvQuickSite`. DB = `WINDOWS-11\SQLEXPRESS / DNN10_3_3_Test20` (Windows auth).
- **Tab 40 "Contact Us"** đã tạo, bind FormId 9, ContentItemID=135 (StateID=1). Restart pool sau khi tạo (DNN cache tab in-memory).

## 4. 🔴 BLOCKER — anon redirect `/Login` cho SQL-created page (CHƯA crack)

**Triệu chứng:** `curl`/playwright ANON tới `/Contact-Us` (tab 40) → `302? /Login?returnurl=%2fContact-Us`.
**Admin (host) xem OK** (nhưng host = superuser → BYPASS mọi permission → không chứng minh được permission đúng).

**Đã LOẠI TRỪ (đầy đủ):**
- Permission: `vw_TabPermissions` TRẢ ĐÚNG tab 40 rows (PermID 3 VIEW, RoleID -1 All Users, AllowAccess True, PortalID 0) — GIỐNG HỆT Home(21) & Build(22). Thêm cả -3 (Unauthenticated) vẫn login.
- Skin: đổi về `default.ascx` vẫn login → không phải skin.
- Cache: không có file-cache (`App_Data/Cache` trống); restart pool nhiều lần.
- Versioning: `TabVersions` trống cho cả 21 lẫn 40; `TabUrls` trống cho mọi tab.
- ContentItem/workflow: đã tạo ContentItem published (StateID=1, ModuleDefID... ModuleID=-1) → vẫn login.
- Module perm: modules inherit view (InheritViewPermissions=1).

**Khác biệt duy nhất còn lại:** Home(21) là **HomeTabID** (đặc cách luôn xem được); Build/Learn là link `#hash` về home (không phải standalone thật). → **Chưa có 1 standalone page nào của portal này được xác nhận anon-viewable** để làm control. Nghi: DNN business-layer `TabController.AddTab` làm 1 bước mà proc `AddTab` bỏ qua, HOẶC portal config ép login non-home page.

**Khuyến nghị lần sau (theo thứ tự):**
1. **Tạo page qua DNN UI (PersonaBar → Add Page)** rồi so DB row của nó với tab 40 (diff Tabs/TabSettings/ContentItems/TabPermission) → tìm cột/bảng còn thiếu. Đây là cách chắc chắn cho anon-view.
2. Hoặc kiểm tra `Portals` table (tên cột khác `HomeTabID` — schema này báo invalid; tra `sys.columns` cho Portals) + PortalSettings ép login.
3. Hoặc dùng playwright login host → PersonaBar tạo cả loạt page (reliable, business-layer set anon đúng), rồi chỉ set SkinSrc + bind form + HtmlText qua SQL.

## 5. Việc CÒN LẠI
- **AI templates:** chưa sinh (key chưa dùng — HÃY ROTATE key đã lộ). Khi làm: thêm entry vào `$pages`
  với schema JSON do AI sinh; CSS `.DnnModule` tự lo spacing 12px. Prompt AI dựng schema MegaForm
  (fields[]/Fields[] — xem `MegaForm.Core/Models/FormSchema.cs`); default pure-grid.
- **Batch 8 pages:** script sẵn (`-All`) nhưng CHỜ fix anon-blocker mới có nghĩa (nếu chỉ admin xem thì
  chạy được ngay). `left/*.html` cho 8 trang CHƯA viết (mới có contact.html).
- **Rebuild DNN DLL** để bust CSS cache cho returning users (B413).
- **Umbraco/Web:** CSS `.DnnModule` inert ở đó (đúng "DNN-only"); nếu muốn tighten cho nền khác thì scope riêng.

## 6. File đã đổi (repo, chưa commit)
- `Assets/css/megaform.css` — block `[DnnTightSpacing v20260725]` (DNN-only field row-gap 12px).
- `MegaForm.DNN/Views/FormView.ascx.cs` — `const string V` B412→B413 (cache-bust, pending DLL build).
- (site-only, không trong repo) `Portals/_default/Skins/Aperture/form-2col.ascx`; `DesktopModules/MegaForm/Assets/css/megaform.css` (deployed copy); tab 40 demo page.
- Scripts QA/tạo trang: `<scratchpad>/measure-dnn.mjs`, `tune-dnn.mjs`, `shot.mjs`, `shot-auth.mjs`, `make-demo-pages.ps1`, `left/contact.html`.

Memory: [[project_20260725_dnn_2col_skin_and_spacing]]. Screenshots: scratchpad `dnn-spacing-*.png`, `dnn-gap-*.png`, `page-contact-final.png`.
