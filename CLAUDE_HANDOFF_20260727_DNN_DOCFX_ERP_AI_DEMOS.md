# HANDOFF — 2026-07-27: DNN DocFX reorg + 2nd SQL connection + 3 AI/SQL demo pages (GIF)

Owner ask (ra ngoài 4h, làm autonomous, đẩy hết lên GitHub):
1. **DocFX DNN**: bỏ tách "DNN specifics", gộp vào cây chung DNN. ✅ **XONG + PUSHED**.
2. **Cấu hình nguồn DB connection + test connection** → 2 SQL connections dùng được trong MegaForm. 🟡 đang dở.
3. **Demo CustomERP**: form dropdown nối SQL table + **cascade** — quay GIF chậm + hình. ⏳ chưa.
4. **Trang DocFX**: tải template **Online** (tabstrip) qua GIF + dùng **AI trong builder modify** thành form tính năng bất kỳ → view form working. ⏳ chưa.
5. **Trang demo**: **AI nối 1 SQL table có PK** → sinh form cho table + chỉnh dropdown nối table liên kết → form view hoạt động → vào submission **thấy ngay data submission quá khứ**. ⏳ chưa.
6. Tất cả GIF + DocFX → **push GitHub**.

## ✅ A — DONE + PUSHED
- DNN docs repo: `CissSolution/DNN_MegaformDocs@main`, commit **`f24a7a1`** (đã push, credentials OK).
- Clone làm việc: `<SCRATCH_9b422814>/dnndocs` (remote `origin` = DNN_MegaformDocs; push `HEAD:main`).
- `articles/toc.yml`: xoá group "DNN specifics", gộp 4 trang vào "Using MegaForm on DNN" theo chủ đề:
  Module Setup sau "From a Blank Page"; Razor-submissions cạnh Submissions; SQL Table + Cascade sau Storage.
- ⚠️ Pages CI (GitHub Actions "MegaForm DNN Docs") tự build+deploy khi push main. Verify Pages 200 sau.

## 🟡 B — 2nd SQL CONNECTION (cơ chế đã hiểu, còn 1 nút thắt)
**Mục tiêu:** 2 connection dùng được = `DashboardDatabase` (portal, reserved) + `CustomerErp` → DB **`LegacyErp_Demo`**.
- **Storage:** `NamedConnectionCatalog` (`MegaForm.Core/Services/NamedConnectionCatalog.cs`), JSON blob dưới **PortalSetting** (KHÔNG phải HostSetting) key **`MegaForm_NamedConnections`**. Reserved names: DashboardDatabase/DefaultConnection/SiteSqlServer/DnnDefault/MegaForm.
- **Allow-list AI/SQL picker:** `AiToolsController.AllowedExternalConnections()` (`:502`) đọc **2 nguồn**: HostSetting `MegaForm_ExternalTables_AllowedConnections` (comma list) + PortalSetting catalog qua `PortalController.GetPortalSetting(SettingKey, PortalId, "")`.
- **Endpoints:** `GET AiTools/SqlConnections` (list), `GET AiTools/SqlTables?connectionKey=X&top=N`, `GET AiTools/SqlColumns`. Test: `POST Workflow/Database/TestConnection` body `{connectionName,databaseType,connectionString}` (⚠️ 401 cho anon → cần `RequestVerificationToken` antiforgery, không phải chỉ cookie).
- **🔴 NÚT THẮT:** đã set PortalSetting `MegaForm_NamedConnections` (PortalID=0, CultureCode=NULL) = `[{"Name":"CustomerErp","Provider":"SqlServer","ConnectionString":"Data Source=WINDOWS-11\SQLEXPRESS;Initial Catalog=LegacyErp_Demo;Integrated Security=True;TrustServerCertificate=True"}]` bằng **SQL trực tiếp** + restart pool, NHƯNG `SqlConnections` vẫn trả `[]` → **GetPortalSetting không đọc ra**. Nghi: DNN PortalSettings cache/cơ chế write riêng — set qua **SQL thô KHÔNG đủ**. **Cách đúng (chưa làm):** dùng chính **Database Settings UI save-endpoint** (Dashboard → Cài đặt → Database Settings; memory 07-26 đã vá "Edit connection prefill + RestoreMaskedSecrets 4 twin") — nó gọi `PortalController.UpdatePortalSetting` (flush cache đúng). Tìm DNN controller action save connection (grep `NamedConnection`/`Database` trong MegaForm.DNN/WebApi) rồi POST kèm antiforgery, HOẶC thao tác UI qua Playwright.
- Đã cấp `db_datareader` cho `IIS AppPool\DNN_MegaDemo` trên `LegacyErp_Demo` ✅.
- Đã dọn HostSetting rác `MegaForm_ExternalTables_AllowedConnections` (cũ = "CUstomeERP", connstring chết, trả 500).

## ⏳ C/D/E — DEMOS + GIF (chưa bắt đầu; tài nguyên đã sẵn)
- **Site demo:** `http://megademo.ai` (host/**dnnhost**, DNN 10.3.3, MegaForm 2.0.6, AI LIVE gpt-4o key sống, gallery fixed 43 tpl). Xem [[reference_site_dnn_megademo]].
- **GIF harness (VÀNG — tái dùng):** `<SCRATCH_393fd39d>/gifrec/` = `recorder-lib.mjs` + `dnn-lib.mjs` + sẵn **`rec-cascade.mjs / rec-sqltable.mjs / rec-aicreate.mjs / rec-submissions.mjs / rec-gallery.mjs`** (đã quay thành công trên dnn10322_megaqa110). Params owner-duyệt: capture 8fps, encode 6fps, width 1040px, holdLastMs 2500. ⚠️login DNN = **CLICK `[id$="_cmdLogin"]`** (không Enter) — HOẶC dùng `<SCRATCH_9b422814>/dnn-auth.mjs` `dnnLoginContext(ctx,'megademo.ai')` (login qua ctx.request, tránh addCookies-underscore). ⚠️AI live-preview modal chỉ vẽ header cho AI form → show qua **Save & Use Now → live form**. Selectors AI: `.mf-btn-ai-create`, `#mf-btn-ai-designer`, `textarea[data-mfd-ai-input]`, `button[data-mfd-ai-send]`, `[data-mfd-ai-action="save"]`.
- **ERP DB `LegacyErp_Demo`** (SQLEXPRESS): Stores(3) Vendors(3) Categories(8) Transactions(3) Invoices(2) Country(10) Currency(7) Priorities(4) + SupportTickets(500k) BigTxn(1000) TicketComments(5k). ⚠️**KHÔNG có Country→State→City** cho cascade — cần seed related tables HOẶC dùng FK sẵn (Transactions→Stores/Vendors/Categories) làm cascade Store→... Cần khảo sát FK/PK (`INFORMATION_SCHEMA` / sys.foreign_keys) để thiết kế cascade + AI-from-table.
- **E (AI từ SQL table + submission history):** cần table có PK + đã có rows submission quá khứ. `AiTools/ProposeTableSchema` (:724) sinh form từ table. Sau sinh → submission grid đọc data cũ (typed storage / external table). Đây khớp memory project 07-26 (AI↔bảng SQL FK, DatabaseInsert).
- **D (online template + AI modify):** gallery đã fix (43 tpl gồm tabstrip-account-setup). Download qua builder Template Gallery → Browse online (⚠️UI browse khó tìm automation — RemoteGalleryList chỉ fire ở đúng panel; xem [[project_20260726_invoice_templates_convert]] §gallery). Rồi AI designer modify.

## Trang DocFX cần tạo (đã CHỪA chỗ, chưa thêm vào TOC để tránh build lỗi)
- `dnn-database-connections.md` (B) · `dnn-ai-sql-table-form.md` (E) · `dnn-online-template-ai-remix.md` (D).
- Khi tạo xong + có GIF → thêm lại entry vào `articles/toc.yml` (đã có sẵn draft vị trí trong lịch sử edit) + push. `cascade-sql-dropdowns.md` + `dnn-sql-table.md` đã tồn tại — cập nhật GIF mới nếu quay lại.

## Ghi chú
- `dnn-auth.mjs`: DNN password hash = SHA256 **không khoá** (độc lập machineKey); Chromium bỏ cookie cho host underscore → login qua `ctx.request`. Đầy đủ ở [[reference_site_dnn_megademo]].
- Codex đang chạy song song (đã sửa dock View/Edit mode trên megademo.ai + build DNN). ⚠️Đừng đụng cùng file; worktree rất bẩn, KHÔNG `git add -A`.
