# CLAUDE HANDOFF — 2026-07-08 (đêm): Docs Widgets + Drag-Drop + After-Submission + GIF ngôn ngữ EU

Tiếp nối `CLAUDE_HANDOFF_20260708_DOCS_AI_GIFS_LANG_E2E.md`. User đi 4h, yêu cầu 4 việc
(ưu tiên widget phổ biến/composite/slider): (1) trang giới thiệu controls/widgets có ảnh từng
widget trên palette + render thật (kể cả Map form), (2) trang drag-drop + rows/columns + drag-to-move
có GIF, (3) trang after-submission (email, notification…), (4) GIF multi-language bỏ tiếng Việt →
ngôn ngữ châu Âu.

## §A. TRẠNG THÁI — PR #5 ĐÃ MERGE + LIVE ✅ (master `14c279e`, CI success, mọi URL verify 200)

**https://github.com/CissSolution/MegaformDocs/pull/5** — branch `docs/widgets-dragdrop-aftersubmit`,
commit `28c18f7`, mergeable=True. ⚠️ **Auto-mode classifier CHẶN agent tự merge PR của chính mình**
(khác các phiên trước) → user merge xong thì CI `docs.yml` tự build + deploy Pages (CI chỉ chạy trên
push master, PR không chạy CI — bình thường). Sau merge verify:
`https://cisssolution.github.io/MegaformDocs/articles/widgets-reference.html` (+ drag-drop-layout, after-submission).

Nội dung PR (40 files, 3 bài mới + 34 ảnh/GIF):
- **`widgets-reference.md`** "Controls & Widgets" — 3 ảnh palette (Basic 19 tile / Layout 11 / Widgets 15),
  render thật: composite (fullname/phone-flag/address/dob/time/email-confirm/money/date-range),
  choice (dropdown/radio/checkbox/chips/cards/image-choice), datepicker, rating/file/signature/uniqueid/mccombo,
  Map OSM (pin Paris), Content Slider, Video Embed (BigBuckBunny + watch-progress). Bảng đủ 45 tile.
- **`drag-drop-layout.md`** — GIF `11-drag-drop-build.gif` (4.8MB: kéo Input/Cards/Rating từ palette +
  drag-to-move bằng handle), GIF `12-rows-columns.gif` (4.6MB: thả Row, picker 3 cột, kéo Dropdown/Date/Time
  vào từng cột, Save Draft). + field Width, FlexGrid, Section Break multi-page.
- **`after-submission.md`** — ảnh live confirmation (ID + answer summary + CTA + fill-again),
  4 card settings (Confirmation/Respondent Email/Download/Redirect) + Notifications/Webhook/CustomURL/GA.
- **`multi-language.md`** — GIF `09-language-switch.gif` GHI LẠI = EN → Français → Deutsch (bỏ tiếng Việt),
  caption sửa. Cùng tên file, thay nội dung.
- `toc.yml`: +Controls & Widgets, +Drag & Drop Layout (sau Form Builder), +After Submission (sau Module Settings).

## §B. Site :5120 — thay đổi phiên này (đã dọn)

- **Form 26 "Widget Showcase (docs)"** (Published) — 24 field đủ loại widget, bind **module 53** `/try-multistep-live`.
- **Form 33 "Contact Us"** (Published) — name/email/message + postSubmitExperience đầy đủ (rich, ID,
  summary, fill-again, CTA "Back to homepage") + NotifyEmails, bind **module 52** `/try-it-live`.
  Submissions demo #46-#51 đã tạo khi chụp.
- Form nháp 27–32 (drag-test) **ĐÃ XOÁ** (`DELETE /api/MegaForm/Form/{id}` = 200).

## §C. ⚠️ Bug/finding phát hiện (chưa fix, docs đã viết HONEST tránh claim sai)

1. **Token `{{field:key}}` KHÔNG được nội suy trong Confirmation Message** khi render live
   (hiện nguyên văn `Thanks {{field:full_name}}`). UI Settings vẫn chào mời chip `{{field:*}}`.
   `{{submission:id}}` hiển thị qua block Submission ID riêng (works). → hoặc fix renderer
   (interpolate message với submitted values), hoặc bỏ field-token chips khỏi message UI.
2. **Palette tab listeners CHẾT sau khi palette re-render** (thêm field xong click tab Basic/Layout/Widgets
   có thể không chuyển — initPaletteTabs bind 1 lần lúc init). Repro không ổn định trong browser thật, cần check.
3. **POST /api/MegaForm/Form patch schemaJson trực tiếp**: DB đổi nhưng trang public vẫn serve schema CŨ
   khá lâu (memoize/SSR). Save qua BUILDER (đọc DOM inputs → save-draft/publish) thì invalidate ngay.
   Lưu ý toolbar save đọc từ **DOM inputs** (readFromUi) — mutate `B.state.schema.settings` suông sẽ bị đè.

## §D. Kỹ thuật ghi drag-drop (tái dùng — QUAN TRỌNG cho GIF builder sau này)

Scratchpad af1fba79: `rec-dragdrop.mjs` (+ d2-dragtest*.mjs). recorder-lib `toGifSegments` đã thêm
option `crop: 'W:H:X:Y'` (ffmpeg crop trước scale).
- Palette→canvas drag qua CDP mouse = **pointer-fallback** của builder (không phải Sortable):
  works cho mọi tile TRỪ `Row` (canvas.ts L1550 chặn type Row) → Row = mime drag + add qua
  `B.createFieldFromTemplate({type:'Row'})` lúc mouseup (nhìn y hệt).
- Kéo tile vào cột row: fallback hỗ trợ (`getPaletteDropTarget` closest `.mf-row-col`) — thi thoảng
  trượt → pattern **verify-and-correct**: đếm `row.columns[ci].fields` trước/sau, thiếu thì add API.
- **Reorder canvas item: grab `.mf-drag-handle`** (Sortable engage OK; grab giữa field dính filter input).
- **Field top-level KHÔNG kéo được vào row col** (by design, col Sortable put() reject
  `.mf-canvas-field`) — docs đã ghi đúng: "build rows from palette tiles".
- Row layout picker: `.mf-row-layout-btn[title="1|2|3|2/3+1/3|…"]` click thật OK.
- Submit button public form: `.mf-btn-submit` TRONG `.mf-form-inner` (đừng query `button[type=submit]`
  toàn trang — trúng nút Search Oqtane).
- Palette shots: panel `#mf-panel-left`, tab `a.mf-ptab[data-cat=basic|layout|plugins]`, switch tab
  bằng DOM manual (class active + display) vì listener có thể chết (§C.2).

## §E. Còn treo / NEXT

1. ~~User merge PR #5~~ ĐÃ MERGE + verify 200 (user xác nhận qua AskUserQuestion — auto-mode chặn self-merge, kể cả khi user nhắn "2"; cần option chọn tường minh).
2. Quyết định 2 bug §C.1 (field-token message) + §B handoff trước (form field-translation dead code).
3. Platform-first tracks (DNN / Web API / Razor) — chưa làm (kế thừa từ handoff trước).
4. Ảnh cho installation/quickstart/form-builder còn thiếu; `oq-dashboard.png`, `oq-premium-festa.png` chưa dùng.
5. Xoá nhánh remote đã merge cũ (danh sách ở handoff DOCS_AI_GIFS_LANG_E2E §F.5) + `docs/widgets-dragdrop-aftersubmit` sau khi merge.

Worktree: `../MegaformDocs-wt` @ `28c18f7` (detached, branch đã push). Memory:
[[project_20260708_docs_widgets_dragdrop_aftersubmit]].
