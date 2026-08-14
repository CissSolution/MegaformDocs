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

**Đã làm thêm chiều 10-08 (nguồn `MegaForm.Blogs.DNN` → `1.16.4`, CHƯA đóng gói, CHƯA cài đi đâu):**
bước 1 và 2 của thứ tự §5 đã xong và **đo trên site thật** — neo tiêu đề theo text (§5.2), bỏ câu
`public-posts` trùng, cache 45 s cho 2 đường đọc không mang input của khách, và `IsBounded` cuối cùng có
người đọc (§2.6). `/Blogs` **1219 ms → 808 ms**, HTML **giống hệt trên 7 URL**. Chi tiết + cách đo: cuối §2.6.
⛔ Món to nhất (**bỏ N+1**) **không làm được dưới ràng buộc 1** — lý do đã kiểm chứng nằm trong khối ĐÍNH CHÍNH
§2.3, và nó cần owner quyết trước.

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

> 🔴 **ĐÍNH CHÍNH 2026-08-10 (đọc mã, không đoán) — đoạn trên nói ĐÚNG về độ tươi nhưng SAI về "thay được".**
> Vấn đề không phải DataJson cũ, mà là **hai đường trả về HAI KIỂU GIÁ TRỊ khác nhau**:
> `SubmissionDataResolver.GetTypedFirstData` trả **object của typed store** khi có dòng typed (Number ra
> `decimal`), và chỉ khi KHÔNG có mới rơi về `JsonConvert.DeserializeObject<Dictionary<string,object>>` của
> DataJson (`SubmissionDataResolver.cs:62-86`). Hàm `Number()` trong `MegaFormBlogs.cshtml:28-43` tồn tại **chính
> vì cái decimal đó** — bản 1.6.0 dùng `int.TryParse` thẳng và **mọi bộ đếm trên blog công khai đọc ra 0**.
> Đổi đường đọc = chạy lại đúng lớp lỗi đó cho date / select / file ref **cùng một lúc, và im lặng**.
> Hợp đồng của module (`MegaForm.Blogs.DNN/CLAUDE_HANDOFF.md`) cấm parse DataJson **và** cấm để lớp tương thích
> nằm trong Razor — hai điều luật này chỉ đúng chỗ này.
> ⇒ Chỗ sửa đúng là **`Records.GetRecordsAsync(ids)` batch sau mặt SDK**, tức **phải sửa MegaForm** ⇒ **cần
> owner gật đầu**. Đây là món DUY NHẤT trong §2.6 không làm được dưới ràng buộc "chỉ sửa Blogs".
> (Độ tươi thì thật sự an toàn: mọi đường ghi typed đều dẫn xuất TỪ DataJson — `SubmissionProcessor.cs:413`,
> `LegacySubmissionBackfillService.cs:80`, `TypedSubmissionResyncService.cs:67` — và `PatchRecordAsync` ghi cả
> hai trong một thao tác: typed `MegaFormClient.cs:548`, mirror `:562`.)

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

1. ⛔**CHẶN — cần owner quyết.** **Bỏ N+1 → dùng `row.DataJson`** (§2.3). Lợi nhất, nhưng **không phải
   drop-in**: xem khối ĐÍNH CHÍNH ở §2.3. Cách đúng (`Records.GetRecordsAsync(ids)`) **phải sửa MegaForm**.
2. ✅**XONG (1.16.4)** **Cache kết quả truy vấn** — 45 s theo `(portalId, queryKey, pageSize)`, **chỉ cho 2 đường
   đọc KHÔNG mang input của khách** (danh sách rộng + hero). Cố ý **không** cache theo `lens/page/slug`: khoá
   lấy từ query string trên trang ẩn danh là **lỗ hổng cạn RAM**, không phải cache — một vòng lặp `?q=<ngẫu
   nhiên>` là đủ.
3. ✅**XONG (1.16.4)** **Bỏ câu `public-posts` thứ hai** ở trang chủ — câu rộng phục vụ cả chip lẫn lưới, lưới
   cắt lát (điều kiện: không lọc **và** `pageNumber*pageSize ≤ 100`; có `?category=`/`?q=` thì vẫn 2 câu, vì
   chip phải liệt kê MỌI category chứ không chỉ cái sống sót sau bộ lọc).
4. 🔶**CHƯA** **Trang chi tiết**: cache `slug → submissionId`, rồi `GetRecordAsync(id)` = **1 bản ghi** thay vì
   đọc 500 lọc 1.
5. ✅**XONG (1.16.4)** **Hiện `IsBounded`** — trước đó cả `MegaForm.Blogs.DNN` **không có consumer nào**. Nay
   có một câu cho người đọc + số đếm ghi `500+`, và dòng lý do cho Host; trang bài viết nói rõ với Host khi
   "Article not found" thật ra là **slug nằm quá trần 500**.
6. 🔶**CHƯA (áp dụng khi dựng docs)** **Không dùng `?q=` cho tìm kiếm tài liệu**: `AppRecordQueryService.cs:106-112`
   là `IndexOf` không xếp hạng, không snippet, và **quét cả `editor_notes` / `compliance_notes` /
   `revision_summary`** ⇒ khách ẩn danh tìm trúng ghi chú nội bộ vẫn ra bài đó. Docs dùng **chỉ mục JSON tĩnh +
   tìm trong trình duyệt**.

**Đo thật sau khi ship 2+3+5 trên `megaclean008.ai` (11 bài, site đã ấm):** `/Blogs` trung vị **1219 ms → 808 ms**,
`?view=trending` **~700-965 ms → 443-490 ms**. HTML sinh ra **giống hệt** trên 7 URL (`/Blogs`, `?page=2`,
`?view=trending`, `?view=archive`, `?category=`, `?q=`, `?tag=`) — so chữ ký gồm số thẻ, danh sách slug theo thứ
tự, số bài, chip category và pager. Site đã được **trả về đúng file cũ từng byte** sau khi đo.

**Không sửa được từ module** (ghi để khỏi ai tưởng đã xong): trần 500 dòng, `Skip/Take` trong RAM, sort theo
trường tuỳ ý ở SQL. ⇒ **Cây tài liệu phải nằm dưới trần và phải được cache trong module.**

---

## 3. Mô hình dữ liệu cây tài liệu (module-only)

> 🔴 **ĐÍNH CHÍNH 2026-08-10 — tên form cũ SAI, và kiểu trường cũ cũng sai.** Đã đọc mã, không đoán.
>
> **1. Tên `Blog Documentation Pages` KHÔNG dùng được.** `BlogManifestHelper.InferKeyFromTitle`
> (`BlogManifestHelper.cs:84-94`, comment `:79-83` ghi thẳng *"Order is load-bearing"*) chạy theo thứ tự
> `reader|event` → `comment` → `categor` → **`publishing|post|article|blog|news`** → null. Chuỗi **`blog` một
> mình đã đủ** rơi vào nhánh `"posts"`. ⇒ tên form **không được chứa bất kỳ chuỗi con nào** trong 9 chuỗi đó.
> Tên chọn: **`MegaForm Docs Pages`**.
> Ba lớp chắn hiện có, và vì sao vẫn phải đổi tên: (a) form tạo bằng `CreateFormAsync` **không có AppScope**
> (`MegaFormClient.cs:145-153`) nên không lọt vào `candidates` (`BlogManifestHelper.cs:52-57`) — đây là lớp
> chính; (b) nếu rơi vào fallback `:60-66` thì `OrderBy(FormId)` cho form posts seed (id nhỏ hơn) giành khoá
> trước — an toàn **nhờ thứ tự id**, mong manh; (c) 🔴 nếu portal **đổi tên** form posts thành thứ không chứa
> từ khoá nào, form tài liệu thành ứng viên `posts` **duy nhất** ⇒ `ScheduledPublishService.cs:38` quét nhầm
> bảng, hỏng im lặng.
>
> **2. Không có kiểu trường `LongText`.** `LongText` là **kiểu LƯU TRỮ**, không phải field type
> (`SubmissionFieldNormalizer.cs:53-59` map `textarea`/`richtext`/… → `SubmissionDataType.LongText`). Chuỗi
> `"LongText"` dùng như tên field type chỉ xuất hiện **1 lần trong cả repo**, ở đường Umbraco.
> ⇒ `body` / `body_markdown` phải khai **`Textarea`**. `RichText` cũng ra LongText nhưng **bị
> `SanitiseRichTextHtml`** (`SubmissionProcessor.cs:339-343`, `:762-775`) — blacklist, giữ `<table>`/`<svg>`/
> `class`, nhưng vẫn là một lớp lọc không cần thiết cho HTML do chính ta sinh. `Textarea` **không lọc gì**.
> ⚠️ `MF_SubmissionValueString.Value` là **NVARCHAR(1024)**; LongText mới là NVARCHAR(MAX). `sdk-reference`
> ra ~49.500 ký tự HTML ⇒ khai `Text` là mất dữ liệu, chỉ sống nhờ van `AddLosslessString`
> (`SubmissionFieldNormalizer.cs:225-231`) — đừng dựa vào van.
>
> **3. `publish_date` khai `Text`, KHÔNG khai `Date`.** `FormValidationService.cs:103-106` validate bằng
> `DateTime.TryParse` **không chỉ định culture** ⇒ host `vi-VN` diễn giải khác. Module Blogs đã né đúng cách
> này rồi (`MegaFormBlogsAdminFormats.cshtml:50` + comment `:43-44`: *"invariant round-trip string so the host
> culture can never reinterpret it (the vi-VN trap that blanked typed values once)"*).
>
> **4. `status` khai `Select` thì server CHẶN giá trị lạ** (`FormValidationService.cs:119-129`,
> *"Please select a valid option."*) — options phải khai đủ `draft|published|archived` ngay từ đầu.
>
> **5. 🔴 Form này KHÔNG có AppScope ⇒ KHÔNG dùng được named query.** Đường đọc duy nhất còn lại là kiểu
> `LoadChildRecords`: `SearchAsync(PageSize=cap)` + **N+1 `GetRecordAsync`** + lọc phía client. Với 54 trang là
> 54 lời gọi SDK mỗi lượt xem ⇒ **cache trong module là bắt buộc, không phải tuỳ chọn** (dùng đúng khuôn
> `CachedPublicQuery` đã ship ở 1.16.4).
>
> **6. Tránh vân tay của các form con khác** — module dò form theo tổ hợp field key, trùng là bị nhận nhầm:
> `image_url`+`post_uid` (gallery) · `is_key_moment`+`post_uid` (live) · `template_body`+`template_group`
> (templates) · `comment_body`+`post_slug`+`moderation_status` (comments) · `event_type`+`post_uid`+`visitor_key`
> (reader-events).

Form mới do console tạo: **`MegaForm Docs Pages`** (xem khối đính chính ngay trên: tên cũ
`Blog Documentation Pages` **cướp khoá `posts`**).

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

**Chuyển**: các bài hướng dẫn dạng văn xuôi. **Giữ nguyên DocFX**: `api/` (49 file `.yml` sinh từ mã nguồn).

> ✅ **CỔNG ẢNH — ĐÃ ĐÓNG (2026-08-10), và lời giải cũ ở đây là SAI.**
> Bản trước nói ảnh phải ở nguyên DocFX vì "field ảnh của module chặn `.gif`, cap 8 MB, upload 401 với khách
> ẩn danh". Đúng — **nhưng chỉ đúng với đường upload qua MegaForm**, mà tài liệu không cần đi đường đó.
> Ảnh tĩnh đặt thẳng vào thư mục portal là xong: đã chép **102 file / 94,9 MB** (61 PNG 6,3 MB + **41 GIF
> 88,6 MB**) vào `E:\DNN_SITES\DNN_MegaClean008\Website\Portals\0\MegaFormDocs\images\` và **fetch thật**:
> `http://megaclean008.ai/Portals/0/MegaFormDocs/images/<tên>` trả **200** với đúng `image/png` / `image/gif`,
> kể cả file lớn nhất **5,6 MB** (`12-tabbed-template.gif`). Không cần đăng ký vào file manager của DNN,
> không nhét vào gói cài (giới hạn <28 MB), không đụng field ảnh.
> ⇒ Importer viết lại `![](../images/x.gif)` → `/Portals/0/MegaFormDocs/images/x.gif` (đường dẫn tuyệt đối
> **cùng site**, không phải URL một chiều sang host khác). Con số "400 MB" ở bản trước cũng sai: thật là 94,9 MB.

Bằng chứng tự nhiên: cây tài liệu DNN đã bỏ khối `metadata` — và lập tức có **20 link `../api/*.yml` chết**.

Cây canonical nên chọn: **`MegaformDocs_publish_20260720/Docs/docfx`** (54 bài / 49 yml / 102 ảnh, khớp sạch).
Cây MAIN **không khớp**: 9 href trong `toc.yml` trỏ vào file không tồn tại, 13 file chưa git add.

---

## 5. Cải tiến module Blogs — thứ tự mở khoá (đã cập nhật theo ràng buộc)

1. **Vá đường đọc** (§2.6) — ✅ mục 2, 3, 5 đã ship trong **1.16.4**; ⛔ mục 1 chờ owner; 🔶 mục 4 còn treo.
2. ✅**XONG (1.16.4)** **Neo tiêu đề theo TEXT, không theo vị trí**. `BuildToc` từng gán `"mfb-h" + index`: chèn
   1 thẻ `<h2>` là **mọi neo bên dưới trỏ sai** — HTTP 200, sai chỗ, vĩnh viễn. Nay slug hoá theo text (bỏ dấu,
   nên "Cài đặt" và "Cai dat" ra một neo), khử trùng **với mọi id đã có sẵn trong thân bài** (kể cả id không
   phải heading, vì một id viết tay nằm phía dưới vẫn đụng được), regex mở tới `<h([234])`, và `TocEntry` mang
   `Level` thật thay cho mẹo thụt 2 dấu cách (template nhận thêm `toc[].level`).
   Bằng chứng trên site thật: ba tiêu đề giống nhau ở **hai bài khác nhau** nay cho **cùng ba neo**
   (`mfb-why-this-matters` / `mfb-starter-coverage` / `mfb-template-handoff`), trong khi trước đó cả hai bài đều
   trả lời ở `mfb-h1..mfb-h3` cho những chữ khác nhau.
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

> ⭐ **SỐ ĐO THẬT 2026-08-10** — chạy `scan-corpus.ps1` trên cây canonical
> `E:\…\MegaformDocs_publish_20260720\Docs\docfx`. **Các con số cũ ở mục 2-3 bên dưới là SAI, đã thay.**
> Lưu ý: một agent nghiên cứu đã soi **nhầm sang cây trong repo** (`Docs/docfx` — chỉ 24 bài, 2 bài `dnn-*`,
> 9 href TOC chết) rồi kết luận cây publish là bịa. Cây publish có thật và **sạch**:
>
> | | |
> |---|---|
> | Bài | **54** `.md`, trong đó **22 bài `dnn-*`** = đúng phần "hướng dẫn dùng MegaForm trên DNN" owner hỏi |
> | TOC | 57 mục = **3 nhóm + 54 lá**, đúng **2 tầng**; **0 href chết, 0 file mồ côi** |
> | Link `.md`→`.md` | **164** · **0 link chết** |
> | Link `../api/*.yml` | **26** (dồn ở `sdk-reference` 11, `overview` 9, `file-download` 3, `reading-data` 3) |
> | Link ngoài http(s) | **0** ⇒ `AntiSpamService` `urlCount` = 0, điểm spam không leo vì link |
> | Neo trong trang | 4 |
> | Ảnh tham chiếu | **92, TẤT CẢ một tiền tố `../`** (không phải "hai tiền tố" như bản trước ghi). **4 ảnh chết**, đều thuộc Oqtane: `oqtane-sdk-download.png`×2, `oqtane-sdk-listview.png`, `oqtane-dashboard.png` |
> | Ảnh trên đĩa | **102 file / 94,9 MB** = 61 PNG (6,3 MB) + **41 GIF (88,6 MB)**; **không file nào >8 MB** |
> | Fence | 127 không nhãn + 81 `csharp` + json 17 + text 8 + xml 5 + html/razor 3 + bash/sql/css/js 1 |
> | Alert DocFX | **10** (IMPORTANT 3 · NOTE 4 · TIP 3) — không phải 21 |
> | Bảng | **49** — không phải 65 |
> | Heading | h1 = 54 (mỗi bài một) · h2 = 238 · h3 = 91 · **không có h4** |
> | Bài lớn nhất | `sdk-reference.md` **38.617 byte** |
> | HTML thô trong md | 2 bài: `form-template-json.md`, `oqtane-consumer.md` |

1. **Parse** `articles/toc.yml` → cây (`- name:/items:` lồng tối đa 2 tầng) → `parent_key`, `sort_order` (10/20/30),
   `doc_depth`, `doc_path`, `doc_key`, `nav_title`, `legacy_path`; tính `doc_sort_key` nối bằng `/`.
   ⚠️ `doc_key` phải sinh từ **href**, không từ `name`: tên hiển thị **trùng nhau giữa nhánh Oqtane và nhánh DNN**
   ("Creating Forms", "Form Builder", "Workflow"…), href thì không (`creating-forms.md` vs `dnn-creating-forms.md`).
2. **Convert** bằng Markdig: 10 ngôn ngữ fence có nhãn → `<pre><code class="language-…">`; **10** alert DocFX
   (3 kiểu) → `<div class="mfd-note …">`; **49** bảng → `<table class="mfd-table">`; heading → slug + gom vào
   `headings_json`.
3. **Viết lại link** — 3 nhóm, 3 đích: `](file.md)` (**164**) → `/Docs?doc=…`; `](../api/*.yml)` (**26**) →
   **URL tuyệt đối** sang DocFX; `![](../images/*)` (**92**, **một tiền tố duy nhất**) → tuyệt đối.
   **Xuất báo cáo link chưa giải được và cho chạy fail** — blog không có bất kỳ lớp kiểm tra link nào.
   4 ảnh chết đã biết ⇒ importer phải **liệt kê chúng, không im lặng**.
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

> ### 📌 TRẠNG THÁI 2026-08-10 tối — đã dựng 2 mặt, **chưa nhìn thấy nó chạy**
>
> Owner chốt thứ tự: **templating (§7) trước, rồi mới chuyển tài liệu**, và thử trên **`megaclean008.ai/Blogs`**.
>
> **Đã làm (nguồn, đã ghi vào repo):**
> - `Assets/Templates/acme-home.html` + `acme-post.html` — chuyển từ `ACME/app/templates/blog/page.tsx` và
>   `post/page.tsx`, viết theo đúng quy ước của 4 template đã ship (mọi selector `.ac-` **nằm trong `.mfb-tpl`**;
>   khai `font-family: inherit` **trên từng phần tử** h1..h5/p/a/span/small/li/b/strong/label vì **skin DNN style
>   thẳng h1..h6**; **không có `<script>`** — xem cổng chặn (c) bên dưới).
> - 2 mục mới trong `catalog.json`, + `contract` viết lại cho **đủ** khoá thật, + khoá `gotchas` mới.
> - `build-install-package.ps1`: khai 2 file mới **và** thêm kiểm tra **chiều ngược lại** — file `.html` nằm trong
>   `Assets\Templates` mà **không được khai** thì build **ném lỗi**. Trước đó chỉ kiểm file đã khai bị thiếu, nên
>   một template mới bị quên sẽ ship ra "catalog có mục, gói không có file" và console báo *"That gallery template
>   is not installed on this site."* (bằng chứng sống: `Assets/megaform-blogs-read.js` nằm trên đĩa, **không được
>   khai, không ai tham chiếu** ⇒ chưa từng được cài).
> - **3 khoá context mới trong module** (chỉ sửa Blogs, không đụng MegaForm):
>   - `post.subtitle` `post.imageAlt` `post.mediaCaption` `post.shares` `post.sharesLabel` `post.authorFollowers` —
>     schema posts **đã có** các trường này từ lúc starter ra đời (`ConfiguredAppStarterDefinitions.cs:347/363/364/372/387`)
>     mà `TplPost` không map ⇒ `{{post.subtitle}}` in **rỗng và không báo gì** (server **không bao giờ** ghi lỗi
>     biến chưa giải — chỉ bản preview trong trình duyệt mới báo).
>   - `toc[].sub` — interpreter **không có phép so sánh**, nên template không thể hỏi "heading này level 3 à?";
>     `level` một mình thì heading nào cũng truthy.
>   - `commentForm.{open,csrf,slug,requireEmail,autoClosed,posted,error}` — 🔴 **quan trọng nhất**. Template chiếm
>     trọn `<main>`, kể cả hộp bình luận; token CSRF sinh theo từng request và handler POST từ chối nếu thiếu
>     ⇒ **trước khi có khoá này, bật template = tắt bình luận, im lặng**.
> - Mock của màn preview đã cập nhật theo đúng cam kết ghi trong chính file đó (*"if the server gains a key, it
>   belongs here the same day"*).
>
> **✅ ĐÃ CHẠY THẬT TRÊN `megaclean008.ai/Blogs` — công tắc đang BẬT, đã chụp ảnh và mở ra xem.**
> - Form `Blog Templates` = **FormId 224**; hai bản ghi **1123** (blog-home) và **1125** (blog-post), `IsSpam=0`,
>   `template_body` đúng **12.372 / 13.125 ký tự**.
> - Trang chủ: **10 thẻ + 1 featured** (11 bài − 1 nổi bật), chip category, rail, pager. Thẻ đầu chiếm cả hàng
>   (bằng `:first-child`, vì interpreter **không có `{{@index}}`**). **0 token của template sót lại**, **0 mojibake**.
> - Trang bài: breadcrumb, subtitle, hàng tác giả + reads/comments/shares, hero có caption, prose đủ (h2/h3,
>   ảnh, blockquote, danh sách, **khối code nền tối**), **mục lục dính có thụt cấp** (nhờ `toc[].sub`), tags,
>   "Keep reading", luồng bình luận, và **hộp bình luận có `mfb_csrf` thật** (`name="mfb_csrf"` = 1,
>   `name="comment_body"` = 1). `class="mfb-article"` của thiết kế gốc = **0** ⇒ template thật sự chiếm trang.
> - Site này **không có bài Gallery/Liveblog nào** (18 Blog Post · 7 Guide · 5 Opinion · 4 News · 2 Customer
>   Story · 1 Release Notes) ⇒ cổng chặn (a) không bị chạm ở đây.
> - **Chưa kiểm**: gửi thử một bình luận thật qua hộp mới (mới chỉ xác minh token + tên trường có mặt).
>
> **Hai lỗi CỦA TÔI mà chỉ nhìn ảnh mới thấy — diff HTML không bắt được:**
> 1. Bản đầu để `{{heading}}` làm eyebrow ⇒ trang nói **cùng một câu ba lần** ("Popular this week" ở eyebrow, H1
>    và section head), vì **`site.title` fallback về chính section heading** khi portal chưa đặt Site title.
>    Đã đổi eyebrow thành nhãn tĩnh, và đặt `SiteTitle`/`SiteTagline` cho site.
> 2. Rail lặp lại y hệt dải category ngay phía trên ⇒ sáu link giống nhau hai lần trên một màn. Đã bỏ.
>
> **Ba bẫy công cụ đã trả giá, ghi lại để không ai mất buổi nữa:**
> - 🔴 **`Get-Content -Raw` + `ConvertTo-Json -Depth`**: `Get-Content` trả String **bọc trong PSObject** kèm
>   `PSPath`/`PSDrive`/`PSProvider`, và `ConvertTo-Json` đệ quy vào đó. Đo trên `acme-home.html` (12.067 ký tự):
>   **Depth 2 = 14.824 · Depth 3 = 39.031 · Depth 4 = 397.481 · Depth 6 = 46.650.276** ký tự, đặc metadata
>   `System.Management.Automation`. Server nhận và **lưu nguyên si** (bản ghi hỏng đầu tiên có `template_body`
>   = 2.210.367 ký tự, trang /Blogs phình 2,44 MB). Chuỗi tổng hợp cùng độ dài **không** bung; `.Substring()`
>   cũng không — vì cả hai trả String trần. ⇒ **dùng `[IO.File]::ReadAllText(path, UTF8)`**, và tiện thể tránh
>   luôn mojibake (PS 5.1 đọc UTF-8 không BOM theo codepage ANSI: `—` thành `â€”` ngay trong DB).
> - 🔴 **Rate limit là bẫy lớn hơn `submissionTime`**: `AntiSpamService.cs:55-56` mặc định **3 lượt / 5 phút**,
>   và bộ đếm tính **theo IP, KHÔNG theo form** (`GetRecentSubmissionCount(ipAddress, windowMinutes)`).
>   Quá ngưỡng = **+60 điểm ⇒ IsSpam ⇒ biến mất khỏi mọi danh sách, không báo lỗi**. Bản ghi thứ hai dính đúng
>   cái này **ba lần liên tiếp**. ⇒ Với **57 bài tài liệu** thì đây là **cổng chặn số 1**: hoặc rải ~95 phút,
>   hoặc khai `rateLimitWindowMinutes`/`rateLimitMaxPerWindow` trong **settings của chính form docs** (ta tạo
>   form nên ta khai được).
> - ⚠️ **Checkbox của màn Settings gửi `value="true"`**, và `Posted()` so **đúng chuỗi `"true"`**
>   (`MegaFormBlogsAdminSettings.cshtml:49-53`). Gửi `on` kiểu mặc định của trình duyệt ⇒ **lưu thành false, im
>   lặng**, đúng như lần chạy đầu. Màn này lưu **tất cả trong một POST** ⇒ script phải đọc lại **mọi** input
>   đang có rồi gửi nguyên vẹn, nếu không mọi checkbox khác bị ghi `false`.
> - ⚠️ Template là **HTML thuần**, không phải Razor: chú thích phải là `<!-- -->`; `@* *@` sẽ in thẳng ra trang.
>
> Script tái lập nằm ở scratchpad: `post-templates.ps1` (đăng nhập một lần rồi nạp template) và
> `set-blog-setting.ps1` (bật/tắt công tắc + đặt Site title qua **chính màn Settings**, để
> `UpdatePortalSetting(..., clearCache: true)` chạy — ghi thẳng SQL thì cache DNN vẫn giữ giá trị cũ).
>
> **Ba cổng chặn phải nói với owner trước khi bật:**
> - **(a) Bật template = nuốt cả `<main>`.** Mất hộp bình luận (đã vá bằng `commentForm.*`), **breadcrumb, pager,
>   chip định dạng, gallery, feed liveblog** — template phải tự dựng lại. Và mọi bài **Gallery/Liveblog** đều rơi
>   vào target `blog-post` (`MegaFormBlogs.cshtml:1675` là **dòng duy nhất** chọn target) nên **mất sạch** phần
>   ảnh/updates.
> - **(b) 3 trong 5 render target là target CHẾT.** `blog-archive`, `news-home`, `news-article` có trong danh sách
>   `Groups` của màn admin, admin báo "Active", nhưng renderer **không bao giờ hỏi tới** ⇒ đổi cả buổi mà `/Blogs`
>   không đổi một pixel, **không có lỗi nào**. Hồi sinh chúng phải sửa `:1675` + thêm nhánh dựng context — vẫn
>   trong module, nhưng **đổi hành vi trang công khai ⇒ cần owner gật**.
> - **(c) Template có `<script>` = stored XSS.** Thân template được emit raw, `TplNeutralizeStyles` **chỉ** lọc khối
>   `<style>`. Vai trò **Blog Publishers** ghi được template ⇒ ghi được script chạy cho mọi khách ẩn danh. Hai file
>   ACME ở đây **không có script**, và không nên có. Trái §5 `CLAUDE.md` nếu làm khác.
>
> **Đính chính cho §7 bên dưới:** câu *"Interpreter không đệ quy"* là **SAI**. `TplRender` **tự gọi chính nó**
> (`MegaFormBlogs.cshtml:780/784/788/793`) và `TplFindClose` đếm lồng theo tên (`:715-728`) ⇒ `{{#each}}` lồng
> `{{#each}}` **chạy được**. Cái thật sự thiếu: **partial, `{{@index}}`, phép so sánh, `{{else if}}`, `{{#unless}}`**.
> Hệ quả thực tế: bảng xếp hạng đánh số của mock trending phải làm bằng **CSS counter**, và "thẻ đầu tiên to hơn"
> phải làm bằng **`:first-child`** — cả hai đều đã dùng trong `acme-home.html`.
>
> **Bẫy chết người khi viết template mới:** `{{#if featured}}` **LUÔN ĐÚNG**. Khi không có bài nổi bật, khoá này là
> **Dictionary rỗng** (`:1692`) và `TplTruthy` đẩy Dictionary qua `Convert.ToString` ⇒ truthy. Phải viết
> **`{{#if featured.title}}`**. Hai template gallery làm đúng; **hai starter seed sẵn làm sai**.

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

## 8-BIS. 📌 TRẠNG THÁI 11-08 — TÀI LIỆU ĐÃ CHẠY, CÒN ĐÚNG MỘT DÒNG CHẶN

**Đã lên site `megaclean008.ai` và render thật** (xác minh bằng phiên **admin**):

| | |
|---|---|
| Form | **`MegaForm Docs Pages` = FormId 225** (tên tránh cả 9 chuỗi cấm của `InferKeyFromTitle`) |
| Schema | 19 trường · `body`+`excerpt`+`headings_json`+`seo_description` = **Textarea** (⇒ LongText NVARCHAR(MAX)) · `publish_date` = **Text** · `status` = Select(draft/published/archived) · **`rateLimitMaxPerWindow=500`, `rateLimitWindowMinutes=1`** khai ngay trong schema |
| Dữ liệu | **57/57 bản ghi, 0 spam**, 57 `doc_key` duy nhất, 54 có body, tổng **298.751 ký tự** — khớp từng con số importer báo. Nhập 51 bài cuối trong **5 giây** |
| Trang | **/Docs = tab 1035** (tạo bằng `POST /API/PersonaBar/Pages/SavePageDetails`, `tabId:0`, sao nguyên payload của tab 1012) |
| Renderer | `MegaForm.Blogs.DNN/Scripts/MegaFormDocs.cshtml` — nav 3 nhóm, trang chỉ mục, space landing, trang bài (breadcrumb · TOC dính · "More in …" · prev/next), cache cây **60 s** |
| Đo trên trang thật | `/Docs`: 3 nhóm nav, **72 link `?doc=`**, 18 thẻ · `sdk-reference`: 107 KB, **39 khối code, 4 bảng** · `creating-forms`: **4 ảnh GIF** phục vụ từ `/Portals/0/MegaFormDocs/images/` · `overview`: **9 link** sang API reference cùng site |

### 🔴 DÒNG CHẶN DUY NHẤT CÒN LẠI — quyền xem module (cần bạn bấm 1 lần, hoặc cho phép ghi SQL)

Module RazorHost của trang /Docs có **`Modules.InheritViewPermissions = 0`** và **không có dòng VIEW cho
All Users (RoleID −1)** ⇒ **admin thấy trang, khách ẩn danh thấy trống**. Cách sửa, chọn một:
- **UI**: /Docs → module → Settings → Permissions → tick *Inherit View permissions from Page* → Update.
- **SQL** (tôi bị classifier chặn, không lách): `UPDATE dbo.Modules SET InheritViewPermissions = 1 WHERE ModuleID = 10657;` rồi xoá cache DNN.

### ⚠️ THỦ PHẠM: `Tools/Set-DnnRazorHostScript.ps1` LÀM HỎNG QUYỀN MODULE

Đo được, không suy đoán: module **10659** (sao từ trang /Blogs) có `InheritViewPermissions = True` và
khách ẩn danh **nhìn thấy** nó. Chạy `Set-DnnRazorHostScript.ps1` để đặt `ScriptFile` → ngay sau đó
`InheritViewPermissions = False` và module **biến mất với khách**. Script post lại form module-settings với
lưới quyền rỗng, nên DNN ghi đè khối quyền. ⇒ **Đặt ScriptFile TRƯỚC, sửa quyền SAU** — hoặc vá script cho
nó giữ nguyên lưới quyền.

### Ba bẫy đã trả giá khi dựng trang (ghi để lần sau đi thẳng)

1. **`/API/internalservices/controlbar/AddModule` tạo module KHÔNG kế thừa quyền.** Cả `Visibility=0` lẫn
   `Visibility=1` đều ra `InheritViewPermissions=False` + chỉ có VIEW cho role 0/5/6. Đường **sao trang**
   (`SavePageDetails` + `templateTabId`) thì ra module `True` — nhưng **không sao ModuleSettings**, nên vẫn
   phải đặt `ScriptFile` sau (và dính bẫy ở trên). `AddExistingModule/CopyModule` trả `TabModuleID: -1`.
2. **`/API/PersonaBar/Pages/DeleteModule` trả 404** trên site này (một handoff cũ có ghi route này).
3. 🔴 **RazorHost trắng trang thì phải phân biệt "lỗi biên dịch" với "module bị ẩn".** Tôi mất nhiều lượt vì
   suy đoán là lỗi Razor. Cách phân biệt trong 1 phút: **fetch cùng URL bằng phiên đã đăng nhập admin** —
   thấy nội dung = lỗi quyền, vẫn trắng = lỗi biên dịch. Bảng `dbo.Exceptions` **khử trùng theo hash và
   không có cột thời gian**, nên "không có dòng mới" **không** có nghĩa là không có lỗi.

### Hai lỗi Razor thật đã sửa trong `MegaFormDocs.cshtml`

- **`@if`/`@foreach` khi đang ở code context.** Trong một khối `{ }`, sau *mỗi* phần tử markup Razor quay
  lại **code** — nên `@` là thừa và làm vỡ biên dịch. 3 chỗ.
- **Không parse JSON bằng Newtonsoft trong script RazorHost.** Script biên dịch lúc chạy với tập assembly
  của host; `headings_json` nay parse bằng regex, không phụ thuộc thư viện ngoài.

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
