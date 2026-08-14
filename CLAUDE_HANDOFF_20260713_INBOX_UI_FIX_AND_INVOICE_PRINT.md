# HANDOFF 2026-07-13 (phiên 3) — Vá My Inbox (6 fix) + Chứng từ per-submission (Print 4 platform) + AI Database picker

> 2 việc owner giao (handoff phiên 2 §"VIỆC PHIÊN SAU"): (A) UI My Inbox hiển thị sai làm
> "Send to Inbox" trông như hỏng; (B) chưa có chứng từ invoice per-submission.
> **CẢ HAI ĐÃ XONG + VERIFY E2E trên :5123** (hot-swap; CHƯA vào package — cần pack 1.7.105).

## 1. (A) My Inbox — 6 fix, tag `[AssignedBadge fix 2026-07-13]` / `[BadgeCls fix 2026-07-13]` / `[TzFix 2026-07-13]` / `[Submitter fix 2026-07-13]` / `[AdHocAssign v20260713]`

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | Submitter "Unknown" | `normalizeMyInbox` (workflow-inbox/api.ts) map mọi field **TRỪ `submitters`** → client luôn thấy undefined (server trả đúng từ 07-12; chẩn đoán cũ "PascalCase w.submissionId" chỉ đúng một nửa — normalize đã lo case, map bị VỨT) | map `submitters` (camel+Pascal cả outer lẫn inner) |
| 2 | Badge "Assigned to Me" = 0 + tab rỗng dù server inProgress=7 | `isAssignedOpen` đòi `assignedUserId != null`; task ad-hoc AssignedUserId=NULL (match theo UserName) | `load()` stamp `assignedToMe=true` cho bucket inProgress (server đã quyết); `isAssignedOpen` nhận cờ đó HOẶC assignedUserId |
| 3 | Card claimed hiện "Pending" | `deriveStatus` không có nhánh status=2 (Claimed) | thêm status `'claimed'` → label **"In Review"** (badge indigo, icon eye); i18n `inbox.status_claimed` 406 file. **Bonus:** STATUS_CONFIG cls trước là `mf-mi-badge-*` — CSS chỉ có `mf-mi3-badge-*` → badge xưa nay XÁM không màu; đã đổi prefix đúng → mọi badge có màu |
| 4 | "7h ago" cho task mới (TZ +7) | server serialize UTC **không đuôi Z** ("2026-07-13T08:45:08.34") → `new Date()` đọc là giờ LOCAL | `parseServerDate()` (my-inbox/types.ts): ISO có T mà không offset → +Z. Áp mọi chỗ parse: types/view/ui/enrich/drawer. Xoá cụm helper "mirrored" DEAD trong index.ts (đã lệch bản gốc) |
| 5 | `CreateAdHocReviewTask` AssignedUserId=NULL + DisplayName=username thô | `TryParseUserId("host")` = null | resolve qua `_principalResolver.ResolveUser` (mirror `[ForwardResolve v20260711]`); user không tồn tại → **400 "User 'x' was not found"** thay vì task ma. Core service → cả 3 platform hưởng |
| 6 | Toast sau Send không nói task nằm đâu | — | "Sent {n} to {u} — shows under “Assigned to Me” in their My Inbox." (en/vi) |

- **Vùng trống dưới list** (nghi của owner): không tái hiện sau fix — render sạch tới đáy scroll (screenshot).
- **VERIFY :5123 (Playwright, host):** badge Assigned-to-Me=7; 7/7 card "In Review" indigo; tuổi task đúng ("34m/2h ago" khớp DB CreatedAt UTC); submitter "Host"/"Hoa (Employee)"; API test: SendSubmission → fin.lan → DB `AssignedUserId=3`, `AssignedDisplayName='Lan (Finance)'`; user ma → 400; task test đã XOÁ khỏi DB (demo owner giữ nguyên).
- 1 card "Unknown" còn lại = submission form 1 sub 1 có `UserId=NULL` (nộp anonymous) — ĐÚNG hành vi.

## 2. (B) Chứng từ per-submission — `[SubmissionPrint v20260713]`

**Trước:** Oqtane KHÔNG có route print nào (`/f/{id}/print` chỉ tồn tại MegaForm.Web; nút Preview trong builder Print tab trên Oqtane mở `/f/11/print` → 404 — gap có thật, đã thấy khi QA).

**Mới:**
- `MegaForm.Core/Services/PrintFormRenderer.cs`: overload `RenderHtml(form, schema, baseUrl, PrintSubmissionData)` — điền giá trị vào line/box (`.mf-print-filled`), tick checkbox/radio (`.is-checked` ✓), line-items table render rows thật từ RawValue JSON (+ Sub Total/Total tự cộng cột cuối nếu numeric), signature/image value → `<img>`, meta row = Date nộp (UTC) + `SUB-{id}` + Submitted by, **stamp trạng thái** góc title (INVOICED xanh / REJECTED đỏ / khác amber, xoay -4°). Form CHƯA bật PrintSettings vẫn in được chứng từ (fallback defaults; bản in form TRẮNG vẫn đòi Enabled như cũ). Dedup field theo key (bẫy fields/Fields kép). `PrintSubmissionData.FromDetail(detail)` build từ FieldSnapshots.
- **Endpoint Oqtane** `GET /api/MegaForm/Submissions/{id}/Print` (MegaFormController.cs, cạnh GetSubmission): auth = `CanViewSubmissionRow` y hệt GetSubmission (admin / approver giữ task / RLS rule) — **anonymous 403 fail-closed (đã test)**; toolbar Print/Save PDF + Close.
- **Twin Web** `GET api/MegaForm/Submissions/{id}/Print` (`[Authorize]` + `CanViewSubmissionRow` WebRLS).
- **Twin DNN (owner yêu cầu giữa phiên):** route mapper mới `MegaFormSubmissionPrint` (`Submissions/{submissionId}/Print` — CÙNG URL shape 4 platform) + action `SubmissionsController.Print` mirror gate của `Get` (CanViewSubmissionRow); `print-link.ts` đã bỏ gate ẩn nút DNN. Compile PASS; **runtime QA DNN chưa chạy** (cần site DNN sống + restart vì route mapper) — vào lượt build package DNN kế. **Umbraco print vẫn CHƯA** (client trên Umbraco sẽ mở URL → 404; cân nhắc ẩn nút Umbraco hoặc làm twin nốt).
- **Client** `my-inbox/print-link.ts` (MỚI, nhỏ): `submissionPrintUrl()` platform-aware (oqtane thêm authmoduleid/authsiteid; DNN → null → ẩn nút). Nút **Print** trong action bar detail (cả 2 host: My Inbox 3-pane + Submissions sheet — sheet mount chung standalone-detail); more-menu "Download PDF" giờ mở print (fallback CSV nếu platform không hỗ trợ). i18n `inbox.print` 406 file.

**VERIFY :5123:** SUB-119 (invoiced) → trang A4 stamp INVOICED, đủ Store/Vendor/Amount 2450.75/SGD…; SUB-120 field receipt in **tên file sạch** `receipt-BEQ-8841.png` (không JSON); inbox bar `[…, Print, Export]`; sheet bar `[Print, Export]`; bấm Print mở tab `/Submissions/129/Print` OK; anonymous fetch → 403.

## 3. (C) AI Database picker — `[AiDbPicker v20260713]` (owner yêu cầu giữa phiên)

Cửa sổ "Create form with AI" tab Database trước chỉ thấy DB hiện thời → giờ có **dropdown Data source**: "🗄 Current database (this site)" ⇄ các connection khai báo Settings.
- **Server (Oqtane + Web + Umbraco twins):** `GET AiTools/SqlConnections` (chỉ trả TÊN key) + `SqlTables`/`SqlColumns` nhận `?connectionKey=` — whitelist = `MegaForm:ExternalTables:AllowedConnections` (chung nguồn với ATBE; "DashboardDatabase" bị loại vì = current). Key ngoài whitelist → 400 "connection not allowed". Vá luôn rule-10: 2 action này không trả `ex.Message` nữa. **DNN chưa có** (client tự ẩn picker khi SqlConnections 404).
- **Client (`ai-form-creator.ts`):** state `activeConnection`; đổi nguồn → reset bảng chọn + columns cache theo connection + guard stale reply; status "13 tables · CustomerErp"; prompt AI khi chọn connection ngoài tự kèm RULE: mọi field SQL phải mang `optionsConnectionKey`/`widgetProps.connectionKey`/`databaseInsert.connectionKey` = key đó, CẤM app_batch DDL vào connection ngoài.
- **VERIFY :5123:** SqlConnections=["CustomerErp"]; CustomerErp→13 bảng LegacyErp_Demo + columns Vendors đúng; `connectionKey=DefaultConnection`→400; anon→403; UI picker + badge chọn bảng OK (screenshots qa-shots/ai-db-picker-*).

## 4. (D) RULE i18n — dọn tiếng Việt hardcode ATBE (owner RULE giữa phiên)

> RULE mới (đã ghi memory `feedback_no_hardcoded_vietnamese_i18n`): **không chuỗi UI tiếng Việt default** — code = English fallback qua `T()`/`wt()`, tiếng Việt ở `vi-VN.json`; server message English.

- `capability-card.ts` + `ai-designer.ts`: toàn bộ chuỗi → `wt('atbe.*', 'English')`; bỏ `toLocaleString('vi-VN')`.
- `db-tables-panel.ts` nút "⚡ Năng lực" → `S.buttonProbe` ("⚡ Capability") theo pattern `db-tables-strings.json` sẵn có (file này là local-JSON English — muốn per-locale thì migrate sau).
- `CapabilityDecisionEngine.cs`: 19 reason Message/HowToFix → English (Code giữ nguyên — client tương lai có thể map key). 
- Keys `atbe.*` (~57) chèn 406 file i18n (en mọi locale + vi cho vi-VN → owner dùng app tiếng Việt vẫn thấy tiếng Việt NHƯNG qua catalog, không hardcode).
- **VERIFY :5123:** modal = "Table capability — dbo.…", flags View detail/Submit new/Edit/Delete…, headers Column/SQL type/…, reasons "The machine concluded this because: RLS_DBO_BYPASS — The connection account is db_owner…" (screenshot atbe-capability-en.png).

## 5. Deploy state + việc còn lại

- **:5123 = working-tree hot-swap** (MegaForm.Core.dll + MegaForm.Oqtane.Server.Oqtane.dll + megaform-my-inbox.js + megaform-submissions.js + megaform-dashboard.js + bundles/megaform-builder.js + megaform-my-inbox-ts.css + i18n 39 locale ×3 thư mục). :5124 + mọi package CHƯA có.
- 🔴 **PACK 1.7.105**: gộp các fix phiên này + loạt 07-13 sáng (ReceiptUploadFix, SubmissionFilesFix, FileRowDedup, FileCellFix). **Nhớ bump `ModuleInfo.Version` + `AssetVersion`** — browser cache JS cũ dưới `?v` cũ (chính phiên này dính: nút Print không hiện tới khi clear cache; owner phải Ctrl+F5).
- Twin print DNN/Umbraco (nếu cần) + nút Preview builder Print tab trên Oqtane đang trỏ `/f/{id}/print` 404 (có thể trỏ sang endpoint mới khi không có submissionId? — cần quyết).
- Line-items totals: chỉ tự cộng cột CUỐI nếu numeric — form có cột thuế riêng cần cải tiến sau.
- Date in chứng từ đang **UTC** (server không biết TZ viewer) — cân nhắc format theo site-TZ nếu owner cần.
- tsc pre-existing error KHÔNG liên quan: `src/builder/workflow/wf-app.ts(785)` TS1128 (file không thuộc diff phiên này, đã có từ trước trên branch).

## 4. Screenshots QA
`scratchpad phiên 6b8e87a1/qa-shots/`: myinbox-after-fix, myinbox-assigned-view, invoice-print-119, inbox-print-button, sheet-print-button…
