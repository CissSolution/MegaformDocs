# CLAUDE HANDOFF — 2026-07-08 (tối): Docs Oqtane-first + ảnh/GIF thật — ĐÃ PUBLISH (PR #2)

Tiếp nối CLAUDE_HANDOFF_20260708_PDF_WIDGET_CARD_CLIPBOARD.md (PDF widget + docs AI/multi-lang).
User yêu cầu (4 + 2 bổ sung): (1) landing page giới thiệu bằng ẢNH (premium/standard/RTL/widgets),
(2) trang lưu trữ mở rộng (Google Sheets, DB), (3) trang Settings pane + GIF, (4) gom 7 bài SDK vào
mục "Programming", (5) seed nhiều submissions, (6) tài liệu Submissions/Inbox/Workflow + GIF.
**ƯU TIÊN OQTANE TRƯỚC** (chỉ đạo mới). "Auto làm và đẩy lên GitHub" — đã tự PR + merge.

## Đã ship (PR #2 `docs/oqtane-user-guide-visuals` → master `61afc97`)

- **index.md (landing MỚI)**: giới thiệu MegaForm bằng ảnh thật — Outback + EuroYouth (premium),
  standard wizard form, **RTL Ả Rập**, PDF widget, wellness widgets, submissions analytics, BPMN
  canvas. 2 bảng "Start here": Oqtane user guide + Programming.
- **settings-pane.md MỚI** (+ GIF 05, 3.98MB): ⚙ Settings pane — Module form (chọn form hiển thị),
  Theme & Layout (16 preset + palette editable per-preset), Layout/Typography/Corner/Page integration.
- **submissions-inbox.md MỚI** (+ GIF 07, 1.58MB): analytics (44 subs, chart, trend/completion),
  per-form grid (Manage Columns, status New/Processed/Pending, export), My Inbox (folders, claim/
  approve/reject/forward theo ApprovalNodeConfig).
- **storage-options.md MỚI**: Database Settings (reusable named connections + Test Connection;
  per-form DatabaseInsert fail-soft; Service Task (DB)), Google Sheets (service account JSON +
  per-form Connect + Service Task (Sheet)), webhooks/email/files.
- **workflow.md**: thêm GIF 06 (3.73MB) + ảnh BPMN canvas thật; palette nodes, Samples ("Smart
  starter workflow"), Validate/Test/Save Draft/Apply.
- **TOC**: nhóm "Using MegaForm on Oqtane" (9 bài user-guide) + "Programming" (Overview,
  Installation, Standalone Host, Quick Start, SDK Reference, Reading Data, File Download,
  2 consumers, Razor examples, Template JSON, API Stability). Guides homepage → creating-forms.
- **14 ảnh + 3 GIF mới** trong `Docs/docfx/images/` (oq-*.png, 05/06/07-*.gif).

## Trạng thái site :5120 (PROD test của user) — thay đổi trong phiên

- **Form 23 MỚI "نموذج التواصل"** (Arabic contact, SQL INSERT) — dùng cho ảnh RTL. Giữ được (demo).
- **46 submissions demo** seeded qua API公 Submit (forms 19×14, 1×9, 5×8, 20×7, 23×6+2 test).
- **Form 19 có DraftWorkflow** (BPMN sample MF240423-APPROVAL-SPLIT, Apply từ phiên ghi GIF).
- Module try-it-live: đã KHÔI PHỤC về form #19 + preset Default sau khi ghi GIF settings.

## ⭐ Gotchas mới (đừng vấp lại)

- **Submit API + `submissionTime` → 200-EMPTY, KHÔNG persist** (class STJ 200-EMPTY). Seeder phải
  check `body.success===true`, không phải `resp.ok` (44 lần "OK" đầu = 0 rows!).
- Seeder validation: Composite key `email` cần EMAIL hợp lệ; `Checkbox` CÓ options = multi-select
  → mảng value hợp lệ (không phải bool); bool chỉ cho checkbox consent không options.
- **UI admin theo display-language của user** (host = tiếng Việt) → ảnh docs tiếng Anh phải thêm
  `?mflocale=en-US` (persist chỉ trong localStorage browser headless — không ảnh hưởng user).
  Render page cũng vậy (wellness từng lộ "Chọn ngày...").
- Module action "Settings" là `<a class="mf-oq-btn">` KHÔNG phải `<button>`.
- Settings popup = `.mf-vd-overlay`; tabs = button text "Module form"/"Theme & Layout"; form select
  `select.mf-vd-input`; save `.mf-vd-btn-primary`. Preset cards là leaf div (click deepest-text).
- BPMN designer: builder → nút "BPMN"; canvas `.react-flow`; Samples → "Load into Canvas" → "Apply
  BPMN"; workflow lưu vào `MF_Forms.WorkflowJson` dạng `{"DraftWorkflow":{...}}`.
- GIF pipeline tái dùng từ scratchpad session `af1fba79` (recorder-lib.mjs + gif-encoder-2 trong
  node_modules ở đó; chạy cwd = thư mục đó). Đã thêm `rec-settings-pane.mjs`, `rec-workflow.mjs`,
  `rec-submissions.mjs`, `reencode-settings.mjs` tại đó. GIF >5MB → re-encode fps4/width460/q30.
- Auto-mode: chặn UPDATE SQL không WHERE (và cả WHERE FormId IN — DB tên "Prod") → bỏ backdate
  SubmittedOnUtc; chart volume dồn 1 ngày (chấp nhận được).

## Việc còn treo / next session

1. **My Inbox chưa có task thật** (sample workflow không có User Task) → muốn GIF approve thật:
   thêm User Task vào flow form 19 (BPMN palette) → submit → task → ghi GIF claim/approve.
2. Ảnh `oq-dashboard.png`, `oq-premium-festa.png` đã commit nhưng CHƯA được trang nào dùng —
   dành cho đợt sau (form-builder.md / DNN track).
3. Track DNN / Web API / Razor (platform-first §A.1 handoff DOCS_USER_GUIDE_REVISION) chưa làm.
4. `form-builder.md`, `creating-forms.md` chưa có ảnh builder tĩnh (chỉ GIF cũ).
5. Nhánh remote có thể xoá: docs/fix-ci-sdk-build (rỗng), docs/ai-multilang-and-ci-fix (merged),
   docs/oqtane-user-guide-visuals (merged), docs/creating-forms-gifs (merged).
