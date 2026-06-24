# BÁO CÁO RÀ SOÁT PHÂN QUYỀN & BẢO MẬT MEGAFORM
## DNN (net472) & Oqtane (net10.0) — June 2026

> **FIX STATUS (2026-06-11) — Nhóm Priority-1 đã verify + áp dụng:**
> - ✅ **Oqtane path traversal** (`MegaFormController.DownloadFile`): hardened with `Path.GetFullPath` +
>   trailing-separator containment. **Built + deployed + browser-PROVEN** (traversal/absolute → 404, unauth → 403, no crash).
> - ✅ **DNN path traversal** (`FilesController.Download`): same `Path.GetFullPath` hardening. Code done + **compiles 0 errors**. Deploy-to-DNN-site pending (IIS).
> - ✅ **DNN `ModuleConfigController` admin-lock**: class `[DnnAuthorize]` → `[DnnAuthorize(StaticRoles = "Administrators")]`. Code done + **compiles 0 errors**. Deploy pending.
> - ⚠️ **CORRECTION to this report's fix #2 (Oqtane `RazorWidgetController.Action`):** the recommended
>   `[Authorize(Policy="EditModule")]` would **break public-form Razor-widget action buttons** (the endpoint is
>   called by runtime forms — `megaform-widget-razor.ts`). Correct fix = server-side lookup of the saved
>   `actionSql` from the form schema (don't trust client SQL). NOT YET DONE (needs design decision).
> - Minor corrections: DNN `SaveDatabaseSettings` DOES have `[ValidateAntiForgeryToken]`; the `....//`→`..//`
>   traversal example is wrong for .NET (`Replace` strips both `..`) — hardening still warranted for edge cases.


> **Scope:** Kiểm tra xem ngườii dùng có được phép edit trên trang, có truy cập được admin dashboard không, và phân quyền đã chặt chẽ trên cả 2 nền tảng chưa.

---

## 1. TÓM TẮT KẾT LUẬN

| Tiêu chí | DNN | Oqtane |
|----------|-----|--------|
| Ngườii dùng thường có edit trên trang? | ❌ Không — edit bị giới hạn bởi DNN Module Permission | ❌ Không — edit bị giới hạn bởi Oqtane `EditModule` policy |
| Ngườii dùng thường có truy cập Admin Dashboard? | ❌ Không — hầu hết admin controller yêu cầu `Administrators` | ❌ Không — hầu hết admin endpoint yêu cầu `EditModule` |
| Phân quyền chặt chẽ? | 🟡 **Có lỗ hổng nghiêm trọng** — `ModuleConfigController` mở cho bất kỳ user authenticated nào | 🟡 **Có lỗ hổng đáng lo** — `RazorWidgetController.Action` thực thi SQL không cần auth; nhiều admin endpoint chỉ cần authenticated (không cần EditModule) |
| Multi-tenant an toàn? | 🔴 **Không** — thiếu portal validation defense-in-depth | 🟡 **Cơ bản an toàn** — nhưng còn gap ở widget surface và file download |

**Khuyến nghị khẩn cấp:**
1. DNN: Khóa `ModuleConfigController` bằng `[DnnAuthorize(StaticRoles = "Administrators")]`
2. Oqtane: Thêm `[Authorize]` hoặc `[Authorize(Policy = "EditModule")]` vào `RazorWidgetController.Action`
3. Cả 2: Củng cố path traversal check ở file download endpoints

---

## 2. DNN (net472) — CHI TIẾT

### 2.1 Kiến trúc phân quyền

DNN module sử dụng 2 lớp kiểm soát:
- **DNN Framework**: `DnnApiController` + `[DnnAuthorize]`, `[DnnModuleAuthorize]`
- **MegaForm custom**: `ResolveTargetPortalId()` để kiểm tra SuperUser/Admin cross-portal

### 2.2 Controllers & Authorization

| Controller | Class-Level Auth | Đánh giá |
|------------|------------------|----------|
| `FormController` | `[DnnAuthorize(StaticRoles="Administrators")]` | ✅ Admin-only |
| `SubmissionsController` | `[DnnAuthorize(StaticRoles="Administrators")]` | ✅ Admin-only (nhưng `List`/`Get` override `[AllowAnonymous]` + custom `CanViewSubmissionRow`) |
| `PermissionsController` | `[DnnAuthorize(StaticRoles="Administrators")]` | ✅ Admin-only |
| `ReportsController` | `[DnnAuthorize(StaticRoles="Administrators")]` | ✅ Admin-only |
| `WorkflowController` | `[DnnAuthorize]` (any authenticated) | 🟡 Task actions không có action-level auth — dựa vào service layer |
| `ModuleConfigController` | `[DnnAuthorize]` (any authenticated) | 🔴 **CRITICAL** — Xem phần 2.3 |
| `UploadFileController` | `[AllowAnonymous]` | ✅ Public by design (có `form.RequireAuth` gate) |
| `FilesController` | `[DnnAuthorize]` (any authenticated) | 🟡 Path traversal weakness |
| `DraftController` | `[AllowAnonymous]` | ✅ Public by design |
| `SubmitController` | `[AllowAnonymous]` | ✅ Public by design |
| `RazorWidgetController` | **None** | 🟡 Auth deferred to Oqtane companion |

### 2.3 🔴 CRITICAL: `ModuleConfigController` — Bất kỳ user nào cũng đọc/ghi config

**File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs` (dòng 3279+)

Class chỉ có `[DnnAuthorize]` (any authenticated user). **Không** có `StaticRoles="Administrators"`.

#### Information Disclosure (GET):
| Endpoint | Dữ liệu nhạy cảm exposed |
|----------|--------------------------|
| `GetDatabaseSettings` | `Database_ConnectionString` **plaintext** |
| `GetEmailSettings` | SMTP host, port, username, password presence |
| `GetPaymentSettings` | PayPal Client ID, Stripe Secret Key (partial mask) |
| `GetCaptchaSettings` | reCAPTCHA/hCaptcha site keys |
| `Get(moduleId)` | Danh sách tất cả forms trong portal (dù user không phải admin) |

#### Unauthorized Mutation (POST):
| Endpoint | Hậu quả |
|----------|---------|
| `SaveDatabaseSettings` | Ghi đè connection string |
| `SavePaymentSettings` | Ghi đè Stripe/PayPal config |
| `SaveEmailSettings` | Ghi đè SMTP settings |
| `SaveCaptchaSettings` | Ghi đè CAPTCHA keys |
| `SaveUploadSettings` | Thay đổi upload policies |
| `SaveRendererHost` | Thay đổi renderer host URL |
| `TestDatabaseSettings` | Probe kết nối database ngoài |
| `TestEmailSettings` | Gửi test email tùy ý |

**Code mẫu (dòng 3837):**
```csharp
[DnnAuthorize]  // ← Chỉ cần bất kỳ user authenticated nào
public class ModuleConfigController : DnnApiController
{
    public HttpResponseMessage GetDatabaseSettings()
    {
        var connectionString = GetPortalSetting("Database_ConnectionString");
        // Trả về plaintext cho bất kỳ ai đã login!
    }
}
```

**Fix khuyến nghị:**
```csharp
[DnnAuthorize(StaticRoles = "Administrators")]
public class ModuleConfigController : DnnApiController { ... }
```

### 2.4 🟠 HIGH: `FilesController.Download` — Path Traversal

**File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs` (dòng 3016+)

```csharp
var safePath = path.Replace("..", "").TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
var fullPath = Path.Combine(appDataRoot, safePath);
if (!fullPath.StartsWith(appDataRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
    return Request.CreateResponse(HttpStatusCode.NotFound);
```

**Vấn đề:**
- `Replace("..", "")` không an toàn: `....//` → `..//`
- `Path.Combine` **không resolve** `..` sequences
- `StartsWith` check bị bypass bởi `foo\\..\\..\\..\\windows\\system32\\file.txt`

**Fix khuyến nghị:**
```csharp
var fullPath = Path.GetFullPath(Path.Combine(appDataRoot, safePath));
if (!fullPath.StartsWith(Path.GetFullPath(appDataRoot) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
    return NotFound();
```

### 2.5 🟡 MODERATE: Missing Portal Validation

**Pattern lặp lại:** Nhiều repository methods chỉ lookup theo ID mà không verify `PortalId`:

| Method | File | Risk |
|--------|------|------|
| `GetForm(int formId)` | `FormRepository.cs` | Cross-portal form access nếu guess được ID |
| `GetSubmission(int submissionId)` | `FormRepository.cs` | Cross-portal submission access |
| `FormView.ascx.cs` explicit render | `Views/FormView.ascx.cs` | `?formid=N` không check `form.PortalId == PortalId` |
| `List(int portalId)` | `FormController.cs` | Accept arbitrary `portalId` từ client |

**Impact:** Multi-tenant DNN site — portal admin A có thể đọc form/submission của portal B bằng cách guess ID.

### 2.6 🟡 MODERATE: Missing `[ValidateAntiForgeryToken]`

- `DesignerController.SaveBlock` / `DeleteBlock`
- `WorkflowController` task actions (`ClaimTask`, `ApproveTask`, `RejectTask`, `ForwardTask`)
- `BuilderTemplatesController.UploadJson`

→ CSRF risk cho workflow operations.

---

## 3. OQTANE (net10.0) — CHI TIẾT

### 3.1 Kiến trúc phân quyền

Oqtane module sử dụng:
- **Oqtane Policies**: `[Authorize(Policy = "ViewModule")]`, `[Authorize(Policy = "EditModule")]`
- **Module permission list**: `UserSecurity.IsAuthorized(PageState.User, PermissionNames.Edit, ModuleState.PermissionList)`
- **MegaForm custom**: `CanUseAdminPopup()` (chỉ check `IsAuthenticated`)

### 3.2 Controllers & Authorization

| Controller / Endpoint | Auth | Đánh giá |
|-----------------------|------|----------|
| `MegaFormController` (Form CRUD) | `[Authorize(Policy = "EditModule")]` / `[Authorize(Policy = "ViewModule")]` | ✅ Chặt chẽ |
| `Schema/{formId}` | No auth | ✅ Public by design |
| `Submit/Post` | `[AllowAnonymous]` | ✅ Public by design |
| `Upload/File` | `[AllowAnonymous]` | ✅ Public by design (có `RequireAuth` gate) |
| `ModuleConfig/*` | `[Authorize]` + `CanUseAdminPopup()` | 🟡 Chỉ cần authenticated (không cần EditModule) |
| `Reports/*` | `[Authorize]` + `CanUseAdminPopup()` | 🟡 Chỉ cần authenticated |
| `Phase2/*` | `[Authorize]` + `CanUseAdminPopup()` | 🟡 Chỉ cần authenticated |
| `DatabaseSettings/*` | `[Authorize]` + `CanUseAdminPopup()` | 🟡 Chỉ cần authenticated |
| `RazorWidgetController.List` | **None** | 🟡 Leak widget catalog |
| `RazorWidgetController.Action` | **None** | 🔴 **CRITICAL** — SQL execution without auth |
| `RazorWidgetController.Compile` | Host-only gate | ✅ Bảo vệ tốt |
| `SubformController.Compute/GetRows` | `[AllowAnonymous]` | 🟡 SQL execution anonymous |
| `Files/Download` | `[Authorize]` | 🟡 Không check form/submission ownership |

### 3.3 🔴 CRITICAL: `RazorWidgetController.Action` — SQL Execution Without Auth

**File:** `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` (dòng 253+)

```csharp
[HttpPost("Action")]
public async Task<IActionResult> Action([FromBody] ActionRequest req)
{
    // Không có [Authorize]!
    var result = await svc.RunAsync(req.ActionSql, bag, req.ConnectionKey ?? "DashboardDatabase");
    return Ok(new { success = true, affected = result.AffectedRows, data = result.Data });
}
```

**Impact:** Bất kỳ ai (kể cả anonymous) có thể POST SQL tùy ý để:
- Đọc dữ liệu từ `DashboardDatabase`
- INSERT/UPDATE/DELETE (tùy thuộc `IRazorActionService` implementation)
- Leak toàn bộ schema và data

**Fix khuyến nghị:**
```csharp
[HttpPost("Action")]
[Authorize(Policy = "EditModule")]  // Hoặc ít nhất [Authorize]
public async Task<IActionResult> Action([FromBody] ActionRequest req) { ... }
```

### 3.4 🟡 `CanUseAdminPopup()` — Quá yếu cho Admin Surface

**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 243)

```csharp
private bool CanUseAdminPopup()
{
    return User?.Identity?.IsAuthenticated == true;
}
```

Được dùng bởi **18 endpoints**:
- `ModuleConfig/*` (DatabaseSettings, EmailSettings, PaymentSettings, RendererHost, Style)
- `Reports/*` (SubmissionData, Backfill, Chart, Export)
- `Phase2/*` (GetViewConfigs, SaveViewConfig, DeleteViewConfig)

**Impact:** Bất kỷ user authenticated nào (không cần EditModule permission) có thể:
- Đọc database connection settings
- Xem report data
- Tạo/xóa form views

**Fix khuyến nghị:**
```csharp
private bool CanUseAdminPopup()
{
    return User?.Identity?.IsAuthenticated == true 
        && (User.IsInRole("Administrators") || User.IsInRole("Host")
            || _userPermissions.IsAuthorized(User, "EditModule", _entityId));
}
```

### 3.5 🟡 `Files/Download` — Không kiểm tra ownership

**File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (dòng 1509+)

```csharp
[HttpGet("Files/Download")]
[Authorize]  // Any authenticated user
public IActionResult Download(string path)
{
    var safePath = path.Replace("..", string.Empty).TrimStart('/', '\\');
    var fullPath = Path.Combine(appDataRoot, safePath);
    if (!fullPath.StartsWith(appDataRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
        return NotFound();
    // Trả file mà không check user có quyền với form/submission này không
}
```

**Impact:** User A có thể download file của user B nếu guess được path.

### 3.6 🟡 `SubformController.GetRows` — Anonymous SQL

**File:** `MegaForm.Oqtane.Server/Controllers/SubformController.cs` (dòng 178)

```csharp
[AllowAnonymous]
public IActionResult GetRows(...)
{
    // Chạy SELECT * FROM [tableName] WHERE [parentKeyColumn] = @submissionId
    // Chỉ block ; ' " [ ] trong table/column name
}
```

**Impact:** Anonymous caller có thể query bất kỷ table nào trong `DashboardDatabase` (nếu bypass char blacklist).

---

## 4. SO SÁNH DNN vs OQTANE

| Khía cạnh | DNN | Oqtane | Nhận xét |
|-----------|-----|--------|----------|
| **Admin endpoint protection** | `[DnnAuthorize(StaticRoles="Administrators")]` phổ biến | `[Authorize(Policy="EditModule")]` phổ biến | Cả 2 đều tốt ở core CRUD |
| **Config/Settings endpoint** | 🔴 `[DnnAuthorize]` (any auth) | 🟡 `[Authorize]` + `CanUseAdminPopup()` (any auth) | Cả 2 đều yếu ở config surface |
| **Path traversal defense** | 🔴 Weak (`Replace("..","")`) | 🟡 Weak (`Replace("..","")`) | Cả 2 cần `Path.GetFullPath` |
| **Cross-tenant filtering** | 🔴 Thiếu defense-in-depth | 🟡 Có `SiteId`/`ModuleId` filtering | Oqtane tốt hơn nhờ EF + auth pipeline |
| **CSRF protection** | 🟡 Missing trên nhiều POST | ✅ `[IgnoreAntiforgeryToken]` class-level nhưng các endpoint nhạy cảm có antiforgery | Mixed |
| **Client-Server parity** | 🟡 UI dùng `UserInfo.IsInRole("Administrators")` — server cần match | ✅ `_isAdmin` dùng `UserSecurity.IsAuthorized(..., PermissionNames.Edit, ModuleState.PermissionList)` — same source of truth | Oqtane tốt hơn |
| **Public form surface** | ✅ An toàn | ✅ An toàn | Cả 2 đều tốt |
| **Widget/Razor surface** | 🟡 Auth deferred | 🔴 `Action` SQL execution no auth | Oqtane nguy hiểm hơn ở widget layer |

---

## 5. KHUYẾN NGHỊ KHẮC PHỤC (Priority)

### 🔴 Priority 1 — Khắc phục ngay

| # | Issue | Platform | Fix |
|---|-------|----------|-----|
| 1 | `ModuleConfigController` mở cho any authenticated user | DNN | Thêm `[DnnAuthorize(StaticRoles = "Administrators")]` ở class level |
| 2 | `RazorWidgetController.Action` SQL execution without auth | Oqtane | Thêm `[Authorize(Policy = "EditModule")]` |
| 3 | Path traversal ở `FilesController.Download` | DNN + Oqtane | Dùng `Path.GetFullPath` + `StartsWith` sau resolve |

### 🟠 Priority 2 — Khắc phục trong sprint

| # | Issue | Platform | Fix |
|---|-------|----------|-----|
| 4 | `CanUseAdminPopup()` quá yếu | Oqtane | Đổi thành `EditModule` policy hoặc Admin/Host check |
| 5 | Missing portal validation ở `GetForm`/`GetSubmission` | DNN | Thêm `form.PortalId == PortalId` check |
| 6 | `FormView.ascx.cs` explicit render cross-portal | DNN | Validate `form.PortalId == PortalSettings.PortalId` |
| 7 | `SubformController.GetRows` anonymous SQL | Oqtane | Thêm `[Authorize]` hoặc `EditModule` |
| 8 | `Files/Download` không check ownership | Oqtane | Kiểm tra user có quyền với form chứa file không |

### 🟡 Priority 3 — Củng cố defense-in-depth

| # | Issue | Platform | Fix |
|---|-------|----------|-----|
| 9 | Missing `[ValidateAntiForgeryToken]` | DNN | Thêm vào workflow actions, designer endpoints |
| 10 | Repository methods không filter portal | DNN | Thêm `PortalId` join/filter ở tất cả query |
| 11 | `RazorWidgetController.List/Source/Render/Export/Preview` no auth | Oqtane | Thêm `[Authorize(Policy = "ViewModule")]` |
| 12 | `MegaFormPopupPhase2Controller` class-level `[Authorize]` only | Oqtane | Thêm `[Authorize(Policy = "EditModule")]` ở class level |

---

## 6. KIỂM TRA NGƯỜI DÙNG THƯỜNG CÓ EDIT/TRUY CẬP ADMIN KHÔNG?

### DNN
- **Edit trên trang**: ❌ Không — cần DNN Module Edit permission (không phải role "Administrators" đơn thuần, mà là permission trên module instance)
- **Admin Dashboard**: ❌ Không — hầu hết API yêu cầu `StaticRoles="Administrators"`, ngoại trừ `ModuleConfigController` (lỗ hổng)
- **Xem form public**: ✅ Có — `SubmitController`, `FieldController` là `[AllowAnonymous]`

### Oqtane
- **Edit trên trang**: ❌ Không — `_isAdmin` được tính bằng `UserSecurity.IsAuthorized(PageState.User, PermissionNames.Edit, ModuleState.PermissionList)`. Ngườii dùng thường không có Edit permission trên module.
- **Admin Dashboard**: ❌ Không — core CRUD yêu cầu `[Authorize(Policy = "EditModule")]`. Ngoại lệ: `CanUseAdminPopup()` endpoints (lỗ hổng)
- **Xem form public**: ✅ Có — `Schema`, `Submit`, `Upload/File` là public

---

## 7. KẾT LUẬN

MegaForm trên cả DNN và Oqtane đều có **kiến trúc phân quyền cơ bản đúng đắn** ở core form builder/submission flow:
- Ngườii dùng thường **không thể** edit form hoặc truy cập admin dashboard
- Public form surface được bảo vệ đúng cách

Tuy nhiên, **cả 2 platform đều có lỗ hổng nghiêm trọng** ở admin/configuration surface:

1. **DNN `ModuleConfigController`** cho phép bất kỷ user authenticated nào đọc database connection strings và ghi đè payment/SMTP settings. Đây là lỗ hổng **information disclosure + unauthorized configuration mutation**.

2. **Oqtane `RazorWidgetController.Action`** cho phép bất kỷ ai (kể cả anonymous) thực thi SQL tùy ý. Đây là lỗ hổng **remote SQL execution**.

3. **Cả 2 platform** đều có path traversal weakness ở file download endpoints.

4. **DNN** thiếu defense-in-depth cross-portal validation, gây rủi ro cho multi-tenant deployments.

**Khuyến nghị:** Triển khai các fix Priority 1 ngay lập tức trước khi đưa lên production hoặc môi trường multi-tenant.
