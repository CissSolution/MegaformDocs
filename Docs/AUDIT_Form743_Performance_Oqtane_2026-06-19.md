# BÁO CÁO HIỆU NĂNG: Form #743 load chậm trên Oqtane

**Ngày kiểm tra:** 2026-06-19  
**URL kiểm tra:** `http://localhost:5070/?formid=743`  
**Phương pháp:** Playwright headless, đo thờ gian render + network timeline + Performance API  
**Phạm vi:** Chỉ rà soát và đề xuất — không code.

---

## 1. Tóm tắt số liệu

| Chỉ số | Thờ gian | Nhận xét |
|--------|----------|----------|
| **Server response HTML** | ~1.4 s | Khá chậm cho localhost; cần xem xét Blazor/Oqtane pipeline. |
| **First Paint / First Contentful Paint** | ~4.8 s | Rất chậm; ngườ dùng thấy màn hình trắng gần 5 giây. |
| **DOMContentLoaded** | ~4.87 s | Bị chặn bởi external CSS/JS. |
| **Form fields hiển thị** | ~8.37 s | Thờ gian thực sự để ngườ dùng có thể tương tác. |
| **Load event** | ~5.02 s | Do external resources kéo dài. |
| **Schema API** | ~64 ms | API nhanh, không phải bottleneck. |
| **Renderer JS** | ~250 ms | Bundle renderer tải nhanh. |

**Kết luận nhanh:** Form không chậm ở server-side schema/API hay renderer JS. Chậm chủ yếu do **render-blocking external resources (CDN fonts, Bootstrap, Font Awesome)**, **thiếu compression**, **load nhiều CSS/JS admin bundle không cần thiết cho public**, và **ảnh hero nặng**.

---

## 2. Timeline chi tiết

```
0 ms       GET /?formid=743
1,400 ms   HTML response end
1,400 ms   Bắt đầu tải external CSS/JS (bootswatch, font-awesome, google fonts)
4,600 ms   External CSS/JS hoàn tất
4,800 ms   First Paint / DOMContentLoaded
5,260 ms   MegaForm config/i18n/widgets/rule-engine/renderer JS tải xong
6,230 ms   Gọi API /api/MegaForm/Schema/743
6,270 ms   Schema response (165 KB)
7,140 ms   Bắt đầu tải ảnh hero (~1.7 MB mỗi ảnh)
8,370 ms   Form fields hiển thị
```

---

## 3. Các nguyên nhân chính

### 3.1. Render-blocking external resources (nguyên nhân lớn nhất)

Các tài nguyên bên thứ ba được load đồng thờ và chặn render:

| Tài nguyên | Thờ gian | Loại | Ghi chú |
|------------|----------|------|---------|
| `fonts.googleapis.com/css2?family=DM+Sans` | ~3.27 s | CSS render-blocking | External font CSS |
| `cdnjs.cloudflare.com/.../bootstrap.min.css` | ~3.20 s | CSS render-blocking | Bootswatch theme |
| `cdnjs.cloudflare.com/.../font-awesome/6.5.0/css/all.min.css` | ~3.17 s | CSS render-blocking | Icon font |
| `cdnjs.cloudflare.com/.../bootstrap.bundle.min.js` | ~3.19 s | JS (có thể render-blocking) | Bootstrap JS |
| `fonts.googleapis.com/css2?family=Geist` | ~3.17 s | CSS render-blocking | External font CSS |

**Hậu quả:**
- First paint bị trì hoãn từ ~1.4 s lên ~4.8 s (chậm thêm ~3.4 s).
- Nếu mạng chậm hoặc CDN bị chặn, form có thể không hiển thị.
- External DNS/TCP/TLS cũng tốn thờ gian dù resource nhỏ.

### 3.2. Thiếu HTTP compression (gzip/brotli)

Kiểm tra header response cho `megaform.css` và `megaform-renderer.js`:
- Không có `Content-Encoding`.
- `megaform.css`: 107 KB raw.
- `megaform-renderer.js`: 208 KB raw.
- `Schema/743`: 165 KB raw.

**Hậu quả:** Với gzip, các file text này có thể giảm ~60–75% kích thước. Thiếu compression làm tăng đáng kể thờ gian tải, đặc biệt trên mạng chậm.

### 3.3. Load nhiều CSS/JS admin bundle dù ngườ dùng là public

Public visitor chỉ cần form, nhưng trang vẫn tải:

| File | Kích thước | Mục đích | Cần cho public? |
|------|-----------|----------|-----------------|
| `megaform-admin-shell.css` | ~45 KB | Admin dock/panel | Không |
| `megaform-submissions-ts.css` | ~62 KB | Submission views | Không |
| `megaform-my-inbox-ts.css` | ~43 KB | Workflow inbox | Không |
| `megaform-workflow-inbox-ts.css` | ~14 KB | Workflow inbox | Không |
| `megaform-listview.css` | ~11 KB | List/card view | Có thể không |
| `megaform-config.js` | ~47 KB | Config runtime | Có thể không cần tất cả |
| `megaform-i18n.js` | ~56 KB | i18n runtime | Cần nếu multi-language |

**Hậo quả:** Tải thêm ~170 KB CSS + ~100 KB JS không cần thiết cho public visitor.

### 3.4. Ảnh hero nặng

| Ảnh | Kích thước | Thờ gian |
|-----|-----------|----------|
| `bulgaria-rose-hero.png` | ~1.77 MB | ~720 ms |
| `bulgaria-plovdiv.png` | ~1.79 MB | ~720 ms |

**Hậu quả:** Tổng ~3.5 MB ảnh PNG. Dù load sau first paint, chúng vẫn chiếm băng thông và có thể delay LCP (Largest Contentful Paint). Ảnh PNG nén kém so với WebP/AVIF.

### 3.5. Schema fetch bắt đầu muộn

- Schema API `/api/MegaForm/Schema/743` được gọi ở ~6.2 s.
- Phải đợi renderer bundle (`megaform-renderer.js`) tải xong ở ~5.4 s mới gọi.
- API chỉ mất ~64 ms, nhưng bắt đầu muộn kéo dài tổng thờ gian hiển thị form.

### 3.6. HTML response chậm (~1.4 s)

- `curl` test trả về 200 trong ~53 ms, nhưng Playwright đo `responseEnd` ở ~1.4 s.
- Có thể do Blazor/Oqtane rendering pipeline, hoặc do các middleware xử lý module config trước khi trả HTML.

### 3.7. Fonts từ Google Fonts gây FOUT/FOIT

- Nhiều font families được load: DM Sans, Geist, DM Serif Display, Inter, Roboto.
- Mỗi font CSS lại fetch thêm font files từ `fonts.gstatic.com`.
- Có thể gây flash of invisible text (FOIT) hoặc layout shift.

---

## 4. Đề xuất cách sửa (không code)

### 4.1. Ưu tiên cao — giảm thờ gian First Paint

1. **Self-host hoặc async/defer external CSS/JS**
   - Chuyển Bootstrap, Font Awesome, Google Fonts về self-host trong `wwwroot` để tránh DNS/TCP/TLS bên ngoài.
   - Hoặc thêm `defer`/`async` cho JS, `media="print" onload="this.media='all'"` cho CSS không critical.
   - Đặt non-critical CSS ở cuối `<body>` hoặc load lazy.

2. **Tách critical CSS**
   - Inline CSS cần thiết cho first paint (layout cơ bản, header, form skeleton) vào `<style>` trong `<head>`.
   - Load `megaform.css` đầy đủ asynchronously hoặc deferred.

3. **Bật gzip/brotli compression**
   - Cấu hình ASP.NET Core middleware compression cho static files và API responses.
   - Có thể giảm 60–75% kích thước CSS/JS/JSON.

### 4.2. Ưu tiên cao — giảm bundle không cần thiết

4. **Conditional loading theo role/view mode**
   - Chỉ load `megaform-admin-shell.css`, `megaform-submissions-ts.css`, `megaform-my-inbox-ts.css`, `megaform-workflow-inbox-ts.css` khi user là admin hoặc khi view mode là list/card/inbox.
   - Public form view chỉ cần: `megaform.css`, `megaform-themes.css`, `megaform-widgets.css`, `megaform-renderer.js`, và các plugin liên quan.

5. **Code-splitting / tree-shaking**
   - Đánh giá lại bundle `megaform-renderer.js` (208 KB) và `megaform-config.js` (47 KB).
   - Tách phần chỉ dùng cho admin hoặc advanced widgets thành chunk riêng, lazy load khi cần.

### 4.3. Ưu tiên trung bình — tối ưu ảnh và tài nguyên

6. **Nén/chuyển đổi ảnh hero**
   - Chuyển PNG ~1.7 MB sang WebP hoặc AVIF (có thể giảm xuống ~200–400 KB).
   - Cung cấp srcset để responsive images.
   - Thêm `loading="lazy"` hoặc `decoding="async"` cho ảnh không nằm trong viewport đầu tiên.

7. **Preload/prefetch tài nguyên quan trọng**
   - Thêm `<link rel="preconnect">` cho `fonts.googleapis.com`, `fonts.gstatic.com`, `cdnjs.cloudflare.com` nếu vẫn dùng CDN.
   - Preload `megaform-renderer.js` và font files chính.
   - Preconnect đến `/api/MegaForm/` để Schema API nhanh hơn.

8. **Gọi Schema API sớm hơn**
   - Không cần đợi toàn bộ renderer bundle tải xong mới gọi Schema.
   - Có thể inline schema JSON vào HTML server-render (SSR) hoặc gọi API sớm trong boot script.

### 4.4. Ưu tiên thấp — tinh chỉnh pipeline

9. **Tối ưu Oqtane/Blazor HTML rendering**
   - Điều tra tại sao HTML response mất ~1.4 s dù curl nhanh (~53 ms).
   - Có thể do Blazor prerendering, anti-forgery token, hoặc module config lookup.

10. **Caching static files**
    - Đảm bảo `megaform-renderer.js`, `megaform.css`, ... có cache headers dài (vì đã có version query `?v=...`).
    - Hiện tại có version query, nhưng cần kiểm tra `Cache-Control` header.

11. **Giảm số lượng font families**
    - Form sử dụng DM Sans, Geist, DM Serif Display, Inter, Roboto. Cân nhắc giảm xuống 1–2 font families để giảm request và FOUT.

---

## 5. Kịch bản kỳ vọng sau tối ưu

Nếu thực hiện các đề xuất ưu tiên cao:

| Chỉ số | Trước tối ưu | Sau tối ưu (dự kiến) |
|--------|-------------|---------------------|
| First Paint | ~4.8 s | ~1.5–2.0 s |
| DOMContentLoaded | ~4.9 s | ~1.8–2.5 s |
| Fields visible | ~8.4 s | ~3.5–4.5 s |
| Dung lượng text assets | ~600 KB+ | ~200–300 KB (với gzip) |
| Dung lượng images | ~3.5 MB | ~0.5–1 MB (WebP/AVIF) |

---

## 6. Các file/là code liên quan cần xem xét

- `MegaForm.Oqtane.Client/Index.razor` — nơi inject CSS/JS resources, inline `_initialInlineCss`.
- `MegaForm.Oqtane.Server/Program.cs` hoặc middleware — bật compression, static file caching.
- `MegaForm.UI/src/renderer/index.ts` — boot sequence, Schema API call timing.
- Oqtane theme layout — nơi load Bootstrap, Font Awesome, Google Fonts.
- Form JSON settings — `customCss`, `customHtml`, image URLs.

---

## 7. Kết luận

Form #743 load chậm không phải do logic render form hay API schema, mà do **các vấn đề frontend delivery**: external render-blocking resources, thiếu compression, bundle admin không cần thiết, và ảnh nặng. Các bước tối ưu quan trọng nhất là:

1. Bật gzip/brotli.
2. Self-host hoặc async hóa external CSS/JS.
3. Chỉ load admin bundle khi cần.
4. Nén ảnh hero sang WebP/AVIF.
5. Preload/preconnect critical resources.
6. Cân nhắc inline schema hoặc gọi Schema API sớm hơn.
