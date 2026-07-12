# SPEC — Tài liệu DocFX + GIF demo trả lời 7 câu hỏi của khách (làm ở PHIÊN SAU)

> **Người viết:** phiên 2026-07-12. **Người làm:** phiên sau.
> **Mục tiêu:** Bổ sung tài liệu DocFX trả lời **đúng và trung thực** 7 câu khách hỏi, mỗi tính năng
> kèm **1 GIF demo** ghi trên site thật (giống cách đã làm cho `creating-forms.md` với 4 GIF).
> **Nguyên tắc số 1:** KHÔNG viết vào tài liệu bất cứ điều gì chưa tự tay chạy thử. Khách sẽ đọc cái này để ra quyết định mua.

---

## 0. TRẠNG THÁI KIỂM CHỨNG — đọc kỹ trước khi viết một chữ nào

Phiên 07-12 đã **tự tay kiểm chứng** một số câu. Cái nào đã verify thì dùng lại bằng chứng, cái nào chưa thì
**phải chạy thử trước khi viết**.

| # | Câu hỏi của khách | Trạng thái | Bằng chứng / việc phải làm |
|---|---|---|---|
| Q1 | Thu thập dữ liệu form rồi chuyển sang thanh toán có mượt không? | ✅ **ĐÃ E2E VỚI THẺ THẬT** (1.7.104) | Đã quẹt thẻ test thật, tiền chuyển thật, 5 đòn tấn công đều bị chặn → §Q1 |
| Q2 | Xoá field đi thì dữ liệu cũ còn trong DB và còn truy cập được không? | ✅ **ĐÃ VERIFY** | Chạy thật trên :5123 — xem §Q2. Câu trả lời: **CÓ** (có 1 lưu ý quan trọng) |
| Q3 | Phân quyền view/readonly ở mức field & section theo role/user | ✅ ĐÃ SHIP (1.7.101) | `showIf`/`readOnlyIf` + tab Access; enforce server-side |
| Q4 | Một workflow áp cho nhiều form (hoặc dùng workflow phức tạp có sẵn) | ✅ ĐÃ SHIP | Workflow Library (`MF_FormWorkflows` mapping) |
| Q5 | Task tự động chảy vào inbox của user | ✅ ĐÃ SHIP + vừa vá | My Inbox; submitter name vừa fix ở 1.7.103 |
| Q6 | Thiết kế được workflow phức tạp không? | ✅ ĐÃ SHIP | BPMN editor + 15 node executor |
| Q7 | Search/filter tuỳ biến trên data grid | ✅ ĐÃ SHIP | Advanced filter + Presets |
| Q8 | Tabbed form có trong thư viện template | ✅ **VỪA SHIP 1.7.103** | "Tabbed Account Setup", 6 tab, 19 field |

---

## Q2 — CÂU KHÓ NHẤT, ĐÃ CÓ CÂU TRẢ LỜI CHẮC CHẮN (dùng nguyên si)

**Khách hỏi:** *"Nếu một field được thêm vào, dùng một thời gian, rồi sau đó bị xoá — dữ liệu đã thu thập
qua field đó có còn được giữ trong database và còn truy cập được không?"*

**Trả lời: CÓ.** Phiên 07-12 đã chứng minh bằng thí nghiệm thật trên :5123 (form 6, submission 106):

| Bước | Kết quả thực đo |
|---|---|
| Trước khi xoá | `phone_number` = `"0901234567"`, label `"Phone"` |
| Xoá `phone_number` khỏi form, restart | Field **biến mất khỏi form** (schema còn 18 field) |
| Mở lại bản ghi cũ | ✅ **Vẫn hiện `Phone: 0901234567`** |
| `MF_Submissions.DataJson` | ✅ Vẫn giữ nguyên `"phone_number":"0901234567"` |

**VÌ SAO nó hoạt động — đây là phần phải giải thích trong tài liệu (đừng chỉ nói "yes"):**

MegaForm lưu **hai lớp** cho mỗi lần nộp:
1. **`MF_Submissions.DataJson`** — blob JSON thô của đúng những gì người dùng gửi. Sửa/xoá field trong form
   **không bao giờ** đụng tới dữ liệu đã lưu.
2. **`MF_SubmissionValues`** — mỗi field một dòng, **đông cứng cả `FieldKey` + `FieldLabel` + `FieldType` + giá trị
   ngay tại thời điểm nộp** (snapshot). Đây mới là thứ khiến dữ liệu *còn đọc được*: màn hình chi tiết bản ghi
   đọc từ **snapshot đã lưu**, KHÔNG phải từ schema hiện tại (`SubmissionQueryService.GetDetail` →
   `_submissions.GetValues(...)`). Nên field đã xoá vẫn hiện đúng nhãn cũ và giá trị cũ.

**⚠️ LƯU Ý PHẢI GHI VÀO TÀI LIỆU (trung thực, đừng giấu):**
- **Cột trong data grid thì biến mất** — grid dựng cột theo **form hiện tại**. Dữ liệu không mất, chỉ là cột không
  còn hiển thị. Muốn xem lại → mở chi tiết bản ghi, hoặc export.
- **Fallback:** nếu một submission **không có** dòng snapshot (bản ghi rất cũ từ trước tính năng snapshot, hoặc
  lần ghi snapshot bị lỗi), màn hình chi tiết sẽ **suy ra từ schema hiện tại** → khi đó field đã xoá **sẽ không hiện**
  (dù giá trị vẫn nằm trong `DataJson`). Kiểm tra bằng cờ `hasSnapshot` trong response.
- **PHẢI TỰ KIỂM TRA THÊM:** CSV/JSON **export** có kèm field đã xoá không? Phiên 07-12 **chưa kiểm tra cái này**.
  Chạy `GET /api/MegaForm/Submissions/Export?formId=6&format=csv` sau khi xoá field → xem cột `Phone` còn không.
  **Kết quả thế nào thì viết đúng thế đó.**

**Cách tái hiện thí nghiệm (đã có sẵn, chỉ việc chạy lại để quay GIF):**
```
1. :5123, form 6 ("Employee Onboarding" tabbed) có submission 101–106 với phone_number đã điền
2. Builder → xoá field "Phone" → Save → (restart site: SSR bake schema)
3. Submissions → mở bản ghi 106 → "Phone: 0901234567" VẪN HIỆN
```
⭐⭐ **BẪY CHẾT NGƯỜI khi tự sửa schema bằng SQL:** `SchemaJson` chứa **CẢ `fields` (thường) LẪN `Fields` (hoa)**,
mỗi mảng 19 field. Xoá ở một mảng thôi thì field **vẫn còn** (API merge cả hai → schema ra 37 field).
Phải xoá ở **cả hai**. (Sửa qua builder UI thì không dính bẫy này.)

---

## Q1 — THANH TOÁN: ✅ ĐÃ CHẠY THẬT VỚI THẺ THẬT (1.7.104)

**Khách hỏi:** *"Thu thập dữ liệu form rồi chuyển tiếp sang quy trình thanh toán có dễ/mượt không?"*

**Đã kiểm chứng E2E trên site sạch :5124** bằng Stripe test key thật của owner. Toàn bộ số liệu dưới đây là
**đo thật, không suy luận** — dùng thẳng vào tài liệu được.

### ⚠️ E2E ĐÃ TÌM RA 1 BUG NGHIÊM TRỌNG (đã vá → 1.7.104)
**Mọi endpoint payment của Oqtane trong 1.7.103 đều đọc body RỖNG.** Oqtane không đăng ký Newtonsoft với MVC
→ tham số `[FromBody] JObject` **bind = null**. Lưu key trả `"body required"`; create-intent/confirm/capture
cũng không thấy gì. **Smoke test không bắt được** vì nó dừng ở check "chưa có key" — check này chạy **trước khi**
đọc body. Endpoint *trông như còn sống trong khi đang điếc*.
→ Vá: bind `[FromBody] JsonElement` rồi parse (đúng cách `MegaFormController.SaveForm` đã làm từ lâu).
⭐ **Bài học ghi vào tài liệu nội bộ: chỉ E2E mới lộ ra loại lỗi này.**

### Kết quả E2E (sau khi vá) — dùng nguyên si cho tài liệu
| Bước | Kết quả thật |
|---|---|
| Lưu Stripe key qua Payment Settings (Oqtane) | ✅ 200; secret lưu `IsPrivate=1`, đọc lại **đã che** (`sk_test_…`) |
| `create-intent` (ẩn danh, như khách vãng lai) | ✅ Tạo **PaymentIntent thật**: `pi_3TsL7V9…`, 49.99 USD |
| Quẹt thẻ test `4242…` | ✅ Stripe: `status=succeeded`, `amount_received=4999` cents — **tiền chuyển thật** |
| Nộp form với giao dịch đó | ✅ 200, submission #1; DataJson có **`"verified":true`** + số tiền **do gateway xác nhận** |

### 🛡️ 5 ĐÒN TẤN CÔNG — TẤT CẢ ĐỀU BỊ CHẶN (đây là điểm bán hàng mạnh nhất, PHẢI quay GIF)
| # | Tấn công | Server trả lời |
|---|---|---|
| 1 | Khai giá 1.00 USD trong khi schema là 49.99 | Server **tự dùng giá của mình** — Stripe xác nhận intent là **4999 cents** |
| 2 | Khai `status:"paid"` với transactionId **bịa** | ❌ *"Payment could not be verified"* |
| 3 | **Dùng lại** giao dịch đã trả cho lần nộp thứ hai | ❌ *"This payment has already been used by another submission"* |
| 4 | Bỏ qua thanh toán (`requiredPaid=true`) | ❌ *"Payment is required before this form can be submitted"* |
| 5 | Lấy giao dịch trả cho **form 1** đem nộp **form 2** | ❌ *"Payment could not be verified for this form"* |

**DB sau 5 đòn: đúng 2 bản ghi, cả hai đều là người trả tiền thật, cả hai đều `gateway-verified`.
Không bản ghi gian lận nào lọt.**

⭐ **Chi tiết đáng khen (nên nói trong doc):** sau khi đòn #5 bị chặn, **chính giao dịch đó vẫn nộp được cho form 1**
(submission #2) → guard **nhả đặt chỗ khi verify thất bại**, người trả tiền thật **không bao giờ bị khoá nhầm**.

### Điểm bán hàng (giờ đã có quyền viết)
- Payment là **một field trong form**, không phải trang riêng → dữ liệu form và tiền đi **cùng một lần nộp**.
- **Server tự hỏi lại Stripe/PayPal** trước khi lưu — không tin trình duyệt một chữ nào.
- Giá **server tự tính lại từ schema**.
- Chịu tải: hàng đợi 16 call đồng thời + rate-limit theo IP → burst lớn thì người dư nhận "thử lại", **không sập**.
  (⚠️ vẫn **chưa load test 1000 đồng thời** — đừng ghi con số.)

### Cách tái hiện để quay GIF
Script/lệnh đã dùng nằm trong lịch sử phiên 07-12. Tóm tắt: nạp key → tạo form fixed 49.99 requiredPaid →
`create-intent` → confirm bằng `pm_card_visa` (hoặc quẹt `4242 4242 4242 4242` trên UI) → submit.
**GIF `06-payment-bypass-blocked.gif` nên quay đúng 5 đòn ở bảng trên** — khách rất thích thấy tận mắt.

---

## 1. DANH SÁCH BÀI VIẾT DOCFX CẦN TẠO/SỬA

Thư mục: `Docs/docfx/articles/`. Nhớ thêm mục vào `Docs/docfx/articles/toc.yml`.

| File | Nội dung | GIF |
|---|---|---|
| `payments.md` (**mới**) | Q1 — payment field, cấu hình key, luồng người dùng, **server verification**, giới hạn tải | `05-payment-checkout.gif`, `06-payment-bypass-blocked.gif` |
| `data-retention.md` (**mới**) | Q2 — thêm/xoá field, dữ liệu cũ vẫn còn; giải thích 2 lớp lưu trữ + lưu ý cột grid biến mất | `07-field-deleted-data-kept.gif` |
| `field-permissions.md` (**mới**) | Q3 — ẩn/khoá field & section theo role/user (tab Access, `showIf`/`readOnlyIf`), enforce server-side | `08-field-permissions.gif` |
| `workflow-library.md` (**mới**) | Q4 + Q6 — 1 workflow dùng cho nhiều form; thiết kế workflow phức tạp (BPMN, 15 loại node) | `09-workflow-library-multi-form.gif` |
| `workflow-approvals.md` (**đã có**, bổ sung) | Q5 — task tự chảy vào My Inbox; approve/reject/forward/claim | `10-inbox-approval.gif` |
| `submissions-grid.md` (**mới**) | Q7 — advanced filter, chips, presets, search | `11-advanced-filter.gif` |
| `form-templates.md` (**mới** hoặc gộp) | Q8 — thư viện template, **Tabbed Account Setup** (6 tab) | `12-tabbed-template.gif` |

**Ngoài ra:** cập nhật `overview.md` thêm một mục "Câu hỏi thường gặp khi đánh giá sản phẩm" trỏ tới 7 bài trên.

---

## 2. PIPELINE GHI GIF (đã dùng thành công 07-07, không phát minh lại)

Chi tiết đầy đủ trong memory `reference_demo_gif_recording.md`. Tóm tắt phần **hay vấp**:

- **ffmpeg đi kèm Playwright là bản RÚT GỌN**: KHÔNG có muxer gif, KHÔNG có filter `fps`/`lanczos`.
  → Cách làm: quay video → tách **frame PNG** (`-vf scale=W:-1 -r FPS`) → ghép GIF bằng **`gif-encoder-2` + `pngjs`** (thuần JS).
  Hàm `toGif()` trong `recorder-lib.mjs` đã làm sẵn.
- **Blazor interactive không bao giờ bắn `networkidle`** → dùng `waitUntil:'domcontentloaded'` + `waitForSelector`.
- **Con trỏ chuột giả**: inject bằng `addInitScript`; click bằng `el.evaluate(e => e.click())`
  (KHÔNG dùng `mouse.click(x,y)` — từng bấm nhầm sang ô Search).
- **Kích thước**: rộng ~500–640px, 5–7 fps, quality 20–28 → ~4–5 MB cho 15–25 giây.
  Nếu có đoạn chờ lâu (AI/thanh toán) → dùng `toGifSegments()` ghép **2 khoảng thời gian**, bỏ đoạn chết ở giữa.
- **`.gitignore` chặn `*.gif` toàn repo** → đã có ngoại lệ `!demo-gifs/*.gif` + `!Docs/docfx/images/*.gif`.
  GIF mới phải nằm đúng 2 chỗ đó, không thì `git add` sẽ im lặng bỏ qua.
- **Selector builder** (Oqtane): `?mfpanel=dashboard` | `?mfpanel=builder&formId=N` | `?mfpanel=submissions&formId=N`.
  Palette: `.mf-palette-item[data-field-type]`; Save `#mf-btn-save-draft`; Publish `#mf-btn-publish`.
- ⚠️ Builder giữ `beforeunload` → `browser_navigate` **timeout 60s im lặng**. Phải accept dialog trước khi rời builder.
- ⚠️ Panel admin có 2 chế độ (`is-fs` fullscreen vs `is-inline`) — popover chìm dưới nhau ở chế độ này mà không ở chế độ kia.
  **QA cả 2 mode**, đừng tin mỗi headless.

---

## 3. HẠ TẦNG DÙNG ĐỂ QUAY

- ⭐ **:5124 = `Oqtane.MegaForm.Fresh1803`** — site **SẠCH cài từ đúng gói 1.7.103**, DB `Oqtane_MegaForm_Fresh1803`,
  host/`abc@ABC1024`. **Đây là site nên dùng để quay GIF** (đúng bản khách sẽ nhận, có sẵn 17 template).
- :5123 = `Fresh1802` — có sẵn users (mgr.nam / fin.lan / emp.hoa, pass `Qa@2026x`), 2 role (Manager/Finance),
  2 form workflow, 6 submission. **Dùng cho GIF workflow/inbox/permissions** (đỡ phải seed lại).
- ⚠️ User tạo qua API phải `UPDATE AspNetUsers SET EmailConfirmed=1`, không thì login **fail im lặng**.

---

## 4. THỨ TỰ LÀM ĐỀ XUẤT

1. **Q1 payment E2E trước tiên** — vì đây là câu duy nhất **chưa biết chắc kết quả**. Nếu luồng có bug thì
   phải sửa code, và điều đó ảnh hưởng tới cả bản 1.7.104. Làm sớm để còn kịp.
2. Q2 (đã có bằng chứng, chỉ quay lại thành GIF) — nhanh, chắc ăn.
3. Q7 grid filter + Q8 tabbed template — đều đã ship, quay là xong.
4. Q3/Q4/Q5/Q6 — dùng lại :5123 đã seed sẵn.
5. Viết bài + `toc.yml` + copy GIF vào `Docs/docfx/images/`.
6. Push tài liệu: ⚠️ remote `origin` = `github.com/CissSolution/MegaformDocs` (khác repo code!).
   Dùng **worktree từ `origin/master`** để tránh kéo theo hàng chục commit + file chưa commit của nhánh feature.

---

## 5. NHỮNG CÂU **KHÔNG ĐƯỢC** VIẾT (nếu chưa kiểm chứng)

- ❌ "Thanh toán chỉ vài cú click, mượt mà" → chưa chạy giao dịch thật lần nào.
- ❌ "Mọi dữ liệu của field đã xoá đều xem được ở mọi nơi" → **cột grid biến mất**, và bản ghi không có snapshot
  thì không hiện. Phải nói rõ.
- ❌ "Chịu được 1000 giao dịch đồng thời" → mới có hàng đợi + rate-limit; **chưa load test**. Chỉ được nói
  "burst được xếp hàng, phần dư nhận lỗi thử-lại sạch sẽ, không sập" — đúng như đã làm.
- ❌ Bất cứ con số hiệu năng nào chưa tự đo.
