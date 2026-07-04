# Handoff — Security verify + fix (P0/P1) + anti-recurrence guardrail — 2026-07-04

## Bối cảnh
User yêu cầu: (1) **audit lại** guide `Docs/SECURITY_REMEDIATION_GUIDE_P0_P1_2026-07-04.md` đối chiếu code thật, **nếu đúng thì sửa**; (2) **thiết lập quy tắc để AI không tái phạm security**.

## Đã làm

### 1. Verify (workflow 10-agent, đọc code thật)
Kết luận chính: **lỗ hổng CÓ THẬT nhưng code mẫu trong guide gần như toàn bộ SAI** — tham chiếu API không tồn tại. Blacklist (đừng copy):
- `IFormRepository.GetSchemaAsync` → thực tế `FormInfo GetForm(int)` + `RenderModelResolver.ResolveSchema` / `JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson)`.
- `FormField.Settings/.Widgets/.Actions`, class `FormWidget` → KHÔNG có; config ở `FormField.WidgetProps` (`Dictionary<string,object>`); razor actions ở `widgetProps["actions"][name].sql`.
- Payment `fixedPrice/allowUserAmount/minAmount/maxAmount` → thực tế `amountMode`('fixed'|'field'|'listenTotals') / `amount` / `amountFieldKey` / `currency`.
- `PaymentPriceResolver`, `RunActionBySchemaAsync`, `RazorActionResult.Fail()`, `HtmlSanitizer`/`Ganss`, `FormSettings.AllowRawCustomHtml`, per-token `allowHtml` → KHÔNG có.
- `ModuleCssComposer.NeutralizeStyleBreakout` từng là `private` (đã đổi `public`).
- `PutSourceRequest.RelativePath` → thực tế `{Name,File,Content}`, route `[HttpPost("source")]`, **sync**. Whitelist path đã có sẵn (`IsWhitelistedSourceFile`+`ResolveSandboxedFilePath`).

### 2. FIXED (build 0 error: Core/Web/Oqtane.Server/DNN)
| ID | File | Fix |
|----|------|-----|
| P0-1 | 3× `RazorWidgetController` (Oqtane/Web/DNN) | admin-gate `Action` (`IsAdmin`); guard = defense-in-depth; ConnectionKey giữ client (lookup key, admin caller) |
| P0-2 | `MegaForm.Web/Controllers/PaymentController.cs` | inject `IFormRepository`; `ResolveServerAmount()` ép giá schema cho `amountMode=="fixed"` (Stripe+PayPal); variable modes giữ client; fail-open khi thiếu formId/fieldKey |
| P0-6/P1-7/P2-12 | `FormHtmlRenderer.cs`, `ModuleCssComposer.cs`, `MegaFormController.RenderPage.cs` | `{{content:*}}`→`Esc()`; `NeutralizeStyleBreakout` public; RenderPage catch-fallback neutralize customCss |
| P1-2-Web | `MegaForm.Web/Controllers/MegaFormController.cs` | `SaveStyle` `[Authorize]`→`[Authorize(Roles="Administrator")]` |
| P1-9 | `MegaForm.DNN/WebApi/MegaFormApiController.cs` | `List()` bỏ `[AllowAnonymous]`; `SvgIsSafe()` reject active SVG trong `Image()` |

### 3. Guardrail chống tái phạm
- `Docs/SECURITY_CODING_RULES.md` — canonical 12 quy tắc vàng + DO/DON'T + checklist §9.
- `CLAUDE.md` (mới, repo root) — section 🔒 SECURITY, load mỗi session, trỏ rules doc.
- `memory/feedback_security_coding_rules.md` + `MEMORY.md` index.
- `.claude/hooks/security-reminder.cjs` + `.claude/settings.json` PreToolUse(Edit|Write) → inject nhắc 12 quy tắc khi sửa Controllers/WebApi/renderer/SqlGuard/Payment/Upload. **Đã kích hoạt live** trong session (pipe-test 4 payload PASS). Session mới tự nạp; session đang chạy có thể cần `/hooks` reload.

## ⛔ DEFERRED — workstream "Oqtane antiforgery token plumbing" (P1-1 / P1-10 / P1-12)
**Vì sao defer:** gỡ class-level `[IgnoreAntiforgeryToken]` + thêm `[ValidateAntiForgeryToken]` sẽ **400 mọi admin write** → vỡ builder/KB editor. Oqtane SPA không expose token antiforgery cho JS (guide giả định field/header/global DNN — không tồn tại; `panels.ts:68` stub `''`); Web dùng bearer-JWT, không gửi token.

**Spec workstream (làm TRƯỚC khi land P1-1/P1-10/P1-12):**
1. Server (Oqtane): phát antiforgery token vào SPA — inject vào `Index.razor` (meta/hidden) hoặc endpoint `GET /token`; xác định header name Oqtane framework kỳ vọng (KHÔNG phải `RequestVerificationToken` của DNN).
2. Client: một `adminFetch` wrapper gắn header token cho **mọi** admin write; audit ~20 fetch site rải rác (`oqtane.ts`/`aspcore.ts` request(), `toolbar.ts`, `gallery.ts`, `dom.ts`, `panels.ts`, dashboard, workflow, view-designer, widget plugins).
3. Sau khi token chạy end-to-end: gỡ class-level `[IgnoreAntiforgeryToken]` trên 12 controller Oqtane + 4 `AiKnowledge*` (P1-12); thêm `[ValidateAntiForgeryToken]` cho `UserTemplate` `refresh`/`source` (P1-10).
4. Web half (P1-1): có thể xoá class-level `[IgnoreAntiforgeryToken]` thừa trên 11 controller (no-op dưới JWT) — KHÔNG thêm `[ValidateAntiForgeryToken]`.
5. QA toàn bộ builder/dashboard/KB sau khi siết.

## ⚠️ Deploy gate (chưa làm)
Thay đổi C# Core/Oqtane/DNN mới chỉ **verify compile**. Để chạy runtime cần: bump `ModuleInfo.Version` + repack Oqtane (DLL-swap gate) + rebuild DNN. Chưa repack/deploy, chưa QA behavior trên site thật.

## Follow-up / residual
- P0-2: attacker bỏ `formId`/`fieldKey` → fail-open. Fix triệt để: bắt buộc `formId`+`fieldKey` cho payment + đổi widget JS (stripe/paypal) gửi đủ. PayPal enforcement phụ thuộc widget PayPal có gửi `formId` không (verify).
- P0-1 schema-lookup (thay vì admin-gate): nếu muốn public dashboard EditableList hoạt động anon-an-toàn, cần plumb `formId+widgetKey+actionName` từ `megaform-widget-razor.ts` + server resolve SQL từ `widgetProps["actions"]`.
- P0-6: nếu premium template cần HTML thật trong content token → thêm feature `allowHtml` whitelist (hiện encode-all).
- P2-7 verbose errors (`ex.Message`) vẫn còn nhiều controller — chưa xử lý.
- Commit: working tree còn nhiều thay đổi chưa commit từ các session trước (broad session commit deferred).

## ✅ UPDATE (cùng ngày) — Antiforgery workstream LANDED + VERIFIED

Đã dựng token plumbing + đóng subset an toàn của cụm DEFER (P1-1/P1-10/P1-12) + verify trên QA :5111.

- **Cơ chế (verified):** Oqtane token ở `<input name="__RequestVerificationToken">` (có trong page kể cả anon) + header `X-XSRF-TOKEN-HEADER` (cookie `X-XSRF-TOKEN-COOKIE` HttpOnly ride tự động). Verify-agent đã SAI ở điểm "không có token JS-readable".
- **Client:** `MegaForm.UI/src/shared/antiforgery.ts` (injector fetch/XHR same-origin, no-op trên Web/JWT) + wire `platform-host.ts` + `ai-knowledge/index.ts` + **vite entry `ai-knowledge`** (thiếu trước đó) + `package.json build:ai-knowledge`.
- **Server:** AiKnowledge×4 gỡ class ignore (SearchScoped read exempt); UserTemplate refresh/source + MegaFormController SaveStyle/SaveModuleStyle thêm `[ValidateAntiForgeryToken]`. Giữ class ignore ở controller có endpoint public.
- **Deploy:** hot-patch :5111 (net10 Debug DLL, same AssemblyName `MegaForm.Oqtane.Server.Oqtane` → không mismatch). Backup: `%TEMP%\claude\mf-verify1772-backup` (restore = stop exe → copy back → start).
- **Verify GREEN:** KB Upsert no-token→400 / w-token→403; public Submit→200; render/1→200; SearchScoped→403(≠400); injector trong mọi bundle; 0 startup exception. (Authed happy-path chưa test empiric do login-API host trả isAuthenticated:false — vấn đề flow Oqtane, KHÔNG phải code; cơ chế token đã proven ở anonymous test. Cần browser QA thủ công: login → save form/style/KB.)
- **Còn DEFER:** blanket removal trên MegaFormController(non-style)/Subform/RazorWidget/AiTools/LocalAi/Assistant/Phase2 + Web-half. Injector đã sẵn → mở rộng = thêm attribute + QA.
- **Packaging TODO:** bump `ModuleInfo.Version` + repack Release nupkg cho bản phân phối (hiện mới hot-patch Debug để QA).

## Không commit tự động
Chưa commit. Các file đã đổi (fix): `MegaForm.Core/Services/FormHtmlRenderer.cs`, `MegaForm.Core/Services/ModuleCssComposer.cs`, `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`, `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Controllers/MegaFormController.cs`, `MegaForm.Web/Controllers/RazorWidgetController.cs`, `MegaForm.Web/Controllers/PaymentController.cs`, `MegaForm.DNN/WebApi/MegaFormApiController.cs`, `MegaForm.DNN/WebApi/RazorWidgetController.cs`. Guardrail: `Docs/SECURITY_CODING_RULES.md`, `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/security-reminder.cjs`, `Docs/MYTHOS_SECURITY_AUDIT_REAUDIT_2026-07-04.md` (§9).
