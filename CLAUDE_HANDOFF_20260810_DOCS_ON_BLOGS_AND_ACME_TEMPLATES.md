# Handoff 2026-08-10 — Tài liệu MegaForm chạy trên module Blogs (nhánh DNN) + tích hợp bộ mock ACME

Phiên trước rất dài; file này tự chứa. Đọc §0 rồi §5 là bắt tay được ngay.

---

## 0. Trạng thái trong 30 giây

| | |
|---|---|
| Site thử | **`http://dnn_megafresh.ai`** — DNN **10.3.0 sạch**, cài mới hôm nay |
| Đăng nhập | **`host` / `Dnn@Host2026`** ⚠️ (không phải `dnnhost`) |
| DB | `WINDOWS-11\SQLEXPRESS` / `DNN_MegaFresh`, IIS site+pool `DNN_MegaFresh`, `E:\DNN_SITES\DNN_MegaFresh\Website` |
| Đã cài | **MegaForm 2.0.15** + **MegaForm.Blogs.DNN 1.16.3**, cả hai **bằng gói**, không copy tay |
| Đã phóng | **blog starter** → app `blog-starter`, **AppScope `blog`**, AppId 1 |
| Form đã tạo | **3 = Blog Publishing Starter (posts)** · 4 = Blog Categories · 5 = Blog Comments · 6 = Blog Reader Events |
| Module MegaForm trên Home | **mid 385** (starter cần `moduleId` > 0 nên phải có nó) |
| Site QA cũ | `http://megaclean008.ai` (admin/dnnhost) — vẫn dùng cho hồi quy |

**Việc còn dở**: mới phóng xong starter. **Chưa** dựng trang tài liệu, **chưa** thêm trường cây, **chưa** nhập bài nào.

---

## 1. Câu trả lời "channel" — ĐÃ NGHIÊN CỨU XONG

Module Blogs **không có khái niệm "channel" riêng**. Thứ đóng vai trò đó là **configured app + AppScope**:

- `MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs:38-80` định nghĩa
  `Key="blog"`, **`AppScope = AppProfileScopes.Blog`**, `AppKey="blog-starter"`, `PrimaryFormKey="posts"`,
  và 19 view key (`blog-home`, `blog-archive`, `blog-card`, `blog-detail`, `blog-feed`, `blog-editorial-board`…).
- Phóng bằng **`POST /DesktopModules/MegaForm/API/Starter/Launch`** với body
  `{ starterKey: "blog", moduleId: <mid>, homeUrl: "/" }`.
  ⚠️ **Bắt buộc `moduleId > 0`** (`MegaFormApiController.cs:5630`) — không có module MegaForm trên trang nào thì 400.
  Script sẵn: `qa-out/launch-blog-starter.mjs`.
- Các form của app gắn với nhau **qua `AppScope`**, không qua `ManifestJson.Forms`
  (bẫy cũ đã ghi: `BlogManifestHelper.ResolveFormIdMap` phải fallback theo title).

**⇒ Tạo channel "Docs" = phóng một app thứ hai với scope riêng.** Hai đường:

| cách | việc phải làm | đánh giá |
|---|---|---|
| **A. App riêng `docs-starter`** (`AppScope = "docs"`) | thêm một `Docs()` cạnh `Blog()` trong `ConfiguredAppStarterDefinitions.cs`, thêm case vào switch (`:25-31`), build + deploy `MegaForm.Core`/`MegaForm.DNN` | **Khuyến nghị.** Tách hẳn form, console, analytics; tài liệu không lẫn vào tin tức |
| B. Dùng chung app blog, tách bằng `doc_path` | không cần code C# | nhanh cho bản thử, nhưng lâu dài lẫn lộn feed/analytics/lịch đăng |

Bản thử trên test page **nên đi đường B trước** để chứng minh giao diện, rồi mới nâng lên A.

---

## 2. Vì sao KHÔNG bỏ hẳn DocFX

`Docs/docfx/docfx.json` có khối **`metadata` với `src: "../.."` → `dest: "api"`**: **API reference được sinh từ mã nguồn** mỗi lần build. Đưa nó vào CMS là biến tài liệu tự sinh thành nội dung chép tay, đổi SDK một cái là lệch.

**Kết luận: chuyển 53 bài viết tay sang Blogs; giữ DocFX riêng cho `api/`.**

Số liệu đã đo: **24 bài** (`Docs/docfx/articles`, ~159k ký tự, 20 ảnh) + **29 bài / 133 ảnh** (`../DNN_MegaformDocs-wt`). TOC lồng **2 tầng**.

---

## 3. Thiết kế cây tài liệu (đã chốt hướng, chưa code)

Bài viết blog = **submission của form posts**. Thêm trường vào form đó (đường B) hoặc vào form `docs` (đường A):

| trường | kiểu | vai trò |
|---|---|---|
| `doc_path` | text | **khoá của cây** và là URL: `oqtane/form-builder`. **Cha suy ra bằng cách cắt sau `/` cuối** — rẻ hơn nuôi thêm trường parent và không bao giờ lệch |
| `doc_order` | number | thứ tự trong nhánh (blog đang sort theo `publish_date`; tài liệu thì không) |
| `doc_section` | select | nhánh gốc: Oqtane / DNN / SDK |
| `doc_version` | text | để sau gắn tài liệu với phiên bản sản phẩm |

Bài tài liệu và bài tin tức phân biệt bằng `doc_path` rỗng hay không ⇒ giữ nguyên comment, analytics, lịch đăng.

---

## 4. 🔴 Cải tiến module Blogs — xếp theo thứ tự mở khoá

1. **Bỏ trần 100 bài** *(chặn mọi thứ)*. Renderer công khai hiện **đọc tối đa 100 bài rồi lọc/phân trang trong RAM** (ghi trong `MegaForm.Blogs.DNN/CLAUDE_HANDOFF.md`). Cây tài liệu phải truy vấn theo **tiền tố `doc_path`** và phân trang **ở SQL** — đúng luật bounded-read §11 của `CLAUDE.md`.
2. **Article list / trang chỉ mục** *(owner yêu cầu, thay cho danh mục DocFX)*. Cần **2 thứ**:
   - **sidebar cây** dựng đệ quy từ `doc_path`, giữ nguyên khi chuyển bài, tự mở nhánh đang đọc;
   - **trang chỉ mục của nhánh**: liệt kê bài con + mô tả ngắn, sắp theo `doc_order`, dạng lưới thẻ — **không phải feed theo ngày**.
   Làm như **một lens mới `?view=docs`** trên chính renderer hiện có, đúng cách 6 lens kia đã làm
   (`?category= ?tag= ?author= ?q= ?view=trending ?view=archive`).
3. **`doc_order`** thay `publish_date` làm khoá sắp xếp khi ở chế độ docs.
4. **Prev/next + breadcrumb** — suy ra từ cây, rẻ, và là thứ người đọc tài liệu dùng nhiều nhất.
5. **Nhập Markdown**: editor hiện là **Quill/HTML**, tài liệu là Markdown nhiều **code block** ⇒ cần đường chuyển giữ nguyên khối mã + tô màu cú pháp, nếu không 53 bài vỡ định dạng.
6. **Neo tiêu đề ổn định + viết lại liên kết chéo** `xxx.md` → `/docs/<path>`.
7. **Tìm kiếm giới hạn trong cây** (`?q=` hiện tìm toàn blog).

---

## 5. ⭐ YÊU CẦU MỚI CỦA OWNER — tích hợp trọn bộ UI + template từ mock ACME

**Nguồn:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\ACME-website-Blogs`

Đã kiểm kê (không phải ước lượng):

| | |
|---|---|
| Loại dự án | **Next.js** (`app/`, `components/`, `styles/globals.css` 23.6 KB) — **không phải HTML tĩnh** |
| Tổng route | **109 × `page.tsx`** |
| Bộ mock blog | `app/templates/blog` — **11 nhóm / 26 trang**: `admin, archive, author, category, news, post, recent, search, subscribe, tag, trending` |
| Kho template khác | `app/templates/*` — 27 bộ (corporate 1-3, shop 1-3, startup 1-3, homepage 1-3, medical, law-firm, restaurant, travel, wedding, education, fitness, real-estate, portfolio, architecture, golf…) |
| Thư viện thành phần | `components/` — hero-variants (5), footer-variants (8), landing-layouts (nhiều), blocks/trusted-brands (4), `mega-menu.tsx` **246 KB**, ai-block-builder (4) |

**Yêu cầu:** tích hợp **đầy đủ tính năng UI** và **các template có sẵn** này làm **nguồn mới** cho module Blogs — tức là bộ 26 trang blog phải trở thành template dùng được trong module, không chỉ là ảnh tham chiếu.

### Việc phải làm & bẫy đã biết

- Module Blogs render bằng **DNN Razor Host** (`Portals/_default/Scripts/*.cshtml` → thực tế nằm ở
  `DesktopModules/RazorModules/RazorHost/Scripts/`), **không phải React**. Chuyển Next.js → Razor/HTML
  là công việc chính, giống hệt lô 19 template form đã làm (xem `CLAUDE_HANDOFF_20260809_TEMPLATE_SET_TO_CODEX.md`).
- Module **đã có** cơ chế template: *Template manager* (form 382) + **template gallery** với 2 theme
  `Newsroom` / `Journal` (file thật trong gói, `Templates/newsroom-home.html`, `journal-post.html`…).
  ⇒ **Đổ bộ mock vào đúng cơ chế này**, đừng đẻ cơ chế thứ hai.
- ⭐⭐⭐**RazorHost NUỐT lỗi biên dịch** — render rỗng, vẫn HTTP 200, không log. Sau mỗi deploy **phải fetch trang và đếm phần tử**.
- ⭐⭐⭐**skin DNN style thẳng h1..h6** ⇒ template phải tự khai font trên từng phần tử.
- ⭐⭐**hàm page-block gọi phải nằm TRONG `@functions`** (CS0103 báo ở chỗ gọi).
- ⭐⭐**`@layout` là directive** — đặt tên biến `layout` trong chuỗi sẽ nuốt cả dòng.
- ⭐**`all-posts` không trả `post_uid`**.

---

## 6. Lát cắt đầu tiên nên làm (thứ tự đề nghị)

1. **Dựng trang thử**: thêm 1 trang DNN `/docs` + module **Razor Host** trỏ `MegaFormBlogs.cshtml`;
   thêm trang `/docs-admin` trỏ `MegaFormBlogsAdmin.cshtml` (theo `MegaForm.Blogs.DNN/README.md` bước 4-5).
2. **Thêm 4 trường** `doc_path / doc_order / doc_section / doc_version` vào form 3.
3. **Nhập 8-10 bài** của nhánh *"Using MegaForm on Oqtane"* — đủ để thấy Markdown, code block, liên kết chéo có sống sót không.
4. **Dựng lens `?view=docs`**: sidebar cây + trang chỉ mục (đây là "article list" owner muốn).
5. So cạnh trang DocFX tương ứng bằng ảnh chụp.
6. Chỉ khi 1-5 chạy mới đụng tới 53 bài và bộ mock ACME.

---

## 7. Công cụ & lệnh sẵn có

```powershell
# cài gói lên site (đặt env rồi chạy)
$env:DNN_BASE_URL='http://dnn_megafresh.ai'; $env:DNN_USER='host'; $env:DNN_PASSWORD='Dnn@Host2026'
$env:MEGAFORM_DNN_ZIP='...\MegaForm.Blogs.DNN\Install\MegaForm.Blogs.DNN_01.16.003_Install.zip'
node tools/dnn_live_install_megaform.mjs install

# phóng starter (tạo channel)
node qa-out/launch-blog-starter.mjs http://dnn_megafresh.ai 385

# QA giao diện panel (6 surface, mỗi cái một trang NGUỘI)
node tools/browser-qa/pb-surface-visual-qa.mjs http://dnn_megafresh.ai host "Dnn@Host2026" qa-out/x /

# trang dashboard cũ còn sống không (báo cái NHÌN THẤY ĐƯỢC)
node tools/browser-qa/page-dashboard-health.mjs http://dnn_megafresh.ai host "Dnn@Host2026" /mfqa-admin qa-out/y
```

⚠️ **DNN 10 bắt đổi mật khẩu lần đầu**; token reset nằm ngay trên URL nên đổi được không cần email
(`qa-out/fresh-set-password.mjs`). Mật khẩu portal `admin` **chưa dùng được** — QA bằng `host`.
⚠️ Đăng nhập sai vài lần là DNN **khoá tài khoản**; mở bằng `UPDATE aspnet_Membership SET IsLockedOut=0`.

---

## 8. Còn treo từ phiên này

- 🔶 **Workflow nghiên cứu `wewce6kkl`** (DocFx→Blogs) có thể đã chạy xong sau khi phiên kết thúc; kết quả ở
  `C:\Users\ADMINI~1\AppData\Local\Temp\claude\...\tasks\wewce6kkl.output`. Đọc trước khi thiết kế lại — nó soi
  kiến trúc Blogs, kho DocFx, đường nhập liệu và một mục *phản biện* (vì sao KHÔNG nên chuyển).
- 🔶 **~9 chỗ trong `MegaForm.UI/src` tự gọi `location.reload()` / `window.open()` dựng từ `location.pathname`**
  (khoá form, import app, cài starter, pin-to-page, AI creator) — **không chặn được từ panel** vì không đi qua
  sự kiện click. Phải sửa trong SPA. Owner chưa quyết.
- 🔶 **`MegaForm.Web` không build được**: 8 lỗi ở `Data/EfSubmissionDataStore.cs` (**file chưa git add**, việc
  typed-storage đang dở). Bản vá bảo mật cho Web mới ở mức source.
- 🔶 Lỗi sản phẩm đã ghi nhận: **hai module MegaForm trên cùng một trang admin làm trang dashboard treo**
  "Loading…" (id trùng). Canh bằng `tools/browser-qa/page-dashboard-health.mjs`.
