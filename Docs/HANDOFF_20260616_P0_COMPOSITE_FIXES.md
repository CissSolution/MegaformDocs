# HANDOFF — START HERE — P0 Composite/AI/Calendar fixes (2026-06-16) — FOR USER REVIEW

> Phiên thực hiện P0 từ `PLAN_20260616_COMPOSITE_FIELDGROUPS_AND_BUILDER_UX.md` (đã verify audit + bổ sung yêu cầu user).
> **4/6 P0 DONE + live-proven; 1 builder-CSS regression do phiên này gây ra ĐÃ FIX; 2 P0 còn lại PENDING.** Reply: **Tiếng Việt**.
> Site QA: `Oqtane.MSSQL3` → http://localhost:5070 (host/`abc@ABC1024`). Memory: [[project-composite-gd1-done-and-ai-relational]], [[project-april-revert-incident-recovery]].

## BẢNG TRẠNG THÁI (2026-06-16)
| Hạng mục | Trạng thái | Bằng chứng QA |
|---|---|---|
| P0-5 Calendar popup width | ✅ DONE live | popup 320px (field 902px); ảnh `tmp-qa/cal-width-after.png` |
| P0-1 Normalize alias composite | ✅ DONE live | unit-test all-PASS; trong bundle ai-form-assistant + dashboard |
| P0-6 AI prompt dạy Composite | ✅ DONE live | studio mở OK; teaching trong dashboard bundle; ảnh `ai-studio-smoke.png` |
| P0-4 Builder composite preview + mask | ✅ DONE live | parts thật + click chọn + mở designer; ảnh `composite-builder-final.png` |
| 🔴 Regression builder-ts.css (gây bởi P0-4) | ✅ FIXED live | palette sáng + accordion cards; ảnh `builder-css-fixed.png` |
| Bonus: vite.config `ai-form-assistant` entry | ✅ restored | bundle build được |
| Source hygiene: 4 file src/styles stale | ✅ restored | builder-shell/ts, admin-shell, submissions-ts → bản tốt |
| **§2c Phase 1 — Drag UX "block placeholder" mode** | ✅ DONE live (phiên 2) | xem §4-UPDATE; ảnh `tmp-qa/dragux-2-blockmode.png` + `dragux-3-realdrag.png` |
| 🐞 BUG `colEl` undefined (April-revert) → top-level reorder throw | ✅ FIXED + proven | QA `orderChanged=true`, 0 JS error; `scn-dragux-blockmode.cjs` |
| **§2c Phase 2 — Composite Registry (P0-2)** | ✅ DONE live (phiên 3 auto) | helpers.ts=1 nguồn; QA parity 14 preset. → `HANDOFF_20260616_COMPOSITE_REGISTRY_WIDGETS_SERVERVALIDATE.md` |
| **5 widget composite MỚI → Layout tab** | ✅ DONE live | date_range/money/measurement/price_range/full_contact |
| **§2c Phase 3 — Server validate (P0-3)** | ✅ DONE live (Core DLL + restart) | 5/5 case QA (mismatch/ssn/money REJECT, valid PASS, fail-open) |
| P1 Field-Group user Save-as-Block | ⏳ PENDING | data-driven registry sẵn sàng cho user templates |
| ⚠️ Alias-type legacy gap (P0-1 mở rộng) | ⏳ PENDING | form cũ type `CompositePhone` không render/validate composite — normalize khi LOAD |

**Cache:** mọi thay đổi deploy ở `?v=20260615-B171` (CHƯA bump). Review = **Ctrl+F5** hoặc incognito. KHÔNG có thay đổi C#/DLL phiên này → không cần restart để review.

---

## 🔴 0a) REGRESSION builder CSS (do phiên này gây ra) — ĐÃ FIX + visual-proven
- **Triệu chứng (user báo):** builder về "giao diện cũ" (palette tiles TỐI, Design Studio plain-text không có accordion card) + tưởng "không drop được control".
- **Root cause (workflow 3-agent xác minh):** KHÔNG phải lỗi JS (builder.js boot sạch, DnD thực ra vẫn chạy 9→10 fields trong automation). Là **`megaform-builder-ts.css` bị stale/partial**: file này là lớp OVERRIDE "v0 redesign" (load SAU megaform-builder.css, đổi dark→light + accordion cards + drop affordance). Bản tốt = **3459L (md5 7b5fa71c)**; `src/styles/megaform-builder-ts.css` còn là bản **April-revert 1282L** (recovery chỉ fix bản DEPLOYED, KHÔNG fix src/styles). Khi làm P0-4 mình append composite vào bản stale rồi **deploy đè bản tốt 3459L trên MSSQL3** → mất 63% rules (palette tối, không accordion, không drop feedback).
- **Fix:** lấy bản tốt 3459L (từ `DesktopModules/MegaForm/Assets/css/` = golden) + re-append 32 dòng composite-preview → deploy mọi nơi (src/styles + Assets + MSSQL3 + 4 platform). LIVE giờ 3493L, accordion=13, composite=4. Visual-proven (ảnh `tmp-qa/builder-css-fixed.png`: palette sáng + Design Studio accordion cards).
- **Chống tái phát:** đã khôi phục thêm **3 file src/styles stale khác** (build-synced) từ bản tốt: `megaform-builder-shell.css` (1462→3320L), `megaform-admin-shell.css` (526→599L), `megaform-submissions-ts.css` (206→725L). LIVE MSSQL3 các file này VỐN đã tốt (mình không đụng) — đây chỉ là source hygiene.
- **BÀI HỌC (bổ sung §0b pattern recovery):** recovery chỉ restore bản DEPLOYED (MSSQL3/DesktopModules/golden), **KHÔNG restore `src/styles/*.css`** → src/styles còn nhiều bản April-21. ⚠️ TRƯỚC khi `build-entry.cjs <builder|dashboard|submissions>`, PHẢI check `src/styles/*.css` còn bản `Apr 21 21:37` không (CSS_MAP sync src→Assets→platforms sẽ đẩy bản stale). Bản tốt: `DesktopModules/MegaForm/Assets/css/` hoặc golden `Oqtane_new`.

## ⚠️ 0) CÁCH REVIEW (đọc trước)
- Tất cả thay đổi **đã deploy LIVE** lên MSSQL3 nhưng **vẫn ở cache `?v=20260615-B171`** (CHƯA bump). Bump cần rebuild `loader`+`Client` + **restart server** → đã hoãn theo yêu cầu.
- ⇒ Để thấy thay đổi: **Ctrl+F5 (hard refresh)** hoặc cửa sổ **ẩn danh/incognito**. F5 thường trên browser ấm sẽ giữ JS/CSS cũ ở cùng `?v=B171`.
- Site đang chạy (200). Không có thay đổi C#/DLL nào trong phiên này → **không cần restart để review** (chỉ JS/CSS tĩnh).

---

## 1) ĐÃ XONG + QA LIVE (4/6 P0) — KHÔNG redo

### P0-5 — Fix calendar popup "quá rộng" (regression April-revert) ✅
- **Nguyên nhân:** `Assets/css/megaform.css:2133` `.mf-cal-panel{position:absolute;left:0;right:0}` + `.mf-cal{width:100%}` → lịch giãn = full chiều rộng field (~700–900px).
- **Fix (scoped chỉ calendar):** `megaform.css:2139` → `.mf-cal-panel{right:auto;width:320px;min-width:320px}`. KHÔNG đụng `.mf-ms-panel`/`.mf-mccb-panel` (multiselect/multi-column nên rộng theo trigger).
- **QA:** popup = **320px** (field=902px) — `tmp-qa/scn-cal-width.cjs` + ảnh `tmp-qa/cal-width-after.png`. Lịch localize "Tháng 6 2026", hôm nay highlight, Today/Clear/Apply.

### P0-1 — Normalize alias composite (CRITICAL, audit xác nhận) ✅
- Alias `CompositePhone/CompositeName/CompositeAddress/Ssn/Dob/Time/EmailConfirm/PasswordConfirm` → canonical `{type:"Composite", widgetProps.preset}`.
- **2 đường được phủ:**
  1. **ops.ts dispatcher** (`ai-form-assistant`): thêm `COMPOSITE_ALIAS_PRESET`+`resolveCompositeAlias`+`normalizeCompositeField`; áp trong `opAddField`, `opReplaceFormSchema`, `opCreateForm` (→ app_batch). Phủ **builder studio onApply** (`builderApplySchema`→`replace_form_schema`) + legacy.
  2. **ai-form-creator.ts** (`dashboard`): thêm `normalizeCompositeFieldsDeep()` (đệ quy, phủ field lồng trong Row) áp ngay sau khi AI trả schema. Phủ **dashboard "Create with AI"** (path KHÔNG qua ops.ts).
- **QA:** unit-test logic all-PASS (CompositePhone/nested underscore/space → đúng; giữ preset cũ; Text không đụng). Marker có trong cả 2 bundle deploy (`compositepasswordconfirm`, `normalizeCompositeFieldsDeep`).

### P0-6 — AI prompt few-shot dạy tạo Composite ✅
- Thêm rule canonical (preset list + parts/nav/orient/address scheme + ví dụ) vào: `ai-form-creator.ts AI_SYSTEM_PROMPT` (**prompt ACTIVE**) + `chat.ts` (fallback).
- **QA:** studio "Create form with AI" mở & render đầy đủ (ảnh `tmp-qa/ai-studio-smoke.png`); teaching có trong `megaform-dashboard.js`.

### P0-4 — Builder: hiển thị bố cục composite thật + interaction mask (Umbraco-style) ✅
- Trước: composite trên canvas = box "Composite Widget" generic. Giờ: render **parts THẬT** (cells + sub-label + faux input, theo preset/parts).
- **Cách làm:** expose `window.MFCompositeParts = compositeEffectiveParts` (`field-plugins/_index.ts`); thêm `case 'Composite'` vào `canvas.ts renderFieldPreview` (resolve parts → cells width/flex); **mask = inline `pointer-events:none`** trên container → click xuyên xuống chọn field + mở Composite Designer (không focus sub-input). CSS `megaform-builder-ts.css`.
- **QA (Form 1, composite `email_confirm`):** ảnh `tmp-qa/composite-builder-final.png` — parts Email/Confirm hiện đúng; click → field `mf-selected` + `#mf-prop-composite-wrap` mở, preset=`email_confirm`; `pointer-events:none` xác nhận.

### BONUS — regression April-revert phát hiện + sửa
- **`vite.config.ts` (Apr-21 artifact) THIẾU entry `ai-form-assistant`** → bundle ops.ts/chat.ts không build được bằng `build-entry.cjs`. **Đã khôi phục entry.** (Nghi: 1 backup tháng-4 đã copy đè vite.config sau bản build Jun-15.)
- **Kiến trúc AI (quan trọng cho session sau):** AI chat trong builder GIỜ dùng chung studio **`MFDashboardAiFormCreator`** (`ai-form-creator.ts`, dashboard bundle) qua `openBuilderStudio()`. Bare chat bubble cũ + `sendMessage`/`systemPrompt` trong `chat.ts` là **DEAD-CODE** (esbuild tree-shake) → mảng rule inline trong chat.ts **KHÔNG vào bundle**. Prompt authoritative = `ai-form-creator.ts AI_SYSTEM_PROMPT` + **KB prompt_rule** (DB, fetch runtime qua `/api/AiTools/Knowledge?kind=prompt_rule`). ⇒ Sửa prompt builder = sửa `ai-form-creator.ts` hoặc seed KB, KHÔNG phải chat.ts.

---

## 2) CÒN LẠI (2/6 P0) — chưa làm, theo yêu cầu user

### P0-3 — Server-side validate/normalize composite per-part (giá trị CAO: bảo mật)
- **Vấn đề (audit xác nhận):** `FormValidationService.cs` chỉ validate chuỗi ĐÃ GỘP (required/minLength/maxLength/pattern); per-part (mask/matchKey/dateAge/numeric bounds) bỏ qua. Client có thể bypass.
- **Cần:** (a) client gửi kèm raw parts (hiện chỉ gửi combined) — sửa `renderer/inputs.ts`/`validation.ts` collect; (b) C# parse parts + validate theo canonical spec (mirror regex/mask từ `helpers.ts COMPOSITE_PRESETS`); (c) **rebuild Core DLL + restart Oqtane.Server live** (có backup `MSSQL3\_megaform_backup_20260615_b169`).
- ⚠️ Đây là item duy nhất đụng C#/DLL + restart server.

### P0-2 — Gộp composite preset về 1 nguồn + regex chuẩn (DRY, audit gốc P2)
- 3 nơi định nghĩa preset (`renderer/helpers.ts:285`, `builder/field-plugins/_index.ts:249`, `builder/composite-designer.ts`) → drift. Gộp về 1 file canonical, các nơi import.
- Rủi ro regression trên code vừa phục hồi; giá trị hiển thị thấp. Nên làm cẩn thận, có QA render đối chiếu.

---

## 2c) 🎯 NEXT SESSION — ƯU TIÊN: Builder UX cho Composite Widgets + drag-drop mượt
> Tầm nhìn user (2026-06-16): *"composite widget về bản chất là 1 control composite backend với JSON template và validation riêng cho từng JSON; xử lý drag-drop cụm row/column, composite với placeholder để drag-drop mượt mà."*

### A. Composite = backend control DATA-DRIVEN (JSON template + validation riêng từng JSON)
- **Hiện trạng:** composite KHÔNG phải "control" thực thụ — chỉ là `type:"Composite" + widgetProps.preset` lưu trong `MF_Forms.SchemaJson`; định nghĩa parts nằm rải **3 nơi TS** (`renderer/helpers.ts:285 COMPOSITE_PRESETS`, `builder/field-plugins/_index.ts:249 MF_COMPOSITE_PRESETS`, `builder/composite-designer.ts`); **không có validation schema tập trung**, **không validate server-side** (= P0-3).
- **Mục tiêu:** mỗi preset (phone/name/name_plus/address[+scheme us|intl|canada|uk]/ssn/dob/time/email_confirm/password_confirm) = **1 JSON template** (parts[] + layout + nav/orient) **KÈM validation JSON** (regex/mask/maxLength/min/max/matchKey/dateAge per part) — gom thành **1 "Composite Control Registry" canonical** (= P0-2), import bởi renderer/builder/designer + **mirror xuống C# server** (= P0-3).
- **Cho user THÊM template mới:** composite JSON template custom (field-group riêng) tự mang validation của nó → lưu tái dùng ở **tab Layout** (= P1-3 Save-as-Block + P1-1/P1-2 Field-Group tiles). ⇒ kiến trúc này HỢP NHẤT P0-2 + P0-3 + Field-Group, thay cho hardcode 3 nơi.
- File khởi điểm: `renderer/helpers.ts` (COMPOSITE_PRESETS + compositePartsFor), `renderer/validation.ts` (nhánh composite client), `Core/Services/FormValidationService.cs` + `SubmissionProcessor.cs` (server), `builder/composite-designer.ts` (editor), `builder/field-plugins/_index.ts` (tiles + resolver `MFCompositeParts`).

### B. Drag-drop UX mượt + placeholder
- **Hiện trạng:** builder dùng **SortableJS** (`canvas.ts`: `initMainSortable` / `initRowSortables` / `initFlexGridSortables` / `initPaletteDrag`; filter loại input/select; handle `.mf-drag-handle`). Composite kéo được như 1 unit (P0-4 mask `pointer-events:none`). DnD JS **vốn chạy** (workflow xác nhận 9→10 field). Nhưng kéo-thả **cụm row/column** + composite còn "khó", **thiếu drop placeholder/indicator** rõ ràng.
- **Mục tiêu:** (1) kéo cả **ROW** (di chuyển nguyên hàng) + reorder **COLUMN** mượt; (2) **placeholder/drop-indicator** khi kéo (đường chèn giữa block, ghost rõ) — học **Umbraco Block Grid**; (3) composite kéo mượt với placeholder (đã có mask, thêm visual feedback). Tham chiếu Umbraco Block List/Grid (§3 PLAN: mask + real preview + drag handle + drop indicators).
- File: `builder/canvas.ts` (Sortable config + ghost/placeholder), `styles/megaform-builder-ts.css` (drop-zone affordance — đã khôi phục sau fix regression `.mf-canvas-dropzone`/sortable-ghost).

### C. Cách khởi đầu (đề xuất)
1. Chạy 1 research/Plan workflow: map chính xác cơ chế row/column/composite drag hiện tại + điểm "rough"; thiết kế **Composite Control Registry** (JSON template + validation schema) + cách user thêm template; prototype drop-placeholder.
2. Implement theo thứ tự: P0-2 (gộp preset → registry) → P0-3 (server validate per-JSON) → drag-drop placeholder (row/column/composite) → P1-1/P1-2 Field-Group tiles trong Layout → P1-3 Save-as-Block.
3. QA từng bước (Visual QA builder + render + submit validation).

## 3) FILES TOUCHED (phiên này)
| File | Thay đổi |
|---|---|
| `Assets/css/megaform.css` | P0-5 `.mf-cal-panel` width (dòng ~2139) |
| `MegaForm.UI/src/ai-form-assistant/ops.ts` | P0-1 alias map + normalizeCompositeField + 3 op handlers |
| `MegaForm.UI/src/ai-form-assistant/chat.ts` | P0-6 composite rule (fallback/dead-code) |
| `MegaForm.UI/src/dashboard/ai-form-creator.ts` | P0-1 normalizeCompositeFieldsDeep + P0-6 teaching |
| `MegaForm.UI/vite.config.ts` | khôi phục entry `ai-form-assistant` |
| `MegaForm.UI/src/builder/field-plugins/_index.ts` | expose `MFCompositeParts` |
| `MegaForm.UI/src/builder/canvas.ts` | P0-4 `case 'Composite'` preview + mask |
| `MegaForm.UI/src/styles/megaform-builder-ts.css` | P0-4 composite CSS **+ REGRESSION FIX**: restore bản tốt 3459L + composite (xem §0a) |
| `src/styles` + `Assets/css`: `megaform-builder-shell.css`, `megaform-admin-shell.css`, `megaform-submissions-ts.css` | source hygiene — restore bản tốt từ DesktopModules (chống tái phát stale April-21) |
| Docs | `PLAN_20260616_...md`, `AUDIT_...md` (verify), handoff này |

### Bundles + CSS rebuilt + deployed MSSQL3 (đều ?v=B171, CHƯA bump)
- JS: `megaform-ai-form-assistant.js`, `megaform-dashboard.js`, `js/bundles/megaform-builder.js`.
- CSS: `css/megaform.css` (calendar), `css/megaform-builder-ts.css` (**bản tốt 3493L = 3459 good + composite + fix regression**).
- shell.css / admin-shell.css / submissions-ts.css trên MSSQL3 VỐN tốt (không deploy đè) — chỉ dọn src/Assets.
- (sync oqtane/web/dnn qua plugin cho phần JS).

### QA scenarios (tmp-qa/)
P0: `scn-cal-width.cjs`, `scn-ai-studio-smoke.cjs`, `scn-composite-builder.cjs`, `scn-comp-final.cjs`. Regression: `scn-builder-css-fixed.cjs`, `builder-regression-diag.cjs`.
Ảnh: `cal-width-after.png`, `ai-studio-smoke.png`, `composite-builder-final.png`, **`builder-css-fixed.png` (builder khôi phục)**.

## 4) Khi tiếp tục (deploy quick-ref)
- JS/CSS tĩnh: `cd MegaForm.UI && node scripts/build-entry.cjs <ai-form-assistant|dashboard|builder>` → copy `Assets/{js,css}` → `MSSQL3\wwwroot\Modules\MegaForm\{js,css}` (builder → `js/bundles/`). Không restart.
- **Bump cache 1 lần** (sau khi deploy hết): cần rebuild `builder-loader`+`Client` + restart — làm CUỐI để F5 thường thấy thay đổi.
- P0-3 C#: `dotnet build MegaForm.Oqtane.Client` (+Core) → stop `Oqtane.Server` → copy DLL → start → curl `/` 200.

---

## 4-UPDATE) §2c PHASE 1 — Drag UX "block placeholder" mode ✅ DONE live (phiên 2, 2026-06-16)
> Yêu cầu user: *"khi drag, các builder vendor khác biến tất cả form thành khối placeholder, không render chi tiết control nên rất mượt."* → đã làm đúng vậy.

### Đã làm
1. **🐞 FIX BUG `colEl` (April-revert)** — `canvas.ts initMainSortable.onStart` tham chiếu `colEl` (chỉ khai báo trong `initRowSortables`) → **ReferenceError mỗi lần bắt đầu kéo field/row top-level** → reorder cấp cao nhất hỏng (phiên trước test palette-drop nên lọt). Sửa: dùng `container.querySelectorAll('.mf-row-col')` highlight tất cả cột làm drop-target. **QA proven: `orderChanged=true`, 0 PAGEERROR.**
2. **"Block placeholder mode"** — thêm `setBuilderDragging(active)` (`canvas.ts`) toggle `body.mf-builder-dragging` + `#mf-canvas-dropzone`; gọi trong onStart/onEnd/onUnchoose của **main + row sortable** + **palette** (qua `setPaletteDragging`/`finishPaletteDragging`). **FlexGrid KHÔNG áp** (kéo theo toạ độ, collapse sẽ phá lưới).
3. **Nhãn-khối thống nhất `.mf-field-block-chip`** (icon+label) chèn vào MỌI field card (render top-level + row-field) — ẩn mặc định, hiện khi drag. Cần thiết cho widget-plugin (preview của chúng KHÔNG có label line riêng).
4. **CSS block-mode** (additive, `megaform-builder-ts.css`, +74 dòng): `body.mf-builder-dragging #mf-canvas-dropzone .mf-canvas-field > *:not(.mf-field-block-chip):not(.mf-drag-handle){display:none}` + slim block chrome + **insertion indicator** (ghost `.mf-sortable-ghost` → bar indigo dashed "drop here"). Pure CSS keyed on body class → **0 re-render** → mượt.

### QA (tmp-qa/scn-dragux-blockmode.cjs, form 4 trên :5070)
- block-mode: `chipDisplay=flex`, `bodyDisplay=none`, card cao **36px**, chip text = label đúng.
- real-drag: `midDrag bodyHasClass=true`, `ghostCount=1`, `afterDrag=false` (clear sạch), **`orderChanged=true`** (reorder chạy), 0 JS error (22 "errors" đều là 404 static asset có sẵn).
- Ảnh: `dragux-1-normal.png`, **`dragux-2-blockmode.png`** (mọi field thành khối), **`dragux-3-realdrag.png`** (kéo thật + insertion bar), `dragux-4-after.png` (khôi phục).

### Files touched (phiên 2)
| File | Thay đổi |
|---|---|
| `MegaForm.UI/src/builder/canvas.ts` | fix `colEl`; +`setBuilderDragging`; wire main/row/palette onStart/onEnd/onUnchoose; +`.mf-field-block-chip` ở render top-level + row-field |
| `MegaForm.UI/src/styles/megaform-builder-ts.css` | +74 dòng block-mode + insertion indicator (additive, cuối phần drag) |

### ⚠️ FACT về CSS golden (sửa số liệu handoff gốc)
- Số "3493L" ở §0a là **không chính xác**. **Golden thật = 3344 dòng, md5 `2B19D8D6`** (đồng bộ ở DesktopModules + Assets + MSSQL3 wwwroot + Web + Oqtane-source). `megaform-builder-shell.css` golden = **3190L md5 `C5103D42`**. src/styles ĐÃ == golden trước phiên này (KHÔNG stale) → diff golden↔src chỉ +74 dòng của tôi, 0 dòng mất. Bản April-21 xấu (1209L) chỉ còn trong `tmp-qa/_*backup*`.

### Deploy (đã làm) + review
- `build-entry.cjs builder` (compile canvas.ts → `Assets/js/bundles/megaform-builder.js` + sync CSS src→Assets→platforms). Copy tay `megaform-builder.js` + `megaform-builder-ts.css` → `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\{js\bundles,css}`. **Served 5070 verified** (block-chip=True, builder-dragging=True). Vẫn `?v=B171` (CHƯA bump) → review **Ctrl+F5/incognito**. Không đụng C#/DLL → không restart.

### NEXT (Phase 2/3 còn lại — xem §2c)
P0-2 Composite Registry (gộp 3 nơi preset → 1 nguồn) → P0-3 server validate per-part (client gửi `__mf_parts` + C# `case "Composite"`, **đụng DLL+restart**) → P1 Field-Group tiles + Save-as-Block.
Tuỳ chọn UX tiếp: kéo reorder COLUMN (hiện chỉ đổi qua layout-picker buttons).
