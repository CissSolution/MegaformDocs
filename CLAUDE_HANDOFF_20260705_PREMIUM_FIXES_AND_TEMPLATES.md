# CLAUDE HANDOFF — 2026-07-05 (autonomous session while user away ~5h)

> **Deploy đang chạy:** MegaForm **1.7.85** trên site sạch **:5113** (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1774`, host/abc@ABC1024). Serving AssetVersion **20260705-B370**.
> Full context memory: `project_20260705_settings_controls_hideheader_formid7_ssr.md`.

## ✅ ĐÃ XONG + DEPLOY + VERIFY (1.7.81 → 1.7.85)
| Ver | Nội dung | Verify |
|---|---|---|
| 1.7.81 | Typography + Corner-radius → Settings; i18n-404 fallback; submit-400 apiBase normalize | ✅ live QA |
| 1.7.82 | "Hide Form Header" → Settings pane (SaveTheme `HideHeader` ×3 platforms) | ✅ round-trip |
| 1.7.83 | formid=7 premium multi-step **SSR parity** (empty body + stray Gửi first-paint) | ✅ pure-SSR (JS off) |
| 1.7.84 | **Date popup clip + icon**, **review summary fill**, **thank-you actions** | ✅ date verified visually |
| 1.7.85 | Carries thank-you `:not()` into shipped premium **templates** | ✅ in pkg + deployed |

### 1.7.84/85 chi tiết (3 lỗi premium user báo)
- **Date popup bị cắt** → `interactive.ts attachDatePopoverLift(root)`: MutationObserver trên `.is-open`, set INLINE `overflow:visible !important` lên ancestors (inline !important THẮNG template `.mfp{overflow:hidden!important}` spec 0,5,0). Áp cho `.mf-cal`+`.mf-dtp`. ✅`clippedBy:null`, calendar hiện đủ.
- **Icon lịch giữa field** → `megaform.css`: pin `.mf-cal .mf-date-icon{position:absolute!important;right:12px}` + `.mf-cal-value{padding-right:24px}` (đúng dù trigger flex hay block). ✅icon sát phải.
- **Summary trống** (ey/bg/fi) → `index.ts updatePremiumSummary` match mọi prefix `data-au/ey/bg/fi-summary` + Core `data-mf-summary-key`. ✅form 8 "Interests" hiện giá trị.
- **Thank-you/review buttons ẩn** → `.mf-premium-native-mode .mf-form-actions{display:none}` cũng ẩn `.mf-postsubmit-actions`/`.mf-review-actions` → thêm `:not(...)` ở canonical `megaform.css` **VÀ** per-template customCss (down-under/euro-youth/americana/bulgaria — script patch, 1.7.85).
- File: `MegaForm.UI/src/renderer/interactive.ts`, `.../renderer/index.ts`, `Assets/css/megaform.css` (canonical) → copied to Oqtane+Web wwwroot (Assets là superset, có rating-fix wwwroot thiếu). No C# change; Server/Core DLL tái dùng từ 1.7.83.

### QA harness (MCP browser CHẾT phiên này → drive headless trực tiếp)
- playwright cache: `C:\Users\Administrator\AppData\Local\npm-cache\_npx\9833c18b2d85bc59\node_modules\playwright` (require via createRequire) + `executablePath='…/ms-playwright/chromium-1223/chrome-win64/chrome.exe'` (bundled headless_shell version mismatch).
- Scripts trong scratchpad: `qa-datepop.mjs` (date), `qa-form8.mjs` (summary/submit), `qa-formid7-ssronly.mjs` (pure-SSR, JS-disabled + storageState cookie). Login `/login` #username/#password/button "Login" host/abc@ABC1024. Settings popup: inject `/Modules/MegaForm/js/megaform-settings-popup.js` → `window.MFSettings.open({moduleId:36})`.
- Forms trên :5113: **6** ('fe'), **7** (Classic Car Show), **8** (EuroYouth). `/?formid=N` (admin-gate, cần login host).

## ⚠️ CẦN QUYẾT ĐỊNH / ĐIỀU TRA (chưa làm — cẩn thận)
1. **DONEE ↔ shipped Templates ĐÃ PHÂN KỲ NẶNG + KHÔNG NHẤT QUÁN** — KHÔNG blind-sync (sẽ regress):
   - `down-under`: shipped **90KB** > DONEE 42KB (shipped LỚN hơn → DONEE cũ/thiếu).
   - `classic-americana`: DONEE 84KB > shipped 26KB; `wellness`: DONEE 142KB > shipped 29KB (DONEE mới hơn).
   - `euro-youth`: ~bằng; `event-rsvp`, `project-intake`: **identical**.
   - shipped có 9 tpl (thêm americana-journey/bulgaria/festa không có trong DONEE 6).
   - ⇒ **Cần user quyết**: mỗi template lấy bản nào? (DONEE hay shipped). Tôi chỉ patch thank-you `:not` SURGICAL trên shipped (không mất nội dung), KHÔNG copy DONEE đè shipped.
2. **form 8 submit "Server error: 200"** — response 200 nhưng client báo error (không hiện thank-you pane). Nghi do QA auto-fill data sai validation, CHƯA xác nhận là bug thật. Cần submit data hợp lệ để verify. formid=7 submit thì OK (200, đúng route).
3. **{{summary}} Core-driven** (user muốn "phải do Core tính toán") — hiện mới fix CLIENT (fill giá trị đúng cho form hiện có). Chưa convert template static review → `{{summary}}` (schema-driven, tự thêm row khi user thêm field). Machinery sẵn: Core `FormHtmlRenderer.BuildSummaryHtml`(417) + client `summary-html.ts` (⚠️MUST byte-parity) emit `.mf-summary-row[data-mf-summary-key]` inline-styled. Convert = thay block `<div class='xx-review'>…rows…</div>` bằng `{{summary}}` trong customHtml mỗi template; style `.mf-summary-row` nếu muốn khớp look. ⚠️form DB (6/7/8) đã có customHtml cũ → phải re-import/recreate để lấy bản mới.

## 📋 CÒN LẠI (user yêu cầu — chưa làm, plan sẵn)
- **✅ Template "Outback Station Stay Booking" ĐÃ TẠO (⚠️CHƯA render-verify):** `Samples/FormTemplates/Premium/DONEE/outback-station-stay-booking.json` + `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/outback-station-stay-booking.json`. Convert từ mock `4NewTemplateForms/megaform-template-classic-australiana.json` bằng script: (1) `type:"Input"`→`"Text"` (Input invalid); (2) inline dotted `{{field:step_x.stepSubtitle/heading/intro}}` → literal text (renderer chỉ hỗ trợ `{{field:key}}` không có dấu chấm); (3) fix hero URL → `/Modules/MegaForm/img/mock/outback-station-side.png` (đã copy ảnh 1.6MB vào Oqtane wwwroot img/mock); (4) DONEE structure (customHtml/customCss vào settings). 18 fields, 4 steps, `.mfp.mfp-classic-australiana-booking mfp-native-generated`, slug `classic-australiana-booking`. 20 field-token map đủ, 0 dotted còn lại, types hợp lệ.
  - ⚠️**CHƯA VERIFY RENDER**: harness `window.MegaFormRenderer.init({formId,schema})` KHÔNG dùng schema truyền vào — nó FETCH schema theo formId từ API → không test được bằng schema tùy ý. Phải tạo FORM thật (builder gallery hoặc REST `[HttpPost("Form")] SaveForm` — cần full entity + admin + module-binding) rồi `/?formid=N` QA.
  - ⚠️**RỦI RO cấu trúc**: mock dùng `.mfp-page[data-step]` + nav `data-nav`; renderer step-nav query `[data-mf-native-page]` + nav `data-mf-native-next/prev/submit`. DONEE classic-americana (WORKS as form7) KHÔNG có `.mfp-page`/`data-step` trong customHtml gốc — markers được thêm RUNTIME bởi premium-native-migration (`premium-native-migration.ts:230` key trên `data-step=` → xử lý). Nên Outback (có data-step) LẼ RA được migration xử lý, nhưng **chưa xác nhận**. Nếu render hỏng: cần thêm `data-mf-native-page="N"` vào mỗi `.mfp-page[data-step="N"]` + `data-mf-native-{prev,next,submit}` vào nav buttons (match form7 DB markup) HOẶC bỏ `mfp-native-generated` để migration chạy đầy đủ.
  - Chưa repack/deploy (template chưa verify → không ship bản hỏng). File đã ở source.
- **✅ Site Oqtane MỚI ĐÃ CÀI: :5114** `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1785`, DB `Oqtane_MegaForm_Fresh1785` (.\SQLEXPRESS Windows-auth), host/abc@ABC1024. Pristine Oqtane 10.1.0 → Expand-Archive → silent-install appsettings (Kestrel :5114, DefaultDBType SqlServer, DefaultConnection, Installation host creds; `Server=.\\SQLEXPRESS` viết bằng Write tool) → MegaForm **1.7.85** nuget-only (Packages\). Verified: site 200, Client DLL 1.7.85, wwwroot/Modules/MegaForm + megaform.css(DateIconFix) + 9 templates. InstallationId ghi = install OK.
  - **CÒN: set template trên các trang khác nhau** (chưa làm): tạo N page + MegaForm module mỗi page + form từ mỗi template. Recipe REST (memory `project_20260704_qa_pages_5112…`): login host → `X-XSRF-TOKEN-HEADER`; POST Page; POST Module cần `pageId`; tạo form từ template (builder gallery hoặc REST). Templates seed vào App_Data lúc first-run → có trong builder gallery.
- **Recreate forms + Visual QA từng step every form → submit**: mỗi form (6,7,8 + new) đi hết steps, chụp screenshot, đối chiếu mock `:3101`, fix logic/look. QA harness sẵn (scratchpad).
- **Package nuget với DONEE templates**: sau khi quyết #1 (DONEE vs shipped) → sync đúng bản → repack.

## ⚠️ COMMIT: DEFERRED
Cây làm việc intermingled với Codex (359 dirty; `renderer/index.ts` có 83 dòng pre-existing của Codex + của tôi). File của tôi phiên này: `interactive.ts`, `renderer/index.ts`, `Assets/css/megaform.css` + wwwroot copies, `AssetVersion.cs`(B370), `ModuleInfo.cs`(1.7.85), nuspec, DONEE + shipped templates (thank-you patch). C# 1.7.81-83 files (MegaFormController×3, RenderPage, FormHtmlRenderer, Index.razor, shared.ts, settings-popup.ts) — all-mine, an toàn commit riêng; `renderer/index.ts` intermingled → per-hunk staging. **Không blind `git add -A`.**

## Recipe pack/deploy (đã dùng)
- Bump `ModuleInfo.Version` (deploy gate) + `AssetVersion.cs`(chỉ khi đổi JS/CSS) + nuspec. Rebuild Client (ModuleInfo) [+Shared nếu AssetVersion đổi]; C# đổi → rebuild Server. `dotnet build …csproj -c Release`. Pack: `cd MegaForm.Oqtane.Package && ./nuget.exe pack MegaForm.Oqtane.nuspec -NoPackageAnalysis`. Deploy :5113: stop `Oqtane.Server.exe` (path `$dest*`) → `Copy-Item nupkg $dest\Packages\` (KHÔNG Remove wildcard) → relaunch → poll consumed+up. Verify `strings -el` (Select-String binary false-negative). megaform.css: sửa `Assets/css` (canonical, KHÔNG có src/styles/megaform.css) → `cp` sang Oqtane+Web wwwroot (vite sync SKIP megaform.css).
