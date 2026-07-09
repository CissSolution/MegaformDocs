# CLAUDE HANDOFF — 2026-07-09 (phiên 3): DNN template pixel-perfect (row-spacing + missing images)

User báo (kèm screenshot rsvp trên dnnqa1798.ai): row spacing hỏng + field lặp đôi + ảnh mất trên các
template DNN. Yêu cầu: so Visual QA với mock `form-builder-controls (10)`, **CHỈ sửa template**
(không sửa megaform code), cập nhật package + kho template DONEE. KẾT QUẢ: ✅ 16/16 trang
/templates/* trên dnnqa1798.ai PASS (0 duplicate, 0 broken image, 0 tight-gap, layout khớp mock).

## §A. Root cause (quan trọng — đọc trước khi đụng premium template)

1. **Row-spacing/duplicate = client reflow mangles shell.** Mỗi lần render CLIENT, `normalizeSchema` →
   `migratePremiumWizardSchemaToNative` → `syncFieldPlaceholders` + `reflowWizardFieldTokensBySchemaPages`
   (`MegaForm.UI/src/shared/premium-native-migration.ts` + `custom-html-insert.ts`) xé `{{field:*}}`
   token khỏi wrapper rồi chèn lại ở mức panel:
   - Token KHÔNG có wrapper riêng (vd `{{field:email_address}}` là con trực tiếp của `.mfp-step-body`)
     → không tìm được wrapper → chèn bản MỚI `<div class="mf-custom-field">` mà KHÔNG xóa bản cũ
     → **field lặp đôi** (rsvp: 11 keys ×2 — đúng ảnh user chụp).
   - Token ĐẦU TIÊN của container → cả container bị coi là "wrapper" → bốc nguyên khối; grid/row
     wrapper (mfp-fields-grid/mfp-grid/mfp-field-row) bị flatten → field dính chùm margin 0.
   - **Oqtane không dính** vì SSR (C# FormHtmlRenderer) render đủ field + client hydrate bind-only;
     **DNN dính** vì SSR chỉ là skeleton (data-mf-ssr có nhưng 0 field) → client tự build.
   - DB schema **sạch 100%** (byte-identical file template) — lỗi thuần in-memory lúc render.
2. **Missing images = đường dẫn Oqtane.** Template trỏ `/Modules/MegaForm/img/...`; DNN serve tại
   `/DesktopModules/MegaForm/Assets/img/...` (KHÔNG có rewrite nào trong MegaForm.DNN) → 404 trên DNN:
   journey (americana-hero), discovery (rose-hero + plovdiv), classic (vintage-americana-header),
   youth (euro-youth-hero), festa (hero + texture), outback (outback-station-side).

## §B. Fix đã áp (TEMPLATE-ONLY, 10 file trong `Samples/FormTemplates/Premium/DONEE`)

1. ⭐⭐ **Marker `data-mf-flexgrid="locked"` trên root div** của 10 shell premium (down-under, Journey,
   Discovery, youth, festa, rsvp, intake, wellness, classic, outback — cả 2 mirror customHtml nếu có).
   `migratePremiumWizardSchemaToNative` line ~213 coi shell có `data-mf-flexgrid` là **FINAL layout**
   → SKIP toàn bộ reflow/sync → client render đúng như authored = giống Oqtane SSR.
   **ĐỪNG XÓA marker này** khi sửa template sau này. (markNative vẫn chạy nhờ Section
   properties.pageBreak=true ở steps 2+; native nav/stepper hoạt động bình thường.)
2. **Ảnh dual-platform**: giữ đường Oqtane làm default + append rule override scope **`.DnnModule`**
   (class chỉ có trên DNN) trỏ `/DesktopModules/MegaForm/Assets/img/...` (block `/* MF-QA-IMGPATH-v1 */`
   cuối customCss). 4 chỗ `<img>` hỏng (journey, discovery ×2, festa hero) → chuyển thành
   `<span class='xx-hero-img' role='img'>` + CSS background (absolute inset:0 cover; bg-thumb-img =
   static block 100%) — nhờ đó URL nằm trong CSS nên override được theo platform, và hero-swap
   (applyImageSwaps find/replace URL trong customCss) vẫn hoạt động.
3. **Xóa token mồ côi** `{{field:referral_source}}` (intake) — không có field backing; khi hết reflow
   che thì sẽ hiện error-box đỏ.
4. classic: sửa fallback sai `url('/vintage-americana-header.png')` → `/Modules/MegaForm/img/...`.

Patch script (tái chạy được): scratchpad 26010eff `patch-templates.mjs`. File JSON bị re-format
JSON.stringify(,1) — diff git to nhưng nội dung chỉ đổi các điểm trên.

## §C. Đã deploy lên dnnqa1798.ai (user CHO PHÉP FULL qua AskUserQuestion)

- **SQL** `UPDATE MF_Forms SET SchemaJson=@file WHERE FormId IN (3..12)` (map: 3=down-under, 4=journey,
  5=discovery, 6=classic, 7=youth, 8=rsvp, 9=festa, 10=intake, 11=wellness, 12=outback) — script
  `update-dnn-schemas.ps1` (SqlClient parameterized). ⚠️ auto-mode classifier CHẶN cả API Form/Save
  lẫn sqlcmd cho tới khi user duyệt — đừng tự lách.
- ⭐ **GOTCHA `MF_Forms.SettingsJson`**: form 4 (journey) có SettingsJson 58KB CŨ (residue thí nghiệm
  d5 phiên trước) **đè settings trong SchemaJson** → trang vẫn serve shell cũ dù SchemaJson mới.
  Fix: `UPDATE MF_Forms SET SettingsJson=NULL WHERE FormId=4`. Các form khác SettingsJson=NULL sẵn.
- ⚠️ **sqlcmd cần flag `-I`** (QUOTED_IDENTIFIER ON) khi UPDATE MF_Forms — không thì Msg 1934.
- Sau SQL: `Restart-WebAppPool DNNQA1798` (schema memoized in-memory; warmup ~20-70s).
- **Kho template site**: copy DONEE/*.json → `E:\DNN_SITES\DNNQA1798\Website\DesktopModules\MegaForm\Templates\`.
- DB residue KHÔNG đụng: form 2 "ssss", 19 (AI test), **20 "Event Registration & RSVP" 317KB**
  (bản dup thí nghiệm phiên trước — cân nhắc xóa khi dọn site).

## §D. Package

- **Rebuilt `MegaForm.DNN/Install/MegaForm_01.07.98_Install.zip`** (21.8MB, 555 files resources) —
  `& .\BuildPackage-DNN.ps1 -NoPause`. Templates\ = DONEE đã patch (verify có marker), Assets\img\ ship
  đủ hero PNG (bulgaria-discovery/, euro-youth/, festa-italiana/, mock/, vintage-americana-header.png)
  — BẮT BUỘC để fix ảnh chạy trên site cài mới. Version giữ 01.07.98 (không đổi code/DLL).

## §E. Verify (Visual QA — đã soi mắt từng screenshot)

- Sweep 16/16: `live-sweep.mjs` → 0 netFail ảnh (chỉ còn 1 ERR_ABORTED Google-Maps tile external ở
  contact-map-left-corporate — pre-existing, ngoài scope), 0 broken img, 0 gap<6px, 0 dup key.
- DOM rsvp trên DNN giờ = Oqtane :5120 (18 groups, first+last & job+org cùng hàng 2 cột).
- Đã so mắt live vs mock: rsvp/intake/wellness/classic (4NTF :3000) + journey/discovery/festa/youth/
  outback/down-under (mock 10 :3005 + 4NTF) — khớp layout, ảnh hiện đủ. Khác biệt nhỏ chấp nhận:
  step 1 không hiện nút Back disabled như mock (behavior renderer, không phải template).
- Mock servers có sẵn: **:3000 = 4NewTemplateForms** (PID 22916; switcher 6 template trong header),
  **:3005 = form-builder-controls (10)** (PID 11580; /forms/australia|americana|bulgaria|euro-youth|
  festa-italiana|intake|contact|login). Screenshots: scratchpad 26010eff `mock-shots/` + `live-shots*/`.

## §F. NEXT / lưu ý

1. Oqtane: user tự backup template Oqtane, KHÔNG yêu cầu anti-regression (marker vô hại với SSR; nếu
   muốn Oqtane dùng bản patch thì reseed các site Oqtane từ DONEE).
2. Templates giờ là bản chuẩn trong DONEE + package; nếu cài site DNN mới → gallery + ảnh OK sẵn.
3. Cân nhắc (việc CODE, cần user duyệt riêng): fix tận gốc reflow trong custom-html-insert.ts để
   shell token-trực-tiếp không bị dup; và flags `/Modules/MegaForm/img/flags/` trong
   FormHtmlRenderer.cs:876 cũng 404 trên DNN (country-picker flags) — cùng lớp lỗi đường dẫn.
4. Còn PR #6 docs DNN CHỜ MERGE + repack 01.07.99 bỏ refs chết (từ handoff trước).

Memory: [[project_20260709_dnn_template_pixel_perfect]]. Scripts: scratchpad session 26010eff.
