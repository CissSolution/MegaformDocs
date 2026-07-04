# MegaForm — Quy tắc Secure-Coding (canonical, bắt buộc cho người & AI)

> **Mục đích:** Ngăn các lớp lỗ hổng đã lặp đi lặp lại trong các đợt audit (2026-06 → 2026-07) **tái diễn**.
> **Phạm vi:** Mọi controller/endpoint/service/renderer trong `MegaForm.Web`, `MegaForm.Oqtane.Server`, `MegaForm.DNN`, `MegaForm.Umbraco`, `MegaForm.AspNetCore.Component`, `MegaForm.Core`.
> **Nguyên tắc nền:** *Không phá vỡ public form submission flow; harden mọi admin/state-changing endpoint.* An toàn mặc định (secure-by-default), fail-closed.
> **Đọc kèm:** `Docs/MYTHOS_SECURITY_AUDIT_REAUDIT_2026-07-04.md`, `Docs/SECURITY_REMEDIATION_GUIDE_P0_P1_2026-07-04.md`.

---

## 0. 12 Quy tắc Vàng (không thương lượng)

1. **KHÔNG tin dữ liệu client cho quyết định bảo mật/tài chính.** Số tiền, giá, SQL, đường dẫn file, `moduleId`, role → **tính/tra cứu server-side từ schema/DB**, không lấy từ request body.
2. **KHÔNG bao giờ nhận SQL thô từ client rồi thực thi.** Tra cứu SQL từ form schema server-side theo `formId`+`widgetKey`+`actionName`. Nếu bắt buộc legacy, gate `[Authorize]` admin + đi qua `RazorActionSqlGuard`.
3. **Mọi endpoint state-changing (POST/PUT/DELETE) phải có auth rõ ràng.** Mặc định là gated; chỉ `[AllowAnonymous]` cho public thực sự (`Submit`, `Upload/File`, `Render`, public schema read) và phải ghi chú lý do.
4. **KHÔNG đặt `[IgnoreAntiforgeryToken]` ở CLASS level trên controller admin.** Chỉ đặt ở ACTION level cho đúng action public. Admin mutators phải validate antiforgery.
5. **KHÔNG chèn dữ liệu người dùng/lưu trữ vào HTML mà không encode.** `{{content:*}}`, `CustomHtml`, tiêu đề, nhãn → HTML-encode mặc định; chỉ cho phép HTML qua whitelist/allowHtml có chủ đích.
6. **Mọi đường phát CSS phải đi qua `ModuleCssComposer.NeutralizeStyleBreakout`.** Không emit `customCss`/`moduleCss` thô (chống `</style><script>` breakout).
7. **`[Authorize]` trơn (any user) là CHƯA ĐỦ cho admin action.** Phải kiểm role (Admin/Host) **và** ownership của resource (`moduleId`/`formId`) — chống IDOR.
8. **Mọi file path từ client phải validate whitelist + chống traversal.** `Path.GetFullPath` + kiểm tra prefix root có separator; chặn `..`, `:`, `~`; whitelist extension.
9. **KHÔNG trả `ex.Message`/`ex.StackTrace`/`ex.ToString()` cho client.** Log chi tiết server-side; trả message generic + error ID.
10. **KHÔNG hardcode secret/password; KHÔNG fallback secret về config trong non-Development.** Dùng env/user-secrets; fail-closed nếu thiếu.
11. **Mọi outbound URL do người dùng cấu hình (webhook/app-endpoint) phải qua `SsrfGuard`.** Chặn private/loopback/metadata IP.
12. **File upload nguy hiểm (SVG, HTML) phải sanitize hoặc serve `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.**

---

## 1. Authentication & Authorization

### DON'T
```csharp
[HttpPost("SaveStyle")]
[Authorize]                          // ❌ any authenticated user → IDOR
public IActionResult SaveStyle([FromBody] JsonElement body) {
    var moduleId = body.GetProperty("moduleId").GetInt32();  // ❌ tin moduleId từ client
    ...
}
```

### DO
```csharp
[HttpPost("SaveStyle")]
[Authorize(Roles = "Administrator,Host")]   // ✅ role check
[ValidateAntiForgeryToken]                  // ✅ CSRF (khi đã bỏ class-level ignore)
public IActionResult SaveStyle([FromBody] JsonElement body) {
    if (!User.IsInRole("Administrator") && !User.IsInRole("Host")) return Forbid();
    // ✅ ownership: caller có quyền edit CHÍNH moduleId này không?
    if (!CanEditModule(User, moduleId)) return Forbid();
    ...
}
```

- Oqtane: dùng pattern `CanUseAdminPopup()` = `User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host)` (đã áp dụng 1.7.73). Web host phải có tương đương.
- **Checklist auth cho mỗi action:** ai được gọi? → role? → resource ownership? → antiforgery? → nếu public thì tại sao an toàn?

---

## 2. CSRF / Antiforgery

- **Cấm** `[IgnoreAntiforgeryToken]` ở class level trên controller có action ghi. Đã gây P1-1/P1-10/P1-12.
- Đặt `[IgnoreAntiforgeryToken]` **chỉ** trên action public (`Submit`, `Upload/File`, public `Action` cho EditableList).
- Admin mutators: `[ValidateAntiForgeryToken]` hoặc `[AutoValidateAntiforgeryToken]` trên controller/action.
- **Bắt buộc song hành:** khi siết antiforgery, JS fetch layer builder/admin **phải** gửi token (`RequestVerificationToken` header). Không siết backend mà quên client → vỡ toàn bộ builder. Test toàn bộ SaveForm/SaveStyle/ExecuteDdl/UpsertRule/PutSource.

---

## 3. SQL / DML từ client (đã gây P0-1)

- **KHÔNG** `RunAsync(clientSql)` từ endpoint không auth. Đây là lỗ hổng nghiêm trọng nhất.
- Đường an toàn: client gửi `formId`+`widgetKey`+`actionName` → server load schema → lấy SQL đã lưu → validate qua `RazorActionSqlGuard.IsAllowed` → chạy.
- Guard hiện có (`RazorActionSqlGuard`, `FieldOptionsService`, `FormDatabaseInsertService`, `LifecycleRunner`): là **defense-in-depth**, KHÔNG thay thế auth. Regex guard có thể bị bypass.
- Cân nhắc read-only DB account cho các endpoint truy vấn ẩn danh (`AppEndpoint`).
- Với endpoint SELECT-only ẩn danh: dùng tokenizer/parser SELECT-only, không chỉ keyword regex; yêu cầu signed token/API key.

---

## 4. XSS / Rendering (đã gây P0-6, P1-7, P2-12)

### `{{content:*}}` tokens & CustomHtml — encode mặc định
```csharp
// ❌ chèn raw
return content.TryGetValue(key, out var v) ? (v ?? "") : "";

// ✅ encode mặc định, allowHtml có chủ đích
if (IsHtmlAllowedForToken(settings, key)) return v ?? "";   // token được whitelist
return Esc(v ?? "");                                         // dùng helper encode SẴN CÓ của renderer
```
- Dùng đúng helper encode đã tồn tại trong `FormHtmlRenderer` (đừng tự viết `WebUtility.HtmlEncode` rời rạc — kiểm tra tên helper thật, ví dụ `Esc`).
- Trước khi blanket-encode: **audit premium templates** xem token nào cần HTML thật (icon/formatted) → đưa vào `HtmlAllowedContentTokens`. Đừng phá template.

### CSS — luôn neutralize
```csharp
customCss  = ModuleCssComposer.NeutralizeStyleBreakout(customCss  ?? "");
moduleCss  = ModuleCssComposer.NeutralizeStyleBreakout(moduleCss ?? "");
// Kể cả nhánh catch-fallback trong RenderPage.cs và trong CustomShellCompatibilityCssService.
```
- `CustomShellCompatibilityCssService` nên **tự** neutralize + escape `scopeSelector`, không tin caller (P2-11).

---

## 5. Payment / giá trị tài chính (đã gây P0-2)

- **KHÔNG** đọc `amount`/`currency` từ request body để tạo Stripe intent / PayPal order.
- Client gửi `formId`+`fieldKey` (+`userAmount` chỉ khi schema cho phép). Server resolve giá từ payment field settings (`fixedPrice`, `currency`, `allowUserAmount`, `minAmount`, `maxAmount`) và **ép** giá đó.
- Validate min/max cho variable amount. PCI DSS 3.4/6.5.1.

---

## 6. File I/O (đã gây P1-8, P1-10)

```csharp
private bool IsAllowedTemplatePath(string rel) {
    if (string.IsNullOrWhiteSpace(rel)) return false;
    if (rel.Contains("..") || rel.Contains(':') || rel.Contains('~')) return false;
    var full = Path.GetFullPath(Path.Combine(root, rel));
    if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal)) return false;
    return AllowedExtensions.Contains(Path.GetExtension(rel));  // whitelist đuôi
}
```
- Upload SVG/HTML: strip `<script>` + `on*=` handlers, hoặc serve `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
- `Upload/List` không được `[AllowAnonymous]` (P1-9).

---

## 7. SSRF (đã fix P0-8, giữ nguyên tắc)

- Mọi URL webhook/app-endpoint người dùng cấu hình → `SsrfGuard` trước khi gọi. Chặn loopback/private/link-local/metadata (169.254.169.254).

---

## 8. Rò rỉ thông tin & Secrets (P2-7, P3-*)

- Không trả stack trace/DB error cho client. `catch { _logger.LogError(ex, ...); return Problem("Đã xảy ra lỗi", statusCode: 500); }`.
- Không hardcode password (kể cả demo/QA) ngoài Development gate. Không fallback JWT/payment secret về config trong non-Dev — fail-closed.
- Cookie `SecurePolicy = Always` ngoài Development. CORS opt-in qua env (`MEGAFORM_CORS_ORIGINS`), không `AllowAnyOrigin` production.

---

## 9. Checklist BẮT BUỘC trước khi thêm/sửa endpoint

- [ ] Endpoint này state-changing? → có auth (role) + antiforgery chưa?
- [ ] Có tin giá trị nhạy cảm nào từ client không (SQL, amount, path, moduleId, role)? → chuyển server-side.
- [ ] Có emit HTML từ dữ liệu lưu trữ/user? → đã encode/sanitize chưa?
- [ ] Có emit CSS? → đã qua `NeutralizeStyleBreakout` chưa?
- [ ] Có nhận file/path? → whitelist + chống traversal + sanitize nội dung?
- [ ] Có gọi URL ngoài do user cấu hình? → qua `SsrfGuard`?
- [ ] Error handler có lộ `ex.Message`/stacktrace không?
- [ ] Nếu `[AllowAnonymous]`: đã ghi rõ lý do an toàn chưa?
- [ ] Đổi backend contract → đã cập nhật client JS tương ứng (antiforgery token, formId/fieldKey)?
- [ ] Public form submit + builder flow vẫn chạy sau thay đổi?

---

## 10. Ghi chú cho AI agent

1. **Trước khi viết endpoint mới**, grep xem có helper/guard sẵn: `RazorActionSqlGuard`, `SsrfGuard`, `ModuleCssComposer.NeutralizeStyleBreakout`, `CanUseAdminPopup`, `IsHostOrAdmin`, các `*SqlGuard`. **Tái sử dụng**, đừng viết lại yếu hơn.
2. **Không copy code mẫu từ remediation guide một cách mù quáng** — verify type/property/signature thật (ví dụ `FormSchema.Fields[].Settings`, `IFormRepository.GetSchemaAsync` có thể KHÔNG tồn tại). Đọc `MegaForm.Core/Models/FormSchema.cs` trước.
3. **3 platform (Web/Oqtane/DNN) thường có bản sao controller** — sửa 1 nơi phải rà 2 nơi còn lại (`MegaForm.Web/Controllers`, `MegaForm.Oqtane.Server/Controllers`, `MegaForm.DNN/WebApi`).
4. **Đổi API contract phải đồng bộ client JS** (`MegaForm.UI/src`, `wwwroot/js`). Deploy lệch pha backend/frontend = vỡ flow.
5. **Sau khi fix, cập nhật** `Docs/MYTHOS_SECURITY_AUDIT_REAUDIT_2026-07-04.md` (đánh dấu finding đã đóng) và build clean tất cả target trước khi coi là xong.
6. **Fail-closed khi nghi ngờ**: nếu không chắc một giá trị có an toàn, coi như không.

---

*Tài liệu này là canonical. Mọi thay đổi làm giảm nhẹ quy tắc phải được ghi lý do và duyệt.*
