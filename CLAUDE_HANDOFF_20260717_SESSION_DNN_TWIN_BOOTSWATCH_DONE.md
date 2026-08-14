# HANDOFF 2026-07-17 (p2) — PHIÊN LỚN HOÀN THÀNH: DNN source-picker twin + display-mode fix + queryKey>250 + Bootswatch From-page

Commit chính: **`5438235`** (10 file +511/−32, nhánh `feat/theme-designer-picker-wizard-gallery-1.7.45`, CHƯA push).
Nối tiếp `CLAUDE_HANDOFF_20260717_SOURCE_PICKER_DNN_AND_BOOTSWATCH.md` (owner giao 2 việc) + 2 việc owner giao GIỮA phiên (display-mode bug + module #510).

## ✅ 1. DNN source-picker twin [SourcePickerDNN v20260717-01] — SHIPPED + QA live megaclean (B404)
- **`DnnExternalRowMapStore.cs`** (MỚI): twin OqtaneExternalRowMapStore — `MF_ExternalRowMap` EnsureSchema
  on-first-use (SqlDataProvider dừng 01.06.32), UNIQUE(FormId,RowKeyHash), anchor insert qua RAW repo
  (chống đệ quy decorator), race → winner wins (SqlException 2601/2627).
- **`DnnServiceLocator`**: `SubmissionRepo` giờ = `ExternalSubmissionRepository` bọc raw adapter +
  DnnExternalBindingStore + rowmap + `ExternalTableQueryService(DnnConnectionRegistry)` + resolver
  (allowlist `IsAllowedExternalConnection` mirror DnnConnectionRegistry). Expose 4 props cho controller.
- **`SubmissionsController.List`**: param `source` + gate sql=admin-only (403) + 400 khi !sqlCapable +
  null queryKey + AsyncLocal scope + echo 4 field (lowercase, khớp dnn.ts). `Get`/`Print` dùng repo decorated.
- **QA live**: form 39 Store ⇄ `dbo.MFDemo_Store` — auto→json (id 4,3,2,1), sql→id ÂM (−1..−3), search
  Berlin→1, zzz→0, page sâu đúng; anon sql→403. UI toggle `mf-subs-source-sel` 2 chiều, SQL mode cột DB
  + 0 checkbox. Screenshot: `qa-b404-dnn-grid-{json,sql}.png` (repo root, untracked).
- **Perf QA (owner đổi 1-2M → 1.000 dòng)**: DNN form **47** ⇄ `dbo.MFPerf_BigTxn` (DNN10322_MegaClean DB),
  Oqtane :5125 form **13** ⇄ `LegacyErp_Demo.dbo.BigTxn` — cả 2: probe lần đầu ~1.1-1.3s (cache/process),
  sau đó 24-90ms; search indexed→1, "NEEDLE" trong Note→10, deep page OK. Bảng+form seed là đồ QA, xoá tuỳ ý.

## ✅ 2. Display-mode Dashboard⇄Fixed form (owner giao giữa phiên) [DnnModuleRole v20260717-01]
**Root cause KHÔNG phải MF_ModuleViewConfig**: popup gửi `moduleRole` nhưng DNN `ModuleConfig/Save`
**bỏ qua hoàn toàn** — không ghi `MegaForm_ModuleMode` (thứ FormView.ascx.cs render theo), Get cũng
không echo → popup luôn hiện "Fixed form" còn module kẹt dashboard. Fix:
- `Save`: đọc `moduleRole` CHỈ KHI key có trong body **và caller là admin** (SECURITY §3) → map
  `''→render / dashboard→admin_dashboard / myinbox→myinbox` → `UpdateModuleSetting`. Hỗ trợ
  **role-only save** khi formId=0 (unpin module dashboard chưa có form).
- `Get`: echo `moduleRole` (đọc `MegaForm_ModuleMode`).
- **QA đủ vòng module 507 (Home)**: popup hiện đúng "Form Dashboard" → đổi Fixed form → Save → form 46
  render (`/Home/view/form`); chiều ngược pin lại dashboard OK; **trạng thái cuối = Fixed form + form 46**.

## ✅ 3. Ba lỗi DNN 10.3 bắt được trong lúc QA (đều đã vá + verify)
1. **`ModuleController.GetModuleSettings(int)` bị DNN 10 XOÁ** → `MissingMethodException` lúc JIT
   (thoát mọi try/catch trong thân hàm) → `ModuleConfig/Get` 500 + **`ModuleStyle` 500 tiền sử** (vỡ popup).
   Vá 3 chỗ đọc qua `ModuleController.Instance.GetModule(id, Null.NullInteger, true).ModuleSettings`:
   `ReadModuleRole`, `ModuleStyleController.Get`, `DnnModuleSettingsService.GetSetting`. ⭐BẪY GHI NHỚ:
   API DNN "Scheduled removal in v10.0.0" trong warning CS0618 = ĐÃ XOÁ THẬT trên site 10.3.
2. **Module vừa drop (#510, owner repro): popup "Could not load module configuration"** —
   `ModuleConfig/Get` trả `config:null` khi chưa có row → client `normalizeModuleConfigResponse` trả null
   (Oqtane có fallback, DNN KHÔNG) [DnnFirstTimeConfig v20260717-01]: Get giờ trả config default tối thiểu
   (formId=0 + moduleRole echo). QA: popup 510 mở first-time setup, form select 11 options.
3. Bẫy trang nhiều module: 2 module cùng `id="mf-host-settings-open"` → 2 popup CHỒNG NHAU khi click
   (duplicate-id, chưa vá — chỉ ảnh hưởng trang có ≥2 module MegaForm; workaround QA:
   `MFSettings.open({moduleId:N})`). 🟡 backlog nhỏ.

## ✅ 4. queryKey>250 data-loss + bounded count [QueryKey250Fix + BoundedCount v20260717-01]
- `SubmissionListQuery.TrustedFetch` (server-set ONLY) → facade clamp 250 → **5000** khi trusted.
  Áp: Oqtane `ListSubmissions` (admin), bound-query prefetch (`ListSubmissionsWithBinding`, admin),
  **`Submissions/Export`** (trước đây "export toàn bộ" âm thầm chỉ 250 dòng!), DNN `List` (admin).
  **Anon public-queryKey GIỮ cap 250** (bounded-read rule 11 — anon = cap nghiêm nhất, chủ ý).
  ✅ Verified live DNN: form 47 seed 300 JSON rows → admin pageSize=2000 trả **300/300**.
- `EfSubmissionRepository.List` (Oqtane): COUNT cap 10001 → floor 10000 + `TotalIsBounded` qua
  `ExternalSourceContext` → pager "N+" (client đã ship từ B403). DNN sproc path chưa đổi count.
- 🟡 **Sargable search EAV: CHỦ ĐỘNG HOÃN** (đã cân nhắc kỹ): (a) swap `DataJson.Contains` sang EAV
  vẫn là `LIKE '%x%'` — không sargable hơn về bản chất; (b) EAV coverage phụ thuộc indexer
  **từng fail âm thầm** (memory 07-10) → search qua EAV có nguy cơ MẤT KẾT QUẢ im lặng; (c) FieldValue
  chứa snapshot JSON (label lẫn value) → đổi ngữ nghĩa match. Thiết kế đúng = fieldKey-scoped search
  param + flat index RAW value + verify indexer — việc riêng cho phiên sau.

## ✅ 5. Bootswatch "From page" [BootswatchBorrow v20260717-01] — SHIPPED :5125 + QA PASS
- `ThemeFirstPaintCssService` borrow map mở rộng từ 2 var (primary/btn-bg) → **full surface**, inject
  TRƯỚC alias expansion (lan sang --mfp-*/--au-*/--card...): `--mf-form-bg --mf-card-bg --mf-color-text
  --mf-text --mf-title-color --mf-label-color --mf-help-color --mf-text-muted --mf-input-bg
  --mf-input-color/fg/text --mf-input-border(-color) --mf-border --mf-input-muted-fg
  --mf-input-disabled-bg --mf-input-focus-border --mf-input-focus-ring`.
- Nguồn: BS5.3 vars (`--bs-body-bg/color, --bs-form-control-bg, --bs-border-color, --bs-secondary-color/bg,
  --bs-heading-color, --bs-focus-ring-color`) — **fallback CUỐI = đúng default megaform.css hiện tại**
  → skin không có var = pixel-identical như trước (regression-safe by construction).
- ⭐Phát hiện lúc QA: template premium đọc `var(--mf-card-bg,#fff)` + `var(--mf-text-muted,…)` INLINE —
  2 hook này KHÔNG có trong megaform.css lẫn alias builder → phải inject trực tiếp (đã làm).
- Guards giữ nguyên: `preservePremiumPalette`, `--mf-page-bg:transparent` sau alias, BuildScopedCss
  (NeutralizeStyleBreakout đường cũ), client TS không có nhánh borrow (server-only, đã grep lại).
- **QA :5125 `/private` form 12 (premium pure-grid, ĐÃ bật 2 cờ inherit)**: theme hồng-tím → card/input
  bg `#686dc3` + chữ trắng + border translucent (screenshot `qa-bootswatch-borrow-pink.png`); dark-sim
  Darkly (`--bs-body-bg:#222529` v.v.) → card `#222529`, input `#1a1d20` chữ sáng
  (`qa-bootswatch-borrow-dark.png`); form 10 (không bật) vẫn card TRẮNG (regression PASS).
- 🟡 CÒN: (a) QA trên theme Bootswatch THẬT cài vào Oqtane (mới sim var — hành vi giống hệt nhưng owner
  muốn nhìn tận mắt thì cài Darkly/Cyborg); (b) DNN skin hiện tại KHÔNG expose `--bs-*`
  (`--bs-body-bg` absent trên megaclean Home) → From page trên DNN chỉ ăn khi skin BS5.3;
  (c) chữ muted trên nền đậm màu có thể hơi mờ (dùng đúng secondary-color của theme — by design).

## ✅ 6. (owner repro sau phiên chính, 2 vòng) Drop-safe dock Settings link — CHỐT [DropSafeDockUrl v20260717-03]
Owner: drop module lần đầu → click Settings → văng ra `/Home/mfDropReady/639…/mfOpenSettings/1`, không gì mở.
**Root cause 3 tầng**: (1) link build `?mfDropReady=…&mfOpenSettings=1` → DNN friendly-URL provider 301
thành PATH SEGMENTS; (2) boot script chỉ đọc `location.search` (rỗng sau 301) → không mở, không dọn URL;
(3) trang nhiều module: script module ĐẦU dọn URL trước khi script module đích kịp đọc (race).
v02 (build thẳng segment URL) bị owner BÁC: flag nội bộ trên URL = không chuẩn DNN. **CHỐT v03 —
URL SẠCH 100%**: href = URL trang gốc, action chuyền qua `sessionStorage['mfDropAction']`
(`settings:<moduleId>` | `builder` | `dashboard`) set bằng inline `onclick` (inline handler chạy được
cả trong ajax fragment); boot script consume key (stash `window.__mfDropAction` chống race đa module,
`__mfDropActionDone` chống mở đôi) → mở settings đúng module / set hash `#mf-builder|#mf-dashboard`
(+ add class anti-FOUC vì twin parse-time đã chạy trước). Legacy URL cũ (query/segment) vẫn được đón
1 lần rồi scrub sạch bằng replaceState.
**Fix chỉ nằm trong `FormView.ascx` — CHƯA COMMIT (cùng file WIP drop-safe dock), ĐÃ copy site megaclean.**
✅ QA: `sessionStorage settings:514` → reload → popup TỰ MỞ first-time setup, URL = `/` sạch tuyệt đối
(`qa-dropdock-v3-settings-514.png`); action `dashboard` → `#mf-dashboard` overlay mở; legacy segment URL
→ dọn về `/Home`. ⚠️QA lưu ý: owner drop/xoá module liên tục trong lúc test (510→512→514) — target không
match module hiện hữu thì KHÔNG mở (đúng thiết kế). ⭐BẪY DNN ghi nhớ: flag nội bộ KHÔNG đi qua URL;
nếu buộc phải đi qua querystring thì phải chịu được dạng /key/value segment sau 301.

## Deploy state cuối phiên
- **DNN megaclean**: `MegaForm.DNN.dll + Core + Sdk` hot-swap (bin), `FormView.ascx` copy theo
  (markup drop-safe dock), **V bump `?v=20260717-B404`**, 2 bundle JS 07-16 copy sang site
  (`megaform-submissions.js`, `megaform-dashboard.js`). App pool đã recycle, site ấm.
- **:5125 Fresh1804**: Core + Server DLL net10 hot-swap site root, process restart (dotnet detached,
  đã chạy lại sau khi phát hiện site tắt). Login host session còn.
- ⚠️ **CHƯA COMMIT (giữ nguyên, KHÔNG phải của phiên này)**: `FormView.ascx/.ascx.cs` (drop-safe dock WIP
  của phiên/AI khác + V bump B404 của tôi nằm lẫn trong đó), `MegaForm.dnn` (bump 01.07.106),
  AiToolsController Codex-trộn, my-inbox/*, docs WIP... — như trước.
- ⚠️ **Drop-safe dock WIP đang CHẠY LIVE trên megaclean** (ship kèm DLL vì cùng assembly) — hoạt động
  (dock hiện trên module chưa cấu hình, không cần edit-mode per diff), NHƯNG flow drop THẬT
  (MoveModule) chưa QA lại sau DockOnDrop rollback — owner tự quyết giữ/bỏ.

## Việc phiên sau (ưu tiên đề xuất)
1. 🟠 Twin Web/Umbraco: source-picker (2 store + registration clone Startup.cs:81-108) + moduleRole
   (Web/Umbraco settings save có bỏ qua như DNN không? — RÀ) + TrustedFetch cho 2 controller còn lại.
2. 🟠 Sargable search đúng nghĩa (thiết kế ở §4) + queryKey>250 cho đường report modal verify UI thật.
3. 🟡 Cài 1 theme Bootswatch dark thật vào :5125 → pixel QA From page + screenshot cho owner.
4. 🟡 Vá duplicate `mf-host-settings-open` (trang nhiều module); retire CustomTableRows; GIF DocFx DNN.
5. Push nhánh feat (owner quyết).

## Login/site nhắc lại
- DNN `dnn10322_megaclean.ai` host/dnnhost — DB `DNN10322_MegaClean@WINDOWS-11\SQLEXPRESS`,
  site `E:\DNN_SITES\DNN10322_MegaClean\Website`, app pool `DNN10322_MegaClean`.
- :5125 `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1804`, start
  `Start-Process Oqtane.Server.exe -ArgumentList "--urls","http://localhost:5125"`, host/abc@ABC1024,
  DB `Oqtane_MegaForm_Fresh1804`; ERP tables ở `LegacyErp_Demo` (connectionKey `CustomerErp`).
