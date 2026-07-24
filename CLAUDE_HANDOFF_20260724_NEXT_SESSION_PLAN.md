# HANDOFF — Kế hoạch phiên sau (viết 2026-07-23 khuya, cho phiên 07-24)

Tóm tắt phiên 07-23 + việc còn lại. Đọc kèm:
- `Docs/HANDOFF_NEXT_SESSION_AI_KB_RAILS_GAP_ANALYSIS_2026-07-23.md` ← **audit KB đã xong, có sẵn P0/P1/P2**
- `CLAUDE_HANDOFF_20260723_EURO_BORDER_CRAMPED_VISUALQA.md` ← 2 lỗi euro còn mở (border + bó hẹp)

---

## A. Đã xong phiên 07-23

| Việc | Kết quả |
|---|---|
| Package DNN 01.07.113 | Repack (E4v2 bị stale) → cài **fresh** lên `dnn10322_megaxin.ai` → QA PASS |
| 3 skin premium mới | `brochure-youth`, `floral-youth`, `teal-brochure` — convert từ mock, QA **duyệt đủ 4 step** |
| Commit | `13ea439` (templates + handoff + QA artifacts) |
| Docs DNN | LIVE: https://cisssolution.github.io/DNN_MegaformDocs/articles/dnn-form-templates.html (`8971977`) |
| Builder sửa ảnh/text hero | **Đã có sẵn**, không cần code mới — xem §C |

### Site QA hiện tại — `dnn10322_megaxin.ai` (host/dnnhost)
| Form | Page | FormId |
|---|---|---|
| euro-youth | `/megaform-qa-euro` | 1 |
| slider (product-consultation) | `/megaform-qa-slider` | 13 |
| brochure-youth | `/megaform-qa-brochure` | 34 |
| teal-brochure | `/megaform-qa-teal-brochure` | 35 |
| floral-youth | `/megaform-qa-floral-youth` | 36 |

---

## B. ⚠️ RỦI RO cần xử lý sớm — ảnh hero KHÔNG nằm trong git

`.gitignore` dòng 72 có `*.png` (toàn repo) ⇒ **mọi ảnh hero chỉ tồn tại trên đĩa máy build**, kể cả
`Assets/img/euro-youth/euro-youth-hero.png` (đã có từ trước, không phải lỗi mới).

Hệ quả: clone sạch → chạy `BuildPackage-DNN.ps1` → package ra **template trỏ tới ảnh không tồn tại**.

Ảnh cần có trên đĩa khi đóng gói:
```
Assets/img/brochure-youth/brochure-youth-hero.png
Assets/img/floral-youth/floral-youth-hero.png
Assets/img/teal-brochure/{teal-brochure-hero,team-member-1,team-member-2,team-member-3}.png
Assets/img/euro-youth/euro-youth-hero.png
```
→ **Quyết định cần user**: (A) `git add -f` các ảnh hero (repo nặng thêm ~8MB nhưng build tái lập được),
hay (B) giữ nguyên convention + thêm bước tải asset riêng. Chưa tự làm vì đổi convention repo.

---

## C. Builder sửa ảnh hero + text — ĐÃ CÓ, chỉ vướng breakpoint

Đã verify live (viewport 1920, `/megaform-qa-euro` builder → tab Design):
```
iframe preview width = 1258  → matches (min-width:1024px) = true
.ey-hero  display:flex, 440x704       ← hero HIỆN
data-mf-ie-bg = "1", class mf-ie-bg-editable   ← đã tag editable
.mf-ie-img-btn count = 1              ← nút "Change image" ĐÃ gắn
```
Code sẵn có trong `MegaForm.UI/src/shared/inline-edit.ts`:
- `enableImageEdit()` tag cả `<img>` **lẫn** element có `background-image:url(...)` (size-gate ≥120×80)
- `commitImage()` / `commitBg()` → `addPendingImageSwap` → swap literal URL trong **customHtml + customCss + customContent**
- Shell strings (hero headline/brand/step/stats) sửa inline; panel chỉnh màu/size chữ = `mf-ie-hero-style`

**Nguyên nhân user không thấy nút**: mở cả 2 rail (Presets trái + Theme Designer phải) → iframe preview
co xuống ~650px < 1024px → `.ey-hero{display:none}` → không có gì để bấm.

### Việc nên làm phiên sau (P1, nhỏ)
1. **Preview desktop-width**: khi device toggle = desktop, render iframe ở viewport ~1280px rồi `transform:scale()`
   cho vừa panel (kỹ thuật responsive-preview chuẩn). Sửa ở component preview của builder Design.
2. **Token Designer thấy hero CSS-background**: `token-designer.ts` hiện chỉ quét `{{content:*}}` + `<img>` trong
   customHtml ⇒ euro/bulgaria/festa báo "Image tokens 0". Thêm bước quét `url(...)` trong customCss.
   (3 skin mới đã dùng `<img>` thật nên đã hiện sẵn trong Image tokens.)
3. Cân nhắc chuyển hero của euro/bulgaria/festa sang `<img>` cho đồng bộ — **đổi hành vi, cần user duyệt**.

---

## D. Audit KB cho AI — đã có sẵn, chỉ cần THỰC THI

Toàn bộ phân tích nằm ở `Docs/HANDOFF_NEXT_SESSION_AI_KB_RAILS_GAP_ANALYSIS_2026-07-23.md` (185 dòng).
Tóm tắt để lên lịch:

**P0 — đóng lỗ hổng enforcement & dữ liệu mồ côi**
- Nối `DesignPreservationGate.cs` vào `Form/Save` ở **cả 4 host** (hiện là **dead code**; POST thẳng
  `Form/Save` bypass sạch mọi guard) ← **lỗ hổng lớn nhất**
- Seed 5 recipe pointer rows còn thiếu (gồm `convert-premium-form` — recipe guardrail quan trọng nhất,
  AI hiện không fetch được qua `get_knowledge`)
- Sửa drift docs↔code: CSS canonical 5555 vs 5588 bytes, breakpoint 768 vs 640px, `.mf-option-item` vs `.mf-option`

**P1** — route `GetPromptRecipe` cho Oqtane/Umbraco; ship template tabs/master-detail/rich-choices;
validation chung cho Pipeline B; sửa mâu thuẫn GridRepeater deprecated.

**P2** — dedupe ~40 slug `-1/-2`; tích hợp `tools/template-lint` làm QA gate; KB cho workflow/themeCssOverrides.

Kèm checklist verify 7 bước trong doc (SQL idempotent, diff byte-identical customCss sau AI convert,
curl test server reject…).

> ⚠️ Lưu ý cập nhật: audit đếm **178 templates** theo `MegaForm_01.06.32_Install.zip` (gói cũ).
> Gói hiện tại là **01.07.113** với **36 templates** trong catalog DONEE (33 + 3 skin mới).
> Cần **đếm lại coverage KB theo gói mới** trước khi kết luận "đủ/thiếu".

---

## E. Việc còn treo từ trước (chưa làm)

1. **2 lỗi euro-youth** (`CLAUDE_HANDOFF_20260723_EURO_BORDER_CRAMPED_VISUALQA.md`):
   - *mất border*: rule `MF-TRANSPARENT-OUTER-20260626` ép `.ey-shell/.ey-panel` transparent, giết
     `var(--ey-wash)=#f5f5f4`. **Cần user chọn A (trả wash, khớp mock) hay B (thêm border cho card).**
   - *bó hẹp*: `.ey-shell{grid-template-columns:440px 1fr}` hero fix cứng → pane hẹp (megaqa110 = 996px)
     làm cột form còn 524px (mock 712px), field 174px/cột (mock 268px).
     → 3 skin mới **đã tránh** bằng `min(Npx, 38%)`; nên áp cùng cách cho euro.
2. Chưa push branch `feature/typed-submission-storage-core` (nhiều commit local).
3. `teal-brochure`: 3 ảnh `team-member-*.png` đã copy nhưng skin đang render initials (CM/HP/AF) thay vì ảnh
   — nếu muốn dùng ảnh thật thì sửa `heroInnerHtml`.

---

## F. Lệnh/đường dẫn hay dùng

```
# build lại 3 skin (script generator)
node <scratch>/build-brochure-youth.cjs        # brochure
node <scratch>/build-from-spec.cjs             # floral + teal (đọc spec workflow)

# deploy 1 template lên site QA
copy Samples\FormTemplates\Premium\DONEE\<slug>-application.json ^
     E:\DNN_SITES\DNN10322_MegaXIn\Website\DesktopModules\MegaForm\Templates\

# tạo/cập nhật form từ template (cần dev.lock + header ModuleId/TabId hợp lệ)
POST /DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms

# repack DNN (repack thuần, tự đọc lại DONEE)
MegaForm.DNN\BuildPackage-DNN.ps1 -NoPause
```
Harness QA (login CLICK `[id$="_cmdLogin"]`, host/dnnhost): scratchpad `gifrec/` —
`new-forms-qa.mjs` (duyệt 4 step + full-page), `docs-shots.mjs` (ảnh docs), `qa-compare.mjs` (mock vs DNN).

Docs DNN: worktree clone `E:\_dnndocswt` (remote `CissSolution/DNN_MegaformDocs`, branch `main`,
layout `articles/` + `images/` ở root). Bản trong repo chính: worktree `E:\_docswt` branch `docs/dnn-series`.

---

## G. [07-24 user thêm] Docs cascade-sql-dropdowns: thay JSON thô bằng GIF setup builder
Trang https://cisssolution.github.io/DNN_MegaformDocs/articles/cascade-sql-dropdowns.html — mục **"The child field carries the dependency"** hiện in JSON thô (`{key:state, optionsSource:sql, optionsConnectionKey, optionsSql, optionsDependsOn:[country], optionsReloadOnChange}`). User muốn **quay GIF cách người dùng SETUP dropdown cascade trong builder** (chọn field → Data/SQL tab → connection + SQL + depends-on), KHÔNG in JSON. File: `articles/cascade-sql-dropdowns.md` trong repo `DNN_MegaformDocs` (clone `E:\_dnndocswt` branch dnn-series, hoặc `E:\_dnndocswt`... thực ra DNN docs repo = `CissSolution/DNN_MegaformDocs`, clone `E:\_dnndocswt`? KHÔNG — đó là MegaformDocs. DNN docs clone tại chỗ chưa có; clone lại `DNN_MegaformDocs`). Harness quay GIF: `scratchpad/gifrec/rec-hero-edit.mjs` làm mẫu (recorder-lib fps5 + glide cursor + frameElXY cho iframe). Builder DB tab = `#mf-tab-link-db`.

---

## H. [07-24 khuya] Builder hero-edit trong Design — 2 fix DONE, GIF docs CÒN
**DONE + committed:**
- `a81d1c7` nút « hide/show rail Presets (search row Design tab) → thu rail → preview >1024px → hero hiện.
- `95c3306` **rescan-on-resize**: hero premium `display:none` <1024px nên khi preview hẹp lúc init, `enableImageEdit` bỏ qua (0×0 fail size-gate) → thu rail hero hiện nhưng KHÔNG sửa được. Nay `initInlineEdit` re-run `enableImageEdit` on resize+ResizeObserver → verify VISIBLE iframe: sau collapse `.mf-ie-img-btn` 0→1 ✓.
- Đã deploy renderer+builder bundle+shell.css lên megaxin (site test). ⚠️ CHƯA repack package / chưa deploy dnndefender (2 fix builder này chỉ ảnh hưởng builder edit, không ảnh hưởng render public).

**CÒN (GIF):**
- Quay lại GIF "đổi text/ảnh hero" — bản `rec-hero-steps.mjs` (13-frame slideshow, 1.46MB) dùng SAI iframe (grab iframe `.mfp-euro-youth` ĐẦU TIÊN = iframe ẩn background, hero 0×0). **PHẢI chọn iframe VISIBLE**: `for f of page.frames(): el=await f.frameElement(); box=await el.boundingBox(); nếu box.width>800 && hero.offsetWidth>0 → đó là preview thật`. (probe-frames.mjs đã có logic + verify changeBtn:1). Quay lại → append GIF `dnn-hero-edit.gif` vào CUỐI `articles/dnn-form-templates.md` (repo DNN_MegaformDocs clone `E:\_dnndocswt`, layout articles/+images/ ở root) → commit + push main → Pages.
- ⚠️ GIF step-snapshot (fps 0.7, 13 frame, quality 14) là cách RELIABLE (continuous recorder loop bị hang khi locator iframe chờ 60s → GIF 79MB/647frame). Harness: `scratchpad/gifrec/rec-hero-steps.mjs` + `recorder-lib.mjs` (`__mfMove`/`shotsToGif`).
  ✅ **ĐÃ XONG** — `rec-hero-steps2.mjs` (21 frame, 2.7MB, chọn iframe VISIBLE `boundingBox().width>800`), push `DNN_MegaformDocs@main e78cc16` → LIVE. ⭐Mẹo: seed 1 hero đẹp vào Image library (`Upload/Image`) + park tạm ảnh test xấu trước khi quay.

---

## I. [07-24] ONLINE TEMPLATE GALLERY (GitHub) + SLIM PACKAGE — phần lớn DONE, còn 3 việc

### Đã xong (commit trên `feature/typed-submission-storage-core`)
| Commit | Nội dung |
|---|---|
| `d974187` | Publisher `tools/gallery/build-gallery.mjs` + Core `GalleryRepo` (KIMI chỉ có Core, **thiếu SsrfGuard** → Claude vá) |
| `2b1fce6` / `43a1fff` / `a55d2e3` | Endpoint DNN + Oqtane: `RemoteGalleryList` / `Install` / `Preview` |
| `99f83bb` | **jsDelivr** thay GitHub Pages |
| `12856bc` | **Slim package DNN 27.7 → 12.5 MB (−55%)** |
| `d127da4` | UX: Online thành TAB trong Template Gallery (categories + card + preview) |
| `18a9315` / `4267de5` | Cài artwork khi preview (hết 404 ảnh) + parity Oqtane |
| `0358828` | **Sửa preview trắng** (3 nguyên nhân — xem §I.3) |

- **Repo gallery**: `CissSolution/megaform-gallery` (public, `main`). Worktree local **`E:\_megaform_gallery_repo`**.
  Republish: `node tools/gallery/build-gallery.mjs --out E:\_megaform_gallery_repo` → commit → push → **purge CDN**
  `https://purge.jsdelivr.net/gh/CissSolution/megaform-gallery@main/manifest.json`.
- 🔴 **GitHub Pages KHÔNG dùng được** cho org `CissSolution` — cả 3 repo 404 kể cả sau khi bật Pages + `.nojekyll` (poll 20 phút). Nghi chặn cấp org. Đang serve qua **jsDelivr CDN**.
- ⭐ `.gitattributes` `* -text` trong repo gallery là **BẮT BUỘC**: mọi file ghim sha256, git đổi CRLF/LF = sai hash = hỏng toàn bộ install.
- Package giữ **4 starter** (`BUNDLED_SLUGS` trong publisher): `v0-contact-map-left-corporate`, `vendor-application` (single) + `tabbed-account-setup`, `project-intake-onboarding` (multi). 32 template + 12 ảnh (14.58 MB) ra khỏi package. `gallery-exclude.json` do publisher SINH — build script đọc từ đó nên package/gallery không bao giờ lệch.

### CÒN LẠI — 3 việc

**I.1 🔴 BUG: install template online xong → trong tab "Installed" bị KHOÁ, không dùng được** *(user báo 07-24)*
- Nghi thủ phạm: `MegaForm.UI/src/dashboard/wizard/gallery-modal.ts` — `const locked = isTrialMode() && (t as any).isPremium;`
- Trên megaxin lúc kiểm tra: `productionMode: true`, **0 card locked** → **không tái hiện khi license hợp lệ** ⇒ gần như chắc chắn nhánh **trial** (hoặc `__MF_PLATFORM__.productionMode` bị stale/false lúc user test).
- ⚠️⚠️ **Hệ quả nghiêm trọng cần quyết**: publisher đang **hardcode `premium: true` cho CẢ 35 template** (kể cả 4 starter bundled). Nếu `isPremium` của record local cũng thành true → trên site **trial** thì **ngay cả 4 starter mặc định cũng bị khoá** ⇒ trial mở gallery ra là **trắng tay**. Cần: (a) chỉ đánh `premium` cho template thật sự premium, (b) hoặc template đã cài từ gallery (licensed mới tải được) thì **không** khoá lại.
- Việc: reproduce trên site trial (đổi tên `license.lic` → site trial) → xác nhận → sửa → VQA cả 2 tab.

**I.2 🟡 Thumbnail bị cắt cụt (thừa mảng gradient dưới card)** *(user báo 07-24)*
- **Đã đo**: card Installed và Online **GIỐNG HỆT** — `.mfwg-thumb` cao **220px** nhưng iframe `.tpl-thumb-frame` chỉ **239×164** ⇒ thừa ~56px gradient. ⇒ **lỗi có sẵn của component dùng chung**, KHÔNG do tab Online.
- Nguồn: `gallery-preview.ts` → `buildCustomThumbnailMarkup()` dựng srcdoc **760×520** rồi scale vào `.tpl-thumb-frame`; CSS ở `Assets/css/megaform-builder-shell.css`.
- Việc: chỉnh scale/kích thước để thumbnail **lấp đầy** card 220px (ảnh hưởng CẢ gallery nội bộ → phải VQA cả 2 tab, và cả builder gallery nếu dùng chung).

**I.3 Còn lại của gallery**
- Slim package **Oqtane** (nuspec exclude template + ảnh, đọc `gallery-exclude.json`) + deploy site Oqtane để user test. (DNN đã xong.)
- **Kênh AI KB** lên GitHub + **thông báo tải lần đầu** trước khi dùng AI. KIMI đã có sẵn model `KbRepoManifest` / `kb/ai-knowledge-seed.json`. ⚠️KB hiện seed bằng **EF migration** (`01060032/35/36/37`) trên Oqtane và **SQL** (`01.06.28*-seed.sql`) trên DNN → chuyển lên GitHub = phải đổi cơ chế seed sang download-on-first-use.
- Umbraco/Web chưa có endpoint gallery (rule 3-nền song sinh).

### ⭐⭐ Gotcha ĐẮT GIÁ rút ra khi sửa preview trắng (§0358828) — dùng lại được
1. **Admin-shell guard ẩn MỌI form render trên dashboard**:
   `html.mf-admin-shell-route .mf-form-wrapper:not(.mf-host-overlay .mf-form-wrapper){display:none!important}` (inject inline, KHÔNG có trong megaform.css).
   ⇒ Bất kỳ tính năng nào render form thật trên route admin **phải thêm class `mf-host-overlay`** cho overlay/modal.
2. **`isPreview` mang 2 nghĩa xung đột**: renderer = "chỉ đọc"; nhưng `inline-edit.ts:2180` (`if(!cfg.isPreview) return;`) = "đây là Design surface → BẬT sửa". → đã thêm option **`readOnly`** cho renderer (`isPreview: !!config.isPreview && !config.readOnly`).
3. **z-index**: `.tpl-preview-modal` bị `Assets/css/megaform-builder-shell.css` đè xuống **1400** trong khi gallery overlay là **2147483646** → preview mở phía SAU. Đã `!important` 2147483647.
4. ⭐ **Kỹ thuật debug**: duyệt `document.styleSheets` + `el.matches(rule.selectorText)` ngay trong trang để **hỏi trình duyệt rule nào thắng** — nhanh hơn hẳn đoán mò (em đoán sai 3 lần trước khi làm vậy).

---

## J. [07-24] CODEX — QA SSR projected-schema trên DNN (đã xong, tham khảo)
Nguồn: `qa-dnn-ssr-20260724/README.md`. Site: **`dnn10322_megaqa.ai`** (IIS app pool `DNN10322_MegaQA`).
- Deploy **scoped**: chỉ `bin/MegaForm.Core.dll`, `bin/MegaForm.DNN.dll`, `DesktopModules/MegaForm/Views/FormView.ascx` (khớp SHA-256 bản Release). Backup trước deploy: `E:\DNN_SITES\DNN10322_MegaQA\Backups\MegaForm-ssr-20260724-183713`.
- Test: **189 pass / 0 fail** (⚠️ nhiều hơn 178 của Claude — Codex có thêm test), renderer parity golden **11 pass**, Core+DNN Release net472 **0 warning 0 error**.
- Ma trận runtime PASS: SSR chuẩn (`data-mf-ssr="1"`, 14 field group, không trùng ID), multistep (4 trang SSR, giữ giá trị khi Next), custom HTML (shell có trong response IIS thô + hydrate, 16 field), FlexGrid (`data-mf-flexgrid="locked"`, 390×844 không tràn ngang), widget rating (5 nút, chọn 3 sao → hidden = `3`), **access control** (field chỉ-đăng-nhập KHÔNG lộ trong HTML lẫn schema với khách ẩn danh), embed (`?embed=1`, `mf-hide-header`).
- **Fallback cap SSR**: custom HTML 720,074 ký tự → server trả fields container rỗng/không đánh dấu, client schema + renderer bundle vẫn còn để render phía client, schema gốc khôi phục trong `finally`.
- Ảnh: `baseline-two-col.png`, `after-custom-html-viewport.png`, `standard-multistep-step{1,2}.png`, `flexgrid-{custom-html,widget,mobile-390x844}.png`, `embed-mode.png`.
- ⚠️ QA site cold-start rất chậm trước khi deploy; recycle app pool xong warm request còn 96–448 ms.
