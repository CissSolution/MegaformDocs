# STATUS — PAUSE POINT (2026-07-11)

Điểm dừng để resume. Chi tiết đầy đủ + 8 "bẫy": `CLAUDE_HANDOFF_20260710_NEXT_ROLE_BASED_VISIBILITY.md` §4.0–4.0.9.

## CẬP NHẬT cuối phiên 2026-07-11 (đọc trước)

- ✅ **ĐÃ COMMIT** role-visibility: `6680c90 feat(security): server-enforced role-based field visibility (3 platforms)` — 21 file (3 service Core mới, 2 file TS permissions, Access tab, controller 3 platform, seed AI, bump 1.7.101/B393). Chưa push. Phần uncommitted còn lại (~514 mục) là tích luỹ nhiều phiên trước, giữ nguyên.
- ✅ **:5122 đã bật lại** (`Oqtane.Server.exe --urls http://localhost:5122`), serve `?v=20260711-B393`.
- ✅ **NGHIÊN CỨU XONG** (3 agent): deliverable `Docs/RESEARCH_20260711_Form_On_Existing_SQL_Table_500k.md`.
- ⭐ **PHẠM VI MỚI do khách chốt**: MegaForm **dùng tiếp DB QUAN HỆ có sẵn** (không import), phải **tự tìm khoá (PK/FK)**, và **giao thiết kế form cho AI on-rails** (model rẻ vẫn đúng) → thiết kế: `Docs/DESIGN_20260711_Enterprise_Form_On_Existing_SQL_Table.md` (3 tầng: SỰ THẬT deterministic → AI thiết kế → MÁY CHẤM + retry).
- 🔴 **5 giả định SAI** (đã verify code): không có dòng nào đọc `sys.foreign_keys`; "AI phân tích FK" chỉ là prompt đoán tên cột; AI chỉ nhận TÊN BẢNG (không nhận cột); **Subform KHÔNG ghi vào bảng con** (`Subform/Save` không tồn tại); `widget-catalog.gen.ts` là dead code. Chi tiết §0 của DESIGN doc.
- ▶️ **Việc kế tiếp**: xin **DDL thật của khách** (PK có phải int identity? cột file lưu path hay blob? bảng con nào?) rồi làm P0 (SqlRelationalSchemaReader + RelationGraphBuilder) → P1 (dashboard đọc 500k rows cũ).

## ĐÃ XONG (verified, chưa commit)

1. **Role-based field visibility — server-enforced, 3 platform (Oqtane/DNN/Web).** Render projection (ẩn field trước khi
   tới browser) + submit enforcement (chặn POST lén). Core mới: `RuleStaticEvaluator`, `FormSchemaVisibilityFilter`,
   `FormAccessProjection`. LIVE QA :5122.
2. **UI tab Access:** "Field visibility by role" (Visible-to + Read-only-for, 2 dòng chip) + nút **Expand** (popup ma trận đủ 7 cột).
3. **Read-only-by-role:** `FormField.ReadOnlyIf` (render→readOnly=true, submit→giữ giá trị DB). Verified 42/42 + 12/12 + live.
4. **AI guardrail:** prompt_rule seed Id 327 + validator error message + **đã INSERT vào DB :5122** `MF_AI_Knowledge` Id 324.
5. **PACKAGE `MegaForm.Oqtane.1.7.101.nupkg` (82MB)** — net9+net10, verified. ⚠️Ở **B392**, KHÔNG gồm readOnlyIf (B393, thêm sau).
6. **Handout:** `HANDOUT_20260711_PACKAGE_1.7.101_ROLE_VISIBILITY.md`.

## TRẠNG THÁI HẠ TẦNG

- **:5122** (`Oqtane.MegaForm.Fresh1799`, DB `Oqtane_MegaForm_Fresh1799`, .\SQLEXPRESS) — UP, đang chạy **B393** hot-swap
  (Core+Shared+Server DLL + builder bundle mới nhất gồm readOnlyIf). Form 2 = baseline (8193). Login host/abc@ABC1024.
- Package 1.7.101 nằm ở `MegaForm.Oqtane.Package/`. **Chưa cài site mới** (theo yêu cầu).
- **Chưa commit gì.** File mới: `RuleStaticEvaluator.cs`, `FormSchemaVisibilityFilter.cs`, `FormAccessProjection.cs`,
  `permissions/field-visibility.ts`, `permissions/access-popup.ts` + sửa ~16 file (xem git status).

## ĐANG DANG DỞ — NGHIÊN CỨU (khi resume, làm tiếp cái này)

**Yêu cầu:** khách có sẵn 1 bảng SQL quan hệ (form support-tickets, 500.000 rows, có file upload). Chọn bảng đó → AI
sinh form từ bảng → form dùng được ngay → dashboard submissions hiện đủ 500k rows cũ (không cần nhập mới).

Đã phóng **3 Explore agent** map codebase (output ở `tasks/{af7360d8fed3d88b7,a33f5360a10457013,afa8417f2f394c767}.output`
— nếu session mới thì agent mất, **chạy lại** 3 câu hỏi sau):
1. **Đường GHI SQL ngoài:** `FormDatabaseInsertService`, `DnnConnectionRegistry`/connection keys, lifecycle hooks
   (preInsert/postInsert SQL), DataGrid-SQL widget, RazorWidget.Action SQL, AppEndpoint, option-source SQL, file-upload storage.
2. **Đường ĐỌC dashboard:** `SubmissionQueries`/`SubmissionListQuery`, repo (`EfPhase2Repository`/`Phase2Repository`), phân
   trang OFFSET, search LIKE, `MF_Submissions`+`MF_SubmissionValues`+`SubmissionIndexerService`, chỗ nào khoá cứng vào MF_Submissions,
   interface có thể swap để đọc bảng ngoài.
3. **AI sinh form + suy schema:** `ai-form-assistant/*`, `ai-form-creator.ts`, field types, có sẵn khả năng introspect
   bảng/suy schema (CSV/DataGrid-SQL column discovery) không.

**Deliverable còn thiếu:** tài liệu nghiên cứu + kế hoạch (mảnh đã có · khoảng trống · rủi ro 500k rows · phương án).

### KẾT QUẢ AGENT #3 (AI form-gen — ĐÃ XONG). ⭐ Năng lực "bảng SQL → form" ĐÃ TỒN TẠI PHẦN LỚN:
- **Introspect bảng:** `SqlSchemaReader.ListColumns` + `ClassifyUiType` (`MegaForm.Core/Services/Subform/SqlSchemaReader.cs:59-120`)
  — đọc name/dataType/nullable/isPrimary, map SQL→UI type (bit→boolean, int/decimal→number, date/time→date, else text).
- **Endpoint:** `AiTools/SqlTables|SqlColumns|PreviewSql|DryRunValidate|ProposeTableSchema` (`AiToolsController.cs:67,85,112,136,203`)
  + `Subform/Tables|Columns` (`SubformController.cs:68,109`). AI tools client: `tools.ts` (`list_sql_tables`, `get_table_columns`,
  `preview_sql`…). **Tất cả Admin/Host-gated.**
- **UI có sẵn 2 chỗ:** Builder tab "DB" (`db-tables-panel.ts`) — list bảng, expand cột, "+DataGrid", chip cột→field
  (`columnToFieldTemplate:155`), **multi-table "Build fields with AI"** (`:306`, đúng ý tưởng KH); Dashboard "Create with AI"
  DB tab (`ai-form-creator.ts:534,598`) — chọn bảng → inject vào system prompt + phân tích FK/cascade.
- **Ghi ngược:** `settings.databaseInsert` (`FormSchema.cs:612-635`) → `FormDatabaseInsertService.Execute` (INSERT on submit,
  fail-soft, parameterized). Auto-wire khi gen: `buildInsertSqlFor` (`ops-app-batch.ts:320`).
- **Connection: SERVER-configured only** (appsettings `ConnectionStrings:DashboardDatabase`), client chỉ chọn connection KEY,
  KHÔNG nhập connection string (bảo mật — `dom.ts:1114`).
- **KHOẢNG TRỐNG (agent #3):** (1) chưa có 1-click "cả bảng → cả form phẳng" (hiện per-column hoặc qua AI); (2) type inference
  thô (chỉ Text/Number/Date/Checkbox — không suy Email/Phone/Url, **không đọc FK constraint** để tự tạo Select); (3) `isIdentity`
  KHÔNG được reader điền → skip identity PK không đáng tin; (4) KHÔNG có CSV/JSON import.
- ⚠️ Cả (1) form dùng ngay + (2) dashboard đọc 500k rows CŨ từ bảng ngoài **là 2 mảnh chờ agent #1 (write) + #2 (read)** — `settings.databaseInsert`
  chỉ INSERT khi submit, KHÔNG làm dashboard đọc bảng ngoài. Đây mới là phần khó → chờ 2 agent kia.

### AGENT #1 (external-SQL write) + #2 (dashboard read): ĐANG CHẠY (session mới thì chạy lại — xem 3 câu hỏi ở trên).

## CÒN LẠI (defer)

- Repack **1.7.102** nếu muốn readOnlyIf vào gói · DNN package cho 1.7.x · hợp nhất model rule + migration (rủi ro cao) ·
  live QA DNN (`dnnqa1799.ai` không warm up — env) · KB DB row cho các site khác ngoài :5122.
