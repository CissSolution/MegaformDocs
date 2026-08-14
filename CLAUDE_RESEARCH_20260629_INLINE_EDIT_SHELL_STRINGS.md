# NGHIÊN CỨU — Inline Edit shell-strings khi host-login + Edit mode (2026-06-29)

> Yêu cầu: khi **host đăng nhập + ở Edit mode** (`localhost:5000/?edit=true`), cho phép **click thẳng vào
> chữ trên form đã render để sửa tại chỗ (inline / WYSIWYG)** — hero "Down Under Experience" + subtitle,
> nút "Great Barrier", stepper "STEP 1 About You…STEP 4 Review", và step heading/intro "Tell us about you…".
> Đây là feasibility study + phương án. **Chưa code** (chờ bạn duyệt phase trước khi implement).

## TL;DR — KHẢ THI, nên làm theo phase. Tái dùng được phần lớn hạ tầng đã có.
Mọi mảnh ghép đã tồn tại: tín hiệu edit-mode (Index.razor), chỗ render shell client (`buildSkeleton`/
`renderCustomHtml`), và **bộ locator→sửa-text đã có sẵn** trong token-designer (`collectShellStringDescriptors`
→ `mutateShell` → `setShellText`, text-only swap giữ nguyên tag-tree + customCss). Inline-edit = (1) tag node
editable lúc render + (2) lớp contenteditable mỏng + (3) commit qua logic có sẵn + (4) nút Save nổi.

---

## 1. Hiện trạng có thể tái dùng (đã khảo sát)
- **Tín hiệu edit-mode:** `MegaForm.Oqtane.Client/Index.razor` đã biết `IsEditMode` / `PageState.EditMode`
  (gate admin dock Form Builder/Dashboard + settings panel). ⚠ **Gotcha (memory + comment Index.razor:423):**
  `host's IsEditMode PERSISTS` → KHÔNG gate UI chỉ bằng `IsEditMode`. Phải dùng đúng tín hiệu Oqtane bật khi
  bấm bút chì edit (cùng tín hiệu hiện nút ✏️), không phải cờ persist. → truyền 1 cờ rõ ràng xuống client,
  vd `data-mf-inline-edit="1"` trên form root, set CHỈ khi `(_isAdmin && <real-edit-toggle>)`.
- **Chỗ render shell (client):** `renderer/index.ts buildSkeleton()` + `renderCustomHtml` dựng customHtml shell
  client-side (xử lý `data-mf-ssr`). Đây là nơi tag node editable.
- **Bộ sửa-text có sẵn (token-designer.ts):** `collectShellStringDescriptors(settings)` liệt kê đúng các shell
  string (hero/brand/step-label/step-heading/intro) với **locator** + nhãn ngữ nghĩa (vừa cải thiện B311:
  "Brand title / Hero headline / Header button…"); `mutateShell(locator, value)` → `setShellText` đổi CHỈ
  text node, commit vào `settings.customHtml`, giữ tag-tree + customCss byte-identical. → **refactor 3 hàm này
  ra 1 module shared** để CẢ Token Designer LẪN inline editor dùng chung (giải quyết bài toán map node→customHtml:
  locator tính lúc render rồi gắn lên node).
- **Primitive text-swap:** `@shared/html-text-swap` (set_html_text của AI) — cùng cơ chế, an toàn.

## 2. Phương án (3 lớp, text-only, giữ cấu trúc)
1. **Render-time tagging:** khi `buildSkeleton`/`renderCustomHtml` dựng shell VÀ đang ở inline-edit mode, chạy
   `collectShellStringDescriptors` trên customHtml, rồi gắn `data-mf-shell-edit="<locatorJSON>"` +
   `contenteditable="plaintext-only"` + class `.mf-inline-editable` lên đúng node text tương ứng (hero, brand,
   step label, step heading, intro). Hover → outline + chip nhãn ("Hero headline"). 
2. **Tương tác:** click → sửa tại chỗ (plaintext-only chống dán HTML). Blur/Enter → lấy text mới → 
   `setShellText(locator, newText)` trên customHtml DOM → commit `settings.customHtml` → mark dirty → re-render
   (hoặc cập nhật in-place để không nháy).
3. **Save:** form render KHÔNG phải builder → cần trigger Save. Đề xuất **pill "Lưu thay đổi" nổi** xuất hiện
   khi có sửa chưa lưu → POST schema (settings.customHtml) qua endpoint save có sẵn (cùng đường builder lưu) →
   ghi `MF_Forms.SettingsJson`. (Hoặc tích hợp nút Save của Oqtane edit-mode.)

## 3. Hai NGUỒN shell-string (quan trọng — quyết định độ phủ)
- **A. Premium customHtml-lớn (vd form 52, ~13KB):** hero/brand/step-label/heading/intro NẰM trong customHtml
  → `collectShellStringDescriptors` thấy hết (đã verify B311: 15 strings). **Phase 1 phủ trọn nhóm này.**
- **B. Premium native-migrated (vd form 51, customHtml ~558ch, theme-driven):** hero/stepper KHÔNG ở customHtml
  → `collectShellStringDescriptors` thấy 0. Các string này đến từ: **step label = `Section.label`** (schema),
  **step heading/intro = field/section props**, hero/brand = theme hoặc cần `{{content:}}` token. → inline-edit
  nhóm này phải sửa **schema field/Section label** (không phải setShellText). 
- ⟹ Inline editor nên xử lý **2 loại target**: `kind:'shell'` (→ setShellText) và `kind:'field'` (→ đổi
  `field.label`/`Section.label`/`field.properties`). Step heading "Tell us about you" + label "STEP 1 About You"
  của native premium = field/Section → sửa qua field-edit; hero customHtml = shell.

## 4. Rủi ro / điểm khó (cần xử lý)
- **SSR↔client parity:** shell SSR-render trước rồi client rebuild (memory: "custom-HTML rebuild not hydrate").
  Tag editable phải gắn ở bước client rebuild; tránh nháy. Edit chỉ bật ở client (SSR không cần tag).
- **Edit-mode signal:** tránh gotcha IsEditMode-persists (dùng tín hiệu edit thật, không phải cờ tồn dư).
- **Save trên form render (không phải builder):** cần endpoint + UX Save rõ ràng; tránh xung đột nếu builder
  cũng đang mở cùng form.
- **contenteditable:** `plaintext-only`, chặn dán HTML/xuống dòng; chuẩn hoá whitespace; ESC = hủy.
- **Khóa cấu trúc:** chỉ cho sửa TEXT (không xóa/đổi tag) — như set_html_text. Sửa cấu trúc vẫn ở builder.
- **Native premium (nguồn B):** sửa label field/Section cần map node→field.key (gắn `data-mf-field-edit=key`
  lúc render field). Hero theme-driven có thể KHÔNG sửa được tới khi chuyển sang `{{content:}}` token.

## 5. Kế hoạch theo phase (đề xuất)
- **Phase 1 (lõi, rủi ro vừa):** inline-edit shell-string nguồn A (customHtml-lớn) — refactor
  collectShellStringDescriptors/mutateShell/setShellText ra `@shared/shell-strings`; tag node lúc render khi
  `data-mf-inline-edit=1`; contenteditable + commit + pill Save. Phủ form kiểu 52 (hero/brand/step labels/headings).
- **Phase 2:** inline-edit field/Section label + heading/intro (nguồn B native premium) — gắn `data-mf-field-edit`
  lúc render field, sửa → `field.label`. Phủ stepper "STEP 1 About You" + "Tell us about you" của native premium.
- **Phase 3:** hero/brand của native premium → chuyển sang `{{content:}}` token (migration) để inline-edit được;
  hoặc trình sửa "theme strings".
- Mỗi phase: bump AssetVersion + swap renderer/Shared.dll (+Core.dll nếu đụng SSR) + Visual QA.

## 6. Khuyến nghị
Nên làm **Phase 1 trước** (giá trị cao nhất, phủ premium customHtml-lớn, tái dùng tối đa, rủi ro kiểm soát
được). Phase 2 mở rộng sang native premium. Đây là bản nâng cấp tự nhiên của "WYSIWYG click-to-edit" đã defer ở
B311 — nay có ngữ cảnh rõ (Edit mode + host). Cần bạn DUYỆT phase trước khi tôi code (feature đụng renderer +
edit-mode + save path = rủi ro, không nên ship dở dang khi bạn vắng).

## 7. Quan sát phụ (ngoài yêu cầu)
Ảnh cho thấy step 1 có **First name/Last name LẶP 2 lần** (Mia/Anderson × 2). Có thể là field trùng trong
schema (do edit/migration). Tách riêng — báo để bạn biết, sẽ kiểm nếu bạn muốn.

## 8. File tham chiếu
- Edit-mode: `MegaForm.Oqtane.Client/Index.razor` (IsEditMode, admin dock, gotcha ~L423).
- Render shell: `renderer/index.ts` (`buildSkeleton` ~L164, `renderCustomHtml`).
- Bộ sửa-text (refactor ra shared): `builder/token-designer.ts` (`collectShellStringDescriptors`,
  `mutateShell`, `setShellText`, `headerTargetLabel` — B311 semantic labels).
- Text-swap primitive: `@shared/html-text-swap`.
- Liên quan: [[project_ai_on_rails_kb_catalog_b310]], handoff §6/§9b.
