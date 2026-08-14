# HANDOFF — Builder inline-edit i18n (hardcoded Vietnamese → localized) 2026-07-01

**Trả lời tiếng Việt.** Phiên `e3fe3842`. User báo: *"mặc dù ngôn ngữ chọn là EN, trong builder vẫn tiếng Việt → bị hardcode"* + screenshot Design tab, nút khoanh đỏ **"Chuyển sang lưới (giữ thiết kế premium)"**. User giao tự xử lý, đi 4h.

---

## 0. TÓM TẮT 1 DÒNG
Bề mặt **inline-edit trong builder Design Live-Preview** (nút convert-grid, save pill, gallery ảnh, block menu, tooltip kéo/resize, step-nav) được Codex viết **hardcode tiếng Việt** → hiện tiếng Việt bất kể locale. Đã **route mọi chuỗi qua `t('ie.*' / 'builder.*' / 'renderer.*')`**, thêm 50 key (EN cho mọi locale + VN thật cho vi-VN), rebuild **renderer + builder bundle**, **deploy :5080 + :5000**. ✅ Visual-QA: nút giờ **"Switch to grid (keep premium design)"** khi EN. **Đây là fix wwwroot-only (JS + i18n JSON) — KHÔNG đụng DLL nên không dính blocker DLL-lock.**

---

## 1. ROOT CAUSE
`src/shared/inline-edit.ts` (renderer bundle, chạy trong Design-tab preview iframe khi `isPreview`) + 2 toast trong `src/builder/core.ts` + 1 tooltip `src/renderer/index.ts` — tất cả string UI viết thẳng tiếng Việt, **0 import `@i18n`**. i18n engine (`src/i18n/index.ts` → `t(key)`) hoạt động tốt (en-US bundle sẵn, locale khác fetch runtime) nhưng các file này chưa dùng.

## 2. ĐÃ SỬA (file + cách)
| File | Sửa |
|---|---|
| `src/shared/inline-edit.ts` | +`import { t } from '@i18n'` + helper `cssContent()` (escape CSS `content:`). Thay **47 chuỗi** → `t('ie.*')`: save pill, trạng thái (applying/saving/saved/error), gallery ảnh (title/search/upload/close/empty/no-match/prompt/uploading/failed), block menu (kind labels/show-hide/border/customize), 2 nút convert-grid + title + pill "ready", tooltip drag/resize (move/resize/col-ratio/width/reorder), hint edit-mode, 2 CSS `content:` (đổi ảnh nền / đã ẩn). |
| `src/builder/core.ts` | 2 toast `applyInlineEditFromPreview` → `builderT('builder.inline_saved_live'/'builder.inline_applied_hint', '<EN fallback>')`. |
| `src/renderer/index.ts` | +`import { t }`; step-nav pill tooltip → `t('renderer.view_step_design')`. |
| `public/i18n/*.json` (38 locale) | +50 key qua `tools/ie-i18n-add.cjs` (EN mọi locale, VN cho vi-VN). |

**KHÔNG sửa** (đúng, giữ nguyên): `builder/presets.ts` autonym `'Tiếng Việt'` (tên ngôn ngữ hiển thị bằng chính nó), `builder/dom.ts` ví dụ Unicode + console.log, `renderer/country-picker.ts` "Côte d'Ivoire" (tên nước Pháp — false-positive của scanner VN).

## 3. NAMESPACE KEY MỚI (50) — xem `MegaForm.UI/tools/ie-i18n-add.cjs` (EN + VI đầy đủ)
`ie.*` (47): save_edits, save_n_edits{n}, applying, saved_to_form, error_retry, saving, saved_reloading, save_failed_retry, prompt_new_image_url, invalid_image_url, change_image, change_hero_image, image_library, filter_filename, upload, paste_url, close, loading, gallery_empty, no_matches, prompt_image_url, uploading, upload_failed, block_header/steps/step/section/generic, show_block/hide_block, enable_border/disable_border, customize_block, drag_move_cell/drag_resize_cell/drag_col_ratio/drag_width/drag_reorder, convert_grid_pdf(+_title), grid_ready, convert_grid_premium(+_title), grid_premium_ready, edit_mode_hint, change_bg, hidden_preview.
`builder.*` (2): inline_saved_live, inline_applied_hint. `renderer.*` (1): view_step_design.

## 4. BUILD + DEPLOY (đã làm)
```
cd MegaForm.UI
node tools/ie-i18n-add.cjs           # seed 50 key vào public/i18n/*.json (idempotent, chỉ thêm thiếu)
node tools/i18n-check.cjs            # PASS (key-parity + 600 referenced keys)
npm run build:renderer              # → Assets/js/megaform-renderer.js (sync oqtane/web/dnn)
npm run build:builder              # → Assets/js/bundles/megaform-builder.js
# Deploy tới 2 site LIVE (wwwroot, KHÔNG DLL):
#   megaform-renderer.js → <site>/wwwroot/Modules/MegaForm/js/
#   megaform-builder.js  → <site>/wwwroot/Modules/MegaForm/js/bundles/
#   i18n: node tools/i18n-sync-platforms.cjs "<site>/.../js/i18n" ".../builder/i18n" ".../bundles/i18n" ".../plugins/i18n"
# Site: Oqtane.MegaFormTest.MSSQL (:5080, host/abc@ABC1024) + Oqtane.10_new2 (:5000, host/Minh@2002)
```
Repo `MegaForm.Oqtane.Server/wwwroot` + `Assets/` cũng đã sync → **lần pack NuGet sau tự có** (nhớ pack renderer+builder+i18n mới).

## 5. VISUAL QA — ✅ PASS
Harness `qa5000/qa-ie-i18n-5080.mjs <formId> <locale>` (login :5080, mở Design tab, đọc string trong `#mf-builder-preview-frame`).
Form 4 (Down Under premium), **EN**: `convertPremium="Switch to grid (keep premium design)"`, `savePill="Save 1 edits"`, `hint="Edit mode: click a title/label…"` → **LEAK CHECK PASS (0 tiếng Việt)**. Screenshot `qa5000/out/ie-i18n-5080-en-US.png` (nút tím góc phải-dưới đã tiếng Anh).

## 6. LƯU Ý / CÒN MỞ
- ⚠️ **Cache**: JS serve với `?v=AssetVersion` (không bump được vì nằm trong DLL). User cần **Ctrl+Shift+R** (hard refresh) để thấy bundle mới. QA dùng Playwright context sạch nên thấy ngay.
- ⚠️ **Preview iframe LUÔN resolve `en-US`** dù truyền `?mflocale=vi-VN` (builder sinh srcdoc không truyền locale). Nghĩa là inline-edit trong preview giờ **luôn tiếng Anh** — thoả yêu cầu "EN phải ra EN". Nếu sau này muốn preview theo locale đã chọn → sửa builder chỗ sinh preview srcdoc để truyền `data-mf-locale`/`?mflocale` (out-of-scope, chưa làm; VN values ĐÃ có sẵn trong vi-VN.json nếu cần).
- Builder chrome chính (Build/Design/AI Designer/Publish…) đã localized sẵn (`bt('builder.*')`) — scanner `tools/scan-vn-literals.cjs` xác nhận builder/ chỉ còn comment/console/autonym.
- Chưa commit (user chưa yêu cầu). Chưa thêm dịch tiếng Đức/Nhật… cho 50 key mới (dùng EN fallback) — có thể bổ sung qua in-product "Translate (AI)" nếu cần.

## 7. TOOLS MỚI (giữ lại, tái dùng)
- `MegaForm.UI/tools/ie-i18n-add.cjs` — seeder 50 key (EN+VI), idempotent.
- `MegaForm.UI/tools/scan-vn-literals.cjs <dir…>` — quét chuỗi VN trong string-literal (bỏ comment) theo file.
- `qa5000/qa-ie-i18n-5080.mjs` / `qa5000/probe-frames-5080.mjs` — QA/diag inline-edit i18n.

*Liên quan: memory [[project_20260630_inline_edit_into_design_tab]], [[project_20260630_fixes_and_premium_flexgrid]], [[project_20260701_i18n_diagnosis_wizard]].*
