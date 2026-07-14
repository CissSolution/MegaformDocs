# HANDOFF 2026-07-14 (p2) — DNN 1.7.106 đã cài + 4 lỗi DNN đã fix

Commit: **`bd3bcc8`** — `fix(dnn): My Inbox surface + endpoints, Windowed⇄Fullscreen mode, language picker z-index`
Site QA: `http://dnn10322_megaclean.ai/` (host / `dnnhost`) — trang test: `/TestPinPage456`

---

## 0. Việc quan trọng nhất phát hiện được

Site **đang chạy MegaForm 1.6.32** (cài 23/06), gói `MegaForm_01.07.106_Install.zip` chỉ nằm sẵn trong
`Website/Install/Module/` mà **chưa hề được cài**. Mọi "lỗi" nhìn thấy đều phải kiểm version trước.

```
sqlcmd -S "WINDOWS-11\SQLEXPRESS" -E -d DNN10322_MegaClean -I -h -1 -W \
  -Q "SELECT Version FROM Packages WHERE Name LIKE '%MegaForm%'"
```
→ giờ trả `1.7.106`.

---

## 1. Bốn lỗi owner báo — trạng thái

| # | Lỗi | Nguyên nhân | Trạng thái |
|---|-----|-------------|-----------|
| 1 | Dropdown "Display language" không mở được | Panel picker append vào `<body>` ở `z-index:10010`, overlay DNN `z-index:100000` nền đục → panel mở **phía sau** overlay | ✅ FIX (z-index + chrome-hider bỏ qua portal) |
| 2 | Click "My Inbox" trong dashboard → văng ra ngoài | `FormView.ascx` thiếu `#mf-host-myinbox-overlay`, bundle chưa đăng ký, `open()` gọi `closeAll()` **trước** khi kiểm tra overlay | ✅ FIX + **thêm backend** (xem §2) |
| 3 | Không có Windowed/FullScreen như Oqtane | Oqtane dùng `platform-host.installFullscreenToggle()` bám `.mf-oq-surface` — DNN không có selector đó → toggle không bao giờ mount | ✅ FIX (Windowed = **module DNN inline**) |
| 4 | Widget AI tạo ra không có cờ (hiện chữ "us") | **KHÔNG phải bug code** — 1.6.32 chưa ship `Assets/img/flags` | ✅ Hết sau khi cài 1.7.106 (`us.svg` 200) |

---

## 2. My Inbox trên DNN: thiếu CẢ backend

Bundle `megaform-my-inbox.js` có sẵn nhưng DNN **chưa từng có** các endpoint:
`Workflow/MyInbox`, `Workflow/Tasks/{Get,Claim,Approve,Reject,Forward,Comment}`, `Workflow/Directory`.

Thêm mới **`MegaForm.DNN/WebApi/WorkflowInboxController.cs`** (twin của
`MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs`), dựa trên
`DnnServiceLocator.Instance.WorkflowTasks` — **đã được wire sẵn từ trước**, không phải dựng mới.

- Auth: `[DnnAuthorize]` (mọi user đã đăng nhập — inbox là per-actor; `WorkflowTaskService` tự scope theo actor).
- `Directory` để `[DnnModuleAuthorize(Edit)]` — liệt kê user portal là quyền admin.
- POST có `[ValidateAntiForgeryToken]`; client đã gửi `RequestVerificationToken` qua ServicesFramework.
- `Fail()` **không** trả `ex.Message` cho client (SECURITY_CODING_RULES §10).

Đã verify live: `Workflow/MyInbox` 200, `Workflow/Directory` 200 (có role+user thật), `Workflow/Tasks/Get` route đúng (400 "not found" thay vì 404).

---

## 3. ⭐⭐⭐ BẪY ĐẮT NHẤT — routeName DNN trùng ⇒ giết im lặng cả route mặc định

`MegaFormRouteMapper.RegisterRoutes` **đã có sẵn** route `MegaFormWorkflowInbox` + `Workflow/Tasks/*`
(trỏ tới action **không tồn tại** trên `WorkflowController` — tức là route chết từ lâu).

Tôi thêm route **trùng tên** → `MapHttpRoute` ném exception → **tất cả route đăng ký SAU đó, kể cả route
mặc định `{controller}/{action}`, không được đăng ký** → `i18n/list` trả 404 → panel Languages hiện
"404 Not Found". Triệu chứng xuất hiện ở chỗ **hoàn toàn không liên quan**.

**Quy tắc:** routeName phải UNIQUE. Muốn dùng URL đã có → **sửa `defaults` của route cũ**, đừng thêm route mới.

---

## 4. Windowed = MODULE DNN (theo yêu cầu owner)

Bản đầu tiên tôi làm Windowed = popup thu nhỏ → owner bác: *"phải render như 1 module của DNN"*.

Bản hiện tại (`dnn-host/index.ts` + CSS trong `FormView.ascx`):
- **Windowed**: overlay được **re-parent vào `.DnnModule`** của module đó, `position:static`, nằm trong luồng
  trang, skin DNN (header/menu/footer) ở trên dưới, body **không** bị khoá scroll.
- **Fullscreen**: hoisted về `<body>`, `position:fixed inset:0`, ẩn chrome DNN (như cũ).
- Lưu lựa chọn ở `localStorage['mf-dnn-surface-windowed']`.
- Chrome `position:fixed` bên trong builder phải neo lại vào hộp module, nếu không sẽ nổi đè skin DNN:
  `.w-topbar` → absolute, `.tpl-bar` → absolute bottom. (Oqtane làm tương tự cho `.mf-oq-surface.is-inline`
  trong `megaform-builder-shell.css:127` — tôi **không sửa file đó**, chỉ scope riêng cho DNN.)

---

## 5. Files đã đổi (DNN-only, không đụng Oqtane/Web/Umbraco)

```
MegaForm.DNN/Views/FormView.ascx          — overlay My Inbox + CSS windowed + z-index portal + hash list
MegaForm.DNN/Views/FormView.ascx.cs       — đăng ký megaform-my-inbox.js + megaform-my-inbox-ts.css
MegaForm.DNN/WebApi/MegaFormApiController.cs — route MyInbox/Directory/Tasks-Comment + trỏ lại route cũ
MegaForm.DNN/WebApi/WorkflowInboxController.cs (MỚI)
MegaForm.UI/src/dnn-host/index.ts         — guard overlay, chrome-hider bỏ qua portal, toggle Windowed
```

---

## 6. Deploy — CHƯA REPACK

Site đang chạy **hot-swap**: `bin/MegaForm.DNN.dll`, `Views/FormView.ascx`,
`Assets/js/megaform-dnn-host.js`, `Assets/js/megaform-my-inbox.js`, `Assets/css/megaform-my-inbox-ts.css`.

👉 **Việc phiên sau:** chạy `MegaForm.DNN/BuildPackage-DNN.ps1` (bump version) rồi cài lại để gói giao khách
có đủ 4 fix. Sau đó mới QA tiếp.

---

## 7. Còn nợ trên DNN

1. QA manual DB-insert (dropdown connection + bảng + cột thật + Test) trên site DNN đã cài.
2. Security P0: `curl` `Schema/{id}` ẩn danh — xác nhận không rò `insertSql`/`optionsSql`/`connectionKey`.
3. AI-on-Rails: AI bind bảng có sẵn → INSERT đúng cột.
4. My Inbox: board đang **rỗng** (site chưa có workflow task) → chưa QA được Claim/Approve/Forward thật.
5. `Workflow/Tasks/SendSubmission` (Oqtane có) **chưa port** sang DNN.
6. ⚠️ schema-drift: `SqlScripts` chỉ tới `01.06.32` — tính năng 1.7.x mới có thể thiếu bảng khi upgrade.

---

## 8. Bẫy công cụ (mất nhiều thời gian nhất)

- **Playwright MCP profile bị Codex chiếm** → `Browser is already in use`. Né bằng cách bật Chrome riêng:
  `chrome.exe --remote-debugging-port=9222 --user-data-dir=<temp>` rồi dùng **chrome-devtools MCP**.
- **Cài extension qua UI persona bar**: checkbox "Accept License" là React — click `<input>` hoặc `.checkbox`
  div đều KHÔNG ăn. Phải click vào **`<label>` chữ "Check"**.
- Gọi thẳng API `InstallPackage` bằng fetch **không được**: GET zip trong `/Install/Module/` trả 200 nhưng
  đọc body thất bại.
- `upload_file` (chrome-devtools) chỉ nhận file **trong workspace roots** → copy zip vào scratchpad trước.

---

# PHẦN 2 (cùng phiên) — preview form, mode Inbox, bỏ Renderer Host, và SQL-vs-JSON

## Commit `f803a6b` — 3 việc DNN (đã QA live)

1. **Preview form**: `getPublicFormUrl()` không tự dựng URL — nó **kế thừa base** từ
   `getCurrentBasePath()`, vốn trả `window.location.pathname` NGUYÊN VĂN trên DNN. DNN nhét tham số
   vào path (`/ctl/ManageModule/mid/385`) → link preview thành
   `/Page/ctl/ManageModule/mid/385?formid=37` → DNN route theo `ctl` → ra trang settings.
   Fix: base = `returnUrl` (tab path sạch do server render); `normalizeRendererHostUrl` scrub luôn các
   segment `ctl/mid/formid/...` để `viewUrl` per-form đã nhiễm tự lành; thêm `data-return-url` vào
   `#mf-host-dashboard-root` (vì `detectRoot()` chọn phần tử này TRƯỚC).
   ⚠️ URL sạch chưa đủ: nhánh Admin-Dashboard trong `FormView.ascx` **không render form body**, và
   `dnn-host` tự mở overlay dashboard đè lên. Cả hai giờ đứng im khi URL có `?formid=`.

2. **Mode My Inbox** (giống `ModuleRole=myinbox` của Oqtane): admin mở như surface từ dock; **user
   thường** (approver, không phải admin) không có shell → inbox mount **inline** trong module pane.
   ⚠️ `NormalizeModuleMode` bị **nhân đôi** (ManageModule.ascx.cs + FormView.ascx.cs) — thiếu 1 bên là
   mode âm thầm degrade về `render`.

3. **Bỏ Renderer Host**: khái niệm này đã vô dụng từ trước — `?formid=` chỉ admin dùng được (FormIdGate
   06-26), và mode renderer_host còn **chặn** module tự tìm form của nó. Xoá: option mode, nút dock,
   checkbox ở ManageModule/Settings, và **GET/POST `ModuleConfig/RendererHost`** — endpoint này là
   `[DnnAuthorize]` (MỌI user đăng nhập) nên bất kỳ Registered User nào cũng đổi được renderer host
   toàn portal = đổi link View/Embed của mọi admin. Setting cũ `renderer_host` tự degrade về `render`.
   Ghost `localStorage` bị xoá lúc boot; `getStoredRendererHostUrl()` giờ chỉ còn Oqtane.

## Commit `d2d3e2d` — Oqtane: insert SQL thật sự chạy (Phase 1 của audit)

Audit của owner (`Docs/AUDIT_SUBMISSION_DASHBOARD_SQL_JSON_SOURCE_2026-07-14.md`) — tôi đã **verify 2
claim P0 là ĐÚNG**:
- `OqtaneConnectionRegistry` chỉ đọc `appsettings.json` → connection lưu trong **DB Settings popup**
  (site settings `MegaForm_DashboardDb_*`) KHÔNG bao giờ tới runtime.
- `databaseType` rỗng → mặc định SQL Server (sai trên tenant SQLite/MySQL/Postgres).
Vì submit hook **fail-soft**, khách thấy "submitted" mà bảng SQL rỗng.

Đã sửa: registry đọc site override trước (theo alias đã lưu + `DashboardDatabase`), sniff provider từ
connection string khi `databaseType` rỗng, và submit hook merge `_submissionId`/`_formId`/`_submittedOnUtc`
vào data để INSERT có khoá join về `MF_Submissions`. **Lỗi insert chỉ log, KHÔNG trả về client** (submit
là endpoint ẩn danh → §10 security rules).

## CÒN LẠI (Phase 2 + 3 của audit)

- **Phase 2**: port `AiTools/CustomTableRows` + `AiTools/SubmissionDbView` từ DNN sang Oqtane (Oqtane
  đang 404 → tab DB View vô dụng), dùng chung service Core để khỏi drift. Kèm surface báo lỗi insert
  cho admin.
- **Phase 3**: **selector nguồn dữ liệu** trong Submissions dashboard: `JSON submissions (mặc định)` |
  `SQL table rows` (read-only trước), chỉ hiện với form có `databaseInsert.enabled`.
- Chưa runtime-QA fix Oqtane trên site thật (:5123/:5125).

---

# PHẦN 3 — DEMO ERP trên DNN (chạy live) + 4 fix DNN nữa

## Commits
`0dc6a2c` pinned surface không ghi hash · `0b19bd5` dock = Oqtane (Settings/Form Builder/Form Dashboard) ·
`520f6d0` one-surface-at-a-time + AI-SQL fallback + ModuleStyle · `9a46bd2` demo ERP + `_submissionId` cho DNN.

## Demo ERP (yêu cầu của owner) — ĐÃ CHẠY THẬT
Trang: `http://dnn10322_megaclean.ai/TestPinPage456`, DB = **chính DB của site** (`DNN10322_MegaClean`).

| Thành phần | Kết quả |
|---|---|
| Master data (không UI) | `MFDemo_Country` 10 dòng, `MFDemo_Currency` 9 dòng |
| Store (form 39) | Country/Currency = dropdown đọc SQL; submit → `MFDemo_Store` |
| Vendor (form 40) | → `MFDemo_Vendor` |
| Transaction (form 41) | 4 dropdown tham chiếu (Store/Vendor/Country/Currency) + **upload receipt** → `MFDemo_Transaction` |
| Invoice | **Tự sinh** bằng workflow Database node → `MFDemo_Invoice`. Live: TXN-8/9/10 → INV-8/9/10 (ISSUED) |
| Dashboard & Reports (form 42) | KPI + 7 report DataRepeater đọc SQL live (stores, vendors, transactions, country-wise, currency-wise, invoice status, invoice register) |
| Chứng từ | `/DesktopModules/MegaForm/API/Submissions/{id}/Print` render OK |

Tài liệu đầy đủ + script tái lập: `Docs/DEMO_DNN_ERP_STORE_VENDOR_TRANSACTION_INVOICE_2026-07-14.md`, `Docs/demo/`.

## ⭐ Bẫy khi dựng demo (nhớ để khỏi mất giờ)
1. **Thiếu `optionsConnectionKey` → dropdown SQL trả `[]` IM LẶNG.**
2. **`Workflow/Apply` trả 401 nếu chỉ gửi antiforgery** — phải gửi thêm header `ModuleId` + `TabId`.
3. Input `File` bị `display:none` (dropzone) → phải hiện ra mới upload được bằng automation.
4. **DNN cache ModuleSettings**: `UPDATE ModuleSettings` thẳng DB không có tác dụng tới khi app recycle.

## Lỗi sản phẩm demo lôi ra (đã vá)
`databaseInsert` không nhận submission id → `SubmissionId` NULL ở mọi bảng custom, invoice không join
được về transaction. Đã merge `_submissionId/_formId/_submittedOnUtc` vào data lúc submit trên **DNN**
(`9a46bd2`) và **Oqtane** (`d2d3e2d`).

## Còn nợ
- **Repack gói DNN** (`BuildPackage-DNN.ps1`) — site vẫn đang hot-swap.
- Phase 2–3 của audit SQL/JSON: port `CustomTableRows`/`SubmissionDbView` sang Oqtane + selector nguồn
  dữ liệu (JSON | SQL) trong Submissions dashboard.
- Fix Oqtane insert-reliability (`d2d3e2d`) **chưa QA runtime** trên site Oqtane thật.
