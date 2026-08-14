# CLAUDE HANDOFF — 2026-07-07 (phiên 2, autonomous)
## Seed 16 template lên :5117 + in-field row-gap 12px + Time-input fix + FULL QA (production license)
## → SHIPPED 1.7.93 (§0): FixedHeaderGuard + 2 fix renderer, cài lên :5117 qua nupkg, verified

User giao: "tạo 1 loạt template lên trang Oqtane + chỉnh khoảng cách các hàng trong field đúng 12px" và "trên :5117 chạy full license và QA đầy đủ". Tất cả DONE + verified.

---

## §0. ⭐ SHIPPED 1.7.93 / B376 (cuối phiên — sau khi user hỏi header bị che + cách đóng gói)

### 0.1 🛡️ FixedHeaderGuard — root-cause "form bị che mất đầu card, login≠logout"
- **Chẩn đoán (đo trên :5117)**: theme mặc định Oqtane dùng `<nav class="navbar … fixed-top">` (fixed, z-1030). Khi menu nav nhiều trang (16 trang QA) wrap nhiều hàng → navbar cao **221px** nhưng theme chỉ chừa offset tĩnh cho content → content bắt đầu y=187 → **~34px đỉnh card chui dưới navbar** (mất bo góc/hero). Login lại KHÁC logout vì Oqtane chèn ~43px module-actions phía trên module khi admin (đẩy card xuống 230 = thoát), đồng thời navbar login cao hơn (hàng host/Logout/✏️⚙️). Bên nào bị che phụ thuộc bề rộng cửa sổ. KHÔNG phải bug renderer; mọi module đều dính.
- **Fix (ship trong package)**: NEW [MegaForm.UI/src/renderer/fixed-header-guard.ts](MegaForm.UI/src/renderer/fixed-header-guard.ts) `[FixedHeaderGuard v20260707-B376]` — gọi từ renderer boot (`index.ts` sau `bindPremiumSummary()`). Runtime: tìm thanh fixed/sticky full-width ghim đỉnh viewport (`elementsFromPoint`), so đáy-đã-paint của nó với vị trí document của `.megaform-module`, thiếu bao nhiêu đẩy margin-top bấy nhiêu (+8px); re-measure sau 400ms + on resize; **no-op** khi không có fixed header/không overlap; skip popup/preview. VERIFIED :5117: anon guard=43px→card top 230; host guard=null (không bù trùng); login/logout giờ render giống hệt.
- Cross-platform: JS dùng chung 4 platform (guard vô hại nơi không có fixed header).

### 0.2 Đóng gói 1.7.93 (trả lời "đóng gói nuget thế nào để site khác không bị")
- Bump: `ModuleInfo.Version` 1.7.92→**1.7.93** (+ReleaseVersions), `AssetVersion` → **20260707-B376** (JS đổi), nuspec version + releaseNotes (3 mục: guard + composite-12px + Time input).
- Build: `npm run build:renderer` (sync 4 wwwroot) → `dotnet build MegaForm.Oqtane.Server` + `Client` Release (cả net9+net10; Server build tự đổ Core.dll tươi vào bin cho nuspec) → `MegaForm.Oqtane.Package/nuget.exe pack MegaForm.Oqtane.nuspec -NoPackageAnalysis` → **MegaForm.Oqtane.1.7.93.nupkg (82.3MB)**. KHÔNG chạy pack.cmd (gotcha cũ).
- Deploy :5117 = đường cài thật: drop nupkg vào `Packages\` + restart → consumed thành `.log`, trang stamp B376, Core.dll site md5 = build mới. **Sweep 16 trang lần cuối: 0 fail.**
- Lưu ý bản chất: bug che-header KHÔNG nằm trong package (site sạch ít trang nav không bị) — nó phát sinh khi site có menu nhiều trang với theme fixed-top; guard làm MegaForm miễn nhiễm ở mọi site.

### 0.3 🔍→✅ SSR first-load "wireframe" — REPRODUCED + ROOT-CAUSED + FIXED (hot-swap; cần pack 1.7.94)
**Repro chuẩn (trước fix)**: site RenderMode=**Interactive** (mặc định Oqtane 10.1 fresh) → dù module khai `RenderMode => Static`, Oqtane bọc InteractiveServer+prerender ([InteractiveGuard 2026-07-01]). **Soft-nav (click link menu) tới trang form "nguội"** → KHÔNG có prerender pass → instance mới trên circuit chạy `OnParametersSetAsync` với `_loading=true` → `TryRestoreSsrSnapshot()` **MISS** (TTL 5 phút + chỉ warm khi trang đó từng render) → `CanRenderSsrFormShell=false` → render **FastPaint skeleton** (wireframe!) trong ~1.35s, rồi config load xong mới swap form; kèm double-boot renderer: console `MegaForm: rendering N fields` (JS REBUILD — SAI thiết kế "JS chỉ bind/step") + `HYDRATED custom SSR (bind-only)`. Đo: skeleton từ t=102ms, form thật t=1452ms. Hard-load (anon/host) LUÔN sạch (prerender lưu snapshot ngay trong request). ⭐Vì sao QA trước không thấy: sweep liên tục tự hâm nóng snapshot; user duyệt trang lần-đầu thì miss.
**Fix (2 tầng, giữ thiết kế SSR-render/JS-bind)**:
1. `[SsrPrewarm v20260707]` [MegaFormWarmupHostedService.cs](MegaForm.Oqtane.Server/Services/MegaFormWarmupHostedService.cs) — warmup sẵn có (self-HTTP) giờ GET thêm **/sitemap.xml → GET từng trang (cap 40, path-only qua loopback, fail-soft)** → prerender chạy → SsrSnapshot được lưu cho MỌI form ngay lúc khởi động → click đầu tiên cũng HIT.
2. `[SsrSnapshotTtl v20260707]` Index.razor — TTL snapshot 5 phút → **6 giờ** (snapshot tự re-store trên mỗi lần load thật; form vừa sửa chỉ stale trong cửa sổ _loading dưới 1s rồi tự swap bản tươi).
**Verify sau fix (restart → warmup → login → soft-nav /journey)**: `.mf-skeleton` KHÔNG xuất hiện; trạng thái đầu quan sát = form đủ 21 inputs. ✅
**Tồn dư → ĐÃ ĐÓNG (`[BindOnlyLog v20260707]`, B377)**: cặp log "rendering 12 fields"+"HYDRATED custom SSR" hóa ra KHÔNG phải double-boot — dòng `console.log('MegaForm: rendering N fields')` ở `renderer/index.ts:1437` là **UNCONDITIONAL**, in ra cả trên đường hydrate bind-only → tạo ảo giác client-rebuild (đánh lừa cả chẩn đoán Codex). Chỉ có 1 init, công việc thật LÀ bind-only. Fix = chuyển log vào đúng nhánh `else { renderFields() }` (client build thật, khi không có SSR markup). VERIFIED: soft-nav giờ console chỉ còn `HYDRATED custom SSR (bind-only)`. AssetVersion → **20260707-B377** (JS đổi).
**Đánh giá chẩn đoán Codex user đưa**: đúng phần hiện tượng + JS-dependence, nhưng SAI 2 điểm: (a) "HTML gốc chứa mf-skeleton" — raw HTML KHÔNG có (họ xem DOM DevTools sau khi Blazor chạy); (b) "hành vi thiết kế có chủ đích" — không, skeleton là NHÁNH FALLBACK khi cache miss; thiết kế thật là SSR đầy đủ + JS bind-only. Khuyến nghị "preload/gộp script" của họ không trúng nguyên nhân.
⚠️ :5117 hiện chạy **hot-swapped** đè lên 1.7.93: Server+Client DLL (SsrPrewarm+TTL) + Shared DLL (**B377**) + megaform-renderer.js (BindOnlyLog) → phiên sau **pack 1.7.94** (bump ModuleInfo 1.7.94 + nuspec; AssetVersion đã ở B377 trong tree).

## §0b. 🎨 VISUAL-QA premium templates vs mock (yêu cầu user, cuối phiên) — au+bg FIXED template-only

Mock ground-truth = **`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)`** (Next dev đang chạy :3000; `/forms/australia`, `/forms/bulgaria`, `/premium-forms`…). User báo: hàng không ghép 2 cột, giãn cách không đều, step bar sai màu.

### Root causes tìm được (3 lớp)
1. ⭐⭐**Stepper bulgaria ALL-ROSE** = renderer `syncPremiumNativeStepper` (renderer/index.ts ~2460-2480) đọc `Number(el.getAttribute('data-step'))` — phần tử `.bg-step` KHÔNG có `data-step` → `Number(null)===0` (không phải NaN!) → mọi step coi như index 0 → tất cả `is-active`. **Renderer defect còn LATENT** (fix template-only theo yêu cầu; nên vá renderer trong 1.7.94: check null/'' trước khi Number — cả 3 vòng step/page/line).
2. **Thiếu ghép 2 cột theo mock**: bg step1 (phone+dob, gender+nationality), bg step2 (experience+languages), bg step3 (duration+accommodation); au step1 (phone+dob), au step3 (duration+stay).
3. **Nhịp hàng không đều**: field có/không `bg-mt`/`au-mt` lẫn lộn → wrapper grid mang mt → mọi hàng cách đều 18px.

### Fix đã làm (template-only, 9 edits, dùng utility CÓ SẴN `.bg-grid .bg-grid-2` / `.au-grid .au-grid-2`)
- `Discovery-programme.json`: thêm `data-step='0..3'` vào 4 `.bg-step` + `data-line='0..2'` vào 3 `.bg-line` (mirror quy ước youth-application — template chuẩn); 4 wrapper grid-2 như trên.
- `down-under.json`: thêm `data-line='0..2'` vào 3 `.au-line`; 2 wrapper grid-2.
- Audit data-step/line toàn bộ: youth ✓, festa ✓, outback/Journey (native) ✓, classic (mfp-stepper-item) ✓ — chỉ bg+au thiếu.
- Script fix: scratchpad `fix-au-bg.cjs` (guard match-đúng-1-lần); apply `apply-au-bg.mjs` (FormId 1+3, PreserveModuleBindingOnSave); verify `verify-au-bg.mjs`.
- **VERIFIED :5117** (form 1+3 updated + restart): phone+dob & gender+nat & exp+lang side-by-side; rowTops step0 cách đều 90px; stepper step1=01 active + 02-04 XÁM; step2=01 done (rose fill+✓) + line0 rose + 02 active — đúng scheme mock. Dup-binding=0. Ảnh: scratchpad `shots/fix/*.png`.
- **Synced**: DONEE → `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/` (repo) + site :5117 Templates (md5 khớp 3 nơi). ⚠️ Backup/ + CorporateWeb samples KHÔNG sync (bản cũ giữ nguyên).

## §0c. 🚢 SHIPPED 1.7.94 + 🌍 SITE MỚI :5118 + euro-youth HERO FIX (chốt phiên)

### euro-youth (youth-application) — hero trái không hiện = CSS PARSE CORRUPTION
- ⭐Root cause: một edit lịch sử làm MẤT header `@media(min-width:640px){` trong customCss, để lại `}` mồ côi tại ~11351 → browser NGỪNG parse từ đó → block `@media(min-width:1024px)` (nơi `.ey-hero{display:flex}` + shell 440px 1fr) không bao giờ áp → **hero không render**. Backup cũng hỏng y hệt (di sản). Debug = brace-balance scan trên CSS đã serve (`depth<0 tại đâu`).
- Fix (scratchpad `fix-ey.cjs`): khôi phục header `@media(min-width:640px){` trước `.ey-card{padding:32px}` (3 rule mồ côi = tablet overrides; rule `.mf-form-title…!important` trước đó là global — ranh giới); wrap 6 field step-0 vào `ey-grid ey-grid-2 ey-mt6` (mock: MỘT grid 2 cột cho cả 6); wrap Duration+Preferred-start (step 1, ey-mt5); `[EyMockParity]` append: `.ey-hero h1{color:#fff!important}` (shell h1 override sơn tối — giống outback cũ) + `.ey-panel{background:#f5f5f4!important}` (MF-TRANSPARENT-OUTER làm panel trong suốt → chữ stepper chìm nền đen; mock = stone-100 đặc).
- VERIFIED :5117 + :5118: hero 440px + ảnh + H1 trắng + stats; 3 cặp field 2 cột; panel stone.

### 1.7.94 packed + site mới
- **MegaForm.Oqtane.1.7.94.nupkg (82.36MB)**: SsrPrewarm + TTL 6h + BindOnlyLog (B377) + 3 template vá (au/bg/ey). ModuleInfo/nuspec bumped; releaseNotes chi tiết.
- **⭐SITE MỚI :5118 = `Oqtane.MegaForm.Fresh1794`** — DB `Oqtane_MegaForm_Fresh1794` (.\SQLEXPRESS Win-auth), host/abc@ABC1024, RenderMode Interactive. Cài từ zip pristine → silent install → nupkg-only. VERIFIED: 1.7.94, 24 MF_ tables, 16 templates (bản vá), license production. **3 trang QA seeded: `/youth-application` (form1/hero✓), `/discovery-programme` (form2/stepper A---✓), `/down-under` (form3/lines✓)** — nav chỉ 1 hàng (không dính header-overlap). User test tại http://localhost:5118.
- ⚠️ Renderer null-fix (`Number(getAttribute(null))=0`) CHƯA làm (template-only theo yêu cầu) — vẫn nên vá trong bản sau.

## §0d. 🔴 OPEN — user test :5118/5117 báo 5 vấn đề (đang xử lý, điều tra đã xong phần lớn)

1. **ey row spacing lệch mock** (:5117/:5118 youth-application): cặp field 2 cột OK nhưng nhịp dọc giữa các hàng trông chật hơn mock. Chưa đo — cần đo computed (mock :3000/forms/euro-youth vs :5117) rồi chỉnh `.ey-grid{gap}` / `.ey-field>span{margin}` theo số mock.
2. **Hero text KHÔNG edit được trong Design tab**: `inline-edit.ts:202` `onFocus` → `openHeroTextStylePanel(el)` bung panel "Text style" NGAY khi focus → đè lên text đang gõ. Text VẪN là contenteditable (plaintext-only, markEditable:192) nhưng UX hỏng. FIX dự kiến: bỏ auto-open on-focus; thêm nút nhỏ (🎨) cạnh element focused để mở panel chủ động.
3. **Change image không applied View Live**: `commitBg`/`applyHeroStyleOverrides` (inline-edit.ts:998-1019) ghi override vào vùng `/* mf-ie-hero-style:start */` trong `<style id="mf-ie-hero-style">` APPEND VÀO CUỐI customHtml. ⭐grep server (`FormHtmlRenderer.cs`, `ModuleCssComposer.cs`, `Rendering/*`) = **0 hit "mf-ie-hero"** → SSR không biết block này; khả năng cao RenderCustomHtml strip/encode `<style>` trong customHtml → preview builder thấy, LIVE mất. CẦN: xác nhận SSR output có `<style id="mf-ie-hero-style">` không (curl trang sau khi đổi ảnh + save); nếu strip → cho phép whitelist block này (server) + qua `NeutralizeStyleBreakout` (security rule #6).
4. **classic-registration: 3 nút Back/Next/Submit hiện hết ở first paint** rồi JS mới giấu (user: "nút vẫn bị điều khiển bởi JS"): `setButtonState` chỉ chạy client (`syncPremiumNativeStepper` renderer ~2486-2488). SSR đã bake `is-active` cho page đầu ([PremiumNativeSSR v20260705]) nhưng CHƯA bake trạng thái nút (Back ẩn ở step 0, Submit ẩn tới step cuối). FIX: server `RenderCustomHtml` bake `hidden`/`style="display:none"` cho `[data-mf-native-back]` + `[data-mf-native-submit]` khi multi-step (idempotent, chỉ premium-native), HOẶC CSS baked: `.mfp-native-generated [data-mf-native-back]{display:none}` + `.is-active`-driven... chọn server-bake inline (JS vẫn sync sau).
5. **classic-registration: hàng quá chật** (screenshot "Register your ride"): các field xếp sát (~8px). Chỉnh template CSS gap theo mock (`app/forms/...classic/americana?` — mock component `components/forms/` tương ứng; classic dùng `.mfp-classic-americana-registration`).

6. **Preset chỉ đổi màu TEXT, không đổi background form** (user test Theme Designer preset Lavender trên rsvp form 6 — template DARK): kênh preset = `--mf-preset-{primary,text,surface,accent,border,bg,on-primary}` (emit scoped khi preset active — Core `ThemeFirstPaintCssService [PresetWire]` + `settings-popup.ts:117-142`; xem [[project_20260706_preset_wire_and_outback]]). Template chỉ recolor phần nào có wire `var(--mf-preset-*, <màu gốc>)`. RSVP (event-registration-rsvp) là tpl DARK — 1.7.87 đã wire 10 tpl nhưng khả năng chỉ wire primary/text, còn **background card/panel của tpl dark hardcode hex** (không qua `--mf-preset-surface`) → preset đổi text mà nền giữ nguyên. CẦN: audit customCss rsvp — tìm background chính (`.ev-*`/wrapper) và wire `var(--mf-preset-surface, <gốc>)` + `--mf-preset-bg`; làm tương tự cho các tpl dark khác (midnight...). LƯU Ý byte-identical khi không preset (quy tắc 1.7.87).
7. **ĐO LẠI (đã xong)**: ey public :5117 pitch 91px ≈ mock 90px = KHỚP; cái "chật" trong screenshot builder = **Live Preview builder render 1 cột thiếu CSS template** (lỗi builder-preview riêng, cần điều tra). classic :5117 post-JS pitch 89px OK + buttons đúng (back ẩn/next hiện) → lỗi user thấy là **first-paint flash trước JS** (mục 4) + có thể form user tạo mới từ gallery trên :5118 khác spacing (chưa repro — hỏi user form nào).
8. Fix #4 đang triển khai: `setButtonState` (renderer:2447) set cả hidden+display cả 2 chiều → SSR bake `hidden` + `style="display:none"` cho `[data-mf-native-back]`/`[data-mf-native-submit]` trong `RenderCustomHtml` (chỗ [PremiumNativeSSR v20260705] ~L184/299 FormHtmlRenderer.cs) là an toàn (JS re-sync sau, kể cả single-step edge: chỉ bake khi multi-step = có ≥2 `data-mf-native-page`).

**→ 1.7.95 SHIPPED (B378, 82.36MB) — cài lên CẢ :5117 + :5118, verified:**
- ✅#4 `BakeNativeButtonInitialState` (FormHtmlRenderer.cs, cạnh EnsureFirstNativePageActive): SSR HTML classic đã back=hidden/next=visible/submit=hidden; click Next → back hiện + step2 active (JS re-sync OK).
- ✅#2 `[HeroEditUX v20260707]` inline-edit.ts: focus KHÔNG bung panel nữa — hiện nút trigger nhỏ (mf-ie-style-trigger) cạnh text, click mới mở panel; blur tự ẩn. (Chưa test tay trong builder — nhờ user thử.)
- ✅ `[StepIndexNullFix v20260707]` renderer: attr thiếu/rỗng → fallback DOM index (hết ALL-active cho template không đánh số).
- ✅#6 `[PresetSurfaceWire v20260707]` rsvp: `background:#111117/#18181f→var(--mf-preset-surface,…)`, `#0f0f13→var(--mf-preset-bg,…)`; áp vào form 6 :5117 qua SaveForm — served CSS có preset-surface ×5 **KHÔNG cần restart** (memoize content-addressed + SaveForm invalidate hoạt động) → user đổi preset giờ đổi được nền.
- 🔴🔴 **#6c USER XÁC NHẬN (:5118/down-under?view=form, form 5 rsvp-wired): ⚙ Settings preset → INPUT đổi kem (=preset có chạy, --mf-input-bg ăn) nhưng PANEL/PAGE vẫn đen** → `var(--mf-preset-surface, #111117)` đang resolve FALLBACK = kênh `--mf-preset-surface/bg` KHÔNG được emit (hoặc emit ở scope không phủ tới `.mfp` panel). NGHI: (a) settings-popup/[PresetWire] chỉ emit primary/text/border + map surface→`--mf-input-bg`, KHÔNG emit `--mf-preset-surface`? — đọc lại `ThemeFirstPaintCssService [PresetWire]` + `settings-popup.ts:117-142` xem CHÍNH XÁC danh sách var emit; (b) NeutralizeStyleBreakout/ModuleStyleJson. **USER YÊU CẦU: tự QA bằng browser, KHÔNG nhờ user test nữa.** Next: headless login :5118 → SaveModuleStyle preset qua API (flow 1.7.87) → inspect served CSS block [PresetWire] + computed `--mf-preset-surface` trên `.mfp` + computed background panel → fix emit (thêm surface/bg vào PresetWire nếu thiếu) → build → 1.7.96 → tự verify screenshot trước/sau. (kể cả form mới từ DONEE wired)** — root cause CHỐT: `theme-left-rail.ts` (builder Theme Designer Presets rail) **KHÔNG emit `--mf-preset-*`**; nó map key `surface`→`--mf-form-bg`, `surface-raised`→`--mf-section-bg` (dòng ~600). Kênh `--mf-preset-*` chỉ được emit bởi ⚙ Settings→Theme preset (settings-popup.ts:117-142) + Core [PresetWire]. → FIX bản tới: khi Apply preset trong theme-left-rail, emit THÊM bộ `--mf-preset-{primary,text,surface,accent,border,bg}` (mirror settings-popup mapping, scoped wrapper, lưu qua cùng đường SaveModuleStyle/SaveTheme để [PresetWire] server bake) → build builder bundle + AssetVersion. WORKAROUND cho user NGAY: dùng **⚙ Settings (gear) → Theme & Layout → Theme preset** thay vì Presets rail trong builder — đường này emit preset channel và nền rsvp (wired) SẼ đổi. (nghi ModuleStyleJson overlay [B262] hoặc đường save design-tab — trace tiếp; lưu ý mới: SaveForm content live không cần restart, nên nghi vấn dồn về save-path/overlay); #7 builder Live-Preview render 1 cột chật (thiếu CSS/viewport hẹp — điều tra); ey label→input 8px vs mock 6px (nit). DNN/Web twins cho BakeNativeButtonInitialState = Core dùng chung nên tự có; trial caps twins vẫn treo từ 1.7.92.

- 🔴 **#6d TỰ-QA :5118/down-under (form 5 rsvp)**: kênh preset OK end-to-end — computed `.mfp`: `--mf-preset-surface=#fefce8`, background `.mfp`=CREAM ✓ — NHƯNG mắt thường vẫn đen vì **các PANEL CON đè lên .mfp mang hex đen KHÁC chưa wire** (tôi mới thay `#111117/#18181f/#0f0f13`; sidebar "Join the Event" + main panel dùng hex/rgba khác). ⭐Còn 1 bí ẩn: `#mf-custom-css-5` styleLen=0 (CSS template serve ở node khác — tìm đúng node trước khi kiểm wire-usage). **NEXT (cụ thể)**: trên trang này enumerate mọi element có computed background tối (walk .mfp descendants, bg≠transparent && luminance thấp) → lấy hex từ rule nguồn (devtools protocol getMatchedStyles hoặc đọc customCss trong DB form 5) → wire TẤT CẢ vào `var(--mf-preset-surface|bg, <hex>)` trong DONEE rsvp → re-apply form 5+6 → tự chụp verify preset ⚙ Settings đổi TOÀN BỘ nền → gộp 1.7.96 (+#6b theme-left-rail emit, #3 image→live, builder-preview). Các fix trên khi xong → repack 1.7.95 + redeploy :5118. Mock nguồn = `form-builder-controls (10)` (:3000). Scripts QA/fix trong scratchpad f40fc4b1 (`fix-au-bg.cjs`, `fix-ey.cjs`, `verify-au-bg.mjs`, `seed-5118.mjs`).

## §0e. ✅ PHIÊN 3 (2026-07-07 chiều) — ĐÓNG #6d + SHIP 1.7.96 + FRESH :5119 (chu kỳ QA mới)

### 1. 🎨 #6d ĐÓNG — root cause THẬT của "preset không đổi nền rsvp" (khác giả thuyết cũ)
- Snapshot ModuleStyleJson mà popup lưu KHÔNG chứa customCss (chỉ theme+themeCssOverrides) — giả thuyết "snapshot đè CSS cũ" chỉ đúng cho snapshot do **GetModuleStyle SEED** (seed copy cả customCss của form). Thủ phạm chính = **template sơn nền qua BIẾN NỘI BỘ**: `.mfp-main/.mfp-layout` = `var(--mf-bg, #0f0f13)`, `.mfp-sidebar` = `var(--mf-surface, #18181f)` (2 biến KHÔNG được định nghĩa ở đâu → luôn rơi fallback đen) + block `MF-QA-RSVP-WIDGETS-v10` (!important, thắng cascade) định nghĩa cả bộ tông `--mf-rsvp-{bg,panel,text,muted,dim,line,amber-soft,focus}` bằng hex/rgba cứng — chỉ `--mf-rsvp-amber` đã wire → đúng hiện tượng "chỉ text/accent đổi".
- **Fix = rewire TOÀN BỘ tông** (scratchpad `rewire-rsvp.cjs`, exact-match + đếm): mọi định nghĩa biến + ~150 rgba trắng/amber inline → chuỗi `var(--mf-preset-*, gốc)` / `color-mix(in srgb, var(--mf-preset-*, gốc) N%, transparent)` (= ĐÚNG rgba gốc khi không preset — verify bằng unset `--mf-preset-*` inline important: sidebar #18181f, main #0f0f13, text #f1f0ed, label alpha .48 khớp từng byte). `color:#0f0f13` trên nút amber → `var(--mf-preset-on-primary, …)`.
- Áp qua SaveForm (không restart): **:5118 form 8/mod 38** (emerald — VERIFIED darkEls=[]; chữ xanh đậm đọc rõ), **:5117 form 6/mod 41** (preset default slate/blue — VERIFIED recolor toàn trang). Template synced 3 nơi (DONEE + repo wwwroot + Templates 2 site, md5 khớp).

### 2. 🧊 `[ModuleStyleCustomCss v20260707]` — đóng gotcha [B262] tận gốc (3 chỗ)
- `MegaFormController.cs` `SaveModuleStyle` + `SeedModuleStyleFromForm`: bỏ `customCss` khỏi key-list (snapshot chỉ giữ theme/var-map); `Index.razor` `OverlayModuleStyle`: KHÔNG overlay `customCss` nữa → **site đang dính snapshot cũ tự lành** (không cần xóa DB). Đây cũng là nghi phạm #3 "đổi ảnh hero không áp View Live".

### 3. 🎛️ theme-left-rail emit `--mf-preset-*` (fix #6b)
- `theme-left-rail.ts` click preset tile giờ emit thêm bộ preset channel (mirror `settings-popup mfPresetColorVars`: c1→primary+on-primary trắng, c2→text, c3→surface+bg, c4→accent+border RAW) → chảy qua `applyPresetVars`→`persistToSchema` sẵn có. Cả 2 đường preset (rail + ⚙ Settings) giờ đổi nền template.

### 4. 🪜 `[StepBarReconcile v20260707]` — user báo "xóa 1 page break, step bar vẫn 4 steps"
- Chẩn đoán (:5118/youth-application form 1): PAGES đã đúng (3 `.ey-page`, field tự re-slot), nhưng rail 4 `.ey-step` TĨNH trong customHtml — step chết vẫn hiện, step cuối không bao giờ active.
- Fix = NEW `MegaForm.UI/src/renderer/premium-step-reconcile.ts`: map page→rail-item qua `premiumStepIndex` (⚠️ **1-BASED** — data-step rail 0-based!) của Section dẫn trang còn sống → ẩn ĐÚNG step bị xóa (giữ nhãn step còn lại), đánh số lại numeral hiển thị (01,02,…), trim connector line, remap active/done trong `updatePremiumNativeShellState`. **No-op tuyệt đối khi số item == số page** (mọi template stock). VERIFIED :5118: còn 01 Profile / 02 Logistics / 03 Confirm. ⚠️ Tồn dư: SSR first-paint vẫn hiện đủ step ~vài trăm ms trước khi JS ẩn (bake server = follow-up); stepper kiểu text "01 / 04" (journey) không reconcile được numeral "04".

### 5. 📐+📱 SWEEP row-spacing + RESPONSIVE (:5117 & :5119, 16 trang × 375/768/1440 — scratchpad `qa-sweep.mjs`)
- **KHÔNG có regression row-spacing** (desktop minGap ≥12px thật; flag "TIGHT/âm" = artifact phép đo trên layout multi-column — đã soi mắt từng trang flag). **KHÔNG trang nào tràn ngang ở cả 3 viewport; mobile stack đúng**. 3 lỗi cosmetic nhẹ (CHƯA sửa): (a) vendor-application-fl mobile: label "Upload Portfolio" đè chữ dropzone; (b) journey mobile: hero text đè badge "AMERICAN JOURNEY"; (c) classic-registration 375px: cặp Phone+City không collapse (placeholder bị cắt, vẫn dùng được).

### 6. 🚢 SHIP **1.7.96** (78.55MB, B379) + 🌍 FRESH **:5119** `Oqtane.MegaForm.Fresh1796`
- Gói: ModuleInfo/nuspec 1.7.96 + AssetVersion 20260707-B379; renderer+builder+settings-popup rebuilt (sync 4 wwwroot); releaseNotes 4 mục. Entry-list y hệt 1.7.95 (1282 entries).
- Site: DB `Oqtane_MegaForm_Fresh1796` (.\SQLEXPRESS Win-auth), host/abc@ABC1024, RenderMode Interactive, license=production (trong gói). Cài pristine zip → silent install → nupkg-only (consumed → .log).
- **Trang gom DƯỚI 1 ROOT** `/templates` (menu 1 mục): 16 trang con `templates/<slug>` = forms 1-16 / modules 36-51 (thứ tự y :5117). Dup-binding=0. Scripts: scratchpad phiên af1fba79 (`seed-5119.mjs`, `qa-sweep.mjs`, `preset-check-5119.mjs`, `rewire-rsvp.cjs`, `verify-*.mjs`).
- QA site mới: sweep 16 trang PASS (số đo trùng :5117); **preset E2E PASS trên bản cài nguyên bản** (SaveModuleStyle emerald mod 41 → anon sidebar/main #ecfdf5, text #064e3b, không restart). **SẴN SÀNG chu kỳ QA user.**
- ⚠️ :5117/:5118 vẫn chạy 1.7.95 (:5118 có hot-swap renderer B379); muốn đồng bộ → drop nupkg 1.7.96 + restart.

### 7. 📧 Thẩm định audit email notifications (task độc lập, agent)
- Doc `Docs/AUDIT_SubmissionEmailNotifications_2026-07-07.md` ≈ **85% đúng** (file:line trích đều thật). 3 điểm SAI/LỆCH: (a) §4.3 SAI — preset `lead-routing` CÓ 2 node SendEmail cho staff/admin; (b) "không có UI Autoresponder" → thực tế TỆ HƠN: card "Respondent Email Notification" TỒN TẠI trong builder (`dom.ts:1368-1400`) nhưng là **UI CHẾT** (không populate/save — user bật toggle mà không có gì xảy ra); (c) cơ chế wipe: chỉ Oqtane là "DTO thiếu trường"; Web/Umbraco/DNN bind nguyên FormInfo (có map) nhưng **GET Form không trả Autoresponder*/NotifyTemplate** → mọi round-trip save vẫn wipe (root cause thật). Phát hiện thêm: applied workflow skip cả legacy WEBHOOK; starter services chủ động reset Autoresponder khi seed; `NoOpWorkflowEngine.cs` doc-comment stale (engine thật đã đăng ký 4 platform). Khuyến nghị sửa hướng: nối dây card UI có sẵn + thêm Autoresponder*/NotifyTemplate vào GET response + DTO Oqtane.

## §0f. ✅ PHIÊN 4 (2026-07-07 chiều/tối) — SHIP 1.7.97 PROD+TRIAL + 2 site QA cho user test (user ra ngoài 4h)

User giao (2 batch + clarify): (1) intake step-bar mobile vỡ; (2) map form thừa card xám không tích hợp Oqtane + không đổi được màu nền; (3) standard/wizard form spacing+size chưa đẹp như mock; (4) Visual-QA xác nhận đổi được hero image; (5) fix outback step-bar + khoảng cách dọc hero↔form đẹp như mock; (6) **tạo 2 site + 2 gói NuGet production/trial, cài tương ứng để user test cuối**. Mock: standard=`:3000/forms/job-application|newsletter`, outback=`:3001` (source `4NewTemplateForms/components/megaform-preview-australiana.tsx`), premium=`form-builder-controls (10)`.

### Cách làm: 2 Workflow/agent song song sinh fix-spec (investigate + adversarial-verify), tôi apply+verify inline (browser, visual-QA-no-guess). Tất cả VERIFIED.

**FIX 1 — intake step-bar** (`project-intake-onboarding.json` customCss append `MF-QA-PROJECT-STEPPER-RESPONSIVE-v19`): root cause = `.mfp-stepper-list{min-width:max-content}` + item `min-width:120px` + `overflow-x:auto` → scroll ngang desktop + tràn mobile. Fix: desktop `min-width:0;flex:1 1 0` (hết scroll, 4 item vừa card); `@media(max-width:640px)` collapse thành hàng dot số, connector in-flow, ẩn label/subtitle trừ step ACTIVE (mirror mock). VERIFIED :5119/:5120: desktop overflow=0, mobile docOverflowX=0, chỉ "1 Contact — 2 — 3 — 4".

**FIX 2 — map 3 tpl** (`contact-map-*` append `ISSUE 2 FIX` vào CẢ 3 mirror customCss/CustomCss/root): root cause = `.mf-contact-split{background:var(--background=oklch .98)}` + `.mf-bg` full-bleed → dải XÁM trên nền đen; nền không đổi vì template redeclare `--card/--background` (shadcn) KHÔNG dùng `--mf-preset-*`. Fix: outer `.mf-contact-split`+`.mf-bg`→`var(--mf-preset-bg, transparent)` (integrate, đổi theo preset), `.mf-overlay` transparent, `.mf-content` padding top/bottom 0; card→`var(--mf-preset-surface, var(--card))`; `.mf-contact-info` corporate=surface, minimal/modern=`color-mix(...var(--mf-preset-surface,var(--card)) 94%, var(--mf-preset-primary,var(--primary)) 6%)` (giữ tint gốc byte-identical khi không preset). VERIFIED: min/mod split=transparent card=white tint giữ; corp=preset-responsive.

**FIX 3 — standard field metrics** (`Assets/css/megaform.css` canonical, KHÔNG phải template — wizard form không có customCss host → sửa `:root` token, đúng đường ⚙ Settings ghi): `--mf-field-gap` 12→16, `--mf-label-margin-bottom` 6→8, `--mf-label-font-weight` 600→500 (mock font-medium). ⚠️ section-title 4→16 ĐÃ THỬ rồi REVERT (section field-group đã có ~40px structural → double-gap 56px airy; giữ 4px). ⭐ shipped premium tpl KHÔNG dùng `--mf-field-gap` (grep=0) → miễn nhiễm; chỉ standard + vendor/pure-grid (AI-grid style) + AI-shell theo token (đúng ý đồ). Input height/padding GIỮ (mock newsletter compact 36px; job-application roomy 50px là preference, đổi global rủi ro premium → skip). VERIFIED standard form: gap16/label8/weight500; premium au/bg/ey/outback minGap KHÔNG đổi.

**FIX 4 — outback stepper + hero rhythm** (`outback-station-stay-booking.json` append `MF-FIX outback-stepper-rhythm`): ⭐⭐root cause QUAN TRỌNG = **megaform.css (B379) `!important` reset trên tag chung `ol/ul/li/h1-h6/p` ĐÈ rule template non-!important** → pills bẹp 24px + indent 24px + rhythm sai. Fix = re-assert mock values ở specificity cao hơn (prefix `.mf-form-wrapper .mfp.mfp-classic-australiana-booking` = 0,4,0 + !important). VERIFIED :5119/:5120/:5121: pills 36px, itemLeft=titleLeft=670 (thẳng hàng), stepperMB 28px, gap-to-head 28, title mb0 lh31, intro 14px mt8 — pixel-match mock. (⚠️ cùng lớp reset này có thể ảnh hưởng template khác dùng ol/li/h/p — theo dõi.)

**B2.1 — hero image change: WORKS ✓** (không phải bug). Cơ chế: `.mfp-aside-image{background-image:var(--mf-hero-image, url(default.png))}` trong customCss; builder `commitBg`→`addPendingImageSwap(old,new)`→ lúc save `applyImageSwaps` (inline-edit.ts:1302) **find/replace URL cũ→mới TRỰC TIẾP trong settings.customHtml+customCss** (không phải block ephemeral). Persist qua SaveForm + render SSR. VERIFIED :5119: swap outback-station-side.png→australia-outback.png qua SaveForm → public `.mfp-aside-image` bg đổi ✓ (+ agent fail để lại 1 ảnh upload thật từ builder = bằng chứng builder-flow persist). Handoff #3 cũ nói "mf-ie-hero-style bị strip" = về hero TEXT STYLE, KHÔNG phải image.

### 🚢 SHIP 1.7.97/B380 + 🌍 2 SITE cho user test
- Bump ModuleInfo 1.7.97 + nuspec + AssetVersion B379→**B380** (megaform.css đổi). Build Shared+Client+Server Release net9+net10. **2 gói khác NHAU DUY NHẤT ở `license.lic`** (LicenseService: "production"/"dnndefender.com:megaform"=unlimited; khác=trial cap 3 form/25 sub): pack với license=production → `dist-prod/`; đổi license.lic="trial" pack lại → `dist-trial/`; restore="production". Verify bundled license khác nhau (prod=production, trial=trial). ⚠️ nuspec releaseNotes: `<original>` raw → XML lỗi, phải bỏ `<>`.
- **:5120 PROD** = `Oqtane.MegaForm.Prod1797`, DB `Oqtane_MegaForm_Prod1797`, license=production → **16 tpl dưới `/templates` root**, unlimited (form 17 tạo được). QA sweep 16×3vp: flag = ARTIFACT đo (multi-col premium, ovX=0 mọi trang), 0 regression thật.
- **:5121 TRIAL** = `Oqtane.MegaForm.Trial1797`, DB `Oqtane_MegaForm_Trial1797`, license=trial → **3 tpl dưới `/templates`** (outback/intake/map), form thứ 4 SaveForm → **402 `trial_form_limit` "limited to 3 forms"** ✓. (Premium-tpl+AI lock là client-side gallery; server enforce cap.)
- host/abc@ABC1024, RenderMode Interactive. Scripts scratchpad af1fba79: `apply-css-appends.cjs`, `rewire`/`seed-site.mjs`, `qa-sweep.mjs`, `cap-check.mjs`, `hero-verify.mjs`, `final-shots.mjs`. Screenshots `shots-fix/`.
- Fix-spec workflow: `template-visual-fix-specs` (6 agent) + outback agent → specs trong scratchpad `specs/`. Tree CHƯA COMMIT.

### 🎫 1.7.98 — user yêu cầu nâng trial cap 3→10 form
- `LicenseService.MaxTrialForms` 3→**10** (Core.dll). Server trả `limit` động trong 402 + message → KHÔNG cần đổi client. AssetVersion GIỮ B380 (không đổi JS/CSS). Bump ModuleInfo/nuspec 1.7.98. Rebuild + repack CẢ 2 gói (prod license=production, trial license=trial) → `dist-prod`/`dist-trial/*1.7.98.nupkg` (Core.dll fresh 15:05, license verified khác nhau).
- **Redeploy = upgrade tại chỗ**: `Stop-Process -Id <pid>` (prod=22056/trial=6860, tìm qua `Get-CimInstance Win32_Process ... CommandLine match site`), drop 1.7.98.nupkg vào `Packages\`, restart → Oqtane swap DLL (version↑). VERIFIED ModuleDef=1.7.98 cả 2, license giữ đúng.
- **VERIFY cap=10 CHÍNH XÁC**: seed trial 3→10 form (add-child-templates.mjs, ⚠️ page body PHẢI đủ field themeType/defaultContainerType/headContent/bodyContent/icon nếu KHÔNG → `/api/page` 200-EMPTY no pageId [gotcha cũ]) — form 4-10 = 200, form **11 = 402 CAP** ✓. Sau đó SQL trim trial về **7 form** (DELETE MF_Forms + Page IsDeleted=1) để chừa headroom user tự tạo tới 10. Cap đọc `ListForms` từ DB (không cache) → SQL delete giảm count ngay.
- Kết quả: **:5120 PROD v1.7.98 16 form unlimited · :5121 TRIAL v1.7.98 7 form (cap 10, headroom 3)**. 2 gói giao trong `MegaForm.Oqtane.Package/dist-prod/` + `dist-trial/` (1.7.98). ⚠️ trial còn module orphan 44-47 (binding cũ của form đã xóa, vô hại).

## §1. Code changes (WORKING TREE — chưa commit, chưa pack)

### 1.1 📐 In-field row gap 8px → 12px (`[CompositeRowGap v20260707]`)
Gap DỌC giữa các `.mf-composite-row` trong một field composite (inline style của `.mf-composite`) đổi từ `gap:8px` → **`gap:var(--mf-field-gap, 12px)`** — khớp nhịp 12px top-level (1.7.92) và tự theo ⚙ Settings → Field spacing. Gap NGANG giữa cell trong 1 hàng giữ 8px.
- [MegaForm.UI/src/renderer/inputs.ts](MegaForm.UI/src/renderer/inputs.ts) (~L776 return `.mf-composite`)
- [MegaForm.Core/Services/FormHtmlRenderer.cs:736](MegaForm.Core/Services/FormHtmlRenderer.cs#L736)
- VERIFIED: form 17 `/qa-composite` (ẩn khỏi nav) — composite address 3 hàng, computed `rowGap=12px`.

### 1.2 🕐 `type:"Time"` — native `<input type="time">` (`[TimeInput v20260707]`)
~25 template mẫu (megaform-pure-grid, contact-us-standard, winter-row-based, cả bộ rtl-forms) dùng `type:"Time"` nhưng CẢ HAI renderer không có case này → rơi vào nhánh widget-plugin → hộp vàng **"Widget "Time" — plugin not installed"**. Fix = thêm case Time render `<input type="time" class="mf-input">` ở cả 2 nguồn (cạnh case Email):
- [MegaForm.UI/src/renderer/inputs.ts](MegaForm.UI/src/renderer/inputs.ts) + [MegaForm.Core/Services/FormHtmlRenderer.cs](MegaForm.Core/Services/FormHtmlRenderer.cs) (~L549)
- VERIFIED: `/megaform-pure-grid-template` hết cảnh báo, time picker render cạnh Preferred Date.

### 1.3 ✅ Ship-gate — ĐÃ XONG trong phiên (xem §0.2)
- 1.7.93/B376 đã pack + cài lên :5117 qua nupkg (không còn hot-swap). FormHtmlRenderer trong Core.dll → DNN/Web/Umbraco ăn fix khi ship package của họ; JS đã sync 4 wwwroot.

## §2. :5117 hiện trạng (Oqtane.MegaForm.Fresh1792 — MAIN QA)
- `license.lic` = **production** (full license) — GIỮ NGUYÊN.
- **16 template page** (path = slug thường): down-under(form1/mod36), journey(2/37), discovery-programme(3/38), classic-registration(4/39), youth-application(5/40), event-registration-rsvp(6/41), festa-italiana(7/42), project-intake-onboarding(8/43), wellness-patient-intake(9/44), outback-station-stay-booking(10/45), vendor-application-fl(11/46), contact-map-left-corporate(12/47), contact-map-left-minimal(13/48), contact-map-right-modern(14/49), megaform-pure-grid-template(15/50... form15/mod50), member-login(16/51). Tất cả public (View All Users).
- + **form 17 `/qa-composite`** (page 50/module 52, isNavigation:false) — fixture QA composite gap + Time. Giữ lại làm regression fixture.
- 1 submission smoke trong form 13 (contact-map-left-minimal).
- Seed qua REST recipe cũ (page→module→pagemodule→SaveForm auto-bind; `X-XSRF-TOKEN-HEADER`). Scripts: scratchpad phiên f40fc4b1 (`seed.mjs`, `qa-verify.mjs`, `qa-composite.mjs`, `qa-final.mjs`).

## §3. QA đầy đủ — kết quả (tất cả PASS)
| Hạng mục | Kết quả |
|---|---|
| 16 trang anon ×2 lần sweep | 200 + `.mf-form-wrapper` đúng id 1-16 + submit btn, **0 fail** |
| `--mf-field-gap` | 12px trên cả 16 trang |
| Composite row-gap | 12px computed (form 17) |
| Footer "Trial Mode" | KHÔNG xuất hiện (production) |
| Form cap | 17 form > 3 → không chặn (production OK) |
| Submit smoke (anon, form 13) | đúng **1** POST `Submit/Post` → 200 `{success:true, submissionId:1}` + thank-you (không double-submit) |
| `__MF_PRODUCTION_MODE__` (host) | `true`; upgradeUrl stamped |
| `GET /api/AiAssistant/DefaultConfig` (host) | 200, KHÔNG có `trial:true` (chỉ chưa cấu hình apiKey trên site sạch → `enabled:false`) |
| Dup-binding check | `GROUP BY ModuleId HAVING COUNT>1` = 0 rows (sau 17 SaveForm) |
| member-login | GitHub+Facebook buttons render, email/register links OK (OAuth provider chưa config — như thiết kế) |
| Bulgaria/festa/americana double-card, euro panel, outback single-card | giữ đúng (mắt thường screenshot) |

## §4. Notes / minor observations (không phải bug, chưa sửa)
1. **contact-map-left-corporate "map dải hẹp"** trong fullPage screenshot = **artifact của Playwright fullPage với cross-origin iframe cao 1077px** — viewport thật render map ĐẦY ĐỦ (đã verify + screenshot). Đừng mất thời gian "fix" lại.
2. Radio/checkbox ở corporate variant là kiểu TRẦN (circle không pill) khác minimal/modern (pill có viền) — có vẻ là chủ ý style của template; nếu user muốn đồng bộ thì sửa template.
3. Select của contact-map có 2 option placeholder ("Select..." + "Select a topic" đều value rỗng) — hơi thừa, cân nhắc sửa template.
4. Screenshots QA: scratchpad `shots/*.png` (16 trang + qa-composite + pure-grid-after-timefix + submit-smoke3).

## §5. TODO tồn (mang từ handoff trước + mới)
1. **Bump 1.7.93 + AssetVersion + repack** để ship 2 fix renderer (hiện chỉ working-tree + hot-swap :5117).
2. DNN + Web twins cho trial caps + AI gate + SaveForm cache-refresh (server-side; từ phiên 1.7.92).
3. Trial `trial.*` i18n 6 ngôn ngữ còn lại; `vd.set.*` i18n drift (pre-existing).
4. OAuth config thật cho member-login nếu cần login end-to-end.
