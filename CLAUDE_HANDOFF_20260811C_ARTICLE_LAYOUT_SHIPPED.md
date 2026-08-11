# Handoff 2026-08-11 (C) — bố cục bài đã sửa và đã lên production; 2 lỗi treo KHÔNG tái hiện

Nối tiếp `CLAUDE_HANDOFF_20260811B_ARTICLE_VISUAL_QA.md`. Đọc file đó trước cho danh sách 46 lỗi gốc.

**Site:** `https://dnndefender.com` (host / `Minh@2002`) · **Đã cài:** Blogs **01.17.007**
**Bài:** submissionId **291**, `/Blogs?slug=modern-forms-workflow-self-hosted-control`

---

## 0. Đã ship gì

| việc | trạng thái |
|---|---|
| §1.1 dải trắng 560px | ✅ sửa CSS, đã cài, đo lại ở 1440/860/420 |
| §1.6 thân bài serif | ✅ đổi sang sans cùng hệ với site |
| §1.2 12 nhãn mồ côi | ✅ gán class + CSS, đã lưu vào bản ghi 291 |
| §1.6 byline lỗi mã `Â·` | ✅ sửa 6 chỗ chạm tới trang |
| §1.6 ghi chú biên tập lọt vào bài | ✅ đã bỏ |
| §2.2 bỏ khối gallery (owner chốt) | ✅ `content_type` Gallery → Blog Post, 4 ảnh Unsplash biến mất |
| §1.3/1.4/1.5 ảnh chụp | ❌ chưa — vẫn còn khung trình duyệt trong ảnh |
| §2.1 view_count reset | ⚠️ **không tái hiện** — xem §2 |
| §2.2 console không lưu content_type | ⚠️ **không tái hiện** — xem §3 |

Trang cao **13.029 → 10.938 px** sau khi bỏ gallery và gộp nhãn vào thẻ.

---

## 1. §1.1: chẩn đoán cuối cùng, và một bẫy suýt ship

Đo trên trang thật trước khi sửa: khối bài `130..1310` là dải của skin, nhưng `.mfb-article-layout`
chỉ `max-width:1000px` ⇒ chạy `220..1220`, cột chữ **658px**. Dải trắng không phải quên căn giữa —
nó là **cột thứ hai của lưới**, chứa author card + Topics (cao ~430px) rồi giữ chỗ suốt 12.000px
còn lại. Sửa: nới lưới ra 1180, cột phải 340 **sticky**, cột chữ cap 740px.

⚠️ **Bẫy:** khối CSS mới nằm **cuối file**, mà `@media(max-width:900px){...grid-template-columns:1fr}`
nằm ở **đầu file**. Media query không cộng độ đặc hiệu ⇒ rule mới sẽ **đè luôn nhánh gộp-1-cột**.
Đã bọc trong `@media (min-width: 901px)`. Kiểm ở 3 bề rộng, không phải 1.

## 1b. §1.2: giả thuyết "icon không vẽ được" là SAI

Đếm DOM: thân bài có **53 `<div>` không class, 8 `<span>` không class**, 22 h3 + 14 h2 trần.
Không có icon nào cả — markup được viết như thẻ card (`<div><span>Payment</span><h3>..</h3><p>..</p>`)
nhưng **chưa từng có class để CSS bám vào**. Cùng lý do đó giải thích "phân cấp tiêu đề phẳng".

Sửa hai phần: CSS có `.mfb-blocks/.mfb-block/.mfb-block-tag/.mfb-block-num`, và thân bài 291 được
gán class (3 khối, 17 thẻ) bằng `tools/browser-qa/blog-body-transform.mjs`.

Phân loại nhãn **theo nội dung, không theo thẻ**: `DB`/`CRM`/`WF` cũng viết bằng `<div>` như số bước,
đoán theo thẻ thì "CRM" bị nhét vào huy hiệu tròn 30px và cụt còn "CR" (đã nhìn thấy trên ảnh thử).

---

## 2. §2.1 view_count: KHÔNG reset lần này, và cơ chế đã rõ hơn nhiều

Đo đúng như bàn giao B đề nghị:

| mốc | view_count (291) | sự kiện đọc của POST-01030 |
|---|---|---|
| trước khi cài | 24 | 24 |
| ngay sau khi cài, **chưa tải trang nào** | 24 | 24 |
| sau lần tải nguội đầu tiên (16,9 s) | 24 | 24 |
| sau khi scheduler chạy | 24 | 24 |

**Module Blogs KHÔNG ghi `view_count` cho blog cổ điển.** `MegaForm.Core/Services/Blog/BlogAnalyticsRollupService.cs`
**gán** nó bằng cách đếm bản ghi trong form **381 “Blog Reader Events”** gom theo `post_uid` (dòng 187),
và bài nào không có sự kiện thì **cố ý để nguyên** (dòng 182). Nên `view_count = 1` nghĩa là
**đúng một** hàng sự kiện khớp uid tại thời điểm rollup — không phải "bị xoá".

Đã loại một nghi can: 60 sự kiện có `post_uid` RỖNG đều sinh trong 6 giây ngày 2026-07-29 (một lần
seed), không phải mất mát lúc app domain nguội.

Còn lại để kiểm: rollup chạy trong `BlogScheduledPublishTask` (Schedule 49, **5 phút/lần**). Lần sau
reset thì chụp ngay `SELECT ... FROM MF_SubmissionFields WHERE FormId=381` **trước và sau** một tick.

## 3. §2.2 content_type: lưu ĐƯỢC

Đổi Gallery → Blog Post qua chính console: typed `content_type = "Blog Post"`, DataJson mirror cũng
đúng, `view_count` **không bị đụng**. Không tái hiện được lỗi.

Có một cơ chế nuốt dữ liệu thật đã tìm thấy dọc đường, **không phải nguyên nhân ở đây nhưng cần biết**:
`SubmissionFieldNormalizer.Normalize` chỉ duyệt field **có trong schema**, rồi `PatchRecordAsync`
gọi `ReplaceFields` **thay toàn bộ** hàng typed ⇒ key nào không có trong schema vừa không được ghi,
vừa bị **xoá khỏi typed storage**, im lặng, HTTP 200. Đã kiểm: form 378 CÓ `content_type` và
`view_count` nên không dính. ⚠️ Nhưng **form 385 (MegaForm Docs Pages) KHÔNG có `view_count`** —
`EnsureDocMetricFields` lẽ ra phải thêm mà schema vẫn thiếu. Kênh docs là chỗ nên soi tiếp.

---

## 4. Công cụ mới (đã commit)

- `tools/browser-qa/scroll-tiles.mjs` — thêm **tham số thứ 6: file CSS ứng viên**, tiêm vào trang
  thật trước khi chụp ⇒ thử bố cục **không cần đóng gói và cài lên site**.
- ⭐ **Phải tiêm vào CUỐI BODY, không phải `<head>`.** DNN đăng ký `<link>` CSS của module **trong
  form**, nên `page.addStyleTag` (chèn ở head) **thua** mọi khi độ đặc hiệu bằng nhau. Hai lần đầu
  tôi đọc nhầm thành "ứng viên không ăn" — thực ra là thứ tự cascade của harness sai, không phải CSS sai.
- `tools/browser-qa/measure-article.mjs` — đo `left/right/width/position/grid-template-columns` của
  cột bài và cột bên, có tham số bề rộng để kiểm nhánh responsive.
- `tools/browser-qa/prose-blocks.mjs` — hàm `TRANSFORM` gán class + chế độ `preview` chụp từng thẻ.
- `tools/browser-qa/blog-body-transform.mjs` — chạy `TRANSFORM` trên DOM thật (không regex).
- `tools/browser-qa/blog-post-edit.mjs` — đọc/ghi thân bài qua console. ⭐ **Chặn `megaform-widgets.js`**:
  console thay `<textarea name="body">` bằng trình soạn Rich Text, ghi thẳng vào textarea sẽ bị ghi đè
  lúc submit. Chặn file đó thì nhánh dự phòng (textarea trần) được giữ và chính nó được POST.
- `tools/browser-qa/console-form-probe.mjs` — đếm field sẽ được POST, bắt bẫy trùng tên của ASP.NET.

Ba công cụ live có sẵn từ trước, **rất đáng dùng lại**: `tools/dnn_live_sql.mjs` (chạy SQL trên
production qua SqlConsole — **đặt `DNN_SQL_RAW=1`**, nếu không hàm compact nuốt hết rows thành mảng
rỗng và trông như "không có dữ liệu"), `tools/dnn_live_install_megaform.mjs` (`probe` rồi `install`).

---

## 5. Việc chưa xong

- [ ] **Chụp lại ảnh trong bài** (§1.3/1.4/1.5): ảnh hiện vẫn là ảnh chụp **cả khung trình duyệt**,
      nên bên trong ảnh có lại thanh nav y hệt thanh thật cách đó 20px. Phải cắt đúng vùng nội dung.
      Kèm: GIF Persona Bar `[tile-13]` xám phẳng, ảnh docs `[tile-15]` 300px trắng bên trong khung,
      và chú thích "Seventy-three live demos" dưới ảnh đang hiện "34 live demos".
- [ ] Một đoạn văn lặp gần nguyên văn nội dung trong ảnh ngay trên nó — chưa gỡ (khó nhận diện tự động).
- [ ] Root-cause `view_count` (§2) — chờ lần reset tiếp theo để chụp trước/sau một tick scheduler.
- [ ] `view_count` thiếu trong schema form 385 (kênh docs) — xem §3.
- [ ] Gói MegaForm DNN **02.00.016** vẫn **chưa cài** lên site nào.
- [ ] Working tree còn ~243 file đổi từ trước phiên; `git add -A` gom **27.818 file** ⇒ vẫn thiếu `.gitignore`.
