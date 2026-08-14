# CLAUDE HANDOFF — 2026-07-05 — Settings-tabs + Theme-Designer→Settings migration + 2 bug fixes

> ## ✅ STATUS 2026-07-05 (later) — 3 TASK NÀY + 2 VIỆC MỚI ĐÃ XONG & DEPLOY (1.7.81/82/83 trên :5113)
> Chi tiết đầy đủ + facts QA ở memory `project_20260705_settings_controls_hideheader_formid7_ssr.md`. Tóm tắt:
> - **TASK 1 Typography+Radius → Settings**: DONE (1.7.81). ⚠️var names handoff SAI — thực tế: heading=`--mf-title-font-family`, base=`--mf-font-size-base`(def **15**), line-height=`--mf-line-height` (UNITLESS, row riêng). Round-trip QA PASS.
> - **TASK 2 i18n 404**: DONE (1.7.81). Fix ở `resolveI18nBase()` (đảo default→Oqtane khi ko chắc DNN). Live: `/api/MegaForm/i18n/Get?id=vi-VN`→200.
> - **TASK 3 submit 400**: DONE (1.7.81). ⚠️file handoff SAI — active renderer là **`src/renderer/index.ts`** (init ~1305), KHÔNG phải `megaform-renderer.ts` (dead). Live submit→`/api/MegaForm/Submit/Post` 200.
> - **MỚI: Hide Form Header → Settings pane**: DONE (1.7.82). `SaveTheme` partial-patch `HideHeader` ×3 platforms + checkbox. QA round-trip PASS.
> - **MỚI: formid=7 premium multi-step SSR parity** (empty body + stray "Gửi"): DONE (1.7.83). Core `is-active` inject + Oqtane wrapper `mf-premium-native-mode`. Pure-SSR (JS off) VERIFIED.
> - ⚠️**COMMIT DEFERRED**: working tree intermingled với Codex (renderer/index.ts: 3 dòng của tôi / 83 pre-existing). Cần per-hunk staging bởi người sở hữu Codex tree. C#/version files (AssetVersion/ModuleInfo/nuspec/MegaFormController×3/RenderPage/FormHtmlRenderer/Index.razor) = all-mine, an toàn commit riêng.
> - ⚠️**FOLLOW-UP**: DNN/Web wrapper-class parity cho formid=7 chưa thêm (Core `is-active` đã cover body 3 nền; chỉ thiếu class ẩn generic-actions trên DNN/Web). i18n keys mới (vd.set.typography/hide_header/…) fall back English literal — dịch sau nếu muốn.
>
> ---
>
> **Mục đích (bản gốc):** để phiên sau **làm được ngay** (mọi việc có root-cause + file:line + code sẵn) và **QA tiếp tục**.
> **Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`
> **Deploy đang chạy:** MegaForm **1.7.80** trên site sạch **:5113** (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1774`, DB `Oqtane_MegaForm_Fresh1774` .\SQLEXPRESS, host/abc@ABC1024).
> **⚠️ Session Oqtane rớt sau nhiều lần restart server (upgrade)** → phải **re-login host** trước khi QA admin popup (nếu `ModuleConfig/36` trả 403 = đã logout).

---

## 0. Trạng thái hiện tại (đã xong trong phiên này — ĐÃ commit + deploy + QA)

| Commit | Nội dung | Version |
|---|---|---|
| `e589ab6` | Sprint 0+1: SEC-B1/B2, PERF-A1/C1/C2, SEC-M, OPS-1 | (code) |
| `6191f14` | Field-spacing "always 20px" (GetModuleStyle JObject→STJ→`[[[]]]`) + SEC-B1 antiforgery regression | 1.7.76 |
| `6c57289` | Per-preset editable colour palette (Theme preset ▾) | 1.7.77 |
| `326c437` | Admin-panel FOUC (render-blocking CSS per panel) | 1.7.78 |
| `6424c3a` | Phantom double-border (`.mfp-container` transparent border reveals dark bg) | 1.7.79 |
| `52546ed` | ⚙ Settings popup: **accordion → TABS** (Save luôn thấy) | 1.7.80 |

**Cây dirty lớn từ TRƯỚC phiên (KHÔNG đụng):** ~115 tracked M + 208 untracked (Codex/deployed-only, gồm cả project mới `MegaForm.Umbraco.Host`). Đừng commit gộp mù.

**⭐Bài học load-bearing đã ghi memory:** Oqtane controllers serialize bằng **System.Text.Json** → **KHÔNG return raw Newtonsoft JObject** (STJ phun `[[[]]]`) → dùng `JsonDocument.Parse(json).RootElement.Clone()`. (`reference_oqtane_stj_no_raw_jobject`).

---

## 1. ⭐ TASK CHÍNH — Chuyển control Theme Designer ra Settings pane (dạng Tabs)

**Yêu cầu user:** các control trong Theme Designer (Design tab / "Trình thiết kế giao diện" → tab **Global**) — **Typography (Kiểu chữ)** + **Border radius (Bo góc viền)** — đưa ra **Settings popup** (đã là tabs). "Page integration" (Typography source / Color source) **ĐÃ CÓ** trong Settings → tab "Theme & Layout".

### Cần thêm vào tab "Theme & Layout" của Settings popup:
1. **Typography:** Heading Font (`<select>`), Body Font (`<select>`), Base size (slider), Line height (slider).
2. **Bo góc viền (Border radius):** 4 preset radio (Rounded / Pill / Sharp / Soft) + Custom radius (slider).

### File & hàm cần sửa
`MegaForm.UI/src/view-designer/settings-popup.ts` → hàm **`buildThemeLayoutSection()`** (khoảng dòng 817–1001). Đây là builder dựng content tab "Theme & Layout" (hiện có: preset grid + palette + Max width radio + Field spacing slider + Page integration). **Thêm 2 nhóm control mới vào `content` (dòng ~924-942, khối `const content = h('div', {...}, ...)`).**

### CSS var mapping (đã verify trong megaform.css + theme-designer)
| Control | CSS var | Ghi chú |
|---|---|---|
| Body Font | `--mf-font-family` | theme-designer:675 set `'${value}',system-ui,sans-serif` (megaform.css:55,150) |
| Heading Font | `--mf-heading-font` *(VERIFY)* | ⚠️theme-designer chỉ thấy dùng `--mf-font-family`; kiểm `src/theme-designer/index.ts` các `setCssVar` để lấy đúng var heading (có thể chung `--mf-font-family` hoặc `--mf-heading-font-family`). `grep -n "setCssVar\|--mf-.*font\|Heading" src/theme-designer/index.ts` |
| Base size | `--mf-base-size` *(VERIFY)* | megaform.css chưa thấy `--mf-base-size` rõ; kiểm theme-designer control "Base size" set var nào (có thể `font-size` root hoặc `--mf-font-size`). |
| Line height | `--mf-line-height` | megaform.css:57(default 1.5),152 |
| Border radius | `--mf-form-radius` | megaform.css:49(default 8px),256,871. Preset Rounded/Pill/Sharp = giá trị (vd 8px/999px/0) hoặc class `.mf-style-radius-{rounded,pill,square}` (form wrapper đã có `mf-style-radius-square`). Custom radius = set `--mf-form-radius` trực tiếp. |

### PATTERN để wire (copy y hệt Field-spacing slider + palette đã có trong file)
- **Slider** (Base size, Line height, Custom radius): dùng `sliderRow(label, cssVarKey, min, max, fallback)` **đã có sẵn** trong `buildThemeLayoutSection` (dòng ~887-903). Chỉ cần gọi thêm:
  - `sliderRow(T('vd.set.base_size','Base size'), '--mf-base-size', 12, 22, 16)`
  - `sliderRow(T('vd.set.line_height','Line height'), '--mf-line-height', 10, 20, 15)` *(⚠️line-height là số thập phân 1.0-2.0 → sliderRow hiện append 'px'; cần biến thể sliderRow KHÔNG có 'px' cho line-height, hoặc lưu `--mf-line-height: v/10`. Xem cách theme-designer làm.)*
  - `sliderRow(T('vd.set.custom_radius','Custom radius'), '--mf-form-radius', 0, 30, 8)`
- **Font `<select>`:** tạo `<select>` với danh sách font (copy từ theme-designer's font list — `grep -n "Inter\|Roboto\|font.*option\|FONT" src/theme-designer/index.ts`), `onchange` → `setLayoutVar('--mf-font-family', "'"+val+"',system-ui,sans-serif")` + `flagDirty()`. Đọc giá trị hiện tại từ `themeOverrides['--mf-font-family']`.
- **Radius radio:** dùng `radioRow(label, name, options, current, onPick)` **đã có sẵn** (dòng ~910-921). `radioRow('Bo góc', 'radius', [['8px','Rounded'],['999px','Pill'],['0','Sharp'],['16px','Mềm']], curRadius, (v)=>{ setLayoutVar('--mf-form-radius', v); flagDirty(); })`.
- **Đọc giá trị hiện tại:** `const curFont = String(themeOverrides['--mf-font-family']||'').replace(/['"]/g,'').split(',')[0] || 'Inter';` v.v. (giống `curMaxWidth` dòng 905).

### Lưu / round-trip
- `setLayoutVar` (dòng 811) ghi vào `themeOverrides` → Save button gọi `saveModuleStyle(moduleId, formId, themeState, themeOverrides)` → persist `themeCssOverrides` → **GetModuleStyle (đã fix 1.7.76 trả JsonElement) đọc lại đúng** → reopen hiện giá trị. **Render áp dụng** (megaform.css consume các var). ĐÃ có cơ chế, chỉ cần thêm control.
- **KHÔNG cần** đụng server (các var này client-only qua module style). Chỉ rebuild `build:settings-popup` + bump AssetVersion.

### QA (browser :5113)
1. Re-login host. Mở form module ⚙ Settings → tab "Theme & Layout".
2. Đổi Body Font → đo `getComputedStyle(form).getPropertyValue('--mf-font-family')`. Save → reload → font áp dụng + reopen hiện đúng.
3. Đổi Border radius Pill → form card `border-radius` = 999px. Save/reload/reopen round-trip.
4. Base size / Line height slider tương tự.

---

## 2. FIX lỗi 404 — builder i18n load path DNN trên Oqtane

**Lỗi:** `:5113/DesktopModules/MegaForm/Assets/js/builder/i18n/vi-VN.json → 404`. Đường DNN `/DesktopModules/...` bị dùng trên **Oqtane**.

**Root cause:** `MegaForm.UI/src/i18n/index.ts` → `resolveI18nBase()` (dòng **308-333**):
```ts
if (!api) {
  const w = window as any;
  if (w.Oqtane || w.__OQTANE__ || document.querySelector('[data-platform="oqtane"]')) api = '/api/MegaForm/';
  else api = '/DesktopModules/MegaForm/API/';   // ← FALLBACK DNN
}
api = api.replace(/\/+$/, '');
if (/\/DesktopModules\/MegaForm\/API$/i.test(api)) {
  return api.replace(/\/API$/i, '/Assets/js/builder/i18n');   // ← nhánh 404 trên Oqtane
}
return api + '/i18n';   // ← nhánh Oqtane đúng = /api/MegaForm/i18n
```
Khi builder/theme-designer gọi i18n mà **không có** `__MF_PLATFORM__.apiBase`, không có `[data-api-base]`, và Oqtane marker chưa detect được (`window.Oqtane`/`[data-platform=oqtane]` chưa có lúc chạy) → fallback DNN → nhánh 404.

**FIX (chọn 1, khuyến nghị B):**
- **A)** Detect Oqtane chắc hơn: thêm điều kiện `location.pathname` chứa `/Modules/MegaForm/` HOẶC có `link[href*="/Modules/MegaForm/"]` → Oqtane. Vì Oqtane là target chính, có thể **đảo default**: khi không chắc → dùng `/api/MegaForm/` thay vì DNN.
- **B (an toàn nhất)** Ở nhánh 404 (dòng 326-327), kiểm tra thêm: chỉ dùng DNN builder-i18n path nếu **thực sự DNN** (vd `document.querySelector('[data-platform="dnn"]')` hoặc `!/\/Modules\//.test(location.pathname)`). Nếu đang trên Oqtane → `return '/Modules/MegaForm/js/builder/i18n'` (⚠️Oqtane path đúng cho static builder i18n = `/Modules/MegaForm/js/builder/i18n/`, KHÔNG phải `/api/MegaForm/i18n` — verify file tồn tại: `ls MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/builder/i18n/`).
- **⚠️VERIFY trước khi fix:** builder i18n trên Oqtane phục vụ qua đâu? `/api/MegaForm/i18n/Get?id=vi-VN` (API) HAY static `/Modules/MegaForm/js/builder/i18n/vi-VN.json`? Test: `curl http://localhost:5113/Modules/MegaForm/js/builder/i18n/vi-VN.json` và `curl http://localhost:5113/api/MegaForm/i18n/Get?id=vi-VN`. Nhánh nào 200 thì trỏ vào đó.

**Rebuild:** `npm run build:i18n` (+ có thể `build:builder`/`build:theme-designer` nếu chúng inline i18n). Bump AssetVersion.

---

## 3. FIX lỗi 400 — `/api/MegaFormSubmit/Post`

**Lỗi:** `:5113/api/MegaFormSubmit/Post → 400`. Chú ý **thiếu `/`** giữa `MegaForm` và `Submit` → `MegaFormSubmit`.

**Root cause:** `MegaForm.UI/src/renderer/megaform-renderer.ts`:
```ts
2597:  var apiBase = config.apiBaseUrl || config.apiBase || '/api/MegaForm/';
2599:  var submitUrl = apiBase + 'Submit/Post';   // nếu apiBase = '/api/MegaForm' (thiếu /) → '/api/MegaFormSubmit/Post'
```
Renderer **KHÔNG normalize trailing slash** trên `config.apiBaseUrl` do caller truyền. Một caller (preview/embed nào đó) truyền `apiBase` **thiếu `/` cuối**.

**FIX (1 điểm, khuyến nghị):** normalize ngay lúc init — `megaform-renderer.ts` dòng **1021-1022**:
```ts
if (!config.apiBaseUrl && config.apiBase) config.apiBaseUrl = config.apiBase;
config.apiBaseUrl = (config.apiBaseUrl || config.apiBase || '/api/MegaForm/').replace(/\/?$/, '/');  // ← THÊM: đảm bảo trailing slash
```
→ mọi chỗ dùng (2599 Submit/Post, 2666 Draft/Save, 2924 Upload/File) đều đúng.
*(Cũng nên rà `src/renderer/index.ts:2994` `config.apiBaseUrl + 'Submit/Post'` — normalize tương tự nếu là code path khác.)*

**Truy caller thiếu slash (tuỳ chọn, để fix tận gốc):** grep `MegaFormRenderer.init` + `apiBase:` không có `.replace(/\/?$/,'/')`. Nghi: theme-designer preview srcdoc (index.ts:1384 `apiBaseUrl:${JSON.stringify(this.apiBase)}` — this.apiBase CÓ slash, nên chắc caller khác) HOẶC builder preview. Nhưng fix defensive ở renderer (trên) là đủ + an toàn nhất.

**Rebuild:** `npm run build:renderer`. Bump AssetVersion.

---

## 4. Quy trình PACK + DEPLOY + QA (recipe đã dùng suốt phiên)

### Pack thủ công (sandbox chặn pack.cmd)
```bash
# 1. Nếu đổi TS: cd MegaForm.UI && npm run build:<entry>   # (settings-popup / i18n / renderer / theme-designer)
#    widget plugin: npx tsc -p src/widgets/plugins/tsconfig.json → Assets/js/plugins → sync 3 wwwroot
# 2. Bump: MegaForm.Oqtane.Client/ModuleInfo.cs (Version + ReleaseVersions), nuspec <version>, nuspec releaseNotes.
#    Nếu đổi JS/CSS → bump MegaForm.Oqtane.Shared/AssetVersion.cs (B367→B368...) để bust cache.
# 3. dotnet build Release: Shared, Server(net9+net10 → build cả Core transitively), Client. (Server chỉ cần nếu đổi C#.)
# 4. dotnet build MegaForm.Oqtane.Package/*.csproj -c Release
# 5. cd MegaForm.Oqtane.Package && rm -f *.nupkg && ./nuget.exe pack MegaForm.Oqtane.nuspec -NoPackageAnalysis
```
- nuspec cần **cả net9.0 + net10.0** DLL (Server pull Core.dll từ Server bin cả 2 TFM). nuget.exe có sẵn trong Package/.
- Verify nupkg: `unzip -p *.nupkg lib/net10.0/MegaForm.Core.dll | strings -el | grep '<literal>'`.

### Deploy/upgrade :5113 (PowerShell — ⚠️sandbox chặn `Remove-Item Packages\*` wildcard)
```powershell
$dest="E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1774"
Get-Process Oqtane.Server | ? { $_.Path -like "$dest*" } | Stop-Process -Force
Copy-Item "<...>\MegaForm.Oqtane.<ver>.nupkg" "$dest\Packages\" -Force   # KHÔNG xóa .log cũ (guard chặn wildcard)
Start-Process "$dest\Oqtane.Server.exe" -WorkingDirectory $dest -WindowStyle Hidden
# poll: SELECT MAX(Version) FROM ModuleDefinition; + GET http://localhost:5113/  (version↑ = swapped, nupkg consumed→.log)
```
- Upgrade swap DLL vì `ModuleInfo.Version` ↑. Clean-install từ pristine `Oqtane.Framework.10.1.0.Install (1).zip` (⚠️extract **Expand-Archive**, KHÔNG bash unzip — backslash path).

### QA browser (Playwright MCP)
- ⚠️MCP chrome hay khóa profile → kill: `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ?{$_.CommandLine -like '*ms-playwright-mcp*'} | %{Stop-Process $_.ProcessId -Force}` + xóa SingletonLock.
- Test JS-only nhanh KHÔNG cần repack: copy bundle → `$dest\wwwroot\Modules\MegaForm\js\` + trong browser `injectScript('...js?v='+Date.now())` rồi `MFSettings.open({moduleId:36})`.
- ⚠️Nếu `ModuleConfig/36`=403 → đã logout → /login host/abc@ABC1024.

---

## 5. QA CHECKLIST phiên sau
- [ ] TASK 1: Typography + Border-radius controls xuất hiện trong Settings tab "Theme & Layout"; đổi → Save → reload → render áp dụng + reopen đọc đúng (round-trip).
- [ ] FIX 404: mở builder/theme-designer trên :5113 → console KHÔNG còn 404 `builder/i18n/vi-VN.json`; i18n vi-VN load 200.
- [ ] FIX 400: preview form trong builder → console KHÔNG còn 400 `MegaFormSubmit/Post`; submit test 200/đúng route `/api/MegaForm/Submit/Post`.
- [ ] Regression: tabs Settings vẫn OK, Save luôn thấy; palette + field-spacing + double-border + FOUC vẫn tốt.
- [ ] Pack version mới + upgrade :5113 + verify version↑.
- [ ] Commit từng fix riêng (message rõ root-cause) + cập nhật memory/handoff.

---

## 6. Con trỏ nhanh (file:line)
- Settings tabs: `MegaForm.UI/src/view-designer/settings-popup.ts` — `rerender()` (~330 tabs), `buildThemeLayoutSection()` (817-1001), `sliderRow`(887), `radioRow`(910), `setLayoutVar`(811), `saveModuleStyle` call(2118).
- Theme-designer (nguồn control để copy): `MegaForm.UI/src/theme-designer/index.ts` — `setCssVar`(675), font extract(1762), preview srcdoc(1358-1392), apiBase(312).
- i18n 404: `MegaForm.UI/src/i18n/index.ts:308-333`.
- Submit 400: `MegaForm.UI/src/renderer/megaform-renderer.ts:1021-1022,2597,2599`; `src/renderer/index.ts:2994`.
- GetModuleStyle JsonElement (đừng revert): `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` `GetModuleStyle`+`StyleAsJsonElement`.
- Double-border fix: `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs:147-150`.
- FOUC per-panel CSS: `MegaForm.Oqtane.Client/Index.razor` (~543 khối `mfAdminCss switch`).

*Handoff này đủ để thực thi ngay. Deploy hiện tại 1.7.80 ổn định trên :5113.*
