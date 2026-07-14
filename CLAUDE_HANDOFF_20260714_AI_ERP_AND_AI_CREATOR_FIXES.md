# HANDOFF 2026-07-14 — AI-ERP chạy tới BƯỚC 5a + 7 lỗi AI-creator đã vá (2 commit)

> **Phiên này làm gì:** chạy tiếp kế hoạch AI-ERP (`CLAUDE_HANDOFF_20260714_AI_ERP_STEPWISE_PLAN.md`)
> từ BƯỚC 1b. Trong lúc chạy, owner báo 3 lỗi sản phẩm ("card thừa", "AI apply không hỏi",
> "form từ bảng chỉ có 1 trường") → điều tra ra **7 lỗi thật**, vá hết, verify bằng site sống,
> rồi chạy tiếp ERP tới **BƯỚC 5a PASS**. Site test: **:5125 Fresh1804** (1.7.105 + hot-swap).

## 1. TRẠNG THÁI — vào phiên sau là chạy tiếp BƯỚC 5b (cascade)

| Hạng mục | Trạng thái |
|---|---|
| **Commit** | `d874699` (AI-creator: card thừa + KB + confirm gate) · `e59bebb` (FieldOptions connKey + 3 gap) — branch `feat/theme-designer-picker-wizard-gallery-1.7.45` |
| **Site :5125** | Đang chạy, DLL `MegaForm.Core.dll` + `megaform-dashboard.js` + `megaform.css` + i18n đã **hot-swap** (CHƯA đóng gói lại → **pack 1.7.106 là việc đầu tiên nếu muốn giao khách**) |
| **Dữ liệu ERP thật trong DB** | Country 8 · Currency 7 · Stores 3 · Vendors 3 · Transactions 1 · MF_Files 1 — **100% do AI sinh bảng + sinh INSERT**, không sửa tay schema lần nào |
| **Form còn sống** | #1 Country Admin · #7 Store Form · #9 Vendor Form · #10 Transaction Form |
| **⚠️ Form RÁC cần xoá** | **#2 Country, #3 Currency, #4 Store Selection, #5 Vendor Selection, #6 Order Details** — sinh ra từ các lần AI hiểu sai TRƯỚC khi vá KB (tôi không tự xoá). Xoá bằng: `DELETE FROM MF_Forms WHERE FormId IN (2,3,4,5,6)` |
| **Việc kế tiếp** | BƯỚC 5b (cascade Country→Vendor/Currency) → BƯỚC 6 (Invoice workflow + Print) → BƯỚC 7 (Reports) → BƯỚC 9 (tổng kết) |

## 2. BẢY LỖI ĐÃ VÁ (tất cả verify trên site sống, không phải "đọc code thấy đúng")

| # | Lỗi | Root cause | Fix |
|---|---|---|---|
| 1 | **"Card thừa"** bao ngoài form AI | `--mf-page-bg: #f5f5f5` mặc định → wrapper vẽ nền xám thành card-trong-card trên theme host tối. B286 đã bỏ cho wizard, quên form thường | `Assets/css/megaform.css` → `transparent` (theme riêng + Theme Designer không ảnh hưởng) |
| 2 | **AI apply luôn, không hỏi** | `app_batch` dispatch ngay khi AI trả lời | **ConfirmGate**: render PLAN (bảng/seed/form) + nút Apply/Cancel; không bấm Apply = không có gì chạy |
| 3 | **Form từ bảng chỉ có 1 trường** | AI chỉ nhận TÊN bảng, không có cột → đoán mò | `callAI` nạp **COLUMNS thật** (tên/kiểu/nullable) của mọi bảng attach + KB "DATA-ENTRY MODE" (1 field/1 cột thật; form 1-trường = SAI) |
| 4 | **Seed data không làm được** | KB không dạy AI dùng INSERT (dù `SqlDdlGuard` cho phép) | KB "SEED/SAMPLE DATA": `app_batch` với `tables[].ddl` = INSERT, `forms: []`; + luật `N'…'` (không có N thì `Ƶ` thành `?` — gặp thật) |
| 5 | 🔴 **Dropdown SQL trả `[]` IM LẶNG trên Oqtane + Web** | `FieldOptionsService` có fallback connection, nhưng Oqtane (`MegaFormController:1319`) và Web (`:973`) gọi ctor 2-tham-số → `defaultConnectionKey = null` → field thiếu `optionsConnectionKey` = **0 option, không lỗi ở đâu cả**. DNN truyền key nên QA DNN không bao giờ thấy | Core: ctor 4-tham-số **floor về `"DashboardDatabase"`**. Chứng minh: form #9 **giữ nguyên schema**, swap DLL → 0 option thành 8 country |
| 6 | **app_batch tạo form dù CREATE TABLE FAIL** | Không kiểm tra kết quả DDL | **FailedTableGuard**: form gắn bảng fail bị **skip** + báo lý do (trước đó: bảng `Vendors` fail, form vẫn được tạo → shell chết mọi submit) |
| 7 | **AI khai FK sai kiểu** | `Vendors.CountryCode nvarchar(2)` vs `Country.CountryCode char(2)` → SQL Server từ chối cả câu CREATE | KB "FK TYPE-MATCH": cột con phải copy **đúng kiểu** cột cha từ COLUMNS context; không rõ kiểu thì bỏ FK |

Thêm: `saveAndRedirect` **từ chối lưu** form có `databaseInsert` trỏ bảng không tồn tại (key mới `ai.insert_table_missing`, 39 locale, gate i18n PASS).

## 3. KẾT QUẢ AI-ERP (đo theo yêu cầu owner: prompt / lần AI bị trả lại / PASS-FAIL)

| Bước | Prompt | AI bị trả lại | Kết quả |
|---|---|---|---|
| 1a (DDL master data) | 1 | 0 | ✅ (phiên trước) |
| **1b (seed 8+7)** | 1 | 0 | ✅ Country 8 + Currency 7 — qua PLAN → Apply. ⭐`Ƶ` bị lưu thành `?` (thiếu `N'…'`) → đã vá KB + sửa DB |
| **2 (Store form)** | 1 (+1 fix optionsSource) | 1 | ✅ 2 dropdown nạp sống 8/7; **thêm row Country bằng SQL → reload thấy ngay** (chứng minh data-source-driven) |
| **3 (mirror Stores)** | 2 (1 tạo bảng, 1 wire insert) | 0 | ✅ 3 store → 3 row `Stores` khớp từng cột |
| **4 (Vendor)** | 1 prompt × **3 lần chạy** | **2** (lần 1: quên DDL → gap #6/#7; lần 2: FK sai kiểu) | ✅ sau khi vá KB: bảng `Vendors` + form + 3 vendor mirror |
| **5a (Transaction)** | 1 | 0 | ✅ **4 dropdown nạp sống** (3 store, 3 vendor, 8 country, 7 currency) + **upload receipt thật ⏳→✓** + submit → `Transactions` 1 row + **MF_Files đúng 1 dòng** (FileRowDedup OK) |
| 5b cascade → 9 | — | — | ⏳ chưa chạy |

**Nhận định**: AI làm được toàn bộ phần "sinh bảng + sinh form + nối INSERT + dropdown SQL" —
nhưng **chỉ sau khi KB được dạy 4 luật mới**. Trước đó nó fail âm thầm 3/4 bước. Đây là tư liệu
chính cho bài docs "Build an ERP with AI".

## 4. BẪY MỚI PHÁT HIỆN (mang theo)

1. ⭐⭐ **`optionsSql` mà thiếu `optionsSource:"sql"` = dropdown rỗng, KHÔNG lỗi** — cả renderer lẫn `FieldOptionsService` đều gate trên `optionsSource`. Client giờ tự stamp, nhưng schema cũ trong DB vẫn có thể thiếu.
2. ⭐⭐ **Thiếu `optionsConnectionKey` cũng = rỗng** trên Oqtane/Web (đã vá Core — nhưng site nào chạy DLL cũ vẫn dính).
3. ⭐ `autoWire` trong `app_batch` **chỉ** xử lý field khớp bảng tạo trong CÙNG batch → dropdown trỏ bảng có sẵn không được normalize (đã thêm `normalizeSqlOptionFields`).
4. ⭐ SQL Server: INSERT không có `N'…'` → ký tự ngoài Latin-1 thành `?` (im lặng).
5. ⭐ Playwright: file input MegaForm bị `display:none` → phải `setInputFiles` vào `#mf-{formId}-{fieldKey}`, không click được.
6. ⭐ Prompt owner đưa ("create the table if missing") **bắt buộc** phải ra `app_batch`, không phải form đơn — nếu AI ra form đơn là KB chưa ăn (kiểm tra bundle đã deploy chưa).

## 5. VIỆC TREO
- 🔴 **Pack 1.7.106** — mọi fix hôm nay đang là hot-swap trên :5125 (Core DLL + dashboard.js + megaform.css + i18n). Chưa vào package.
- 🔴 Xoá form rác #2–#6 trên :5125 (lệnh ở §1).
- Chạy tiếp BƯỚC 5b → 9 (prompt mẫu nguyên văn trong `CLAUDE_HANDOFF_20260714_AI_ERP_STEPWISE_PLAN.md` §3).
- Twin check: fix Core #5 ảnh hưởng cả Web/Umbraco — nên QA lại 1 form SQL-dropdown trên Web.
- Umbraco print twin (404) + Docs Q1/Q2 — nợ từ phiên trước.
