# HANDOFF 2026-07-11 — Adaptive Table Binding P0→P2 + workflow/module fixes + package 1.7.102

## Trạng thái: ĐÃ SHIP & VERIFIED (5 commit, chưa push)

| Commit | Nội dung |
|---|---|
| `edba3de` | **P0** — capability probe (SqlRelationalSchemaReader + TableCapabilityProbe + CapabilityDecisionEngine + ExternalTableController + capability card) |
| `3ea03b5` | **P1** — dashboard đọc LIVE bảng khách (ExternalTableQueryService + anchor row + decorator ISubmissionRepository) |
| `e64b920` | **FIX** — Submissions overview timeout 30s trên site 1 triệu dòng (index + GROUP BY trong SQL) + form external báo sai số dòng + PortalId -1 |
| `7b18193` | **Workflow + module role** — push-assign đích danh, DI notify (Oqtane+DNN), module = Inbox/Dashboard |
| `c6cf4c1` | **P2** — AI on-rails (Envelope → Blueprint → validator server + retry 3 lần + fallback máy sinh) |
| `85746e0` | **Release 1.7.102 / B394** — bump + nuspec + handout + handoff |
| `a2e4bda` → `913e548` → `7481343` | **Wizard Import JSON** — thêm dialog dán/kéo-thả → sửa tiêu đề trắng-trên-trắng → **trả lại một-click file picker**, dialog thành link phụ |

**Package:** `MegaForm.Oqtane.1.7.102.nupkg` (78.8MB) — ModuleInfo 1.7.102, AssetVersion **B394**. Đã verify nội dung (ExternalTableController, TableCapabilityProbe, BlueprintValidator, builder bundle, B394).

## Hạ tầng đang chạy

- **:5123 — `Oqtane.MegaForm.Fresh1802`** (DB `Oqtane_MegaForm_Fresh1802`) — **cài SẠCH chỉ từ nupkg**, đã E2E: probe → bind → list 500.000 dòng → filter 100.000. **Đây là site để QA phiên sau.** host/`abc@ABC1024`.
- **:5122 — `Oqtane.MegaForm.Fresh1799`** — site dev hot-swap, có 1 triệu submission seed + form 7/8 bind bảng ngoài.
- **`LegacyErp_Demo`** (.\SQLEXPRESS) — DB "khách" giả lập: `dbo.SupportTickets` 500k (identity PK, FK→Priorities/Categories, CHECK enum Status, computed AgeDays, rowversion, IsDeleted, AttachmentPath) + `TicketComments` (child) + ca biên: `sales.Orders` (GUID PK + trigger), `dbo.Orders` (trùng tên → collision), `LegacyKeyless` (không PK), `TenantSettings` (composite PK), `WeirdTypes` (sql_variant NOT NULL), `vTicketSummary` (VIEW), login `mf_readonly` (chỉ SELECT).
- Script tạo lại DB khách: `C:\Users\ADMINI~1\AppData\Local\Temp\claude\...\scratchpad\legacy_erp_demo.sql`; CLI probe: `C:\mfprobe\`.

## ⚠️ BẪY đã trả giá — đừng vấp lại

1. **Antiforgery của Oqtane dùng header RIÊNG: `X-XSRF-TOKEN-HEADER`.** `RequestVerificationToken` và `X-XSRF-TOKEN` đều bị từ chối bằng **400 rỗng** (không có body, không log rõ). Token lấy từ `input[name="__RequestVerificationToken"]`.
2. **`AuthEntityId(EntityNames.Site)` trả `-1`** trên XHR admin không có module context → form tạo ra có `PortalId=-1` → **tồn tại nhưng vô hình** ở mọi danh sách. Phải fallback claim `siteid` rồi `?siteId=` query.
3. **Hot-swap DLL: phải stop process TRƯỚC khi copy.** Có lần copy xong mới thấy route 404 vì process cũ còn giữ DLL — restart lại là hết.
4. **Oqtane KHÔNG chạy thân migration `Up()`**: bảng EF mới (`MF_ExternalBinding`, `MF_ExternalRowMap`) **tự sinh trên site cài mới** (đã kiểm chứng :5123), nhưng **site cũ phải chạy DDL tay**. Index mới cũng vậy.
5. **`npm run build` (full) FAIL vì i18n drift** (44 key thiếu ở locale phụ — tồn đọng từ phiên advanced-filter). Build từng bundle (`npm run build:builder`, `build:settings-popup`, `build:workflow`) thì OK.
6. Response API của Oqtane là **PascalCase** (`Items`, `TotalCount`, `Config.ModuleRole`) — client TS có lớp normalize; test script phải đọc cả 2 kiểu.
7. **Hộp thoại chọn tệp bị NUỐT khi trình duyệt đang bị debug qua CDP** (extension AI/automation gắn vào tab). Nút "Import JSON" khi đó **trông như chết**: không cửa sổ, không lỗi, console sạch. Đừng đi sửa code — kiểm tra xem tab có đang bị debug không. (Đã thêm link "Paste or drop the JSON" làm đường thoát.)
8. **Overlay của wizard ở `z-index: 2147483646`.** Modal mới đặt thấp hơn vẫn **nhìn thấy** (qua nền mờ) nhưng **mọi click rơi xuống wizard** → "bấm không ăn". Modal mới phải ≥ 2147483647.
9. **Admin shell ép `h3 { color:#fff }`.** Modal tự dựng phải **khai màu tường minh**, không thì tiêu đề trắng-trên-trắng: có trong DOM, vô hình trên màn hình.

## Việc tiếp theo (theo SPEC)

**P3 — ĐƯỜNG GHI** (`Docs/SPEC_20260711_Adaptive_Table_Binding_Engine.md` §8):
- `ExternalTableWriter` **MỚI** (không tái dùng `FormDatabaseInsertService`: nó fail-soft nuốt lỗi và guard cấm `;` nên không lấy được `SCOPE_IDENTITY`; cũng KHÔNG tái dùng `DatabaseNodeExecutor`: `BuildUpdateCommand` phát `UPDATE` **không có WHERE** khi `WhereMappings` rỗng).
- Lấy khoá theo `key.retrieval` đã dò sẵn (`scopeIdentity` / `outputInto` khi có trigger / `preAssigned` cho GUID).
- Tách `SubmissionProcessor.ProcessAsync` → validate/enforce → ghi bảng khách → anchor. **BỎ fail-soft**: ghi lỗi phải trả 400/500, không tạo submission giả.
- **Fix B7 bắt buộc trong P3**: `LifecycleRunner.cs:246-251` cho client POST `_createdBy`/`_portalId` **đè giá trị server** → người submit ẩn danh giả mạo được cột audit/tenant trong bảng production của khách.
- Dry-run ghi trong transaction rồi ROLLBACK (khuôn có sẵn: `FormDatabaseInsertService.TestExecute:119`, rollback `:175`).

**P4** sửa/xoá (prefill + UPDATE + rowversion ETag → 409 + soft-delete) · **P5** quan hệ (RelationGraph + ChildRowsWriter — mở khoá lỗ "Subform không ghi bảng con") · **P6** scale/file.

## Tài liệu

- `Docs/SPEC_20260711_Adaptive_Table_Binding_Engine.md` — đặc tả đầy đủ (probe catalog, decision matrix, degradation ladder, ranh giới máy/AI/admin, 8 blocker, lộ trình).
- `Docs/DESIGN_20260711_Enterprise_Form_On_Existing_SQL_Table.md` · `Docs/RESEARCH_20260711_Form_On_Existing_SQL_Table_500k.md`
- `HANDOUT_20260711_PACKAGE_1.7.102_TABLE_BINDING.md` — bản cho khách/QA.
