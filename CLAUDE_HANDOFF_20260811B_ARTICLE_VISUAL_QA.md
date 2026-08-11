# Handoff 2026-08-11 (B) — làm tiếp: sửa bố cục bài blog, 2 lỗi treo, việc chưa xong

Nối tiếp `CLAUDE_HANDOFF_20260811_AZURE_GALLERY_METRICS.md`. Đọc file đó trước cho phần Azure/gallery/metrics.

**Site:** `https://dnndefender.com` (host / `Minh@2002`) · `http://megaclean008.ai` (admin / `dnnhost`)
**Nhánh:** `feature/typed-submission-storage-core`. Commit trong phiên: `266486f`, `a423920`, `15f1d78`, + 2 commit công cụ.

---

## 0. Bài học lớn nhất của phiên — đọc trước khi làm bất cứ việc gì

**Đếm phần tử trong HTML KHÔNG phải là kiểm chứng.** Hai lần liên tiếp tôi báo "đã xác minh" rồi owner phải tự phát hiện:

1. Gallery: regex đếm được 73 thẻ ⇒ báo đạt. Thực tế **39 thẻ bị chèn NGOÀI `.mfh-grid`** (điểm chèn lấy bằng `LastIndexOf('</a>')` trên **toàn tài liệu**, mà dưới lưới còn nhiều section có link). Header đếm toàn trang ra 73, pager đếm trong lưới ra **34**. Hai số đá nhau ngay trên màn hình.
2. Bài blog: đủ ảnh, đủ mục ⇒ báo xong. Cuộn ra thì bố cục vỡ ở hàng chục chỗ.

⇒ **Bắt buộc dùng `tools/browser-qa/scroll-tiles.mjs`** (đã commit) cho mọi thay đổi giao diện: cắt trang thành từng màn 1440×900 đọc được ở tỉ lệ thật, kèm đo tràn ngang và khoảng hở dọc. Và `tools/browser-qa/read-gallery-pager.mjs` đọc DOM **sau khi JS chạy**, báo cả `cardsOutsideGrid`.

```
node tools/browser-qa/scroll-tiles.mjs <url> <outDir> 1440 900
```

---

## 1. Việc chính: sửa bố cục bài `modern-forms-workflow-self-hosted-control`

QA 15 màn bằng 5 agent → **46 lỗi**. Ảnh + `metrics.json` ở scratchpad `tiles/`; bản gộp xếp hạng trong output workflow `wqwhbcekb`.

Xếp theo mức thiệt hại, kèm chẩn đoán **đã được sửa lại** ở vòng tổng hợp:

### 1.1 Dải trắng ~560px suốt bên phải (12/15 màn) — nặng nhất
Bài chạy x≈220→877 trên màn 1440, nav phía trên trải tới 1328. Lề trái 220 / phải 560.
🔴 **Chẩn đoán đúng (khác phán đoán ban đầu):** trang có **lưới 2 cột thật**. Cột phải chứa "ON THIS PAGE" và "Topics" ở đầu bài rồi **hết widget**, nhưng lưới vẫn giữ chỗ. ⇒ Không phải "quên căn giữa". Cách sửa: cho sidebar **sticky** khi cuộn, **hoặc** thu lưới về 1 cột sau khi hết widget.
Hệ quả dây chuyền: cột 655px ép mọi ảnh nhúng xuống dưới ngưỡng đọc được, và làm tiêu đề xuống dòng sớm.

### 1.2 ~12 nhãn mồ côi, không phải 1 khối
`1 2 3 4 5` (Describe/Design/Publish/Automate/Own), `DB`/`CRM`/`WF`, `Repeater`, `CAPTCHA`, `Upload`, `Multi-step`, `Appointment`, `Payment`.
Biểu hiện: chữ serif cỡ body, **không màu không đậm không chip**, cách tiêu đề ~50–60px, khoảng hở **trên bằng dưới** nên không thuộc về đâu. Số bước còn **nhỏ và nhạt hơn** câu mô tả dưới nó.
🔴 **Giả thuyết mạnh:** đây là **icon không vẽ được**, chỉ còn chữ dự phòng. Nếu đúng, sửa nguồn icon là hết cả 12 chỗ — **kiểm tra giả thuyết này trước khi đi chỉnh spacing từng khối**.

### 1.3 Ảnh nhúng: nav lặp 2–3 lần/màn, nội dung không đọc nổi
Lỗi **do tôi**: chụp nguyên khung trình duyệt (gồm thanh nav site) rồi ép vào cột 658px. Kết quả: bên trong ảnh lại có `DNNDEFENDER / DEMO DEFENDER / BLOGS…` y hệt thanh thật cách 20px; `EUROYOUTH 2026` còn ~8px, `Fields 27` nhoè xám.
⇒ Chụp lại, **cắt đúng vùng nội dung**, không lấy chrome trình duyệt.

### 1.4 Hai ảnh hỏng — do tôi
- GIF Persona Bar `[tile-13]`: ô xám phẳng 660×370, **không có gì**, chỉ một sọc navy 40px bên trái. Trông như ảnh lỗi.
- Ảnh docs `[tile-15]`: khung cao 490px, nội dung chỉ 190px trên, **300px trắng bên trong khung**.
⇒ Cả hai do chụp quá sớm / chụp full-viewport khi trang đích còn ngắn.

### 1.5 Chú thích cãi nhau với ảnh — do tôi
Tôi viết *"Seventy-three live demos"* ngay dưới ảnh đang hiện **"34 live demos"** (chụp trước khi bổ sung thẻ). ⇒ Chụp lại `article-gallery.png`.

### 1.6 Còn lại
- **Byline lỗi mã**: `Jul 29, 2026 Â· 7 min read`. Dấu `·` chỗ khác lại đúng ⇒ lỗi khu trú một đường ghi (UTF-8 U+00B7 đi qua đường Latin-1). Còn xuất hiện **bên trong** một ảnh chụp (`↗ Popular this week`) ⇒ sửa xong phải chụp lại.
- **4 ảnh stock** (bảng màu, bo mạch, laptop Matrix, chậu cây) + chú thích của bài khác (*"Rehearsal, an hour before doors"*), credit "Unsplash", lại được badge "4 PHOTOS" quảng cáo ở hero. **Owner đã chốt: BỎ HẲN.** Xem §2.2.
- **Ghi chú biên tập lọt vào bài**: *"A more article-like introduction to why MegaForm matters."* ngay sau tiêu đề đầu, style như sapo.
- **Phân cấp tiêu đề phẳng**: 8+ mục tính năng ~40–44px, tiêu đề mục thật ~55px; ở `[07–08]` list item **bằng hệt** section thật ⇒ 5 tiêu đề ngang hàng. Giả thuyết: component card/grid rơi về `h2/h3` trần, mà **skin DNN style thẳng `h1..h6`** (bẫy đã có trong bộ nhớ dự án).
- **Chữ thân bài serif, mọi thứ khác sans.**
- Một đoạn văn tôi thêm **lặp gần nguyên văn** nội dung đã có trong ảnh ngay trên nó.

---

## 2. Hai lỗi treo, chưa tìm ra căn nguyên

### 2.1 `view_count` reset về 1 sau MỖI lần nâng cấp module
Tái hiện qua **3 lần cài liên tiếp** (1.17.4 → 1.17.5 → 1.17.6) nên không phải trùng hợp. Bộ đếm chạy đúng giữa các lần (tăng 1 mỗi lượt).
Hai nghi can cần loại trừ:
- `EnsureDocMetricFields` chạy mỗi request; nếu phép kiểm tra "trường đã có" đọc nhầm schema thì nó gọi `Forms.UpdateFormAsync` liên tục.
- Chính `UpdateFormAsync` xoá submission values khi SchemaJson đổi.
**Cách kiểm chứng:** ghi lại `SchemaJson` trước–sau một lần cài; đọc `view_count` ngay trước và ngay sau khi cài **mà không tải trang nào ở giữa**.

### 2.2 Console Blogs KHÔNG lưu `content_type` — lỗi thật của module
Màn Posts có select `content_type` (Blog Post / News / Guide / … / Gallery / Liveblog / Video). Đổi `Gallery` → `Blog Post`, POST trả **200**, đọc lại **vẫn `Gallery`**. Thân bài thì lưu bình thường ⇒ không phải lỗi phiên hay lỗi gửi.
⇒ **Mọi thay đổi định dạng bài đều trôi mất im lặng**, không riêng bài này. Đây là đường đúng để bỏ khối gallery (owner đã chốt bỏ). Đường tạm: sửa thẳng bản ghi 291 trong form **378** `Blog Publishing Starter`, hoặc xoá 4 bản ghi gallery trong form **383** `Blog Gallery Images`.

---

## 3. ID cần dùng trên production

| thứ | giá trị |
|---|---|
| Bài đang sửa | submissionId **291**, slug `modern-forms-workflow-self-hosted-control` |
| Console Blogs | tab **1592** (`?view=posts&edit=291`, `&view=formats`, `&view=media`) |
| Trang tài liệu | tab **1595** `/MegaFormDocsT`, module **22056** (channel `docs`, form 385, comments form 380) |
| Trang gallery | tab **1554** `/MegaForm`, module HTML **21980** |
| Form blog | 378 Publishing Starter · 380 Comments · 382 Templates · 383 Gallery Images · 384 Live Updates |
| Trang demo mới | tab **1596–1634**, form **386–425** |

**Sửa module HTML 21980:** `MegaForm/ctl/Edit/mid/21980?popUp=true` — ⚠️ **thiếu `?popUp=true` thì KHÔNG ra editor**, chỉ ra trang xem (49 KB, 0 textarea) và mất cả buổi để hiểu. Field `dnn$ctr21980$EditHTML$txtContent$txtContent`, nút `dnn$ctr21980$EditHTML$cmdSave`. Phiên hay rớt ⇒ **thử lại 3–4 lần**.

---

## 4. Việc chưa xong

- [ ] Sửa 46 lỗi bố cục ở §1 — thứ tự khuyến nghị: **1.1 dải trắng** (một sửa CSS, gỡ phần lớn xấu xí, có lợi cho **toàn bộ blog**) → **1.2 nhãn mồ côi** (kiểm giả thuyết icon trước) → **1.3/1.4/1.5 chụp lại ảnh** → chữ nghĩa.
- [ ] Bỏ khối gallery khỏi bài 291 (§2.2).
- [ ] Root-cause `view_count` reset (§2.1).
- [ ] Gói DNN **02.00.016** Production + Trial đã dựng (6,91 MB mỗi bản, chốt chặn Azure xác nhận sạch) nhưng **chưa cài lên site nào**.
- [ ] Working tree còn **~243 file thay đổi có sẵn từ trước phiên** — chưa xem, chưa commit. Và `git add -A` gom tới **27.818 file** ⇒ repo thiếu `.gitignore` nghiêm trọng, nên xem lại trước khi commit hàng loạt.

---

## 5. Bẫy kỹ thuật đã trả giá trong phiên

- **`ConvertFrom-Json` của PowerShell 5.1 trả CẢ MẢNG như MỘT đối tượng.** `@($raw | ConvertFrom-Json)` ⇒ mảng 1 phần tử chứa cả mảng; vòng lặp chạy đúng 1 lần, thuộc tính thành `System.Object[]`, **không ném lỗi nào**. Dùng `ConvertFrom-Json $raw` rồi `foreach` thẳng. Cắn **3 lần**.
- **`Set-Content -Encoding utf8` để lại BOM** ⇒ `JSON.parse` của Node từ chối thẳng.
- **`@if` ở mức câu lệnh trong khối `else { }` là ngữ cảnh CODE** ⇒ phải viết `if` trần. Sai là RazorHost **nuốt lỗi thành trang trắng HTTP 200**.
- **Ký tự gạch dài trong file `.ps1`** ⇒ PowerShell 5.1 đọc ANSI, vỡ chuỗi, báo "Unexpected token". Giữ script thuần ASCII.
- **`PinToNewPage` tạo trang KHÔNG có quyền xem** (mặc định chỉ Administrators) mà **vẫn trả HTTP 200** cho khách — phải soi chuỗi `txtUsername`/`Remember Login` mới biết.
- **Script Node trong scratchpad không resolve được `playwright`** — phải nằm trong cây repo.
