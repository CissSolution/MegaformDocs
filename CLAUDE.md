# CLAUDE.md — MegaFormSolution (Oqtane / DNN / Web / Umbraco)

Hướng dẫn bắt buộc cho AI khi làm việc trên repo này. Chi tiết deploy/QA/site nằm trong auto-memory (`MEMORY.md`).

## 🔒 SECURITY — BẮT BUỘC (đọc trước khi sửa bất kỳ controller/endpoint/renderer/SQL/upload)

**Canonical rules: [`Docs/SECURITY_CODING_RULES.md`](Docs/SECURITY_CODING_RULES.md) — đọc & tuân thủ.**

Codebase này đã qua nhiều đợt audit và **các lớp lỗ hổng dưới đây từng lặp lại**. Đừng tái phạm:

1. **KHÔNG tin client cho quyết định bảo mật/tiền.** SQL, `amount`/`currency`, file path, `moduleId`, role → tra cứu/tính **server-side từ schema/DB**, không lấy từ request body.
2. **KHÔNG nhận SQL thô từ client rồi thực thi** (RazorWidget.Action). Resolve SQL từ schema theo `formId`+`widgetKey`+`actionName`; guard `RazorActionSqlGuard` chỉ là defense-in-depth, không thay auth.
3. **Mọi endpoint state-changing phải có auth rõ ràng** (role + ownership). `[Authorize]` trơn (any user) = CHƯA đủ → IDOR. `[AllowAnonymous]` chỉ cho public thật (Submit/Upload-File/Render) và phải ghi lý do.
4. **KHÔNG `[IgnoreAntiforgeryToken]` ở CLASS level** trên controller admin. Chỉ action-level cho action public. Siết antiforgery phải đồng bộ JS gửi `RequestVerificationToken`.
5. **HTML-encode mặc định** `{{content:*}}`, `CustomHtml`, nhãn/tiêu đề (dùng helper encode SẴN CÓ của `FormHtmlRenderer`). HTML chỉ qua allowHtml whitelist có chủ đích.
6. **Mọi CSS emit phải qua `ModuleCssComposer.NeutralizeStyleBreakout`** — kể cả nhánh catch-fallback trong `RenderPage.cs`.
7. **Payment:** server resolve giá từ payment field settings — field thật là `widgetProps.amountMode` (`fixed`/`field`/`listenTotals`) + `amount`/`currency` + bounds `minAmount`/`maxAmount` cho mode biến thiên. KHÔNG tin `amount`/`status:"paid"` client: create-intent đi qua `PaymentEndpointService.ResolveCreateAmount` (fail-closed khi form/field không resolve được), và **mọi submission có payment field phải qua `PaymentSubmissionVerifier`** (gọi lại Stripe/PayPal xác minh tiền thật + chống replay transactionId + check metadata formId). Verifier fail-CLOSED khi host chưa đăng ký.
8. **File path client** → whitelist extension + `Path.GetFullPath` + chặn `..`/`:`/`~`. SVG/HTML upload → sanitize hoặc serve attachment + `nosniff`.
9. **URL ngoài do user cấu hình** (webhook/app-endpoint) → `SsrfGuard`.
10. **KHÔNG trả `ex.Message`/`ex.StackTrace` cho client.** KHÔNG hardcode secret; KHÔNG fallback secret về config ngoài Development.

### Trước khi commit code động tới security surface, chạy checklist ở §9 của `Docs/SECURITY_CODING_RULES.md`.

### Lưu ý thực thi cho AI
- **Verify trước khi copy code mẫu từ remediation guide** — type/property/service trong guide (vd `FormSchema.Fields[].Settings`, `IFormRepository.GetSchemaAsync`) có thể KHÔNG tồn tại. Đọc `MegaForm.Core/Models/FormSchema.cs` trước.
- **3 platform có controller song sinh** (`MegaForm.Web/Controllers`, `MegaForm.Oqtane.Server/Controllers`, `MegaForm.DNN/WebApi`) — fix 1 nơi, rà 2 nơi còn lại.
- **Đổi API contract phải đồng bộ client JS** (`MegaForm.UI/src`, `wwwroot/js`) — deploy lệch pha = vỡ public form/builder flow.
- **Sau fix:** build clean mọi target; cập nhật audit doc đánh dấu finding đã đóng; giữ public submit + builder flow.

## Kiến trúc & deploy
- Chi tiết deploy gate (Oqtane bump `ModuleInfo.Version`), pack gotchas, các site QA (:5090/:5100/:5111/…) → xem auto-memory `MEMORY.md`.
- Nguồn canonical CSS = `Assets/css/` (không sửa bản wwwroot đã build). Renderer có 2 nguồn (TS + `FormHtmlRenderer.cs`) — sửa phải giữ parity SSR/client.
