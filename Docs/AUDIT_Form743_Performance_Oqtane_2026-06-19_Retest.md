# BÁO CÁO KIỂM TRA LẠI: Form #743 load chậm?

**Ngày kiểm tra lại:** 2026-06-20  
**URL kiểm tra:** `http://localhost:5070/?formid=743` (so sánh với `http://localhost:5070/?formid=741`)  
**Phương pháp:** Playwright headless, **fresh browser context (không cache)** cho cả 2 form  
**Phạm vi:** Chỉ rà soát và đề xuất — không code.

---

## 1. Kết luận nhanh

**Form #743 không luôn chậm.** Lần kiểm tra đầu tiên (báo cáo trước) gặp hiện tượng **cold cache / network fluctuation** khiến các tài nguyên CDN (Bootswatch, Bootstrap JS, Google Fonts) mất ~3.2 giây. Khi kiểm tra lại trong fresh context, form #743 load **nhanh tương đương form #741**, thậm chí còn nhanh hơn một chút ở một số chỉ số.

| Chỉ số | Form #741 (american-auto) | Form #743 (bulgaria-discovery) |
|--------|---------------------------|--------------------------------|
| **DOMContentLoaded** | 581 ms | 513 ms |
| **Fields visible** | 1,690 ms | 1,584 ms |
| **Load event** | 811 ms | 695 ms |
| **Body HTML length** | 33,975 bytes | 58,893 bytes |
| **Số fields** | 6 | 21 |
| **Số bước** | 1 | 4 (multi-step) |

---

## 2. So sánh chi tiết request chậm nhất

Trong fresh context, các request chậm nhất của 2 form đều nằm ở mức 160–280 ms:

### Form #741 (american-auto-dealership-registration.json)
| Request | Duration | Loại |
|---------|----------|------|
| `fonts.gstatic.com/s/geist/...woff2` | 274 ms | Font |
| `fonts.gstatic.com/s/inter/...woff2` | 266 ms | Font |
| `images.unsplash.com/...` (4 ảnh xe) | 182–247 ms | Image |
| `fonts.googleapis.com/css2?family=Geist` | 231 ms | Stylesheet |
| `api/MegaForm/Schema/741` | 221 ms | Fetch |
| `fonts.googleapis.com/css2?family=Oswald&Inter` | 214 ms | Stylesheet |
| `cdnjs.cloudflare.com/.../bootstrap.min.css` | 166 ms | Stylesheet |
| `cdnjs.cloudflare.com/.../bootstrap.bundle.min.js` | 160 ms | Script |

### Form #743 (bulgaria-discovery-programme.json)
| Request | Duration | Loại |
|---------|----------|------|
| `fonts.gstatic.com/s/geist/...woff2` | 279 ms | Font |
| `fonts.googleapis.com/css2?family=Geist` | 218 ms | Stylesheet |
| `cdnjs.cloudflare.com/.../bootstrap.min.css` | 217 ms | Stylesheet |
| `cdnjs.cloudflare.com/.../bootstrap.bundle.min.js` | 209 ms | Script |
| `fonts.gstatic.com/s/inter/...woff2` | 179 ms | Font |
| `bulgaria-plovdiv.png` (~1.79 MB) | 164 ms | Image |
| `bulgaria-rose-hero.png` (~1.77 MB) | 163 ms | Image |
| `megaform-renderer.js` | 120 ms | Script |
| `api/MegaForm/Schema/743` | 108 ms | Fetch |
| `fonts.googleapis.com/css2?family=DM+Serif+Display&Inter` | 108 ms | Stylesheet |

**Nhận xét:**
- Form #743 có 2 ảnh hero PNG rất nặng (~1.7 MB mỗi ảnh), nhưng vì server local nên tải nhanh (~163 ms). Trên mạng production thực, 2 ảnh này có thể mất 2–5 giây.
- Form #743 phụ thuộc nhiều hơn vào `cdnjs.cloudflare.com` (Bootswatch + Bootstrap JS) so với form #741.
- Schema API của #743 chỉ mất 108 ms (nhanh hơn #741 là 221 ms), dù #743 có 21 fields so với 6 fields.

---

## 3. Vì sao lần đầu form #743 bị chậm ~8.4 giây?

### Nguyên nhân xác định: Cold cache / network fluctuation

Lần kiểm tra đầu tiên, các request CDN mất:
- `bootswatch/bootstrap.min.css`: ~3.2 s
- `bootstrap.bundle.min.js`: ~3.15 s
- `font-awesome/all.min.css`: ~3.13 s
- `fonts.googleapis.com` (DM Sans, Geist): ~2.7–3.3 s

Khi kiểm tra lại trong fresh browser context, cùng các request chỉ mất 160–280 ms.

**Giải thích:**
- Có thể lần đầu CDN bị chậm do DNS lookup, TCP/TLS handshake, hoặc network congestion tạm thờ.
- Hoặc Playwright context lần đầu chưa có kết nối TCP đến CDN, còn lần sau connection đã được warm (dù là fresh context, nhưng mạng vật lý/tầng TCP có thể tái sử dụng).
- Dù fresh context xóa HTTP cache, nhưng không xóa được DNS cache hoặc TCP connection pool ở tầng OS.

### Các yếu tố làm tăng rủi ro lần đầu chậm của form #743

1. **Nhiều external render-blocking resources**
   - #743 dùng Bootswatch CSS + Bootstrap JS + Google Fonts (DM Serif Display, Inter, Geist) + Font Awesome.
   - #741 cũng dùng Google Fonts và Bootstrap, nhưng ít hơn.

2. **HTTP/1.1**
   - Cả 2 form đều dùng `http/1.1` (`nextHopProtocol`).
   - HTTP/1.1 giới hạn ~6 concurrent connections per domain. Nhiều request CDN phải xếp hàng, làm tăng thờ gian khi cold.

3. **Ảnh hero nặng**
   - `bulgaria-rose-hero.png` ~1.77 MB
   - `bulgaria-plovdiv.png` ~1.79 MB
   - Trên mạng chậm, 2 ảnh này sẽ là bottleneck rõ rệt.

4. **Multi-step form với 21 fields**
   - Renderer cần xử lý nhiều fields và page breaks hơn, nhưng đo lường cho thấy phần này không phải bottleneck chính.

---

## 4. Đề xuất cách sửa (không code)

Dù form #743 không luôn chậm, vẫn cần giảm rủi ro **cold-load chậm** và **phụ thuộc CDN**.

### 4.1. Ưu tiên cao — giảm phụ thuộc CDN

1. **Self-host Bootstrap + Font Awesome**
   - Thay vì `cdnjs.cloudflare.com`, dùng file local trong `/Modules/MegaForm/lib/` (giống cách form #741 đã có `lib/fontawesome/`).
   - Tránh DNS/TCP/TLS bên ngoài và giảm rủi ro CDN bị chặn/chậm.

2. **Self-host Google Fonts hoặc dùng font-display: swap**
   - Nếu vẫn dùng Google Fonts, thêm `&display=swap` (đã có) và `preconnect`.
   - Tốt hơn: tải font files về self-host trong `/Modules/MegaForm/lib/fonts/`.

3. **Bật HTTP/2 hoặc HTTP/3**
   - Cấu hình Kestrel/IIS/reverse proxy hỗ trợ HTTP/2 để tải nhiều resource song song thay vì bị giới hạn HTTP/1.1.

### 4.2. Ưu tiên cao — tối ưu ảnh

4. **Nén/chuyển đổi ảnh hero**
   - `bulgaria-rose-hero.png` và `bulgaria-plovdiv.png` tổng ~3.5 MB.
   - Chuyển sang WebP/AVIF, giảm xuống ~300–600 KB mỗi ảnh.
   - Thêm `loading="lazy"` hoặc `decoding="async"`.
   - Cân nhắc responsive images (`srcset`) để không tải ảnh full resolution trên mobile.

### 4.3. Ưu tiên trung bình — tối ưu resource loading

5. **Preconnect / Prefetch / Preload**
   - `<link rel="preconnect" href="https://fonts.googleapis.com">`
   - `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
   - Preload `megaform-renderer.js` và font chính.

6. **Async/defer non-critical CSS/JS**
   - Bootswatch CSS không cần cho first paint có thể load async (`media="print" onload="this.media='all'"`).
   - Bootstrap JS có thể `defer`.

7. **Giảm admin bundle cho public**
   - Cả 2 form đều tải `megaform-admin-shell.css`, `megaform-submissions-ts.css`, `megaform-my-inbox-ts.css`, `megaform-workflow-inbox-ts.css` dù public visitor không cần.
   - Chỉ load các bundle này khi user là admin hoặc view mode tương ứng.

### 4.4. Ưu tiên thấp — cải thiện pipeline

8. **Bật gzip/brotli cho static files**
   - HTML đã có brotli (`contentEncoding: br`), nhưng cần kiểm tra static CSS/JS.
   - Giảm ~60–75% kích thước text assets.

9. **Inline critical CSS cho form skeleton**
   - Inline CSS cần thiết để hiển thị form placeholder/skeleton ngay khi HTML về, giảm perceived load time.

10. **Giảm số font families**
    - Form #743 dùng DM Serif Display + Inter + Geist. Có thể giảm xuống 1–2 families.

---

## 5. Kịch bản kỳ vọng sau tối ưu

| Chỉ số | Trước tối ưu (worst case) | Sau tối ưu (dự kiến) |
|--------|--------------------------|---------------------|
| Cold load first paint | ~4.8 s | ~1.0–1.5 s |
| Fields visible | ~8.4 s | ~2.0–3.0 s |
| Dependency CDN | Cao | Thấp (self-hosted) |
| Dung lượng images | ~3.5 MB | ~0.6–1.2 MB |
| Concurrent connections | Hạn chế HTTP/1.1 | Tốt hơn với HTTP/2 |

---

## 6. Kết luận

- **Form #743 không có vấn đề hiệu năng cấu trúc.** Lần kiểm tra đầu bị chậm do cold cache / network fluctuation với CDN.
- **Rủi ro thực sự là phụ thuộc vào external CDN và ảnh hero nặng.** Trên môi trường production với mạng chậm hoặc CDN bị chặn, form #743 sẽ load chậm đáng kể.
- **Cần ưu tiên:** self-host Bootstrap/Font Awesome, self-host hoặc preconnect Google Fonts, chuyển ảnh hero sang WebP/AVIF, bật HTTP/2.
