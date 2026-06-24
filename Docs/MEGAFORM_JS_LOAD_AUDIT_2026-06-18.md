# Báo cáo audit cách load JavaScript & hiệu năng bundle — MegaForm

> **Phạm vi:** Toàn bộ pipeline build và cách inject JS khi render form trên Oqtane, DNN, Web (AspNetCore), Umbraco, HTML embed.  
> **Mục tiêu:** Đánh giá tối ưu chưa, tìm bundle quá lớn, chỉ ra anti-pattern, đề xuất cải thiện. **Không sửa code.**  
> **Ngày audit:** 2026-06-18.

---

## 1. Tóm tắt cấp cao

Tổng dung lượng JS trong thư mục deploy chính `Assets/js/`:

| Hạng mục | Dung lượng | Ghi chú |
|---|---:|---|
| Tất cả file `.js`/`.mjs` (raw) | **14,07 MB** | 95 file |
| Tất cả file `.js`/`.mjs` (gzip) | **3,65 MB** | — |
| Source map `.map` | **39,26 MB** | 34 file, gấp ~2,8 lần JS raw |
| **Tổng JS + map** | **~53 MB** | Nặng hơn mức cần thiết cho production |

**Vấn đề nghiêm trọng nhất:** `bundles/megaform-builder.js` hiện **5,1 MB raw / 1,27 MB gz**, trong đó có **~3,9 MB là Monaco Editor bị nhúng sai cách**. `monaco-editor` vừa có bundle riêng (`megaform-unified-monaco.js` 3,9 MB), vừa bị Vite inline vào builder bundle do thiếu cấu hình `external`.

**Vấn đề thứ hai:** Builder không thực sự lazy-load. Khi admin mở builder, browser phải tải ~20 plugin JS/CSS, React/ReactDOM/ReactFlow, AI assistant, workflow ReactFlow, rồi mới đến builder bundle 5 MB.

**Điểm tốt:** Renderer (form công khai) chỉ load plugin theo `field.type` trong schema — đây là lazy load có ý nghĩa. i18n locale non-en cũng lazy fetch + cache.

---

## 2. Top bundle & kích thước

### 2.1. Top 20 file JS lớn nhất (`Assets/js/`)

| # | File | Raw | Gzip | Nhận xét |
|---:|---|---:|---:|---|
| 1 | `bundles/megaform-builder.js` | **5,11 MB** | **1,27 MB** | IIFE gộp toàn bộ builder + Monaco bị nhúng lại |
| 2 | `megaform-unified-monaco.js` | **3,90 MB** | **990 KB** | Monaco standalone — đáng lẽ chỉ cần file này |
| 3 | `megaform-dashboard.js` | 312 KB | 96 KB | Admin shell + report + embed modal |
| 4 | `megaform-submissions.js` | 295 KB | 87 KB | Submissions table, bulk actions, card/list |
| 5 | `builder/megaform-workflow-reactflow.js` | 235 KB | 61 KB | ReactFlow bundle đã tách riêng |
| 6 | `megaform-renderer.js` | 201 KB | 61 KB | Renderer chính, chứa ~50 state US + validation |
| 7 | `megaform-listview.js` | 166 KB | 46 KB | List view runtime |
| 8 | `megaform-ai-form-assistant.js` | 165 KB | 52 KB | AI chat/providers/ops |
| 9 | `megaform-my-inbox.js` | 161 KB | 47 KB | Workflow inbox (mới restore entry) |
| 10 | `bundles/megaform-renderer.js` | 161 KB | 32 KB | **Bundle cũ chưa minify**, cần dọn |
| 11 | `builder/reactflow.min.js` | 155 KB | 49 KB | ReactFlow UMD |
| 12 | `builder/react-dom.production.min.js` | 132 KB | 42 KB | ReactDOM UMD |
| 13 | `megaform-admin-live.js` | 119 KB | 34 KB | Live style editor |
| 14 | `megaform-workflow-inbox.js` | 110 KB | 31 KB | Workflow inbox legacy? |
| 15 | `megaform-languages.js` | 110 KB | 33 KB | Language Manager UI |
| 16 | `megaform-settings-popup.js` | 102 KB | 25 KB | Module settings popup |
| 17 | `plugins/megaform-widget-data-repeater.js` | 97 KB | 22 KB | Widget plugin |
| 18 | `plugins/megaform-widget-pdf-form.js` | 89 KB | 25 KB | PDF form widget |
| 19 | `builder/megaform-workflow-canvas.js` | 88 KB | 19 KB | Legacy chunk, chưa minify |
| 20 | `megaform-theme-designer.js` | 86 KB | 24 KB | Theme designer standalone |

### 2.2. Tiêu chí "quá lớn"

Định nghĩa: raw > 500 KB **hoặc** gzip > 150 KB.

| File | Raw | Gzip | Lý do lớn |
|---|---:|---:|---|
| `bundles/megaform-builder.js` | 5,11 MB | 1,27 MB | Gộp builder core, designers, rule engine, theme, gallery, Monaco |
| `megaform-unified-monaco.js` | 3,90 MB | 990 KB | Monaco editor (HTML/CSS/JSON/TS workers) — chấp nhận được nếu lazy |

**Nhận xét:** Nếu externalize Monaco khỏi builder, builder bundle sẽ giảm từ **5,1 MB → ~1,2 MB raw**, gzip từ **1,27 MB → ~300 KB**.

---

## 3. Cách load JS trên từng nền tảng

### 3.1. Bảng so sánh

| Tiêu chí | Oqtane | DNN | Web | Umbraco | HTML embed |
|---|---|---|---|---|---|
| **Cơ chế inject** | Oqtane `Resource` API | `ClientResourceManager.RegisterScript` | Thẻ `<script>` tĩnh | Thẻ `<script>` tĩnh | `document.createElement('script')` động |
| **Builder load** | `megaform-builder-loader.js` (14 KB) lazy | `bundles/megaform-builder.js` (5,1 MB) eager | Không load builder | Không load builder | Không load builder |
| **Renderer load** | `megaform-renderer.js` | `megaform-renderer.js` | `megaform-renderer.js` | `megaform-renderer.js` | Qua `megaform-embed.js` |
| **Plugins** | Schema-based (public) / toàn bộ (admin) | Schema-based (public) / scan toàn bộ (admin) | `Model.PluginScripts` toàn bộ | **Không hỗ trợ** | Không |
| **i18n load** | `megaform-i18n.js` | `megaform-i18n.js` + locale legacy | `megaform-i18n.js` | **Không load** | Không |
| **Async/Defer** | ❌ Không | ❌ Không | ❌ Không | ❌ Không | ❌ Không |
| **Preload/Prefetch** | ❌ Không | ❌ Không | ⚠️ `preconnect` fonts gstatic thiếu | ❌ Không | ❌ Không |
| **SRI** | ❌ Không | ❌ Không | ❌ Không | ❌ Không | ❌ Không |
| **Lazy loading** | Có (builder-loader, dashboard AI) | Chỉ list/card/listview conditional | Không | Không | Không |
| **Đánh giá** | ⭐⭐⭐ Trung bình | ⭐⭐ Yếu | ⭐⭐⭐ Trung bình | ⭐⭐ Yếu | ⭐⭐ Yếu |

### 3.2. Chi tiết theo nền tảng

#### Oqtane (`MegaForm.Oqtane.Client/Index.razor`)

- Dùng Oqtane `Resource` API inject script/stylesheet.
- Có phân biệt `IsAdminOnlyAsset` / `IsLightLoadContext`.
- `megaform-builder-loader.js` được load, sau đó loader mới inject `bundles/megaform-builder.js` → **tốt hơn DNN**.
- Tuy nhiên anonymous visitor vẫn nạp nhiều CSS/JS admin-shell dù sau đó bị filter.
- Không có `async`/`defer`; boot script chạy qua `Js.InvokeVoidAsync("eval", ...)`.
- `data-mf-locale` chỉ có trên 2 root (`#mf-myinbox-root`, `#mf-languages-root`), root form renderer thiếu.

#### DNN (`MegaForm.DNN/Views/FormView.ascx.cs`)

- `ClientResourceManager.RegisterScript` với priority — load synchronous, blocking.
- **Admin shell trên trang render** nạp `bundles/megaform-builder.js` 5,1 MB chỉ vì admin đăng nhập, dù không mở builder (dòng ~452, ~547).
- `RegisterPluginScripts` scan toàn bộ `/Assets/js/plugins/` (~38 file) cho admin context (dòng ~1482–1498) → eager load vô điều kiện.
- `RegisterPluginStyles` tương tự scan `/Assets/css/plugins/`.
- CDN Google Fonts + Font Awesome không `integrity`.

#### Web (`MegaForm.Web/Views/Form/View.cshtml`)

- Load liên tiếp: i18n → widgets → plugins → rule-engine → renderer. Tất cả synchronous.
- Load **toàn bộ** `Model.PluginScripts` không điều kiện, dù schema chỉ cần 1–2 widget.
- `Form/View.cshtml` làm đúng culture bridge (`data-mf-locale`, `lang`), nhưng các admin `.cshtml` khác vẫn hardcode và chưa tối ưu.

#### Umbraco (`MegaForm.Umbraco/Views/MegaFormView.cshtml`)

- Chỉ phân biệt submit vs views.
- **Không load** `megaform-i18n.js`, `megaform-rule-engine.js`, không hỗ trợ plugin.
- Gọi `MegaForm.init(...)` inline ngay sau thẻ script, có thể chạy trước khi script load xong.
- Các `wwwroot/js/*.js` là bản sao bundle chung → chứa nhiều hardcode và lỗi thởi.

#### HTML embed (`Assets/embed.html`, `embed-preview.html`)

- `megaform-embed.js` nhỏ (~16 KB), nhưng hardcode đường dẫn DNN (`/DesktopModules/MegaForm/Assets/js/...`).
- Dùng `setInterval(..., 200)` để resize iframe — nên thay bằng `ResizeObserver`.
- Thiếu `preconnect`, `SRI`.

---

## 4. Phân tích duplicate & stale files

### 4.1. Monaco Editor bị nhúng 2 lần

| File | Số lần xuất hiện `monaco-editor` |
|---|---|
| `megaform-unified-monaco.js` | ~790 |
| `bundles/megaform-builder.js` | ~792 |

**Nguyên nhân:**
- `vite.config.ts` **không có entry `unified-monaco`**.
- `monaco-editor` **không được externalize** trong `rollupOptions`.
- `inlineDynamicImports: true` khiến `import('monaco-editor')` trong adapter bị inline vào entry gọi nó.
- `src/builder/index.ts` import `megaform-widget-user-template-launcher.ts` → import adapter → import Monaco → Monaco bị nhét vào builder bundle.

**Hệ quả:** builder bundle phình to ~3,9 MB không cần thiết.

### 4.2. `bundles/megaform-renderer.js` cũ

| | `Assets/js/megaform-renderer.js` | `Assets/js/bundles/megaform-renderer.js` |
|---|---|---|
| Raw | 201 KB | 161 KB |
| Gzip | 61 KB | 32 KB |
| Minified | ✅ | ❌ (có `var __awaiter`) |
| Source map | ✅ | ❌ |
| Dòng | 12 | 3.098 |

→ File trong `bundles/` là phiên bản cũ chưa minify. Nên xác nhận reference và xóa.

### 4.3. Legacy chunks `Assets/js/builder/megaform-builder-*.js`

- Các file `megaform-builder-core.js`, `megaform-builder-dom.js`, `megaform-builder-canvas.js`, ... là **legacy chunks từ 2026-04-21**, chưa minify.
- `bundles/megaform-builder.js` mới **không embed** các chunk này (kiểm tra fingerprint dòng đầu).
- Các file này chiếm ~800 KB–1,2 MB và **không còn được loader sử dụng**.

### 4.4. React / ReactDOM

- React bị **inline vào builder bundle** (~400 `createElement` → React + ReactDOM nằm trong bundle).
- React cũng được ship riêng qua `builder/react.production.min.js` + `react-dom.production.min.js` + `reactflow.min.js` cho workflow canvas.
- Nếu workflow canvas luôn load cùng builder, xem xét externalize React để dùng chung file UMD.

### 4.5. i18n không duplicate nghiêm trọng

- `megaform-i18n.js` 53 KB raw được load như runtime dependency.
- Các bundle khác tham chiếu `MegaFormI18n` nhưng không chứa toàn bộ catalog.

---

## 5. Cấu hình build Vite (`MegaForm.UI/vite.config.ts`)

| Thiết lập | Giá trị | Đánh giá |
|---|---|---|
| `build.rollupOptions.output.format` | `iife` | Phù hợp DNN/Oqtane |
| `build.rollupOptions.output.inlineDynamicImports` | `true` | ❌ Phá lazy load; mọi `import()` bị inline |
| `build.rollupOptions.output.manualChunks` | **không có** | ❌ Không chia vendor/feature |
| `build.minify` | `esbuild` | ⚠️ Nhanh; terser dead-code tốt hơn |
| `build.sourcemap` | `true` | ⚠️ Production ship ~39 MB map |
| `build.emptyOutDir` | `false` | ⚠️ Giữ file cũ/stale |
| `chunkSizeWarningLimit` | **không set** | 🟡 Mặc định 500 KB |
| `external` / `globals` | **không có** | ❌ Monaco không được externalize |
| `vite-plugin-compression` / `rollup-plugin-visualizer` | **không có** | ❌ Không có phân tích bundle |

### Entry map hiện tại

```ts
const entries = {
  'theme-designer': ..., 'theme-inspector': ...,
  'builder-loader': ..., 'config': ..., 'builder': ...,
  'ai-form-assistant': ..., 'submissions': ..., 'my-inbox': ...,
  'views': ..., 'renderer': ..., 'widgets': ..., 'i18n': ...,
  'embed': ..., 'presets': ..., 'admin-live': ...,
  'dashboard': ..., 'languages': ..., 'dnn-host': ..., 'workflow': ...,
};
```

**Thiếu entry:** `unified-monaco` (comment trong source nói đã bị revert tháng 4 và chưa restore).

### Build output

- Mỗi entry build ra **một file IIFE duy nhất**.
- Không có shared chunks giữa các entry.
- `syncPlatforms` tự động copy JS sang `Assets/`, `MegaForm.Web/wwwroot/megaform/`, `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm`.

---

## 6. Cơ chế lazy loading / dynamic import

### 6.1. Đã lazy (tốt)

| Khu vực | Cơ chế |
|---|---|
| **Renderer widgets** | Server chỉ inject plugin tương ứng `field.type` trong schema (DNN `FormView.ascx.cs`, Web/Oqtane controller). |
| **i18n locale non-en** | `loadLocale()` fetch JSON + cache `localStorage`; `en-US` inline. |
| **PDF.js** | Chỉ load từ CDN khi mở PDF Form Builder. |
| **Dashboard AI creator** | `openAiFormCreator` inject script `megaform-ai-form-assistant.js` động. |

### 6.2. Chưa lazy / eager vô điều kiện

| Khu vực | Vấn đề |
|---|---|
| **Builder loader** | Load ~20 plugin JS/CSS, AI assistant, workflow ReactFlow trước khi khởi chạy builder. |
| **Builder designers** | ImageChoice, Slider, Map, Token, Video, Composite, Theme, Rule builder import đồng bộ trong `src/builder/index.ts`. |
| **Workflow ReactFlow** | Bundle tách riêng nhưng loader vẫn eager inject khi mở builder, dù chưa vào FLOW tab. |
| **Monaco Editor** | Bị inline vào builder bundle; không lazy dù có file standalone. |

### 6.3. Dynamic import bị vô hiệu hóa

`vite.config.ts`:

```ts
output: {
  format: 'iife',
  inlineDynamicImports: true,
}
```

Do đó các `import()` trong cùng entry không tạo chunk riêng. Ví dụ:

| File | Dòng | Vấn đề |
|---|---|---|
| `widgets/plugins/megaform-widget-user-template-launcher.ts` | ~275 | `await import('../../view-designer/shared/monaco-editor-adapter')` kéo Monaco vào builder. |
| `view-designer/shared/monaco-editor-adapter.ts` | ~129 | `import('monaco-editor')` bị inline. |
| `submissions/SubmissionsShell.ts` | ~1252 | `await import('../my-inbox/standalone-detail')` không tách chunk. |

---

## 7. Tác động đến hiệu năng

| Chỉ số | Ảnh hưởng |
|---|---|
| **First Paint / FCP** | Builder delay nghiêm trọng do ~25 request JS/CSS blocking trước render. Renderer tốt hơn. |
| **Time to Interactive (TTI)** | **Cao.** `megaform-builder.js` 5 MB cần parse/compile lâu, đặc biệt mobile. |
| **Network payload** | Admin mở builder tải ~6–7 MB JS raw ngay lập tức (builder + Monaco duplicate + plugins + React). |
| **Memory footprint** | Widget registry bind toàn bộ plugin, AI provider init sớm, Monaco parse sớm. |
| **Production deploy** | JS + source map ~53 MB, chưa kể CSS/images. |

---

## 8. Khuyến nghị ưu tiên

### 🔴 P0 — Tác động lớn, làm ngay

1. **Khôi phục entry `unified-monaco`** trong `vite.config.ts`.
2. **Externalize `monaco-editor`** khỏi mọi entry khác:
   ```ts
   rollupOptions: {
     external: ['monaco-editor'],
     output: { globals: { 'monaco-editor': 'MegaFormMonaco' } }
   }
   ```
3. **Load `megaform-unified-monaco.js` lazy** chỉ khi mở source/template/code editor.
4. **Tắt sourcemap cho production build** hoặc upload map riêng cho error-tracking:
   ```ts
   build: { sourcemap: process.env.NODE_ENV !== 'production' }
   ```
5. **DNN: đừng load `bundles/megaform-builder.js` trên trang render** khi admin chỉ xem form. Chỉ load khi URL/route thực sự cần builder (giống Oqtane dùng loader).

### 🟡 P1 — Cải thiện bundle & loading

6. **Lazy load workflow ReactFlow** trong builder: chỉ inject khi user click tab FLOW.
7. **Lazy load AI assistant trong builder**: giống dashboard, chỉ load khi bật chat.
8. **Giảm plugin preload trong builder**: chỉ load registry/palette trước; widget plugin lazy khi kéo vào canvas.
9. **Code-split designers**: ImageChoice, Slider, Map, Token, Video, Theme, Rule builder nên là chunk riêng.
10. **Thêm `defer`/`async`/`type="module"`** cho non-critical scripts trên Web/DNN/Umbraco.
11. **Thêm `preconnect`** tới `fonts.gstatic.com` và Font Awesome CDN; cân nhận `SRI`.
12. **Thêm `rollup-plugin-visualizer`** hoặc `vite-bundle-analyzer` để audit định kỳ.
13. **Tạo `.gz`/`.br` pre-compressed** với `vite-plugin-compression` nếu host hỗ trợ.

### 🟢 P2 — Dọn dẹp & best practices

14. **Xóa `Assets/js/bundles/megaform-renderer.js` cũ** sau khi xác nhận không còn reference.
15. **Xóa/di chuyển legacy chunks** `Assets/js/builder/megaform-builder-*.js`.
16. **Xóa `megaform-unified-monaco.js` cũ** nếu đã rebuild.
17. **Xử lý CSS import từ TS**: `pdf-form-builder/index.ts` import `./styles.css`; `syncPlatforms` cần copy cả CSS sinh ra từ Vite.
18. **Thống nhất build pipeline**: tránh 4–5 bản sao cùng bundle trong solution (gây version skew).
19. **HTML embed**: thay `setInterval` resize bằng `ResizeObserver`; hỗ trợ đường dẫn động theo host.
20. **Umbraco**: bổ sung `megaform-i18n.js`, `megaform-rule-engine.js`, plugin manifest, đảm bảo DOM ready trước khi init.

---

## 9. Kết luận

MegaForm có kiến trúc entry-based phù hợp để deploy đa nền tảng, và renderer form công khai đã lazy load plugin theo schema một cách hợp lý. Tuy nhiên, **builder bundle đang bị phình to nghiêm trọng (5,1 MB) do Monaco Editor bị nhúng trùng và thiếu lazy loading thực sự**. DNN còn tải toàn bộ builder bundle trên mọi trang render khi admin đăng nhập, gây ảnh hưởng hiệu năng rõ rệt.

**Hành động khẩn cấp nhất:**
1. Externalize Monaco và lazy load nó.
2. Tắt sourcemap production.
3. Ngăn DNN eager-load builder bundle trên trang render.
4. Thêm defer/async và lazy load workflow/AI/plugins trong builder.

Nếu thực hiện 4 hành động trên, tổng payload JS khi admin mở builder có thể giảm từ ~6–7 MB xuống còn ~2 MB, và first paint sẽ cải thiện đáng kể.

---

*Kết thúc báo cáo. Không có thay đổi code nào được thực hiện.*
