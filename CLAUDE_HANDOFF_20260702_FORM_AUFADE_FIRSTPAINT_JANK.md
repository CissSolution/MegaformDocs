# Claude Handoff — 2026-07-02 — Premium form "giật" khi load (auFade first-paint jank)

Tiếp nối [CLAUDE_HANDOFF_20260702_FORM_HEADER_SSR_FIRST_PAINT.md](CLAUDE_HANDOFF_20260702_FORM_HEADER_SSR_FIRST_PAINT.md).
Handoff header (1.7.56/B352) đã committed ở `d2c1e83`. Sau đó (song song) tiến tiếp 1.7.57 (Row de-dup)
+ 1.7.58/B353 (custom-shell bind-only). Handoff này ghi lại việc **fix cú giật auFade** → **1.7.60 / B355**.

## Trạng thái
- QA site: `http://localhost:5090/` (Oqtane 10.1.0 **net10.0**, FreshQA MSSQL). Đang chạy **1.7.60 / B355**, HTTP 200.
- Root page = **FormId 4** (premium template **down-under-australia**, `.mfp-australia`, `mf-theme-down-under-reef-premium`), module container `#megaform-container-36`.
- Deploy = drop nupkg vào `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.FreshQA.MSSQL\Packages` → stop/relaunch `Oqtane.Server.exe`.

## Vấn đề (user re-diagnosis, ĐO trực tiếp — chính xác)
Form premium load bị "giật". **Thủ phạm thật = animation entrance `auFade`** gán cho mỗi step:
```css
.mfp-australia .au-page{display:none;animation:auFade .25s ease}
.mfp-australia .au-page.is-active{display:block}
@keyframes auFade{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}
```
Vì `.au-page.is-active` + animation nằm trong **template CSS có sẵn ở SSR**, và SSR đã đánh `is-active`
cho step-1 → **auFade chạy ngay lúc server first-paint (~250ms), TRƯỚC khi schema `/api/MegaForm/Schema/4`
trả về (~478ms)**. Đo được opacity 0.44 giữa animation. `transition:all` **không** phải nguyên nhân
(duration mặc định 0s → vô hại). Templates khác dùng tên keyframe khác (`amFade` = americana).

## Fix — 1.7.60 / B355 (đã ship + QA PASS)
Nguyên tắc: **cloak phải nằm trong SSR markup** (JS thêm là quá muộn cho mốc 250ms), và **không được dùng
`animation:none`** (nó ẩn `animation-name` + khởi động lại entrance đúng lúc gỡ class = tái hiện bug, chỉ trễ hơn).

3 phần:
1. **CSS** `Assets/css/megaform.css` — rule `.mf-form-wrapper.mf-booting` (+ `*`, `::before/after`):
   `animation-delay: -1s !important; transition: none !important;`
   → đẩy entrance one-shot (auFade/amFade) sang **frame cuối tức thì** (không motion, không 0%-flash);
   giữ `animation-name` để JS phát hiện; animation infinite (spinner) vẫn quay.
2. **SSR bake `mf-booting`** lên wrapper — 2 nơi:
   - `MegaForm.Oqtane.Client/Index.razor` (~dòng 2939, biến `baseWrapperClass`) → trang interactive (bug gốc).
   - `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs` (~dòng 184) → `/render/{id}` parity.
   → wrapper ship kèm `class="mf-form-wrapper mf-booting ..."` ngay từ 250ms.
3. **JS renderer** `MegaForm.UI/src/renderer/index.ts` (`init()`, ngay trước `calculatePages()`):
   thêm `mf-booting` (no-op cho SSR form, cần cho client-rendered), rồi **PIN** step đang hiển thị:
   duyệt `#mf-fields-container-{id}`, element nào `animationName!=='none' && iterationCount!=='infinite'
   && offsetParent!==null` → set inline `el.style.animation='none'` (vĩnh viễn), **rồi mới** gỡ `mf-booting`
   (double-rAF + `setTimeout(...,1200)` safety). Pin trước-khi-gỡ ⇒ không re-trigger; step ẩn giữ nguyên
   entrance cho navigation thật; spinner (infinite) không bị pin.

Version: `AssetVersion.cs`→`20260702-B355`; `ModuleInfo.cs`+`nuspec`→`1.7.60` (+ release note).

## QA đã chạy (headless, playwright-core, chromium isolated — MCP browser bị Codex khoá)
Script: `…/scratchpad/qa-b355-deep.cjs` (đo au-page opacity+translateY 4.5s + screenshot).
- **PASS**: `minOpacity=1` (0 sample < 0.95), `maxTranslateY=0` (0 sample > 1px) suốt 4.5s → **không fade, không slide**.
- `firstBootFalseT=2212ms` → cloak có mặt lúc SSR-paint+hydrate, gỡ ~2.2s (mốc circuit-handoff); opacity vẫn 1 lúc gỡ → **không re-trigger**.
- Step icon 1 = `rgb(11,179,155)` (teal) **ngay từ đầu**, `animName:none` (đã pin) → hết cảnh xám→teal.
- Screenshot t=320ms: form đầy đủ, STEP 1 teal, First/Last **2 cột**, mọi field + Back/Continue — không nửa-render.
- SSR HTML root: `class="mf-form-wrapper mf-booting mf-custom-shell-mode mf-theme-down-under-reef-premium"` ✓.

## Lưu ý / còn lại
- **Chưa commit** (working tree lớn, deployed-only pattern — chỉ commit khi user yêu cầu).
- **1.7.59/B354 là bản trung gian LỖI** (JS-only `animation:none`, quá trễ + re-trigger) → đã bị B355 thay thế. `.log` còn trong Packages, vô hại.
- **+40px height (884→924)** user nêu là chuyện KHÁC (content staging / Blazor interactive loading→SSR swap), **không** do auFade (opacity/transform không đổi layout). Nằm trong scope jank Blazor SSR đã handoff Codex trước (`..._FORM_LOAD_JANK_FOR_CODEX.md`). Fix này KHÔNG đụng tới nó.
- Nếu template mới thêm entrance keyframe khác: **không cần sửa gì** — cloak generic theo `animation-name`, không hardcode tên keyframe.
- Nếu test form khác: kiểm tra SSR HTML có `mf-booting` trên wrapper; QA đo `minOpacity` phải =1 và `translateY` phải =0.

---

## Follow-on cùng phiên (2026-07-03) — đã ship + QA PASS

### B356 / 1.7.61 — Premium-native top-gap "giật" (khoảng padding-top giãn ra)
Renderer bọc form multi-step trong shell generic `.mf-multistep-frame{display:flex;gap:20px}`. Premium-native ẩn header/footer generic nhưng **flex gap 20px vẫn chừa 20px trên + 20px dưới card** — shell dựng bằng JS SAU khi SSR card paint → 40px rơi trễ, card tụt ~20px, block cao thêm ~40px = cú nhảy. Có sẵn rule `gap:0` cho americana; tổng quát hóa: `.mf-form-wrapper.mf-premium-native-mode.mf-has-multistep-shell .mf-multistep-frame{gap:0!important}` (Assets/css/megaform.css). QA: gap 0, container height ổn định (−40px).

### B357 / 1.7.63 — Dashboard FOUC (`?mfpanel=dashboard` flick do CSS nạp chậm)
`megaform-admin-shell.css` chỉ nạp qua JS boot `<link>` (BuildSurfaceBootScript), mà trên Interactive host eval trong `OnAfterRenderAsync` ~2.5s → không render-blocking → dashboard paint unstyled rồi mới styled. Fix: emit **`<link rel=stylesheet>` render-blocking trong markup panel (đã prerender)** ở `Index.razor` ngay trước `.mf-oq-surface`; JS boot vẫn re-inject cho SPA nav (idempotent). QA: `foucFrames=0`, dashboard styled từ 176ms. ⚠️KHÔNG cloak-until-JS (boot trễ 2.5s → ẩn lâu).

### 1.7.62 — 2 premium template mới (event-rsvp + wellness-intake)
"Chưa import được" = (1) field `type:"Input"` KHÔNG hợp lệ (MegaForm dùng `Text`) → sửa Input→Text; (2) chưa copy vào `wwwroot/Modules/MegaForm/Templates/` (chỉ 5 tpl ship) → `BuilderTemplateCatalogService` seed từ đó → App_Data → gallery. Đã ship slug-named. **Giờ 7 premium templates.**

### Fresh clean Oqtane + NuGet-only install (validation task cuối)
Site mới `Oqtane.MegaForm.Clean1762` @ **:5099**, DB `Oqtane_MegaFormClean1762`. Clone Oqtane.Fresh.10.1.0 → gỡ MegaForm → auto-install (⭐cần `Database.DefaultDBType` SqlServer + `Installation` block, thiếu DBType thì DatabaseManager crash) → drop nupkg 1.7.63 → **cài NuGet-only OK: 7 templates seed vào App_Data + anti-jank CSS served**. Validate package end-to-end.

### Version cuối phiên: **1.7.63 / B357** (deployed :5090 + :5099). Chưa commit (deployed-only).
