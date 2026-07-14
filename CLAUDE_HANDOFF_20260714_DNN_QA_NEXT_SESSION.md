# HANDOFF 2026-07-14 (p4) — QA tiếp trên DNN + hướng "platform chỉ là shell"

Site QA: **http://dnn10322_megaclean.ai/** (host / `dnnhost`), trang `/TestPinPage456`, module **385**,
MegaForm **1.7.106** (đang chạy **hot-swap**, CHƯA repack gói).
DB: `DNN10322_MegaClean` (SQL Server `WINDOWS-11\SQLEXPRESS`, Integrated Security).

---

## 0. TRẠNG THÁI — đã sửa & verify trong phiên này

| Commit | Nội dung |
|---|---|
| `bd3bcc8` | My Inbox surface + endpoint (DNN chưa từng có backend), Windowed⇄Fullscreen, langpicker z-index |
| `0dc6a2c` | Module pin surface **không còn tự thêm hash** vào URL |
| `0b19bd5` | Dock DNN = Oqtane (**Settings · Form Builder · Form Dashboard**), Settings mở popup `MFSettings` |
| `520f6d0` | **Một surface tại một thời điểm** (form/dashboard không chồng), AI tạo bảng SQL chạy (fallback DB site), ModuleStyle port sang DNN |
| `9a46bd2` | `databaseInsert` nhận `_submissionId` (DNN) + **demo ERP** đầy đủ |
| `564ae2a` | **Send to Inbox** chạy trên DNN, và chạy **nhiều lần** (bug Core, xem §2) |
| `ebf44a1` | `AiTools/SqlConnections` + `DbProvider` cho DNN |
| `d2d3e2d` | Oqtane: registry đọc DB Settings đã lưu + sniff provider + `_submissionId` |

Demo ERP live: `Docs/DEMO_DNN_ERP_STORE_VENDOR_TRANSACTION_INVOICE_2026-07-14.md` (form 39/40/41/42,
bảng `MFDemo_*`, invoice TXN-8/9/10 → INV-8/9/10).

---

## 1. VIỆC PHIÊN SAU — danh sách QA/fix (ưu tiên từ trên xuống)

### 1.1 ✅ XONG (commit `1b3fc31`) — AI designer đã thấy bảng của site
Hoá ra **3 lỗi**, không phải 1 dòng:
1. `SqlTables` trả `{count, results}` còn panel đọc `j.tables` (shape Oqtane) → 189 bảng đọc thành 0.
   DNN nay trả canonical `{count, tables}`; client nhận **cả hai** shape nên bundle cũ không làm sống lại bug.
2. `SqlTables`/`SqlColumns` **bỏ qua `connectionKey`** dù client gửi và `SqlConnections` chào key đó →
   chọn DB ngoài sẽ liệt kê bảng **DB site** dưới tên DB ngoài. Server giờ tự resolve connection và
   chặn key ngoài whitelist (rule 1) → `connectionKey=NotAllowedKey` = **400**.
3. `SqlConnections` liệt kê cả `DashboardDatabase` — client đã có sẵn mục "Current database" → picker
   hiện **một DB hai lần**. Nay chỉ trả các key phụ (đúng semantics Oqtane; không có key phụ → ẩn picker).
- Rule 10: 2 action này từng trả `ex.Message` (tên server/login) → nay log vào DNN event log, trả message chung.
- **Verify live:** 189 bảng, `MFDemo_Store` bung đúng cột thật (`StoreId/StoreCode/StoreName/SubmissionId`…).

### 1.1b ✅ XONG (commit `f258204`) — **canvas tab Build trắng trơn** (owner phát hiện giữa phiên)
- CSS `[OneSurfaceAtATime v20260714-01]` (`FormView.ascx`) ẩn `.mf-form-wrapper` **không định danh** khi
  mở surface admin. Nhưng class đó **không của riêng form public**: canvas builder (và submission detail,
  My Inbox) render form vào đúng class ấy → `!important` ở tầng body **xoá luôn canvas**. 19 field vẫn nằm
  trong DOM, chỉ là nằm dưới một tổ tiên `display:none`. Tab Design không sao vì preview ở container khác —
  chính điều đó khiến bug đọc ra như "builder mất field".
- Sửa: ẩn form **của trang**, không ẩn bản mà surface admin tự render (`:not(.mf-host-overlay …)`).
  ⚠️ **Đừng "bật lại" bằng `display:block`** — wrapper canvas thật ra là `flex`, ép block sẽ vỡ layout.
- Verify: public wrapper `display:none`, canvas wrapper `display:flex` (2369px), 19 field row hiện.

### 1.2 🔴 Gap quá cao giữa module và admin dock (ảnh owner gửi)
- Dock (`.mf-host-admin-dock`) nằm trong `#mf-dnn-host`, dưới nó là khoảng trắng lớn trước card form.
- Nghi can (chưa xác minh): `#mf-dnn-host` không có `min-height` nhưng skin DNN đặt padding cho
  `.DnnModule`, **cộng** margin của `.mf-host-admin-dock{margin:0 0 10px}` và margin-top của
  `.mf-form-wrapper`. Trong ảnh khoảng cách ~60–80px.
- **Cách làm đúng:** đo bằng devtools (`getBoundingClientRect` của dock vs `.mf-form-wrapper`), rồi
  chỉnh **trong `FormView.ascx`** (CSS DNN-scoped) — không đụng CSS chung.
- Lưu ý: khi module ở **Windowed**, surface được re-parent vào `.DnnModule` → kiểm tra cả 2 chế độ.

### 1.3 🔴 404 mới trong console (đã xác minh nguyên nhân)
| 404 | Nguyên nhân | Hướng sửa |
|---|---|---|
| `/DesktopModules/MegaForm/API/AiTools/SqlConnections` | Trước đây DNN **không có** action này | ✅ Đã sửa (`ebf44a1`) — verify lại sau khi clear cache |
| `/DesktopModules/MegaForm/API/Workflow/Library/FormBinding?formId=37` | Endpoint chỉ có ở **Oqtane** (route `Form/Workflow/Library/FormBinding`, `MegaFormController.WorkflowLibrary.cs:65`). DNN không có action/route | Port sang DNN (thin shell trên Core workflow-library service) **hoặc** cho client bỏ qua 404 (nhưng nên port cho parity) |
| `bulgaria-rose-hero.png` (và ảnh template khác) | Template nhúng **đường dẫn Oqtane** `/Modules/MegaForm/img/...` → 404 trên DNN. File **có tồn tại** tại `/DesktopModules/MegaForm/Assets/img/bulgaria-discovery/bulgaria-rose-hero.png` (đã verify 200) | Ảnh trong template phải đi qua `resolveAssetUrl()` / `__MF_PLATFORM__.assetsBaseUrl`, hoặc seed template dùng đường dẫn tương đối |

### 1.4 🟠 Directory chỉ gom 1 nhóm "Users"
- Oqtane nhóm theo **role/phòng ban**; DNN hiện gom hết vào 1 optgroup "Users" vì Core catalog
  (`IPermissionPrincipalCatalogProvider`) không gắn `RoleName` cho user principal.
- Hướng: trong `WorkflowInboxController.Directory` map thêm role của từng user (hoặc bổ sung `RoleName`
  cho user principal trong `DnnPermissionPrincipalCatalogProvider` — cân nhắc vì catalog này còn dùng
  cho permissions picker).

### 1.5 🟠 QA My Inbox thật (giờ đã có dữ liệu)
- Đã seed 5 user (`Workflow/SeedOrgDirectory`): `fin.lan`, `fin.minh`, `ops.nam`, `ops.hoa`, `buy.kien`
  (roles Finance / Operations / Procurement). **Mật khẩu do DNN sinh** → muốn đăng nhập bằng họ thì
  đặt lại password trong Persona Bar → Users.
- Đã gửi 4 submission vào inbox (bảng `MF_WorkflowTasks`, status `claimed`).
- **Còn phải QA:** đăng nhập bằng 1 user → My Inbox → tab **Assigned to Me** phải thấy task →
  Approve / Reject / Forward / Comment (endpoint DNN đã có, **chưa QA qua UI**).

### 1.6 🟠 Repack gói DNN
Site đang hot-swap. Chạy `MegaForm.DNN/BuildPackage-DNN.ps1` (bump version) rồi cài lại để gói giao
khách có đủ các fix ngày 07-14.

### 1.7 🟠 Việc còn nợ từ audit SQL/JSON của owner
- Phase 2: port `AiTools/CustomTableRows` + `SubmissionDbView` sang **Oqtane** (DNN đã có).
- Phase 3: **selector nguồn dữ liệu** trong Submissions dashboard (JSON mặc định | SQL table rows).
- Fix Oqtane `d2d3e2d` **chưa runtime-QA** trên site Oqtane thật (:5123/:5125).

---

## 2. ⭐⭐⭐ BUG CORE quan trọng nhất phát hiện hôm nay (đã vá)

**Send to Inbox chỉ chạy được ĐÚNG MỘT LẦN trên mỗi site**, sau đó luôn 400.

`WorkflowTaskService.CreateAdHocReviewTask` tạo case với `ExecutionId` **rỗng** (task ad-hoc không có
workflow execution), trong khi `MF_WorkflowCases` có **UNIQUE index `IX_MF_WorkflowCases_ExecutionId`**.
Lần đầu insert `''` OK; lần thứ hai:
`Cannot insert duplicate key row … The duplicate key value is ()`.

→ Đã vá ở **Core** (`ExecutionId = "adhoc-" + guid`). **Oqtane thoát nạn chỉ vì schema EF của nó không
tạo index này** — nghĩa là bug vẫn nằm trong Core và có thể phát nổ ở bất kỳ site nào có index.

⚠️ **Bài học QA:** lỗi này chỉ lộ ra khi **gửi lần thứ hai**. Mọi QA "gửi 1 lần thấy OK" đều mù.

---

## 3. TRẢ LỜI: làm sao để DNN / Oqtane / Umbraco **chỉ là shell**

Nguyên tắc: **Core làm việc — platform chỉ dịch request/response và cung cấp danh tính.**
Ba lớp, và hôm nay đã áp dụng đúng cả ba (xem `564ae2a`):

### Lớp 1 — Server: controller = adapter mỏng
- Không viết logic trong controller. Gọi service Core: `WorkflowTaskService`, `SubmissionProcessor`,
  `FieldOptionsService`, `DataRepeaterService`, `FormDatabaseInsertService`…
- Những gì **được phép** khác nhau giữa các platform: **chỉ 3 thứ** —
  1. **Danh tính** (`UserContext`): DNN từ `UserInfo`, Oqtane từ claims, Web từ JWT.
  2. **Kết nối DB** (`IConnectionRegistry`).
  3. **Repository** (EF / Dapper / DNN DataProvider).
- Ví dụ hôm nay: `Workflow/Directory` viết lại trên `IPermissionPrincipalCatalogProvider` (Core, cả 3
  platform đều đã cài) thay vì gọi `RoleController` trực tiếp; `SendSubmission` chỉ gọi
  `CreateAdHocReviewTask`; `SeedOrgDirectory` chỉ gọi `IWorkflowIdentityProvisioningService`.

### Lớp 2 — Auth: resolve từ ACTOR, không từ REQUEST
- **Cấm** `[DnnModuleAuthorize]` cho các endpoint mà UI dùng chung gọi: nó lấy module từ header
  `ModuleId`/`TabId` — header mà UI chung **không gửi**, và DNN **400** trên child-portal alias.
- Thay bằng gate dựa trên `UserInfo` (`IsSuperUser || IsInRole("Administrators")`), như
  `ModuleStyleController.IsPortalAdmin()` / `WorkflowInboxController`.
- Hệ quả: client không cần biết platform → đúng tinh thần shell.

### Lớp 3 — Client: MỘT chokepoint biết về platform
- `MegaForm.UI/src/shared/antiforgery.ts` là **nơi duy nhất** được biết host xác thực kiểu gì.
  Hôm nay đã dạy nó thêm DNN (`RequestVerificationToken`). Oqtane giữ nguyên `X-XSRF-TOKEN-HEADER`.
- **Không** thêm `ModuleId`/`TabId` vào chokepoint (400 trên child-portal alias) — đó chính là lý do
  Lớp 2 phải resolve auth từ actor.
- Feature code (`SubmissionsShell`, `my-inbox`, settings popup…) **chỉ `fetch()`**, không tự chèn header.
- Còn nợ: `MegaForm.UI/src/view-designer/shared.ts` vẫn có nhánh `isDnn()` cho **URL shape**
  (DNN là action-based: `ModuleConfig/Get?moduleId=`). Muốn shell hoàn toàn thì hoặc (a) thêm route
  REST alias trên DNN, hoặc (b) đưa việc dựng URL vào `platform-host.ts` (1 nơi duy nhất).

### Việc nên làm để "shell hoá" nốt (đề xuất, chưa làm)
1. **Chuẩn hoá URL**: mọi endpoint dùng chung có **cùng shape** trên 3 platform (thêm route alias trên
   DNN) → xoá hết nhánh `isDnn()` trong TS.
2. **Chuẩn hoá response**: `{count, tables}` vs `{count, results}` (chính là bug §1.1) → viết
   **contract test** chạy trên cả 3 platform, so sánh JSON shape.
3. **Rút mọi controller còn logic** (DNN `AiToolsController` ~900 dòng) về Core service dùng chung.
4. **Danh sách endpoint song sinh**: lập bảng đối chiếu DNN ↔ Oqtane ↔ Web, đánh dấu cái nào thiếu
   (hôm nay phát hiện thiếu: `SendSubmission`, `Directory`, `SqlConnections`, `DbProvider`,
   `Workflow/Library/FormBinding`, `ModuleStyle` — tất cả đều là "Oqtane có, DNN không").

---

## 4. BẪY đã trả giá (đừng lặp lại)

1. **routeName DNN phải UNIQUE** — trùng tên → `RegisterRoutes` ném exception → **mọi route sau đó,
   kể cả route mặc định, không được đăng ký** (triệu chứng: `i18n/list` 404 ở nơi chẳng liên quan).
2. **`[DnnModuleAuthorize]` → 401** với client dùng chung (không gửi `ModuleId`/`TabId`).
3. **Thiếu `optionsConnectionKey`** → dropdown SQL trả `[]` **im lặng**.
4. **`Workflow/Apply` cần header `ModuleId` + `TabId`** (401 nếu chỉ có antiforgery).
5. **Input `File` bị `display:none`** (dropzone) → automation phải hiện ra mới upload được.
6. **DNN cache ModuleSettings** — `UPDATE ModuleSettings` thẳng DB không có tác dụng đến khi app recycle
   (đổi qua UI Manage-module hoặc `touch web.config`).
7. **Send-to-Inbox phải test ≥ 2 lần** (xem §2).
8. Log của MegaForm (`LogService`) **không ra file DNN**; muốn thấy exception thật phải dùng
   `Exceptions.LogException` (đã thêm) rồi đọc `Portals/_default/Logs/*.log.resources`.

---

## 5. Lệnh hay dùng

```bash
# version gói đang cài
sqlcmd -S "WINDOWS-11\SQLEXPRESS" -E -d DNN10322_MegaClean -I -h -1 -W \
  -Q "SELECT Version FROM Packages WHERE Name LIKE '%MegaForm%'"

# task trong inbox
sqlcmd … -Q "SELECT SubmissionId, AssignedUserName, Status FROM MF_WorkflowTasks ORDER BY CreatedAt DESC"

# hot-swap sau khi build
cp MegaForm.DNN/bin/Release/net472/MegaForm.DNN.dll  E:/DNN_SITES/DNN10322_MegaClean/Website/bin/
cp MegaForm.DNN/bin/Release/net472/MegaForm.Core.dll E:/DNN_SITES/DNN10322_MegaClean/Website/bin/
cp MegaForm.DNN/Views/FormView.ascx  E:/DNN_SITES/DNN10322_MegaClean/Website/DesktopModules/MegaForm/Views/
cp Assets/js/megaform-*.js           E:/DNN_SITES/DNN10322_MegaClean/Website/DesktopModules/MegaForm/Assets/js/
```

⚠️ Sửa `.ascx` xong phải **touch `web.config`** (recycle app) — ASP.NET không nhận CSS/markup mới ngay.

### Browser QA — 4 bẫy đã trả giá (07-14 p5)
- Playwright MCP dùng chung profile với Codex → bật Chrome riêng
  `--remote-debugging-port=9222 --user-data-dir=C:\Users\Administrator\AppData\Local\Temp\chrome-qa-5116`.
  **Profile này KHÔNG có sẵn phiên host** → phải login `host`/`dnnhost` (form `dnn_ctr_Login_Login_DNN_txtUsername`).
- Khi **MCP browser không lên** (chrome-devtools/playwright đều không nạp được): lái CDP thẳng bằng
  `node` (Node ≥22 có `WebSocket` sẵn) → script mẫu ở scratchpad `cdp-eval.mjs` / `cdp-drive.mjs`.
- ⭐⭐**ĐỪNG `Page.reload` tab builder**: builder có beforeunload; reload bị ngắt giữa chừng làm **kẹt renderer**,
  và vì mọi tab cùng origin **dùng chung 1 renderer process** → **treo sạch cả 10 tab** (Page.enable/Runtime.evaluate
  im lặng, chỉ lệnh phía browser còn trả lời). Cách gỡ duy nhất là đóng tab → Chrome tự thoát nếu đó là tab cuối.
  Luôn `Page.navigate` **kèm query cache-bust** thay vì reload.
- ⭐`Page.navigate` tới **đúng URL hiện tại** (chỉ khác hash) = điều hướng same-document → **không tải lại**;
  DOM vẫn là bản render cũ và ta tưởng bản vá không ăn. Thêm `&_cb=<random>`.
