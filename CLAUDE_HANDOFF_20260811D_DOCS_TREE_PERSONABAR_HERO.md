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

## 5. Việc chưa xong

- [ ] Cài 2.0.16 (§0) → QA Persona Bar 3 mục.
- [ ] Nạp khoá AI (§0) → quay GIF **AI tạo vài form khác nhau**, và GIF **đổi theme preset CSS**.
      ⚠️ Owner dặn: **preset mà không đổi màu thì phải fix ngay** — kiểm trước, quay sau.
- [ ] Bài docs thứ hai.
- [ ] `.mfp-stage` "card thừa" — chờ owner chốt hướng (§2).
- [ ] Chụp lại ảnh trong bài blog 291 (vẫn còn khung trình duyệt bên trong ảnh).
- [ ] Repo vẫn thiếu `.gitignore` (`git add -A` = 27.818 file).
