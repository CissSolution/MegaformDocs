# HANDOFF — KẾ HOẠCH: Dựng bài ERP của khách 100% BẰNG AI, từng bước qua prompt

## 🟢 CẬP NHẬT 07-14: ĐÃ CHẠY TỚI **BƯỚC 5a PASS** — xem `CLAUDE_HANDOFF_20260714_AI_ERP_AND_AI_CREATOR_FIXES.md`
> BƯỚC 1b/2/3/4/5a đều PASS trên :5125 (Country 8 · Currency 7 · Stores 3 · Vendors 3 · Transactions 1 · MF_Files 1).
> Trong lúc chạy phát hiện + vá **7 lỗi sản phẩm** (commit `d874699`, `e59bebb`) — trong đó lỗi nặng nhất:
> **dropdown SQL trả `[]` im lặng trên Oqtane/Web** khi field thiếu `optionsConnectionKey`.
> **Phiên sau bắt đầu từ BƯỚC 5b (cascade).** Bảng dưới là trạng thái CŨ (07-13), giữ để tham chiếu.

## ⚡ TRẠNG THÁI SAU PHIÊN 07-13 ĐÊM — BƯỚC 0 XONG + BƯỚC 1a ĐÃ PASS

| Hạng mục | Trạng thái |
|---|---|
| **Gói 1.7.105** | ✅ PACKED `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.105.nupkg` (79.2MB, đủ 17 templates gồm tabbed-account-setup 92,257B, AssetVersion `20260713-B397`). Để pass gate i18n:check đã vá 35 key drift (wiz.import.*/vd.set.*/inbox.claim, fallback trích từ code) + parity-sync 4040 key-value cho 38 locale → **PASS**. |
| **Site test MỚI = :5125 Fresh1804** | ✅ `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1804`, DB `Oqtane_MegaForm_Fresh1804`, host/abc@ABC1024, module 1.7.105 (29 bảng MF_), module MegaForm trên **Home** (`/?mfpanel=dashboard`), JS chạy `?v=20260713-B397`. ⭐SOP bẫy đã xử: template nhiễm 1.6.5 (7 DLL+wwwroot) đã dọn; `Database.DefaultDBType` template là **Sqlite** → phải ghi đè SqlServer; reset InstallationId/Version; xoá Data/*.db cũ. |
| **AI key** | ✅ Dùng **key OWNER gửi 07-13** (sk-proj-Fqv…, chat gpt-4o test OK) — đã seed vào Setting site 1 (`MegaForm_AI_*`, ApiKey IsPrivate=1) + verify GET DefaultConfig trả enabled/gpt-4o/keyLen=164. Key backup (Prod1797, cũng sống): scratchpad phiên `6b8e87a1`/`ai-key-prod1797.txt`. ⭐Seed AI config bằng SQL MERGE vào bảng `Setting` rồi RESTART site (settings cache). |
| **BƯỚC 1a (DDL Master Data)** | ✅ **PASS bằng 1 prompt** — bảng `Country`(CountryCode char(2) NOT NULL, CountryName nvarchar(100), CreatedOnUtc) + `Currency`(CurrencyCode char(3), CurrencyName nvarchar(100), Symbol nvarchar(8), CreatedOnUtc) TẠO THẬT trong site DB + form "Country Admin" (Draft). ⭐**FINDING: app_batch TỰ APPLY ngay khi AI trả lời** (không cần bấm Save) rồi đóng modal — kế hoạch các bước sau phải tính điều này (verify bằng DB sau mỗi prompt). Prompt đã dùng = nguyên văn Prompt 1a trong §3. |
| **Còn lại** | BƯỚC 1b (seed data) → 9. Chưa cài 1.7.105 lên :5124 (không cần nữa — :5125 là site test chính). PK của Country/Currency chưa soi index (kiểm khi làm bước Edit). |

> **Đề bài owner (2026-07-13):** dùng đúng bài toán ERP khách đã đưa (Master Data → Store → Vendor →
> Transaction + receipt → Invoice → Dashboard/Reports — nguyên văn ở §1) nhưng lần này **AI tạo và
> chỉnh sửa form** (SQL-connected, cascade fields…) **qua NHIỀU prompt nhỏ, mỗi bước một prompt** —
> KHÔNG bắt AI ăn 1 prompt to. Người chỉ: gõ prompt, bấm Apply/Save, verify. So chuẩn với bản dựng
> TAY phiên trước (`Docs/docfx/articles/erp-end-to-end.md`, forms 8/9/10 trên :5123 — GIỮ NGUYÊN làm đối chứng).

## 0. Mục tiêu & nguyên tắc đo (đọc trước khi chạy)

1. **AI-first nghiêm ngặt:** không sửa tay SchemaJson/SettingsJson. Được phép: gõ prompt, chọn bảng
   trong tab Database, bấm nút sản phẩm (Send/Apply/Save/Approve), sửa PROMPT rồi thử lại.
   Chỗ nào buộc phải làm tay → **DỪNG, ghi lại** (đó là finding, không phải thất bại của phiên).
2. **Mỗi bước ghi 3 số:** số prompt đã gõ / số lần AI bị máy trả lại (validator/422) / kết quả PASS-FAIL.
   Cuối phiên tổng hợp thành bảng "AI làm được — cần người — prompt tốt nhất" (tư liệu cho bài docs
   "Build an ERP with AI" nối tiếp bài erp-end-to-end).
3. **Prompt tiếng Anh** (system prompt AI là tiếng Anh; form content owner muốn English cho demo khách).
4. Mỗi bước PASS mới sang bước sau — đúng tinh thần "tách nhỏ" của owner.

## 1. Đề bài khách (nguyên văn, dùng làm acceptance gốc)

1. **Master Data** — Create Country and Currency database tables; populate sample data; no UI needed.
2. **Store MegaForm** — Country + Currency fields dùng **data-source–driven reference dropdowns**.
3. **Vendor MegaForm** — các field cần thiết.
4. **Transaction MegaForm** — reference Store / Vendor / Country / Currency + **upload Vendor Receipt**.
5. **Invoice Generation** — transaction hoàn tất → tự sinh Invoice đủ chi tiết transaction/store/vendor/country/currency.
6. **Dashboard & Reports** — dashboard key metrics + reports: Stores, Vendors, Transactions, Country-wise,
   Currency-wise, Transaction summary with invoice status.

## 2. Môi trường & chuẩn bị (bước 0 — bắt buộc)

| Việc | Chi tiết |
|---|---|
| **Pack 1.7.105 TRƯỚC** (việc treo từ p3) | Gộp mọi hot-swap 07-13 (ReceiptUploadFix, SubmissionFilesFix, FileRowDedup, FileCellFix, 6 fix My Inbox, SubmissionPrint 4 platform, AiDbPicker, i18n atbe). Bump `ModuleInfo.Version` + `AssetVersion`. Pack thủ công theo ⭐Pack gotchas (nuspec, -NoPackageAnalysis). |
| Site test | **Ưu tiên: cài 1.7.105 lên :5124 (Fresh1803)** → test trên site sạch, không đụng demo owner ở :5123. Fallback (không kịp pack): chạy ngay trên :5123 — forms AI đặt tên prefix **"AI ERP — …"** để không lẫn 8/9/10. |
| AI provider | `POST /api/AiAssistant/DefaultConfig?siteId=1` (xem `reference_demo_gif_recording`); mở Create-with-AI gõ thử 1 prompt bất kỳ xác nhận trả schema. |
| DB cho Master Data | **DashboardDatabase/site DB** (app_batch DDL chỉ được phép vào DB mặc định — prompt đã CẤM DDL trên connection ngoài). Biến thể ngoài (bonus B): dropdown đọc `CustomerErp` qua **AiDbPicker** mới. |
| Login | host/abc@ABC1024; users demo mgr.nam/fin.lan/emp.hoa (`Qa@2026x`) nếu chạy :5123. |
| ⚠️ Cache | JS mới dưới `?v` cũ — Ctrl+F5/clear cache trước khi kết luận "không có nút". |

## 3. Kế hoạch từng bước — prompt mẫu + acceptance

### BƯỚC 1 — Master Data: 2 bảng + sample data (đề mục 1)
**Thao tác:** Dashboard → Create form with AI → tab Chat.
**Prompt 1a:**
> Create two master-data database tables (no real form needed — if a form is mandatory, one minimal admin form is fine):
> `Country` (CountryCode char(2) PK, CountryName nvarchar(100) NOT NULL) and
> `Currency` (CurrencyCode char(3) PK, CurrencyName nvarchar(100) NOT NULL, Symbol nvarchar(8)).

**Prompt 1b (seed):**
> Insert sample rows: 8 countries (US, GB, SG, JP, AU, DE, FR, and the fictional ZR "Zephyria") and
> 7 currencies (USD $, GBP £, SGD S$, JPY ¥, AUD A$, EUR €, and ZRC Ƶ "Zephyrian Crown").

**Acceptance:** tab Database hiện `Country` + `Currency`; expand đúng cột; PreviewSql/`⚡ Capability` thấy ≥1 dòng data.
**Bẫy/fallback:** `app_batch` sinh DDL qua DryRunValidate/ExecuteDdl — **CHƯA RÕ ops có hỗ trợ INSERT seed không** (khảo sát 10' đầu bước: đọc `ops.ts` dispatcher + AiTools ExecuteDdl có nhận INSERT?). Nếu KHÔNG: cho AI VIẾT các câu INSERT (chat), người chạy qua công cụ sẵn có duy nhất được phép (sqlcmd) — ghi finding: *"thiếu op seed-data"* (feature request cho AI creator).

### BƯỚC 2 — Store form: reference dropdown SQL (đề mục 2)
**Thao tác:** Create form with AI → tab Database → tick `Country` + `Currency` (badge 2) → Chat.
**Prompt 2:**
> Create a "Store" form: Store Code (text, required), Store Name (text, required), Address (textarea),
> Country (dropdown loaded FROM the Country table), Currency (dropdown loaded FROM the Currency table),
> Opening Date (date). Use the attached tables for the two dropdowns.

**Acceptance:** field Country/Currency có `properties.optionsSource:'sql'` + optionsSql `SELECT ... AS value, ... AS label`; render form → 2 dropdown NẠP SỐNG đủ 8/7 options; **thêm 1 row Country bằng SQL → reload form thấy ngay** (đúng claim "data source–driven").
**Bẫy:** ⭐SQL 2 cột trùng tên → 0 options (bắt AI alias `AS value/AS label` — nếu AI quên, sửa bằng PROMPT: "fix the dropdown SQL: alias the columns as value and label"). KHÔNG dùng form-lookup (bug Oqtane còn treo — options rỗng im lặng).

### BƯỚC 3 — Store: ghi mirror vào bảng (nối dài đề mục 2, biến thể "form → SQL")
**Prompt 3 (edit qua AI Designer trong builder của form Store):**
> When this form is submitted, also INSERT the submission into a `Stores` table
> (create the table if missing: StoreCode, StoreName, Address, CountryCode, CurrencyCode, OpeningDate).

**Acceptance:** submit 3 store → `SELECT * FROM Stores` = 3 dòng đúng giá trị; đây là nguồn cho dropdown Store ở bước 5.
**Bẫy:** `settings.databaseInsert` + `:field` tokens (AI biết — system prompt dòng 169); ⭐SaveForm field vắng bị GHI ĐÈ — edit phải qua AI Designer trong builder (nó gửi full schema), không PATCH tay.

### BƯỚC 4 — Vendor form (đề mục 3)
**Prompt 4:** (attach `Country`)
> Create a "Vendor" form: Vendor Name (required), Contact Name, Email (email), Phone (phone),
> Tax ID, Country (dropdown from the Country table). On submit, INSERT into a `Vendors` table (create if missing).

**Acceptance:** như bước 2+3 (form render + dropdown sống + mirror `Vendors` 3 dòng).

### BƯỚC 5 — Transaction form: 4 reference + CASCADE + receipt (đề mục 4) ⭐bài khó nhất
**Thao tác:** attach 4 bảng `Stores`, `Vendors`, `Country`, `Currency` → AI có SMART MULTI-TABLE ANALYSIS.
**Prompt 5a (khung):**
> Create a "Transaction" form with reference dropdowns: Store (from Stores), Vendor (from Vendors),
> Country (from Country), Currency (from Currency), plus Amount (number, required),
> Transaction Date (date), Description (textarea), and "Vendor Receipt" (file upload).

**Prompt 5b (cascade — prompt RIÊNG, đúng yêu cầu tách bước):**
> Make the dropdowns cascade: when a Country is picked, the Vendor dropdown reloads and only shows
> vendors of that country (Vendors.CountryCode), and the Currency dropdown reloads to the currencies
> matching that country. Use dependent options (optionsDependsOn + :countryCode placeholder).

**Acceptance 5a:** 4 dropdown nạp sống; upload receipt chọn file → item ⏳→✓ (ReceiptUploadFix); submit → MF_Files **đúng 1 dòng** (FileRowDedup) + drawer "Attachments (1)" + link tải.
**Acceptance 5b (cascade):** chọn Country=SG → Vendor chỉ còn vendor SG, đổi Country → Vendor reload; key snake_case + placeholder camelCase (`country_code` → `:countryCode` — renderer tự normalize).
**Bẫy:** cascade chuẩn = `optionsDependsOn:["country_code"]` + `optionsReloadOnChange:true`; nếu AI trả middle bằng DataRepeater → prompt sửa: "the Vendor stage must be a Select, not a DataRepeater".

### BƯỚC 6 — Invoice Generation (đề mục 5) ⭐ranh giới AI hiện tại
Thực tế sản phẩm: "invoice" = workflow Approval → `ApprovedSubmissionStatus:'invoiced'` + **chứng từ = nút Print** (`Submissions/{id}/Print`, stamp INVOICED — ship phiên p3).
**Thử AI trước (đo năng lực):** trong builder Transaction, prompt AI Designer/chat:
> Add an approval workflow: on submit create a Finance review task; when approved set the submission
> status to "invoiced", when rejected set "rejected".

**Kỳ vọng:** AI creator hiện KHÔNG sinh WorkflowJson (chưa từng thấy op này) → nếu fail sau 2 prompt: dựng workflow bằng **builder BPMN/Workflow Library tay** (ghi finding "AI chưa phủ workflow" — đây là gap cần feature `workflow op` cho AI). ⭐Nhớ bẫy: WorkflowJson PHẢI có `StartNodeId`; builder Save từng XOÁ WorkflowJson (đã vá).
**Acceptance:** submit transaction → task Finance (fin.lan) → Approve → status `invoiced`; mở submission → **Print** → trang A4 stamp INVOICED đủ chi tiết store/vendor/country/currency (đề bài "invoice includes all relevant details" — nếu thiếu field nào trong bản in, đó là finding cho SubmissionPrint).

### BƯỚC 7 — Dashboard & Reports (đề mục 6)
- Key metrics + per-form: **dashboard sẵn có** + Reports modal (Status Breakdown donut invoiced/pending, Field Completion, Over Time, Export) — không cần AI; chụp đối chiếu như bài phiên trước.
- **Country-wise / Currency-wise (AI-built report):** tạo form report bằng AI:
> Create a read-only "ERP Report" form with two data grids: (1) transactions per country —
> `SELECT c.CountryName, COUNT(*) AS Transactions, SUM(t.Amount) AS Total FROM ...` grouped by country;
> (2) totals per currency. Use DataGrid/DataRepeater with masterQuery on the attached tables.

  (Cần bảng `Transactions` mirror — nếu bước 5 chưa mirror, thêm prompt databaseInsert như bước 3.)
- **Transaction summary with invoice status:** Reports modal của form Transaction (donut theo status).
**Acceptance:** đủ 6 mục report khách đòi, ghi rõ mục nào = tính năng sẵn, mục nào = AI dựng.

### BƯỚC 8 — (BONUS nếu còn giờ) Biến thể EXTERNAL DB
Lặp bước 2 nhưng chọn **Data source = CustomerErp** trong tab Database (AiDbPicker mới) → AI phải tự gắn
`optionsConnectionKey:"CustomerErp"` (đã nhét RULE vào prompt phiên p3). Acceptance: dropdown nạp từ
LegacyErp_Demo; schema form KHÔNG chứa connection string; bảng mới vẫn KHÔNG được tạo trên CustomerErp.

### BƯỚC 9 — Tổng kết + tư liệu
- Bảng kết quả: bước / số prompt / số lần validator trả lại / PASS-FAIL / prompt tốt nhất (verbatim).
- Screenshot mỗi acceptance + (nếu kịp) GIF pipeline như `reference_demo_gif_recording`.
- Cập nhật handoff + memory; liệt kê feature-gap phát hiện (ứng viên: seed-data op, workflow op, …).

## 4. Acceptance TỔNG (checklist cuối phiên — map 1:1 đề khách)

| # | Đề khách | Đạt khi |
|---|---|---|
| 1 | Country+Currency tables + data, no UI | 2 bảng + sample rows, sinh từ prompt (hoặc AI-viết-SQL, ghi rõ) |
| 2 | Store form, dropdowns data-driven | dropdown SQL sống; thêm row DB → dropdown có ngay, KHÔNG sửa form |
| 3 | Vendor form | submit OK + mirror Vendors |
| 4 | Transaction 4 reference + receipt | 4 dropdown (≥1 cascade) + upload thật ⏳→✓, MF_Files 1 dòng |
| 5 | Invoice auto | approve → `invoiced` + **Print A4 stamp INVOICED** đủ chi tiết |
| 6 | Dashboard + 6 reports | dashboard metrics + đủ 6 report (ghi nguồn: sẵn có / AI dựng) |
| * | Nguyên tắc | 0 lần sửa tay schema; mọi ngoại lệ có ghi chú |

## 5. Bẫy đã biết mang theo (từ memory — đọc nhanh trước khi chạy)
1. ⭐SQL options 2 cột TRÙNG TÊN → 0 options (alias `AS value/AS label`).
2. ⭐form-lookup dropdown CHỈ chạy DNN — tuyệt đối dùng SQL options thay thế trên Oqtane.
3. ⭐WorkflowJson tay/AI PHẢI có `StartNodeId` — thiếu = engine 0 node, "completed" im lặng.
4. ⭐Playwright submit dính spam-score 55 → workflow skip IM LẶNG (né bằng UA override) — nếu QA tự động.
5. ⭐Oqtane antiforgery header = `X-XSRF-TOKEN-HEADER`; API response PascalCase.
6. ⭐app_batch DDL: SQL Server shape `[dbo]` — site SQLite sẽ 400 (ensureDbDialect đã lo, nhưng để ý).
7. ⭐AI cfg mất sau fresh install → DefaultConfig lại.
8. Browser cache `?v` — Ctrl+F5 trước khi kết luận thiếu UI.
9. Schema builder-saved có thể sinh `fields` + `Fields` kép (dedup đã có ở extractor/print — nhưng để ý khi soi SchemaJson).
10. :5123 đang chạy bản hot-swap MỚI NHẤT (Core+Server+JS 07-13 p3) — :5124 CHƯA có gì cho tới khi cài 1.7.105.

## 6. Việc treo khác (không thuộc phiên AI-ERP nhưng đừng quên)
- 🔴 Pack **1.7.105** (điều kiện của bước 0).
- Umbraco print twin (nút Print trên Umbraco sẽ 404); DNN print runtime QA.
- Docs Q1 (payment) / Q2 (data-retention) còn nợ từ spec 20260712.
- My Inbox UX mở (handoff p3 §1): cân nhắc task ad-hoc vào bucket Inbox thay vì auto-claimed.
