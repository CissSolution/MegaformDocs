# KẾ HOẠCH PHIÊN SAU — Pixel-perfect CSS + phục hồi nền form + dứt điểm việc còn dở

> Trạng thái: phiên 2026-06-27 đã CHỨNG MINH AI sửa form premium giữ-style (17/17 ca, 4 form).
> Phiên sau = **(A) phục hồi nền gốc + sửa CSS pixel-perfect với mock**, **(B) hoàn tất phần in-product còn dở**.
> Tài liệu này để anh DUYỆT trước khi chạy. Mock đối chiếu: `http://localhost:3100/forms/{intake|australia|festa-italiana|bulgaria|euro-youth}` (đã kiểm: sống, 200).

---

## 0. CHẨN ĐOÁN (đã xác minh phiên này — gốc của 2 ảnh anh gửi)

| Triệu chứng (ảnh) | Nguyên nhân ĐÃ xác minh | Có phải do AI edit? |
|---|---|---|
| Form 15 intake: **góc đen + viền đen** quanh card | `.mfp-intake { background:transparent }` → shell trong suốt, **nền host (đen) lọt qua** vùng ngoài card | KHÔNG — form 12 GỐC cũng `background:transparent` (pre-existing) |
| Form 13 australia: **"Tell us about yourself" navy chìm vào nền đen**, stepper mờ | Shell **không phủ nền sáng**; chữ dùng `--au-ink:#06363a` (navy) thiết kế cho nền sáng, nhưng đang nằm trên nền host tối | KHÔNG — form 9 GỐC không có `background` trên root (pre-existing) |
| Màu form không đổi khi đổi theme | (phụ) C8 màu phiên này set `--primary`/`--accent` **chung**, nhưng template dùng var **scoped** `--au-primary` / `--in-primary` → override INERT | Do AI C8 (vô hại, chỉ thừa) |

**Kết luận:** lỗi nền tối/chữ chìm là **shell premium trong suốt/không nền render trên host page TỐI** (DNN + :5000). Mock :3100 có nền SÁNG nên không lộ. `customCss` **byte bất biến** qua mọi edit AI (đã chứng minh) → đây KHÔNG phải hồi quy do AI; là khác biệt host-theme + thiết kế shell phụ thuộc nền trang.

---

## ✅ ĐÃ LÀM 2026-06-27 (theo chỉ đạo "chỉ fix nền tối cho form đấy thôi")
- **Nền tối form australia (down-under-reef, form 13 + 9) ĐÃ FIX + VISUAL QA PASS.** Card trắng phục hồi, "Tell us about yourself" navy đọc rõ trên host tối, khớp mock. Bằng chứng: `qa5000/evidence/australia-13-AFTER-bgfix-onDark.png` vs `australia-13-MOCK.png`.
- **Root cause (xác minh bằng probe):** strip toàn cục `megaform.css:598 .mf-form-wrapper[data-mf-has-custom-html] .mfp{background:transparent!important}` (chống double-card) + rule trắng của template bị một rule `(0,4,0)!important` nạp-sau ép transparent → cần selector **(0,5,0)!important** mới thắng. australia KHÔNG có inner card (khác intake/bulgaria/festa đều có) nên lộ nền tối.
- **Cách fix (surgical, australia-only):** thêm block CSS vào `customCss` của template `down-under-australia.json` (+ áp live form 9/13) re-assert card trắng `.mfp.mfp-australia` ở (0,5,0) + bare-root cho context không marker + @media mobile. KHÔNG đụng form khác (intake/bulgaria/festa giữ transparent — ĐÚNG như anh nói).
- **GIỮ NGUYÊN:** intake/bulgaria/festa transparent (đều có inner card trắng/cream → đọc tốt).
- **Đã clear** themeCssOverrides (C8 test) trên 11/13/14/15 → màu gốc. ⭐Lưu ý: clear qua SaveForm KHÔNG ăn (resolver merge lại từ module-style); phải clear qua **`POST Form/SaveTheme {FormId, CssOverrides:{}}`** (ghi vào schema.settings + settingsJson). C8 override `--primary` còn **bridge sang `--au-soft`+`--au-primary`** (cùng #004e66) → từng làm eyebrow "STEP 01" tàng hình (bg==color); clear xong eyebrow đọc rõ lại. → C8 in-product PHẢI nhắm đúng var template (B5), không dùng `--primary` chung.
- **eyebrow "STEP 01" australia: ĐÃ đọc rõ** sau khi clear override (pale pill + chữ). Không phải lỗi CSS template (`.au-eyebrow` đúng) — do C8 override bridge.
- ⭐**Màu accent host = `#4a90d9` (xanh) thay vì teal `#0bb39b` của template** — XÁC MINH trên CẢ form gốc 9 (chưa từng đụng) → là `--primary` GLOBAL của host theme áp lên mọi form (pre-existing, KHÔNG do tôi). Mock :3100 hiện teal vì không có host-global đó. Nếu muốn pixel-perfect teal: gỡ/đổi host `--primary` global hoặc cho premium template tự định `--au-primary` không fallback `--primary` (ảnh hưởng nhiều form → cân nhắc).
- ⚠ **DNN instance** (ảnh 2, ?formid=13 trên host DNN) là DB RIÊNG → cần áp template/CSS sang đó (re-import package HOẶC thêm rule scoped `.mfp.mfp-australia` vào `Assets/css/megaform.css` global rồi deploy — bao mọi host, vẫn chỉ ảnh hưởng australia).

## A. (CÒN LẠI) PIXEL-PERFECT VỚI MOCK + các form khác (ưu tiên 1 — anh yêu cầu)
> Phần nền tối australia đã xong (trên). Dưới đây là pixel-perfect rộng hơn + lỗi nhỏ.
- **australia eyebrow "STEP 01"**: pill hiện đặc tối, chữ ẩn (mock = nền teal nhạt + chữ teal). Sửa contrast pill (au-eyebrow) cho khớp mock.

### A1. Chốt cách phục hồi nền (anh chọn 1)
- **Phương án 1 (khuyến nghị) — shell tự phủ nền sáng:** thêm `background` SÁNG vào root `.mfp.mfp-<name>` của từng template, lấy đúng màu/gradient từ mock :3100 (intake = ocean-gradient nhạt; australia = cream/mint band; festa = …). → form **độc lập host theme**, đúng mock trên MỌI trang. Đổi `customCss` (CSS_HASH sẽ đổi — đây là **sửa template có chủ đích**, không phải AI edit, nên hợp lệ) → cập nhật `Samples/FormTemplates/Premium/<slug>.json` → regen facts → deploy.
- **Phương án 2 — compat layer toàn cục:** sửa `MegaForm.Core/.../CustomShellCompatibilityCssService.cs` cấp 1 lớp nền sáng mặc định cho mọi form premium khi shell trong suốt. Ít file hơn nhưng kém pixel-chuẩn từng template.
- ⭐ Kèm: gỡ `!important` ép màu title trong `CustomShellCompatibilityCssService.cs:128-136` (đã ghi nhận từ phiên trước: clobber hero heading) bằng `:where()` — liên quan trực tiếp chữ chìm.

### A2. Quy trình pixel-perfect (mỗi form)
1. Playwright: chụp `render/{id}` (trên nền SÁNG để loại nhiễu host) **và** mock `:3100/forms/{slug}` cùng viewport 1440.
2. So vùng: **nền trang · bo góc/đổ bóng card · khoảng cách · font · stepper · màu · góc**. Ghi delta.
3. Sửa trong `customCss` template (không phá token/cấu trúc) cho khớp mock.
4. Verify lại: render == mock ở vùng khung; chạy lại 1 ca giữ-style để chắc AI-edit vẫn an toàn.
- Form cần làm: **intake, australia, festa, bulgaria, euro** (ưu tiên intake+australia = 2 ảnh anh gửi). Lưu ý các tồn đọng cũ: euro "transparent outside", festa/bulgaria hero heading navy/Inter (memory).

### A3. Góc đen (intake)
Do `background:transparent` + card bo góc → nền host lộ ở 4 góc. Fix A1 (cho shell nền sáng) là tự hết. Kiểm thêm `border-radius` + `overflow` của `.mfp-intake`/`.in-card`.

### A4. Dọn override C8 inert
Form 13/15 (copy) đang dính `themeCssOverrides={--primary,--accent}` vô tác dụng → set lại `{}` (hoặc đổi sang đúng var scoped nếu muốn đổi màu thật). Dùng `qa5000/clean-forms.mjs` mở rộng hoặc 1 save nhỏ.

---

## B. CÒN DỞ TỪ PHIÊN NÀY (in-product — chưa deploy lên :5000)

| # | Việc | Vị trí / cách |
|---|---|---|
| B1 | **Khôi phục thay đổi ops.ts bị tôi lỡ revert** (DDL provider-quoting, UNCOMMITTED của phiên trước) | **VSCode Timeline** của `ops.ts` (bản trước checkout) hoặc port từ mirror `ai-form-creator.ts` (`qualifiedTableForProvider`~1920). Chi tiết: `qa5000/INCIDENT_ops_ts_ddl_revert.md` |
| B2 | **Port op `set_html_text` vào `ops.ts` product** (hiện chỉ có trong harness) | thêm handler (thay text-node, gate SHELL_HASH bất biến + replace không chứa tag) + đăng ký `listOpSchemas()`/`TOOL_DEFS`. Logic: `qa5000/ai-core.mjs` |
| B3 | **`ai-form-creator.ts` an toàn premium** (path blocker gốc strip shell) | khi form premium → route qua chat.ts ops-loop HOẶC giữ nguyên customHtml/css/theme + inject guide |
| B4 | **Set `settings.templateGuideSlug`** cho 6 form (đang UNDEFINED → chat.ts không nạp guide) | data-only save: 4→tpl-bulgaria…, 5→tpl-euro…, 9→tpl-down-under-australia, 10→tpl-festa-italiana, 12→tpl-intake-acme-ocean, 11→tpl-bulgaria… |
| B5 | **C8 đổi màu nhắm đúng var template** | thêm `colorVars` (vd `--au-primary`,`--in-primary`) vào facts.json (generator) → guide dạy AI set đúng var qua themeCssOverrides |
| B6 | **Deploy** | rebuild bundle `megaform-ai-form-assistant.js` (chat.ts) → copy :5000 wwwroot; chạy migration `01060036` (restart); copy `*.guide.md`+`*.facts.json` vào live wwwroot TemplateGuides |
| B7 | **C4/C5 thêm/bớt step** (HOÃN — khó) | clone khối `data-step` qua `customHtmlAppend` (KHÔNG đụng customCss) + renumber stepper + thêm field-placeholder. Anchor có trong facts (`stepAnchor`,`steps[].fieldKeys`). Làm có giám sát |
| B8 | ⭐ **Server: `schemaJson` nhúng bản sao `settings`** → round-trip phình `postSubmitExperience` (form 11 từng 30MB) | sửa `SaveForm`/`RenderModelResolver` đừng nhúng settings vào schemaJson (harness đã workaround bằng `sanitizeForSave`) |

---

## C. ACCEPTANCE (đo được)
- Mỗi form premium render **nền sáng đúng mock** trên CẢ host tối lẫn sáng; **0 góc đen**, **0 chữ tối-trên-nền-tối**.
- So mock :3100: vùng card/stepper/spacing/màu/font **trùng** (chênh ±1-2px chấp nhận).
- C8 đổi màu → màu render ĐỔI THẬT (qua var template) trong khi `customCss` byte bất biến.
- AI giữ-style vẫn đạt (chạy lại ≥1 ca/form sau khi sửa CSS).
- B1 khôi phục xong; B2–B6 deploy & smoke-test 1 form qua UI thật.

## D. LƯU Ý
- Sửa CSS template = đổi `customCss` (CSS_HASH đổi) → đây là **sửa thiết kế có chủ đích**, regen facts để hash khớp lại; KHÁC với ràng buộc "AI edit giữ CSS_HASH".
- Test trên COPY (11/13/14/15); form gốc 4/5/9/10/12 để nguyên.
- Bằng chứng phiên này: `qa5000/EVIDENCE.md`, `qa5000/evidence/*.png`, `CLAUDE_HANDOFF_20260627_AI_PREMIUM_EDIT_RESULTS.md`.
