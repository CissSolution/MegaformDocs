# HANDOUT (cho Codex) — 2026-07-26: Sửa/xoá STEP của form multi-step ở CẢ Wizard lẫn Builder

> Người giao: owner. Người viết: Claude (đã điều tra, **chưa** sửa dòng code nào).
> Mọi số hiệu dòng dưới đây đã kiểm chứng trên `main` hiện tại của repo này.

## 0. Hai vấn đề owner nêu

1. **Wizard**: sau khi chọn 1 template multi-step, **không có cách nào xoá bớt step**.
   Sidebar chỉ hiện chữ chết `"Template steps fixed"`.
   (Ảnh: `dnn10_3_3_test20.ai/#mf-dashboard` → bước 2 "Trường" → Steps (4) → hộp gạch đứt.)
2. **Builder**: **không có cách nào sửa step một cách trực quan** như wizard (không add/xoá/đổi tên/đổi thứ tự).
   (Ảnh: `/Home/mfFormId/16#mf-builder` — canvas chỉ có chip tĩnh `PAGE BREAK — STEP 2`.)
3. Owner yêu cầu **đồng bộ 2 chỗ** này.

## 1. ⭐ KẾT LUẬN QUAN TRỌNG NHẤT — việc này NHỎ hơn vẻ ngoài

**Sự thật ở runtime: STEP ĐƯỢC TÍNH TỪ FIELD, KHÔNG PHẢI TỪ `customHtml`.**

- `MegaForm.UI/src/renderer/index.ts` → `calculatePages()` **dòng 1572**: trang được dựng từ
  `field.type === 'Section' && field.properties.pageBreak` (hoặc fallback `field.pageIndex`).
  Nó **không đọc** `data-step` trong `settings.customHtml`.
- Thanh stepper tĩnh của template premium đã có **bộ đối chiếu tự động**:
  `MegaForm.UI/src/renderer/premium-step-reconcile.ts` → `reconcilePremiumNativeStepper()`.
  Khi số trang của schema **ít hơn** số item trên rail, nó **tự ẩn item thừa, cắt bớt đường nối,
  đánh số lại (01, 02, …)** — khoá định danh là `properties.premiumStepIndex` (1-based) trên
  Section dẫn đầu mỗi trang (xem docblock dòng 1–18 và dòng 49–60).
- `premiumStepIndex` được ghi ở `MegaForm.UI/src/shared/premium-native-migration.ts:136,143`.

⇒ **Xoá 1 step = xoá Section page-break (+ xử lý field của nó). KHÔNG cần đụng dao kéo vào `customHtml`.**
Runtime đã tự dọn thanh stepper. Đây là lý do task này khả thi và ít rủi ro.

🛑 **KHÔNG được đi hướng "cắt bỏ block `data-step` trong customHtml"** — đó là bẫy: shell premium bị đóng băng
(CSS + markup), cắt tay sẽ vỡ lưới/step-bar và mâu thuẫn với rule "giữ shell premium byte-frozen"
(xem `CLAUDE_HANDOFF_20260726_AI_SQL_TABLE_FORMS_AND_INSERT_RAILS.md` §4 và KB `premium-template-retarget-sql-table`).

## 2. Bản đồ source code

### 2.1 Wizard — nhánh TEMPLATE PREMIUM (chỗ đang bị khoá)
`MegaForm.UI/src/dashboard/wizard/step-fields.ts`
- **dòng 162** `if (struct.isWizard) {` — toàn bộ nhánh premium.
- **dòng ~188–208** dựng sidebar "Steps (N)": nút chọn step, đếm field.
- **dòng 205** `'Template steps fixed'` ← **chữ chết cần thay bằng UI thật**.
- **dòng ~211–226** editor bên phải: đổi `navLabel` / `navSubtitle` / `title` / `description`
  (đã chạy tốt — **chỉ sửa CHỮ, không sửa CẤU TRÚC**).
- `activePremiumStepOrdinal` là state module-level chọn step đang mở.

Bổ trợ: `MegaForm.UI/src/dashboard/wizard/premium-steps.ts`
- `parsePremiumStepDetails()` **:81**, `premiumStepDetailsFor()` **:103**,
  `applyPremiumStepDetailsToHtml()` **:162** (ghi chữ ngược vào shell),
  `applyPremiumStepDetailsToFields()` **:192** (gán chữ vào Section fields).

### 2.2 Wizard — nhánh FORM THƯỜNG (⭐ UX MẪU, ĐÃ CHẠY TỐT — hãy copy)
Cùng file `step-fields.ts`, `renderFields()` **dòng 250**:
- `addPage()` **:272** — thêm step
- `delPage(id)` **:273** — xoá step, **chặn khi chỉ còn 1**, tự chuyển active sang step còn lại
- `renamePage(id, v)` **:274** — đổi tên
- Sidebar **:300–310**: nút ✕ đỏ **hiện khi hover** (`mouseenter/mouseleave` gắn ở :312–315) + nút `+ Add Step`
- `toggleMulti()` **:276** — bật/tắt multi-step, gộp/tách field

👉 Nhiệm vụ chính của Codex ở wizard: **đem đúng bộ affordance này sang nhánh premium**, khác biệt duy nhất là
premium thao tác trên `details[]` + field `__step` thay vì `data.formPages[]`.

### 2.3 Builder — chưa có gì để sửa step
- `MegaForm.UI/src/builder/canvas.ts`
  - **:1875** phát hiện page-break: `field.type === 'Section' && !!field.properties?.pageBreak`
  - **:3178–3184** `getSectionStepNumber()` — đánh số step bằng cách đếm dồn
  - **:3186–3193** `renderFieldPreview()` — vẽ chip `PAGE BREAK — STEP N` (chỉ trang trí, **không click được**)
- Panel phải (ảnh 2): "Thuộc tính trường / Cài đặt biểu mẫu / HTML tùy chỉnh" — nơi hợp lý để thêm mục
  **"Các bước (Steps)"**. Bố cục panel ở `MegaForm.UI/src/builder/dom.ts` + `properties.ts`.

## 3. Việc cần làm

### A. Wizard: cho phép XOÁ (và thêm/đổi tên) step trong template multi-step
Thay `'Template steps fixed'` (**step-fields.ts:205**) bằng UI y hệt nhánh thường:
1. Mỗi hàng step có nút ✕ hiện khi hover → xoá step.
2. Có nút `+ Add Step` ở cuối danh sách.
3. **Chặn xoá khi chỉ còn 1 step** (giống `delPage`).
4. **Hỏi field sẽ đi đâu**: mặc định **dồn field của step bị xoá sang step liền trước**
   (an toàn, không mất dữ liệu người dùng đã cấu hình). Nếu xoá step 1 → dồn sang step kế tiếp.
   *Đừng* xoá thẳng field — mất công sức người dùng.
5. Sau khi xoá phải: bỏ phần tử tương ứng trong `details[]`, **đánh số lại `__step` của mọi field còn lại**
   cho liên tục 1..N, và chỉnh `activePremiumStepOrdinal` nếu nó trỏ vào step vừa xoá.

### B. Builder: thêm trình sửa step trực quan
Thêm mục **"Steps"** vào panel phải (hoặc biến chip `PAGE BREAK — STEP N` trên canvas thành nút bấm được):
- Liệt kê các step suy ra từ Section page-break (dùng lại logic `getSectionStepNumber`, canvas.ts:3178).
- Mỗi step: đổi tên (= `label` của Section), xoá (= xoá Section đó, field dồn lên step trước), đổi thứ tự.
- Thêm step = chèn 1 field `Section` với `properties.pageBreak = true` tại vị trí con trỏ.
- Với form premium: khi xoá Section, **giữ nguyên `properties.premiumStepIndex` của các Section còn lại**
  — đó chính là khoá để `reconcilePremiumNativeStepper` ẩn đúng item trên rail. **Không được đánh số lại nó.**

### C. Đồng bộ hai nơi — MỘT mô hình duy nhất
- **Nguồn sự thật = danh sách field** (`Section.pageBreak` + thứ tự field). Wizard và Builder đều phải
  đọc/ghi mô hình này; `details[]` của wizard chỉ là lớp hiển thị chữ, không phải nguồn sự thật.
- Đưa 4 thao tác dùng chung ra **một module nhỏ** (ví dụ `MegaForm.UI/src/shared/form-steps.ts`):
  `listSteps(fields)`, `addStep(fields, atIndex)`, `removeStep(fields, stepOrdinal, mode:'merge-prev')`,
  `renameStep(fields, stepOrdinal, label)`.
  Wizard và Builder cùng gọi module này ⇒ **không thể lệch nhau**. (Rule của owner: file nhỏ, không nhân bản logic.)

## 4. Ràng buộc bắt buộc (rule của repo — đọc trước khi code)

- `CLAUDE.md` + `Docs/SECURITY_CODING_RULES.md`.
- **Sửa canonical source**: `MegaForm.UI/src/**` và `Assets/css/**` — KHÔNG sửa bản đã build trong `wwwroot`.
- **i18n**: cấm hardcode tiếng Việt. Mọi chuỗi UI dùng `T()/wt()` với fallback **tiếng Anh**;
  bản tiếng Việt bỏ vào `vi-VN.json`.
- **Giữ shell premium**: không tự sinh/sửa `customHtml`, `customCss`, `theme`.
- **Visual QA bắt buộc**: chụp màn hình headless trước/sau cho mọi thay đổi giao diện (rule của owner).

## 5. Build & deploy để thử

```bash
cd MegaForm.UI
npm run build:dashboard      # wizard (step-fields.ts nằm trong bundle này)
npm run build:builder        # builder
```
Rồi **copy tay** vào site (sync-platforms chỉ copy vào wwwroot của repo, KHÔNG vào site):
- `Assets/js/megaform-dashboard.js` → `<site>/DesktopModules/MegaForm/Assets/js/`
- builder nạp từ `<site>/DesktopModules/MegaForm/Assets/js/bundles/megaform-builder.js`

Site thử: **`http://dnn10_3_3_test20.ai`** (host/`dnnhost`) — form **16 "Contact Form"** và form **10** là premium
multi-step. Site sạch: **`http://dnn1030_megafresh.ai`** (host/`dnnhost`), form 1 "EuroYouth 2026" 4 bước.
Bust cache: Ctrl+F5, hoặc bump `HostSettings.CrmVersion` + restart pool
(`Restart-WebAppPool 'DNN10_3_3_Test20.AI_nvQuickSite'` / `'DNN1030_MegaFresh'`).

## 6. Tiêu chí nghiệm thu

1. Wizard + template 4 bước → xoá bước 3 → còn 3 bước, **field của bước 3 nằm ở bước 2**, không mất field nào.
2. Tạo form đó xong, mở public form: **thanh stepper hiện đúng 3 bước** (rail tự ẩn item thừa), bấm Next/Back
   chạy hết 3 bước, submit được.
3. Builder mở chính form đó → mục Steps liệt kê đúng 3 bước; xoá thêm 1 bước → canvas + preview cập nhật ngay.
4. Wizard và Builder cho ra **cùng một kết quả** trên cùng một form (không lệch số bước).
5. `customHtml` của form premium **không đổi 1 byte** sau các thao tác trên (so sánh hash trước/sau).
6. Form 1 bước: nút xoá bước bị chặn (không cho về 0 bước).

## 7. Rủi ro đã biết

- ⚠️ **Đừng renumber `premiumStepIndex`** của Section còn lại — làm thế thì `premium-step-reconcile.ts`
  ẩn nhầm item trên rail.
- ⚠️ `data-step` trong `customHtml` có thể **không liên tục** sau khi xoá; điều đó **chấp nhận được**
  vì runtime không dựa vào nó để phân trang. Chỉ cần rail reconcile chạy đúng.
- ⚠️ Wizard premium hiện có 2 toggle **disabled** (`Multi-step form`, `Progress bar` — step-fields.ts:178,182).
  Nếu cho xoá về 1 bước thì phải quyết định hành vi của 2 toggle này (gợi ý: vẫn khoá, và chặn xoá ở bước cuối).
- ⚠️ Field không thuộc step nào (`__step == null`) đã có khối "Other fields" (step-fields.ts:229) — giữ nguyên.
