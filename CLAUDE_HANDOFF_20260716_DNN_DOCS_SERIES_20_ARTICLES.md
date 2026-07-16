# HANDOFF 2026-07-16 (phần 2) — DNN DOCS SERIES 20 BÀI + 21 GIF LIVE, GIF pipeline hết ffmpeg

Tiếp `CLAUDE_HANDOFF_20260716_SOURCE_PICKER_UNIFIED_AND_DOCFX_DNN.md` (source-picker + bài ERP đơn).
Owner yêu cầu: XOÁ bài ERP đơn, làm lại **cả series DNN theo trình tự mục Oqtane, mỗi bài có GIF**, autonomous.

## ✅ KẾT QUẢ — repo MegaformDocs master, 4 commit, Actions 3/3 SUCCESS, spot-check 9/9 HTTP 200
- `cb3080e` xoá dnn-erp-demo.md cũ → `c5f9ced` batch 1 (8 bài) → `da0d38b` batch 2 (7 bài) → `d246839` batch 3 (6 bài, gồm ERP redo).
- **Mục mới "Using MegaForm on DNN" — 20 bài** (dnn-*.md) đúng trình tự owner: add-to-page ·
  **module-setup (fixed/dashboard page/inbox page — bài DNN-riêng owner thêm)** · creating-forms ·
  form-templates · form-builder · field-permissions · widgets · drag-drop-layout · settings-theme ·
  after-submission · submissions-inbox · submissions-grid · workflow · workflow-approvals ·
  workflow-library · **erp-demo (redo, 3 PNG cũ + GIF BPMN)** · storage-options · multi-language ·
  ai-form-designer · ai-configuration · ai-prompts.
- **21 GIF quay live** trên `dnn10322_megaclean.ai` (host/dnnhost), tất cả flow THẬT đã verify bằng mắt
  từng frame chính: wizard tạo form 46 thật · Template Gallery filter Business · Access matrix roles thật ·
  BPMN "Issue invoice" node DB Insert · task inbox Approve/Reject bar · Library suggested-mappings ·
  **AI Designer APPLY THẬT** (prompt → field "Overall satisfaction" hiện trên canvas) · AI Settings panel.
- Live: `https://cisssolution.github.io/MegaformDocs/articles/dnn-add-to-page.html` (+ 19 bài kia).

## 🔧 GIF PIPELINE — BLOCKER 07-15 ĐÃ GIẢI (quan trọng cho mọi phiên docs sau)
- **Chốt nguyên nhân**: Playwright stripped ffmpeg **không có image2 demuxer VÀ không có PNG decoder**
  ("Unknown decoder 'png'") → mọi đường PNG-seq qua ffmpeg là bất khả thi (webm→PNG vẫn OK vì chỉ cần PNG ENCODER).
- **Fix**: `recorder-lib-fixed.mjs` (scratchpad phiên 0064952b) — `shotsToGif` giờ **thuần JS**:
  pngjs đọc → **bilinear resize tự viết** → gif-encoder-2. Không ffmpeg. 640w/2fps/q20-22 → 100-700KB/GIF.
- Harness: `dnn-lib.mjs` (login DNN + openBuilder) + `clickText` visible-only + `snap/hold`.
  Scripts: `rec-01-blank-to-form.mjs`, `rec-02-module-setup.mjs`, `rec-03b.mjs`, `rec-05-08-builder.mjs`,
  `rec-09-15.mjs` + `rec-fix-9-15.mjs`, `rec-17-20.mjs` + `rec-fix-19-20.mjs` (scratchpad 0064952b).

## ⭐ Bẫy mới phát hiện (đắt)
- **Ép EN cho GIF**: bundle i18n đọc `localStorage['mf-locale']` + `?mflocale=en-US` (persist) — thiếu nó
  UI hiện vi-VN (từ vi-VN.json hợp lệ, không phải hardcode). addInitScript set mf-locale + query param.
- **DNN module form picker**: option text = "Store · Published" (có suffix); nav Submissions có badge dính
  ("Submissions15") → regex `^X$` fail; textarea AI chat phải match placeholder "Describe the form you need"
  (textarea đầu tiên là DESCRIPTION của form — gõ nhầm làm bẩn form!).
- **Wizard "Create Form" bind form mới vào module** đang mở → phải restore MF_ModuleViewConfig sau.
- **ModuleStyleJson auto-sync theo form active** — đổi FormId qua form khác rồi restore làm style nhiễm
  theme form đó; khôi phục ĐÚNG = bấm "Update Theme" (re-sync từ form active), không phải restore backup.
- Element re-render sau filter → handle detached → **re-query trước fill('')**.
- DNN cold-start >45s sau idle → curl warm trước khi chạy Playwright script.

## Trạng thái site DNN sau phiên (đã dọn)
- mod385: FormId=37 (Account Setup), mode=render, configured=true, style re-synced từ form 37 (cyber —
  là theme THẬT của form 37; "ocean" cũ là override lệch từ trước). Trang /TestPinPage456 render sạch, verified.
- **Form 46 "Customer Feedback" (Draft) MỚI** — sandbox do wizard GIF tạo (3 field + "Overall satisfaction"
  do AI thêm). Vô hại; giữ làm demo/sandbox hoặc xoá tuỳ owner. Form 45 không tồn tại (id nhảy).
- App pool DNN10322_MegaClean bị recycle vài lần trong phiên (mode switches) — bình thường.

## Việc còn / phiên sau
1. Owner review series → sửa theo feedback (bài nào cần GIF chi tiết hơn thì có harness sẵn, rẻ).
2. Backlog cũ chưa động: queryKey>250 · source-picker twin DNN/Web/Umbraco · ERP Oqtane Invoice+6report ·
   WorkflowCanvas GROUP BY · bounded-read follow-up.
3. Worktree `E:\_docswt` + branch local `docs/dnn-series` còn (đã push hết; dọn `git worktree remove` tuỳ ý).
4. GIF-8 (drag&drop) đoạn kéo thả mouse chưa thấy drop-indicator rõ trong frames — nếu owner muốn đẹp hơn,
   quay lại riêng đoạn kéo (sortable có thể cần mousemove dày hơn).
