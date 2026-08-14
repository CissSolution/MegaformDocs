# HANDOFF 2026-07-17 (p3) — NAMED SQL CONNECTIONS trong Database Settings (Core, 4 nền hưởng)

> Owner yêu cầu giữa phiên: "CustomerErp phải được hiển thị trong Database Settings → bổ sung ngay cách
> để thêm SQL connection và danh sách" + "fix CORE để Oqtane, Umbraco, DNN đều hưởng lợi ích".
> **TRẠNG THÁI: Oqtane + DNN ĐÃ XONG + QA PASS LIVE. Umbraco/Web CHƯA wire. COMMIT ĐANG KẸT** (xem §5).
> Nối tiếp `CLAUDE_HANDOFF_20260717_SESSION_DNN_TWIN_BOOTSWATCH_DONE.md` (commit `5438235` + `7aea22d`).

## §1 Kiến trúc [NamedConnections v20260717-01]
- **Core (MỚI, dùng chung 4 nền): `MegaForm.Core/Services/NamedConnectionCatalog.cs`**
  - Catalog = MỘT blob JSON `[{Name,Provider,ConnectionString}]` lưu ở settings store từng nền dưới
    key **`MegaForm_NamedConnections`** (Oqtane Site setting IsPrivate; DNN PortalSettings).
  - API: `Parse/Serialize/ValidateName` (regex identifier ≤64, chặn reserved
    DashboardDatabase/DefaultConnection/SiteSqlServer/DnnDefault/MegaForm) / `Find/Contains/Names/
    Upsert/Remove/MaskSecrets` (password/pwd → `***`, KHÔNG bao giờ echo secret về browser).
  - Nguyên tắc trust: save = hành động admin-gated → tên saved vào allowlist ngang appsettings entry.
- **Oqtane**:
  - `OqtaneConnectionRegistry.GetConnection` (Startup.cs): resolve theo chuỗi
    explicit-cs → saved DashboardDb override → **named catalog (saved ĐÈ appsettings cùng tên)** → appsettings.
  - Startup factory `DatabaseInsertBindingResolver`: allowlist += check động catalog (không cần restart).
  - `ExternalTableController.AllowedConnections()` + `AiToolsController.AllowedExternalConnections()`
    += tên saved → **dropdown builder (AiTools/SqlConnections) tự thấy connection UI-added**.
  - Endpoints (MegaFormController.ModuleConfigDatabase.cs, CanUseAdminPopup, mask secrets):
    `GET ModuleConfig/ConnectionsList` (config entries từ appsettings read-only + saved entries) ·
    `POST ModuleConfig/ConnectionsSave` · `POST ModuleConfig/ConnectionsDelete` (route PHẲNG để DNN twin cùng path).
  - `MegaFormAssetVersion` → **20260717-B404**.
- **DNN twin**: `DnnConnectionRegistry` resolve named từ PortalSettings (helper
  `ReadNamedConnectionsJson()`, key FULL không qua prefix helper) + `DnnServiceLocator.
  IsAllowedExternalConnection` += catalog + `AiToolsController.AllowedExternalConnections` += catalog +
  `ModuleConfigController.ConnectionsList/Save/Delete` ([ValidateAntiForgeryToken] + **IsPortalAdminUser
  gate riêng** vì class-level [DnnAuthorize] = any-auth, SECURITY §3). FormView V → **B405**.
- **Client (1 bundle 4 nền): `dashboard/index.ts` → openDatabaseSettings** thêm section
  **"SQL Connections (reusable list)"**: list rows badge Config/Saved + provider + CS đã mask +
  Edit (điền lại form, CS phải paste lại — không echo secret) + Delete; form thêm mới
  (Name/Provider/CS + Test dùng lại DatabaseSettings/Test + Save Connection). Đã `npm run build:dashboard`.

## §2 ⭐⭐BẪY ĐẮT bắt được: `AuthEntityId(Site) = -1` với XHR từ modal dashboard
Save đầu tiên ghi setting dưới **EntityId=-1** → catalog vô hình toàn hệ (đúng bẫy memory
"AuthEntityId(Site)=-1→form vô hình", lần này với Setting). **Fix chuẩn**: resolver
`ResolveSiteIdForConnectionCatalog()` = AuthEntityId → claim siteid → **ITenantManager.GetAlias().SiteId**
(CÙNG seam OqtaneConnectionRegistry đọc → reader/writer không bao giờ lệch site) → query siteId.
Áp cả 3 chỗ đọc/ghi + fallback tương tự trong ExternalTableController.SavedConnectionNames +
AiToolsController. Row -1 đã UPDATE tay về EntityId=1 trong Fresh1804.

## §3 QA ĐÃ CHẠY (live, pixel + API)
- **:5125**: Settings → Database Settings hiện **Config: CustomerErp / DefaultConnection / site2** (đúng
  yêu cầu owner "CustomerErp phải hiển thị") + form thêm mới. Thêm **QaLegacyErp**
  (`Server=.\SQLEXPRESS;Database=LegacyErp_Demo;...`): Test "✓ Connection successful" → Save → list có
  **Saved: QaLegacyErp** (Edit/Delete). `AiTools/SqlConnections` = **[CustomerErp, QaLegacyErp]** (nguồn
  dropdown builder) · `ExternalTable/Tables?connectionKey=QaLegacyErp` = **200** trả đúng bảng
  LegacyErp_Demo (BigTxn, Categories, Country…) = registry+allowlist end-to-end.
  Screenshot: `qa-namedconn-oqtane-modal.png`.
- **DNN megaclean**: `ConnectionsList` trước = [config:DashboardDatabase] → `ConnectionsSave` QaErpDnn
  (antiforgery RequestVerificationToken) = 200 success → list sau có **saved:QaErpDnn** →
  `AiTools/SqlConnections` = [QaErpDnn]. (UI modal DNN dùng CHUNG bundle đã deploy + V B405 — chưa chụp
  pixel, làm đầu phiên sau nếu cần.)
- Connection QA để lại: `QaLegacyErp` (:5125) + `QaErpDnn` (DNN) — dùng làm demo luôn hoặc Delete qua UI.

## §4 CÒN LẠI cho phiên sau
1. 🟠 **Umbraco/Web wiring** (Core đã sẵn — chỉ wire): `UmbracoConnectionRegistry` + `WebConnectionRegistry`
   (cả 2 implement IConnectionRegistry+IConnectionNameProvider, đọc appsettings) → thêm catalog lookup
   (settings store từng nền) + endpoints ConnectionsList/Save/Delete twin + allowlist. Client KHÔNG cần
   sửa (dashboard bundle chung đã có UI + gọi path phẳng `ModuleConfig/ConnectionsList|Save|Delete`).
2. 🟡 DNN UI modal pixel-check + Delete/Edit flow visual; Oqtane Delete flow visual (API đã pass).
3. 🟡 `IConnectionNameProvider` cho OqtaneConnectionRegistry/DnnConnectionRegistry (workflow DB-node
   dropdown cũng nên thấy saved names — hiện chỉ Web/Umbraco implement interface này).
4. 🟡 DNN PortalSettings value có thể giới hạn độ dài (nvarchar cũ 2000?) — catalog nhiều connection dài
   cần verify; nếu đụng trần → chuyển blob sang bảng MF_ riêng (pattern DnnExternalBindingStore).

## §5 ⚠️ COMMIT ĐANG PENDING — làm NGAY đầu phiên sau
Lúc chốt phiên có **`git add .` (PID 16268, chạy từ 09:30) của owner/process khác đang giữ index.lock**
→ tôi KHÔNG commit đè. Việc đầu phiên sau (hoặc owner tự làm):
1. Chờ/kiểm tra `git status` — nếu `git add .` kia đã stage TẤT CẢ (kể cả Codex-trộn
   `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`, Umbraco WIP, junk file
   `"+x[3].trim()));*"`) thì **unstage về đúng bộ file** trước khi commit.
2. Bộ file NamedConnections cần commit (đã build xanh + QA):
   `MegaForm.Core/Services/NamedConnectionCatalog.cs` (MỚI) ·
   `MegaForm.Oqtane.Server/Services/Startup.cs` ·
   `MegaForm.Oqtane.Server/Controllers/MegaFormController.ModuleConfigDatabase.cs` ·
   `MegaForm.Oqtane.Server/Controllers/ExternalTableController.cs` ·
   `MegaForm.Oqtane.Shared/AssetVersion.cs` (B404) ·
   `MegaForm.UI/src/dashboard/index.ts` ·
   `MegaForm.DNN/WebApi/MegaFormApiController.cs` (registry+locator allowlist+3 endpoints) ·
   `MegaForm.DNN/WebApi/AiToolsController.cs` (DNN — file này SẠCH trước phiên, chỉ có sửa của tôi) ·
   `MegaForm.DNN/Services/DnnServiceLocator.cs` ·
   `MegaForm.DNN/Views/FormView.ascx.cs` (V B405).
   **KHÔNG kèm** `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` (Codex-trộn — sửa của tôi
   trong đó có badge [NamedConnections v20260717-01]: ctor +ISettingRepository + block saved-names
   trong AllowedExternalConnections; giữ uncommitted cùng phần Codex như trước).

## §6 Deploy state
- **:5125**: Server+Shared+Core DLL net10 mới ở site root + `wwwroot/Modules/MegaForm/js/megaform-dashboard.js`
  mới; đang chạy (B404). **DNN**: 3 DLL bin + `Assets/js/megaform-dashboard.js` mới; app pool đã recycle (B405).
- Trước đó cùng ngày: seed QA `MFPerf_BigTxn`(DNN)/`BigTxn`(LegacyErp_Demo) 1.000 dòng + form 47/13
  "Perf BigTxn"; SSMS answer: **CustomerErp = `Server=.\SQLEXPRESS;Database=LegacyErp_Demo`** (KHÔNG phải
  Fresh1804 — Fresh1804 chỉ chứa MF_Forms/MF_Submissions).
