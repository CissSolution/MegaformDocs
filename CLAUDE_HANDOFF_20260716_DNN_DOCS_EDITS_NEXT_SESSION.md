# HANDOFF 2026-07-16 (phần 3) — 2 YÊU CẦU CHỈNH SỬA DOCS DNN cho phiên sau

## ✅ BỔ SUNG CUỐI PHIÊN — 2 FIX CODE DNN SHIPPED + QA (commit `e03feea` + `0643a6e`)
1. **Icon MegaForm trên DNN** (`e03feea`): manifest + DB `Packages.IconFile` vốn đúng
   (`~/DesktopModules/MegaForm/Images/module-icon.png`) nhưng **BuildPackage-DNN.ps1 chưa ship Images/**
   → site 404 icon. Vá pack script (ship `Images\module-icon.png`+`icon.gif` vào Resources) + copy tay
   lên site live. ✅ QA pixel: Add Module panel hiện **MegaForm icon MF xanh** (module duy nhất có icon
   màu), img loaded. (Kèm bump pack version 01.07.106 sẵn cho lần repack.)
2. **Dock hiện NGAY sau drop** (`0643a6e`, badge `[DockOnDrop v20260716-01]`):
   `ShouldSuppressInlineAdminShell` → `return false`. **Lỗi cũ đã hiểu rõ** = markup/assets mismatch
   (dock render nhưng shell CSS/JS bị skip → nút chết) — giờ cả 2 gate cùng đọc `SuppressInlineAdminShell`
   nên không thể lệch; `ShouldSuppressInlineAdminEmptyState` GIỮ NGUYÊN (placeholder vẫn ẩn khi drop —
   kéo thả sạch). ✅ QA pixel: mod385 unconfigured + edit-mode → dock Settings/Form Builder/Form Dashboard
   hiện trong pane trống (trước = render nothing); non-edit + configured không regress.
   **ROLLBACK**: revert `0643a6e` HOẶC `return IsUnconfiguredAdminModuleState;` HOẶC swap lại
   `bin\MegaForm.DNN.dll.bak-preDockOnDrop` trên site + recycle.
   ⭐Deploy note: DLL đã hot-swap site (backup .bak-preDockOnDrop) — bản pack tới sẽ mang cả 2 fix.
3. ⭐Bẫy QA mới: **DNN edit-mode PERSIST per-user** (giống Oqtane) — script phải CHECK
   `.addModuleHandler` tồn tại trước khi toggle `#Edit`, không blind-click. **DNN 10 add-module =
   CLICK `.addModuleHandler` trên pane** (không cần kéo-thả!) → GIF bài 1 phiên sau DỄ: click Add
   Module trên pane trống → panel card → click MegaForm card (bước "chọn module" có thể là click card
   — verify hành vi click card lúc quay). Edit-mode hiện đã TẮT, site nguyên trạng (form 37, dock 3 nút).

Nối tiếp `CLAUDE_HANDOFF_20260716_DNN_DOCS_SERIES_20_ARTICLES.md` (series 20 bài + 21 GIF ĐÃ LIVE,
master `d246839`, Actions xanh, 9/9 URL 200). Owner review xong, giao 2 chỉnh sửa — phiên này mới
EXPLORE dở, CHƯA quay/sửa gì. Không có thay đổi nào chưa-commit trên docs.

## 🎯 YÊU CẦU CỦA OWNER (nguyên văn 2 ý)
1. **`dnn-add-to-page.html`** — làm lại GIF: bắt đầu **từ khi DROP MODULE vào trang** (DNN edit mode,
   kéo module MegaForm vào pane), rồi **cấu hình để hiện admin dock buttons**, cho đến khi **form hiện ra**.
   (GIF hiện tại bắt đầu từ module ĐÃ đặt sẵn ở trạng thái unconfigured — thiếu đoạn drop + đoạn dock xuất hiện.)
2. **`dnn-module-setup.html`** — bổ sung chế độ xem **Windowed / FullScreen** (nút "⛶ Windowed"/"Fullscreen"
   góc dưới-phải của các overlay admin — đã thấy trong screenshot Module View + dashboard + report).

## 📍 TIẾN ĐỘ EXPLORE (phiên này, đã xác minh live trên dnn10322_megaclean.ai)
- **Persona Bar** = iframe `#personaBar-iframe` (`/DesktopModules/admin/Dnn.PersonaBar/index.html`).
  Truy cập qua `page.frames().find(f => /PersonaBar/i.test(f.url()))`.
- **Nút vào Edit mode** = `li#Edit.btn_panel` TRONG iframe Persona Bar (⚠️ matcher lỏng sẽ trúng
  `Dnn.CssEditor` trước — phải `getElementById('Edit')`). Click xong trang **RELOAD vào edit mode**
  (screenshot giữa chừng = trắng) → cần `waitForLoadState('domcontentloaded')` + wait dài (6-10s) SAU click.
- **⚠️ KHÔNG có trang trống sẵn**: `/Build`, `/?tabid=22` đều fallback/redirect về **Home** (`/#build` —
  menu BUILD/LEARN/... chỉ là anchor). Home có 4 module (MegaForm=384 + 3 HTML). Danh sách tab thật:
  Home(21,4 mods), TestPinPage456(37, mod385), POC-Alpine-Original(38), ActivityFeed..., PremiumFormsKB*.
- **Kế hoạch đã chốt** (bước kế tiếp, script `make-testpage.mjs` ĐÃ VIẾT NHÁP nhưng bị dừng trước khi chạy):
  1. Tạo page test "Docs Demo Add" qua Persona Bar Pages panel (панель Pages mở được — screenshot
     `out-smoke/editmode-before.png` cho thấy panel Pages với nút **Add Page**). KHÔNG quay đoạn này.
  2. GIF bắt đầu trên page trống: **Edit mode → panel Add Module → tìm "MegaForm" → DRAG vào pane**
     (DNN drag = jQuery-UI mouse events → dùng mouse.down/move/up từng bước, KHÔNG phải HTML5 dnd)
     → Save/Close edit bar → **admin dock hiện** (Module View/Settings/Form Builder/Form Dashboard)
     → Module View → chọn form ("Store · Published") → "Use selected form on this page" → form live.
  3. Sau khi quay: **XOÁ page test** (Persona Bar Pages hoặc SQL soft-delete Tabs.IsDeleted=1) — trả nguyên trạng.
- **Windowed/FullScreen (yêu cầu 2)**: nút toggle nằm góc dưới-phải MỌI overlay admin (Module View,
  dashboard, report...) — text "⛶ Windowed"/"Fullscreen" (thấy rõ trong `out-01/f00007.png` và screenshot
  report). GIF đơn giản: mở Form Dashboard overlay → click toggle → windowed (inline) → click lại →
  fullscreen. Selector thăm dò: button chứa text /windowed|fullscreen/i. Thêm section "Windowed vs
  Fullscreen" vào `dnn-module-setup.md` + GIF `dnn-02d-windowed-fullscreen.gif`.

## 🔧 HẠ TẦNG SẴN SÀNG (không phải dựng lại gì)
- **Workspace**: scratchpad phiên `0064952b-caf1-4399-8677-bb24557abf1f` (Temp\claude\...\scratchpad) —
  có node_modules (gif-encoder-2, pngjs; playwright resolve từ repo root), các script `rec-*.mjs`, `explore-*.mjs`.
- **`recorder-lib-fixed.mjs`** — shotsToGif THUẦN JS (pngjs bilinear + gif-encoder-2; ffmpeg stripped
  không có PNG decoder → đừng quay lại đường ffmpeg). 640w/fps2/q20-22.
- **`dnn-lib.mjs`** — login host/dnnhost + openBuilder. ⭐Luôn `addInitScript` set
  `localStorage['mf-locale']='en-US'` + URL `?mflocale=en-US` (không thì UI vi-VN).
- **Worktree docs**: `E:\_docswt` (branch local `docs/dnn-series`, đã push hết tới `d246839`).
  Sửa bài + ảnh trong worktree → commit → `git push origin docs/dnn-series:master` → Actions tự build.
- **Bẫy đã ghi** (chi tiết ở handoff p2): option picker "Store · Published"; nav badge dính "Submissions15";
  textarea đầu builder = DESCRIPTION form (AI chat = placeholder "Describe the form you need");
  wizard Create BIND form vào module; ModuleStyleJson auto-sync theo form active (khôi phục = "Update Theme");
  element detached sau re-render → re-query; DNN cold-start >45s → curl warm trước.

## Trạng thái site DNN hiện tại (sạch)
- mod385 = form 37, mode render, style synced. Form 46 "Customer Feedback" Draft = sandbox (giữ/xoá tuỳ owner).
- Không có page/module test nào đang treo — mọi thứ phiên này chỉ explore đọc.

## Checklist phiên sau (thứ tự làm)
1. Warm DNN (`curl /TestPinPage456`), chạy `make-testpage.mjs` (viết lại — bản nháp bị dừng chưa ghi file):
   Persona Bar → panel Pages → Add Page "Docs Demo Add" → verify URL.
2. Explore edit-mode trên page mới: click `#Edit` (PB iframe) → wait reload → dump edit-bar/add-module panel
   (chưa biết selectors — phải dump: panel module list, search box, module card, pane target).
3. Thử drag module card → pane bằng mouse events; nếu jQuery-UI không nhận, thử
   `dispatchEvent(new MouseEvent(...))` chuỗi mousedown/mousemove/mouseup trên document.
4. Ghi `rec-01b-drop-module.mjs`: shots từ edit-mode → drop → dock hiện → Module View → chọn Store → form live.
5. Ghi `rec-02d-windowed.mjs`: dashboard overlay → toggle Windowed ⇄ Fullscreen.
6. Sửa `dnn-add-to-page.md` (GIF mới + mô tả từ bước add-module) + `dnn-module-setup.md` (section mới + GIF).
7. Xoá page test; commit + push `docs/dnn-series:master`; verify Actions + URL 200; cập nhật handoff/memory.
