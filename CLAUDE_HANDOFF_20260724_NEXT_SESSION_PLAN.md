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
