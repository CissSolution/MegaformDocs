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

---

# 6. 🔴 CODEX BÀN GIAO — SDK facade (Dashboard / SubmissionDashboard / Inbox) — PHẢI ĐỌC & XỬ LÝ

**Handout gốc của Codex**: `Docs/HANDOUT_CLAUDE_SDK_SURFACE_INBOX_DASHBOARD_2026-07-14.md`
**Mục tiêu Codex làm**: SDK/API facade **same-host** (chưa có remote controller) để khách tự code
dashboard tổng quan, submission dashboard (search/detail/update status), inbox+workflow
(claim/approve/reject/forward/comment/attach file/send submission). Yêu cầu: **minimal change**.

### 6.1 Tôi đã VERIFY hộ (Codex dừng trước khi kiểm) — kết quả: **XANH HẾT**

Codex ghi "PublicAPI.Unshipped.txt **chưa verify**, build có thể còn RS0016/RS0017". Tôi đã chạy:

| Lệnh | Kết quả THẬT (07-14) |
|---|---|
| `dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj -f net8.0 -v:minimal -clp:ErrorsOnly` | ✅ **Build succeeded, 0 Errors** — PublicAPI baseline **KHÔNG còn RS0016/RS0017**, không cần sửa gì thêm |
| `dotnet build MegaForm.Sdk\MegaForm.Sdk.csproj` (full targets) | ✅ **0 Errors** |
| `dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj` | ✅ **Passed: 49 / Failed: 0** |

→ **Việc "đầu tiên Claude phải làm" trong handout Codex coi như XONG.** Phiên sau KHÔNG cần chạy lại,
trừ khi có ai đụng vào SDK.

### 6.2 Trạng thái git: **7 file SDK đang DIRTY, CHƯA COMMIT**

```
 M MegaForm.Sdk/IMegaFormClient.cs          ← + IDashboardApi / ISubmissionDashboardApi / IInboxApi
 M MegaForm.Sdk/Dtos.cs                     ← + ~20 DTO + MegaFormScope thêm actor fields (Roles, IsAdmin…)
 M MegaForm.Sdk/MegaFormClient.cs           ← implement 13 method; Inbox gọi thẳng WorkflowTaskService
 M MegaForm.Sdk/ServiceCollectionExtensions.cs ← inject optional WorkflowTaskService + IWorkflowRepository
 M MegaForm.Sdk/PublicAPI.Unshipped.txt     ← baseline mới (đã verify PASS)
 M MegaForm.Sdk.Tests/InMemoryRepositories.cs      ← + InMemoryWorkflowRepository + FakeWorkflowEngine
 M MegaForm.Sdk.Tests/MegaFormClientContractTests.cs ← + test dashboard/submission/inbox
?? Docs/HANDOUT_CLAUDE_SDK_SURFACE_INBOX_DASHBOARD_2026-07-14.md
```
**Quyết định cần owner**: commit đợt SDK này thành 1 commit riêng (build+test đã xanh) hay chờ review API naming (§6.4).

### 6.3 🔴 LỖI THẬT tôi tìm ra khi review — `SearchAsync` với `FormId = 0` (all-forms) PHÂN TRANG SAI

Codex ghi đây là "cần kiểm tra". Tôi kiểm rồi — **đúng là lỗi**, và nguy hiểm vì im lặng:

- `SubmissionQueryService.List` **CÓ** hỗ trợ `FormId <= 0` = tất cả form (nó batch-resolve title/schema theo từng FormId) → phần này Codex làm đúng.
- **NHƯNG** `ISubmissionRepository.List(formId, status, search, dateFrom, dateTo, …)` **không có tham số portalId** → ở chế độ all-forms, repo trả submission của **MỌI portal**, rồi `MegaFormClient.SearchAsync` mới lọc portal **SAU KHI ĐÃ PHÂN TRANG** (`MegaForm.Sdk/MegaFormClient.cs:382`) và trả `TotalCount = items.Count` (`:389`).
- **Hậu quả**: khách gọi page 1 size 50 trên host nhiều site → nhận về ví dụ 12 dòng, `TotalCount = 12` → **tưởng hết dữ liệu trong khi còn hàng trăm dòng ở page sau**. Trang bị "thủng" im lặng, không lỗi, không cảnh báo. (Dữ liệu **không** rò sang portal khác — bộ lọc vẫn chạy — nhưng số liệu + phân trang sai.)
- **Fix tối thiểu đề xuất**: ở nhánh `FormId == 0`, list form của portal trước (`IFormRepository.ListForms(portalId)`), rồi query theo tập formId đó với paging đúng; hoặc bổ sung overload repo nhận `portalId`. **Không được** để lọc-sau-phân-trang.

### 6.4 Điểm Codex xin review trước khi chốt public API (SDK là package công khai → đổi tên sau = breaking)

1. Tên: `SubmissionDashboard` vs `SubmissionsDashboard`.
2. `AttachFileAsync` nên nằm ở `Inbox` hay `Files`?
3. `SendSubmissionAsync` có đủ rõ nghĩa "tạo ad-hoc inbox task" chưa?
4. `AttachFileAsync` lưu vào folder `MegaForm/Inbox/form-{formId}/submission-{submissionId}` — cần verify `IStorageService` của DNN/Oqtane/Web chấp nhận và vào **private storage**.
5. `AttachFileAsync` **chưa đọc portal upload settings** (max size / allowed extensions) — mới dùng default blocked-ext + magic validation của `FileUploadSecurityService`. Chấp nhận tạm (minimal), nhưng **phải ghi vào docs cho khách**.
6. ⚠️ **Role matching**: inbox workflow cần `MegaFormScope.Roles`. Caller same-host **không truyền Roles** → task theo role-queue **không hiện** (im lặng). Phải ghi rõ trong docs SDK.
7. `Files.ListForSubmissionAsync/OpenAsync` **cũ vẫn không tenant-check** — Codex cố ý không sửa (ngoài scope). Nếu siết thì làm riêng, cân nhắc breaking.

### 6.5 Thứ tự việc phiên sau (đề xuất)
1. Đọc `Docs/HANDOUT_CLAUDE_SDK_SURFACE_INBOX_DASHBOARD_2026-07-14.md` (bản gốc Codex) + §6 này.
2. **Vá lỗi §6.3** (paging all-forms) — đây là lỗi correctness, ưu tiên hơn cosmetics.
3. Chốt naming §6.4 với owner → sửa 1 lần → cập nhật `PublicAPI.Unshipped.txt` → build + test lại.
4. Commit đợt SDK.
5. Rồi mới quay lại AI-ERP BƯỚC 5b.
