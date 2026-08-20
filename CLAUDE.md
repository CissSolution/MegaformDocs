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
11. **BOUNDED-READ: MỌI đường đọc SQL do user/designer cấu hình phải cap server-side ĐẨY VÀO SQL** (TOP / OFFSET..FETCH / LIMIT theo provider) — **cấm** đọc hết vào List rồi `Skip/Take` (in-memory pagination). Client page size KHÔNG tin → clamp; count = `COUNT(*)` riêng, không materialize-rồi-đếm. Đường **anonymous** (public form: optionsSql/cascade, DataRepeater `FilterOptions`/`ColumnOptions`/`Query`) = cap NGHIÊM NHẤT (vài trăm dòng). Bảng **XL** phải filter-before-list (tái dùng `CapabilityDecisionEngine.RequiresFilterBeforeList`). Thêm server-cap phải ship KÈM client typeahead (`&q=`/`&page=`) nếu không = regression "mất dữ liệu im lặng". Chi tiết + checklist: `Docs/SECURITY_CODING_RULES.md §Bounded-read`.

### Trước khi commit code động tới security surface, chạy checklist ở §9 của `Docs/SECURITY_CODING_RULES.md`.

### Lưu ý thực thi cho AI
- **Verify trước khi copy code mẫu từ remediation guide** — type/property/service trong guide (vd `FormSchema.Fields[].Settings`, `IFormRepository.GetSchemaAsync`) có thể KHÔNG tồn tại. Đọc `MegaForm.Core/Models/FormSchema.cs` trước.
- **3 platform có controller song sinh** (`MegaForm.Web/Controllers`, `MegaForm.Oqtane.Server/Controllers`, `MegaForm.DNN/WebApi`) — fix 1 nơi, rà 2 nơi còn lại.
- **Đổi API contract phải đồng bộ client JS** (`MegaForm.UI/src`, `wwwroot/js`) — deploy lệch pha = vỡ public form/builder flow.
- **Sau fix:** build clean mọi target; cập nhật audit doc đánh dấu finding đã đóng; giữ public submit + builder flow.

## 🎨 GIAO DIỆN & ĐÓNG GÓI — BẮT BUỘC (đọc trước khi sửa CSS dùng chung / endpoint Umbraco / đóng gói)

**Canonical rules: [`Docs/RENDER_AND_PACKAGING_RULES.md`](Docs/RENDER_AND_PACKAGING_RULES.md).**

Mọi lỗi trong tài liệu đó đều **build xanh, HTTP 200, không một dòng lỗi** — chỉ lộ ra khi mở màn
hình lên nhìn hoặc đo bằng số. Tóm tắt để không tái phạm:

1. **CSS "mặc định" phải nhường được cho template** — không `!important`, không nhắm class của
   template (`.mfp-submit`…). Cần loại ngữ cảnh thì dùng `:not(:where(.mfp *))`. ⭐`:where()` chưa
   chắc đủ: đo bằng CDP `CSS.getMatchedStylesForNode`, đừng tranh luận bằng bảng specificity.
   Và đọc `backgroundColor` là chưa đủ — gradient nằm ở `background-image`.
2. **Luật CSS hậu duệ (`.wrapper h2`) luôn chồm vào nội dung component vẽ ra.** Đã ép mọi tiêu đề
   của template về cỡ chữ trang tin.
3. **Asset không `?v=` thì bản vá không tới người dùng.** Dùng `asp-append-version="true"`; gói
   Umbraco thì bump `version` trong `umbraco-package.json`.
4. **Umbraco/Oqtane: KHÔNG `Ok()` payload còn mang `JObject`/`JArray`** — STJ xuất ra mảng rác
   (`[[[]],[[]]…]`), field mất sạch thuộc tính, form ra trắng mà vẫn 200. Serialize bằng Newtonsoft
   rồi `Content(...)`. **Sửa 1 nền, rà 3 nền còn lại.**
5. **Umbraco: property là DỮ LIỆU, template mới VẼ.** Thêm property không làm nó hiện ra. File render
   thật ở `MegaForm.Umbraco.Host/Views/*.cshtml`, không phải chuỗi seed trong handler. Gỡ property
   phải có bước dọn chạy **trước** cổng once-only. ⚠️alias lệch hoa-thường ⇒ `Value<T>()` trả null im lặng.
6. **Đóng gói:** guard `throw` phải nằm **NGOÀI** `if (Test-Path)` (đường dẫn sai = bỏ qua im lặng,
   gói thiếu template mà vẫn xanh); **so timestamp DLL với source** trước khi pack; mở zip kiểm chuỗi
   của chính bản vá trước khi cài lên site thật. ⚠️DNN install **không ghi đè `bin/*.dll`**.
7. **Nghiệm thu đi tới tận nơi người dùng nhìn** — không dừng ở "API trả đúng"/"đã tạo xong". Đếm ô
   nhập trên trang công khai, đếm `svg` thật, deep-query xuyên shadow DOM, dùng `.click()` của
   Playwright (không phải trong `evaluate`). Trước khi kết luận "màn hình hỏng", kiểm **id đang thử
   có thật không**.

## Kiến trúc & deploy
- Chi tiết deploy gate (Oqtane bump `ModuleInfo.Version`), pack gotchas, các site QA (:5090/:5100/:5111/…) → xem auto-memory `MEMORY.md`.
- Nguồn canonical CSS = `Assets/css/` (không sửa bản wwwroot đã build). Renderer có 2 nguồn (TS + `FormHtmlRenderer.cs`) — sửa phải giữ parity SSR/client.
