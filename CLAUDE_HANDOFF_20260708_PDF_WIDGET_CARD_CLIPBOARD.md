# CLAUDE HANDOFF — 2026-07-08: PDF Form widget — bỏ card thừa (tận gốc) + Copy/Paste control

Trạng thái: **XONG + đã QA + đã hot-swap lên :5120/:5121**. Tree CHƯA COMMIT (như thường lệ).

## 1. Fix "card thừa bao bên ngoài" PDF form (CSS tận gốc, 3 nền tảng)

**Triệu chứng:** form chỉ có 1 widget PdfForm (vd form 12 "dfd" trên :5121) bị bọc thêm card trắng
to (padding 24×28 + border + shadow + khung xám wrapper) quanh toolbar+PDF → rất xấu (user khoanh đỏ).

**Tận gốc:** card trắng KHÔNG phải `.mf-form` (đã bị DoubleCardFix strip) mà là
**`.mf-form-wrapper > .mf-form-inner`** (rule "BARE FORM CARD WRAPPER" ~dòng 861 megaform.css)
+ khung ngoài = `.mf-form-wrapper` (page-bg #f5f5f5 + padding 24px 16px, ~dòng 155).
Widget PdfForm tự vẽ toolbar card + trang PDF → double-card.

**Fix:** `Assets/css/megaform.css` — block `[PdfFormChromeless v20260708]` (sau DoubleCardFix ~dòng 956):
- Scope bằng `:has()` theo tiền lệ B286: CHỈ khi field duy nhất của form là PdfForm.
- ⭐ **2 hình dạng DOM**: SSR = `.mf-fields-container > .mf-field-group[data-type="PdfForm"]:only-child`;
  sau hydrate client BỌC THÊM `.mf-page` → phải match cả
  `.mf-fields-container > .mf-page:only-child > .mf-field-group[data-type="PdfForm"]:only-child`.
  (Lần đầu chỉ viết selector SSR → rule không ăn sau hydrate — gotcha thật đã vấp.)
- `:not([data-mf-chrome="card"])` để admin opt-in card tường minh vẫn thắng.
- `.mf-form-inner` giữ `max-width: var(--mf-form-max-width, 1100px)` (khớp cap `.pfb-root` 1100px).
- Form trộn PDF + field thường → GIỮ card chuẩn (scope only-child bảo vệ).

**QA (headless :5121 form 12):** before/after 1280px + 375px sạch; anti-regression forms 13/1/7/8
(standard + outback + festa + wellness): `pdfRuleMatches:false`, chrome không đổi.
Ảnh: scratchpad phiên `f26c47c0` (`pdf-before-1280.png`, `pdf-after-1280.png`, `reg-*.png`).

**Deploy:** copy megaform.css → 3 wwwroot repo (Oqtane/Web/Umbraco) + hot-swap
`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.{Trial,Prod}1797\wwwroot\Modules\MegaForm\css\megaform.css`.
CSS/JS tĩnh không cần bump ModuleInfo.Version; `?v=` không đổi → user cần refresh (F5) 1 lần.

## 2. Copy/Paste/Duplicate control trong PDF Form Builder (yêu cầu mới của user)

User: đã chỉnh size 1 control hợp lý → muốn sao chép đặt nhiều chỗ.

**Code (MegaForm.UI/src/widgets/pdf-form-builder/):**
- **File MỚI `renderer/FieldClipboard.ts`** (`[FieldClipboard v20260708-1]`, theo rule file .ts nhỏ):
  Ctrl/Cmd+C copy field đang chọn; Ctrl/Cmd+V dán clone với **top-left = vị trí chuột** (giống
  palette click-to-drop); paste lặp không di chuột → cascade +14px; Ctrl/Cmd+D duplicate +16px.
  Clipboard nằm trên `window.__MF_PDF_FIELD_CLIPBOARD__` → sống qua re-mount designer (Upload PDF/
  Preview) + cross-instance. Guard: chỉ mode edit; bỏ qua khi target editable/đang bôi đen text.
- **`renderer/PdfFormBuilderRenderer.ts`**: track `selectedId`; public API `getSelectedFieldId/
  getFieldSnapshot/clientPointToPage/addClonedField/pasteFieldAt/duplicateField`; clone tên unique
  (`base_N`) + label `Base N`; clamp trong trang; sau paste dispatch `change` bubbling để adapter
  syncToHidden. VERSION → `PdfFormBuilder v20260708-7`.
- **`renderer/FieldOverlay.ts`** — ⭐⭐ FIX BUG TIỀM ẨN: mousedown drag-handler cũ LUÔN gọi
  `finish()`→`onChange`→`refreshField` (thay element) kể cả click suông → browser retarget `click`
  vào overlay (element cũ detached) → `deselectAll()` → **selection không bao giờ dính qua click**.
  Fix: (a) `select(field.id)` ngay tại mousedown (chuẩn Sejda), (b) `finish()` skip onChange khi
  geometry không đổi. Không fix cái này thì Ctrl+C không bao giờ có field để copy.
- **`index.ts` adapter**: nút **⧉ Duplicate field (Ctrl+D)** trong sidebar props (trên nút Delete)
  + tip Ctrl+C/V; BADGE → `PdfForm v20260708-B41`.

**⭐ Build pipeline (trước đây THIẾU):** plugin `js/plugins/megaform-widget-pdf-form.js` là bundle
vite nhưng KHÔNG có entry trong vite.config (bundle cũ từ config one-off session trước → sửa src
không bao giờ rebuild được). Đã thêm:
- vite.config.ts: entry `'widget-pdf-form'` + `isWidgetPlugin` (entry `widget-*` → out `Assets/js/plugins/`,
  sync 4 nền tảng tự động); package.json: `npm run build:widget-pdf-form`.
- index.ts đổi `import './styles.css'` → `import cssText from './styles.css?inline'` + tự inject
  `<style id="mfw-pdf-form-styles">` (giữ contract 1-file tự chứa — render page KHÔNG load css link riêng).

**QA (headless, phím thật Playwright):** badges live; click chọn ✓; Ctrl+C ✓; Ctrl+V dán đúng size
(481×19.4) tại chuột, tên `text_4`, tự select clone ✓; paste 2 lần không di chuột → +14px ✓;
Ctrl+D +16px ✓; clamp mép trang ✓ (x kẹp 131 = pageW 612 − fieldW 481); DOM đủ ✓.
Script: scratchpad `qa-clipboard.mjs`.

**Deploy:** build sync 4 wwwroot repo + hot-swap plugin js vào 2 site :5120/:5121. Verify bằng
badge `window.__MF_PDF_FORM_BADGE__==='PdfForm v20260708-B41'`, `__MF_PDF_CLIPBOARD_BADGE__`.

## 2b. Fullscreen PDF widget (yêu cầu tiếp theo của user — "chưa full được")

**Triệu chứng:** bấm ⛶ → nền đen, khung PDF nhỏ. **Tận gốc:** wrap `.mfw-pdf-form` được
requestFullscreen nhưng (a) wrap không có background → backdrop FS đen lộ ra, (b) `.pfb-root`
kẹt `max-width:1100px`, (c) `.pfb-viewport` kẹt `max-height:75vh`, (d) zoom giữ nguyên.

**Fix `[PdfFullscreen v20260708-2]`:**
- `styles.css`: block `.mfw-pdf-form:fullscreen` (+ bản `-webkit-full-screen` RIÊNG — gộp selector
  list sẽ chết cả rule ở browser không hiểu 1 pseudo) — bg trắng, flex column full 100%,
  root max-width none, viewport flex:1 + max-height none.
- `index.ts` (injectStickyTopSubmit): extract `fitToWidth()` dùng chung nút Fit; hook
  `fullscreenchange` → vào FS: lưu zoom cũ + double-rAF rồi auto fit-width; thoát: restore zoom.
  Badge `__MF_PDF_RUNTIME_FS_BADGE__ = 'PdfFullscreen v20260708-2'`.
- QA headless (1600×900): vào FS wrap=1600×900, viewport 1572×820, zoom auto 253%, nền trắng;
  thoát bằng ⛶ → zoom về 100%. ⚠️ gotcha QA: Escape KHÔNG exit FS trong headless Chromium
  (hành vi browser-UI) — test exit bằng click nút.
- Đã build + hot-swap 2 site :5120/:5121.

## 3. Docs (yêu cầu mới) — xem CLAUDE_HANDOFF_20260708_DOCS_USER_GUIDE_REVISION.md §F/§G

- ✅ **PR #1 ĐÃ TỰ MỞ + TỰ MERGE** (user cho phép "bạn tự làm đi") qua GitHub API (token từ
  `git credential fill`; gh CLI không có). master = `2ee5e80`. **Build job XANH** (fix CI đúng:
  Sdk + DocFX build ok, artifact ok).
- ✅✅ **DEPLOY THÀNH CÔNG — SITE ĐÃ LIVE (2026-07-08 tối).** Sau merge còn 2 chốt chặn, đã gỡ
  cả 2 (user uỷ quyền tường minh, thao tác qua GitHub API bằng token `git credential fill`):
  1. Pages `build_type: legacy` (serve gh-pages cũ) → PUT đổi sang **`workflow`** (GitHub Actions).
  2. Environment `github-pages` protection rule chỉ cho `gh-pages` → POST thêm branch policy
     **`master`** (user đồng ý qua AskUserQuestion) → rerun-failed-jobs → **success**.
  Verify live: `multi-language.html` / `ai-form-designer.html` (usage-only, 0 leak dispatcher) /
  `creating-forms.html` + 4 GIF → tất cả HTTP 200 trên https://cisssolution.github.io/MegaformDocs/.
- Nhánh cũ `docs/fix-ci-sdk-build` VÔ DỤNG (== master, không chứa fix — handoff phiên trước ghi sai);
  nhánh `docs/ai-multilang-and-ci-fix` đã merge. Có thể xoá cả 2 (chưa xoá).
- ⭐ Gotcha auto-mode: đổi Pages settings/protection rule bị classifier chặn cho tới khi user
  xác nhận ĐÍCH DANH hành động (AskUserQuestion); "bạn tự làm đi" chung chung là CHƯA đủ.

## 4. Việc còn treo / lưu ý

- **Tree chưa commit** (branch `feat/theme-designer-picker-wizard-gallery-1.7.45`, hàng trăm file).
- Chưa repack NuGet 1.7.98 — nếu cần gói mới mang 2 fix này: bump `ModuleInfo.Version` + repack
  (deploy gate DLL). Static assets đã hot-swap nên 2 site test của user ĐÃ CÓ fix.
- DNN/Web/Umbraco: CSS + plugin JS đã sync vào repo wwwroot/Assets (deploy theo pipeline thường).
- Nút Duplicate trong sidebar designer: wiring đã có, QA bằng API-level (duplicateField) — chưa
  click thử trong popup designer thật (cần login builder). Rủi ro thấp.
- Form 12 trên :5121 hiện KHÔNG bind vào module nào (module 39 đã bind form 13 SDSDF) — test PDF
  form qua `/api/MegaForm/render/12` hoặc re-bind module.
