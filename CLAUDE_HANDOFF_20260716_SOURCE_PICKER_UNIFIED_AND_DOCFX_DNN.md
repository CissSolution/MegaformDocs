# HANDOFF 2026-07-16 — Source-picker HỢP NHẤT 1 endpoint (shipped+verified) + DocFx DNN published

Nhánh: `feat/theme-designer-picker-wizard-gallery-1.7.45` (chưa push). Phiên autonomous 3h (owner ra ngoài).
Nối tiếp `CLAUDE_HANDOFF_20260715_SESSION_MASTER.md`.

## 1. ✅ SOURCE-PICKER INCREMENT 2 — HỢP NHẤT 1 ENDPOINT (commit `<xem git log>` 14 file +591/−113)

**Quyết định kiến trúc (owner chốt):** gộp về MỘT endpoint `Submissions?formId&source=auto|json|sql`
đi qua `ISubmissionRepository` — thay hẳn đường client gọi `AiTools/CustomTableRows`. Oqtane-first.

### Core (chạy được mọi platform, DI mới chỉ wire Oqtane)
- **`ExternalSourceContext.cs`** (mới): `AsyncLocal<ExternalSourceScope>` — controller SET trước khi
  gọi facade, decorator ĐỌC để route + GHI kết quả ngược (AppliedSource/TotalIsBounded/Table/Schema).
  KHÔNG đổi chữ ký `ISubmissionRepository` (tránh ripple 4 platform).
- **`DatabaseInsertBindingResolver.cs`** (mới): form `databaseInsert` → parse `INSERT INTO [s].[t]`
  (regex như CustomTableRows) → **`TableCapabilityProbe` on-demand** (không side-effect, KHÔNG ghi
  MF_ExternalBindings) → ExternalBinding tạm + CapabilityProfile, cache theo connectionKey|schema.table,
  hook allowlist connectionKey (mirror `OpenAiConnection`). `TryParseTarget()` static = check sqlCapable
  rẻ (parse-only) cho controller.
- **`ExternalSubmissionRepository.List`** route: `json`→inner; ATBE binding→đường cũ; `sql` không
  binding→resolver→**`ExternalTableQueryService`** (đường trưởng thành sẵn có: filter/sort/page/COUNT
  đẩy SQL, MaxOffset chặn deep-page, bounded count → TRIỆU DÒNG AN TOÀN). SQL rows (databaseInsert)
  = **id ÂM synthetic, KHÔNG mint anchor** (⭐anchor sẽ tiêm phantom row vào JSON view của chính form
  đó vì MF_Submissions của databaseInsert form chứa submission THẬT — khác ATBE). Fail-CLOSED khi
  source=sql không resolve được (không bao giờ trả JSON đội lốt SQL).

### Oqtane server
- `Startup.cs`: đăng ký resolver (allowlist = DashboardDatabase + `MegaForm:ExternalTables:AllowedConnections`)
  → decorator nhận thêm arg 5.
- `MegaFormController.ListSubmissions`: param `source`; **sql = ADMIN-ONLY** (parity gate CustomTableRows,
  không lọt qua public queryKey bypass; sql+queryKey → queryKey bị null); 400 khi form không sqlCapable;
  response echo `source/sqlCapable/sqlTable/totalIsBounded` (JsonOk anonymous — giữ PascalCase Items/TotalCount).

### Client (bundle submissions + dashboard, AssetVersion **B403**)
- `SubmissionsShell.loadSubmissions`: 1 đường adapter `getSubmissions(..., source)` — **filter/search/paging
  carry qua khi switch = mượt**. XOÁ `fetchSqlRows`/`aiToolsBase`. Chỉ tin echo server: mismatch → reset
  + toast + reload JSON (chống twin-gap); catch lỗi sql → fallback ồn ào + quên localStorage.
- Toggle chỉ render khi server echo `sqlCapable` (DNN/Web/Umbraco chưa có param → toggle tự ẩn).
- SQL rows read-only: không checkbox/row-open/delete; select-all lọc id>0. Pager "N+" khi bounded.
- Report modal (`dashboard/submission-report.ts`): cùng endpoint + toggle Source (chỉ khi sqlCapable);
  SQL mode derive field cards từ COLUMN NAMES (form field keys ≠ SQL columns).
- Adapters 3 nền + `PagedResult` + `ApiClient` mở rộng (source param + echo fields, forward-compat).

### ✅ VERIFIED LIVE :5125 (visual QA pixel + API, form 7 Store ⇄ dbo.Stores)
- Toggle 2 chiều: JSON (id 3/2/1, checkbox, cột form) ⇄ SQL (id −1/−2/−3, cột DB Store Id/Store Code/...,
  ST-001..003 thật, 0 checkbox 0 action). Screenshot: `qa-b403-grid-{json,sql}-element.png` (repo root, untracked).
- **Push-down SQL**: search Midtown→total=1; zzz→0; pageIndex=1&pageSize=2→total=3 trả 1; echo source đúng cả 2 mode.
- Gate: anon `?source=sql` → **403**; `sqlTable:"dbo.Stores"` echo đúng; B403 live trên `?v=`.
- Report modal: Source select hiện, SQL mode field cards = StoreId/StoreCode/... (`qa-b403-report-sql-mode.png`).

### 🟡 CÒN (increment 3)
- **Twin server DNN/Web/Umbraco** (phần đắt): Web/Umbraco cần 2 store impl + registration block clone
  `Startup.cs:81-89`; DNN khó nhất (ISubmissionRepository qua static `DnnServiceLocator`, thiếu
  IExternalRowMapStore). Map chi tiết DI/profiler 4 nền = output agent trong phiên (xem transcript)
  — tóm tắt: Web/Umbraco có IConnectionRegistry sẵn, thiếu binding+rowmap store; DNN có binding store non-DI.
- ATBE-bound form: `json` mode trả anchor stub (DataJson rỗng) — hành vi đúng nhưng UI có thể cần label.
- Retire endpoint `CustomTableRows` (Oqtane, trong AiToolsController.cs UNCOMMITTED trộn Codex — khi
  tách commit thì cân nhắc bỏ luôn endpoint vì client không gọi nữa; DNN twin của nó vẫn còn).
- Report >250 dòng: `SubmissionQueryService` clamp 250 → report (cả JSON lẫn SQL) chỉ phân tích ≤250
  dòng/lần dù xin 2000 — HẠN CHẾ CÓ SẴN từ trước, chưa fix (liên quan họ bug queryKey>250 trong backlog).

## 2. ✅ DOCFX DNN — PUBLISHED lên GitHub master (commit `7bcb754` repo MegaformDocs)

- Bài mới **`Docs/docfx/articles/dnn-erp-demo.md`** — "ERP demo on DNN": Store/Transaction form
  (SQL dropdown sống đọc dbo.Stores/dbo.Vendors), databaseInsert mirror, workflow Database node
  tự sinh invoice, **ERP Reports 8 DataRepeater** (summary/GROUP BY country+currency/invoice-status join).
  3 screenshot chụp từ site DNN live (`dnn10322_megaclean.ai`): `dnn-erp-{store-form,transaction-form,reports-dashboard}.png`.
- toc.yml master: thêm nhóm **"Using MegaForm on DNN"** (trước "Programming").
- **Cách publish an toàn**: `git worktree` tại `E:\_docswt` từ `origin/master` (⭐KHÔNG đụng 3 file
  docs WIP trên feat branch: overview.md/toc.yml/workflow-approvals.md = track SDK của AI KHÁC).
  Push `docs/dnn-erp-visual:master` → Actions build **in_progress** lúc ghi handoff — owner check
  `https://cisssolution.github.io/MegaformDocs/articles/dnn-erp-demo.html`.
- ⭐Bẫy: worktree vào scratchpad path dài → "Filename too long" → cần `git config core.longpaths true`
  + path ngắn `E:\_docswt` (worktree này còn tồn tại — dọn bằng `git worktree remove /e/_docswt` khi xong).
- GIF DNN vẫn PENDING (ffmpeg PNG-seq lỗi như handoff trước) — bài dùng PNG tĩnh, GIF bổ sung sau.

## 3. ⭐ Bẫy đắt phát hiện phiên này
- **DNN module hiển thị form theo `MF_ModuleViewConfig.FormId`, KHÔNG phải ModuleSettings `MegaForm_FormId`**
  (FormView.ascx.cs:685 — moduleConfig ưu tiên). Đổi ModuleSettings + recycle app pool = VÔ ÍCH;
  UPDATE MF_ModuleViewConfig thì ăn NGAY không cần recycle. (Đã khôi phục mod385 → FormId=37 cả 2 nơi, verified.)
- `/TestPinPage456` mod385 mặc định hiển thị form 37 "Account Setup" — KHÔNG phải ERP. Form ERP DNN:
  Store=39, Vendor=40, Transaction=41, **ERP Reports=42** (dashboard 8 repeater).
- Oqtane `GetService<T>()` trong MegaFormController.cs: thiếu using DI extension → CS0308; dùng
  `GetService(typeof(X)) as X` khỏi đụng usings file lớn.
- Playwright :5125: login form autofill sẵn host/abc@ABC1024 → chỉ cần click Login (selector hết kẹt).
  Panel admin ở `?mfpanel=dashboard|submissions`; screenshot VIEWPORT dính hero page (panel inline
  dưới fold — bẫy is-inline cũ) → **screenshot theo ELEMENT** (`.mf-subs-card`, `.mf-form`).
- esbuild KHÔNG typecheck — phải chạy `npx tsc --noEmit` riêng sau khi sửa TS.

## 4. State sites cuối phiên
- **:5125** chạy (dotnet detached, B403; Server+Shared+Core DLL mới ở site root). Login OK.
- **DNN megaclean** chạy; mod385 đã khôi phục nguyên trạng (form 37); app pool DNN10322_MegaClean
  bị recycle 1 lần giữa phiên (không ảnh hưởng).
- Worktree `E:\_docswt` + branch `docs/dnn-erp-visual` còn tồn tại (đã push; dọn tuỳ ý).
- Uncommitted còn lại trên feat: `AiToolsController.cs` (Codex-trộn, y như trước) + các file dirty
  từ trước phiên (CapabilityDecisionEngine.cs, my-inbox/*, workflow-inbox/*, docs WIP...) — KHÔNG đụng.

## 5. Việc phiên sau (ưu tiên)
1. 🟠 Fix queryKey >250 data-loss (correctness — backlog cũ, chưa làm phiên này).
2. 🟢 Source-picker increment 3: twin DNN/Web/Umbraco server + retire CustomTableRows + tách commit AiToolsController.
3. 🟢 ERP demo Oqtane còn: verify submit→ghi bảng (UI thật, né spam-score) · Invoice workflow · Dashboard 6 report (:5125).
4. 🟡 GIF cho bài DocFx DNN (ffmpeg PNG-seq) + verify Actions build docs xanh + link live.
5. 🟡 WorkflowCanvas GROUP BY + Web [Authorize] siết + bounded-read follow-up (backlog cũ).
6. Push GitHub nhánh feat (owner quyết).
