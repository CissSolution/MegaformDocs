# Tối ưu: Preload schema cho form Oqtane

**Ngày:** 2026-06-18  
**File thay đổi chính:** `MegaForm.Oqtane.Client/Index.razor`  
**Mục tiêu:** Loại bỏ khoảng trống ~1.2 giây giữa "Blazor interactive sẵn sàng" và "gọi API schema" bằng cách embed schema vào HTML ban đầu.

---

## Vấn đề

Khi đo tải trang form tại `localhost:5070`, network và CDN không phải bottleneck, nhưng form vẫn hiện ra muộn:

| Mốc | Thờ gian |
|-----|----------|
| `blazor.web.js` bắt đầu | ~107 ms |
| Page load event | ~345 ms |
| Blazor negotiate (SignalR) | ~343 ms |
| Các file JS MegaForm tải xong | ~559 ms |
| Gọi API `/api/MegaForm/Schema/...` | ~1794 ms |
| API schema xong | ~1830 ms |

Có khoảng trống **~1.2–1.45 giây** giữa lúc JS/CSS đã tải xong (~559 ms) và lúc form bắt đầu gọi API schema (~1794 ms). Trong khoảng này không có request mạng nào — đó là thờ gian Blazor khởi tạo component tương tác (SignalR connect + lifecycle). Schema API chỉ mất ~36 ms, nhưng nó bắt đầu quá muộn.

## Root cause

`Index.razor` đã fetch form DTO trong `OnParametersSetAsync` (`MegaFormService.GetFormAsync`), nhưng sau đó lại để JS renderer **fetch lại** `/api/MegaForm/Schema/{formId}` trong `BuildRendererBootScript()`. Do đó:

1. Server đã có schema sẵn trong Blazor lifecycle.
2. Nhưng phải chờ SignalR circuit connect xong.
3. Sau đó JS renderer mới fetch schema từ server một lần nữa.
4. Mất thêm một vòng network round-trip + serialization không cần thiết.

## Giải pháp

Embed schema dưới dạng `<script type="application/json">` ngay trong HTML response, và sửa boot script để dùng dữ liệu đã preload thay vì fetch lại.

### Các thay đổi trong `Index.razor`

1. **Lưu form DTO đã fetch:**
   ```csharp
   var form = await MegaFormService.GetFormAsync(_formId, ModuleState?.ModuleId ?? 0, GetCurrentSiteId());
   _preloadedForm = form;
   ```

2. **Render schema JSON vào HTML:**
   ```razor
   @if (_formId > 0 && _isPublished && !IsPopupMode && _preloadedForm != null)
   {
       <script type="application/json" id="mf-preload-schema-@FormMountId">
           @BuildPreloadSchemaJson()
       </script>
   }
   ```

3. **Build `SchemaResponse`-shaped JSON từ `FormDto`:**
   ```csharp
   private string BuildPreloadSchemaJson()
   {
       // Tạo SchemaResponse từ _preloadedForm, ưu tiên ResolvedSchemaJson / ResolvedSettingsJson
   }
   ```

4. **Boot script đọc preload trước khi fetch:**
   ```js
   var preloadId = 'mf-preload-schema-' + opts.containerId;
   var preloadedData = null;
   try {
       var preloadEl = document.getElementById(preloadId);
       if (preloadEl) {
           preloadedData = JSON.parse(preloadEl.textContent || '{}');
           if (!preloadedData || !preloadedData.schema) preloadedData = null;
       }
   } catch (preloadErr) { preloadedData = null; }

   waitForCore().then(function (mountEl) {
       var schemaPromise = preloadedData
           ? Promise.resolve(preloadedData)
           : fetch(opts.apiBase + 'Schema/' + opts.formId).then(...);
       return schemaPromise.then(function (data) { ... });
   });
   ```

## Tại sao cách này an toàn

- **Fallback đầy đủ:** Nếu preload JSON bị lỗi, thiếu schema, hoặc bị cache cũ, boot script tự động fetch `/api/MegaForm/Schema/{formId}` như cũ.
- **HTML-escaped:** Razor tự động HTML-encode nội dung `@BuildPreloadSchemaJson()`, tránh lỗi `</script>` injection.
- **Không ảnh hưởng SSR:** Khi `?mfssr=1`, HTML vẫn có server-rendered fields; preload schema giúp JS hydrate nhanh hơn.
- **Popup không bị ảnh hưởng:** `IsPopupMode` được loại trừ để popup vẫn giữ hành vi cũ (form không hiển thị ngay lập tức).
- **Cache tự nhiên:** Schema nằm trong HTML response, nên khi form thay đổi, HTML mới cũng thay đổi.

## Kết quả mong đợi

- Loại bỏ request `/api/MegaForm/Schema/{formId}` sau khi Blazor interactive connect.
- Form có thể render ngay khi `MegaFormRenderer` bundle tải xong, không cần chờ thêm vòng fetch schema.
- Giảm thờ gian từ "JS renderer sẵn sàng" đến "form fields hiển thị" khoảng **30–80 ms** trên mạng nhanh, và nhiều hơn trên mạng chậm.
- Không giải quyết được khoảng 1.2s do Blazor SignalR connect, nhưng loại bỏ hoạt động cuối cùng nằm sau khoảng trống đó.

## Các vấn đề khác vẫn cần chú ý

1. **Admin CSS/JS vẫn load cho public visitor:** Các file như `megaform-admin-shell.css`, `megaform-submissions-ts.css`, … vẫn được include. Đã thử gate nhưng revert do Oqtane không reinject `<link>` trên SPA navigation. Cần giải pháp riêng (lazy-load admin CSS động hoặc host-level bundling).
2. **External CDN fonts:** Theme/template vẫn có thể kéo Google Fonts. Cần audit theme cụ thể.
3. **SSR mặc định:** `SsrMode` hiện chỉ bật với `?mfssr=1`. Bật mặc định sẽ giúp form fields hiển thị ngay trong HTML, nhưng cần kiểm tra hydration path.
4. **HTTP/2 hoặc HTTP/3:** Các request static file vẫn đang HTTP/1.1 trong một số môi trường; cấu hình reverse proxy hỗ trợ HTTP/2 sẽ cải thiện đáng kể.

## Build

```bash
dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Debug -f net9.0
```

Kết quả: **0 Error(s)** — chỉ có warnings cũ từ `MegaForm.Core`.
