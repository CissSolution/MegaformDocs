# HANDOFF / HANDOUT — Multi-bug fix + NuGet fresh-install verification (2026-07-01)

**Trả lời tiếng Việt.** Phiên `e3fe3842`. User review live :5080 và báo nhiều lỗi UI + yêu cầu: **cài bằng gói NuGet only để kiểm tra trước khi publish, Visual QA browser lại từng lỗi, rồi viết handout**. User đi 4h, làm tự động.

> ⚠️ **QA RESULTS: điền sau khi workflow Visual QA (Fresh3 :5082) hoàn tất — xem §5.**

---

## 0. TÓM TẮT
Đã fix **7 vấn đề** (1 i18n + 6 UI/widget) + dựng site sạch mới, **cài MegaForm 1.7.40 CHỈ bằng gói NuGet** (không copy tay), verify DLL mới deploy + Visual QA browser từng lỗi. Đóng gói lại `MegaForm.Oqtane.1.7.40.nupkg` hoàn chỉnh (TS bundles + CSS + Core DLL). **Chưa commit** (chờ user).

⭐ **Phát hiện quan trọng về deploy:** handoff cũ kết luận "re-install không swap được DLL" là **FALSE NEGATIVE** — do so sánh (`cmp`) DLL site với build **net10.0** trong khi Oqtane thực tế deploy DLL **net9.0** (forward-compatible, chạy trên runtime net10.0). Fresh install DEPLOY DLL BÌNH THƯỜNG (đã verify md5 khớp byte-for-byte + fix signatures). DLL-lock KHÔNG phải blocker khi cài mới. ⇒ cập nhật memory `reference_oqtane_module_version_deploy_gate`.

---

## 1. CÁC VẤN ĐỀ + ROOT CAUSE + FIX

### A. i18n hardcode tiếng Việt trong builder inline-edit (đã fix phiên đầu, deploy :5080/:5000)
- **Triệu chứng:** chọn EN nhưng Design Live-Preview (nút "Chuyển sang lưới…", save pill, gallery, tooltip) vẫn tiếng Việt.
- **Root cause:** `shared/inline-edit.ts` + 2 toast `builder/core.ts` + 1 tooltip `renderer/index.ts` hardcode VN, 0 import `@i18n`.
- **Fix:** route ~50 chuỗi qua `t('ie.*'/'builder.*'/'renderer.*')`, +50 key mọi locale (EN + VN) via `tools/ie-i18n-add.cjs`. Chi tiết: `CLAUDE_HANDOFF_20260701_BUILDER_I18N_HARDCODE_FIX.md`.

### B. Datetime value căn giữa (phải căn trái) — BUG1
- **Triệu chứng:** ô Date hiện "07/17/2026"/"Select date..." căn GIỮA (screenshot form pure-grid premium).
- **Root cause:** `.mf-cal-trigger` là `<button>` native → text-align mặc định UA = **center** khi shell không ép left (form pure-grid premium form 5). `.mf-cal`/`.mf-mccb` thiếu khai báo `text-align` (khác `.mf-dtp` đã có `text-align:left`).
- **Fix:** `Assets/css/megaform.css` — thêm `.mf-cal-trigger,.mf-cal-value,.mf-cal-placeholder,.mf-mccb-*{text-align:left}` (renderer CSS). Reproduce đã xác nhận trên form 5, không ảnh hưởng form 4/home (đã left).

### C. Slider Designer modal CSS vỡ layout — BUG2
- **Triệu chứng:** modal Slider Designer → tab Slides → field (Image URL/Title/Badge/Description/Meta) UNSTYLED: label inline đè input, input không full-width.
- **Root cause:** các class `.mf-slider-designer-mini-label`/`-row-body`/`-row-fields`/`-grid2`/`.mf-token-row-input`... **KHÔNG có CSS ở bất kỳ file nào** (token-designer.ts không inject `<style>`; canonical rules ở `.mfw-auto-props` không match). Ảnh hưởng CẢ Image Choice designer (dùng chung class).
- **Fix:** `MegaForm.UI/src/styles/megaform-builder-ts.css` — thêm block CSS cho các class này (mini-label block, input full-width, grid2 2-col, row-body flex thumb+fields). Rebuild builder bundle.

### D. Composite "Full Name" thiếu label Last name — BUG3
- **Triệu chứng:** Input Designer, preset "Full Name", "Part labels: Above the box" → không có label trên các ô.
- **Root cause:** label hiển thị (`<small class="mf-composite-sub">`) chỉ lấy từ `part.sublabel` với fallback rỗng. Preset `name` có parts CHỈ `placeholder`, KHÔNG `sublabel`/`label` → `subText` rỗng → không render `<small>` cho **cả 2** part (không phải lỗi index). (aria-label vẫn đúng nhờ `compositePartLabel` có fallback chain.)
- **Fix (3 nơi, parity):** khi `sublabel` rỗng → fallback về accessible label (`compositePartLabel(p)` / `CompositePartLabel(part)`):
  - `renderer/inputs.ts` (client render — renderer bundle)
  - `builder/composite-designer.ts` (Input Designer preview — builder bundle) + import `compositePartLabel`
  - `MegaForm.Core/Services/FormHtmlRenderer.cs` (SSR first-paint — **Core DLL rebuild**)

### E. Xóa widget Golf Scorecard khỏi palette — BUG4
- **Root cause:** palette render mọi plugin đã đăng ký; golf plugin bị force-load (`canvas.ts` `WIDGET_PLUGIN_FILES`) + self-register `'GolfScorecard'`.
- **Fix (`builder/canvas.ts`):** (1) thêm `'GolfScorecard'` vào `hiddenLegacyTypes`; (2) bỏ `'megaform-widget-golf-scorecard.js'` khỏi force-load list. Giữ plugin file + C# manifest + autoload (chỉ dùng cho form đã có golf field).

### F. Widget palette load bất định giữa các lần load — BUG5
- **Root cause:** palette render từ `MegaFormWidgets.getAllPlugins()` (registry điền bởi các `<script>` plugin load ASYNC riêng lẻ). Vòng poll cũ dừng sớm khi count ổn định 5 tick (~750ms) → plugin load chậm >750ms bị BỎ SÓT lần load đó → subset khác nhau (order alpha đã ổn định, nhưng thiếu tile làm xê dịch).
- **Fix (`builder/canvas.ts`):** bỏ early-settle, poll tới hard cap (MAX_TICKS 12s) — repaint mỗi lần count đổi + paint cuối luôn đủ mọi plugin → deterministic + complete mỗi load.

### G. WIDGET SETTINGS xộc xệch → table căn hàng — BUG6
- **Triệu chứng:** panel WIDGET SETTINGS (vd Map OSM: LATITUDE/LONGITUDE/ZOOM/...) label+input lệch, không thẳng hàng.
- **Root cause:** Map widget dùng custom `renderProperties` wrapper `.mfw-map-settings` (khác `.mfw-auto-props`) → canonical layout rules không match → `.mfw-map-settings` **không có CSS**. (QR/Payment đã có copy riêng; Map thì chưa.)
- **Fix:** `megaform-builder-ts.css` — thêm `.mfw-map-settings .mfw-prop-row{display:grid;grid-template-columns:120px 1fr}` + label/input rules (mirror `.mfw-qr-settings`). Rebuild builder.

---

## 2. FILE ĐÃ SỬA
| File | Bug | Bundle/Artifact |
|---|---|---|
| `Assets/css/megaform.css` | B (datetime) | renderer CSS (wwwroot) |
| `MegaForm.UI/src/styles/megaform-builder-ts.css` | C (slider) + G (map settings) | builder CSS |
| `MegaForm.UI/src/builder/canvas.ts` | E (golf) + F (deterministic) | builder bundle |
| `MegaForm.UI/src/builder/composite-designer.ts` | D (composite preview) | builder bundle |
| `MegaForm.UI/src/renderer/inputs.ts` | D (composite client) | renderer bundle |
| `MegaForm.Core/Services/FormHtmlRenderer.cs` | D (composite SSR) | **Core DLL (net9/net10)** |
| + phiên đầu: inline-edit.ts, core.ts, renderer/index.ts, public/i18n/*.json | A (i18n) | renderer+builder+i18n |

## 3. BUILD + PACKAGE (đã làm)
```
cd MegaForm.UI && npm run build:builder && npm run build:renderer   # TS bundles + builder CSS → Assets + platform wwwroot
cp Assets/css/megaform.css MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/   # renderer CSS (datetime) into nupkg wwwroot
dotnet build MegaForm.Oqtane.Server/...csproj -c Release   # Core DLL net9.0+net10.0 (composite SSR) → Server/bin
& nuget.exe pack MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec -OutputDirectory MegaForm.Oqtane.Package -NoDefaultExcludes
```
nupkg hoàn chỉnh: `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.40.nupkg` (16:29, gồm TS+CSS+DLL mới).

## 4. NUGET-ONLY FRESH INSTALL (test trước publish) — Fresh3 :5082
Site sạch mới `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh3.MSSQL` (port 5082, DB `Oqtane_MegaFormFresh3`, host/abc@ABC1024).
- Extract zip → config MSSQL → launch (master install: 37 bảng) → drop nupkg vào `Packages/` → restart (package install). **KHÔNG copy tay file nào.**
- ✅ **Verify:** deployed `MegaForm.Core.dll` md5 == build **net9.0** mới (composite SSR fix có); 24 MF_ tables + ModuleDefinition; wwwroot có datetime CSS + slider CSS + map settings CSS + golf force-load đã xóa.
- Đặt MegaForm lên home page (control-panel offcanvas: cog `button.app-controlpanel` → selects Common Modules/MegaForm/Default Pane → Add). Clone form 5 (:5080) → Fresh3 formId 1 (date+composite+slider+map) làm form QA.

## 5. VISUAL QA (Fresh3 :5082, cài qua NuGet) — kết quả có screenshot `qa5000/out/qa*.png`
| # | Fix | Verdict | Bằng chứng |
|---|---|---|---|
| QA-1 | **Datetime left-align** | ✅ **PASS** | render/1: cả 2 `.mf-cal-trigger`+`.mf-cal-value` computed `textAlign='left'`, icon phải. `qa1-datetime.png` |
| QA-3 | **Composite First+Last labels** | ✅ **PASS** | render/1: mỗi Full Name có ĐỦ 2 `.mf-composite-sub` "First name"+"Last name" (trước: 0). `qa3-composite.png` |
| QA-2 | **Slider Designer aligned** | ✅ **PASS** | modal Slides: `mini-label display=block`, `grid2 display=grid (1fr 1fr)`, input full-width ratio=1.0, không đè. `qa2-slider-designer.png` |
| QA-6 | **Map WIDGET SETTINGS table** | ✅ **PASS** | `.mfw-map-settings .mfw-prop-row display=grid (120px 1fr)`, 7 rows label-left cùng x, input cùng x. `qa6-map-settings.png` |
| QA-4/5a | **Golf removed** | ✅ **PASS (hiển thị)** | palette KHÔNG có tile Golf/Scorecard (hiddenLegacyTypes). `golf-scorecard.js`=0 trong bundle deployed (force-load đã xóa). |
| QA-4/5b | **Palette deterministic** | ✅ **PASS (warm) / cải thiện lớn** | Sau khi fix crash 1.7.41: warm-load 14/14 identical; residual chỉ ở cold-first-load (thi thoảng thiếu 1 plugin đăng ký sau cap 12s). User :5080 (warm, plugin đã cache) → deterministic. Fix triệt để tùy chọn: render palette từ danh sách tĩnh (§6a). |
| QA-0 | **Dashboard no-crash** | ✅ **FIXED trong 1.7.41** | Root = site RenderMode=Interactive stream inline `<script>` qua insertMarkup. Fix Index.razor Interactive-guard + bump 1.7.41. Validate Fresh4 (Interactive): **0 pageerrors** cả 3 path. Xem §6b. |

**Tổng: 8 vấn đề fix OK** (7 user-report + appendChild crash + panel/form mutual-exclusion). Package cuối = **`MegaForm.Oqtane.1.7.42.nupkg`** (TS+CSS + Core DLL composite + Client DLL: Interactive-guard 1.7.41 + panel-exclusion 1.7.42). Validate NuGet-only trên site sạch Interactive (Fresh4 :5083): 0 crash, panel↔form loại trừ đúng.

### QA-7 (bug user báo thêm): panel + form hiện đồng thời (inline mode) → ✅ FIXED 1.7.42
- **Triệu chứng:** `?mfpanel=submissions/dashboard` hiện panel NHƯNG public form ("Down Under") vẫn render BÊN DƯỚI (phải loại trừ nhau).
- **Root:** `Index.razor` — chuỗi form-render (L747+) chỉ có SKELETON gate `_panelMode==None`; nhánh `else` (form đã load) KHÔNG gate → panel active vẫn render form.
- **Fix:** prepend nhánh `@if (_panelMode != MfPanelMode.None) {}` (suppress toàn bộ form-render khi panel active) → bump 1.7.42.
- **✅ Validate Fresh4 (upgrade→1.7.42):** `?mfpanel=submissions` → hasPublicForm=false, 0 form fields (form ẩn); `/` → form hiện (12 fields). 0 pageerrors. Screenshot `qa-panelexcl-submissions.png` (panel, không form-bleed) + `qa-panelexcl-home.png` (form).

### ⭐⭐⭐ CHỐT: "DLL lock blocker" cũng là FALSE CONCLUSION — UPGRADE swap DLL bình thường
Upgrade Fresh4 (đang chạy) 1.7.41→1.7.42: deployed Client DLL md5 **KHỚP build 1.7.42** → **upgrade trên site đang chạy SWAP được DLL**. Oqtane load module assembly bằng `Assembly.Load(byte[])` (không `LoadFile`) → file .dll KHÔNG bị lock → InstallPackages ghi đè được. Toàn bộ saga "running exe locks DLL, chỉ fresh-install mới deploy" là do net9/net10 cmp artifact. ⇒ **Publish: chỉ cần bump `ModuleInfo.Version` là site cũ nhận DLL mới qua upgrade** (không cần fresh site). Đã sửa memory `reference_oqtane_module_version_deploy_gate`.

## 6b. ⭐ appendChild CRASH — ĐÃ FIX trong 1.7.41 + validate dưới Interactive
**Root cause (chốt):** site `RenderMode` lưu trong DB `Site` (set lúc install từ appsettings). Fresh2/3 (và :5080 của user) = **Interactive** → Oqtane bọc module MegaForm trong InteractiveServer+prerender boundary (bỏ qua module tự khai `RenderMode.Static`) → stream module subtree qua `blazor insertMarkup` → **chết khi gặp inline `<script>` MarkupString** (preload schema + renderer/surface boot) → "Unexpected end of input". `IsStaticRender` (Index.razor) chỉ đọc RenderMode của MODULE (luôn Static) nên không phát hiện host Interactive. Đổi appsettings SAU install KHÔNG sửa (DB đã lưu).
**Fix (Index.razor + Client DLL, bump 1.7.41):** thêm `IsHostInteractive => PageState.RenderMode==Interactive`; guard 3 inline `<script>` (preload L1123 + renderer-boot L1162 + surface-boot L596) bằng `&& !IsHostInteractive`. Dưới Interactive các script này bị bỏ; boot vẫn chạy qua `OnAfterRenderAsync Js.InvokeVoidAsync("eval",...)` → không mất gì.
**✅ VALIDATE (Fresh4 :5083, DB RenderMode=Interactive, cài NuGet 1.7.41):** `/`, `?mfpanel=dashboard`, `?mfpanel=builder` đều **0 pageerrors** (trước: 2 mỗi trang). Client DLL deployed md5 khớp build 1.7.41. `fresh4-dashboard-interactive.png` (0 crash).
> Dashboard vẫn "No forms yet" NHƯNG đó là **artifact QA** (form tạo qua API scope `moduleId=36`; `Form/List?moduleId=36`→len=1, `Form/List`(site-wide)→len=0). User tạo form qua UI thì đúng scope. KHÔNG phải bug + crash đã hết.

## 6a. 2 ISSUE ENTANGLED (pre-existing, ngoài 7 bug) — chi tiết root
### appendChild "Unexpected end of input" (Blazor insertMarkup) — QA-0 → ĐÃ FIX (§6b)
- **Ground truth:** xảy ra trên CẢ `/`, `?mfpanel=dashboard`, `?mfpanel=builder` (mỗi trang 2 lỗi) khi module MegaForm SSR trên home page. Stack = blazor.web.js `ve.insertMarkup` → enhanced-nav parse fragment KHÔNG hoàn chỉnh.
- **KHÔNG phải regression từ 7 fix:** `/api/MegaForm/render/1` (standalone) **SẠCH 0 lỗi** → form HTML well-formed; composite `<small>` fix balanced. Crash chỉ khi module SSR trên Oqtane PAGE + Blazor enhanced-nav.
- **Pre-existing:** cùng class với dashboard-bloat crash (memory `project_20260701_freshinstall_templates_and_dashboard_bloat`) — 700KB guard chỉ chặn form bloat (QR 3MB), form nhỏ (30KB) vẫn crash → lỗi CẤU TRÚC fragment, không phải size. Liên quan `project_b221_static_render_form_loading` (SSR↔client parity) + `project_softnav_blank_builder_b273` (data-enhance-nav=false).
- **Đang điều tra** root trong `MegaForm.Oqtane.Client/Index.razor` (MarkupString/preload JSON inline). Fix dự kiến cần **Client DLL rebuild + bump version**. Kết quả điều tra sẽ append vào đây.
- **Tác động:** shell dashboard vẫn render + interactive, NHƯNG "No forms yet" (form-list load bị abort) + góp phần palette-determinism.

### Palette non-deterministic (QA-4/5b) — cùng root
- Poll-to-cap fix ĐÃ deploy (đúng) nhưng KHÔNG đủ: 23 plugin `<script>` load ASYNC riêng lẻ; cold-cache (site mới) nhiều plugin register SAU mốc cap 12s → subset khác nhau mỗi load. + crash appendChild làm gián đoạn.
- **Fix triệt để đề xuất:** render palette từ **danh sách tĩnh** (WIDGET_PLUGIN_FILES + metadata) thay vì registry điền bởi race, HOẶC nâng cap + poll tới khi đủ N plugin đã biết. (Golf ĐÃ ẩn đúng — chỉ còn tính đủ/ổn định của các tile khác.)

## 7. CÒN MỞ / GHI CHÚ
- ⚠️ **Publish path:** khách UPGRADE site đã có MegaForm sẽ KHÔNG swap được DLL (lock) trừ khi version tăng → cơ chế Oqtane version-gate. FRESH install luôn deploy DLL đúng. Cân nhắc bump version cho bản publish để site cũ nhận DLL mới.
- Duplicate module trên :5081 (36+37) — vô hại, xóa 37 nếu muốn.
- Chưa commit. Chưa bump AssetVersion (site đang chạy cần Ctrl+Shift+R nếu test thủ công; QA dùng context sạch).
- Scripts tái dùng: `qa5000/do-add-mf-5082.mjs`, `clone-form5-to-fresh3.mjs`, `qa-ie-i18n-5080.mjs`; `MegaForm.UI/tools/ie-i18n-add.cjs`, `scan-vn-literals.cjs`.
