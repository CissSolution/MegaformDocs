# PLAN — Hợp nhất loại form + AI sinh full-width, bỏ "standard repo" (2026-06-24)

**Mục tiêu (theo chỉ đạo user):** Bỏ nhánh **"standard" form cũ**, **giao cho AI sinh** form mặc định là **custom-shell full-width** (loại có nút Submit full-width), chỉ **giữ Premium + loại full-width**. KHÔNG duy trì nhánh standard nữa.

**Trạng thái:** CHỈ LÀ KẾ HOẠCH — **phiên sau thực hiện**. Tài liệu này dựa trên điều tra code (8-agent workflow + preset agent), mọi claim có file:line.

> ⚠️ Đọc trước khi code: có **2 quyết định kiến trúc lớn** (§6) phải chốt — đặc biệt **Builder drag-drop hiện sinh ra STANDARD**, nên "bỏ standard" KHÔNG thể chỉ xóa code render; phải xử lý Builder + legacy forms trong DB.

---

## 1. Bảng đối chiếu các LOẠI FORM

| Tiêu chí | **STANDARD** | **PURE-GRID PREMIUM** (custom-shell) | **CUSTOM-HTML khác** | **PREMIUM** (folder) |
|---|---|---|---|---|
| `settings.customHtml` | ❌ không | ✅ `.mfp.mfp-pure-grid` | ✅ winter `.mfp` / sticky / GoogleMap `.mf-contact-split` | ✅ custom-shell |
| Nhánh render | `renderStandardFields` + `buildSkeleton` | `renderCustomHtml` (`container.innerHTML`) | `renderCustomHtml` | `renderCustomHtml` |
| DOM | `.mf-form-inner>.mf-form>.mf-fields-container>.mf-field-group` | shell `.mfp` chứa token `{{field:key}}` → `.mf-field-group` trong `.mfp` | tùy shell | custom-shell |
| **Nút Submit** | `.mf-btn-submit` **compact** (`--mf-btn-width:auto`) canh mép trong `.mf-form-actions` | `.mfp-submit` **full-width** (`width:100%` trong customCss template) | `.mfp-submit-btn` / `.mf-btn-submit` | full-width |
| Namespace CSS | `--mf-*` (megaform.css tiêu thụ 189 chỗ) | `--mfp-*` (customCss riêng) + bridge | `--mfp-*` / hex hard-code | `--mfp-*` |
| **Preset builder áp dụng?** | ✅ **ĐẦY ĐỦ** (preset viết `--mf-*`) | ⚠️ **MỘT PHẦN** (bridge `--mf-*`→`--mfp-*`); **inert** ở hex hard-code | ⚠️ partial / inert | ⚠️ partial / inert |
| SSR (first-paint)? | ✅ có (IsSsrEligible) | ❌ không (customHtml → false) → rủi ro flicker | ❌ | ❌ |
| Ai sinh ra? | **AI mặc định** + **Builder drag-drop** | 125/130 template "default"; AI khi user yêu cầu premium | vài template lẻ | thủ công |

### Nguồn (file:line)
- Render split theo `settings.customHtml`: [renderer/index.ts:1407-1413](../MegaForm.UI/src/renderer/index.ts#L1407-L1413); [FormHtmlRenderer.cs:115-128](../MegaForm.Core/Services/FormHtmlRenderer.cs#L115-L128).
- Standard shell + nút: [index.ts buildSkeleton:181-208](../MegaForm.UI/src/renderer/index.ts#L181-L208) (`.mf-form-actions` + `.mf-btn-submit`).
- Nút compact: `megaform.css:98` `--mf-btn-width: auto`, `megaform.css:1802` `.mf-btn-submit{width:var(--mf-btn-width)}`, `megaform.css:1780-1789` `.mf-form-actions{display:flex;justify-content:space-between}`, full-width chỉ `@media(max-width:600px)` `megaform.css:1894-1895`.
- Nút full-width custom-shell: template customCss `.mfp-submit{width:100%}`; renderer inject verbatim [index.ts:1826](../MegaForm.UI/src/renderer/index.ts#L1826); `customHtmlHasOwnSubmit` [index.ts:1830-1835](../MegaForm.UI/src/renderer/index.ts#L1830-L1835), ẩn `.mf-btn-submit` khi có submit riêng [index.ts:2154].
- **130/130 template "DefaultTemplates - Deployed" (non-premium) ĐỀU custom-shell**, 128 theme `pure-grid-premium` — KHÔNG có cái nào standard. `contact-us-standard.json` (dù tên "standard") cũng pure-grid custom-shell. 4 họ shell: pure-grid (125), winter-row-based (1), sticky-notes (1), GoogleMapContact `.mf-contact-split` (3).

---

## 2. Loại nào ĐANG ĐƯỢC SINH RA (current usage)

| Producer | Sinh ra loại | Nút | Bằng chứng |
|---|---|---|---|
| **AI "Create with AI" (default)** | **STANDARD** (fields-only) | compact | [ai-form-creator.ts:109](../MegaForm.UI/src/dashboard/ai-form-creator.ts#L109) "DEFAULT MODE — standard… DO NOT emit customHtml" |
| AI khi user yêu cầu premium/Jotform/hero/2-col | custom-shell | full-width | [ai-form-creator.ts:111-136](../MegaForm.UI/src/dashboard/ai-form-creator.ts#L111-L136) |
| **Builder drag-drop** | **STANDARD** (kéo field → `schema.fields`, không sinh customHtml) | compact | render-split: standard = không customHtml ⚠️ *cần xác nhận lúc thực hiện* |
| Template library (default) | pure-grid custom-shell | full-width | template-families: 130/130 custom-shell |

➡️ **Nghịch lý cốt lõi:** AI **mặc định** + Builder **mặc định** đang ra **STANDARD (compact)**, trong khi user muốn giữ **full-width**. Vậy "bỏ standard" = **đổi default của AI + Builder sang custom-shell**, KHÔNG phải xóa template.

---

## 3. Preset CSS builder áp lên loại nào (chi tiết)

- Preset (16 màu) **chỉ viết namespace `--mf-*`** + `settings.theme` + `themeCssOverrides`. Nguồn: [settings-popup.ts:64-112](../MegaForm.UI/src/view-designer/settings-popup.ts#L64-L112) (cmt dòng 98: "Map preset → full `--mf-*` palette"), [theme-tab-adapter.ts:108-121,425-456](../MegaForm.UI/src/builder/theme-tab-adapter.ts#L108-L121). Display-style preset = class `mf-style-*` [index.ts:267-289](../MegaForm.UI/src/renderer/index.ts#L267-L289).
- **STANDARD: preset ĂN ĐẦY ĐỦ** — `.mf-input/.mf-form-inner/...` đọc `var(--mf-*)` (megaform.css:880-899, 189 consumer).
- **CUSTOM-SHELL: preset ĂN MỘT PHẦN qua bridge** `--mf-*`→`--mfp-*` ([CustomShellCompatibilityCssService.cs:55-65](../MegaForm.Core/Services/CustomShellCompatibilityCssService.cs#L55-L65), [renderer/index.ts:335,489-501,566+](../MegaForm.UI/src/renderer/index.ts#L335), [ThemePresetInlineCssService.cs:121-216](../MegaForm.Core/Services/ThemePresetInlineCssService.cs#L121-L216)). Bridge đặt `--mfp-*:var(--mf-*)` TRỰC TIẾP trên `.mfp` (thắng `:root` của template). NHƯNG **inert ở mọi màu hex hard-code** (hero/gradient/border trang trí). Worst case: euro-youth hard-code gần hết → preset gần như vô hiệu.
- **KHÔNG có guard** chặn/cảnh báo preset trên custom-HTML.
- Tài liệu liên quan: `Docs/ANALYSIS_Premium_Preset_CSS_Limitation.md`.

➡️ **Hệ quả cho kế hoạch:** nếu chỉ giữ custom-shell, **preset sẽ chỉ ăn một phần** trừ khi template **bỏ hard-code hex**, dùng `var(--mf-*)`/`var(--mfp-*)`. Pure-grid template cần **de-hardcode** để preset ăn đầy đủ (xem §5.D).

---

## 4. Ba vấn đề user nêu — root cause (đã xác minh)

### 4.1 Cấu trúc khác nhau (Q1)
`settings.customHtml` quyết định nhánh render. Default templates = custom-shell; AI/Builder default = standard → 2 cấu trúc + 2 kiểu nút.

### 4.2 Nút compact vs full-width (Q2)
**Hai nút khác nhau, 2 nguồn CSS khác nhau** (không phải 1 nút style 2 kiểu): standard `.mf-btn-submit` `width:auto` (megaform.css) vs custom-shell `.mfp-submit` `width:100%` (template customCss).

### 4.3 AI chèn control bị văng ra ngoài card (Q3) — **gốc là BUILDER, KHÔNG phải renderer**
- Renderer chỉ thay token IN-PLACE; chỉ append thêm field `Hidden` ([index.ts:1791-1796](../MegaForm.UI/src/renderer/index.ts#L1791-L1796), [FormHtmlRenderer.cs:166-176](../MegaForm.Core/Services/FormHtmlRenderer.cs#L166-L176)). Nó KHÔNG tạo field thừa.
- **Thủ phạm: [html-sync.ts insertBeforeActions:201-214](../MegaForm.UI/src/builder/html-sync.ts#L201-L214)** (gọi từ `syncSchemaToHtmlImmediate:340-359`). Khi auto-chèn token cho field thiếu, chỉ nhận **3 anchor** (`.mfp-actions`, `.mfp-actions mf-custom-actions`, đúng `<button type="submit">{{form:submit}}</button>`). Template `.mfp` có actions riêng (vd euro-youth `.ey-actions/.ey-submit`) **không khớp** → fallback chèn trước `</div>` **CUỐI CÙNG** (dòng 211) → token rơi **NGOÀI `.mfp`** nhưng trong fields-container = form 803 `geoInsideMfp=false`.
- AI `add_field` ([ops.ts:548-567](../MegaForm.UI/src/ai-form-assistant/ops.ts#L548-L567)): nếu form có customHtml → **refuse** (PRESERVE-001) trừ khi `forceAddDespiteCustomHtml`, lúc đó field **không token → vô hình**. `opReplaceFormSchema` PRESERVE-SYNC ([ops.ts:1212-1233](../MegaForm.UI/src/ai-form-assistant/ops.ts#L1212-L1233)) cũng dùng tail-append (cùng điểm yếu).
- **⚠️ ĐÍNH CHÍNH (workflow verify, `refuted:true`):**
  - **Hình học vị trí tùy template:** token chèn **trước `</div>` CUỐI CÙNG**. Nếu `</div>` cuối = đóng `.mfp` root (vd euro-youth, không có markup sau) → field thành **con cuối CỦA `.mfp`** (trong `.mfp` nhưng NGOÀI inner card `.ey-card/.ey-shell`). Nếu có markup SAU khi đóng `.mfp` HOẶC `</div>` cuối là container ngoài (vd pure-grid/form 803) → field **NGOÀI hẳn `.mfp`** (sibling trong fields-container — đúng đo browser `geoInsideMfp=false`). **Cả hai trường hợp đều ngoài card nhìn thấy.**
  - **`repairCustomHtmlPlaceholders` ([ai-form-creator.ts:1812-1817](../MegaForm.UI/src/dashboard/ai-form-creator.ts#L1812-L1817)) CÓ CÙNG bug:** chèn trước `{{form:submit}}`, nhưng khi THIẾU token đó → fallback `lastIndexOf('</div>')` → AI full-gen cũng có thể văng (KHÔNG chỉ builder). → **fix CẢ html-sync.ts LẪN repairCustomHtmlPlaceholders.**
  - **Chỉ field Hidden** mới được renderer append thành sibling `.mfp` (vô hại). Field nhìn thấy bị văng đều do **builder/AI store-time tail-append**.

---

## 5. KẾ HOẠCH SỬA — chi tiết đến từng dòng

> Thứ tự đề xuất: **A→B→C→D→E**. Mỗi bước build + deploy + browser-verify (theo flow B263/B264/B265: sửa Assets → sync 3 repo copy → copy tay live `E:\DNN_SITES\...\wwwroot\Modules\MegaForm` → bump AssetVersion → rebuild Shared Release net10.0 → restart `Oqtane.Server.exe`).

### A. Lật AI default sang custom-shell full-width *(JS-only, MegaForm.UI)*
- File [ai-form-creator.ts:109,111-136](../MegaForm.UI/src/dashboard/ai-form-creator.ts#L109-L136): đổi DEFAULT MODE từ "standard, DO NOT emit customHtml" → **mặc định sinh custom-shell pure-grid** (set `settings.theme="pure-grid-premium"` hoặc `"custom"` + `settings.customHtml` = pure-grid shell + `{{field:KEY}}` cho MỌI field). Giữ `repairCustomHtmlPlaceholders` (1788-1822) để chắc chắn đủ token.
- Cân nhắc: cung cấp cho AI một **pure-grid shell skeleton** chuẩn (template từ `megaform-pure-grid-template.json`) để AI điền field, thay vì standard layout.
- Build `node scripts/build-entry.cjs dashboard` (megaform-dashboard.js) → copy live.
- ⚠️ Test: AI tạo form mới → phải ra `.mfp-submit` full-width + mọi field trong `.mfp`.

### B. Fix văng-ra-ngoài (ejection) *(JS-only)* — **option 1: scope chèn vào card body**
**Phải sửa 3 CHỖ dùng chung pattern tail-append (tất cả fallback về `lastIndexOf('</div>')`):**
1. [html-sync.ts insertBeforeActions:201-214](../MegaForm.UI/src/builder/html-sync.ts#L201-L214) (builder auto-inject).
2. [repairCustomHtmlPlaceholders ai-form-creator.ts:1812-1817](../MegaForm.UI/src/dashboard/ai-form-creator.ts#L1812-L1817) (AI full-gen — else branch khi thiếu `{{form:submit}}`).
3. [opReplaceFormSchema PRESERVE-SYNC ops.ts:1212-1233](../MegaForm.UI/src/ai-form-assistant/ops.ts#L1212-L1233) (cùng điểm yếu).

**Sửa:** thay fallback "chèn trước `</div>` cuối document" bằng "chèn trước `</div>` cuối **CÒN TRONG shell body**" — định vị shell root rồi tìm boundary đóng:
- pure-grid: trước close của `.mfp-card`/`.mfp-card-body`/`.mfp-form-inner`.
- euro-youth: trước close của `.ey-card`/`.ey-panel` (KHÔNG phải `.mfp` root — để field vào trong inner card).
- **GoogleMapContact** (`.mf-contact-split`, KHÔNG có `.mfp`): tổng quát hóa = chèn trước close của shell root element (form/`.mf-contact-split`), không phải `</div>` cuối tuyệt đối.
- Tốt nhất: viết 1 helper `insertIntoCardBody(html, tag)` dùng chung cho cả 3 chỗ (nhận danh sách boundary class theo thứ tự ưu tiên, fallback cuối mới là `</div>` tuyệt đối + warn).
- Build `node scripts/build-entry.cjs builder` + `dashboard` → copy `bundles/megaform-builder.js` + `megaform-dashboard.js` live.
- ⚠️ Xác nhận form 803: đo `geoInsideMfp=false` (ngoài `.mfp`) — template pure-grid có markup sau `.mfp` close hoặc `</div>` cuối là container ngoài.
- (Tùy chọn belt-and-suspenders render-side: [index.ts ~1791](../MegaForm.UI/src/renderer/index.ts#L1791) relocate `.mf-field-group` lạc-chỗ vào `.mfp` card — để dành.)
- `add_field` ([ops.ts:548-567](../MegaForm.UI/src/ai-form-assistant/ops.ts#L548-L567)) khi `forceAddDespiteCustomHtml` → dùng helper trên chèn token vào card body thay vì để vô hình.

### C. Xử lý nhánh STANDARD (quyết định lớn — xem §6)
- Nếu **giữ standard cho Builder/legacy**: KHÔNG xóa `renderStandardFields`/`buildSkeleton`; chỉ ngừng để AI sinh standard (bước A).
- Nếu **bỏ hẳn standard**: phải (1) đổi Builder drag-drop sinh custom-shell (auto-wrap field kéo-thả vào pure-grid shell), (2) **migration legacy forms** trong DB (form standard cũ → custom-shell hoặc giữ render path đọc-only). Rủi ro cao — xem §6.

### D. De-hardcode pure-grid template để preset ăn đầy đủ *(JSON/CSS template)*
- Sửa `megaform-pure-grid-template.json` customCss: đổi hex hard-code (`--mfp-primary:#009246`, gradient, border) → `var(--mf-*, fallback)` để preset builder điều khiển được. (Bridge hiện thắng `:root` nhưng chỉ ở var-consumer; hex literal vẫn inert.)
- Áp cho shell AI dùng ở bước A (đồng bộ).

### E. (Tùy chọn) Hợp nhất nút — nếu vẫn còn standard
- Nếu muốn standard cũng full-width: đổi `megaform.css:98` `--mf-btn-width: auto` → `100%` (ảnh hưởng MỌI standard form) — chỉ làm nếu giữ standard và muốn đồng bộ full-width.

---

## 6. ⚠️ QUYẾT ĐỊNH KIẾN TRÚC CẦN CHỐT (trước khi code)

1. **Builder drag-drop sinh ra gì?** (cần xác nhận đầu phiên sau) — hiện suy luận = STANDARD (không customHtml). Nếu đúng:
   - **Bỏ hẳn standard** ⇒ phải viết lại Builder để auto-wrap field-kéo-thả vào pure-grid shell + sync token (lớn). HOẶC
   - **Giữ standard cho Builder** ⇒ chỉ lật AI default (bước A) + fix ejection (B); standard vẫn tồn tại cho Builder/legacy. ⭐ **Khuyến nghị: phương án này** (ít rủi ro, đạt mục tiêu "AI ra full-width").
2. **Legacy standard forms trong DB** (form đã tạo kiểu standard): xóa standard render path sẽ vỡ chúng. Cần migration hoặc giữ path đọc-only.
3. **SSR/flicker:** custom-shell KHÔNG SSR (IsSsrEligible=false) → toàn-custom-shell = phơi nhiễm flicker nhiều hơn (xem B263). Cân nhắc port hydrate custom-HTML (đang dang dở).

---

## 7. LƯU Ý (notes)
- megaform.css là **hand-edited** (chỉ block BEGIN/END ~2909 là gen) — sửa trực tiếp Assets, KHÔNG chạy gen-display-style-css.cjs.
- **Live :5070 phục vụ bản copy riêng** `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\css|js` — BuildTS KHÔNG sync tới đó, phải **copy tay**.
- Bump AssetVersion (Shared.dll Release net10.0) + restart để cache-bust.
- AI có 2 mặt: full-gen (auto-sync token OK) vs incremental `add_field` (lệch) — fix cả hai.
- Preset chỉ `--mf-*`; muốn ăn trên custom-shell phải qua bridge + template không hard-code hex.
- 130/130 "default templates" đã là custom-shell → **không cần** sinh lại; "repo standard" cần bỏ = **nhánh render standard + AI/Builder default**.

## 8. HANDOFF/DOCS LIÊN QUAN
- `Docs/ANALYSIS_Premium_Preset_CSS_Limitation.md` — giới hạn preset trên premium (hard-code hex).
- `CLAUDE_HANDOFF_20260624_CSS_SINGLE_SOURCE_REFACTOR.md` + `Docs/AUDIT_CSS_SINGLE_SOURCE_*` — single-source CSS, custom-shell render.
- Memory: `project_form788_flicker_fix_b263` (custom-shell không SSR → flicker), `project_standard_form_card_border_b264` (DoubleCardFix), `project_theme_layout_in_settings_modal` (16 preset, card chrome bị strip khi themed).
- `Docs/AI_FORM_DESIGN_ARCHITECTURE.md`, `Docs/AI_PREMIUM_CONVERT_PROMPT.md` — kiến trúc AI form.

## 9. THỨ TỰ THỰC HIỆN ĐỀ XUẤT (phiên sau)
1. **Xác nhận §6.1** (Builder drag-drop sinh gì) — quyết định bỏ-hẳn vs giữ-standard.
2. **Bước B** (fix ejection — độc lập, giá trị ngay, rủi ro thấp).
3. **Bước A** (lật AI default → full-width) + **D** (de-hardcode pure-grid để preset ăn).
4. **Bước C** theo quyết định §6 (giữ standard cho builder/legacy = khuyến nghị).
5. Re-audit + browser QA (AI tạo form → full-width, preset đổi màu, field không văng).
