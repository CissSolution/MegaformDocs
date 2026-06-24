# Dự báo giảm tải & tăng tốc sau khi tối ưu JS — MegaForm

> **Cơ sở:** Số liệu từ `Docs/MEGAFORM_JS_LOAD_AUDIT_2026-06-18.md` (2026-06-18).  
> **Lưu ý:** Các con số là **ước tính lý thuyết**, thực tế phụ thuộc vào mạng, CPU parse/compile, cache, platform và nội dung form cụ thể.

---

## 1. Tình trạng hiện tại (baseline)

| Hạng mục | Raw | Gzip | Số file |
|---|---:|---:|---:|
| Toàn bộ JS trong `Assets/js/` | 14,07 MB | 3,65 MB | 95 |
| Source map `.map` | 39,26 MB | — | 34 |
| **Tổng deploy JS + map** | **53,33 MB** | — | 129 |

### Payload khi admin mở builder (ước tính)

| Thành phần | Raw | Gzip | Ghi chú |
|---|---:|---:|---|
| `bundles/megaform-builder.js` | 5,11 MB | 1,27 MB | Bao gồm Monaco bị nhúng lại |
| `builder/megaform-workflow-reactflow.js` | 235 KB | 61 KB | Loader eager inject |
| `megaform-ai-form-assistant.js` | 165 KB | 52 KB | Loader eager inject |
| Tất cả widget plugins (38 file) | 1,21 MB | 287 KB | Loader eager inject toàn bộ |
| React/ReactDOM/ReactFlow UMD | 298 KB | ~100 KB | `builder/react.*`, `reactflow.min.js` |
| `Sortable.min.js` + `megaform-widgets.js` | 47 KB | ~13 KB | — |
| Builder CSS (3 file) | 305 KB | 60 KB | — |
| **Tổng payload builder initial** | **~7,2 MB** | **~1,8 MB** | Chưa tính fonts, i18n non-en, images |

### Payload khi khách/admin xem form công khai trên DNN (admin đăng nhập)

Hiện tại DNN vẫn eager load `bundles/megaform-builder.js` 5,1 MB trên trang render. Ước tính:

| Thành phần | Gzip | Ghi chú |
|---|---:|---|
| `bundles/megaform-builder.js` | 1,27 MB | Không cần thiết khi chỉ render form |
| Renderer + i18n + CSS | ~200 KB | — |
| Plugins theo schema | ~50–300 KB | Tùy form |
| **Tổng hiện tại** | **~1,5–1,7 MB** | Chỉ do DNN eager-load builder |
| **Tổng sau khi sửa** | **~150–300 KB** | Chỉ renderer + i18n + plugins cần thiết |

---

## 2. Dự báo sau tối ưu

### 2.1. Externalize Monaco + lazy load

| Chỉ số | Trước | Sau | Giảm |
|---|---:|---:|---:|
| `bundles/megaform-builder.js` raw | 5,11 MB | ~1,2 MB | **~76%** |
| `bundles/megaform-builder.js` gzip | 1,27 MB | ~280 KB | **~78%** |

Giải thích: Monaco (~3,9 MB raw / ~990 KB gz) sẽ chỉ tải khi user mở tab Source/Code editor. Lần đầu mở editor vẫn tải ~990 KB gz, nhưng đó là **lazy** và chỉ một lần cho cả phiên.

### 2.2. Lazy load workflow ReactFlow + AI assistant trong builder

| Thành phần | Gzip | Sau khi lazy | Tiết kiệm |
|---|---:|---:|---:|
| `megaform-workflow-reactflow.js` | 61 KB | 0 KB (initial) | 61 KB |
| `megaform-ai-form-assistant.js` | 52 KB | 0 KB (initial) | 52 KB |
| **Tổng** | **113 KB** | **0 KB** | **113 KB** |

### 2.3. Giảm plugin preload trong builder

| Chỉ số | Hiện tại | Sau khi lazy |
|---|---:|---:|
| Tất cả 38 plugins raw | 1,21 MB | ~100–200 KB (palette + registry) |
| Tất cả 38 plugins gzip | 287 KB | ~30–50 KB |
| **Tiết kiệm gzip** | — | **~240 KB** |

### 2.4. Tắt sourcemap production

| Hạng mục | Hiện tại | Sau khi tắt | Giảm |
|---|---:|---:|---:|
| Dung lượng deploy | 53,33 MB | ~14 MB | **~74%** |

**Tác động page load:** Source map chỉ tải khi DevTools mở, nên **FCP/TTI trực tiếp không đổi**. Tuy nhiên giảm đáng kể thởi gian deploy, disk usage, và số file cần sync.

### 2.5. DNN không eager-load builder trên trang render

| Scenario | Gzip hiện tại | Gzip sau | Giảm |
|---|---:|---:|---:|
| Admin xem form công khai trên DNN | ~1,5–1,7 MB | ~150–300 KB | **~80–90%** |

---

## 3. Tổng hợp dự báo builder initial load

| Metric | Hiện tại | Sau P0+P1 tối ưu | Giảm |
|---|---:|---:|---:|
| **JS raw** | ~7,2 MB | ~1,7 MB | **~76%** |
| **JS gzip** | ~1,8 MB | ~0,4 MB | **~78%** |
| **Số request JS/CSS blocking** | ~25 | ~8–10 | **~60%** |

### Ước tính thởi gian tải trên mạng

Giả sử chỉ tính JS gzip, chưa tính parse/compile:

| Mạng | Tốc độ | Hiện tại (~1,8 MB) | Sau tối ưu (~0,4 MB) | Cải thiện |
|---|---|---:|---:|---:|
| 4G trung bình | 4 Mbps | ~3,6 giây | ~0,8 giây | **~2,8 giây** |
| 3G trung bình | 1 Mbps | ~14,4 giây | ~3,2 giây | **~11,2 giây** |
| Fiber / LAN | 50 Mbps | ~0,29 giây | ~0,06 giây | **~0,23 giây** |

### Ước tính parse/compile trên thiết bị di động tầm trung

- 5 MB JS raw cần ~300–600 ms parse/compile trên điện thoại tầm trung.
- Giảm xuống ~1,2 MB (không tính Monaco) → ~80–150 ms.
- **Cải thiện TTI ước tính: 200–450 ms**.

---

## 4. Dự báo theo scenario

### Scenario A: Admin mở Builder lần đầu

| Giai đoạn | Hiện tại | Sau tối ưu | Ghi chú |
|---|---|---|---|
| Tải HTML/CSS shell | — | — | Không đổi |
| Tải JS khởi tạo builder | ~1,8 MB gz | ~0,4 MB gz | Monaco/AI/workflow/plugin lazy |
| Parse/compile | ~300–600 ms | ~80–150 ms | Giảm theo dung lượng |
| First paint builder | chậm | nhanh hơn rõ rệt | — |
| Mở Code editor (lần đầu) | 0 | ~990 KB gz | Monaco lazy load |
| Mở AI chat (lần đầu) | 0 | ~52 KB gz | AI lazy load |
| Mở FLOW tab (lần đầu) | 0 | ~61 KB gz | ReactFlow lazy load |

### Scenario B: Khách xem form công khai trên DNN (admin đăng nhập)

| Giai đoạn | Hiện tại | Sau tối ưu | Ghi chú |
|---|---|---|---|
| Tải builder bundle eager | 1,27 MB gz | 0 | Không load builder |
| Tải renderer + i18n + plugins cần thiết | ~200 KB | ~150–300 KB | — |
| **Tổng JS gz** | **~1,5 MB** | **~150–300 KB** | **Giảm ~80–90%** |

### Scenario C: Production deploy / CI artifact

| Hạng mục | Hiện tại | Sau tối ưu | Giảm |
|---|---:|---:|---:|
| Tổng dung lượng JS + map | 53,33 MB | ~14 MB | **~74%** |
| Số file deploy | 129 | ~95 | **~26%** |

---

## 5. Lưu ý & rủi ro

1. **Monaco lazy trade-off:** Lần đầu mở code editor sẽ có độ trễ ~1 giây trên 4G để tải Monaco. Đây là đánh đổi hợp lý vì không phải ai cũng mở editor.
2. **Plugin lazy trade-off:** Khi kéo widget mới vào canvas lần đầu, có thể cần tải plugin. Nên preload plugin cho các widget trong palette (hoặc dùng `prefetch`).
3. **Cache:** Nếu ngườii dùng đã cache Monaco/AI/workflow từ lần dùng trước, tải lại = 0. HTTP cache-control cần được đặt đúng.
4. **CPU không giảm tuyến tính:** Việc giảm JS size giúp parse/compile, nhưng nếu code vẫn chạy nhiều logic nặng (React render, state lớn), TTI còn phụ thuộc vào optimization runtime.
5. **Số liệu gzip là ước tính:** Khi tách chunk, tổng gzip có thể tăng nhẹ do overhead chunk nhỏ, nhưng vẫn nhỏ hơn rất nhiều so với việc tải toàn bộ.

---

## 6. Kết luận

| Tối ưu | Giảm dung lượng gzip | Giảm thởi gian tải 4G | Ưu tiên |
|---|---:|---:|---|
| Externalize + lazy Monaco | ~990 KB | ~2,0 giây | 🔴 P0 |
| DNN không eager-load builder | ~1,27 MB | ~2,5 giây | 🔴 P0 |
| Lazy AI assistant + workflow | ~113 KB | ~0,23 giây | 🟡 P1 |
| Lazy plugin preload | ~240 KB | ~0,48 giây | 🟡 P1 |
| Tắt sourcemap production | 39 MB deploy | Không đổi FCP | 🟡 P1 |
| `defer`/`async` scripts | Giảm blocking | Cải thiện FP | 🟢 P2 |

**Tổng kết:** Nếu thực hiện đầy đủ P0+P1, **payload khởi tạo builder có thể giảm từ ~1,8 MB xuống ~0,4 MB gzip (~78%)**, và **DNN render page có thể giảm từ ~1,5 MB xuống ~150–300 KB (~80–90%)**. Trên mạng 4G trung bình, đây là cải thiện **2–3 giây** cho lần đầu tải, cộng thêm **200–450 ms** giảm parse/compile trên mobile.
