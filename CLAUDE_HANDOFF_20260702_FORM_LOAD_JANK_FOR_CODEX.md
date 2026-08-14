# Handoff cho Codex — Form load "giật" (skeleton flash + trễ tương tác) trên host Interactive

**Ngày:** 2026-07-02 · **Người viết:** Claude (phiên security-1.7.47) · **Trạng thái:** ĐÃ CHẨN ĐOÁN + ĐO ĐẦY ĐỦ trên :5090, **CHƯA fix** (bàn giao Codex làm vì đụng file bạn đang sửa). Không đoán — mọi số dưới đây từ Playwright + network + DOM thực tế.

> **Mục tiêu (theo user):** khôi phục hành vi "render phía server, JS gần như không làm gì" → form hiện ĐÚNG + ĐỦ (kể cả multi-step stepper) ngay first paint, không nháy skeleton, không chờ WebSocket circuit.

---

## 1) Triệu chứng (khớp 2 ảnh user gửi)
Public form multi-step (`:5090/?formid=2`, form "sssss", 4 step, 18 field) lần đầu: hiện **thanh xám skeleton** → nhảy sang **form thật có stepper**. Cảm giác giật + không bấm/gõ được ngay.

## 2) Timeline hình ảnh đo được (module page, Interactive, cold cache)
| t (ms) | Trạng thái DOM |
|---|---|
| 80  | SSR field **PHẲNG**: 18 `.mf-field-group`, **stepper=0**, text "Full NameFirst name…" |
| **160** | **SKELETON**: `[data-mf-skeleton]`=1, groups=0 (nội dung SSR bị XÉ) ← Ảnh 1 |
| **260+** | Form thật: 18 field + **stepper "Step 1/2/3/4"** (groups=18, stepper=16) ← Ảnh 2 |
Console: `MegaForm: rendering 18 fields` → `HYDRATED 18`. Renderer JS load **1×**, Schema `1×`, **không** page-error.

## 3) Số đo hiệu năng (cold cache)
| Chỉ số | Module page `?formid=2` (Interactive) | Trang tĩnh `/api/MegaForm/render/2` |
|---|---|---|
| TTFB (server) | 56ms | 46ms — **server KHÔNG chậm** |
| First Contentful Paint | **836ms** | **292ms** |
| WebSocket `_blazor` | mở lúc **1826ms** | **KHÔNG có** |
| Renderer chạy (form dùng được) | **~2473ms** | ~lúc parse (~300–400ms) |
| Cross-origin/CDN | 3 (Bootstrap cyborg + Google Fonts — **của THEME OQTANE**, không phải MegaForm) | 0 |
| Long tasks | 3 tác vụ 55/55/71ms (tổng ~181ms) | tương tự |
| Render-blocking | 13 (11 same-origin xong ~122ms; 2 chậm là CDN theme) | 6 (đều same-origin) |

## 4) ROOT CAUSE (đã xác định)
**Host site = `RenderMode: Interactive`** (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.FreshQA.MSSQL\appsettings.json`). Oqtane BỎ QUA `RenderMode=Static` mà module tự khai (`Index.razor`: `public override string RenderMode => RenderModes.Static`) và bọc module vào InteractiveServer + prerender boundary. Hệ quả:
1. **Nháy skeleton (t160)** = Blazor **re-render** trên circuit. Ở pass interactive, `_ssrFieldsHtml` RỖNG (chỉ populate ở pass prerender/load) → nhánh `@if (SsrMode && !empty(_ssrFieldsHtml)) {SSR} else {@RenderFormSkeleton}` rơi vào **skeleton** → xé bỏ SSR đang hiện.
2. **Trễ tương tác (~1.6s)** = thẻ `<script>` boot inline bị guard `IsHostInteractive` **suppress** (thêm 2026-07-01 để chặn crash `insertMarkup`) → boot chuyển sang `OnAfterRenderAsync` → `Js.InvokeVoidAsync("eval", _pendingRendererBoot)` **chỉ chạy SAU khi circuit kết nối (~1826ms)** → renderer chạy ~2473ms.
3. **Stepper dựng CLIENT-side** (`buildStepIndicator` + `hydrateSsrFields` tạo `.mf-page`) → phải chờ JS → "nhảy" từ phẳng sang phân trang.

⭐ **`FormHtmlRenderer.RenderStandardFields` (Core) chỉ SSR field PHẲNG** — KHÔNG emit stepper, KHÔNG emit `.mf-page`. Đây là lý do gốc buộc client phải rebuild.

## 5) Đã LOẠI TRỪ (đo rồi, đừng đi lại)
- **flip `RenderMode: Static` (đã test + revert):** ✅ HẾT giật hoàn toàn — `skel=0`, **0 WebSocket**, **0 log "rendering/HYDRATED"** (JS thật sự idle), 18 field ổn định từ t80. ❌ **NHƯNG mất stepper** — form phẳng, không "Step 1/2/3/4", không Next/Prev. Vì stepper do JS dựng mà dưới Static (enhanced-nav) **boot JS không chạy**. → **Config-flip Static một mình KHÔNG dùng được cho form multi-step.** (Với form single-page thì Static chạy hoàn hảo.)
- **Bản "prerender bị tắt trên Interactive"** (giả thuyết handoff FOUC cũ): SAI — SSR field VẪN render trên Interactive (`SsrMode = IsStaticRender||?mfssr=1`, không phải `!IsHostInteractive`). Xem `CLAUDE_HANDOFF_20260702_FOUC_FORM_LOAD_REGRESSION.md` (đã có banner CORRECTION).
- **Schema form 2 bị NHÂN ĐÔI** (mỗi field 2 lần trong DB) — đã fix riêng ở 1.7.47 (`FormHtmlRenderer.RenderFieldsBody` dedup-by-key); render/2 giờ 18/18. KHÔNG liên quan skeleton flash.

## 6) FIX PLAN (3 tầng — "server-render, JS idle" đúng nghĩa)
**Tầng 1 — Core `FormHtmlRenderer` (SSR đầy đủ multi-step):**
- `RenderFieldsBody`/`RenderStandardFields` phải emit **stepper** + bọc field vào **`.mf-page`** (page hiện tại `display:block`, các page sau `display:none`) — port logic `calculatePages` (`renderer/index.ts:1466`) + `buildStepIndicator` (`renderer/index.ts:~2117`) sang C#. Có sẵn tham chiếu parity: FormHtmlRenderer đã có `BuildSummaryHtml` mirror TS. Emit `data-mf-ssr-multistep="1"` để client biết SSR đã đủ.
- File: `MegaForm.Core/Services/FormHtmlRenderer.cs` (dùng bởi CẢ Index.razor SSR lẫn `/api/MegaForm/render` lẫn DNN `FormView.ascx`).

**Tầng 2 — Renderer JS (`MegaForm.UI/src/renderer/index.ts`) bind-only khi SSR đủ:**
- Trong `init()`: nếu container có `data-mf-ssr-multistep` + `.mf-page` sẵn → **KHÔNG `buildSkeleton`, KHÔNG `renderFields`/`hydrateSsrFields` rebuild** — chỉ `bindNavigation/bindSubmit/buildStepIndicator(bind vào stepper có sẵn)/bindInteractiveElements/hydrateSqlOptions`. Đọc-guard `data-mf-hydrated` (hiện SET ở 1611/1643 nhưng **KHÔNG BAO GIỜ ĐỌC** — 0 chỗ đọc) để idempotent.

**Tầng 3 — `Index.razor` (giữ SSR qua pass interactive):**
- Đảm bảo `_ssrFieldsHtml` KHÔNG rỗng ở pass interactive (giữ giá trị / recompute trong `OnParametersSet`), để nhánh SSR luôn thắng → Blazor **không** rơi xuống `@RenderFormSkeleton`. Hoặc: khi đã có node `data-mf-ssr` trong DOM, nhánh else đừng ghi đè skeleton.
- ⚠️ **VÙNG NHẠY CẢM:** `Index.razor` lines ~1185–1209 ghi rõ các lần thử `Prerender=true`/prerender-on-interactive đều **crash circuit** ("Error applying batch N" → circuit chết). Đừng bật lại `Prerender`. Chỉ động tới việc giữ `_ssrFieldsHtml` + gate nhánh skeleton. `IsHostInteractive` (line ~1209) và 2 thẻ `<script>` inline (preload schema ~1132, boot ~1171) là chỗ crash `insertMarkup` — GIỮ chúng suppressed trên Interactive; boot vẫn qua `OnAfterRenderAsync` eval. Mục tiêu là làm SSR **đủ và bền** để việc boot JS chậm không còn gây "nháy" (form đã đúng sẵn, JS chỉ bind).

**Cách khác (nếu #1–#3 quá lớn):** làm boot chạy **lúc parse** thay vì sau circuit — phát boot là **`<script defer src=...>` NGOÀI** (không phải inline MarkupString → không trigger insertMarkup crash) + `data-enhance-nav="false"`/forceLoad cho trang form (xem `CLAUDE_HANDOFF...B273` — enhanced-nav skip inline boot). Rút ~1.6s trễ tương tác nhưng vẫn có "flat→paginated" 1 tick (chấp nhận được nếu nhanh).

## 7) ⚠️ Bundle JS đang deploy bị STALE (Codex lưu ý)
`megaform-renderer.js` đang chạy trên :5090 (và trong repo `MegaForm.Oqtane.Server/wwwroot/...`, md5 giống nhau = `8b6fba74…`) **KHÔNG chứa WIP renderer của bạn** (`maybeDeferForWidgetPlugins`=0, `isMultiStepCustomHtmlMode`=0 trong bundle, nhưng =2 trong source `index.ts`). Tức bundle được compile TRƯỚC các sửa uncommitted của bạn. Pack **1.7.47** (phiên này) chỉ build C#, **skip TS build**, nên ship lại bundle cũ. → Khi bạn pack lại phải chạy `npm run build:*` để bundle khớp source.

**Review WIP renderer của bạn (Claude đã đọc toàn bộ diff):** AN TOÀN để build — type-check sạch; lỗi `tsc` DUY NHẤT ở `src/builder/workflow/wf-app.ts(785,3)` (bundle *builder*, KHÔNG phải renderer, pre-existing). WIP renderer của bạn (WizardValidationPresenceGuard, autoload widget-plugin, premium shell controls, flexgrid, summary, inline-edit, preview step-nav, hardening postMessage) **KHÔNG chạm đường skeleton/first-paint** (`buildSkeleton`/`data-mf-ssr` giữ nguyên) → build nó KHÔNG hết giật, cần fix plan mục 6.

## 8) Trạng thái hiện tại của cây code + site (phiên này đã làm)
- **Đã deploy 1.7.47 lên :5090** (Interactive, đã khôi phục): security Phase-1 (P0-1 kimi RCE env-gate+ArgumentList+[Authorize], P0-2 i18n [Authorize EditModule]+reject index, P0-5 SavePrintSettings [Authorize Admin] Web, SeedViewModes IsAdmin) — verify unauth→403. + FOUC dedup Core.
- **Uncommitted trong working tree:** của Claude = `FormHtmlRenderer.cs` (dedup), `ModuleInfo.cs`/`nuspec` (1.7.47), `MegaFormLocalAiController.cs`, `MegaFormController.cs`, `AiKnowledgeController.cs`, `PrintController.cs`. Của **Codex (giữ nguyên, chưa build/deploy)** = `renderer/index.ts`(+559), `inputs.ts`(+95), `helpers.ts`, `megaform-renderer.ts`, `Index.razor`(77), `FormView.ascx.cs`(9).
- Chưa commit gì (user review).

## 9) Cách repro + đo (để Codex verify fix)
- Site: `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.FreshQA.MSSQL`, net10.0, chạy `Oqtane.Server.exe` trực tiếp (host/abc@ABC1024). Deploy = drop nupkg vào `Packages\` + stop `Oqtane.Server.exe` + `Start-Process` lại (cài lúc startup, log `Packages\*.log`).
- Repro: `http://localhost:5090/?formid=2` (form multi-step). Anon: `?formid=` bị admin-gate nên trang hiện form-2 mặc định của page.
- Đo bằng Playwright (có sẵn `node_modules/playwright` 1.60, chromium): context mới = cold cache; `PerformanceObserver('longtask')` + `getEntriesByType('resource'/'navigation'/'paint')` + `page.on('websocket')` + đếm `[data-mf-skeleton]`/`.mf-field-group`/`.mf-page`/`.mf-steps` theo mốc t. Chạy script trong REPO ROOT (playwright resolve từ node_modules ở đó). **Tiêu chí PASS:** first paint đã có 18 field + stepper, skel=0, không có mốc nào groups=0, form tương tác được < ~500ms.

## 10) Gotcha
- ⭐ ASCII `grep` KHÔNG tìm được string literal trong .NET DLL (UTF-16) — dùng `strings -el`. Verify deploy bằng HÀNH VI, đừng tin md5 (net9-vs-net10 layout khác).
- ⭐ Đừng bật `Prerender=true` / prerender-on-interactive (crash circuit — Index.razor ~1185-1198).
- ⭐ Inline `<script>` MarkupString trên host Interactive → crash `insertMarkup` "Unexpected end of input". Boot phải qua eval hoặc external `<script src>`.
- CDN Bootstrap+Google Fonts (FCP +~0.5s cold) là **theme Oqtane Cyborg**, không phải MegaForm — muốn giảm thì đổi theme self-host hoặc preconnect ở host, KHÔNG sửa trong module.
