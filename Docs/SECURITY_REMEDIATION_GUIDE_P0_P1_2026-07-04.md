# Hướng dẫn Sửa chữa Lỗ hổng Bảo mật P0/P1 — MegaForm 1.7.73

> **Dự án:** MegaFormSolution_280_Oqtane_um  
> **Ngày:** 2026-07-04  
> **Căn cứ:** `Docs/MYTHOS_SECURITY_AUDIT_REAUDIT_2026-07-04.md`  
> **Mục tiêu:** Cung cấp hướng dẫn sửa chữa chi tiết, có code mẫu, workflow-safe, để Claude/agent thực hiện.  
> **Nguyên tắc:** Không phá vỡ public form submission flow; chỉ harden admin/state-changing endpoints.

---

## Tổng quan các lỗ hổng

| ID | Mức | Trạng thái | Lỗ hổng | File chính cần sửa | Phạm vi tác động |
|----|-----|-----------|---------|-------------------|------------------|
| P0-1 | Critical | ✅ Fixed (9484368) | RazorWidget.Action unauthenticated DML | `MegaForm.Web/Controllers/RazorWidgetController.cs`, `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`, `MegaForm.DNN/WebApi/RazorWidgetController.cs` | **Cao.** Ảnh hưởng Web + Oqtane + DNN. Fix đã applied: admin-gate `IsAdmin` trên cả 3 platforms. Không cần schema lookup vì caller giờ là trusted admin. |
| P0-2 | Critical | ✅ Fixed partial (9484368) | PaymentController client-controlled amount | `MegaForm.Web/Controllers/PaymentController.cs` | **Cao.** Ảnh hưởng Web host. Fix đã applied: `ResolveServerAmount` ép schema amount cho fixed-mode. **Residual:** fail-open khi thiếu `formId`/`fieldKey`. |
| P0-6 | Critical | ✅ Fixed partial (9484368) | Stored XSS via CustomHtml / {{content:*}} / raw customCss | `MegaForm.Core/Services/FormHtmlRenderer.cs`, `MegaForm.Core/Services/ModuleCssComposer.cs`, `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs` | **Trung bình.** `{{content:*}}` đã HTML-encode. `CustomHtml` vẫn raw by design (admin-gated). |
| P1-1 | High | ⚠️ Partial | Class-level [IgnoreAntiforgeryToken] | 20+ controllers Web + Oqtane | **Rất cao.** Workstream đã bắt đầu: token plumbing + `[ValidateAntiForgeryToken]` trên subset (SaveStyle, SaveModuleStyle, UserTemplate Oqtane, AiKnowledge*). Cần mở rộng. |
| P1-2 | High | ✅ Fixed (9484368) | Web SaveStyle IDOR/CSRF | `MegaForm.Web/Controllers/MegaFormController.cs` | **Trung bình.** Đã `[Authorize(Roles = "Administrator")]`. |
| P1-7 | High | ✅ Fixed (9484368) | {{content:*}} not HTML-encoded | `MegaForm.Core/Services/FormHtmlRenderer.cs` | **Trung bình.** Đã HTML-encode. |
| P1-9 | High | ✅ Fixed (9484368) | DNN Upload/List anonymous + SVG XSS | `MegaForm.DNN/WebApi/MegaFormApiController.cs` | **Thấp–Trung bình.** Đã `[DnnAuthorize]` + `SvgIsSafe()`. |
| P1-10 | High | ⚠️ Partial | UserTemplateController CSRF | `MegaForm.Web/Controllers/UserTemplateController.cs`, `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs` | **Trung bình.** Oqtane write actions đã `[ValidateAntiForgeryToken]`. Web vẫn class-level (kém exploitable do JWT). |
| P1-12 | High | ✅ Fixed (9484368) | AiKnowledge* controllers CSRF | `MegaForm.Oqtane.Server/Controllers/AiKnowledge*.cs` | **Trung bình.** Đã gỡ class-level antiforgery. |
| P1-13 | High | ⚠️ New omission | SaveModuleStyle missing [ValidateAntiForgeryToken] | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2730` | **Thấp.** Dễ fix: thêm `[ValidateAntiForgeryToken]`. |
| P0-14 | Critical | ⚠️ New | SetupController.Complete unauthenticated takeover | `MegaForm.Web/Controllers/SetupController.cs:85` | **Cao.** Setup flow cần hardening. |
| P0-15 | Critical | ⚠️ New | SetupController.TestConnection unauthenticated DB SSRF | `MegaForm.Web/Controllers/SetupController.cs:66` | **Cao.** Cần giới hạn loopback/setup token. |
| P0-16 | Critical | ⚠️ New | SetupController.Reset CSRF → setup re-run | `MegaForm.Web/Controllers/SetupController.cs:157` | **Trung bình.** Chuyển POST + antiforgery. |
| P1-14 | High | ⚠️ New | Setup SQLite path traversal | `MegaForm.Web/Controllers/SetupController.cs:268` | **Thấp.** Validate path trong App_Data. |
| P1-15 | High | ⚠️ New | Premium WorkflowController DB SSRF | `MegaForm.Premium.AspNetCore/Controllers/WorkflowController.cs:96` | **Trung bình.** Chỉ dùng named connections. |
| P1-16 | High | ⚠️ New | Premium WorkflowController IDOR | `MegaForm.Premium.AspNetCore/Controllers/WorkflowController.cs:36` | **Trung bình.** Thêm ownership check. |
| P1-17 | High | ⚠️ New | Umbraco API IDOR | `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:89` | **Trung bình.** Thêm ownership check. |
| P1-18 | High | ⚠️ New | Umbraco SaveForm mass assignment | `MegaForm.Umbraco/Controllers/MegaFormApiController.cs:72` | **Thấp.** Dùng DTO, ghi đè portal/module. |
| P2-13 | Medium | ⚠️ New/residual | `WebStorageService` partial-prefix path containment | `MegaForm.Web/Services/WebStorageService.cs` | **Thấp.** Đồng bộ containment check với directory separator. |
| P2-14 | Medium | ⚠️ New/residual | Web `MegaFormController` IDOR / Mass Assignment | `MegaForm.Web/Controllers/MegaFormController.cs` | **Trung bình.** Thêm ownership check; single-admin host kém exploitable. |
| P2-15 | Medium | ⚠️ New/residual | `postMessage` trusts `document.referrer` | `MegaForm.UI/src/**/platform-host.ts`, `megaform-renderer.ts`, `renderer/index.ts`, embed-preview iframe | **Thấp.** Thay `document.referrer` bằng configured allowed-origins list. |

---

## P0 — Critical

### P0-1: RazorWidgetController.Action — Unauthenticated DML

**Mô tả:** ✅ **ĐÃ FIX trong 9484368.** Endpoint giờ yêu cầu admin (`!IsAdmin` → 403) trên Web + Oqtane + DNN. Schema lookup không cần thiết vì caller là trusted admin. Hướng dẫn bên dưới giữ lại như reference cho future hardening.

**Phạm vi tác động:**
- **Backend:** `MegaForm.Web`, `MegaForm.Oqtane.Server`, `MegaForm.DNN` (proxy), `MegaForm.Core` (schema lookup service).
- **Frontend:** EditableList/MasterDetailList widget JS cần gửi `formId`+`widgetKey`+`actionName` thay vì raw `actionSql`.
- **Database:** Không thay đổi schema; chỉ đọc thêm từ existing form schema JSON.
- **Workflow bị ảnh hưởng:** Public dashboard với EditableList/MasterDetailList (Add/Edit/Delete rows). Nếu client chưa cập nhật, fallback admin-only sẽ 403 → break public actions.
- **Risk:** Cao nếu client/server không đồng bộ.

**Phương án khuyến nghị (không break public dashboard):**

Vì `Action` được dùng bởi EditableList/MasterDetailList trên public-facing dashboards, không thể thêm `[Authorize]` blanket. Thay vào đó, **đọc SQL từ form schema server-side** dựa trên `formId` + `widgetKey` + `actionName`.

**Bước 1: Thêm `formId` và `widgetKey` vào `ActionRequest`**

```csharp
public class ActionRequest
{
    public int? FormId { get; set; }
    public string WidgetKey { get; set; }
    public string ActionName { get; set; }
    public string ActionSql { get; set; } // legacy, kept for compat
    public Dictionary<string, object> Parameters { get; set; }
    public string ConnectionKey { get; set; }
}
```

**Bước 2: Thêm service lookup SQL từ schema**

Tạo hoặc mở rộng `IRazorActionService` / `RazorActionService` trong `MegaForm.Core/Services`:

```csharp
public async Task<RazorActionResult> RunActionBySchemaAsync(
    int formId, string widgetKey, string actionName,
    Dictionary<string, object> parameters, string connectionKey)
{
    // Load saved form schema from repository
    var schema = await _formRepo.GetSchemaAsync(formId);
    if (schema == null) return RazorActionResult.Fail("Form not found");

    // Find the widget and action in schema
    var widget = schema.Fields
        .SelectMany(f => f.Widgets ?? Enumerable.Empty<FormWidget>())
        .FirstOrDefault(w => w.Key == widgetKey);
    if (widget == null) return RazorActionResult.Fail("Widget not found");

    if (!(widget.Actions?.TryGetValue(actionName, out var actionSql) == true))
        return RazorActionResult.Fail("Action not found");

    // Validate the resolved SQL through the existing guard
    if (!RazorActionSqlGuard.IsAllowed(actionSql, out var reason))
        return RazorActionResult.Fail($"Action SQL disallowed: {reason}");

    return await RunAsync(actionSql, parameters, connectionKey ?? "DashboardDatabase");
}
```

**Bước 3: Sửa controller Action endpoint**

```csharp
[HttpPost("Action")]
public async Task<IActionResult> Action([FromBody] ActionRequest req)
{
    if (req == null) return BadRequest(new { error = "body required" });

    var svc = _services.GetService(typeof(IRazorActionService)) as IRazorActionService;
    if (svc == null) return StatusCode(500, new { error = "action service not registered" });

    RazorActionResult result;

    if (req.FormId.HasValue && !string.IsNullOrWhiteSpace(req.WidgetKey) && !string.IsNullOrWhiteSpace(req.ActionName))
    {
        // New secure path: resolve SQL from saved schema
        result = await svc.RunActionBySchemaAsync(req.FormId.Value, req.WidgetKey, req.ActionName,
            UnwrapParameters(req.Parameters), req.ConnectionKey);
    }
    else if (!string.IsNullOrWhiteSpace(req.ActionSql))
    {
        // Legacy fallback: only allowed for authenticated admins
        if (!IsAdmin) return StatusCode(403, new { error = "Administrator access required for legacy actionSql" });
        result = await svc.RunAsync(req.ActionSql, UnwrapParameters(req.Parameters), req.ConnectionKey ?? "DashboardDatabase");
    }
    else
    {
        return BadRequest(new { error = "formId+widgetKey+actionName or actionSql required" });
    }

    if (!result.Success) return StatusCode(400, new { error = result.Error });
    return Ok(new { success = true, affected = result.AffectedRows, data = result.Data });
}
```

**Bước 4: Cập nhật client widget JS** (nếu cần)

Đảm bảo EditableList/MasterDetailList gửi `formId`, `widgetKey`, `actionName` thay vì `actionSql`. Nếu client vẫn gửi `actionSql`, fallback admin-only vẫn hoạt động.

**Verify:**
- Gửi request với `actionSql` mà không auth → 403.
- Gửi request với `formId`+`widgetKey`+`actionName` từ public form → resolved từ schema, không tin client SQL.
- EditableList/MasterDetailList vẫn hoạt động với schema-resolved actions.

---

### P0-2: PaymentController — Client-Controlled Amount Tampering

**Mô tả:** ✅ **ĐÃ FIX trong 9484368** (partial). `ResolveServerAmount` đã re-derive giá từ schema cho fixed-mode. **Residual:** fail-open khi thiếu `formId`/`fieldKey`. Hướng dẫn bên dưới giúp close residual.

**Phạm vi tác động:**
- **Backend:** `MegaForm.Web/Controllers/PaymentController.cs` và có thể cần thêm `PaymentPriceResolver` service.
- **Frontend:** `megaform-widget-payment-unified.ts` / `megaform-widget-stripe.js` / `megaform-widget-paypal.js` cần gửi `formId`+`fieldKey` (+ `userAmount` cho donation).
- **Database:** Không thay đổi schema; sử dụng field settings hiện có (`fixedPrice`, `currency`, `allowUserAmount`, `minAmount`, `maxAmount`). Nếu chưa có, cần bổ sung vào payment field settings.
- **Workflow bị ảnh hưởng:** Tất cả payment forms (fixed price + variable donation). Checkout flow sẽ bị break nếu widget gửi amount/currency cũ.
- **Risk:** Rất cao nếu widget chưa cập nhật; cần deploy backend + frontend cùng lúc.

**Bước 1: Định nghĩa DTO mới cho request**

```csharp
public class PaymentIntentRequest
{
    public int FormId { get; set; }
    public string FieldKey { get; set; }
    public string SubmissionId { get; set; } // optional, for audit
    public double? UserAmount { get; set; } // only used when schema allows variable amount
}
```

**Bước 2: Thêm service resolve giá từ schema**

```csharp
public class PaymentPriceResolver
{
    private readonly IFormRepository _formRepo;

    public async Task<(double amount, string currency, string error)> ResolvePriceAsync(int formId, string fieldKey, double? userAmount)
    {
        var schema = await _formRepo.GetSchemaAsync(formId);
        if (schema == null) return (0, null, "Form not found");

        var field = schema.Fields.FirstOrDefault(f => f.Key == fieldKey);
        if (field == null || !string.Equals(field.Type, "Payment", StringComparison.OrdinalIgnoreCase))
            return (0, null, "Invalid payment field");

        var settings = field.Settings ?? new Dictionary<string, object>();
        var fixedPrice = settings.ContainsKey("fixedPrice") ? Convert.ToDouble(settings["fixedPrice"]) : 0;
        var currency = settings.ContainsKey("currency") ? settings["currency"]?.ToString() : "USD";
        var allowUserAmount = settings.ContainsKey("allowUserAmount") && Convert.ToBoolean(settings["allowUserAmount"]);
        var minAmount = settings.ContainsKey("minAmount") ? Convert.ToDouble(settings["minAmount"]) : 0;
        var maxAmount = settings.ContainsKey("maxAmount") ? Convert.ToDouble(settings["maxAmount"]) : 0;

        if (fixedPrice > 0 && !allowUserAmount)
        {
            // Fixed-price field: ignore client amount entirely
            return (fixedPrice, currency, null);
        }

        if (!allowUserAmount)
            return (0, null, "Payment field does not allow user amount");

        if (!userAmount.HasValue || userAmount.Value <= 0)
            return (0, null, "Amount required");

        if (minAmount > 0 && userAmount.Value < minAmount)
            return (0, null, $"Amount below minimum {minAmount}");

        if (maxAmount > 0 && userAmount.Value > maxAmount)
            return (0, null, $"Amount above maximum {maxAmount}");

        return (userAmount.Value, currency, null);
    }
}
```

**Bước 3: Sửa `StripeCreateIntent`**

```csharp
[HttpPost("stripe/create-intent")]
public async Task<IActionResult> StripeCreateIntent([FromBody] PaymentIntentRequest req)
{
    if (req.FormId <= 0 || string.IsNullOrWhiteSpace(req.FieldKey))
        return BadRequest(new { error = "formId and fieldKey required" });

    var (amount, currency, error) = await _priceResolver.ResolvePriceAsync(req.FormId, req.FieldKey, req.UserAmount);
    if (!string.IsNullOrEmpty(error)) return BadRequest(new { error });

    var amountInt = (int)Math.Round(amount * 100);
    // ... rest of Stripe call using resolved amount/currency
}
```

**Bước 4: Sửa `PayPalCreateOrder`** tương tự.

**Bước 5: Cập nhật client widget payment JS**

Gửi `formId`, `fieldKey`, và `userAmount` (chỉ khi variable amount). Không gửi `currency`.

**Lưu ý workflow:** Public checkout vẫn hoạt động vì endpoint không yêu cầu auth; chỉ amount bị lock theo schema.

**Verify:**
- POST với `amount: 0.01` nhưng schema fixedPrice = 100 → Stripe intent amount = 10000.
- POST variable amount vượt max → 400.

---

### P0-6: Stored XSS via CustomHtml / {{content:*}} / raw customCss

**Mô tả:** ✅ **ĐÃ FIX trong 9484368** (partial). `{{content:*}}` đã HTML-encode. `CustomHtml` vẫn raw by design (admin-gated). Hướng dẫn bên dưới cho defense-in-depth thêm.

**Phạm vi tác động:**
- **Backend:** `MegaForm.Core/Services/FormHtmlRenderer.cs` (SSR), `MegaForm.Core/Services/ModuleCssComposer.cs` (CSS neutralization), `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs` (CSS fallback).
- **Frontend:** Client renderer TS có thể cần cập nhật để match SSR behavior.
- **Database:** Có thể cần thêm cột/property `HtmlAllowedContentTokens` trong form settings nếu chọn per-token allowHtml.
- **Workflow bị ảnh hưởng:** Premium templates dùng HTML trong `{{content:*}}` (icons, formatted text) có thể render sai nếu blanket encode. Cần audit templates trước.
- **Risk:** Trung bình–cao; cần phối hợp với template migration.

**Phương án 1 (khuyến nghị): HTML-encode mặc định + per-token allowHtml**

**Bước 1: Sửa `FormHtmlRenderer.RenderCustomHtml`**

```csharp
// Thêm helper
private static bool IsHtmlAllowedForToken(FormSettings settings, string tokenKey)
{
    // Nếu có cấu hình per-token allowHtml
    var allowed = settings.HtmlAllowedContentTokens;
    if (allowed != null && allowed.Contains(tokenKey, StringComparer.OrdinalIgnoreCase))
        return true;
    return false;
}

// Sửa phần {{content:*}}
var content = settings.CustomContent ?? new Dictionary<string, string>();
html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
{
    var key = m.Groups[1].Value;
    if (!content.TryGetValue(key, out var v)) return string.Empty;
    if (IsHtmlAllowedForToken(settings, key))
        return v ?? string.Empty; // trusted HTML
    return Esc(v ?? string.Empty); // encode by default
});
```

**Bước 2: Đảm bảo CustomHtml cũng được sanitize**

```csharp
var html = settings.CustomHtml ?? string.Empty;
if (!settings.AllowRawCustomHtml)
{
    html = HtmlSanitizer.Sanitize(html); // use a whitelist sanitizer
}
```

Lưu ý: Nếu premium templates cần embed HTML (icons, formatted copy), hãy đánh dấu token đó trong `settings.HtmlAllowedContentTokens`.

**Phương án 2 (nhanh, break ít hơn): Chỉ encode {{content:*}} mặc định**

Nếu `CustomHtml` hiện tại chứa nhiều HTML hợp lệ từ template, chỉ encode `{{content:*}}` trước:

```csharp
html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
{
    var key = m.Groups[1].Value;
    return content.TryGetValue(key, out var v) ? Esc(v ?? string.Empty) : string.Empty;
});
```

**Bước 3: Đóng CSS fallback bypass trong Oqtane RenderPage**

Trong `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`, đảm bảo catch-fallback cũng qua `ModuleCssComposer`:

```csharp
customCss = hasCustomHtml
    ? CustomShellCompatibilityCssService.AppendTo(customCss, "#mf-form-wrapper-" + formId)
    : (customCss ?? string.Empty);

// Always neutralize before emitting
customCss = ModuleCssComposer.NeutralizeStyleBreakout(customCss);
moduleCss = ModuleCssComposer.NeutralizeStyleBreakout(moduleCss ?? string.Empty);
```

Hoặc tốt hơn: thêm `NeutralizeStyleBreakout` vào chính `CustomShellCompatibilityCssService.Build`/`AppendTo` để service tự bảo vệ.

**Verify:**
- Lưu `customContent["header"] = "<img src=x onerror=alert(1)>"` → rendered as `&lt;img...` hoặc sanitized.
- Lưu `customCss = "</style><script>alert(1)</script>"` → emitted as `<\/style>...`.

---

## P1 — High

### P1-1: Class-Level [IgnoreAntiforgeryToken] on Admin Controllers

**Mô tả:** ⚠️ **PARTIAL.** Workstream đã bắt đầu: token plumbing + `[ValidateAntiForgeryToken]` trên subset. Cần mở rộng cho các admin mutators còn lại trên Oqtane.

**Phạm vi tác động:**
- **Backend:** 20+ controllers trên Web + Oqtane (xem danh sách bên dưới).
- **Frontend:** Toàn bộ builder/admin fetch layer cần gửi antiforgery token (`RequestVerificationToken` hoặc Oqtane token).
- **Database:** Không thay đổi.
- **Workflow bị ảnh hưởng:** SaveForm, SaveStyle, ExecuteDdl, UpsertRule, RefreshTemplate, PutSource, AI KB management, template management, etc. **Đây là thay đổi lớn nhất** — mọi admin POST/PUT/DELETE sẽ fail nếu JS chưa gửi token.
- **Risk:** Rất cao; cần test toàn bộ builder/dashboard flow.

**Phương án khuyến nghị (workflow-safe):**

1. **Gỡ class-level `[IgnoreAntiforgeryToken]`** khỏi tất cả admin controllers.
2. **Thêm `[IgnoreAntiforgeryToken]` chỉ trên các action public thực sự** (Submit, Upload/File, public schema read).
3. **Plumb antiforgery token vào JS fetch layer** cho builder/admin calls.

**Bước 1: Danh sách controllers cần sửa**

Web:
- `AiKnowledgeFeedbackController`
- `AiKnowledgeController`
- `AiAssistantController`
- `AiToolsController`
- `AiKnowledgeTemplatesController`
- `AiKnowledgeRulesController`
- `MegaFormLocalAiController`
- `RazorWidgetController`
- `ReportsController`
- `SubformController`
- `UserTemplateController`

Oqtane:
- `UserTemplateController`
- `SubformController`
- `RazorWidgetController`
- `MegaFormPopupPhase2Controller`
- `MegaFormLocalAiController`
- `MegaFormController`
- `AiToolsController`
- `AiKnowledgeTemplatesController`
- `AiKnowledgeRulesController`
- `AiKnowledgeFeedbackController`
- `AiKnowledgeController`
- `AiAssistantController`

**Bước 2: Pattern sửa**

```csharp
// BEFORE
[Route("api/MegaFormPopup/[controller]")]
[IgnoreAntiforgeryToken]
public class RazorWidgetController : ControllerBase { ... }

// AFTER
[Route("api/MegaFormPopup/[controller]")]
public class RazorWidgetController : ControllerBase { ... }
```

Sau đó thêm `[IgnoreAntiforgeryToken]` chỉ cho action public:

```csharp
[HttpPost("Action")]
[IgnoreAntiforgeryToken] // public form actions only
public async Task<IActionResult> Action(...) { ... }
```

**Bước 3: JS fetch layer**

Thêm antiforgery token vào admin fetch calls. Ví dụ trong `MegaForm.UI/src/shared/platform-host.ts` hoặc một fetch wrapper:

```typescript
async function adminFetch(url: string, init: RequestInit = {}) {
  const token = document.querySelector('input[name="__RequestVerificationToken"]')?.getAttribute('value')
    ?? (window as any).__megaFormAntiforgeryToken;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
    'Content-Type': 'application/json',
  };
  if (token) headers['RequestVerificationToken'] = token;
  return fetch(url, { ...init, headers, credentials: 'include' });
}
```

**Lưu ý:** Đây là thay đổi lớn nhất về workflow. Cần test toàn bộ builder flow (SaveForm, SaveStyle, ExecuteDdl, UpsertRule, RefreshTemplate, PutSource, etc.).

---

### P1-2: Web SaveStyle — IDOR/CSRF

**Mô tả:** ✅ **ĐÃ FIX trong 9484368.** Giờ `[Authorize(Roles = "Administrator")]`.

**Phạm vi tác động:**
- **Backend:** `MegaForm.Web/Controllers/MegaFormController.cs`.
- **Frontend:** Web builder settings popup (theme/CSS tab).
- **Database:** Không thay đổi.
- **Workflow bị ảnh hưởng:** Chỉ Web host. Non-admin authenticated users sẽ bị lock out khỏi style editing (đúng behavior). Nếu có legitimate non-admin use case cần xem xét.
- **Risk:** Thấp–trung bình.

**Bước 1: Sửa action endpoint**

```csharp
[HttpPost("SaveStyle")]
[Authorize(Roles = "Administrator,Host")] // hoặc policy EditModule nếu có
public IActionResult SaveStyle([FromBody] JsonElement bodyElement)
{
    // Parse moduleId from body
    if (!bodyElement.TryGetProperty("moduleId", out var moduleIdProp) || !moduleIdProp.TryGetInt32(out var moduleId))
        return BadRequest(new { error = "moduleId required" });

    // Validate current user can edit this module
    if (!User.IsInRole("Administrator") && !User.IsInRole("Host"))
        return Forbid();

    // Optional: ownership check if application has module-level permissions
    // if (!_modulePermissions.CanEdit(User, moduleId)) return Forbid();

    ... // existing logic
}
```

**Bước 2: Kết hợp với P1-1**

Sau khi gỡ class-level `[IgnoreAntiforgeryToken]`, thêm `[ValidateAntiForgeryToken]` cho action này.

---

### P1-7: {{content:*}} not HTML-encoded

**Mô tả:** ✅ **ĐÃ FIX trong 9484368.** Giờ HTML-encode.

**Phạm vi tác động:**
- **Backend:** `MegaForm.Core/Services/FormHtmlRenderer.cs`.
- **Frontend:** SSR output trên Oqtane + DNN. Client renderer có thể cần match.
- **Database:** Có thể cần `HtmlAllowedContentTokens` nếu dùng per-token allowHtml.
- **Workflow bị ảnh hưởng:** Tương tự P0-6 — premium templates dùng HTML content tokens.
- **Risk:** Trung bình; nên merge cùng P0-6.

**Hướng dẫn:** Xem P0-6 Phương án 2 (encode mặc định). Nếu cần preserve HTML cho một số token, dùng Phương án 1 với `HtmlAllowedContentTokens`.

---

### P1-9: DNN Upload/List Anonymous + SVG XSS

**Mô tả:** ✅ **ĐÃ FIX trong 9484368.** `UploadController` class `[DnnAuthorize]`; `List()` không còn `[AllowAnonymous]`; SVG sanitized.

**Phạm vi tác động:**
- **Backend:** `MegaForm.DNN/WebApi/MegaFormApiController.cs`.
- **Frontend:** DNN image picker/gallery UI. Nếu có public gallery feature sẽ cần auth.
- **Database:** Không thay đổi.
- **Workflow bị ảnh hưởng:** Chỉ DNN. Anonymous listing bị chặn. SVG upload sẽ bị strip script/event handlers.
- **Risk:** Thấp–trung bình.

**Bước 1: Yêu cầu auth cho List**

```csharp
[DnnAuthorize]
[ValidateAntiForgeryToken]
[HttpGet]
public HttpResponseMessage List(int portalId)
{
    ...
}
```

**Bước 2: Sanitize SVG**

Thêm SVG sanitizer hoặc serve SVG với `Content-Disposition: attachment`:

```csharp
private static string SanitizeSvg(string svg)
{
    // Strip <script> and event handlers
    svg = Regex.Replace(svg, @"<script[^>]*>[\s\S]*?</script>", string.Empty, RegexOptions.IgnoreCase);
    svg = Regex.Replace(svg, @"\s+on\w+\s*=\s*[""'][^""']*[""']", string.Empty, RegexOptions.IgnoreCase);
    return svg;
}
```

Trong `ValidateImageContent` hoặc nơi lưu SVG, gọi `SanitizeSvg` trước khi write file.

---

### P1-10: UserTemplateController CSRF

**Mô tả:** ⚠️ **PARTIAL.** Oqtane write actions đã `[ValidateAntiForgeryToken]`. Web vẫn class-level (kém exploitable do JWT).

**Phạm vi tác động:**
- **Backend:** `MegaForm.Web/Controllers/UserTemplateController.cs`, `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs`.
- **Frontend:** Template editor (source code editor) trên builder.
- **Database:** Không thay đổi.
- **Workflow bị ảnh hưởng:** Template save/refresh sẽ yêu cầu antiforgery token (phụ thuộc P1-1).
- **Risk:** Trung bình.

**Bước 1: Gỡ class-level `[IgnoreAntiforgeryToken]`**

**Bước 2: Thêm `[ValidateAntiForgeryToken]` cho write actions**

```csharp
[HttpPost("PutSource")]
[ValidateAntiForgeryToken]
public async Task<IActionResult> PutSource([FromBody] PutSourceRequest req)
{
    if (!IsHostOrAdmin()) return Forbid();
    if (!HasDevLock()) return Forbid();
    // Validate file path whitelist
    if (!_templateWhitelist.IsAllowed(req.RelativePath))
        return BadRequest(new { error = "Invalid template path" });
    ...
}
```

**Bước 3: Validate file path whitelist**

```csharp
private static readonly HashSet<string> AllowedExtensions =
    new(StringComparer.OrdinalIgnoreCase) { ".cshtml", ".html", ".js", ".css", ".widget.xml" };

private bool IsAllowedTemplatePath(string relativePath)
{
    if (string.IsNullOrWhiteSpace(relativePath)) return false;
    if (relativePath.Contains("..")) return false;
    if (relativePath.Contains(':') || relativePath.Contains('~')) return false;
    var ext = Path.GetExtension(relativePath);
    return AllowedExtensions.Contains(ext);
}
```

---

### P1-12: AiKnowledge* Controllers CSRF

**Mô tả:** ✅ **ĐÃ FIX trong 9484368.** Class-level `[IgnoreAntiforgeryToken]` đã gỡ khỏi 4 controllers.

**Phạm vi tác động:**
- **Backend:** `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs`, `AiKnowledgeRulesController.cs`, `AiKnowledgeTemplatesController.cs`, `AiKnowledgeFeedbackController.cs`.
- **Frontend:** AI Knowledge Base admin UI.
- **Database:** Không thay đổi.
- **Workflow bị ảnh hưởng:** KB upsert/delete/seed/promote/review sẽ yêu cầu antiforgery token (phụ thuộc P1-1).
- **Risk:** Trung bình.

**Bước 1: Gỡ class-level `[IgnoreAntiforgeryToken]`**

**Bước 2: Thêm `[ValidateAntiForgeryToken]` cho write actions**

```csharp
[HttpPost]
[ValidateAntiForgeryToken]
public IActionResult Upsert([FromBody] KnowledgeItem item)
{
    if (!IsAdmin) return Forbid();
    ...
}
```

**Bước 3: Đảm bảo JS gửi antiforgery token** (như P1-1).

---

### P1-13 (new omission): Oqtane `SaveModuleStyle` — Thiếu `[ValidateAntiForgeryToken]`

**Mô tả:** `SaveModuleStyle` trong Oqtane `MegaFormController` chỉ có `[Authorize]` + `CanUseAdminPopup()` mà thiếu `[ValidateAntiForgeryToken]`. Do controller vẫn class-level `[IgnoreAntiforgeryToken]`, action này dễ bị CSRF.

**Phạm vi tác động:**
- **Backend:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2730`.
- **Frontend:** Module style editor.
- **Database:** Không thay đổi.
- **Risk:** Thấp (dễ fix).

**Fix:**

```csharp
[HttpPost("ModuleConfig/SaveModuleStyle")]
[Authorize]
[ValidateAntiForgeryToken] // [SecFix 2026-07-04 P1-13] close CSRF omission
public IActionResult SaveModuleStyle([FromBody] JsonElement bodyElement)
{
    ...
}
```

**Verify:**
- POST SaveModuleStyle without antiforgery token → 400.
- POST SaveModuleStyle with token + admin auth → 200.

---

### P0-14 (new): `SetupController.Complete` — Unauthenticated Setup Takeover

**Mô tả:** `POST /setup/complete` không yêu cầu auth/anti-forgery, cho phép attacker tạo admin và ghi đè production config trong fresh install (hoặc sau khi lock bị xóa).

**Phạm vi tác động:**
- **Backend:** `MegaForm.Web/Controllers/SetupController.cs`.
- **Frontend:** Setup wizard.
- **Risk:** Cao.

**Fix:**

```csharp
// Option A: require a one-time setup token generated at app startup
[HttpPost("complete")]
[ValidateAntiForgeryToken]
public IActionResult Complete([FromBody] SetupRequest req, [FromHeader(Name = "X-Setup-Token")] string setupToken)
{
    if (IsSetupComplete(_env))
        return BadRequest(new { error = "Already setup." });
    if (!ValidateSetupToken(setupToken))
        return Unauthorized(new { error = "Invalid setup token." });
    ...
}

// Option B: restrict to loopback during setup
if (!HttpContext.Connection.RemoteIpAddress?.IsLoopback() ?? false)
    return Unauthorized(new { error = "Setup must be completed locally." });
```

**Khuyến nghị:** Kết hợp cả hai: setup token + loopback restriction. Không cho phép ghi đè config sau khi setup xong.

---

### P0-15 (new): `SetupController.TestConnection` — Unauthenticated DB SSRF

**Mô tả:** `POST /setup/test-connection` mở kết nối DB từ client-controlled parameters.

**Fix:**

```csharp
[HttpPost("test-connection")]
[ValidateAntiForgeryToken] // if called from authenticated setup flow
public IActionResult TestConnection([FromBody] TestConnectionRequest req)
{
    var connStr = BuildConnectionString(req);
    // SSRF guard: reject private/loopback/metadata hosts
    if (!ConnectionStringTargetsPublicHost(connStr))
        return BadRequest(new { error = "Connection to internal hosts is not allowed." });
    ...
}
```

Hoặc giới hạn loopback/setup token như P0-14.

---

### P0-16 (new): `SetupController.Reset` — CSRF → Setup Re-run

**Mô tả:** `GET /setup/reset` xóa lock/config và chỉ yêu cầu `[Authorize]`.

**Fix:**

```csharp
[HttpPost("reset")]
[Authorize(Roles = "Administrator")]
[ValidateAntiForgeryToken]
public IActionResult Reset()
{
    // same destructive logic, but now POST + antiforgery
    ...
}
```

Hoặc xóa endpoint này trong production; chỉ cho phép reset qua CLI.

---

### P1-14 (new): Setup SQLite Path Traversal

**Mô tả:** `BuildSqliteConnectionString` cho phép `../` trong `SqliteFile`.

**Fix:**

```csharp
private static string BuildSqliteConnectionString(DatabaseSetup db)
{
    var raw = string.IsNullOrWhiteSpace(db?.SqliteFile)
        ? "App_Data/MegaForm/megaform.db"
        : db.SqliteFile.Trim().Replace('\\', '/');

    // Reject traversal and absolute paths
    if (raw.Contains("..") || Path.IsPathRooted(raw) || raw.IndexOfAny(Path.GetInvalidPathChars()) >= 0)
        throw new ArgumentException("Invalid SQLite file path.");

    var appData = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm"));
    var fullPath = Path.GetFullPath(Path.Combine(appData, raw));
    if (!fullPath.StartsWith(appData.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase))
        throw new ArgumentException("SQLite file must be inside App_Data/MegaForm.");

    return $"Data Source={fullPath}";
}
```

---

### P1-15 (new): Premium `WorkflowController` — DB SSRF

**Mô tả:** Workflow DB endpoints chấp nhận raw connection string từ client.

**Fix:**

```csharp
[HttpPost("Database/TestConnection")]
[Authorize(Roles = "Administrator")]
public IActionResult DatabaseTestConnection([FromBody] DatabaseConnectionTestRequest req)
{
    // Only allow named connections from admin-configured registry
    if (string.IsNullOrWhiteSpace(req.ConnectionName))
        return BadRequest(new { error = "ConnectionName is required." });

    var conn = _connectionRegistry.Get(req.ConnectionName);
    if (conn == null) return NotFound(new { error = "Connection not found." });

    var result = _dbMetadata.TestConnection(req.ConnectionName, null, null);
    return Ok(result);
}
```

Nếu cần support external connection string, validate host bằng `SsrfGuard` và yêu cầu admin role.

---

### P1-16 (new): Premium `WorkflowController` — IDOR

**Mô tả:** Workflow actions không verify ownership.

**Fix:**

```csharp
private bool OwnsForm(int formId)
{
    var form = _formRepo.GetForm(formId);
    if (form == null) return false;
    return form.PortalId == _platform.PortalId || User.IsInRole("Administrator");
}

[HttpPost("Apply")]
public IActionResult Apply([FromBody] WorkflowSaveRequest req)
{
    if (!OwnsForm(req.FormId)) return Forbid();
    ...
}
```

Áp dụng tương tự cho `SaveDraft`, `TestRun`, `CancelExecution`, `Navigate`, `ListExecutions`.

---

### P1-17 (new): Umbraco `MegaFormApiController` — IDOR

**Mô tả:** `DeleteForm`, `GetSubmission`, `UpdateSubmissionStatus` không kiểm tra ownership.

**Fix:**

```csharp
[HttpDelete]
[Authorize]
public IActionResult DeleteForm(int formId)
{
    var form = _formRepo.GetForm(formId);
    if (form == null) return NotFound();
    if (form.PortalId != _platform.PortalId && !_platform.IsSuperUser)
        return Forbid();
    _formRepo.DeleteForm(formId);
    return Ok(new { success = true });
}

[HttpPost]
[Authorize]
public IActionResult UpdateSubmissionStatus(int submissionId, string status)
{
    var sub = _subRepo.Get(submissionId);
    if (sub == null) return NotFound();
    var form = _formRepo.GetForm(sub.FormId);
    if (form?.PortalId != _platform.PortalId && !_platform.IsSuperUser)
        return Forbid();
    _subRepo.UpdateStatus(submissionId, status);
    return Ok(new { success = true });
}
```

---

### P1-18 (new): Umbraco `SaveForm` — Mass Assignment

**Mô tả:** Bind full `FormInfo` cho phép client override `PortalId`/`ModuleId`/`CreatedByUserId`.

**Fix:**

```csharp
[HttpPost]
[Authorize]
public IActionResult SaveForm([FromBody] FormInfo form)
{
    if (form == null) return BadRequest(...);

    // Always override ownership fields from platform context
    form.PortalId = _platform.PortalId;
    form.ModuleId = _platform.ModuleId;
    form.CreatedByUserId = form.FormId <= 0 ? _platform.UserId : form.CreatedByUserId;
    form.UpdatedByUserId = _platform.UserId;
    form.UpdatedOnUtc = DateTime.UtcNow;

    // Optional: verify existing form ownership before update
    if (form.FormId > 0)
    {
        var existing = _formRepo.GetForm(form.FormId);
        if (existing == null) return NotFound();
        if (existing.PortalId != _platform.PortalId && !_platform.IsSuperUser)
            return Forbid();
    }

    int formId = _formRepo.SaveForm(form);
    return Ok(new { formId, ... });
}
```

---

### P2-13 (new): `WebStorageService` Partial-Prefix Path Containment

**Mô tả:** `ResolvePath` dùng `StartsWith(root)` mà không append directory separator.

**Fix:**

```csharp
private string ResolvePath(string filePath)
{
    if (string.IsNullOrWhiteSpace(filePath)) return null;
    var rel = filePath.Replace('\\', '/').TrimStart('/');
    if (rel.Contains("..")) return null;
    var full = Path.GetFullPath(Path.Combine(_privateRoot, rel));
    var root = Path.GetFullPath(_privateRoot);
    var rootWithSep = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                      + Path.DirectorySeparatorChar;
    if (!full.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase)) return null;
    return full;
}
```

**Verify:**
- Request file outside `_privateRoot` → 404.
- Request file inside `_privateRoot` → served.

---

### P2-14 (new/residual): Web `MegaFormController` IDOR / Mass Assignment

**Mô tả:** Nhiều state-changing action chỉ `[Authorize]` và không verify ownership. Trong single-admin host kém exploitable nhưng cần harden để hỗ trợ multi-user/JWT.

**Fix pattern cho submissions:**

```csharp
private bool OwnsSubmission(int submissionId)
{
    var sub = _subRepo.Get(submissionId);
    if (sub == null) return false;
    var form = _formRepo.GetForm(sub.FormId);
    return form != null && form.PortalId == _ctx.PortalId;
}

[HttpPost("Submissions/UpdateData")]
[Authorize(Roles = "Administrator")]
public IActionResult UpdateSubmissionData(int submissionId, [FromBody] JObject body)
{
    if (!OwnsSubmission(submissionId)) return Forbid();
    ...
}
```

**Fix pattern cho SaveForm (mass assignment):**

```csharp
[HttpPost("Form/Save")]
[Authorize(Roles = "Administrator")]
public IActionResult SaveForm([FromBody] FormInfo form)
{
    if (form == null) return BadRequest(...);
    form.PortalId = _ctx.PortalId; // always override
    form.ModuleId = form.ModuleId <= 0 ? _ctx.ModuleId : form.ModuleId;
    form.CreatedByUserId = _ctx.UserId;
    form.UpdatedByUserId = _ctx.UserId;
    ...
}
```

**Verify:**
- Authenticated non-admin (nếu có) không thể sửa form/submission khác.
- SaveForm với `PortalId` khác trong body bị ghi đè bởi context.

---

### P2-15 (new/residual): `postMessage` Target Origin Still Trusts `document.referrer`

**Mô tả:** Nhiều đoạn code UI (platform-host.ts, megaform-renderer.ts, renderer/index.ts, theme-preview iframe) dùng `event.origin === new URL(document.referrer).origin` để xác thực nguồn gốc postMessage. `document.referrer` có thể bị attacker-controlled qua history manipulation / open-redirect / Referrer-Policy bypass, dẫn đến leak form schema, cross-origin resize manipulation, hoặc preview XSS.

**Fix pattern:**

1. **Không dùng `document.referrer` làm origin tin cậy.** Thay vào đó dùng một `allowedOrigins` list được cấu hình server-side (ví dụ từ `appsettings.json` hoặc portal CORS settings).

2. **Ví dụ helper:**

```typescript
// shared/postmessage-guard.ts
export function isTrustedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return false;
    return allowedOrigins.some(a => a.toLowerCase() === origin.toLowerCase());
  } catch {
    return false;
  }
}
```

3. **Sử dụng trong listener:**

```typescript
window.addEventListener('message', (event: MessageEvent) => {
  if (!isTrustedOrigin(event.origin, config.allowedOrigins)) return;
  // process event
});
```

4. **Đối với theme preview / embed preview:** luôn render trong sandboxed iframe với `sandbox="allow-scripts"` và explicit `allow-origin` nếu cần; không truyền schema nhạy cảm qua postMessage nếu origin không xác định.

**Verify:**
- Không còn `document.referrer` nào được dùng để so sánh `event.origin`.
- Các listener postMessage đều kiểm tra origin against danh sách cấu hình.
- Embed/preview vẫn hoạt động với allowed origins hợp lệ.

---

## Tổng hợp phạm vi tác động theo mức độ

### 🔴 Phạm vi tác động Cao / Rất cao

| ID | Lỗ hổng | Lý do cao | Cần phối hợp |
|----|---------|-----------|--------------|
| P0-2 | Payment amount tampering (residual) | Cần bắt buộc widget gửi `formId`+`fieldKey`; ảnh hưởng checkout flow | Backend dev + Frontend payment widget dev + QA payments |
| P0-14/P0-15/P0-16 | SetupController takeover/SSRF/CSRF | Ảnh hưởng toàn bộ Web host setup flow; có thể dẫn đến admin takeover | Backend dev + DevOps |
| P1-1 | Class-level [IgnoreAntiforgeryToken] | Cross-cutting; cần mở rộng `[ValidateAntiForgeryToken]` cho nhiều admin mutators còn lại | Backend dev + Frontend builder dev + Full QA builder/dashboard |
| P1-15/P1-16 | Premium Workflow DB SSRF + IDOR | Ảnh hưởng Premium host; cần thay đổi API contract nếu bỏ raw connection string | Backend Premium dev + QA workflow |

### 🟡 Phạm vi tác động Trung bình

| ID | Lỗ hổng | Lý do trung bình | Cần phối hợp |
|----|---------|------------------|--------------|
| P0-6 | Stored XSS CustomHtml residual | `CustomHtml` vẫn raw by design; cân nhắc whitelist sanitizer | Backend renderer dev + Template/UX team |
| P1-10 | UserTemplateController Web CSRF | Web vẫn class-level (kém exploitable do JWT); cần quyết định accept risk hay fix | Backend dev |
| P2-13 | WebStorageService partial-prefix | Defense-in-depth; đồng bộ containment check | Backend dev |
| P2-14 | Web controller IDOR/mass assignment | Cần ownership checks nếu host multi-user; hiện tại single-admin nên kém exploitable | Backend dev |

### 🟢 Phạm vi tác động Thấp

| ID | Lỗ hổng | Lý do | Cần phối hợp |
|----|---------|-------|--------------|
| P1-13 | SaveModuleStyle missing AF | Chỉ thêm 1 attribute | Backend dev + QA module style editor |
| P1-14 | Setup SQLite path traversal | Validate path | Backend dev + QA setup wizard |
| P1-17/P1-18 | Umbraco IDOR/mass assignment | Thêm ownership check/DTO | Backend Umbraco dev + QA |

### Khuyến nghị triển khai theo nhóm (remaining work)

1. **Nhóm 0 (làm NGAY, block release):** P0-14, P0-15, P0-16 (SetupController hardening)
2. **Nhóm 1 (dễ, làm ngay):** P1-13 (SaveModuleStyle), P1-14 (SQLite path traversal)
3. **Nhóm 2 (cần frontend phối hợp):** P0-2 residual (bắt buộc formId/fieldKey)
4. **Nhóm 3 (cross-cutting, cần test kỹ):** P1-1 mở rộng antiforgery cho admin mutators còn lại; P1-15–P1-18 (Premium/Umbraco IDOR/mass assignment); P2-14 Web ownership checks
5. **Nhóm 4 (defense-in-depth):** P0-6 (sanitize CustomHtml) + P1-10 Web (optional) + P2-13 (storage containment) + P2-15 (postMessage allowed-origins)

---

## Checklist trước khi merge

- [ ] Build clean cho tất cả targets (Core net472, AspNetCore.Component net9, Web net9, Oqtane.Server net9+net10, DNN net472)
- [ ] Public form submission vẫn hoạt động (Submit, Upload/File, Render)
- [ ] Builder flow vẫn hoạt động (SaveForm, SaveStyle, SaveModuleStyle, ExecuteDdl, UpsertRule, PutSource, etc.)
- [ ] Payment widget với fixed price hoạt động đúng (server-side enforced)
- [ ] Payment widget với variable amount (donation) hoạt động đúng
- [ ] EditableList/MasterDetailList admin actions vẫn hoạt động (P0-1 admin gate)
- [ ] `[ValidateAntiForgeryToken]` đã thêm cho SaveModuleStyle (P1-13)
- [ ] SetupController hardened: Complete/TestConnection require setup token/loopback, Reset is POST + antiforgery (P0-14/P0-15/P0-16)
- [ ] SQLite path traversal fixed in BuildSqliteConnectionString (P1-14)
- [ ] Premium WorkflowController only uses named DB connections (P1-15)
- [ ] Premium/Umbraco ownership checks added (P1-16/P1-17/P1-18)
- [ ] WebStorageService uses root-prefix-with-separator containment (P2-13)
- [ ] Web controller ownership checks added where applicable (P2-14)
- [ ] postMessage listeners no longer trust `document.referrer`; use configured allowed-origins list (P2-15)
- [ ] `{{content:*}}` được HTML-encode
- [ ] SVG được sanitize
- [ ] DNN Upload/List yêu cầu auth
- [ ] Không còn `ex.Message` / `ex.StackTrace` trả về client cho admin/public endpoints
- [ ] Đã đánh giá và ghi nhận phạm vi tác động của từng fix trong commit message / PR description

---

## Ghi chú cho Claude/agent thực hiện

1. **Làm từng bước một**, ưu tiên P0 trước P1.
2. **Trước khi code mỗi fix, đọc kỹ phần "Phạm vi tác động"** để xác định file + frontend + database + workflow bị ảnh hưởng.
3. **Mỗi bước phải compile** trước khi sang bước tiếp theo.
4. **Không thay đổi public API contract** nếu chưa cập nhật client JS tương ứng.
5. **Giữ backward compat** bằng fallback admin-only cho các legacy path (ví dụ: P0-1 legacy `actionSql`).
6. **Chạy QA scripts** hiện có (`qa5000/`) để đảm bảo không regression.
7. **Sau mỗi fix, cập nhật `Docs/MYTHOS_SECURITY_AUDIT_REAUDIT_2026-07-04.md`** để đánh dấu finding đã đóng.

---

*End of Remediation Guide*
