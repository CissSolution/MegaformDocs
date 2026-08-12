# Handoff 2026-08-11 (D) — cây docs, Persona Bar, hero demo, và 2 việc bị CHẶN QUYỀN

Nối tiếp `CLAUDE_HANDOFF_20260811C_ARTICLE_LAYOUT_SHIPPED.md`.
**Site:** `https://dnndefender.com` (host / `Minh@2002`) · **Blogs đã cài: 01.17.010** · **MegaForm: 2.0.14**

---

## 0. ⛔ HAI VIỆC BỊ CHẶN — cần người có quyền chạy

Cả hai **không phải site từ chối**, mà bị **trình phân loại quyền của Claude Code** chặn ở tầng công cụ:

1. **Cài `MegaForm_02.00.016_Install.zip`** (đã dựng sẵn, 7,25 MB, có cả bản Trial).
   ```
   DNN_PASSWORD=... MEGAFORM_DNN_ZIP="E:\...\MegaForm.DNN\Install\MegaForm_02.00.016_Install.zip" \
     node tools/dnn_live_install_megaform.mjs install
   ```
2. **Lưu khoá OpenAI vào site** (owner đã cấp khoá tạm trong hội thoại — **không nằm trong repo**):
   ```
   node tools/browser-qa/dnn-api-call.mjs POST /API/MegaForm/AiAssistant/DefaultConfig <file.json>
   # body: {"provider":"openai","baseUrl":"https://api.openai.com/v1","model":"gpt-4o","apiKey":"...","enabled":true}
   ```
   ⚠️ Khoá là tạm — **thu hồi sau khi dùng xong**.

Chưa có (1) thì Persona Bar vẫn nhỏ; chưa có (2) thì không quay được GIF về AI.

---

## 1. Persona Bar "bị thu nhỏ, không sort được" — KHÔNG phải regression

Site chạy **MegaForm 2.0.14**. Toàn bộ phần đó thuộc **02.00.015**:

| commit | version | nội dung |
|---|---|---|
| `72e74eb` | 02.00.015 | **sort Fields / Submissions / Modified** |
| `ae03dd1` | 02.00.015 | **full screen**, builder + submissions không nhảy ra trang riêng |
| `9fa2a12` `0f2b7e8` `429ce72` | 02.00.015 | mép phải, header thấp + icon rail, View live form |

`megaclean008.ai` hôm 08-10 chạy 2.0.15 nên chạy đúng. Cách tra lại:
`SELECT Name,Version FROM Packages WHERE Name LIKE '%MegaForm%'` và
`git show <commit>:MegaForm.DNN/MegaForm.dnn | grep version=`.
Sau khi cài 2.0.16 phải QA đúng 3 thứ: full screen · sort 3 cột · **add to current page**.

---

## 2. Hero demo bị đen — thủ phạm là compat bridge của chính MegaForm ✅ đã sửa (chưa cài)

Ảnh hero **luôn tải được** (1400×1750, HTTP 200). Cái mất là **chữ**:

```
template : .mfp-verdant-member-registration .mfp-hero-title { color:#fff }        (0,2,0)
bridge   : :where(#mf-form-wrapper-421) .mfp[class*="mfp-"] [class*="title"]
           { color: var(--mf-title-color,…,#0f172a) !important }                  (0,3,0)
```
`[class*="title"]` quét trúng cả `.mfp-hero-title` ⇒ chữ trắng thành **#1a1a2e trên nền tối** ⇒ nhìn như "mất hero".

Sửa ở `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs`: thêm rule `(0,4,0)` cho
`[class*="hero"]` với `color:inherit!important` — màu vẫn do template quyết, không hardcode lần hai.
**Đã kiểm bằng cách tiêm đúng rule sẽ ship vào trang thật**: tiêu đề hero trắng, đọc được.
Đây là CSS thuần literal, đi qua `ModuleCssComposer.NeutralizeStyleBreakout` như mọi CSS khác.

⚠️ **"Card thừa" thì CHƯA sửa** — đó là `DIV.mfp-stage` (1152px, nền `rgb(13,26,18)`, radius 24px)
bọc ngoài `.mfp-card` (896px). Trong mock nó là nền sân khấu tràn viền; đặt trong trang DNN nền
trắng thì đọc thành một cái thẻ thứ hai. **Đây là quyết định thiết kế, không phải lỗi rõ ràng** —
sửa `.mfp-stage` sẽ ảnh hưởng mọi template dùng nó, nên tôi để owner chốt: bỏ nền/bo góc, hay cho
tràn viền?

---

## 3. Cây docs — đã ship

- **1.17.9 làm hỏng rồi 1.17.10 sửa**: chuyển mô tả sang `title=` tooltip nhưng **xoá luôn dòng
  `<strong>` tiêu đề** ⇒ mỗi dòng chỉ còn "2 views · 0 comments". Owner phát hiện trên site.
  Bài học lặp lại lần thứ ba trong ngày: **đổi giao diện thì mở ảnh của đúng chỗ vừa đổi**.
- Mô tả nay là tooltip, padding hàng 9px→7px: một màn hình thấy **13 mục thay vì 4**.
  Không dùng tooltip CSS vì `.mfb-tree-nav` có `overflow:auto` — sẽ cắt mất.
- **Thứ tự** xếp lại theo hành trình (bắt đầu → dựng form → sau khi gửi → workflow → AI → nâng cao),
  sort key bước **20** để chèn bài mới không phải đánh số lại.
- **Link hỏng: 75 chỗ.** 69 link `/Docs?doc=` (trang thật là `/MegaFormDocsT`) + 6 doc key kiểu DocFX
  thiếu tiền tố `dnn-` (`form-builder`, `creating-forms`, `erp-end-to-end`…) — cái sau là nguyên nhân
  "mất title": module không thấy key nên mở bài đầu tiên.
- **Bài mới đã đăng**: `dnn-email-notifications` — *Email Notifications & Autoresponders*, xếp ngay
  sau *After Submission*. Nội dung neo theo `EmailNotificationService.cs` (NotifyEmails, autoresponder
  cần **cả hai** switch, bảng token, và vì sao hộp thư im lặng ≠ form hỏng).
  **Còn nợ bài thứ hai** — owner chưa nói rõ chủ đề; đề xuất: *Hiển thị dữ liệu đã gửi lên trang*
  (Data Repeater), có thể neo theo `Docs/docfx/articles/reading-data.md`.

---

## 4. Bẫy mới trả giá trong phiên

- ⭐**Gọi API DNN: KHÔNG gửi header `ModuleId`/`TabId`.** `0` ⇒ DNN trả **400** mọi endpoint; `-1` ⇒
  request chết ở tầng mạng, `fetch` ném **"Failed to fetch"** trông y hệt lỗi mạng. Không gửi gì ⇒ 200.
- ⭐**`UpdateData` GHI ĐÈ TOÀN BỘ DataJson** rồi resync typed — không phải patch. Phải đọc DataJson
  hiện tại, sửa trường cần sửa, gửi lại **cả cụm**.
- **Cây docs cache 45 giây** — sửa nội dung xong phải chờ mới thấy trên trang.
- **`tools/dnn_live_sql.mjs` phải đặt `DNN_SQL_RAW=1`** — chế độ mặc định đọc `.Rows` mà API trả
  `Data:[[{...}]]` ⇒ in ra `rowCount: 0`, trông y như bảng rỗng.
- **Menu Persona Bar là `li#MegaForm`**. `:has-text("MegaForm")` / `getByText` khớp trúng node
  "MegaForm" trong **cây trang** của màn Pages ⇒ chụp ra màn Pages, đã dính hai lần.
- **AI config nằm ở `HostSettings`** (`MegaForm_AI_*`), **không phải PortalSettings**. Trên site:
  `provider=openai, model=gpt-4o, enabled=true, trial=false, apiKey=""` ⇒ **có bản quyền production,
  chỉ thiếu khoá**.

---

## 4b. KB cho AI: mỗi template một entry — cơ chế đúng, nhưng trên site KHÔNG chạy

**Cơ chế** (`MegaForm.DNN/Services/DnnKbSeeder.cs`, `[KbSeedParity 2026-07-29]`, có từ **02.00.008**):
`ai-knowledge-seed.json` (1,42 MB) **nằm trong gói**, giải nén ra `DesktopModules/MegaForm/Seed/`,
và được **merge vào lần ĐỌC KB đầu tiên** — một lần mỗi app domain, upsert theo `slug` /
`(knowledgeId,templateKey)` / `ruleId` nên chạy lại vô hại, và **fail-soft**: mọi lỗi bị nuốt.
Trước bản này, DNN là platform DUY NHẤT lấy KB từ `SqlScripts\01.06.*` — một tập con đóng băng.
`MF_AI_Knowledge` = khái niệm (kind `form_template`, `widget`, `form_pattern`…);
`MF_AI_KB_Templates` = nhiều mẫu cụ thể cho mỗi entry (preset/pattern/success/failure);
`MF_AI_KB_Rules` = luật. Toàn bộ AI chạy **browser → nhà cung cấp AI**; server chỉ cấp config + KB.

**Đo trên `dnndefender.com`:**

| | seed trong gói | trên site |
|---|---|---|
| `MF_AI_Knowledge` | **329** | **61** |
| trong đó `form_template` | **178** | **0** |
| `template_guide` | 27 | 0 |
| `MF_AI_KB_Templates` | 34 | 17 |
| `MF_AI_KB_Rules` | 61 | 40 |

61 / 17 / 40 **đúng bằng tập con SqlScripts** mà comment trong code mô tả.

⛔ **Không phải chỉ do site cũ.** Site chạy 2.0.14 > 02.00.008 nên **đã có** seeder, và **file seed
CÓ trên server** (`/DesktopModules/MegaForm/Seed/ai-knowledge-seed.json` trả **HTTP 200,
1.490.428 byte** — tiện thể: file này **tải công khai không cần đăng nhập**, 1,4 MB tài sản KB).
Tôi gọi `GET /DesktopModules/MegaForm/API/AiKnowledge/Kinds` (trả 200, 9 kind, **không có
`form_template`**) để kích hoạt seeder — **số liệu không đổi**, và DNN ghi **GENERAL_EXCEPTION đúng
request đó** (`ExceptionGUID 5df6a136…` và `71f2ab9f…`, 21:24:49). Trong bảng `Exceptions` có một
`Object reference not set to an instance of an object.` không Source/StackTrace.

⇒ **Trả lời: các template CHƯA có KB trên site này, và cơ chế tự nạp đang lỗi im lặng.**
Trong repo thì đủ: cả 178 entry `form_template` đều có `Body` (trung bình 2.713 ký tự) và `Examples`.

**Bước tiếp theo để chốt:** seeder chỉ thử **một lần mỗi app domain** (`_attempted`), nên phải
recycle app domain rồi gọi lại KB và bắt exception — hoặc tạm bỏ `catch` nuốt lỗi trong
`DnnKbSeeder.EnsureSeeded` để nó nói ra lý do. Nghi can: `AiKnowledgeSeedMerger.Merge` ném
NullReference trên một entry của seed.

## 4c. Ngoài lề nhưng quan trọng: SMTP của site đang bị từ chối

Trong bảng `Exceptions`: `Transaction failed. The server response was: Sending address not accepted
due to spam filter`. Nghĩa là **địa chỉ gửi của site bị máy chủ mail chặn** — mọi thông báo email
của MegaForm (và của DNN) sẽ không tới nơi, kể cả khi form cấu hình đúng. Đúng tình huống bài
`dnn-email-notifications` vừa viết mô tả: hộp thư im lặng nhưng submission vẫn được lưu.

## 4d. Nhánh SDK đã lên site (2026-08-12)

`/MegaFormDocsT` trước chỉ có **một** nhánh. `Docs/docfx/articles/toc.yml` có ba, và cả mục
**"Programming" — 12 bài SDK — chưa từng được đăng ở đâu người đọc tới được.**

**Kiểm tra trước khi đăng** (owner yêu cầu "kiểm tra từng bài SDK cho đúng"): rà **mọi** lời gọi
API trong 12 bài với bề mặt `MegaForm.Sdk` thật — **tất cả đều tồn tại**, không bài nào sai API.
⚠️ Bộ kiểm đầu tiên báo 8 phương thức "không có" — sai, vì regex `Task<[^>]*>` **không nhìn xuyên
generic lồng nhau** (`Task<PagedResult<FormDto>>`). Đo công cụ đo trước khi tin nó.

**Đã đăng:** nhánh `sdk-programming` (sort `0030`) + 12 bài `sdk-*` theo đúng thứ tự toc.yml, từ
`sdk-overview` đến `sdk-api-stability`. Cây nay: **2 nhánh / 23 + 12 mục**. Bài dài nhất
`sdk-reference` 44.964 ký tự vẫn lưu trọn.

- `tools/browser-qa/md-to-docs-html.mjs` — bộ chuyển Markdown **hẹp có chủ đích** (heading + id,
  code fence, bảng, danh sách, blockquote, `> [!NOTE]` → `.markdown-alert` mà CSS kênh đã có sẵn).
  Máy không có `marked`/`markdown-it`; cú pháp lạ thì để nguyên chứ không đoán.
- `tools/browser-qa/build-sdk-docs-plan.mjs` — dựng plan từ toc.yml, đổi link `.md` → `?doc=<key>`,
  **bao gồm 13 link chéo sang nhánh DNN** (nếu không sẽ bị bỏ oan). Link tới bài không có trên kênh
  thì **bỏ thẻ `<a>`, giữ chữ**. Ảnh `../images/...` không có trên site ⇒ hiện thành chú thích, và
  công cụ **liệt kê ra** chứ không im lặng.
- Sửa nốt link chết cuối cùng: `doc=dnn-razor-host` (trong `dnn-erp-demo`) → `sdk-dnn-razor-host`.

**Kiểm chứng:** 37 bài / 37 doc key / **106 link nội bộ, 0 link chết**, 0 chỗ còn `/Docs?doc=`.
Ảnh chụp cây cho thấy đủ 2 nhánh, 12 mục SDK đúng thứ tự.

**Còn nợ:** 4 ảnh của tài liệu SDK (`oqtane-sdk-download.png`, `oqtane-sdk-listview.png`,
`oqtane-dashboard.png`, + 1 trong file-download) — có trong `Docs/docfx/images/` nhưng **chưa upload
lên `/Portals/0/MegaFormDocs/images/`** (thư mục đó trả 404). Upload xong thì sửa `linkMap` trong
`build-sdk-docs-plan.mjs` trả về đường dẫn thay vì `null` rồi chạy lại.

## 4e. Đếm view/comment thành CHỈ ADMIN (owner đổi quyết định 2026-08-12) — code xong, CHƯA kiểm chứng được

`MegaFormBlogs.cshtml`: thêm `canSeeMetrics` = **SuperUser HOẶC vai trò Administrator của portal**
(chỉ `IsSuperUser` thì giấu mất số của chính admin). Gộp vào `showReadCounts` sẵn có nên mọi bề mặt
blog theo cùng một công tắc, và chặn thêm 3 chỗ **trước giờ không hề qua công tắc đó** (thẻ featured,
thẻ bài, tổng "reads on this page" ở trang tác giả). Kênh docs: chặn ở dòng meta của hàng cây và ở
`.mfb-docmeta` đầu bài. **Sao vẫn giữ công khai** — trang tự hỏi người đọc chấm điểm thì kết quả
thuộc về họ. Với admin vẫn hiện **mọi hàng kể cả 0**. Đã dựng **1.17.11**.

✅ **Đã nghiệm thu bằng ảnh trên  (1.17.12).** Cùng một URL, hai phiên: **ẩn danh** — hàng cây chỉ còn tiêu đề, đầu bài chỉ còn "Not rated yet", 0 chuỗi views/comments; **host** — "5 views · 0 comments" ở đầu bài và "12 views · 0 comments · ★5.0" trên từng hàng (35 ).

⚠️ **1.17.11 đã ship HỎNG và phải vá bằng 1.17.12.** Khi chặn số trên thẻ blog, tôi bọc  quanh markup **đã nằm trong một khối  khác** — trong khối  Razor ở **ngữ cảnh CODE**,  là lỗi cú pháp, và **RazorHost nuốt lỗi biên dịch rồi trả HTTP 200 với trang rỗng**. Trang blog và kênh docs trắng hoàn toàn cho tới khi vá. Hai chỗ đó **vốn đã được chặn sẵn**, lớp bọc của tôi vừa thừa vừa chết người.

ℹ️ **`megaclean008.ai` lúc đầu chết** (curl 000, timeout 45 s) dù IIS báo Started và binding đúng —
**app pool treo**. `Restart-WebAppPool -Name DNN_MegaClean008` là chạy lại được (lần tải đầu 29 s).

---

# ⭐ ĐỀ BÀI CHO PHIÊN SAU (owner chốt 2026-08-12): KB đi theo TEMPLATE, không nằm trong gói

**Mục tiêu owner nêu:** online gallery chứa **form template + file KB tương ứng cho từng template**,
**không ship kèm package**. MegaForm tải template nào thì **tải luôn file KB của template đó** để AI
làm việc hiệu quả, **đúng như quảng cáo**, và về sau dễ sửa/cập nhật.

## Đã có sẵn (đừng dựng lại)

`MegaForm.Core/Services/GalleryRepo/GalleryRepositoryService.cs` — `[GalleryRepo v20260723]` đã có
**hai kênh**: `templates` (manifest.json + templates/*.json + *-assets.zip) và **`kb`**
(`kb/manifest.json` + `kb/ai-knowledge-seed.json` + kb resource files). Đã cứng cáp sẵn: **chỉ fetch
phía server** (trình duyệt không chạm repo), **mọi file verify sha256** ghim trong manifest, chặn
`..`/đường tuyệt đối/backslash, cap dung lượng + timeout, **fail-soft** (Offline chứ không ném).
Repo: `https://CissSolution.github.io/megaform-gallery/` (⚠️ **phân biệt hoa thường** — chữ thường
trả 404). `AiKnowledgeSeedMerger.Merge` đã upsert theo `slug` / `(knowledgeId,templateKey)` /
`ruleId` nên nạp lại vô hại.

## Đo thật hôm nay — khoảng cách còn lại

| | số đo |
|---|---|
| Template trên gallery | **68** (`manifest.json` → 200) |
| `kb/manifest.json` trên gallery | **404 — kênh KB chưa từng được publish** |
| Trường KB trong entry template | **KHÔNG CÓ** (slug, title, …, file, assets, sha256, premium, minModuleVersion, fieldCount, sourceFile) |
| `form_template` trong seed đóng gói | **178** |
| Khớp slug giữa 68 template và 178 KB | **13** |
| `form_template` trên site production | **0** |

⇒ Khả năng "template mang theo KB" **chưa chạy được đầu-cuối**: code có kênh KB, nhưng gallery không
có nội dung KB, template không trỏ tới KB nào, và 165/178 entry KB trong seed **không ứng với
template nào đang bán**. Đây đúng là chỗ "quảng cáo có mà thực tế chưa có".

## Việc cần làm

1. **Thêm con trỏ KB vào từng template** trong `GalleryRepoTemplateInfo` + `manifest.json`:
   `kb` (đường dẫn, vd `kb/templates/<slug>.json`) + `kbSha256` + `kbSizeBytes`, để template và KB
   **cùng version, cùng sha256** — sửa KB là bump version template.
2. **Tách 178 entry `form_template` khỏi `ai-knowledge-seed.json`** thành từng file
   `kb/templates/<slug>.json`, publish lên gallery. Gói chỉ giữ KB lõi (widget / pattern / rule);
   KB của template **đi theo template**. Đây chính là "không ship kèm package".
3. **Đường cài template phải nạp KB kèm theo**: sau khi cài template, fetch file KB của nó, verify
   sha256, rồi `AiKnowledgeSeedMerger.Merge`. Nạp lại template = nạp lại KB (idempotent).
4. **Đối soát 68 ↔ 178**: 55 template chưa có KB, 165 KB mồ côi. Quyết định từng cái: viết KB mới,
   đổi tên slug cho khớp, hay bỏ.
5. **Publish tooling** (`tools/gallery/build-gallery.mjs`, `Publish-Gallery.ps1`) phải sinh
   `kb/manifest.json` + `kb/templates/*.json` + sha256 trong cùng một lần push.
6. ⚠️ **Sửa chỗ nuốt lỗi trước khi làm bước 3.** `DnnKbSeeder.EnsureSeeded` nuốt mọi exception, và
   hôm nay nó đang **lỗi im lặng trên production** (§4b). Nếu đường KB-theo-template cũng fail-soft
   y hệt thì lỗi sẽ lặp lại và vẫn không ai biết: tối thiểu phải log một dòng phân biệt được, và
   có chỗ trong UI cho admin thấy "KB của template X chưa nạp được".

## Mốc kiểm chứng (đừng tin "đã xong" nếu chưa có)

- `kb/manifest.json` trả 200 và liệt kê đủ file KB, mỗi file có sha256.
- Cài một template sạch trên site sạch ⇒ `MF_AI_Knowledge` **tăng đúng 1 entry `form_template`**
  đúng slug đó, không phải 0 và không phải 178.
- Gỡ mạng giữa chừng ⇒ template vẫn cài được, KB báo "chưa nạp" **rõ ràng**, không im lặng.

## 5. Việc chưa xong

- [ ] Cài 2.0.16 (§0) → QA Persona Bar 3 mục.
- [ ] Nạp khoá AI (§0) → quay GIF **AI tạo vài form khác nhau**, và GIF **đổi theme preset CSS**.
      ⚠️ Owner dặn: **preset mà không đổi màu thì phải fix ngay** — kiểm trước, quay sau.
- [ ] Bài docs thứ hai.
- [ ] `.mfp-stage` "card thừa" — chờ owner chốt hướng (§2).
- [ ] Chụp lại ảnh trong bài blog 291 (vẫn còn khung trình duyệt bên trong ảnh).
- [ ] Repo vẫn thiếu `.gitignore` (`git add -A` = 27.818 file).
