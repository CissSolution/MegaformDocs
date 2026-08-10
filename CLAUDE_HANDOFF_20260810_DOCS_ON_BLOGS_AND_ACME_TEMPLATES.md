# Handoff 2026-08-10 — Tài liệu MegaForm chạy trên module Blogs (DNN) + tích hợp mock ACME

Bản **v2**: đã gộp kết quả nghiên cứu (workflow `wewce6kkl`, 7 agent) và **2 ràng buộc mới của owner**.
Đọc §0 → §1 → §2 là bắt tay được ngay.

---

## 0. Trạng thái trong 30 giây

| | |
|---|---|
| Site thử | **`http://dnn_megafresh.ai`** — DNN **10.3.0 sạch** |
| Đăng nhập | **`host` / `Dnn@Host2026`** ⚠️ (không phải `dnnhost`) |
| DB | `WINDOWS-11\SQLEXPRESS` / `DNN_MegaFresh`, IIS site+pool `DNN_MegaFresh`, `E:\DNN_SITES\DNN_MegaFresh\Website` |
| Đã cài | **MegaForm 2.0.15** + **MegaForm.Blogs.DNN 1.16.3**, cả hai **bằng gói** |
| Đã phóng | **blog starter** → app `blog-starter`, **AppScope `blog`**, AppId 1 |
| Form | **3 = posts** · 4 = Categories · 5 = Comments · 6 = Reader Events |
| Module MegaForm trên Home | **mid 385** |

**Việc còn dở**: mới phóng starter. Chưa dựng trang tài liệu, chưa thêm trường cây, chưa nhập bài.

### ⛔ HAI RÀNG BUỘC OWNER ĐẶT NGÀY 10-08 (ghi đè mọi thiết kế cũ)

1. **CHỈ sửa module Blogs News (`MegaForm.Blogs.DNN`). KHÔNG đụng MegaForm** (Core / DNN / Oqtane / SDK).
2. **Phải soi cơ chế lưu trữ đã tối ưu tốc độ + RAM chưa** → §2 là câu trả lời, có số đo.

Ràng buộc 1 **giết** phương án chính của bản nghiên cứu (thêm form + named query vào
`ConfiguredAppStarterDefinitions.cs` rồi reseed). §1 là đường thay thế, đã kiểm chứng bằng API thật.

---

## 1. Làm được gì khi KHÔNG được sửa MegaForm

Module là script Razor Host gọi `MegaForm.Sdk` — nên "chỉ sửa module" = chỉ được dùng những gì SDK đã phơi ra.
Đã đọc `MegaForm.Sdk/IMegaFormClient.cs` để chốt ranh giới:

| Việc | Làm được? | Bằng gì |
|---|---|---|
| Tạo form mới (schema tuỳ ý) | ✅ | `Forms.CreateFormAsync` — **đúng cách form 382/383/384 ra đời**, console tự tạo lúc chạy |
| Thêm/sửa trường của form có sẵn | ✅ | `Forms.UpdateFormAsync(formId, new UpdateFormRequest{ SchemaJson = … })` (`IMegaFormClient.cs:132`) — sửa **dữ liệu** schema, không phải sửa mã Core |
| Đọc hàng loạt bản ghi | ✅ | `SubmissionDashboard.SearchAsync` — **1 câu SQL**, phân trang thật, **trả kèm `DataJson`** (§2.3) |
| Đọc 1 bản ghi typed | ✅ | `Records.GetRecordAsync` |
| Ghi | ✅ | `Submissions.SubmitAsync` / `Records.PatchRecordAsync` (patch **mirror lại DataJson**, `MegaFormClient.cs:562`) |
| **Named query mới** (`doc-nav`, sort theo `doc_sort_key`…) | ❌ | Định nghĩa nằm trong app definition ở Core, `AppQueryRequest` **không có** thuộc tính sort |
| **Đổi trần 500 / phân trang trong SQL của named query** | ❌ | `AppRecordQueryService` là Core |

**Hệ quả thiết kế (chốt):**

- Docs pages đặt ở **form riêng do console tạo** (`Forms.CreateFormAsync`), **không** nhét thêm vào form posts
  → có ngân sách đọc riêng, không dính `BlogAnalyticsRollupService`, không phải nhận 5 trường Select bắt buộc của blog.
- Đọc bằng **`SubmissionDashboard.SearchAsync` + `DataJson` của chính hàng list** (§2.3), **không** dùng named query,
  **không** lặp `GetRecordAsync` từng dòng.
- Sắp xếp cây **tự làm trong module** bằng `StringComparer.Ordinal` trên `doc_sort_key` → tránh luôn cái bẫy
  `SortValue` của Core (thử decimal trước string ⇒ `0010.0020` thành số, `0010.0020.0030` thành chuỗi, comparer
  ném *"Failed to compare two elements in the array"* — chính lỗi từng làm trắng blog Oqtane).
  **Vẫn giữ luật: dấu nối là `/`, tuyệt đối không dùng `.`**

---

## 2. 🔴 AUDIT LƯU TRỮ: tốc độ & RAM — **CHƯA tối ưu**

Đã vá một nửa hồi 07-08 (batch typed reader + chạy song song), nhưng **hình dạng cơ bản vẫn là "đọc 500 dòng
rồi lọc trong RAM"**, cộng nhiều vòng N+1 và gần như **không cache**.

### 2.1 Một lần gọi named query tốn bao nhiêu (đo từ mã, không đoán)

`AppRecordQueryService.Execute` (`MegaForm.Core/Services/AppRecordQueryService.cs:61-68`) gọi
`_submissions.List(formId, null, null, null, null, 0, MaxSourceRecords)` — **bỏ qua Page/PageSize của lời gọi**:

1. `usp_MF_Submission_List` — `SELECT s.*` (⚠️ **kèm cả cột `DataJson`**) `OFFSET 0 FETCH NEXT 500`
2. `SELECT COUNT(*)` (result set thứ hai)
3. Batch typed: **7 câu** — 1 `MF_SubmissionFields` + 6 bảng giá trị
   (`String/LongText/Number/Date/Boolean/Json`), `DnnSubmissionDataStore.cs:288-315`

⇒ **~9 round trip + tối đa 500 bản ghi vật chất hoá**, dù chỉ cần in 12 thẻ. Lọc/tìm/sắp xếp **toàn bộ bằng LINQ
trong RAM**; `records.ToList()` rồi mới `Skip/Take` (`:115-124`) — đúng cái *in-memory pagination* mà §11
`CLAUDE.md` cấm, nhưng nó nằm ở Core nên **ngoài tầm sửa lần này**.

### 2.2 Một lượt xem trang tốn bao nhiêu

| Trang | Named query | Round trip ước tính | Bản ghi vào RAM |
|---|---|---|---|
| `/Blogs` (danh sách) | **3** — `public-posts` (trang) + `featured-posts` + `public-posts` (100, chỉ để lấy chip category) | **~27** | **~1.500** để in 12 thẻ |
| `/Blogs?slug=x` | **2** — `public-posts` `PageSize=1` (**server vẫn đọc 500 rồi lọc còn 1**) + pool related `PageSize=100` (**lại 500**) | ~18 + comments + child | ~1.000 |

Hai trong ba câu ở trang chủ là **cùng một named query** (`MegaFormBlogs.cshtml:1217` và `:1222`) — câu thứ ba
chỉ để rút danh sách category, hoàn toàn suy được từ kết quả câu thứ nhất. **Đọc thừa 500 bản ghi mỗi lượt xem.**

Số đo lịch sử ghi ngay trong mã (`AppRecordQueryService.cs:70-75`): blog thật 39 bài × ~57 trường typed =
**~2.300 round trip mỗi named query, TTFB ~24 giây** trước khi có batch reader.

### 2.3 ⭐ Đường đọc rẻ mà module **đang bỏ không dùng**

`SubmissionDashboard.SearchAsync` (`MegaFormClient.cs:684-724`):
- clamp `PageSize` ≤ **250**, phân trang **thật trong SQL** (`OFFSET/FETCH`), `COUNT(*)` riêng;
- **`SubmissionListItemDto.DataJson` có sẵn dữ liệu của từng dòng** (`Dtos.cs:323`, map ở `MegaFormClient.cs:1097`).

Nhưng module hiện **vứt `DataJson` đi rồi gọi `Records.GetRecordAsync` từng dòng**:

| Chỗ | Kiểu | Giá |
|---|---|---|
| `ActiveTemplate` `MegaFormBlogs.cshtml:738-751` | **tuần tự** 100 dòng | tới **~700 round trip** mỗi lần cache miss (60 s/nhóm) |
| `LoadChildRecords` `:807-813` | song song, cap 200/300 | N round trip |
| comments `:1012`, các màn console | song song | N round trip |

⇒ **Thay N+1 bằng `row.DataJson` = 1 câu SQL cho tối đa 250 dòng.** An toàn vì `PatchRecordAsync` **ghi mirror
lại `DataJson`** (`MegaFormClient.cs:562`) và `SubmitAsync` cũng ghi. Vẫn giữ `GetRecordAsync` cho **đúng bản ghi
đang sửa/đang render chi tiết** (typed là nguồn sự thật khi có ai ghi thẳng vào bảng typed).

### 2.4 Cache: gần như không có

Chỉ **`ActiveTemplates`** cache 60 s (`:720-756`). `ChildFormIds` / `ReaderEventsFormIds` cache theo đời process
(chỉ là form id). **Kết quả truy vấn bài viết KHÔNG cache** — mỗi lượt xem trả tiền lại từ đầu. Với site tài liệu
(đọc nhiều, ghi hiếm) đây là khoản lãng phí lớn nhất và **sửa được hoàn toàn trong module**.

### 2.5 RAM

Mỗi bản ghi bị giữ **hai lần**: `DataJson` (do `SELECT s.*`) **và** dictionary typed dựng lại từ 6 bảng giá trị —
với bài viết thì `body` HTML là trường lớn nhất. 500 bản ghi × 57 trường × 3 câu song song ⇒ đỉnh RAM mỗi lượt
xem tỉ lệ với **toàn bộ nội dung blog**, không phải với 12 bài đang hiển thị. (Đây là số học từ mã; **chưa đo
byte thật** — muốn con số chắc thì bật memory profiler trên site có ≥100 bài.)

Ghi: mỗi lượt đọc **duy nhất** (visitor × bài) = **1 INSERT submission đầy đủ pipeline** vào form reader-events
(`TrackRead` `:425-467`); chống lặp bằng dictionary trong process, cửa sổ 30 phút, cap 20.000 khoá — chỗ này **ổn**.

### 2.6 Sửa được gì trong phạm vi module (xếp theo lợi/công)

1. **Bỏ N+1 → dùng `row.DataJson`** (§2.3). Lợi nhất, rủi ro thấp, chạm 5-6 chỗ.
2. **Cache kết quả truy vấn** 30-60 s theo `(portalId, lens, page, slug)` — copy đúng khuôn `ActiveTemplates`.
3. **Bỏ câu `public-posts` thứ hai** ở trang chủ; chip category suy từ kết quả câu đầu.
4. **Trang chi tiết**: cache `slug → submissionId`, rồi `GetRecordAsync(id)` = **1 bản ghi** thay vì đọc 500 lọc 1.
5. **Hiện `IsBounded`** — cả `MegaForm.Blogs.DNN` **không có consumer nào**; nav vẽ thiếu nhánh mà im lặng
   đúng là "mất dữ liệu im lặng" §11.
6. **Không dùng `?q=` cho tìm kiếm tài liệu**: `AppRecordQueryService.cs:106-112` là `IndexOf` không xếp hạng,
   không snippet, và **quét cả `editor_notes` / `compliance_notes` / `revision_summary`** ⇒ khách ẩn danh tìm
   trúng ghi chú nội bộ vẫn ra bài đó. Docs dùng **chỉ mục JSON tĩnh + tìm trong trình duyệt**.

**Không sửa được từ module** (ghi để khỏi ai tưởng đã xong): trần 500 dòng, `Skip/Take` trong RAM, sort theo
trường tuỳ ý ở SQL. ⇒ **Cây tài liệu phải nằm dưới trần và phải được cache trong module.**

---

## 3. Mô hình dữ liệu cây tài liệu (module-only)

Form mới do console tạo: **`Blog Documentation Pages`**.
⚠️ Đặt tên xong phải thử lại `BlogManifestHelper.ResolveFormIdMap` — matcher dò theo chuỗi con và **có thứ tự**
(`reader/event` → `comments` → `categor` → `posts`).

| trường | kiểu | vai trò |
|---|---|---|
| `doc_uid` | **Text** (⚠️ **không** UniqueId) | `SubmissionProcessor.cs:326-336` **ghi đè vô điều kiện** mọi field kiểu UniqueId bằng bộ sinh của form ⇒ khai Text là xong |
| `doc_space` | Text | không gian tài liệu / phiên bản: `dnn-guides`, `oqtane-guides`, `sdk-2.0` — giải xung đột `overview.md` tồn tại ở **3** cây |
| `doc_key` | Text | khoá định tuyến, `[a-z0-9-]`, phân cấp viết `--`. URL `/Docs?doc=<doc_key>`. ⚠️ **không bao giờ để `/` trong giá trị query** — friendly-URL của DNN biến query thành path segment, `%2F` chết ở IIS |
| `parent_key` | Text | khoá cha, rỗng = gốc — **trường duy nhất tạo ra cây** |
| `doc_path` | Text | đường hiển thị có `/` — chỉ dùng cho breadcrumb + map 301 |
| `sort_order` | Number | thứ tự trong nhánh, **nhảy bậc 10** để chèn không phải đánh số lại |
| `doc_sort_key` | Text | **khoá pre-order vật chất hoá**: `sort_order` tổ tiên pad 4 số nối bằng **`/`** → `0010/0020/0030`. Sắp xếp **ordinal** một lần ra đúng thứ tự đọc; prev/next = ±1; một nhánh là một dải liên tục |
| `doc_depth` | Number | 0-based ⇒ vẽ cây **không đệ quy** (interpreter template không có partial/self-reference) |
| `nav_title` / `title` / `excerpt` | Text/Textarea | nhãn sidebar / H1 / mô tả trang chỉ mục |
| `body_markdown` | LongText | **nguồn sự thật**, soạn dạng text thuần |
| `body` | LongText | HTML sinh ra từ markdown, **không sửa tay** |
| `headings_json` | Textarea | `[{id,text,level}]` **đóng băng lúc nhập** ⇒ neo là dữ liệu, không phải hàm của renderer |
| `content_hash` | Text | SHA-256 của `body_markdown` — nhập lại idempotent |
| `status` | Select | `draft｜published｜archived` |
| `publish_date` | Date | **chỉ ISO `yyyy-MM-dd` invariant** — sai một dòng là hỏng mọi sort trên form |
| `legacy_path` | Text | đường DocFX cũ → sinh danh sách 301 |
| `seo_title`,`seo_description`,`canonical_url`,`og_image_url` | như form posts | để `ApplySeoHead()` bê nguyên |

`doc_path` / `doc_sort_key` / `doc_depth` là **giá trị dẫn xuất** từ `parent_key` + `sort_order`. Chỉ tính ở
**2 chỗ**: script nhập liệu, và nút **"Rebuild tree"** trong console. **Không bao giờ tính lúc render.**

---

## 4. Vì sao KHÔNG bỏ DocFX (kết luận của cả bản nghiên cứu lẫn bản phản biện)

`Docs/docfx/docfx.json` có khối `metadata` `src:"../.."` → `dest:"api"`: **API reference sinh từ mã nguồn**
(49 file ManagedReference, **31.411 dòng YAML, 356 UID**, có `source:` link về git). Không CMS nào sinh lại được.

**Chuyển**: các bài hướng dẫn dạng văn xuôi. **Giữ nguyên DocFX**: `api/`, nhóm `programming/` (84 khối C#),
và **toàn bộ ảnh** — 400 MB, phần lớn **`.gif`**, trong khi field ảnh của module chặn `.gif`, cap **8 MB**,
`MaxFiles=1`, và file upload **401 với khách ẩn danh** (đó là lý do module đang vẽ "chip file" thay cho `<img>`).
⇒ Ảnh và `api/` để nguyên chỗ cũ, tham chiếu bằng **URL tuyệt đối một chiều**.

Bằng chứng tự nhiên: cây tài liệu DNN đã bỏ khối `metadata` — và lập tức có **20 link `../api/*.yml` chết**.

Cây canonical nên chọn: **`MegaformDocs_publish_20260720/Docs/docfx`** (54 bài / 49 yml / 102 ảnh, khớp sạch).
Cây MAIN **không khớp**: 9 href trong `toc.yml` trỏ vào file không tồn tại, 13 file chưa git add.

---

## 5. Cải tiến module Blogs — thứ tự mở khoá (đã cập nhật theo ràng buộc)

1. **Vá đường đọc** (§2.6 mục 1-4) — làm trước, vì mọi thứ sau đều nhân lên trên nó.
2. **Neo tiêu đề theo TEXT, không theo vị trí**. `BuildToc` đang gán `"mfb-h" + index` (`:159`): chèn 1 thẻ `<h2>`
   là **mọi neo bên dưới trỏ sai** — HTTP 200, sai chỗ, vĩnh viễn. Slug hoá theo text (`used` HashSet sẵn có để
   khử trùng), mở regex `<h([234])`, trả `level` thật thay cho mẹo thụt 2 dấu cách ở `:162`. **Phải xong trước
   khi nhập bài đầu tiên.**
3. **Script công khai riêng `MegaFormDocs.cshtml`** — đừng cắm docs vào file 2.391 dòng `MegaFormBlogs.cshtml`.
   Trang `/Docs`, tham số `?doc=` `?space=` `?q=`. Lỗi biên dịch của docs không kéo `/Blogs` chết theo.
4. **Sidebar cây**: 1 lần đọc phẳng đã gắn `doc_depth`, **cache 60 s theo `portalId+doc_space`**, vẽ lặp
   (không đệ quy). Nếu chạm trần → **in banner nhìn thấy được**, không im lặng.
5. **"Article list" đúng nghĩa** (thứ owner hỏi) = **3 mặt**:
   - *Space landing* `/Docs?space=…`: chỉ node depth 0-1, lưới 2 cột `nav_title` + `excerpt` + số bài con;
   - *Section index*: khối "Trong mục này" gắn dưới thân bài, liệt kê con theo `doc_sort_key`;
   - *Prev/next*: hàng liền kề trong danh sách phẳng — **tuần tự**, không phải `RelatedPosts` (điểm theo
     category + tag, có thể ném người đọc ngược ra khỏi mục).
   Điểm xuất phát thị giác: markup lens archive `:2166-2183` (đã là kiểu danh sách không thẻ ảnh), đổi gom
   theo tháng thành gom theo nhánh.
6. **Markdown là nguồn lưu trữ**, render **ngoại tuyến** (Markdig) → `body`. Console sửa bằng `<textarea>` +
   nút preview, **không WYSIWYG** (RichText phá 1.497 dòng code, và khối `razor` có `@Html.Raw`, `@Model.FormId`).
7. **Console docs** `?view=docs` + `MegaFormBlogsAdminDocs.cshtml`: cây, chọn cha, `sort_order`, "Rebuild tree".
   ⚠️ Host admin là **SuperUser-only** ⇒ tác giả tài liệu sẽ cần quyền Host trên production — thêm một lý do
   coi git là đường soạn thảo chính, console là đường sửa gấp.
8. **Tìm kiếm**: chỉ mục JSON tĩnh + xếp hạng/snippet trong trình duyệt (§2.6 mục 6).
9. **301**: sinh rule IIS `<rewrite>` từ `legacy_path` → `/Docs?doc=…` (~70 rule). Module **không có** bảng route,
   đây là cơ chế duy nhất. Không được bỏ qua.
10. **Oqtane**: hoãn, và **nói rõ là hoãn** — Oqtane không có template engine, không có `BuildToc`/`RelatedPosts`.

---

## 6. Đường nhập liệu (6 bước, mỗi bước một bẫy đã biết)

1. **Parse** `articles/toc.yml` → cây (`- name:/items:` lồng tối đa 2 tầng) → `parent_key`, `sort_order` (10/20/30),
   `doc_depth`, `doc_path`, `doc_key`, `nav_title`, `legacy_path`; tính `doc_sort_key` nối bằng `/`.
2. **Convert** bằng Markdig: 12 ngôn ngữ fence → `<pre><code class="language-…">`; 21 alert DocFX (4 kiểu) →
   `<div class="mfd-note …">`; 65 bảng → `<table class="mfd-table">`; heading → slug + gom vào `headings_json`.
3. **Viết lại link** — 3 nhóm, 3 đích khác nhau: `](file.md)` (**218 link**) → `/Docs?doc=…`;
   `](../api/*.yml)` (**59**) → **URL tuyệt đối** sang DocFX; `![](…/images/*)` (**85**, hai tiền tố khác nhau vì
   viết từ hai độ sâu thư mục) → tuyệt đối. **Xuất báo cáo link chưa giải được và cho chạy fail** — blog không có
   bất kỳ lớp kiểm tra link nào.
4. **Tạo** `POST /DesktopModules/MegaForm/API/Submit/Post` `{formId, data, submissionTime: 60}`.
   ⚠️ **`submissionTime: 60` là bắt buộc**: `AntiSpamService.cs:82` chấm điểm spam khi >2 trường mà <3 giây, và
   `AppRecordQueryService.cs:91` lọc `!IsSpam` **trước mọi thứ** ⇒ điểm spam sai **không báo lỗi**, bài chỉ đơn
   giản biến mất khỏi mọi danh sách. Dựa trên `Tools/Migrate-DnndefenderLegacyBlogs.ps1`.
5. **Đồng bộ status**: `Submit/Post` để `MF_Submissions.Status` ở mặc định, chỉ set `status` typed ⇒ đọc công khai
   vẫn đúng nhưng màn admin lệch. Vá bằng `Submissions/UpdateStatus` (cần đăng nhập + antiforgery).
6. **Verify và coi là cổng chặn**: đếm dòng, `doc_uid` không trùng, `IsSpam` = 0, `IsBounded` = false, mọi
   `parent_key` giải được, `doc_sort_key` là thứ tự toàn phần không trùng — rồi **fetch `/Docs` và grep `mfd-nav`**.
   ⭐⭐⭐**RazorHost nuốt lỗi biên dịch: render rỗng, vẫn HTTP 200, không log gì** ⇒ 200 không chứng minh điều gì.

Lặp lại phải rẻ: khoá theo `doc_space`+`doc_key`, `content_hash` trùng thì bỏ qua.

---

## 7. ⭐ Tích hợp bộ mock ACME (yêu cầu của owner)

**Nguồn:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\ACME-website-Blogs` — đã kiểm kê thật:

| | |
|---|---|
| Loại dự án | **Next.js** (`app/`, `components/`, `styles/globals.css` 23,6 KB) — **không phải HTML tĩnh** |
| Tổng route | **109 × `page.tsx`** |
| Bộ mock blog | `app/templates/blog` — **11 nhóm / 26 trang**: admin, archive, author, category, news, post, recent, search, subscribe, tag, trending |
| Kho khác | 27 bộ template (corporate/shop/startup/homepage 1-3, medical, law-firm, restaurant, travel, wedding, education, fitness, real-estate, portfolio, architecture, golf…) |
| Components | hero-variants (5), footer-variants (8), landing-layouts, blocks/trusted-brands (4), `mega-menu.tsx` **246 KB**, ai-block-builder (4) |

**Cách làm đúng**: đổ vào **cơ chế template đã có** — Template manager (form 382) + gallery 2 theme
`Newsroom`/`Journal` (`Assets/Templates/catalog.json` + file HTML thật trong gói) — **đừng đẻ cơ chế thứ hai**.
Đăng ký "mặt" mới = thêm một mục vào danh sách `Groups` (`MegaFormBlogsAdminTemplates.cshtml:29-36`, hiện đúng
5 target: `blog-home`, `blog-archive`, `blog-post`, `news-home`, `news-article`) + một nhánh lens trong renderer.

⚠️ Interpreter chỉ có `{{var}} {{a.b}} {{{raw}}} {{#each}} {{#if}}` — **không đệ quy, không partial** ⇒ mọi cấu
trúc cây phải được **làm phẳng kèm `depth` ở server** trước khi giao cho template.

Bẫy Razor đã trả giá: RazorHost nuốt lỗi biên dịch · **skin DNN style thẳng h1..h6** (template phải tự khai font
trên từng phần tử) · **hàm page-block phải nằm TRONG `@functions`** (CS0103 báo ở chỗ gọi) · **`@layout` là
directive** (đặt tên biến `layout` trong chuỗi nuốt cả dòng) · `all-posts` không trả `post_uid`.

---

## 8. Lát cắt đầu tiên — 6 trang, chạm đủ mọi bẫy đúng một lần

Chọn 1 nhánh gốc + 3 con + 1 cháu; trong đó có 1 trang mang: khối C# ≥40 dòng · 1 alert · 1 ảnh `.gif` ·
1 link `../api/*.yml` · 1 bảng markdown · >3 heading h2/h3.

Thứ tự dựng: **§2.6 vá đọc** → **§5.2 slug neo** → bước 1-3 nhập liệu offline (báo cáo link xanh) →
`MegaFormDocs.cshtml` (nav + breadcrumb + TOC + prev/next + section index) → bước 4-6 chạy thật trên QA →
6 rule 301.

Nghiệm thu (đủ 8 mới được đụng tới 53 bài):
1. `/Docs?doc=<root>` trả HTML **có `mfd-nav`**, 6 mục, đúng `doc_depth`.
2. Nhập lại sau khi chèn thêm 1 `<h2>` giữa bài: **mọi neo khác không đổi một byte**.
3. Prev/next đi hết 6 trang đúng thứ tự TOC và dừng đúng ở hai đầu.
4. Breadcrumb của trang cháu hiện 3 cấp; trang gốc liệt kê 3 con kèm excerpt.
5. Ảnh gif và link `.yml` giải đúng về host DocFX.
6. Khối C# đi qua nhập → lưu → render **không mất ký tự nào**, kể cả `@`.
7. Chạy nhập lần hai: 6 skipped, 0 created, 0 updated.
8. `IsBounded` = false · `doc_uid` 6/6 khác nhau · `IsSpam` 0/6 · status master và status typed khớp 6/6.

**Điều kiện dừng hẳn** (giữ tài liệu ở DocFX): comparer ném lỗi với `doc_sort_key` 3 tầng · không đọc hết được
cây trong trần · rewriter của DNN làm hỏng `?doc=` · vòng markdown→HTML→lưu→render làm mất code.

---

## 9. Công cụ & lệnh sẵn có

```powershell
# cài gói lên site
$env:DNN_BASE_URL='http://dnn_megafresh.ai'; $env:DNN_USER='host'; $env:DNN_PASSWORD='Dnn@Host2026'
$env:MEGAFORM_DNN_ZIP='...\MegaForm.Blogs.DNN\Install\MegaForm.Blogs.DNN_01.16.003_Install.zip'
node tools/dnn_live_install_megaform.mjs install

# phóng starter (tạo "channel")
node qa-out/launch-blog-starter.mjs http://dnn_megafresh.ai 385

# QA giao diện panel (6 surface, mỗi cái một trang NGUỘI)
node tools/browser-qa/pb-surface-visual-qa.mjs http://dnn_megafresh.ai host "Dnn@Host2026" qa-out/x /
```

⚠️ DNN 10 **bắt đổi mật khẩu lần đầu**; token reset nằm ngay trên URL (`qa-out/fresh-set-password.mjs`).
Mật khẩu portal `admin` chưa dùng được — QA bằng `host`. Sai vài lần là **khoá tài khoản**
⇒ `UPDATE aspnet_Membership SET IsLockedOut=0`.

**"Channel" là gì**: module Blogs **không có** khái niệm channel; thứ đóng vai trò đó là **configured app +
AppScope** (`ConfiguredAppStarterDefinitions.cs:38-80`, `Key="blog"`, `AppScope=Blog`, `AppKey="blog-starter"`,
19 view key). Phóng bằng `POST Starter/Launch {starterKey, moduleId, homeUrl}` — **bắt buộc `moduleId > 0`**
(`MegaFormApiController.cs:5630`). Nay **không được thêm app mới** (phải sửa Core) ⇒ docs dùng chung app
`blog-starter`, tách bằng **form riêng** (§1).

---

## 10. Còn treo

- 🔶 **Kết quả workflow nghiên cứu đầy đủ** (7 agent, 842k token): `wewce6kkl.output` trong thư mục tasks của
  phiên trước, đã tách sẵn ra scratchpad: `wf-plan.md`, `wf-challenge.md` (bản phản biện — **đọc mục 1, 3, 8**),
  `wf-arch.json`, `wf-corpus.json`, `wf-site.json`, `wf-importPath.json`, `wf-gaps.json`.
  ⚠️ Bản `wf-plan.md` viết **trước** ràng buộc "không đụng MegaForm": mục R1 và mọi chỗ nói "named query" đã
  **bị thay** bởi §1 + §2.3 của file này.
- 🔶 **~9 chỗ trong `MegaForm.UI/src`** tự gọi `location.reload()` / `window.open()` dựng từ `location.pathname`
  — không chặn được từ Persona Bar panel. Owner chưa quyết.
- 🔶 **`MegaForm.Web` không build được**: 8 lỗi ở `Data/EfSubmissionDataStore.cs` (**file chưa git add**).
- 🔶 **Hai module MegaForm trên cùng một trang admin làm dashboard treo "Loading…"** (id trùng).
  Canh bằng `tools/browser-qa/page-dashboard-health.mjs`.
