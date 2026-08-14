# HANDOFF 2026-07-13 (phiên 2) — Bài demo ERP end-to-end + demo SỐNG trên :5123 (GIỮ LẠI cho owner kiểm tra)

> Yêu cầu owner: viết 1 bài DocFX theo đề bài demo của khách (master data → store → vendor →
> transaction+receipt → invoice → dashboard/reports), **KHÔNG sửa code MegaForm**, và **GIỮ LẠI
> form** để kiểm tra nội bộ. Mọi thứ dựng bằng config/SQL/API sản phẩm, tự tay verify từng bước.

## 1. Bài + publish

- Bài: `Docs/docfx/articles/erp-end-to-end.md` + GIF `14-erp-demo.gif` (5.02MB) + 2 PNG
  (`oq-erp-dashboard.png`, `oq-erp-report.png`). Toc: mục "End-to-End Demo: ERP Flow" trong nhóm Oqtane.
- **Đã merge master MegaformDocs (`bb571b6`)** → Actions tự build → live
  `https://cisssolution.github.io/MegaformDocs/articles/erp-end-to-end.html`.

## 2. Demo SỐNG trên :5123 — GIỮ NGUYÊN (owner kiểm tra nội bộ)

| Thứ | Ở đâu |
|---|---|
| Master data | DB `LegacyErp_Demo`: `dbo.Country` (8), `dbo.Currency` (7), `dbo.Stores` (3, form ghi vào), `dbo.Vendors` (3) |
| Trang | `/erp-demo` (page 36) + con: `/erp-demo/store` (37, module 39), `/erp-demo/vendor` (38, 40), `/erp-demo/transaction` (39, 41) |
| Forms | **Store=8, Vendor=9, Transaction=10** (Published; tạo qua `POST /api/MegaForm/Form?entityid=`) |
| Dropdown SQL | field `properties`: `optionsSource:'sql'`, `optionsConnectionKey:'CustomerErp'`, `optionsSql:'SELECT value,label…'` (connection resolve từ appsettings ConnectionStrings — `OqtaneConnectionRegistry`) |
| Mirror ERP | `settings.databaseInsert` (INSERT + `:field` tokens) — Store→dbo.Stores, Vendor→dbo.Vendors, verified từng dòng |
| Workflow form 10 | envelope Draft+Applied, `Finance review — issue invoice` (role Finance), approved→**`invoiced`**, rejected→`rejected`. ⭐**PHẢI có `StartNodeId`** — thiếu là engine chạy 0 node, execution "completed" IM LẶNG |
| Transactions | 118 pending_approval, 119 invoiced, 120 pending (CÓ receipt MF_Files FileId 1), 121 invoiced (tạo+duyệt trong GIF) |
| Users demo | emp.hoa submit, fin.lan duyệt (pass `Qa@2026x`) |

## 3. 🐛 BUG PHÁT HIỆN — TRẠNG THÁI SAU PHIÊN VÁ 2026-07-13 (owner yêu cầu fix upload)

### ✅ ĐÃ VÁ + VERIFY E2E trên :5123 (build từ working tree, hot-swap JS + Core/Server DLL, restart)
1. **File upload không chạy trên trang render Oqtane** → vá 3 chỗ, tag `[ReceiptUploadFix v20260713-01]`:
   - `MegaForm.UI/src/renderer/file-upload-client.ts` (MỚI) — upload qua `POST {api}Upload/File` (server tự
     validate policy), trả metadata.
   - `MegaForm.UI/src/renderer/interactive.ts` `bindFileUploads` — fieldKey đọc `data-field-key` (input SSR không
     có name); upload thật khi chọn file (item ⏳ → ✓); ghi `JSON.stringify(metas)` vào hidden input; remove/× clear hidden.
   - `MegaForm.UI/src/renderer/validation.ts` `collectFormData` nhánh File — ƯU TIÊN gửi hidden metadata
     (trước đây chỉ gửi TÊN file và chỉ khi input có name → server không bao giờ nhận metadata).
2. **`files:[]` trong GET Submissions/{id}** → `[SubmissionFilesFix v20260713]`: Oqtane ctor nhận
   `MegaForm.Core.Interfaces.IFileRepository` truyền vào `SubmissionQueryService` (trước: null);
   **Web twin** cũng vá (`_fileRepo` đã inject sẵn mà vẫn truyền null). DNN vốn đúng, không đụng.
   → Drawer submissions + Inbox detail giờ hiện mục **Attachments (n)** + link tải (mapAttachments/enrich.ts có sẵn, chỉ thiếu data).
3. **MF_Files ghi ĐÔI mỗi upload** — schema builder-saved có CẢ `fields` LẪN `Fields` → field File đi qua
   extractor 2 lần → `[FileRowDedup v20260713]` trong `MegaForm.Core/Services/SubmissionFileMetaExtractor.cs`
   (dedup fieldKey+path+name+size; 2 upload thật luôn khác tempPath nên không mất gì). 10/10 unit test pass.
   **VERIFY:** sub 126 (trước dedup, đã xoá dòng thừa FileId 3), sub **127 = đúng 1 dòng**; drawer
   "ATTACHMENTS (1)" + inbox task SUB-120 "ATTACHMENTS (1) receipt-BEQ-8841.png" + 1 link download.
   ⚠️ Deploy mới chỉ hot-swap trên **:5123**; :5124 và mọi package cũ CHƯA có — cần vào bản pack 1.7.105.
   ⚠️ Browser user cache JS cũ dưới cùng `?v=20260712-B396` → bảo owner **Ctrl+F5**. Submissions cũ (123/124
   Vendoraa) KHÔNG khôi phục được file (file chưa từng rời máy client).
   ⚠️ Nhánh duplicate `fields`/`Fields` còn có thể ảnh hưởng consumer khác (DatabaseInsert chạy đôi? CHƯA kiểm) — đáng audit riêng.

4. **Regression sau fix upload: grid in NGUYÊN JSON metadata ở cột field File** → `[FileCellFix v20260713]`
   trong `MegaForm.UI/src/submissions/SubmissionsShell.ts` `renderCell` nhánh `f:` — dùng helper SẴN CÓ
   `file-links.ts` (`isStructuredSubmissionFileValue` + `renderSubmissionFileLinks`) → cell hiện
   `📎 tên-file (size)` là link tải (stopPropagation để không mở drawer khi bấm link). Các view cũ
   (SubmissionFormView, detail-data-tab) đã dùng helper này từ trước — chỉ grid mới (SubmissionsShell) thiếu.
   VERIFY: cột File Upload form 11 hiện link `receipt-….png (602 B)` → `Files/Download`.

### 🌍 ĐỔI DEMO SANG ĐỊA DANH TƯỞNG TƯỢNG (owner yêu cầu — không dùng Việt Nam)
- Zephyria (ZR) / Port Meridian / Zephyrian Crown (ZRC, Ƶ) thay VN / Đà Nẵng / VND — cập nhật
  `LegacyErp_Demo` (Country, Currency, Stores ST-001, Vendors Acme + phone/tax) + site DB
  (form 8 placeholder, DataJson + MF_SubmissionValues forms 8/9/10, amount 118 → 15500.00).
- **GIF 14 quay lại** (thêm cảnh upload receipt thật ⏳→✓ trong Seg B — quay trên `/api/MegaForm/render/10`
  vì trang `/erp-demo/transaction` đang bị owner bind sang form Vendoraa 11) + 2 PNG chụp lại.
- Bài `erp-end-to-end.md` cập nhật (ví dụ Zephyrian Crown, đoạn receipt nêu link tải, dòng receipt-% count-agnostic)
  → **merged master `0cd9c2b`**, live sau khi Actions build.

## 🔴 VIỆC PHIÊN SAU — 2 vấn đề owner báo (2026-07-13 chiều, ĐÃ CHẨN ĐOÁN SẴN)

### A. "Send to Inbox" — chức năng CHẠY ĐÚNG server-side, hỏng ở HIỂN THỊ My Inbox
Owner chọn 5 submission Vendoraa → Send to Inbox → gõ username `host` → Send → mở inbox "không thấy".
**Đã điều tra:**
- Client POST `Workflow/Tasks/SendSubmission` từng submission → server `CreateAdHocReviewTask` TẠO ĐỦ task:
  MF_WorkflowTasks có 7 dòng `Review submission`, `Status='claimed'`, `AssignedUserName='host'`
  (⚠️ `AssignedUserId=NULL` — service match fallback theo UserName nên vẫn đúng bucket).
- **API `Workflow/MyInbox` của host trả ĐÚNG: `inProgress=7` (đủ 7 task), incoming=5** — server OK 100%.
- Task NẰM Ở BUCKET **"Assigned to Me"** (vì được assign thẳng), KHÔNG phải "Inbox" — owner đang xem tab Inbox.
**Bug UI cần fix (my-inbox client):**
1. Sidebar **"Assigned to Me" KHÔNG hiện badge đếm** (phải hiện 7) → user không biết có đồ ở đó.
2. Card của task ad-hoc hiển thị **"Pending"** dù Status=claimed (mapping status→label sai cho task không
   có PendingSubmissionStatus config) + submitter **"Unknown"** (bug client `submissionId` PascalCase đã ghi §trước)
   + **"7h ago" cho task vừa tạo** (bug lệch múi giờ VN +7 trong age calc) → task mới trông y hệt task cũ.
3. Cân nhắc UX: sau Send, toast nên nói rõ "vào Assigned to Me của <user>"; hoặc task ad-hoc nên vào bucket
   Inbox (pending, claimable) thay vì auto-claimed?
4. Nhỏ: `CreateAdHocReviewTask` nên resolve + set `AssignedUserId` (hiện NULL, chỉ set UserName/DisplayName).
5. Screenshot owner có vùng TRỐNG dưới cùng list (nghi render/virtualize) — kiểm khi fix.

### B. "Xuất invoice" — CHƯA CÓ tính năng sinh chứng từ per-submission (xác nhận lại)
Trạng thái hiện tại (đã verify): approval đổi status → `invoiced` (bookkeeping OK); Reports có donut
invoiced/pending; **nhưng KHÔNG có document hoá đơn**: tab Print chỉ render FORM TRỐNG (`/f/{id}/print`),
Export = CSV data, không phải chứng từ. Hướng làm (chọn 1, đề xuất #1):
1. **Mở rộng Print-Ready layout nhận `?submissionId=`** → merge dữ liệu submission vào layout A4 → nút
   "Print / Download PDF" trong drawer chi tiết + inbox. Tự nhiên nhất, tái dùng hạ tầng Print tab sẵn có.
2. Đăng ký **Database service-task executor** trên Oqtane (hiện opt-in, chưa registered — Startup.cs:157-171)
   → workflow INSERT dbo.Invoices khi approve (số hoá đơn tự sinh).
3. SendEmail node gửi invoice email khi approve (executor đã có; cần SMTP + template).

### ⏳ CHƯA VÁ (giữ nguyên từ phiên trước)
1. **⭐⭐form-lookup dropdown CHỈ chạy trên DNN** — Oqtane (`MegaFormController.cs:1314` — giờ đã có sẵn
   `fileRepo` param, thêm `ISubmissionRepository` là 1 dòng) + Web (`:937`) không truyền submissionRepo → options rỗng im lặng.
2. **⭐SQL options 2 cột TRÙNG TÊN → 0 options** — phải alias cột label (đã ghi chú trong bài docs).
3. Tab Print = layout in FORM TRỐNG (`/f/{id}/print`), không phải chứng từ per-submission.
4. SendEmail executor đã đăng ký trên Oqtane nhưng :5123 không SMTP → chưa verify gửi thật.
5. Workflow form 11 (Vendoraa của owner): sub 126/127 KHÔNG tạo task (chỉ 124 có) — có thể workflow chưa Apply
   hoặc trigger config; chưa điều tra (ngoài scope phiên này).

## 4. Số liệu/quy trình đã verify (được viết trong bài)

- Dropdown Country (8) + Currency (7 kèm symbol) nạp SQL sống; thêm row là dropdown có ngay.
- 3 store + 3 vendor submit qua form → mirror đúng 100% vào dbo.Stores/dbo.Vendors.
- Transaction submit → task Finance tự tạo (`pending_approval`) → fin.lan approve → **`invoiced`** (2 lần: 119 + 121-trong-GIF).
- Upload receipt qua API sản phẩm → MF_Files (FileId 1, sub 120) + download URL private.
- Reports modal: Status Breakdown **invoiced 2 / pending_approval 2**, Field Completion (receipt 25% = 1/4), Submissions Over Time, Export.
- Dashboard all-forms: 500,017 total, chart volume, bảng per-form.

## 5. Scratchpad phiên này

`...\b08e6461-...\scratchpad`: `seed-erp-demo.mjs` (pages+forms), `seed-erp-data.mjs`, `fix-txn-*.mjs`,
`probe-erp1..9.mjs`, `rec-erp-demo.mjs` + `reencode-erp.mjs` (webm còn trong `video/erp-demo`).
