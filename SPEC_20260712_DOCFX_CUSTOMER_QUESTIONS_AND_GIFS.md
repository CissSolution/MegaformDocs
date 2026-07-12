# SPEC — Tài liệu DocFX + GIF cho Q3–Q8 (PHIÊN SAU MỞ RA LÀ QUAY ĐƯỢC NGAY)

> **Người viết:** phiên 2026-07-12. **Người làm:** phiên sau.
> **SCOPE PHIÊN SAU = CHỈ Q3–Q8.** (Q1 payment + Q2 data-retention đã kiểm chứng xong, để làm sau — xem §Phụ lục.)
> **Deliverable:** 5 bài DocFX mới + 6 GIF, mỗi tính năng một demo quay trên site thật.
> **Nguyên tắc số 1:** không viết gì chưa tự tay chạy. Cả 5 tính năng Q3–Q8 **đã ship và đang chạy** trên :5123/:5124 — chỉ việc quay lại.

---

## 0. LÀM THEO ĐÚNG THỨ TỰ NÀY (mở ra là chạy)

| B | Việc | Site | Ghi chú |
|---|---|---|---|
| 1 | Bật 2 site QA + nạp AI key (nếu quay có AI) | :5123 + :5124 | lệnh ở §2 |
| 2 | Dựng harness quay GIF | scratchpad | copy từ phiên 07-07, §4 |
| 3 | Q7 grid filter (dễ nhất, data sẵn 100 dòng) | :5123 form 1 | §Q7 |
| 4 | Q8 tabbed template | :5124 | §Q8 |
| 5 | Q3 field permissions | :5123 form 6 | §Q3 |
| 6 | Q5 inbox approval (data sẵn) | :5123 | §Q5 |
| 7 | Q4 + Q6 workflow library + BPMN | :5123 form 6/7 | §Q4Q6 |
| 8 | Viết 5 bài + toc.yml + copy GIF | — | §3 |
| 9 | Push docs qua worktree | MegaformDocs | §5 |

**5 tính năng Q3–Q8 đều ĐÃ SHIP — không cần code, chỉ quay + viết.**

---

## 1. HẠ TẦNG (đã dựng sẵn, chỉ bật)

| Site | Dùng cho | Dữ liệu có sẵn (đã kiểm 07-12) |
|---|---|---|
| **:5123** `Fresh1802` | Q3, Q4, Q5, Q6, Q7 | Form 1 "Support tickets (legacy ERP)" **100 submissions** → Q7; Form 6 "Account setup — Manager first" (**workflow 2 bước**, 4 sub) + Form 7 "Account setup — Finance only" → Q4/Q5/Q6; roles **Manager + Finance**; users **mgr.nam / fin.lan / emp.hoa** (pass `Qa@2026x`); inbox: 1 pending + 1 claimed + 5 completed |
| **:5124** `Fresh1803` | Q8 | Gói 1.7.104 sạch, **17 template** ở gallery gồm "Tabbed Account Setup" (6 tab, 19 field, icon `fa-table-columns`) |

Host cả hai: `host` / `abc@ABC1024`.
**Bật site** (nếu tắt): `Start-Process Oqtane.Server.exe --urls http://localhost:5123` (WorkingDirectory `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1802`; :5124 = `...Fresh1803`).
⚠️ User tạo qua API phải `UPDATE AspNetUsers SET EmailConfirmed=1` không thì login **fail im lặng** (users trên :5123 đã confirm rồi).

**URL panel** (điều hướng khi quay): `?mfpanel=builder&formId=N` · `?mfpanel=submissions&formId=N` · `?mfpanel=myinbox`.

---

## 2. KỊCH BẢN QUAY TỪNG CÂU (selector thật, đã verify trong code 07-12)

### §Q3 — Ẩn/khoá field & section theo role/user
**Bài:** `field-permissions.md` · **GIF `08-field-permissions.gif`**
**Khách hỏi:** phân quyền view/readonly ở mức field & section theo role hoặc user.
**Đã ship:** tab **Access** trong builder (`showIf` = ẩn hiện, `readOnlyIf` = khoá sửa); enforce **server-side** (không phải ẩn giả ở client).

**Kịch bản quay (site :5123, form 6):**
1. `/?mfpanel=builder&formId=6` (login host).
2. Chọn 1 field (vd "company_name") → panel phải, bấm tab **Access**: click `#mf-tab-link-perms` (label "Access", icon `fa-user-shield`).
3. Trong tab Access, thêm rule **`showIf` role = Finance** (field chỉ Finance thấy) và **`readOnlyIf` role != Finance** (người khác chỉ đọc).
   Code: `MegaForm.UI/src/builder/permissions/field-visibility.ts` (`showIf`/`readOnlyIf`).
4. Save → **mở form bằng 2 tài khoản khác role** (mgr.nam vs fin.lan) cho thấy field ẩn/khoá khác nhau.
   → GIF nên ghép 2 đoạn: cấu hình (builder) + kết quả thật (2 role thấy khác nhau) bằng `toGifSegments()`.
**Điểm bán hàng (đã đúng):** enforce ở server — xem tài liệu `project_20260710_role_based_visibility_prep`. **Đừng nói "ẩn tuyệt đối"** nếu chưa tự kiểm cả submit path.

### §Q7 — Search + filter tuỳ biến trên data grid
**Bài:** `submissions-grid.md` · **GIF `11-advanced-filter.gif`**
**Khách hỏi:** custom search/filter cho data grid.
**Đã ship:** Advanced filter + chips + **Presets** (`MegaForm.UI/src/submissions/submission-advanced-filter.ts`).

**Kịch bản quay (site :5123, form 1 — 100 submissions, đủ để filter thấy rõ):**
1. `/?mfpanel=submissions&formId=1`.
2. Ô search có **scope selector** bên phải (`.mf-advf-searchbox` + `buildScopeSelector`) — chọn field để lọc.
3. Mở command palette lọc: `.mf-advf-cmd` → gõ vào `.mf-advf-cmd-input` → chọn field từ `.mf-advf-cmd-list`.
4. Thêm vài **chip filter** (vd Status = Urgent) → grid 100 dòng co lại → cho thấy con số giảm.
5. Lưu thành **Preset** (nút "Presets") → mở lại preset.
**Số liệu thật để viết:** form 1 có **100 submissions** — quay cảnh lọc từ 100 xuống N. **Đừng bịa số 500k** (site đó là :5120, chưa chắc chạy).

### §Q8 — Tabbed template trong thư viện
**Bài:** `form-templates.md` · **GIF `12-tabbed-template.gif`**
**Khách hỏi:** phiên bản tabbed có trong thư viện template.
**Đã ship + verify 07-12:** "Tabbed Account Setup" ở gallery :5124, **6 tab (Section), 19 field**, shell 7.9KB + CSS 22KB, icon `fa-table-columns`.

**Kịch bản quay (site :5124):**
1. `/?mfpanel=builder` → mở **template gallery** (nút New form / gallery).
2. Tìm thẻ **"Tabbed Account Setup"** (category "business", icon bảng cột) → bấm **Preview** (`.tpl-quickpeek-btn`).
3. Chọn template → builder mở form 6 tab → bấm qua các tab (Account → Company → Billing → Preferences → Security → Review).
4. Publish → mở form live → cho thấy **thanh tab điều hướng tự do** (bấm tab bất kỳ, không phải wizard 1 chiều).
**Điểm khác biệt (đúng):** tabbed = tab bấm tự do; khác wizard (bước tuần tự). Schema: `settings.pageNavigationMode:"tabs"` + `tabbedForm:true` + Section có `premiumStepIndex`.

### §Q5 — Task tự chảy vào My Inbox
**Bài:** `workflow-approvals.md` (đã có, **bổ sung**) · **GIF `10-inbox-approval.gif`**
**Khách hỏi:** task tự động vào inbox của user.
**Đã ship + vừa vá 1.7.104:** My Inbox; submitter name giờ hiện đúng (không còn "Unknown").

**Kịch bản quay (site :5123 — inbox đã có 1 pending + 1 claimed):**
1. Login **mgr.nam** → `/?mfpanel=myinbox` → thấy task đang chờ (submitter hiện tên thật **emp.hoa**, không phải "Unknown" — đây là điểm vừa vá, đáng khoe).
2. Bấm task → pane chi tiết → **Claim** (nút vừa thêm ở 3-pane) → **Approve**.
3. Login **fin.lan** → task bước 2 (Finance) đã chảy sang inbox của fin.lan → Approve → submission "approved".
   → cho thấy **task tự chuyển người** theo bước workflow, không ai phải gán tay.
**Đã verify 07-12:** `MyInbox` trả map `submitters` đúng tên; badge "Assigned to Me" đếm đúng (chỉ task đã claim).

### §Q4 + Q6 — Một workflow cho nhiều form + thiết kế workflow phức tạp
**Bài:** `workflow-library.md` · **GIF `09-workflow-library-multi-form.gif`** + **GIF `13-bpmn-complex.gif`**
**Khách hỏi:** Q4 = 1 workflow áp cho nhiều form? Q6 = thiết kế workflow phức tạp được không?
**Đã ship:** Workflow Library (map `MF_FormWorkflows`); BPMN editor 15 loại node.

**Kịch bản quay (site :5123):**
- **Q6 (BPMN, GIF 13):** builder form 6 → tab **BPMN**: click `#mf-tab-link-workflow` (icon `fa-project-diagram`) → mở editor → cho thấy sơ đồ 2 bước Manager→Finance + các node (Approval, Condition, SendEmail…). Kéo thêm 1 node cho thấy thiết kế được.
  ⚠️ Overlay BPMN `mf-wfrf-overlay` **nuốt click** — bấm "Return to App Builder" trước khi rời.
- **Q4 (multi-form, GIF 09):** cho thấy **cùng một workflow** áp cho form 6 **và** form 7 (cả hai đều "Account setup"). Trong tab BPMN có nút **Library** (`wf-library.ts`) → chọn workflow có sẵn → apply cho form khác. Badge tên workflow hiện trên form.
**Đã verify (phiên trước):** library có sẵn; `MF_FormWorkflows` map. Form 6 = 2 bước, form 7 = assign đích danh fin.lan.

---

## 3. BÀI DOCFX CẦN TẠO (chỉ 5 bài — Q3–Q8)

Thư mục `Docs/docfx/articles/`. Thêm mục vào `Docs/docfx/articles/toc.yml`.

| File | Câu | GIF |
|---|---|---|
| `field-permissions.md` (mới) | Q3 | `08-field-permissions` |
| `workflow-library.md` (mới) | Q4 + Q6 | `09-workflow-library-multi-form`, `13-bpmn-complex` |
| `workflow-approvals.md` (bổ sung — đã có) | Q5 | `10-inbox-approval` |
| `submissions-grid.md` (mới) | Q7 | `11-advanced-filter` |
| `form-templates.md` (mới) | Q8 | `12-tabbed-template` |

Cập nhật `overview.md`: thêm mục "Đánh giá năng lực sản phẩm" trỏ tới 5 bài trên. **KHÔNG tạo `payments.md`/`data-retention.md` phiên này** (Q1/Q2 để sau).

---

## 4. PIPELINE GHI GIF (đã dùng thành công 07-07, không phát minh lại)

Chi tiết trong memory `reference_demo_gif_recording`. Tóm tắt phần hay vấp:
- **ffmpeg của Playwright là bản RÚT GỌN**: KHÔNG có muxer gif / filter `fps`/`lanczos`. → quay video → tách **PNG** (`-vf scale=W:-1 -r FPS`) → ghép GIF bằng **`gif-encoder-2` + `pngjs`** (thuần JS). Hàm `toGif()`/`toGifSegments()` trong `recorder-lib.mjs`.
- **Blazor không bắn `networkidle`** → `waitUntil:'domcontentloaded'` + `waitForSelector`.
- **Con trỏ giả**: inject qua `addInitScript`; click bằng `el.evaluate(e=>e.click())` (KHÔNG `mouse.click(x,y)`).
- **Kích thước**: ~500–640px, 5–7fps, quality 20–28 → ~4–5MB / 15–25s. Chờ lâu → `toGifSegments()` ghép 2 khoảng, bỏ đoạn chết.
- ⚠️ `.gitignore` chặn `*.gif` toàn repo → GIF phải nằm ở `demo-gifs/` **hoặc** `Docs/docfx/images/` (đã có ngoại lệ `!`), không thì `git add` bỏ qua im lặng.
- ⚠️ Builder giữ `beforeunload` → `browser_navigate` timeout 60s im lặng: **accept dialog trước khi rời builder**.
- ⚠️ Panel 2 mode (`is-fs` fullscreen vs `is-inline`) — popover chìm khác nhau. **QA cả 2 mode.**

---

## 5. PUSH TÀI LIỆU
⚠️ Remote docs = **`github.com/CissSolution/MegaformDocs`** (khác repo code!). Dùng **worktree từ `origin/master`** để tránh kéo theo commit + file chưa commit của nhánh feature code.
(GIF vào `Docs/docfx/images/` + `demo-gifs/`; đã có ngoại lệ `.gitignore`.)

---

## 6. KHÔNG ĐƯỢC VIẾT (nếu chưa kiểm chứng)
- ❌ "Ẩn field tuyệt đối theo role" nếu chưa tự kiểm cả submit path (không chỉ render).
- ❌ Con số submissions bịa (form 1 = **100**, không phải 500k).
- ❌ Bất cứ con số hiệu năng nào chưa đo.

---

## PHỤ LỤC — Q1 & Q2 (ĐÃ KIỂM CHỨNG, để làm sau, KHÔNG thuộc phiên này)

Giữ lại để dùng khi làm 2 bài đó. Cả hai đã có số liệu thật (phiên 07-12):
- **Q1 payment:** E2E với Stripe test key thật trên :5124 — tiền chuyển thật (succeeded, 4999 cents), lưu `verified:true`; **5 đòn tấn công đều bị chặn** (đổi giá / fake paid / replay / bỏ qua / cross-form). Chi tiết + bảng trong `CLAUDE_HANDOFF_20260712_PAYMENT_AND_INBOX_FIXES.md §2.7`. GIF tương lai: `05-payment-checkout`, `06-payment-bypass-blocked` (bảng 5 đòn — mạnh nhất). ⚠️ DNN + PayPal **chưa smoke test** — kiểm trước khi viết bài hứa "hỗ trợ PayPal".
- **Q2 xoá field → data còn:** đã chứng minh trên :5123 (xoá `phone_number`, giá trị cũ vẫn đọc được từ snapshot `MF_SubmissionValues`). Lưu ý phải ghi: **cột grid biến mất**; bản ghi không snapshot → fallback schema hiện tại. ⭐ bẫy: `SchemaJson` có CẢ `fields` LẪN `Fields`. Chi tiết `...§2.6`.
