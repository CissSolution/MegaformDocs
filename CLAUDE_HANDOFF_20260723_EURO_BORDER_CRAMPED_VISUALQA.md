# HANDOFF — 2026-07-23: Visual QA pixel-perfect euro-youth (DNN) vs mock — FIX 2 lỗi: **mất border (gray wash)** + **bó hẹp (cramped)**

> Người viết: Claude (phiên 07-23). Người nhận: **Codex** tiếp tục.
> Nhiệm vụ: đưa render euro-youth trên DNN **khớp pixel với mock**. Còn 2 lỗi đã root-cause đầy đủ (đo live, không đoán). Tất cả bằng chứng + đường dẫn + account ở dưới.

---

## 0. TL;DR (2 lỗi + nguyên nhân đã xác định live)

| Lỗi | Triệu chứng | Nguyên nhân (đã đo) | Sửa ở đâu |
|---|---|---|---|
| **1. Mất border** | Mock có khung xám (wash `#f5f5f4`) bọc quanh thẻ trắng; DNN **trong suốt** → thẻ trắng trôi nổi, mất khung | Rule `/*MF-TRANSPARENT-OUTER-20260626*/ ...ey-shell,...ey-panel{background:transparent!important}` **đè** `background:var(--ey-wash)`. (`--ey-wash` resolve ĐÚNG = `#f5f5f4`, nhưng bị `!important` transparent giết) | `settings.customCss` của template (+ twin Oqtane + form live) |
| **2. Bó hẹp** | Field 2 cột chật (174px/cột) vs mock (268px/cột); cả form co lại | `.ey-shell{grid-template-columns:440px 1fr}` — hero **cố định 440px** ăn hết phần dư khi ContentPane hẹp. megaqa110 ContentPane=**996px** → form col=524px (mock=712px) | `settings.customCss` `@media(min-width:1024px)` |

**Cả 2 lỗi nằm trong CSS của TEMPLATE (không phải renderer DLL).**

---

## 1. Account / Link / Site

### DNN QA site (mục tiêu QA — user chỉ định)
- **URL**: http://dnn10322_megaqa110.ai — login **host / dnnhost**
- **Trang euro**: http://dnn10322_megaqa110.ai/Premium-Templates-110/youth-application (form **#1**)
- Builder: thêm `#mf-builder`; Dashboard: `#mf-dashboard`. Ép EN: `?mflocale=en-US`.
- DB: **DNN10322_MegaQA110** @ `WINDOWS-11\SQLEXPRESS` (Win-auth). CSS form ở `dbo.MF_Forms.SettingsJson` (FormId=1) → `settings.customCss`.
- Site root: `E:\DNN_SITES\DNN10322_MegaQA110\Website`, pool `DNN10322_MegaQA110.AI_nvQuickSite`.

### DNN site sạch (đã cài package 01.07.113 hôm nay — dùng để QA lại sau khi fix)
- **URL**: http://dnn10322_megaxin.ai — host/dnnhost. Euro = **/megaform-qa-euro** (form 1, module 386). Slider = /megaform-qa-slider (form 13, module 387). DB **DNN10322_MegaXIn**.
- ⚠️ Trên skin mặc định của site này, ContentPane **RỘNG hơn** → euro render 268px/cột ĐÚNG (không bó hẹp). Lỗi bó hẹp chỉ lộ khi ContentPane < ~1120px (như megaqa110). Fix phải chịu được pane hẹp → **QA trên megaqa110** mới thấy.

### Mock (NGUỒN CHÂN LÝ pixel)
- **URL live**: http://localhost:3000/forms/euro-youth (chạy `pnpm dev` trong `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)`).
- **Source**: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\app\forms\euro-youth\page.tsx` — **đọc file này để lấy ground-truth**.

---

## 2. Nơi lưu TEMPLATE FORM + luồng đóng gói package (đã VERIFY 07-23)

### 2.1 — 2 nguồn AUTHORITATIVE của bộ Premium (33 template, gồm **euro** + **slider**) → **SỬA Ở ĐÂY**
| Nền | Đường dẫn (folder) | Git | Vào package qua |
|---|---|---|---|
| **DNN (canonical)** | `Samples/FormTemplates/Premium/DONEE/*.json` (33) | **TRACKED** | `MegaForm.DNN/BuildPackage-DNN.ps1` **L419** copy `DONEE\*` → `Resources\Templates\` → runtime `DesktopModules/MegaForm/Templates` |
| **Oqtane (twin)** | `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/*.json` (33) | **gitignored** | `pack.cmd` đóng gói `wwwroot` as-is |

⚠️ **2 bản là BẢN SAO RIÊNG, KHÔNG auto-sync body**: euro DONEE = 56564B (đường ảnh `/DesktopModules/...`), Oqtane twin = 57384B (đường ảnh `/Modules/...`). **Đổi template phải sửa CẢ HAI file.** `pack.cmd` chỉ auto-gen `*.facts.json`+`*.guide.md` (qua `MegaForm.UI/tools/gen-template-facts.cjs` → 3 dir `Resources/TemplateGuides`), **KHÔNG copy body template**.

Template euro cụ thể: `…DONEE/youth-application.json` + `…Oqtane…/Templates/youth-application.json` → key **`settings.customCss`** (~35KB). Cả 2 bản HIỆN đã có E4v2+E2+transparent-outer (verify).

### 2.2 — Web / Umbraco: HIỆN KHÔNG có bộ Premium DONEE
| Nền | Đường dẫn | Nội dung |
|---|---|---|
| Web | `MegaForm.Web/App_Data/MegaForm/Templates/` (TRACKED, 10 json + folder category) | bộ CŨ, **không có euro**. NuGet Web ship qua `content/App_Data/MegaForm/Templates`. |
| Umbraco | `MegaForm.Umbraco.Host/App_Data/MegaForm/Templates/` (gitignored) | **rỗng** |

→ Muốn euro/slider lên Web/Umbraco: phải copy bộ DONEE vào 2 nơi trên (chưa có).

### 2.3 — Bản legacy/runtime (KHÔNG phải nguồn premium — ĐỪNG sửa nhầm)
`DesktopModules/MegaForm/Templates/` (5 json default cũ, gitignored) · `MegaForm.UI/templates/` (4 json golf/pdf) · `MegaForm.Core/Templates/` (chỉ `.cs`) · `Samples/FormTemplates/Premium/_archive/` (Backup + "DONEE - Oqtane" = bản cũ tham khảo).

### 2.4 — Form đang chạy (patch để QA ngay, chưa cần repack)
`DB DNN10322_MegaQA110.dbo.MF_Forms.SettingsJson` (FormId=1) — bản megaqa110 render mà user QA. Mock chân lý: `app/forms/euro-youth/page.tsx`.

> ⚠️ **SettingsJson & template JSON có DUP-KEY casing** (`customHtml`+`CustomHtml`, `customCss`+`CustomCss`). `JSON.parse+stringify` gộp (last-wins) → hỏng renderer. Patch bằng **raw/escaped-value replace** (thay chuỗi giá trị cũ→mới) hoặc SQL `REPLACE` (global, cả 2 casing). Đừng parse-rồi-ghi-lại.

### 2.5 — Quy trình đóng gói (Codex)
1. Sửa `settings.customCss` template ở **CẢ** `DONEE/` **và** Oqtane `wwwroot/…/Templates/` (+ Web/Umbraco nếu muốn).
2. **DNN**: `MegaForm.DNN/BuildPackage-DNN.ps1 -NoPause` (repack thuần — tự đọc lại DONEE). Ra `MegaForm.DNN/Install/MegaForm_01.07.113_Install.zip`.
3. **Oqtane**: `pack.cmd` (orchestrator: TS→facts/i18n→guard→dotnet Release→nuget pack→validate).
4. Verify zip chứa template đã sửa (giải nén `Resources.zip` → `Templates\youth-application.json`, grep marker). Rồi cài site sạch QA lại (SOP §7).

---

## 3. LỖI 1 — Mất border (gray wash frame)

### Bằng chứng (đo live 1440px viewport)
- **Mock** `section` (panel phải) background = `stone-100 = #f5f5f4`; thẻ trắng `.rounded-3xl bg-white shadow-sm` nổi trên nền xám → có khung. (mock source: dòng 229 `bg-stone-100`, dòng 270 card.)
- **DNN** computed: `.ey-shell` bg = `rgba(0,0,0,0)`, `.ey-panel` bg = `rgba(0,0,0,0)` (TRANSPARENT). `.ey-card` = white (OK).
- `--ey-wash` resolve **ĐÚNG** = `#f5f5f4` (fallback chain `var(--mf-page-wash,var(--mf-preset-bg,#f5f5f4))`, cả 2 var trên đều undefined nên rơi về #f5f5f4). **Biến KHÔNG lỗi** — cái đè nó mới là thủ phạm.

### Nguyên nhân chính xác (rule đã tìm ra trong customCss)
```css
/* [/PremiumChoiceChipsCards] */ /*MF-TRANSPARENT-OUTER-20260626*/
.mf-form-wrapper .mfp.mfp-euro-youth,
.mf-form-wrapper .mfp.mfp-euro-youth .ey-shell,
.mf-form-wrapper .mfp.mfp-euro-youth .ey-panel{background:transparent!important}
```
- Specificity `(0,4,0)` + `!important` → thắng rule authored `.mfp-euro-youth .ey-panel{background:var(--ey-wash)}` `(0,2,0)`.
- Rule này **cố ý thêm 06-26** theo yêu cầu user "make outside-the-form transparent" — xem `CLAUDE_HANDOFF_20260626_PREMIUM_VISUALQA_AND_AI_CONVERT.md §1b`. Lúc đó `.mfp-euro-youth/.ey-shell/.ey-panel` hard-code `#f5f5f4`; user muốn vùng NGOÀI thẻ trắng trong suốt (blend với host page). Marker này có trong **13 template DONEE** (grep `MF-TRANSPARENT-OUTER`).

### ⚠️ MÂU THUẪN THIẾT KẾ — cần quyết định
06-26 **cố ý bỏ** nền xám (blend host page). Mock **có** nền xám. User bây giờ nói "mất border vs mock" ⇒ muốn khớp mock. 2 lựa chọn (Codex/user chọn):
- **A. Khớp mock 100%**: bỏ `.ey-shell` + `.ey-panel` khỏi rule transparent (chỉ giữ `.mfp.mfp-euro-youth` outer transparent nếu vẫn muốn outer blend). → khung xám `#f5f5f4` quay lại y hệt mock. Rủi ro: tái xuất "hộp xám" mà 06-26 đã bỏ.
- **B. Border thay vì wash (giữ blend)**: giữ transparent-outer, nhưng thêm `border:1px solid var(--ey-border2)` (=`#e7e5e4`) cho `.ey-card` (giữ `box-shadow:0 1px 2px rgba(0,0,0,.05)` + `border-radius:24px`). → thẻ có viền rõ trên mọi nền, không cần hộp xám. **Không khớp mock 100%** nhưng "có border".

> Gợi ý: user nói "**mất border**" (không phải "mất nền xám") ⇒ nhiều khả năng muốn **thẻ có viền rõ**. Nếu QA yêu cầu pixel-perfect tuyệt đối với mock thì chọn **A**. Nên hỏi user 1 câu, hoặc làm **A** (đúng mock) + note.

### Sửa ở đâu
`settings.customCss` (canonical + twin Oqtane) + form live megaqa110 (SQL/builder). Sau sửa canonical → **repack + cài site sạch QA lại** (SOP §7).

---

## 4. LỖI 2 — Bó hẹp (cramped)

### Bằng chứng (đo live 1440px, `qa-compare.json`)
| Element | MOCK width | DNN(megaqa110) width | Chênh |
|---|---|---|---|
| outer/shell | **1152** | **964** | −188 |
| hero (trái) | 440 | 440 | = (cố định) |
| form panel | **712** | **524** | −188 |
| card | 616 | 428 | −188 |
| **field grid cols** | **268px 268px** | **174px 174px** | **−94/cột** |
| ContentPane (host) | — (full-page) | **996** | skin hẹp |

### Nguyên nhân
```css
@media(min-width:1024px){ .mfp-euro-youth .ey-shell{grid-template-columns:440px 1fr} ...}
```
- Hero **cố định 440px**. Khi ContentPane hẹp (megaqa110 = 996px → shell 964px), toàn bộ 188px thiếu hụt bị trừ vào cột form (1fr): 712→524. Kéo theo card 616→428, grid 552→364, cột 268→**174px** (rất chật).
- Mock là **full-page 1152px** nên form = 712px thoải mái. DNN module nằm trong pane 996px của skin → không thể nới pane, **template phải tự thích nghi**.

### Fix direction (Codex thử + đo lại)
- Cho hero **co được** thay vì fix 440px. Ví dụ:
  - `grid-template-columns: clamp(300px, 34%, 440px) minmax(0, 1fr);` (hero co xuống ~330px khi pane hẹp, giữ 440px khi rộng), HOẶC
  - `grid-template-columns: minmax(0, 400px) minmax(520px, 1fr);` (đảm bảo form ≥ ~520px).
- Kết hợp giảm padding ngang panel khi hẹp: `.ey-panel{padding:32px 48px}` → cân nhắc `32px 32px` để lấy lại ~32px.
- **Mục tiêu**: cột field ≥ ~250px (2 cột không chật) ngay cả khi shell ~964px; VẪN khớp mock khi shell=1152px.
- ⚠️ Đo cả 2 mốc: pane rộng (site sạch/mock ≈1152) **và** pane hẹp (megaqa110 ≈964). Đừng chỉ sửa 1 mốc.

---

## 5. Đừng làm regression (đã fix phiên trước — GIỮ)
- **E1** hero hiện (`@media (min-width:640px){` opener — orphan `}` từng nuốt block @media).
- **E2** 2-cột `ey-grid ey-grid-2`. **E3** hero img `/DesktopModules/MegaForm/Assets/img/euro-youth/euro-youth-hero.png`. **E4v2** H1 trắng `.mfp.mfp-euro-youth .ey-hero h1{color:#fff!important}`.
- **S1** (JS) giữ grid wrapper — `MegaForm.UI/src/shared/custom-html-insert.ts` (regex `(?:au|bg|ey|fi)-(?:grid|stack)`).
- **L1** slider img `object-fit:cover` (template product-consultation).
- Commit tham chiếu: `d3182cd`, `b90c146` (canonical), `cf3052a` (antiforgery).

---

## 6. Harness QA (tái dùng — đã tạo sẵn)
Thư mục scratchpad: `…/393fd39d-…/scratchpad/gifrec/` (có local `node_modules` + playwright). Bản copy bền: **`Docs/qa-euro-visualqa-20260723/`** gồm:
- `cmp-mock.png`, `cmp-dnn.png` — ảnh so sánh (mock vs DNN, cùng 1440px).
- `qa-compare.mjs` — đo computed-style mock vs DNN (login host → evaluate → JSON). `qa-compare.json` = output.
- `qa-vars.mjs` — resolve CSS var (`--ey-wash`, `--mf-preset-bg`…) live.
- `qa-override.mjs` — liệt kê rule đè background.
- **Login DNN headless**: `page.goto('/Login?mflocale=en-US')` → fill `[id$="txtUsername"]`/`[id$="txtPassword"]` (host/dnnhost) → **CLICK** `[id$="_cmdLogin"]` (KHÔNG dùng Enter). Antiforgery = `jQuery.ServicesFramework(-1).getAntiForgeryValue()` → header `RequestVerificationToken`.
- Chạy: `cd` vào `gifrec` rồi `node qa-compare.mjs` (node v24, playwright global ở `AppData\Roaming\npm\node_modules`).

---

## 7. Acceptance + quy trình xong việc
1. Sửa `settings.customCss` euro (canonical `Samples/FormTemplates/Premium/DONEE/youth-application.json` **+ twin Oqtane**) cho cả 2 lỗi. Patch form live megaqa110 (SQL raw-replace hoặc builder) để QA ngay.
2. Chụp lại `qa-compare.mjs` → cột field ≥ ~250px trên megaqa110; khung/border khớp mock (option A hoặc B).
3. Không regression E1–E4v2/S1/L1 (mục §5).
4. **Repack DNN** (`MegaForm.DNN/BuildPackage-DNN.ps1 -NoPause` — repack thuần, đọc lại template từ `Samples\...\DONEE`) → cài site sạch → QA lại. SOP đầy đủ: memory `project_20260723_dnn_clean_install_qa_euroyouth_slider` (khôi phục `Install.aspx`+`DotNetNuke.install.config.resources` từ `E:\DNN\DNN_Platform_10.3.0_Install.zip` → `GET /Install/Install.aspx?mode=installresources` → re-harden; DevBulkCreate cần `dev.lock`+header ModuleId/TabId).
5. Cân nhắc áp fix cho các skin DONEE khác nếu chúng cũng có `MF-TRANSPARENT-OUTER` gây mất khung (13 file — nhưng quyết định theo từng skin, đừng sửa mù).

## 8. Tham chiếu pipeline CSS (cho Codex)
- `ModuleCssComposer.Compose` = nối `[preset, scoped-theme-vars, authored customCss, module override]` → `NeutralizeStyleBreakout`. Renderer 2 nguồn: `FormHtmlRenderer.cs` (SSR) + TS renderer — **giữ parity**.
- CLAUDE.md Rule #6: mọi CSS emit qua `NeutralizeStyleBreakout`. Rule #5: HTML-encode mặc định.
- `--ey-*` dùng dual-channel `var(--mf-page-X, var(--mf-preset-X, authored))` — đừng phá chuỗi.
